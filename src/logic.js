/* 診断の計算。画面には触らない（node からも読んで検査する）。

   6 軸。値は -1〜+1。+ が R/D/C/P/V/M、- が F/H/S/A/ST/L。
   回答は 1 問ごとに -1〜+1 で持つ（+1 = A を強く、+0.5 = どちらかといえば A、
   0 = どちらでもない、-0.5 / -1 = B 側）。
   作品の軸は all_anime_db.json の v（同じ並び）。 */

export const AXES = [
  { key: 'world', label: '世界観', pos: 'R', neg: 'F', posName: 'リアル', negName: 'ファンタジー' },
  { key: 'mood', label: '後味・刺激', pos: 'D', neg: 'H', posName: 'ダーク', negName: 'ハッピー' },
  { key: 'structure', label: '構成・テンポ', pos: 'C', neg: 'S', posName: '伏線・考察', negName: 'テンポ・勢い' },
  { key: 'taste', label: 'サブテイスト', pos: 'P', neg: 'A', posName: '心理戦', negName: 'アクション' },
  { key: 'visual', label: '視覚・フェチ', pos: 'V', neg: 'ST', posName: '映像美', negName: 'ストーリー' },
  { key: 'watch', label: '視聴スタイル', pos: 'M', neg: 'L', posName: '熟読・考察', negName: 'サクッと' },
];

/* 画質・年代の好み（-1〜+1）。+ ほど新しめ・高画質を好む。タイプコードには入れない */
export const ERA = { key: 'era', label: '画質・年代', pos: 'N', neg: 'O', posName: '新しめ・高画質', negName: '年代不問' };

export function eraPref(questions, answers) {
  let sum = 0, n = 0;
  questions.forEach((q, i) => {
    if (q.axis === 'era' && typeof answers[i] === 'number') { sum += answers[i]; n++; }
  });
  return n ? clamp(sum / n) : 0;
}

/* 古い作品をどれだけ下げるか。新しめ好きな人ほど、古い作品ほど下げる。
   年代不問の人は、昔の作品をほんの少しだけ上げる（名作を拾いやすく）。年が分からない作品は動かさない */
export function eraAdjust(era, year) {
  if (!year) return 0;
  const age = year < 2000 ? 1 : year < 2010 ? 0.55 : year < 2015 ? 0.15 : 0;
  return era > 0 ? -0.35 * era * age : -0.04 * era * age;
}

/* 好みの要素（追加の問題）。名前は画面に出す短い呼び方 */
export const PREFS = {
  love: '恋愛', gag: 'ギャグ', ensemble: '群像劇', cry: '泣ける', healing: '日常・癒し',
  gore: 'グロ', ecchi: 'お色気', isekai: '異世界転生', sports: 'スポーツ', mecha: 'ロボット',
  music: '音楽・アイドル', moe: '萌え絵', cg: '3DCG', kids: '子ども向け', long: '長編',
  movie: '劇場版', short: 'ショート', popular: '話題作',
  school: '学園', fantasy: 'ファンタジー', scifi: 'SF', historical: '時代劇', modern: '現代舞台',
  horror: 'ホラー', mystery: 'ミステリー', adventure: '冒険', hotblood: '熱血・爽快',
  family: '家族もの', work: 'お仕事もの', mature: '大人向け',
};
const PREF_WHY = {
  love: '恋愛要素がしっかりある', gag: '笑える場面が多い', ensemble: 'キャラが入り乱れる群像劇',
  cry: '思いっきり泣ける', healing: 'のんびり癒される', gore: '容赦のない描写の緊張感',
  ecchi: 'お色気も楽しめる', isekai: '異世界転生もの', sports: '試合の熱さ', mecha: 'ロボット・メカの見せ場',
  music: '歌と演奏が主役', moe: 'かわいい絵柄', cg: '3DCGの迫力', kids: '家族でも見られる',
  long: 'どっぷり浸かれる長編', movie: '2時間で完結する劇場版', short: 'スキマ時間に見られる',
  popular: 'みんなが見ている鉄板作',
  school: '学園の空気感', fantasy: '剣と魔法の世界観', scifi: 'SF的なガジェット',
  historical: '昔の時代の舞台', modern: '今の日本の身近さ', horror: 'ぞくぞくする怖さ',
  mystery: '謎解きの駆け引き', adventure: '知らない土地への冒険', hotblood: '熱くて爽快な展開',
  family: '家族の絆', work: '働く人たちの奮闘', mature: '渋く大人びた空気感',
};

