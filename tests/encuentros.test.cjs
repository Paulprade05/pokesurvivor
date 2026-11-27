// Encuentros del mapa (1.0, bloque E, 25-11-2026, lo decidió el dueño): systems/encounters.js (G.Vitamins, G.Encounters),
// ui/encounter-ui.js, lo que usa el bot (tools/curve.cjs) y los textos en inglés. node --test tests/encuentros.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = o => JSON.parse(JSON.stringify(o));
const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

function load() {
  const said = [], bought = [];
  const G = {
    U: { pick: a => a[0], clamp: (v, a, b) => Math.max(a, Math.min(b, v)), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2, rand: (a, b) => (a + b) / 2 },
    I18n: { f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } }, T: s => s,
    Game: { st: { time: 0 }, player: null, everyone: () => [] },
    Coop: { active: false, isHost: false }, Rift: {}, Judgment: null,
    Reg: { v1: { buy: (...a) => bought.push(a), vitamin() {}, encounter() {} } },
    Audio: { sfx() {} }, FX: { ring() {}, burst() {}, px() {} }, Spawner: { say: t => said.push(t) },
    Projectiles: { clearOrbs() {} }, Sprites: { preload() {} },
    Companion: { rollEgg: () => ({ dex: 4, r: 1 }), give: (pl, g) => { pl.companion = { dex: g.dex, r: g.r, egg: true }; } }   // (bloque G: tests/companero.test.cjs)
  };
  const c = { G, Math, console, window: {} };
  c.window.G = G;
  vm.createContext(c);
  for (const f of ['js/data/items.js', 'js/entities/player.js', 'js/data/power-budget.js', 'js/systems/fortune.js', 'js/data/moves.js', 'js/systems/encounters.js'])
    vm.runInContext(source(f), c, { filename: f });
  G.Items.refresh = () => {};
  return { G, said, bought };
}
const { G, said, bought } = load();
const V = G.Vitamins, E = G.Encounters, PB = G.PowerBudget;

function player(o = {}) {
  const p = Object.create(G.Player.prototype);
  Object.assign(p, { x: 0, y: 0, bodyH: 30, maxHp: 100, hp: 100, kills: 0, bosses: 0, coins: 0, bonusCoins: 0, coinMul: 1, items: [], pass: {}, fortune: 0 }, o);
  if (!p.slots) { p.slots = []; p.moves = []; p.active = 0; }
  return p;
}
const atk = (id, lvl = 1) => Object.assign(G.Moves.instance(id, lvl), { id, lvl });
const countMove = () => G.Moves.ALL.find(m => G.Moves.PASSIVE_RULES[m.kind] && G.Moves.PASSIVE_RULES[m.kind].n && typeof G.Moves.instance(m.id, 1).count === 'number').id;

test('vitaminas: las del presupuesto de poder, sin pasarse (G.PowerBudget.verify)', () => {
  assert.deepEqual(J(PB.verify(G)), []);
  assert.deepEqual(Object.keys(V.VIT).sort(), Object.keys(PB.VIT).sort());
  for (const id in V.VIT) {
    assert.deepEqual([...V.VIT[id].step], [...PB.VIT[id].step], id);
    assert.equal(V.VIT[id].cap, PB.VIT[id].cap, id);
    assert.ok(V.NAME[id], 'nombre de ' + id);
  }
});

test('cada vitamina llega justo a su tope y de ahí no pasa; Más PS sube la vida en proporción', () => {
  for (const id of V.IDS.filter(i => i !== 'ppup')) {
    const p = player();
    let n = 0;
    while (V.gain(p, id, 3) > 0 && n++ < 50) V.apply(p, id, 3);
    assert.ok(Math.abs(p.vit[id] - V.VIT[id].cap) < 1e-9, id + ' ' + p.vit[id]);
    assert.equal(V.apply(p, id, 3), 0, id + ' al tope no suma');
    assert.ok(!V.offer(p, 7, seeded(3)).some(o => o.id === id), id + ' al tope no se ofrece');
    if (id === 'hpup') assert.ok(Math.abs(p.maxHp - Math.round(100 * (1 + V.VIT.hpup.cap))) <= n, 'vida ' + p.maxHp);
  }
  // Lo que hacen en el combate.
  const p = player({ vit: { protein: 0.1, calcium: 0.2, iron: 0.05, zinc: 0.1, carbos: 0.08 } });
  assert.equal(V.atkK(p, 'physical'), 1.1); assert.equal(V.atkK(p, 'special'), 1.2); assert.equal(V.atkK(p, 'status'), 1);
  assert.equal(V.inK(p, 'physical'), 0.95); assert.equal(V.inK(p, 'special'), 0.9); assert.equal(V.spdK(p), 1.08);
  assert.equal(V.atkK(player(), 'physical'), 1);
});

