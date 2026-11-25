// Presupuesto de poder de la 1.0 (bloque A, 24-11-2026): js/data/power-budget.js. Falla si una fuente nueva, o lo que
// ya hay en el juego (Sobrefusión, objetos y, cuando existan, rareza de cartas, suerte, vitaminas y compañero), se pasa.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const J = o => JSON.parse(JSON.stringify(o));     // (lo del contexto aislado, a objetos de aquí)

/** El juego con lo que el presupuesto mira: los datos y player.js (lo que exista se carga). */
function load(extra) {
  const G = { U: { pick: a => a[0], clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
  const ctx = vm.createContext({ G, Math, console });
  for (const f of ['js/data/items.js', 'js/entities/player.js', 'js/data/power-budget.js']) vm.runInContext(source(f), ctx, { filename: f });
  if (extra) extra(G);
  return G;
}

test('el presupuesto cabe en sus límites y el juego de hoy cabe en el presupuesto', () => {
  const G = load();
  assert.deepEqual(J(G.PowerBudget.verify(G)), []);
  const t = G.PowerBudget.total();
  for (const ax in G.PowerBudget.LIMIT) assert.ok(t[ax] <= G.PowerBudget.LIMIT[ax] + 1e-9, ax);
  // Las cifras que se explican en la nota del vault («Bloque A - Medir»).
  assert.ok(Math.abs(t.dmg - 1.979) < 0.01, 'daño ×' + t.dmg);
  assert.ok(Math.abs(t.def - 1.176) < 0.01, 'defensa ×' + t.def);
  assert.equal(t.hp, 1.25);
  for (const ax in G.PowerBudget.EXPECT) assert.ok(G.PowerBudget.EXPECT[ax] <= G.PowerBudget.LIMIT[ax], 'lo esperado dentro del límite: ' + ax);
});

test('decisiones del dueño: Sobrefusión +8 % ×8, compañero 10-15 %, Más PP con tope propio', () => {
  const B = load().PowerBudget;
  assert.equal(B.OVER.K, 0.08); assert.equal(B.OVER.MAX, 8);
  assert.deepEqual(J(B.COMPANION.SHARE), [0.10, 0.15]);
  assert.ok(B.VIT.ppup.cap >= 1);
  for (const id of ['hpup', 'protein', 'calcium', 'iron', 'zinc', 'carbos', 'ppup']) assert.ok(B.VIT[id], id);
  // Rareza con los 4 colores de los objetos: 4 escalones que suben.
  assert.equal(B.CARD.EXTRA.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(B.CARD.EXTRA[i] > B.CARD.EXTRA[i - 1]);
  // La tabla de la suerte al tope es la de jefes de items.js.
  const m = /W_LUCK = \[([\d, ]+)\]/.exec(source('js/data/items.js'));
  assert.deepEqual(m[1].split(",").map(Number), J(B.FORTUNE.TABLE_MAX));
});

test('falla si algo se pasa', () => {
  // Sobrefusión de más (hoy +45 %; la 1.0, +64 %).
  let G = load(g => { Object.defineProperty(g.Player, 'OVER_K', { get: () => 0.15 }); Object.defineProperty(g.Player, 'OVER_MAX', { get: () => 8 }); });
  assert.match(G.PowerBudget.verify(G).join('|'), /Sobrefusión/);
  // Objetos con más tope de daño.
  G = load(g => { g.Items.CAP.atk = 1.2; });
  assert.match(G.PowerBudget.verify(G).join('|'), /CAP\.atk/);
  // Bloques futuros: rareza de cartas, suerte, compañero y vitaminas.
  G = load(g => {
    g.CardRarity = { EXTRA: [0, 0.02, 0.05, 0.07], CAP: 0.2, AREA: 0.1 };
    g.Fortune = { MAX: 2 };
    g.Companion = { SHARE: 0.2 };
    g.Vitamins = { VIT: { protein: { step: [0.02, 0.03, 0.04, 0.06], cap: 0.3 }, rarecandy: { step: [1], cap: 1 } } };
  });
  const bad = G.PowerBudget.verify(G).join('|');
  for (const re of [/EXTRA\[2\]/, /cartas CAP/, /suerte/, /compañero/, /protein cap/, /rarecandy sin presupuesto/]) assert.match(bad, re);
  // Y lo que sí cabe, pasa.
  G = load(g => {
    g.CardRarity = { EXTRA: [0, 0.02, 0.04, 0.07], CAP: 0.15, AREA: 0.15 };
    g.Fortune = { MAX: 1 }; g.Companion = { SHARE: [0.1, 0.15] };
    Object.defineProperty(g.Player, 'OVER_K', { get: () => 0.08 }); Object.defineProperty(g.Player, 'OVER_MAX', { get: () => 8 });
    g.Vitamins = { VIT: JSON.parse(JSON.stringify(g.PowerBudget.VIT)) };
  });
  assert.deepEqual(J(G.PowerBudget.verify(G)), []);
});

test('si el presupuesto mismo se pasa de su límite, también falla', () => {
  const G = load();
  G.PowerBudget.VIT.protein.cap = 0.4;      // (SOURCES se calculó al cargar: se cambia el trozo a mano)
  G.PowerBudget.SOURCES.vitamins.k.dmg = 1.4;
  assert.match(G.PowerBudget.verify(null).join('|'), /total dmg/);
});

test('va en el juego: dev.html la carga detrás de items.js', () => {
  const h = source('dev.html');
  const a = h.indexOf('js/data/items.js'), b = h.indexOf('js/data/power-budget.js');
  assert.ok(a > 0 && b > a);
});
