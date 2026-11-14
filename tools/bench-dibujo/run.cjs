/*
 * Banco de dibujo (fps-tecnologia, 14-11-2026). SÓLO PARA DESARROLLO: no lo carga el juego.
 * La mezcla de dibujo de la horda (sprites de 30 Pokémon, partículas, suelo en trozos, niebla, viñeta, números) en
 * Canvas 2D (como hoy), en WebGL2 por lotes (atlas + una llamada por textura) y, si se le pasa, en PixiJS.
 *   node tools/bench-dibujo/run.cjs <node_modules con playwright-core> [--nav webkit] [--tope] [--pixi <ruta a pixi.min.js desde la raíz>]
 * Sin --tope, Chrome va sin vsync: FPS = lo que da de sí. Con la traza: % ocupado del hilo de la página y del de la GPU.
 */
const path = require('path'), fs = require('fs'), http = require('http');
const argv = process.argv.slice(2);
const pw = require(path.join(argv[0], 'playwright-core'));
const NAV = argv.includes('--nav') ? argv[argv.indexOf('--nav') + 1] : 'chrome';
const CAP = argv.includes('--tope');
const ROOT = path.resolve(__dirname, '../..');
const PIXI = argv.includes('--pixi') ? argv[argv.indexOf('--pixi') + 1] : null;
const T = { '.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function busy(ev) {
  const names = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name);
  const b = new Map(); let t0 = Infinity, t1 = -Infinity;
  for (const e of ev.filter(e => e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts)) {
    const nm = names.get(e.pid + ':' + e.tid) || '?'; if (!/CrRendererMain|CrGpuMain|VizCompositorThread/.test(nm)) continue;
    const x = b.get(nm) || { us: 0, end: 0 }; const s = Math.max(e.ts, x.end), en = e.ts + e.dur; if (en > s) x.us += en - s; x.end = Math.max(x.end, en); b.set(nm, x);
    t0 = Math.min(t0, e.ts); t1 = Math.max(t1, en);
  }
  const o = {}; for (const [k, x] of b) o[k.replace(/^Cr|Thread$/g, '')] = +(100 * x.us / (t1 - t0)).toFixed(0); return o;
}
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const cases = [
    ['c2d', 'spr=150&part=100&txt=15'], ['gl', 'spr=150&part=100&txt=15'], ['pixi', 'spr=150&part=100&txt=15'],
    ['c2d', 'spr=700&part=1100&txt=90'], ['gl', 'spr=700&part=1100&txt=90'], ['pixi', 'spr=700&part=1100&txt=90'],
    ['c2d', 'spr=700&part=1100&txt=90&frames=1'],
    ['c2d', 'spr=3000&part=4000&txt=90'], ['gl', 'spr=3000&part=4000&txt=90'], ['pixi', 'spr=3000&part=4000&txt=90'],
  ].filter(c => (!process.env.SOLO || c[0] === process.env.SOLO) && (c[0] !== 'pixi' || PIXI));
  for (const [mode, qs] of cases) {
    let browser, ctx;
    if (NAV === 'webkit') { browser = await pw.webkit.launch({ headless: true }); ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 }); }
    else { browser = await pw.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'].concat(CAP ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']) });
      ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 }); }
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${port}/tools/bench-dibujo/bench.html?mode=${mode}&${qs}${PIXI ? '&pixi=/' + PIXI : ''}`);
    await p.waitForFunction(() => window.__ready, null, { timeout: 30000 }); await sleep(1500);
    const cdp = NAV === 'chrome' ? await ctx.newCDPSession(p) : null; let ev = [];
    if (cdp) { cdp.on('Tracing.dataCollected', d => { for (const e of d.value) ev.push(e); });
      await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['toplevel', '__metadata'] }, transferMode: 'ReportEvents' }); }
    await p.evaluate(() => { __bench.fr = []; }); await sleep(4000);
    const fr = await p.evaluate(() => __bench.fr.slice(1));
    let hil = '';
    if (cdp) { const done = new Promise(r => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); await done; hil = JSON.stringify(busy(ev)); }
    const ms = fr.map(x => x[1]).sort((a, b) => a - b), span = (fr[fr.length - 1][0] - fr[0][0]) / 1000;
    const gaps = fr.slice(1).map((x, i) => x[0] - fr[i][0]).sort((a, b) => a - b);
    console.log(`${NAV} ${mode.padEnd(4)} ${qs.padEnd(34)} ${(fr.length / span).toFixed(0).padStart(5)} FPS  js ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2)} ms  hueco p99 ${gaps[Math.floor(gaps.length * 0.99)].toFixed(1)} ms  ${hil} ${errs.join(' ')}`);
    await browser.close();
  }
  srv.close();
})().catch(e => { console.error(e); process.exit(1); });
