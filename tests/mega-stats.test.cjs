// Stats de las megas (17-11-2026, docs/MEGAEVOLUCIONES.md 3.4): suben como sus stats oficiales.
// Ataque y Ataque Especial, en la misma proporción que los oficiales (con suelo y tope de daño);
// Defensa, Defensa Especial, PS y Velocidad, como en una evolución. Ninguno baja.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const { megaStats, DMG, DMG_DEX, DMG_CAP, DMG_MAX } = require('../tools/fetch_megas.cjs');

const G = {};
for (const f of ['js/data/pokedex.js', 'js/data/megas.js']) vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), { G });
const floor = p => DMG_DEX[p.dex] || DMG[p.leg ? 5 : p.rarity];
const cap = p => DMG_CAP[p.dex] || DMG_MAX;

test('la regla: 100 → 150 de At. Esp. oficial = ×1,5 en el juego, y lo que baja se queda', () => {
  const mon = { dex: 9999, rarity: 4, hp: 102, spd: 110, pa: 1.2, sa: 1.25, atk: 1.25, df: 80, sd: 90 };
  const s = megaStats(mon, [70, 60, 60, 150, 100, 70], [70, 80, 80, 100, 90, 90]);
  assert.equal(s.sa, 1.88, 'At. Esp. ×1,5');
  assert.equal(s.atk, 1.88);
  assert.equal(s.pa, 1.2, 'el Ataque oficial baja: se queda');
  assert.equal(s.df, 80, 'la Defensa oficial baja: se queda');
  assert.equal(s.sd, 100, 'la Def. Esp., la oficial de la mega');
  assert.equal(s.spd, 110, 'la Velocidad oficial baja: se queda');
  assert.equal(s.hp, 102, 'los PS oficiales no cambian: tampoco los del juego');
  // Poca subida: el suelo de antes (rareza 4, ×1,3). Mucha: el tope.
  assert.ok(Math.abs(megaStats(mon, [70, 80, 80, 105, 90, 90], [70, 80, 80, 100, 90, 90]).atk - 1.25 * 1.3) < 0.006);
  assert.equal(megaStats(mon, [70, 80, 80, 300, 90, 90], [70, 80, 80, 100, 90, 90]).atk, Math.round(1.25 * DMG_MAX * 100) / 100);
});

test('los oficiales guardados son los de PokeAPI (unas cuantas a mano)', () => {
  const want = {
    10034: [[78, 130, 111, 130, 85, 100], [78, 84, 78, 109, 85, 100]],    // Mega-Charizard X / Charizard
    10035: [[78, 104, 78, 159, 115, 100], [78, 84, 78, 109, 85, 100]],    // Mega-Charizard Y
    10037: [[55, 50, 65, 175, 105, 150], [55, 50, 45, 135, 95, 120]],     // Mega-Alakazam / Alakazam
    10076: [[80, 145, 150, 105, 110, 110], [80, 135, 130, 95, 90, 70]],   // Mega-Metagross / Metagross
    10087: [[70, 120, 100, 145, 105, 20], [70, 100, 70, 105, 75, 40]]     // Mega-Camerupt / Camerupt
  };
  for (const id in want) assert.deepEqual([G.MEGA[id].st, G.MEGA[id].st0], want[id], G.MEGA[id].name[0]);
});

test('las 62 megas siguen la regla y ninguna baja nada respecto a su Pokémon', () => {
  const ids = Object.keys(G.MEGA);
  assert.equal(ids.length, 62);
  for (const id of ids) {
    const m = G.MEGA[id], p = G.DEX_BY[m.dex], n = m.name[0];
    assert.equal(m.st.length, 6, n); assert.equal(m.st0.length, 6, n);
    // Su Pokémon en el juego sale de los mismos oficiales (fetch_pokedex.py): las defensas, tal cual.
    assert.equal(p.df, m.st0[2], n); assert.equal(p.sd, m.st0[4], n);
    for (const k of ['hp', 'spd', 'atk', 'pa', 'sa', 'df', 'sd']) assert.ok(m[k] >= p[k], `${n}: ${k} baja`);
    assert.equal(m.df, Math.max(m.st[2], p.df), n + ' Defensa');
    assert.equal(m.sd, Math.max(m.st[4], p.sd), n + ' Def. Esp.');
    assert.equal(m.hp, Math.max(p.hp, Math.round(70 + m.st[0] * 0.45)), n + ' PS');
    assert.equal(m.spd, Math.max(p.spd, Math.round(78 + m.st[5] * 0.42)), n + ' Velocidad');
    // Daño: cada lado × su proporción oficial; el mayor, entre el suelo y el tope.
    const ra = Math.max(1, m.st[1] / m.st0[1]), rs = Math.max(1, m.st[3] / m.st0[3]);
    const k0 = Math.max(p.pa * ra, p.sa * rs) / p.atk, k = Math.min(Math.max(k0, floor(p)), cap(p));
    assert.ok(Math.abs(m.atk / p.atk - k) < 0.01, `${n}: ×${(m.atk / p.atk).toFixed(3)} y no ×${k.toFixed(3)}`);
    assert.ok(m.atk / p.atk > floor(p) - 0.01, n + ' por debajo del suelo');
    assert.ok(m.atk / p.atk < cap(p) + 0.01, n + ' por encima del tope');
    assert.equal(m.atk, Math.max(m.pa, m.sa), n);
    // Sin suelo ni tope, la proporción oficial tal cual (100 → 120 = ×1,2).
    if (k === k0) {
      assert.ok(Math.abs(m.pa - p.pa * ra) < 0.006, n + ' Ataque');
      assert.ok(Math.abs(m.sa - p.sa * rs) < 0.006, n + ' At. Esp.');
    }
  }
});
