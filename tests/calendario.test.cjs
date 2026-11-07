// Calendario de jefes y grietas (07-11-2026, pedido del dueño): un jefe cada 2,5 min y una grieta cada 5 min, cada uno en un
// momento al azar de ±22,5 s alrededor de su marca; si coinciden (minutos 5, 10, 15, 20 y 25), primero el jefe.
// enemies.js + spawner.js (jefes) y rift.js (grietas) de verdad.
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
// Unos cuantos Pokémon no legendarios con BST de todas las franjas (bossDef no repite en una partida).
const DEX = [];
for (let i = 0; i < 80; i++) DEX.push({ dex: 1 + i, name: 'P' + i, types: ['normal'], bst: 480 + i * 3, hp: 200, spd: 100, atk: 100 });

function enemies() {
  const G = { U, DEX, DEX_BY: Object.fromEntries(DEX.map(p => [p.dex, p])), SPRITE_META: Object.fromEntries(DEX.map(p => [p.dex, {}])) };
  vm.runInContext(source('js/data/enemies.js'), vm.createContext({ G, Math, console }), { filename: 'enemies.js' });
  return G;
}

function spawner() {
  const G = enemies();
  const ctx = vm.createContext({ G, Math, console });
  vm.runInContext(source('js/systems/director.js'), ctx, { filename: 'director.js' });
  G.Coop = { scale: () => 1, scaleRate: () => 1, active: false };
  G.EnemyMgr = { count: 0, add() {}, all: () => [], bosses: () => [] };
  G.Events = { golden: false }; G.Sprites = { hasShiny: () => false, hovers: () => false, preload() {} };
  G.Camera = { kick() {} }; G.Audio = { sfx() {} };
  vm.runInContext(source('js/systems/spawner.js'), ctx, { filename: 'spawner.js' });
  return G;
}

function rift(opts = {}) {
  const sent = [], G = { U };
  const me = { x: 0, y: 0, dead: false };
  G.Game = { player: me, everyone: () => [me], st: { time: 0 } };
  G.Coop = { active: !!opts.coop, isHost: !!opts.host, broadcast: ev => sent.push(ev), toHost() {} };
  G.Judgment = { AT: 1800 };
  G.World = { TS: 48, isFree: () => true };
  G.Audio = { sfx() {} }; G.FX = { ring() {} };
  const st = { alive: false, due: new Set() };
  G.EnemyMgr = { bossAlive: () => st.alive, stash() {}, clearRemote() {} };
  G.Spawner = { bossDue: m => st.due.has(m) };
  vm.runInContext(source('js/systems/rift.js'), vm.createContext({ G, console, Math, performance: { now: () => 0 } }), { filename: 'rift.js' });
  G.Rift.reset();
  return { G, R: G.Rift, st, sent, me };
}

test('calendario: 11 franjas de jefe cada 150 s (2:30 ... 27:30), cada una a ±22,5 s de su marca; los dúos, en las dos últimas', () => {
  const G = enemies();
  assert.equal(G.Enemies.BOSS_EVERY, 150);
  assert.deepEqual([...G.Enemies.BOSS_SLOTS.map(s => s.at)], [150, 300, 450, 600, 750, 900, 1050, 1200, 1350, 1500, 1650]);
  assert.deepEqual([...G.Enemies.BOSS_SLOTS.filter(s => s.n === 2).map(s => s.at)], [1500, 1650]);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 200; k++) {
    const B = G.Enemies.rollRun().bosses;
    assert.equal(B.length, 13, '9 solos y 2 dúos');
    for (const b of B) {
      const d = b.at - b.mark;
      assert.ok(Math.abs(d) <= 22.5, `jefe de la marca ${b.mark} a las ${b.at}`);
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    for (const m of [1500, 1650]) {
      const duo = B.filter(b => b.mark === m);
      assert.equal(duo.length, 2); assert.equal(duo[0].at, duo[1].at, 'el dúo sale junto');
      assert.notEqual(duo[0].dex, duo[1].dex);
    }
    for (let i = 1; i < B.length; i++) assert.ok(B[i].at >= B[i - 1].at, 'en orden');
    assert.equal(new Set(B.map(b => b.dex)).size, 13, 'sin repetir Pokémon');
  }
  assert.ok(lo < -15 && hi > 15, `el azar cubre el margen entero (${lo.toFixed(1)} … ${hi.toFixed(1)})`);
});

test('calendario: la experiencia de los jefes por partida no sube (×5/6 por jefe: salen más)', () => {
  const xp = G => G.Enemies.BOSS_SLOTS.reduce((a, s) => a + s.xp * (s.n || 1), 0);
  const now = xp(enemies());
  const before = 220 + 420 + 680 + 1000 + 1800 + 2400 + 2900 + 2 * 2400 + 2 * 2900;   // calendario de antes (min 3 ... 27)
  assert.ok(now <= before && now >= before * 0.95, `${now} frente a ${before}`);
});

