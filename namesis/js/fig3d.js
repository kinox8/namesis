// 3D の キャラ (テスト): 名前から 生まれる キャラを Three.js で 立体に 組み立てる
//   今の 2D と 同じ 値 (色・頭の形・体型・背・顔) を 使う。顔は 2D の 顔を 絵にして 頭の 前に 貼る
//   バトルなどでは 1体ずつ 描いて 2D の 画面に 重ねる (奥行きの 順番・エフェクト・数字は 今までどおり)
import * as THREE from 'three';

const NS = globalThis.NS;
const R = NS.HEAD_R; // 頭の 半径 (0.27)

// ---------------- 頭の 形 ----------------
// 2D の 頭の 輪郭 (NS.headPath) を そのまま 使い、中心から 外への きょりで 球を ふくらませる
const outlineCache = new Map();
function outline(key) {
  if (outlineCache.has(key)) return outlineCache.get(key);
  const S = 100, cv = document.createElement('canvas'); cv.width = cv.height = 420;
  const c = cv.getContext('2d');
  c.translate(210, 210);
  NS.headPath(c, key, S, 0, 0);
  const N = 360, rr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, dx = Math.cos(a), dy = -Math.sin(a); // 3D の 上 = 2D の 上 (y を 反転)
    let d = 1;
    while (d < 205 && c.isPointInPath(210 + dx * d, 210 + dy * d)) d += 0.5;
    rr[i] = d / S;
  }
  outlineCache.set(key, rr);
  return rr;
}
const radiusAt = (rr, a) => { const f = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * rr.length, i = Math.floor(f), k = f - i; return rr[i % rr.length] * (1 - k) + rr[(i + 1) % rr.length] * k; };
function inflatedHead(key, depth = 0.9) {
  const g = new THREE.SphereGeometry(1, 96, 64), p = g.attributes.position, rr = outline(key), mean = rr.reduce((s, v) => s + v, 0) / rr.length;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(y, x);
    const k = mean + (radiusAt(rr, a) - mean) * (1 - z * z * 0.85); // 前 (顔の あたり) は なめらかに、ふちほど 輪郭どおり
    p.setXYZ(i, x * k * R, y * k * R, z * R * depth * Math.min(1.15, 0.75 + 0.25 * k));
  }
  g.computeVertexNormals();
  return g;
}
// THREE.Shape を 2D キャンバスの ように 使う (y は 反転)
function shapeCtx(shape) {
  return {
    beginPath() {}, closePath() {},
    moveTo: (x, y) => shape.moveTo(x, -y), lineTo: (x, y) => shape.lineTo(x, -y),
    bezierCurveTo: (a, b, c, d, e, f) => shape.bezierCurveTo(a, -b, c, -d, e, -f),
    quadraticCurveTo: (a, b, c, d) => shape.quadraticCurveTo(a, -b, c, -d),
    arc: (x, y, r, a0, a1, ccw) => shape.absarc(x, -y, r, -a0, -a1, !ccw),
    ellipse: (x, y, rx, ry, rot, a0, a1, ccw) => shape.absellipse(x, -y, rx, ry, -a0, -a1, !ccw, -rot),
    arcTo: (x1, y1) => shape.lineTo(x1, -y1),
  };
}
function roundedBox(w, h, d, r) {
  const s = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r;
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(x, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, y); s.quadraticCurveTo(-w / 2, -h / 2, x, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: 5, curveSegments: 6 });
  g.translate(0, 0, -(d - r * 2) / 2);
  return g;
}
const headGeoCache = new Map();
function headGeometry(key) {
  if (headGeoCache.has(key)) return headGeoCache.get(key);
  let g;
  switch (key) {
    case 'round': case 'cat': case 'bear': case 'bunny': case 'devil': case 'saturn': case 'odango': case 'wings': g = new THREE.SphereGeometry(R, 64, 48); break;
    case 'egg': g = new THREE.SphereGeometry(R, 64, 48); g.scale(0.86, 1.08, 0.9); g.translate(0, R * 0.06, 0); break;
    case 'mochi': g = new THREE.SphereGeometry(R, 64, 48); g.scale(1.16, 0.84, 0.95); g.translate(0, -R * 0.1, 0); break;
    case 'box': g = roundedBox(R * 1.75, R * 1.75, R * 1.75, R * 0.18); break;
    case 'block': g = roundedBox(R * 1.6, R * 2.1, R * 1.5, R * 0.16); break;
    case 'moon': { // みかづき: 輪郭を そのまま 厚みの ある 形に
      const shape = new THREE.Shape();
      NS.headPath(shapeCtx(shape), 'moon', R, 0, 0);
      g = new THREE.ExtrudeGeometry(shape, { depth: R * 0.6, bevelEnabled: true, bevelThickness: R * 0.35, bevelSize: R * 0.12, bevelSegments: 8, curveSegments: 48 });
      g.translate(0, 0, -R * 0.3);
      break;
    }
    default: g = inflatedHead(key, key === 'castle' ? 0.95 : 0.85);
  }
  headGeoCache.set(key, g);
  return g;
}

