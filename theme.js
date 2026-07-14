"use strict";

// Theme cycling for the navbar button. The inline boot script in each page's
// <head> already applied the saved theme before first paint; this just keeps
// the button label in sync and persists changes.
(() => {
  const KEY = "emr-theme-v1";
  const THEMES = [
    { id: "light", icon: "☀️", label: "Light" },
    { id: "dark", icon: "🌙", label: "Dark" },
    { id: "grey", icon: "◐", label: "Grey" },
  ];

  const btn = document.getElementById("theme-btn");
  if (!btn) return;

  function current() {
    return THEMES.find((t) => t.id === document.documentElement.dataset.theme) || THEMES[0];
  }

  function renderBtn() {
    const t = current();
    btn.textContent = `${t.icon} ${t.label}`;
  }

  btn.addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(current()) + 1) % THEMES.length];
    document.documentElement.dataset.theme = next.id;
    try {
      localStorage.setItem(KEY, next.id);
    } catch (_e) {
      // Storage unavailable — theme still applies for this page view.
    }
    renderBtn();
  });

  renderBtn();
})();
