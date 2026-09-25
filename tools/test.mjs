/* 診断の計算を確かめる。画面は開かない。
       node tools/test.mjs */
import { readFileSync } from 'node:fs';
import { questions } from '../src/questions.js';
import { AXES, eraPref, profile, typeCode, nickname, pick, reasons, exclusion, usable, cosine, franchise, sameFranchise } from '../src/logic.js';

const db = JSON.parse(readFileSync(new URL('../all_anime_db.json', import.meta.url), 'utf8'));
const works = usable(db.works);
let bad = 0;
const ok = (cond, msg) => { if (!cond) { console.error('× ' + msg); bad = 1; } };

/* 形 */
ok(questions.length === 20, `質問は 20 問（いま ${questions.length}）`);
ok(questions.filter((q) => q.axis === 'era').length === 2, '画質・年代は 2 問');
for (const a of AXES) ok(questions.filter((q) => q.axis === a.key).length === 3, `${a.label} は 3 問`);
ok(questions.every((q) => !/\[[A-Z]+\]|^質問|^\d+\./.test(q.q + q.a + q.b)), '文言に番号や [R] が残っていない');
ok(works.length >= 500, `使える作品は 500 以上（いま ${works.length}）`);
ok(db.works.every((w) => w.v.length === 6 && w.v.every((x) => Math.abs(x) <= 1)), 'どの作品も 6 軸');
ok(new Set(db.works.map((w) => w.id)).size === db.works.length, 'id が重ならない');

/* タイプコード */
const all = (v) => profile(questions, questions.map(() => v));
ok(typeCode(all(1)) === 'RDCP-VM', '全部 A → RDCP-VM');
ok(typeCode(all(-1)) === 'FHSA-STL', '全部 B → FHSA-STL');
ok(nickname(all(1)) === '深淵を覗く考察コレクター', 'RDCP-VM の二つ名');
ok(nickname(all(-1)) === '脳汁全開の爽快エンタメハンター', 'FHSA-STL の二つ名');
const per = (o) => questions.map((q) => o[q.axis] ?? 0);  // era も o.era で指定できる
const u = (o) => profile(questions, per(o));
ok(nickname(u({ world: -1, mood: 1, structure: 1, taste: -1, visual: 1, watch: 1 })) === '異世界を旅するロマン追及者', 'FDCA-VM');
ok(nickname(u({ world: 1, mood: -1, structure: -1, taste: 1, visual: -1, watch: -1 })) === '現実逃避のライトファン', 'RHSP-STL');

/* 64 通りすべてに、別々の二つ名が付く */
const names = new Set();
for (let m = 0; m < 64; m++) {
  const v = AXES.map((_, i) => ((m >> i) & 1 ? 1 : -1));
  names.add(nickname(v));
  ok(/^[RF][DH][CS][PA]-(V|ST)[ML]$/.test(typeCode(v)), 'コードの形 ' + typeCode(v));
}
ok(names.size === 64, `二つ名は 64 通り別々（いま ${names.size}）`);

/* 同じシリーズ */
const same = (a, b) => sameFranchise(franchise({ t: a }), franchise({ t: b }));
ok(same('呪術廻戦', '呪術廻戦 渋谷事変'), '呪術廻戦 と 渋谷事変');
ok(same('鬼滅の刃', '劇場版「鬼滅の刃」無限列車編'), '鬼滅 と 劇場版');
ok(same('進撃の巨人', '進撃の巨人 The Final Season'), '進撃 と Final');
ok(!same('ONE PIECE', 'ONE PUNCH MAN'), 'ONE PIECE と ONE PUNCH MAN は別');
ok(!same('Another', 'Angel Beats!'), '頭が違えば別');

/* 近さ */
ok(Math.abs(cosine([1, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]) - 1) < 1e-9, 'cos 同じ向き = 1');
ok(Math.abs(cosine([1, 0, 0, 0, 0, 0], [-1, 0, 0, 0, 0, 0]) + 1) < 1e-9, 'cos 逆向き = -1');
ok(cosine([0, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0]) === 0, 'どちらでもない人は 0');

