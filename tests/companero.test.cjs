// Huevo y compañero (1.0, bloque G, 27-11-2026, lo decidió el dueño): systems/companion.js (G.Companion), el huevo de
// Chansey y de Kecleon (systems/encounters.js, ui/encounter-ui.js), su trozo del daño (data/power-budget.js), la red
// (net/coop.js) y los textos en inglés. node --test tests/companero.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');
const J = o => JSON.parse(JSON.stringify(o));
const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const noop = () => {};

function boot() {
  const said = [], reg = [];
  const ctx = { G: {}, console, Math, setTimeout, clearTimeout, performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { search: '', hostname: '', protocol: 'file:', href: '' },
    navigator: { language: 'es' }, document: { addEventListener() {} }, addEventListener() {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/data/evolutions.js', 'js/data/types.js', 'js/data/moves.js',
    'js/systems/mons.js', 'js/data/items.js', 'js/data/power-budget.js', 'js/systems/fortune.js'])
    vm.runInContext(source(f), ctx, { filename: f });
  const G = ctx.G;
  class Animator { constructor(dex) { this.dex = dex; this.dir = 0; this.cur = 'Idle'; } update() {} loop(a) { this.cur = a; } play(a) { this.cur = a; } busy() { return false; } draw() {} }
  const FX = new Proxy({}, { get: () => noop });
  Object.assign(G, {
    T: s => s, I18n: { f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } },
    Game: { st: { time: 0 }, player: null, everyone: () => [] }, Coop: { active: false, isHost: false }, Rift: {}, Judgment: null,
    Reg: { v1: { companion: (...a) => reg.push(a), compHit() {}, buy() {}, vitamin() {}, encounter() {} } },
    Audio: { sfx() {} }, FX, Spawner: { say: t => said.push(t) }, Camera: { sees: () => true }, LIFT: 18,
    Sprites: { Animator, preload() {}, bodyRadius: () => 12, bodyHeight: () => 30, dirFromAngle: () => 0, can: () => true, drawShadow() {} },
    World: { isFree: () => true, collide() {} }, Weather: { mult: () => 1 }, Stats: { taken: () => 1 }, VFX: { forMove: () => ({}) },
    Projectiles: { clearOrbs() {}, spawn: p => G._shots.push(p),
      nearest: (list, x, y, r) => { let b = null, bd = r * r; for (const e of list) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (!e.dead && d < bd) { bd = d; b = e; } } return b; } },
    EnemyMgr: { all: () => G._enemies, queryCircle: (x, y, r) => G._enemies.filter(e => (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.r) ** 2) },
    _enemies: [], _shots: []
  });
  for (const f of ['js/entities/player.js', 'js/systems/companion.js', 'js/systems/encounters.js']) vm.runInContext(source(f), ctx, { filename: f });
  return { G, said, reg };
}
const { G, said, reg } = boot();
const C = G.Companion;

function player(o = {}) {
  const p = Object.create(G.Player.prototype);
  Object.assign(p, { x: 0, y: 0, r: 14, bodyH: 30, maxHp: 200, hp: 200, dmgDealt: 0, kills: 0, bosses: 0, coins: 0, bonusCoins: 0, coinMul: 1,
    items: [], pass: {}, fortune: 0, moveAngle: 0, slots: [[]], moves: [], active: 0 }, o);
  Object.defineProperty(p, 'spd', { value: 110 });
  return p;
}
/** Anda en línea recta s segundos a v unidades/s (pasos de 1/30 s). */
function walk(pl, s, v = 110, dt = 1 / 30) { for (let t = 0; t < s; t += dt) { pl.x += v * dt; C.update(dt, pl); } }

test('presupuesto de poder: el compañero lee su trozo (10-15 %) y verify no se queja', () => {
  assert.deepEqual(J(C.SHARE), [0.10, 0.15]);
  assert.equal(C.SHARE, G.PowerBudget.COMPANION.SHARE, 'el mismo número, no una copia');
  assert.deepEqual(J(G.PowerBudget.verify(G)), []);
  const c = { r: 0, stage: 0, maxStage: 2 };
  assert.equal(C.share(c), 0.10);
  c.stage = 1; assert.ok(Math.abs(C.share(c) - 0.125) < 1e-9);
  c.stage = 2; assert.equal(C.share(c), 0.15);
  for (let r = 0; r < 4; r++) for (let s = 0; s <= 2; s++) { const v = C.share({ r, stage: s, maxStage: 2 }); assert.ok(v >= 0.1 - 1e-9 && v <= 0.15 + 1e-9, r + '/' + s); }
});

