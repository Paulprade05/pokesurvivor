// Cofres con botón (7-11-2026): el normal se abre con una pulsación y ya no se rompe a golpes, el de candado
// manteniendo pulsado; el botón táctil cuenta dedos de verdad y va donde no estorba. Con los archivos de verdad en vm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const run = (ctx, f) => vm.runInContext(source(f), ctx, { filename: f });
const dist2 = (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2;

// ---------------- interact.js ----------------
function bootInteract(props, mates = []) {
  const opened = [], evs = [];
  const input = { pressed: false, held: false };
  const G = {
    U: { dist2 }, Coop: { active: mates.length > 0, isHost: true, puppets: () => mates },
    Audio: { sfx() {} }, Reg: { ev: (...a) => evs.push(a) },
    Input: { act: a => a === 'open' && input.pressed, actHeld: a => a === 'open' && input.held },
    World: { specialsNear: () => props.slice(), breakProp: p => { opened.push(p.type); props.splice(props.indexOf(p), 1); } },
    EnemyMgr: { queryCircle: () => [] }, Spawner: { say() {} }
  };
  run(vm.createContext({ G, Math, Set }), 'js/systems/interact.js');
  return { I: G.Interact, input, opened, evs };
}
const chest = (type, x = 0) => ({ type, x, y: 0, r: type === 'chest' ? 12 : 14, open: 0 });
const pl = (o = {}) => Object.assign({ x: 0, y: 30, r: 14, dead: false, frozen: false }, o);

test('cofre normal: sólo con una pulsación; quedarse al lado o mantener sin pulsar no lo abre', () => {
  const t = bootInteract([chest('chest')]), p = pl();
  t.input.held = true;
  for (let i = 0; i < 300; i++) t.I.update(1 / 30, p);
  assert.equal(t.opened.length, 0);
  assert.equal(t.I.near.type, 'chest');
  t.input.pressed = true;
  t.I.update(1 / 30, p);
  assert.deepEqual(t.opened, ['chest']);
  assert.equal(t.I.near, null, 'el botón se va en cuanto se abre');
  t.I.update(1 / 30, p);
  assert.equal(t.opened.length, 1, 'no se abre dos veces');
  assert.deepEqual(t.evs, [['cofre', 'peq']]);
});

test('cofre con candado: hay que mantener CHEST_TIME; una pulsación suelta no basta y al soltar no se abre', () => {
  const c = chest('bigchest'), t = bootInteract([c]), p = pl(), dt = 1 / 30;
  t.input.pressed = true;
  t.I.update(dt, p);
  t.input.pressed = false;
  assert.equal(c.open, 0, 'pulsar sin mantener no empieza');
  t.input.held = true;
  for (let i = 0; i < 60; i++) t.I.update(dt, p);
  const half = c.open;
  assert.ok(half > 1.9 && half < 2.1);
  t.input.held = false;
  t.I.update(dt, p);
  assert.ok(c.open < half, 'soltar pierde lo hecho poco a poco');
  for (let i = 0; i < 100; i++) t.I.update(dt, p);
  assert.equal(c.open, 0);
  assert.equal(t.opened.length, 0);
  t.input.held = true;
  for (let i = 0; i < 200 && !t.opened.length; i++) t.I.update(dt, p);
  assert.deepEqual(t.opened, ['bigchest']);
  assert.deepEqual(t.evs, [['cofre']], 'una sola vez');
  assert.equal(t.I.near, null);
});

test('alejarse mientras mantienes: se va el aviso, no se abre y el progreso baja', () => {
  const c = chest('bigchest'), t = bootInteract([c]), p = pl(), dt = 1 / 30;
  t.input.held = true;
  for (let i = 0; i < 60; i++) t.I.update(dt, p);
  const was = c.open;
  p.y = 400;
  t.I.update(dt, p);
  assert.equal(t.I.near, null);
  assert.ok(c.open < was);
  for (let i = 0; i < 200; i++) t.I.update(dt, p);
  assert.equal(c.open, 0);
  assert.equal(t.opened.length, 0);
});

test('caído o con la pausa abierta en grupo (frozen): ni botón ni se abre', () => {
  for (const o of [{ dead: true }, { frozen: true }]) {
    const c = chest('chest'), t = bootInteract([c]);
    t.input.pressed = t.input.held = true;
    t.I.update(1 / 30, pl(o));
    assert.equal(t.I.near, null);
    assert.equal(t.opened.length, 0);
  }
});

test('con dos cofres a tiro sólo actúa sobre el más cercano', () => {
  const a = chest('chest', 30), b = chest('chest', -6), left = [a, b], t = bootInteract(left);
  t.input.pressed = true;
  t.I.update(1 / 30, pl());
  assert.equal(t.opened.length, 1);
  assert.deepEqual(left, [a], 'se queda el más lejano');
});

test('en grupo: con un compañero al lado el de candado va más deprisa, pero hay que mantener', () => {
  const c = chest('bigchest'), t = bootInteract([c], [{ x: 5, y: 30, r: 14, dead: false }]), dt = 1 / 30;
  for (let i = 0; i < 30; i++) t.I.update(dt, pl());
  assert.equal(c.open, 0, 'el compañero solo no lo abre desde este ordenador');
  t.input.held = true;
  let n = 0;
  while (!t.opened.length && n < 300) { t.I.update(dt, pl()); n++; }
  assert.ok(n * dt > 2 && n * dt < 2.4, 'unos 2,2 s: ' + n * dt);
});

// ---------------- world.js ----------------
function bootWorld() {
  const G = { sfx: 0 }, drops = [];
  G.U = { clamp: (v, a, b) => (v < a ? a : v > b ? b : v), dist2, rand: a => a, randInt: a => a };
  G.Sprites = { PX: 2 };
  G.Tiles = { T: 16, RAISE: 8, CAP_H: 24, BIOMES: [{ liquid: 'water', grass: ['#0', '#1', '#2'], rock: ['#0', '#1', '#2'] }],
              ARENA_THEMES: { normal: { pillars: 0.05, pools: 0, props: {} }, judgment: { pillars: 0.03, pools: 0, props: {}, clear: 4.5 } } };
  G.Coop = { active: false };
  G.Audio = { sfx() {} };
  G.FX = { burst() {}, ring() {}, spark() {} };
  G.Camera = { kick() {} };
  G.Pickups = { drop: (...a) => drops.push(a), dropXp: (...a) => drops.push(a) };
  G.Items = { roll: () => 'x' };
  vm.runInContext(source('js/world/world.js'), vm.createContext({ G, Math }), { filename: 'world.js' });
  G.World.reset(1234);
  return { W: G.World, drops };
}

test('los ataques no rompen el cofre normal, no se apunta a él y bloquea como el de candado', () => {
  const { W, drops } = bootWorld();
  const c = W.specialsNear(0, 0, 1300).find(p => p.type === 'chest');
  assert.ok(c, 'hay un cofre cerca del inicio');
  assert.equal(c.destructible, false);
  assert.equal(W.damageProp(c, 1e6, '#fff'), false);
  assert.equal(drops.length, 0);
  assert.ok(!W.propsInCircle(c.x, c.y, 40).includes(c), 'los ataques buscan con propsInCircle');
  const b = W.nearestBreakable(c.x, c.y, 60);
  assert.ok(!b || b.type === 'rock');
  assert.ok(W.specialsNear(c.x, c.y, 10).includes(c));
});

test('cooperativo: dos abren el mismo cofre a la vez y el botín sale una vez', () => {
  const { W, drops } = bootWorld();
  const c = W.specialsNear(0, 0, 1300).find(p => p.type === 'chest');
  W.breakProp(c);
  const n = drops.length;
  assert.ok(n > 0);
  W.breakProp(c);                 // el otro, en su ordenador, antes de enterarse
  W.breakAt(c.tx, c.ty);          // y su aviso por la red
  assert.equal(drops.length, n);
  assert.ok(!W.specialsNear(c.x, c.y, 10).includes(c));
});

// ---------------- input.js ----------------
function bootInput(saved = null) {
  const on = {};
  const ctx = {
    addEventListener: (ev, fn) => { (on[ev] = on[ev] || []).push(fn); },
    navigator: {}, performance: { now: () => 0 }, Object, Set, Array, Math, RegExp, JSON
  };
  const G = { Settings: { get: k => (k === 'keys' ? saved : undefined), on() {} }, U: { norm: (x, y) => [x, y] } };
  ctx.G = G;
  run(vm.createContext(ctx), 'js/core/input.js');
  const key = (ev, c) => on[ev].forEach(f => f({ code: c, target: null, preventDefault() {} }));
  return { I: G.Input, G, key };
}

test('tecla: la F abre, se puede cambiar y no choca con ninguna de serie', () => {
  const { I, key } = bootInput();
  assert.equal(I.keyLabel('open'), 'F');
  for (const a of ['m1', 'm2', 'm3', 'm4', 'prev', 'next', 'pause', 'zmove']) assert.notEqual(I.keyLabel(a), 'F');
  key('keydown', 'KeyF');
  assert.ok(I.act('open') && I.actHeld('open'));
  I.endFrame();
  assert.ok(!I.act('open'), 'la pulsación dura un fotograma');
  assert.ok(I.actHeld('open'), 'mantener sigue');
  key('keyup', 'KeyF');
  assert.ok(!I.actHeld('open'));
  assert.equal(bootInput({ open: 'keyg' }).I.keyLabel('open'), 'G');
});

test('mando y bot: virtualAct y virtualHold duran un fotograma; el botón táctil cuenta como mantenido', () => {
  const { I, G } = bootInput();
  I.virtualAct('open'); I.virtualHold('open');
  assert.ok(I.act('open') && I.actHeld('open'));
  I.endFrame();
  assert.ok(!I.act('open') && !I.actHeld('open'));
  G.Touch = { held: a => a === 'open' };
  assert.ok(I.actHeld('open'));
});

// ---------------- touch.js ----------------
function bootTouch() {
  const win = {}, doc = {}, cvOn = {};
  const reg = o => (ev, fn) => { (o[ev] = o[ev] || []).push(fn); };
  const cv = { addEventListener: reg(cvOn), clientWidth: 800, clientHeight: 400, setPointerCapture() {} };
  const ctx = {
    addEventListener: reg(win), innerWidth: 800, innerHeight: 400, performance: { now: () => 0 }, Math, Map, Set, Array, Object,
    document: { body: { classList: { add() {}, toggle() {} } }, addEventListener: reg(doc) }
  };
  ctx.G = { Settings: { touch: true, get: () => undefined }, Game: { state: 'playing' } };
  run(vm.createContext(ctx), 'js/core/touch.js');
  const T = ctx.G.Touch;
  T.init(cv);
  let pressed = 0;
  T.addButton(100, 100, 50, 50, () => pressed++, 0, 'open');
  const e = (o) => Object.assign({ cancelable: true, preventDefault() {}, isTrusted: true }, o);
  const f = (id, x = 110, y = 110) => ({ identifier: id, clientX: x, clientY: y });
  return {
    T, count: () => pressed,
    touchstart: (ch, all = ch) => { doc.touchstart.forEach(h => h(e({ touches: all, changedTouches: ch }))); cvOn.touchstart.forEach(h => h(e({ touches: all, changedTouches: ch }))); },
    touchend: (ch, all = []) => doc.touchend.forEach(h => h(e({ touches: all, changedTouches: ch }))),
    pointer: (ev, id, type = 'touch', x = 110, y = 110) => (ev === 'down' ? cvOn.pointerdown : win['pointer' + ev]).forEach(h => h(e({ pointerId: id, pointerType: type, clientX: x, clientY: y }))),
    f
  };
}

test('botón mantenido: mismo toque por pointerdown y touchstart, una pulsación y soltar lo suelta', () => {
  const t = bootTouch();
  t.pointer('down', 7);
  t.touchstart([t.f(1)]);
  assert.equal(t.count(), 1, 'un mismo toque se pulsa una vez');
  assert.ok(t.T.held('open'));
  t.pointer('up', 7);
  assert.ok(t.T.held('open'), 'el dedo sigue: manda touchend');
  t.touchend([t.f(1)]);
  assert.ok(!t.T.held('open'));
});

test('iPhone: con otro dedo en el joystick y sin pointerup, al levantar el dedo se suelta', () => {
  const t = bootTouch();
  t.touchstart([t.f(1)]);
  t.touchstart([t.f(2, 10, 300)], [t.f(1), t.f(2, 10, 300)]);
  assert.ok(t.T.held('open'));
  t.touchend([t.f(1)], [t.f(2, 10, 300)]);
  assert.ok(!t.T.held('open'));
});

test('ratón: se mantiene hasta soltar; perder la ventana también suelta', () => {
  const t = bootTouch();
  t.pointer('down', 1, 'mouse');
  assert.ok(t.T.held('open'));
  t.pointer('up', 1, 'mouse');
  assert.ok(!t.T.held('open'));
  t.pointer('down', 1, 'mouse');
  t.T.reset();
  assert.ok(!t.T.held('open'));
});

// ---------------- hud.js: dónde va el botón ----------------
function bootHud(pad = {}, stickMode = 'fixed', stick = [0, 0], R = 46) {
  const G = {
    Settings: { get: k => (k === 'stickMode' ? stickMode : undefined) },
    Touch: { safeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }), spot: k => pad[k] || null,
             stickBase: () => ({ x: stick[0], y: stick[1] }), R: () => R },
    U: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) }
  };
  const ctx = { G, Math, performance: { now: () => 0 }, document: { fonts: { add() {} } } };
  run(vm.createContext(ctx), 'js/ui/hud.js');
  return G.HUD;
}
const overlapBar = (H, q, w, h, c) => {
  const D = H.pads(w, h), s = H.openSize(w, h), bw = 6 * D.S + 3 * D.GAP + 2 * D.IG;
  return Math.abs(q[0] - c[0]) < bw / 2 + s / 2 && q[1] + s / 2 > c[1] - D.S / 2 - 40 && q[1] - s / 2 < c[1] + D.S / 2;
};

