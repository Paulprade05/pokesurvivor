/* ============ shop.js — Tienda Kecleon y Mochila ============
 * (20-10-2026, del PR #236 de TheAdro7, adaptado: sin niveles ni caramelos.)
 *
 * Se compra con Pokémonedas y lo comprado va a la Mochila:
 *   save.bag[id]     Menta, Cápsula Habilidad y Cápsula Habilidad Oculta
 *   save.tms[move]   MT sin usar (cada una se gasta al enseñarla: G.Mons.teach)
 * Las dos van en la libreta de las monedas (core/db.js): lo gastado en un
 * aparato no reaparece al fusionar con otro.
 *
 * MT a la venta: 8 cada día, iguales para todos (semilla: la fecha en España).
 * Si ninguna sirve a tu compañero, la última se cambia por una que sí aprenda.
 *
 * Movimientos Z (24-10-2026; por Pokémon desde la segunda ronda del mismo día):
 *   save.zc[tipo] = fecha   Cristales Z: uno por tipo, se compra una vez y es para siempre
 *   save.pz[dex]  = fecha   Pulsera Z de ese Pokémon (el elegido, no su fase): para siempre
 * En la partida el Z sólo se activa si tu Pokémon lleva la Pulsera Z, tienes el
 * Cristal Z de un tipo y llevas al menos Z_NEED (2) ataques de ese tipo en tus
 * huecos (zState). Si cumplen varios, el del tipo con más ataques; si empatan,
 * el tipo que elegiste para ese Pokémon en Mejoras (save.pzt[dex], 01-11-2026) y,
 * si no elegiste o el tuyo no está entre los empatados, el del ataque que aprendiste antes. El movimiento es el del cristal
 * (data/moves.js; se lanza en combat.js, zUse), aunque no sea un tipo del Pokémon.
 * Ni los cristales ni las pulseras van en la libreta como la Mochila: no se
 * gastan, así que al fusionar dos aparatos se juntan (unión, core/db.js) y nunca
 * se pierden ni salen dos veces. Las monedas, sí, como cualquier compra.
 * Quien compró cristales con las reglas de antes (servían a todos tus Pokémon de
 * su tipo) recibe gratis la Pulsera Z de esos Pokémon y la de su compañero
 * (core/db.js, migrate: una vez).
 */
