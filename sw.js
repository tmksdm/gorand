// === GoRand — Service Worker v0.2.0 ===
// Этап 5, Шаг 4: офлайн-кеширование app shell + все 36 звуков.
// Стратегия: cache-first, fallback to network.
// При обновлении: меняй CACHE_NAME → старый кеш удалится при activate.

const CACHE_NAME = "gorand-v0.2.0";

// Файлы app shell — грузятся при установке SW в первую очередь.
// Это всё, что нужно для работы интерфейса без сети.
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./db.js",
  "./style.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./sounds/index.json",
];

// ============================================================
//  INSTALL — кешируем всё при первой установке
// ============================================================

self.addEventListener("install", (event) => {
  console.log("[SW] install", CACHE_NAME);
  // skipWaiting: активируемся сразу, не ждём закрытия старых вкладок.
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 1. App shell — все файлы обязательны, кладём разом.
      //    addAll() бросит ошибку если хоть один не загрузится.
      await cache.addAll(APP_SHELL);
      console.log("[SW] app shell закеширован");

      // 2. Звуковые файлы — читаем манифест и кешируем все mp3.
      //    Используем Promise.allSettled: если какой-то файл не загрузится —
      //    установка SW всё равно продолжается (не критично).
      try {
        const manifestResp = await fetch("./sounds/index.json");
        if (!manifestResp.ok) throw new Error(`HTTP ${manifestResp.status}`);
        const manifest = await manifestResp.json();

        if (manifest && Array.isArray(manifest.sounds)) {
          const soundUrls = manifest.sounds.map((s) => `./sounds/${s.file}`);
          const results = await Promise.allSettled(
            soundUrls.map((url) => cache.add(url))
          );
          const ok = results.filter((r) => r.status === "fulfilled").length;
          const fail = results.filter((r) => r.status === "rejected").length;
          console.log(`[SW] звуки: закешировано ${ok}, ошибок ${fail}`);
        }
      } catch (err) {
        // Нет сети при установке — не страшно: звуки уже в IndexedDB,
        // при следующем открытии с сетью SW обновится и докачает.
        console.warn("[SW] не удалось закешировать звуки:", err.message);
      }
    })()
  );
});

// ============================================================
//  ACTIVATE — удаляем старые версии кеша
// ============================================================

self.addEventListener("activate", (event) => {
  console.log("[SW] activate", CACHE_NAME);
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] удаляю старый кеш:", key);
            return caches.delete(key);
          })
      );
      // Берём контроль над всеми открытыми вкладками сразу.
      await self.clients.claim();
    })()
  );
});

// ============================================================
//  FETCH — cache-first: сначала кеш, потом сеть
// ============================================================

self.addEventListener("fetch", (event) => {
  // Обрабатываем только GET-запросы к нашему origin.
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      // Ищем в кеше.
      const cached = await caches.match(event.request);
      if (cached) return cached;

      // Нет в кеше — идём в сеть.
      try {
        const response = await fetch(event.request);
        // Кладём успешный ответ в кеш на будущее
        // (подхватит новые звуки, которых не было при install).
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        // Сеть недоступна и в кеше нет — пробрасываем ошибку.
        // Браузер покажет стандартную «нет соединения».
        console.warn("[SW] офлайн, нет в кеше:", url.pathname);
        throw err;
      }
    })()
  );
});