// La aldea del menú (js/data/village.js, js/world/village.js): se llega a todas las puertas, cada sitio abre su pantalla,
// el desplegable lo tiene todo, sin WebGL sale el menú clásico y los textos van también en inglés.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function data() {
  const c = vm.createContext({ G: {}, Math });
  vm.runInContext(read('js/data/village.js'), c);
  return c.G.VILLAGE;
}

/** Carga village.js con una página de mentira. gl: ¿hay WebGL? */
function load({ gl = true, v3 = null, tiles = false, three = false } = {}) {
  const calls = [];
  const els = {};
  const el = id => els[id] || (els[id] = {
    id, classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, toggle(c, on) { if (on === undefined) on = !this.s.has(c); on ? this.s.add(c) : this.s.delete(c); return on; }, contains(c) { return this.s.has(c); } },
    dataset: {}, style: {}, setAttribute() {}, textContent: '', innerHTML: '', querySelectorAll: () => [], querySelector: () => null, contains: () => false,
    click() { calls.push('click:' + id); }
  });
  const classicBtn = go => ({ click: () => calls.push('classic:' + go) });
  const document = {
    getElementById: el,
    querySelector(sel) {
      const m = sel.match(/data-go="([a-z]+)"/);
      if (m) return classicBtn(m[1]);
      return null;
    },
    querySelectorAll: () => [],
    createElement: () => ({ getContext: () => (gl ? { getExtension: () => null } : null) }),
    head: { appendChild() {} }, activeElement: null
  };
  const G = {
    VILLAGE: data(),
    UI: { isOpen: id => id === 'scr-menu', svg: () => '' },
    Audio: { sfx() {} },
    GoalsUI: { open: t => calls.push('goals:' + t) },
    HomeUI: { open: () => calls.push('home:open') },
    Tileset: { enabled: () => true, ready: () => tiles, preload() {} },
    Settings: { fx: 2 },
    Game: { state: 'ui' },
    T: s => s, U: { damp: (a, b) => b, pick: a => a[0] },
    Village3D: v3 || { probe: () => gl, started: false, ready: false, free() {} },
    MenuUI: {}
  };
  const ctx = vm.createContext({ G, document, location: { search: '', protocol: 'http:' }, addEventListener() {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, console: { warn() {}, log() {} }, Math, JSON, window: three ? { PS_THREE: {} } : {}, sessionStorage: { getItem: () => null, setItem() {} },
    localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 0 }, innerWidth: 1280, innerHeight: 720 });
  vm.runInContext(read('js/world/village.js'), ctx);
  return { V: G.Village, G, calls, el };
}

test('aldea: plano del tamaño justo y con setos alrededor', () => {
  const V = data(), b = V.build();
  assert.equal(b.terr.length, V.W * V.H);
  for (let x = 0; x < V.W; x++) { assert.equal(V.terrainAt(x, 0), 1); assert.equal(V.terrainAt(x, V.H - 1), 1); }
  assert.equal(V.terrainAt(-1, 5), 1, 'fuera del plano: seto');
  assert.equal(V.terrainAt(V.SPAWN[0], V.SPAWN[1]), 0, 'se aparece en suelo');
});

test('aldea: se llega andando a todas las puertas desde donde se aparece', () => {
  const V = data(), W = V.W, H = V.H;
  // Casillas que no se pueden pisar: setos, agua y las plantas de los sitios.
  const solid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (V.terrainAt(x, y)) solid[y * W + x] = 1;
    for (const p of V.PLACES) if (x + 0.5 > p.x - p.w / 2 && x + 0.5 < p.x + p.w / 2 && y + 0.5 > p.y - p.h / 2 && y + 0.5 < p.y + p.h / 2) solid[y * W + x] = 1;
  }
  const seen = new Uint8Array(W * H), q = [[Math.floor(V.SPAWN[0]), Math.floor(V.SPAWN[1])]];
  seen[q[0][1] * W + q[0][0]] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, i = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[i] || solid[i]) continue;
      seen[i] = 1; q.push([nx, ny]);
    }
  }
  for (const p of V.PLACES) {
    const i = Math.floor(p.door[1]) * W + Math.floor(p.door[0]);
    assert.ok(seen[i], 'se llega a la puerta de ' + p.name);
  }
});

