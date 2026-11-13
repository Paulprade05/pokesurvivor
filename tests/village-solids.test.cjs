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

// (13-11-2026, el dueño: «a veces hay elementos en medio y no puedo entrar a los edificios», «me choco con los Pokémon»)
/** El pasillo de una puerta: puntos donde tiene que caber tu Pokémon (r 14), de la puerta hacia el sur. */
function lanePoints(V, p) {
  const out = [];
  for (let dy = 0; dy <= V.DOOR_LANE + 1e-6; dy += 0.25) for (const dx of [-0.3, 0, 0.3]) out.push([(p.door[0] + dx) * TS, (p.door[1] + dy) * TS]);
  return out;
}
/** Desde la plaza (al sur del manantial). */
const PLAZA_AT = V => [V.PLAZA.x * TS, (V.PLAZA.y + V.PLAZA.r - 0.8) * TS];
function walkerFrom(V, solids, at, extra = []) {
  const all = solids.concat(extra), ix = V.index(all);
  const blocked = (x, y, r) => {
    for (let ty = Math.floor((y - r) / TS); ty <= Math.floor((y + r) / TS); ty++) for (let tx = Math.floor((x - r) / TS); tx <= Math.floor((x + r) / TS); tx++) {
      if (V.terrainAt(tx, ty) !== 1) continue;
      const cx = Math.max(tx * TS, Math.min(x, tx * TS + TS)), cy = Math.max(ty * TS, Math.min(y, ty * TS + TS));
      if (Math.hypot(cx - x, cy - y) < r) return true;
    }
    return V.hits(ix, x, y, r);
  };
  const m = V.flood((x, y) => !blocked(x, y, 16), at[0], at[1], 8);
  const reach = (x, y) => { const cx = Math.floor(x / m.step), cy = Math.floor(y / m.step); return cx >= 0 && cy >= 0 && cx < m.cw && cy < m.ch && !!m.seen[cy * m.cw + cx]; };
  const near = (x, y, d) => { for (let k = 0; k <= d; k += 4) for (let a = 0; a < 6.283; a += 0.4) if (reach(x + Math.cos(a) * k, y + Math.sin(a) * k)) return true; return false; };
  return { blocked, reach, near };
}
/** Todas las puertas: el pasillo libre y se llega desde la plaza (hasta un paso de la puerta). → fallos */
function doorsOk(V, solids, tag, extra) {
  const w = walkerFrom(V, solids, PLAZA_AT(V), extra), bad = [];
  for (const p of V.PLACES) {
    // Nada de otro (ni la decoración de tu choza, ni un Pokémon quieto) pisa el pasillo, desde la fachada.
    const x0 = (p.door[0] - V.DOOR_HALF) * TS, x1 = (p.door[0] + V.DOOR_HALF) * TS, y0 = (p.door[1] - 0.55) * TS, y1 = (p.door[1] + V.DOOR_LANE) * TS;
    const lane = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (const s of solids) if (owner(s.id) !== 'p:' + p.id && !(p.id === 'home' && s.id === 'home') && overlap(s.pts, lane, 0)) bad.push(tag + ': ' + owner(s.id) + ' en el pasillo de ' + p.id);
    for (const s of extra || []) if (Math.max(Math.abs(s.x - (x0 + x1) / 2) - (x1 - x0) / 2, s.y < y0 ? y0 - s.y : s.y > y1 ? s.y - y1 : 0) < s.r) bad.push(tag + ': ' + s.id + ' en el pasillo de ' + p.id);
    for (const [x, y] of lanePoints(V, p)) if (w.blocked(x, y, 14)) { bad.push(tag + ': algo tapa la puerta de ' + p.id + ' en ' + (x / TS).toFixed(2) + ',' + (y / TS).toFixed(2)); break; }
    if (!w.near(p.door[0] * TS, p.door[1] * TS, 16)) bad.push(tag + ': no se llega desde la plaza a la puerta de ' + p.id);
    // Y la zona de entrar es generosa: desde el final del pasillo ya se puede entrar.
    if (V.DOOR_LANE * TS > V.ENTER) bad.push('la zona de entrar no llega al final del pasillo');
  }
  return bad;
}

