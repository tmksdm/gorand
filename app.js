// === GoRand — основная логика приложения ===
// Этап 3: логика серии (старт/стоп, звук, счётчик, таймер).

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
//  ТАЙМЕР СЕРИИ
// ============================================================
// Показывает общее прошедшее время в формате MM:SS.s.
// Источник истины — performance.now() (монотонные миллисекунды от загрузки
// страницы). setInterval отвечает только за частоту перерисовки.

let timerStartedAt = 0;       // момент старта серии (performance.now()), мс
let timerIntervalId = null;   // id setInterval для перерисовки

/**
 * Превращает миллисекунды в строку "MM:SS.s".
 * Math.floor отбрасывает дробную часть, padStart дополняет нулями слева,
 * чтобы цифры не "прыгали" (всегда 2 знака на минуты, 2 на секунды).
 */
function formatTime(ms) {
  const totalTenths = Math.floor(ms / 100);          // десятые доли секунды всего
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
  renderTimer();                       // сразу показать 00:00.0
  // 100 мс — частота перерисовки. Это НЕ источник времени, лишь обновление UI.
  timerIntervalId = setInterval(renderTimer, 100);
}

function stopTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  // Финальную перерисовку делаем — чтобы зафиксировать точное время остановки.
  renderTimer();
}

function resetTimer() {
  // Используется при нажатии "Стоп" вручную — сбрасываем на 00:00.0.
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  timerEl.textContent = "00:00.0";
}

// ============================================================
//  ЛОГИКА СЕРИИ (Этап 3)
// ============================================================

let isRunning = false;
let nextBeepTimeoutId = null;
let currentStart = 0;

const btnStart = document.getElementById("btn-start");

function renderStartButton() {
  if (isRunning) {
    btnStart.textContent = "Стоп";
    btnStart.classList.remove("big-btn--start");
    btnStart.classList.add("big-btn--stop");
  } else {
    btnStart.textContent = "Старт";
    btnStart.classList.remove("big-btn--stop");
    btnStart.classList.add("big-btn--start");
  }
}

function randomInterval() {
  const min = settings.intervalMin;
  const max = settings.intervalMax;
  const raw = min + Math.random() * (max - min);
  return roundTenth(raw);
}

function scheduleNextBeep() {
  const delaySec = randomInterval();
  const delayMs = Math.round(delaySec * 1000);
  console.log(`⏱ следующий бип через ${delaySec.toFixed(1)} с`);

  nextBeepTimeoutId = setTimeout(() => {
    nextBeepTimeoutId = null;
    if (!isRunning) return;

    playBeep();
    currentStart += 1;
    counterValue.textContent = `${currentStart} / ${settings.startsCount}`;
    console.log(`🔔 старт ${currentStart} / ${settings.startsCount}`);

    if (currentStart >= settings.startsCount) {
      finishSeries();
    } else {
      scheduleNextBeep();
    }
  }, delayMs);
}

function startSeries() {
  if (isRunning) return;
  console.log("▶ Старт серии. Настройки:", settings);

  ensureAudioContext();

  isRunning = true;
  currentStart = 0;
  counterLabel.textContent = "Серия идёт";
  counterValue.textContent = `0 / ${settings.startsCount}`;
  renderStartButton();

  startTimer();
  scheduleNextBeep();
}

function stopSeries() {
  if (!isRunning) return;
  console.log("■ Стоп серии (вручную)");

  isRunning = false;

  if (nextBeepTimeoutId !== null) {
    clearTimeout(nextBeepTimeoutId);
    nextBeepTimeoutId = null;
  }

  resetTimer();   // сбрасываем на 00:00.0 — серия не считается выполненной

  currentStart = 0;
  counterLabel.textContent = "Готов к старту";
  renderStartButton();
  updateMainCounter();
}

function finishSeries() {
  console.log("✅ Серия завершена");
  isRunning = false;
  nextBeepTimeoutId = null;

  stopTimer();    // оставляем финальное время на экране — пусть видно "за сколько прошёл"

  counterLabel.textContent = "Серия завершена";
  renderStartButton();
}

btnStart.addEventListener("click", () => {
  if (isRunning) {
    stopSeries();
  } else {
    startSeries();
  }
});

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================

loadSettings();
renderSettings();
renderStartButton();
