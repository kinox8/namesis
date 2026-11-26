// 名力の分布を調べ、ランクのしきい値を算出する: node tools/calibrate.js
const path = require('path');
for (const f of ['rng.js', 'data.js', 'chargen.js']) require(path.join(__dirname, '..', 'js', f));
const NS = globalThis.NS;

const N = 200000;
const scores = [];
const seen = new Set();
let s = 12345;
const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
while (scores.length < N) {
  const nm = NS.randomName(rand) + (rand() < 0.3 ? String(Math.floor(rand() * 100)) : '');
  if (seen.has(nm)) continue;
  seen.add(nm);
  scores.push(NS.makeCharacter(nm).score);
}
scores.sort((a, b) => a - b);
const q = (p) => scores[Math.floor(p * (N - 1))];
const targets = { C: 0.2, B: 0.5, A: 0.75, S: 0.9, SS: 0.97, NAMESIS: 0.997 };
console.log('min', scores[0], 'median', q(0.5), 'max', scores[N - 1]);
for (const [k, p] of Object.entries(targets)) console.log(k, '>=', q(p), `(上位 ${((1 - p) * 100).toFixed(1)}%)`);