test('qué sale: primeras fases no legendarias que evolucionan, por rareza; la suerte da líneas más fuertes', () => {
  const P = C.pool();
  assert.equal(P.length, 4);
  for (let r = 0; r < 4; r++) assert.ok(P[r].length >= 5, 'rareza ' + r + ': ' + P[r].length);
  for (const d of P.flat()) {
    const m = G.DEX_BY[d];
    assert.ok(m && !m.leg, d + ' no legendario');
    assert.equal(G.Evo.rule(d), null, d + ' es primera fase');
    assert.ok(G.Evo.kids(d).length > 0, d + ' evoluciona');
  }
  for (const d of [4, 1, 7]) assert.ok(P.flat().includes(d), 'los iniciales: ' + d);
  assert.ok(P[3].includes(443) || P[3].includes(147), 'Gible o Dratini entre los legendarios (líneas de 600)');
  const avg = luck => { const rnd = seeded(5); let s = 0; for (let i = 0; i < 400; i++) s += C.rollEgg(player({ fortune: luck }), rnd).r; return s / 400; };
  assert.ok(avg(1) > avg(0) + 0.3, 'con suerte, más rareza');
});

test('un ataque por tipo principal y lado: 18 × 2 de los que ya existen', () => {
  const types = Object.keys(G.U.TYPE_COLOR);
  assert.equal(Object.keys(C.MOVE).length, 18);
  for (const t in C.MOVE) {
    assert.ok(types.includes(t), t);
    const [ph, sp] = C.MOVE[t].map(id => G.Moves.get(id));
    assert.ok(ph && sp, t);
    assert.equal(ph.type, t); assert.equal(sp.type, t);
    assert.equal(ph.cat, 'physical', ph.id); assert.equal(sp.cat, 'special', sp.id);
  }
  // Charmander (fuego, especial) → Ascuas; Machop (lucha, físico) → Golpe Kárate.
  assert.equal(C.sideOf(4), G.DEX_BY[4].sa > G.DEX_BY[4].pa ? 'special' : 'physical');
  assert.equal(C.moveOf(66), 'karate-chop');
});

test('el huevo eclosiona al andar (unos 3 min); quieto o con un salto no avanza', () => {
  const pl = player(); G.Game.player = pl;
  C.give(pl, { dex: 4, r: 0 });
  assert.equal(pl.companion.egg, true);
  assert.equal(pl.moves.length, 0, 'no es uno de tus ataques');
  for (let i = 0; i < 300; i++) C.update(1 / 30, pl);
  assert.equal(pl.companion.walked, 0, 'quieto no avanza');
  pl.x += 5000; C.update(1 / 30, pl);
  assert.equal(pl.companion.walked, 0, 'la grieta te lleva lejos: no cuenta');
  walk(pl, 170);
  assert.equal(pl.companion.egg, true, 'a los 170 s aún no');
  assert.ok(said.includes('¡El huevo se mueve!'));
  walk(pl, 12);
  assert.equal(pl.companion.egg, false, 'a los ~3 min, sí');
  assert.equal(pl.companion.dex, 4);
  assert.deepEqual(reg.find(r => r[0] === 'hatch'), ['hatch', 4]);
  assert.ok(Math.abs(C.HATCH_D / 110 - 180) < 1);
});

test('evoluciona por tiempo con él: a los 4 min y 5 min después; sus ataques siguen fuera de los tuyos', () => {
  const pl = player(); G.Game.player = pl;
  C.give(pl, { dex: 4, r: 0 }); C.debugHatch(pl);
  const c = pl.companion;
  assert.equal(c.maxStage, 2);
  for (let t = 0; t < 239; t += 0.5) C.update(0.5, pl);
  assert.equal(c.dex, 4);
  C.update(1, pl);
  assert.equal(c.dex, 5, 'Charmeleon a los 4 min'); assert.equal(c.evolved, true);
  for (let t = 0; t < 300; t += 0.5) C.update(0.5, pl);
  assert.equal(c.dex, 6, 'Charizard 5 min después');
  assert.equal(c.stage, 2);
  assert.deepEqual(J(pl.slots), [[]], 'ni en tus huecos (tope de 4, Sobrefusión)');
});

