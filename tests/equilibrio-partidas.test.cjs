// Equilibrio tras las partidas del dueño (11-11-2026): Beso Drenaje cura con tope por segundo, el daño de los enemigos sube
// más despacio del minuto 20 al 30 (y los dúos pegan menos cada uno) y las grietas son más regulares (el tipo cuenta la
// mitad en la arena, como mucho un legendario que os gane por tipo y la fuerza va con la marca del calendario).
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

// ---------------------------------------------------------------- Beso Drenaje
test('Beso Drenaje: cura como mucho 1,2 %/s de la vida al nivel 1, +0,3 % por nivel y ×1,5 evolucionado (antes 5-35 %/s)', () => {
  const S = require('../tools/sandbox.cjs');
  const want = [[1, false, 1.2], [2, false, 1.5], [3, false, 1.8], [4, false, 2.1], [5, false, 2.4], [5, true, 3.6]];
  for (const hp of [185, 400]) for (const [lvl, evo, pct] of want) {
    const r = S.run({ id: 'draining-kiss', lvl, evo, scen: 'horda', secs: 30, maxHp: hp });
    near(r.heal / 30 / hp * 100, pct, 0.1, `vida ${hp}, nivel ${lvl}${evo ? ' evo' : ''}, % de vida por segundo`);
  }
});

test('Beso Drenaje: más besos (nivel 5 y evolución: 3 y 5 a la vez) no curan más que su tope', () => {
  const S = require('../tools/sandbox.cjs');
  const a = S.run({ id: 'draining-kiss', lvl: 5, evo: true, scen: 'horda', secs: 30, maxHp: 200 });
  assert.ok(a.hits / 30 > 8, 'evolucionado lanza muchos besos: ' + a.hits / 30);
  assert.ok(a.heal / 30 <= 200 * 0.036 + 0.3, 'pero cura como mucho 3,6 %/s: ' + a.heal / 30);
});

test('Beso Drenaje: con poco daño cura la mitad del daño (no llega al tope)', () => {
  const S = require('../tools/sandbox.cjs');
  // (Vida enorme: el tope no cuenta; con ataque 1 y 18 de daño, 9 por beso.)
  const r = S.run({ id: 'draining-kiss', lvl: 1, scen: 'solo', secs: 20, maxHp: 1e7 });
  near(r.heal / r.hits, r.perHit * 0.5, 0.01, 'cura por beso');
});

// ---------------------------------------------------------------- minutos 20-30
function enemies() {
  const DEX = [];
  for (let i = 0; i < 80; i++) DEX.push({ dex: 1 + i, name: 'P' + i, types: ['normal'], bst: 480 + i * 3, hp: 200, spd: 100, atk: 100 });
  const G = { U, DEX, DEX_BY: Object.fromEntries(DEX.map(p => [p.dex, p])), SPRITE_META: Object.fromEntries(DEX.map(p => [p.dex, {}])) };
  vm.runInContext(source('js/data/enemies.js'), vm.createContext({ G, Math, console }), { filename: 'enemies.js' });
  return G;
}

test('minutos 20-30: el daño de los enemigos y jefes sube la mitad de rápido desde el minuto 20; hasta el 20, igual', () => {
  const E = enemies().Enemies;
  for (const t of [0, 300, 600, 900, 1100, 1200]) {
    const e = E.eff(t);
    near(E.scale(t).dmg, 1 + e / 420, 1e-9, 'normales, igual que antes en ' + t);
    near(E.bossScale(t).dmg, 1 + e / 600, 1e-9, 'jefes, igual que antes en ' + t);
  }
  assert.equal(E.DMG_KNEE, 525);
  near(E.eff(1200), 525, 1e-9, 'la rodilla es el minuto 20');
  // Del 20 al 30: crece, pero menos (antes 2,25 → 3,57).
  near(E.scale(1800).dmg, 1 + (525 + (1080 - 525) / 2) / 420, 1e-9, 'minuto 30');
  let prev = 0;
  for (let t = 1200; t <= 1800; t += 30) { const d = E.scale(t).dmg; assert.ok(d > prev, 'sigue subiendo en ' + t); prev = d; }
  assert.ok(E.scale(1800).dmg / E.scale(1200).dmg < 1.32, 'del 20 al 30, como mucho ×1,3 (antes ×1,59)');
  // (La vida no cambia.)
  near(E.scale(1800).hp, 1 + 1080 / 95, 1e-9, 'vida del minuto 30');
});

