// Dos megas por Pokémon (07-11-2026): Charizard y Mewtwo tienen X e Y. Cada una tiene su versión
// con mega y su piedra; con las dos piedras, se elige cuál al megaevolucionar (una carta, como
// las de rama). Y las 19 con el sprite de pokeemerald-expansion. node tests/mega-xy.test.cjs
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const load = (ctx, f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

function boot(save) {
  const said = [], offers = [];
  const G = {
    U: { TYPE_NAME: {}, clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
    DB: { save, commit() {} }, Moves: { Z: {} }, Coop: { active: false },
    I18n: { f: (s, ...a) => a.reduce((t, x) => t.replace('{x}', x), s) },
    Mons: { formFor: (dex, form) => ({ form }), name: n => n[0] },
    FX: { ring() {}, burst() {} }, Camera: { kick() {} }, Audio: { sfx() {} }, Pad: { rumble() {} },
    Spawner: { say: s => said.push(s) }, Sprites: { preload: ids => offers.push(['preload', Array.from(ids)]) },
    LIFT: 10,
    Game: { offerMega: (ids, cb) => { offers.push(['offer', Array.from(ids)]); G._pick = cb; return true; } }
  };
  const ctx = vm.createContext({ G, console, performance: { now: () => 0 }, Intl, Math, Date, Object });
  for (const f of ['js/data/pokedex.js', 'js/data/megas.js', 'js/data/shop.js', 'js/systems/gacha.js', 'js/systems/mega.js']) load(ctx, f);
  return { G, said, offers };
}
const sv = o => Object.assign({ coins: 50000, owned: { 6: 1, 150: 1, 94: 1 }, ach: { rift1: 1 }, mst: {}, mop: {}, pz: {}, pmg: {} }, o);
const X = 10034, Y = 10035, MX = 10043, MY = 10044;
const player = () => {
  const pl = { dex: 6, form: 6, kills: 300, bosses: 0, mon: { dex: 6 }, abilId: 'blaze', x: 0, y: 0, r: 10, wr: 10, bodyH: 20,
               evoFx: {}, evolve(mon) { this.form = mon.form; this.mon = mon; } };
  return pl;
};

test('Charizard y Mewtwo tienen dos megas, X e Y; los demás, una', () => {
  const { G } = boot(sv());
  assert.deepEqual([...G.Shop.megaIds(6)], [X, Y]);
  assert.deepEqual([...G.Shop.megaIds(150)], [MX, MY]);
  assert.equal(G.MEGA[Y].name[0], 'Mega-Charizard Y');
  assert.equal(G.MEGA[MX].name[1], 'Mega Mewtwo X');
  assert.deepEqual([...G.MEGA[Y].types], ['fire', 'flying']);
  assert.deepEqual([...G.MEGA[MX].types], ['psychic', 'fighting']);
  assert.equal(G.MEGA[Y].ico, 'charizardite-y');
  assert.equal(G.MEGA[MX].ico, 'mewtwonite-x');
  for (const d in G.MEGA_OF) if (+d !== 6 && +d !== 150) assert.equal(G.MEGA_OF[d].length, 1, G.DEX_BY[d].name);
  assert.equal(G.Shop.megaId(6), X, 'megaId sigue diciendo si tiene (la primera)');
});

test('cada una, su versión con mega y su piedra; las dos al mismo precio', () => {
  const s = sv({ mop: { [Y]: 1 } });
  const { G } = boot(s);
  assert.equal(G.Shop.buy('mg:' + X).ok, false, 'sin la versión con mega de la X');
  assert.equal(G.Shop.buy('mg:' + Y).ok, true);
  assert.equal(G.Shop.stonePrice(X), G.Shop.stonePrice(Y));
  assert.deepEqual([...G.Shop.megaWorn(6)], [Y]);
  assert.equal(G.Shop.wears(6), 'mega');
  const n = G.Shop.megaNeeds(6, X);
  assert.deepEqual([n.id, n.open, n.stone], [X, false, false]);
  assert.equal(G.Shop.megaNeeds(6, Y).stone, true);
  assert.equal(G.Shop.megaNeeds(6, MX), null, 'una mega de otro Pokémon no vale');
  assert.equal(G.Shop.megaNeeds(6).id, X, 'sin id, la primera');
});

test('el gacha: con Charizard pueden salir las dos, cada una una vez', () => {
  const s = sv({ owned: { 6: { at: 1 } } });
  const { G } = boot(s);
  assert.deepEqual([...G.Gacha.megaPool(s, 1)].sort(), [X, Y]);
  s.mop[X] = 1;
  assert.deepEqual([...G.Gacha.megaPool(s, 1)], [Y], 'la que ya tienes no vuelve a salir');
});

test('con las dos piedras: la última comprada primero; sin Mega-Aro, ninguna', () => {
  const s = sv({ mst: { [X]: 100, [Y]: 200 } });
  const { G } = boot(s);
  assert.deepEqual([...G.Shop.megaWorn(6)], [Y, X]);
  s.mst[X] = 300;
  assert.deepEqual([...G.Shop.megaWorn(6)], [X, Y]);
  s.ach = {};
  assert.deepEqual([...G.Shop.megaWorn(6)], []);
  assert.equal(G.Shop.wears(6), null);
});

test('con las dos y la Pulsera Z: mega o Z sigue siendo una cosa u otra', () => {
  const s = sv({ mst: { [X]: 100, [Y]: 200 }, pz: { 6: 150 } });
  const { G } = boot(s);
  assert.equal(G.Shop.wears(6), 'mega', 'la Y es más nueva que la Pulsera');
  s.pz[6] = 300;
  assert.equal(G.Shop.wears(6), 'z');
  G.Shop.setWear(6, 'mega');
  assert.equal(G.Shop.wears(6), 'mega');
});

test('una sola piedra: megaevoluciona al pulsar, sin carta', () => {
  const { G, offers } = boot(sv({ mst: { [Y]: 1 } }));
  const pl = player(), g = G.Mega.of(pl);
  assert.deepEqual([...g.ids], [Y]);
  assert.equal(G.Mega.use(pl), true);
  assert.equal(pl.form, Y);
  assert.equal(pl.abilId, 'drought', 'la habilidad de la Y');
  assert.ok(!offers.some(o => o[0] === 'offer'));
});

test('dos piedras: al pulsar sale la carta y megaevoluciona en la elegida', () => {
  const { G, offers } = boot(sv({ mst: { [X]: 100, [Y]: 200 } }));
  const pl = player(), g = G.Mega.of(pl);
  assert.deepEqual([...g.ids], [Y, X]);
  G.Mega.tick(0.016, pl);
  assert.deepEqual(offers[0], ['preload', [Y, X]], 'se cargan las dos');
  assert.equal(G.Mega.use(pl), false, 'todavía no: sale la carta');
  assert.deepEqual(offers[1], ['offer', [Y, X]]);
  assert.equal(pl.form, 6);
  G._pick(X);
  assert.equal(pl.form, X);
  assert.equal(g.id, X);
  assert.equal(g.def, G.MEGA[X]);
  assert.equal(pl.abilId, 'tough-claws');
  assert.equal(g.uses, 1);
  // Al acabar vuelve a su forma y su habilidad; la próxima vez se vuelve a elegir.
  G.Mega.tick(G.Mega.DUR + 1, pl);
  assert.equal(pl.form, 6);
  assert.equal(pl.abilId, 'blaze');
  pl.kills = 900;
  assert.equal(G.Mega.use(pl), false);
  G._pick(Y);
  assert.equal(pl.form, Y);
  assert.equal(g.uses, 2);
});

test('dos piedras sin poder abrir la carta: la última usada, como antes', () => {
  const { G } = boot(sv({ mst: { [X]: 100, [Y]: 200 } }));
  G.Game.offerMega = () => false;
  const pl = player();
  assert.equal(G.Mega.use(pl), true);
  assert.equal(pl.form, Y);
});

test('no se elige una mega que no lleva ni sin energía', () => {
  const { G } = boot(sv({ mst: { [X]: 100 } }));
  const pl = player();
  assert.equal(G.Mega.use(pl, Y), false, 'no tiene la Charizardita Y');
  pl.kills = 0;
  assert.equal(G.Mega.use(pl, X), false, 'sin energía');
});

test('las 19 nuevas: hojas de 2×8 cuadros de 32 px, con shiny, e icono de su piedra', () => {
  const ctx = vm.createContext({ G: {} });
  load(ctx, 'js/data/sprites-meta.js');
  load(ctx, 'js/data/megas.js');
  const G = ctx.G;
  const RHH = [10033, 10035, 10036, 10040, 10041, 10043, 10045, 10046, 10047, 10050, 10053, 10058, 10060, 10064, 10069, 10073, 10076, 10089, 10090];
  for (const id of RHH) {
    const m = G.SPRITE_META[id], d = G.MEGA[id];
    assert.ok(d, id + ' en G.MEGA');
    for (const a of ['Idle', 'Walk']) {
      assert.equal(m.a[a].w, 32); assert.equal(m.a[a].h, 32); assert.equal(m.a[a].n, 2); assert.equal(m.a[a].r, 8);
      for (const dir of ['', 's/']) {
        const png = fs.readFileSync(path.join(root, 'assets/pokemon', String(id), dir + a + '.png'));
        assert.equal(png.readUInt32BE(16), 64, d.name[0] + ' ancho');
        assert.equal(png.readUInt32BE(20), 256, d.name[0] + ' alto');
      }
    }
    assert.equal(m.sh, 1, d.name[0] + ' shiny');
    assert.ok(m.a.Idle.ay > 24 && m.a.Idle.ay < 32, d.name[0] + ' ancla');
    assert.ok(fs.existsSync(path.join(root, 'assets/items', d.ico + '.png')), d.ico);
  }
});

test('textos nuevos con su inglés, y créditos de los sprites', () => {
  const en = fs.readFileSync(path.join(root, 'js/data/lang-en.js'), 'utf8');
  for (const k of ['¡{x} va a megaevolucionar!', 'Elige su megaevolución', 'Megaevoluciones', 'Con las dos megapiedras, eliges cuál al megaevolucionar.'])
    assert.ok(en.includes(JSON.stringify(k) + ':'), k);
  const cr = fs.readFileSync(path.join(root, 'CREDITS.md'), 'utf8');
  for (const k of ['pokeemerald-expansion', 'princess-phoenix', 'larryturbo', 'kidkatt']) assert.ok(cr.includes(k), k);
});
