#!/usr/bin/env node
/*
 * Compara píxel a píxel el dibujo con Canvas 2D y con el motor WebGL2 (core/gl2d.js) (fps-tecnologia, 14-11-2026).
 * SÓLO PARA DESARROLLO: no lo carga el juego.
 *
 * Juega con el motor WebGL2, semilla fija y RELOJ FALSO (desde que empieza la partida, cada fotograma lo manda esta
 * herramienta: rAF y performance.now/Date.now avanzan 1/60 s por fotograma; entre tandas espera de verdad a que carguen las
 * imágenes). En el fotograma que se compara, cada orden de dibujo va también a un Canvas 2D de verdad («espejo»,
 * G.GL2D.tee): lo mismo, en el mismo fotograma, pintado por los dos. Saca las dos capturas, la diferencia (en rojo lo que
 * cambia) y cuántos píxeles cambian.
 *
 *   node tools/gl-compara.cjs --pw <node_modules con playwright-core> [--calidad high,max] [--escenas tranquila,jefe,hordamax,arena]
 *                             [--out <carpeta>] [--nav chrome|webkit] [--tam 1536x864@1.25] [--umbral 24]
 * --umbral: diferencia por canal (0-255) a partir de la que un píxel cuenta como distinto (de serie 24).
 */
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const NAV = opt('nav', 'chrome');
const QUALS = opt('calidad', 'high').split(',');
const SCENES = opt('escenas', 'tranquila,jefe,hordamax,arena').split(',');
const OUT = path.resolve(opt('out', 'gl-compara-out'));
const ROOT = path.resolve(opt('raiz', path.join(__dirname, '..')));
const PW = opt('pw', process.env.PLAYWRIGHT_CORE);
const TAM = opt('tam', NAV === 'webkit' ? '852x393@3' : '1536x864@1.25');
const UMBRAL = +opt('umbral', 24);
const SEED = 4242;
const pw = require(PW ? path.resolve(/playwright-core$/.test(PW) ? PW : path.join(PW, 'playwright-core')) : 'playwright-core');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (e) { /* 404 */ }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Antes que el juego: azar con semilla y el reloj que se puede parar (__man). */
function instrument(seed) {
  let a = seed | 0;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const M = window.__man = { on: false, q: [], t: 0, d0: 0 };
  const raf0 = window.requestAnimationFrame.bind(window), pn = performance.now.bind(performance), dn = Date.now;
  window.requestAnimationFrame = cb => { if (M.on) { M.q.push(cb); return M.q.length; } return raf0(cb); };
  performance.now = () => (M.on ? M.t : pn());
  Date.now = () => (M.on ? M.d0 + M.t : dn());
  window.__manual = () => { M.t = pn(); M.d0 = dn() - M.t; M.on = true; };
  window.__step = n => { for (let i = 0; i < n; i++) { M.t += 1000 / 60; const q = M.q; M.q = []; for (const cb of q) cb(M.t); } };
}

