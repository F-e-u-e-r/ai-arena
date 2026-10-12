/* Compact overlay controls that stay usable at 320×200 iframe size. */
(function (global) {
  "use strict";

  const ICONS = {
    sunny: "☀",
    rain: "🌧",
    heavyRain: "⛈",
    snow: "❄",
    thunderstorm: "⚡",
    tornado: "🌪"
  };

  const KEYS = {
    "1": "sunny",
    "2": "rain",
    "3": "heavyRain",
    "4": "snow",
    "5": "thunderstorm",
    "6": "tornado"
  };

  function UIController(eco) {
    this.eco = eco;
    this.hudSeason = document.getElementById("hud-season");
    this.hudWeather = document.getElementById("hud-weather");
    this.hudDebug = document.getElementById("hud-debug");
    this.seasonBtn = document.getElementById("btn-season");
    this.weatherBtns = document.querySelectorAll("[data-weather]");
    this._bind();
    this.refresh();
  }

  UIController.prototype._bind = function () {
    const self = this;
    for (let i = 0; i < this.weatherBtns.length; i++) {
      this.weatherBtns[i].addEventListener("click", function (e) {
        const type = e.currentTarget.getAttribute("data-weather");
        self.eco.setWeather(type);
        self.refresh();
      });
    }
    this.seasonBtn.addEventListener("click", function () {
      self.eco.toggleSeason();
      self.refresh();
    });
    window.addEventListener("keydown", function (e) {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const w = KEYS[e.key];
      if (w) {
        self.eco.setWeather(w);
        self.refresh();
      } else if (e.key === "s" || e.key === "S" || e.key === "w" || e.key === "W") {
        self.eco.toggleSeason();
        self.refresh();
      } else if (e.key === "d" || e.key === "D") {
        self.eco.season.setSeason("dry", true);
        self.refresh();
      } else if (e.key === "v" || e.key === "V") {
        self.eco.season.setSeason("wet", true);
        self.refresh();
      }
    });
  };

  UIController.prototype.refresh = function () {
    const type = this.eco.weather.type;
    for (let i = 0; i < this.weatherBtns.length; i++) {
      const b = this.weatherBtns[i];
      const on = b.getAttribute("data-weather") === type;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    const dry = this.eco.season.toName === "dry";
    this.seasonBtn.classList.toggle("is-dry", dry);
    this.seasonBtn.classList.toggle("is-wet", !dry);
    this.seasonBtn.setAttribute("aria-label", dry ? "Switch to wet season" : "Switch to dry season");
    const icon = this.seasonBtn.querySelector(".icon");
    const text = this.seasonBtn.querySelector(".full");
    if (icon) icon.textContent = dry ? "🌾" : "💧";
    if (text) text.textContent = dry ? "Dry" : "Wet";
  };

  UIController.prototype.tick = function () {
    const eco = this.eco;
    const sec = Math.ceil(eco.season.remaining());
    this.hudSeason.textContent = eco.season.label() + " · " + sec + "s";
    this.hudWeather.textContent = eco.weather.label();
    this.hudDebug.textContent = Math.round(eco.fps) + " fps · " + eco.weather.particles.count() + " p";
    this.refresh();
  };

  UIController.ICONS = ICONS;

  global.UIController = UIController;
})(window);
