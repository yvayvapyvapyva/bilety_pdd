const API_BASE_URL = "https://functions.yandexcloud.net/d4edbj3nk4e2tporn3qk";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  ticket: null,
  questions: [],
  pos: 0,
  answered: false,
  cur: null,
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
  $("#btn-next").classList.add("hidden");
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
  state.pos = 0;
  state.answered = false;
  state.correct = 0;
  showScreen("quiz");
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.pos];
  state.answered = false;
  state.cur = q;

  $("#quiz-title").textContent = `Билет ${state.ticket}`;
  $("#quiz-counter").textContent =
    `Вопрос ${state.pos + 1}/${state.questions.length}`;
  $("#quiz-progress").style.width =
    `${((state.pos + 0.5) / state.questions.length) * 100}%`;

  $("#quiz-question").innerHTML = escapeHtml(q.data.q);

  const imgWrap = $("#quiz-image-wrap");
  if (q.image) {
    imgWrap.classList.remove("hidden");
    imgWrap.innerHTML = `<img src="${imageDataUri(q.image)}" alt="">`;
  } else {
    imgWrap.classList.add("hidden");
    imgWrap.innerHTML = "";
  }

  $("#quiz-tip").classList.add("hidden");
  $("#btn-next").classList.add("hidden");

  const cbox = $("#quiz-comment-box");
  cbox.classList.add("hidden");
  if (q.comment) {
    $("#btn-comment").classList.remove("hidden");
    cbox.innerHTML = renderTip(q.comment);
  } else {
    $("#btn-comment").classList.add("hidden");
    cbox.innerHTML = "";
  }

  const box = $("#quiz-answers");
  box.innerHTML = "";
  q.data.a.forEach((_a, i) => {
    const btn = document.createElement("button");
    btn.className = "answer";
    btn.innerHTML = `<span>${escapeHtml(q.data.a[i])}</span>`;
    btn.addEventListener("click", () => chooseAnswer(i));
    box.appendChild(btn);
  });
  window.scrollTo(0, 0);
}

function chooseAnswer(i) {
  if (state.answered) return;
  state.answered = true;

  const q = state.cur;
  const btns = $$("#quiz-answers .answer");

  if (i === q.data.correct) {
    btns[i].classList.add("correct");
    state.correct++;
  } else {
    btns[i].classList.add("wrong");
    btns[q.data.correct].classList.add("correct");
  }

  const tip = $("#quiz-tip");
  tip.innerHTML = renderTip(q.data.tip);
  tip.classList.remove("hidden");

  const last = state.pos + 1 >= state.questions.length;
  const nxt = $("#btn-next");
  nxt.classList.remove("hidden");
  nxt.textContent = last ? "Показать результат" : "Далее ▶";
  $("#quiz-progress").style.width =
    `${((state.pos + 1) / state.questions.length) * 100}%`;
}

$("#btn-next").addEventListener("click", () => {
  state.pos++;
  if (state.pos >= state.questions.length) showResult();
  else renderQuestion();
});

$("#btn-back").addEventListener("click", () => showScreen("tickets"));

$("#btn-comment").addEventListener("click", () => {
  const box = $("#quiz-comment-box");
  box.classList.toggle("hidden");
});

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