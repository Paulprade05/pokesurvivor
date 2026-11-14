// Pausa «mesa de combinaciones» (14-11-2026, js/ui/run-ui.js pauseSummary).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, f), 'utf8');

test('la pausa es una rejilla, sin columnas CSS (en WebKit se montaban unas tarjetas encima de otras)', () => {
  const css = src('css/style.css');
  const rules = [...css.matchAll(/([^{}]*(?:pause-cols|pz-grid|ps-card)[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length > 0);
  for (const [, sel, body] of rules) {
    assert.doesNotMatch(body, /(^|[;\s])(-webkit-)?column-(count|width|span|break-inside)\s*:|(^|[;\s])columns\s*:/, 'regla con columnas CSS: ' + sel.trim());
  }
  assert.match(css, /\.pause-cols\.pz-grid\s*\{[^}]*display:\s*grid/);
});

test('el sonido ya no está en la pausa (va en Ajustes)', () => {
  assert.doesNotMatch(src('dev.html'), /id="pause-sound"/);
  assert.doesNotMatch(src('js/ui/run-ui.js'), /pause-sound/);
  assert.match(src('dev.html'), /id="btn-pause-settings"/, 'el botón Ajustes de la pausa sigue');
});

test('los textos nuevos de la pausa tienen su inglés', () => {
  const js = src('js/ui/run-ui.js'), en = src('js/data/lang-en.js');
  const a = js.indexOf('Pausa «mesa de combinaciones»'), b = js.indexOf('function keyHint');
  assert.ok(a > 0 && b > a);
  const body = js.slice(a, b);
  const keys = new Set([...body.matchAll(/G\.(?:T|I18n\.f)\('([^']+)'/g)].map(m => m[1]));
  for (const k of ['Ataques y evoluciones', 'Tu Pokémon', 'Pasivas', 'Recogida', 'Experiencia']) {
    assert.ok(body.includes(k), 'falta en la pausa: ' + k);
    keys.add(k);
  }
  for (const k of keys) assert.ok(en.includes(JSON.stringify(k)) || en.includes("'" + k + "'"), 'sin inglés: ' + k);
});
