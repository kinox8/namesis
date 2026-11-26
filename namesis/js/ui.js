// 画面・入力まわり
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // key = 名前 (紅蓮騎士団の なかま・出生の子は 特別なキー)。服を 着ていれば その耐性こみ
  const eqCache = new Map();
  const ch = (key) => {
    const c = NS.charOf(key);
    const e = save.equip && save.equip[key], pb = save.potBonus && save.potBonus[key]; // 服・格の ボーナス (転生・格の宝玉)
    const gb = save.geneBonus && save.geneBonus[key]; // 遺伝子の ボーナス (リアルタイム対戦の 勝利)
    if (!e && !pb && !gb) return c;
    const k = key + '|' + NS.equipKeys(e).join(',') + '|' + pb + '|' + (gb ? JSON.stringify(gb) : '');
    if (!eqCache.has(k) || eqCache.get(k).base !== c) {
      const g = gb ? NS.withGeneBonus(c, gb) : c;
      eqCache.set(k, { base: c, c: NS.withEquip(pb ? NS.withPotBonus(g, pb) : g, e) });
    }
    return eqCache.get(k).c;
  };

  // ---------------- セーブ ----------------
  // ゲストは この端末 (localStorage) に、ログイン中は サーバーに 保存する (この端末にも 写しを置く)
  const GUEST_KEY = 'namesis.save.v1';
  const saveKey = () => (NS.net && NS.net.user ? 'namesis.save.user.' + NS.net.user.name.toLowerCase() : GUEST_KEY);
  const DEFAULTS = {
    roster: [], party: [], cleared: {}, fame: 0, speed: 1, sound: true, auto: false, best: null,
    presets: [],   // 保存したパーティ (保存するたびに 枠がふえる)
    presetEquip: [], // 保存したパーティの 装備 (presets と 同じ 番号)
    kids: {},      // 出生の子の記録
    kidSeq: 0,
    bred: [],      // 出生を すませた なかま (1体につき 1回まで)
    recipes: [],   // 見つけた ふしぎな組み合わせ
    items: {},     // 持っている 装備 (key → 数)
    equip: {},     // 装備している なかま (なかまの key → 装備の key)
    potBonus: {},  // 格の ボーナス (なかまの key → 足す 格。転生・格の宝玉)
    potOrbs: 0,    // 格の宝玉 (ウルフベアを たおすたびに 1こ)
    fav: [],       // お気に入り (★。お別れ できない)
    playMs: 0,     // 総プレイ時間 (ミリ秒。画面を 見ている 間だけ ふえる)
    births: 0,     // 出生した 回数
    recruits: 0,   // これまでに なかまに した 数 (お別れしても へらない)
    fxOff: false,  // 全体・最大の 属性スキルの 大技の 演出を 出さない
    model3d: false, // キャラを 3D モデルで 描く (テスト)
    farewellGen: 0, // まとめて お別れする 世代
    geneBonus: {}, // 遺伝子の ボーナス (なかまの key → {hp: 0.02, ...}。リアルタイム対戦の 勝利で 上がる)
    heardBgm: null, // 聴いたことの ある BGM (サウンドトラック)
    gifts: {},     // 受けとった 実績報酬 (key → true)
    dake: 0,       // しゅっせいダケ (なかまに 食べさせると もう一度 出生できる)
    gold: 0,       // ゴールド (幻帝のどうくつの 宝箱)
  };
  const save = JSON.parse(JSON.stringify(DEFAULTS));
  function applySave(d) {
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, JSON.parse(JSON.stringify(DEFAULTS)), d || {});
    if (NS.resetSpecial) NS.resetSpecial();
    if (NS.clearThumbs) NS.clearThumbs();
    if (!Array.isArray(save.presetEquip)) save.presetEquip = [];
    prunePresets(() => true);
    // スキルの段階を 1体 4段階・3体と全体 3段階に へらしたので、古いセーブの 出生の子の スキルを 読みかえる
    if ((save.ver || 1) < 2) {
      for (const id in save.kids) {
        const m = /^atk_(\w+)_(single|three|all)_(\d)$/.exec(save.kids[id].skill || '');
        if (m) save.kids[id].skill = `atk_${m[1]}_${m[2]}_${NS.OLD_TIER[m[2]][+m[3]]}`;
      }
      save.ver = 2;
    }
    NS.kids = save.kids;
    eqCache.clear();
    for (const k in save.equip) {
      if (!save.roster.includes(k)) { delete save.equip[k]; continue; }
      if (save.equip[k] && save.equip[k].hand) { save.equip[k].back = save.equip[k].hand; delete save.equip[k].hand; } // たては 手 → せなか に
      if (typeof save.equip[k] === 'string') { const E = NS.EQUIPS[save.equip[k]]; save.equip[k] = E ? { [E.slot]: save.equip[k] } : {}; } // 以前の 形 (服 1つ) を 部位ごとに
    }
    for (const k in save.potBonus) if (!save.roster.includes(k)) delete save.potBonus[k];
    for (const k in save.geneBonus) if (!save.roster.includes(k)) delete save.geneBonus[k];
    if (!save.heardBgm) { // はじめて: これまでの 記録から 聴いたはずの 曲
      const c = save.cleared || {}, H = (save.heardBgm = {});
      if (save.fame > 0 || Object.keys(c).length) H.battle = true;
      if (c['mon:kikorioni'] || c['mon:shieldknight'] || c['mon:wolfbear']) H.boss = true;
      if (c['mon:hakairyu']) H.boss3 = true;
      if (c['mon:shinako']) H.shinako = true;
      if (Object.keys(c).some((k) => k.startsWith('mon:'))) H.fanfare = true;
    }
  }
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(saveKey()) || 'null'); } catch (e) { /* 保存できない環境でも遊べる */ }
    applySave(d);
  }
  const persistQuiet = () => persist(); // プレイ時間などの 記録
  function persist() {
    try { localStorage.setItem(saveKey(), JSON.stringify(save)); } catch (e) { /* noop */ }
    if (NS.net && NS.net.user) NS.net.queueSave(save);
  }
  // ログイン・ログアウトしたとき。ログイン中: サーバーのデータで遊ぶ (まだ なければ 今のデータを 引きつぐ)。ログアウト: ゲストのデータへ
  function useAccountSave(remote) {
    if (NS.net && NS.net.user) {
      if (remote) applySave(remote);
      persist();
    } else load();
    ensureStarters();
    applyVolume();
    NS.speed = save.speed;
  }
  // はじめての人には おまかせで 4人用意する
  function ensureStarters() {
    if (save.roster.length) return;
    const avoid = new Set();
    for (let i = 0; i < 4; i++) {
      const n = NS.findNameInRanks(['C', 'B'], Math.random, avoid);
      avoid.add(n);
      addToRoster(n, true);
    }
  }
  NS.save = save;
  // 開発者用: コンソールで devSpeed(5) → バトルの 速さを ×5 に (速さボタンを 押すと ×1 に もどる。オンラインは ×3 まで)
  window.devSpeed = (n = 5) => { save.speed = Math.max(1, Number(n) || 1); persist(); updateCtrlButtons(); return `バトルの 速さ ×${save.speed}`; };
  // 開発者用: コンソールで giveDake() / giveDake(5) → しゅっせいダケを 入手
  window.giveDake = (n = 1) => { save.dake = (save.dake || 0) + n; persist(); return `🍄 しゅっせいダケ ×${save.dake}`; };

  function rankBadge(key) {
    const r = NS.rankInfo(key);
    return `<span class="rank r-${key}" style="--rc:${r.color}">${r.label}</span>`;
  }
  function colorChip(c) {
    const C = NS.COLORS[c.color];
    const el = C.elem ? ' / ' + NS.ELEMENTS[C.elem].name : '';
    return `<span class="chip"><span class="dot" style="--c:${C.hex}"></span>${C.name}${el}</span>`;
  }
  function toast(text, ms = 1600) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('#ui').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ---------------- 画面切り替え ----------------
  let current = null;
  function show(id) {
    if (current === 'online' && id !== 'online' && NS.online) NS.online.leave(); // 部屋で まっていたら とじる
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === 'scr-' + id));
    current = id;
    if (id === 'title') { renderTitle(); setShowcase(save.party, 'title'); if (NS.online) NS.online.renderAccount(); }
    if (id === 'online') { NS.online.render(); setShowcase(save.party, 'cups'); NS.bgm.preload('battle'); }
    if (id === 'party') { setReleaseMode(false); renderParty(); setShowcase(save.party, 'party'); }
    if (id === 'cups') { renderCups(); setShowcase(save.party, 'cups'); NS.bgm.preload('boss'); NS.bgm.preload('boss3'); NS.bgm.preload('shinako'); NS.bgm.preload('maou'); NS.bgm.preload('lastboss'); NS.bgm.preload('fanfare'); NS.bgm.preload('lastfanfare'); NS.bgm.preload('battle'); }
    if (id === 'free') { renderFree(); setShowcase(save.party, 'cups'); NS.bgm.preload('battle'); }
    if (id === 'shrine') { renderShrine(); setShrineScene(); }
    if (id === 'dungeon') { // ボスの 登場の 暗転が のこらないように
      const fade = document.getElementById('screen-fade');
      if (fade) { fade.style.transition = 'none'; fade.style.opacity = 0; }
      setShowcase([], 'cups'); NS.dungeon.render();
    }
  }
  NS.ui = { show, syncSpeed: () => updateCtrlButtons() };

  // メニュー中の背景: パーティを闘技場の中央に並べる
  function setShowcase(names, mode) {
    NS.scene.battle = null;
    NS.scene.mode = mode;
    NS.clearFx();
    const list = names.slice(0, 8).map(ch);
    const n = list.length;
    NS.scene.units = list.map((c, i) => {
      const x = (i - (n - 1) / 2) * 1.25;
      const z = 0.4 - Math.abs(i - (n - 1) / 2) * 0.28;
      const u = new NS.Unit(c, 'party', i, x, z);
      u.facing = 0; u.v.face = 0;
      return u;
    });
  }

  // ---------------- タイトル ----------------
  // ギフト: 条件を みたすと 受けとれる (その他 → ギフト)
  // 実績報酬: 名声が とどくと 受けとれる (item = 装備 / dake = しゅっせいダケ)
  const DAKE = { icon: '🍄', name: 'しゅっせいダケ', desc: 'なかまに 食べさせると、出生ずみの なかまが もう一度 出生できる' };
  const GIFTS = [
    { key: 'dake10k', fame: 10000, dake: 1 },
    { key: 'robe20k', fame: 20000, item: 'majorobe' },
    { key: 'bell', fame: 30000, item: 'bell' },
    { key: 'hat40k', fame: 40000, item: 'majohat' },
    { key: 'jewel50k', fame: 50000, item: 'jewel' },
    { key: 'staff60k', fame: 60000, item: 'majostaff' },
    { key: 'dake100k', fame: 100000, dake: 1 },
    { key: 'dake200k', fame: 200000, dake: 1 },
  ].map((g) => Object.assign(g, { cond: () => save.fame >= g.fame }));
  const giftReady = () => GIFTS.filter((g) => g.cond() && !(save.gifts && save.gifts[g.key]));
  function renderMoreBadge() { const n = giftReady().length; $('#more-badge').hidden = !n; }
  function renderTitle() {
    renderMoreBadge();
    const bestCh = save.roster.length ? save.roster.map(ch).sort((a, b) => b.score - a.score)[0] : null;
    const cleared = NS.CUPS.filter((c) => save.cleared[c.id]).length;
    $('#title-foot').innerHTML =
      `名声 <b>${save.fame}</b> ・ 💰${save.gold || 0}G ・ 制覇 ${cleared}/${NS.CUPS.length} ・ なかま ${save.roster.length}人` +
      (bestCh ? `<br>最強の名: <b>${esc(bestCh.name)}</b> ${rankBadge(bestCh.rank)} 名力 ${bestCh.score}` : '');
  }

  // ---------------- 命名所 ----------------
  let previewName = '';
  let pvKey = null; // 紅蓮騎士団の なかま・出生の子を 見ているとき (名前を入力すると 解除)
  function selectPreview(key) {
    pvKey = NS.isSpecial(key) ? key : null;
    $('#name-input').value = pvKey ? ch(key).name : key;
    renderParty();
  }
  let previewCanvas = null;
  let pvTurn = null, pvDrag = null; // ドラッグで まわす
  NS.ui.preview = () => (current === 'party' && previewName ? { canvas: previewCanvas, ch: ch(previewName), turn: pvTurn } : null);

  function statRow(k, c) {
    if (k === 'mp' && c.noSkill) return '<span>MP</span><span class="bar"><i style="width:0"></i></span><span class="val">—</span><span></span>';
    // 基礎の 理論上の 最大を バーの 9割 (点線) に。★・頭・色・スキルなし の ボーナスぶんは 光る色で 足す
    const v = c.stats[k], scale = NS.STAT_BASE_MAX[k] / 0.9;
    const pure = Math.min(v, NS.pureStats(c)[k]);
    const pct = Math.min(100, (pure / scale) * 100), bonus = Math.max(0, Math.min(100, (v / scale) * 100) - pct);
    const colors = { hp: ['#a6ff96', '#4cc94a'], mp: ['#9fd4ff', '#2f8ae0'], atk: ['#ffb08a', '#e8502f'], def: ['#ffe39a', '#d9a020'], spd: ['#b0ffd8', '#2fbf86'], eva: ['#e0c0ff', '#9a5ae0'] }[k];
    const g = c.genes && c.genes[k];
    const tal = c.talents.includes(k) ? `★${g > 1 ? g.toFixed(2) : ''}` : ''; // 才能開花の 強さ (遺伝子 1.00〜1.35)
    return `<span>${NS.STAT_LABELS[k]}</span><span class="bar" style="--bc-l:${colors[0]};--bc:${colors[1]}" title="点線 = 基礎の 理論上の 最大 (${NS.STAT_BASE_MAX[k]})。光る部分 = ★・頭・色・スキルなし の ボーナス"><i style="width:${pct}%"></i>${bonus > 0.2 ? `<i class="bonus" style="left:${pct}%;width:${bonus}%"></i>` : ''}<b class="cap"></b></span><span class="val">${v}${k === 'eva' ? '%' : ''}</span><span class="tal" title="才能開花 (遺伝子 1.00〜1.35)">${tal}</span>`;
  }

  function skillIcon(sk, size = 28) {
    if (!sk) return '';
    return `<img class="sk-icon" src="${NS.skillIconURL(sk, size)}" width="${size}" height="${size}" alt="">`;
  }
  function skillChips(sk) {
    const e = sk.elem ? `<span class="chip"><span class="dot" style="--c:${NS.ELEMENTS[sk.elem].color}"></span>${NS.ELEMENTS[sk.elem].name}</span>` : '';
    const a = sk.area && sk.kind === 'attack' ? `<span class="chip">${NS.AREA_LABEL[sk.area]}</span>` : '';
    return e + a;
  }
  function skillRow(sk) {
    if (!sk) return '<div class="skill noskill"><span class="sk-none">－</span><div class="sk-body"><div class="sk-name">スキルなし</div><div class="sk-desc">アンテナを持たない。MP のぶんを ほかの能力に まわしている (特に攻撃)</div></div><span></span></div>';
    return `<div class="skill">${skillIcon(sk, 34)}<div class="sk-body"><div class="sk-name">${esc(sk.name)} ${skillChips(sk)}</div><div class="sk-desc">${esc(NS.skillDesc(sk))}</div></div><span class="sk-mp">MP ${sk.mp}</span></div>`;
  }

  // 状態異常耐性 (全部に つくものは まとめて 表示)
  function stresChips(c, head) {
    const base = Math.min(...Object.keys(NS.STATUS).map((k) => (c.stres && c.stres[k]) || 0));
    const out = base ? [`<span class="chip resist">全状態異常 +${base}</span>`] : [];
    for (const [k, v] of Object.entries(c.stres || {})) if (v > base) out.push(`<span class="chip resist">${NS.STATUS[k].icon} ${NS.STATUS[k].name} +${v}</span>`);
    return out.join('') || '<span class="chip">なし</span>';
  }

  function renderPreview() {
    const box = $('#preview');
    const name = pvKey || NS.normalizeName($('#name-input').value);
    previewName = name;
    if (!name) {
      box.innerHTML = '<div class="pv-empty">名前を入力すると、ここに その名の個体が現れます。<br>同じ名前は 世界に ひとつ。強い名前を 探しだそう。</div>';
      previewCanvas = null;
      return;
    }
    const c = ch(name);
    const C = NS.COLORS[c.color];
    const head = NS.HEADS.find((h) => h.key === c.head);
    const res = NS.ELEM_KEYS.filter((k) => c.res[k]).map((k) => {
      const v = c.res[k];
      return `<span class="chip ${v < 0 ? 'weak' : 'resist'}"><span class="dot" style="--c:${NS.ELEMENTS[k].color}"></span>${NS.ELEMENTS[k].name} ${v > 0 ? '+' + v : v}</span>`;
    }).join('') || '<span class="chip">なし</span>';
    const inRoster = save.roster.includes(name);
    const inParty = save.party.includes(name);
    const bless = c.aura ? '<span class="bless aura">✦ オーラ</span>' : '';
    const auraLine = c.aura ? `<div class="head-fx aura-fx">✦ オーラ (${C.name}): ${esc(C.aura.desc)}</div>` : '';
    const origin = c.kid ? `<div class="head-fx kid-fx">✦ 精霊の祠で 生まれた 第${c.kid.gen - 1}世代 ― 親: ${esc(c.kid.parents[0])} × ${esc(c.kid.parents[1])}</div>`
      : c.boss ? `<div class="head-fx boss-fx">✦ ${esc(bossTeamName(c.key))}の 一員 (名前から 生まれた個体ではない)</div>` : '';
    const bred = save.bred.includes(name) ? '<span class="chip">出生ずみ</span>' : '';
    box.innerHTML = `
      <div class="pv-top">
        <div class="pv-stage"><canvas class="pv-canvas" id="pv-canvas"></canvas><span class="pv-hint">ドラッグで まわせる</span></div>
        <div class="pv-info">
          <div class="pv-name">${esc(c.name)}</div>
          <div class="pv-rankline">${rankBadge(c.rank)} 名力 <b>${c.score}</b> ${bless} <span class="chip pot-chip" title="格: HP・MP・攻撃・防御・素早さ 全部に かかる 倍率 (名前からは 0.86〜1.14)">格 ×${c.pot.toFixed(2)}</span></div>
          <div class="chips">${colorChip(c)}<span class="chip">頭: ${head.name} ${'★'.repeat(head.rank - 1)}</span><span class="chip">体型: ${NS.BODY[c.body].label}</span><span class="chip">背: ${NS.HEIGHTS[c.evaBase].label}</span>${bred}</div>
          ${origin}
          ${C.desc ? `<div class="hint small">${esc(C.name)}色: ${esc(C.desc)}</div>` : ''}
          ${auraLine}
          ${head.desc ? `<div class="head-fx">✦ ${esc(head.name)}の頭: ${esc(head.desc)}</div>` : ''}
        </div>
      </div>
      <div class="pv-stats">${['hp', 'mp', 'atk', 'def', 'spd', 'eva'].map((k) => statRow(k, c)).join('')}</div>
      <div class="pv-sec">属性耐性</div>
      <div class="chips">${res}</div>
      <div class="pv-sec">状態異常耐性</div>
      <div class="chips">${stresChips(c, head)}</div>
      <div class="pv-sec">スキル</div>
      <div class="skill-list">${skillRow(c.skill)}</div>
      ${inRoster && save.dake > 0 ? `<div class="pv-sec">しゅっせいダケ</div><div class="equip"><b>🍄 しゅっせいダケ ×${save.dake}</b> <span class="hint small">${save.bred.includes(name) ? '食べさせると もう一度 出生できる' : 'まだ 出生して いないので 食べさせなくても 出生できる'}</span> <button class="btn small primary" data-act="dake" ${save.bred.includes(name) ? '' : 'disabled'}>食べさせる</button></div>` : ''}
      ${inRoster && save.potOrbs > 0 ? `<div class="pv-sec">格の宝玉</div><div class="equip"><b>🔮 格の宝玉 ×${save.potOrbs}</b> <span class="hint small">1こで 格 +0.01 (上限 ×${NS.POT_MAX.toFixed(2)})</span> <button class="btn small primary" data-act="pot-orb" ${c.pot >= NS.POT_MAX ? 'disabled' : ''}>使う</button></div>` : ''}
      ${inRoster && (NS.equipKeys(c.equips).length || Object.keys(save.items).some((k) => save.items[k] > 0)) ? `<div class="pv-sec">装備</div><div class="equip-row">${equipButtons(name, c)}</div>` : ''}
      <div class="pv-actions">
        ${inRoster
          ? `<button class="btn ${inParty ? '' : 'primary'}" data-act="toggle-party">${inParty ? 'パーティから外す' : 'パーティに入れる'}</button>`
          : `<button class="btn primary" data-act="add">なかまにする</button>`}
        ${NS.isSpecial(name) ? '' : '<button class="btn" data-act="share">名前をコピー</button>'}
      </div>`;
    previewCanvas = $('#pv-canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    previewCanvas.width = previewCanvas.clientWidth * dpr;
    previewCanvas.height = previewCanvas.clientHeight * dpr;
    if (lastPreview !== name) { pvTurn = null; lastPreview = name; }
    previewCanvas.addEventListener('pointerdown', (e) => {
      pvDrag = { x: e.clientX, turn0: pvTurn == null ? Math.sin(NS.time * 0.7) * 1.3 : pvTurn };
      previewCanvas.setPointerCapture(e.pointerId);
    });
    previewCanvas.addEventListener('pointermove', (e) => { if (pvDrag) pvTurn = pvDrag.turn0 + (e.clientX - pvDrag.x) * 0.025; });
    const stop = () => { pvDrag = null; };
    previewCanvas.addEventListener('pointerup', stop);
    previewCanvas.addEventListener('pointercancel', stop);
  }
  let lastPreview = null;

  // 軍団の なかまの キーから 軍団の名前
  function bossTeamName(key) { const p = String(key).split(':')[1]; const cup = NS.CUPS.find((x) => x.boss === p); return cup ? cup.name : '名のある軍団'; }

  function addToRoster(name, toParty = true) {
    if (!name) return false;
    if (save.roster.includes(name)) return false;
    save.roster.push(name);
    save.recruits = (save.recruits || 0) + 1;
    if (toParty && save.party.length < 8) save.party.push(name);
    const c = ch(name);
    if (!save.best || c.score > ch(save.best).score) save.best = name;
    persist();
    return true;
  }

  // 装備: 持っている 服を 着せる / ぬがせる。あまりが なければ ほかの なかまから 着がえさせる
  // 部位 (服・せなか) ごとに 1つ。あまりが なければ ほかの なかまから 着がえさせる
  const equipIcon = (E) => (E.img ? `<img class="eq-img" src="${E.img}" alt="">` : E.icon);
  const wearers = (k) => Object.keys(save.equip).filter((n) => save.equip[n] && save.equip[n][NS.EQUIPS[k].slot] === k);
  function equipButtons(name, c) {
    const cur = c.equips || {};
    return Object.keys(NS.EQUIPS).filter((k) => (save.items[k] || 0) > 0 || cur[NS.EQUIPS[k].slot] === k).map((k) => {
      const E = NS.EQUIPS[k], slot = NS.EQUIP_SLOTS[E.slot];
      return cur[E.slot] === k
        ? `<div class="equip on"><span class="chip">${slot}</span><b>${equipIcon(E)} ${esc(E.name)}</b> を 装備中 <span class="hint small">(${esc(E.desc)})</span> <button class="btn small" data-act="unequip:${k}">はずす</button></div>`
        : `<div class="equip"><span class="chip">${slot}</span><b>${equipIcon(E)} ${esc(E.name)}</b> <span class="hint small">${esc(E.desc)} ・ ${wearers(k).length}/${save.items[k]}こ 使用中</span> <button class="btn small primary" data-act="equip:${k}">装備する</button></div>`;
    }).join('');
  }
  function setEquip(name, k, on) {
    const E = NS.EQUIPS[k];
    if (on) {
      const used = wearers(k);
      if (used.length >= (save.items[k] || 0)) delete save.equip[used[0]][E.slot]; // あまりが ない → いちばん前に 装備した なかまから
      save.equip[name] = Object.assign({}, save.equip[name], { [E.slot]: k });
      toast(`${NS.charOf(name).name} に ${E.name} を 装備した`);
    } else {
      if (save.equip[name]) delete save.equip[name][E.slot];
      toast('はずした');
    }
    for (const n in save.equip) if (!Object.keys(save.equip[n]).length) delete save.equip[n];
    NS.sfx('select');
    persist();
  }

  function onPreviewAction(act) {
    const name = previewName;
    if (!name) return;
    if (act.startsWith('equip:')) { setEquip(name, act.slice(6), true); renderParty(); return; }
    if (act.startsWith('unequip:')) { setEquip(name, act.slice(8), false); renderParty(); return; }
    if (act === 'dake') { // しゅっせいダケ: 出生ずみを とく
      if (!(save.dake > 0) || !save.bred.includes(name)) return;
      save.dake--;
      save.bred = save.bred.filter((k) => k !== name);
      NS.sfx('rare');
      toast(`${ch(name).name} は しゅっせいダケを 食べた! もう一度 出生できる`);
      persist(); renderParty(); return;
    }
    if (act === 'pot-orb') {
      const c = ch(name);
      if (save.potOrbs <= 0 || c.pot >= NS.POT_MAX) return;
      save.potOrbs--;
      save.potBonus[name] = Math.round(((save.potBonus[name] || 0) + 0.01) * 100) / 100;
      NS.sfx('rare');
      toast(`${c.name} の 格が ×${ch(name).pot.toFixed(2)} に 上がった!`);
      persist(); renderParty(); return;
    }
    if (act === 'add') {
      addToRoster(name);
      NS.sfx('confirm');
      toast(`${name} が なかまになった!`);
    } else if (act === 'toggle-party') {
      if (save.party.includes(name)) save.party = save.party.filter((n) => n !== name);
      else if (save.party.length >= 8) { toast('パーティは 8人まで'); return; }
      else save.party.push(name);
      NS.sfx('select');
      persist();
    } else if (act === 'share') {
      const c = ch(name);
      const text = `【NAMESIS】${c.name} ランク${c.rank} 名力${c.score} (${NS.COLORS[c.color].name}/${c.skill ? c.skill.name : 'スキルなし'})`;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        () => toast('コピーしました'), () => toast(text, 3000));
      return;
    }
    renderParty();
    setShowcase(save.party, 'party');
  }

  // なかまと お別れする (パーティにいる なかまは 外せない)
  function releaseKey(name) {
    if (!save.roster.includes(name)) return;
    if (save.party.includes(name)) { toast('パーティにいる なかまは 外せません'); return; }
    if (isFav(name)) { toast('お気に入り (★) の なかまは 外せません'); return; }
    const c = ch(name);
    if (c.kid) delete save.kids[name.slice(name.indexOf(':') + 1)];
    prunePresets((n) => n !== name);
    save.roster = save.roster.filter((n) => n !== name);
    delete save.equip[name];
    delete save.potBonus[name];
    delete save.geneBonus[name];
    if (shrine.last === name) shrine.last = null;
    if (previewName === name && NS.isSpecial(name)) { pvKey = null; $('#name-input').value = ''; } // 名前を打っても もどらない個体
    NS.sfx('cancel');
    toast(`${c.name} と お別れした`);
    persist();
  }

  // お気に入り (★): お別れ・転生の いけにえ・まとめて お別れ から 守る
  const isFav = (k) => save.fav.includes(k);
  function toggleFav(k) {
    if (!save.roster.includes(k)) return;
    save.fav = isFav(k) ? save.fav.filter((x) => x !== k) : save.fav.concat(k);
    NS.sfx(isFav(k) ? 'confirm' : 'cancel');
    if (releasePick === k) releasePick = null;
    persist();
    renderParty();
  }
  const favBtn = (k) => `<button class="fav-btn ${isFav(k) ? 'on' : ''}" data-fav-toggle="${esc(k)}" title="お気に入り (★の なかまは お別れ できない)">${isFav(k) ? '★' : '☆'}</button>`;

  // お別れモード: なかまを えらぶと その場に「お別れ」ボタンが出る
  let releaseMode = false, releasePick = null;
  function setReleaseMode(on) {
    releaseMode = on;
    releasePick = null;
    const b = $('#release-mode');
    b.classList.toggle('on', on);
    b.textContent = on ? 'お別れモード 終了' : 'なかまから外す';
    $('#roster-list').classList.toggle('rel-mode', on);
  }

  function renderParty() {
    renderPreview();
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const n = save.party[i];
      if (n) slots.push(`<div class="slot filled" data-i="${i}" data-name="${esc(n)}" title="${esc(ch(n).name)}"><img src="${NS.bodyThumb(ch(n), 60, 84)}" alt="" draggable="false"><span class="slot-name">${esc(ch(n).name)}</span></div>`);
      else slots.push(`<div class="slot" data-i="${i}"></div>`);
    }
    $('#party-slots').innerHTML = slots.join('');
    $('#party-count').textContent = `${save.party.length}/8`;
    const sortKey = $('#roster-sort').value;
    const list = sortKeys(filterKeys(save.roster, 'lab'), sortKey);
    $('#roster-count').textContent = list.length === save.roster.length ? `${save.roster.length}人` : `${list.length} / ${save.roster.length}人`;
    $('#roster-list').innerHTML = list.map((n) => {
      const c = ch(n);
      const sub = subLabel(c, sortKey, '名力 ');
      const pick = releaseMode && n === releasePick;
      const farewell = pick ? `<div class="farewell">${c.kid ? '<span>二度と もどらない</span>' : ''}<button class="btn small danger" data-farewell>お別れ</button><button class="btn small" data-farewell-cancel>やめる</button></div>` : '';
      return `<div class="rcard ${save.party.includes(n) ? 'in-party' : ''} ${isFav(n) ? 'fav' : ''} ${c.kid ? 'kid' : ''} ${save.bred.includes(n) ? 'bred' : ''} ${!releaseMode && n === previewName ? 'sel' : ''} ${pick ? 'rel-pick' : ''}" data-name="${esc(n)}">${farewell}${favBtn(n)}
        <img class="rc-body" src="${NS.bodyThumb(c, 40, 56)}" alt="" draggable="false">
        <div style="min-width:0"><div class="rc-name">${esc(c.name)}</div><div class="rc-sub">${rankBadge(c.rank)}${sub}</div></div>
        ${skillIcon(c.skill, 22)}
        ${save.party.includes(n) ? '<span class="pmark">PT</span>' : c.kid ? `<span class="pmark kid">第${c.kid.gen - 1}世代</span>` : ''}
        ${save.bred.includes(n) ? '<span class="bred-mark" title="出生ずみ">出生ずみ</span>' : ''}
      </div>`;
    }).join('') || (save.roster.length ? '<div class="hint">しぼりこみに あう なかまが いません</div>' : '<div class="hint">まだ なかまが いません。左で 名前をつけよう。</div>');
    $('#btn-farewell-bred').textContent = `第${save.farewellGen}世代の 出生ずみと お別れ`;
    renderPresets();
  }

  // なかまの 並べかえ (命名所・精霊の祠 共通)
  const genOf = (c) => (c.kid ? c.kid.gen - 1 : 0); // 名前から 生まれた個体は 第0世代
  function sortKeys(keys, key) {
    const list = keys.slice();
    if (key === 'new') return list.reverse();
    if (key === 'score') return list.sort((a, b) => ch(b).score - ch(a).score);
    if (key === 'gen') return list.sort((a, b) => genOf(ch(b)) - genOf(ch(a)) || ch(b).score - ch(a).score);
    if (key === 'skill') return list.sort((a, b) => skillOrder(ch(a).skill).localeCompare(skillOrder(ch(b).skill)) || ch(b).score - ch(a).score);
    return list.sort((a, b) => ch(b).stats[key] - ch(a).stats[key]);
  }
  // スキル順: 属性攻撃 (属性 → 範囲 → 強い順) → かいふく → ふっかつ → 能力アップ → たくわえる → 状態異常 → なおす → 能力ダウン → スキルなし
  const SK_KIND = { attack: 0, heal: 1, revive: 2, buff: 3, charge: 4, status: 5, cure: 6, debuff: 7 };
  const SK_AREA = { single: 0, three: 1, all: 2 };
  function skillOrder(sk) {
    if (!sk) return '9';
    const e = sk.elem ? String(NS.ELEM_KEYS.indexOf(sk.elem)) : '0';
    return `${SK_KIND[sk.kind] ?? 8}${e}${SK_AREA[sk.area] ?? 0}${9 - (sk.tier || 0)}${sk.name}`;
  }

  function subLabel(c, key, pre) {
    if (key === 'gen') return `第${genOf(c)}世代 ・ ${c.score}`;
    if (key === 'skill') return `${c.skill ? esc(c.skill.name) : 'スキルなし'} ・ ${c.score}`;
    return key === 'score' || key === 'new' ? `${pre}${c.score}` : `${NS.STAT_LABELS[key]} ${c.stats[key]}`;
  }

  // しぼりこみ (色・頭・世代)。命名所と 精霊の祠に それぞれ ある
  // スキルの しぼりこみ: 属性攻撃 (すべて / 属性 / 範囲)・補助スキルの 名前・スキルなし
  const SUPPORT_FILTER = [...new Set(['heal0', 'healall', 'revive', 'reviveall', 'buffall_atk', 'buffall_def', 'buffall_spd', 'buffall_eva', 'charge1', 'chargeall', 'debuffall_spd', 'debuffall_atk', 'debuffall_def',
    'st_sleep', 'st_poison', 'st_paralyze', 'stall_sleep', 'stall_poison', 'stall_paralyze', 'stall_seal', 'cureall', 'weaken_st', 'weaken_res'].map((k) => NS.skillByKey(k).name))];
  function skillMatch(sk, f) {
    if (f === 'none') return !sk;
    if (!sk) return false;
    const [t, v] = f.split(':');
    if (t === 'kind') return sk.kind === v;
    if (t === 'elem') return sk.kind === 'attack' && sk.elem === v;
    if (t === 'area') return sk.kind === 'attack' && sk.area === v;
    return sk.name === v;
  }
  function buildFilters() {
    const opt = (v, t) => `<option value="${v}">${t}</option>`;
    const html = `<span class="hint small">しぼりこみ</span>
      <select class="f-color">${opt('', '色: すべて')}${NS.COLOR_KEYS.map((k) => opt(k, NS.COLORS[k].name)).join('')}</select>
      <select class="f-head">${opt('', '頭: すべて')}${NS.HEADS.map((h) => opt(h.key, h.name)).join('')}</select>
      <select class="f-gen">${opt('', '世代: すべて')}${opt('0', '名前から (第0)')}${opt('kid', '出生の子 (第1〜)')}${opt('1', '第1世代')}${opt('2', '第2世代')}${opt('3', '第3世代〜')}</select>
      <select class="f-skill">${opt('', 'スキル: すべて')}
        <optgroup label="属性攻撃">${opt('kind:attack', '属性攻撃 すべて')}${NS.ELEM_KEYS.map((e) => opt('elem:' + e, NS.ELEMENTS[e].name + '属性')).join('')}${opt('area:single', '1体')}${opt('area:three', '3体')}${opt('area:all', '全体')}</optgroup>
        <optgroup label="補助">${SUPPORT_FILTER.map((n) => opt('name:' + n, n)).join('')}</optgroup>
        ${opt('none', 'スキルなし')}</select>`;
    for (const id of ['lab', 'shrine']) $(`#${id}-filter`).innerHTML = html;
  }
  function filterKeys(keys, id) {
    const el = $(`#${id}-filter`);
    const color = el.querySelector('.f-color').value, head = el.querySelector('.f-head').value, gen = el.querySelector('.f-gen').value;
    const skill = el.querySelector('.f-skill').value;
    return keys.filter((k) => {
      const c = ch(k), g = genOf(c);
      if (color && c.color !== color) return false;
      if (head && c.head !== head) return false;
      if (skill && !skillMatch(c.skill, skill)) return false;
      if (gen === 'kid') return g >= 1;
      if (gen === '3') return g >= 3;
      if (gen) return g === +gen;
      return true;
    });
  }

  // ---------------- パーティ保存 ----------------
  // ふだんは たたんでおく。保存するたびに 枠が ふえる
  const MAX_PRESETS = 20;
  const presetOf = (i) => (save.presets[i] || []).filter((k) => save.roster.includes(k));
  function renderPresets() {
    const el = $('#preset-list');
    if (!el) return;
    $('#preset-count').textContent = save.presets.length ? `${save.presets.length}` : '';
    el.innerHTML = save.presets.map((_, i) => {
      const p = presetOf(i);
      return `<div class="preset">
        <b class="pn">${i + 1}</b>
        <span class="pp">${p.map((k) => `<img src="${NS.portrait(ch(k), 28)}" alt="" title="${esc(ch(k).name)}">`).join('')}</span>
        <button class="btn small" data-preset-load="${i}" ${p.length ? '' : 'disabled'}>よびだす</button>
        <button class="btn small" data-preset-save="${i}" title="今のパーティで 上書きする">上書き</button>
        <button class="btn small preset-del" data-preset-del="${i}" title="この保存を けす">×</button>
      </div>`;
    }).join('') + (save.presets.length < MAX_PRESETS
      ? '<button class="btn small preset-add" data-preset-add>＋ 今のパーティを 保存</button>'
      : `<div class="hint small">保存は ${MAX_PRESETS}こまで</div>`);
  }
  // パーティ保存と その装備 (presetEquip[i] = { 名前: { 部位: 装備 } }) を いっしょに つめる
  function prunePresets(keep) {
    const P = [], E = [];
    (save.presets || []).forEach((p, i) => {
      const q = (p || []).filter(keep);
      if (!q.length) return;
      P.push(q); E.push((save.presetEquip || [])[i] || null);
    });
    save.presets = P; save.presetEquip = E;
  }
  function unequipAll(names) {
    let n = 0;
    for (const k of names) if (save.equip[k]) { delete save.equip[k]; n++; }
    if (!n) { toast('はずす 装備が ありません'); return; }
    persist(); NS.sfx('select');
    toast(`${n}体の 装備を はずした`);
    renderParty();
  }
  function savePreset(i) { // i = 上書きする番号 (なければ 新しい枠)
    if (!save.party.length) { toast('パーティが いません'); return; }
    if (i == null) {
      if (save.presets.length >= MAX_PRESETS) return;
      i = save.presets.length;
    }
    save.presets[i] = save.party.slice();
    save.presetEquip[i] = Object.fromEntries(save.party.filter((k) => save.equip[k]).map((k) => [k, Object.assign({}, save.equip[k])]));
    persist();
    NS.sfx('confirm');
    toast(`パーティ${i + 1} に 保存した`);
    renderParty();
  }
  function deletePreset(i) {
    if (!window.confirm(`パーティ${i + 1} の 保存を けしますか?`)) return;
    save.presets.splice(i, 1);
    save.presetEquip.splice(i, 1);
    persist();
    NS.sfx('cancel');
    renderParty();
  }
  function loadPreset(i) {
    const all = save.presets[i] || [], p = presetOf(i).slice(0, 8);
    if (!p.length) return;
    save.party = p;
    const pe = save.presetEquip[i];
    if (pe) for (const k of p) { // 保存した ときの 装備に もどす (持っている 数を こえる ぶんは ほかの なかまから)
      for (const sl of Object.keys(save.equip[k] || {})) delete save.equip[k][sl];
      for (const [sl, ek] of Object.entries(pe[k] || {})) {
        if (!NS.EQUIPS[ek] || !(save.items[ek] > 0)) continue;
        const used = wearers(ek).filter((n) => n !== k), mine = p.filter((n) => n !== k && (save.equip[n] || {})[sl] === ek && pe[n] && pe[n][sl] === ek);
        if (used.length >= save.items[ek]) { const from = used.find((n) => !mine.includes(n)) || used[0]; delete save.equip[from][sl]; }
        save.equip[k] = Object.assign({}, save.equip[k], { [sl]: ek });
      }
    }
    for (const n in save.equip) if (!Object.keys(save.equip[n]).length) delete save.equip[n];
    persist();
    NS.sfx('confirm');
    toast(`パーティ${i + 1} を よびだした${p.length < all.length ? ' (いなくなった なかまは のぞいた)' : ''}`);
    if (current === 'party') { renderParty(); setShowcase(save.party, 'party'); }
    if (current === 'cups') { renderCups(); setShowcase(save.party, 'cups'); }
  }

  // 10連 (ひらがな・カタカナ) / 100連 (漢字・アルファベットまじり)。100連は 名力の高い順に ならべる
  let gachaMode = 10;
  function openGacha(mode = gachaMode) {
    gachaMode = mode;
    const big = mode === 100;
    const names = [];
    while (names.length < mode) {
      const n = big ? NS.randomFancyName() : NS.randomName();
      if (!names.includes(n)) names.push(n);
    }
    const chars = names.map(ch);
    gacha = { chars, sort: big ? 'score' : 'none', raw: gacha ? gacha.raw : false };
    sortGacha();
    const bestScore = Math.max(...chars.map((c) => c.score));
    const count = (r) => chars.filter((c) => c.rank === r).length;
    const tally = big ? `<div class="gacha-tally">${['NAMESIS', 'SS', 'S', 'A'].map((r) => `${rankBadge(r)} ${count(r)}`).join(' ・ ')}</div>` : '';
    $('#modal-box').innerHTML = `
      <h3>${big ? '100連 命名 (漢A)' : '10連 命名'} <span class="hint">― 気になる名前を えらぶと 命名所で 確認できる</span></h3>
      ${tally}
      <div class="row gacha-sorts">${GACHA_SORTS.map(([k, l]) => `<button class="btn small ${gacha.sort === k ? 'on' : ''}" data-act="gacha-sort" data-sort="${k}">${l}</button>`).join('')}<button class="btn small ${gacha.raw ? 'on' : ''}" data-act="gacha-raw" title="才能開花 (★) の 倍率が かかる前の 数値で 並べる">★の倍率なし</button></div>
      <div class="gacha-grid ${big ? 'big' : ''}">${chars.map((c) => gachaCard(c, bestScore, false)).join('')}</div>
      <div class="row" style="justify-content:center">
        <button class="btn primary" data-act="again">もう一度</button>
        <button class="btn" data-act="close">とじる</button>
      </div>`;
    $('#modal').classList.remove('hidden');
    const cards = [...document.querySelectorAll('.gcard')];
    cards.forEach((el, i) => setTimeout(() => {
      el.classList.add('shown');
      const r = chars[i].rank;
      if (!big || i < 12) NS.sfx(['S', 'SS', 'NAMESIS'].includes(r) ? 'rare' : 'reveal');
    }, (big ? 12 : 90) * i + 60));
  }

  // 命名ガチャの 並びかえ
  let gacha = null;
  const GACHA_SORTS = [['none', '出た順'], ['score', '名力順'], ['hp', 'HP順'], ['mp', 'MP順'], ['atk', '攻撃順'], ['def', '防御順'], ['spd', '素早さ順'], ['eva', '回避順'], ['skill', 'スキル順']];
  function sortGacha() {
    const k = gacha.sort;
    if (!gacha.order) gacha.order = gacha.chars.slice();
    gacha.chars.splice(0, gacha.chars.length, ...gacha.order);
    if (k === 'score') gacha.chars.sort((a, b) => b.score - a.score);
    else if (k === 'skill') gacha.chars.sort((a, b) => skillOrder(a.skill).localeCompare(skillOrder(b.skill)) || b.score - a.score);
    else if (k !== 'none') gacha.chars.sort((a, b) => gStat(b, k) - gStat(a, k) || b.score - a.score);
  }
  // ★の 倍率なし (raw) の ときは 才能開花の 前の 数値で 並べる・表示する
  const gStat = (c, k) => (gacha && gacha.raw ? NS.baseStats(c) : c.stats)[k];
  const gachaLabel = (c) => (!gacha || gacha.sort === 'none' || gacha.sort === 'score' || gacha.sort === 'skill' ? `名力 ${c.score}` : `${NS.STAT_LABELS[gacha.sort]} ${gStat(c, gacha.sort)}${gacha.sort === 'eva' ? '%' : ''}${gacha.raw && c.talents.includes(gacha.sort) ? ` <small>(★${c.stats[gacha.sort]})</small>` : ''}`);
  const gachaCard = (c, best, shown) => `
        <div class="gcard ${shown ? 'shown' : ''} ${c.score === best ? 'best' : ''} glow-${c.rank}" data-name="${esc(c.name)}">
          <img class="g-body" src="${NS.bodyThumb(c, 70, 98)}" alt="" draggable="false">
          <div class="g-name">${esc(c.name)}</div>
          <div>${rankBadge(c.rank)}</div>
          <div class="g-score">${gachaLabel(c)}</div>
          <div class="g-skill">${skillIcon(c.skill, 20)}${c.skill ? esc(c.skill.name) : 'スキルなし'}</div>
        </div>`;
  function resortGacha(k) {
    gacha.sort = k;
    sortGacha();
    const best = Math.max(...gacha.chars.map((c) => c.score));
    document.querySelectorAll('.gacha-sorts [data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === k));
    document.querySelector('.gacha-grid').innerHTML = gacha.chars.map((c) => gachaCard(c, best, true)).join('');
  }

  function closeModal() { $('#modal').classList.add('hidden'); if (ostOpen) { ostOpen = false; NS.bgm.stop(0.6); } }
  // サウンドトラック: すべての BGM を 聞ける (とじると 止まる)
  let ostOpen = false;
  function renderOst() {
    const now = NS.bgm.playing();
    $('#modal-box').innerHTML = `<h3>サウンドトラック</h3><p class="hint small">曲を えらぶと 流れる (もう一度 押すと 止まる)${NS.sound.on ? '' : ' ・ 🔇 音が OFF に なっています'}</p>
      <div class="ost-list">${NS.BGM_LIST.map(([k, name, sub], i) => (save.heardBgm && save.heardBgm[k]
        ? `<button class="ost-row ${now === k ? 'on' : ''}" data-ost="${k}"><span class="ost-no">${i + 1}</span><span class="ost-name">${name}<small>${sub}</small></span><span class="ost-play">${now === k ? '■' : '▶'}</span></button>`
        : `<button class="ost-row locked" disabled><span class="ost-no">${i + 1}</span><span class="ost-name">???<small>まだ 聴いたことが ない</small></span><span class="ost-play">🔒</span></button>`)).join('')}</div>
      <div class="row reinc-actions"><button class="btn" data-act="close">とじる</button></div>`;
  }
  function openOst() { ostOpen = true; renderOst(); $('#modal').classList.remove('hidden'); }
  NS.bgm.onPlay = (name) => { if (!save.heardBgm) save.heardBgm = {}; if (!save.heardBgm[name]) { save.heardBgm[name] = true; persistQuiet(); } };
  // その他: サウンドトラック・実績報酬・ルールブック
  function openMore() {
    const n = giftReady().length;
    openModal(`<h3>その他</h3>
      <div class="more-list">
        <button class="btn big ost-btn" data-more="ost">🎵 サウンドトラック</button>
        <button class="btn big gift-btn" data-more="gift">🏆 実績報酬${n ? `<span class="gift-badge">${n}</span>` : ''}</button>
        <button class="btn big rule-btn" data-more="rule">📖 ルールブック</button>
      </div>
      <div class="row reinc-actions"><button class="btn" data-act="close">とじる</button></div>`);
  }
  function openGift() {
    const fames = [...new Set(GIFTS.map((g) => g.fame))];
    openModal(`<h3>実績報酬</h3><p class="hint small">名声が とどくと 受けとれる (今の 名声 <b>${save.fame}</b>)</p><div class="gift-list">${fames.map((f) => `<div class="gift-sec ${save.fame >= f ? 'reached' : ''}">名声 ${f.toLocaleString()} ${save.fame >= f ? '✔' : `<span class="hint small">(あと ${(f - save.fame).toLocaleString()})</span>`}</div>` + GIFTS.filter((g) => g.fame === f).map((g) => {
      const got = save.gifts && save.gifts[g.key], ok = g.cond();
      const E = g.item ? NS.EQUIPS[g.item] : null;
      const icon = E ? equipIcon(E) : DAKE.icon, name = E ? E.name : DAKE.name, desc = E ? E.desc : DAKE.desc;
      return `<div class="gift-row ${ok && !got ? 'ready' : ''}"><span class="item-icon">${icon}</span><div><b>${esc(name)}</b> ${E ? `<span class="chip">${NS.EQUIP_SLOTS[E.slot]}</span>` : ''}<br><span class="hint small">${esc(desc)}</span></div>
        ${got ? '<span class="hint">受けとりずみ</span>' : ok ? `<button class="btn primary small" data-gift="${g.key}">受けとる</button>` : '<span class="hint">🔒</span>'}</div>`;
    }).join('')).join('')}</div>
      <div class="row reinc-actions"><button class="btn" data-more="back">もどる</button><button class="btn" data-act="close">とじる</button></div>`);
  }
  function takeGift(key) {
    const g = GIFTS.find((x) => x.key === key);
    if (!g || !g.cond() || (save.gifts && save.gifts[key])) return;
    save.gifts = save.gifts || {};
    save.gifts[key] = true;
    if (g.item) save.items[g.item] = (save.items[g.item] || 0) + 1;
    if (g.dake) save.dake = (save.dake || 0) + g.dake;
    persist();
    NS.sfx('getItem');
    toast(g.item ? `${NS.EQUIPS[g.item].name} を 受けとった! 命名所で 装備できる` : `${DAKE.name} を 受けとった! 命名所で 出生ずみの なかまに 食べさせよう`);
    renderMoreBadge();
    openGift();
  }
  // ルールブック: 属性の 数・相性・耐性の 段階・スキルの 段階
  function openRule() {
    const E = NS.ELEMENTS, en = (k) => `<span class="chip"><span class="dot" style="--c:${E[k].color}"></span>${E[k].name}</span>`;
    const cols = NS.COLOR_KEYS.map((k) => [k, NS.COLORS[k]]);
    const resList = (r, f) => Object.keys(r || {}).filter((k) => f(r[k])).map((k) => en(k) + (Math.abs(r[k]) !== 2 ? `<small>${r[k] > 0 ? '+' : ''}${r[k]}</small>` : '')).join(' ') || '―';
    const mul = (r) => Math.max(0.3, Math.min(1.8, 1 - 0.2 * r));
    const A = NS.SKILL_AREA, W = NS.POWER_WORDS;
    openModal(`<h3>📖 ルールブック</h3><div class="rule-book">
      <h4>属性は 8つ</h4>
      <p>${NS.ELEM_KEYS.map(en).join(' ')}</p>
      <p class="hint small">属性スキルが 当たると、その属性の 状態異常に なることが ある: ${NS.ELEM_KEYS.map((k) => `${E[k].name}→${NS.STATUS[E[k].status].name}`).join(' / ')}。かかっている 間は その属性の 耐性 −1。</p>
      <h4>属性の 相性 (体の 色で きまる)</h4>
      <p class="hint small">それぞれの 色は 自分の 属性に 強く (耐性 +2)、1つの 属性に 弱い (−2)。</p>
      <p class="rule-cycle">火 → 氷 → 風 → 土 → 雷 → 水 → 火 <span class="hint small">(左が 右に 強い: 火の 攻撃は 水色 (氷) に よく 効く)</span><br>光 ⇄ 闇 <span class="hint small">(おたがいに 弱点)</span></p>
      <table class="rule-table"><tr><th>色</th><th>属性</th><th>強い (耐性)</th><th>弱い (弱点)</th></tr>
      ${cols.map(([k, C]) => `<tr><td><span class="dot" style="--c:${C.hex}"></span> ${C.name}</td><td>${C.elem ? en(C.elem) : '―'}</td><td>${resList(C.res, (v) => v > 0)}</td><td>${resList(C.res, (v) => v < 0)}</td></tr>`).join('')}</table>
      <h4>耐性の 段階 (受ける ダメージ)</h4>
      <table class="rule-table"><tr><th>耐性</th>${[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((r) => `<th>${r > 0 ? '+' : ''}${r}</th>`).join('')}</tr>
      <tr><td>倍率</td>${[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((r) => `<td class="${r < 0 ? 'weak' : r > 0 ? 'res' : ''}">×${mul(r).toFixed(1)}</td>`).join('')}</tr></table>
      <p class="hint small">1段 ごとに 20%。×0.3〜×1.8 まで。頭の 形・オーラ・装備 (ジュエルスーツ 全属性 +1) でも 変わる。</p>
      <h4>属性スキルの 段階 (威力)</h4>
      <table class="rule-table"><tr><th>範囲</th><th>段階</th><th>威力</th><th>MP</th></tr>
      ${['single', 'three', 'all'].map((a) => W[a].map((w, i) => `<tr><td>${i ? '' : NS.AREA_LABEL[a]}</td><td>${w}</td><td>${A[a].power[i]}</td><td>${A[a].mp[i]}</td></tr>`).join('')).join('')}${(() => { const G = NS.skillByKey('goheaven'); return `<tr><td>全体 (特別)</td><td>${G.powerWord}</td><td>${G.power}</td><td>${G.mp}</td></tr>`; })()}</table>
      <p class="hint small">天をも つらぬく = ゴーヘブン だけ: 属性耐性の 影響を 受けない。</p>
      <p class="hint small">ダメージ = ${NS.ELEM_BASE} × 威力 × 100 ÷ (100 + 防御 × 0.5) × 属性倍率。攻撃力には よらない。状態異常の 確率: 1体 20% / 3体 15% / 全体 12%。</p>
      <h4>能力アップ・ダウンの 段階</h4>
      <p class="hint small">上げる: 1段ごとに +50% (5段で ×3.5)。回避は 1段 +10%。下げる: −15% / −35% / −55% / −75% / −95%。4ターン 続く。ボスには 下げる わざが 効かない。</p>
      </div>
      <div class="row reinc-actions"><button class="btn" data-more="back">もどる</button><button class="btn" data-act="close">とじる</button></div>`);
  }
  function ostClick(k) {
    if (NS.bgm.playing() === k) NS.bgm.stop(0.4); else NS.bgm.play(k);
    for (const ms of [50, 500, 1500, 3000]) setTimeout(() => ostOpen && renderOst(), ms); // 読みこみが 終わって 流れだしたら ■ に
    if (k === 'fanfare') setTimeout(() => NS.bgm.until(k).then(() => ostOpen && renderOst()), 400); // 1回で 終わる 曲
  }
  function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').classList.remove('hidden'); }

  // ---------------- コロシアム ----------------
  const MEDALS = ['🥉', '🥉', '🥈', '🥇', '🏆', '👑'];
  function cupUnlocked(i) { return i === 0 || !!save.cleared[NS.CUPS[i].id] || !!save.cleared[NS.CUPS[i - 1].id]; } // 制覇ずみの 大会は 前の大会 (あとから 足した NEO-NAMESIS杯 など) に 関係なく 挑める
  // 名のある軍団の メンバー (固定)
  const bossCache = new Map();
  function bossMembers(cup) {
    if (!bossCache.has(cup.boss)) bossCache.set(cup.boss, NS.bossParty(cup.boss));
    return bossCache.get(cup.boss);
  }
  function renderCups() {
    $('#cups-hint').textContent = save.party.length ? `パーティ ${save.party.length}人で 挑戦` : 'まずは 命名所で パーティを 編成しよう';
    const ps = save.presets.map((_, i) => i).filter((i) => presetOf(i).length);
    $('#cup-presets').innerHTML = ps.length ? '<span class="hint small">保存したパーティ:</span>' + ps.map((i) => {
      const on = presetOf(i).join('|') === save.party.join('|');
      return `<button class="btn small ${on ? 'on' : ''}" data-preset-load="${i}">${i + 1}</button>`;
    }).join('') : '';
    const monKeys = Object.keys(NS.MONSTERS).filter((k) => !NS.MONSTERS[k].dungeon).sort((a, b) => (NS.MONSTERS[a].order || 0) - (NS.MONSTERS[b].order || 0));
    const monCard = (k) => {
      const M = NS.MONSTERS[k], m = NS.makeMonster(k);
      return `<div class="cup glass adv monster ${M.event ? 'event' : ''}" data-monster="${k}">
          <span class="medal">${M.medal}</span>
          <h3>VS ${esc(M.name)}<span class="adv-tag">${M.event ? 'イベント' : 'モンスター'}</span></h3>
          <img class="mon-thumb" src="${NS.monsterThumb(m, 90, 110)}" alt="">
          <p>${esc(M.desc)}</p>
          <div class="cup-meta">${M.hidden ? 'HP ??? ・ 行動 ???' : `HP ${M.stats.hp} ・ 1ターンに ${M.actions}回 行動`} ・ 名声 +${M.fame}</div>
          ${M.reward && !save.got?.['mon:' + k] && M.event ? `<div class="hint small">はじめて 勝つと ごほうび: ${equipIcon(NS.EQUIPS[M.reward])} ${esc(NS.EQUIPS[M.reward].name)}</div>` : ''}
          ${save.cleared['mon:' + k] ? '<span class="cleared">討伐!</span>' : ''}
        </div>`;
    };
    const events = monKeys.filter((k) => NS.MONSTERS[k].event);
    $('#cup-list').innerHTML = (events.length ? '<h3 class="cup-sec event-sec">イベントクエスト <span class="hint small">― 特別な 相手が 参戦</span></h3>' + events.map(monCard).join('') + '<h3 class="cup-sec">大会</h3>' : '') + NS.CUPS.map((c, i) => {
      const lock = !cupUnlocked(i);
      let meta = `${c.ranks ? c.ranks.map(rankBadge).join('〜') : ''}`, members = '';
      if (c.boss) {
        const ms = bossMembers(c), sc = ms.map((m) => m.score);
        meta = `名力 ${Math.min(...sc)}〜${Math.max(...sc)}`;
        members = `<div class="boss-row">${ms.map((m) => `<img src="${NS.bodyThumb(m, 30, 42)}" alt="" title="${esc(m.name)}">`).join('')}</div>`;
      }
      return `<div class="cup glass ${lock ? 'locked' : ''} ${c.adv ? 'adv' : ''} cup-${c.id}" data-cup="${i}">
        <span class="medal">${c.medal || MEDALS[i]}</span>
        <h3>${esc(c.name)}${c.adv ? '<span class="adv-tag">上級者向け</span>' : ''}</h3>
        <p>${esc(c.desc)}</p>
        ${members}
        <div class="cup-meta">相手 ${c.n}人 ・ ${meta} ・ 名声 +${c.fame}</div>
        ${save.cleared[c.id] ? '<span class="cleared">制覇!</span>' : ''}
        ${lock ? `<div class="hint small" style="margin-top:8px">🔒 ${esc(NS.CUPS[i - 1].name)}を 制覇すると 挑戦できる</div>` : ''}
      </div>`;
    }).join('') + '<h3 class="cup-sec">モンスターコロシアム <span class="hint small">― 1体の 大きな モンスターに パーティで いどむ</span></h3>'
      + monKeys.filter((k) => !NS.MONSTERS[k].event).map(monCard).join('');
  }

  function cupEnemies(cup) {
    if (cup.boss) return bossMembers(cup);
    const avoid = new Set(save.party);
    const names = [];
    // 最上位ランクは最低1人入れる
    const top = cup.ranks[cup.ranks.length - 1];
    names.push(NS.findNameInRanks([top], Math.random, avoid));
    while (names.length < cup.n) {
      const n = NS.findNameInRanks(cup.ranks, Math.random, new Set([...avoid, ...names]));
      names.push(n);
    }
    return names.sort(() => Math.random() - 0.5);
  }

  // ---------------- フリーバトル ----------------
  function freeNames() {
    return [...new Set($('#free-names').value.split(/\n/).map(NS.normalizeName).filter(Boolean))].slice(0, 8);
  }
  function renderFree() {
    if (!$('#free-names').value.trim()) $('#free-names').value = Array.from({ length: 4 }, () => NS.randomName()).join('\n');
    renderFreePreview();
  }
  function renderFreePreview() {
    $('#free-preview').innerHTML = freeNames().map((n) => {
      const c = ch(n);
      return `<div class="rcard"><img src="${NS.portrait(c, 48)}" alt=""><div style="min-width:0"><div class="rc-name">${esc(n)}</div><div class="rc-sub">${rankBadge(c.rank)}名力 ${c.score}</div></div></div>`;
    }).join('');
  }

  // ---------------- バトル ----------------
  let battleCtx = null; // { battle, cup, enemies, kind }
  async function startBattle(enemyNames, opts) {
    if (!save.party.length && !opts.myChars) { toast('パーティが いません'); show('party'); return; }
    // ボスバトル (モンスター): 画面を 暗くした 瞬間に BGM を 鳴らし、暗い 画面から フェードイン
    const monsterIntro = opts.kind === 'monster' || (opts.kind === 'dungeon' && opts.boss); // どうくつの ボスも 同じ 登場
    if (monsterIntro) {
      await fadeScreen(1, 350);
      const M = NS.MONSTERS[opts.monster];
      if (M.bgm) NS.bgm.play(M.bgm); else NS.bgm.stop(0.3);
    }
    closeModal();
    NS.arenaTheme = opts.kind === 'dungeon' ? 'cave' : opts.kind === 'monster' ? NS.MONSTERS[opts.monster].stage || null : null; // どうくつの バトルは どうくつ・じゃあくのまじょは 地獄の 背景
    document.body.classList.toggle('dark-cup', opts.kind === 'cup' && !!opts.cup && opts.cup.id === 'kokuyoku'); // 黒翼魔導団: 黒い UI と 暗い オーラ
    show('battle');
    NS.scene.mode = 'battle';
    NS.clearFx();
    // コロシアムの敵は 仮の名前 (ナナシA〜) で呼ぶ。名のある軍団は 本当の名前のまま
    const boss = opts.kind === 'cup' && opts.cup.boss ? NS.BOSS_PARTIES[opts.cup.boss] : null;
    const enemies = enemyNames.map((n) => (typeof n === 'string' ? ch(n) : n));
    const aliases = opts.kind === 'cup' && !boss ? enemyNames.map((_, i) => 'ナナシ' + 'ABCDEFGH'[i]) : null;
    aliasSet = new Set(aliases || []);
    bossSet = new Set(boss ? enemies.map((c) => c.name) : []);
    const battle = new NS.Battle(opts.myChars || save.party.map(ch), enemies, {
      title: opts.title, aliases, smartEnemies: !!boss || opts.kind === 'ghost', intro: (boss && boss.intro) || opts.intro, online: opts.online, seed: opts.seed,
      bossBattle: monsterIntro, // ボス (モンスター): 勝つと ファンファーレ・負けると ボス用の 音
    });
    // どうくつ: HP・MP は 前の たたかいの まま (たおれている なかまは たおれたまま)
    if (opts.partyState) battle.party.forEach((u, i) => {
      const st = opts.partyState[i];
      if (!st) return;
      u.hp = u.dispHp = Math.max(0, Math.min(u.maxHp, st.hp)); u.mp = Math.max(0, Math.min(u.maxMp, st.mp));
      if (u.hp <= 0) { u.alive = false; Object.assign(u.v, { lie: 1, gray: 1, alpha: 0.65, expr: 'ko', idle: false }); }
    });
    battleCtx = Object.assign({}, opts, { battle, enemies: enemyNames });
    $('#b-title').textContent = opts.title || '';
    $('#b-turn').textContent = '';
    buildCards(battle);
    updateCtrlButtons();
    if (monsterIntro) setTimeout(() => fadeScreen(0, 1800), 700); // 少し 間を おいて 明るく
    if (!monsterIntro) NS.bgm.play('battle'); // ボス 以外の 対戦の BGM
    NS.sfxPreload('lose', 'bossLose', 'getItem', 'skillElem');
    if (opts.vs) await showVersus(opts.vs);
    if (monsterIntro) NS.speed = 1; // ボスの 登場は 倍速に しない (みんなへの指示が 出たら もとの 速さ)
    const result = await battle.run();
    if (!(monsterIntro && result === 'win')) NS.bgm.stop(1.2); // 勝ったら ファンファーレは そのまま
    showResult(result);
  }

  // 画面全体を 黒く (to = 1) / もどす (to = 0)。ms で ゆっくり
  function fadeScreen(to, ms) {
    let el = document.getElementById('screen-fade');
    if (!el) { el = document.createElement('div'); el.id = 'screen-fade'; document.body.appendChild(el); }
    el.style.transition = `opacity ${ms}ms ease`;
    void el.offsetWidth;
    el.style.opacity = to;
    return new Promise((r) => setTimeout(r, ms));
  }

  // オンライン対戦中は オートなし。速さは 部屋の ホストだけが 変えられて、あいてにも 同じ 速さが つく
  const isOnline = () => !!(battleCtx && battleCtx.kind === 'online');
  // この バトルの 速さの 上限 (じゃあくのまじょ: ×2)
  const speedCap = () => (battleCtx && battleCtx.kind === 'monster' && NS.MONSTERS[battleCtx.monster].maxSpeed) || Infinity;
  function updateCtrlButtons() {
    const on = isOnline(), link = on && battleCtx.online;
    const sp = on ? (link.host ? Math.min(3, save.speed) : link.speed || 1) : Math.min(speedCap(), save.speed); // オンラインは ×3 まで
    $('#b-auto').classList.toggle('on', !!save.auto && !on);
    $('#b-speed').textContent = '×' + sp;
    $('#b-speed').title = on ? (link.host ? 'バトルの 速さ (あいてにも つく)' : 'バトルの 速さは 部屋の ホストが きめる') : 'バトルの 速さ';
    $('#b-auto').disabled = on;
    $('#b-speed').disabled = on && !link.host;
    NS.speed = sp;
  }

  // 最初に あいての 名前・名声・戦績を 見せる
  function showVersus(vs) {
    const side = (p, cls) => `<div class="vs-side ${cls}"><b>${esc(p.name)}</b><span>名声 ${p.fame}</span><small>${p.wins}勝 ${p.losses}敗${p.draws ? ` ${p.draws}分` : ''}</small></div>`;
    const el = $('#b-vs');
    el.innerHTML = side(vs.me, 'me') + '<div class="vs-mark">VS</div>' + side(vs.foe, 'foe');
    el.classList.add('on');
    NS.sfx('rare');
    return new Promise((ok) => setTimeout(() => { el.classList.remove('on'); ok(); }, 2800));
  }

  const cardEls = new Map();
  function buildCards(battle) {
    const wrap = $('#b-cards');
    const n = battle.party.length;
    wrap.style.setProperty('--n', Math.max(4, n));
    wrap.style.setProperty('--nm', n > 4 ? Math.ceil(n / 2) : Math.max(n, 2));
    cardEls.clear();
    wrap.innerHTML = '';
    for (const u of battle.party) {
      const el = document.createElement('div');
      el.className = 'bcard';
      el.innerHTML = `
        <div class="face"><img src="${NS.portrait(u.ch, 64)}" alt=""></div>
        <div class="bc-st"></div>
        <div class="bc-head">${rankBadge(u.ch.rank)}<span class="bc-name">${esc(u.name)}</span></div>
        <div class="bc-row"><b class="hp">HP</b><span class="bc-num hpn"></span></div>
        <div class="bar hp"><i class="trail"></i><i class="fill"></i></div>
        <div class="bc-row"><b class="mp">MP</b><span class="bc-num mpn"></span></div>
        <div class="bar mp"><i class="fill"></i></div>
        <div class="bc-cmd"></div>`;
      el.addEventListener('click', () => onCardClick(u));
      el.addEventListener('mouseenter', () => onCardHover(u, true));
      el.addEventListener('mouseleave', () => onCardHover(u, false));
      wrap.appendChild(el);
      cardEls.set(u, {
        el, hpn: el.querySelector('.hpn'), mpn: el.querySelector('.mpn'), st: el.querySelector('.bc-st'),
        trail: el.querySelector('.bar.hp .trail'), fill: el.querySelector('.bar.hp .fill'), mpf: el.querySelector('.bar.mp .fill'), cmd: el.querySelector('.bc-cmd'),
      });
      u.dispHp = u.hp;
    }
    refreshCards();
    requestAnimationFrame(placeCmd);
  }

  function placeCmd() {
    // 行動中のキャラに かぶらない側へ パネルを出す
    const a = NS.scene.active;
    $('#b-cmd').classList.toggle('right', !!(a && a.screen && a.screen.x < window.innerWidth * 0.5));
    const cards = $('#b-cards');
    const h = cards.offsetHeight;
    $('#b-cmd').style.bottom = h + 28 + 'px';
    document.documentElement.style.setProperty('--cmd-bottom', h + 26 + 'px');
  }
  window.addEventListener('resize', () => { if (current === 'battle') placeCmd(); });

  function refreshCards() {
    for (const [u, c] of cardEls) {
      c.el.classList.toggle('ko', !u.alive);
      c.mpn.textContent = u.maxMp ? u.mp : '—';
      c.mpf.style.width = (u.maxMp ? (u.mp / u.maxMp) * 100 : 0) + '%';
      const pct = (u.hp / u.maxHp) * 100;
      c.fill.style.width = pct + '%';
      c.fill.classList.toggle('mid', pct <= 50 && pct > 25);
      c.fill.classList.toggle('low', pct <= 25);
      c.el.classList.toggle('stunned', !!(u.alive && (u.status.sleep || u.status.paralyze || u.status.fear))); // ねむり・まひ・きょうふ は 灰色
      let st = Object.keys(u.status).map((k) => `<span title="${NS.STATUS[k].name}">${NS.STATUS[k].icon}</span>`).join('');
      for (const k in u.buffs) {
        const b = u.buffs[k];
        if (b) st += `<span class="bf ${b > 0 ? 'up' : 'down'}">${NS.STAT_LABELS[k]}${b > 0 ? '▲' : '▼'}${Math.abs(b) > 1 ? Math.abs(b) : ''}</span>`;
      }
      if (u.charge) st += `<span class="bf up" title="たくわえ: 次の 攻撃 ×${2 ** u.charge}">ため×${2 ** u.charge}</span>`;
      if (u.guard) st += '<span title="ぼうぎょ">🛡️</span>';
      c.st.innerHTML = st;
    }
  }

  // HP の数字は じわじわ減る
  function tick(dt) {
    for (const [u, c] of cardEls) {
      if (u.dispHp !== u.hp) {
        const step = Math.max(40, u.maxHp * 0.9) * dt * NS.speed;
        u.dispHp = u.dispHp > u.hp ? Math.max(u.hp, u.dispHp - step) : Math.min(u.hp, u.dispHp + step);
        c.trail.style.width = (Math.max(u.dispHp, u.hp) / u.maxHp) * 100 + '%';
      } else {
        c.trail.style.width = (u.hp / u.maxHp) * 100 + '%';
      }
      const shown = Math.round(u.dispHp);
      if (c.hpn.textContent !== String(shown)) c.hpn.textContent = shown;
    }
  }

  // 仮の名前は 色を変えて 本当の名前と区別する
  let aliasSet = new Set(), bossSet = new Set();
  function nameHTML(name) {
    if (aliasSet.has(name)) return `<span class="alias">${esc(name)}</span>`;
    if (bossSet.has(name)) return `<span class="boss-name">${esc(name)}</span>`;
    return esc(name);
  }
  NS.ui.isAlias = (name) => aliasSet.has(name);
  function message(text) {
    const m = $('#b-msg');
    if (!text) { m.classList.remove('on'); return; }
    let html = esc(text);
    for (const a of aliasSet) html = html.split(esc(a)).join(`<span class="alias">${esc(a)}</span>`);
    for (const a of bossSet) html = html.split(esc(a)).join(`<span class="boss-name">${esc(a)}</span>`);
    m.innerHTML = html;
    m.classList.remove('on');
    void m.offsetWidth;
    m.classList.add('on');
  }

  function setTurn(n) { $('#b-turn').textContent = `ターン ${n}`; }

  function setActive(u) {
    NS.scene.active = u;
    for (const [k, c] of cardEls) c.el.classList.toggle('active', k === u);
  }

  // ---------------- コマンド入力 ----------------
  // パネルの4つは パーティ全体への指示。下のキャラのアイコン (ステータス枠) をクリックすると
  // そのキャラだけ 個別に指示できる。個別に指示したキャラは そちらを優先し、ほかは 全体の指示に従う。
  let cmdState = null;
  function onCardClick(u) {
    if (!cmdState) return;
    if (cmdState.cardPick) cmdState.cardPick(u);
    else if (cmdState.openUnit && u.alive) { NS.sfx('select'); cmdState.openUnit(u); }
  }
  function onCardHover(u, on) {
    NS.scene.cardHover = cmdState && on && u.alive ? u : null;
  }
  function cmdLabel(cmd) {
    if (!cmd) return '';
    if (cmd.type === 'guard') return '🛡️ ぼうぎょ';
    if (cmd.type === 'skill') return '✨ ' + cmd.skill.name;
    return '⚔️ ' + (cmd.target ? cmd.target.name : 'こうげき');
  }
  function setCardCmd(u, cmd) {
    const c = cardEls.get(u);
    if (!c) return;
    c.cmd.textContent = cmdLabel(cmd);
    c.el.classList.toggle('has-cmd', !!cmd);
  }

  function collectCommands(battle) {
    updateCtrlButtons(); // ボスの 登場で ×1 に していた 速さを もどす
    const alive = battle.party.filter((u) => u.alive);
    if (save.auto && !battle.online) {
      return NS.wait(250).then(() => {
        const m = new Map();
        for (const [u, c] of battle.planSmart(alive)) m.set(u, c);
        return m;
      });
    }
    return new Promise((resolve) => {
      const cmds = new Map(); // 個別の指示
      const panel = $('#b-cmd');
      // オンライン対戦: 制限時間を すぎたら のこりは がんばれ で動く
      let clock = null;
      if (battle.online && !battle.online.npc) {
        const limit = NS.online.TURN_LIMIT, t0 = Date.now();
        const tickClock = () => {
          const left = Math.max(0, Math.ceil(limit - (Date.now() - t0) / 1000));
          $('#b-turn').innerHTML = `ターン ${battle.turn} ・ <span class="${left <= 10 ? 'clock-low' : ''}">のこり ${left}秒</span>`;
          if (left <= 0) {
            toast('時間切れ! のこりは がんばれ で動く');
            for (const [u, c] of battle.planSmart(rest())) cmds.set(u, c);
            finish();
          }
        };
        tickClock();
        clock = setInterval(tickClock, 500);
      }
      const foes = () => battle.enemies.filter((e) => e.alive);
      const rest = () => alive.filter((u) => !cmds.has(u)); // 全体の指示に従うキャラ
      cmdState = {};
      $('#b-cards').classList.add('cmd-phase');
      for (const u of battle.party) setCardCmd(u, null);

      const finish = (escape) => {
        if (!cmdState) return;
        clearInterval(clock);
        if (battle.online) setTurn(battle.turn);
        lookBack(null);
        NS.scene.targets = null; NS.scene.hover = null; NS.scene.onPick = null; NS.scene.areaOf = null; NS.scene.cardHover = null;
        setActive(null);
        $('#b-cards').classList.remove('cmd-phase');
        for (const u of battle.party) setCardCmd(u, null);
        panel.classList.remove('on');
        panel.innerHTML = '';
        cmdState = null;
        if (escape) cmds.escape = true;
        resolve(cmds);
      };

      const render = (title, buttons, opts = {}) => {
        panel.innerHTML = `<div class="cmd-title">${title}</div><div class="cmd-grid ${opts.one ? 'one' : ''}"></div><div class="cmd-desc"></div>`;
        const grid = panel.querySelector('.cmd-grid');
        const desc = panel.querySelector('.cmd-desc');
        desc.textContent = opts.hint || '';
        for (const b of buttons) {
          const el = document.createElement('button');
          el.className = 'cbtn ' + (b.cls || '');
          el.innerHTML = b.html;
          el.disabled = !!b.disabled;
          el.addEventListener('click', () => { NS.sfx(b.back ? 'cancel' : 'confirm'); b.fn(); });
          el.addEventListener('mouseenter', () => { desc.textContent = b.desc || opts.hint || ''; if (b.hover) b.hover(true); });
          el.addEventListener('mouseleave', () => { desc.textContent = opts.hint || ''; if (b.hover) b.hover(false); });
          if (b.back) el.dataset.back = '1';
          grid.appendChild(el);
        }
        panel.classList.add('on');
        placeCmd();
      };

      const lookBack = (u) => {
        for (const p of battle.party) if (p.alive && p.v.idle) p.v.face = p.facing;
        if (u) {
          const cam = NS.scene.cam;
          u.v.face = Math.atan2(cam.pos.x - u.pos.x, cam.pos.z - u.pos.z) * 0.6 + u.facing * 0.4;
          NS.anim(240, (e, p) => (u.v.oy = Math.sin(p * Math.PI) * 0.18));
        }
      };

      const partyMenu = () => {
        setActive(null); lookBack(null);
        NS.scene.targets = null; NS.scene.areaOf = null;
        cmdState.cardPick = null;
        cmdState.openUnit = unitMenu;
        const n = cmds.size;
        const who = n ? `個別に指示した ${n}人以外` : 'みんな';
        render(`みんなへの指示 <small>${n ? `個別に指示: ${n}/${alive.length}人` : ''}</small>`, [
          { html: '📣 がんばれ', cls: 'hot', desc: `${who}が いちばん良い行動を 考えて動く (スキルを 積極的に使う)`, fn: () => { for (const [u, c] of battle.planSmart(rest())) cmds.set(u, c); finish(); } },
          { html: '💥 そうこうげき', desc: `${who}で 一斉に 攻撃する`, fn: () => {
            if (!rest().length) { finish(); return; }
            targetMenu(foes(), null, (t) => { for (const u of rest()) cmds.set(u, { type: 'attack', target: t, group: true }); finish(); }, partyMenu, 'ねらう あいて');
          } },
          { html: '🛡️ まもり', desc: `${who}が ぼうぎょ (ダメージ半減・MP回復)`, fn: () => { for (const u of rest()) cmds.set(u, { type: 'guard' }); finish(); } },
          { html: battle.online ? '🏳️ こうさん' : '🏳️ リタイア', desc: battle.online ? '負けを みとめる' : battleCtx && battleCtx.kind === 'cup' ? '大会を 棄権する' : 'バトルを やめる', fn: confirmRetire },
        ], { hint: '下のキャラのアイコンを クリックすると、そのキャラだけ 個別に指示できる' });
      };

      const confirmRetire = () => {
        cmdState.openUnit = null;
        render(battle.online ? 'ほんとうに こうさんする? (負けになる)' : 'ほんとうに リタイアする?', [
          { html: battle.online ? '🏳️ こうさんする' : '🏳️ リタイアする', fn: () => finish(true) },
          { html: 'やめる', back: true, cls: 'back', fn: partyMenu },
        ]);
      };

      // 個別の指示 (ほかのキャラのアイコンを押すと そのキャラに切りかわる)
      const unitMenu = (u) => {
        setActive(u);
        lookBack(u);
        NS.scene.targets = null; NS.scene.areaOf = null;
        cmdState.cardPick = null;
        cmdState.openUnit = unitMenu;
        const done = (cmd) => { cmds.set(u, cmd); setCardCmd(u, cmd); partyMenu(); };
        const btns = [
          { html: '⚔️ こうげき', desc: '敵1体に 通常攻撃', fn: () => targetMenu(foes(), null, (t) => done({ type: 'attack', target: t }), () => unitMenu(u)) },
          { html: '🛡️ ぼうぎょ', desc: 'ダメージ半減・MPが 少し回復', fn: () => done({ type: 'guard' }) },
          skillButton(u, done),
        ];
        if (cmds.has(u)) btns.push({ html: '↺ 個別の指示を 取り消す', cls: 'wide', desc: '全体の指示に したがう', fn: () => { cmds.delete(u); setCardCmd(u, null); partyMenu(); } });
        btns.push({ html: '◀ もどる', back: true, cls: 'back wide', fn: partyMenu });
        render(`${esc(u.name)} への指示`, btns);
      };

      const skillButton = (u, done) => {
        const sk = u.ch.skill;
        if (!sk) return { html: 'スキルなし', desc: 'このキャラは スキルを 持っていない', disabled: true, cls: 'wide', fn: () => {} };
        const dead = battle.party.filter((p) => !p.alive);
        const cost = u.cost(sk);
        const set = (t) => done({ type: 'skill', skill: sk, target: t });
        const back = () => unitMenu(u);
        return {
          html: `${skillIcon(sk, 24)}${esc(sk.name)}<span class="mpc">MP ${cost}</span>`,
          desc: NS.skillDesc(sk) + (u.status.seal ? ' (アンテナ封じ中)' : u.mp < cost ? ' (MPが たりない)' : cost < NS.mpCost(u.ch, sk) ? ' (最大MPが 足りないので MPを 全部 使う)' : cost < sk.mp ? ' (まじょのぼうしで MP 節約)' : ''),
          disabled: u.mp < cost || !!u.status.seal,
          cls: 'wide',
          fn: () => {
            if (sk.tgt === 'foe') targetMenu(foes(), sk, set, back);
            else if (sk.tgt === 'ally') targetMenu(battle.party.filter((x) => x.alive), sk, set, back);
            else if (sk.tgt === 'deadAlly' && dead.length) targetMenu(dead, sk, set, back);
            else set(null);
          },
        };
      };

      const targetMenu = (list, sk, onPick, back, title) => {
        NS.scene.targets = list;
        NS.scene.areaOf = sk && sk.area === 'three' ? (t) => battle.threeTargets(t, battle.enemies) : null;
        NS.scene.onPick = (t) => { NS.sfx('confirm'); onPick(t); };
        cmdState.openUnit = null;
        cmdState.cardPick = list.some((x) => x.side === 'party') ? (t) => { if (list.includes(t)) NS.scene.onPick(t); } : null;
        const btns = list.map((t) => {
          let tag = '';
          if (sk && sk.elem) {
            const r = t.ch.res[sk.elem] || 0;
            if (r < 0) tag = '<span class="tag weak">弱点!</span>';
            else if (r > 0) tag = '<span class="tag resist">いまひとつ</span>';
          }
          return {
            html: `<span class="dot" style="width:12px;height:12px;border-radius:50%;background:${NS.COLORS[t.ch.color].hex};flex:none"></span>${nameHTML(t.name)} ${tag}${t.side === 'enemy' ? '' : `<span class="mini-hp"><i style="width:${(t.hp / t.maxHp) * 100}%"></i></span>`}`,
            desc: `${NS.COLORS[t.ch.color].name}色${t.side === 'enemy' ? '' : ` ・ ${t.alive ? `HP ${t.hp}/${t.maxHp}` : 'たおれている'}`}`,
            fn: () => onPick(t),
            hover: (on) => { NS.scene.hover = on ? t : null; },
          };
        });
        btns.push({ html: '◀ もどる', back: true, cls: 'back', fn: () => { NS.scene.targets = null; NS.scene.hover = null; NS.scene.areaOf = null; cmdState.cardPick = null; back(); } });
        render(title || (sk ? `${esc(sk.name)} を だれに?${sk.area === 'three' ? ' <small>まわりの2体にも当たる</small>' : ''}` : 'だれを こうげき?'), btns, { one: true });
      };

      partyMenu();
    });
  }

  // ---------------- 精霊の祠 (出生) ----------------
  const shrine = { a: null, b: null, busy: false, flip: false, pair: '', last: null };
  const recipeId = (kind, r) => `${kind}:${[r.a, r.b].sort().join('+')}`;
  const headName = (k) => NS.HEADS.find((h) => h.key === k).name;
  const recipeKnown = () => true; // ふしぎな組み合わせは はじめから 見える

  // 祠の中央に 親を ならべる (子が 生まれた直後は その子)
  function setShrineScene() {
    NS.scene.battle = null;
    NS.scene.mode = 'shrine';
    NS.clearFx();
    const list = shrine.a || shrine.b ? [[shrine.a, -1.05], [shrine.b, 1.05]].filter((p) => p[0]) : shrine.last ? [[shrine.last, 0]] : [];
    NS.scene.units = list.map(([k, x], i) => {
      const u = new NS.Unit(ch(k), 'party', i, x, 0);
      u.facing = 0; u.v.face = 0;
      return u;
    });
  }

  function pickParent(key) {
    if (shrine.busy) return;
    if (shrine.a === key) shrine.a = null;
    else if (shrine.b === key) shrine.b = null;
    else if (save.bred.includes(key)) { toast('この なかまは もう 出生を すませた (1体につき 1回まで)'); return; }
    else if (!shrine.a) shrine.a = key;
    else if (!shrine.b) shrine.b = key;
    else shrine.b = key;
    NS.sfx('select');
    renderShrine();
    setShrineScene();
  }

  function renderShrine() {
    const A = shrine.a && ch(shrine.a), B = shrine.b && ch(shrine.b);
    const pslot = (c, k) => (c
      ? `<div class="pslot filled" data-pslot="${k}" title="クリックで 外す"><img src="${NS.bodyThumb(c, 80, 112)}" alt="" draggable="false"><div class="ps-name">${esc(c.name)}</div><div class="ps-sub">${rankBadge(c.rank)}${c.score}</div></div>`
      : `<div class="pslot"><span>親を えらぶ</span></div>`);
    $('#shrine-parents').innerHTML = pslot(A, 'a') + '<span class="ps-x">×</span>' + pslot(B, 'b');

    let inh = '<div class="hint small">右の なかまから 2体 えらぶと、受けつぐものが わかる</div>';
    if (A && B) {
      const hr = NS.findRecipe(NS.HEAD_RECIPES, A.head, B.head);
      const cr = NS.findRecipe(NS.COLOR_RECIPES, A.color, B.color);
      const chip = (t) => `<span class="chip">${t}</span>`;
      const sk = (c) => (c.skill ? `<span class="chip">${skillIcon(c.skill, 18)}${esc(c.skill.name)}</span>` : chip('スキルなし'));
      const row = (label, a, b, extra = '') => `<div class="inh-row"><span class="inh-k">${label}</span>${a}<span class="inh-or">か</span>${b}${extra}</div>`;
      inh = [
        row('色', colorChip(A), colorChip(B), cr ? `<span class="inh-fx">${recipeKnown('color', cr) ? `まざると ${NS.COLORS[cr.to].name}` : '？ まざりそうな 気配…'}</span>` : ''),
        hr ? `<div class="inh-row"><span class="inh-k">頭</span><span class="inh-fx big">${hr.chance ? `✦ ${Math.round(hr.chance * 100)}% で ${headName(hr.to)} に 進化する!` : `✦ ${headName(hr.to)} に 進化する!`}</span></div>`
          : row('頭', chip(headName(A.head)), chip(headName(B.head))),
        A.aura || B.aura ? `<div class="inh-row"><span class="inh-k">オーラ</span><span class="inh-fx">✦ ${A.aura && B.aura ? 'かならず' : '1/2 で'} 受けつぐ</span></div>` : '',
        row('体型', chip(NS.BODY[A.body].label), chip(NS.BODY[B.body].label)),
        row('背', chip(NS.HEIGHTS[A.evaBase].label), chip(NS.HEIGHTS[B.evaBase].label)),
        row('スキル', sk(A), sk(B)),
      ].join('');
      const pair = [shrine.a, shrine.b].join('|');
      if (shrine.pair !== pair) { shrine.pair = pair; shrine.flip = false; $('#kid-name').value = NS.kidName(A.name, B.name); }
      inh += kidPreview(A, B, pair);
    }
    // ベース (親1) を きめると、ほかの なかま それぞれとの 子を 一覧で 見られる
    const listBtn = (c, side) => (c ? `<button class="btn kid-list-btn" data-kid-list="${side}">📜 親${side === 'a' ? 1 : 2}の ${esc(c.name)} を ベースに 生まれる子を 一覧で 見る</button>` : '');
    if (A || B) inh = `<div class="kid-list-btns">${listBtn(A, 'a')}${listBtn(B, 'b')}</div>` + inh;
    // えらんだ 親の ステータス
    const pstat = (c) => (c ? `<div class="ps-stat"><div class="ps-stat-name">${rankBadge(c.rank)}${esc(c.name)} <span class="hint small">格 ×${c.pot.toFixed(2)}</span>${c.aura ? ' <span class="aura-mark">✦オーラ</span>' : ''}</div>
      <div class="pv-stats">${['hp', 'mp', 'atk', 'def', 'spd', 'eva'].map((s) => statRow(s, c)).join('')}</div>
      <div class="skill-list">${skillRow(c.skill)}</div></div>` : '<div class="ps-stat empty"></div>');
    if (A || B) inh = `<div class="pv-sec">親の ステータス</div><div class="ps-stats">${pstat(A)}${pstat(B)}</div>` + inh;
    $('#shrine-inherit').innerHTML = inh;
    $('#btn-birth').disabled = !(A && B) || shrine.busy;

    // ふしぎな組み合わせ (見つけたものだけ 材料が わかる)
    const rec = NS.HEAD_RECIPES.filter((r) => !r.hide).map((r) => {
      const k = recipeKnown('head', r);
      return `<div class="recipe ${k ? 'known' : ''}">${k ? r.label || `${headName(r.a)} × ${headName(r.b)}` : '？？？ × ？？？'} → <b>${headName(r.to)}</b>${r.chance ? ` <span class="hint small">(${Math.round(r.chance * 100)}%)</span>` : ''}</div>`;
    }).concat(NS.INHERIT_HEADS.flatMap((h) => [
      `<div class="recipe known">${headName(h)} × なにか → <b>${headName(h)}</b> <span class="hint small">(${Math.round(((NS.INHERIT_RATE || {})[h] || 0.25) * 100)}%)</span></div>`,
      `<div class="recipe known">${headName(h)} × ${headName(h)} → <b>${headName(h)}</b> <span class="hint small">(かならず)</span></div>`,
    ]));
    $('#shrine-recipes').innerHTML = rec.join('');

    // 出生を すませた なかまは 出さない
    const sk2 = $('#shrine-sort').value;
    const keys = sortKeys(filterKeys(save.roster.filter((k) => !save.bred.includes(k)), 'shrine'), sk2);
    $('#shrine-list').innerHTML = keys.map((k) => {
      const c = ch(k), sel = k === shrine.a || k === shrine.b;
      const sub = subLabel(c, sk2, '');
      return `<div class="rcard ${c.kid ? 'kid' : ''} ${sel ? 'sel' : ''}" data-shrine="${esc(k)}">${isFav(k) ? '<span class="fav-mark">★</span>' : ''}
        <img class="rc-body" src="${NS.bodyThumb(c, 40, 56)}" alt="" draggable="false">
        <div style="min-width:0"><div class="rc-name">${esc(c.name)}</div><div class="rc-sub">${rankBadge(c.rank)}${sub}</div></div>
        ${skillIcon(c.skill, 22)}
        ${sel ? `<span class="pmark">${k === shrine.a ? '親1' : '親2'}</span>` : c.kid ? `<span class="pmark kid">第${c.kid.gen - 1}世代</span>` : ''}
      </div>`;
    }).join('') || '<div class="hint">出生できる なかまが いません</div>';
    $('#shrine-count').textContent = `${keys.length}人`;
  }

  // 生まれる子を 先に見せる (同じ2体からは いつも同じ子が 生まれるので、そのまま 結果になる)
  function kidPreview(A, B, pair) {
    const c = NS.makeChild(NS.breed(A, B, $('#kid-name').value), 'preview:' + pair);
    const head = NS.HEADS.find((h) => h.key === c.head), k = c.kid;
    const notes = [];
    if (k.evolved) notes.push(`✦ 頭が ${head.name} に 進化する!`);
    if (k.mixed) notes.push(`✦ 色が まざって ${NS.COLORS[k.mixed].name} に なる!`);
    if (k.potUp) notes.push(`✦ 格が 開花する! ×${k.potFrom.toFixed(2)} → ×${c.pot.toFixed(2)}`);
    if (k.mutation) notes.push(`✦ 突然変異! ${NS.STAT_LABELS[k.mutation]} ${k.mutationFrom ? `さらに 開花する (★${k.mutationFrom.toFixed(2)} → ★${c.genes[k.mutation].toFixed(2)})` : 'が 才能開花する'}`);
    if (c.aura) notes.unshift(`✦ オーラを 持って 生まれる! (${esc(NS.COLORS[c.color].aura.desc)})`);
    const diff = c.score - Math.max(A.score, B.score);
    return `<div class="kid-preview">
      <div class="pv-sec">生まれる子 ― 同じ2体からは いつも この子が 生まれる</div>
      <div class="kid-card">
        <img src="${NS.bodyThumb(c, 80, 112)}" alt="">
        <div style="min-width:0">
          <div class="kp-name">${esc(c.name)}${c.aura ? ' <span class="aura-mark">✦オーラ</span>' : ''}</div>
          <div class="pv-rankline">${rankBadge(c.rank)} 名力 <b>${c.score}</b> <span class="kp-diff ${diff >= 0 ? 'up' : 'down'}">(強い親より ${diff >= 0 ? '+' : ''}${diff})</span> <span class="chip">第${k.gen - 1}世代</span> <span class="chip">格 ×${c.pot.toFixed(2)}</span></div>
          <div class="chips">${colorChip(c)}<span class="chip">頭: ${head.name}</span><span class="chip">体型: ${NS.BODY[c.body].label}</span><span class="chip">背: ${NS.HEIGHTS[c.evaBase].label}</span></div>
          ${notes.map((n) => `<div class="head-fx">${n}</div>`).join('')}
        </div>
      </div>
      <div class="pv-stats">${['hp', 'mp', 'atk', 'def', 'spd', 'eva'].map((s) => statRow(s, c)).join('')}</div>
      <div class="skill-list">${skillRow(c.skill)}</div>
    </div>`;
  }

  // ---------------- 生まれる子の 一覧 ----------------
  // ベースの なかま × 出生できる ほかの なかま全員。子は 本当に 生まれる子と 同じ (同じ2体からは いつも 同じ子)
  let kidList = null;
  // side = ベースを 親1 (a) / 親2 (b) の どちらに 置くか (置く場所で 生まれる子が 変わる)
  function openKidList(side) {
    const baseKey = shrine[side];
    if (!baseKey) return;
    const A = ch(baseKey);
    const rows = save.roster.filter((k) => k !== baseKey && !save.bred.includes(k)).map((k) => {
      const P = ch(k);
      const pair = side === 'a' ? [baseKey, k] : [k, baseKey];
      const c = NS.makeChild(NS.breed(ch(pair[0]), ch(pair[1])), 'preview:' + pair.join('|'));
      return { key: k, P, c };
    });
    kidList = { baseKey, side, rows, sort: kidList ? kidList.sort : 'score' };
    renderKidList();
  }
  function renderKidList() {
    const { baseKey, rows, sort } = kidList;
    const A = ch(baseKey);
    const val = (r) => (sort === 'score' ? r.c.score : sort === 'special' ? (r.c.aura ? 2000 : 0) + (r.c.kid.evolved ? 1000 : 0) + (r.c.kid.mutation ? 500 : 0) + r.c.score : r.c.stats[sort]);
    const list = rows.slice().sort((x, y) => val(y) - val(x));
    const sortBtn = (k, label) => `<button class="btn small ${sort === k ? 'on' : ''}" data-act="kid-sort" data-sort="${k}">${label}</button>`;
    const head = (k) => NS.HEADS.find((h) => h.key === k).name;
    openModal(`
      <h3>親${kidList.side === 'a' ? 1 : 2}の ${esc(A.name)} を ベースに 生まれる子 <span class="hint">― ${rows.length}通り</span></h3>
      <p class="hint small">相手を クリックすると 親${kidList.side === 'a' ? 2 : 1}に えらぶ。出生ずみの なかまは 出ない。</p>
      <div class="row kid-sorts">${sortBtn('score', '名力順')}${sortBtn('special', '進化・オーラ優先')}${sortBtn('hp', 'HP順')}${sortBtn('atk', '攻撃順')}${sortBtn('def', '防御順')}${sortBtn('spd', '素早さ順')}</div>
      <div class="kid-list">${list.length ? list.map(({ key, P, c }) => {
        const k = c.kid, diff = c.score - Math.max(A.score, P.score);
        const tags = [
          c.aura ? '<span class="aura-mark">✦オーラ</span>' : '',
          k.evolved ? `<span class="chip hot">✦ ${head(c.head)}に 進化</span>` : '',
          k.mutation ? `<span class="chip hot">✦ ${NS.STAT_LABELS[k.mutation]} 才能開花</span>` : '',
          k.potUp ? `<span class="chip hot">✦ 格 +${k.potUp.toFixed(2)}</span>` : '',
        ].join('');
        return `<div class="kl-row" data-act="kid-pick" data-key="${esc(key)}">
          <img class="kl-p" src="${NS.bodyThumb(P, 40, 56)}" alt="">
          <div class="kl-pn"><div class="rc-name">× ${esc(P.name)}</div><div class="rc-sub">${rankBadge(P.rank)}${P.score}</div></div>
          <span class="kl-arrow">→</span>
          <img class="kl-c" src="${NS.bodyThumb(c, 48, 67)}" alt="">
          <div class="kl-info">
            <div>${rankBadge(c.rank)} 名力 <b>${c.score}</b> <span class="kp-diff ${diff >= 0 ? 'up' : 'down'}">(${diff >= 0 ? '+' : ''}${diff})</span> ${tags}</div>
            <div class="rc-sub">${colorChip(c)}<span class="chip">${head(c.head)}</span> HP ${c.stats.hp} ・ 攻 ${c.stats.atk} ・ 防 ${c.stats.def} ・ 速 ${c.stats.spd} ${skillIcon(c.skill, 18)}${c.skill ? esc(c.skill.name) : 'スキルなし'}</div>
          </div>
        </div>`;
      }).join('') : '<p class="hint">出生できる 相手が いない</p>'}</div>
      <div class="row reinc-actions"><button class="btn" data-act="close">とじる</button></div>`);
  }

  // ---------------- 転生 ----------------
  // 名力 1000 以上の なかまを 3体 いけにえにして、第0世代 (名前から 生まれた個体) の「出生ずみ」を リセットする
  const REINC_SCORE = 1000, REINC_NEED = 3;
  let reinc = null;
  function openReincarnation() {
    reinc = new Set();
    renderReinc(false);
  }
  function renderReinc(confirming) {
    const cands = sortKeys(save.roster.filter((k) => ch(k).score >= REINC_SCORE && !isFav(k)), 'score'); // お気に入り (★) は えらべない
    const resets = save.bred.filter((k) => !ch(k).kid).length;
    const cards = cands.map((k) => {
      const c = ch(k);
      return `<div class="rcard ${reinc.has(k) ? 'sel keep' : ''} ${c.kid ? 'kid' : ''}" data-reinc="${esc(k)}">
        <img class="rc-body" src="${NS.bodyThumb(c, 40, 56)}" alt="" draggable="false">
        <div style="min-width:0"><div class="rc-name">${esc(c.name)}</div><div class="rc-sub">${rankBadge(c.rank)}${c.score}</div></div>
        ${reinc.has(k) ? '<span class="pmark">いけにえ</span>' : save.bred.includes(k) ? '<span class="bred-mark">出生ずみ</span>' : '<span class="pmark kid">出生まだ</span>'}
      </div>`;
    }).join('') || `<div class="hint">名力 ${REINC_SCORE} 以上の なかまが いません</div>`;
    openModal(`
      <h3>転生の儀 <span class="hint">― 名力 ${REINC_SCORE} 以上の なかまを ${REINC_NEED}体 いけにえに えらぶ</span></h3>
      <p class="hint small">えらんだ 3体とは お別れ (出生の子は 二度と もどらない)。かわりに 第0世代 (名前から 生まれた なかま) の「出生ずみ」が すべて リセットされ、また 出生できるようになる。いま リセットされるのは ${resets}体。お気に入り (★) の なかまは えらべない。</p>
      <div class="roster-list reinc-list">${cards}</div>
      <div class="row reinc-actions">${confirming
        ? `<b class="reinc-warn">ほんとうに この 3体と お別れする? (もどせない)</b><button class="btn danger" data-act="reinc-do">転生する</button><button class="btn" data-act="reinc-back">やめる</button>`
        : `<button class="btn danger" data-act="reinc-confirm" ${reinc.size === REINC_NEED ? '' : 'disabled'}>転生する (${reinc.size}/${REINC_NEED})</button><button class="btn" data-act="close">やめる</button>`}</div>`);
  }
  // なかまを まとめて お別れさせる (出生の子の 記録も 消す)
  function releaseMany(keys) {
    const gone = new Set(keys);
    for (const k of gone) if (ch(k).kid) delete save.kids[k.slice(k.indexOf(':') + 1)];
    save.roster = save.roster.filter((k) => !gone.has(k));
    save.party = save.party.filter((k) => !gone.has(k));
    prunePresets((k) => !gone.has(k));
    save.bred = save.bred.filter((k) => !gone.has(k));
    save.fav = save.fav.filter((k) => !gone.has(k));
    for (const k of gone) { delete save.equip[k]; delete save.potBonus[k]; delete save.geneBonus[k]; }
    if (gone.has(save.best)) save.best = sortKeys(save.roster, 'score')[0] || null;
    if (gone.has(shrine.a)) shrine.a = null;
    if (gone.has(shrine.b)) shrine.b = null;
    if (gone.has(shrine.last)) shrine.last = null;
    shrine.pair = '';
  }
  function doReincarnation() {
    releaseMany([...reinc]);
    const before = save.bred.length;
    save.bred = save.bred.filter((k) => ch(k).kid); // 第0世代の 出生ずみを リセット
    for (const k of save.party) save.potBonus[k] = Math.round(((save.potBonus[k] || 0) + 0.03) * 100) / 100; // ごほうび: パーティ全員 格 +0.03
    persist();
    closeModal();
    NS.sfx('rare');
    NS.flash(0.7, '225,250,255');
    toast(`転生した! 第0世代 ${before - save.bred.length}体の 出生ずみが リセットされ、パーティ全員の 格が +0.03 上がった`, 3000);
    renderShrine();
    setShrineScene();
  }

  // えらんだ 世代で 出生ずみの なかまと まとめて お別れ (パーティ・お気に入り (★) の なかまは のこす)
  function farewellTargets(g = save.farewellGen) { return save.roster.filter((k) => save.bred.includes(k) && genOf(ch(k)) === g && !save.party.includes(k) && !isFav(k)); }
  function openFarewellBred() {
    const g = save.farewellGen, ks = farewellTargets();
    const maxGen = Math.max(g, ...save.roster.map((k) => genOf(ch(k))));
    const opts = Array.from({ length: maxGen + 1 }, (_, i) => `<option value="${i}" ${i === g ? 'selected' : ''}>第${i}世代 (${farewellTargets(i).length}体)</option>`).join('');
    openModal(`
      <h3>出生ずみと まとめて お別れ <select id="farewell-gen" class="farewell-gen">${opts}</select></h3>
      <p class="hint small">${g === 0 ? '名前から 生まれた なかま (第0世代)' : `精霊の祠で 生まれた 第${g}世代の なかま`}で、もう 出生を すませた ${ks.length}体と まとめて お別れする。パーティ・お気に入り (★) の なかまは のこる。${g === 0 ? '名前を 入れれば また なかまに できる。' : '<b class="reinc-warn">出生の子は 二度と もどらない。</b>'}</p>
      <div class="roster-list reinc-list">${ks.map((k) => { const c = ch(k); return `<div class="rcard"><img class="rc-body" src="${NS.bodyThumb(c, 40, 56)}" alt=""><div style="min-width:0"><div class="rc-name">${esc(c.name)}</div><div class="rc-sub">${rankBadge(c.rank)}${c.score}</div></div></div>`; }).join('') || '<p class="hint">お別れできる なかまは いません</p>'}</div>
      <div class="row reinc-actions"><button class="btn danger" data-act="farewell-bred" ${ks.length ? '' : 'disabled'}>${ks.length}体と お別れする</button><button class="btn" data-act="close">やめる</button></div>`);
  }
  function doFarewellBred() {
    const ks = farewellTargets();
    if (!ks.length) return;
    releaseMany(ks);
    persist();
    closeModal();
    NS.sfx('cancel');
    toast(`${ks.length}体と お別れした`);
    renderParty();
  }

  // 出生の儀: 親が光って浮かび、光が中央に集まって 子が 降りてくる
  async function performBirth() {
    if (shrine.busy || !shrine.a || !shrine.b) return;
    const A = ch(shrine.a), B = ch(shrine.b);
    if (save.bred.includes(A.key) || save.bred.includes(B.key)) { toast('1体につき 出生は 1回まで'); return; }
    shrine.busy = true;
    const scr = $('#scr-shrine');
    scr.classList.add('ritual');
    NS.sfx('confirm');
    setShrineScene();
    const [ua, ub] = NS.scene.units;
    const pair = [ua, ub];
    pair.forEach((u) => { u.v.idle = false; u.v.face = 0; u.v.oy = 0; });
    NS.magicCircle({ x: 0, z: 0 }, '#9fe8ff', 3.4, 2.0);
    NS.sfx('charge');
    await NS.anim(1000, (e) => pair.forEach((u) => { u.v.oy = e * 0.55; u.v.glow = e; u.v.armRaise = e * 0.8; }));
    pair.forEach((u) => NS.healFx(u.pos, '#bff4ff'));
    NS.sfx('buff');
    for (let i = 0; i < 30; i++) {
      const u = pair[i % 2], a = Math.random() * Math.PI * 2;
      NS.spawn({ type: 'glow', x: u.pos.x + Math.cos(a) * 0.3, y: 0.6 + Math.random() * 0.8, z: Math.sin(a) * 0.3, color: i % 3 ? '#bff4ff' : '#fff2c0',
        size: 0.08 + Math.random() * 0.1, life: 0.9, vx: -u.pos.x * 1.1, vy: 0.4, drag: 0.5, fadeIn: 0.1 });
    }
    await NS.anim(800, (e) => { ua.v.ox = e * 0.4; ub.v.ox = -e * 0.4; });
    NS.flash(0.95, '225,250,255');
    NS.sfx('rare');

    // 子の記録を作って 保存
    const def = NS.breed(A, B, $('#kid-name').value);
    const id = (++save.kidSeq).toString(36) + Date.now().toString(36).slice(-4);
    save.births = (save.births || 0) + 1;
    save.kids[id] = def;
    NS.kids = save.kids;
    const key = NS.kidKey(id);
    save.bred.push(A.key, B.key);
    if (def.evolved) save.recipes.push(recipeId('head', NS.findRecipe(NS.HEAD_RECIPES, A.head, B.head)));
    if (def.mixed) save.recipes.push(recipeId('color', NS.findRecipe(NS.COLOR_RECIPES, A.color, B.color)));
    addToRoster(key, false);

    // 親は 左右へ さがり、子が 空から 降りてくる
    pair.forEach((u) => { u.v.glow = 0; u.v.armRaise = 0; });
    const kid = new NS.Unit(ch(key), 'party', 2, 0, 0.35);
    kid.facing = 0; kid.v.face = 0; kid.v.idle = false; kid.v.oy = 6;
    NS.scene.units.push(kid);
    await Promise.all([
      NS.anim(600, (e) => { ua.v.ox = 0.4 - e * 0.95; ub.v.ox = -0.4 + e * 0.95; ua.v.oy = ub.v.oy = 0.55 * (1 - e); }),
      NS.anim(650, (e) => (kid.v.oy = 6 * (1 - e)), 'in'),
    ]);
    kid.v.oy = 0;
    NS.spawn({ type: 'ring', x: 0, y: 0, z: 0.35, color: '#bff4ff', size: 0.5, life: 0.6, grow: 3 });
    NS.confetti(0, 0, 70);
    NS.sfx('cheer');
    await NS.anim(200, (e, p) => (kid.v.squash = Math.sin(p * Math.PI) * 0.25));
    kid.v.squash = 0;
    kid.v.expr = 'happy';
    [ua, ub, kid].forEach((u) => (u.v.idle = true));
    await NS.wait(500);
    scr.classList.remove('ritual');
    shrine.a = shrine.b = null;
    shrine.pair = '';
    shrine.last = key;
    shrine.busy = false;
    $('#kid-name').value = '';
    renderShrine();
    showKidModal(key);
  }

  function showKidModal(key) {
    const c = ch(key), k = c.kid, head = NS.HEADS.find((h) => h.key === c.head);
    const notes = [];
    if (k.evolved) notes.push(`✦ 頭が ${head.name} に 進化した!`);
    if (k.mixed) notes.push(`✦ 色が まざって ${NS.COLORS[k.mixed].name} に なった!`);
    if (k.potUp) notes.push(`✦ 格が 開花した! ×${k.potFrom.toFixed(2)} → ×${c.pot.toFixed(2)}`);
    if (k.mutation) notes.push(`✦ 突然変異! ${NS.STAT_LABELS[k.mutation]} ${k.mutationFrom ? `さらに 開花した (★${k.mutationFrom.toFixed(2)} → ★${c.genes[k.mutation].toFixed(2)})` : 'が 才能開花した'}`);
    $('#modal-box').innerHTML = `
      <h3>出生 ― あたらしい なかまが 生まれた!</h3>
      <div class="kid-card">
        <img src="${NS.bodyThumb(c, 110, 154)}" alt="">
        <div style="min-width:0">
          <div class="pv-name">${esc(c.name)}</div>
          <div class="pv-rankline">${rankBadge(c.rank)} 名力 <b>${c.score}</b> <span class="chip">第${k.gen - 1}世代</span> <span class="chip">格 ×${c.pot.toFixed(2)}</span></div>
          <div class="hint small">親: ${esc(k.parents[0])} × ${esc(k.parents[1])}</div>
          <div class="chips">${colorChip(c)}<span class="chip">頭: ${head.name}</span><span class="chip">体型: ${NS.BODY[c.body].label}</span><span class="chip">背: ${NS.HEIGHTS[c.evaBase].label}</span></div>
          ${notes.map((n) => `<div class="head-fx">${n}</div>`).join('')}
        </div>
      </div>
      <div class="pv-stats">${['hp', 'mp', 'atk', 'def', 'spd', 'eva'].map((s) => statRow(s, c)).join('')}</div>
      <div class="skill-list">${skillRow(c.skill)}</div>
      <div class="row" style="justify-content:center;margin-top:12px">
        <button class="btn primary" data-act="kid-view" data-key="${esc(key)}">命名所で 見る</button>
        <button class="btn" data-act="close">とじる</button>
      </div>`;
    $('#modal').classList.remove('hidden');
  }

  // ---------------- 結果 ----------------
  function showResult(result) {
    const b = battleCtx.battle;
    const box = $('#result-box');
    if (battleCtx.kind === 'dungeon') { finishBattle('dungeon'); NS.dungeon.afterBattle(result, b); return; } // どうくつは 地図へ もどる
    if (result === 'escape') { finishBattle(); return; }
    if (battleCtx.kind === 'online') { showOnlineResult(result, b); return; }
    let html = '';
    if (result === 'win') {
      let fameGain = 0, newClear = false, gotItem = null, gotOrb = false, gotFirst = false;
      if (battleCtx.kind === 'cup') {
        const cup = battleCtx.cup;
        const golds = b.party.filter((u) => u.ch.special === 'fame').length;
        fameGain = Math.round(cup.fame * (1 + 0.5 * Math.min(3, golds)));
        newClear = !save.cleared[cup.id];
        save.cleared[cup.id] = true;
        save.fame += fameGain;
        persist();
      }
      if (battleCtx.kind === 'monster') { // モンスターを たおした
        const M = NS.MONSTERS[battleCtx.monster];
        const golds = b.party.filter((u) => u.ch.special === 'fame').length;
        fameGain = Math.round(M.fame * (1 + 0.5 * Math.min(3, golds)));
        newClear = !save.cleared['mon:' + battleCtx.monster];
        save.cleared['mon:' + battleCtx.monster] = true;
        save.got = save.got || {};
        const first = !save.got['mon:' + battleCtx.monster];
        if (M.reward && (first || Math.random() < (M.rewardRepeat || 0))) { save.items[M.reward] = (save.items[M.reward] || 0) + 1; save.got['mon:' + battleCtx.monster] = true; gotItem = M.reward; gotFirst = first; }
        if (M.orb) { save.potOrbs = (save.potOrbs || 0) + 1; gotOrb = true; } // ウルフベアは たおすたびに 格の宝玉
        save.fame += fameGain;
        persist();
      }
      // 名のある軍団に勝つと、メンバーから ランダムで 1体 なかまになる (同じメンバーも 何体でも。新しい1体は 出生できる)
      let joined = null, joinedIdx = -1;
      if (battleCtx.kind === 'cup' && battleCtx.cup.boss) {
        const bk = battleCtx.cup.boss;
        joinedIdx = Math.floor(Math.random() * NS.BOSS_PARTIES[bk].members.length);
        let n = 1;
        while (save.roster.includes(NS.bossKey(bk, joinedIdx, n)) || save.bred.includes(NS.bossKey(bk, joinedIdx, n))) n++;
        joined = NS.bossKey(bk, joinedIdx, n);
        addToRoster(joined, false);
      }
      const mvp = b.party.slice().sort((x, y) => y.dealt - x.dealt)[0];
      html += `<h2 class="result-title win">VICTORY!</h2>
        <p class="result-sub">${battleCtx.kind === 'monster' ? `${esc(NS.MONSTERS[battleCtx.monster].name)}を ${newClear ? 'はじめて ' : ''}たおした! 名声 +${fameGain}` : battleCtx.kind === 'cup' ? `${esc(battleCtx.cup.name)} ${newClear ? '初制覇!' : '制覇!'} 名声 +${fameGain}` : battleCtx.kind === 'ghost' ? `${esc(battleCtx.ghostOf)} の パーティに 勝った!` : 'フリーバトル 勝利'}</p>
        ${mvp ? `<div class="mvp"><img src="${NS.portrait(mvp.ch, 48)}" alt=""><div>MVP<br><b>${esc(mvp.name)}</b> <span class="hint">与ダメージ ${mvp.dealt}</span></div></div>` : ''}
        ${gotOrb ? `<div class="item-get"><span class="item-icon">🔮</span><div><b>格の宝玉</b> を 手に入れた! (${save.potOrbs}こ)<br><span class="hint small">命名所で なかまに 使うと 格 +0.01</span></div></div>` : ''}
        ${gotItem ? `<div class="pv-sec">${gotFirst ? 'はじめての ごほうび' : 'ごほうび'}</div><div class="item-get"><span class="item-icon">${equipIcon(NS.EQUIPS[gotItem])}</span><div><b>${esc(NS.EQUIPS[gotItem].name)}</b> を 手に入れた!<br><span class="hint small">${esc(NS.EQUIPS[gotItem].desc)} ・ 命名所で なかまに 装備できる</span></div></div>` : ''}
        ${battleCtx.kind === 'cup' && battleCtx.cup.boss ? `<div class="pv-sec">${esc(battleCtx.cup.name)}を うちやぶった! <b class="join-msg">${esc(ch(joined).name)} が なかまに なった!</b></div>
        <div class="scout-list">${b.enemies.map((e, i) => {
          const k = e.ch.key, mark = i === joinedIdx ? '<span class="pmark join">加入!</span>' : save.roster.includes(k) ? '<span class="pmark">なかま</span>' : '';
          return `<div class="rcard ${i === joinedIdx ? 'joined' : ''}"><img class="rc-body" src="${NS.bodyThumb(e.ch, 40, 56)}" alt=""><div style="min-width:0"><div class="rc-name">${nameHTML(e.name)}</div><div class="rc-sub">${rankBadge(e.ch.rank)}${e.ch.score}</div></div>${mark}</div>`;
        }).join('')}</div>`
        : battleCtx.kind === 'cup' ? `<div class="pv-sec">スカウト ― たたかった相手を ひとり なかまにできる (本当の名前が わかる)</div>
        <div class="scout-list">${b.enemies.map((e, i) => {
          const has = save.roster.includes(e.ch.name);
          return `<div class="rcard"><img class="rc-body" src="${NS.bodyThumb(e.ch, 40, 56)}" alt=""><div style="min-width:0"><div class="rc-name" data-scout-name="${i}">${nameHTML(e.name)}</div><div class="rc-sub">${rankBadge(e.ch.rank)}${e.ch.score}</div></div>
            <button class="btn small" data-scout="${i}" ${has ? 'disabled' : ''}>${has ? '加入済' : 'スカウト'}</button></div>`;
        }).join('')}</div>` : ''}`;
    } else {
      html += `<h2 class="result-title lose">DEFEAT…</h2>
        <p class="result-sub">名前を 見なおして、もう一度 挑戦しよう。<br>属性の相性や 回復スキルも 大切だ。</p>`;
    }
    html += `<div class="result-actions">
      <button class="btn primary" data-res="retry">${result === 'win' ? 'もう一度' : 'リトライ'}</button>
      ${battleCtx.kind === 'cup' || battleCtx.kind === 'monster' ? '<button class="btn" data-res="cups">コロシアムへ</button>' : battleCtx.kind === 'ghost' ? '<button class="btn" data-res="online">ロビーへ</button>' : '<button class="btn" data-res="free">フリーバトルへ</button>'}
      <button class="btn" data-res="party">命名所へ</button>
    </div>`;
    box.innerHTML = html;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === 'scr-result' || s.id === 'scr-battle'));
    $('#b-cmd').classList.remove('on');
    current = 'result';
    // おの・格の宝玉 などを 手に入れた 音 (ファンファーレの あと)
    if (/class="item-get"/.test(html)) NS.bgm.until('fanfare').then(() => { if (current === 'result') NS.sfx('getItem'); });
  }

  async function showOnlineResult(result, b) {
    const link = b.online;
    const reason = link.npc && b.endReason !== 'surrender' ? 'あいてが 切断 (NPC と たたかった)'
      : { surrender: b.endReason === 'surrender' && result === 'lose' ? 'こうさんした' : 'あいてが こうさんした', left: result === 'lose' ? '対戦から ぬけた' : 'あいてとの 通信が 切れた', error: '通信が 切れてしまった' }[b.endReason] || '';
    const title = { win: ['win', 'VICTORY!'], lose: ['lose', 'DEFEAT…'], draw: ['lose', 'DRAW'], error: ['lose', '通信エラー'] }[result] || ['lose', result];
    const mvp = b.party.slice().sort((x, y) => y.dealt - x.dealt)[0];
    const genesUp = [];
    if (result === 'win') {
      for (const key of save.party) {
        if (Math.random() >= 0.1) continue;
        const c = ch(key), ks = NS.GENE_KEYS.filter((k) => c.genes && c.genes[k] != null && c.genes[k] < 1.35 && !(k === 'mp' && c.noSkill));
        if (!ks.length) continue;
        const k = ks[Math.floor(Math.random() * ks.length)], add = (1 + Math.floor(Math.random() * 3)) / 100;
        const gb = (save.geneBonus[key] = save.geneBonus[key] || {});
        gb[k] = Math.round(((gb[k] || 0) + add) * 100) / 100;
        genesUp.push({ c, k, add });
      }
      if (genesUp.length) { eqCache.clear(); if (NS.clearThumbs) NS.clearThumbs(); persist(); }
    }
    const render = () => {
      const u = NS.net.user;
      $('#result-box').innerHTML = `<h2 class="result-title ${title[0]}">${title[1]}</h2>
        <p class="result-sub">オンライン対戦 vs ${esc(link.foeName)}${reason ? ` ― ${reason}` : ''}</p>
        ${mvp && mvp.dealt ? `<div class="mvp"><img src="${NS.portrait(mvp.ch, 48)}" alt=""><div>MVP<br><b>${esc(mvp.name)}</b> <span class="hint">与ダメージ ${mvp.dealt}</span></div></div>` : ''}
        ${u ? `<p class="result-sub">${esc(u.name)} の 戦績: <b>${u.wins}勝 ${u.losses}敗${u.draws ? ` ${u.draws}分` : ''}</b></p>` : ''}
        ${genesUp.map((g) => `<div class="item-get"><span class="item-icon">🧬</span><div><b>${esc(g.c.name)}</b> の ${NS.STAT_LABELS[g.k]}の 遺伝子が <b>+${g.add.toFixed(2)}</b> 上がった!<br><span class="hint small">勝利の 経験が 体に きざまれた</span></div></div>`).join('')}
        <div class="result-actions">
          <button class="btn primary" data-res="online">ロビーへ</button>
          <button class="btn" data-res="party">命名所へ</button>
          <button class="btn" data-res="title">タイトルへ</button>
        </div>`;
    };
    render();
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === 'scr-result' || s.id === 'scr-battle'));
    $('#b-cmd').classList.remove('on');
    current = 'result';
    if (result !== 'error') { await link.report(result); if (current === 'result') render(); } // 戦績を 記録して 表示しなおす
    else link.stop();
  }

  function finishBattle(to) {
    document.body.classList.remove('dark-cup');
    NS.bgm.stop(0.5);
    NS.speed = save.speed;
    const kind = battleCtx ? battleCtx.kind : 'cup';
    battleCtx = null;
    NS.arenaTheme = null;
    cardEls.clear();
    show(to || (kind === 'cup' || kind === 'monster' ? 'cups' : kind === 'online' || kind === 'ghost' ? 'online' : 'free'));
  }

  // ---------------- ドラッグ&ドロップで パーティ編成 ----------------
  // なかま → 枠: 入れる (埋まっていれば 入れ替え) / 枠 → 枠: 並べかえ / 枠 → なかま一覧: 外す
  let drag = null, suppressClick = false;
  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const slot = el.closest('#party-slots .slot');
    if (slot) return { type: 'slot', index: +slot.dataset.i, el: slot };
    if (el.closest('#roster-list, .roster-head')) return { type: 'roster', el: $('#roster-list') };
    return null;
  }
  function startDrag(d, x, y) {
    d.started = true;
    const g = document.createElement('div');
    g.className = 'drag-ghost';
    g.innerHTML = `<img src="${NS.bodyThumb(ch(d.name), 60, 84)}" alt=""><span>${esc(ch(d.name).name)}</span>`;
    document.body.appendChild(g);
    d.ghost = g;
    document.body.classList.add('dragging');
    d.src.classList.add('drag-src');
    NS.sfx('select');
    moveDrag(d, x, y);
  }
  function moveDrag(d, x, y) {
    d.ghost.style.transform = `translate(${x - 34}px, ${y - 70}px)`;
    const tg = dropTargetAt(x, y);
    document.querySelectorAll('.drop-over').forEach((e) => e.classList.remove('drop-over'));
    d.target = tg && !(tg.type === 'roster' && d.from === 'roster') ? tg : null;
    if (d.target) d.target.el.classList.add('drop-over');
  }
  function endDrag(d) {
    d.ghost.remove();
    document.body.classList.remove('dragging');
    d.src.classList.remove('drag-src');
    document.querySelectorAll('.drop-over').forEach((e) => e.classList.remove('drop-over'));
    const tg = d.target;
    if (!tg) return;
    const party = save.party.slice();
    const cur = party.indexOf(d.name);
    if (tg.type === 'slot') {
      const i = tg.index;
      if (cur >= 0) { // パーティの中で 並べかえ
        if (i < party.length) [party[cur], party[i]] = [party[i], party[cur]];
        else { party.splice(cur, 1); party.push(d.name); }
      } else if (i < party.length) {
        toast(`${ch(party[i]).name} と ${ch(d.name).name} を 入れかえた`);
        party[i] = d.name;
      } else party.push(d.name);
    } else if (tg.type === 'roster' && cur >= 0) {
      party.splice(cur, 1);
    } else return;
    save.party = party;
    persist();
    NS.sfx('confirm');
    renderParty();
    setShowcase(save.party, 'party');
  }
  function bindDrag() {
    document.addEventListener('pointerdown', (e) => {
      if (current !== 'party' || e.button !== 0 || releaseMode) return;
      const src = e.target.closest('#roster-list .rcard, #party-slots .slot.filled');
      if (!src || e.target.closest('.fav-btn')) return;
      drag = { name: src.dataset.name, from: src.classList.contains('slot') ? 'party' : 'roster', src, x0: e.clientX, y0: e.clientY, started: false, touch: e.pointerType === 'touch' };
      // 指は 長押しで つかむ (ふつうに なぞると スクロール)
      if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.started) startDrag(drag, drag.x0, drag.y0); }, 300);
    });
    document.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.started) {
        const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
        if (drag.touch) { if (dist > 10) { clearTimeout(drag.timer); drag = null; } return; }
        if (dist < 6) return;
        startDrag(drag, e.clientX, e.clientY);
      }
      moveDrag(drag, e.clientX, e.clientY);
    });
    document.addEventListener('pointerup', () => {
      if (!drag) return;
      clearTimeout(drag.timer);
      if (drag.started) { suppressClick = true; endDrag(drag); }
      drag = null;
    });
    document.addEventListener('pointercancel', () => {
      if (!drag) return;
      clearTimeout(drag.timer);
      if (drag.started) { drag.target = null; endDrag(drag); }
      drag = null;
    });
    document.addEventListener('touchmove', (e) => { if (drag && drag.started) e.preventDefault(); }, { passive: false });
    // ドラッグのあとの クリックは 無視する
    document.addEventListener('click', (e) => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // ---------------- イベント ----------------
  function bind() {
    bindDrag();
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-more')) { NS.sfx('confirm'); openMore(); return; }
      const more = e.target.closest('[data-more]');
      if (more) { NS.sfx('confirm'); ({ ost: openOst, gift: openGift, rule: openRule, back: openMore })[more.dataset.more](); return; }
      const gift = e.target.closest('[data-gift]');
      if (gift) { takeGift(gift.dataset.gift); return; }
      const ost = e.target.closest('[data-ost]');
      if (ost) { ostClick(ost.dataset.ost); return; }
      const go = e.target.closest('[data-go]');
      if (go) { NS.sfx(go.dataset.go === 'title' ? 'cancel' : 'confirm'); show(go.dataset.go); return; }
      const act = e.target.closest('[data-act]');
      if (act && act.closest('#preview')) { onPreviewAction(act.dataset.act); return; }
      if (act && act.closest('#modal')) {
        if (act.dataset.act === 'gacha-sort') { NS.sfx('select'); resortGacha(act.dataset.sort); }
        else if (act.dataset.act === 'gacha-raw') { NS.sfx('select'); gacha.raw = !gacha.raw; act.classList.toggle('on', gacha.raw); resortGacha(gacha.sort); }
        else if (act.dataset.act === 'again') { NS.sfx('confirm'); openGacha(); }
        else if (act.dataset.act === 'reinc-confirm') { NS.sfx('select'); renderReinc(true); }
        else if (act.dataset.act === 'reinc-back') { NS.sfx('cancel'); renderReinc(false); }
        else if (act.dataset.act === 'reinc-do') doReincarnation();
        else if (act.dataset.act === 'farewell-bred') doFarewellBred();
        else if (act.dataset.act === 'kid-sort') { NS.sfx('select'); kidList.sort = act.dataset.sort; renderKidList(); }
        else if (act.dataset.act === 'kid-pick') {
          NS.sfx('select');
          closeModal();
          shrine[kidList.side] = kidList.baseKey; shrine[kidList.side === 'a' ? 'b' : 'a'] = act.dataset.key;
          renderShrine(); setShrineScene();
        }
        else if (act.dataset.act === 'kid-view') { NS.sfx('confirm'); closeModal(); show('party'); selectPreview(act.dataset.key); }
        else { NS.sfx('cancel'); closeModal(); }
        return;
      }
      const g = e.target.closest('.gcard');
      if (g) { closeModal(); NS.sfx('confirm'); selectPreview(g.dataset.name); return; }
      const slot = e.target.closest('.slot.filled');
      if (slot) { NS.sfx('select'); selectPreview(slot.dataset.name); return; }
      const fv = e.target.closest('[data-fav-toggle]');
      if (fv) { toggleFav(fv.dataset.favToggle); return; }
      if (e.target.closest('#release-mode')) { NS.sfx(releaseMode ? 'cancel' : 'select'); setReleaseMode(!releaseMode); renderParty(); return; }
      if (e.target.closest('[data-farewell]')) { const k = releasePick; releasePick = null; releaseKey(k); renderParty(); setShowcase(save.party, 'party'); return; }
      if (e.target.closest('[data-farewell-cancel]')) { NS.sfx('cancel'); releasePick = null; renderParty(); return; }
      const rc = e.target.closest('#roster-list .rcard');
      if (rc && releaseMode) {
        if (save.party.includes(rc.dataset.name)) { toast('パーティにいる なかまは 外せません'); return; }
        if (isFav(rc.dataset.name)) { toast('お気に入り (★) の なかまは 外せません'); return; }
        NS.sfx('select'); releasePick = rc.dataset.name; renderParty(); return;
      }
      if (rc) { NS.sfx('select'); selectPreview(rc.dataset.name); return; }
      const psv = e.target.closest('[data-preset-save]');
      if (psv) { savePreset(+psv.dataset.presetSave); return; }
      if (e.target.closest('[data-preset-add]')) { savePreset(null); return; }
      const pdl = e.target.closest('[data-preset-del]');
      if (pdl) { deletePreset(+pdl.dataset.presetDel); return; }
      const pld = e.target.closest('[data-preset-load]');
      if (pld && !pld.disabled) { loadPreset(+pld.dataset.presetLoad); return; }
      const ri = e.target.closest('[data-reinc]');
      if (ri && reinc) {
        const k = ri.dataset.reinc;
        if (reinc.has(k)) reinc.delete(k); else if (reinc.size < REINC_NEED) reinc.add(k); else { toast(`えらべるのは ${REINC_NEED}体まで`); return; }
        NS.sfx('select');
        renderReinc(false);
        return;
      }
      const kl = e.target.closest('[data-kid-list]');
      if (kl && !shrine.busy) { NS.sfx('confirm'); openKidList(kl.dataset.kidList); return; }
      const sh = e.target.closest('[data-shrine]');
      if (sh) { pickParent(sh.dataset.shrine); return; }
      const psl = e.target.closest('[data-pslot]');
      if (psl && !shrine.busy) { shrine[psl.dataset.pslot] = null; NS.sfx('cancel'); renderShrine(); setShrineScene(); return; }
      const mon = e.target.closest('[data-monster]');
      if (mon) {
        if (!save.party.length) { toast('まずは 命名所で パーティを 編成しよう'); return; }
        const k = mon.dataset.monster;
        NS.sfx('confirm');
        startBattle([NS.makeMonster(k)], { kind: 'monster', monster: k, title: 'モンスターコロシアム', intro: NS.MONSTERS[k].intro });
        return;
      }
      const cup = e.target.closest('.cup');
      if (cup && !cup.classList.contains('locked')) {
        if (!save.party.length) { toast('まずは 命名所で パーティを 編成しよう'); return; }
        const c = NS.CUPS[+cup.dataset.cup];
        NS.sfx('confirm');
        startBattle(cupEnemies(c), { kind: 'cup', cup: c, title: c.name });
        return;
      }
      const sc = e.target.closest('[data-scout]');
      if (sc && !sc.disabled && battleCtx) {
        const e = battleCtx.battle.enemies[+sc.dataset.scout];
        const real = e.ch.name;
        addToRoster(real, false);
        NS.sfx('rare');
        toast(`${e.name} の 本当の名前は「${real}」! なかまに なった`, 2600);
        const nameEl = document.querySelector(`[data-scout-name="${sc.dataset.scout}"]`);
        if (nameEl) nameEl.textContent = real;
        document.querySelectorAll('[data-scout]').forEach((b) => (b.disabled = true));
        sc.textContent = '加入!';
        return;
      }
      const res = e.target.closest('[data-res]');
      if (res) {
        NS.sfx('confirm');
        const r = res.dataset.res;
        if (r === 'retry' && battleCtx) {
          const ctx = battleCtx;
          startBattle(ctx.kind === 'cup' ? cupEnemies(ctx.cup) : ctx.kind === 'monster' ? [NS.makeMonster(ctx.monster)] : ctx.enemies, ctx);
        } else finishBattle(r);
      }
    });

    $('#name-input').addEventListener('input', () => { pvKey = null; renderParty(); });
    $('#name-input').addEventListener('keydown', (e) => {
      // 日本語入力の変換確定の Enter では追加しない
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && previewName && !save.roster.includes(previewName)) onPreviewAction('add');
    });
    $('#btn-dice').addEventListener('click', () => { NS.sfx('select'); selectPreview(NS.randomName()); });
    $('#btn-fancy').addEventListener('click', () => { NS.sfx('select'); selectPreview(NS.randomFancyName()); });
    $('#btn-birth').addEventListener('click', performBirth);
    $('#btn-reincarnate').addEventListener('click', () => { if (shrine.busy) return; NS.sfx('confirm'); openReincarnation(); });
    $('#btn-unequip-box').addEventListener('click', () => unequipAll(save.roster.filter((k) => !save.party.includes(k))));
    $('#btn-unequip-party').addEventListener('click', () => unequipAll(save.party.slice()));
    $('#btn-farewell-bred').addEventListener('click', () => { NS.sfx('select'); openFarewellBred(); });
    // まとめて お別れする 世代を 変える
    $('#modal').addEventListener('change', (e) => {
      if (e.target.id !== 'farewell-gen') return;
      save.farewellGen = +e.target.value;
      persist();
      NS.sfx('select');
      openFarewellBred();
      renderParty();
    });
    // パーティの 全員を なかま一覧 (ボックス) に もどす
    $('#btn-party-clear').addEventListener('click', () => {
      if (!save.party.length) return;
      save.party = [];
      NS.sfx('cancel');
      toast('パーティの 全員を ボックスに もどした');
      persist();
      renderParty();
      setShowcase(save.party, 'party');
    });
    $('#kid-name').addEventListener('input', () => { if (current === 'shrine') renderShrine(); });
    $('#kid-name-mix').addEventListener('click', () => {
      if (!shrine.a || !shrine.b) return;
      shrine.flip = !shrine.flip;
      const [x, y] = shrine.flip ? [shrine.b, shrine.a] : [shrine.a, shrine.b];
      $('#kid-name').value = NS.kidName(ch(x).name, ch(y).name);
      renderShrine();
      NS.sfx('select');
    });
    $('#btn-gacha').addEventListener('click', () => { NS.sfx('confirm'); openGacha(10); });
    $('#btn-gacha100').addEventListener('click', () => { NS.sfx('confirm'); openGacha(100); });
    $('#roster-sort').addEventListener('change', renderParty);
    $('#shrine-sort').addEventListener('change', renderShrine);
    buildFilters();
    $('#lab-filter').addEventListener('change', renderParty);
    $('#shrine-filter').addEventListener('change', renderShrine);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

    $('#free-random').addEventListener('click', () => {
      const n = 1 + Math.floor(Math.random() * 8);
      $('#free-names').value = Array.from({ length: n }, () => NS.randomName()).join('\n');
      NS.sfx('select');
      renderFreePreview();
    });
    $('#free-names').addEventListener('input', renderFreePreview);
    $('#free-start').addEventListener('click', () => {
      const names = freeNames();
      if (!names.length) { toast('相手の名前を 入れてね'); return; }
      NS.sfx('confirm');
      startBattle(names, { kind: 'free', title: 'フリーバトル' });
    });

    $('#b-auto').addEventListener('click', () => {
      if (isOnline()) { toast('オンライン対戦中は オートを 使えません'); return; }
      save.auto = !save.auto; persist(); updateCtrlButtons(); NS.sfx('select');
      if (save.auto && cmdState) toast('次のターンから オート');
    });
    $('#b-speed').addEventListener('click', () => {
      if (isOnline() && !battleCtx.online.host) { toast('バトルの 速さは 部屋の ホストが きめます'); return; }
      save.speed = save.speed >= Math.min(3, speedCap()) ? 1 : save.speed + 1; persist(); updateCtrlButtons(); NS.sfx('select'); // ×1〜×3 (じゃあくのまじょは ×1 ⇔ ×2)
      if (isOnline()) battleCtx.online.setSpeed(Math.min(3, save.speed)); // あいてにも
    });
    // 右上の 🔊: SE と BGM の 音量 (と ミュート)
    // キャラの 3D モデル ON / OFF (テスト)
    $('#btn-3d').addEventListener('click', () => {
      if (!save.model3d && !NS.fig3d) { toast('3D の 読みこみが まだ (または 失敗)。少し 待って もう一度'); return; }
      save.model3d = !save.model3d; NS.sfx('select'); sync3d(); persist();
      toast(save.model3d ? 'キャラを 3D モデルで 表示 (テスト中)' : 'キャラを ふだんの 絵に もどした');
    });
    // 大技の 演出 ON / OFF
    $('#btn-fx').addEventListener('click', () => { save.fxOff = !save.fxOff; NS.sfx('select'); syncFx(); persist(); toast(save.fxOff ? '大技の 演出を OFF に した' : '大技の 演出を ON に した'); });
    // 総プレイ時間: 画面を 見ている 間 30秒ごとに 足す
    let playT = Date.now();
    setInterval(() => {
      const now = Date.now();
      if (!document.hidden) { save.playMs = (save.playMs || 0) + Math.min(60000, now - playT); persistQuiet(); }
      playT = now;
    }, 30000);
    $('#btn-sound').addEventListener('click', (e) => { e.stopPropagation(); $('#vol-panel').classList.toggle('hidden'); syncVolume(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#vol-panel') && !e.target.closest('#btn-sound')) $('#vol-panel').classList.add('hidden'); });
    $('#vol-se').addEventListener('input', (e) => { save.volSe = +e.target.value; applyVolume(); });
    $('#vol-bgm').addEventListener('input', (e) => { save.volBgm = +e.target.value; applyVolume(); });
    $('#vol-se').addEventListener('change', () => { persist(); NS.sfx('select'); });
    $('#vol-bgm').addEventListener('change', () => persist());
    $('#vol-mute').addEventListener('click', () => { save.sound = !save.sound; applyVolume(); persist(); if (save.sound) NS.sfx('confirm'); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#modal').classList.contains('hidden')) { closeModal(); return; }
        const back = document.querySelector('#b-cmd.on [data-back]');
        if (back) back.click();
      }
    });
  }

  function sync3d() {
    NS.use3d = !!save.model3d;
    const b = $('#btn-3d');
    b.classList.toggle('off', !NS.use3d);
    b.title = NS.use3d ? '3D モデル (テスト): ON (押すと OFF)' : '3D モデル (テスト): OFF (押すと ON)';
  }
  function syncFx() {
    sync3d();
    NS.fxOff = !!save.fxOff;
    const b = $('#btn-fx');
    b.classList.toggle('off', NS.fxOff);
    b.title = NS.fxOff ? '大技の 演出: OFF (押すと ON)' : '大技の 演出: ON (押すと OFF)';
  }
  // 音量を 反映 (save.volSe / volBgm = 0〜100)
  function applyVolume() {
    syncFx();
    NS.sound.on = save.sound;
    NS.sound.se = (save.volSe == null ? 100 : save.volSe) / 100;
    NS.sound.bgm = (save.volBgm == null ? 50 : save.volBgm) / 100; // BGM は はじめ 50%
    NS.bgm.refresh();
    syncVolume();
  }
  function syncVolume() {
    const se = save.volSe == null ? 100 : save.volSe, bgm = save.volBgm == null ? 50 : save.volBgm;
    $('#vol-se').value = se; $('#vol-bgm').value = bgm;
    $('#vol-se-n').textContent = se + '%'; $('#vol-bgm-n').textContent = bgm + '%';
    $('#vol-mute').textContent = save.sound ? '🔇 ミュート' : '🔊 音を 出す';
    $('#btn-sound').textContent = !save.sound || (!se && !bgm) ? '🔇' : '🔊';
  }

  // ---------------- 初期化 ----------------
  NS.ui.init = function () {
    load();
    applyVolume();
    NS.speed = save.speed;
    ensureStarters();
    bind();
    show('title');
    if (NS.online) NS.online.init(); // サーバーがあれば ログイン状態を 確かめる
  };

  Object.assign(NS.ui, {
    message, setTurn, setActive, refreshCards, collectCommands, tick, toast,
    startBattle, rankBadge, openModal, closeModal, useAccountSave, current: () => current,
    ch, persist, save: () => save,
  });
})();
