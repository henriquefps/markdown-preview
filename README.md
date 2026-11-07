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
- Optional self-hosted sync between devices

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

Syncing between devices uses a small self-hosted server. Setup, authentication and data format are described in [sync-server/README.md](sync-server/README.md).

## Assets

The icon and social preview live in `docs/img`. The icon glyph and the social preview source are in `scripts/`. The icon files used by the site are in `public/`.

## License

See [LICENSE](LICENSE).
