// === GoRand — основная логика приложения ===
// Этап 4 шаг 5: список звуков (прослушать / удалить), наполнение селекта.

console.log("GoRand: app.js загружен");

// --- Регистрация service worker ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("SW зарегистрирован:", reg.scope))
      .catch((err) => console.error("SW не зарегистрировался:", err));
  });
}

// ============================================================
//  НАСТРОЙКИ
// ============================================================

const SETTINGS_KEY = "gorand.settings.v1";

const DEFAULT_SETTINGS = {
  intervalMin: 2.0,
  intervalMax: 4.0,
  startsCount: 10,
  countdownEnabled: false,
  soundMode: "random-builtin",
  singleSoundId: "",
  vibrationEnabled: false,
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      settings = { ...DEFAULT_SETTINGS, ...parsed };
    } else {
      settings = { ...DEFAULT_SETTINGS };
    }
  } catch (err) {
    console.warn("Не удалось прочитать настройки, использую дефолты:", err);
    settings = { ...DEFAULT_SETTINGS };
  }
  console.log("Настройки загружены:", settings);
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Не удалось сохранить настройки:", err);
  }
}

// --- Ссылки на DOM-элементы настроек ---
const inputIntervalMin = document.getElementById("input-interval-min");
const inputIntervalMax = document.getElementById("input-interval-max");
const inputStartsCount = document.getElementById("input-starts-count");
const toggleCountdown = document.getElementById("toggle-countdown");
const selectSoundMode = document.getElementById("select-sound-mode");
const selectSingleSound = document.getElementById("select-single-sound");
const rowSingleSound = document.getElementById("row-single-sound");
const toggleVibration = document.getElementById("toggle-vibration");

const counterValue = document.querySelector(".counter-value");
const counterLabel = document.querySelector(".counter-label");
const timerEl = document.querySelector(".timer");

function renderSettings() {
  inputIntervalMin.value = settings.intervalMin;
  inputIntervalMax.value = settings.intervalMax;
  inputStartsCount.value = settings.startsCount;
  toggleCountdown.checked = settings.countdownEnabled;
  selectSoundMode.value = settings.soundMode;
  toggleVibration.checked = settings.vibrationEnabled;

  updateSingleSoundRowVisibility();
  updateMainCounter();
  // selectSingleSound.value установится после refreshSoundsUi(),
  // когда в select появятся опции.
}

function updateSingleSoundRowVisibility() {
  if (settings.soundMode === "single") {
    rowSingleSound.classList.remove("hidden");
  } else {
    rowSingleSound.classList.add("hidden");
  }
}

function updateMainCounter() {
  if (!isRunning) {
    counterValue.textContent = `0 / ${settings.startsCount}`;
  }
}

// ============================================================
//  ОБРАБОТЧИКИ ИЗМЕНЕНИЙ ПОЛЕЙ
// ============================================================

