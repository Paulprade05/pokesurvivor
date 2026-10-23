/* ============ balance.cjs — pruebas de equilibrio de los ataques y los pasivos ============
 *
 *   node tools/balance.cjs                  tabla de todos (nivel 1, nivel máximo y evolucionado)
 *   node tools/balance.cjs --pasivos        y lo que gana cada movimiento con cada pasivo
 *   node tools/balance.cjs --solo ember,hex  sólo esos (con todos sus niveles)
 *   node tools/balance.cjs --json f.json    además, todos los números en un JSON
 *   node tools/balance.cjs --rapido         menos segundos por prueba (más ruido)
 *   node tools/balance.cjs --quieto         y uno quieto a 57 px, para comparar con el juego
 *   node tools/balance.cjs --z              y los movimientos Z (24-10-2026): al nivel 1 frente a
 *                                           los de nivel 1 y al nivel REF.level frente a los evolucionados
 *
 * No es una fórmula aparte: carga el combate DE VERDAD (moves.js, levelup.js,
 * projectile.js y combat.js) en un contexto aislado, con el mundo, la cámara y
 * los efectos de mentira, y lanza cada movimiento contra muñecos que no se
 * mueren (el azar, con semilla: sale siempre lo mismo). Comprobado el 23-10-2026
 * contra el juego en Chrome (un enemigo quieto, 10 ataques de 10 familias): el
 * mismo daño directo, ±5 %.
 *
 *   jefe   un jefe que te persigue por tu camino, de 40 a 135 px detrás (daño a un
 *          objetivo); la mitad del tiempo andas hacia él. Te golpea cada 1 s (escudos).
 *   horda  50 enemigos a tu alrededor (hasta 190 px) que van contigo mientras das
 *          vueltas; cada uno dura unos 4 s y le sustituye otro nuevo. Te golpean cada 0,7 s.
 *
 * Todo en «daño por segundo con 1 de ataque» (el ataque del Pokémon, Potencia,
 * danzas, tipos... multiplican igual a todos). Las quemaduras cuentan, con los
 * números del minuto REF.min (pegan según tu nivel). VENENO: va en su columna y NO
 * cuenta en el valor: quita un % de la vida del enemigo (enemy.js) y no depende de tu
 * ataque, así que vale más cuanto más aguanten los enemigos; además las acumulaciones
 * no bajan mientras le sigas dando, así que cualquier ataque venenoso llega a 8 (el
 * 9,6 % de la vida cada 0,6 s; a los jefes, la cuarta parte: PSN_BOSS en enemy.js).
 *
 * Marcas: ▲ / ▼ = muy por encima / por debajo de la mediana de todos los ataques en
 * esa etapa (nivel 1, máximo, evolucionado); el «valor» es la media geométrica de
 * jefe y horda respecto a esas medianas (1 = lo normal).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

// ---------------- opciones ----------------
const argv = process.argv.slice(2);
const opt = k => argv.includes('--' + k);
const val = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = val('solo') ? new Set(val('solo').split(',')) : null;
const SECS = opt('rapido') ? 10 : 20;

/*
 * Minuto de referencia para los estados (las quemaduras pegan según tu nivel; los
 * venenos, un % de la vida del enemigo) y ataque típico en ese momento.
 * Vida: la de spawner.js (tramo 6 × (1 + t/95) × hpK) y la de un jefe del minuto 15.
 */
const REF = { min: 15, atk: 6, level: 45, hp: 13000, bossHp: 40000 };

