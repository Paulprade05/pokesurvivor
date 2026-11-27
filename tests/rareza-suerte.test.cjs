// Una sola rareza, suerte y rareza en las mejoras de ataque (1.0, bloque D, 25-11-2026, lo decidió el dueño).
// data/items.js (G.Rarity), systems/fortune.js (G.Fortune, G.CardRarity), las cartas de levelup.js, Player.moveK,
// G.Moves.rebake (área) y lo que se ve (pausa, HUD, textos en inglés).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = o => JSON.parse(JSON.stringify(o));

/** Azar con semilla (mismo resultado siempre). */
const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

function load() {
  const G = { U: { pick: a => a[0], clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
              I18n: { f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } }, T: s => s, Game: { player: null } };
  const ctx = vm.createContext({ G, Math, console });
  for (const f of ['js/data/items.js', 'js/entities/player.js', 'js/data/power-budget.js', 'js/systems/fortune.js']) vm.runInContext(source(f), ctx, { filename: f });
  return G;
}
const G = load(), R = G.Rarity, F = G.Fortune, C = G.CardRarity;
const count = (n, f) => { const out = [0, 0, 0, 0]; for (let i = 0; i < n; i++) out[f()]++; return out.map(x => x / n); };

test('una sola tabla: 55/30/12/3 sin suerte y la de jefes (30/40/23/7) con la suerte al tope, sin pasarse', () => {
  assert.deepEqual(J(R.table(0)), [55, 30, 12, 3]);
  assert.deepEqual(J(R.table(1)), J(G.PowerBudget.FORTUNE.TABLE_MAX));
  assert.deepEqual(J(R.table(5)), J(R.table(1)), 'la suerte de más no sube');
  assert.deepEqual(J(R.table(-1)), J(R.table(0)));
  const h = R.table(0.5);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(h[i] - (R.W[i] + R.W_LUCK[i]) / 2) < 1e-9);
  // Los objetos usan la misma: nombres, colores y tiradas.
  assert.equal(G.Items.RAR.length, 4);
  G.Items.RAR.forEach((x, i) => { assert.equal(x.name, R.TIERS[i].name); assert.equal(x.col, R.TIERS[i].col); assert.ok(x.k > 0); });
  assert.equal(G.Items.color(3), R.color(3));
  const rnd = seeded(1);
  const a = count(40000, () => R.roll(0, rnd)), b = count(40000, () => R.roll(1, rnd));
  assert.ok(Math.abs(a[3] - 0.03) < 0.006 && Math.abs(a[0] - 0.55) < 0.015, 'sin suerte ' + a);
  assert.ok(Math.abs(b[3] - 0.07) < 0.008 && Math.abs(b[0] - 0.30) < 0.015, 'suerte al tope ' + b);
});

test('lift: la suerte de quien coge el objeto sube su rareza (nunca la baja) y sale como la tabla con esa suerte', () => {
  const rnd = seeded(3);
  for (const f of [0.25, 0.6, 1]) {
    const got = count(60000, () => { const r = R.roll(0, rnd), l = R.lift(r, f, rnd); assert.ok(l >= r); return l; });
    const want = R.table(f).map(x => x / 100);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(got[i] - want[i]) < 0.012, `f=${f} rareza ${i}: ${got[i]} vs ${want[i]}`);
  }
  assert.equal(R.lift(2, 0, rnd), 2, 'sin suerte no cambia');
  assert.equal(R.lift(3, 1, rnd), 3);
  // Jefes y cofres grandes: rareza ya decidida ('id:r:t'), la suerte no la mueve (game.js offerItem mira fixed).
  assert.match(G.Items.roll(1), /^\w+:[0-3]:t$/);
  assert.match(G.Items.roll(0), /^\w+:[0-3]$/);
  assert.deepEqual({ ...G.Items.parse('lifeorb:2:t') }, { id: 'lifeorb', r: 2, fixed: true });
  assert.equal(G.Items.key('lifeorb', 2, true), 'lifeorb:2:t');
  const g = source('js/game.js');
  assert.match(g, /!o\.fixed && G\.Fortune/);
  assert.match(g, /G\.Rarity\.lift\(o\.r, G\.Fortune\.of\(pl\)\)/);
  assert.match(g, /G\.Items\.key\(o\.id, o\.r, true\)/, 'tras subirla, ya no se vuelve a subir (objetos en cola)');
});

