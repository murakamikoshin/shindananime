import { questions } from './questions.js';
import { AXES, profile, typeName, describe, pick, rank, reasons } from './logic.js';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const TOTAL = questions.length;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let DATA = null;           // anime_data.json
let answers = [];
let idx = 0;
let user = null;           // 6 軸の値
let shown = [];            // いま出している 3 作
const seen = new Set();    // 「見た」と言われた作品

/* ------------------------------------------------------------ 画面の出し分け */
function show(id) {
  document.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.id !== id; });
  scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* ------------------------------------------------------------ 質問 */
function renderQuestion() {
  const q = questions[idx];
  const axis = AXES.find((a) => a.key === q.axis);
  $('count').textContent = `${idx + 1} / ${TOTAL}`;
  $('progress').setAttribute('aria-valuenow', String(idx));
  $('progress-fill').style.width = `${(idx / TOTAL) * 100}%`;
  $('qaxis').textContent = `${axis.label}　${axis.pos} or ${axis.neg}`;
  $('qtext').textContent = `Q${idx + 1}. ${q.q}`;
  $('qa').textContent = q.a;
  $('qb').textContent = q.b;
  $('back').disabled = idx === 0;

  /* 戻ってきた時は、前の答えに印を付けておく */
  document.querySelectorAll('#qbox .choice').forEach((b) => {
    const on = answers[idx] === Number(b.dataset.v);
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('ring-2', on);
    b.classList.toggle('ring-sun', on);
  });

  const box = $('qbox');
  box.classList.remove('pop');
  void box.offsetWidth;          // 動きをやり直す
  box.classList.add('pop');
  $('qtext').focus({ preventScroll: true });
}

function answer(v) {
  answers[idx] = v;
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
  const left = el('span', value < 0 ? 'text-white' : 'text-mute', `${a.neg} ${a.negName}`);
  const right = el('span', value >= 0 ? 'text-white' : 'text-mute', `${a.posName} ${a.pos}`);
  head.append(left, el('span', 'text-mute', a.label), right);
  const track = el('div', 'axis-track mt-1.5');
  const fill = el('div', 'axis-fill');
  track.append(fill);
  const pct = Math.round(50 + Math.abs(value) * 50);
  const cap = el('p', 'mt-1 text-right text-[11px] tabular-nums text-mute',
    Math.abs(value) < 0.1 ? 'ほぼ半々' : `${value >= 0 ? a.pos : a.neg} 寄り ${pct}%`);
  row.append(head, track, cap);
  row.fill = () => {
    /* 右（+）へは 50%→、左（-）へは ←50% に伸ばす */
    const w = Math.abs(value) * 50;
    fill.style.left = `${value >= 0 ? 50 : 50 - w}%`;
    fill.style.width = `${w}%`;
  };
  return row;
}

/* ------------------------------------------------------------ 解析中 */
function startLoading() {
  user = profile(questions, answers);
  show('loading');
  const n = DATA.anime.length.toLocaleString('ja-JP');
  const lines = [
    `${n}作品のアニメDBと${TOTAL}の嗜好パラメータを照合中…`,
    '世界観と後味の傾きを測っています…',
    '「ダーク好き」の中でも、頭脳戦派か愛憎劇派かを見分けています…',
    'あなたに刺さる3作を絞り込んでいます…',
  ];
  const msg = $('loading-msg');
  const box = $('loading-axes');
  box.replaceChildren();
  const rows = AXES.map((a) => axisRow(a, user[a.key]));
  box.append(...rows);

  const pr = CONFIG.loadingPr;
  const prBox = $('loading-pr');
  if (pr.enabled && pr.url && pr.title) {
    prBox.querySelector('[data-pr-label]').textContent = pr.label || 'PR';
    prBox.querySelector('[data-pr-link]').href = pr.url;
    prBox.querySelector('[data-pr-title]').textContent = pr.title;
    prBox.querySelector('[data-pr-text]').textContent = pr.text || '';
    prBox.hidden = false;
  }

  const ms = reduced ? Math.min(900, CONFIG.loadingMs) : CONFIG.loadingMs;
  const step = ms / lines.length;
  lines.forEach((t, i) => setTimeout(() => { msg.textContent = t; }, i * step));
  rows.forEach((r, i) => setTimeout(r.fill, 150 + (i * (ms * 0.6)) / rows.length));
  setTimeout(renderResult, ms);
}

