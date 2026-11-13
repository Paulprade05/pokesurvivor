// Partida en 3D y zoom con la rueda (13-11-2026).
//  - Zoom (js/core/camera.js): acotado a ×0,93–×1,25; con ×1, la escala de siempre; los enemigos salen como con ×1 (casi el
//    mismo anillo, y nunca a la vista) y lo que cuenta para jugar (seesBase) no cambia con el zoom.
//  - Modelos 3D de los objetos (js/world/props3d.js, con three.js de verdad y sin WebGL): todos se hacen, con sus atributos
//    (color, flex, glow) y medidas razonables; qué objeto va en 3D y cuál sigue en pixel art (la hierba, las trampas planas).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { pathToFileURL } = require('url');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function camera(touch = false) {
  const G = { Settings: { touch, get: () => false }, U: { rand: () => 0, damp: (a, b) => b } };
  const ctx = vm.createContext({ G, Math });
  vm.runInContext(read('js/core/camera.js'), ctx, { filename: 'camera.js' });
  return G.Camera;
}

test('zoom: acotado, ×1 con la escala de siempre, y suave hacia lo pedido', () => {
  const C = camera();
  C.resize(1280, 720, 1);
  const s1 = C.scale, w1 = C.w;
  assert.strictEqual(Math.round(s1 * 2 * C.dpr), s1 * 2 * C.dpr, 'con ×1, píxeles enteros');
  C.setZoom(5); assert.strictEqual(C.zoomTo, 1.25);
  C.setZoom(0.1); assert.strictEqual(C.zoomTo, 0.93);
  C.setZoom('x'); assert.strictEqual(C.zoomTo, 1);
  C.setZoom(0.93);
  C.stepZoom(1 / 60);
  assert.ok(C.zoom < 1 && C.zoom > 0.93, 'va poco a poco');
  C.stepZoom(0, true);
  assert.strictEqual(C.zoom, 0.93);
  assert.ok(Math.abs(C.w - w1 / 0.93) < 0.01, 'se ve un 1/0,93 más de ancho');
  assert.strictEqual(C.w1, w1, 'la vista sin zoom no cambia');
});

test('zoom: los enemigos no salen más cerca y lo que cuenta para jugar no cambia', () => {
  const C = camera();
  C.resize(1280, 720, 1);
  const R1 = C.outerRadius();
  C.setZoom(1.25); C.stepZoom(0, true);
  assert.ok(C.w < C.w1);
  assert.strictEqual(C.outerRadius(), R1, 'acercando, el anillo de aparición es el de ×1');
  assert.strictEqual(C.spawnW, C.w1);
  const edge = C.x + C.w1 / 2 + 59;            // dentro de la vista sin zoom (margen 60), fuera de la acercada
  assert.ok(!C.sees(edge, 0) && C.seesBase(edge, 0) && C.seesAny(edge, 0));
  for (const [W, Hh] of [[1280, 720], [932, 430], [430, 932], [1920, 1080]]) {
    // (PC, móvil tumbado y de pie, pantalla grande) Alejando del todo, el anillo casi no cambia y queda fuera de lo que ves.
    const D = camera(W < 1000);
    D.resize(W, Hh, 1);
    const r1 = D.outerRadius();
    D.setZoom(0.93); D.stepZoom(0, true);
    const r = D.outerRadius();
    assert.ok(r >= r1 && r <= r1 * 1.03, W + 'x' + Hh + ': anillo ' + r1.toFixed(0) + ' -> ' + r.toFixed(0));
    assert.ok(r > Math.hypot(D.w, D.h) / 2, 'fuera de lo que se ve');
  }
  C.setZoom(0.93); C.stepZoom(0, true);
  const far = C.x + C.w / 2 - 5;               // se ve con el zoom, pero cae fuera de la vista sin zoom
  assert.ok(C.sees(far, 0, 0) && !C.seesBase(far, 0, 0) && C.seesAny(far, 0, 0));
});

