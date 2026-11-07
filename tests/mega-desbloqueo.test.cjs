// Versión con mega (07-11-2026, docs/MEGAEVOLUCIONES.md §4): sale en el gacha, por encima de
// Legendaria, y deja comprar la piedra. Quien ya la compró no pierde nada. node tests/mega-desbloqueo.test.cjs
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
      key: () => null, get length() { return 0; } },
    location: { search: '', protocol: 'http:', hostname: 'localhost', href: 'http://localhost/' },
    navigator: { onLine: true, language: 'es' },
    document: { addEventListener() {}, visibilityState: 'visible', hidden: false },
    addEventListener() {}, removeEventListener() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/data/evolutions.js', 'js/data/families.js', 'js/data/megas.js',
    'js/core/db.js', 'js/data/shop.js', 'js/systems/gacha.js']) vm.runInContext(source(f), ctx, { filename: f });
  ctx.G.Sprites = { hasShiny: () => false };
  return ctx;
}
const ctx = boot(), G = ctx.G;
const clone = o => JSON.parse(JSON.stringify(o));
const useSave = save => Object.defineProperty(G.DB, 'save', { get: () => save, configurable: true });
const sv = o => Object.assign({ coins: 50000, tickets: { t1: 100000, t10: 0 }, owned: {}, shiny: {}, stats: {}, pity: {}, pityM: {}, ach: {}, mst: {}, mop: {}, pz: {}, pmg: {} }, o);
const mega = dex => G.MEGA_OF[dex][0];
// Azar fijo para una prueba, y vuelta al de verdad.
function withRandom(v, fn) {
  const real = vm.runInContext('Math.random', ctx);
  ctx.__r = () => v;
  vm.runInContext('Math.random = __r', ctx);
  try { return fn(); } finally { ctx.__r = real; vm.runInContext('Math.random = __r', ctx); }
}

test('todas las megas salen del banner de su región y Galar no tiene ninguna', () => {
  let n = 0;
  for (const b of G.Gacha.BANNERS) for (const id of G.Gacha.megasIn(b.gen)) {
    n++;
    assert.ok(G.Gacha.all(b.gen).some(p => p.dex === G.MEGA[id].dex), G.MEGA[id].name[0]);
  }
  assert.equal(n, Object.keys(G.MEGA).length);
  assert.equal(G.Gacha.megasIn(8).length, 0);
});

test('sin el Pokémon normal no sale, ni cuenta para la garantía', () => {
  const s = sv();
  G.Gacha.debugForceMega(5);
  const r = G.Gacha.pull(s, 1, 1);             // (una sola: en una ×10 el Pokémon puede salir antes)
  G.Gacha.debugForceMega(0);
  assert.ok(r.every(x => !x.mega));
  assert.equal(s.pityM[1] || 0, 0);
  assert.equal(Object.keys(s.mop).length, 0);
});

test('con el Pokémon: da la versión con mega, no la piedra, y no da monedas', () => {
  const s = sv({ owned: { 6: { at: 1 } } }), id = mega(6), coins = s.coins;
  G.Gacha.debugForceMega(1);
  const r = G.Gacha.pull(s, 1, 1);
  assert.deepEqual(clone(r[0]), { dex: 6, mega: id, rarity: 6, shiny: false, isNew: true, refund: 0 });
  assert.ok(s.mop[id]);
  assert.equal(Object.keys(s.mst).length, 0, 'la piedra se compra aparte');
  assert.equal(s.coins, coins);
  assert.equal(s.pity[1], 1, 'cuenta como tirada sin legendaria');
});

test('tasa: 0,5 % entre todas, y nunca menos de 0,1 % cada una', () => {
  const owned = { 6: { at: 1 }, 65: { at: 1 } };          // dos de Kanto
  assert.equal(G.Gacha.megaPool(sv({ owned }), 1).length, 2);
  const hit = (own, v) => withRandom(v, () => !!G.Gacha.pull(sv({ owned: own }), 1, 1)[0].mega);
  assert.equal(hit(owned, 0.0049), true);
  assert.equal(hit(owned, 0.0051), false);
  const one = { 6: { at: 1 } };
  assert.equal(hit(one, 0.0049), true);
  assert.equal(hit(one, 0.0051), false);
  // Con más de 5 posibles manda 0,1 % cada una: ninguna región baja de lo que tenía.
  const all = {};
  for (const id of G.Gacha.megasIn(1)) all[G.MEGA[id].dex] = { at: 1 };
  const n = G.Gacha.megaPool(sv({ owned: all }), 1).length;
  assert.ok(n > 5);
  assert.equal(hit(all, n / 1000 - 0.0001), true);
  assert.equal(hit(all, n / 1000 + 0.0001), false);
  assert.equal(G.Gacha.megaRate(0), 0);
  assert.equal(G.Gacha.megaRate(5), 0.005);
});

test('garantía: a las 1.500 tiradas sin ninguna, y vuelve a cero; no se repite', () => {
  const s = sv({ owned: { 6: { at: 1 } }, pityM: { 1: 1498 } });
  assert.ok(!withRandom(0.5, () => G.Gacha.pull(s, 1, 1))[0].mega);
  const r = withRandom(0.5, () => G.Gacha.pull(s, 1, 1));
  assert.equal(r[0].mega, mega(6));
  assert.equal(s.pityM[1], 0);
  // Ya la tienes: no vuelve a salir y el contador se queda parado.
  G.Gacha.debugForceMega(3);
  assert.ok(G.Gacha.pull(s, 1, 1).every(x => !x.mega));
  G.Gacha.debugForceMega(0);
  assert.equal(s.pityM[1], 0);
});

