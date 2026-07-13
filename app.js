"use strict";

const els = {
  chapterSelect: document.getElementById("chapter-select"),
  hardOnly: document.getElementById("hard-only"),
  summaryBtn: document.getElementById("summary-btn"),
  restartBtn: document.getElementById("restart-btn"),
  progress: document.getElementById("progress"),
  chapterLabel: document.getElementById("chapter-label"),
  score: document.getElementById("score"),
  quiz: document.getElementById("quiz"),
  question: document.getElementById("question"),
  choices: document.getElementById("choices"),
  explanation: document.getElementById("explanation"),
  results: document.getElementById("results"),
  resultsHeading: document.getElementById("results-heading"),
  resultsScore: document.getElementById("results-score"),
  resultsReview: document.getElementById("results-review"),
  reviewBtn: document.getElementById("review-btn"),
  restartChapterBtn: document.getElementById("restart-chapter-btn"),
  error: document.getElementById("error"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  finishBtn: document.getElementById("finish-btn"),
};

const STORAGE_KEY = "emr-mock-tester-answers-v1";
const HARD_ONLY_KEY = "emr-mock-tester-hardonly-v1";

// When true, the active pool is restricted to hard "gotcha" questions.
let hardOnly = false;

// All questions loaded from questions.json (unfiltered). Each is tagged with a
// stable _key derived from its content so answers can be tracked by identity
// (not by position in a shuffled array).
let allQuestions = [];
// The active quiz: the question objects currently being shown, in display order.
let questions = [];
let current = 0;

// The single source of truth for the user's answers: question _key -> the index
// of the choice they picked. Keyed by identity so it survives chapter switches,
// reshuffles, and page reloads (persisted to localStorage).
let answersByKey = new Map();

// Remembers the shuffled display order per chapter selection so switching away
// and back keeps both the order and the answers. Cleared by Restart.
const orderCache = new Map(); // selection value -> array of _key

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(answersByKey))
    );
  } catch (_e) {
    // Storage may be unavailable (private mode, file://, etc.) — ignore.
  }
}

// Restore saved answers, keeping only those whose question still exists and
// whose stored choice index is still valid for that question.
function loadPersisted() {
  answersByKey = new Map();
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (_e) {
    saved = {};
  }
  const byKey = new Map(allQuestions.map((q) => [q._key, q]));
  for (const [key, picked] of Object.entries(saved)) {
    const q = byKey.get(key);
    if (q && Number.isInteger(picked) && picked >= 0 && picked < q.choices.length) {
      answersByKey.set(key, picked);
    }
  }
}

function poolFor(value) {
  let pool =
    value === "all"
      ? allQuestions
      : allQuestions.filter((q) => String(q.chapter ?? 0) === value);
  if (hardOnly) pool = pool.filter((q) => q.difficulty === "hard");
  return pool;
}

// A helper to count the hard questions in a chapter selection, ignoring the
// active filter (used for the menu labels).
function hardCountFor(value) {
  const base =
    value === "all"
      ? allQuestions
      : allQuestions.filter((q) => String(q.chapter ?? 0) === value);
  return base.filter((q) => q.difficulty === "hard").length;
}

// The order cache is namespaced by the active filter so switching the filter
// on/off keeps a stable, independent shuffle for each mode.
function cacheKey() {
  return (hardOnly ? "hard|" : "all|") + els.chapterSelect.value;
}

function getPicked(q) {
  return answersByKey.has(q._key) ? answersByKey.get(q._key) : null;
}

// A selection is "complete" when every question in it has been answered.
function isSelectionComplete(value) {
  const pool = poolFor(value);
  return pool.length > 0 && pool.every((q) => answersByKey.has(q._key));
}

function showError(message) {
  els.quiz.hidden = true;
  els.results.hidden = true;
  els.prevBtn.hidden = true;
  els.nextBtn.hidden = true;
  els.finishBtn.hidden = true;
  els.summaryBtn.hidden = true;
  els.error.hidden = false;
  els.error.textContent = message;
}

function populateChapterMenu() {
  const chapters = new Map(); // chapter number -> { title, count }
  for (const q of allQuestions) {
    const key = q.chapter ?? 0;
    if (!chapters.has(key)) {
      chapters.set(key, {
        title: q.chapterTitle || (key ? `Chapter ${key}` : "Uncategorized"),
        count: 0,
      });
    }
    chapters.get(key).count += 1;
  }

  els.chapterSelect.replaceChildren();

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.dataset.base = "All chapters";
  allOpt.dataset.total = String(allQuestions.length);
  allOpt.dataset.hard = String(hardCountFor("all"));
  els.chapterSelect.appendChild(allOpt);

  for (const key of [...chapters.keys()].sort((a, b) => a - b)) {
    const { title, count } = chapters.get(key);
    const opt = document.createElement("option");
    opt.value = String(key);
    opt.dataset.base = key ? `Ch ${key}: ${title}` : title;
    opt.dataset.total = String(count);
    opt.dataset.hard = String(hardCountFor(opt.value));
    els.chapterSelect.appendChild(opt);
  }
  refreshChapterMenuMarks();
}

