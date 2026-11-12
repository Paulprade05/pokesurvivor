// PokéSurvivor para Windows: prototipo con Electron (12-11-2026).
//
// La app abre la MISMA versión compilada que GitHub Pages (desktop/www, copiada
// por copiar-web.cjs). Las páginas se sirven desde dentro de la app, sin abrir
// ningún puerto: Electron atiende las peticiones a http://127.0.0.1:39017 él
// mismo. Se usa esa dirección porque el juego y la clave de Firebase ya aceptan
// 127.0.0.1 (js/core/db.js), así la nube y el cooperativo funcionan igual que
// en la web, y porque el navegador la trata como segura (mandos, WebRTC).
//
// Además de la web:
//   - GPU dedicada en portátiles con dos gráficas (--force_high_performance_gpu).
//   - FPS sin tope opcional (--sin-tope o "sinTope" en escritorio.json).
//   - Pantalla completa con F11 o Alt+Intro.
//   - Copia de la partida en disco (%APPDATA%\PokeSurvivor\guardado\), que se
//     recupera sola si el almacenamiento del navegador se vacía.
//   - Al abrir, mira si hay una versión nueva en GitHub Releases y avisa.
//   - window.pokeEscritorio para el juego (versión, GPU, ajustes): ver LEEME.md.
'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const ORIGEN = 'http://127.0.0.1:39017';
const WWW = path.join(__dirname, 'www');
const args = process.argv.slice(1);

// Sólo para pruebas: --perfil=<carpeta> usa un perfil limpio (como un jugador nuevo).
const perfil = args.find(a => a.startsWith('--perfil='));
if (perfil) app.setPath('userData', path.resolve(perfil.slice('--perfil='.length)));

