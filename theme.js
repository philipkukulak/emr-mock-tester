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

// Auto-hiding navbar: slides away while scrolling down (it otherwise covers
// content on small screens) and returns on any scroll up or near the top.
(() => {
  const navbar = document.querySelector(".navbar");
  if (!navbar) return;

  const THRESHOLD = 8; // ignore sub-pixel/momentum jitter
  let lastY = window.scrollY;
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const delta = y - lastY;
    if (y <= navbar.offsetHeight) {
      navbar.classList.remove("navbar-hidden");
      lastY = y;
    } else if (Math.abs(delta) > THRESHOLD) {
      navbar.classList.toggle("navbar-hidden", delta > 0);
      lastY = y;
    }
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );
})();
