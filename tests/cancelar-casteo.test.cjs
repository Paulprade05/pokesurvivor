// Casteo cortado (20-11-2026): si un enemigo muere o queda inmovilizado mientras prepara un ataque con aviso, el aviso
// se borra y no hace daño; lo ya lanzado sigue. Con world.js, pathing.js, enemy-ai.js, enemy.js y hazards.js de verdad
// en vm y un G de juguete para lo demás (como ai.test.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function codec() { const G = {}; new Function('G', source('js/net/codec.js'))(G); return G.NetCodec; }

function sim(o = {}) {
  let seed = 99;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const G = { LIFT: 18 }, log = { dmg: 0, hits: [], sent: [], shots: [] };
  G.U = {
    rand: (a, b) => a + rnd() * (b - a), randInt: (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick: a => a[Math.floor(rnd() * a.length)],
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2, dist: (a, b, c, d) => Math.hypot(a - c, b - d),
    norm: (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }, damp: (a, b) => b, TYPE_COLOR: {},
    hash(x, y, s = 0) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  };
  G.Tiles = { T: 16, RAISE: 8, CAP_H: 24, BIOMES: [{ liquid: 'water', grass: ['#0', '#1', '#2'], rock: ['#0', '#1', '#2'] }],
              ARENA_THEMES: { normal: { pillars: 0, pools: 0, props: {} } } };
  G.Sprites = { PX: 2, hovers: () => false, bodyRadius: () => 12, bodyHeight: () => 40, dirFromAngle: () => 0, animMeta: () => null, ready: () => false,
                preload() {}, drawShadow() {}, hasShiny: () => false,
                Animator: class { constructor() { this.dir = 0; this.cur = 'Idle'; } loop(a) { this.cur = a; } update() {} play(a) { this.cur = a; } busy() { return false; } draw() {} } };
  const me = { x: 0, y: 0, r: 12, wr: 6, level: 10, dead: false, _vx: 0, _vy: 0, hp: 1000, maxHp: 1000, invuln: 0, kills: 0, bosses: 0,
               hurt(d, type, pure, cat, foe, sk) { this.hp -= d; log.dmg += d; log.hits.push(sk); } };
  G.Game = { player: me, everyone: () => [me], st: { time: 600 } };
  G.DEX_BY = {};
  G.Stats = { sideOf: () => 'physical' };
  G.Camera = { sees: () => true, seesAny: () => true, kick() {}, outerRadius: () => 700 };
  G.Weather = { speedFor: () => 1, current: null, KINDS: {} };
  G.FX = { burst() {}, ring() {}, spark() {}, px() {}, dmgText() {}, twinkle() {}, beam() {}, faintFx() {}, hitFx() {} };
  G.Audio = { sfx() {} };
  G.Coop = { active: !!o.host, isHost: !!o.host, broadcast: ev => log.sent.push(ev), enemyShot() {}, enemyGone() {}, enemyAdded() {} };
  G.Enemies = { eff: () => 300 };
  G.Spawner = { ahead: () => false, say() {}, capAt: () => 80, minions: () => [] };
  G.Projectiles = { count: 0, spawn: x => { log.shots.push(x); return x; } };
  G.VFX = { forType: () => ({}) };
  G.Pickups = { drop() {}, dropXp() {} };
  G.Items = { roll: () => null };
  G.Judgment = { noteDmg() {} }; G.Progress = { kill() {} }; G.Rift = { inArena: false }; G.BossFX = {}; G.Icons = { draw() {} };
  G.Settings = { get: () => false };
  const ctx = vm.createContext({ G, Math, console, performance });
  vm.runInContext(source('js/world/world.js'), ctx, { filename: 'world.js' });
  vm.runInContext(source('js/systems/pathing.js'), ctx, { filename: 'pathing.js' });
  vm.runInContext(source('js/systems/enemy-ai.js'), ctx, { filename: 'enemy-ai.js' });
  vm.runInContext(source('js/core/registro.js'), ctx, { filename: 'registro.js' });
  vm.runInContext(source('js/entities/enemy.js'), ctx, { filename: 'enemy.js' });
  vm.runInContext(source('js/systems/hazards.js'), ctx, { filename: 'hazards.js' });
  G.World.reset(1234, () => 0);
  let dexN = 1000;
  function enemy(x, y, d = {}, boss = false) {
    const dex = dexN++;
    G.DEX_BY[dex] = { dex, name: 'E' + dex, types: d.types || ['electric'] };
    const e = new G.Enemy({ dex, name: 'E', hp: 100, spd: 66, dmg: 10, xp: 1, behavior: d.behavior || 'chase', range: 300, shotCd: 2, shotDmg: 10 },
                          x, y, { hp: 1, spd: 1, dmg: 1 }, boss);
    G.EnemyMgr.add(e);
    return e;
  }
  /** Sólo los peligros (sin mover a los enemigos). */
  function tick(secs) { for (let t = 0; t < secs; t += 1 / 30) G.Hazards.update(1 / 30); }
  /** Todo: enemigos y peligros (como game.js: primero los enemigos). */
  function run(secs) {
    for (let t = 0; t < secs; t += 1 / 30) { G.Path.update(1 / 30, [me]); G.EnemyMgr.update(1 / 30, [me]); G.Hazards.update(1 / 30); }
  }
  const kill = e => { e.hp = 0; e.die(); };
  return { G, me, log, enemy, tick, run, kill };
}

test('a beamer killed during its warning does no damage; alive, the same beam hits', () => {
  for (const dies of [false, true]) {
    const S = sim(), e = S.enemy(100, 0, { behavior: 'beamer' });
    e.special(S.me, -1, 0);
    assert.equal(S.G.Hazards.count, 1);
    S.tick(0.5);
    if (dies) S.kill(e);
    S.tick(1.5);
    assert.equal(S.G.Hazards.count, 0);
    if (dies) assert.equal(S.log.dmg, 0, 'muerto antes de que cayera: sin daño');
    else assert.ok(S.log.dmg > 0, 'vivo: golpea');
  }
});

test('a zoner stunned (or frozen, asleep: applyStun) during its warning loses it', () => {
  const S = sim(), e = S.enemy(150, 0, { behavior: 'zoner' });
  e.special(S.me, -1, 0);
  assert.ok(S.G.Hazards.count >= 1);
  assert.ok(S.G.Hazards.owns(e));
  S.tick(0.4);
  e.applyStun(0.8);
  assert.equal(S.G.Hazards.count, 0, 'aturdido: aviso borrado');
  S.tick(2);
  assert.equal(S.log.dmg, 0);
});

test('a warning that already hit stays (its end), and shots already fired are not touched', () => {
  const S = sim(), e = S.enemy(100, 0, { behavior: 'beamer' });
  e.special(S.me, -1, 0);
  S.tick(1.05);                                // ya ha caído
  const hit = S.log.dmg;
  assert.ok(hit > 0);
  S.kill(e);
  e.shoot(-1, 0);                             // (lo de un enemigo muerto no se llama; aquí sólo se mira que cut no toca disparos)
  const shots = S.log.shots.length;
  S.G.Hazards.cut(e);
  S.tick(1);
  assert.equal(S.log.dmg, hit, 'no vuelve a golpear ni desaparece lo que ya cayó');
  assert.equal(S.log.shots.length, shots);
  assert.ok(!S.log.shots.some(p => p.dead || p.life <= 0), 'los disparos en vuelo siguen');
});

test('a bomber that blows itself up still explodes; killed during the fuse, it does not', () => {
  for (const killed of [false, true]) {
    const S = sim(), e = S.enemy(20, 0, { behavior: 'bomber' });
    e.startFuse();
    S.run(0.4);
    if (killed) S.kill(e);
    S.run(1.2);
    if (killed) assert.equal(S.log.dmg, 0, 'muerto con la mecha encendida: no estalla');
    else { assert.ok(S.log.dmg > 0, 'su propia explosión'); assert.ok(e.dead && e.selfK); }
  }
});

test('stunned while charging up: charger stops aiming, bomber puts out the fuse, jumper stays on the ground', () => {
  const S = sim();
  const c = S.enemy(150, 0, { behavior: 'charger' });
  c.phase = 'aim'; c.pt = 0.55;
  c.applyStun(0.5);
  assert.equal(c.phase, 'walk');
  const b = S.enemy(20, 30, { behavior: 'bomber' });
  b.startFuse();
  b.applyStun(0.5);
  assert.equal(b.phase, 'walk');
  assert.ok(!S.G.Hazards.owns(b));
  const j = S.enemy(120, 0, { behavior: 'jumper' });
  j.startJump(S.me);
  assert.ok(j.jump && j.jump.t < 0 && S.G.Hazards.owns(j));
  j.applyStun(0.5);
  assert.equal(j.jump, null, 'aún agachado: no salta');
  assert.ok(!S.G.Hazards.owns(j));
  S.tick(2);                                  // (sólo los avisos: luego cada uno vuelve a atacar)
  assert.equal(S.log.dmg, 0);
  assert.ok(!b.dead, 'la mecha apagada no lo mata');
});

test('lifted into the air (state air) cuts the cast too', () => {
  const S = sim(), e = S.enemy(100, 0, { behavior: 'beamer' });
  e.special(S.me, -1, 0);
  e.cutCast();                                // (lo que llama stAdd 'air' en combat.js)
  assert.equal(S.G.Hazards.count, 0);
  const combat = source('js/systems/combat.js');
  assert.match(combat, /kind === 'air' && !e\.remote && e\.cutCast\) e\.cutCast\(\)/);
});

