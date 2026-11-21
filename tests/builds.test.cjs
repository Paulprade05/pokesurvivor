// Builds planeadas (21-11-2026, sesión builds-plan, lo pidió el dueño): planear ataques, fusión, pasivas y objetos de
// cada Pokémon (systems/build.js, ui/build-ui.js) y que en partida se marque lo que es de la build (cartas de nivel,
// vínculo, elección de objeto, objetos del suelo y pausa). Sólo ayuda visual: no cambia qué sale.
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
    G: {}, console, setTimeout, clearTimeout, setInterval, clearInterval, Math,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } },
    location: { protocol: 'file:', hostname: '', href: 'file:///x', search: '' },
    navigator: { onLine: true, language: 'es' },
    document: { addEventListener() {}, visibilityState: 'visible', hidden: false },
    addEventListener() {}, removeEventListener() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/core/db.js', 'js/data/moves.js',
    'js/data/natures.js', 'js/data/abilities.js', 'js/data/tms.js', 'js/data/evolutions.js', 'js/data/families.js',
    'js/data/starters.js', 'js/data/upgrades.js', 'js/data/items.js', 'js/data/shop.js', 'js/systems/mons.js',
    'js/systems/levelup.js', 'js/systems/build.js']) {
    vm.runInContext(source(f), ctx, { filename: f });
  }
  return ctx.G;
}
const G = boot();
G.DB.playAsGuest();
const B = G.Build;
const clone = o => JSON.parse(JSON.stringify(o));

test('build: poner y quitar, topes y fusión sólo de sus ataques', () => {
  const dex = 6;
  B.clear(dex);
  const o = B.options(dex);
  assert.ok(o.moves.length >= 10 && o.moves.includes('ember'), 'Charizard puede llevar Ascuas');
  // La familia entera: lo de Charmander también.
  for (const d of G.Fam.lineOf(dex)) for (const id of G.Moves.poolFor(G.DEX_BY[d])) assert.ok(o.moves.includes(id), id);
  assert.ok(!o.passives.includes('heal'), 'la Baya Zidra no es una pasiva');
  assert.equal(o.items.length, G.Items.LIST.length);

  const ms = o.moves.slice(0, 5);
  for (const id of ms.slice(0, 4)) assert.equal(B.toggle(dex, 'm', id), true);
  assert.equal(B.toggle(dex, 'm', ms[4]), false, 'como mucho 4 ataques');
  assert.equal(B.toggle(dex, 'f', ms[4]), false, 'sólo se fusionan ataques de la build');
  assert.equal(B.toggle(dex, 'f', ms[0]), true);
  assert.equal(B.toggle(dex, 'f', ms[1]), true);
  for (const id of ['atk', 'cd', 'area', 'amt']) assert.equal(B.toggle(dex, 'p', id), true);
  assert.equal(B.toggle(dex, 'p', 'luck'), false, 'como mucho 4 pasivas');
  assert.equal(B.toggle(dex, 'i', 'leftovers'), true);
  assert.equal(B.toggle(dex, 'i', 'lifeorb'), true);
  assert.equal(B.toggle(dex, 'i', 'quickclaw'), false, 'como mucho 2 objetos');
  let b = B.get(dex);
  assert.deepEqual(clone(b.f), clone(ms.slice(0, 2)));
  assert.equal(B.count(b), 10);
  // Quitar un ataque lo quita también de la fusión.
  B.toggle(dex, 'm', ms[0]);
  b = B.get(dex);
  assert.ok(!b.m.includes(ms[0]) && !b.f.includes(ms[0]));
  assert.ok(b.at > 0);
  // Vaciar deja la build vacía (con su fecha: al juntar con la nube no vuelve la de antes).
  B.clear(dex);
  assert.equal(B.count(B.get(dex)), 0);
  assert.ok(G.DB.save.pbuild[dex] && G.DB.save.pbuild[dex].at > 0);
});

test('build: limpia lo que no existe y lo que se pasa de los topes', () => {
  const c = B.clean({ m: ['ember', 'ember', 'nope', 'water-gun', 'tackle', 'vine-whip', 'thunder-shock'], f: ['ember', 'nope', 'tackle'],
    p: ['atk', 'heal', 'nada', 'cd'], i: ['leftovers', 'xx', 'lifeorb', 'quickclaw'], at: 5 });
  assert.deepEqual(clone(c.m), ['ember', 'water-gun', 'tackle', 'vine-whip']);
  assert.deepEqual(clone(c.f), ['ember', 'tackle']);
  assert.deepEqual(clone(c.p), ['atk', 'cd']);
  assert.deepEqual(clone(c.i), ['leftovers', 'lifeorb']);
  assert.equal(B.clean(null), null);
  assert.equal(B.clean('x'), null);
});

