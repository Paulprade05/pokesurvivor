// Familias (26-10-2026): cada familia por su forma final (data/families.js), el paso de
// las partidas de antes (core/db.js, «FAMILIAS»), el gacha que sólo da formas finales
// (systems/gacha.js) y los logros que cuentan Pokémon (data/achievements.js).
// node tests/families.test.cjs
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
    G: {}, console, setTimeout, clearTimeout, setInterval, clearInterval, Math,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } },
    location: { protocol: 'file:', hostname: '', href: 'file:///x', search: '' },
    navigator: { onLine: true, language: 'es' },
    document: { addEventListener() {}, visibilityState: 'visible', hidden: false },
    addEventListener() {}, removeEventListener() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/core/db.js', 'js/data/moves.js',
    'js/data/natures.js', 'js/data/abilities.js', 'js/data/tms.js', 'js/data/evolutions.js', 'js/data/families.js',
    'js/data/starters.js', 'js/data/upgrades.js', 'js/data/shop.js', 'js/data/achievements.js', 'js/systems/mons.js', 'js/systems/gacha.js']) {
    vm.runInContext(source(f), ctx, { filename: f });
  }
  // (Sin sprites.js: el gacha sólo pregunta si hay shiny.)
  ctx.G.Sprites = { hasShiny: d => !!(ctx.G.SPRITE_META[d] && ctx.G.SPRITE_META[d].sh) };
  return ctx.G;
}
const G = boot();
const clone = o => JSON.parse(JSON.stringify(o));
const eq = (a, b, m) => assert.deepEqual(clone(a), clone(b), m);
const keys = o => Object.keys(o || {}).map(Number).sort((a, b) => a - b);

test('familias: formas finales, ramas y líneas', () => {
  const F = G.Fam;
  assert.equal(F.isFinal(6), true);
  assert.equal(F.isFinal(4), false);
  eq(F.finalsOf(4), [6]);
  eq(F.finalsOf(5), [6]);
  eq(F.lineOf(6), [4, 5, 6]);
  eq(F.finalsOf(133), [134, 135, 136, 196, 197, 470, 471, 700]);
  eq(F.finalsOf(265), [267, 269]);               // Wurmple → Beautifly / Dustox
  eq(F.finalsOf(236), [106, 107, 237]);          // Tyrogue
  eq(F.lineOf(26), [172, 25, 26]);               // Pichu → Pikachu → Raichu
  eq(F.familyOf(267).stages, [[265], [266, 268], [267, 269]]);
  assert.equal(F.familyOf(25).base, 172);
  assert.equal(F.isFinal(128), true);                          // Tauros: no evoluciona
  // Todas las entradas: los Pokémon que no evolucionan en nada del juego.
  assert.equal(F.FINALS.length, G.DEX.filter(p => !G.Evo.kids(p.dex).length).length);
  assert.ok(F.FINALS.length > 500 && F.FINALS.length < 600, String(F.FINALS.length));
  assert.equal(F.total(), F.FINALS.length);
  for (const d of F.FINALS) eq(F.finalsOf(d), [d]);
  // Cada Pokémon del juego llega al menos a una forma final, y lineOf de una final empieza en su base.
  for (const p of G.DEX) {
    assert.ok(F.finalsOf(p.dex).length >= 1, p.name);
    for (const f of F.finalsOf(p.dex)) assert.ok(F.lineOf(f).includes(p.dex), p.name + ' → ' + f);
  }
});

/** Partida de antes de las familias (como la dejaba la versión anterior). */
function oldSave() {
  const s = G.DB.migrate({ name: 'Ash', created: 1700000000000, updated: 5, coins: 900, tickets: { t1: 3, t10: 1 },
    owned: { 4: { at: 100, from: 'starter' }, 6: { at: 900, from: 'gacha' }, 133: { at: 300, from: 'gacha' }, 25: { at: 400, from: 'gacha' },
             10: { at: 500, from: 'gacha' }, 128: { at: 600, from: 'gacha' } },
    shiny: { 4: { at: 150, from: 'wild' }, 133: { at: 350, from: 'gacha' } },
    partner: 4, partnerShiny: true, starter: 4,
    pupg: { 4: { hp: 5, atk: 1 }, 6: { hp: 2, atk: 4 }, 133: { hp: 3 } },
    ptm: { 4: ['bulldoze'], 6: ['solar-beam'] },
    pnat: { 133: ['adamant', 777] },
    pabil: { 4: [2, 555] },
    dfav: { 4: 1000, 6: -500, 133: 50 },
    pused: { 4: 20, 6: 3, 133: 7 },
    pstart: { 4: 'ember' }, pz: { 4: 4444 }, pjudg: { 5: 9999 },
    prec: { 4: [600, 20, 900, 2], 6: [400, 25, 300, 4] },
    profile: { favs: [4, 133, 6], title: '' },
    stats: { runs: 30 }
  }, 'Ash');
  return s;
}

