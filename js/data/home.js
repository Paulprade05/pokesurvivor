/* ============ home.js — tu choza de la aldea: piezas que se compran con monedas ============
 * Pedido del dueño (12-11-2026): «quiero poder con monedas personalizar mi choza o carpa». Decisiones del dueño: se cambia
 * la forma, el techo, las paredes, el color, las luces, la decoración, un tótem y una mascota en la puerta; precios caros
 * (de 1000 a 10000 Pokémonedas: un objetivo a largo plazo). La choza se ve en la aldea (village3d.js, home).
 *
 * Guardado (core/db.js):
 *   save.hown[`cat:id`] = fecha   piezas compradas: para siempre; al fusionar dos aparatos se juntan (unión), como los
 *                                 Cristales Z. Las monedas van por la libreta, como cualquier compra.
 *   save.hset = { shape, roof, walls, color, lights, deco, totem, pet, at }   lo que llevas puesto; al fusionar gana el
 *                                 que tenga `at` más reciente. pet: el dex del Pokémon de la puerta (0: ninguno).
 * La primera pieza de cada categoría es gratis y es la de siempre (una partida vieja sin hset tiene su choza normal).
 */
G.Home = (() => {
  /*
   * Catálogo. price 0: la de serie. Los textos en español; el inglés, en lang-en.js.
   * look: lo que usa village3d.js (colores en hex).
   */
  const CATS = [
    { id: 'shape', name: 'Forma', items: [
      { id: 'hut', name: 'Choza', desc: 'Redonda, de madera y hojas.', price: 0 },
      { id: 'pod', name: 'Vaina', desc: 'Como un capullo enorme que brilla por dentro.', price: 3000 },
      { id: 'mush', name: 'Seta gigante', desc: 'Una casa dentro de una seta luminosa.', price: 6000 },
      { id: 'tree', name: 'Casa-árbol', desc: 'Un tronco hueco con su copa de techo.', price: 10000 }
    ] },
    { id: 'roof', name: 'Techo', items: [
      { id: 'leaf', name: 'Hojas', desc: 'Hojas grandes del bosque.', price: 0 },
      { id: 'straw', name: 'Paja', desc: 'Paja seca bien atada.', price: 1000 },
      { id: 'petal', name: 'Pétalos', desc: 'Pétalos de una flor gigante.', price: 3000 },
      { id: 'crystal', name: 'Cristal', desc: 'Cristal que se enciende de noche.', price: 6000 },
      { id: 'solar', name: 'Paneles', desc: 'Paneles de energía de la tribu.', price: 8000 }
    ] },
    { id: 'walls', name: 'Paredes', items: [
      { id: 'wood', name: 'Madera', desc: 'Tablas de madera.', price: 0 },
      { id: 'roots', name: 'Raíces', desc: 'Raíces trenzadas.', price: 2000 },
      { id: 'stone', name: 'Piedra con musgo', desc: 'Piedra vieja con musgo que brilla.', price: 4000 },
      { id: 'metal', name: 'Metal', desc: 'Planchas de metal con remaches.', price: 7000 }
    ] },
    { id: 'color', name: 'Color', items: [
      { id: 'natural', name: 'Natural', desc: 'Los colores del bosque.', price: 0, look: null },
      { id: 'teal', name: 'Turquesa', desc: 'Pinta el techo de turquesa.', price: 1500, look: '#2fa8a0' },
      { id: 'violet', name: 'Violeta', desc: 'Pinta el techo de violeta.', price: 1500, look: '#7a48c8' },
      { id: 'pink', name: 'Rosa', desc: 'Pinta el techo de rosa.', price: 1500, look: '#d0508a' },
      { id: 'amber', name: 'Ámbar', desc: 'Pinta el techo de ámbar.', price: 1500, look: '#d89a2a' },
      { id: 'night', name: 'Noche', desc: 'Pinta el techo de azul noche.', price: 2500, look: '#2e3a7a' },
      { id: 'gold', name: 'Oro', desc: 'Techo dorado. Para presumir.', price: 9000, look: '#e8b838' }
    ] },
    { id: 'lights', name: 'Luces', items: [
      { id: 'cyan', name: 'Cian', desc: 'La luz de siempre del bosque.', price: 0, look: '#5ff0ff' },
      { id: 'green', name: 'Verde', desc: 'Luz verde de luciérnaga.', price: 1500, look: '#7cff7a' },
      { id: 'pink', name: 'Rosa', desc: 'Luz rosa de flor.', price: 1500, look: '#ff7ad8' },
      { id: 'amber', name: 'Ámbar', desc: 'Luz cálida de farol.', price: 1500, look: '#ffc04a' },
      { id: 'rainbow', name: 'Arcoíris', desc: 'Cambia de color poco a poco.', price: 7000, look: 'rainbow' }
    ] },
    { id: 'deco', name: 'Decoración', items: [
      { id: 'none', name: 'Nada', desc: 'Sin adornos.', price: 0 },
      { id: 'pots', name: 'Macetas', desc: 'Setas y flores que brillan en la puerta.', price: 1500 },
      { id: 'flags', name: 'Banderines', desc: 'Una guirnalda de banderines.', price: 2500 },
      { id: 'lanterns', name: 'Farolillos', desc: 'Farolillos colgados alrededor.', price: 3500 },
      { id: 'antenna', name: 'Antena', desc: 'Una antena de la tribu en el tejado.', price: 5000 },
      { id: 'holo', name: 'Holograma', desc: 'Tu Pokémon en un holograma que gira.', price: 8000 }
    ] },
    { id: 'totem', name: 'Tótem', items: [
      { id: 'none', name: 'Ninguno', desc: 'Sin tótem.', price: 0 },
      { id: 'wood', name: 'Tótem de madera', desc: 'Tallado por los Pokémon de la aldea.', price: 3000 },
      { id: 'holo', name: 'Tótem holográfico', desc: 'Madera con pantallas que brillan.', price: 7000 },
      { id: 'crystal', name: 'Tótem de cristal', desc: 'Un cristal enorme que flota y gira.', price: 10000 }
    ] },
    { id: 'pet', name: 'Mascota', items: [
      { id: 'bed', name: 'Cojín para mascota', desc: 'Uno de tus Pokémon descansa en tu puerta. Lo eliges tú y lo cambias gratis.', price: 4000 }
    ] }
  ];
  const BY = {};
  for (const c of CATS) { BY[c.id] = c; c.by = {}; for (const it of c.items) c.by[it.id] = it; }
  /** Las categorías de un solo valor (todas menos la mascota). */
  const SLOTS = CATS.filter(c => c.id !== 'pet').map(c => c.id);
  const DEFAULT = Object.fromEntries(SLOTS.map(k => [k, BY[k].items[0].id]));

  const save = () => G.DB && G.DB.save;
  const item = (cat, id) => BY[cat] && BY[cat].by[id];
  /** ¿Es tuya esta pieza? (las de serie, siempre) */
  function owns(cat, id) {
    const it = item(cat, id), s = save();
    if (!it) return false;
    if (!it.price) return true;
    return !!(s && s.hown && s.hown[cat + ':' + id]);
  }
  /** Lo que llevas puesto (con lo de serie en lo que falte o no sea tuyo). */
  function current(s = save()) {
    const h = (s && s.hset) || {}, out = {};
    for (const k of SLOTS) out[k] = item(k, h[k]) && (!s || ownsIn(s, k, h[k])) ? h[k] : DEFAULT[k];
    out.pet = s && ownsIn(s, 'pet', 'bed') && h.pet && s.owned && s.owned[h.pet] && G.DEX_BY && G.DEX_BY[h.pet] ? +h.pet : 0;
    return out;
  }
  function ownsIn(s, cat, id) { const it = item(cat, id); return !!it && (!it.price || !!(s.hown && s.hown[cat + ':' + id])); }

  /** Compra una pieza. → { ok, error? } (no se pone sola: eso lo hace wear) */
  function buy(cat, id) {
    const s = save(), it = item(cat, id);
    if (!s || !it) return { ok: false };
    if (owns(cat, id)) return { ok: false, error: 'Ya es tuya.' };
    if ((s.coins || 0) < it.price) return { ok: false, error: 'No tienes Pokémonedas suficientes.' };
    s.coins -= it.price;
    s.hown = s.hown || {};
    s.hown[cat + ':' + id] = Date.now();
    G.DB.commit(true);
    return { ok: true };
  }
  /** Se pone una pieza tuya (o la mascota: wear('pet', dex)). → true si ha cambiado algo */
  function wear(cat, id) {
    const s = save();
    if (!s) return false;
    const cur = current(s);
    if (cat === 'pet') {
      const d = +id || 0;
      if (d && (!owns('pet', 'bed') || !s.owned[d])) return false;
      if (cur.pet === d) return false;
      s.hset = Object.assign({}, cur, { pet: d, at: Date.now() });
    } else {
      if (!owns(cat, id) || cur[cat] === id) return false;
      s.hset = Object.assign({}, cur, { [cat]: id, at: Date.now() });
    }
    G.DB.commit(true);
    return true;
  }
  /** Limpia lo guardado (db.js, al cargar): piezas que existen con su fecha; lo puesto, con valores válidos. */
  function clean(s, n) {
    if (!s.hown || typeof s.hown !== 'object' || Array.isArray(s.hown)) s.hown = {};
    for (const k of Object.keys(s.hown)) {
      const [c, id] = k.split(':'), it = item(c, id);
      if (!it || !it.price || !n(s.hown[k])) delete s.hown[k]; else s.hown[k] = n(s.hown[k]);
    }
    const h = s.hset;
    if (!h || typeof h !== 'object' || Array.isArray(h)) { s.hset = {}; return; }
    for (const k of Object.keys(h)) {
      if (k === 'at') { h.at = n(h.at); continue; }
      if (k === 'pet') { h.pet = Number.isFinite(+h.pet) && +h.pet > 0 ? Math.floor(+h.pet) : 0; continue; }
      if (!SLOTS.includes(k) || !item(k, h[k])) delete h[k];
    }
  }
  /** Fusión de dos partidas (db.js merge): piezas, unión; lo puesto, lo último que se eligió. */
  function merge(r, older) {
    r.hown = Object.assign({}, older.hown || {}, r.hown || {});
    const a = r.hset || {}, b = older.hset || {};
    if ((+b.at || 0) > (+a.at || 0)) r.hset = JSON.parse(JSON.stringify(b));
    else r.hset = a;
  }
  /** Cuántas piezas compradas (para el perfil y las pruebas). */
  const count = (s = save()) => Object.keys((s && s.hown) || {}).length;

  return { CATS, BY, SLOTS, DEFAULT, item, owns, current, buy, wear, clean, merge, count };
})();