test('bosses: killed mid-cast, no damage; stunned, the cast is cut at most once every 4 s', () => {
  const S = sim(), e = S.enemy(150, 0, { types: ['electric'] }, true);
  e.bossInit();
  e.bossStart('beam', S.me, 150);
  assert.ok(e.ai.cast && S.G.Hazards.owns(e));
  S.tick(0.3);
  e.applyStun(0.3);
  assert.equal(e.ai.cast, null, 'aturdido: se corta');
  assert.equal(S.G.Hazards.count, 0);
  e.stunT = 0;
  e.bossStart('beam', S.me, 150);
  e.applyStun(0.3);
  assert.ok(e.ai.cast && S.G.Hazards.owns(e), 'antes de 4 s, como antes');
  S.kill(e);
  S.tick(1.5);
  assert.equal(S.log.dmg, 0, 'muerto: nada de lo que preparaba cae');
  // Sin nada que cortar, el aturdimiento no gasta los 4 s.
  const S2 = sim(), e2 = S2.enemy(150, 0, {}, true);
  e2.bossInit(); e2.ai.cast = null;
  e2.applyStun(0.3);
  assert.ok(!(e2.intAt > 0));
});

test('boss signature: pending fields (pools, «zap») of a dead boss go, active ones stay; the guest gets the owner id', () => {
  const S = sim({ host: true }), e = S.enemy(150, 0, { types: ['water'] }, true);
  e.bossInit();
  S.G.Reg.actor = e;
  // (emit es interno: se pasa por la red como lo manda el anfitrión, con oid)
  S.G.BossSig.onNet({ k: 'pool', x: 0, y: 0, r: 60, dur: 6, delay: 0.5, st: 'water', oid: e.id });
  S.G.BossSig.onNet({ k: 'zap', x: 0, y: 0, r: 60, dur: 0.7, delay: 0.5, eff: 'freeze', oid: e.id });
  S.G.BossSig.onNet({ k: 'pool', x: 0, y: 0, r: 60, dur: 6, delay: 0, st: 'water', oid: e.id });
  S.G.Reg.actor = null;
  S.G.BossSig.update(0.1);
  assert.equal(S.G.BossSig.fields.length, 3);
  S.G.Hazards.cut(e.id);
  assert.equal(S.G.BossSig.fields.length, 1, 'el que ya está activo sigue');
  assert.equal(S.G.BossSig.fields[0].delay, 0);
  // Lo que manda el anfitrión lleva el dueño (hz.oid y bsg.oid).
  e.hazard({ kind: 'zone', x: 0, y: 0, r: 40, delay: 1, dmg: 10 });
  const hz = S.log.sent.find(ev => ev[0] === 'hz');
  assert.equal(hz[1].oid, e.id);
  S.kill(e);
  S.G.Hazards.update(1 / 30);
  assert.deepEqual(JSON.parse(JSON.stringify(S.log.sent.filter(ev => ev[0] === 'hzx'))), [['hzx', e.id]]);
  assert.match(source('js/entities/enemy.js'), /if \(by && by\.boss && o\.oid == null && typeof by\.id === 'number'\) o\.oid = by\.id;/);
});

