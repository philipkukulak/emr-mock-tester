"use strict";

// Light/dark toggle for the navbar switch. The inline boot script in each
// page's <head> already applied the saved theme before first paint; this
// keeps the switch state in sync and persists changes.
(() => {
  const KEY = "emr-theme-v1";

  const btn = document.getElementById("theme-btn");
  if (!btn) return;

  function isDark() {
    return document.documentElement.dataset.theme === "dark";
  }

  function renderBtn() {
    btn.setAttribute("aria-checked", String(isDark()));
  }

  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch (_e) {
      // Storage unavailable — theme still applies for this page view.
    }
    renderBtn();
  });

  renderBtn();
})();
