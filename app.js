// === GoRand — основная логика приложения ===
// Этап 4 шаг 4: загрузка пользовательских звуков в IndexedDB.

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
  selectSingleSound.value = settings.singleSoundId;
  toggleVibration.checked = settings.vibrationEnabled;

  updateSingleSoundRowVisibility();
  updateMainCounter();
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
  // Сначала добавим в DOM, потом в следующем кадре — visible-класс. Так браузер
  // успеет применить начальное opacity:0, и переход к 1 будет плавным.
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

const MAX_USER_FILE_SIZE = 2 * 1024 * 1024; // 2 МБ на файл
const ALLOWED_MIME = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"];
const ALLOWED_EXT = [".mp3", ".wav"];

function isAllowedAudioFile(file) {
  // Некоторые мобильные браузеры подсовывают пустой MIME или экзотический —
  // поэтому проверяем И по MIME, И по расширению, и принимаем, если хоть один совпал.
  const name = (file.name || "").toLowerCase();
  const extOk = ALLOWED_EXT.some((ext) => name.endsWith(ext));
  const mimeOk = file.type && ALLOWED_MIME.includes(file.type.toLowerCase());
  return extOk || mimeOk;
}

/**
 * Генерит уникальный id вида "user-<timestamp>-<random>".
 * Префикс user- — чтобы случайно не пересечься с builtin-id.
 */
function makeUserSoundId() {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Имя файла → красивое отображаемое имя.
 * "Crazy Guy GO!.mp3" → "Crazy Guy GO!"
 */
function fileNameToDisplay(name) {
  return name.replace(/\.(mp3|wav)$/i, "").trim() || "Без названия";
}

// Кнопка просто кликает по скрытому input — стандартный приём.
btnUploadSounds.addEventListener("click", () => {
  inputUploadSounds.click();
});

inputUploadSounds.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  // Сразу сбросим значение input'а, иначе если пользователь повторно выберет
  // тот же файл — событие change не сработает (значение не изменилось).
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
      // File сам является Blob'ом, можно класть напрямую.
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

  // Соберём итоговое сообщение для тоста.
  const parts = [];
  if (added > 0) parts.push(`добавлено: ${added}`);
  if (skippedType > 0) parts.push(`не аудио: ${skippedType}`);
  if (skippedSize > 0) parts.push(`>2 МБ: ${skippedSize}`);
  if (failed > 0) parts.push(`ошибок: ${failed}`);
  showToast(parts.join(", ") || "Ничего не добавлено");
});

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
  initBuiltinSounds();
}

bootstrap();
