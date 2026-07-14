"use strict";

const els = {
  categorySelect: document.getElementById("category-select"),
  scenarioSelect: document.getElementById("scenario-select"),
  randomBtn: document.getElementById("random-btn"),
  scenario: document.getElementById("scenario"),
  title: document.getElementById("scenario-title"),
  badges: document.getElementById("scenario-badges"),
  dispatchText: document.getElementById("dispatch-text"),
  revealAllBtn: document.getElementById("reveal-all-btn"),
  hideAllBtn: document.getElementById("hide-all-btn"),
  sections: document.getElementById("sections"),
  error: document.getElementById("error"),
};

let scenarios = [];
let current = null;

function pool() {
  const cat = els.categorySelect.value;
  return cat === "all" ? scenarios : scenarios.filter((s) => s.category === cat);
}

function populateScenarioMenu() {
  els.scenarioSelect.replaceChildren();
  for (const s of pool()) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent =
      s.title + (s.difficulty === "tricky" ? " ⚠" : "");
    els.scenarioSelect.appendChild(opt);
  }
}

function showError(message) {
  els.scenario.hidden = true;
  els.error.hidden = false;
  els.error.textContent = message;
}

// ---- Section builders ----------------------------------------------------

// A collapsible reveal section. Native <details> keeps the open/closed state
// in the DOM so "Reveal all" / "Hide all" can just flip the attribute.
function makeSection(label, bodyEl) {
  const details = document.createElement("details");
  details.className = "section";
  const summary = document.createElement("summary");
  summary.textContent = label;
  details.append(summary, bodyEl);
  return details;
}

// Renders an ordered { label: value } map as rows. Every findings section
// uses this, so scenarios can add or omit rows freely.
function kvBody(map) {
  const div = document.createElement("div");
  div.className = "section-body";
  for (const [k, v] of Object.entries(map)) {
    const row = document.createElement("p");
    row.className = "kv-row";
    const key = document.createElement("span");
    key.className = "kv-key";
    key.textContent = k;
    row.append(key, document.createTextNode(" " + v));
    div.appendChild(row);
  }
  return div;
}

function textBody(text) {
  const div = document.createElement("div");
  div.className = "section-body";
  const p = document.createElement("p");
  p.textContent = text;
  div.appendChild(p);
  return div;
}

function listBlock(container, heading, items) {
  if (!items || items.length === 0) return;
  const h = document.createElement("p");
  h.className = "kv-key";
  h.textContent = heading;
  container.appendChild(h);
  const ul = document.createElement("ul");
  ul.className = "debrief-list";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

function interventionBody(iv) {
  const div = document.createElement("div");
  div.className = "section-body";
  const rows = { "When": iv.trigger, "Then": iv.result };
  if (iv.ifNot) rows["If not done"] = iv.ifNot;
  for (const [k, v] of Object.entries(rows)) {
    const row = document.createElement("p");
    row.className = "kv-row";
    const key = document.createElement("span");
    key.className = "kv-key";
    key.textContent = k;
    row.append(key, document.createTextNode(" " + v));
    div.appendChild(row);
  }
  return div;
}

function debriefBody(s) {
  const div = document.createElement("div");
  div.className = "section-body";
  if (s.hook) {
    const hook = document.createElement("p");
    hook.className = "debrief-hook";
    hook.textContent = s.hook;
    div.appendChild(hook);
  }
  if (s.debrief.diagnosis) {
    const dx = document.createElement("p");
    dx.className = "kv-row";
    const key = document.createElement("span");
    key.className = "kv-key";
    key.textContent = "What it was";
    dx.append(key, document.createTextNode(" " + s.debrief.diagnosis));
    div.appendChild(dx);
  }
  listBlock(div, "Expected actions", s.debrief.expectedActions);
  listBlock(div, "Teaching points", s.debrief.teachingPoints);
  return div;
}

// ---- Rendering -------------------------------------------------------------

function render(s) {
  current = s;
  els.scenarioSelect.value = s.id;

  els.title.textContent = s.title;
  els.badges.replaceChildren();
  const cat = document.createElement("span");
  cat.className = "badge badge-" + s.category;
  cat.textContent = s.category;
  els.badges.appendChild(cat);
  if (s.difficulty === "tricky") {
    const tricky = document.createElement("span");
    tricky.className = "badge badge-tricky";
    tricky.textContent = "tricky";
    els.badges.appendChild(tricky);
  }

  els.dispatchText.textContent = s.dispatch;

  els.sections.replaceChildren();
  els.sections.append(
    makeSection("Scene assessment", kvBody(s.scene)),
    makeSection("Primary assessment", kvBody(s.primary)),
    makeSection("Vitals", kvBody(s.vitals)),
    makeSection("SAMPLE", kvBody(s.sample)),
    makeSection(
      "OPQRST",
      s.opqrst
        ? kvBody(s.opqrst)
        : textBody("N/A — no pain complaint (or patient can't answer).")
    ),
    makeSection("Secondary / head-to-toe", textBody(s.secondary))
  );
  if (s.intervention) {
    els.sections.appendChild(
      makeSection("After intervention", interventionBody(s.intervention))
    );
  }
  els.sections.appendChild(makeSection("Debrief", debriefBody(s)));

  els.scenario.hidden = false;
  window.scrollTo({ top: 0 });
}

function setAll(open) {
  for (const d of els.sections.querySelectorAll("details")) d.open = open;
}

function randomScenario() {
  const p = pool();
  if (p.length === 0) return;
  // Avoid dealing the same scenario twice in a row when there's a choice.
  const candidates = p.length > 1 ? p.filter((s) => s !== current) : p;
  render(candidates[Math.floor(Math.random() * candidates.length)]);
}

els.randomBtn.addEventListener("click", randomScenario);

els.scenarioSelect.addEventListener("change", () => {
  const s = scenarios.find((x) => x.id === els.scenarioSelect.value);
  if (s) render(s);
});

els.categorySelect.addEventListener("change", () => {
  populateScenarioMenu();
  randomScenario();
});

els.revealAllBtn.addEventListener("click", () => setAll(true));
els.hideAllBtn.addEventListener("click", () => setAll(false));

async function init() {
  let data;
  try {
    const res = await fetch("scenarios.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    showError(
      "Could not load scenarios.json. If you opened this file directly, " +
        "serve it over HTTP instead — e.g. run \"python3 -m http.server\" " +
        `in this folder and visit http://localhost:8000/scenarios.html. (${err.message})`
    );
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    showError("scenarios.json must be a non-empty JSON array of scenarios.");
    return;
  }

  scenarios = data;
  populateScenarioMenu();
  randomScenario();
}

init();
