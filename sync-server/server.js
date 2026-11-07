import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3041;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'notes.json');

// Auth is opt-in: unset (the default, plain-LAN setup) means /api/sync is
// open, matching the original "trusted local network" design. Set this once
// the server is reachable from beyond the LAN (e.g. behind a Cloudflare
// Tunnel), since at that point anyone who finds the URL could otherwise
// read/write every note.
const API_KEY = process.env.SYNC_API_KEY || null;

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    next();
    return;
  }
  const header = req.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(API_KEY);
  const matches = providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
  if (!matches) {
    res.status(401).json({ error: 'Missing or invalid API key.' });
    return;
  }
  next();
}

// --- Persistence -----------------------------------------------------------
// A single JSON file is the whole "database". At personal-notes scale this is
// plenty, and it keeps the Docker image and the mental model dead simple: one
// file, one volume mount, no schema migrations.

/** @type {Map<string, {id: string, title: string, content: string, updatedAt: number, deleted?: boolean}>} */
let notes = new Map();

function loadNotes() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      notes = new Map(parsed.map((n) => [n.id, n]));
      console.log(`Loaded ${notes.size} note(s) from ${DATA_FILE}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Failed to read existing data file, starting empty:', err.message);
    } else {
      console.log('No existing data file yet, starting empty.');
    }
  }
}

function saveNotes() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(Array.from(notes.values()), null, 2);
  // Write to a temp file then rename, so a crash mid-write can never leave a
  // half-written/corrupt notes.json behind.
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, json, 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

// --- Merge -------------------------------------------------------------
// Last-write-wins per note id, keyed off `updatedAt`. Deletion is just another
// revision (deleted: true) with its own updatedAt, so an edit and a delete of
// the same note race exactly like two edits would: whichever has the newer
// timestamp wins, on every device, once synced.
function isValidIncomingNote(n) {
  return n
    && typeof n.id === 'string' && n.id.length > 0
    && typeof n.title === 'string'
    && typeof n.content === 'string'
    && typeof n.updatedAt === 'number' && Number.isFinite(n.updatedAt)
    && (n.deleted === undefined || typeof n.deleted === 'boolean');
}

function mergeIncoming(incomingNotes) {
  let changed = 0;
  for (const incoming of incomingNotes) {
    if (!isValidIncomingNote(incoming)) continue;
    const existing = notes.get(incoming.id);
    if (!existing || incoming.updatedAt > existing.updatedAt) {
      notes.set(incoming.id, {
        id: incoming.id,
        title: incoming.title,
        content: incoming.content,
        updatedAt: incoming.updatedAt,
        deleted: incoming.deleted === true
      });
      changed++;
    }
  }
  if (changed > 0) saveNotes();
  return changed;
}

// --- HTTP server -------------------------------------------------------
loadNotes();

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' })); // pasted base64 images can make notes large

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, noteCount: notes.size, serverTime: Date.now() });
});

app.post('/api/sync', requireApiKey, (req, res) => {
  const incoming = Array.isArray(req.body?.notes) ? req.body.notes : null;
  if (!incoming) {
    res.status(400).json({ error: 'Expected { notes: Note[] } in request body.' });
    return;
  }
  const changed = mergeIncoming(incoming);
  console.log(`Sync: received ${incoming.length} note(s), ${changed} applied, store now has ${notes.size}.`);
  res.json({ notes: Array.from(notes.values()) });
});

app.listen(PORT, () => {
  console.log(`Markdown Previewer sync server listening on port ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
  console.log(API_KEY ? 'API key auth: ENABLED' : 'API key auth: disabled (SYNC_API_KEY not set)');
});
