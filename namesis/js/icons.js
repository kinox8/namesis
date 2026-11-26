// スキルのアイコン。頭のアンテナの先・スキル欄・コマンドで共通に使う。
// 黒いふちのシール風。範囲が 3体なら小さいアイコンを3つ、全体なら輪をつける。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const INK = '#1c1418';
  const STAT_COLOR = { atk: '#ff6a4a', def: '#ffc83a', spd: '#5fe08a', eva: '#c08aff' };

  function ink(ctx, fill, R) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = R * 0.24;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  // 太い線に黒ふちをつける
  function inkLine(ctx, color, R, w = 0.26) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = R * (w + 0.2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = R * w;
    ctx.stroke();
  }
  function shine(ctx, x, y, R) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(x, y, R * 0.16, R * 0.1, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function heartPath(ctx, R, cy = 0) {
    ctx.beginPath();
    ctx.moveTo(0, cy + R * 0.95);
    ctx.bezierCurveTo(-R * 0.35, cy + R * 0.62, -R * 1.1, cy + R * 0.2, -R * 1.0, cy - R * 0.38);
    ctx.bezierCurveTo(-R * 0.9, cy - R * 0.95, -R * 0.18, cy - R * 0.98, 0, cy - R * 0.45);
    ctx.bezierCurveTo(R * 0.18, cy - R * 0.98, R * 0.9, cy - R * 0.95, R * 1.0, cy - R * 0.38);
    ctx.bezierCurveTo(R * 1.1, cy + R * 0.2, R * 0.35, cy + R * 0.62, 0, cy + R * 0.95);
    ctx.closePath();
  }

  function spiral(ctx, R, turns, r0, r1) {
    ctx.beginPath();
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      const a = p * turns * Math.PI * 2;
      const r = R * (r0 + (r1 - r0) * p);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  // 原点中心・半径 R の基本アイコン
  const DRAW = {
    heal(ctx, R) {
      heartPath(ctx, R);
      ink(ctx, '#f6a5b4', R);
      // ハートの中のくるっとした線 (参考画像の かいふくアンテナ)
      ctx.beginPath();
      ctx.moveTo(-R * 0.02, R * 0.72);
      ctx.bezierCurveTo(R * 0.05, R * 0.3, R * 0.42, -R * 0.12, R * 0.12, -R * 0.3);
      ctx.bezierCurveTo(-R * 0.12, -R * 0.45, -R * 0.4, -R * 0.05, -R * 0.12, R * 0.18);
      ctx.bezierCurveTo(R * 0.05, R * 0.32, R * 0.25, R * 0.12, R * 0.3, R * 0.02);
      ctx.strokeStyle = INK;
      ctx.lineWidth = R * 0.14;
      ctx.lineCap = 'round';
      ctx.stroke();
    },
    revive(ctx, R) {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * R * 0.95, -R * 0.15, R * 0.55, R * 0.32, sx * -0.5, 0, Math.PI * 2);
        ink(ctx, '#ffffff', R);
      }
      heartPath(ctx, R * 0.85);
      ink(ctx, '#ffd45a', R);
      shine(ctx, -R * 0.35, -R * 0.35, R);
    },
    arrow(ctx, R, color, down) {
      ctx.save();
      if (down) ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -R * 1.05);
      ctx.lineTo(R * 0.9, -R * 0.05);
      ctx.lineTo(R * 0.38, -R * 0.05);
      ctx.lineTo(R * 0.38, R * 0.95);
      ctx.lineTo(-R * 0.38, R * 0.95);
      ctx.lineTo(-R * 0.38, -R * 0.05);
      ctx.lineTo(-R * 0.9, -R * 0.05);
      ctx.closePath();
      ink(ctx, color, R);
      ctx.restore();
    },
    fire(ctx, R, t) {
      const sw = Math.sin(t * 6) * R * 0.12;
      const flame = (k) => {
        ctx.beginPath();
        ctx.moveTo(0, R * 0.95 * k);
        ctx.bezierCurveTo(-R * 0.95 * k, R * 0.9 * k, -R * 0.95 * k, -R * 0.1 * k, -R * 0.35 * k, -R * 0.55 * k);
        ctx.quadraticCurveTo(-R * 0.2 * k, -R * 0.1 * k, -R * 0.05 * k, -R * 0.25 * k);
        ctx.quadraticCurveTo(-R * 0.1 * k, -R * 0.8 * k, sw * k, -R * 1.15 * k);
        ctx.bezierCurveTo(R * 0.55 * k, -R * 0.7 * k, R * 0.95 * k, -R * 0.2 * k, R * 0.9 * k, R * 0.25 * k);
        ctx.bezierCurveTo(R * 0.85 * k, R * 0.8 * k, R * 0.4 * k, R * 0.95 * k, 0, R * 0.95 * k);
        ctx.closePath();
      };
      flame(1); ink(ctx, '#ff5a2a', R);
      ctx.save(); ctx.translate(0, R * 0.25); flame(0.5); ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.restore();
    },
    water(ctx, R) {
      ctx.beginPath();
      ctx.moveTo(0, -R * 1.1);
      ctx.bezierCurveTo(R * 0.4, -R * 0.5, R * 0.85, -R * 0.05, R * 0.85, R * 0.35);
      ctx.arc(0, R * 0.35, R * 0.85, 0, Math.PI);
      ctx.bezierCurveTo(-R * 0.85, -R * 0.05, -R * 0.4, -R * 0.5, 0, -R * 1.1);
      ctx.closePath();
      ink(ctx, '#4a9cff', R);
      shine(ctx, -R * 0.35, R * 0.15, R);
    },
    ice(ctx, R) {
      ctx.beginPath();
      const P = [[0, -1.1], [0.62, -0.4], [0.62, 0.45], [0, 1.1], [-0.62, 0.45], [-0.62, -0.4]];
      P.forEach((p, i) => (i ? ctx.lineTo(p[0] * R, p[1] * R) : ctx.moveTo(p[0] * R, p[1] * R)));
      ctx.closePath();
      ink(ctx, '#bdf2ff', R);
      ctx.beginPath();
      ctx.moveTo(0, -R * 1.1); ctx.lineTo(0, R * 1.1);
      ctx.moveTo(-R * 0.62, -R * 0.4); ctx.lineTo(0, -R * 0.1); ctx.lineTo(R * 0.62, -R * 0.4);
      ctx.strokeStyle = 'rgba(40,110,150,0.6)'; ctx.lineWidth = R * 0.08; ctx.stroke();
    },
    wind(ctx, R, t) {
      ctx.save();
      ctx.rotate(-t * 3);
      spiral(ctx, R, 1.6, 0.08, 0.95);
      inkLine(ctx, '#6fe08a', R, 0.26);
      ctx.restore();
    },
    earth(ctx, R) {
      ctx.beginPath();
      const P = [[-0.95, 0.25], [-0.6, -0.65], [0.1, -0.95], [0.85, -0.5], [1.0, 0.3], [0.45, 0.9], [-0.55, 0.85]];
      P.forEach((p, i) => (i ? ctx.lineTo(p[0] * R, p[1] * R) : ctx.moveTo(p[0] * R, p[1] * R)));
      ctx.closePath();
      ink(ctx, '#c08a50', R);
      ctx.beginPath();
      ctx.moveTo(-R * 0.1, -R * 0.6); ctx.lineTo(R * 0.15, -R * 0.1); ctx.lineTo(-R * 0.15, R * 0.3); ctx.lineTo(R * 0.1, R * 0.6);
      ctx.strokeStyle = INK; ctx.lineWidth = R * 0.1; ctx.stroke();
      shine(ctx, -R * 0.45, -R * 0.3, R);
    },
    thunder(ctx, R) {
      ctx.beginPath();
      const P = [[0.25, -1.15], [-0.65, 0.12], [-0.05, 0.12], [-0.35, 1.15], [0.7, -0.2], [0.08, -0.2], [0.45, -1.15]];
      P.forEach((p, i) => (i ? ctx.lineTo(p[0] * R, p[1] * R) : ctx.moveTo(p[0] * R, p[1] * R)));
      ctx.closePath();
      ink(ctx, '#ffe14a', R);
    },
    light(ctx, R, t) {
      ctx.save();
      ctx.rotate(Math.sin(t * 2) * 0.15);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? R * 0.32 : R * 1.15;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ink(ctx, '#fff3a0', R);
      ctx.restore();
    },
    dark(ctx, R, t) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
      ink(ctx, '#7a3fc8', R);
      ctx.save();
      ctx.rotate(t * 2);
      spiral(ctx, R, 1.4, 0.05, 0.7);
      ctx.strokeStyle = '#2a0a40'; ctx.lineWidth = R * 0.16; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
      shine(ctx, -R * 0.4, -R * 0.4, R);
    },
    st_sleep(ctx, R) {
      const z = (x, y, k) => {
        ctx.beginPath();
        ctx.moveTo(x - R * 0.45 * k, y - R * 0.45 * k); ctx.lineTo(x + R * 0.45 * k, y - R * 0.45 * k);
        ctx.lineTo(x - R * 0.45 * k, y + R * 0.45 * k); ctx.lineTo(x + R * 0.45 * k, y + R * 0.45 * k);
        inkLine(ctx, '#9fd0ff', R, 0.22 * k);
      };
      z(-R * 0.25, R * 0.25, 1.15);
      z(R * 0.6, -R * 0.55, 0.65);
    },
    st_poison(ctx, R) {
      for (const [x, y, r] of [[-0.15, 0.2, 0.72], [0.6, -0.55, 0.38], [0.65, 0.55, 0.26]]) {
        ctx.beginPath(); ctx.arc(x * R, y * R, r * R, 0, Math.PI * 2);
        ink(ctx, '#b06ad8', R);
        shine(ctx, (x - r * 0.4) * R, (y - r * 0.4) * R, R * r * 1.2);
      }
    },
    st_seal(ctx, R) { // アンテナに 赤い ✕
      ctx.beginPath();
      ctx.moveTo(0, R * 1.0); ctx.lineTo(0, -R * 0.2);
      inkLine(ctx, '#d8dde6', R, 0.2);
      ctx.beginPath(); ctx.arc(0, -R * 0.45, R * 0.32, 0, Math.PI * 2);
      ink(ctx, '#ffd24a', R);
      ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2);
      ctx.moveTo(-R * 0.67, -R * 0.67); ctx.lineTo(R * 0.67, R * 0.67);
      ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = R * 0.2; ctx.lineCap = 'round'; ctx.stroke();
    },
    cure(ctx, R) { // ミントの 十字
      const w = R * 0.42, l = R * 1.0;
      ctx.beginPath();
      ctx.moveTo(-w, -l); ctx.lineTo(w, -l); ctx.lineTo(w, -w); ctx.lineTo(l, -w); ctx.lineTo(l, w); ctx.lineTo(w, w);
      ctx.lineTo(w, l); ctx.lineTo(-w, l); ctx.lineTo(-w, w); ctx.lineTo(-l, w); ctx.lineTo(-l, -w); ctx.lineTo(-w, -w);
      ctx.closePath();
      ink(ctx, '#7dffc4', R);
      shine(ctx, -R * 0.35, -R * 0.4, R * 0.8);
    },
    // みんなダルダル: 桃色の ぐにゃっと した しぶき (黒い つぶつぶ)
    de_daru(ctx, R) {
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2, rr = R * (0.62 + 0.3 * Math.max(0, Math.sin(a * 6)) ** 2 + 0.06 * Math.sin(a * 13));
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.92;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ink(ctx, '#ff6ab0', R);
      ctx.fillStyle = '#5a1a3a';
      for (const [x, y, r] of [[-0.3, -0.15, 0.09], [0.25, 0.2, 0.08], [0.05, -0.38, 0.07], [-0.12, 0.35, 0.06], [0.42, -0.2, 0.06]]) { ctx.beginPath(); ctx.arc(x * R, y * R, r * R, 0, Math.PI * 2); ctx.fill(); }
      shine(ctx, -R * 0.3, -R * 0.35, R * 0.7);
    },
    // みんなたたり: ピンクの メラメラ (ゆらめく ほのお。外は こい ピンク・中は うすい ピンク)
    de_tatari(ctx, R, t = 0) {
      const flame = (s, col, ph) => {
        const sw = Math.sin(t * 7 + ph) * R * 0.14 * s, sw2 = Math.sin(t * 9 + ph + 1) * R * 0.08 * s;
        ctx.beginPath();
        ctx.moveTo(0, R * 0.95 * s);
        ctx.bezierCurveTo(-R * 0.85 * s, R * 0.9 * s, -R * 0.95 * s, R * 0.05 * s, -R * 0.45 * s + sw2, -R * 0.35 * s);
        ctx.quadraticCurveTo(-R * 0.4 * s, R * 0.0, -R * 0.2 * s, R * 0.05 * s);
        ctx.quadraticCurveTo(-R * 0.25 * s, -R * 0.55 * s, sw, -R * 1.05 * s);
        ctx.quadraticCurveTo(R * 0.2 * s, -R * 0.45 * s, R * 0.3 * s, -R * 0.2 * s);
        ctx.quadraticCurveTo(R * 0.42 * s, -R * 0.45 * s, R * 0.5 * s + sw2, -R * 0.6 * s);
        ctx.bezierCurveTo(R * 1.0 * s, -R * 0.1 * s, R * 0.85 * s, R * 0.9 * s, 0, R * 0.95 * s);
        ctx.closePath();
        ink(ctx, col, R);
      };
      flame(1, '#ff4fa8', 0);
      ctx.save(); ctx.translate(0, R * 0.22); flame(0.55, '#ffc4e4', 2); ctx.restore();
      shine(ctx, -R * 0.3, R * 0.1, R * 0.6);
    },
    // みんなのろのろ: 棒の 両がわに さがった 黒い 鉄球
    de_spd(ctx, R) {
      ctx.beginPath(); // 棒
      ctx.moveTo(0, R * 1.05); ctx.lineTo(0, -R * 0.62);
      inkLine(ctx, '#3a3440', R, 0.12);
      ctx.beginPath(); // 鉄球を つるす 線
      ctx.moveTo(-R * 0.72, -R * 0.05); ctx.quadraticCurveTo(-R * 0.45, -R * 0.62, 0, -R * 0.42);
      ctx.quadraticCurveTo(R * 0.45, -R * 0.62, R * 0.72, -R * 0.05);
      ctx.strokeStyle = INK; ctx.lineWidth = R * 0.1; ctx.lineCap = 'round'; ctx.stroke();
      for (const sx of [-1, 1]) { // 小さな まき毛
        ctx.beginPath(); ctx.arc(sx * R * 0.3, -R * 0.5, R * 0.12, 0, Math.PI * 2);
        ctx.strokeStyle = INK; ctx.lineWidth = R * 0.08; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, -R * 0.82, R * 0.22, 0, Math.PI * 2); // 上の 輪
      ctx.strokeStyle = INK; ctx.lineWidth = R * 0.12; ctx.stroke();
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * R * 0.72, R * 0.3, R * 0.42, 0, Math.PI * 2);
        ink(ctx, '#26232c', R);
        shine(ctx, sx * R * 0.72 + R * 0.16, R * 0.14, R * 0.9);
      }
    },
    // みんなよわよわ: しおれて 下を むいた 花
    de_atk(ctx, R) {
      ctx.beginPath(); // くき
      ctx.moveTo(R * 0.15, R * 1.05);
      ctx.lineTo(R * 0.15, -R * 0.35);
      ctx.bezierCurveTo(R * 0.15, -R * 1.05, -R * 0.55, -R * 1.0, -R * 0.55, -R * 0.42);
      inkLine(ctx, '#8aa05a', R, 0.16);
      ctx.save(); // 下を むいた つぼみ
      ctx.translate(-R * 0.55, -R * 0.25);
      for (const a of [0.45, -0.35]) {
        ctx.beginPath();
        ctx.ellipse(Math.sin(a) * R * 0.18, R * 0.25, R * 0.2, R * 0.38, a, 0, Math.PI * 2);
        ink(ctx, a > 0 ? '#e9e4cf' : '#fffdf2', R * 0.8);
      }
      ctx.restore();
    },
    // みんなやわやわ: ぺしゃんこに つぶれた 白い 箱
    de_def(ctx, R) {
      const poly = (P) => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0] * R, p[1] * R) : ctx.moveTo(p[0] * R, p[1] * R))); ctx.closePath(); };
      poly([[-1.0, -0.05], [-0.3, -0.5], [0.98, -0.38], [0.42, 0.02]]); // ふた
      ink(ctx, '#fbf9f3', R);
      poly([[-1.0, -0.05], [-0.45, 0.1], [0.42, 0.02], [0.45, 0.42], [-0.3, 0.5], [-0.95, 0.36]]); // 前 (へこんでいる)
      ink(ctx, '#e2ddd2', R);
      poly([[0.42, 0.02], [0.98, -0.38], [1.0, 0.02], [0.45, 0.42]]); // 横
      ink(ctx, '#c9c3b6', R);
      ctx.beginPath(); // つぶれた しわ
      ctx.moveTo(-R * 0.62, R * 0.02); ctx.lineTo(-R * 0.45, R * 0.28); ctx.lineTo(-R * 0.22, R * 0.08);
      ctx.moveTo(-R * 0.3, -R * 0.5); ctx.lineTo(R * 0.05, -R * 0.2);
      ctx.moveTo(R * 0.72, -R * 0.2); ctx.lineTo(R * 0.7, R * 0.15);
      ctx.strokeStyle = 'rgba(28,20,24,0.55)'; ctx.lineWidth = R * 0.08; ctx.lineCap = 'round'; ctx.stroke();
      shine(ctx, R * 0.25, -R * 0.3, R * 0.8);
    },
    // みんなかぜになれ: 白い かぜの うず
    b_wind(ctx, R, t) {
      ctx.save();
      ctx.translate(-R * 0.15, R * 0.05);
      ctx.rotate(-t * 2);
      spiral(ctx, R, 1.25, 0.06, 0.62);
      inkLine(ctx, '#f6f9ff', R, 0.24);
      ctx.restore();
      ctx.beginPath(); // しっぽ
      ctx.moveTo(R * 0.42, R * 0.22); ctx.quadraticCurveTo(R * 0.85, R * 0.1, R * 1.0, -R * 0.35);
      inkLine(ctx, '#f6f9ff', R, 0.2);
      ctx.save(); ctx.translate(R * 0.6, -R * 0.62); ctx.rotate(-t * 2.6); // 小さな うず
      spiral(ctx, R, 1.1, 0.04, 0.3);
      inkLine(ctx, '#f6f9ff', R, 0.16);
      ctx.restore();
    },
    // みんなたくわえる: 黒い ダンベル
    b_bell(ctx, R) {
      ctx.beginPath(); ctx.moveTo(-R * 0.95, 0); ctx.lineTo(R * 0.95, 0);
      inkLine(ctx, '#55555e', R, 0.16);
      for (const sx of [-1, 1]) {
        for (const [x, h, w] of [[0.5, 0.95, 0.22], [0.78, 0.7, 0.2]]) {
          ctx.beginPath(); ctx.roundRect(sx * x * R - (w * R) / 2, (-h * R) / 2, w * R, h * R, R * 0.06);
          ink(ctx, '#2a2a32', R * 0.7);
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(sx * x * R - (w * R) / 2 + R * 0.04, (-h * R) / 2 + R * 0.06, R * 0.05, h * R * 0.55);
        }
      }
    },
    // たくわえる: 黒い バーベル (長い 棒と 重り)
    // ふちは 黒・中は 白 (ひとまわり 大きく)
    b_barbell(ctx, R) {
      R *= 1.25;
      const bar = () => { ctx.beginPath(); ctx.moveTo(-R * 1.15, 0); ctx.lineTo(R * 1.15, 0); };
      const plates = [];
      for (const sx of [-1, 1]) for (const [x, h, w] of [[0.45, 1.0, 0.17], [0.66, 0.85, 0.17], [0.86, 0.62, 0.15]]) plates.push([sx * x * R - (w * R) / 2, (-h * R) / 2, w * R, h * R]);
      const plate = (p) => { ctx.beginPath(); ctx.roundRect(p[0], p[1], p[2], p[3], R * 0.05); };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
      bar(); ctx.lineWidth = R * 0.3; ctx.stroke();                       // 黒い ふち
      for (const p of plates) { plate(p); ctx.lineWidth = R * 0.16; ctx.stroke(); }
      bar(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = R * 0.12; ctx.stroke(); // 白い 中
      ctx.fillStyle = '#ffffff';
      for (const p of plates) { plate(p); ctx.fill(); }
    },
    // みんなムキムキ: 力こぶの うで
    b_arm(ctx, R) {
      R *= 1.2;
      // うで (かたから ひじ、ひじから こぶしへ)・力こぶ・こぶし を 1つの 形として、黒い ふち → 白い 中 の 順に 描く
      const arm = () => { ctx.beginPath(); ctx.moveTo(-R * 0.95, R * 0.5); ctx.quadraticCurveTo(-R * 0.1, R * 0.75, R * 0.35, R * 0.4); ctx.lineTo(R * 0.48, -R * 0.45); };
      const bump = () => { ctx.beginPath(); ctx.ellipse(-R * 0.25, R * 0.18, R * 0.42, R * 0.33, -0.15, 0, Math.PI * 2); };
      const fist = () => { ctx.beginPath(); ctx.arc(R * 0.5, -R * 0.62, R * 0.3, 0, Math.PI * 2); };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      arm(); ctx.lineWidth = R * 0.62; ctx.stroke();
      bump(); ctx.lineWidth = R * 0.2; ctx.stroke();
      fist(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff';
      arm(); ctx.lineWidth = R * 0.42; ctx.stroke();
      bump(); ctx.fill();
      fist(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(R * 0.36, -R * 0.62); ctx.lineTo(R * 0.6, -R * 0.62); // こぶしの ゆび
      ctx.strokeStyle = 'rgba(28,20,24,0.5)'; ctx.lineWidth = R * 0.06; ctx.stroke();
    },
    // みんなかわしやすい: くるりと よける 白い 矢じるし
    b_dodge(ctx, R) {
      ctx.beginPath();
      ctx.moveTo(R * 0.75, R * 0.65); ctx.quadraticCurveTo(R * 0.55, -R * 0.75, -R * 0.15, -R * 0.55); ctx.quadraticCurveTo(-R * 0.6, -R * 0.4, -R * 0.55, R * 0.05);
      inkLine(ctx, '#f6f9ff', R, 0.26);
      ctx.beginPath(); // 矢じり (左下へ)
      ctx.moveTo(-R * 0.95, -R * 0.05); ctx.lineTo(-R * 0.55, R * 0.55); ctx.lineTo(-R * 0.18, -R * 0.02); ctx.closePath();
      ink(ctx, '#f6f9ff', R * 0.8);
    },
    // みんなガチガチ: 黒い もようの かたい ボール
    b_ball(ctx, R) {
      ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
      ink(ctx, '#f2f2f4', R);
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.clip();
      const pent = (cx, cy, r, rot) => { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = rot + (i / 5) * Math.PI * 2 - Math.PI / 2; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = '#26262e'; ctx.fill(); };
      pent(0, 0, R * 0.34, 0);
      ctx.strokeStyle = '#26262e'; ctx.lineWidth = R * 0.07;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3); ctx.lineTo(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66); ctx.stroke();
        pent(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, R * 0.32, a + Math.PI / 2);
      }
      ctx.restore();
      shine(ctx, -R * 0.42, -R * 0.45, R);
    },
    st_shock(ctx, R) {
      ctx.beginPath();
      ctx.moveTo(-R, -R * 0.1);
      ctx.lineTo(-R * 0.55, -R * 0.7); ctx.lineTo(-R * 0.1, R * 0.1); ctx.lineTo(R * 0.35, -R * 0.7);
      ctx.lineTo(R * 0.8, R * 0.1); ctx.lineTo(R * 1.05, -R * 0.3);
      inkLine(ctx, '#ffe14a', R, 0.24);
      ctx.beginPath();
      ctx.moveTo(-R * 0.8, R * 0.55); ctx.lineTo(R * 0.8, R * 0.55);
      inkLine(ctx, '#ffe14a', R, 0.18);
    },
  };

  function drawBase(ctx, sk, R, t) {
    if (sk.img) { // 絵の アイコン (ゴーヘブン)
      const im = NS.pic && NS.pic(sk.img);
      if (im && im.naturalWidth) { const h = R * 2.3, w = h * (im.naturalWidth / im.naturalHeight); ctx.drawImage(im, -w / 2, -h * 0.58, w, h); }
      return;
    }
    const ic = sk.icon || 'heal';
    if (ic === 'buff') DRAW.arrow(ctx, R, STAT_COLOR[sk.stat] || '#ffd24a', false);
    else (DRAW[ic] || DRAW.heal)(ctx, R, t);
  }

  // 全体の輪 (奥半分 → アイコン → 手前半分 の順で描いて立体に見せる)
  function ring(ctx, R, front) {
    ctx.beginPath();
    ctx.ellipse(0, R * 0.55, R * 1.55, R * 0.45, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = R * 0.24;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // ---- 強い技ほど 派手に ----
  // grade 2〜: まわる星 / 3〜: 後ろで回る光の筋 / 4〜: オーラと鼓動 / 5: 虹色
  const gradeOf = (sk) => (sk && sk.grade) || 0;
  NS.iconScale = (sk) => 1 + gradeOf(sk) * 0.13;

  function star4(ctx, x, y, R, color) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? R * 0.3 : R;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  function decoBack(ctx, R, g, t) {
    if (g >= 4) {
      const gr = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.9);
      gr.addColorStop(0, 'rgba(255,240,170,0.6)');
      gr.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.9, 0, Math.PI * 2); ctx.fill();
    }
    if (g >= 3) {
      const n = 12, len = R * (1.45 + 0.12 * g);
      ctx.save();
      ctx.rotate(t * 0.7);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, w = 0.13;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - w) * R * 0.5, Math.sin(a - w) * R * 0.5);
        ctx.lineTo(Math.cos(a) * len * (i % 2 ? 0.8 : 1), Math.sin(a) * len * (i % 2 ? 0.8 : 1));
        ctx.lineTo(Math.cos(a + w) * R * 0.5, Math.sin(a + w) * R * 0.5);
        ctx.closePath();
        ctx.fillStyle = g >= 5 ? `hsla(${(i * 30 + t * 140) % 360},95%,62%,0.8)` : i % 2 ? 'rgba(255,214,74,0.8)' : 'rgba(255,250,210,0.7)';
        ctx.fill();
      }
      ctx.restore();
    }
  }
  function decoFront(ctx, R, g, t) {
    if (g < 2) return;
    for (let i = 0; i < g; i++) {
      const a = t * 2.2 + (i / g) * Math.PI * 2;
      const tw = 0.6 + 0.4 * Math.sin(t * 7 + i * 2.1);
      const color = g >= 5 ? `hsl(${(i * 70 + t * 160) % 360},95%,72%)` : '#fff6b0';
      star4(ctx, Math.cos(a) * R * 1.5, Math.sin(a) * R * 0.62 - R * 0.05, R * 0.3 * tw, color);
    }
  }

  // R はアイコンの基本の大きさ。grow のとき 強さに応じて大きくする
  NS.drawSkillIcon = function (ctx, x, y, R, sk, t = 0, opt = {}) {
    if (!sk) return;
    const g = gradeOf(sk);
    if (opt.grow) R *= NS.iconScale(sk);
    ctx.save();
    ctx.translate(x, y);
    if (g >= 4) { const k = 1 + Math.sin(t * 4) * 0.05; ctx.scale(k, k); }
    decoBack(ctx, R, g, t);
    if (sk.area === 'three') {
      for (const [dx, dy] of [[-0.85, 0.42], [0.85, 0.42]]) {
        ctx.save(); ctx.translate(dx * R, dy * R); drawBase(ctx, sk, R * 0.6, t); ctx.restore();
      }
      ctx.translate(0, -R * 0.18);
      drawBase(ctx, sk, R * 0.82, t);
    } else if (sk.area === 'all') {
      ring(ctx, R, false);
      drawBase(ctx, sk, R * 0.9, t);
      ring(ctx, R, true);
    } else {
      drawBase(ctx, sk, R, t);
    }
    decoFront(ctx, R, g, t);
    ctx.restore();
  };

  // アイコンの主な色 (アンテナの光り方に使う)
  NS.skillColor = function (sk) {
    if (!sk) return '#ffffff';
    if (sk.elem) return NS.ELEMENTS[sk.elem].color;
    if (sk.kind === 'buff') return STAT_COLOR[sk.stat] || '#ffd24a';
    if (sk.kind === 'charge') return '#ff9a3a';
    return { heal: '#ff9fb4', revive: '#ffd45a', buff: STAT_COLOR[sk.stat] || '#ffd24a', st_sleep: '#9fd0ff', st_poison: '#c08aff', st_shock: '#ffe14a', st_seal: '#ff7a7a', cure: '#7dffc4', de_spd: '#8a86a0', de_atk: '#c8c48a', de_def: '#e6e2f0', de_daru: '#ff6ab0', de_tatari: '#ff4fa8' }[sk.icon] || '#ffb0f0';
  };

  const cache = new Map();
  NS.skillIconURL = function (sk, size = 28) {
    const key = sk.key + '|' + size;
    if (cache.has(key)) return cache.get(key);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size * 2;
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    const g = gradeOf(sk);
    const fit = g >= 3 ? 1.75 : g >= 2 ? 1.4 : 1;
    NS.drawSkillIcon(ctx, size / 2, size / 2 - (sk.area === 'all' ? size * 0.05 : 0), (size * (sk.area === 'single' ? 0.36 : 0.3)) / fit * Math.min(1.25, NS.iconScale(sk)), sk, 0.6);
    const url = cv.toDataURL();
    if (!sk.img || (NS.pic && NS.pic(sk.img).naturalWidth)) cache.set(key, url); // 絵が まだ 読みこめて いなければ 覚えない
    return url;
  };
})();
