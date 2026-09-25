/* 本物のブラウザで、はじめから結果まで押して確かめる。
       npm run build && node tools/e2e.mjs [--shots]
   本番と同じく /app/shindananime/ の下に置いて開く（相対指定の漏れを捕まえる）。
   --shots を付けると store/ に画面写真を残す（紹介ページ用） */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const SHOTS = process.argv.includes('--shots');

let pw;
try { pw = await import('playwright'); } catch {
  const g = execSync('npm root -g').toString().trim();
  pw = await import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml' };
const BASE = '/app/shindananime/';
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(BASE)) { res.writeHead(404); return res.end('outside'); }
  const file = join(dist, path.slice(BASE.length) || 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}${BASE}`;

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let bad = 0;
const ok = (c, m) => { if (!c) { console.error('× ' + m); bad = 1; } };

for (const vp of [{ width: 390, height: 844, name: 'phone' }, { width: 1280, height: 900, name: 'desktop' }]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push('failed ' + r.url()));
  await page.goto(url);
  await page.waitForSelector('#start:not([disabled])');
  if (SHOTS && vp.name === 'phone') await page.screenshot({ path: join(root, 'store', 'shot-intro.png') });
  await page.click('#start');

  /* ダーク×頭脳戦 に寄せて答える。途中で一度戻る */
  const pattern = [1, 1, 0.5, 1, 1, 0.5, 1, 1, 1, -1, -1, -0.5, 1, 1, 1, 0.5, 1, 0];
  for (let i = 0; i < pattern.length; i++) {
    ok((await page.textContent('#count')).trim() === `${i + 1} / 18`, `${i + 1} 問目の数え方`);
    if (SHOTS && vp.name === 'phone' && i === 3) await page.mouse.move(0, 0), await page.waitForTimeout(500), await page.screenshot({ path: join(root, 'store', 'shot-quiz.png') });
    if (i === 5) {
      await page.click('#back');
      ok((await page.textContent('#count')).trim() === '5 / 18', '戻る');
      await page.click(`#qbox .choice[data-v="${pattern[4]}"]`);
    }
    await page.click(`#qbox .choice[data-v="${pattern[i]}"]`);
  }
  await page.waitForSelector('#loading:not([hidden])');
  await page.waitForTimeout(1200);
  const msg = await page.textContent('#loading-msg');
  ok(/作品のアニメDBと18の嗜好パラメータを照合中|傾き|見分け|絞り込/.test(msg), '解析中の文言: ' + msg);
  if (SHOTS && vp.name === 'phone') await page.screenshot({ path: join(root, 'store', 'shot-loading.png') });
  await page.waitForSelector('#result:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(1200);

  const code = (await page.textContent('#type-code')).trim();
  ok(/^RDCIPV$/.test(code), 'タイプ: ' + code);
  const titles = await page.$$eval('#picks h3', (hs) => hs.map((h) => h.textContent));
  ok(titles.length === 3, '3 作');
  console.log(`${vp.name}: ${code} ${await page.textContent('#type-name')} → ${titles.join(' / ')}`);
  ok((await page.$$('#picks a[href*="filmarks.com"]')).length === 3, 'Filmarks へのリンク');
  ok((await page.$$('#picks a[rel~="sponsored"]')).length === 0, '提携を書いていなければ sponsored は付かない');
  ok(await page.isHidden('#ad-result'), '広告を有効にしていなければ枠は出ない');
  ok(!(await page.content()).includes('googlesyndication'), '広告の script を読まない');
  const share = await page.getAttribute('#share-x', 'href');
  ok(share.startsWith('https://x.com/intent/post?') && share.includes(encodeURIComponent('#神アニメ診断')), 'シェアのリンク');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok(!overflow, `${vp.name}: 横にはみ出さない`);

  if (SHOTS && vp.name === 'phone') {
    await page.screenshot({ path: join(root, 'store', 'shot-result.png') });
    await page.screenshot({ path: join(root, 'store', 'shot-result-full.png'), fullPage: true });
  }

  /* 見た → 差し替え */
  await page.click('#picks li:first-child button');
  const after = await page.$$eval('#picks h3', (hs) => hs.map((h) => h.textContent));
  ok(after[0] !== titles[0] && after[1] === titles[1], '見た で 1 作目だけ替わる');
  ok(!after.slice(1).includes(after[0]), '差し替えた作品が重ならない');

  await page.click('#retry');
  ok((await page.textContent('#count')).trim() === '1 / 18', 'もう一度');
  ok(errors.length === 0, `${vp.name}: エラー ${errors.join(' | ')}`);
  await page.close();
}

await browser.close();
server.close();
console.log(bad ? '\n合わないところがあります' : '\n画面の流れはすべて狙いどおり。');
process.exit(bad);
