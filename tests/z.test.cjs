// Movimientos Z por Pokémon (24-10-2026): la regla (data/shop.js, zState), la compra
// de la Pulsera Z y cómo se guarda (core/db.js: fusión entre aparatos y el regalo a
// quien ya tenía cristales). node tests/z.test.cjs
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
  for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/core/db.js', 'js/data/shop.js']) vm.runInContext(source(f), ctx, { filename: f });
  return ctx.G;
}
const G = boot();
const mv = (...types) => types.map((type, i) => ({ id: 'm' + i, type }));

test('zState: 2 ataques del tipo del cristal y la Pulsera Z', () => {
  const save = { zc: { fire: 1, water: 1 }, pz: { 6: 1 } };
  Object.defineProperty(G.DB, 'save', { get: () => save, configurable: true });
  assert.equal(G.Shop.ringHas(6), true);
  assert.equal(G.Shop.ringHas(25), false);
  // 0 y 1 ataque: apagado, con la pista del más cercano.
  let s = G.Shop.zState(6, mv('normal'), ['fire', 'flying']);
  assert.equal(s.type, null); assert.equal(s.need, 'fire'); assert.equal(s.needN, 0);
  s = G.Shop.zState(6, mv('water', 'normal'), ['fire', 'flying']);
  assert.equal(s.type, null); assert.equal(s.need, 'water'); assert.equal(s.needN, 1);
  // 2 de un tipo con cristal: listo.
  s = G.Shop.zState(6, mv('fire', 'normal', 'fire'), ['fire']);
  assert.equal(s.type, 'fire'); assert.equal(s.n, 2);
  // 2 de un tipo SIN cristal: no.
  s = G.Shop.zState(6, mv('grass', 'grass'), ['fire']);
  assert.equal(s.type, null);
  // Varios: el de más ataques; si empatan, el del ataque que aprendiste antes.
  s = G.Shop.zState(6, mv('water', 'fire', 'fire', 'water', 'fire'), []);
  assert.equal(s.type, 'fire'); assert.equal(s.n, 3);
  s = G.Shop.zState(6, mv('water', 'fire', 'fire', 'water'), []);
  assert.equal(s.type, 'water');
  // Sin cristales: sin pista de tipo.
  save.zc = {};
  s = G.Shop.zState(6, mv('fire', 'fire'), ['fire']);
  assert.equal(s.type, null); assert.equal(s.need, null);
  assert.equal(s.have.length, 0);
});

test('comprar la Pulsera Z: un Pokémon tuyo, una vez, con monedas', () => {
  let commits = 0;
  const save = { coins: 3500, owned: { 25: { at: 1 } }, zc: {}, pz: {} };
  Object.defineProperty(G.DB, 'save', { get: () => save, configurable: true });
  const commit = G.DB.commit;
  G.DB.commit = () => { commits++; };
  try {
    assert.equal(G.Shop.buy('zr:150').ok, false);                  // no lo tienes
    assert.equal(G.Shop.buy('zr:25').ok, true);
    assert.ok(save.pz[25] > 0); assert.equal(save.coins, 3500 - G.Shop.RING_PRICE); assert.equal(commits, 1);
    assert.equal(G.Shop.buy('zr:25').ok, false);                   // ya la lleva
    save.owned[6] = { at: 1 };
    assert.equal(G.Shop.buy('zr:6').error, 'No tienes Pokémonedas suficientes.');
    assert.equal(save.coins, 500);
  } finally { G.DB.commit = commit; }
});

test('fusión entre aparatos: las Pulseras Z se juntan y no se pierden', () => {
  const a = { updated: 2, coins: 0, tickets: { t1: 0, t10: 0 }, owned: { 25: { at: 1 }, 6: { at: 1 } }, shiny: {}, stats: {}, upgrades: {}, pz: { 25: 10 }, zc: { fire: 5 }, pzDone: true };
  const b = { updated: 1, coins: 0, tickets: { t1: 0, t10: 0 }, owned: { 25: { at: 1 }, 6: { at: 1 } }, shiny: {}, stats: {}, upgrades: {}, pz: { 6: 11 }, zc: { water: 6 } };
  const r = G.DB.merge(a, b);
  assert.deepEqual(Object.keys(r.pz).sort(), ['25', '6']);
  assert.deepEqual(Object.keys(r.zc).sort(), ['fire', 'water']);
  assert.equal(r.pzDone, true);
  // Al revés da lo mismo.
  const r2 = G.DB.merge(b, a);
  assert.deepEqual(Object.keys(r2.pz).sort(), ['25', '6']);
});

