// Evolución de ataques (3-11-2026, lo pidió el dueño): hace falta su pasiva a la mitad de su máximo,
// redondeando hacia arriba (tope 10 → nivel 5; tope 11 → nivel 6; tope 5 → nivel 3). node tests/evo-mitad.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function boot() {
  const ctx = { G: {}, console, Math };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/core/util.js', 'js/data/moves.js', 'js/systems/levelup.js']) vm.runInContext(source(f), ctx, { filename: f });
  return ctx.G;
}
const player = (taken = {}, amt = 0) => ({ statsTaken: taken, pass: { area: 1, dur: 1, amt, pspd: 1 }, moves: [], slots: [], maxMoves: 4 });

test('la mitad del máximo, redondeando hacia arriba', () => {
  const L = boot().LevelUp;
  assert.equal(L.evoLvlFor(10), 5);
  assert.equal(L.evoLvlFor(11), 6);
  assert.equal(L.evoLvlFor(5), 3);
  assert.equal(L.evoLvlFor(4), 2);
  assert.equal(L.evoLvlFor(1), 1);
});

test('máximo 10 vale a 5; máximo 11 no vale a 5 y sí a 6; máximo 5 vale a 3', () => {
  const G = boot(), L = G.LevelUp, atk = L.STATS.find(s => s.id === 'atk');
  assert.equal(atk.max, 10);
  assert.equal(L.evoHas('atk', { atk: 4 }), false);
  assert.equal(L.evoHas('atk', { atk: 5 }), true);
  // Con cualquier tope: el que tenga la carta en ese momento.
  atk.max = 11;
  assert.equal(L.evoHas('atk', { atk: 5 }), false);
  assert.equal(L.evoHas('atk', { atk: 6 }), true);
  atk.max = 5;
  assert.equal(L.evoHas('atk', { atk: 2 }), false);
  assert.equal(L.evoHas('atk', { atk: 3 }), true);
});

test('Réplica de Mejoras ya pone uno de los 3: tope de cartas 2, basta 1', () => {
  const L = boot().LevelUp;
  assert.equal(L.statMax('amt', player()), 3);
  assert.equal(L.evoLvl('amt', player()), 2);
  assert.equal(L.statMax('amt', player({}, 1)), 2);
  assert.equal(L.evoLvl('amt', player({}, 1)), 1);
  // Con una carta cogida (pass.amt = 1 de Mejoras + 1 de la carta): ya llega.
  assert.equal(L.evoHas('amt', { amt: 1 }, player({ amt: 1 }, 2)), true);
});

test('evoInfo y evoNeed: el ataque al máximo no evoluciona hasta que su pasiva llega a la mitad', () => {
  const G = boot(), M = G.Moves, L = G.LevelUp;
  const id = Object.keys(M.EVO).find(k => M.EVO[k][1] === 'atk' && M.BY_ID[k] && M.BY_ID[k].kind !== 'buff');
  assert.ok(id, 'algún ataque que evoluciona con Potencia');
  const m = M.instance(id, M.BY_ID[id].maxLvl);
  assert.equal(M.evoInfo(m, { atk: 1 }).ready, false);
  assert.equal(M.evoInfo(m, { atk: 4 }).ready, false);
  assert.equal(M.evoInfo(m, { atk: 5 }).ready, true);
  const pl = player({ atk: 3 });
  pl.moves.push(m);
  const ev = L.evoNeed(m, pl);
  assert.equal(ev.need, 5);
  assert.equal(ev.n, 3);
  assert.equal(ev.has, false);
  assert.equal(ev.ready, false);
  pl.statsTaken.atk = 5;
  assert.equal(L.evoNeed(m, pl).ready, true);
});
