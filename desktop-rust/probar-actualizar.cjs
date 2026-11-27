// Prueba de punta a punta de «actualizar con un clic» sin publicar nada y sin tocar el juego del jugador:
//   1. Instala la versión A (instalador de prueba) en una carpeta temporal.
//   2. Un servidor en 127.0.0.1 hace de GitHub: su «última release» es la B, con su instalador y su SHA-256.
//   3. Abre la A (con %APPDATA% en otra carpeta temporal, así la partida y el perfil de WebView2 son de prueba),
//      apunta un dato en la partida, espera el aviso y pulsa «Actualizar ahora».
//   4. Comprueba que la A se cierra, que el instalador de la B se pone encima en silencio, que el juego vuelve a
//      abrirse solo, que ya es la B y que el dato de la partida sigue ahí. Al final desinstala la de prueba.
//
//   node probar-actualizar.cjs <instalador A> <instalador B> <versión B>
//
// Los instaladores de prueba se hacen con prueba-instalador.cjs (otro AppId: no pisan el PokéSurvivor instalado).
// playwright-core: PLAYWRIGHT_CORE=<carpeta node_modules> (como probar.cjs).
'use strict';
const path = require('path');
const PW = process.env.PLAYWRIGHT_CORE;
const { chromium } = require(PW ? path.resolve(/playwright-core$/.test(PW) ? PW : path.join(PW, 'playwright-core')) : 'playwright-core');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const [SETUP_A, SETUP_B, VERSION_B] = process.argv.slice(2);
if (!SETUP_A || !SETUP_B || !/^\d+\.\d+\.\d+$/.test(VERSION_B || '')) {
  console.error('Uso: node probar-actualizar.cjs <instalador A> <instalador B> <versión B>');
  process.exit(2);
}
const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const ok = (nombre, bien, detalle = '') => { resultados.push({ nombre, bien: !!bien, detalle }); console.log(`${bien ? 'OK  ' : 'MAL '} ${nombre}${detalle ? ' — ' + detalle : ''}`); };
const ps = cmd => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim();
const versionDe = exe => ps(`(Get-Item '${exe}').VersionInfo.ProductVersion`);
const procesosEn = exe => ps(`@(Get-Process PokeSurvivor -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${exe}' } | ForEach-Object Id) -join ','`).split(',').filter(Boolean).map(Number);

function servidor(setup, version) {
  const datos = fs.readFileSync(setup);
  const sha = crypto.createHash('sha256').update(datos).digest('hex');
  const pedidos = [];
  const s = http.createServer((q, r) => {
    pedidos.push(q.url);
    if (q.url === '/repos/Paulprade05/pokesurvivor/releases/latest') {
      r.writeHead(200, { 'Content-Type': 'application/json' });
      r.end(JSON.stringify({ tag_name: 'win-v' + version, draft: false, prerelease: false, assets: [
        { name: 'PokeSurvivor-Windows-Setup.exe', size: datos.length, digest: 'sha256:' + sha, browser_download_url: 'https://no-se-usa.example/x.exe' }] }));
    } else if (q.url === `/Paulprade05/pokesurvivor/releases/download/win-v${version}/PokeSurvivor-Windows-Setup.exe`) {
      r.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': datos.length });
      r.end(datos);
    } else { r.writeHead(404); r.end(); }
  });
  return new Promise(res => s.listen(0, '127.0.0.1', () => res({ s, pedidos, url: `http://127.0.0.1:${s.address().port}` })));
}

