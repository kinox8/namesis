// 名前 → 決定論的乱数。同じ名前からは必ず同じ個体が生まれる。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});

  // cyrb128: 文字列から 128bit のシードを作る
  function hashString(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  class RNG {
    constructor(seed) {
      const h = typeof seed === 'string' ? hashString(seed) : hashString(String(seed));
      this.f = sfc32(h[0], h[1], h[2], h[3]);
      for (let i = 0; i < 12; i++) this.f();
    }
    next() { return this.f(); }
    range(a, b) { return a + (b - a) * this.f(); }
    int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
    chance(p) { return this.f() < p; }
    pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
    // 三角分布 (0..1, 平均0.5) — 極端な値は出にくい
    tri() { return (this.f() + this.f()) / 2; }
    weighted(items, wfn) {
      let total = 0;
      for (const it of items) total += wfn(it);
      let r = this.f() * total;
      for (const it of items) {
        r -= wfn(it);
        if (r < 0) return it;
      }
      return items[items.length - 1];
    }
  }

  NS.hashString = hashString;
  NS.RNG = RNG;
})();
