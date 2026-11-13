#!/usr/bin/env node
/*
 * Atascos de los enemigos en el mapa DE VERDAD (11-11-2026). SÓLO PARA DESARROLLO: no lo carga el juego.
 *
 * Corre world.js (terreno, árboles, rocas, cofres, agua), pathing.js, enemy-ai.js y enemy.js de verdad en vm, sin
 * ventana (como tests/ai.test.cjs), con un jugador que pasea por el mapa como una persona (cambia de rumbo cada pocos
 * segundos, se para a veces) y una horda que sale como en el juego (anillo fuera de la vista, sólo donde quepa y con
 * camino). Cada poco, empujones fuertes a los que tienes cerca (como Onda Vacío o un golpe) y, a veces, a uno lo deja
 * dentro de una pared o de un árbol (como al salir de una grieta o tras un tirón).
 *
 * Atascado (el mismo criterio que `tools/curve.cjs --atascos`): anda por el suelo, está a más de un cuerpo de ti y en
 * 3 s no se ha movido 30 px. Da el % del tiempo atascado (a la vista y en total), los episodios y su contexto.
 *
 * (13-11-2026) También el agua: cuánto tiempo pasan con el centro en el agua los que no pueden entrar (Enemy.dry) y los que sí
 * (Agua, Volador, Fantasma, y uno de cada 25 «legendario» que anda). Con --dentro, además, metidos en el agua.
 *
 * Uso: node tools/atascos.cjs [--seg 240] [--semillas 1,2,3] [--n 70] [--detalle]
 * Como módulo: require('./atascos.cjs').run({ secs, seed, n, radii, pushes, inside }).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
// (--raiz <carpeta>: los js de otra copia, p. ej. la de antes de un cambio, para comparar.)
const ROOT = process.env.ATASCOS_ROOT || path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Un mundo de verdad con enemigos de verdad y un G de juguete para lo demás (como tests/ai.test.cjs). */
function sim(o = {}) {
  let seed = o.rseed || 99;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const G = { LIFT: 18 };
  G.U = {
    rand: (a, b) => a + rnd() * (b - a), randInt: (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick: a => a[Math.floor(rnd() * a.length)],
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2, dist: (a, b, c, d) => Math.hypot(a - c, b - d),
    norm: (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }, damp: (a, b) => b, TYPE_COLOR: {},
    hash(x, y, s = 0) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; },
    freeCanvas() {}
  };
  G.Tiles = { T: 16, RAISE: 8, CAP_H: 24, BIOMES: [{ liquid: o.liquid || 'water', grass: ['#0', '#1', '#2'], rock: ['#0', '#1', '#2'] }],
              ARENA_THEMES: { normal: { pillars: 0, pools: 0, props: {} } } };
  const radius = {};
  G.Sprites = { PX: 2, hovers: () => false, bodyRadius: dex => radius[dex] || 12, bodyHeight: () => 40, dirFromAngle: () => 0, animMeta: () => null, ready: () => false,
                preload() {}, drawShadow() {}, hasShiny: () => false,
                Animator: class { constructor() { this.dir = 0; this.cur = 'Idle'; } loop(a) { this.cur = a; } update() {} play(a) { this.cur = a; } busy() { return false; } draw() {} } };
  const me = { x: 0, y: 0, r: 12, wr: 6, level: 10, dead: false, _vx: 0, _vy: 0, hp: 100, maxHp: 100 };
  G.Game = { player: me, everyone: () => [me], st: { time: o.time == null ? 900 : o.time } };
  G.DEX_BY = {};
  G.Stats = { sideOf: () => 'physical' };
  G.Camera = { x: 0, y: 0, sees(x, y, pad = 60) { return Math.abs(x - me.x) <= 384 + pad && Math.abs(y - me.y) <= 216 + pad; }, kick() {}, outerRadius: () => 700 };
  G.Weather = { speedFor: () => 1 };
  G.FX = { burst() {}, ring() {}, spark() {}, px() {}, dmgText() {}, twinkle() {} };
  G.Audio = { sfx() {} };
  G.Coop = { active: false, isHost: false };
  G.Enemies = { eff: t => (t <= 120 ? t / 120 * 80 : 80 + (t - 120) / 1080 * 445) };
  const log = { ahead: 0, leaps: 0 };
  G.Hazards = { add() {} };
  G.Projectiles = { count: 0, spawn: x => x }; G.VFX = { forType: () => ({}) };
  G.Judgment = { noteDmg() {} }; G.Progress = { kill() {} }; G.Rift = { inArena: false }; G.BossFX = {}; G.Icons = { draw() {} };
  const ctx = vm.createContext({ G, Math, console, performance });
  for (const f of ['js/world/world.js', 'js/systems/pathing.js', 'js/systems/enemy-ai.js', 'js/core/registro.js', 'js/entities/enemy.js'])
    vm.runInContext(source(f), ctx, { filename: f });
  G.World.reset(o.seed || 1234, o.terr || null);   // (o.terr: terreno de prueba, como en tests/ai.test.cjs)
  const W = G.World;
  // Salida por delante (spawner.js ahead): fuera de la vista, donde quepa y con camino.
  function ringPoint(a, d) { return [me.x + Math.cos(a) * d, me.y + Math.sin(a) * d * 0.75]; }
  function freePoint(a0) {
    for (let i = 0; i < 8; i++) {
      const [x, y] = ringPoint(a0 + (i ? G.U.rand(-0.9, 0.9) : 0), G.U.rand(520, 640));
      if (W.isFree(x, y, 14) && G.Path.reachable(x, y, me) !== false) return [x, y];
    }
    return null;
  }
  G.Spawner = { ahead(e) { log.ahead++; const sp = Math.hypot(me._vx, me._vy); const p = freePoint(sp > 20 ? Math.atan2(me._vy, me._vx) : rnd() * 6.28); if (!p) return false; e.x = p[0]; e.y = p[1]; e.kx = e.ky = 0; e.jump = null; return true; },
                say() {}, capAt: () => 80, minions: () => [] };
  let dexN = 1000;
  function enemy(x, y, d = {}) {
    const dex = dexN++;
    radius[dex] = d.r || 12;
    G.DEX_BY[dex] = { dex, name: 'E' + dex, types: d.types || ['normal'] };
    const e = new G.Enemy({ dex, name: 'E', hp: 100, spd: d.spd || 66, dmg: 10, xp: 1, behavior: d.behavior || 'chase', range: d.range, shotCd: d.shotCd },
                          x, y, { hp: 1, spd: 1, dmg: 1 });
    G.EnemyMgr.add(e);
    return e;
  }
  return { G, me, W, enemy, freePoint, rnd, log };
}