// ---------------- 顔: 2D の 顔を 絵に して、頭の 前に 正面から 投影して 貼る ----------------
const FX0 = -1.05, FY0 = 0.17 - 1.05, FS = 2.1; // 顔の 座標の 範囲 (2D の 顔の 中心 = (0, 0.17))
function faceTexture(ch, expr) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const c = cv.getContext('2d');
  c.scale(512 / FS, 512 / FS); c.translate(-FX0, -FY0);
  NS.drawFaceOnly(c, ch, { t: 0, expr });
  const tex = new THREE.CanvasTexture(cv);
  const E = ch.equips && ch.equips.face && NS.EQUIPS[ch.equips.face], im = E && E.img && NS.pic(E.img);
  if (im && !im.naturalWidth) im.addEventListener('load', () => { c.clearRect(FX0, FY0, FS, FS); NS.drawFaceOnly(c, ch, { t: 0, expr }); tex.needsUpdate = true; }, { once: true });
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
function faceGeometry(ch, headGeo) {
  const boxy = ch.head === 'box' || ch.head === 'block';
  const fit = NS.FACE_FIT[ch.head] || NS.FACE_FIT.round, fr = boxy ? R * 0.82 : R * fit[0], oy = 0.02 + R * (boxy ? 0 : fit[1]);
  const g = headGeo.clone(), p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const fx = p.getX(i) / fr, fy = (-p.getY(i) - oy) / fr, front = n.getZ(i) > 0.15;
    uv[i * 2] = front ? (fx - FX0) / FS : 0;
    uv[i * 2 + 1] = front ? 1 - (fy - FY0) / FS : 0;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------- 体 ----------------
function mat(color, o = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.45, metalness: 0.05 }, o)); }
function ellipsoid(rx, ry, rz, material) { const g = new THREE.SphereGeometry(1, 40, 28); g.scale(rx, ry, rz); return new THREE.Mesh(g, material); }

// キャラ 1体の モデル。userData.parts に 動かす 部品、userData.mats に 色を 変える 材質
export function buildCharacter(ch) {
  const L = ch.look, ws = L.w;
  const base = new THREE.Color(NS.COLORS[ch.color].hex);
  const auraOn = !!ch.aura;
  const bodyMat = mat(base, auraOn ? { emissive: base.clone().multiplyScalar(0.45) } : {});
  const darkMat = mat(base.clone().multiplyScalar(0.8));
  // 体の つくり (2D と 同じ 式。y は 上が プラス)
  const legH = 0.17 * (L.leg || 1), bodyRy = 0.19 * (L.torso || 1), bodyY = legH + bodyRy * 0.74;
  const shoulderY = bodyY + bodyRy * 0.47, headY = bodyY + bodyRy + 0.2;

  const root = new THREE.Group(), parts = { arms: [], legs: [], head: null, antenna: null, glow: null };
  const fig = new THREE.Group(); fig.scale.setScalar(L.h); root.add(fig); parts.fig = fig;
  const legX = 0.075 * Math.max(0.85, ws), legW = 0.048 * (0.75 + 0.25 * ws);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(legW, Math.max(0.01, legH - legW), 8, 16), darkMat);
    leg.position.set(sx * legX, legH / 2 + 0.005, 0);
    fig.add(leg); parts.legs.push({ leg, sx, y: leg.position.y });
  }
  const body = ellipsoid(0.165 * ws, bodyRy, 0.15 * ws, bodyMat);
  body.position.y = bodyY; fig.add(body);
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.18 * ws, shoulderY, 0);
    const arm = ellipsoid(0.052, 0.105, 0.052, bodyMat); arm.position.y = -0.09;
    pivot.add(arm); pivot.rotation.z = sx * 0.35; fig.add(pivot);
    if (eq(ch, 'majorobe')) { const sl = ellipsoid(0.064, 0.1, 0.064, mat('#46206e')); sl.position.y = -0.07; pivot.add(sl); } // ながそで
    if (eq(ch, 'jewel') || eq(ch, 'nyushi')) { const sl = ellipsoid(0.064, 0.062, 0.064, mat(eq(ch, 'nyushi') ? TIGHTS : SUIT)); sl.position.y = -0.035; pivot.add(sl); } // 半そで
    parts.arms.push({ pivot, sx });
  }
  const head = new THREE.Group(); head.position.y = headY; fig.add(head); parts.head = head; parts.headY = headY;
  const hg = headGeometry(ch.head);
  head.add(new THREE.Mesh(hg, bodyMat));
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(ch, null), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  const face = new THREE.Mesh(faceGeometry(ch, hg), faceMat);
  face.renderOrder = 1; head.add(face);
  addHeadParts(ch, head, bodyMat, base);
  addEquips(ch, fig, parts, { bodyY, bodyRy, shoulderY, ws });
  const top = R * (NS.HEAD_TOP[ch.head] || 1);
  const maou = eq(ch, 'maoucrown'), hat = eq(ch, 'majohat');
  if (maou) head.add(maouCrown(top));
  else if (hat) head.add(majoHat(top));
  else if (ch.rank === 'NAMESIS') head.add(crown(top));
  if (ch.skill) { // まおうのかんむりは やりの 先から・まじょのぼうしは ぼうしの 先から
    const a = antenna(ch, maou ? top + R * (NS.CROWN_TIP / 55 - 1) : hat ? top + R * NS.HAT_TIP : top);
    if (hat) a.group.position.x = R * 0.3;
    head.add(a.group); parts.antenna = a;
  }
  if (auraOn) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: base.clone().lerp(new THREE.Color('#fff'), 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    sp.scale.set(1.3, 1.6, 1); sp.position.y = headY * 0.65; fig.add(sp); parts.glow = sp;
  }
  // 色を 変える (ダメージの 白・たおれた 灰色・半とうめい) ための 材質の 一覧
  const mats = [];
  root.traverse((o) => { if (o.material && !mats.includes(o.material)) mats.push(o.material); });
  for (const m of mats) m.userData.color0 = m.color ? m.color.clone() : null;
  root.userData = { parts, mats, faceMat, ch, faceExpr: null, faces: { null: faceMat.map }, phase: L.phase || 0 };
  return root;
}

