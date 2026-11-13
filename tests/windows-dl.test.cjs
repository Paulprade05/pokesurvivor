// «Descargar para Windows» (js/ui/windows-dl.js): sólo en la web en PC con
// Windows, fuera de la app, y sólo si la release de GitHub lleva el archivo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  xbox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edge/44.18363.8131',
};

function boot({ ua = UA.win, uad, protocol = 'https:', desktop = false, fetchImpl } = {}) {
  const store = {}, calls = [];
  const ctx = {
    G: {}, console,
    navigator: { userAgent: ua, userAgentData: uad },
    location: { protocol },
    sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    fetch: (url, opts) => { calls.push(url); return fetchImpl ? fetchImpl(url, opts) : Promise.reject(new Error('sin red')); },
  };
  ctx.window = ctx;
  if (desktop) ctx.pokeEscritorio = { esEscritorio: true };
  vm.createContext(ctx);
  vm.runInContext(source('js/ui/windows-dl.js'), ctx, { filename: 'windows-dl.js' });
  return { W: ctx.G.WindowsDL, calls, store };
}

const release = (over = {}) => ({
  tag_name: 'v0.2.0', draft: false, prerelease: false,
  assets: [{ name: 'PokeSurvivor-Windows.zip', size: 243 * 1048576 }], ...over,
});
const ok = body => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

test('sólo sale en la web en PC con Windows, no en la app, el móvil ni otros sistemas', () => {
  assert.equal(boot().W.isWindowsPC(), true);
  assert.equal(boot({ uad: { platform: 'Windows', mobile: false } }).W.isWindowsPC(), true);
  assert.equal(boot({ desktop: true }).W.isWindowsPC(), false, 'en la app de Windows');
  assert.equal(boot({ protocol: 'file:' }).W.isWindowsPC(), false, 'con doble clic');
  for (const k of ['mac', 'android', 'iphone', 'linux', 'xbox']) assert.equal(boot({ ua: UA[k] }).W.isWindowsPC(), false, k);
  assert.equal(boot({ ua: UA.linux, uad: { platform: 'Windows', mobile: true } }).W.isWindowsPC(), false, 'móvil según userAgentData');
  assert.equal(boot({ ua: UA.win, uad: { platform: 'macOS', mobile: false } }).W.isWindowsPC(), false, 'userAgentData manda');
});

test('enlace fijo a la última release, con el nombre de archivo que hace desktop/empaquetar.cjs', () => {
  const { W } = boot();
  assert.equal(W.URL, 'https://github.com/Paulprade05/pokesurvivor/releases/latest/download/PokeSurvivor-Windows.zip');
  assert.match(source('desktop/empaquetar.cjs'), /PokeSurvivor-Windows\.zip/);
});

test('sin release, sin el archivo, en borrador o sin red: la fila no sale (nada de enlaces rotos)', async () => {
  for (const f of [
    () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }),
    ok(release({ assets: [{ name: 'otra-cosa.zip', size: 1 }] })),
    ok(release({ draft: true })),
    ok(release({ prerelease: true })),
    () => Promise.reject(new Error('sin red')),
    ok(null),
  ]) {
    const { W } = boot({ fetchImpl: f });
    assert.equal(W.can(), false);
    assert.equal(W.unknown(), true);
    const r = await W.check();
    assert.equal(r.ok, false);
    assert.equal(W.can(), false);
    assert.equal(W.unknown(), false, 'ya se sabe: no se vuelve a preguntar');
  }
});

test('con la release publicada sale con versión y tamaño, y se pregunta una sola vez por sesión', async () => {
  const { W, calls, store } = boot({ fetchImpl: ok(release()) });
  const [a, b] = await Promise.all([W.check(), W.check()]);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), { ok: true, version: '0.2.0', mb: 243 });
  assert.equal(a, b);
  assert.equal(W.can(), true);
  await W.check();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls, ['https://api.github.com/repos/Paulprade05/pokesurvivor/releases/latest']);
  assert.ok(store['ps.windl'], 'guardado para la sesión');
});

test('en la app de Windows ni se pregunta a GitHub', () => {
  const { W, calls } = boot({ desktop: true, fetchImpl: ok(release()) });
  assert.equal(W.unknown(), false);
  assert.equal(W.can(), false);
  assert.equal(calls.length, 0);
});

test('Ajustes › Acerca de lleva la fila, con el aviso de SmartScreen, en español e inglés', () => {
  const s = source('js/ui/settings-ui.js');
  assert.match(s, /G\.WindowsDL\.can\(\)/);
  assert.match(s, /Más información» y luego «Ejecutar de todas formas/);
  const en = source('js/data/lang-en.js');
  for (const k of ['Descargar para Windows', 'Descargar']) assert.ok(en.includes(`"${k}":`), k);
  assert.ok(en.includes('Run anyway'));
  const dev = source('dev.html');
  assert.ok(dev.indexOf('js/ui/windows-dl.js') > 0 && dev.indexOf('js/ui/windows-dl.js') < dev.indexOf('js/ui/settings-ui.js'));
});

test('la app de Windows busca el mismo archivo y su versión sigue el formato de las etiquetas', () => {
  const main = source('desktop/main.cjs');
  assert.match(main, /const ARCHIVO = 'PokeSurvivor-Windows\.zip'/);
  assert.match(main, /releases\/latest/);
  assert.match(JSON.parse(source('desktop/package.json')).version, /^\d+\.\d+\.\d+$/);
});

test('la app compara versiones como números (0.10.0 es más nueva que 0.9.1)', () => {
  const main = source('desktop/main.cjs');
  const fn = main.slice(main.indexOf('function masNueva'), main.indexOf('async function comprobarVersion'));
  const masNueva = vm.runInNewContext(`(${fn.trim()})`);
  assert.equal(masNueva('v0.10.0', '0.9.1'), true);
  assert.equal(masNueva('v0.2.0', '0.2.0'), false);
  assert.equal(masNueva('v0.1.9', '0.2.0'), false);
  assert.equal(masNueva('1.0', '0.9.9'), true);
  assert.equal(masNueva('', '0.2.0'), false);
  // Las releases de Windows llevan la etiqueta win-vX.Y.Z (.github/workflows/windows-release.yml).
  assert.equal(masNueva('win-v0.2.1', '0.2.0'), true);
  assert.equal(masNueva('win-v0.2.0', '0.2.0'), false);
  assert.equal(masNueva('win-v0.10.0', '0.9.1'), true);
});

test('etiqueta win-vX.Y.Z: la fila de Ajustes enseña la versión sin el prefijo', async () => {
  const { W } = boot({ fetchImpl: ok(release({ tag_name: 'win-v0.2.0' })) });
  const r = await W.check();
  assert.equal(r.ok, true);
  assert.equal(r.version, '0.2.0');
});

test('el workflow de la release sube el archivo que buscan Ajustes y la app, sin borrador ni prerelease', () => {
  const y = source('.github/workflows/windows-release.yml');
  assert.match(y, /win-v\*/);
  assert.match(y, /workflow_dispatch/);
  assert.match(y, /contents: write/);
  assert.match(y, /PokeSurvivor-Windows\.zip/);
  assert.match(y, /desktop\/package\.json/, 'comprueba que la etiqueta y la versión de la app coinciden');
  assert.doesNotMatch(y, /--draft(?!=false)|--prerelease(?!=false)|secrets\.(?!GITHUB_TOKEN)/);
  assert.doesNotMatch(y, /pages/i, 'no toca GitHub Pages');
});
