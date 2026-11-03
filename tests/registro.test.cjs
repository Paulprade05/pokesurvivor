// Registro de cada partida (core/registro.js): contadores, guardado, exportar y el resumen de
// tools/analizar-partidas.cjs. 03-11-2026.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// (Lo que sale del contexto aislado, a objetos de aquí: deepEqual compara también el prototipo.)
const J = o => JSON.parse(JSON.stringify(o));
const tick = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }

/** Un almacén en memoria con lo mismo que el de IndexedDB. */
function memStore() {
  const runs = new Map(), sums = new Map();
  const clone = o => JSON.parse(JSON.stringify(o));
  return {
    runs_: runs, sums_: sums,
    put: (r, s) => { runs.set(r.id, clone(r)); sums.set(s.id, clone(s)); return Promise.resolve(); },
    get: id => Promise.resolve(runs.has(id) ? clone(runs.get(id)) : undefined),
    runs: () => Promise.resolve([...runs.values()].map(clone)),
    sums: () => Promise.resolve([...sums.values()].map(clone)),
    del: ids => { for (const id of ids) { runs.delete(id); sums.delete(id); } return Promise.resolve(); },
    clear: () => { runs.clear(); sums.clear(); return Promise.resolve(); }
  };
}

function load() {
  const ls = new Map();
  const G = {
    DEX_BY: { 4: { name: 'Charmander' }, 5: { name: 'Charmeleon' }, 19: { name: 'Rattata' }, 150: { name: 'Mewtwo' }, 74: { name: 'Geodude' } },
    Mons: { natureOf: () => ({ id: 'adamant' }), abilityOf: () => ({ id: 'blaze' }) },
    World: { seed: 42, biomeName: () => 'Bosque' },
    Weather: { current: null },
    Rift: { inArena: false }, Judgment: { active: false },
    EnemyMgr: { list: [], all() { return this.list; }, bossAlive: () => false },
    Coop: { isHost: false }
  };
  const localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
  const ctx = vm.createContext({ G, Math, console, performance, Date, JSON, localStorage, Promise, setTimeout });
  vm.runInContext(source('js/core/registro.js'), ctx, { filename: 'registro.js' });
  const store = memStore();
  G.Reg.useStore(store);
  return { G, R: G.Reg, store, ls };
}

function player() {
  const m1 = { id: 'ember', name: 'Ascuas', type: 'fire', kind: 'shot', lvl: 1, dealt: 0 };
  const m2 = { id: 'scratch', name: 'Arañazo', type: 'normal', kind: 'melee', lvl: 1, dealt: 0 };
  const pl = {
    dex: 4, form: 4, level: 1, xp: 0, hp: 100, maxHp: 100, kills: 0, bosses: 0, coins: 0, dmgDealt: 0, dmgTaken: 0, healed: 0,
    moves: [m1, m2], slots: [[m1], [m2]], active: 0, item: null, statsTaken: {}, mon: { types: ['fire'] }
  };
  pl.activeGroup = () => pl.slots[pl.active];
  return { pl, m1, m2 };
}