test('migración: lo de las preevoluciones pasa a su forma final sin perder nada', () => {
  // Sin fusionar con nada: la partida tal cual al cargar.
  const before = { owned: [4, 6, 10, 25, 128, 133] };
  const s = oldSave();
  const F = G.Fam;
  // Pokémon: Charizard (ya lo tenía), las 8 de Eevee, Raichu, Butterfree y Tauros; ninguna preevolución.
  eq(keys(s.owned), [6, 12, 26, 128, 134, 135, 136, 196, 197, 470, 471, 700]);
  for (const d of keys(s.owned)) assert.ok(F.isFinal(d));
  assert.ok(before.owned.length < keys(s.owned).length);
  // Conseguido: la fecha más antigua de la familia (Charmander, 100).
  eq(s.owned[6], { at: 100, from: 'starter' });
  assert.equal(s.owned[134].at, 300);
  // Shinies: el de Charmander → Charizard; el de Eevee → los 8.
  eq(keys(s.shiny), [6, 134, 135, 136, 196, 197, 470, 471, 700]);
  // Mejoras: lo más alto de cada una. Eevee: a cada rama.
  eq(s.pupg[6], { hp: 5, atk: 4 });
  eq(s.pupg[197], { hp: 3 });
  assert.equal(s.pupg[4], undefined);
  // MT: todas.
  eq(s.ptm[6].slice().sort(), ['bulldoze', 'solar-beam']);
  // Habilidad: la oculta de Charmander (Cápsula) no se pierde. Naturaleza de Eevee (Menta) a sus ramas.
  eq(s.pabil[6], [2, 555]);
  eq(s.pnat[470], ['adamant', 777]);
  // Charizard ya era suyo y nadie usó Menta: se queda su naturaleza (aunque jugara más con Charmander).
  assert.equal(s.pnat[6], undefined);
  // Favorito: lo último que hizo (marcó Charmander después de quitar Charizard).
  assert.equal(s.dfav[6], 1000);
  assert.equal(s.dfav[134], 50);
  // Partidas jugadas y récords: el mayor.
  assert.equal(s.pused[6], 20);
  eq(s.prec[6], [600, 25, 900, 4]);
  // Movimiento inicial, Pulsera Z y Sentencia (de Charmeleon) a Charizard.
  assert.equal(s.pstart[6], 'ember');
  assert.equal(s.pz[6], 4444);
  assert.equal(s.pjudg[6], 9999);
  // Compañero: Charizard, shiny (tiene su shiny). Favoritos del perfil: sus finales, sin repetir.
  assert.equal(s.partner, 6);
  assert.equal(s.partnerShiny, true);
  assert.equal(s.profile.favs[0], 6);
  assert.equal(s.profile.favs.length, 2);
  assert.ok(F.finalsOf(133).includes(s.profile.favs[1]));
  // Nada de preevoluciones en ningún sitio.
  for (const k of ['owned', 'shiny', 'pupg', 'ptm', 'pnat', 'pabil', 'dfav', 'pused', 'pstart', 'pz', 'pjudg', 'prec']) {
    for (const d of keys(s[k])) assert.ok(F.isFinal(d), k + ' ' + d);
  }
  // Se queda el inicial (el del test) tal cual.
  assert.equal(s.starter, 4);
});

test('migración: naturaleza y habilidad de «tu» Pokémon si nadie las cambió', () => {
  const s = G.DB.migrate({ name: 'Misty', created: 1711111111111, updated: 1, coins: 0, tickets: { t1: 0, t10: 0 },
    owned: { 7: { at: 1, from: 'starter' } }, partner: 7, pused: { 7: 9 }, stats: {} }, 'Misty');
  const was = G.Mons.rolledIn(s, 7), now = G.Mons.rolledIn(s, 9);
  assert.equal(s.partner, 9);
  // La de Squirtle pasa a Blastoise (con fecha 1: cualquier Menta de después manda).
  if (was.nature !== now.nature) eq(s.pnat[9], [was.nature, 1]);
  else assert.ok(!s.pnat[9] || s.pnat[9][0] === was.nature);
});