test('suerte: un número de 0 a 1 por jugador, con tope, que apunta el registro', () => {
  const seen = [];
  G.Reg = { v1: { fortune: v => seen.push(v) } };
  const pl = { fortune: 0 };
  G.Game.player = pl;
  assert.equal(F.of(pl), 0);
  assert.equal(F.add(pl, 0.3), 0.3);
  assert.equal(F.pct(pl), 30);
  assert.ok(Math.abs(F.add(pl, 0.9) - 0.7) < 1e-9, 'con tope');
  assert.equal(F.of(pl), F.MAX);
  F.add(pl, -2);
  assert.equal(F.of(pl), 0);
  assert.deepEqual(seen, [0.3, 1, 0]);
  F.add({ fortune: 0 }, 0.5);                 // la de otro (en grupo) no va a tu registro
  assert.equal(seen.length, 3);
  assert.equal(F.of(null), 0);
  assert.equal(F.MAX, G.PowerBudget.FORTUNE.MAX);
  // Cada jugador la suya, de serie a 0 (player.js); no es Puntería (luck).
  assert.match(source('js/entities/player.js'), /this\.fortune = 0;/);
});

test('rareza en las mejoras: extras del presupuesto (raro +2, épico +4 y +3 área, legendario +7 y +5 área), con tope', () => {
  assert.deepEqual(J(G.PowerBudget.verify(G)), [], 'cabe en el presupuesto de poder');
  assert.deepEqual(J(C.EXTRA), [0, 0.02, 0.04, 0.07]);
  assert.deepEqual(J(C.AREA_X), [0, 0, 0.03, 0.05]);
  assert.equal(C.CAP, 0.15); assert.equal(C.AREA, 0.15);
  const m = {};
  assert.deepEqual(J(C.apply(m, 0)), { dmg: 0, area: 0 });
  C.apply(m, 2);
  assert.equal(m.rx, 0.04); assert.equal(m.ra, 0.03);
  assert.equal(C.text(m, 3), '+7 % de daño y +5 % de área');
  assert.equal(C.text(m, 1), '+2 % de daño');
  for (let i = 0; i < 6; i++) C.apply(m, 3);
  assert.equal(m.rx, 0.15); assert.equal(m.ra, 0.15);
  assert.equal(C.text(m, 3), 'Ya tiene todo el extra de rareza');
  assert.equal(C.text(m, 0), '');
  assert.deepEqual(J(m.rc), [1, 0, 1, 6]);
  assert.equal(C.best(m), 3); assert.equal(C.best({}), -1);
  assert.equal(C.dmgK(m), 1.15); assert.equal(C.areaK(m), 1.15);
  // Con la suerte, más rareza; sin suerte, un ataque con sus 4 mejoras gana de media ~+5 % (con suerte al tope, ~+9 %).
  const avg = f => R.table(f).reduce((a, w, i) => a + w / 100 * C.EXTRA[i], 0) * 4;
  assert.ok(Math.abs(avg(0) - 0.0516) < 0.001 && Math.abs(avg(1) - 0.0884) < 0.001, avg(0) + ' / ' + avg(1));
});

test('el daño de más lo suma Player.moveK; el área, G.Moves.rebake (sin tocar los pasivos que viajan por la red)', () => {
  const p = Object.create(G.Player.prototype);
  p.over = 0;
  const a = { id: 'a' }, b = { id: 'b', rx: 0.07 };
  assert.ok(Math.abs(p.moveK(b) / p.moveK(a) - 1.07) < 1e-9);
  assert.equal(p.moveK({ z: 1, rx: 0.1 }), 1, 'los movimientos Z, no');
  const mv = source('js/data/moves.js');
  assert.match(mv, /if \(m\.ra\) rarityArea\(s, m\.ra\);/);
  assert.match(mv, /mulKeys\(s, r\.a, 1 \+ ra\)/);
});