const BUSY = ['root', 'air', 'slide', 'frz', 'freeze', 'sleep', 'control', 'confuse', 'fear', 'charm', 'lost'];
/** Detector (el de curve.cjs --atascos). */
function detector(S) {
  const { G, me, W } = S;
  const R = { dryT: 0, dryWet: 0, dryWetVis: 0, wadeT: 0, wadeWet: 0, dryWetIds: new Set(), live: 0, liveVis: 0, stuck: 0, stuckVis: 0, eps: 0, epsVis: 0, long6: 0, max: 0, kinds: {}, sample: [] };
  const eligible = e => !(e.dead || e.pathShore || e.flying || e.under || e.jump || e.dig || e.stunT > 0 || e.phase === 'aim' || (e.sts && BUSY.some(k => e.sts[k]))) &&
    !(e.keepsDistance() && Math.hypot(e.x - me.x, e.y - me.y) < ((e.def && e.def.range) || 200) * 1.1) && Math.hypot(e.x - me.x, e.y - me.y) > e.r + me.r + 30;
  const kindOf = e => {
    if (!W.isFree(e.x, e.y, Math.max(4, e.r * 0.4), true)) return 'dentro';
    if (W.isLiquid(e.x, e.y)) return 'agua';
    if (!W.isFree(e.x, e.y, e.r + 4, true)) {
      const rr = e.r + 6; let wall = false;
      for (const [a, b] of [[rr, 0], [-rr, 0], [0, rr], [0, -rr], [rr * 0.7, rr * 0.7], [-rr * 0.7, rr * 0.7], [rr * 0.7, -rr * 0.7], [-rr * 0.7, -rr * 0.7]]) if (W.isWall(e.x + a, e.y + b)) wall = true;
      return wall ? 'pared' : 'objeto';
    }
    let n = 0; for (const o of G.EnemyMgr.all()) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < (e.r + o.r) * 1.2) n++;
    return n >= 2 ? 'gentio' : 'libre';
  };
  function close(k, t) {
    if (!k.ep) return;
    const d = t - k.ep.t0; k.ep.dur = +d.toFixed(1);
    if (d > 6) R.long6++; R.max = Math.max(R.max, d); k.ep = null;
  }
  function tick(t, dt) {
    for (const e of G.EnemyMgr.all()) {
      // (13-11-2026) Agua: tiempo con el centro en el agua de los que no pueden entrar (Enemy.dry) y de los que sí.
      if (!e.dead && !e.flying && !e.under && !e.jump) {
        const inW = W.isLiquid(e.x, e.y);
        // (Por tipo, no con e.dry: así también se mide una copia de antes, que no lo tiene.)
        const dry = !(e.flying || e.boss || e.legend || e.judge || e.types.some(t => t === 'water' || t === 'flying' || t === 'ghost'));
        if (dry) { R.dryT += dt; if (inW) { R.dryWet += dt; R.dryWetIds.add(e.id); if (G.Camera.sees(e.x, e.y, 0)) R.dryWetVis += dt; } }
        else { R.wadeT += dt; if (inW) R.wadeWet += dt; }
      }
      const k = e._stk || (e._stk = { x: e.x, y: e.y, t, ep: null });
      const ok = eligible(e), vis = G.Camera.sees(e.x, e.y, 0);
      if (ok) { R.live += dt; if (vis) R.liveVis += dt; }
      if (!ok || Math.hypot(e.x - k.x, e.y - k.y) > 30) { close(k, t); k.x = e.x; k.y = e.y; k.t = t; continue; }
      if (t - k.t < 3) continue;
      R.stuck += dt; if (vis) R.stuckVis += dt;
      if (!k.ep) {
        const kind = kindOf(e);
        k.ep = { t0: k.t, kind, vis, r: e.r, b: e.behavior, x: Math.round(e.x), y: Math.round(e.y), px: Math.round(me.x), py: Math.round(me.y),
                 pathV: e.pathV, pathNo: !!e.pathNo, ai: e.aiStuckT, terr: e.aiTerr, wall: !!e.aiWall };
        R.eps++; if (vis) R.epsVis++;
        R.kinds[kind] = (R.kinds[kind] || 0) + 1;
        R.sample.push(k.ep);
      }
    }
  }
  return { R, tick, finish(t) { for (const e of G.EnemyMgr.all()) if (e._stk) close(e._stk, t); } };
}

