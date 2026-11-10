<img src="docs/img/icon.svg" alt="" width="96" height="96">

# Markdown Previewer

A live Markdown editor and previewer that runs in the browser, installs as an app and works offline.

## Features

- Side-by-side editor and preview with a view switcher that adapts to mobile
- Tables, task lists and syntax-highlighted code blocks
- [Mermaid](https://mermaid.js.org/) diagrams and LaTeX math (KaTeX)
- Emojis, superscripts, subscripts and flexible text markers
- Image uploads
- PDF export through print styles
- Light and dark themes
- Installable PWA with offline support
- Optional sync between devices through your own server: a single binary for Linux, macOS and Windows, or a Docker image

## Run locally

```sh
npm install
npm run dev
```

Other scripts: `npm run build` (type-check and production build), `npm run lint`, `npm run preview`.

## Deploy

The app is deployed to Cloudflare Pages (project `markdown-preview-hfps`):

```sh
npm run deploy
```

This builds the app and publishes `dist/` with Wrangler. The deploy script calls `bun run build`, so Bun must be installed.

## Sync server

Notes stay in the browser. To sync them between devices, run the small self-hosted server in [`sync-server/`](sync-server/): a single Go binary for Linux, macOS and Windows, or the Docker image `ghcr.io/henriquefps/markdown-preview-sync`. It keeps every note in one `notes.json` file, merges per note (newest edit wins) and answers only your local network unless you set an API key.

The easiest start is the [setup guide](https://markdown.hfps.dev/sync) on the site, which detects your system and links the right download. The **Device sync** sheet in the app links to it too.

1. Download the binary for your system from the [setup guide](https://markdown.hfps.dev/sync) or [Releases](https://github.com/henriquefps/markdown-preview/releases/latest) and run it, or run `docker run -p 3041:3041 -v markdown-sync-data:/app/data ghcr.io/henriquefps/markdown-preview-sync`.
2. In the app, open **Settings → Device sync** and enter the server address, e.g. `http://192.168.1.10:3041`.

When the app is opened over HTTPS, the server needs an HTTPS address too. [sync-server/README.md](sync-server/README.md) covers installing it as a service, the security model, exposing it with Cloudflare Tunnel or Tailscale, backups and migrating from the old Node.js server.

## Assets

The icon and social preview live in `docs/img`. The icon glyph and the social preview source are in `scripts/`. The icon files used by the site are in `public/`.

The icon is a [Designer](https://designer.hfps.dev) project, `scripts/glyph.designer.json` (open it there to edit it). To rebuild every icon file after changing it:

```sh
DESIGNER="github:henriquefps/logo-designer#d99b116e33a5"
bunx --bun "$DESIGNER" to-svg scripts/glyph.designer.json --glyph -o scripts/glyph.svg   # then re-add the one-line comment header
bunx --bun "$DESIGNER" icons scripts/glyph.designer.json -o /tmp/icons                     # prints the keyline report, writes review-sheet.png
cp /tmp/icons/docs-img/* docs/img/ && cp /tmp/icons/docs-img/icon.svg scripts/icon.svg
cp /tmp/icons/site/{favicon.ico,apple-touch-icon.png,icon-192.png,icon-512.png,icon-maskable-512.png} public/
cp /tmp/icons/site/icon.svg public/favicon.svg && cp /tmp/icons/site/icon-512.png public/logo.png
```

The social preview is rendered from `scripts/social-preview.html` (2560 x 1280).

## License

[MIT](LICENSE)