/* 好みの要素の答え。{ love: 1, gore: -1, ... }。答えていないものは入れない */
export function prefs(questions, answers) {
  const out = {};
  questions.forEach((q, i) => {
    if (q.axis === 'pref' && typeof answers[i] === 'number') out[q.key] = answers[i];
  });
  return out;
}

/* 好きな要素がある作品は少し上げ、苦手な要素がある作品は強めに下げる（ほぼ避ける）。
   上げる方は、6 軸がよく合っている作品ほど強く効かせる（好みの要素が軸を追い越さないように）。
   「話題作」は作品の人気（p）で、隠れた名作好きなら人気作を下げる */
export function prefAdjust(p, w, cos = 1) {
  const fit = Math.max(0, Math.min(1, (cos - 0.5) * 2));
  let adj = 0;
  for (const k in p) {
    const v = p[k];
    if (!v) continue;
    if (k === 'popular') { adj += 0.12 * v * ((w.p || 0) - 0.5) * 2; continue; }
    const f = (w.f && w.f[k]) || 0;
    adj += v > 0 ? 0.15 * v * f * fit : 0.30 * v * f;
  }
  /* 好みの要素は何問あっても「小さな上乗せ」のまま。上限が無いと、質問を増やすほど
     （特に片方ばかり選んだ時）total が 1 を超えて、match% が 100% に張り付く作品だらけになり、
     軸の一致度が持っていた「同じ系統でもニュアンスが違う」という差が消えてしまう */
  return clamp(adj, -0.08, 0.08);
}

/* 苦手な要素（はっきり B を選んだもの）を含む作品の数。ローディングの表示用（本当に数えた数） */
export function avoided(p, works) {
  const keys = Object.keys(p).filter((k) => k !== 'popular' && p[k] <= -0.5);
  const n = works.filter((w) => keys.some((k) => ((w.f && w.f[k]) || 0) >= 0.3)).length;
  return { names: keys.map((k) => PREFS[k]), n };
}

export function prefReasons(p, w, max = 2) {
  return Object.keys(p)
    .filter((k) => p[k] >= 0.5 && (k === 'popular' ? (w.p || 0) >= 0.7 : ((w.f && w.f[k]) || 0) >= 0.5))
    .sort((a, b) => p[b] * ((w.f && w.f[b]) || 1) - p[a] * ((w.f && w.f[a]) || 1))
    .slice(0, max)
    .map((k) => PREF_WHY[k]);
}

/* 軸ごとに回答をならす。答えていない問題は数えない */
export function profile(questions, answers) {
  const sum = {}, n = {};
  questions.forEach((q, i) => {
    const v = answers[i];
    if (typeof v !== 'number') return;
    sum[q.axis] = (sum[q.axis] || 0) + v;
    n[q.axis] = (n[q.axis] || 0) + 1;
  });
  return AXES.map((a) => (n[a.key] ? clamp(sum[a.key] / n[a.key]) : 0));
}

/* 勝った側の文字。ちょうど 0 なら + 側 */
export const letters = (u) => AXES.map((a, i) => (u[i] >= 0 ? a.pos : a.neg));

/* RDCP-VM の形。前の 4 軸と、後ろの 2 軸をハイフンで分ける */
export function typeCode(u) {
  const l = letters(u);
  return l.slice(0, 4).join('') + '-' + l.slice(4).join('');
}

