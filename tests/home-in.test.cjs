// El interior de tu choza (17-11-2026, data/home.js + world/home-in.js): lo que se guarda (save.hin), la migración de las
// partidas de antes, la limpieza al cargar, los muebles (poner, mover, voltear, quitar), los invitados y la fusión entre
// aparatos (core/db.js). node --test tests/home-in.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function boot() {
  const store = {};
  const ctx = {
    G: {}, console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } },
    location: { protocol: 'file:', hostname: '', href: 'file:///x', search: '' },
    navigator: { onLine: true, language: 'es' },
    document: { addEventListener() {}, visibilityState: 'visible', hidden: false },
    addEventListener() {}, removeEventListener() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/core/db.js', 'js/data/shop.js', 'js/data/home.js']) vm.runInContext(source(f), ctx, { filename: f });
  return ctx.G;
}
const G = boot();
const H = G.Home;
const plain = o => JSON.parse(JSON.stringify(o));
const migrateOf = s => G.DB.migrate(plain(s), 't');
function withSave(save) { Object.defineProperty(G.DB, 'save', { get: () => save, configurable: true }); G.DB.commit = () => {}; return save; }
const OLD = { v: 3, name: 'viejo', coins: 500, owned: { 25: { at: 1 }, 6: { at: 1 }, 9: { at: 1 } }, partner: 25, stats: {} };

test('interior: catálogo con precios del dueño (1000-10000), lo primero gratis y cada mueble con su dibujo', () => {
  for (const c of H.IN_CATS) {
    for (const it of c.items) assert.ok(it.price === 0 || (it.price >= 1000 && it.price <= 10000), c.id + ':' + it.id);
    assert.equal(c.items[0].price, 0, 'la primera de ' + c.id + ' es la de serie');
    assert.equal(new Set(c.items.map(i => i.id)).size, c.items.length);
  }
  // Las categorías de fuera no cambian (la tienda de fuera sigue igual).
  assert.deepEqual(Object.keys(H.BY).sort(), ['color', 'deco', 'lights', 'pet', 'roof', 'shape', 'totem', 'walls']);
  const art = source('js/world/home-in.js');
  for (const it of H.IN_BY.furn.items) {
    assert.ok(new RegExp('\\b' + it.id + ': \\[').test(art), 'sin dibujo en home-in.js ART: ' + it.id);
    assert.ok(it.wall ? it.w >= 1 && !it.h : it.w >= 1 && it.h >= 1, 'tamaño de ' + it.id);
  }
  assert.ok(fs.existsSync(path.join(root, 'assets/pxl/chozain.png')), 'falta el atlas (tools/pxl/choza.px.js)');
  assert.ok(source('tools/pxl/choza.px.js').includes('sprite("chozain"'));
  // La habitación de serie cabe entera y deja la puerta libre.
  const d = H.defaultRoom({});
  d.items.forEach((o, i) => assert.ok(H.fits(d.items, o.id, o.x, o.y, i), 'no cabe ' + o.id));
});

test('interior: una partida vieja (sin hin) recibe la habitación de serie al cargar; su mascota pasa a vivir dentro', () => {
  const m = migrateOf(OLD);
  assert.equal(m.hin.v, 1);
  assert.equal(m.hin.floor, 'wood'); assert.equal(m.hin.wall, 'wood');
  assert.deepEqual(plain(m.hin.items), plain(H.DEFAULT_ITEMS));
  assert.deepEqual(plain(m.hin.guests), [], 'sin mascota, sin invitados');
  // Con cojín y mascota en la puerta: la mascota vive también dentro.
  const withPet = migrateOf(Object.assign({}, OLD, { hown: { 'pet:bed': 7 }, hset: { pet: 6, at: 3 } }));
  assert.deepEqual(plain(withPet.hin.guests), [6]);
  assert.equal(withPet.hset.pet, 6, 'la mascota sigue en su cojín');
  // Una mascota que ya no tienes no se muda.
  const gone = migrateOf(Object.assign({}, OLD, { hset: { pet: 150 } }));
  assert.deepEqual(plain(gone.hin.guests), []);
  // La migración no se repite: lo que ya tienes no se pisa.
  const again = migrateOf(Object.assign({}, OLD, { hin: { v: 1, floor: 'wood', wall: 'wood', items: [], guests: [9], at: 5 } }));
  assert.deepEqual(plain(again.hin.items), []);
  assert.deepEqual(plain(again.hin.guests), [9]);
  // Sin guardar nada, room() da la de serie (y no toca la partida).
  const bare = { owned: {} };
  assert.deepEqual(plain(H.room(bare).items), plain(H.DEFAULT_ITEMS));
  assert.equal(bare.hin, undefined);
});

