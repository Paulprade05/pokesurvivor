// 1.0, bloque C (lo decidió el dueño): como mucho 4 ataques distintos, fusionados o no. Fusionar no libera huecos:
// con 4 ya no salen cartas de ataques nuevos. entities/player.js (canLearn, freeSlots, addMove), systems/levelup.js,
// lo que se ve (HUD, pausa, cartas) y los textos. node --test tests/tope-ataques.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function loadPlayer() {
  const G = {};
  vm.runInContext(source('js/entities/player.js'), vm.createContext({ G, Math, console }), { filename: 'player.js' });
  return G.Player;
}
const Player = loadPlayer();
function pl(groups) {
  const p = Object.create(Player.prototype);
  p.slots = groups.map(g => g.map(id => ({ id, type: 'fire' })));
  p.moves = p.slots.flat();
  p.maxMoves = 4; p.bonds = 0; p.over = 0;
  return p;
}

test('jugador: cuentan los ataques, no los huecos', () => {
  for (const [groups, can, free] of [
    [[['a']], true, 3],
    [[['a', 'b'], ['c']], true, 1],
    [[['a', 'b'], ['c'], ['d']], false, 0],
    [[['a', 'b', 'c', 'd']], false, 0],
    [[['a'], ['b'], ['c'], ['d']], false, 0]
  ]) {
    const p = pl(groups);
    assert.equal(p.canLearn(), can, JSON.stringify(groups));
    assert.equal(p.freeSlots(), free, JSON.stringify(groups));
    if (!can) assert.equal(p.addMove('z'), false, 'addMove no pasa del tope: ' + JSON.stringify(groups));
  }
});

// Cartas de nivel con ataques de mentira (como tests/levelup.test.cjs).
const IDS = Array.from({ length: 15 }, (_, i) => 'm' + i);
function boot() {
  const ctx = { G: {}, console, Math };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source('js/core/util.js'), ctx, { filename: 'js/core/util.js' });
  const G = ctx.G, BY_ID = {};
  for (const id of IDS) BY_ID[id] = { id, name: id, desc: id, kind: 'proj', type: 'normal', cat: 'physical', maxLvl: 5 };
  Object.assign(G, {
    T: s => s, Coop: { active: false },
    Stats: { fit: () => 1, NAME: { physical: 'Físico' }, sideOf: () => 'physical' },
    Moves: { BY_ID, EVO: {}, poolFor: () => IDS.slice(), nonAttacking: () => false, evoInfo: () => null,
             nextUpText: m => (m.lvl < 5 ? 'sube' : null), levelUp: m => { m.lvl++; }, rebakeAll() {}, passiveAffects: () => true }
  });
  vm.runInContext(source('js/systems/levelup.js'), ctx, { filename: 'js/systems/levelup.js' });
  return G;
}
function mock(G, groups) {
  const mk = id => { const d = G.Moves.BY_ID[id]; return { id, def: d, name: d.name, type: d.type, kind: d.kind, lvl: 1 }; };
  const slots = groups.map(g => g.map(mk));
  return {
    mon: { dex: 1, types: ['normal'] }, slots, moves: slots.flat(), maxMoves: 4, statsTaken: {}, banned: new Set(),
    atkMul: 1, spdMul: 1, cdMul: 1, dmgReduce: 0, regenFlat: 0, magnet: 78, xpMul: 1, maxHp: 100, hp: 100, coins: 0,
    critChance: 0, pass: { area: 1, dur: 1, amt: 0, pspd: 1 },
    hasMove(id) { return this.moves.some(m => m.id === id); },
    addMove(id) { this.moves.push(mk(id)); this.slots.push([this.moves[this.moves.length - 1]]); },
    addMaxHp(n) { this.maxHp += n; this.hp += n; },
    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  };
}

test('cartas de nivel: con 4 ataques fusionados no sale ninguno nuevo; con 3 fusionados, sí', () => {
  const G = boot();
  const full = mock(G, [['m0', 'm1', 'm2', 'm3']]), part = mock(G, [['m0', 'm1'], ['m2', 'm3']]);
  for (let i = 0; i < 300; i++) {
    assert.ok(!G.LevelUp.offer(full).some(c => c.type === 'new'), 'grupo de 4: sin cartas de aprender');
    assert.ok(!G.LevelUp.offer(part).some(c => c.type === 'new'), 'dos grupos de 2: sin cartas de aprender');
  }
  const three = mock(G, [['m0', 'm1', 'm2']]);
  let seen = 0;
  for (let i = 0; i < 300; i++) if (G.LevelUp.offer(three).some(c => c.type === 'new')) seen++;
  assert.ok(seen > 0, 'con 3 ataques (aunque estén fusionados) aún se aprende el cuarto');
  // Nunca pasa de 4 por mucho que suba de nivel.
  const p = mock(G, [['m0']]);
  for (let lv = 0; lv < 300; lv++) {
    const cards = G.LevelUp.offer(p);
    const c = cards.find(x => x.type === 'new') || cards[0];
    c.apply(p);
    if (p.slots.length >= 2 && lv % 7 === 0) { const [a, b] = p.slots.splice(0, 2); p.slots.unshift(a.concat(b)); }   // fusionar a medias
    assert.ok(p.moves.length <= 4, 'ataques: ' + p.moves.length);
  }
});

test('HUD, pausa y cartas: los huecos libres son los que aún pueden llenarse; «n/4» cuenta ataques', () => {
  const hud = source('js/ui/hud.js');
  assert.match(hud, /nAll = Math\.max\(n, pl\.slots\.length \+ \(pl\.freeSlots \?/);
  const ui = source('js/ui/run-ui.js');
  assert.match(ui, /const freeAtk = pl => Math\.max\(0, pl\.maxMoves - pl\.moves\.length\)/);
  assert.match(ui, /group\('Ataques', pl\.moves\.length, pl\.maxMoves/);
  assert.match(ui, /slotNote\('atk', pl\.moves\.length, pl\.maxMoves\)/);
  assert.match(ui, /<small>\$\{pl\.moves\.length\}\/\$\{pl\.maxMoves\}<\/small>/);
  assert.ok(!/Queda un hueco libre/.test(ui), 'fusionar ya no deja un hueco libre');
  const en = source('js/data/lang-en.js'), dev = source('dev.html');
  const hint = 'Los movimientos unidos se lanzan a la vez. Sigues teniendo como mucho 4 ataques';
  assert.ok(dev.includes(hint) && en.includes(`'${hint}'`), 'aviso de la pantalla del vínculo, en los dos idiomas');
  assert.ok(!/slots\.length < pl\.maxMoves|slots\.length >= pl\.maxMoves/.test(source('js/systems/levelup.js')), 'levelup no mira los huecos');
});
