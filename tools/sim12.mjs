// 12問版と50問版の結果が、どれだけ一致するかを、作り物の回答者で測る
import { readFileSync } from 'node:fs';
import { questions } from '/Users/murakami/shindananime/src/questions.js';
import { AXES, eraPref, prefs, profile, typeCode, pick, usable } from '/Users/murakami/shindananime/src/logic.js';
const db = JSON.parse(readFileSync('/Users/murakami/shindananime/all_anime_db.json', 'utf8'));
const works = usable(db.works);
// 乱数（固定シード）
let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const q5 = (x) => (x > 0.6 ? 1 : x > 0.2 ? 0.5 : x < -0.6 ? -1 : x < -0.2 ? -0.5 : 0);
// 12問 = 軸ごとに2問ずつ（app.js と同じ選び方）
const byAxis = AXES.map((a) => questions.map((q, i) => i).filter((i) => questions[i].axis === a.key));
const quick = [0, 1].flatMap((k) => byAxis.map((l) => l[k]));
const axisIdx = questions.map((q,i)=>i).filter(i=>AXES.some(a=>a.key===questions[i].axis));
const N = +process.argv[2] || 1000, SIGMA = +process.argv[3] || 0.5;
const top = (u, o) => pick(u, works, 3, new Set(), o).map((c) => c.work.id);
let m = {t12_18:0, t18_50:0, t12_18any:0, t18_50any:0};
let n = { code6: 0, axis: Array(6).fill(0), top1: 0, top3any: 0, top1_vs_truth12: 0, top1_vs_truth50: 0, inTruth3_12: 0, inTruth3_50: 0 };
for (let r = 0; r < N; r++) {
  const t = {}; // 本人の「本当の好み」
  AXES.forEach((a) => (t[a.key] = rnd() * 2 - 1)); t.era = rnd() * 2 - 1;
  const tp = {}; questions.forEach((q) => { if (q.axis === 'pref') tp[q.key] = rnd() * 2 - 1; });
  const ans = questions.map((q) => q5((q.axis === 'pref' ? tp[q.key] : t[q.axis]) + SIGMA * gauss()));
  const a12 = ans.map((v, i) => (quick.includes(i) ? v : undefined));
  const u12 = profile(questions, a12), u50 = profile(questions, ans);
  const o50 = { era: eraPref(questions, ans), prefs: prefs(questions, ans) };
  const uT = AXES.map((a) => t[a.key]);
  const oT = { era: t.era, prefs: tp };
  const c12 = typeCode(u12), c50 = typeCode(u50);
  if (c12 === c50) n.code6++;
  for (let k = 0; k < 6; k++) if ((u12[k] >= 0) === (u50[k] >= 0)) n.axis[k]++;
  const p12 = top(u12, {}), p50 = top(u50, o50), pT = top(uT, oT);
  const a18 = ans.map((v,i)=>(axisIdx.includes(i)?v:undefined)); const p18 = top(profile(questions,a18), {});
  if (p12[0]===p18[0]) m.t12_18++; if (p18[0]===p50[0]) m.t18_50++;
  if (p12[0] === p50[0]) n.top1++;
  if (p12.some((x) => p50.includes(x))) n.top3any++;
  if (p12[0] === pT[0]) n.top1_vs_truth12++;
  if (p50[0] === pT[0]) n.top1_vs_truth50++;
  if (pT.includes(p12[0])) n.inTruth3_12++;
  if (pT.includes(p50[0])) n.inTruth3_50++;
}
const pc = (x) => (100 * x / N).toFixed(1) + '%';
console.log(`回答者 ${N} 人 / 回答のブレ σ=${SIGMA} / 診断に使う作品 ${works.length}`);
console.log('タイプコード6文字が一致', pc(n.code6));
console.log('軸ごとの文字が一致', AXES.map((a, k) => a.key + ' ' + pc(n.axis[k])).join(' / '));
console.log('運命の1作が一致（12問 vs 50問）', pc(n.top1));
console.log('上位3作のどれかが共通', pc(n.top3any));
console.log('--- 本当の好みで選んだ1作との比較 ---');
console.log('12問の1作 = 本当の好みの1作', pc(n.top1_vs_truth12), '/ 3作に入る', pc(n.inTruth3_12));
console.log('50問の1作 = 本当の好みの1作', pc(n.top1_vs_truth50), '/ 3作に入る', pc(n.inTruth3_50));

console.log('軸の18問(好み・年代なし): 12問と同じ1作', pc(m.t12_18), '/ 50問と同じ1作', pc(m.t18_50), `(軸の問題数 ${axisIdx.length})`);