test('cartas: sólo la de subir un ataque sale con rareza; sube un nivel (nunca dos) y el extra se queda en el ataque', () => {
  const ctx = { G: {}, console, Math };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source('js/core/util.js'), ctx, { filename: 'util.js' });
  const H = ctx.G, BY_ID = { m0: { id: 'm0', name: 'm0', desc: 'm0', kind: 'proj', type: 'normal', cat: 'physical', maxLvl: 5 } };
  Object.assign(H, {
    T: s => s, I18n: G.I18n, Coop: { active: false }, Rarity: G.Rarity, PowerBudget: G.PowerBudget,
    Stats: { fit: () => 1, NAME: { physical: 'Físico' }, sideOf: () => 'physical' },
    Moves: { BY_ID, EVO: {}, poolFor: () => ['m0'], nonAttacking: () => false, evoInfo: () => null,
             nextUpText: m => (m.lvl < 5 ? 'sube' : null), levelUp: m => { m.lvl++; }, rebakeAll() {}, passiveAffects: () => true }
  });
  for (const f of ['js/systems/fortune.js', 'js/systems/levelup.js']) vm.runInContext(source(f), ctx, { filename: f });
  const m = { id: 'm0', def: BY_ID.m0, name: 'm0', type: 'normal', kind: 'proj', lvl: 1 };
  const pl = { mon: { dex: 1, types: ['normal'] }, moves: [m], slots: [[m]], maxMoves: 4, statsTaken: {}, banned: new Set(), fortune: 1,
               pass: { area: 1, dur: 1, amt: 0, pspd: 1 }, hasMove: id => id === 'm0' };
  const rs = [0, 0, 0, 0];
  for (let i = 0; i < 4000; i++) {
    const c = H.LevelUp.offer(pl, 99).find(x => x.type === 'up');
    rs[c.r]++;
    assert.equal(!!c.rx, c.r > 0);
  }
  assert.ok(rs[0] / 4000 < 0.36 && rs[3] > 0, 'con suerte 1, la tabla de arriba: ' + rs);
  for (const c of H.LevelUp.offer(pl, 99)) if (c.type !== 'up') assert.equal(c.r, undefined, c.key);
  let up;
  do up = H.LevelUp.offer(pl, 99).find(x => x.type === 'up'); while (up.r !== 3);
  up.apply(pl);
  assert.equal(m.lvl, 2, 'un nivel');
  assert.equal(m.rx, 0.07); assert.equal(m.ra, 0.05);
});

test('se ve: carta con su chapa y data-r (bot), pausa (Suerte y extra de cada ataque), HUD, registro e inglés', () => {
  const ui = source('js/ui/run-ui.js');
  assert.match(ui, /el\.dataset\.r = c\.r/);
  assert.match(ui, /rar-on/);
  assert.match(ui, /\['luck', 'Suerte'/);
  assert.match(ui, /function pzRar\(m\)/);
  assert.match(source('js/ui/hud.js'), /G\.Fortune\.pct\(pl\)/);
  assert.match(source('js/core/registro.js'), /offer\.r = list\.map/);
  assert.match(source('js/core/registro.js'), /r\.rc = m\.rc\.slice\(\)/);
  assert.match(source('css/style.css'), /\.card\.pick-card\.rar-on/);
  const en = source('js/data/lang-en.js');
  for (const s of ['Suerte', '¡Suerte! Sube a {x}', 'Extra de rareza', '+{x} % de daño y +{x} % de área', '+{x} % de daño', '+{x} % de área', 'Ya tiene todo el extra de rareza'])
    assert.ok(en.includes(`'${s}':`), s);
  const h = source('dev.html');
  assert.ok(h.indexOf('js/systems/fortune.js') > h.indexOf('js/data/power-budget.js') && h.indexOf('js/systems/fortune.js') > 0, 'dev.html la carga detrás del presupuesto');
});