test('registro: per-attack counters (hits, boss damage, kills, active time) and damage taken by source', async () => {
  const { R, store } = load();
  const { pl, m1, m2 } = player();
  R.start(pl, { chosen: 4, upg: { hp: 3 } });
  assert.equal(R.on, true);
  const rat = { dex: 19, dead: false }, boss = { id: 7, dex: 150, boss: true, legend: true, dead: false, name: 'Mewtwo', maxHp: 9000 };
  // 3 golpes de Ascuas a un Rattata (el último lo tumba), 2 al jefe y uno de Arañazo.
  for (let i = 0; i < 3; i++) { if (i === 2) rat.dead = true; R.hit(pl, m1, rat, 10); m1.dealt += 10; pl.dmgDealt += 10; }
  R.hit(pl, m1, boss, 50); R.hit(pl, m1, boss, 50); m1.dealt += 100; pl.dmgDealt += 100;
  R.hit(pl, { id: 'ember~' }, boss, 5); m1.dealt += 5;                    // golpe de segunda: cuenta para Ascuas
  R.hit(pl, m2, rat, 7); m2.dealt += 7; pl.dmgDealt += 7;
  R.hit({ other: true }, m1, rat, 999);                                   // un compañero: no cuenta
  // Te pegan: el Rattata al tocarte y el jefe con su firma.
  R.hurt(pl, 12, rat, 'toque', 'normal'); R.hurt(pl, 12, rat, 'toque', 'normal');
  R.hurt(pl, 40, boss, 'Psicoataque', 'psychic');
  R.hurt(pl, 5, 'x:terreno', 'lava');
  pl.dmgTaken = 69;
  R.heal(pl, 10, 'comida'); R.heal(pl, 4, 'regeneración'); pl.healed = 20;   // 6 sin fuente → «(otros)»
  for (let t = 1; t <= 12; t++) R.tick(1, t);                               // 12 s con Ascuas activo
  pl.active = 1;
  for (let t = 13; t <= 15; t++) R.tick(1, t);
  pl.dead = true; R.down(pl);
  const r = J(R.end(true, { coins: 77 }));
  assert.equal(R.on, false);
  const e = r.moves.ember, s = r.moves.scratch;
  assert.equal(e.hits, 6); assert.equal(e.boss, 105); assert.equal(e.kills, 1); assert.equal(e.dealt, 135); assert.equal(e.horde, 30);
  assert.equal(e.active, 12); assert.equal(s.active, 3); assert.equal(s.hits, 1); assert.equal(s.kills || 0, 0);
  assert.deepEqual(r.takenBy['h:19|toque'], [24, 2]);
  assert.deepEqual(r.takenBy['l:150|Psicoataque'], [40, 1]);
  assert.deepEqual(r.takenBy['x:terreno|lava'], [5, 1]);
  assert.equal(r.healBy.comida, 10); assert.equal(r.healBy['regeneración'], 4); assert.equal(r.healBy['(otros)'], 6);
  assert.equal(r.downs.length, 1); assert.equal(r.downs[0].by, 'x:terreno|lava'); assert.equal(r.killer, 'x:terreno|lava');
  assert.equal(r.state, 'muerto'); assert.equal(r.coins, 77); assert.equal(r.upg.hp, 3); assert.equal(r.mon.nat, 'adamant');
  assert.equal(r.nm[150], 'Mewtwo'); assert.equal(r.nm[19], 'Rattata');
  assert.deepEqual(r.tl.map(l => l[0]), [10, 15], 'una línea cada 10 s y la última al acabar'); assert.deepEqual(r.tlKeys.slice(0, 3), ['t', 'hp', 'maxHp']);
  await settle();
  assert.equal(store.runs_.size, 1, 'guardada al acabar');
  const sum = [...store.sums_.values()][0];
  assert.equal(sum.top.id, 'ember'); assert.equal(sum.killer, 'x:terreno|lava'); assert.equal(sum.coins, 77);
});

test('registro: cards offered and picked (with rerolls), passives, items, level and evolution over time', () => {
  const { R } = load();
  const { pl, m1 } = player();
  R.start(pl, {});
  R.offered([{ key: 'up:ember' }, { key: 'stat:atk' }, { key: 'new:scald' }], 2);
  R.offered([{ key: 'stat:hp' }, { key: 'stat:spd' }, { key: 'up:scratch' }], 2);   // cambio de cartas
  R.picked({ key: 'stat:hp' });
  R.picked({ key: 'stat:spd' });                                                   // sin cartas a la vista: nada
  pl.statsTaken.hp = 1; pl.level = 2; pl.item = 'leftovers'; m1.lvl = 2;
  R.tick(1, 61);
  m1.evolved = true; pl.form = 5; pl.slots = [[m1, pl.moves[1]]];
  R.tick(1, 62);
  R.ev('cofre');
  const r = J(R.build());
  assert.equal(r.cards.length, 2);
  assert.equal(r.cards[0].p, null, 'la que se cambió sin elegir');
  assert.equal(r.cards[1].p, 'stat:hp');
  assert.deepEqual(r.cards[1].o, ['stat:hp', 'stat:spd', 'up:scratch']);
  assert.deepEqual(r.pass, [[61, 'hp', 1]]);
  assert.deepEqual(r.items, [[61, 'leftovers']]);
  assert.deepEqual(r.lv, [[61, 2]]);
  assert.deepEqual(r.moves.ember.lv, [[0, 1], [61, 2]]);
  assert.equal(r.moves.ember.evo, 62); assert.equal(r.moves.ember.fuse, 62);
  assert.ok(r.ev.some(e => e[1] === 'evo' && e[2] === 5));
  assert.ok(r.ev.some(e => e[1] === 'cofre' && e[0] === 62));
});

