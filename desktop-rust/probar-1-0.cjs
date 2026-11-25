// Prueba lo del bloque I de la 1.0 en la app de Windows, como un jugador (invitado, perfil nuevo):
//   1. Sin conexión: la app abre la nube con el SDK de Firebase que lleva dentro, se entra como invitado y se juega.
//      «Sin red» = WebView2 con un proxy que no existe (nada sale a internet; el juego lo sirve la app igual).
//   2. Mando primero: con --con-mando (como si hubiera un mando al abrir) empieza en modo mando, sin cursor y con la
//      selección a la vista; un mando simulado (Gamepad API) navega; el ratón lo quita. «Salir del juego» cierra la app
//      y la partida queda en disco.
//   3. Versión nueva contra un servidor falso en 127.0.0.1 (--actualizaciones=): sale el aviso fuera de partida, «Actualizar
//      ahora» baja el archivo con su barra, y si la huella SHA-256 no coincide no instala nada y lo dice.
//      (Instalar de verdad encima y volver a abrirse: probar-actualizar.cjs, con el instalador.)
//
//   node probar-1-0.cjs            dist/PokeSurvivor/PokeSurvivor.exe (node empaquetar.cjs antes)
//   node probar-1-0.cjs --release  target/release/PokeSurvivor.exe con www/ (cargo build --release y node copiar-web.cjs)
// playwright-core: PLAYWRIGHT_CORE=<carpeta node_modules> (como probar.cjs). Capturas en dist/pruebas-1-0/.
'use strict';
const path = require('path');
const PW = process.env.PLAYWRIGHT_CORE;
const { chromium } = require(PW ? path.resolve(/playwright-core$/.test(PW) ? PW : path.join(PW, 'playwright-core')) : 'playwright-core');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const REL = process.argv.includes('--release');
const EXE = REL ? path.join(__dirname, 'target', 'release', 'PokeSurvivor.exe') : path.join(__dirname, 'dist', 'PokeSurvivor', 'PokeSurvivor.exe');
const WWW = REL ? ['--www=' + path.join(__dirname, 'www')] : [];
const CAPTURAS = path.join(__dirname, 'dist', 'pruebas-1-0');
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const ok = (nombre, bien, detalle = '') => { resultados.push({ nombre, bien: !!bien, detalle }); console.log(`${bien ? 'OK  ' : 'MAL '} ${nombre}${detalle ? ' — ' + detalle : ''}`); };

