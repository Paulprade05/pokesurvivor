// Recargo de las mejoras (21-11-2026): cada nivel comprado sube todos los precios del Pokémon;
// la última compra posible cuesta un 75 % más que con 0 compradas.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

const G = {};
new Function('G', fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'upgrades.js'), 'utf8'))(G);
const U = G.Upgrades;
const raw = (id, l) => U.BY[id].base * Math.pow(U.BY[id].grow, l);

test('sin nada comprado, el precio de siempre', () => {
  for (const u of U.LIST) for (let l = 0; l < u.max; l++)
    assert.strictEqual(U.cost(u.id, l, 0), Math.round(raw(u.id, l) / 10) * 10, `${u.id} ${l}`);
  assert.strictEqual(U.cost('hp', 0), U.cost('hp', 0, 0));
});

test('la última compra posible cuesta un 75 % más (100 → 175)', () => {
  assert.strictEqual(U.mult(0), 1);
  assert.ok(Math.abs(U.mult(U.TOTAL - 1) - 1.75) < 1e-9);
  assert.ok(Math.abs(U.mult(U.TOTAL + 50) - 1.75) < 1e-9, 'no pasa del 75 %');
  // Una mejora de 100 (sin redondeo) al final: 175.
  const base = 100 / U.BY.hp.base;
  assert.strictEqual(Math.round(U.BY.hp.base * base * U.mult(U.TOTAL - 1)), 175);
});

test('sube poco a poco y nunca baja', () => {
  let prev = 0;
  for (let n = 0; n < U.TOTAL; n++) {
    const c = U.cost('ban', 2, n);
    assert.ok(c >= prev, `n=${n}`);
    prev = c;
  }
  assert.ok(U.mult(1) - U.mult(0) < 0.01, 'cada compra sube menos de un 1 %');
});

test('bought cuenta niveles hasta su máximo e ignora lo raro', () => {
  assert.strictEqual(U.bought({}), 0);
  assert.strictEqual(U.bought({ hp: 3, atk: 2 }), 5);
  assert.strictEqual(U.bought({ hp: 99, zz: 7, atk: -2, spd: 'x' }), U.BY.hp.max);
  const all = {};
  for (const u of U.LIST) all[u.id] = u.max;
  assert.strictEqual(U.bought(all), U.TOTAL);
});

test('partida con niveles ya comprados: paga según lo que lleva', () => {
  const lv = { hp: 10, atk: 10, crit: 10 };
  const n = U.bought(lv);
  assert.strictEqual(n, 30);
  assert.strictEqual(U.cost('spd', 0, n), Math.round(raw('spd', 0) * U.mult(30) / 10) * 10);
  assert.ok(U.cost('spd', 0, n) > U.cost('spd', 0, 0));
});