test('Más PP: +1 de cantidad por toma, por encima del tope de Réplica (EXTRA_MAX), hasta el de la vitamina', () => {
  const id = countMove(), m = atk(id), base = m.count, n = G.Moves.PASSIVE_RULES[m.kind].n;
  const p = player({ slots: [[m]], moves: [m] });
  assert.equal(V.ppTarget(p), m);
  let k = 0;
  while (V.gain(p, 'ppup', 3) > 0 && k++ < 20) V.apply(p, 'ppup', 3, m);
  assert.equal(p.vit.ppup, V.VIT.ppup.cap);
  assert.equal(m.pp, V.VIT.ppup.cap);
  assert.equal(m.count, base + n * m.pp);
  // Con los pasivos ya al tope de Réplica, sigue sumando.
  const full = atk(id); full.pp = 2;
  const P = {}; for (const k2 of G.Moves.passiveKeys(full.kind, 'amt')) P.amt = G.Moves.EXTRA_MAX;
  G.Moves.rebake(full, P);
  const noPP = G.Moves.rebake(atk(id), P).count;
  assert.equal(full.count, noPP + 2 * n, 'Más PP no cuenta para EXTRA_MAX');
});

test('el plan: 1-2 por tramo de 5 min, templo y Kecleon alternos, sin repetir en un tramo, sin F/G', () => {
  for (let s = 1; s <= 300; s++) {
    const plan = E.makePlan(seeded(s)), tr = {};
    for (const x of plan) {
      const k = Math.floor(x.t / E.TRAMO);
      assert.ok(k >= 0 && k < 6, 'tramo ' + k);
      (tr[k] = tr[k] || []).push(x.type);
      assert.ok(!E.TYPES[x.type].off, x.type + ' no sale aún');
      if (x.type === 'machine') assert.ok(k >= 2, 'máquina antes del 3.er tramo');
    }
    for (let k = 0; k < 6; k++) {
      const t = tr[k] || [];
      assert.ok(t.length >= 1 && t.length <= 2, `semilla ${s} tramo ${k}: ${t}`);
      assert.equal(t.includes(k % 2 ? 'shop' : 'temple'), true);
      assert.equal(new Set(t).size, t.length, 'repetido en el tramo');
      if (k === 0) assert.equal(t.length, 1);
    }
    // (Dueño, 26-11-2026) El 1.º de cada tramo, desde el 2.º, después de la grieta (k·5 min ±22,5 s, 45 s abierta, 2 min de arena).
    for (const x of plan) {
      const k = Math.floor(x.t / E.TRAMO);
      if (k >= 1 && x.type === (k % 2 ? 'shop' : 'temple') && x.t - k * E.TRAMO >= E.AFTER_RIFT)
        assert.ok(x.t - k * E.TRAMO > 22.5 + 45 + 120, 'después de la grieta: ' + x.t);
    }
    assert.match(source('js/systems/encounters.js'), /!G\.Rift\.inArena && !G\.Rift\.rift/, 'con la grieta abierta no se coloca ninguno');
    assert.ok(plan.filter(x => x.t >= E.TRAMO && x.t < 2 * E.TRAMO && x.type === 'shop').every(x => x.t >= E.TRAMO + E.AFTER_RIFT), 'el 1.er Kecleon, tras la 1.ª grieta');
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].t >= plan[i - 1].t);
  }
});

