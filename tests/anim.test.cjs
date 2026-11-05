// Arte animado (05-11-2026): el reloj compartido y el interruptor «Animaciones».
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

function load(on = true) {
  const fns = [];
  const s = { anim: on };
  const G = { Settings: { get: k => s[k], on: fn => fns.push(fn) }, U: { freeCanvas() {} } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/world/anim.js'), 'utf8'), vm.createContext({ G, Math }), { filename: 'anim.js' });
  return { A: G.Anim, set: v => { s.anim = v; fns.forEach(f => f('anim', v)); } };
}

test('anim: la ola de viento va por fotogramas 0..7 y las casillas vecinas se siguen', () => {
  const { A } = load();
  for (let i = 1; i < 200; i++) {
    A.frame(i * 16);
    for (let x = -3000; x < 3000; x += 777) {
      const f = A.wind(x, x * 0.7);
      assert.ok(Number.isInteger(f) && f >= 0 && f <= 7, 'fotograma ' + f);
    }
  }
  const seen = new Set();
  for (let x = 0; x < 2000; x += 48) seen.add(A.wind(x, 0));
  assert.equal(seen.size, 8, 'en un campo se ven todos los fotogramas');
});

test('anim: apagado, todo se queda en el fotograma 0', () => {
  const { A, set } = load(true);
  A.frame(1000);
  set(false);
  assert.equal(A.on, false);
  for (let i = 0; i < 300; i++) {
    A.frame(1000 + i * 16);
    assert.equal(A.wind(i * 31, i * 17), 0);
    assert.equal(A.tick(4, 8, i), 0);
  }
  set(true);
  assert.equal(A.on, true);
});

test('anim: de serie encendido (y sólo false lo apaga); como mucho 2 fotogramas nuevos por fotograma dibujado', () => {
  assert.equal(load(undefined).A.on, true, 'partidas guardadas sin el ajuste');
  assert.equal(load(false).A.on, false);
  const { A } = load();
  A.frame(16);
  assert.equal(A.take(), true);
  assert.equal(A.take(), true);
  assert.equal(A.take(), false);
  A.frame(32);
  assert.equal(A.take(), true);
});
