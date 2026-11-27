// La maldición (1.0, bloque F, 27-11-2026, lo decidió el dueño): systems/curse.js (G.Curse), su santuario y su venta en
// Kecleon (systems/encounters.js, ui/encounter-ui.js), aparte del director (director.js, spawner.js) y el desempate del
// ranking por derrotados (net/ranking.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 1e-9, `${m} ${a} ≠ ${b}`);

function load(coop = { active: false, isHost: false }) {
  const sent = [], toHost = [], reg = [], said = [];
  const G = {
    U: { pick: a => a[0], clamp: (v, a, b) => Math.max(a, Math.min(b, v)), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2, rand: (a, b) => (a + b) / 2 },
    I18n: { f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } }, T: s => s,
    Game: { st: { time: 0 }, player: null, everyone: () => [] },
    Coop: Object.assign({ broadcast: ev => sent.push(ev), toHost: ev => toHost.push(ev) }, coop), Rift: {}, Judgment: null,
    Reg: { v1: { buy() {}, vitamin() {}, encounter() {}, fortune() {}, curse: (l, ok) => reg.push([l, ok]) } },
    Audio: { sfx() {} }, FX: { ring() {}, burst() {}, px() {} }, Spawner: { say: t => said.push(t) },
    Projectiles: { clearOrbs() {} }, Sprites: { preload() {} }
  };
  const c = { G, Math, console, window: {} };
  c.window.G = G;
  vm.createContext(c);
  for (const f of ['js/data/items.js', 'js/entities/player.js', 'js/data/power-budget.js', 'js/systems/fortune.js', 'js/data/moves.js',
                   'js/systems/encounters.js', 'js/systems/curse.js'])
    vm.runInContext(source(f), c, { filename: f });
  return { G, sent, toHost, reg, said };
}

function player(G, o = {}) {
  const p = Object.create(G.Player.prototype);
  Object.assign(p, { x: 0, y: 0, bodyH: 30, maxHp: 100, hp: 100, kills: 0, bosses: 0, coins: 0, bonusCoins: 0, coinMul: 1, xpMul: 1,
                     items: [], pass: {}, fortune: 0, slots: [], moves: [], active: 0 }, o);
  return p;
}

test('niveles: 5 como mucho; por nivel +8 % de vida, +6 % de daño y +10 % de aparición (dueño, «suaves»)', () => {
  const { G } = load();
  const C = G.Curse;
  G.Game.player = player(G);
  assert.equal(C.MAX, 5);
  assert.deepEqual(J(C.STEP), { hp: 0.08, dmg: 0.06, rate: 0.1 });
  assert.equal(C.level, 0); near(C.hp(), 1); near(C.dmg(), 1); near(C.rate(), 1);
  for (let i = 0; i < 7; i++) C.accept(null);
  assert.equal(C.level, 5, 'no pasa del tope');
  near(C.hp(), 1.4, 'vida'); near(C.dmg(), 1.3, 'daño'); near(C.rate(), 1.5, 'aparición');
  assert.equal(C.accept(null), false, 'al tope no se acepta');
  C.reset();
  assert.equal(C.level, 0);
});

test('premios: +9 % de experiencia y +12 % de monedas por nivel (al tope +45 % y +60 %) y +6 % de suerte al aceptar', () => {
  const { G, reg } = load();
  const C = G.Curse, pl = player(G, { xpMul: 1.2, coinMul: 1.1 });
  G.Game.player = pl;
  C.accept(null);
  near(pl.xpMul, 1.2 * 1.09); near(pl.coinMul, 1.1 * 1.12); near(G.Fortune.of(pl), 0.06); assert.equal(pl.curse, 1);
  for (let i = 0; i < 4; i++) C.accept(null);
  near(pl.xpMul, 1.2 * 1.45, 'experiencia al tope'); near(pl.coinMul, 1.1 * 1.6, 'monedas al tope'); near(G.Fortune.of(pl), 0.3, 'suerte');
  assert.equal(pl.curse, 5);
  assert.deepEqual(reg, [[1, true], [2, true], [3, true], [4, true], [5, true]], 'registro');
  // Las monedas de Kecleon y del final también suben (coinMul): purse las usa.
  pl.bonusCoins = 100;
  assert.equal(G.Encounters.purse(pl), Math.round(100 * 1.1 * 1.6));
});

