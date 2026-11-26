// バトル本体: ユニット・行動順・ダメージ計算・属性相性・状態異常・AI・演出の進行
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});
  // 演出・AI 用の乱数。勝敗に関わる乱数は バトルごとの this.rnd (シード付き) を使う
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const best = (arr, f) => arr.reduce((a, b) => (f(b) > f(a) ? b : a));

  const CAM_DEFAULT = { yaw: 0, pitch: 0.29, dist: 9.8, tx: 0, ty: 0.5, tz: -0.2 };
  NS.CAM_DEFAULT = CAM_DEFAULT;
  NS.ELEM_BASE = 200; // 属性スキルの 基本ダメージ (威力 1.0・防御 0 の相手)

  // 能力ダウンの 段階ごとの 倍率 (1段 −15% / 2段 −35% / 3段 −55% / 4段 −75% / 5段 −95%)
  const DOWN_MUL = [0.85, 0.65, 0.45, 0.25, 0.05];
  NS.DOWN_MUL = DOWN_MUL;

  class Unit {
    constructor(ch, side, idx, x, z) {
      this.ch = ch; this.name = ch.name; this.side = side; this.idx = idx;
      this.maxHp = ch.stats.hp; this.hp = this.maxHp; this.dispHp = this.hp;
      this.maxMp = ch.stats.mp; this.mp = this.maxMp;
      this.buffs = { atk: 0, def: 0, spd: 0, eva: 0 };
      this.buffT = { atk: 0, def: 0, spd: 0, eva: 0 };
      this.status = {};
      this.guard = false; this.alive = true; this.dealt = 0;
      this.charge = 0; // たくわえる の 段階 (1 = ×2 / 2 = ×4 / 3 = ×8)。1回 攻撃すると 0 に もどる
      this.home = { x, z };
      this.facing = side === 'party' ? Math.PI : 0;
      this.v = { x, z, ox: 0, oy: 0, oz: 0, face: this.facing, squash: 0, flash: 0, lie: 0, lieDir: Math.random() < 0.5 ? -1 : 1,
        alpha: 1, gray: 0, expr: null, glow: 0, glowElem: null, armRaise: 0, step: 0, antennaKick: 0, idle: true, hidden: false };
    }
    // スキルの MP。最大MP が 足りない スキルは、MP 満タンで 全部 使えば 使える (みんなふっかつ など)
    cost(sk) { return Math.min(NS.mpCost(this.ch, sk), this.maxMp); } // まじょのぼうし: 30% 節約
    get pos() { return { x: this.v.x + this.v.ox, y: this.v.oy, z: this.v.z + this.v.oz }; }
    center(h = 0.6) { const p = this.pos; return { x: p.x, y: p.y + h * (this.ch.monster ? 2 : 1), z: p.z }; }
    stat(k) {
      let v = this.ch.stats[k];
      const st = this.buffs[k] || 0;
      if (k === 'eva') {
        v += st * 10; // みんなかわしやすい: 1段ごとに +10% (重ねがけ 5段まで)
        if (this.status.sleep) v = 0;
        return Math.max(0, v);
      }
      v *= st >= 0 ? 1 + 0.5 * st : DOWN_MUL[-st - 1]; // 上げる: 1段 ×1.5、2段 ×2.0 … 5段 ×3.5 / 下げる: 1段 −15% … 5段 −95%
      return v;
    }
  }
  NS.Unit = Unit;

  // 横一列に並ぶ。人数が多いときは 間隔をつめて 画面に収める
  NS.formation = function (n, side) {
    const sgn = side === 'party' ? 1 : -1;
    const sp = n <= 1 ? 0 : Math.min(1.6, 8.6 / (n - 1));
    return Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * sp, z: sgn * 3.0 }));
  };

  function msg(text) { NS.ui && NS.ui.message(text); }
  const elemName = (e) => NS.ELEMENTS[e].name;

  class Battle {
    constructor(partyChars, enemyChars, opts = {}) {
      const pf = NS.formation(partyChars.length, 'party');
      const ef = NS.formation(enemyChars.length, 'enemy');
      this.party = partyChars.map((c, i) => new Unit(c, 'party', i, pf[i].x, pf[i].z));
      this.enemies = enemyChars.map((c, i) => new Unit(c, 'enemy', i, ef[i].x, ef[i].z));
      // コロシアムの敵は 本当の名前を かくして 仮の名前で呼ぶ (名前を覚えて なかまにできないように)
      if (opts.aliases) this.enemies.forEach((u, i) => { u.name = opts.aliases[i]; u.alias = true; });
      this.opts = opts;
      // 勝敗に関わる乱数は シード付き。オンライン対戦では 2人が 同じシード・同じコマンドで 同じバトルを 再生する
      this.online = opts.online || null;
      const rng = new NS.RNG('NAMESIS/battle:' + (opts.seed != null ? opts.seed : Math.random()));
      this.rnd = () => rng.next();
      this.turn = 0;
      this.over = false;
      this.result = null;
    }
    // 全員の並び (オンラインでは 部屋をつくった側が先。2人の画面で 乱数を引く順番を そろえる)
    get units() { return this.online && this.online.role === 'p2' ? this.enemies.concat(this.party) : this.party.concat(this.enemies); }
    R(a, b) { return a + this.rnd() * (b - a); }
    pick(arr) { return arr[Math.floor(this.rnd() * arr.length)]; }
    alliesOf(u) { return u.side === 'party' ? this.party : this.enemies; }
    foesOf(u) { return u.side === 'party' ? this.enemies : this.party; }
    alive(list) { return list.filter((x) => x.alive); }

    checkEnd() {
      if (this.over) return true;
      const e = this.enemies.some((x) => x.alive), p = this.party.some((x) => x.alive);
      if (!e && !p && this.online) { this.over = true; this.result = 'draw'; } // 同時に全滅 (2人の画面で 結果が食いちがわないように)
      else if (!e) { this.over = true; this.result = 'win'; }
      else if (!p) { this.over = true; this.result = 'lose'; }
      return this.over;
    }

    // ---------------- 進行 ----------------
    async run() {
      NS.scene.units = this.units;
      NS.scene.battle = this;
      await this.intro();
      while (!this.over) {
        this.turn++;
        NS.ui.setTurn(this.turn);
        NS.setRig(CAM_DEFAULT, 2.2);
        NS.ui.message(''); // 前の ターンの 文字を 消す
        const cmds = await NS.ui.collectCommands(this);
        if (this.online && !this.online.npc) {
          if (cmds.escape) { await this.online.surrender(); this.over = true; this.result = 'lose'; this.endReason = 'surrender'; break; }
          const foe = await this.online.exchange(this, cmds); // あいての コマンドを まつ
          if (foe.end) { this.over = true; this.result = foe.end; this.endReason = foe.reason; break; }
          if (foe.npc) { // あいてが 切断した → ここからは NPC が あいての かわりに たたかう
            this.online.npc = true;
            NS.ui.toast('あいてが 切断した! ここからは NPC が たたかう', 2600);
            this.planSmart(this.alive(this.enemies)).forEach((c, e) => cmds.set(e, c));
          } else foe.cmds.forEach((c, e) => cmds.set(e, c));
        } else if (this.online) { // NPC 戦
          if (cmds.escape) { this.over = true; this.result = 'lose'; this.endReason = 'surrender'; break; }
          this.planSmart(this.alive(this.enemies)).forEach((c, e) => cmds.set(e, c));
        } else {
          if (cmds.escape) { this.over = true; this.result = 'escape'; break; }
          // 名のある軍団は がんばれ と同じ かしこい作戦で戦う
          if (this.opts.smartEnemies) this.planSmart(this.alive(this.enemies)).forEach((c, e) => cmds.set(e, c));
          else for (const e of this.enemies) if (e.alive) cmds.set(e, this.ai(e));
        }
        // みりょう (ハートの頭・桃色) は 毎ターン コマンドを えらび終えた あとに 抽選
        await this.charmPhase();
        await this.executeTurn(cmds);
        if (!this.over) await this.endOfTurn();
      }
      await this.outro();
      return this.result;
    }

    async intro() {
      NS.ui.message(this.opts.intro || this.opts.title || 'バトル スタート!');
      for (const u of this.units) { u.v.oy = 7 + Math.random() * 2; u.v.hidden = true; }
      NS.snapRig({ yaw: -0.9, pitch: 0.55, dist: 15, tx: 0, ty: 1, tz: -1 });
      NS.setRig(CAM_DEFAULT, 1.4);
      const drop = async (u, delay) => {
        await NS.wait(delay);
        u.v.hidden = false;
        const y0 = u.v.oy;
        await NS.anim(380, (e) => (u.v.oy = y0 * (1 - e)), 'in');
        u.v.oy = 0;
        NS.spawn({ type: 'ring', x: u.v.x, y: 0, z: u.v.z, color: '#ffe6b0', size: 0.4, life: 0.4, grow: 2 });
        NS.sfx('select');
        await NS.anim(160, (e, p) => (u.v.squash = Math.sin(p * Math.PI) * 0.25));
        u.v.squash = 0;
      };
      const all = [];
      this.enemies.forEach((u, i) => all.push(drop(u, 100 + i * 90)));
      this.party.forEach((u, i) => all.push(drop(u, 500 + i * 90)));
      await Promise.all(all);
      NS.crowdExcite = 1;
      if (!NS.arenaTheme) NS.sfx('cheer'); // どうくつ・地獄には 観客が いない
      await NS.wait(1100); // 登場の 文字 (ボス: 「きこりおにの 登場だ!」) を 少し 見せる
      NS.ui.message('');
    }

    // みりょう: 敵それぞれへ判定。みりょうされると そのターンは動けない
    async charmPhase() { // みりょう・きょうふ (シルクハット) 持ちが 何人いても 一斉に かかる
      let any = false;
      for (const [key, word] of [['charm', 'みりょう'], ['fear', 'にらみ']]) {
        if (this.over) break;
        const taken = new Set(), casts = [];
        for (const u of this.units) { // 抽選は 先に まとめて (同じ 敵は 1回だけ)
          if (!u.alive || !u.ch[key]) continue;
          const hits = this.alive(this.foesOf(u)).filter((f) => !f.status[key] && !taken.has(f) && this.rnd() < this.statusChance(f, key, u.ch[key]));
          hits.forEach((f) => taken.add(f));
          if (hits.length) casts.push({ u, hits });
        }
        if (!casts.length) continue;
        any = true;
        const all = casts.flatMap((c) => c.hits), st = NS.STATUS[key].name;
        msg(`${casts.map((c) => c.u.name).join('と ')}の ${word}!`);
        this.focusCam(casts[0].u, all[0]);
        NS.sfx('status');
        casts.forEach((c) => (c.u.v.expr = 'happy'));
        // 簡素に: 飛ばす ハートや はねる 動きは なし。かかった 敵に はじけを 1回ずつ (多くても 4体ぶん)
        all.forEach((f, i) => { if (i < 4) NS.impact(key === 'charm' ? 'charm' : 'dark', f.center(0.8)); this.setStatus(f, key, 1); });
        msg(all.length === 1 ? `${all[0].name}は ${st}に なった!` : `${all.length}人が ${st}に なった!`);
        await NS.wait(600);
        casts.forEach((c) => (c.u.v.expr = null));
      }
      if (any) { NS.ui.message(''); NS.setRig(CAM_DEFAULT, 2.5); }
    }

    // 3体攻撃: ねらった相手と、その近くの2体
    threeTargets(main, pool) { return this.nearTargets(main, pool, 3); }
    // ねらった 相手と、その近くの (n − 1) 体
    nearTargets(main, pool, n) {
      const alive = this.alive(pool);
      if (!main || !main.alive) main = alive[0];
      if (!main) return [];
      const d = (x) => Math.hypot(x.home.x - main.home.x, x.home.z - main.home.z);
      return [main].concat(alive.filter((x) => x !== main).sort((a, b) => d(a) - d(b)).slice(0, n - 1));
    }

    async outro() {
      NS.ui.message('');
      const winners = this.result === 'win' ? this.party : this.result === 'lose' ? this.enemies : [];
      const MW = this.enemies[0] && this.enemies[0].ch.monster && NS.MONSTERS[this.enemies[0].ch.monster]; // アビス: 専用の ファンファーレ
      if (this.result === 'win') { if (this.opts.bossBattle) NS.bgm.play((MW && MW.winBgm) || 'fanfare'); else NS.sfx('win'); NS.crowdExcite = 1.4; } // ボスを たおしたら ファンファーレ
      else if (this.result === 'lose') NS.sfx(this.opts.bossBattle ? 'bossLose' : 'lose');
      // 勝った側を正面から映す (味方は奥を向いているので、カメラが回り込む)
      if (this.result === 'win') NS.setRig({ yaw: Math.PI + 0.3, pitch: 0.2, dist: 8, tx: 0, ty: 0.7, tz: 3 }, 1.2);
      else NS.setRig({ yaw: -0.3, pitch: 0.2, dist: 8, tx: 0, ty: 0.7, tz: -3 }, 1.2);
      for (const u of winners) if (u.alive) { u.v.expr = 'happy'; u.celebrate = true; }
      if (this.result === 'win') NS.confetti(0, 3);
      if (this.result === 'win' && !NS.arenaTheme) NS.sfx('cheer');
      await NS.wait(this.result === 'win' || this.result === 'lose' ? 2200 : 1800);
    }

    async executeTurn(cmds) {
      const order = [];
      for (const u of this.units) {
        const cmd = cmds.get(u);
        if (!cmd || !u.alive) continue;
        const times = cmd.type === 'monster' ? u.ch.actions || 1 : 1;
        // 行動順 = 素早さ × 0.9〜1.1。モンスターは 1回ぶんの 順番で 続けて 何回も 動く
        const r = this.R(0.9, 1.1); // ゆらぎは ターンの はじめに 決める (素早さは 動く たびに 今の 値で 見なおす)
        const sp = cmd.type === 'guard' ? 1e9 : u.stat('spd') * r;
        for (let k = 0; k < times; k++) order.push({ u, cmd, r, k, sp: sp - k * 1e-6 });
      }
      order.sort((a, b) => b.sp - a.sp);

      // ぼうぎょは ターンの最初に まとめて
      const guards = order.filter((o) => o.cmd.type === 'guard' && !this.cannotAct(o.u));
      if (guards.length) {
        for (const o of guards) {
          o.u.guard = true;
          const gain = Math.min(2, o.u.maxMp - o.u.mp);
          o.u.mp += gain;
          NS.popup(o.u.pos.x, 1.35, o.u.pos.z, 'ぼうぎょ', '#9fd0ff');
          NS.spawn({ type: 'ring', x: o.u.pos.x, y: 0, z: o.u.pos.z, color: '#9fd0ff', size: 0.45, life: 0.5, grow: 1.2 });
        }
        NS.sfx('buff');
        NS.ui.refreshCards();
        await NS.wait(450);
      }

      const groupDone = new Set(); // そうこうげきは 陣営ごとに 1回
      for (let oi = 0; oi < order.length; oi++) {
        // まだ 動いていない 人を 今の 素早さで 並べなおす (みんなかぜになれ・のろのろ が すぐ 効く)
        if (!(oi > 0 && order[oi - 1].cmd.type === 'monster' && order[oi].u === order[oi - 1].u)) { // モンスターの 連続行動の 途中は そのまま
          const rest = order.slice(oi).map((x) => Object.assign(x, { sp: x.cmd.type === 'guard' ? 1e9 : x.u.stat('spd') * x.r - x.k * 1e-6 }));
          rest.sort((a, b) => b.sp - a.sp);
          order.splice(oi, rest.length, ...rest);
        }
        const o = order[oi];
        if (this.over) break;
        if (!o.u.alive) continue;
        if (this.cannotAct(o.u)) { // みりょう・ねむり・まひ中は 何を選んでいても 動けない
          NS.ui.setActive(o.u);
          await this.act(o.u, o.cmd);
          NS.ui.setActive(null);
          continue;
        }
        if (o.cmd.type === 'guard') continue;
        if (o.cmd.group) {
          if (groupDone.has(o.u.side)) continue;
          groupDone.add(o.u.side);
          const members = order.filter((x) => x.cmd.group && x.u.side === o.u.side && x.u.alive && !this.cannotAct(x.u)).map((x) => x.u);
          await this.groupAttack(members, o.cmd.target);
        } else {
          NS.ui.setActive(o.u);
          await this.act(o.u, o.cmd);
          NS.ui.setActive(null);
        }
        this.checkEnd();
        // モンスターの 連続行動は 間を あけずに 続ける (カメラも そのまま)
        if (o.cmd.type === 'monster' && order[oi + 1] && order[oi + 1].u === o.u) continue;
        NS.setRig(CAM_DEFAULT, 2.2);
        if (!this.over) await NS.wait(320); // 行動と行動のあいだに 一呼吸
      }
    }

    async endOfTurn() {
      const DOT = { poison: 0.2, burn: 0.05, soak: 0.05, frost: 0.05, cold: 0.05, mud: 0.05, shock: 0.05, curse: 0.05 };
      let any = false;
      const kos = [];
      for (const u of this.units) {
        if (!u.alive) continue;
        u.guard = false;
        const reg = NS.mpRegen(u.ch); // まじょのローブ: 毎ターン MP 回復
        if (reg && u.mp < u.maxMp) { u.mp = Math.min(u.maxMp, u.mp + reg); NS.popup(u.pos.x, 1.0, u.pos.z, 'MP+' + reg, '#7ac8ff'); any = true; }
        let dmg = 0;
        for (const k in DOT) if (u.status[k]) dmg += Math.max(1, Math.round(u.maxHp * DOT[k]));
        if (dmg) {
          any = true;
          u.hp = Math.max(0, u.hp - dmg);
          NS.popup(u.pos.x, 1.3, u.pos.z, dmg, '#d58cff');
          this.hitReact(u, 0.5);
          if (u.hp <= 0) kos.push(u);
        }
        if (u.status.fear) { delete u.status.fear; NS.popup(u.pos.x, 1.6, u.pos.z, 'きょうふ 回復', '#bfffd0'); } // きょうふは ターンが 終わると かならず なおる
        for (const k of Object.keys(u.status)) {
          if (['poison', 'charm', 'fear', 'sleep', 'paralyze'].includes(k)) continue; // どくは たおれるまで。みりょう・ねむり・まひは 動けなかった回数で減る
          u.status[k]--;
          if (u.status[k] <= 0) {
            delete u.status[k];
            NS.popup(u.pos.x, 1.6, u.pos.z, NS.STATUS[k].name + ' 回復', '#bfffd0');
          }
        }
        for (const k in u.buffT) {
          if (u.buffT[k] > 0 && --u.buffT[k] === 0) u.buffs[k] = 0;
        }
        if (u.mp < u.maxMp) u.mp += 1;
      }
      NS.ui.refreshCards();
      if (any) { NS.sfx('status'); await NS.wait(900); }
      for (const u of kos) await this.ko(u);
      NS.ui.message(''); // ターンが 終わったら 文字を 消す
      this.checkEnd();
    }

    // ---------------- 行動 ----------------
    // このターンに 動けないか (選んだコマンドに関係なく)
    cannotAct(u) {
      return !!(u.status.charm || u.status.fear || u.status.sleep || u.status.paralyze || u.wokeTurn === this.turn);
    }

    // キャッスルの頭・たて: 味方への 攻撃を 30% で かばう (動ける なかまだけ。順番に 判定)
    //   1体攻撃 → ねらわれた 味方の 前に 出て 受ける / 3体・全体 → 味方の 一歩前に 出て ぜんぶ 受ける
    //   かばったら { g: かばう なかま, n: 受ける 攻撃の数 }
    async cover(u, targets) {
      const list = targets.filter(Boolean);
      if (!list.length) return null;
      const single = list.length === 1;
      for (const g of this.alive(this.alliesOf(list[0]))) {
        // キャッスルの頭 (30%) と たて (30%) は 足し算 (両方で 60%)
        const ph = (NS.HEADS.find((h) => h.key === g.ch.head).effect || {}).cover || 0, pe = NS.equipCover(g.ch);
        const p = Math.min(1, ph + pe);
        if (!p || this.cannotAct(g) || list.every((t) => t === g)) continue;
        if (this.rnd() >= p) continue;
        msg(single ? `${g.name}が ${list[0].name}を かばった!` : `${g.name}が みんなを かばった!`);
        NS.popup(g.pos.x, 1.6, g.pos.z, 'かばう!', '#ffe08a');
        NS.sfx('select');
        if (single) { // ねらわれた 味方と 敵の あいだに 入る
          const a = u.pos, b = list[0].pos, d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          await this.runTo(g, b.x - ((b.x - a.x) / d) * 0.75, b.z - ((b.z - a.z) / d) * 0.75, 320);
        } else { // 味方の 列の 一歩前へ
          const fz = g.side === 'party' ? -1 : 1;
          const front = Math.max(...this.alive(this.alliesOf(g)).map((x) => x.home.z * fz)) * fz;
          await this.runTo(g, g.home.x, front + fz * 0.9, 320);
        }
        this.faceTo(g, u);
        g.v.expr = 'attack';
        await NS.wait(250);
        return { g, n: list.length };
      }
      return null;
    }
    // ---------------- モンスター ----------------
    // わざを えらぶ: ひっかく を 中心に、まとまっていれば ダイビング、多ければ アイスブレス (1ターンに 1回)。とどめを させるなら ひっかく
    monsterMove(u, foes) {
      const M = NS.MONSTERS[u.ch.monster];
      if (u.mvTurn !== this.turn) { u.mvTurn = this.turn; u.mvUsed = []; }
      const n = foes.length;
      const PH = u.phase > 1 && M['phase' + u.phase];
      const moves = PH ? PH.moves : M.moves; // まおう など: 第二形態の 技
      const w = moves.map((mv) => {
        if (mv.ult) return 0; // 大技は 魔力が たまったときだけ
        if (mv.dispel && !foes.some((f) => Object.values(f.buffs).some((b) => b > 0))) return 0; // 打ち消す 能力アップが ない
        if (mv.hpAbove && u.hp <= u.maxHp * mv.hpAbove) return 0; // HP が 半分を 切ると 使わない (氷山創造)
        if (mv.hpBelow && u.hp > u.maxHp * mv.hpBelow) return 0;  // HP が 半分を 切ったら 使う (レーザービーム)
        if (mv.area === 'three' && n < 2) return 0;
        if (mv.area === 'all' && (n < (mv.minFoes || 3) || (!mv.repeat && u.mvUsed.includes(mv.key)))) return 0; // 全体わざは 1ターンに 1回 (repeat の わざは 何回でも)
        if (mv.status && !foes.some((f) => !f.status[mv.status])) return 0;
        if (mv.kind === 'charge' && u.charge >= 2) return 0; // ためすぎない (×4 まで ためたら 攻撃)
        if (mv.kind === 'guardup' && u.buffs.def > 0) return 0; // まもりを かためている 間は かさねない
        let x = mv.w;
        if (mv.area === 'all') x += n >= 5 ? 2 : 0;
        if (mv.area === 'single' && foes.some((f) => f.hp <= this.monsterDamage(f, mv) * 0.9)) x += 3;
        return x;
      });
      let r = this.rnd() * w.reduce((a, b) => a + b, 0);
      let mv = moves[0];
      for (let i = 0; i < w.length; i++) { if ((r -= w[i]) < 0) { mv = moves[i]; break; } }
      u.mvUsed.push(mv.key);
      return mv;
    }
    // ねらう相手: 回復・ふっかつ役 → たおせる相手 (攻撃の高い順) → ランダム
    monsterAim(foes, mv) {
      const healer = foes.filter((f) => f.ch.skills.some((s) => s.kind === 'heal' || s.kind === 'revive'));
      if (healer.length && this.rnd() < 0.6) return this.pick(healer);
      const kill = foes.filter((f) => f.hp <= this.monsterDamage(f, mv) * 0.9).sort((a, b) => b.stat('atk') - a.stat('atk'));
      if (kill.length) return kill[0];
      return this.pick(foes);
    }
    // crit = 会心 (相手の 防御を 無視)
    monsterDamage(t, mv, crit) {
      // モンスターの 攻撃の 段階 (みんなよわよわ など) も 効く
      const m = this.units.find((x) => x.ch.monster && x.side !== t.side);
      const atkMul = m ? m.stat('atk') / m.ch.stats.atk : 1;
      return atkMul * (m && m.ch.dmgMul || 1) * (mv.base * 140) / (100 + (crit ? 0 : t.stat('def') * 0.5)) * this.elemMul(t, mv.elem) * (t.guard ? 0.5 : 1) * 2 ** (this.monsterCharge || 0);
    }
    // 大技までに ためる 魔力の 数 (0 = 魔力を ためない モンスター)。アビス: HP 30% を 切ると 2回
    manaNeed(u) {
      const M = NS.MONSTERS[u.ch.monster];
      if (!M || !M.mana) return 0;
      const PH = u.phase > 1 && M['phase' + u.phase];
      return PH && PH.manaLow && u.hp < u.maxHp * PH.manaLow[0] ? PH.manaLow[1] : M.mana;
    }
    async monsterAct(u) {
      const foes = this.alive(this.foesOf(u));
      if (!foes.length) return;
      const MM = NS.MONSTERS[u.ch.monster];
      if (MM.opening && !u.opened) { u.opened = true; return this.monsterSpeech(u, MM.opening); } // まおう: さいしょの 行動は セリフ
      const need = this.manaNeed(u);
      let mv;
      if (need && (u.mana || 0) >= need) { // 魔力が たまった: 大技を 解きはなつ
        u.mana = 0;
        const PH = u.phase > 1 && MM['phase' + u.phase];
        mv = (PH ? PH.moves : MM.moves).find((m) => m.ult);
        msg(`${u.name}の 魔力が 解きはなたれる!`);
        NS.setRig({ yaw: -0.25, pitch: 0.22, dist: 8.6, tx: u.pos.x * 0.6, ty: 1.4, tz: u.pos.z * 0.6 }, 2.6);
        NS.sfx('dark'); NS.magicCircle(u.pos, '#ff3aff', 1.2, 1.8);
        await NS.anim(700, (e, p) => { u.v.armRaise = e; u.v.flash = Math.sin(p * Math.PI * 4) * 0.3; NS.shake = Math.max(NS.shake, 0.15); });
        u.v.flash = 0;
      } else mv = this.monsterMove(u, foes);
      if (mv.kind === 'mana') return this.monsterMana(u, mv, need);
      if (mv.kind === 'wave') return this.monsterWave(u, mv, foes);
      if (mv.kind === 'roar') return this.monsterRoar(u, mv, foes);
      if (mv.kind === 'jagan') return this.monsterJagan(u, mv, foes);
      if (mv.kind === 'curse') return this.monsterCurse(u, mv, foes);
      if (mv.kind === 'heal') { // メンケアを している: 自分の HP を 回復
        msg(`${u.name}は ${mv.name}!`);
        NS.sfx('heal');
        await NS.anim(500, (e, p) => (u.v.squash = Math.sin(p * Math.PI * 2) * 0.05));
        u.v.squash = 0;
        const h = Math.min(u.maxHp - u.hp, mv.heal);
        u.hp += h;
        NS.healFx(u.pos);
        NS.popup(u.pos.x, 2.0, u.pos.z, '+' + h, '#7dff9a');
        NS.ui.refreshCards();
        await NS.wait(650);
        return;
      }
      if (mv.kind === 'guardup') { // まもりを かためている: 防御 +50% (次の ターンの 終わりまで)
        msg(`${u.name}は ${mv.name}!`);
        NS.sfx('buff');
        await NS.anim(500, (e) => { u.v.armRaise = e * 0.6; u.v.squash = 0.08 * e; });
        u.buffs.def = Math.min(5, u.buffs.def + 1);
        u.buffT.def = 2;
        NS.arrowFx(u.pos, true, '#ffc83a');
        NS.popup(u.pos.x, 2.0, u.pos.z, '防御↑', '#ffd24a');
        u.v.armRaise = 0; u.v.squash = 0;
        NS.ui.refreshCards();
        await NS.wait(600);
        return;
      }
      if (mv.kind === 'wait') { // マチョス: 機会を うかがっている (なにも しない)
        msg(`${u.name}の ${mv.name}!`);
        await NS.anim(600, (e, p) => (u.v.ox = Math.sin(p * Math.PI * 2) * 0.15));
        u.v.ox = 0;
        msg(`${u.name}は 機会を うかがっている…`);
        await NS.wait(700);
        return;
      }
      if (mv.kind === 'charge') { // 力を ためている: 次の 攻撃 ×2 (たくわえる と 同じ。重ねて ×4・×8)
        msg(`${u.name}は ${mv.name}!`);
        u.charge = Math.min(3, u.charge + 1);
        NS.sfx('charge'); NS.arrowFx(u.pos, true, '#ff9a3a');
        NS.popup(u.pos.x, 2.0, u.pos.z, `たくわえ ×${2 ** u.charge}`, '#ff9a3a', true);
        await NS.anim(600, (e, p) => { u.v.armRaise = Math.sin(p * Math.PI); u.v.squash = Math.sin(p * Math.PI * 4) * 0.05; });
        u.v.armRaise = 0; u.v.squash = 0;
        NS.ui.refreshCards();
        await NS.wait(300);
        return;
      }
      this.monsterCharge = u.charge; // ためた 力は この 攻撃で 使いきる
      if (u.charge) NS.popup(u.pos.x, 2.0, u.pos.z, `たくわえ ×${2 ** u.charge}!`, '#ff9a3a', true);
      u.charge = 0;
      let targets = mv.area === 'all' ? foes : mv.area === 'three' ? this.threeTargets(this.monsterAim(foes, mv), this.foesOf(u))
        : mv.area === 'five' ? this.nearTargets(this.monsterAim(foes, mv), this.foesOf(u), 5) : [this.monsterAim(foes, mv)];
      msg(/[!！]$/.test(mv.name) ? `${u.name}の ${mv.name}` : /た$/.test(mv.name) ? `${u.name}は ${mv.name}!` : `${u.name}の ${mv.name}!`);
      NS.sfx('charge');
      u.v.expr = 'attack';
      await NS.anim(380, (e) => { u.v.armRaise = e; u.v.squash = -0.06 * e; });
      const cv = await this.cover(u, targets);
      if (cv) targets = targets.map(() => cv.g); // かばった 1体が 1回ずつ 受ける
      const main = targets[0];
      if (mv.area === 'all') NS.setRig({ yaw: -0.3, pitch: 0.34, dist: 10.8, tx: 0, ty: 0.5, tz: 1.2 }, 2.6);
      else this.focusCam(u, main);
      this.faceTo(u, main);
      // 予備動作
      if (mv.kind === 'claw' || mv.kind === 'bash' || mv.kind === 'rush') { // 走りよって ひっかく / 盾で なぎはらう / 突進
        const a = u.pos, b = main.pos, d = Math.hypot(b.x - a.x, b.z - a.z) || 1, stop = Math.max(0, d - 1.3);
        await this.runTo(u, a.x + ((b.x - a.x) / d) * stop, a.z + ((b.z - a.z) / d) * stop, 380);
        await NS.anim(160, (e) => { u.v.squash = -0.1 * (1 - e) + 0.15 * e; });
        NS.sfx('whoosh');
      } else if (mv.kind === 'dive') { // とびあがって 3体の 上に のしかかる
        const a = u.pos, b = main.pos, d = Math.hypot(b.x - a.x, b.z - a.z) || 1, stop = Math.max(0, d - 0.9);
        const sx = u.v.ox, sz = u.v.oz, ex = a.x + ((b.x - a.x) / d) * stop - u.v.x, ez = a.z + ((b.z - a.z) / d) * stop - u.v.z;
        NS.sfx('whoosh');
        await NS.anim(520, (e, p) => {
          u.v.ox = NS.lerp(sx, ex, e); u.v.oz = NS.lerp(sz, ez, e);
          u.v.oy = Math.sin(p * Math.PI) * 2.6;
          u.v.lie = Math.sin(p * Math.PI) * 0.35; u.v.lieDir = (b.x >= a.x ? 1 : -1);
        });
        u.v.oy = 0; u.v.lie = 0;
        NS.shake = Math.max(NS.shake, 0.4);
        NS.dust(u.pos.x, u.pos.z, 14);
      } else if (mv.kind === 'wing') { // はねを 大きく はばたかせる
        NS.sfx('whoosh');
        await NS.anim(420, (e, p) => { u.v.squash = Math.sin(p * Math.PI * 3) * 0.08; });
      } else { // 大きく 息を すいこんで はく
        await NS.anim(420, (e) => { u.v.squash = -0.12 * e; });
        u.v.squash = 0;
      }
      u.v.squash = 0;
      const from = u.center(0.78);
      const M = NS.MONSTERS[u.ch.monster];
      let weakShown = false, resistShown = false, critShown = false;
      const one = async (t) => {
        if (!t.alive) return;
        const c = t.center(0.55);
        if (mv.kind === 'breath') await NS.projectile(from, c, mv.elem, 420, 0.25);
        else if (mv.kind === 'wing') await NS.projectile(from, c, mv.elem, 340, 0.15); // はねから とぶ 刃
        else if (mv.kind === 'iceberg') { NS.skyStrike('ice', c); await NS.wait(260); } // 空から 氷山が おちてくる
        else if (mv.kind === 'laser' || mv.kind === 'beam') await NS.projectile(from, c, 'light', 180, 0.02); // まっすぐ はやい ビーム
        else if (mv.kind === 'shot') await NS.projectile(from, c, 'light', 420, 0.5); // 光の 玉
        else if (mv.kind === 'swing') { NS.impact(null, c, true); await NS.wait(60); } // オノを ぐるりと ふりまわす
        if (!t.alive) return;
        if (!this.rollHit(u, t, mv.evaMul == null ? 1 : mv.evaMul)) { NS.popup(c.x, 1.3, c.z, 'MISS', '#c0c8d0'); NS.sfx('miss'); return; }
        const mul = this.elemMul(t, mv.elem);
        if (mul > 1.05) weakShown = true;
        if (mul < 0.95) resistShown = true;
        const crit = this.rnd() < (M.critRate || 0); // シールドナイト: 半分が 会心 (防御を 無視)
        if (crit) critShown = true;
        const dmg = Math.max(1, Math.round(this.monsterDamage(t, mv, crit) * this.R(0.9, 1.1)));
        const p = this.damage(t, dmg, { elem: mv.elem, weak: mul > 1.05, resist: mul < 0.95, big: true, crit, from: u });
        const st = mv.elem && NS.ELEMENTS[mv.elem].status;
        if (st && t.alive && this.rnd() < this.statusChance(t, st, mv.chance || 0)) { await NS.wait(80); this.setStatus(t, st); }
        if (mv.hitStatus && t.alive && this.rnd() < this.statusChance(t, mv.hitStatus, mv.hitChance)) { await NS.wait(80); this.setStatus(t, mv.hitStatus); } // つめで あしらった: ねむり・まひ
        await p;
      };
      if (['breath', 'iceberg', 'laser', 'shot', 'beam', 'wing'].includes(mv.kind)) NS.sfx(mv.elem);
      let grandP = null;
      if (mv.kind === 'ult') { // 大技: 画面じゅうの 演出の とちゅうで 全員に 当たる
        NS.popup(u.pos.x, (u.ch.height || 2.4) + 0.3, u.pos.z, mv.name, mv.elem === 'fire' ? '#ffb05a' : '#e09aff', true);
        NS.sfx(mv.elem === 'fire' ? 'grand_fire' : 'grand_dark');
        NS.flash(0.55, mv.elem === 'fire' ? '255,90,20' : '90,0,140'); NS.shake = Math.max(NS.shake, 0.8);
        NS.slowMo(0.5, 500);
        grandP = NS.grandFx(mv.elem, targets.map((t) => t.center(0.55)), 2300, targets.map((t) => ({ x: t.pos.x, y: 0, z: t.pos.z })));
        await NS.wait(900);
      }
      if (mv.kind === 'laser' || mv.kind === 'beam') { NS.flash(0.45, '255,250,220'); NS.shake = Math.max(NS.shake, 0.3); }
      if (mv.kind === 'swing') { NS.sfx('whoosh'); await NS.anim(420, (e) => { u.v.face = u.facing + e * Math.PI * 2; }); u.v.face = u.facing; }
      if (cv) for (const t of targets) { await one(t); await NS.wait(140); }
      else await Promise.all(targets.map(one));
      if (grandP) await grandP;
      this.monsterCharge = 0;
      if (critShown) msg('かいしんの いちげき!');
      else if (weakShown) msg('じゃくてんを ついた!');
      else if (resistShown) msg('あまり きいていない…');
      await NS.wait(420);
      u.v.armRaise = 0;
      if (['claw', 'dive', 'bash', 'rush'].includes(mv.kind)) await this.goHome(u, 420);
      u.v.expr = null;
      if (cv) await this.coverBack(cv.g);
      if (mv.ultLine && targets.some((t) => t.alive)) await this.monsterSpeech(u, mv.ultLine, 1400); // 大技を たえた 相手が いる
    }

    // 魔力を ためている: need 回 ためると 次の 行動で 大技
    async monsterMana(u, mv, need) {
      u.mana = Math.min(need, (u.mana || 0) + 1);
      msg(`${u.name}は ${mv.name}… (${u.mana}/${need})`);
      NS.setRig({ yaw: -0.25, pitch: 0.24, dist: 9.2, tx: u.pos.x * 0.6, ty: 1.3, tz: u.pos.z * 0.6 }, 2.6);
      NS.sfx('charge');
      NS.magicCircle(u.pos, '#c04aff', 1.0, 1.4);
      NS.popup(u.pos.x, (u.ch.height || 2.4) + 0.1, u.pos.z, `魔力 ${u.mana}/${need}`, '#d08aff', true);
      await NS.anim(650, (e, p) => { u.v.armRaise = Math.sin(p * Math.PI) * 0.7; u.v.flash = Math.sin(p * Math.PI) * 0.25; });
      u.v.armRaise = 0; u.v.flash = 0;
      if (u.mana >= need) { msg(`${u.name}の 魔力が みちあふれている!`); NS.flash(0.2, '160,40,255'); await NS.wait(500); }
      await NS.wait(250);
    }

    // ふういんのはどう (状態異常) / しんえんのはどう (能力アップを 打ち消す): 足元から 広がる 波
    async monsterWave(u, mv, foes) {
      msg(`${u.name}の ${mv.name}!`);
      NS.setRig({ yaw: -0.3, pitch: 0.34, dist: 10.8, tx: 0, ty: 0.5, tz: 1.2 }, 2.6);
      u.v.expr = 'attack';
      NS.sfx('grand_dark');
      await NS.anim(380, (e) => { u.v.armRaise = e; u.v.squash = -0.06 * e; });
      const col = mv.dispel ? '#8a5aff' : '#ff4aa8';
      for (let i = 0; i < 3; i++) NS.spawn({ type: 'ring', x: u.pos.x, y: 0.05, z: u.pos.z, color: col, size: 0.6, life: 0.9 + i * 0.15, grow: 10 + i * 2 });
      NS.flash(0.25, mv.dispel ? '60,0,120' : '120,0,60'); NS.shake = Math.max(NS.shake, 0.35);
      await NS.wait(500);
      let n = 0;
      for (const t of foes) {
        if (!t.alive) continue;
        NS.impact('dark', t.center(0.7));
        if (mv.dispel) {
          let lost = false;
          const hit = !mv.dispelChance || this.rnd() < mv.dispelChance; // じごくのはどう: 1体ごとに 50%
          if (hit) for (const k in t.buffs) if (t.buffs[k] > 0) { t.buffs[k] = 0; t.buffT[k] = 0; lost = true; }
          if (lost) { n++; NS.popup(t.pos.x, 1.9, t.pos.z, '能力アップが きえた', '#ff9ab0'); }
        } else if (this.rnd() < this.statusChance(t, mv.status, mv.statusChance) && this.setStatus(t, mv.status)) n++;
        else NS.popup(t.pos.x, 1.4, t.pos.z, 'きかなかった', '#c0c8d0');
      }
      NS.ui.refreshCards();
      msg(mv.dispel ? (n ? `${n}人の 能力アップが 打ち消された!` : 'しかし なにも おこらなかった') : n ? `${n}人が ${NS.STATUS[mv.status].name}に なった!` : 'だれも かからなかった!');
      u.v.armRaise = 0; u.v.squash = 0; u.v.expr = null;
      await NS.wait(800);
    }

    // いかく: 全員に それぞれ 確率で きょうふ (1回 動けない)。ダメージは なし
    async monsterRoar(u, mv, foes) {
      msg(/た$/.test(mv.name) ? `${u.name}は ${mv.name}!` : `${u.name}の ${mv.name}!`);
      NS.setRig({ yaw: -0.3, pitch: 0.3, dist: 9.5, tx: 0, ty: 1.2, tz: -1.5 }, 2.6);
      u.v.expr = 'attack';
      await NS.anim(300, (e) => { u.v.armRaise = e; u.v.squash = -0.1 * e; });
      NS.sfx('ko'); NS.shake = Math.max(NS.shake, 0.5); NS.flash(0.25, '255,80,60');
      await NS.anim(500, (e, p) => (u.v.squash = Math.sin(p * Math.PI * 4) * 0.06));
      let n = 0;
      for (const t of foes) {
        if (t.alive && this.rnd() < this.statusChance(t, mv.status, mv.statusChance) && this.setStatus(t, mv.status, 1)) n++;
      }
      msg(n ? `${n}人が きょうふに かかった!` : 'だれも きょうふに かからなかった!');
      u.v.armRaise = 0; u.v.squash = 0; u.v.expr = null;
      await NS.wait(700);
    }

    // フレネミー発動: 全員に それぞれ 確率で 状態異常 (どく)。ダメージは なし
    async monsterCurse(u, mv, foes) {
      msg(`${u.name}の ${mv.name}!`);
      NS.setRig({ yaw: -0.3, pitch: 0.34, dist: 10.8, tx: 0, ty: 0.5, tz: 1.2 }, 2.6);
      u.v.expr = 'attack';
      NS.sfx('status');
      await NS.anim(380, (e) => { u.v.armRaise = e; u.v.squash = -0.06 * e; });
      const from = u.center(0.78);
      let n = 0;
      await Promise.all(foes.map(async (t) => {
        await NS.projectile(from, t.center(0.55), mv.fx || 'dark', 460, 0.5);
        if (t.alive && this.rnd() < this.statusChance(t, mv.status, mv.statusChance) && this.setStatus(t, mv.status)) n++;
        else NS.popup(t.pos.x, 1.4, t.pos.z, 'きかなかった', '#c0c8d0');
      }));
      msg(n ? `${n}人が ${NS.STATUS[mv.status].name}に なった!` : 'だれも かからなかった!');
      u.v.armRaise = 0; u.v.squash = 0; u.v.expr = null;
      await NS.wait(700);
    }

    // セリフ (まおう: ショータイムの はじまりだ! / まだ 終わらんぞッ!)
    async monsterSpeech(u, line, ms = 1500) {
      msg(`${u.name}「${line}」`);
      NS.setRig({ yaw: -0.25, pitch: 0.22, dist: 8.6, tx: u.pos.x * 0.6, ty: 1.4, tz: u.pos.z * 0.6 }, 2.6);
      u.v.expr = 'attack';
      NS.sfx('dark');
      NS.popup(u.pos.x, (u.ch.height || 2.4) + 0.2, u.pos.z, line, '#ff8a9a', true);
      await NS.anim(500, (e) => { u.v.armRaise = Math.sin(e * Math.PI) * 0.8; u.v.squash = -0.05 * Math.sin(e * Math.PI); });
      u.v.armRaise = 0; u.v.squash = 0; u.v.expr = null;
      await NS.wait(ms);
    }

    // 邪眼を 開いた: 全員に 能力アップ無効 (3ターン)。今 かかっている 能力アップも 消える (かならず 効く)
    async monsterJagan(u, mv, foes) {
      msg(`${u.name}は ${mv.name}!`);
      NS.setRig({ yaw: -0.3, pitch: 0.3, dist: 9.5, tx: 0, ty: 1.2, tz: -1.5 }, 2.6);
      u.v.expr = 'attack';
      NS.sfx('grand_dark');
      await NS.anim(400, (e) => { u.v.armRaise = e * 0.6; u.v.squash = -0.08 * e; });
      NS.flash(0.35, '160,0,60'); NS.shake = Math.max(NS.shake, 0.4);
      const eye = u.center(1.32);
      NS.spawn({ type: 'ring', x: eye.x, y: eye.y, z: eye.z, color: '#ff2a4a', size: 0.4, life: 0.7, grow: 4 });
      await NS.wait(350);
      let n = 0;
      for (const t of foes) {
        if (!t.alive) continue;
        let lost = false;
        for (const k in t.buffs) if (t.buffs[k] > 0) { t.buffs[k] = 0; t.buffT[k] = 0; lost = true; }
        if (t.status.nobuff) t.status.nobuff = 3; // かかっていれば 3ターンに もどす
        else if (this.setStatus(t, 'nobuff', 3)) n++;
        NS.impact('dark', t.center(0.7));
        if (lost) NS.popup(t.pos.x, 1.9, t.pos.z, '能力アップが きえた', '#ff9ab0');
      }
      NS.ui.refreshCards();
      msg(n ? `${n}人の 能力アップが 封じられた!` : 'みんなの 能力アップが 封じられている!');
      u.v.armRaise = 0; u.v.squash = 0; u.v.expr = null;
      await NS.wait(900);
    }

    // まおう・じゃあくのまじょ: HP が 0 に なると 次の すがたに (HP 全回復・素早さ などが かわる)
    async transform(t, M) {
      const n = (t.phase || 1) + 1, P = M['phase' + n], before = t.name;
      t.transforming = true; t.hp = 0;
      t.status = {};
      t.buffs = { atk: 0, def: 0, spd: 0, eva: 0 }; t.buffT = { atk: 0, def: 0, spd: 0, eva: 0 };
      t.charge = 0; t.mana = 0;
      NS.ui.refreshCards();
      NS.slowMo(0.35, 450);
      await NS.anim(500, (e) => { t.v.squash = 0.12 * e; t.v.lie = 0.12 * e; t.v.gray = 0.5 * e; });
      if (P.fake) await this.fakeEnd(t, P, n); // ファンファーレ → 杖で 暗闇 → 最終形態
      else {
        if (P.line) await this.monsterSpeech(t, P.line, 900);
        NS.sfx('grand_dark');
        NS.setRig({ yaw: -0.2, pitch: 0.24, dist: 9.6, tx: t.pos.x * 0.6, ty: 1.4, tz: t.pos.z * 0.6 }, 2.6);
        await NS.anim(1300, (e, p) => {
          t.v.lie = 0.12 * (1 - e); t.v.gray = 0.5 * (1 - e); t.v.squash = Math.sin(p * Math.PI * 10) * 0.05 * (1 - p);
          t.v.flash = Math.max(0, Math.sin(p * Math.PI * 6)) * 0.6;
          NS.shake = Math.max(NS.shake, 0.25);
        });
        t.v.lie = 0; t.v.gray = 0; t.v.squash = 0; t.v.flash = 0;
        NS.flash(0.6, '120,0,40'); NS.shake = Math.max(NS.shake, 0.7);
        for (let i = 0; i < 3; i++) NS.spawn({ type: 'ring', x: t.pos.x, y: 0.05, z: t.pos.z, color: '#ff2a4a', size: 0.6, life: 0.8, grow: 4 + i * 2 });
        this.applyPhase(t, P, n);
      }
      await NS.anim(900, (e) => { t.hp = Math.round(t.maxHp * e); NS.ui.refreshCards(); });
      t.hp = t.maxHp;
      NS.crowdExcite = 1.5;
      msg(P.fake ? `${t.name}が すがたを あらわした!` : P.name ? `${before}は ${P.name}に すがたを かえた!` : `${t.name}は 第二形態に なった!`);
      NS.ui.refreshCards();
      await NS.wait(1100);
      t.transforming = false;
    }
    // すがた・名前・能力を 入れかえる
    applyPhase(t, P, n) {
      t.phase = n; t.ch.phase = n;
      if (P.name) t.name = P.name;
      if (P.height) t.ch.height = P.height;
      if (P.w) t.ch.look.w = P.w;
      if (P.res) t.ch.res = Object.assign({}, P.res);
      if (P.stage) NS.arenaTheme = P.stage; // アビス: 火と 闇の 空間
      Object.assign(t.ch.stats, P.stats);
      t.ch.actions = P.actions || t.ch.actions;
      t.maxHp = Math.round((P.stats.hp || t.maxHp) * (t.ch.hpMul || 1)); // hpMul = どうくつの 階ごとの 強さ
    }
    // じごくのじょおう: たおすと ファンファーレ → 杖を かかげて 画面が 暗闇に → アビス (なかまは 全回復)
    async fakeEnd(t, P, n) {
      const before = t.name, party = this.foesOf(t);
      NS.bgm.play('fanfare');
      msg(`${before}を たおした!`);
      NS.setRig({ yaw: Math.PI + 0.3, pitch: 0.2, dist: 8, tx: 0, ty: 0.7, tz: 3 }, 1.2);
      for (const u of party) if (u.alive) { u.v.expr = 'happy'; u.celebrate = true; }
      NS.confetti(0, 3);
      await NS.wait(2800);
      for (const u of party) { u.celebrate = false; u.v.oy = 0; u.v.armRaise = 0; if (u.alive) u.v.expr = null; }
      NS.bgm.stop(0.6);
      // 杖を かかげる
      msg(`…!? ${before}が 杖を かかげた!`);
      NS.setRig({ yaw: -0.25, pitch: 0.22, dist: 8.6, tx: t.pos.x * 0.6, ty: 1.4, tz: t.pos.z * 0.6 }, 2.2);
      await NS.anim(700, (e) => { t.v.lie = 0.12 * (1 - e); t.v.gray = 0.5 * (1 - e); t.v.squash = 0.12 * (1 - e); });
      t.v.lie = 0; t.v.gray = 0; t.v.squash = 0;
      NS.sfx('grand_dark');
      NS.magicCircle(t.pos, '#8a2aff', 2.2, 2.0);
      await NS.anim(800, (e) => { t.v.armRaise = e; t.v.flash = e * 0.4; NS.shake = Math.max(NS.shake, 0.12); });
      // 暗闇が 杖から 広がって 画面を おおう
      const src = t.center(1.3);
      await NS.anim(1500, (e) => NS.setDarkness(e, src, 1), 'in');
      msg('あたりが 暗闇に つつまれた…');
      // 暗闇の 中で すがたが かわり、なかまは 全回復 (たおれた なかまも 起きる)
      t.v.armRaise = 0; t.v.flash = 0;
      this.applyPhase(t, P, n);
      for (const u of party) {
        if (!u.alive) { u.alive = true; NS.removeFx(u); Object.assign(u.v, { lie: 0, gray: 0, alpha: 1, oy: 0, idle: true }); }
        u.hp = u.maxHp; u.mp = u.maxMp; u.status = {}; u.wokeTurn = null; u.v.expr = null;
      }
      NS.ui.refreshCards();
      await NS.wait(1400);
      if (P.bgm) NS.bgm.play(P.bgm);
      NS.sfx('grand_dark'); NS.shake = Math.max(NS.shake, 0.9);
      NS.setRig({ yaw: -0.2, pitch: 0.26, dist: 10.4, tx: t.pos.x * 0.5, ty: 1.5, tz: t.pos.z * 0.5 }, 2.2);
      await NS.anim(1500, (e) => NS.setDarkness(1, src, 1 - e));
      NS.setDarkness(0);
      NS.flash(0.55, '120,0,160');
      for (let i = 0; i < 3; i++) NS.spawn({ type: 'ring', x: t.pos.x, y: 0.05, z: t.pos.z, color: '#b04aff', size: 0.6, life: 0.9, grow: 5 + i * 2 });
      for (const u of party) NS.healFx(u.pos, '#fff3a0');
      msg('なかまの HP と MP が 全回復した!');
      await NS.wait(1200);
    }

    // かばい終わったら 元の場所へ
    async coverBack(g) {
      if (g.alive) await this.goHome(g, 320);
      else { g.v.ox = 0; g.v.oz = 0; }
    }

    retarget(u, target, pool) {
      if (target && target.alive && pool.includes(target)) return target;
      const alive = this.alive(pool);
      return alive.length ? this.pick(alive) : null;
    }

    async act(u, cmd) {
      if (u.status.paralyze) { // まひ: 1〜2ターン 動けない
        if (--u.status.paralyze <= 0) delete u.status.paralyze;
        msg(`${u.name}は まひして うごけない!`);
        this.focusCam(u, u);
        NS.impact('thunder', u.center(0.6));
        NS.sfx('thunder');
        await NS.anim(600, (e, p) => (u.v.ox = Math.sin(p * Math.PI * 14) * 0.04 * (1 - p)));
        u.v.ox = 0;
        if (!u.status.paralyze) NS.popup(u.pos.x, 1.6, u.pos.z, 'まひが とけた', '#bfffd0');
        NS.ui.refreshCards();
        await NS.wait(300);
        return;
      }
      if (u.status.sleep) { // ねむり: 1〜2ターン 動けない
        if (--u.status.sleep <= 0) delete u.status.sleep;
        msg(`${u.name}は ねむっている…`);
        for (let i = 0; i < 3; i++) NS.spawn({ type: 'text', text: 'Z', x: u.pos.x + 0.2 + i * 0.1, y: 1.2 + i * 0.15, z: u.pos.z, color: '#cfe0ff', size: 0.22 + i * 0.06, life: 1.1, vy: 0.5, vx: 0.25, fadeIn: i * 0.2 });
        await NS.wait(800);
        if (!u.status.sleep) NS.popup(u.pos.x, 1.6, u.pos.z, 'めをさました', '#cfe0ff');
        NS.ui.refreshCards();
        await NS.wait(200);
        return;
      }
      if (u.wokeTurn === this.turn) { // 攻撃されて 目をさましたターンは まだ動けない
        msg(`${u.name}は めを さましたばかりで うごけない`);
        await NS.wait(700);
        return;
      }
      if (u.status.fear) { // きょうふ: 1回 動けない
        delete u.status.fear;
        msg(`${u.name}は きょうふで うごけない!`);
        this.focusCam(u, u);
        await NS.anim(500, (e, p) => (u.v.ox = Math.sin(p * Math.PI * 10) * 0.03 * (1 - p)));
        u.v.ox = 0;
        NS.ui.refreshCards();
        await NS.wait(300);
        return;
      }
      if (u.status.charm) {
        delete u.status.charm;
        msg(`${u.name}は みりょうされていて うごけない!`);
        this.focusCam(u, u);
        NS.impact('charm', u.center(1.0));
        NS.sfx('status');
        u.v.expr = 'happy';
        await NS.anim(700, (e, p) => (u.v.headTilt = Math.sin(p * Math.PI * 3) * 0.25));
        u.v.headTilt = 0;
        u.v.expr = null;
        NS.ui.refreshCards();
        await NS.wait(350);
        return;
      }
      if (cmd.type === 'monster') return this.monsterAct(u);
      // がんばれ の かいふく・ふっかつ役: 動く ときの 味方の ようすで 考えなおす (ボスが 先に 動いて 味方が 弱った・たおれた ときに 使えるように)
      //   オンラインの 対戦中は あいての 画面と ずれないように しない
      if (cmd.auto && (!this.online || this.online.npc) && u.ch.skill && ['heal', 'revive'].includes(u.ch.skill.kind)) {
        const alt = this.planSmart([u]).get(u);
        if (alt) cmd = alt;
      } else if (cmd.auto && cmd.type === 'skill' && cmd.skill.kind === 'revive' && !this.alliesOf(u).some((a) => !a.alive)) {
        const alt = this.planSmart([u]).get(u);
        if (alt && !(alt.type === 'skill' && alt.skill.kind === 'revive')) cmd = alt;
      }
      if (cmd.type === 'skill') {
        const sk = cmd.skill;
        if (u.status.seal) {
          msg(`${u.name}は アンテナを 封じられていて スキルが 使えない!`);
          await NS.wait(600);
        } else if (u.mp < u.cost(sk)) {
          msg(`${u.name}は MPが たりない!`);
          await NS.wait(500);
        } else {
          await this.doSkill(u, sk, cmd.target);
          // おおきなかね: 続けて もう 1回 (MP も もう 1回 使う。ふっかつ は たおれた 味方が いるときだけ)
          if (NS.skillTwice(u.ch) && u.alive && !u.status.seal && u.mp >= u.cost(sk) && !this.checkEnd() && !(sk.kind === 'revive' && !this.alliesOf(u).some((a) => !a.alive))) {
            await NS.wait(250);
            await this.doSkill(u, sk, cmd.target);
          }
          return;
        }
      }
      let t = this.retarget(u, cmd.target, this.foesOf(u));
      if (!t) return;
      // はかいおうのはね: ねらった 相手と その近くの 4体 (威力は そのまま)
      let targets = this.nearTargets(t, this.foesOf(u), NS.strikeCount(u.ch));
      const cv = await this.cover(u, targets);
      if (cv) { t = cv.g; targets = targets.map(() => cv.g); }
      await this.doAttack(u, t, targets, !!cv);
      if (cv) await this.coverBack(cv.g);
    }

    focusCam(u, t) {
      const a = u.pos, b = t ? t.pos : a;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const yaw = u.side === 'party' ? NS.clamp(-mx * 0.05, -0.2, 0.2) : (mx > 0 ? -1 : 1) * 0.3;
      NS.setRig({ tx: mx * 0.7, ty: 0.6, tz: mz * 0.6 - 0.3, dist: 8.8, yaw, pitch: 0.27 }, 3.2);
    }

    faceTo(u, t) {
      const a = u.pos, b = t.pos;
      u.v.face = Math.atan2(b.x - a.x, b.z - a.z);
    }

    async runTo(u, x, z, ms) {
      const sx = u.v.ox, sz = u.v.oz;
      const ex = x - u.v.x, ez = z - u.v.z;
      u.v.idle = false;
      NS.sfx('whoosh');
      let lastStep = 0;
      await NS.anim(ms, (e, p) => {
        u.v.ox = NS.lerp(sx, ex, e);
        u.v.oz = NS.lerp(sz, ez, e);
        u.v.oy = Math.abs(Math.sin(p * Math.PI * 2)) * 0.12;
        u.v.step = p * Math.PI * 4;
        if (p - lastStep > 0.22) { lastStep = p; NS.dust(u.pos.x, u.pos.z, 2); }
      });
      u.v.oy = 0; u.v.step = 0;
    }

    async goHome(u, ms = 260) {
      await this.runTo(u, u.home.x, u.home.z, ms);
      u.v.ox = 0; u.v.oz = 0;
      u.v.face = u.facing;
      u.v.expr = null;
      u.v.idle = true;
    }

    rollHit(u, t, evaMul) {
      if (!t.alive) return false;
      let miss = t.stat('eva') * evaMul;
      if (u.status.blind) miss += 40;
      return this.rnd() * 100 >= miss;
    }

    // 会心は 相手の 防御を 無視する
    physDamage(a, d, crit) {
      const atk = a.stat('atk');
      const def = crit ? 0 : d.stat('def');
      let dmg = ((atk * 1.25 * 100) / (100 + def)) * this.R(0.88, 1.12) * 2 ** a.charge;
      if (d.guard) dmg *= 0.5;
      return Math.max(1, Math.round(dmg));
    }

    elemMul(d, elem) {
      if (!elem) return 1;
      // 属性の状態異常 (ブラインドをのぞく) に かかっていると その属性の耐性 −1
      const st = NS.ELEMENTS[elem].status;
      const r = (d.ch.res[elem] || 0) - (st !== 'blind' && d.status[st] ? 1 : 0) - (d.resDown || 0); // みんなたたり
      return NS.clamp(1 - 0.2 * r, 0.3, 1.8);
    }

    skillDamage(a, d, sk) {
      // 属性スキルは 攻撃力に よらない 固定の 強さ (基本 94 = 攻撃 75 の 通常攻撃と 同じ くらい)
      const def = d.stat('def');
      let dmg = ((NS.ELEM_BASE * sk.power * 100) / (100 + def * 0.5)) * (sk.noRes ? 1 : this.elemMul(d, sk.elem)) * this.auraMul(a, sk) * (a.ch.elemMul || 1) * this.R(0.9, 1.1); // elemMul = まおうのかんむり
      if (d.guard) dmg *= 0.5;
      return Math.max(1, Math.round(dmg));
    }

    hitReact(t, strength = 1, from = null) {
      const v = t.v;
      v.expr = 'hurt';
      let kx = 0, kz = t.side === 'party' ? 1 : -1;
      if (from) {
        const a = from.pos, b = t.pos, d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        kx = (b.x - a.x) / d; kz = (b.z - a.z) / d;
      }
      const bx = v.ox, bz = v.oz;
      NS.anim(320, (e, p) => {
        const k = Math.sin(p * Math.PI) * 0.28 * strength;
        v.ox = bx + kx * k; v.oz = bz + kz * k;
        v.flash = (1 - p) * 0.9;
        v.squash = -Math.sin(p * Math.PI) * 0.12 * strength;
      }).then(() => {
        v.ox = bx; v.oz = bz; v.flash = 0; v.squash = 0;
        if (t.alive && v.expr === 'hurt') v.expr = null;
      });
    }

    // ダメージを与える。KO なら倒れる演出まで待つ
    async damage(t, dmg, o = {}) {
      if (!t.alive || t.transforming) return;
      t.hp = Math.max(0, t.hp - dmg);
      if (o.from) o.from.dealt += dmg;
      const c = t.center(o.elem ? 0.55 : 0.6);
      if (o.elem) NS.impact(o.elem, c, o.weak || o.big);
      else NS.impact(null, c, o.crit);
      const color = o.weak ? '#ffd040' : o.resist ? '#b8c4d0' : '#ffffff';
      NS.popup(c.x, 1.25, c.z, dmg, color, o.crit || o.weak);
      NS.hitStop(o.crit || o.weak ? 110 : 55);
      if (o.crit) {
        NS.popup(c.x, 1.75, c.z, 'かいしん!', '#ffcf4a', true);
        NS.punch = 1.6;
        NS.slowMo(0.3, 420);
      } else if (o.weak) {
        NS.popup(c.x, 1.75, c.z, 'じゃくてん!', '#ffcf4a');
        NS.punch = Math.max(NS.punch, 0.8);
      }
      if (!o.silent) NS.sfx(o.crit ? 'crit' : 'hit');
      NS.shake = Math.max(NS.shake, o.crit || o.weak ? 0.28 : 0.09);
      if (o.crit) NS.flash(0.35);
      NS.crowdExcite = Math.min(1.5, NS.crowdExcite + dmg / t.maxHp);
      this.hitReact(t, o.crit ? 1.6 : 1, o.from);
      if (t.status.sleep) { delete t.status.sleep; t.wokeTurn = this.turn; NS.popup(c.x, 1.7, c.z, 'めをさました', '#cfe0ff'); }
      NS.ui.refreshCards();
      if (t.hp <= 0) await this.ko(t);
    }

    async ko(t) {
      if (!t.alive || t.transforming) return;
      const MK = t.ch.monster && NS.MONSTERS[t.ch.monster];
      if (MK && MK['phase' + ((t.phase || 1) + 1)]) return this.transform(t, MK); // まおう・じゃあくのまじょ: 次の すがたへ
      t.alive = false;
      if (!this.alliesOf(t).some((x) => x.alive)) NS.bgm.stop(1.0); // 敵を たおした (全員 やられた) 瞬間に BGM を フェードアウト
      t.status = {};
      t.buffs = { atk: 0, def: 0, spd: 0, eva: 0 };
      t.charge = 0;
      t.v.expr = 'ko';
      t.v.idle = false;
      msg(`${t.name}は たおれた!`);
      NS.sfx('ko');
      NS.ui.refreshCards();
      NS.slowMo(0.35, 450);
      NS.crowdExcite = Math.min(1.6, NS.crowdExcite + 0.6);
      // ふわっと浮いてから 倒れる
      await NS.anim(520, (e, p) => {
        t.v.lie = e;
        t.v.oy = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 0.35;
        t.v.gray = e;
        t.v.alpha = 1 - e * 0.35;
      }, 'out');
      t.v.lie = 1; t.v.oy = 0;
      NS.dust(t.pos.x, t.pos.z, 8);
      NS.koStars({ x: t.pos.x + t.v.lieDir * 0.6 * t.ch.look.h, z: t.pos.z }, 0.42, t);
      await NS.wait(250);
    }

    async revive(t, frac) {
      t.alive = true;
      t.hp = Math.max(1, Math.round(t.maxHp * frac));
      NS.removeFx(t);
      NS.healFx(t.pos, '#fff3a0');
      NS.ui.refreshCards();
      await NS.anim(400, (e) => { t.v.lie = 1 - e; t.v.gray = 1 - e; t.v.alpha = 0.65 + e * 0.35; });
      t.v.expr = 'happy';
      t.v.idle = true;
      setTimeout(() => { if (t.v.expr === 'happy') t.v.expr = null; }, 900);
    }

    setStatus(t, key, turns) {
      if (!t.alive || t.status[key]) return false;
      t.status[key] = turns || (key === 'sleep' || key === 'paralyze' ? 1 + Math.floor(this.rnd() * 2) : key === 'charm' ? 1 : key === 'seal' ? 2 : 3);
      NS.popup(t.pos.x, 1.65, t.pos.z, NS.STATUS[key].icon + NS.STATUS[key].name, '#ffb0f0');
      NS.ui.refreshCards();
      return true;
    }

    // 状態異常耐性 1 につき かかりにくさ 20% (+2 で ×0.6、+5 で かからない)
    statusChance(t, key, base) {
      const r = ((t.ch.stres && t.ch.stres[key]) || 0) - (t.stresDown || 0); // みんなダルダル
      return base * NS.clamp(1 - 0.2 * r, 0, 1.8);
    }

    // 通常攻撃
    // targets: 打撃の 相手 (ふつうは 1体。はかいおうのはね なら 5体)。covered = キャッスルが ぜんぶ 受ける
    async doAttack(u, t, targets = [t], covered = false) {
      msg(targets.length > 1 && !covered ? `${u.name}の はかいの いちげき!` : `${u.name}の こうげき!`);
      this.focusCam(u, t);
      this.faceTo(u, t);
      const a = u.pos, b = t.pos;
      const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const stop = Math.max(0, d - 0.8);
      await NS.wait(200);
      await this.runTo(u, a.x + ((b.x - a.x) / d) * stop, a.z + ((b.z - a.z) / d) * stop, 380);
      u.v.expr = 'attack';
      await NS.anim(180, (e) => { u.v.squash = 0.2 * e; u.v.armRaise = e * 0.9; u.v.oy = e * 0.12; });
      await NS.anim(90, (e) => { u.v.squash = 0.2 * (1 - e) - 0.12 * e; u.v.armRaise = 0.9 - e * 0.9; u.v.oy = 0.12 * (1 - e); });
      u.v.squash = 0; u.v.armRaise = 0; u.v.oy = 0;
      if (u.charge) NS.popup(u.pos.x, 1.7, u.pos.z, `たくわえ ×${2 ** u.charge}!`, '#ff9a3a', true);
      // 当たり・会心・ダメージを 先に 決める (相手ごと。威力は 1体のときと 同じ)
      const rolls = targets.map((x) => {
        const hit = this.rollHit(u, x, 1);
        const crit = hit && this.rnd() < 0.06 + (u.ch.critUp || 0) + Math.max(0, (u.stat('spd') - x.stat('spd')) / 2000);
        return { x, hit, crit, dmg: hit ? this.physDamage(u, x, crit) : 0 };
      });
      u.charge = 0;
      if (targets.length > 1) NS.sfx('whoosh');
      const one = async ({ x, hit, crit, dmg }) => {
        const q = x.pos;
        if (!hit || !x.alive) {
          NS.sfx('miss');
          NS.popup(q.x, 1.3, q.z, 'MISS', '#c0c8d0');
          if (!x.alive) return;
          const side = Math.random() < 0.5 ? -1 : 1;
          const bx = x.v.ox;
          NS.anim(300, (e, p) => { x.v.ox = bx + Math.sin(p * Math.PI) * 0.5 * side; x.v.oy = Math.sin(p * Math.PI) * 0.25; }).then(() => { x.v.ox = bx; x.v.oy = 0; });
          return;
        }
        if (crit) msg('かいしんの いちげき!');
        await this.damage(x, dmg, { crit, from: u });
      };
      if (covered) for (const r of rolls) { await one(r); await NS.wait(140); } // かばった 1体が 1回ずつ
      else await Promise.all(rolls.map(one));
      await NS.wait(420);
      await this.goHome(u, 360);
    }

    // そうこうげき: 全員が一斉に飛びかかる。結果を先に決めてから同時に演出する
    async groupAttack(members, focus) {
      if (!members.length) return;
      const foes = this.alive(this.foesOf(members[0]));
      if (!foes.length) return;
      msg(members.length > 1 ? `${members[0].name}たちの そうこうげき!` : `${members[0].name}の こうげき!`);
      NS.setRig({ yaw: 0, pitch: 0.36, dist: 10.5, tx: 0, ty: 0.5, tz: members[0].side === 'party' ? -1.6 : 1.6 }, 2.4);
      const predicted = new Map(foes.map((f) => [f, f.hp]));
      let cur = focus && focus.alive ? focus : best(foes, (f) => -f.hp);
      const plan = [];
      for (const u of members) {
        if (!(predicted.get(cur) > 0)) {
          const rest = foes.filter((f) => predicted.get(f) > 0);
          if (!rest.length) break;
          cur = best(rest, (f) => -predicted.get(f));
        }
        const hit = this.rollHit(u, cur, 1);
        const crit = hit && this.rnd() < 0.06 + (u.ch.critUp || 0);
        const dmg = hit ? this.physDamage(u, cur, crit) : 0;
        predicted.set(cur, predicted.get(cur) - dmg);
        // はかいおうのはね: ねらった 相手の 近くの 4体にも 同じ 威力で
        const extra = this.nearTargets(cur, this.foesOf(u), NS.strikeCount(u.ch)).slice(1).map((x) => {
          const h = this.rollHit(u, x, 1), c = h && this.rnd() < 0.06 + (u.ch.critUp || 0), d = h ? this.physDamage(u, x, c) : 0;
          predicted.set(x, predicted.get(x) - d);
          return { t: x, hit: h, crit: c, dmg: d };
        });
        u.charge = 0;
        plan.push({ u, t: cur, hit, crit, dmg, extra });
      }
      NS.sfx('whoosh');
      await Promise.all(plan.map((pl, i) => (async () => {
        const { u, t } = pl;
        await NS.wait(i * 110);
        this.faceTo(u, t);
        const a = u.pos, b = t.pos;
        const ang = Math.atan2(a.x - b.x, a.z - b.z) + (i % 2 ? 1 : -1) * (0.25 + 0.18 * Math.floor(i / 2));
        await this.runTo(u, b.x + Math.sin(ang) * 0.85, b.z + Math.cos(ang) * 0.85, 420);
        u.v.expr = 'attack';
        await NS.anim(100, (e) => { u.v.squash = 0.16 * e; u.v.armRaise = e; });
        u.v.squash = 0; u.v.armRaise = 0;
        if (!pl.hit || !t.alive) {
          NS.popup(b.x, 1.3, b.z, 'MISS', '#c0c8d0');
          NS.sfx('miss');
        } else {
          await this.damage(t, pl.dmg, { crit: pl.crit, from: u });
        }
        await Promise.all(pl.extra.map((x) => {
          if (x.hit && x.t.alive) return this.damage(x.t, x.dmg, { crit: x.crit, from: u });
          const q = x.t.pos; NS.popup(q.x, 1.3, q.z, 'MISS', '#c0c8d0'); return null;
        }));
        await NS.wait(380);
        await this.goHome(u, 380);
      })()));
    }

    // スキル
    async doSkill(u, sk, target) {
      const allies = this.alliesOf(u), foes = this.foesOf(u);
      let targets;
      switch (sk.tgt) {
        case 'foe': {
          const main = this.retarget(u, target, foes);
          targets = sk.area === 'three' ? this.threeTargets(main, foes) : [main];
          break;
        }
        case 'foes': targets = this.alive(foes); break;
        case 'ally': targets = [this.retarget(u, target, allies)]; break;
        case 'allies': targets = this.alive(allies); break;
        case 'deadAlly': {
          const dead = allies.filter((a) => !a.alive);
          targets = [dead.includes(target) ? target : dead[0]];
          break;
        }
        case 'deadAllies': targets = allies.filter((a) => !a.alive); break;
        default: targets = [u];
      }
      targets = targets.filter(Boolean);
      u.mp -= u.cost(sk);
      NS.ui.refreshCards();
      msg(`${u.name}の ${sk.name}!`);
      if (!targets.length) { await NS.wait(500); msg(sk.kind === 'revive' ? '使っても 意味が なかった' : 'しかし なにも おこらなかった'); await NS.wait(500); return; }
      let cv = null; // キャッスルが かばうと、その1体が ぜんぶの 攻撃を 1回ずつ 受ける
      if (sk.kind === 'attack') { await NS.wait(300); cv = await this.cover(u, targets); if (cv) targets = targets.map(() => cv.g); }

      const t0 = targets[0];
      if (sk.tgt === 'foes' || sk.tgt === 'allies' || sk.area === 'three') NS.setRig({ yaw: u.side === 'party' ? 0.12 : -0.3, pitch: 0.34, dist: 10.8, tx: 0, ty: 0.5, tz: (t0.side === 'party' ? 1 : -1) * 1.2 }, 2.6);
      else this.focusCam(u, t0);
      if (t0 !== u) this.faceTo(u, t0);

      // 溜め
      const ge = sk.elem || (sk.kind === 'heal' || sk.kind === 'revive' || sk.kind === 'cure' ? 'wind' : sk.kind === 'status' || sk.kind === 'debuff' || sk.kind === 'weaken' ? 'dark' : 'light');
      u.v.glowElem = ge;
      NS.sfx(sk.kind === 'attack' ? 'skillElem' : 'charge'); // 属性スキルは 専用の 音
      NS.magicCircle(u.pos, NS.skillColor(sk), 1.5, (sk.area === 'all' ? 1.1 : 0.85) * (1 + (sk.grade || 0) * 0.08));
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        NS.spawn({ type: 'glow', x: u.pos.x + Math.cos(a) * 0.7, y: Math.random() * 0.3, z: u.pos.z + Math.sin(a) * 0.5, color: NS.skillColor(sk), size: 0.12, life: 0.8, vx: -Math.cos(a) * 0.8, vy: 1.4, vz: -Math.sin(a) * 0.6, fadeIn: 0.15 });
      }
      await NS.anim(620, (e, p) => {
        u.v.glow = e; u.v.armRaise = e;
        u.v.oy = Math.sin(p * Math.PI) * 0.25;
        u.v.antennaKick = Math.sin(p * Math.PI * 6) * 0.05;
      });
      u.v.oy = 0; u.v.antennaKick = 0;
      const from = { x: u.pos.x, y: 1.2, z: u.pos.z };

      switch (sk.kind) {
        case 'attack': {
          let weakShown = false, resistShown = false;
          // 全体・最大の 属性スキル (あんこくのそこ など): 画面が その属性に そまる 大技の 演出
          const grand = sk.tgt === 'foes' && sk.tier === 2 && !NS.fxOff; // ✨ボタンで OFF に できる
          const gk = sk.fx || sk.elem, heaven = gk === 'heaven'; // ゴーヘブン: 専用の いちばん 派手な 演出
          let grandFx = null;
          if (grand) {
            NS.sfx('grand_' + gk);
            if (heaven) { NS.flash(0.9, '255,255,245'); NS.shake = Math.max(NS.shake, 0.5); }
            grandFx = NS.grandFx(gk, targets.map((t) => t.center(0.55)), heaven ? 2600 : undefined, targets.map((t) => ({ x: t.pos.x, y: 0, z: t.pos.z })));
            await NS.wait(heaven ? 1500 : 700);
            if (heaven) { NS.flash(1, '255,255,255'); NS.shake = Math.max(NS.shake, 0.6); }
          }
          const rolls = targets.map((t) => ({ hit: t.alive, dmg: this.skillDamage(u, t, sk), st: this.rnd() })); // 属性スキルは 外れない (たくわえは 通常攻撃 だけ なので 使わない)
          const runOne = async (t, i) => {
            const c = t.center(0.55); // 複数の相手にも 一斉に当たる
            if (grand) { /* 大技の 演出の 中で まとめて 当たる */ } else if (['thunder', 'earth', 'light'].includes(sk.elem) && sk.tgt === 'foe') {
              NS.skyStrike(sk.elem, c);
              await NS.wait(sk.elem === 'earth' ? 260 : 120);
            } else if (sk.tgt === 'foes') {
              NS.skyStrike(sk.elem, c);
              await NS.anim(260, () => {});
            } else {
              await NS.projectile(from, c, sk.elem, 520, 0.6);
            }
            if (i === 0 && !grand) NS.sfx(sk.elem);
            if (!t.alive) return;
            const roll = rolls[i];
            if (!roll.hit) { NS.popup(c.x, 1.3, c.z, 'MISS', '#c0c8d0'); NS.sfx('miss'); return; }
            const mul = sk.noRes ? 1 : this.elemMul(t, sk.elem);
            const weak = mul > 1.05, resist = mul < 0.95;
            if (weak) weakShown = true;
            if (resist) resistShown = true;
            const p = this.damage(t, roll.dmg, { elem: sk.elem, weak, resist, big: sk.power >= 0.7, from: u, silent: true });
            const st = NS.ELEMENTS[sk.elem].status;
            if (t.alive && roll.st < this.statusChance(t, st, sk.chance || 0)) {
              await NS.wait(80);
              this.setStatus(t, st);
            }
            await p;
          };
          if (cv) for (let i = 0; i < targets.length; i++) { await runOne(targets[i], i); await NS.wait(140); } // かばった 1体に 順番に
          else await Promise.all(targets.map(runOne));
          if (grandFx) await grandFx;
          if (weakShown) msg('じゃくてんを ついた!');
          else if (resistShown) msg('あまり きいていない…');
          await NS.wait(weakShown || resistShown ? 650 : 350);
          if (cv) await this.coverBack(cv.g);
          break;
        }
        case 'heal': {
          NS.sfx('heal');
          for (const t of targets) {
            if (!t.alive) continue;
            const amt = sk.full ? t.maxHp : sk.frac ? Math.round(t.maxHp * sk.frac) : Math.round(sk.power * this.R(0.92, 1.08) * (0.85 + NS.healMp(u.ch) / 110));
            const h = Math.min(t.maxHp - t.hp, amt);
            t.hp += h;
            NS.healFx(t.pos);
            NS.popup(t.pos.x, 1.3, t.pos.z, '+' + h, '#7dff9a');
            t.v.expr = 'happy';
            setTimeout(() => { if (t.v.expr === 'happy') t.v.expr = null; }, 700);
          }
          NS.ui.refreshCards();
          await NS.wait(650);
          break;
        }
        case 'revive': { // ふっかつ / みんなふっかつ
          NS.sfx('heal');
          const back = [];
          await Promise.all(targets.map(async (t, i) => {
            if (t.alive) return;
            await this.revive(t, sk.power); // ふっかつは かならず 起きる
            back.push(t);
          }));
          if (!back.length) msg('しかし 目を さまさなかった…');
          else msg(back.length === 1 ? `${back[0].name}が ふっかつした!` : `${back.length}人が ふっかつした!`);
          await NS.wait(650);
          break;
        }
        case 'cure': { // みんななおす: 状態異常を すべて なおす
          NS.sfx('heal');
          let n = 0;
          for (const t of targets) {
            if (!t.alive || !Object.keys(t.status).length) continue;
            t.status = {};
            n++;
            NS.healFx(t.pos, '#9fffd8');
            NS.popup(t.pos.x, 1.4, t.pos.z, 'なおった!', '#9fffd8');
          }
          NS.ui.refreshCards();
          msg(n ? `${n}人の 状態異常が なおった!` : 'しかし なにも おこらなかった');
          await NS.wait(650);
          break;
        }
        case 'charge': { // たくわえる (1体・かならず) / みんなたくわえる (1体ごとに 30%): 次の 攻撃 ×2 (重ねて ×4・×8)
          NS.sfx('buff');
          let n = 0;
          for (const t of targets) {
            if (!t.alive) continue;
            if (t.charge < 3 && this.rnd() < sk.chance) {
              t.charge++; n++;
              NS.arrowFx(t.pos, true, '#ff9a3a');
              NS.popup(t.pos.x, 1.45, t.pos.z, `たくわえ ×${2 ** t.charge}`, '#ff9a3a');
            } else NS.popup(t.pos.x, 1.45, t.pos.z, t.charge >= 3 ? 'もう いっぱい' : 'たくわえられなかった', '#c0c8d0');
          }
          NS.ui.refreshCards();
          msg(n ? `${n}人が ちからを たくわえた!` : 'しかし だれも たくわえられなかった');
          await NS.wait(700);
          break;
        }
        case 'buff': {
          NS.sfx('buff');
          let blocked = 0;
          for (const t of targets) {
            if (!t.alive) continue;
            if (t.status.nobuff) { blocked++; NS.popup(t.pos.x, 1.45, t.pos.z, '能力アップ無効!', '#ff9ab0'); continue; } // まおうの 邪眼
            const before = t.buffs[sk.stat];
            t.buffs[sk.stat] = NS.clamp(before + sk.stage, -5, 5);
            t.buffT[sk.stat] = 4;
            NS.arrowFx(t.pos, true, '#ffd24a');
            const label = NS.STAT_LABELS[sk.stat];
            NS.popup(t.pos.x, 1.45, t.pos.z, before === t.buffs[sk.stat] ? `${label} 変化なし` : `${label}↑ ${t.buffs[sk.stat]}段`, '#ffd24a');
          }
          msg(blocked && blocked >= targets.filter((t) => t.alive).length ? 'しかし 能力アップは 封じられている!'
            : targets.length === 1 ? `${targets[0].name}の ${NS.STAT_LABELS[sk.stat]}が あがった!` : `みんなの ${NS.STAT_LABELS[sk.stat]}が あがった!`);
          await NS.wait(700);
          break;
        }
        case 'debuff': { // みんなのろのろ / よわよわ / やわやわ: 敵全体の 能力を 1段 下げる (かならず 効く)
          NS.sfx('debuff');
          const label = NS.STAT_LABELS[sk.stat], color = NS.skillColor(sk);
          let n = 0;
          await Promise.all(targets.map(async (t) => {
            await NS.projectile(from, t.center(0.55), 'dark', 420, 0.5);
            if (!t.alive) return;
            if (t.ch.monster) { NS.popup(t.pos.x, 2.0, t.pos.z, 'ボスには きかない!', '#c0c8d0'); return; } // ボスには 効かない
            const before = t.buffs[sk.stat];
            t.buffs[sk.stat] = NS.clamp(before - sk.stage, -5, 5);
            t.buffT[sk.stat] = 4;
            const b = t.buffs[sk.stat];
            if (b !== before) n++;
            NS.arrowFx(t.pos, false, color);
            NS.popup(t.pos.x, 1.45, t.pos.z, b === before ? `${label} これいじょう 下がらない` : b < 0 ? `${label}↓ ${-b}段` : `${label}↓`, '#b8a0ff');
          }));
          NS.ui.refreshCards();
          msg(n ? `${targets.length === 1 ? targets[0].name : n + '人'}の ${label}が さがった!` : targets.every((t) => t.ch.monster) ? 'しかし ボスには きかなかった!' : 'しかし なにも おこらなかった');
          await NS.wait(700);
          break;
        }
        case 'weaken': { // みんなたたり (全属性耐性) / みんなダルダル (全状態異常耐性): 1 下げる (かならず 効く・−3 まで)
          NS.sfx('debuff');
          const f = sk.what === 'res' ? 'resDown' : 'stresDown', label = sk.what === 'res' ? '属性耐性' : '状態異常耐性';
          let n = 0;
          await Promise.all(targets.map(async (t) => {
            await NS.projectile(from, t.center(0.55), sk.what === 'res' ? 'pinkfire' : 'dark', 420, 0.5);
            if (!t.alive) return;
            if (sk.what === 'res') NS.impact('pinkfire', t.center(0.55));
            const before = t[f] || 0;
            t[f] = Math.min(3, before + 1);
            if (t[f] !== before) n++;
            NS.arrowFx(t.pos, false, NS.skillColor(sk));
            NS.popup(t.pos.x, 1.45, t.pos.z, t[f] === before ? `${label} これいじょう 下がらない` : `${label} −${t[f]}`, '#b8a0ff');
          }));
          msg(n ? `${n}人の ${label}が さがった!` : 'しかし なにも おこらなかった');
          await NS.wait(700);
          break;
        }
        case 'status': { // ねむり / どく / しびれ (1体 または 全体)
          NS.sfx('status');
          let hit = 0;
          const rolls = targets.map(() => ({ p: this.rnd(), turns: 1 + Math.floor(this.rnd() * 2) }));
          await Promise.all(targets.map(async (t, i) => {
            const c = t.center(0.55);
            await NS.projectile(from, c, 'dark', 420, 0.5);
            const turns = sk.status === 'sleep' || sk.status === 'paralyze' ? rolls[i].turns : 0;
            if (t.alive && rolls[i].p < this.statusChance(t, sk.status, sk.chance) && this.setStatus(t, sk.status, turns)) hit++;
            else NS.popup(c.x, 1.4, c.z, 'きかなかった', '#c0c8d0');
          }));
          const st = NS.STATUS[sk.status].name;
          if (hit) msg(targets.length === 1 ? `${targets[0].name}は ${st}に なった!` : `${hit}人が ${st}に なった!`);
          await NS.wait(650);
          break;
        }
      }
      u.v.glow = 0; u.v.armRaise = 0;
      await NS.wait(140);
      if (u.alive) { u.v.face = u.facing; u.v.expr = null; }
    }

    // ---------------- がんばれ (いちばん良い行動) ----------------
    // 味方ひとりずつ 行動を決める。予想HPを共有して 同じ敵を倒しすぎないようにする。
    //   かいふく: 味方が ひとりでも HP 50% を切っていたら 使う (切っていなければ 攻撃)
    //   ふっかつ: たおれた味方が いれば 使う
    //   そのほかの スキル: MP があれば 使う
    //   ねらう順: ふっかつ・かいふく を持つ敵から
    planSmart(units) {
      const S = {
        foeHp: new Map(), allyHp: new Map(), reviving: new Set(), statusing: new Set(), buffing: new Set(),
      };
      for (const u of this.units) (u.side === 'enemy' ? S.foeHp : S.allyHp).set(u, u.alive ? u.hp : 0);
      const plan = new Map();
      const order = units.slice().sort((a, b) => b.stat('spd') - a.stat('spd'));
      for (const u of order) plan.set(u, Object.assign(this.bestAction(u, S), { auto: true })); // auto = がんばれ (動く 前に 考えなおせる)
      return plan;
    }

    estPhys(a, d) { return ((a.stat('atk') * 1.25 * 100) / (100 + d.stat('def'))) * (d.guard ? 0.5 : 1) * 2 ** a.charge; }
    estSkill(a, d, sk) { return ((NS.ELEM_BASE * sk.power * 100) / (100 + d.stat('def') * 0.5)) * this.elemMul(d, sk.elem) * this.auraMul(a, sk); }
    // オーラの 属性の色: 自分の色の 属性の技が 強い
    auraMul(a, sk) {
      const C = NS.COLORS[a.ch.color], A = a.ch.aura && C.aura;
      return A && A.power && sk.elem && sk.elem === C.elem ? A.power : 1;
    }
    hitP(d, mul) { return Math.max(0.05, 1 - (d.stat('eva') * mul) / 100); }

    bestAction(u, S) {
      const foeMap = u.side === 'party' ? S.foeHp : S.allyHp;
      const allyMap = u.side === 'party' ? S.allyHp : S.foeHp;
      const foes = [...foeMap.keys()].filter((f) => f.alive && foeMap.get(f) > 0);
      const allies = this.alive(this.alliesOf(u));
      if (!foes.length) { // 全員たおせる予想でも、外れたときのために いちばん弱っている敵を ねらう
        const alive = this.alive(this.foesOf(u));
        return alive.length ? { type: 'attack', target: best(alive, (f) => -f.hp) } : { type: 'guard' };
      }
      // 与えるダメージ (倒せるなら ボーナス)
      const dmgVal = (f, d) => { const hp = foeMap.get(f); return Math.min(d, Math.max(0, hp)) + (d >= hp && hp > 0 ? 40 + f.stat('atk') * 0.5 : 0); };
      const hurt = (f, d) => foeMap.set(f, foeMap.get(f) - d * 0.85);
      // ふっかつ・かいふく を持つ敵を 先に ねらう
      const supporter = (f) => f.ch.skill && (f.ch.skill.kind === 'heal' || f.ch.skill.kind === 'revive');
      const pool = foes.some(supporter) ? foes.filter(supporter) : foes;

      const sk = u.ch.skill;
      if (sk && u.mp >= u.cost(sk) && !u.status.seal) {
        switch (sk.kind) {
          case 'cure': {
            if (S.curing || !allies.some((a) => Object.keys(a.status).length)) break;
            S.curing = true;
            return { type: 'skill', skill: sk };
          }
          case 'heal': {
            const ratio = (a) => allyMap.get(a) / a.maxHp;
            const low = allies.filter((a) => ratio(a) < 0.5);
            if (!low.length && !(sk.tgt === 'allies' && allies.filter((a) => ratio(a) < 0.7).length >= 2)) break; // みんなかいふく: 2体 以上が 70% 未満 でも
            const amt = sk.power * (0.85 + NS.healMp(u.ch) / 110);
            const up = (a) => allyMap.set(a, sk.full ? a.maxHp : Math.min(a.maxHp, allyMap.get(a) + (sk.frac ? a.maxHp * sk.frac : amt)));
            if (sk.tgt === 'allies') { allies.forEach(up); return { type: 'skill', skill: sk }; }
            const t = best(low, (a) => -ratio(a));
            up(t);
            return { type: 'skill', skill: sk, target: t };
          }
          case 'revive': {
            // みんなふっかつ: たおれた 味方が 1体でも いれば かならず 使う (ほかの なかまが ふっかつ予定でも)
            if (sk.tgt === 'deadAllies') {
              const all = this.alliesOf(u).filter((a) => !a.alive);
              if (!all.length) break;
              all.forEach((a) => S.reviving.add(a));
              return { type: 'skill', skill: sk };
            }
            const dead = this.alliesOf(u).filter((a) => !a.alive && !S.reviving.has(a));
            if (!dead.length) break;
            const t = best(dead, (a) => a.ch.score);
            S.reviving.add(t);
            return { type: 'skill', skill: sk, target: t };
          }
          case 'attack': {
            const est = (f) => this.estSkill(u, f, sk); // 属性スキルは 外れない
            if (sk.tgt === 'foes') { foes.forEach((f) => hurt(f, est(f))); return { type: 'skill', skill: sk }; }
            const hitsOf = (m) => (sk.area === 'three' ? this.threeTargets(m, this.foesOf(u)).filter((f) => foeMap.get(f) > 0) : [m]);
            const t = best(pool, (m) => hitsOf(m).reduce((v, f) => v + dmgVal(f, est(f)), 0));
            hitsOf(t).forEach((f) => hurt(f, est(f)));
            return { type: 'skill', skill: sk, target: t };
          }
          case 'status': {
            const ok = (f) => !f.status[sk.status] && !S.statusing.has(f);
            if (sk.tgt === 'foes') {
              const ts = foes.filter(ok);
              if (!ts.length) break;
              ts.forEach((f) => S.statusing.add(f));
              return { type: 'skill', skill: sk };
            }
            const ts = pool.some(ok) ? pool.filter(ok) : foes.filter(ok);
            if (!ts.length) break;
            const t = best(ts, (f) => f.stat('atk') + foeMap.get(f) * 0.1); // 強い敵ほど 止めたい・HP が多いほど どくが効く
            S.statusing.add(t);
            return { type: 'skill', skill: sk, target: t };
          }
          case 'charge': {
            if (sk.tgt === 'ally') { // 1体: パーティで 攻撃が いちばん 高い 味方に (×8 まで たまったら 次に 高い 味方)
              S.chargeAdd = S.chargeAdd || new Map();
              const ts = allies.filter((a) => a.charge + (S.chargeAdd.get(a) || 0) < 3);
              if (!ts.length) break;
              const t = best(ts, (a) => a.stat('atk'));
              S.chargeAdd.set(t, (S.chargeAdd.get(t) || 0) + 1);
              return { type: 'skill', skill: sk, target: t };
            }
            if (S.charging || !allies.some((a) => a.charge < 3)) break;
            S.charging = true;
            return { type: 'skill', skill: sk };
          }
          case 'weaken': { // まだ 下げられる 敵が いれば 使う (同じ スキルは 1ターンに 1回)
            const f = sk.what === 'res' ? 'resDown' : 'stresDown';
            if (S.buffing.has('weaken:' + f) || !foes.some((x) => (x[f] || 0) < 3)) break;
            S.buffing.add('weaken:' + f);
            return { type: 'skill', skill: sk };
          }
          case 'debuff': { // まだ 下げられる 敵が いれば 使う (同じ スキルは 1ターンに 1回)
            if (S.buffing.has('foes:' + sk.stat) || !foes.some((f) => !f.ch.monster && f.buffs[sk.stat] > -5)) break; // ボスには 効かないので 使わない
            S.buffing.add('foes:' + sk.stat);
            return { type: 'skill', skill: sk };
          }
          case 'buff': {
            if (sk.tgt === 'allies') { // みんなムキムキ など: 同じ スキルの なかまが 何人いても、5段に とどくまで みんな 使う
              S.buffAdd = S.buffAdd || {};
              const add = S.buffAdd[sk.stat] || 0;
              if (!allies.some((a) => !a.status.nobuff && a.buffs[sk.stat] + add < 5)) break; // 能力アップ無効の なかまには 効かない
              S.buffAdd[sk.stat] = add + 1;
              return { type: 'skill', skill: sk };
            }
            const ts = allies.filter((a) => a.buffs[sk.stat] < 5 && !a.status.nobuff && !S.buffing.has(a));
            if (!ts.length) break;
            const t = best(ts, (a) => a.ch.stats[sk.stat]);
            S.buffing.add(t);
            return { type: 'skill', skill: sk, target: t };
          }
        }
      }
      // 通常攻撃: ねらう順の中で いちばん効く (たおせる) 相手
      const est = (f) => this.estPhys(u, f) * this.hitP(f, 1);
      const t = best(pool, (f) => dmgVal(f, est(f)));
      hurt(t, est(t));
      return { type: 'attack', target: t };
    }

    // ---------------- AI ----------------
    ai(u) {
      if (u.ch.monster) return { type: 'monster' };
      const allies = this.alive(this.alliesOf(u));
      const foes = this.alive(this.foesOf(u));
      const skills = u.status.seal ? [] : u.ch.skills.filter((s) => u.mp >= u.cost(s));
      const find = (f) => skills.find(f);
      if (!foes.length) return { type: 'guard' };

      const dead = this.alliesOf(u).filter((a) => !a.alive);
      let sk = find((s) => s.kind === 'revive');
      if (sk && dead.length && Math.random() < 0.8) return { type: 'skill', skill: sk, target: dead[0] };

      const hurt = allies.filter((a) => a.hp < a.maxHp * 0.45);
      sk = find((s) => s.kind === 'heal' && s.tgt === 'allies');
      if (sk && hurt.length >= 2) return { type: 'skill', skill: sk };
      sk = find((s) => s.kind === 'heal' && s.tgt === 'ally');
      if (sk && hurt.length) return { type: 'skill', skill: sk, target: best(hurt, (a) => -a.hp / a.maxHp) };

      sk = find((s) => s.kind === 'cure');
      if (sk && allies.some((a) => Object.keys(a.status).length) && Math.random() < 0.8) return { type: 'skill', skill: sk };
      sk = find((s) => s.kind === 'charge');
      if (sk && allies.some((a) => a.charge < 3) && Math.random() < 0.5) {
        const t = sk.tgt === 'ally' ? best(allies.filter((a) => a.charge < 3), (a) => a.stat('atk')) : null;
        return { type: 'skill', skill: sk, target: t };
      }
      sk = find((s) => s.kind === 'debuff');
      if (sk && foes.some((f) => !f.ch.monster && f.buffs[sk.stat] > -3) && Math.random() < 0.4) return { type: 'skill', skill: sk };
      sk = find((s) => s.kind === 'weaken');
      if (sk && foes.some((f) => (f[sk.what === 'res' ? 'resDown' : 'stresDown'] || 0) < 3) && Math.random() < 0.5) return { type: 'skill', skill: sk };
      sk = find((s) => s.kind === 'buff');
      if (sk && this.turn <= 2 && allies.some((a) => !a.status.nobuff) && Math.random() < 0.45) {
        const t = sk.tgt === 'ally' ? best(allies, (a) => a.ch.stats[sk.stat] - a.buffs[sk.stat] * 50 + Math.random() * 10) : null;
        return { type: 'skill', skill: sk, target: t };
      }

      const off = skills.filter((s) => ['attack', 'status'].includes(s.kind));
      if (off.length && Math.random() < 0.55) {
        const s = pick(off);
        if (s.kind === 'status' && s.tgt === 'foes') {
          if (foes.filter((f) => !f.status[s.status]).length >= 2) return { type: 'skill', skill: s };
        } else if (s.tgt === 'foes') return { type: 'skill', skill: s };
        if (s.kind === 'attack') {
          const val = (f) => -(f.ch.res[s.elem] || 0) * 10 - (f.hp / f.maxHp) * 3;
          const score = s.area === 'three' ? (f) => this.threeTargets(f, foes).reduce((a, x) => a + val(x), 0) : val;
          return { type: 'skill', skill: s, target: best(foes, (f) => score(f) + Math.random() * 2) };
        }
        if (s.kind === 'status' && s.tgt === 'foe') {
          const c = foes.filter((f) => !f.status[s.status]);
          if (c.length) return { type: 'skill', skill: s, target: pick(c) };
        }
      }
      return { type: 'attack', target: best(foes, (f) => -f.hp / f.maxHp + Math.random() * 0.6) };
    }
  }
  NS.Battle = Battle;
})();
