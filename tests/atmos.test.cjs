// Ambientación (js/world/atmos.js): la niebla no tapa el peligro, Bajo no paga nada por fotograma y el vigilante no se deja engañar.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** Carga atmos.js con un lienzo de mentira que cuenta lo que se pinta. */
function load(fx, biome = 0) {
  const calls = { draw: 0, fill: 0, canvases: 0 };
  const g2d = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
  const G = {
    Settings: { fx },
    Tiles: { ARENA: 3, ARENA_TYPES: ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy', 'judgment'] },
    Anim: { dt: 0.016, now: 10, on: true },
    World: { biome },
    Weather: { vignette: 0 },
    Game: { state: 'playing', st: { time: 60 } },
    U: { freeCanvas() {} }
  };
  const document = { createElement: () => { calls.canvases++; return { getContext: () => g2d }; } };
  const c = vm.createContext({ G, document, Math, Map, Uint8Array, Float32Array, parseInt });
  vm.runInContext(read('js/world/atmos.js'), c);
  const ctx = { imageSmoothingEnabled: false, globalAlpha: 1, drawImage() { calls.draw++; }, fillRect() { calls.fill++; } };
  const view = { left: () => -480, top: () => -270, w: 960, h: 540 };
  return { G, A: G.Atmos, ctx, view, calls };
}

test('atmósfera: todos los mapas tienen su tono', () => {
  const { G, A } = load(2);
  for (let bi = 0; bi < 3 + G.Tiles.ARENA_TYPES.length; bi++) {
    const m = A.mood(bi);
    assert.ok(m.mist && m.dark && m.edge && m.lit, 'bioma ' + bi);
    assert.ok(m.mist[1] <= 0.32, 'niebla suave, bioma ' + bi);
    assert.ok(m.edge[3] <= 0.42, 'viñeta que no se come los bordes, bioma ' + bi);
  }
  assert.notEqual(A.mood(0), A.mood(1));
  assert.equal(A.mood(4), A.MOODS.fire);
});

test('atmósfera: la niebla va debajo de todo lo que importa', () => {
  const src = read('js/game.js');
  const a = src.slice(src.indexOf('function drawScene'));
  for (const after of ['G.Hazards.draw(ctx)', 'G.Combat.drawGroundFields(ctx)', 'G.Pickups.draw(ctx)', 'items.sort']) assert.ok(a.indexOf('G.Atmos.ground(ctx, cam)') < a.indexOf(after), after);
  const u = src.slice(src.indexOf('G.Ambient.ground(gx, view)'));
  for (const after of ['G.Hazards.draw(gx)', 'G.Combat.drawGroundFields(gx)', 'G.Pickups.draw(gx)']) assert.ok(u.indexOf('G.Atmos.ground(gx, view)') < u.indexOf(after), 'Ultra: ' + after);
  assert.doesNotMatch(src.slice(src.indexOf('function render()')), /G\.Atmos\.ground/, 'nada de niebla encima de la escena');
});

test('atmósfera: Bajo no dibuja nada por fotograma', () => {
  const { A, ctx, view, calls } = load(0);
  for (let i = 0; i < 90; i++) A.ground(ctx, view);
  assert.deepEqual(calls, { draw: 0, fill: 0, canvases: 0 });
});

test('atmósfera: dos lienzos pequeños, siempre los mismos, y más capas cuanta más calidad', () => {
  const count = fx => {
    const { A, ctx, view, calls } = load(fx);
    for (let i = 0; i < 300; i++) A.ground(ctx, view);
    calls.draw = 0;
    A.ground(ctx, view);
    assert.equal(calls.canvases, 2, 'calidad ' + fx);
    return calls.draw;
  };
  const mid = count(1), high = count(2);
  assert.ok(mid > 0 && high > mid, `medio ${mid}, alto ${high}`);
  assert.ok(high <= 12, 'como mucho 12 drawImage, hay ' + high);
});

test('atmósfera: sin memoria de lienzos no insiste ni pinta negro', () => {
  const { G, A, ctx, view, calls } = load(2);
  void G;
  const orig = ctx.drawImage;
  ctx.drawImage = orig;
  for (let i = 0; i < 5; i++) A.ground(ctx, view);
  A.purge();
  const before = calls.canvases;
  A.ground(ctx, view);
  assert.ok(calls.canvases >= before, 'se rehace tras soltarla');
});

test('vigilante: mira el suelo antes de la niebla y con niebla encima sigue detectando el negro', () => {
  const src = read('js/game.js');
  const a = src.slice(src.indexOf('function drawScene'));
  assert.ok(a.indexOf('watchFloor(ctx, cv)') < a.indexOf('G.Atmos.ground(ctx, cam)'));
  const u = src.slice(src.indexOf('G.Ambient.ground(gx, view)'));
  assert.ok(u.indexOf('watchFloor(gx, gcv)') < u.indexOf('G.Atmos.ground(gx, view)'));
  assert.match(src, /if \(seen === 'ok' && bwFloor && bwFloor !== 'ok'\) seen = bwFloor;/);
});