// 耳・角・輪 (頭の 形ごとの 飾り)
function addHeadParts(ch, head, m, base) {
  const k = ch.head;
  if (k === 'cat') for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(R * 0.36, R * 0.7, 24), m);
    e.position.set(sx * R * 0.58, R * 0.82, 0); e.rotation.z = -sx * 0.3; head.add(e);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(R * 0.18, R * 0.42, 16), mat('#ffa0b4'));
    inner.position.set(sx * R * 0.56, R * 0.76, R * 0.1); inner.rotation.z = -sx * 0.3; head.add(inner);
  }
  if (k === 'bear') for (const sx of [-1, 1]) {
    const e = ellipsoid(R * 0.33, R * 0.33, R * 0.2, m); e.position.set(sx * R * 0.62, R * 0.72, 0); head.add(e);
    const inner = ellipsoid(R * 0.17, R * 0.17, R * 0.05, mat('#7a5848')); inner.position.set(sx * R * 0.62, R * 0.7, R * 0.16); head.add(inner);
  }
  if (k === 'bunny') for (const sx of [-1, 1]) {
    const e = ellipsoid(R * 0.26, R * 0.78, R * 0.18, m); e.position.set(sx * R * 0.42, R * 1.42, 0); e.rotation.z = -sx * 0.18; head.add(e);
    const inner = ellipsoid(R * 0.12, R * 0.55, R * 0.05, mat('#ffa0b4')); inner.position.set(sx * R * 0.43, R * 1.42, R * 0.14); inner.rotation.z = -sx * 0.18; head.add(inner);
  }
  if (k === 'devil') for (const sx of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx * R * 0.7, R * 0.35, 0), new THREE.Vector3(sx * R * 1.35, R * 0.5, 0), new THREE.Vector3(sx * R * 1.35, R * 1.3, 0));
    const g = new THREE.TubeGeometry(curve, 24, 1, 12);
    const p = g.attributes.position; // 先へ いくほど 細く
    for (let i = 0; i < p.count; i++) { const seg = Math.floor(i / 13) / 24, c = curve.getPoint(seg), f = R * 0.2 * (1 - seg * 0.92); p.setXYZ(i, c.x + (p.getX(i) - c.x) * f, c.y + (p.getY(i) - c.y) * f, c.z + (p.getZ(i) - c.z) * f); }
    g.computeVertexNormals();
    head.add(new THREE.Mesh(g, m));
  }
  if (k === 'saturn') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.75, R * 0.12, 12, 64), mat(base.clone().lerp(new THREE.Color('#fff'), 0.5), { transparent: true, opacity: 0.85 }));
    ring.scale.z = 0.35; ring.rotation.x = Math.PI / 2 - 0.25; ring.position.y = R * 0.35; head.add(ring);
  }
  if (k === 'silkhat') { // つば
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.45, R * 1.45, R * 0.08, 48), mat(base.clone().multiplyScalar(0.8)));
    brim.position.y = R * 0.42; head.add(brim);
  }
  if (k === 'odango') for (const sx of [-1, 1]) { // まるい おだんご (頭と 同じ 色)
    const e = new THREE.Mesh(new THREE.SphereGeometry(R * 0.34, 32, 24), m); e.position.set(sx * R * 0.68, R * 0.84, -R * 0.1); head.add(e);
    const kushi = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.035, R * 0.035, R * 1.15, 8), mat(base.clone().multiplyScalar(0.75))); // 串 (ななめ・体の 色)
    kushi.position.copy(e.position); kushi.rotation.z = -sx * 0.5; head.add(kushi);
  }
  if (k === 'wings') for (const sx of [-1, 1]) { // 3まいの 羽根
    const wm = mat(base.clone().multiplyScalar(0.45), { side: THREE.DoubleSide });
    const piv = new THREE.Group(); piv.position.set(sx * R * 0.8, R * 0.35, -R * 0.2);
    [[0.62, 1.05], [0.48, 0.85], [0.36, 0.65]].forEach(([a, l], i) => {
      const f = ellipsoid(R * l * 0.5, R * 0.14, R * 0.05, wm);
      f.position.set(sx * R * l * 0.45, R * (0.25 - i * 0.18), 0); f.rotation.z = sx * a; piv.add(f);
    });
    head.add(piv);
  }
  if (k === 'meteor') { // しっぽ
    const g = new THREE.ConeGeometry(R * 0.55, R * 2.6, 24, 1, true); g.translate(0, R * 1.3, 0);
    const t = new THREE.Mesh(g, mat(base.clone().lerp(new THREE.Color('#fff'), 0.5), { transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    t.position.set(R * 0.3, R * 0.25, -R * 0.4); t.rotation.set(-0.6, 0, -0.95); head.add(t);
  }
}
function crown(top) {
  const g = new THREE.Group(), m = mat('#f2c230', { metalness: 0.6, roughness: 0.3, emissive: '#5a3a00' });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 24), m));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, s = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), m);
    s.position.set(Math.cos(a) * 0.1, 0.06, Math.sin(a) * 0.1); g.add(s);
  }
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), mat('#ff3d6e', { emissive: '#600010' })); gem.position.set(0, 0, 0.115); g.add(gem);
  g.position.y = top + 0.02;
  return g;
}
// アンテナ: 細い 棒 + 先に スキルの アイコン (いつも カメラを 向く 板)
// ---------------- 装備 ----------------
const eq = (ch, key) => NS.equipKeys(ch.equips).includes(key);
const SUIT = '#ffd23a', TIGHTS = '#f6f0d6';
// にゅうしタイツの 絵 (まつげの 目と ほっぺ)
let tightsTex0 = null;
function tightsTex() {
  if (tightsTex0) return tightsTex0;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = TIGHTS; c.fillRect(0, 0, 256, 128);
  for (const sx of [-1, 1]) {
    const x = 128 + sx * 40, y = 58;
    c.beginPath(); c.ellipse(x, y, 17, 24, 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#2a2a30'; c.stroke();
    c.beginPath(); c.ellipse(x, y + 4, 10, 16, 0, 0, Math.PI * 2); c.fillStyle = '#1e1e26'; c.fill();
    c.beginPath(); c.arc(x - 4, y - 3, 4, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.lineWidth = 3; c.lineCap = 'round'; c.strokeStyle = '#1e1e26';
    for (const a of [-0.5, 0, 0.5]) { c.moveTo(x + a * 14, y - 23); c.lineTo(x + a * 22, y - 33); }
    c.stroke();
  }
  c.beginPath(); c.ellipse(160, 100, 12, 8, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(255,140,150,0.8)'; c.fill();
  tightsTex0 = new THREE.CanvasTexture(cv); tightsTex0.colorSpace = THREE.SRGBColorSpace;
  return tightsTex0;
}
function extrude(pts, depth, bevel = 0.006) { // 2D の 点 (x, y 上が プラス) から 厚みの ある 板
  const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function addEquips(ch, fig, parts, P) {
  const back = -0.15 * P.ws; // せなかの 面 (前 = +z)
  // ジュエルスーツ: 黄色い シャツ・金の ベルト・宝石
  if (eq(ch, 'jewel')) {
    const g = new THREE.Group(); g.position.y = P.bodyY;
    const shirt = ellipsoid(0.172 * P.ws, P.bodyRy * 0.9, 0.158 * P.ws, mat(SUIT, { roughness: 0.5 })); shirt.position.y = P.bodyRy * 0.1; g.add(shirt);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 8, 40), mat('#e0a820', { metalness: 0.3, roughness: 0.35, emissive: '#3a2400' }));
    belt.scale.set(0.162 * P.ws, 0.162 * P.ws, 0.15 * P.ws); belt.rotation.x = Math.PI / 2; belt.position.y = -P.bodyRy * 0.32; g.add(belt);
    const gems = [[-0.55, 0.1, '#50c85a'], [0, 0.18, '#4696f0'], [0.55, 0.1, '#50c85a'], [-0.3, -0.18, '#eb4650'], [0.3, -0.18, '#5adcd2']];
    for (const [gx, gy, c] of gems) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.026), mat(c, { metalness: 0.3, roughness: 0.15, emissive: new THREE.Color(c).multiplyScalar(0.25) }));
      const x = gx * 0.17 * P.ws, y = gy * P.bodyRy + P.bodyRy * 0.1, z = Math.sqrt(Math.max(0, 1 - (x / (0.172 * P.ws)) ** 2 - (y / (P.bodyRy * 0.95)) ** 2)) * 0.158 * P.ws;
      gem.position.set(x, y, z + 0.004); gem.scale.z = 0.5; g.add(gem);
    }
    fig.add(g);
  }
  // まじょのローブ: こい 紫の ながい ローブ (すそが ひろがる)・金の ふち・胸の 星
  if (eq(ch, 'majorobe')) {
    const g = new THREE.Group(); g.position.y = P.bodyY;
    const h = P.bodyRy * 2.5, robe = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * P.ws, 0.23 * P.ws, h, 40, 1, true), mat('#46206e', { side: THREE.DoubleSide, roughness: 0.7 }));
    robe.position.y = P.bodyRy * 0.95 - h / 2; g.add(robe);
    const top = ellipsoid(0.17 * P.ws, P.bodyRy * 0.5, 0.157 * P.ws, mat('#46206e', { roughness: 0.7 })); top.position.y = P.bodyRy * 0.5; g.add(top);
    const gold = mat('#ebbe3c', { metalness: 0.4, roughness: 0.35 });
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.23 * P.ws, 0.008, 6, 48), gold); hem.rotation.x = Math.PI / 2; hem.position.y = P.bodyRy * 0.95 - h; g.add(hem);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), gold); star.scale.z = 0.4; star.position.set(-0.06 * P.ws, P.bodyRy * 0.4, 0.15 * P.ws); g.add(star);
    fig.add(g);
  }
  // にゅうしタイツ: クリーム色の シャツ。前に 目と ほっぺの 絵
  if (eq(ch, 'nyushi')) {
    const g = new THREE.Group(); g.position.y = P.bodyY;
    const pic = ellipsoid(0.173 * P.ws, P.bodyRy * 0.93, 0.159 * P.ws, new THREE.MeshStandardMaterial({ map: tightsTex(), roughness: 0.6 }));
    pic.geometry.attributes.uv.array.forEach((v, i, arr) => { if (i % 2 === 0) arr[i] = (v - 0.25) * 2 + 0.5; }); // 前 (u = 0.25) を 中心に 絵を 大きく (外は ふちの クリーム色)
    pic.position.y = P.bodyRy * 0.08; g.add(pic);
    fig.add(g);
  }
  // はかいりゅうのはね: 黒い 骨と 赤い 膜
  if (eq(ch, 'hakai')) {
    parts.wings = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.05, P.shoulderY + 0.02, back + 0.02);
      const pts = [[0, 0], [0.18, 0.3], [0.5, 0.34], [0.62, 0.12], [0.46, -0.06], [0.3, -0.12], [0.12, -0.14]].map(([x, y]) => [sx * x * Math.max(0.9, P.ws), y]);
      const mem = new THREE.Mesh(extrude(pts, 0.008, 0), mat('#96182f', { side: THREE.DoubleSide, roughness: 0.6 }));
      pivot.add(mem);
      const boneM = mat('#1e0c16');
      for (const [a, b] of [[[0, 0], [0.5, 0.34]], [[0.5, 0.34], [0.46, -0.06]], [[0.5, 0.34], [0.3, -0.12]], [[0.5, 0.34], [0.12, -0.14]], [[0.5, 0.34], [0.62, 0.12]]]) {
        const A = new THREE.Vector3(sx * a[0] * Math.max(0.9, P.ws), a[1], 0.006), B = new THREE.Vector3(sx * b[0] * Math.max(0.9, P.ws), b[1], 0.006);
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, A.distanceTo(B), 6), boneM);
        bone.position.copy(A).add(B).multiplyScalar(0.5); bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
        pivot.add(bone);
      }
      pivot.rotation.y = sx * 0.5; fig.add(pivot); parts.wings.push({ w: pivot, sx });
    }
  }
  // たて: せなかの 丸い 盾
  if (eq(ch, 'tate')) {
    const r = 0.19 * Math.max(0.9, P.ws), g = new THREE.Group();
    const disc = (rr, d, c, z, o = {}) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, d, 40), mat(c, o)); m.rotation.x = Math.PI / 2; m.position.z = -z; g.add(m); };
    disc(r, 0.03, '#ece2c4', 0); disc(r * 0.72, 0.03, '#b2b4bc', 0.01, { metalness: 0.5, roughness: 0.3 }); disc(r * 0.46, 0.03, '#28282e', 0.02);
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2, b = new THREE.Mesh(new THREE.SphereGeometry(r * 0.05, 8, 6), mat('#7a6e58')); b.position.set(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, -0.018); g.add(b); }
    g.position.set(0, P.bodyY - 0.03, back - 0.02); fig.add(g);
  }
  // オノ: ななめに しょった 柄と 刃
  if (eq(ch, 'axe')) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.64, 10), mat('#78543a')); handle.position.y = -0.1; g.add(handle);
    const blade = new THREE.Mesh(extrude([[0.01, 0.26], [0.12, 0.3], [0.19, 0.4], [0.15, 0.24], [0.19, 0.1], [0.1, 0.18], [0.01, 0.17]], 0.012, 0.004), mat('#c4cad6', { metalness: 0.35, roughness: 0.3 }));
    g.add(blade);
    g.position.set(0, P.bodyY, back - 0.03); g.rotation.z = -0.6; fig.add(g);
  }
  // まじょのつえ: ななめに しょった 紫の 木の つえと 光る 玉
  if (eq(ch, 'majostaff')) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 1.1, 10), mat('#5c3a60')); shaft.position.y = 0.03; g.add(shaft);
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI * 1.5), mat('#4a2c4e')); curl.position.set(0.04, 0.63, 0); g.add(curl);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12), mat('#e2b646', { metalness: 0.6, roughness: 0.3 })); ring.position.y = 0.57; g.add(ring);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), mat('#c460ff', { emissive: '#7a20c0', roughness: 0.2 })); orb.position.set(0.04, 0.63, 0); g.add(orb);
    g.position.set(0, P.bodyY + 0.08, back - 0.03); g.rotation.z = 0.55; fig.add(g);
  }
  // おおきなかね: 金色の かね
  if (eq(ch, 'bell')) {
    const prof = [[0.001, 0], [0.07, 0], [0.1, -0.02], [0.11, -0.14], [0.14, -0.22], [0.17, -0.25], [0.001, -0.25]].map(([x, y]) => new THREE.Vector2(x, y));
    const gold = mat('#f0c040', { metalness: 0.3, roughness: 0.3, emissive: '#5a3c00' });
    const b = new THREE.Group();
    const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), gold); bell.scale.setScalar(1.25); b.add(bell);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 16, Math.PI), gold); loop.position.y = 0.0; b.add(loop);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), mat('#8a6a20', { metalness: 0.6 })); ball.position.y = -0.33; b.add(ball);
    b.position.set(-0.04, P.bodyY + P.bodyRy + 0.12, back - 0.13); fig.add(b); parts.bell = b;
  }
}
// まじょのぼうし: つばの 広い 紫の とんがりぼうし (先が 横に 折れる・金の バックルの 帯)
function majoHat(top) {
  const g = new THREE.Group(), hm = mat('#4e2c78', { roughness: 0.7 }), band = mat('#9640c8'), gold = mat('#ecc048', { metalness: 0.6, roughness: 0.3, emissive: '#4a3000' });
  const by = top - R * 0.32;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.32, R * 1.32, R * 0.05, 40), hm); brim.position.y = by; g.add(brim);
  const low = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.36, R * 0.64, R * 0.95, 32), hm); low.position.y = by + R * 0.475; g.add(low); // 下の つつ
  const tip = new THREE.Mesh(new THREE.ConeGeometry(R * 0.36, R * 0.8, 32), hm); // 先は 横に 折れる
  tip.geometry.translate(0, R * 0.4, 0); tip.position.y = by + R * 0.95; tip.rotation.z = -0.6; g.add(tip);
  const bd = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.645, R * 0.18, 32), band); bd.position.y = by + R * 0.12; g.add(bd);
  const buckle = new THREE.Mesh(new THREE.TorusGeometry(R * 0.08, R * 0.025, 6, 4), gold); buckle.rotation.z = Math.PI / 4; buckle.position.set(0, by + R * 0.12, R * 0.64); g.add(buckle);
  return g;
}
// まおうのかんむり: 黒い かぶと + こうもりの はね + 三つまたの やり + 白い こうもり
function maouCrown(top) {
  const g = new THREE.Group(), k = R / 55, Y = (y) => (140 - y) * k + (top - R); // 2D の px (頭の 中心 = (107, 140))
  const met = mat('#4a464e', { metalness: 0.55, roughness: 0.35 }), dark = mat('#2a272e', { metalness: 0.4, roughness: 0.5 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.08, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.42), met); // 頭の 上半分
  cap.position.y = top - R; g.add(cap);
  const peak = new THREE.Mesh(new THREE.ConeGeometry(R * 0.12, R * 0.3, 4), met); // 前の まんなかの とがり
  peak.rotation.x = Math.PI; peak.position.set(0, top - R + R * 0.33, R * 0.98); peak.scale.z = 0.35; g.add(peak);
  for (const sx of [-1, 1]) { // こうもりの はね
    const pts = [[64, 84], [46, 72], [22, 68], [29, 84], [28, 98], [37, 92], [43, 104], [50, 99], [57, 113], [66, 104]].map(([x, y]) => [sx * (107 - x) * -k, Y(y)]);
    const w = new THREE.Mesh(extrude(pts, 0.012, 0.004), met); w.position.z = 0.0; g.add(w);
  }
  const col = new THREE.Mesh(new THREE.CylinderGeometry(15 * k, 17 * k, 20 * k, 20), met); col.position.y = Y(67); g.add(col); // 台
  const rod = (x0, y0, x1, y1, r) => { const A = new THREE.Vector3(x0, y0, 0), B = new THREE.Vector3(x1, y1, 0); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), dark); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); g.add(m); };
  rod(0, Y(60), 0, Y(28), 3 * k);
  for (const sx of [-1, 1]) { rod(sx * 10 * k, Y(60), sx * 27 * k, Y(50), 3 * k); rod(sx * 27 * k, Y(50), sx * 27 * k, Y(36), 3 * k); }
  const tip = (x, y, s) => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(1), met); m.scale.set(6 * k * s, 13 * k * s, 4 * k * s); m.position.set(x, Y(y), 0); g.add(m); };
  tip(0, 18, 1.2); tip(-27 * k, 28, 0.9); tip(27 * k, 28, 0.9);
  const batPts = [[0, 7], [-6, 3], [-12, -6], [-9, 1], [-6, -2], [-2.5, 1], [-2.5, -5], [0, -3], [2.5, -5], [2.5, 1], [6, -2], [9, 1], [12, -6], [6, 3]].map(([x, y]) => [x * k * 1.45, -y * k * 1.45 + Y(36)]);
  const bat = new THREE.Mesh(extrude(batPts, 0.006, 0.002), mat('#f6f6fa')); bat.position.z = 0.02; g.add(bat);
  return g;
}

