package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestHandler(t *testing.T, cfg Config) http.Handler {
	t.Helper()
	cfg.DataDir = t.TempDir()
	store := NewStore(cfg.DataDir, quietLogger())
	if err := store.Load(); err != nil {
		t.Fatal(err)
	}
	srv := NewServer(cfg, store, quietLogger())
	srv.now = func() time.Time { return time.UnixMilli(1762500000000) }
	return srv.Handler()
}

type reqOpt func(*http.Request)

func from(addr string) reqOpt { return func(r *http.Request) { r.RemoteAddr = addr } }
func header(k, v string) reqOpt {
	return func(r *http.Request) { r.Header.Set(k, v) }
}

func do(h http.Handler, method, path, body string, opts ...reqOpt) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:50000"
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	for _, o := range opts {
		o(r)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

const oneNote = `{"notes":[{"id":"a","title":"t","content":"c","updatedAt":1}]}`

func TestSyncEndpoint(t *testing.T) {
	h := newTestHandler(t, Config{})
	w := do(h, "POST", "/api/sync", oneNote)
	if w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp struct{ Notes []Note }
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Notes) != 1 || resp.Notes[0].ID != "a" {
		t.Fatalf("response %s", w.Body)
	}
	if !strings.Contains(w.Body.String(), `"deleted":false`) {
		t.Fatalf("deleted must always be present like in Node: %s", w.Body)
	}

	w = do(h, "GET", "/api/health", "")
	if w.Code != 200 || w.Body.String() != `{"noteCount":1,"ok":true,"serverTime":1762500000000}` {
		t.Fatalf("health: %d %s", w.Code, w.Body)
	}
}

func TestSyncBadBody(t *testing.T) {
	h := newTestHandler(t, Config{})
	for _, body := range []string{``, `nope`, `[]`, `{}`, `{"notes":null}`, `{"notes":{}}`, `{"notes":"x"}`} {
		w := do(h, "POST", "/api/sync", body)
		if w.Code != 400 || !strings.Contains(w.Body.String(), "Expected { notes: Note[] }") {
			t.Errorf("body %q: got %d %s", body, w.Code, w.Body)
		}
	}
}

func TestSyncBodyLimit(t *testing.T) {
	h := newTestHandler(t, Config{})
	big := `{"notes":[{"id":"a","title":"t","content":"` + strings.Repeat("x", maxBodyBytes) + `","updatedAt":1}]}`
	if w := do(h, "POST", "/api/sync", big); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("got %d", w.Code)
	}
	ok := `{"notes":[{"id":"a","title":"t","content":"` + strings.Repeat("x", maxBodyBytes-200) + `","updatedAt":1}]}`
	if w := do(h, "POST", "/api/sync", ok); w.Code != 200 {
		t.Fatalf("body just under 25MB: got %d", w.Code)
	}
}

func TestAuthWithKey(t *testing.T) {
	h := newTestHandler(t, Config{APIKey: "s3cret"})
	cases := []struct {
		name string
		opts []reqOpt
		want int
	}{
		{"no header", nil, 401},
		{"wrong key", []reqOpt{header("Authorization", "Bearer nope")}, 401},
		{"prefix of key", []reqOpt{header("Authorization", "Bearer s3cre")}, 401},
		{"not bearer", []reqOpt{header("Authorization", "s3cret")}, 401},
		{"right key", []reqOpt{header("Authorization", "Bearer s3cret")}, 200},
		{"right key from internet via tunnel", []reqOpt{
			header("Authorization", "Bearer s3cret"), from("203.0.113.9:443"), header("Cf-Connecting-IP", "198.51.100.1"),
		}, 200},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := do(h, "POST", "/api/sync", oneNote, c.opts...)
			if w.Code != c.want {
				t.Fatalf("got %d want %d: %s", w.Code, c.want, w.Body)
			}
			if c.want == 401 && !strings.Contains(w.Body.String(), "Missing or invalid API key.") {
				t.Fatalf("body %s", w.Body)
			}
		})
	}
	// Health stays open with a key, as before.
	if w := do(h, "GET", "/api/health", "", from("203.0.113.9:1")); w.Code != 200 {
		t.Fatalf("health with key: %d", w.Code)
	}
}

func TestNoKeyOnlyLocalNetwork(t *testing.T) {
	h := newTestHandler(t, Config{})
	cases := []struct {
		name string
		opts []reqOpt
		want int
	}{
		{"loopback v4", []reqOpt{from("127.0.0.1:1")}, 200},
		{"loopback v6", []reqOpt{from("[::1]:1")}, 200},
		{"10/8", []reqOpt{from("10.1.2.3:1")}, 200},
		{"172.16/12", []reqOpt{from("172.17.0.1:1")}, 200},
		{"192.168/16", []reqOpt{from("192.168.1.20:1")}, 200},
		{"link-local", []reqOpt{from("169.254.10.10:1")}, 200},
		{"link-local v6 with zone", []reqOpt{from("[fe80::1%en0]:1")}, 200},
		{"tailscale cgnat", []reqOpt{from("100.101.102.103:1")}, 200},
		{"tailscale v6", []reqOpt{from("[fd7a:115c:a1e0::1]:1")}, 200},
		{"v4-mapped private", []reqOpt{from("[::ffff:192.168.1.5]:1")}, 200},
		{"public v4", []reqOpt{from("203.0.113.9:1")}, 401},
		{"public v6", []reqOpt{from("[2001:db8::1]:1")}, 401},
		{"just outside cgnat", []reqOpt{from("100.128.0.1:1")}, 401},
		{"172.32 is public", []reqOpt{from("172.32.0.1:1")}, 401},
		{"cloudflare tunnel from local connector", []reqOpt{from("172.18.0.3:1"), header("Cf-Connecting-IP", "198.51.100.1")}, 401},
		{"reverse proxy on localhost", []reqOpt{from("127.0.0.1:1"), header("X-Forwarded-For", "198.51.100.1")}, 401},
		{"forwarded header", []reqOpt{from("127.0.0.1:1"), header("Forwarded", "for=198.51.100.1")}, 401},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := do(h, "POST", "/api/sync", oneNote, c.opts...)
			if w.Code != c.want {
				t.Fatalf("got %d want %d: %s", w.Code, c.want, w.Body)
			}
			if c.want == 401 && !strings.Contains(w.Body.String(), "no API key configured") {
				t.Fatalf("401 should explain why: %s", w.Body)
			}
		})
	}
	if w := do(h, "GET", "/api/health", "", from("127.0.0.1:1"), header("Cf-Connecting-IP", "1.1.1.1")); w.Code != 401 {
		t.Fatalf("health through tunnel without key: %d", w.Code)
	}
}

