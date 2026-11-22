// Prueba la app de Windows en Rust como un jugador. No juega partidas (eso es
// medir-perf.cjs con tools/perf.cjs).
//
//   node probar.cjs            prueba dist/PokeSurvivor/PokeSurvivor.exe (node empaquetar.cjs antes)
//   node probar.cjs --debug    prueba target/debug/PokeSurvivor.exe con www/ (node copiar-web.cjs)
// playwright-core: PLAYWRIGHT_CORE=<carpeta node_modules> (npm i --prefix <tmp>/pw playwright-core).
//
// Comprueba: arranca y sale la entrada de invitado; window.pokeEscritorio; la
// calidad Máxima; siempre a pantalla completa (también tras F11); una segunda
// copia no abre otra ventana; al cerrar (WM_CLOSE) copia la partida en disco;
// con el navegador vacío la recupera del disco; el mando (Gamepad API) existe.
// Mide: tiempo hasta la entrada y memoria (el .exe y todos sus procesos hijos) en la aldea.
'use strict';
const path = require('path');
const PW = process.env.PLAYWRIGHT_CORE;
const { chromium } = require(PW ? path.resolve(/playwright-core$/.test(PW) ? PW : path.join(PW, 'playwright-core')) : 'playwright-core');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const DEBUG = process.argv.includes('--debug');
const EXE = DEBUG ? path.join(__dirname, 'target', 'debug', 'PokeSurvivor.exe') : path.join(__dirname, 'dist', 'PokeSurvivor', 'PokeSurvivor.exe');
const WWW = DEBUG ? ['--www=' + path.join(__dirname, 'www')] : [];
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const ok = (nombre, bien, detalle = '') => { resultados.push({ nombre, bien: !!bien, detalle }); console.log(`${bien ? 'OK  ' : 'MAL '} ${nombre}${detalle ? ' — ' + detalle : ''}`); };

// Memoria de un proceso y todos sus hijos (MB de memoria privada).
function memoria(pid) {
  const ps = `$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,PrivatePageCount,Name;
    $ids = @(${pid}); $n = 0; while ($n -ne $ids.Count) { $n = $ids.Count; $ids = @($ids + ($all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object ProcessId) | Select-Object -Unique) }
    $p = $all | Where-Object { $ids -contains $_.ProcessId }; "{0}|{1}" -f [int64](($p | Measure-Object PrivatePageCount -Sum).Sum / 1MB), $p.Count`;
  const [mb, n] = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split('|');
  return { mb: Math.round(+mb), procesos: +n };
}

