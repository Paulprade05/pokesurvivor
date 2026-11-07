#!/usr/bin/env node
/*
 * Sandbox de ataques (2026-11-07, auditoría de ataques). SÓLO PARA DESARROLLO: no lo carga el juego.
 *
 * Corre el combate DE VERDAD (moves.js, levelup.js, projectile.js y combat.js, como tools/balance.cjs) sin ventana, con
 * un Pokémon estándar inmortal (vida infinita, 1 de ataque, sin habilidad, sin crítico, sin pasivas) al que se le puede
 * dar cualquier ataque a cualquier nivel, evolucionado o no, y enemigos a voluntad. Tres escenarios:
 *
 *   solo   un enemigo quieto delante de ti (a 60 px), que no se muere.
 *   masa   ~400 enemigos quietos en rejilla hasta 380 px a tu alrededor, que no se mueren: mide hasta dónde llega,
 *          a cuántos toca y cuánto los mueve.
 *   horda  enemigos que llegan sin parar desde fuera de la pantalla, te rodean, te golpean cada 0,5 s y caen
 *          (vida de verdad): el jugador no muere.
 *
 * El jugador da vueltas pequeñas (20 px) para que los ataques «al andar» (rastros, Terratemblor) funcionen.
 *
 * Uso de línea de órdenes:
 *   node tools/sandbox.cjs --ataque ember [--nivel 3] [--evo] [--escenario solo|masa|horda] [--seg 8] [--una]
 *     --una: un solo lanzamiento (luego ya no recarga) y se mide lo que hace ese lanzamiento.
 * Como módulo: const S = require('./sandbox.cjs'); S.run({ id, lvl, evo, scen, secs, once }).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const seedOf = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

let rng = mulberry32(1);
let clock = 0;
const noop = () => {};
const SMath = Object.create(Math);
SMath.random = () => rng();
const sandbox = {
  G: {}, console, Math: SMath, JSON, Map, Set, WeakMap, WeakSet, Object, Array, Number, String, Boolean, Symbol, Error, RegExp, Date,
  Infinity, NaN, isFinite, isNaN, parseInt, parseFloat, performance: { now: () => clock * 1000 }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
// Enemigo de mentira con su update: combat.js lo envuelve como al de verdad y así los estados que se llevan la IA
// (lanzado, en el aire, confuso, marioneta, enamorado...) mueven a los muñecos igual que en el juego.
sandbox.G.Enemy = class { update(dt, pl) { if (this.base) this.base(dt, pl); } };
for (const f of ['js/core/util.js', 'js/core/registro.js', 'js/data/types.js', 'js/systems/stats.js', 'js/data/moves.js', 'js/systems/levelup.js',
                 'js/entities/projectile.js', 'js/systems/combat.js']) load(f);
const G = sandbox.G;
// Daño fijo (Tinieblas...) en «ataque 1»: como en balance.cjs, el ataque típico del minuto 15.
const REF = { atk: 6, level: 45, hp: 13000 };
G.BAL_ATK = REF.atk;

const VIS = Object.freeze({ proj: 'ball', pal: 'normal' });
G.FX = new Proxy({}, { get: (t, k) => (k === 'ownAlpha' ? () => 1 : noop) });
G.VFX = { forMove: () => VIS, forType: () => VIS, spins: () => false, isDir: () => false, draw: noop, PAL: { normal: [] } };
G.Audio = { sfx: noop, music: noop };
const NONE = Object.freeze([]);
G.World = { isWall: () => false, isFree: () => true, collide: noop, propsInCircle: () => NONE, damageProp: noop,
            projectileBlock: () => null, nearestBreakable: () => null, isLiquid: () => false };
G.Camera = { x: 0, y: 0, w: 768, h: 432, kick: noop, sees(x, y, pad = 60) { return Math.abs(x - this.x) <= 384 + pad && Math.abs(y - this.y) <= 216 + pad; },
             left() { return this.x - 384; }, top() { return this.y - 216; } };
G.Coop = { active: false, isHost: false, cast: noop, hit: noop, status: noop };
G.Game = { st: { time: 0 }, state: 'play', player: null };
G.Weather = { mult: () => 1 };
G.Sprites = { Animator: class { constructor() { this.dir = 0; } loop() {} update() {} draw() {} play() {} busy() { return false; } progress() { return 1; } },
              dirFromAngle: () => 0 };
let enemies = [];
G.EnemyMgr = {
  all: () => enemies,
  queryCircle(x, y, r) {
    const out = [];
    for (const e of enemies) { const rr = r + e.r, dx = e.x - x, dy = e.y - y; if (!e.dead && dx * dx + dy * dy <= rr * rr) out.push(e); }
    return out;
  }
};

// Proyectiles creados (cada orbe también es uno).
let spawned = 0;
const spawn0 = G.Projectiles.spawn;
G.Projectiles.spawn = function (o) { spawned++; return spawn0.call(this, o); };

// ---------------- lo que se mide ----------------
const CTL = new Set(['freeze', 'sleep', 'root', 'air', 'fear', 'infat', 'charm', 'control', 'confuse', 'para', 'trap', 'slide', 'sink', 'daze', 'lost']);
let S = null;
function resetStats() {
  S = { hits: 0, dmg: 0, crit: 0, ncDmg: 0, ncHits: 0, hitIds: new Set(), first: null, last: null, reach: 0, knock: 0,
        stunApplied: 0, taken: 0, ctl: 0, slowSum: 0, heal: 0, blocks: 0, struck: 0, casts: 0, castT: [], dot: 0, kills: 0, buff: null, maxProj: 0, maxFields: 0 };
}
resetStats();

let nextId = 1;
class Dummy extends G.Enemy {
  constructor(x, y, r = 12, o = {}) {
    super();
    this.id = nextId++; this.x = this.hx = x; this.y = this.hy = y; this.r = r; this.bodyH = r * 1.6; this.boss = !!o.boss;
    this.types = []; this.mon = null; this.behavior = 'chase'; this.dead = false; this.touchCd = 1e9;
    this.anim = { dir: 0, update: noop }; this.kx = 0; this.ky = 0; this.flash = 0; this.bob = (x * 7 + y * 3) % 6.28; this.dmg = 6;
    this.mortal = !!o.mortal;
    // (Horda: te tocan de verdad, por Combat.resolve → pl.hurt, como en el juego; cada 0,55 s.)
    if (o.touch) { this.touch = true; this.touchCd = 0; this.atkType = 'normal'; this.cat = 'physical'; }
    this.hpRef = o.hp != null ? o.hp * REF.atk : REF.hp;
    this.maxHp = this.hp = this.hpRef / REF.atk;
    this.fresh();
  }
  fresh() { this.burn = this.burnT = this.burnTick = 0; this.poison = this.poisonT = this.poisonTick = 0; this.slow = this.slowT = 0; this.stunT = 0; this.sts = null; }
  cy() { return this.y; }
  face(pl) { const a = Math.atan2(pl.y - this.y, pl.x - this.x); this.anim.dir = ((Math.round((Math.PI / 2 - a) / (Math.PI / 4)) % 8) + 8) % 8; }
  hurt(amount, color, dx = 0, dy = 0, knock = 0, label = null) {
    if (this.dead) return;
    if (this.sts) amount *= G.Combat.mx.stHurtK(this);
    const d = Math.max(1, Math.round(amount * 100) / 100);
    S.hits++; S.dmg += d;
    if (label === 'crit') S.crit++; else { S.ncHits++; S.ncDmg += d; }
    S.hitIds.add(this.id);
    if (S.first == null) S.first = clock;
    S.last = clock;
    const pl = G.Game.player, dist = Math.hypot(this.x - pl.x0, this.y - pl.y0);
    if (dist > S.reach) S.reach = dist;
    if (knock > 0 && !this.boss) {
      const l = Math.hypot(dx, dy) || 1;
      this.kx += dx / l * knock; this.ky += dy / l * knock; S.knock += knock;
    }
    if (this.mortal) this.lose(d);
  }
  lose(d) {
    if (this.dead) return;
    this.hp -= d;
    if (this.hp <= 0) { this.dead = true; S.kills++; G.Game.player.kills = (G.Game.player.kills || 0) + 1; }
  }
  applyStun(d) { if (d > 0) S.stunApplied += d; this.stunT = Math.max(this.stunT, d); }
  applySlow(f, d = 1.2) { this.slow = Math.max(this.slow, f); this.slowT = Math.max(this.slowT, d); }
  applyBurn(n = 1) { this.burn = Math.min(8, this.burn + n); this.burnT = 3; }
  applyPoison(n = 1) { this.poison = Math.min(8, this.poison + n); this.poisonT = 4; }
  strike() {}
  tick(dt) {
    if (this.touch && this.touchCd > 0) this.touchCd -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
    this.x += this.kx * dt; this.y += this.ky * dt;
    const mv = Math.hypot(this.x - this.hx, this.y - this.hy); if (!(this.maxMove >= mv)) this.maxMove = mv;
    const k = Math.pow(0.0015, dt); this.kx *= k; this.ky *= k;
    if (this.burn > 0) {
      this.burnT -= dt; this.burnTick -= dt;
      if (this.burnTick <= 0) { this.burnTick = 0.5; const d = 1.6 * this.burn * (1 + REF.level * 0.06) / REF.atk; S.dot += d; if (this.mortal) this.lose(d); }
      if (this.burnT <= 0) this.burn = 0;
    }
    if (this.poison > 0) {
      this.poisonT -= dt; this.poisonTick -= dt;
      if (this.poisonTick <= 0) { this.poisonTick = 0.6; const d = (this.hpRef * 0.012 * this.poison + 1) / REF.atk; S.dot += d; if (this.mortal) this.lose(d); }
      if (this.poisonT <= 0) this.poison = 0;
    }
    let off = this.stunT > 0;
    if (!off && this.sts) for (const k2 in this.sts) if (CTL.has(k2)) { off = true; break; }
    if (off) S.ctl += dt; else if (this.slow > 0) S.slowSum += this.slow * dt;
  }
}

// ---------------- el Pokémon estándar ----------------
function makePlayer(m) {
  const buffs = {};
  const pl = {
    x: 0, y: 0, x0: 0, y0: 0, r: 14, wr: 14, bodyH: 24, scale: 1, aim: 0, moveAngle: 0, target: null, manualAim: false, dead: false, remote: false,
    cdMul: 1, critChance: 0, critDmg: 0, abil: null, pass: { area: 1, dur: 1, amt: 0, pspd: 1 }, moves: [m], slots: [[m]], active: 0, swapLock: 0,
    level: REF.level, dmgDealt: 0, invuln: 0, maxHp: 1e9, hp: 1e9, walking: true, dmgReduce: 0, dmgTaken: 0, kills: 0,
    atkFor: () => 1, onDealt: noop,
    hurt(amount) { if (this.invuln > 0) return; S.struck++; if (G.Combat.wardBlock(this)) S.blocks++; else { S.taken += amount; this.invuln = 0.45; } }, heal(a) { if (a > 0) S.heal += a; }, hasItem: () => false,
    addBuff(stat, amount, dur, maxStacks, src = 'abil') {
      const b = buffs[stat] || (buffs[stat] = {});
      const s = b[src] || (b[src] = { n: 0, t: 0, amount: 0 });
      s.amount = amount; s.n = Math.min(maxStacks, s.n + 1); s.t = dur;
      const B = S.buff || (S.buff = { n: 0, amount: 0, dur: 0, stat });
      B.n = Math.max(B.n, s.n); B.amount = Math.max(B.amount, amount); B.dur = Math.max(B.dur, dur); B.total = Math.max(B.total || 0, s.n * amount);
    },
    tickBuffs(dt) { for (const k in buffs) for (const id in buffs[k]) { const s = buffs[k][id]; if (s.n > 0 && (s.t -= dt) <= 0) s.n = 0; } },
    activeGroup() { return this.slots[0]; }, activeMove() { return m; },
    cast(x) { if (x === m) { S.casts++; S.castT.push(clock); } }
  };
  return pl;
}

function nearest(x, y, max) {
  let best = null, bd = max * max;
  for (const e of enemies) { if (e.dead) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
/** Golpe a ti cada `every` s si hay alguien a menos de `near` px (lo paran los escudos). */
let calm = 0;
function struck(pl, dt, t, every, near) {
  if (pl.invuln > 0) pl.invuln -= dt;
  if (t < calm) return;
  if (pl.invuln > 0 || Math.floor(t / every) === Math.floor((t - dt) / every)) return;
  if (near != null && !nearest(pl.x, pl.y, near)) return;
  S.struck++;
  if (G.Combat.wardBlock(pl)) S.blocks++; else pl.invuln = 0.45;
}
/** Vueltas pequeñas alrededor del origen (andas: rastros y pisotones). */
let STILL = false;
function walk(pl, t) {
  if (STILL) { pl.x = pl.y = 0; pl.walking = false; return; }
  const R = 20, v = 40, th = t * v / R;
  pl.x = Math.cos(th) * R; pl.y = Math.sin(th) * R;
  pl.moveAngle = Math.atan2(Math.cos(th), -Math.sin(th));
}
function aimAt(pl, e) {
  pl.target = e || null;
  if (e) pl.aim = Math.atan2(e.y - pl.y, e.x - pl.x);
  // Las ráfagas van hacia donde miras: miras al enemigo.
  pl.moveAngle = pl.aim;
}

