// コロシアムの背景。すべて 3D 座標で組み立て、毎フレーム透視投影して描く。
// 闘技場の内側は凸なので、壁・観客席・床はこの順に描けば互いを正しく隠す。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const C = NS.col;

  const RW = 13;        // 壁の半径 = 床の半径
  const WH = 3.0;       // 壁の高さ
  const SEG = 96;
  const TIERS = 7;
  const BACK = -Math.PI / 2; // カメラ正面奥 (-z) の方位角
  NS.ARENA = { RW, WH };

  const COS = [], SIN = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    COS.push(Math.cos(a)); SIN.push(Math.sin(a));
  }
  const P = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];

  const GATES = [BACK - 0.42, BACK + 0.42, BACK - 1.45, BACK + 1.45];
  const PILLARS = [BACK - 0.9, BACK + 0.9, BACK - 2.05, BACK + 2.05].map((a) => ({ a, r: 12.1 }));
  const BRAZIERS = [BACK, BACK - 0.68, BACK + 0.68, BACK - 1.2, BACK + 1.2].map((a) => ({ a, r: 11.7 }));

  // 観客 (シードで固定配置)
  const crowd = [];
  (function () {
    const rng = new NS.RNG('crowd');
    const shirts = ['#d94b3d', '#3d7ad9', '#e0c03a', '#4fb35a', '#f0f0f0', '#8a5ad0', '#e88a3a', '#3fb8c8'];
    const skins = ['#f3d2b0', '#d9a77e', '#9c6a46'];
    for (let k = 0; k < TIERS; k++) {
      const r = 13.9 + k * 1.0;
      const n = Math.floor((Math.PI * 2 * r) / 0.52);
      for (let i = 0; i < n; i++) {
        if (rng.next() < 0.12) continue;
        const a = ((i + rng.range(-0.25, 0.25)) / n) * Math.PI * 2;
        crowd.push({
          k, a, r: r + 0.25, y: WH + (k + 1) * 0.8,
          shirt: rng.int(0, shirts.length - 1), skin: rng.int(0, skins.length - 1),
          ph: rng.next() * Math.PI * 2, sp: 2 + rng.next() * 3,
        });
      }
    }
    NS._crowdColors = { shirts, skins };
  })();
  NS.crowdExcite = 0;

  // 床のしみ
  const blots = [];
  (function () {
    const rng = new NS.RNG('floor');
    for (let i = 0; i < 46; i++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * (RW - 1);
      blots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rx: rng.range(0.4, 1.6), rz: rng.range(0.3, 1.2), dark: rng.next() < 0.6 });
    }
  })();

  // ほこり (奥行きを感じさせる浮遊物)
  const motes = [];
  for (let i = 0; i < 70; i++) {
    motes.push({ x: (Math.random() - 0.5) * 22, y: Math.random() * 6, z: (Math.random() - 0.5) * 22, ph: Math.random() * 10 });
  }

  function visibleSeg(cam, i, r, y) {
    const a = ((i + 0.5) / SEG) * Math.PI * 2;
    return cam.toCam(Math.cos(a) * r, y, Math.sin(a) * r)[2] > -r * 0.2;
  }

  // ---------- 空と天幕 ----------
  function drawSky(ctx, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, cam.h);
    g.addColorStop(0, '#3a0d18');
    g.addColorStop(0.35, '#8e2622');
    g.addColorStop(0.6, '#d0622e');
    g.addColorStop(1, '#f2a65a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.w, cam.h);
  }

  function drawCanopy(ctx, cam) {
    const rO = 21.5, rI = 15.5, yO = 10.2, yI = 12.2;
    const n = 48;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = pass; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        // 布のたるみ
        NS.pathPoly(ctx, cam, [P(a0, rO, yO), P(am, rO, yO - 0.5), P(a1, rO, yO), P(a1, rI, yI), P(am, rI, yI - 0.3), P(a0, rI, yI)]);
      }
      ctx.fillStyle = pass ? '#9e1f24' : '#c8322e';
      ctx.fill();
    }
    // 外周の上壁
    ctx.beginPath();
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, 20.6, 9)) continue;
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
      NS.pathPoly(ctx, cam, [P(a0, 20.6, 8.6), P(a1, 20.6, 8.6), P(a1, 20.6, 10.4), P(a0, 20.6, 10.4)]);
    }
    ctx.fillStyle = '#7a5a40';
    ctx.fill();
  }

  // ---------- 観客席 ----------
  function drawStands(ctx, cam, t) {
    const { shirts, skins } = NS._crowdColors;
    const ex = NS.crowdExcite;
    for (let k = TIERS - 1; k >= 0; k--) {
      const r = 13.4 + k * 1.0, y0 = WH + k * 0.8, y1 = y0 + 0.8;
      // 蹴上げ
      ctx.beginPath();
      for (let i = 0; i < SEG; i++) {
        if (!visibleSeg(cam, i, r, y1)) continue;
        NS.pathPoly(ctx, cam, [[COS[i] * r, y0, SIN[i] * r], [COS[i + 1] * r, y0, SIN[i + 1] * r], [COS[i + 1] * r, y1, SIN[i + 1] * r], [COS[i] * r, y1, SIN[i] * r]]);
      }
      ctx.fillStyle = C.str(C.dark('#8a6a4c', 0.15 + k * 0.03));
      ctx.fill();
      // 踏み面
      const r2 = r + 1.0;
      ctx.beginPath();
      for (let i = 0; i < SEG; i++) {
        if (!visibleSeg(cam, i, r, y1)) continue;
        NS.pathPoly(ctx, cam, [[COS[i] * r, y1, SIN[i] * r], [COS[i + 1] * r, y1, SIN[i + 1] * r], [COS[i + 1] * r2, y1, SIN[i + 1] * r2], [COS[i] * r2, y1, SIN[i] * r2]]);
      }
      ctx.fillStyle = C.str(C.dark('#b89270', 0.1 + k * 0.03));
      ctx.fill();

      // 観客 (色ごとにまとめて描く)
      const bodies = shirts.map(() => []);
      const heads = skins.map(() => []);
      for (const c of crowd) {
        if (c.k !== k) continue;
        const jump = Math.max(0, Math.sin(t * c.sp + c.ph)) * (0.04 + ex * 0.32);
        const x = Math.cos(c.a) * c.r, z = Math.sin(c.a) * c.r;
        const p = cam.project(x, c.y + 0.3 + jump, z);
        if (!p || p.x < -20 || p.x > cam.w + 20 || p.y < -20 || p.y > cam.h + 20) continue;
        bodies[c.shirt].push(p);
        const ph = cam.project(x, c.y + 0.62 + jump, z);
        if (ph) heads[c.skin].push(ph);
      }
      bodies.forEach((list, i) => {
        if (!list.length) return;
        ctx.beginPath();
        for (const p of list) {
          const w = 0.19 * p.s, h = 0.3 * p.s;
          ctx.moveTo(p.x + w, p.y);
          ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2);
        }
        ctx.fillStyle = C.str(C.dark(shirts[i], 0.25));
        ctx.fill();
      });
      heads.forEach((list, i) => {
        if (!list.length) return;
        ctx.beginPath();
        for (const p of list) {
          const rr = 0.13 * p.s;
          ctx.moveTo(p.x + rr, p.y);
          ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        }
        ctx.fillStyle = C.str(C.dark(skins[i], 0.2));
        ctx.fill();
      });
    }
  }

  // ---------- 壁 ----------
  function wallShade(i) {
    const a = ((i + 0.5) / SEG) * Math.PI * 2;
    // 内向き法線と光の向き
    const nx = -Math.cos(a), nz = -Math.sin(a);
    const lx = 0.55, lz = 0.83;
    return 0.68 + 0.32 * Math.max(0, nx * lx + nz * lz);
  }

  function drawWall(ctx, cam) {
    const base = '#c9a27a';
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, RW, 1.5)) continue;
      const sh = wallShade(i);
      const pts = [[COS[i] * RW, 0, SIN[i] * RW], [COS[i + 1] * RW, 0, SIN[i + 1] * RW], [COS[i + 1] * RW, WH, SIN[i + 1] * RW], [COS[i] * RW, WH, SIN[i] * RW]];
      ctx.beginPath();
      if (!NS.pathPoly(ctx, cam, pts)) continue;
      const g = (() => {
        const top = cam.project(COS[i] * RW, WH, SIN[i] * RW), bot = cam.project(COS[i] * RW, 0, SIN[i] * RW);
        if (!top || !bot) return C.str(C.dark(base, 1 - sh));
        const gr = ctx.createLinearGradient(0, top.y, 0, bot.y);
        gr.addColorStop(0, C.str(C.dark(base, 1 - sh * 1.04)));
        gr.addColorStop(1, C.str(C.dark(base, 1 - sh * 0.78)));
        return gr;
      })();
      ctx.fillStyle = g;
      ctx.fill();
    }

    // レンガの目地
    ctx.beginPath();
    const rows = [];
    for (let y = 0.32; y < WH - 0.2; y += 0.36) rows.push(y);
    for (const y of rows) {
      const pts = [];
      for (let i = 0; i <= SEG; i++) pts.push([COS[i] * (RW - 0.01), y, SIN[i] * (RW - 0.01)]);
      NS.pathLine(ctx, cam, pts);
    }
    for (let ri = 0; ri < rows.length - 1; ri++) {
      for (let i = 0; i < SEG; i++) {
        if (!visibleSeg(cam, i, RW, 1.5)) continue;
        const a = ((i + (ri % 2) * 0.5) / SEG) * Math.PI * 2;
        const x = Math.cos(a) * (RW - 0.01), z = Math.sin(a) * (RW - 0.01);
        NS.pathLine(ctx, cam, [[x, rows[ri], z], [x, rows[ri + 1], z]]);
      }
    }
    ctx.strokeStyle = 'rgba(90,58,36,0.38)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 足元の帯と金のライン
    ctx.beginPath();
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, RW, 0.2)) continue;
      NS.pathPoly(ctx, cam, [[COS[i] * (RW - 0.02), 0, SIN[i] * (RW - 0.02)], [COS[i + 1] * (RW - 0.02), 0, SIN[i + 1] * (RW - 0.02)], [COS[i + 1] * (RW - 0.02), 0.3, SIN[i + 1] * (RW - 0.02)], [COS[i] * (RW - 0.02), 0.3, SIN[i] * (RW - 0.02)]]);
    }
    ctx.fillStyle = 'rgba(70,45,30,0.55)';
    ctx.fill();

    // 上端の笠石
    ctx.beginPath();
    const rc = RW - 0.25;
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, RW, WH)) continue;
      NS.pathPoly(ctx, cam, [[COS[i] * rc, WH - 0.2, SIN[i] * rc], [COS[i + 1] * rc, WH - 0.2, SIN[i + 1] * rc], [COS[i + 1] * rc, WH + 0.05, SIN[i + 1] * rc], [COS[i] * rc, WH + 0.05, SIN[i] * rc]]);
    }
    ctx.fillStyle = '#e2c49e';
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, RW, WH)) continue;
      NS.pathPoly(ctx, cam, [[COS[i] * rc, WH + 0.05, SIN[i] * rc], [COS[i + 1] * rc, WH + 0.05, SIN[i + 1] * rc], [COS[i + 1] * RW, WH + 0.05, SIN[i + 1] * RW], [COS[i] * RW, WH + 0.05, SIN[i] * RW]]);
    }
    ctx.fillStyle = '#f0dcbc';
    ctx.fill();
  }

  // 手すり (壁の上)
  function drawRailing(ctx, cam) {
    const r = RW - 0.12;
    ctx.beginPath();
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, r, WH)) continue;
      for (let j = 0; j < 3; j++) {
        const a = ((i + j / 3) / SEG) * Math.PI * 2, w = 0.05 / r;
        NS.pathPoly(ctx, cam, [P(a - w, r, WH + 0.05), P(a + w, r, WH + 0.05), P(a + w, r, WH + 0.55), P(a - w, r, WH + 0.55)]);
      }
    }
    ctx.fillStyle = '#d6b892';
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, r, WH)) continue;
      NS.pathPoly(ctx, cam, [[COS[i] * r, WH + 0.52, SIN[i] * r], [COS[i + 1] * r, WH + 0.52, SIN[i + 1] * r], [COS[i + 1] * r, WH + 0.66, SIN[i + 1] * r], [COS[i] * r, WH + 0.66, SIN[i] * r]]);
    }
    ctx.fillStyle = '#ecd4b0';
    ctx.fill();
  }

  // ---------- 門 ----------
  function archPts(g, r, w, hr, inset = 0) {
    const pts = [];
    const v = (u, y) => P(g + u / r, r - inset, y);
    pts.push(v(-w, 0));
    pts.push(v(-w, hr));
    for (let k = 0; k <= 12; k++) {
      const th = Math.PI - (k / 12) * Math.PI;
      pts.push(v(Math.cos(th) * w, hr + Math.sin(th) * w * 0.85));
    }
    pts.push(v(w, 0));
    return pts;
  }
  function drawGates(ctx, cam) {
    const r = RW - 0.03;
    for (const g of GATES) {
      if (cam.toCam(Math.cos(g) * r, 1, Math.sin(g) * r)[2] < 0.5) continue;
      NS.fillPoly(ctx, cam, archPts(g, r, 1.35, 1.75), '#e8cfa8');
      NS.fillPoly(ctx, cam, archPts(g, r - 0.01, 1.12, 1.7), '#1d1410');
      // 奥のほのかな光
      NS.fillPoly(ctx, cam, archPts(g, r - 0.02, 0.8, 1.2), 'rgba(120,70,40,0.35)');
      // 鉄格子
      ctx.beginPath();
      for (let u = -1.0; u <= 1.01; u += 0.25) {
        const top = 1.7 + Math.sqrt(Math.max(0, 1 - (u / 1.12) ** 2)) * 1.12 * 0.85 - 0.05;
        NS.pathLine(ctx, cam, [P(g + u / r, r - 0.04, 0), P(g + u / r, r - 0.04, top)]);
      }
      for (const y of [0.6, 1.3, 2.0]) {
        NS.pathLine(ctx, cam, [P(g - 1.1 / r, r - 0.05, y), P(g + 1.1 / r, r - 0.05, y)]);
      }
      const pm = cam.project(Math.cos(g) * r, 1, Math.sin(g) * r);
      ctx.lineWidth = Math.max(1, pm ? pm.s * 0.05 : 1.5);
      ctx.strokeStyle = '#6b7178';
      ctx.stroke();
      ctx.lineWidth = Math.max(0.5, pm ? pm.s * 0.018 : 0.6);
      ctx.strokeStyle = 'rgba(220,230,240,0.35)';
      ctx.stroke();
    }
  }

  // ---------- 床 ----------
  function drawFloor(ctx, cam, t) {
    const disc = [];
    for (let i = 0; i < SEG; i++) disc.push([COS[i] * RW, 0, SIN[i] * RW]);
    ctx.save();
    ctx.beginPath();
    if (!NS.pathPoly(ctx, cam, disc)) { ctx.restore(); return; }
    ctx.fillStyle = '#9c8366';
    ctx.fill();
    ctx.clip();

    // 中央を明るく (スポットライト)
    const c0 = cam.project(0, 0, 0), cx6 = cam.project(7, 0, 0), cz6 = cam.project(0, 0, -7);
    if (c0 && cx6 && cz6) {
      const rx = Math.abs(cx6.x - c0.x), ry = Math.max(4, Math.abs(cz6.y - c0.y));
      ctx.save();
      ctx.translate(c0.x, c0.y);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.6);
      g.addColorStop(0, 'rgba(255,236,200,0.55)');
      g.addColorStop(0.55, 'rgba(255,220,170,0.18)');
      g.addColorStop(1, 'rgba(60,30,20,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(-rx * 4, -rx * 4, rx * 8, rx * 8);
      ctx.restore();
    }

    // しみ
    for (const b of blots) {
      ctx.beginPath();
      if (NS.floorEllipse(ctx, cam, b.x, b.z, b.rx, b.rz, 12)) {
        ctx.fillStyle = b.dark ? 'rgba(70,50,30,0.09)' : 'rgba(255,240,210,0.07)';
        ctx.fill();
      }
    }

    // 石畳 (同心円 + 放射線)
    ctx.beginPath();
    for (let r = 2.2; r < RW; r += 1.6) {
      const pts = [];
      for (let i = 0; i <= SEG; i++) pts.push([COS[i] * r, 0, SIN[i] * r]);
      NS.pathLine(ctx, cam, pts);
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + ((i % 2) * 0.03);
      NS.pathLine(ctx, cam, [P(a, 2.2, 0), P(a, RW, 0)]);
    }
    ctx.strokeStyle = 'rgba(70,48,30,0.22)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // 金の円と紋章
    ctx.beginPath();
    for (const r of [7.6, 7.8]) {
      const pts = [];
      for (let i = 0; i <= SEG; i++) pts.push([COS[i] * r, 0.003, SIN[i] * r]);
      NS.pathLine(ctx, cam, pts);
    }
    ctx.strokeStyle = 'rgba(240,196,70,0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    const er = 1.9;
    const circ = [];
    for (let i = 0; i <= 48; i++) circ.push([Math.cos((i / 48) * Math.PI * 2) * er, 0.003, Math.sin((i / 48) * Math.PI * 2) * er]);
    NS.pathLine(ctx, cam, circ);
    for (let tri = 0; tri < 2; tri++) {
      const pts = [];
      for (let k = 0; k <= 3; k++) {
        const a = (k / 3) * Math.PI * 2 + tri * Math.PI + t * 0.05;
        pts.push([Math.cos(a) * er * 0.92, 0.003, Math.sin(a) * er * 0.92]);
      }
      NS.pathLine(ctx, cam, pts);
    }
    ctx.strokeStyle = 'rgba(240,196,70,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 壁際の影
    ctx.beginPath();
    for (let i = 0; i < SEG; i++) {
      NS.pathPoly(ctx, cam, [[COS[i] * (RW - 1.2), 0.002, SIN[i] * (RW - 1.2)], [COS[i + 1] * (RW - 1.2), 0.002, SIN[i + 1] * (RW - 1.2)], [COS[i + 1] * RW, 0.002, SIN[i + 1] * RW], [COS[i] * RW, 0.002, SIN[i] * RW]]);
    }
    ctx.fillStyle = 'rgba(40,20,10,0.22)';
    ctx.fill();
    ctx.restore();
  }

  // ---------- 柱・かがり火 (キャラと一緒に奥行きソートする) ----------
  function pillarDrawable(cam, pl) {
    const x = Math.cos(pl.a) * pl.r, z = Math.sin(pl.a) * pl.r;
    const depth = cam.depth(x, 2, z);
    if (depth < 0.3) return null;
    return {
      depth,
      draw(ctx) {
        const H = 7.2, rad = 0.55;
        const b = cam.project(x, 0, z), tp = cam.project(x, H, z);
        if (!b || !tp) return;
        const wB = rad * b.s, wT = rad * tp.s;
        const g = ctx.createLinearGradient(b.x - wB, 0, b.x + wB, 0);
        g.addColorStop(0, '#8e7356'); g.addColorStop(0.35, '#f1dcc0'); g.addColorStop(0.6, '#d9bf9c'); g.addColorStop(1, '#6e5640');
        ctx.beginPath();
        ctx.moveTo(b.x - wB, b.y); ctx.lineTo(tp.x - wT, tp.y); ctx.lineTo(tp.x + wT, tp.y); ctx.lineTo(b.x + wB, b.y);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        // 縦の溝
        ctx.strokeStyle = 'rgba(110,80,50,0.25)';
        ctx.lineWidth = Math.max(1, wB * 0.06);
        ctx.beginPath();
        for (const f of [-0.55, -0.2, 0.15, 0.5]) {
          ctx.moveTo(b.x + wB * f, b.y); ctx.lineTo(tp.x + wT * f, tp.y);
        }
        ctx.stroke();
        // 金の帯と台座
        const band = (y0, y1, wmul, color) => {
          const p0 = cam.project(x, y0, z), p1 = cam.project(x, y1, z);
          if (!p0 || !p1) return;
          const gg = ctx.createLinearGradient(p0.x - rad * wmul * p0.s, 0, p0.x + rad * wmul * p0.s, 0);
          gg.addColorStop(0, C.str(C.dark(color, 0.45))); gg.addColorStop(0.35, C.str(C.light(color, 0.35))); gg.addColorStop(1, C.str(C.dark(color, 0.5)));
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.moveTo(p0.x - rad * wmul * p0.s, p0.y); ctx.lineTo(p1.x - rad * wmul * p1.s, p1.y);
          ctx.lineTo(p1.x + rad * wmul * p1.s, p1.y); ctx.lineTo(p0.x + rad * wmul * p0.s, p0.y);
          ctx.fill();
        };
        band(0, 0.45, 1.3, '#d8c2a0');
        band(0.45, 0.6, 1.15, '#e5b53a');
        band(4.2, 4.42, 1.08, '#e5b53a');
        band(6.7, 7.2, 1.35, '#e0c9a6');
      },
    };
  }

  function brazierDrawable(cam, br, t) {
    const x = Math.cos(br.a) * br.r, z = Math.sin(br.a) * br.r;
    const depth = cam.depth(x, 1, z);
    if (depth < 0.3) return null;
    return {
      depth,
      draw(ctx) {
        const b = cam.project(x, 0, z), top = cam.project(x, 1.25, z);
        if (!b || !top) return;
        const s = b.s;
        // X 字の脚
        ctx.strokeStyle = '#5a3a22';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, 0.09 * s);
        ctx.beginPath();
        ctx.moveTo(b.x - 0.32 * s, b.y); ctx.lineTo(top.x + 0.22 * s, top.y);
        ctx.moveTo(b.x + 0.32 * s, b.y); ctx.lineTo(top.x - 0.22 * s, top.y);
        ctx.stroke();
        // 器
        const bw = 0.42 * top.s, bh = 0.2 * top.s;
        const gg = ctx.createLinearGradient(top.x - bw, 0, top.x + bw, 0);
        gg.addColorStop(0, '#7a5418'); gg.addColorStop(0.4, '#f2cc5a'); gg.addColorStop(1, '#6a4410');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(top.x - bw, top.y - bh * 0.4);
        ctx.quadraticCurveTo(top.x, top.y + bh * 1.6, top.x + bw, top.y - bh * 0.4);
        ctx.closePath();
        ctx.fill();
        // 炎
        const fy = top.y - bh * 0.4, fs = top.s;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(top.x, fy - 0.2 * fs, 0, top.x, fy - 0.2 * fs, 1.6 * fs);
        glow.addColorStop(0, 'rgba(255,170,60,0.55)');
        glow.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(top.x - 1.6 * fs, fy - 1.8 * fs, 3.2 * fs, 3.2 * fs);
        for (let k = 0; k < 5; k++) {
          const ph = t * (5 + k) + br.a * 7 + k * 1.7;
          const fx = top.x + Math.sin(ph) * 0.08 * fs + (k - 2) * 0.07 * fs;
          const hgt = (0.45 + 0.18 * Math.sin(ph * 1.3)) * fs * (k === 2 ? 1.4 : 1);
          const w = 0.13 * fs;
          ctx.fillStyle = k % 2 ? 'rgba(255,120,30,0.75)' : 'rgba(255,210,90,0.8)';
          ctx.beginPath();
          ctx.moveTo(fx - w, fy);
          ctx.quadraticCurveTo(fx - w * 0.6, fy - hgt * 0.6, fx + Math.sin(ph * 2) * w * 0.5, fy - hgt);
          ctx.quadraticCurveTo(fx + w * 0.6, fy - hgt * 0.6, fx + w, fy);
          ctx.fill();
        }
        ctx.restore();
      },
    };
  }

  function moteDrawables(cam, t, out) {
    const hell = NS.arenaTheme === 'hell' || NS.arenaTheme === 'abyss', abyss = NS.arenaTheme === 'abyss'; // 地獄: 火の粉が はやく まいあがる (アビスは 紫も まじる)
    for (const m of motes) {
      const y = (m.y + t * (hell ? 0.6 : 0.12) + m.ph) % 6;
      const x = m.x + Math.sin(t * 0.3 + m.ph) * 0.5;
      const p = cam.project(x, y, m.z);
      if (!p || p.x < 0 || p.x > cam.w || p.y < 0 || p.y > cam.h) continue;
      out.push({
        depth: p.z,
        draw(ctx) {
          ctx.fillStyle = abyss && Math.sin(m.ph * 13) > 0 ? 'rgba(190,110,255,0.85)' : hell ? `rgba(255,${120 + Math.round(Math.sin(m.ph * 7) * 60)},40,0.85)` : 'rgba(255,230,190,0.35)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(hell ? 1 : 0.6, (hell ? 0.035 : 0.025) * p.s), 0, Math.PI * 2);
          ctx.fill();
        },
      });
    }
  }

  // ---------- どうくつ (幻帝のどうくつの バトル) ----------
  //   まっくらな 天井・緑がかった 石の 壁 (高い)・石だたみの 床。観客は いない
  const CAVE_H = 7;
  function drawCaveWall(ctx, cam) {
    const g0 = ctx.createLinearGradient(0, 0, 0, cam.h);
    g0.addColorStop(0, '#020403'); g0.addColorStop(0.6, '#0a120d'); g0.addColorStop(1, '#101c14');
    ctx.fillStyle = g0; ctx.fillRect(0, 0, cam.w, cam.h);
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, RW, 1.5)) continue;
      const sh = wallShade(i);
      const pts = [[COS[i] * RW, 0, SIN[i] * RW], [COS[i + 1] * RW, 0, SIN[i + 1] * RW], [COS[i + 1] * RW, CAVE_H, SIN[i + 1] * RW], [COS[i] * RW, CAVE_H, SIN[i] * RW]];
      ctx.beginPath();
      if (!NS.pathPoly(ctx, cam, pts)) continue;
      const top = cam.project(COS[i] * RW, CAVE_H, SIN[i] * RW), bot = cam.project(COS[i] * RW, 0, SIN[i] * RW);
      if (top && bot) {
        const gr = ctx.createLinearGradient(0, top.y, 0, bot.y);
        gr.addColorStop(0, '#030504'); gr.addColorStop(0.55, C.str(C.dark('#3e5446', 1 - sh * 0.75))); gr.addColorStop(1, C.str(C.dark('#4e6a52', 1 - sh * 0.9)));
        ctx.fillStyle = gr;
      } else ctx.fillStyle = '#1c2a20';
      ctx.fill();
    }
    // 石の 目地 (横の 段と、段ごとに ずれた 縦の 線)
    ctx.strokeStyle = 'rgba(8,14,10,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let row = 0, y = 0.55; y < CAVE_H * 0.7; y += 0.55, row++) {
      const ring = [];
      for (let i = 0; i <= SEG; i++) ring.push([COS[i] * RW, y, SIN[i] * RW]);
      NS.pathLine(ctx, cam, ring.filter((_, i) => i === SEG || visibleSeg(cam, Math.min(i, SEG - 1), RW, y)));
      for (let i = row % 2; i < SEG; i += 2) {
        if (!visibleSeg(cam, i, RW, y)) continue;
        NS.pathLine(ctx, cam, [[COS[i] * RW, y, SIN[i] * RW], [COS[i] * RW, y + 0.55, SIN[i] * RW]]);
      }
    }
    ctx.stroke();
  }
  function drawCaveFloor(ctx, cam) {
    const disc = [];
    for (let i = 0; i < SEG; i++) disc.push([COS[i] * RW, 0, SIN[i] * RW]);
    ctx.save();
    ctx.beginPath();
    if (!NS.pathPoly(ctx, cam, disc)) { ctx.restore(); return; }
    ctx.fillStyle = '#3e5444'; ctx.fill(); ctx.clip();
    // 石だたみ
    ctx.strokeStyle = 'rgba(14,24,16,0.65)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let v = -RW; v <= RW; v += 1.3) { NS.pathLine(ctx, cam, [[v, 0.002, -RW], [v, 0.002, RW]]); NS.pathLine(ctx, cam, [[-RW, 0.002, v], [RW, 0.002, v]]); }
    ctx.stroke();
    // まんなかを たいまつで 明るく、まわりは 暗く
    const c0 = cam.project(0, 0, 0), cx6 = cam.project(7, 0, 0), cz6 = cam.project(0, 0, -7);
    if (c0 && cx6 && cz6) {
      const rx = Math.abs(cx6.x - c0.x), ry = Math.max(4, Math.abs(cz6.y - c0.y));
      ctx.save(); ctx.translate(c0.x, c0.y); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.7);
      g.addColorStop(0, 'rgba(255,214,150,0.32)'); g.addColorStop(0.5, 'rgba(160,200,150,0.08)'); g.addColorStop(1, 'rgba(0,6,2,0.65)');
      ctx.fillStyle = g; ctx.fillRect(-rx * 4, -rx * 4, rx * 8, rx * 8);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------- 地獄 (じゃあくのまじょの バトル) ----------
  //   赤黒い 空・ぎざぎざの 黒い 岩山・ひびから 溶岩が 光る 床・まいあがる 火の粉
  const HELL_H = [];
  const cracks = [], pools = [];
  (function () {
    const rng = new NS.RNG('hell');
    for (let i = 0; i <= SEG; i++) HELL_H.push(i === SEG ? HELL_H[0] : 3.2 + rng.next() * 1.4 + (i % 3 === 0 ? rng.next() * 2.6 : 0));
    for (let k = 0; k < 26; k++) { // 溶岩の ひび (ゆらゆら のびる 線と 枝)
      const a = rng.next() * Math.PI * 2, r = 1.5 + Math.sqrt(rng.next()) * (RW - 2.5);
      let x = Math.cos(a) * r, z = Math.sin(a) * r, d = rng.next() * Math.PI * 2;
      const pts = [[x, 0.004, z]];
      const n = 4 + Math.floor(rng.next() * 5);
      for (let i = 0; i < n; i++) {
        d += rng.range(-0.8, 0.8); x += Math.cos(d) * rng.range(0.4, 0.9); z += Math.sin(d) * rng.range(0.4, 0.9);
        if (Math.hypot(x, z) > RW - 0.3) break;
        pts.push([x, 0.004, z]);
      }
      cracks.push({ pts, w: rng.range(1, 2.4), ph: rng.next() * 6 });
    }
    for (let k = 0; k < 7; k++) { const a = rng.next() * Math.PI * 2, r = rng.range(8.5, 11.5); pools.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rx: rng.range(0.8, 1.8), rz: rng.range(0.6, 1.3), ph: rng.next() * 6 }); }
  })();
  function drawHellWall(ctx, cam) {
    const g0 = ctx.createLinearGradient(0, 0, 0, cam.h);
    g0.addColorStop(0, '#0a0103'); g0.addColorStop(0.45, '#3a0507'); g0.addColorStop(0.75, '#8a1a08'); g0.addColorStop(1, '#c8420e');
    ctx.fillStyle = g0; ctx.fillRect(0, 0, cam.w, cam.h);
    for (let i = 0; i < SEG; i++) {
      if (!visibleSeg(cam, i, RW, 1.5)) continue;
      const sh = wallShade(i);
      const pts = [[COS[i] * RW, 0, SIN[i] * RW], [COS[i + 1] * RW, 0, SIN[i + 1] * RW], [COS[i + 1] * RW, HELL_H[i + 1], SIN[i + 1] * RW], [COS[i] * RW, HELL_H[i], SIN[i] * RW]];
      ctx.beginPath();
      if (!NS.pathPoly(ctx, cam, pts)) continue;
      const top = cam.project(COS[i] * RW, HELL_H[i], SIN[i] * RW), bot = cam.project(COS[i] * RW, 0, SIN[i] * RW);
      if (top && bot) {
        const gr = ctx.createLinearGradient(0, top.y, 0, bot.y);
        gr.addColorStop(0, '#080204'); gr.addColorStop(0.6, C.str(C.dark('#3a1210', 1 - sh * 0.8))); gr.addColorStop(1, C.str(C.dark('#9a2a0a', 1 - sh * 0.7)));
        ctx.fillStyle = gr;
      } else ctx.fillStyle = '#1a0606';
      ctx.fill();
    }
  }
  function drawHellFloor(ctx, cam, t) {
    const disc = [];
    for (let i = 0; i < SEG; i++) disc.push([COS[i] * RW, 0, SIN[i] * RW]);
    ctx.save();
    ctx.beginPath();
    if (!NS.pathPoly(ctx, cam, disc)) { ctx.restore(); return; }
    ctx.fillStyle = '#2a1210'; ctx.fill(); ctx.clip();
    // 溶岩の 池 (ふちの ほう)
    for (const pl of pools) {
      ctx.beginPath();
      if (!NS.floorEllipse(ctx, cam, pl.x, pl.z, pl.rx, pl.rz, 20)) continue;
      const q = cam.project(pl.x, 0, pl.z);
      if (!q) continue;
      const k = 0.8 + Math.sin(t * 2 + pl.ph) * 0.2, r = pl.rx * q.s * 1.2;
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      g.addColorStop(0, `rgba(255,220,110,${k})`); g.addColorStop(0.5, `rgba(255,110,20,${k})`); g.addColorStop(1, 'rgba(160,30,0,0.9)');
      ctx.fillStyle = g; ctx.fill();
    }
    // 溶岩の ひび (光が ゆっくり 明るく・暗く)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const c of cracks) {
      const k = 0.55 + Math.sin(t * 1.6 + c.ph) * 0.3;
      ctx.beginPath(); NS.pathLine(ctx, cam, c.pts);
      ctx.strokeStyle = `rgba(255,70,0,${0.35 * k})`; ctx.lineWidth = c.w * 4; ctx.stroke();
      ctx.strokeStyle = `rgba(255,190,70,${0.9 * k})`; ctx.lineWidth = c.w; ctx.stroke();
    }
    ctx.restore();
    // まんなかは 少し 明るく、まわりは 暗く
    const c0 = cam.project(0, 0, 0), cx6 = cam.project(7, 0, 0), cz6 = cam.project(0, 0, -7);
    if (c0 && cx6 && cz6) {
      const rx = Math.abs(cx6.x - c0.x), ry = Math.max(4, Math.abs(cz6.y - c0.y));
      ctx.save(); ctx.translate(c0.x, c0.y); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.7);
      g.addColorStop(0, 'rgba(255,120,60,0.22)'); g.addColorStop(0.55, 'rgba(120,20,10,0.06)'); g.addColorStop(1, 'rgba(10,0,0,0.6)');
      ctx.fillStyle = g; ctx.fillRect(-rx * 4, -rx * 4, rx * 8, rx * 8);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------- 火と 闇の 空間 (アビスの バトル) ----------
  //   まっくらな 空間に 紫の 闇と 炎の うずが まわり、地平から 炎が ゆらめく。足場は 光る 輪の ある 闇の 円盤
  function drawAbyssSpace(ctx, cam, t) {
    const W = cam.w, H = cam.h;
    const g0 = ctx.createLinearGradient(0, 0, 0, H);
    g0.addColorStop(0, '#040008'); g0.addColorStop(0.5, '#16031e'); g0.addColorStop(1, '#2a0510');
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    const hz = cam.project(0, 0, -60), hy = hz ? hz.y : H * 0.45; // 地平
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) { // 闇 (紫) と 炎 (赤) の うず
      const fire = i % 3 === 0, a = t * (i % 2 ? 0.07 : -0.05) + i * 2.1;
      const x = W / 2 + Math.cos(a) * W * (0.25 + (i % 4) * 0.08), y = hy - H * 0.12 + Math.sin(a * 1.3) * H * 0.22;
      const r = W * (0.16 + (i % 3) * 0.06) * (1 + Math.sin(t * 0.7 + i) * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, fire ? 'rgba(255,90,20,0.22)' : 'rgba(140,40,220,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 地平から ゆらめく 炎
    const n = 26;
    for (let k = 0; k < n; k++) {
      const x = ((k + 0.5) / n) * W, ph = t * 3 + k * 1.7;
      const h = H * (0.08 + 0.05 * Math.sin(ph) + 0.04 * Math.sin(ph * 2.3 + k)), w = (W / n) * 0.9;
      const g = ctx.createLinearGradient(0, hy, 0, hy - h);
      g.addColorStop(0, k % 2 ? 'rgba(255,120,30,0.55)' : 'rgba(170,60,255,0.45)'); g.addColorStop(1, 'rgba(120,0,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w, hy);
      ctx.quadraticCurveTo(x - w * 0.6, hy - h * 0.6, x + Math.sin(ph * 1.7) * w * 0.4, hy - h);
      ctx.quadraticCurveTo(x + w * 0.6, hy - h * 0.6, x + w, hy); ctx.closePath(); ctx.fill();
    }
    const hg = ctx.createLinearGradient(0, hy - H * 0.05, 0, hy + H * 0.08); // 地平の 光
    hg.addColorStop(0, 'rgba(255,80,30,0)'); hg.addColorStop(0.5, 'rgba(255,90,40,0.35)'); hg.addColorStop(1, 'rgba(120,20,120,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, hy - H * 0.05, W, H * 0.13);
    ctx.restore();
    // 足場: 闇の 円盤 (ふちは 闇に とける)
    const disc = [];
    for (let i = 0; i < SEG; i++) disc.push([COS[i] * RW, 0, SIN[i] * RW]);
    ctx.save();
    ctx.beginPath();
    if (!NS.pathPoly(ctx, cam, disc)) { ctx.restore(); return; }
    ctx.fillStyle = 'rgba(14,4,20,0.92)'; ctx.fill(); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    for (const [r, col, w] of [[11.5, '170,60,255', 2.5], [7.7, '255,110,40', 2.2], [7.4, '255,110,40', 1.2], [3.2, '170,60,255', 1.8]]) {
      const k = 0.6 + Math.sin(t * 2 + r) * 0.25, pts = [];
      for (let i = 0; i <= SEG; i++) pts.push([COS[i] * r, 0.003, SIN[i] * r]);
      ctx.beginPath(); NS.pathLine(ctx, cam, pts);
      ctx.strokeStyle = `rgba(${col},${0.25 * k})`; ctx.lineWidth = w * 4; ctx.stroke();
      ctx.strokeStyle = `rgba(${col},${0.85 * k})`; ctx.lineWidth = w; ctx.stroke();
    }
    ctx.beginPath(); // まわる 魔法陣 (六芒星)
    for (let tri = 0; tri < 2; tri++) {
      const pts = [];
      for (let k = 0; k <= 3; k++) { const a = (k / 3) * Math.PI * 2 + tri * Math.PI - t * 0.15; pts.push([Math.cos(a) * 7.4, 0.003, Math.sin(a) * 7.4]); }
      NS.pathLine(ctx, cam, pts);
    }
    ctx.strokeStyle = `rgba(255,120,50,${0.45 + Math.sin(t * 2) * 0.15})`; ctx.lineWidth = 2; ctx.stroke();
    const c0 = cam.project(0, 0, 0), cx6 = cam.project(7, 0, 0), cz6 = cam.project(0, 0, -7);
    if (c0 && cx6 && cz6) { // ふちは 暗く
      const rx = Math.abs(cx6.x - c0.x), ry = Math.max(4, Math.abs(cz6.y - c0.y));
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(c0.x, c0.y); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, rx * 0.8, 0, 0, rx * 1.9);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(4,0,8,0.85)');
      ctx.fillStyle = g; ctx.fillRect(-rx * 4, -rx * 4, rx * 8, rx * 8);
    }
    ctx.restore();
  }

  NS.drawArenaBack = function (ctx, cam, t) {
    if (NS.arenaTheme === 'abyss') { drawAbyssSpace(ctx, cam, t); return; }
    if (NS.arenaTheme === 'cave') { drawCaveWall(ctx, cam); drawCaveFloor(ctx, cam); return; }
    if (NS.arenaTheme === 'hell') { drawHellWall(ctx, cam); drawHellFloor(ctx, cam, t); return; }
    drawSky(ctx, cam);
    drawCanopy(ctx, cam);
    drawStands(ctx, cam, t);
    drawRailing(ctx, cam);
    drawWall(ctx, cam);
    drawGates(ctx, cam);
    drawFloor(ctx, cam, t);
  };

  NS.arenaDrawables = function (cam, t, out) {
    if (!NS.arenaTheme) for (const pl of PILLARS) { const d = pillarDrawable(cam, pl); if (d) out.push(d); } // どうくつ・地獄は 柱なし (たいまつは ある)
    if (NS.arenaTheme !== 'abyss') for (const br of BRAZIERS) { const d = brazierDrawable(cam, br, t); if (d) out.push(d); } // 火と 闇の 空間は かがり火も なし
    moteDrawables(cam, t, out);
  };

  NS.updateArena = function (dt) {
    NS.crowdExcite *= Math.exp(-dt * 0.9);
  };
})();