test('precios: medios, suben con el minuto, la rareza y la repetición; la máquina por escalón', () => {
  const p = player();
  G.Game.st.time = 0;
  assert.equal(E.price(p, 'heal'), 80); assert.equal(E.price(p, 'vitamin', 0), 200); assert.equal(E.price(p, 'item', 0), 300); assert.equal(E.price(p, 'luck'), 250);
  assert.equal(E.price(p, 'item', 3), 660);
  assert.deepEqual([0, 1, 2].map(E.machinePrice), [400, 800, 1200]);
  G.Game.st.time = 600;
  assert.equal(E.price(p, 'heal'), 120, '+5 %/min');
  p.encBuy = { heal: 1 };
  assert.equal(E.price(p, 'heal'), 150, '+25 % la 2.ª vez');
  G.Game.st.time = 0;
});

test('la bolsa: lo que te llevarías a la cuenta, menos lo gastado; comprar y quedarse corto', () => {
  G.Game.st.time = 600;
  const p = player({ kills: 400, bosses: 1, coins: 50, bonusCoins: 1000, coinMul: 1.5 });
  const want = Math.round((120 + 100 + 80 + 50 + 1000) * 1.5);
  assert.equal(E.purse(p), want);
  const e = { type: 'shop' };
  const offers = E.shopOffers(p, e);
  assert.deepEqual(J(offers.map(o => o.kind).sort()), ['egg', 'heal', 'item', 'luck', 'vitamin']);
  assert.equal(E.shopOffers(p, e), offers, 'la misma visita, lo mismo');
  const it = offers.find(o => o.kind === 'item'), luck = offers.find(o => o.kind === 'luck'), heal = offers.find(o => o.kind === 'heal');
  assert.equal(E.buy(p, heal, () => {}), false, 'con la vida llena no se cura');
  const gifts = [], pr = E.price(p, 'item', it.r);
  bought.length = 0;
  assert.equal(E.buy(p, it, k => gifts.push(k)), true);
  assert.equal(p.spent, pr); assert.equal(E.purse(p), want - pr); assert.equal(it.sold, true);
  assert.equal(gifts.length, 1); assert.equal(G.Items.parse(gifts[0]).id, it.id);
  assert.equal(bought[0][0], 'item');
  assert.equal(E.buy(p, it, () => {}), false, 'vendido');
  // Suerte: dos por tienda.
  p.bonusCoins = 5000;
  assert.equal(E.buy(p, luck, () => {}), true); assert.equal(E.buy(p, luck, () => {}), true);
  assert.equal(luck.sold, true); assert.ok(Math.abs(G.Fortune.of(p) - 2 * E.LUCK.shop) < 1e-9);
  // Sin dinero, nada.
  const poor = player();
  assert.equal(E.buy(poor, { kind: 'item', id: it.id, r: 0 }, () => {}), false);
  assert.equal(poor.spent, undefined);
  G.Game.st.time = 0;
});

test('Kecleon: huevos y maldición sólo como hueco (bloques G y F)', () => {
  assert.deepEqual(J(E.CATALOG.filter(c => c.off).map(c => c.kind).sort()), ['curse']);
  assert.ok(E.TYPES.curse.off && !E.TYPES.egg.off);
  assert.ok(!E.shopOffers(player({ bonusCoins: 9999 }), { type: 'shop' }).some(o => o.kind === 'curse'));
});

test('Smeargle: sólo ataques sueltos, nunca el último; el activo sigue siendo el mismo', () => {
  const a = atk(countMove()), b = { id: 'b', kind: 'aura' }, c = { id: 'c', kind: 'aura' }, d = { id: 'd', kind: 'aura' };
  const p = player({ slots: [[b, c], [a], [d]], active: 2 });
  p.moves = p.slots.flat();
  assert.deepEqual(E.forgettable(p), [a, d], 'los fusionados no');
  assert.equal(E.forget(p, b), false);
  assert.equal(E.forget(p, a), true);
  assert.deepEqual(p.moves.map(m => m.id), ['b', 'c', 'd']);
  assert.equal(p.slots[p.active], p.slots.find(s => s[0] === d), 'sigue con d');
  const one = player({ slots: [[a]], active: 0 }); one.moves = [a];
  assert.equal(E.forgettable(one).length, 0);
  assert.equal(E.forget(one, a), false);
});