// Refresh each option's label to reflect the active filter's count and the
// user's completion, and disable chapters that have no hard questions while
// the "Hard only" filter is on.
function refreshChapterMenuMarks() {
  for (const opt of els.chapterSelect.options) {
    const count = hardOnly ? Number(opt.dataset.hard) : Number(opt.dataset.total);
    const done = isSelectionComplete(opt.value);
    const empty = hardOnly && count === 0;
    opt.disabled = empty;
    opt.textContent =
      (done ? "✓ " : "") + `${opt.dataset.base} (${empty ? "no hard Qs" : count})`;
  }
}

function setView(view) {
  const showResults = view === "results";
  els.quiz.hidden = showResults;
  els.results.hidden = !showResults;
  els.progress.hidden = showResults;
  els.chapterLabel.hidden = showResults;
  els.score.hidden = showResults;
  els.prevBtn.hidden = showResults;
  els.nextBtn.hidden = showResults;
  els.finishBtn.hidden = showResults;
  if (showResults) els.summaryBtn.hidden = true;
}

// Build the active quiz for the current selection. Reuses the cached shuffled
// order unless reshuffle is requested (so returning to a chapter is stable).
function buildQuiz(reshuffle) {
  const sel = els.chapterSelect.value;
  const pool = poolFor(sel);
  const ck = cacheKey();

  let ordered;
  if (!reshuffle && orderCache.has(ck)) {
    const byKey = new Map(pool.map((q) => [q._key, q]));
    ordered = orderCache.get(ck).map((k) => byKey.get(k)).filter(Boolean);
    if (ordered.length !== pool.length) ordered = shuffle([...pool]);
  } else {
    ordered = shuffle([...pool]);
  }
  orderCache.set(ck, ordered.map((q) => q._key));

  // Give each question a display order for its answer choices. It's shuffled
  // once so the options stay put while the user pages back and forth, and is
  // reshuffled on Restart. The stored answer stays an ORIGINAL choice index,
  // so scoring, persistence, and the review screen are unaffected. Questions
  // flagged fixedChoices (e.g. options like "Both a and c" or "All of the
  // above") keep their original order so the letter references stay correct.
  for (const q of ordered) {
    if (q.fixedChoices) {
      q._choiceOrder = q.choices.map((_, i) => i);
    } else if (reshuffle || !q._choiceOrder) {
      q._choiceOrder = shuffle(q.choices.map((_, i) => i));
    }
  }

  questions = ordered;
  current = 0;
  setView("quiz");
  render();
}

function render() {
  if (questions.length === 0) {
    els.progress.textContent = "";
    els.chapterLabel.textContent = "";
    els.score.replaceChildren();
    els.question.textContent = hardOnly
      ? "No hard questions in this chapter. Turn off “Hard only” or pick another chapter."
      : "No questions in this chapter yet.";
    els.choices.replaceChildren();
    els.explanation.hidden = true;
    els.prevBtn.disabled = true;
    els.nextBtn.hidden = false;
    els.nextBtn.disabled = true;
    els.finishBtn.hidden = true;
    els.summaryBtn.hidden = true;
    return;
  }

  const q = questions[current];
  const picked = getPicked(q);
  const answered = picked !== null;

  els.progress.textContent = `Question ${current + 1} of ${questions.length}`;
  els.chapterLabel.textContent = q.chapter
    ? `Chapter ${q.chapter}: ${q.chapterTitle || ""}`.trim()
    : "";

  let numAnswered = 0;
  let numCorrect = 0;
  for (const item of questions) {
    const p = getPicked(item);
    if (p !== null) {
      numAnswered++;
      if (p === item.answer) numCorrect++;
    }
  }
  els.score.replaceChildren();
  if (numAnswered > 0) {
    const tally = document.createElement("span");
    tally.textContent = `${numCorrect} / ${numAnswered} correct so far`;
    const pct = document.createElement("span");
    pct.className = "score-pct";
    pct.textContent = `${Math.round((numCorrect / numAnswered) * 100)}%`;
    els.score.append(tally, pct);
  }

  els.question.textContent = q.question;

  els.choices.replaceChildren();
  const order = q._choiceOrder || q.choices.map((_, i) => i);
  order.forEach((origIdx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = q.choices[origIdx];
    if (answered) {
      btn.disabled = true;
      if (origIdx === q.answer) btn.classList.add("correct");
      else if (origIdx === picked) btn.classList.add("incorrect");
    } else {
      btn.addEventListener("click", () => {
        answersByKey.set(q._key, origIdx);
        persist();
        refreshChapterMenuMarks();
        render();
      });
    }
    els.choices.appendChild(btn);
  });

  const showExplanation = answered && q.explanation;
  els.explanation.hidden = !showExplanation;
  els.explanation.textContent = showExplanation ? q.explanation : "";

  const isLast = current === questions.length - 1;
  els.prevBtn.disabled = current === 0;
  els.nextBtn.hidden = isLast;
  els.nextBtn.disabled = false;
  els.finishBtn.hidden = !isLast;
  els.summaryBtn.hidden = !isSelectionComplete(els.chapterSelect.value);
}

