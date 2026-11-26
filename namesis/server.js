// NAMESIS サーバー (依存なし): ゲームの配信・かんたんなログイン・セーブの保存・オンライン対戦の中継
//   node server.js [port]
//   公開するとき (別のウィンドウで): cloudflared tunnel --url http://localhost:8080
// データは ./data に保存される (users.json / sessions.json / saves/)。
//
// オンライン対戦のしくみ: 2人に 同じシード (乱数のたね) と 両方のパーティを配り、毎ターン 2人のコマンドを 中継する。
// バトルの計算は それぞれの画面で行い、同じシード・同じコマンドなので 同じ結果になる。
// 通信は すべて ふつうの HTTP (返事を しばらく待たせる ロングポーリング) なので、トンネル越しでも 切れにくい。
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const DATA = path.join(ROOT, 'data');
const SAVES = path.join(DATA, 'saves');
fs.mkdirSync(SAVES, { recursive: true });

// ---------------- 小さな JSON ストア ----------------
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
const USERS_FILE = path.join(DATA, 'users.json');
const SESS_FILE = path.join(DATA, 'sessions.json');
const users = readJSON(USERS_FILE, {});       // id (小文字の名前) → { name, salt, hash, wins, losses, draws, created }
const sessions = readJSON(SESS_FILE, {});     // token → { id, created }
const dirty = new Set();
function markDirty(which) {
  dirty.add(which);
  clearTimeout(markDirty.t);
  markDirty.t = setTimeout(flush, 300);
}
function flush() {
  if (dirty.has('users')) writeJSON(USERS_FILE, users);
  if (dirty.has('sessions')) writeJSON(SESS_FILE, sessions);
  dirty.clear();
}
const SESSION_DAYS = 30;
for (const [tok, s] of Object.entries(sessions)) if (Date.now() - s.created > SESSION_DAYS * 864e5 || !users[s.id]) delete sessions[tok];

const saveFile = (id) => path.join(SAVES, crypto.createHash('sha256').update(id).digest('hex').slice(0, 32) + '.json');

// ---------------- ログイン ----------------
const NAME_MAX = 12;
function cleanName(s) {
  return String(s || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
const fails = new Map(); // id → { n, until } (パスワードを 何度も まちがえたら 少し待たせる)

function newSession(res, req, id) {
  const token = crypto.randomBytes(24).toString('base64url');
  sessions[token] = { id, created: Date.now() };
  markDirty('sessions');
  setCookie(res, req, token, SESSION_DAYS * 86400);
}
function setCookie(res, req, token, maxAge) {
  const https = req.headers['x-forwarded-proto'] === 'https' || /https/.test(req.headers['cf-visitor'] || '');
  res.setHeader('Set-Cookie', `ns_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? '; Secure' : ''}`);
}
function currentUser(req) {
  const m = /(?:^|;\s*)ns_sid=([^;]+)/.exec(req.headers.cookie || '');
  const s = m && sessions[m[1]];
  if (!s || !users[s.id]) return null;
  return { id: s.id, token: m[1], u: users[s.id] };
}
const publicUser = (id) => { const u = users[id]; return u ? { name: u.name, wins: u.wins || 0, losses: u.losses || 0, draws: u.draws || 0 } : null; };

// ---------------- HTTP の小道具 ----------------
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(Object.assign(new Error('bad json'), { code: 400 })); }
    });
    req.on('error', reject);
  });
}

// ---------------- 部屋と対戦 ----------------
const rooms = new Map();    // code → { code, host, party, summary, created, waiters: [] }
const battles = new Map();  // id → バトル
const POLL_MS = 25000;      // ロングポーリングで 待たせる長さ
const IDLE_MS = 45000;      // これだけ 音沙汰がなければ 切断あつかい (負け)