/* ------------------------------------------------------------ 結果 */
function renderResult() {
  const t = typeName(user);
  $('type-code').textContent = t.code;
  $('type-name').textContent = t.name;
  $('type-badge').textContent = t.badge;
  $('type-desc').replaceChildren(...describe(user).map((d) => el('li', '', '・' + d)));
  const axes = AXES.map((a) => axisRow(a, user[a.key]));
  $('result-axes').replaceChildren(...axes);

  shown = pick(user, DATA.anime, 3, { exclude: seen });
  renderPicks();
  show('result');
  requestAnimationFrame(() => requestAnimationFrame(() => axes.forEach((r) => r.fill())));

  setupShare(t);
  setupAds();

  const m = DATA.meta || {};
  const day = (m.generated_at || '').slice(0, 10);
  $('note-source').textContent = m.from_filmarks
    ? `※ スコアは Filmarks の★（${day} 時点）。軸の値とおすすめの選び方は当サイト独自のものです。`
    : '※ スコアを取得できていない作品は、Filmarks のページへのリンクだけを出しています。軸の値とおすすめの選び方は当サイト独自のものです。';
  $('note-affiliate').hidden = !CONFIG.vod.some((v) => v.affiliate);
}

function renderPicks() {
  $('picks').replaceChildren(...shown.map((c, i) => card(c, i)));
}

