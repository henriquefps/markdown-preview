package main

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"
)

// maxBodyBytes matches express.json({ limit: '25mb' }): pasted base64 images
// can make notes large.
const maxBodyBytes = 25 << 20

// Config holds the runtime settings resolved from flags and environment.
type Config struct {
	Port           string
	DataDir        string
	APIKey         string
	AllowedOrigins []string // empty means any origin
}

// Server is the HTTP layer around a Store.
type Server struct {
	store   *Store
	apiKey  string
	origins map[string]bool // nil means any origin
	log     *slog.Logger
	now     func() time.Time
}

// NewServer builds the HTTP server state.
func NewServer(cfg Config, store *Store, logger *slog.Logger) *Server {
	s := &Server{store: store, apiKey: cfg.APIKey, log: logger, now: time.Now}
	if len(cfg.AllowedOrigins) > 0 {
		s.origins = map[string]bool{}
		for _, o := range cfg.AllowedOrigins {
			s.origins[o] = true
		}
	}
	return s
}

// Handler returns the full HTTP handler: CORS first (so even error responses
// are readable by the browser), then access control, then the routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("POST /api/sync", s.requireAPIKey(s.handleSync))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found."})
	})
	return s.cors(s.restrictWithoutKey(mux))
}

// --- CORS ------------------------------------------------------------------
// Defaults match the cors() middleware the Node server used: any origin,
// common methods, and preflights echo the requested headers (which is how
// the Authorization header gets allowed).

const corsMethods = "GET,HEAD,PUT,PATCH,POST,DELETE"

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := false
		h := w.Header()
		if s.origins == nil {
			h.Set("Access-Control-Allow-Origin", "*")
			allowed = true
		} else {
			h.Add("Vary", "Origin")
			if origin != "" && s.origins[origin] {
				h.Set("Access-Control-Allow-Origin", origin)
				allowed = true
			}
		}

		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			if allowed {
				h.Set("Access-Control-Allow-Methods", corsMethods)
				if req := r.Header.Get("Access-Control-Request-Headers"); req != "" {
					h.Add("Vary", "Access-Control-Request-Headers")
					h.Set("Access-Control-Allow-Headers", req)
				}
				// Chrome asks this when a public HTTPS page calls a LAN address.
				if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
					h.Set("Access-Control-Allow-Private-Network", "true")
				}
				h.Set("Access-Control-Max-Age", "600")
			}
			h.Set("Content-Length", "0")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// --- Access control -----------------------------------------------------

// proxyHeaders are set by Cloudflare Tunnel and by reverse proxies. Their
// presence means the request did not come straight from the local network,
// even if the TCP peer (the tunnel connector) is on it.
var proxyHeaders = []string{"Cf-Connecting-Ip", "X-Forwarded-For", "X-Real-Ip", "Forwarded"}

var cgnat = netip.MustParsePrefix("100.64.0.0/10") // Tailscale and other CGNAT ranges

// isLocalAddr reports whether a remote address is loopback, private (RFC 1918
// or IPv6 ULA, which includes Tailscale's IPv6 range), link-local or CGNAT.
func isLocalAddr(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	if i := strings.IndexByte(host, '%'); i >= 0 { // fe80::1%en0
		host = host[:i]
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	ip = ip.Unmap()
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || cgnat.Contains(ip)
}

func viaProxy(r *http.Request) bool {
	for _, h := range proxyHeaders {
		if r.Header.Get(h) != "" {
			return true
		}
	}
	return false
}

// restrictWithoutKey is the secure default: with no API key configured, only
// requests that come directly from the local network are served. Anything
// arriving through a tunnel or proxy is refused, so exposing a keyless server
// to the internet by mistake does not expose the notes.
func (s *Server) restrictWithoutKey(next http.Handler) http.Handler {
	if s.apiKey != "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLocalAddr(r.RemoteAddr) || viaProxy(r) {
			s.log.Warn("refused request: no API key configured and request is not from the local network",
				"remote", r.RemoteAddr, "path", r.URL.Path, "proxied", viaProxy(r))
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "This sync server has no API key configured, so it only accepts requests from the local network. " +
					"Set SYNC_API_KEY on the server (and the same key in the app) to use it through a tunnel, proxy or the internet.",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireAPIKey(next http.HandlerFunc) http.HandlerFunc {
	if s.apiKey == "" {
		return next
	}
	expected := sha256.Sum256([]byte(s.apiKey))
	return func(w http.ResponseWriter, r *http.Request) {
		provided, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok {
			provided = ""
		}
		// Hashing first makes the comparison constant-time regardless of the
		// provided key's length.
		got := sha256.Sum256([]byte(provided))
		if provided == "" || subtle.ConstantTimeCompare(got[:], expected[:]) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Missing or invalid API key."})
			return
		}
		next(w, r)
	}
}

// --- Routes ----------------------------------------------------------------

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"noteCount":  s.store.Count(),
		"serverTime": s.now().UnixMilli(),
	})
}

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	var body struct {
		Notes json.RawMessage `json:"notes"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&body); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Request body too large."})
			return
		}
		badRequest(w)
		return
	}
	var incoming []json.RawMessage
	if t := bytes.TrimSpace(body.Notes); len(t) == 0 || t[0] != '[' || json.Unmarshal(t, &incoming) != nil {
		badRequest(w)
		return
	}

	applied, all, err := s.store.Merge(incoming)
	if err != nil {
		s.log.Error("failed to save notes", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save notes on the server."})
		return
	}
	s.log.Info("sync", "received", len(incoming), "applied", applied, "total", len(all))
	writeJSON(w, http.StatusOK, map[string]any{"notes": all})
}

func badRequest(w http.ResponseWriter) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Expected { notes: Note[] } in request body."})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		http.Error(w, `{"error":"encoding failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	w.Write(bytes.TrimRight(buf.Bytes(), "\n"))
}
