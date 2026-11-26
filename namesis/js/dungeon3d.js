// 幻帝のどうくつ の 3D 表示: 石の 床と 壁、たいまつの 明かり、なかまが 一列に ついてくる
//   1マス = 1。地図の x → 3D の x、地図の y → 3D の z (画面の 下が +z)。カメラは ななめ上から ついていく
import * as THREE from 'three';
import { buildCharacter, poseCharacter } from './fig3d.js';

const NS = globalThis.NS;
const SPEED = 8.5; // 歩く 速さ (マス / 秒)。キーを 押しつづけたとき 止まらずに 歩ける 速さ
const FOLLOW = 0.9; // なかまの 間かく (マス)

let renderer = null, scene, camera, torch, cache = null;
const floorCache = new Map(); // 地図 → 3D の 床・壁など (入ったときに 5階 ぶん 先に 作る)
function setup(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x040507, 1);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x040507, 26, 46); // カメラは 先頭から 約 20 はなれる。その 先から 暗く
  camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120); // 画角は せまく・遠くから 見て 広く 見わたす
  scene.add(new THREE.HemisphereLight('#b4d8bc', '#2a2430', 1.2));
  const key = new THREE.DirectionalLight('#dff0e0', 0.9); key.position.set(-3, 8, 6); scene.add(key);
  torch = new THREE.PointLight('#ffc888', 30, 14, 1.3); scene.add(torch); // たいまつ (先頭の 上)
}

