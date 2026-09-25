/* 手元で開く。本番と同じく /app/shindananime/ の下に dist/ を置く。
       npm run serve   →  http://localhost:4600/app/shindananime/
   e2e.mjs からも使う */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
export const BASE = '/app/shindananime/';

export function serve(port = 0, dir = dist) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/' || path === BASE.slice(0, -1)) { res.writeHead(302, { Location: BASE }); return res.end(); }
    if (!path.startsWith(BASE)) { res.writeHead(404); return res.end('not here'); }
    const file = join(dir, path.slice(BASE.length) || 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4600);
  await serve(port);
  console.log(`http://localhost:${port}${BASE}`);
}
