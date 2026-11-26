// 幻帝のどうくつ: 入るたびに 形が かわる ダンジョン (B1〜B5)
//   部屋と 通路を ランダムに つくり、見えない ところは まっくら (部屋に 入ると 見える)。
//   敵に ふれると バトル (HP・MP は 階を こえて 持ちこし)。宝箱・階段を さがして、B5 の ボスを たおすと 制覇。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const W = 35, H = 25; // 1階の 大きさ (マス)
  const WALL = 0, FLOOR = 1;

  // 階ごとの 敵: きばこうもり の むれ。[モンスター, HP の 倍率, ダメージの 倍率]・group = 1回の バトルの 数 [最小, 最大]・n = 地図の 敵の 数
  const FLOORS = [
    { foes: [['kibakoumori', 0.6, 0.5], ['butabanausagi', 0.6, 0.5]], group: [1, 2], n: 4 },
    { foes: [['kibakoumori', 0.8, 0.65], ['butabanausagi', 0.8, 0.65]], group: [1, 2], n: 5 },
    { foes: [['kibakoumori', 1.0, 0.8], ['butabanausagi', 1.0, 0.8]], group: [2, 3], n: 5 },
    { foes: [['kibakoumori', 1.2, 0.95], ['butabanausagi', 1.2, 0.95]], group: [2, 3], n: 6 },
    { foes: [['kibakoumori', 1.4, 1.1], ['butabanausagi', 1.4, 1.1]], group: [3, 3], n: 5, boss: ['maou', 1, 0.8] },
  ];
  const CLEAR_FAME = 3000; // 制覇の 名声
  const CHEST_GOLD = [120, 180]; // 宝箱の ゴールド (持ち帰り: 制覇したときだけ もらえる)
  const ANTENNA_RATE = 0.3, ANTENNA_MP = 20; // 宝箱の 3わりは アンテナパワー (みんなの MP +20)
  const REVIVE_RATE = 0.15, REVIVE_HP = 0.5; // 宝箱の 15% は ふっかつのくすり (持ち物に なる。たおれた なかまを HP 50% で 起こす)
  const ITEMS = { revive: { name: 'ふっかつのくすり', icon: '💊', desc: 'たおれた なかま 1人を HP 50% で ふっかつ' } };


  let run = null; // 今の もぐり
  const D = (NS.dungeon = {});
  D.state = () => run; // 検証用

  // ---------------- 地図を つくる ----------------
  function generate(floor, seed) {
    const rng = new NS.RNG(`cave:${seed}:${floor}`);
    const t = new Uint8Array(W * H);
    const at = (x, y) => t[y * W + x];
    const set = (x, y, v) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) t[y * W + x] = v; };
    const rooms = [];
    for (let i = 0; i < 80 && rooms.length < 9; i++) {
      const w = rng.int(4, 8), h = rng.int(3, 6), x = rng.int(1, W - w - 2), y = rng.int(1, H - h - 2);
      if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    }
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, FLOOR);
    // 通路: 部屋を 左から 順に つなぐ + ところどころ 輪に なる 道
    const dig = (a, b) => {
      let x = a.cx, y = a.cy;
      const hFirst = rng.next() < 0.5;
      const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); set(x, y, FLOOR); } };
      const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); set(x, y, FLOOR); } };
      if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    };
    const sorted = rooms.slice().sort((a, b) => a.cx - b.cx);
    for (let i = 1; i < sorted.length; i++) dig(sorted[i - 1], sorted[i]);
    for (let i = 0; i < 2; i++) dig(rng.pick(rooms), rng.pick(rooms));
    // 部屋の 番号 (どの マスが どの 部屋か)
    const roomAt = new Int16Array(W * H).fill(-1);
    rooms.forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomAt[y * W + x] = i; });
    // はじめの 部屋から いちばん 遠い 部屋に 階段 (B5 は ボス)
    const start = sorted[0];
    const dist = bfs(t, start.cx, start.cy);
    const far = rooms.slice().sort((a, b) => dist[b.cy * W + b.cx] - dist[a.cy * W + a.cx])[0];
    const F = FLOORS[floor - 1];
    const used = new Set([start.cy * W + start.cx, far.cy * W + far.cx]);
    const freeCell = (room, minD = 0) => {
      for (let i = 0; i < 40; i++) {
        const x = rng.int(room.x, room.x + room.w - 1), y = rng.int(room.y, room.y + room.h - 1), k = y * W + x;
        if (!used.has(k) && dist[k] >= minD) { used.add(k); return { x, y }; }
      }
      return null;
    };
    const others = rooms.filter((r) => r !== start);
    const chests = [];
    const nChest = rng.int(2, 4);
    for (let i = 0; i < nChest; i++) {
      const c = freeCell(rng.pick(others));
      if (!c) continue;
      const r = rng.next();
      chests.push(r < ANTENNA_RATE ? { x: c.x, y: c.y, mp: ANTENNA_MP, open: false } : r < ANTENNA_RATE + REVIVE_RATE ? { x: c.x, y: c.y, item: 'revive', open: false } : { x: c.x, y: c.y, gold: rng.int(CHEST_GOLD[0], CHEST_GOLD[1]), open: false });
    }
    const enemies = [];
    for (let i = 0; i < F.n; i++) {
      const c = freeCell(rng.pick(others), 7);
      if (!c) continue;
      const [key, hp, dm] = rng.pick(F.foes);
      enemies.push({ x: c.x, y: c.y, key, hp, dm, n: rng.int(F.group[0], F.group[1]), stun: 0, id: i });
    }
    if (F.boss) enemies.push({ x: far.cx, y: far.cy, n: 1, key: F.boss[0], hp: F.boss[1], dm: F.boss[2], boss: true, stun: 0, id: 99 });
    return {
      tiles: t, rooms, roomAt, seen: new Uint8Array(W * H), chests, enemies,
      stairs: F.boss ? null : { x: far.cx, y: far.cy }, start: { x: start.cx, y: start.cy },
      at,
    };
  }
  // 歩ける マスの きょり (幅優先)
  function bfs(t, sx, sy) {
    const d = new Int32Array(W * H).fill(1e9), q = [sy * W + sx];
    d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (y + dy) * W + x + dx;
        if (t[n] === FLOOR && d[n] > d[k] + 1) { d[n] = d[k] + 1; q.push(n); }
      }
    }
    return d;
  }

  // ---------------- はじめる・おわる ----------------
  function partyChars() { return run.party.map((k) => NS.ui.ch(k)); }
  // 入った ときに B1F〜B5F を ぜんぶ つくり、3D の 床・壁・なかまも 先に 用意する (その 間は 読みこみ画面)
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function start() {
    const save = NS.save;
    if (!save.party.length) { NS.ui.toast('パーティが いません。命名所で 編成しよう'); return; }
    if (loading) return;
    loading = true;
    NS.sfx('confirm');
    const steps = FLOORS.length + (NS.dungeon3d ? FLOORS.length + 1 : 0);
    let done = 0;
    const progress = (label) => { done++; showLoading(label, done / steps); };
    showLoading('どうくつを つくっています…', 0);
    await frame();
    const r = { seed: Date.now() % 1e9, floor: 0, party: save.party.slice(), state: [], loot: { fame: 0, gold: 0 }, items: {}, log: [], busy: false, maps: [] };
    for (let f = 1; f <= FLOORS.length; f++) { r.maps.push(generate(f, r.seed)); progress(`B${f}F の 地形を つくっています…`); await frame(); }
    run = r;
    run.state = partyChars().map((c) => ({ hp: c.stats.hp, mp: c.stats.mp }));
    if (NS.dungeon3d) await NS.dungeon3d.prepare(run, W, H, async (label) => { progress(label); await frame(); });
    hideLoading();
    loading = false;
    nextFloor();
  }
  let loading = false;
  function showLoading(label, p) {
    $('#scr-dungeon').classList.remove('playing');
    $('#dg-entry').innerHTML = `<div class="dg-card glass dg-loading"><h2>幻帝のどうくつ</h2><p>${esc(label)}</p><div class="dg-progress"><i style="width:${Math.round(p * 100)}%"></i></div></div>`;
  }
  function hideLoading() { $('#dg-entry').innerHTML = ''; }
  function nextFloor() {
    run.floor++;
    run.map = run.maps[run.floor - 1];
    run.p = Object.assign({}, run.map.start);
    run.pp = Object.assign({}, run.p); // 描く 位置 (なめらかに 動かす)
    lastTile = null;
    reveal();
    run.log = [];
    log(run.floor === FLOORS.length ? `B${run.floor}F ― 奥から ただならぬ 気配が する…` : `B${run.floor}F に おりた`);
    D.render();
  }
  function end(kind) {
    const save = NS.save, L = run.loot;
    let html;
    if (kind === 'clear') {
      const fame = L.fame + CLEAR_FAME;
      save.fame += fame;
      save.gold = (save.gold || 0) + L.gold;
      save.cave = save.cave || { clears: 0, best: 0 };
      save.cave.clears++;
      save.cave.best = FLOORS.length;
      html = `<h3>幻帝のどうくつ 制覇!</h3><p>最深部の ボスを たおした!</p>
        <div class="dg-sum">名声 <b>+${fame}</b> (制覇 ${CLEAR_FAME} ・ 敵を たおした ${L.fame})<br>💰 <b>${L.gold}G</b> を 持ち帰った (所持 ${save.gold}G)</div>`;
      NS.sfx('getItem');
    } else {
      save.cave = save.cave || { clears: 0, best: 0 };
      save.cave.best = Math.max(save.cave.best, run.floor);
      html = `<h3>${kind === 'wipe' ? '力つきた…' : 'どうくつから 引きかえした'}</h3><p>B${run.floor}F まで すすんだ。持ち帰る はずの ものは 失ってしまった…</p>`;
    }
    NS.ui.persist();
    run = null;
    if (NS.dungeon3d) NS.dungeon3d.reset();
    NS.ui.openModal(`${html}<div class="row reinc-actions"><button class="btn primary" data-act="close">とじる</button></div>`);
    D.render();
  }

  // ---------------- うごく (マスに しばられず 自由に) ----------------
  //   位置は 小数。マス (x, y) は x−0.5〜x+0.5 の 四角。壁には マス単位で ぶつかって、そって すべる
  const SPEED = 4.2, RAD = 0.28; // 歩く 速さ (マス/秒)・体の 半径
  // 敵: 見つけたら 5秒 追いかけて、そのあと 少し 休む (その間は 見つけない)
  const ENEMY = { walk: 1.4, chase: 3.3, see: 6, chaseSec: 5, rest: 2.5, touch: 0.62, bossTouch: 1.15 };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const walk = (x, y) => run.map.at(x, y) === FLOOR;
  const tileOf = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  const free = (x, y, r) => walk(Math.round(x - r), Math.round(y - r)) && walk(Math.round(x + r), Math.round(y - r)) && walk(Math.round(x - r), Math.round(y + r)) && walk(Math.round(x + r), Math.round(y + r));
  function slide(p, dx, dy, r) { if (free(p.x + dx, p.y, r)) p.x += dx; if (free(p.x, p.y + dy, r)) p.y += dy; }
  function reveal() {
    const m = run.map, { x, y } = tileOf(run.p), r = m.roomAt[y * W + x];
    const mark = (a, b) => { if (a >= 0 && b >= 0 && a < W && b < H) m.seen[b * W + a] = 1; };
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) mark(x + dx, y + dy);
    if (r >= 0) { const R = m.rooms[r]; for (let b = R.y - 1; b <= R.y + R.h; b++) for (let a = R.x - 1; a <= R.x + R.w; a++) mark(a, b); }
  }
  // 今 見えている ところ (同じ 部屋 か 近く)
  function visible(x, y) {
    const m = run.map, p = tileOf(run.p), r = m.roomAt[p.y * W + p.x];
    x = Math.round(x); y = Math.round(y);
    if (Math.abs(x - p.x) <= 3 && Math.abs(y - p.y) <= 3) return true;
    if (r < 0) return false;
    const R = m.rooms[r];
    return x >= R.x - 1 && x <= R.x + R.w && y >= R.y - 1 && y <= R.y + R.h;
  }
  // 敵の 前 (向いている ほう ±60°) に いるか
  function facing(e, p) {
    const a = Math.atan2(p.x - e.x, p.y - e.y), d = Math.atan2(Math.sin(a - (e.dir || 0)), Math.cos(a - (e.dir || 0)));
    return Math.abs(d) < Math.PI / 3;
  }
  // 見通し (あいだに 壁が ないか)
  function sight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, n = Math.ceil(Math.hypot(dx, dy) * 3);
    for (let i = 1; i < n; i++) if (!walk(Math.round(a.x + (dx * i) / n), Math.round(a.y + (dy * i) / n))) return false;
    return true;
  }
  let lastTile = null, distField = null;
  // 毎フレーム: 自分と 敵を 動かす
  function tick(dt) {
    if (!run || !run.map || run.busy || NS.ui.current() !== 'dungeon' || !$('#modal').classList.contains('hidden')) { if (run) run.moving = false; return; }
    const [ix, iy] = inputDir(), il = Math.hypot(ix, iy);
    run.moving = il > 0.01;
    if (run.moving) {
      slide(run.p, (ix / il) * SPEED * dt, (iy / il) * SPEED * dt, RAD);
      if (Math.abs(ix) > 0.01) run.face = Math.sign(ix);
    }
    const tp = tileOf(run.p);
    if (!lastTile || tp.x !== lastTile.x || tp.y !== lastTile.y) { // 新しい マスに 入った
      lastTile = tp;
      reveal();
      distField = bfs(run.map.tiles, tp.x, tp.y);
      const ch = run.map.chests.find((c) => !c.open && c.x === tp.x && c.y === tp.y);
      if (ch) { openChest(ch); D.render(); }
      const st = run.map.stairs;
      if (st && st.x === tp.x && st.y === tp.y) { askStairs(); return; }
    }
    for (const e of run.map.enemies) {
      const d = Math.hypot(e.x - run.p.x, e.y - run.p.y);
      if (e.boss) { if (d < ENEMY.bossTouch) { fight(e); return; } continue; } // ボスは 動かない
      if (e.stun > 0) { e.stun -= dt; continue; }
      e.rest = Math.max(0, (e.rest || 0) - dt);
      if (e.chase > 0) { e.chase -= dt; if (e.chase <= 0) e.rest = ENEMY.rest; }
      else if (!e.rest && d < ENEMY.see && facing(e, run.p) && sight(e, run.p)) { e.chase = ENEMY.chaseSec; NS.sfx('status'); } // 前を 向いていて 見つけた!
      let tx, ty, sp;
      if (e.chase > 0) {
        sp = ENEMY.chase;
        if (sight(e, run.p)) { tx = run.p.x; ty = run.p.y; }
        else { // 見えなくなったら 道を たどって 追う
          const et = tileOf(e);
          let best = null, bd = distField[et.y * W + et.x];
          for (const [a, b] of DIRS) { const k = (et.y + b) * W + et.x + a; if (distField[k] < bd) { bd = distField[k]; best = { x: et.x + a, y: et.y + b }; } }
          tx = best ? best.x : run.p.x; ty = best ? best.y : run.p.y;
        }
      } else { // うろうろ (となりの マスへ 歩いたり 立ちどまったり)
        sp = ENEMY.walk;
        e.goalT = (e.goalT || 0) - dt;
        if (!e.goal || e.goalT <= 0 || Math.hypot(e.goal.x - e.x, e.goal.y - e.y) < 0.05) {
          const et = tileOf(e), opts = DIRS.map(([a, b]) => ({ x: et.x + a, y: et.y + b })).filter((p) => walk(p.x, p.y));
          e.goal = Math.random() < 0.35 || !opts.length ? et : opts[Math.floor(Math.random() * opts.length)];
          e.goalT = 1.2 + Math.random() * 1.5;
        }
        tx = e.goal.x; ty = e.goal.y;
      }
      const vx = tx - e.x, vy = ty - e.y, l = Math.hypot(vx, vy);
      if (l > 1e-3) { const k = Math.min(l, sp * dt) / l; slide(e, vx * k, vy * k, 0.25); e.dir = Math.atan2(vx, vy); } // 進む ほうを 向く
      else if (e.chase <= 0 && Math.random() < dt * 0.6) e.dir = (e.dir || 0) + (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2; // 立ちどまって きょろきょろ
      if (Math.hypot(e.x - run.p.x, e.y - run.p.y) < ENEMY.touch) { fight(e); return; }
    }
  }
  D.visible = (x, y) => (run ? visible(x, y) : false);
  function openChest(c) {
    c.open = true;
    NS.sfx('rare');
    if (c.mp) { // アンテナパワー: その場で みんなの MP が 回復
      const cs = partyChars();
      run.state.forEach((s, i) => { s.mp = Math.min(cs[i].stats.mp, s.mp + c.mp); });
      log(`宝箱を あけた! 📡 アンテナパワー ― みんなの MP が ${c.mp} 回復`);
      D.render();
      return;
    }
    if (c.item) { // 持ち物に なる (左下から いつでも 使える)
      run.items[c.item] = (run.items[c.item] || 0) + 1;
      log(`宝箱を あけた! ${ITEMS[c.item].icon} ${ITEMS[c.item].name} を 手に入れた`);
      D.render();
      return;
    }
    run.loot.gold += c.gold;
    log(`宝箱を あけた! 💰 ${c.gold}G を 手に入れた`);
  }
  function askStairs() {
    NS.ui.openModal(`<h3>階段を 見つけた</h3><p>B${run.floor + 1}F へ おりる? (HP・MP は そのまま)</p>
      <div class="row reinc-actions"><button class="btn primary" data-dg-act="down">おりる</button><button class="btn" data-act="close">まだ さがす</button></div>`);
  }

  // ---------------- バトル ----------------
  function fight(e) {
    run.busy = true;
    run.fighting = e;
    const M = NS.MONSTERS[e.key], n = e.n || 1;
    const foes = Array.from({ length: n }, (_, i) => {
      const c = NS.makeMonster(e.key);
      c.stats.hp = Math.round(c.stats.hp * e.hp);
      c.hpMul = e.hp; c.dmgMul = e.dm;
      if (n > 1) c.name = M.name + 'ABC'[i]; // きばこうもりA・B・C
      return c;
    });
    NS.sfx('confirm');
    NS.ui.startBattle(foes, { kind: 'dungeon', monster: e.key, boss: !!e.boss, title: `幻帝のどうくつ B${run.floor}F`, intro: e.boss ? M.intro : n > 1 ? `${M.name}が ${n}ひき あらわれた!` : `${M.name}が あらわれた!`, partyState: run.state.map((s) => Object.assign({}, s)) });
  }
  D.afterBattle = function (result, b) {
    if (!run) return;
    run.busy = false;
    const e = run.fighting;
    run.fighting = null;
    run.state = b.party.map((u) => ({ hp: u.alive ? u.hp : 0, mp: u.mp }));
    if (result === 'win') {
      run.map.enemies = run.map.enemies.filter((x) => x !== e);
      const f = 40 * run.floor * (e.n || 1);
      run.loot.fame += f;
      log(`${NS.MONSTERS[e.key].name}を たおした! (名声 +${f} ・ 持ち帰り)`);
      if (e.boss) { end('clear'); return; }
    } else if (result === 'escape') {
      e.stun = 3; e.chase = 0; e.rest = ENEMY.rest + 3;
      log('にげだした! (敵は しばらく 動けない)');
    } else { end('wipe'); return; }
    D.render();
  };

  // ---------------- どうくつの 中で 使える スキル (かいふく・ふっかつ) ----------------
  function fieldSkill(c, i) {
    const sk = c.skill;
    if (!sk || !['heal', 'revive'].includes(sk.kind)) return null;
    const cs = partyChars(), st = run.state, me = st[i], cost = Math.min(NS.mpCost(c, sk), c.stats.mp);
    const hurt = st.some((s, j) => s.hp > 0 && s.hp < cs[j].stats.hp), down = st.some((s) => s.hp <= 0);
    const why = me.hp <= 0 ? 'たおれている' : me.mp < cost ? 'MP が たりない' : sk.kind === 'heal' && !hurt ? 'HP が へっている なかまが いない' : sk.kind === 'revive' && !down ? 'たおれた なかまが いない' : '';
    return { ok: !why, why: why || `${NS.skillDesc ? NS.skillDesc(sk) : sk.name}`, cost };
  }
  // 持ち物を 使う (ふっかつのくすり: 最初に たおれた なかまを HP 50% で 起こす)
  function useItem(k) {
    if (!(run.items[k] > 0)) return;
    const cs = partyChars(), j = run.state.findIndex((s) => s.hp <= 0);
    if (k === 'revive') {
      if (j < 0) return;
      run.state[j].hp = Math.max(1, Math.round(cs[j].stats.hp * REVIVE_HP));
      log(`💊 ふっかつのくすり を 使った! ${cs[j].name}が 起きあがった`);
    }
    run.items[k]--;
    if (!run.items[k]) delete run.items[k];
    NS.sfx('heal');
    D.render();
  }
  function useFieldSkill(i) {
    const cs = partyChars(), c = cs[i], sk = c.skill, F = fieldSkill(c, i);
    if (!F || !F.ok) return;
    const st = run.state;
    st[i].mp -= F.cost;
    const healOf = (j) => (sk.full ? cs[j].stats.hp : sk.frac ? Math.round(cs[j].stats.hp * sk.frac) : Math.round(sk.power * (0.85 + NS.healMp(c) / 110)));
    let targets;
    if (sk.kind === 'heal') {
      const alive = st.map((s, j) => j).filter((j) => st[j].hp > 0);
      targets = sk.tgt === 'allies' ? alive : [alive.sort((a, b) => st[a].hp / cs[a].stats.hp - st[b].hp / cs[b].stats.hp)[0]]; // 1体なら いちばん 弱っている なかま
      for (const j of targets) st[j].hp = Math.min(cs[j].stats.hp, st[j].hp + healOf(j));
    } else {
      const dead = st.map((s, j) => j).filter((j) => st[j].hp <= 0);
      targets = sk.tgt === 'deadAllies' ? dead : [dead[0]];
      for (const j of targets) st[j].hp = Math.max(1, Math.round(cs[j].stats.hp * sk.power));
    }
    NS.sfx('heal');
    log(`${c.name}の ${sk.name}! ${targets.length === 1 ? cs[targets[0]].name + 'が' : 'みんなが'} ${sk.kind === 'heal' ? '回復した' : '起きあがった'}`);
    D.render();
  }

  // ---------------- 画面 ----------------
  function log(text) { if (!run) return; run.log.unshift(text); run.log.length = Math.min(run.log.length, 3); }
  D.render = function () {
    const entry = $('#dg-entry');
    $('#scr-dungeon').classList.toggle('playing', !!run);
    if (!run) {
      const c = NS.save.cave || { clears: 0, best: 0 };
      entry.innerHTML = `<div class="dg-card glass"><h2>幻帝のどうくつ</h2>
        <p>入るたびに 形が かわる どうくつ。B1F から B${FLOORS.length}F の 最深部を めざそう。</p>
        <ul class="dg-rules">
          <li>部屋に 入ると 中が 見える。<b>階段</b>を 見つけて 下の 階へ</li>
          <li>敵に ふれると バトル。<b>HP・MP は 持ちこし</b> (たおれた なかまは たおれたまま)</li>
          <li><b>宝箱</b>には ゴールド (${CHEST_GOLD[0]}〜${CHEST_GOLD[1]}G) か 📡アンテナパワー (みんなの MP +${ANTENNA_MP})。ゴールドと 敵を たおした 名声は <b>制覇したときだけ</b> 持ち帰れる</li>
          <li>左下の なかまの <b>かいふく・ふっかつ</b> スキルは どうくつの 中でも 使える</li>
          <li>宝箱から 💊<b>ふっかつのくすり</b> が 出ることも。左下の 持ち物から いつでも 使える (たおれた なかまを HP 50% で ふっかつ)</li>
          <li>B${FLOORS.length}F の ボスを たおすと 制覇 (名声 +${CLEAR_FAME})。全滅・あきらめると 持ち物は なくなる</li>
          <li>うごかしかた: 矢印キー / WASD ・ 画面の ボタン ・ 行きたい ほうを タップ</li>
        </ul>
        <p class="hint">パーティ ${NS.save.party.length}人 ・ 所持 💰${NS.save.gold || 0}G ・ 制覇 ${c.clears}回 ・ 最高 B${c.best}F</p>
        <div class="row"><button class="btn primary big" data-dg-act="start">どうくつに 入る</button><button class="btn" data-go="title">◀ もどる</button></div></div>`;
      return;
    }
    entry.innerHTML = '';
    $('#dg-floor').textContent = `幻帝のどうくつ B${run.floor}F`;
    const L = run.loot;
    $('#dg-loot').textContent = `持ち物: 💰${L.gold}G ・ 名声 ${L.fame}`;
    const cs = partyChars();
    const down = run.state.some((s) => s.hp <= 0);
    const items = Object.keys(run.items).filter((k) => run.items[k] > 0).map((k) => {
      const ok = k !== 'revive' || down;
      return `<button class="dg-item" data-dg-item="${k}" ${ok ? '' : 'disabled'} title="${esc(ITEMS[k].desc)}${ok ? '' : ' (たおれた なかまが いない)'}">${ITEMS[k].icon} ${esc(ITEMS[k].name)} <b>×${run.items[k]}</b></button>`;
    }).join('');
    $('#dg-party').innerHTML = (items ? `<div class="dg-items">${items}</div>` : '') + cs.map((c, i) => {
      const s = run.state[i], p = Math.max(0, s.hp / c.stats.hp) * 100;
      const sk = fieldSkill(c, i);
      return `<div class="dg-pm ${s.hp <= 0 ? 'down' : ''}"><img src="${NS.portrait(c, 28)}" alt=""><div><b>${esc(c.name)}</b>${sk ? `<button class="dg-skill" data-dg-skill="${i}" ${sk.ok ? '' : 'disabled'} title="${esc(sk.why)}">✚ ${esc(c.skill.name)} <small>MP${Math.min(NS.mpCost(c, c.skill), c.stats.mp)}</small></button>` : ''}<span class="dg-bar"><i style="width:${p}%;background:${p < 30 ? '#ff6a5a' : p < 60 ? '#ffd24a' : '#6fe08a'}"></i></span><small>HP ${s.hp}/${c.stats.hp}${c.stats.mp ? ` ・ MP ${s.mp}` : ''}</small></div></div>`;
    }).join('');
    $('#dg-log').innerHTML = run.log.map((t, i) => `<div style="opacity:${1 - i * 0.3}">${esc(t)}</div>`).join('');
  };

  // ---------------- 地図を 描く ----------------
  const cv = $('#dg-canvas'), ctx = cv.getContext('2d');
  const headCache = new Map();
  function iconOf(key, draw) {
    if (headCache.has(key)) return headCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 96;
    draw(c.getContext('2d'));
    headCache.set(key, c);
    return c;
  }
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 0xffff; };
  function draw(t) {
    if (!run || !run.map || NS.ui.current() !== 'dungeon') return;
    const dpr = Math.min(2, devicePixelRatio || 1), cw = cv.clientWidth, chh = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(chh * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = run.map, st = run.map.stairs;
    if (NS.dungeon3d) { // 3D の どうくつ (Three.js)。この キャンバスには 小さな 地図だけ
      ctx.clearRect(0, 0, cw, chh);
      NS.dungeon3d.draw(run, t, W, H, visible);
      miniMap(cw, t);
      return;
    }
    ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, cw, chh);
    const T = Math.round(Math.max(30, Math.min(56, Math.min(cw / 15, chh / 11))));
    // 自分の 位置は なめらかに
    run.pp.x = run.p.x; run.pp.y = run.p.y;
    const ox = cw / 2 - (run.pp.x + 0.5) * T, oy = chh / 2 - (run.pp.y + 0.5) * T;
    const x0 = Math.max(0, Math.floor(-ox / T) - 1), x1 = Math.min(W - 1, Math.ceil((cw - ox) / T) + 1);
    const y0 = Math.max(0, Math.floor(-oy / T) - 1), y1 = Math.min(H - 1, Math.ceil((chh - oy) / T) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!m.seen[y * W + x]) continue;
      const px = ox + x * T, py = oy + y * T, n = hash(x, y);
      if (m.at(x, y) === FLOOR) {
        ctx.fillStyle = `hsl(28, 18%, ${24 + n * 7}%)`; ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
        if (n > 0.8) { ctx.fillStyle = 'rgba(255,240,210,0.08)'; ctx.beginPath(); ctx.arc(px + T * hash(y, x), py + T * n, T * 0.08, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.fillStyle = `hsl(265, 14%, ${11 + n * 5}%)`; ctx.fillRect(px, py, T, T);
        if (y + 1 < H && m.at(x, y + 1) === FLOOR) { ctx.fillStyle = 'rgba(160,140,190,0.35)'; ctx.fillRect(px, py + T * 0.78, T, T * 0.22); } // 岩の 面
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + T * 0.15, py + T * 0.15, T * 0.3 * n, T * 0.08);
      }
    }
    // 階段
    if (st && m.seen[st.y * W + st.x]) {
      const px = ox + st.x * T, py = oy + st.y * T;
      ctx.fillStyle = '#120e16'; ctx.fillRect(px + T * 0.1, py + T * 0.1, T * 0.8, T * 0.8);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = `hsl(30, 15%, ${48 - i * 9}%)`; ctx.fillRect(px + T * (0.12 + i * 0.07), py + T * (0.14 + i * 0.18), T * (0.76 - i * 0.14), T * 0.13); }
    }
    // 宝箱
    for (const c of m.chests) {
      if (!m.seen[c.y * W + c.x]) continue;
      const px = ox + c.x * T, py = oy + c.y * T;
      ctx.fillStyle = c.open ? '#5a3a22' : '#8a5a2e'; ctx.fillRect(px + T * 0.18, py + T * 0.38, T * 0.64, T * 0.42);
      ctx.fillStyle = c.open ? '#3a2414' : '#a8703a'; ctx.fillRect(px + T * 0.16, py + T * (c.open ? 0.2 : 0.26), T * 0.68, T * 0.16);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(px + T * 0.18, py + T * 0.5, T * 0.64, T * 0.05); ctx.fillRect(px + T * 0.45, py + T * 0.44, T * 0.1, T * 0.14);
      if (!c.open) { ctx.fillStyle = `rgba(255,230,120,${0.25 + Math.sin(t * 4 + c.x) * 0.15})`; ctx.beginPath(); ctx.arc(px + T * 0.5, py + T * 0.5, T * 0.45, 0, Math.PI * 2); ctx.fill(); }
    }
    // 敵 (見えている ときだけ)
    for (const e of m.enemies) {
      if (!m.seen[Math.round(e.y) * W + Math.round(e.x)]) continue; // 地形が 見えていれば 遠くても 見える
      const px = ox + e.x * T, py = oy + e.y * T, s = e.boss ? 1.5 : 1, bob = Math.sin(t * 5 + e.id) * T * 0.04;
      if (e.boss) { const g = ctx.createRadialGradient(px + T / 2, py + T / 2, 2, px + T / 2, py + T / 2, T * 1.3); g.addColorStop(0, `rgba(255,40,70,${0.45 + Math.sin(t * 3) * 0.15})`); g.addColorStop(1, 'rgba(255,40,70,0)'); ctx.fillStyle = g; ctx.fillRect(px - T, py - T, T * 3, T * 3); }
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(px + T / 2, py + T * 0.86, T * 0.32 * s, T * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      const img = iconOf('m:' + e.key, (c) => NS.drawMonsterHead(c, 48, 50, 58, NS.makeMonster(e.key), {}));
      ctx.drawImage(img, px + T / 2 - T * 0.55 * s, py + T * 0.42 - T * 0.6 * s + bob, T * 1.1 * s, T * 1.1 * s);
      if (e.chase > 0) { ctx.font = `900 ${T * 0.5}px sans-serif`; ctx.fillStyle = '#ff4a4a'; ctx.fillText('!', px + T * 0.42, py - T * 0.1); }
      if (e.stun > 0) { ctx.font = `${T * 0.35}px sans-serif`; ctx.fillText('💫', px + T * 0.6, py + T * 0.1); }
    }
    // 自分 (パーティの 先頭)
    {
      const lead = partyChars()[run.state.findIndex((s) => s.hp > 0)] || partyChars()[0];
      const px = ox + run.pp.x * T, py = oy + run.pp.y * T, hop = Math.abs(Math.sin(t * 6)) * T * 0.05;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(px + T / 2, py + T * 0.86, T * 0.3, T * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      const img = iconOf('p:' + lead.key + NS.equipKeys(lead.equips).join(','), (c) => NS.drawHeadOnly(c, 48, 56, 66, lead, {}));
      ctx.save(); ctx.translate(px + T / 2, 0); ctx.scale(run.face || 1, 1);
      ctx.drawImage(img, -T * 0.68, py + T * 0.3 - T * 0.72 - hop, T * 1.36, T * 1.36);
      ctx.restore();
    }
    // たいまつの 明かり (まわりほど 暗い)
    const g = ctx.createRadialGradient(cw / 2, chh / 2, T * 2.2, cw / 2, chh / 2, Math.max(cw, chh) * 0.62);
    g.addColorStop(0, 'rgba(7,6,10,0)'); g.addColorStop(1, 'rgba(7,6,10,0.88)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, chh);
    miniMap(cw, t);
  }
  // 小さな 地図 (右上)
  function miniMap(cw, t) {
    const m = run.map, st = m.stairs;
    const s = Math.max(3, Math.min(5, Math.floor(cw / 170))), mx = cw - W * s - 12, my = 56;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(mx - 4, my - 4, W * s + 8, H * s + 8);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.seen[y * W + x] && m.at(x, y) === FLOOR) { ctx.fillStyle = 'rgba(220,200,170,0.7)'; ctx.fillRect(mx + x * s, my + y * s, s, s); }
    if (st && m.seen[st.y * W + st.x]) { ctx.fillStyle = '#6ab8ff'; ctx.fillRect(mx + st.x * s - 1, my + st.y * s - 1, s + 2, s + 2); }
    for (const e of m.enemies) if (e.boss && m.seen[e.y * W + e.x]) { ctx.fillStyle = '#ff3a5a'; ctx.fillRect(mx + e.x * s - 1, my + e.y * s - 1, s + 2, s + 2); }
    if (Math.sin(t * 8) > -0.3) { ctx.fillStyle = '#ffe04a'; ctx.fillRect(mx + run.p.x * s - 1, my + run.p.y * s - 1, s + 2, s + 2); }
  }
  let lastMs = 0;
  const loop = (ms) => { const dt = Math.min(0.05, Math.max(0, (ms - lastMs) / 1000)); lastMs = ms; tick(dt); draw(ms / 1000); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  // ---------------- 入力 (押している 間 ずっと 歩く・ななめも) ----------------
  const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  const keyOf = (k) => (k.length === 1 ? k.toLowerCase() : k);
  const held = new Set();
  let padDir = null, pointerDir = null;
  function inputDir() {
    let x = 0, y = 0;
    for (const k of held) { x += KEYS[k][0]; y += KEYS[k][1]; }
    if (padDir) { x += padDir[0]; y += padDir[1]; }
    if (pointerDir) { x += pointerDir[0]; y += pointerDir[1]; }
    return [x, y];
  }
  document.addEventListener('keydown', (e) => {
    const k = keyOf(e.key);
    if (NS.ui.current() !== 'dungeon' || !KEYS[k] || (e.target.closest && e.target.closest('input, textarea'))) return;
    e.preventDefault();
    held.add(k);
  });
  document.addEventListener('keyup', (e) => held.delete(keyOf(e.key)));
  window.addEventListener('blur', () => { held.clear(); padDir = null; pointerDir = null; });
  // 画面の ボタン
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-dg]');
    if (b) padDir = b.dataset.dg.split(',').map(Number);
  });
  const release = () => { padDir = null; pointerDir = null; };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  // 画面を おさえた ほうへ 歩く (なぞると 向きが かわる)
  const aim = (e) => {
    const r = cv.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, l = Math.hypot(dx, dy);
    pointerDir = l < 14 ? null : [dx / l, dy / l];
  };
  cv.addEventListener('pointerdown', (e) => { if (run) aim(e); });
  cv.addEventListener('pointermove', (e) => { if (pointerDir && e.buttons) aim(e); });
  document.addEventListener('click', (e) => {
    const it = e.target.closest('[data-dg-item]');
    if (it && run && !run.busy) { useItem(it.dataset.dgItem); return; }
    const sb = e.target.closest('[data-dg-skill]');
    if (sb && run && !run.busy) { useFieldSkill(+sb.dataset.dgSkill); return; }
    const a = e.target.closest('[data-dg-act]');
    if (a) {
      const act = a.dataset.dgAct;
      if (act === 'start') start();
      if (act === 'down') { NS.ui.closeModal(); NS.sfx('confirm'); nextFloor(); }
      if (act === 'giveup') { NS.ui.closeModal(); end('giveup'); }
      return;
    }
    if (e.target.closest('#dg-quit')) {
      if (!run) { NS.ui.show('title'); return; }
      NS.ui.openModal(`<h3>あきらめる?</h3><p>どうくつから 出ると、持ち帰る はずの ものは なくなります。</p>
        <div class="row reinc-actions"><button class="btn danger" data-dg-act="giveup">あきらめて 出る</button><button class="btn" data-act="close">つづける</button></div>`);
    }
  });
})();
