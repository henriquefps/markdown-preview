package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func quietLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func raws(t *testing.T, js string) []json.RawMessage {
	t.Helper()
	var out []json.RawMessage
	if err := json.Unmarshal([]byte(js), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s := NewStore(t.TempDir(), quietLogger())
	if err := s.Load(); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestValidation(t *testing.T) {
	cases := []struct {
		name  string
		json  string
		valid bool
	}{
		{"minimal", `{"id":"a","title":"","content":"","updatedAt":1}`, true},
		{"deleted true", `{"id":"a","title":"t","content":"c","updatedAt":1,"deleted":true}`, true},
		{"deleted false", `{"id":"a","title":"t","content":"c","updatedAt":1.5,"deleted":false}`, true},
		{"negative and exponent", `{"id":"a","title":"t","content":"c","updatedAt":-1e3}`, true},
		{"extra fields ignored", `{"id":"a","title":"t","content":"c","updatedAt":1,"x":[1]}`, true},
		{"empty id", `{"id":"","title":"t","content":"c","updatedAt":1}`, false},
		{"numeric id", `{"id":1,"title":"t","content":"c","updatedAt":1}`, false},
		{"missing title", `{"id":"a","content":"c","updatedAt":1}`, false},
		{"null content", `{"id":"a","title":"t","content":null,"updatedAt":1}`, false},
		{"string updatedAt", `{"id":"a","title":"t","content":"c","updatedAt":"1"}`, false},
		{"missing updatedAt", `{"id":"a","title":"t","content":"c"}`, false},
		{"infinite updatedAt", `{"id":"a","title":"t","content":"c","updatedAt":1e400}`, false},
		{"null deleted", `{"id":"a","title":"t","content":"c","updatedAt":1,"deleted":null}`, false},
		{"string deleted", `{"id":"a","title":"t","content":"c","updatedAt":1,"deleted":"true"}`, false},
		{"null", `null`, false},
		{"array", `[]`, false},
		{"string", `"a"`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, ok := parseIncomingNote(json.RawMessage(c.json))
			if ok != c.valid {
				t.Fatalf("parseIncomingNote(%s) = %v, want %v", c.json, ok, c.valid)
			}
		})
	}
}

func TestMergeLastWriteWins(t *testing.T) {
	s := newTestStore(t)
	applied, all, err := s.Merge(raws(t, `[
		{"id":"a","title":"A1","content":"x","updatedAt":100},
		{"id":"b","title":"B1","content":"y","updatedAt":100}]`))
	if err != nil || applied != 2 || len(all) != 2 {
		t.Fatalf("first merge: applied=%d len=%d err=%v", applied, len(all), err)
	}

	// Older and equal timestamps lose; strictly newer wins. Order is kept.
	applied, all, _ = s.Merge(raws(t, `[
		{"id":"a","title":"A-old","content":"x","updatedAt":99},
		{"id":"b","title":"B-same","content":"y","updatedAt":100},
		{"id":"c","title":"C1","content":"z","updatedAt":5},
		{"id":"a","title":"A2","content":"x2","updatedAt":101}]`))
	if applied != 2 {
		t.Fatalf("applied = %d, want 2", applied)
	}
	want := []string{"a:A2", "b:B1", "c:C1"}
	for i, n := range all {
		if got := n.ID + ":" + n.Title; got != want[i] {
			t.Fatalf("all[%d] = %s, want %s", i, got, want[i])
		}
	}
}

func TestMergeIgnoresInvalidAndSkipsWriteWhenUnchanged(t *testing.T) {
	s := newTestStore(t)
	applied, all, err := s.Merge(raws(t, `[{"id":"a","title":1,"content":"x","updatedAt":1}, null, 3]`))
	if err != nil || applied != 0 || len(all) != 0 {
		t.Fatalf("applied=%d len=%d err=%v", applied, len(all), err)
	}
	if _, err := os.Stat(s.Path()); !os.IsNotExist(err) {
		t.Fatalf("data file should not be written when nothing changed (stat err=%v)", err)
	}

	s.Merge(raws(t, `[{"id":"a","title":"t","content":"x","updatedAt":1}]`))
	before, _ := os.Stat(s.Path())
	os.Chtimes(s.Path(), before.ModTime().Add(-time.Hour), before.ModTime().Add(-time.Hour))
	before, _ = os.Stat(s.Path())
	if applied, _, _ := s.Merge(raws(t, `[{"id":"a","title":"t","content":"x","updatedAt":1}]`)); applied != 0 {
		t.Fatalf("re-sending same note applied %d", applied)
	}
	after, _ := os.Stat(s.Path())
	if !after.ModTime().Equal(before.ModTime()) {
		t.Fatal("data file rewritten although nothing changed")
	}
}

func TestTombstones(t *testing.T) {
	s := newTestStore(t)
	s.Merge(raws(t, `[{"id":"a","title":"t","content":"x","updatedAt":1}]`))

	// A delete is just a newer revision.
	_, all, _ := s.Merge(raws(t, `[{"id":"a","title":"t","content":"x","updatedAt":2,"deleted":true}]`))
	if len(all) != 1 || !all[0].Deleted {
		t.Fatalf("tombstone not applied: %+v", all)
	}
	// An older edit does not resurrect it.
	_, all, _ = s.Merge(raws(t, `[{"id":"a","title":"t","content":"old edit","updatedAt":1.5}]`))
	if !all[0].Deleted || all[0].Content != "x" {
		t.Fatalf("older edit resurrected a deleted note: %+v", all[0])
	}
	// A newer edit wins over the delete, like two racing edits.
	_, all, _ = s.Merge(raws(t, `[{"id":"a","title":"t","content":"new edit","updatedAt":3}]`))
	if all[0].Deleted || all[0].Content != "new edit" {
		t.Fatalf("newer edit should win over the tombstone: %+v", all[0])
	}
}

func TestPersistenceRoundTrip(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir, quietLogger())
	s.Load()
	content := "<b>html</b> & \"quotes\" — ünïcödé 🎉\nline2\ttab"
	in, _ := json.Marshal([]map[string]any{
		{"id": "a", "title": "A", "content": content, "updatedAt": 1762500000000},
		{"id": "b", "title": "B", "content": "", "updatedAt": 1762500001234, "deleted": true},
	})
	if _, _, err := s.Merge(raws(t, string(in))); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.Path() + ".tmp"); !os.IsNotExist(err) {
		t.Fatal("temp file left behind")
	}

	s2 := NewStore(dir, quietLogger())
	if err := s2.Load(); err != nil {
		t.Fatal(err)
	}
	_, all, _ := s2.Merge(nil)
	if len(all) != 2 || all[0].Content != content || all[0].UpdatedAt != 1762500000000 || !all[1].Deleted || all[1].Deleted == all[0].Deleted {
		t.Fatalf("round trip mismatch: %+v", all)
	}
	raw, _ := os.ReadFile(s.Path())
	if strings.Contains(string(raw), "\\u003c") || strings.HasSuffix(string(raw), "\n") || !strings.Contains(string(raw), "\n  {\n    \"id\": \"a\",") {
		t.Fatalf("file layout differs from JSON.stringify(notes, null, 2):\n%s", raw)
	}
}

