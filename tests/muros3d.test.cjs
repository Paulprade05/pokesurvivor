// Muros de rocas en 3D y lotes sin saltos (14-11-2026).
//  - El reparto del atlas de lotes (js/world/ultra3d.js pack): ningún lote pisa a otro, todos caben en el lienzo, ninguno pisa las
//    sombras del suelo y, con muchos lotes como en una horda junto a un muro, ninguno se junta con otro (antes se juntaban y se
//    dibujaban en otro orden, o lo de abajo quedaba fuera: «los elementos 3D desaparecen y hacen popup»).
//  - Los montones de rocas (js/world/props3d.js wall0-3 y wallI0-1) se hacen en cada bioma, llenan su casilla sin salirse
//    demasiado y son bajos como una pared.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { pathToFileURL } = require('url');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function ultra3d() {
  const G = { U: { IOS: false }, Settings: { touch: false, fx: 2, get: () => true } };
  const ctx = vm.createContext({ G, Math, Map, Set, Float64Array, Float32Array, localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 0 } });
  vm.runInContext(read('js/world/ultra3d.js'), ctx, { filename: 'ultra3d.js' });
  return G.Ultra3D;
}
function rnd(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
/** Lotes como los de una partida: cajas en la pantalla (px del lienzo 3D), de muros anchos, árboles y rocas. */
function batches(n, Wl, Hl, seed) {
  const r = rnd(seed), out = [];
  for (let i = 0; i < n; i++) {
    const wide = r() < 0.3, w = wide ? 200 + r() * Wl * 0.8 : 40 + r() * 140, h = 30 + r() * (wide ? 120 : 160);
    const x0 = r() * (Wl - 40) - 20, y0 = r() * (Hl - 30) - 10;
    out.push({ objs: [], inst: [], x0, x1: x0 + w, y0, y1: y0 + h });
  }
  return out;
}

test('atlas: sin pisarse, dentro del lienzo y sin juntar lotes en una horda', () => {
  const U = ultra3d(), Wl = 1634, Hl = 920;
  for (const [n, seed] of [[12, 1], [25, 2], [40, 3], [60, 4], [60, 5]]) {
    const list = batches(n, Wl, Hl, seed), cap = 4 * Hl, pk = U._pack(list, Wl, Hl, cap);
    const put = list.filter(b => b.ay >= 0);
    for (const b of put) {
      assert.ok(b.ay >= Hl, 'debajo de las sombras del suelo');
      assert.ok(b.ay + b.h <= cap, 'dentro del lienzo');
    }
    for (let i = 0; i < put.length; i++) for (let j = i + 1; j < put.length; j++) {
      const a = put[i], c = put[j];
      const over = a.x < c.x + c.w && c.x < a.x + a.w && a.ay < c.ay + c.h && c.ay < a.ay + a.h;
      assert.ok(!over, n + ' lotes: el ' + i + ' y el ' + j + ' se pisan en el atlas');
    }
    assert.strictEqual(pk.merged, 0, n + ' lotes: ninguno juntado');
    assert.ok(pk.maxY <= cap);
  }
});

test('atlas: si de verdad no cabe, se junta y sigue dentro del lienzo', () => {
  const U = ultra3d(), Wl = 800, Hl = 450;
  const list = batches(300, Wl, Hl, 9), cap = 2 * Hl, pk = U._pack(list, Wl, Hl, cap);
  assert.ok(pk.merged > 0);
  for (const b of list) if (b.ay >= 0) assert.ok(b.ay + b.h <= cap + 1, 'dentro');
  for (const b of list) if (b.ay < 0 && b.mergedInto) assert.ok(b.mergedInto.ay >= 0, 'lo juntado va con un lote que se dibuja');
});

test('muros de rocas: en cada bioma, de su casilla y bajos', async () => {
  const THREE = await import(pathToFileURL(path.join(root, 'js/vendor/three/three.module.min.js')).href);
  const g2 = { fillRect() {}, drawImage() {}, getContext() { return this; } };
  const fake = () => ({ width: 1, height: 1, getContext: () => g2 });
  const B = (o) => Object.assign({ trunk: ['#5b3a22', '#87582f'], leaf: ['#5ad1e8', '#8fe7f5', '#c8f7ff'], rock: ['#7a818b', '#a1a8b2', '#cbd1d8'], grass: ['#1f7434', '#3a9a42', '#82d266'] }, o);
  const G = { U: { freeCanvas() {} }, Tileset: { pal: () => null },
    Tiles: { BIOMES: [B({ ground: 'grass', prop: 'tree' }), B({ ground: 'stone', prop: 'crystal' }), B({ ground: 'ash', prop: 'dead' }), B({ ground: 'snow', prop: 'crystal' })] } };
  const ctx = vm.createContext({ G, Math, document: { createElement: fake } });
  vm.runInContext(read('js/world/props3d.js'), ctx, { filename: 'props3d.js' });
  G.Props3D.init(THREE, false, () => new THREE.Texture(), { time: { value: 0 } });
  for (let bi = 0; bi < 4; bi++) for (const k of ['wall0', 'wall1', 'wall2', 'wall3', 'wallI0', 'wallI1']) {
    const o = G.Props3D.geo(bi, k);
    assert.ok(o && o.g && (o.hg || k.startsWith('wallI')), k + ' en el bioma ' + bi);
    const bb = o.g.boundingBox;
    assert.ok(bb.min.x > -34 && bb.max.x < 34 && bb.min.y > -34 && bb.max.y < 34, k + ': de su casilla (48) y poco más');
    assert.ok(bb.max.z < 44 && bb.min.z > -8, k + ': bajo como una pared (' + bb.max.z.toFixed(1) + ')');
    assert.ok(o.g.attributes.position.array.every(Number.isFinite));
    // (Las de dentro no dan sombra: no se ven por los lados.)
    assert.strictEqual(o.cast, !k.startsWith('wallI'));
  }
  const tris = G.Props3D.geo(0, 'wall0').g.attributes.position.count / 3;
  assert.ok(tris < 600, 'un montón, menos de 600 triángulos (' + tris + ')');
});
