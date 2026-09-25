/* 本物のブラウザで、はじめから結果まで押して確かめる。
       npm run build && node tools/e2e.mjs [--shots]
   本番と同じく /app/shindananime/ の下に置いて開く（相対指定の漏れを捕まえる）。
   --shots を付けると store/ に画面写真を残す（紹介ページ用） */
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve, BASE } from './serve.mjs';
import { questions } from '../src/questions.js';

const TOTAL = questions.length;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv.includes('--shots');

let pw;
try { pw = await import('playwright'); } catch {
  pw = await import(pathToFileURL(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')).href);
}

const server = await serve(0);
const url = `http://127.0.0.1:${server.address().port}${BASE}`;
const browser = await pw.chromium.launch();
let bad = 0;
const ok = (c, m) => { if (!c) { console.error('× ' + m); bad = 1; } };
const shot = async (page, name, full = false) => {
  if (SHOTS) {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(450);
    await page.screenshot({ path: join(root, 'store', `shot-${name}.png`), fullPage: full });
  }
};

for (const vp of [{ width: 390, height: 844, name: 'phone' }, { width: 1280, height: 900, name: 'desktop' }]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => {
    /* 作品の画像は他所のサイト（公式サイト・Filmarks）から読む。落ちていたり弾かれたりは
       こちらの不具合ではないので、画像の読み込み失敗はエラー扱いにしない */
    if (r.resourceType() !== 'image') errors.push('failed ' + r.url());
  });
  const phone = vp.name === 'phone';

  await page.goto(url);
  await page.waitForSelector('#start:not([disabled])');
  ok((await page.textContent('#start')).includes('全アニメDBから1分で導く【運命の1作】ガチ診断'), 'トップのボタン');
  ok(/収録 [\d,]+ 作品/.test(await page.textContent('#db-count')), '収録数');
  if (phone) await shot(page, 'intro');
  await page.click('#start');

  /* 深淵を覗く考察コレクター（RDCP-VM）に寄せて答える。途中で一度戻る */
  /* 最後の 2 問（画質・年代）は「新しめがいい」。そのあとは好みの要素（30問）が続く。
     グロとお色気は苦手、恋愛は好き、あとは「どちらともいえない」 */
  const core = [1, 1, 0.5, 1, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1, 0.5, 1, 1, 1, 0, 1, 1];
  const prefExtra = { 20: 1, 25: -1, 26: -1 };
  const pattern = core.concat(Array.from({ length: TOTAL - core.length }, (_, i) => prefExtra[core.length + i] ?? 0));
  for (let i = 0; i < pattern.length; i++) {
    ok((await page.textContent('#count')).trim() === `${i + 1}/${TOTAL}`, `${i + 1}/${TOTAL} の数え方`);
    if (phone && i === 3) await shot(page, 'quiz');
    if (i === 5) {
      await page.click('#back');
      ok((await page.textContent('#count')).trim() === `5/${TOTAL}`, '戻る');
      await page.click(`#qbox .choice[data-v="${pattern[4]}"]`);
    }
    await page.click(`#qbox .choice[data-v="${pattern[i]}"]`);
  }

  const t0 = Date.now();
  await page.waitForSelector('#loading:not([hidden])');
  ok(await page.isVisible('#ad-loading'), '解析中の広告枠（ダミー）が出る');
  ok((await page.textContent('#ad-loading')).includes('スポンサーリンク'), '「スポンサーリンク」表記');
  await page.waitForFunction(() => document.querySelectorAll('#loading-log li').length >= 3);
  const logText = async () => page.textContent('#loading-log');
  if (phone) await shot(page, 'loading');
  await page.waitForFunction(() => document.querySelectorAll('#loading-log li').length >= 4);
  const lt = await logText();
  ok(lt.includes(`${TOTAL}の嗜好パラメータを照合中`), 'ログの問題数');
  ok(/苦手な『グロ』『お色気』を含む[\d,]+件を後ろに回しています/.test(lt), '苦手な要素のログ: ' + lt);
  await page.waitForSelector('#result:not([hidden])', { timeout: 9000 });
  const took = Date.now() - t0;
  ok(took >= 3800 && took < 6500, `解析中はおよそ 4 秒（${took} ms）`);
  await page.waitForTimeout(1100);

  const code = (await page.textContent('#type-code')).trim();
  const name = (await page.textContent('#type-name')).trim();
  ok(code === 'RDCP-VM', 'タイプ: ' + code);
  ok(name === '【深淵を覗く考察コレクター型】', '二つ名: ' + name);
  ok(await page.isVisible('#ad-top'), '結果の一番上に広告枠');
  const sum = await page.textContent('#pref-summary');
  ok(sum.includes('好き: 恋愛') && sum.includes('苦手: グロ・お色気'), '好き・苦手のまとめ: ' + sum);
  ok((await page.getAttribute('#year-chips [data-year="2010"]', 'aria-pressed')) === 'true', '新しめを選ぶと、はじめから 2010 年以降に絞る');
  const fate = await page.textContent('#fate h3');
  const runners = await page.$$eval('#runners h3', (hs) => hs.map((h) => h.textContent));
  const pct = await page.textContent('#fate article');
  ok(runners.length === 2, '次点は 2 作');
  ok(/\d+%適合/.test(pct), '適合度');
  console.log(`${vp.name}: ${code} ${name} → 運命の1作「${fate}」 次点「${runners.join('」「')}」`);

  /* 新しめを選んだので、はじめから 2010 年以降に絞られている。外すと選び直す */
  const years = async () => page.$$eval('#fate article, #runners article', (as) =>
    as.map((a) => Number((a.textContent.match(/(\d{4})年・/) || [])[1] || 0)));
  ok((await years()).every((y) => !y || y >= 2010), '出ている作品は 2010 年以降: ' + (await years()).join(','));
  await page.click('#year-chips [data-year="2018"]');
  ok((await years()).every((y) => !y || y >= 2018), '2018 年以降に切り替えられる: ' + (await years()).join(','));
  await page.click('#year-chips [data-year="0"]');
  ok((await page.getAttribute('#year-chips [data-year="0"]', 'aria-pressed')) === 'true', 'こだわらないに戻せる');
  await page.click('#year-chips [data-year="2010"]');
  ok((await page.textContent('#fate h3')) === fate, '2010 年以降に戻すと、同じ運命の1作');

  /* 配信ボタンは、その作品が実際にあるサービスの数だけ出る（0〜12個。w.vod が分からなければ全部） */
  const vod = await page.$$eval('#fate a[data-vod]', (as) => as.map((a) => [a.textContent, a.rel, a.href]));
  ok(vod.length >= 1 && vod.length <= 12, `配信ボタンは1〜12個（いま ${vod.length}）`);
  ok(vod.every(([label]) => /➔$/.test(label)), 'ボタンの文言: ' + vod.map(([l]) => l).join(','));
  ok(vod.every(([, rel]) => !rel.includes('sponsored')), '提携リンクを入れていなければ sponsored は付かない');
  ok(!(await page.content()).includes('googlesyndication'), '広告を有効にしていなければ script を読まない');

  const share = new URL(await page.getAttribute('#share-x', 'href'));
  ok(share.origin === 'https://x.com', 'シェア先');
  ok(share.searchParams.get('text') === '私のアニメ診断タイプは【RDCP-VM：深淵を覗く考察コレクター型】でした！あなたにぴったりの神アニメは…？', 'シェア文面');
  ok(share.searchParams.get('hashtags') === 'アニメ診断,アニメ', 'ハッシュタグ');
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${vp.name}: 横にはみ出さない`);

  if (phone) {
    await shot(page, 'result');
    await page.evaluate(() => document.getElementById('fate').scrollIntoView());
    await shot(page, 'fate');
    await shot(page, 'result-full', true);
  }

  /* 見た → 差し替え。次点が繰り上がる（新しい別の作品に飛ばない） */
  await page.click('#fate button');
  const after = await page.textContent('#fate h3');
  ok(after !== fate, '見た で運命の1作が替わる');
  ok(after === runners[0], '見た → 次点1が運命の1作に繰り上がる: ' + after + ' ≠ ' + runners[0]);

  await page.click('#retry');
  ok((await page.textContent('#count')).trim() === `1/${TOTAL}`, 'もう一度');
  ok(errors.length === 0, `${vp.name}: エラー ${errors.join(' | ')}`);
  await page.close();
}

await browser.close();
server.close();
console.log(bad ? '\n合わないところがあります' : '\n画面の流れはすべて狙いどおり。');
process.exit(bad);
