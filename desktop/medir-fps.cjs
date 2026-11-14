// Mide los FPS del juego en la app de Windows y en el navegador, con el mismo
// recorrido de un jugador nuevo como invitado: entrar → test → aldea 3D (menú)
// → partida. Cada prueba usa un perfil limpio.
//
//   node medir-fps.cjs                 todas las pruebas
//   node medir-fps.cjs electron edge   sólo esas
//
// Pruebas: electron, electron-sin-tope, edge, edge-sin-tope, chrome, chrome-sin-tope,
// y exe / exe-sin-tope (la app empaquetada).
// rust / rust-sin-tope: la app de Rust (desktop-rust, WebView2). Usa
// desktop-rust/dist/PokeSurvivor/PokeSurvivor.exe si existe y si no
// desktop-rust/target/release (o debug) con --www=desktop/www. Se le habla por la
// depuración remota de WebView2 y se cierra como un jugador (WM_CLOSE), para
// comprobar que la partida queda copiada en disco.
// Edge usa el mismo motor que WebView2 (lo que usarían Tauri o un host en C#).
// Deja capturas y el resultado en desktop/dist/medidas/.
'use strict';
const { _electron, chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SALIDA = path.join(__dirname, 'dist', 'medidas');
const PUERTO_WEB = 39018;
const SIN_TOPE = ['--disable-frame-rate-limit', '--disable-gpu-vsync'];
const TODAS = ['electron', 'electron-sin-tope', 'edge', 'edge-sin-tope', 'chrome', 'chrome-sin-tope'];
const SEG_MENU = 10, SEG_PARTIDA = 20;

const espera = ms => new Promise(r => setTimeout(r, ms));

// Cuenta fotogramas de requestAnimationFrame durante `ms` y saca tiempos.
const MEDIR = ms => new Promise(res => {
  const dts = []; let n = 0; const t0 = performance.now(); let ant = t0;
  const f = t => {
    n++; dts.push(t - ant); ant = t;
    if (t - t0 < ms) requestAnimationFrame(f);
    else {
      dts.sort((a, b) => a - b);
      const q = p => +dts[Math.min(dts.length - 1, Math.floor(dts.length * p))].toFixed(2);
      res({ fps: +(n * 1000 / (t - t0)).toFixed(1), p50ms: q(0.5), p95ms: q(0.95), p99ms: q(0.99), maxms: q(1) });
    }
  };
  requestAnimationFrame(f);
});

const GPU = () => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) { return 'sin WebGL: ' + e.message; }
};

async function recorrido(page, nombre, log) {
  const foto = async etapa => page.screenshot({ path: path.join(SALIDA, `${nombre}-${etapa}.png`) }).catch(() => {});
  await page.waitForSelector('#btn-guest', { state: 'visible', timeout: 60000 });
  await foto('1-entrada');
  await page.click('#btn-guest');
  // Test de personalidad: 8 preguntas.
  for (let i = 0; i < 12; i++) {
    const ok = await page.$('#res-ok:visible');
    if (ok) break;
    const r = await page.waitForSelector('#test-a .answer:visible', { timeout: 15000 }).catch(() => null);
    if (!r) break;
    await r.click();
    await espera(250);
  }
  await page.click('#res-ok', { timeout: 15000 });
  await espera(6000);                       // que cargue la aldea 3D
  await foto('2-menu');
  const menu = await page.evaluate(MEDIR, SEG_MENU * 1000);
  log(`  menú (aldea 3D): ${JSON.stringify(menu)}`);
  // Calidad de gráficos elegida (en la app de Windows tiene que salir 'max' sola).
  const graficos = await page.evaluate(() => {
    let s = {}; try { s = JSON.parse(localStorage.getItem('ps.settings') || '{}'); } catch (e) { /* nada */ }
    return { calidad: s.quality, qDesk: s.qDesk, pokemonNitidos: s.pixSmooth, app: !!window.pokeEscritorio };
  });
  log(`  gráficos: ${JSON.stringify(graficos)}`);

  // A jugar: «Ir a…» → «Jugar» en la aldea, o el botón del menú clásico.
  const irA = await page.$('#vil-go:visible');
  if (irA) { await irA.click(); await espera(600); await page.click('[data-vgo="play"]', { timeout: 10000 }); }
  else {
    const jugar = await page.$('.menu-item.play:visible');
    if (jugar) await jugar.click(); else log('  (no se ve ningún botón de Jugar)');
  }
  await espera(4000);
  await foto('3-tras-jugar');
  // Puede salir una pantalla intermedia; se acepta con lo que haya.
  for (const sel of ['#starter-ok:visible', '.btn.gold.big:visible', 'button.play:visible']) {
    const b = await page.$(sel);
    if (b) { await b.click().catch(() => {}); await espera(1500); }
  }
  await espera(4000);
  await foto('4-partida');
  // Moverse en círculo mientras se mide, como un jugador.
  let parar = false;
  const mover = (async () => {
    const teclas = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
    for (let i = 0; !parar; i++) {
      const k = teclas[i % 4];
      await page.keyboard.down(k); await espera(700); await page.keyboard.up(k);
    }
  })();
  const partida = await page.evaluate(MEDIR, SEG_PARTIDA * 1000);
  parar = true; await mover;
  await foto('5-final');
  log(`  partida: ${JSON.stringify(partida)}`);
  return { menu, partida };
}

async function servidorWeb() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.cjs'), path.join(__dirname, 'www'), String(PUERTO_WEB)], { stdio: 'ignore' });
  await espera(1000);
  return p;
}

