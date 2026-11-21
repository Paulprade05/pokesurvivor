// Objetos de partida con rareza, segundo hueco y evolución (21-11-2026, «objetos-rareza», lo pidió el dueño).
// data/items.js, entities/player.js (equipAt, itemSlots, ganchos) y lo que se ve (HUD, cartas, compendio, textos).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function load() {
  const said = [];
  const G = {
    U: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), pick: a => a[Math.floor(Math.random() * a.length)] },
    Game: { st: { time: 0 }, giveXp() {} },
    FX: { ring() {}, burst() {}, dmgText() {} },
    Spawner: { say: t => said.push(t) },
    Audio: { sfx() {} }, Reg: { ev() {}, heal() {} },
    I18n: { lang: 'es', f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } },
    EnemyMgr: { queryCircle: () => [] },
    Types: { mult: () => 1 },
    T: s => s
  };
  const ctx = vm.createContext({ G, Math, console });
  vm.runInContext(source('js/data/items.js'), ctx, { filename: 'items.js' });
  vm.runInContext(source('js/entities/player.js'), ctx, { filename: 'player.js' });
  return { G, said };
}
const { G, said } = load();
const I = G.Items, Player = G.Player;
const mv = id => ({ id, type: 'fire', kind: 'projectile', t: 3 });

/** Un jugador mínimo (sin sprites), con lo que tocan los objetos. */
function pl(groups = [['a']]) {
  const p = Object.create(Player.prototype);
  Object.assign(p, {
    atkMul: 1, spdMul: 1, cdMul: 1, xpMul: 1, coinMul: 1, magnet: 78, dmgReduce: 0, critChance: 0, critDmg: 0,
    maxHp: 200, hp: 200, regenFlat: 0, regenK: 0, healed: 0, items: [], level: 10, x: 0, y: 0, r: 12, bodyH: 30,
    baseAtk: 10, mon: { types: ['fire'], hp: 200 }, buffs: { atk: { n: 0, t: 0, amount: 0 }, spd: { n: 0, t: 0, amount: 0 } },
    slots: groups.map(g => g.map(mv)), active: 0, invuln: 0, graceT: 0
  });
  p.moves = p.slots.flat();
  return p;
}
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('objetos: 26, distintos, con nombre, evolución, icono y textos en inglés', () => {
  assert.equal(I.LIST.length, 26);
  assert.equal(new Set(I.LIST.map(i => i.id)).size, 26);
  const icons = source('js/ui/icons.js'), en = source('js/data/lang-en.js');
  const has = s => en.includes("'" + s + "':") || en.includes('"' + s + '":');
  for (const it of I.LIST) {
    assert.ok(it.name && it.evo && it.evo !== it.name, it.id);
    assert.ok(new RegExp('\\b' + it.id + ": '").test(icons), 'icono de ' + it.id);
    const file = new RegExp('\\b' + it.id + ": '([^']+)'").exec(icons)[1];
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'items', file + '.png')), 'png de ' + it.id);
    assert.ok(has(it.name) && has(it.evo), 'nombres en inglés de ' + it.id);
    // Cada frase (plantilla con {x}) tiene su traducción.
    for (const t of [...(it.xt || []), ...(it.pt || [])]) assert.ok(has(typeof t === 'string' ? t : t[0]), it.id + ': ' + t);
    for (let r = 0; r < 4; r++) {
      assert.ok(I.lines(it.id, r).length >= 1, it.id + ' ' + r);
      assert.ok(I.lines(it.id, r, true).length > I.lines(it.id, r).length - (it.id === 'choiceband' || it.id === 'lifeorb' ? 1 : 0), 'el evolucionado gana su pasiva: ' + it.id);
    }
  }
  for (const r of I.RAR) assert.ok(has(r.name) || r.name === 'Común', r.name);
});

