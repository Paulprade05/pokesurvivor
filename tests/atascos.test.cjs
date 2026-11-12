// Enemigos atascados en el terreno (11-11-2026). Con world.js, pathing.js, enemy-ai.js y enemy.js de verdad en vm
// (tools/atascos.cjs, el mismo mundo de juguete que tests/ai.test.cjs) se fijan los casos que se encontraron:
//   1. Un enemigo grande (radio > 0,47 casillas) iba y venía cada fotograma entre «a la casilla siguiente» y «al centro de
//      la mía» (pathing.js dirFor): temblando en el sitio junto a un charco o pegado a una pared, para siempre.
//   2. Con el centro dentro de un bloque grande de roca, World.collide lo sacaba hacia otra casilla de roca: 1-3 s
//      metido en la piedra.
//   3. El desatasco medía el avance con lo que le falta por el camino (e.pathV), que salta al cambiar de campo: quieto
//      contra una pared 30-80 s sin que saltara. Ahora hay una red de seguridad que sólo mira cuánto se ha movido.
//   4. En el mapa de verdad, con horda, empujones y enemigos metidos en las rocas: casi ninguno atascado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../tools/atascos.cjs');

const TS = 48, WALL = 1, LIQUID = 2;
const step = (S, secs, each) => { for (let t = 0; t < secs; t += 1 / 30) { S.G.Path.update(1 / 30, [S.me]); S.G.EnemyMgr.update(1 / 30, [S.me]); if (each && each(t) === false) return t; } return null; };

/** Lo que tarda en llegar a ti un enemigo de radio r desde (ex, ey), con el jugador en (px, py). */
function arrive(terr, r, ex, ey, px, py, secs = 15) {
  const S = A.sim({ terr, rseed: 3 });
  S.me.x = px; S.me.y = py;
  const e = S.enemy(ex, ey, { r, spd: 66 });
  const at = step(S, secs, () => Math.hypot(e.x - S.me.x, e.y - S.me.y) >= e.r + S.me.r + 6);
  return { at, rescued: S.log.ahead, straight: Math.hypot(ex - px, ey - py) / 66 };
}

test('atascos: a big enemy no longer jitters in place next to a pond or pressed against a wall (arrives without rescue, ≤ 1.3× the straight line)', () => {
  // Banda de pared encima (filas -3 y -2) y un lago abajo a la izquierda: el grande va pegado a la pared hacia ti.
  const wallLake = (tx, ty) => (ty <= -2 && ty >= -3 && tx >= -2 ? WALL : ty >= 1 && ty <= 4 && tx <= 2 ? LIQUID : 0);
  // Campo abierto con un charco de 3×4 casillas cerca de la recta y una roca suelta.
  const pond = (tx, ty) => (tx >= -3 && tx <= -1 && ty >= -4 && ty <= -1 ? LIQUID : tx === 2 && ty === 1 ? WALL : 0);
  for (const [name, terr, ex, ey, px, py] of [['pared y lago', wallLake, 7.3 * TS, -TS + 31, -6 * TS, -0.5 * TS], ['charco', pond, 6.3 * TS, -2.5 * TS, -7 * TS, 0.5 * TS]]) {
    for (const r of [14, 26, 31, 39]) {
      const o = arrive(terr, r, ex, ey, px, py);
      assert.ok(o.at != null, `${name}, radio ${r}: no llega en 15 s`);
      assert.equal(o.rescued, 0, `${name}, radio ${r}: ha hecho falta sacarlo (${o.rescued})`);
      assert.ok(o.at <= o.straight * 1.3, `${name}, radio ${r}: ${o.at.toFixed(1)} s frente a ${o.straight.toFixed(1)} s en recta`);
    }
  }
});

test('atascos: a huge enemy (radius 42, like the big shielders) hits the terrain with at most 28 and gets through between two trees without rescue', () => {
  // Una pared en x = 3 con una abertura de 3 casillas (y = 0..2) y un árbol arriba y otro abajo: sólo se pasa entre los dos
  // árboles (70 px). El camino de los grandes no va por ahí (es un estrechamiento) y usa el normal. Antes, con su cuerpo de
  // 84 px, no cabía y se quedaba contra los árboles hasta que lo sacaban.
  const S = A.sim({ terr: (tx, ty) => (tx === 3 && (ty < 0 || ty > 2) ? WALL : 0), rseed: 4 });
  const W = S.W;
  for (const ty of [0, 2]) {
    const c = W.chunk(0, 0), i = ty * 16 + 3;
    const p = { id: 9000 + ty, type: 'tree', tx: 3, ty, x: 3 * TS + TS / 2, y: ty * TS + TS - 4, r: 13, solid: true, destructible: false, hp: Infinity };
    c.props.push(p); c.pa[i] = p; c.solid[i] = 1;
  }
  S.me.x = -5 * TS; S.me.y = 0.5 * TS;
  const e = S.enemy(11 * TS, 1.5 * TS, { r: 42, spd: 66 });
  const at = step(S, 16, () => Math.hypot(e.x - S.me.x, e.y - S.me.y) >= e.r + S.me.r + 6);
  assert.ok(at != null, 'no llega en 16 s');
  assert.equal(S.log.ahead, 0, 'ha hecho falta sacarlo');
  assert.ok(at <= (16 * TS / 66) * 1.3, `${at.toFixed(1)} s`);
  assert.ok(e.wr <= 28 && e.r === 42, 'choca con el terreno con 28 como mucho; el cuerpo sigue con su radio');
});

