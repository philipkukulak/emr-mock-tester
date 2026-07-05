"use strict";

const els = {
  progress: document.getElementById("progress"),
  score: document.getElementById("score"),
  quiz: document.getElementById("quiz"),
  question: document.getElementById("question"),
  choices: document.getElementById("choices"),
  explanation: document.getElementById("explanation"),
  error: document.getElementById("error"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
};

let questions = [];
let current = 0;
// answers[i] = index the user picked for question i, or null if unanswered
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

function render() {
  const q = questions[current];
  const picked = answers[current];
  const answered = picked !== null;

  els.progress.textContent = `Question ${current + 1} of ${questions.length}`;
  els.question.textContent = q.question;

  const numAnswered = answers.filter((a) => a !== null).length;
  const numCorrect = answers.filter(
    (a, i) => a !== null && a === questions[i].answer
  ).length;
  els.score.textContent =
    numAnswered > 0 ? `${numCorrect} / ${numAnswered} correct so far` : "";

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

  questions = shuffle(data);
  answers = new Array(questions.length).fill(null);
  render();
}

init();
