# Markdown Previewer — Sync Server

A tiny, self-hosted sync server for the Markdown Previewer app. One JSON file
is the whole database. Runs happily LAN-only with no auth at all — auth is
opt-in, only needed if you expose it further (see below).

## Run it

With Docker Compose (recommended — also covers the optional Cloudflare
Tunnel service, see below):

```bash
cp .env.example .env   # fill in values as needed, see "Going beyond your LAN"
docker compose up -d --build
```

Or plain Docker:

```bash
docker build -t markdown-preview-sync .
docker run -d --name markdown-preview-sync \
  -p 3041:3041 \
  -v "$(pwd)/data:/app/data" \
  markdown-preview-sync
```

Without Docker (for local testing):

```bash
npm install
npm start
```

## Point the app at it

1. Find this machine's LAN IP address (macOS: `ipconfig getifaddr en0`, or check
   System Settings → Network).
2. In Markdown Previewer, open **Sync Settings**, turn on **Enable device
   sync**, and enter `http://<that-ip>:3041` — e.g. `http://192.168.1.101:3041`.
3. Do the same on every other device on the same network.

This only works for devices on the *same* LAN. It also only works if the app
itself was loaded over plain HTTP — see the next section if the app is
served over HTTPS (e.g. a public deployment like `https://markdown.hfps.dev`).

## Going beyond your LAN

Two situations need more than the plain HTTP setup above:

- **The app is served over HTTPS.** Browsers block an HTTPS page from
  calling a plain-HTTP address at all ("mixed content") — this isn't
  something the app's code can work around, it's a browser security policy.
  This bites you on every device, but is easiest to hit on mobile: there's
  usually no way to override it there, while desktop Chrome has a hidden
  per-site toggle that can mask the problem during testing.
- **You want sync to work from outside your home network** (e.g. on mobile
  data).

Both are solved by putting the sync server behind a [Cloudflare
Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):
Cloudflare terminates real, trusted HTTPS at their edge and proxies to your
container over an outbound-only connection — no port forwarding, no
certificates to manage yourself.

**Because this makes the server reachable from the whole internet (not just
your LAN), set `SYNC_API_KEY` before doing this** — otherwise anyone who
finds the URL can read and overwrite every note.

1. Generate a key: `openssl rand -hex 32`. Put it in `.env` as
   `SYNC_API_KEY=...`.
2. In the Cloudflare Zero Trust dashboard → **Networks → Tunnels**, create a
   tunnel. Copy the connector token it gives you into `.env` as
   `CLOUDFLARE_TUNNEL_TOKEN=...`.
3. In that tunnel's **Public Hostname** settings, add a hostname (e.g.
   `sync.hfps.dev`) pointing at `http://markdown-sync:3041` — that's the
   Docker Compose service name, resolvable because `cloudflared` runs in the
   same compose file/network as the sync server.
4. `docker compose up -d` — this starts both the sync server and the
   `cloudflared` connector together.
5. In the app's Sync Settings, use `https://sync.hfps.dev` (your tunnel
   hostname) as the server address, and paste the same value from
   `SYNC_API_KEY` into the **API Key** field. Do this on every device.

`.env` is gitignored — the API key and tunnel token never belong in the
repo. If a token or key is ever pasted somewhere it shouldn't be (a chat, a
commit, a screenshot), rotate it: delete/recreate the tunnel for a new
token, generate a fresh `SYNC_API_KEY` and update it everywhere.

## How syncing works

- Every device periodically sends its full local note list to `POST
  /api/sync` and gets back the merged, authoritative list.
- Per note, whichever copy has the newest `updatedAt` wins — on the server
  and on every device, once they've synced. New notes from any device get
  added everywhere; nothing is silently dropped.
- Deleting a note creates a tombstone (`deleted: true`) instead of removing
  it outright, so the deletion itself propagates to other devices instead of
  the note quietly reappearing on their next sync.
- If two devices edit the *same* note while both are offline from the
  server, the edit with the later timestamp wins when they both eventually
  sync — there's no merge of the two edits. For a personal, single-user,
  local-network tool this is an intentional simplicity trade-off.

## Data

Notes live in `data/notes.json` on the host (via the volume mount), so they
survive container rebuilds/restarts. Back that file up like any other
personal data if you care about it — there's no separate backup mechanism.
