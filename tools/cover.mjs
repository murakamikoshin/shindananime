/* 表紙（800×800）を store/cover.html から撮る。
       node tools/cover.mjs
   koshin-studio の tools/images.py がこれを拾って配る形にする */
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pw;
try { pw = await import('playwright'); } catch {
  pw = await import(pathToFileURL(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')).href);
}
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
await page.goto(pathToFileURL(join(root, 'store', 'cover.html')).href);
await page.screenshot({ path: join(root, 'store', 'cover-square-800x800.png') });
await browser.close();
console.log('store/cover-square-800x800.png');