test('minutos 20-30: el tope del director es ×1,25 en el 20 y ×1,3 en el 30 (antes 1,3 y 1,5)', () => {
  const G = enemies();
  vm.runInContext(source('js/systems/director.js'), vm.createContext({ G, Math, console }), { filename: 'director.js' });
  near(G.Director.dmgMaxAt(1200), 1.25, 1e-9, 'minuto 20');
  near(G.Director.dmgMaxAt(1800), 1.3, 1e-9, 'minuto 30');
  near(G.Director.dmgMaxAt(600), 1.1, 1e-9, 'minuto 10, igual');
});

test('minutos 20-30: los jefes de los dúos (25:00 y 27:30) llevan la marca duo; los demás, no', () => {
  const E = enemies().Enemies;
  const { bosses } = E.rollRun();
  assert.deepEqual([...bosses.filter(b => b.duo).map(b => b.mark)], [1500, 1500, 1650, 1650]);
  assert.equal(bosses.filter(b => !b.duo).length, 9);
});

test('minutos 20-30: un jefe de dúo sale con un 20 % menos de daño (spawner.js)', () => {
  const G = enemies();
  const ctx = vm.createContext({ G, Math, console });
  vm.runInContext(source('js/systems/director.js'), ctx, { filename: 'director.js' });
  G.Coop = { scale: () => 1, scaleRate: () => 1, active: false };
  const made = [];
  G.Enemy = class { constructor(def, x, y, sc) { this.def = def; this.dmg = def.dmg * sc.dmg; this.maxHp = this.hp = def.hp * sc.hp; made.push(this); } };
  G.EnemyMgr = { count: 0, add() {}, all: () => [], bosses: () => [], bossAlive: () => false };
  G.Events = { golden: false }; G.Sprites = { hasShiny: () => false, hovers: () => false, preload() {} };
  G.Camera = { kick() {} }; G.Audio = { sfx() {} };
  vm.runInContext(source('js/systems/spawner.js'), ctx, { filename: 'spawner.js' });
  const b = { dex: 1, name: 'P0', hp: 1000, dmg: 50, at: 1500 }, who = [{ x: 0, y: 0 }];
  const solo = G.Spawner.debugMake(b, 1500, who, true), duo = G.Spawner.debugMake(Object.assign({}, b, { duo: true }), 1500, who, true);
  near(duo.dmg / solo.dmg, 0.8, 1e-9, 'dúo / solo');
});

// ---------------------------------------------------------------- grietas
test('grietas: en la arena el tipo cuenta la mitad (raíz cuadrada), en los dos sentidos', () => {
  const G = { U };
  vm.runInContext(source('js/data/types.js'), vm.createContext({ G, Math }), { filename: 'types.js' });
  near(G.Types.legK(1.6), Math.sqrt(1.6), 1e-9, 'súper eficaz');
  near(G.Types.legK(0.6), Math.sqrt(0.6), 1e-9, 'poco eficaz');
  near(G.Types.legK(1), 1, 1e-9, 'neutro');
  // Lo usan player.js (lo que te hacen dentro de la arena) y combat.js (lo que les haces a los legendarios).
  assert.match(source('js/entities/player.js'), /G\.Rift\.inArena && G\.Types\.legK \? G\.Types\.legK\(k0\)/);
  assert.match(source('js/systems/combat.js'), /e\.legend && G\.Types\.legK \? G\.Types\.legK\(k\)/);
});

