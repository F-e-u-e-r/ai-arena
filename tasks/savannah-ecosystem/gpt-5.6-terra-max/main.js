"use strict";

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 600;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (min, max) => min + Math.random() * (max - min);

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function blend(a, b, t) {
  const start = typeof a === "string" ? hexToRgb(a) : a;
  const end = typeof b === "string" ? hexToRgb(b) : b;
  return {
    r: Math.round(start.r + (end.r - start.r) * t),
    g: Math.round(start.g + (end.g - start.g) * t),
    b: Math.round(start.b + (end.b - start.b) * t)
  };
}

function rgb(color, alpha = 1) {
  return "rgba(" + color.r + "," + color.g + "," + color.b + "," + alpha + ")";
}

function pathLine(context, points) {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point[0], point[1]);
    else context.lineTo(point[0], point[1]);
  });
}

const SEASON_DATA = {
  dry: {
    id: "dry",
    title: "DRY",
    skyTop: "#d99c52",
    skyBottom: "#f4d78e",
    hill: "#b68a42",
    distant: "#a97a36",
    grass: "#b8a24d",
    ground: "#c9ad55",
    river: "#7ea6aa",
    cloud: "#faefd2",
    activity: 0.76
  },
  wet: {
    id: "wet",
    title: "WET",
    skyTop: "#5c9cac",
    skyBottom: "#c0d6a9",
    hill: "#567c58",
    distant: "#466d5a",
    grass: "#6b9851",
    ground: "#7ea656",
    river: "#5c9eb2",
    cloud: "#e8f3dc",
    activity: 1.18
  }
};

class SeasonManager {
  constructor() {
    this.current = SEASON_DATA.dry;
    this.from = SEASON_DATA.dry;
    this.to = SEASON_DATA.dry;
    this.transition = 1;
    this.elapsed = 0;
    this.lastAutoSwitch = 0;
  }

  toggle() {
    this.set(this.to.id === "dry" ? "wet" : "dry");
  }

  set(id) {
    const next = SEASON_DATA[id];
    if (next === this.to) return;
    this.from = this.transition < 0.5 ? this.from : this.to;
    this.to = next;
    this.transition = 0;
    this.lastAutoSwitch = this.elapsed;
  }

  update(delta) {
    this.elapsed += delta;
    this.transition = Math.min(1, this.transition + delta / 2.4);
    if (this.elapsed - this.lastAutoSwitch >= 60) this.set(this.to.id === "dry" ? "wet" : "dry");
    if (this.transition === 1) this.current = this.to;
  }

  get mix() {
    return this.transition * this.transition * (3 - 2 * this.transition);
  }

  get active() {
    return this.mix < 0.5 ? this.from : this.to;
  }

  palette() {
    const amount = this.mix;
    const result = {};
    Object.keys(this.to).forEach((key) => {
      if (typeof this.to[key] === "string" && this.to[key][0] === "#") result[key] = blend(this.from[key], this.to[key], amount);
    });
    result.activity = this.from.activity + (this.to.activity - this.from.activity) * amount;
    return result;
  }
}

// The pool owns every weather object up front. Weather changes only return objects
// to free and reconfigure them; no new rain, snow or debris objects are allocated.
class ParticlePool {
  constructor(size) {
    this.free = [];
    this.active = [];
    for (let index = 0; index < size; index += 1) {
      this.free.push({
        active: false,
        type: "dust",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        spin: 0,
        alpha: 1
      });
    }
  }

  acquire(type) {
    const particle = this.free.pop() || this.active.shift();
    if (!particle) return null;
    particle.active = true;
    particle.type = type;
    this.active.push(particle);
    return particle;
  }

  releaseAt(index) {
    const particle = this.active[index];
    particle.active = false;
    this.active.splice(index, 1);
    this.free.push(particle);
  }

  clear() {
    while (this.active.length) this.releaseAt(this.active.length - 1);
  }

  update(delta) {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const particle = this.active[index];
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.spin += delta * 2.2;
      if (particle.type === "snow") particle.vx += Math.sin(particle.spin) * delta * 4;
      if (particle.type === "debris") {
        particle.vx *= 0.995;
        particle.vy -= 3 * delta;
      }
      if (particle.life <= 0 || particle.y > WORLD_HEIGHT + 35 || particle.x < -40 || particle.x > WORLD_WIDTH + 40) this.releaseAt(index);
    }
  }
}

