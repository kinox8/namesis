// オンライン対戦: ログイン・ロビー (部屋をつくる / 入る)・対戦中の コマンドのやりとり
// バトルの計算は それぞれの画面で行う。2人に 同じシードと 両方のパーティが 配られ、毎ターン コマンドだけを やりとりする。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const net = NS.net;
  const O = (NS.online = { room: null });
  const TURN_LIMIT = 60; // コマンドを えらぶ 制限時間 (秒)。過ぎたら がんばれ で動く
  O.TURN_LIMIT = TURN_LIMIT;

  // ---------------- パーティを 送れる形にする ----------------
  // 格の ボーナス (pb) と 装備 (e) も つける (リアルタイム対戦でも 効く。サーバーが 持っている 数で しらべなおす)
  function partySpec(key) {
    const spec = baseSpec(key);
    const pb = NS.save.potBonus && Number(NS.save.potBonus[key]);
    if (pb > 0) spec.pb = Math.min(0.5, Math.round(pb * 100) / 100);
    const e = NS.equipKeys(NS.save.equip && NS.save.equip[key]);
    if (e.length) spec.e = e;
    const gb = NS.save.geneBonus && NS.save.geneBonus[key];
    if (gb && Object.keys(gb).length) spec.g = gb; // 遺伝子の ボーナス
    return spec;
  }
  function baseSpec(key) {
    if (!NS.isSpecial(key)) return { n: key };
    const [kind, a, b] = key.slice(1).split(':');
    if (kind === 'boss') return { b: `${a}:${b}` };
    return { k: NS.kids[a] };
  }

  // 受けとった 出生の子は 値を 安全な範囲に そろえる
  const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  function cleanKid(d) {
    d = d && typeof d === 'object' ? d : {};
    const name = NS.normalizeName(String(d.name || 'こ')) || 'こ';
    const genes = { eva: 0.5 };
    for (const k of ['hp', 'mp', 'atk', 'def', 'spd']) genes[k] = num(d.genes && d.genes[k], 0, 1.35, 0.5);
    let skill = null;
    if (typeof d.skill === 'string') { try { NS.skillByKey(d.skill); skill = d.skill; } catch (e) { /* 知らないスキル */ } }
    const color = oneOf(d.color, NS.COLOR_KEYS, 'black');
    const head = oneOf(d.head, NS.HEADS.map((h) => h.key), 'round');
    const body = oneOf(d.body, Object.keys(NS.BODY), 'normal');
    const eva = oneOf(d.eva, Object.keys(NS.HEIGHTS).map(Number), 10);
    // 見た目: 同じ形の値だけ 受けとる (それ以外は 名前から作った見た目)
    const look = Object.assign({}, NS.makeCharacter(name).look);
    const L = d.look && typeof d.look === 'object' ? d.look : {};
    for (const k in look) {
      const v = L[k], cur = look[k];
      if (Array.isArray(cur)) {
        if (Array.isArray(v) && v.length <= 16 && v.every((p) => p && ['th', 'ph', 's', 'c', 'a'].every((q) => typeof p[q] === 'number'))) look[k] = v;
      } else if (v === null || (typeof v === typeof cur && (typeof v !== 'string' || v.length <= 24))) look[k] = v;
    }
    const H = NS.HEIGHTS[eva], B = NS.BODY[body];
    look.h = H.size; look.w = B.w; look.leg = H.leg; look.torso = H.torso * B.torso;
    const parents = Array.isArray(d.parentNames) ? d.parentNames.slice(0, 2).map((x) => String(x).slice(0, 12)) : ['?', '?'];
    return { name, color, head, body, eva, genes, pot: num(d.pot, 1, 1.5, 1), skill, look, parentNames: parents, gen: Math.round(num(d.gen, 2, 99, 2)), aura: !!d.aura };
  }

  // 受けとった パーティから 個体を作る。自分のパーティも 同じ手順で作るので、2人の画面で 能力が かならず そろう
  function hashText(t) {
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = (h * 33 + t.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  // 格の ボーナス (転生・格の宝玉) と 服 も オンラインで 効く (2人の画面で 同じ 計算)
  function charFromSpec(spec, i, tag) {
    let c = baseFromSpec(spec);
    if (!c) return NS.makeCharacter('ななし');
    try {
      const pb = num(spec.pb, 0, 0.5, 0);
      if (spec.g && typeof spec.g === 'object') { // 遺伝子の ボーナス (それぞれ 0.5 まで)
        const gb = {};
        for (const k of NS.GENE_KEYS) { const v = num(spec.g[k], 0, 0.5, 0); if (v) gb[k] = v; }
        c = NS.withGeneBonus(c, gb);
      }
      if (pb) c = NS.withPotBonus(c, pb);
      if (spec.e) c = NS.withEquip(c, NS.equipKeys([].concat(spec.e).filter((k) => typeof k === 'string')).slice(0, 4));
    } catch (e) { /* こわれた データ */ }
    return c;
  }
  function baseFromSpec(spec) {
    try {
      if (spec.n) return NS.makeCharacter(spec.n);
      if (spec.b) {
        const [p, j] = spec.b.split(':');
        if (NS.BOSS_PARTIES[p] && NS.BOSS_PARTIES[p].members[+j]) return NS.charOf(NS.bossKey(p, +j));
      }
      if (spec.k) return NS.makeChild(cleanKid(spec.k), `online:${hashText(JSON.stringify(spec.k))}`); // 同じ記録なら 同じキー (絵の作りおき用)
    } catch (e) { /* こわれた データ */ }
    return NS.makeCharacter('ななし');
  }

  function summary(keys) {
    const cs = keys.map((k) => NS.charOf(k));
    const best = cs.slice().sort((a, b) => b.score - a.score)[0];
    return { n: cs.length, best: best ? best.name : '', rank: best ? best.rank : '', score: best ? best.score : 0 };
  }

  // ---------------- コマンドの やりとり ----------------
  // 送るときは 自分から見た向き (0 = 自分の側 / 1 = あいての側)
  function serialize(cmds) {
    const out = [];
    for (const [u, c] of cmds) {
      if (u.side !== 'party') continue;
      out.push({ u: u.idx, t: c.type, g: c.group ? 1 : 0, tg: c.target ? [c.target.side === 'party' ? 0 : 1, c.target.idx] : null });
    }
    return out;
  }
  function deserialize(battle, list) {
    const m = new Map();
    for (const c of list || []) {
      const u = battle.enemies[c.u];
      if (!u) continue;
      const target = Array.isArray(c.tg) ? (c.tg[0] === 0 ? battle.enemies : battle.party)[c.tg[1]] || null : null;
      let type = ['attack', 'guard', 'skill'].includes(c.t) ? c.t : 'attack';
      if (type === 'skill' && !u.ch.skill) type = 'attack';
      m.set(u, { type, target, group: !!c.g, skill: type === 'skill' ? u.ch.skill : undefined });
    }
    return m;
  }
  // 2人の画面が 同じ状態か 確かめるための しるし
  function checksum(battle) {
    let h = 0;
    for (const u of battle.units) h = (h * 31 + u.hp * 7 + u.mp * 3 + Object.keys(u.status).length + (u.alive ? 1 : 0)) % 1000000007;
    return String(h);
  }

  function makeLink(view) {
    // ping: つながっている しるし。あいて (ゲスト) は ホストの バトルの 速さも ここで 受けとる
    const host = view.role === 'p1';
    const gotSpeed = (s) => { s = Math.round(Number(s)); if (!host && s >= 1 && s <= 3 && s !== link.speed) { link.speed = s; NS.ui.syncSpeed(); } };
    const ping = setInterval(() => net.api('POST', '/api/battle/ping', { id: view.id }).then((d) => d && gotSpeed(d.speed)).catch(() => {}), host ? 15000 : 3000);
    // 対戦中に ページを とじる・読みこみ直す と 対戦から ぬける (負け。あいては NPC と たたかう)
    const onLeave = () => { try { navigator.sendBeacon('/api/battle/leave', JSON.stringify({ id: view.id })); } catch (e) { /* noop */ } };
    window.addEventListener('pagehide', onLeave);
    const done = () => { clearInterval(ping); window.removeEventListener('pagehide', onLeave); };
    const link = {
      role: view.role, foeName: view.foe.name, host, speed: Math.round(Number(view.speed)) || 1,
      setSpeed(s) { if (host) net.api('POST', '/api/battle/speed', { id: view.id, speed: s }).catch(() => {}); },
      async exchange(battle, cmds) {
        NS.ui.message('あいての 指示を まっています…');
        let r;
        try {
          const body = { id: view.id, turn: battle.turn, cmds: serialize(cmds), chk: checksum(battle) };
          r = await net.retry(() => net.api('POST', '/api/battle/cmd', body));
          while (r.status === 'wait') r = await net.retry(() => net.api('GET', `/api/battle/poll?id=${view.id}&turn=${battle.turn}`));
        } catch (e) {
          NS.ui.message('');
          return { end: 'error', reason: 'error' };
        }
        NS.ui.message('');
        if (r.desync) console.warn('NAMESIS: 2人の画面の 状態が ずれている');
        gotSpeed(r.speed);
        if (r.status === 'end') return { end: r.result, reason: r.reason };
        if (r.status === 'npc') return { npc: true };
        return { cmds: deserialize(battle, r.foe) };
      },
      async surrender() { await net.api('POST', '/api/battle/surrender', { id: view.id }).catch(() => {}); },
      async report(result) {
        done();
        if (!['win', 'lose', 'draw'].includes(result)) return;
        try { const d = await net.api('POST', '/api/battle/result', { id: view.id, result }); if (d.user) net.user = d.user; } catch (e) { /* noop */ }
      },
      stop() { done(); },
    };
    return link;
  }

  function begin(view) {
    O.room = null;
    stopPolling();
    const mine = view.me.party.map((s, i) => charFromSpec(s, i, 'me'));
    const foes = view.foe.party.map((s, i) => charFromSpec(s, i, 'foe'));
    NS.sfx('rare');
    NS.ui.startBattle(foes, { kind: 'online', title: `vs ${view.foe.name}`, myChars: mine, seed: view.seed, online: makeLink(view), foeName: view.foe.name, vs: { me: view.me, foe: view.foe } });
  }

  // ---------------- ロビー ----------------
  let lobbyTimer = null, lobbyBusy = false;
  function stopPolling() { clearTimeout(lobbyTimer); lobbyTimer = null; }
  async function pollLobby() {
    stopPolling();
    if (NS.ui.current() !== 'online' || !net.user) return;
    if (!lobbyBusy) {
      lobbyBusy = true;
      try {
        const d = await net.api('GET', '/api/lobby');
        net.user = d.user;
        if (d.battle && NS.ui.current() === 'online') { lobbyBusy = false; begin(d.battle); return; } // 対戦が 始まっていた
        renderLobby(d);
      } catch (e) {
        if (e.status === 401) { net.user = null; O.render(); }
        else setStatus('サーバーに つながらない… (もう一度 ためしています)');
      }
      lobbyBusy = false;
    }
    if (NS.ui.current() === 'online') lobbyTimer = setTimeout(pollLobby, 4000);
  }

  function setStatus(html) { const el = $('#online-status'); if (el) el.innerHTML = html; }

  function renderLobby(d) {
    $('#online-user').innerHTML = `👤 <b>${esc(d.user.name)}</b> ・ ${d.user.wins}勝 ${d.user.losses}敗${d.user.draws ? ` ${d.user.draws}分` : ''} <button class="btn small" data-player-info="me">自分の 戦績</button>`;
    const rooms = d.rooms.filter((r) => !r.mine);
    $('#room-list').innerHTML = rooms.length ? rooms.map((r) => `
      <div class="room glass-2">
        <div class="room-code">${esc(r.code)}</div>
        <div class="room-info"><b>${esc(r.host)}</b><span class="hint small">${r.summary.n}人 ・ いちばん: ${esc(r.summary.best)} ${r.summary.rank ? NS.ui.rankBadge(r.summary.rank) : ''} ${r.summary.score || ''}</span></div>
        <button class="btn small primary" data-join="${esc(r.code)}">たたかう</button>
      </div>`).join('') : '<div class="hint">まっている部屋は ありません。部屋を つくって まとう。</div>';
    $('#ranking').innerHTML = d.ranking.length ? d.ranking.map((r, i) => `
      <div class="rk ${r.name === d.user.name ? 'me' : ''}"><span class="rk-n">${i + 1}</span><b>${esc(r.name)}</b><span>${r.wins}勝 ${r.losses}敗${r.draws ? ` ${r.draws}分` : ''}</span></div>`).join('')
      : '<div class="hint small">まだ だれも 対戦していません</div>';
    if (!O.room) setStatus('');
  }

  function renderParty() {
    const party = NS.save.party;
    $('#online-party').innerHTML = party.length
      ? party.map((k) => { const c = NS.charOf(k); return `<div class="op-member"><img src="${NS.bodyThumb(c, 48, 66)}" alt=""><span>${esc(c.name)}</span></div>`; }).join('')
      : '<div class="hint">パーティが いません。命名所で 編成しよう。</div>';
  }

  // 画面を ひらいたとき
  // ---------------- ほかのプレイヤーの パーティ (NPC として 対戦) ----------------
  let players = [];
  async function loadPlayers() {
    const el = $('#player-list');
    if (!el) return;
    el.innerHTML = '<div class="hint small">よみこみ中…</div>';
    try { const r = await net.api('GET', '/api/players'); players = r.players; players.me = r.me; } catch (e) { el.innerHTML = '<div class="hint small">よみこめなかった</div>'; return; }
    el.innerHTML = players.length ? players.map((p, i) => {
      const cs = p.party.map((s, j) => charFromSpec(s, j));
      const best = cs.slice().sort((a, b) => b.score - a.score)[0];
      return `<div class="player glass-2">
        <div class="pl-head"><b>${esc(p.name)}</b><span class="hint small">名声 ${p.fame} ・ ${p.wins}勝 ${p.losses}敗</span>
          <button class="btn small" data-player-info="${i}">くわしく</button>
          <button class="btn small primary" data-ghost="${i}">NPC と たたかう</button></div>
        <div class="pl-party">${cs.map((c) => `<div class="op-member" title="${esc(c.name)} ${c.rank} 名力${c.score}"><img src="${NS.bodyThumb(c, 40, 56)}" alt=""><span>${esc(c.name)}</span></div>`).join('')}</div>
        <div class="hint small">${cs.length}人 ・ いちばん: ${esc(best.name)} ${NS.ui.rankBadge(best.rank)} ${best.score}</div>
      </div>`;
    }).join('') : '<div class="hint small">まだ ほかの プレイヤーが いません</div>';
  }
  // プレイヤー情報: 今の パーティの くわしい ようすと 記録
  const fmtTime = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間 ${m % 60}分`; };
  function showPlayer(i) {
    const p = i === 'me' ? players.me : players[i];
    if (!p) { if (i === 'me') NS.ui.toast('よみこみ中か、パーティが いません'); return; }
    const I = p.info || {};
    const cs = p.party.map((s, j) => charFromSpec(s, j));
    const stat = (c, k) => `${NS.STAT_LABELS[k]} ${c.stats[k]}${k === 'eva' ? '%' : ''}`;
    NS.ui.openModal(`
      <h3>${esc(p.name)} <span class="hint">― 名声 ${p.fame} ・ ${p.wins}勝 ${p.losses}敗${p.draws ? ` ${p.draws}分` : ''}</span></h3>
      <div class="pl-info">
        <div>総プレイ時間<b>${fmtTime(I.playMs || 0)}</b></div>
        <div>出生した 回数<b>${I.births || 0}回</b></div>
        <div>累計 なかま数<b>${I.recruits || 0}人</b></div>
        <div>今の なかま<b>${I.roster || 0}人</b></div>
        <div>制覇・討伐<b>${I.cleared || 0}</b></div>
        ${I.since ? `<div>はじめた日<b>${new Date(I.since).toLocaleDateString('ja-JP')}</b></div>` : ''}
      </div>
      <div class="pv-sec">今の パーティ (${cs.length}人)</div>
      <div class="pl-members">${cs.map((c, j) => {
        const sp = p.party[j] || {};
        const eq = NS.equipKeys(c.equips).map((k) => NS.EQUIPS[k]);
        return `<div class="pl-member"><img class="rc-body" src="${NS.bodyThumb(c, 40, 56)}" alt="">
          <div><div class="pm-name">${esc(c.name)} ${NS.ui.rankBadge(c.rank)} <span class="hint small">名力 ${c.score}${sp.pb ? ` ・ 格 ×${c.pot.toFixed(2)}` : ''}</span></div>
          <div class="pm-sub">${['hp', 'mp', 'atk', 'def', 'spd', 'eva'].map((k) => `<span>${stat(c, k)}</span>`).join('')}</div>
          <div class="pm-sub"><span>スキル: ${c.skill ? esc(c.skill.name) : 'なし'}</span>${eq.length ? `<span>装備: ${eq.map((E) => esc(E.name)).join('・')}</span>` : ''}${c.kid ? `<span>第${c.kid.gen - 1}世代</span>` : ''}</div></div></div>`;
      }).join('')}</div>
      <div class="row reinc-actions">${i === 'me' ? '' : `<button class="btn primary" data-act="close" data-ghost="${i}">NPC と たたかう</button>`}<button class="btn" data-act="close">とじる</button></div>`);
  }
  function fightGhost(i) {
    const p = players[i];
    if (!p) return;
    if (!NS.save.party.length) { NS.ui.toast('パーティが いません'); return; }
    const foes = p.party.map((s, j) => charFromSpec(s, j));
    NS.sfx('confirm');
    NS.ui.startBattle(foes, { kind: 'ghost', title: `${p.name} の パーティ (NPC)`, ghostOf: p.name });
  }

  O.render = function () {
    renderParty();
    const main = $('#online-body');
    const gate = $('#online-gate');
    if (!net.available) {
      main.hidden = true; gate.hidden = false;
      gate.innerHTML = `<h3>オンライン対戦は サーバーで 起動したときに 遊べます</h3>
        <p class="hint">このフォルダで <code>node server.js</code> を 実行して、<code>http://localhost:8080</code> を ひらいてください。<br>
        友だちと 遊ぶときは <code>cloudflared tunnel --url http://localhost:8080</code> で 表示される URL を 教えてあげてね。</p>`;
      $('#online-user').textContent = '';
      return;
    }
    if (!net.user) {
      main.hidden = true; gate.hidden = false;
      gate.innerHTML = `<h3>オンライン対戦には ログインが 必要です</h3>
        <p class="hint">ログインすると データも サーバーに 保存されて、ほかの端末でも 遊べます。</p>
        <button class="btn primary" data-auth-open>ログイン / 登録</button>`;
      $('#online-user').textContent = '';
      return;
    }
    main.hidden = false; gate.hidden = true;
    if (O.room) showWaiting(O.room);
    pollLobby();
    loadPlayers();
  };
  // ほかの画面へ 行くとき (部屋で まっていたら 部屋を とじる)
  O.leave = function () {
    stopPolling();
    if (O.room) { O.room = null; net.api('POST', '/api/room/cancel').catch(() => {}); }
  };

  function showWaiting(code) {
    setStatus(`<div class="waiting"><span class="hint">部屋番号</span><b class="big-code">${esc(code)}</b>
      <span class="hint">あいてを まっています… <span class="dots"></span></span>
      <button class="btn small" id="room-cancel">やめる</button></div>`);
  }

  async function createRoom() {
    if (!NS.save.party.length) { NS.ui.toast('パーティが いません'); return; }
    try {
      await net.flushSave(); // 装備・格を サーバーの セーブで しらべるので 先に 送る
      const d = await net.api('POST', '/api/room/create', { party: NS.save.party.map(partySpec), summary: summary(NS.save.party), speed: NS.save.speed });
      O.room = d.code;
      NS.sfx('confirm');
      showWaiting(d.code);
      waitForGuest(d.code);
      pollLobby();
    } catch (e) { NS.ui.toast(e.message); }
  }
  async function waitForGuest(code) {
    while (O.room === code) {
      let r;
      try { r = await net.api('GET', `/api/room/wait?code=${code}`); } catch (e) { await new Promise((ok) => setTimeout(ok, 2000)); continue; }
      if (O.room !== code) return;
      if (r.status === 'start') { begin(r.battle); return; }
      if (r.status === 'gone') { O.room = null; setStatus('部屋が とじられました'); return; }
    }
  }
  async function joinRoom(code) {
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 4) { NS.ui.toast('部屋番号は 4けたの数字'); return; }
    if (!NS.save.party.length) { NS.ui.toast('パーティが いません'); return; }
    try {
      await net.flushSave();
      const d = await net.api('POST', '/api/room/join', { code, party: NS.save.party.map(partySpec) });
      if (O.room) O.room = null;
      begin(d.battle);
    } catch (e) { NS.ui.toast(e.message); }
  }

  // ---------------- ログイン ----------------
  function openAuth() {
    NS.ui.openModal(`
      <h3>ログイン / 登録</h3>
      <p class="hint small">名前と パスワードだけの かんたんな ログインです。ほかの サービスで 使っている パスワードは 使わないでね。</p>
      <div class="auth-form">
        <input id="auth-name" maxlength="12" placeholder="名前 (12文字まで)" autocomplete="username">
        <input id="auth-pw" type="password" maxlength="64" placeholder="パスワード (4文字以上)" autocomplete="current-password">
        <div class="auth-err" id="auth-err"></div>
        <div class="row" style="justify-content:center">
          <button class="btn primary" data-auth="login">ログイン</button>
          <button class="btn" data-auth="register">あたらしく 登録</button>
        </div>
      </div>
      <p class="hint small">ログインすると なかま・パーティ・名声などが サーバーに 保存されます。<br>はじめて 登録したときは、この端末の データを 引きつぎます。</p>`);
    setTimeout(() => $('#auth-name') && $('#auth-name').focus(), 50);
  }
  O.openAuth = openAuth;

  async function doAuth(kind) {
    const name = $('#auth-name').value, pw = $('#auth-pw').value;
    $('#auth-err').textContent = '';
    try {
      await net.auth(kind, name, pw);
    } catch (e) { $('#auth-err').textContent = e.message; NS.sfx('cancel'); return; }
    NS.ui.closeModal();
    await O.afterLogin();
    NS.sfx('confirm');
    NS.ui.toast(kind === 'register' ? `${net.user.name} で 登録しました` : `${net.user.name} で ログインしました`);
  }

  // ログインしたら サーバーのデータで 遊ぶ (サーバーに まだなければ この端末のデータを 引きつぐ)
  O.afterLogin = async function () {
    let remote = null;
    try { remote = await net.loadSave(); } catch (e) { /* noop */ }
    NS.ui.useAccountSave(remote);
    O.renderAccount();
    NS.ui.show(NS.ui.current() === 'battle' ? 'battle' : NS.ui.current() || 'title');
  };

  async function logout() {
    await net.logout();
    NS.ui.useAccountSave(null);
    O.renderAccount();
    NS.ui.show('title');
    NS.ui.toast('ログアウトしました (この端末の データで 遊びます)');
  }

  // タイトル画面の 左上
  O.renderAccount = function () {
    const el = $('#account');
    if (!el) return;
    if (!net.available) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = net.user
      ? `👤 <b>${esc(net.user.name)}</b> <span class="hint small">${net.user.wins}勝 ${net.user.losses}敗</span> <button class="btn small" data-logout>ログアウト</button>`
      : '👤 ゲスト <button class="btn small" data-auth-open>ログイン</button>';
  };

  O.init = async function () {
    await net.init();
    if (net.user) await O.afterLogin();
    O.renderAccount();
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-auth-open]')) { NS.sfx('select'); openAuth(); return; }
    const a = e.target.closest('[data-auth]');
    if (a) { doAuth(a.dataset.auth); return; }
    if (e.target.closest('[data-logout]')) { NS.sfx('cancel'); logout(); return; }
    if (e.target.closest('#room-create')) { createRoom(); return; }
    if (e.target.closest('#room-join')) { joinRoom($('#room-code').value); return; }
    const pi = e.target.closest('[data-player-info]');
    if (pi) { NS.sfx('select'); showPlayer(pi.dataset.playerInfo === 'me' ? 'me' : +pi.dataset.playerInfo); return; }
    const g = e.target.closest('[data-ghost]');
    if (g) { fightGhost(+g.dataset.ghost); return; }
    if (e.target.closest('#player-reload')) { NS.sfx('select'); loadPlayers(); return; }
    const j = e.target.closest('[data-join]');
    if (j) { joinRoom(j.dataset.join); return; }
    if (e.target.closest('#room-cancel')) { NS.sfx('cancel'); O.leave(); setStatus(''); pollLobby(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    if (e.target.id === 'auth-pw' || e.target.id === 'auth-name') doAuth('login');
    if (e.target.id === 'room-code') joinRoom(e.target.value);
  });
})();