function rift(myTypes) {
  const G = { U };
  const ctx = vm.createContext({ G, console, Math, performance: { now: () => 0 } });
  vm.runInContext(source('js/data/types.js'), ctx, { filename: 'types.js' });
  const me = { x: 0, y: 0, dead: false, mon: { types: myTypes } };
  G.Game = { player: me, everyone: () => [me], st: { time: 0 } };
  const sent = [];
  G.Coop = { active: true, isHost: true, broadcast: ev => sent.push(ev), toHost() {}, scale: () => 1 };
  G.Judgment = { AT: 1800 };
  G.World = { TS: 48, isFree: () => true };
  G.Audio = { sfx() {} }; G.FX = { ring() {} }; G.Touch = { reset() {} };
  G.Sprites = { hasShiny: () => false, preload() {}, Animator: class { constructor() { this.dir = 0; } } };
  G.DB = { save: { legends: {} } };
  // 6 legendarios de Agua y 6 Normal.
  G.DEX = [];
  for (let i = 0; i < 12; i++) G.DEX.push({ dex: 900 + i, name: 'L' + i, leg: true, types: [i < 6 ? 'water' : 'normal'] });
  G.DEX_BY = Object.fromEntries(G.DEX.map(p => [p.dex, p]));
  G.SPRITE_META = Object.fromEntries(G.DEX.map(p => [p.dex, {}]));
  const st = { alive: false };
  G.EnemyMgr = { bossAlive: () => st.alive, stash() {}, clearRemote() {} };
  G.Spawner = { bossDue: () => false };
  vm.runInContext(source('js/systems/rift.js'), ctx, { filename: 'rift.js' });
  G.Rift.reset();
  const arenas = () => sent.filter(e => e[0] === 'arena').map(e => e[1]);
  return { G, R: G.Rift, me, arenas };
}

test('grietas: como mucho un legendario cuyo tipo te gane (3 de Agua contra Fuego eran la más dura)', () => {
  for (let k = 0; k < 40; k++) {
    const { G, R, arenas } = rift(['fire']);
    R.debugArena('water', 3);
    const cfg = arenas()[0];
    assert.equal(cfg.dexes.length, 3);
    assert.equal(cfg.type, 'water', 'la arena sigue siendo de Agua');
    const beats = cfg.dexes.filter(d => G.Types.mult(G.DEX_BY[d].types[0], ['fire']) > 1.05).length;
    assert.ok(beats <= 1, 'legendarios que te ganan: ' + beats);
  }
  // Si no te gana ninguno, siguen siendo todos del tipo de la arena.
  const { G, R, arenas } = rift(['grass']);
  R.debugArena('water', 3);
  assert.ok(arenas()[0].dexes.every(d => G.DEX_BY[d].types.includes('water')));
});

test('grietas: cuántos legendarios y su fuerza van con la marca del calendario, no con cuándo se abre', () => {
  const { G, R, arenas } = rift(['normal']);
  // Hasta que se abre la grieta de la marca 600 (la del minuto 10).
  let t = 0;
  for (; t < 900 && !(R.rift && R.rift.mark === 600); t += 1) {
    G.Game.st.time = t;
    if (R.rift && R.rift.mark === 300) { R.rift.ttl = 0; }      // (la del 5 se cierra sin entrar)
    R.update(1, G.Game.player, t);
  }
  assert.ok(R.rift && R.rift.mark === 600, 'se ha abierto la grieta del minuto 10');
  // Se entra mucho más tarde, ya en el minuto 21: siguen siendo 2 legendarios (los del 10), no 3.
  G.Game.st.time = 1260;
  R.enterRequest();
  const cfg = arenas().pop();
  assert.equal(cfg.tm, 600);
  assert.equal(cfg.dexes.length, 2);
});