class Animal {
  constructor(type, x, y, options = {}) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.size = options.size || 1;
    this.baseSpeed = options.speed || 20;
    this.phase = random(0, Math.PI * 2);
    this.state = "walk";
    this.stateTime = random(1.2, 4);
    this.age = random(0, 10);
    this.width = options.width || 80;
    this.groupOffset = options.groupOffset || 0;
    this.climb = 0;
  }

  move(delta, ecosystem, modifier = 1) {
    const weatherSpeed = {
      sunny: 1,
      rain: 0.9,
      heavy: 0.74,
      snow: 0.66,
      storm: 1.15,
      tornado: 1.52
    }[ecosystem.weather.kind];
    this.x += this.baseSpeed * ecosystem.palette.activity * weatherSpeed * modifier * delta;
    if (this.x > WORLD_WIDTH + this.width) {
      this.x = -this.width - random(15, 125);
      this.stateTime = random(1.4, 4.5);
    }
  }
}

class Lion extends Animal {
  constructor(x, y, options) {
    super("lion", x, y, options);
  }

  update(delta, ecosystem) {
    this.age += delta;
    this.stateTime -= delta;
    if (this.stateTime <= 0) {
      const dry = ecosystem.season.active.id === "dry";
      this.state = Math.random() < (dry ? 0.45 : 0.23) ? "rest" : "patrol";
      this.stateTime = this.state === "rest" ? random(1.7, 3.7) : random(2.2, 5.4);
    }
    this.move(delta, ecosystem, this.state === "rest" ? 0.12 : 0.68);
  }

