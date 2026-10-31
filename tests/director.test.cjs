// Director de enemigos (G.Director, systems/director.js; 2.0, bloque 2): sube la vida y el daño de los
// enemigos según lo rápido que matas y cómo vas de vida, sin bajar nunca de 1.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function load() {
  const G = { U: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) } };
  vm.runInContext(source('js/systems/director.js'), vm.createContext({ G, Math }), { filename: 'director.js' });
  G.Director.reset();
  return G.Director;
}

const me = (hp = 100) => ({ hp, maxHp: 100, dead: false });
let id = 0;
/** Un enemigo normal que cae tras recibir `dmg` de golpe en `ttk` s (con maxHp de vida). */
function killOne(D, pl, t, ttk, o = {}) {
  const e = Object.assign({ id: ++id, maxHp: 100 }, o);
  D.update(0, [pl], t - ttk);
  D.hit(e, o.dmg || 100);
  D.update(0, [pl], t);
  D.kill(e);
}
/** `secs` s de partida desde `t0` matando `perSec` enemigos por segundo, cada uno en `ttk` s. */
function play(D, pl, t0, secs, ttk, perSec = 4, o) {
  let t = t0;
  for (let s = 0; s < secs; s++) {
    for (let k = 0; k < perSec; k++) killOne(D, pl, t, ttk, o);
    for (let f = 0; f < 10; f++) { t += 0.1; D.update(0.1, [pl], t); }
  }
  return t;
}

test('no hace nada con pocas bajas', () => {
  const D = load(), pl = me();
  let t = 600;
  for (let s = 0; s < 60; s++) { if (s % 10 === 0) killOne(D, pl, t, 0.05); for (let f = 0; f < 10; f++) { t += 0.1; D.update(0.1, [pl], t); } }
  assert.ok(D.kills < 8);
  assert.equal(D.hp(), 1);
});

test('si matas muy rápido sube la vida, sin pasar de HP_MAX', () => {
  const D = load(), pl = me();
  play(D, pl, 600, 400, 0.05);
  assert.ok(D.hp() > 1.5, 'sube: ' + D.hp());
  assert.ok(D.hp() <= D.hpMaxAt(1000) + 1e-9, 'tope: ' + D.hp());
  // Reparto en vida y defensa: vida × hp^0,6 y daño recibido × hp^-0,4 → tardan hp veces más.
  assert.ok(Math.abs(D.hpPart() / D.defK() - D.hp()) < 1e-9);
});

test('si matas despacio no sube y nunca baja de 1', () => {
  const D = load(), pl = me();
  play(D, pl, 600, 200, 5);
  assert.equal(D.hp(), 1);
  D.debugSet(2, 1.3);
  play(D, pl, 800, 200, 5);
  assert.equal(D.hp(), 1);
});

test('con peligro (vida baja o caída) se frena y baja', () => {
  const D = load(), pl = me();
  play(D, pl, 600, 200, 0.05);
  const h0 = D.hp(), d0 = D.dmg();
  assert.ok(h0 > 1.2 && d0 > 1.1, 'cómodo: ' + h0 + ' / ' + d0);
  pl.hp = 20;                               // al 20 % (curve.cjs: la vida virtual)
  play(D, pl, 800, 1, 0.05);
  assert.equal(D.danger, true);
  play(D, pl, 801, 30, 0.05);
  assert.ok(D.hp() < h0 && D.dmg() < d0, 'baja: ' + D.hp() + ' / ' + D.dmg());
  // Una caída avisada (curve.cjs llama a noteFall) también es peligro 25 s.
  const E = load(), p2 = me();
  play(E, p2, 600, 100, 0.05);
  E.noteFall(p2);
  assert.equal(E.danger, true);
  const h1 = E.hp();
  play(E, p2, 700, 20, 0.05);
  assert.ok(E.hp() <= h1);
  play(E, p2, 720, 30, 0.05);
  assert.equal(E.danger, false);
});

test('una caída de verdad (dead) cuenta como peligro, también la de un compañero', () => {
  const D = load(), pl = me(), mate = { remote: true, net: { hp: 100, maxHp: 100, dead: 0 } };
  D.update(0.1, [pl, mate], 600);
  assert.equal(D.danger, false);
  mate.net.dead = 1;
  D.update(0.1, [pl, mate], 601);
  assert.equal(D.danger, true);
  mate.net.dead = 0; mate.net.hp = 10;
  D.update(0.1, [pl, mate], 640);
  assert.equal(D.danger, true, 'compañero al 10 %');
});

test('el daño sólo sube desde el minuto 3, con su tope por reloj y como mucho ×1,5', () => {
  const D = load(), pl = me();
  play(D, pl, 0, 170, 5, 1);
  assert.equal(D.dmg(), 1);
  play(D, pl, 200, 400, 5, 1);
  assert.ok(D.dmg() > 1.1 && D.dmg() <= D.dmgMaxAt(600) + 1e-9, 'minuto 10: ' + D.dmg());
  play(D, pl, 600, 1300, 5, 1);
  assert.ok(D.dmg() > 1.45 && D.dmg() <= 1.5 + 1e-9, 'final: ' + D.dmg());
});

test('no cuenta jefes, esbirros, estampidas ni los que explotan solos', () => {
  const D = load(), pl = me();
  for (const o of [{ boss: true }, { legend: true }, { weak: true }, { selfK: true }, { behavior: 'stampede' }, { judge: true }])
    for (let i = 0; i < 20; i++) killOne(D, pl, 600, 0.05, o);
  assert.equal(D.kills, 0);
});
