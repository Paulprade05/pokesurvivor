// App de Windows en Rust (desktop-rust/): desde la 0.9.0 es la única app de
// escritorio (la de Electron, desktop/, se quitó). Tiene que presentarse al juego
// con window.pokeEscritorio de siempre, servir en la misma dirección (la clave de
// Firebase sólo acepta ese origen), guardar en la misma carpeta, abrir siempre a
// pantalla completa y publicarse con su versión.
// (Las pruebas de Rust van aparte: cargo test en desktop-rust.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

const cargoVersion = () => source('desktop-rust/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)[1];

test('sólo queda la app de Rust: sin la carpeta de Electron ni su .zip', () => {
  assert.equal(fs.existsSync(path.join(root, 'desktop')), false, 'desktop/ (Electron) quitada');
  assert.match(cargoVersion(), /^\d+\.\d+\.\d+$/);
  assert.ok(fs.existsSync(path.join(root, 'desktop-rust/Cargo.lock')), 'Cargo.lock en git: el workflow compila con --locked');
  assert.ok(fs.existsSync(path.join(root, 'desktop-rust/icono.ico')));
  assert.ok(fs.existsSync(path.join(root, 'desktop-rust/copiar-web.cjs')));
  assert.doesNotMatch(source('desktop-rust/empaquetar.cjs'), /desktop['"/\\]/);
});

test('misma dirección y misma carpeta de guardado de siempre', () => {
  const rs = source('desktop-rust/src/main.rs');
  const origen = 'http://127.0.0.1:39017';
  assert.ok(rs.includes(`const ORIGEN: &str = "${origen}";`));
  assert.ok(source('desktop-rust/src/puente.js').includes(`location.origin !== '${origen}'`));
  assert.ok(source('js/core/db.js').includes('127.0.0.1'), 'el juego acepta 127.0.0.1');
  assert.match(rs, /join\("PokeSurvivor"\)/);
  assert.match(rs, /join\("guardado"\)/);
  assert.match(rs, /"partida\.json"/);
  assert.match(rs, /escritorio\.json/);
});

test('siempre a pantalla completa, sin modo ventana', () => {
  const rs = source('desktop-rust/src/main.rs');
  assert.match(rs, /\.with_fullscreen\(Some\(Fullscreen::Borderless\(None\)\)\)/);
  assert.doesNotMatch(rs, /set_fullscreen\(/, 'nada la saca de pantalla completa');
  assert.doesNotMatch(rs, /pantalla_completa/);
  // En el juego no se ofrece el botón ni el interruptor (G.Settings.desk).
  assert.match(source('js/ui/settings-ui.js'), /function canFull\(\) \{ return !G\.Settings\.desk && /);
});

function puente({ origin = 'http://127.0.0.1:39017', top = true, disco = null, store = {}, info: extra = {} } = {}) {
  const enviados = [], teclas = [];
  const ls = {
    get length() { return Object.keys(store).length; },
    key: i => Object.keys(store)[i], getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
  };
  const ctx = {
    location: { origin }, localStorage: ls, console: { info() {}, warn() {} },
    setInterval() {}, setTimeout() {}, addEventListener: (t, f) => { if (t === 'keydown') teclas.push(f); }, fetch: () => Promise.reject(new Error('sin red')),
    ipc: { postMessage: m => enviados.push(JSON.parse(m)) },
  };
  ctx.window = ctx;
  ctx.top = top ? ctx : {};
  const info = { version: '0.4.0', juego: 'abc', webview2: '157.0.1', gpu: { dispositivos: [], activa: null, varias: false, probableDedicada: null },
    ajustes: { gpuDedicada: true, sinTope: false, pantallaCompleta: true }, mando: false, ...extra };
  const js = source('desktop-rust/src/puente.js').replaceAll('__INFO__', JSON.stringify(info)).replaceAll('__DISCO__', JSON.stringify(disco));
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return { ctx, enviados, store, teclas };
}

test('window.pokeEscritorio sigue con todo lo de antes (sólo se añade, no se quita)', () => {
  const { ctx } = puente();
  const pe = ctx.pokeEscritorio;
  // Lo que exponía la app Electron (desktop/preload.cjs) y lo que añadió la de Rust.
  for (const k of ['esEscritorio', 'plataforma', 'version', 'juego', 'electron', 'chromium', 'gpu', 'ajustes', 'pantallaCompleta', 'contenedor', 'webview2']) {
    assert.ok(k in pe, 'falta ' + k);
  }
  assert.equal(pe.esEscritorio, true);
  assert.equal(pe.plataforma, 'windows');
  assert.equal(pe.version, '0.4.0');
  assert.equal(pe.juego, 'abc');
  assert.equal(pe.contenedor, 'rust');
  assert.equal(typeof pe.pantallaCompleta, 'function');
  assert.ok(Object.isFrozen(pe));
});

test('el juego reconoce la app de Rust como app de escritorio (calidad Máxima)', () => {
  const { ctx } = puente();
  const s = source('js/core/settings.js');
  const desk = s.match(/const DESK = (.+);/)[1];
  assert.equal(vm.runInNewContext(desk, { window: ctx }), true);
});

test('en la app, sin tope de FPS de serie una vez (al ritmo de la pantalla); en la web, 60', () => {
  const ajustes = (store, desk) => {
    const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    const ctx = { localStorage: ls, matchMedia: () => ({ matches: false }), console };
    ctx.window = ctx; ctx.G = {};
    if (desk) ctx.pokeEscritorio = { esEscritorio: true };
    vm.createContext(ctx);
    vm.runInContext(source('js/core/settings.js'), ctx);
    return ctx.G.Settings;
  };
  const viejo = { 'ps.settings': JSON.stringify({ quality: 'max', qDesk: 1, fpsCap: 60, stickV: 2, glV: 1 }) };
  assert.equal(ajustes(viejo, true).get('fpsCap'), 0, 'el 60 guardado de serie pasa a sin tope');
  assert.equal(ajustes({}, true).get('fpsCap'), 0, 'jugador nuevo en la app');
  const s = ajustes(viejo, true); s.set('fpsCap', 60);
  assert.equal(ajustes(viejo, true).get('fpsCap'), 60, 'si luego elige 60, se queda');
  assert.equal(ajustes({}, false).get('fpsCap'), 60, 'en la web, 60 de serie');
});

test('sólo en la página del juego, no en otras webs ni en marcos', () => {
  assert.equal(puente({ origin: 'https://accounts.google.com' }).ctx.pokeEscritorio, undefined);
  assert.equal(puente({ top: false }).ctx.pokeEscritorio, undefined);
});

test('recupera la partida del disco si el navegador está vacío, y no pisa lo que haya', () => {
  const disco = { guardadoEl: '2026-11-14T10:00:00Z', datos: { 'ps.save': '{"oro":5}', 'ps.settings': '{}' } };
  assert.deepEqual({ ...puente({ disco }).store }, disco.datos);
  assert.deepEqual({ ...puente({ disco, store: { 'ps.save': '{"oro":9}' } }).store }, { 'ps.save': '{"oro":9}' });
});

test('pantallaCompleta(), F11 y Alt+Intro no hacen nada; la copia en disco pasa por el puente', () => {
  const { ctx, enviados, teclas } = puente({ store: { a: '1' } });
  ctx.pokeEscritorio.pantallaCompleta();
  let parado = 0;
  for (const e of [{ key: 'F11' }, { key: 'Enter', altKey: true }]) {
    for (const f of teclas) f({ ...e, preventDefault() { parado++; }, stopImmediatePropagation() {} });
  }
  assert.equal(parado, 2, 'F11 y Alt+Intro no llegan al navegador');
  assert.deepEqual(enviados, []);
  const foto = JSON.parse(ctx.__psFoto());
  assert.deepEqual(foto.datos, { a: '1' });
});

test('el workflow compila la app de Rust y sube sólo el instalador y su .zip', () => {
  const y = source('.github/workflows/windows-release.yml');
  assert.match(y, /cargo test --locked/);
  assert.match(y, /desktop-rust\/Cargo\.toml/);
  assert.match(y, /node empaquetar\.cjs "\$ZIP_RUST"/);
  assert.match(y, /ZIP_RUST: PokeSurvivor-Windows-Rust\.zip/);
  assert.match(y, /ARCHIVOS=\("desktop-rust\/dist\/PokeSurvivor-Windows-Setup\.exe" "desktop-rust\/dist\/\$ZIP_RUST"\)/);
  assert.doesNotMatch(y, /npm ci|ZIP_ELECTRON|app\.asar|desktop\//);
  assert.match(source('desktop-rust/empaquetar.cjs'), /PokeSurvivor-Windows-Rust\.zip/);
});

// ---- 1.0 · bloque I: mando primero, actualizar con un clic y jugar sin conexión ----

test('mando primero: la app dice si había un mando al abrir y el juego empieza en modo mando', () => {
  assert.equal(puente().ctx.pokeEscritorio.mandoAlAbrir, false);
  assert.equal(puente({ info: { mando: true } }).ctx.pokeEscritorio.mandoAlAbrir, true);
  assert.match(source('desktop-rust/src/main.rs'), /"mando": o\.con_mando \|\| hay_mando\(\)/);
  const g = source('js/core/gamepad.js');
  assert.match(g, /window\.pokeEscritorio\.mandoAlAbrir \? 0 : -2/);
  // Sin cursor jugando con mando (sólo en la app: lo pone el puente).
  assert.match(source('desktop-rust/src/puente.js'), /body\.pad, body\.pad \* \{ cursor: none !important; \}/);
});

test('modo mando: en la web nada cambia; en la app empieza activo y el ratón lo quita', () => {
  const pad = (desk, eventos) => {
    const ls = {};
    const ctx = { console, performance: { now: () => 1000 }, navigator: { getGamepads: () => [] }, document: { body: { classList: { toggle() {} } }, querySelectorAll: () => [], getElementById: () => null },
      addEventListener: (t, f) => { (ls[t] = ls[t] || []).push(f); }, matchMedia: () => ({ matches: false }) };
    ctx.window = ctx;
    if (desk) ctx.pokeEscritorio = { esEscritorio: true, mandoAlAbrir: true };
    ctx.G = { Settings: { get: () => null, on() {} }, Game: { state: 'playing' }, I18n: { f: s => s } };
    vm.createContext(ctx);
    vm.runInContext(source('js/core/gamepad.js'), ctx);
    for (const [t, e] of eventos || []) for (const f of ls[t] || []) f({ isTrusted: true, ...e });
    ctx.G.Pad.poll(0.016);
    return ctx.G.Pad.active;
  };
  assert.equal(pad(false), false, 'web: sin pulsar nada, no hay modo mando');
  assert.equal(pad(true), true, 'app con mando al abrir: modo mando desde el principio');
  assert.equal(pad(true, [['mousemove', { movementX: 3, movementY: 0 }]]), false, 'al mover el ratón se quita');
});

test('«Salir del juego»: sólo en la app, en «Ir a…», y cierra la app guardando', () => {
  const { ctx, enviados } = puente();
  ctx.pokeEscritorio.salir();
  assert.deepEqual(enviados, [{ t: 'salir' }]);
  const v = source('js/world/village.js');
  assert.match(v, /const QUIT = typeof window !== 'undefined' && window\.pokeEscritorio && typeof window\.pokeEscritorio\.salir === 'function';/);
  assert.match(v, /if \(QUIT\) GROUPS\[GROUPS\.length - 1\]\.items\.push\(\['quit', 'Salir del juego'\]\);/);
  assert.match(source('desktop-rust/src/main.rs'), /Some\("salir"\) => Some\(Evento::Cerrar\)/);
  assert.match(source('js/data/lang-en.js'), /"Salir del juego": "Quit game"/);
});

test('versión nueva: se pregunta fuera de partida y «Actualizar ahora» lo pide a la app', async () => {
  const { ctx, enviados } = puente();
  let pregunta = null, tick = null;
  ctx.setInterval = f => { tick = f; return 1; };
  ctx.clearInterval = () => { tick = null; };
  ctx.document = { querySelector: () => null, body: { appendChild() {} }, createElement: () => ({ setAttribute() {}, style: {}, firstChild: {}, querySelector: () => ({ style: {} }) }) };
  let libre = false;
  ctx.__psNueva({ version: '0.11.0', actual: '0.10.0', clic: true, mb: 76 });
  tick();
  assert.equal(pregunta, null, 'sin el juego cargado no se pregunta');
  // El juego (js/core/updater.js) se conecta con su interfaz; G es privado en la versión compilada.
  ctx.pokeEscritorio.conectar({ libre: () => libre, preguntar: (t, o) => { pregunta = { t, o }; return Promise.resolve(true); }, T: s => s, subir: () => Promise.resolve() });
  tick();
  assert.equal(pregunta, null, 'en plena partida (o comprando) no se pregunta');
  libre = true;
  tick();
  assert.match(pregunta.t, /la 0\.11\.0 \(tienes la 0\.10\.0\)\. Se descarga \(76 MB\)/);
  assert.equal(pregunta.o.yes, 'Actualizar ahora');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(enviados, [{ t: 'actualizar' }]);
  // El juego se conecta desde updater.js, y la plantilla está traducida.
  assert.match(source('js/core/updater.js'), /window\.pokeEscritorio\.conectar\(\{\s+libre: \(\) => !!\(G\.UI && G\.DB\) && safe\(true\),/);
  assert.ok(source('js/data/lang-en.js').includes('"Hay una versión nueva de PokéSurvivor para PC: la {x} (tienes la {x}). Se descarga ({x} MB), se instala sola y el juego vuelve a abrirse. Tu partida se queda."'));
});

test('sin conexión: la app lleva el SDK de Firebase que usa el juego y sube lo pendiente al volver la red', () => {
  const db = source('js/core/db.js');
  const usada = db.match(/firebasejs\/([\d.]+)\//)[1];
  const copia = source('desktop-rust/copiar-web.cjs');
  assert.equal(copia.match(/const SDK_VERSION = '([\d.]+)';/)[1], usada, 'misma versión del SDK en la app y en el juego');
  for (const f of ['app', 'auth', 'firestore', 'database']) assert.match(copia, new RegExp(`'firebase-${f}-compat\.js': '[0-9a-f]{64}'`));
  assert.match(source('desktop-rust/src/main.rs'), /const SDK_FIREBASE: &str = "https:\/\/www\.gstatic\.com\/firebasejs\/";/);
  assert.match(db, /addEventListener\('online', \(\) => \{/);
});