// ---------------- azar con semilla ----------------
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
let rng = mulberry32(1);
const seedOf = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ---------------- el juego en un contexto aislado ----------------
let clock = 0;
const noop = () => {};
const SMath = Object.create(Math);
SMath.random = () => rng();
const sandbox = {
  G: {}, console, Math: SMath, JSON, Map, Set, WeakMap, Object, Array, Number, String, Boolean, Symbol, Error, RegExp,
  Infinity, NaN, isFinite, parseInt, parseFloat, performance: { now: () => clock * 1000 }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
for (const f of ['js/core/util.js', 'js/data/types.js', 'js/systems/stats.js', 'js/data/moves.js', 'js/systems/levelup.js',
                 'js/entities/projectile.js', 'js/systems/combat.js']) load(f);
const G = sandbox.G;

// De mentira: efectos, sonido, mundo sin paredes, cámara de 768×432 que sigue al jugador.
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

// ---------------- muñecos ----------------
const S = { direct: 0, dot: 0, psn: 0, hits: 0, casts: 0, blocks: 0 };
let nextId = 1;
class Dummy {
  constructor(x, y, r, boss) {
    this.id = nextId++; this.x = x; this.y = y; this.r = r; this.bodyH = r * 1.6; this.boss = boss;
    this.types = []; this.mon = null; this.behavior = 'chase'; this.dead = false; this.touchCd = 1e9;
    // Vida en «ataque 1» (los barridos de pantalla quitan un % de ella); no baja: no se mueren.
    this.hpRef = boss ? REF.bossHp : REF.hp; this.maxHp = this.hp = this.hpRef / REF.atk;
    this.fresh();
  }
  fresh() { this.burn = this.burnT = this.burnTick = 0; this.poison = this.poisonT = this.poisonTick = 0; this.slow = this.slowT = 0; this.stunT = 0; }
  cy() { return this.y; }
  hurt(amount) { S.direct += Math.max(1, Math.round(amount)); S.hits++; }
  applyStun(d) { this.stunT = Math.max(this.stunT, d); }
  applySlow(f, d = 1.2) { this.slow = Math.max(this.slow, f); this.slowT = Math.max(this.slowT, d); }
  applyBurn(n = 1) { this.burn = Math.min(8, this.burn + n); this.burnT = 3; }
  applyPoison(n = 1) { this.poison = Math.min(8, this.poison + n); this.poisonT = 4; }
  /** Estados como en enemy.js (en «ataque 1»: se divide entre REF.atk). */
  tick(dt) {
    if (this.stunT > 0) this.stunT -= dt;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
    if (this.burn > 0) {
      this.burnT -= dt; this.burnTick -= dt;
      if (this.burnTick <= 0) { this.burnTick = 0.5; S.dot += 1.6 * this.burn * (1 + REF.level * 0.06) / REF.atk; }
      if (this.burnT <= 0) this.burn = 0;
    }
    if (this.poison > 0) {
      this.poisonT -= dt; this.poisonTick -= dt;
      if (this.poisonTick <= 0) { this.poisonTick = 0.6; S.psn += (this.hpRef * 0.012 * (this.boss ? 0.25 : 1) * this.poison + 1) / REF.atk; }
      if (this.poisonT <= 0) this.poison = 0;
    }
  }
}

// ---------------- jugador ----------------
function makePlayer(m, P, crit) {
  const pl = {
    x: 0, y: 0, r: 14, wr: 14, bodyH: 24, scale: 1, aim: 0, moveAngle: 0, target: null, manualAim: false, dead: false, remote: false,
    cdMul: 1, critChance: (crit && crit.critChance) || 0, critDmg: (crit && crit.critDmg) || 0, abil: null, pass: P, moves: [m], slots: [[m]], active: 0, swapLock: 0, level: REF.level,
    dmgDealt: 0, invuln: 0, maxHp: 400, hp: 400,
    atkFor: () => 1, onDealt: noop, heal: noop, addBuff: noop, hasItem: () => false,
    activeGroup() { return this.slots[0]; }, activeMove() { return m; },
    cast(x) { if (x === m) S.casts++; }
  };
  return pl;
}

/** Enemigo más cercano a menos de `max` (como Projectiles.nearest). */
function nearest(x, y, max) {
  let best = null, bd = max * max;
  for (const e of enemies) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}

/** Golpe de un enemigo cada `every` s (lo paran los escudos, como en Player.hurt). */
function struck(pl, dt, t, every) {
  if (pl.invuln > 0) pl.invuln -= dt;
  if (pl.invuln <= 0 && Math.floor(t / every) !== Math.floor((t - dt) / every)) {
    if (G.Combat.wardBlock(pl)) S.blocks++; else pl.invuln = 0.45;
  }
}

/** Das vueltas: un círculo de radio R a v px/s (pl.moveAngle, hacia donde andas). */
function walk(pl, t, R, v) {
  const th = t * v / R;
  pl.x = Math.cos(th) * R; pl.y = Math.sin(th) * R * 0.8; pl.moveAngle = Math.atan2(Math.cos(th) * 0.8, -Math.sin(th));
}

const SCEN = {
  // Sólo para comparar con el juego de verdad (--quieto): uno quieto a 57 px, tú quieto.
  quieto: {
    setup(pl) { enemies = [new Dummy(40, 40, 22, false)]; },
    step(pl, dt) {
      const e = enemies[0];
      e.tick(dt);
      pl.target = e; pl.aim = pl.moveAngle = Math.atan2(e.y - pl.y, e.x - pl.x);
    }
  },
  // Un jefe que te persigue: va por tu camino entre 0,5 y 1,7 s detrás (de 40 a 135 px).
  // La mitad del tiempo andas hacia él (las ráfagas, que van hacia donde miras).
  jefe: {
    setup(pl) { enemies = [new Dummy(0, 0, 22, true)]; },
    step(pl, dt, t) {
      const e = enemies[0], lag = 1.1 + 0.6 * Math.sin(0.8 * t);
      const tmp = { x: 0, y: 0, moveAngle: 0 };
      walk(tmp, t - lag, 110, 80); e.x = tmp.x; e.y = tmp.y;
      walk(pl, t, 110, 80);
      e.tick(dt);
      pl.target = e; pl.aim = Math.atan2(e.y - pl.y, e.x - pl.x);
      if (Math.floor(t / 2) % 2) pl.moveAngle = pl.aim;
      struck(pl, dt, t, 1);
    }
  },
  // Te rodea una horda: 50 repartidos hasta 190 px a tu alrededor que van contigo (pisan
  // lo que dejas en el suelo). Cada uno «dura» unos 4 s y le sustituye otro nuevo (sin estados).
  horda: {
    N: 50, R: 190,
    setup(pl) {
      enemies = [];
      for (let i = 0; i < this.N; i++) {
        const e = new Dummy(0, 0, 12, false);
        const a = rng() * 6.2832, d = Math.sqrt(30 * 30 + rng() * (this.R * this.R - 30 * 30));
        e.ox = Math.cos(a) * d; e.oy = Math.sin(a) * d * 0.8; e.life = rng() * 8;
        enemies.push(e);
      }
    },
    step(pl, dt, t) {
      walk(pl, t, 90, 90);
      const tg = nearest(pl.x, pl.y, 520);
      pl.target = tg; if (tg) pl.aim = Math.atan2(tg.y - pl.y, tg.x - pl.x);
      for (const e of enemies) {
        e.tick(dt);
        // (Lo que les atrae un remolino se pierde: van pegados a ti.)
        e.x = pl.x + e.ox; e.y = pl.y + e.oy;
        if ((e.life -= dt) <= 0) { e.life = 2 + rng() * 4; e.id = nextId++; e.fresh(); }
      }
      struck(pl, dt, t, 0.7);
    }
  }
};

/** Una prueba: el movimiento m (ya hecho) en el escenario. → { dps, dot, hpc, casts, bps } */
function run(m, scen, P, crit, seed) {
  rng = mulberry32(seed);
  G.Projectiles.clear(); G.Combat.clearFields();
  S.direct = S.dot = S.psn = S.hits = S.casts = S.blocks = 0;
  clock = 0; G.Game.st.time = 0;
  const pl = makePlayer(m, P, crit);
  G.Game.player = pl;
  m.t = 0; m.charges = 0; m.dealt = 0; delete m.orbLogs;
  const sc = SCEN[scen];
  sc.setup(pl);
  // Lo bastante para varias recargas (los barridos de pantalla, 45 s...).
  const T = Math.max(SECS, 4 * G.Combat.cooldown(pl, m) + 2);
  const dt = 1 / 30;
  for (let t = 0; t < T; t += dt) {
    clock = t; G.Game.st.time = t;
    sc.step(pl, dt, t);
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Combat.tick(dt, pl, t);
    G.Projectiles.update(dt, pl, enemies);
    G.Combat.resolve(dt, pl, t);
    G.Combat.updateFields(dt);
  }
  // (El veneno, aparte: ver VENENO arriba.)
  return { dps: (S.direct + S.dot) / T, dot: S.dot / T, psn: S.psn / T, hpc: S.casts ? S.hits / S.casts : 0, casts: S.casts, bps: S.blocks / T };
}

// ---------------- movimientos ----------------
const NO_PASS = { area: 1, dur: 1, amt: 0, pspd: 1 };
/** Instancia de id a nivel lvl (evolucionada con evo) con los pasivos P. */
function make(id, lvl, evo, P) {
  const m = G.Moves.instance(id, lvl);
  if (evo) G.Moves.evolve(m);
  G.Moves.rebake(m, P || NO_PASS);
  return m;
}

/** Máximo de cartas de cada pasivo (levelup.js) y cómo quedan con todas. */
const PASSIVES = G.LevelUp.STATS.filter(s => ['area', 'dur', 'amt', 'pspd', 'luck'].includes(s.id));
function passAt(id, n) {
  const p = { pass: { area: 1, dur: 1, amt: 0, pspd: 1 }, critChance: 0, critDmg: 0 };
  const s = PASSIVES.find(x => x.id === id);
  for (let i = 0; i < n; i++) s.apply(p);
  return p;
}

const r1 = v => Math.round(v * 10) / 10;
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const lpad = (s, n) => String(s).padStart(n).slice(-n);

// Utilidad (no se comparan con los que pegan): potenciadores, escudos y barridos.
const UTIL = new Set(['buff', 'ward', 'wipe']);

function measure(id, lvl, evo, P, crit) {
  const out = {};
  for (const sc of ['jefe', 'horda']) {
    const m = make(id, lvl, evo, P);
    out[sc] = run(m, sc, P || NO_PASS, crit, seedOf(id + sc + lvl + (evo ? 'e' : '')));
  }
  const m = make(id, lvl, evo, P);
  out.m = { dmg: r1(m.dmg || 0), cd: Math.round(G.Combat.cooldown({ cdMul: 1, abil: null }, m) * 100) / 100, count: m.count | 0,
            pierce: m.pierce | 0, bounce: m.bounce | 0 };
  return out;
}

const t0 = Date.now();
const ids = Object.keys(G.Moves.BY_ID).filter(id => !ONLY || ONLY.has(id));
const rows = [];
for (const id of ids) {
  const d = G.Moves.BY_ID[id];
  const stages = ONLY ? [1, 2, 3, 4, 5].map(l => [l, false]) : [[1, false], [d.maxLvl, false]];
  if (G.Moves.EVO[id] && d.kind !== 'buff') stages.push([d.maxLvl, true]);
  for (const [lvl, evo] of stages) {
    const r = measure(id, lvl, evo, null, 0);
    rows.push({ id, name: d.name, kind: d.kind, type: d.type, lvl, evo, stage: evo ? 'evo' : lvl === 1 ? 'n1' : lvl === d.maxLvl ? 'max' : 'n' + lvl,
                jefe: r.jefe, horda: r.horda, m: r.m });
  }
}

// Medianas de los que pegan, por etapa.
const MED = {};
for (const st of ['n1', 'max', 'evo']) {
  const list = rows.filter(r => r.stage === st && !UTIL.has(r.kind));
  MED[st] = { jefe: median(list.map(r => r.jefe.dps)), horda: median(list.map(r => r.horda.dps)) };
}
for (const r of rows) {
  const med = MED[r.stage];
  if (!med || UTIL.has(r.kind)) continue;
  r.rj = r.jefe.dps / (med.jefe || 1); r.rh = r.horda.dps / (med.horda || 1);
  r.valor = Math.sqrt(Math.max(r.rj, 0.01) * Math.max(r.rh, 0.01));
  // (Uno muy bueno contra un jefe o contra la horda, pero no en las dos, es un especialista: sólo si se pasa mucho.)
  r.flag = r.valor > 1.6 || r.rj > 4 || r.rh > 4 ? '▲' : r.valor < 0.6 ? '▼' : '';
}

// ---------------- tabla ----------------
const head = `${pad('movimiento', 20)} ${pad('familia', 9)} ${pad('etapa', 5)} ${lpad('daño', 6)} ${lpad('recarga', 7)} ${lpad('cant', 4)} ${lpad('g/l j', 6)} ${lpad('g/l h', 6)} ${lpad('DPS jefe', 9)} ${lpad('DPS horda', 9)} ${lpad('quem. j/h', 10)} ${lpad('veneno j/h', 12)} ${lpad('valor', 6)}`;
for (const st of ['n1', 'max', 'evo']) {
  const list = rows.filter(r => r.stage === st).sort((a, b) => (b.valor || 0) - (a.valor || 0));
  if (!list.length) continue;
  console.log(`\n=== ${st === 'n1' ? 'NIVEL 1' : st === 'max' ? 'NIVEL MÁXIMO' : 'EVOLUCIONADO'} · mediana jefe ${r1(MED[st].jefe)} · horda ${r1(MED[st].horda)} ===`);
  console.log(head);
  for (const r of list) {
    const util = UTIL.has(r.kind);
    console.log(`${pad(r.name, 20)} ${pad(r.kind, 9)} ${pad(r.stage, 5)} ${lpad(r.m.dmg, 6)} ${lpad(r.m.cd, 7)} ${lpad(r.m.count, 4)} ${lpad(r1(r.jefe.hpc), 6)} ${lpad(r1(r.horda.hpc), 6)} ` +
      `${lpad(r1(r.jefe.dps), 9)} ${lpad(r1(r.horda.dps), 9)} ${lpad(Math.round(r.jefe.dot) + '/' + Math.round(r.horda.dot), 10)} ${lpad(r.jefe.psn || r.horda.psn ? Math.round(r.jefe.psn) + '/' + Math.round(r.horda.psn) : '', 12)} ${lpad(util ? (r.kind === 'ward' ? r1(r.horda.bps) + ' b/s' : '—') : r1(r.valor), 6)} ${r.flag || ''}`);
  }
}
if (ONLY) for (const r of rows.filter(r => r.stage !== 'n1' && r.stage !== 'max' && r.stage !== 'evo')) {
  console.log(`${pad(r.name, 20)} ${pad(r.stage, 5)} jefe ${r1(r.jefe.dps)} horda ${r1(r.horda.dps)}`);
}
// --quieto: uno quieto a 57 px y tú quieto, para comparar con lo que se mide en el juego (Chrome).
if (opt('quieto')) {
  console.log('\n=== QUIETO (para comparar con el juego) ===');
  for (const r of rows) {
    const m = make(r.id, r.lvl, r.evo);
    const q = run(m, 'quieto', NO_PASS, null, seedOf(r.id + 'q' + r.lvl));
    console.log(`${pad(r.id, 18)} ${pad(r.stage, 4)} ${lpad(r1(q.dps), 8)} DPS · ${r1(q.hpc)} golpes por lanzamiento`);
  }
}

// Por familia: la mediana de cada una (nivel máximo y evolucionado).
console.log('\n=== FAMILIAS (mediana de valor: nivel máximo · evolucionado) ===');
const kinds = [...new Set(rows.map(r => r.kind))].filter(k => !UTIL.has(k));
const fam = kinds.map(k => [k, median(rows.filter(r => r.kind === k && r.stage === 'max').map(r => r.valor)), median(rows.filter(r => r.kind === k && r.stage === 'evo').map(r => r.valor)),
  rows.filter(r => r.kind === k && r.stage === 'max').length]).sort((a, b) => b[1] - a[1]);
for (const [k, a, b, n] of fam) console.log(`${pad(k, 10)} ${lpad(r1(a), 5)} · ${lpad(r1(b), 5)}   (${n})`);

// ---------------- pasivos ----------------
const report = { ref: REF, secs: SECS, med: MED, rows: rows.map(r => ({ id: r.id, stage: r.stage, jefe: r1(r.jefe.dps), horda: r1(r.horda.dps), dot: [r1(r.jefe.dot), r1(r.horda.dot)], valor: r.valor && r1(r.valor), m: r.m })) };
if (opt('pasivos')) {
  console.log(`\n=== PASIVOS: lo que gana cada carta (media geométrica de todos los que pegan, nivel máximo y evolucionado) ===`);
  console.log('(Potencia: +10 % por carta; Reflejos: +8,7 % por carta, para comparar)');
  const gain = {};
  const base = rows.filter(r => (r.stage === 'max' || r.stage === 'evo') && !UTIL.has(r.kind));
  for (const s of PASSIVES) {
    const n = s.max || 1, g = [], per = {};
    for (const r of base) {
      const p = passAt(s.id, n);
      const x = measure(r.id, r.lvl, r.evo, p.pass, p);
      const k = Math.sqrt((x.jefe.dps / Math.max(1, r.jefe.dps)) * (x.horda.dps / Math.max(1, r.horda.dps)));
      g.push(k);
      (per[r.kind] = per[r.kind] || []).push(k);
      if (r.stage === 'max') (gain[r.id] = gain[r.id] || {})[s.id] = r1((k - 1) * 100);
    }
    const geo = Math.exp(g.reduce((a, v) => a + Math.log(Math.max(v, 0.01)), 0) / g.length);
    console.log(`${pad(s.title, 13)} ×${n}: ${lpad('+' + r1((geo - 1) * 100) + ' %', 9)} en total · ${lpad('+' + r1((Math.pow(geo, 1 / n) - 1) * 100) + ' %', 8)} por carta · ` +
      Object.entries(per).map(([k, l]) => `${k} ${r1((median(l) - 1) * 100)}`).join(', '));
    report['pass_' + s.id] = { n, total: r1((geo - 1) * 100), perCard: r1((Math.pow(geo, 1 / n) - 1) * 100), byKind: Object.fromEntries(Object.entries(per).map(([k, l]) => [k, r1((median(l) - 1) * 100)])) };
  }
  report.gain = gain;
}

// Tope de cantidad: lo que suma a `count` lo que no es el nivel propio (Réplica y evolución).
const CAP = G.Moves.EXTRA_MAX;
console.log(`\n=== CANTIDAD: nivel máximo → con evolución y todas las Réplicas (tope +${CAP}) ===`);
const over = [];
for (const id of Object.keys(G.Moves.BY_ID)) {
  const d = G.Moves.BY_ID[id];
  if (d.count == null) continue;
  const norm = make(id, d.maxLvl, false).count | 0;
  const all = make(id, d.maxLvl, true, passAt('amt', PASSIVES.find(s => s.id === 'amt').max).pass).count | 0;
  if (all - norm > CAP) over.push(`${d.name} ${norm}→${all}`);
}
console.log(over.length ? 'PASAN DEL TOPE: ' + over.join(', ') : `Ninguno pasa de +${CAP}.`);

// ---------------- movimientos Z (24-10-2026) ----------------
// Cada uno con el daño de su nivel (G.Moves.zPower): al nivel 1, frente a la mediana de los
// de nivel 1; al nivel REF.level, frente a la de los evolucionados. Objetivo (data/moves.js):
// unas 3 veces lo normal al principio y unas 1,8 veces lo normal de un evolucionado después.
// «×daño» = por cuánto habría que multiplicar su daño para dar justo 1,8 al nivel REF.level.
if (opt('z')) {
  const Z = G.Moves.Z, ZT = 1.8;
  console.log(`\n=== MOVIMIENTOS Z: nivel 1 (×${r1(G.Moves.zPower(1))}) frente a los de nivel 1 · nivel ${REF.level} (×${r1(G.Moves.zPower(REF.level))}) frente a los evolucionados ===`);
  console.log(`${pad('movimiento Z', 26)} ${pad('familia', 9)} ${lpad('daño', 6)} ${lpad('recarga', 7)} ${lpad('cant', 4)} ${lpad('j n1', 7)} ${lpad('h n1', 8)} ${lpad('valor', 6)} ${lpad(`j n${REF.level}`, 8)} ${lpad(`h n${REF.level}`, 9)} ${lpad('valor', 6)} ${lpad('×daño', 6)}`);
  const zrows = [];
  for (const type of Object.keys(Z)) {
    const out = {};
    for (const [lvl, st] of [[1, 'n1'], [REF.level, 'evo']]) {
      const r = {};
      for (const sc of ['jefe', 'horda']) r[sc] = run(G.Moves.zInstance(type, lvl, NO_PASS, 'physical'), sc, NO_PASS, null, seedOf(type + sc + lvl));
      r.valor = Math.sqrt(Math.max(r.jefe.dps / MED[st].jefe, 0.01) * Math.max(r.horda.dps / MED[st].horda, 0.01));
      out[st] = r;
    }
    const m = G.Moves.zInstance(type, 1, NO_PASS);
    zrows.push({ type, valor1: r1(out.n1.valor), valor: r1(out.evo.valor), jefe: r1(out.evo.jefe.dps), horda: r1(out.evo.horda.dps) });
    console.log(`${pad(Z[type].name, 26)} ${pad(m.kind, 9)} ${lpad(r1(m.dmg), 6)} ${lpad(Math.round(G.Combat.cooldown({ cdMul: 1, abil: null }, m) * 100) / 100, 7)} ${lpad(m.count | 0, 4)} ` +
      `${lpad(r1(out.n1.jefe.dps), 7)} ${lpad(r1(out.n1.horda.dps), 8)} ${lpad(r1(out.n1.valor), 6)} ${lpad(r1(out.evo.jefe.dps), 8)} ${lpad(r1(out.evo.horda.dps), 9)} ${lpad(r1(out.evo.valor), 6)} ${lpad('×' + Math.round(ZT / out.evo.valor * 100) / 100, 6)}`);
  }
  console.log(`(mediana de los Z: ${r1(median(zrows.map(r => r.valor1)))} al nivel 1 · ${r1(median(zrows.map(r => r.valor)))} al nivel ${REF.level})`);
  report.z = zrows;
}

if (val('json')) fs.writeFileSync(path.resolve(val('json')), JSON.stringify(report, null, 1));
console.log(`\n(${rows.length} pruebas en ${r1((Date.now() - t0) / 1000)} s · ${SECS} s de juego cada una · estados al minuto ${REF.min}: nivel ${REF.level}, ataque ${REF.atk}, vida ${REF.hp} / jefe ${REF.bossHp})`);
