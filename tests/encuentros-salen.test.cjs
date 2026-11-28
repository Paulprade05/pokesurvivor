// Los encuentros salen de verdad en una partida normal (28-11-2026, el dueño: «los templos, santuarios y más cosas como la
// tienda y el cambiamovimientos no me han salido nunca, parece que no existen»).
// Se creaban bien, pero a 760-1300 px en cualquier dirección y sin señal: una persona sólo ve su pantalla (el bot de
// tools/curve.cjs los «ve» a 620 px + su radio con G.World.specialsNear, por eso él sí llegaba). Ahora salen delante de por
// donde vas, justo fuera de la vista, y si en MOVE_T s nadie se ha acercado se recolocan (sin flechas ni avisos).
// Aquí: partidas de 33 min (el último del plan sale hacia el min 29) con un jugador que va y viene como una persona (cambia de rumbo cada pocos segundos, sin buscar
// nada) y una pantalla de PC; cada encuentro del plan tiene que llegar a verse en la pantalla.
// node --test tests/encuentros-salen.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

/** Azar con semilla (mulberry32): la misma partida cada vez. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Lo que se ve en PC (1280×720 con el zoom del juego: unidades de mundo, medido en la partida: outerRadius 529).
const HW = 425, HH = 240, VIEW = Math.hypot(HW * 2, HH * 2) / 2 + 40;

function load(seed, coop = { active: false, isHost: false }) {
  const R = rng(seed), M = Object.create(Math);
  M.random = R;
  const sent = [];
  const cam = { x: 0, y: 0 };
  const G = {
    U: { pick: a => a[Math.floor(R() * a.length)], clamp: (v, a, b) => Math.max(a, Math.min(b, v)), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2, rand: (a, b) => a + R() * (b - a) },
    I18n: { f: s => s }, T: s => s,
    Game: { st: { time: 0 }, player: null, everyone: () => [G.Game.player] },
    Coop: Object.assign({ toHost: m => sent.push(m), broadcast: m => sent.push(m) }, coop), Rift: {}, Judgment: null,
    Reg: { v1: { buy() {}, vitamin() {}, encounter() {} } },
    Audio: { sfx() {} }, FX: { ring() {}, burst() {}, px() {} },
    Spawner: { say() {}, challenge() {} },
    Projectiles: { clearOrbs() {} },
    Sprites: { preload() {}, Animator: class { constructor() { this.dir = 0; } update() {} loop() {} }, dirFromAngle: () => 0 },
    EncounterUI: { open() {} }, PowerBudget: { VIT: {} }, Fortune: { add() {}, of: () => 0 }, Curse: { level: 0, MAX: 5 },
    World: { isFree: () => true, isLiquid: () => false },
    Camera: {
      outerRadius: () => VIEW, sees: (x, y, pad = 60) => Math.abs(x - cam.x) < HW + pad && Math.abs(y - cam.y) < HH + pad,
      toScreen: (x, y) => ({ x: (x - cam.x) * 640 / HW + 640, y: (y - cam.y) * 360 / HH + 360 })
    }
  };
  const c = { G, Math: M, console, performance: { now: () => 0 }, innerWidth: 1280, innerHeight: 720 };
  vm.createContext(c);
  vm.runInContext(source('js/systems/encounters.js'), c, { filename: 'encounters.js' });
  return { G, E: G.Encounters, R, cam, sent };
}

/** Una partida de `min` minutos: el jugador anda como una persona, sin ir a por nada. Devuelve lo planeado y lo visto. */
function play(seed, min = 33) {
  const { G, E, R, cam } = load(seed);
  const pl = G.Game.player = { x: 0, y: 0, dead: false, frozen: false, moveAngle: 0, walking: true, items: [], moves: [], slots: [] };
  E.reset();
  const planned = E.plan.map(p => p.type);
  const seen = new Set(), shown = [];
  let turn = 0;
  const dt = 0.1;
  for (let t = 0; t < min * 60; t += dt) {
    G.Game.st.time = t;
    // Esquivar: cambia de rumbo cada 1-5 s (a veces se para) y va a 120 px/s.
    if ((turn -= dt) <= 0) { turn = 1 + R() * 4; pl.moveAngle = R() * 6.2832; pl.walking = R() > 0.15; }
    if (pl.walking) { pl.x += Math.cos(pl.moveAngle) * 120 * dt; pl.y += Math.sin(pl.moveAngle) * 120 * dt; }
    cam.x = pl.x; cam.y = pl.y;
    E.update(dt, pl);
    for (const e of E.list) {
      const z = (e.zone || 0) * 0.5;                    // (de templos y santuarios basta con ver media zona)
      if (seen.has(e.id) || Math.abs(e.x - pl.x) > HW + z || Math.abs(e.y - pl.y) > HH + z) continue;
      seen.add(e.id); shown.push(e.type);
    }
  }
  return { planned, shown, left: E.plan.length };
}

