// Templos y santuarios en 3D con zona grande (27-11-2026, el dueño: «los templos y santuarios quiero que sean en 3d y abarquen
// una zona más grande para tener que quedarme en ellos o interactuar con ellos»; eligió: 3D en PC y pixel art con volumen en
// móvil, radio ~220, templo de quedarse con oleadas y que se reinicia al salir, reto y maldito con el botón dentro de la zona).
//  - systems/encounters.js: zonas, carga del templo, oleadas (también en cooperativo), suelo y lo que va en 3D;
//  - systems/interact.js: el botón de reto y maldito en toda su zona;
//  - world/props3d.js: los modelos (three.js de verdad, sin WebGL); assets/pxl: el arte nuevo.
// node --test tests/templos3d.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function load(coop = { active: false, isHost: false }) {
  const said = [], waves = [], sent = [], opened = [];
  const G = {
    U: { pick: a => a[0], clamp: (v, a, b) => Math.max(a, Math.min(b, v)), dist2: (a, b, c, d) => (a - c) ** 2 + (b - d) ** 2, rand: (a, b) => (a + b) / 2 },
    I18n: { f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } }, T: s => s,
    Game: { st: { time: 600 }, player: null, everyone: () => [] },
    Coop: Object.assign({ toHost: m => sent.push(m), broadcast: m => sent.push(m) }, coop), Rift: {}, Judgment: null,
    Reg: { v1: { buy() {}, vitamin() {}, encounter() {} } },
    Audio: { sfx() {} }, FX: { ring() {}, burst() {}, px() {} },
    Spawner: { say: t => said.push(t), challenge: (x, y, n, t, o) => waves.push({ x, y, n, o }) },
    Projectiles: { clearOrbs() {} }, Sprites: { preload() {} },
    EncounterUI: { open: (e, o) => opened.push(o.kind) },
    Fortune: { add() {}, of: () => 0 },
    Companion: { rollEgg: () => ({ dex: 4, r: 1 }) }, PowerBudget: { VIT: {} },
    Camera: { toScreen: () => ({ x: -9999, y: -9999 }), sees: () => true }
  };
  const c = { G, Math, console, performance: { now: () => 0 }, innerWidth: 1280, innerHeight: 720 };
  vm.createContext(c);
  vm.runInContext(source('js/systems/encounters.js'), c, { filename: 'encounters.js' });
  G.Vitamins.offer = () => [{ id: 'hpup', r: 0 }];
  return { G, E: G.Encounters, said, waves, sent, opened };
}
const player = (o = {}) => Object.assign({ x: 0, y: 0, dead: false, frozen: false, bodyH: 30, items: [], moves: [], slots: [] }, o);

test('templo, reto y maldito: zona grande (radio ~220), la misma para jugar y para el bot (p.r), con sus piedras', () => {
  const { E, G } = load();
  assert.ok(E.ZONE_R >= 200 && E.ZONE_R <= 240, 'radio ' + E.ZONE_R);
  G.Game.player = player();
  for (const type of ['temple', 'challenge', 'curse']) {
    assert.equal(E.TYPES[type].zone, E.ZONE_R, type);
    const e = E.debugPlace(type, 0);
    assert.equal(e.zone, E.ZONE_R); assert.equal(e.r, E.ZONE_R, type + ': el bot lee p.r');
    assert.ok(e.ring.length === 12, type + ': 12 piedras sin paredes');
    for (const s of e.ring) assert.ok(Math.abs(Math.hypot(s.x - e.x, s.y - e.y) - E.ZONE_R) < 2, 'en el borde');
  }
  for (const type of ['shop', 'smeargle', 'machine', 'egg']) assert.equal(E.TYPES[type].zone, undefined, type + ': sin zona');
  assert.equal(E.TEMPLE_R, E.ZONE_R); assert.equal(E.CHALLENGE_R, E.ZONE_R);
});

test('templo: se carga quedándote TEMPLE_T s, con oleadas normales desde fuera de la zona; al llenarse, las vitaminas', () => {
  const { E, G, waves, opened } = load();
  const pl = G.Game.player = player();
  const e = E.debugPlace('temple', 150);           // estás dentro (a 150 de su centro)
  let t = 0;
  while (!e.used && t < 30) { E.update(0.1, pl); t += 0.1; G.Game.st.time += 0.1; }
  assert.ok(Math.abs(t - E.TEMPLE_T) < 0.25, 'tarda ' + t.toFixed(1));
  assert.deepEqual(opened, ['temple']);
  assert.equal(waves.length, Math.ceil(E.TEMPLE_T / E.TEMPLE_WAVE), 'una oleada al entrar y una cada ' + E.TEMPLE_WAVE + ' s');
  for (const w of waves) {
    assert.equal(w.o.plain, true, 'sin élite');
    assert.ok(w.o.d[0] > E.ZONE_R, 'salen fuera de la zona');
    assert.ok(w.n >= 3, 'al menos 3');
  }
});

