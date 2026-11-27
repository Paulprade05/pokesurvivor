// Sobrefusión (07-11-2026, la eligió el dueño): con los 4 ataques ya fusionados, cada vínculo de sobra (grieta ganada)
// sube un +15 % el daño de ese grupo, hasta 3 veces (+45 %). entities/player.js y el aviso de game.js.
// (1.0, bloque C) Con el tope de 4 ataques: +8 % cada una, hasta 8 (+64 %).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const G0 = {};
function P() {
  const G = G0;
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

test('sobrefusión: sólo con el grupo lleno de 4, gasta un vínculo y sube +8 % hasta 8 veces', () => {
  assert.equal(Player.OVER_K, 0.08); assert.equal(Player.OVER_MAX, 8); assert.equal(Player.BOND_MAX, 4);
  // Con 3 fusionados y uno suelto, el vínculo es para fusionar, no para sobrefusión.
  const a = pl([['a', 'b', 'c'], ['d']], 1);
  assert.equal(a.canOverFuse(), false);
  assert.ok(a.bondOptions(), 'se puede fusionar el cuarto');
  // Los 4 fusionados: el vínculo ya no tiene a qué unirse.
  const p = pl([['a', 'b', 'c', 'd']], 10);
  assert.equal(p.bondOptions(), null);
  const m = p.slots[0][2];
  assert.equal(p.overK(m), 1);
  for (let i = 1; i <= 8; i++) {
    assert.equal(p.overFuse(), true);
    assert.equal(p.over, i); assert.equal(p.bonds, 10 - i);
    assert.ok(Math.abs(p.overK(m) - (1 + 0.08 * i)) < 1e-9);
  }
  assert.equal(p.overFuse(), false, 'al máximo, guarda el vínculo');
  assert.equal(p.over, 8); assert.equal(p.bonds, 2);
  assert.ok(Math.abs(p.overK(m) - 1.64) < 1e-9, '+64 % en total');
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
  assert.ok(Math.abs(p.moveK(n) / k0 - 1.16) < 1e-9);
  assert.ok(Math.abs(p.moveK(e) / ke - 1.16) < 1e-9);
  assert.equal(p.moveK(z), 1);
  assert.equal(p.overK(mv('suelto')), 1, 'un ataque que no es del grupo no cambia');
});

test('sobrefusión: carta en la pantalla del vínculo con un grupo de 4; directa si no hay nada que unir; textos en inglés', () => {
  const g = source('js/game.js');
  assert.match(g, /opt\.over = pl\.canOverFuse\(\)/, 'la pantalla del vínculo sabe si cabe');
  assert.match(g, /if \(picked === 'over'\) \{ overFuse\(\); return; \}/, 'elegir la carta gasta el vínculo en la sobrefusión');
  assert.match(g, /if \(!opt\) \{[\s\S]{0,200}if \(overFuse\(\)\) return;/, 'sin nada que unir, directa');
  const ui = source('js/ui/run-ui.js');
  assert.match(ui, /if \(opt\.over && !step2\)/);
  assert.match(ui, /i === 'over' \|\| i === bond\.list\.length/, 'con la tecla: la siguiente a las de unir');
  const en = source('js/data/lang-en.js');
  for (const k of ["'¡Sobrefusión!'", "'¡Sobrefusión ★{x}! Tus ataques fusionados pegan +{x} %'", "'Sobrefusión al máximo: guardas el vínculo'",
                   "'Sobrefusión'", "'Une movimientos o elige la Sobrefusión'", "'{x} pegan un {x} % más (en total, +{x} %).'"])
    assert.ok(en.includes(k), k);
});

test('sobrefusión (1.0, bloque C): los 11 vínculos de una partida caben: 3 para fusionar los 4 y 8 de Sobrefusión', () => {
  const p = pl([['a'], ['b'], ['c'], ['d']], 11);
  p.moves = p.slots.map(g => g[0]);
  G0.Items = { locked: () => false }; G0.Projectiles = { clearOrbs() {} };
  for (let i = 0; i < 3; i++) {
    const o = p.bondOptions();
    assert.ok(o, 'vínculo ' + (i + 1) + ': se puede fusionar');
    p.fuse(o.mode === 'pair' ? o.loose.slice(0, 2) : [o.loose[0]], o.group);
  }
  assert.equal(p.slots.length, 1); assert.equal(p.fullGroup().length, 4);
  assert.equal(p.moves.length, 4, 'fusionar no quita ataques');
  assert.equal(p.canLearn(), false, 'ni deja sitio para otro');
  while (p.overFuse());
  assert.equal(p.over, 8); assert.equal(p.bonds, 0);
});
