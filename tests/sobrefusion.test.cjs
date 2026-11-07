// Sobrefusión (07-11-2026, la eligió el dueño): con los 4 ataques ya fusionados, cada vínculo de sobra (grieta ganada)
// sube un +15 % el daño de ese grupo, hasta 3 veces (+45 %). entities/player.js y el aviso de game.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function P() {
  const G = {};
  vm.runInContext(source('js/entities/player.js'), vm.createContext({ G, Math, console }), { filename: 'player.js' });
  return G.Player;
}
const Player = P();
const mv = (id, o = {}) => Object.assign({ id, type: 'fire' }, o);
function pl(groups, bonds = 0) {
  const p = Object.create(Player.prototype);
  p.slots = groups.map(g => g.map(id => mv(id)));
  p.bonds = bonds; p.over = 0;
  return p;
}

test('sobrefusión: sólo con el grupo lleno de 4, gasta un vínculo y sube +15 % hasta 3 veces', () => {
  assert.equal(Player.OVER_K, 0.15); assert.equal(Player.OVER_MAX, 3); assert.equal(Player.BOND_MAX, 4);
  // Con 3 fusionados y uno suelto, el vínculo es para fusionar, no para sobrefusión.
  const a = pl([['a', 'b', 'c'], ['d']], 1);
  assert.equal(a.canOverFuse(), false);
  assert.ok(a.bondOptions(), 'se puede fusionar el cuarto');
  // Los 4 fusionados: el vínculo ya no tiene a qué unirse.
  const p = pl([['a', 'b', 'c', 'd']], 5);
  assert.equal(p.bondOptions(), null);
  const m = p.slots[0][2];
  assert.equal(p.overK(m), 1);
  for (let i = 1; i <= 3; i++) {
    assert.equal(p.overFuse(), true);
    assert.equal(p.over, i); assert.equal(p.bonds, 5 - i);
    assert.ok(Math.abs(p.overK(m) - (1 + 0.15 * i)) < 1e-9);
  }
  assert.equal(p.overFuse(), false, 'al máximo, guarda el vínculo');
  assert.equal(p.over, 3); assert.equal(p.bonds, 2);
  // Sin vínculos, nada.
  const q = pl([['a', 'b', 'c', 'd']], 0);
  assert.equal(q.overFuse(), false);
});

test('sobrefusión: entra en el daño de los ataques del grupo (moveK), con y sin evolucionar; el Z, no', () => {
  const p = pl([['a', 'b', 'c', 'd']], 2);
  const [n, , , ] = p.slots[0];
  const e = p.slots[0][1]; e.evolved = true;
  const z = mv('z', { z: true });
  const k0 = p.moveK(n), ke = p.moveK(e);
  p.overFuse(); p.overFuse();
  assert.ok(Math.abs(p.moveK(n) / k0 - 1.3) < 1e-9);
  assert.ok(Math.abs(p.moveK(e) / ke - 1.3) < 1e-9);
  assert.equal(p.moveK(z), 1);
  assert.equal(p.overK(mv('suelto')), 1, 'un ataque que no es del grupo no cambia');
});

test('sobrefusión: game.js la aplica al recibir un vínculo sin nada que fusionar; textos en inglés', () => {
  const g = source('js/game.js');
  assert.match(g, /pl\.canOverFuse\(\) && pl\.overFuse\(\)/);
  const en = source('js/data/lang-en.js');
  for (const k of ["'¡Sobrefusión!'", "'¡Sobrefusión ★{x}! Tus ataques fusionados pegan +{x} %'", "'Sobrefusión al máximo: guardas el vínculo'"])
    assert.ok(en.includes(k), k);
});
