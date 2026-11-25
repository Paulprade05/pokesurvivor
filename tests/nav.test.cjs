// Plantillas a pantalla completa con orden fijo para el mando (1.0, bloque B; js/ui/nav.js).
// node --test tests/nav.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function bootNav() {
  const ctx = { G: {} };
  vm.createContext(ctx);
  vm.runInContext(source('js/ui/nav.js'), ctx, { filename: 'nav.js' });
  return ctx.G.Nav;
}

// ---- Un DOM de mentira, lo justo para G.Nav (etiquetas, atributos, clases y cajas) ----
function el(tag, attrs = {}, kids = [], box = { x: 0, y: 0, w: 100, h: 40 }) {
  const n = { tag, attrs, children: [], parentElement: null, box, disabled: 'disabled' in attrs };
  n.classList = { contains: c => (attrs.class || '').split(' ').includes(c) };
  n.dataset = new Proxy({}, { get: (_, k) => attrs['data-' + String(k).replace(/[A-Z]/g, m => '-' + m.toLowerCase())] });
  n.matches = sel => sel.split(',').some(s => one(n, s.trim()));
  n.closest = sel => { for (let e = n; e; e = e.parentElement) if (e.matches(sel)) return e; return null; };
  n.contains = o => { for (let e = o; e; e = e.parentElement) if (e === n) return true; return false; };
  n.querySelectorAll = sel => { const out = []; const walk = e => { for (const k of e.children) { if (k.matches(sel)) out.push(k); walk(k); } }; walk(n); return out; };
  n.getClientRects = () => (n.closest('.gone') ? [] : [1]);
  n.getBoundingClientRect = () => ({ left: box.x, top: box.y, width: box.w, height: box.h, right: box.x + box.w, bottom: box.y + box.h });
  for (const k of kids) { k.parentElement = n; n.children.push(k); }
  return n;
}
function one(n, s) {
  const m = s.match(/^([a-z]*)((?:\.[\w-]+|\[[\w-]+\])*)$/);
  if (!m) return false;
  if (m[1] && m[1] !== n.tag) return false;
  for (const p of m[2].match(/\.[\w-]+|\[[\w-]+\]/g) || []) {
    if (p[0] === '.' && !n.classList.contains(p.slice(1))) return false;
    if (p[0] === '[' && !(p.slice(1, -1) in n.attrs)) return false;
  }
  return true;
}
const b = (id, x = 0, y = 0, extra = {}) => el('button', { id, ...extra }, [], { x, y, w: 100, h: 40 });
const ids = rs => [...rs].map(r => [...r].map(e => e.attrs.id));

test('paso de la cruceta: una lista da la vuelta con ↑ ↓; ← → no hacen nada', () => {
  const N = bootNav(), L = [1, 1, 1, 1, 1];
  assert.deepEqual([...N.step(L, 0, 0, 'd')], [1, 0]);
  assert.deepEqual([...N.step(L, 4, 0, 'd')], [0, 0], 'desde abajo vuelve arriba');
  assert.deepEqual([...N.step(L, 0, 0, 'u')], [4, 0], 'desde arriba, al último');
  assert.deepEqual([...N.step(L, 2, 0, 'l')], [2, 0]);
  assert.deepEqual([...N.step(L, 2, 0, 'r')], [2, 0]);
});

test('paso de la cruceta: una sola fila (las cartas) da la vuelta con ← →', () => {
  const N = bootNav(), R = [3];
  assert.deepEqual([...N.step(R, 0, 2, 'r')], [0, 0]);
  assert.deepEqual([...N.step(R, 0, 0, 'l')], [0, 2]);
  assert.deepEqual([...N.step(R, 0, 1, 'd')], [0, 1], 'sin otra fila, ↓ no hace nada');
});

test('paso de la cruceta: en una rejilla se para en el borde y recuerda la columna', () => {
  const N = bootNav(), R = [3, 2];            // tres cartas y dos botones
  assert.deepEqual([...N.step(R, 0, 2, 'r')], [0, 2], 'en el borde se para');
  assert.deepEqual([...N.step(R, 1, 0, 'd')], [1, 0], 'abajo del todo se para');
  assert.deepEqual([...N.step(R, 0, 2, 'd')], [1, 1], 'a la fila más corta: su última');
  assert.deepEqual([...N.step(R, 1, 1, 'u', 2)], [0, 2], 'y al volver, a la columna de antes');
  assert.deepEqual([...N.step(R, 0, 0, 'x')], [0, 0], 'dirección rara: quieto');
  assert.deepEqual([...N.step([], 0, 0, 'd')], [0, 0]);
});

test('zona y filas: sólo [data-nav], en el orden del HTML, sin lo escondido ni lo apagado', () => {
  const N = bootNav();
  const cards = el('div', { 'data-nav-row': '' }, [
    el('div', { class: 'card', id: 'c1' }, [b('dentro')], { x: 0, y: 0, w: 200, h: 300 }),
    el('div', { class: 'card', id: 'c2' }, [], { x: 220, y: 0, w: 200, h: 300 }),
    el('div', { class: 'card', id: 'c3' }, [], { x: 440, y: 0, w: 200, h: 300 })
  ]);
  const foot = el('footer', { 'data-nav-row': '' }, [b('reroll', 0, 320), b('discard', 120, 320, { class: 'hidden' }), b('off', 240, 320, { disabled: '' })]);
  const zone = el('div', { 'data-nav': '' }, [el('header', {}, [b('fuera-no')]), cards, foot]);
  const scr = el('section', { class: 'scr fs-scr' }, [b('pestaña'), zone]);
  assert.equal(N.zone(scr), zone);
  const rs = N.rows(zone);
  // Con filas marcadas sólo cuentan ellas; el botón de dentro de una carta, lo escondido y lo apagado, tampoco.
  assert.deepEqual(ids(rs), [['c1', 'c2', 'c3'], ['reroll']]);
  assert.deepEqual([...N.locate(rs, rs[0][2])], [0, 2]);
  assert.equal(N.locate(rs, b('otro')), null);
});