function antenna(ch, top) {
  const group = new THREE.Group(); group.position.y = top;
  const len = 0.16 + (ch.skill.grade || 0) * 0.015;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, len, 8), mat('#1c1418')); stick.position.y = len / 2;
  group.add(stick);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  NS.drawSkillIcon(cv.getContext('2d'), 128, 128, 80, ch.skill, 0, {});
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  const sz = 0.078 * 2 * NS.iconScale(ch.skill) * 1.6;
  icon.scale.set(sz, sz, 1); icon.position.y = len + sz * 0.38;
  group.add(icon);
  return { group, len };
}
let glowCache = null;
export function glowTex() {
  if (glowCache) return glowCache;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return (glowCache = new THREE.CanvasTexture(cv));
}

// うごき (呼吸・腕・アンテナの ゆれ)。v = 2D の ユニットの 見た目の 値 (なければ ふだんの ようす)
export function poseCharacter(root, t, v = {}) {
  const { parts, phase } = root.userData;
  const sq = v.squash || 0, br = Math.sin(t * 2.6 + phase) * 0.018;
  const fig = parts.fig, h = root.userData.ch.look.h;
  fig.scale.set(h * (1 + sq * 0.5 - br * 0.4), h * (1 - sq + br), h * (1 + sq * 0.5 - br * 0.4));
  const raise = v.armRaise || 0;
  for (const { pivot, sx } of parts.arms) pivot.rotation.z = sx * (0.35 + raise * 2.2 + Math.sin(t * 2.6 + phase + sx) * 0.05);
  for (const { leg, sx, y } of parts.legs) leg.position.y = y + (v.step ? Math.max(0, Math.sin(v.step + (sx > 0 ? Math.PI : 0))) * 0.06 : 0);
  parts.head.rotation.z = (v.headTilt || 0) * -1 + Math.sin(t * 1.3 + phase) * 0.04;
  if (parts.antenna) parts.antenna.group.rotation.z = Math.sin(t * 2.2 + phase) * 0.12 - (v.antennaKick || 0) * 2;
  if (parts.wings) for (const { w, sx } of parts.wings) w.rotation.y = sx * (0.5 + Math.sin(t * 3.2) * 0.18); // はばたき
  if (parts.bell) parts.bell.rotation.z = Math.sin(t * 2.4) * 0.12;
  if (parts.glow) parts.glow.material.opacity = 0.45 + Math.sin(t * 3 + phase) * 0.15;
}

