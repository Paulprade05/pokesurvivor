// Choques de la aldea (pulido 12-11-2026, «el personaje atraviesa ciertas cosas»): lo que choca sale de los propios
// modelos 3D (js/world/village3d.js collect / solids, con three.js de verdad y sin WebGL). Aquí se comprueba que:
//   - todo lo que está de pie (carpas, choza, árboles, rocas, tótems, monumento, Flor del Portal...) choca, y lo plano no;
//   - nada está metido en otra cosa;
//   - se llega andando a todas las puertas y a todos los Pokémon de la aldea, sin huecos encerrados, con cualquier choza;
//   - quien acaba metido en algo puede salir (no se queda atascado).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { pathToFileURL } = require('url');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/** Un lienzo de mentira (los modelos pintan sus texturas; aquí no hace falta verlas). */
function fakeCanvas() {
  const ctx = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, fillRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}
  };
  return { width: 1, height: 1, getContext: () => ctx };
}

let world = null;
async function load() {
  if (world) return world;
  const THREE = await import(pathToFileURL(path.join(root, 'js/vendor/three/three.module.min.js')).href);
  const G = { U: { IOS: false, freeCanvas() {} }, Settings: { fx: 2, touch: false }, Icons: { draw() {} }, Tileset: { pal: () => null } };
  const ctx = vm.createContext({ G, Math, JSON, console, document: { createElement: () => fakeCanvas() }, setTimeout: () => 0, clearTimeout() {},
    location: { search: '' }, localStorage: { getItem: () => null, setItem() {} } });
  for (const f of ['js/data/village.js', 'js/data/home.js', 'js/world/village3d.js']) vm.runInContext(read(f), ctx, { filename: f });
  world = { THREE, G, V: G.VILLAGE, V3: G.Village3D };
  return world;
}
const TS = 48;

/** ¿Se tocan dos polígonos convexos? (ejes separadores, con un margen: se pueden rozar) */
function overlap(a, b, tol = 3) {
  for (const P of [a, b]) for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], nx = q[1] - p[1], ny = p[0] - q[0], L = Math.hypot(nx, ny) || 1;
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const v of a) { const d = (v[0] * nx + v[1] * ny) / L; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const v of b) { const d = (v[0] * nx + v[1] * ny) / L; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 - tol <= b0 || b1 - tol <= a0) return false;
  }
  return true;
}
const owner = id => id.split(':').slice(0, 2).join(':');

/** El mundo con unas figuras: choques y lo que se alcanza (como village.js blocked). */
function walker(V, solids) {
  const ix = V.index(solids);
  const blocked = (x, y, r) => {
    for (let ty = Math.floor((y - r) / TS); ty <= Math.floor((y + r) / TS); ty++) for (let tx = Math.floor((x - r) / TS); tx <= Math.floor((x + r) / TS); tx++) {
      if (V.terrainAt(tx, ty) !== 1) continue;
      const cx = Math.max(tx * TS, Math.min(x, tx * TS + TS)), cy = Math.max(ty * TS, Math.min(y, ty * TS + TS));
      if (Math.hypot(cx - x, cy - y) < r) return true;
    }
    return V.hits(ix, x, y, r);
  };
  const m = V.flood((x, y) => !blocked(x, y, 16), V.SPAWN[0] * TS, V.SPAWN[1] * TS, 12);
  const reach = (x, y) => { const cx = Math.floor(x / m.step), cy = Math.floor(y / m.step); return cx >= 0 && cy >= 0 && cx < m.cw && cy < m.ch && !!m.seen[cy * m.cw + cx]; };
  const near = (x, y, d) => { for (let k = 0; k <= d; k += 4) for (let a = 0; a < 6.283; a += 0.4) if (reach(x + Math.cos(a) * k, y + Math.sin(a) * k)) return true; return false; };
  let free = 0, seen = 0;
  for (let i = 0; i < m.seen.length; i++) { if (m.ok[i] === 1) free++; if (m.seen[i]) seen++; }
  return { ix, blocked, reach, near, pockets: free - seen, m };
}