test('puertas: el pasillo hasta cada puerta está libre y se llega desde la plaza, con cualquier choza', async () => {
  const { V, V3, THREE, G } = await load();
  const fixed = V3.collect(THREE, null).fixed;
  const C = G.Home.CATS;
  const ids = cat => C.find(c => c.id === cat).items.map(i => i.id);
  const bad = [];
  let n = 0;
  // Lo que cambia la forma de lo que choca: forma × decoración × tótem (techo, paredes, color y luces sólo pintan).
  for (const shape of ids('shape')) for (const deco of ids('deco')) for (const totem of ids('totem')) {
    const cfg = Object.assign({}, G.Home.DEFAULT, { shape, deco, totem, pet: 25 });
    const { home } = V3.collect(THREE, cfg, true);
    bad.push(...doorsOk(V, fixed.concat(home), shape + '/' + deco + '/' + totem));
    n++;
  }
  assert.equal(n, ids('shape').length * ids('deco').length * ids('totem').length);
  assert.deepEqual([...new Set(bad)].slice(0, 12), []);
});

test('Pokémon de la aldea: sólo chocan los quietos y grandes, con huella pequeña, y ninguno tapa una puerta', async () => {
  const { V, V3, THREE } = await load();
  // Los que se mueven nunca chocan; los quietos pequeños tampoco; los grandes, con una huella de como mucho 16.
  for (const body of [6, 12, 20, 40, 80]) assert.equal(V.npcFoot(false, body), 0, 'uno que se mueve no choca');
  assert.equal(V.npcFoot(true, 10), 0, 'uno quieto y pequeño no choca');
  assert.ok(V.npcFoot(true, 40) > 0 && V.npcFoot(true, 200) <= 16, 'los quietos y grandes, con huella pequeña');
  // Nadie vive en el pasillo de una puerta (ni la mascota), y ningún paseante tiene su pasillo a tiro de paseo sin salir de él:
  // village.js no elige destinos de paseo dentro de un pasillo (doorLane).
  for (const p of V.PLACES) if (p.npc && !p.npc.counter) assert.equal(V.doorLane(p.npc.at[0] * TS, p.npc.at[1] * TS, 12), null, 'el tendero ' + p.npc.dex + ' vive en un pasillo');
  for (const c of V.CAST) assert.equal(V.doorLane(c.at[0] * TS, c.at[1] * TS, 12), null, 'el Pokémon ' + c.dex + ' vive en un pasillo');
  assert.equal(V.doorLane(V.PET[0] * TS, V.PET[1] * TS, 12), null, 'la mascota está en el pasillo de tu choza');
  for (const p of V.PLACES) assert.equal(V.doorLane(p.door[0] * TS, (p.door[1] + 0.5) * TS), p, 'doorLane reconoce el pasillo de ' + p.id);
  // Con los quietos (y la mascota más grande) chocando con su huella, se sigue llegando a todas las puertas y nada te encierra.
  const foot = V.npcFoot(true, 200);
  const still = V.CAST.filter(c => c.still && !c.water).map(c => ({ id: 'npc:' + c.dex, x: c.at[0] * TS, y: c.at[1] * TS, r: foot }));
  still.push({ id: 'npc:pet', x: V.PET[0] * TS, y: V.PET[1] * TS, r: foot });
  const { fixed, home } = V3.collect(THREE, null);
  assert.deepEqual(doorsOk(V, fixed.concat(home), 'con los quietos', still), []);
  const w = walkerFrom(V, fixed.concat(home), PLAZA_AT(V), still);
  for (const s of still) assert.ok(w.near(s.x, s.y, s.r + 30), 'encerrado junto a ' + s.id);
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