// testdata/node-notes.json was written by the original Node server
// (server.js) after two real sync requests. The Go server must read it
// unchanged and, when it rewrites it, produce byte-identical output.
func TestNodeFixtureCompatibility(t *testing.T) {
	fixture, err := os.ReadFile("testdata/node-notes.json")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "notes.json"), fixture, 0o644); err != nil {
		t.Fatal(err)
	}
	s := NewStore(dir, quietLogger())
	if err := s.Load(); err != nil {
		t.Fatal(err)
	}
	if s.Count() != 3 {
		t.Fatalf("loaded %d notes, want 3", s.Count())
	}
	_, all, _ := s.Merge(nil)
	if all[0].ID != "a1" || all[0].Title != "Hello v2" || all[0].UpdatedAt != 1762500005000 ||
		!all[1].Deleted || all[2].Content != "- [ ] one\n- [x] two\n\n```js\nconsole.log(1)\n```" {
		t.Fatalf("unexpected notes: %+v", all)
	}

	out, err := marshalNotesFile(all)
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != string(fixture) {
		t.Fatalf("re-serialised file differs from the Node output\n--- node\n%s\n--- go\n%s", fixture, out)
	}

	// The Node server also answered this exact list from /api/sync.
	nodeResponse := `{"notes":[{"id":"a1","title":"Hello v2","content":"updated\ttab","updatedAt":1762500005000,"deleted":false},{"id":"b2","title":"Deleted one","content":"","updatedAt":1762500001234,"deleted":true},{"id":"c3","title":"Tasks","content":"- [ ] one\n- [x] two\n\n` + "```js\\nconsole.log(1)\\n```" + `","updatedAt":1762500002000,"deleted":false}]}`
	got, _ := json.Marshal(map[string]any{"notes": all})
	if string(got) != nodeResponse {
		t.Fatalf("response differs from Node\n--- node\n%s\n--- go\n%s", nodeResponse, got)
	}
}

func TestLoadNoteWithoutDeletedField(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "notes.json"), []byte(`[{"id":"a","title":"t","content":"c","updatedAt":5}]`), 0o644)
	s := NewStore(dir, quietLogger())
	if err := s.Load(); err != nil || s.Count() != 1 {
		t.Fatalf("count=%d err=%v", s.Count(), err)
	}
}

func TestCorruptFileIsBackedUp(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "notes.json"), []byte(`{not json`), 0o644)
	s := NewStore(dir, quietLogger())
	if err := s.Load(); err != nil {
		t.Fatal(err)
	}
	matches, _ := filepath.Glob(filepath.Join(dir, "notes.json.corrupt-*"))
	if s.Count() != 0 || len(matches) != 1 {
		t.Fatalf("count=%d backups=%v", s.Count(), matches)
	}
}
