// IA de los enemigos (2.0, bloque 4): campos por clase y tamaño (systems/pathing.js), desatasco, nadar, excavar
// (systems/enemy-ai.js) y lo que va por la red. Con world.js, pathing.js, enemy-ai.js y enemy.js de verdad en vm,
// y un G de juguete para lo demás. 31-10-2026.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function codec() { const G = {}; new Function('G', source('js/net/codec.js'))(G); return G.NetCodec; }

const FLOOR = 0, WALL = 1, LIQUID = 2;
const TS = 48;

/**
 * Un mundo con enemigos de verdad. terr: (tx, ty, base) -> 0/1/2 (base: el terreno de la semilla).
 * o.time: segundo de la partida (la listeza iq sale de él); o.liquid: 'water' | 'lava'.
 */
function sim(terr, o = {}) {
  let seed = o.rseed || 99;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const G = { LIFT: 18 }, log = { hz: [], ahead: 0 };
  G.U = {
    rand: (a, b) => a + rnd() * (b - a), randInt: (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick: a => a[Math.floor(rnd() * a.length)],
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2, dist: (a, b, c, d) => Math.hypot(a - c, b - d),
    norm: (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }, damp: (a, b) => b, TYPE_COLOR: {},
    hash(x, y, s = 0) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  };
  G.Tiles = { T: 16, RAISE: 8, CAP_H: 24, BIOMES: [{ liquid: o.liquid || 'water', grass: ['#0', '#1', '#2'], rock: ['#0', '#1', '#2'] }],
              ARENA_THEMES: { normal: { pillars: 0, pools: 0, props: {} } } };
  const radius = {};
  G.Sprites = { PX: 2, hovers: () => false, bodyRadius: dex => radius[dex] || 12, bodyHeight: () => 40, dirFromAngle: () => 0, animMeta: () => null, ready: () => false,
                preload() {}, drawShadow() {}, hasShiny: () => false,
                Animator: class { constructor() { this.dir = 0; this.cur = 'Idle'; } loop(a) { this.cur = a; } update() {} play(a) { this.cur = a; } busy() { return false; } draw() {} } };
  const me = { x: 0, y: 0, r: 12, wr: 6, level: 10, dead: false, _vx: 0, _vy: 0, hp: 100, maxHp: 100 };
  G.Game = { player: me, everyone: () => [me], st: { time: o.time == null ? 1200 : o.time } };
  G.DEX_BY = {};
  G.Stats = { sideOf: () => 'physical' };
  G.Camera = { sees: () => !!o.seen, kick() {}, outerRadius: () => 700 };
  G.Weather = { speedFor: () => 1 };
  G.FX = { burst() {}, ring() {}, spark() {}, px() {}, dmgText() {}, twinkle() {} };
  G.Audio = { sfx() {} };
  G.Coop = { active: false, isHost: false };
  G.Enemies = { eff: t => (t <= 120 ? t / 120 * 80 : 80 + (t - 120) / 1080 * 445) };
  G.Spawner = { ahead: () => { log.ahead++; return false; }, say() {}, capAt: () => 80, minions: () => [] };
  G.Hazards = { add: h => log.hz.push(Object.assign({ at: G.Path.clock }, h)) };
  G.Projectiles = { count: 0, spawn: x => x }; G.VFX = { forType: () => ({}) };
  G.Judgment = { noteDmg() {} }; G.Progress = { kill() {} }; G.Rift = { inArena: false }; G.BossFX = {}; G.Icons = { draw() {} };
  const ctx = vm.createContext({ G, Math, console, performance });
  vm.runInContext(source('js/world/world.js'), ctx, { filename: 'world.js' });
  vm.runInContext(source('js/systems/pathing.js'), ctx, { filename: 'pathing.js' });
  vm.runInContext(source('js/systems/enemy-ai.js'), ctx, { filename: 'enemy-ai.js' });
  vm.runInContext(source('js/entities/enemy.js'), ctx, { filename: 'enemy.js' });
  G.World.reset(o.seed || 1234, terr);
  let dexN = 1000;
  /** Un enemigo normal: def { r, spd, types, behavior }. */
  function enemy(x, y, d = {}) {
    const dex = dexN++;
    radius[dex] = d.r || 12;
    G.DEX_BY[dex] = { dex, name: 'E' + dex, types: d.types || ['normal'] };
    const e = new G.Enemy({ dex, name: 'E', hp: 100, spd: d.spd || 66, dmg: 10, xp: 1, behavior: d.behavior || 'chase', range: d.range, shotCd: d.shotCd },
                          x, y, { hp: 1, spd: 1, dmg: 1 });
    G.EnemyMgr.add(e);
    return e;
  }
  /** Avanza `secs` a 30 fps; each(t) después de cada paso. */
  function run(secs, each) {
    const dt = 1 / 30;
    for (let t = 0; t < secs; t += dt) {
      G.Path.update(dt, [me]);
      G.EnemyMgr.update(dt, [me]);
      if (each && each(t) === false) break;
    }
  }
  return { G, me, log, enemy, run, W: G.World };
}

/** Terreno base de la semilla con obstáculos alrededor del jugador: arcos con huecos, huecos cóncavos y pasillos. */
function obstacles(tx, ty, base) {
  const d = Math.hypot(tx, ty), a = Math.atan2(ty, tx);
  if (d < 2.5) return FLOOR;
  // Arco a 4-5 casillas con 3 huecos de ~3 casillas.
  if (d > 4 && d < 5.2) {
    const gaps = [0.4, 2.5, 4.6].some(g => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.32);
    return gaps ? FLOOR : WALL;
  }
  // Copas (huecos cóncavos) abiertas hacia ti, a 7-8 casillas.
  if (d > 7 && d < 8 && Math.sin(a * 5) > 0.55) return WALL;
  if (d > 7 && d < 9.5 && Math.abs(Math.sin(a * 5) - 0.75) < 0.08) return WALL;
  if (d < 6) return FLOOR;
  return base;
}

/** 60 enemigos a 490-550 de ti, con los radios de `radii` repartidos (uno de cada, por turnos), durante `secs` s. */
function chaseTest(radii, secs = 25, seeds = [11, 23, 37]) {
  const out = {};
  for (const r of radii) out[r] = { reached: 0, stuck: 0, total: 0 };
  let stuckSamples = 0, samples = 0;
  for (const seed of seeds) {
    const S = sim(obstacles, { seed, rseed: seed });
    const es = [];
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, d = 490 + (i * 7) % 60;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      // (Como al aparecer en el juego: sólo donde quepa y con camino hasta ti.)
      if (!S.W.isFree(x, y, 14)) continue;
      es.push(S.enemy(x, y, { r: radii[i % radii.length], spd: 66 }));
    }
    S.run(0.1);
    for (const e of es.slice()) if (S.G.Path.reachable(e.x, e.y, S.me) === false) { es.splice(es.indexOf(e), 1); e.dead = true; }
    const done = new Set(), last = new Map();
    S.run(secs, t => {
      for (const e of es) {
        if (done.has(e)) continue;
        if (Math.hypot(e.x - S.me.x, e.y - S.me.y) < e.r + S.me.r + 4) { done.add(e); e.x = e.y = 1e6; e.dead = true; }
      }
      if (Math.round(t * 30) % 15 === 0) { const st = S.G.EnemyMgr.debugStats(); stuckSamples += st.atascados; samples += st.vivos; }
      if (Math.abs(t - (secs - 5)) < 1 / 60) for (const e of es) last.set(e, [e.x, e.y]);
    });
    for (const e of es) {
      const o = out[radii.find(r => Math.abs(r - e.r) < 0.01)];
      o.total++;
      if (done.has(e)) { o.reached++; continue; }
      const p = last.get(e);
      if (!p || Math.hypot(e.x - p[0], e.y - p[1]) < TS) o.stuck++;
    }
  }
  for (const r of radii) { const o = out[r]; o.reach = o.reached / o.total; o.stuckF = o.stuck / o.total; }
  out.stuckLive = samples ? stuckSamples / samples : 0;
  return out;
}

