// Mundo con casillas de 48 (2.0, cambio de TS): world.js de verdad en vm, con un tiles.js de juguete.
// Que las distancias no cambian (claro del inicio, arena de la grieta y del Juicio) y que el cooperativo
// sabe de qué versión es el mundo (`wv`). 31-10-2026.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadWorld(seed = 1234) {
  const G = {};
  G.U = { clamp: (v, a, b) => (v < a ? a : v > b ? b : v), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2 };
  G.Sprites = { PX: 2 };
  G.Tiles = { T: 16, RAISE: 8, CAP_H: 24, BIOMES: [{ liquid: 'water', grass: ['#0', '#1', '#2'], rock: ['#0', '#1', '#2'] }],
              ARENA_THEMES: { normal: { pillars: 0.05, pools: 0, props: {} }, judgment: { pillars: 0.03, pools: 0, props: {}, clear: 4.5 } } };
  vm.runInContext(source('js/world/world.js'), vm.createContext({ G, Math }), { filename: 'world.js' });
  G.World.reset(seed);
  return G.World;
}

test('world: 48-unit tiles, 768-unit chunks, world version 3 (block 6)', () => {
  const W = loadWorld();
  assert.equal(W.TS, 48);
  assert.equal(W.GS, 3);
  assert.equal(W.CW, 768);
  assert.equal(W.WV, 3);
});

test('world: the same seed gives the same terrain; the starting clearing stays free (≈ 290 units, like before)', () => {
  const hash = W => { let h = 0; for (let y = -1500; y < 1500; y += 48) for (let x = -1500; x < 1500; x += 48) h = (h * 31 + ['floor', 'wall', 'liquid'].indexOf(W.kindAt(x, y))) | 0; return h; };
  assert.equal(hash(loadWorld(77)), hash(loadWorld(77)));
  assert.notEqual(hash(loadWorld(77)), hash(loadWorld(78)));
  for (let s = 1; s <= 15; s++) {
    const W = loadWorld(s * 101);
    for (let a = 0; a < 6.28; a += 0.2) for (let d = 0; d <= 260; d += 20) assert.equal(W.kindAt(Math.cos(a) * d, Math.sin(a) * d), 'floor');
    assert.ok(W.isFree(0, 0, 14));
  }
});

test('world: walls and water cover the same share of the map as with 32 tiles', () => {
  let wall = 0, liq = 0, n = 0;
  for (let s = 1; s <= 4; s++) {
    const W = loadWorld(s * 313);
    for (let y = -3000; y < 3000; y += 48) for (let x = -3000; x < 3000; x += 48) {
      if (Math.hypot(x, y) < 700) continue;
      const k = W.kindAt(x, y); n++;
      if (k === 'wall') wall++; else if (k === 'liquid') liq++;
    }
  }
  // (Con casillas de 32 y de 48, en 12 semillas: 6,9 % de paredes y 7,8 % de líquido, las dos.)
  assert.ok(wall / n > 0.05 && wall / n < 0.09, 'paredes ' + (wall / n).toFixed(3));
  assert.ok(liq / n > 0.055 && liq / n < 0.1, 'líquido ' + (liq / n).toFixed(3));
});

test('world: every seed has a tower, a spring, a locked chest and a chest near the start', () => {
  for (let s = 1; s <= 20; s++) {
    const W = loadWorld(s * 977);
    const got = new Set(W.specialsNear(0, 0, 1300).concat(W.propsInCircle(0, 0, 1300)).map(p => p.type));
    for (const t of ['altar', 'spring', 'bigchest', 'chest']) assert.ok(got.has(t), 'semilla ' + s + ' sin ' + t);
  }
});

test('world: rift arena (r = 11·32/48) keeps its world radius: a closed ring at ~352 and a free corridor', () => {
  const W = loadWorld(5);
  const tx = 6000, ty = 6000, r = 11 * 32 / 48;
  W.setArena({ tx, ty, r, type: 'normal' });
  const cx = tx * 48 + 24, cy = ty * 48 + 24;
  for (let a = 0; a < 6.28; a += 0.05) {
    assert.equal(W.kindAt(cx + Math.cos(a) * 380, cy + Math.sin(a) * 380), 'wall', 'anillo cerrado');
    assert.notEqual(W.kindAt(cx + Math.cos(a) * 300, cy + Math.sin(a) * 300), 'liquid');
  }
  // Pasillo: donde aparecéis (32 al sur) y hacia el norte, libre.
  for (let y = -150; y <= 40; y += 10) assert.ok(W.isFree(cx, cy + y, 14), 'pasillo en ' + y);
});

test('world: Judgment arena (r = 24·32/48 = 16) has the clearing where Arceus lands (160 north)', () => {
  const W = loadWorld(9);
  const tx = -7000, ty = -7000;
  W.setArena({ tx, ty, r: 24 * 32 / 48, type: 'judgment' });
  const cx = tx * 48 + 24, cy = ty * 48 + 24;
  for (let a = 0; a < 6.28; a += 0.3) for (let d = 0; d < 120; d += 20) assert.equal(W.kindAt(cx + Math.cos(a) * d, cy - 160 + Math.sin(a) * d), 'floor');
  for (let a = 0; a < 6.28; a += 0.05) assert.equal(W.kindAt(cx + Math.cos(a) * 820, cy + Math.sin(a) * 820), 'wall');
});

