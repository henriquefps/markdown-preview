# Markdown Previewer sync server

`markdown-preview-sync` keeps your [Markdown Previewer](https://markdown.hfps.dev) notes in sync between devices. You run it yourself, on a computer at home, a Raspberry Pi, a NAS or a small VPS. It is one small program with no dependencies, and all your notes live in a single `notes.json` file that you own.

- One static binary for Linux, macOS and Windows (amd64 and arm64), or a Docker image.
- Last-write-wins merge per note, with deletions synced as tombstones.
- Secure by default: without an API key it only answers your local network.
- Works through Cloudflare Tunnel or Tailscale when you want sync away from home.

## Contents

- [Install](#install)
- [Configuration](#configuration)
- [Point the app at it](#point-the-app-at-it)
- [Security model](#security-model)
- [Exposing it to the internet with Cloudflare Tunnel](#exposing-it-to-the-internet-with-cloudflare-tunnel)
- [Tailscale: private sync without a public URL](#tailscale-private-sync-without-a-public-url)
- [Backups](#backups)
- [Migrating from the old Node.js server](#migrating-from-the-old-nodejs-server)
- [How syncing works](#how-syncing-works)
- [Building from source](#building-from-source)

## Install

### Option 1: download a binary

Download the archive for your system from the [latest release](https://github.com/henriquefps/markdown-preview/releases/latest), or from the [setup guide](https://markdown.hfps.dev/sync), which picks the right one for you. The names carry no version, so `https://github.com/henriquefps/markdown-preview/releases/latest/download/<archive>` always points at the newest build:

| System | Archive |
| --- | --- |
| Linux, Intel/AMD | `markdown-preview-sync_linux_amd64.tar.gz` |
| Linux, ARM (Raspberry Pi 4/5 with a 64-bit OS) | `markdown-preview-sync_linux_arm64.tar.gz` |
| macOS, Apple silicon | `markdown-preview-sync_darwin_arm64.tar.gz` |
| macOS, Intel | `markdown-preview-sync_darwin_amd64.tar.gz` |
| Windows, Intel/AMD | `markdown-preview-sync_windows_amd64.zip` |
| Windows, ARM | `markdown-preview-sync_windows_arm64.zip` |

`checksums.txt` in the same release lists the SHA-256 of every archive.

Then extract and run it:

```sh
curl -LO https://github.com/henriquefps/markdown-preview/releases/latest/download/markdown-preview-sync_linux_amd64.tar.gz
tar xzf markdown-preview-sync_linux_amd64.tar.gz
./markdown-preview-sync
```

It listens on port 3041 and stores notes in `./data/notes.json`. Stop it with Ctrl+C.

#### Run it as a service on Linux (systemd)

```sh
sudo install -m 755 markdown-preview-sync /usr/local/bin/
markdown-preview-sync genkey     # optional, only if you will expose it (see below)
```

Create `/etc/systemd/system/markdown-preview-sync.service`:

```ini
[Unit]
Description=Markdown Previewer sync server
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/markdown-preview-sync
# Runs as a throwaway system user; notes live in /var/lib/markdown-preview-sync.
DynamicUser=yes
StateDirectory=markdown-preview-sync
Environment=DATA_DIR=/var/lib/markdown-preview-sync
Environment=PORT=3041
# Optional: put SYNC_API_KEY=... (and ALLOWED_ORIGINS=...) in this file, mode 600.
EnvironmentFile=-/etc/markdown-preview-sync.env
Restart=on-failure
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now markdown-preview-sync
journalctl -u markdown-preview-sync -f
```

#### macOS

The binaries are not notarized, so macOS blocks the first run of a downloaded file. Remove the quarantine flag once:

```sh
xattr -d com.apple.quarantine ./markdown-preview-sync
```

To start it at login, save this as `~/Library/LaunchAgents/dev.hfps.markdown-preview-sync.plist` (adjust the paths), then run `launchctl load ~/Library/LaunchAgents/dev.hfps.markdown-preview-sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.hfps.markdown-preview-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/markdown-preview-sync</string>
    <string>--data-dir</string><string>/Users/YOU/Library/Application Support/markdown-preview-sync</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/markdown-preview-sync.log</string>
</dict>
</plist>
```

The first time another device connects, macOS asks whether to allow incoming connections. Allow it.

#### Windows

Extract the zip and run `markdown-preview-sync.exe` from PowerShell or by double-clicking it. SmartScreen may warn about an unrecognised app: choose **More info → Run anyway**. Allow it on **private networks** when Windows Firewall asks. To start it automatically, create a task in Task Scheduler that runs the `.exe` at log on, or wrap it as a service with a tool such as [NSSM](https://nssm.cc/). Set variables in PowerShell with `$env:SYNC_API_KEY = "..."` or pass flags such as `--data-dir C:\markdown-sync`.

### Option 2: Docker

The image is `ghcr.io/henriquefps/markdown-preview-sync` (linux/amd64 and linux/arm64). It is a distroless image of about 9 MB that runs as a non-root user (uid 65532) and keeps notes in `/app/data`.

```sh
mkdir -p data && sudo chown 65532:65532 data
docker run -d --name markdown-preview-sync --restart unless-stopped \
  -p 3041:3041 \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/henriquefps/markdown-preview-sync:latest
```

The `chown` gives the container's user write access to the host directory. On Docker Desktop (macOS and Windows) it is not needed. With a named volume (`-v markdown-sync-data:/app/data`) it is not needed either.

Or use the [`docker-compose.yml`](docker-compose.yml) in this directory, which also contains an optional Cloudflare Tunnel connector:

```sh
cp .env.example .env    # fill in values, see below
docker compose up -d
```

To build the image yourself instead of pulling it, uncomment `build: .` in `docker-compose.yml`, or run `docker build -t markdown-preview-sync .`.

## Configuration

Every setting can be given as a flag or as an environment variable. Flags win.

| Flag | Environment variable | Default | Meaning |
| --- | --- | --- | --- |
| `--port` | `PORT` | `3041` | TCP port to listen on (all interfaces). |
| `--data-dir` | `DATA_DIR` | `./data` (`/app/data` in Docker) | Directory holding `notes.json`. Created if missing. |
| `--api-key` | `SYNC_API_KEY` | empty | When set, `POST /api/sync` requires `Authorization: Bearer <key>`. Required to use the server through a tunnel or proxy. |
| `--allowed-origins` | `ALLOWED_ORIGINS` | empty (any origin) | Comma-separated list of web origins allowed by CORS, e.g. `https://markdown.hfps.dev`. |

Prefer the environment variable for the key: flags are visible to other users in the process list.

Commands:

```sh
markdown-preview-sync            # run the server (same as "serve")
markdown-preview-sync genkey     # print a new random API key (32 bytes, hex)
markdown-preview-sync version    # print the version
markdown-preview-sync help
```

Endpoints:

- `POST /api/sync` with body `{"notes": [...]}` merges the notes and returns `{"notes": [...]}`, the full merged list.
- `GET /api/health` returns `{"ok": true, "noteCount": <n>, "serverTime": <ms>}`.

## Point the app at it

1. Open Markdown Previewer and go to **Settings → Device sync**.
2. Turn on **Sync this device**.
3. In **Server address**, enter the server's URL:
   - on your local network: `http://<server-ip>:3041`, e.g. `http://192.168.1.10:3041` (find the IP with `ip addr` on Linux, `ipconfig getifaddr en0` on macOS or `ipconfig` on Windows);
   - through a tunnel: the HTTPS address, e.g. `https://sync.example.com`.
4. If the server has an API key, paste it in **API key**.
5. Press **Sync now**, then repeat on every device.

**HTTPS pages can't call plain-HTTP servers.** If you use the app at an `https://` address (such as `https://markdown.hfps.dev`), the browser blocks every request to an `http://` address. This is a browser rule called mixed content, and no setting in the app can get around it. You have two choices:

- give the sync server an HTTPS address with [Cloudflare Tunnel](#exposing-it-to-the-internet-with-cloudflare-tunnel) or [Tailscale Serve](#tailscale-private-sync-without-a-public-url), or
- open the app itself over plain HTTP from your own copy (for example `npm run dev` or `npm run preview` on your network).

## Security model

Your notes are only as private as the sync server, so it refuses to be exposed without a key.

**Without an API key** (the default), the server answers only requests that come straight from your network:

- the client's address must be loopback, a private address (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, IPv6 `fc00::/7`), link-local or `100.64.0.0/10` (Tailscale), and
- the request must not carry `Cf-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP` or `Forwarded` headers, which tunnels and reverse proxies add.

Everything else gets `401` with an explanation, and the server prints a warning at startup. So if you put a keyless server behind Cloudflare Tunnel by mistake, nobody on the internet can read your notes.

**With an API key**, anyone who presents the key may sync, from anywhere, and requests without it get `401`. Create a key with:

```sh
markdown-preview-sync genkey
# or: docker run --rm ghcr.io/henriquefps/markdown-preview-sync genkey
```

Set it on the server (`SYNC_API_KEY`) and enter the same value in the app on every device. The key is compared in constant time. Anyone who has it can read and overwrite every note, so treat it like a password. If it leaks (a chat, a commit, a screenshot), generate a new one and update the server and every device.

`/api/health` needs no key when one is configured. It only reveals the number of notes.

CORS allows any origin by default, because the app is a static site that anyone can host and the API key is what protects the data. To accept requests only from your copy of the app, set `ALLOWED_ORIGINS`.

## Exposing it to the internet with Cloudflare Tunnel

[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) gives the server a public HTTPS address with no open ports on your router and no certificates to manage. The `cloudflared` program on your machine opens an outbound connection to Cloudflare, and Cloudflare forwards requests through it.

**Set an API key first.** Tunnelled requests carry `Cf-Connecting-IP`, so a server without a key refuses them all.

### a) Quick test, no account needed

```sh
SYNC_API_KEY=$(markdown-preview-sync genkey) && echo "$SYNC_API_KEY"
SYNC_API_KEY=$SYNC_API_KEY markdown-preview-sync &
cloudflared tunnel --url http://localhost:3041
```

`cloudflared` prints a random `https://<words>.trycloudflare.com` address. Put it and the key in the app. The address changes every time you restart `cloudflared` and has no uptime guarantee, so use it for testing only. Install `cloudflared` from [Cloudflare's downloads page](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) (`brew install cloudflared` on macOS).

### b) Permanent tunnel on your own domain

You need a Cloudflare account and a domain whose DNS is on Cloudflare. Replace `sync.example.com` with your hostname.

```sh
cloudflared tunnel login                                  # opens the browser, pick your domain
cloudflared tunnel create markdown-sync                   # prints the tunnel UUID and writes ~/.cloudflared/<UUID>.json
cloudflared tunnel route dns markdown-sync sync.example.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <UUID>
credentials-file: /home/you/.cloudflared/<UUID>.json
ingress:
  - hostname: sync.example.com
    service: http://localhost:3041
  - service: http_status:404
```

Test it with `cloudflared tunnel run markdown-sync`, then install it as a system service so it starts at boot:

```sh
sudo cloudflared service install
```

On Linux, `service install` copies the configuration to `/etc/cloudflared/`. In the app, use `https://sync.example.com` and your API key.

### c) Docker Compose with a tunnel token

The [`docker-compose.yml`](docker-compose.yml) here runs the sync server and a `cloudflared` connector side by side. The tunnel is managed from the dashboard, so no files are needed on disk.

1. Generate a key and put it in `.env` as `SYNC_API_KEY=...`.
2. In the [Cloudflare dashboard](https://one.dash.cloudflare.com/), go to **Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, and copy the token from the install command into `.env` as `CLOUDFLARE_TUNNEL_TOKEN=...`.
3. Add a public hostname to the tunnel (e.g. `sync.example.com`) whose service is `http://markdown-sync:3041`. `markdown-sync` is the compose service name, which `cloudflared` can reach on the compose network.
4. Run `docker compose up -d`.
5. In the app, use `https://sync.example.com` and the key.

`.env` is ignored by git. Never commit the key or the token. If the token leaks, rotate it in the dashboard.

Don't put Cloudflare Access (a login page) in front of the sync hostname: the app sends background requests and cannot log in. The API key does that job.

## Tailscale: private sync without a public URL

With [Tailscale](https://tailscale.com/) on the server and your devices, they reach each other on `100.x.y.z` addresses wherever they are, and nothing is exposed to the internet.

- **App opened over HTTP:** use `http://<server-tailscale-ip>:3041`. Tailscale addresses count as local, so no key is required.
- **App opened over HTTPS** (e.g. `https://markdown.hfps.dev`): you need an HTTPS address. Run `tailscale serve --bg 3041` on the server and use the `https://<machine>.<tailnet>.ts.net` address it prints. Tailscale Serve is a proxy and adds forwarding headers, so **set an API key** for this setup.

## Backups

All data is in one file, `notes.json` in the data directory. To back it up, copy it, for example from a nightly cron job:

```sh
cp /var/lib/markdown-preview-sync/notes.json ~/backups/notes-$(date +%F).json
```

The server always writes a temporary file and renames it over `notes.json`, so a copy taken at any moment is a complete file. To restore, stop the server, put the file back and start it again. Each device also keeps its own copy of every note, so a lost server can be rebuilt by syncing a device to a fresh, empty server.

If `notes.json` is ever unreadable at startup, the server saves it as `notes.json.corrupt-<timestamp>` and starts empty instead of overwriting it.

## Migrating from the old Node.js server

Earlier versions of this server were a Node.js/Express app. This version is a drop-in replacement:

- same endpoints, request and response format, and port (3041);
- same `notes.json` format, read and written unchanged, in the same place (`/app/data` in Docker, `./data` otherwise);
- same `SYNC_API_KEY`, `PORT` and `DATA_DIR` variables.

With Docker Compose, replace the old `docker-compose.yml` with the new one (it pulls `ghcr.io/henriquefps/markdown-preview-sync` instead of building the Node image) and keep your `.env` and `./data` directory. There is one difference: the old image ran as root, so `./data` and `notes.json` are owned by root, and the new image runs as uid 65532. Fix the ownership once:

```sh
docker compose down
cp data/notes.json notes-backup.json    # just in case
sudo chown -R 65532:65532 data
docker compose pull && docker compose up -d
docker compose logs markdown-sync       # should say: loaded notes count=...
```

If you skip the `chown`, the server stops at startup with `data directory is not writable` and the command to fix it. If you would rather keep running as root, uncomment `user: "0:0"` in `docker-compose.yml`.

No change is needed in the app.

## How syncing works

- Every device sends its full list of notes to `POST /api/sync` every 15 seconds and receives the merged list back.
- For each note id, the copy with the greater `updatedAt` wins, on the server and then on every device. Equal or older timestamps don't replace the stored copy. New notes from any device are added everywhere.
- Deleting a note stores a tombstone (`deleted: true`) with its own timestamp, so the deletion reaches other devices instead of the note reappearing on their next sync. A later edit wins over an earlier delete, and the other way round.
- If two devices edit the same note while offline, the later edit wins when both sync. The two edits are not merged.
- Notes that fail validation (missing id, wrong types) are ignored. Bodies up to 25 MB are accepted, enough for notes with pasted images.

## Building from source

Requires Go 1.27 or newer. There are no third-party dependencies.

```sh
cd sync-server
go test -race ./...
go build -o markdown-preview-sync .
```

Releases are built by [GoReleaser](https://goreleaser.com/) from [`.goreleaser.yaml`](.goreleaser.yaml) when a `v*` tag is pushed. For a local dry run, use `goreleaser release --snapshot --clean`.

## License

[MIT](../LICENSE)
