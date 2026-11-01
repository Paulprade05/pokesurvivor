// Cooperativo × jugadores (01-11-2026, lo pidió el dueño): con N jugadores, subir de nivel cuesta N veces lo de
// solitario y TODOS los enemigos (normales, jefes del mapa, legendarios de grieta) tienen ×N de vida y de daño.
// Con N = 1 nada cambia. El DPS que se mide es del equipo: no se debe aplicar la N dos veces.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// (Con margen por los redondeos de la vida: ±4 o 0,5 %.)
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= Math.max(4, Math.abs(b) * 0.005), `${msg}: ${a} ≠ ${b}`);

// ---------------- experiencia (coop.js de verdad) ----------------

function coop(n) {
  const G = {};
  G.Net = { uid: 'p0', on() {}, onPeer() {}, slow: () => false, send() {}, toHost() {} };
  G.Player = class { constructor() { this.maxHp = 300; } };
  G.DEX_BY = { 25: { dex: 25 } }; G.baseStartOf = () => 'thundershock';
  G.Sprites = { preload() {} }; G.U = { dist2: () => 0 };
  new Function('G', 'document', source('js/net/coop.js'))(G, { addEventListener() {} });
  const local = { x: 0, y: 0, moveAngle: 0, walking: false, hp: 1, maxHp: 1, magnet: 1, aim: 0, xpMul: 1, reviveT: 0, activeGroup: () => [] };
  const members = Array.from({ length: n }, (_, i) => ({ uid: 'p' + i, name: 'J' + i, dex: 25 }));
  G.Coop.begin({ host: 'p0', members }, local, { team: () => ({}), choosing: () => false, syncTeam() {} });
  return G.Coop;
}

test('coop × N: la experiencia que se gana es ÷N (cada nivel cuesta N veces lo de solitario)', () => {
  for (const n of [1, 2, 4]) near(coop(n).xpFactor(), 1 / n, 'N=' + n);
  // Si uno se va, cuenta con los que quedan.
  const C = coop(4);
  C.mates[0].connected = false;
  near(C.xpFactor(), 1 / 3, 'uno se va');
  assert.equal(C.scale(1), 1); assert.equal(C.scale(2), 2); assert.equal(C.scale(4), 4); assert.equal(C.scale(0), 1);
});

// ---------------- enemigos normales y jefes del mapa (spawner.js + enemies.js de verdad) ----------------

function spawner(dps = 0) {
  const G = {};
  G.U = { clamp: (v, a, b) => (v < a ? a : v > b ? b : v), pick: a => a[0], rand: (a) => a, dist2: () => 1e9 };
  G.DEX = []; G.DEX_BY = {};
  const ctx = vm.createContext({ G, Math, console });
  vm.runInContext(source('js/data/enemies.js'), ctx, { filename: 'enemies.js' });
  vm.runInContext(source('js/systems/director.js'), ctx, { filename: 'director.js' });
  G.Director.reset();
  G.Judgment = { longDps: () => dps };
  G.Coop = { scale: n => Math.max(1, Math.floor(n) || 1), scaleRate: () => 1, active: false };
  G.Enemy = class {
    constructor(def, x, y, sc, boss) {
      Object.assign(this, { def, dex: def.dex, x, y, boss: !!boss, behavior: def.behavior, maxHp: Math.round(def.hp * sc.hp), dmg: def.dmg * sc.dmg });
      this.hp = this.maxHp;
    }
    makeShiny() {} makeGolden() {} makeChamp() {}
  };
  G.EnemyMgr = { count: 0, add() {}, all: () => [], bosses: () => [] };
  G.Events = { golden: false };
  G.Sprites = { hasShiny: () => false, hovers: () => false };
  G.Camera = { kick() {} }; G.Audio = { sfx() {} };
  vm.runInContext(source('js/systems/spawner.js'), ctx, { filename: 'spawner.js' });
  return G;
}
const team = n => Array.from({ length: n }, () => ({ x: 0, y: 0 }));
const DEF = { dex: 19, name: 'R', hp: 40, dmg: 8, spd: 60, xp: 1, behavior: 'chase' };
const BOSS = { dex: 149, name: 'D', hp: 9000, dmg: 30, spd: 60, xp: 50, behavior: 'charger' };

