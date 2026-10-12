/* Generic object pool. Particles and splash sparks are acquired/released
   here so weather storms never allocate per-drop after warmup. */
(function (global) {
  "use strict";

  function ObjectPool(factory, reset, initial, max) {
    this.factory = factory;
    this.reset = reset;
    this.max = max || 2500;
    this.free = [];
    this.live = [];
    this.created = 0;
    const n = initial || 64;
    for (let i = 0; i < n; i++) {
      this.free.push(factory());
      this.created++;
    }
  }

  ObjectPool.prototype.acquire = function (init) {
    let obj;
    if (this.free.length) {
      obj = this.free.pop();
    } else if (this.created < this.max) {
      obj = this.factory();
      this.created++;
    } else {
      return null;
    }
    if (this.reset) this.reset(obj);
    if (init) init(obj);
    this.live.push(obj);
    return obj;
  };

  /* Compact live list: dead objects return to `free`. One linear pass, no
     splice, so a full rain field recycles in O(n) without GC churn. */
  ObjectPool.prototype.recycleDead = function (isAlive) {
    const live = this.live;
    const free = this.free;
    let w = 0;
    for (let i = 0; i < live.length; i++) {
      const obj = live[i];
      if (isAlive(obj)) {
        live[w++] = obj;
      } else {
        if (this.reset) this.reset(obj);
        free.push(obj);
      }
    }
    live.length = w;
  };

  ObjectPool.prototype.releaseAll = function () {
    const live = this.live;
    const free = this.free;
    for (let i = 0; i < live.length; i++) {
      if (this.reset) this.reset(live[i]);
      free.push(live[i]);
    }
    live.length = 0;
  };

  ObjectPool.prototype.liveCount = function () {
    return this.live.length;
  };

  ObjectPool.prototype.freeCount = function () {
    return this.free.length;
  };

  global.ObjectPool = ObjectPool;
})(window);
