// Megaevoluciones (06-11-2026, docs/MEGAEVOLUCIONES.md): los datos, qué lleva cada Pokémon,
// la compra, la energía por derrotados, entrar y salir de la mega y la fusión de partidas.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const load = (ctx, f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

function boot(save) {
  const G = { U: { TYPE_NAME: { fire: 'Fuego' }, clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
              DB: { save, commit() {} }, Moves: { Z: {} }, Coop: { active: false } };
  const ctx = vm.createContext({ G, console, performance: { now: () => 0 }, Intl, Math, Date, Object });
  for (const f of ['js/data/pokedex.js', 'js/data/megas.js', 'js/data/shop.js', 'js/systems/mega.js']) load(ctx, f);
  return G;
}
const sv = o => Object.assign({ coins: 50000, owned: { 6: 1, 94: 1, 150: 1, 303: 1 }, ach: {}, mst: {}, pz: {}, pmg: {} }, o);

test('datos: 43 megas, todas de formas finales con sprite, nombres en es/en y daño según la rareza', () => {
  const G = boot(sv());
  const ctx = vm.createContext({ G });
  load(ctx, 'js/data/sprites-meta.js');
  load(ctx, 'js/data/evolutions.js');
  const ids = Object.keys(G.MEGA);
  assert.equal(ids.length, 43);
  const K = { 1: 1.4, 2: 1.4, 3: 1.35, 4: 1.3, 5: 1.25 };
  const kids = new Set(Object.values(G.EVO).map(r => r.f).filter(f => Object.keys(G.EVO).some(k => G.EVO[k].f === f && G.DEX_BY[k])));
  for (const id of ids) {
    const m = G.MEGA[id], p = G.DEX_BY[m.dex];
    assert.ok(p && !kids.has(m.dex), m.name[0] + ' no es de forma final');
    assert.ok(G.SPRITE_META[id] && G.SPRITE_META[id].a.Idle && G.SPRITE_META[id].a.Walk && G.SPRITE_META[id].a.Attack, m.name[0] + ' sin sprite');
    assert.ok(fs.existsSync(path.join(root, 'assets/pokemon', id, 'Idle.png')), m.name[0]);
    assert.ok(fs.existsSync(path.join(root, 'assets/items', m.ico + '.png')), m.ico);
    assert.equal(m.name.length, 2); assert.equal(m.stone.length, 2);
    const want = m.dex === 362 || m.dex === 323 ? 1.25 : K[p.leg ? 5 : p.rarity];   // Glalie y Camerupt, frenados
    assert.ok(Math.abs(m.atk / p.atk - want) < 0.02, m.name[0] + ' ' + m.atk / p.atk);
    assert.equal(m.hp, p.hp, m.name[0] + ': la vida no cambia');
    assert.ok(m.spd >= Math.round(p.spd * 0.9), m.name[0] + ' lenta');
    assert.ok(!G.DEX_BY[id], 'una mega no entra en G.DEX');
  }
});

test('una cosa u otra: piedra o Pulsera Z; sin Aro no hay mega; con las dos, la elegida o la última comprada', () => {
  const s = sv({ mst: { 10034: 200 }, pz: { 6: 100 } });
  const G = boot(s);
  assert.equal(G.Shop.wears(6), 'z', 'sin Mega-Aro, la Pulsera');
  s.ach.rift1 = 1;
  assert.equal(G.Shop.wears(6), 'mega', 'la última comprada');
  s.pz[6] = 300;
  assert.equal(G.Shop.wears(6), 'z');
  G.Shop.setWear(6, 'mega');
  assert.equal(G.Shop.wears(6), 'mega', 'la elegida manda');
  assert.equal(G.Shop.wears(94), null);
  assert.equal(G.Shop.megaId(25), 0, 'Pikachu no tiene');
});

test('comprar: hace falta el Aro y el Pokémon; precio por rareza; no se compra dos veces', () => {
  const s = sv();
  const G = boot(s);
  const gengar = G.MEGA_OF[94][0], mawile = G.MEGA_OF[303][0], mewtwo = G.MEGA_OF[150][0], latias = G.MEGA_OF[380][0];
  assert.equal(G.Shop.buy('mg:' + gengar).ok, false);
  s.ach.rift1 = 1;
  assert.equal(G.Shop.buy('mg:' + latias).ok, false, 'no tienes a Latias');
  assert.equal(G.Shop.buy('mg:' + gengar).ok, true);
  assert.equal(s.coins, 50000 - 7500);
  assert.equal(G.Shop.buy('mg:' + gengar).ok, false);
  assert.equal(G.Shop.stonePrice(mawile), 5000);
  assert.equal(G.Shop.stonePrice(mewtwo), 10000);
});

test('energía: se llena con derrotados, los jefes cuentan más, en grupo pide más y se repite sin espera', () => {
  const G = boot(sv({ mst: { 10034: 1 }, ach: { rift1: 1 } }));
  const M = G.Mega, pl = { dex: 6, form: 6, kills: 0, bosses: 0, mon: { dex: 6 } };
  const g = M.of(pl);
  assert.ok(g && g.id === 10034);
  assert.equal(M.energy(pl, g), 0);
  pl.kills = 150; assert.equal(M.energy(pl, g), 0.5);
  pl.bosses = 5; assert.equal(M.energy(pl, g), 1);
  assert.equal(M.ready(pl, g), true);
  pl.form = 5; assert.equal(M.ready(pl, g), false, 'antes de la forma final espera');
  pl.form = 6; g.k0 = 0; assert.equal(M.ready(pl, g), true, 'llena otra vez, se puede repetir sin esperar');
  G.Coop.active = true; G.Game = { everyone: () => [1, 2] };
  assert.equal(M.need(), 300 * 1.75);
});

test('el compañero no carga nada', () => {
  const G = boot(sv({ mst: { 10034: 1 }, ach: { rift1: 1 } }));
  assert.equal(G.Mega.of({ remote: true, dex: 6 }), null);
});

function db(save, older) {
  const G = { DEX_BY: { 6: {} }, MEGA: { 10034: {} }, U: { TYPE_NAME: {} }, Shop: { Z_NAME: {} } };
  const src = fs.readFileSync(path.join(root, 'js/core/db.js'), 'utf8');
  return { src, G, save, older };
}
test('guardado: las megapiedras se unen al fusionar y qué lleva, lo último elegido', () => {
  const { src } = db();
  assert.ok(/'zc', 'pz', 'mst'\]/.test(src), 'mst va en la unión');
  assert.ok(src.includes("r.pmg[d] = older.pmg[d]"), 'pmg se funde por fecha');
  assert.ok(/'pbind', 'pban', 'pz', 'pmg'/.test(src), 'pmg pasa a la forma final como pz');
});

test('textos: todo lo de la mega tiene su inglés', () => {
  const en = fs.readFileSync(path.join(root, 'js/data/lang-en.js'), 'utf8');
  for (const k of ['¡{x} megaevoluciona en {x}!', '¡Megaevolución lista!', 'Mega: derrota enemigos', 'Mega: al llegar a {x}', 'Megaevolución', 'Activa: {x}',
    'Lista: toca su botón', 'Lista: pulsa {x}', 'Llega a {x}', 'Energía: {x}', 'Se queda con tu habilidad.', 'Se carga con {x} enemigos derrotados y dura {x} s.',
    'Lleva la megapiedra', 'Lleva la Pulsera Z', 'Con mega', 'Megapiedra', 'Megacoleccionista']) assert.ok(en.includes(JSON.stringify(k) + ':'), k);
});
