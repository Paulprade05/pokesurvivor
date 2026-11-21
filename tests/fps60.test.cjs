// 60 FPS (2026-11-21, rama fps-60): motor WebGL2 de serie en PC, menos JS dibujando enemigos y proyectiles, y menos basura.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/** settings.js con lo guardado `stored` y un aparato táctil o no. Devuelve G.Settings y lo que quedó guardado. */
function settings(stored, touch = false) {
  const store = { 'ps.settings': JSON.stringify(stored || {}) };
  const sb = { G: {}, JSON, Object, Set, Math, matchMedia: q => ({ matches: touch && /coarse/.test(q) }),
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read('js/core/settings.js'), sb, { filename: 'settings.js' });
  return sb.G.Settings;
}
/** gl2d.js con unos ajustes (sólo lee glDraw y touch). */
function gl2d(S, search = '') {
  const sb = { G: { Settings: S }, URLSearchParams, location: { search }, console, Math, Map, Set,
    WeakMap, Object, Array, Float32Array, Uint8Array, Uint16Array, ArrayBuffer, JSON, String, Number, isFinite, queueMicrotask };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read('js/core/gl2d.js'), sb, { filename: 'gl2d.js' });
  return sb.G.GL2D;
}

test('motor WebGL2: de serie en PC (y la app de Windows), no en táctil; lo elegido manda', () => {
  assert.equal(settings().get('glDraw'), null);
  assert.equal(gl2d(settings()).wanted(), true, 'PC sin elegir: WebGL2');
  assert.equal(gl2d(settings(null, true)).wanted(), false, 'táctil sin elegir: Canvas 2D');
  assert.equal(gl2d(settings({ glDraw: true, glV: 1 }, true)).wanted(), true, 'táctil que lo encendió');
  assert.equal(gl2d(settings({ glDraw: false, glV: 1 })).wanted(), false, 'PC que lo apagó');
  assert.equal(gl2d(settings({ glDraw: false, glV: 1 }), '?gl=1').wanted(), true, '?gl=1 manda');
  assert.equal(gl2d(settings(), '?gl=0').wanted(), false, '?gl=0 manda');
});

test('motor WebGL2: el false que se guardaba de serie (apagado hasta hoy) pasa a automático una vez; el true se respeta', () => {
  assert.equal(settings({ glDraw: false, quality: 'high' }).get('glDraw'), null);
  assert.equal(settings({ glDraw: true }).get('glDraw'), true);
  assert.equal(settings({ glDraw: false, glV: 1 }).get('glDraw'), false);
  // En Ajustes, el interruptor enseña lo que se usa de verdad (también el automático) y ya no dice «pruebas».
  const ui = read('js/ui/settings-ui.js');
  assert.match(ui, /k === 'glDraw' && G\.GL2D \? G\.GL2D\.wanted\(\)/);
  assert.doesNotMatch(ui, /Motor WebGL2 \(pruebas\)/);
  // Sin WebGL2 (o si falla) sigue el Canvas 2D: create da null y game.js usa getContext('2d').
  assert.equal(gl2d(settings()).create({}), null);
  assert.match(read('js/game.js'), /ctx = \(G\.GL2D && G\.GL2D\.create\(cv\)\) \|\| cv\.getContext\('2d'\);/);
});

