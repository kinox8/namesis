// モンスターコロシアムの モンスター。名前から 生まれない 大きな敵 (1体で 1ターンに 何回も 動く)
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  const C = NS.col;

  // moves: kind = 動き (claw ひっかく・かみつく / dive とびかかる / breath はく / roar いかく / iceberg 氷山 / laser ビーム)
  //   area = 範囲、base = 防御 80 の相手への だいたいの ダメージ (0 = ダメージなし)
  //   w = 選ばれやすさ、evaMul = 回避の効き (1 = 通常攻撃と同じ)、elem / chance = 属性と その状態異常の 確率
  //   status / statusChance = かける 状態異常、hpAbove / hpBelow = HP の 割合で 使える わざ、minFoes = 相手が この数 以上で 使う (全体わざ: 3)
  //   hidden = コロシアムの 一覧で 能力や わざを 見せない / order = 一覧の 並び (小さいほど 左) / bgm = バトルの BGM
  //   event = イベントクエスト (コロシアムの いちばん上に 出る) / art・face = 絵の ファイル (全身・頭だけ)
  //   kind (つづき): heal 自分の HP を heal 回復 / curse 全員に 状態異常 / shot 光の 玉 / beam 光線 / wait なにも しない
  //   stRes = 状態異常耐性 (ボスは 全員 +4: かかる 確率 ×0.2)
  //   orb = たおすたびに 格の宝玉を 1こ 落とす (ウルフベアだけ)
  //   critRate = わざが 会心に なる 確率 (会心は 相手の 防御を 無視)。area: five = ねらった 相手と 近くの 4体
  //   kind (つづき): guardup 自分の 防御 +50% (1ターン) / bash 盾で なぎはらう / rush 突進
  //   kind (つづき): jagan 全員に 能力アップ無効 (3ターン。今の 能力アップも 消える) / repeat = 全体わざでも 1ターンに 何回も 使える
  //   opening = さいしょの 行動で 言う セリフ / phase2 = HP が 0 に なると セリフを 言って 第二形態に (stats・actions・moves を 入れかえ、HP 全回復)
  NS.MONSTERS = {
    wolfbear: {
      name: 'ウルフベア', medal: '🐺', order: 1, bgm: 'boss', fame: 600, height: 2.45, reward: 'jewel', orb: true, // はじめて たおすと ジュエルスーツ・たおすたびに 格の宝玉
      desc: '1ターンに 3回 動く 森の 暴れもの。ひっかく・ダイビング・アイスブレスを 使いわける。状態異常は あまり 効かない',
      intro: 'ウルフベアの 登場だ!',
      stats: { hp: 4000, mp: 0, atk: 150, def: 80, spd: 75, eva: 5 },
      res: { ice: 2, fire: -1 }, stRes: 4, actions: 3,
      moves: [
        { key: 'claw', name: 'ひっかく', kind: 'claw', area: 'single', base: 500, w: 4, evaMul: 1 },
        { key: 'dive', name: 'ダイビング', kind: 'dive', area: 'three', base: 500, w: 3, evaMul: 0.5 },
        { key: 'breath', name: 'アイスブレス', kind: 'breath', area: 'all', base: 300, w: 2, evaMul: 0.5, elem: 'ice', chance: 0.15 },
      ],
    },
    // きこりおに: 大きな オノを もつ 赤い おに。力を ためてから ふりおろす
    kikorioni: {
      name: 'きこりおに', medal: '🪓', order: 0, bgm: 'boss', fame: 300, height: 1.55, reward: 'axe', rewardRepeat: 0.1, // オノ: はじめて かならず・2回目から 10%
      desc: '森で 木を きる 赤い おに。大きな オノを ふりまわす',
      intro: 'きこりおにの 登場だ!',
      stats: { hp: 1000, mp: 0, atk: 120, def: 60, spd: 60, eva: 5 },
      res: { fire: 1, water: -1 }, stRes: 4, actions: 2, mainElem: 'earth',
      moves: [
        { key: 'chop', name: '斧を ふりかぶった', kind: 'claw', area: 'single', base: 200, w: 4, evaMul: 1 },
        { key: 'swing', name: '斧を ふりまわした', kind: 'swing', area: 'all', base: 100, w: 3, evaMul: 0.5, minFoes: 1 },
        { key: 'power', name: '力を ためている', kind: 'charge', area: 'self', base: 0, w: 2 }, // 次の 攻撃 ×2 (たくわえると 同じ)
      ],
    },
    // シールドナイト: 大きな 丸い 盾を 2枚 かまえた 騎士。攻撃の 半分が 会心 (防御を 無視)
    shieldknight: {
      name: 'シールドナイト', medal: '🛡️', order: 0.5, bgm: 'boss', fame: 450, height: 1.75, reward: 'tate', rewardRepeat: 0.1, // たて: はじめて かならず・2回目から 10%
      desc: '大きな 盾を 2枚 かまえた 騎士。盾で なぎはらい、突進してくる。攻撃の 半分が 会心',
      intro: 'シールドナイトの 登場だ!',
      stats: { hp: 2000, mp: 0, atk: 140, def: 90, spd: 150, eva: 5 },
      res: { thunder: -1 }, stRes: 4, actions: 3, mainElem: 'earth', critRate: 0.5,
      moves: [
        { key: 'fortify', name: 'まもりを かためている', kind: 'guardup', area: 'self', base: 0, w: 1 }, // 防御 +50% (1ターン)
        { key: 'bash', name: 'シールドばにっしゅ', kind: 'bash', area: 'three', base: 200, w: 4, evaMul: 1 },
        { key: 'rush', name: '突進', kind: 'rush', area: 'five', base: 150, w: 3, evaMul: 1 },
      ],
    },
    // はかいりゅう: 銀の よろいの 竜。HP が 半分を 切ると 氷山創造が レーザービームに かわる
    hakairyu: {
      name: 'はかいりゅう', medal: '🐉', order: 2, bgm: 'boss3', fame: 1500, height: 2.7, hidden: true, reward: 'hakai', // はじめて 勝つと はかいりゅうのはね
      desc: '銀の よろいに 身を つつんだ 伝説の 竜。その 力は 誰も 知らない',
      intro: 'はかいりゅうの 登場だ!',
      stats: { hp: 10000, mp: 0, atk: 220, def: 90, spd: 220, eva: 5 },
      res: { ice: 2, light: 1, fire: -1 }, stRes: 4, actions: 3, mainElem: 'light',
      moves: [
        { key: 'bite', name: 'かみつく', kind: 'claw', area: 'single', base: 700, w: 4, evaMul: 1 },
        { key: 'roar', name: 'いかく', kind: 'roar', area: 'all', base: 0, w: 2, status: 'fear', statusChance: 0.5, minFoes: 1 },
        { key: 'iceberg', name: '氷山創造', kind: 'iceberg', area: 'all', base: 400, w: 3, evaMul: 0.5, elem: 'ice', chance: 0.15, hpAbove: 0.5, minFoes: 1 },
        { key: 'laser', name: 'レーザービーム', kind: 'laser', area: 'all', base: 700, w: 3, evaMul: 0.5, elem: 'light', chance: 0.15, hpBelow: 0.5, minFoes: 1 },
      ],
    },
    // まおう: 闇の 王。HP が 0 に なると 第二形態に なる
    maou: {
      name: 'まおう', medal: '👑', order: 1.5, bgm: 'maou', fame: 2500, height: 2.9, hidden: true, reward: 'maoucrown', rewardRepeat: 0.1, // まおうのかんむり: はじめて かならず・2回目から 10%
      desc: '闇の 世界を すべる 王。その 力は 誰も 知らない',
      intro: 'まおうの 登場だ!',
      stats: { hp: 7000, mp: 0, atk: 200, def: 100, spd: 300, eva: 5 },
      res: { dark: 2, light: -1 }, stRes: 4, actions: 3, mainElem: 'dark', art: 'img/maou.png', face: 'img/maou_face.png',
      opening: 'ショータイムの はじまりだ!',
      moves: [
        { key: 'glare', name: 'にらみを 利かせた', kind: 'roar', area: 'all', base: 0, w: 2, status: 'fear', statusChance: 0.3, minFoes: 1 },
        { key: 'poison', name: 'ポイズンバブル', kind: 'curse', area: 'all', base: 0, w: 2, status: 'poison', statusChance: 0.5, minFoes: 1 },
        { key: 'sword', name: 'まおうけん', kind: 'claw', area: 'single', base: 500, w: 4, evaMul: 1 },
        { key: 'fire', name: 'ファイアブレス', kind: 'breath', area: 'all', base: 200, w: 3, evaMul: 0.5, elem: 'fire', chance: 0, minFoes: 1, repeat: true },
      ],
      phase2: {
        line: 'まだ 終わらんぞッ!',
        stats: { hp: 7000, spd: 1000 }, actions: 3,
        moves: [
          { key: 'jagan', name: '邪眼を 開いた', kind: 'jagan', area: 'all', base: 0, w: 3, status: 'nobuff', minFoes: 1 },
          { key: 'sword', name: 'まおうけん', kind: 'claw', area: 'single', base: 500, w: 4, evaMul: 1 },
          { key: 'dark', name: 'ダークブレス', kind: 'breath', area: 'all', base: 300, w: 3, evaMul: 0.5, elem: 'dark', chance: 0, minFoes: 1, repeat: true },
          { key: 'glare', name: 'にらみを 利かせた', kind: 'roar', area: 'all', base: 0, w: 2, status: 'fear', statusChance: 0.3, minFoes: 1 },
          { key: 'nightmare', name: 'ナイトメアバブル', kind: 'curse', area: 'all', base: 0, w: 2, status: 'sleep', statusChance: 0.3, minFoes: 1 },
        ],
      },
    },
    // じゃあくのまじょ: 地獄の 魔女。HP が 0 に なると じごくのじょおう (第二形態) → ファンファーレの あと アビス (最終形態) に なる
    //   mana = 魔力を ためている を この 回数 ためると 大技 (ult) を 1回 はなつ / manaLow = [HP の 割合, 回数]: HP が この 割合を 切ると この 回数で はなつ
    //   hitStatus / hitChance = 当たった 相手に かける 状態異常 / stage = バトルの 背景 (hell = 地獄)
    //   winBgm = 勝ったときの ファンファーレ / maxSpeed = バトルの 速さの 上限
    //   phase のなかの name・tag・art・face・height・res・stage = すがた・背景が かわる / dispelChance = 1体ごとに 打ち消す 確率 / fake = たおすと ファンファーレ → 杖で 暗闇 → 次の すがた (なかまは 全回復)
    //   kind (つづき): mana 魔力を ためる / wing はねの 攻撃 / ult 大技 / wave はどう (status を かける・dispel = 能力アップを 打ち消す)
    majo: {
      name: 'じゃあくのまじょ', medal: '🧙', order: 2.5, bgm: 'lastboss', winBgm: 'lastfanfare', maxSpeed: 2, fame: 6000, height: 2.9, hidden: true, stage: 'hell', mana: 5,
      desc: '地獄の 底から あらわれた 魔女。その 力は 誰も 知らない',
      intro: 'じゃあくのまじょの 登場だ!',
      stats: { hp: 10000, mp: 0, atk: 200, def: 100, spd: 1000, eva: 5 },
      res: { dark: 2, light: -1 }, stRes: 4, actions: 3, mainElem: 'dark', art: 'img/majo.png', face: 'img/majo_face.png',
      moves: [
        { key: 'mana', name: '魔力を ためている', kind: 'mana', area: 'self', base: 0, w: 3 },
        { key: 'claw', name: 'つめで あしらった', kind: 'claw', area: 'single', base: 200, w: 3, evaMul: 1, hitStatus: 'sleep', hitChance: 0.9 },
        { key: 'darkwing', name: 'ダークウィング', kind: 'wing', area: 'three', base: 200, w: 3, evaMul: 0.5, elem: 'dark', chance: 0.5 },
        { key: 'shuen', name: 'セカイノシュウエン', kind: 'ult', area: 'all', base: 400, ult: true, evaMul: 0, elem: 'dark', chance: 0 },
      ],
      phase2: {
        name: 'じごくのじょおう', tag: '第二形態', line: 'よくも… ほんとうの すがたを みせてあげる!', art: 'img/majo2.png', face: 'img/majo2_face.png', height: 3.0,
        stats: { hp: 15000 }, res: { dark: 2, fire: 2, light: -1 }, actions: 3,
        moves: [
          { key: 'jigoku', name: 'じごくのはどう', kind: 'wave', area: 'all', base: 0, w: 2, dispel: true, dispelChance: 0.5, minFoes: 1 },
          { key: 'mana', name: '魔力を ためている', kind: 'mana', area: 'self', base: 0, w: 3 },
          { key: 'claw', name: 'つめで あしらった', kind: 'claw', area: 'single', base: 300, w: 3, evaMul: 1, hitStatus: 'paralyze', hitChance: 0.9 },
          { key: 'firewing', name: 'ファイアウィング', kind: 'wing', area: 'three', base: 300, w: 2, evaMul: 0.5, elem: 'fire', chance: 0.5 },
          { key: 'hellwing', name: 'ヘルウィング', kind: 'wing', area: 'three', base: 300, w: 2, evaMul: 0.5, elem: 'dark', chance: 0.5 },
          { key: 'owari', name: 'セカイノオワリ', kind: 'ult', area: 'all', base: 500, ult: true, evaMul: 0, elem: 'fire', chance: 0 },
        ],
      },
      phase3: {
        name: 'アビス', tag: '最終形態', fake: true, stage: 'abyss', bgm: 'lastboss', art: 'img/abyss.png', face: 'img/abyss_face.png', height: 3.3, w: 3.4,
        aura: ['170,40,255', '70,0,110'], manaLow: [0.3, 2],
        stats: { hp: 20000 }, res: { dark: 2, fire: 2, light: -1 }, actions: 3,
        moves: [
          { key: 'mana', name: '魔力を ためている', kind: 'mana', area: 'self', base: 0, w: 3 },
          { key: 'seal', name: 'ふういんのはどう', kind: 'wave', area: 'all', base: 0, w: 2, status: 'seal', statusChance: 0.5, minFoes: 1 },
          { key: 'shinen', name: 'しんえんのはどう', kind: 'wave', area: 'all', base: 0, w: 2, dispel: true, minFoes: 1 },
          { key: 'hellfire', name: 'じごくのかえん', kind: 'breath', area: 'all', base: 300, w: 2, evaMul: 0.5, elem: 'fire', chance: 0, minFoes: 1 },
          { key: 'kirisaku', name: 'つめで きりさいた', kind: 'claw', area: 'single', base: 500, w: 3, evaMul: 1 },
          { key: 'judge', name: 'ラストジャッジメント', kind: 'ult', area: 'all', base: 700, ult: true, evaMul: 0, elem: 'dark', chance: 0, ultLine: 'タエヤガッタカ、キサマ...' },
        ],
      },
    },
    // きばこうもり: 幻帝のどうくつ だけに 出る 青い こうもり (dungeon = コロシアムには 出ない)
    kibakoumori: {
      name: 'きばこうもり', medal: '🦇', order: 99, dungeon: true, fame: 0, height: 1.35,
      desc: 'どうくつに すむ 青い こうもり。するどい きばで かみつく',
      intro: 'きばこうもりが あらわれた!',
      stats: { hp: 600, mp: 0, atk: 100, def: 50, spd: 110, eva: 12 },
      res: { wind: -1, dark: 1 }, stRes: 1, actions: 2, mainElem: 'dark',
      moves: [
        { key: 'bite', name: 'かみつく', kind: 'claw', area: 'single', base: 120, w: 4, evaMul: 1 },
        { key: 'tackle', name: 'たいあたり', kind: 'rush', area: 'single', base: 90, w: 2, evaMul: 1 },
        { key: 'sonic', name: 'ちょうおんぱ', kind: 'roar', area: 'all', base: 0, w: 1, status: 'fear', statusChance: 0.25, minFoes: 1 },
      ],
    },
    // ぶたばなうさぎ: 幻帝のどうくつ だけに 出る。ぶたの 鼻の ピンクの うさぎ。緑の 服・短剣・緑の まるい 盾
    butabanausagi: {
      name: 'ぶたばなうさぎ', medal: '🐷', order: 99, dungeon: true, fame: 0, height: 1.5,
      desc: 'どうくつを まもる ぶたばなの うさぎ。短剣で きりつけ、盾で なぐってくる',
      intro: 'ぶたばなうさぎが あらわれた!',
      stats: { hp: 720, mp: 0, atk: 105, def: 80, spd: 85, eva: 8 },
      res: { fire: -1, earth: 1 }, stRes: 1, actions: 2, mainElem: 'earth',
      moves: [
        { key: 'slash', name: 'きりつける', kind: 'claw', area: 'single', base: 125, w: 4, evaMul: 1 },
        { key: 'bash', name: 'シールドバッシュ', kind: 'rush', area: 'single', base: 95, w: 2, evaMul: 1 },
        { key: 'snort', name: 'ぶひっと はなを ならした', kind: 'roar', area: 'all', base: 0, w: 1, status: 'fear', statusChance: 0.2, minFoes: 1 },
      ],
    },
    // しなこ (イベントクエスト): 開発者の しなこが 参戦。絵は img/shinako.png
    shinako: {
      name: 'しなこ', medal: '💜', order: 3, event: true, bgm: 'shinako', fame: 1000, height: 2.5, hidden: true, reward: 'shinako', // はじめて 勝つと 顔装備「しなこ」
      desc: '開発者の しなこが 参戦! その 力は 誰も 知らない',
      intro: 'しなこの 登場だ!',
      stats: { hp: 5000, mp: 0, atk: 150, def: 70, spd: 150, eva: 5 },
      res: {}, stRes: 4, actions: 3, mainElem: 'light', art: 'img/shinako.png', face: 'img/shinako_face.png',
      moves: [
        { key: 'menkea', name: 'メンケアを している', kind: 'heal', area: 'self', heal: 300, w: 2, hpBelow: 0.95 }, // HP 300 回復
        { key: 'frenemy', name: 'フレネミー発動', kind: 'curse', area: 'all', base: 0, w: 2, status: 'poison', statusChance: 0.7, minFoes: 1 },
        { key: 'uhyo', name: 'うっひょー!', kind: 'shot', area: 'three', base: 300, w: 3, evaMul: 0.5, elem: 'light', chance: 0 },
        { key: 'uhyoo', name: 'ウッヒョォォオーー!!', kind: 'beam', area: 'single', base: 1000, w: 2, evaMul: 0.5, elem: 'light', chance: 0 },
        { key: 'machos', name: 'マチョス', kind: 'wait', area: 'self', base: 0, w: 2 }, // 機会を うかがっている (行動しない)
      ],
    },
  };

  // 絵の ファイルで 描く モンスター (読みこんだら 小さな絵を 描きなおす)
  const pics = {};
  function pic(src) {
    if (!pics[src]) {
      const im = new Image();
      im.onload = () => { thumbCache.clear(); if (NS.clearThumbs) NS.clearThumbs(); };
      im.src = src;
      pics[src] = { im, tint: new Map() };
    }
    return pics[src];
  }
  NS.pic = (src) => pic(src).im;
  for (const M of Object.values(NS.MONSTERS)) for (const P of [M, M.phase2, M.phase3]) { if (P && P.art) pic(P.art); if (P && P.face) pic(P.face); } // すがたが かわる ぶんも
  // ダメージの 白い 光・たおれた 灰色を かけた 写し
  function tinted(P, o) {
    const f = Math.round((o.flash || 0) * 6) / 6, g = Math.round((o.gray || 0) * 4) / 4;
    if (!f && !g) return P.im;
    const key = f + '|' + g;
    if (!P.tint.has(key)) {
      const cv = document.createElement('canvas');
      cv.width = P.im.naturalWidth; cv.height = P.im.naturalHeight;
      const c = cv.getContext('2d');
      if (g) c.filter = `grayscale(${g * 0.8})`;
      c.drawImage(P.im, 0, 0);
      c.filter = 'none';
      if (f) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255,255,255,${f})`; c.fillRect(0, 0, cv.width, cv.height); }
      P.tint.set(key, cv);
    }
    return P.tint.get(key);
  }
  function drawPicture(ctx, fx, fy, s, M, o) {
    const PH = o.phase > 1 && M['phase' + o.phase]; // 第二形態・最終形態の 絵
    const P = pic((PH && PH.art) || M.art);
    if (!P.im.naturalWidth) return;
    const t = o.t || 0, breath = Math.sin(t * 2.2) * 0.015, sq = o.squash || 0;
    const h = (PH && PH.height) || M.height, w = (h * P.im.naturalWidth) / P.im.naturalHeight;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(fx, fy);
    if (o.lie) ctx.rotate(o.lie * (Math.PI / 2) * (o.lieDir || 1));
    ctx.scale(s * (1 + sq * 0.5 - breath * 0.4), s * (1 - sq + breath));
    ctx.rotate(-(o.armRaise || 0) * 0.08 + Math.sin(t * 1.6) * 0.015); // 攻撃の ときは 少し のけぞる
    if (o.phase >= 2 && !o.gray) { // 第二形態: 赤黒い オーラ (アビスは 紫)
      const pulse = 0.5 + Math.sin(t * 4) * 0.5, AU = (PH && PH.aura) || ['255,30,60', '120,0,40'];
      ctx.shadowColor = `rgba(${AU[0]},${0.75 + pulse * 0.25})`;
      ctx.shadowBlur = s * (0.12 + pulse * 0.1);
      ctx.drawImage(tinted(P, o), -w / 2, -h, w, h);
      ctx.shadowBlur = s * (0.3 + pulse * 0.15); ctx.shadowColor = `rgba(${AU[1]},0.8)`;
    }
    ctx.drawImage(tinted(P, o), -w / 2, -h, w, h);
    ctx.restore();
  }

  NS.makeMonster = function (key) {
    const M = NS.MONSTERS[key];
    const stres = {};
    for (const k of Object.keys(NS.STATUS)) stres[k] = M.stRes; // 状態異常は あまり 効かない
    return {
      key: 'mon:' + key, name: M.name, monster: key, color: 'black', head: 'round', headRank: 1, headDesc: null,
      stats: Object.assign({}, M.stats), genes: {}, pot: 1, talents: [], blessing: 0, aura: false,
      skill: null, skills: [], noSkill: true, mainElem: M.mainElem || 'ice', res: Object.assign({}, M.res), sres: null, stres, special: null, charm: 0,
      body: 'fat', evaBase: 5, look: { w: 2.2, h: 1, phase: 0 }, score: 999, rank: 'NAMESIS', boss: true, actions: M.actions, height: M.height,
    };
  };

  // ---------------- 絵: ウルフベア ----------------
  // 立ちあがった 狼の顔の 大熊。両腕を ふりあげ、肩・ひじ・頭に 白い とげ
  const FUR = [192, 172, 140], FUR_D = [128, 108, 84], BELLY = [226, 214, 190], SPIKE = [246, 242, 230], CLAW = [56, 50, 48];
  function tone(c, o) {
    let x = c;
    if (o.gray) x = C.mix(x, [120, 120, 125], o.gray * 0.8);
    if (o.flash) x = C.mix(x, [255, 255, 255], o.flash);
    return x;
  }
  function shade(ctx, x, y, r, c, ry = r) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - ry * 0.45, r * 0.1, x, y, Math.max(r, ry) * 1.15);
    g.addColorStop(0, C.str(C.light(c, 0.22)));
    g.addColorStop(0.6, C.str(c));
    g.addColorStop(1, C.str(C.dark(c, 0.3)));
    return g;
  }
  // ふちが ギザギザの 毛のかたまり
  function furPath(ctx, cx, cy, rx, ry, n, jag, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + rot;
      const k = i % 2 ? 1 : 1 + jag;
      const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function spike(ctx, x, y, ang, len, w, col, out) {
    const cx = Math.cos(ang), cy = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(x - cy * w, y + cx * w);
    ctx.quadraticCurveTo(x + cx * len * 0.55 - cy * w * 0.5, y + cy * len * 0.55 + cx * w * 0.5, x + cx * len, y + cy * len);
    ctx.quadraticCurveTo(x + cx * len * 0.55 + cy * w * 0.5, y + cy * len * 0.55 - cx * w * 0.5, x + cy * w, y - cx * w);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y, x + cx * len, y + cy * len);
    g.addColorStop(0, C.str(C.dark(col, 0.18)));
    g.addColorStop(1, C.str(col));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = out; ctx.lineWidth = 0.012; ctx.stroke();
  }
  function claws(ctx, x, y, ang, n, len, col) {
    ctx.strokeStyle = C.str(col); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * 0.32;
      const bx = x + Math.cos(a) * 0.1, by = y + Math.sin(a) * 0.1;
      ctx.lineWidth = 0.045;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + Math.cos(a) * len, by + Math.sin(a) * len, bx + Math.cos(a + 0.6) * len * 1.2, by + Math.sin(a + 0.6) * len * 1.2);
      ctx.stroke();
    }
  }

  function drawHead(ctx, P, o) {
    const { fur, dark, belly, spk, out } = P;
    const hurt = o.expr === 'hurt' || o.expr === 'ko';
    // たてがみ
    furPath(ctx, 0, -1.66, 0.5, 0.42, 11, 0.17, 0.2);
    ctx.fillStyle = shade(ctx, 0, -1.66, 0.5, dark, 0.42); ctx.fill();
    // 耳
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 0.18, -1.92); ctx.lineTo(sx * 0.44, -2.18); ctx.lineTo(sx * 0.38, -1.84); ctx.closePath();
      ctx.fillStyle = C.str(dark); ctx.fill(); ctx.strokeStyle = out; ctx.lineWidth = 0.012; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx * 0.24, -1.92); ctx.lineTo(sx * 0.4, -2.1); ctx.lineTo(sx * 0.35, -1.88); ctx.closePath();
      ctx.fillStyle = 'rgba(90,50,50,0.55)'; ctx.fill();
    }
    // 頭の とげ (角)
    for (const sx of [-1, 1]) spike(ctx, sx * 0.13, -1.96, -Math.PI / 2 + sx * 0.32, 0.34, 0.055, spk, out);
    // 頭
    ctx.beginPath(); ctx.ellipse(0, -1.74, 0.34, 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(ctx, 0, -1.74, 0.34, fur, 0.3); ctx.fill();
    // 鼻づら
    ctx.beginPath(); ctx.ellipse(0, -1.56, 0.21, 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(ctx, 0, -1.56, 0.21, belly, 0.17); ctx.fill();
    // 口 (大きく 開いて 牙が 見える)
    const open = 0.1 + (o.armRaise || 0) * 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.15, -1.53);
    ctx.quadraticCurveTo(0, -1.5, 0.15, -1.53);
    ctx.quadraticCurveTo(0.1, -1.53 + open * 1.6, 0, -1.53 + open * 1.7);
    ctx.quadraticCurveTo(-0.1, -1.53 + open * 1.6, -0.15, -1.53);
    ctx.closePath();
    ctx.fillStyle = '#5a1416'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#c0464a'; ctx.beginPath(); ctx.ellipse(0, -1.53 + open * 1.5, 0.07, 0.04, 0, 0, Math.PI * 2); ctx.fill(); // 舌
    ctx.fillStyle = C.str(spk);
    for (let i = -3; i <= 3; i++) { // 上の歯
      const x = i * 0.04, big = Math.abs(i) === 2;
      ctx.beginPath(); ctx.moveTo(x - 0.018, -1.535); ctx.lineTo(x + 0.018, -1.535); ctx.lineTo(x, -1.535 + (big ? 0.075 : 0.035)); ctx.closePath(); ctx.fill();
    }
    for (let i = -2; i <= 2; i++) { // 下の歯
      const x = i * 0.045, big = Math.abs(i) === 2, y = -1.53 + open * 1.55;
      ctx.beginPath(); ctx.moveTo(x - 0.016, y + 0.02); ctx.lineTo(x + 0.016, y + 0.02); ctx.lineTo(x, y - (big ? 0.06 : 0.03)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 鼻
    ctx.beginPath(); ctx.ellipse(0, -1.65, 0.075, 0.05, 0, 0, Math.PI * 2); ctx.fillStyle = '#2a2220'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-0.025, -1.665, 0.025, 0.012, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    // 目 (黄色く 光る)
    for (const sx of [-1, 1]) {
      const x = sx * 0.15, y = -1.8;
      if (hurt) {
        ctx.strokeStyle = '#2a1c14'; ctx.lineWidth = 0.025; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 0.06, y - 0.02 * sx); ctx.lineTo(x + 0.06, y + 0.02 * sx); ctx.stroke();
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(255,220,60,0.9)'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(x, y, 0.07, 0.042, sx * 0.3, 0, Math.PI * 2); ctx.fillStyle = '#ffd23a'; ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.ellipse(x + sx * 0.005, y, 0.016, 0.036, 0, 0, Math.PI * 2); ctx.fillStyle = '#1a1208'; ctx.fill();
      }
      // こわい まゆ
      ctx.strokeStyle = C.str(C.dark(dark, 0.45)); ctx.lineWidth = 0.035; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx * 0.26, -1.9); ctx.lineTo(sx * 0.07, -1.84); ctx.stroke();
    }
  }

  NS.drawMonster = function (ctx, fx, fy, s, ch, o) {
    if (ch.monster === 'hakairyu') return drawDragon(ctx, fx, fy, s, o);
    if (ch.monster === 'kikorioni') return drawOni(ctx, fx, fy, s, o);
    if (ch.monster === 'shieldknight') return drawKnight(ctx, fx, fy, s, o);
    if (ch.monster === 'kibakoumori') return drawBat(ctx, fx, fy, s, o);
    if (ch.monster === 'butabanausagi') return drawPig(ctx, fx, fy, s, o);
    if (NS.MONSTERS[ch.monster].art) return drawPicture(ctx, fx, fy, s, NS.MONSTERS[ch.monster], o);
    const t = o.t || 0;
    const fur = tone(FUR, o), dark = tone(FUR_D, o), belly = tone(BELLY, o), spk = tone(SPIKE, o), claw = tone(CLAW, o);
    const out = C.str(C.dark(fur, 0.6), 0.7);
    const P = { fur, dark, belly, spk, claw, out };
    const breath = Math.sin(t * 2.2) * 0.015, sq = o.squash || 0;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(fx, fy);
    if (o.lie) ctx.rotate(o.lie * (Math.PI / 2) * (o.lieDir || 1));
    ctx.scale(s * (1 + sq * 0.5 - breath * 0.4), s * (1 - sq + breath));

    // 腕: いつも ふりあげている (攻撃の ときは さらに 高く)
    const raise = 0.8 + (o.armRaise || 0) * 0.45 + Math.sin(t * 2.2) * 0.05;
    for (const sx of [-1, 1]) {
      const sh = [sx * 0.46, -1.3], el = [sx * 0.86, -1.22 - 0.22 * raise], hd = [sx * (0.98 - 0.12 * raise), -1.5 - 0.5 * raise];
      const arm = (w, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(el[0], el[1]); ctx.lineTo(hd[0], hd[1]); ctx.stroke();
      };
      arm(0.3, out);
      arm(0.27, C.str(fur));
      spike(ctx, el[0], el[1], sx > 0 ? 0.25 : Math.PI - 0.25, 0.24, 0.045, spk, out); // ひじの とげ
      ctx.beginPath(); ctx.arc(hd[0], hd[1], 0.15, 0, Math.PI * 2);
      ctx.fillStyle = shade(ctx, hd[0], hd[1], 0.15, fur); ctx.fill();
      claws(ctx, hd[0], hd[1], -Math.PI / 2 + sx * 0.35, 4, 0.13, claw);
    }

    // 脚
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(sx * 0.3, -0.38, 0.19, 0.42, sx * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = shade(ctx, sx * 0.3, -0.38, 0.19, dark, 0.42); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx * 0.33, -0.04, 0.2, 0.07, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.str(C.dark(dark, 0.15)); ctx.fill();
      claws(ctx, sx * 0.33, -0.04, Math.PI / 2 - 0.25, 3, 0.06, claw);
    }

    // 胴体 (毛深い)
    furPath(ctx, 0, -1.0, 0.62, 0.6, 10, 0.1, 0.15);
    ctx.fillStyle = shade(ctx, 0, -1.0, 0.62, fur, 0.6); ctx.fill();
    ctx.strokeStyle = out; ctx.lineWidth = 0.014; ctx.stroke();
    furPath(ctx, 0, -0.92, 0.34, 0.42, 8, 0.1);
    ctx.fillStyle = shade(ctx, 0, -0.92, 0.34, belly, 0.42); ctx.fill();
    // 肩の とげ
    for (const sx of [-1, 1]) {
      spike(ctx, sx * 0.5, -1.4, -Math.PI / 2 + sx * 1.05, 0.32, 0.06, spk, out);
      spike(ctx, sx * 0.4, -1.5, -Math.PI / 2 + sx * 0.6, 0.26, 0.05, spk, out);
    }

    drawHead(ctx, P, o);
    ctx.restore();
  };

  // ---------------- 絵: きこりおに ----------------
  // まるい 赤むらさきの 毛の かたまりに 大きな 口と ぎざぎざの 歯。両手で 大きな オノを よこに かまえる
  const ONI = [150, 40, 70], ONI_D = [92, 22, 46], TEETH = [244, 226, 170], AXE = [70, 74, 84], HANDLE = [120, 84, 52];
  function oniCols(o) { return { b: tone(ONI, o), d: tone(ONI_D, o), teeth: tone(TEETH, o), axe: tone(AXE, o), handle: tone(HANDLE, o), out: C.str(C.dark(tone(ONI, o), 0.6), 0.8) }; }
  function oniBody(ctx, K, o, t, withLegs) {
    const cy = -0.62;
    if (withLegs) for (const sx of [-1, 1]) { // みじかい 足
      ctx.beginPath(); ctx.ellipse(sx * 0.2, -0.08, 0.13, 0.1, 0, 0, Math.PI * 2); ctx.fillStyle = C.str(K.d); ctx.fill();
    }
    furPath(ctx, 0, cy, 0.56, 0.52, 14, 0.06, 0.1);
    ctx.fillStyle = shade(ctx, 0, cy, 0.56, K.b, 0.52); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.014; ctx.stroke();
    ctx.fillStyle = C.str(C.light(K.b, 0.25), 0.55); // 毛の つぶつぶ
    for (const [x, y] of [[-0.3, -0.95], [-0.1, -1.05], [0.15, -1.0], [0.35, -0.85], [-0.42, -0.7], [0.45, -0.6]]) { ctx.beginPath(); ctx.arc(x, y, 0.035, 0, Math.PI * 2); ctx.fill(); }
    // 小さな 角
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 0.18, -1.08); ctx.lineTo(sx * 0.26, -1.25); ctx.lineTo(sx * 0.32, -1.04); ctx.closePath(); ctx.fillStyle = C.str(K.teeth); ctx.fill(); }
    // 目 (ぎろり)
    const hurt = o.expr === 'hurt' || o.expr === 'ko';
    for (const sx of [-1, 1]) {
      if (hurt) { ctx.strokeStyle = '#1a0a10'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(sx * 0.12, -0.86); ctx.lineTo(sx * 0.24, -0.84); ctx.stroke(); continue; }
      ctx.beginPath(); ctx.ellipse(sx * 0.18, -0.86, 0.06, 0.045, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff3c0'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx * 0.17, -0.85, 0.022, 0, Math.PI * 2); ctx.fillStyle = '#1a0a10'; ctx.fill();
      ctx.strokeStyle = C.str(K.d); ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(sx * 0.28, -0.96); ctx.lineTo(sx * 0.08, -0.9); ctx.stroke();
    }
    // 大きな 口と ぎざぎざの 歯
    const open = 0.1 + (o.armRaise || 0) * 0.05;
    ctx.beginPath(); ctx.moveTo(-0.4, -0.66); ctx.quadraticCurveTo(0, -0.58, 0.4, -0.66); ctx.quadraticCurveTo(0.2, -0.5 + open, 0, -0.48 + open); ctx.quadraticCurveTo(-0.2, -0.5 + open, -0.4, -0.66); ctx.closePath();
    ctx.fillStyle = '#3a0814'; ctx.fill();
    ctx.fillStyle = C.str(K.teeth);
    for (let i = 0; i < 8; i++) { const x = -0.36 + i * 0.1; ctx.beginPath(); ctx.moveTo(x - 0.045, -0.645 + Math.abs(x) * 0.05); ctx.lineTo(x, -0.58); ctx.lineTo(x + 0.045, -0.645 + Math.abs(x) * 0.05); ctx.closePath(); ctx.fill(); }
    for (let i = 0; i < 6; i++) { const x = -0.26 + i * 0.105, y = -0.5 + open - Math.abs(x) * 0.12; ctx.beginPath(); ctx.moveTo(x - 0.04, y + 0.02); ctx.lineTo(x, y - 0.06); ctx.lineTo(x + 0.04, y + 0.02); ctx.closePath(); ctx.fill(); }
  }
  function oniAxe(ctx, K, lift) { // 柄は よこに ながく、左に 大きな 刃
    ctx.save(); ctx.translate(0, -0.42); ctx.rotate(-0.12 - lift * 1.1);
    ctx.strokeStyle = C.str(K.handle); ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.9, 0); ctx.lineTo(0.95, 0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.72, -0.03); ctx.quadraticCurveTo(-1.0, -0.12, -1.12, -0.3); ctx.quadraticCurveTo(-1.02, 0.02, -1.12, 0.32); ctx.quadraticCurveTo(-0.95, 0.12, -0.72, 0.05); ctx.closePath();
    const g = ctx.createLinearGradient(-1.12, -0.3, -0.72, 0.3); g.addColorStop(0, C.str(C.light(K.axe, 0.5))); g.addColorStop(1, C.str(C.dark(K.axe, 0.3)));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#202228'; ctx.lineWidth = 0.012; ctx.stroke();
    ctx.restore();
  }
  function drawOni(ctx, fx, fy, s, o) {
    const t = o.t || 0, K = oniCols(o), breath = Math.sin(t * 2.4) * 0.02, sq = o.squash || 0;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(fx, fy);
    if (o.lie) ctx.rotate(o.lie * (Math.PI / 2) * (o.lieDir || 1));
    ctx.scale(s * (1 + sq * 0.5 - breath * 0.4), s * (1 - sq + breath));
    oniBody(ctx, K, o, t, true);
    oniAxe(ctx, K, o.armRaise || 0);
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 0.32, -0.42, 0.07, 0, Math.PI * 2); ctx.fillStyle = C.str(K.d); ctx.fill(); } // オノを にぎる 手
    ctx.restore();
  }

  // ---------------- 絵: はかいりゅう ----------------
  // 銀の よろいの 竜。金色の 大きな つばさ、黄色い おなかの 板、左を 向いた 頭に 後ろへ のびる 角、口を あけて 牙
  const SILVER = [198, 206, 218], SILVER_D = [104, 112, 128], GOLD = [214, 186, 104], BELLY_Y = [232, 206, 120], MOUTH = [150, 30, 36];
  function dragonCols(o) { return { sil: tone(SILVER, o), sd: tone(SILVER_D, o), gold: tone(GOLD, o), belly: tone(BELLY_Y, o), out: C.str(C.dark(tone(SILVER, o), 0.65), 0.8) }; }
  function metal(ctx, x, y, r, c, ry = r) { // 金属の つや (明るい 帯が 入る)
    const g = ctx.createLinearGradient(x - r, y - ry, x + r * 0.6, y + ry);
    g.addColorStop(0, C.str(C.light(c, 0.35)));
    g.addColorStop(0.35, C.str(c));
    g.addColorStop(0.55, C.str(C.light(c, 0.2)));
    g.addColorStop(1, C.str(C.dark(c, 0.35)));
    return g;
  }
  function wing(ctx, K, sx, flap) {
    const sh = [sx * 0.42, -1.62], tip = [sx * 1.75, -2.35 - flap], end = [sx * 1.55, -0.95];
    const mem = [[sx * 1.35, -1.25], [sx * 1.05, -1.0], [sx * 0.75, -1.15]];
    ctx.beginPath();
    ctx.moveTo(sh[0], sh[1]);
    ctx.quadraticCurveTo(sx * 1.0, -2.3 - flap, tip[0], tip[1]);
    ctx.lineTo(end[0], end[1]);
    let prev = end;
    for (const p of mem) { ctx.quadraticCurveTo((prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2 - 0.12, p[0], p[1]); prev = p; } // 膜の へり (ふくらみ)
    ctx.quadraticCurveTo(sx * 0.6, -1.3, sh[0], sh[1] + 0.2);
    ctx.closePath();
    const g = ctx.createLinearGradient(sh[0], sh[1], tip[0], tip[1]);
    g.addColorStop(0, C.str(C.dark(K.gold, 0.25)));
    g.addColorStop(1, C.str(C.light(K.gold, 0.25)));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = K.out; ctx.lineWidth = 0.016; ctx.stroke();
    ctx.strokeStyle = C.str(K.sil); ctx.lineWidth = 0.05; ctx.lineCap = 'round'; // 骨
    ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.quadraticCurveTo(sx * 1.0, -2.3 - flap, tip[0], tip[1]); ctx.stroke();
    ctx.lineWidth = 0.025;
    for (const p of [end, ...mem]) { ctx.beginPath(); ctx.moveTo(sx * 1.2, -2.05 - flap * 0.7); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
  }
  function dragonHead(ctx, K, o, t) {
    const open = 0.12 + (o.armRaise || 0) * 0.08 + Math.sin(t * 2) * 0.02;
    const hurt = o.expr === 'hurt' || o.expr === 'ko';
    // 角 (うしろへ 反る)
    for (const [x, y, len] of [[0.05, -1.95, 0.55], [-0.12, -1.98, 0.48]]) {
      ctx.beginPath(); ctx.moveTo(x - 0.05, y + 0.04); ctx.quadraticCurveTo(x + len * 0.5, y - 0.25, x + len, y - 0.32); ctx.quadraticCurveTo(x + len * 0.45, y - 0.08, x + 0.06, y + 0.06); ctx.closePath();
      ctx.fillStyle = metal(ctx, x + len / 2, y - 0.15, len / 2, K.sil, 0.15); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.012; ctx.stroke();
    }
    // 下あご
    ctx.beginPath(); ctx.moveTo(0.1, -1.62); ctx.lineTo(-0.72, -1.6 + open); ctx.quadraticCurveTo(-0.78, -1.52 + open, -0.65, -1.48 + open); ctx.quadraticCurveTo(-0.1, -1.45, 0.15, -1.55); ctx.closePath();
    ctx.fillStyle = metal(ctx, -0.3, -1.55, 0.45, K.sil, 0.1); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.012; ctx.stroke();
    // 口の 中
    ctx.beginPath(); ctx.moveTo(0.05, -1.66); ctx.lineTo(-0.7, -1.68); ctx.lineTo(-0.68, -1.6 + open); ctx.lineTo(0.05, -1.6); ctx.closePath();
    ctx.fillStyle = C.str(o.gray ? [110, 100, 100] : MOUTH); ctx.fill();
    ctx.fillStyle = '#f4f0e6'; // 牙
    for (let i = 0; i < 6; i++) { const x = -0.62 + i * 0.12; ctx.beginPath(); ctx.moveTo(x, -1.68); ctx.lineTo(x + 0.035, -1.6); ctx.lineTo(x + 0.06, -1.68); ctx.closePath(); ctx.fill(); }
    for (let i = 0; i < 5; i++) { const x = -0.58 + i * 0.13; const y = -1.6 + open * (1 - i * 0.12); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.03, y - 0.07); ctx.lineTo(x + 0.06, y); ctx.closePath(); ctx.fill(); }
    // 頭と 上あご (よろいの かぶと)
    ctx.beginPath();
    ctx.moveTo(0.28, -1.72); ctx.quadraticCurveTo(0.22, -2.05, -0.15, -2.02); ctx.quadraticCurveTo(-0.45, -1.98, -0.78, -1.78);
    ctx.quadraticCurveTo(-0.82, -1.68, -0.72, -1.66); ctx.lineTo(0.05, -1.64); ctx.quadraticCurveTo(0.25, -1.6, 0.28, -1.72); ctx.closePath();
    ctx.fillStyle = metal(ctx, -0.25, -1.85, 0.55, K.sil, 0.2); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.014; ctx.stroke();
    ctx.strokeStyle = C.str(K.sd, 0.8); ctx.lineWidth = 0.01; // かぶとの すじ
    ctx.beginPath(); ctx.moveTo(-0.7, -1.76); ctx.quadraticCurveTo(-0.3, -1.88, 0.15, -1.92); ctx.stroke();
    ctx.fillStyle = C.str(K.sd); ctx.beginPath(); ctx.ellipse(-0.72, -1.74, 0.025, 0.015, 0, 0, Math.PI * 2); ctx.fill(); // 鼻の あな
    // 目 (赤く 光る)
    if (hurt) { ctx.strokeStyle = '#3a1010'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(-0.22, -1.86); ctx.lineTo(-0.08, -1.84); ctx.stroke(); }
    else {
      ctx.save(); ctx.shadowColor = 'rgba(255,120,60,0.95)'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(-0.15, -1.86, 0.065, 0.03, -0.2, 0, Math.PI * 2); ctx.fillStyle = '#ffb030'; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.ellipse(-0.14, -1.86, 0.012, 0.026, 0, 0, Math.PI * 2); ctx.fillStyle = '#2a0a00'; ctx.fill();
      ctx.strokeStyle = C.str(K.sd); ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(-0.26, -1.92); ctx.lineTo(-0.04, -1.89); ctx.stroke(); // まゆの よろい
    }
  }
  function drawDragon(ctx, fx, fy, s, o) {
    const t = o.t || 0, K = dragonCols(o);
    const breath = Math.sin(t * 1.8) * 0.012, sq = o.squash || 0, flap = Math.sin(t * 2.4) * 0.1 + (o.armRaise || 0) * 0.25;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(fx, fy);
    if (o.lie) ctx.rotate(o.lie * (Math.PI / 2) * (o.lieDir || 1));
    ctx.scale(s * (1 + sq * 0.5 - breath * 0.4), s * (1 - sq + breath));
    // つばさ (うしろ)
    wing(ctx, K, -1, flap); wing(ctx, K, 1, flap);
    // しっぽ (右へ)
    ctx.beginPath(); ctx.moveTo(0.35, -0.55); ctx.quadraticCurveTo(1.1, -0.45, 1.55, -0.12); ctx.quadraticCurveTo(1.15, -0.2, 0.3, -0.3); ctx.closePath();
    ctx.fillStyle = metal(ctx, 0.9, -0.35, 0.6, K.sil, 0.2); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.014; ctx.stroke();
    // 脚 (かがんだ 太い 脚と つめ)
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(sx * 0.42, -0.42, 0.24, 0.36, sx * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = metal(ctx, sx * 0.42, -0.42, 0.24, K.sil, 0.36); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.014; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sx * 0.5, -0.06, 0.22, 0.08, 0, 0, Math.PI * 2); ctx.fillStyle = C.str(K.sd); ctx.fill();
      ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 0.03; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { const x = sx * 0.5 + i * 0.1; ctx.beginPath(); ctx.moveTo(x, -0.06); ctx.lineTo(x + i * 0.04 - 0.02, 0.0); ctx.stroke(); }
    }
    // 胴体 (よろい) と おなかの 板
    ctx.beginPath(); ctx.ellipse(0.05, -1.05, 0.64, 0.66, 0, 0, Math.PI * 2);
    ctx.fillStyle = metal(ctx, 0.05, -1.05, 0.64, K.sil, 0.66); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.016; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(-0.02, -0.95, 0.36, 0.54, 0, 0, Math.PI * 2); ctx.clip();
    const bg = ctx.createLinearGradient(-0.38, -1.4, 0.34, -0.4);
    bg.addColorStop(0, C.str(C.light(K.belly, 0.25))); bg.addColorStop(1, C.str(C.dark(K.belly, 0.25)));
    ctx.fillStyle = bg; ctx.fillRect(-0.4, -1.5, 0.8, 1.1);
    ctx.strokeStyle = C.str(C.dark(K.belly, 0.4), 0.7); ctx.lineWidth = 0.014;
    for (let i = 0; i < 6; i++) { const y = -1.38 + i * 0.16; ctx.beginPath(); ctx.moveTo(-0.4, y); ctx.quadraticCurveTo(0, y + 0.05, 0.4, y); ctx.stroke(); }
    ctx.restore();
    // 背中の よろいの とげ
    for (const [x, y, a] of [[0.45, -1.55, -0.5], [0.6, -1.3, -0.2], [0.66, -1.02, 0.1]]) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 0.18, y + Math.sin(a) * 0.18 - 0.08); ctx.lineTo(x - 0.04, y + 0.1); ctx.closePath();
      ctx.fillStyle = C.str(K.sd); ctx.fill();
    }
    // 腕 (小さく 前に つめ)
    for (const sx of [-1, 1]) {
      const a = [sx * 0.4, -1.32], b = [sx * 0.62 - 0.12, -0.92];
      ctx.strokeStyle = K.out; ctx.lineWidth = 0.15; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = C.str(K.sil); ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 0.025;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(b[0] + i * 0.05, b[1] + 0.03); ctx.lineTo(b[0] + i * 0.07, b[1] + 0.12); ctx.stroke(); }
    }
    // 首と 頭 (左を 向いて 前へ のりだす)
    ctx.beginPath(); ctx.moveTo(-0.25, -1.55); ctx.quadraticCurveTo(-0.2, -1.85, 0.05, -1.82); ctx.lineTo(0.35, -1.45); ctx.quadraticCurveTo(0.1, -1.35, -0.25, -1.55); ctx.closePath();
    ctx.fillStyle = metal(ctx, 0.05, -1.6, 0.35, K.sil, 0.25); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.014; ctx.stroke();
    dragonHead(ctx, K, o, t);
    ctx.restore();
  }

  // ---------------- 絵: シールドナイト ----------------
  // 銀の よろいの 小さな 騎士。両手に 大きな 丸い 盾 (クリーム色の ふち・びょう・黒い 中心)。赤い こしまき
  const ARMOR = [178, 180, 188], ARMOR_D = [104, 106, 116], RIM = [236, 226, 196], CORE = [40, 40, 46], SASH = [196, 30, 40];
  function knightCols(o) { return { a: tone(ARMOR, o), d: tone(ARMOR_D, o), rim: tone(RIM, o), core: tone(CORE, o), sash: tone(SASH, o), out: C.str(C.dark(tone(ARMOR, o), 0.6), 0.85) }; }
  function knightHelm(ctx, K) {
    ctx.beginPath(); ctx.ellipse(0, -1.2, 0.17, 0.22, 0, 0, Math.PI * 2); // かぶと
    ctx.fillStyle = metal(ctx, 0, -1.2, 0.17, K.a, 0.22); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.014; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -1.42); ctx.quadraticCurveTo(0.05, -1.3, 0, -1.02); // まんなかの すじ
    ctx.strokeStyle = C.str(C.dark(K.a, 0.25)); ctx.lineWidth = 0.025; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -1.17, 0.12, 0.028, 0, 0, Math.PI * 2); // のぞき穴
    ctx.fillStyle = C.str(K.core); ctx.fill();
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 0.05, -1.17, 0.012, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,240,200,0.8)'; ctx.fill(); }
  }
  function knightShield(ctx, K, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); // ふち
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r);
    g.addColorStop(0, C.str(C.light(K.rim, 0.2))); g.addColorStop(1, C.str(C.dark(K.rim, 0.22)));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.016; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); // 内がわの 輪
    ctx.fillStyle = metal(ctx, x, y, r * 0.72, K.a); ctx.fill(); ctx.strokeStyle = C.str(C.dark(K.a, 0.35)); ctx.lineWidth = 0.012; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.48, 0, Math.PI * 2); // 黒い 中心
    const cg = ctx.createRadialGradient(x - r * 0.12, y - r * 0.15, r * 0.05, x, y, r * 0.48);
    cg.addColorStop(0, C.str(C.light(K.core, 0.25))); cg.addColorStop(1, C.str(K.core));
    ctx.fillStyle = cg; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - r * 0.16, y - r * 0.2, r * 0.12, r * 0.07, -0.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    for (let i = 0; i < 4; i++) { // びょう
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, r * 0.045, 0, Math.PI * 2);
      ctx.fillStyle = C.str(C.dark(K.rim, 0.45)); ctx.fill();
    }
  }
  function drawKnight(ctx, fx, fy, s, o) {
    const t = o.t || 0, K = knightCols(o);
    const breath = Math.sin(t * 2.4) * 0.012, sq = o.squash || 0, lift = (o.armRaise || 0);
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(fx, fy);
    if (o.lie) ctx.rotate(o.lie * (Math.PI / 2) * (o.lieDir || 1));
    ctx.scale(s * (1 + sq * 0.5 - breath * 0.4), s * (1 - sq + breath));
    for (const sx of [-1, 1]) { // 脚と くつ
      ctx.beginPath(); ctx.roundRect(sx * 0.13 - 0.07, -0.38, 0.14, 0.34, 0.05);
      ctx.fillStyle = metal(ctx, sx * 0.13, -0.22, 0.1, K.a, 0.2); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.012; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sx * 0.14, -0.04, 0.1, 0.05, 0, 0, Math.PI * 2); ctx.fillStyle = C.str(K.d); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-0.24, -0.5); ctx.lineTo(0.24, -0.5); ctx.lineTo(0.3, -0.33); ctx.lineTo(-0.3, -0.33); ctx.closePath(); // 赤い こしまき
    ctx.fillStyle = C.str(K.sash); ctx.fill(); ctx.strokeStyle = C.str(C.dark(K.sash, 0.4)); ctx.lineWidth = 0.012; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -0.72, 0.27, 0.27, 0, 0, Math.PI * 2); // むね
    ctx.fillStyle = metal(ctx, 0, -0.72, 0.27, K.a); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.014; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.16, -0.82); ctx.quadraticCurveTo(0, -0.72, 0.16, -0.82); ctx.moveTo(-0.14, -0.66); ctx.quadraticCurveTo(0, -0.58, 0.14, -0.66);
    ctx.strokeStyle = C.str(C.dark(K.a, 0.3)); ctx.lineWidth = 0.014; ctx.stroke();
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 0.27, -0.9, 0.11, 0, Math.PI * 2); ctx.fillStyle = metal(ctx, sx * 0.27, -0.9, 0.11, K.a); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.012; ctx.stroke(); }
    knightHelm(ctx, K);
    // 盾 (攻撃の ときは 前に 寄せて 持ちあげる)
    const sy = -0.72 - lift * 0.18 + Math.sin(t * 2.4) * 0.01, sx0 = 0.6 - lift * 0.12;
    knightShield(ctx, K, -sx0, sy, 0.46);
    knightShield(ctx, K, sx0, sy, 0.46);
    ctx.restore();
  }

  // ---------------- 絵: きばこうもり ----------------
  // まるい 青い 体・とがった 耳・オレンジの こうもりの はね (骨つき)・大きく あいた 口に 白い きば・小さな 黒い 目・オレンジの 足
  const BAT = [70, 120, 220], BAT_D = [36, 66, 150], WINGC = [238, 150, 50], WING_D = [186, 92, 26], MOUTHC = [196, 40, 40];
  function batCols(o) { return { b: tone(BAT, o), d: tone(BAT_D, o), w: tone(WINGC, o), wd: tone(WING_D, o), m: tone(MOUTHC, o), out: C.str(C.dark(tone(BAT, o), 0.6), 0.85) }; }
  function batWing(ctx, K, sx, flap) {
    ctx.save(); ctx.translate(sx * 0.3, -0.72); ctx.scale(sx, 1); ctx.rotate(-flap * 0.5);
    const tip = [0.95, -0.42], pts = [[0.86, 0.02], [0.66, -0.06], [0.48, 0.1], [0.28, 0.02]];
    ctx.beginPath(); ctx.moveTo(0, -0.08);
    ctx.quadraticCurveTo(0.45, -0.42, tip[0], tip[1]); // 上の 骨
    ctx.lineTo(1.0, -0.2);
    let prev = [1.0, -0.2];
    for (const p of pts) { ctx.quadraticCurveTo((prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2 - 0.1, p[0], p[1]); prev = p; } // ぎざぎざの 膜
    ctx.quadraticCurveTo(0.12, 0.02, 0, 0.08); ctx.closePath();
    const g = ctx.createLinearGradient(0, -0.4, 0.9, 0.1);
    g.addColorStop(0, C.str(C.light(K.w, 0.2))); g.addColorStop(1, C.str(K.wd));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = C.str(C.dark(K.wd, 0.35)); ctx.lineWidth = 0.02; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = C.str(C.light(K.w, 0.35)); ctx.lineWidth = 0.035; ctx.lineCap = 'round'; // 骨
    ctx.beginPath(); ctx.moveTo(0, -0.08); ctx.quadraticCurveTo(0.45, -0.42, tip[0], tip[1]);
    for (const p of [[1.0, -0.2], [0.66, -0.06], [0.28, 0.02]]) { ctx.moveTo(0.55, -0.32); ctx.lineTo(p[0], p[1]); }
    ctx.stroke();
    ctx.restore();
  }
  function batBody(ctx, K, o, t) {
    const cy = -0.66, r = 0.42;
    const hurt = o.expr === 'hurt' || o.expr === 'ko', open = 0.12 + (o.armRaise || 0) * 0.06 + Math.sin(t * 6) * 0.015;
    for (const sx of [-1, 1]) { // 耳
      ctx.beginPath(); ctx.moveTo(sx * 0.12, cy - r * 0.8); ctx.quadraticCurveTo(sx * 0.2, cy - r * 1.75, sx * 0.34, cy - r * 1.62); ctx.quadraticCurveTo(sx * 0.4, cy - r * 1.1, sx * 0.36, cy - r * 0.6); ctx.closePath();
      ctx.fillStyle = shade(ctx, sx * 0.25, cy - r * 1.2, 0.2, K.b); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.015; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx * 0.18, cy - r * 0.9); ctx.quadraticCurveTo(sx * 0.23, cy - r * 1.5, sx * 0.31, cy - r * 1.42); ctx.quadraticCurveTo(sx * 0.34, cy - r * 1.05, sx * 0.31, cy - r * 0.75); ctx.closePath();
      ctx.fillStyle = C.str(K.d, 0.8); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(0, cy, r * 1.05, r, 0, 0, Math.PI * 2); // 体
    ctx.fillStyle = shade(ctx, 0, cy, r * 1.05, K.b, r); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.016; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-0.14, cy - 0.22, 0.12, 0.06, -0.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); // つや
    for (const sx of [-1, 1]) { // 目
      if (hurt) { ctx.strokeStyle = '#10142a'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(sx * 0.1, cy - 0.17); ctx.lineTo(sx * 0.22, cy - 0.15); ctx.stroke(); continue; }
      ctx.beginPath(); ctx.ellipse(sx * 0.15, cy - 0.16, 0.045, 0.055, 0, 0, Math.PI * 2); ctx.fillStyle = '#10142a'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx * 0.15 - 0.012, cy - 0.18, 0.014, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    }
    // 大きな 口と 白い きば
    ctx.beginPath(); ctx.moveTo(-0.24, cy + 0.0); ctx.quadraticCurveTo(0, cy + 0.04, 0.24, cy + 0.0); ctx.quadraticCurveTo(0.16, cy + 0.12 + open, 0, cy + 0.14 + open); ctx.quadraticCurveTo(-0.16, cy + 0.12 + open, -0.24, cy + 0.0); ctx.closePath();
    ctx.fillStyle = C.str(K.m); ctx.fill(); ctx.strokeStyle = C.str(C.dark(K.m, 0.5)); ctx.lineWidth = 0.012; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, cy + 0.1 + open * 0.7, 0.08, 0.035, 0, 0, Math.PI * 2); ctx.fillStyle = C.str(C.light(K.m, 0.25)); ctx.fill(); // 舌
    ctx.fillStyle = '#ffffff';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 0.17, cy + 0.01); ctx.lineTo(sx * 0.1, cy + 0.02); ctx.lineTo(sx * 0.13, cy + 0.11); ctx.closePath(); ctx.fill(); }
    // 小さな 足
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 0.12, cy + r + 0.03, 0.06, 0.04, 0, 0, Math.PI * 2); ctx.fillStyle = C.str(K.w); ctx.fill(); }
  }
  function drawBat(ctx, fx, fy, s, o) {
    const t = o.t || 0, K = batCols(o), hover = Math.sin(t * 3.2) * 0.04, flap = Math.sin(t * 9) * 0.35 + (o.armRaise || 0) * 0.4, sq = o.squash || 0;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(fx, fy);
    if (o.lie) ctx.rotate(o.lie * (Math.PI / 2) * (o.lieDir || 1));
    ctx.scale(s * (1 + sq * 0.5), s * (1 - sq));
    ctx.translate(0, -0.25 + hover * (o.lie ? 0 : 1) + (o.lie || 0) * 0.25); // ふわふわ 飛んでいる
    batWing(ctx, K, -1, flap); batWing(ctx, K, 1, flap);
    batBody(ctx, K, o, t);
    ctx.restore();
  }

  // ---------------- 絵: ぶたばなうさぎ ----------------
  // ピンクの まるい 頭・長い うさぎの 耳・ぶたの 鼻・こわい まゆ・緑の 服と 茶色の ベルト・右手に 短剣・左手に 緑の まるい 盾
  const PIG = [246, 150, 176], PIG_D = [214, 104, 136], TUNIC = [96, 196, 60], TUNIC_D = [56, 130, 36], SHIELD = [70, 170, 70];
  function pigCols(o) { return { p: tone(PIG, o), d: tone(PIG_D, o), g: tone(TUNIC, o), gd: tone(TUNIC_D, o), s: tone(SHIELD, o), out: C.str(C.dark(tone(PIG, o), 0.6), 0.85) }; }
  function pigHead(ctx, K, o, t) {
    const cy = -1.12, r = 0.36, hurt = o.expr === 'hurt' || o.expr === 'ko';
    for (const sx of [-1, 1]) { // 長い 耳
      const w = Math.sin(t * 2 + sx) * 0.04;
      ctx.save(); ctx.translate(sx * 0.17, cy - r * 0.75); ctx.rotate(sx * (0.18 + w));
      ctx.beginPath(); ctx.ellipse(0, -0.26, 0.11, 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = shade(ctx, 0, -0.26, 0.2, K.p, 0.3); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.014; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -0.24, 0.055, 0.22, 0, 0, Math.PI * 2); ctx.fillStyle = C.str(C.light(K.p, 0.35)); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, cy, r * 1.05, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(ctx, 0, cy, r * 1.05, K.p, r); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.016; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-0.13, cy - 0.2, 0.1, 0.05, -0.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    for (const sx of [-1, 1]) { // 目と こわい まゆ
      if (hurt) { ctx.strokeStyle = '#2a1018'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(sx * 0.08, cy - 0.06); ctx.lineTo(sx * 0.18, cy - 0.04); ctx.stroke(); continue; }
      ctx.beginPath(); ctx.ellipse(sx * 0.13, cy - 0.05, 0.03, 0.04, 0, 0, Math.PI * 2); ctx.fillStyle = '#1a0c10'; ctx.fill();
      ctx.strokeStyle = C.str(C.dark(K.d, 0.4)); ctx.lineWidth = 0.025; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx * 0.22, cy - 0.16); ctx.lineTo(sx * 0.07, cy - 0.1); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, cy + 0.1, 0.13, 0.085, 0, 0, Math.PI * 2); // ぶたの 鼻
    ctx.fillStyle = shade(ctx, 0, cy + 0.1, 0.13, K.d, 0.085); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.012; ctx.stroke();
    ctx.fillStyle = C.str(C.dark(K.d, 0.45));
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 0.045, cy + 0.1, 0.022, 0.035, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#2a1018'; ctx.lineWidth = 0.014; // への字 口
    ctx.beginPath(); ctx.moveTo(-0.06, cy + 0.25); ctx.quadraticCurveTo(0, cy + 0.21, 0.06, cy + 0.25); ctx.stroke();
  }
  function drawPig(ctx, fx, fy, s, o) {
    const t = o.t || 0, K = pigCols(o), sq = o.squash || 0, lift = o.armRaise || 0, bob = Math.abs(Math.sin(t * 3)) * 0.02;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(fx, fy);
    if (o.lie) ctx.rotate(o.lie * (Math.PI / 2) * (o.lieDir || 1));
    ctx.scale(s * (1 + sq * 0.5), s * (1 - sq));
    ctx.translate(0, -bob);
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 0.12, -0.1, 0.07, 0.11, 0, 0, Math.PI * 2); ctx.fillStyle = C.str(K.p); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.012; ctx.stroke(); } // 足
    // 短剣 (右手。攻撃で ふりあげる)
    ctx.save(); ctx.translate(0.32, -0.5); ctx.rotate(-0.4 - lift * 1.2);
    ctx.fillStyle = '#d8dde6'; ctx.beginPath(); ctx.moveTo(0, -0.04); ctx.lineTo(0.42, -0.02); ctx.lineTo(0.48, 0); ctx.lineTo(0.42, 0.02); ctx.lineTo(0, 0.04); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#6a7080'; ctx.lineWidth = 0.008; ctx.stroke();
    ctx.fillStyle = '#7a4a22'; ctx.fillRect(-0.12, -0.03, 0.12, 0.06); ctx.fillStyle = '#c8a040'; ctx.fillRect(-0.01, -0.07, 0.03, 0.14);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -0.48, 0.27, 0.32, 0, 0, Math.PI * 2); // 体 (緑の 服)
    ctx.fillStyle = shade(ctx, 0, -0.48, 0.3, K.g, 0.32); ctx.fill(); ctx.strokeStyle = C.str(C.dark(K.gd, 0.3)); ctx.lineWidth = 0.014; ctx.stroke();
    ctx.fillStyle = '#6a3e1c'; ctx.fillRect(-0.27, -0.42, 0.54, 0.05); // ベルト
    ctx.strokeStyle = C.str(K.gd); ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(0, -0.78); ctx.lineTo(0, -0.62); ctx.stroke(); // えりの ひも
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 0.28, -0.56, 0.07, 0, Math.PI * 2); ctx.fillStyle = C.str(K.p); ctx.fill(); ctx.strokeStyle = K.out; ctx.lineWidth = 0.01; ctx.stroke(); } // 手
    pigHead(ctx, K, o, t);
    // 盾 (左手。攻撃の ときは 前へ)
    const shx = -0.36 - lift * 0.05, shy = -0.48, sr = 0.27;
    ctx.beginPath(); ctx.arc(shx, shy, sr, 0, Math.PI * 2); ctx.fillStyle = shade(ctx, shx, shy, sr, K.s); ctx.fill(); ctx.strokeStyle = C.str(C.dark(K.s, 0.5)); ctx.lineWidth = 0.02; ctx.stroke();
    ctx.beginPath(); ctx.arc(shx, shy, sr * 0.78, 0, Math.PI * 2); ctx.strokeStyle = C.str(C.dark(K.s, 0.3)); ctx.lineWidth = 0.012; ctx.stroke();
    ctx.beginPath(); ctx.arc(shx, shy, sr * 0.32, 0, Math.PI * 2); ctx.fillStyle = '#23262c'; ctx.fill(); // 中心の 黒い まる
    ctx.fillStyle = '#23262c';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.arc(shx + Math.cos(a) * sr * 0.6, shy + Math.sin(a) * sr * 0.6, 0.025, 0, Math.PI * 2); ctx.fill(); } // びょう
    ctx.restore();
  }

  // 顔アイコン (頭だけ)
  NS.drawMonsterHead = function (ctx, cx, cy, size, ch, o = {}) {
    const M = NS.MONSTERS[ch.monster];
    if (ch.monster === 'butabanausagi') {
      ctx.save(); ctx.translate(cx, cy); const k = size / 1.1; ctx.scale(k, k); ctx.translate(0, 1.2);
      pigHead(ctx, pigCols(o), o, 0.4); ctx.restore(); return;
    }
    if (ch.monster === 'kibakoumori') { // 全身を 小さく
      ctx.save(); ctx.translate(cx, cy); const k = size / 1.05; ctx.scale(k, k); ctx.translate(0, 0.62);
      batBody(ctx, batCols(o), o, 0.4); ctx.restore(); return;
    }
    if (ch.monster === 'shieldknight') { // かぶとと 盾の はし
      const K = knightCols(o);
      ctx.save(); ctx.translate(cx, cy); const k = size / 0.75; ctx.scale(k, k); ctx.translate(0, 1.12);
      ctx.beginPath(); ctx.ellipse(0, -0.82, 0.27, 0.2, 0, 0, Math.PI * 2); ctx.fillStyle = metal(ctx, 0, -0.82, 0.27, K.a, 0.2); ctx.fill();
      knightHelm(ctx, K);
      knightShield(ctx, K, -0.42, -0.86, 0.2); knightShield(ctx, K, 0.42, -0.86, 0.2);
      ctx.restore(); return;
    }
    const PH = ch.phase > 1 && M['phase' + ch.phase], face = (PH && PH.face) || M.face;
    if (face) { // 頭だけの 絵 (すがたが かわると その 顔)
      const P = pic(face);
      if (!P.im.naturalWidth) return;
      const w = size * 1.2, h = (w * P.im.naturalHeight) / P.im.naturalWidth;
      ctx.drawImage(tinted(P, o), cx - w / 2, cy - h * 0.62, w, h);
      return;
    }
    if (ch.monster === 'kikorioni') {
      ctx.save(); ctx.translate(cx, cy); const k = size / 1.05; ctx.scale(k, k); ctx.translate(0, 0.85);
      oniBody(ctx, oniCols(o), o, 1.3, false); ctx.restore(); return;
    }
    if (ch.monster === 'hakairyu') {
      ctx.save(); ctx.translate(cx, cy); const k = size / 1.2; ctx.scale(k, k); ctx.translate(0.3, 1.75);
      dragonHead(ctx, dragonCols(o), o, 0); ctx.restore(); return;
    }
    const fur = tone(FUR, o), dark = tone(FUR_D, o), belly = tone(BELLY, o), spk = tone(SPIKE, o), claw = tone(CLAW, o);
    ctx.save();
    ctx.translate(cx, cy);
    const k = size / 1.15;
    ctx.scale(k, k);
    ctx.translate(0, 1.72);
    drawHead(ctx, { fur, dark, belly, spk, claw, out: C.str(C.dark(fur, 0.6), 0.7) }, o);
    ctx.restore();
  };

  // 全身の 小さな絵 (コロシアムの 一覧)
  const thumbCache = new Map();
  NS.monsterThumb = function (ch, w, h) {
    const key = ch.monster + '|' + w + 'x' + h;
    if (thumbCache.has(key)) return thumbCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = h * 2;
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    const s = (h * 0.92) / (ch.height || 2.4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.965, s * 0.6, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    NS.drawMonster(ctx, w / 2, h * 0.96, s, ch, { t: 1.3 });
    const url = cv.toDataURL();
    thumbCache.set(key, url);
    return url;
  };
})();
