#!/usr/bin/env node
/*
 * Perfilado de rendimiento de PokéSurvivor (13-11-2026). SÓLO PARA DESARROLLO: no lo carga el juego.
 *
 * Juega solo unos escenarios fijos (semilla fija, como invitado, todo en local) y mide cada fotograma:
 *   aldea      el menú con la aldea 3D
 *   tranquila  partida al principio, sin oleadas
 *   jefe       un jefe del calendario delante
 *   horda      minuto 14 con 4 ataques evolucionados y fusionados (muchos proyectiles) y oleadas seguidas
 *   grieta     entrar en una grieta: el viaje y la llegada (aquí se miran los tirones)
 *   arena      la arena de los legendarios, ya dentro
 *
 * Medidas por escenario: FPS (sin tope de 60 en Chrome: lo que da de sí), ms de CPU por fotograma (media, p95, p99),
 * tirones (huecos de más de 50 ms entre fotogramas), memoria y basura (Chrome: lo que crece el montón por segundo y las
 * veces que se recoge), llamadas de dibujo del lienzo y de WebGL, textos medidos, cambios de filtro/sombra, lienzos creados
 * y cambios del DOM por fotograma.
 *
 * Uso:
 *   node tools/perf.cjs [--nav chrome|webkit] [--calidad auto,high,max] [--escenas aldea,tranquila,...] [--seg 5]
 *                       [--out <carpeta>] [--pw <node_modules con playwright-core>] [--chrome <exe>] [--perfil]
 *                       [--sin-contar] [--repes 1] [--raiz <carpeta del juego>] [--tam 1536x864@1.25]
 *   --nav chrome   Chrome del sistema con GPU, a 60 Hz como una pantalla normal. Por defecto.
 *   --sin-tope     Chrome sin vsync ni tope de FPS: lo que da de sí (OJO: la cola de la GPU crece y las lecturas del lienzo
 *                  esperan mucho más que de verdad).
 *   --nav webkit   WebKit de Playwright con el perfil de iPhone 15 en horizontal (no es Safari de verdad).
 *   --perfil       guarda un perfil de CPU (.cpuprofile, se abre en DevTools) por escenario y dice las funciones que más
 *                  tiempo propio gastan (sólo Chrome).
 *   --sin-contar   sin contar llamadas (los contadores cuestan un poco de tiempo por llamada).
 *   --pw           playwright-core (npm i --prefix <tmp>/pw playwright-core@1.64). También PLAYWRIGHT_CORE=<ruta>.
 *                  WebKit: el navegador de Playwright (npx playwright install webkit).
 * Escribe <out>/<nav>-<calidad>.json y una tabla en consola. Comparar dos carpetas:
 *   node tools/perf.cjs --comparar <antes> <despues>
 */
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = k => { const i = argv.indexOf('--' + k); if (i < 0) return false; argv.splice(i, 1); return true; };

