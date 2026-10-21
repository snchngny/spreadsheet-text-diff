// 一時的なブラウザ受入・性能試験用。アプリの起動には不要
import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const baselineRef = process.argv[2] || '2067c3b';
const baseline = execFileSync('git', ['show', `${baselineRef}:index.html`], { cwd: fileURLToPath(root), encoding: 'utf8' });
const results = new URL('.local/performance.jsonl', root);
fs.mkdirSync(new URL('.local/', root), { recursive: true });
const controls = `<style>#bench{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#172430;color:white;padding:8px;font:12px monospace}#bench button{padding:6px;margin:3px}#bench-output{margin:0;max-height:90px;overflow:auto;white-space:pre-wrap}</style>
<div id="bench"><button data-rows="2000">Run 2000x20</button><button data-rows="10000">Run 10000x20</button><button data-rows="100000">Run 100000x20</button><button id="regression">Regression</button><button id="scroll-regression">Scroll</button><pre id="bench-output">Ready</pre></div><script src="/fixture.js"></script><script src="/scroll-fixture.js"></script>`;
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && req.url === '/result') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try { fs.appendFileSync(results, JSON.stringify(JSON.parse(body)) + '\n'); res.end('ok'); }
      catch { res.writeHead(400); res.end(); }
    });
    return;
  }
  if (req.url === '/fixture.js' || req.url === '/scroll-fixture.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.end(fs.readFileSync(new URL(req.url === '/fixture.js' ? 'browser-fixture.js' : 'scroll-fixture.js', import.meta.url)));
    return;
  }
  if (req.url === '/' || req.url === '/current' || req.url === '/baseline') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const html = req.url === '/baseline' ? baseline : fs.readFileSync(new URL('index.html', root), 'utf8');
    res.end(req.url === '/' ? html : html.replace('</body>', controls + '</body>'));
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(8769, '127.0.0.1', () => console.log('受入・性能試験: http://127.0.0.1:8769/current （比較元: /baseline、通常画面: /、20分で終了）'));
setTimeout(() => server.close(), 20 * 60 * 1000).unref();