test('ai: 60 enemies around you behind arcs, gaps and cups reach you (≥97 %, any radius) and almost none get stuck (≤1 %)', () => {
  // Radios reales (los sprites no han cambiado con las casillas de 48) y los de §9.7 ×1,5 (proporcionales a TS).
  for (const radii of [[12, 21, 26], [18, 31.5, 39]]) {
    const res = chaseTest(radii);
    for (const r of radii) {
      const x = res[r];
      assert.ok(x.reach >= 0.97, `radio ${r}: llegan ${(x.reach * 100).toFixed(1)} % (${x.total})`);
      assert.ok(x.stuckF <= 0.01, `radio ${r}: atascados ${(x.stuckF * 100).toFixed(1)} %`);
    }
  }
});

test('ai: a big field (radius > 0.47·TS) avoids 1-tile gaps; without a roomy path it falls back to the normal field', () => {
  // Pared en x = 6 con un hueco de una casilla en y = 0 y otro de 3 en y = 10.
  const terr = (tx, ty) => (tx === 6 && !(ty === 0 || (ty >= 9 && ty <= 11)) ? WALL : FLOOR);
  const S = sim(terr);
  const big = S.enemy(12 * TS, 0.5 * TS, { r: 30 }), small = S.enemy(12 * TS, 0.5 * TS, { r: 12 });
  S.run(0.5);
  const db = S.G.Path.dirFor(big, S.me), ds = S.G.Path.dirFor(small, S.me);
  assert.ok(db && db[1] > 0.3, 'el grande va hacia el hueco ancho (abajo)');
  assert.ok(ds && Math.abs(ds[1]) < 0.75 && ds[0] < 0, 'el pequeño va por el hueco estrecho (recto)');
  // Sin hueco ancho: el grande usa el campo normal (hay camino, aunque apretado).
  const S2 = sim((tx, ty) => (tx === 6 && ty !== 0 ? WALL : FLOOR));
  const b2 = S2.enemy(12 * TS, 0.5 * TS, { r: 30 });
  S2.run(0.5);
  assert.ok(S2.G.Path.dirFor(b2, S2.me), 'con el campo normal tiene camino');
});

