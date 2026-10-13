// Deterministic zero-dependency static file server for the browser smoke tests.
// Serves the repo root over http://localhost:PORT. No external deps, no network,
// no production server dependency — just Node's built-in http/fs so Playwright's
// `webServer` can bring the real static site up in CI and tear it down after.
//
// It must serve .js / .mjs with a JavaScript MIME, or the browser refuses the
// ES-module graph (index.html → app.js → filter-core.mjs) under strict MIME checks.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // repo root (test/browser → ../../)
const ROOT_REAL = realpathSync(ROOT).replace(/[\\/]$/, '') + sep; // real root, trailing sep for prefix test
const PORT = Number(process.env.PORT || 8188);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.mp4': 'video/mp4',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    // Resolve inside ROOT only (reject path traversal).
    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(normalize(ROOT))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + pathname);
      return;
    }
    // realpath containment: a symlink inside the tree must not escape ROOT (the lexical
    // prefix check above does not follow links).
    if (!(realpathSync(filePath) + sep).startsWith(ROOT_REAL)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`static-server: serving ${ROOT} at http://localhost:${PORT}`);
});
