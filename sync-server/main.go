// Command markdown-preview-sync is the self-hosted sync server for Markdown
// Previewer: one HTTP endpoint that merges notes last-write-wins per id and a
// single JSON file as the whole database.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// Set at build time with -ldflags "-X main.version=... -X main.commit=... -X main.date=...".
var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

const usage = `markdown-preview-sync: self-hosted sync server for Markdown Previewer

Usage:
  markdown-preview-sync [serve] [flags]   run the server (default)
  markdown-preview-sync genkey            print a random API key (32 bytes, hex)
  markdown-preview-sync version           print the version

Flags (each falls back to the environment variable in brackets):
  --port string              port to listen on [PORT] (default 3041)
  --data-dir string          directory holding notes.json [DATA_DIR] (default ./data)
  --api-key string           require "Authorization: Bearer <key>" on /api/sync [SYNC_API_KEY]
  --allowed-origins string   comma-separated CORS origins, empty = any [ALLOWED_ORIGINS]

Without an API key the server only answers requests coming directly from the
local network (loopback, private, link-local and 100.64.0.0/10 addresses)
that did not pass through a tunnel or proxy.
`

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	cmd := "serve"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		cmd, args = args[0], args[1:]
	}
	switch cmd {
	case "serve":
		return serve(args, stderr)
	case "version":
		fmt.Fprintf(stdout, "markdown-preview-sync %s (commit %s, built %s)\n", version, commit, date)
		return 0
	case "genkey":
		key, err := generateKey()
		if err != nil {
			fmt.Fprintln(stderr, "genkey:", err)
			return 1
		}
		fmt.Fprintln(stdout, key)
		return 0
	case "help":
		fmt.Fprint(stdout, usage)
		return 0
	default:
		fmt.Fprintf(stderr, "unknown command %q\n\n%s", cmd, usage)
		return 2
	}
}

func generateKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func envOr(name, fallback string) string {
	if v, ok := os.LookupEnv(name); ok && v != "" {
		return v
	}
	return fallback
}

func parseConfig(args []string, stderr io.Writer) (Config, error) {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() { fmt.Fprint(stderr, usage) }
	port := fs.String("port", envOr("PORT", "3041"), "")
	dataDir := fs.String("data-dir", envOr("DATA_DIR", "data"), "")
	apiKey := fs.String("api-key", os.Getenv("SYNC_API_KEY"), "")
	origins := fs.String("allowed-origins", os.Getenv("ALLOWED_ORIGINS"), "")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	if fs.NArg() > 0 {
		return Config{}, fmt.Errorf("unexpected arguments: %v", fs.Args())
	}
	dir, err := filepath.Abs(*dataDir)
	if err != nil {
		return Config{}, err
	}
	cfg := Config{Port: *port, DataDir: dir, APIKey: strings.TrimSpace(*apiKey)}
	for _, o := range strings.Split(*origins, ",") {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		if o == "*" {
			cfg.AllowedOrigins = nil
			break
		}
		if o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}
	return cfg, nil
}

func serve(args []string, stderr io.Writer) int {
	cfg, err := parseConfig(args, stderr)
	if errors.Is(err, flag.ErrHelp) {
		return 0
	}
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	logger := slog.New(slog.NewTextHandler(stderr, nil))

	if err := checkWritable(cfg.DataDir); err != nil {
		logger.Error("data directory is not writable", "dir", cfg.DataDir, "err", err,
			"hint", "give the server's user ownership of it, e.g. for the Docker image: sudo chown -R 65532:65532 ./data")
		return 1
	}
	store := NewStore(cfg.DataDir, logger)
	if err := store.Load(); err != nil {
		logger.Error("cannot load data file", "err", err)
		return 1
	}

	srv := &http.Server{
		Addr:              net.JoinHostPort("", cfg.Port),
		Handler:           NewServer(cfg, store, logger).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
	ln, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		logger.Error("cannot listen", "addr", srv.Addr, "err", err)
		return 1
	}

	origins := "any"
	if len(cfg.AllowedOrigins) > 0 {
		origins = strings.Join(cfg.AllowedOrigins, ",")
	}
	logger.Info("markdown-preview-sync listening", "version", version, "port", cfg.Port, "file", store.Path(), "origins", origins)
	if cfg.APIKey != "" {
		logger.Info("API key auth: enabled")
	} else {
		fmt.Fprint(stderr, `
##########################################################################
#  WARNING: no API key configured (SYNC_API_KEY / --api-key).
#  Only requests coming directly from the local network are accepted;
#  anything through Cloudflare Tunnel or another proxy gets 401.
#  Before exposing this server, create a key:  markdown-preview-sync genkey
##########################################################################

`)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()

	select {
	case err := <-errc:
		logger.Error("server stopped", "err", err)
		return 1
	case <-ctx.Done():
	}
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown", "err", err)
		return 1
	}
	logger.Info("bye")
	return 0
}