// La app de Rust: el .exe empaquetado si está; si no, el compilado.
function exeRust() {
  const r = path.join(__dirname, '..', 'desktop-rust');
  const cands = [path.join(r, 'dist', 'PokeSurvivor', 'PokeSurvivor.exe'), path.join(r, 'target', 'release', 'PokeSurvivor.exe'),
    path.join(r, 'target', 'debug', 'PokeSurvivor.exe')];
  const exe = cands.find(f => fs.existsSync(f));
  if (!exe) throw new Error('Falta la app de Rust: cargo build --release en desktop-rust');
  return { exe, www: exe.includes(path.sep + 'dist' + path.sep) ? null : path.join(__dirname, 'www') };
}

async function abrirRust(nombre, perfil) {
  const { exe, www } = exeRust();
  const puerto = 39300 + Math.floor(Math.random() * 500);
  const proc = spawn(exe, ['--perfil=' + perfil, '--sin-avisos', '--depuracion=' + puerto,
    ...(www ? ['--www=' + www] : []), ...(nombre.endsWith('sin-tope') ? ['--sin-tope'] : [])], { stdio: 'ignore' });
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    await espera(500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`).catch(() => null);
  }
  if (!browser) throw new Error('La app de Rust no abrió la depuración');
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:39017/'));
    if (!page) await espera(250);
  }
  if (!page) throw new Error('La app de Rust no cargó el juego');
  const cerrar = async () => {
    // Como un jugador: WM_CLOSE a la ventana (sin /F). La app guarda y sale.
    try { require('child_process').execFileSync('taskkill', ['/PID', String(proc.pid)], { stdio: 'ignore' }); } catch (e) { /* */ }
    const t0 = Date.now();
    while (proc.exitCode === null && Date.now() - t0 < 8000) await espera(100);
    const salio = proc.exitCode !== null ? Date.now() - t0 : null;
    try { require('child_process').execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* ya cerrada */ }
    const g = path.join(perfil, 'guardado', 'partida.json');
    let claves = 0;
    try { claves = Object.keys(JSON.parse(fs.readFileSync(g, 'utf8')).datos).length; } catch (e) { /* sin copia */ }
    return { salioEnMs: salio, guardadoClaves: claves };
  };
  return { page, cerrar };
}

async function una(nombre, log) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-perfil-'));
  const errores = [];
  let cerrar;
  let page;
  if (nombre.startsWith('rust')) {
    ({ page, cerrar } = await abrirRust(nombre, perfil));
  } else if (nombre.startsWith('electron') || nombre.startsWith('exe')) {
    // «exe» prueba la app ya empaquetada (npm run empaquetar), no la carpeta.
    const exe = nombre.startsWith('exe');
    const app = await _electron.launch({
      executablePath: exe ? path.join(__dirname, 'dist', 'PokeSurvivor', 'PokeSurvivor.exe') : require('electron'),
      args: [...(exe ? [] : [__dirname]), '--perfil=' + perfil, ...(nombre.endsWith('sin-tope') ? ['--sin-tope'] : [])],
      cwd: __dirname,
    });
    page = await app.firstWindow();
    // Si no se cierra en 10 s, se mata (a veces Playwright se queda esperando).
    cerrar = () => Promise.race([app.close(), espera(10000)]).finally(() => {
      // Con todos sus procesos hijos (GPU, página), que si no bloquean el perfil.
      try { require('child_process').execFileSync('taskkill', ['/PID', String(app.process().pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* ya cerrada */ }
    });
  } else {
    const canal = nombre.startsWith('edge') ? 'msedge' : 'chrome';
    const ctx = await chromium.launchPersistentContext(perfil, {
      channel: canal, headless: false, viewport: null,
      args: ['--window-size=1280,800', ...(nombre.endsWith('sin-tope') ? SIN_TOPE : [])],
    });
    page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PUERTO_WEB}/index.html`);
    cerrar = () => Promise.race([ctx.close(), espera(10000)]);
  }
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
  try {
    const gpu = await page.evaluate(GPU);
    const tam = await page.evaluate(() => `${innerWidth}x${innerHeight} @${devicePixelRatio}`);
    log(`${nombre}: ${navigator_ua(await page.evaluate(() => navigator.userAgent))} | GPU: ${gpu} | ${tam}`);
    const r = await recorrido(page, nombre, log);
    if (nombre.startsWith('rust')) {
      r.escritorio = await page.evaluate(() => JSON.parse(JSON.stringify(window.pokeEscritorio || null)));
      const c = await cerrar(); cerrar = async () => {};
      r.cierre = c;
      log(`  cierre: ${JSON.stringify(c)} | pokeEscritorio: ${JSON.stringify(r.escritorio)}`);
    }
    return { nombre, gpu, tam, ...r, errores: errores.slice(0, 20) };
  } catch (e) {
    log(`  FALLO: ${e.message}`);
    return { nombre, fallo: e.message, errores };
  } finally {
    await cerrar().catch(() => {});
    await espera(1500);
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }); } catch (e) { /* se queda en temporales */ }
  }
}

function navigator_ua(ua) {
  const m = ua.match(/(Edg|Chrome|Electron)\/[\d.]+/g);
  return m ? m.join(' ') : ua;
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : TODAS;
  const lineas = [];
  const log = s => { console.log(s); lineas.push(s); };
  const web = pedidas.some(n => !/^(electron|exe|rust)/.test(n)) ? await servidorWeb() : null;
  const res = [];
  try {
    for (const n of pedidas) res.push(await una(n, log));
  } finally { if (web) web.kill(); }
  fs.writeFileSync(path.join(SALIDA, 'resultado.json'), JSON.stringify(res, null, 2));
  fs.writeFileSync(path.join(SALIDA, 'resultado.txt'), lineas.join('\n') + '\n');
})();
