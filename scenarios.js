"use strict";

const els = {
  categorySelect: document.getElementById("category-select"),
  scenarioSelect: document.getElementById("scenario-select"),
  randomBtn: document.getElementById("random-btn"),
  timerBtn: document.getElementById("timer-btn"),
  progressChip: document.getElementById("progress-chip"),
  revealAllBtn: document.getElementById("reveal-all-btn"),
  hideAllBtn: document.getElementById("hide-all-btn"),
  scenario: document.getElementById("scenario"),
  title: document.getElementById("scenario-title"),
  badges: document.getElementById("scenario-badges"),
  doneBtn: document.getElementById("done-btn"),
  dispatchText: document.getElementById("dispatch-text"),
  phases: document.getElementById("phases"),
  moderatorSections: document.getElementById("moderator-sections"),
  error: document.getElementById("error"),
};

const DONE_KEY = "emr-scenarios-done-v1";

let scenarios = [];
let current = null;

// Which of the current scenario's assessment sections have been disclosed to
// the responder. Once revealed, a section stays checked even if re-collapsed —
// it doubles as a record of what was covered. Reset on scenario change.
let revealedKeys = new Set();
let assessmentDetails = []; // the six <details> counted in the progress chip

// Scenarios the group has already run (persisted across reloads).
let doneIds = new Set();

function loadDone() {
  try {
    const saved = JSON.parse(localStorage.getItem(DONE_KEY) || "[]");
    if (Array.isArray(saved)) doneIds = new Set(saved);
  } catch (_e) {
    doneIds = new Set();
  }
}

function persistDone() {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...doneIds]));
  } catch (_e) {
    // Storage may be unavailable (private mode, file://, etc.) — ignore.
  }
}

// ---- Drill timer -----------------------------------------------------------

let timerRunning = false;
let timerAccumMs = 0;
let timerStartedAt = 0;
let timerInterval = null;

function timerElapsedMs() {
  return timerAccumMs + (timerRunning ? Date.now() - timerStartedAt : 0);
}

function renderTimer() {
  const total = Math.floor(timerElapsedMs() / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  els.timerBtn.textContent = `${timerRunning ? "⏸" : "⏱"} ${mm}:${ss}`;
  els.timerBtn.classList.toggle("chip-active", timerRunning);
}

function toggleTimer() {
  if (timerRunning) {
    timerAccumMs = timerElapsedMs();
    timerRunning = false;
    clearInterval(timerInterval);
  } else {
    timerRunning = true;
    timerStartedAt = Date.now();
    timerInterval = setInterval(renderTimer, 1000);
  }
  renderTimer();
}

function resetTimer() {
  timerRunning = false;
  timerAccumMs = 0;
  clearInterval(timerInterval);
  renderTimer();
}

// ---- Scenario selection ----------------------------------------------------

function pool() {
  const cat = els.categorySelect.value;
  return cat === "all" ? scenarios : scenarios.filter((s) => s.category === cat);
}

const TIERS = [
  { id: "easy", emoji: "🟢", label: "Easy" },
  { id: "medium", emoji: "🟡", label: "Medium" },
  { id: "hard", emoji: "🔴", label: "Hard" },
];

function populateScenarioMenu() {
  els.scenarioSelect.replaceChildren();
  const p = pool();
  for (const tier of TIERS) {
    const inTier = p.filter((s) => s.difficulty === tier.id);
    if (inTier.length === 0) continue;
    const group = document.createElement("optgroup");
    group.label = `${tier.emoji} ${tier.label}`;
    for (const s of inTier) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = (doneIds.has(s.id) ? "✓ " : "") + s.title;
      group.appendChild(opt);
    }
    els.scenarioSelect.appendChild(group);
  }
  if (current) els.scenarioSelect.value = current.id;
}

function showError(message) {
  els.scenario.hidden = true;
  els.error.hidden = false;
  els.error.textContent = message;
}

// ---- Section bodies --------------------------------------------------------

// True for mnemonic keys like "S" or "O (daughter)" that get a letter chip.
function chipParts(key) {
  const m = key.match(/^([A-Za-z])(\s*\(.*\))?$/);
  return m ? { letter: m[1].toUpperCase(), rest: (m[2] || "").trim() } : null;
}

// Ordered { label: value } map as labeled rows; mnemonic-letter keys get a
// leading circular chip (SAMPLE / OPQRST), other keys a plain bold label.
function kvBody(map, { chips = false } = {}) {
  const div = document.createElement("div");
  div.className = "section-body";
  for (const [k, v] of Object.entries(map)) {
    const row = document.createElement("p");
    const parts = chips ? chipParts(k) : null;
    if (parts) {
      row.className = "kv-row chip-row";
      const chip = document.createElement("span");
      chip.className = "letter-chip";
      chip.textContent = parts.letter;
      row.appendChild(chip);
      if (parts.rest) {
        const rest = document.createElement("span");
        rest.className = "chip-rest";
        rest.textContent = parts.rest;
        row.appendChild(rest);
      }
      row.appendChild(document.createTextNode(" " + v));
    } else {
      row.className = "kv-row";
      const key = document.createElement("span");
      key.className = "kv-key";
      key.textContent = k;
      row.append(key, document.createTextNode(" " + v));
    }
    div.appendChild(row);
  }
  return div;
}

