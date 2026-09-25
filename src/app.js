import { questions, CORE } from './questions.js';
import { AXES, ERA, PREFS, eraPref, prefs, avoided, prefReasons, profile, typeCode, nickname, describe, pick, rank, reasons, exclusion, usable, franchise, sameFranchise } from './logic.js';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const TOTAL = questions.length;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let META = {};
let WORKS = [];            // 診断に使える作品
let answers = [];
let idx = 0;
let user = null;           // 6 軸の値
let era = 0;               // 画質・年代の好み（+ ほど新しめ）
let minYear = 0;           // 結果画面の「放送年」の切り替え
let likes = {};            // 好みの要素（追加の問題）
let extended = false;      // 追加の問題に進んだか
let shown = [];            // [運命の1作, 次点, 次点]
const seen = new Set();    // 「見た」と言われた作品

/* ------------------------------------------------------------ 小道具 */
function show(id) {
  document.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.id !== id; });
  scrollTo({ top: 0, behavior: 'auto' });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const fmt = (n) => n.toLocaleString('ja-JP');

/* ------------------------------------------------------------ 質問 */
function renderQuestion() {
  const q = questions[idx];
  const axis = AXES.find((a) => a.key === q.axis) || ERA;
  const of = extended ? TOTAL : CORE;
  $('count').textContent = `${idx + 1}/${of}`;
  $('progress').setAttribute('aria-valuenow', String(idx));
  $('progress').setAttribute('aria-valuemax', String(of));
  $('progress-fill').style.width = `${(idx / of) * 100}%`;
  $('qaxis').textContent = q.axis === 'pref' ? `好みの要素：${PREFS[q.key]}（タイプには入りません）`
    : axis === ERA ? `${axis.label}（タイプには入りません）` : `${axis.label}　${axis.pos} or ${axis.neg}`;
  $('qtext').textContent = `Q${idx + 1}. ${q.q}`;
  $('qa').textContent = q.a;
  $('qb').textContent = q.b;
  $('back').disabled = idx === 0;

  document.querySelectorAll('#qbox .choice').forEach((b) => {
    const on = answers[idx] === Number(b.dataset.v);
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('ring-2', on);
    b.classList.toggle('ring-sun', on);
  });

  const box = $('qbox');
  box.classList.remove('pop');
  void box.offsetWidth;
  box.classList.add('pop');
  $('qtext').focus({ preventScroll: true });
}

function answer(v) {
  answers[idx] = v;
  if (idx === CORE - 1 && !extended) {
    /* 基本の問題が終わった。結果を見るか、追加の問題で精度を上げるかを選んでもらう */
    $('progress-fill').style.width = '100%';
    show('more');
    return;
  }
  if (idx < TOTAL - 1) {
    idx += 1;
    renderQuestion();
  } else {
    $('progress-fill').style.width = '100%';
    startLoading();
  }
}

/* ------------------------------------------------------------ 軸のバー */
function axisRow(a, value) {
  const row = el('div');
  const head = el('div', 'flex justify-between text-xs font-bold');
  head.append(
    el('span', value < 0 ? 'text-white' : 'text-mute', `${a.neg} ${a.negName}`),
    el('span', 'text-mute', a.label),
    el('span', value >= 0 ? 'text-white' : 'text-mute', `${a.posName} ${a.pos}`),
  );
  const track = el('div', 'axis-track mt-1.5');
  const fill = el('div', 'axis-fill');
  track.append(fill);
  const pct = Math.round(50 + Math.abs(value) * 50);
  row.append(head, track, el('p', 'mt-1 text-right text-[11px] tabular-nums text-mute',
    `${value >= 0 ? a.pos : a.neg} 寄り ${pct}%`));
  row.fill = () => {
    const w = Math.abs(value) * 50;
    fill.style.left = `${value >= 0 ? 50 : 50 - w}%`;
    fill.style.width = `${w}%`;
  };
  return row;
}