  draw(context) {
    const bob = this.state === "rest" ? 0 : Math.sin(this.age * 5 + this.phase) * 2;
    context.save();
    context.translate(this.x, this.y + bob);
    context.scale(this.size, this.size);
    context.lineCap = "round";
    context.strokeStyle = "#8f4d28";
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(-36, -4);
    context.quadraticCurveTo(-57, -20 + Math.sin(this.age * 3) * 6, -61, -2);
    context.stroke();
    context.fillStyle = "#bd6c32";
    context.beginPath();
    context.ellipse(-8, -10, 35, 18, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#d58b45";
    context.beginPath();
    context.ellipse(29, -19, 17, 16, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#744125";
    context.beginPath();
    context.arc(28, -22, 16, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#e6b56f";
    context.beginPath();
    context.ellipse(42, -13, 11, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#2c261b";
    context.beginPath();
    context.arc(45, -18, 2.2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#8f4d28";
    context.lineWidth = 10;
    [-21, 4, 25].forEach((offset) => {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset - 3, 19);
      context.stroke();
    });
    if (this.state === "rest") {
      context.fillStyle = "rgba(65,47,27,0.38)";
      context.fillRect(-22, 3, 45, 3);
    }
    context.restore();
  }
}

class Elephant extends Animal {
  constructor(x, y, options) {
    super("elephant", x, y, options);
  }

  update(delta, ecosystem) {
    this.age += delta;
    this.stateTime -= delta;
    if (this.stateTime <= 0) {
      const dry = ecosystem.season.active.id === "dry";
      const options = dry ? ["drink", "walk", "raise"] : ["walk", "walk", "raise"];
      this.state = options[Math.floor(Math.random() * options.length)];
      this.stateTime = this.state === "walk" ? random(3, 6) : random(1.5, 3.3);
    }
    this.move(delta, ecosystem, this.state === "drink" ? 0.25 : 0.44);
  }

  draw(context) {
    const bob = Math.sin(this.age * 3 + this.phase) * 1.5;
    context.save();
    context.translate(this.x, this.y + bob);
    context.scale(this.size, this.size);
    context.fillStyle = "#69767a";
    context.beginPath();
    context.ellipse(-4, -22, 48, 29, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#879397";
    context.beginPath();
    context.ellipse(35, -31, 24, 25, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#9aa4a3";
    context.beginPath();
    context.ellipse(26, -25, 16, 19, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#657174";
    context.lineCap = "round";
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(49, -24);
    if (this.state === "drink") {
      context.quadraticCurveTo(62, -2, 47, 13);
    } else if (this.state === "raise") {
      context.quadraticCurveTo(70, -58, 53, -68);
    } else {
      context.quadraticCurveTo(63, -9, 54, 1);
    }
    context.stroke();
    context.strokeStyle = "#5c686b";
    context.lineWidth = 14;
    [-29, -2, 25].forEach((offset) => {
      context.beginPath();
      context.moveTo(offset, -4);
      context.lineTo(offset - 2, 23);
      context.stroke();
    });
    context.fillStyle = "#f5ebcf";
    context.beginPath();
    context.moveTo(47, -26);
    context.lineTo(62, -19);
    context.lineTo(49, -12);
    context.fill();
    context.fillStyle = "#263234";
    context.beginPath();
    context.arc(46, -37, 2.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

class Leopard extends Animal {
  constructor(x, y, options) {
    super("leopard", x, y, options);
  }

  update(delta, ecosystem) {
    this.age += delta;
    this.stateTime -= delta;
    if (this.stateTime <= 0) {
      const choices = ecosystem.season.active.id === "wet" ? ["stalk", "sprint", "climb"] : ["stalk", "stalk", "climb"];
      this.state = choices[Math.floor(Math.random() * choices.length)];
      this.stateTime = this.state === "climb" ? random(1.6, 3.1) : random(1.2, 3.6);
      this.climb = 0;
    }
    if (this.state === "climb") {
      this.climb = Math.min(1, this.climb + delta / 0.72);
      this.move(delta, ecosystem, 0.13);
    } else {
      this.climb = Math.max(0, this.climb - delta / 0.6);
      this.move(delta, ecosystem, this.state === "sprint" ? 1.9 : 1.12);
    }
  }

  draw(context) {
    const lift = this.state === "climb" ? Math.sin(this.climb * Math.PI) * 79 : 0;
    const bob = Math.sin(this.age * 7 + this.phase) * 2;
    context.save();
    context.translate(this.x, this.y - lift + bob);
    context.scale(this.size, this.size);
    context.strokeStyle = "#9b6a28";
    context.lineCap = "round";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(-38, -14);
    context.quadraticCurveTo(-63, -36, -69, -7);
    context.stroke();
    context.fillStyle = "#d6a645";
    context.beginPath();
    context.ellipse(-3, -14, 37, 15, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(34, -20, 14, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f2d273";
    context.beginPath();
    context.ellipse(43, -15, 9, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#3e3322";
    for (let index = 0; index < 11; index += 1) {
      const angle = index * 1.8;
      context.beginPath();
      context.arc(-19 + (index % 4) * 15, -19 + Math.sin(angle) * 7, 3, 0, Math.PI * 2);
      context.fill();
    }
    context.beginPath();
    context.arc(45, -24, 1.8, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#a8752d";
    context.lineWidth = 7;
    [-18, 5, 25].forEach((offset) => {
      context.beginPath();
      context.moveTo(offset, -2);
      context.lineTo(offset - 3, 16);
      context.stroke();
    });
    context.restore();
  }
}

class WeatherManager {
  constructor(pool) {
    this.pool = pool;
    this.kind = "sunny";
    this.spawnCarry = 0;
    this.lightningTimer = random(1.6, 4);
    this.lightningLife = 0;
    this.lightningX = WORLD_WIDTH * 0.5;
    this.tornado = { x: 180, y: 330, spin: 0 };
  }

  set(kind, season) {
    if (kind === "snow" && season.active.id === "wet") return false;
    if (kind === this.kind) return true;
    this.kind = kind;
    this.pool.clear();
    this.spawnCarry = 0;
    this.lightningLife = 0;
    return true;
  }

  spawn(type) {
    const particle = this.pool.acquire(type);
    if (!particle) return;
    particle.x = random(-10, WORLD_WIDTH + 10);
    particle.y = type === "debris" ? this.tornado.y + random(-8, 80) : random(-30, 10);
    particle.size = type === "snow" ? random(1.2, 3.5) : type === "debris" ? random(1.2, 4.5) : random(0.6, 1.5);
    particle.alpha = type === "dust" ? random(0.18, 0.48) : random(0.56, 0.95);
    particle.maxLife = type === "debris" ? random(0.8, 1.7) : random(1.2, 2.8);
    particle.life = particle.maxLife;
    particle.spin = random(0, Math.PI * 2);
    if (type === "rain") {
      particle.vx = random(-28, -12);
      particle.vy = random(300, 430);
    } else if (type === "snow") {
      particle.vx = random(-14, 14);
      particle.vy = random(28, 65);
      particle.maxLife = particle.life = random(4.5, 8);
    } else if (type === "debris") {
      particle.x = this.tornado.x + random(-20, 20);
      particle.vx = random(-75, 75);
      particle.vy = random(-42, 20);
    } else {
      particle.vx = random(-18, 14);
      particle.vy = random(8, 28);
    }
  }

  // Lightning picks the point with maximum clearance from every live animal.
  // The bolt also stops above the animal plane, so a changing herd is never struck.
  findSafeLightningX(animals) {
    let safest = 48;
    let bestClearance = -Infinity;
    for (let candidate = 42; candidate <= WORLD_WIDTH - 42; candidate += 34) {
      let clearance = Infinity;
      animals.forEach((animal) => {
        const protectedRadius = animal.width * animal.size * 0.6 + 44;
        clearance = Math.min(clearance, Math.abs(candidate - animal.x) - protectedRadius);
      });
      if (clearance > bestClearance) {
        bestClearance = clearance;
        safest = candidate;
      }
    }
    return safest;
  }

  update(delta, animals, season) {
    const rates = {
      sunny: 2,
      rain: 78,
      heavy: 185,
      snow: 46,
      storm: 122,
      tornado: 20
    };
    const particleType = this.kind === "snow" ? "snow" : this.kind === "sunny" ? "dust" : this.kind === "tornado" ? "debris" : "rain";
    this.spawnCarry += rates[this.kind] * delta;
    while (this.spawnCarry >= 1) {
      this.spawn(particleType);
      this.spawnCarry -= 1;
    }
    if (this.kind === "storm") {
      this.lightningTimer -= delta;
      this.lightningLife = Math.max(0, this.lightningLife - delta);
      if (this.lightningTimer <= 0) {
        this.lightningX = this.findSafeLightningX(animals);
        this.lightningLife = 0.18;
        this.lightningTimer = random(1.5, 4.4);
      }
    }
    if (this.kind === "tornado") {
      let target = animals[0];
      let nearest = Infinity;
      animals.forEach((animal) => {
        const distance = (animal.x - this.tornado.x) ** 2 + (animal.y - this.tornado.y) ** 2;
        if (distance < nearest) {
          nearest = distance;
          target = animal;
        }
      });
      // A deliberately modest seek speed makes the funnel visibly pursue wildlife
      // rather than teleporting to it, while animals remain able to keep moving.
      const dx = target.x - this.tornado.x;
      const dy = target.y - this.tornado.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      this.tornado.x += (dx / distance) * 25 * delta;
      this.tornado.y += (dy / distance) * 13 * delta;
      this.tornado.spin += delta * 8;
    }
    this.pool.update(delta);
  }

  drawPuddles(context) {
    if (this.kind !== "rain" && this.kind !== "heavy" && this.kind !== "storm") return;
    const strength = this.kind === "heavy" || this.kind === "storm" ? 0.34 : 0.18;
    context.fillStyle = "rgba(74,131,150," + strength + ")";
    [[188, 477, 68], [624, 462, 89], [820, 500, 63]].forEach((puddle) => {
      context.beginPath();
      context.ellipse(puddle[0], puddle[1], puddle[2], 9, 0, 0, Math.PI * 2);
      context.fill();
    });
  }

  drawTornado(context) {
    if (this.kind !== "tornado") return;
    context.save();
    context.translate(this.tornado.x, this.tornado.y);
    context.fillStyle = "rgba(110,91,64,0.45)";
    for (let level = 0; level < 8; level += 1) {
      const progress = level / 7;
      const width = 16 + progress * 55;
      const y = 105 - level * 14;
      context.beginPath();
      context.ellipse(Math.sin(this.tornado.spin + level) * 8, y, width, 5 + progress * 4, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  drawParticles(context) {
    this.pool.active.forEach((particle) => {
      const opacity = particle.alpha * clamp(particle.life / particle.maxLife + 0.12, 0, 1);
      if (particle.type === "rain") {
        context.strokeStyle = "rgba(214,240,255," + opacity + ")";
        context.lineWidth = particle.size;
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - particle.vx * 0.035, particle.y - 14);
        context.stroke();
      } else if (particle.type === "snow") {
        context.fillStyle = "rgba(246,252,255," + opacity + ")";
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      } else if (particle.type === "debris") {
        context.fillStyle = "rgba(96,72,39," + opacity + ")";
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.spin);
        context.fillRect(-particle.size, -particle.size, particle.size * 2, particle.size * 2);
        context.restore();
      } else {
        context.fillStyle = "rgba(235,193,105," + opacity + ")";
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
    });
  }

  drawLightning(context) {
    if (this.lightningLife <= 0) return;
    context.save();
    context.globalAlpha = this.lightningLife / 0.18;
    context.strokeStyle = "#fff8c8";
    context.lineWidth = 5;
    context.shadowBlur = 22;
    context.shadowColor = "#ffffea";
    context.beginPath();
    context.moveTo(this.lightningX, 5);
    let x = this.lightningX;
    for (let y = 40; y < 305; y += 38) {
      x += Math.sin(y * 0.21 + this.lightningX) * 22;
      context.lineTo(x, y);
    }
    context.stroke();
    context.restore();
  }
}

class SavannahWorld {
  constructor() {
    this.canvas = document.querySelector("#world");
    this.context = this.canvas.getContext("2d");
    this.season = new SeasonManager();
    this.pool = new ParticlePool(500);
    this.weather = new WeatherManager(this.pool);
    this.elapsed = 0;
    this.lastTime = performance.now();
    this.weatherLabel = document.querySelector("#weather-name");
    this.seasonButton = document.querySelector("#season-toggle");
    this.weatherButtons = [...document.querySelectorAll("[data-weather]")];
    this.clouds = [
      { x: 90, y: 105, scale: 1.1, speed: 3.3 },
      { x: 360, y: 74, scale: 0.7, speed: 2.1 },
      { x: 730, y: 132, scale: 1.25, speed: 2.7 }
    ];
    this.grass = Array.from({ length: 135 }, () => ({
      x: random(0, WORLD_WIDTH),
      y: random(365, 545),
      height: random(5, 18),
      phase: random(0, Math.PI * 2)
    }));
    this.animals = [
      new Lion(75, 412, { size: 0.88, speed: 18, width: 76 }),
      new Lion(172, 446, { size: 0.76, speed: 18, width: 76 }),
      new Elephant(336, 486, { size: 0.84, speed: 13, width: 104 }),
      new Elephant(605, 458, { size: 0.73, speed: 13, width: 104 }),
      new Leopard(472, 377, { size: 0.69, speed: 31, width: 78 }),
      new Leopard(740, 414, { size: 0.58, speed: 32, width: 78 })
    ];
    this.drawOrder = [...this.animals].sort((a, b) => a.y - b.y);
    this.palette = this.season.palette();
    this.lastSeasonTarget = this.season.to.id;
    this.bindControls();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  bindControls() {
    this.weatherButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (!this.weather.set(button.dataset.weather, this.season)) return;
        this.updateControls();
      });
    });
    this.seasonButton.addEventListener("click", () => {
      this.season.toggle();
      if (this.season.to.id === "wet" && this.weather.kind === "snow") this.weather.set("rain", this.season);
      this.updateControls();
    });
    window.addEventListener("keydown", (event) => {
      const number = Number(event.key);
      if (number >= 1 && number <= 6) {
        const button = this.weatherButtons[number - 1];
        button.click();
      }
      if (event.key.toLowerCase() === "s") this.seasonButton.click();
    });
    this.updateControls();
  }

  updateControls() {
    const wet = this.season.to.id === "wet";
    this.weatherButtons.forEach((button) => {
      const isSnow = button.dataset.weather === "snow";
      button.disabled = isSnow && wet;
      button.classList.toggle("active", button.dataset.weather === this.weather.kind);
    });
    this.seasonButton.textContent = this.season.to.title;
    this.seasonButton.classList.toggle("wet", wet);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
  }

  update(delta) {
    this.elapsed += delta;
    this.season.update(delta);
    if (this.lastSeasonTarget !== this.season.to.id) {
      if (this.season.to.id === "wet" && this.weather.kind === "snow") this.weather.set("rain", this.season);
      this.lastSeasonTarget = this.season.to.id;
      this.updateControls();
    }
    this.palette = this.season.palette();
    this.animals.forEach((animal) => animal.update(delta, this));
    this.weather.update(delta, this.animals, this.season);
    this.clouds.forEach((cloud) => {
      cloud.x += cloud.speed * delta * (this.palette.activity + 0.1);
      if (cloud.x > WORLD_WIDTH + 150) cloud.x = -170;
    });
    const seasonTitle = this.season.active.title;
    const weatherTitle = {
      sunny: "SUNNY",
      rain: "RAIN",
      heavy: "HEAVY RAIN",
      snow: "SNOW",
      storm: "STORM",
      tornado: "TORNADO"
    }[this.weather.kind];
    const label = weatherTitle + " · " + seasonTitle;
    if (this.weatherLabel.textContent !== label) this.weatherLabel.textContent = label;
  }

  drawSky(context, palette) {
    const gradient = context.createLinearGradient(0, 0, 0, 390);
    gradient.addColorStop(0, rgb(palette.skyTop));
    gradient.addColorStop(1, rgb(palette.skyBottom));
    context.fillStyle = gradient;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    context.fillStyle = "rgba(255,237,170,0.78)";
    context.beginPath();
    context.arc(805, 92, 35, 0, Math.PI * 2);
    context.fill();

    this.clouds.forEach((cloud) => {
      context.save();
      context.translate(cloud.x, cloud.y);
      context.scale(cloud.scale, cloud.scale);
      context.fillStyle = rgb(palette.cloud, 0.62);
      [[0, 0, 34], [34, 6, 26], [-30, 8, 25], [12, -17, 24]].forEach((puff) => {
        context.beginPath();
        context.arc(puff[0], puff[1], puff[2], 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
    });
  }

  drawLandscape(context, palette) {
    context.fillStyle = rgb(palette.distant, 0.9);
    pathLine(context, [[0, 285], [90, 236], [160, 270], [265, 210], [385, 282], [510, 228], [640, 277], [778, 218], [960, 282], [960, 420], [0, 420]]);
    context.fill();
    context.fillStyle = rgb(palette.hill);
    pathLine(context, [[0, 328], [140, 268], [255, 326], [390, 275], [545, 329], [709, 259], [845, 319], [960, 282], [960, 440], [0, 440]]);
    context.fill();

    context.fillStyle = rgb(palette.ground);
    pathLine(context, [[0, 373], [180, 354], [324, 382], [488, 344], [641, 379], [789, 351], [960, 374], [960, 600], [0, 600]]);
    context.fill();

    const river = context.createLinearGradient(0, 0, 0, 520);
    river.addColorStop(0, rgb(palette.river, 0.75));
    river.addColorStop(1, rgb(palette.river, 0.27));
    context.fillStyle = river;
    pathLine(context, [[530, 370], [590, 394], [562, 420], [612, 449], [654, 479], [645, 530], [746, 600], [546, 600], [518, 551], [529, 495], [492, 452], [512, 412]]);
    context.fill();

    this.drawAcacia(context, 155, 354, 1.05, palette);
    this.drawAcacia(context, 492, 333, 0.88, palette);
    this.drawAcacia(context, 822, 358, 1.12, palette);
  }

  drawAcacia(context, x, y, scale, palette) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.strokeStyle = "#60442a";
    context.lineCap = "round";
    context.lineWidth = 16;
    context.beginPath();
    context.moveTo(0, 65);
    context.quadraticCurveTo(-7, 24, 12, -10);
    context.stroke();
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(8, 14);
    context.lineTo(-35, -8);
    context.moveTo(9, 5);
    context.lineTo(47, -21);
    context.stroke();
    context.fillStyle = rgb(palette.grass);
    [[-33, -21, 39], [2, -31, 51], [42, -29, 38], [14, -56, 30]].forEach((crown) => {
      context.beginPath();
      context.ellipse(crown[0], crown[1], crown[2], crown[2] * 0.45, 0, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  drawGrass(context, palette) {
    context.strokeStyle = rgb(palette.grass, 0.68);
    context.lineWidth = 1.5;
    this.grass.forEach((blade) => {
      const sway = Math.sin(this.elapsed * 2.3 + blade.phase) * 3.5;
      context.beginPath();
      context.moveTo(blade.x, blade.y);
      context.quadraticCurveTo(blade.x + sway, blade.y - blade.height * 0.48, blade.x + sway * 0.65, blade.y - blade.height);
      context.stroke();
    });
  }

  render() {
    const context = this.context;
    const sx = this.canvas.width / WORLD_WIDTH;
    const sy = this.canvas.height / WORLD_HEIGHT;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(sx, 0, 0, sy, 0, 0);
    const palette = this.palette;

    this.drawSky(context, palette);
    this.drawLandscape(context, palette);
    this.weather.drawPuddles(context);
    this.drawGrass(context, palette);
    this.weather.drawTornado(context);
    this.weather.drawParticles(context);
    this.drawOrder.forEach((animal) => animal.draw(context));
    this.weather.drawLightning(context);
  }

  frame(now) {
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.update(delta);
    this.render();
    requestAnimationFrame((time) => this.frame(time));
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }
}

new SavannahWorld().start();