test('templo: si sales a medias vuelve a empezar (y te avisa); sin oleadas fuera', () => {
  const { E, G, waves, said } = load();
  const pl = G.Game.player = player();
  const e = E.debugPlace('temple', 100);
  for (let i = 0; i < 50; i++) E.update(0.1, pl);
  assert.ok(e.charge > 0.3);
  pl.x = -400;                                       // fuera
  E.update(0.1, pl);
  assert.equal(e.charge, 0);
  assert.deepEqual(said, ['Has salido del templo: vuelve a empezar']);
  const n = waves.length;
  for (let i = 0; i < 60; i++) E.update(0.1, pl);
  assert.equal(waves.length, n, 'fuera no salen oleadas');
  assert.equal(said.length, 1, 'el aviso, una vez');
  pl.dead = true; pl.x = 0;
  E.update(0.1, pl);
  assert.equal(e.charge, 0, 'caído no carga');
});

test('templo en cooperativo: el invitado pide la oleada al anfitrión; el anfitrión la crea (una aunque lo carguen dos)', () => {
  const g = load({ active: true, isHost: false });
  const pl = g.G.Game.player = player();
  const e = g.E.debugPlace('temple', 50);
  g.E.update(0.1, pl);
  assert.equal(g.waves.length, 0, 'el invitado no crea enemigos');
  assert.deepEqual(JSON.parse(JSON.stringify(g.sent.at(-1))), ['enc', 'tw', e.id]);
  const h = load({ active: true, isHost: true });
  h.G.Game.player = player({ x: 5000 });
  const he = h.E.debugPlace('temple', -5000);
  h.E.onNet(['enc', 'tw', he.id]);
  h.E.onNet(['enc', 'tw', he.id]);                   // (el otro, en el mismo momento)
  assert.equal(h.waves.length, 1);
  h.G.Game.st.time += h.E.TEMPLE_WAVE;
  h.E.onNet(['enc', 'tw', he.id]);
  assert.equal(h.waves.length, 2);
  h.E.onNet(['enc', 'tw', 999]);
  assert.equal(h.waves.length, 2, 'uno que no existe: nada');
  assert.match(source('js/net/coop.js'), /ev\[1\] === 'tw'/, 'coop.js deja pasar la petición del invitado');
});

test('reto y maldito: el botón sale en cualquier sitio de su zona (interact.js), y no fuera', () => {
  const { E, G } = load();
  G.Game.player = player();
  const ch = E.debugPlace('challenge', 0), cu = E.debugPlace('curse', 0);
  for (const e of [ch, cu]) {
    let list = [e];
    const I = { act: () => false, actHeld: () => false };
    const c = { G: Object.assign({}, G, { Input: I, World: { specialsNear: () => list }, Coop: { active: false, puppets: () => [] }, EnemyMgr: { queryCircle: () => [] }, Encounters: E }), Math, console };
    vm.createContext(c);
    vm.runInContext(source('js/systems/interact.js'), c, { filename: 'interact.js' });
    const pl = player({ r: 12 });
    for (const [d, want] of [[0, true], [E.ZONE_R - 10, true], [E.ZONE_R + 10, false]]) {
      pl.x = e.x + d; pl.y = e.y;
      c.G.Interact.update(1 / 60, pl);
      assert.equal(c.G.Interact.near === e, want, e.type + ' a ' + d);
    }
    e.used = true;
    pl.x = e.x;
    c.G.Interact.update(1 / 60, pl);
    assert.equal(c.G.Interact.near, null, e.type + ' usado: sin botón');
  }
});

