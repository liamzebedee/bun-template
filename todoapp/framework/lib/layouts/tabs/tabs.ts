// tabs layout — keep the active tab highlighted.
//
// The header bar lives OUTSIDE the turbolinks `.ctn` content shell, so it is
// never swapped on navigation. That means we can't rely on a fresh render to set
// the active tab — instead we re-derive it from location.pathname on first load
// and after every turbolinks swap (the `turbo:load` event).
import "./fade-config";     // sets the fade duration BEFORE turbolinks reads it
import "../../turbolinks";  // using this layout activates turbolinks navigation

export function activateTabs(): void {
  const update = () => {
    const path = location.pathname;
    document.querySelectorAll<HTMLAnchorElement>(".topbar .tab").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const active = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
      a.classList.toggle("active", active);
    });
  };
  update();
  window.addEventListener("turbo:load", update);
}
