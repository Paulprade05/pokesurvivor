// node tools/pop3d.cjs [--pp <node_modules con puppeteer-core>] [--chrome <exe>] [--q high|ultra|max] [--w 1920 --h 1080 --dpr 1] [--s 20]
//
// (14-11-2026, el dueño: «los muros y elementos 3D de la partida hay ciertos momentos que desaparecen de la cámara, se dejan de
// cargar y hacen popup») Detector de saltos del 3D de la partida (world/ultra3d.js, debugPop). Juega como invitado en Chrome con
// GPU, se va a un sitio con paredes, saca oleadas y anda en línea recta cambiando de rumbo (cruza trozos de mapa) durante --s
// segundos. Fotograma a fotograma cuenta:
//   out   objetos 3D que estaban bien dentro de la pantalla y dejan de dibujarse (sin haberse roto)
//   in    objetos 3D que aparecen ya dentro de la pantalla
//   miss  filas de pared que deberían verse (del terreno) y no se dibujan (con Ultra)
//   clip  lotes que caen fuera del lienzo 3D;  merged  lotes juntados por llenarse el atlas (se dibujan en otro orden)
// Sale con código 1 si alguno no es 0. Sin servidor: sirve la carpeta del juego él mismo.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const ROOT = path.resolve(__dirname, '..');
const ppDir = opt('pp', process.env.PUPPETEER_CORE || '');
const puppeteer = require(ppDir ? path.join(path.resolve(ppDir), /puppeteer-core$/.test(ppDir) ? '' : 'puppeteer-core') : 'puppeteer-core');
const CHROME = opt('chrome', process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const Q = opt('q', 'high'), W = +opt('w', 1920), Hh = +opt('h', 1080), DPR = +opt('dpr', 1), SECS = +opt('s', 20);
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const srv = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (e) { /* nada */ }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: W, height: Hh, deviceScaleFactor: DPR });
  await p.goto(`http://127.0.0.1:${srv.address().port}/dev.html?dev`, { waitUntil: 'load' });
  const res = await p.evaluate(async (Q, SECS) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 60 && !document.querySelector('#scr-login:not(.hidden), #scr-menu:not(.hidden)'); i++) await sleep(250);
    const g = [...document.querySelectorAll('button')].find(b => b.offsetParent && /invitado|guest/i.test(b.textContent));
    if (g) { g.click(); await sleep(1200); }
    for (let i = 0; i < 12; i++) { const b = document.querySelector('#scr-test:not(.hidden) .answer'); if (!b) break; b.click(); await sleep(400); }
    await sleep(400);
    const v = [...document.querySelectorAll('#scr-result button')].find(b => b.offsetParent); if (v) { v.click(); await sleep(1200); }
    for (let i = 0; i < 80 && !(G.Village && G.Village.mode !== 'loading'); i++) await sleep(250);
    G.Settings.set('quality', Q);
    document.querySelector('#scr-menu [data-go="play"]').click(); await sleep(3500);
    G.World.reset(4242); await sleep(800);
    const P = G.Game.player; let best = null, bs = -1;
    for (let r = 300; r < 5000; r += 150) for (let a = 0; a < 6.28; a += 0.2) {
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r); if (!G.World.isFree(x, y, 14)) continue;
      let w = 0; for (let i = -14; i <= 14; i++) for (let j = -8; j <= 8; j++) if (G.World.isWall(x + i * 48, y + j * 48)) w++;
      if (w > bs) { bs = w; best = [x, y]; }
    }
    P.x = best[0]; P.y = best[1]; G.Camera.x = P.x; G.Camera.y = P.y;
    const keep = setInterval(() => { P.hp = P.maxHp; P.invuln = 1; const c = document.querySelector('#scr-levelup:not(.hidden) .pick-card'); if (c) c.click(); }, 100);
    await sleep(2000);
    for (const k of ['surge', 'ring', 'swarm']) { G.Spawner.debugWave(k); await sleep(400); }
    const s0 = G.Ultra3D.stats();
    G.Ultra3D.debugPop(true);
    let ang = 0, tt = 0;
    const mv = setInterval(() => { tt++; if (tt % 240 === 0) ang += 1.9; P.x += Math.cos(ang) * 4; P.y += Math.sin(ang) * 4; }, 16);
    await sleep(SECS * 1000);
    clearInterval(mv); clearInterval(keep);
    const d = G.Ultra3D.debugPop(), s1 = G.Ultra3D.stats();
    G.Ultra3D.debugPop(false);
    return { on: G.Ultra3D.on(), out: d.out, in: d.in, miss: d.miss, clip: s1.clip - s0.clip, merged: s1.merged - s0.merged, ev: d.ev.slice(0, 10), size: s1.size };
  }, Q, SECS);
  await b.close(); srv.close();
  res.errs = errs.slice(0, 5);
  console.log(JSON.stringify(res));
  const bad = !res.on || res.out || res.in || res.miss || res.clip || res.merged || errs.length;
  console.log(bad ? 'SALTOS: revisar (ver ev)' : 'sin saltos');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
