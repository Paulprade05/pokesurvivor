// Cartas de subida de nivel de la 2.0 (bloque 1, 31-10-2026): topes de las cartas,
// Potencia y compañía aditivas, «Curarte un poco» (20 %) y «Monedas» con todo al tope (y el ajuste que las elige solas),
// el repertorio sorteado por partida y los descartes. node tests/levelup.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

// 15 ataques de mentira (los de verdad necesitan medio juego cargado).
const IDS = Array.from({ length: 15 }, (_, i) => 'm' + i);
function boot(coop = false) {
  const ctx = { G: {}, console, Math };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source('js/core/util.js'), ctx, { filename: 'js/core/util.js' });
  const G = ctx.G, BY_ID = {};
  for (const id of IDS) BY_ID[id] = { id, name: id, desc: id, kind: 'proj', type: 'normal', cat: 'physical', maxLvl: 5 };
  Object.assign(G, {
    T: s => s,
    Coop: { active: coop },
    Stats: { fit: () => 1, NAME: { physical: 'Físico' }, sideOf: () => 'physical' },
    Moves: { BY_ID, EVO: {}, poolFor: () => IDS.slice(), nonAttacking: () => false, evoInfo: () => null,
             nextUpText: m => (m.lvl < 5 ? 'sube' : null), levelUp: m => { m.lvl++; }, rebakeAll() {}, passiveAffects: () => true }
  });
  vm.runInContext(source('js/systems/levelup.js'), ctx, { filename: 'js/systems/levelup.js' });
  return G;
}

function player(G, start = ['m0']) {
  const pl = {
    mon: { dex: 1, types: ['normal'] }, moves: [], slots: [], maxMoves: 4, statsTaken: {}, banned: new Set(),
    atkMul: 1, spdMul: 1, cdMul: 1, dmgReduce: 0, regenFlat: 0, magnet: 78, xpMul: 1, maxHp: 100, hp: 100, coins: 0,
    critChance: 0, pass: { area: 1, dur: 1, amt: 0, pspd: 1 },
    hasMove(id) { return this.moves.some(m => m.id === id); },
    addMove(id) { const d = G.Moves.BY_ID[id]; this.moves.push({ id, def: d, name: d.name, type: d.type, kind: d.kind, lvl: 1 }); this.slots.push([id]); },
    addMaxHp(n) { this.maxHp += n; this.hp += n; },
    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  };
  for (const id of start) pl.addMove(id);
  return pl;
}

test('300 subidas: nunca por encima del tope y offer() nunca vacío', () => {
  const G = boot();
  const caps = Object.fromEntries(G.LevelUp.STATS.filter(s => s.max).map(s => [s.id, s.max]));
  for (let run = 0; run < 50; run++) {
    const pl = player(G);
    let full = 0;
    for (let lv = 0; lv < 300; lv++) {
      const cards = G.LevelUp.offer(pl);
      assert.ok(cards.length > 0, 'offer vacío en la subida ' + lv);
      if (cards.every(c => c.key === 'stat:heal' || c.key === 'stat:coin')) full++;
      cards[Math.floor(Math.random() * cards.length)].apply(pl);
      for (const id in pl.statsTaken) if (caps[id]) assert.ok(pl.statsTaken[id] <= caps[id], `${id} ${pl.statsTaken[id]} > ${caps[id]}`);
    }
    assert.ok(pl.atkMul <= 2.0 + 1e-9, 'Potencia ' + pl.atkMul);
    assert.ok(pl.maxHp - 100 <= 160, 'Vigor ' + (pl.maxHp - 100));
    assert.ok(pl.dmgReduce <= G.LevelUp.DEF_CAP + 1e-9, 'Coraza ' + pl.dmgReduce);
    assert.ok(pl.regenFlat <= 5 * 0.9 + 1e-9, 'Síntesis ' + pl.regenFlat);
    assert.ok(full > 0, 'en 300 subidas tiene que llegar a tenerlo todo al tope');
  }
});

test('Potencia, Carrera, Imán y Aprendizaje suman: ×(1 + k·n)', () => {
  const G = boot();
  const pl = player(G);
  const S = id => G.LevelUp.STATS.find(s => s.id === id);
  for (let i = 0; i < 10; i++) { S('atk').apply(pl); pl.statsTaken.atk = (pl.statsTaken.atk || 0) + 1; }
  for (let i = 0; i < 4; i++) { S('xp').apply(pl); pl.statsTaken.xp = (pl.statsTaken.xp || 0) + 1; }
  assert.ok(Math.abs(pl.atkMul - 2.0) < 1e-9);
  assert.ok(Math.abs(pl.xpMul - 1.48) < 1e-9);
  // Con mejoras compradas (atkMul de partida 1,4): ×1,4 × 2,0.
  const p2 = player(G); p2.atkMul = 1.4;
  for (let i = 0; i < 10; i++) { S('atk').apply(p2); p2.statsTaken.atk = (p2.statsTaken.atk || 0) + 1; }
  assert.ok(Math.abs(p2.atkMul - 2.8) < 1e-9);
});

/** Pokémon con todo al máximo: 4 ataques a nivel 5 y 4 pasivas con su tope. */
function maxed(G) {
  const pl = player(G, ['m0', 'm1', 'm2', 'm3']);
  for (const m of pl.moves) m.lvl = 5;
  for (const id of ['atk', 'hp', 'cd', 'def']) pl.statsTaken[id] = G.LevelUp.STATS.find(s => s.id === id).max;
  return pl;
}

