// ゲームデータ: 属性・体の色・頭の形・状態異常・スキル・大会
// 属性と色の対応は「電波人間のRPG」の体色システムを参考にしている。
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});

  // 6属性の相性は 火>氷>風>土>雷>水>火 のサイクル。光と闇は互いに弱点。
  NS.ELEMENTS = {
    fire:    { name: '火', color: '#ff6a3c', status: 'burn' },
    water:   { name: '水', color: '#3c8cff', status: 'soak' },
    ice:     { name: '氷', color: '#8fe8ff', status: 'frost' },
    wind:    { name: '風', color: '#5fe07a', status: 'cold' },
    earth:   { name: '土', color: '#d79a4a', status: 'mud' },
    thunder: { name: '雷', color: '#ffe14a', status: 'shock' },
    light:   { name: '光', color: '#fff4c0', status: 'blind' },
    dark:    { name: '闇', color: '#b07aff', status: 'curse' },
  };
  NS.ELEM_KEYS = Object.keys(NS.ELEMENTS);

  const ALL_MINUS_1 = {}, ALL_PLUS_1 = {};
  NS.ELEM_KEYS.forEach((k) => { ALL_MINUS_1[k] = -1; ALL_PLUS_1[k] = 1; });

  // 体の色: 属性・耐性(+で軽減/-で弱点)・状態異常耐性・特殊効果
  NS.COLORS = {
    red:    { name: '赤',   hex: '#e8392f', elem: 'fire',    res: { fire: 2, water: -2 },    sres: 'burn',  w: 10 },
    blue:   { name: '青',   hex: '#2f62e8', elem: 'water',   res: { water: 2, thunder: -2 }, sres: 'soak',  w: 10 },
    aqua:   { name: '水色', hex: '#4cc8f0', elem: 'ice',     res: { ice: 2, fire: -2 },      sres: 'frost', w: 10 },
    green:  { name: '緑',   hex: '#36c25a', elem: 'wind',    res: { wind: 2, ice: -2 },      sres: 'cold',  w: 10 },
    orange: { name: '橙',   hex: '#f28a2e', elem: 'earth',   res: { earth: 2, wind: -2 },    sres: 'mud',   w: 10 },
    yellow: { name: '黄',   hex: '#fff35a', elem: 'thunder', res: { thunder: 2, earth: -2 }, sres: 'shock', w: 10 },
    white:  { name: '白',   hex: '#f2f2f2', elem: 'light',   res: { light: 2, dark: -2 },    sres: 'blind', w: 8 },
    purple: { name: '紫',   hex: '#8a4fd8', elem: 'dark',    res: { dark: 2, light: -2 },    sres: 'curse', w: 8 },
    black:  { name: '黒',   hex: '#3b3b44', elem: null,      res: {},                         sres: null,    w: 8,
              desc: '弱点も耐性もない' },
    silver: { name: '銀',   hex: '#b9c4d0', elem: null,      res: { water: -2, thunder: -2 }, sres: null,   w: 2.5,
              special: 'iron', desc: '防御力 ×1.5' },
    gold:   { name: '金',   hex: '#e6b422', elem: null,      res: { fire: -1, dark: -1, water: 1, ice: 1, wind: 1, earth: 1, thunder: 1, light: 1 },     sres: null,    w: 2,
              special: 'fame', desc: '勝利時の名声 +50%' },
    pink:   { name: '桃',   hex: '#ff8fc8', elem: null,      res: ALL_MINUS_1,                sres: 'charm', w: 2,
              special: 'charm', charm: 0.05, desc: 'みりょう 5% (毎ターン コマンド決定後に 敵それぞれへ。みりょうされると1ターン動けない)' },
  };
  NS.COLOR_KEYS = Object.keys(NS.COLORS);

  // オーラ: まれに (1/40) 持つ キャラがいる。体の色ごとに 効果が ちがう (単色だけ。出生では 1/2 で 受けつぐ)
  NS.AURA_RATE = 1 / 40;
  const ST = { burn: 'やけど', soak: 'みずびたし', frost: 'しもやけ', cold: 'かぜっぴき', mud: 'どろだらけ', shock: 'かんでん', blind: 'ブラインド', curse: 'のろい' };
  for (const k of ['red', 'blue', 'aqua', 'green', 'orange', 'yellow', 'white', 'purple']) {
    const C = NS.COLORS[k], E = NS.ELEMENTS[C.elem].name;
    C.aura = { noWeak: true, stRes: 3, power: 1.2, desc: `弱点なし・${E}耐性 +2・${ST[C.sres]}耐性 +3・${E}の技の 威力 ×1.2` };
  }
  NS.COLORS.gold.aura = { noWeak: true, desc: '火・闇が 弱点では なくなる' };
  NS.COLORS.silver.aura = { res: { water: -1, thunder: -1 }, desc: '水・雷の 弱点が −1 に' };
  NS.COLORS.pink.aura = { charm: 0.05, desc: 'ゆうわく: みりょう +5% (あわせて 10%)' };
  NS.COLORS.black.aura = { stResAll: 1, desc: '全状態異常耐性 +1' };

  // 頭の形: 能力の 足し算は なし。一部の形に 特別な効果がある (レアな形ほど 名力が高い)
  //   effect: cover = 味方への 攻撃を かばう確率 / spdMul / atkMul = 素早さ・攻撃の倍率 / stResOf = 状態異常ごとの耐性 / stRes = 全状態異常耐性 / charm = 毎ターン コマンド決定後に 敵それぞれを みりょうにする確率 / allRes = 全属性耐性
  //   score = 能力の加算以外の効果ぶんの 名力ボーナス
  NS.HEADS = [
    { key: 'round',   name: 'まる',     rank: 1, mp: 0, w: 14,  effect: {} },
    { key: 'egg',     name: 'たまご',   rank: 1, mp: 0, w: 12,  effect: {} },
    { key: 'mochi',   name: 'もち',     rank: 1, mp: 0, w: 11,  effect: {} },
    { key: 'onigiri', name: 'おにぎり', rank: 1, mp: 0, w: 10,  effect: {} },
    { key: 'box',     name: 'しかく',   rank: 1, mp: 0, w: 11,  effect: {} },
    { key: 'cat',     name: 'ねこ',     rank: 1, mp: 0, w: 7,   effect: {} },
    { key: 'bear',    name: 'くま',     rank: 1, mp: 0, w: 7,   effect: {} },
    { key: 'hex',     name: 'ろっかく', rank: 2, mp: 0, w: 5,   effect: {} },
    { key: 'spiky',   name: 'トゲトゲ', rank: 2, mp: 0, w: 5,   effect: {} },
    { key: 'flame',   name: 'ほのお',   rank: 2, mp: 0, w: 4,   effect: {} },
    { key: 'block',   name: 'ブロック', rank: 2, mp: 0, w: 4,   effect: {} },
    { key: 'moon',    name: 'みかづき', rank: 3, mp: 0, w: 2.5, effect: { atkMul: 1.2 } },
    { key: 'heart',   name: 'ハート',   rank: 3, mp: 0, w: 2,   effect: { charm: 0.05 }, score: 8 },
    { key: 'bunny',   name: 'うさみみ', rank: 3, mp: 0, w: 2,   effect: { spdMul: 1.2 } },
    { key: 'star',    name: 'ほし',     rank: 4, mp: 0, w: 0.8, effect: { allRes: 1 }, score: 8 },
    { key: 'sun',     name: 'たいよう', rank: 4, mp: 0, w: 0.7, effect: { stRes: 1 }, score: 6 },
    // デビル: 名前からは 生まれない (出生で トゲトゲ × まる・たまご・もち・おにぎり)
    { key: 'devil',   name: 'デビル',   rank: 3, mp: 0, w: 0,   effect: { atkMul: 1.2, stResOf: { charm: 3 } }, score: 4 },
    // どせい: 名前からは 生まれない (出生で たいよう × みかづき)
    { key: 'saturn',  name: 'どせい',   rank: 4, mp: 0, w: 0,   effect: { allRes: 1, stRes: 1 }, score: 12 },
    // キャッスル: 名前からは 生まれない (出生で ブロック × ブロック → 1/2)
    { key: 'castle',  name: 'キャッスル', rank: 4, mp: 0, w: 0, effect: { def: 50, allRes: 1, cover: 0.3 }, score: 10 },
    // りゅうせい: 名前からは 生まれない (出生で ほし × たいよう → 25%)。全状態異常耐性 +2
    { key: 'meteor',  name: 'りゅうせい', rank: 4, mp: 0, w: 0, effect: { stRes: 2 }, score: 12 },
    // 黒翼魔導団の 頭: 名前からは 生まれない (魔導団を 制覇して なかまに なった 団員だけ)
    { key: 'silkhat', name: 'シルクハット', rank: 4, mp: 0, w: 0, effect: { fear: 0.1, allRes: 2 }, score: 14 },
    { key: 'odango',  name: 'おだんご', rank: 4, mp: 0, w: 0, effect: { allRes: 2, stRes: 2 }, score: 14 },
    { key: 'wings',   name: 'はね',     rank: 4, mp: 0, w: 0, effect: { crit: 0.3, stRes: 1 }, score: 12 },
  ];
  // 親から 25% で 受けつぐ 頭 (2体とも 同じなら かならず)
  NS.INHERIT_HEADS = ['saturn', 'meteor', 'silkhat', 'odango', 'wings'];
  NS.INHERIT_RATE = { silkhat: 0.2, odango: 0.2, wings: 0.2 }; // 片方の 親から 受けつぐ 確率 (書いて いない 頭は 25%)
  // 効果の説明文 (例: 「攻撃 +5」「みりょう 10%」)
  for (const h of NS.HEADS) {
    const e = h.effect || {};
    const parts = [];
    for (const k of ['hp', 'atk', 'def', 'spd', 'eva']) if (e[k]) parts.push(`${{ hp: 'HP', atk: '攻撃', def: '防御', spd: '素早さ', eva: '回避' }[k]} +${e[k]}`);
    if (h.mp) parts.push(`MP +${h.mp}`);
    if (e.atkMul) parts.push(`攻撃 ×${e.atkMul}`);
    if (e.spdMul) parts.push(`素早さ ×${e.spdMul}`);
    if (e.allRes) parts.push(`全属性耐性 +${e.allRes}`);
    if (e.cover) parts.push(`味方への 攻撃を ${Math.round(e.cover * 100)}% で かばう`);
    if (e.stRes) parts.push(`全状態異常耐性 +${e.stRes}`);
    for (const k in e.stResOf || {}) parts.push(`${({ charm: 'みりょう' })[k] || k}耐性 +${e.stResOf[k]}`);
    if (e.charm) parts.push(`みりょう ${Math.round(e.charm * 100)}% (毎ターン コマンド決定後、敵それぞれへ)`);
    if (e.fear) parts.push(`きょうふ ${Math.round(e.fear * 100)}% (毎ターン コマンド決定後、敵それぞれへ)`);
    if (e.crit) parts.push(`会心率 +${Math.round(e.crit * 100)}%`);
    h.desc = parts.join(' ・ ');
  }

  NS.STATUS = {
    burn:   { name: 'やけど',     icon: '🔥', desc: '毎ターン 最大HPの5% ダメージ・火耐性 −1' },
    soak:   { name: 'みずびたし', icon: '💧', desc: '毎ターン 最大HPの5% ダメージ・水耐性 −1' },
    frost:  { name: 'しもやけ',   icon: '❄️', desc: '毎ターン 最大HPの5% ダメージ・氷耐性 −1' },
    cold:   { name: 'かぜっぴき', icon: '🤧', desc: '毎ターン 最大HPの5% ダメージ・風耐性 −1' },
    mud:    { name: 'どろだらけ', icon: '🟤', desc: '毎ターン 最大HPの5% ダメージ・土耐性 −1' },
    shock:  { name: 'かんでん',   icon: '⚡', desc: '毎ターン 最大HPの5% ダメージ・雷耐性 −1' },
    blind:  { name: 'ブラインド', icon: '🕶️', desc: '攻撃が 当たりにくい' },
    curse:  { name: 'のろい',     icon: '💀', desc: '毎ターン 最大HPの5% ダメージ・闇耐性 −1' },
    charm:  { name: 'みりょう',   icon: '💗', desc: '1ターン 動けない' },
    sleep:  { name: 'ねむり',     icon: '💤', desc: '1〜2ターン 動けない。攻撃されると 目をさまし、次のターンから動ける' },
    paralyze: { name: 'まひ',     icon: '💫', desc: '1〜2ターン 動けない' },
    fear:   { name: 'きょうふ',   icon: '😨', desc: '1回 動けない' },
    seal:   { name: 'アンテナ封じ', icon: '🚫', desc: 'スキルが 使えない (1ターンの間)' },
    poison: { name: 'どく',       icon: '☠️', desc: 'たおれるまで なおらない。毎ターン 最大HPの20% ダメージ' },
    nobuff: { name: '能力アップ無効', icon: '👁️', desc: '能力アップ (ムキムキ・ガチガチ・かぜになれ・かわしやすい) が 効かない (3ターン)' },
  };

  NS.STAT_LABELS = { hp: 'HP', mp: 'MP', atk: '攻撃', def: '防御', spd: '素早さ', eva: '回避' };
  NS.STAT_MAX = { hp: 480, mp: 60, atk: 135, def: 115, spd: 135, eva: 35 };

  // ランクのしきい値 (名力) — tools/calibrate.js で 20万名のシミュレーションから算出
  NS.RANKS = [
    { key: 'NAMESIS', min: 769, color: '#ff4fd8', label: 'NAMESIS' },
    { key: 'SS', min: 699, color: '#ff4f4f', label: 'SS' },
    { key: 'S',  min: 655, color: '#ffc531', label: 'S' },
    { key: 'A',  min: 614, color: '#c07bff', label: 'A' },
    { key: 'B',  min: 574, color: '#4fa8ff', label: 'B' },
    { key: 'C',  min: 529, color: '#5fd36b', label: 'C' },
    { key: 'D',  min: -Infinity, color: '#9aa0a8', label: 'D' },
  ];

  // ---- スキル (1体につき1つ) ----
  // 属性攻撃の名前は「電波人間のRPG」のアンテナ名を流用 (私的利用)。範囲は 1体 / 3体 / 全体
  const ELEM_ATTACKS = {
    fire: {
      single: ['ひのたま', 'かえんほうしゃ', 'もえさかるごうか', 'やきつくすほのお', 'いっせんど', 'いちまんど'],
      three: ['ばくはつ', 'だいばくはつ', 'ビッグバン', 'ビックバンW', 'ビックバンX'],
      all: ['やまかじ', 'にえたぎるマグマ', 'じごくのごうか', 'インフェルノ', 'ヘルファイア'],
    },
    ice: {
      single: ['とがったこおり', 'こおりのやいば', 'つららミサイル', 'ひょうちゅうおとし', 'ひょうざんおとし', 'すいせいおとし'],
      three: ['ロックアイス', 'まんねんごおり', 'ダイヤモンドダスト', 'ブリザード', 'アイスクライム'],
      all: ['あられ', 'ふぶき', 'もうふぶき', 'ひょうてんか', 'ぜったいれいど'],
    },
    wind: {
      single: ['つむじかぜ', 'すなあらし', 'サイクロン', 'かみかぜ', 'たつまき', 'おおたつまき'],
      three: ['ビルかぜ', 'ぼうふう', 'ハリケーン', 'トルネード', 'ビッグトルネード'],
      all: ['かまいたち', 'ジェットきりゅう', 'ダウンバースト', 'テンペスト', 'ラストテンペスト'],
    },
    earth: {
      single: ['らくせき', 'どしゃくずれ', 'いわなだれ', 'てんちほうらく', 'てんぺんちい', 'さんろくほうかい'],
      three: ['いしつぶて', 'がんせきおとし', 'いんせきらっか', 'メテオアタック', 'シューティングスター'],
      all: ['マグニチュード3', 'マグニチュード6', 'マグニチュード12', 'マグニチュード24', 'マグニチュード48'],
    },
    thunder: {
      single: ['せいでんき', 'でんきショック', 'スパーク', 'でんきだま', 'こうあつだま', 'プラズマだま'],
      three: ['いなづま', 'シンゲンかみなり', 'せいてんのへきれき', 'いかづち', 'てんのいかり'],
      all: ['ひゃくボルト', 'いちまんボルト', 'いちおくボルト', 'じゅうおくボルト', 'ひゃくおくボルト'],
    },
    water: {
      single: ['みずでっぽう', 'てっぽうみず', 'だくりゅう', 'げきりゅう', 'こうずい', 'だいこうずい'],
      three: ['バケツのみず', 'たきつぼ', 'ジェットスプラッシュ', 'スーパースプラッシュ', 'ナイアガラ'],
      all: ['たかなみ', 'つなみ', 'おおつなみ', 'かいりゅう', 'くろしお'],
    },
    light: {
      single: ['よわいこうせん', 'まばゆいこうせん', 'レーザービーム', 'はかいこうせん', 'レーザーガン', 'レーザーキャノン'],
      three: ['スポットライト', 'はじけるせんこう', 'フレア', 'フォトンボム', 'スーパーフォトン'],
      all: ['ふゆのひざし', 'まなつのたいよう', 'せきどうちょっか', 'たいようふう', 'コロナ'],
    },
    dark: {
      single: ['おどかす', 'やみうち', 'やみのつかい', 'やみのしはいしゃ', 'やみのおう', 'やみのこうてい'],
      three: ['ダークボール', 'くろいうず', 'ブラックホール', 'デッドフォール', 'ワームホール'],
      all: ['くろいきり', 'たちこめるやみ', 'ならくのそこ', 'あんこくのきり', 'あんこくのそこ'],
    },
  };
  // 段階: 1体は 4段階、3体・全体は 3段階。上の名前の表から この番目を使う (3体・全体は 1・3・5番目)
  const KEEP = { single: [0, 2, 3, 5], three: [0, 2, 4], all: [0, 2, 4] };
  for (const e in ELEM_ATTACKS) for (const a in KEEP) ELEM_ATTACKS[e][a] = KEEP[a].map((i) => ELEM_ATTACKS[e][a][i]);
  // 範囲ごとの 威力・MP・希少度・出やすさ・アイコンの派手さ (段階が上がるほどレア)
  //   MP: いちばん下は 何度も打てる / まんなかは まあまあ打てる / いちばん上は 数回 打てる
  const AREA = {
    single: { tgt: 'foe',  power: [0.63, 1.16, 1.47, 3.0], mp: [3, 5, 7, 10], rarity: [1, 3, 5, 9], w: [54, 29, 12, 5], grade: [0, 2, 3, 5], chance: 0.2 },
    three:  { tgt: 'foe',  power: [0.49, 0.88, 2.5],     mp: [3, 6, 10],    rarity: [2, 5, 9],    w: [56, 34, 10],    grade: [0, 2, 4],    chance: 0.15 },
    all:    { tgt: 'foes', power: [0.39, 0.7, 1.12],     mp: [4, 7, 11],    rarity: [3, 6, 10],   w: [56, 34, 10],    grade: [1, 3, 5],    chance: 0.12 },
  };
  const POWER_WORDS = {
    single: ['小さい', '強力', '超強力', '計り知れない'],
    three: ['小さい', '強力', '超強力'],
    all: ['小さい', '強力', '最大'],
  };
  // 以前の段階 (1体 6段階・3体と全体 5段階) の番号を 今の段階へ (古いセーブの 出生の子 用)
  NS.OLD_TIER = { single: [0, 0, 1, 2, 2, 3], three: [0, 0, 1, 1, 2], all: [0, 0, 1, 1, 2] };
  NS.AREA_LABEL = { single: '1体', three: '3体', all: '全体' };
  NS.SKILL_AREA = AREA; NS.POWER_WORDS = POWER_WORDS; // ルールブック 用

  // grade (0〜5) = 技の強さ。高いほど アンテナのアイコンが大きく 派手になる
  function elemAttack(elem, area, tier) {
    const A = AREA[area];
    return {
      key: `atk_${elem}_${area}_${tier}`, name: ELEM_ATTACKS[elem][area][tier], kind: 'attack', elem, area, tier,
      power: A.power[tier], powerWord: POWER_WORDS[area][tier], mp: A.mp[tier], tgt: A.tgt,
      chance: A.chance, rarity: A.rarity[tier], icon: elem, grade: A.grade[tier],
    };
  }
  NS.makeElemAttack = function (rng, elem) {
    const r = rng.next();
    const area = r < 0.55 ? 'single' : r < 0.82 ? 'three' : 'all';
    const A = AREA[area];
    const tier = rng.weighted(A.w.map((w, i) => i), (i) => A.w[i]);
    return elemAttack(elem, area, tier);
  };

  const pickHealTier = (rng) => { const r = rng.next(); return r < 0.6 ? 0 : r < 0.9 ? 1 : 2; };
  const BUFF_NAMES = {
    atk: ['パワーアップ', 'みんなムキムキ'], def: ['ガードアップ', 'みんなガチガチ'],
    spd: ['スピードアップ', 'みんなかぜになれ'], eva: ['かわしやすい', 'みんなかわしやすい'],
  };
  // 敵全体の 能力を 1段 下げる (1段 −15% / 2段 −35% / 3段 −55% / 4段 −75% / 5段 −95%)。ボスには 効かない
  const DEBUFF_NAMES = { spd: 'みんなのろのろ', atk: 'みんなよわよわ', def: 'みんなやわやわ' };
  const debuff = (stat) => ({
    key: 'debuffall_' + stat, name: DEBUFF_NAMES[stat], kind: 'debuff', stat, stage: 1,
    mp: 10, tgt: 'foes', area: 'all', rarity: 3, icon: 'de_' + stat, grade: 2,
  });
  const STATUS_SKILLS = {
    sleep: ['ねむらせる', 'みんなねむらせる'], poison: ['どくどく', 'みんなどくどく'], paralyze: ['しびれさせる', 'みんなしびれさせる'],
    seal: ['アンテナ封じ', 'みんなアンテナ封じ'],
  };
  // アンテナ: ムキムキ = 力こぶの うで / ガチガチ = かたい ボール / かぜになれ = 白い かぜの うず / かわしやすい = よける 矢じるし
  const BUFF_ICON = { atk: 'b_arm', def: 'b_ball', spd: 'b_wind', eva: 'b_dodge' };
  const buff = (stat, all) => ({
    key: (all ? 'buffall_' : 'buff_') + stat, name: BUFF_NAMES[stat][all ? 1 : 0], kind: 'buff', stat, stage: 1,
    mp: all ? 10 : 4, tgt: all ? 'allies' : 'ally', area: all ? 'all' : 'single', rarity: all ? 2 : 1, icon: BUFF_ICON[stat], grade: all ? 1 : 0,
  });
  const status = (st, chance, mp, rarity, all) => ({
    key: (all ? 'stall_' : 'st_') + st, name: STATUS_SKILLS[st][all ? 1 : 0], kind: 'status', status: st, chance, mp,
    tgt: all ? 'foes' : 'foe', area: all ? 'all' : 'single', rarity, icon: st === 'paralyze' ? 'st_shock' : 'st_' + st, grade: all ? 3 : 1,
  });

  // 1体の かいふくは どれも かんぜんかいふく (HP を 全回復)。key は 以前の 3段階のまま (名前から決まる スキルを 変えないため)
  const heal = (t) => ({ key: 'heal' + t, name: 'かんぜんかいふく', kind: 'heal', full: true, power: 0, mp: 10, tgt: 'ally', area: 'single', rarity: 4, icon: 'heal', grade: 3 });

  // 攻撃以外のスキル (並び順と重みは 名前から決まるスキルに関わるので 変えないこと)
  NS.SUPPORT_POOL = [
    { w: 14, make: (r) => heal(pickHealTier(r)) },
    { w: 5, make: () => ({ key: 'healall', name: 'みんなかいふく', kind: 'heal', frac: 0.4, power: 0, mp: 11, tgt: 'allies', area: 'all', rarity: 4, icon: 'heal', grade: 2 }) },
    { w: 4, make: () => ({ key: 'revive', name: 'かんぜんふっかつ', kind: 'revive', power: 1, mp: 12, tgt: 'deadAlly', area: 'single', rarity: 4, icon: 'revive', grade: 2 }) },
    { w: 1.5, make: () => ({ key: 'reviveall', name: 'みんなふっかつ', kind: 'revive', power: 0.4, mp: 20, tgt: 'deadAllies', area: 'all', rarity: 6, icon: 'revive', grade: 4 }) },
    { w: 2, make: () => buff('atk', true) }, { w: 2, make: () => buff('def', true) },
    { w: 1.5, make: () => buff('spd', true) },
    { w: 4, make: () => status('sleep', 0.9, 4, 2) },
    { w: 4, make: () => status('poison', 1, 4, 1) },
    { w: 3, make: () => status('paralyze', 0.8, 4, 2) },
    { w: 1.5, make: () => status('sleep', 0.2, 9, 4, true) },
    { w: 1.5, make: () => status('poison', 0.5, 10, 3, true) },
    { w: 1.2, make: () => status('paralyze', 0.15, 9, 4, true) },
  ];

  // あとから 足したスキル (今までの個体の スキルが なるべく 変わらないよう、補助スキルを 引いたあとに もう1回 引いて 置きかえる)
  const EXTRA = {
    stall_seal: () => status('seal', 0.4, 9, 4, true),
    // 黒翼魔導団の スキル (名前からは 出ない): 敵全員の 耐性を 1 下げる (重ねて −3 まで。バトルの 間 ずっと)
    // ゴーヘブン: 属性耐性の 影響を 受けない 全体 光属性攻撃 (威力 1.5。黒翼魔導団の 奇術師トリックだけ。子へは 20% で 受けつぐ)
    goheaven: () => ({ key: 'goheaven', name: 'ゴーヘブン', kind: 'attack', elem: 'light', area: 'all', tier: 2, power: 1.5, powerWord: '天をも つらぬく', mp: 22, tgt: 'foes',
      rarity: 12, grade: 5, icon: 'img', img: 'img/goheaven.png', noRes: true, fx: 'heaven', inherit: 0.2 }),
    weaken_st: () => ({ key: 'weaken_st', name: 'みんなダルダル', kind: 'weaken', what: 'stres', mp: 10, tgt: 'foes', area: 'all', rarity: 5, icon: 'de_daru', grade: 3 }),
    weaken_res: () => ({ key: 'weaken_res', name: 'みんなたたり', kind: 'weaken', what: 'res', mp: 10, tgt: 'foes', area: 'all', rarity: 5, icon: 'de_tatari', grade: 3 }),
    buffall_eva: () => buff('eva', true), // みんなかわしやすい: 回避 +10% (重ねがけ できる)
    // みんなたくわえる: 味方 1体ごとに 30% で 次の 攻撃 ×2 (重ねて ×4・×8。1回 攻撃すると もどる)
    chargeall: () => ({ key: 'chargeall', name: 'みんなたくわえる', kind: 'charge', chance: 0.3, mp: 8, tgt: 'allies', area: 'all', rarity: 4, icon: 'b_bell', grade: 3 }), // アンテナ: 黒い ダンベル
    // たくわえる: 味方 1体が かならず たくわえる
    charge1: () => ({ key: 'charge1', name: 'たくわえる', kind: 'charge', chance: 1, mp: 5, tgt: 'ally', area: 'single', rarity: 3, icon: 'b_barbell', grade: 1 }), // アンテナ: 黒い バーベル
    cureall: () => ({ key: 'cureall', name: 'みんななおす', kind: 'cure', mp: 8, tgt: 'allies', area: 'all', rarity: 3, icon: 'cure', grade: 2 }),
    debuffall_spd: () => debuff('spd'), // みんなのろのろ: 敵全体の 素早さ ダウン
    debuffall_atk: () => debuff('atk'), // みんなよわよわ: 敵全体の 攻撃 ダウン
    debuffall_def: () => debuff('def'), // みんなやわやわ: 敵全体の 防御 ダウン
  };

  // スキルの key から 同じスキルを作る (例: 'atk_fire_all_4' / 'heal2' / 'reviveall')
  NS.skillByKey = function (key) {
    if (EXTRA[key]) return EXTRA[key]();
    const m = /^atk_(\w+)_(single|three|all)_(\d)$/.exec(key);
    if (m) return elemAttack(m[1], m[2], +m[3]);
    if (/^heal\d$/.test(key)) return heal(+key.slice(4));
    for (const s of NS.SUPPORT_POOL) {
      const sk = s.make({ next: () => 0 });
      if (sk.key === key) return sk;
    }
    throw new Error('unknown skill: ' + key);
  };

  // 1体につき1つ。58% が属性攻撃 (多くは体の色の属性)、残りが補助
  NS.makeSkill = function (rng, colorElem) {
    if (rng.next() < 0.58) {
      const elem = colorElem && rng.next() < 0.85 ? colorElem : rng.pick(NS.ELEM_KEYS);
      return NS.makeElemAttack(rng, elem);
    }
    const sk = rng.weighted(NS.SUPPORT_POOL, (s) => s.w).make(rng);
    const r = rng.next();
    if (r < 0.035) return EXTRA.stall_seal();
    if (r < 0.085) return EXTRA.cureall();
    if (r < 0.12) return EXTRA.buffall_eva();
    if (r < 0.15) return EXTRA.chargeall();
    if (r < 0.19) return EXTRA.charge1();
    if (r < 0.21) return EXTRA.debuffall_spd();
    if (r < 0.23) return EXTRA.debuffall_atk();
    if (r < 0.25) return EXTRA.debuffall_def();
    return sk;
  };

  NS.skillDesc = function (sk) {
    const E = sk.elem ? NS.ELEMENTS[sk.elem].name + '属性' : '';
    const tgt = sk.area === 'three' ? '敵3体' : { foe: '敵1体', foes: '敵全体', ally: '味方1体', allies: '味方全体', deadAlly: 'たおれた味方1体', deadAllies: 'たおれた味方 全員' }[sk.tgt];
    switch (sk.kind) {
      case 'attack': return `${tgt}に ${E}の攻撃。威力は${sk.powerWord}${sk.noRes ? '。属性耐性の 影響を 受けない' : ''}`;
      case 'heal': return sk.full ? `${tgt}の HPを 全回復` : sk.frac ? `${tgt}の HPを 最大HPの ${Math.round(sk.frac * 100)}% 回復` : `${tgt}の HPを 回復 (${sk.power})`;
      case 'revive': return sk.power >= 1 ? `${tgt}を HP 全回復で 復活` : `${tgt}を HP${Math.round(sk.power * 100)}%で 復活`;
      case 'buff': return sk.stat === 'eva' ? `${tgt}の 回避を 10% 上げる (重ねがけ できる・5段まで)` : `${tgt}の ${NS.STAT_LABELS[sk.stat]}を 上げる`;
      case 'status': return `${tgt}を ${Math.round(sk.chance * 100)}%で ${NS.STATUS[sk.status].name}に する (${sk.status === 'poison' ? 'たおれるまで 毎ターン 最大HPの20% ダメージ' : sk.status === 'seal' ? '1ターンの間 スキルが 使えない' : '1〜2ターン 動けない' + (sk.status === 'sleep' ? '。攻撃されると 目をさます' : '')})`;
      case 'cure': return `${tgt}の 状態異常を すべて なおす`;
      case 'weaken': return `${tgt}の ${sk.what === 'res' ? '全属性耐性' : '全状態異常耐性'}を 1 下げる (重ねて −3 まで。バトルの 間 ずっと)`;
      case 'debuff': return `${tgt}の ${NS.STAT_LABELS[sk.stat]}を 1段 下げる (1段 −15%・2段 −35%・3段 −55%・4段 −75%・5段 −95%。4ターン。ボスには 効かない)`;
      case 'charge': return sk.tgt === 'ally' ? `${tgt}が かならず ちからを たくわえる (次の 通常攻撃 ×2。重ねて ×4・×8。1回 通常攻撃すると もどる)` : `${tgt}が 1体ごとに ${Math.round(sk.chance * 100)}%で ちからを たくわえる (次の 通常攻撃 ×2。重ねて ×4・×8。1回 通常攻撃すると もどる)`;
    }
    return '';
  };

  // ---- 装備 (部位ごとに 1つ: body = 服 / back = せなか) ----
  //   allRes = 全属性耐性 / stRes = 全状態異常耐性 / stresAdd = 状態異常ごとの 耐性 / atk = 攻撃に 足す / crit = 会心率に 足す / multi = 打撃 (通常攻撃) の 相手の 数 (威力は そのまま)
  NS.EQUIP_SLOTS = { body: '服', back: 'せなか', face: '顔', head: 'あたま' };
  NS.EQUIPS = {
    jewel: { slot: 'body', name: 'ジュエルスーツ', icon: '👕', allRes: 1, stRes: 1, desc: '全属性耐性 +1 ・ 全状態異常耐性 +1', from: 'ウルフベアを はじめて たおすと 手に入る' },
    hakai: { slot: 'back', name: 'はかいりゅうのはね', icon: '🦇', multi: 5, desc: '打撃 (通常攻撃) が 5体攻撃に なる (威力は そのまま)', from: 'はかいりゅうに はじめて 勝つと 手に入る' },
    // 顔に つける しなこ (img = 絵の ファイル。stresAdd = 状態異常ごとの 耐性)
    shinako: { slot: 'face', name: 'しなこ', icon: '😉', img: 'img/shinako_face.png', stresAdd: { charm: 3 }, desc: 'みりょう耐性 +3', from: 'イベントクエスト: しなこに はじめて 勝つと 手に入る' },
    tate: { slot: 'back', name: 'たて', icon: '🛡️', cover: 0.3, desc: '味方への 攻撃を 30%で かばう (キャッスルの頭と 足し算: 両方で 60%)', from: 'シールドナイトに はじめて 勝つと かならず。2回目からは 10%' },
    axe: { slot: 'back', name: 'オノ', icon: '🪓', crit: 0.05, desc: '会心率 +5%', from: 'きこりおにに はじめて 勝つと かならず。2回目からは 10%' },
    // twice = スキルを 2回 連続で 使う (2回とも MP を 使う。2回目の MP が たりなければ 1回)
    bell: { slot: 'back', name: 'おおきなかね', icon: '🔔', twice: true, desc: 'スキルを 2回 連続で 使う (2回とも MP を 使う)', from: '実績報酬: 名声 30000' },
    // にゅうしタイツ: 黒翼魔導団の 団員が 着ている (手に入らない)
    nyushi: { slot: 'body', name: 'にゅうしタイツ', icon: '👕', allRes: 2, desc: '全属性耐性 +2', from: '黒翼魔導団の 団員が 着ている (手に入らない)' },
    // mpRegen = 毎ターンの おわりに MP が 回復する
    majorobe: { slot: 'body', name: 'まじょのローブ', icon: '🧥', mpRegen: 5, desc: '毎ターン MP 5 かいふく', from: '実績報酬: 名声 20000' },
    // elemMul = 属性スキルの ダメージの 倍率
    // mpSave = スキルの MP を この 割合 節約 (四捨五入。MP 9 → 6) / mpAdd = 最大MP を ふやす (スキルを 持つ なかまだけ)
    majohat: { slot: 'head', name: 'まじょのぼうし', icon: '🧙', mpSave: 0.3, desc: 'スキルの MP を 30% 節約 (MP 9 → 6)', from: '実績報酬: 名声 40000' },
    majostaff: { slot: 'back', name: 'まじょのつえ', icon: '🪄', mpAdd: 15, desc: '最大MP +15', from: '実績報酬: 名声 60000' },
    maoucrown: { slot: 'head', name: 'まおうのかんむり', icon: '👑', elemMul: 1.5, desc: '属性スキルの ダメージ ×1.5', from: 'まおうに はじめて 勝つと かならず。2回目からは 10%' },
  };
  // 装備の 書き方 (文字 / 配列 / {部位: key}) を key の 配列に
  NS.equipKeys = (e) => (!e ? [] : typeof e === 'string' ? [e] : Array.isArray(e) ? e : Object.values(e)).filter((k) => NS.EQUIPS[k]);
  // 装備した 個体 (もとの 個体は そのまま。耐性などを 足した 写しを 作る)。c.equips = {部位: key}
  NS.withEquip = function (c, e) {
    const keys = NS.equipKeys(e);
    if (!keys.length) return c;
    const equips = Object.assign({}, c.equips || {});
    let allRes = 0, stRes = 0, crit = 0, elemMul = 1, mpBonus = 0;
    const stAdd = {};
    const stats = Object.assign({}, c.stats);
    for (const k of keys) { const E = NS.EQUIPS[k]; equips[E.slot] = k; allRes += E.allRes || 0; stRes += E.stRes || 0; crit += E.crit || 0; for (const s in E.stresAdd || {}) stAdd[s] = (stAdd[s] || 0) + E.stresAdd[s]; if (E.atk) stats.atk += E.atk; if (E.elemMul) elemMul *= E.elemMul; if (E.mpAdd && c.skill) { stats.mp += E.mpAdd; mpBonus += E.mpAdd; } }
    const res = {};
    for (const k of NS.ELEM_KEYS) { const v = (c.res[k] || 0) + allRes; if (v) res[k] = v; }
    const stres = {};
    for (const k of Object.keys(NS.STATUS)) { const v = ((c.stres && c.stres[k]) || 0) + stRes + (stAdd[k] || 0); if (v) stres[k] = v; }
    return Object.assign({}, c, { res, stres, equips, stats }, crit ? { critUp: (c.critUp || 0) + crit } : {}, elemMul !== 1 ? { elemMul: (c.elemMul || 1) * elemMul } : {}, mpBonus ? { mpBonus: (c.mpBonus || 0) + mpBonus } : {});
  };
  // スキルの MP (まじょのぼうし: 30% 節約・四捨五入。最大MP で 足りない ぶんは 使う ほうで 見る)
  NS.mpCost = (c, sk) => { const save = NS.equipKeys(c.equips).reduce((s, k) => s + (NS.EQUIPS[k].mpSave || 0), 0); return save ? Math.max(1, Math.round(sk.mp * (1 - save))) : sk.mp; };
  // かいふくの 強さに 使う MP (まじょのつえで ふえた ぶんは 入れない)
  NS.healMp = (c) => c.stats.mp - (c.mpBonus || 0);
  // たて の かばう 確率 (0〜1)
  NS.equipCover = (c) => Math.max(0, ...NS.equipKeys(c.equips).map((k) => NS.EQUIPS[k].cover || 0));
  // 打撃の 相手の 数 (はかいおうのはね なら 5)
  NS.mpRegen = (c) => NS.equipKeys(c.equips).reduce((s, k) => s + (NS.EQUIPS[k].mpRegen || 0), 0);
  NS.skillTwice = (c) => NS.equipKeys(c.equips).some((k) => NS.EQUIPS[k].twice);
  NS.strikeCount = (c) => Math.max(1, ...NS.equipKeys(c.equips).map((k) => NS.EQUIPS[k].multi || 1));

  // ---- コロシアム ----
  NS.CUPS = [
    { id: 'rookie',   name: 'ルーキー杯',   n: 3, ranks: ['D', 'C'],        fame: 10,  desc: 'はじめての コロシアム' },
    { id: 'bronze',   name: 'ブロンズ杯',   n: 4, ranks: ['C', 'B'],        fame: 20,  desc: '名前の 力が ためされる' },
    { id: 'silver',   name: 'シルバー杯',   n: 5, ranks: ['B', 'A'],        fame: 40,  desc: '属性相性を 見きわめよう' },
    { id: 'gold',     name: 'ゴールド杯',   n: 6, ranks: ['A', 'S'],        fame: 80,  desc: '強い名前だけが 生き残る' },
    { id: 'platinum', name: 'プラチナ杯',   n: 7, ranks: ['S', 'SS'],       fame: 150, desc: '選ばれし 名の 祭典' },
    { id: 'namesis',  name: 'NAMESIS杯',    n: 8, ranks: ['SS', 'NAMESIS'], fame: 300, desc: '名の 起源に 挑め' },
    { id: 'neo',      name: 'NEO-NAMESIS杯', n: 8, ranks: ['NAMESIS'], fame: 400, medal: '💠', desc: 'NAMESIS ランクだけが 集う 頂上の 大会' },
    // 上級者向け: 名のある軍団 (固定パーティ)。仮の名前ではなく 本当の名前で戦う。スカウトはできない
    { id: 'kingflame', name: '紅蓮騎士団', boss: 'kingflame', n: 6, fame: 500, medal: '🔥', adv: true,
      desc: 'キングフレイム卿 ひきいる 赤い軍団。全体を焼く 火の技と、みんなかいふく・みんなふっかつで 立ちはだかる' },
    { id: 'yoiyami', name: '宵闇サーカス団', boss: 'yoiyami', n: 8, fame: 800, medal: '🎪', adv: true,
      desc: '団長ナイトメア ひきいる 8人の 夜の一座。ねむり・まひ・どく・アンテナ封じ・みりょうで 動きを うばってくる' },
    { id: 'army', name: '鋼鉄師団', boss: 'army', n: 8, fame: 1200, medal: '🎖️', adv: true,
      desc: '元帥ジェネラル ひきいる 最強の 軍隊。全員 名力 1000 以上。最速の みんなムキムキと みんなたくわえる で 打撃を 何倍にも して なぐりこんでくる' },
    { id: 'kokuyoku', name: '黒翼魔導団', boss: 'kokuyoku', n: 8, fame: 1600, medal: '🎩', adv: true,
      desc: '魔導卿ファントム ひきいる 夜の 魔導団。みんなたたり・みんなダルダルで 耐性を けずり、まおうのかんむりと おおきなかねの 全体 属性技と、会心の はねで 追いこんでくる' },
  ];

  // ---- 出生 (精霊の祠) の ふしぎな組み合わせ ----
  // 頭: この2つを かけあわせると 必ず進化する
  NS.HEAD_RECIPES = [
    { a: 'spiky', b: 'spiky', to: 'sun', known: true }, // トゲトゲ × トゲトゲ → たいよう (言い伝えとして はじめから わかる)
    { a: 'sun', b: 'moon', to: 'saturn', chance: 0.25 }, // たいよう × みかづき → 25% で どせい
    { a: 'star', b: 'sun', to: 'meteor', chance: 0.25 }, // ほし × たいよう → 25% で りゅうせい
    // トゲトゲ × まる・たまご・もち・おにぎり → デビル (祠の一覧では 1行に まとめる)
    { a: 'spiky', b: 'round', to: 'devil', chance: 0.5, label: 'トゲトゲ × まる・たまご・もち・おにぎり' },
    { a: 'spiky', b: 'egg', to: 'devil', chance: 0.5, hide: true },
    { a: 'spiky', b: 'mochi', to: 'devil', chance: 0.5, hide: true },
    { a: 'spiky', b: 'onigiri', to: 'devil', chance: 0.5, hide: true },
    { a: 'moon', b: 'moon', to: 'star' },    // みかづき × みかづき → ほし
    { a: 'box', b: 'box', to: 'block' },
    { a: 'block', b: 'block', to: 'castle', chance: 0.5 }, // ブロック × ブロック → 1/2 で キャッスル     // しかく × しかく → ブロック
    { a: 'onigiri', b: 'box', to: 'hex' },   // おにぎり × しかく → ろっかく
    { a: 'cat', b: 'bear', to: 'bunny' },    // ねこ × くま → うさみみ
  ];
  NS.COLOR_RECIPES = []; // 色は どちらかの 親の色 (まざらない)

  // ---- 名のある軍団 (固定パーティの敵) ----
  // 名前から生まれる個体ではなく、色・頭・体型・背 (回避)・スキル・能力を 決めてある。全員 名力 700 以上
  //   eva = 背の高さ (0 とても高い / 5 高い / 10 ふつう / 15 低い / 30 とても低い)。頭の回避ボーナスは あとで足す
  //   stats = 最終的な能力 (頭の効果も こみ)。look = 顔などの上書き
  NS.BOSS_PARTIES = {
    // 黒翼魔導団: 鋼鉄師団と 同じ つくり (格 1.30・遺伝子 + ランダムな ★)。シルクハット・おだんご・はね の 頭と、耐性を 下げる スキル
    kokuyoku: {
      color: 'black', aura: true, pot: 1.3,
      intro: '魔導卿ファントム ひきいる 黒翼魔導団が 夜の とばりを おろした!',
      members: [
        { name: '魔導卿ファントム', leader: true, head: 'silkhat', body: 'normal', eva: 5, skill: 'weaken_res', equip: 'nyushi',
          genes: { hp: 0.4, mp: 0.4, atk: 0.3, def: 0.4, spd: 0.3 },
          look: { eyeType: 13, eyeScale: 1.3, brow: null, hair: 'side', hairColor: '#8a5a2a', mouth: 1, pattern: null, acc: null, blush: 'round' } },
        { name: '奇術師トリック', color: 'purple', head: 'silkhat', body: 'slim', eva: 15, skill: 'goheaven', equip: ['majorobe', 'maoucrown', 'bell'],
          genes: { hp: 0.15, mp: 1.0, atk: 0.2, def: 0.15, spd: 0.3 },
          look: { eyeType: 5, eyeScale: 1, brow: 'thin', hair: 'part', hairColor: '#e8e0f0', pattern: null, acc: 'glasses' } },
        { name: '踊り子マリオネット', color: 'pink', head: 'odango', body: 'slim', eva: 15, skill: 'weaken_st', equip: 'nyushi',
          genes: { hp: 0.15, mp: 0.3, atk: 0.15, def: 0.15, spd: 0.32 },
          look: { eyeType: 11, eyeScale: 1.3, brow: null, hair: 'bob', hairColor: '#c8462a', blush: 'oval', pattern: null, acc: 'ribbon', accHue: 330 } },
        { name: '歌姫セイレーン', color: 'blue', head: 'odango', body: 'normal', eva: 10, skill: 'atk_water_all_2', equip: ['nyushi', 'maoucrown', 'bell'],
          genes: { hp: 0.2, mp: 0.3, atk: 0.15, def: 0.2, spd: 0.28 },
          look: { eyeType: 8, eyeScale: 1.3, brow: null, hair: 'bangs', hairColor: '#3a6ac8', blush: 'round', pattern: null, acc: null } },
        { name: '人形師ドール', color: 'white', head: 'odango', body: 'fat', eva: 5, skill: 'reviveall', equip: 'nyushi',
          genes: { hp: 0.3, mp: 0.4, atk: 0.12, def: 0.3, spd: 0.15 },
          look: { eyeType: 12, eyeScale: 1, brow: 'maro', hair: 'bangs', hairColor: '#f0d070', pattern: null, acc: null, blush: 'round' } },
        { name: '黒翼レイヴン', head: 'wings', body: 'normal', eva: 10, skill: null, equip: 'nyushi',
          genes: { hp: 0.5, mp: 0.4, atk: 0.75, def: 0.45, spd: 0.5 },
          look: { eyeType: 13, eyeScale: 1.3, brow: null, hair: 'spiky', hairColor: '#8a4fd8', pattern: null, acc: null, blush: 'round' } },
        { name: '黒翼クロウ', head: 'wings', body: 'slim', eva: 15, skill: null, equip: 'nyushi',
          genes: { hp: 0.45, mp: 0.4, atk: 0.75, def: 0.4, spd: 0.6 },
          look: { eyeType: 5, eyeScale: 1, brow: 'thin', hair: 'side', hairColor: '#2a1c16', pattern: null, acc: null } },
        { name: '氷魔ブリザード', color: 'aqua', head: 'wings', body: 'slim', eva: 30, skill: 'atk_ice_all_2', equip: ['nyushi', 'maoucrown', 'bell'],
          genes: { hp: 0.12, mp: 0.3, atk: 0.2, def: 0.12, spd: 0.26 },
          look: { eyeType: 9, eyeScale: 1, brow: 'thin', hair: 'bob', hairColor: '#e8f4ff', pattern: null, acc: 'scarf', accHue: 200 } },
      ],
    },
    // 鋼鉄師団: 全員 名力 1000 以上の 軍隊 (緑)。最速の 鼓舞兵が みんなムキムキ、伝令兵が みんなたくわえる、スキルなしの 突撃兵が なぐる
    army: {
      color: 'green', aura: true, pot: 1.3, // 全員 オーラ・格 1.30
      intro: '元帥ジェネラル ひきいる 鋼鉄師団が 進軍してきた!',
      members: [
        { name: '元帥ジェネラル', leader: true, color: 'gold', head: 'meteor', body: 'fat', eva: 0, skill: 'reviveall', equip: 'jewel',
          genes: { hp: 0.4, mp: 0.4, atk: 0.25, def: 0.4, spd: 0.25 },
          look: { eyeType: 9, eyeScale: 1, brow: 'thick', hair: 'part', hairColor: '#e8e8e8', mouth: 1, mouthScale: 1.2, pattern: null, acc: 'scarf', accHue: 0 } },
        { name: '鼓舞兵ドラマー', color: 'orange', head: 'flame', body: 'slim', eva: 15, skill: 'buffall_atk',
          genes: { hp: 0.15, mp: 0.21, atk: 0.15, def: 0.15, spd: 0.3 },
          look: { eyeType: 11, eyeScale: 1.3, brow: 'thin', hair: 'bob', hairColor: '#3a2a1a', pattern: null, acc: 'ribbon', accHue: 20 } },
        { name: '伝令兵ラビット', head: 'bunny', body: 'slim', eva: 15, skill: 'chargeall',
          genes: { hp: 0.15, mp: 0.21, atk: 0.18, def: 0.15, spd: 0.28 },
          look: { eyeType: 8, eyeScale: 1.3, brow: null, hair: 'bangs', hairColor: '#f0d070', pattern: null, acc: null, blush: 'round' } },
        { name: '突撃兵ブレイカー', equip: 'hakai', head: 'block', body: 'fat', eva: 5, skill: null,
          genes: { hp: 0.63, mp: 0.47, atk: 0.79, def: 0.55, spd: 0.4 },
          look: { eyeType: 1, eyeScale: 1.3, brow: 'thick', hair: null, mouthScale: 1.35, pattern: null, acc: null } },
        { name: '突撃兵ランサー', equip: 'hakai', head: 'spiky', body: 'normal', eva: 10, skill: null,
          genes: { hp: 0.47, mp: 0.4, atk: 0.67, def: 0.4, spd: 0.47 },
          look: { eyeType: 5, eyeScale: 1, brow: 'thin', hair: 'spiky', hairColor: '#2a1c16', pattern: null, acc: null } },
        { name: '突撃兵グリズリー', equip: 'hakai', color: 'black', head: 'bear', body: 'fat', eva: 5, skill: null,
          genes: { hp: 0.63, mp: 0.47, atk: 0.79, def: 0.55, spd: 0.43 },
          look: { eyeType: 6, eyeScale: 1, brow: 'maro', hair: null, pattern: null, acc: null } },
        { name: '重装兵フォートレス', color: 'silver', head: 'castle', body: 'fat', eva: 0, skill: 'cureall',
          genes: { hp: 0.27, mp: 0.18, atk: 0.12, def: 0.3, spd: 0.09 },
          look: { eyeType: 12, eyeScale: 1, brow: 'thick', hair: null, pattern: null, acc: null } },
        { name: '狙撃兵スナイパー', color: 'yellow', head: 'moon', body: 'slim', eva: 30, skill: 'atk_thunder_single_3',
          genes: { hp: 0.12, mp: 0.27, atk: 0.21, def: 0.12, spd: 0.24 },
          look: { eyeType: 5, eyeScale: 1, brow: 'thin', hair: 'side', hairColor: '#4a3a2a', pattern: null, acc: 'glasses' } },
      ],
    },
    // 宵闇サーカス団: 状態異常と みりょうで 動きを うばう 8人の 一座 (紫・桃・黒)
    yoiyami: {
      color: 'purple', aura: true, // 全員 オーラ
      intro: '団長ナイトメア ひきいる 宵闇サーカス団の 開演だ!',
      members: [
        { name: '団長ナイトメア', leader: true, head: 'saturn', body: 'fat', eva: 0, skill: 'stall_seal',
          stats: { hp: 526, mp: 34, atk: 96, def: 105, spd: 67 },
          look: { eyeType: 12, eyeScale: 1, brow: 'thick', hair: 'part', hairColor: '#2a1c3a', mouth: 1, mouthScale: 1.3, pattern: null, acc: 'scarf', accHue: 280 } },
        { name: '魔術師ルナティック', head: 'moon', body: 'slim', eva: 10, skill: 'atk_dark_all_2',
          stats: { hp: 336, mp: 34, atk: 108, def: 67, spd: 103 },
          look: { eyeType: 5, eyeScale: 1, brow: 'thin', hair: 'side', hairColor: '#e8e0f0', pattern: null, acc: 'glasses' } },
        { name: '踊り子ミラージュ', color: 'pink', head: 'heart', body: 'slim', eva: 15, skill: 'stall_sleep',
          stats: { hp: 314, mp: 40, atk: 78, def: 67, spd: 116 },
          look: { eyeType: 11, eyeScale: 1.3, brow: null, hair: 'bob', hairColor: '#ff7ab0', blush: 'oval', pattern: null, acc: 'ribbon', accHue: 330 } },
        { name: '道化師ジェスター', color: 'black', head: 'devil', body: 'normal', eva: 15, skill: 'stall_paralyze',
          stats: { hp: 370, mp: 38, atk: 90, def: 78, spd: 101 },
          look: { eyeType: 9, eyeScale: 1.3, brow: 'maro', hair: null, mouthScale: 1.35, pattern: null, acc: null, blush: 'round' } },
        { name: '毒蛇使いヴェノム', head: 'devil', body: 'normal', eva: 10, skill: 'stall_poison',
          stats: { hp: 381, mp: 38, atk: 92, def: 81, spd: 94 },
          look: { eyeType: 6, eyeScale: 1, brow: 'thin', hair: 'bangs', hairColor: '#3a8a4a', pattern: null, acc: null } },
        { name: '猛獣使いビースト', color: 'black', head: 'bunny', body: 'fat', eva: 5, skill: 'atk_dark_three_2',
          stats: { hp: 482, mp: 30, atk: 101, def: 94, spd: 74 },
          look: { eyeType: 1, eyeScale: 1.3, brow: 'thick', hair: 'spiky', hairColor: '#4a2a1a', pattern: null, acc: null } },
        { name: '綱渡りシャドウ', color: 'black', head: 'cat', body: 'slim', eva: 30, skill: 'buffall_spd',
          stats: { hp: 347, mp: 34, atk: 103, def: 72, spd: 132 },
          look: { eyeType: 8, eyeScale: 1, brow: null, hair: null, pattern: null, acc: 'tuft' } },
        { name: '看板娘ピエレッタ', color: 'pink', head: 'heart', body: 'normal', eva: 15, skill: 'revive',
          stats: { hp: 336, mp: 48, atk: 76, def: 72, spd: 103 },
          look: { eyeType: 13, eyeScale: 1.3, brow: null, hair: 'bangs', hairColor: '#f0d070', blush: 'round', pattern: null, acc: 'ribbon', accHue: 200 } },
      ],
    },
    kingflame: {
      color: 'red', aura: true, // 全員 オーラ
      intro: 'キングフレイム卿 ひきいる 紅蓮騎士団が あらわれた!',
      members: [
        { name: 'キングフレイム卿', leader: true, head: 'sun', body: 'fat', eva: 0, skill: 'atk_fire_all_2',
          stats: { hp: 538, mp: 26, atk: 103, def: 108, spd: 65 },
          look: { eyeType: 9, eyeScale: 1, brow: 'thick', hair: 'spiky', hairColor: '#c8462a', mouth: 1, mouthScale: 1.35, pattern: null, acc: null, blush: null } },
        { name: 'クイーンブレイズ', head: 'heart', body: 'slim', eva: 10, skill: 'atk_fire_three_2',
          stats: { hp: 358, mp: 30, atk: 85, def: 74, spd: 101 },
          look: { eyeType: 11, eyeScale: 1.3, brow: 'thin', hair: 'bob', hairColor: '#c8462a', blush: 'oval', pattern: 'dots', acc: null } },
        { name: 'バーニング伯爵', head: 'flame', body: 'normal', eva: 5, skill: 'atk_fire_all_1',
          stats: { hp: 403, mp: 24, atk: 94, def: 90, spd: 92 },
          look: { eyeType: 5, eyeScale: 1, brow: 'thin', hair: 'part', hairColor: '#2a1c16', pattern: null, acc: 'glasses' } },
        { name: 'マグマ男爵', head: 'block', body: 'fat', eva: 5, skill: 'atk_fire_all_0',
          stats: { hp: 526, mp: 24, atk: 94, def: 110, spd: 58 },
          look: { eyeType: 1, eyeScale: 1.3, brow: 'maro', hair: null, mouthScale: 1.35, pattern: 'spots', acc: null } },
        { name: 'ヒノトリ司祭', head: 'moon', body: 'normal', eva: 15, skill: 'reviveall',
          stats: { hp: 319, mp: 50, atk: 76, def: 72, spd: 94 },
          look: { eyeType: 6, eyeScale: 1, brow: null, hair: 'side', hairColor: '#efc860', pattern: 'dots', acc: null, blush: 'round' } },
        { name: 'カガリビ侍女', head: 'bunny', body: 'slim', eva: 15, skill: 'healall',
          stats: { hp: 302, mp: 48, atk: 81, def: 65, spd: 112 },
          look: { eyeType: 8, eyeScale: 1.3, brow: null, hair: 'bangs', hairColor: '#5a3420', pattern: null, acc: 'ribbon', accHue: 45, blush: 'round' } },
      ],
    },
  };
})();