function parseFloatSafe(str, fallback) {
  const n = parseFloat(String(str).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function parseIntSafe(str, fallback) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : fallback;
}

function roundTenth(n) {
  return Math.round(n * 10) / 10;
}

inputIntervalMin.addEventListener("change", () => {
  let v = roundTenth(parseFloatSafe(inputIntervalMin.value, DEFAULT_SETTINGS.intervalMin));
  if (v < 0.1) v = 0.1;
  if (v > 60) v = 60;
  if (v > settings.intervalMax) {
    settings.intervalMax = v;
    inputIntervalMax.value = v;
  }
  settings.intervalMin = v;
  inputIntervalMin.value = v;
  saveSettings();
});

inputIntervalMax.addEventListener("change", () => {
  let v = roundTenth(parseFloatSafe(inputIntervalMax.value, DEFAULT_SETTINGS.intervalMax));
  if (v < 0.1) v = 0.1;
  if (v > 60) v = 60;
  if (v < settings.intervalMin) {
    settings.intervalMin = v;
    inputIntervalMin.value = v;
  }
  settings.intervalMax = v;
  inputIntervalMax.value = v;
  saveSettings();
});

inputStartsCount.addEventListener("change", () => {
  let v = parseIntSafe(inputStartsCount.value, DEFAULT_SETTINGS.startsCount);
  if (v < 1) v = 1;
  if (v > 999) v = 999;
  settings.startsCount = v;
  inputStartsCount.value = v;
  updateMainCounter();
  saveSettings();
});

toggleCountdown.addEventListener("change", () => {
  settings.countdownEnabled = toggleCountdown.checked;
  saveSettings();
});

toggleVibration.addEventListener("change", () => {
  settings.vibrationEnabled = toggleVibration.checked;
  saveSettings();
});

selectSoundMode.addEventListener("change", () => {
  settings.soundMode = selectSoundMode.value;
  updateSingleSoundRowVisibility();
  saveSettings();
});

selectSingleSound.addEventListener("change", () => {
  settings.singleSoundId = selectSingleSound.value;
  saveSettings();
});

// ============================================================
//  ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ
// ============================================================

const screenMain = document.getElementById("screen-main");
const screenSettings = document.getElementById("screen-settings");
const btnOpenSettings = document.getElementById("btn-open-settings");
const btnCloseSettings = document.getElementById("btn-close-settings");

function showScreen(name) {
  if (name === "settings") {
    screenMain.classList.add("hidden");
    screenSettings.classList.remove("hidden");
  } else {
    screenSettings.classList.add("hidden");
    screenMain.classList.remove("hidden");
  }
}

btnOpenSettings.addEventListener("click", () => {
  if (isRunning) {
    console.log("Серия идёт — настройки заблокированы");
    return;
  }
  showScreen("settings");
});
btnCloseSettings.addEventListener("click", () => showScreen("main"));

// ============================================================
//  ТОСТ — короткое всплывающее сообщение
// ============================================================

let toastEl = null;
let toastHideTimeoutId = null;

function showToast(message, durationMs = 2500) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  requestAnimationFrame(() => toastEl.classList.add("toast--visible"));
  if (toastHideTimeoutId) clearTimeout(toastHideTimeoutId);
  toastHideTimeoutId = setTimeout(() => {
    toastEl.classList.remove("toast--visible");
  }, durationMs);
}

// ============================================================
//  ЗВУК (Web Audio API)
// ============================================================

let audioCtx = null;

function ensureAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      console.error("Web Audio API не поддерживается в этом браузере");
      return null;
    }
    audioCtx = new Ctx();
    console.log("AudioContext создан, state:", audioCtx.state);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().then(() => {
      console.log("AudioContext разбужен, state:", audioCtx.state);
    });
  }
  return audioCtx;
}

function playBeep() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 0.12;
  const frequency = 880;
  const peakVolume = 0.4;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = frequency;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peakVolume, now + 0.01);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration);
}

// ============================================================
//  ВОСПРОИЗВЕДЕНИЕ РЕАЛЬНОГО ЗВУКА ИЗ INDEXEDDB
// ============================================================
// Кеш декодированных AudioBuffer'ов по id записи. decodeAudioData стоит
// заметных миллисекунд — повторное проигрывание того же звука должно быть
// мгновенным, поэтому держим результаты в памяти.

const audioBufferCache = new Map();

/**
 * blobToArrayBuffer — стандартный мост: для decodeAudioData нужен ArrayBuffer,
 * у нас в IndexedDB лежит Blob. На современных браузерах есть blob.arrayBuffer(),
 * для древних — упадём в FileReader.
 */
function blobToArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}

/**
 * Декодирует звук по id и возвращает AudioBuffer. Кеширует результат.
 * Если запись не найдена в IndexedDB — возвращает null.
 */
async function getAudioBufferById(id) {
  if (audioBufferCache.has(id)) return audioBufferCache.get(id);

  const record = await GoRandDB.getSoundById(id);
  if (!record || !record.blob) {
    console.warn(`[audio] звук ${id} не найден в IndexedDB`);
    return null;
  }

  const ctx = ensureAudioContext();
  if (!ctx) return null;

  try {
    const arrayBuf = await blobToArrayBuffer(record.blob);
    // decodeAudioData в Safari исторически принимает только callback-форму, но
    // современные движки уже умеют Promise. Оборачиваем для совместимости.
    const audioBuf = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuf, resolve, reject);
    });
    audioBufferCache.set(id, audioBuf);
    return audioBuf;
  } catch (err) {
    console.error(`[audio] не удалось декодировать ${id}:`, err);
    return null;
  }
}

/**
 * Проигрывает звук по id. Возвращает Promise, который резолвится, когда
 * звук доиграл до конца (или сразу, если play не удалось).
 */
