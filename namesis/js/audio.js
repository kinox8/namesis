// 効果音 (WebAudio で合成) と BGM (audio/ の 音声ファイル)
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  let ac = null, master = null, noiseBuf = null;
  NS.sound = { on: true, se: 1, bgm: 1 }; // se・bgm = 音量 (0〜1)

  function ensure() {
    if (!NS.sound.on) return null;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.32 * NS.sound.se;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol = 0.3, freq = 1200, q = 1, delay = 0, type = 'bandpass') {
    const t0 = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; // 0.6秒より 長い 音も とぎれない
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  const SFX = {
    select: () => tone(880, 0.05, 'square', 0.12),
    confirm: () => { tone(660, 0.06, 'square', 0.14); tone(990, 0.08, 'square', 0.14, 0, 0.05); },
    cancel: () => tone(330, 0.08, 'square', 0.12, 0.7),
    hit: () => { noise(0.12, 0.5, 900, 0.8); tone(140, 0.12, 'sine', 0.4, 0.5); },
    crit: () => { noise(0.2, 0.6, 1400, 0.6); tone(220, 0.2, 'sawtooth', 0.3, 0.4); tone(880, 0.12, 'square', 0.15, 1.5, 0.02); },
    miss: () => noise(0.18, 0.25, 2400, 2, 0, 'highpass'),
    whoosh: () => noise(0.15, 0.18, 1600, 1.5),
    fire: () => { noise(0.35, 0.35, 600, 0.6, 0, 'lowpass'); tone(200, 0.3, 'sawtooth', 0.12, 0.6); },
    water: () => { for (let i = 0; i < 5; i++) tone(500 + Math.random() * 600, 0.06, 'sine', 0.15, 1.6, i * 0.04); },
    ice: () => { for (let i = 0; i < 4; i++) tone(1800 + i * 300, 0.1, 'triangle', 0.1, 1.1, i * 0.035); },
    wind: () => noise(0.4, 0.3, 900, 3),
    earth: () => { noise(0.35, 0.5, 200, 0.7, 0, 'lowpass'); tone(80, 0.3, 'sine', 0.5, 0.5); },
    thunder: () => { noise(0.45, 0.6, 3000, 0.3, 0, 'highpass'); tone(60, 0.4, 'sawtooth', 0.3, 0.5); },
    light: () => { [880, 1108, 1320, 1760].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, 1, i * 0.04)); },
    dark: () => { tone(110, 0.45, 'sawtooth', 0.2, 0.5); tone(116, 0.45, 'sawtooth', 0.15, 0.5); },
    heal: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'sine', 0.16, 1, i * 0.06)); },
    buff: () => { [392, 523, 659].forEach((f, i) => tone(f, 0.12, 'square', 0.1, 1, i * 0.05)); },
    debuff: () => { [659, 523, 392].forEach((f, i) => tone(f, 0.12, 'square', 0.1, 1, i * 0.05)); },
    status: () => tone(300, 0.3, 'triangle', 0.2, 0.5),
    charge: () => tone(300, 0.3, 'sine', 0.15, 2.5),
    ko: () => { tone(400, 0.4, 'square', 0.15, 0.3); },
    delete: () => { for (let i = 0; i < 8; i++) tone(1200 - i * 120, 0.05, 'square', 0.1, 1, i * 0.04); noise(0.5, 0.3, 500, 1, 0.3); },
    win: () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i === 5 ? 0.5 : 0.14, 'square', 0.13, 1, i * 0.12)); },
    lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, 1, i * 0.22)); },
    cheer: () => noise(1.2, 0.12, 1500, 0.4),
    reveal: () => tone(1320, 0.08, 'triangle', 0.12),
    // 全体・最大の 属性スキル (大技) の 音 (約1.5秒)
    grand_dark: () => { noise(1.6, 0.55, 160, 0.7, 0, 'lowpass'); tone(90, 1.4, 'sawtooth', 0.22, 0.4); tone(95, 1.4, 'sawtooth', 0.16, 0.45); for (let i = 0; i < 6; i++) noise(0.12, 0.35, 3200, 0.5, 0.15 + i * 0.18, 'highpass'); },
    grand_thunder: () => { for (const d of [0, 0.35, 0.7, 1.0]) { noise(0.5, 0.65, 2600, 0.3, d, 'highpass'); tone(55, 0.6, 'sawtooth', 0.3, 0.5, d); } noise(1.6, 0.4, 120, 0.6, 0.05, 'lowpass'); },
    grand_fire: () => { noise(1.6, 0.5, 700, 0.5, 0, 'bandpass'); noise(1.5, 0.45, 220, 0.6, 0.1, 'lowpass'); tone(120, 1.2, 'sawtooth', 0.15, 0.5); for (let i = 0; i < 8; i++) noise(0.08, 0.25, 4000, 1, 0.1 + i * 0.16, 'highpass'); },
    grand_water: () => { noise(1.7, 0.5, 400, 0.4, 0, 'lowpass'); noise(1.2, 0.35, 1400, 0.6, 0.3, 'bandpass'); for (let i = 0; i < 10; i++) tone(400 + Math.random() * 900, 0.08, 'sine', 0.13, 1.8, 0.2 + i * 0.12); },
    grand_ice: () => { for (let i = 0; i < 10; i++) tone(1500 + (i % 5) * 320, 0.25, 'triangle', 0.1, 1.05, i * 0.1); noise(0.6, 0.45, 5000, 0.4, 0.55, 'highpass'); noise(1.2, 0.25, 900, 2, 0.1, 'bandpass'); },
    grand_wind: () => { for (let i = 0; i < 6; i++) noise(0.7, 0.32, 500 + i * 260, 4, i * 0.17, 'bandpass'); noise(1.6, 0.2, 1200, 0.8, 0, 'bandpass'); },
    grand_earth: () => { noise(1.8, 0.7, 140, 0.6, 0, 'lowpass'); tone(48, 1.6, 'sine', 0.55, 0.6); for (const d of [0.25, 0.6, 0.95]) noise(0.4, 0.5, 500, 0.5, d, 'lowpass'); },
    grand_heaven: () => { // ゴーヘブン: 天の 和音が 2回 かさなって、さいごに 大きく はじける
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 2.2, 'triangle', 0.1, 1, i * 0.06));
      [392, 494, 587, 784].forEach((f, i) => tone(f, 1.8, 'sine', 0.12, 1, 0.5 + i * 0.04));
      for (let i = 0; i < 18; i++) tone(1600 + Math.random() * 2400, 0.14, 'sine', 0.07, 1.2, 0.15 + i * 0.08);
      noise(2.0, 0.22, 6000, 0.5, 0.1, 'highpass'); noise(0.9, 0.5, 200, 0.8, 1.45, 'lowpass'); tone(65, 1.0, 'sawtooth', 0.2, 0.3, 1.45);
    },
    grand_light: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 1.3, 'triangle', 0.11, 1, i * 0.05)); for (let i = 0; i < 10; i++) tone(1800 + Math.random() * 1600, 0.12, 'sine', 0.08, 1.2, 0.2 + i * 0.11); noise(1.2, 0.18, 6000, 0.5, 0.1, 'highpass'); },
    rare: () => { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.2, 'triangle', 0.13, 1, i * 0.07)); },
  };

  // ---------------- BGM (音声ファイル) ----------------
  // loop: intro のあと loopStart 〜 曲の 終わり を くりかえす (ループ点は 曲の 終わりと 波形が つながる 位置)
  //   loopLen: 音の 出はじめ から loopLen 秒を くりかえす (小節の 長さぴったり。終わりの 余韻は 使わない)
  // 曲の はじめの 無音は 読みこみの ときに しらべて とばす。vol = 曲ごとの 大きさ (ブラウザ 100% で ちょうど よく)
  const BGM = {
    battle: { src: 'audio/battle.mp3', loop: true, loopStart: 5.856, vol: 0.2 }, // ボス 以外の 対戦
    boss: { src: 'audio/boss.mp3', loop: true, loopStart: 7.2949, vol: 0.27 },
    boss3: { src: 'audio/boss3.mp3', loop: true, loopStart: 12.337, vol: 0.27 }, // はかいりゅう
    shinako: { src: 'audio/shinako.mp3', loop: true, loopLen: 15, vol: 0.27 }, // しなこ: 128BPM の 8小節
    maou: { src: 'audio/maou.mp3', loop: true, loopStart: 7.0364, vol: 0.27 }, // まおう (DemonKingBgm)
    lastboss: { src: 'audio/lastboss.mp3', loop: true, loopStart: 16.15, loopEnd: 97.8163, vol: 0.2 }, // じゃあくのまじょ (LastBossBattleMgm): 1:37.8 で 0:16.15 に もどる (波形から さがした ループ点)
    fanfare: { src: 'audio/fanfare.mp3', loop: false, vol: 0.3 },
    lastfanfare: { src: 'audio/lastfanfare.mp3', loop: false, vol: 0.3 }, // アビスを たおしたとき (LastFanfare)
  };
  // サウンドトラック (タイトルの ボタン) に 出す 曲の 名前
  NS.BGM_LIST = [
    ['battle', 'バトル', 'ふつうの 対戦'], ['boss', 'ボスバトル', 'きこりおに・シールドナイト・ウルフベア'],
    ['boss3', 'はかいりゅう', 'はかいりゅうとの バトル'], ['maou', 'まおう', 'まおうとの バトル'],
    ['lastboss', 'じゃあくのまじょ', 'じゃあくのまじょとの バトル'],
    ['shinako', 'しなこ', 'イベントクエスト'], ['fanfare', 'ファンファーレ', 'ボスに 勝ったとき'], ['lastfanfare', 'ラストファンファーレ', 'アビスに 勝ったとき'],
  ];
  // 音声ファイルの 効果音 (SE の 音量で 鳴る)。ファイルが ないときは 合成の 音 (alt) で 鳴らす
  const SE_FILES = {
    getItem: { src: 'audio/get_item.mp3', vol: 0.4, alt: 'rare' },   // おの などを 手に入れた
    skillElem: { src: 'audio/skill_attr.mp3', vol: 0.35, alt: 'charge' }, // 属性スキルを 使った
    lose: { src: 'audio/battle_lose.mp3', vol: 0.35, alt: 'lose' },  // ボス 以外に 負けた
    bossLose: { src: 'audio/boss_lose.mp3', vol: 0.28, alt: 'lose' }, // ボスに 負けた
  };
  const bufs = {};
  let bgmNow = null, bgmWant = null;
  // 音の 出はじめ (秒)
  function firstSound(buf) {
    const n = buf.length, chs = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    for (let i = 0; i < n; i++) for (const d of chs) if (Math.abs(d[i]) > 0.003) return i / buf.sampleRate;
    return 0;
  }
  function loadBuf(src) {
    if (!bufs[src]) {
      bufs[src] = fetch(src).then((r) => { if (!r.ok) throw new Error(src); return r.arrayBuffer(); })
        .then((a) => ac.decodeAudioData(a)).then((buf) => { const first = firstSound(buf); return { buf, first, offset: Math.max(0, first - 0.01) }; }); // offset = はじめの 無音を とばす 位置
      bufs[src].catch(() => { /* ない ファイルは 合成の 音に */ });
    }
    return bufs[src];
  }
  const loadBgm = (name) => loadBuf(BGM[name].src);
  NS.bgm = {
    // 先に 読みこんでおく (暗転した 瞬間に すぐ 鳴らせるように)
    preload(name) { try { if (ensure()) loadBgm(name); } catch (e) { /* noop */ } },
    async play(name) {
      if (NS.bgm.onPlay) NS.bgm.onPlay(name); // サウンドトラックの「聴いたことが ある」
      bgmWant = BGM[name].loop ? name : null;
      if (bgmNow && bgmNow.name === name) return;
      NS.bgm.stop(0);
      bgmWant = BGM[name].loop ? name : null;
      try {
        if (!ensure()) return;
        const B = BGM[name], { buf, first } = await loadBgm(name);
        let { offset } = await loadBgm(name);
        if ((BGM[name].loop && bgmWant !== name) || (bgmNow && bgmNow.name === name) || !NS.sound.on) return;
        const src = ac.createBufferSource(), g = ac.createGain();
        src.buffer = buf;
        if (B.loop && B.loopLen) { src.loop = true; src.loopStart = first; src.loopEnd = Math.min(buf.duration, first + B.loopLen); offset = first; }
        else if (B.loop) { src.loop = true; src.loopStart = B.loopStart; src.loopEnd = B.loopEnd ? Math.min(buf.duration, B.loopEnd) : buf.duration; } // loopEnd = 曲の とちゅうで もどる
        g.gain.value = BGM[name].vol * NS.sound.bgm;
        src.connect(g).connect(ac.destination);
        src.start(0, offset); // はじめの 無音を とばす
        const now = { name, src, g };
        bgmNow = now;
        src.onended = () => { if (bgmNow === now) bgmNow = null; };
      } catch (e) { /* BGM が 鳴らなくても ゲームは 続ける */ }
    },
    playing() { return bgmNow ? bgmNow.name : null; },
    // name の 曲が 終わるまで まつ (鳴っていなければ すぐ)
    until(name) {
      return new Promise((res) => {
        const check = () => (bgmNow && bgmNow.name === name ? setTimeout(check, 100) : res());
        check();
      });
    },
    // fade 秒で 小さくして 止める
    stop(fade = 0.8) {
      bgmWant = null;
      if (!bgmNow) return;
      const { src, g } = bgmNow;
      bgmNow = null;
      try {
        const t = ac.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.01, fade));
        src.stop(t + Math.max(0.01, fade) + 0.05);
      } catch (e) { /* noop */ }
    },
    // 音の オン/オフ・音量を 変えたとき
    refresh() {
      if (master) master.gain.value = 0.32 * NS.sound.se;
      if (!NS.sound.on) { const w = bgmWant; NS.bgm.stop(0.2); bgmWant = w; return; }
      if (bgmNow) { bgmNow.g.gain.value = BGM[bgmNow.name].vol * NS.sound.bgm; return; }
      if (bgmWant) NS.bgm.play(bgmWant);
    },
  };

  // 音声ファイルの 効果音を 先に 読みこむ
  NS.sfxPreload = function (...names) {
    try { if (ensure()) for (const n of names) if (SE_FILES[n]) loadBuf(SE_FILES[n].src); } catch (e) { /* noop */ }
  };
  async function playFile(name) {
    const F = SE_FILES[name];
    try {
      const { buf, offset } = await loadBuf(F.src);
      if (!NS.sound.se || !NS.sound.on) return;
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf;
      g.gain.value = F.vol * NS.sound.se;
      src.connect(g).connect(ac.destination);
      src.start(0, offset); // はじめの 無音を とばす
    } catch (e) { SFX[F.alt](); }
  }

  NS.sfx = function (name) {
    try {
      if (!NS.sound.se || !ensure()) return;
      if (SE_FILES[name]) { playFile(name); return; }
      (SFX[name] || SFX.select)();
    } catch (e) { /* 音が鳴らなくてもゲームは続ける */ }
  };
})();