test('Porygon: sube un escalón la rareza y cobra; legendario, no', () => {
  G.Game.st.time = 0;
  const p = player({ bonusCoins: 5000, items: [{ id: G.Items.LIST[0].id, r: 0, evo: true }] });
  const it = p.items[0], before = E.purse(p);
  assert.equal(E.upgradeItem(p, it), true);
  assert.equal(it.r, 1); assert.equal(it.evo, true, 'conserva su evolución');
  assert.equal(before - E.purse(p), 400);
  it.r = 3;
  assert.equal(E.upgradeItem(p, it), false);
  const poor = player({ items: [{ id: G.Items.LIST[0].id, r: 0 }] });
  assert.equal(E.upgradeItem(poor, poor.items[0]), false);
  assert.equal(poor.items[0].r, 0);
});

test('suerte: templo 5 %, Kecleon 10 % (×2), reto 15 % (lo decidió el dueño, «media»)', () => {
  assert.deepEqual({ ...E.LUCK }, { temple: 0.05, shop: 0.10, challenge: 0.15 });
  assert.equal(E.LUCK_PER_SHOP, 2);
});

test('pantalla y mando: plantilla Elección, B se va, cartas con el contrato del bot', () => {
  const html = source('dev.html'), ui = source('js/ui/encounter-ui.js'), pad = source('js/ui/pad-ui.js');
  const sec = /<section id="scr-encounter"[\s\S]*?<\/section>/.exec(html)[0];
  assert.match(sec, /class="scr dim fs-scr hidden"/);
  assert.match(sec, /id="enc-cards" class="cards pick-cards" data-nav-row/);
  assert.match(sec, /id="enc-leave"[^>]*data-close[^>]*data-back/);
  assert.match(html, /js\/systems\/encounters\.js/); assert.match(html, /js\/ui\/encounter-ui\.js/);
  assert.match(pad, /'scr-encounter': \{[^}]*back: 'Irse'/);
  for (const k of ['kind', 'id', 'r', 'price']) assert.match(ui, new RegExp('el\\.dataset\\.' + k + ' ='), 'data-' + k);
  assert.match(ui, /classList\.add\('enc-off'\)/);
  const curve = source('tools/curve.cjs');
  assert.match(curve, /kinds\.has\('rarity'\)/, 'el bot usa la máquina');
  assert.match(curve, /pick-card:not\(\.enc-off\)/, 'el bot no pulsa lo que no puede');
  assert.match(curve, /G\.Encounters\.purse\(pl\)/, 'el bot gasta su bolsa');
  for (const f of ['assets/pxl/temple.png', 'assets/pxl/shrine.png']) assert.ok(fs.existsSync(path.join(root, f)), f);
  for (const t of Object.values(E.TYPES)) if (t.art) assert.ok(fs.existsSync(path.join(root, 'assets/pxl', t.art + '.png')), t.art);
});

test('textos en inglés: todos los nuevos', () => {
  const en = {};
  vm.runInContext(source('js/data/lang-en.js'), vm.createContext({ G: { I18n: { add: o => Object.assign(en, o) } } }));
  const keys = new Set();
  for (const f of ['js/systems/encounters.js', 'js/ui/encounter-ui.js']) {
    const s = source(f);
    for (const m of s.matchAll(/(?:G\.T|G\.I18n\.f|fmt)\('([^']+)'/g)) keys.add(m[1]);
    for (const m of s.matchAll(/G\.T\(ok \? '([^']+)' : '([^']+)'\)/g)) { keys.add(m[1]); keys.add(m[2]); }
    for (const m of s.matchAll(/(?:title|leave|act): '([^']+)'/g)) keys.add(m[1]);
  }
  for (const t of Object.values(E.TYPES)) { if (t.act) keys.add(t.act); if (!t.dex) keys.add(t.name); }
  for (const id in V.NAME) if (V.NAME[id] !== 'Zinc') keys.add(V.NAME[id]);
  keys.add('Gastado en la partida');
  const miss = [...keys].filter(k => !/^(Kecleon|Smeargle|Porygon|Chansey)$/.test(k) && en[k] === undefined);
  assert.deepEqual(miss, []);
});