async function playSoundById(id) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const buf = await getAudioBufferById(id);
  if (!buf) return;

  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(ctx.destination);
  source.start(ctx.currentTime);

  // Дождёмся события onended — пригодится для UI «играет / не играет».
  return new Promise((resolve) => {
    source.onended = () => resolve();
  });
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ ВСТРОЕННЫХ ЗВУКОВ
// ============================================================

const BUILTIN_MANIFEST_URL = "sounds/index.json";

async function initBuiltinSounds() {
  try {
    const existing = await GoRandDB.getSoundsBySource("builtin");
    if (existing.length > 0) {
      console.log(`[builtin] уже загружено ${existing.length} встроенных звуков, пропускаем фетч`);
      return;
    }

    console.log("[builtin] встроенных звуков нет — загружаем из манифеста");
    const manifestResponse = await fetch(BUILTIN_MANIFEST_URL, { cache: "no-cache" });
    if (!manifestResponse.ok) {
      throw new Error(`Манифест не получен: HTTP ${manifestResponse.status}`);
    }
    const manifest = await manifestResponse.json();

    if (!manifest || !Array.isArray(manifest.sounds)) {
      throw new Error("Манифест имеет некорректный формат (нет массива sounds)");
    }

    console.log(`[builtin] в манифесте ${manifest.sounds.length} звуков, начинаем скачивание`);

    const CONCURRENCY = 6;
    let cursor = 0;
    let downloaded = 0;
    let failed = 0;

    async function worker() {
      while (cursor < manifest.sounds.length) {
        const idx = cursor++;
        const entry = manifest.sounds[idx];
        try {
          const fileUrl = `sounds/${entry.file}`;
          const fileResp = await fetch(fileUrl, { cache: "no-cache" });
          if (!fileResp.ok) {
            throw new Error(`HTTP ${fileResp.status}`);
          }
          const blob = await fileResp.blob();
          await GoRandDB.putSound({
            id: entry.id,
            name: entry.name,
            source: "builtin",
            blob,
            addedAt: Date.now(),
          });
          downloaded++;
        } catch (err) {
          failed++;
          console.warn(`[builtin] не удалось загрузить ${entry.file}:`, err);
        }
      }
    }

    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);

    console.log(`[builtin] готово: загружено ${downloaded}, ошибок ${failed}`);
  } catch (err) {
    console.error("[builtin] инициализация провалилась:", err);
  }
}

// ============================================================
//  ПОЛЬЗОВАТЕЛЬСКАЯ ЗАГРУЗКА ЗВУКОВ
// ============================================================

const btnUploadSounds = document.getElementById("btn-upload-sounds");
const inputUploadSounds = document.getElementById("input-upload-sounds");
const userSoundsListEl = document.getElementById("user-sounds-list");

const MAX_USER_FILE_SIZE = 2 * 1024 * 1024; // 2 МБ
const ALLOWED_MIME = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"];
const ALLOWED_EXT = [".mp3", ".wav"];

function isAllowedAudioFile(file) {
  const name = (file.name || "").toLowerCase();
  const extOk = ALLOWED_EXT.some((ext) => name.endsWith(ext));
  const mimeOk = file.type && ALLOWED_MIME.includes(file.type.toLowerCase());
  return extOk || mimeOk;
}

function makeUserSoundId() {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileNameToDisplay(name) {
  return name.replace(/\.(mp3|wav)$/i, "").trim() || "Без названия";
}

btnUploadSounds.addEventListener("click", () => {
  inputUploadSounds.click();
});

inputUploadSounds.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  event.target.value = "";

  if (files.length === 0) return;

  console.log(`[upload] выбрано ${files.length} файл(ов)`);

  let added = 0;
  let skippedType = 0;
  let skippedSize = 0;
  let failed = 0;

  for (const file of files) {
    if (!isAllowedAudioFile(file)) {
      skippedType++;
      console.warn(`[upload] не аудио: ${file.name} (type="${file.type}")`);
      continue;
    }
    if (file.size > MAX_USER_FILE_SIZE) {
      skippedSize++;
      console.warn(`[upload] слишком большой: ${file.name} (${file.size} байт)`);
      continue;
    }

    try {
      const id = makeUserSoundId();
      await GoRandDB.putSound({
        id,
        name: fileNameToDisplay(file.name),
        source: "user",
        blob: file,
        addedAt: Date.now(),
      });
      added++;
      console.log(`[upload] сохранён: ${file.name} → ${id}`);
    } catch (err) {
      failed++;
      console.error(`[upload] ошибка сохранения ${file.name}:`, err);
    }
  }

  const parts = [];
  if (added > 0) parts.push(`добавлено: ${added}`);
  if (skippedType > 0) parts.push(`не аудио: ${skippedType}`);
  if (skippedSize > 0) parts.push(`>2 МБ: ${skippedSize}`);
  if (failed > 0) parts.push(`ошибок: ${failed}`);
  showToast(parts.join(", ") || "Ничего не добавлено");

  // Что-то могло добавиться — перерисуем список и селект.
  await refreshSoundsUi();
});