test('aldea: cada sitio abre su pantalla, como el menú clásico', () => {
  const { V, calls } = load();
  const want = { play: 'classic:play', dex: 'classic:dex', upgrades: 'classic:upgrades', shop: 'classic:shop', bag: 'classic:bag', gacha: 'classic:gacha',
    friends: 'classic:friends', rank: 'classic:rank', compendium: 'classic:compendium', goals: 'goals:missions', ach: 'goals:ach', home: 'home:open',
    settings: 'click:btn-settings', news: 'click:btn-news' };
  const gos = V.places().map(p => p.go);
  assert.deepEqual([...gos].sort(), Object.keys(want).sort(), 'un sitio por apartado del menú');
  for (const g of gos) {
    calls.length = 0;
    assert.equal(V.go(g), true, g);
    assert.deepEqual(calls, [want[g]], g);
  }
  assert.equal(V.go('nada'), false);
  // El perfil ya no es un sitio (tu choza se personaliza), pero sigue en el desplegable.
  calls.length = 0;
  assert.equal(V.go('profile'), true);
  assert.deepEqual(calls, ['goals:profile']);
});

test('aldea: el desplegable «Ir a…» tiene todos los sitios, con Jugar el primero', () => {
  const { V } = load();
  assert.equal(V.ORDER[0], 'play');
  assert.deepEqual([...V.ORDER].sort(), V.places().map(p => p.go).concat('profile').sort());
});

test('aldea: sin WebGL, el menú clásico (y sin pedir three.js)', () => {
  const { V, el } = load({ gl: false });
  assert.equal(V.wanted(), false);
  V.show();
  assert.equal(el('scr-menu').classList.contains('village'), false);
  assert.equal(V.active, false);
  assert.equal(V.mode, 'classic');
  // Con WebGL sí se intenta; mientras carga, el velo del título (nunca el menú clásico por debajo).
  const b = load({ gl: true });
  assert.equal(b.V.wanted(), true);
  b.V.show();
  assert.equal(b.V.mode, 'loading');
  assert.equal(b.el('vil-loading').classList.contains('hidden'), false);
  assert.equal(b.el('scr-menu').classList.contains('village'), true, 'el clásico no se ve');
});

test('aldea: el actualizador sigue igual (fuera de partida) y espera también en la Tienda Kecleon', () => {
  const src = read('js/core/updater.js');
  assert.match(src, /'scr-gacha', 'scr-upgrades', 'scr-shop', 'scr-settings'/);
  assert.match(src, /G\.Game\.state !== 'ui'/);
  // La aldea suelta su WebGL al empezar la partida y game.js la dibuja sólo en el menú.
  const g = read('js/game.js');
  assert.match(g.slice(g.indexOf('function startRun')), /G\.Village\.sleep\(\)/);
  assert.match(g, /state === 'ui' && G\.Village && G\.Village\.frame\(/);
  // Al volver de la partida, el aviso de «contexto perdido» del lienzo que se soltó no tumba la aldea nueva.
  const v3 = read('js/world/village3d.js');
  assert.match(v3, /if \(c === glcv\) lost = true/);
  assert.match(v3.slice(v3.indexOf('function start('), v3.indexOf('function start(') + 400), /lost = false/);
});

test('aldea: al acabar la partida se vuelve a la aldea (fallo del dueño: «te lleva al menú antiguo»)', () => {
  // Todos los finales (morir, ganar, salir desde la pausa; en grupo, al salir de la sala) acaban en MenuUI.open → Village.show.
  const g = read('js/game.js'), m = read('js/ui/menu.js');
  const flow = g.slice(g.indexOf('G.Flow = {'));
  assert.ok(g.includes('() => { pl = null; G.Flow.afterRun(); }'), 'el resumen termina en Flow.afterRun');
  assert.ok(flow.slice(flow.indexOf('afterRun()')).includes('this.goMenu()'));
  assert.ok(flow.slice(flow.indexOf('goMenu()'), flow.indexOf('afterRun()')).includes('G.MenuUI.open()'));
  const open = m.slice(m.indexOf('  function open() {'));
  assert.ok(open.slice(0, open.search(/\r?\n  \}\r?\n/)).includes('G.Village.show()'), 'MenuUI.open termina en la aldea');
  // Si rehacer la aldea falla al volver (sin memoria en el iPhone, contexto perdido), se reintenta con el velo del título:
  // nada de menú clásico hasta el cuarto fallo seguido.
  let builds = 0;
  const v3 = { probe: () => true, started: false, ready: false, start() { this.started = true; }, build() { builds++; return 'sin lienzo'; }, free() { this.started = false; } };
  const { V, el } = load({ gl: true, v3, tiles: true, three: true });
  for (let k = 1; k <= 3; k++) {
    V.show();
    assert.equal(builds, k);
    assert.equal(V.mode, 'loading', 'intento ' + k + ': el velo, no el clásico');
    assert.equal(el('vil-loading').classList.contains('hidden'), false);
    assert.equal(el('scr-menu').classList.contains('village'), true);
    assert.equal(V.failed, '');
  }
  V.show();
  assert.equal(V.mode, 'classic', 'si sigue fallando, el clásico (respaldo)');
  assert.equal(el('vil-loading').classList.contains('hidden'), true);
});