test('calendario: spawner.bossDue dice si queda por salir el jefe de una marca', () => {
  const G = spawner();
  G.Spawner.reset();
  assert.equal(G.Spawner.bossDue(300), true);
  G.Spawner.debugBossesFrom(320);
  assert.equal(G.Spawner.bossDue(150), false);
  assert.equal(G.Spawner.bossDue(300), false, 'el de las 5:00 pudo salir a las 5:00 ± 22,5');
  G.Spawner.debugBossesFrom(200);
  assert.equal(G.Spawner.bossDue(300), true);
  assert.equal(G.Spawner.bossDue(1650), true);
});

test('calendario: 5 grietas, a los 5, 10, 15, 20 y 25 min ± 22,5 s (ninguna en los 2 min antes de Arceus)', () => {
  const { R } = rift();
  assert.equal(R.RIFT_EVERY, 300);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 300; k++) {
    const p = R.plan();
    assert.deepEqual([...p.map(s => s.mark)], [300, 600, 900, 1200, 1500]);
    for (const s of p) { assert.ok(Math.abs(s.at - s.mark) <= 22.5); lo = Math.min(lo, s.at - s.mark); hi = Math.max(hi, s.at - s.mark); }
  }
  assert.ok(lo < -15 && hi > 15);
});

test('calendario: la grieta espera con un jefe vivo y al jefe de su misma marca; si se pasa 150 s de la marca, se pierde', () => {
  const { R, st } = rift();
  const s0 = R.schedNext;
  assert.equal(s0.mark, 300);
  assert.equal(R.due(s0.at - 1), false, 'antes de su momento, no');
  st.due.add(300);
  assert.equal(R.due(s0.at + 1), false, 'falta el jefe de las 5:00: primero el jefe');
  st.due.clear(); st.alive = true;
  assert.equal(R.due(s0.at + 1), false, 'el jefe sigue vivo');
  st.alive = false;
  assert.equal(R.due(s0.at + 1), true, 'cayó el jefe: ya');
  // Nunca cae (o no hay sitio): a los 150 s de la marca, se pierde y pasa a la siguiente.
  st.alive = true;
  assert.equal(R.due(451), false);
  assert.equal(R.schedNext.mark, 600);
});

test('calendario: partida simulada, jefe primero y grieta al caer, en solitario y de anfitrión; el invitado no abre nada', () => {
  for (const who of [{}, { coop: true, host: true }]) {
    for (let k = 0; k < 40; k++) {
      const { R, st, sent, G } = rift(who);
      const B = enemies().Enemies.rollRun().bosses;
      let bi = 0, deadAt = -1;
      const opened = [], killT = 25 + Math.random() * 70;    // cada jefe tarda de 25 a 95 s en caer
      for (let t = 0; t < 1800; t += 0.5) {   // (spawner: con una grieta abierta, el jefe espera: !R.rift)
        G.Game.st.time = t;
        if (!st.alive && B[bi] && t >= B[bi].at && !R.rift) { const m = B[bi].mark; while (B[bi] && B[bi].mark === m) bi++; st.alive = true; deadAt = t + killT; }
        if (st.alive && t >= deadAt) st.alive = false;
        st.due = new Set(B.slice(bi).map(b => b.mark));
        const had = !!R.rift;
        R.update(0.5, G.Game.player, t);
        if (!had && R.rift) { opened.push(t); G.Game.player.x = 1e6; }     // no entra: la grieta se cierra a los 45 s
      }
      assert.equal(opened.length, 5, `cinco grietas (${opened})`);
      opened.forEach((t, i) => {
        const mark = 300 * (i + 1), boss = B.find(b => b.mark === mark);
        assert.ok(t >= mark - 22.5 && t <= mark + 150, `grieta ${i + 1} a las ${t}`);
        assert.ok(t >= boss.at + killT - 0.5, `después de que caiga el jefe de su marca (${boss.at} + ${killT.toFixed(0)})`);
      });
      if (who.host) assert.equal(sent.filter(e => e[0] === 'rift').length, 5, 'el anfitrión las manda');
    }
  }
  // Invitado: nunca abre una grieta por su cuenta (le llegan del anfitrión con 'rift').
  const g = rift({ coop: true, host: false });
  for (let t = 0; t < 1800; t += 1) { g.G.Game.st.time = t; g.R.update(1, g.G.Game.player, t); }
  assert.equal(g.R.rift, null);
  assert.equal(g.sent.length, 0);
});

test('calendario: con una grieta abierta en el mapa el siguiente jefe espera (spawner.js)', () => {
  const src = source('js/systems/spawner.js');
  assert.match(src, /const group = b && t >= b\.at && !G\.Rift\.rift && /);
  assert.match(src, /if \(G\.Rift\.inArena \|\| G\.Judgment\.active\) return;/, 'y en la arena no sale ninguno');
});
