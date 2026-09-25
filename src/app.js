import { questions } from './questions.js';
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
  $('count').textContent = `${idx + 1}/${TOTAL}`;
  $('progress').setAttribute('aria-valuenow', String(idx));
  $('progress').setAttribute('aria-valuemax', String(TOTAL));
  $('progress-fill').style.width = `${(idx / TOTAL) * 100}%`;
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
  /* flex + justify-between だと、左右のラベルの文字数が違う時に真ん中のラベルが
     バーの中心からズレる。3等分グリッドで確実に中央に揃える */
  const head = el('div', 'grid grid-cols-3 text-xs font-bold');
  head.append(
    el('span', `text-left ${value < 0 ? 'text-white' : 'text-mute'}`, `${a.neg} ${a.negName}`),
    el('span', 'text-center text-mute', a.label),
    el('span', `text-right ${value >= 0 ? 'text-white' : 'text-mute'}`, `${a.posName} ${a.pos}`),
  );
  const track = el('div', 'axis-track mt-1.5');
  const fill = el('div', 'axis-fill');
  track.append(fill);
  /* ちょうど 0 でも「寄り 50%」という自己矛盾した表示にはしない。最低 51% は主張する */
  const pct = Math.max(51, Math.round(50 + Math.abs(value) * 50));
  row.append(head, track, el('p', 'mt-1 text-right text-[11px] tabular-nums text-mute',
    `${value >= 0 ? a.pos : a.neg} 寄り ${pct}%`));
  row.fill = () => {
    const w = Math.max(1, Math.abs(value) * 50);
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

  /* h ではなく min-h。タイトルが3行になった時に上のバッジ（次点・適合度）と
     重ならないよう、固定の高さではなく足りない分だけ伸びるようにする */
  const top = el('div', `relative flex items-end p-5 ${big ? 'min-h-56' : 'min-h-32'}`);
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
    /* mt-12: タイトルがどれだけ長くなっても、上のバッジ（次点・適合度）の
       分だけは必ず空けておく（items-end で下寄せなので、margin が無いと
       長いタイトルがバッジに埋もれる） */
    el('h3', `mt-12 font-black leading-tight drop-shadow ${big ? 'text-4xl' : 'text-2xl'}`, w.t),
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

const MAX_VOD_BUTTONS = 3;   // サービスを増やしても、カードが縦に伸びすぎないように絞る

function vodButtons(w, big) {
  const wrap = el('div', 'grid gap-2');
  /* Filmarks が「実際にここで見られる」と言っている物だけ出す。
     w.vod が分からない（空）作品は、確かめようがないので今まで通り全部の中から出す。
     どちらも config.vod の並び順（メジャー度順）で上位だけに絞る */
  const matched = w.vod && w.vod.length ? CONFIG.vod.filter((v) => w.vod.includes(v.id)) : CONFIG.vod;
  const list = matched.slice(0, MAX_VOD_BUTTONS);
  for (const v of list) {
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
  /* そのカードだけを差し替えるのではなく、次点を繰り上げる。
     適合度は常に高い順（運命の1作 → 次点）を保つため */
  seen.add(shown[i].work.id);
  shown = pick(user, WORKS, 3, seen, { era, minYear, prefs: likes });
  renderPicks();
}

/* ------------------------------------------------------------ 共有 */
/* TOP3（運命の1作＋次点2作）が決まるたびに shown が変わるので、
   文面・画像はボタンを押した時点の shown から毎回作る（使い回さない） */
function shareText(code, name) {
  const top = shown[0];
  return CONFIG.shareText.replace('{code}', code).replace('{name}', name)
    .replace('{title}', top.work.t).replace('{match}', top.match);
}

function setupShare(code, name) {
  /* shown は「見た→別の作品」や放送年の絞り込みで後から変わるので、
     押した時点の TOP3 で文面を作り直してから開く */
  const shareX = $('share-x');
  const refreshShareX = () => {
    const params = new URLSearchParams({ text: shareText(code, name), url: CONFIG.appUrl, hashtags: CONFIG.shareTags.join(',') });
    shareX.href = 'https://x.com/intent/post?' + params;
  };
  refreshShareX();
  shareX.addEventListener('click', refreshShareX);

  const nat = $('share-native');
  const dummy = new File([''], 'x.png', { type: 'image/png' });
  const canFiles = !!(navigator.canShare && navigator.canShare({ files: [dummy] }));
  nat.textContent = canFiles ? '結果の画像をほかのアプリで送る' : '結果の画像を保存';
  nat.onclick = async () => {
    nat.disabled = true;
    const label = nat.textContent;
    nat.textContent = '画像を作っています…';
    try {
      const blob = await buildShareImage(code, name);
      const file = new File([blob], 'gachianime-shindan.png', { type: 'image/png' });
      if (canFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'ガチアニメ診断', text: shareText(code, name) });
      } else {
        const a = el('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'gachianime-shindan.png';
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      if (e?.name !== 'AbortError') console.error(e);
    } finally {
      nat.disabled = false;
      nat.textContent = label;
    }
  };
}

/* ------------------------------------------------------- 共有画像づくり */
const SHARE_W = 1080, SHARE_H = 1350;
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

/* CORS 許可（Access-Control-Allow-Origin）が無い画像は、読めても canvas から
   書き出す時に SecurityError になる。crossOrigin='anonymous' を付けておけば
   許可の無いサーバーは読み込み自体が失敗するので、その時はグラデーションに逃がす */
function loadImageSafe(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 日本語には単語の区切りが無いので、英数字のかたまりだけ崩さずに1文字ずつ詰める */
function wrapLines(ctx, text, maxWidth, maxLines) {
  const tokens = text.match(/[A-Za-z0-9!?！？．.,、。～〜\-…]+|./gs) || [];
  const all = [];
  let line = '';
  for (const t of tokens) {
    const test = line + t;
    if (line && ctx.measureText(test).width > maxWidth) { all.push(line); line = t; }
    else line = test;
  }
  if (line) all.push(line);
  if (all.length <= maxLines) return all;
  const lines = all.slice(0, maxLines);
  let last = lines[maxLines - 1];
  while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
  lines[maxLines - 1] = last + '…';
  return lines;
}

function drawBadge(ctx, text, x, y, { align = 'left', font, fg = '#fff', bg = 'rgba(7,12,23,.72)' }) {
  ctx.font = font;
  const padX = 18, h = 44;
  const w = ctx.measureText(text).width + padX * 2;
  const bx = align === 'right' ? x - w : x;
  roundRectPath(ctx, bx, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + padX, y + h / 2 + 1);
}

async function drawWorkCard(ctx, c, x, y, w, h, label, big) {
  roundRectPath(ctx, x, y, w, h, 28);
  ctx.save();
  ctx.clip();

  const img = await loadImageSafe(CONFIG.showImages ? c.work.img : null);
  if (img) {
    const scale = Math.max(w / img.width, h / img.height);
    const iw = img.width * scale, ih = img.height * scale;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, 'rgba(7,12,23,.1)');
    grad.addColorStop(1, 'rgba(7,12,23,.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  } else {
    const hu = hue(c.work.t);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, `hsl(${hu} 70% 38%)`);
    grad.addColorStop(1, `hsl(${(hu + 70) % 360} 70% 20%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();

  drawBadge(ctx, label, x + 20, y + 20, { font: `900 ${big ? 26 : 20}px ${FONT}`, fg: '#ffc44d' });
  drawBadge(ctx, `${c.match}%適合`, x + w - 20, y + 20, { align: 'right', font: `900 ${big ? 26 : 20}px ${FONT}` });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  const size = big ? 46 : 32, lh = big ? 52 : 38, maxLines = big ? 3 : 2;
  ctx.font = `900 ${size}px ${FONT}`;
  const lines = wrapLines(ctx, c.work.t, w - 48, maxLines);
  let ty = y + h - 24 - (lines.length - 1) * lh;
  for (const ln of lines) { ctx.fillText(ln, x + 24, ty); ty += lh; }
}

async function buildShareImage(code, name) {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#070c17';
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  const glow = (cx, cy, color) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, SHARE_W * .8);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  };
  glow(SHARE_W * .1, 0, 'rgba(125,107,255,.28)');
  glow(SHARE_W, SHARE_H * .12, 'rgba(255,92,147,.22)');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffc44d';
  ctx.font = `900 32px ${FONT}`;
  ctx.fillText('ガチアニメ診断', SHARE_W / 2, 74);

  ctx.font = `900 84px ${FONT}`;
  ctx.fillText(code, SHARE_W / 2, 176);

  ctx.fillStyle = '#fff';
  ctx.font = `900 44px ${FONT}`;
  const nameLine = wrapLines(ctx, `【${name}型】`, SHARE_W - 100, 1)[0];
  ctx.fillText(nameLine, SHARE_W / 2, 232);

  ctx.fillStyle = '#ff5c93';
  ctx.font = `900 26px ${FONT}`;
  ctx.fillText('あなたに今刺さる3作', SHARE_W / 2, 288);

  const cardX = 60, cardW = SHARE_W - 120;
  const rows = [
    { y: 316, h: 330, label: '運命の1作', big: true },
    { y: 674, h: 186, label: '次点1', big: false },
    { y: 880, h: 186, label: '次点2', big: false },
  ];
  for (let i = 0; i < rows.length && i < shown.length; i++) {
    await drawWorkCard(ctx, shown[i], cardX, rows[i].y, cardW, rows[i].h, rows[i].label, rows[i].big);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#9aa6c2';
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText('あなたのタイプは？ 今すぐ無料診断', SHARE_W / 2, 1250);
  ctx.fillStyle = '#fff';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillText(CONFIG.appUrl.replace(/^https?:\/\//, ''), SHARE_W / 2, 1296);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
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

fetch(CONFIG.dbUrl)
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => {
    META = d.meta || {};
    WORKS = usable(d.works || []);
    const b = $('start');
    b.disabled = false;
    b.textContent = '全アニメDBから1分で導く【運命の1作】ガチ診断';
    const day = (META.generated_at || '').slice(0, 10);
    $('db-count').textContent = `収録 ${fmt(WORKS.length)} 作品${day ? `（${day} 更新）` : ''}・全${TOTAL}問`;
  })
  .catch(() => show('error'));
