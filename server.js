#!/usr/bin/env node
// server.js
// Запуск: node server.js -b papyrus
//         node server.js -b my-repo-name -p 8080

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ---------- парсинг аргументов ----------
function parseArgs(argv) {
  const args = { b: 'papyrus', p: '3000', r: '.' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-b' || a === '--base') args.b = argv[++i] ?? args.b;
    else if (a === '-p' || a === '--port') args.p = argv[++i] ?? args.p;
    else if (a === '-r' || a === '--root') args.r = argv[++i] ?? args.r;
  }
  let base = args.b.trim();
  if (!base.startsWith('/')) base = '/' + base;
  if (base.endsWith('/')) base = base.slice(0, -1);
  return { base, port: parseInt(args.p, 10) || 3000, root: path.resolve(args.r) };
}

const { base, port, root } = parseArgs(process.argv);

// ---------- MIME-типы ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico':  'image/x-icon',
  '.bmp':  'image/bmp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.eot':  'application/vnd.ms-fontobject',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.pdf':  'application/pdf',
  '.wasm': 'application/wasm',
  '.zip':  'application/zip',
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body) res.end(body);
  else res.end();
}

function notFound(res, message = 'Not Found') {
  send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, message);
}

// ---------- live reload ----------
const sseClients = new Set();

const LIVE_RELOAD_SNIPPET = `
<script>
(function () {
  try {
    var es = new EventSource('${base}/__livereload');
    es.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
  } catch (e) {}
})();
</script>
`;

let reloadTimer = null;
function broadcastReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const res of sseClients) {
      try { res.write('data: reload\n\n'); } catch {}
    }
    if (sseClients.size) console.log('[livereload] reload broadcast');
  }, 100);
}

try {
  fs.watch(root, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const f = filename.toString();
    if (f.startsWith('.git') || f.includes('node_modules')) return;
    broadcastReload();
  });
  console.log('[livereload] watching', root);
} catch (e) {
  console.warn('[livereload] fs.watch recursive не поддерживается:', e.message);
}

// ---------- обработка запроса ----------
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch {
    return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request');
  }

  // --- SSE endpoint (до проверки base) ---
  if (pathname === base + '/__livereload' || pathname === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 1000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // проверяем префикс base
  let fsPath;
  if (pathname === base || pathname.startsWith(base + '/')) {
    let rel = pathname.slice(base.length);
    if (rel === '' || rel === '/') rel = '/index.html';
    fsPath = path.join(root, rel);
  } else if (pathname === '/') {
    return send(res, 302, { 'Location': base + '/' }, null);
  } else {
    return notFound(res, 'Not found (outside of base path)');
  }

  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (fsPath !== root && !fsPath.startsWith(rootWithSep)) {
    return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
  }

  fs.stat(fsPath, (err, stat) => {
    if (err) return notFound(res);

    if (stat.isDirectory()) {
      const indexPath = path.join(fsPath, 'index.html');
      return fs.stat(indexPath, (err2, stat2) => {
        if (err2 || !stat2.isFile()) return notFound(res);
        serveFile(req, res, indexPath, stat2);
      });
    }

    serveFile(req, res, fsPath, stat);
  });
});

function serveFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  // HTML — читаем в память, вставляем live-reload сниппет
  if (ext === '.html' || ext === '.htm') {
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) return notFound(res);
      if (html.includes('</body>')) {
        html = html.replace('</body>', LIVE_RELOAD_SNIPPET + '</body>');
      } else {
        html += LIVE_RELOAD_SNIPPET;
      }
      const buf = Buffer.from(html, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(buf);
    });
    return;
  }

  const headers = {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  };

  const range = req.headers.range;
  if (range && /^bytes=/.test(range) && stat.size > 0) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parts[0] ? parseInt(parts[0], 10) : 0;
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    if (isNaN(start) || isNaN(end) || start > end || end >= stat.size) {
      return send(res, 416, { 'Content-Range': `bytes */${stat.size}` }, null);
    }

    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    headers['Accept-Ranges'] = 'bytes';
    headers['Content-Length'] = end - start + 1;

    res.writeHead(206, headers);
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

server.listen(port, () => {
  console.log(`Сервер запущен: http://localhost:${port}${base}/`);
  console.log(`  base-path : "${base}"`);
  console.log(`  root dir  : ${root}`);
  console.log(`  поменять  : node server.js -b <base> -p <port> -r <dir>`);
});