func TestCORSDefaultAnyOrigin(t *testing.T) {
	h := newTestHandler(t, Config{APIKey: "k"})
	w := do(h, "OPTIONS", "/api/sync", "",
		header("Origin", "https://markdown.hfps.dev"),
		header("Access-Control-Request-Method", "POST"),
		header("Access-Control-Request-Headers", "authorization,content-type"),
		from("203.0.113.9:1"), header("Cf-Connecting-IP", "198.51.100.1"))
	if w.Code != 204 {
		t.Fatalf("preflight status %d (must not require auth)", w.Code)
	}
	hd := w.Header()
	if hd.Get("Access-Control-Allow-Origin") != "*" ||
		!strings.Contains(hd.Get("Access-Control-Allow-Methods"), "POST") ||
		!strings.Contains(strings.ToLower(hd.Get("Access-Control-Allow-Headers")), "authorization") {
		t.Fatalf("preflight headers %v", hd)
	}

	// Error responses carry CORS headers too, so the app can read the 401.
	w = do(h, "POST", "/api/sync", oneNote, header("Origin", "https://example.com"))
	if w.Code != 401 || w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("401 without CORS: %d %v", w.Code, w.Header())
	}
}

func TestCORSAllowList(t *testing.T) {
	h := newTestHandler(t, Config{AllowedOrigins: []string{"https://markdown.hfps.dev"}})
	pre := func(origin string) *httptest.ResponseRecorder {
		return do(h, "OPTIONS", "/api/sync", "",
			header("Origin", origin),
			header("Access-Control-Request-Method", "POST"),
			header("Access-Control-Request-Headers", "Authorization"))
	}
	if w := pre("https://markdown.hfps.dev"); w.Header().Get("Access-Control-Allow-Origin") != "https://markdown.hfps.dev" ||
		w.Header().Get("Access-Control-Allow-Headers") != "Authorization" {
		t.Fatalf("allowed origin headers %v", w.Header())
	}
	if w := pre("https://evil.example"); w.Header().Get("Access-Control-Allow-Origin") != "" || w.Header().Get("Access-Control-Allow-Headers") != "" {
		t.Fatalf("disallowed origin got CORS headers %v", w.Header())
	}
	w := do(h, "POST", "/api/sync", oneNote, header("Origin", "https://evil.example"))
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("disallowed origin got ACAO on POST")
	}
}

func TestConcurrentSyncs(t *testing.T) {
	h := newTestHandler(t, Config{})
	done := make(chan int)
	for i := range 20 {
		go func() {
			var b bytes.Buffer
			json.NewEncoder(&b).Encode(map[string]any{"notes": []map[string]any{
				{"id": string(rune('a' + i)), "title": "t", "content": "c", "updatedAt": i},
			}})
			done <- do(h, "POST", "/api/sync", b.String()).Code
		}()
	}
	for range 20 {
		if c := <-done; c != 200 {
			t.Fatalf("status %d", c)
		}
	}
	var resp struct{ Notes []Note }
	json.Unmarshal(do(h, "POST", "/api/sync", `{"notes":[]}`).Body.Bytes(), &resp)
	if len(resp.Notes) != 20 {
		t.Fatalf("have %d notes", len(resp.Notes))
	}
}

func TestParseConfig(t *testing.T) {
	t.Setenv("PORT", "4000")
	t.Setenv("SYNC_API_KEY", "envkey")
	t.Setenv("ALLOWED_ORIGINS", " https://a.example/ , https://b.example ")
	cfg, err := parseConfig([]string{"--port", "5000"}, &bytes.Buffer{})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "5000" || cfg.APIKey != "envkey" || len(cfg.AllowedOrigins) != 2 || cfg.AllowedOrigins[0] != "https://a.example" {
		t.Fatalf("cfg %+v", cfg)
	}
	t.Setenv("ALLOWED_ORIGINS", "*")
	cfg, _ = parseConfig(nil, &bytes.Buffer{})
	if cfg.AllowedOrigins != nil || cfg.Port != "4000" {
		t.Fatalf("cfg %+v", cfg)
	}
}

func TestSubcommands(t *testing.T) {
	var out, errb bytes.Buffer
	if run([]string{"version"}, &out, &errb) != 0 || !strings.HasPrefix(out.String(), "markdown-preview-sync dev") {
		t.Fatalf("version: %q", out.String())
	}
	out.Reset()
	if run([]string{"genkey"}, &out, &errb) != 0 || len(strings.TrimSpace(out.String())) != 64 {
		t.Fatalf("genkey: %q", out.String())
	}
	if run([]string{"bogus"}, &out, &errb) != 2 {
		t.Fatal("unknown command should exit 2")
	}
}
