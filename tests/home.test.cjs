// Tu choza de la aldea (12-11-2026, data/home.js): piezas con monedas, lo puesto, partidas viejas y la fusión entre
// aparatos (core/db.js). node --test tests/home.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function boot() {
  const store = {};
  const ctx = {
    G: {}, console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } },
    location: { protocol: 'file:', hostname: '', href: 'file:///x', search: '' },
    navigator: { onLine: true, language: 'es' },
    document: { addEventListener() {}, visibilityState: 'visible', hidden: false },
    addEventListener() {}, removeEventListener() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/core/db.js', 'js/data/shop.js', 'js/data/home.js']) vm.runInContext(source(f), ctx, { filename: f });
  return ctx.G;
}
const G = boot();
const H = G.Home;
const migrateOf = s => G.DB.migrate(JSON.parse(JSON.stringify(s)), 't');
function withSave(save) { Object.defineProperty(G.DB, 'save', { get: () => save, configurable: true }); return save; }

test('choza: catálogo con precios del dueño (1000-10000) y una pieza gratis de serie en cada categoría', () => {
  for (const c of H.CATS) {
    for (const it of c.items) assert.ok(it.price === 0 || (it.price >= 1000 && it.price <= 10000), c.id + ':' + it.id);
    if (c.id !== 'pet') assert.equal(c.items[0].price, 0, 'la primera de ' + c.id + ' es la de serie');
    assert.ok(new Set(c.items.map(i => i.id)).size === c.items.length);
  }
  assert.deepEqual([...H.SLOTS], ['shape', 'roof', 'walls', 'color', 'lights', 'deco', 'totem']);
  assert.deepEqual([...Object.keys(H.BY)].sort(), ['color', 'deco', 'lights', 'pet', 'roof', 'shape', 'totem', 'walls']);
});

test('choza: una partida vieja (sin hown ni hset) tiene su choza de serie y no se rompe', () => {
  const old = { v: 3, name: 'viejo', coins: 500, owned: { 25: { at: 1 } }, partner: 25, stats: {} };
  const m = migrateOf(old);
  assert.deepEqual(JSON.parse(JSON.stringify(m.hown)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(m.hset)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(H.current(m))), Object.assign({}, H.DEFAULT, { pet: 0 }));
});

test('choza: comprar cuesta sus monedas, una vez, y luego se pone; sin monedas, no', () => {
  let commits = 0;
  G.DB.commit = () => { commits++; };
  const s = withSave({ coins: 3500, owned: { 25: { at: 1 } }, hown: {}, hset: {} });
  assert.equal(H.owns('shape', 'hut'), true, 'la de serie es tuya');
  assert.equal(H.owns('shape', 'pod'), false);
  assert.equal(H.wear('shape', 'pod'), false, 'no se pone lo que no es tuyo');
  assert.equal(H.buy('shape', 'pod').ok, true);
  assert.equal(s.coins, 500);
  assert.ok(s.hown['shape:pod'] > 0);
  assert.equal(H.buy('shape', 'pod').ok, false, 'dos veces, no');
  assert.equal(s.coins, 500);
  const r = H.buy('shape', 'tree');
  assert.equal(r.ok, false); assert.match(r.error, /monedas/);
  assert.equal(s.coins, 500);
  assert.equal(H.wear('shape', 'pod'), true);
  assert.equal(H.current().shape, 'pod');
  assert.ok(s.hset.at > 0);
  assert.equal(H.wear('shape', 'pod'), false, 'ya la llevas');
  assert.ok(commits >= 2);
});

test('choza: la mascota necesita el cojín y un Pokémon tuyo', () => {
  G.DB.commit = () => {};
  const s = withSave({ coins: 5000, owned: { 25: { at: 1 }, 1: { at: 1 } }, hown: {}, hset: {} });
  assert.equal(H.wear('pet', 25), false, 'sin cojín, no');
  assert.equal(H.buy('pet', 'bed').ok, true);
  assert.equal(s.coins, 1000);
  assert.equal(H.wear('pet', 4), false, 'un Pokémon que no tienes, no');
  assert.equal(H.wear('pet', 1), true);
  assert.equal(H.current().pet, 1);
  assert.equal(H.wear('pet', 0), true, 'se puede quitar');
  assert.equal(H.current().pet, 0);
});

test('choza: lo guardado se limpia (piezas que no existen o gratis, valores raros)', () => {
  const m = migrateOf({ v: 3, name: 'x', coins: 0, owned: { 25: { at: 1 } }, partner: 25, stats: {},
    hown: { 'shape:pod': 5, 'shape:castillo': 3, 'shape:hut': 2, 'roof:solar': 'abc', 'nada': 1 },
    hset: { shape: 'castillo', roof: 'solar', walls: 'metal', pet: 'x', at: 'ayer', raro: 1 } });
  assert.deepEqual(JSON.parse(JSON.stringify(m.hown)), { 'shape:pod': 5 });
  assert.equal(m.hset.shape, undefined);
  assert.equal(m.hset.raro, undefined);
  assert.equal(m.hset.pet, 0);
  // Lo puesto que no es tuyo se ve como el de serie.
  const cur = H.current(m);
  assert.equal(cur.roof, 'leaf'); assert.equal(cur.walls, 'wood'); assert.equal(cur.shape, 'hut');
});

test('choza: al fusionar dos aparatos, las piezas se juntan y gana lo último que se puso', () => {
  const base = { v: 3, name: 'x', coins: 0, owned: { 25: { at: 1 } }, partner: 25, stats: {} };
  const a = migrateOf(Object.assign({}, base, { updated: 100, hown: { 'shape:pod': 1 }, hset: { shape: 'pod', at: 50 } }));
  const b = migrateOf(Object.assign({}, base, { updated: 90, hown: { 'roof:solar': 2 }, hset: { roof: 'solar', at: 80 } }));
  for (const r of [G.DB.merge(a, b), G.DB.merge(b, a)]) {
    assert.deepEqual(Object.keys(r.hown).sort(), ['roof:solar', 'shape:pod']);
    assert.equal(r.hset.roof, 'solar', 'el de at más reciente');
    assert.equal(r.hset.at, 80);
  }
});

test('choza: se ve en la aldea (village3d.js) y se compra en su panel (home-ui.js), sin tocar a Kecleon', () => {
  const v3 = source('js/world/village3d.js'), ui = source('js/ui/home-ui.js'), up = source('js/core/updater.js');
  assert.match(v3, /function setHome\(cfg\)/);
  for (const k of ['pod', 'mush', 'tree']) assert.match(v3, new RegExp("S === '" + k + "'"));
  assert.match(ui, /G\.UI\.ask\(/, 'pregunta antes de comprar (son caras)');
  assert.match(up, /G\.Village && G\.Village\.homeOpen/, 'el actualizador espera mientras compras');
  const dev = source('dev.html');
  assert.ok(dev.includes('js/data/home.js'));
  assert.ok(dev.includes('js/ui/home-ui.js'));
});
