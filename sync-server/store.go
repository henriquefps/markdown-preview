package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"
)

// Note is one note revision. The JSON shape (field names and order) matches
// what the original Node server wrote to notes.json and returned from
// /api/sync, so existing data files and app clients keep working unchanged.
//
// UpdatedAt is a float64 because it is a JavaScript number (milliseconds since
// the epoch from Date.now()). encoding/json formats float64 the same way
// JavaScript does, so 1762500000000 round-trips as 1762500000000.
type Note struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Content   string  `json:"content"`
	UpdatedAt float64 `json:"updatedAt"`
	Deleted   bool    `json:"deleted"`
}

// Store is the whole "database": an ordered list of notes kept in memory and
// persisted as a single JSON file. Order is insertion order, like the Map the
// Node server used, so the file and the responses keep the same ordering.
type Store struct {
	mu    sync.Mutex
	path  string
	notes []Note
	index map[string]int
	log   *slog.Logger
}

// NewStore creates a store backed by <dataDir>/notes.json. Call Load to read
// existing data.
func NewStore(dataDir string, logger *slog.Logger) *Store {
	return &Store{
		path:  filepath.Join(dataDir, "notes.json"),
		index: map[string]int{},
		log:   logger,
	}
}

// Path returns the data file path.
func (s *Store) Path() string { return s.path }

// Load reads notes.json if it exists. A missing file means an empty store.
// A file that cannot be parsed is copied aside (notes.json.corrupt-<unix>)
// and the store starts empty, so the next write can never destroy the only
// copy of the old data.
func (s *Store) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	raw, err := os.ReadFile(s.path)
	if errors.Is(err, fs.ErrNotExist) {
		s.log.Info("no existing data file yet, starting empty", "file", s.path)
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", s.path, err)
	}

	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		backup := fmt.Sprintf("%s.corrupt-%d", s.path, time.Now().Unix())
		if werr := os.WriteFile(backup, raw, 0o644); werr != nil {
			return fmt.Errorf("data file %s is not a JSON array (%v) and could not be backed up: %w", s.path, err, werr)
		}
		s.log.Error("data file is not a JSON array, starting empty", "file", s.path, "err", err, "backup", backup)
		return nil
	}

	s.notes = s.notes[:0]
	s.index = make(map[string]int, len(items))
	skipped := 0
	for _, item := range items {
		n, ok := decodeStoredNote(item)
		if !ok {
			skipped++
			continue
		}
		if i, exists := s.index[n.ID]; exists {
			// Same as Map construction in Node: a later duplicate replaces the
			// earlier value but keeps the first position.
			s.notes[i] = n
			continue
		}
		s.index[n.ID] = len(s.notes)
		s.notes = append(s.notes, n)
	}
	if skipped > 0 {
		s.log.Warn("skipped unreadable entries in data file", "count", skipped)
	}
	s.log.Info("loaded notes", "count", len(s.notes), "file", s.path)
	return nil
}

// decodeStoredNote is lenient: the file is our own output, so anything with a
// string id is kept, and missing fields take their zero value (a note written
// without "deleted" reads as not deleted).
func decodeStoredNote(raw json.RawMessage) (Note, bool) {
	var n Note
	if err := json.Unmarshal(raw, &n); err != nil || n.ID == "" {
		return Note{}, false
	}
	return n, true
}

// Count returns the number of stored notes, tombstones included.
func (s *Store) Count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.notes)
}

// Merge applies incoming revisions last-write-wins per id: a note is taken
// when the id is new or its updatedAt is strictly greater than the stored
// one. Invalid entries are ignored. The file is rewritten only when something
// changed. It returns the number of applied notes and a snapshot of the full
// merged list.
func (s *Store) Merge(incoming []json.RawMessage) (applied int, all []Note, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Work on a copy so a failed write leaves memory and disk in agreement.
	notes := append([]Note(nil), s.notes...)
	index := make(map[string]int, len(s.index))
	for k, v := range s.index {
		index[k] = v
	}

	for _, raw := range incoming {
		n, ok := parseIncomingNote(raw)
		if !ok {
			continue
		}
		i, exists := index[n.ID]
		if exists && !(n.UpdatedAt > notes[i].UpdatedAt) {
			continue
		}
		if exists {
			notes[i] = n
		} else {
			index[n.ID] = len(notes)
			notes = append(notes, n)
		}
		applied++
	}

	if applied > 0 {
		if err := writeNotesFile(s.path, notes); err != nil {
			return 0, nil, err
		}
		s.notes, s.index = notes, index
	}
	return applied, append([]Note(nil), s.notes...), nil
}

// parseIncomingNote mirrors isValidIncomingNote from the Node server:
//
//	id: non-empty string, title: string, content: string,
//	updatedAt: finite number, deleted: absent or boolean.
//
// Types are checked on the raw JSON so that, for example, "updatedAt": "5"
// or "deleted": null are rejected exactly like JavaScript's typeof checks.
func parseIncomingNote(raw json.RawMessage) (Note, bool) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return Note{}, false
	}
	var n Note
	if !jsonString(fields["id"], &n.ID) || n.ID == "" {
		return Note{}, false
	}
	if !jsonString(fields["title"], &n.Title) || !jsonString(fields["content"], &n.Content) {
		return Note{}, false
	}
	if !jsonNumber(fields["updatedAt"], &n.UpdatedAt) {
		return Note{}, false
	}
	if d, present := fields["deleted"]; present {
		if !jsonBool(d, &n.Deleted) {
			return Note{}, false
		}
	}
	return n, true
}

func jsonString(raw json.RawMessage, dst *string) bool {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || raw[0] != '"' {
		return false
	}
	return json.Unmarshal(raw, dst) == nil
}

func jsonNumber(raw json.RawMessage, dst *float64) bool {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || !(raw[0] == '-' || (raw[0] >= '0' && raw[0] <= '9')) {
		return false
	}
	// ParseFloat reports out-of-range values (which JavaScript would turn
	// into Infinity, failing Number.isFinite) as an error.
	f, err := strconv.ParseFloat(string(raw), 64)
	if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
		return false
	}
	*dst = f
	return true
}

func jsonBool(raw json.RawMessage, dst *bool) bool {
	switch string(bytes.TrimSpace(raw)) {
	case "true":
		*dst = true
		return true
	case "false":
		*dst = false
		return true
	}
	return false
}

// marshalNotesFile produces the same layout as JSON.stringify(notes, null, 2):
// two-space indentation, no HTML escaping, no trailing newline.
func marshalNotesFile(notes []Note) ([]byte, error) {
	if notes == nil {
		notes = []Note{}
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(notes); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// writeNotesFile writes atomically: a temp file in the same directory is
// written, synced and renamed over notes.json, so a crash mid-write can never
// leave a half-written file behind.
func writeNotesFile(path string, notes []Note) error {
	data, err := marshalNotesFile(notes)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return err
	}
	if d, err := os.Open(dir); err == nil {
		d.Sync() // best effort: make the rename durable; not supported everywhere
		d.Close()
	}
	return nil
}

// checkWritable fails early, with a useful hint, when the data directory
// cannot be written (typically a bind mount created by the old root-only
// container while this one runs as a non-root user).
func checkWritable(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".write-test-*")
	if err != nil {
		return err
	}
	name := f.Name()
	f.Close()
	return os.Remove(name)
}