test('ai swim: across a lake a Water type arrives ≥20 % sooner; a normal one walks around a small pond without stepping in', () => {
  // Lago de 8 casillas de ancho y 30 de alto entre tú y ellos.
  const lake = (tx, ty) => (tx >= 3 && tx <= 10 && Math.abs(ty) <= 15 ? LIQUID : FLOOR);
  const arrive = types => {
    const S = sim(lake);
    const e = S.enemy(14 * TS, 0.5 * TS, { types, r: 14 });
    let at = null;
    S.run(40, t => { if (Math.hypot(e.x - S.me.x, e.y - S.me.y) < e.r + S.me.r + 4) { at = t; return false; } });
    return { at, mv: e.mv };
  };
  const w = arrive(['water']), n = arrive(['normal']);
  assert.equal(w.mv, 'swim');
  assert.ok(w.at != null && n.at != null, `llegan: agua ${w.at}, normal ${n.at}`);
  assert.ok(w.at <= n.at * 0.8, `agua ${w.at.toFixed(1)} s frente a normal ${n.at.toFixed(1)} s`);
  // Charca de 3×3: rodearla es mucho menos del doble.
  const S = sim((tx, ty) => (tx >= 4 && tx <= 6 && ty >= -1 && ty <= 1 ? LIQUID : FLOOR));
  const e = S.enemy(10.5 * TS, 0.5 * TS, { r: 14 });
  let wet = 0, got = false;
  S.run(20, () => { if (S.W.isLiquid(e.x, e.y)) wet++; if (Math.hypot(e.x, e.y) < 30) { got = true; return false; } });
  assert.ok(got, 'llega');
  assert.equal(wet, 0, 'no pisa el agua');
});