/* 二つ名。決め打ちの 4 つ以外は、3 つの部品を組み合わせて 64 通り作る */
const FIXED = {
  'RDCP-VM': '深淵を覗く考察コレクター',
  'FHSA-STL': '脳汁全開の爽快エンタメハンター',
  'FDCA-VM': '異世界を旅するロマン追及者',
  'RHSP-STL': '現実逃避のライトファン',
};
const PART_WORLD_MOOD = { RD: '深淵を覗く', RH: '日常を愛する', FD: '絶望の異界を征く', FH: '異世界を駆ける' };
const PART_STRUCT_TASTE = { CP: '考察', CA: '伏線バトル', SP: '直感ドラマ', SA: '爽快エンタメ' };
const PART_VISUAL_WATCH = { VM: 'コレクター', VL: 'ハンター', STM: 'アナリスト', STL: 'ランナー' };

export function nickname(u) {
  const code = typeCode(u);
  if (FIXED[code]) return FIXED[code];
  const l = letters(u);
  return PART_WORLD_MOOD[l[0] + l[1]] + PART_STRUCT_TASTE[l[2] + l[3]] + PART_VISUAL_WATCH[l[4] + l[5]];
}

/* 軸ごとの一言。タイプの説明と、刺さる理由に使う */
const DESC = {
  R: '地に足のついた人間ドラマに心が動く', F: '現実を忘れられる別世界ほど燃える',
  D: '救いのない展開ほど記憶に残る', H: '逆転と大団円で満たされたい',
  C: '伏線を拾って考察するのが楽しい', S: '勢いとテンポで一気に持っていかれたい',
  P: '読み合いと行間のドラマが好き', A: '作画解放と迫力のバトルが好き',
  V: '映像と演出のセンスでハマる', ST: '脚本とストーリーの面白さで選ぶ',
  M: '一話ずつ噛み締めて、考察まで読み漁る', L: '面白ければ一気見して、次の作品へ',
};
const WHY = {
  R: '現実と地続きの手触り', F: '現実を忘れられる世界観',
  D: '容赦のない展開と重い余韻', H: '最後に報われるカタルシス',
  C: '伏線と考察しがいのある構成', S: '一話目から掴んでくるテンポ',
  P: '読み合いと行間のドラマ', A: '熱量と迫力のある見せ場',
  V: '何度も見返したくなる映像と演出', ST: '先が気になる脚本の強さ',
  M: 'じっくり向き合うほど味が出る深さ', L: '気軽に一気見できる軽やかさ',
};

export function describe(u) {
  return AXES.map((a, i) => ({ i, w: Math.abs(u[i]) }))
    .sort((x, y) => y.w - x.w)
    .filter((x) => x.w >= 0.25)
    .slice(0, 3)
    .map(({ i }) => DESC[u[i] >= 0 ? AXES[i].pos : AXES[i].neg]);
}

export function cosine(u, v) {
  let d = 0, a = 0, b = 0;
  for (let i = 0; i < u.length; i++) { d += u[i] * v[i]; a += u[i] * u[i]; b += v[i] * v[i]; }
  return a && b ? d / Math.sqrt(a * b) : 0;
}

/* 1 作品の点。似ている度合いが主で、人気と★は少しだけ */
function quality(w) {
  const s = typeof w.s === 'number' ? clamp((w.s - 3.2) / 1.3, 0, 1) : 0.4;
  /* cos との合計が 1 を超えやすいと、似た系統の作品が軒並み match 100% に張り付いて
     ニュアンスの違いが消える。上乗せは控えめに（最大 0.126） */
  return 0.084 * (w.p || 0) + 0.042 * s;
}

/* 診断に使える作品だけ（軸の手がかりが少なすぎるものは外す） */
export const usable = (works) => works.filter((w) => (w.i ?? 1) >= 0.25 && w.v.some((x) => Math.abs(x) > 0.15));

/* opts.era … 画質・年代の好み（eraPref）。opts.minYear … これより前の作品は出さない（結果画面の切り替え）
   opts.prefs … 好みの要素（prefs） */
