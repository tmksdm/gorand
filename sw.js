// === GoRand — Service Worker ===
// На Этапе 1 — минимальный sw, который просто умеет устанавливаться и активироваться.
// Кеширование оффлайн-ресурсов добавим на Этапе 5.

const VERSION = "v0.1.0-stage1";

self.addEventListener("install", (event) => {
  console.log("[SW] install", VERSION);
  self.skipWaiting(); // не ждать закрытия старых вкладок — активироваться сразу
});

self.addEventListener("activate", (event) => {
  console.log("[SW] activate", VERSION);
  event.waitUntil(self.clients.claim()); // взять контроль над открытыми страницами
});

// Пока никаких хитростей с fetch — браузер обрабатывает запросы как обычно.
// На Этапе 5 здесь появится логика "сначала кеш, если нет — сеть".
