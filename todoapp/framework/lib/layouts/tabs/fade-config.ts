// Tabs layout cross-fade duration.
//
// turbolinks reads window.__turboConfig once, at module init — so this must run
// BEFORE turbolinks is imported (tabs.ts imports this module first). The fade is
// kept short on purpose: turbolinks' fetch is ~5ms, so the *only* thing the user
// feels between pages is this CSS opacity transition. 40ms reads as snappy while
// still cross-fading rather than hard-cutting.
(window as any).__turboConfig = { ...((window as any).__turboConfig || {}), fade: 40 };

export {};