test('migración: idempotente y a prueba de un aparato con la versión de antes', () => {
  const s = oldSave(), once = clone(s);
  G.DB.migrate(s, 'Ash');
  eq(clone(s), once);
  // Un aparato viejo junta otra vez Charmander (y algo más de él): se vuelve a pasar y no se suma dos veces.
  const old = clone(s);
  old.updated = 1; old.owned[4] = { at: 50, from: 'starter' }; old.pused[4] = 25; old.pupg[4] = { hp: 1, cd: 2 };
  const r = G.DB.migrate(G.DB.merge(clone(s), old), 'Ash');
  assert.equal(r.owned[4], undefined);
  assert.equal(r.owned[6].at, 50);
  assert.equal(r.pused[6], 25);
  eq(r.pupg[6], { hp: 5, atk: 4, cd: 2 });
  const again = G.DB.migrate(clone(r), 'Ash');
  eq(again, r);
});

test('conseguir una preevolución da su forma final (en una rama, una que te falte)', () => {
  G.DB.playAsGuest();
  const save = G.DB.save;
  assert.equal(G.DB.owns(4), false);
  assert.equal(G.DB.grant(4, 'rescue'), 6);
  assert.ok(save.owned[6] && !save.owned[4]);
  assert.equal(G.DB.owns(4), true);
  assert.equal(G.DB.owns(5), true);
  // Eevee: cada vez una rama que falte; con las 8, ya «lo tienes».
  const got = new Set();
  for (let i = 0; i < 8; i++) { assert.equal(G.DB.owns(133), false); got.add(G.DB.grant(133, 'rescue')); }
  assert.equal(got.size, 8);
  assert.equal(G.DB.owns(133), true);
  // Shiny salvaje de Charmander: Charizard shiny (nuevo la primera vez).
  assert.equal(G.DB.grantShiny(4, 'wild'), true);
  assert.ok(save.shiny[6]);
  assert.equal(G.DB.grantShiny(5, 'wild'), false);
});

test('gacha: 1000 tiradas en cada banner, sólo formas finales y con su rareza', () => {
  const save = { coins: 0, tickets: { t1: 1e6, t10: 0 }, owned: {}, shiny: {}, pity: {}, stats: { pulls: 0 } };
  for (const b of G.Gacha.BANNERS) {
    const by = {}, n = 1000;
    for (let i = 0; i < n / 10; i++) {
      const res = G.Gacha.pull(save, 10, b.gen);
      assert.equal(res.length, 10);
      // Cada ×10, al menos una Épica.
      assert.ok(res.some(r => r.rarity >= 4));
      for (const r of res) {
        const p = G.DEX_BY[r.dex];
        assert.ok(G.Fam.isFinal(r.dex), 'no es final: ' + p.name);
        assert.equal(p.gen, b.gen);
        assert.equal(r.rarity, p.rarity, p.name);
        by[r.rarity] = (by[r.rarity] || 0) + 1;
      }
    }
    // Ninguna rareza se come las tiradas (antes, Ditto salía en el 45 % de las de Kanto).
    const most = Math.max(...Object.values(by));
    assert.ok(by[3] > 400, b.name + ' ' + JSON.stringify(by));
    assert.ok(most < 950);
    // Legendarias: 1,5 % y el pity a las 70 → entre 10 y 40 de 1000.
    assert.ok((by[5] || 0) >= 10 && (by[5] || 0) <= 45, b.name + ' ' + JSON.stringify(by));
    // Las probabilidades que se enseñan suman 100.
    const sum = G.Gacha.ratesFor(b.gen).reduce((a, [, w]) => a + w, 0);
    assert.ok(Math.abs(sum - 100) < 0.6, b.name + ' ' + sum);
  }
  // Lo que puede salir: sólo finales.
  for (const b of G.Gacha.BANNERS) for (const p of G.Gacha.all(b.gen)) assert.ok(G.Fam.isFinal(p.dex));
});

test('logros: cuentan familias (formas finales)', () => {
  const s = oldSave();
  const own = G.AchDefs.BY.own10.value(s);
  assert.equal(own, keys(s.owned).length);
  assert.equal(G.AchDefs.BY.ownAll.goal, G.Fam.total());
  assert.equal(G.AchDefs.BY.shiny5.value(s), 9);
  // Legendarios: sólo los de forma final; vencer a Cosmog cuenta para Solgaleo y Lunala.
  assert.equal(G.AchDefs.BY.leg_789, undefined);
  assert.equal(G.AchDefs.BY.leg_791.value({ legends: { 789: 1 } }), 1);
  assert.equal(G.AchDefs.BY.leg_792.value({ legends: { 789: 1 } }), 1);
  assert.equal(G.AchDefs.BY.leg10.value({ legends: { 789: 1, 150: 1 } }), 3);
});
