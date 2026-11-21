// Mando (21-11-2026, js/core/gamepad.js): botones elegidos en Ajustes > Controles > Con mando (ajuste 'padMap'),
// conflictos, navegación de los menús y que el juego use el mapeo. node --test tests/mando.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

/** gamepad.js en un contexto sin página: un mando de mentira y lo que llama al juego, apuntado. */
function boot(state = 'playing') {
  const settings = { gamepad: true, padRumble: true, padMap: null }, fns = [];
  const calls = [];
  const btn = () => ({ pressed: false, value: 0 });
  const fake = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
  let now = 1000;
  const ctx = {
    console, performance: { now: () => now },
    navigator: { getGamepads: () => [fake] },
    addEventListener() {}, getComputedStyle: () => ({ zIndex: '0', overflowY: 'visible', overflowX: 'visible', cursor: 'auto' }),
    innerWidth: 800, innerHeight: 600,
    document: { querySelectorAll: () => [], getElementById: () => null, body: { classList: { toggle() {} } } },
    G: {
      Settings: { get: k => settings[k], set: (k, v) => { settings[k] = v; fns.forEach(f => f(k, v)); }, on: f => fns.push(f) },
      Input: { virtual: c => calls.push('key:' + c), virtualAct: a => calls.push('act:' + a), virtualHold: a => calls.push('hold:' + a) },
      Game: { state },
      I18n: { f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source('js/core/gamepad.js'), ctx, { filename: 'gamepad.js' });
  const P = ctx.G.Pad;
  /** Un fotograma con estos botones pulsados. */
  const frame = (...held) => { now += 16; fake.buttons.forEach((b, i) => { b.pressed = held.includes(i); b.value = b.pressed ? 1 : 0; }); P.poll(0.016); };
  /** Pulsar y soltar un botón: → lo que ha mandado al juego. */
  const tap = b => { frame(); calls.length = 0; frame(b); const out = calls.slice(); frame(); return out; };
  return { P, G: ctx.G, settings, calls, fake, frame, tap };
}

test('de serie: cada acción con sus botones y sin repetir botón entre las que se usan a la vez', () => {
  const { P } = boot();
  const m = P.map();
  assert.deepEqual([...m.prev], [4, 6]); assert.deepEqual([...m.next], [5, 7]);
  assert.deepEqual([...m.open], [0]); assert.deepEqual([...m.zmove], [2]); assert.deepEqual([...m.pause], [9, 8]);
  assert.deepEqual([...m.run], [1]); assert.deepEqual([...m.m1], []);
  assert.deepEqual([...m.ok], [0]); assert.deepEqual([...m.back], [1, 8]); assert.deepEqual([...m.reroll], [3]); assert.deepEqual([...m.discard], [2]);
  for (const ctx of ['game', 'ui']) {
    const used = P.LIST.filter(a => P.ACTS[a].ctx === ctx).flatMap(a => [...m[a]]);
    assert.equal(new Set(used).size, used.length, 'botón repetido en ' + ctx);
  }
  // La cruceta nunca es de una acción: mueve y elige.
  for (const a of P.LIST) for (const b of m[a]) assert.ok(b < 12 || b > 15, a);
});

test('elegir un botón ocupado: se intercambian, o la otra se queda con el de más, y se avisa', () => {
  const { P } = boot();
  // Abrir cofres a B: Correr (sólo tenía B) pasa a A.
  let r = P.assign(null, 'open', 1);
  assert.equal(r.other, 'run'); assert.equal(r.gave, 0); assert.ok(!r.err);
  let m = P.resolve(r.map);
  assert.deepEqual([...m.open], [1]); assert.deepEqual([...m.run], [0]);
  // Los menús no cuentan: Aceptar sigue en A y Atrás en B.
  assert.deepEqual([...m.ok], [0]); assert.deepEqual([...m.back], [1, 8]);
  // Movimiento Z a LB: Ataque anterior se queda con LT (sin intercambio).
  r = P.assign(r.map, 'zmove', 4);
  assert.equal(r.other, 'prev'); assert.equal(r.gave, null); assert.equal(r.lost, false);
  m = P.resolve(r.map);
  assert.deepEqual([...m.zmove], [4]); assert.deepEqual([...m.prev], [6]);
  // Un ataque sin botón a A (que tiene Correr): Correr se queda sin botón.
  r = P.assign({ open: 1, run: 0 }, 'm1', 0);
  assert.equal(r.other, 'run'); assert.equal(r.lost, true);
  assert.deepEqual([...P.resolve(r.map).run], []);
});

test('Aceptar, Atrás y Pausa nunca se quedan sin botón; la cruceta no se puede elegir', () => {
  const { P } = boot();
  // Cambiar las cartas sin botón y luego a A: Aceptar se quedaría sin nada.
  const r = P.assign({ reroll: null }, 'reroll', 0);
  assert.equal(r.err, 'need'); assert.equal(r.other, 'ok');
  for (const b of [12, 13, 14, 15]) assert.equal(P.assign(null, 'open', b).err, 'dpad');
  assert.equal(P.assign(null, 'nada', 0).err, 'act');
});

test('volver al botón de serie deja de estar elegido (y recupera el de más); Restablecer lo quita todo', () => {
  const { P, settings } = boot();
  let r = P.bind('prev', 10);
  assert.equal(JSON.stringify(settings.padMap), '{"prev":10}');
  assert.deepEqual([...P.map().prev], [10]);
  r = P.bind('prev', 4);
  assert.ok(!r.err);
  assert.equal(settings.padMap, null);
  assert.deepEqual([...P.map().prev], [4, 6]);
  P.bind('zmove', 3); P.bind('m2', 11);
  assert.ok(P.custom);
  P.reset();
  assert.equal(settings.padMap, null); assert.ok(!P.custom);
  // Lo guardado roto (botones repetidos o de la cruceta) no rompe nada.
  settings.padMap = { open: 13, zmove: 0, m1: 0, prev: 'x' };
  const m = P.resolve(settings.padMap);
  assert.deepEqual([...m.zmove], [0]); assert.deepEqual([...m.open], []); assert.deepEqual([...m.m1], []);
  assert.deepEqual([...m.prev], [4, 6]);
});

test('en la partida se usa el mapeo: los botones nuevos hacen la acción y los viejos ya no', () => {
  const b = boot('playing');
  assert.deepEqual(b.tap(4), ['act:prev']);
  assert.deepEqual(b.tap(2), ['act:zmove']);
  assert.deepEqual(b.tap(9), ['key:escape']);
  b.P.bind('zmove', 3); b.P.bind('m1', 10); b.P.bind('prev', 11);
  assert.deepEqual(b.tap(3), ['act:zmove']);
  assert.deepEqual(b.tap(10), ['act:m1']);
  assert.deepEqual(b.tap(11), ['act:prev']);
  assert.deepEqual(b.tap(2), [], 'X ya no es el movimiento Z');
  assert.deepEqual(b.tap(4), [], 'LB ya no es el ataque anterior');
  // Abrir cofres: pulsado (Espacio para saltar la animación y la acción) y mantenido.
  const t = b.tap(0);
  assert.ok(t.includes('key:space') && t.includes('act:open') && t.includes('hold:open'));
  b.P.bind('run', 7);
  b.frame(); b.calls.length = 0; b.frame(7);
  assert.ok(b.calls.includes('hold:run'));
});

test('en los menús: Y cambia las cartas, X descarta, Start cierra; y siguen al mapeo', () => {
  const b = boot('levelup');
  assert.deepEqual(b.tap(3), ['key:keyr']);
  assert.deepEqual(b.tap(2), ['key:keyx']);
  assert.deepEqual(b.tap(9), ['key:escape']);
  // B (Atrás) sin ventana: Esc.
  assert.deepEqual(b.tap(1), ['key:escape']);
  b.P.bind('reroll', 2);   // X → cambiar cartas; Descartar pasa a Y
  assert.deepEqual(b.tap(2), ['key:keyr']);
  assert.deepEqual(b.tap(3), ['key:keyx']);
  // Si Start pasa a ser Aceptar, ya no cierra (no hace las dos cosas).
  b.P.bind('ok', 9);
  assert.ok(!b.tap(9).includes('key:escape'));
});

test('elegir el botón en Ajustes: espera a soltar el que lo ha pedido y no llega al juego', () => {
  const b = boot('ui');
  let got = 'nada';
  b.frame(0);                 // A pulsado (el que abre la espera)
  b.P.grab(x => { got = x; });
  b.calls.length = 0;
  b.frame(0); b.frame(0);     // sigue pulsado: no vale
  assert.equal(got, 'nada');
  b.frame(); b.frame(5);      // suelta y pulsa RB
  assert.equal(got, 5);
  assert.deepEqual(b.calls, [], 'la pulsación no llega al juego');
  // A los 6 s sin pulsar nada, se deja.
  got = 'nada'; b.P.grab(x => { got = x; });
  for (let i = 0; i < 400; i++) b.frame();
  assert.equal(got, null);
});

test('navegación: lo que está en línea va antes que lo de la diagonal, y nada hacia atrás', () => {
  const { P } = boot();
  // La pantalla de entrar: desde «Entrar» (derecha) a la izquierda va «Jugar como invitado», no «¿Olvidaste…?».
  const entrar = [402, 383, 690, 420], invitado = [106, 362, 376, 394], olvido = [397, 350, 505, 364];
  assert.equal(P.pick(entrar, [olvido, invitado], -1, 0), 1);
  // Una rejilla: abajo, la de debajo; a la derecha, la de al lado.
  const g = (c, r) => [c * 110, r * 60, c * 110 + 100, r * 60 + 50];
  const cells = [g(0, 0), g(1, 0), g(0, 1), g(1, 1)];
  assert.equal(P.pick(g(0, 0), cells.slice(1), 0, 1), 1);
  assert.equal(P.pick(g(0, 0), cells.slice(1), 1, 0), 0);
  assert.equal(P.pick(g(0, 0), cells.slice(1), -1, 0), -1);
  assert.equal(P.pick(g(1, 1), cells.slice(0, 3), 0, 1), -1);
  // Sin nada en línea, el más cercano en diagonal.
  assert.equal(P.pick(g(0, 0), [g(1, 1), g(3, 4)], 1, 0), 0);
});

test('nombres de los botones según el mando (Xbox, PlayStation, Switch) y la pista del HUD', () => {
  const b = boot();
  assert.equal(b.P.familyOf('054c-0ce6-Wireless Controller'), 'ps');
  assert.equal(b.P.familyOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)'), 'ps');
  assert.equal(b.P.familyOf('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'), 'nin');
  assert.equal(b.P.familyOf('Xbox 360 Controller (XInput STANDARD GAMEPAD)'), 'xbox');
  assert.equal(b.P.familyOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'), 'xbox');
  b.frame();
  assert.equal(b.P.label('open'), 'A'); assert.equal(b.P.label('prev'), 'LB'); assert.equal(b.P.label('m1'), '');
  assert.match(b.P.glyph('prev', true), /LB.*LT/);
  assert.match(b.P.hint(), /^Stick moverse · LB \/ RB cambiar de ataque · Start pausa$/);
  b.fake.id = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)';
  b.frame(); b.frame(0); b.frame();
  assert.equal(b.P.family, 'ps');
  assert.equal(b.P.label('open'), '✕'); assert.equal(b.P.label('pause'), 'Options');
});

test('la página usa el mapeo: pistas del mando, Ajustes y las teclas siguen a lo suyo', () => {
  const html = source('dev.html'), css = source('css/style.css'), input = source('js/core/input.js');
  for (const a of ['ok', 'reroll', 'discard']) assert.ok(html.includes(`data-pad-act="${a}"`), 'falta la pista de ' + a);
  assert.ok(html.includes('id="pause-pad-hint"'));
  assert.match(css, /body\.pad\s+:is\(\.kbd-hint, \.card \.key\)\s*\{\s*display:\s*none/);
  assert.match(css, /\.pad-hint\s*\{\s*display:\s*none/);
  // El HUD y los avisos piden el botón (keyLabel) jugando con mando; Ajustes > En PC, sólo la tecla.
  assert.match(input, /keyLabel\(a\)\s*\{\s*if \(G\.Pad && G\.Pad\.active/);
  assert.match(input, /hint\(\)\s*\{\s*if \(G\.Pad && G\.Pad\.active\) return G\.Pad\.hint\(\)/);
  const set = source('js/ui/settings-ui.js');
  assert.match(set, /G\.Input\.kbLabel\(a\)/);
  assert.match(set, /data-padbind/); assert.match(set, /set-pad-reset/);
  assert.doesNotMatch(source('js/ui/hud.js'), /Pad\.recent \? 'A'/, 'el cofre ya no pone A fija');
  assert.doesNotMatch(source('js/world/village.js'), /Pulsa A para jugar/);
  // Se guarda con los demás ajustes (de este aparato).
  assert.match(source('js/core/settings.js'), /padMap: null/);
});

test('los textos nuevos del mando tienen su inglés', () => {
  const en = source('js/data/lang-en.js'), { P } = boot();
  const has = k => en.includes(JSON.stringify(k) + ':') || en.includes("'" + k.replace(/'/g, "\\'") + "':");
  const keys = new Set(P.LIST.flatMap(a => [P.ACTS[a].name, P.ACTS[a].s].filter(Boolean)));
  for (const f of ['js/ui/settings-ui.js', 'js/core/gamepad.js', 'js/ui/home-ui.js']) {
    const js = source(f), a = js.indexOf('mando, 21-11-2026');
    assert.ok(a >= 0, f);
    for (const m of js.slice(a).matchAll(/G\.(?:T|I18n\.f)\('([^']+)'/g)) keys.add(m[1]);
  }
  for (const k of ['Pulsa una acción y luego el botón nuevo en el mando. Si otra acción lo usaba, se intercambian.', 'En la partida y en la aldea',
    'En los menús, las cartas y la pausa', 'Restablecer botones', 'Pulsa {x} para jugar']) keys.add(k);
  for (const k of keys) assert.ok(has(k), 'sin inglés: ' + k);
});