test('zona y filas: data-nav-cols parte una lista; sin zona visible, null', () => {
  const N = bootNav();
  const menu = el('nav', { 'data-nav': '', 'data-nav-cols': '1' }, [b('a', 0, 0), b('b', 0, 50), b('c', 0, 100)]);
  assert.deepEqual(ids(N.rows(menu)), [['a'], ['b'], ['c']]);
  // Sin data-nav-cols: las que caben en la primera línea (dos arriba, una abajo).
  const grid = el('div', { 'data-nav': '' }, [b('x1', 0, 0), b('x2', 120, 0), b('x3', 0, 50)]);
  assert.deepEqual(ids(N.rows(grid)), [['x1', 'x2'], ['x3']]);
  assert.equal(N.zone(el('section', {}, [el('div', { 'data-nav': '', class: 'gone' })])), null);
  assert.equal(N.zone(null), null);
});

test('las cinco pantallas de la partida son plantillas: opacas, una zona con cursor y su barra', () => {
  const html = source('dev.html');
  for (const id of ['scr-levelup', 'scr-bond', 'scr-item', 'scr-pause', 'scr-over']) {
    // (hasta el </section> de la pantalla: el que va seguido de una línea en blanco)
    const a = html.indexOf('<section id="' + id + '"'), z = a + html.slice(a).search(/<\/section>\r?\n\r?\n/);
    assert.ok(a > 0 && z > a, id);
    const s = html.slice(a, z);
    assert.match(s.slice(0, 80), /class="scr dim fs-scr hidden"/, id + ': plantilla');
    assert.equal((s.match(/ data-nav[ >]/g) || []).length, 1, id + ': una sola zona con cursor');
    assert.match(s, /<footer class="fs-bar"/, id + ': barra del mando');
  }
  // Pausa: el menú, en orden fijo de arriba abajo, y las páginas fuera del cursor (LB / RB).
  const p = html.slice(html.indexOf('<section id="scr-pause"'));
  const order = ['btn-resume', 'pause-build', 'btn-pause-cmp', 'btn-pause-settings', 'btn-quit'].map(i => p.indexOf('id="' + i + '"'));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  assert.ok(p.indexOf('data-nav data-nav-cols="1"') < order[0]);
  assert.ok((p.slice(0, p.search(/<\/section>\r?\n\r?\n/)).match(/role="tab"/g) || []).length === 3);
  assert.match(html, /<script defer src="js\/ui\/nav.js"><\/script>/);
});

test('CSS: a pantalla completa y opacas, una página a la vez y la barra sólo con mando', () => {
  const css = source('css/style.css');
  assert.match(css, /\.scr\.fs-scr \{[^}]*background: #040a06/);
  assert.match(css, /\.scr\.fs-scr > \.box\.fs \{[^}]*width: 100%;[^}]*height: 100%/);
  assert.match(css, /\.fs-bar \{ display: none; \}/);
  assert.match(css, /body\.pad \.fs-bar \{/);
  assert.match(css, /\.fs-scroll > \.fs-pg \{ display: none; \}/);
  for (const pg of ['atk', 'pas', 'stats', 'sum', 'moves', 'caught']) assert.ok(css.includes(`.fs-scroll[data-page="${pg}"] > [data-pg="${pg}"]`), 'página ' + pg);
  // Lo de antes ya no está: ni la mesa en dos columnas ni el orden cambiado de los botones de la pausa.
  assert.doesNotMatch(css, /#btn-resume \{ order:|#pause-sum \{ display: contents/);
});

test('en las plantillas no sale la barra de pistas general (llevan la suya)', () => {
  const g = { Pad: { context: () => ({ mode: 'ui', top: 'scr-pause', focus: 'btn' }), glyph: a => '[' + a + ']', label: () => 'x', on() {} },
    T: s => s, I18n: { f: s => s } };
  const mk = fsScr => {
    const c = { G: g, setInterval() {}, clearInterval() {},
      document: { body: { classList: { contains: () => true } }, getElementById: () => ({ classList: { contains: k => fsScr && k === 'fs-scr' } }) } };
    vm.createContext(c);
    vm.runInContext(source('js/ui/pad-ui.js'), c, { filename: 'pad-ui.js' });
    return g.PadUI.html();
  };
  assert.equal(mk(true), '');
  assert.notEqual(mk(false), '');
});

test('gamepad.js usa el orden fijo si la pantalla tiene zona (G.Nav), y el de antes si no', () => {
  const js = source('js/core/gamepad.js');
  assert.match(js, /function navZone\(\)/);
  assert.match(js, /G\.Nav\.step\(/);
  assert.match(js, /if \(z\) \{ const rs = G\.Nav\.rows\(z\); if \(rs\.length\) return rs\.flat\(\); \}/);
});

test('pausa y resumen: páginas con LB / RB y la pausa en grupo avisa y enseña la vida', () => {
  const js = source('js/ui/run-ui.js');
  assert.match(js, /function setPage\(scr, box, pg\)/);
  for (const pg of ['atk', 'pas', 'stats', 'sum', 'moves', 'caught']) assert.ok(js.includes(`data-pg="${pg}"`), 'página ' + pg);
  assert.match(js, /coopT = setInterval\(coopTick, 200\)/);
  assert.match(js, /classList\.add\('hit'\)/);
  assert.doesNotMatch(js, /<button id="pause-build"/, 'el botón de la build va en el menú, no dentro de la tarjeta');
});
