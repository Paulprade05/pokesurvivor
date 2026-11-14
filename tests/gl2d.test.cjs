// Motor de dibujo WebGL2 (core/gl2d.js, fps-tecnologia, 14-11-2026): detrás de un interruptor, con el Canvas 2D de respaldo.
// Lo que se ve se compara con tools/gl-compara.cjs (navegador); aquí, lo que no necesita GPU.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function settings(stored = {}) {
  const store = { 'ps.settings': JSON.stringify(stored) };
  const sb = { G: {}, JSON, Object, Set, Math, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read('js/core/settings.js'), sb, { filename: 'settings.js' });
  return sb.G.Settings;
}
function gl2d(search, glDraw) {
  const sb = { G: { Settings: { get: k => (k === 'glDraw' ? glDraw : undefined) } }, URLSearchParams, location: { search }, console, Math, Map, Set,
    WeakMap, Object, Array, Float32Array, Uint8Array, Uint16Array, ArrayBuffer, JSON, String, Number, isFinite, queueMicrotask };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read('js/core/gl2d.js'), sb, { filename: 'gl2d.js' });
  return sb.G.GL2D;
}

test('interruptor: apagado de serie; ?gl=1 / ?gl=0 mandan sobre el ajuste', () => {
  assert.equal(settings().get('glDraw'), false);
  assert.equal(gl2d('', false).wanted(), false);
  assert.equal(gl2d('', true).wanted(), true);
  assert.equal(gl2d('?gl=1', false).wanted(), true);
  assert.equal(gl2d('?dev&gl=0', true).wanted(), false);
});

test('sin WebGL2 (o sin pedirlo) no arranca: el juego sigue con el Canvas 2D', () => {
  assert.equal(gl2d('?gl=1', true).create({}), null);
  assert.equal(gl2d('', false).on, false);
  const g = read('js/game.js');
  assert.match(g, /ctx = \(G\.GL2D && G\.GL2D\.create\(cv\)\) \|\| cv\.getContext\('2d'\);/);
  // (El bloom de Máxima, en la GPU sólo con el motor; si no puede, el de siempre.)
  assert.match(g, /if \(G\.GL2D\.bloom\(ctx, bw0, bh0, .*, 0\.34\)\) return;/);
});

test('se carga después de los ajustes y antes del juego, y la fila de Ajustes está en inglés', () => {
  const html = read('dev.html');
  const i = html.indexOf('js/core/settings.js'), j = html.indexOf('js/core/gl2d.js'), k = html.indexOf('js/game.js');
  assert.ok(i > 0 && j > i && k > j, 'orden de scripts');
  assert.match(read('js/ui/settings-ui.js'), /toggle\('glDraw', 'Motor WebGL2 \(pruebas\)'/);
  const en = read('js/data/lang-en.js');
  for (const s of ['Motor WebGL2 (pruebas)', 'El motor de dibujo cambia al recargar la página']) assert.ok(en.includes(JSON.stringify(s) + ':'), 'falta en inglés: ' + s);
});

test('shader: «lighter» en el mismo lote y el 3D de three.js pasado a sRGB', () => {
  const src = read('js/core/gl2d.js');
  assert.match(src, /void main\(\) \{ shade\(\); if \(vR == 1 && o\.a > 0\.0\) o\.rgb = srgb\(clamp\(o\.rgb \/ o\.a, 0\.0, 1\.0\)\) \* o\.a; if \(vR == 2\) o = vec4\(o\.a\); if \(vA == 1\) o\.a = 0\.0; \}/);
  // («lighter» con alfa 0 en el mismo lote, también en las capas: decisión del dueño, 14-11-2026.)
  assert.match(src, /if \(this\.s\.comp === 'lighter'\) \{ setBlend\('source-over'\); addQ = 1; \}/);
  const u3 = read('js/world/ultra3d.js');
  assert.match(u3, /type: T\.HalfFloatType/);
  assert.match(u3, /linear: true/);
});

test('como el Canvas 2D: transformaciones y trazados con NaN o Infinity no hacen nada (si no, se perdía lo de después)', () => {
  const src = read('js/core/gl2d.js');
  assert.match(src, /translate\(x, y\) \{ if \(!\(isFinite\(x\) && isFinite\(y\)\)\) return;/);
  assert.match(src, /scale\(x, y\) \{ if \(!\(isFinite\(x\) && isFinite\(y\)\)\) return;/);
  assert.match(src, /rotate\(r\) \{ if \(!isFinite\(r\)\) return;/);
  assert.match(src, /moveTo\(x, y\) \{ if \(!\(isFinite\(x\) && isFinite\(y\)\)\) return;/);
});
