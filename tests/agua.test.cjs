// Pokémon salvajes y agua (13-11-2026). El dueño: «Los pokemon siguen atravesando el agua.» Eligió que sólo entren en el
// agua y el pantano los de tipo Agua (nadan), Volador y Fantasma, los que vuelan o flotan, y los jefes y legendarios; el resto
// la rodea siempre y, si un golpe lo mete, sale por la orilla más cercana (Enemy.dry, World.collide, campos walk/wade de
// pathing.js). Con world.js, pathing.js, enemy-ai.js y enemy.js de verdad en vm (tools/atascos.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../tools/atascos.cjs');

const TS = 48, LIQUID = 2;
const step = (S, secs, each) => { for (let t = 0; t < secs; t += 1 / 30) { S.G.Path.update(1 / 30, [S.me]); S.G.EnemyMgr.update(1 / 30, [S.me]); if (each && each(t) === false) return t; } return null; };
// Lago de 8 casillas de ancho y 31 de alto entre tú (x = 0) y ellos (x = 14 casillas).
const lake = (tx, ty) => (tx >= 3 && tx <= 10 && Math.abs(ty) <= 15 ? LIQUID : 0);

/** Un enemigo de tipos `types` desde el otro lado del lago: si llega, cuándo, y cuántos fotogramas pisa el agua. */
function cross(types, setup) {
  const S = A.sim({ terr: lake, rseed: 5 });
  const e = S.enemy(14 * TS, 0.5 * TS, { types, r: 14 });
  if (setup) setup(e);
  let wet = 0;
  const at = step(S, 45, () => { if (S.W.isLiquid(e.x, e.y)) wet++; return Math.hypot(e.x - S.me.x, e.y - S.me.y) >= e.r + S.me.r + 4; });
  return { at, wet, dry: e.dry };
}

test('agua: a normal (or Fire, Grass...) enemy walks around a lake and never steps in; Water, Flying and Ghost ones and legendaries may cross', () => {
  for (const t of ['normal', 'fire', 'grass', 'rock']) {
    const o = cross([t]);
    assert.equal(o.dry, true, t);
    assert.ok(o.at != null, `${t}: no llega rodeando el lago`);
    assert.equal(o.wet, 0, `${t}: ha pisado el agua ${o.wet} fotogramas`);
  }
  const n = cross(['normal']);
  for (const [name, types, setup] of [['agua', ['water']], ['volador', ['flying']], ['fantasma', ['ghost']], ['legendario', ['normal'], e => { e.legend = true; }]]) {
    const o = cross(types, setup);
    assert.equal(o.dry, false, name);
    assert.ok(o.at != null && o.wet > 0, `${name}: debería cruzar por el agua (llega ${o.at}, en el agua ${o.wet})`);
    assert.ok(o.at < n.at, `${name}: ${o.at.toFixed(1)} s cruzando frente a ${n.at.toFixed(1)} s rodeando`);
  }
});

test('agua: pushed hard towards the lake, a normal enemy stops at the shore; dropped in the middle, it comes out at the nearest shore at once', () => {
  const S = A.sim({ terr: lake, rseed: 6 });
  S.me.x = -6 * TS; S.me.y = 0;
  const e = S.enemy(2.5 * TS, 0.5 * TS, { types: ['normal'], r: 14 });
  let wet = 0;
  for (let i = 0; i < 6; i++) { e.kx = 1400; e.ky = (i % 3 - 1) * 400; step(S, 0.5, () => { if (S.W.isLiquid(e.x, e.y)) wet++; }); }
  assert.equal(wet, 0, `empujado, ha estado en el agua ${wet} fotogramas`);
  // Dentro del lago, más cerca de la orilla de la derecha (x = 11 casillas) que de la de la izquierda (x = 3).
  e.x = 9.5 * TS; e.y = 0.5 * TS; e.kx = e.ky = 0;
  S.W.collide(e);
  assert.ok(!S.W.isLiquid(e.x, e.y), 'sale con una sola llamada');
  assert.ok(e.x >= 11 * TS && Math.abs(e.y - 0.5 * TS) < TS, `por la orilla más cercana (${e.x.toFixed(0)}, ${e.y.toFixed(0)})`);
  // Tu Pokémon sí puede meterse (no tiene dry): collide no lo saca.
  const pl = { x: 6.5 * TS, y: 0.5 * TS, r: 12, wr: 6 };
  S.W.collide(pl);
  assert.ok(S.W.isLiquid(pl.x, pl.y), 'el jugador sigue pudiendo andar por el agua');
});

test('agua: on the real map, with a big horde of mixed types, legendaries, strong pushes and enemies dropped in water and rocks, the ones that cannot swim are never in water and almost none get stuck', () => {
  const r = A.run({ secs: 45, seed: 2, n: 60, inside: true });
  assert.equal(r.dryWetPct, 0, `los que no pueden entrar: ${r.dryWetPct} % del tiempo en el agua (${r.dryWetN} distintos)`);
  assert.ok(r.wadeWetPct > 0, 'los de Agua, Volador y Fantasma sí entran');
  assert.ok(r.pct <= 0.2, `atascados ${r.pct} %`);
  assert.equal(r.long6, 0, `episodios de más de 6 s: ${r.long6}`);
});