// ---- Ajustes de la app (no del juego) -------------------------------------
// %APPDATA%\PokeSurvivor\escritorio.json, por ejemplo {"sinTope": true}
const AJUSTES_BASE = { gpuDedicada: true, sinTope: false, pantallaCompleta: false };
function leerAjustes() {
  try {
    const f = path.join(app.getPath('userData'), 'escritorio.json');
    return { ...AJUSTES_BASE, ...JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (e) { return { ...AJUSTES_BASE }; }
}
const ajustes = leerAjustes();
if (args.includes('--sin-tope')) ajustes.sinTope = true;
if (args.includes('--gpu-integrada')) ajustes.gpuDedicada = false;
if (args.includes('--pantalla-completa')) ajustes.pantallaCompleta = true;

// Estos interruptores de Chromium tienen que ir antes de que la app arranque.
if (ajustes.gpuDedicada) app.commandLine.appendSwitch('force_high_performance_gpu');
if (ajustes.sinTope) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

// Una sola ventana del juego: si se abre otra vez, se trae la que ya hay.
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('io.github.paulprade05.pokesurvivor');

// ---- Servir el juego desde dentro de la app --------------------------------
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary',
};

async function servir(req) {
  const u = new URL(req.url);
  // El resto de Internet (Firebase, Google, STUN...) sale tal cual.
  if (u.origin !== ORIGEN) return net.fetch(req, { bypassCustomProtocolHandlers: true });
  // Sin service worker: la app ya lleva todo dentro y se actualiza entera.
  if (u.pathname === '/sw.js') return new Response('', { status: 404 });
  let rel;
  try { rel = decodeURIComponent(u.pathname); } catch (e) { return new Response('', { status: 400 }); }
  let f = path.resolve(WWW, '.' + rel);
  if (f !== WWW && !f.startsWith(WWW + path.sep)) return new Response('', { status: 403 });
  try {
    if ((await fs.promises.stat(f)).isDirectory()) f = path.join(f, 'index.html');
    const datos = await fs.promises.readFile(f);
    return new Response(datos, {
      headers: { 'Content-Type': TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' },
    });
  } catch (e) {
    return new Response('404', { status: 404 });
  }
}

// ---- Copia de la partida en disco -----------------------------------------
const CARPETA_GUARDADO = () => path.join(app.getPath('userData'), 'guardado');
const ARCHIVO_GUARDADO = () => path.join(CARPETA_GUARDADO(), 'partida.json');

function esNuestraPagina(e) {
  try { return new URL(e.senderFrame.url).origin === ORIGEN; } catch (err) { return false; }
}

ipcMain.on('ps:leer-guardado', e => {
  if (!esNuestraPagina(e)) { e.returnValue = null; return; }
  try { e.returnValue = JSON.parse(fs.readFileSync(ARCHIVO_GUARDADO(), 'utf8')); }
  catch (err) { e.returnValue = null; }
});

function escribirGuardado(texto) {
  fs.mkdirSync(CARPETA_GUARDADO(), { recursive: true });
  const f = ARCHIVO_GUARDADO(), tmp = f + '.tmp';
  fs.writeFileSync(tmp, texto);
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.anterior');   // la copia de antes, por si acaso
  fs.renameSync(tmp, f);
}

ipcMain.on('ps:guardar', (e, texto) => {
  if (!esNuestraPagina(e) || typeof texto !== 'string' || texto.length > 50e6) return;
  try { escribirGuardado(texto); } catch (err) { console.error('[guardado]', err.message); }
});
// Al cerrar la ventana: la página espera a que esté escrito.
ipcMain.on('ps:guardar-ya', (e, texto) => {
  if (esNuestraPagina(e) && typeof texto === 'string' && texto.length <= 50e6) {
    try { escribirGuardado(texto); } catch (err) { console.error('[guardado]', err.message); }
  }
  e.returnValue = true;
});

// ---- Lo que el juego puede saber de la app (window.pokeEscritorio) ---------
// Se prepara antes de abrir la ventana: preload.cjs lo pide de una vez.
const FABRICANTES = { 0x10de: 'NVIDIA', 0x1002: 'AMD', 0x8086: 'Intel', 0x5143: 'Qualcomm' };
let infoApp = null;

async function prepararInfo() {
  let juego = '';
  try { juego = JSON.parse(fs.readFileSync(path.join(WWW, 'version.json'), 'utf8')).v || ''; } catch (e) { /* sin huella */ }
  let gpu = { dispositivos: [], activa: null, varias: false, probableDedicada: null };
  try {
    const g = await app.getGPUInfo('basic');
    // Fuera el «Adaptador de pantalla básico de Microsoft» (0x1414), que no es una gráfica de verdad.
    const dis = (g.gpuDevice || []).filter(d => d.vendorId && d.vendorId !== 0x1414).map(d => ({
      fabricante: FABRICANTES[d.vendorId] || 'otro', vendorId: d.vendorId, deviceId: d.deviceId, activa: !!d.active,
    }));
    const act = dis.find(d => d.activa) || dis[0] || null;
    // Sólo una pista: NVIDIA siempre es dedicada; Intel casi nunca; AMD puede ser
    // integrada (Ryzen con Radeon) o dedicada, así que con una sola gráfica no se sabe.
    let probable = null;
    if (act && act.fabricante === 'NVIDIA') probable = true;
    else if (act && act.fabricante === 'Intel') probable = false;
    else if (act && dis.length > 1) probable = true;
    gpu = { dispositivos: dis, activa: act, varias: dis.length > 1, probableDedicada: probable };
  } catch (e) { /* sin datos de la GPU */ }
  infoApp = {
    version: app.getVersion(),
    juego,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    gpu,
    ajustes: { gpuDedicada: !!ajustes.gpuDedicada, sinTope: !!ajustes.sinTope, pantallaCompleta: !!ajustes.pantallaCompleta },
  };
}

ipcMain.on('ps:info', e => { e.returnValue = esNuestraPagina(e) ? infoApp : null; });

ipcMain.on('ps:pantalla-completa', e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setFullScreen(!w.isFullScreen());
});

// ---- Ventana ---------------------------------------------------------------
// Inicio de sesión con Google (ventana emergente de Firebase): se deja abrir
// dentro de la app. Cualquier otro enlace se abre en el navegador normal.
const EMERGENTES = [/^https:\/\/accounts\.google\.com\//, /^https:\/\/[a-z0-9-]+\.firebaseapp\.com\/__\/auth\//];

function crearVentana() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 480,
    title: 'PokéSurvivor', icon: path.join(__dirname, 'icono.ico'),
    backgroundColor: '#000000', show: false, autoHideMenuBar: true,
    fullscreen: !!ajustes.pantallaCompleta,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      // Que el juego siga (cooperativo) aunque la ventana quede detrás de otra.
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EMERGENTES.some(r => r.test(url))) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, backgroundColor: '#ffffff' } };
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGEN + '/')) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'F12' && !app.isPackaged) {
      win.webContents.toggleDevTools();
    }
  });

  win.loadURL(ORIGEN + '/index.html');
  return win;
}

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