// ============================================================
//  РЕНДЕР СПИСКА ЗВУКОВ И СЕЛЕКТА «ВЫБРАННЫЙ ЗВУК»
// ============================================================

/**
 * Сортирует записи отдельно по группам.
 * Возвращает объект { user: [...], builtin: [...] } — UI сам решит,
 * в каком порядке их показать.
 *  - user: свежие сверху (по addedAt)
 *  - builtin: «естественная» сортировка по имени (Го 02 < Го 10)
 */
function sortSoundsForList(records) {
  const user = records
    .filter((r) => r.source === "user")
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  const builtin = records
    .filter((r) => r.source === "builtin")
    .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));
  return { user, builtin };
}

// Текущая «играющая» запись в списке — чтобы можно было визуально подсветить
// кнопку ▶ и не запускать второй экземпляр одновременно.
let currentlyPreviewingId = null;

// Состояние «свёрнуто / развёрнуто» по группам.
// По умолчанию: пользовательские раскрыты, встроенные свёрнуты.
const groupCollapsed = {
  user: false,
  builtin: true,
};

function renderSoundsList(grouped) {
  userSoundsListEl.innerHTML = "";

  const totalCount = grouped.user.length + grouped.builtin.length;
  if (totalCount === 0) {
    const empty = document.createElement("li");
    empty.className = "sounds-list__empty";
    empty.textContent = "Пока ничего не загружено";
    userSoundsListEl.appendChild(empty);
    return;
  }

  // --- Группа «Мои» (всегда сверху) ---
  renderGroupHeader({
    key: "user",
    title: "Мои",
    count: grouped.user.length,
  });
  if (grouped.user.length === 0) {
    const placeholder = document.createElement("li");
    placeholder.className = "sounds-list__placeholder";
    placeholder.dataset.groupItem = "user";
    placeholder.textContent = "Пока ничего не загружено. Нажмите «Загрузить звуки» выше.";
    if (groupCollapsed.user) placeholder.classList.add("is-collapsed");
    userSoundsListEl.appendChild(placeholder);
  } else {
    for (const rec of grouped.user) {
      userSoundsListEl.appendChild(renderSoundItem(rec, "user"));
    }
  }

  // --- Группа «Встроенные» ---
  renderGroupHeader({
    key: "builtin",
    title: "Встроенные",
    count: grouped.builtin.length,
  });
  for (const rec of grouped.builtin) {
    userSoundsListEl.appendChild(renderSoundItem(rec, "builtin"));
  }
}

/**
 * Рисует заголовок группы и сразу подвешивает к нему обработчик клика.
 * key — "user" | "builtin" (нужен для запоминания состояния).
 */
function renderGroupHeader({ key, title, count }) {
  const header = document.createElement("li");
  header.className = "sounds-list__group-header";
  header.setAttribute("role", "button");
  header.setAttribute("aria-expanded", String(!groupCollapsed[key]));
  header.dataset.groupHeader = key;

  const chev = document.createElement("span");
  chev.className = "sounds-list__chevron";
  chev.textContent = "▸";

  const titleEl = document.createElement("span");
  titleEl.className = "sounds-list__group-title";
  titleEl.textContent = title;

  const countEl = document.createElement("span");
  countEl.className = "sounds-list__group-count";
  countEl.textContent = String(count);

  header.appendChild(chev);
  header.appendChild(titleEl);
  header.appendChild(countEl);

  header.addEventListener("click", () => toggleGroup(key));

  userSoundsListEl.appendChild(header);
}

/**
 * Рисует одну строку звука. Класс is-collapsed добавляется, если группа свёрнута.
 */