test('co-op: a guest drops the warnings of the owner the host says (hzx); an old host (no oid) changes nothing', () => {
  const S = sim();
  S.G.Hazards.add({ kind: 'zone', x: 0, y: 0, r: 40, delay: 1, dmg: 10, oid: 7 }, true);
  S.G.Hazards.add({ kind: 'zone', x: 0, y: 0, r: 40, delay: 1, dmg: 10, oid: 8 }, true);
  S.G.Hazards.add({ kind: 'zone', x: 0, y: 0, r: 40, delay: 1, dmg: 10 }, true);
  S.G.Hazards.add({ kind: 'zone', x: 0, y: 0, r: 40, delay: 1, dmg: 10, oid: 'x' }, true);
  assert.equal(S.G.Hazards.cut(7), 1);
  assert.equal(S.log.sent.length, 0, 'el invitado no lo reenvía');
  S.tick(1.2);
  assert.equal(S.log.hits.length, 3, 'los otros caen (sin oid, o con uno que no vale: como antes)');
  // Por la red: ['hzx', id] pasa por el codificador y coop.js lo aplica.
  const C = codec();
  const G = {}, called = [];
  G.Net = { uid: 'guest', on(fn) { G.recv = fn; }, onPeer() {}, slow: () => false, send() {}, toHost() {} };
  G.Player = class { constructor() { this.maxHp = 300; } };
  G.DEX_BY = { 25: { dex: 25 } }; G.baseStartOf = () => 'thundershock';
  G.Sprites = { preload() {} }; G.U = { dist2: () => 0, clamp: (v, a, b) => (v < a ? a : v > b ? b : v) };
  G.EnemyMgr = { all: () => [], get: () => null, addRemote() {} }; G.Judgment = { netState: () => null, netApply() {} };
  G.Projectiles = { clearOrbs() {}, spawn() {} }; G.VFX = { forType: t => ({ t }) };
  G.Hazards = { add() {}, cut: id => called.push(id) };
  G.Spawner = { say() {} }; G.Social = { me: { name: 'guest' } };
  new Function('G', 'document', source('js/net/coop.js'))(G, { addEventListener() {} });
  const local = { x: 0, y: 0, moveAngle: 0, walking: false, hp: 1, maxHp: 1, magnet: 1, aim: 0, xpMul: 1, reviveT: 0, activeGroup: () => [] };
  G.Coop.begin({ host: 'host', members: [{ uid: 'host', name: 'Ana', dex: 25 }, { uid: 'guest', name: 'Bea', dex: 25 }] }, local,
    { team: () => ({ time: 1, level: 1, xp: 0, xpNext: 10, kills: 0, bosses: 0, coins: 0, t1: 0, t10: 0 }), choosing: () => false, syncTeam() {} });
  G.recv('host', C.decode(C.encode({ k: 'f', ev: [['hzx', 7], ['hzx', 'nope']] })));
  assert.deepEqual(called, [7]);
});
