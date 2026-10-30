// Capturas del juego a cualquier tamaño (móvil tumbado, escritorio...) con Chrome sin ventana.
// Uso: node tools/shot.cjs <carpeta-del-juego> <carpeta-salida> <spec.json> [--pp <node_modules>] [--chrome <exe>]
//   puppeteer-core: --pp <carpeta node_modules> o PUPPETEER_CORE=<ruta> (npm i --prefix <tmp>/pp puppeteer-core@23.11.1)
//   Chrome: --chrome <exe> o CHROME=<exe>; si no, busca Chrome/Edge en las rutas normales de Windows, Mac y Linux.
//   spec.json: [{ "name": "gacha-667", "size": "667x375", "js": "await go('gacha')" }, ...]
//   - Entra como invitado, pasa el test, elige compañero y rellena la partida con datos
//     de prueba (monedas, tickets, Pokémon, objetos) antes de cada captura. Todo es local: no toca ninguna cuenta.
//   - En "js" hay ayudas: go(k) abre una entrada del menú (dex, upgrades, shop, bag, gacha,
//     goals, friends, rank, settings, play), home() vuelve al menú, sleep(ms), click(sel),
//     levelUp() abre las cartas de nivel en partida, pause() abre la pausa, over() acaba la run.
//     Para el modo Ultra (2,5D): "js": "G.Settings.set('quality','ultra'); await go('play'); await sleep(3000)".
//   - "page": "index.html" para probar la versión compilada (por defecto dev.html); "dpr": 1 o 2 (por defecto 2).
// Escribe <salida>/<name>.png y dice en consola los errores de la página.
const path = require('path'), fs = require('fs'), http = require('http');
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf('--' + k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const PP = opt('pp') || process.env.PUPPETEER_CORE;
const CHROME_ARG = opt('chrome') || process.env.CHROME;
let puppeteer;
try { puppeteer = require(PP ? path.resolve(/puppeteer-core$/.test(PP) ? PP : path.join(PP, 'puppeteer-core')) : 'puppeteer-core'); }
catch (e) { console.error('Falta puppeteer-core: npm i --prefix <tmp>/pp puppeteer-core@23.11.1 y pasa --pp <tmp>/pp/node_modules'); process.exit(2); }
const [root, outDir, specFile] = argv.map(p => path.resolve(p));
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const CHROME = [CHROME_ARG,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find(p => p && fs.existsSync(p));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (e) { /* 404 abajo */ }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const PRELUDE = `
window.sleep = ms => new Promise(r => setTimeout(r, ms));
window.vis = () => [...document.querySelectorAll('.scr:not(.hidden)')].map(e => e.id).join(',');
window.click = sel => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!e) throw Error('no ' + sel); e.click(); };
window.home = async () => {
  for (let i = 0; i < 5; i++) {
    const open = [...document.querySelectorAll('.scr:not(.hidden)')].filter(e => e.id !== 'scr-menu');
    if (!open.length) break;
    const top = open[open.length - 1];
    const b = top.querySelector('.sheet-head [data-back], .sheet-head .back, [id$=-close], [id$=-back]');
    if (b) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(350);
  }
};
window.go = async k => { await home(); const m = document.querySelector('#scr-menu [data-go="' + k + '"]'); if (!m) throw Error('no menu ' + k); m.click(); await sleep(900); };
window.levelUp = async () => { await go('play'); await sleep(1500); G.Game.debugLevelUp(); await sleep(1500); };
window.pause = async () => { await go('play'); await sleep(1500); G.Game.togglePause(); await sleep(800); };
window.over = async () => { await go('play'); await sleep(1500); G.Game.quit(); await sleep(2500); };
`;

async function enter(page) {
  await page.evaluate(PRELUDE);
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40 && !document.querySelector('#scr-login:not(.hidden), #scr-menu:not(.hidden)'); i++) await sleep(250);
    const g = [...document.querySelectorAll('button')].find(b => b.offsetParent && /invitado|guest/i.test(b.textContent));
    if (g) { g.click(); await sleep(1200); }
    for (let i = 0; i < 12; i++) { const b = document.querySelector('#scr-test:not(.hidden) .answer'); if (!b) break; b.click(); await sleep(450); }
    await sleep(400);
    const v = [...document.querySelectorAll('#scr-result button')].find(b => b.offsetParent);
    if (v) { v.click(); await sleep(1200); }
    if (window.G && G.DB && G.DB.save) {
      const S = G.DB.save, now = Date.now();
      S.coins = 48250; S.tickets = { t1: 23, t10: 2 };
      [1,4,7,25,133,150,151,249,250,384,445,6,9,3,94,130,143,149,248,282,330,373,376,392,395,398,405,470,471,493,644,700,778,887,906,909,912]
        .forEach(i => { if (G.DEX_BY && G.DEX_BY[i]) S.owned[i] = { at: now, from: 'gacha' }; });
      S.shiny = { 25: { at: now } }; S.bag = { mint: 3, cap: 2, caph: 1 }; S.upgrades = { hp: 5, atk: 3, spd: 2, cd: 1 };
      Object.assign(S.stats, { runs: 12, bestTime: 812, bestLevel: 34, totalKills: 4210 });
      if (G.MenuUI) G.MenuUI.open();
      await sleep(500);
    }
  });
}

(async () => {
  if (!CHROME) throw Error('no encuentro Chrome ni Edge');
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  try {
    for (const s of spec) {
      const [w, h] = s.size.split('x').map(Number);
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message || e)));
      page.on('console', m => { if (m.type() === 'error' && !/beforeunload|favicon|firebase|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
      await page.setViewport({ width: w, height: h, deviceScaleFactor: s.dpr || 2, isMobile: w < 768 || h < 520, hasTouch: w < 768 || h < 520 });
      await page.goto(`http://127.0.0.1:${port}/${s.page || 'dev.html'}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await enter(page);
      let info = '';
      if (s.js) info = await page.evaluate(`(async () => { ${s.js}; await sleep(600); return vis(); })()`).catch(e => 'ERROR: ' + e.message);
      const file = path.join(outDir, s.name + '.png');
      await page.screenshot({ path: file });
      console.log(`${s.name} (${s.size}) -> ${file} · pantallas: ${info}${errors.length ? ' · ERRORES: ' + errors.join(' | ') : ''}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
