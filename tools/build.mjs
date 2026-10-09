/* 配る形を dist/ に組む。
       npm run build
   src/ をそのまま写し、Tailwind の CSS を書き出し、all_anime_db.json を添える。
   出す:  npx wrangler pages deploy dist --project-name shindananime --branch main */
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = join(root, 'dist');

if (!existsSync(join(root, 'all_anime_db.json'))) {
  console.error('all_anime_db.json が無い。先に python3 build_anime_db.py');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync(src, out, { recursive: true, filter: (p) => !p.endsWith('styles.css') });
cpSync(join(root, 'all_anime_db.json'), join(out, 'all_anime_db.json'));

execFileSync(join(root, 'node_modules/.bin/tailwindcss'),
  ['-i', join(src, 'styles.css'), '-o', join(out, 'styles.css'), '--minify'],
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });

/* 中身の印を付けて、古い CSS / JS が残らないようにする */
const mark = (f) => createHash('sha1').update(readFileSync(join(out, f))).digest('hex').slice(0, 8);
const html = join(out, 'index.html');
writeFileSync(html, readFileSync(html, 'utf8')
  .replace('./styles.css"', `./styles.css?v=${mark('styles.css')}"`)
  .replace('./app.js"', `./app.js?v=${mark('app.js')}"`));

/* 英語版（/en/）。ページは 1 つ深いので、CSS と JS は ../ から読む。印も同じように付ける */
const enHtml = join(out, 'en/index.html');
if (existsSync(enHtml)) {
  writeFileSync(enHtml, readFileSync(enHtml, 'utf8')
    .replace('../styles.css"', `../styles.css?v=${mark('styles.css')}"`)
    .replace('../app.js"', `../app.js?v=${mark('app.js')}"`));
}
/* 英語題名（AniList）。tools/make_en_titles.py が data/en_titles.json に作る */
const enTitles = join(root, 'data', 'en_titles.json');
if (existsSync(enTitles)) cpSync(enTitles, join(out, 'en-titles.json'));

const data = JSON.parse(readFileSync(join(out, 'all_anime_db.json'), 'utf8'));
console.log(`dist/: ${data.works.length} 作（${data.meta.source}）`);
