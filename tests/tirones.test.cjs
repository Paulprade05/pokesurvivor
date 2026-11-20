// Tirones con muchos enemigos y al entrar en la grieta (2026-11-20). Que no vuelvan los cuellos medidos con tools/perf.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* pixfilter.js en una caja: lienzos de mentira, el reloj (performance.now) y la hora del fotograma (document.timeline) a mano. */
function pixBox() {
  const clock = { now: 0, frame: 0 }, made = [];
  const ctx2d = () => ({ clearRect() {}, drawImage() {}, putImageData() {},
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) });
  const canvas = () => { const c = { width: 0, height: 0, getContext: () => ctx2d() }; made.push(c); return c; };
  const sb = { Math, Map, WeakMap, Int32Array, Uint8ClampedArray, Error, Date,
    ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
    performance: { now: () => clock.now },
    document: { createElement: canvas, timeline: { get currentTime() { return clock.frame; } } },
    G: { U: { IOS: false, freeCanvas: c => { c.width = 0; c.height = 0; } }, Settings: { get: () => true, on() {}, touch: false } } };
  vm.createContext(sb);
  vm.runInContext(read('js/core/pixfilter.js'), sb, { filename: 'pixfilter.js' });
  return { P: sb.G.PixFilter, clock, made };
}

test('filtro «más nítidos»: el tope es por fotograma de la pantalla, no por reloj (no se renueva dentro de un fotograma lento)', () => {
  const { P, clock } = pixBox();
  const img = {};
  clock.frame = 1000;
  let n = 0;
  // 40 sprites nuevos en un fotograma que tarda 200 ms de reloj: antes el tope (18) se renovaba cada 12 ms y salían los 40.
  for (let i = 0; i < 40; i++) { clock.now += 5; if (P.frame(img, i * 8, 0, 8, 8)) n++; }
  assert.ok(n <= 18, 'nuevos en un fotograma: ' + n);
  assert.ok(n >= 1);
  // En el fotograma siguiente vuelve a haber tope.
  clock.frame = 1016.7;
  let m = 0;
  for (let i = 40; i < 50; i++) if (P.frame(img, i * 8, 0, 8, 8)) m++;
  assert.ok(m >= 1, 'el siguiente fotograma también amplía');
  // Lo ya hecho sale de la caché sin gastar tope.
  assert.ok(P.frame(img, 0, 0, 8, 8));
});

test('filtro «más nítidos»: con la caché llena de lo que se está viendo no se echa a nadie (sin vaciarse y rellenarse)', () => {
  const { P, clock } = pixBox();
  const img = {};
  // 3 fotogramas de 660×660 (×3: 15,7 MB cada uno) llenan la caché de 48 MB casi entera.
  for (let i = 0; i < 3; i++) { clock.frame += 17; assert.ok(P.frame(img, i * 700, 0, 660, 660), 'hace el ' + i); }
  assert.equal(P.stats().frames, 3);
  clock.frame += 17;
  assert.equal(P.frame(img, 9000, 0, 660, 660), null, 'llena y todo visto hace nada: sin filtro, nadie fuera');
  assert.equal(P.stats().frames, 3);
  // Pasado 1 s sin verse el más viejo, ya se puede echar.
  clock.frame += 1500;
  assert.ok(P.frame(img, 9000, 0, 660, 660));
  assert.equal(P.stats().frames, 3);
});

