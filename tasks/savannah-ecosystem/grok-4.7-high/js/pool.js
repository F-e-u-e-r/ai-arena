(function (S) {
  'use strict';

  /**
   * Object pool. `acquire` never grows past `max` — it returns null and the
   * caller skips that spawn. `release` hands the same object back after reset.
   * Weather changes return every live particle here, so churn cannot leak.
   */
  class ObjectPool {
    constructor(factory, reset, initial, max) {
      this.factory = factory;
      this.reset = reset;
      this.max = max;
      this.created = 0;
      this.free = [];
      this.live = 0;
      const n = initial < max ? initial : max;
      for (let i = 0; i < n; i++) {
        const obj = factory();
        obj._pooled = true;
        this.free.push(obj);
        this.created++;
      }
    }

    acquire() {
      let obj = this.free.pop();
      if (!obj) {
        if (this.created >= this.max) return null;
        obj = this.factory();
        this.created++;
      }
      obj._pooled = false;
      this.live++;
      return obj;
    }

    release(obj) {
      if (!obj || obj._pooled) return;
      this.reset(obj);
      obj._pooled = true;
      this.free.push(obj);
      this.live--;
    }
  }

  S.ObjectPool = ObjectPool;
})(window.Savannah = window.Savannah || {});