test('santuario: uno por tramo desde el 2.º, se pulsa («Tocar»), aceptar o no lo apaga, y al tope se apagan todos', () => {
  const { G, reg } = load();
  const E = G.Encounters, C = G.Curse;
  assert.ok(!E.TYPES.curse.off && E.TYPES.curse.act === 'Tocar' && E.TYPES.curse.art === 'curse');
  for (let s = 1; s <= 50; s++) {
    let x = s; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const plan = E.makePlan(rnd);
    for (let k = 0; k < 6; k++) assert.equal(plan.filter(p => p.type === 'curse' && Math.floor(p.t / E.TRAMO) === k).length, k ? 1 : 0, `semilla ${s} tramo ${k}`);
  }
  const pl = player(G); G.Game.player = pl;
  const e = { type: 'curse', used: false, done: false };
  assert.equal(E.pressable(e), true);
  C.decline(e);
  assert.equal(e.used, true, 'decir que no lo apaga');
  assert.deepEqual(reg.at(-1), [1, false]);
  const e2 = { type: 'curse', used: false, done: false };
  C.accept(e2);
  assert.ok(e2.used && C.level === 1);
  // Al tope: los que queden se apagan (update).
  assert.match(source('js/systems/encounters.js'), /e\.type === 'curse' && !e\.used && G\.Curse\.level >= G\.Curse\.MAX\) e\.used = true/);
});

test('Kecleon la vende: 250 (+5 %/min, +25 % cada vez), una por visita, y no al tope', () => {
  const { G } = load();
  const E = G.Encounters, C = G.Curse, pl = player(G, { bonusCoins: 5000 });
  G.Game.player = pl;
  G.Game.st.time = 0;
  assert.equal(E.price(pl, 'curse'), 250);
  const shop = { type: 'shop' }, o = E.shopOffers(pl, shop).find(x => x.kind === 'curse');
  assert.ok(o, 'la ofrece');
  assert.equal(E.buy(pl, o, () => {}), true);
  assert.equal(C.level, 1); assert.equal(o.sold, true); assert.equal(pl.spent, 250);
  assert.equal(E.buy(pl, o, () => {}), false, 'una por visita');
  G.Game.st.time = 600;
  assert.equal(E.price(pl, 'curse'), Math.round(250 * 1.5 * 1.25 / 5) * 5, '+5 %/min y +25 % la 2.ª');
  C.debugSet(5);
  assert.equal(E.canBuy(pl, { kind: 'curse', id: 'curse', r: 0 }), false, 'al tope no');
  G.Game.st.time = 0;
});

test('cooperativo: del grupo; el invitado la pide al anfitrión y el anfitrión dice el nivel a todos', () => {
  // Invitado: no la sube él, la pide.
  const g = load({ active: true, isHost: false });
  g.G.Game.player = player(g.G);
  const e = { id: 7, type: 'curse', used: false };
  g.G.Curse.accept(e);
  assert.equal(g.G.Curse.level, 0);
  assert.deepEqual(J(g.toHost), [['enc', 'k', 7]]);
  // Anfitrión: la sube y avisa.
  const h = load({ active: true, isHost: true });
  h.G.Game.player = player(h.G);
  h.G.Encounters.onNet(['enc', 'k', 0]);
  assert.equal(h.G.Curse.level, 1);
  assert.deepEqual(J(h.sent.at(-1)), ['enc', 'ku', 1, 0]);
  // El invitado recibe el nivel: sus premios, los suyos.
  g.G.Encounters.onNet(['enc', 'ku', 2, 7]);
  assert.equal(g.G.Curse.level, 2);
  assert.equal(g.G.Game.player.curse, 2);
  assert.ok(Math.abs(g.G.Game.player.xpMul - 1.18) < 1e-9);
  // Un nivel fuera de rango no rompe nada.
  g.G.Encounters.onNet(['enc', 'ku', 99, 0]);
  assert.equal(g.G.Curse.level, 5);
  assert.match(source('js/net/coop.js'), /ev\[1\] === 'c' \|\| ev\[1\] === 'k'/, 'el anfitrión acepta la petición de un invitado');
});