test('si cae, se levanta a los 20 s', () => {
  const pl = player(); G.Game.player = pl;
  C.give(pl, { dex: 66, r: 0 }); C.debugHatch(pl);
  const c = pl.companion;
  G._enemies = [{ x: c.x, y: c.y, r: 12, dmg: 400, types: ['normal'], hurt() {} }];
  for (let t = 0; t < 2.5 && !c.dead; t += 0.1) C.update(0.1, pl);
  assert.equal(c.dead, true, 'como mucho un cuarto de su vida por golpe: cae en el 4.º');
  G._enemies = [];
  for (let t = 0; t < 19.5; t += 0.5) C.update(0.5, pl);
  assert.equal(c.dead, true, 'a los 19,5 s sigue caído');
  C.update(0.6, pl);
  assert.equal(c.dead, false); assert.equal(c.hp, c.maxHp);
});

/** Partida simulada: tú haces `rate` de daño por segundo; el compañero pega a un enemigo que tiene al lado. */
function sim({ dex, r = 0, rate = 1000, secs = 600, mult = 1, evolve = 0 }) {
  const pl = player(); G.Game.player = pl;
  C.give(pl, { dex, r }); C.debugHatch(pl);
  const c = pl.companion;
  for (let i = 0; i < evolve; i++) C.debugEvolve(pl);
  const types = mult >= 2 ? (G.DEX_BY[c.dex].types[0] === 'fire' ? ['grass'] : ['normal']) : ['normal'];
  const foe = { x: 30, y: 0, r: 12, dmg: 0, types, taken: 0, hurt(d) { this.taken += d; } };
  G._enemies = [foe];
  let worst = 0;
  const dt = 1 / 30, hist = [];
  for (let t = 0; t < secs; t += dt) {
    pl.dmgDealt += rate * dt;
    foe.x = c.x + 30; foe.y = c.y;
    C.update(dt, pl);
    for (const p of G._shots.splice(0)) p.onHit && p.onHit(p, foe);
    hist.push([pl.dmgDealt - pl.compDealt, c.dealt]);
    if (hist.length > 30 * 20) {
      const [o0, c0] = hist[hist.length - 1 - 30 * 20], [o1, c1] = hist[hist.length - 1];
      worst = Math.max(worst, (c1 - c0) / ((c1 - c0) + (o1 - o0)));
    }
  }
  G._enemies = [];
  return { share: c.dealt / pl.dmgDealt, worst, c, pl };
}

test('su trozo del daño: cerca del objetivo y NUNCA más del 15 % (ni con tipos a favor ni evolucionado)', () => {
  const a = sim({ dex: 4 });
  assert.ok(a.share > 0.07 && a.share <= 0.15 + 1e-6, 'Charmander ' + a.share);
  const b = sim({ dex: 66, mult: 2 });
  assert.ok(b.share <= 0.15 + 1e-6, 'Machop ' + b.share);
  const z = sim({ dex: 4, mult: 2, evolve: 2, r: 3 });
  if (process.env.VER) console.log('trozo', a.share, b.share, z.share, z.worst);
  assert.ok(z.share > 0.12 && z.share <= 0.15 + 1e-6, 'Charizard, tipos a favor ' + z.share);
  assert.ok(z.worst <= 0.15 + 0.02, 'en ninguna ventana de 20 s (casillas de 1 s) ' + z.worst);
  // Lo que hace suma a tu daño (es del equipo) y aparte en el suyo.
  assert.ok(Math.abs(z.pl.compDealt - z.c.dealt) < 1e-6);
  // Sin que tú pegues, él tampoco.
  const n = sim({ dex: 4, rate: 0, secs: 60 });
  assert.equal(n.c.dealt, 0);
});