test('en partidas normales (33 min) salen (se llegan a ver en la pantalla) todos los encuentros del plan', () => {
  const miss = [];
  for (let s = 1; s <= 8; s++) {
    const r = play(s);
    assert.equal(r.left, 0, 'semilla ' + s + ': se colocan todos');
    const want = {}; for (const t of r.planned) want[t] = (want[t] || 0) + 1;
    const got = {}; for (const t of r.shown) got[t] = (got[t] || 0) + 1;
    for (const t in want) if ((got[t] || 0) < want[t]) miss.push('semilla ' + s + ': ' + t + ' ' + (got[t] || 0) + '/' + want[t]);
  }
  assert.deepEqual(miss, [], 'encuentros que nunca se llegan a ver');
});

test('templo, tienda, Smeargle, reto, Porygon, Chansey y santuario maldito: todos los tipos llegan a verse', () => {
  const got = new Set();
  for (let s = 1; s <= 12; s++) for (const t of play(s).shown) got.add(t);
  for (const t of ['temple', 'shop', 'smeargle', 'challenge', 'machine', 'egg', 'curse']) assert.ok(got.has(t), t);
});

test('salen fuera de la vista (no aparecen de golpe en la pantalla) y delante de por donde vas', () => {
  const { G, E } = load(3);
  const pl = G.Game.player = { x: 0, y: 0, dead: false, moveAngle: 0, walking: true };
  E.reset();
  for (const type of ['shop', 'temple', 'challenge', 'curse', 'smeargle']) {
    for (const a of [0, Math.PI / 2, Math.PI, -2]) {
      pl.moveAngle = a;
      const e = E.debugSpot(type);
      assert.ok(e, type);
      const d = Math.hypot(e[0], e[1]), z = E.TYPES[type].zone || 0;
      assert.ok(d >= VIEW + z, type + ': fuera de la vista (' + Math.round(d) + ')');
      assert.ok(d <= VIEW + z + 400, type + ': a menos de una pantalla del borde (' + Math.round(d) + ')');
      let da = Math.abs(Math.atan2(e[1], e[0]) - a) % 6.2832; if (da > Math.PI) da = 6.2832 - da;
      assert.ok(da < 1.0, type + ': delante (' + da.toFixed(2) + ' rad)');
    }
  }
});

test('si nadie lo encuentra en MOVE_T s, se recoloca delante (y en grupo el anfitrión lo dice: enc m)', () => {
  const { G, E, sent, cam } = load(5, { active: true, isHost: true });
  const pl = G.Game.player = { x: 0, y: 0, dead: false, moveAngle: 0, walking: true };
  E.reset();
  E.plan.length = 0; E.plan.push({ t: 0, type: 'shop' });
  E.update(0.1, pl);
  const e = E.list[0];
  assert.ok(e && e.type === 'shop');
  pl.x = cam.x = -5000; pl.moveAngle = Math.PI;        // se fue hacia el otro lado
  for (let t = 0; t < E.MOVE_T + 1; t += 0.5) { G.Game.st.time = t; E.update(0.5, pl); }
  assert.ok(e.x < -5000, 'se ha movido delante del jugador: ' + e.x);
  assert.ok(sent.some(m => m[0] === 'enc' && m[1] === 'm' && m[2] === e.id), 'avisa al invitado');
  // Encontrado (lo has tenido en la pantalla): ya no se mueve.
  pl.x = cam.x = e.x; pl.y = cam.y = e.y + 100;
  E.update(0.1, pl);
  assert.ok(e.found);
  const x = e.x;
  for (let t = 0; t < E.MOVE_T * 2; t += 0.5) { G.Game.st.time += 0.5; pl.x = cam.x = pl.x - 400; E.update(0.5, pl); }
  assert.equal(e.x, x, 'encontrado: se queda donde está');
});

test('el invitado mueve el suyo con enc m (y sus piedras con él)', () => {
  const { G, E } = load(7, { active: true, isHost: false });
  G.Game.player = { x: 0, y: 0, dead: false, moveAngle: 0 };
  E.reset();
  E.onNet(['enc', 'a', 4, 'temple', 900, 0]);
  const e = E.list[0];
  E.onNet(['enc', 'm', 4, 2000, 300]);
  assert.equal(e.x, 2000); assert.equal(e.y, 300);
  for (const s of e.ring) assert.ok(Math.abs(Math.hypot(s.x - 2000, s.y - 300) - E.ZONE_R) < 2, 'piedras en el sitio nuevo');
});
