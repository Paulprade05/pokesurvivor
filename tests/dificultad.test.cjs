// Algo menos de dificultad del minuto 18 al final (17-11-2026, el dueño: «no he llegado a más de 22 minutos nunca teniendo
// todo al máximo y jugando bien»): los tramos que entran hacia los minutos 16,2 y 19,6 pegan menos, el daño del tramo final sube más
// despacio, el tope del director es ×1,2 del 20 al 30 y lo que suma tu nivel al daño, como mucho ×1,15.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v), rand: (a, b) => a + Math.random() * (b - a),
  pick: a => a[Math.floor(Math.random() * a.length)], pickN: (a, n) => a.slice(0, n), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2,
  hash: () => 0.5
};
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} (esperado ${b} ± ${tol})`);

function world() {
  const DEX = [];
  for (let i = 0; i < 80; i++) DEX.push({ dex: 1 + i, name: 'P' + i, types: ['normal'], bst: 480 + i * 3, hp: 200, spd: 100, atk: 100 });
  const G = { U, DEX, DEX_BY: Object.fromEntries(DEX.map(p => [p.dex, p])), SPRITE_META: Object.fromEntries(DEX.map(p => [p.dex, {}])) };
  const ctx = vm.createContext({ G, Math, console });
  vm.runInContext(source('js/data/enemies.js'), ctx, { filename: 'enemies.js' });
  vm.runInContext(source('js/systems/director.js'), ctx, { filename: 'director.js' });
  return { G, ctx };
}

test('los dos últimos tramos (minutos ~16,2 y ~19,6) pegan 20 y 25 (antes 22 y 28): saltos de +43 % y +25 % (antes +57 % y +27 %)', () => {
  const { G } = world(), T = G.Enemies.TIERS;
  assert.equal(T[4].dmg, 20);
  assert.equal(T[5].dmg, 25);
  assert.ok(T[4].dmg / T[3].dmg <= 1.43 + 1e-9, 'salto al tramo 4: ' + T[4].dmg / T[3].dmg);
  assert.ok(T[5].dmg / T[4].dmg <= 1.25 + 1e-9, 'salto al tramo 5: ' + T[5].dmg / T[4].dmg);
  assert.equal(T[3].dmg, 14, 'los de antes, igual');
  assert.deepEqual([T[4].hp, T[5].hp], [150, 250], 'la vida, igual');
});

test('director: tope ×1,2 del minuto 20 al 30; hasta el 10, igual que antes', () => {
  const { G } = world(), D = G.Director;
  near(D.dmgMaxAt(600), 1.1, 1e-9, 'minuto 10');
  near(D.dmgMaxAt(1200), 1.2, 1e-9, 'minuto 20');
  near(D.dmgMaxAt(1500), 1.2, 1e-9, 'minuto 25');
  near(D.dmgMaxAt(1800), 1.2, 1e-9, 'minuto 30');
});

test('director: lo que suma tu nivel al daño llega como mucho a ×1,15; a la vida, sin tope', () => {
  const { G } = world(), D = G.Director;
  D.reset();
  D.debugSet(null, null, 5);           // (now = 0: LV_REF 1 → 4 niveles por encima)
  near(D.dmg(), 1.08, 1e-9, '4 niveles: +2 % cada uno');
  D.debugSet(null, null, 31);          // 30 por encima
  near(D.dmg(), 1.15, 1e-9, 'con todo al máximo, tope');
  near(D.hp(), 1 + 0.03 * 30, 1e-9, 'la vida sigue con el nivel');
});

test('tramo final: el golpe de un enemigo normal sube ×1,23 del lateDmg del 20 al 30 (antes ×1,31) y hasta el 20, igual', () => {
  const { G, ctx } = world();
  G.Coop = { scale: () => 1, scaleRate: () => 1, active: false };
  G.Enemy = class { constructor(def, x, y, sc) { this.def = def; this.dmg = def.dmg * sc.dmg; this.maxHp = this.hp = def.hp * sc.hp; } makeShiny() {} makeGolden() {} };
  G.EnemyMgr = { count: 0, add() {}, all: () => [], bosses: () => [], bossAlive: () => false };
  G.Events = { golden: false }; G.Sprites = { hasShiny: () => false, hovers: () => false, preload() {} };
  G.Camera = { kick() {} }; G.Audio = { sfx() {} };
  vm.runInContext(source('js/systems/spawner.js'), ctx, { filename: 'spawner.js' });
  G.Director.reset();
  const E = G.Enemies, def = { dex: 1, name: 'P0', hp: 100, dmg: 10, behavior: 'chaser' }, who = [{ x: 0, y: 0 }];
  const late = t => G.Spawner.debugMake(def, t, who, false).dmg / (10 * E.scale(t).dmg * E.earlyK(t));
  const lateR = t => Math.pow(Math.min(1, Math.max(0, (t - 900) / 900)), 1.5);
  near(late(1200), 2.4 * (1 + 0.55 * lateR(1200)), 1e-9, 'minuto 20, igual');
  near(late(1800) / late(1200), (1 + 0.55 * lateR(1200) + 0.15 * (1 - lateR(1200))) / (1 + 0.55 * lateR(1200)), 1e-9, 'del 20 al 30');
  assert.ok(late(1800) / 2.4 < 1.24, 'minuto 30: ' + late(1800) / 2.4);
});