test('si pega menos de lo previsto (enemigos duros, fallos), se corrige hasta su trozo, sin pasar del 15 %', () => {
  const taken = G.Stats.taken;
  G.Stats.taken = () => 0.4;                 // cada golpe hace el 40 % de lo previsto
  try {
    const a = sim({ dex: 4 });
    if (process.env.VER) console.log('duros', a.share, a.c.gain);
    assert.ok(a.c.gain > 2, 'la corrección sube: ' + a.c.gain);
    assert.ok(a.share > 0.085 && a.share <= 0.15 + 1e-6, 'cerca del 10 %: ' + a.share);
    const z = sim({ dex: 4, evolve: 2, r: 3 });
    assert.ok(z.share <= 0.15 + 1e-6 && z.worst <= 0.15 + 0.02, 'nunca más del 15 %: ' + z.share + ' / ' + z.worst);
  } finally { G.Stats.taken = taken; }
});

test('cooperativo: su estado viaja en el tuyo y lo de otro se comprueba', () => {
  const pl = player(); G.Game.player = pl;
  assert.equal(C.netState(pl), 0);
  C.give(pl, { dex: 4, r: 0 });
  assert.deepEqual(J(C.readNet(C.netState(pl))).fl, 4, 'huevo');
  C.debugHatch(pl);
  const s = C.readNet(C.netState(pl));
  assert.equal(s.dex, 4); assert.equal(s.fl & 4, 0);
  assert.equal(C.readNet([99999, 0, 0]), null, 'un Pokémon que no existe');
  assert.equal(C.readNet('x'), null);
  assert.equal(C.readNet([4, 1e12, NaN, 99, 99, -5, 50]).x, 1e6, 'números con tope');
  const coop = source('js/net/coop.js');
  assert.match(coop, /G\.Companion\.netState\(local\)/);
  assert.match(coop, /cp: G\.Companion \? G\.Companion\.readNet\(a\[19\]\)/);
});

test('Chansey: una vez por partida, en el 2.º tramo, después de la grieta; Kecleon vende huevos', () => {
  const E = G.Encounters;
  assert.ok(!E.TYPES.egg.off); assert.equal(E.TYPES.egg.dex, 113); assert.equal(E.TYPES.egg.act, 'Hablar');
  for (let s = 1; s <= 200; s++) {
    const eggs = E.makePlan(seeded(s)).filter(x => x.type === 'egg');
    assert.equal(eggs.length, 1);
    assert.equal(Math.floor(eggs[0].t / E.TRAMO), 1);
    assert.ok(eggs[0].t - E.TRAMO > E.AFTER_RIFT, 'después de la grieta');
  }
  const pl = player({ bonusCoins: 9999 }); G.Game.player = pl;
  const o = E.shopOffers(pl, { type: 'shop' }).find(x => x.kind === 'egg');
  assert.ok(o && G.DEX_BY[o.id]);
  assert.equal(E.price(pl, 'egg', 0), 250);
  assert.equal(E.price(pl, 'egg', 3), Math.round(250 * 2.2 / 5) * 5);
  assert.equal(E.buy(pl, o, noop), true);
  assert.equal(pl.companion.dex, o.id); assert.equal(pl.companion.egg, true);
  assert.equal(E.buy(pl, o, noop), false, 'uno por tienda');
});

test('pantalla, bot, carga y textos en inglés', () => {
  const ui = source('js/ui/encounter-ui.js'), html = source('dev.html');
  assert.match(ui, /kind: 'egg', id: o\.egg\.dex/, 'Chansey: carta data-kind egg con el Pokémon (contrato del bot)');
  assert.match(ui, /'Quedarme con el mío'/);
  assert.ok(html.indexOf('js/systems/companion.js') > html.indexOf('js/systems/encounters.js'));
  assert.ok(html.indexOf('js/systems/companion.js') < html.indexOf('js/game.js'));
  assert.ok(fs.existsSync(path.join(root, 'assets/items/mystery-egg.png')));
  const game = source('js/game.js');
  assert.match(game, /G\.Companion\.update\(dt, pl\)/); assert.match(game, /G\.Companion\.reset\(\)/);
  assert.equal((game.match(/G\.Companion\.drawables\(pl\)/g) || []).length, 2);
  const en = {};
  vm.runInContext(source('js/data/lang-en.js'), vm.createContext({ G: { I18n: { add: o => Object.assign(en, o) } } }));
  const keys = new Set();
  for (const f of ['js/systems/companion.js', 'js/ui/encounter-ui.js'])
    for (const m of source(f).matchAll(/(?:G\.T|G\.I18n\.f)\('([^']+)'/g)) keys.add(m[1]);
  assert.deepEqual([...keys].filter(k => en[k] === undefined), []);
});
