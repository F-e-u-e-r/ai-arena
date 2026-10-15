/* Savanna · a living landscape. No dependencies, assets, or network requests. */
(() => {
  "use strict";

  const WIDTH = 1600;
  const WRAP_OFFSETS = [0, -WIDTH, WIDTH];
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const random = (lo, hi) => lo + Math.random() * (hi - lo);
  const $ = (id) => document.getElementById(id);
  const ellipse = (c, x, y, rx, ry, color, angle = 0) => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, angle, 0, TAU);
    c.fillStyle = color;
    c.fill();
  };
  function seeded(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }
  function color(a, b, t, shade = 0) {
    const dark = [70, 84, 79];
    return `rgb(${Math.round(lerp(lerp(a[0], b[0], t), dark[0], shade))},${Math.round(lerp(lerp(a[1], b[1], t), dark[1], shade))},${Math.round(lerp(lerp(a[2], b[2], t), dark[2], shade))})`;
  }
  function stroke(c, colorValue, width, callback) {
    c.beginPath();
    c.strokeStyle = colorValue;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    callback(c);
    c.stroke();
  }

  const WEATHER = Object.freeze({
    sunny: {
      label: "Sunny",
      icon: "sun",
      sky: "Golden hour",
      temp: 29,
      shade: 0,
      cloud: 0.1,
      wind: 0.15,
      speed: 1,
      rate: 7,
    },
    rain: {
      label: "Rain",
      icon: "rain",
      sky: "A passing rain",
      temp: 23,
      shade: 0.24,
      cloud: 0.68,
      wind: 0.4,
      speed: 1.15,
      rate: 170,
    },
    heavy: {
      label: "Heavy rain",
      icon: "heavy",
      sky: "The rains arrive",
      temp: 20,
      shade: 0.43,
      cloud: 0.92,
      wind: 0.75,
      speed: 1.4,
      rate: 440,
    },
    snow: {
      label: "Snow",
      icon: "snow",
      sky: "Highland flurries",
      temp: 2,
      shade: 0.18,
      cloud: 0.53,
      wind: 0.3,
      speed: 0.68,
      rate: 70,
    },
    storm: {
      label: "Thunderstorm",
      icon: "storm",
      sky: "A restless sky",
      temp: 19,
      shade: 0.62,
      cloud: 1,
      wind: 0.85,
      speed: 1.7,
      rate: 370,
    },
    tornado: {
      label: "Tornado",
      icon: "tornado",
      sky: "A turning wind",
      temp: 24,
      shade: 0.46,
      cloud: 0.92,
      wind: 1,
      speed: 1.95,
      rate: 85,
    },
  });

  class SeasonManager extends EventTarget {
    constructor() {
      super();
      this.current = "dry";
      this.elapsed = 0;
      this.duration = 60;
      this.wetness = 0;
    }
    set(season) {
      if (!["dry", "wet"].includes(season)) return;
      this.elapsed = 0;
      if (this.current === season) return;
      this.current = season;
      this.dispatchEvent(new Event("change"));
    }
    update(dt) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration)
        this.set(this.current === "dry" ? "wet" : "dry");
      // Exponential interpolation is independent of frame rate. A season change
      // alters the palette and behaviour parameters, never wildlife coordinates.
      this.wetness = approach(
        this.wetness,
        this.current === "wet" ? 1 : 0,
        0.55,
        dt,
      );
    }
    get remaining() {
      return Math.max(0, Math.ceil(this.duration - this.elapsed));
    }
  }

  /** All transient weather effects share one fixed allocation budget. */
  class ParticlePool {
    constructor(capacity = 1400) {
      this.capacity = capacity;
      this.active = [];
      this.free = [];
      for (let i = 0; i < capacity; i++)
        this.free.push({
          kind: "",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          age: 0,
          life: 0,
          size: 0,
          alpha: 0,
          angle: 0,
          spin: 0,
          seed: 0,
          floor: 0,
          band: 0,
        });
    }
    acquire(kind) {
      const p = this.free.pop();
      if (!p) return null; // Saturation drops an effect; it never grows the pool.
      p.kind = kind;
      p.x = p.y = p.vx = p.vy = p.age = p.angle = p.spin = p.floor = p.band = 0;
      p.life = 1;
      p.size = 1;
      p.alpha = 1;
      p.seed = Math.random();
      this.active.push(p);
      return p;
    }
    release(index) {
      const p = this.active[index];
      const last = this.active.pop();
      if (index < this.active.length) this.active[index] = last;
      this.free.push(p); // Swap removal is O(1); no splice or per-frame filtering.
    }
    clear() {
      while (this.active.length) this.free.push(this.active.pop());
    }
  }

  class Animal {
    constructor(species, name, initialX, lane, scale, speed) {
      this.species = species;
      this.name = name;
      // The opening tableau is a pre-rolled moment on the same left-to-right
      // route. Subsequent entries occur entirely outside the left edge.
      this.x = -270 + (initialX + 270);
      this.lane = lane;
      this.scale = scale;
      this.baseSpeed = speed;
      this.speed = speed;
      this.groundY = 0;
      this.phase = random(0, TAU);
      this.gait = this.phase;
      this.age = 0;
      this.state = "walking";
      this.stateTime = random(7, 17);
      this.restPose = 0;
      this.trunkPose = 0;
      this.altitude = 0;
      this.leader = null;
      this.gap = 140;
      this.wraps = 0;
      this.worldScale = scale;
      this.bounds = { left: 0, right: 0, top: 0, bottom: 0 };
    }
    enter(state, duration) {
      this.state = state;
      this.stateTime = duration;
    }
    environmentChanged(weather) {
      if (weather === "storm" || weather === "tornado" || weather === "heavy") {
        if (this.altitude > 1) this.enter("descending", 4);
        else this.enter("alert", random(6, 10));
        this.tree = null;
      }
    }
    nextState(env) {
      this.enter("walking", random(8, 16));
    }
    movement(env) {
      if (
        ["resting", "drinking", "climbing", "perching", "descending"].includes(
          this.state,
        )
      )
        return 0;
      let factor =
        WEATHER[env.weather].speed * (env.season === "wet" ? 1.28 : 1);
      if (this.state === "sniffing") factor *= 0.35;
      if (this.state === "stalking") factor *= 0.65;
      if (this.leader) {
        // Cyclic forward separation keeps a family together across the wrap.
        const route = WIDTH;
        let gap = (((this.leader.x - this.x) % route) + route) % route;
        if (gap > route * 0.6) gap -= route;
        const wanted =
          this.gap *
          (env.season === "dry" ? 0.83 : 1.15) *
          (env.weather === "tornado" ? 0.75 : 1);
        factor *= clamp(1 + (gap - wanted) * 0.0035, 0.55, 1.4);
      }
      return this.baseSpeed * factor;
    }
    update(dt, env) {
      this.age += dt;
      this.stateTime -= dt;
      if (this.stateTime <= 0) this.nextState(env);
      this.speed = approach(this.speed, this.movement(env), 3.5, dt);
      if (["climbing", "perching", "descending"].includes(this.state))
        this.speed = 0;
      this.x += this.speed * dt;
      this.gait +=
        (this.speed / this.baseSpeed) *
        dt *
        (this.species === "elephant" ? 2.4 : 4.4);
      this.restPose = approach(
        this.restPose,
        this.state === "resting" ? 1 : 0,
        2.6,
        dt,
      );
      this.trunkPose = approach(
        this.trunkPose,
        this.state === "sniffing" ? 1 : this.state === "drinking" ? -0.1 : 0.1,
        1.7,
        dt,
      );
      this.worldScale = this.scale * env.animalScale;
      const targetY =
        env.height * this.lane + Math.sin(this.x * 0.006 + this.phase) * 5;
      this.groundY = this.groundY
        ? approach(this.groundY, targetY, 3, dt)
        : targetY;
      if (this.x > WIDTH) {
        this.x -= WIDTH;
        this.wraps++;
        this.altitude = 0;
        this.tree = null;
        this.enter("walking", random(6, 18));
      }
      this.updateBounds();
    }
    updateBounds() {
      const s = this.worldScale;
      // Deliberately conservative, including the entire animated trunk/tail,
      // mane, feet, climb pose, and a small antialiasing margin.
      const extents =
        this.species === "elephant"
          ? [-136, 257, -210, 15]
          : this.species === "lion"
            ? [-128, 122, -122, 14]
            : [-184, 130, -155, 45];
      this.bounds.left = this.x + extents[0] * s;
      this.bounds.right = this.x + extents[1] * s;
      this.bounds.top = this.groundY - this.altitude + extents[2] * s;
      this.bounds.bottom = this.groundY - this.altitude + extents[3] * s;
      return this.bounds;
    }
    draw(c, time, selected) {
      // The same animal straddles both edges during a wrap: its leading edge
      // enters on the left while its trailing edge finishes exiting on the
      // right. No extra animal is allocated and the landscape stays populated.
      this.drawInstance(c, time, selected, 0);
      if (this.bounds.left < 0) this.drawInstance(c, time, selected, WIDTH);
      if (this.bounds.right > WIDTH)
        this.drawInstance(c, time, selected, -WIDTH);
    }
    drawInstance(c, time, selected, offset) {
      const s = this.worldScale;
      const x = this.x + offset;
      const shadowWidth = this.species === "elephant" ? 113 : 84;
      ellipse(
        c,
        x + 9 * s,
        this.groundY + 2,
        shadowWidth * s,
        11 * s,
        "#3a432d23",
      );
      if (selected) {
        c.save();
        c.setLineDash([5, 7]);
        c.lineDashOffset = -time * 6;
        c.beginPath();
        c.ellipse(x, this.groundY + 2, shadowWidth * s + 12, 16 * s, 0, 0, TAU);
        c.strokeStyle = "#fff5dccc";
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();
      }
      c.save();
      c.translate(x, this.groundY - this.altitude);
      c.scale(s, s);
      if (this.species === "elephant") this.paintElephant(c, time);
      else if (this.species === "lion") this.paintLion(c, time);
      else this.paintLeopard(c, time);
      c.restore();
    }
    paintLion(c, time) {
      const rest = this.restPose,
        walk = Math.sin(this.gait),
        bob = Math.sin(this.gait * 2) * 1.4 * (1 - rest);
      const male = this.male;
      const fur = this.cub ? "#cda150" : male ? "#c59b4f" : "#d2ae63";
      c.translate(0, rest * 23 + bob);
      // The tail, distant legs, body, near legs, mane, and face are separate layers.
      stroke(c, "#b08743", 5, (p) => {
        p.moveTo(-49, -51);
        p.bezierCurveTo(-89, -45, -85, -92 + walk * 5, -111, -86 + walk * 5);
      });
      ellipse(c, -111, -85 + walk * 5, 8, 5, "#635132", -0.5);
      for (let side = 0; side < 2; side++) {
        for (let leg = 0; leg < 2; leg++) {
          const root = leg === 0 ? -40 : 42;
          const sway =
            Math.sin(this.gait + leg * Math.PI + side * Math.PI) *
            9 *
            (1 - rest);
          const foot =
            -rest * 23 -
            Math.max(0, Math.cos(this.gait + leg * Math.PI + side * Math.PI)) *
              4 *
              (1 - rest);
          const x = root + side * 9;
          stroke(c, side === 0 ? "#a58240" : fur, leg === 0 ? 14 : 11, (p) => {
            p.moveTo(x, -39);
            p.lineTo(x - sway * 0.4 + rest * 9, -18 - rest * 7);
            p.lineTo(x + sway + rest * 18, foot - 5);
          });
          ellipse(
            c,
            x + sway + rest * 18 + 5,
            foot - 3,
            10,
            5,
            side === 0 ? "#a58240" : fur,
          );
        }
        if (side === 0) {
          ellipse(c, 0, -48, 63, 27, fur);
          ellipse(c, 5, -39, 49, 15, "#ddbd7b");
          c.beginPath();
          c.moveTo(-57, -54);
          c.bezierCurveTo(-42, -80, 24, -82, 52, -65);
          c.bezierCurveTo(12, -69, -13, -66, -57, -54);
          c.fillStyle = "#e1c482";
          c.fill();
        }
      }
      if (male) {
        c.beginPath();
        c.moveTo(32, -78);
        c.bezierCurveTo(33, -102, 64, -113, 86, -96);
        c.bezierCurveTo(110, -91, 100, -65, 100, -54);
        c.lineTo(87, -36);
        c.lineTo(74, -33);
        c.lineTo(59, -27);
        c.lineTo(44, -41);
        c.lineTo(29, -53);
        c.closePath();
        c.fillStyle = "#856437";
        c.fill();
        ellipse(c, 57, -69, 29, 35, "#957340", -0.15);
        stroke(c, "#ad8649", 2, (p) => {
          p.moveTo(45, -94);
          p.quadraticCurveTo(35, -67, 51, -45);
          p.moveTo(38, -81);
          p.quadraticCurveTo(35, -62, 42, -54);
        });
      }
      const headBob = Math.sin(time * 1.1 + this.phase) * 1.2;
      c.save();
      c.translate(0, headBob);
      ellipse(c, 61, -85, 10, 12, "#a57c40", -0.2);
      ellipse(c, 61, -86, 5, 6, "#dcc08b");
      ellipse(c, 74, -69, 25, 25, fur, -0.13);
      ellipse(c, 87, -60, 16, 11, "#e8d19d");
      ellipse(c, 91, -56, 9, 6, "#f0ddb4");
      c.beginPath();
      c.moveTo(94, -65);
      c.lineTo(103, -64);
      c.lineTo(99, -59);
      c.closePath();
      c.fillStyle = "#534732";
      c.fill();
      stroke(c, "#695437", 1, (p) => {
        p.moveTo(98, -59);
        p.quadraticCurveTo(98, -54, 92, -55);
      });
      if (rest > 0.6)
        stroke(c, "#50452f", 1.8, (p) => {
          p.moveTo(77, -73);
          p.quadraticCurveTo(80, -70, 84, -72);
        });
      else {
        ellipse(c, 80, -74, 3.5, 2.5, "#584b2f");
        ellipse(c, 81, -74.7, 1, 1, "#f8ecca");
      }
      stroke(c, "#b99250", 1.5, (p) => {
        p.moveTo(76, -80);
        p.lineTo(85, -79);
      });
      stroke(c, "#bca47b99", 0.7, (p) => {
        p.moveTo(92, -58);
        p.lineTo(109, -60);
        p.moveTo(91, -55);
        p.lineTo(108, -52);
      });
      c.restore();
    }
    paintElephant(c, time) {
      const g = this.gait,
        bob = Math.sin(g * 2) * 1.6;
      const skin = this.calf ? "#9c9e88" : "#8e9580";
      c.translate(0, bob);
      stroke(c, "#707d67", 5, (p) => {
        p.moveTo(-80, -122);
        p.bezierCurveTo(-116, -97, -100, -72, -118, -53 + Math.sin(g) * 8);
      });
      stroke(c, "#59634f", 6, (p) => {
        p.moveTo(-118, -53 + Math.sin(g) * 8);
        p.lineTo(-122, -43 + Math.sin(g) * 8);
      });
      const leg = (x, phase, near) => {
        const sway = Math.sin(g + phase) * 8;
        const lift = Math.max(0, Math.cos(g + phase)) * 4;
        c.beginPath();
        c.moveTo(x - 17, -76);
        c.lineTo(x + 14, -77);
        c.quadraticCurveTo(x + 11 - sway, -44, x + 14 + sway, -8 - lift);
        c.quadraticCurveTo(x + 16 + sway, 0 - lift, x + 5 + sway, 1 - lift);
        c.lineTo(x - 16 + sway, 1 - lift);
        c.quadraticCurveTo(x - 22 + sway, -1 - lift, x - 19 + sway, -13 - lift);
        c.lineTo(x - 17 - sway * 0.3, -47);
        c.closePath();
        c.fillStyle = near ? skin : "#72806c";
        c.fill();
        if (near) {
          for (let i = 0; i < 3; i++)
            ellipse(c, x - 10 + sway + i * 8, -1 - lift, 3.2, 3.2, "#c3c4a8");
          stroke(c, "#75816e", 1, (p) => {
            p.moveTo(x - 9 - sway, -36);
            p.lineTo(x + 8 - sway, -34);
            p.moveTo(x - 7 - sway, -32);
            p.lineTo(x + 6 - sway, -30);
          });
        }
      };
      leg(-47, 0, false);
      leg(57, Math.PI, false);
      ellipse(c, -8, -112, 85, 58, skin, -0.03);
      c.beginPath();
      c.moveTo(-89, -128);
      c.bezierCurveTo(-77, -166, -12, -183, 48, -151);
      c.bezierCurveTo(14, -158, -51, -157, -89, -128);
      c.fillStyle = "#b0b19a";
      c.fill();
      ellipse(c, 39, -113, 50, 53, skin);
      leg(-63, Math.PI, true);
      leg(43, 0, true);
      ellipse(c, 85, -129, 36, 43, skin, -0.15);
      ellipse(c, 85, -152, 29, 21, "#a0a48d");
      // A filled tapered trunk rotates at its root; sniffing and drinking are
      // sustained states rather than single-frame gestures.
      c.save();
      c.translate(108, -133);
      c.rotate(-this.trunkPose * 1.5);
      c.beginPath();
      c.moveTo(-4, -4);
      c.bezierCurveTo(30, 11, 19, 56, 27, 83);
      c.bezierCurveTo(35, 106, 49, 111, 51, 94);
      c.lineTo(57, 92);
      c.bezierCurveTo(62, 121, 36, 125, 23, 102);
      c.bezierCurveTo(4, 82, 5, 26, -9, 18);
      c.closePath();
      c.fillStyle = skin;
      c.fill();
      stroke(c, "#b1b59a", 2, (p) => {
        p.moveTo(9, 11);
        p.bezierCurveTo(23, 33, 15, 65, 31, 94);
      });
      for (let i = 0; i < 5; i++)
        stroke(c, "#707d694d", 1, (p) => {
          p.moveTo(13, 28 + i * 10);
          p.lineTo(22, 29 + i * 10);
        });
      c.restore();
      if (!this.calf) {
        c.beginPath();
        c.moveTo(99, -101);
        c.quadraticCurveTo(132, -71, 153, -86);
        c.quadraticCurveTo(137, -63, 96, -90);
        c.closePath();
        c.fillStyle = "#f3e7bb";
        c.fill();
        stroke(c, "#c5c19a", 1, (p) => {
          p.moveTo(101, -93);
          p.quadraticCurveTo(126, -76, 143, -80);
        });
      }
      const flap = Math.sin(time * 1.7 + this.phase) * 4;
      c.beginPath();
      c.moveTo(56, -158);
      c.bezierCurveTo(25 + flap, -186, 7 + flap, -147, 16 + flap, -115);
      c.bezierCurveTo(19 + flap, -94, 36, -84, 50, -103);
      c.bezierCurveTo(65, -119, 77, -153, 56, -158);
      c.fillStyle = "#7e8975";
      c.fill();
      c.beginPath();
      c.moveTo(52, -152);
      c.bezierCurveTo(27 + flap, -169, 20 + flap, -147, 25 + flap, -120);
      c.quadraticCurveTo(36, -93, 46, -114);
      c.bezierCurveTo(51, -123, 62, -145, 52, -152);
      c.fillStyle = "#a5a791";
      c.fill();
      stroke(c, "#bcc0a3", 1.4, (p) => {
        p.moveTo(49, -151);
        p.quadraticCurveTo(26, -159, 27 + flap, -128);
      });
      ellipse(c, 100, -136, 3.4, 2.5, "#374d3f");
      ellipse(c, 101, -137, 1, 1, "#d7dac0");
      stroke(c, "#63725f", 1.4, (p) => {
        p.moveTo(96, -142);
        p.lineTo(106, -140);
      });
      stroke(c, "#78846c55", 1.4, (p) => {
        p.moveTo(-60, -111);
        p.quadraticCurveTo(-54, -102, -56, -92);
        p.moveTo(-50, -115);
        p.quadraticCurveTo(-43, -105, -46, -95);
      });
      if (this.state === "drinking") {
        for (let i = 0; i < 3; i++)
          ellipse(
            c,
            158 + Math.sin(time * 4 + i) * 2,
            -12 + ((time * 27 + i * 6) % 15),
            1.7,
            3,
            "#bfd9c2bb",
          );
      }
    }
    paintLeopard(c, time) {
      const g = this.gait,
        climbing = this.state === "climbing" || this.state === "descending";
      c.save();
      if (climbing) c.rotate(-0.36);
      const bob = Math.sin(g * 2) * 1.5;
      c.translate(0, bob);
      const tailWave = Math.sin(time * 2 + this.phase) * 8;
      stroke(c, "#c29a52", 7, (p) => {
        p.moveTo(-49, -40);
        p.bezierCurveTo(-92, -28, -126, -89 + tailWave, -139, -64 + tailWave);
        p.quadraticCurveTo(-145, -51 + tailWave, -132, -51 + tailWave);
      });
      stroke(c, "#64522f", 7, (p) => {
        p.moveTo(-140, -61 + tailWave);
        p.quadraticCurveTo(-143, -51 + tailWave, -132, -51 + tailWave);
      });
      for (let side = 0; side < 2; side++) {
        for (let leg = 0; leg < 2; leg++) {
          const root = leg ? 43 : -42;
          const wave = Math.sin(g + leg * Math.PI + side * Math.PI);
          const x = root + side * 8,
            toe = x + wave * 12;
          const y =
            -3 - Math.max(0, Math.cos(g + leg * Math.PI + side * Math.PI)) * 5;
          stroke(c, side ? "#cda45a" : "#9d803e", 9, (p) => {
            p.moveTo(x, -34);
            p.lineTo(x - wave * 4, -19);
            p.lineTo(toe, y);
          });
          ellipse(c, toe + 5, y, 8, 4, side ? "#d7ba7e" : "#9d803e");
          if (side)
            for (let i = 0; i < 3; i++)
              ellipse(c, x - wave * 2, -28 + i * 7, 2, 1.7, "#6c592f");
        }
        if (!side) {
          ellipse(c, 0, -39, 62, 23, "#c69d50");
          ellipse(c, 5, -28, 51, 12, "#e6cc8d");
          c.save();
          c.beginPath();
          c.ellipse(0, -39, 62, 23, 0, 0, TAU);
          c.clip();
          for (const spot of this.spots) {
            c.beginPath();
            c.ellipse(spot.x, spot.y, spot.r, spot.r * 0.7, spot.a, 0.4, 5.6);
            c.strokeStyle = "#705b31";
            c.lineWidth = 1.7;
            c.stroke();
          }
          c.restore();
          stroke(c, "#e0bc72", 2, (p) => {
            p.moveTo(-47, -54);
            p.quadraticCurveTo(-5, -68, 40, -52);
          });
        }
      }
      ellipse(c, 58, -46, 19, 24, "#c8a157", -0.4);
      ellipse(c, 66, -65, 8, 9, "#6c5d38");
      ellipse(c, 66, -65, 4, 4, "#debf80");
      ellipse(c, 74, -49, 20, 19, "#d3ad62");
      ellipse(c, 89, -42, 13, 8, "#e6d29e");
      ellipse(c, 97, -46, 4, 2.7, "#584b2e");
      ellipse(c, 80, -53, 3.3, 2.3, "#3e482b");
      ellipse(c, 81, -53.5, 1.2, 1.2, "#eee2ae");
      for (let i = 0; i < 8; i++)
        ellipse(
          c,
          59 + (i % 3) * 9,
          -57 + Math.floor(i / 3) * 8,
          1.6,
          2,
          "#786135",
        );
      stroke(c, "#806637", 1, (p) => {
        p.moveTo(95, -42);
        p.quadraticCurveTo(93, -37, 87, -39);
        p.moveTo(79, -48);
        p.lineTo(82, -42);
      });
      stroke(c, "#b39d70", 0.7, (p) => {
        p.moveTo(88, -40);
        p.lineTo(105, -39);
        p.moveTo(86, -37);
        p.lineTo(102, -34);
      });
      c.restore();
    }
    get mood() {
      return (
        {
          walking:
            this.species === "elephant"
              ? "Following the family"
              : this.species === "lion"
                ? "With the pride"
                : "Quietly exploring",
          resting: "A moment of rest",
          patrolling: "On a gentle patrol",
          drinking: "At the waterhole",
          sniffing: "Testing the breeze",
          stalking: "Moving in the tall grass",
          approaching: "Finding an acacia",
          climbing: "Climbing an acacia",
          perching: "Watching from above",
          descending: "Returning to the plains",
          alert: "Keeping an eye on the sky",
        }[this.state] || "Wandering"
      );
    }
  }

  class Lion extends Animal {
    constructor(name, x, lane, scale, male = false, cub = false) {
      super("lion", name, x, lane, scale, cub ? 23 : 22);
      this.male = male;
      this.cub = cub;
    }
    nextState(env) {
      if (["storm", "heavy", "tornado"].includes(env.weather))
        return this.enter("alert", 5);
      if (
        this.state !== "resting" &&
        Math.random() < (env.season === "dry" ? 0.6 : 0.24)
      )
        this.enter("resting", random(4, 8));
      else this.enter("patrolling", random(10, 20));
    }
  }
  class Elephant extends Animal {
    constructor(name, x, lane, scale, calf = false) {
      super("elephant", name, x, lane, scale, 15);
      this.calf = calf;
      this.thirst = random(0.2, 0.7);
    }
    nextState(env) {
      if (["storm", "heavy", "tornado"].includes(env.weather))
        return this.enter("alert", 6);
      this.enter(
        this.state === "sniffing"
          ? "walking"
          : Math.random() < 0.7
            ? "sniffing"
            : "walking",
        random(4, 9),
      );
    }
    update(dt, env) {
      this.thirst += dt * (env.season === "dry" ? 0.033 : 0.017);
      if (
        this.x > 1080 &&
        this.x < 1260 &&
        this.thirst > 0.65 &&
        ["walking", "sniffing"].includes(this.state) &&
        !["storm", "heavy", "tornado", "snow"].includes(env.weather)
      ) {
        this.enter("drinking", 5.5);
        this.thirst = 0;
      }
      super.update(dt, env);
      if (this.state === "drinking") {
        this.groundY = approach(this.groundY, env.height * 0.731, 1.4, dt);
        this.updateBounds();
      }
    }
  }
  class Leopard extends Animal {
    constructor(name, x, lane, scale, seed) {
      super("leopard", name, x, lane, scale, 39);
      const rng = seeded(seed);
      this.spots = [];
      for (let i = 0; i < 45; i++)
        this.spots.push({
          x: rng() * 116 - 58,
          y: -62 + rng() * 45,
          r: 2 + rng() * 1.5,
          a: rng() * TAU,
        });
      this.tree = null;
      this.climbHeight = 0;
    }
    nextState(env) {
      if (["climbing", "perching", "descending"].includes(this.state)) {
        if (this.state === "perching") this.enter("descending", 6);
        else this.stateTime = 3;
        return;
      }
      if (["storm", "heavy", "tornado"].includes(env.weather))
        return this.enter("alert", 5);
      const target = env.trees.find(
        (t) => t.x > this.x + 18 && t.x < this.x + 500,
      );
      if (target && this.state !== "approaching" && Math.random() < 0.8) {
        this.tree = target;
        this.enter("approaching", 25);
      } else
        this.enter(
          this.state === "stalking" ? "walking" : "stalking",
          random(5, 10),
        );
    }
    update(dt, env) {
      super.update(dt, env);
      if (this.state === "approaching" && this.tree) {
        this.groundY = approach(
          this.groundY,
          env.height * this.tree.lane,
          1.5,
          dt,
        );
        if (this.x >= this.tree.x + 7) {
          this.climbHeight = 182 * this.tree.scale;
          this.enter("climbing", 6);
        }
      } else if (this.state === "climbing") {
        this.altitude = Math.min(this.climbHeight, this.altitude + dt * 70);
        if (this.altitude >= this.climbHeight)
          this.enter("perching", random(4, 7));
      } else if (this.state === "descending") {
        this.altitude = Math.max(0, this.altitude - dt * 82);
        if (this.altitude === 0) {
          this.tree = null;
          this.enter("walking", 10);
        }
      }
      if (
        this.tree &&
        ["climbing", "perching", "descending"].includes(this.state)
      )
        this.groundY = env.height * this.tree.lane;
      this.updateBounds();
    }
  }

  class Landscape {
    constructor() {
      this.cache = document.createElement("canvas");
      this.cacheContext = this.cache.getContext("2d");
      this.cacheKey = "";
      this.palette = {};
      this.time = 0;
      this.trees = [
        { x: 132, lane: 0.767, scale: 1.1, baseScale: 1.1 },
        { x: 1463, lane: 0.746, scale: 1.06, baseScale: 1.06 },
      ];
      const rng = seeded(63109);
      this.grass = Array.from({ length: 1050 }, () => ({
        x: rng() * WIDTH,
        v: 0.55 + Math.pow(rng(), 0.65) * 0.48,
        size: 2 + rng() * 12,
        bend: rng() * 10 - 5,
        tone: rng(),
        seed: rng() * TAU,
      }));
      this.clouds = Array.from({ length: 9 }, (_, i) => ({
        x: i * 240 - 100,
        y: 0.1 + rng() * 0.24,
        scale: 0.55 + rng() * 1.6,
        speed: 2 + rng() * 4,
      }));
      this.birds = Array.from({ length: 7 }, (_, i) => ({
        x: 590 + i * 32,
        y: 0.18 + rng() * 0.095,
        phase: rng() * TAU,
        size: 3 + rng() * 3,
      }));
      this.shrubs = Array.from({ length: 32 }, () => ({
        x: rng() * WIDTH,
        y: 0.6 + rng() * 0.25,
        size: 6 + rng() * 19,
      }));
      const grain = document.createElement("canvas");
      grain.width = grain.height = 160;
      const gc = grain.getContext("2d");
      for (let i = 0; i < 2400; i++) {
        gc.fillStyle = rng() > 0.5 ? "#fff8de0b" : "#37432c08";
        gc.fillRect(rng() * 160, rng() * 160, 0.5 + rng(), 0.5 + rng());
      }
      this.grain = gc.createPattern(grain, "repeat");
    }
    getPalette(wet, shade, snow) {
      const paletteKey = `${Math.round(wet * 256)}:${Math.round(shade * 256)}:${Math.round(snow * 128)}`;
      if (paletteKey === this.paletteKey) return this.palette;
      this.paletteKey = paletteKey;
      const recipes = {
        skyTop: [
          [241, 229, 192],
          [208, 224, 202],
        ],
        skyBottom: [
          [248, 222, 159],
          [231, 226, 169],
        ],
        mountainFar: [
          [196, 191, 143],
          [155, 182, 153],
        ],
        mountain: [
          [170, 175, 128],
          [121, 159, 131],
        ],
        mountainNear: [
          [160, 166, 110],
          [108, 147, 110],
        ],
        horizon: [
          [207, 192, 119],
          [150, 176, 111],
        ],
        field: [
          [205, 182, 97],
          [140, 166, 85],
        ],
        fieldLight: [
          [224, 198, 119],
          [166, 186, 102],
        ],
        fieldMid: [
          [190, 170, 83],
          [125, 155, 74],
        ],
        fieldNear: [
          [170, 156, 72],
          [104, 139, 69],
        ],
        front: [
          [143, 142, 67],
          [80, 122, 68],
        ],
        trail: [
          [224, 197, 127],
          [177, 181, 116],
        ],
        tree: [
          [91, 109, 57],
          [53, 95, 59],
        ],
        treeLight: [
          [128, 139, 74],
          [85, 133, 68],
        ],
        treeDark: [
          [75, 90, 47],
          [44, 80, 49],
        ],
        grassDark: [
          [115, 116, 56],
          [65, 111, 57],
        ],
        grassLight: [
          [226, 206, 137],
          [178, 198, 112],
        ],
        water: [
          [156, 170, 127],
          [125, 158, 130],
        ],
      };
      for (const key in recipes) {
        const [a, b] = recipes[key];
        const isGround = [
          "field",
          "fieldLight",
          "fieldMid",
          "fieldNear",
          "front",
          "trail",
          "horizon",
          "grassLight",
        ].includes(key);
        const s = isGround ? snow * 0.75 : snow * 0.18;
        const dry = a.map((v, i) => lerp(v, [235, 236, 215][i], s));
        const wetColor = b.map((v, i) => lerp(v, [235, 236, 215][i], s));
        this.palette[key] = color(
          dry,
          wetColor,
          wet,
          shade * (key.startsWith("sky") ? 0.93 : 0.55),
        );
      }
      return this.palette;
    }
    drawSky(c, env, weather, time) {
      const h = env.height,
        p = this.palette;
      const sky = c.createLinearGradient(0, 0, 0, h * 0.65);
      sky.addColorStop(0, p.skyTop);
      sky.addColorStop(1, p.skyBottom);
      c.fillStyle = sky;
      c.fillRect(0, 0, WIDTH, h);
      const sunX = WIDTH * 0.655 + Math.sin(time * 0.006) * 10,
        sunY = h * 0.232;
      const sunAlpha = 1 - weather.cloud * 0.87;
      c.save();
      c.globalAlpha = sunAlpha;
      const halo = c.createRadialGradient(sunX, sunY, 15, sunX, sunY, 178);
      halo.addColorStop(0, "#fffae54d");
      halo.addColorStop(0.4, "#fff7d735");
      halo.addColorStop(1, "#fff4c800");
      c.fillStyle = halo;
      c.fillRect(sunX - 180, sunY - 180, 360, 360);
      ellipse(c, sunX, sunY, 48, 48, "#fff6d2");
      ellipse(c, sunX, sunY, 42, 42, "#fff8db");
      c.restore();
      for (const cloud of this.clouds) {
        const x =
          ((cloud.x + time * cloud.speed * (1 + weather.wind * 2)) %
            (WIDTH + 600)) -
          300;
        c.save();
        c.translate(x, cloud.y * h);
        c.scale(cloud.scale, cloud.scale * 0.47);
        c.globalAlpha = 0.12 + weather.cloud * 0.23;
        c.fillStyle = weather.shade > 0.3 ? "#d9ddc5" : "#fff8e0";
        c.beginPath();
        c.moveTo(-100, 17);
        c.bezierCurveTo(-132, -4, -80, -21, -59, -14);
        c.bezierCurveTo(-42, -54, 22, -48, 37, -28);
        c.bezierCurveTo(79, -43, 100, -17, 103, -9);
        c.bezierCurveTo(160, -15, 177, 17, 122, 22);
        c.bezierCurveTo(67, 32, -62, 31, -100, 17);
        c.fill();
        c.restore();
      }
      // Each terrain layer has a different slow translation, like distant
      // landscape observed through a gently drifting field camera.
      const parallax = Math.sin(time * 0.018) * 7;
      c.save();
      c.translate(parallax * 0.4, 0);
      c.beginPath();
      c.moveTo(-30, h * 0.58);
      c.lineTo(-30, h * 0.44);
      c.bezierCurveTo(112, h * 0.4, 181, h * 0.48, 340, h * 0.445);
      c.bezierCurveTo(455, h * 0.42, 521, h * 0.32, 668, h * 0.34);
      c.bezierCurveTo(725, h * 0.31, 768, h * 0.335, 820, h * 0.373);
      c.bezierCurveTo(932, h * 0.412, 990, h * 0.41, 1080, h * 0.395);
      c.bezierCurveTo(1246, h * 0.357, 1295, h * 0.42, 1380, h * 0.45);
      c.lineTo(1630, h * 0.47);
      c.lineTo(1630, h * 0.62);
      c.closePath();
      c.fillStyle = p.mountainFar;
      c.fill();
      c.beginPath();
      c.moveTo(-30, h * 0.57);
      c.lineTo(-30, h * 0.51);
      c.bezierCurveTo(135, h * 0.42, 231, h * 0.39, 371, h * 0.48);
      c.bezierCurveTo(523, h * 0.55, 585, h * 0.43, 725, h * 0.448);
      c.bezierCurveTo(866, h * 0.48, 958, h * 0.48, 1040, h * 0.455);
      c.bezierCurveTo(1286, h * 0.41, 1386, h * 0.46, 1630, h * 0.48);
      c.lineTo(1630, h * 0.64);
      c.closePath();
      c.fillStyle = p.mountain;
      c.fill();
      c.restore();
      c.save();
      c.translate(parallax, 0);
      c.beginPath();
      c.moveTo(-30, h * 0.6);
      c.lineTo(-30, h * 0.49);
      c.bezierCurveTo(227, h * 0.47, 340, h * 0.56, 602, h * 0.52);
      c.bezierCurveTo(902, h * 0.47, 1030, h * 0.58, 1260, h * 0.51);
      c.bezierCurveTo(1410, h * 0.47, 1480, h * 0.49, 1630, h * 0.52);
      c.lineTo(1630, h * 0.65);
      c.closePath();
      c.fillStyle = p.mountainNear;
      c.fill();
      c.restore();
      const haze = c.createLinearGradient(0, h * 0.42, 0, h * 0.6);
      haze.addColorStop(0, "#f4e5bc00");
      haze.addColorStop(0.8, "#f4e5bc33");
      haze.addColorStop(1, "#f4e5bc00");
      c.fillStyle = haze;
      c.fillRect(0, h * 0.42, WIDTH, h * 0.18);
      if (weather.shade < 0.5) this.drawBirds(c, h, time);
    }
    drawBirds(c, h, time) {
      c.strokeStyle = "#737d585f";
      c.lineWidth = 1.5;
      c.lineCap = "round";
      for (const bird of this.birds) {
        const x = ((bird.x + time * 9) % (WIDTH + 80)) - 40;
        const y = bird.y * h + Math.sin(time * 0.4 + bird.phase) * 8;
        const wing = Math.sin(time * 3 + bird.phase) * bird.size * 0.8;
        c.beginPath();
        c.moveTo(x - bird.size, y - wing);
        c.quadraticCurveTo(x - 2, y - 2, x, y);
        c.quadraticCurveTo(x + 2, y - 2, x + bird.size, y - wing);
        c.stroke();
      }
    }
    buildTerrain(h, p) {
      const c = this.cacheContext;
      this.cache.width = WIDTH;
      this.cache.height = Math.ceil(h);
      c.clearRect(0, 0, WIDTH, h);
      const band = (y, shade, callback) => {
        c.beginPath();
        c.moveTo(0, h * y);
        callback(c);
        c.lineTo(WIDTH, h);
        c.lineTo(0, h);
        c.closePath();
        c.fillStyle = shade;
        c.fill();
      };
      band(0.56, p.horizon, (pth) =>
        pth.bezierCurveTo(650, h * 0.51, 1120, h * 0.55, WIDTH, h * 0.53),
      );
      band(0.604, p.field, (pth) => {
        pth.bezierCurveTo(380, h * 0.56, 550, h * 0.645, 890, h * 0.598);
        pth.bezierCurveTo(1300, h * 0.548, 1410, h * 0.6, WIDTH, h * 0.58);
      });
      band(0.645, p.fieldLight, (pth) => {
        pth.bezierCurveTo(540, h * 0.7, 690, h * 0.573, 1150, h * 0.639);
        pth.bezierCurveTo(1390, h * 0.658, 1500, h * 0.6, WIDTH, h * 0.63);
      });
      band(0.725, p.fieldMid, (pth) =>
        pth.bezierCurveTo(370, h * 0.615, 1140, h * 0.76, WIDTH, h * 0.67),
      );
      band(0.791, p.fieldNear, (pth) => {
        pth.bezierCurveTo(240, h * 0.743, 417, h * 0.824, 753, h * 0.784);
        pth.bezierCurveTo(1060, h * 0.75, 1290, h * 0.72, WIDTH, h * 0.806);
      });
      // An ochre trail winds through the grass and gradually widens towards us.
      c.beginPath();
      c.moveTo(528, h * 0.593);
      c.bezierCurveTo(480, h * 0.637, 914, h * 0.634, 902, h * 0.71);
      c.bezierCurveTo(862, h * 0.793, 395, h * 0.834, 485, h);
      c.lineTo(752, h);
      c.bezierCurveTo(546, h * 0.833, 1024, h * 0.803, 965, h * 0.706);
      c.bezierCurveTo(925, h * 0.64, 510, h * 0.624, 537, h * 0.592);
      c.closePath();
      c.fillStyle = p.trail;
      c.globalAlpha = 0.55;
      c.fill();
      c.globalAlpha = 1;
      band(0.955, p.front, (pth) => {
        pth.bezierCurveTo(268, h * 0.88, 506, h * 0.97, 878, h * 0.982);
        pth.bezierCurveTo(1210, h, 1296, h * 0.867, WIDTH, h * 0.91);
      });
      // Seeded marks are cached instead of generated on every animation frame.
      c.lineCap = "round";
      for (const grass of this.grass) {
        const y = grass.v * h,
          depth = (grass.v - 0.51) * 2;
        if (y > h + 4) continue;
        const size = grass.size * depth;
        c.strokeStyle = grass.tone < 0.5 ? p.grassDark : p.grassLight;
        c.globalAlpha = grass.tone < 0.5 ? 0.28 : 0.43;
        c.lineWidth = 0.6 + depth * 0.9;
        c.beginPath();
        c.moveTo(grass.x, y);
        c.quadraticCurveTo(
          grass.x - 2,
          y - size * 0.55,
          grass.x + grass.bend,
          y - size,
        );
        if (grass.tone > 0.24) {
          c.moveTo(grass.x, y);
          c.quadraticCurveTo(
            grass.x + size * 0.4,
            y - size * 0.5,
            grass.x + size * 0.5,
            y - size * 0.75,
          );
        }
        if (grass.tone > 0.7) {
          c.moveTo(grass.x, y);
          c.lineTo(grass.x - size * 0.45, y - size * 0.6);
        }
        c.stroke();
      }
      c.globalAlpha = 1;
      // Distant acacias give a second, smaller scale against the open plain.
      for (const tree of [
        { x: 367, y: 0.58, s: 0.2 },
        { x: 420, y: 0.584, s: 0.14 },
        { x: 860, y: 0.603, s: 0.37 },
        { x: 954, y: 0.586, s: 0.24 },
        { x: 1264, y: 0.56, s: 0.19 },
        { x: 1550, y: 0.585, s: 0.26 },
        { x: 46, y: 0.58, s: 0.18 },
      ]) {
        c.globalAlpha = 0.55;
        this.drawTree(c, tree.x, h * tree.y, tree.s, p, 0, true);
      }
      c.globalAlpha = 1;
      for (const shrub of this.shrubs) {
        c.globalAlpha = 0.3;
        ellipse(
          c,
          shrub.x,
          shrub.y * h,
          shrub.size,
          shrub.size * 0.21,
          p.treeLight,
        );
        ellipse(
          c,
          shrub.x + shrub.size * 0.5,
          shrub.y * h - 2,
          shrub.size * 0.55,
          shrub.size * 0.24,
          p.treeLight,
        );
      }
      c.globalAlpha = 1;
    }
    drawTerrain(c, env, weather, time) {
      const key = `${Math.round(env.height)}:${Math.round(env.wetness * 25)}:${Math.round(weather.shade * 25)}:${Math.round(weather.snowCover * 20)}`;
      if (key !== this.cacheKey) {
        this.cacheKey = key;
        this.buildTerrain(env.height, this.palette);
      }
      c.drawImage(this.cache, 0, 0);
      this.drawWater(c, env, weather, time);
    }
    drawWater(c, env, weather, time) {
      const h = env.height,
        p = this.palette,
        water = 0.64 + env.wetness * 0.3 + weather.puddles * 0.24;
      const x = 1244,
        y = h * 0.739;
      c.save();
      c.translate(x, y);
      c.scale(water, water);
      ellipse(c, 0, 0, 184, 33, p.trail, -0.015);
      ellipse(c, -3, -2, 164, 25, p.water, -0.016);
      ellipse(c, -12, -6, 138, 14, "#d9dabc38");
      for (let i = 0; i < 8; i++) {
        const offset = Math.sin(time * 0.7 + i * 1.4) * 5;
        stroke(c, i % 2 ? "#e6e5c675" : "#657e562b", 0.8, (pth) => {
          const px = -120 + ((i * 63) % 220);
          const py = -12 + i * 3.6;
          pth.moveTo(px + offset, py);
          pth.quadraticCurveTo(px + 13 + offset, py + 1, px + 32 + offset, py);
        });
      }
      for (let i = 0; i < 10; i++) {
        const rx = -149 + i * 31,
          ry = 17 + Math.sin(i * 1.2) * 7;
        stroke(c, p.grassDark, 1.5, (pth) => {
          pth.moveTo(rx, ry);
          pth.lineTo(rx - 3, ry - 12);
          pth.moveTo(rx, ry);
          pth.quadraticCurveTo(rx + 2, ry - 14, rx + 6, ry - 17);
        });
      }
      c.restore();
      if (weather.puddles > 0.015) {
        c.save();
        c.globalAlpha = weather.puddles * 0.6;
        for (const pool of [
          { x: 337, y: 0.838, w: 83 },
          { x: 821, y: 0.907, w: 104 },
          { x: 1050, y: 0.678, w: 41 },
          { x: 1534, y: 0.89, w: 64 },
        ]) {
          ellipse(c, pool.x, h * pool.y, pool.w, pool.w * 0.095, p.water);
          stroke(c, "#e5e9d6", 1, (pth) => {
            pth.moveTo(pool.x - pool.w * 0.5, h * pool.y - 2);
            pth.lineTo(pool.x + pool.w * 0.3, h * pool.y - 2);
          });
          const pulse = (time * 0.7 + pool.x) % 1;
          c.beginPath();
          c.ellipse(
            pool.x,
            h * pool.y,
            6 + pulse * 14,
            1 + pulse * 2,
            0,
            0,
            TAU,
          );
          c.strokeStyle = `rgba(229,233,214,${(1 - pulse) * 0.6})`;
          c.lineWidth = 0.8;
          c.stroke();
        }
        c.restore();
      }
    }
    drawTree(c, x, y, size, p, time, distant = false) {
      c.save();
      c.translate(x, y);
      c.scale(size, size);
      const sway = Math.sin(time * 0.7 + x) * (distant ? 0.7 : 1.5);
      if (!distant) ellipse(c, 28, 4, 151, 14, "#4555361a");
      c.fillStyle = distant ? "#7b8057" : "#706447";
      c.beginPath();
      c.moveTo(-13, 2);
      c.bezierCurveTo(-7, -57, -14, -131, -5, -199);
      c.lineTo(6, -213);
      c.bezierCurveTo(6, -148, 6, -64, 13, 1);
      c.closePath();
      c.fill();
      stroke(c, distant ? "#7b8057" : "#706447", 8, (pth) => {
        pth.moveTo(1, -154);
        pth.bezierCurveTo(-36, -185, -61, -211, -110 + sway, -232);
        pth.moveTo(1, -178);
        pth.bezierCurveTo(22, -200, 58, -216, 115 + sway, -238);
      });
      stroke(c, distant ? "#7b8057" : "#75694b", 5, (pth) => {
        pth.moveTo(-45, -193);
        pth.lineTo(-60, -245);
        pth.moveTo(39, -209);
        pth.lineTo(35, -256);
        pth.moveTo(-4, -194);
        pth.lineTo(-11, -267);
        pth.moveTo(77, -223);
        pth.lineTo(99, -261);
      });
      stroke(c, "#a3936677", 2.3, (pth) => {
        pth.moveTo(-7, -1);
        pth.quadraticCurveTo(-1, -106, -5, -157);
        pth.moveTo(-9, -174);
        pth.lineTo(-66, -222);
      });
      c.translate(sway, Math.sin(time * 0.5) * 0.7);
      // Broad, irregular, umbrella-shaped crowns characteristic of acacias.
      c.beginPath();
      c.moveTo(-191, -226);
      c.bezierCurveTo(-208, -245, -176, -256, -151, -255);
      c.bezierCurveTo(-155, -271, -115, -278, -93, -272);
      c.bezierCurveTo(-85, -294, -46, -303, -16, -289);
      c.bezierCurveTo(3, -310, 41, -301, 64, -287);
      c.bezierCurveTo(87, -296, 120, -277, 129, -268);
      c.bezierCurveTo(164, -273, 184, -257, 172, -246);
      c.bezierCurveTo(205, -242, 203, -226, 176, -222);
      c.bezierCurveTo(112, -208, 72, -217, 25, -220);
      c.bezierCurveTo(-35, -211, -142, -211, -191, -226);
      c.fillStyle = p.tree;
      c.fill();
      c.beginPath();
      c.moveTo(-190, -243);
      c.bezierCurveTo(-170, -258, -156, -254, -147, -254);
      c.bezierCurveTo(-139, -271, -110, -275, -87, -267);
      c.bezierCurveTo(-74, -292, -41, -292, -17, -282);
      c.bezierCurveTo(12, -306, 38, -290, 61, -280);
      c.bezierCurveTo(82, -288, 111, -274, 125, -263);
      c.bezierCurveTo(90, -265, 63, -259, 44, -265);
      c.bezierCurveTo(13, -255, -23, -266, -52, -250);
      c.bezierCurveTo(-99, -257, -132, -239, -190, -243);
      c.fillStyle = p.treeLight;
      c.fill();
      c.globalAlpha *= 0.45;
      c.beginPath();
      c.moveTo(-158, -229);
      c.bezierCurveTo(-105, -240, -64, -219, -16, -237);
      c.bezierCurveTo(38, -249, 54, -216, 99, -236);
      c.quadraticCurveTo(141, -233, 168, -229);
      c.bezierCurveTo(127, -213, 65, -220, 13, -222);
      c.quadraticCurveTo(-73, -211, -158, -229);
      c.fillStyle = p.treeDark;
      c.fill();
      c.restore();
    }
    drawForeground(c, env, weather, time) {
      const p = this.palette,
        h = env.height;
      for (let i = 0; i < 96; i++) {
        const grass = this.grass[i];
        const x = grass.x,
          y = h * (0.943 + grass.tone * 0.13);
        const blade = 8 + grass.size * 1.5;
        const bend = Math.sin(time * 1.8 + grass.seed) * (2 + weather.wind * 8);
        stroke(
          c,
          grass.tone > 0.45 ? p.grassLight : p.grassDark,
          1.2,
          (pth) => {
            pth.moveTo(x, y);
            pth.quadraticCurveTo(
              x + bend * 0.3,
              y - blade * 0.6,
              x + bend,
              y - blade,
            );
            pth.moveTo(x, y);
            pth.quadraticCurveTo(
              x + 8 + bend * 0.3,
              y - blade * 0.6,
              x + 12 + bend,
              y - blade * 0.75,
            );
            pth.moveTo(x, y);
            pth.quadraticCurveTo(
              x - 7 + bend * 0.3,
              y - blade * 0.5,
              x - 10 + bend,
              y - blade * 0.6,
            );
          },
        );
      }
      // A soft near-field vignette anchors the illustration without obscuring it.
      const foreground = c.createLinearGradient(0, h * 0.89, 0, h);
      foreground.addColorStop(0, "#414e2700");
      foreground.addColorStop(1, "#3c472b35");
      c.fillStyle = foreground;
      c.fillRect(0, h * 0.89, WIDTH, h * 0.11);
    }
    drawGrain(c, h) {
      c.fillStyle = this.grain;
      c.fillRect(0, 0, WIDTH, h);
    }
  }

  class ParticleSystem {
    constructor() {
      this.pool = new ParticlePool(1400);
      this.accumulator = 0;
    }
    reset() {
      this.pool.clear();
      this.accumulator = 0;
    }
    spawn(env, weather, initial = false) {
      const kind = ["rain", "heavy", "storm"].includes(weather.current)
        ? "rain"
        : weather.current === "snow"
          ? "snow"
          : weather.current === "tornado"
            ? "debris"
            : "dust";
      const p = this.pool.acquire(kind);
      if (!p) return;
      p.x = random(-60, WIDTH + 160);
      p.floor = env.height * random(0.61, 1.02);
      p.y = initial ? random(0, p.floor) : -25;
      p.angle = random(0, TAU);
      if (kind === "rain") {
        const heavy = weather.current !== "rain";
        p.vx = -55 - WEATHER[weather.current].wind * 160;
        p.vy = random(620, 950) * (heavy ? 1.23 : 1);
        p.size = random(12, 24) * (heavy ? 1.4 : 1);
        p.life = 5;
        p.alpha = random(0.25, 0.55);
      } else if (kind === "snow") {
        p.size = random(1.8, 4.6);
        p.vx = random(-17, 12);
        p.vy = random(28, 66);
        p.life = 45;
        p.alpha = random(0.4, 0.85);
        p.spin = random(0.4, 1.2);
      } else if (kind === "debris") {
        p.life = random(3, 6);
        p.size = random(1.8, 5);
        p.spin = random(3, 6);
        p.band = random(0.3, 1);
        p.alpha = random(0.35, 0.8);
        p.x = weather.tornado.x;
        p.y = weather.tornado.y;
      } else {
        p.y = env.height * random(0.54, 0.94);
        p.vx = random(8, 20);
        p.vy = random(-7, -1);
        p.life = random(4, 9);
        p.size = random(1, 2.7);
        p.alpha = random(0.2, 0.65);
      }
    }
    prime(env, weather) {
      const amount =
        weather.current === "sunny"
          ? 25
          : weather.current === "snow"
            ? 110
            : weather.current === "tornado"
              ? 35
              : 100;
      for (let i = 0; i < amount * env.quality; i++)
        this.spawn(env, weather, true);
    }
    update(dt, env, weather) {
      this.accumulator += WEATHER[weather.current].rate * env.quality * dt;
      const count = Math.min(80, Math.floor(this.accumulator));
      this.accumulator -= count;
      for (let i = 0; i < count; i++) this.spawn(env, weather);
      const active = this.pool.active;
      for (let i = active.length - 1; i >= 0; i--) {
        const p = active[i];
        p.age += dt;
        if (p.kind === "debris") {
          const progress = p.age / p.life;
          const radius = 17 + progress * progress * 159 * p.band;
          p.angle += dt * p.spin;
          p.x =
            weather.tornado.x +
            Math.cos(p.angle) * radius +
            Math.sin(progress * 5 + env.time) * 15;
          p.y =
            weather.tornado.y -
            progress * weather.tornado.height +
            Math.sin(p.angle) * radius * 0.19;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.kind === "snow") {
            p.angle += p.spin * dt;
            p.x += Math.sin(p.age * 2 + p.seed * 8) * 18 * dt;
          }
          if (p.kind === "dust") p.x += Math.sin(p.age + p.seed * 6) * 6 * dt;
          if (p.kind === "splash") p.vy += dt * 150;
        }
        if (p.kind === "rain" && p.y >= p.floor) {
          // Re-purpose the SAME pooled raindrop into a short ground splash.
          // There is no child allocation and nothing accumulates on the ground.
          if (p.seed > 0.48) {
            p.kind = "splash";
            p.y = p.floor;
            p.age = 0;
            p.life = 0.24;
            p.vx *= 0.08;
            p.vy = -random(15, 33);
            p.size = random(2, 5);
          } else this.pool.release(i);
        } else if (
          p.age >= p.life ||
          p.x < -220 ||
          p.x > WIDTH + 250 ||
          p.y > env.height + 20 ||
          (p.kind === "snow" && p.y > p.floor)
        )
          this.pool.release(i);
      }
    }
    draw(c, weather) {
      const particles = this.pool.active;
      c.save();
      c.lineWidth = 1.3;
      c.strokeStyle = weather.current === "rain" ? "#e2ecd584" : "#dce8d47a";
      c.beginPath();
      for (const p of particles)
        if (p.kind === "rain") {
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - (p.vx / p.vy) * p.size, p.y - p.size);
        }
      c.stroke();
      for (const p of particles) {
        if (p.kind === "rain") continue;
        const progress = p.age / p.life;
        c.globalAlpha =
          p.alpha * Math.min(1, (1 - progress) * 4, progress * 10 + 0.15);
        if (p.kind === "snow") {
          ellipse(c, p.x, p.y, p.size, p.size, "#fbfced");
          if (p.size > 4)
            stroke(c, "#fffdee", 1, (pth) => {
              pth.moveTo(p.x - 5, p.y);
              pth.lineTo(p.x + 5, p.y);
              pth.moveTo(p.x, p.y - 5);
              pth.lineTo(p.x, p.y + 5);
            });
        } else if (p.kind === "splash") {
          c.beginPath();
          c.ellipse(
            p.x,
            p.y,
            p.size * (1 + progress * 2),
            p.size * 0.32,
            0,
            Math.PI,
            TAU,
          );
          c.strokeStyle = "#e8ecd6";
          c.lineWidth = 0.9;
          c.stroke();
        } else if (p.kind === "debris")
          ellipse(
            c,
            p.x,
            p.y,
            p.size * 1.7,
            p.size * 0.6,
            p.seed > 0.5 ? "#b8ba82" : "#535e40",
            p.angle,
          );
        else ellipse(c, p.x, p.y, p.size, p.size * 0.75, "#fff3b5");
      }
      c.restore();
    }
  }

  class Tornado {
    constructor() {
      this.x = 1350;
      this.y = 480;
      this.height = 380;
      this.target = null;
      this.speed = 10;
    }
    update(dt, animals, h) {
      this.height = Math.min(h * 0.69, 460);
      let nearest = null,
        distance = Infinity;
      let nearestX = this.x;
      // Re-evaluate every step: Euclidean distance includes each animal's lane.
      // A bounded 10 units/second pursuit is slower than even walking elephants;
      // storm-alert animals can always move away. There is no teleportation.
      for (const animal of animals) {
        const bounds = animal.updateBounds();
        for (const offset of WRAP_OFFSETS) {
          if (bounds.right + offset < 0 || bounds.left + offset > WIDTH)
            continue;
          const x = clamp(animal.x + offset, 0, WIDTH);
          const d = (x - this.x) ** 2 + (animal.groundY - this.y) ** 2;
          if (d < distance) {
            distance = d;
            nearest = animal;
            nearestX = x;
          }
        }
      }
      this.target = nearest;
      if (!nearest) return;
      const dx = nearestX - this.x,
        dy = nearest.groundY - this.y;
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        this.x += (dx / length) * Math.min(length, this.speed * dt);
        this.y += (dy / length) * Math.min(length, this.speed * dt);
      }
    }
    draw(c, time) {
      const h = this.height;
      c.save();
      ellipse(c, this.x, this.y + 1, 92, 15, "#47504330");
      // Translucent overlapping bands describe a broad cloud funnel narrowing
      // to a twisting contact point. Airborne debris is handled by the pool.
      for (let i = 23; i >= 0; i--) {
        const t = i / 23,
          radius = 13 + Math.pow(t, 1.55) * 145;
        const x = this.x + Math.sin(t * 7 + time * 1.6) * (8 + t * 20);
        const y = this.y - t * h;
        ellipse(
          c,
          x,
          y,
          radius,
          9 + radius * 0.16,
          i % 2 ? "#56605242" : "#c4c6a74a",
        );
        c.beginPath();
        c.ellipse(
          x,
          y - 2,
          radius,
          9 + radius * 0.16,
          0,
          0.15 + time * 1.5 + i,
          Math.PI + time * 1.5 + i,
        );
        c.strokeStyle = i % 3 ? "#d9d4b154" : "#4c574445";
        c.lineWidth = 2.5;
        c.stroke();
      }
      c.restore();
    }
  }

  class LightningSystem {
    constructor() {
      this.bolt = null;
      this.cooldown = 2;
      this.strikes = 0;
      this.skipped = 0;
    }
    reset() {
      this.bolt = null;
      this.cooldown = 1.4;
    }
    isSafe(bolt, animals) {
      // The ENTIRE bolt and its fork fit inside [left, right]. By keeping that
      // corridor outside every expanded animal x-interval, even diagonal bolt
      // segments, climbing leopards, tails, and the 24px glow cannot intersect.
      for (const animal of animals) {
        const b = animal.updateBounds();
        // Edge fragments are the same animal rendered one world-width away;
        // they must be protected just as strictly as the primary silhouette.
        for (const offset of WRAP_OFFSETS) {
          if (
            bolt.right + 28 >= b.left + offset &&
            bolt.left - 28 <= b.right + offset
          )
            return false;
        }
      }
      return true;
    }
    makeBolt(animals, h) {
      const margin = 46;
      const intervals = [];
      for (const animal of animals) {
        const b = animal.updateBounds();
        for (const offset of WRAP_OFFSETS) {
          const left = b.left + offset - margin;
          const right = b.right + offset + margin;
          if (right > 8 && left < WIDTH - 8)
            intervals.push([Math.max(8, left), Math.min(WIDTH - 8, right)]);
        }
      }
      intervals.sort((a, b) => a[0] - b[0]);
      const gaps = [];
      let cursor = 8;
      for (const interval of intervals) {
        if (interval[0] - cursor >= 42) gaps.push([cursor, interval[0]]);
        cursor = Math.max(cursor, interval[1]);
      }
      if (WIDTH - 8 - cursor >= 42) gaps.push([cursor, WIDTH - 8]);
      if (!gaps.length) {
        this.skipped++;
        return null;
      }
      // Prefer spacious corridors but vary the strike position naturally.
      gaps.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
      const gap = gaps[Math.floor(Math.random() * Math.min(2, gaps.length))];
      const center = (gap[0] + gap[1]) / 2,
        jitter = Math.min(60, (gap[1] - gap[0]) * 0.39);
      const points = [],
        endY = h * random(0.66, 0.83);
      for (let i = 0; i < 9; i++)
        points.push({
          x: center + random(-jitter, jitter),
          y: lerp(-8, endY, i / 8),
        });
      const fork = [
        points[3],
        { x: center + jitter * 0.85, y: endY * 0.53 },
        { x: center - jitter * 0.7, y: endY * 0.7 },
      ];
      const xs = points.concat(fork).map((p) => p.x);
      const bolt = {
        points,
        fork,
        left: Math.min(...xs),
        right: Math.max(...xs),
        life: 0.2,
        duration: 0.2,
      };
      if (!this.isSafe(bolt, animals)) {
        this.skipped++;
        return null;
      }
      this.strikes++;
      return bolt;
    }
    update(dt, animals, h, onStrike) {
      if (this.bolt) {
        this.bolt.life -= dt;
        // Revalidate AFTER wildlife movement on EVERY frame of the flash. If
        // an animal enters the safe corridor, retire the bolt before rendering.
        if (this.bolt.life <= 0 || !this.isSafe(this.bolt, animals))
          this.bolt = null;
      }
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.bolt = this.makeBolt(animals, h);
        this.cooldown = this.bolt ? random(3.6, 6.5) : 0.55;
        if (this.bolt) onStrike();
      }
    }
    draw(c, animals, h, reducedMotion) {
      const bolt = this.bolt;
      if (!bolt || !this.isSafe(bolt, animals)) return;
      c.save();
      if (!reducedMotion) {
        c.fillStyle = `rgba(246,244,213,${(bolt.life / bolt.duration) * 0.075})`;
        c.fillRect(0, 0, WIDTH, h);
      }
      const trace = (points) => {
        c.beginPath();
        points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      };
      c.lineCap = "round";
      c.lineJoin = "round";
      c.globalAlpha = clamp(bolt.life / 0.055, 0, 1);
      trace(bolt.points);
      c.strokeStyle = "#eaf0bb20";
      c.lineWidth = 23;
      c.stroke();
      trace(bolt.points);
      c.strokeStyle = "#e9f1c47c";
      c.lineWidth = 8;
      c.stroke();
      trace(bolt.points);
      c.strokeStyle = "#fffbe2";
      c.lineWidth = 2.7;
      c.stroke();
      trace(bolt.fork);
      c.strokeStyle = "#f4f6d8b8";
      c.lineWidth = 1.3;
      c.stroke();
      c.restore();
    }
  }

  class WeatherManager extends EventTarget {
    constructor() {
      super();
      this.current = "sunny";
      this.shade = 0;
      this.cloud = 0.1;
      this.wind = 0.15;
      this.puddles = 0;
      this.snowCover = 0;
      this.particles = new ParticleSystem();
      this.tornado = new Tornado();
      this.lightning = new LightningSystem();
      this.primed = false;
    }
    set(mode, env) {
      if (
        !WEATHER[mode] ||
        (mode === "snow" && env.season !== "dry") ||
        mode === this.current
      )
        return false;
      this.current = mode;
      // Clearing returns every particle to the original pool. No old emitter,
      // splash, snowflake, or tornado leaf can survive a weather switch.
      this.particles.reset();
      this.lightning.reset();
      this.particles.prime(env, this);
      this.primed = true;
      this.dispatchEvent(new Event("change"));
      return true;
    }
    update(dt, env, animals, onStrike) {
      const target = WEATHER[this.current];
      this.shade = approach(this.shade, target.shade, 1.4, dt);
      this.cloud = approach(this.cloud, target.cloud, 1.2, dt);
      this.wind = approach(this.wind, target.wind, 1.5, dt);
      const raining = ["rain", "heavy", "storm"].includes(this.current);
      this.puddles = clamp(
        this.puddles +
          dt * (raining ? (this.current === "rain" ? 0.025 : 0.055) : -0.014),
        0,
        1,
      );
      this.snowCover = clamp(
        this.snowCover + dt * (this.current === "snow" ? 0.055 : -0.065),
        0,
        0.9,
      );
      if (!this.primed) {
        this.particles.prime(env, this);
        this.primed = true;
      }
      if (this.current === "tornado")
        this.tornado.update(dt, animals, env.height);
      if (this.current === "storm")
        this.lightning.update(dt, animals, env.height, onStrike);
      this.particles.update(dt, env, this);
    }
  }

  /** Optional, locally synthesized ambience; audio is created only on a click. */
  class Soundscape {
    constructor() {
      this.enabled = false;
      this.context = null;
      this.birdTimer = 3;
      this.silent = false;
    }
    async toggle() {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return false;
        this.context = new Audio();
        const ctx = this.context;
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(ctx.destination);
        this.filter = ctx.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.frequency.value = 450;
        this.filter.connect(this.master);
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const channel = buffer.getChannelData(0);
        let prev = 0;
        for (let i = 0; i < channel.length; i++) {
          prev = (prev + (Math.random() * 2 - 1) * 0.03) / 1.03;
          channel[i] = prev * 4;
        }
        this.noiseBuffer = buffer;
        this.wind = ctx.createBufferSource();
        this.wind.buffer = buffer;
        this.wind.loop = true;
        this.wind.connect(this.filter);
        this.wind.start();
      }
      try {
        await this.context.resume();
      } catch (_) {
        return false;
      }
      this.enabled = !this.enabled;
      return this.enabled;
    }
    chirp() {
      const ctx = this.context;
      if (!ctx || !this.enabled || this.silent) return;
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      const t = ctx.currentTime;
      osc.type = "sine";
      osc.frequency.setValueAtTime(random(1300, 1900), t);
      osc.frequency.exponentialRampToValueAtTime(random(2400, 3200), t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(1450, t + 0.23);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.34);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
    thunder() {
      const ctx = this.context;
      if (!ctx || !this.enabled || this.silent) return;
      const source = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      const t = ctx.currentTime;
      source.buffer = this.noiseBuffer;
      filter.type = "lowpass";
      filter.frequency.value = 170;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(1.8, t + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(t);
      source.stop(t + 1.6);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    }
    update(dt, weather, silent) {
      this.silent = silent;
      if (!this.context) return;
      const t = this.context.currentTime;
      const volume = this.enabled && !silent ? 0.24 : 0;
      const frequency = 300 + WEATHER[weather].wind * 1900;
      // Schedule only changes, not sixty identical automation events a second.
      if (volume !== this.volumeTarget) {
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(volume, t, 0.25);
        this.volumeTarget = volume;
      }
      if (frequency !== this.frequencyTarget) {
        this.filter.frequency.cancelScheduledValues(t);
        this.filter.frequency.setTargetAtTime(frequency, t, 0.8);
        this.frequencyTarget = frequency;
      }
      if (this.enabled && !silent && ["sunny", "rain"].includes(weather)) {
        this.birdTimer -= dt;
        if (this.birdTimer <= 0) {
          this.chirp();
          this.birdTimer = random(4, 11);
        }
      }
    }
    destroy() {
      if (this.context) {
        this.wind.stop();
        this.context.close();
      }
    }
  }

  class SavannahApp {
    constructor() {
      this.canvas = $("savanna-canvas");
      this.context = this.canvas.getContext("2d", { alpha: false });
      this.scene = $("scene");
      this.ecosystem = $("ecosystem");
      this.season = new SeasonManager();
      this.weather = new WeatherManager();
      this.landscape = new Landscape();
      this.sound = new Soundscape();
      this.events = new AbortController();
      this.reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      this.paused = this.reducedMotion;
      this.time = 0;
      this.lastTime = 0;
      this.uiTimer = 0;
      this.toastTimer = 0;
      this.fps = 60;
      this.destroyed = false;
      this.selectedSpecies = null;
      this.hovered = null;
      this.pinned = null;
      this.pinTimer = 0;
      this.debug = false;
      this.resizePending = true;
      this.weatherButtons = [...document.querySelectorAll("[data-weather]")];
      this.seasonButtons = [...document.querySelectorAll("[data-season]")];
      this.speciesButtons = [...document.querySelectorAll("[data-species]")];
      this.animals = [
        new Elephant("Amara", 353, 0.715, 0.98),
        new Elephant("Luma", 506, 0.73, 0.6, true),
        new Elephant("Nuru", 665, 0.682, 0.91),
        new Lion("Kito", 882, 0.856, 0.95, true),
        new Lion("Nia", 1060, 0.822, 0.89),
        new Lion("Ayo", 762, 0.85, 0.57, false, true),
        new Leopard("Zuri", 194, 0.906, 0.81, 412),
        new Leopard("Saba", 1290, 0.77, 0.81, 891),
      ];
      this.animals[0].leader = this.animals[1];
      this.animals[0].gap = 145;
      this.animals[1].leader = this.animals[2];
      this.animals[1].gap = 150;
      this.animals[3].leader = this.animals[4];
      this.animals[3].gap = 165;
      this.animals[5].leader = this.animals[3];
      this.animals[5].gap = 112;
      this.animals[3].stateTime = 9;
      this.animals[7].tree = this.landscape.trees[1];
      this.animals[7].enter("approaching", 25);
      this.environment = {
        height: 640,
        animalScale: 1,
        quality: 1,
        time: 0,
        season: "dry",
        wetness: 0,
        weather: "sunny",
        trees: this.landscape.trees,
      };
      this.drawables = [...this.animals, ...this.landscape.trees];
      this.onStrike = () => this.sound.thunder();
      this.bindEvents();
      this.resize();
      this.paintPortraits();
      this.syncControls();
      this.updateUI();
      this.render();
      this.frame = this.frame.bind(this);
      this.raf = requestAnimationFrame(this.frame);
    }
    listen(target, type, listener) {
      target.addEventListener(type, listener, { signal: this.events.signal });
    }
    bindEvents() {
      for (const button of this.weatherButtons) {
        button.setAttribute(
          "aria-label",
          WEATHER[button.dataset.weather].label,
        );
        this.listen(button, "click", () =>
          this.setWeather(button.dataset.weather),
        );
      }
      for (const button of this.seasonButtons) {
        button.setAttribute(
          "aria-label",
          button.dataset.season === "dry" ? "Dry season" : "Wet season",
        );
        this.listen(button, "click", () =>
          this.season.set(button.dataset.season),
        );
      }
      for (const button of this.speciesButtons)
        this.listen(button, "click", () => {
          this.selectedSpecies =
            this.selectedSpecies === button.dataset.species
              ? null
              : button.dataset.species;
          for (const b of this.speciesButtons) {
            const selected = b.dataset.species === this.selectedSpecies;
            b.classList.toggle("is-active", selected);
            b.setAttribute("aria-pressed", String(selected));
          }
          this.updateNotes();
          this.announce(
            this.selectedSpecies
              ? `Following the ${this.selectedSpecies}s. Look for the light rings around their feet.`
              : "Watching the whole ecosystem.",
          );
        });
      this.listen(this.weather, "change", () => {
        this.environment.weather = this.weather.current;
        for (const animal of this.animals)
          animal.environmentChanged(this.weather.current);
        this.syncControls();
        this.updateNotes();
        this.announce(
          `${WEATHER[this.weather.current].label}, ${this.season.current} season.`,
        );
      });
      this.listen(this.season, "change", () => {
        this.environment.season = this.season.current;
        if (this.season.current === "wet" && this.weather.current === "snow") {
          this.weather.set("rain", this.environment);
          this.showMessage("The wet season arrives. Snow gives way to rain.");
        } else
          this.showMessage(
            this.season.current === "wet"
              ? "New rains. New rhythms. Welcome to the wet season."
              : "The grass turns gold. The dry season is here.",
          );
        this.syncControls();
        this.updateNotes();
        this.updateUI();
        this.announce(
          `${this.season.current === "wet" ? "Wet" : "Dry"} season. The next season begins in sixty seconds.`,
        );
      });
      this.listen($("pause-button"), "click", () => this.togglePause());
      this.listen($("sound-button"), "click", () => this.toggleSound());
      this.listen($("fullscreen-button"), "click", () =>
        this.toggleFullscreen(),
      );
      this.listen(document, "fullscreenchange", () => this.syncFullscreen());
      this.listen($("guide-button"), "click", () => this.openGuide());
      this.listen($("shortcuts-button"), "click", () => this.openGuide());
      this.listen($("close-guide"), "click", () => $("field-guide").close());
      this.listen($("field-guide"), "click", (event) => {
        if (event.target !== $("field-guide")) return;
        const r = event.target.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          event.target.close();
      });
      this.listen(document, "keydown", (event) => this.onKey(event));
      this.listen(this.canvas, "pointermove", (event) => {
        if (event.pointerType === "touch") return;
        this.hovered = this.hitTest(event);
        this.hoverOffset = this.lastHitOffset;
        this.canvas.style.cursor = this.hovered ? "pointer" : "default";
        this.updateTooltip();
      });
      this.listen(this.canvas, "pointerleave", () => {
        this.hovered = null;
        this.updateTooltip();
      });
      this.listen(this.canvas, "click", (event) => {
        const animal = this.hitTest(event);
        this.pinned = this.pinned === animal ? null : animal;
        this.pinOffset = this.lastHitOffset;
        this.pinTimer = this.pinned ? 7 : 0;
        this.updateTooltip();
        if (this.pinned)
          this.announce(
            `${this.pinned.name}, ${this.pinned.species}. ${this.pinned.mood}.`,
          );
      });
      this.resizeObserver = new ResizeObserver(() => {
        this.resizePending = true;
      });
      this.resizeObserver.observe(this.scene);
      this.listen(window, "resize", () => {
        this.resizePending = true;
      });
      this.listen(document, "visibilitychange", () => {
        this.lastTime = 0;
        this.sound.update(
          0,
          this.weather.current,
          document.hidden || this.paused,
        );
      });
      this.listen(window, "pagehide", (event) => {
        if (!event.persisted) this.destroy();
      });
    }
    setWeather(mode) {
      if (mode === "snow" && this.season.current === "wet") {
        this.showMessage(
          "Highland snow is available in the dry season. Press S to switch.",
        );
        return false;
      }
      return this.weather.set(mode, this.environment);
    }
    resize() {
      this.resizePending = false;
      const rect = this.scene.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.cssWidth * dpr);
      this.canvas.height = Math.round(this.cssHeight * dpr);
      this.environment.height = (this.cssHeight / this.cssWidth) * WIDTH;
      this.environment.animalScale = clamp(1000 / this.cssWidth, 0.88, 1.2);
      this.environment.quality = this.cssWidth < 600 ? 0.58 : 1;
      for (const tree of this.landscape.trees) {
        const previous = tree.scale;
        tree.scale =
          tree.baseScale * clamp(this.environment.height / 640, 0.65, 1.55);
        for (const animal of this.animals) {
          if (animal.tree === tree) {
            animal.altitude *= tree.scale / previous;
            animal.climbHeight = 182 * tree.scale;
          }
        }
      }
      for (const animal of this.animals) {
        animal.groundY =
          this.environment.height *
          (animal.tree && animal.altitude ? animal.tree.lane : animal.lane);
        animal.worldScale = animal.scale * this.environment.animalScale;
        animal.updateBounds();
      }
      this.weather.tornado.y = this.environment.height * 0.77;
      this.landscape.cacheKey = "";
      this.updateTooltip();
    }
    /** Deterministic step size is supplied by the single animation loop.
     * Kept separate from rendering to make long-run simulation checks possible. */
    advance(dt) {
      this.time += dt;
      this.environment.time = this.time;
      this.season.update(dt);
      this.environment.season = this.season.current;
      this.environment.wetness = this.season.wetness;
      this.environment.weather = this.weather.current;
      for (const animal of this.animals) animal.update(dt, this.environment);
      this.weather.update(dt, this.environment, this.animals, this.onStrike);
    }
    frame(timestamp) {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(this.frame);
      if (document.hidden) {
        this.lastTime = 0;
        return;
      }
      const raw = this.lastTime ? (timestamp - this.lastTime) / 1000 : 1 / 60;
      this.lastTime = timestamp;
      const dt = clamp(raw, 0, 0.05); // Never jump after backgrounding or a slow frame.
      if (raw > 0) this.fps = approach(this.fps, Math.min(240, 1 / raw), 3, dt);
      if (this.resizePending) this.resize();
      if (!this.paused) this.advance(dt);
      this.sound.update(dt, this.weather.current, this.paused);
      if (this.pinTimer > 0) {
        this.pinTimer -= dt;
        if (this.pinTimer <= 0) this.pinned = null;
      }
      if (this.toastTimer > 0) {
        this.toastTimer -= dt;
        if (this.toastTimer <= 0) $("scene-message").hidden = true;
      }
      this.render();
      this.uiTimer += dt;
      if (this.uiTimer >= 0.25) {
        this.uiTimer = 0;
        this.updateUI();
      }
    }
    render() {
      const c = this.context,
        env = this.environment,
        w = this.weather;
      const scale = this.canvas.width / WIDTH;
      c.setTransform(scale, 0, 0, scale, 0, 0);
      this.landscape.getPalette(env.wetness, w.shade, w.snowCover);
      this.landscape.drawSky(c, env, w, this.time);
      this.landscape.drawTerrain(c, env, w, this.time);
      if (w.current === "tornado") w.tornado.draw(c, this.time);
      for (const tree of this.landscape.trees)
        tree.groundY = tree.lane * env.height;
      this.drawables.sort(
        (a, b) =>
          a.groundY - b.groundY || Number(!!a.species) - Number(!!b.species),
      );
      for (const item of this.drawables) {
        if (item.species)
          item.draw(
            c,
            this.time,
            item.species === this.selectedSpecies ||
              item === this.hovered ||
              item === this.pinned,
          );
        else
          this.landscape.drawTree(
            c,
            item.x,
            item.groundY,
            item.scale,
            this.landscape.palette,
            this.time * (1 + w.wind),
          );
      }
      this.landscape.drawForeground(c, env, w, this.time);
      w.particles.draw(c, w);
      if (w.current === "storm")
        w.lightning.draw(c, this.animals, env.height, this.reducedMotion);
      this.landscape.drawGrain(c, env.height);
    }
    paintPortraits() {
      for (const canvas of document.querySelectorAll("[data-portrait]")) {
        const animal = this.animals.find(
          (a) => a.species === canvas.dataset.portrait,
        );
        const c = canvas.getContext("2d");
        c.clearRect(0, 0, 140, 88);
        c.save();
        c.translate(animal.species === "leopard" ? 78 : 63, 77);
        const scale =
          animal.species === "elephant"
            ? 0.36
            : animal.species === "lion"
              ? 0.51
              : 0.47;
        c.scale(scale, scale);
        ellipse(c, 0, 2, 92, 7, "#7b855c18");
        if (animal.species === "elephant") animal.paintElephant(c, 0);
        else if (animal.species === "lion") animal.paintLion(c, 0);
        else animal.paintLeopard(c, 0);
        c.restore();
      }
    }
    syncControls() {
      for (const button of this.weatherButtons) {
        const active = button.dataset.weather === this.weather.current;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        if (button.dataset.weather === "snow") {
          button.disabled = this.season.current === "wet";
          button.title = button.disabled
            ? "Snow is available in the dry season. Switch seasons to explore."
            : "Snow — imaginative highland mode (4)";
        }
      }
      for (const button of this.seasonButtons) {
        const active = button.dataset.season === this.season.current;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      }
      const weather = WEATHER[this.weather.current],
        wet = this.season.current === "wet";
      this.scene.dataset.mood = ["heavy", "storm", "tornado"].includes(
        this.weather.current,
      )
        ? "dark"
        : "light";
      $("scene-weather-icon")
        .querySelector("use")
        .setAttribute("href", `#i-${weather.icon}`);
      $("scene-weather-name").textContent = weather.sky;
      $("temperature").textContent =
        `${weather.temp - (wet && this.weather.current === "sunny" ? 3 : 0)}°`;
      $("season-title").textContent = wet ? "THE WET SEASON" : "THE DRY SEASON";
      $("season-description").textContent = wet
        ? "Greener days. A new beginning."
        : "Golden days. Unhurried ways.";
      $("summary-icon")
        .querySelector("use")
        .setAttribute("href", wet ? "#i-sprout" : "#i-sun");
      this.syncPause();
      this.updateNotes();
    }
    updateUI() {
      const left = this.season.remaining;
      $("season-countdown").textContent =
        `${this.season.current === "dry" ? "Wet" : "Dry"} season arrives in ${left}s`;
      $("auto-count").textContent = `${left}s`;
      $("season-ring").style.strokeDashoffset = String(
        (138.23 * this.season.elapsed) / this.season.duration,
      );
      if (this.debug) {
        const pool = this.weather.particles.pool;
        $("debug-panel").textContent =
          `${Math.round(this.fps)} FPS  ·  ${this.paused ? "PAUSED" : "LIVE"}\n${pool.active.length} / ${pool.capacity} particles\n${pool.free.length} pooled & available\n8 wildlife · ${this.weather.current} · ${this.season.current}\n${this.weather.lightning.strikes} safe lightning strikes\n${this.weather.current === "tornado" ? "Following " + (this.weather.tornado.target?.name || "the breeze") : "D to hide performance"}`;
      }
      this.updateTooltip();
    }
    updateNotes() {
      const notes = {
        sunny:
          this.season.current === "wet"
            ? "Fresh grass, fuller waterholes.\nA new energy moves through the plains."
            : "In the golden hush of the dry season,\nlife moves a little slower.",
        rain: "The first drops settle the dust.\nThe plains take a long, quiet drink.",
        heavy:
          "Water gathers in the lowlands.\nThe families pick up their pace.",
        snow: "A little highland daydream.\nEven these restless feet slow down.",
        storm:
          "A bright sky, a watchful herd.\nEvery bolt finds an empty stretch of land.",
        tornado:
          "The wind has a mind of its own.\nThe wildlife stays one step ahead.",
      };
      const speciesNotes = {
        lion: "A pride is a small, wandering family.\nWatch for a pause in the afternoon sun.",
        elephant:
          "The little ones follow familiar footsteps.\nA trunk raised is a story in the air.",
        leopard:
          "Some paths are best travelled alone.\nAn acacia makes a perfect lookout.",
      };
      const note =
        speciesNotes[this.selectedSpecies] || notes[this.weather.current];
      $("field-note").replaceChildren(
        ...note
          .split("\n")
          .flatMap((line, i) =>
            i
              ? [document.createElement("br"), document.createTextNode(line)]
              : [document.createTextNode(line)],
          ),
      );
    }
    hitTest(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((event.clientY - rect.top) / rect.width) * WIDTH;
      for (let i = this.drawables.length - 1; i >= 0; i--) {
        const a = this.drawables[i];
        if (!a.species) continue;
        const b = a.bounds;
        for (const offset of WRAP_OFFSETS) {
          if (
            x >= b.left + offset &&
            x <= b.right + offset &&
            y >= b.top &&
            y <= b.bottom
          ) {
            this.lastHitOffset = offset;
            return a;
          }
        }
      }
      return null;
    }
    updateTooltip() {
      const animal = this.hovered || this.pinned,
        tip = $("animal-tooltip");
      if (!animal || animal.x < 0 || animal.x > WIDTH || !this.cssWidth) {
        tip.hidden = true;
        return;
      }
      tip.hidden = false;
      // All strings are fixed application data, but using text nodes also keeps
      // this inspection UI safe if names later become editable.
      if (
        tip.dataset.subject !== animal.name ||
        tip.dataset.state !== animal.state
      ) {
        const title = document.createElement("strong"),
          description = document.createElement("span");
        title.textContent = `${animal.name} · ${animal.species}`;
        description.textContent = animal.mood;
        tip.replaceChildren(title, description);
        tip.dataset.subject = animal.name;
        tip.dataset.state = animal.state;
      }
      const ratio = this.cssWidth / WIDTH;
      const halfWidth = Math.min(100, this.cssWidth * 0.3);
      let offset = (this.hovered ? this.hoverOffset : this.pinOffset) || 0;
      if (
        animal.bounds.right + offset < 0 ||
        animal.bounds.left + offset > WIDTH
      )
        offset = 0;
      tip.style.left = `${clamp((animal.x + offset) * ratio, halfWidth, this.cssWidth - halfWidth)}px`;
      tip.style.top = `${clamp((animal.bounds.top - 9) * ratio, this.cssHeight < 180 ? 48 : 64, this.cssHeight - 8)}px`;
    }
    togglePause() {
      this.paused = !this.paused;
      this.lastTime = 0;
      this.syncPause();
      this.announce(
        this.paused
          ? "The ecosystem is paused."
          : "The ecosystem is moving again.",
      );
    }
    syncPause() {
      const button = $("pause-button");
      button.setAttribute("aria-pressed", String(this.paused));
      button.setAttribute(
        "aria-label",
        this.paused ? "Resume ecosystem" : "Pause ecosystem",
      );
      button
        .querySelector("use")
        .setAttribute("href", this.paused ? "#i-play" : "#i-pause");
      this.scene.classList.toggle("is-paused", this.paused);
      $("live-text").textContent = this.paused
        ? "A MOMENT OF STILLNESS"
        : "LIVE ECOSYSTEM";
    }
    async toggleSound() {
      const enabled = await this.sound.toggle();
      if (!this.sound.context) {
        this.showMessage("Nature sounds are not supported by this browser.");
        return;
      }
      $("sound-button").setAttribute("aria-pressed", String(enabled));
      $("sound-button").setAttribute(
        "aria-label",
        enabled ? "Mute nature sounds" : "Enable nature sounds",
      );
      $("sound-button")
        .querySelector("use")
        .setAttribute("href", enabled ? "#i-sound" : "#i-muted");
      this.sound.update(0, this.weather.current, this.paused);
    }
    async toggleFullscreen() {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (this.ecosystem.classList.contains("is-expanded")) {
        this.ecosystem.classList.remove("is-expanded");
        this.syncFullscreen();
        return;
      }
      try {
        if (!this.ecosystem.requestFullscreen)
          throw new Error("Fullscreen unavailable");
        await this.ecosystem.requestFullscreen();
      } catch (_) {
        this.ecosystem.classList.add("is-expanded");
      }
      this.syncFullscreen();
    }
    syncFullscreen() {
      const expanded =
        document.fullscreenElement === this.ecosystem ||
        this.ecosystem.classList.contains("is-expanded");
      $("fullscreen-button").setAttribute("aria-pressed", String(expanded));
      $("fullscreen-button").setAttribute(
        "aria-label",
        expanded ? "Exit expanded view" : "Expand ecosystem",
      );
      this.resizePending = true;
    }
    openGuide() {
      if (!$("field-guide").open) $("field-guide").showModal();
    }
    onKey(event) {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ||
        event.target.isContentEditable
      )
        return;
      if ($("field-guide").open) return;
      const key = event.key.toLowerCase();
      if (
        key === "escape" &&
        this.ecosystem.classList.contains("is-expanded")
      ) {
        this.ecosystem.classList.remove("is-expanded");
        this.syncFullscreen();
        return;
      }
      if (/^[1-6]$/.test(key)) {
        event.preventDefault();
        this.setWeather(Object.keys(WEATHER)[Number(key) - 1]);
      } else if (key === "s") {
        event.preventDefault();
        this.season.set(this.season.current === "dry" ? "wet" : "dry");
      } else if (key === " " && event.target.tagName !== "BUTTON") {
        event.preventDefault();
        this.togglePause();
      } else if (key === "m") this.toggleSound();
      else if (key === "f") this.toggleFullscreen();
      else if (key === "g" || key === "?") this.openGuide();
      else if (key === "d") {
        this.debug = !this.debug;
        $("debug-panel").hidden = !this.debug;
        this.updateUI();
      }
    }
    showMessage(message) {
      $("scene-message").textContent = message;
      $("scene-message").hidden = false;
      this.toastTimer = 4;
      this.announce(message);
    }
    announce(message) {
      $("announcement").textContent = message;
    }
    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this.raf);
      this.resizeObserver.disconnect();
      this.events.abort();
      this.weather.particles.reset();
      this.sound.destroy();
    }
    /** Small inspection surface for the field guide's performance view and QA. */
    get diagnostics() {
      const pool = this.weather.particles.pool;
      return {
        weather: this.weather.current,
        season: this.season.current,
        animals: this.animals.length,
        particles: pool.active.length,
        available: pool.free.length,
        capacity: pool.capacity,
        fps: Math.round(this.fps),
        paused: this.paused,
        time: this.time,
        lightningSafe:
          !this.weather.lightning.bolt ||
          this.weather.lightning.isSafe(
            this.weather.lightning.bolt,
            this.animals,
          ),
      };
    }
  }

  window.savanna = new SavannahApp();
})();