// 石だたみの 絵 (緑がかった 石)
function stoneTex(base, line, seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = base; c.fillRect(0, 0, 128, 128);
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.07})`; c.fillRect(r() * 128, r() * 128, 3, 3); }
  c.strokeStyle = line; c.lineWidth = 4;
  c.strokeRect(2, 2, 124, 124);
  c.beginPath(); c.moveTo(64, 2); c.lineTo(64, 64); c.moveTo(2, 64); c.lineTo(126, 64); c.moveTo(32, 64); c.lineTo(32, 126); c.moveTo(96, 64); c.lineTo(96, 126); c.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// 階ごとの 物 (床・壁・宝箱・階段・敵の 絵) を 作る
function buildFloor(m, W, H) {
  const group = new THREE.Group();
  group.visible = false;
  const floors = [], walls = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m.at(x, y) === 1) floors.push([x, y]);
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, b]) => x + a >= 0 && y + b >= 0 && x + a < W && y + b < H && m.at(x + a, y + b) === 1)) walls.push([x, y]);
  }
  const fMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.2, 1), new THREE.MeshStandardMaterial({ map: stoneTex('#4e6a52', 'rgba(20,30,22,0.8)', 7), roughness: 0.85 }), floors.length);
  const wMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.3, 1), new THREE.MeshStandardMaterial({ map: stoneTex('#3e5446', 'rgba(14,22,16,0.9)', 11), roughness: 0.9 }), walls.length);
  const col = new THREE.Color();
  floors.forEach(([x, y], i) => { const n = ((x * 73856093) ^ (y * 19349663)) % 100 / 100; fMesh.setColorAt(i, col.setHSL(0.36, 0.12, 0.8 + Math.abs(n) * 0.2)); });
  walls.forEach(([x, y], i) => { const n = ((x * 83492791) ^ (y * 2654435761)) % 100 / 100; wMesh.setColorAt(i, col.setHSL(0.38, 0.1, 0.7 + Math.abs(n) * 0.3)); });
  group.add(fMesh, wMesh);
  // 宝箱
  const chests = m.chests.map((c) => {
    const g = new THREE.Group(); g.position.set(c.x, 0.1, c.y);
    const wood = new THREE.MeshStandardMaterial({ color: '#8a5a2e', roughness: 0.7 }), gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.4, roughness: 0.35, emissive: '#4a3000' });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.3, 0.4), wood); base.position.y = 0.15; g.add(base);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.42), gold); band.position.y = 0.22; g.add(band);
    const lid = new THREE.Group(); lid.position.set(0, 0.3, -0.2); g.add(lid);
    const lidM = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.56, 16, 1, false, 0, Math.PI), wood); lidM.rotation.z = Math.PI / 2; lidM.position.z = 0.2; lid.add(lidM);
    const glow = new THREE.PointLight('#ffd88a', 0, 2.2, 2); glow.position.y = 0.6; g.add(glow);
    group.add(g);
    return { c, g, lid, glow };
  });
  // 階段 (下へ おりる 穴と 段)
  let stairs = null;
  if (m.stairs) {
    stairs = new THREE.Group(); stairs.position.set(m.stairs.x, 0, m.stairs.y);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.9), new THREE.MeshBasicMaterial({ color: '#05060a' })); hole.position.y = 0.105; stairs.add(hole);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.18), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.35, 0.1, 0.45 - i * 0.09) })); s.position.set(0, 0.1 - i * 0.04, -0.3 + i * 0.2); stairs.add(s); }
    group.add(stairs);
  }
  // 敵: コロシアムの 絵を 板に (いつも カメラを 向く)
  const loader = new THREE.TextureLoader();
  const foes = new Map();
  for (const e of m.enemies) {
    let body;
    if (e.key === 'kibakoumori') body = batModel();
    else if (e.key === 'butabanausagi') body = pigModel();
    else {
      const tex = loader.load(NS.monsterThumb(NS.makeMonster(e.key), 90, 110)); tex.colorSpace = THREE.SRGBColorSpace;
      body = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: true }));
      const h = e.boss ? 2.6 : 1.45; body.scale.set(h * 90 / 110, h, 1); body.center.set(0.5, 0.04);
    }
    const g = new THREE.Group(); g.add(body); g.add(blob(e.boss ? 0.7 : 0.42));
    if (e.boss) { const l = new THREE.PointLight('#ff2a4a', 8, 4, 1.5); l.position.y = 1.2; g.add(l); g.userData.boss = l; }
    const al = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTex(), transparent: true, depthTest: false })); al.scale.set(0.5, 0.5, 1); al.visible = false; al.renderOrder = 5; g.add(al); g.userData.alert = al;
    g.position.set(e.x, 0.1, e.y); group.add(g);
    foes.set(e, g);
  }
  scene.add(group);
  return { map: m, group, fMesh, wMesh, floors, walls, seenSum: -1, chests, stairs, foes };
}
// きばこうもりの 3D モデル: 青い まるい 体・とがった 耳・オレンジの はね (骨つき)・きばの ある 口・黒い 目 (前 = +z)
// ぶたばなうさぎの 3D モデル: ピンクの 頭・長い 耳・ぶたの 鼻・緑の 服・短剣・緑の まるい 盾 (前 = +z)
function pigModel() {
  const g = new THREE.Group(), s = 0.5;
  const pink = new THREE.MeshStandardMaterial({ color: '#f696b0', roughness: 0.5 }), dpink = new THREE.MeshStandardMaterial({ color: '#d66888', roughness: 0.5 });
  const green = new THREE.MeshStandardMaterial({ color: '#60c43c', roughness: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: '#23262c', roughness: 0.4 });
  const ell = (rx, ry, rz, m) => { const geo = new THREE.SphereGeometry(1, 28, 20); geo.scale(rx, ry, rz); return new THREE.Mesh(geo, m); };
  for (const sx of [-1, 1]) { const f = ell(s * 0.14, s * 0.2, s * 0.16, pink); f.position.set(sx * s * 0.24, s * 0.18, 0); g.add(f); }
  const body = ell(s * 0.55, s * 0.62, s * 0.5, green); body.position.y = s * 0.9; g.add(body);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(s * 0.53, s * 0.05, 8, 32), new THREE.MeshStandardMaterial({ color: '#6a3e1c' })); belt.rotation.x = Math.PI / 2; belt.position.y = s * 0.8; g.add(belt);
  const head = ell(s * 0.72, s * 0.66, s * 0.66, pink); head.position.y = s * 1.95; g.add(head);
  for (const sx of [-1, 1]) {
    const ear = ell(s * 0.2, s * 0.55, s * 0.12, pink); ear.position.set(sx * s * 0.32, s * 2.8, -s * 0.05); ear.rotation.z = -sx * 0.2; g.add(ear);
    const inner = ell(s * 0.1, s * 0.42, s * 0.05, new THREE.MeshStandardMaterial({ color: '#ffc4d4' })); inner.position.set(sx * s * 0.32, s * 2.8, s * 0.07); inner.rotation.z = -sx * 0.2; g.add(inner);
    const eye = ell(s * 0.06, s * 0.08, s * 0.03, dark); eye.position.set(sx * s * 0.26, s * 2.02, s * 0.62); g.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(s * 0.24, s * 0.04, s * 0.03), new THREE.MeshStandardMaterial({ color: '#8a3050' })); brow.position.set(sx * s * 0.26, s * 2.18, s * 0.6); brow.rotation.z = sx * 0.4; g.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.22, s * 0.24, s * 0.16, 24), dpink); nose.rotation.x = Math.PI / 2; nose.position.set(0, s * 1.82, s * 0.66); g.add(nose);
  for (const sx of [-1, 1]) { const n = ell(s * 0.045, s * 0.07, s * 0.02, new THREE.MeshStandardMaterial({ color: '#7a2840' })); n.position.set(sx * s * 0.08, s * 1.82, s * 0.75); g.add(n); }
  // 短剣 (右手)
  const blade = new THREE.Group(); blade.position.set(-s * 0.6, s * 0.95, s * 0.2);
  const bl = new THREE.Mesh(new THREE.BoxGeometry(s * 0.08, s * 0.03, s * 0.9), new THREE.MeshStandardMaterial({ color: '#d8dde6', metalness: 0.6, roughness: 0.3 })); bl.position.z = s * 0.5; blade.add(bl);
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(s * 0.3, s * 0.05, s * 0.05), new THREE.MeshStandardMaterial({ color: '#c8a040' })); blade.add(hilt);
  g.add(blade);
  // 盾 (左手)
  const shield = new THREE.Group(); shield.position.set(s * 0.62, s * 0.95, s * 0.25); shield.rotation.y = 0.5;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 0.08, 32), new THREE.MeshStandardMaterial({ color: '#46aa46', roughness: 0.5 })); disc.rotation.x = Math.PI / 2; shield.add(disc);
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.17, s * 0.17, s * 0.1, 24), dark); boss.rotation.x = Math.PI / 2; boss.position.z = s * 0.03; shield.add(boss);
  g.add(shield);
  g.userData.walker = true; g.userData.blade = blade;
  return g;
}
function batModel() {
  const g = new THREE.Group(), s = 0.44;
  const blue = new THREE.MeshStandardMaterial({ color: '#4678dc', roughness: 0.45 }), dblue = new THREE.MeshStandardMaterial({ color: '#244296', roughness: 0.5 });
  const orange = new THREE.MeshStandardMaterial({ color: '#ee9632', roughness: 0.55, side: THREE.DoubleSide }), bone = new THREE.MeshStandardMaterial({ color: '#ffc070', roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(s, 32, 24), blue); body.scale.set(1.05, 0.95, 0.95); body.position.y = s; g.add(body);
  for (const sx of [-1, 1]) { // 耳
    const ear = new THREE.Mesh(new THREE.ConeGeometry(s * 0.28, s * 0.75, 16), blue); ear.position.set(sx * s * 0.45, s * 1.75, 0); ear.rotation.z = -sx * 0.35; g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(s * 0.16, s * 0.5, 12), dblue); inner.position.set(sx * s * 0.44, s * 1.7, s * 0.09); inner.rotation.z = -sx * 0.35; g.add(inner);
  }
  for (const sx of [-1, 1]) { // 目
    const eye = new THREE.Mesh(new THREE.SphereGeometry(s * 0.1, 12, 8), new THREE.MeshStandardMaterial({ color: '#10142a', roughness: 0.2 })); eye.scale.z = 0.5; eye.position.set(sx * s * 0.32, s * 1.28, s * 0.86); g.add(eye);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(s * 0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); hi.position.set(sx * s * 0.32 - s * 0.03, s * 1.32, s * 0.92); g.add(hi);
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(s * 0.42, 24, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: '#c42828', roughness: 0.6 })); // 大きく あいた 口
  mouth.position.set(0, s * 0.92, s * 0.94); mouth.rotation.x = -0.2; mouth.scale.y = 0.75; g.add(mouth);
  for (const sx of [-1, 1]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(s * 0.07, s * 0.2, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' })); fang.rotation.x = Math.PI; fang.position.set(sx * s * 0.2, s * 0.84, s * 0.96); g.add(fang); }
  const wings = [-1, 1].map((sx) => { // はね: 体の よこから 外へ。骨と ぎざぎざの 膜
    const pivot = new THREE.Group(); pivot.position.set(sx * s * 0.85, s * 1.05, -s * 0.1);
    const pts = [[0, 0.05], [0.5, 0.42], [1.05, 0.5], [1.12, 0.22], [0.9, 0.0], [0.7, 0.12], [0.5, -0.08], [0.3, 0.04], [0.1, -0.1]].map(([x, y]) => [sx * x * s * 1.2, y * s * 1.2]);
    const shape = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    pivot.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), orange));
    for (const [x, y] of [[1.05, 0.5], [0.9, 0.0], [0.5, -0.08]]) {
      const A = new THREE.Vector3(0, 0.05 * s * 1.2, 0.01), B = new THREE.Vector3(sx * x * s * 1.2, y * s * 1.2, 0.01);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, A.distanceTo(B), 6), bone);
      b.position.copy(A).add(B).multiplyScalar(0.5); b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); pivot.add(b);
    }
    g.add(pivot);
    return pivot;
  });
  for (const sx of [-1, 1]) { const foot = new THREE.Mesh(new THREE.SphereGeometry(s * 0.12, 10, 8), orange); foot.position.set(sx * s * 0.28, s * 0.08, s * 0.2); g.add(foot); }
  g.userData.wings = wings;
  return g;
}
let alertTex0 = null;
function alertTex() { // 見つけたときの 赤い !
  if (alertTex0) return alertTex0;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d'); c.font = '900 56px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 8; c.strokeStyle = '#fff'; c.strokeText('!', 32, 34); c.fillStyle = '#ff2a3a'; c.fillText('!', 32, 34);
  alertTex0 = new THREE.CanvasTexture(cv); alertTex0.colorSpace = THREE.SRGBColorSpace;
  return alertTex0;
}
let blobTex = null;
function blob(r) { // 足もとの 影
  if (!blobTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(cv);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.11;
  return m;
}
// 見た ことの ある マスだけ 出す
const M4 = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
//   壁は いつも 高さ そのまま (手前の 壁に なかまが かくれる こともある)
function updateSeen(W, px, py) {
  const m = cache.map; let sum = 0;
  for (let i = 0; i < m.seen.length; i++) sum += m.seen[i];
  const key = sum + ':' + Math.round(px) + ':' + Math.round(py);
  if (key === cache.seenKey) return;
  cache.seenKey = key;
  cache.floors.forEach(([x, y], i) => cache.fMesh.setMatrixAt(i, m.seen[y * W + x] ? M4.makeTranslation(x, 0, y) : ZERO));
  cache.walls.forEach(([x, y], i) => cache.wMesh.setMatrixAt(i, m.seen[y * W + x] ? M4.makeTranslation(x, 0.55, y) : ZERO));
  cache.fMesh.instanceMatrix.needsUpdate = true; cache.wMesh.instanceMatrix.needsUpdate = true;
}

// なかま (先頭 + ついてくる なかま)
let team = null;
function buildTeam(run) {
  if (team) for (const u of team.units) scene.remove(u.root);
  const p0 = run.p || run.maps[0].start;
  const units = run.party.map((k, i) => {
    const ch = NS.ui.ch(k), root = buildCharacter(ch);
    const holder = new THREE.Group(); holder.add(root); holder.add(blob(0.3)); root.scale.setScalar(1.25);
    holder.position.set(p0.x, 0.1, p0.y); scene.add(holder);
    return { i, root: holder, model: root, pos: new THREE.Vector2(p0.x, p0.y), face: 0, walk: 0, ghost: null };
  });
  team = { run, units, path: [new THREE.Vector2(p0.x, p0.y)] };
}
function setGhost(u, on) { // たおれた なかまは すけて ついてくる
  if (u.ghost === on) return;
  u.ghost = on;
  u.model.traverse((o) => { if (o.material && !o.isSprite) { if (o.material.userData.t0 == null) { o.material.userData.t0 = o.material.transparent; o.material.userData.o0 = o.material.opacity; } o.material.transparent = on || o.material.userData.t0; o.material.opacity = on ? 0.4 : (o.material.userData.o0 ?? 1); o.material.depthWrite = !on; o.material.needsUpdate = true; } });
}

let lastT = 0;
// 毎フレーム: run = 今の もぐり、vis(x, y) = 今 見えているか
export function draw(run, t, W, H, vis) {
  const canvas = document.getElementById('dg-3d');
  if (!renderer) setup(canvas);
  const cw = canvas.clientWidth, chh = canvas.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(cw, chh, false); camera.aspect = cw / chh; camera.updateProjectionMatrix(); }
  const dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
  if (!cache || cache.map !== run.map) { // 階が かわった: 先に 作っておいた 階に 切りかえ
    if (cache) cache.group.visible = false;
    if (!floorCache.has(run.map)) floorCache.set(run.map, buildFloor(run.map, W, H));
    cache = floorCache.get(run.map); cache.group.visible = true; cache.seenKey = null;
    if (team && team.run === run) { for (const u of team.units) u.pos.set(run.p.x, run.p.y); team.path = [new THREE.Vector2(run.p.x, run.p.y)]; } }
  if (!team || team.run !== run) buildTeam(run);
  updateSeen(W, team.units[0].pos.x, team.units[0].pos.y);

  // 先頭は 地図の 位置へ 一定の 速さで 歩く。歩いた 道すじを 記録して、なかまは その 上を ついてくる
  const lead = team.units[0], goal = new THREE.Vector2(run.p.x, run.p.y);
  const moveTo = (u, target, max) => {
    const d = target.clone().sub(u.pos), len = d.length();
    if (len < 1e-4) return 0;
    if (len > 3) { u.pos.copy(target); return 0; } // 階を おりた など: すぐ その 位置へ
    u.face = Math.atan2(d.x, d.y); // 進む 向き (前 = +z)
    const step = Math.min(len, max);
    u.pos.add(d.multiplyScalar(step / len));
    return step;
  };
  const leadStep = moveTo(lead, goal, SPEED * dt);
  const last = team.path[0];
  if (last.distanceTo(lead.pos) > 0.05) { team.path.unshift(lead.pos.clone()); if (team.path.length > 400) team.path.length = 400; }
  // なかま i は 道すじに そって 先頭から i × FOLLOW の ところ
  const along = (dist) => {
    let acc = 0;
    for (let k = 0; k < team.path.length - 1; k++) {
      const a = team.path[k], b = team.path[k + 1], l = a.distanceTo(b);
      if (acc + l >= dist) return a.clone().lerp(b, (dist - acc) / l);
      acc += l;
    }
    return team.path[team.path.length - 1].clone();
  };
  team.units.forEach((u, i) => {
    const step = i === 0 ? leadStep : moveTo(u, along(i * FOLLOW), SPEED * 1.3 * dt);
    u.walk = step > 1e-3 ? u.walk + dt * 14 : 0;
    u.root.position.set(u.pos.x, 0.1 + (step > 1e-3 ? Math.abs(Math.sin(u.walk)) * 0.05 : 0), u.pos.y);
    // 向きは なめらかに
    const df = Math.atan2(Math.sin(u.face - u.root.rotation.y), Math.cos(u.face - u.root.rotation.y));
    u.root.rotation.y += df * Math.min(1, dt * 12);
    const st = run.state[i];
    setGhost(u, !!st && st.hp <= 0);
    poseCharacter(u.model, t + i * 0.7, { step: step > 1e-3 ? u.walk : 0, armRaise: step > 1e-3 ? 0.05 + Math.sin(u.walk) * 0.05 : 0 });
  });

  // 宝箱 (あくと ふたが ひらく)・敵
  for (const c of cache.chests) {
    c.g.visible = !!cache.map.seen[c.c.y * W + c.c.x];
    c.lid.rotation.x += ((c.c.open ? -1.9 : 0) - c.lid.rotation.x) * Math.min(1, dt * 8);
    c.glow.intensity = c.c.open ? 0 : 1.5 + Math.sin(t * 4 + c.c.x) * 0.7;
  }
  if (cache.stairs) cache.stairs.visible = !!cache.map.seen[cache.map.stairs.y * W + cache.map.stairs.x];
  for (const [e, g] of cache.foes) {
    const alive = cache.map.enemies.includes(e);
    g.visible = alive && !!cache.map.seen[Math.round(e.y) * W + Math.round(e.x)]; // 地形が 見えていれば どんなに 遠くても 見える
if (g.userData.alert) g.userData.alert.visible = e.chase > 0 && !e.stun; // 見つけた!
    if (!alive) continue;
    const dx = e.x - g.position.x, dz = e.y - g.position.z, l = Math.hypot(dx, dz);
    g.position.set(e.x, 0.1, e.y); // 敵の 位置は 小数で なめらかに 動く
    const body = g.children[0];
    if (body.userData.wings) { // きばこうもり: ふわふわ 飛んで、向いている ほうを 向く。はねを ぱたぱた
      body.position.y = 0.35 + Math.sin(t * 3 + e.id) * 0.08;
      const df = Math.atan2(Math.sin((e.dir || 0) - body.rotation.y), Math.cos((e.dir || 0) - body.rotation.y));
      body.rotation.y += df * Math.min(1, dt * 10);
      const f = Math.sin(t * (e.chase > 0 ? 22 : 12) + e.id) * 0.6;
      body.userData.wings[0].rotation.y = 0.3 + f; body.userData.wings[1].rotation.y = -0.3 - f;
    } else if (body.userData.walker) { // ぶたばなうさぎ: 向いている ほうを 向いて てくてく 歩く
      const df = Math.atan2(Math.sin((e.dir || 0) - body.rotation.y), Math.cos((e.dir || 0) - body.rotation.y));
      body.rotation.y += df * Math.min(1, dt * 10);
      body.position.y = Math.abs(Math.sin(t * (e.chase > 0 ? 14 : 7) + e.id)) * (e.chase > 0 ? 0.1 : 0.05);
      body.userData.blade.rotation.x = e.chase > 0 ? -0.8 + Math.sin(t * 14) * 0.5 : -0.3;
    } else body.position.y = Math.abs(Math.sin(t * (e.chase > 0 ? 12 : 5) + e.id)) * (e.chase > 0 ? 0.12 : 0.04);
if (g.userData.alert) g.userData.alert.position.y = (e.boss ? 2.8 : 1.65) + Math.abs(Math.sin(t * 10)) * 0.1;
    if (g.userData.boss) g.userData.boss.intensity = 6 + Math.sin(t * 3) * 3;
  }

  // たいまつと カメラ (先頭を ななめ上から)
  torch.position.set(lead.pos.x, 2.2, lead.pos.y + 0.4);
  torch.intensity = 26 + Math.sin(t * 9) * 1.5 + Math.sin(t * 23) * 1;
  const want = new THREE.Vector3(lead.pos.x, 16.5, lead.pos.y + 12.5);
  camera.position.lerp(want, Math.min(1, dt * 6));
  if (camera.position.distanceTo(want) > 8) camera.position.copy(want);
  camera.lookAt(camera.position.x, 0, camera.position.z - 11.9);
  renderer.render(scene, camera);
}
// 入った とき: 5階 ぶんの 床・壁・宝箱・敵と なかまの モデルを 先に 作る (読みこみ画面の 間)
export async function prepare(run, W, H, step) {
  if (!renderer) setup(document.getElementById('dg-3d'));
  reset();
  for (let i = 0; i < run.maps.length; i++) { floorCache.set(run.maps[i], buildFloor(run.maps[i], W, H)); await step(`B${i + 1}F を 組み立てています…`); }
  buildTeam(run);
  renderer.compile(scene, camera); // 最初の 1歩で 止まらないように 先に 準備
  await step('なかまの 準備…');
}
// おわったら すてる
export function reset() {
  for (const c of floorCache.values()) { scene.remove(c.group); c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  floorCache.clear(); cache = null;
  if (team) for (const u of team.units) scene.remove(u.root);
  team = null;
}
NS.dungeon3d = { draw, reset, prepare };