/* 作品名から色を決める。画像を出さない時の表紙代わり */
function hue(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function card(c, i) {
  const a = c.anime;
  const li = el('li', 'pop overflow-hidden rounded-3xl border border-line bg-panel');
  li.style.animationDelay = `${i * 90}ms`;

  const top = el('div', 'relative flex h-28 items-end p-4');
  if (CONFIG.showImages && a.image) {
    top.className = 'relative flex h-40 items-end bg-cover bg-center p-4';
    top.style.backgroundImage = `linear-gradient(to top, rgb(7 12 23 / .95), transparent), url("${encodeURI(a.image)}")`;
  } else {
    const h = hue(a.title);
    top.style.background = `linear-gradient(135deg, hsl(${h} 70% 35%), hsl(${(h + 60) % 360} 70% 22%))`;
  }
  const rankBadge = el('span', 'absolute left-4 top-4 rounded-full bg-ink/70 px-3 py-1 text-xs font-black text-sun', `No.${i + 1}`);
  const match = el('span', 'absolute right-4 top-4 rounded-full bg-ink/70 px-3 py-1 text-xs font-black text-white', `相性 ${c.match}%`);
  const title = el('h3', 'text-2xl font-black leading-tight drop-shadow', a.title);
  top.append(rankBadge, match, title);

  const body = el('div', 'grid gap-4 p-4 sm:p-5');

  const meta = el('div', 'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm');
  if (a.year) meta.append(el('span', 'text-mute', `${a.year}年〜`));
  const fm = el('a', 'font-bold text-sun underline-offset-2 hover:underline');
  fm.href = a.filmarks_url;
  fm.target = '_blank';
  fm.rel = 'noopener';
  fm.textContent = typeof a.score === 'number' ? `Filmarks ★${a.score.toFixed(1)}` : 'Filmarks でレビューを見る';
  meta.append(fm);
  body.append(meta);

  if (a.synopsis) body.append(el('p', 'text-sm leading-relaxed text-slate-300', a.synopsis));

  const why = reasons(user, a);
  if (why.length) {
    const box = el('div', 'rounded-2xl bg-ink/60 p-3');
    box.append(el('p', 'text-xs font-bold text-hot', 'あなたに刺さる理由'));
    const ul = el('ul', 'mt-1 grid gap-0.5 text-sm');
    why.forEach((w) => ul.append(el('li', '', '✓ ' + w)));
    box.append(ul);
    body.append(box);
  }

  if (a.tags && a.tags.length) {
    const tags = el('div', 'flex flex-wrap gap-1.5');
    a.tags.slice(0, 6).forEach((tg) => tags.append(el('span', 'rounded-full border border-line px-2.5 py-0.5 text-xs text-slate-300', '#' + tg)));
    body.append(tags);
  }

  body.append(vodLinks(a));

  const seenBtn = el('button', 'justify-self-end rounded-xl border border-line px-3 py-1.5 text-xs text-mute hover:border-white hover:text-white', '見た → 別の作品にする');
  seenBtn.type = 'button';
  seenBtn.addEventListener('click', () => replace(i));
  body.append(seenBtn);

  li.append(top, body);
  return li;
}

function fill(tpl, q, url) {
  return tpl.replaceAll('{q}', encodeURIComponent(q)).replaceAll('{url}', encodeURIComponent(url || ''));
}

function vodLinks(a) {
  const wrap = el('div');
  const known = (a.vod || []).length > 0;
  wrap.append(el('p', 'text-xs font-bold text-mute',
    known ? '配信（Filmarks 取得時点。最新は各サービスで）' : '配信サービスで探す'));
  const row = el('div', 'mt-2 flex flex-wrap gap-2');
  const list = known ? CONFIG.vod.filter((v) => a.vod.includes(v.id)) : CONFIG.vod;
  for (const v of list) {
    const plain = fill(v.search, a.title);
    const link = el('a', 'inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20');
    link.target = '_blank';
    if (v.affiliate) {
      link.href = fill(v.affiliate, a.title, plain);
      link.rel = 'sponsored noopener';
      link.append(el('span', 'rounded bg-sun px-1 text-[10px] font-black text-ink', 'PR'));
    } else {
      link.href = plain;
      link.rel = 'noopener';
    }
    link.append(document.createTextNode(v.name + (known ? 'で見る' : 'で探す')));
    row.append(link);
  }
  wrap.append(row);
  return wrap;
}

function replace(i) {
  seen.add(shown[i].anime.id);
  const others = new Set([...seen, ...shown.map((c) => c.anime.id)]);
  const next = rank(user, DATA.anime, { exclude: others })[0];
  if (!next) {
    alert('ここまでで出せる作品が尽きました。');
    return;
  }
  shown[i] = next;
  renderPicks();
  setupShare(typeName(user));
}

/* ------------------------------------------------------------ 共有 */
function setupShare(t) {
  const titles = shown.map((c) => `『${c.anime.title}』`).join('');
  const text = `私は「${t.name}」タイプ（${t.code}）でした。\n刺さる神アニメは ${titles}\n#神アニメ診断`;
  $('share-x').href = 'https://x.com/intent/post?' + new URLSearchParams({ text, url: CONFIG.appUrl });
  const nat = $('share-native');
  if (navigator.share) {
    nat.hidden = false;
    nat.onclick = () => navigator.share({ title: '神アニメ診断', text, url: CONFIG.appUrl }).catch(() => {});
  }
}

/* ------------------------------------------------------------ 広告 */
let adsLoaded = false;
function setupAds() {
  const ads = CONFIG.ads;
  if (!ads.enabled || !ads.client || !ads.slots.result || adsLoaded) return;
  adsLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ads.client);
  document.head.append(s);
  const ins = el('ins', 'adsbygoogle');
  ins.style.display = 'block';
  ins.dataset.adClient = ads.client;
  ins.dataset.adSlot = ads.slots.result;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  const box = $('ad-result');
  box.querySelector('[data-ad]').append(ins);
  box.hidden = false;
  (window.adsbygoogle = window.adsbygoogle || []).push({});
}

/* ------------------------------------------------------------ はじまり */
function reset() {
  answers = [];
  idx = 0;
  seen.clear();
  renderQuestion();
  show('quiz');
}

document.querySelectorAll('#qbox .choice').forEach((b) => {
  b.addEventListener('click', () => answer(Number(b.dataset.v)));
});
$('back').addEventListener('click', () => { if (idx > 0) { idx -= 1; renderQuestion(); } });
$('start').addEventListener('click', reset);
$('retry').addEventListener('click', reset);

fetch('./anime_data.json')
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => {
    DATA = d;
    const b = $('start');
    b.disabled = false;
    b.textContent = `診断をはじめる（全${TOTAL}問）`;
  })
  .catch(() => show('error'));
