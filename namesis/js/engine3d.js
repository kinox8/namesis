// 擬似3D描画エンジン: 透視投影カメラ・ニアクリップ付きポリゴン描画・色ユーティリティ・アニメーション
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});

  // ---------- 色 ----------
  const rgbCache = new Map();
  function hexToRgb(hex) {
    let c = rgbCache.get(hex);
    if (c) return c;
    const h = hex.replace('#', '');
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(hex, c);
    return c;
  }
  const toRgb = (c) => (typeof c === 'string' ? hexToRgb(c) : c);
  NS.col = {
    rgb: toRgb,
    mix(a, b, t) {
      a = toRgb(a); b = toRgb(b);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    },
    str(c, alpha = 1) {
      c = toRgb(c);
      return alpha >= 1
        ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
        : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
    },
    light(c, t) { return NS.col.mix(c, [255, 255, 255], t); },
    dark(c, t) { return NS.col.mix(c, [0, 0, 0], t); },
    lum(c) { c = toRgb(c); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; },
  };

  // ---------- カメラ ----------
  class Camera {
    constructor() {
      this.pos = { x: 0, y: 3.4, z: 9 };
      this.target = { x: 0, y: 0.5, z: -1 };
      this.f = 800; this.cx = 640; this.cy = 360; this.near = 0.15;
      this.update();
    }
    setViewport(w, h) {
      this.w = w; this.h = h;
      this.cx = w / 2; this.cy = h / 2;
      this.f = Math.min(h * 1.07, w * 0.8); // 縦長の画面でも 横一列が収まるように
    }
    update() {
      const p = this.pos, t = this.target;
      let fx = t.x - p.x, fy = t.y - p.y, fz = t.z - p.z;
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      // right = forward × up(0,1,0)
      let rx = -fz, rz = fx;
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      // up = right × forward
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
      this.F = [fx, fy, fz]; this.R = [rx, 0, rz]; this.U = [ux, uy, uz];
    }
    toCam(x, y, z) {
      const dx = x - this.pos.x, dy = y - this.pos.y, dz = z - this.pos.z;
      const R = this.R, U = this.U, F = this.F;
      return [dx * R[0] + dz * R[2], dx * U[0] + dy * U[1] + dz * U[2], dx * F[0] + dy * F[1] + dz * F[2]];
    }
    projCam(c) {
      const s = this.f / c[2];
      return { x: this.cx + c[0] * s, y: this.cy - c[1] * s, s, z: c[2] };
    }
    project(x, y, z) {
      const c = this.toCam(x, y, z);
      if (c[2] < this.near) return null;
      return this.projCam(c);
    }
    depth(x, y, z) { return this.toCam(x, y, z)[2]; }
  }
  NS.Camera = Camera;

  // ニア平面でクリップしてパスに追加する。pts: [[x,y,z],...]
  NS.pathPoly = function (ctx, cam, pts) {
    const cs = pts.map((p) => cam.toCam(p[0], p[1], p[2]));
    const n = cam.near;
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length];
      const ain = a[2] >= n, bin = b[2] >= n;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (n - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, n]);
      }
    }
    if (out.length < 3) return false;
    for (let i = 0; i < out.length; i++) {
      const p = cam.projCam(out[i]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    return true;
  };

  NS.fillPoly = function (ctx, cam, pts, fill) {
    ctx.beginPath();
    if (NS.pathPoly(ctx, cam, pts)) { ctx.fillStyle = fill; ctx.fill(); }
  };

  // 3D の折れ線 (区間ごとにクリップ)
  NS.pathLine = function (ctx, cam, pts) {
    let pen = false;
    for (let i = 0; i < pts.length - 1; i++) {
      let a = cam.toCam(pts[i][0], pts[i][1], pts[i][2]);
      let b = cam.toCam(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
      const n = cam.near;
      if (a[2] < n && b[2] < n) { pen = false; continue; }
      if (a[2] < n) { const t = (n - a[2]) / (b[2] - a[2]); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, n]; pen = false; }
      let cut = false;
      if (b[2] < n) { const t = (n - a[2]) / (b[2] - a[2]); b = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, n]; cut = true; }
      const pa = cam.projCam(a), pb = cam.projCam(b);
      if (!pen) ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      pen = !cut;
    }
  };

  // 床 (y=0) の上の楕円
  NS.floorEllipse = function (ctx, cam, x, z, rx, rz, seg = 18) {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push([x + Math.cos(a) * rx, 0.005, z + Math.sin(a) * rz]);
    }
    return NS.pathPoly(ctx, cam, pts);
  };

  // ---------- カメラリグ (注視点まわりの軌道カメラ + スムージング + 揺れ) ----------
  NS.rig = { yaw: 0, pitch: 0.3, dist: 11, tx: 0, ty: 0.6, tz: -1 };
  NS.rigGoal = Object.assign({}, NS.rig);
  NS.rigSpeed = 3.2;
  NS.shake = 0;
  NS.punch = 0; // 一瞬だけ寄る (会心など)
  NS.setRig = function (g, speed) {
    Object.assign(NS.rigGoal, g);
    if (speed) NS.rigSpeed = speed;
  };
  NS.snapRig = function (g) {
    Object.assign(NS.rigGoal, g);
    Object.assign(NS.rig, NS.rigGoal);
  };
  NS.updateRig = function (cam, dt, t) {
    const k = 1 - Math.exp(-dt * NS.rigSpeed);
    for (const key in NS.rig) NS.rig[key] += (NS.rigGoal[key] - NS.rig[key]) * k;
    const r = NS.rig;
    // ゆらぎ: 常にわずかに動くことで奥行き(視差)を感じさせる
    const yaw = r.yaw + Math.sin(t * 0.31) * 0.035;
    const pitch = r.pitch + Math.sin(t * 0.23) * 0.012;
    NS.shake *= Math.exp(-dt * 7);
    NS.punch *= Math.exp(-dt * 4);
    const dist = r.dist - NS.punch;
    const sh = NS.shake;
    const jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh;
    cam.target.x = r.tx + jx; cam.target.y = r.ty + jy; cam.target.z = r.tz;
    cam.pos.x = r.tx + Math.sin(yaw) * Math.cos(pitch) * dist + jx;
    cam.pos.y = r.ty + Math.sin(pitch) * dist + jy;
    cam.pos.z = r.tz + Math.cos(yaw) * Math.cos(pitch) * dist;
    cam.update();
  };

  // ---------- アニメーション ----------
  NS.speed = 1;
  NS.PACE = 1.15; // 全体のゆっくりさ (大きいほど遅い)。×1 / ×2 / ×3 の速度設定とは別
  const anims = [];
  const EASE = {
    linear: (p) => p,
    in: (p) => p * p,
    out: (p) => 1 - (1 - p) * (1 - p),
    inOut: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    back: (p) => { const c = 1.7; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
  };
  NS.EASE = EASE;
  // fn(e, p) を毎フレーム呼ぶ。e はイージング後の値
  NS.anim = function (ms, fn, ease = 'inOut') {
    return new Promise((res) => {
      anims.push({ t: 0, dur: Math.max(0.001, (ms / 1000) * NS.PACE / NS.speed), fn, ease: EASE[ease] || ease, res });
    });
  };
  NS.wait = (ms) => NS.anim(ms, null);
  NS.updateAnims = function (dt) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      if (a.fn) a.fn(a.ease(p), p);
      if (p >= 1) { anims.splice(i, 1); a.res(); }
    }
  };
  NS.lerp = (a, b, t) => a + (b - a) * t;
  NS.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  NS.wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
})();