function renderSoundItem(rec, groupKey) {
  const li = document.createElement("li");
  li.className = "sounds-list__item";
  if (groupCollapsed[groupKey]) li.classList.add("is-collapsed");
  li.dataset.soundId = rec.id;
  li.dataset.groupItem = groupKey;

  const btnPlay = document.createElement("button");
  btnPlay.type = "button";
  btnPlay.className = "sounds-list__btn";
  btnPlay.setAttribute("aria-label", "Прослушать");
  btnPlay.textContent = "▶";
  if (currentlyPreviewingId === rec.id) {
    btnPlay.classList.add("sounds-list__btn--playing");
  }
  btnPlay.addEventListener("click", () => previewSound(rec.id));

  const nameEl = document.createElement("span");
  nameEl.className = "sounds-list__name";
  nameEl.textContent = rec.name;
  nameEl.title = rec.name;

  const badge = document.createElement("span");
  badge.className =
    "sounds-list__badge" +
    (rec.source === "user" ? " sounds-list__badge--user" : "");
  badge.textContent = rec.source === "user" ? "мой" : "встроенный";

  li.appendChild(btnPlay);
  li.appendChild(nameEl);
  li.appendChild(badge);

  if (rec.source === "user") {
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "sounds-list__btn sounds-list__btn--delete";
    btnDel.setAttribute("aria-label", "Удалить");
    btnDel.textContent = "✕";
    btnDel.addEventListener("click", () => deleteUserSound(rec.id, rec.name));
    li.appendChild(btnDel);
  }

  return li;
}

/**
 * Сворачивает/разворачивает группу — без перерисовки всего списка,
 * просто переключает классы у строк этой группы и атрибут у заголовка.
 */
function toggleGroup(key) {
  groupCollapsed[key] = !groupCollapsed[key];

  const header = userSoundsListEl.querySelector(
    `.sounds-list__group-header[data-group-header="${key}"]`
  );
  if (header) {
    header.setAttribute("aria-expanded", String(!groupCollapsed[key]));
  }

  const items = userSoundsListEl.querySelectorAll(
    `[data-group-item="${key}"]`
  );
  for (const el of items) {
    el.classList.toggle("is-collapsed", groupCollapsed[key]);
  }
}


function renderSingleSoundSelect(records) {
  // Запомним текущее значение, чтобы попробовать восстановить.
  const wanted = settings.singleSoundId;

  selectSingleSound.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent =
    records.length === 0 ? "— нет доступных звуков —" : "— выберите звук —";
  selectSingleSound.appendChild(placeholder);

  // Делим на группы. Внутри каждой — отдельная сортировка:
  //   user    — свежие сверху;
  //   builtin — естественной сортировкой по имени.
  // Порядок optgroup'ов: сначала «Мои», потом «Встроенные»
  // (зеркалит список звуков ниже).
  const user = records
    .filter((r) => r.source === "user")
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  const builtin = records
    .filter((r) => r.source === "builtin")
    .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));

  if (user.length > 0) {
    const og = document.createElement("optgroup");
    og.label = "Мои";
    for (const r of user) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      og.appendChild(opt);
    }
    selectSingleSound.appendChild(og);
  }

  if (builtin.length > 0) {
    const og = document.createElement("optgroup");
    og.label = "Встроенные";
    for (const r of builtin) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      og.appendChild(opt);
    }
    selectSingleSound.appendChild(og);
  }

  // Восстанавливаем выбор. Если того звука уже нет (удалили) — сбрасываем.
  const stillExists = records.some((r) => r.id === wanted);
  if (wanted && stillExists) {
    selectSingleSound.value = wanted;
  } else {
    selectSingleSound.value = "";
    if (wanted && !stillExists) {
      settings.singleSoundId = "";
      saveSettings();
    }
  }
}


async function refreshSoundsUi() {
  try {
    const grouped = sortSoundsForList(await GoRandDB.getAllSounds());
    renderSoundsList(grouped);
    // Для селекта нам по-прежнему удобнее плоский массив:
    renderSingleSoundSelect([...grouped.user, ...grouped.builtin]);
  } catch (err) {
    console.error("[ui] не удалось обновить список звуков:", err);
  }
}


// ============================================================
//  ДЕЙСТВИЯ В СПИСКЕ: PREVIEW / DELETE
// ============================================================