// ---------------- comparar dos medidas ----------------
if (flag('comparar')) {
  const [a, b] = argv.map(p => path.resolve(p));
  const rows = [];
  for (const f of fs.readdirSync(b).filter(f => f.endsWith('.json'))) {
    if (!fs.existsSync(path.join(a, f))) continue;
    const A = JSON.parse(fs.readFileSync(path.join(a, f), 'utf8')), B = JSON.parse(fs.readFileSync(path.join(b, f), 'utf8'));
    for (const k of Object.keys(B.escenas)) {
      const x = A.escenas[k], y = B.escenas[k];
      if (!x || !y || x.error || y.error) continue;
      rows.push([f.replace('.json', ''), k, x.fps + ' → ' + y.fps, x.ms + ' → ' + y.ms, x.p95 + ' → ' + y.p95, x.p99 + ' → ' + y.p99,
                 x.tirones + ' → ' + y.tirones, (x.maxGap | 0) + ' → ' + (y.maxGap | 0), (x.mbs != null ? x.mbs + ' → ' + y.mbs : '-')]);
    }
  }
  console.log('| prueba | escena | FPS | ms CPU | p95 | p99 | tirones >50 ms | peor hueco ms | basura MB/s |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
  process.exit(0);
}

const NAV = opt('nav', 'chrome');
const QUALS = opt('calidad', 'auto,high,max').split(',');
const SCENES = opt('escenas', 'aldea,tranquila,jefe,horda,grieta,arena').split(',');
const SECS = +opt('seg', 5);
const REPS = +opt('repes', 1);
const OUT = path.resolve(opt('out', 'perf-out'));
const ROOT = path.resolve(opt('raiz', path.join(__dirname, '..')));
const PW = opt('pw', process.env.PLAYWRIGHT_CORE);
const CHROME_ARG = opt('chrome', process.env.CHROME);
const PROFILE = flag('perfil');
const COUNT = !flag('sin-contar');
const HZ = +opt('hz', 0);                 // (fps-tecnologia) pantalla de N Hz: sin vsync y el tope del juego a N
const UNCAP = flag('sin-tope') || HZ > 0;
const SPLIT = flag('desglose');           // ms propios de cada parte (simulación, dibujo...) por fotograma
const TRACE = flag('traza');
const GLON = flag('gl');                  // (fps-tecnologia) con el motor WebGL2 (core/gl2d.js, ?gl=1); sin él, ?gl=0
// Para saber qué cuesta cada capa: --quitar World.drawGround,HUD.draw,Ultra3D.flat=false (esa función deja de hacer nada y
// devuelve lo que pongas tras el =). Sólo para medir: lo que se ve cambia.
const DROP = (opt('quitar', '') || '').split(',').filter(Boolean);              // Chrome: tiempo ocupado de cada hilo (página, GPU, compositor)
const TAM = opt('tam', NAV === 'webkit' ? '852x393@3' : '1536x864@1.25');
const SEED = +opt('semilla', 4242);
let pw;
try { pw = require(PW ? path.resolve(/playwright-core$/.test(PW) ? PW : path.join(PW, 'playwright-core')) : 'playwright-core'); }
catch (e) { console.error('Falta playwright-core: npm i --prefix <tmp>/pw playwright-core@1.64 y pasa --pw <tmp>/pw/node_modules'); process.exit(2); }
const CHROME = [CHROME_ARG, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (e) { /* 404 */ }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Lo que se inyecta antes que el juego: azar con semilla, y la cuenta de cada fotograma. */
function instrument({ seed, count }) {
  let a = seed | 0;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const P = window.__perf = { on: false, fr: [], c: {} };
  const C = P.c, inc = k => { C[k] = (C[k] || 0) + 1; };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(ts => {
    if (!P.on) return cb(ts);
    for (const k in C) C[k] = 0;
    P.ran = false; P.sp = {};
    const t0 = performance.now();
    cb(ts);
    if (P.hooked && !P.ran) return;          // (el tope de FPS del juego se saltó este aviso: no es un fotograma)
    const m = performance.memory;
    P.fr.push({ ts, t0, ms: performance.now() - t0, heap: m ? m.usedJSHeapSize : 0, c: Object.assign({}, C), sp: P.sp });
    // (Motor WebGL2: lo que mandó en este fotograma; se lee tras la tanda de microtareas.)
    if (window.G && G.GL2D && G.GL2D.on) { const r = P.fr[P.fr.length - 1]; setTimeout(() => { r.gl = G.GL2D.stats(); }, 0); }
  });
  if (!count) return;
  const wrap = (proto, names, key) => { for (const n of names) { const o = proto && proto[n]; if (typeof o !== 'function') continue;
    proto[n] = function () { if (P.on) inc(key || n); return o.apply(this, arguments); }; } };
  const C2 = CanvasRenderingContext2D.prototype;
  wrap(C2, ['drawImage', 'fillText', 'strokeText', 'measureText', 'fill', 'stroke', 'fillRect', 'getImageData', 'putImageData',
            'createLinearGradient', 'createRadialGradient', 'createPattern', 'save', 'clip']);
  const setter = (proto, prop, key, test) => { const d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set) return;
    Object.defineProperty(proto, prop, { configurable: true, get: d.get, set(v) { if (P.on && test(v)) inc(key); d.set.call(this, v); } }); };
  setter(C2, 'filter', 'filtro', v => v && v !== 'none');
  setter(C2, 'shadowBlur', 'sombra', v => v > 0);
  setter(C2, 'font', 'font', () => true);
  for (const G of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (G) {
    wrap(G.prototype, ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'], 'gl');
    wrap(G.prototype, ['compileShader'], 'shader');
    wrap(G.prototype, ['linkProgram'], 'programa');
    wrap(G.prototype, ['bufferData'], 'bufferData');
    wrap(G.prototype, ['texImage2D', 'texSubImage2D'], 'textura');
  }
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (t) { if (P.on && /^canvas$/i.test(t)) inc('lienzo'); return ce.apply(this, arguments); };
  if (window.OffscreenCanvas) { const O = window.OffscreenCanvas; window.OffscreenCanvas = function (w, h) { if (P.on) inc('lienzo'); return new O(w, h); }; window.OffscreenCanvas.prototype = O.prototype; }
  const mo = () => { if (!document.documentElement) return setTimeout(mo, 5);
    new MutationObserver(l => { if (P.on) C.dom = (C.dom || 0) + l.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); };
  mo();
}

/* Ayudas en la página (las mismas que las capturas): entrar como invitado y preparar cada escena. */
const HELPERS = () => {
  window.sleep = ms => new Promise(r => setTimeout(r, ms));
  // Entrar como invitado: lo que haya en pantalla, paso a paso (en WebKit todo llega más tarde).
  window.__enter = async () => {
    const vis = el => el && !el.classList.contains('hidden');      // (fixed: sin offsetParent)
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
  // Inmortal y sin cartas de nivel (paran la partida): sólo se mide el juego.
  window.__god = () => { clearInterval(window.__godI); window.__godI = setInterval(() => {
    const P = G.Game.player; if (!P) return; P.hp = P.maxHp; P.dead = false; P.xpNext = 1e12;
    if (document.querySelector('#scr-levelup:not(.hidden)')) { const c = document.querySelector('#scr-levelup .pick-card, #scr-levelup [data-i], #scr-levelup .card'); if (c) c.click(); }
  }, 100); };
  window.__play = async (seed) => {
    if (G.Game.state === 'playing' || G.Game.player) return;
    document.querySelector('#scr-menu [data-go="play"]').click();
    for (let i = 0; i < 60 && G.Game.state !== 'playing'; i++) await sleep(200);
    await sleep(1500);
    G.World.reset(seed); await sleep(500);
    const P = G.Game.player;
    // Un sitio libre cerca del centro, el mismo siempre (semilla fija).
    for (let r = 300; r < 4000; r += 150) { let ok = false; for (let a = 0; a < 6.28; a += 0.5) {
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
      if (G.World.isFree(x, y, 40)) { P.x = x; P.y = y; G.Camera.x = x; G.Camera.y = y; ok = true; break; } } if (ok) break; }
    G.EnemyMgr.clear(); G.Projectiles.clear();
    __god();
  };
  // Sólo cuentan los avisos de la pantalla en los que el juego hizo su fotograma (G.Pad.poll va en cada uno).
  window.__hook = (split) => {
    const P = window.__perf; if (P.hooked) return; P.hooked = true;
    const pad = G.Pad.poll; G.Pad.poll = function () { P.ran = true; return pad.apply(this, arguments); };
    if (!split) return;
    // Desglose: tiempo propio de cada parte (sin el de las partes medidas que llama dentro), por fotograma.
    const T = [
      ['sim', 'Weather', 'update'], ['sim', 'FX', 'update'], ['sim', 'Reg', 'tick'], ['sim:ia', 'Path', 'update'], ['sim', 'Spawner', 'update'],
      ['sim', 'Director', 'update'], ['sim:ia', 'EnemyMgr', 'update'], ['sim:combate', 'Combat', 'tick'], ['sim:proyectiles', 'Projectiles', 'update'],
      ['sim', 'Pickups', 'update'], ['sim', 'Hazards', 'update'], ['sim', 'Interact', 'update'], ['sim', 'Rift', 'update'],
      ['sim', 'Judgment', 'update'], ['sim', 'Events', 'update'], ['sim', 'World', 'update'], ['sim:jugador', 'Player.prototype', 'update'],
      ['sim:red', 'Coop', 'tick'],
      ['dib:suelo', 'World', 'drawGround'], ['dib:suelo', 'World', 'drawLiquid'], ['dib:suelo', 'Ambient', 'ground'], ['dib:suelo', 'Atmos', 'ground'],
      ['dib:suelo', 'EnemyAI', 'drawGround'], ['dib:suelo', 'Hazards', 'draw'], ['dib:campos', 'Combat', 'drawGroundFields'], ['dib:objetos', 'Pickups', 'draw'],
      ['dib:props', 'World', 'drawProp'], ['dib:props', 'World', 'visibleProps'], ['dib:enemigos', 'Enemy.prototype', 'draw'], ['dib:enemigos', 'EnemyMgr', 'drawables'],
      ['dib:jugador', 'Player.prototype', 'draw'], ['dib:proyectiles', 'Projectiles', 'draw'], ['dib:campos', 'Combat', 'drawAirFields'],
      ['dib:fx', 'FX', 'draw'], ['dib:aire', 'Ambient', 'air'], ['dib:aire', 'Weather', 'draw'], ['dib:velos', 'World', 'drawVignette'],
      ['dib:hud', 'HUD', 'draw'], ['dib:hud', 'Touch', 'draw'], ['3d', 'Ultra3D', 'begin'], ['3d', 'Ultra3D', 'render'], ['3d', 'Ultra3D', 'blit'],
      ['3d', 'Ultra3D', 'batch'], ['3d:aldea', 'Village', 'frame'], ['dom', 'UI', 'tick'],
    ];
    const stack = [];
    for (const [cat, obj, fn] of T) {
      const o = obj.split('.').reduce((a, k) => a && a[k], G);
      if (!o || typeof o[fn] !== 'function' || o[fn].__w) continue;
      const f = o[fn];
      const w = function () {
        if (!P.on) return f.apply(this, arguments);
        const fr = { c: 0 }; stack.push(fr);
        const t = performance.now();
        try { return f.apply(this, arguments); }
        finally {
          const d = performance.now() - t; stack.pop();
          const S = P.sp; S[cat] = (S[cat] || 0) + d - fr.c;
          if (stack.length) stack[stack.length - 1].c += d;
        }
      };
      w.__w = true; o[fn] = w;
    }
  };
  window.__heavy = () => {
    const P = G.Game.player;
    const ids = ['bullet-seed', 'flamethrower', 'ice-shard', 'swift'];
    P.moves = []; P.slots = []; P.active = 0;
    for (const id of ids) {
      const m = G.Moves.instance(id, G.Moves.BY_ID[id].maxLvl || 8);
      if (P.pass) G.Moves.applyPassives(m, P.pass);
      G.Moves.evolve(m); m.since = G.Game.st.time;
      P.moves.push(m); P.slots.push([m]);
    }
    P.bonds = 3; P.fuse(P.moves.slice(0), P.slots[0]);
    P.active = 0;
  };
  window.__scene = async (k) => {
    const P = G.Game.player;
    if (k === 'tranquila') { await sleep(2500); return; }
    if (k === 'jefe') {
      const B = G.Enemies.BOSSES, b = B[Math.min(4, B.length - 1)];
      G.Game.debugTime(b.at + 1); G.Spawner.debugBossesFrom(b.at + 2);
      G.Spawner.debugMake(b, b.at, G.Game.everyone(), true);
      await sleep(3000); return;
    }
    if (k === 'horda') {
      G.Game.debugTime(14 * 60); G.Spawner.debugBossesFrom(15 * 60);
      __heavy();
      for (const w of ['surge', 'ring', 'swarm', 'stampede', 'surge']) { G.Spawner.debugWave(w); await sleep(500); }
      await sleep(2500); return;
    }
    if (k === 'hordamax') {      // (fps-tecnologia) la horda con todo lo que cabe: el tope de enemigos y de proyectiles
      G.Game.debugTime(19 * 60); G.Spawner.debugBossesFrom(30 * 60);
      __heavy();
      const top = G.Spawner.capAt(G.Game.st.time) + 20;
      for (let i = 0; i < 14 && G.EnemyMgr.count < top; i++) { G.Spawner.debugWave(['surge', 'ring', 'swarm', 'stampede'][i % 4]); await sleep(350); }
      await sleep(2500); return;
    }
    if (k === 'grieta') {
      G.Rift.debugOpen(); await sleep(400);
      const r = G.Rift.rift; if (r) { P.x = r.x; P.y = r.y - 10; G.Camera.x = P.x; G.Camera.y = P.y; }
      return;    // se mide desde aquí: el viaje y la llegada
    }
    if (k === 'arena') { if (!G.Rift.inArena) { G.Rift.debugArena('fire', 2); } for (let i = 0; i < 40 && !G.Rift.inArena; i++) await sleep(250); await sleep(3000); return; }
  };
};

function stats(fr, secs, nav) {
  const f = fr.slice(1);
  const n = f.length;
  if (n < 3) return { error: 'sin fotogramas (' + n + ')' };
  const ms = f.map(x => x.ms).sort((a, b) => a - b);
  const gaps = f.slice(1).map((x, i) => x.ts - f[i].ts);
  const span = (f[n - 1].ts - f[0].ts) / 1000;
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  const o = { frames: n, fps: +(n / span).toFixed(1), ms: +(ms.reduce((a, b) => a + b, 0) / n).toFixed(2), p95: +q(ms, 0.95).toFixed(2), p99: +q(ms, 0.99).toFixed(2),
    maxMs: +ms[n - 1].toFixed(1), tirones: gaps.filter(g => g > 50).length, maxGap: +Math.max(...gaps).toFixed(1) };
  // Basura: lo que crece el montón entre fotogramas (asignado) y las bajadas (recogidas).
  if (f[0].heap) {
    let up = 0, gc = 0, freed = 0;
    for (let i = 1; i < n; i++) { const d = f[i].heap - f[i - 1].heap; if (d > 0) up += d; else if (d < -64 * 1024) { gc++; freed -= d; } }
    o.mbs = +(up / span / 1048576).toFixed(2); o.gc = gc; o.heapMB = +(f[n - 1].heap / 1048576).toFixed(1);
  }
  if (f.some(x => x.sp && Object.keys(x.sp).length)) {
    const ks = new Set(); for (const x of f) for (const k in x.sp || {}) ks.add(k);
    o.desglose = {}; let sum = 0;
    for (const k of [...ks].sort()) { const v = f.reduce((a, x) => a + ((x.sp || {})[k] || 0), 0) / n; o.desglose[k] = +v.toFixed(3); sum += v; }
    o.desglose.otros = +(o.ms - sum).toFixed(3);
  }
  if (f.some(x => x.gl)) {
    o.gl = {};
    for (const k of ['quads', 'draws', 'uploads', 'upPx', 'fb', 'groups', 'groupPx', 'textNew', 'resets']) o.gl[k] = +(f.reduce((a, x) => a + ((x.gl || {})[k] || 0), 0) / n).toFixed(1);
  }
  const keys = new Set(); for (const x of f) for (const k in x.c) keys.add(k);
  o.porFotograma = {};
  for (const k of keys) o.porFotograma[k] = +(f.reduce((a, x) => a + (x.c[k] || 0), 0) / n).toFixed(1);
  return o;
}

/* Tiempo ocupado de cada hilo en la traza de Chrome (tareas de primer nivel), en % del tiempo medido. La GPU de Chrome va en
 * otro proceso (CrGpuMain): ahí se ve lo que cuesta pintar el lienzo, que el JavaScript de la página no cuenta. */
function threadBusy(ev) {
  const names = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name);
  const busy = new Map(); let t0 = Infinity, t1 = -Infinity;
  for (const e of ev.filter(e => e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts)) {
    const k = e.pid + ':' + e.tid, nm = names.get(k) || k;
    if (!/CrRendererMain|CrGpuMain|VizCompositorThread|Compositor$|CrBrowserMain/.test(nm)) continue;
    // (sólo lo de arriba: las tareas que van dentro de otra no se suman dos veces)
    const b = busy.get(nm) || { us: 0, end: 0 };
    const st = Math.max(e.ts, b.end), en = e.ts + e.dur;
    if (en > st) b.us += en - st;
    b.end = Math.max(b.end, en); busy.set(nm, b);
    t0 = Math.min(t0, e.ts); t1 = Math.max(t1, en);
  }
  const span = t1 - t0 || 1, o = {};
  for (const [k, b] of busy) o[k] = +(100 * b.us / span).toFixed(1);
  return o;
}

/* Funciones que más tiempo gastan: propio (self) e incluido lo que llaman (incl). Con `win` ([[desde, hasta]] en ms de la página
 * y `t0`, la hora de la página al empezar el perfil), sólo las muestras dentro de esos fotogramas (los lentos). */
function topSelf(profile, k = 25, win = null, t0 = 0) {
  const self = new Map(), incl = new Map(), byId = new Map(), parent = new Map();
  for (const nd of profile.nodes) { byId.set(nd.id, nd); for (const c of nd.children || []) parent.set(c, nd.id); }
  const name = nd => { const cf = nd.callFrame; return (cf.functionName || '(anónima)') + ' ' + (cf.url ? cf.url.replace(/^.*\/(js\/)/, '$1').replace(/^https?:\/\/[^/]+\//, '') : '') + ':' + (cf.lineNumber + 1); };
  const dt = profile.timeDeltas, s = profile.samples;
  let t = 0, all = 0, wi = 0;
  for (let i = 0; i < s.length; i++) {
    t += dt[i] || 0;
    const us = dt[i + 1] || dt[i] || 0;
    if (win) { const pt = t0 + t / 1000; while (wi < win.length && win[wi][1] < pt) wi++; if (wi >= win.length || pt < win[wi][0]) continue; }
    const nd = byId.get(s[i]); const key = name(nd);
    self.set(key, (self.get(key) || 0) + us); all += us;
    const seen = new Set();
    for (let id = s[i]; id != null; id = parent.get(id)) { const kk = name(byId.get(id)); if (seen.has(kk)) continue; seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + us); }
  }
  const fmt = m => [...m.entries()].filter(([key]) => !/^\(root\)|^\(program\)|^\(idle\)/.test(key)).sort((a, b) => b[1] - a[1]).slice(0, k)
    .map(([key, us]) => [key, +(us / 1000).toFixed(1), +(100 * us / (all || 1)).toFixed(1)]);
  return { ms: +(all / 1000).toFixed(1), self: fmt(self), incl: fmt(incl) };
}

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const [W, H, DPR] = TAM.match(/^(\d+)x(\d+)@([\d.]+)$/).slice(1).map(Number);
  for (const Q of QUALS) for (let rep = 0; rep < REPS; rep++) {
    let browser, ctx;
    if (NAV === 'webkit') {
      browser = await pw.webkit.launch({ headless: true });
      const dev = pw.devices['iPhone 15 landscape'] || pw.devices['iPhone 13 landscape'];
      ctx = await browser.newContext(Object.assign({}, dev, { viewport: { width: W, height: H }, deviceScaleFactor: DPR }));
    } else {
      browser = await pw.chromium.launch({ executablePath: CHROME, headless: true,
        args: ['--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-precise-memory-info']
          .concat(UNCAP ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []) });
      ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
    }
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push('[err] ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/favicon|firebase|ERR_|Failed to load|identitytoolkit|googleapis|404/.test(m.text())) errs.push('[c] ' + m.text().slice(0, 300)); });
    await p.addInitScript(instrument, { seed: SEED, count: COUNT });
    // (Calidad antes de cargar: la aldea y el tamaño del lienzo ya salen con ella.)
    await p.addInitScript(q => { try { const s = JSON.parse(localStorage.getItem('ps.settings') || '{}'); s.quality = q.q; s.fps = false; if (q.uncap) s.fpsCap = q.hz || 0; localStorage.setItem('ps.settings', JSON.stringify(s)); } catch (e) { /* */ } }, { q: Q, uncap: UNCAP, hz: HZ });
    await p.goto(`http://127.0.0.1:${port}/dev.html?dev&gl=${GLON ? 1 : 0}${process.env.GLDBG ? '&gldbg=1' : ''}${process.env.QX || ''}`, { waitUntil: 'load' });
    await p.evaluate(HELPERS);
    await p.waitForFunction(() => window.G && G.Pad && G.Game, null, { timeout: 60000 });
    await p.evaluate(s => __hook(s), SPLIT);
    if (DROP.length) console.log('quitado:', await p.evaluate(list => list.map(d => {
      const [path, ret] = d.split('='), ks = path.split('.'), fn = ks.pop(), o = ks.reduce((a, k) => a && a[k], G);
      if (!o || typeof o[fn] !== 'function') return d + ' (no existe)';
      const v = ret === undefined ? undefined : JSON.parse(ret); o[fn] = () => v; return d;
    }).join(', '), DROP));
    const cdp = NAV === 'chrome' ? await ctx.newCDPSession(p) : null;
    if (cdp) { await cdp.send('Performance.enable'); if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); } }
    const gpu = await p.evaluate(() => { try { const c = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch (e) { return '?'; } });
    const res = { nav: NAV, sinTope: UNCAP, hz: HZ || null, gl: GLON, calidad: Q, tam: TAM, gpu, semilla: SEED, seg: SECS, fecha: new Date().toISOString(), escenas: {} };
    const entered = await p.evaluate(() => __enter());
    if (process.env.PERF_DEBUG) console.log('entrada', entered, await p.evaluate(() => G.Game.state + ' ' + [...document.querySelectorAll('.scr:not(.hidden)')].map(e => e.id).join(',')));
    await p.waitForFunction(() => window.G && G.Village && G.Village.mode !== 'loading', null, { timeout: 60000 }).catch(() => { });
    await sleep(1500);
    const metrics = async () => { if (!cdp) return null; const m = (await cdp.send('Performance.getMetrics')).metrics; const o = {}; for (const x of m) o[x.name] = x.value; return o; };
    for (const S of SCENES) {
      try {
        if (S !== 'aldea') {
          await p.evaluate(s => __play(s), SEED);
          if (process.env.PERF_DEBUG) console.log('play', await p.evaluate(() => G.Game.state + ' pl ' + !!G.Game.player + ' ' + [...document.querySelectorAll('.scr:not(.hidden)')].map(e => e.id).join(',')));
          await p.evaluate(s => __scene(s), S);
        }
        if (cdp) await cdp.send('HeapProfiler.collectGarbage').catch(() => { });
        const m0 = await metrics();
        let pt0 = 0;
        if (PROFILE && cdp) { await cdp.send('Profiler.start'); pt0 = await p.evaluate(() => performance.now()); }
        let traceEv = null;
        if (TRACE && cdp) {
          traceEv = [];
          cdp.removeAllListeners('Tracing.dataCollected');
          cdp.on('Tracing.dataCollected', d => { for (const e of d.value) traceEv.push(e); });
          await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['toplevel', '__metadata'], recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
        }
        await p.evaluate(() => { __perf.fr = []; __perf.on = true; if (G.GL2D && G.GL2D.gpu) G.GL2D.gpu(true); });
        await sleep(SECS * 1000);
        const fr = await p.evaluate(() => { __perf.on = false; const f = __perf.fr; __perf.fr = []; return f; });
        const gpuMs = await p.evaluate(() => (G.GL2D && G.GL2D.gpu ? G.GL2D.gpu(true) : {}));
        const m1 = await metrics();
        const o = stats(fr, SECS, NAV);
        if (Object.keys(gpuMs).length) o.gpuMs = gpuMs;
        if (traceEv) {
          const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
          await cdp.send('Tracing.end'); await done;
          o.hilos = threadBusy(traceEv);
        }
        if (m0 && m1) {
          const span = (m1.Timestamp - m0.Timestamp) || SECS;
          o.cdp = { scriptPct: +(100 * (m1.ScriptDuration - m0.ScriptDuration) / span).toFixed(1), taskPct: +(100 * (m1.TaskDuration - m0.TaskDuration) / span).toFixed(1),
            layoutS: +((m1.LayoutCount - m0.LayoutCount) / span).toFixed(1), styleS: +((m1.RecalcStyleCount - m0.RecalcStyleCount) / span).toFixed(1),
            nodes: m1.Nodes, listeners: m1.JSEventListeners };
        }
        o.estado = await p.evaluate(() => ({ enemigos: G.EnemyMgr.all ? G.EnemyMgr.all().length : 0, proyectiles: G.Projectiles.all ? G.Projectiles.all().length : (G.Projectiles.count || null),
          arena: !!(G.Rift && G.Rift.inArena), fx: G.Settings.fx, ultra: G.Settings.ultra, estado: G.Game.state,
          lienzo: (document.getElementById('game') || {}).width + '×' + (document.getElementById('game') || {}).height }));
        if (PROFILE && cdp) {
          const { profile } = await cdp.send('Profiler.stop');
          const fn = path.join(OUT, `${NAV}-${Q}-${S}.cpuprofile`);
          fs.writeFileSync(fn, JSON.stringify(profile));
          o.top = topSelf(profile);
          const slow = fr.filter(x => x.ms > 50).map(x => [x.t0 - 2, x.t0 + x.ms + 2]);
          if (slow.length) o.topLentos = topSelf(profile, 25, slow, pt0);
        }
        if (process.env.GLDBG) { o.census = await p.evaluate(() => G.GL2D.census && G.GL2D.census()); await p.evaluate(() => G.GL2D.census && G.GL2D.census().length && 0); }
        res.escenas[S] = o;
        if (S === 'grieta' || S === 'arena') { /* la arena sigue en la grieta */ }
      } catch (e) { res.escenas[S] = { error: String(e && e.message || e).slice(0, 300) }; }
      const r = res.escenas[S];
      console.log(`${NAV} ${Q} ${S}: ` + (r.error ? 'ERROR ' + r.error : `${r.fps} FPS, ${r.ms} ms (p95 ${r.p95}, p99 ${r.p99}), tirones ${r.tirones}, peor ${r.maxGap} ms` +
        (r.mbs != null ? `, basura ${r.mbs} MB/s, gc ${r.gc}` : '') + `, enemigos ${r.estado.enemigos}, proyectiles ${r.estado.proyectiles}` +
        (r.gpuMs ? ` | GPU ms ${JSON.stringify(r.gpuMs)}` : '') + (r.gl ? `\n   gl ${JSON.stringify(r.gl)}` : '') + (r.desglose ? `\n   desglose ms ${JSON.stringify(r.desglose)}` : '') + (r.hilos ? `\n   hilos % ${JSON.stringify(r.hilos)}` : '') + ` | ${JSON.stringify(r.porFotograma)}`));
    }
    res.errores = errs.slice(0, 30);
    const fn = path.join(OUT, `${NAV}-${Q}${REPS > 1 ? '-' + rep : ''}.json`);
    fs.writeFileSync(fn, JSON.stringify(res, null, 1));
    if (errs.length) console.log('errores:', errs.slice(0, 5).join('\n'));
    await browser.close();
  }
  srv.close();
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