// Vitals as a scannable grid of quiet stat tiles. Long narrative values get a
// full-width tile so the grid doesn't stretch its neighbours.
function vitalsBody(map) {
  const div = document.createElement("div");
  div.className = "section-body";
  const grid = document.createElement("div");
  grid.className = "vitals-grid";
  for (const [k, v] of Object.entries(map)) {
    const tile = document.createElement("div");
    tile.className = "vital-tile" + (v.length > 70 ? " vital-tile--wide" : "");
    const label = document.createElement("p");
    label.className = "vital-label";
    label.textContent = k;
    const value = document.createElement("p");
    value.className = "vital-value";
    value.textContent = v;
    tile.append(label, value);
    grid.appendChild(tile);
  }
  div.appendChild(grid);
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
  const rows = { "When": iv.trigger, "Then": iv.result };
  if (iv.ifNot) rows["If not done"] = iv.ifNot;
  return kvBody(rows);
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

// ---- Reveal sections & progress --------------------------------------------

// A collapsible reveal. `key` (when given) enrols it in the assessment
// progress checklist: first open marks it revealed for good.
function makeReveal(label, bodyEl, key) {
  const details = document.createElement("details");
  details.className = "reveal";
  const summary = document.createElement("summary");
  const text = document.createElement("span");
  text.className = "reveal-label";
  text.textContent = label;
  const mark = document.createElement("span");
  mark.className = "reveal-mark";
  summary.append(text, mark);
  details.append(summary, bodyEl);
  if (key) {
    details.dataset.key = key;
    details.addEventListener("toggle", () => {
      if (details.open && !revealedKeys.has(key)) {
        revealedKeys.add(key);
        renderProgress();
      }
    });
  }
  return details;
}

function renderProgress() {
  for (const d of assessmentDetails) {
    const done = revealedKeys.has(d.dataset.key);
    d.querySelector(".reveal-mark").textContent = done ? "✓" : "";
    d.classList.toggle("revealed", done);
  }
  els.progressChip.textContent = `${revealedKeys.size}/${assessmentDetails.length} revealed`;
  els.progressChip.classList.toggle(
    "chip-complete",
    assessmentDetails.length > 0 && revealedKeys.size === assessmentDetails.length
  );
}

function makePhase(number, revealEls) {
  const phase = document.createElement("div");
  phase.className = "phase";
  const num = document.createElement("span");
  num.className = "phase-num";
  num.textContent = String(number);
  const content = document.createElement("div");
  content.className = "phase-content";
  content.append(...revealEls);
  phase.append(num, content);
  return phase;
}

function renderDoneBtn() {
  const done = current && doneIds.has(current.id);
  els.doneBtn.textContent = done ? "✓ Run" : "Mark as run";
  els.doneBtn.classList.toggle("done", !!done);
}

// ---- Rendering -------------------------------------------------------------

function render(s) {
  current = s;
  els.scenarioSelect.value = s.id;
  revealedKeys = new Set();
  resetTimer();

  els.title.textContent = s.title;
  els.badges.replaceChildren();
  const cat = document.createElement("span");
  cat.className = "badge badge-" + s.category;
  cat.textContent = s.category;
  els.badges.appendChild(cat);
  const tier = TIERS.find((t) => t.id === s.difficulty);
  if (tier) {
    const diff = document.createElement("span");
    diff.className = "badge badge-" + tier.id;
    diff.textContent = `${tier.emoji} ${tier.id}`;
    els.badges.appendChild(diff);
  }
  renderDoneBtn();

  els.dispatchText.textContent = s.dispatch;

  const scene = makeReveal("Scene assessment", kvBody(s.scene), "scene");
  const primary = makeReveal("Primary assessment", kvBody(s.primary), "primary");
  const secondaryTitle = document.createElement("p");
  secondaryTitle.className = "phase-title";
  secondaryTitle.textContent = "Secondary assessment";
  const vitals = makeReveal("Vitals", vitalsBody(s.vitals), "vitals");
  const sample = makeReveal("SAMPLE", kvBody(s.sample, { chips: true }), "sample");
  const opqrst = makeReveal(
    "OPQRST",
    s.opqrst
      ? kvBody(s.opqrst, { chips: true })
      : textBody("N/A — no pain complaint (or patient can't answer)."),
    "opqrst"
  );
  const headToToe = makeReveal("Head-to-toe", textBody(s.secondary), "headToToe");

  assessmentDetails = [scene, primary, vitals, sample, opqrst, headToToe];

  els.phases.replaceChildren(
    makePhase(1, [scene]),
    makePhase(2, [primary]),
    makePhase(3, [secondaryTitle, vitals, sample, opqrst, headToToe])
  );

  els.moderatorSections.replaceChildren();
  if (s.intervention) {
    els.moderatorSections.appendChild(
      makeReveal("After intervention", interventionBody(s.intervention))
    );
  }
  els.moderatorSections.appendChild(makeReveal("Debrief", debriefBody(s)));

  renderProgress();
  els.scenario.hidden = false;
  window.scrollTo({ top: 0 });
}

function setAll(open) {
  for (const d of els.scenario.querySelectorAll("details")) d.open = open;
}

function randomScenario() {
  const p = pool();
  if (p.length === 0) return;
  // Avoid dealing the same scenario twice in a row when there's a choice.
  const candidates = p.length > 1 ? p.filter((s) => s !== current) : p;
  render(candidates[Math.floor(Math.random() * candidates.length)]);
}

// ---- Events ----------------------------------------------------------------

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
els.timerBtn.addEventListener("click", toggleTimer);

els.doneBtn.addEventListener("click", () => {
  if (!current) return;
  if (doneIds.has(current.id)) doneIds.delete(current.id);
  else doneIds.add(current.id);
  persistDone();
  renderDoneBtn();
  populateScenarioMenu();
});

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
  loadDone();
  renderTimer();
  populateScenarioMenu();
  randomScenario();
}

init();