test('atascos: with its centre inside a wide block of rock, World.collide gets it out at once to the nearest free tile', () => {
  // Bloque de 9×9 casillas de roca: desde cualquier punto de dentro, una sola llamada lo deja fuera (por el borde más cercano:
  // desde el centro, a 5 casillas).
  const block = (tx, ty) => (Math.abs(tx) <= 4 && Math.abs(ty) <= 4 ? WALL : 0);
  const S = A.sim({ terr: block });
  const W = S.W;
  let worst = 0;
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) for (const r of [12, 20, 31]) {
    const e = { x: (x + 0.37) * TS, y: (y + 0.61) * TS, r }, x0 = e.x, y0 = e.y;
    W.collide(e);
    assert.ok(W.isFree(e.x, e.y, r - 0.5), `casilla ${x},${y} radio ${r}: sigue dentro (${e.x.toFixed(0)}, ${e.y.toFixed(0)})`);
    worst = Math.max(worst, Math.hypot(e.x - x0, e.y - y0));
  }
  assert.ok(worst <= 5 * TS + 40, `lo saca demasiado lejos: ${worst.toFixed(0)}`);
  // Y fuera del bloque, nada cambia: un círculo rozando la pared sólo se separa.
  const e = { x: 5 * TS + 5, y: 0, r: 12 };     // (el bloque acaba en x = 5·TS: se mete 7 px)
  W.collide(e);
  assert.ok(Math.abs(e.x - (5 * TS + 12)) < 0.01 && e.y === 0, 'roce normal: se separa sin más');
});

test('atascos: safety net — an enemy that does not move for 3.5 s (even if its path length jumps around) is rescued; rooted ones and bosses are not', () => {
  const wall = (tx, ty) => (tx === -3 && Math.abs(ty) <= 6 ? WALL : 0);
  // Como un fallo de la IA que no conocemos: el camino le manda contra la pared y lo que le falta cambia cada fotograma
  // (como al pasar del campo de los grandes al normal), así el desatasco de siempre cree que avanza.
  const run = (setup, secs = 6) => {
    const S = A.sim({ terr: wall });
    S.me.x = -12 * TS; S.me.y = 0;
    const e = S.enemy(-1.5 * TS, 0.5 * TS, { r: 14, spd: 66 });
    let flip = 0;
    S.G.Path.dirFor = en => { if (en !== e) return null; en.pathNo = false; en.pathV = (flip ^= 1) ? 30 : 40; return [-1, 0]; };
    if (setup) setup(S, e);
    const x0 = e.x;
    let saved = null;
    step(S, secs, t => { if (S.log.ahead || e.jump || Math.abs(e.x - x0) > TS * 2) { saved = t; return false; } });
    return saved;
  };
  const t = run();
  assert.ok(t != null && t <= 4.5, `lo saca a los ${t} s`);
  assert.equal(run((S, e) => { e.sts = { root: { t: 9 } }; }), null, 'con raíces se queda (lo para un ataque)');
  assert.equal(run((S, e) => { e.boss = true; e.bossTick = () => {}; e.bossMove = (dt, pl, dist, dx, dy, spd) => [dx * spd, dy * spd, 'Walk']; }), null, 'un jefe no salta solo');
});

test('atascos: on the real map, with a horde, strong pushes and enemies dropped inside rocks, almost none get stuck (≤ 0.2 % of the time, none > 6 s)', () => {
  const r = A.run({ secs: 45, seed: 6, n: 50, inside: true });
  assert.ok(r.pct <= 0.2, `atascados ${r.pct} % del tiempo (${JSON.stringify(r.kinds)})`);
  assert.equal(r.long6, 0, `episodios de más de 6 s: ${r.long6} (máx ${r.max} s)`);
});
