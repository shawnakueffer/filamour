// Hell/Dunkel: läuft im <head> vor dem ersten Zeichnen, damit die Seite nicht kurz hell aufblitzt.
// Ohne gespeicherte Wahl folgt der Shop der Systemeinstellung.
(function () {
  var KEY = "filamour-theme";
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  var COLORS = { light: "#fbfafa", dark: "#141213" }; // wie --bg in styles.css

  function stored() {
    try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch (e) { return null; }
  }
  function current() { return stored() || (media.matches ? "dark" : "light"); }

  function apply() {
    var choice = stored();
    if (choice) root.setAttribute("data-theme", choice); else root.removeAttribute("data-theme");
    var mode = current();
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", COLORS[mode]);
    var btns = document.querySelectorAll("[data-theme-toggle]");
    for (var j = 0; j < btns.length; j++) btns[j].setAttribute("aria-pressed", String(mode === "dark"));
  }

  function toggle() {
    var next = current() === "dark" ? "light" : "dark";
    var system = media.matches ? "dark" : "light";
    // Zurück auf die Systemfarbe = wieder automatisch dem System folgen
    try { if (next === system) localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch (e) {}
    apply();
  }

  apply();
  media.addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", function () {
    var btns = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", toggle);
    apply();
  });
})();