const SCEN = {
  solo: {
    dist: 60,
    setup() { enemies = [new Dummy(this.dist, 0, 14, { touch: this.touch })]; },
    step(pl, dt, t) {
      if (this.still) { pl.x = pl.y = 0; pl.moveAngle = 0; } else walk(pl, t);
      const e = enemies[0];
      // Vuelve a su sitio poco a poco si lo empujan (el empujón se mide igual).
      e.base = (dt2) => { e.x += (e.hx - e.x) * Math.min(1, dt2 * 0.5); e.y += (e.hy - e.y) * Math.min(1, dt2 * 0.5); };
      e.tick(dt); e.update(dt, pl); e.face(pl);
      aimAt(pl, e);
      struck(pl, dt, t, 1, null);
    }
  },
  masa: {
    STEP: 34, R: 380,
    setup() {
      enemies = [];
      for (let x = -this.R; x <= this.R; x += this.STEP) for (let y = -this.R; y <= this.R; y += this.STEP) {
        const d = Math.hypot(x, y);
        if (d < 26 || d > this.R) continue;
        const e = new Dummy(x + 3, y + 5, 12);
        e.hp = e.maxHp * (0.15 + 0.85 * ((enemies.length * 0.618) % 1));
        enemies.push(e);
      }
    },
    step(pl, dt, t) {
      walk(pl, t);
      for (const e of enemies) {
        // Quietos en su sitio; los que van a por otro (encantados por un señuelo, marionetas...) andan hacia él.
        e.base = e.base || ((dt2, tg) => {
          if (tg !== pl && tg) { const dx = tg.x - e.x, dy = tg.y - e.y, l = Math.hypot(dx, dy) || 1; if (l > 14) { e.x += dx / l * 60 * dt2; e.y += dy / l * 60 * dt2; } }
          else { const k = Math.min(1, dt2 * 0.5); e.x += (e.hx - e.x) * k; e.y += (e.hy - e.y) * k; }
        });
        e.tick(dt); e.update(dt, pl); e.face(pl);
      }
      aimAt(pl, nearest(pl.x, pl.y, 600));
      struck(pl, dt, t, 0.5, null);
    }
  },
  horda: {
    MAX: 45, EVERY: 0.18, HP: 160, V: 75,
    spawn() {
      const a = rng() * 6.2832, d = 330 + rng() * 90;
      const e = new Dummy(Math.cos(a) * d, Math.sin(a) * d * 0.8, 12, { mortal: true, hp: this.HP, touch: true });
      e.v = this.V * (0.85 + rng() * 0.3);
      return e;
    },
    setup() { enemies = []; this.next = 0; for (let i = 0; i < 18; i++) { const e = this.spawn(); e.x *= 0.6; e.y *= 0.6; enemies.push(e); } },
    step(pl, dt, t) {
      walk(pl, t);
      enemies = enemies.filter(e => !e.dead);
      if ((this.next -= dt) <= 0 && enemies.length < this.MAX) { this.next = this.EVERY; enemies.push(this.spawn()); }
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        e.tick(dt);
        if (e.dead) continue;
        // Van a por ti (o a por quien les digan sus estados: confusos, marionetas, enamorados...).
        e.base = e.base || ((dt2, tg) => {
          if (e.stunT > 0) return;
          const dx = tg.x - e.x, dy = tg.y - e.y, l = Math.hypot(dx, dy) || 1, stop = 16 + 3 * (e.id % 4);
          const v = e.v * (1 - (e.slow || 0));
          if (l > stop) { e.x += dx / l * v * dt2; e.y += dy / l * v * dt2; }
        });
        e.update(dt, pl);
        e.face(pl);
      }
      aimAt(pl, nearest(pl.x, pl.y, 600));
      // (Te golpean sin parar los que te tocan: Combat.resolve.)
      if (pl.invuln > 0) pl.invuln -= dt;
    }
  }
};