test('interior: lo guardado se limpia (muebles que no existen, fuera, encima de otro, tapando la puerta, de más; invitados raros)', () => {
  const items = [
    { id: 'bed', x: 0, y: 0 }, { id: 'castillo', x: 4, y: 0 }, { id: 'table', x: 11, y: 0 },      // no existe / se sale
    { id: 'table', x: 1, y: 1 },                                                                  // encima de la cama
    { id: 'rug', x: 0, y: 0 },                                                                    // lo plano, debajo: vale
    { id: 'chest', x: 5, y: 6 },                                                                  // tapa la puerta
    { id: 'cushion', x: 6, y: 6 },                                                                // plano en la puerta: vale
    { id: 'window', x: 3, y: 2 }, { id: 'window', x: 3, y: -1 }, { id: 'painting', x: 3, y: -1 },  // de pared: en la pared y sin pisarse
    { id: 'lamp', x: 9, y: 0 }, { id: 'lamp', x: 9, y: 1 }, { id: 'lamp', x: 9, y: 2 }, { id: 'lamp', x: 9, y: 3 },   // la 4.ª sobra
    { id: 'plant', x: 'a', y: 2 }, null, 'x', { id: 'stool', x: 2.6, y: 4.2, f: 'sí' }
  ];
  const m = migrateOf(Object.assign({}, OLD, { hin: { v: 9, floor: 'oro', wall: 'roots', items, guests: [9, 9, '6', 150, -1, 'x', 25], at: 'ayer', raro: 1 } }));
  const h = m.hin;
  assert.equal(h.v, 1); assert.equal(h.at, 0); assert.equal(h.raro, undefined);
  assert.equal(h.floor, 'wood', 'un suelo que no existe → el de serie');
  assert.equal(h.wall, 'roots', 'una pared que existe se guarda (aunque se vea la de serie si no es tuya)');
  assert.equal(H.room(m).wall, 'wood', 'la pared que no es tuya se ve como la de serie');
  assert.deepEqual(plain(h.items), [
    { id: 'bed', x: 0, y: 0, f: 0 }, { id: 'rug', x: 0, y: 0, f: 0 }, { id: 'cushion', x: 6, y: 6, f: 0 }, { id: 'window', x: 3, y: -1, f: 0 },
    { id: 'lamp', x: 9, y: 0, f: 0 }, { id: 'lamp', x: 9, y: 1, f: 0 }, { id: 'lamp', x: 9, y: 2, f: 0 }, { id: 'stool', x: 3, y: 4, f: 1 }]);
  assert.deepEqual(plain(h.guests), [9, 6, 25], 'sin repetir, tuyos y como números');
});

test('interior: muebles — comprar, poner donde cabe, mover, voltear y quitar; la puerta siempre libre', () => {
  const s = withSave(migrateOf(Object.assign({}, OLD, { coins: 6000 })));
  assert.equal(H.place('sofa', 4, 4).ok, false, 'lo que no es tuyo no se pone');
  assert.equal(H.buy('furn', 'sofa').ok, true);
  assert.equal(s.coins, 2500);
  assert.equal(H.buy('furn', 'sofa').ok, false, 'se compra una vez');
  assert.equal(H.place('sofa', 4, 6).ok, false, 'tapando la puerta, no');
  assert.equal(H.place('sofa', 11, 4).ok, false, 'saliéndose, no');
  assert.equal(H.place('sofa', 7, 2).ok, false, 'encima de la mesa, no');
  assert.equal(H.place('sofa', 4, 4).ok, true);
  const i = H.room().items.findIndex(o => o.id === 'sofa');
  assert.ok(s.hin.at > 0, 'se apunta cuándo');
  assert.equal(H.move(i, 0, 0), false, 'a la cama, no');
  assert.equal(H.move(i, 2, 5), true);
  assert.deepEqual([H.room().items[i].x, H.room().items[i].y], [2, 5]);
  assert.equal(H.flip(i), true); assert.equal(H.room().items[i].f, 1);
  assert.equal(H.remove(i), true);
  assert.equal(H.room().items.some(o => o.id === 'sofa'), false);
  // Gratis: hasta MAX_COPIES de cada uno.
  for (let k = 0; k < H.MAX_COPIES - 1; k++) assert.equal(H.place('lamp', 0, 3 + k).ok, true);
  const r = H.place('lamp', 4, 4);
  assert.equal(r.ok, false); assert.match(r.error, /todos/);
  // Suelo y pared: sólo los tuyos.
  assert.equal(H.setSurface('floor', 'crystal'), false);
  assert.equal(H.buy('floor', 'moss').ok, true);
  assert.equal(H.setSurface('floor', 'moss'), true);
  assert.equal(H.room().floor, 'moss');
});

