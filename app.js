"use strict";

const els = {
  chapterSelect: document.getElementById("chapter-select"),
  restartBtn: document.getElementById("restart-btn"),
  progress: document.getElementById("progress"),
  chapterLabel: document.getElementById("chapter-label"),
  score: document.getElementById("score"),
  quiz: document.getElementById("quiz"),
  question: document.getElementById("question"),
  choices: document.getElementById("choices"),
  explanation: document.getElementById("explanation"),
  error: document.getElementById("error"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
};

// All questions loaded from questions.json (unfiltered).
let allQuestions = [];
// The active quiz: questions currently being shown (filtered + shuffled).
let questions = [];
let current = 0;
// answers[i] = index the user picked for question i, or null if unanswered.
let answers = [];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showError(message) {
  els.quiz.hidden = true;
  els.prevBtn.hidden = true;
  els.nextBtn.hidden = true;
  els.error.hidden = false;
  els.error.textContent = message;
}

// Build the chapter dropdown from the questions that were loaded. A question
// without a "chapter" field still works; it's grouped under "Uncategorized".
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
  allOpt.textContent = `All chapters (${allQuestions.length} questions)`;
  els.chapterSelect.appendChild(allOpt);

  for (const key of [...chapters.keys()].sort((a, b) => a - b)) {
    const { title, count } = chapters.get(key);
    const opt = document.createElement("option");
    opt.value = String(key);
    const label = key ? `Ch ${key}: ${title}` : title;
    opt.textContent = `${label} (${count})`;
    els.chapterSelect.appendChild(opt);
  }
}

// Rebuild the active quiz based on the selected chapter, then reshuffle.
function startQuiz() {
  const selected = els.chapterSelect.value;
  const pool =
    selected === "all"
      ? allQuestions
      : allQuestions.filter((q) => String(q.chapter ?? 0) === selected);

  questions = shuffle([...pool]);
  answers = new Array(questions.length).fill(null);
  current = 0;
  render();
}

function render() {
  if (questions.length === 0) {
    els.progress.textContent = "";
    els.chapterLabel.textContent = "";
    els.score.textContent = "";
    els.question.textContent = "No questions in this chapter yet.";
    els.choices.replaceChildren();
    els.explanation.hidden = true;
    els.prevBtn.disabled = true;
    els.nextBtn.disabled = true;
    return;
  }

  const q = questions[current];
  const picked = answers[current];
  const answered = picked !== null;

  els.progress.textContent = `Question ${current + 1} of ${questions.length}`;
  els.chapterLabel.textContent = q.chapter
    ? `Chapter ${q.chapter}: ${q.chapterTitle || ""}`.trim()
    : "";

  const numAnswered = answers.filter((a) => a !== null).length;
  const numCorrect = answers.filter(
    (a, i) => a !== null && a === questions[i].answer
  ).length;
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
  q.choices.forEach((choice, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = choice;
    if (answered) {
      btn.disabled = true;
      if (i === q.answer) btn.classList.add("correct");
      else if (i === picked) btn.classList.add("incorrect");
    } else {
      btn.addEventListener("click", () => {
        answers[current] = i;
        render();
      });
    }
    els.choices.appendChild(btn);
  });

  const showExplanation = answered && q.explanation;
  els.explanation.hidden = !showExplanation;
  els.explanation.textContent = showExplanation ? q.explanation : "";

  els.prevBtn.disabled = current === 0;
  els.nextBtn.disabled = current === questions.length - 1;
}

els.prevBtn.addEventListener("click", () => {
  current--;
  render();
});

els.nextBtn.addEventListener("click", () => {
  current++;
  render();
});

els.chapterSelect.addEventListener("change", startQuiz);
els.restartBtn.addEventListener("click", startQuiz);

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
  populateChapterMenu();
  startQuiz();
}

init();