/* ------------------------------------------------------------ 広告 */
let adsScript = false;
function fillAd(boxId) {
  const box = $(boxId);
  const name = box.dataset.adSlotName;
  const ads = CONFIG.ads;
  const slot = ads.slots[name];
  const inner = box.querySelector('[data-ad]');
  if (ads.enabled && ads.client && slot) {
    if (inner.dataset.filled) return;
    inner.dataset.filled = '1';
    if (!adsScript) {
      adsScript = true;
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ads.client);
      document.head.append(s);
    }
    inner.className = 'min-h-[100px]';
    inner.textContent = '';
    const ins = el('ins', 'adsbygoogle');
    ins.style.display = 'block';
    ins.dataset.adClient = ads.client;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    inner.append(ins);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    box.hidden = false;
  } else {
    box.hidden = !ads.showPlaceholder;
  }
}

/* ------------------------------------------------------------ 解析中 */
function startLoading() {
  user = profile(questions, answers);
  era = eraPref(questions, answers);
  likes = prefs(questions, answers);
  /* 新しめをはっきり選んだ人は、はじめから 2010 年以降に絞っておく（結果画面で外せる） */
  minYear = era >= 0.75 ? 2010 : 0;
  const code = typeCode(user);
  const ex = exclusion(user, WORKS);
  const answered = answers.filter((a) => typeof a === 'number').length;
  const av = avoided(likes, WORKS);
  const lines = [
    `> ${fmt(WORKS.length)}件のアニメデータベースと${answered}の嗜好パラメータを照合中…`,
    `> 『${ex.names[0]}』×『${ex.names[1]}』で${fmt(ex.excluded)}件を除外…`,
    ...(av.names.length ? [`> 苦手な${av.names.map((n) => `『${n}』`).join('')}を含む${fmt(av.n)}件を後ろに回しています…`] : []),
    `> 残り${fmt(WORKS.length - ex.excluded)}件とのコサイン類似度を計算中…`,
    `> あなたのアニメタイプ【${code}】に適合する『運命の1作』を特定しました！`,
  ];
  show('loading');

  const pr = CONFIG.loadingPr;
  if (pr.enabled && pr.url && pr.title) {
    const b = $('loading-pr');
    b.querySelector('[data-pr-link]').href = pr.url;
    b.querySelector('[data-pr-title]').textContent = pr.title;
    b.querySelector('[data-pr-text]').textContent = pr.text || '';
    b.hidden = false;
    $('ad-loading').hidden = true;
  } else {
    fillAd('ad-loading');
  }

  /* 結果は先に計算しておく（待たせるのは演出だけ） */
  shown = pick(user, WORKS, 3, seen, { era, minYear, prefs: likes });

  const log = $('loading-log');
  log.replaceChildren();
  const ms = reduced ? Math.min(1200, CONFIG.loadingMs) : CONFIG.loadingMs;
  const t0 = performance.now();
  let shownLines = 0;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    $('loading-bar').style.width = `${k * 100}%`;
    $('loading-pct').textContent = `${Math.floor(k * 100)}%`;
    const want = Math.min(lines.length, 1 + Math.floor(k * lines.length * 0.999));
    while (shownLines < want) {
      const li = el('li', 'pop', lines[shownLines]);
      if (shownLines === lines.length - 1) li.className = 'pop font-bold text-sun';
      log.append(li);
      shownLines += 1;
    }
    if (k < 1) requestAnimationFrame(tick);
    else setTimeout(renderResult, 250);
  };
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------ 結果 */
function renderResult() {
  const code = typeCode(user);
  const name = nickname(user);
  $('type-code').textContent = code;
  $('type-name').textContent = `【${name}型】`;
  $('type-desc').replaceChildren(...describe(user).map((d) => el('li', '', '・' + d)));
  const axes = AXES.map((a, i) => axisRow(a, user[i])).concat(axisRow(ERA, era));
  $('result-axes').replaceChildren(...axes);

  const love = Object.keys(likes).filter((k) => likes[k] >= 0.5).map((k) => PREFS[k]);
  const hate = Object.keys(likes).filter((k) => likes[k] <= -0.5).map((k) => PREFS[k]);
  $('pref-summary').replaceChildren(...[['好き', love, 'text-hot'], ['苦手', hate, 'text-cool']]
    .filter(([, l]) => l.length)
    .map(([label, l, cls]) => {
      const li = el('li');
      li.append(el('b', cls, `${label}: `), document.createTextNode(l.join('・')));
      return li;
    }));
  $('more-from-result').hidden = extended;
  renderYearChips();
  renderPicks();
  show('result');
  fillAd('ad-top');
  requestAnimationFrame(() => requestAnimationFrame(() => axes.forEach((r) => r.fill())));
  setupShare(code, name);

  $('note-source').textContent = '※ タイプと適合度は当サイト独自の計算です。';
  $('note-affiliate').hidden = !CONFIG.vod.some((v) => v.url);
}