test('ai dig: underground it is not found by queryCircle and takes no damage; it rises with a ≥0.5 s warning; never more than 2 under', () => {
  const S = sim(() => FLOOR, { time: 1500 });
  const es = [];
  for (let i = 0; i < 6; i++) es.push(S.enemy(Math.cos(i) * 300, Math.sin(i) * 300, { types: ['ground'], behavior: 'chase', r: 14 }));
  assert.equal(es[0].mv, 'dig');
  let maxUnder = 0, checked = 0, rose = 0;
  S.run(20, () => {
    const st = S.G.EnemyMgr.debugStats();
    maxUnder = Math.max(maxUnder, st.bajoTierra);
    for (const e of es) {
      if (!e.under) continue;
      S.G.EnemyMgr.rebuildGrid();
      assert.ok(!S.G.EnemyMgr.queryCircle(e.x, e.y, 30).includes(e), 'bajo tierra no se le encuentra');
      const hp = e.hp; e.hurt(50); e.applyBurn(3); e.applyStun(2);
      assert.equal(e.hp, hp, 'bajo tierra no pierde vida');
      assert.ok(!(e.burn > 0) && !(e.stunT > 0), 'ni estados');
      checked++;
    }
    // Que no lleguen a tocarte (para que sigan excavando): siempre a 300.
    for (const e of es) if (!e.under && !e.dig && Math.hypot(e.x, e.y) < 200) { const a = Math.atan2(e.y, e.x); e.x = Math.cos(a) * 300; e.y = Math.sin(a) * 300; }
  });
  const zones = S.log.hz.filter(h => h.r === 46);
  rose = zones.length;
  assert.ok(checked > 0, 'alguno ha ido bajo tierra');
  assert.ok(rose > 0, 'y ha salido');
  for (const z of zones) assert.ok(z.delay >= 0.5 && z.kind === 'zone', 'zona con aviso ≥ 0,5 s');
  assert.ok(maxUnder <= 2, 'como mucho 2 a la vez (' + maxUnder + ')');
  // Al principio (iq 0) no excava nadie.
  const S0 = sim(() => FLOOR, { time: 110 });
  const e0 = S0.enemy(300, 0, { types: ['ground'], r: 14 });
  let under0 = false;
  S0.run(12, () => { if (e0.under) under0 = true; if (Math.hypot(e0.x, e0.y) < 200) { e0.x = 300; e0.y = 0; } });
  assert.ok(!under0, 'antes del minuto 2 no excavan');
});

test('ai dig: it never rises inside a wall, even far under a big wall block (block 6 review)', () => {
  // Todo pared salvo un claro de 3×3 donde estás; el excavador, bajo tierra a 10 casillas y a punto de salir.
  // (Antes, sin sitio a 40 px, pasado 1 s salía donde estuviera: dentro de la pared.)
  const S = sim((tx, ty) => (Math.abs(tx) <= 1 && Math.abs(ty) <= 1 ? FLOOR : WALL), { time: 1500 });
  const e = S.enemy(10.5 * TS, 0.5 * TS, { types: ['ground'], behavior: 'chase', r: 14 });
  e.dig = { st: 'under', t: 0.05, xt: 0 }; e.under = true;
  let rose = null;
  S.run(6, () => { if (!rose && e.dig && e.dig.st === 'rise') rose = [e.x, e.y]; });
  assert.ok(rose, 'ha salido');
  assert.ok(S.G.World.isFree(rose[0], rose[1], 11), 'sale en el suelo, no en la pared (' + rose.map(Math.round) + ')');
});

test('ai: ranged enemies do not shoot without line of sight, and back off along the field (not into the wall)', () => {
  // Pared de x = 3 a 4, y de -6 a 6, entre tú y el tirador.
  const S = sim((tx, ty) => (tx >= 3 && tx <= 4 && Math.abs(ty) <= 6 ? WALL : FLOOR));
  let shots = 0;
  S.G.Projectiles.spawn = x => { shots++; return x; };
  const e = S.enemy(7.5 * TS, 0.5 * TS, { behavior: 'ranged', range: 400, shotCd: 0.5, r: 14 });
  let losShots = 0;
  S.run(3, () => { if (S.G.Path.shotLine(e.x, e.y, S.me.x, S.me.y, S.me) === false) losShots = shots; });
  assert.equal(losShots, 0, 'tras la pared no dispara');
  // Cerca de ti con una pared a su espalda: se aparta por el campo (rodeándola) hasta su distancia, no se queda
  // contra la pared (antes huía en recta hacia atrás y se quedaba pegado a ella a 150).
  const S2 = sim((tx, ty) => (tx === 4 && Math.abs(ty) <= 3 ? WALL : FLOOR));
  const r = S2.enemy(3.5 * TS - 16, 0.5 * TS, { behavior: 'ranged', range: 300, shotCd: 9, r: 14 });
  S2.run(3);
  assert.ok(Math.hypot(r.x, r.y) >= 300 * 0.82 * 0.75 - 6, 'a ' + Math.hypot(r.x, r.y).toFixed(0) + ' de ti');
});