test('interior: invitados — sólo tus Pokémon, sin repetir y hasta MAX_GUESTS; se pueden ir', () => {
  const owned = { 25: { at: 1 }, 6: { at: 1 }, 9: { at: 1 }, 3: { at: 1 }, 94: { at: 1 }, 150: { at: 1 } };
  withSave(migrateOf(Object.assign({}, OLD, { owned })));
  assert.equal(H.invite(4).ok, false, 'uno que no tienes, no');
  assert.equal(H.invite(6).ok, true);
  assert.equal(H.invite(6).ok, false, 'ya vive aquí');
  for (const d of [9, 3, 94]) assert.equal(H.invite(d).ok, true);
  const full = H.invite(150);
  assert.equal(full.ok, false); assert.match(full.error, /llena/);
  assert.equal(H.room().guests.length, H.MAX_GUESTS);
  assert.equal(H.uninvite(9), true);
  assert.equal(H.uninvite(9), false);
  assert.equal(H.invite(150).ok, true);
  assert.deepEqual(plain(H.room().guests), [6, 3, 94, 150]);
});

test('interior: al fusionar dos aparatos gana lo último que se cambió; una partida sin interior no borra el de la otra', () => {
  const base = Object.assign({}, OLD);
  const a = migrateOf(Object.assign({}, base, { updated: 100, hin: { v: 1, floor: 'wood', wall: 'wood', items: [{ id: 'bed', x: 0, y: 0 }], guests: [6], at: 50 } }));
  const b = migrateOf(Object.assign({}, base, { updated: 90, hin: { v: 1, floor: 'wood', wall: 'wood', items: [{ id: 'table', x: 3, y: 3 }], guests: [9], at: 80 } }));
  for (const r of [G.DB.merge(a, b), G.DB.merge(b, a)]) {
    assert.equal(r.hin.at, 80);
    assert.deepEqual(plain(r.hin.guests), [9]);
    assert.equal(r.hin.items[0].id, 'table');
  }
  // La de serie (at 0, recién migrada) pierde contra una con cambios.
  const fresh = migrateOf(Object.assign({}, base, { updated: 200 }));
  for (const r of [G.DB.merge(fresh, a), G.DB.merge(a, fresh)]) assert.deepEqual(plain(r.hin.guests), [6]);
});

test('interior: la escena (home-in.js) está en la página, entra por la puerta de tu choza y sólo dibuja en 2D', () => {
  const dev = source('dev.html'), vil = source('js/world/village.js'), hin = source('js/world/home-in.js');
  assert.ok(dev.includes('js/world/home-in.js'));
  assert.ok(dev.indexOf('js/world/village.js') < dev.indexOf('js/world/home-in.js'));
  for (const id of ['vil-in', 'vil-deco', 'vil-out', 'vil-run']) assert.ok(dev.includes('id="' + id + '"'), 'falta #' + id);
  assert.match(vil, /what === 'home'\) \{ if \(!enterHome\(\)\)/, 'la puerta de tu choza entra');
  assert.match(vil, /G\.HomeIn\.frame\(/);
  assert.doesNotMatch(hin, /Village3D/, 'dentro no se dibuja nada en 3D');
});
