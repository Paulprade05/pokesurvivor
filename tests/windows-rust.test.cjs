// App de Windows en Rust (desktop-rust/): tiene que presentarse al juego igual
// que la app Electron (window.pokeEscritorio), servir en la misma dirección,
// guardar en la misma carpeta y publicarse con la misma versión.
// (Las pruebas de Rust van aparte: cargo test en desktop-rust.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

const cargoVersion = () => source('desktop-rust/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)[1];

test('misma versión que la app Electron (el aviso de versión nueva compara con la etiqueta win-vX.Y.Z)', () => {
  assert.equal(cargoVersion(), JSON.parse(source('desktop/package.json')).version);
  assert.match(cargoVersion(), /^\d+\.\d+\.\d+$/);
  assert.ok(fs.existsSync(path.join(root, 'desktop-rust/Cargo.lock')), 'Cargo.lock en git: el workflow compila con --locked');
});

test('misma dirección y misma carpeta de guardado que la app Electron', () => {
  const rs = source('desktop-rust/src/main.rs');
  const ele = source('desktop/main.cjs');
  const origen = ele.match(/const ORIGEN = '([^']+)'/)[1];
  assert.ok(rs.includes(`const ORIGEN: &str = "${origen}";`));
  assert.ok(source('desktop-rust/src/puente.js').includes(`location.origin !== '${origen}'`));
  assert.match(rs, /join\("PokeSurvivor"\)/);
  assert.match(rs, /join\("guardado"\)/);
  assert.match(rs, /"partida\.json"/);
  assert.match(rs, /escritorio\.json/);
  // El aviso de versión nueva acepta el .zip fijo de Ajustes.
  assert.match(rs, /"PokeSurvivor-Windows\.zip"/);
  assert.match(source('js/ui/windows-dl.js'), /PokeSurvivor-Windows\.zip/);
});

function puente({ origin = 'http://127.0.0.1:39017', top = true, disco = null, store = {} } = {}) {
  const enviados = [];
  const ls = {
    get length() { return Object.keys(store).length; },
    key: i => Object.keys(store)[i], getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
  };
  const ctx = {
    location: { origin }, localStorage: ls, console: { info() {}, warn() {} },
    setInterval() {}, setTimeout() {}, addEventListener() {}, fetch: () => Promise.reject(new Error('sin red')),
    ipc: { postMessage: m => enviados.push(JSON.parse(m)) },
  };
  ctx.window = ctx;
  ctx.top = top ? ctx : {};
  const info = { version: '0.4.0', juego: 'abc', webview2: '157.0.1', gpu: { dispositivos: [], activa: null, varias: false, probableDedicada: null },
    ajustes: { gpuDedicada: true, sinTope: false, pantallaCompleta: false }, comprobar: false };
  const js = source('desktop-rust/src/puente.js').replaceAll('__INFO__', JSON.stringify(info)).replaceAll('__DISCO__', JSON.stringify(disco));
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return { ctx, enviados, store };
}

test('window.pokeEscritorio tiene todo lo de la app Electron (sólo se añade, no se quita)', () => {
  const { ctx } = puente();
  const pe = ctx.pokeEscritorio;
  // Lo que expone desktop/preload.cjs.
  const pre = source('desktop/preload.cjs');
  const campos = [...pre.slice(pre.indexOf("exposeInMainWorld('pokeEscritorio'")).matchAll(/^\s+(\w+)[:,]/gm)].map(m => m[1]);
  assert.ok(campos.length >= 9, campos.join());
  for (const k of campos) assert.ok(k in pe, 'falta ' + k);
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

test('sólo en la página del juego, no en otras webs ni en marcos', () => {
  assert.equal(puente({ origin: 'https://accounts.google.com' }).ctx.pokeEscritorio, undefined);
  assert.equal(puente({ top: false }).ctx.pokeEscritorio, undefined);
});

test('recupera la partida del disco si el navegador está vacío, y no pisa lo que haya', () => {
  const disco = { guardadoEl: '2026-11-14T10:00:00Z', datos: { 'ps.save': '{"oro":5}', 'ps.settings': '{}' } };
  assert.deepEqual({ ...puente({ disco }).store }, disco.datos);
  assert.deepEqual({ ...puente({ disco, store: { 'ps.save': '{"oro":9}' } }).store }, { 'ps.save': '{"oro":9}' });
});

test('pantallaCompleta() y la copia en disco pasan por el puente', () => {
  const { ctx, enviados } = puente({ store: { a: '1' } });
  ctx.pokeEscritorio.pantallaCompleta();
  assert.deepEqual(enviados, [{ t: 'pantalla-completa' }]);
  const foto = JSON.parse(ctx.__psFoto());
  assert.deepEqual(foto.datos, { a: '1' });
});

test('el workflow compila la app de Rust y la publica junto a la de Electron', () => {
  const y = source('.github/workflows/windows-release.yml');
  assert.match(y, /cargo test --locked/);
  assert.match(y, /desktop-rust\/Cargo\.toml/);
  assert.match(y, /node empaquetar\.cjs "\$ZIP_RUST"/);
  assert.match(y, /PRINCIPAL: (electron|rust)/);
  assert.match(y, /PokeSurvivor-Windows-Rust\.zip/);
  assert.match(y, /PokeSurvivor-Windows-Electron\.zip/);
  assert.match(source('desktop-rust/empaquetar.cjs'), /PokeSurvivor-Windows-Rust\.zip/);
});