test('rarezas: más rara, más fuerte; el extra sale desde épico; legendario poco frecuente (más de jefes y cofres grandes)', () => {
  for (const it of I.LIST) {
    const v = [0, 1, 2, 3].map(r => I.vals(it.id, r));
    for (const k in it.st || {}) for (let r = 1; r < 4; r++) assert.ok(v[r].st[k] > v[r - 1].st[k], it.id + ' ' + k);
    for (const k in it.x || {}) {
      if (/^cd/.test(k)) for (let r = 1; r < 4; r++) assert.ok(v[r].x[k] < v[r - 1].x[k], it.id + ' ' + k + ' baja');
      else if (k !== 'slow' && k !== 'psn') for (let r = 1; r < 4; r++) assert.ok(v[r].x[k] > v[r - 1].x[k], it.id + ' ' + k);
    }
    for (const k in it.ex || {}) {
      if (it.st && it.st[k]) continue;
      assert.ok(!v[0].st[k] && !v[1].st[k], it.id + ': sin extra en común y raro');
      assert.ok(v[3].st[k] > v[2].st[k] && v[2].st[k] > 0, it.id + ': extra en épico y más en legendario');
    }
  }
  // Probabilidades: se cuentan 40 000 tiradas de cada tipo.
  const count = luck => { const n = [0, 0, 0, 0]; for (let i = 0; i < 40000; i++) n[I.parse(I.roll(luck)).r]++; return n.map(x => x / 40000); };
  const a = count(0), b = count(1);
  assert.ok(a[3] > 0.015 && a[3] < 0.045, 'legendario normal ~3 %: ' + a[3]);
  assert.ok(a[0] > 0.5, 'común lo más normal');
  assert.ok(b[3] > a[3] * 1.6 && b[0] < a[0], 'jefes y cofres grandes: mejores rarezas');
  // Claves: 'id:r'; un id suelto (versión de antes) es común; lo que no existe, nada.
  assert.deepEqual({ ...I.parse('leftovers') }, { id: 'leftovers', r: 0 });
  assert.deepEqual({ ...I.parse('lifeorb:3') }, { id: 'lifeorb', r: 3 });
  assert.equal(I.parse('nada:2'), null);
  assert.equal(I.key('quickclaw', 2), 'quickclaw:2');
});