test('dibujo: la zona en el suelo sólo mientras sirve; las piedras ordenadas por Y; lo que va en 3D', () => {
  const { E, G } = load();
  G.Game.player = player();
  const t = E.debugPlace('temple', 0), cu = E.debugPlace('curse', 900);
  let arcs = 0;
  const ctx = new Proxy({}, { get: (o, k) => k === 'arc' ? () => arcs++ : k in o ? o[k] : () => {}, set: (o, k, v) => { o[k] = v; return true; } });
  E.drawGround(ctx);
  assert.ok(arcs >= 4, 'las dos zonas');
  const a0 = arcs; cu.used = true; arcs = 0;
  E.drawGround(ctx);
  assert.ok(arcs > 0 && arcs < a0, 'la del usado ya no');
  const d = E.drawables();
  assert.equal(d.length, t.ring.length + cu.ring.length + 2);
  assert.ok(d.every(x => Number.isFinite(x.x) && Number.isFinite(x.y)), 'con x e y (D3 los coloca por sus pies)');
  const m = E.models();
  assert.equal(m.length, d.length);
  assert.deepEqual([...m.filter(x => !x.id.includes('s')).map(x => x.key)].sort(), ['curseU', 'temple']);
  assert.ok(m.filter(x => x.id.startsWith('e' + cu.id + 's')).every(x => x.key === 'zst_u'), 'las piedras del usado, apagadas');
  assert.ok(m.find(x => x.key === 'temple').glow, 'el templo encendido brilla');
  assert.equal(m.find(x => x.key === 'curseU').glow, null);
  assert.deepEqual([...E.keys3d()].sort(), ['curse', 'curseU', 'temple', 'templeU', 'zst_k', 'zst_t', 'zst_u']);
  assert.ok(m.every(x => typeof x.id === 'string'), 'ids de texto: van solos en el orden por Y de ultra3d.js');
});

test('3D: los modelos de templos, santuarios y piedras se hacen con sus atributos y medidas', async () => {
  const THREE = await import(pathToFileURL(path.join(root, 'js/vendor/three/three.module.min.js')).href);
  const g2 = { fillRect() {}, drawImage() {}, getContext() { return this; } };
  const B = { trunk: ['#5b3a22', '#87582f'], leaf: ['#1d5a2c', '#2e7d36'], rock: ['#7a818b', '#a1a8b2'], grass: ['#1f7434'], ground: 'grass', prop: 'tree' };
  const G = { U: { freeCanvas() {} }, Tileset: { pal: () => null }, Tiles: { BIOMES: [B] } };
  const ctx = vm.createContext({ G, Math, document: { createElement: () => ({ width: 1, height: 1, getContext: () => g2 }) } });
  vm.runInContext(source('js/world/props3d.js'), ctx, { filename: 'props3d.js' });
  G.Props3D.init(THREE, false, () => new THREE.Texture(), { time: { value: 0 } });
  for (const k of ['temple', 'templeU', 'shrine', 'shrineU', 'curse', 'curseU', 'zst_t', 'zst_c', 'zst_k', 'zst_u']) {
    const o = G.Props3D.geo(0, k);
    assert.ok(o && o.g && o.hg, k);
    for (const a of ['position', 'normal', 'uv', 'color', 'flex', 'glow']) assert.ok(o.g.attributes[a], k + ': ' + a);
    assert.ok(o.g.attributes.position.array.every(Number.isFinite), k);
    const bb = o.g.boundingBox;
    assert.ok(bb.min.z > -4 && bb.max.z <= o.h + 2 && bb.max.z > o.h * 0.75, k + ': de pie y de su alto (' + bb.max.z.toFixed(1) + ' / ' + o.h + ')');
    assert.ok(Math.max(-bb.min.x, bb.max.x) < o.w * 1.25 + 4, k + ': de su ancho (' + bb.max.x.toFixed(1) + ')');
    const gl = o.g.attributes.glow.array, lit = gl.some(v => v > 0.5);
    assert.equal(lit, !k.endsWith('U') && k !== 'zst_u', k + (lit ? ': brilla' : ': apagado'));
  }
  G.Props3D.free(false);
});

test('arte: pixel art con volumen, más grande que antes (templo ≥ 50 px de arte de ancho), y las 4 piedras', () => {
  const size = f => { const b = fs.readFileSync(path.join(root, 'assets/pxl', f + '.png')); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.ok(size('temple')[0] >= 50 && size('temple')[1] >= 64, 'templo ' + size('temple'));
  for (const f of ['shrine', 'curse']) assert.ok(size(f)[1] >= 60, f + ' ' + size(f));
  for (const f of ['zst_t', 'zst_c', 'zst_k', 'zst_u']) assert.deepEqual(size(f), [14, 22], f);
  const px = source('tools/pxl/encuentros.px.js');
  for (const f of ['zst_t', 'zst_c', 'zst_k', 'zst_u']) assert.match(px, new RegExp('stone\\("' + f + '"'), f + ' en su fuente pxl');
});