test('aldea: el aviso tardío de «contexto perdido» del lienzo soltado no tumba la aldea rehecha', () => {
  const handlers = [];
  const canvas = () => { const c = { width: 0, height: 0, on: {}, addEventListener(t, fn) { this.on[t] = fn; } }; handlers.push(c); return c; };
  const T = { WebGLRenderer: function () { return { setPixelRatio() {}, setClearColor() {}, shadowMap: {}, dispose() {}, forceContextLoss() {} }; }, BasicShadowMap: 0 };
  const ctx = vm.createContext({ G: { U: { IOS: false, freeCanvas() {} }, Settings: { fx: 2 }, VILLAGE: data() }, document: { createElement: canvas }, location: { search: '' }, console: { warn() {} }, Math, JSON, setTimeout: () => 0 });
  vm.runInContext(read('js/world/village3d.js'), ctx);
  const V3 = ctx.G.Village3D;
  V3.start(T);
  const old = handlers[0];
  V3.free();                         // al empezar la partida
  V3.start(T);                       // al volver
  old.on.webglcontextlost({ preventDefault() {} });   // llega tarde el aviso del lienzo viejo
  assert.equal(V3.lost, false);
  handlers[1].on.webglcontextlost({ preventDefault() {} });   // el de ahora sí cuenta
  assert.equal(V3.lost, true);
  V3.free(); V3.start(T);
  assert.equal(V3.lost, false, 'al empezar de nuevo, sin perder');
});

test('aldea: la pantalla del título espera a la aldea (carga directa) y boot.js no ofrece recargar mientras', async () => {
  const g = read('js/game.js'), b = read('js/boot.js');
  const boot = g.slice(g.indexOf('G.Flow = {'), g.indexOf('tapToStart(then)'));
  assert.match(boot, /G\.Village\.prepare\(\)\.then\(go, go\)/);
  assert.ok(boot.indexOf("el.classList.add('hidden')") > boot.indexOf('const go = ()'), 'el título se quita dentro de go');
  assert.match(b, /el\.dataset && el\.dataset\.wait/);
  // Sin WebGL, prepare termina enseguida (false) y se sigue con el menú clásico.
  const { V } = load({ gl: false });
  assert.equal(await V.prepare(), false);
});

test('aldea: todos los textos también en inglés', () => {
  const V = data(), en = read('js/data/lang-en.js');
  const all = new Set(['Ir a', 'Ir a…', 'Hablar', 'A tu sala', 'Preparando la aldea…', 'Tu perfil', ...V.FOLLOW, ...V.BYE]);
  // Tu choza (data/home.js, ui/home-ui.js y las frases de la mascota en village.js).
  const hc = vm.createContext({ G: {} });
  vm.runInContext(read('js/data/home.js'), hc);
  for (const c of hc.G.Home.CATS) { all.add(c.name); for (const it of c.items) { all.add(it.name); all.add(it.desc); } }
  for (const m of read('js/ui/home-ui.js').matchAll(/G\.T\('([^']+)'\)/g)) all.add(m[1]);
  for (const m of read('js/world/village.js').match(/lines: \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)) all.add(m[1]);
  for (const p of V.PLACES) { all.add(p.name); all.add(p.act); all.add(p.sub); if (p.npc) p.npc.lines.forEach(l => all.add(l)); }
  for (const c of V.CAST) c.lines.forEach(l => all.add(l));
  const has = s => s === '...' || en.includes(JSON.stringify(s)) || en.includes("'" + s.replace(/'/g, "\\'") + "'");
  const miss = [...all].filter(s => !has(s));
  assert.deepEqual(miss, []);
});