async function abrir(perfil, extra = [], env = {}) {
  const puerto = 39300 + Math.floor(Math.random() * 500);
  const args = ['--perfil=' + perfil, '--depuracion=' + puerto, ...WWW, ...extra];
  if (!extra.some(a => a.startsWith('--actualizaciones='))) args.push('--sin-avisos');
  // Si se dan interruptores por el entorno, WebView2 puede usar sólo esos: también va el puerto de depuración.
  const e = { ...process.env, ...env };
  if (env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS) e.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS += ` --remote-debugging-port=${puerto}`;
  const proc = spawn(EXE, args, { stdio: 'ignore', env: e });
  let browser;
  for (let i = 0; i < 160 && !browser; i++) { await espera(250); browser = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`).catch(() => null); }
  if (!browser) throw new Error('no abrió la depuración');
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:39017/'));
    if (!page) await espera(100);
  }
  if (!page) throw new Error('no cargó el juego');
  const errores = [];
  page.on('pageerror', er => errores.push(er.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errores.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.waitForSelector('#btn-guest', { state: 'visible', timeout: 90000 });
  return { proc, page, browser, errores };
}

async function cerrar(proc) {
  try { execFileSync('taskkill', ['/PID', String(proc.pid)], { stdio: 'ignore' }); } catch (e) { /* */ }
  const t0 = Date.now();
  while (proc.exitCode === null && Date.now() - t0 < 8000) await espera(50);
  try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* ya cerrada */ }
  await espera(800);
}

async function entrarComoInvitado(page) {
  await page.click('#btn-guest');
  for (let i = 0; i < 12; i++) {
    if (await page.$('#res-ok:visible')) break;
    const r = await page.waitForSelector('#test-a .answer:visible', { timeout: 15000 }).catch(() => null);
    if (!r) break;
    await r.click(); await espera(250);
  }
  await page.click('#res-ok', { timeout: 15000 });
  await page.waitForSelector('#vil-go:visible', { timeout: 60000 });
  await espera(2500);
}

const captura = (page, nombre) => page.screenshot({ path: path.join(CAPTURAS, nombre + '.png') }).catch(() => {});

// ---- 1. Sin conexión -----------------------------------------------------------------
async function sinRed() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-i-red-'));
  const { proc, page, errores } = await abrir(perfil, [], { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--proxy-server=http://127.0.0.1:9' });
  try {
    const fuera = await page.evaluate(() => fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store' }).then(() => 'hay red', e => 'sin red: ' + e.message));
    ok('sin red de verdad (internet no responde)', fuera.startsWith('sin red'), fuera);
    // Con la nube (el SDK de Firebase de la app): sale «Entrar con Google», que en modo local no sale.
    await espera(1500);
    const nube = await page.evaluate(() => { const b = document.getElementById('btn-google'); return !!b && !b.classList.contains('hidden'); });
    ok('sin red abre la nube igual (SDK de Firebase dentro de la app)', nube, nube ? 'modo nube' : 'modo local');
    await entrarComoInvitado(page);
    ok('sin red se entra como invitado y se llega a la aldea', await page.isVisible('#vil-go'));
    await captura(page, '1-sin-red-aldea');
    // Una partida: Jugar desde «Ir a…».
    await page.click('#vil-go'); await espera(800);
    await page.click('#vil-quick .vq-item.play'); await espera(12000);
    await page.keyboard.press('Escape'); await espera(1200);
    const pausa = await page.isVisible('#scr-pause');
    await captura(page, '1-sin-red-partida');
    ok('sin red se juega una partida (pausa abierta a los 12 s)', pausa);
    // Abandonar y volver a la aldea.
    if (pausa) {
      const salir = await page.$('#btn-quit');
      if (salir) { await salir.click(); await espera(800); const si = await page.$('.ask-scr [data-a=yes]'); if (si) await si.click(); }
      await page.waitForSelector('#vil-go:visible', { timeout: 60000 }).catch(() => {});
      await espera(2000);
      const res = await page.$('#scr-over:not(.hidden) button, #res-ok:visible');
      if (res) { await res.click().catch(() => {}); await espera(3000); }
    }
    // Lo que necesita red: Ranking y Grupo.
    for (const [sitio, scr] of [['rank', 'scr-rank'], ['friends', 'scr-friends']]) {
      await page.waitForSelector('#vil-go:visible', { timeout: 30000 }).catch(() => {});
      await page.click('#vil-go').catch(() => {}); await espera(800);
      await page.click(`#vil-quick [data-vgo="${sitio}"]`).catch(() => {}); await espera(1200);
      // Como invitado no se abre: avisa de que hace falta una cuenta (G.SocialUI.needOnline). Con cuenta, la hoja.
      const txt = await page.evaluate(id => {
        const s = document.getElementById(id), t = document.querySelector('.toast');
        if (s && !s.classList.contains('hidden')) return 'hoja: ' + s.innerText.replace(/\s+/g, ' ').slice(0, 300);
        if (t && t.style.display !== 'none' && t.textContent) return 'aviso: ' + t.textContent;
        return '(nada; a la vista: ' + [...document.querySelectorAll('.scr:not(.hidden), .ask-scr')].map(e => e.id || e.className).join(' ') + ')';
      }, scr);
      await captura(page, `1-sin-red-${sitio}`);
      ok(`sin red: ${sitio === 'rank' ? 'Ranking' : 'Grupo'} avisa o se abre, sin quedarse colgado`, /^(hoja|aviso): \S/.test(txt), txt.slice(0, 160));
      await espera(3500);
      if (txt.startsWith('hoja')) { await page.keyboard.press('Escape'); await espera(1200); }
    }
    // sw.js: la app lo da como 404 a propósito (main.rs: sin service worker en la app).
    const graves = errores.filter(e => !/net::ERR_|Failed to load resource|firestore|Firestore|WebChannel|Could not reach|offline|network|\/sw\.js$|\(404\) was received when fetching the script/i.test(e));
    ok('sin red, sin errores del juego en la consola', graves.length === 0, graves.slice(0, 3).join(' | ') || `${errores.length} avisos de red`);
  } finally { await cerrar(proc); }
}

// ---- 2. Mando primero ---------------------------------------------------------------
// Mando simulado: navigator.getGamepads devuelve uno «standard» y se pulsan sus botones.
const MANDO = `(() => {
  const b = () => ({ pressed: false, value: 0 });
  const p = { index: 0, id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, b), axes: [0, 0, 0, 0] };
  navigator.getGamepads = () => [p, null, null, null];
  window.__mando = { pulsar(i, on) { p.buttons[i] = { pressed: on, value: on ? 1 : 0 }; p.timestamp++; } };
})()`;
async function boton(page, i) {
  await page.evaluate(i => window.__mando.pulsar(i, true), i); await espera(160);
  await page.evaluate(i => window.__mando.pulsar(i, false), i); await espera(350);
}

