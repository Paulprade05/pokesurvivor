/* ============ build.js — la build que planeas para cada Pokémon ============
 * (21-11-2026, sesión builds-plan, lo pidió el dueño: «poder plantear builds así en partida cuando me salga algo
 * de la build que destaque para poder verlo y armar la build que yo quiero».)
 *
 * Se elige de antemano (Pokédex → ficha, Mejoras y la pausa: ui/build-ui.js) qué quieres llevar:
 *   m  hasta 4 ataques (de los que puede aprender su familia)
 *   f  de esos, los que quieres fusionar en un vínculo
 *   p  hasta 4 pasivas (G.LevelUp.STATS sin la Baya Zidra)
 *   i  hasta 2 objetos (data/items.js)
 * Sólo es ayuda visual: no cambia qué sale ni con qué peso. En partida, lo que es de tu build lleva el sello
 * (assets/pxl/build.png) en las cartas de nivel, el vínculo, la elección de objeto y los objetos del suelo,
 * y la pausa dice cuánto llevas.
 *
 * Se guarda por Pokémon en save.pbuild[dex] = { m, f, p, i, at } (dex: el compañero elegido, como los atajos y los
 * vetos), con el resto del perfil: si la partida se sube a la nube, va con ella (db.js lo limpia y lo junta).
 * En cooperativo cada uno tiene la suya: se mira sólo el jugador local.
 */
G.Build = (() => {
  const MAX = { m: 4, f: 4, p: 4, i: 2 };
  const KINDS = ['m', 'f', 'p', 'i'];
  const empty = () => ({ m: [], f: [], p: [], i: [], at: 0 });

  const okMove = id => !!(G.Moves && G.Moves.BY_ID[id]);
  const okPas = id => !!(G.LevelUp && G.LevelUp.isPassive(id));
  const okItem = id => !!(G.Items && G.Items.BY[id]);

  /** Una build limpia: ids que existen, sin repetir, con sus topes; f, sólo de los ataques de m. null si no es una build. */
  function clean(b) {
    if (!b || typeof b !== 'object') return null;
    const list = (v, ok, max) => [...new Set((Array.isArray(v) ? v : []).filter(id => typeof id === 'string' && ok(id)))].slice(0, max);
    const out = { m: list(b.m, okMove, MAX.m), p: list(b.p, okPas, MAX.p), i: list(b.i, okItem, MAX.i), at: +b.at || 0 };
    out.f = list(b.f, id => out.m.includes(id), MAX.f);
    return out;
  }

  const save = () => (G.DB && G.DB.save) || null;
  /** La build de ese Pokémon (una copia vacía si no tiene). */
  function get(dex) {
    const s = save(), b = s && s.pbuild && s.pbuild[dex];
    return b ? b : empty();
  }
  /**
   * Guarda la build de ese Pokémon. Vacía también se guarda (con su fecha): al juntar la partida con la de la nube
   * gana la más reciente de cada Pokémon (db.js merge), y si se borrara volvería la de antes.
   */
  function set(dex, b) {
    const s = save();
    if (!s || dex == null) return;
    s.pbuild = s.pbuild && typeof s.pbuild === 'object' ? s.pbuild : {};
    s.pbuild[dex] = clean(Object.assign({}, b, { at: Date.now() }));
    if (G.DB.commit) G.DB.commit();
  }
  /** Pone o quita `id` de la parte `k` ('m', 'f', 'p' o 'i'). Devuelve false si ya está lleno. */
  function toggle(dex, k, id) {
    const b = JSON.parse(JSON.stringify(get(dex)));
    for (const x of KINDS) b[x] = b[x] || [];
    const l = b[k], at = l.indexOf(id);
    if (at >= 0) {
      l.splice(at, 1);
      if (k === 'm') { const j = b.f.indexOf(id); if (j >= 0) b.f.splice(j, 1); }
    } else {
      if (l.length >= MAX[k]) return false;
      if (k === 'f' && !b.m.includes(id)) return false;
      l.push(id);
    }
    set(dex, b);
    return true;
  }
  function clear(dex) { set(dex, empty()); }
  const has = (b, k, id) => !!(b && b[k] && b[k].includes(id));
  const count = b => (b ? b.m.length + b.p.length + b.i.length : 0);

  /** Lo que puede llevar ese Pokémon: los ataques de toda su familia (y sus MT), las pasivas y los objetos. */
  function options(dex) {
    const line = G.Fam && G.Fam.ready && G.Fam.ready() ? G.Fam.lineOf(+dex) : [+dex];
    const ids = new Set();
    for (const d of line.length ? line : [+dex]) if (G.DEX_BY[d]) for (const id of G.Moves.poolFor(G.DEX_BY[d])) ids.add(id);
    if (G.startMoveOf) ids.add(G.startMoveOf(+dex));
    const moves = [...ids].filter(okMove);
    const passives = G.LevelUp.STATS.filter(s => okPas(s.id)).map(s => s.id);
    const items = G.Items.LIST.map(it => it.id);
    return { moves, passives, items };
  }
  /** La pasiva que pide un ataque para evolucionar (o ''). */
  const needs = id => (G.Moves.EVO && G.Moves.EVO[id] ? G.Moves.EVO[id][1] || '' : '');

  // ---------------- en partida ----------------

  /** La build del jugador local (la del Pokémon con el que empezó; pl.buildDex lo pone game.js). */
  function of(pl) {
    if (!pl || pl.remote || pl.buildDex == null) return null;
    const b = get(pl.buildDex);
    return count(b) ? b : null;
  }
  /** ¿Es de tu build esta carta de nivel? (aprender, mejorar o evolucionar uno de tus ataques, o una de tus pasivas) */
  function card(pl, c) {
    const b = of(pl);
    if (!b || !c || !c.key) return false;
    const id = String(c.key).slice(String(c.key).indexOf(':') + 1);
    if (c.type === 'new' || c.type === 'up' || c.type === 'evo') return b.m.includes(id);
    if (c.type === 'stat') return b.p.includes(id);
    return false;
  }
  /** ¿Es de tu build este objeto? (clave 'id:r' o id) */
  function item(pl, k) {
    const b = of(pl), o = b && G.Items.parse(k);
    return !!(o && b.i.includes(o.id));
  }
  /** ¿Va este ataque en la fusión que has planeado? */
  const fuse = (pl, id) => { const b = of(pl); return !!(b && b.f.length >= 2 && b.f.includes(id)); };
  /** Cuánto llevas: { m: [llevas, planeados], p: [...], i: [...], done, total }. */
  function progress(pl, b = of(pl)) {
    if (!b) return null;
    const mine = new Set((pl.moves || []).map(m => m.id));
    const pas = new Set(G.LevelUp.passivesOf(pl).map(p => p.id));
    const its = new Set((pl.items || []).map(i => i.id));
    const r = { m: [b.m.filter(id => mine.has(id)).length, b.m.length], p: [b.p.filter(id => pas.has(id)).length, b.p.length],
                i: [b.i.filter(id => its.has(id)).length, b.i.length] };
    r.done = r.m[0] + r.p[0] + r.i[0];
    r.total = r.m[1] + r.p[1] + r.i[1];
    return r;
  }

  return { MAX, clean, get, set, toggle, clear, has, count, options, needs, of, card, item, fuse, progress };
})();