/* 放送年の切り替え。押すと、その条件で 3 作を選び直す */
const YEAR_CHOICES = [[0, 'こだわらない'], [2010, '2010年以降'], [2018, '2018年以降']];
function renderYearChips() {
  const box = $('year-chips');
  box.replaceChildren(...YEAR_CHOICES.map(([y, label]) => {
    const b = el('button', `rounded-full border px-3 py-1.5 text-xs font-bold transition ${y === minYear
      ? 'border-sun bg-sun text-ink' : 'border-line text-slate-300 hover:border-white'}`, label);
    b.type = 'button';
    b.dataset.year = String(y);
    b.setAttribute('aria-pressed', String(y === minYear));
    b.addEventListener('click', () => {
      minYear = y;
      shown = pick(user, WORKS, 3, seen, { era, minYear, prefs: likes });
      renderYearChips();
      renderPicks();
    });
    return b;
  }));
}

function renderPicks() {
  $('fate').replaceChildren(card(shown[0], 0, true));
  $('runners').replaceChildren(...shown.slice(1).map((c, i) => {
    const li = el('li');
    li.append(card(c, i + 1, false));
    return li;
  }));
}

function hue(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function card(c, i, big) {
  const w = c.work;
  const box = el('article', `pop overflow-hidden rounded-3xl border bg-panel ${big ? 'border-sun/60 shadow-2xl shadow-hot/20' : 'border-line'}`);
  box.style.animationDelay = `${i * 90}ms`;

  const top = el('div', `relative flex items-end p-5 ${big ? 'h-56' : 'h-32'}`);
  if (CONFIG.showImages && w.img) {
    top.classList.add('bg-cover', 'bg-center');
    top.style.backgroundImage = `linear-gradient(to top, rgb(7 12 23 / .95), rgb(7 12 23 / .1)), url("${encodeURI(w.img)}")`;
  } else {
    const h = hue(w.t);
    top.style.background = `linear-gradient(135deg, hsl(${h} 70% 38%), hsl(${(h + 70) % 360} 70% 20%))`;
  }
  top.append(
    el('span', 'absolute left-4 top-4 rounded-full bg-ink/70 px-3 py-1 text-xs font-black text-sun', big ? '運命の1作' : `次点 ${i}`),
    el('span', `absolute right-4 top-4 rounded-full bg-ink/70 px-3 py-1 font-black text-white ${big ? 'text-base' : 'text-xs'}`, `${c.match}%適合`),
    el('h3', `font-black leading-tight drop-shadow ${big ? 'text-4xl' : 'text-2xl'}`, w.t),
  );

  const body = el('div', 'grid gap-4 p-4 sm:p-5');
  const meta = el('div', 'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm');
  const media = { TV: 'TVアニメ', MOVIE: '劇場版', OVA: 'OVA', WEB: '配信' }[w.m] || w.m;
  if (w.y) meta.append(el('span', 'text-mute', `${w.y}年・${media}`));
  body.append(meta);

  if (w.syn) body.append(el('p', 'text-sm leading-relaxed text-slate-300', w.syn + (w.syn.length >= 110 ? '…' : '')));

  const why = [...reasons(user, w, 2), ...prefReasons(likes, w, 2)].slice(0, 4);
  if (why.length) {
    const r = el('div', 'rounded-2xl bg-ink/60 p-3');
    r.append(el('p', 'text-xs font-bold text-hot', 'あなたに刺さる理由'));
    const ul = el('ul', 'mt-1 grid gap-0.5 text-sm');
    why.forEach((x) => ul.append(el('li', '', '✓ ' + x)));
    r.append(ul);
    body.append(r);
  }

  if (w.g && w.g.length) {
    const tags = el('div', 'flex flex-wrap gap-1.5');
    w.g.forEach((t) => tags.append(el('span', 'rounded-full border border-line px-2.5 py-0.5 text-xs text-slate-300', '#' + t)));
    body.append(tags);
  }

  body.append(vodButtons(w, big));

  const seenBtn = el('button', 'justify-self-end rounded-xl border border-line px-3 py-1.5 text-xs text-mute hover:border-white hover:text-white', '見た → 別の作品にする');
  seenBtn.type = 'button';
  seenBtn.addEventListener('click', () => replace(i));
  body.append(seenBtn);

  box.append(top, body);
  return box;
}

function fill(tpl, q, url) {
  return tpl.replaceAll('{q}', encodeURIComponent(q)).replaceAll('{url}', encodeURIComponent(url || ''));
}

function vodButtons(w, big) {
  const wrap = el('div', 'grid gap-2');
  for (const v of CONFIG.vod) {
    const plain = fill(v.search, w.t);
    const a = el('a', `flex items-center justify-center gap-2 rounded-2xl px-4 font-black text-white transition ${big ? 'py-4 text-base' : 'py-3 text-sm'} ${v.className || 'bg-white/10'}`);
    a.target = '_blank';
    if (v.url) {
      a.href = fill(v.url, w.t, plain);
      a.rel = 'sponsored noopener';
      a.append(el('span', 'rounded bg-white/90 px-1 text-[10px] font-black text-ink', 'PR'));
    } else {
      a.href = plain;
      a.rel = 'noopener';
    }
    a.dataset.vod = v.id;
    a.append(document.createTextNode(v.label));
    wrap.append(a);
  }
  return wrap;
}

function replace(i) {
  seen.add(shown[i].work.id);
  const others = new Set([...seen, ...shown.map((c) => c.work.id)]);
  const taken = shown.map((c) => franchise(c.work));
  const next = rank(user, WORKS, others, { era, minYear, prefs: likes }).find((c) => !taken.some((g) => sameFranchise(g, franchise(c.work))));
  if (!next) return;
  shown[i] = next;
  renderPicks();
}

/* ------------------------------------------------------------ 共有 */
function setupShare(code, name) {
  const text = CONFIG.shareText.replace('{code}', code).replace('{name}', name);
  const params = new URLSearchParams({ text, url: CONFIG.appUrl, hashtags: CONFIG.shareTags.join(',') });
  $('share-x').href = 'https://x.com/intent/post?' + params;
  const nat = $('share-native');
  if (navigator.share) {
    nat.hidden = false;
    nat.onclick = () => navigator.share({
      title: 'ガチアニメ診断', url: CONFIG.appUrl,
      text: text + ' ' + CONFIG.shareTags.map((t) => '#' + t).join(' '),
    }).catch(() => {});
  }
}

/* ------------------------------------------------------------ はじまり */
function reset() {
  answers = [];
  idx = 0;
  extended = false;
  seen.clear();
  renderQuestion();
  show('quiz');
}

document.querySelectorAll('#qbox .choice').forEach((b) => {
  b.addEventListener('click', () => answer(Number(b.dataset.v)));
});
$('back').addEventListener('click', () => { if (idx > 0) { idx -= 1; renderQuestion(); } });
$('start').addEventListener('click', reset);
function goExtended() {
  extended = true;
  idx = CORE;
  renderQuestion();
  show('quiz');
}
$('more-go').addEventListener('click', goExtended);
$('more-skip').addEventListener('click', startLoading);
$('more-from-result').addEventListener('click', goExtended);
$('retry').addEventListener('click', reset);

fetch(CONFIG.dbUrl)
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => {
    META = d.meta || {};
    WORKS = usable(d.works || []);
    const b = $('start');
    b.disabled = false;
    b.textContent = '全アニメDBから1分で導く【運命の1作】ガチ診断';
    const day = (META.generated_at || '').slice(0, 10);
    $('db-count').textContent = `収録 ${fmt(WORKS.length)} 作品${day ? `（${day} 更新）` : ''}・全${CORE}問（＋精度アップの${TOTAL - CORE}問）`;
  })
  .catch(() => show('error'));