// sv = その人の セーブ。装備は 持っている 数まで、格の ボーナスは セーブに ある いちばん 大きい 値まで
const GENE_KEYS = ['hp', 'mp', 'atk', 'def', 'spd'];
function cleanParty(p, sv) {
  if (!Array.isArray(p) || !p.length || p.length > 8) return null;
  const items = sv && sv.items && typeof sv.items === 'object' ? sv.items : {};
  const pbMax = sv && sv.potBonus && typeof sv.potBonus === 'object' ? Math.max(0, ...Object.values(sv.potBonus).map(Number).filter(isFinite)) : 0;
  // 遺伝子の ボーナス: 能力ごとに セーブに ある いちばん 大きい 値まで
  const gbMax = {};
  for (const g of Object.values(sv && sv.geneBonus && typeof sv.geneBonus === 'object' ? sv.geneBonus : {})) {
    if (g && typeof g === 'object') for (const k of GENE_KEYS) gbMax[k] = Math.max(gbMax[k] || 0, Math.min(0.5, Number(g[k]) || 0));
  }
  const used = {};
  const out = [];
  for (const x of p) {
    if (!x || typeof x !== 'object') return null;
    let spec;
    if (typeof x.n === 'string' && x.n.length <= 20) spec = { n: x.n };
    else if (typeof x.b === 'string' && /^\w+:\d$/.test(x.b)) spec = { b: x.b };
    else if (x.k && typeof x.k === 'object') spec = { k: x.k };
    else return null;
    const pb = Math.min(0.5, pbMax, Math.round(Number(x.pb) * 100) / 100);
    if (pb > 0) spec.pb = pb;
    if (x.g && typeof x.g === 'object') {
      const g = {};
      for (const k of GENE_KEYS) { const v = Math.min(gbMax[k] || 0, Math.round(Number(x.g[k]) * 100) / 100); if (v > 0) g[k] = v; }
      if (Object.keys(g).length) spec.g = g;
    }
    const ok = [];
    for (const e of Array.isArray(x.e) ? x.e.slice(0, 4) : []) {
      if (typeof e === 'string' && e.length <= 20 && (used[e] || 0) < (Number(items[e]) || 0)) { used[e] = (used[e] || 0) + 1; ok.push(e); }
    }
    if (ok.length) spec.e = ok;
    out.push(spec);
  }
  return JSON.stringify(out).length <= 60000 ? out : null;
}
function cleanSummary(s) {
  s = s || {};
  return { n: Math.min(8, Number(s.n) || 0), best: String((s.best || '')).slice(0, 20), rank: String(s.rank || '').slice(0, 8), score: Number(s.score) || 0 };
}
function lobbyRooms() {
  return [...rooms.values()].map((r) => ({ code: r.code, host: users[r.host] ? users[r.host].name : '?', summary: r.summary, mine: false, hostId: r.host }));
}
function ranking() {
  return Object.values(users).filter((u) => (u.wins || 0) + (u.losses || 0) + (u.draws || 0) > 0)
    .sort((a, b) => (b.wins || 0) - (a.wins || 0) || (a.losses || 0) - (b.losses || 0))
    .slice(0, 10).map((u) => ({ name: u.name, wins: u.wins || 0, losses: u.losses || 0, draws: u.draws || 0 }));
}
function roomOf(id) { for (const r of rooms.values()) if (r.host === id) return r; return null; }
// いま 戦っている対戦 (ぬけた・結果を 報告ずみの 対戦は のぞく)
function battleOf(id) {
  for (const b of battles.values()) {
    const r = roleOf(b, id);
    if (r && !b.over && b.left !== r && !(r in b.reports)) return b;
  }
  return null;
}
const roleOf = (b, id) => (b.p1.id === id ? 'p1' : b.p2.id === id ? 'p2' : null);
const other = (r) => (r === 'p1' ? 'p2' : 'p1');

