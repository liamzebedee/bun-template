# lib/layouts

App **layouts** — the outer chrome an app renders inside. Each layout is a folder
here, and each folder documents its own intent in a `README.md`.

A layout decides where the app title, the header/nav, and the **content shell**
live. The content shell is the region that turbolinks (`framework/lib/turbolinks.ts`)
cross-fades on internal navigation — everything *outside* it (header, players,
footers) persists across "page loads".

```
layouts/
  tabs/        top header bar + tab nav; content cross-fades below it
    README.md  intent + how to use
    tabs.css   styles
    tabs.ts    activateTabs() — keeps the active tab highlighted
    shell.html reference page shell showing where .ctn goes
```

## Picking a layout

Wire one up in your app's page shell (`app/index.html`) by copying the layout's
`shell.html` structure and linking its CSS, then call its setup function from
`app/index.tsx`. See each layout's README.

## The one rule every layout follows

The element turbolinks swaps (`.ctn` by default) must exist **in the static page
shell that the dev server returns** — not be created later by React. Put the
persistent chrome outside `.ctn`; put the swapped content inside it.
