# Design decisions

## Bun as the one runtime: SSR + static export + local API

The app is served by a single Bun server (`framework/dev.ts`) that does three
jobs at once:

- **Server-side rendering of every route.** The server knows all of the app's
  routes and returns a real page shell for each one. So a deep link (or a search
  crawler) that hits a route cold gets a valid first-load response — not a blank
  SPA that only works after JS boots. This is what makes the app SEO-able and
  shareable.
- **Static export.** Because every route renders server-side, the same app can
  be exported to static HTML (`framework/build.ts` → `dist/`) and hosted
  anywhere.
- **A local API server.** The same process exposes a small REST API backed by
  SQLite (`bun:sqlite`) so the app can talk to the local machine — read/write a
  real database, touch the filesystem, shell out to local tools, etc. No
  external services.

## Turbolinks for navigation (and for mixing static + app pages)

Navigation between routes uses turbolinks (`framework/lib/turbolinks.ts`): it
fetches the destination over the network and cross-fades only the content shell
(`.ctn`) into place, leaving the header bar / persistent UI untouched.

Two reasons we keep it rather than reaching for a client-side router:

1. **It feels nice** — same-origin links cross-fade instead of doing a hard
   browser reload, with no SPA framework required.
2. **It lets static pages and app pages live side by side.** Because each route
   is a real server-rendered page and turbolinks just swaps the content region,
   a plain static/marketing page and an interactive app page navigate between
   each other seamlessly. This is exactly how
   [liamzebedee.com](https://liamzebedee.com) works — static content and app
   content under one turbolinks shell.

The turbolinks fetch is cheap (~5ms locally); it is **not** a performance
concern.

## The transition fade is tuned short, on purpose

Since the fetch is ~5ms, the *only* thing a user perceives between pages is the
CSS opacity cross-fade. The default 250ms fade felt laggy. The tabs layout sets
it to **40ms** (`framework/lib/layouts/tabs/fade-config.ts`, mirrored in
`tabs.css`) — short enough to feel instant while still cross-fading rather than
hard-cutting. turbolinks reads this from `window.__turboConfig.fade` at init, so
the value is set before turbolinks loads (via import order in `tabs.ts`).

If a transition ever feels slow, it's the fade duration to adjust — not the
turbolinks fetch or the React mount.