function startBattle(room, guestId, guestParty) {
  rooms.delete(room.code);
  const b = {
    id: crypto.randomBytes(8).toString('hex'), seed: crypto.randomBytes(8).toString('hex'), created: Date.now(),
    p1: { id: room.host, party: room.party }, p2: { id: guestId, party: guestParty },
    turns: {}, waiters: [], seen: { p1: Date.now(), p2: Date.now() }, over: null, reports: {},
    delivered: { p1: false, p2: false }, left: null, speed: room.speed || 1, // speed = バトルの 速さ (ホストが きめる)
  };
  battles.set(b.id, b);
  for (const w of room.waiters) w({ status: 'start', battle: deliver(b, 'p1') });
  room.waiters = [];
  console.log(`[対戦] ${users[b.p1.id].name} vs ${users[b.p2.id].name}`);
  return b;
}
// 対戦の情報 (名前・名声・戦績も 最初の VS 画面で 見せる)
function battleView(b, role) {
  const who = (p) => {
    const u = users[p.id], sv = readJSON(saveFile(p.id), null);
    return { name: u.name, party: p.party, fame: (sv && Number(sv.fame)) || 0, wins: u.wins || 0, losses: u.losses || 0, draws: u.draws || 0 };
  };
  return { id: b.id, seed: b.seed, role, me: who(b[role]), foe: who(b[other(role)]), speed: b.speed };
}
// 対戦が はじまったことを 1回だけ 知らせる (2回目は 読みこみ直し = ぬけた あつかい)
function deliver(b, role) { b.delivered[role] = true; return battleView(b, role); }
// 対戦から ぬけた: ぬけた人は 負け。残った人は NPC と 最後まで たたかう
function leaveBattle(b, role) {
  if (b.over || b.left || role in b.reports) return;
  b.left = role;
  const u = users[b[role].id];
  u.losses = (u.losses || 0) + 1;
  markDirty('users');
  console.log(`[切断] ${u.name} が 対戦から ぬけた (負け)。${users[b[other(role)].id].name} は NPC と たたかう`);
  wakeBattle(b);
}

// そのターンの 自分あての 返事 (なければ null)
function turnReply(b, role, turn) {
  if (b.over) return { status: 'end', result: b.over.winner === role ? 'win' : b.over.winner ? 'lose' : 'draw', reason: b.over.reason };
  const t = b.turns[turn];
  if (t && t.p1 && t.p2) return { status: 'turn', turn, foe: t[other(role)].cmds, desync: t.p1.chk !== t.p2.chk, speed: b.speed };
  if (b.left) return b.left === role ? { status: 'end', result: 'lose', reason: 'left' } : { status: 'npc' };
  // あいてが しばらく いない → 切断。ここからは あいての かわりに NPC
  if (Date.now() - b.seen[other(role)] > IDLE_MS) { leaveBattle(b, other(role)); return turnReply(b, role, turn); }
  return null;
}
function wakeBattle(b) {
  const ws = b.waiters;
  b.waiters = [];
  for (const w of ws) {
    const r = turnReply(b, w.role, w.turn);
    if (r) w.done(r); else b.waiters.push(w);
  }
}
function waitTurn(res, b, role, turn) {
  const r = turnReply(b, role, turn);
  if (r) return sendJSON(res, 200, r);
  const w = { role, turn, done: (x) => { clearTimeout(w.timer); sendJSON(res, 200, x); } };
  w.timer = setTimeout(() => {
    b.waiters = b.waiters.filter((x) => x !== w);
    sendJSON(res, 200, turnReply(b, role, turn) || { status: 'wait' });
  }, POLL_MS);
  res.on('close', () => { clearTimeout(w.timer); b.waiters = b.waiters.filter((x) => x !== w); });
  b.waiters.push(w);
}
function endBattle(b, winnerRole, reason) {
  if (b.over) return;
  b.over = { winner: winnerRole, reason };
  record(b, winnerRole);
  wakeBattle(b);
  flushResultWaiters(b);
  setTimeout(() => battles.delete(b.id), 10 * 60 * 1000);
}
// 結果の報告を 待っている人へ (記録が すんでから 返事をする)
function flushResultWaiters(b) {
  const ws = b.resultWaiters || [];
  b.resultWaiters = [];
  for (const w of ws) w();
}
function record(b, winnerRole) {
  if (b.recorded) return;
  b.recorded = true;
  const p1 = users[b.p1.id], p2 = users[b.p2.id];
  if (!winnerRole) { p1.draws = (p1.draws || 0) + 1; p2.draws = (p2.draws || 0) + 1; }
  else {
    const w = users[b[winnerRole].id], l = users[b[other(winnerRole)].id];
    w.wins = (w.wins || 0) + 1; l.losses = (l.losses || 0) + 1;
  }
  markDirty('users');
  console.log(`[結果] ${p1.name} vs ${p2.name} → ${winnerRole ? users[b[winnerRole].id].name + ' の勝ち' : '引き分け'}${b.over && b.over.reason ? ' (' + b.over.reason + ')' : ''}`);
}