test('coop × N: vida y daño de los enemigos normales ×N (y el director los mide como de solitario)', () => {
  for (const t of [120, 900, 1500]) {
    const one = spawner().Spawner.debugMake(DEF, t, team(1));
    for (const n of [2, 4]) {
      const e = spawner().Spawner.debugMake(DEF, t, team(n));
      near(e.maxHp, one.maxHp * n, `vida N=${n} t=${t}`);
      near(e.dmg, one.dmg * n, `daño N=${n} t=${t}`);
      assert.equal(e.coopN, n);
    }
    assert.equal(one.coopN, 1);
  }
});

test('coop × N: jefes del mapa ×N, también con el techo por DPS (bossCap) sin contar la N dos veces', () => {
  for (const t of [300, 900, 1500]) {
    // Sin DPS medido (el techo no actúa).
    const one = spawner().Spawner.debugMake(BOSS, t, team(1), true);
    // Con DPS medido: el equipo hace N veces el de uno.
    const oneD = spawner(400).Spawner.debugMake(BOSS, t, team(1), true);
    for (const n of [2, 4]) {
      const e = spawner().Spawner.debugMake(BOSS, t, team(n), true);
      near(e.maxHp, one.maxHp * n, `vida N=${n} t=${t}`);
      near(e.dmg, one.dmg * n, `daño N=${n} t=${t}`);
      const eD = spawner(400 * n).Spawner.debugMake(BOSS, t, team(n), true);
      near(eD.maxHp, oneD.maxHp * n, `vida con DPS N=${n} t=${t}`);
    }
    assert.ok(oneD.maxHp < one.maxHp, 'el techo por DPS sigue bajando la vida en solitario');
  }
});

test('coop × N: vida de los legendarios por DPS (bossHp) ×N con el DPS del equipo', () => {
  for (const t of [300, 900, 1500]) {
    for (const d of [0, 150, 2000, 30000]) {
      const one = spawner(d).Enemies.bossHp(5000, t, 'leg');
      for (const n of [2, 4]) near(spawner(d * n).Enemies.bossHp(5000, t, 'leg', n), one * n, `N=${n} dps=${d} t=${t}`);
      near(spawner(d).Enemies.bossHp(5000, t, 'leg', 1), one, 'N=1 igual que antes');
    }
  }
});

// ---------------- director: no deshace ni dobla la N ----------------

test('coop × N: el director mide lo que tardaría uno en tumbar uno de solitario', () => {
  const G = { U: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) }, Coop: { active: true, hitter: 'a' } };
  vm.runInContext(source('js/systems/director.js'), vm.createContext({ G, Math }), { filename: 'director.js' });
  const D = G.Director;
  const geoOf = (maxHp, coopN, hitters, dps) => {
    D.reset();
    let t = 600, id = 0;
    for (let i = 0; i < 20; i++) {
      const e = { id: ++id, maxHp, coopN };
      const ttk = maxHp / dps;
      D.update(0, [], t);
      for (const h of hitters) { G.Coop.hitter = h; D.hit(e, maxHp / hitters.length); }
      t += ttk; D.update(0, [], t); D.kill(e);
    }
    return D.geo;
  };
  const solo = geoOf(100, 1, ['a'], 100);                       // 1 s
  // Dos jugadores, cada uno a lo suyo: enemigo de 200 al ritmo de uno → como solitario (el doble de tiempo es lo pedido).
  near(geoOf(200, 2, ['a'], 100), solo, 'cada uno a lo suyo');
  // Los dos al mismo: enemigo de 200 al ritmo de dos → también como solitario.
  near(geoOf(200, 2, ['a', 'b'], 200), solo, 'los dos al mismo');
  near(geoOf(400, 4, ['a', 'b', 'c', 'd'], 400), solo, 'cuatro al mismo');
});
