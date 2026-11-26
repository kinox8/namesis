// メインループ: 更新 → 背景 → 影 → 奥行きソートした物体 → オーバーレイ
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const C = NS.col;
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const cam = new NS.Camera();
  let dpr = 1, W = 0, H = 0;

  NS.scene = { units: [], battle: null, mode: 'title', cam, targets: null, hover: null, active: null, onPick: null };

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cam.setViewport(W, H);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- ユニットの描画 ----------
  function figureOpts(u, t) {
    const p = u.pos;
    const camAng = Math.atan2(cam.pos.x - p.x, cam.pos.z - p.z);
    const hd = Math.hypot(cam.pos.x - p.x, cam.pos.z - p.z);
    const v = u.v;
    return {
      turn: NS.wrapAngle(v.face - camAng),
      pitch: Math.atan2(cam.pos.y - (p.y + 0.7), hd) * 0.8,
      t, squash: v.squash, flash: v.flash, gray: v.gray, alpha: v.alpha, lie: v.lie, lieDir: v.lieDir,
      expr: v.expr, glow: v.glow, glowElem: v.glowElem, armRaise: v.armRaise, step: v.step, antennaKick: v.antennaKick, phase: u.phase,
    };
  }

  function unitDrawable(u, t) {
    if (u.v.hidden) return null;
    const p = u.pos;
    const d = cam.depth(p.x, p.y + 0.5, p.z);
    if (d < cam.near + 0.2) return null;
    const use3d = NS.use3d && NS.fig3d && !u.ch.monster; // 3D の キャラ (テスト)
    return {
      depth: d,
      draw() {
        const q = cam.project(p.x, p.y, p.z);
        if (!q) return;
        if (use3d) { // 足元を 中心に 体が 入る 四角だけ WebGL で 描いて 写す
          const hh = q.s * (NS.figureHeight(u.ch) + 0.35);
          NS.fig3d.draw(ctx, u.ch, p, u.v, u.v.face, t, { x: q.x - hh * 0.95, y: q.y - hh * 1.1, w: hh * 1.9, h: hh * 1.35 }, dpr);
        } else NS.drawFigure(ctx, q.x, q.y, q.s, u.ch, figureOpts(u, t));
        const top = cam.project(p.x, p.y + NS.figureHeight(u.ch), p.z);
        u.screen = { x: q.x, y: q.y, top: top ? top.y : q.y - q.s * 1.3, w: q.s * 0.75 * Math.max(0.9, u.ch.look.w) * u.ch.look.h, s: q.s };
      },
    };
  }

  function drawShadows(units) {
    ctx.beginPath();
    for (const u of units) {
      if (u.v.hidden) continue;
      const p = u.pos;
      const k = 1 / (1 + p.y * 0.6);
      NS.floorEllipse(ctx, cam, p.x + (u.v.lie ? 0.2 * u.v.lieDir * u.v.lie : 0), p.z, 0.34 * k * u.ch.look.w * (1 + u.v.lie * 0.6), 0.24 * k, 16);
    }
    ctx.fillStyle = 'rgba(30,15,10,0.32)';
    ctx.fill();
  }

  function drawRings(t) {
    const sc = NS.scene;
    const ring = (u, color, pulse) => {
      const p = u.pos;
      const r = 0.55 + Math.sin(t * 6) * 0.05 * pulse;
      ctx.beginPath();
      if (NS.floorEllipse(ctx, cam, p.x, p.z, r, r * 0.8, 28)) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = color;
        const q = cam.project(p.x, 0, p.z);
        ctx.lineWidth = Math.max(2, q ? q.s * 0.05 : 2);
        ctx.stroke();
        ctx.restore();
      }
    };
    if (sc.active && sc.active.alive) ring(sc.active, 'rgba(255,210,80,0.85)', 1);
    if (sc.cardHover && sc.cardHover !== sc.active && sc.cardHover.alive) ring(sc.cardHover, 'rgba(120,220,255,0.9)', 1); // アイコンに カーソル
    // 3体攻撃は ねらった相手のまわりの2体も赤く光らせる
    const area = sc.hover && sc.areaOf ? sc.areaOf(sc.hover) : [sc.hover];
    if (sc.targets) for (const u of sc.targets) ring(u, area.includes(u) ? 'rgba(255,90,90,0.95)' : 'rgba(255,255,255,0.35)', area.includes(u) ? 1 : 0);
  }

  function drawShrine(t) {
    ctx.fillStyle = 'rgba(14, 30, 72, 0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.75 + Math.sin(t * 2.2) * 0.25;
    const ring = (r, a, lw) => {
      ctx.beginPath();
      if (!NS.floorEllipse(ctx, cam, 0, 0, r, r, 64)) return;
      ctx.strokeStyle = `rgba(150, 235, 255, ${a * pulse})`;
      ctx.lineWidth = lw;
      ctx.stroke();
    };
    ring(2.25, 0.55, 3); ring(1.95, 0.4, 1.5); ring(0.7, 0.3, 1.5);
    // まわる 六芒星
    for (const off of [0, Math.PI / 3]) {
      const pts = [0, 1, 2].map((i) => { const a = t * 0.25 + off + (i / 3) * Math.PI * 2; return [Math.cos(a) * 1.95, 0, Math.sin(a) * 1.95]; });
      ctx.beginPath();
      if (NS.pathPoly(ctx, cam, pts)) {
        ctx.closePath();
        ctx.strokeStyle = `rgba(150, 235, 255, ${0.35 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    const q = cam.project(0, 0, 0);
    if (q) {
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.s * 2.2);
      g.addColorStop(0, `rgba(120, 220, 255, ${0.28 * pulse})`);
      g.addColorStop(1, 'rgba(120, 220, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(q.x - q.s * 2.2, q.y - q.s * 2.2, q.s * 4.4, q.s * 4.4);
    }
    ctx.restore();
  }

  function drawOverlays(t) {
    const sc = NS.scene;
    if (sc.mode !== 'battle') return;
    ctx.textAlign = 'center';
    for (const u of sc.units) {
      if (!u.screen || u.v.hidden) continue;
      const s = u.screen;
      // 敵の名前 (HP は 見せない)
      if (u.side === 'enemy' && u.alive) {
        const y = s.top - 6;
        // 名前は ねらうとき・行動中だけ (8人並ぶと重なるため)
        if (u === sc.hover || u === sc.active || (sc.targets && sc.targets.includes(u))) {
          ctx.font = `700 ${NS.clamp(s.s * 0.13, 11, 15)}px "M PLUS Rounded 1c", sans-serif`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(20,10,20,0.85)';
          ctx.strokeText(u.name, s.x, y - 4);
          ctx.fillStyle = u === sc.hover ? '#ffd24a' : u.alias ? '#c9b4ff' : u.ch.boss ? '#ffb27a' : '#fff'; // 仮の名前・名のある敵は 色を変える
          ctx.fillText(u.name, s.x, y - 4);
        }
      }
      // モンスターは HP の ゲージを 見せる
      if (u.ch.monster && u.alive) {
        const many = sc.units.filter((x) => x.ch.monster && x.alive).length > 1; // 何体も いるときは 小さく (かさならないように)
        const bw = many ? NS.clamp(s.s * 0.95, 64, 140) : NS.clamp(s.s * 1.6, 120, 260), bx = s.x - bw / 2, by = s.top - 18;
        ctx.fillStyle = 'rgba(20,10,20,0.75)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
        ctx.fillStyle = '#ff5a4a'; ctx.fillRect(bx, by, bw * (u.hp / u.maxHp), 8);
        ctx.font = `700 ${many ? 11 : 13}px "M PLUS Rounded 1c", sans-serif`;
        const PH = u.phase > 1 && NS.MONSTERS[u.ch.monster]['phase' + u.phase];
        const label = u.name + (PH ? ' ・ ' + (PH.tag || '第二形態') : '');
        if (!many) { // 何体も いるときは 名前は ねらうとき・行動中 だけ (上の ふつうの 敵と 同じ)
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,10,20,0.85)'; ctx.strokeText(label, s.x, by - 6);
          ctx.fillStyle = u.phase === 3 ? '#d08aff' : u.phase === 2 ? '#ff6a7a' : '#ffb27a'; ctx.fillText(label, s.x, by - 6);
        }
        // 魔力の たまり (じゃあくのまじょ): ゲージの 下に ◆ を ならべる
        const need = sc.battle && sc.battle.manaNeed ? sc.battle.manaNeed(u) : 0;
        if (need && !many) {
          const have = u.mana || 0, sz = 6, gap = 16, x0 = s.x - ((need - 1) * gap) / 2, y0 = by + 20;
          for (let i = 0; i < need; i++) {
            const x = x0 + i * gap, on = i < have;
            ctx.beginPath(); ctx.moveTo(x, y0 - sz); ctx.lineTo(x + sz, y0); ctx.lineTo(x, y0 + sz); ctx.lineTo(x - sz, y0); ctx.closePath();
            ctx.fillStyle = on ? `rgba(220,120,255,${0.75 + Math.sin(t * 8 + i) * 0.25})` : 'rgba(40,20,50,0.75)'; ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = on ? '#fff0ff' : 'rgba(200,160,220,0.6)'; ctx.stroke();
          }
        }
      }
      // 状態異常アイコン
      const sts = Object.keys(u.status);
      if (u.alive && sts.length) {
        const k = sts[Math.floor(t * 1.2) % sts.length];
        const size = NS.clamp(s.s * 0.2, 14, 26);
        ctx.font = `${size}px sans-serif`;
        ctx.fillText(NS.STATUS[k].icon, s.x + s.w * 0.45, s.top + (u.side === 'enemy' ? -10 : 4) + Math.sin(t * 4) * 2);
      }
    }
    // ねらいの矢印
    const tg = sc.hover || (sc.targets && sc.targets.length === 1 ? sc.targets[0] : null);
    if (tg && tg.screen) {
      const s = tg.screen;
      const y = s.top - (tg.side === 'enemy' ? 30 : 12) - Math.abs(Math.sin(t * 6)) * 8;
      ctx.fillStyle = '#ff5a5a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x - 11, y - 14); ctx.lineTo(s.x + 11, y - 14); ctx.lineTo(s.x, y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }

  // ---------- 更新 ----------
  function updateUnits(dt, t) {
    const sc = NS.scene;
    for (const u of sc.units) {
      const v = u.v;
      if (u.celebrate && u.alive) {
        v.oy = Math.abs(Math.sin(t * 5.5 + u.idx * 0.9)) * 0.4;
        v.armRaise = 0.6 + Math.sin(t * 11 + u.idx) * 0.4;
      }
      // メニュー画面では ときどき跳ねたり よそ見をする
      if (sc.mode !== 'battle' && v.idle) {
        const ph = t * 0.6 + u.ch.look.phase;
        const hop = (ph % 7) < 0.45 ? Math.sin(((ph % 7) / 0.45) * Math.PI) : 0;
        v.oy = hop * 0.28;
        v.face = Math.sin(t * 0.35 + u.ch.look.phase) * 0.7;
      }
    }
  }

  // 目標の向きは 今の向きに いちばん近い角度にする (画面を行き来しても カメラが ぐるぐる回らない)
  const nearYaw = (yaw) => NS.rig.yaw + NS.wrapAngle(yaw - NS.rig.yaw);
  function updateCamera(dt, t) {
    const sc = NS.scene;
    if (sc.mode === 'title') {
      NS.setRig({ yaw: nearYaw(Math.sin(t * 0.09) * 0.75), pitch: 0.12, dist: 6.4, tx: 0, ty: 1.0, tz: 0 }, 1.2);
    } else if (sc.mode === 'party') {
      NS.setRig({ yaw: nearYaw(Math.sin(t * 0.12) * 0.5 - 0.15), pitch: 0.2, dist: 8.5, tx: -2.4, ty: 0.9, tz: 0 }, 1.2);
    } else if (sc.mode === 'shrine') {
      NS.setRig({ yaw: nearYaw(Math.sin(t * 0.1) * 0.22), pitch: 0.2, dist: 6.6, tx: 0, ty: 0.85, tz: 0 }, 1.2);
    } else if (sc.mode === 'cups') {
      // ゆっくり 一定の速さで まわる (経過時間そのものを角度にしない)
      NS.setRig({ yaw: nearYaw(NS.rigGoal.yaw) + dt * 0.05, pitch: 0.42, dist: 12, tx: 0, ty: 0.6, tz: 0 }, 1.2);
    }
    NS.updateRig(cam, dt, t);
  }

  function drawPreview(t) {
    const pv = NS.ui.preview && NS.ui.preview();
    if (!pv || !pv.canvas || !pv.canvas.isConnected) return;
    const cv = pv.canvas, c2 = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    c2.clearRect(0, 0, w, h);
    const s = h * 0.5;
    const fx = w / 2, fy = h * 0.88;
    c2.fillStyle = 'rgba(30,10,10,0.35)';
    c2.beginPath(); c2.ellipse(fx, fy, s * 0.36, s * 0.09, 0, 0, Math.PI * 2); c2.fill();
    const turn = pv.turn != null ? pv.turn : Math.sin(t * 0.7) * 1.3; // ドラッグで回したら その向き
    const hop = ((t * 0.8) % 4) < 0.4 ? Math.sin((((t * 0.8) % 4) / 0.4) * Math.PI) * s * 0.12 : 0;
    NS.drawFigure(c2, fx, fy - hop, s, pv.ch, { turn, pitch: 0.18, t, glow: 0 });
  }

  // ---------- 入力 (3D 空間のキャラをクリック) ----------
  function pickUnit(x, y) {
    const sc = NS.scene;
    if (!sc.targets) return null;
    let bestU = null, bestD = Infinity;
    for (const u of sc.targets) {
      const s = u.screen;
      if (!s) continue;
      const lie = u.v.lie > 0.5;
      const top = lie ? s.y - s.s * 0.5 : s.top;
      const hw = lie ? s.s * 0.7 : s.w * 0.6;
      if (x > s.x - hw && x < s.x + hw && y > top - 10 && y < s.y + 8) {
        const d = cam.depth(u.pos.x, 0.5, u.pos.z);
        if (d < bestD) { bestD = d; bestU = u; }
      }
    }
    return bestU;
  }
  canvas.addEventListener('pointermove', (e) => {
    if (!NS.scene.targets) return;
    const u = pickUnit(e.clientX, e.clientY);
    NS.scene.hover = u;
    canvas.style.cursor = u ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerdown', (e) => {
    const sc = NS.scene;
    if (!sc.targets || !sc.onPick) return;
    const u = pickUnit(e.clientX, e.clientY);
    if (u) { canvas.style.cursor = 'default'; sc.onPick(u); }
  });

  // ---------- ループ ----------
  let last = performance.now();
  let t = 0;
  // スローモーション・ヒットストップ (実時間で管理し、ゲーム内の時間の進みを遅くする)
  let realT = 0;
  const timeMods = [];
  NS.slowMo = function (scale, ms) { timeMods.push({ until: realT + ms / 1000 / NS.speed, scale }); };
  NS.hitStop = function (ms) { NS.slowMo(0.03, ms); };
  function step(dt) {
    realT += dt;
    let scale = 1;
    for (let i = timeMods.length - 1; i >= 0; i--) {
      if (timeMods[i].until <= realT) timeMods.splice(i, 1);
      else scale = Math.min(scale, timeMods[i].scale);
    }
    const sdt = dt * scale;
    t += sdt;
    NS.time = t;
    NS.updateAnims(sdt);
    NS.updateFx(sdt);
    NS.updateArena(sdt);
    updateUnits(sdt, t);
    updateCamera(dt * (0.4 + 0.6 * scale), t);
    // 精霊の祠では 光の粒が ただよう
    if (NS.scene.mode === 'shrine' && Math.random() < dt * 7) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 3;
      NS.spawn({ type: 'glow', x: Math.cos(a) * r, y: Math.random() * 0.4, z: Math.sin(a) * r, color: Math.random() < 0.5 ? '#aef3ff' : '#d8c8ff',
        size: 0.05 + Math.random() * 0.07, life: 2.5 + Math.random() * 2, vy: 0.25 + Math.random() * 0.35, fadeIn: 0.4 });
    }
    if (NS.ui.tick) NS.ui.tick(dt);
  }

  // 検証用: 画面が裏にあって描画が止まっていても、時間を手動で進められる
  NS.debugAdvance = async function (sec) {
    for (let i = 0; i < sec * 60; i++) {
      step(1 / 60);
      for (let k = 0; k < 8; k++) await null; // 待機中の async 処理を進める
    }
    render();
  };

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    NS.drawArenaBack(ctx, cam, t);
    if (NS.scene.mode === 'shrine') drawShrine(t);
    const units = NS.scene.units;
    drawShadows(units);
    drawRings(t);

    if (NS.use3d && NS.fig3d) NS.fig3d.begin(cam, W, H, dpr);
    const list = [];
    NS.arenaDrawables(cam, t, list);
    for (const u of units) { const d = unitDrawable(u, t); if (d) list.push(d); }
    NS.fxDrawables(cam, list);
    list.sort((a, b) => b.depth - a.depth);
    for (const d of list) d.draw(ctx);

    drawOverlays(t);
    NS.drawGrand(ctx, cam, W, H); // 大技の 演出 (ダメージの 数字は この上)
    NS.drawPopups(ctx, cam);

    // 周辺減光
    const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,0,10,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    NS.drawDarkness(ctx, cam, W, H); // じごくのじょおうの 暗闇
    if (NS.screenFlash.a > 0.01) {
      ctx.fillStyle = `rgba(${NS.screenFlash.color},${NS.screenFlash.a})`;
      ctx.fillRect(0, 0, W, H);
    }

    drawPreview(t);
  }

  NS.ui.init();
  requestAnimationFrame(frame);
})();