// 古い部屋・終わった対戦の 片づけ
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.seen > IDLE_MS) { rooms.delete(code); for (const w of r.waiters) w({ status: 'gone' }); }
  for (const b of battles.values()) {
    if (b.over) continue;
    if (!b.left) { for (const role of ['p1', 'p2']) if (!(role in b.reports) && now - b.seen[role] > IDLE_MS) { leaveBattle(b, role); break; } }
    else if (now - b.seen[other(b.left)] > IDLE_MS * 4) { b.over = { winner: null, reason: 'gone' }; b.recorded = true; setTimeout(() => battles.delete(b.id), 60000); }
  }
}, 5000);

// ロビーに 来たとき: まだ 知らせていない 対戦なら 知らせる。知らせたあとなら 読みこみ直し = ぬけた
function lobbyBattle(id) {
  const b = battleOf(id);
  if (!b) return null;
  const role = roleOf(b, id);
  if (!b.delivered[role]) return deliver(b, role);
  leaveBattle(b, role);
  return null;
}

// セーブの パーティを 送れる形に (名前 / 紅蓮騎士団の番号 / 出生の子の 記録)
function partySpecs(sv) {
  if (!sv || !Array.isArray(sv.party)) return [];
  const out = [];
  // \u670D\u306F \u6301\u3063\u3066\u3044\u308B \u6570\u307E\u3067 (\u305D\u308C\u3092 \u3053\u3048\u308B \u3076\u3093\u306F \u7740\u3066\u3044\u306A\u3044 \u3042\u3064\u304B\u3044)
  const items = (sv.items && typeof sv.items === 'object') ? sv.items : {};
  const used = {};
  const extra = (key, spec) => { // \u683C\u306E \u30DC\u30FC\u30CA\u30B9 (\u8EE2\u751F\u30FB\u683C\u306E\u5B9D\u7389) \u3068 \u670D
    const pb = sv.potBonus && Number(sv.potBonus[key]);
    if (pb > 0) spec.pb = Math.min(0.5, Math.round(pb * 100) / 100);
    const gb = sv.geneBonus && sv.geneBonus[key];
    if (gb && typeof gb === 'object') { const g = {}; for (const k of GENE_KEYS) { const v = Math.min(0.5, Math.round(Number(gb[k]) * 100) / 100); if (v > 0) g[k] = v; } if (Object.keys(g).length) spec.g = g; }
    const raw = sv.equip && sv.equip[key];
    const list = typeof raw === 'string' ? [raw] : raw && typeof raw === 'object' ? Object.values(raw) : [];
    const ok = [];
    for (const e of list.slice(0, 4)) {
      if (typeof e === 'string' && e.length <= 20 && (used[e] || 0) < (Number(items[e]) || 0)) { used[e] = (used[e] || 0) + 1; ok.push(e); }
    }
    if (ok.length) spec.e = ok;
    return spec;
  };
  for (const key of sv.party.slice(0, 8)) {
    if (typeof key !== 'string') continue;
    if (key[0] !== '\uE000') { out.push(extra(key, { n: key.slice(0, 20) })); continue; }
    const [kind, a, b] = key.slice(1).split(':');
    if (kind === 'boss') out.push(extra(key, { b: `${a}:${b}` }));
    else if (kind === 'kid' && sv.kids && sv.kids[a]) out.push(extra(key, { k: sv.kids[a] }));
  }
  return out;
}