async function previewSound(id) {
  // Если уже что-то играет — просто ждём, пусть доиграет. Старт нового
  // экземпляра во время старого даёт неприятный «двойной» эффект.
  if (currentlyPreviewingId) return;

  currentlyPreviewingId = id;
  // Подсветим кнопку текущей записи.
  const li = userSoundsListEl.querySelector(`[data-sound-id="${cssEscape(id)}"]`);
  const btn = li ? li.querySelector(".sounds-list__btn") : null;
  if (btn) btn.classList.add("sounds-list__btn--playing");

  try {
    await playSoundById(id);
  } catch (err) {
    console.error("[preview] ошибка проигрывания:", err);
  } finally {
    if (btn) btn.classList.remove("sounds-list__btn--playing");
    currentlyPreviewingId = null;
  }
}

/**
 * CSS.escape есть не везде; даём простой fallback на случай старого браузера.
 */
function cssEscape(s) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(s);
  }
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

async function deleteUserSound(id, name) {
  const ok = window.confirm(`Удалить звук «${name}»?`);
  if (!ok) return;
  try {
    await GoRandDB.deleteSound(id);
    audioBufferCache.delete(id);
    showToast("Удалено");
    await refreshSoundsUi();
  } catch (err) {
    console.error("[delete] ошибка:", err);
    showToast("Не удалось удалить");
  }
}

// ============================================================
//  ТАЙМЕР СЕРИИ
// ============================================================

let timerStartedAt = 0;
let timerIntervalId = null;

function formatTime(ms) {
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}.${tenths}`;
}

function renderTimer() {
  const elapsed = performance.now() - timerStartedAt;
  timerEl.textContent = formatTime(elapsed);
}

function startTimer() {
  timerStartedAt = performance.now();
  renderTimer();
  timerIntervalId = setInterval(renderTimer, 100);
}

function stopTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  renderTimer();
}

function resetTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  timerEl.textContent = "00:00.0";
}

// ============================================================
//  ЛОГИКА СЕРИИ
// ============================================================

let isRunning = false;
let nextBeepTimeoutId = null;
let currentStart = 0;

const btnStart = document.getElementById("btn-start");

function randomInterval() {
  const min = settings.intervalMin;
  const max = settings.intervalMax;
  const raw = min + Math.random() * (max - min);
  return roundTenth(raw);
}

function scheduleNextBeep() {
  const delaySec = randomInterval();
  const delayMs = Math.round(delaySec * 1000);
  nextBeepTimeoutId = setTimeout(() => {
    if (!isRunning) return;
    playBeep();
    currentStart++;
    counterValue.textContent = `${currentStart} / ${settings.startsCount}`;
    if (currentStart >= settings.startsCount) {
      finishSeries();
    } else {
      scheduleNextBeep();
    }
  }, delayMs);
}

function startSeries() {
  ensureAudioContext();
  isRunning = true;
  currentStart = 0;
  counterValue.textContent = `0 / ${settings.startsCount}`;
  counterLabel.textContent = "Серия идёт";
  btnStart.textContent = "Стоп";
  btnStart.classList.remove("big-btn--start");
  btnStart.classList.add("big-btn--stop");
  startTimer();
  scheduleNextBeep();
}

function stopSeries() {
  isRunning = false;
  if (nextBeepTimeoutId !== null) {
    clearTimeout(nextBeepTimeoutId);
    nextBeepTimeoutId = null;
  }
  resetTimer();
  currentStart = 0;
  counterValue.textContent = `0 / ${settings.startsCount}`;
  counterLabel.textContent = "Готов к старту";
  btnStart.textContent = "Старт";
  btnStart.classList.remove("big-btn--stop");
  btnStart.classList.add("big-btn--start");
}

function finishSeries() {
  isRunning = false;
  if (nextBeepTimeoutId !== null) {
    clearTimeout(nextBeepTimeoutId);
    nextBeepTimeoutId = null;
  }
  stopTimer();
  counterLabel.textContent = "Серия завершена";
  btnStart.textContent = "Старт";
  btnStart.classList.remove("big-btn--stop");
  btnStart.classList.add("big-btn--start");
}

btnStart.addEventListener("click", () => {
  if (isRunning) {
    stopSeries();
  } else {
    startSeries();
  }
});

// ============================================================
//  СТАРТ ПРИЛОЖЕНИЯ
// ============================================================

async function bootstrap() {
  loadSettings();
  renderSettings();
  // Дождёмся загрузки builtin'ов (если они грузятся первый раз) — иначе
  // список и селект отрисуются пустыми, и потом надо будет их обновлять.
  await initBuiltinSounds();
  await refreshSoundsUi();
}

bootstrap();