export function rank(u, works, exclude = new Set(), opts = {}) {
  const { era = 0, minYear = 0, prefs: p = {} } = opts;
  const out = [];
  /* 6 軸がどれも「どちらでもない」の人は、好みの要素をそのまま効かせる */
  const flat = u.every((x) => Math.abs(x) < 0.1);
  for (const w of works) {
    if (exclude.has(w.id)) continue;
    if (minYear && w.y && w.y < minYear) continue;
    const c = cosine(u, w.v);
    const total = 0.82 * c + quality(w) + eraAdjust(era, w.y) + prefAdjust(p, w, flat ? 1 : c);
    /* 適合度は並び順と同じ total から出す。cos だけだと「82%なのに選ばれない」ように見える */
    out.push({ work: w, cos: c, total, match: matchPct(total) });
  }
  return out.sort((x, y) => y.total - x.total);
}

/* 表示用の適合度。cos 1 → 100%、0 → 50% */
export const matchPct = (c) => Math.max(0, Math.min(100, Math.round(50 + 50 * c)));

/* シリーズ違い（1期と2期、劇場版など）を同じ作品とみなすための札。
   Filmarks のシリーズ id があればそれ。無ければタイトルの頭（最初の区切りまで） */
export function franchise(w) {
  if (w.se) return 'se' + w.se;
  let t = w.t.normalize('NFKC').replace(/^(劇場版|映画|新劇場版|劇場総集編)\s*/, '');
  const quoted = t.match(/^[「『](.+?)[」』]/);
  if (quoted) t = quoted[1];
  /* 英字のタイトルは頭の 1 語だと短すぎる（ONE PIECE と ONE PUNCH MAN）ので 2 語まで */
  const words = t.split(/[\s　]+/);
  t = /^[\x20-\x7e]+$/.test(words[0]) ? words.slice(0, 2).join('') : words[0];
  return t.toLowerCase().replace(/[・:：!！?？「」『』【】()（）\[\]☆★♪〜~\-‐―_.,、。/／]/g, '').slice(0, 10);
}

/* 片方がもう片方の頭と同じなら同じシリーズ（「呪術廻戦」と「呪術廻戦渋谷事変」） */
export function sameFranchise(a, b) {
  if (a.startsWith('se') || b.startsWith('se')) return a === b;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 3 ? l.startsWith(s) : a === b;
}

/* 運命の 1 作と、次点 2 作。同じシリーズと、軸がほぼ同じ作品は並べない */
export function pick(u, works, n = 3, exclude = new Set(), opts = {}) {
  const ranked = rank(u, works, exclude, opts);
  const chosen = [];
  const used = [];
  for (const c of ranked) {
    if (chosen.length >= n) break;
    const f = franchise(c.work);
    if (used.some((g) => sameFranchise(f, g))) continue;
    if (chosen.some((p) => cosine(p.work.v, c.work.v) > 0.985)) continue;
    chosen.push(c);
    used.push(f);
  }
  return chosen;
}

/* ローディングの「◯◯×◯◯で N 件を除外」。いちばんはっきりした 2 軸で、
   逆の側に寄っている作品を数える（本当に数えた数） */
export function exclusion(u, works) {
  const top = AXES.map((a, i) => ({ a, i, w: Math.abs(u[i]) }))
    .sort((x, y) => y.w - x.w).slice(0, 2);
  const names = top.map(({ a, i }) => (u[i] >= 0 ? a.posName : a.negName));
  let n = 0;
  for (const w of works) {
    if (top.some(({ i }) => u[i] !== 0 && Math.sign(w.v[i]) === -Math.sign(u[i]) && Math.abs(w.v[i]) >= 0.1)) n++;
  }
  return { names, excluded: n };
}

/* この作品がこの人に刺さる理由。両方が同じ側にはっきり寄っている軸を拾う */
export function reasons(u, w, max = 3) {
  return AXES
    .map((a, i) => {
      const x = u[i], y = w.v[i];
      const same = Math.sign(x) === Math.sign(y) && Math.abs(x) >= 0.2 && Math.abs(y) >= 0.25;
      return { strength: same ? Math.abs(x * y) : 0, side: y >= 0 ? a.pos : a.neg };
    })
    .filter((r) => r.strength > 0)
    .sort((p, q) => q.strength - p.strength)
    .slice(0, max)
    .map((r) => WHY[r.side]);
}

function clamp(x, lo = -1, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}