G.Shop = (() => {
  const ITEMS = {
    mint: { name: 'Menta', icon: 'mint', price: 1500,
            desc: 'Cambia la naturaleza de un Pokémon por la que tú elijas.' },
    cap:  { name: 'Cápsula Habilidad', icon: 'capsule', price: 1500,
            desc: 'Cambia la habilidad de un Pokémon por otra de las suyas (no la oculta).' },
    caph: { name: 'Cápsula Habilidad Oculta', icon: 'capsuleh', price: 5000, hidden: true,
            desc: 'Cambia la habilidad de un Pokémon por cualquiera de las suyas, también la oculta.' }
  };
  const ORDER = ['mint', 'cap', 'caph'];
  const DAILY = 8;

  const save = () => G.DB.save;

  // ---------------- Mochila ----------------

  const count = id => { const s = save(); return (s && s.bag && s.bag[id]) || 0; };
  function take(id) {
    const s = save();
    if (!count(id)) return false;
    if (--s.bag[id] <= 0) delete s.bag[id];
    return true;
  }
  const tmCount = id => { const s = save(); return (s && s.tms && s.tms[id]) || 0; };
  function takeTm(id) {
    const s = save();
    if (!tmCount(id)) return false;
    if (--s.tms[id] <= 0) delete s.tms[id];
    return true;
  }

  // ---------------- MT del día ----------------

  /** Fecha de hoy en España (todos ven la misma tienda el mismo día). */
  function today() {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return p.year + p.month + p.day;
  }
  function rng(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  /**
   * MT que algún Pokémon puede aprender. Las de tipo Normal ya las saben todos
   * (G.Mons.natural) y se vendían sin servir para nada. Sólo depende de los datos,
   * así que la tienda del día sigue siendo la misma para todos.
   */
  let sellable = null;
  function tmPool() {
    if (!sellable) sellable = Object.keys(G.TM_MOVES).filter(id => G.Moves.BY_ID[id] &&
      G.TM_MOVES[id].some(d => G.DEX_BY[d] && !G.Mons.natural(d, id))).sort();
    return sellable;
  }
  /** Las 8 MT a la venta hoy. */
  function dailyTms() {
    const all = tmPool().slice(), r = rng('kecleon:' + today());
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    const list = all.slice(0, DAILY);
    const s = save(), dex = s && s.partner;
    if (dex && !list.some(id => G.Mons.canLearn(dex, id))) {
      const mine = G.Mons.learnable(dex).sort();
      if (mine.length) list[DAILY - 1] = mine[Math.floor(rng('kecleon:' + today() + ':' + dex)() * mine.length)];
    }
    return list;
  }
  const tmPrice = id => G.TM_PRICE[id] || 400;

  // ---------------- Cristales Z ----------------

  /** Nombre oficial de cada cristal (el icono: 'z:<tipo>', ui/icons.js). Sin prototipo: 'z:constructor' no es un cristal. */
  const Z_NAME = Object.assign(Object.create(null), {
    normal: 'Normastal Z', fighting: 'Lizastal Z', flying: 'Aerostal Z', poison: 'Toxistal Z', ground: 'Geostal Z',
    rock: 'Litostal Z', bug: 'Insectostal Z', ghost: 'Espectrostal Z', steel: 'Metalostal Z', fire: 'Pirostal Z',
    water: 'Hidrostal Z', grass: 'Fitostal Z', electric: 'Electrostal Z', psychic: 'Psicostal Z', ice: 'Criostal Z',
    dragon: 'Dracostal Z', dark: 'Nictostal Z', fairy: 'Feeristal Z'
  });
  // En el orden de los tipos de siempre (G.U.TYPE_NAME).
  const Z_TYPES = Object.keys(G.U.TYPE_NAME).filter(t => Z_NAME[t]);
  const Z_PRICE = 6000;

  const RING_PRICE = 3000;      // la Pulsera Z de un Pokémon
  const Z_NEED = 2;             // ataques del tipo del cristal que hay que llevar en los huecos

  /** ¿Tienes el Cristal Z de este tipo? */
  const zHas = type => { const s = save(); return !!(s && s.zc && Z_NAME[type] && s.zc[type]); };
  /** Tus Cristales Z (tipos), en el orden de siempre. */
  const zOwned = () => Z_TYPES.filter(zHas);
  /** ¿Lleva este Pokémon (el elegido) la Pulsera Z? */
  const ringHas = dex => { const s = save(); return !!(s && s.pz && dex != null && s.pz[dex]); };

  /**
   * El tipo Z que elegiste para este Pokémon (Mejoras → Pulsera Z), para cuando
   * empatan dos cristales: save.pzt[dex] = tipo. → el tipo, o null (sin elegir o
   * no es un cristal). Va con la partida a la nube, como el movimiento inicial.
   */
  const zPref = dex => { const s = save(), t = s && s.pzt && dex != null ? s.pzt[dex] : null; return typeof t === 'string' && Z_NAME[t] ? t : null; };
  /** Elige (o, con null, quita) el tipo Z de este Pokémon. Sin guardar: lo hace quien llama. */
  function zSetPref(dex, type) {
    const s = save();
    if (!s || dex == null) return;
    s.pzt = s.pzt || {};
    if (type && Z_NAME[type]) s.pzt[dex] = type; else delete s.pzt[dex];
  }

  /**
   * Cómo va el movimiento Z de una partida (lo usan combat.js, el HUD, la pausa y las cartas).
   *   dex    el Pokémon elegido (el de la Pulsera Z)
   *   moves  tus ataques en los huecos, en el orden en que los aprendiste (cada uno con .type)
   *   types  los tipos de tu fase (sólo para la pista: a igualdad, el cristal de tu tipo)
   *   pref   el tipo elegido para los empates (si no se pasa, el de Mejoras: zPref)
   * → { ring, type: el tipo listo (o null), n: ataques de ese tipo,
   *     need: el cristal más cercano si no hay ninguno listo (o null: sin cristales), needN: los que llevas de él,
   *     have: [{ t, n }] cada cristal tuyo con los ataques que llevas de su tipo }
   * Regla: Pulsera Z + cristal del tipo T + al menos Z_NEED ataques de T. Si cumplen
   * varios, el de más ataques; si empatan, el elegido (pref) si es uno de los
   * empatados y, si no, el del ataque que aprendiste antes.
   */
  function zState(dex, moves, types, pref) {
    if (pref === undefined) pref = zPref(dex);
    const own = zOwned(), have = own.map(t => ({ t, n: 0, first: Infinity }));
    (moves || []).forEach((m, i) => {
      const h = m && have.find(x => x.t === m.type);
      if (h) { h.n++; if (h.first === Infinity) h.first = i; }
    });
    const ok = have.filter(h => h.n >= Z_NEED).sort((a, b) => b.n - a.n || a.first - b.first);
    const best = (ok.length && ok.find(h => h.t === pref && h.n === ok[0].n)) || ok[0] || null;
    const mine = types || [];
    // La pista: el que tenga más ataques; a igualdad, el elegido, uno de tu tipo y luego el orden de siempre.
    const near = best ? null : have.slice().sort((a, b) => b.n - a.n || (b.t === pref) - (a.t === pref) || a.first - b.first
      || (mine.includes(b.t) - mine.includes(a.t)) || own.indexOf(a.t) - own.indexOf(b.t))[0] || null;
    return { ring: ringHas(dex), type: best ? best.t : null, n: best ? best.n : 0,
             need: near ? near.t : null, needN: near ? near.n : 0, have: have.map(({ t, n }) => ({ t, n })) };
  }

  // ---------------- megaevolución (06-11-2026, docs/MEGAEVOLUCIONES.md) ----------------

  /** ¿Tienes el Mega-Aro? Es el premio del logro de la primera grieta: vale para quien ya lo tuviera. */
  const aroHas = () => { const s = save(); return !!(s && s.ach && s.ach.rift1); };
  /** Las megas de este Pokémon (ids; Charizard y Mewtwo tienen dos, X e Y). */
  const megaIds = dex => (G.MEGA_OF && G.MEGA_OF[dex]) || [];
  /** La primera mega de este Pokémon (0: no tiene). Para saber si tiene; para cuál lleva, megaWorn. */
  const megaId = dex => megaIds(dex)[0] || 0;
  const stoneHas = id => { const s = save(); return !!(s && s.mst && s.mst[id]); };
  /**
   * Las megas que puede usar en la partida: las de piedra comprada, la última comprada primero
   * (con dos, se elige al megaevolucionar: G.Mega). Sin Mega-Aro no cuenta ninguna.
   */
  function megaWorn(dex) {
    const s = save();
    if (!s || !aroHas()) return [];
    return megaIds(dex).filter(stoneHas).sort((a, b) => (+s.mst[b] || 0) - (+s.mst[a] || 0) || a - b);
  }
  /** ¿Tienes su versión con mega? Sale en el gacha (G.Gacha) y deja comprar la piedra. */
  const megaOpen = id => { const s = save(); return !!s && G.Gacha.megaOpen(s, id); };
  /**
   * Qué lleva hecho cada paso para usar una mega de este Pokémon (id; sin él, la primera),
   * en orden, o null si no tiene. { id, mon, open, aro, stone, gen, price }
   */
  function megaNeeds(dex, id) {
    const s = save();
    if (!id) id = megaId(dex);
    if (!s || !id || !megaIds(dex).includes(id)) return null;
    return { id, mon: !!(s.owned && s.owned[dex]), open: megaOpen(id), aro: aroHas(), stone: stoneHas(id),
             gen: G.DEX_BY[dex].gen, price: stonePrice(id) };
  }
  /** Tus megapiedras (ids de mega). */
  const stonesOwned = () => { const s = save(); return Object.keys((s && s.mst) || {}).filter(id => G.MEGA && G.MEGA[id]); };
  function stonePrice(id) {
    const m = G.MEGA[id], p = m && G.DEX_BY[m.dex];
    return !p || p.leg || p.rarity >= 5 ? 10000 : p.rarity === 4 ? 7500 : 5000;
  }
  /**
   * Qué lleva este Pokémon: 'mega', 'z' o null. Como en los juegos, una cosa u otra.
   * Con las dos, la que elegiste en Mejoras (save.pmg[dex] = ['mega'|'z', fecha]) o la última comprada.
   * (Con dos megapiedras, X e Y, cuenta la última; cuál se usa se elige al megaevolucionar.)
   */
  function wears(dex) {
    const s = save(), worn = megaWorn(dex), mg = worn.length > 0, z = ringHas(dex);
    if (!mg || !z) return mg ? 'mega' : z ? 'z' : null;
    const p = s.pmg && s.pmg[dex];
    if (p && (p[0] === 'mega' || p[0] === 'z')) return p[0];
    return (+s.mst[worn[0]] || 0) >= (+s.pz[dex] || 0) ? 'mega' : 'z';
  }
  /** Elige qué lleva. Sin guardar: lo hace quien llama. */
  function setWear(dex, w) {
    const s = save();
    if (!s) return;
    s.pmg = s.pmg || {};
    s.pmg[dex] = [w === 'z' ? 'z' : 'mega', Date.now()];
  }

  // ---------------- comprar ----------------

  /**
   * Compra un objeto ('mint'...), una MT ('tm:flamethrower'), un Cristal Z ('z:fire')
   * o la Pulsera Z de uno de tus Pokémon ('zr:25'). → { ok, error? }
   */
  function buy(key) {
    const s = save();
    if (!s) return { ok: false };
    if (key.startsWith('mg:')) {
      const id = +key.slice(3), m = G.MEGA && G.MEGA[id];
      if (!m || !(s.owned && s.owned[m.dex])) return { ok: false };
      if (stoneHas(id)) return { ok: false, error: 'Ya tienes esa megapiedra.' };
      if (!megaOpen(id)) return { ok: false, error: 'Antes necesitas su versión con mega: sale en el gacha.' };
      if (!aroHas()) return { ok: false, error: 'Antes necesitas el Mega-Aro: gana tu primera grieta.' };
      if (s.coins < stonePrice(id)) return { ok: false, error: 'No tienes Pokémonedas suficientes.' };
      s.coins -= stonePrice(id);
      s.mst = s.mst || {};
      s.mst[id] = Date.now();
      G.DB.commit(true);
      return { ok: true };
    }
    if (key.startsWith('zr:')) {
      const dex = +key.slice(3);
      if (!G.DEX_BY[dex] || !(s.owned && s.owned[dex])) return { ok: false };
      if (ringHas(dex)) return { ok: false, error: 'Ese Pokémon ya lleva la Pulsera Z.' };
      if (s.coins < RING_PRICE) return { ok: false, error: 'No tienes Pokémonedas suficientes.' };
      s.coins -= RING_PRICE;
      s.pz = s.pz || {};
      s.pz[dex] = Date.now();
      G.DB.commit(true);
      return { ok: true };
    }
    if (key.startsWith('z:')) {
      const type = key.slice(2);
      if (!Z_NAME[type]) return { ok: false };
      if (zHas(type)) return { ok: false, error: 'Ya tienes ese Cristal Z.' };
      if (s.coins < Z_PRICE) return { ok: false, error: 'No tienes Pokémonedas suficientes.' };
      s.coins -= Z_PRICE;
      s.zc = s.zc || {};
      s.zc[type] = Date.now();
      G.DB.commit(true);
      return { ok: true };
    }
    const tm = key.startsWith('tm:') ? key.slice(3) : null;
    if (tm && !dailyTms().includes(tm)) return { ok: false, error: 'Esa MT ya no está a la venta.' };
    if (!tm && !ITEMS[key]) return { ok: false };
    const price = tm ? tmPrice(tm) : ITEMS[key].price;
    if (s.coins < price) return { ok: false, error: 'No tienes Pokémonedas suficientes.' };
    s.coins -= price;
    if (tm) { s.tms = s.tms || {}; s.tms[tm] = Math.min(999, (s.tms[tm] || 0) + 1); }
    else { s.bag = s.bag || {}; s.bag[key] = Math.min(999, (s.bag[key] || 0) + 1); }
    G.DB.commit();
    return { ok: true };
  }

  return { ITEMS, ORDER, count, take, tmCount, takeTm, dailyTms, tmPrice, buy, today,
           Z_NAME, Z_TYPES, Z_PRICE, Z_NEED, RING_PRICE, zHas, zOwned, ringHas, zPref, zSetPref, zState,
           aroHas, megaIds, megaId, megaWorn, stoneHas, megaOpen, megaNeeds, stonesOwned, stonePrice, wears, setWear };
})();