const HELPERS = () => {
  window.sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__enter = async () => {
    const vis = el => el && !el.classList.contains('hidden');
    for (let i = 0; i < 160; i++) {
      if (window.G && G.DB && G.DB.save && G.DB.save.partner && document.querySelector('#scr-menu:not(.hidden)')) return true;
      const t = document.getElementById('tap-start');
      const g = [...document.querySelectorAll('button')].find(b => b.offsetParent && /invitado|guest/i.test(b.textContent));
      const q = document.querySelector('#scr-test:not(.hidden) .answer');
      const v = [...document.querySelectorAll('#scr-result button')].find(b => b.offsetParent);
      const k = vis(t) ? t : g || q || v;
      if (k) k.click();
      await sleep(k ? 600 : 250);
    }
    return false;
  };
  // Frames con espera de verdad entre tandas (cargas de imágenes): la partida sólo avanza con __step.
  window.__run = async (n, every = 10, wait = 30) => { for (let i = 0; i < n; i += every) { __step(Math.min(every, n - i)); await sleep(wait); } };
  window.__god = () => { const P = G.Game.player; if (!P) return; P.hp = P.maxHp; P.dead = false; P.xpNext = 1e12;
    if (document.querySelector('#scr-levelup:not(.hidden)')) { const c = document.querySelector('#scr-levelup .pick-card, #scr-levelup [data-i], #scr-levelup .card'); if (c) c.click(); } };
  window.__play = async (seed) => {
    __manual();                                      // (desde aquí, el reloj lo lleva la herramienta: la partida empieza igual)
    document.querySelector('#scr-menu [data-go="play"]').click();
    for (let i = 0; i < 100 && G.Game.state !== 'playing'; i++) await sleep(100);
    await sleep(1500);
    G.World.reset(seed);
    const P = G.Game.player;
    for (let r = 300; r < 4000; r += 150) { let ok = false; for (let a = 0; a < 6.28; a += 0.5) {
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
      if (G.World.isFree(x, y, 40)) { P.x = x; P.y = y; G.Camera.x = x; G.Camera.y = y; ok = true; break; } } if (ok) break; }
    G.EnemyMgr.clear(); G.Projectiles.clear();
    // (Inmortal en cada fotograma, dentro del reloj falso.)
    const pd = G.Pad.poll; G.Pad.poll = function () { __god(); return pd.apply(this, arguments); };
    await __run(120);
  };
  window.__heavy = () => {
    const P = G.Game.player, ids = ['bullet-seed', 'flamethrower', 'ice-shard', 'swift'];
    P.moves = []; P.slots = []; P.active = 0;
    for (const id of ids) { const m = G.Moves.instance(id, G.Moves.BY_ID[id].maxLvl || 8); if (P.pass) G.Moves.applyPassives(m, P.pass); G.Moves.evolve(m); m.since = G.Game.st.time; P.moves.push(m); P.slots.push([m]); }
    P.bonds = 3; P.fuse(P.moves.slice(0), P.slots[0]); P.active = 0;
  };
  window.__scene = async (k) => {
    if (k === 'tranquila') { await __run(150); return; }
    if (k === 'jefe') { const B = G.Enemies.BOSSES, b = B[Math.min(4, B.length - 1)]; G.Game.debugTime(b.at + 1); G.Spawner.debugBossesFrom(b.at + 2);
      G.Spawner.debugMake(b, b.at, G.Game.everyone(), true); await __run(180); return; }
    if (k === 'hordamax') { G.Game.debugTime(19 * 60); G.Spawner.debugBossesFrom(30 * 60); __heavy();
      for (const w of ['surge', 'ring', 'swarm', 'stampede', 'surge', 'ring']) { G.Spawner.debugWave(w); await __run(20); } await __run(150); return; }
    if (k === 'arena') { G.Rift.debugArena('fire', 2); for (let i = 0; i < 40 && !G.Rift.inArena; i++) await __run(15); await __run(180); return; }
  };
};

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const [W, H, DPR] = TAM.match(/^(\d+)x(\d+)@([\d.]+)$/).slice(1).map(Number);
  const rows = [];
  for (const Q of QUALS) {
    let browser, ctx;
    if (NAV === 'webkit') { browser = await pw.webkit.launch({ headless: true }); const dev = pw.devices['iPhone 15 landscape'] || pw.devices['iPhone 13 landscape'];
      ctx = await browser.newContext(Object.assign({}, dev, { viewport: { width: W, height: H }, deviceScaleFactor: DPR })); }
    else { browser = await pw.chromium.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
      ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }); }
    for (const S of SCENES) {
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push('[err] ' + e.message));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|firebase|ERR_|Failed to load|identitytoolkit|googleapis|404/.test(m.text())) errs.push('[c] ' + m.text().slice(0, 300)); });
      await p.addInitScript(instrument, SEED);
      await p.addInitScript(q => { try { const s = JSON.parse(localStorage.getItem('ps.settings') || '{}'); s.quality = q; s.fps = false; localStorage.setItem('ps.settings', JSON.stringify(s)); } catch (e) { /* */ } }, Q);
      await p.goto(`http://127.0.0.1:${port}/dev.html?dev&gl=1`, { waitUntil: 'load' });
      await p.evaluate(HELPERS);
      await p.evaluate(() => __enter());
      await p.waitForFunction(() => window.G && G.Village && G.Village.mode !== 'loading', null, { timeout: 60000 }).catch(() => { });
      await sleep(1500);
      let r = null;
      try {
        await p.evaluate(s => __play(s), SEED);
        await p.evaluate(s => __scene(s), S);
        await sleep(600);
        // Espejo puesto: dos fotogramas (el primero rellena los espejos de las capas), y se leen los dos en la misma tarea.
        r = await p.evaluate(async (th) => {
          if (!G.GL2D.on) return { error: 'WebGL2 no arrancó' };
          G.GL2D.tee(true); __step(2);
          const cv = document.getElementById('game'), W = cv.width, H = cv.height;
          const gld = cv.getContext('2d').getImageData(0, 0, W, H);
          const mir = G.GL2D.mirror(), m2 = mir.getContext('2d').getImageData(0, 0, W, H);
          G.GL2D.tee(false);
          const toPng = d => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(d, 0, 0); return c.toDataURL('image/png').split(',')[1]; };
          const da = m2.data, db = gld.data, out = new ImageData(W, H), o = out.data;
          let diff = 0, sum = 0, max = 0;
          for (let i = 0; i < da.length; i += 4) {
            // (Lo transparente del lienzo, sobre negro, como se ve en la página.)
            const ka = da[i + 3] / 255, kb = db[i + 3] / 255;
            const d = Math.max(Math.abs(da[i] * ka - db[i] * kb), Math.abs(da[i + 1] * ka - db[i + 1] * kb), Math.abs(da[i + 2] * ka - db[i + 2] * kb));
            sum += d; if (d > max) max = d;
            const g = (da[i] + da[i + 1] + da[i + 2]) * ka / 9;
            if (d > th) { diff++; o[i] = 255; o[i + 1] = 0; o[i + 2] = 0; } else { o[i] = o[i + 1] = o[i + 2] = g; }
            o[i + 3] = 255;
          }
          return { W, H, pct: +(100 * diff / (W * H)).toFixed(3), media: +(sum / (W * H)).toFixed(2), max: max | 0, a: toPng(m2), b: toPng(gld), dif: toPng(out), st: G.GL2D.stats() };
        }, UMBRAL);
      } catch (e) { errs.push('[herramienta] ' + e.message); }
      if (r && !r.error) {
        const base = `${NAV}-${Q}-${S}`;
        fs.writeFileSync(path.join(OUT, base + '-canvas2d.png'), Buffer.from(r.a, 'base64'));
        fs.writeFileSync(path.join(OUT, base + '-webgl2.png'), Buffer.from(r.b, 'base64'));
        fs.writeFileSync(path.join(OUT, base + '-dif.png'), Buffer.from(r.dif, 'base64'));
        rows.push([Q, S, r.pct + ' %', r.media, r.max, base + '-dif.png']);
      }
      console.log(`${Q} ${S}: ${r ? (r.error || r.pct + ' % distintos, media ' + r.media + ', máx ' + r.max) : 'sin resultado'}${errs.length ? ' | ' + errs.slice(0, 3).join(' | ') : ''}`);
      await p.close();
    }
    await browser.close();
  }
  console.log(`\n| calidad | escena | píxeles distintos (>${UMBRAL}) | diferencia media (0-255) | máxima | imagen |`);
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
  fs.writeFileSync(path.join(OUT, 'resumen.json'), JSON.stringify({ umbral: UMBRAL, rows }, null, 1));
  srv.close();
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
