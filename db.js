// === GoRand — модуль работы с IndexedDB ===
// Хранит звуковые файлы (Blob'ы) на устройстве пользователя.
// Запись в хранилище sounds выглядит так:
//   {
//     id:       "builtin-go01"  // уникальный ключ
//     name:     "Го 01"          // человекочитаемое имя
//     source:   "builtin" | "user"
//     blob:     Blob             // сам mp3/wav как бинарные данные
//     addedAt:  1716000000000    // timestamp добавления (Date.now())
//   }

const DB_NAME = "gorand";
const DB_VERSION = 1;
const STORE_SOUNDS = "sounds";

// Кешируем открытую базу, чтобы не открывать её на каждый чих.
let dbPromise = null;

/**
 * Открывает (и при первом запуске — создаёт) базу.
 * Возвращает Promise<IDBDatabase>.
 *
 * onupgradeneeded срабатывает только когда:
 *   - базы вообще ещё нет;
 *   - DB_VERSION в коде больше, чем версия в браузере.
 * Внутри него мы создаём structure: хранилища, индексы. После — больше нельзя.
 */
function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log("[DB] onupgradeneeded: создаём структуру");

      if (!db.objectStoreNames.contains(STORE_SOUNDS)) {
        // keyPath: "id" — ключом каждой записи будет её поле id.
        // Значит при put() / get() работаем с объектом, а не с отдельным ключом.
        const store = db.createObjectStore(STORE_SOUNDS, { keyPath: "id" });
        // Индекс по source — на будущее, чтобы быстро отфильтровать builtin vs user.
        store.createIndex("by_source", "source", { unique: false });
        console.log("[DB] хранилище sounds создано");
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      console.log("[DB] открыта, версия:", db.version);
      resolve(db);
    };

    request.onerror = (event) => {
      console.error("[DB] ошибка открытия:", event.target.error);
      reject(event.target.error);
    };

    request.onblocked = () => {
      console.warn("[DB] заблокирована другой вкладкой со старой версией");
    };
  });

  return dbPromise;
}

/**
 * Превращает IDBRequest в Promise.
 * Дальше будем этим обёртывать почти все операции.
 */
function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Возвращает все записи из sounds (массив объектов).
 */
async function getAllSounds() {
  const db = await openDb();
  const tx = db.transaction(STORE_SOUNDS, "readonly");
  const store = tx.objectStore(STORE_SOUNDS);
  return reqToPromise(store.getAll());
}

/**
 * Возвращает одну запись по id или undefined, если её нет.
 */
async function getSoundById(id) {
  const db = await openDb();
  const tx = db.transaction(STORE_SOUNDS, "readonly");
  const store = tx.objectStore(STORE_SOUNDS);
  return reqToPromise(store.get(id));
}

/**
 * Возвращает все записи указанного источника ("builtin" | "user").
 */
async function getSoundsBySource(source) {
  const db = await openDb();
  const tx = db.transaction(STORE_SOUNDS, "readonly");
  const store = tx.objectStore(STORE_SOUNDS);
  const index = store.index("by_source");
  return reqToPromise(index.getAll(source));
}

/**
 * Добавляет или обновляет запись. record должен содержать поле id.
 */
async function putSound(record) {
  if (!record || !record.id) {
    throw new Error("putSound: record.id обязателен");
  }
  const db = await openDb();
  const tx = db.transaction(STORE_SOUNDS, "readwrite");
  const store = tx.objectStore(STORE_SOUNDS);
  store.put(record);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(record.id);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("tx aborted"));
  });
}

/**
 * Удаляет запись по id.
 */
async function deleteSound(id) {
  const db = await openDb();
  const tx = db.transaction(STORE_SOUNDS, "readwrite");
  const store = tx.objectStore(STORE_SOUNDS);
  store.delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("tx aborted"));
  });
}

/**
 * Полностью сносит хранилище звуков (на отладку — пока не используем в UI).
 * Удобно во время разработки, когда хочется «начать с нуля».
 */
async function clearAllSounds() {
  const db = await openDb();
  const tx = db.transaction(STORE_SOUNDS, "readwrite");
  const store = tx.objectStore(STORE_SOUNDS);
  store.clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Экспортируем функции в глобальный объект window.GoRandDB,
// чтобы app.js (без модулей) мог ими пользоваться.
window.GoRandDB = {
  openDb,
  getAllSounds,
  getSoundById,
  getSoundsBySource,
  putSound,
  deleteSound,
  clearAllSounds,
};
