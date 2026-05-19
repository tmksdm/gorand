// === GoRand — основная логика приложения ===
// На Этапе 1 здесь только регистрация service worker и реакция на кнопку.

console.log("GoRand: app.js загружен");

// --- Регистрация service worker ---
// Service worker — это фоновый скрипт, который позволяет PWA работать оффлайн
// и быть устанавливаемой. Без него установка на телефон не сработает.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("SW зарегистрирован:", reg.scope))
      .catch((err) => console.error("SW не зарегистрировался:", err));
  });
}

// --- Временная реакция на кнопку (на этапе 1 — просто заглушка) ---
const bigButton = document.getElementById("bigButton");
bigButton.addEventListener("click", () => {
  alert("Привет! Логика старта появится на Этапе 3.");
});