let P3 = null, THREE = null;
async function props3d() {
  if (P3) return P3;
  THREE = await import(pathToFileURL(path.join(root, 'js/vendor/three/three.module.min.js')).href);
  const g2 = { fillRect() {}, drawImage() {}, getContext() { return this; } };
  const fake = () => ({ width: 1, height: 1, getContext: () => g2 });
  const B = (o) => Object.assign({ trunk: ['#5b3a22', '#87582f'], leaf: ['#1d5a2c', '#2e7d36', '#47a043', '#7dca5c'], rock: ['#7a818b', '#a1a8b2', '#cbd1d8'], grass: ['#1f7434', '#3a9a42', '#82d266'], flowers: ['#8fe3ff', '#c9a6ff'] }, o);
  const G = { U: { freeCanvas() {} }, Tileset: { pal: () => null },
    Tiles: { BIOMES: [B({ ground: 'grass', prop: 'tree' }), B({ ground: 'stone', prop: 'crystal' }), B({ ground: 'ash', prop: 'dead' }), B({ ground: 'sand', prop: 'dead', leaf: '#8a6a40', trunk: '#6a4a2a' })] } };
  const ctx = vm.createContext({ G, Math, document: { createElement: fake } });
  vm.runInContext(read('js/world/props3d.js'), ctx, { filename: 'props3d.js' });
  G.Props3D.init(THREE, false, cv => new THREE.Texture(), { time: { value: 0 } });
  return (P3 = G.Props3D);
}
const prop = (type, o = {}) => Object.assign({ type, look: 0, kind: 0, used: false, charge: 1, tx: 3, ty: 4 }, o);

test('3D: qué va en 3D y qué sigue en pixel art', async () => {
  const P = await props3d();
  assert.strictEqual(P.keyOf(prop('tree'), 0), 'tree0');
  assert.strictEqual(P.keyOf(prop('tree', { look: 1 }), 0), 'tree1');
  assert.strictEqual(P.keyOf(prop('tree'), 1), 'crystal');
  assert.strictEqual(P.keyOf(prop('tree'), 2), 'basalt', 'en el volcán, agujas de basalto');
  assert.strictEqual(P.keyOf(prop('tree'), 3), 'dead');
  assert.strictEqual(P.keyOf(prop('grass'), 0), null, 'la hierba alta, en pixel art (el dueño)');
  assert.strictEqual(P.keyOf(prop('trap', { kind: 2 }), 0), 'boom');
  assert.strictEqual(P.keyOf(prop('trap', { kind: 0 }), 0), null, 'el charco y la telaraña, planos');
  assert.strictEqual(P.keyOf(prop('trap', { kind: 1 }), 0), null);
  assert.strictEqual(P.keyOf(prop('altar', { kind: 2 }), 0), 'altar2');
  assert.strictEqual(P.keyOf(prop('altar', { used: true }), 0), 'altarU');
  assert.strictEqual(P.keyOf(prop('spring'), 0), 'spring');
  assert.strictEqual(P.keyOf(prop('spring', { charge: 0 }), 0), 'springD');
  for (const t of ['rock', 'chest', 'bigchest']) assert.strictEqual(P.keyOf(prop(t), 0), null, t + ': los hace ultra3d.js');
  assert.deepStrictEqual(Object.values(P.FLORA).sort(), ['fcrystal', 'fshroom']);
});

test('3D: todos los modelos se hacen, con sus atributos y medidas razonables', async () => {
  const P = await props3d();
  const keys = ['tree0', 'tree1', 'dead', 'crystal', 'basalt', 'altar0', 'altar1', 'altar2', 'altar3', 'altarU', 'spring', 'springD', 'boom', 'fshroom', 'fcrystal'];
  for (const bi of [0, 1, 2, 3]) for (const k of keys) {
    const o = P.geo(bi, k);
    assert.ok(o && o.g, k + ' en el bioma ' + bi);
    for (const a of ['position', 'normal', 'uv', 'color', 'flex', 'glow']) assert.ok(o.g.attributes[a], k + ': ' + a);
    const p = o.g.attributes.position.array;
    assert.ok(p.every(Number.isFinite), k + ': posiciones finitas');
    const bb = o.g.boundingBox;
    assert.ok(bb.min.z > -6 && bb.max.z < o.h * 1.35 + 4, k + ': de pie en el suelo (la base algo hundida) y de su alto (' + bb.max.z.toFixed(1) + ')');
    assert.ok(Math.max(-bb.min.x, bb.max.x) < o.w * 1.6 + 6, k + ': de su ancho');
    if (o.hg) assert.strictEqual(o.hg.attributes.position.count, o.g.attributes.position.count);
    assert.strictEqual(P.geo(bi, k), o, 'se guarda (no se rehace cada vez)');
  }
  assert.strictEqual(P.geo(0, 'nada'), null);
  const pt = P.portal(0);
  assert.ok(pt && pt.obj.children.length === 2, 'el portal: esquirlas y remolino');
  pt.set(0, 0.5);
  pt.dispose();
  P.free(false);
});
