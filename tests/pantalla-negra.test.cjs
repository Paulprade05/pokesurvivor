// Pantalla negra del iPhone y pantalla de objeto en horizontal (2026-11-06).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/** Un lienzo de mentira: drawImage de uno de tamaño 0 lanza el error de verdad. */
function fakeCanvas(state = {}) {
  const px = new Uint8ClampedArray(4);
  const ctx = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, imageSmoothingEnabled: true,
    save() {}, restore() {}, translate() {}, rotate() {}, fill() {}, stroke() {}, beginPath() {}, rect() {}, arc() {},
    fillRect() { px[3] = 255; }, clearRect() { px[3] = 0; }, putImageData() {},
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData() { return { data: px }; },
    drawImage(src) {
      if (src && (src.width === 0 || src.height === 0)) { const e = new Error('canvas de tamaño 0'); e.name = 'InvalidStateError'; throw e; }
      px[3] = state.blank ? 0 : 255;
    }
  };
  const c = { width: 300, height: 150, getContext: () => ctx };
  ctx.canvas = c;
  return c;
}

function hazards() {
  const G = {
    U: { freeCanvas(c) { c.width = 0; c.height = 0; }, dist2: () => 1e9 },
    Coop: {}, Game: { player: { r: 12 } }, Settings: { get: () => false }
  };
  const sb = vm.createContext({ G, Math, Map, Object, String, parseInt, performance: { now: () => 0 }, Date,
    document: { createElement: () => fakeCanvas() } });
  vm.runInContext(read('js/systems/hazards.js'), sb, { filename: 'hazards.js' });
  return G.Hazards;
}

test('avisos: al pasar el tope de imágenes guardadas no se suelta la que draw() tiene en la mano', () => {
  const H = hazards(), ctx = fakeCanvas().getContext();
  // Muchos colores y tamaños en un solo dibujo: cada aviso pide marca y relleno.
  for (let i = 0; i < 90; i++) H.add({ kind: 'zone', x: 0, y: 0, r: 16, delay: 1, dmg: 0, color: '#' + (i * 99991 & 0xffffff).toString(16).padStart(6, '0') }, true);
  assert.doesNotThrow(() => H.draw(ctx));
  assert.doesNotThrow(() => H.draw(ctx), 'y el dibujo siguiente, tampoco');
});

function util() {
  const made = [], state = { blank: false };
  const sb = vm.createContext({ G: {}, Math, Number, String, JSON, console: { warn() {} }, navigator: { userAgent: '', platform: '', maxTouchPoints: 0 },
    window: {}, document: { createElement: () => { const c = fakeCanvas(state); made.push(c); return c; } } });
  // (util.js crea G en la ventana)
  const src = read('js/core/util.js');
  vm.runInContext('var window = this;' + src, sb, { filename: 'util.js' });
  return { U: sb.G.U || sb.window.G.U, made, state };
}

test('testigo: mira lienzos como los del juego y se entera si se vacían', () => {
  const { U, state } = util();
  assert.equal(U.canvasAlive(), true, 'la primera vez los prepara');
  assert.equal(U.canvasAlive(), true, 'con su dibujo, bien');
  state.blank = true;
  assert.equal(U.canvasAlive(), false, 'vaciados, lo dice');
  state.blank = false;
  assert.equal(U.canvasAlive(), true, 'y prepara otros');
});

test('testigo: no va en la memoria normal (willReadFrequently), donde Safari no vacía', () => {
  const src = read('js/core/util.js');
  const body = src.slice(src.indexOf('canvasAlive()'), src.indexOf('gfxLog('));
  assert.match(body, /\[32, 320\]/);
  assert.match(body, /x = c\.getContext\('2d'\)/, 'los testigos, con el contexto normal');
});

test('viñeta: ya no es un degradado negro guardado que se rellena sobre toda la pantalla', () => {
  const src = read('js/world/world.js'), i = src.indexOf('function drawEdge');
  assert.ok(i > 0);
  assert.match(src.slice(i, i + 1400), /ctx\.drawImage\(e\.cv, 0, 0, w, h\)/);
  assert.doesNotMatch(src, /ctx\.createRadialGradient/);
});

test('el vigilante sale antes del HUD y el rescate, entre fotogramas', () => {
  const src = read('js/game.js');
  const r = src.slice(src.indexOf('function render()'));
  assert.ok(r.indexOf('blackWatch()') > 0 && r.indexOf('blackWatch()') < r.indexOf('G.HUD.draw'), 'mira el mundo sin el HUD');
  assert.ok(src.indexOf('if (rescueDue)') < src.indexOf('function render()'));
});

// (27-11-2026) Ya no hay tope de 760 px en ningún tamaño: desde el bloque B la pantalla de objeto es a pantalla
// completa como sus hermanas, y en PC y tableta el tope la dejaba pegada a la izquierda (tests/objeto-pantalla.test.cjs).
test('pantalla de objeto: sin tope de 760 px (ni en el móvil ni en PC)', () => {
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(css.split('#scr-item > .pick-box').length - 1, 0);
});