test('ai: smarter with time — shots lead your movement at minute 20, not at minute 1', () => {
  const aim = time => {
    const S = sim(() => FLOOR, { time });
    const shots = [];
    S.G.Projectiles.spawn = x => { shots.push(x); return x; };
    S.me._vx = 0; S.me._vy = 100;
    const e = S.enemy(300, 0, { behavior: 'ranged', range: 400, shotCd: 0.3, r: 14 });
    // (El gestor recalcula _vx/_vy con la posición: aquí el jugador «se mueve» sin moverse.)
    S.run(2, () => { S.me._px = S.me.x; S.me._py = S.me.y; S.me._vx = 0; S.me._vy = 100; });
    // Por dónde pasa el disparo al llegar a tu x: cuánto se adelanta hacia donde vas (+y).
    const lead = p => p.y + p.vy * (S.me.x - p.x) / p.vx - S.me.y;
    return shots.length ? shots.reduce((s, p) => s + lead(p), 0) / shots.length : null;
  };
  const early = aim(60), late = aim(1300);
  assert.ok(early != null && late != null);
  assert.ok(Math.abs(early) < 2, 'minuto 1: a donde estás (' + early.toFixed(1) + ')');
  assert.ok(late > 40, 'minuto 20: a donde vas a estar (' + late.toFixed(1) + ' px por delante)');
});