// 色: ダメージの 白 (flash)・たおれた 灰色 (gray)・半とうめい (alpha)・溜めの 光 (glow)
const GRAY = new THREE.Color(0.47, 0.47, 0.49), WHITE = new THREE.Color(1, 1, 1);
function tintCharacter(root, v) {
  const { mats } = root.userData, g = v.gray || 0, f = v.flash || 0, a = v.alpha == null ? 1 : v.alpha;
  for (const m of mats) {
    if (m.userData.color0) { m.color.copy(m.userData.color0); if (g) m.color.lerp(GRAY, g * 0.8); if (f) m.color.lerp(WHITE, f); }
    if (m.userData.transparent0 == null) { m.userData.transparent0 = m.transparent; m.userData.opacity0 = m.opacity; }
    m.transparent = m.userData.transparent0 || a < 0.999;
    m.opacity = m.userData.opacity0 * a;
  }
}
function setExpression(root, expr) {
  const d = root.userData, key = expr || null;
  if (d.faceExpr === key) return;
  d.faceExpr = key;
  if (!d.faces[key]) d.faces[key] = faceTexture(d.ch, key);
  d.faceMat.map = d.faces[key];
  d.faceMat.needsUpdate = true;
}
function disposeCharacter(root) {
  const geos = new Set(headGeoCache.values());
  root.traverse((o) => { if (o.geometry && !geos.has(o.geometry)) o.geometry.dispose(); if (o.material) { if (o.material.map && o.material.map !== glowCache) o.material.map.dispose(); o.material.dispose(); } });
  for (const tex of Object.values(root.userData.faces)) tex.dispose();
}

