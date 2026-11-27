// Arreglos de la prueba de la 1.0 en la app de Windows (27-11-2026): service worker, mando (invitación, Compendio),
// detalle de Mejoras y aviso de «saltar». Probado de verdad en la app; aquí, que no se pierdan.
// node --test tests/pruebas-1-0.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

test('la app de Windows no registra el service worker (sirve 404 y salía como error al abrir)', () => {
  const m = source('js/main.js');
  assert.match(m, /serviceWorker\.register\('sw\.js'\)/);
  assert.match(m, /!\(window\.pokeEscritorio && window\.pokeEscritorio\.esEscritorio\)\)/);
});

test('invitación a una sala: el mando llega (zona y B = «No, gracias»)', () => {
  const html = source('dev.html');
  assert.match(html, /<div class="inv-acts" data-nav[^>]*>/);
  assert.match(html, /<button id="inv-no"[^>]*data-back/);
  const g = source('js/core/gamepad.js');
  assert.match(g, /function invite\(\)/);
  assert.match(g, /function topScreen\(\) \{\s*const inv = invite\(\);\s*if \(inv\) return inv;/);
  assert.match(g, /function uiMode\(\) \{\s*if \(invite\(\)\) return true;/);
});

test('Compendio en el ordenador: con mando, A entra en la ficha y B vuelve a la lista', () => {
  const c = source('js/ui/compendium-ui.js');
  assert.match(c, /function padIn\(on\)/);
  assert.match(c, /\.cmp-list'\)\.toggleAttribute\('data-nav-skip', on\)/);
  assert.match(c, /back\.onclick = \(\) => \{ if \(padOn\) padIn\(false\);/);
  assert.match(c, /if \(!NARROW\.matches && document\.body\.classList\.contains\('pad'\)\) padIn\(true\);/);
  assert.match(source('dev.html'), /id="cmp-rows"[^>]*data-pad-ok="Ver ficha"/);
});

test('Mejoras en el ordenador: el detalle va a la derecha de la lista', () => {
  assert.match(source('js/ui/menu.js'), /mq\('\(min-width: 900px\) and \(min-height: 600px\)'\)[\s\S]{0,200}appendChild\(det\)/);
  assert.match(source('css/style.css'), /body\.pad \.upg-box \.upg-body \{ grid-template-columns: 236px minmax\(0, 1fr\) minmax\(220px, 300px\); \}/);
});

test('aviso de «saltar» con mando: su botón, también en inglés', () => {
  const r = source('js/systems/rift.js');
  assert.match(r, /function skipText\(\)/);
  assert.doesNotMatch(r, /G\.Touch\.active \? 'Toca la pantalla para saltar' : 'Pulsa Espacio para saltar'/);
  assert.match(source('js/systems/judgment.js'), /ctx\.fillText\(G\.Rift\.skipText\(\),/);
  assert.match(source('js/data/lang-en.js'), /'Pulsa \{x\} para saltar': 'Press \{x\} to skip'/);
});
