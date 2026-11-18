// The three tools come from packages/runner-tools (the same code as the npm package and the blog).
// This file only switches tabs. The extension has no permissions and makes no network calls.
import { mountTools } from "../../packages/runner-tools/src/browser.ts";

const tabs = [...document.querySelectorAll('[role="tab"]')];
function select(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => select(tab));
  tab.addEventListener("keydown", (event) => {
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1 }[event.key];
    if (next === undefined) return;
    const target = tabs[(next + tabs.length) % tabs.length];
    select(target);
    target.focus();
  });
});
select(tabs[0]);
mountTools();
