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
 *   node tools/balance.cjs --habilidades    y lo que vale cada habilidad (24-10-2026), en puntos (10 = una
 *                                           carta de nivel); --fx f.js mide otra versión de ability-fx.js
 *                                           (la de antes, para comparar) y --hab a,b sólo esas, Pokémon a
 *                                           Pokémon. Explicado al final, en habilidades().
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
function makePlayer(m, P, crit, abil) {
  const pl = {
    x: 0, y: 0, r: 14, wr: 14, bodyH: 24, scale: 1, aim: 0, moveAngle: 0, target: null, manualAim: false, dead: false, remote: false,
    cdMul: 1, critChance: (crit && crit.critChance) || 0, critDmg: (crit && crit.critDmg) || 0, abil: abil || null, pass: P, moves: [m], slots: [[m]], active: 0, swapLock: 0, level: REF.level,
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

/**
 * Una prueba: el movimiento m (ya hecho) en el escenario. → { dps, dot, hpc, casts, bps }
 * abil: habilidad (sólo lo que hace al golpear y lo que hace cada fotograma, ver --habilidades).
 */
function run(m, scen, P, crit, seed, abil) {
  rng = mulberry32(seed);
  G.Projectiles.clear(); G.Combat.clearFields();
  S.direct = S.dot = S.psn = S.hits = S.casts = S.blocks = 0;
  clock = 0; G.Game.st.time = 0;
  const pl = makePlayer(m, P, crit, abil);
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
    if (pl.abil && pl.abil.tick) pl.abil.tick(pl, dt);
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

if (opt('habilidades')) report.hab = habilidades();

if (val('json')) fs.writeFileSync(path.resolve(val('json')), JSON.stringify(report, null, 1));
console.log(`\n(${rows.length} pruebas en ${r1((Date.now() - t0) / 1000)} s · ${SECS} s de juego cada una · estados al minuto ${REF.min}: nivel ${REF.level}, ataque ${REF.atk}, vida ${REF.hp} / jefe ${REF.bossHp})`);

// ---------------- habilidades (24-10-2026) ----------------
/*
 * --habilidades [--fx archivo] [--hab id,id]   lo que vale cada habilidad (data/ability-fx.js; con --fx,
 * otra versión del archivo, p. ej. la de antes, para comparar) en PUNTOS: 10 = una carta de subir de nivel.
 *
 * Cambio de moneda (el del propio juego: cada carta de nivel vale lo mismo que las otras):
 *   +1 % de daño = 1 · −1 % de daño recibido (o esquivar el 1 %) = 1,6 (Coraza: −6 % = 10) ·
 *   +1 % de velocidad = 1,4 (Carrera: +7 % = 10) · +1 % de vida máxima = 0,75 (Vigor: +20 de unas 170 = 9) ·
 *   +1 % de la vida por segundo = 19 (Síntesis: +0,9/s de unas 170) · +1 % de imán = 0,33 (Imán: +30 % = 10) ·
 *   +1 % de experiencia = 0,83 (Aprendizaje: +12 % = 10) · +1 % de Pokémonedas = 0,3 (fuera de la partida: a ojo).
 *
 * Cómo se mide (llamando a las funciones de verdad de ability-fx.js):
 *   - Una partida de 30 min en pasos de 3 s con el CONTEXTO medido en el juego (abajo): la vida que te queda,
 *     el clima (como weather.js: desde el minuto 2, el 18 % de los minutos, 55-75 s, según el bioma, que
 *     cambia cada 4 min), los enemigos que caen, los que te tocan y los golpes que recibes.
 *   - Daño: cada ataque de los que puede aprender (su tipo y normales; sin MT) vale su «valor» de la tabla
 *     de arriba (nivel máximo o evolucionado, lo mejor) por lo que rinde con ese Pokémon (físico/especial,
 *     monotipo). Como sólo pega el hueco activo, cuenta el MEJOR de 6 al azar (los que te van saliendo),
 *     con la habilidad y sin ella. Los críticos, a mano (probabilidad base CTX.crit0, ×1,5); lo que hace al
 *     golpear (venenos, frenazos...), Potencia Bruta, Dicha y las auras, con el combate de verdad (jefe y
 *     horda, aquí arriba; el veneno cuenta un 25 %: quita vida en %, no depende de tu ataque).
 *   - Aguante: los golpes que recibes, del tipo principal de los Pokémon salvajes (todos los no legendarios,
 *     con su lado físico/especial), por su efectividad contra cada Pokémon que la lleva.
 * Cada habilidad se mide con los Pokémon que la tienen (hasta 10) y se da la mediana. Objetivo: 13 (una
 * carta y un tercio); ▼ por debajo de 10, ▲ por encima de 17.
 */
function habilidades() {
  load('js/data/pokedex.js'); load('js/data/abilities.js');
  const fxFile = val('fx') ? path.resolve(val('fx')) : path.join(ROOT, 'js/data/ability-fx.js');
  vm.runInContext(fs.readFileSync(fxFile, 'utf8'), sandbox, { filename: 'ability-fx.js' });
  const FX = G.AbilityFX;
  const ONLY_H = val('hab') ? new Set(val('hab').split(',')) : null;

  /*
   * Contexto medido en el juego (24-10-2026, Chrome sin ventana: un bot que huye de los enemigos y va a
   * por la experiencia, lleva activo su mejor ataque, coge cartas con cabeza y recibe la mitad de daño
   * (si no, no pasaba del minuto 3); partidas con Bulbasaur, Charmander, Squirtle, Pikachu, Machop,
   * Geodude, Gastly y Eevee, con las mejoras a medias).
   */
  const CTX = {
    hp: [[0.95, 1, 0.58], [0.5, 0.95, 0.35], [1 / 3, 0.5, 0.04], [0.25, 1 / 3, 0.012], [0.04, 0.25, 0.018]],  // [de, a, parte del tiempo]
    hpHit: [[0.95, 1, 0.24], [0.5, 0.95, 0.53], [1 / 3, 0.5, 0.12], [0.04, 1 / 3, 0.11]],                     // vida al recibir cada golpe (por daño)
    boss: 0.12,         // parte de tu daño que va a jefes (3 % en los 5 primeros minutos; sube con la partida: a ojo)
    lowFoe: 0.35,       // parte de tu daño a enemigos con menos de la mitad de vida
    fullFoe: 0.3,       // y a enemigos con la vida llena (el primer golpe)
    contact: 0.62,      // parte del daño recibido que es cuerpo a cuerpo (el resto: disparos y zonas)
    untyped: 0.013,     // trampas y lava
    boom: 0.03,         // explosiones de los kamikazes (a ojo: no se distinguen de las demás zonas)
    killsMin: 42, contactsMin: 12, hitsMin: 11,
    healSec: 0.005,     // curas por segundo (en vida máxima) que no se pierden por tener la vida llena: bayas, drenajes...
    item: 0.3, slowed: 0.003, liquid: 0.004,
    crit0: 0.12         // probabilidad de crítico típica (Mejoras + cartas de Puntería)
  };
  const PTS = { dmg: 100, def: 160, spd: 140, hp: 75, regen: 1900, mag: 33, xp: 83, coin: 30, sturdy: 5 };
  const TARGET = 13, LO = 10, HI = 17;
  const DT = 3, STEPS = 600;
  const BIOME_W = [{ rain: 3, fog: 2, sun: 1.5, snow: 0.5, sand: 0.5 }, { fog: 3, snow: 2.5, rain: 1, sand: 1 }, { sun: 3, sand: 3, fog: 1 }];
  const WMULT = { sun: { fire: 1.5, water: 0.5 }, rain: { water: 1.5, electric: 1.2, fire: 0.5 }, sand: { rock: 1.3, ground: 1.3, steel: 1.3 },
                  snow: { ice: 1.5 }, fog: { ghost: 1.3, fairy: 1.3, psychic: 1.3 } };
  const wm = (wx, type) => (wx && WMULT[wx][type]) || 1;

  // El juego de mentira: clima que se puede poner, y lo que usan las habilidades.
  let WX = null;
  Object.defineProperty(G.Weather, 'current', { get: () => (WX ? { kind: WX } : null), configurable: true });
  G.Weather.mult = type => wm(WX, type);         // (fuera de la partida de mentira, WX = null: ×1)
  G.Pickups = { drop: noop };

  // Valor de cada ataque: el mejor de nivel máximo y evolucionado (de la tabla de arriba).
  const MV = {};
  for (const r of rows) {
    if (!r.valor || (r.stage !== 'max' && r.stage !== 'evo')) continue;
    const x = MV[r.id];
    if (x && x.v >= r.valor) continue;
    MV[r.id] = { v: r.valor, lvl: r.lvl, evo: r.evo };
  }
  const INST = {};
  for (const id in MV) INST[id] = make(id, MV[id].lvl, MV[id].evo);

  // Enemigos: todos los no legendarios del juego (enemies.js los saca de ahí, por tramos de stats), cada
  // uno una vez: sin azar. Su vida y si es jefe, repartidos con las proporciones de CTX.
  const WILD = G.DEX.filter(p => !p.leg);
  const hr = mulberry32(77);
  const binPick = bins => { let x = hr() * bins.reduce((a, b) => a + b[2], 0); for (const b of bins) { if ((x -= b[2]) <= 0) return b[0] + hr() * (b[1] - b[0]); } return 1; };
  const frac = k => (k * 0.6180339887) % 1;              // reparto uniforme sin azar
  const FOES = WILD.map((p, k) => {
    const x = frac(k), y = frac(k * 7 + 3);
    const hp = x < CTX.lowFoe ? 0.05 + 0.44 * x / CTX.lowFoe : x < CTX.lowFoe + CTX.fullFoe ? 1 : 0.5 + 0.49 * (x - CTX.lowFoe - CTX.fullFoe) / (1 - CTX.lowFoe - CTX.fullFoe);
    return { types: p.types, mon: p, boss: y < CTX.boss, hp, maxHp: 1, shield: 0, x: 40, y: 0, r: 14, bodyH: 22, remote: false, dead: false };
  });
  const INC = WILD.map((p, k) => ({ type: p.types[0], cls: G.Stats.sideOf(p) === 'special' ? 's' : 'p', contact: frac(k * 3 + 1) < CTX.contact, w: 1 }));
  INC.push({ type: null, cls: '', contact: false, w: WILD.length * CTX.untyped, untyped: true });
  INC.push({ type: 'fire', cls: 'p', contact: false, w: WILD.length * CTX.boom, boom: true });
  const INC_W = INC.reduce((a, y) => a + y.w, 0);
  const HP_SEQ = [], HPHIT = [];
  { let h = 1; for (let i = 0; i < STEPS; i++) { if (i === 0 || hr() < 0.25) h = binPick(CTX.hp); HP_SEQ.push(h); } }
  for (let i = 0; i < STEPS * 4; i++) HPHIT.push(binPick(CTX.hpHit));
  const poisson = (lam, rr) => { let n = 0, p = Math.exp(-lam), s = p; const u = rr(); while (u > s && n < 30) { n++; p *= lam / n; s += p; } return n; };

  /*
   * Clima: lo que sale de media, sin azar (con 5 o 6 climas por partida, el azar decidía si una habilidad de
   * lluvia valía algo). Desde el minuto 2, en cada bioma (4 min) el 18 % de su tiempo (una media de 65 s
   * cada 6 min), repartido entre sus climas según weather.js. Las que ponen clima (summon) lo ponen al
   * empezar y cada 3 min durante 60 s si no hay otro.
   */
  const W_SHARE = 65 / (65 + 300);
  function weatherSeq(summon) {
    const seq = new Array(STEPS).fill(null), per = 240 / DT;
    for (let b = 0; b * per < STEPS; b++) {
      const w = BIOME_W[b % 3], tot = Object.values(w).reduce((a, x) => a + x, 0);
      let at = b * per + Math.round(per * 0.3), carry = 0;
      for (const k in w) {
        const n = W_SHARE * per * w[k] / tot + carry, steps = Math.round(n);
        carry = n - steps;
        for (let j = 0; j < steps; j++, at++) if (at * DT >= 120 && at < STEPS) seq[at] = k;
      }
    }
    if (summon) for (let i = 0; i < STEPS; i += 180 / DT) for (let j = i; j < i + 60 / DT && j < STEPS; j++) if (!seq[j]) seq[j] = summon;
    return seq;
  }
  const WX0 = weatherSeq(null);

  function mockPl(mon) {
    const b = () => ({ src: [] });
    return {
      mon, dex: mon.dex, x: 0, y: 0, r: 14, bodyH: 24, level: REF.level, maxHp: 400, hp: 400, dead: false, remote: false,
      baseAtk: mon.atk, atkMul: 1, spdMul: 1, cdMul: 1, dmgReduce: 0, regenFlat: 0, magnet: 78, xpMul: 1, coinMul: 1,
      critChance: CTX.crit0, critDmg: 0, slowT: 0, item: null, inLiquid: false, invuln: 0, graceT: 0, kills: 0, coins: 0, statsTaken: {},
      buffs: { atk: b(), patk: b(), satk: b(), spd: b(), def: b(), regen: b() }, moves: [], slots: [],
      addBuff(stat, amount, dur, max) { const B = this.buffs[stat]; if (!B) return; let s = B.src[0]; if (!s) B.src.push(s = { n: 0, t: 0, amount: 0 }); s.amount = amount; s.n = Math.min(max, s.n + 1); s.t = dur; },
      buffOf(stat) { const s = this.buffs[stat].src[0]; return s && s.n > 0 ? s.n * s.amount : 0; },
      decay(dt) { for (const k in this.buffs) for (const s of this.buffs[k].src) if (s.n > 0 && (s.t -= dt) <= 0) s.n = 0; },
      heal(a) { this.hp = Math.min(this.maxHp, this.hp + a); },
      addMaxHp(a) { this.maxHp += a; this.hp += a; },
      hasItem: () => false, activeGroup() { return []; }, activeMove() { return null; }
    };
  }
  // Lo que les pasa a los enemigos por la habilidad (contacto, bajas): se cuenta aparte.
  const eff = { burn: 0, psn: 0, slow: 0, stun: 0, dmg: 0 };
  const FOE = { x: 30, y: 0, r: 14, bodyH: 22, types: ['normal'], hp: 1, maxHp: 1, boss: false, remote: false, dead: false, shield: 0,
    applySlow(f, d) { eff.slow += f * (d || 1.2); }, applyBurn(n) { eff.burn += n || 1; }, applyPoison(n) { eff.psn += n || 1; },
    applyStun(d) { eff.stun += d; }, hurt(a) { eff.dmg += a; } };
  // (Daño de referencia, para lo que hacen al contacto: la media geométrica de jefe y horda, con ataque REF.atk.)
  const DPS_REF = Math.sqrt(MED.evo.jefe * MED.evo.horda) * REF.atk;
  const BURN_DMG = 6 * 1.6 * (1 + REF.level * 0.06), PSN_DMG = 0.25 * REF.hp * 0.012 * (4 / 0.6);

  const comb = (n, k) => { if (k < 0 || k > n) return 0; let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return c; };
  function bestOf(vals, k = 6) {
    const s = vals.slice().sort((a, b) => b - a), n = s.length;
    if (!n) return 0;
    if (n <= k) return s[0];
    let e = 0; const C = comb(n, k);
    for (let i = 0; i <= n - k; i++) e += s[i] * comb(n - 1 - i, k - 1) / C;
    return e;
  }
  const critF = (c, K) => 1 + Math.min(1, c) * (K - 1);
  const totalOf = x => x.dps + 0.25 * x.psn;

  /** Valor de la habilidad id con el Pokémon mon0: { off, def, heal, spd, util, v } en puntos. */
  function evalOne(id, mon0) {
    const mon = Object.assign({}, mon0, { types: mon0.types.slice() });
    const fx = FX.of(id, mon);
    const pl = mockPl(mon);
    // (Lo mismo que player.js setAbility; un ability-fx.js de antes, --fx, sin begin: cdMul y start.)
    if (FX.begin) FX.begin(pl, fx);
    else { if (fx.cdMul) pl.cdMul *= fx.cdMul; if (fx.start) fx.start(pl); }
    if (fx.block) pl.blockAt = Infinity;           // (los golpes que para, aparte: ver abajo)
    const WXS = fx.summon ? weatherSeq(fx.summon) : WX0;
    const pool = G.Moves.poolFor(mon0, true).filter(m => MV[m]);
    const outAcc = pool.map(() => 0), baseAcc = pool.map(() => 0);
    let defB = 0, defE = 0, spdAcc = 0, healEff = 0, refEff = 0, absorbed = 0;
    const rr = mulberry32(seedOf(id + mon0.dex));
    for (const k in eff) eff[k] = 0;
    for (let i = 0; i < STEPS; i++) {
      const h = HP_SEQ[i];
      WX = WXS[i];
      G.Game.st.time = i * DT;
      pl.hp = h * pl.maxHp;
      pl.slowT = rr() < CTX.slowed ? 1 : 0;
      pl.item = rr() < CTX.item ? 'x' : null;
      const hp0 = pl.hp;
      // sucesos: bajas, contactos y golpes recibidos
      for (let n = poisson(CTX.killsMin / 60 * DT, rr); n > 0; n--) { pl.kills++; if (fx.kill) fx.kill(pl, FOE); }
      for (let n = poisson(CTX.contactsMin / 60 * DT, rr); n > 0; n--) if (fx.contact) fx.contact(pl, FOE);
      for (let n = poisson(CTX.hitsMin / 60 * DT, rr); n > 0; n--) {
        const x = INC[Math.floor(rr() * WILD.length)];
        if (fx.hurt) { pl.touchHit = x.contact; fx.hurt(pl, x.type, x.cls); pl.touchHit = false; }
      }
      if (fx.tick && !fx.aura) fx.tick(pl, DT);
      healEff += Math.max(0, pl.hp - hp0) / pl.maxHp;
      refEff += Math.min(1 - h, 0.005 * DT);
      pl.hp = h * pl.maxHp;
      // daño que hace: cada ataque contra dos enemigos (en toda la partida pasan todos)
      const bA = 1 + pl.buffOf('atk'), bP = bA * (1 + pl.buffOf('patk')), bS = bA * (1 + pl.buffOf('satk'));
      for (let q = 0; q < 2; q++) {
        const e = FOES[(i * 2 + q) % FOES.length];
        pool.forEach((m, j) => {
          const inst = INST[m];
          outAcc[j] += (fx.out ? fx.out(pl, inst, e) : 1) * wm(WX, inst.type) * (inst.cat === 'physical' ? bP : inst.cat === 'special' ? bS : bA);
          baseAcc[j] += wm(WX0[i], inst.type);
        });
      }
      // daño que recibe: 4 golpes al azar, con la vida que tenía al recibirlos
      for (let j = 0; j < 4; j++) {
        const x = INC[(i * 4 + j) % INC.length];
        pl.hp = HPHIT[i * 4 + j] * pl.maxHp;
        const base = x.w * (x.type ? G.Types.mult(x.type, mon0.types) : 1);
        defB += base * (x.type ? wm(WX0[i], x.type) : 1);
        let d = base * (x.type ? wm(WX, x.type) : 1);
        if (x.untyped && (fx.levitate || fx.trapProof || fx.lavaProof)) d = 0;
        else if (x.boom && fx.damp) d = 0;
        else if (x.type && fx.absorb === x.type) { d = 0; absorbed += x.w / INC_W / 4; }
        else {
          pl.touchHit = x.contact;
          if (fx.dodge) d *= 1 - Math.min(1, fx.dodge(pl, x.type, x.cls));
          if (fx.inMul) d *= fx.inMul(pl, x.type, x.cls);
          pl.touchHit = false;
          d *= Math.max(0, 1 - pl.buffOf('def') / 0.84);
        }
        defE += d;
      }
      pl.hp = h * pl.maxHp;
      spdAcc += (fx.speed ? fx.speed(pl) : 1) * (1 + pl.buffOf('spd'));
      pl.decay(DT);
    }
    WX = null;
    const T = STEPS * DT;
    // --- daño ---
    const fit = (mn, cat) => G.Stats.fit(mn, cat);
    const mono = (mn, t) => (mn.types.length === 1 && mn.types[0] === t ? 1.2 : 1);
    const atkK = (pl.baseAtk / mon0.atk) * pl.atkMul;
    const v0 = pool.map((m, j) => MV[m].v * fit(mon0, INST[m].cat) * mono(mon0, INST[m].type) * baseAcc[j] / STEPS);
    const v1 = pool.map((m, j) => MV[m].v * fit(mon, INST[m].cat) * mono(mon, INST[m].type) * atkK * outAcc[j] / STEPS);
    // Lo que hace al golpear, Potencia Bruta, Dicha y las auras: con el combate de verdad (sus 3 mejores ataques).
    const simAb = (fx.hit || fx.touchPoison || fx.sheer || fx.serene || fx.aura)
      ? { hit: fx.hit, touchPoison: fx.touchPoison, sheer: fx.sheer, serene: fx.serene, tick: fx.aura ? fx.tick : undefined, mon } : null;
    if (simAb) {
      const top = v1.map((v, j) => [j, v]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      for (const [j] of top) {
        const m = pool[j], crit = { critChance: CTX.crit0, critDmg: 0 };
        let k = 1;
        for (const sc of ['jefe', 'horda']) {
          const a = run(make(m, MV[m].lvl, MV[m].evo), sc, NO_PASS, crit, seedOf(m + sc + 'h'), null);
          const b = run(make(m, MV[m].lvl, MV[m].evo), sc, NO_PASS, crit, seedOf(m + sc + 'h'), simAb);
          k *= totalOf(b) / Math.max(1e-6, totalOf(a));
        }
        v1[j] *= Math.sqrt(k);
      }
    }
    const K1 = (fx.critMul || 1.5) + pl.critDmg;
    let O = bestOf(v1) / Math.max(1e-9, bestOf(v0)) * critF(pl.critChance, K1) / critF(CTX.crit0, 1.5) / pl.cdMul;
    // contacto y bajas: estados y daño a los enemigos (por segundo, frente a tu daño)
    O *= 1 + (eff.burn * BURN_DMG + eff.psn * PSN_DMG + eff.dmg) / T / DPS_REF;
    const off = PTS.dmg * (O - 1);
    // --- aguante ---
    let D = defE / Math.max(1e-9, defB);
    const tk = c => G.Stats.taken(mon, c) / G.Stats.taken(mon0, c);
    D *= 0.5 * tk('physical') + 0.5 * tk('special');
    D *= Math.max(0, 1 - pl.dmgReduce / 0.84);
    // Disfraz, Cara de Hielo: paran un golpe entero cada fx.block s (de los de su clase, si la tiene).
    if (fx.block) {
      const share = fx.blockCls ? INC.filter(x => x.cls === fx.blockCls).reduce((a, x) => a + x.w, 0) / INC_W : 1;
      D *= 1 - Math.min(share, 1 / Math.max(1, fx.block * CTX.hitsMin / 60));
    }
    const def = PTS.def * (1 - D) + (fx.sturdy ? PTS.sturdy : 0) + PTS.hp * (pl.maxHp / 400 - 1) + (eff.slow * 2 + eff.stun * 6) / T;
    // --- curas (regeneración, lo que cura cada fotograma —en lo que sirve, como una regeneración—, al absorber, más curas) ---
    const heal = PTS.regen * (pl.regenFlat / pl.maxHp + (pl.regenK || 0) +(refEff > 0 ? healEff / refEff * 0.005 : 0) +
      absorbed / STEPS * CTX.hitsMin / 60 * 0.03 * STEPS / T * DT + ((fx.healMul || 1) - 1) * CTX.healSec);
    // --- velocidad y lo demás ---
    const S = spdAcc / STEPS * pl.spdMul * (fx.steady ? 1 + CTX.liquid * 0.5 + CTX.slowed : 1) * (fx.levitate ? 1 + CTX.liquid * 0.5 : 1);
    const spd = PTS.spd * (S - 1);
    // (Los potenciadores y escudos no se miden aquí: lo que se recargan antes, a ojo, 1 punto por cada 8 %.)
    const util = PTS.mag * (pl.magnet / 78 - 1) + PTS.xp * (pl.xpMul - 1) + PTS.coin * (pl.coinMul - 1) + (1 - (fx.statusCd || 1)) * 12;
    return { off, def, heal, spd, util, v: off + def + heal + spd + util };
  }

  const holders = {};
  for (const p of G.DEX) (G.DEX_ABIL[p.dex] || []).forEach(a => { if (a) (holders[a] = holders[a] || []).push(p); });
  const ids = Object.keys(G.ABIL).filter(a => holders[a] && (!ONLY_H || ONLY_H.has(a)));
  const out = {};
  const med = l => { const s = l.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
  for (const a of ids) {
    const hs = holders[a], step = Math.max(1, hs.length / 10), list = [];
    for (let i = 0; i < hs.length && list.length < 10; i += step) list.push(hs[Math.floor(i)]);
    const res = list.map(p => evalOne(a, p));
    // (Con --hab, lo de cada Pokémon.)
    if (ONLY_H) console.log(`${a}: ` + list.map((p, i) => `${p.name} ${r1(res[i].v)}`).join(' · '));
    const o = { n: hs.length, v: med(res.map(x => x.v)), min: Math.min(...res.map(x => x.v)), max: Math.max(...res.map(x => x.v)) };
    for (const k of ['off', 'def', 'heal', 'spd', 'util']) o[k] = med(res.map(x => x[k]));
    out[a] = o;
  }
  const list = Object.entries(out).sort((x, y) => y[1].v - x[1].v);
  console.log(`\n=== HABILIDADES (${list.length}): puntos, 10 = una carta de nivel · objetivo ${TARGET} (▼ < ${LO}, ▲ > ${HI}) · ${path.relative(ROOT, fxFile)} ===`);
  console.log(`${pad('habilidad', 22)} ${lpad('Pkm', 4)} ${lpad('valor', 6)} ${lpad('mín', 6)} ${lpad('máx', 6)} ${lpad('daño', 6)} ${lpad('aguante', 7)} ${lpad('curas', 6)} ${lpad('veloc.', 6)} ${lpad('otros', 6)}   efecto`);
  for (const [a, o] of list) {
    const fx = FX.of(a, G.DEX_BY[holders[a][0].dex]);
    console.log(`${pad((G.ABIL[a] || [a])[0], 22)} ${lpad(o.n, 4)} ${lpad(r1(o.v), 6)} ${lpad(r1(o.min), 6)} ${lpad(r1(o.max), 6)} ${lpad(r1(o.off), 6)} ${lpad(r1(o.def), 7)} ${lpad(r1(o.heal), 6)} ${lpad(r1(o.spd), 6)} ${lpad(r1(o.util), 6)} ${o.v < LO ? '▼' : o.v > HI ? '▲' : ' '} ${fx.generic ? '(genérica) ' : ''}${fx.d}${fx.d2 ? ' ' + fx.d2 : ''}`);
  }
  const vs = list.map(([, o]) => o.v);
  console.log(`(mediana ${r1(med(vs))} · ▼ ${vs.filter(v => v < LO).length} · ▲ ${vs.filter(v => v > HI).length} · entre ${LO} y ${HI}: ${vs.filter(v => v >= LO && v <= HI).length} de ${vs.length})`);
  return out;
}
