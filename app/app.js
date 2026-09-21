const API_BASE_URL = "https://functions.yandexcloud.net/d4edbj3nk4e2tporn3qk";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  ticket: null,
  questions: [],
  answered: new Set(),
  correct: 0,
};

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTip(tip) {
  const parts = escapeHtml(tip).split("**");
  return parts
    .map((p, i) => (i % 2 === 1 ? `<b>${p}</b>` : p))
    .join("");
}

function imageDataUri(base64) {
  let mime = "image/jpeg";
  if (base64.startsWith("UklGR")) mime = "image/webp";
  else if (base64.startsWith("iVBOR")) mime = "image/png";
  else if (base64.startsWith("R0lG")) mime = "image/gif";
  return `data:${mime};base64,${base64}`;
}

function showScreen(name) {
  $$(".screen").forEach((el) => el.classList.add("hidden"));
  $(`#screen-${name}`).classList.remove("hidden");
}

function renderTicketGrid() {
  const grid = $("#ticket-grid");
  grid.innerHTML = "";
  for (let i = 1; i <= 40; i++) {
    const b = document.createElement("button");
    b.className = "ticket-btn";
    b.textContent = i;
    b.addEventListener("click", () => startTicket(i));
    grid.appendChild(b);
  }
}

async function startTicket(num) {
  try {
    const r = await fetch(`${API_BASE_URL}?ticket=${num}`, { method: "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Ошибка");
    state.ticket = num;
    state.questions = data.questions;
  } catch (e) {
    $("#loading-note").textContent = `Не удалось загрузить билет ${num}.`;
    showScreen("tickets");
    return;
  }
  state.answered = new Set();
  state.correct = 0;
  showScreen("quiz");
  renderList();
  updateProgress();
}

function updateProgress() {
  const n = state.questions.length;
  $("#quiz-title").textContent = `Билет ${state.ticket}`;
  $("#quiz-counter").textContent = `Отвечено ${state.answered.size}/${n}`;
  $("#quiz-progress").style.width = `${(state.answered.size / n) * 100}%`;
}

function renderList() {
  const list = $("#quiz-list");
  list.innerHTML = "";
  state.questions.forEach((q) => list.appendChild(buildCard(q)));
  window.scrollTo(0, 0);
}

function buildCard(q) {
  const card = document.createElement("div");
  card.className = "qcard";

  const head = document.createElement("div");
  head.className = "qcard-head";
  head.textContent = "Вопрос " + q.n;
  card.appendChild(head);

  if (q.image) {
    const img = document.createElement("img");
    img.className = "qcard-img";
    img.src = imageDataUri(q.image);
    card.appendChild(img);
  }

  const qt = document.createElement("div");
  qt.className = "qcard-q";
  qt.innerHTML = escapeHtml(q.data.q);
  card.appendChild(qt);

  const tip = document.createElement("div");
  tip.className = "quiz-tip hidden";
  tip.innerHTML = renderTip(q.data.tip);

  const ansBox = document.createElement("div");
  ansBox.className = "answers";
  q.data.a.forEach((_t, idx) => {
    const b = document.createElement("button");
    b.className = "answer";
    b.innerHTML = `<span>${escapeHtml(q.data.a[idx])}</span>`;
    b.addEventListener("click", () => chooseAnswer(q, idx, ansBox, tip));
    ansBox.appendChild(b);
  });
  card.appendChild(ansBox);
  card.appendChild(tip);

  if (q.comment) {
    const cb = document.createElement("button");
    cb.className = "comment-btn";
    cb.textContent = "Комментарий";
    card.appendChild(cb);

    const cbox = document.createElement("div");
    cbox.className = "quiz-tip hidden";
    cbox.innerHTML = renderTip(q.comment);
    card.appendChild(cbox);

    cb.addEventListener("click", () => cbox.classList.toggle("hidden"));
  }

  return card;
}

function chooseAnswer(q, idx, ansBox, tip) {
  if (state.answered.has(q.n)) return;
  state.answered.add(q.n);

  const btns = ansBox.querySelectorAll(".answer");
  if (idx === q.data.correct) {
    btns[idx].classList.add("correct");
    state.correct++;
  } else {
    btns[idx].classList.add("wrong");
    btns[q.data.correct].classList.add("correct");
  }
  btns.forEach((b) => (b.disabled = true));

  tip.classList.remove("hidden");
  updateProgress();
}

$("#btn-back").addEventListener("click", () => showScreen("tickets"));

$("#btn-result").addEventListener("click", showResult);

function showResult() {
  const total = state.questions.length;
  const pct = Math.round((state.correct / total) * 100);
  const passed = pct >= 90;

  const card = $("#result-card");
  card.innerHTML =
    `<div class="emoji">${passed ? "🎉" : "📚"}</div>` +
    `<h2>Билет ${state.ticket}</h2>` +
    `<div class="result-stats">` +
    `<div><span class="num ok">${state.correct}</span><span class="lbl">верно</span></div>` +
    `<div><span class="num bad">${total - state.correct}</span><span class="lbl">неверно</span></div>` +
    `<div><span class="num">${pct}%</span><span class="lbl">точность</span></div>` +
    `</div>` +
    `<div class="result-actions">` +
    `<button class="primary" id="btn-retry">Пройти ещё раз</button>` +
    `<button class="secondary" id="btn-back2">К выбору билета</button>` +
    `</div>`;

  showScreen("result");
  $("#btn-retry").addEventListener("click", () => startTicket(state.ticket));
  $("#btn-back2").addEventListener("click", () => showScreen("tickets"));
}

$("#loading-note").textContent = "Выберите билет:";
renderTicketGrid();