/**
 * Una partida simulada. o: { secs, seed, n (enemigos a la vez), radii, pushes (empujones fuertes), inside (algunos
 * aparecen dentro de una pared o un árbol), behaviors }.
 */
function run(o = {}) {
  const secs = o.secs || 240, n = o.n || 70;
  // (Radios de verdad: mediana 14, el 90 % hasta 21, un 7 % grandes; aquí, más grandes de la cuenta para forzarlo.)
  const radii = o.radii || [10, 11, 12, 13, 14, 14, 15, 16, 18, 20, 22, 26, 31, 39];
  // (13-11-2026) Tipos: la mayoría no pueden entrar en el agua; Agua (nadan), Volador y Fantasma sí.
  const types = o.types || ['normal', 'fire', 'grass', 'normal', 'rock', 'bug', 'water', 'normal', 'flying', 'electric', 'ghost', 'fighting'];
  const behaviors = o.behaviors || ['chase', 'chase', 'chase', 'charger', 'tank', 'runner', 'ranged', 'jumper'];
  const S = sim({ seed: o.seed || 1, rseed: (o.seed || 1) * 7 + 3, time: o.time });
  const { G, me, W, rnd } = S;
  const D = detector(S);
  // El jugador pasea: rumbo nuevo cada 2-5 s, a veces parado; rodea las paredes deslizando (World.collide).
  let head = rnd() * 6.28, ht = 0, stop = 0;
  const dt = 1 / 30;
  let pushT = 0, insideT = 0, spawnI = 0;
  const step = t => {
    if ((ht -= dt) <= 0) { head += G.U.rand(-1.4, 1.4); ht = G.U.rand(2, 5); stop = rnd() < 0.2 ? G.U.rand(0.5, 2) : 0; }
    if (stop > 0) stop -= dt;
    const sp = stop > 0 ? 0 : 150, ox = me.x, oy = me.y;
    me.x += Math.cos(head) * sp * dt; me.y += Math.sin(head) * sp * dt;
    if (W.collide(me) && Math.hypot(me.x - ox, me.y - oy) < sp * dt * 0.3) head += Math.PI * G.U.rand(0.5, 1.5);
    if (W.isLiquid(me.x, me.y)) head += 0.2;     // (no se mete en el agua a propósito)
    me._vx = (me.x - ox) / dt; me._vy = (me.y - oy) / dt;
    // Horda: siempre n vivos, saliendo fuera de la vista.
    const live = G.EnemyMgr.all().filter(e => !e.dead);
    for (let i = live.length; i < n; i++) {
      const p = S.freePoint(rnd() * 6.28);
      if (!p) break;
      const k = spawnI++;
      const e = S.enemy(p[0], p[1], { r: radii[k % radii.length], behavior: behaviors[(k * 3) % behaviors.length], range: 200, shotCd: 2, spd: 60 + (k % 5) * 8,
                                      types: [types[(k * 5) % types.length]] });
      // (Uno de cada 25, «legendario» que anda: puede cruzar el agua, como los jefes.)
      if (o.legends !== false && k % 25 === 7) e.legend = true;
    }
    // Los que tocan al jugador «caen» (como si los mataras).
    for (const e of live) if (Math.hypot(e.x - me.x, e.y - me.y) < e.r + me.r + 4) { e.dead = true; e.x = e.y = 1e7; }
    // Empujones fuertes (Onda Vacío, golpes): a todos los de 160 px, hacia fuera.
    if (o.pushes !== false && (pushT -= dt) <= 0) {
      pushT = G.U.rand(1.5, 3);
      for (const e of live) {
        const d = Math.hypot(e.x - me.x, e.y - me.y);
        if (d < 200 && !e.dead) { const [nx, ny] = G.U.norm(e.x - me.x, e.y - me.y); e.kx += nx * G.U.rand(500, 1100); e.ky += ny * G.U.rand(500, 1100); }
      }
    }
    // Metidos dentro de una pared o de un árbol (salir de la grieta, un tirón, aparecer): uno cada pocos segundos.
    if (o.inside && (insideT -= dt) <= 0) {
      insideT = G.U.rand(2, 4);
      const e = G.U.pick(live.filter(x => !x.dead));
      if (e) for (let i = 0; i < 60; i++) {
        const x = me.x + G.U.rand(-450, 450), y = me.y + G.U.rand(-320, 320), tx = Math.floor(x / W.TS), ty = Math.floor(y / W.TS);
        if ((W.cellAt(tx, ty) === 1 || W.cellAt(tx, ty) === 2) && Math.hypot(x - me.x, y - me.y) > 150) { e.x = (tx + G.U.rand(0.2, 0.8)) * W.TS; e.y = (ty + G.U.rand(0.2, 0.8)) * W.TS; e.kx = e.ky = 0; break; }
      }
    }
    G.Path.update(dt, [me]);
    G.EnemyMgr.update(dt, [me]);
    if (Math.round(t / dt) % 3 === 0) D.tick(t, dt * 3);
  };
  for (let t = 0; t < secs; t += dt) step(t);
  D.finish(secs);
  const R = D.R;
  return { seed: o.seed, dryWetPct: +(100 * R.dryWet / Math.max(1, R.dryT)).toFixed(3), dryWetVis: +R.dryWetVis.toFixed(1), dryWetN: R.dryWetIds.size,
           wadeWetPct: +(100 * R.wadeWet / Math.max(1, R.wadeT)).toFixed(1), live: Math.round(R.live), stuck: +R.stuck.toFixed(1), pct: +(100 * R.stuck / Math.max(1, R.live)).toFixed(2),
           pctVis: +(100 * R.stuckVis / Math.max(1, R.liveVis)).toFixed(2), eps: R.eps, epsVis: R.epsVis, long6: R.long6, max: +R.max.toFixed(1),
           kinds: R.kinds, sample: R.sample, ahead: S.log.ahead };
}