// ---------------- cooperativo: versión del mundo ----------------

test('co-op: the host sends wv in "start"; the guest sends wv with "ready"; neither starts with another version', () => {
  const ui = source('js/ui/social-ui.js'), game = source('js/game.js');
  assert.match(ui, /k: 'rdy', on: ready \? 1 : 0, wv: G\.World\.WV/);
  assert.match(ui, /k: 'start', seed: [^\n]*wv: G\.World\.WV/);
  assert.match(ui, /wvBy\.get\(m\.uid\) !== G\.World\.WV[^\n]*\n\s*if \(odd\.length\) \{[^\n]*return; \}/);
  assert.match(game, /cfg\.wv !== G\.World\.WV\) \{[\s\S]{0,300}leaveRoom\(\)[\s\S]{0,120}return;/);
});

// ---------------- bloque 6: tileset de Mundo Misterioso, terreno limpio y arboledas con paso (01-11-2026) ----------------

function loadTileset(on = true) {
  const G = { Settings: { get: k => (k === 'pmdTiles' ? on : undefined) } };
  G.TILESETS = [{ bi: 0, key: 'forest', src: 'X', vars: [{ file: 'var1.png', cells: [1, 0, 2 ** 47] }], frames: 2, dur: 0.5 }];
  const draws = [];
  const ctx = { drawImage: (...a) => draws.push(a), set imageSmoothingEnabled(v) {} };
  const images = [];
  class Img { set src(v) { this._src = v; images.push(this); } }
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  vm.runInContext(source('js/world/tileset.js'), vm.createContext({ G, Math, Image: Img, document }), { filename: 'tileset.js' });
  return { T: G.Tileset, draws, images };
}

test('tileset: the 256 neighbour masks map onto the 47 DTEF rules (the red cell is never used)', () => {
  const { T } = loadTileset();
  const used = new Set(T.RULE);
  assert.equal(T.RULE.length, 256);
  assert.equal(used.size, 47);
  assert.ok(!used.has(17), 'la casilla roja de la plantilla (columna 5, fila 2) no se usa');
  // Una diagonal sólo cuenta con sus dos cardinales: N+NE sin E es lo mismo que N solo.
  assert.equal(T.RULE[1 | 2], T.RULE[1]);
  assert.notEqual(T.RULE[1 | 2 | 4], T.RULE[1 | 4]);
});

test('tileset: waits for its PNGs, then bakes a chunk (fill + tile per cell) and animates the liquid; off → not ready', () => {
  const { T, draws, images } = loadTileset(true);
  assert.equal(T.ready(0), false, 'cargando');
  assert.equal(images.length, 3, 'hoja, variación y líquido');
  for (const im of images) im.onload();
  assert.equal(T.ready(0), true);
  assert.equal(T.ready(5), false, 'un bioma sin datos: el pintor de siempre');
  const terr = (tx, ty) => (tx === 3 && ty === 3 ? 1 : tx === 5 && ty === 5 ? 2 : 0);
  const cv = T.paintChunk(0, 0, 16, terr, 0, 7);
  assert.ok(cv.pmd);
  assert.equal(draws.length, 256 + 2, 'una por casilla y el suelo debajo de la pared y del agua');
  assert.ok(T.animated(0));
  T.drawLiquid({ drawImage: (...a) => draws.push(a) }, 0, terr, 5, 5, 0, 0, 48, 0.6);
  assert.equal(draws[draws.length - 1][1] >= 6 * 24, true, 'segundo fotograma del líquido');
  assert.equal(loadTileset(false).T.ready(0), false, 'apagado en Ajustes');
});

test('world 6: almost no loose walls (each wall belongs to a 2×2 block) and grove trees always leave a gap', () => {
  let walls = 0, loose = 0;
  for (let s = 1; s <= 4; s++) {
    const W = loadWorld(s * 211);
    const isW = (tx, ty) => W.kindAt(tx * 48 + 1, ty * 48 + 1) === 'wall';
    for (let ty = -50; ty < 50; ty++) for (let tx = -50; tx < 50; tx++) {
      if (!isW(tx, ty)) continue;
      walls++;
      const b = (a, c) => isW(tx + a, ty) && isW(tx, ty + c) && isW(tx + a, ty + c);
      if (!(b(1, 1) || b(1, -1) || b(-1, 1) || b(-1, -1))) loose++;
    }
    // Árboles: nunca dos en casillas vecinas en recto (entre troncos pegados no se pasa).
    const trees = new Set(W.propsInCircle(0, 0, 2400).filter(p => p.type === 'tree').map(p => p.tx + ',' + p.ty));
    for (const k of trees) { const [x, y] = k.split(',').map(Number); assert.ok(!trees.has((x + 1) + ',' + y) && !trees.has(x + ',' + (y + 1)), 'árboles pegados en ' + k); }
  }
  assert.ok(loose / walls < 0.02, 'paredes sueltas ' + (100 * loose / walls).toFixed(1) + ' %');
});