test('registro: bosses seen and beaten with their fight time; kills by class', () => {
  const { G, R } = load();
  const { pl } = player();
  R.start(pl, {});
  const b = { id: 3, dex: 74, boss: true, dead: false, name: 'Geodude', maxHp: 5000 };
  G.EnemyMgr.list = [b];
  R.tick(1, 100);
  b.dead = true; b.fightT = 21.5;
  R.tick(1, 121);
  R.kill(b); R.kill({ dex: 19 }); R.kill({ dex: 19 });
  const r = J(R.build());
  assert.equal(r.bosses.length, 1);
  assert.equal(r.bosses[0].k, 'b:74'); assert.equal(r.bosses[0].t, 100); assert.equal(r.bosses[0].kt, 121); assert.equal(r.bosses[0].fight, 21.5);
  assert.deepEqual(r.kinds, { h: 2, b: 1, l: 0, a: 0 });
  assert.equal(r.moves['(otros)'].kills, 3, 'sin ataque que los tumbara (quemaduras, venenos...)');
});

test('registro: saves on the way (every 30 s) and a run left open becomes «cerrada» on the next start', async () => {
  const { R, store, ls } = load();
  const { pl } = player();
  R.start(pl, {});
  for (let t = 1; t <= 31; t++) R.tick(1, t);
  await settle();
  const id = R.current.id;
  assert.equal(store.sums_.get(id).state, 'jugando', 'guardada a medias');
  // Se oculta la app (cierra): copia síncrona en localStorage, más nueva que la de IndexedDB.
  for (let t = 32; t <= 50; t++) R.tick(1, t);
  R.stash();
  assert.ok(ls.get('ps.reg.last'));
  // Otra vez el juego: la de antes ya no está en curso.
  const again = load();
  again.R.useStore(store);
  again.ls.set('ps.reg.last', ls.get('ps.reg.last'));
  await again.R.init();
  await settle();
  const s = store.sums_.get(id);
  assert.equal(s.state, 'cerrada');
  assert.equal(s.dur, 50, 'con lo último de la copia');
  assert.equal(again.ls.has('ps.reg.last'), false);
});

test('registro: keeps only the last 500 runs; export has them all in order', async () => {
  const { R, store } = load();
  const { pl } = player();
  let id = 1e12;
  const realNow = Date.now;
  Date.now = () => ++id;
  try {
    for (let i = 0; i < R.MAX + 3; i++) { R.start(pl, {}); R.tick(1, 1); R.end(false); await tick(); }
  } finally { Date.now = realNow; }
  await settle();
  assert.equal(store.sums_.size, R.MAX);
  assert.equal(store.runs_.size, R.MAX);
  const data = await R.exportData();
  assert.equal(data.fmt, 'ps-partidas');
  assert.equal(data.runs.length, R.MAX);
  assert.ok(data.runs.every((r, i) => i === 0 || r.id > data.runs[i - 1].id), 'de la más vieja a la más nueva');
  assert.ok(!store.sums_.has(1e12 + 1), 'la más vieja se ha borrado');
  const list = await R.list();
  assert.ok(list[0].id > list[1].id, 'el historial, la más nueva arriba');
});

test('registro: no objects per hit; a hit with no run going is a no-op', () => {
  const { R } = load();
  const { pl, m1 } = player();
  R.hit(pl, m1, { dex: 1 }, 10);           // sin partida
  R.hurt(pl, 10, null, 'toque');
  R.start(pl, {});
  const e = { dex: 19 };
  R.hit(pl, m1, e, 1);
  const keys = Object.keys(e).length;
  for (let i = 0; i < 1000; i++) R.hit(pl, m1, e, 1);
  assert.equal(Object.keys(e).length, keys, 'el enemigo no gana campos por golpe');
  assert.equal(R.build().moves.ember.hits, 1001);
});

