// Rareza de los ataques más a la vista (28-11-2026, lo pidió el dueño): carta de mejora teñida y con marco grueso de su
// color, chapa con rombos y nombre (la común, en gris), y los rombos en el HUD, la cabecera de las cartas, la pausa y el
// fin de partida. Rombos (1 raro, 2 épico, 3 legendario) para verla sin distinguir colores. Sin animación.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

/** Un nodo del DOM de mentira: cualquier cosa que se le pida (al cargar run-ui.js se enganchan eventos). */
const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.iterator ? [][Symbol.iterator] : k === 'length' ? 0 : any()), apply: () => any() });
function load() {
  const G = { U: { pick: a => a[0], clamp: (v, a, b) => Math.max(a, Math.min(b, v)), TYPE_COLOR: {} },
              I18n: { f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } }, T: s => s, Game: { player: null },
              UI: { $: () => any() }, Pad: { on() {} } };
  const ctx = vm.createContext({ G, Math, console, document: any(), window: any(), addEventListener() {} });
  for (const f of ['js/data/items.js', 'js/data/power-budget.js', 'js/systems/fortune.js', 'js/ui/run-ui.js']) vm.runInContext(source(f), ctx, { filename: f });
  return G;
}
const G = load(), P = G.RunUI.parts, C = G.CardRarity;
const gems = h => (h.match(/<i><\/i>/g) || []).length;

test('chapa de rareza: rombos según la rareza (ninguno la común), su nombre y su color', () => {
  for (let r = 0; r < 4; r++) {
    const h = P.atkRar(r);
    assert.equal(gems(h), r, 'rombos de ' + r);
    assert.ok(h.includes(`class="atk-rar r${r}"`), h);
    assert.ok(h.includes(G.Rarity.name(r)), h);
    assert.ok(h.includes(`--rc:${G.Rarity.color(r)}`), h);
  }
  assert.ok(P.atkRar(2, '', 'sm', 'Extra de rareza').includes('title="Extra de rareza"'));
  assert.equal(P.rarGems(0), '');
  assert.equal(gems(P.rarGems(3, 'sl-rar')), 3);
  assert.ok(P.rarGems(1, 'sl-rar').includes('class="rar-gems sl-rar"'));
});

test('rareza de un hueco: la más alta que cogió cualquiera de sus ataques (−1 sin extra)', () => {
  const a = { id: 'a' }, b = { id: 'b' };
  assert.equal(P.slotRar([a]), -1);
  C.apply(a, 1); assert.equal(P.slotRar([a]), 1);
  C.apply(b, 3); assert.equal(P.slotRar([a, b]), 3);
  C.apply(a, 0); assert.equal(P.slotRar([a]), 1, 'la común no la baja');
});

test('se ve en todos los sitios: carta (siempre con su rareza), cabecera, pausa, fin, HUD y estilos', () => {
  const ui = source('js/ui/run-ui.js');
  assert.match(ui, /cls: 'is-up rar-on r' \+ r/);
  assert.match(ui, /eyebrow: atkRar\(r\)/);
  assert.match(ui, /rarGems\(slotRar\(g\), 'sl-rar'\)/, 'cabecera y pausa');
  assert.match(ui, /rarGems\(rb, 'sl-rar'\)/, 'fin de partida');
  const hud = source('js/ui/hud.js');
  assert.match(hud, /G\.CardRarity\.best\(gm\)/);
  assert.match(hud, /G\.Rarity\.color\(rb\)/);
  const css = source('css/style.css');
  for (const s of ['.card.pick-card.rar-on:not(.r0)', '.rar-gems > i', '.atk-rar.r0', '.rar-gems.sl-rar', '.pz-tag.rar'])
    assert.ok(css.includes(s), s);
  const block = css.slice(css.indexOf('.card.pick-card.rar-on:not(.r0)'), css.indexOf('.mv-row > .ico-tile'));
  assert.doesNotMatch(block, /animation/, 'sin animación (lo eligió el dueño)');
  const en = source('js/data/lang-en.js');
  for (const s of ['Común', 'Raro', 'Épico', 'Legendario']) assert.ok(en.includes(`'${s}':`), s);
});
