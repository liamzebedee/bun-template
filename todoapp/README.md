# app-template

A minimal base for a locally-run, single-page application.

```sh
bun install
bun framework/dev.ts      # dev server with live reload  → http://localhost:3000
bun framework/build.ts    # static export                → ./dist
```

## Layout

```
app/                 your application
  index.tsx          React SPA root (mounts into #root)
  index.css          styles
framework/           the harness — rarely edited
  dev.ts             dev server: transpile + serve + SQLite API + live reload
  build.ts           static export to dist/
  lib/
    turbolinks.ts    zero-dependency turbolinks-style navigation
index.html           page shell
```

## Decisions

- **Bun** — the only runtime. Server, bundler, transpiler, SQLite, and file IO are all Bun built-ins; no extra toolchain.
- **TypeScript / TSX through Bun** — no `tsconfig` compile step. Bun transpiles `.tsx` directly, in dev on demand and for the static build.
- **SQLite backend** — first-class persistence via Bun's built-in `bun:sqlite`. `framework/dev.ts` defines real tables and serves them over a small REST API (`/api/items`); data lives in a local `db.sqlite3` file. No external database. Replace the example `items` table with your own schema.
- **Local-first** — `bun framework/dev.ts` serves source straight off the file system, transpiles `.tsx` on demand, and live-reloads the browser over a WebSocket.
- **Turbolinks navigation** — `framework/lib/turbolinks.ts` is imported by `app/index.tsx`, so it ships in the bundle. It cross-fades same-origin `<a>` navigations by swapping a `.ctn` container instead of reloading. While the app renders a single React view it stays inert; it activates once the app serves real pages with a shared shell.
- **Static export** — `bun framework/build.ts` bundles the SPA into `./dist` as plain HTML/JS/CSS you can host anywhere. (The API needs the dev server; a purely static `dist/` has no backend.)
- **Minimal** — small enough to read end to end.
