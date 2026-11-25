// Lo que decide el bot de tools/curve.cjs (1.0, bloque A, 24-11-2026): tools/bot-decide.js. Que elija con criterio
// (rareza, evolución, tiempo que queda, estilo) y no siempre lo mismo, y que respete los topes del presupuesto.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../tools/bot-decide.js');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const G = { U: { pick: a => a[0], clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
const ctx = vm.createContext({ G, Math, console });
for (const f of ['js/data/items.js', 'js/data/power-budget.js']) vm.runInContext(source(f), ctx, { filename: f });
const ATK = { name: 'atk', risk: 0.5 }, DEF = { name: 'def', risk: 0.5 }, MIX = { name: 'mix', risk: 0.5 };
const item = (mine, offer, o = {}) => D.pickItem(Object.assign({ mine, offer, same: -1, now: 300, EVO_T: 600, END: 1800, vals: G.Items.vals, style: MIX, minute: 5 }, o));

test('objetos: la rareza cuenta', () => {
  assert.equal(item([{ id: 'lifeorb', r: 0, t: 30 }], { id: 'lifeorb', r: 3 }, { same: 0 }), 0, 'el mismo, legendario: cambia');
  assert.equal(item([{ id: 'lifeorb', r: 3, t: 30 }], { id: 'choiceband', r: 0 }), -1, 'un común por un legendario: no');
  assert.equal(item([{ id: 'quickclaw', r: 0, t: 30 }], { id: 'choiceband', r: 3 }, { style: ATK }), 0);
});

test('objetos: no tira lo que está a punto de evolucionar ni cambia lo evolucionado por poco', () => {
  // Restos raro a 30 s de evolucionar contra Restos épico nuevo, a 10 min del final: se queda (el nuevo no llegaría a evolucionar).
  assert.equal(item([{ id: 'leftovers', r: 1, t: 570 }], { id: 'leftovers', r: 2 }, { same: 0, now: 1200, minute: 20 }), -1);
  // Con 15 min por delante, el épico sí llega a evolucionar y compensa.
  assert.equal(item([{ id: 'leftovers', r: 1, t: 570 }], { id: 'leftovers', r: 2 }, { same: 0, now: 900, minute: 15 }), 0);
  // El mismo cambio al principio sí compensa.
  assert.equal(item([{ id: 'leftovers', r: 1, t: 20 }], { id: 'leftovers', r: 2 }, { same: 0, now: 60, minute: 1 }), 0);
  // Evolucionado raro contra épico sin evolucionar a 5 min del final: se queda.
  assert.equal(item([{ id: 'assaultvest', r: 1, t: 700, evo: true }], { id: 'assaultvest', r: 2 }, { same: 0, now: 1500, minute: 25 }), -1);
});

test('objetos: el estilo cambia la elección (no siempre lo mismo)', () => {
  const mine = [{ id: 'lifeorb', r: 1, t: 30 }], offer = { id: 'assaultvest', r: 2 };
  assert.equal(item(mine, offer, { style: ATK }), -1, 'el atacante se queda la Vidasfera');
  assert.equal(item(mine, offer, { style: DEF }), 0, 'el defensivo se pone el Chaleco');
  // Con dos huecos, cambia el que menos vale.
  assert.equal(item([{ id: 'lifeorb', r: 2, t: 100 }, { id: 'amuletcoin', r: 0, t: 100 }], { id: 'choiceband', r: 2 }, { style: ATK, now: 900, minute: 15 }), 1);
  // La experiencia vale más al principio.
  const xpEarly = D.itemValue('luckyegg', 1, false, G.Items.vals('luckyegg', 1, false), MIX, 1);
  const xpLate = D.itemValue('luckyegg', 1, false, G.Items.vals('luckyegg', 1, false), MIX, 25);
  assert.ok(xpEarly > xpLate * 3);
});

test('estilo: con distinto azar salen los tres, con el mismo, el mismo', () => {
  assert.deepEqual([0.1, 0.5, 0.9].map(x => D.style(() => x).name), ['atk', 'def', 'mix']);
  assert.equal(D.style(() => 0.99, 'def').name, 'def');
  const r = D.style(() => 0.5);
  assert.ok(r.risk >= 0.25 && r.risk <= 0.85);
});

test('vínculo y Smeargle: une el que más pega; olvida uno flojo y sólo pronto', () => {
  assert.equal(D.pickBond([{ lvl: 2 }, { lvl: 5, evolved: true, dealt: 1e5 }, { lvl: 5, support: true }]), 1);
  assert.equal(D.forget([{ lvl: 4 }, { lvl: 1 }, { lvl: 2, evolved: true }], 6), 1);
  assert.equal(D.forget([{ lvl: 1 }], 20), -1);
  assert.equal(D.forget([{ lvl: 5 }], 5), -1);
});

test('rareza de cartas: más rara, más puntos', () => {
  for (let r = 1; r < 4; r++) assert.ok(D.cardRarity(r) > D.cardRarity(r - 1));
  assert.equal(D.cardRarity(undefined), 0);
});