test('botón táctil, de serie: tumbado abajo a la derecha; de pie encima de la barra; sin tocar barra, pausa ni joystick', () => {
  for (const [w, h] of [[844, 390], [568, 320], [1024, 768], [390, 844], [320, 568]]) {
    const st = h > w ? [w / 2, h * 0.72] : [80, h - 90], H = bootHud({}, 'fixed', st);
    const q = H.padDefault('open', w, h), s = H.openSize(w, h);
    assert.ok(q[0] - s / 2 >= 0 && q[0] + s / 2 <= w && q[1] - s / 2 >= 0 && q[1] + s / 2 <= h, w + 'x' + h + ' dentro');
    assert.ok(!overlapBar(H, q, w, h, H.padDefault('bar', w, h)), w + 'x' + h + ' barra');
    const pa = H.padDefault('pause', w, h);
    assert.ok(Math.hypot(q[0] - pa[0], q[1] - pa[1]) > s / 2 + 20, w + 'x' + h + ' pausa');
    assert.ok(Math.hypot(q[0] - st[0], q[1] - st[1]) > s / 2 + 46, w + 'x' + h + ' joystick');
    assert.ok(q[0] > w / 2, 'a la derecha: el pulgar que no mueve');
  }
});

test('botón táctil: si el jugador puso la barra o el joystick en su sitio, busca otro', () => {
  const w = 844, h = 390;
  const H = bootHud({ bar: [0.8, 0.9] }, 'float');
  const q = H.padDefault('open', w, h);
  assert.ok(!overlapBar(H, q, w, h, [0.8 * w, 0.9 * h]));
  const H2 = bootHud({}, 'fixed', [w - 80, h - 90]);
  const q2 = H2.padDefault('open', w, h);
  assert.ok(Math.hypot(q2[0] - (w - 80), q2[1] - (h - 90)) > 58 / 2 + 46);
});

// ---------------- textos ----------------
test('textos: en español e inglés y ninguna ayuda dice que el cofre se rompe a golpes', () => {
  const en = source('js/data/lang-en.js');
  for (const t of ['Abrir', 'Mantén', 'Mantén para abrir', 'Abrir cofre', 'abrir cofres (el de candado, mantén pulsado)']) {
    assert.ok(en.includes("'" + t + "':"), t);
  }
  for (const f of ['js/ui/compendium-ui.js', 'js/ui/settings-ui.js', 'js/data/items.js', 'js/data/missions.js']) {
    assert.ok(!/(romp|rompe|golpe)[^.\n]{0,30}cofre|cofre[^.\n]{0,30}(rompe|romper|a golpes)/i.test(source(f)), f);
  }
});