test('analizar-partidas: summary of an export (attacks, killers, healing, cards, bosses)', async () => {
  const { R } = load();
  const runs = [];
  for (let i = 0; i < 4; i++) {
    const { pl, m1, m2 } = player();
    R.start(pl, {});
    const rat = { dex: 19 }, mew = { id: 9, dex: 150, boss: true, legend: true, name: 'Mewtwo', maxHp: 1 };
    R.hit(pl, m1, rat, 10); m1.dealt = 600; m2.dealt = 60; pl.dmgDealt = 660;
    R.hurt(pl, 30, mew, 'Psicoataque'); pl.dmgTaken = 30;
    R.heal(pl, 15, 'comida'); pl.healed = 15;
    R.offered([{ key: 'stat:hp' }, { key: 'stat:atk' }]); R.picked({ key: 'stat:atk' });
    for (let k = 0; k < 4; k++) R.offered([{ key: 'stat:hp' }, { key: 'stat:atk' }]), R.picked({ key: 'stat:atk' });
    for (let t = 1; t <= 60; t++) R.tick(1, t);
    R.down(pl);
    runs.push(R.end(true));
  }
  const A = require('../tools/analizar-partidas.cjs');
  const s = A.analyze(runs.concat([{ id: 1, dur: 5 }]));
  assert.equal(s.partidas, 4); assert.equal(s.descartadas, 1);
  assert.equal(s.ataquesQueMasPegan[0].id, 'ember');
  assert.equal(s.ataquesQueMenosPegan[0].id, 'scratch');
  assert.equal(s.quienTeTumba['Mewtwo (l:150)'], 4);
  assert.equal(s.curacionPorFuente.comida, 15);
  assert.equal(s.cartasMasElegidas[0].carta, 'stat:atk'); assert.equal(s.cartasMasElegidas[0].elegida, '100%');
  assert.equal(s.danoRecibidoPorClase.legendarios, '100%');
  assert.ok(A.text(s).includes('Quién te tumba'));
});

// ---------------- resumen anónimo en la nube (net/stats.js) ----------------
function cloud(over = {}) {
  const { G, R, store } = load();
  const sent = [];
  G.Settings = { v: { shareStats: true }, get(k) { return this.v[k]; } };
  G.DB = { online: true, fb: { uid: 'u1', fs: {
    collection: c => ({ doc: id => ({ c, id: id || 'auto' }) }),
    batch: () => { const ops = []; return { set: (ref, d) => ops.push([ref.c, ref.id, d]), commit: () => { sent.push(ops); return Promise.resolve(); } }; }
  } } };
  Object.assign(G, over);
  const ctx = vm.createContext({ G, Math, console, Date, JSON, Promise, setTimeout, clearTimeout,
                                 firebase: { firestore: { FieldValue: { serverTimestamp: () => '__ts__' } } } });
  vm.runInContext(source('js/net/stats.js'), ctx, { filename: 'stats.js' });
  return { G, R, C: G.RegCloud, sent, store };
}
function playedRun(R, secs = 60) {
  const { pl, m1 } = player();
  R.start(pl, { upg: { hp: 2 } });
  R.current.ver = 'abc123';
  const mew = { id: 9, dex: 150, boss: true, legend: true, name: 'Mewtwo', maxHp: 1 };
  R.hit(pl, m1, mew, 50); m1.dealt = 500; pl.dmgDealt = 500;
  R.hurt(pl, 30, mew, 'Psicoataque'); R.heal(pl, 9, 'comida'); pl.healed = 9;
  R.offered([{ key: 'stat:hp' }, { key: 'stat:atk' }]); R.picked({ key: 'stat:atk' });
  for (let t = 1; t <= secs; t++) R.tick(1, t);
  R.down(pl);
  return { pl };
}

