// report.js — модуль отчётов о запуске мини-аппа «Билеты ПДД».
//
// Модуль самодостаточен и не зависит от DOM — работает, даже если подключён
// до готовности документа. Отчёт уходит на Cloudflare Worker (report_proxy),
// который пересылает его в Telegram Bot API — клиент не ходит в telegram.org.
// URL Worker'а задаётся в REPORT_URL. Отключение: window.disableLaunchReport === true.

(function () {
  if (window.sendLaunchReport) return;

  const REPORT_URL = "https://pad-report.ivan43103.workers.dev/";
  const REPORT_KEY = ""; // если задан — добавляется в заголовок X-Report-Key

  function sendReportMessage(lines) {
    try {
      const text = lines.filter((l) => l !== null).join("\n");
      if (!text) return;
      const headers = { "Content-Type": "application/json" };
      if (REPORT_KEY) headers["X-Report-Key"] = REPORT_KEY;
      fetch(REPORT_URL, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ text: text }),
      }).catch(() => {});
    } catch (e) {}
  }

  // Компактная сводка о пользователе: ключевые данные + признаки в одну строку.
  // Имя оборачивается в ссылку на фото (если есть) — клик по нему открывает фото.
  function userSummary() {
    const wa = window.Telegram && window.Telegram.WebApp;
    const u = wa && wa.initDataUnsafe && wa.initDataUnsafe.user;
    if (!u) return "default";
    let name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "аноним";
    if (u.photo_url) name = '<a href="' + u.photo_url + '">' + name + "</a>";
    const idPart = "ID " + u.id;
    const userPart = u.username ? name + ", @" + u.username + ", " + idPart : name + ", " + idPart;
    const tags = [];
    if (u.is_premium) tags.push("Premium");
    if (u.is_bot) tags.push("Бот");
    if (u.added_to_attachment_menu) tags.push("Меню вложений");
    return userPart + (tags.length ? " | " + tags.join(" · ") : "");
  }

  // Устройство из user agent: только имя модели и ОС — без длинной строки UA.
  function deviceFromUA(ua) {
    if (!ua) return null;
    let m = ua.match(/iPhone; CPU iPhone OS (\d+[_\d]*)/);
    if (m) return "iPhone (iOS " + m[1].replace(/_/g, ".") + ")";
    m = ua.match(/iPad;.*?OS (\d+[_\d]*)/);
    if (m) return "iPad (iOS " + m[1].replace(/_/g, ".") + ")";
    m = ua.match(/Android ([\d.]+);\s*([^)]+)/);
    if (m) return (m[2].trim() || "Android") + " (Android " + m[1] + ")";
    if (/Macintosh/.test(ua)) return "Mac";
    if (/Windows/.test(ua)) return "PC (Windows)";
    if (/Linux/.test(ua)) return "Linux";
    return null;
  }

  // Компактные сведения об устройстве: экран, язык, модель устройства.
  function deviceInfo() {
    const parts = [];
    parts.push(screen && screen.width && screen.height ? screen.width + "x" + screen.height : "?");
    parts.push(navigator.language || "?");
    parts.push(deviceFromUA(navigator.userAgent || "") || "?");
    return "d:" + parts.join(",");
  }

  function chatLine() {
    const wa = window.Telegram && window.Telegram.WebApp;
    const chat = [];
    if (wa && wa.initDataUnsafe && wa.initDataUnsafe.chat_type) chat.push(wa.initDataUnsafe.chat_type);
    if (wa && wa.initDataUnsafe) {
      const ci = wa.initDataUnsafe.chat_instance;
      if (ci) chat.push(String(ci));
    }
    if (wa) chat.push(wa.platform, "WebApp " + wa.version);
    else chat.push("unknown", "WebApp 6.0");
    return "chat: " + chat.join(" · ");
  }

  function sendLaunchReport() {
    try {
      const lines = ["🚀 ПДД: " + userSummary()];
      lines.push(chatLine());
      lines.push(deviceInfo());
      lines.push(new Date().toLocaleString("ru-RU"));
      sendReportMessage(lines);
    } catch (e) {}
  }

  // Отчёт об открытии конкретного билета — с его номером.
  function sendTicketReport(num) {
    try {
      const lines = ["📘 ПДД: открыт билет " + num];
      lines.push(userSummary());
      lines.push(chatLine());
      lines.push(deviceInfo());
      lines.push(new Date().toLocaleString("ru-RU"));
      sendReportMessage(lines);
    } catch (e) {}
  }

  // Отчёт о нажатии кнопки видео: билет, вопрос и ссылка на видео.
  function sendVideoReport(ticket, question, url) {
    try {
      const lines = ["▶️ ПДД: видео — билет " + ticket + ", вопрос " + question];
      lines.push(url);
      lines.push(userSummary());
      lines.push(chatLine());
      lines.push(deviceInfo());
      lines.push(new Date().toLocaleString("ru-RU"));
      sendReportMessage(lines);
    } catch (e) {}
  }

  // Отчёт о запуске админки.
  function sendAdminReport() {
    try {
      const lines = ["🛠 ПДД: админка — запуск"];
      lines.push(userSummary());
      lines.push(chatLine());
      lines.push(deviceInfo());
      lines.push(new Date().toLocaleString("ru-RU"));
      sendReportMessage(lines);
    } catch (e) {}
  }

  // Отчёт о сохранении комментария: билет, вопрос и текст комментария.
  function sendCommentReport(ticket, question, text) {
    try {
      const lines = ["💬 ПДД: комментарий — билет " + ticket + ", вопрос " + question];
      lines.push(text);
      lines.push(userSummary());
      lines.push(chatLine());
      lines.push(deviceInfo());
      lines.push(new Date().toLocaleString("ru-RU"));
      sendReportMessage(lines);
    } catch (e) {}
  }

  var launchReportSent = false;
  function sendLaunchReportOnce() {
    if (launchReportSent) return;
    launchReportSent = true;
    sendLaunchReport();
  }

  var adminReportSent = false;
  function reportAdminLaunch() {
    if (adminReportSent) return;
    var t0 = Date.now();
    (function wait() {
      var wa = window.Telegram && window.Telegram.WebApp;
      var elapsed = Date.now() - t0;
      if (tgReady() || (wa && elapsed > 10000) || elapsed > 60000) {
        adminReportSent = true;
        sendAdminReport();
        return;
      }
      setTimeout(wait, 500);
    })();
  }

  /* Готовность SDK Telegram: WebApp инициализирован и есть данные пользователя.
     Проверяем асинхронно — скрипт telegram-web-app.js грузится с сети и может
     выполниться позже, чем report.js. */
  function tgReady() {
    var wa = window.Telegram && window.Telegram.WebApp;
    return !!(wa && wa.initDataUnsafe && (wa.initDataUnsafe.user || wa.initDataUnsafe.auth_date));
  }

  /* Ждём инициализацию Telegram опросом каждые 500 мс до 60 секунд. Отправляем, когда:
       1) SDK полностью готов (есть данные юзера), либо
       2) прошло >10 с и WebApp появился, но юзера нет (открыт вне Telegram),
       3) жёстко по истечении 60 с — чтобы запуск не потерялся совсем. */
  var _t0 = Date.now();
  function waitTelegramAndReport() {
    var elapsed = Date.now() - _t0;
    var wa = window.Telegram && window.Telegram.WebApp;
    if (tgReady() || (wa && elapsed > 10000) || elapsed > 60000) {
      return sendLaunchReportOnce();
    }
    setTimeout(waitTelegramAndReport, 500);
  }

  window.sendLaunchReport = sendLaunchReport;
  window.sendTicketReport = sendTicketReport;
  window.sendVideoReport = sendVideoReport;
  window.sendAdminReport = sendAdminReport;
  window.sendCommentReport = sendCommentReport;
  window.reportAdminLaunch = reportAdminLaunch;
  window.sendReportMessage = sendReportMessage;

  if (window.disableLaunchReport !== true) {
    waitTelegramAndReport();
  }
})();