const NO_PASS = { area: 1, dur: 1, amt: 0, pspd: 1 };
function make(id, lvl, evo) {
  const m = G.Moves.instance(id, lvl);
  if (!m) throw new Error('ataque desconocido: ' + id);
  if (evo) G.Moves.evolve(m);
  G.Moves.rebake(m, NO_PASS);
  return m;
}

/** Hasta dónde llega: la distancia más lejana (de 20 en 20 px, hasta 600) a la que un enemigo solo recibe algo en 4 s. */
function maxReach(id, lvl, evo) {
  let best = 0;
  for (let d = 20; d <= 600; d += 20) {
    const r = run({ id, lvl, evo, scen: 'solo', secs: 4, dist: d, still: true, seed: 7 });
    if (r.hits > 0) best = d;
  }
  return best;
}

/**
 * Una prueba. o = { id, lvl = 1, evo = false, scen = 'masa', secs = 8, once = false, seed, dist (solo), still (solo), touch (solo: te toca), calm (s sin golpes) }.
 * → números de lo que ha hecho (ver el final).
 */
function run(o) {
  const lvl = o.lvl || 1, scen = o.scen || 'masa';
  rng = mulberry32(o.seed != null ? o.seed : seedOf(o.id + scen + lvl + (o.evo ? 'e' : '') + (o.once ? '1' : '')));
  G.Projectiles.clear(); G.Combat.clearFields();
  resetStats(); spawned = 0;
  clock = 0; G.Game.st.time = 0; nextId = 1;
  const m = make(o.id, lvl, o.evo);
  const pl = makePlayer(m);
  G.Game.player = pl;
  m.t = 0; m.charges = 0; m.dealt = 0;
  const sc = SCEN[scen];
  // (Solo: a qué distancia está el enemigo y si te quedas quieto, para medir hasta dónde llega un ataque.)
  SCEN.solo.dist = o.dist || 60; SCEN.solo.still = !!o.still; SCEN.solo.touch = !!o.touch;
  // (calm: los primeros s no te golpea nadie, para ver cuántos escudos guardas.)
  calm = o.calm || 0;
  STILL = !!o.still && scen !== 'solo';
  sc.setup();
  const dt = 1 / 30, T = o.secs || 8;
  let castAt = null, spawnAtCast = 0;
  for (let t = 0; t < T; t += dt) {
    clock = t; G.Game.st.time = t;
    sc.step(pl, dt, t);
    if (castAt == null) { pl.x0 = pl.x; pl.y0 = pl.y; }
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    const c0 = S.casts;
    G.Combat.tick(dt, pl, t);
    if (o.once && S.casts > c0 && castAt == null) { castAt = t; spawnAtCast = spawned; }
    // Un solo lanzamiento: ya no recarga (las órbitas, que no se lanzan, siguen).
    if (o.once && castAt != null) m.t = 1e9;
    G.Projectiles.update(dt, pl, enemies);
    G.Combat.resolve(dt, pl, t);
    G.Combat.updateFields(dt);
    pl.tickBuffs(dt);
    S.maxProj = Math.max(S.maxProj, G.Projectiles.all().length);
    S.maxFields = Math.max(S.maxFields, G.Combat.fieldCount);
    S.maxCharges = Math.max(S.maxCharges || 0, m.charges | 0);
  }
  let moved = 0;
  // (Lo más lejos que ha ido cada uno de su sitio: luego vuelven.)
  if (scen !== 'horda') for (const e of enemies) moved += Math.max(e.maxMove || 0, Math.hypot(e.x - e.hx, e.y - e.hy));
  const casts = S.castT;
  const gaps = casts.slice(1).map((x, i) => x - casts[i]);
  return {
    id: o.id, lvl, evo: !!o.evo, scen, secs: T, once: !!o.once,
    m: { dmg: m.dmg, cd: G.Combat.cooldown({ cdMul: 1, abil: null }, m), count: m.count, pierce: m.pierce, bounce: m.bounce,
         radius: m.radius, size: m.size, width: m.width, dur: m.dur, life: m.life, speed: m.speed },
    casts: S.casts, castT: S.castT.map(x => Math.round(x * 100) / 100), cdMeasured: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    hits: S.hits, dmg: S.dmg, dot: S.dot, dps: (S.dmg + S.dot) / T, perHit: S.ncHits ? S.ncDmg / S.ncHits : (S.hits ? S.dmg / S.hits : 0),
    critRate: S.hits ? S.crit / S.hits : 0, distinct: S.hitIds.size, reach: S.reach,
    span: S.first != null ? S.last - (castAt != null ? castAt : S.first) : 0, firstHit: S.first != null && castAt != null ? S.first - castAt : null,
    knock: S.knock, taken: S.taken, moved, stun: S.stunApplied, ctl: S.ctl, slow: S.slowSum, heal: S.heal, blocks: S.blocks, struck: S.struck, kills: S.kills,
    spawned: spawned - (o.once ? 0 : 0), maxProj: S.maxProj, maxFields: S.maxFields, buff: S.buff,
    charges: S.maxCharges | 0
  };
}

module.exports = { G, run, make, maxReach, SCEN, REF, seedOf };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const val = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
  const id = val('ataque');
  if (!id) { console.log('Uso: node tools/sandbox.cjs --ataque ember [--nivel 3] [--evo] [--escenario solo|masa|horda] [--seg 8] [--una]'); process.exit(0); }
  const scens = val('escenario') ? [val('escenario')] : ['solo', 'masa', 'horda'];
  for (const scen of scens) {
    const r = run({ id, lvl: +(val('nivel') || 1), evo: argv.includes('--evo'), scen, secs: +(val('seg') || 8), once: argv.includes('--una') });
    console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  }
}