test('choques: todo lo que está de pie choca y lo plano no', async () => {
  const { V, V3, THREE } = await load();
  const { fixed, home } = V3.collect(THREE, null);
  const by = new Map();
  for (const s of fixed) { const k = owner(s.id); by.set(k, (by.get(k) || 0) + 1); }
  for (const p of V.PLACES) if (p.id !== 'home') assert.ok(by.get('p:' + p.id), 'sin choque: ' + p.id);
  assert.ok(home.length > 0, 'tu choza choca');
  assert.ok(fixed.some(s => s.id === 'pond'), 'la charca choca');
  const STAND = ['gtree', 'bulb', 'pylon', 'spring', 'log', 'pod', 'crate', 'rock', 'totem', 'well', 'fence', 'shroom'];
  const FLAT = ['flowers', 'reeds', 'cable', 'fern'];
  V.DECOR.forEach((d, i) => {
    const n = fixed.filter(s => s.id === 'd:' + i + ':' + d.k).length;
    if (STAND.includes(d.k)) assert.ok(n > 0, 'sin choque: ' + d.k + ' en ' + d.x + ',' + d.y);
    else assert.ok(FLAT.includes(d.k), 'decorado sin clasificar: ' + d.k);
    if (FLAT.includes(d.k)) assert.equal(n, 0, d.k + ' es plano: se pisa');
  });
  // La huella es del tamaño de lo que se ve (ni un punto ni media aldea).
  for (const p of V.PLACES) {
    if (p.id === 'home') continue;
    let x0 = 1e9, x1 = -1e9;
    for (const s of fixed) if (owner(s.id) === 'p:' + p.id) for (const [x] of s.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const w = (x1 - x0) / TS;
    assert.ok(w > p.w * 0.45 && w < p.w * 2.2, p.id + ': huella de ' + w.toFixed(2) + ' casillas para un sitio de ' + p.w);
  }
});

test('choques: nada está metido en otra cosa', async () => {
  const { V3, THREE } = await load();
  const { fixed, home } = V3.collect(THREE, null);
  const all = fixed.concat(home), bad = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (owner(a.id) === owner(b.id)) continue;
    if (overlap(a.pts, b.pts)) bad.push(owner(a.id) + ' con ' + owner(b.id));
  }
  assert.deepEqual([...new Set(bad)], []);
});

test('choques: se llega a todas las puertas y a todos los Pokémon, sin huecos encerrados', async () => {
  const { V, V3, THREE } = await load();
  const { fixed, home } = V3.collect(THREE, null);
  const w = walker(V, fixed.concat(home));
  assert.ok(!w.blocked(V.SPAWN[0] * TS, V.SPAWN[1] * TS, 16), 'se aparece en un sitio libre');
  for (const p of V.PLACES) assert.ok(w.near(p.door[0] * TS, p.door[1] * TS, 30), 'no se llega a la puerta de ' + p.id);
  for (const p of V.PLACES) if (p.npc && !p.npc.counter) {
    assert.ok(!w.blocked(p.npc.at[0] * TS, p.npc.at[1] * TS, 12), 'tendero metido en algo: ' + p.npc.dex);
    assert.ok(w.near(p.npc.at[0] * TS, p.npc.at[1] * TS, 40), 'no se llega al tendero ' + p.npc.dex);
  }
  for (const c of V.CAST) {
    if (c.water) continue;
    assert.ok(!w.blocked(c.at[0] * TS, c.at[1] * TS, 12), 'Pokémon metido en algo: ' + c.dex);
    assert.ok(w.near(c.at[0] * TS, c.at[1] * TS, 40), 'no se llega al Pokémon ' + c.dex);
  }
  assert.ok(!w.blocked(V.PET[0] * TS, V.PET[1] * TS, 12), 'el cojín de la mascota está libre');
  // Huecos libres a los que no se llega (entre piezas de una misma cosa): casi ninguno.
  assert.ok(w.pockets <= 12, 'huecos encerrados: ' + w.pockets);
});

