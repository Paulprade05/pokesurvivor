// Cañón Floral y Marshadow a la par (2026-11-04): los ajustes y las herramientas que los miden.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const tmp = path.join(os.tmpdir(), 'ps-igualar-' + process.pid);

/** Mide esos ataques con el combate de verdad (semilla fija; --rapido: 10 s por prueba). */
function measure(ids, tag) {
  const out = `${tmp}-${tag}.json`;
  execFileSync(process.execPath, [path.join(root, 'tools/balance.cjs'), '--rapido', '--todas', '--solo', ids, '--json', out], { stdio: 'ignore', maxBuffer: 1 << 26 });
  const r = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.unlinkSync(out);
  return r;
}

test('Cañón Floral: Réplica reparte el daño en vez de sumarlo entero', () => {
  const r = measure('fleur-cannon', 'floral').todas['fleur-cannon'].evo;
  // (Antes: ×2,4 sólo con Réplica y ×7 con todas las pasivas en la marea.)
  assert.ok(r.marea.dps / r.marea0.dps < 5, `con todas las pasivas: ×${(r.marea.dps / r.marea0.dps).toFixed(2)}`);
});

test('Homenaje Póstumo: el golpe del espíritu salpica a los de al lado', () => {
  const r = measure('last-respects', 'lr');
  const h = r.rows.find(x => x.stage === 'evo'), t = r.todas['last-respects'].evo;
  // (Sin salpicar, jefe y horda daban casi lo mismo: sólo pegaba a uno por golpe.)
  assert.ok(h.horda > h.jefe * 2, `horda ${h.horda} · jefe ${h.jefe}`);
  assert.ok(t.marea.dps > t.jefe.dps, `marea ${t.marea.dps} · jefe ${t.jefe.dps}`);
});

test('la marea mata de verdad y no sobrevalora a los ataques de área como la horda', () => {
  const r = measure('rollout,draining-kiss', 'marea').todas;
  const area = r.rollout.evo, uno = r['draining-kiss'].evo;
  assert.ok(area.horda.dps > area.marea.dps * 3, `Rodar: horda ${area.horda.dps}, marea ${area.marea.dps}`);
  // Un ataque de un objetivo rinde parecido en las dos.
  assert.ok(Math.abs(Math.log(uno.horda.dps / uno.marea.dps)) < 0.5, `Beso: horda ${uno.horda.dps}, marea ${uno.marea.dps}`);
});

test('medir-pokemon saca a todos los Pokémon finales, con sus cuatro ataques', () => {
  const b = `${tmp}-todo.json`, o = `${tmp}-pk.json`;
  execFileSync(process.execPath, [path.join(root, 'tools/balance.cjs'), '--rapido', '--todas', '--json', b], { stdio: 'ignore', maxBuffer: 1 << 26 });
  execFileSync(process.execPath, [path.join(root, 'tools/medir-pokemon.cjs'), b, '--json', o], { stdio: 'ignore', maxBuffer: 1 << 26 });
  const r = JSON.parse(fs.readFileSync(o, 'utf8'));
  fs.unlinkSync(b); fs.unlinkSync(o);
  assert.ok(r.length > 500, `${r.length} Pokémon`);
  assert.ok(r.every(x => x.top.length === 4 && x.v > 0));
  // Ordenado de más a menos y sin evoluciones a medias: Charmander no sale, Charizard sí.
  assert.ok(r.every((x, i) => !i || r[i - 1].v >= x.v));
  assert.ok(r.some(x => x.dex === 6) && !r.some(x => x.dex === 4));
});
