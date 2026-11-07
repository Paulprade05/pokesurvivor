// Iconos de ataques (07-11-2026): cada ataque tiene su dibujo y no hay dos iguales.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');

function boot() {
  const G = { Moves: null, U: { freeCanvas() {} }, DB: {} };
  const ctx = vm.createContext({ G, console, window: { G }, document: { createElement: () => ({ getContext: () => null }) }, Image: class {} });
  for (const f of ['js/data/moves.js', 'js/data/move-art.js', 'js/ui/icons.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return G;
}

test('los 140 ataques tienen icono de 30×30 con colores válidos', () => {
  const G = boot();
  assert.equal(G.Moves.ALL.length, 140);
  for (const m of G.Moves.ALL) {
    const a = G.Icons.moveArt(m.id);
    assert.equal(a.px.length, 900, m.id);
    assert.ok(a.px.some(v => v), m.id + ': vacío');
    for (const v of new Set(a.px)) if (v) assert.match(a.pal[v], /^#[0-9a-f]{6}$/, m.id);
  }
});

test('sólo faltan en move-art.js los siete dibujados a mano, y no sobra ninguno', () => {
  const G = boot(), ids = new Set(G.Moves.ALL.map(m => m.id));
  const manual = G.Moves.ALL.map(m => m.id).filter(id => !G.MOVE_ART[id]).sort();
  assert.deepEqual(manual, ['body-slam', 'fire-spin', 'heat-wave', 'seed-bomb', 'substitute', 'vine-whip', 'will-o-wisp']);
  for (const id of Object.keys(G.MOVE_ART)) assert.ok(ids.has(id), id + ': no es un ataque');
});

test('no hay dos dibujos iguales', () => {
  const G = boot(), seen = new Map();
  for (const m of G.Moves.ALL) {
    const a = G.Icons.moveArt(m.id), pic = Array.from(a.px, v => a.pal[v] || '').join();
    assert.equal(seen.get(pic), undefined, m.id + ' repite el dibujo de ' + seen.get(pic));
    seen.set(pic, m.id);
  }
});
