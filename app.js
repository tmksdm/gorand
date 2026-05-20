// === GoRand — основная логика приложения ===
// Этап 2: переключение экранов + работа с настройками (localStorage).

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

// Ключ в localStorage, под которым лежат все настройки одним JSON-объектом.
// Версия в имени — на случай, если в будущем поменяем структуру и нужно будет
// сбросить старые сохранённые настройки у пользователей.
const SETTINGS_KEY = "gorand.settings.v1";

// Значения по умолчанию. Используются при первом запуске и как "запасной аэродром"
// для любого поля, которого вдруг нет в сохранённом объекте.
const DEFAULT_SETTINGS = {
  intervalMin: 2.0,         // секунды, с десятыми
  intervalMax: 4.0,         // секунды, с десятыми
  startsCount: 10,          // целое
  countdownEnabled: false,  // обратный отсчёт 3 секунды перед серией
  soundMode: "random-builtin", // "random-builtin" | "random-user" | "random-all" | "single"
  singleSoundId: "",        // id выбранного звука для режима "single" (пока пусто)
  vibrationEnabled: false,  // по ТЗ — по умолчанию ВЫКЛЮЧЕНА
};

// Текущие настройки в памяти. Заполнятся в loadSettings().
let settings = { ...DEFAULT_SETTINGS };

/**
 * Читает настройки из localStorage. Если там пусто или мусор — берёт дефолты.
 * Все недостающие поля дозаполняются из DEFAULT_SETTINGS (на случай миграций).
 */
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

/**
 * Сохраняет текущие настройки в localStorage.
 * Вызывается после любого изменения.
 */
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

// Элемент на главном экране, который показывает "0 / N"
const counterValue = document.querySelector(".counter-value");

/**
 * Расставляет текущие значения settings в поля формы.
 * Вызывается один раз при старте, после loadSettings().
 */
function renderSettings() {
  inputIntervalMin.value = settings.intervalMin;
  inputIntervalMax.value = settings.intervalMax;
  inputStartsCount.value = settings.startsCount;
  toggleCountdown.checked = settings.countdownEnabled;
  selectSoundMode.value = settings.soundMode;
  selectSingleSound.value = settings.singleSoundId;
  toggleVibration.checked = settings.vibrationEnabled;

  // Строка "Выбранный звук" видна только в режиме single
  updateSingleSoundRowVisibility();

  // Синхронизируем счётчик на главном экране с количеством стартов
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
  counterValue.textContent = `0 / ${settings.startsCount}`;
}

// ============================================================
//  ОБРАБОТЧИКИ ИЗМЕНЕНИЙ ПОЛЕЙ
// ============================================================
// Каждый обработчик: 1) читает значение из контрола; 2) обновляет settings;
// 3) при необходимости валидирует; 4) сохраняет.

// --- Числовые поля ---

// Парсим строку из input в число с плавающей точкой.
// Если ввели мусор (или пустоту) — возвращаем fallback.
function parseFloatSafe(str, fallback) {
  const n = parseFloat(String(str).replace(",", ".")); // принимаем и "2,5" и "2.5"
  return Number.isFinite(n) ? n : fallback;
}

function parseIntSafe(str, fallback) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Округляем до десятых, чтобы не возникало 2.3000000004
function roundTenth(n) {
  return Math.round(n * 10) / 10;
}

inputIntervalMin.addEventListener("change", () => {
  let v = roundTenth(parseFloatSafe(inputIntervalMin.value, DEFAULT_SETTINGS.intervalMin));
  if (v < 0.1) v = 0.1;
  if (v > 60) v = 60;
  // Если мин стал больше макс — подтянем макс
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
  // Если макс стал меньше мин — подтянем мин
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

// --- Тумблеры ---

toggleCountdown.addEventListener("change", () => {
  settings.countdownEnabled = toggleCountdown.checked;
  saveSettings();
});

toggleVibration.addEventListener("change", () => {
  settings.vibrationEnabled = toggleVibration.checked;
  saveSettings();
});

// --- Селекты ---

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

btnOpenSettings.addEventListener("click", () => showScreen("settings"));
btnCloseSettings.addEventListener("click", () => showScreen("main"));

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================

// Сначала читаем настройки, потом расставляем их в поля.
loadSettings();
renderSettings();

// --- Большая кнопка "Старт" (заглушка до Этапа 3) ---
const btnStart = document.getElementById("btn-start");
btnStart.addEventListener("click", () => {
  console.log("Кнопка Старт нажата (логика появится на Этапе 3)");
  console.log("Текущие настройки:", settings);
});