// ---------------- ゲームの 画面に 重ねて 描く ----------------
// 1体ずつ (奥行きの 順に) WebGL で 描いて、その 四角を 2D の 画面へ 写す
let renderer = null, scene = null, camera = null;
const models = new Map(); // ch → { root, used }
let frameNo = 0;
function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#5a4a6a', 1.5));
  const sun = new THREE.DirectionalLight('#fff2dc', 2.0); sun.position.set(-3, 6, 5); scene.add(sun);
  const rim = new THREE.DirectionalLight('#c8b0ff', 0.7); rim.position.set(3, 3, -4); scene.add(rim);
  camera = new THREE.PerspectiveCamera(40, 1, 0.15, 120);
}
function modelOf(ch) {
  let m = models.get(ch);
  if (!m) { m = { root: buildCharacter(ch), used: 0 }; models.set(ch, m); scene.add(m.root); }
  m.used = frameNo;
  return m.root;
}
NS.fig3d = {
  ready: true,
  // フレームの はじめ: 2D の カメラに そろえる
  begin(cam, W, H, dpr) {
    if (!renderer) setup();
    frameNo++;
    const cw = Math.round(W * dpr), chh = Math.round(H * dpr), el = renderer.domElement;
    if (el.width !== cw || el.height !== chh) { renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); }
    camera.fov = (2 * Math.atan(H / 2 / cam.f) * 180) / Math.PI;
    camera.aspect = W / H;
    camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
    camera.updateProjectionMatrix();
    for (const m of models.values()) m.root.visible = false;
    // しばらく 使って いない モデルは すてる
    if (frameNo % 300 === 0) for (const [ch, m] of models) if (frameNo - m.used > 600) { scene.remove(m.root); disposeCharacter(m.root); models.delete(ch); }
  },
  // 1体を 描く。x, y = 足元の 画面の 位置、box = 画面の 四角 (CSS px)
  draw(ctx, ch, pos, v, face, t, box, dpr) {
    const root = modelOf(ch);
    root.visible = true;
    root.position.set(pos.x, pos.y, pos.z);
    root.rotation.set(0, face, 0);
    if (v.lie) root.rotateZ(-(v.lie * Math.PI / 2) * (v.lieDir || 1));
    poseCharacter(root, t, v);
    tintCharacter(root, v);
    setExpression(root, v.expr);
    const el = renderer.domElement, W = el.width / dpr, H = el.height / dpr;
    const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(W, Math.ceil(box.x + box.w)), y1 = Math.min(H, Math.ceil(box.y + box.h));
    if (x1 <= x0 || y1 <= y0) { root.visible = false; return; }
    renderer.setScissorTest(true);
    renderer.setScissor(x0, H - y1, x1 - x0, y1 - y0); // WebGL は 下から
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    ctx.drawImage(el, x0 * dpr, y0 * dpr, (x1 - x0) * dpr, (y1 - y0) * dpr, x0, y0, x1 - x0, y1 - y0);
    root.visible = false;
  },
};
