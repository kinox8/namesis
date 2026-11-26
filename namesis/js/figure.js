// キャラクター描画。2D の図形だが、向き(turn)と見下ろし角(pitch)で顔・耳・腕・立方体の頭が回り込み、
// グラデーションの陰影で立体的に見せる。単位は「ワールド 1m」= s ピクセル。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const C = NS.col;
  const HR = 0.27;          // 頭の半径
  const TOP = { round: 1, egg: 1.14, mochi: 0.74, onigiri: 1.0, box: 0.92, block: 1.12, cat: 1, bear: 1, hex: 1.02,
    spiky: 1.14, flame: 1.55, moon: 0.78, heart: 0.86, bunny: 1, star: 1.28, sun: 0.95, saturn: 1, devil: 1, castle: 1.12, meteor: 1.28, silkhat: 1.45, odango: 1.25, wings: 1 };
  NS.HEAD_TOP = TOP;
  const LIGHT = [-0.45, 0.6, 0.66];

  function rot(lx, ly, lz, turn, pitch) {
    const c = Math.cos(turn), s = Math.sin(turn);
    const x1 = lx * c + lz * s;
    const z1 = -lx * s + lz * c;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return [x1, ly * cp - z1 * sp, ly * sp + z1 * cp];
  }

  function ballGrad(ctx, x, y, r, base, ry) {
    const g = ctx.createRadialGradient(x - r * 0.38, y - (ry || r) * 0.45, r * 0.05, x, y, r * 1.18);
    g.addColorStop(0, C.str(C.light(base, 0.55)));
    g.addColorStop(0.42, C.str(base));
    g.addColorStop(1, C.str(C.dark(base, 0.48)));
    return g;
  }

  function capsule(ctx, x, y, w, h) {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starPath(ctx, n, ro, ri, rotA) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rotA + (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? ri : ro;
      const x = Math.sin(a) * r, y = -Math.cos(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  const SUN_LOBES = 12;

  // みかづき: 体の色のフードから 三日月の角が 左上と右へ のびる (単位 = 頭の半径、y 下向き)
  // [始点] と 3次ベジェ [c1, c2, 終点] の列。角は顔と同じ面にあるので、横を向くと 横幅が縮む
  const MOON_CURVE = [
    [-1.55, -1.38],
    [[-1.2, -1.02], [-0.6, -0.8], [0, -0.8]],         // 上のへこみ (左の角 → 中央)
    [[0.55, -0.8], [1.0, -0.62], [1.42, -0.46]],      // 中央 → 右の角
    [[1.2, -0.2], [0.95, -0.1], [0.88, 0.25]],        // 右の角の下側
    [[0.8, 0.75], [0.42, 1.04], [-0.05, 1.04]],       // あご
    [[-0.62, 1.04], [-1.2, 0.85], [-1.42, 0.3]],      // 左のほお
    [[-1.62, -0.25], [-1.62, -0.95], [-1.55, -1.38]], // 左の角の外側
  ];
  const MOON_PTS = (() => {
    const pts = [];
    let p = MOON_CURVE[0];
    for (const [c1, c2, e] of MOON_CURVE.slice(1)) {
      for (let i = 1; i <= 14; i++) {
        const u = i / 14, v = 1 - u;
        pts.push([
          v * v * v * p[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * e[0],
          v * v * v * p[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * e[1],
        ]);
      }
      p = e;
    }
    return pts;
  })();
  NS.MOON_TIP = MOON_CURVE[0];
  function moonPath(ctx, r, turn) {
    const c = Math.cos(turn || 0);
    let pts = MOON_PTS.map((p) => [p[0] * c * r, p[1] * r]);
    // 頭の丸み (横を向いても 丸いまま) と 同じ回り方向に そろえて 1つの形にする
    let area = 0;
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; });
    if (area < 0) pts = pts.reverse();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.ellipse(0, r * 0.14, r * 0.92, r * 0.9, 0, 0, Math.PI * 2);
  }

  // 頭のシルエット (頭の中心が原点、y は下向き)
  function headPath(ctx, key, r, t, turn) {
    ctx.beginPath();
    switch (key) {
      case 'moon': moonPath(ctx, r, turn); return;
      case 'egg': ctx.ellipse(0, -r * 0.06, r * 0.86, r * 1.08, 0, 0, Math.PI * 2); break;
      case 'mochi': ctx.ellipse(0, r * 0.1, r * 1.16, r * 0.84, 0, 0, Math.PI * 2); break;
      case 'onigiri': {
        const p = [[0, -r * 1.0], [r * 1.08, r * 0.82], [-r * 1.08, r * 0.82]];
        ctx.moveTo((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2);
        for (let i = 0; i < 3; i++) {
          const a = p[i], b = p[(i + 1) % 3];
          ctx.arcTo(a[0], a[1], b[0], b[1], r * 0.42);
        }
        ctx.closePath();
        break;
      }
      case 'hex': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const x = Math.cos(a) * r * 1.06, y = Math.sin(a) * r * 1.06;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;
      }
      case 'spiky': starPath(ctx, 11, r * 1.16, r * 0.93, t * 0.2); return;
      case 'sun': { // 丸い出っぱりが 12個ならぶ
        const n = SUN_LOBES, steps = 240;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI * 2;
          const u = ((th / (Math.PI * 2)) * n % 1) * 2 - 1;
          const rr = r * (0.9 + 0.24 * Math.sqrt(Math.max(0, 1 - u * u)));
          const x = Math.cos(th - Math.PI / 2) * rr, y = Math.sin(th - Math.PI / 2) * rr;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        return;
      }
      case 'star': starPath(ctx, 5, r * 1.32, r * 0.72, 0); return;
      case 'meteor': starPath(ctx, 5, r * 1.32, r * 0.72, 0); return; // 星の 頭 (尾は うしろの 飾り)
      case 'silkhat': { // 高い 筒 (上が 少し ひろい)。下は 丸く 顔を つつむ。つばは うしろの 飾り
        ctx.moveTo(-r * 1.0, -r * 1.45);
        ctx.quadraticCurveTo(0, -r * 1.56, r * 1.0, -r * 1.45);
        ctx.quadraticCurveTo(r * 0.92, -r * 0.2, r * 0.9, r * 0.45);
        ctx.bezierCurveTo(r * 0.88, r * 1.05, -r * 0.88, r * 1.05, -r * 0.9, r * 0.45);
        ctx.quadraticCurveTo(-r * 0.92, -r * 0.2, -r * 1.0, -r * 1.45);
        ctx.closePath();
        return;
      }
      case 'castle': { // 塔: 下すぼまりの 筒 + 張りだした 上の段 + 凸が 3つの のこぎり壁
        const bw = r * 0.9, mw = r * 0.98, tw = r * 1.1, by = r * 0.95, my = -r * 0.5, ty = -r * 0.72, cy = -r * 1.12, ny = -r * 0.84;
        const gap = (tw * 2) / 5; // 凸 3つ・凹 2つ
        ctx.moveTo(-bw, by);
        ctx.lineTo(-mw, my);
        ctx.lineTo(-tw, ty);
        ctx.lineTo(-tw, cy);
        for (let i = 0; i < 5; i++) {
          const x1 = -tw + gap * (i + 1);
          if (i % 2) { ctx.lineTo(x1, ny); ctx.lineTo(x1, cy); } // 凹
          else { ctx.lineTo(x1, cy); if (i < 4) ctx.lineTo(x1, ny); } // 凸
        }
        ctx.lineTo(tw, ty);
        ctx.lineTo(mw, my);
        ctx.lineTo(bw, by);
        ctx.quadraticCurveTo(0, by + r * 0.12, -bw, by);
        ctx.closePath();
        return;
      }
      case 'flame': {
        const sw = Math.sin(t * 3) * r * 0.12;
        ctx.moveTo(-r * 0.95, r * 0.15);
        ctx.bezierCurveTo(-r * 0.95, -r * 0.6, -r * 0.2, -r * 0.9, sw, -r * 1.55);
        ctx.bezierCurveTo(r * 0.25, -r * 0.95, r * 0.95, -r * 0.6, r * 0.95, r * 0.15);
        ctx.bezierCurveTo(r * 0.95, r * 0.75, r * 0.5, r * 0.98, 0, r * 0.98);
        ctx.bezierCurveTo(-r * 0.5, r * 0.98, -r * 0.95, r * 0.75, -r * 0.95, r * 0.15);
        ctx.closePath();
        break;
      }
      case 'heart': {
        ctx.moveTo(0, r * 0.98);
        ctx.bezierCurveTo(-r * 0.4, r * 0.7, -r * 1.25, r * 0.25, -r * 1.12, -r * 0.35);
        ctx.bezierCurveTo(-r * 1.0, -r * 0.95, -r * 0.2, -r * 1.0, 0, -r * 0.5);
        ctx.bezierCurveTo(r * 0.2, -r * 1.0, r * 1.0, -r * 0.95, r * 1.12, -r * 0.35);
        ctx.bezierCurveTo(r * 1.25, r * 0.25, r * 0.4, r * 0.7, 0, r * 0.98);
        ctx.closePath();
        break;
      }
      default: ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
  }

  // 立方体の頭。見えている面だけを面ごとの陰影で描く
  function drawBoxHead(ctx, w, h, d, base, turn, pitch, out) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const V = [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd], [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]]
      .map((c) => rot(c[0], c[1], c[2], turn, pitch));
    const faces = [
      { i: [4, 5, 6, 7], n: [0, 0, 1], front: true }, { i: [1, 0, 3, 2], n: [0, 0, -1] },
      { i: [5, 1, 2, 6], n: [1, 0, 0] }, { i: [0, 4, 7, 3], n: [-1, 0, 0] },
      { i: [7, 6, 2, 3], n: [0, 1, 0] }, { i: [0, 1, 5, 4], n: [0, -1, 0] },
    ];
    ctx.lineJoin = 'round';
    for (const f of faces) {
      const n = rot(f.n[0], f.n[1], f.n[2], turn, pitch);
      if (n[2] <= 0.001) continue;
      const lit = 0.5 + 0.55 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      const col = lit > 1 ? C.light(base, (lit - 1) * 1.4) : C.dark(base, 1 - lit);
      ctx.beginPath();
      f.i.forEach((k, j) => { const p = V[k]; if (j === 0) ctx.moveTo(p[0], -p[1]); else ctx.lineTo(p[0], -p[1]); });
      ctx.closePath();
      ctx.fillStyle = C.str(col);
      ctx.strokeStyle = C.str(col);
      ctx.lineWidth = w * 0.16;
      ctx.stroke();
      ctx.fill();
      if (f.front) out.front = f.i.map((k) => V[k]);
    }
    // 外形 (クリップ用) は前面が見えるときのみ使う
    const fz = rot(0, 0, 1, turn, pitch)[2];
    const c = rot(0, 0, hd, turn, pitch), ux = rot(1, 0, 0, turn, pitch), uy = rot(0, -1, 0, turn, pitch);
    out.frame = { ox: c[0], oy: -c[1], ax: ux[0], ay: -ux[1], bx: uy[0], by: -uy[1], vis: fz, scale: Math.min(hw, hh) };
  }

  // ---------------- 顔 ----------------
  // フードの穴から 肌色の顔と前髪がのぞくデザイン (顔座標: 単位 = 頭の半径、y 下向き)
  const PLATE = { x: 0, y: 0.17, rx: 0.72, ry: 0.67 };
  // 頭の形ごとの 顔の大きさ・上下位置 (頭の半径に対する比)
  const FACE_FIT = {
    round: [1, 0], egg: [0.98, 0.04], mochi: [0.92, 0.12], onigiri: [0.74, 0.22], cat: [1, 0], bear: [1, 0], bunny: [1, 0],
    hex: [0.92, 0.02], spiky: [0.9, 0], flame: [0.86, 0.1], moon: [0.96, 0.1], heart: [0.84, 0.06], star: [0.76, 0.04], sun: [0.8, 0.03], saturn: [1, 0.04], castle: [0.9, 0.12], meteor: [0.76, 0.04],
    silkhat: [0.92, 0.24], odango: [1, 0], wings: [1, 0],
  };
  const INK_FACE = '#2a1c16';

  function platePath(ctx, boxy) {
    ctx.beginPath();
    if (boxy) capsule(ctx, -0.8, -0.5, 1.6, 1.36);
    else ctx.ellipse(PLATE.x, PLATE.y, PLATE.rx, PLATE.ry, 0, 0, Math.PI * 2);
  }

  // 前髪 (顔の穴の中だけに描く)。ゆるキャラらしく 毛の線は入れず ぺたっと塗る
  function drawHair(ctx, L) {
    if (!L.hair) return;
    const hc = L.hairColor;
    ctx.save();
    ctx.translate(0, 0.02);
    const g = ctx.createLinearGradient(0, -0.7, 0, 0.1);
    g.addColorStop(0, C.str(C.light(hc, 0.12)));
    g.addColorStop(1, C.str(C.dark(hc, 0.12)));
    ctx.fillStyle = g;
    ctx.beginPath();
    switch (L.hair) {
      case 'bangs': // ぱっつん (まるい3つの ふくらみ)
        ctx.moveTo(-0.85, -0.8); ctx.lineTo(0.85, -0.8); ctx.lineTo(0.85, -0.28);
        for (let i = 3; i >= 1; i--) {
          const x0 = -0.85 + (i / 3) * 1.7, x1 = -0.85 + ((i - 1) / 3) * 1.7;
          ctx.quadraticCurveTo((x0 + x1) / 2, -0.08, x1, -0.28);
        }
        break;
      case 'side': // 流した前髪
        ctx.moveTo(-0.85, -0.8); ctx.lineTo(0.85, -0.8); ctx.lineTo(0.85, -0.05);
        ctx.quadraticCurveTo(0.45, -0.18, 0.1, -0.28);
        ctx.quadraticCurveTo(-0.4, -0.38, -0.85, -0.3);
        break;
      case 'part': // まんなか分け
        ctx.moveTo(0, -0.6);
        ctx.quadraticCurveTo(-0.4, -0.35, -0.85, -0.12); ctx.lineTo(-0.85, -0.8); ctx.lineTo(0.85, -0.8); ctx.lineTo(0.85, -0.12);
        ctx.quadraticCurveTo(0.4, -0.35, 0, -0.6);
        break;
      case 'spiky': { // ギザギザ
        ctx.moveTo(-0.85, -0.8); ctx.lineTo(0.85, -0.8); ctx.lineTo(0.85, -0.3);
        const n = 4;
        for (let i = n; i >= 0; i--) ctx.lineTo(-0.85 + (i / n) * 1.7, i % 2 ? -0.2 : -0.38);
        break;
      }
      case 'bob': // ボブ (横の髪が 顔をはさむ)
        ctx.moveTo(-0.85, -0.8); ctx.lineTo(0.85, -0.8); ctx.lineTo(0.85, 0.6);
        ctx.quadraticCurveTo(0.66, 0.62, 0.6, 0.3);
        ctx.quadraticCurveTo(0.56, -0.15, 0.4, -0.24);
        ctx.quadraticCurveTo(0, -0.18, -0.4, -0.24);
        ctx.quadraticCurveTo(-0.56, -0.15, -0.6, 0.3);
        ctx.quadraticCurveTo(-0.66, 0.62, -0.85, 0.6);
        break;
      case 'curly': // もこもこ
        for (const [x, y, rr] of [[-0.58, -0.38, 0.22], [-0.2, -0.33, 0.22], [0.2, -0.33, 0.22], [0.58, -0.38, 0.22], [-0.3, -0.6, 0.25], [0.3, -0.6, 0.25]]) {
          ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, Math.PI * 2);
        }
        ctx.rect(-0.85, -0.85, 1.7, 0.3);
        break;
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ゆるキャラの目: 黒い丸に 白い光
  function dotEye(ctx, x, y, rx, ry, hi = true) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK_FACE;
    ctx.fill();
    if (!hi) return;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + rx * 0.3, y - ry * 0.35, Math.min(rx, ry) * 0.38, 0, Math.PI * 2); ctx.fill();
  }
  function sparkle(ctx, x, y, R) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? R * 0.25 : R;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // デフォルメ顔 (ゆるキャラ風): はなれた小さな目・小さな口・大きなほっぺ。まゆと鼻は描かない
  function drawFace(ctx, ch, base, o, boxy) {
    const L = ch.look;
    const t = o.t || 0;
    const expr = o.expr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // たいようの頭: 顔のまわりの フードが 輪のように盛り上がっている
    if (ch.head === 'sun') {
      ctx.beginPath();
      ctx.ellipse(PLATE.x, PLATE.y, PLATE.rx + 0.11, PLATE.ry + 0.11, 0, 0, Math.PI * 2);
      const rg = ctx.createLinearGradient(-0.6, -0.5, 0.6, 0.9);
      rg.addColorStop(0, C.str(C.light(base, 0.35)));
      rg.addColorStop(0.5, C.str(base));
      rg.addColorStop(1, C.str(C.dark(base, 0.35)));
      ctx.strokeStyle = rg;
      ctx.lineWidth = 0.18;
      ctx.stroke();
    }
    // 肌 (ふちに影は入れない)
    platePath(ctx, boxy);
    const sk = ctx.createRadialGradient(-0.18, -0.05, 0.05, 0, 0.12, 0.85);
    sk.addColorStop(0, C.str(C.light(L.skin, 0.22)));
    sk.addColorStop(1, C.str(L.skin));
    ctx.fillStyle = sk;
    ctx.fill();

    ctx.save();
    platePath(ctx, boxy);
    ctx.clip();
    // ほっぺ (まる / だえん / 斜線 / なし)
    const blush = expr === 'happy' && !L.blush ? 'round' : L.blush === undefined ? 'round' : L.blush;
    const by = Math.min(0.5, (L.eyeY == null ? 0.2 : L.eyeY) + 0.18);
    if (blush) {
      ctx.fillStyle = 'rgba(255,100,120,0.42)';
      ctx.strokeStyle = 'rgba(240,80,100,0.7)';
      ctx.lineWidth = 0.03;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        if (blush === 'round') { ctx.ellipse(sx * 0.5, by, 0.12, 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (blush === 'oval') { ctx.ellipse(sx * 0.5, by, 0.16, 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
        else { for (let k = -1; k <= 1; k++) { ctx.moveTo(sx * 0.5 + k * 0.06 - 0.03, by + 0.05); ctx.lineTo(sx * 0.5 + k * 0.06 + 0.03, by - 0.05); } ctx.stroke(); }
      }
    }
    drawHair(ctx, L);
    ctx.restore();

    // 目 (種類・大きさ・はなれ具合・高さ で 個性が出る)
    const k = L.eyeScale || 1;
    const EX = L.eyeGap || 0.34, EY = L.eyeY == null ? 0.2 : L.eyeY;
    const blink = ((t + L.phase) % 4.3) < 0.13;
    let eyes = L.eyeType == null ? L.eyes : L.eyeType;
    if (expr === 'ko') eyes = 'x';
    else if (expr === 'hurt') eyes = 'hurt';
    else if (expr === 'happy') eyes = 3;
    else if (blink && ![3, 4, 6, 12, 14].includes(eyes)) eyes = 'blink';
    ctx.strokeStyle = INK_FACE;
    ctx.fillStyle = INK_FACE;
    ctx.lineWidth = 0.05 + 0.012 * k;
    for (const sx of [-1, 1]) {
      const x = sx * EX, y = EY;
      switch (eyes) {
        case 0: dotEye(ctx, x, y, 0.065 * k, 0.065 * k); break;                  // てん
        case 1: dotEye(ctx, x, y, 0.055 * k, 0.09 * k); break;                   // まめ
        case 2: // くりくり
          dotEye(ctx, x, y, 0.1 * k, 0.105 * k);
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - 0.032 * k, y + 0.04 * k, 0.02 * k, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = INK_FACE;
          break;
        case 3: ctx.beginPath(); ctx.arc(x, y + 0.05 * k, 0.07 * k, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break; // ^ ^
        case 4: ctx.beginPath(); ctx.moveTo(x - 0.07 * k, y); ctx.lineTo(x + 0.07 * k, y); ctx.stroke(); break;            // ー ー
        case 5: // きらきら
          dotEye(ctx, x, y, 0.1 * k, 0.105 * k, false);
          ctx.fillStyle = '#ffffff'; sparkle(ctx, x + 0.01, y - 0.01, 0.07 * k);
          ctx.fillStyle = INK_FACE;
          break;
        case 6: ctx.beginPath(); ctx.arc(x, y - 0.03 * k, 0.065 * k, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); break; // ◡ ◡
        case 7: dotEye(ctx, x * 1.1, y, 0.04 * k, 0.04 * k, false); break;       // ちょん
        case 8: { // うるうる (大きな たて長の目に 大きな光)
          const rx = 0.085 * k, ry = 0.13 * k;
          const g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
          g.addColorStop(0, INK_FACE);
          g.addColorStop(1, C.str(C.light(L.eyeColor || '#3a2a6a', 0.25)));
          ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(x + rx * 0.3, y - ry * 0.4, rx * 0.42, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x - rx * 0.35, y + ry * 0.45, rx * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x, y - ry * 0.05, ry * 1.05, Math.PI * 1.2, Math.PI * 1.8); ctx.strokeStyle = INK_FACE; ctx.stroke();
          ctx.fillStyle = INK_FACE;
          break;
        }
        case 9: { // ぎょろ (白目と 黒目)
          ctx.beginPath(); ctx.ellipse(x, y, 0.11 * k, 0.12 * k, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff'; ctx.fill();
          ctx.lineWidth = 0.03; ctx.stroke(); ctx.lineWidth = 0.05 + 0.012 * k;
          const gx = Math.sin(t * 0.8 + L.phase) * 0.025 * k;
          ctx.beginPath(); ctx.arc(x + gx - sx * 0.01, y + 0.02 * k, 0.05 * k, 0, Math.PI * 2); ctx.fillStyle = INK_FACE; ctx.fill();
          break;
        }
        case 10: // ほし
          ctx.save(); ctx.translate(x, y); ctx.fillStyle = INK_FACE;
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a2 = (i / 10) * Math.PI * 2 - Math.PI / 2, r2 = (i % 2 ? 0.045 : 0.1) * k; if (i) ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2); else ctx.moveTo(Math.cos(a2) * r2, Math.sin(a2) * r2); }
          ctx.closePath(); ctx.fill(); ctx.restore();
          break;
        case 11: { // ハート
          const r3 = 0.09 * k;
          ctx.beginPath();
          ctx.moveTo(x, y + r3);
          ctx.bezierCurveTo(x - r3 * 1.4, y, x - r3 * 0.9, y - r3 * 1.1, x, y - r3 * 0.4);
          ctx.bezierCurveTo(x + r3 * 0.9, y - r3 * 1.1, x + r3 * 1.4, y, x, y + r3);
          ctx.fillStyle = '#ff4f7a'; ctx.fill();
          ctx.fillStyle = INK_FACE;
          break;
        }
        case 12: // ねむ (まぶたが 半分)
          ctx.save(); ctx.beginPath(); ctx.rect(x - 0.15 * k, y, 0.3 * k, 0.2 * k); ctx.clip();
          dotEye(ctx, x, y, 0.08 * k, 0.08 * k, false); ctx.restore();
          ctx.beginPath(); ctx.moveTo(x - 0.09 * k, y); ctx.lineTo(x + 0.09 * k, y); ctx.stroke();
          break;
        case 13: // たれ目
          dotEye(ctx, x, y, 0.06 * k, 0.075 * k);
          ctx.beginPath(); ctx.moveTo(x - sx * 0.02 * k, y - 0.11 * k); ctx.lineTo(x + sx * 0.11 * k, y - 0.06 * k); ctx.stroke();
          break;
        case 14: // ぐるぐる
          ctx.beginPath();
          for (let i = 0; i <= 30; i++) { const a2 = i * 0.42, r2 = (0.005 + i * 0.0032) * k; const px = x + Math.cos(a2) * r2, py = y + Math.sin(a2) * r2; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.lineWidth = 0.03; ctx.stroke(); ctx.lineWidth = 0.05 + 0.012 * k;
          break;
        case 'blink': ctx.beginPath(); ctx.moveTo(x - 0.06 * k, y + 0.01); ctx.lineTo(x + 0.06 * k, y + 0.01); ctx.stroke(); break;
        case 'x':
          ctx.beginPath();
          ctx.moveTo(x - 0.06, y - 0.06); ctx.lineTo(x + 0.06, y + 0.06);
          ctx.moveTo(x + 0.06, y - 0.06); ctx.lineTo(x - 0.06, y + 0.06); ctx.stroke(); break;
        case 'hurt':
          ctx.beginPath(); ctx.moveTo(x - sx * 0.07, y - 0.06); ctx.lineTo(x + sx * 0.05, y); ctx.lineTo(x - sx * 0.07, y + 0.06); ctx.stroke(); break;
      }
    }
    // まゆ (まろまゆ / ふと / ほそ)。おこった顔は 必ず つりあがる
    const bY = EY - 0.13 - 0.07 * k;
    ctx.strokeStyle = INK_FACE;
    ctx.fillStyle = INK_FACE;
    if (expr === 'attack') {
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (const sx of [-1, 1]) { ctx.moveTo(sx * (EX + 0.08), bY - 0.03); ctx.lineTo(sx * (EX - 0.06), bY + 0.03); }
      ctx.stroke();
    } else if (L.brow === 'maro') {
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * (EX - 0.02), bY, 0.05, 0.032, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (L.brow === 'thick') {
      ctx.lineWidth = 0.065;
      ctx.beginPath();
      for (const sx of [-1, 1]) { ctx.moveTo(sx * EX - 0.07, bY); ctx.lineTo(sx * EX + 0.07, bY); }
      ctx.stroke();
    } else if (L.brow === 'thin') {
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      for (const sx of [-1, 1]) { ctx.moveTo(sx * EX - 0.08, bY + 0.015); ctx.quadraticCurveTo(sx * EX, bY - 0.04, sx * EX + 0.08, bY + 0.015); }
      ctx.stroke();
    }

    // 口 (小さく)
    let mouth = L.mouth;
    if (expr === 'ko') mouth = 'wave';
    else if (expr === 'hurt' || expr === 'attack') mouth = 2;
    else if (expr === 'happy') mouth = 3;
    const my = Math.max(0.4, EY + 0.24);
    ctx.save();
    ctx.translate(0, my); ctx.scale(L.mouthScale || 1, L.mouthScale || 1); ctx.translate(0, -my);
    ctx.strokeStyle = '#3a1a14';
    ctx.lineWidth = 0.045;
    ctx.beginPath();
    switch (mouth) {
      case 0: ctx.arc(0, my - 0.05, 0.07, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); break;            // ‿
      case 1: // ω
        ctx.arc(-0.045, my - 0.01, 0.045, 0.1, Math.PI - 0.1); ctx.moveTo(0.09, my - 0.01); ctx.arc(0.045, my - 0.01, 0.045, 0.1, Math.PI - 0.1); ctx.stroke(); break;
      case 2: ctx.ellipse(0, my, 0.035, 0.045, 0, 0, Math.PI * 2); ctx.fillStyle = '#7a2424'; ctx.fill(); break; // o
      case 3: // ぱかっ
        ctx.moveTo(-0.09, my - 0.03); ctx.quadraticCurveTo(0, my + 0.14, 0.09, my - 0.03); ctx.closePath();
        ctx.fillStyle = '#7a2424'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, my + 0.04, 0.04, 0.022, 0, 0, Math.PI * 2); ctx.fillStyle = '#ff8a8a'; ctx.fill();
        break;
      case 4: ctx.moveTo(-0.06, my - 0.03); ctx.lineTo(0.06, my - 0.03); ctx.lineTo(0, my + 0.05); ctx.closePath(); ctx.fillStyle = '#7a2424'; ctx.fill(); break; // ▽
      case 5: ctx.moveTo(-0.05, my); ctx.lineTo(0.05, my); ctx.stroke(); break; // ー
      case 6: // 3
        ctx.moveTo(-0.01, my - 0.05); ctx.quadraticCurveTo(0.06, my - 0.03, 0, my); ctx.quadraticCurveTo(0.06, my + 0.03, -0.01, my + 0.05); ctx.stroke(); break;
      case 'wave':
        ctx.moveTo(-0.09, my); ctx.quadraticCurveTo(-0.045, my - 0.045, 0, my); ctx.quadraticCurveTo(0.045, my + 0.045, 0.09, my); ctx.stroke(); break;
    }
    ctx.restore();

    if (L.acc === 'glasses') { // まんまるメガネ
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.035;
      ctx.beginPath();
      const gr = 0.06 + 0.1 * k;
      ctx.arc(-EX, EY, gr, 0, Math.PI * 2); ctx.moveTo(EX + gr, EY); ctx.arc(EX, EY, gr, 0, Math.PI * 2);
      ctx.moveTo(-EX + gr, EY); ctx.lineTo(EX - gr, EY);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,230,255,0.16)';
      ctx.fill();
    }
  }

  // ---------------- 模様 (水玉・まだら) ----------------
  // 球の表面の点を 向きに合わせて回して描くので、振り向くと模様も回り込む
  const DOT_COLORS = ['#ff6aa8', '#b06aff', '#4a8aff', '#5fd8f0', '#5fe07a', '#ffe14a', '#ff9a3a', '#ff5a5a'];
  function patternColor(L, base, d) {
    if (L.pattern === 'dots') return C.lum(base) < 0.35 ? DOT_COLORS[d.c] : C.str(C.mix(base, [255, 255, 255], 0.62));
    return C.str(C.mix(base, [255, 255, 255], C.lum(base) < 0.35 ? 0.28 : 0.45), 0.9);
  }
  function drawPattern(ctx, L, base, pts, rx, ry, rz, cy, turn, pitch, scale) {
    for (const d of pts) {
      const lx = Math.cos(d.ph) * Math.sin(d.th), ly = Math.sin(d.ph), lz = Math.cos(d.ph) * Math.cos(d.th);
      const p = rot(lx * rx, ly * ry, lz * rz, turn, pitch);
      const facing = p[2] / rz;
      if (facing < -0.15) continue;
      const k = 0.45 + 0.55 * Math.max(0, facing);
      const R = d.s * scale * k;
      ctx.fillStyle = patternColor(L, base, d);
      ctx.beginPath();
      if (L.pattern === 'spots') { // まだら: 円を 3つ重ねた いびつな形
        for (let j = 0; j < 3; j++) {
          const a = d.a + j * 2.1;
          const cx = p[0] + Math.cos(a) * R * 0.45, cyy = -p[1] + cy + Math.sin(a) * R * 0.35;
          ctx.moveTo(cx + R * 0.7, cyy);
          ctx.ellipse(cx, cyy, R * 0.7, R * 0.55, a, 0, Math.PI * 2);
        }
      } else {
        ctx.ellipse(p[0], -p[1] + cy, R * 0.6, R * 0.6, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  // ジュエルスーツ: 黄色い シャツ・金の ベルト・胸に 色とりどりの 宝石
  const SUIT = [244, 196, 48];
  const TIGHTS = [246, 240, 214]; // にゅうしタイツ: クリーム色
  function suitColor(dark, o, base = SUIT) {
    let c = C.dark(base, dark);
    if (o.gray) c = C.mix(c, [120, 120, 125], o.gray * 0.8);
    if (o.flash) c = C.mix(c, [255, 255, 255], o.flash);
    return c;
  }
  function drawJewelSuit(ctx, P, ws, turn, o) {
    const rx = 0.172 * ws, ry = P.bodyRy * 0.86, cy = P.bodyY - P.bodyRy * 0.12;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, P.bodyY, 0.168 * ws, P.bodyRy * 1.02, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad(ctx, 0, cy, rx * 1.1, suitColor(0, o), ry);
    ctx.fill();
    // えり
    ctx.beginPath(); ctx.ellipse(0, cy - ry * 0.95, rx * 0.4, ry * 0.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.str(suitColor(0.35, o)); ctx.fill();
    // 金の ベルト
    const by = cy + ry * 0.45;
    ctx.fillStyle = C.str(suitColor(0.12, o));
    ctx.fillRect(-rx, by - 0.018, rx * 2, 0.036);
    // 宝石 (正面の 向きに あわせて 横に ずれる)
    const shift = Math.sin(turn) * rx * 0.6, front = Math.cos(turn);
    if (front > -0.2) {
      const gems = [[-0.55, -0.1, [80, 200, 90]], [0, -0.18, [70, 150, 240]], [0.55, -0.1, [80, 200, 90]], [-0.3, 0.22, [235, 70, 80]], [0.3, 0.22, [90, 220, 210]]];
      for (const [gx, gy, gc] of gems) {
        const x = gx * rx * Math.abs(front) + shift, y = cy + gy * ry, r = 0.03 * (0.7 + 0.3 * Math.abs(front));
        let c = gc;
        if (o.gray) c = C.mix(c, [120, 120, 125], o.gray * 0.8);
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.9, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.9, y); ctx.closePath();
        ctx.fillStyle = C.str(c); ctx.fill();
        ctx.strokeStyle = C.str(C.dark(c, 0.4)); ctx.lineWidth = 0.006; ctx.stroke();
        ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      }
      // ベルトの バックル (青い 宝石)
      ctx.fillStyle = C.str(o.gray ? [130, 130, 135] : [90, 190, 240]);
      ctx.fillRect(shift - 0.028, by - 0.022, 0.056, 0.044);
    }
    ctx.restore();
  }

  // まじょのローブ: こい 紫の ながい ローブ (すそが ひろがって 足を かくす)・金の ふち・胸に 金の 星
  const ROBE = [70, 30, 110];
  function drawRobe(ctx, P, ws, turn, o) {
    const top = P.bodyY - P.bodyRy * 0.95, bot = P.bodyY + P.bodyRy * 1.55, wt = 0.15 * ws, wb = 0.22 * ws;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-wt * 0.7, top);
    ctx.quadraticCurveTo(-wt * 1.15, P.bodyY - P.bodyRy * 0.2, -wb, bot);
    ctx.quadraticCurveTo(0, bot + P.bodyRy * 0.12, wb, bot);
    ctx.quadraticCurveTo(wt * 1.15, P.bodyY - P.bodyRy * 0.2, wt * 0.7, top);
    ctx.quadraticCurveTo(0, top - P.bodyRy * 0.1, -wt * 0.7, top);
    ctx.closePath();
    ctx.fillStyle = ballGrad(ctx, 0, P.bodyY, wb * 1.2, suitColor(0, o, ROBE), P.bodyRy * 1.4);
    ctx.fill();
    const gold = C.str(suitColor(0, o, [235, 190, 60]));
    ctx.strokeStyle = gold; ctx.lineWidth = 0.014; ctx.stroke();
    const shift = Math.sin(turn) * wt * 0.6, front = Math.cos(turn);
    if (front > -0.2) {
      ctx.beginPath(); ctx.moveTo(shift, top + 0.01); ctx.lineTo(shift * 1.2, bot); // 前の あわせ
      ctx.strokeStyle = gold; ctx.lineWidth = 0.01; ctx.stroke();
      const sx = shift - wt * 0.45 * Math.abs(front), sy = P.bodyY - P.bodyRy * 0.3, r = 0.034; // 胸の 星
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx[i ? 'lineTo' : 'moveTo'](sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fillStyle = gold; ctx.fill();
    }
    ctx.restore();
  }

  // にゅうしタイツ: クリーム色の シャツに 大きな まつげの 目と ピンクの ほっぺ
  function drawTights(ctx, P, ws, turn, o) {
    const rx = 0.172 * ws, ry = P.bodyRy * 0.9, cy = P.bodyY - P.bodyRy * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, P.bodyY, 0.168 * ws, P.bodyRy * 1.02, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad(ctx, 0, cy, rx * 1.1, suitColor(0, o, TIGHTS), ry);
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, cy - ry * 0.95, rx * 0.4, ry * 0.18, 0, 0, Math.PI * 2); // えり
    ctx.fillStyle = C.str(suitColor(0.12, o, TIGHTS)); ctx.fill();
    const shift = Math.sin(turn) * rx * 0.6, front = Math.cos(turn);
    if (front > -0.2) {
      const k = Math.abs(front);
      for (const sx of [-1, 1]) { // 目 (白目・黒目・まつげ)
        const ex = sx * rx * 0.36 * k + shift, ey = cy - ry * 0.12, ew = rx * 0.17 * (0.6 + 0.4 * k), eh = ry * 0.24;
        ctx.beginPath(); ctx.ellipse(ex, ey, ew, eh, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 0.007; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(ex, ey + eh * 0.15, ew * 0.6, eh * 0.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#1e1e26'; ctx.fill();
        ctx.beginPath(); ctx.arc(ex - ew * 0.2, ey - eh * 0.15, ew * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.strokeStyle = '#1e1e26'; ctx.lineWidth = 0.008; ctx.lineCap = 'round';
        ctx.beginPath();
        for (const a of [-0.5, 0, 0.5]) { ctx.moveTo(ex + a * ew * 0.8, ey - eh * 0.95); ctx.lineTo(ex + a * ew * 1.3, ey - eh * 1.45); }
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(rx * 0.3 * k + shift, cy + ry * 0.4, rx * 0.12, ry * 0.08, 0, 0, Math.PI * 2); // ほっぺ
      ctx.fillStyle = o.gray ? 'rgba(150,150,155,0.6)' : 'rgba(255,140,150,0.75)'; ctx.fill();
    }
    ctx.restore();
  }

  // せなかの オノ: ななめに しょった 柄と 大きな 刃
  // たて: せなかに しょった 丸い 盾 (クリーム色の ふち・銀の 輪・黒い 中心)
  function drawTate(ctx, P, ws, turn, o) {
    const p = rot(0, 0, -0.15 * ws, turn, 0);
    const x = p[0], y = P.bodyY - 0.03, r = 0.19 * Math.max(0.9, ws);
    const sh = (c) => { let v = c; if (o.gray) v = C.mix(v, [120, 120, 125], o.gray * 0.8); if (o.flash) v = C.mix(v, [255, 255, 255], o.flash); return v; };
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.max(0.3, Math.abs(Math.cos(turn))), 1); // 横を むくと 細く 見える
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad(ctx, 0, 0, r, sh([236, 226, 196]), r); ctx.fill();
    ctx.strokeStyle = 'rgba(40,36,30,0.7)'; ctx.lineWidth = 0.012; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.fillStyle = ballGrad(ctx, 0, 0, r * 0.72, sh([178, 180, 188]), r * 0.72); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2); ctx.fillStyle = C.str(sh([40, 40, 46])); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-r * 0.15, -r * 0.18, r * 0.12, r * 0.07, -0.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    ctx.fillStyle = C.str(C.dark(sh([236, 226, 196]), 0.45));
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, r * 0.05, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function drawBackAxe(ctx, P, ws, turn, o) {
    const sx = Math.sin(turn) >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(0, P.bodyY);
    ctx.rotate(sx * 0.6);
    ctx.strokeStyle = C.str(o.gray ? [120, 110, 100] : [120, 84, 52]); ctx.lineWidth = 0.028; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0.22); ctx.lineTo(0, -0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.01, -0.36); ctx.quadraticCurveTo(0.12, -0.4, 0.19, -0.5); ctx.quadraticCurveTo(0.15, -0.36, 0.19, -0.2); ctx.quadraticCurveTo(0.1, -0.28, 0.01, -0.27); ctx.closePath();
    ctx.fillStyle = C.str(o.gray ? [130, 130, 135] : [168, 174, 186]); ctx.fill(); ctx.strokeStyle = '#30333a'; ctx.lineWidth = 0.008; ctx.stroke();
    ctx.restore();
  }

  // まじょのつえ: せなかに ななめに しょった 紫の 木の つえ (先は うずまきと 光る 紫の 玉)
  function drawBackStaff(ctx, P, ws, turn, t, o) {
    const sx = Math.sin(turn) >= 0 ? 1 : -1;
    const tn = (c) => { let x = c; if (o.gray) x = C.mix(x, [120, 120, 125], o.gray * 0.8); if (o.flash) x = C.mix(x, [255, 255, 255], o.flash); return x; };
    const wood = tn([92, 58, 96]), orb = tn([196, 96, 255]), gold = tn([226, 182, 70]);
    ctx.save();
    ctx.translate(0, P.bodyY);
    ctx.rotate(-sx * 0.55); // 頭の 横から 先が 見える
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.str(C.dark(wood, 0.35)); ctx.lineWidth = 0.036;
    ctx.beginPath(); ctx.moveTo(0, 0.3); ctx.lineTo(0, -0.8); ctx.stroke();
    ctx.strokeStyle = C.str(wood); ctx.lineWidth = 0.022; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.78); ctx.bezierCurveTo(-0.02, -0.92, 0.14, -0.98, 0.13, -0.86); ctx.quadraticCurveTo(0.12, -0.8, 0.07, -0.83); // うずまき
    ctx.strokeStyle = C.str(C.dark(wood, 0.2)); ctx.lineWidth = 0.022; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.03, -0.74); ctx.lineTo(0.03, -0.74); ctx.strokeStyle = C.str(gold); ctx.lineWidth = 0.02; ctx.stroke(); // 金の 輪
    const pulse = 0.5 + Math.sin(t * 3) * 0.5;
    if (!o.gray) { // 玉の 光
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0.065, -0.88, 0, 0.065, -0.88, 0.16);
      g.addColorStop(0, `rgba(220,140,255,${0.35 + pulse * 0.25})`); g.addColorStop(1, 'rgba(160,60,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-0.1, -1.04, 0.33, 0.33); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0.065, -0.88, 0.045, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad(ctx, 0.065, -0.88, 0.05, orb, 0.05); ctx.fill();
    ctx.restore();
  }

  // まじょのぼうし: 頭に かぶる つばの 広い 紫の とんがりぼうし (先が 少し 折れる・金の バックルの 帯)
  const HAT_TIP = 1.3; // 頭の 上の はしから ぼうしの 先までの 高さ (頭の 半径 ×)
  NS.HAT_TIP = HAT_TIP;
  function drawMajoHat(ctx, r, topY, turn, t, o) {
    const tn = (c) => { let x = c; if (o.gray) x = C.mix(x, [120, 120, 125], o.gray * 0.8); if (o.flash) x = C.mix(x, [255, 255, 255], o.flash); return x; };
    const HAT = tn([78, 44, 120]), BAND = tn([150, 60, 200]), GOLD = tn([236, 192, 72]);
    const out = C.str(C.dark(HAT, 0.55), 0.95), ct = Math.cos(turn);
    const by = topY + r * 0.32, w0 = r * 0.64, tipX = r * 0.34, tipY = topY - r * HAT_TIP;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineWidth = 0.01;
    // つば
    ctx.beginPath(); ctx.ellipse(0, by, r * 1.32, r * 0.3, 0, 0, Math.PI * 2);
    const bg = ctx.createLinearGradient(0, by - r * 0.3, 0, by + r * 0.3);
    bg.addColorStop(0, C.str(C.light(HAT, 0.15))); bg.addColorStop(1, C.str(C.dark(HAT, 0.35)));
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = out; ctx.stroke();
    // とんがり (先は 横に 折れる)
    const sway = Math.sin(t * 1.8) * r * 0.03;
    ctx.beginPath();
    ctx.moveTo(-w0, by);
    ctx.quadraticCurveTo(-r * 0.4, topY - r * 0.35, -r * 0.08, topY - r * 0.85);
    ctx.quadraticCurveTo(r * 0.1, topY - r * 1.2, tipX + sway, tipY);
    ctx.quadraticCurveTo(r * 0.2, topY - r * 0.95, r * 0.24, topY - r * 0.7);
    ctx.quadraticCurveTo(r * 0.42, topY - r * 0.25, w0, by);
    ctx.quadraticCurveTo(0, by + r * 0.12, -w0, by);
    ctx.closePath();
    const cg = ctx.createLinearGradient(-w0, 0, w0, 0);
    cg.addColorStop(0, C.str(C.light(HAT, 0.2))); cg.addColorStop(0.45, C.str(HAT)); cg.addColorStop(1, C.str(C.dark(HAT, 0.4)));
    ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = out; ctx.stroke();
    // 帯 と バックル
    const b0 = by - r * 0.04, b1 = by - r * 0.24, w1 = w0 * 0.86;
    ctx.beginPath(); ctx.moveTo(-w0 * 0.99, b0); ctx.quadraticCurveTo(0, b0 + r * 0.1, w0 * 0.99, b0); ctx.lineTo(w1, b1); ctx.quadraticCurveTo(0, b1 + r * 0.09, -w1, b1); ctx.closePath();
    ctx.fillStyle = C.str(BAND); ctx.fill(); ctx.strokeStyle = out; ctx.lineWidth = 0.008; ctx.stroke();
    if (ct > 0) {
      const bx = Math.sin(turn) * w0 * 0.8, s = r * 0.13 * (0.5 + 0.5 * ct);
      ctx.beginPath(); ctx.rect(bx - s, (b0 + b1) / 2 + r * 0.04 - s * 0.8, s * 2, s * 1.6);
      ctx.strokeStyle = C.str(GOLD); ctx.lineWidth = r * 0.06; ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(-r * 0.25, topY - r * 0.2, r * 0.05, r * 0.22, 0.35, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill(); // つや
    ctx.restore();
  }

  // おおきなかね: せなかに しょった 金色の 大きな かね
  function drawBell(ctx, P, ws, turn, t, o) {
    const sx = Math.sin(turn) >= 0 ? 1 : -1, sw = Math.sin(t * 2.4) * 0.06;
    const gold = o.gray ? [150, 145, 130] : o.flash ? [255, 250, 220] : [232, 182, 56];
    ctx.save();
    ctx.translate(-sx * 0.1 * ws, P.bodyY - 0.36);
    ctx.rotate(sw - sx * 0.25);
    ctx.scale(1.7, 1.7); // 大きな かね (前から 見ても 肩の うしろに 見える)
    ctx.beginPath(); ctx.arc(0, -0.04, 0.035, Math.PI, 0); ctx.strokeStyle = C.str(C.dark(gold, 0.4)); ctx.lineWidth = 0.018; ctx.stroke(); // つりわ
    ctx.beginPath();
    ctx.moveTo(-0.07, 0); ctx.quadraticCurveTo(-0.1, 0.02, -0.11, 0.14); ctx.quadraticCurveTo(-0.13, 0.22, -0.17, 0.25);
    ctx.lineTo(0.17, 0.25); ctx.quadraticCurveTo(0.13, 0.22, 0.11, 0.14); ctx.quadraticCurveTo(0.1, 0.02, 0.07, 0); ctx.closePath();
    const g = ctx.createLinearGradient(-0.17, 0, 0.17, 0.25);
    g.addColorStop(0, C.str(C.light(gold, 0.45))); g.addColorStop(0.5, C.str(gold)); g.addColorStop(1, C.str(C.dark(gold, 0.35)));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = C.str(C.dark(gold, 0.55)); ctx.lineWidth = 0.008; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.14, 0.2); ctx.lineTo(0.14, 0.2); ctx.strokeStyle = C.str(C.dark(gold, 0.3)); ctx.lineWidth = 0.012; ctx.stroke(); // おびの 線
    ctx.beginPath(); ctx.arc(0, 0.27, 0.03, 0, Math.PI * 2); ctx.fillStyle = C.str(C.dark(gold, 0.45)); ctx.fill(); // したの たま
    ctx.restore();
  }

  // はかいおうのはね: 黒い 骨と 赤い 膜の 大きな こうもりの はね (ゆっくり はばたく)
  function drawHakaiWings(ctx, P, ws, ct, t, o) {
    const flap = Math.sin(t * 3.2) * 0.06, sy = P.shoulderY + 0.02, k = 0.35 + 0.65 * Math.abs(ct);
    let mem = [150, 24, 48], bone = [30, 12, 22];
    if (o.gray) { mem = C.mix(mem, [120, 120, 125], o.gray * 0.8); bone = C.mix(bone, [120, 120, 125], o.gray * 0.8); }
    for (const sx of [-1, 1]) {
      const X = (x) => sx * (0.04 + x * k * Math.max(0.9, ws)), tipY = sy - 0.34 - flap;
      ctx.beginPath();
      ctx.moveTo(X(0), sy);
      ctx.quadraticCurveTo(X(0.18), sy - 0.3 - flap, X(0.5), tipY);       // 上の 骨
      ctx.lineTo(X(0.62), sy - 0.12 - flap * 0.5);                        // 先の つめ
      ctx.quadraticCurveTo(X(0.5), sy - 0.06, X(0.46), sy + 0.06);        // ぎざぎざの 膜
      ctx.quadraticCurveTo(X(0.36), sy - 0.02, X(0.3), sy + 0.12);
      ctx.quadraticCurveTo(X(0.2), sy + 0.03, X(0.12), sy + 0.14);
      ctx.closePath();
      const g = ctx.createLinearGradient(X(0), sy, X(0.55), tipY);
      g.addColorStop(0, C.str(C.dark(mem, 0.45)));
      g.addColorStop(1, C.str(mem));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = C.str(bone); ctx.lineWidth = 0.014; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); // 骨
      ctx.moveTo(X(0.5), tipY); ctx.lineTo(X(0.46), sy + 0.06);
      ctx.moveTo(X(0.5), tipY); ctx.lineTo(X(0.3), sy + 0.12);
      ctx.moveTo(X(0.5), tipY); ctx.lineTo(X(0.12), sy + 0.14);
      ctx.lineWidth = 0.008; ctx.stroke();
    }
  }

  // 顔の 装備 (しなこ): 顔の 上に 絵を かぶせる (頭の 形で 切りぬかれる)。顔の 座標 = 顔の 中心が (0, 0.17)・はば 約 1.44
  function drawFaceEquip(ctx, key, o) {
    const E = NS.EQUIPS[key], im = E && E.img && NS.pic && NS.pic(E.img);
    if (!im || !im.naturalWidth) return;
    // 絵の 中の 顔の 中心 (割合) と 顔の はば (割合)
    const cx = 0.48, cy = 0.575, fw = 0.54;
    const k = 1.62 / (fw * im.naturalWidth);
    const w = im.naturalWidth * k, h = im.naturalHeight * k;
    ctx.save();
    if (o.gray) ctx.filter = `grayscale(${o.gray * 0.8})`;
    ctx.drawImage(im, -cx * w, 0.12 - cy * h, w, h);
    ctx.filter = 'none';
    if (o.flash) { ctx.globalAlpha *= o.flash; ctx.fillStyle = '#fff'; ctx.fillRect(-1.2, -1.2, 2.4, 2.6); }
    ctx.restore();
  }

  // まおうのかんむり: 頭の 上半分を おおう 黒い かぶと + 左右の こうもりの はね + 上に 三つまたの やり と 白い こうもり
  //   座標は 絵 (顔の はば 約 110px) を もとに した px。頭の 中心 = (107, 140)、k = 1px の 大きさ
  const CROWN_TIP = 135; // 頭の 中心から やりの 先までの px
  function drawMaouCrown(ctx, r, topY, turn, t, o) {
    const k = r / 55, dy = topY + r; // 頭の 上の はしに あわせる
    const ct = Math.cos(turn), st = Math.sin(turn);
    // 横に 向くと: かぶとは 丸いので そのまま / はねは 前後に まわって 細く / まんなかの とがりは 顔と いっしょに 動く
    const mk = (sc, sh) => (x) => (x - 107) * k * sc + sh;
    const XD = mk(1, 0), XF = mk(0.3 + 0.7 * Math.abs(ct), 0), XT = mk(0.75 + 0.25 * Math.abs(ct), st * r * 0.1);
    const Y = (y) => (y - 140) * k + dy;
    const tn = (c) => { let x = c; if (o.gray) x = C.mix(x, [120, 120, 125], o.gray * 0.8); if (o.flash) x = C.mix(x, [255, 255, 255], o.flash); return x; };
    const MET = tn([74, 70, 78]), MET_D = tn([34, 31, 37]), MET_L = tn([132, 126, 136]), WHITE = tn([246, 246, 250]);
    const out = C.str(C.dark(MET_D, 0.4), 0.95);
    const path = (X, pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.closePath(); };
    const metal = (X, x0, y0, x1, y1) => {
      const g = ctx.createLinearGradient(X(x0), Y(y0), X(x1), Y(y1));
      g.addColorStop(0, C.str(MET_L)); g.addColorStop(0.45, C.str(MET)); g.addColorStop(1, C.str(MET_D));
      return g;
    };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.01;
    // こうもりの はね (左右。外がわ 上に とがり、下の へりは ぎざぎざ)
    const flap = Math.sin(t * 2.2) * 2;
    for (const sx of [-1, 1]) {
      const m = (x) => 107 + sx * (x - 107), X = XF;
      ctx.beginPath();
      ctx.moveTo(X(m(64)), Y(84));
      ctx.quadraticCurveTo(X(m(46)), Y(72 - flap), X(m(22)), Y(68 - flap)); // 上の へり → 先
      ctx.quadraticCurveTo(X(m(29)), Y(84), X(m(28)), Y(98)); // 外の へり
      ctx.quadraticCurveTo(X(m(37)), Y(92), X(m(43)), Y(104)); // ぎざぎざ 1
      ctx.quadraticCurveTo(X(m(50)), Y(99), X(m(57)), Y(113)); // ぎざぎざ 2
      ctx.lineTo(X(m(66)), Y(104));
      ctx.closePath();
      ctx.fillStyle = metal(X, m(30), 66, m(60), 112); ctx.fill();
      ctx.strokeStyle = out; ctx.stroke();
      ctx.strokeStyle = C.str(MET_D, 0.8); ctx.lineWidth = 0.008; // はねの 骨
      ctx.beginPath(); ctx.moveTo(X(m(62)), Y(90)); ctx.lineTo(X(m(28)), Y(74 - flap)); ctx.moveTo(X(m(60)), Y(95)); ctx.lineTo(X(m(36)), Y(96)); ctx.stroke();
      ctx.lineWidth = 0.01;
    }
    // かぶと (頭の 上半分。前を 向いて いれば 前の へりの まんなかが 下に とがる)
    const X = XD, front = ct > 0.05, v = 107 + st * 44; // とがりの 位置 (顔の まんなか)
    ctx.beginPath();
    ctx.moveTo(X(52), Y(116));
    ctx.bezierCurveTo(X(46), Y(60), X(168), Y(60), X(162), Y(116));
    if (front) {
      ctx.quadraticCurveTo(X((162 + v) / 2 + 8), Y(110), X(v + 5), Y(126));
      ctx.lineTo(X(v), Y(126 + 8 * ct));
      ctx.lineTo(X(v - 5), Y(126));
      ctx.quadraticCurveTo(X((52 + v) / 2 - 8), Y(110), X(52), Y(116));
    } else ctx.quadraticCurveTo(X(107), Y(110), X(52), Y(116));
    ctx.closePath();
    const hg = ctx.createRadialGradient(X(88), Y(80), r * 0.05, X(107), Y(100), r * 1.25);
    hg.addColorStop(0, C.str(MET_L)); hg.addColorStop(0.5, C.str(MET)); hg.addColorStop(1, C.str(MET_D));
    ctx.fillStyle = hg; ctx.fill();
    ctx.strokeStyle = out; ctx.stroke();
    if (front) { // 前の へりの ふち (少し 明るい 線)
      ctx.beginPath();
      ctx.moveTo(X(56), Y(112)); ctx.quadraticCurveTo(X((52 + v) / 2 - 6), Y(107), X(v - 4), Y(121)); ctx.lineTo(X(v), Y(121 + 6 * ct)); ctx.lineTo(X(v + 4), Y(121)); ctx.quadraticCurveTo(X((162 + v) / 2 + 6), Y(107), X(158), Y(112));
      ctx.strokeStyle = C.str(MET_L, 0.7); ctx.lineWidth = 0.008; ctx.stroke(); ctx.lineWidth = 0.01;
    }
    ctx.beginPath(); ctx.ellipse(X(84), Y(82), 12 * k, 5 * k, -0.4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill(); // つや
    // 三つまたの やり (左右の えだ → まんなかの やり)
    for (const sx of [-1, 1]) {
      const m = (x) => 107 + sx * (x - 107), X = XT;
      ctx.beginPath();
      ctx.moveTo(X(m(97)), Y(62)); ctx.quadraticCurveTo(X(m(82)), Y(60), X(m(80)), Y(36));
      ctx.strokeStyle = C.str(MET_D); ctx.lineWidth = 6 * k; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = C.str(MET); ctx.lineWidth = 3.6 * k; ctx.stroke();
      path(X, [[m(80), 14], [m(86.5), 28], [m(80), 40], [m(73.5), 28]]); // しずくの 形の 先
      ctx.fillStyle = metal(X, m(77), 17, m(83), 38); ctx.fill(); ctx.strokeStyle = out; ctx.lineWidth = 0.008; ctx.stroke();
    }
    ctx.lineWidth = 0.01;
    ctx.beginPath(); ctx.moveTo(XT(107), Y(64)); ctx.lineTo(XT(107), Y(28)); // まんなかの やり
    ctx.strokeStyle = C.str(MET_D); ctx.lineWidth = 6.5 * k; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = C.str(MET); ctx.lineWidth = 4.2 * k; ctx.stroke();
    path(XT, [[107, 140 - CROWN_TIP], [116, 18], [107, 32], [98, 18]]);
    ctx.fillStyle = metal(XT, 102, 5, 112, 30); ctx.fill(); ctx.strokeStyle = out; ctx.lineWidth = 0.008; ctx.stroke();
    // 台 (かぶとの 上の つつ)
    path(XT, [[90, 77], [92, 57], [122, 57], [124, 77]]);
    ctx.fillStyle = metal(XT, 90, 57, 124, 77); ctx.fill(); ctx.strokeStyle = out; ctx.lineWidth = 0.01; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(XT(107), Y(57), 15 * k, 3.5 * k, 0, 0, Math.PI * 2); ctx.fillStyle = C.str(MET_L); ctx.fill(); ctx.strokeStyle = out; ctx.stroke();
    // 白い こうもり (まんなかの やりの 前)
    if (ct > -0.2) {
      const bx = 107, by = 36, S = 1.45, B = (x) => XT(bx + (x - bx) * S * (0.4 + 0.6 * Math.max(0, ct))), BY = (y) => Y(by + (y - by) * S);
      ctx.beginPath();
      ctx.moveTo(B(bx), BY(by + 7));
      ctx.quadraticCurveTo(B(bx - 6), BY(by + 3), B(bx - 12), BY(by - 6)); // 左の はね
      ctx.lineTo(B(bx - 9), BY(by + 1)); ctx.lineTo(B(bx - 6), BY(by - 2)); ctx.lineTo(B(bx - 2.5), BY(by + 1));
      ctx.lineTo(B(bx - 2.5), BY(by - 5)); ctx.lineTo(B(bx), BY(by - 3)); ctx.lineTo(B(bx + 2.5), BY(by - 5)); // 耳
      ctx.lineTo(B(bx + 2.5), BY(by + 1)); ctx.lineTo(B(bx + 6), BY(by - 2)); ctx.lineTo(B(bx + 9), BY(by + 1));
      ctx.lineTo(B(bx + 12), BY(by - 6));
      ctx.quadraticCurveTo(B(bx + 6), BY(by + 3), B(bx), BY(by + 7));
      ctx.closePath();
      ctx.fillStyle = C.str(WHITE); ctx.fill();
      ctx.strokeStyle = 'rgba(40,36,44,0.8)'; ctx.lineWidth = 0.006; ctx.stroke();
    }
    ctx.restore();
  }

  function withFrame(ctx, f, r, fn) {
    ctx.save();
    ctx.transform(f.ax * r, f.ay * r, f.bx * r, f.by * r, f.ox, f.oy);
    fn();
    ctx.restore();
  }

  // アンテナの先: スキルのアイコン + ほのかな光
  const ICON_R = 0.078;
  function drawAntennaTip(ctx, x, y, sk, glow, t) {
    if (glow > 0.01) {
      const c = C.rgb(NS.skillColor(sk));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = (sk.grade || 0) / 5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 0.16 + glow * 0.2 + gr * 0.12);
      g.addColorStop(0, C.str(c, Math.min(1, (0.6 + gr * 0.4) * glow)));
      g.addColorStop(1, C.str(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 0.4, y - 0.4, 0.8, 0.8);
      ctx.restore();
    }
    NS.drawSkillIcon(ctx, x, y, ICON_R, sk, t, { grow: true });
  }

  // 頭まわり一式 (耳・頭・顔・飾り・アンテナ)。原点 = 頭の中心
  function drawHeadGroup(ctx, ch, base, o) {
    const L = ch.look, key = ch.head, r = HR;
    const turn = o.turn || 0, pitch = o.pitch || 0, t = o.t || 0;
    const outline = C.str(C.dark(base, 0.5), 0.55);

    // ---- 後ろ側に来る飾り ----
    if (key === 'cat' || key === 'bear' || key === 'bunny') {
      const inner = Math.max(0, Math.cos(turn));
      for (const sx of [-1, 1]) {
        const e = rot(sx * r * (key === 'bunny' ? 0.42 : 0.62), 0, 0, turn, pitch);
        const ex = e[0];
        ctx.save();
        if (key === 'cat') {
          ctx.translate(ex, -r * 0.62);
          ctx.rotate(sx * 0.25);
          ctx.beginPath(); ctx.moveTo(-r * 0.36, r * 0.12); ctx.lineTo(0, -r * 0.62); ctx.lineTo(r * 0.36, r * 0.12); ctx.closePath();
          ctx.fillStyle = ballGrad(ctx, 0, -r * 0.2, r * 0.5, base); ctx.fill();
          ctx.strokeStyle = outline; ctx.lineWidth = 0.012; ctx.stroke();
          if (inner > 0.05) {
            ctx.beginPath(); ctx.moveTo(-r * 0.17, r * 0.02); ctx.lineTo(0, -r * 0.4); ctx.lineTo(r * 0.17, r * 0.02); ctx.closePath();
            ctx.fillStyle = `rgba(255,150,170,${0.85 * inner})`; ctx.fill();
          }
        } else if (key === 'bear') {
          ctx.translate(ex, -r * 0.72);
          ctx.beginPath(); ctx.arc(0, 0, r * 0.33, 0, Math.PI * 2);
          ctx.fillStyle = ballGrad(ctx, 0, 0, r * 0.33, base); ctx.fill();
          ctx.strokeStyle = outline; ctx.lineWidth = 0.012; ctx.stroke();
          if (inner > 0.05) { ctx.beginPath(); ctx.arc(0, r * 0.03, r * 0.17, 0, Math.PI * 2); ctx.fillStyle = `rgba(90,60,50,${0.35 * inner})`; ctx.fill(); }
        } else {
          const flop = Math.sin(t * 1.7 + L.phase + sx) * 0.08;
          ctx.translate(ex, -r * 0.8);
          ctx.rotate(sx * (0.18 + flop));
          ctx.beginPath(); ctx.ellipse(0, -r * 0.65, r * 0.26, r * 0.78, 0, 0, Math.PI * 2);
          ctx.fillStyle = ballGrad(ctx, 0, -r * 0.65, r * 0.6, base, r * 0.78); ctx.fill();
          ctx.strokeStyle = outline; ctx.lineWidth = 0.012; ctx.stroke();
          if (inner > 0.05) { ctx.beginPath(); ctx.ellipse(0, -r * 0.62, r * 0.12, r * 0.55, 0, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,150,170,${0.8 * inner})`; ctx.fill(); }
        }
        ctx.restore();
      }
    }

    // シルクハット: 左右に つきでた つば (頭の うしろ)
    if (key === 'silkhat') {
      const c = Math.abs(Math.cos(turn)), w = r * (1.0 + 0.55 * c);
      ctx.beginPath(); ctx.ellipse(0, -r * 0.42, w, r * (0.12 + 0.2 * Math.min(1, Math.abs(pitch) * 2)), 0, 0, Math.PI * 2);
      ctx.fillStyle = ballGrad(ctx, 0, -r * 0.42, w, C.dark(base, 0.15)); ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 0.012; ctx.stroke();
    }
    // おだんご: 頭の 左右上に まるい おだんごが 2つ (頭と 同じ 色。少し うしろに つく)
    if (key === 'odango') {
      for (const sx of [-1, 1]) {
        const e = rot(sx * r * 0.68, 0, -r * 0.1, turn, pitch), bx = e[0], by = -r * 0.84, br = r * 0.34;
        // 串: ななめに 1本 (上の はしが 外がわへ。左右 対称)。色は 体の 色 (少し こく)
        const kx = sx * Math.sin(0.5) * br * 1.7, ky = Math.cos(0.5) * br * 1.7;
        ctx.beginPath(); ctx.moveTo(bx - kx, by + ky); ctx.lineTo(bx + kx, by - ky);
        ctx.strokeStyle = C.str(C.dark(base, 0.25)); ctx.lineWidth = r * 0.07; ctx.lineCap = 'round'; ctx.stroke();
        ctx.strokeStyle = outline; ctx.lineWidth = 0.006; ctx.stroke();
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = ballGrad(ctx, bx, by, br, base); ctx.fill();
        ctx.strokeStyle = outline; ctx.lineWidth = 0.012; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; // つや
        ctx.beginPath(); ctx.ellipse(bx - br * 0.35, by - br * 0.4, br * 0.22, br * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // はね: 頭の 左右から 上へ ひろがる 黒い 羽 (3まいの 羽根)。ぱたぱた 動く
    if (key === 'wings') {
      const flap = Math.sin(t * 6 + (L.phase || 0)) * 0.12, wcol = C.dark(base, 0.45);
      for (const sx of [-1, 1]) {
        const e = rot(sx * r * 0.8, 0, 0, turn, pitch);
        ctx.save();
        ctx.translate(e[0], -r * 0.35);
        ctx.scale(sx, 1);
        ctx.rotate(-0.15 - flap);
        ctx.beginPath();
        ctx.moveTo(0, r * 0.1);
        ctx.quadraticCurveTo(r * 0.5, -r * 0.55, r * 1.05, -r * 0.62);
        ctx.quadraticCurveTo(r * 0.9, -r * 0.4, r * 1.0, -r * 0.3);
        ctx.quadraticCurveTo(r * 0.78, -r * 0.18, r * 0.86, -r * 0.02);
        ctx.quadraticCurveTo(r * 0.55, 0, r * 0.62, r * 0.2);
        ctx.quadraticCurveTo(r * 0.3, r * 0.22, 0, r * 0.1);
        ctx.closePath();
        ctx.fillStyle = ballGrad(ctx, r * 0.4, -r * 0.3, r * 0.9, wcol); ctx.fill();
        ctx.strokeStyle = outline; ctx.lineWidth = 0.012; ctx.stroke();
        ctx.restore();
      }
    }
    // りゅうせい (流れ星): 星の 頭の うしろから 右上へ のびる 太い 尾。先は ぎざぎざ、中に 流れる 線
    if (key === 'meteor') {
      const sx = Math.cos(turn) >= 0 ? 1 : -1, wav = Math.sin(t * 3 + L.phase) * 0.04;
      const dx = 0.82, dy = -0.57, nx = 0.57, ny = 0.82, w = r * 0.72, len = r * (2.5 + wav);
      const c0 = [r * 0.35, -r * 0.25], c1 = [c0[0] + dx * len, c0[1] + dy * len];
      const P = (p) => [sx * p[0], p[1]];
      const at = (c, k) => [c[0] + nx * w * k, c[1] + ny * w * k]; // k = −1 (上の へり) 〜 1 (下の へり)
      ctx.save();
      ctx.beginPath();
      let p = P(at(c0, -1)); ctx.moveTo(p[0], p[1]);
      // 先の ぎざぎざ (3つの 山)
      const tips = [[-1, 0], [-0.55, -0.35], [-0.2, 0], [0.25, -0.35], [0.55, 0], [1, -0.3]];
      for (const [k, back] of tips) { const q = at([c1[0] - dx * back * r, c1[1] - dy * back * r], k); p = P(q); ctx.lineTo(p[0], p[1]); }
      p = P(at(c0, 1)); ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      const g0 = P(c0), g1 = P(c1);
      const g = ctx.createLinearGradient(g0[0], g0[1], g1[0], g1[1]);
      g.addColorStop(0, C.str(C.light(base, 0.2)));
      g.addColorStop(1, C.str(C.light(base, 0.65), 0.55));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = outline; ctx.lineWidth = 0.012; ctx.stroke();
      // 流れる 線
      ctx.strokeStyle = C.str(C.dark(base, 0.25), 0.6); ctx.lineWidth = 0.014; ctx.lineCap = 'round';
      for (const [k, a, b] of [[-0.45, 0.35, 0.85], [0.05, 0.25, 0.75], [0.5, 0.4, 0.9]]) {
        const s0 = P(at([c0[0] + dx * len * a, c0[1] + dy * len * a], k)), s1 = P(at([c0[0] + dx * len * b, c0[1] + dy * len * b], k));
        ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
      }
      ctx.restore();
    }

    // デビル: 頭の 左右から 外へ 反った 角
    if (key === 'devil') {
      for (const sx of [-1, 1]) {
        const e = rot(sx * r * 0.78, 0, 0, turn, pitch);
        ctx.save();
        ctx.translate(e[0], -r * 0.38);
        ctx.scale(sx, 1);
        ctx.beginPath();
        ctx.moveTo(-r * 0.22, r * 0.18);
        ctx.quadraticCurveTo(r * 0.55, r * 0.05, r * 0.62, -r * 0.95); // 外側の へり → 先
        ctx.quadraticCurveTo(r * 0.3, -r * 0.2, -r * 0.18, -r * 0.28); // 内側の へり
        ctx.closePath();
        ctx.fillStyle = ballGrad(ctx, r * 0.15, -r * 0.3, r * 0.7, base);
        ctx.fill();
        ctx.strokeStyle = outline; ctx.lineWidth = 0.012; ctx.stroke();
        ctx.restore();
      }
    }

    // どせい: 頭のまわりの 輪 (奥の半分 → 頭 → 手前の半分)
    const saturnRing = (front) => {
      const cy = -r * 0.42, rx = r * 1.9, ry = r * (0.26 + 0.3 * Math.min(1, Math.abs(pitch) * 2));
      const a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : Math.PI * 2;
      const ring = (w, col) => { ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, a0, a1); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
      ctx.save();
      ctx.lineCap = 'round';
      ring(r * 0.36, C.str(C.light(base, 0.55), 0.3));
      ring(r * 0.2, C.str(C.light(base, 0.45)));
      ring(r * 0.06, 'rgba(255,255,255,0.7)');
      ctx.restore();
    };
    if (key === 'saturn') saturnRing(false);

    // ---- 頭 ----
    let frame, boxy = false, clipPoly = null;
    if (key === 'box' || key === 'block') {
      boxy = true;
      const out = {};
      if (key === 'box') drawBoxHead(ctx, r * 1.75, r * 1.75, r * 1.75, base, turn, pitch, out);
      else drawBoxHead(ctx, r * 1.6, r * 2.1, r * 1.5, base, turn, pitch, out);
      frame = out.frame;
      clipPoly = out.front;
    } else {
      headPath(ctx, key, r, t, turn);
      if (key === 'moon') {
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.024;
        ctx.stroke();
        ctx.fillStyle = ballGrad(ctx, r * 0.05, -r * 0.25, r * 1.45, base);
        ctx.fill();
        ctx.save();
        ctx.clip();
        const c = Math.cos(turn), tx = NS.MOON_TIP[0] * c * r, ty = NS.MOON_TIP[1] * r;
        ctx.fillStyle = C.str(C.mix(C.mix(C.mix([244, 150, 128], base, 0.12), [120, 120, 125], (o.gray || 0) * 0.8), [255, 255, 255], o.flash || 0));
        ctx.beginPath(); ctx.arc(tx, ty, r * 0.46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; // 角のつや
        ctx.beginPath(); ctx.ellipse(-r * 1.3 * c, -r * 0.62, r * 0.08 * Math.abs(c) + 0.004, r * 0.42, 0.25 * Math.sign(c || 1), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = ballGrad(ctx, 0, 0, r * (key === 'star' || key === 'meteor' ? 1.25 : 1.05), base);
        ctx.fill();
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.012;
        ctx.stroke();
      }
      if (key === 'sun') {
        for (let i = 0; i < SUN_LOBES; i++) {
          const th = ((i + 0.5) / SUN_LOBES) * Math.PI * 2 - Math.PI / 2;
          const lx = Math.cos(th) * r * 1.0, ly = Math.sin(th) * r * 1.0;
          const lit = 0.5 + 0.5 * Math.max(0, -Math.cos(th + Math.PI * 0.25)); // 左上ほど明るい
          ctx.fillStyle = `rgba(255,255,255,${0.08 + 0.22 * lit})`;
          ctx.beginPath();
          ctx.ellipse(lx - r * 0.04, ly - r * 0.05, r * 0.11, r * 0.06, th + Math.PI / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const a = rot(0, -0.02, r * 0.86, turn, pitch);
      const ux = rot(1, 0, 0, turn, pitch), uy = rot(0, -1, 0, turn, pitch);
      frame = { ox: a[0], oy: -a[1] + r * (FACE_FIT[key] || FACE_FIT.round)[1], ax: ux[0], ay: -ux[1], bx: uy[0], by: -uy[1], vis: a[2] / (r * 0.86) };
    }

    ctx.shadowBlur = 0; // オーラの 光は 頭と体だけ (顔・飾り・アンテナは 光らせない)
    // ---- 顔 ----
    if (frame.vis > 0.02) {
      ctx.save();
      ctx.beginPath();
      if (clipPoly) clipPoly.forEach((p, j) => (j ? ctx.lineTo(p[0], -p[1]) : ctx.moveTo(p[0], -p[1])));
      else headPath(ctx, key, r, t, turn);
      ctx.clip();
      ctx.globalAlpha *= NS.clamp(frame.vis * 3, 0, 1);
      const fr = boxy ? r * 0.82 : r * (FACE_FIT[key] || FACE_FIT.round)[0];
      withFrame(ctx, frame, fr, () => drawFace(ctx, ch, base, o, boxy));
      if (ch.equips && ch.equips.face) withFrame(ctx, frame, fr, () => drawFaceEquip(ctx, ch.equips.face, o));
      ctx.restore();
    }

    // ハイライト (頭からはみ出さないように)
    if (!boxy) {
      ctx.save();
      headPath(ctx, key, r, t, turn);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.36, -r * 0.62, r * 0.2, r * 0.1, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (key === 'saturn') saturnRing(true);
    const topY = -r * (TOP[key] || 1);

    // ---- 前側の飾り ----
    if (L.acc === 'tuft') {
      ctx.strokeStyle = C.str(C.dark(base, 0.55));
      ctx.lineWidth = 0.022; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const k of [-1, 0, 1]) {
        ctx.moveTo(k * 0.03, topY + 0.01);
        ctx.quadraticCurveTo(k * 0.08, topY - 0.08, k * 0.05 + 0.04, topY - 0.11);
      }
      ctx.stroke();
    }
    if (L.acc === 'ribbon') {
      const side = rot(r * 0.62, r * 0.62, 0.0, turn, pitch);
      if (side[2] > -r * 0.4) {
        ctx.save();
        ctx.translate(side[0], -side[1]);
        ctx.fillStyle = `hsl(${L.accHue},80%,62%)`;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-0.09, -0.06); ctx.lineTo(-0.09, 0.06); ctx.closePath();
        ctx.moveTo(0, 0); ctx.lineTo(0.09, -0.06); ctx.lineTo(0.09, 0.06); ctx.closePath();
        ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, 0.025, 0, Math.PI * 2); ctx.fillStyle = `hsl(${L.accHue},80%,45%)`; ctx.fill();
        ctx.restore();
      }
    }
    const maouCrown = ch.equips && ch.equips.head === 'maoucrown', majoHat = ch.equips && ch.equips.head === 'majohat';
    if (maouCrown) drawMaouCrown(ctx, r, topY, turn, t, o);
    else if (majoHat) drawMajoHat(ctx, r, topY, turn, t, o);
    else if (ch.rank === 'NAMESIS' || ch.crown) {
      ctx.save();
      ctx.translate(0, topY - 0.02);
      const g = ctx.createLinearGradient(0, -0.14, 0, 0);
      g.addColorStop(0, '#fff6b0'); g.addColorStop(1, '#d99a10');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-0.12, 0); ctx.lineTo(-0.13, -0.11); ctx.lineTo(-0.06, -0.05); ctx.lineTo(0, -0.14);
      ctx.lineTo(0.06, -0.05); ctx.lineTo(0.13, -0.11); ctx.lineTo(0.12, 0); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff3d6e';
      ctx.beginPath(); ctx.arc(0, -0.04, 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ---- アンテナ ----
    if (o.antenna !== false && ch.skill) { // スキルなしは アンテナが生えない
      const sway = Math.sin(t * 2.2 + L.phase) * 0.035 + (o.antennaKick || 0);
      const bx = majoHat ? r * 0.34 : Math.sin(turn) * r * (maouCrown ? 0.12 : 0.05), by = maouCrown ? topY + r - (CROWN_TIP / 55) * r : majoHat ? topY - r * HAT_TIP : topY + 0.005; // かんむりの やり・ぼうしの 先から
      const grade = ch.skill.grade || 0;
      const tipX = bx + sway, tipY = by - 0.16 - grade * 0.015;
      ctx.strokeStyle = '#1c1418';
      ctx.lineWidth = 0.018;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - sway * 0.2, by - 0.1, tipX, tipY);
      ctx.stroke();
      drawAntennaTip(ctx, tipX, tipY - ICON_R * NS.iconScale(ch.skill) * 0.75, ch.skill, Math.max(o.glow || 0, 0.15 + grade * 0.06 + 0.12 * Math.sin(t * 3 + L.phase)), t);
    }
  }

  function figureBase(ch, o) {
    let base = C.rgb(NS.COLORS[ch.color].hex);
    if (o.gray) base = C.mix(base, [120, 120, 125], o.gray * 0.8);
    if (o.flash) base = C.mix(base, [255, 255, 255], o.flash);
    return base;
  }

  // 全身。fx,fy = 足元のスクリーン座標、s = 1m あたりのピクセル
  NS.drawFigure = function (ctx, fx, fy, s, ch, o) {
    if (ch.monster) return NS.drawMonster(ctx, fx, fy, s, ch, o); // モンスターは 別の絵
    const L = ch.look;
    let base = figureBase(ch, o);
    const turn = o.turn || 0, t = o.t || 0;
    const ct = Math.cos(turn);
    const breath = Math.sin(t * 2.6 + L.phase) * 0.018;
    const sq = o.squash || 0;

    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(fx, fy);
    if (o.lie) ctx.rotate(o.lie * (Math.PI / 2) * (o.lieDir || 1));
    ctx.scale(s * L.h * (1 + sq * 0.5 - breath * 0.4), s * L.h * (1 - sq + breath));

    // オーラ: 体の色が 光る (体そのものが 明るくなり、ふちから 光が にじむ。顔は 光らせない)
    if (ch.aura && !o.gray) {
      const pulse = 0.5 + Math.sin(t * 3 + L.phase) * 0.5;
      base = C.mix(base, C.light(base, 0.6), 0.25 + 0.2 * pulse);
      ctx.shadowColor = C.str(C.light(base, 0.5), 0.95);
      ctx.shadowBlur = s * L.h * (0.12 + 0.06 * pulse);
    }

    const bodyDark = C.dark(base, 0.16);
    const ws = L.w;
    const P = proportions(ch);

    // 脚 (背の高さで長さ、体型で太さが変わる)
    const wings = ch.equips && ch.equips.back === 'hakai', axe = ch.equips && ch.equips.back === 'axe', tate = ch.equips && ch.equips.back === 'tate', bell = ch.equips && ch.equips.back === 'bell', staff = ch.equips && ch.equips.back === 'majostaff';
    if (tate && ct >= 0) drawTate(ctx, P, ws, turn, o); // せなかの たて (前を むいていれば 体の うしろ)
    if (bell && ct >= 0) drawBell(ctx, P, ws, turn, t, o);
    if (wings && ct >= 0) drawHakaiWings(ctx, P, ws, ct, t, o);
    if (axe && ct >= 0) drawBackAxe(ctx, P, ws, turn, o);
    if (staff && ct >= 0) drawBackStaff(ctx, P, ws, turn, t, o);
    const legX = 0.075 * Math.max(0.85, ws) * Math.max(0.3, Math.abs(ct));
    const legW = 0.096 * (0.75 + 0.25 * ws);
    for (const sx of [-1, 1]) {
      const lift = o.step ? Math.max(0, Math.sin(o.step + (sx > 0 ? Math.PI : 0))) * 0.06 : 0;
      capsule(ctx, sx * legX - legW / 2, -P.legH - lift, legW, P.legH + 0.01);
      ctx.fillStyle = C.str(bodyDark);
      ctx.fill();
    }

    // 腕 (奥側 → 胴体 → 手前側)
    const arms = [-1, 1].map((sx) => {
      const p = rot(sx * 0.18 * ws, 0, 0, turn, 0);
      return { sx: Math.sign(p[0]) || sx, x: p[0], z: p[2] };
    });
    const drawArm = (a) => {
      const raise = o.armRaise || 0;
      const ang = -a.sx * (0.35 + raise * 2.2 + Math.sin(t * 2.6 + L.phase + a.sx) * 0.05);
      ctx.save();
      ctx.translate(a.x, P.shoulderY);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, 0.09, 0.052, 0.105, 0, 0, Math.PI * 2);
      ctx.fillStyle = ballGrad(ctx, 0, 0.09, 0.1, a.z < 0 ? C.dark(base, 0.18) : base, 0.1);
      ctx.fill();
      if (ch.equips && ch.equips.body === 'majorobe') { // ながそで
        ctx.beginPath(); ctx.ellipse(0, 0.07, 0.064, 0.1, 0, 0, Math.PI * 2);
        ctx.fillStyle = ballGrad(ctx, 0, 0.07, 0.08, suitColor(a.z < 0 ? 0.2 : 0, o, ROBE), 0.1); ctx.fill();
      }
      if (ch.equips && (ch.equips.body === 'jewel' || ch.equips.body === 'nyushi')) { // 半そで
        ctx.beginPath();
        ctx.ellipse(0, 0.035, 0.062, 0.06, 0, 0, Math.PI * 2);
        ctx.fillStyle = ballGrad(ctx, 0, 0.035, 0.07, suitColor(a.z < 0 ? 0.18 : 0, o, ch.equips.body === 'nyushi' ? TIGHTS : SUIT), 0.06);
        ctx.fill();
      }
      ctx.restore();
    };
    arms.filter((a) => a.z < 0).forEach(drawArm);

    // 胴体
    ctx.beginPath();
    ctx.ellipse(0, P.bodyY, 0.165 * ws, P.bodyRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad(ctx, 0, P.bodyY, 0.19 * ws, base, P.bodyRy);
    ctx.fill();
    ctx.strokeStyle = C.str(C.dark(base, 0.5), 0.5);
    ctx.lineWidth = 0.012;
    ctx.stroke();
    if (ch.equips && ch.equips.body === 'jewel') drawJewelSuit(ctx, P, ws, turn, o);
    if (ch.equips && ch.equips.body === 'nyushi') drawTights(ctx, P, ws, turn, o);
    if (ch.equips && ch.equips.body === 'majorobe') drawRobe(ctx, P, ws, turn, o);

    if (L.acc === 'scarf') {
      const sc = `hsl(${L.accHue},75%,52%)`;
      ctx.fillStyle = sc;
      ctx.beginPath();
      ctx.ellipse(0, P.neckY, 0.15 * ws, 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      const tail = Math.sin(turn) * 0.08 + 0.06;
      ctx.beginPath();
      ctx.moveTo(tail - 0.03, P.neckY); ctx.lineTo(tail + 0.03, P.neckY);
      ctx.lineTo(tail + 0.04 + Math.sin(t * 3) * 0.01, P.neckY + 0.16); ctx.lineTo(tail - 0.02, P.neckY + 0.15);
      ctx.closePath();
      ctx.fill();
    }

    arms.filter((a) => a.z >= 0).forEach(drawArm);
    if (wings && ct < 0) drawHakaiWings(ctx, P, ws, ct, t, o);
    if (axe && ct < 0) drawBackAxe(ctx, P, ws, turn, o);
    if (staff && ct < 0) drawBackStaff(ctx, P, ws, turn, t, o);
    if (tate && ct < 0) drawTate(ctx, P, ws, turn, o);
    if (bell && ct < 0) drawBell(ctx, P, ws, turn, t, o);

    // 頭
    ctx.save();
    ctx.translate(0, P.headY + (o.headBob || 0));
    if (o.headTilt) ctx.rotate(o.headTilt);
    drawHeadGroup(ctx, ch, base, o);
    ctx.restore();
    ctx.shadowBlur = 0;

    // 溜め (スキル詠唱) のオーラ
    if (o.glow > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ec = C.rgb(NS.ELEMENTS[o.glowElem || ch.mainElem].color);
      const g = ctx.createRadialGradient(0, P.bodyY - 0.2, 0.05, 0, P.bodyY - 0.2, 0.85);
      g.addColorStop(0, C.str(ec, 0.45 * o.glow));
      g.addColorStop(1, C.str(ec, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1.8, 2, 2.4);
      ctx.restore();
    }
    ctx.restore();
  };

  // 体のつくり (y は上がマイナス)。回避 = 背の高さ (脚・胴の長さ)、素早さ = 体型 (横幅)
  function proportions(ch) {
    const L = ch.look;
    const legH = 0.17 * (L.leg || 1);
    const bodyRy = 0.19 * (L.torso || 1);
    const bodyY = -(legH + bodyRy * 0.74);
    return {
      legH, bodyRy, bodyY,
      shoulderY: bodyY - bodyRy * 0.47,
      neckY: bodyY - bodyRy * 0.79,
      headY: bodyY - bodyRy - 0.2,
    };
  }
  // 足元から アンテナの先までの高さ (ワールド単位)
  NS.figureHeight = function (ch) {
    if (ch.monster) return ch.height || 2.4;
    const P = proportions(ch);
    const crown = ch.equips && ch.equips.head === 'maoucrown' ? HR * (CROWN_TIP / 55 - 1) : ch.equips && ch.equips.head === 'majohat' ? HR * HAT_TIP : 0; // まおうのかんむりの やり・まじょのぼうしの ぶん
    const top = -P.headY + Math.max(HR * (TOP[ch.head] || 1) + crown + (ch.skill ? 0.32 + (ch.skill.grade || 0) * 0.035 : 0.04), ch.head === 'moon' ? HR * 1.7 : 0);
    return top * ch.look.h;
  };

  // 顔アイコン用 (頭だけを正面から)
  NS.drawHeadOnly = function (ctx, cx, cy, size, ch, o = {}) {
    if (ch.monster) return NS.drawMonsterHead(ctx, cx, cy, size, ch, o);
    let base = figureBase(ch, o);
    ctx.save();
    if (ch.aura && !o.gray) {
      base = C.mix(base, C.light(base, 0.6), 0.35);
      ctx.shadowColor = C.str(C.light(base, 0.5), 1);
      ctx.shadowBlur = size * 0.14;
    }
    ctx.translate(cx, cy);
    const k = size / (HR * 2.9);
    ctx.scale(k, k);
    drawHeadGroup(ctx, ch, base, Object.assign({ turn: 0, pitch: 0.05, t: 0, antenna: true }, o));
    ctx.restore();
  };

  // 全身の小さな絵 (命名所の一覧・パーティ枠)。背の違いが分かるように 縮尺は全員共通
  const bodyCache = new Map();
  NS.bodyThumb = function (ch, w, h) {
    const key = (ch.key || ch.name) + '|' + NS.equipKeys(ch.equips).join(',') + '|' + w + 'x' + h; // 出生の子は 名前が かぶることがあるので キーで
    if (bodyCache.has(key)) return bodyCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = h * 2;
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    const s = h * 0.55;
    if (ch.aura) auraBack(ctx, w / 2, h * 0.55, Math.min(w, h) * 0.62, ch);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.965, s * 0.22 * ch.look.w, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    NS.drawFigure(ctx, w / 2, h * 0.96, s, ch, { turn: 0.35, pitch: 0.12, t: 1.3 });
    const url = cv.toDataURL();
    bodyCache.set(key, url);
    return url;
  };

  // アイコンの うしろの オーラの 光 (体の色) と 小さな きらめき
  function auraBack(ctx, x, y, r, ch) {
    const c = C.light(C.rgb(NS.COLORS[ch.color].hex), 0.35);
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, C.str(c, 0.75));
    g.addColorStop(0.55, C.str(c, 0.35));
    g.addColorStop(1, C.str(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    for (const [dx, dy, k] of [[0.72, -0.62, 1], [-0.78, -0.2, 0.7], [0.6, 0.55, 0.6]]) {
      const sx = x + dx * r * 0.85, sy = y + dy * r * 0.85, a = r * 0.13 * k;
      ctx.beginPath(); ctx.moveTo(sx, sy - a); ctx.lineTo(sx + a * 0.3, sy - a * 0.3); ctx.lineTo(sx + a, sy); ctx.lineTo(sx + a * 0.3, sy + a * 0.3);
      ctx.lineTo(sx, sy + a); ctx.lineTo(sx - a * 0.3, sy + a * 0.3); ctx.lineTo(sx - a, sy); ctx.lineTo(sx - a * 0.3, sy - a * 0.3); ctx.closePath(); ctx.fill();
    }
  }

  const portraitCache = new Map();
  NS.clearThumbs = () => { bodyCache.clear(); portraitCache.clear(); };
  NS.portrait = function (ch, size = 72) {
    const key = (ch.key || ch.name) + '|' + size;
    if (portraitCache.has(key)) return portraitCache.get(key);
    const cv = document.createElement('canvas');
    const dpr = 2;
    cv.width = cv.height = size * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    if (ch.aura) auraBack(ctx, size / 2, size / 2, size * 0.5, ch);
    NS.drawHeadOnly(ctx, size / 2, size * 0.66, size * 0.8, ch, { t: 1.3 });
    const url = cv.toDataURL();
    portraitCache.set(key, url);
    return url;
  };

  // 3D の 試作 (proto3d.html) 用: 頭の 形の 輪郭と 顔だけの 絵
  NS.headPath = headPath;
  NS.drawFaceOnly = (ctx, ch, o = {}) => {
    drawFace(ctx, ch, figureBase(ch, o), o, ch.head === 'box' || ch.head === 'block');
    if (ch.equips && ch.equips.face) drawFaceEquip(ctx, ch.equips.face, o); // しなこ など
  };
  NS.CROWN_TIP = CROWN_TIP;
  NS.FACE_FIT = FACE_FIT; NS.HEAD_R = HR;
})();