// ---- ¿Hay versión nueva? ---------------------------------------------------
// La app se reparte en GitHub Releases como PokeSurvivor-Windows.zip, con la
// etiqueta vX.Y.Z = la versión de desktop/package.json. Al abrir (como mucho
// una vez al día) se mira la última; si es más nueva, se avisa y se abre la
// descarga en el navegador. Sin red o sin releases, no pasa nada.
const RELEASES = 'https://api.github.com/repos/Paulprade05/pokesurvivor/releases/latest';
const ARCHIVO = 'PokeSurvivor-Windows.zip';

function masNueva(a, b) {          // ¿la versión a es mayor que b? ('0.10.0' > '0.9.1')
  const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

async function comprobarVersion(win) {
  if (args.includes('--sin-avisos') || !app.isPackaged) return;
  const marca = path.join(app.getPath('userData'), 'ultima-comprobacion.txt');
  try { if (Date.now() - +fs.readFileSync(marca, 'utf8') < 20 * 3600e3) return; } catch (e) { /* primera vez */ }
  try {
    const r = await net.fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
    fs.writeFileSync(marca, String(Date.now()));
    if (!r.ok) return;
    const rel = await r.json();
    const zip = (rel.assets || []).find(a => a.name === ARCHIVO);
    if (!zip || rel.draft || rel.prerelease || !masNueva(rel.tag_name, app.getVersion())) return;
    const es = /^es/i.test(app.getLocale());
    const nueva = String(rel.tag_name).replace(/^v/, '');
    const { response } = await dialog.showMessageBox(win, {
      type: 'info', title: 'PokéSurvivor',
      message: es ? `Hay una versión nueva para PC (${nueva}).` : `A new PC version is available (${nueva}).`,
      detail: es ? `Tienes la ${app.getVersion()}. Descarga el .zip, ciérrala y descomprime la nueva encima: tu partida se queda.`
        : `You have ${app.getVersion()}. Download the .zip, close the game and unzip the new one over it: your save stays.`,
      buttons: es ? ['Descargar', 'Ahora no'] : ['Download', 'Not now'], defaultId: 0, cancelId: 1,
    });
    if (response === 0) shell.openExternal(zip.browser_download_url || `https://github.com/Paulprade05/pokesurvivor/releases/latest/download/${ARCHIVO}`);
  } catch (e) { /* sin red: otra vez será */ }
}

app.whenReady().then(async () => {
  // Sin menú de Electron: así no hay atajos de recargar, zoom, etc. que estorben al jugar.
  Menu.setApplicationMenu(null);
  protocol.handle('http', servir);
  await prepararInfo();
  const win = crearVentana();
  win.webContents.once('did-finish-load', () => setTimeout(() => comprobarVersion(win), 8000));
});

app.on('window-all-closed', () => app.quit());
