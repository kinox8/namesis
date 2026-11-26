// 名前から個体を生成する。NAMESIS の心臓部。
// 主系統の乱数 (色・頭・格・能力) は引く順番を変えると全ての名前が変わるので、触らないこと。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const SEED_PREFIX = 'NAMESIS/1:';
  const MAX_NAME = 10;

  NS.normalizeName = function (s) {
    //  は 特別な個体 (紅蓮騎士団・出生の子) のキー用なので 名前からは 消す
    const n = String(s || '').normalize('NFKC').replace(//g, '').replace(/\s+/g, ' ').trim();
    return Array.from(n).slice(0, MAX_NAME).join('');
  };
  NS.MAX_NAME = MAX_NAME;

  const SKIN = ['#ffe0c2', '#f8cfa6', '#eab48c', '#cf9068', '#a86f4c'];
  // 顔まわり (フードの中から 顔と前髪がのぞく)
  const SKINS = [{ c: '#ffe3c8', w: 34 }, { c: '#f9d0aa', w: 30 }, { c: '#e9b48a', w: 18 }, { c: '#c98d62', w: 11 }, { c: '#8e5a3a', w: 7 }];
  const HAIRS = [
    { k: null, w: 30 }, { k: 'bangs', w: 16 }, { k: 'side', w: 14 }, { k: 'curly', w: 10 },
    { k: 'bob', w: 12 }, { k: 'part', w: 12 }, { k: 'spiky', w: 6 },
  ];
  const HAIR_COLORS = [
    { c: '#2a1c16', w: 30 }, { c: '#5a3420', w: 24 }, { c: '#8f5c2c', w: 12 }, { c: '#efc860', w: 12 },
    { c: '#c8462a', w: 5 }, { c: '#7a4ad0', w: 6 }, { c: '#eceef4', w: 4 }, { c: '#3a6ad8', w: 4 }, { c: '#ff8ab8', w: 3 },
  ];
  const EYE_COLORS = [{ c: '#22160f', w: 70 }, { c: '#5a3418', w: 14 }, { c: '#2a5ab8', w: 10 }, { c: '#2a8a4a', w: 6 }];
  // 目 15種: 0てん 1まめ 2くりくり 3^^ 4ーー 5きらきら 6◡◡ 7ちょん 8うるうる(大きな少女まんが目) 9ぎょろ(白目) 10ほし 11ハート 12ねむ 13たれ目 14ぐるぐる
  const EYE_TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((k) => ({ k, w: [9, 9, 9, 5, 4, 6, 5, 4, 10, 9, 4, 3, 7, 7, 3][k] }));
  const EYE_SIZES = [{ v: 0.75, w: 18 }, { v: 1, w: 40 }, { v: 1.3, w: 28 }, { v: 1.6, w: 14 }];
  const BROWS = [{ k: null, w: 56 }, { k: 'maro', w: 16 }, { k: 'thick', w: 14 }, { k: 'thin', w: 14 }];
  const BLUSHES = [{ k: 'round', w: 40 }, { k: 'oval', w: 18 }, { k: 'lines', w: 16 }, { k: null, w: 26 }];
  const PATTERNS = [{ k: null, w: 50 }, { k: 'dots', w: 24 }, { k: 'spots', w: 26 }];
  // 球の表面の点 (経度 th・緯度 ph)。頭と胴体の水玉・まだら模様に使う
  const spherePts = (rng, n, phMin, phMax, sMin, sMax) => Array.from({ length: n }, (_, i) => ({
    th: ((i + rng.next() * 0.8) / n) * Math.PI * 2 - Math.PI,
    ph: rng.range(phMin, phMax), s: rng.range(sMin, sMax), c: rng.int(0, 7), a: rng.range(0, 3),
  }));
  const ACCS = [
    { k: null, w: 58 }, { k: 'glasses', w: 9 }, { k: 'tuft', w: 12 }, { k: 'ribbon', w: 8 }, { k: 'scarf', w: 13 },
  ];

  const NO_SKILL_RATE = 0.12;
  // スキルなしは MP の分を ほかの能力へ割り振る (半分は攻撃)
  const NO_SKILL_SHARE = { atk: 0.5, hp: 0.2, def: 0.15, spd: 0.15 };
  const STAT_AVG = { hp: 245, mp: 22.5, atk: 69, def: 57, spd: 70 };
  const EVA_TABLE = [{ v: 0, w: 6 }, { v: 5, w: 29 }, { v: 10, w: 32 }, { v: 15, w: 27 }, { v: 30, w: 6 }];
  // 回避ごとの背の高さ。size = 全体の大きさ / leg = 脚の長さ / torso = 胴の長さ
  const HEIGHTS = {
    0: { size: 1.12, leg: 1.6, torso: 1.12, label: 'とても高い' },
    5: { size: 1.05, leg: 1.25, torso: 1.05, label: '高い' },
    10: { size: 1.0, leg: 1.0, torso: 1.0, label: 'ふつう' },
    15: { size: 0.95, leg: 0.8, torso: 0.95, label: '低い' },
    30: { size: 0.8, leg: 0.45, torso: 0.82, label: 'とても低い' },
  };
  const BODY = {
    slim: { w: 0.8, torso: 1.06, label: '細' },
    normal: { w: 1.0, torso: 1.0, label: '普通' },
    fat: { w: 1.32, torso: 0.96, label: '太' },
  };
  const BODY_TABLE = [{ k: 'slim', w: 30 }, { k: 'normal', w: 40 }, { k: 'fat', w: 30 }];
  // 体型と背の高さで 能力の「出る範囲」が決まる (あとから倍率をかけるのではなく、その範囲の中で ランダムに決まる)
  //   太 → HP が必ず高め / 細 → 素早さが必ず高め / 背が高い → 防御が高め
  //   太・とても高い → HP も防御も高い (高耐久) / 細・低い → いちばん速い
  // 値は 遺伝子 (0〜1) の範囲。背の列は とても高い / 高い / ふつう / 低い / とても低い
  const H_INDEX = { 0: 0, 5: 1, 10: 2, 15: 3, 30: 4 };
  const HP_BAND = { fat: [0.6, 1], normal: [0, 1], slim: [0, 0.45] };
  const SPD_BAND = { slim: [0.6, 1], normal: [0, 1], fat: [0, 0.45] };
  const HP_SHIFT = [0.1, 0.05, 0, -0.05, -0.1];
  const SPD_SHIFT = [-0.1, 0, 0, 0.1, 0.1];
  const DEF_BAND = [[0.55, 1], [0.35, 1], [0, 1], [0, 1], [0, 1]];
  // 才能開花 (1 を超える遺伝子) は そのまま
  const inBand = (g, lo, hi) => (g > 1 ? g : lo + (hi - lo) * g);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const band = (b, shift) => [clamp01(b[0] + shift), clamp01(b[1] + shift)];
  NS.HEIGHTS = HEIGHTS;
  NS.BODY = BODY;

  const cache = new Map();

  // 色・頭・格・遺伝子・背・体型・スキル・見た目 から 能力などを組み立てる (名前から生まれる個体と 出生の子で共通)
  // 才能開花 (★) の 倍率を のぞいた 能力 (遺伝子を 1.0 までに おさえて 組み立てなおす)。軍団の なかまなどは そのまま
  NS.baseStats = function (c) {
    if (!c.talents || !c.talents.length || c.boss || c.monster) return c.stats;
    if (c._baseStats) return c._baseStats;
    const genes = {};
    for (const k in c.genes) genes[k] = Math.min(1, c.genes[k]);
    const b = assemble({ name: c.name, color: c.color, head: c.head, blessing: c.blessing, aura: c.aura, pot: c.pot, genes, talents: [],
      evaBase: c.evaBase, body: c.body, noSkill: c.noSkill, skill: c.skill, look: c.look });
    c._baseStats = b.stats;
    return b.stats;
  };

  // 基礎の 能力: ★ (1 を こえる 遺伝子)・頭・色 (銀)・スキルなし の ボーナスを のぞいた 値
  //   STAT_BASE_MAX = その 理論上の 最大 (遺伝子 1.0・格 1.14)。ステータスバーの 9割の 位置
  NS.STAT_BASE_MAX = { hp: 399, mp: 36, atk: 114, def: 93, spd: 114, eva: 30 };
  NS.pureStats = function (c) {
    if (c.monster || !c.genes || c.genes.hp == null) return c.stats;
    if (c._pure) return c._pure;
    const g = (k) => Math.min(1, c.genes[k]);
    // 格は 名前から 生まれる 最大 1.14 まで (それを こえる ぶん = 以前の 当たり名の 子・軍団の なかま は ボーナス あつかい)
    const hi = H_INDEX[c.evaBase], pot = Math.min(1.14, c.pot);
    const [hpLo, hpHi] = band(HP_BAND[c.body], HP_SHIFT[hi]);
    const [spLo, spHi] = band(SPD_BAND[c.body], SPD_SHIFT[hi]);
    const [dfLo, dfHi] = [Math.max(DEF_BAND[hi][0], c.body === 'fat' ? 0.25 : 0), DEF_BAND[hi][1]];
    c._pure = {
      hp: Math.round((140 + 210 * inBand(g('hp'), hpLo, hpHi)) * pot),
      mp: c.noSkill ? 0 : Math.round((10 + 22 * g('mp')) * pot),
      atk: Math.round((38 + 62 * g('atk')) * pot),
      def: Math.round((30 + 52 * inBand(g('def'), dfLo, dfHi)) * pot),
      spd: Math.round((20 + 80 * inBand(g('spd'), spLo, spHi)) * pot),
      eva: c.evaBase,
    };
    return c._pure;
  };

  // 格 (能力 全部に かかる 倍率): 1.00〜1.50。出生の 開花・転生・格の宝玉 で 上がる
  NS.POT_MIN = 1.0; NS.POT_MAX = 1.5; NS.POT_BLOOM_RATE = 0.1;
  const clampPot = (v) => Math.max(NS.POT_MIN, Math.min(NS.POT_MAX, v));
  // 格の ボーナス (転生・格の宝玉) を 足した 個体の 写し。能力は 格に 比例するので 倍率で かけなおす
  NS.withPotBonus = function (c, bonus) {
    const pot = clampPot(c.pot + bonus);
    if (pot === c.pot) return c;
    const f = pot / c.pot, stats = Object.assign({}, c.stats);
    for (const k of ['hp', 'mp', 'atk', 'def', 'spd']) stats[k] = Math.round(stats[k] * f);
    const head = NS.HEADS.find((h) => h.key === c.head);
    const score = scoreOf(stats, head, c.skill ? c.skill.rarity || 1 : 0) + (c.aura ? 10 : 0);
    const out = Object.assign({}, c, { pot, stats, score, rank: rankOf(score).key });
    delete out._pure; delete out._baseStats;
    return out;
  };

  // 遺伝子の ボーナス (リアルタイム対戦の 勝利で 上がる)。gb = {hp: 0.02, ...}。遺伝子は 1.35 まで
  //   能力は ボーナス なし / ありで 組み立てた 差を 足す (軍団の なかま なども 同じ やりかたで)
  NS.GENE_KEYS = ['hp', 'mp', 'atk', 'def', 'spd'];
  NS.withGeneBonus = function (c, gb) {
    if (!gb || c.monster || !c.genes || c.genes.hp == null) return c;
    const genes = Object.assign({}, c.genes);
    let any = false;
    for (const k of NS.GENE_KEYS) { const v = Number(gb[k]) || 0; if (v > 0 && genes[k] != null) { genes[k] = Math.min(1.35, genes[k] + v); any = true; } }
    if (!any) return c;
    const p = { name: c.name, color: c.color, head: c.head, blessing: c.blessing, aura: c.aura, pot: c.pot, talents: c.talents || [], evaBase: c.evaBase, body: c.body, noSkill: c.noSkill, skill: c.skill, look: c.look };
    const a = assemble(Object.assign({}, p, { genes: c.genes })), b = assemble(Object.assign({}, p, { genes }));
    const stats = Object.assign({}, c.stats);
    for (const k of NS.GENE_KEYS) stats[k] += b.stats[k] - a.stats[k];
    const head = NS.HEADS.find((h) => h.key === c.head);
    const score = scoreOf(stats, head, c.skill ? c.skill.rarity || 1 : 0) + (c.aura ? 10 : 0);
    const out = Object.assign({}, c, { genes, stats, score, rank: rankOf(score).key });
    delete out._pure; delete out._baseStats;
    return out;
  };

  function assemble(p) {
    const C = NS.COLORS[p.color];
    const head = NS.HEADS.find((h) => h.key === p.head);
    const fx = head.effect || {};
    const { genes, evaBase, body, noSkill, skill } = p;
    const pot = clampPot(p.pot);
    const hi = H_INDEX[evaBase];
    const [hpLo, hpHi] = band(HP_BAND[body], HP_SHIFT[hi]);
    const [spLo, spHi] = band(SPD_BAND[body], SPD_SHIFT[hi]);
    const [dfLo, dfHi] = [Math.max(DEF_BAND[hi][0], body === 'fat' ? 0.25 : 0), DEF_BAND[hi][1]];
    const gHp = inBand(genes.hp, hpLo, hpHi), gSpd = inBand(genes.spd, spLo, spHi), gDef = inBand(genes.def, dfLo, dfHi);

    const stats = {
      hp: Math.round((140 + 210 * gHp) * pot) + (fx.hp || 0),
      mp: Math.round((10 + 22 * genes.mp) * pot) + head.mp,
      atk: Math.round((38 + 62 * genes.atk) * pot) + (fx.atk || 0),
      def: Math.round((30 + 52 * gDef) * pot * (C.special === 'iron' ? 1.5 : 1)) + (fx.def || 0),
      spd: Math.round((20 + 80 * gSpd) * pot) + (fx.spd || 0),
      eva: evaBase + (fx.eva || 0),
    };
    if (noSkill) { // MP は使わないので、その分を ほかの能力へ (特に攻撃)
      const m = stats.mp / STAT_AVG.mp;
      for (const k in NO_SKILL_SHARE) stats[k] += Math.round(m * NO_SKILL_SHARE[k] * STAT_AVG[k]);
      stats.mp = 0;
    }
    if (fx.spdMul) stats.spd = Math.round(stats.spd * fx.spdMul); // うさみみ: 素早さ ×1.2
    if (fx.atkMul) stats.atk = Math.round(stats.atk * fx.atkMul); // みかづき・デビル: 攻撃 ×1.2

    // 属性耐性 = 体の色 (オーラで 変わる) + 頭の効果 (全属性)
    const A = p.aura ? C.aura : null;
    const cres = Object.assign({}, C.res, (A && A.res) || {});
    const res = {};
    for (const k of NS.ELEM_KEYS) {
      let v = cres[k] || 0;
      if (A && A.noWeak && v < 0) v = 0;
      v += fx.allRes || 0;
      if (v) res[k] = v;
    }
    const score = scoreOf(stats, head, skill ? skill.rarity || 1 : 0) + (A ? 10 : 0);
    return {
      key: p.key || p.name, name: p.name, color: p.color, head: head.key, headRank: head.rank, headDesc: head.desc || null, stats, genes, pot: Math.round(pot * 100) / 100,
      talents: p.talents.filter((k) => k !== 'eva' && !(noSkill && k === 'mp')), blessing: p.blessing,
      skill, skills: skill ? [skill] : [], noSkill, mainElem: (skill && skill.elem) || C.elem || 'light',
      res, sres: C.sres, stres: statusRes(C, fx, A), special: C.special || null, aura: !!A,
      charm: (C.charm || 0) + (fx.charm || 0) + ((A && A.charm) || 0), // みりょう (毎ターン コマンド決定後に 敵それぞれへ判定)
      body, evaBase, look: p.look, score, rank: rankOf(score).key,
      ...(fx.fear ? { fear: fx.fear } : {}), ...(fx.crit ? { critUp: fx.crit } : {}), // シルクハット: きょうふ / はね: 会心
    };
  }

  // 状態異常耐性 = 体の色の 状態異常 +2 (赤 → やけど +2 など) + 頭の効果 (たいよう: 全状態異常 +3)
  // オーラ: 属性の色は その状態異常 +3 / 黒は 全状態異常 +1
  function statusRes(C, fx, A) {
    const r = {};
    const all = (fx.stRes || 0) + ((A && A.stResAll) || 0);
    if (all) for (const k of Object.keys(NS.STATUS)) r[k] = all;
    if (C.sres) r[C.sres] = (r[C.sres] || 0) + (A && A.stRes ? A.stRes : 2);
    for (const k in fx.stResOf || {}) r[k] = (r[k] || 0) + fx.stResOf[k]; // デビル: みりょう +3
    return r;
  }

  function makeLook(name, evaBase, body) {
    const H = HEIGHTS[evaBase];
    const lk = new NS.RNG(SEED_PREFIX + 'look:' + name);
    return {
      eyes: lk.int(0, 7),
      mouth: lk.int(0, 6),
      brows: lk.next() < 0.35 ? lk.int(1, 3) : 0,
      cheeks: lk.next() < 0.35,
      plate: lk.next() < 0.3 ? lk.pick(SKIN) : null,
      acc: lk.weighted(ACCS, (a) => a.w).k,
      accHue: Math.floor(lk.next() * 360),
      h: H.size * (0.985 + lk.next() * 0.03),  // 全体の大きさ
      w: BODY[body].w * (0.97 + lk.next() * 0.06), // 横幅
      phase: lk.next() * 100,
      leg: H.leg,                                // 脚の長さ
      torso: H.torso * BODY[body].torso,         // 胴の長さ
      skin: lk.weighted(SKINS, (x) => x.w).c,
      hair: lk.weighted(HAIRS, (x) => x.w).k,
      hairColor: lk.weighted(HAIR_COLORS, (x) => x.w).c,
      eyeColor: lk.weighted(EYE_COLORS, (x) => x.w).c,
      nose: lk.weighted([0, 1, 2, 3], (i) => [45, 25, 15, 15][i]),
      pattern: lk.weighted(PATTERNS, (x) => x.w).k,
      dots: spherePts(lk, 12, -0.55, 1.15, 0.15, 0.24),
      bdots: spherePts(lk, 9, -0.85, 0.85, 0.2, 0.32),
      // 顔の個性: 目の形・大きさ・はなれ具合・高さ、まゆ、ほっぺ、口の大きさ
      eyeType: lk.weighted(EYE_TYPES, (x) => x.w).k,
      eyeScale: lk.weighted(EYE_SIZES, (x) => x.w).v,
      eyeGap: lk.pick([0.27, 0.34, 0.41]),
      eyeY: lk.pick([0.12, 0.2, 0.27]),
      mouthScale: lk.pick([0.8, 1, 1.35]),
      brow: lk.weighted(BROWS, (x) => x.w).k,
      blush: lk.weighted(BLUSHES, (x) => x.w).k,
    };
  }

  NS.makeCharacter = function (rawName) {
    const name = NS.normalizeName(rawName);
    if (cache.has(name)) return cache.get(name);
    const rng = new NS.RNG(SEED_PREFIX + name);

    const color = rng.weighted(NS.COLOR_KEYS, (k) => NS.COLORS[k].w);
    const head = rng.weighted(NS.HEADS, (h) => h.w);

    // 名前そのものに宿る「格」。まれに当たり名・神名が生まれる
    const lr = rng.next();
    const aura = lr < NS.AURA_RATE; // まれに オーラを持つ (以前の 当たり名・神名 の かわり)
    const blessing = 0;
    const pot = NS.POT_MIN + rng.tri() * 0.14; // 格: 名前からは 1.00〜1.14

    const genes = {};
    const talents = [];
    for (const k of ['hp', 'mp', 'atk', 'def', 'spd', 'eva']) {
      let g = rng.tri();
      if (rng.next() < 1 / 22) { g = 1 + rng.next() * 0.35; talents.push(k); }
      genes[k] = g;
    }

    // ここから先は別系統の乱数。仕様を変えても 主系統 (色・頭・格・能力) は変わらない
    const noSkill = new NS.RNG(SEED_PREFIX + 'noskill:' + name).next() < NO_SKILL_RATE;
    // 回避は 0 / 5 / 10 / 15 / 30 の5段階。名力とは無関係で、背の高さが決まる
    const evaBase = new NS.RNG(SEED_PREFIX + 'eva:' + name).weighted(EVA_TABLE, (e) => e.w).v;
    // 体型 (細 / 普通 / 太)。背の高さと組み合わせて HP・素早さ・防御の 出る範囲が決まる
    const body = new NS.RNG(SEED_PREFIX + 'body:' + name).weighted(BODY_TABLE, (b) => b.w).k;
    const skill = noSkill ? null : NS.makeSkill(new NS.RNG(SEED_PREFIX + 'skill:' + name), NS.COLORS[color].elem);

    const ch = assemble({
      name, color, head: head.key, blessing, aura, pot, genes, talents, evaBase, body, noSkill, skill, look: makeLook(name, evaBase, body),
    });
    if (cache.size > 5000) cache.clear();
    cache.set(name, ch);
    return ch;
  };

  // ---- 名前から生まれない個体 (紅蓮騎士団の なかま・出生の子) ----
  // なかま一覧では 先頭に 私用領域の文字 (入力した名前からは 消える) をつけた キーで 区別する
  const SP = '';
  NS.isSpecial = (key) => typeof key === 'string' && key[0] === SP;
  NS.bossKey = (party, i, n) => `${SP}boss:${party}:${i}` + (n > 1 ? `:${n}` : ''); // n = 何体目 (2体目から)
  NS.kidKey = (id) => `${SP}kid:${id}`;
  NS.kids = {}; // 出生の子の記録 (セーブから読みこむ)
  const spCache = new Map();
  NS.resetSpecial = () => spCache.clear();
  NS.charOf = function (key) {
    if (!NS.isSpecial(key)) return NS.makeCharacter(key);
    if (spCache.has(key)) return spCache.get(key);
    const [kind, a, b] = key.slice(1).split(':');
    let c = null;
    if (kind === 'boss') {
      const P = NS.BOSS_PARTIES[a], m = P && P.members[+b];
      if (m) c = NS.makeBoss(m, m.color || P.color, key, !!P.aura, P.pot);
    } else if (kind === 'kid' && NS.kids[a]) c = NS.makeChild(NS.kids[a], key);
    if (!c) return NS.makeCharacter('？？？'); // 記録が見つからない
    spCache.set(key, c);
    return c;
  };

  // 能力から 遺伝子を逆算する (紅蓮騎士団の なかまを 出生の親にするとき用)
  const BOSS_POT = 1.15;
  function genesFromStats(st, head, body, evaBase, color, potIn) {
    const fx = head.effect || {}, hi = H_INDEX[evaBase], pot = potIn || BOSS_POT;
    const iron = NS.COLORS[color].special === 'iron' ? 1.5 : 1;
    const unband = (u, [lo, up]) => (u > 1 ? u : up > lo ? clamp01((u - lo) / (up - lo)) : 0); // 範囲の外は 範囲の端
    const g = {
      hp: unband(((st.hp - (fx.hp || 0)) / pot - 140) / 210, band(HP_BAND[body], HP_SHIFT[hi])),
      mp: ((st.mp - head.mp) / pot - 10) / 22,
      atk: ((st.atk / (fx.atkMul || 1) - (fx.atk || 0)) / pot - 38) / 62,
      def: unband(((st.def - (fx.def || 0)) / pot / iron - 30) / 52, [Math.max(DEF_BAND[hi][0], body === 'fat' ? 0.25 : 0), DEF_BAND[hi][1]]),
      spd: unband(((st.spd / (fx.spdMul || 1) - (fx.spd || 0)) / pot - 20) / 80, band(SPD_BAND[body], SPD_SHIFT[hi])),
      eva: 0.5,
    };
    for (const k in g) g[k] = Math.max(0, Math.min(1.35, g[k]));
    return g;
  }

  // 名のある軍団の敵。見た目の細かいところは 同じ名前の個体から借りて、色・頭・体型・背・スキル・能力を 決めた値にする
  NS.makeBoss = function (def, color, key, aura, potFixed) {
    const potB = potFixed || BOSS_POT; // 軍団ごとに 決めた 格 (なければ 1.15)
    const b = NS.makeCharacter(def.name);
    const C = NS.COLORS[color];
    const head = NS.HEADS.find((h) => h.key === def.head);
    const fx = head.effect || {};
    const skill = def.skill ? NS.skillByKey(def.skill) : null;
    const stats = Object.assign({}, def.stats, { mp: skill && def.stats ? def.stats.mp : 0, eva: def.eva + (fx.eva || 0) });
    const H = HEIGHTS[def.eva], H0 = HEIGHTS[b.evaBase];
    const look = Object.assign({}, b.look, def.look || {}, {
      h: H.size * (b.look.h / H0.size), w: BODY[def.body].w * (b.look.w / BODY[b.body].w),
      leg: H.leg, torso: H.torso * BODY[def.body].torso,
    });
    // 遺伝子で 決める メンバー (鋼鉄師団): 基礎の 遺伝子 + ランダムな 2〜3か所が ★1.30 (名前ごとに 決まる)
    if (def.genes) {
      const rng = new NS.RNG(SEED_PREFIX + 'bossgene:' + def.name);
      const ks = KID_STATS.filter((k) => skill || k !== 'mp'); // スキルなしは MP の ★ が 意味ないので のぞく
      for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [ks[i], ks[j]] = [ks[j], ks[i]]; }
      const talents = ks.slice(0, rng.next() < 0.35 ? 3 : 2);
      const genes = Object.assign({ eva: 0.5 }, def.genes);
      for (const k of talents) genes[k] = def.talentGene || 1.3;
      const c = assemble({ key, name: def.name, color, head: def.head, blessing: 0, aura, pot: potB, genes, talents,
        evaBase: def.eva, body: def.body, noSkill: !skill, skill, look });
      return Object.assign(c, { key: key || def.name, boss: true, crown: !!def.leader });
    }
    // オーラ: 名前から 生まれた個体と 同じ 効果
    const A = aura && C.aura ? C.aura : null;
    const cres = Object.assign({}, C.res, (A && A.res) || {});
    const res = {};
    for (const k of NS.ELEM_KEYS) {
      let v = cres[k] || 0;
      if (A && A.noWeak && v < 0) v = 0;
      v += fx.allRes || 0;
      if (v) res[k] = v;
    }
    const score = scoreOf(stats, head, skill ? skill.rarity || 1 : 0) + (A ? 10 : 0);
    const c = {
      key: key || def.name, name: def.name, color, head: head.key, headRank: head.rank, headDesc: head.desc || null, stats,
      genes: genesFromStats(stats, head, def.body, def.eva, color, potB), pot: potB,
      talents: [], blessing: 0, skill, skills: skill ? [skill] : [], noSkill: !skill,
      mainElem: (skill && skill.elem) || C.elem || 'light', res, sres: C.sres, stres: statusRes(C, fx, A), special: C.special || null, aura: !!A,
      charm: (C.charm || 0) + (fx.charm || 0) + ((A && A.charm) || 0), body: def.body, evaBase: def.eva, look, score, rank: rankOf(score).key,
      boss: true, crown: !!def.leader,
      ...(fx.fear ? { fear: fx.fear } : {}), ...(fx.crit ? { critUp: fx.crit } : {}),
    };
    return c;
  };
  NS.bossParty = (key) => {
    const P = NS.BOSS_PARTIES[key];
    // 敵として 戦うときだけ 装備を つける (なかまに なった 個体は 装備なし)
    return P.members.map((m, i) => {
      const c = NS.makeBoss(m, m.color || P.color, NS.bossKey(key, i), !!P.aura, P.pot);
      return m.equip ? NS.withEquip(c, m.equip) : c;
    });
  };

  // ---- 出生 (精霊の祠) ----
  // 2体の 色・頭・体型・背・遺伝子 (能力ごと)・格・スキル・見た目を それぞれ 1/2 で受けつぐ。
  // 同じ2体からは いつも同じ子が生まれる (やり直しても 変わらない)
  const KID_STATS = ['hp', 'mp', 'atk', 'def', 'spd'];
  const LOOK_GROUPS = [['eyes'], ['mouth'], ['brows'], ['cheeks'], ['plate'], ['acc', 'accHue'], ['phase'], ['skin'], ['hair'], ['hairColor'],
    ['eyeColor'], ['nose'], ['pattern', 'dots', 'bdots'], ['eyeType'], ['eyeScale'], ['eyeGap'], ['eyeY'], ['mouthScale'], ['brow'], ['blush']];
  NS.findRecipe = (list, x, y) => list.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x)) || null;
  NS.MUTATION_RATE = 0.1;

  NS.breed = function (A, B, childName) {
    const rng = new NS.RNG(SEED_PREFIX + 'kid:' + [A.key, B.key].sort().join('|'));
    const pick = (a, b) => (rng.next() < 0.5 ? a : b);
    // 頭: 組み合わせによっては 進化する (必ず)
    // どせい・りゅうせい: 親が 2体とも 同じ → かならず / 片方が もつ → 25% (ちがう 2つなら どちらかを 25% ずつ)
    //   たいよう × みかづき → 25% で どせい / ほし × たいよう → 25% で りゅうせい
    let hr = NS.findRecipe(NS.HEAD_RECIPES, A.head, B.head);
    let head;
    const INH = NS.INHERIT_HEADS, ia = INH.includes(A.head), ib = INH.includes(B.head);
    if (ia && ib && A.head === B.head) head = A.head;
    else if (ia && ib) { const r = rng.next(), ra = inhRate(A.head); head = r < ra ? A.head : r < ra + inhRate(B.head) ? B.head : pick(A.head, B.head); }
    else if (ia || ib) head = rng.next() < inhRate(ia ? A.head : B.head) ? (ia ? A.head : B.head) : (ia ? B.head : A.head);
    else if (hr && hr.chance) { if (rng.next() < hr.chance) head = hr.to; else { head = pick(A.head, B.head); hr = null; } }
    else head = hr ? hr.to : pick(A.head, B.head);
    // 色: 組み合わせによっては 1/3 で まざった色になる
    const cr = NS.findRecipe(NS.COLOR_RECIPES, A.color, B.color);
    const mixed = !!cr && rng.next() < 1 / 3;
    const color = mixed ? cr.to : pick(A.color, B.color);
    const body = pick(A.body, B.body);
    const eva = pick(A.evaBase, B.evaBase);
    const genes = {};
    for (const k of KID_STATS) genes[k] = pick(A.genes[k], B.genes[k]);
    genes.eva = 0.5;
    const pot = pick(A.pot, B.pot);
    let sk = pick(A, B).skill;
    // 受けつぎにくい スキル (ゴーヘブン: 20%)。親が 2体とも もっていれば かならず
    const sa = A.skill, sb = B.skill;
    if (((sa && sa.inherit) || (sb && sb.inherit)) && !(sa && sb && sa.key === sb.key)) {
      const R = sa && sa.inherit ? sa : sb;
      sk = rng.next() < R.inherit ? R : R === sa ? sb : sa;
    }
    // 突然変異: まれに 能力の1つが 才能開花する
    let mutation = null, mutationFrom = null;
    if (rng.next() < NS.MUTATION_RATE) {
      // 1.35 に とどいていない 能力から 1つ。★なら 今より 上 (+0.01〜1.35) に 引きなおす
      const ks = KID_STATS.filter((k) => genes[k] < 1.35);
      if (ks.length) {
        const k = rng.pick(ks), g = genes[k];
        mutationFrom = g > 1 ? g : null;
        genes[k] = g <= 1 ? 1 + rng.next() * 0.35 : Math.min(1.35, g + 0.01 + rng.next() * Math.max(0, 1.35 - g - 0.01));
        mutation = k;
      }
    }
    // 見た目: パーツごとに どちらかの親から
    const look = {};
    for (const g of LOOK_GROUPS) { const src = pick(A.look, B.look); for (const k of g) look[k] = src[k]; }
    const H = HEIGHTS[eva];
    look.h = H.size * (0.985 + rng.next() * 0.03);
    look.w = BODY[body].w * (0.97 + rng.next() * 0.06);
    look.leg = H.leg;
    look.torso = H.torso * BODY[body].torso;
    const gen = Math.max(A.kid ? A.kid.gen : 1, B.kid ? B.kid.gen : 1) + 1;
    const aura = A.aura && B.aura ? true : !!(A.aura || B.aura) && rng.next() < 0.5; // オーラは 1/2 で 受けつぐ (親が 2体とも オーラなら かならず)
    // 格の 開花: 10% で 親の 格より +0.01〜0.10 (上限 1.50)
    const potFrom = clampPot(pot);
    const potUp = rng.next() < NS.POT_BLOOM_RATE ? (1 + Math.floor(rng.next() * 10)) / 100 : 0;
    return {
      name: NS.normalizeName(childName) || NS.kidName(A.name, B.name), parentNames: [A.name, B.name], gen,
      color, head, body, eva, genes, pot: Math.round(clampPot(potFrom + potUp) * 100) / 100, skill: sk ? sk.key : null, look,
      evolved: hr ? head : null, mixed: mixed ? color : null, mutation, mutationFrom,
      aura, potUp: potUp && potFrom < NS.POT_MAX ? potUp : 0, potFrom,
    };
  };

  function inhRate(h) { return (NS.INHERIT_RATE && NS.INHERIT_RATE[h]) || 0.25; }
  NS.makeChild = function (d, key) {
    const skill = d.skill ? NS.skillByKey(d.skill) : null;
    const c = assemble({
      key, name: d.name, color: d.color, head: d.head, blessing: 0, pot: d.pot, genes: d.genes,
      aura: !!d.aura, talents: KID_STATS.filter((k) => d.genes[k] > 1), evaBase: d.eva, body: d.body, noSkill: !skill, skill, look: d.look,
    });
    c.kid = { parents: d.parentNames, gen: d.gen, evolved: d.evolved, mixed: d.mixed, mutation: d.mutation, mutationFrom: d.mutationFrom || null, potUp: d.potUp || 0, potFrom: d.potFrom || null };
    return c;
  };

  // 子の名前の候補: 親の名前を 半分ずつ つなげる
  NS.kidName = function (a, b) {
    const x = Array.from(a), y = Array.from(b);
    return NS.normalizeName(x.slice(0, Math.ceil(x.length / 2)).join('') + y.slice(Math.floor(y.length / 2)).join(''));
  };

  // 名力: 回避をのぞく5能力を 平均100に正規化した平均 × 5 + スキルの希少度 + 頭の形 (+効果)
  // スキルなしの MP は ほかの能力へ移してあるので、そのまま 0 として数える
  function scoreOf(st, head, skillPts) {
    const n = st.hp / 245 + st.mp / 22.5 + st.atk / 69 + st.def / 57 + st.spd / 70;
    return Math.round((n / 5) * 500 + skillPts * 10 + head.rank * 6 + (head.score || 0));
  }
  NS.scoreOf = scoreOf;

  function rankOf(score) {
    for (const r of NS.RANKS) if (score >= r.min) return r;
    return NS.RANKS[NS.RANKS.length - 1];
  }
  NS.rankOf = rankOf;
  NS.rankInfo = (key) => NS.RANKS.find((r) => r.key === key);
  NS.rankIndex = (key) => NS.RANKS.length - 1 - NS.RANKS.findIndex((r) => r.key === key); // D=0 … NAMESIS=6

  // ---- ランダムな名前 ----
  const MORA = ('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ' +
    'がぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽ').split('');
  // 拗音: き・し・ち・に・ひ・み・り・ぎ・じ・び・ぴ × ゃゅょ
  const YOON = [];
  for (const c of 'きしちにひみりぎじびぴ') for (const y of 'ゃゅょ') YOON.push(c + y);
  const SUFFIX = ['た', 'と', 'や', 'こ', 'み', 'な', 'ろう', 'すけ', 'じ', 'まる', 'きち', 'ぞう', 'の', 'か', 'り', 'ん', 'お', 'え', 'へい', 'たろう', 'ひめ',
    'じろう', 'べえ', 'えもん', 'のすけ', 'ぴょん', 'りん', 'ちゃん', 'くん', 'さま', 'まろ', 'ぼう', 'たん', 'っち', 'りょう', 'しん', 'ごん', 'ちよ', 'ね', 'よ', 'さ', 'ら', 'る', 'ぞ', 'もん'];

  function toKatakana(s) {
    return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  }

  NS.randomName = function (rand = Math.random) {
    const pick = (a) => a[Math.floor(rand() * a.length)];
    // 音の数: 1 (5%) / 2 (35%) / 3 (38%) / 4 (22%)。とちゅうに っ・ん・ー が 入ることも (同じ名前に なりにくいように)
    let s = '';
    const r0 = rand();
    const n = r0 < 0.05 ? 1 : r0 < 0.4 ? 2 : r0 < 0.78 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      s += rand() < 0.12 ? pick(YOON) : pick(MORA);
      if (i < n - 1) { const m = rand(); if (m < 0.07) s += 'っ'; else if (m < 0.14) s += 'ん'; else if (m < 0.18) s += 'ー'; }
    }
    if (rand() < 0.1) s += rand() < 0.5 ? 'っ' : 'ん';
    if (rand() < 0.5 || s.length < 2) s += pick(SUFFIX);
    if (rand() < 0.22) s = toKatakana(s);
    return NS.normalizeName(s);
  };

  // ---- 漢字・アルファベットまじりの ランダムな名前 ----
  const KANJI = ('炎龍光闇月星剣風雷氷王姫丸花雪桜鬼神影空海山川森火水土金銀鉄虎鷹狼蝶夢翼刃雲嵐霧天地魔聖紅蒼翠白黒黄紫' +
    '太郎次郎子美雄斗翔真優陽' +
    '朱碧琥珀瑠璃玉晶鋼岩砂波滝泉湖島峰谷野原林竹松梅菊蘭蓮椿楓葉実種根芽' +
    '鳳凰麒麟獅豹熊猿鹿馬牛猫犬兎狐鴉鶴燕雀鯨鮫蛇亀蛙蜂' +
    '刀槍弓斧盾鎧冠旗鐘鈴笛琴輪環鎖針糸' +
    '朝昼夕夜春夏秋冬霜霞虹雫露嶺暁宵' +
    '勇武義仁智忍誠剛烈迅閃轟爆輝煌幻凛蓮慧颯').split('');
  const KANJI_END = ['丸', '郎', '太', '子', '姫', '王', '斗', '介', '蔵', '之助', '兵衛', '院', '卿', '様',
    '衛門', '左衛門', '彦', '吉', '平', '助', '乃', '代', '音', '菜', '香', '輝', '道', '坊', '将', '帝', '神', '鬼', '尊', '翁'];
  const ALPHA = ['ka', 'ze', 'ro', 'mi', 'ra', 'ne', 'lu', 'to', 'vi', 'xa', 'gu', 'jo', 'fi', 'ry', 'el', 'an', 'or', 'is', 'ku', 'sa', 'do', 'me', 'li', 'zu',
    'ba', 'be', 'ce', 'da', 'de', 'ga', 'ha', 'he', 'ja', 'ki', 'la', 'le', 'ma', 'mo', 'na', 'no', 'pa', 'pe', 'qu', 're', 'ri', 'se', 'sh', 'ta', 'ti',
    'ul', 'va', 've', 'wa', 'wy', 'xe', 'ya', 'yo', 'za', 'zo', 'ar', 'en', 'il', 'on', 'um', 'ae', 'io', 'kr', 'st', 'dr', 'gr', 'th'];
  const ALPHA_END = ['n', 'x', 's', 'r', 'k', 'th', 'on', 'ia', 'us', 'o', '', 'a', 'e', 'y', 'el', 'en', 'ar', 'is', 'os', 'ix', 'ax', 'ra', 'na', 'ko', 'ze', 'ius', 'ion', 'ard'];
  const MARKS = ['Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'X', 'Z', 'Mk2', 'Mk3', '2', '3', '7', '8', '13', '99', '100', 'α', 'β', 'γ', 'δ', 'Ω', 'Σ', '改', '零', '弐', '参', '極', '真', '神', '+', '★', 'EX', 'DX', 'RX', 'GT', 'Jr'];
  NS.randomFancyName = function (rand = Math.random) {
    const pick = (a) => a[Math.floor(rand() * a.length)];
    const kana = () => NS.randomName(rand);
    const alpha = () => {
      let s = '';
      const n = 1 + Math.floor(rand() * 2.6);
      for (let i = 0; i < n; i++) s += pick(ALPHA);
      s += pick(ALPHA_END);
      return s[0].toUpperCase() + s.slice(1);
    };
    const kanji = (n) => Array.from({ length: n }, () => pick(KANJI)).join('');
    const r = rand();
    let s;
    if (r < 0.22) s = kanji(1 + Math.floor(rand() * 2)) + pick(KANJI_END);              // 龍丸・紅蓮之助
    else if (r < 0.38) s = kanji(2 + Math.floor(rand() * 2));                            // 炎星・月影鬼
    else if (r < 0.56) s = alpha();                                                       // Zerok・Mira
    else if (r < 0.68) s = alpha() + pick(MARKS);                                         // LunaⅡ・KazeX
    else if (r < 0.8) s = kanji(1 + Math.floor(rand() * 2)) + kana().slice(0, 3);        // 炎たろ
    else if (r < 0.86) s = kana().slice(0, 4) + pick(MARKS);                              // ぽろな改
    else if (r < 0.9) s = pick(KANJI) + '・' + alpha();                                   // 闇・Riku
    else if (r < 0.94) s = alpha() + pick(KANJI_END);                                     // Mira丸
    else if (r < 0.97) s = kanji(1) + toKatakana(kana().slice(0, 3));                     // 炎ポロ
    else s = kanji(2) + pick(MARKS);                                                      // 龍星Ⅱ
    return NS.normalizeName(s);
  };

  // 指定ランク範囲の名前を探す (大会の対戦相手用)
  NS.findNameInRanks = function (ranks, rand = Math.random, avoid = new Set()) {
    const want = new Set(ranks);
    let fallback = null, fallbackScore = -1;
    for (let i = 0; i < 6000; i++) {
      // 名前は ひらがな・カタカナ と 漢字・アルファベットまじり を 半分ずつ (大会の相手が 見あきないように)
      const nm = rand() < 0.5 ? NS.randomName(rand) : NS.randomFancyName(rand);
      if (avoid.has(nm)) continue;
      const ch = NS.makeCharacter(nm);
      if (want.has(ch.rank)) return nm;
      if (ch.score > fallbackScore) { fallback = nm; fallbackScore = ch.score; }
    }
    return fallback;
  };
})();