test('destello blanco: la caché tampoco se vacía y rellena con una horda, y sin silueta se dibuja el sprite (no un hueco)', () => {
  const src = read('js/core/sprites.js');
  assert.match(src, /if \(over > 0\) for \(const o of whites\.values\(\)\) \{ if \(now - \(o\._u \|\| 0\) < 1000\) return null;/);
  assert.match(src, /if \(whiteLeft-- <= 0\) return null;/);
  assert.match(src, /if \(wc\) ctx\.drawImage\(wc, dx, dy, m\.w \* k, m\.h \* k\);\s*\/\/[^\n]*\n\s*else if \(!opts\.softFlash\)/);
});

test('ruido de las texturas 3D (village3d pn): los mismos números que antes', () => {
  const src = read('js/world/village3d.js');
  const a = src.indexOf('  function pn1('), b = src.indexOf('  /** Lo oscuro de una junta');
  assert.ok(a > 0 && b > a);
  const vil = read('js/data/village.js'), h0 = vil.indexOf('  function hash(x, y, s) {'), h1 = h0 + vil.slice(h0).match(/^[\s\S]*?\n  \}\r?\n/)[0].length;
  const sb = { Math };
  vm.createContext(sb);
  vm.runInContext(vil.slice(h0, h1) + '\nconst H = hash;\n' + src.slice(a, b) + '\nthis.pn = pn; this.H = H;', sb);
  // El de antes (hasta el 20-11-2026), tal cual.
  const H = sb.H;
  function old(x, y, s, seed, per) {
    const one = (k, sd) => {
      const ps = per / k, fx0 = x / k, fy0 = y / k, x0 = Math.floor(fx0), y0 = Math.floor(fy0), tx = fx0 - x0, ty = fy0 - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), m = v => ((v % ps) + ps) % ps;
      const a = H(m(x0), m(y0), sd), b = H(m(x0 + 1), m(y0), sd), c = H(m(x0), m(y0 + 1), sd), d = H(m(x0 + 1), m(y0 + 1), sd);
      return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    };
    return one(s, seed) * 0.6 + one(s / 2, seed + 1) * 0.28 + one(s / 4, seed + 2) * 0.12;
  }
  for (const [s, seed, per] of [[40, 31, 128], [10, 33, 128], [30, 35, 64], [64 / 12, 43, 64], [7.5, 9, 100]]) {
    for (let y = -3; y < 140; y += 7) for (let x = -5; x < 140; x += 3) assert.equal(sb.pn(x, y, s, seed, per), old(x, y, s, seed, per));
  }
});

test('lienzo 3D (ultra3d): sólo crece; begin y render no le cambian el tamaño de otra forma', () => {
  const src = read('js/world/ultra3d.js');
  const line = src.match(/  const grow = \(w, h\) => \{[^\n]*\};/);
  assert.ok(line, 'grow');
  const calls = [];
  const glcv = { width: 1000, height: 600 };
  const grow = new Function('glcv', 'setSz', line[0].trim().replace(/^const grow = /, 'return ') )(glcv, (w, h) => { calls.push([w, h]); glcv.width = w; glcv.height = h; });
  grow(900, 500); assert.deepEqual(calls, [], 'más pequeño: nada');
  grow(1200, 500); assert.deepEqual(calls.pop(), [1200, 600], 'más ancho: sin perder alto');
  grow(800, 1400); assert.deepEqual(calls.pop(), [1200, 1400], 'más alto: sin perder ancho');
  // La única llamada a setSz es la de grow.
  assert.equal((src.match(/setSz\(/g) || []).length, 1);
});

test('grieta: lo del bioma de la arena se prepara en el túnel, a pasos y con tope por fotograma', () => {
  const rift = read('js/systems/rift.js');
  assert.match(rift, /prep: prepSteps\(/);
  assert.match(rift, /function travelTick\(dt\) \{\s*if \(!travel\) return;\s*prepTick\(\);/);
  assert.match(rift, /const PREP_MS = 4;/);
  const ts = read('js/world/tileset.js');
  assert.match(ts, /function prepare\(bi\) \{/);
  assert.match(ts, /floorSheet, \w+|paintChunk, prepare,/);
  // La sombra de los árboles se copia en lienzos que se leen: en la memoria normal (si no, la copia espera a la GPU).
  assert.match(ts, /function treeShade\(bi, look\) \{[\s\S]*?const g = cv\.getContext\('2d', RD\);/);
  const p3 = read('js/world/props3d.js');
  assert.match(p3, /function\* atlasSteps\(B, pal\)/);
  assert.equal((p3.match(/^\s*yield;$/gm) || []).length, 3, 'el atlas, en 4 pasos');
  assert.match(p3, /return \{ init, geo, keyOf, portal, FLORA, free, ORB, prepare,/);
  const u3 = read('js/world/ultra3d.js');
  assert.match(u3, /function prepare\(bi, ms\) \{/);
});

test('tools/perf.cjs: escenas de multitud y lluvia de proyectiles, y los tirones de más de 33 ms', () => {
  const src = read('tools/perf.cjs');
  assert.match(src, /k === 'multitud' \|\| k === 'lluvia'/);
  assert.match(src, /o\.tir33 = gaps\.filter\(g => g > 33\.4\)\.length;/);
  assert.match(src, /--respaldo/);
});
