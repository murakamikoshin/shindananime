/* 英語版（/app/shindananime/en/）を、はじめから結果まで押して確かめる。
       node tools/build.mjs && node tools/e2e_en.mjs
   画面に日本語が残っていないか（作品名の元題名を除く）、エラーが出ていないかを見る。 */
import { serve, BASE } from './serve.mjs';
import { chromium } from '/Users/murakami/Desktop/koshinstudio/koshin-studio/tools/node_modules/playwright-core/index.mjs';

const server = await serve(0);
const url = `http://127.0.0.1:${server.address().port}${BASE}en/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let bad = 0;
const ok = (c, m) => { if (!c) { console.error('× ' + m); bad = 1; } else console.log('  ok ' + m); };
const JP = /[぀-ヿ一-鿿]/;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
ok(await page.evaluate(() => document.documentElement.lang) === 'en', 'html lang=en');
await page.waitForFunction(() => !document.getElementById('start').disabled);
ok(!JP.test(await page.locator('#intro').innerText()), 'intro has no Japanese: ' + (await page.locator('#start').innerText()));
await page.click('#start');
const qs = [];
for (let i = 0; i < 12; i++) {
  qs.push(await page.locator('#quiz').innerText());
  await page.click(`#qbox .choice[data-v="${i % 2 ? '-1' : '1'}"]`);
}
ok(qs.every((t) => !JP.test(t)), 'first 12 questions are English');
await page.waitForSelector('#checkpoint:not([hidden])');
ok(!JP.test(await page.locator('#checkpoint').innerText()), 'checkpoint screen is English');
await page.click('#more');
for (let i = 12; i < 50; i++) {
  const t = await page.locator('#quiz').innerText();
  if (JP.test(t)) { ok(false, 'question ' + (i + 1) + ' has Japanese: ' + t.slice(0, 80)); break; }
  await page.click(`#qbox .choice[data-v="${i % 3 ? '1' : '-0.5'}"]`);
}
await page.waitForSelector('#result:not([hidden])', { timeout: 20000 });
const res = await page.locator('#result').innerText();
const lines = res.split('\n').filter((l) => JP.test(l));
console.log('--- lines with Japanese in result (work titles allowed):'); lines.forEach((l) => console.log('   ' + l.slice(0, 100)));
ok(lines.length <= 3, 'result screen has no Japanese except fallback work titles');
console.log(res.split('\n').slice(0, 25).join(' | ').slice(0, 700));
ok(await page.locator('a[data-vod="justwatch"]').count() >= 1, 'JustWatch button present');
ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
await page.screenshot({ path: '/tmp/en-result.png', fullPage: true });
await browser.close(); server.close();
process.exit(bad);