async function mando() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-i-mando-'));
  let { proc, page } = await abrir(perfil, ['--con-mando']);
  try {
    ok('la app dice que había un mando al abrir', await page.evaluate(() => window.pokeEscritorio.mandoAlAbrir === true));
    await espera(1500);
    const st = await page.evaluate(() => ({ pad: document.body.classList.contains('pad'), foco: (document.querySelector('.pad-focus') || {}).id || (document.querySelector('.pad-focus') ? 'sí' : ''), cursor: getComputedStyle(document.body).cursor }));
    ok('empieza en modo mando sin pulsar nada (selección a la vista, sin cursor)', st.pad && st.foco && st.cursor === 'none', JSON.stringify(st));
    await captura(page, '2-mando-entrada');
    // El mando (simulado) navega: A pulsa lo seleccionado. Se va a «Jugar como invitado» con la cruceta si hace falta.
    await page.evaluate(MANDO);
    for (let i = 0; i < 6 && !(await page.evaluate(() => (document.querySelector('.pad-focus') || {}).id === 'btn-guest')); i++) await boton(page, 13);
    const enInvitado = await page.evaluate(() => (document.querySelector('.pad-focus') || {}).id === 'btn-guest');
    await boton(page, 0);
    await espera(1500);
    const test = await page.isVisible('#test-a .answer');
    ok('con el mando se elige «Jugar como invitado» (cruceta y A)', enInvitado && test, test ? 'sale el test' : 'no avanzó');
    // El ratón quita el modo mando y vuelve el cursor.
    await page.mouse.move(200, 200); await page.mouse.move(260, 240); await espera(400);
    const vuelve = await page.evaluate(() => !document.body.classList.contains('pad') && getComputedStyle(document.body).cursor !== 'none');
    ok('al mover el ratón vuelve el cursor', vuelve);
    // Al test con el ratón y a la aldea.
    for (let i = 0; i < 12; i++) {
      if (await page.$('#res-ok:visible')) break;
      const r = await page.waitForSelector('#test-a .answer:visible', { timeout: 15000 }).catch(() => null);
      if (!r) break;
      await r.click(); await espera(250);
    }
    await page.click('#res-ok', { timeout: 15000 });
    await page.waitForSelector('#vil-go:visible', { timeout: 60000 });
    await espera(2500);
    // «Ir a…» con Start del mando, y «Salir del juego» al final.
    await boton(page, 9); await espera(800);
    const quit = await page.evaluate(() => { const b = document.querySelector('#vil-quick:not(.hidden) [data-vgo="quit"]'); return b ? b.innerText.replace(/\s+/g, ' ') : ''; });
    await captura(page, '2-mando-ir-a');
    ok('«Salir del juego» está en «Ir a…» (abierto con Start)', !!quit, quit);
    await page.evaluate(() => localStorage.setItem('ps.prueba-1-0', 'sigue-aqui'));
    await page.click('#vil-quick [data-vgo="quit"]'); await espera(800);
    await captura(page, '2-mando-salir-pregunta');
    await page.click('.ask-scr [data-a=yes]');
    const t0 = Date.now();
    while (proc.exitCode === null && Date.now() - t0 < 10000) await espera(100);
    let disco = null;
    try { disco = JSON.parse(fs.readFileSync(path.join(perfil, 'guardado', 'partida.json'), 'utf8')); } catch (e) { /* */ }
    ok('«Salir del juego» cierra la app y guarda la partida en disco', proc.exitCode !== null && disco && disco.datos['ps.prueba-1-0'] === 'sigue-aqui',
      `salió en ${Date.now() - t0} ms`);
    // Sin --con-mando (y sin mando de verdad conectado): como siempre.
    ({ proc, page } = await abrir(perfil));
    await espera(1500);
    const normal = await page.evaluate(() => ({ al: window.pokeEscritorio.mandoAlAbrir, pad: document.body.classList.contains('pad') }));
    ok('sin mando al abrir, no hay modo mando', normal.pad === false, `mandoAlAbrir ${normal.al} (true sólo si este PC tiene un mando conectado)`);
  } finally { await cerrar(proc); }
}

