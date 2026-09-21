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

function tgFullscreen() {
  try {
    if (!window.Telegram || !Telegram.WebApp) return;
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
    Telegram.WebApp.setHeaderColor("#0b0e17");
    Telegram.WebApp.setBackgroundColor("#0b0e17");
    if (Telegram.WebApp.requestFullscreen) Telegram.WebApp.requestFullscreen();
  } catch (e) {}
}

function showLoading(show, msg) {
  const overlay = $("#loading-overlay");
  overlay.hidden = !show;
  if (msg) overlay.querySelector("span").textContent = msg;
}

function showScreen(name) {
  $$(".screen").forEach((el) => el.classList.add("hidden"));
  $(`#screen-${name}`).classList.remove("hidden");
}

async function startTicket(num) {
  showLoading(true, "Загрузка билета " + num + "…");
  try {
    const r = await fetch(`${API_BASE_URL}?ticket=${num}`, { method: "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Ошибка");
    state.ticket = num;
    state.questions = data.questions;
  } catch (e) {
    showLoading(false);
    $("#loading-note").textContent = `Не удалось загрузить билет ${num}.`;
    showScreen("tickets");
    return;
  }
  state.answered = new Set();
  state.correct = 0;
  showScreen("quiz");
  renderList();
  updateProgress();
  showLoading(false);
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

function linkInfo(url) {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be"))
    return { kind: "youtube", name: "YouTube" };
  if (u.includes("instagram.com") || u.includes("instagr.am"))
    return { kind: "instagram", name: "Instagram" };
  return { kind: "link", name: "Ссылка" };
}

function parseLinks(text) {
  const links = [];
  const cleaned = [];
  const re = /https?:\/\/[^\s|]+/gi;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    cleaned.push(text.slice(last, m.index));
    const url = m[0];
    links.push({ url });
    let end = m.index + m[0].length;
    const right = text.slice(end).match(/^\s*\|\s*[^\n]*/);
    if (right) end += right[0].length;
    last = end;
    re.lastIndex = end;
  }
  cleaned.push(text.slice(last));
  return {
    text: cleaned.join("").replace(/\n{2,}/g, "\n").trim(),
    links,
  };
}

function openCommentLink(url) {
  const tg = window.Telegram && Telegram.WebApp;
  if (tg && tg.openLink) {
    tg.openLink(url, { try_instant_view: false });
    return;
  }
  window.open(url, "_blank", "noopener");
}

function buildLinkBtn(l) {
  const info = linkInfo(l.url);
  const b = document.createElement("button");
  b.className = "comlink " + info.kind;
  b.innerHTML =
    `<span class="comlink-play">${info.kind === "link" ? "↗" : "▶"}</span>` +
    `<span>${escapeHtml(info.name)}</span>`;
  b.addEventListener("click", () => openCommentLink(l.url));
  return b;
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
    const parsed = parseLinks(q.comment);

    const cb = document.createElement("button");
    cb.className = "comment-btn";
    cb.textContent = parsed.links.length
      ? "Комментарий автоинструктора (есть видео)"
      : "Комментарий автоинструктора";
    card.appendChild(cb);

    const cbox = document.createElement("div");
    cbox.className = "quiz-tip comment-text hidden";
    cbox.innerHTML = renderTip(parsed.text);
    if (parsed.links.length) {
      const wrap = document.createElement("div");
      wrap.className = "comlinks";
      parsed.links.forEach((l) => wrap.appendChild(buildLinkBtn(l)));
      cbox.appendChild(wrap);
    }
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

function renderTicketGrid(stats) {
  const wrap = $("#ticket-grid");
  wrap.innerHTML = "";
  for (let i = 1; i <= 40; i++) {
    const b = document.createElement("button");
    b.className = "ticket-btn";
    b.addEventListener("click", () => startTicket(i));

    const num = document.createElement("span");
    num.className = "ticket-num";
    num.textContent = i;

    const cnt = document.createElement("span");
    cnt.className = "ticket-count";
    b.append(num);
    const c = stats[i] || {};
    if (c.comments > 0) {
      cnt.textContent =
        c.comments + " с комментарием" +
        (c.videos > 0 ? ` (${c.videos} с видео)` : "");
      b.append(cnt);
    }
    wrap.appendChild(b);
  }
}

async function init() {
  tgFullscreen();
  document.addEventListener("pointerdown", tgFullscreen, { once: true });
  showLoading(true, "Загрузка…");
  let stats = {};
  try {
    const r = await fetch(API_BASE_URL);
    const d = await r.json();
    if (d.ok) {
      (d.stats || []).forEach((s) => {
        stats[s.ticket] = { comments: s.comments, videos: s.videos || 0 };
      });
    }
  } catch (e) {
    $("#loading-note").textContent = "Ошибка загрузки: " + e.message;
  }
  $("#loading-note").textContent = "Выберите билет:";
  renderTicketGrid(stats);
  showLoading(false);
}

init();