test('segundo hueco: sólo con los 4 movimientos fusionados; ponerse y quitarse deja los stats como estaban', () => {
  assert.equal(pl([['a', 'b', 'c'], ['d']]).itemSlots(), 1);
  const p = pl([['a', 'b', 'c', 'd']]);
  assert.equal(p.itemSlots(), 2);
  p.equipAt(0, 'choiceband:1');
  p.equipAt(1, 'metalcoat:2');
  assert.equal(p.items.length, 2);
  assert.ok(p.hasItem('choiceband') && p.hasItem('metalcoat'));
  assert.equal(p.item, 'choiceband', 'pl.item: el primero (habilidades y registro)');
  assert.ok(near(p.atkMul, 1 + 0.4 * 1.1));
  assert.ok(p.maxHp > 200 && p.dmgReduce > 0);
  // Cambiar el del 2.º hueco: el viejo se va del todo (y su vida de más).
  p.equipAt(1, 'quickclaw:0');
  assert.ok(!p.hasItem('metalcoat') && near(p.maxHp, 200) && near(p.dmgReduce, 0));
  assert.ok(near(p.cdMul, 1 - 0.2 * 0.85));
  // Quitárselo todo: como al empezar.
  p.equipAt(1, null); p.equipAt(0, null);
  assert.equal(p.items.length, 0);
  assert.ok(near(p.atkMul, 1) && near(p.cdMul, 1) && near(p.maxHp, 200));
  // El juego abre la elección con tantas cartas como haya (1-3 con el teclado) y el subtítulo cambia con dos huecos.
  assert.match(source('js/game.js'), /const cards = document\.querySelectorAll\('#item-cards \.card'\);\s*for \(let i = 0; i < cards\.length; i\+\+\)/);
  assert.match(source('dev.html'), /id="item-sub-t"[\s\S]*id="item-keys"/);
  assert.match(source('js/game.js'), /if \(pl\.itemSlots\(\) > slots0\) \{ G\.Spawner\.say\('¡Segundo hueco de objeto!/);
  // HUD: el 2.º hueco a la izquierda del primero, y la barra cuenta su ancho (móvil y vertical).
  const hud = source('js/ui/hud.js');
  assert.match(hud, /EXW = nIt > 1 \? S \+ GAP : 0/);
  assert.match(hud, /const bw = EXW \+ S \+ IG/);
});

test('evolución: a los 10 min llevando ESE objeto; mucho más fuerte, con aviso; cambiarlo empieza de cero', () => {
  said.length = 0;
  const p = pl();
  p.equipAt(0, 'assaultvest:1');
  const red0 = p.dmgReduce;
  p.items[0].t = 0;
  for (let i = 0; i < 599; i++) I.tick(p, 1);
  assert.equal(p.items[0].evo, false, 'a los 9:59 aún no');
  I.tick(p, 1);
  assert.equal(p.items[0].evo, true, 'a los 10:00, sí');
  assert.ok(near(p.dmgReduce, Math.min(I.CAP.red, red0 * I.EVO_K)) && p.dmgReduce > red0 * 1.5, 'sus números ×' + I.EVO_K + ' (con su tope)');
  assert.ok(said.some(s => /Chaleco Asalto ha evolucionado a Chaleco Titán/.test(s)), 'aviso');
  // Pasiva del Chaleco Titán: lo que pasa del 15 % de la vida en un golpe, a la mitad.
  assert.ok(near(I.taken(p, 100), 30 + 35));
  // La fuerza también va con la rareza.
  assert.ok(I.vals('assaultvest', 3, true).st.red > I.vals('assaultvest', 0, true).st.red);
  assert.ok(I.vals('quickclaw', 3, true).p.cdNow < I.vals('quickclaw', 0, true).p.cdNow);
  // Cambiarlo: el nuevo empieza de 0 y el progreso del viejo se pierde.
  p.equipAt(0, 'leftovers:2');
  assert.equal(p.items[0].t, 0); assert.equal(p.items[0].evo, false);
  // Cinta Campeona y Vidasfera Pura quitan su pega.
  const q = pl([['a'], ['b']]);
  q.equipAt(0, 'choiceband:0');
  assert.equal(I.locked(q), true);
  q.items[0].t = 600; I.tick(q, 0.01);
  assert.equal(I.locked(q), false);
});

test('equilibrio: con dos legendarios evolucionados los objetos no pasan de ×2 de daño ni de los topes', () => {
  const p = pl([['a', 'b', 'c', 'd']]);
  p.equipAt(0, 'choiceband:3'); p.equipAt(1, 'lifeorb:3');
  for (const it of p.items) { it.t = 600; }
  I.tick(p, 0.01);
  assert.ok(p.items.every(i => i.evo));
  assert.ok(p.atkMul <= 1 + I.CAP.atk + 1e-9, 'tope de daño plano: ' + p.atkMul);
  // Daño condicional (Baya Lichi + Cinta Experto) sobre un daño plano ya alto: el total no pasa de DMG_CAP.
  const q = pl([['a', 'b', 'c', 'd']]);
  q.equipAt(0, 'choiceband:3'); q.equipAt(1, 'liechiberry:3');
  for (const it of q.items) it.t = 600;
  I.tick(q, 0.01);
  q.hp = 10;
  const total = q.atkMul * I.out(q, mv('a'), { types: [] }, 'fire');
  assert.ok(total <= I.DMG_CAP + 1e-9, 'total ' + total);
  // Defensa: reducción y esquiva con tope.
  const d = pl([['a', 'b', 'c', 'd']]);
  d.equipAt(0, 'assaultvest:3'); d.equipAt(1, 'metalcoat:3');
  for (const it of d.items) it.t = 600;
  I.tick(d, 0.01);
  assert.ok(d.dmgReduce <= I.CAP.red + 1e-9);
  // Hoy (antes del cambio) la Cinta daba +40 %: un común da algo menos y la media de las rarezas, lo mismo más o menos.
  const avg = [0.55, 0.3, 0.12, 0.03].reduce((a, w, r) => a + w * I.vals('choiceband', r).st.atk, 0);
  assert.ok(I.vals('choiceband', 0).st.atk < 0.4 && Math.abs(avg - 0.4) < 0.02, 'media ' + avg);
});