test('quien ya tenía cristales recibe la Pulsera Z de su compañero y de sus Pokémon de esos tipos', () => {
  // Una partida de antes (sin pz ni pzDone): se carga con migrate (local).
  const old = { v: 3, name: 'x', coins: 100, tickets: { t1: 0, t10: 0 }, partner: 25, stats: {}, upgrades: {}, pupgDone: true,
    owned: { 25: { at: 1 }, 4: { at: 1 }, 6: { at: 1 }, 7: { at: 1 }, 1: { at: 1 } }, zc: { fire: 1234 } };
  const m = migrateOf(old);
  assert.equal(m.pzDone, true);
  // Pikachu (compañero), Charmander y Charizard (Fuego): sí. Squirtle y Bulbasaur: no.
  assert.deepEqual(Object.keys(m.pz).map(Number).sort((x, y) => x - y), [4, 6, 25]);
  // Una partida nueva no regala nada aunque luego compre cristales.
  const fresh = migrateOf({ ...JSON.parse(JSON.stringify(old)), pz: {}, pzDone: true });
  assert.equal(Object.keys(fresh.pz).length, 0);
  // Sin cristales, nada; y se marca para no volver a mirarlo.
  const none = migrateOf({ ...JSON.parse(JSON.stringify(old)), zc: {} });
  assert.equal(Object.keys(none.pz).length, 0); assert.equal(none.pzDone, true);
  // Ya regalado: aunque luego compre más cristales, no se repite.
  const again = migrateOf({ ...JSON.parse(JSON.stringify(m)), zc: { fire: 1, water: 2 } });
  assert.deepEqual(Object.keys(again.pz).map(Number).sort((x, y) => x - y), [4, 6, 25]);
});

/** Una partida guardada, como la carga el juego (G.DB.migrate: rellena, limpia y regala). */
const migrateOf = s => G.DB.migrate(JSON.parse(JSON.stringify(s)), 't');

// Tipo del movimiento Z si empatan (01-11-2026): save.pzt[dex], elegido en Mejoras.
test('zState con tipo elegido: empate → el elegido; sin empate o elección inválida → como antes', () => {
  const save = { zc: { fire: 1, water: 1, grass: 1 }, pz: { 6: 1 }, pzt: {} };
  Object.defineProperty(G.DB, 'save', { get: () => save, configurable: true });
  const tie = mv('water', 'fire', 'fire', 'water');
  // Sin elegir: el del ataque que aprendiste antes (como siempre).
  assert.equal(G.Shop.zPref(6), null);
  assert.equal(G.Shop.zState(6, tie, []).type, 'water');
  // Empate 2 y 2: va el elegido.
  G.Shop.zSetPref(6, 'fire');
  assert.equal(save.pzt[6], 'fire');
  assert.equal(G.Shop.zPref(6), 'fire');
  let s = G.Shop.zState(6, tie, []);
  assert.equal(s.type, 'fire'); assert.equal(s.n, 2);
  // Empate de 3 tipos: también el elegido.
  assert.equal(G.Shop.zState(6, mv('grass', 'grass', 'water', 'water', 'fire', 'fire'), []).type, 'fire');
  // Sin empate: manda el de más ataques aunque hayas elegido otro.
  s = G.Shop.zState(6, mv('water', 'water', 'water', 'fire', 'fire'), []);
  assert.equal(s.type, 'water'); assert.equal(s.n, 3);
  // El elegido no llega a 2: el de siempre.
  assert.equal(G.Shop.zState(6, mv('water', 'water', 'fire'), []).type, 'water');
  // Elegido entre los empatados pero sin su cristal: no cuenta.
  G.Shop.zSetPref(6, 'grass');
  delete save.zc.grass;
  assert.equal(G.Shop.zState(6, mv('water', 'grass', 'grass', 'water'), []).type, 'water');
  // Elecciones inválidas: un tipo que no es cristal, basura... → el de siempre.
  for (const bad of ['banana', 'constructor', 42, null, '']) {
    save.pzt[6] = bad;
    assert.equal(G.Shop.zPref(6), null, String(bad));
    assert.equal(G.Shop.zState(6, tie, []).type, 'water', String(bad));
  }
  // zSetPref con algo que no es un cristal (o null): quita la elección.
  save.pzt[6] = 'fire';
  G.Shop.zSetPref(6, 'banana');
  assert.equal(6 in save.pzt, false);
  // Es de cada Pokémon: otro sin elegir va como siempre.
  G.Shop.zSetPref(6, 'fire');
  save.pz[25] = 1;
  assert.equal(G.Shop.zState(25, tie, []).type, 'water');
  // Pasarlo a mano gana a lo guardado (y null = sin elegir).
  assert.equal(G.Shop.zState(6, tie, [], null).type, 'water');
  // La pista con los dos a 1: el elegido.
  assert.equal(G.Shop.zState(6, mv('water', 'fire'), []).need, 'fire');
});

test('tipo Z elegido: se limpia al cargar y se junta entre aparatos', () => {
  const m = migrateOf({ v: 3, name: 'x', coins: 0, tickets: { t1: 0, t10: 0 }, stats: {}, upgrades: {}, pupgDone: true, pzDone: true,
    owned: { 6: { at: 1 }, 25: { at: 1 } }, pzt: { 6: 'fire', 25: 'banana', 99999: 'water' } });
  assert.deepEqual({ ...m.pzt }, { 6: 'fire' });
  assert.deepEqual({ ...migrateOf({ v: 3, name: 'x', stats: {}, pzDone: true }).pzt }, {});
  const base = { coins: 0, tickets: { t1: 0, t10: 0 }, owned: { 25: { at: 1 }, 6: { at: 1 } }, shiny: {}, stats: {}, upgrades: {}, pzDone: true };
  const a = { ...base, updated: 2, pzt: { 6: 'fire' } };
  const b = { ...base, updated: 1, pzt: { 6: 'water', 25: 'electric' } };
  // La más reciente manda; lo que sólo tenía la otra, se queda.
  assert.deepEqual({ ...G.DB.merge(a, b).pzt }, { 6: 'fire', 25: 'electric' });
  assert.deepEqual({ ...G.DB.merge(b, a).pzt }, { 6: 'fire', 25: 'electric' });
});
