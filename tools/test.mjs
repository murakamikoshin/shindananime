/* 診断の計算を確かめる。画面は開かない。
       npm test */
import { readFileSync } from 'node:fs';
import { questions } from '../src/questions.js';
import { AXES, profile, typeCode, typeName, pick, reasons } from '../src/logic.js';

const data = JSON.parse(readFileSync(new URL('../anime_data.json', import.meta.url), 'utf8'));
let bad = 0;
const ok = (cond, msg) => { if (!cond) { console.error('× ' + msg); bad = 1; } };

/* 形 */
ok(questions.length === 18, `質問は 18 問（いま ${questions.length}）`);
for (const a of AXES) ok(questions.filter((q) => q.axis === a.key).length === 3, `${a.label} は 3 問`);
ok(questions.every((q) => !/\[[A-Z]\]|^\d+\./.test(q.q + q.a + q.b)), '文言に番号や [R] が残っていない');
ok(data.anime.length >= 50, `作品は 50 以上（いま ${data.anime.length}）`);
for (const a of data.anime) {
  for (const x of AXES) ok(typeof a.axes[x.key] === 'number' && Math.abs(a.axes[x.key]) <= 1, `${a.title} の ${x.key}`);
  ok(a.filmarks_url.startsWith('https://filmarks.com/'), `${a.title} の Filmarks URL`);
}
ok(new Set(data.anime.map((a) => a.id)).size === data.anime.length, 'id が重ならない');

/* 回答を作る: 軸ごとに +1 / -1 / 0 などを指定 */
const answer = (per) => questions.map((q) => per[q.axis] ?? 0);
const top = (per) => pick(profile(questions, answer(per)), data.anime, 3).map((c) => c.anime.title);

const allA = profile(questions, questions.map(() => 1));
ok(typeCode(allA) === 'RDCGPV', '全部 A なら RDCGPV');
ok(typeCode(profile(questions, questions.map(() => -1))) === 'FHSIAL', '全部 B なら FHSIAL');
ok(typeName(allA).badge.includes('群像派'), '札に人間関係が入る');

/* 同じ「ダーク」でも、頭脳戦派と熱量派で違う作品になる */
const darkMind = top({ mood: 1, taste: 1, structure: 1, bond: -1 });
const darkAction = top({ mood: 1, taste: -1, structure: -1 });
console.log('ダーク×頭脳戦 :', darkMind.join(' / '));
console.log('ダーク×熱量   :', darkAction.join(' / '));
ok(darkMind.filter((t) => darkAction.includes(t)).length <= 1, 'ダーク系の中でも分かれる');
ok(darkMind.some((t) => /DEATH NOTE|カイジ|推しの子|僕だけ|化物語/.test(t)), 'ダーク×頭脳戦 に頭脳戦ものが入る');

const happyGroup = top({ world: 1, mood: -1, bond: 1, structure: -1, watch: -1 });
console.log('日常×ハッピー×群像:', happyGroup.join(' / '));
ok(happyGroup.some((t) => /けいおん|ゆるキャン|ぼっち|ハイキュー|宇宙より|SHIROBAKO|SPY/.test(t)), '日常×ハッピー×群像');

const visual = top({ world: -1, taste: 1, watch: 1, mood: -0.5 });
console.log('異世界×映像没入   :', visual.join(' / '));

/* 3 作は別々で、理由が付く */
const u = profile(questions, answer({ world: -1, mood: 1 }));
const three = pick(u, data.anime, 3);
ok(new Set(three.map((c) => c.anime.id)).size === 3, '3 作は重ならない');
ok(three.every((c) => reasons(u, c.anime).length > 0), '3 作とも理由が付く');

/* 乱数の回答で、どれだけの作品に出番があるか（偏りすぎていないか） */
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const vals = [-1, -0.5, 0, 0.5, 1];
const hits = new Map();
for (let k = 0; k < 4000; k++) {
  const u2 = profile(questions, questions.map(() => vals[Math.floor(rnd() * 5)]));
  for (const c of pick(u2, data.anime, 3)) hits.set(c.anime.title, (hits.get(c.anime.title) || 0) + 1);
}
const reach = hits.size / data.anime.length;
const most = [...hits].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${t} ${(n / 120).toFixed(1)}%`);
console.log(`出番のある作品 ${hits.size}/${data.anime.length}  よく出る: ${most.join(', ')}`);
ok(reach >= 0.8, '8 割以上の作品に出番がある');
ok([...hits.values()].every((n) => n / 12000 < 0.2), 'ひとつの作品が 2 割を超えて出ない');

console.log(bad ? '\n合わないところがあります' : '\n計算はすべて狙いどおり。');
process.exit(bad);
