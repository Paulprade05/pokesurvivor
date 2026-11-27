// Pantalla de objeto repetido (27-11-2026, el dueño: «los objetos cuando ya tienes uno salen mal en pantalla»).
// La elección de objeto (#scr-item) sólo sale cuando ya llevas uno. Desde el bloque B es una plantilla a pantalla
// completa (.scr.fs-scr > .box.fs, width 100 %), pero una regla vieja con id (#scr-item > .pick-box, 760 px) le ganaba
// y en PC y tableta el panel quedaba pegado a la izquierda con la partida asomando a la derecha.
// Aquí: ninguna regla con id puede darle ancho propio a la caja de las pantallas de elección.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

const PICK = ['scr-levelup', 'scr-bond', 'scr-item', 'scr-encounter'];

/** Reglas sueltas del CSS (también las de dentro de @media): [{ sel, body }]. */
function rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [], re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}

test('las pantallas de elección son plantillas a pantalla completa', () => {
  const html = source('dev.html');
  for (const id of PICK) {
    const m = html.match(new RegExp(`<section id="${id}" class="([^"]*)"[^>]*>\\s*<div class="([^"]*)"`));
    assert.ok(m, id + ' existe');
    assert.match(m[1], /\bfs-scr\b/, id + ' es .fs-scr');
    assert.match(m[2], /\bbox\b/, id + ' tiene .box');
    assert.match(m[2], /\bfs\b/, id + ' tiene .box.fs');
  }
});

test('ninguna regla con id les da ancho propio a sus cajas (ganaría a la de .fs-scr)', () => {
  const bad = [];
  for (const { sel, body } of rules(source('css/style.css'))) {
    if (!/(^|[;\s])(max-)?width\s*:/.test(body)) continue;
    for (const part of sel.split(/,(?![^(]*\))/)) {
      for (const id of PICK) {
        if (new RegExp(`#${id}\\b[^,]*>\\s*\\.(box|pick-box)`).test(part)) bad.push(part.trim() + ' { ' + body.trim() + ' }');
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('la caja de .fs-scr ocupa todo el ancho', () => {
  const r = rules(source('css/style.css')).find(x => x.sel === '.scr.fs-scr > .box.fs');
  assert.ok(r, 'regla .scr.fs-scr > .box.fs');
  assert.match(r.body, /(^|[;\s])width:\s*100%/);
});