test('build: en partida, qué cartas, objetos y fusiones son de la build, y cuánto llevas', () => {
  const dex = 6;
  B.clear(dex);
  for (const id of ['ember', 'flamethrower']) B.toggle(dex, 'm', id);
  B.toggle(dex, 'f', 'ember'); B.toggle(dex, 'f', 'flamethrower');
  B.toggle(dex, 'p', 'pspd'); B.toggle(dex, 'p', 'cd');
  B.toggle(dex, 'i', 'lifeorb');
  const pl = { buildDex: dex, moves: [{ id: 'ember' }, { id: 'tackle' }], statsTaken: { pspd: 2, hp: 1 }, items: [{ id: 'leftovers', r: 0 }] };
  assert.equal(B.card(pl, { type: 'new', key: 'new:flamethrower' }), true);
  assert.equal(B.card(pl, { type: 'up', key: 'up:ember' }), true);
  assert.equal(B.card(pl, { type: 'evo', key: 'evo:ember' }), true);
  assert.equal(B.card(pl, { type: 'up', key: 'up:tackle' }), false);
  assert.equal(B.card(pl, { type: 'stat', key: 'stat:cd' }), true);
  assert.equal(B.card(pl, { type: 'stat', key: 'stat:hp' }), false);
  assert.equal(B.card(pl, { type: 'stat', key: 'stat:heal', full: 'heal' }), false);
  assert.equal(B.item(pl, 'lifeorb:3'), true);
  assert.equal(B.item(pl, 'leftovers:0'), false);
  assert.equal(B.item(pl, 'nada:1'), false);
  assert.equal(B.fuse(pl, 'ember'), true);
  assert.equal(B.fuse(pl, 'tackle'), false);
  const pr = B.progress(pl);
  assert.deepEqual(clone(pr.m), [1, 2]);
  assert.deepEqual(clone(pr.p), [1, 2]);
  assert.deepEqual(clone(pr.i), [0, 1]);
  assert.equal(pr.done, 2); assert.equal(pr.total, 5);
  // En cooperativo cada uno la suya: los compañeros (remote) no cuentan; sin build, nada se marca.
  assert.equal(B.of(Object.assign({}, pl, { remote: true })), null);
  assert.equal(B.card(Object.assign({}, pl, { buildDex: 9 }), { type: 'new', key: 'new:flamethrower' }), false);
  // Una fusión de un solo ataque no marca nada (hacen falta dos).
  B.toggle(dex, 'f', 'flamethrower');
  assert.equal(B.fuse(pl, 'ember'), false);
  B.clear(dex);
});

test('build: se guarda con la partida, se limpia al cargar y al juntar gana la más reciente de cada Pokémon', () => {
  const s = clone(G.DB.save);
  s.pbuild = { 6: { m: ['ember', 'nope'], f: [], p: ['atk'], i: ['leftovers'], at: 10 }, 99999: { m: ['ember'], at: 1 }, 9: 'basura' };
  G.DB.migrate(s, 'Ash');
  assert.deepEqual(clone(s.pbuild[6].m), ['ember']);
  assert.equal(s.pbuild[99999], undefined);
  assert.equal(s.pbuild[9], undefined);
  // Juntar: newer es la partida más reciente; de cada Pokémon gana la build tocada la última (at).
  const a = clone(s), b = clone(s);
  a.updated = 200; b.updated = 100;
  a.pbuild[6] = { m: ['ember'], f: [], p: [], i: [], at: 10 };
  b.pbuild[6] = { m: ['water-gun'], f: [], p: [], i: [], at: 50 };
  b.pbuild[3] = { m: ['vine-whip'], f: [], p: [], i: [], at: 5 };
  const r = G.DB.merge(a, b);
  assert.deepEqual(clone(r.pbuild[6].m), ['water-gun']);
  assert.deepEqual(clone(r.pbuild[3].m), ['vine-whip']);
  // Una vaciada más reciente gana a una llena de antes.
  a.pbuild[3] = { m: [], f: [], p: [], i: [], at: 9 };
  assert.deepEqual(clone(G.DB.merge(a, b).pbuild[3].m), []);
});

test('build: la de una preevolución pasa a su forma final', () => {
  const s = clone(G.DB.save);
  s.owned = Object.assign({}, s.owned, { 4: { at: 1, from: 'starter' } });
  s.pbuild = { 4: { m: ['ember'], f: [], p: ['pspd'], i: [], at: 3 } };
  delete s.owned[6];
  G.DB.migrate(s, 'Ash');
  assert.equal(s.pbuild[4], undefined);
  assert.deepEqual(clone(s.pbuild[6].m), ['ember']);
});