async function abrir(perfil, extra = []) {
  const puerto = 39300 + Math.floor(Math.random() * 500);
  const t0 = Date.now();
  const proc = spawn(EXE, ['--perfil=' + perfil, '--sin-avisos', '--depuracion=' + puerto, ...WWW, ...extra], { stdio: 'ignore' });
  let browser;
  for (let i = 0; i < 80 && !browser; i++) { await espera(250); browser = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`).catch(() => null); }
  if (!browser) throw new Error('no abrió la depuración');
  let page;
  for (let i = 0; i < 80 && !page; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:39017/'));
    if (!page) await espera(100);
  }
  if (!page) throw new Error('no cargó el juego');
  await page.waitForSelector('#btn-guest', { state: 'visible', timeout: 60000 });
  return { proc, page, browser, arranqueMs: Date.now() - t0 };
}

async function cerrar(proc) {
  try { execFileSync('taskkill', ['/PID', String(proc.pid)], { stdio: 'ignore' }); } catch (e) { /* */ }
  const t0 = Date.now();
  while (proc.exitCode === null && Date.now() - t0 < 8000) await espera(50);
  const ms = proc.exitCode !== null ? Date.now() - t0 : null;
  try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* ya cerrada */ }
  await espera(800);
  return ms;
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
  await espera(6000);
}

(async () => {
  if (!fs.existsSync(EXE)) { console.error('Falta ' + EXE); process.exit(2); }
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-rust-'));
  const medidas = {};
  try {
    // 1. Arranque, invitado, aldea.
    let { proc, page, arranqueMs } = await abrir(perfil);
    medidas.rust = { arranqueMs };
    ok('arranca y sale la entrada de invitado', true, `${arranqueMs} ms`);
    const pe = await page.evaluate(() => JSON.parse(JSON.stringify(window.pokeEscritorio || null)));
    ok('window.pokeEscritorio', pe && pe.esEscritorio === true && pe.plataforma === 'windows' && pe.contenedor === 'rust' && pe.version && pe.juego && pe.gpu && pe.ajustes,
      `versión ${pe && pe.version}, juego ${pe && pe.juego}, WebView2 ${pe && pe.webview2}`);
    ok('mando (Gamepad API)', await page.evaluate(() => typeof navigator.getGamepads === 'function'),
      `${await page.evaluate(() => [...navigator.getGamepads()].filter(Boolean).length)} mandos conectados`);
    ok('página segura (WebRTC, mandos)', await page.evaluate(() => window.isSecureContext));
    await entrarComoInvitado(page);
    const q = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ps.settings') || '{}').quality; } catch (e) { return null; } });
    ok('calidad Máxima elegida sola', q === 'max', String(q));
    const tope = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ps.settings') || '{}').fpsCap; } catch (e) { return null; } });
    ok('sin tope de FPS (al ritmo de la pantalla)', tope === 0, String(tope));
    medidas.rust.memoria = memoria(proc.pid);
    ok('memoria en la aldea', true, `${medidas.rust.memoria.mb} MB en ${medidas.rust.memoria.procesos} procesos`);

    // 2. Siempre a pantalla completa: al abrir y después de F11 y Alt+Intro (no hacen nada).
    const tam = () => page.evaluate(() => [innerWidth, innerHeight, screen.width, screen.height]);
    const pc = await tam();
    await page.keyboard.press('F11'); await espera(1200);
    await page.keyboard.press('Alt+Enter'); await espera(1200);
    const despues = await tam();
    const lleno = t => t[0] === t[2] && t[1] === t[3];
    ok('siempre a pantalla completa (también tras F11 y Alt+Intro)', lleno(pc) && lleno(despues),
      `${pc.slice(0, 2).join('×')} → ${despues.slice(0, 2).join('×')} (pantalla ${pc.slice(2).join('×')})`);
    ok('sin botón de pantalla completa en el juego', await page.evaluate(() => { const b = document.getElementById('btn-full'); return !b || b.classList.contains('hidden'); }));

    // 3. Una segunda copia no abre otra ventana.
    const t0 = Date.now();
    const otra = spawn(EXE, ['--perfil=' + perfil, '--sin-avisos', ...WWW], { stdio: 'ignore' });
    while (otra.exitCode === null && Date.now() - t0 < 8000) await espera(50);
    ok('una sola ventana: la segunda copia se cierra', otra.exitCode !== null && proc.exitCode === null, `salió en ${Date.now() - t0} ms`);
    try { execFileSync('taskkill', ['/PID', String(otra.pid), '/F'], { stdio: 'ignore' }); } catch (e) { /* ya cerrada */ }

    // 4. Al cerrar copia la partida en disco.
    const claves = await page.evaluate(() => localStorage.length);
    const ms = await cerrar(proc);
    let disco = null;
    try { disco = JSON.parse(fs.readFileSync(path.join(perfil, 'guardado', 'partida.json'), 'utf8')); } catch (e) { /* */ }
    ok('al cerrar guarda la partida en disco', ms !== null && disco && Object.keys(disco.datos).length === claves,
      `salió en ${ms} ms, ${disco ? Object.keys(disco.datos).length : 0} de ${claves} claves`);

    // 5. Con el navegador vacío (perfil de WebView2 borrado), la recupera del disco.
    fs.rmSync(path.join(perfil, 'WebView2'), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    ({ proc, page } = await abrir(perfil));
    const recuperadas = await page.evaluate(() => localStorage.length);
    ok('recupera la partida del disco', recuperadas === claves && claves > 0, `${recuperadas} de ${claves} claves`);
    await cerrar(proc);

    // 6. La misma carpeta que usaba la antigua app Electron: quien venía de ella sigue con su partida.
    ok('guarda en la carpeta de siempre', fs.existsSync(path.join(perfil, 'guardado', 'partida.json')) && fs.existsSync(path.join(perfil, 'guardado', 'partida.json.anterior')),
      '%APPDATA%\\PokeSurvivor\\guardado\\partida.json (+ .anterior)');
  } catch (e) {
    ok('sin fallos', false, e.message);
  }

  const salida = path.join(__dirname, 'dist', 'pruebas.json');
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify({ fecha: new Date().toISOString(), exe: EXE, resultados, medidas }, null, 2));
  const mal = resultados.filter(r => !r.bien).length;
  console.log(mal ? `${mal} pruebas MAL` : 'Todo bien', '→', salida);
  process.exit(mal ? 1 : 0);
})();