test('aparte del director: el director mide sin la maldición (curseK) y el spawner la aplica encima', () => {
  const G = { U: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) } };
  vm.runInContext(source('js/systems/director.js'), vm.createContext({ G, Math }), { filename: 'director.js' });
  const D = G.Director;
  const run = curseK => {
    D.reset();
    const pl = { hp: 100, maxHp: 100, dead: false };
    let t = 600;
    for (let s = 0; s < 120; s++) {
      for (let k = 0; k < 4; k++) {
        const e = { maxHp: 100 * curseK, curseK: curseK === 1 ? undefined : curseK };
        D.update(0, [pl], t - 0.3 * curseK); D.hit(e, 100 * curseK); D.update(0, [pl], t); D.kill(e);
      }
      for (let f = 0; f < 10; f++) { t += 0.1; D.update(0.1, [pl], t); }
    }
    return D.hp();
  };
  const base = run(1);
  assert.ok(base > 1.2, 'el director sube la vida: ' + base);
  near(run(1.4), base, 'con la maldición el director pide la misma vida que sin ella');
  const sp = source('js/systems/spawner.js');
  assert.match(sp, /CK = G\.Curse \? G\.Curse\.hp\(\) : 1/);
  assert.match(sp, /e\.curseK = CK/);
  assert.equal((sp.match(/G\.Curse \? G\.Curse\.dmg\(\) : 1/g) || []).length, 2, 'daño de normales y jefes');
  assert.match(sp, /G\.Curse \? G\.Curse\.rate\(\) : 1/, 'aparición (con el mismo tope)');
});

test('ranking: con el mismo tiempo va delante quien ha derrotado más (sin dato nuevo ni reglas nuevas)', () => {
  const src = source('js/net/ranking.js');
  const order = eval(src.match(/const order = (\(a, b\) => [^;]+);/)[1]);
  const beats = eval(src.match(/const beats = (\(a, b\) => [^;]+);/)[1]);
  const rows = [{ t: 900, kills: 10 }, { t: 1800, kills: 2000 }, { t: 1800, kills: 3500 }, { t: 900, kills: 50 }].sort(order);
  assert.deepEqual(rows.map(r => r.kills), [3500, 2000, 50, 10]);
  assert.ok(beats({ t: 1800, kills: 3001 }, { t: 1800, kills: 3000 }));
  assert.ok(!beats({ t: 1800, kills: 3000 }, { t: 1800, kills: 3000 }));
  assert.ok(!beats({ t: 1799, kills: 9000 }, { t: 1800, kills: 0 }));
  assert.match(src, /if \(!beats\(entry, low\)\)/);
  // Las reglas no se tocan: ya dejan sacar del top una marca con el mismo tiempo.
  assert.match(source('firestore.rules'), /old\[d\.ev\]\.t <= e\.t/);
});

test('pantalla, pausa, HUD, icono, arte e inglés', () => {
  const ui = source('js/ui/encounter-ui.js');
  assert.match(ui, /curse: \{ ico: 'curse', title: 'Santuario maldito', leave: 'No aceptar' \}/);
  assert.match(ui, /kind: 'curse', id: 'curse'/);
  assert.match(ui, /G\.Curse\.decline\(e\)/);
  assert.match(source('js/ui/run-ui.js'), /\['curse', 'Maldición'/);
  assert.match(source('js/ui/hud.js'), /G\.Icons\.draw\(ctx, 'curse'/);
  assert.match(source('js/ui/icons.js'), /curse: 'spell-tag'/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets/items/spell-tag.png')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets/pxl/curse.png')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'tools/pxl/maldicion.px.js')), 'arte hecho con pxl');
  const h = source('dev.html');
  assert.ok(h.indexOf('js/systems/curse.js') > h.indexOf('js/systems/encounters.js'));
  const en = source('js/data/lang-en.js');
  const keys = new Set();
  for (const f of ['js/systems/curse.js', 'js/ui/encounter-ui.js', 'js/ui/run-ui.js'])
    for (const m of source(f).matchAll(/G\.(?:T|I18n\.f)\('([^']+)'/g)) keys.add(m[1]);
  for (const k of ['Maldición', 'Tocar', 'No aceptar', 'Santuario maldito']) keys.add(k);
  const miss = [...keys].filter(k => /maldici|Maldici|Tocar|No aceptar|Nv\. \{x\} \/|enemigos \+|% suerte, |vida de los enemigos/.test(k) && !en.includes(`'${k}'`));
  assert.deepEqual(miss, []);
});