test('build: en el juego (pantallas, sello, cartas, suelo, pausa, mando y textos en inglés)', () => {
  const dev = source('dev.html'), run = source('js/ui/run-ui.js'), ui = source('js/ui/build-ui.js'), menu = source('js/ui/menu.js');
  const css = source('css/style.css'), en = source('js/data/lang-en.js'), icons = source('js/ui/icons.js'), pick = source('js/entities/pickup.js');
  // Scripts y pantalla.
  const tag = f => dev.indexOf('<script defer src="' + f + '"></script>');
  assert.ok(tag('js/systems/build.js') > tag('js/systems/levelup.js') && tag('js/systems/levelup.js') > 0);
  assert.ok(tag('js/ui/build-ui.js') > tag('js/ui/run-ui.js') && tag('js/ui/run-ui.js') > 0);
  assert.ok(/<section id="scr-build" class="scr dim modal hidden"/.test(dev));
  assert.ok(/role="tab" data-k="m"/.test(dev) && /role="tab" data-k="p"/.test(dev) && /role="tab" data-k="i"/.test(dev), 'pestañas (LB / RB del mando)');
  assert.ok(/data-back/.test(dev.slice(dev.indexOf('id="scr-build"'), dev.indexOf('id="scr-build"') + 600)), 'B / Esc cierran');
  assert.ok(source('js/ui/ui.js').includes("'scr-build'"));
  // El sello: dibujo propio de pxl.
  assert.ok(fs.existsSync(path.join(root, 'assets/pxl/build.png')) && fs.existsSync(path.join(root, 'tools/pxl/build.px.js')));
  assert.ok(/PXL = \{ build: 'assets\/pxl\/build\.png' \}/.test(icons));
  // Dónde se marca: cartas de nivel, objeto, vínculo, suelo y pausa.
  assert.ok(run.includes('G.Build.card(p, c)'));
  assert.ok(run.includes('G.Build.item(pl, o.id)'));
  assert.ok(run.includes('G.Build.fuse(G.Game.player, m.id)'));
  assert.ok(run.includes('pzBuild(pl)'));
  assert.ok(pick.includes("G.Icons.chunky(ctx, 'build'"));
  assert.ok(source('js/game.js').includes('pl.buildDex = chosen'));
  // Desde dónde se planea: Pokédex, Mejoras y la pausa.
  assert.ok(menu.includes("G.BuildUI.open(dex, { host: 'scr-dex'") && menu.includes("G.BuildUI.open(upgDex, { host: 'scr-upgrades'"));
  assert.ok(run.includes("G.BuildUI.open(pl.buildDex, { host: 'scr-pause'"));
  // Las tres pantallas: PC, móvil de pie y tumbado.
  assert.ok(css.includes('.card.pick-card.in-build') && css.includes('.sheet-body.bld-body'));
  assert.ok(/@media \(max-width: 599px\) and \(min-height: 521px\) \{\r?\n  \.sheet-body\.bld-body/.test(css));
  assert.ok(/@media \(max-height: 520px\) \{\r?\n  \.sheet-body\.bld-body/.test(css));
  // Textos nuevos en inglés.
  const has = s => en.includes("'" + s + "':") || en.includes('"' + s + '":');
  const lits = new Set();
  for (const src of [ui, run.slice(run.indexOf('function pzBuild'), run.indexOf('function pauseSummary'))]) {
    for (const m of src.matchAll(/G\.(?:T|I18n\.f)\('([^']+)'/g)) lits.add(m[1]);
  }
  for (const k of ['Tu build', 'Planear build', 'Editar build', 'Editar', 'Vaciar', 'Tu plan', 'Qué planear', 'De tu build', 'aún no',
    'Elige qué ataques, pasivas y objetos quieres llevar.', 'Ya tienes 4 ataques: quita uno primero', 'Ya tienes 4 pasivas: quita una primero',
    'Ya tienes 2 objetos: quita uno primero', '¿Vaciar la build de este Pokémon?']) lits.add(k);
  for (const k of lits) assert.ok(has(k), 'falta en inglés: ' + k);
  // Novedades en los dos idiomas.
  const ch = source('js/data/changelog.js');
  assert.ok(/Planear builds|planear la build/i.test(ch) && /Plan(ning)? builds|plan the build/i.test(ch));
});

test('build: sólo ayuda visual (no toca los pesos de las cartas ni los objetos)', () => {
  assert.ok(!source('js/systems/levelup.js').includes('Build'));
  assert.ok(!source('js/data/items.js').includes('Build'));
  assert.ok(!/G\.Build/.test(source('js/systems/combat.js')));
});