test('ai performance: a field ≤ 0.5 ms; 100 enemies (dirFor + collide) ≤ 1.5 ms per frame', () => {
  const S = sim(obstacles, { seed: 23 });
  S.run(1);
  // Campos: los últimos 60 (tras calentar).
  const st = S.G.Path.stats;
  const b0 = st.builds, m0 = st.ms;
  for (let i = 0; i < 80; i++) { S.me.x = (i % 9) * 30; S.G.Path.update(0.36, [S.me]); }
  const per = (st.ms - m0) / (st.builds - b0);   // (media: 0,11 ms sin carga)
  assert.ok(per <= 0.5, 'campo: ' + per.toFixed(3) + ' ms');
  const es = [];
  for (let i = 0; i < 100; i++) es.push(S.enemy(Math.cos(i) * (300 + i * 3), Math.sin(i) * (300 + i * 3), { r: 12 + (i % 3) * 7 }));
  S.G.Path.update(0.4, [S.me]); S.G.Path.update(0.4, [S.me]);
  // (Percentil 10: lo que cuesta sin que otro proceso le quite la CPU; con 3 Chromes de curve.cjs la mediana salía a 1,1.
  // Sin carga da ~0,9 ms; con otros procesos usando la CPU, 1,2-1,4: se mide hasta 3 veces, vale la mejor, y el límite es
  // 1,5 ms, que sigue pillando una IA el doble de lenta.)
  let best = null;
  for (let round = 0; round < 3 && !(best && best[6] <= 1.5); round++) {
    const times = [];
    for (let f = 0; f < 60; f++) {
      const t0 = performance.now();
      for (const e of es) { S.G.Path.dirFor(e, S.me); S.G.World.collide(e); }
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    if (!best || times[6] < best[6]) best = times;
  }
  assert.ok(best[6] <= 1.5, '100 enemigos: ' + best[6].toFixed(3) + ' ms (mediana ' + best[30].toFixed(3) + ')');
});

test('ai spawn: enemies only appear where there is a path to you (never in a closed pocket)', () => {
  // Bolsa cerrada: anillo de pared a 10-11 casillas, con dentro una zona libre que no lleva a ti.
  const S = sim((tx, ty) => { const d = Math.hypot(tx - 14, ty); return d > 3 && d < 4.2 ? WALL : FLOOR; });
  S.run(0.5);
  assert.equal(S.G.Path.reachable(14 * TS, 0, S.me), false, 'dentro de la bolsa no hay camino');
  assert.equal(S.G.Path.reachable(-10 * TS, 0, S.me), true);
  assert.equal(S.G.Path.reachable(80 * TS, 0, S.me), null, 'fuera del campo: no se sabe');
});

test('co-op: the new enemy bits (32 underground, 64 swimming, 128 inside a wall) reach the guest; a guest hides an underground one', () => {
  const C = codec();
  const make = uid => {
    const G = {}, got = {};
    G.Net = { uid, on(fn) { G.recv = fn; }, onPeer() {}, slow: () => false, send: (u, f) => { got.sent = f; }, toHost() {} };
    G.Player = class { constructor() { this.maxHp = 300; } };
    G.DEX_BY = { 25: { dex: 25 } }; G.baseStartOf = () => 'thundershock';
    G.Sprites = { preload() {} }; G.U = { dist2: () => 0, clamp: (v, a, b) => (v < a ? a : v > b ? b : v) };
    G.Judgment = { netState: () => null, netApply() {} };
    G.Projectiles = { clearOrbs() {}, spawn() {} };
    G.Hazards = { add() {} }; G.VFX = { forType: t => ({ t }) };
    G.Spawner = { say() {} }; G.Social = { me: { name: uid } }; G.Rift = { onEvent() {} };
    return { G, got };
  };
  const host = make('host'), guest = make('guest');
  const mk = (id, o) => Object.assign({ id, x: 10, y: 10, hp: 50, dead: false, anim: { cur: 'Walk', dir: 2 } }, o);
  const list = [mk(1, { under: true }), mk(2, { swimming: true }), mk(3, { inWall: true }), mk(4, { burn: 1, ai: { fury: true } })];
  host.G.EnemyMgr = { all: () => list, get: () => null, addRemote() {} };
  const copies = new Map([1, 2, 3, 4].map(id => [id, { id, remote: true, dead: false, maxHp: 99, net: { x: 0, y: 0, vx: 0, vy: 0, age: 0 } }]));
  guest.G.EnemyMgr = { all: () => [...copies.values()], get: id => copies.get(id), addRemote() {} };
  for (const s of [host, guest]) {
    new Function('G', 'document', source('js/net/coop.js'))(s.G, { addEventListener() {} });
    const local = { x: 0, y: 0, moveAngle: 0, walking: false, hp: 1, maxHp: 1, magnet: 1, aim: 0, xpMul: 1, reviveT: 0, activeGroup: () => [] };
    s.G.Coop.begin({ host: 'host', members: [{ uid: 'host', name: 'Ana', dex: 25 }, { uid: 'guest', name: 'Bea', dex: 25 }] }, local,
      { team: () => ({ time: 1, level: 1, xp: 0, xpNext: 10, kills: 0, bosses: 0, coins: 0, t1: 0, t10: 0 }), choosing: () => false, syncTeam() {} });
  }
  host.G.Coop.tick(1);
  guest.G.recv('host', C.decode(C.encode(host.got.sent)));
  assert.equal(copies.get(1).net.st & 32, 32);
  assert.equal(copies.get(2).net.st & 64, 64);
  assert.equal(copies.get(3).net.st & 128, 128);
  assert.equal(copies.get(4).net.st, 1 | 16, 'los bits de antes, igual');
  // Un invitado v2: la copia bajo tierra no se dibuja ni entra en su rejilla (EnemyAI.hidden).
  const S = sim(() => FLOOR);
  assert.ok(S.G.EnemyAI.hidden({ remote: true, net: { st: 32 } }));
  assert.ok(!S.G.EnemyAI.hidden({ remote: true, net: { st: 64 | 128 | 16 } }));
});
