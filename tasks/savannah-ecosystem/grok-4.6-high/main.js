/* Ecosystem orchestrator: rAF loop, deltaTime, resize, no animal resets. */
(function (global) {
  "use strict";

  function Ecosystem(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.world = new World();
    this.season = new SeasonManager();
    this.weather = new WeatherManager();
    this.wildlife = new WildlifeSystem();
    this.last = performance.now();
    this.fps = 60;
    this._fpsT = 0;
    this._fpsN = 0;
    this.running = true;
    this.env = {
      world: this.world,
      season: this.season,
      weather: this.weather,
      w: 0,
      h: 0,
      groundY: 0,
      wind: 10,
      tornado: null
    };
    this._onResize = this.resize.bind(this);
    this._loop = this.loop.bind(this);
    this.resize();
    this.wildlife.spawn(this.world);
    this.ui = new UIController(this);
    window.addEventListener("resize", this._onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this._onResize);
    }
    document.addEventListener("visibilitychange", function () {
      /* rAF already pauses in hidden tabs; reset dt so the first frame
         after resume does not apply a multi-second jump. */
    });
    requestAnimationFrame(this._loop);
  }

  Ecosystem.prototype.setWeather = function (type) {
    this.weather.setWeather(type);
  };

  Ecosystem.prototype.toggleSeason = function () {
    this.season.toggle();
  };

  Ecosystem.prototype.resize = function () {
    const canvas = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, canvas.clientWidth || window.innerWidth || 320);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight || 200);
    const oldW = this.world.w;
    const oldH = this.world.h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.world.resize(w, h);
    this.weather.resizeBudget(w, h);
    this.wildlife.resize(oldW, oldH, this.world);
    this.env.w = w;
    this.env.h = h;
    this.env.groundY = this.world.groundY;
  };

  Ecosystem.prototype.loop = function (now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this._loop);
  };

  Ecosystem.prototype.update = function (dt) {
    this._fpsT += dt;
    this._fpsN++;
    if (this._fpsT >= 0.4) {
      this.fps = this._fpsN / this._fpsT;
      this._fpsT = 0;
      this._fpsN = 0;
    }
    this.season.update(dt);
    this.world.update(dt, this.weather.wind);
    this.env.w = this.world.w;
    this.env.h = this.world.h;
    this.env.groundY = this.world.groundY;
    this.env.season = this.season;
    this.env.weather = this.weather;
    this.weather.update(dt, this.env, this.season, this.wildlife.animals);
    this.env.tornado = this.weather.tornado;
    this.env.wind = this.weather.wind;
    this.wildlife.update(dt, this.env);
    this.ui.tick();
  };

  Ecosystem.prototype.draw = function () {
    const ctx = this.ctx;
    const w = this.world.w;
    const h = this.world.h;
    ctx.clearRect(0, 0, w, h);
    this.world.draw(ctx, this.season, this.weather);
    this.weather.drawBehind(ctx, this.env);
    this.wildlife.draw(ctx, this.env);
    this.world.drawGrass(ctx, this.season, this.weather.wind);
    this.weather.drawFront(ctx, this.env);
    this.world.drawVignette(ctx);
  };

  global.Ecosystem = Ecosystem;

  function boot() {
    const canvas = document.getElementById("scene");
    if (!canvas) return;
    global.eco = new Ecosystem(canvas);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