test('3D de Ultra con el motor: si el contexto se pierde y vuelve, se rehace (antes se apagaba toda la sesión)', () => {
  const u3 = read('js/world/ultra3d.js');
  assert.match(u3, /if \(rt && G\.GL2D\.lost\) return false;\s*if \(rt && G\.GL2D\.gen !== glGen\) rebuild\(\);/);
  assert.match(u3, /function rebuild\(\) \{\s*dropAll\(true\);\s*renderer = null; rt = null; glcv = null;[^\n]*\n\s*nRebuilt\+\+;\s*start\(\);/);
  assert.doesNotMatch(u3, /G\.GL2D\.gen !== glGen\) \{ state = 'fail'/);
});

test('elipses de sombras y aros sin pasar por el trazado (fillOval), con el último color ya leído', () => {
  const src = read('js/core/gl2d.js');
  assert.match(src, /fillOval\(x, y, rx, ry\) \{[\s\S]*?this\._shape\(s\.m, 2, x, y, rx, ry, 0, 0, s\.fill, 0\); return; \}\s*this\.beginPath\(\); this\.ellipse\(x, y, rx, ry, 0, 0, TAU\); this\.fill\(\);/);
  assert.match(src, /if \(style !== this\._lcs\) \{/);
  // Muchas de una vez (los disparos): fillOvals, sin una llamada por elipse.
  assert.match(src, /fillOvals\(buf, n\) \{/);
  const pr = read('js/entities/projectile.js');
  assert.match(pr, /const ov = typeof ctx\.fillOvals === 'function';/);
  assert.match(pr, /if \(n\) \{ ctx\.globalAlpha = 1; ctx\.fillOvals\(OVB, n\); \}/);
  // Con Canvas 2D, el trazado de siempre.
  assert.match(pr, /ctx\.globalAlpha = p\.friendly \? own : 1;\s*ctx\.beginPath\(\); ctx\.ellipse\(p\.x, p\.y, p\.r \* 0\.9, p\.r \* 0\.38, 0, 0, 6\.2832\); ctx\.fill\(\);/);
});

test('dibujo: sin objetos nuevos por disparo ni por enemigo, sin save/restore por enemigo y nada fuera de pantalla', () => {
  const pr = read('js/entities/projectile.js');
  const d = pr.slice(pr.indexOf('  function draw(ctx) {'), pr.indexOf('  return { clear'));
  assert.doesNotMatch(d, /G\.VFX\.draw\([^)]*\{/, 'VFX.draw con un objeto nuevo');
  assert.match(d, /if \(p\.noShadow \|\| !shown\(p\)\) continue;/);
  assert.match(d, /if \(!shown\(p\)\) continue;/);
  // La misma cuenta que G.Camera.sees (ver _sees en camera.js).
  assert.match(d, /const vx0 = cam\.x - cw \/ 2 - cw \/ 2 \* f, vx1 = cam\.x \+ cw \/ 2 \+ cw \/ 2 \* f, vy0 = cam\.y - ch \/ 2 - ch \/ 2 \* f, vy1 = cam\.y \+ ch \/ 2;/);
  const en = read('js/entities/enemy.js');
  const ed = en.slice(en.indexOf('    draw(ctx) {'), en.indexOf('    draw(ctx) {') + 6000);
  assert.match(ed, /if \(sink\) ctx\.save\(\);/);
  assert.match(ed, /if \(sink\) ctx\.restore\(\); else ctx\.globalAlpha = ga;/);
  assert.match(ed, /this\.anim\.draw\(ctx, this\.x, this\.y - lift, DO\);/);
  assert.doesNotMatch(ed, /const SUP = \{/);
  const fx = read('js/entities/fx.js');
  assert.match(fx, /if \(!cam\.sees\(p\.x, p\.y, 16\)\) continue;/);
});

test('pools: el Set de objetos golpeados de un disparo se crea al primer golpe; hacia el jugador sin arreglos nuevos', () => {
  const sb = { G: {}, Math, Object, Set, Infinity };
  vm.createContext(sb);
  vm.runInContext(read('js/entities/projectile.js'), sb, { filename: 'projectile.js' });
  const p = sb.G.Projectiles.spawn({ friendly: true, x: 1, y: 2 });
  assert.equal(p.phits, null, 'sin Set hasta que toque un objeto');
  const c = read('js/systems/combat.js');
  assert.match(c, /if \(p\.phits && p\.phits\.has\(prop\.id\)\) continue;\s*\(p\.phits \|\| \(p\.phits = new Set\(\)\)\)\.add\(prop\.id\);/);
  // La dirección hacia el jugador de enemy.update: los mismos números que G.U.norm.
  const norm = (x, y) => { const m = Math.hypot(x, y); return m > 1e-6 ? [x / m, y / m] : [0, 0]; };
  const inl = (ux, uy) => { const um = Math.hypot(ux, uy); return [um > 1e-6 ? ux / um : 0, um > 1e-6 ? uy / um : 0]; };
  for (const [x, y] of [[3, 4], [0, 0], [1e-7, 0], [-120.5, 33.25], [1e6, -1e6]]) assert.deepEqual(inl(x, y), norm(x, y));
  assert.match(read('js/entities/enemy.js'), /const ux = pl\.x - this\.x, uy = pl\.y - this\.y, um = Math\.hypot\(ux, uy\);/);
});
