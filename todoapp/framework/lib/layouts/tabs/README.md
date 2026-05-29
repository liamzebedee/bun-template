# tabs layout

A top **header bar** with an app title and a row of tabs. The content sits in a
**content shell** below the bar; clicking a tab navigates turbolinks-style —
only the content shell cross-fades, the header bar stays put.

Ported from the `mealplanner` app's top-bar layout.

```
┌──────────────────────────────────────────────┐
│  app title    [ tab ] [ tab ] [ tab ]         │  ← .topbar (persistent)
├──────────────────────────────────────────────┤
│                                                │
│   content shell (.ctn) — cross-fades on nav    │  ← turbolinks swaps only this
│                                                │
└──────────────────────────────────────────────┘
```

## Intent

- **App title by default.** The bar always shows a title on the left.
- **A header bar.** A persistent strip of tab links. Because it lives *outside*
  the `.ctn` content shell, turbolinks never swaps it, so it never flickers or
  reloads as you move between tabs.
- **A content shell.** `.ctn` is the only region turbolinks fetches and swaps.
  Tab links are ordinary `<a href>` elements; turbolinks intercepts the click,
  fetches the target, and cross-fades the new content into the shell — no full
  page reload, and the header stays exactly where it is.

## How it works

The header bar is part of the static page shell (`app/index.html`), placed as a
sibling of `.ctn`, not inside it. turbolinks (`framework/lib/turbolinks.ts`) only
ever replaces `.ctn`, so the `.topbar` survives every navigation. `activateTabs()`
re-derives which tab is "active" from `location.pathname` on first load and after
each swap (`turbo:load`).

## Usage

1. Copy `shell.html` into your `app/index.html` (it puts `.topbar` outside
   `.ctn`). Set the title and tab links.
2. Link the stylesheet in `<head>`:
   ```html
   <link rel="stylesheet" href="/framework/lib/layouts/tabs/tabs.css">
   ```
3. In `app/index.tsx`, drive the active-tab highlight and let the framework
   render your per-route content into `#root`:
   ```tsx
   import { activateTabs } from "../framework/lib/layouts/tabs/tabs";
   activateTabs();                       // also pulls in turbolinks
   // ...render the page for location.pathname into #root, re-mounting on turbo:load
   ```

Each tab is a route. Render whatever that route needs into `#root`; the shell and
its header are shared across all of them.
