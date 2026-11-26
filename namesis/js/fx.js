// エフェクト: ワールド空間のパーティクル・弾・ダメージ数字。すべて透視投影されるので遠くほど小さい。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const C = NS.col;
  const parts = [];
  const popups = [];
  const emitters = [];
  NS.screenFlash = { a: 0, color: '255,255,255' };

  const R = (a, b) => a + Math.random() * (b - a);

  function spawn(p) {
    p.age = 0;
    p.life = p.life || 0.6;
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.vz = p.vz || 0;
    p.g = p.g || 0;
    p.size = p.size || 0.1;
    p.rot = p.rot || 0; p.vr = p.vr || 0;
    parts.push(p);
    return p;
  }
  NS.spawn = spawn;

  NS.updateFx = function (dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      if (p.orbit) {
        const o = p.orbit;
        o.ang += o.w * dt;
        p.x = o.cx + Math.cos(o.ang) * o.r;
        p.z = o.cz + Math.sin(o.ang) * o.r * 0.7;
        p.y = o.cy + Math.sin(o.ang * 2) * 0.03;
        continue;
      }
      p.vy -= p.g * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      if (p.bounce && p.y < 0) { p.y = 0; p.vy = -p.vy * p.bounce; p.vx *= 0.7; p.vz *= 0.7; }
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.age += dt;
      if (p.age >= p.life) popups.splice(i, 1);
    }
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      if (e.done) { emitters.splice(i, 1); continue; }
      e.acc = (e.acc || 0) + dt * e.rate;
      while (e.acc >= 1) { e.acc -= 1; e.emit(); }
    }
    NS.screenFlash.a *= Math.exp(-dt * 6);
  };

  // ---- 描画 ----
  function drawPart(ctx, cam, p) {
    const q = cam.project(p.x, p.y, p.z);
    if (!q) return;
    const k = 1 - p.age / p.life;
    const size = p.size * q.s * (p.grow ? 1 + (p.age / p.life) * p.grow : 1);
    if (size < 0.3) return;
    const alpha = (p.alpha == null ? 1 : p.alpha) * (p.fadeIn ? Math.min(1, p.age / p.fadeIn) : 1) * (p.keep ? 1 : k);
    switch (p.type) {
      case 'glow': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, size);
        g.addColorStop(0, C.str(p.color, alpha));
        g.addColorStop(0.4, C.str(p.color, alpha * 0.45));
        g.addColorStop(1, C.str(p.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(q.x - size, q.y - size, size * 2, size * 2);
        ctx.restore();
        break;
      }
      case 'spark': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const tail = cam.project(p.x - p.vx * 0.04, p.y - p.vy * 0.04, p.z - p.vz * 0.04);
        ctx.strokeStyle = C.str(p.color, alpha);
        ctx.lineWidth = Math.max(1, size * 0.5);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(tail ? tail.x : q.x, tail ? tail.y : q.y + 1);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'shard': case 'rock': case 'leaf': {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = C.str(p.color);
        ctx.beginPath();
        if (p.type === 'shard') { ctx.moveTo(0, -size); ctx.lineTo(size * 0.4, 0); ctx.lineTo(0, size); ctx.lineTo(-size * 0.4, 0); }
        else if (p.type === 'rock') { ctx.moveTo(-size, -size * 0.5); ctx.lineTo(0, -size); ctx.lineTo(size, -size * 0.3); ctx.lineTo(size * 0.7, size * 0.8); ctx.lineTo(-size * 0.6, size * 0.7); }
        else { ctx.ellipse(0, 0, size, size * 0.35, 0, 0, Math.PI * 2); }
        ctx.closePath();
        ctx.fill();
        if (p.type !== 'leaf') { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.restore();
        break;
      }
      case 'drop': {
        ctx.fillStyle = C.str(p.color, alpha);
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, size * 0.6, size, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'smoke': {
        ctx.fillStyle = C.str(p.color, alpha * 0.45);
        ctx.beginPath();
        ctx.arc(q.x, q.y, size, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ring': { // 床に寝た輪
        const r = p.size * (0.3 + (p.age / p.life) * (p.grow || 3));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        if (NS.floorEllipse(ctx, cam, p.x, p.z, r, r, 28)) {
          ctx.strokeStyle = C.str(p.color, alpha);
          ctx.lineWidth = Math.max(1.5, 0.08 * q.s);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'circle': { // 床に描かれる 回転する魔法陣
        const grow = Math.min(1, p.age / 0.25);
        const r = p.size * (0.6 + 0.4 * grow);
        const fade = p.age > p.life - 0.3 ? (p.life - p.age) / 0.3 : 1;
        const rot = p.age * 1.6 + (p.rot || 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = C.str(p.color, 0.85 * fade);
        ctx.lineWidth = Math.max(1.5, 0.05 * q.s);
        ctx.beginPath();
        for (const rr of [r, r * 0.82]) {
          const pts = [];
          for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push([p.x + Math.cos(a) * rr, 0.01, p.z + Math.sin(a) * rr]); }
          NS.pathLine(ctx, cam, pts);
        }
        for (let tri = 0; tri < 2; tri++) {
          const pts = [];
          for (let k = 0; k <= 3; k++) { const a = rot * (tri ? -1 : 1) + (k / 3) * Math.PI * 2 + tri * Math.PI; pts.push([p.x + Math.cos(a) * r * 0.8, 0.01, p.z + Math.sin(a) * r * 0.8]); }
          NS.pathLine(ctx, cam, pts);
        }
        // 外周の小さな ルーン
        for (let k = 0; k < 8; k++) {
          const a = -rot * 0.7 + (k / 8) * Math.PI * 2;
          const c0 = cam.project(p.x + Math.cos(a) * r * 0.91, 0.01, p.z + Math.sin(a) * r * 0.91);
          if (c0) { ctx.moveTo(c0.x + 2, c0.y); ctx.arc(c0.x, c0.y, Math.max(1.5, 0.035 * c0.s), 0, Math.PI * 2); }
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'confetti': {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.sin(p.age * 9 + p.ph)) * 0.9 + 0.1);
        ctx.globalAlpha = Math.min(1, (p.life - p.age) * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(-size, -size * 0.6, size * 2, size * 1.2);
        ctx.restore();
        break;
      }
      case 'text': {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(q.x, q.y);
        ctx.rotate(p.rot);
        ctx.font = `800 ${Math.max(8, size)}px "M PLUS Rounded 1c", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, size * 0.18);
        ctx.strokeStyle = 'rgba(20,10,30,0.85)';
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = C.str(p.color);
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
        break;
      }
      case 'bolt': {
        const a = cam.project(p.x, p.y, p.z), b = cam.project(p.x2, p.y2, p.z2);
        if (!a || !b) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [w, al] of [[6, 0.35], [2.5, 1]]) {
          ctx.strokeStyle = C.str(p.color, alpha * al);
          ctx.lineWidth = w * Math.max(0.6, q.s / 80);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          const n = 7;
          for (let i = 1; i < n; i++) {
            const tt = i / n;
            ctx.lineTo(a.x + (b.x - a.x) * tt + (p.jit[i] || 0) * q.s * 0.25, a.y + (b.y - a.y) * tt);
          }
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'beam': {
        const a = cam.project(p.x, p.y, p.z), b = cam.project(p.x2, p.y2, p.z2);
        if (!a || !b) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const [w, al] of [[0.5, 0.25], [0.22, 0.6], [0.08, 1]]) {
          ctx.strokeStyle = C.str(p.color, alpha * al);
          ctx.lineWidth = Math.max(1, w * (a.s + b.s) * 0.5);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.restore();
        break;
      }
    }
  }

  NS.fxDrawables = function (cam, out) {
    for (const p of parts) {
      if (p.type === 'ring' || p.type === 'circle') { out.push({ depth: 9999 - 0.001 * p.age, floor: true, draw: (ctx) => drawPart(ctx, cam, p) }); continue; }
      const d = cam.depth(p.x, p.y, p.z);
      if (d < cam.near) continue;
      out.push({ depth: d - (p.front || 0), draw: (ctx) => drawPart(ctx, cam, p) });
    }
  };

  // ---- ダメージ数字 ----
  NS.popup = function (x, y, z, text, color = '#ffffff', big = false) {
    popups.push({ x, y, z, text: String(text), color, big, age: 0, life: 1.7 / Math.max(1, NS.speed * 0.7), ox: R(-0.15, 0.15) });
  };
  NS.drawPopups = function (ctx, cam) {
    for (const p of popups) {
      const q = cam.project(p.x + p.ox, p.y, p.z);
      if (!q) continue;
      const k = p.age / p.life;
      const pop = k < 0.15 ? NS.EASE.back(k / 0.15) : 1;
      const rise = (1 - Math.pow(1 - Math.min(1, k * 2.2), 3)) * 34;
      const base = NS.clamp(q.s * (p.big ? 0.42 : 0.32), 20, p.big ? 64 : 48);
      const size = base * (0.4 + 0.6 * pop);
      const alpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${size}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = '#2a1430';
      ctx.strokeText(p.text, q.x, q.y - rise);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, q.x, q.y - rise);
      ctx.restore();
    }
  };

  NS.flash = function (a = 0.6, color = '255,255,255') {
    NS.screenFlash.a = Math.max(NS.screenFlash.a, a);
    NS.screenFlash.color = color;
  };

  // ---- 属性ごとの演出 ----
  const ELEM_FX = {
    fire: { core: '#ffb347', trail: (x, y, z) => { spawn({ type: 'glow', x, y, z, color: R(0, 1) < 0.5 ? '#ff7a2a' : '#ffd060', size: R(0.18, 0.32), life: 0.35, vy: 0.8 }); } },
    water: { core: '#7ab8ff', trail: (x, y, z) => { spawn({ type: 'drop', x, y, z, color: '#6fb0ff', size: R(0.04, 0.07), life: 0.5, vx: R(-0.4, 0.4), vy: R(0, 0.6), vz: R(-0.4, 0.4), g: 6 }); } },
    ice: { core: '#c8f4ff', trail: (x, y, z) => { spawn({ type: 'shard', x, y, z, color: '#bff0ff', size: R(0.05, 0.1), life: 0.5, vr: R(-6, 6), vx: R(-0.3, 0.3), vy: R(-0.3, 0.3) }); } },
    wind: { core: '#a8ffb8', trail: (x, y, z) => { spawn({ type: 'leaf', x, y, z, color: '#7be08e', size: R(0.05, 0.09), life: 0.6, vr: R(-10, 10), vx: R(-1, 1), vy: R(-0.5, 1), vz: R(-1, 1) }); } },
    earth: { core: '#d9a066', trail: (x, y, z) => { spawn({ type: 'smoke', x, y, z, color: '#a07a50', size: R(0.08, 0.16), life: 0.5, grow: 1 }); } },
    thunder: { core: '#fff27a', trail: (x, y, z) => { spawn({ type: 'spark', x, y, z, color: '#fff27a', size: 0.08, life: 0.25, vx: R(-3, 3), vy: R(-3, 3), vz: R(-3, 3) }); } },
    light: { core: '#fffbe0', trail: (x, y, z) => { spawn({ type: 'glow', x, y, z, color: '#fff6c8', size: R(0.1, 0.2), life: 0.5 }); } },
    dark: { core: '#b07aff', trail: (x, y, z) => { spawn({ type: 'smoke', x, y, z, color: '#5a2a8a', size: R(0.1, 0.2), life: 0.6, grow: 1.2, vy: 0.3 }); } },
    pinkfire: { core: '#ff7ac0', trail: (x, y, z) => { spawn({ type: 'glow', x, y, z, color: R(0, 1) < 0.5 ? '#ff4fa8' : '#ffc4e4', size: R(0.18, 0.32), life: 0.35, vy: 0.8 }); } },
    charm: { core: '#ff8ad0', trail: (x, y, z) => { spawn({ type: 'text', text: '♥', x, y, z, color: R(0, 1) < 0.5 ? '#ff5fa8' : '#ffb0dc', size: R(0.12, 0.2), life: 0.55, vy: 0.6, vr: R(-2, 2) }); } },
  };
  NS.ELEM_FX = ELEM_FX;

  // 弾を from → to へ飛ばす (放物線)。Promise は着弾時に解決
  NS.projectile = async function (from, to, elem, ms = 420, arc = 0.6) {
    const fx = ELEM_FX[elem] || ELEM_FX.light;
    const ball = spawn({ type: 'glow', x: from.x, y: from.y, z: from.z, color: fx.core, size: 0.36, life: 99, keep: true });
    const em = { rate: 70, emit: () => fx.trail(ball.x + R(-0.05, 0.05), ball.y + R(-0.05, 0.05), ball.z + R(-0.05, 0.05)) };
    emitters.push(em);
    await NS.anim(ms, (e, p) => {
      ball.x = NS.lerp(from.x, to.x, p);
      ball.z = NS.lerp(from.z, to.z, p);
      ball.y = NS.lerp(from.y, to.y, p) + Math.sin(p * Math.PI) * arc;
    }, 'linear');
    em.done = true;
    ball.life = 0;
  };

  NS.impact = function (elem, pos, big = false) {
    const n = big ? 26 : 16;
    const x = pos.x, y = pos.y, z = pos.z;
    switch (elem) {
      case 'pinkfire': // みんなたたり: ピンクの ほのおが メラメラ 立ちのぼる
        for (let i = 0; i < n; i++) spawn({ type: 'glow', x: x + R(-0.25, 0.25), y: y - 0.3, z: z + R(-0.25, 0.25), color: i % 2 ? '#ff4fa8' : '#ffc4e4', size: R(0.2, 0.4), life: R(0.4, 0.7), vx: R(-0.4, 0.4), vy: R(1.5, 3), vz: R(-0.4, 0.4), drag: 1.5 });
        spawn({ type: 'glow', x, y, z, color: '#ffd8ee', size: big ? 1.2 : 0.8, life: 0.3 });
        break;
      case 'fire':
        for (let i = 0; i < n; i++) spawn({ type: 'glow', x, y, z, color: i % 2 ? '#ff6a2a' : '#ffd060', size: R(0.25, 0.5), life: R(0.3, 0.6), vx: R(-2, 2), vy: R(0, 3), vz: R(-2, 2), drag: 3 });
        spawn({ type: 'glow', x, y, z, color: '#fff0a0', size: big ? 1.4 : 0.9, life: 0.3 });
        break;
      case 'water':
        for (let i = 0; i < n * 1.5; i++) spawn({ type: 'drop', x, y, z, color: i % 3 ? '#5fa4ff' : '#cfe6ff', size: R(0.04, 0.09), life: R(0.5, 0.8), vx: R(-2.5, 2.5), vy: R(1, 4), vz: R(-2.5, 2.5), g: 9 });
        spawn({ type: 'ring', x, y: 0, z, color: '#8fc4ff', size: 0.5, life: 0.5, grow: 2.5 });
        break;
      case 'ice':
        for (let i = 0; i < n; i++) spawn({ type: 'shard', x, y, z, color: i % 2 ? '#bff0ff' : '#ffffff', size: R(0.08, 0.16), life: R(0.4, 0.7), vr: R(-8, 8), vx: R(-2.5, 2.5), vy: R(-1, 3), vz: R(-2.5, 2.5), g: 5 });
        spawn({ type: 'glow', x, y, z, color: '#dff8ff', size: big ? 1.2 : 0.8, life: 0.35 });
        break;
      case 'wind':
        for (let i = 0; i < n * 1.4; i++) {
          const a = R(0, Math.PI * 2);
          spawn({ type: 'leaf', x: x + Math.cos(a) * 0.4, y: y + R(-0.4, 0.5), z: z + Math.sin(a) * 0.4, color: i % 2 ? '#6fdc84' : '#c8ffd0', size: R(0.06, 0.1), life: R(0.4, 0.7), vr: R(-14, 14), vx: -Math.sin(a) * 4, vy: R(0.5, 2.5), vz: Math.cos(a) * 4, drag: 2 });
        }
        break;
      case 'earth':
        for (let i = 0; i < n; i++) spawn({ type: 'rock', x: x + R(-0.3, 0.3), y: y + R(0, 0.3), z: z + R(-0.3, 0.3), color: i % 2 ? '#9a6a3a' : '#c49060', size: R(0.07, 0.14), life: R(0.6, 0.9), vr: R(-6, 6), vx: R(-2, 2), vy: R(1, 3.5), vz: R(-2, 2), g: 10, bounce: 0.35 });
        for (let i = 0; i < 6; i++) spawn({ type: 'smoke', x, y: 0.2, z, color: '#b08860', size: R(0.25, 0.4), life: 0.7, grow: 1.5, vx: R(-1, 1), vz: R(-1, 1) });
        break;
      case 'thunder':
        for (let i = 0; i < n; i++) spawn({ type: 'spark', x, y, z, color: '#fff27a', size: 0.09, life: R(0.2, 0.4), vx: R(-5, 5), vy: R(-2, 5), vz: R(-5, 5), drag: 4 });
        spawn({ type: 'glow', x, y, z, color: '#fffbd0', size: big ? 1.5 : 1, life: 0.25 });
        break;
      case 'light':
        for (let i = 0; i < n; i++) spawn({ type: 'glow', x: x + R(-0.4, 0.4), y: y + R(-0.3, 0.6), z: z + R(-0.4, 0.4), color: '#fff8d0', size: R(0.1, 0.22), life: R(0.4, 0.8), vy: R(0.5, 1.5) });
        spawn({ type: 'ring', x, y: 0, z, color: '#fff2b0', size: 0.5, life: 0.5, grow: 2.5 });
        break;
      case 'dark':
        for (let i = 0; i < n; i++) spawn({ type: 'smoke', x: x + R(-0.3, 0.3), y: y + R(-0.3, 0.3), z: z + R(-0.3, 0.3), color: i % 2 ? '#3a1060' : '#7a3ab0', size: R(0.2, 0.35), life: R(0.5, 0.8), grow: 1.4, vx: R(-1, 1), vy: R(0, 1.2), vz: R(-1, 1) });
        spawn({ type: 'glow', x, y, z, color: '#c090ff', size: 0.8, life: 0.3 });
        break;
      case 'charm':
        for (let i = 0; i < 10; i++) spawn({ type: 'text', text: '♥', x: x + R(-0.3, 0.3), y: y + R(-0.2, 0.3), z: z + R(-0.3, 0.3), color: i % 2 ? '#ff5fa8' : '#ffc0e0', size: R(0.18, 0.3), life: R(0.7, 1.1), vy: R(0.6, 1.4), vx: R(-0.4, 0.4), vr: R(-1.5, 1.5) });
        spawn({ type: 'glow', x, y, z, color: '#ff8ad0', size: 0.8, life: 0.35 });
        break;
      default: // 打撃
        for (let i = 0; i < (big ? 14 : 8); i++) spawn({ type: 'spark', x, y, z, color: big ? '#ffd24a' : '#ffffff', size: 0.07, life: R(0.15, 0.3), vx: R(-4, 4), vy: R(-1, 4), vz: R(-4, 4), drag: 3, front: 0.4 });
        spawn({ type: 'glow', x, y, z, color: big ? '#ffd24a' : '#ffffff', size: big ? 0.8 : 0.5, life: 0.18, front: 0.4 });
    }
  };

  // 雷は空から、土は頭上から岩が降る
  NS.skyStrike = function (elem, pos) {
    if (elem === 'thunder') {
      const jit = []; for (let i = 0; i < 8; i++) jit.push(R(-1, 1));
      spawn({ type: 'bolt', x: pos.x + R(-0.5, 0.5), y: 9, z: pos.z, x2: pos.x, y2: pos.y, z2: pos.z, color: '#fff7a0', size: 1, life: 0.3, jit });
      NS.flash(0.35, '255,250,200');
    } else if (elem === 'earth') {
      for (let i = 0; i < 4; i++) spawn({ type: 'rock', x: pos.x + R(-0.4, 0.4), y: pos.y + 2.5 + i * 0.3, z: pos.z + R(-0.4, 0.4), color: '#8a5a30', size: R(0.15, 0.25), life: 0.5, vr: R(-4, 4), vy: -6, g: 10 });
    } else if (elem === 'light') {
      spawn({ type: 'beam', x: pos.x, y: 9, z: pos.z, x2: pos.x, y2: 0, z2: pos.z, color: '#fff6c8', size: 1, life: 0.45 });
    }
  };

  NS.healFx = function (pos, color = '#7dff9a') {
    for (let i = 0; i < 16; i++) {
      const a = R(0, Math.PI * 2);
      spawn({ type: 'glow', x: pos.x + Math.cos(a) * 0.35, y: R(0, 0.6), z: pos.z + Math.sin(a) * 0.35, color, size: R(0.08, 0.16), life: R(0.6, 1), vy: R(1, 2), fadeIn: 0.1 });
    }
    spawn({ type: 'ring', x: pos.x, y: 0, z: pos.z, color, size: 0.45, life: 0.6, grow: 1.6 });
  };

  NS.arrowFx = function (pos, up, color) {
    for (let i = 0; i < 6; i++) {
      spawn({ type: 'text', text: up ? '▲' : '▼', x: pos.x + R(-0.4, 0.4), y: up ? R(0.2, 0.6) : R(1.0, 1.4), z: pos.z + R(-0.2, 0.2), color, size: 0.22, life: 0.8, vy: up ? 1.4 : -0.9, fadeIn: 0.1 });
    }
  };

  // 魔法陣 (スキルの溜め)
  NS.magicCircle = function (pos, color, life = 1.2, size = 0.85) {
    return spawn({ type: 'circle', x: pos.x, y: 0, z: pos.z, color, size, life, rot: Math.random() * 6 });
  };

  // 気絶の星 (頭の上を くるくる回る)
  NS.koStars = function (pos, height, owner) {
    for (let i = 0; i < 3; i++) {
      spawn({ type: 'text', text: '★', x: pos.x, y: height, z: pos.z, color: '#ffe066', size: 0.2, life: 2.6, keep: true, front: 0.2, owner,
        orbit: { cx: pos.x, cy: height, cz: pos.z, r: 0.3, w: 4.5, ang: (i / 3) * Math.PI * 2 } });
    }
  };

  // 足元の砂ぼこり
  NS.dust = function (x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      spawn({ type: 'smoke', x: x + R(-0.15, 0.15), y: 0.06, z: z + R(-0.15, 0.15), color: '#d8c0a0', size: R(0.08, 0.16), life: R(0.4, 0.7), grow: 1.6, vx: R(-0.4, 0.4), vy: R(0.2, 0.6), vz: R(-0.4, 0.4) });
    }
  };

  // 紙吹雪 (勝利)
  NS.confetti = function (cx, cz, n = 90) {
    const cols = ['#ff5a5a', '#ffd24a', '#5fe07a', '#4fa8ff', '#c07bff', '#ff8ad0', '#ffffff'];
    for (let i = 0; i < n; i++) {
      spawn({ type: 'confetti', x: cx + R(-4, 4), y: R(4, 7), z: cz + R(-2.5, 2.5), color: cols[i % cols.length], size: R(0.05, 0.08),
        life: R(2.5, 4), vx: R(-0.6, 0.6), vy: R(-1.5, -0.6), vz: R(-0.6, 0.6), vr: R(-6, 6), ph: R(0, 6), drag: 0.6 });
    }
  };

  NS.removeFx = function (owner) {
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].owner === owner) parts.splice(i, 1);
  };

  // ---- 大技の 演出: 全体・最大の 属性スキル (ヘルファイア・くろしお・ぜったいれいど・ラストテンペスト・マグニチュード48・ひゃくおくボルト・コロナ・あんこくのそこ) ----
  // 画面が その属性の 色に そまり、属性ごとの ものが 画面を うめ、敵ごとに 光が ふくらむ (ダメージの 数字は この上に 出る)
  //   tint = 画面の 色 [上・まんなか・下] (r,g,b,こさ) / orb = 敵ごとの 光の 色
  const GRAND = {
    dark: { tint: [[16, 8, 50, 0.97], [8, 0, 14, 0.86], [20, 4, 10, 0.5]], haze: [60, 70, 255], orb: [255, 60, 60] },
    thunder: { tint: [[8, 10, 34, 0.94], [10, 12, 30, 0.75], [20, 20, 30, 0.45]], haze: [120, 140, 255], orb: [255, 250, 170] },
    fire: { tint: [[80, 10, 0, 0.72], [170, 40, 0, 0.58], [255, 100, 0, 0.62]], orb: [255, 170, 60] },
    water: { tint: [[0, 18, 60, 0.82], [0, 40, 110, 0.6], [0, 70, 150, 0.5]], orb: [130, 210, 255] },
    ice: { tint: [[200, 240, 255, 0.62], [150, 215, 255, 0.42], [225, 248, 255, 0.58]], orb: [220, 250, 255] },
    wind: { tint: [[8, 50, 24, 0.6], [20, 80, 40, 0.4], [12, 55, 24, 0.5]], orb: [170, 255, 190] },
    earth: { tint: [[30, 16, 4, 0.86], [70, 40, 12, 0.66], [110, 60, 18, 0.6]], orb: [255, 150, 50] },
    light: { tint: [[255, 248, 210, 0.5], [255, 236, 170, 0.3], [255, 224, 140, 0.2]], orb: [255, 245, 200] },
    heaven: { tint: [[255, 252, 235, 0.78], [255, 238, 190, 0.5], [255, 220, 150, 0.42]], haze: [255, 240, 200], orb: [255, 255, 235] },
  };
  let grand = null;
  // centers = 敵の 体の 中心 / feet = 敵の 足元 (炎・水・土は 足元から ふきあがる)
  NS.grandFx = function (elem, centers, ms = 1700, feet = null) {
    const G = (grand = { elem, T: GRAND[elem] || GRAND.dark, p: 0, centers, feet: feet || centers.map((c) => ({ x: c.x, y: 0, z: c.z })), items: [], next: 0, rot: Math.random() * 6 });
    NS.shake = Math.max(NS.shake, elem === 'earth' ? 0.7 : 0.25);
    return NS.anim(ms, (e, p) => { G.p = p; }, 'linear').then(() => { if (grand === G) grand = null; });
  };
  NS.abyssFx = (centers, ms) => NS.grandFx('dark', centers, ms);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  // ぎざぎざの 線 (a → b)。とちゅうで 枝わかれ
  function jag(a, b, depth, out, spread = 0.22) {
    const pts = [a];
    const n = 7 + Math.floor(Math.random() * 4);
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let i = 1; i < n; i++) {
      const k = i / n, off = (Math.random() - 0.5) * len * spread;
      const p = [a[0] + dx * k + nx * off, a[1] + dy * k + ny * off];
      pts.push(p);
      if (depth < 2 && Math.random() < 0.25) {
        const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6, l = len * (0.15 + Math.random() * 0.25);
        jag(p, [p[0] + Math.cos(ang) * l, p[1] + Math.sin(ang) * l], depth + 1, out, spread);
      }
    }
    pts.push(b);
    out.push({ pts, w: depth ? 1.5 : 3.2 });
  }
  function strokeSegs(ctx, segs, glow, core, k, wk = 1) {
    for (const s of segs) {
      ctx.beginPath();
      s.pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
      ctx.strokeStyle = rgba(glow, 0.35 * k); ctx.lineWidth = s.w * 4 * wk; ctx.stroke();
      ctx.strokeStyle = rgba(core, 0.95 * k); ctx.lineWidth = s.w * wk; ctx.stroke();
    }
  }
  // 属性ごとに 画面を うめる ものを 生む (p = 0〜1 の 進み)
  function grandSpawn(G, W, H, cam) {
    const target = () => { const c = G.centers[Math.floor(Math.random() * G.centers.length)]; return c && cam.project(c.x, c.y, c.z); };
    const add = (o) => G.items.push(Object.assign({ born: G.p }, o));
    switch (G.elem) {
      case 'dark': for (let k = 0; k < 2; k++) {
        const a = Math.random() < 0.6 ? [rnd(0, W), -10] : [Math.random() < 0.5 ? -10 : W + 10, rnd(0, H * 0.6)];
        const tq = target(), b = tq && Math.random() < 0.6 ? [tq.x + rnd(-30, 30), tq.y + rnd(-20, 20)] : [rnd(0, W), H * rnd(0.3, 0.8)];
        const segs = []; jag(a, b, 0, segs); add({ kind: 'bolt', life: 0.16, segs, glow: [255, 20, 30], core: [255, 40, 40] });
      } break;
      case 'thunder': for (let n = 0; n < 2; n++) { // 空から 敵へ まっすぐ おちる 太い いなずま
        const tq = target();
        if (!tq) break;
        const segs = []; jag([tq.x + rnd(-60, 60), -20], [tq.x, tq.y], 0, segs, 0.16);
        add({ kind: 'bolt', life: 0.18, segs, glow: [255, 220, 60], core: [255, 255, 230], wk: 2.4 });
        NS.flash(0.1, '255,250,210');
      } break;
      case 'fire': for (const f of G.feet) for (let k = 0; k < 4; k++) add({ kind: 'jet', life: rnd(0.18, 0.3), foot: f, dx: rnd(-0.25, 0.25), up: rnd(1.8, 3.2), fall: 0, r: rnd(0.3, 0.5), col: 'fire' }); break;
      case 'water': for (const f of G.feet) for (let k = 0; k < 4; k++) add({ kind: 'jet', life: rnd(0.25, 0.4), foot: f, dx: rnd(-0.9, 0.9), up: rnd(3, 4.5), fall: rnd(3, 4.5), r: rnd(0.05, 0.1), col: 'water' }); break;
      case 'ice': for (let k = 0; k < 8; k++) add({ kind: 'shard', life: rnd(0.3, 0.45), x0: rnd(-W * 0.2, W), y0: -40, dx: rnd(80, 220), dy: H * rnd(0.6, 1.1), r: rnd(16, 40), a: rnd(0, 6), va: rnd(-4, 4) }); break;
      case 'wind': for (let k = 0; k < 3; k++) add({ kind: 'streak', life: rnd(0.22, 0.34), y: H * rnd(0.1, 0.9), len: W * rnd(0.3, 0.6), curve: rnd(-60, 60), dir: Math.random() < 0.5 ? 1 : -1 });
        add({ kind: 'leaf', life: rnd(0.3, 0.45), x0: rnd(-50, 0), y: H * rnd(0.1, 0.9), r: rnd(6, 11), a: rnd(0, 6) }); break;
      case 'earth': { // 足元から 地面が われて 岩が ふきあがる
        for (const f of G.feet) {
          const q = cam.project(f.x, 0, f.z);
          if (q && Math.random() < 0.5) {
            const segs = [], a = rnd(0, Math.PI * 2), l = q.s * rnd(1, 2.2);
            jag([q.x, q.y], [q.x + Math.cos(a) * l, q.y + Math.sin(a) * l * 0.35], 0, segs, 0.3);
            add({ kind: 'bolt', life: 0.45, segs, glow: [255, 120, 20], core: [255, 190, 90], wk: 1.2 });
          }
          for (let k = 0; k < 2; k++) add({ kind: 'jet', life: rnd(0.3, 0.42), foot: f, dx: rnd(-1.1, 1.1), up: rnd(2.5, 3.8), fall: rnd(3, 4.2), r: rnd(0.1, 0.2), col: 'rock', a: rnd(0, 6), sides: 5 + Math.floor(rnd(0, 3)) });
        }
        NS.shake = Math.max(NS.shake, 0.35);
      } break;
      case 'light': for (let k = 0; k < 4; k++) add({ kind: 'spark', life: rnd(0.2, 0.35), x: rnd(0, W), y: rnd(0, H * 0.85), r: rnd(8, 20) }); break;
      case 'heaven': { // 金の 光の すじが 天から 敵へ・画面じゅうに きらめき
        for (let k = 0; k < 7; k++) add({ kind: 'spark', life: rnd(0.15, 0.3), x: rnd(0, W), y: rnd(0, H * 0.9), r: rnd(10, 28) });
        const tq = target();
        if (tq) { const segs = []; jag([tq.x + rnd(-40, 40), -20], [tq.x, tq.y], 0, segs, 0.08); add({ kind: 'bolt', life: 0.16, segs, glow: [255, 230, 140], core: [255, 255, 255], wk: 2.8 }); }
        if (Math.random() < 0.3) NS.flash(0.12, '255,250,220');
      } break;
    }
  }
  function drawItem(ctx, o, k, q, W, H, cam) { // k = 1 → 0 (きえていく), q = 0 → 1 (すすみ)
    switch (o.kind) {
      case 'jet': { // 足元から ふきあがる (炎 / 水の しぶき / 岩)。大きさは メートル → 画面
        const f = cam.project(o.foot.x, 0, o.foot.z);
        if (!f) break;
        const s = f.s, x = f.x + o.dx * q * s, y = f.y - (o.up * q - o.fall * q * q) * s;
        if (o.col === 'fire') {
          const r = o.r * s * (1 - q * 0.55);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(255,240,150,${0.9 * k})`); g.addColorStop(0.45, `rgba(255,110,20,${0.7 * k})`); g.addColorStop(1, 'rgba(200,30,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
        } else if (o.col === 'water') {
          ctx.fillStyle = `rgba(200,235,255,${0.9 * k})`; ctx.beginPath(); ctx.arc(x, y, o.r * s, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.save(); ctx.translate(x, y); ctx.rotate(o.a + q * 5);
          const r = o.r * s;
          ctx.beginPath();
          for (let i = 0; i < o.sides; i++) { const a = (i / o.sides) * Math.PI * 2, rr = r * (0.75 + ((i * 37) % 10) / 40); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); ctx.fillStyle = `rgba(130,88,44,${k})`; ctx.fill(); ctx.strokeStyle = `rgba(50,30,10,${k})`; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.restore();
        }
      } break;
      case 'bolt': strokeSegs(ctx, o.segs, o.glow, o.core, k, o.wk || 1); break;
      case 'flame': {
        const y = NS.lerp(o.y0, o.y1, q), r = o.r * (1 - q * 0.5);
        const g = ctx.createRadialGradient(o.x, y, 0, o.x, y, r);
        g.addColorStop(0, `rgba(255,240,150,${0.9 * k})`); g.addColorStop(0.4, `rgba(255,120,20,${0.7 * k})`); g.addColorStop(1, 'rgba(200,30,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(o.x, y, r * 0.65, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
      } break;
      case 'bubble': {
        const y = NS.lerp(o.y0, o.y1, q);
        ctx.strokeStyle = `rgba(220,245,255,${0.8 * k})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(o.x + Math.sin(q * 12) * 8, y, o.r, 0, Math.PI * 2); ctx.stroke();
      } break;
      case 'shard': {
        const x = o.x0 + o.dx * q, y = o.y0 + o.dy * q;
        ctx.save(); ctx.translate(x, y); ctx.rotate(o.a + o.va * q);
        ctx.beginPath(); ctx.moveTo(0, -o.r); ctx.lineTo(o.r * 0.35, -o.r * 0.2); ctx.lineTo(o.r * 0.25, o.r); ctx.lineTo(-o.r * 0.3, o.r * 0.4); ctx.lineTo(-o.r * 0.35, -o.r * 0.3); ctx.closePath();
        ctx.fillStyle = `rgba(235,252,255,${0.85 * k})`; ctx.fill(); ctx.strokeStyle = `rgba(120,200,255,${0.9 * k})`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      } break;
      case 'streak': {
        const x0 = o.dir > 0 ? NS.lerp(-o.len, W, q) : NS.lerp(W + o.len, 0, q), x1 = x0 + o.len * o.dir;
        ctx.beginPath(); ctx.moveTo(x0, o.y); ctx.quadraticCurveTo((x0 + x1) / 2, o.y + o.curve, x1, o.y);
        ctx.strokeStyle = `rgba(225,255,235,${0.75 * k})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
        ctx.strokeStyle = `rgba(120,240,150,${0.4 * k})`; ctx.lineWidth = 12; ctx.stroke();
      } break;
      case 'leaf': {
        ctx.save(); ctx.translate(NS.lerp(o.x0, W + 60, q), o.y + Math.sin(q * 10) * 30); ctx.rotate(o.a + q * 12);
        ctx.fillStyle = `rgba(110,220,120,${0.9 * k})`; ctx.beginPath(); ctx.ellipse(0, 0, o.r, o.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } break;
      case 'rock': {
        const y = NS.lerp(o.y0, o.y1, q * q);
        ctx.save(); ctx.translate(o.x, y); ctx.rotate(o.a + q * 4);
        ctx.beginPath();
        for (let i = 0; i < o.sides; i++) { const a = (i / o.sides) * Math.PI * 2, r = o.r * (0.75 + ((i * 37) % 10) / 40); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fillStyle = `rgba(120,80,40,${k})`; ctx.fill(); ctx.strokeStyle = `rgba(50,30,10,${k})`; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      } break;
      case 'spark': {
        const r = o.r * (0.5 + Math.sin(q * Math.PI));
        ctx.fillStyle = `rgba(255,250,225,${0.7 * k})`;
        ctx.beginPath(); ctx.moveTo(o.x, o.y - r); ctx.lineTo(o.x + r * 0.25, o.y - r * 0.25); ctx.lineTo(o.x + r, o.y); ctx.lineTo(o.x + r * 0.25, o.y + r * 0.25);
        ctx.lineTo(o.x, o.y + r); ctx.lineTo(o.x - r * 0.25, o.y + r * 0.25); ctx.lineTo(o.x - r, o.y); ctx.lineTo(o.x - r * 0.25, o.y - r * 0.25); ctx.closePath(); ctx.fill();
      } break;
    }
  }
  NS.drawGrand = function (ctx, cam, W, H) {
    if (!grand) return;
    const G = grand, T = G.T, p = G.p;
    const dark = p < 0.18 ? p / 0.18 : p > 0.82 ? (1 - p) / 0.18 : 1; // 色の こさ
    ctx.save();
    // 画面の 色 (上ほど こい・下は 少し あかるい など 属性ごとに)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    T.tint.forEach((c, i) => g.addColorStop(i / 2, rgba(c, c[3] * dark)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (T.haze) { // 上の もや
      const bl = ctx.createRadialGradient(W * 0.5, -H * 0.05, 0, W * 0.5, -H * 0.05, W * 0.45);
      bl.addColorStop(0, rgba(T.haze, 0.5 * dark)); bl.addColorStop(1, rgba(T.haze, 0));
      ctx.fillStyle = bl; ctx.fillRect(0, 0, W, H * 0.5);
    }
    ctx.globalCompositeOperation = 'lighter';
    if (G.elem === 'heaven') { // ゴーヘブン: 敵ごとの 天からの 光の 柱 + 足元の 輪
      const env2 = NS.clamp((p - 0.12) / 0.15, 0, 1) * NS.clamp((0.92 - p) / 0.12, 0, 1);
      for (const f of G.feet) {
        const q = cam.project(f.x, 0, f.z);
        if (!q || env2 <= 0) continue;
        const w = q.s * (0.45 + 0.25 * Math.sin(p * 30 + f.x)) * env2;
        const g = ctx.createLinearGradient(q.x - w, 0, q.x + w, 0);
        g.addColorStop(0, 'rgba(255,230,150,0)'); g.addColorStop(0.5, `rgba(255,255,245,${0.85 * env2})`); g.addColorStop(1, 'rgba(255,230,150,0)');
        ctx.fillStyle = g; ctx.fillRect(q.x - w, 0, w * 2, q.y);
        for (let i = 0; i < 2; i++) { // 足元の 輪 (虹色)
          const rr = q.s * (0.5 + ((p * 3 + i * 0.5) % 1) * 1.1);
          ctx.strokeStyle = `hsla(${(p * 720 + i * 120) % 360},100%,75%,${0.8 * env2})`; ctx.lineWidth = Math.max(2, q.s * 0.06);
          ctx.beginPath(); ctx.ellipse(q.x, q.y, rr, rr * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    if (G.elem === 'light' || G.elem === 'heaven') { // コロナ: 上の 太陽から まわる 光の すじ
      const cx = W * 0.5, cy = -H * 0.08, n = 18;
      for (let i = 0; i < n; i++) {
        const a = G.rot + p * 1.2 + (i / n) * Math.PI * 2, w = 0.05;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a - w) * W * 1.3, cy + Math.sin(a - w) * W * 1.3); ctx.lineTo(cx + Math.cos(a + w) * W * 1.3, cy + Math.sin(a + w) * W * 1.3); ctx.closePath();
        ctx.fillStyle = G.elem === 'heaven' ? `hsla(${(i * 20 + p * 400) % 360},100%,80%,${(i % 2 ? 0.12 : 0.22) * dark})` : `rgba(255,235,160,${(i % 2 ? 0.09 : 0.16) * dark})`; ctx.fill();
      }
      const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.45);
      sg.addColorStop(0, `rgba(255,250,220,${0.5 * dark})`); sg.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H * 0.6);
    }
    if (G.elem === 'ice') { // ぜったいれいど: 画面の ふちから 白く こおりつく
      const fg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
      fg.addColorStop(0, 'rgba(255,255,255,0)'); fg.addColorStop(1, `rgba(240,252,255,${0.6 * dark})`);
      ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    }
    // 炎・水・土: 敵の 足元から ふきあがる 柱 (いきおいよく のびて、さいごに ひっこむ)
    const env = NS.clamp((p - 0.18) / 0.12, 0, 1) * NS.clamp((0.86 - p) / 0.14, 0, 1);
    if (env > 0 && (G.elem === 'fire' || G.elem === 'water' || G.elem === 'earth')) {
      for (const f of G.feet) {
        const q = cam.project(f.x, 0, f.z);
        if (!q) continue;
        const s = q.s, wob = Math.sin(p * 50 + f.x) * 0.06;
        if (G.elem === 'fire') { // 炎の 柱
          const h = s * 3.2 * env * (1 + wob), w = s * 0.55;
          const g = ctx.createLinearGradient(0, q.y, 0, q.y - h);
          g.addColorStop(0, `rgba(255,240,170,${0.95 * env})`); g.addColorStop(0.4, `rgba(255,120,20,${0.8 * env})`); g.addColorStop(1, 'rgba(200,30,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(q.x - w, q.y); ctx.quadraticCurveTo(q.x - w * 0.9, q.y - h * 0.5, q.x + wob * s, q.y - h); ctx.quadraticCurveTo(q.x + w * 0.9, q.y - h * 0.5, q.x + w, q.y); ctx.closePath(); ctx.fill();
        } else if (G.elem === 'water') { // 水柱 (しぶきの 白い ふち)
          const h = s * 3.4 * env, w0 = s * 0.32, w1 = s * 0.55;
          ctx.globalCompositeOperation = 'source-over';
          ctx.beginPath(); ctx.moveTo(q.x - w0, q.y);
          ctx.quadraticCurveTo(q.x - w1 * (1 + wob), q.y - h * 0.6, q.x - w1 * 0.7, q.y - h); ctx.quadraticCurveTo(q.x, q.y - h * 1.12, q.x + w1 * 0.7, q.y - h);
          ctx.quadraticCurveTo(q.x + w1 * (1 - wob), q.y - h * 0.6, q.x + w0, q.y); ctx.closePath();
          const g = ctx.createLinearGradient(0, q.y, 0, q.y - h);
          g.addColorStop(0, `rgba(20,90,200,${0.85 * env})`); g.addColorStop(1, `rgba(150,215,255,${0.8 * env})`);
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = `rgba(240,250,255,${0.85 * env})`; ctx.lineWidth = Math.max(2, s * 0.06); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
        } else { // 岩の とげ
          ctx.globalCompositeOperation = 'source-over';
          for (const [dx, hh, ww] of [[-0.62, 1.6, 0.3], [-0.24, 3.0, 0.4], [0.22, 2.4, 0.36], [0.64, 1.5, 0.28]]) {
            const bx = q.x + dx * s, h = hh * s * env, w = ww * s;
            ctx.beginPath(); ctx.moveTo(bx - w, q.y); ctx.lineTo(bx + dx * s * 0.15, q.y - h); ctx.lineTo(bx + w, q.y); ctx.closePath();
            ctx.fillStyle = `rgba(140,95,50,${env})`; ctx.fill(); ctx.strokeStyle = `rgba(60,36,14,${env})`; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx - w * 0.2, q.y); ctx.lineTo(bx + dx * s * 0.15, q.y - h); ctx.lineTo(bx + w, q.y); ctx.closePath();
            ctx.fillStyle = `rgba(90,58,28,${0.6 * env})`; ctx.fill();
          }
          ctx.globalCompositeOperation = 'lighter';
        }
      }
    }
    // 敵ごとの 光 (色が こくなってから ふくらむ)
    const orb = NS.clamp((p - 0.25) / 0.2, 0, 1) * (p > 0.85 ? (1 - p) / 0.15 : 1);
    for (const c of G.centers) {
      const q = cam.project(c.x, c.y, c.z);
      if (!q || orb <= 0) continue;
      const r = Math.max(18, q.s * 0.55) * (0.6 + 0.4 * orb) * (1 + Math.sin(p * 40) * 0.06);
      const og = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      const O = T.orb;
      og.addColorStop(0, rgba(O, 0.95 * orb)); og.addColorStop(0.35, rgba(O.map((v) => Math.round(v * 0.85)), 0.7 * orb)); og.addColorStop(1, rgba(O.map((v) => Math.round(v * 0.4)), 0));
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    }
    // 属性ごとの もの
    const rate = { dark: 0.035, thunder: 0.05, fire: 0.03, water: 0.04, ice: 0.03, wind: 0.035, earth: 0.06, light: 0.03, heaven: 0.02 }[G.elem] || 0.04;
    if (p > 0.1 && p < 0.85 && p >= G.next) { G.next = p + rate; grandSpawn(G, W, H, cam); }
    G.items = G.items.filter((o) => p - o.born < o.life);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const o of G.items) {
      const q = (p - o.born) / o.life;
      ctx.globalCompositeOperation = o.kind === 'rock' || o.kind === 'shard' || o.kind === 'leaf' || (o.kind === 'jet' && o.col === 'rock') ? 'source-over' : 'lighter';
      drawItem(ctx, o, 1 - q, q, W, H, cam);
    }
    ctx.restore();
  };

  NS.clearFx = function () { parts.length = 0; popups.length = 0; emitters.length = 0; grand = null; NS.darkness = null; };

  // 暗闇: src (3D の 点) から 広がって 画面を おおう。spread = 0〜1 (1 で 画面ぜんぶ)・a = こさ
  NS.darkness = null;
  NS.setDarkness = function (spread, src, a = 1) { NS.darkness = spread > 0 && a > 0 ? { spread, src, a } : null; };
  NS.drawDarkness = function (ctx, cam, W, H) {
    const D = NS.darkness;
    if (!D) return;
    const q = D.src && cam.project(D.src.x, D.src.y, D.src.z);
    const x = q ? q.x : W / 2, y = q ? q.y : H / 2;
    const far = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
    const r = Math.max(1, far * 1.35 * D.spread);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(4,0,10,${D.a})`); g.addColorStop(0.72, `rgba(4,0,10,${D.a})`); g.addColorStop(0.86, `rgba(40,0,70,${D.a * 0.6})`); g.addColorStop(1, 'rgba(20,0,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
})();