function showResults() {
  const total = questions.length;
  let numAnswered = 0;
  let numCorrect = 0;
  const missed = [];
  for (const q of questions) {
    const picked = getPicked(q);
    if (picked !== null) {
      numAnswered++;
      if (picked === q.answer) numCorrect++;
    }
    if (picked === null || picked !== q.answer) missed.push({ q, picked });
  }

  const selected = els.chapterSelect.value;
  els.resultsHeading.textContent =
    selected === "all" ? "You're done!" : "You're done with this chapter!";

  const pct = total > 0 ? Math.round((numCorrect / total) * 100) : 0;
  els.resultsScore.textContent = `Score: ${numCorrect} / ${total} (${pct}%)`;

  els.resultsReview.replaceChildren();

  if (numAnswered < total) {
    const note = document.createElement("p");
    note.className = "results-note";
    note.textContent = `You answered ${numAnswered} of ${total} questions. Unanswered questions are shown below.`;
    els.resultsReview.appendChild(note);
  }

  if (missed.length === 0) {
    const perfect = document.createElement("p");
    perfect.className = "review-line";
    perfect.textContent = `\u{1F389} Perfect — you got all ${total} correct!`;
    els.resultsReview.appendChild(perfect);
  } else {
    const heading = document.createElement("p");
    heading.className = "results-note";
    heading.textContent = "Questions to review:";
    els.resultsReview.appendChild(heading);

    for (const { q, picked } of missed) {
      const item = document.createElement("div");
      item.className = "review-item" + (picked === null ? " unanswered" : "");

      const qEl = document.createElement("p");
      qEl.className = "review-q";
      qEl.textContent = q.question;
      item.appendChild(qEl);

      const yours = document.createElement("p");
      yours.className = "review-line review-your";
      yours.textContent =
        picked === null
          ? "Your answer: (not answered)"
          : `Your answer: ${q.choices[picked]}`;
      item.appendChild(yours);

      const correct = document.createElement("p");
      correct.className = "review-line review-correct";
      correct.textContent = `Correct answer: ${q.choices[q.answer]}`;
      item.appendChild(correct);

      if (q.explanation) {
        const exp = document.createElement("p");
        exp.className = "review-explanation";
        exp.textContent = q.explanation;
        item.appendChild(exp);
      }

      els.resultsReview.appendChild(item);
    }
  }

  refreshChapterMenuMarks();
  setView("results");
}

// Clear the current selection's answers, reshuffle, and start over.
function restartSelection() {
  const sel = els.chapterSelect.value;
  for (const q of poolFor(sel)) answersByKey.delete(q._key);
  persist();
  orderCache.delete(cacheKey());
  refreshChapterMenuMarks();
  buildQuiz(true);
}

els.prevBtn.addEventListener("click", () => {
  current--;
  render();
});

els.nextBtn.addEventListener("click", () => {
  current++;
  render();
});

els.finishBtn.addEventListener("click", showResults);
els.summaryBtn.addEventListener("click", showResults);

// Return to the quiz view (answers preserved) to page through and review.
els.reviewBtn.addEventListener("click", () => {
  current = 0;
  setView("quiz");
  render();
});

els.restartChapterBtn.addEventListener("click", restartSelection);
els.restartBtn.addEventListener("click", restartSelection);
els.chapterSelect.addEventListener("change", () => buildQuiz(false));

els.hardOnly.addEventListener("change", () => {
  hardOnly = els.hardOnly.checked;
  try {
    localStorage.setItem(HARD_ONLY_KEY, hardOnly ? "1" : "0");
  } catch (_e) {
    // Storage may be unavailable — ignore.
  }
  refreshChapterMenuMarks();
  buildQuiz(false);
});

async function init() {
  let data;
  try {
    const res = await fetch("questions.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    showError(
      "Could not load questions.json. If you opened this file directly, " +
        "serve it over HTTP instead — e.g. run \"python3 -m http.server\" " +
        `in this folder and visit http://localhost:8000. (${err.message})`
    );
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    showError("questions.json must be a non-empty JSON array of questions.");
    return;
  }

  allQuestions = data;
  allQuestions.forEach((q) => {
    q._key = `${q.chapter ?? 0}|${q.question}`;
  });
  try {
    hardOnly = localStorage.getItem(HARD_ONLY_KEY) === "1";
  } catch (_e) {
    hardOnly = false;
  }
  els.hardOnly.checked = hardOnly;
  loadPersisted();
  populateChapterMenu();
  buildQuiz(false);
}

init();
