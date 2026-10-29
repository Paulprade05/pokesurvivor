// Firmas de los jefes (G.BossSig, entities/enemy.js), viaje por la grieta y llegada del
// legendario (systems/rift.js) y lo que va por la red (coop.js). 26-10-2026.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function codec() { const G = {}; new Function('G', source('js/net/codec.js'))(G); return G.NetCodec; }
const C = codec();

// ---------------- un G de juguete con lo que usan enemy.js y rift.js ----------------
function world(opts = {}) {
  const G = { LIFT: 18 }, log = { hz: [], shots: [], say: [], sent: [], wx: [], flash: 0, spawned: [] };
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  G.U = {
    rand: (a, b) => a + rnd() * (b - a), pick: a => a[Math.floor(rnd() * a.length)], clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2, dist: (a, b, c, d) => Math.hypot(a - c, b - d), hash: (x, y, s) => ((Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (s | 0)) >>> 0) / 4294967296,
    TYPE_COLOR: { normal: '#b0a99f', fire: '#ff7b3d', water: '#4b9bff', grass: '#5fcb6a', electric: '#ffd33d', ice: '#7fe0e0', fighting: '#e0533d', poison: '#b45ec4',
                  ground: '#d6b25c', flying: '#9bb8ff', psychic: '#ff5f9e', bug: '#a3c43d', rock: '#bfa96b', ghost: '#7a6bc4', dragon: '#6b58ff', dark: '#6b5c52', steel: '#a8b8c4', fairy: '#ff9ed8' },
    norm: (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
  };
  const me = Object.assign({ x: 0, y: 0, r: 12, wr: 6, hp: 500, maxHp: 500, dead: false, slowT: 0, invuln: 0, uid: opts.uid, form: 6, dex: 6,
    hurt(d) { this.hp -= d; log.hits = (log.hits || 0) + d; } }, opts.me || {});
  const enemies = new Map();
  G.Game = { player: me, everyone: () => [me, ...(opts.mates || [])], flash() { log.flash++; }, st: { time: 600 } };
  G.Spawner = { say: s => log.say.push(s) };
  G.Weather = { current: null, KINDS: { sun: {}, rain: {}, snow: {}, sand: {}, fog: {} }, debugStart: k => log.wx.push(k), force() {}, clear() {} };
  G.Coop = { active: !!opts.host, isHost: !!opts.host, broadcast: ev => log.sent.push(ev), scaleHp: () => 1, toHost() {} };
  G.EnemyMgr = { get: id => enemies.get(id), bosses: () => [...enemies.values()].filter(e => e.boss && !e.dead), add: e => { enemies.set(e.id, e); log.spawned.push(e); },
                 stash() {}, clearRemote() {}, restore() {}, all: () => [...enemies.values()] };
  G.Camera = { kick() {}, sees: () => true, x: 0, y: 0, left: () => -400, top: () => -200, w: 800, h: 400, scale: 2 };
  G.FX = { ring() {}, burst() {}, px() {}, dmgText() {} };
  G.Audio = { sfx() {} };
  G.World = { isFree: () => true, collide() {}, setArena() {}, setBiome() {}, biome: 0 };
  G.Sprites = { PX: 2, hasShiny: () => false, dirFromAngle: () => 0, preload() {}, bodyRadius: () => 20, bodyHeight: () => 60, drawShadow() {},
                Animator: class { constructor(d) { this.dex = d; this.dir = 0; } loop() {} update() {} play() {} draw() {} } };
  G.DEX = [{ dex: 383, name: 'Groudon', types: ['ground'], leg: true, spd: 100 }, { dex: 382, name: 'Kyogre', types: ['water'], leg: true, spd: 100 },
           { dex: 145, name: 'Zapdos', types: ['electric', 'flying'], leg: true, spd: 120 }, { dex: 6, name: 'Charizard', types: ['fire', 'flying'] }];
  G.DEX_BY = Object.fromEntries(G.DEX.map(p => [p.dex, p]));
  G.SPRITE_META = { 383: {}, 382: {}, 145: {}, 6: {} };
  G.Hazards = { add: o => log.hz.push(o), clear() {} };
  G.BossFX = {};
  return { G, log, me, enemies };
}

/** Un jefe de mentira con lo que usan las firmas. */
function fakeBoss(G, log, dex, types, id = 1) {
  return { id, dex, types, atkType: types[0], x: 200, y: 0, r: 24, bodyH: 70, scale: 1.5, boss: true, dmg: 60, spd: 60, cat: 'special', name: 'X' + dex,
    ai: { fury: false, cd: 0 }, anim: { play() {}, dir: 0 }, sigK: 1, shiny: false,
    tell() {}, hazard(o) { log.hz.push(o); }, fire() { log.shots.push(1); }, shotDmg() { return 20; }, crowd() { return 1; },
    bossEnd() { this.ai.cast = null; return [0, 0, 'Idle']; } };
}

function loadEnemy(G, warns = null) {
  const con = warns ? Object.assign({}, console, { warn: (...a) => warns.push(a.map(String).join(' ')) }) : console;
  const ctx = vm.createContext({ G, console: con, performance: { now: () => 0 }, Math });
  vm.runInContext(source('js/entities/enemy.js'), ctx, { filename: 'enemy.js' });
  return G.BossSig;
}

/** Lanza la firma de `dex` contra ti (en (0, 0)) y la deja acabar. Devuelve lo que ha pasado. */
function runSig(dex, types, opts = {}) {
  const w = world(opts), warns = [];
  w.G.Projectiles = { count: 0, spawn: o => { w.log.shots.push(o); return o; } };
  w.G.VFX = { forType: t => ({ t }) };
  w.G.DEX_BY[dex] = w.G.DEX_BY[dex] || { dex, name: 'X', types, leg: dex > 140 && dex < 1100, spd: 100, df: 80, sd: 80, pa: 1, sa: 1 };
  const B = loadEnemy(w.G, warns);
  const e = fakeBoss(w.G, w.log, dex, types);
  e.maxHp = e.hp = 10000;
  w.G.EnemyMgr.add(e);
  B.init(e);
  if (opts.sig) e.sig = opts.sig;
  e.ai.sigT = 0;
  B.due(e, 0.01, 1, 100);
  B.start(e, w.me);
  let t = 0, moved = 0, seen = 0;
  while (e.ai.cast && t < 14) {
    const r = B.cast(e, 1 / 30, w.me, e.ai.cast) || [0, 0];
    if (r[0] || r[1]) { e.x += r[0] / 30; e.y += r[1] / 30; moved++; }
    B.update(1 / 30); t += 1 / 30;
    seen = Math.max(seen, B.fields.length + B.marks.filter(m => m.k !== 'label').length);
  }
  for (let i = 0; i < 360; i++) { if (i % 30 === 0) B.tickBoss(e, 1 / 30); B.update(1 / 30); }
  return { w, B, e, warns, t, moved, seen };
}

test('EVERY signature (each legendary, each calendar boss and each type with each flavour) runs to the end without errors', () => {
  const { G } = world(); const S = loadEnemy(G);
  const cases = Object.entries(S.SIG).map(([d, def]) => [+d, ['fire'], null, def[1]]);
  for (const [t, def] of Object.entries(S.BY_TYPE)) for (const fl of ['fast', 'bulk', 'spec', 'phys']) cases.push([9000, [t], { p: def[0], name: def[1], o: Object.assign({ fl }, def[2]) }, def[1] + '/' + fl]);
  for (const [dex, types, sig, name] of cases) {
    const r = runSig(dex, types, { sig });
    assert.deepEqual(r.warns, [], name + ': ' + r.warns.join(' | '));
    assert.ok(!r.e.ai.cast, name + ' no acaba');
    assert.ok(!r.e.sigHide, name + ' se queda escondido');
    assert.equal(r.e.sigK, 1, name + ' se queda con la barrera');
    assert.ok(!(r.e.sigVulnK > 1), name + ' se queda expuesto');
    assert.ok(r.t < 9, name + ' dura demasiado: ' + r.t.toFixed(1) + ' s');
    const did = r.w.log.hz.length + r.w.log.shots.length + (r.w.log.hits || 0) + r.seen + r.moved;
    assert.ok(did > 0 || /Salpicadura/.test(name), name + ' no hace nada');
  }
});

test('no two signatures in the table are the same (piece + options)', () => {
  const { G } = world(); const S = loadEnemy(G);
  const seen = new Map();
  for (const [d, [p, , o]] of Object.entries(S.SIG)) {
    const k = p + JSON.stringify(Object.assign({}, o, { st: undefined, w: undefined, name2: undefined, n: undefined, r: undefined, delay: undefined }));
    assert.ok(!seen.has(k), `${d} y ${seen.get(k)} hacen lo mismo (${k})`);
    seen.set(k, d);
  }
});

test('your Pokémon: asleep or frozen stays put, confused goes the other way, on ice it slides, and it wakes up immune for a moment', () => {
  const w = world(); const S = loadEnemy(w.G);
  const me = w.me;
  S.update(1 / 30);                                     // (apunta dónde está)
  S.onNet({ k: 'zap', x: 0, y: 0, r: 40, delay: 0, dur: 0.2, eff: 'sleep', p: 1 });
  S.update(1 / 30);
  assert.ok(S.status.stun > 0, 'dormido');
  me.x += 5; S.update(1 / 30);                          // intenta moverse
  assert.equal(me.x, 0, 'dormido no se mueve');
  for (let i = 0; i < 40; i++) S.update(1 / 30);
  assert.ok(!(S.status.stun > 0) && S.status.imm > 0, 'se despierta y no se le puede volver a dormir enseguida');
  S.onNet({ k: 'zap', x: 0, y: 0, r: 40, delay: 0, dur: 0.2, eff: 'freeze' });
  S.update(1 / 30);
  assert.ok(!(S.status.stun > 0), 'inmune un momento');
  // Confuso: lo que se mueve, al revés.
  S.onNet({ k: 'zap', x: me.x, y: me.y, r: 40, delay: 0, dur: 0.2, eff: 'conf', p: 2 });
  S.update(1 / 30);
  const x0 = me.x; me.x += 4; S.update(1 / 30);
  assert.ok(Math.abs(me.x - (x0 - 4)) < 0.01, 'confuso va al revés');
  for (let i = 0; i < 80; i++) S.update(1 / 30);
  // Sobre hielo: sigue resbalando aunque ya no te muevas.
  S.onNet({ k: 'pool', x: me.x, y: me.y, r: 200, dur: 5, delay: 0, slide: 1, st: 'ice' });
  for (let i = 0; i < 10; i++) { me.x += 5; S.update(1 / 30); }
  const xs = me.x; S.update(1 / 30); S.update(1 / 30);
  assert.ok(me.x > xs + 1, 'resbala');
  // Quemado: le va quitando vida.
  const hits0 = w.log.hits || 0;
  S.onNet({ k: 'zap', x: me.x, y: me.y, r: 40, delay: 0, dur: 0.2, eff: 'burn', p: 6 });
  for (let i = 0; i < 60; i++) S.update(1 / 30);
  assert.ok((w.log.hits || 0) - hits0 >= 12, 'quemado');
});

test('fields: the Surf wave misses you in its gap; the square cage hits once you stay inside; swap moves only the one it names', () => {
  const w = world({ uid: 'me1' }); const S = loadEnemy(w.G);
  // Ola de izquierda a derecha con el hueco donde estás (lat 0): no te da.
  S.onNet({ k: 'sweep', x: -300, y: 0, ax: 1, ay: 0, spd: 300, L: 400, th: 30, gap: 0, gw: 40, delay: 0, dur: 3, dmg: 40 });
  for (let i = 0; i < 60; i++) S.update(1 / 30);
  assert.equal(w.log.hits || 0, 0);
  S.onNet({ k: 'sweep', x: -300, y: 0, ax: 1, ay: 0, spd: 300, L: 400, th: 30, gap: 200, gw: 40, delay: 0, dur: 3, dmg: 40 });
  for (let i = 0; i < 60; i++) S.update(1 / 30);
  assert.equal(w.log.hits, 40, 'sin el hueco, una vez');
  w.me.x = 0; w.me.y = 0;
  S.onNet({ k: 'box', x: 0, y: 0, R0: 160, R1: 30, dur: 1, dmg: 20 });
  for (let i = 0; i < 40; i++) S.update(1 / 30);
  assert.ok(w.log.hits >= 40 + 20 * 1.7 - 0.01, 'cerrada contigo dentro');
  // Cambiaalmas: a otro no le mueve; a ti, sí.
  w.me.x = 0; w.me.y = 0;
  S.onNet({ k: 'swap', tg: 'other', x: 300, y: 40, x2: 0, y2: 0, at: 0.2, dur: 0.5 });
  for (let i = 0; i < 20; i++) S.update(1 / 30);
  assert.equal(w.me.x, 0);
  S.onNet({ k: 'swap', tg: 'me1', x: 300, y: 40, x2: 0, y2: 0, at: 0.2, dur: 0.5 });
  for (let i = 0; i < 20; i++) S.update(1 / 30);
  assert.equal(w.me.x, 300); assert.equal(w.me.y, 40);
});

test('all legendaries of the rifts and the common calendar bosses have their own signature', () => {
  const G = { BossFX: {} };
  vm.runInContext(source('js/data/pokedex.js'), vm.createContext({ G }));
  const dex = G.DEX;
  const { G: W } = world(); const S = loadEnemy(W);
  // Todos los legendarios con sprite (los que salen en las grietas) están en la tabla.
  vm.runInContext(source('js/data/sprites-meta.js'), vm.createContext({ G }));
  const withSprite = dex.filter(p => p.leg && G.SPRITE_META[p.dex]);
  assert.deepEqual([...withSprite.filter(p => !S.SIG[p.dex]).map(p => p.name)], []);
  // Y todos los demás jefes caen en una de tipo (nunca sin firma).
  for (const p of dex.filter(q => !q.leg).slice(0, 400)) assert.ok(S.forDex(p.dex, p.types).name, p.name);
});

test('fields: a wave misses you in its gap; a ring only hits inside; a closing cage hits once you stay inside', () => {
  const w = world(); const S = loadEnemy(w.G);
  // Onda con el hueco hacia ti (x positivo): no te da.
  S.onNet({ k: 'wave', x: -100, y: 0, r0: 10, spd: 200, th: 22, gaps: [0], gw: 0.4, delay: 0, dur: 3, dmg: 50 });
  for (let i = 0; i < 60; i++) S.update(1 / 30);
  assert.equal(w.log.hits || 0, 0);
  S.onNet({ k: 'wave', x: -100, y: 0, r0: 10, spd: 200, th: 22, gaps: [Math.PI], gw: 0.4, delay: 0, dur: 3, dmg: 50 });
  for (let i = 0; i < 60; i++) S.update(1 / 30);
  assert.equal(w.log.hits, 50, 'una vez, sin el hueco');
  // Anillo de 100 a 200 (estás a 0): no.
  S.onNet({ k: 'ring', x: 0, y: 0, r1: 100, r2: 200, delay: 0.5, dur: 1, dmg: 70 });
  for (let i = 0; i < 40; i++) S.update(1 / 30);
  assert.equal(w.log.hits, 50);
  // Jaula alrededor: dentro al cerrarse, golpe fuerte.
  S.onNet({ k: 'cage', x: 0, y: 0, R0: 160, R1: 30, dur: 1, dmg: 40 });
  for (let i = 0; i < 40; i++) S.update(1 / 30);
  assert.ok(w.log.hits >= 50 + 40 * 1.7 - 0.01, 'cerrada contigo dentro');
});

test('network payloads are sanitised: unknown kinds, NaN, huge numbers, long strings and bad colours', () => {
  const w = world(); const S = loadEnemy(w.G);
  S.onNet(null); S.onNet('x'); S.onNet({ k: 'eval', x: 1 }); S.onNet({ k: '__proto__' });
  assert.equal(S.fields.length + S.marks.length, 0);
  S.onNet({ k: 'pool', x: NaN, y: 1e99, r: -5, dur: 1e9, st: 'x'.repeat(500), col: 'red;}', dot: Infinity, slow: 99 });
  const f = S.fields[0];
  assert.equal(f.x, 0); assert.equal(f.y, 1e6); assert.equal(f.r, 0); assert.equal(f.dur, 30);
  assert.equal(f.st.length, 24); assert.equal(f.col, '#ff7a9e'); assert.equal(f.dot, 0); assert.equal(f.slow, 5);
  S.onNet({ k: 'sky', pts: Array.from({ length: 500 }, () => [1, 2, 'x']), st: 'bolt', dur: 2 });
  assert.equal(S.marks[0].pts.length, 48); assert.equal(S.marks[0].pts[0][2], 1);
  S.onNet({ k: 'label', id: 3, txt: 'y'.repeat(300), dur: 2 });
  assert.equal(S.marks[1].txt.length, 48);
  // Ocultar y volver a mostrar un jefe (en el aire / bajo tierra).
  w.G.EnemyMgr.add({ id: 9, boss: true, touchCd: 0 });
  S.onNet({ k: 'hide', id: 9, dur: 5 });
  assert.ok(S.hidden({ id: 9 }));
  S.update(0.1);
  assert.ok(w.G.EnemyMgr.get(9).touchCd > 0, 'escondido tampoco hace daño al tocarle');
  S.onNet({ k: 'hide', id: 9, dur: 0 });
  assert.ok(!S.hidden({ id: 9 }));
});

test('a hidden or shielded boss takes no or less damage (Enemy.hurt)', () => {
  const w = world();
  w.G.Judgment = { noteDmg() {} }; w.G.Coop.hurtShown = () => {};
  w.G.Sprites.animMeta = () => ({ ay: 30 });
  w.G.Stats = { sideOf: () => 'special' };
  w.G.Sprites.hovers = () => false;
  const S = loadEnemy(w.G);
  const e = new w.G.Enemy({ dex: 383, hp: 1000, spd: 50, dmg: 10, xp: 1, behavior: 'chase' }, 0, 0, { hp: 1, spd: 1, dmg: 1 }, true);
  e.showHurt = () => {};
  e.sigHide = true; e.hurt(100); assert.equal(e.hp, 1000);
  e.sigHide = false; e.sigK = 0.15; e.hurt(100); assert.equal(e.hp, 985);
  e.sigK = 1.5; e.hurt(100); assert.equal(e.hp, 835);
  assert.ok(S);
});

// ---------------- red: coop.js de verdad en los dos lados ----------------

function coopPair(guestHasNew = true) {
  const make = (uid, isNew) => {
    const G = {}, got = { bsg: [], rift: [] };
    G.Net = { uid, on(fn) { G.recv = fn; }, onPeer() {}, slow: () => false, send: (u, f) => { got.sent = f; }, toHost() {} };
    G.Player = class { constructor() { this.maxHp = 300; } };
    G.DEX_BY = { 25: { dex: 25 } }; G.baseStartOf = () => 'thundershock';
    G.Sprites = { preload() {} }; G.U = { dist2: () => 0 };
    G.EnemyMgr = { all: () => [], get: () => null, addRemote() {} };
    G.Judgment = { netState: () => null, netApply() {} };
    G.Projectiles = { clearOrbs() {}, spawn() {} };
    G.Hazards = { add() {} }; G.VFX = { forType: t => ({ t }) };
    G.Spawner = { say() {} }; G.Social = { me: { name: uid } };
    G.Rift = { onEvent: ev => got.rift.push(ev) };
    if (isNew) G.BossSig = { onNet: o => got.bsg.push(o) };
    new Function('G', 'document', source('js/net/coop.js'))(G, { addEventListener() {} });
    const local = { x: 0, y: 0, moveAngle: 0, walking: false, hp: 1, maxHp: 1, magnet: 1, aim: 0, xpMul: 1, reviveT: 0, activeGroup: () => [] };
    G.Coop.begin({ host: 'host', members: [{ uid: 'host', name: 'Ana', dex: 25 }, { uid: 'guest', name: 'Bea', dex: 25 }] }, local,
      { team: () => ({ time: 1, level: 1, xp: 0, xpNext: 10, kills: 0, bosses: 0, coins: 0, t1: 0, t10: 0 }), choosing: () => false, syncTeam() {} });
    return { G, got };
  };
  const host = make('host', true), guest = make('guest', guestHasNew);
  const deliver = () => { host.G.Coop.tick(1); guest.G.recv('host', C.decode(C.encode(host.got.sent))); };
  return { host, guest, deliver };
}

test('co-op: boss signatures, the rift skip and where the legendaries appear reach new guests through the codec', () => {
  const { host, guest, deliver } = coopPair(true);
  const field = { k: 'wave', x: 12, y: -40, r0: 30, spd: 165, th: 22, gaps: [1.25, -2.5], gw: 0.36, delay: 0.7, dur: 4, dmg: 33, st: 'ice', col: '#8fe4ff', col2: '#ffffff' };
  host.G.Coop.broadcast(['bsg', field]);
  host.G.Coop.broadcast(['bsg', { k: 'sky', st: 'bolt', pts: [[1, 2, 0.85], [3, 4, 1.1]], dur: 1.6 }]);
  host.G.Coop.broadcast(['lgi', [[383, 100, -20], [382, -100, -20]]]);
  host.G.Coop.broadcast(['rk']);
  host.G.Coop.broadcast(['arena', { tx: 5000, ty: 5000, r: 11, dex: 383, shiny: false, type: 'ground', dexes: [383, 382], shinies: [false, false], time: 170, intro: 2 }]);
  deliver();
  assert.deepEqual(guest.got.bsg[0], field);
  assert.deepEqual(guest.got.bsg[1].pts, [[1, 2, 0.85], [3, 4, 1.1]]);
  assert.deepEqual(guest.got.rift.map(e => e[0]), ['lgi', 'rk', 'arena']);
  assert.deepEqual(guest.got.rift[0][1], [[383, 100, -20], [382, -100, -20]]);
  assert.equal(guest.got.rift[2][1].intro, 2);
});

test('co-op: the new signature fields (wave across, square cage, spinning arms, status zaps, swap, clouds, pull) reach guests intact', () => {
  const { host, guest, deliver } = coopPair(true);
  const evs = [
    { k: 'sweep', x: -300, y: 12, ax: 0.71, ay: -0.71, spd: 210, L: 560, th: 36, gap: -150, gw: 52, delay: 0.8, dur: 3.9, dmg: 40, slow: 1, st: 'water', col: '#4fa8ff', col2: '#d4ecff' },
    { k: 'box', x: 5, y: 6, R0: 175, R1: 26, dur: 3, dmg: 30, st: 'elec', col: '#ffd84a', col2: '#fff8c0' },
    { k: 'spin', tg: 'guest', x: 1, y: 2, arms: 4, per: 2, r0: 230, r1: 26, av: -1.5, a0: 2.5, delay: 0.6, dur: 4.2, dmg: 20, st: 'steel' },
    { k: 'zap', x: 3, y: 4, r: 50, delay: 1.1, dur: 1.3, eff: 'freeze', p: 0.9 },
    { k: 'zap', x: 3, y: 4, ang: -2.1, len: 400, w: 60, delay: 0.5, dur: 0.7, eff: 'knock', p: 520 },
    { k: 'swap', tg: 'guest', x: 300, y: 40, x2: 0, y2: 0, at: 1.1, dur: 1.5, col: '#ff7ab8' },
    { k: 'cloud', x: 10, y: -20, tg: 'guest', spd: 62, dur: 6.2, col: '#ffe14d' },
    { k: 'push', x: 0, y: 0, r: 520, rad: 1, f: -62, dur: 4, delay: 0.4, st: 'psy', col: '#ff6fb8' },
    { k: 'pool', x: 1, y: 1, r: 62, dur: 7, delay: 0.5, st: 'ice', slide: 1, col: '#bff3ff', col2: '#ffffff' },
    { k: 'wave', x: 0, y: 0, r0: 30, spd: 215, th: 22, gaps: [1.2, -1.9], gw: 0.36, delay: 0.7, back: 1.4, dur: 3.5, dmg: 33, eff: 'sleep', st: 'notes' }
  ];
  for (const ev of evs) host.G.Coop.broadcast(['bsg', ev]);
  deliver();
  assert.equal(guest.got.bsg.length, evs.length);
  evs.forEach((ev, i) => assert.deepEqual(guest.got.bsg[i], ev, ev.k));
  // Y el BossSig del invitado los acepta tal cual (saneados).
  const w = world({ uid: 'guest' }); const S = loadEnemy(w.G);
  for (const ev of guest.got.bsg) S.onNet(ev);
  assert.equal(S.fields.length + S.marks.length, evs.length);
  assert.equal(S.fields.find(f => f.k === 'push').f, -62, 'atrae (f negativo)');
  assert.equal(S.fields.find(f => f.k === 'sweep').gap, -150);
  assert.equal(S.fields.find(f => f.k === 'zap' && f.len).eff, 'knock');
});

test('co-op: a guest of the previous version ignores the new events without breaking', () => {
  const { host, guest, deliver } = coopPair(false);
  host.G.Coop.broadcast(['bsg', { k: 'pool', x: 1, y: 1, r: 40, dur: 3 }]);
  host.G.Coop.broadcast(['zz-unknown', 1]);
  assert.doesNotThrow(deliver);
  assert.equal(guest.got.bsg.length, 0);
});

// ---------------- grieta: viaje y llegada ----------------

function loadRift(opts = {}) {
  const w = world(opts);
  const { G } = w;
  G.Tiles = { T: 16, arenaBiome: () => 9, ARENA_THEMES: {}, propSprite: () => ({ width: 8, height: 8 }) };
  G.Projectiles = { clear() {} }; G.Combat = { clearFields() {} };
  G.Touch = { reset() {}, clearButtons() {}, addButton() {}, active: true, safeArea: () => ({ right: 0, bottom: 0 }) };
  G.Judgment = { AT: 1800 };
  G.Enemies = { eff: t => t / 2 };
  G.DB = { save: { legends: {} } };
  G.Pickups = { pullAll() {} }; G.Progress = { event() {} };
  G.BossFX = { appear() {}, appearSprite: () => ({ a: 1, rise: 0, lift: 0 }), tunnel: () => ({ x: 0, y: 0, alpha: 1, open: 1 }) };
  let id = 100;
  G.Enemy = class { constructor(def, x, y, sc, boss) { Object.assign(this, { id: ++id, dex: def.dex, def, x, y, r: 20, boss, hp: def.hp, maxHp: def.hp, dead: false, ai: { cd: 0 } }); } makeShiny() {} bossInit() {} };
  G.Enemy.bossScaleOf = () => 1.5;
  vm.runInContext(source('js/systems/rift.js'), vm.createContext({ G, console, Math, performance: { now: () => 0 } }), { filename: 'rift.js' });
  return w;
}

test('rift: entering travels through the tunnel, the legendary takes ~2 s to appear and then the fight starts', () => {
  const w = loadRift();
  const R = w.G.Rift;
  R.debugArena('ground', 1, 383);
  assert.ok(R.traveling, 'viaja');
  assert.ok(!R.inArena, 'aún en el mapa');
  for (let i = 0; i < 20; i++) R.travelTick(1 / 30);           // 0,66 s: ya en la arena (tapado por el túnel)
  assert.ok(R.inArena && R.traveling);
  for (let i = 0; i < 60; i++) R.travelTick(1 / 30);
  assert.ok(!R.traveling && R.arena.phase === 'intro');
  assert.equal(w.log.spawned.length, 0, 'el legendario aún no ha salido');
  for (let i = 0; i < 50; i++) R.update(1 / 30, w.me, 600);
  assert.equal(w.log.spawned.length, 0);
  for (let i = 0; i < 20; i++) R.update(1 / 30, w.me, 600);
  assert.equal(w.log.spawned.length, 1);
  assert.equal(w.log.spawned[0].dex, 383);
  assert.equal(R.arena.phase, 'fight');
  assert.ok(R.timeLeft >= R.arena.time - 0.5, 'el reloj de la arena empieza al aparecer');
  // Lejos de ti (no te sale encima).
  const e = w.log.spawned[0];
  assert.ok(Math.hypot(e.x - w.me.x, e.y - w.me.y) > 70);
});

test('rift: the skip works only for whoever decides; the host tells everyone ("rk") and where they appear ("lgi")', () => {
  const host = loadRift({ host: true, uid: 'host' });
  host.G.Rift.debugArena('water', 2, 382);
  host.G.Rift.travelTick(0.5);
  host.G.Rift.skipTravel();
  assert.ok(!host.G.Rift.traveling);
  assert.deepEqual(host.log.sent.map(e => e[0]), ['arena', 'rk', 'lgi']);
  const cfg = host.log.sent[0][1], lgi = host.log.sent[2][1];
  assert.equal(cfg.intro, 2);
  assert.equal(lgi.length, 2);
  // Invitado: no puede saltarlo él; el 'rk' del anfitrión sí.
  const guest = loadRift({ uid: 'guest' });
  guest.G.Coop.active = true; guest.G.Coop.isHost = false;
  guest.G.Rift.onEvent(['arena', cfg]);
  guest.G.Rift.travelTick(0.5);
  guest.G.Rift.skipTravel();
  assert.ok(guest.G.Rift.traveling);
  guest.G.Rift.onEvent(['rk']);
  assert.ok(!guest.G.Rift.traveling && guest.G.Rift.arena.phase === 'intro');
  guest.G.Rift.onEvent(['lgi', lgi]);
  assert.equal(guest.log.spawned.length, 0, 'el invitado no crea legendarios');
});

test('rift: every legendary arrives in its own way (style + touch, never the same pair) and the drawing knows them all', () => {
  const w = loadRift();
  const G = { BossFX: {} };
  vm.runInContext(source('js/data/pokedex.js'), vm.createContext({ G }));
  vm.runInContext(source('js/data/sprites-meta.js'), vm.createContext({ G }));
  const legs = G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]);
  const A = w.G.Rift.APPEAR, seen = new Map();
  for (const p of legs) {
    assert.ok(A[p.dex], p.name + ' sin llegada propia');
    assert.ok(!seen.has(A[p.dex]), `${p.name} llega igual que ${seen.get(A[p.dex])} (${A[p.dex]})`);
    seen.set(A[p.dex], p.name);
  }
  // Dibujo de verdad (vfx.js) con un lienzo de mentira: cada estilo y cada toque, de principio a fin.
  const calls = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const V = { U: { hash: w.G.U.hash, TYPE_COLOR: w.G.U.TYPE_COLOR }, Sprites: { PX: 2 }, HUD: null, I18n: null };
  vm.runInContext(source('js/entities/vfx.js'), vm.createContext({ G: V, Math, console, document: { createElement: () => ({ getContext: () => calls }) } }));
  for (const v of Object.values(A)) {
    const [st, acc] = v.split(' ');
    assert.ok(V.BossFX.ACC[acc], 'toque ' + acc);
    for (let k = 0; k <= 1.001; k += 0.05) {
      V.BossFX.appear(calls, st, 0, 0, k, '#ff0000', '#ffffff', k * 3, 7, true);
      V.BossFX.appear(calls, st, 0, 0, k, '#ff0000', '#ffffff', k * 3, 7, false);
      V.BossFX.accent(calls, acc, 0, 0, k, '#ff0000', '#ffffff', k * 3, 7);
      const s = V.BossFX.appearSprite(st, k);
      assert.ok(Number.isFinite(s.a) && Number.isFinite(s.lift), st);
    }
    assert.equal(V.BossFX.appearSprite(st, 1).a, 1, st + ' acaba visible');
  }
});

test('rift: an "arena" from a previous host (no intro) goes straight in as before', () => {
  const guest = loadRift({ uid: 'guest' });
  guest.G.Coop.active = true; guest.G.Coop.isHost = false;
  guest.G.Rift.onEvent(['arena', { tx: 5000, ty: 5000, r: 11, dex: 383, shiny: false, type: 'ground', dexes: [383], shinies: [false], time: 120 }]);
  assert.ok(!guest.G.Rift.traveling && guest.G.Rift.inArena);
  assert.equal(guest.G.Rift.arena.phase, 'fight');
  // Y solo, sin grupo: un anfitrión de antes creaba los legendarios al momento.
  const solo = loadRift();
  solo.G.Rift.onEvent(['arena', { tx: 5000, ty: 5000, r: 11, dex: 383, shiny: false, type: 'ground', dexes: [383], shinies: [false], time: 120 }]);
  assert.equal(solo.log.spawned.length, 1);
});