test('todo al máximo: salen «Curarte un poco» (20 %) y «Monedas», también en cooperativo', () => {
  for (const coop of [false, true]) {
    const G = boot(coop);
    const pl = maxed(G);
    const cards = G.LevelUp.offer(pl);
    assert.equal(cards.map(c => c.key).sort().join(), 'stat:coin,stat:heal');
    assert.equal(cards.find(c => c.full === 'heal').title, 'Curarte un poco');
    assert.equal(cards.find(c => c.full === 'coin').title, 'Monedas');
    pl.hp = 10;
    cards.find(c => c.key === 'stat:heal').apply(pl);
    assert.equal(pl.hp, 30);
    // Las monedas van aparte (pl.bonusCoins): en cooperativo el anfitrión pisa pl.coins.
    pl.coins = 7;
    cards.find(c => c.key === 'stat:coin').apply(pl);
    assert.equal(pl.coins, 7);
    assert.equal(pl.bonusCoins, 20);
  }
});

test('monedas de todo al máximo: suben con el minuto, de 5 en 5', () => {
  const G = boot();
  assert.deepEqual([0, 10, 20, 30, 40].map(m => G.LevelUp.fullCoins(m * 60)), [20, 35, 50, 65, 80]);
  G.Game = { st: { time: 30 * 60 } };
  const pl = maxed(G);
  const c = G.LevelUp.offer(pl).find(x => x.full === 'coin');
  assert.equal(c.desc, '+65 monedas al acabar la partida.');
  assert.equal(G.LevelUp.fullGain(pl, c), '+65 monedas');
  assert.equal(pl.bonusCoins, 65);
});

test('ajuste fijado: la carta se aplica sola; Preguntar o sin todo al máximo, no', () => {
  for (const coop of [false, true]) {
    const G = boot(coop);
    const store = { maxPick: 'ask' };
    G.Settings = { get: k => store[k], set: (k, v) => { store[k] = v; } };
    const pl = maxed(G);
    assert.equal(G.LevelUp.auto(pl), null, 'Preguntar: salen las cartas');
    G.Settings.set('maxPick', 'heal');
    const h = G.LevelUp.auto(pl);
    assert.equal(h && h.full, 'heal');
    pl.hp = 50;
    assert.equal(G.LevelUp.fullGain(pl, h), '+20 PV');
    assert.equal(pl.hp, 70);
    // Cambiar el ajuste después (Ajustes → «Al subir con todo al máximo»).
    G.Settings.set('maxPick', 'coin');
    const c = G.LevelUp.auto(pl);
    assert.equal(c && c.full, 'coin');
    G.LevelUp.fullGain(pl, c);
    assert.equal(pl.bonusCoins, 20);
    G.Settings.set('maxPick', 'raro');
    assert.equal(G.LevelUp.maxPick(), 'ask');
    assert.equal(G.LevelUp.auto(pl), null);
    // Sin todo al máximo, aunque esté fijado, salen las cartas de siempre.
    G.Settings.set('maxPick', 'heal');
    const fresh = player(G);
    assert.equal(G.LevelUp.auto(fresh), null);
    assert.ok(G.LevelUp.offer(fresh).every(x => !x.full));
  }
});

test('Ajustes: maxPick es «Preguntar» de serie y se guarda en el navegador', () => {
  const mem = {};
  const ctx = { G: {}, console, localStorage: { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } },
                matchMedia: () => ({ matches: false }) };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source('js/core/settings.js'), ctx);
  assert.equal(ctx.G.Settings.get('maxPick'), 'ask');
  ctx.G.Settings.set('maxPick', 'coin');
  assert.equal(JSON.parse(mem['ps.settings']).maxPick, 'coin');
  const ctx2 = { G: {}, console, localStorage: ctx.localStorage, matchMedia: ctx.matchMedia };
  ctx2.window = ctx2;
  vm.createContext(ctx2);
  vm.runInContext(source('js/core/settings.js'), ctx2);
  assert.equal(ctx2.G.Settings.get('maxPick'), 'coin');
});

test('repertorio por partida: el 70 % (mínimo 10), con los iniciales, y fijo', () => {
  const G = boot();
  const pl = player(G, ['m14']);
  const pool = G.LevelUp.runPool(pl);
  assert.equal(pool.length, Math.max(10, Math.ceil(IDS.length * 0.7)));
  assert.ok(pool.includes('m14'));
  assert.equal(G.LevelUp.runPool(pl).join(), pool.join());
  for (let i = 0; i < 30; i++) for (const c of G.LevelUp.offer(pl)) if (c.type === 'new') assert.ok(pool.includes(c.key.slice(4)));
});

test('descartar: 2 por partida, el ataque o la pasiva ya no salen', () => {
  const G = boot();
  const pl = player(G);
  const atk = { type: 'stat', key: 'stat:atk' }, mv = { type: 'new', key: 'new:m5' };
  assert.equal(G.LevelUp.canDiscard(pl, { type: 'stat', key: 'stat:heal' }), false);
  assert.equal(G.LevelUp.canDiscard(pl, { type: 'up', key: 'up:m0' }), false);
  assert.equal(G.LevelUp.discard(pl, atk), true);
  assert.equal(G.LevelUp.discard(pl, mv), true);
  assert.equal(G.LevelUp.discardsLeft(pl), 0);
  assert.equal(G.LevelUp.discard(pl, { type: 'stat', key: 'stat:cd' }), false);
  for (let i = 0; i < 40; i++) for (const c of G.LevelUp.offer(pl)) assert.ok(c.key !== 'stat:atk' && c.key !== 'new:m5', c.key);
});
