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
'use strict';
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
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

app.whenReady().then(() => {
  // Sin menú de Electron: así no hay atajos de recargar, zoom, etc. que estorben al jugar.
  Menu.setApplicationMenu(null);
  protocol.handle('http', servir);
  crearVentana();
});

app.on('window-all-closed', () => app.quit());
