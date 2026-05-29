// Turbolinks-style navigation (TypeScript port of the original turbolinks.js).
//
// Intercepts same-origin link clicks, fetches the target page over the network,
// and cross-fades *only* the content container into place instead of doing a
// full browser navigation. Anything left outside the content container (audio
// players, persistent UI, sockets) keeps running across "page loads".
//
// Hand-rolled, zero dependencies. Imported by app/index.tsx so it ships in the
// bundle. It acts only on real <a> navigations, so it stays inert while a
// single-view SPA is mounted and "wakes up" once the app serves real pages.
//
// Override defaults by setting window.__turboConfig before this module loads.
// While a fetch is in flight, <html> gets a `data-turbo-loading` attribute —
// hang a loading indicator off that in CSS.
interface TurboConfig {
  content?: string; // selector for the swapped container (default ".ctn")
  title?: string | null; // a secondary element to swap, e.g. page heading (null to skip)
  fade?: number; // cross-fade duration in ms
}

declare global {
  interface Window {
    __turbo?: boolean;
    __turboConfig?: TurboConfig;
  }
}

(function () {
  if (window.__turbo) return;
  window.__turbo = true;

  const cfg: TurboConfig = window.__turboConfig || {};
  const CONTENT = cfg.content || ".ctn"; // the only region that gets swapped
  const TITLE = cfg.title === undefined ? "header h2" : cfg.title; // secondary swap; null to skip
  const FADE = cfg.fade != null ? cfg.fade : 250; // cross-fade duration (ms)

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const root = document.documentElement;
  const loadStart = () => root.setAttribute("data-turbo-loading", "");
  const loadDone = () => root.removeAttribute("data-turbo-loading");

  function sameOrigin(href: string) {
    const a = document.createElement("a");
    a.href = href;
    return a.origin === location.origin;
  }

  // Should this anchor be handled by turbolinks, or left to the browser?
  function shouldHandle(a: HTMLAnchorElement | null): a is HTMLAnchorElement {
    if (!a || !a.getAttribute("href")) return false;
    const href = a.getAttribute("href")!;
    if (href.charAt(0) === "#") return false; // pure in-page anchor
    if (a.target && a.target !== "_self") return false; // new tab/window
    if (a.hasAttribute("download") || a.hasAttribute("data-no-turbo")) return false;
    if (!sameOrigin(a.href)) return false; // external site
    // Same-page #anchor: let the browser scroll natively rather than re-fetch.
    if (a.hash && a.pathname === location.pathname && a.search === location.search) return false;
    // Static assets: let the browser fetch/download them directly.
    if (/\.(pdf|png|jpe?g|gif|webp|mp4|mp3|zip|svg|txt|json|xml|webm)$/i.test(a.pathname || "")) return false;
    return true;
  }

  // Soft, brief highlight on whatever a #hash points at. Pair with a CSS rule:
  //   .target-flash { animation: target-flash 1s ease; }
  function flashEl(el: Element | null) {
    if (!el) return;
    el.classList.remove("target-flash");
    void (el as HTMLElement).offsetWidth; // force reflow so the animation restarts
    el.classList.add("target-flash");
  }
  function flashHash() {
    const id = decodeURIComponent((location.hash || "").slice(1));
    if (id) flashEl(document.getElementById(id) || document.getElementsByName(id)[0]);
  }
  // Scroll a turbolinked page to its #anchor (native scroll won't fire after an
  // XHR swap) and flash it.
  function goToHash(hash: string) {
    const id = decodeURIComponent((hash || "").slice(1));
    const el = id ? document.getElementById(id) || document.getElementsByName(id)[0] : null;
    if (el) {
      el.scrollIntoView();
      flashEl(el);
    } else {
      window.scrollTo(0, 0);
    }
  }
  function hashOf(url: string) { const a = document.createElement("a"); a.href = url; return a.hash; }
  function pathOf(url: string) { const a = document.createElement("a"); a.href = url; return a.pathname + a.search; }

  // Remembered scroll offset per page path (manual scrollRestoration).
  const scrollPositions: Record<string, number> = {};
  window.addEventListener("hashchange", flashHash);

  // Re-create <script> nodes so they actually execute after DOM insertion.
  function runScripts(container: Element) {
    container.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      for (let i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      s.textContent = old.textContent;
      old.parentNode!.replaceChild(s, old);
    });
  }

  // Pull in any <head> assets the target page needs that we don't already have.
  function mergeHead(doc: Document) {
    const have: Record<string, number> = {};
    document.head.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"]').forEach((n) => {
      have[(n as HTMLScriptElement).src || (n as HTMLLinkElement).href] = 1;
    });
    doc.head.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"]').forEach((n) => {
      const key = (n as HTMLScriptElement).src || (n as HTMLLinkElement).href;
      if (!have[key]) {
        const c = document.createElement(n.tagName);
        for (let i = 0; i < n.attributes.length; i++) c.setAttribute(n.attributes[i].name, n.attributes[i].value);
        document.head.appendChild(c);
      }
    });
    const inlineHave: string[] = [];
    document.head.querySelectorAll("script:not([src])").forEach((n) => inlineHave.push(n.textContent || ""));
    doc.head.querySelectorAll("script:not([src])").forEach((n) => {
      if (inlineHave.indexOf(n.textContent || "") === -1) {
        const s = document.createElement("script");
        s.textContent = n.textContent;
        document.head.appendChild(s);
      }
    });
  }

  function applyNew(html: string, url: string) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const newC = doc.querySelector<HTMLElement>(CONTENT);
    const curC = document.querySelector<HTMLElement>(CONTENT);
    if (!newC || !curC) { location.href = url; return; } // unexpected shape → full load
    mergeHead(doc);
    newC.style.opacity = "0";
    newC.style.transition = "opacity " + FADE + "ms ease-out";
    curC.replaceWith(newC);
    runScripts(newC);
    if (TITLE) {
      const nH = doc.querySelector(TITLE), cH = document.querySelector(TITLE);
      if (nH && cH) cH.replaceWith(nH);
    }
    document.title = doc.title;
    document.body.className = doc.body.className;
    // Phase 'in': fade the new layer 0 -> 1 (double rAF so the 0 paints first).
    requestAnimationFrame(() => requestAnimationFrame(() => { newC.style.opacity = "1"; }));
    window.dispatchEvent(new Event("turbo:load"));
  }

  let lastPath = location.pathname + location.search;

  function visit(url: string, push: boolean) {
    loadStart();
    // Phase 'out': fade the current content away.
    const curC = document.querySelector<HTMLElement>(CONTENT);
    if (curC) { curC.style.transition = "opacity " + FADE + "ms ease-out"; curC.style.opacity = "0"; }
    // Track the *final* URL after any redirects, and pushState the canonical one
    // so the new page's relative links resolve against the right base.
    let finalUrl = url;
    const fetched = fetch(url, { headers: { "X-Turbo": "1" } }).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      finalUrl = r.url || url;
      return r.text();
    });
    // Flip phases at the halfway point — kept in sync with the CSS fade duration.
    const flip = new Promise<void>((res) => setTimeout(res, FADE / 2));
    Promise.all([fetched, flip]).then(([html]) => {
      // pushState BEFORE applyNew: applyNew dispatches `turbo:load`, and handlers
      // (e.g. re-rendering content or highlighting the active nav item) read
      // location.pathname — so the URL must already be the destination.
      if (push) history.pushState({ turbo: 1 }, "", finalUrl);
      applyNew(html, finalUrl);
      lastPath = location.pathname + location.search;
      const hash = hashOf(finalUrl);
      if (hash) goToHash(hash); // explicit #anchor wins
      else if (!push && scrollPositions[pathOf(finalUrl)] != null) window.scrollTo(0, scrollPositions[pathOf(finalUrl)]); // back/forward
      else window.scrollTo(0, 0); // fresh forward visit
      loadDone();
    }).catch(() => { location.href = url; }); // any failure → hard navigate
  }

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target as Element | null;
    const a = (target && target.closest ? target.closest("a") : null) as HTMLAnchorElement | null;
    if (!shouldHandle(a)) return;
    e.preventDefault();
    if (a.href === location.href) return;
    scrollPositions[location.pathname + location.search] = window.scrollY; // remember this page's scroll
    visit(a.href, true);
  });

  // Only turbo-fetch on real path changes; hash-only popstate is left to the browser.
  window.addEventListener("popstate", () => {
    const p = location.pathname + location.search;
    if (p === lastPath) return;
    scrollPositions[lastPath] = window.scrollY;
    lastPath = p;
    visit(location.href, false);
  });

  // Flash the target on a fresh load that arrives with a #hash.
  if (location.hash) setTimeout(flashHash, 60);
})();

export {};