module.exports = { run, sim };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--raiz');
  if (ri >= 0 && !process.env.ATASCOS_ROOT) { const r = require('child_process').spawnSync(process.execPath, [__filename, ...args], { stdio: 'inherit', env: Object.assign({}, process.env, { ATASCOS_ROOT: path.resolve(args[ri + 1]) }) }); process.exit(r.status); }
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
  const secs = +opt('seg', 240), n = +opt('n', 70), seeds = String(opt('semillas', '1,2,3,4')).split(',').map(Number);
  const inside = args.includes('--dentro');
  const tot = { live: 0, stuck: 0, eps: 0, epsVis: 0, long6: 0, max: 0, kinds: {} };
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = run({ secs, seed, n, inside });
    console.log(`semilla ${seed}: atascados ${r.pct} % del tiempo (${r.pctVis} % a la vista), ${r.eps} episodios (${r.epsVis} a la vista, ${r.long6} de más de 6 s, máx ${r.max} s) ${JSON.stringify(r.kinds)} recolocados=${r.ahead} | agua: los que no pueden ${r.dryWetPct} % del tiempo dentro (${r.dryWetN} distintos, ${r.dryWetVis} s a la vista), los que sí ${r.wadeWetPct} % (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    if (args.includes('--detalle')) for (const s of r.sample.slice(0, 25)) console.log('   ', JSON.stringify(s));
    tot.live += r.live; tot.stuck += r.stuck; tot.eps += r.eps; tot.epsVis += r.epsVis; tot.long6 += r.long6; tot.max = Math.max(tot.max, r.max);
    for (const k in r.kinds) tot.kinds[k] = (tot.kinds[k] || 0) + r.kinds[k];
  }
  console.log(`TOTAL: ${(100 * tot.stuck / Math.max(1, tot.live)).toFixed(2)} % del tiempo atascados, ${tot.eps} episodios (${tot.epsVis} a la vista, ${tot.long6} > 6 s, máx ${tot.max.toFixed(1)} s) ${JSON.stringify(tot.kinds)}`);
}