async function conectar(puerto) {
  let browser;
  for (let i = 0; i < 160 && !browser; i++) { await espera(250); browser = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`).catch(() => null); }
  if (!browser) throw new Error('no abrió la depuración');
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:39017/'));
    if (!page) await espera(100);
  }
  if (!page) throw new Error('no cargó el juego');
  await page.waitForSelector('#btn-guest', { state: 'visible', timeout: 90000 });
  return { browser, page };
}

(async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-act-'));
  const inst = path.join(raiz, 'PokeSurvivor'), appdata = path.join(raiz, 'appdata'), exe = path.join(inst, 'PokeSurvivor.exe');
  fs.mkdirSync(appdata, { recursive: true });
  const env = { ...process.env, APPDATA: appdata };
  const { s, pedidos, url } = await servidor(SETUP_B, VERSION_B);
  try {
    // 1. La A, instalada como un jugador (sólo para mí), en la carpeta de prueba.
    execFileSync(SETUP_A, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', `/DIR=${inst}`], { stdio: 'ignore' });
    const vA = versionDe(exe);
    ok('instalada la versión A', fs.existsSync(path.join(inst, 'unins000.exe')), `${vA} en ${inst}`);

    // 2-3. Abrirla (como el jugador, sin --perfil) mirando las actualizaciones en el servidor falso.
    const puerto = 39300 + Math.floor(Math.random() * 500);
    const a = spawn(exe, ['--actualizaciones=' + url, '--depuracion=' + puerto], { stdio: 'ignore', env, detached: true });
    const { browser, page } = await conectar(puerto);
    await page.evaluate(() => localStorage.setItem('ps.prueba-actualizar', 'sigue-aqui'));
    const pregunta = await page.waitForSelector('.ask-scr .mcard-txt', { timeout: 40000 }).then(e => e.innerText()).catch(() => '');
    ok('sale el aviso de la versión B', pregunta.includes(VERSION_B), pregunta.slice(0, 140));
    await page.click('.ask-scr [data-a=yes]');
    const t0 = Date.now();
    while (a.exitCode === null && Date.now() - t0 < 120000) await espera(250);
    await browser.close().catch(() => {});
    ok('la A baja la B, guarda y se cierra', a.exitCode !== null, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    ok('la descarga salió de la dirección de la release (no de la que da el API)',
      pedidos.includes(`/Paulprade05/pokesurvivor/releases/download/win-v${VERSION_B}/PokeSurvivor-Windows-Setup.exe`), pedidos.join(' '));

    // 4. El instalador de la B se pone encima y vuelve a abrir el juego.
    let nuevos = [];
    const t1 = Date.now();
    while (!nuevos.length && Date.now() - t1 < 240000) { await espera(1500); nuevos = procesosEn(exe); }
    const vB = fs.existsSync(exe) ? versionDe(exe) : '';
    ok('el juego vuelve a abrirse solo, ya con la B', nuevos.length > 0 && vB.startsWith(VERSION_B), `${vB}, ${((Date.now() - t1) / 1000).toFixed(0)} s tras cerrarse la A`);
    await espera(8000);
    for (const pid of nuevos) { try { execFileSync('taskkill', ['/PID', String(pid)], { stdio: 'ignore' }); } catch (e) { /* */ } }
    for (let i = 0; i < 40 && procesosEn(exe).length; i++) await espera(250);
    let disco = null;
    try { disco = JSON.parse(fs.readFileSync(path.join(appdata, 'PokeSurvivor', 'guardado', 'partida.json'), 'utf8')); } catch (e) { /* */ }
    ok('la partida sigue (copia en disco)', disco && disco.datos['ps.prueba-actualizar'] === 'sigue-aqui');
    // Y en el navegador de la app: se abre la B y se mira.
    const p2 = 39300 + Math.floor(Math.random() * 500);
    const b = spawn(exe, ['--sin-avisos', '--depuracion=' + p2], { stdio: 'ignore', env });
    const c = await conectar(p2);
    const dato = await c.page.evaluate(() => [localStorage.getItem('ps.prueba-actualizar'), window.pokeEscritorio.version]);
    ok('la partida sigue (navegador de la app) y la app dice ser la B', dato[0] === 'sigue-aqui' && dato[1] === VERSION_B, dato.join(' · '));
    await c.browser.close().catch(() => {});
    try { execFileSync('taskkill', ['/PID', String(b.pid)], { stdio: 'ignore' }); } catch (e) { /* */ }
    for (let i = 0; i < 40 && b.exitCode === null; i++) await espera(250);
    const entradas = ps(`@(Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | Where-Object { (Get-ItemProperty $_.PSPath).InstallLocation -like '${inst}*' }).Count`);
    ok('una sola entrada en «Aplicaciones instaladas» (la B encima de la A)', entradas === '1', entradas);
  } catch (e) {
    ok('sin fallos', false, e.message);
  } finally {
    s.close();
    for (const pid of procesosEn(exe)) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* */ } }
    const un = path.join(inst, 'unins000.exe');
    if (fs.existsSync(un)) { try { execFileSync(un, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { stdio: 'ignore' }); } catch (e) { /* */ } }
    await espera(3000);
    ok('desinstalada la de prueba; la partida de prueba sigue', !fs.existsSync(exe) && fs.existsSync(path.join(appdata, 'PokeSurvivor', 'guardado', 'partida.json')));
  }
  const mal = resultados.filter(r => !r.bien).length;
  console.log(mal ? `${mal} pruebas MAL` : 'Todo bien', '·', raiz);
  process.exit(mal ? 1 : 0);
})();