test('choques: con cualquier choza se sigue llegando a todo', async () => {
  const { V, V3, THREE, G } = await load();
  const C = G.Home.CATS || [];
  const ids = cat => (C.find(c => c.id === cat) || { items: [] }).items.map(i => i.id);
  const H0 = V.PLACES.find(p => p.id === 'home');
  let n = 0;
  // Cada forma con cada decoración (24), y los tótems repartidos entre ellas: todas las piezas que se ponen fuera.
  const totems = ids('totem');
  for (const shape of ids('shape')) for (const deco of ids('deco')) {
    const totem = totems[n % totems.length];
    const cfg = Object.assign({}, G.Home.DEFAULT, { shape, deco, totem, pet: 25 });
    const { fixed, home } = V3.collect(THREE, cfg);
    const w = walker(V, fixed.concat(home));
    const tag = shape + '/' + deco + '/' + totem;
    assert.ok(w.near(H0.door[0] * TS, H0.door[1] * TS, 30), 'no se llega a tu choza: ' + tag);
    assert.ok(!w.blocked(V.PET[0] * TS, V.PET[1] * TS, 12), 'el cojín queda tapado: ' + tag);
    assert.ok(w.near(V.PET[0] * TS, V.PET[1] * TS, 40), 'no se llega a la mascota: ' + tag);
    for (const s of home) for (const o of fixed) if (overlap(s.pts, o.pts)) assert.fail('tu choza (' + tag + ') se mete en ' + owner(o.id));
    n++;
  }
  assert.ok(n >= 24, 'se han probado ' + n + ' chozas');
});

test('choques: quien está metido en algo puede salir, pero no entrar', async () => {
  const { V } = await load();
  const ix = V.index([{ id: 'x', pts: V.hull([[0, 0], [100, 0], [100, 100], [0, 100]]) }]);
  assert.equal(V.hits(ix, 50, 50, 10), true, 'dentro choca');
  assert.equal(V.hits(ix, 50, 30, 10, [50, 40]), false, 'saliendo hacia el borde: puede');
  assert.equal(V.hits(ix, 50, 50, 10, [50, 40]), true, 'metiéndose más: no');
  assert.equal(V.hits(ix, 50, -20, 10, [50, -30]), false, 'fuera, lejos: libre');
  assert.equal(V.hits(ix, 50, -5, 10, [50, -30]), true, 'fuera, entrando: choca');
});

// (12-11-2026) El borde de la aldea es un bosque de árboles instanciados (village3d.js forestPlan): choca como se ve.
test('bosque del borde: cada casilla de bosque junto a la aldea lleva su planta y ninguna nace en suelo libre', async () => {
  const { V, V3 } = await load();
  for (const k of [0.6, 1, 1.5]) {
    const plan = V3.forestPlan(V, k), byCell = new Set();
    for (const p of plan) {
      const tx = Math.floor(p.x), ty = Math.floor(p.z);
      assert.equal(V.terrainAt(tx, ty), 1, 'planta en suelo libre: ' + p.k + ' en ' + tx + ',' + ty);
      byCell.add(tx + ',' + ty);
      if (ty >= V.H - 3) assert.ok(p.k === 'bush' || p.k === 'shroom', 'abajo del todo sólo plantas bajas (' + p.k + ')');
    }
    const open = (x, y) => x >= 0 && y >= 0 && x < V.W && y < V.H && V.terrainAt(x, y) !== 1;
    for (let ty = 0; ty < V.H; ty++) for (let tx = 0; tx < V.W; tx++) {
      if (V.terrainAt(tx, ty) !== 1) continue;
      let edge = false;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (open(tx + i, ty + j)) edge = true;
      if (edge) assert.ok(byCell.has(tx + ',' + ty), 'casilla de bosque sin árbol junto a la aldea: ' + tx + ',' + ty + ' (densidad ' + k + ')');
    }
    // Más calidad, más árboles.
    if (k > 1) assert.ok(plan.length > V3.forestPlan(V, 1).length * 1.3);
  }
});