test('la garantía de legendaria no se pierde si coincide con una mega', () => {
  const s = sv({ owned: { 6: { at: 1 } }, pity: { 1: 68 }, pityM: { 1: 1499 } });
  const r = G.Gacha.pull(s, 1, 1);
  assert.equal(r[0].rarity, 6);
  assert.equal(s.pity[1], 69);
  assert.equal(G.Gacha.pull(s, 1, 1)[0].rarity, 5);
  assert.equal(s.pity[1], 0);
});

test('la tirada ×10: una mega cuenta como Épica o mejor', () => {
  const s = sv({ owned: { 6: { at: 1 } } });
  G.Gacha.debugForceMega(1);
  const r = G.Gacha.pull(s, 10, 1);
  assert.equal(r.length, 10);
  assert.equal(r[0].rarity, 6);
});

test('las tasas de siempre no cambian', () => {
  for (const b of G.Gacha.BANNERS) assert.ok(G.Gacha.ratesFor(b.gen).every(([r]) => r <= 5));
  assert.equal(new Map(G.Gacha.ratesFor(1)).get(5), 1.5);
});

test('legendarios: la misma regla, hay que tener al legendario', () => {
  const m = mega(150);
  assert.ok(!G.Gacha.megaPool(sv(), 1).includes(m));
  assert.ok(G.Gacha.megaPool(sv({ owned: { 150: { at: 1 } } }), 1).includes(m));
});

test('comprar la piedra: hacen falta el Pokémon, la versión con mega y el Aro', () => {
  const id = mega(94), s = sv({ owned: { 94: { at: 1 } }, ach: { rift1: 1 } });
  useSave(s);
  G.DB.commit = () => {};
  const r = G.Shop.buy('mg:' + id);
  assert.equal(r.ok, false);
  assert.match(r.error, /versión con mega/);
  assert.equal(s.coins, 50000);
  s.mop[id] = 1;
  s.ach = {};
  assert.equal(G.Shop.buy('mg:' + id).ok, false, 'sin Aro');
  s.ach.rift1 = 1;
  assert.equal(G.Shop.buy('mg:' + id).ok, true);
  assert.equal(s.coins, 50000 - 7500);
  assert.equal(G.Shop.wears(94), 'mega');
});

test('qué falta: cada paso por su lado', () => {
  const id = mega(94), s = sv({ owned: { 94: { at: 1 } } });
  useSave(s);
  let n = G.Shop.megaNeeds(94);
  assert.deepEqual([n.mon, n.open, n.aro, n.stone], [true, false, false, false]);
  s.mop[id] = 1; s.ach.rift1 = 1;
  n = G.Shop.megaNeeds(94);
  assert.deepEqual([n.mon, n.open, n.aro, n.stone], [true, true, true, false]);
  assert.equal(n.price, 7500);
  assert.equal(n.gen, 1);
  assert.equal(G.Shop.megaNeeds(25), null, 'Pikachu no tiene mega');
});

test('migración: quien compró la piedra la conserva, puede usarla y cuenta como conseguida', () => {
  const id = mega(6), when = 1762400000000;
  const old = { name: 'Red', created: 1, updated: 2, coins: 10, tickets: { t1: 1, t10: 0 }, owned: { 6: { at: 1 } }, ach: { rift1: when },
                mst: { [id]: when }, pz: { 6: when - 1 }, stats: {} };
  const s = G.DB.migrate(clone(old), 'Red');
  assert.equal(s.mst[id], when);
  assert.equal(s.mop[id], when);
  assert.equal(s.coins, 10);
  useSave(s);
  assert.equal(G.Shop.megaOpen(id), true);
  assert.equal(G.Shop.wears(6), 'mega');
  assert.ok(!G.Gacha.megaPool(s, 1).includes(id), 'no gasta una tirada en lo que ya tienes');
  // Y dos veces da lo mismo.
  assert.deepEqual(clone(G.DB.migrate(clone(s), 'Red')).mop, clone(s).mop);
});

test('una mega de una versión más nueva no se borra', () => {
  const s = G.DB.migrate({ name: 'Red', created: 1, updated: 2, coins: 0, tickets: { t1: 0, t10: 0 }, owned: {}, mop: { 99999: 5, 10034: 'x' }, stats: {} }, 'Red');
  assert.equal(s.mop[99999], 5);
  assert.equal(s.mop[10034], undefined, 'pero lo que no es una fecha, sí');
});

test('nube: la versión con mega se une al fusionar, gane el aparato que gane', () => {
  const base = () => G.DB.migrate({ name: 'Red', created: 1, updated: 2, coins: 0, tickets: { t1: 0, t10: 0 }, owned: {}, stats: {} }, 'Red');
  const a = base(), b = base();
  a.mop = { 10034: 100 }; b.mop = { 10037: 200 }; a.updated = 5; b.updated = 9;
  for (const r of [G.DB.merge(clone(a), clone(b)), G.DB.merge(clone(b), clone(a))]) {
    assert.equal(r.mop[10034], 100);
    assert.equal(r.mop[10037], 200);
  }
});