const top = (o) => pick(u(o), works, 3).map((c) => `${c.work.t}(${c.match}%)`);
const dm = top({ mood: 1, taste: 1, structure: 1, world: 1 });
const da = top({ mood: 1, taste: -1, structure: -1, visual: 1 });
const hl = top({ world: 1, mood: -1, structure: -1, watch: -1, visual: -1 });
console.log('ダーク×心理戦  :', dm.join(' / '));
console.log('ダーク×アクション:', da.join(' / '));
console.log('日常×ゆるく    :', hl.join(' / '));
ok(dm.filter((t) => da.includes(t)).length === 0, 'ダークの中でも心理戦派とアクション派で分かれる');
for (const list of [dm, da, hl]) {
  const f = list.map((t) => franchise({ t: t.replace(/\(\d+%\)$/, '') }));
  ok(!f.some((x, i) => f.some((y, j) => i < j && sameFranchise(x, y))), '同じシリーズが並ばない: ' + list.join(' / '));
}

const three = pick(u({ world: -1, mood: 1 }), works, 3);
ok(three.length === 3 && new Set(three.map((c) => c.work.id)).size === 3, '3 作は別々');
ok(three[0].match >= three[1].match - 5, '1 作目がいちばん合う（人気の上乗せでわずかに前後してもよい）');
ok(three.every((c) => reasons(u({ world: -1, mood: 1 }), c.work).length > 0), '理由が付く');

const ex = exclusion(u({ mood: 1, taste: 1 }), works);
ok(ex.names.join('×') === 'ダーク×心理戦', '除外に使う 2 軸: ' + ex.names.join('×'));
ok(ex.excluded > 0 && ex.excluded < works.length, `除外数は本当に数えた数（${ex.excluded}）`);

/* 画質・年代 */
const withEra = (o, e) => profile(questions, per({ ...o, era: e }));
ok(eraPref(questions, per({ era: 1 })) === 1 && eraPref(questions, per({ era: -1 })) === -1, '画質・年代の値');
ok(typeCode(withEra({ mood: 1 }, 1)) === typeCode(withEra({ mood: 1 }, -1)), '画質・年代はタイプコードを変えない');
for (const o of [{ mood: 1, taste: 1 }, { world: -1, mood: -1 }, { visual: 1, watch: 1 }]) {
  const uu = u(o);
  const newer = pick(uu, works, 3, new Set(), { era: 1 });
  const any = pick(uu, works, 3, new Set(), { era: -1 });
  const avg = (l) => l.reduce((a, c) => a + (c.work.y || 2010), 0) / l.length;
  console.log(`新しめ好き: ${newer.map((c) => `${c.work.t}(${c.work.y})`).join(' / ')}`);
  ok(avg(newer) >= avg(any), '新しめ好きには、新しい作品が選ばれやすい');
  ok(newer.every((c) => !c.work.y || c.work.y >= 2000), '新しめ好きに 2000 年より前の作品は出にくい');
  const strict = pick(uu, works, 3, new Set(), { minYear: 2018 });
  ok(strict.length === 3 && strict.every((c) => !c.work.y || c.work.y >= 2018), '放送年で絞れる');
}

/* 乱数の回答で、出番の偏り */
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const vals = [-1, -0.5, 0, 0.5, 1];
const hits = new Map();
const N = 3000;
for (let k = 0; k < N; k++) {
  const uu = profile(questions, questions.map(() => vals[Math.floor(rnd() * 5)]));
  const c = pick(uu, works, 1)[0];
  hits.set(c.work.t, (hits.get(c.work.t) || 0) + 1);
}
const most = [...hits].sort((a, b) => b[1] - a[1]);
console.log(`運命の1作に選ばれた作品 ${hits.size} 種 / よく出る: ${most.slice(0, 3).map(([t, n]) => `${t} ${(100 * n / N).toFixed(1)}%`).join(', ')}`);
ok(hits.size >= 120, '運命の1作が偏りすぎない（120 種以上）');
ok(most[0][1] / N < 0.05, 'ひとつの作品が 5% を超えて選ばれない');

/* 1 万件でも速いか（作り物のデータで） */
const big = Array.from({ length: 12000 }, (_, i) => ({
  id: i, t: 'w' + i, p: rnd(), s: 3 + rnd() * 1.5, i: 1, v: AXES.map(() => rnd() * 2 - 1),
}));
const t0 = performance.now();
pick(u({ mood: 1, taste: 1 }), big, 3);
exclusion(u({ mood: 1, taste: 1 }), big);
const ms = performance.now() - t0;
console.log(`12,000 作で選ぶのにかかった時間: ${ms.toFixed(1)} ms`);
ok(ms < 200, '1 万件超でもすぐ出る');

console.log(bad ? '\n合わないところがあります' : '\n計算はすべて狙いどおり。');
process.exit(bad);
