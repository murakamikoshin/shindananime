/* 診断の計算。画面には触らない（node からも読んで検査する）。

   6 軸。値は -1〜+1。+ が R/D/C/G/P/V、- が F/H/S/I/A/L。
   回答は 1 問ごとに -1〜+1 で持つ（+1 = a を強く、+0.5 = どちらかといえば a、
   0 = どちらでもない、-0.5 / -1 = b 側）。 */

export const AXES = [
  { key: 'world', label: '世界観', pos: 'R', neg: 'F', posName: 'リアル', negName: 'ファンタジー' },
  { key: 'mood', label: '後味・刺激', pos: 'D', neg: 'H', posName: 'ダーク', negName: 'ハッピー' },
  { key: 'structure', label: '構成・テンポ', pos: 'C', neg: 'S', posName: '考察・重厚', negName: 'テンポ・直感' },
  { key: 'bond', label: '人間関係', pos: 'G', neg: 'I', posName: '群像・絆', negName: '孤高・推し' },
  { key: 'taste', label: 'サブテイスト', pos: 'P', neg: 'A', posName: '心理戦・ドラマ', negName: 'アクション・熱量' },
  { key: 'watch', label: '視聴・演出', pos: 'V', neg: 'L', posName: '映像美・じっくり', negName: '気軽・一気見' },
];

/* 軸ごとに回答をならす。答えていない問題は数えない */
export function profile(questions, answers) {
  const sum = {}, n = {};
  questions.forEach((q, i) => {
    const v = answers[i];
    if (typeof v !== 'number') return;
    sum[q.axis] = (sum[q.axis] || 0) + v;
    n[q.axis] = (n[q.axis] || 0) + 1;
  });
  const out = {};
  for (const a of AXES) out[a.key] = n[a.key] ? clamp(sum[a.key] / n[a.key]) : 0;
  return out;
}

export function typeCode(u) {
  return AXES.map((a) => (u[a.key] >= 0 ? a.pos : a.neg)).join('');
}

/* 名前は部品から組む: 世界観×後味 / 構成×テイスト。札は 人間関係 × 視聴 */
const WORLD_MOOD = {
  RD: '現実の闇をのぞき込む', RH: '日常に光を見つける',
  FD: '異界の絶望に魅せられた', FH: '別世界の冒険に焦がれる',
};
const STRUCT_TASTE = {
  CP: '考察の策士', CA: '伏線を追う戦士',
  SP: '直感のドラマ通', SA: '熱量の爆走者',
};
const BOND = { G: '群像派', I: '推し一点派' };
const WATCH = { V: 'じっくり没入', L: 'サクッと一気見' };

export function typeName(u) {
  const c = typeCode(u);
  return {
    code: c,
    name: WORLD_MOOD[c[0] + c[1]] + STRUCT_TASTE[c[2] + c[4]],
    badge: BOND[c[3]] + ' × ' + WATCH[c[5]],
  };
}

/* 軸ごとの一言。刺さる理由と、タイプの説明に使う */
const WHY = {
  R: '現実と地続きの手触り', F: '現実を忘れられる世界観',
  D: '容赦のない展開と重い余韻', H: '最後に報われるカタルシス',
  C: '伏線と考察しがいのある構成', S: '一話目から掴んでくるテンポ',
  G: 'チームや仲間の絆', I: '濃い推しキャラと特別な関係',
  P: '読み合いと行間のドラマ', A: '熱量と迫力のある見せ場',
  V: '何度も見返したくなる映像と余白', L: '一気見できる軽やかさ',
};
const DESC = {
  R: '地に足のついた人間ドラマに心が動く', F: '非日常の世界に飛び込むほど燃える',
  D: '救いのない展開ほど記憶に残る', H: '逆転と大団円で満たされたい',
  C: '一話ずつ伏線を拾って考えるのが楽しい', S: '勢いと気持ちよさで一気見したい',
  G: '群像劇と掛け合いに惹かれる', I: 'ひとりの推しに深く刺さる',
  P: '静かな心理戦と大人のドラマが好き', A: '熱く、はっきりしたエンタメが好き',
  V: '映像を噛み締めて、見終わった後も考察を読み漁る', L: '面白ければ一気に完走して、次の作品へ',
};

export function describe(u) {
  /* はっきりしている軸から順に */
  return [...AXES]
    .sort((x, y) => Math.abs(u[y.key]) - Math.abs(u[x.key]))
    .filter((a) => Math.abs(u[a.key]) >= 0.25)
    .slice(0, 3)
    .map((a) => DESC[u[a.key] >= 0 ? a.pos : a.neg]);
}

/* 迷わず答えた軸ほど重く見る。どちらでもない軸も少しは効かせる */
const weight = (x) => 0.35 + Math.abs(x);

export function similarity(u, v) {
  let s = 0, w = 0;
  for (const a of AXES) {
    const wi = weight(u[a.key]);
    s += wi * (1 - Math.abs(u[a.key] - (v[a.key] || 0)) / 2);
    w += wi;
  }
  return s / w;
}

/* 作品どうしの近さ。3 作が似たものばかりにならないように使う */
function closeness(x, y) {
  let d = 0;
  for (const a of AXES) d += Math.abs((x[a.key] || 0) - (y[a.key] || 0)) / 2;
  return 1 - d / AXES.length;
}

/* Filmarks の★がある作品には少しだけ上乗せ。無い作品は損も得もしない */
function quality(anime) {
  if (typeof anime.score !== 'number') return 0;
  return clamp((anime.score - 3.9) * 0.08, -0.04, 0.04);
}

export function rank(u, list, { exclude = new Set() } = {}) {
  return list
    .filter((a) => !exclude.has(a.id))
    .map((a) => {
      const sim = similarity(u, a.axes);
      return { anime: a, sim, total: sim + quality(a), match: Math.round(sim * 100) };
    })
    .sort((x, y) => y.total - x.total);
}

/* 上から順に取るが、すでに選んだものと似すぎていたら少し下げる */
export function pick(u, list, n = 3, opts = {}) {
  const pool = rank(u, list, opts).slice(0, 18);
  const chosen = [];
  while (chosen.length < n && pool.length) {
    let best = 0, bestScore = -Infinity;
    pool.forEach((c, i) => {
      const dup = chosen.length
        ? Math.max(...chosen.map((p) => closeness(p.anime.axes, c.anime.axes))) : 0;
      const score = c.total - 0.12 * Math.max(0, dup - 0.75) * 4;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    chosen.push(pool.splice(best, 1)[0]);
  }
  return chosen;
}

/* この作品がこの人に刺さる理由。両方が同じ側にはっきり寄っている軸を拾う */
export function reasons(u, anime, max = 3) {
  return AXES
    .map((a) => {
      const x = u[a.key], y = anime.axes[a.key] || 0;
      const same = Math.sign(x) === Math.sign(y) && Math.abs(x) >= 0.2 && Math.abs(y) >= 0.3;
      return { a, strength: same ? Math.abs(x) * Math.abs(y) : 0, side: y >= 0 ? a.pos : a.neg };
    })
    .filter((r) => r.strength > 0)
    .sort((p, q) => q.strength - p.strength)
    .slice(0, max)
    .map((r) => WHY[r.side]);
}

function clamp(x, lo = -1, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}