test('stats: the cloud summary has no name or account, fits the Firestore rules and has no nested lists', async () => {
  const { R, C, sent } = cloud();
  playedRun(R);
  const r = R.end(true, { coins: 12 });
  await settle();
  assert.equal(sent.length, 1, 'una subida al acabar');
  const [[col, , doc], [qcol, qid, q]] = sent[0];
  assert.equal(col, 'stats'); assert.equal(qcol, 'statsq'); assert.equal(qid, 'u1'); assert.deepEqual(J(q), { at: '__ts__' });
  const txt = JSON.stringify(doc);
  assert.ok(!txt.includes('u1'), 'sin la cuenta');
  const allowed = ['v', 'at', 'ver', 'mode', 'pl', 'st', 'dur', 'dex', 'form', 'abil', 'nat', 'lvl', 'kills', 'coins', 'dealt', 'taken', 'healed',
                   'downs', 'killer', 'killT', 'kinds', 'dev', 'fps', 'upg', 'moves', 'tk', 'hb', 'cards', 'bosses'];
  assert.deepEqual(Object.keys(doc).filter(k => !allowed.includes(k)), [], 'sólo los campos de firestore.rules');
  const rules = source('firestore.rules');
  for (const k of allowed) assert.ok(rules.includes(`'${k}'`), 'la regla conoce ' + k);
  assert.ok(Number.isInteger(doc.dur) && doc.dur >= 30 && Number.isInteger(doc.v));
  assert.ok(Object.keys(doc.moves).length <= 10 && Object.keys(doc.tk).length <= 8 && Object.keys(doc.hb).length <= 6 &&
            Object.keys(doc.cards).length <= 40 && doc.bosses.length <= 15 && doc.killer.length <= 60);
  const nested = v => Array.isArray(v) ? v.some(x => Array.isArray(x) || nested(x)) : v && typeof v === 'object' ? Object.values(v).some(nested) : false;
  assert.equal(nested(doc), false, 'Firestore no deja listas dentro de listas');
  assert.equal(doc.killer, 'l:150|Psicoataque'); assert.equal(doc.moves.ember.d, 500); assert.deepEqual(J(doc.cards['stat:atk']), [1, 1]);
  assert.ok(JSON.stringify(doc).length < 3000, 'unos 1-2 KB');
  assert.equal(r.cloud, 1);
  await settle();
  assert.equal((await R.list())[0].cloud, 1, 'marcada como subida en el historial');
});

test('stats: nothing goes up as a guest, with the setting off, from dev.html or for runs under 30 s', async () => {
  for (const [why, setup, secs] of [
    ['invitado', c => { c.G.DB.online = false; }, 60],
    ['ajuste', c => { c.G.Settings.v.shareStats = false; }, 60],
    ['dev', c => { c.dev = true; }, 60],
    ['corta', () => {}, 20]]) {
    const c = cloud();
    setup(c);
    playedRun(c.R, secs);
    if (c.dev) c.R.current.ver = 'dev';
    c.R.end(true);
    await settle();
    assert.equal(c.sent.length, 0, why);
  }
});

test('analizar-partidas: reads the cloud summaries (ps-resumenes) like local runs', () => {
  const { R, C } = cloud();
  playedRun(R);
  const b = J(C.brief(R.build()));
  const A = require('../tools/analizar-partidas.cjs');
  const os = require('node:os');
  const f = path.join(os.tmpdir(), 'ps-resumenes-test-' + process.pid + '.json');
  fs.writeFileSync(f, JSON.stringify({ fmt: 'ps-resumenes', runs: [Object.assign({}, b, { id: 'a', at: 1 }), Object.assign({}, b, { id: 'b', at: 2 })] }));
  try {
    const runs = A.load([f]);
    assert.equal(runs.length, 2);
    const s = A.analyze(runs);
    assert.equal(s.partidas, 2);
    assert.equal(s.ataquesQueMasPegan[0].id, 'ember');
    assert.equal(s.quienTeTumba['Mewtwo (l:150)'], 2, 'con el nombre sacado de la Pokédex');
    assert.equal(s.cartasMasElegidas.length, 0, 'menos de 5 veces: no sale');
    assert.equal(s.caidas.total, 2);
  } finally { fs.unlinkSync(f); }
});