// ---- 3. Versión nueva contra un servidor falso ----------------------------------------
function servidorFalso(archivo, huella) {
  const datos = fs.readFileSync(archivo);
  const sha = huella || crypto.createHash('sha256').update(datos).digest('hex');
  const s = http.createServer((q, r) => {
    if (q.url === '/repos/Paulprade05/pokesurvivor/releases/latest') {
      r.writeHead(200, { 'Content-Type': 'application/json' });
      r.end(JSON.stringify({ tag_name: 'win-v99.0.0', draft: false, prerelease: false, assets: [
        { name: 'PokeSurvivor-Windows-Setup.exe', size: datos.length, digest: 'sha256:' + sha, browser_download_url: 'https://no-se-usa.example/x.exe' }] }));
    } else if (q.url === '/Paulprade05/pokesurvivor/releases/download/win-v99.0.0/PokeSurvivor-Windows-Setup.exe') {
      r.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': datos.length });
      // Despacio, para ver la barra.
      let i = 0; const trozo = Math.ceil(datos.length / 40);
      const t = setInterval(() => { if (i >= datos.length) { clearInterval(t); r.end(); return; } r.write(datos.subarray(i, i + trozo)); i += trozo; }, 60);
    } else { r.writeHead(404); r.end(); }
  });
  return new Promise(res => s.listen(0, '127.0.0.1', () => res({ s, url: `http://127.0.0.1:${s.address().port}` })));
}

async function version() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-i-ver-'));
  // Un archivo cualquiera hace de instalador, con una huella que NO es la suya: no se debe instalar.
  const { s, url } = await servidorFalso(EXE, '0'.repeat(64));
  const { proc, page } = await abrir(perfil, ['--actualizaciones=' + url]);
  try {
    // En la entrada (fuera de partida) sale la pregunta, a los ~8 s de abrir.
    const pregunta = await page.waitForSelector('.ask-scr .mcard-txt', { timeout: 40000 }).then(e => e.innerText()).catch(() => '');
    await captura(page, '3-version-aviso');
    ok('avisa de la versión nueva fuera de partida', /versión nueva/.test(pregunta) && /99\.0\.0/.test(pregunta), pregunta.slice(0, 150));
    await page.click('.ask-scr [data-a=yes]');
    let barra = '';
    for (let i = 0; i < 40 && !barra; i++) { await espera(150); barra = await page.evaluate(() => { const d = [...document.querySelectorAll('div[role=status]')].find(e => /Descargando la actualización|Preparando la descarga/.test(e.innerText)); return d ? d.innerText : ''; }); }
    await captura(page, '3-version-descargando');
    ok('«Actualizar ahora» baja la versión con su barra', !!barra, barra.replace(/\s+/g, ' '));
    const fallo = await page.waitForSelector('.ask-scr .mcard-txt', { timeout: 60000 }).then(e => e.innerText()).catch(() => '');
    await captura(page, '3-version-huella-mal');
    ok('si la huella SHA-256 no coincide, no instala y lo dice', /No se pudo actualizar/.test(fallo) && /SHA-256/.test(fallo) && proc.exitCode === null, fallo.slice(0, 160));
    const queda = fs.existsSync(path.join(os.tmpdir(), 'PokeSurvivor-actualizacion')) ? fs.readdirSync(path.join(os.tmpdir(), 'PokeSurvivor-actualizacion')) : [];
    ok('y no deja el archivo bajado', queda.length === 0, queda.join(', ') || 'carpeta vacía');
    ok('sólo se apunta la hora si GitHub (aquí el falso) contesta', fs.existsSync(path.join(perfil, 'ultima-comprobacion.txt')));
  } finally { await cerrar(proc); s.close(); }
}

(async () => {
  if (!fs.existsSync(EXE)) { console.error('Falta ' + EXE); process.exit(2); }
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const solo = process.argv.find(a => /^--(sin-red|mando|version)$/.test(a));
  for (const [n, f] of [['--sin-red', sinRed], ['--mando', mando], ['--version', version]]) {
    if (solo && solo !== n) continue;
    try { await f(); } catch (e) { ok(n.slice(2) + ': sin fallos', false, e.message); }
  }
  const salida = path.join(CAPTURAS, 'resultados.json');
  fs.writeFileSync(salida, JSON.stringify({ fecha: new Date().toISOString(), exe: EXE, resultados }, null, 2));
  const mal = resultados.filter(r => !r.bien).length;
  console.log(mal ? `${mal} pruebas MAL` : 'Todo bien', '→', salida);
  process.exit(mal ? 1 : 0);
})();