test('vitaminas y templo: respeta el tope de cada vitamina y su lado', () => {
  const VIT = G.PowerBudget.VIT, o = [{ id: 'protein', r: 0 }, { id: 'calcium', r: 0 }, { id: 'hpup', r: 0 }];
  assert.equal(D.vitamin(o, {}, VIT, 1, ATK), 0, 'físico: Proteína');
  assert.equal(D.vitamin(o, {}, VIT, 0, ATK), 1, 'especial: Calcio');
  assert.equal(D.vitamin(o, { protein: 0.15 }, VIT, 1, ATK), 2, 'Proteína al tope: otra');
  assert.equal(D.vitamin(o, { protein: 0.15, calcium: 0.15, hpup: 0.25 }, VIT, 1, ATK), -1);
  assert.equal(D.vitamin(o, {}, VIT, 0.5, DEF), 2, 'el defensivo, Más PS');
  assert.equal(D.temple({ hpFrac: 0.9, enemies: 5, full: false, charge: 0, style: MIX }), true);
  assert.equal(D.temple({ hpFrac: 0.2, enemies: 5, full: false, charge: 0.1, style: MIX }), false);
  assert.equal(D.temple({ hpFrac: 0.2, enemies: 5, full: false, charge: 0.9, style: MIX }), true, 'casi cargado: aguanta');
  assert.equal(D.temple({ hpFrac: 1, enemies: 0, full: true, charge: 0, style: MIX }), false);
});

test('maldición y huevo: con criterio y forzables', () => {
  const c = o => D.curse(Object.assign({ hpFrac: 0.9, minute: 8, upg: 'max', recentFalls: 0, level: 0, cap: 3, style: { name: 'mix', risk: 0.8 }, roll: 0.1, force: 'auto' }, o));
  assert.equal(c({}), true);
  assert.equal(c({ roll: 0.95 }), false);
  assert.equal(c({ recentFalls: 1 }), false, 'acaba de caer: no');
  assert.equal(c({ hpFrac: 0.4 }), false);
  assert.equal(c({ level: 3 }), false, 'al tope');
  assert.equal(c({ force: 'si', hpFrac: 0.1 }), true);
  assert.equal(c({ force: 'no' }), false);
  assert.equal(D.egg({ has: false }), true);
  assert.equal(D.egg({ has: false, force: 'no' }), false);
  assert.equal(D.egg({ has: true, hasEvolved: false, newBst: 600, curBst: 300 }), true);
  assert.equal(D.egg({ has: true, hasEvolved: true, newBst: 600, curBst: 300 }), false);
});

test('tienda: cura si va mal, no gasta más de su parte y compra lo que le sirve', () => {
  const offers = [{ kind: 'item', id: 'lifeorb', r: 2, price: 600 }, { kind: 'heal', price: 150 }, { kind: 'vitamin', id: 'protein', r: 1, price: 400 }, { kind: 'luck', price: 300 }];
  const base = { coins: 1000, hpFrac: 0.9, minute: 10, style: { name: 'mix', risk: 0.5 }, itemGain: () => 40, vitOk: () => true, luck: 0, luckCap: 1 };
  const a = D.shop(offers, Object.assign({}, base));
  const spent = a.reduce((t, i) => t + offers[i].price, 0);
  assert.ok(spent <= 1000 * (0.25 + 0.5 * 0.5), 'gasta ' + spent);
  assert.ok(!a.includes(1), 'con vida, no se cura');
  assert.equal(D.shop(offers, Object.assign({}, base, { hpFrac: 0.3, coins: 200 }))[0], 1, 'con poca vida, lo primero es curarse');
  assert.deepEqual(D.shop(offers, Object.assign({}, base, { coins: 0 })), []);
  // El prudente gasta menos que el arriesgado.
  const sp = risk => D.shop(offers, Object.assign({}, base, { coins: 3000, style: { name: 'mix', risk } })).reduce((t, i) => t + offers[i].price, 0);
  assert.ok(sp(0.1) < sp(0.9));
});

test('máquina de Porygon (bloque E): el objeto que más gana por moneda, sin pasarse de su parte', () => {
  const st = { name: 'mix', risk: 0.5 };
  const offers = [{ id: 'a', r: 0, price: 400, gain: 10 }, { id: 'b', r: 1, price: 800, gain: 30 }, { id: 'c', r: 3, price: 0, gain: 0 }];
  assert.equal(D.machine(offers, { coins: 2000, style: st }), 1, '30/800 > 10/400');
  assert.equal(D.machine(offers, { coins: 1000, style: st }), 0, 'sólo le llega para el barato (parte: 750)');
  assert.equal(D.machine(offers, { coins: 300, style: st }), -1);
  assert.equal(D.machine([{ id: 'a', r: 0, price: 400, gain: 0 }], { coins: 5000, style: st }), -1, 'si no gana nada, no paga');
});
