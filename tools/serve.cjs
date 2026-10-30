// Servidor estático mínimo para probar el juego en local (sin dependencias).
// Uso: node tools/serve.cjs [carpeta=.] [puerto=8765]
//   Después: http://localhost:8765/dev.html?dev  (dev.html carga cada script por separado;
//   index.html es la versión compilada). Firebase acepta localhost y 127.0.0.1.
// Arnés de pruebas: con ?raf=1 en un .html se inyecta un sustituto de requestAnimationFrame
// con temporizadores (con el panel del navegador oculto, rAF no corre). Sólo aquí, nunca en el juego.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2] || '.');
const port = +(process.argv[3] || 8765);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain',
};
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__raf.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);\nwindow.cancelAnimationFrame = id => clearTimeout(id);\n');
  }
  if (u.searchParams.get('raf') === '1' && /\.html$|\/$/.test(u.pathname)) {
    const f0 = path.join(root, u.pathname.endsWith('/') ? u.pathname + 'index.html' : decodeURIComponent(u.pathname));
    if (f0.startsWith(root) && fs.existsSync(f0)) {
      const html = fs.readFileSync(f0, 'utf8').replace(/<head>/i, '<head>\n<script src="/__raf.js"></script>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
  }
  let f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (err, st) => {
    if (!err && st.isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, data) => {
      if (e) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
}).listen(port, () => console.log('Sirviendo ' + root + ' en http://localhost:' + port + '/dev.html?dev'));