// ---------------- API ----------------
async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  const me = currentUser(req);
  const need = () => { if (!me) { sendJSON(res, 401, { error: 'ログインしてください' }); return false; } return true; };

  switch (route) {
    case 'GET /api/me':
      return sendJSON(res, 200, { user: me ? publicUser(me.id) : null });

    case 'POST /api/register':
    case 'POST /api/login': {
      const body = await readBody(req, 4096);
      const name = cleanName(body.name), pw = String(body.password || '');
      const id = name.toLowerCase();
      if (!name || Array.from(name).length > NAME_MAX) return sendJSON(res, 400, { error: `名前は 1〜${NAME_MAX}文字` });
      if (pw.length < 4 || pw.length > 64) return sendJSON(res, 400, { error: 'パスワードは 4〜64文字' });
      if (route === 'POST /api/register') {
        if (users[id]) return sendJSON(res, 409, { error: 'その名前は もう 使われています' });
        const salt = crypto.randomBytes(16).toString('hex');
        users[id] = { name, salt, hash: hashPw(pw, salt), wins: 0, losses: 0, draws: 0, created: Date.now() };
        markDirty('users');
        console.log(`[登録] ${name}`);
      } else {
        const f = fails.get(id);
        if (f && f.until > Date.now()) return sendJSON(res, 429, { error: '少し 待ってから ためしてください' });
        const u = users[id];
        const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
        if (!ok) {
          const n = (f ? f.n : 0) + 1;
          fails.set(id, { n, until: n >= 5 ? Date.now() + 30000 : 0 });
          return sendJSON(res, 401, { error: '名前か パスワードが ちがいます' });
        }
        fails.delete(id);
      }
      newSession(res, req, id);
      return sendJSON(res, 200, { user: publicUser(id) });
    }

    case 'POST /api/logout':
      if (me) { delete sessions[me.token]; markDirty('sessions'); }
      setCookie(res, req, '', 0);
      return sendJSON(res, 200, { ok: true });

    case 'GET /api/save': {
      if (!need()) return;
      return sendJSON(res, 200, { save: readJSON(saveFile(me.id), null) });
    }
    case 'PUT /api/save':
    case 'POST /api/save': {
      if (!need()) return;
      const body = await readBody(req, 4 * 1024 * 1024);
      if (!body.save || typeof body.save !== 'object') return sendJSON(res, 400, { error: 'save がない' });
      writeJSON(saveFile(me.id), body.save);
      return sendJSON(res, 200, { ok: true });
    }

    case 'GET /api/lobby': {
      if (!need()) return;
      const mine = roomOf(me.id);
      if (mine) mine.seen = Date.now();
      return sendJSON(res, 200, {
        user: publicUser(me.id), ranking: ranking(),
        rooms: lobbyRooms().map((r) => ({ code: r.code, host: r.host, summary: r.summary, mine: r.hostId === me.id })),
        battle: lobbyBattle(me.id),
      });
    }

    case 'GET /api/players': { // ほかのプレイヤーの パーティ (名声の 高い順)
      if (!need()) return;
      const list = [];
      let mine = null;
      for (const [id, u] of Object.entries(users)) {
        const sv = readJSON(saveFile(id), null);
        const party = partySpecs(sv);
        if (!party.length) continue;
        const n = (v) => Math.max(0, Number(v) || 0);
        const info = { // プレイヤー情報 (古い セーブは 今ある 数から だいたいで)
          playMs: n(sv.playMs), births: Math.max(n(sv.births), n(sv.kidSeq)), recruits: Math.max(n(sv.recruits), Array.isArray(sv.roster) ? sv.roster.length : 0),
          roster: Array.isArray(sv.roster) ? sv.roster.length : 0, cleared: sv.cleared && typeof sv.cleared === 'object' ? Object.keys(sv.cleared).length : 0,
          since: u.created || 0,
        };
        const row = { name: u.name, fame: Number(sv.fame) || 0, wins: u.wins || 0, losses: u.losses || 0, draws: u.draws || 0, party, info };
        if (id === me.id) mine = row; else list.push(row);
      }
      list.sort((a, b) => b.fame - a.fame || b.wins - a.wins);
      return sendJSON(res, 200, { players: list.slice(0, 50), me: mine }); // me = 自分の 戦績・パーティ
    }

    case 'POST /api/room/create': {
      if (!need()) return;
      const body = await readBody(req, 128 * 1024);
      const party = cleanParty(body.party, readJSON(saveFile(me.id), null));
      if (!party) return sendJSON(res, 400, { error: 'パーティが おかしい' });
      lobbyBattle(me.id);
      const old = roomOf(me.id);
      if (old) rooms.delete(old.code);
      let code;
      do code = String(1000 + crypto.randomInt(9000)); while (rooms.has(code));
      rooms.set(code, { code, host: me.id, party, summary: cleanSummary(body.summary), speed: Math.max(1, Math.min(3, Math.round(Number(body.speed)) || 1)), created: Date.now(), seen: Date.now(), waiters: [] });
      return sendJSON(res, 200, { code });
    }
    case 'GET /api/room/wait': { // 部屋をつくった人が あいてを待つ (ロングポーリング)
      if (!need()) return;
      const started = lobbyBattle(me.id);
      if (started) return sendJSON(res, 200, { status: 'start', battle: started });
      const room = rooms.get(url.searchParams.get('code'));
      if (!room || room.host !== me.id) return sendJSON(res, 200, { status: 'gone' });
      room.seen = Date.now();
      const done = (x) => { clearTimeout(timer); sendJSON(res, 200, x); };
      const timer = setTimeout(() => { room.waiters = room.waiters.filter((w) => w !== done); sendJSON(res, 200, { status: 'waiting' }); }, POLL_MS);
      res.on('close', () => { clearTimeout(timer); room.waiters = room.waiters.filter((w) => w !== done); });
      room.waiters.push(done);
      return;
    }
    case 'POST /api/room/cancel': {
      if (!need()) return;
      const room = roomOf(me.id);
      if (room) { rooms.delete(room.code); for (const w of room.waiters) w({ status: 'gone' }); }
      return sendJSON(res, 200, { ok: true });
    }
    case 'POST /api/room/join': {
      if (!need()) return;
      const body = await readBody(req, 128 * 1024);
      const party = cleanParty(body.party, readJSON(saveFile(me.id), null));
      if (!party) return sendJSON(res, 400, { error: 'パーティが おかしい' });
      const room = rooms.get(String(body.code || ''));
      if (!room) return sendJSON(res, 404, { error: 'その部屋は ありません' });
      if (room.host === me.id) return sendJSON(res, 400, { error: '自分の部屋には 入れません' });
      lobbyBattle(me.id);
      const mine = roomOf(me.id);
      if (mine) rooms.delete(mine.code);
      const b = startBattle(room, me.id, party);
      return sendJSON(res, 200, { status: 'start', battle: deliver(b, 'p2') });
    }

    case 'POST /api/battle/cmd': { // コマンドを送って、あいてのコマンドを待つ
      if (!need()) return;
      const body = await readBody(req, 64 * 1024);
      const b = battles.get(String(body.id || ''));
      const role = b && roleOf(b, me.id);
      if (!role) return sendJSON(res, 404, { error: '対戦が 見つかりません' });
      b.seen[role] = Date.now();
      const turn = Number(body.turn) || 0;
      if (!Array.isArray(body.cmds) || body.cmds.length > 8) return sendJSON(res, 400, { error: 'コマンドが おかしい' });
      const t = (b.turns[turn] = b.turns[turn] || {});
      if (!t[role]) t[role] = { cmds: body.cmds, chk: String(body.chk || '') };
      if (t.p1 && t.p2 && t.p1.chk !== t.p2.chk) console.warn(`[同期ずれ] ${b.id} ターン${turn}: ${t.p1.chk} / ${t.p2.chk}`);
      delete b.turns[turn - 2];
      wakeBattle(b);
      return waitTurn(res, b, role, turn);
    }
    case 'GET /api/battle/poll': {
      if (!need()) return;
      const b = battles.get(url.searchParams.get('id') || '');
      const role = b && roleOf(b, me.id);
      if (!role) return sendJSON(res, 404, { error: '対戦が 見つかりません' });
      b.seen[role] = Date.now();
      return waitTurn(res, b, role, Number(url.searchParams.get('turn')) || 0);
    }
    case 'POST /api/battle/ping': { // 演出中も つながっていることを知らせる
      if (!need()) return;
      const body = await readBody(req, 1024);
      const b = battles.get(String(body.id || ''));
      const role = b && roleOf(b, me.id);
      if (role) b.seen[role] = Date.now();
      return sendJSON(res, 200, { ok: true, over: b && b.over ? turnReply(b, role, 0) : null, speed: b ? b.speed : 1 });
    }
    case 'POST /api/battle/speed': { // ホスト (部屋を つくった人) が バトルの 速さを 変えた → あいてにも つく
      if (!need()) return;
      const body = await readBody(req, 1024);
      const b = battles.get(String(body.id || ''));
      if (!b || roleOf(b, me.id) !== 'p1') return sendJSON(res, 403, { error: '速さは ホストだけが 変えられます' });
      b.speed = Math.max(1, Math.min(3, Math.round(Number(body.speed)) || 1));
      return sendJSON(res, 200, { ok: true, speed: b.speed });
    }
    case 'POST /api/battle/surrender': {
      if (!need()) return;
      const body = await readBody(req, 1024);
      const b = battles.get(String(body.id || ''));
      const role = b && roleOf(b, me.id);
      if (role && !b.left) endBattle(b, other(role), 'surrender');
      return sendJSON(res, 200, { ok: true });
    }
    case 'POST /api/battle/leave': { // 対戦中に ページを とじた・読みこみ直した
      if (!need()) return;
      const body = await readBody(req, 1024);
      const b = battles.get(String(body.id || ''));
      const role = b && roleOf(b, me.id);
      if (role) leaveBattle(b, role);
      return sendJSON(res, 200, { ok: true });
    }
    case 'POST /api/battle/result': { // 2人の画面の 結果が そろったら 記録する
      if (!need()) return;
      const body = await readBody(req, 1024);
      const b = battles.get(String(body.id || ''));
      const role = b && roleOf(b, me.id);
      if (!role) return sendJSON(res, 404, { error: '対戦が 見つかりません' });
      if (b.over) return sendJSON(res, 200, { user: publicUser(me.id) });
      const r = body.result === 'win' ? role : body.result === 'lose' ? other(role) : body.result === 'draw' ? '' : null;
      if (r === null) return sendJSON(res, 400, { error: 'result が おかしい' });
      if (b.left) { // あいてが ぬけたあと NPC と 戦った結果は 残った人の 戦績だけに 入れる
        if (b.left !== role) {
          const u = users[me.id];
          if (r === role) u.wins = (u.wins || 0) + 1; else if (r) u.losses = (u.losses || 0) + 1; else u.draws = (u.draws || 0) + 1;
          markDirty('users');
          b.over = { winner: r || null, reason: 'npc' };
          b.recorded = true;
          setTimeout(() => battles.delete(b.id), 60000);
          console.log(`[結果] ${u.name} vs NPC → ${r === role ? '勝ち' : r ? '負け' : '引き分け'}`);
        }
        return sendJSON(res, 200, { user: publicUser(me.id) });
      }
      b.reports[role] = r;
      const rp = b.reports;
      if ('p1' in rp && 'p2' in rp) {
        if (rp.p1 === rp.p2) endBattle(b, rp.p1 || null, null);
        else { console.warn(`[結果が 食いちがい] ${b.id}`); b.over = { winner: null, reason: 'mismatch' }; b.recorded = true; flushResultWaiters(b); setTimeout(() => battles.delete(b.id), 600000); }
      } else {
        // あいての報告が こなくても 少し待ってから 記録する
        setTimeout(() => { if (!b.over) endBattle(b, r || null, null); }, 20000);
      }
      if (b.over) return sendJSON(res, 200, { user: publicUser(me.id) });
      // あいての報告を 待ってから 返事をする (戦績が 更新されてから 表示できるように)
      const done = () => { clearTimeout(timer); if (!res.writableEnded) sendJSON(res, 200, { user: publicUser(me.id) }); };
      const timer = setTimeout(done, POLL_MS);
      (b.resultWaiters = b.resultWaiters || []).push(done);
      return;
    }
  }
  sendJSON(res, 404, { error: 'not found' });
}

// ---------------- 静的ファイル ----------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg' };
const PUBLIC = ['index.html', 'proto3d.html', 'js', 'css', 'audio', 'img']; // audio = BGM・効果音 / img = 絵 (しなこ) / proto3d = 3D の 試作
function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const top = path.relative(ROOT, file).split(path.sep)[0];
  if (!file.startsWith(ROOT + path.sep) || !PUBLIC.includes(top)) { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try { await api(req, res, url); } catch (e) {
      if (!res.headersSent) sendJSON(res, e.code || 500, { error: e.code ? e.message : 'サーバーエラー' });
      if (!e.code) console.error(e);
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`NAMESIS サーバー: http://localhost:${PORT}`);
  console.log(`公開するとき: cloudflared tunnel --url http://localhost:${PORT}`);
});
process.on('SIGINT', () => { flush(); process.exit(0); });
