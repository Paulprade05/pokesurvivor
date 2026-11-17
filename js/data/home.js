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

  /*
   * ---------------- el interior de tu choza (17-11-2026) ----------------
   * Pedido del dueño: «quiero poder entrar dentro de ella y personalizarla e invitar pokémon a ella para que vivan».
   * Se entra por la puerta (world/home-in.js); dentro se ponen, mueven y quitan muebles y adornos, se cambia el suelo y la
   * pared y se invita a vivir a tus Pokémon (pasean dentro y fuera, por el barrio). Mismas reglas que la choza: lo de serie
   * es gratis y lo demás se compra una vez con monedas (hown 'floor:id', 'wallp:id', 'furn:id'; un mueble comprado se puede
   * poner hasta MAX_COPIES veces). Arte: tools/pxl/choza.px.js → assets/pxl/chozain.png.
   *
   * Guardado: save.hin = { v: 1, floor, wall, items: [{ id, x, y, f }], guests: [dex], at }
   *   items: muebles en casillas del suelo (x 0..ROOM.W-1, y 0..ROOM.H-1, la de arriba a la izquierda) o en la pared
   *   (wall: y = -1). f: volteado. guests: tus Pokémon que viven aquí (hasta MAX_GUESTS). Al fusionar, gana el `at` más
   *   reciente, como lo puesto fuera. Una partida sin hin (de antes del 17-11-2026) recibe la habitación de serie y, si
   *   tenía mascota en la puerta, esa mascota pasa a vivir dentro (migrateRoom).
   * Casillas: el suelo es de ROOM.W × ROOM.H; la puerta, abajo en medio (DOOR: sus columnas): ahí no se pone nada que
   * choque, para poder salir siempre.
   */
  const ROOM = { W: 12, H: 7 };
  const DOOR = [5, 6];
  const MAX_GUESTS = 4, MAX_ITEMS = 24, MAX_COPIES = 3;
  const IN_CATS = [
    { id: 'furn', name: 'Muebles', items: [
      { id: 'bed', name: 'Cama de paja', desc: 'Un nido grande y blandito.', price: 0, w: 2, h: 2 },
      { id: 'table', name: 'Mesa redonda', desc: 'De un tronco cortado.', price: 0, w: 2, h: 1 },
      { id: 'lamp', name: 'Farol-seta', desc: 'Una seta que alumbra de cian.', price: 0, w: 1, h: 1, glow: '#5ff0ff' },
      { id: 'window', name: 'Ventana', desc: 'Se ve la luna del bosque.', price: 0, w: 1, wall: true },
      { id: 'stool', name: 'Taburete-seta', desc: 'Para sentarse un rato.', price: 1000, w: 1, h: 1 },
      { id: 'plant', name: 'Maceta', desc: 'Un helecho que brilla un poco.', price: 1000, w: 1, h: 1 },
      { id: 'chest', name: 'Baúl', desc: 'Para guardar tesoros.', price: 1500, w: 1, h: 1 },
      { id: 'rug', name: 'Alfombra de hojas', desc: 'Hojas tejidas. Se pisa.', price: 2000, w: 3, h: 2, flat: true },
      { id: 'painting', name: 'Cuadro del portal', desc: 'El Altar del Portal, pintado.', price: 2000, w: 1, wall: true },
      { id: 'cushion', name: 'Cojín Poké Ball', desc: 'A tus Pokémon les encanta. Se pisa.', price: 2500, w: 1, h: 1, flat: true },
      { id: 'shelf', name: 'Estantería', desc: 'Libros y frascos que brillan.', price: 3000, w: 2, h: 1 },
      { id: 'garland', name: 'Guirnalda de luces', desc: 'Luces de colores en la pared.', price: 3000, w: 2, wall: true, glow: '#ff7ad8' },
      { id: 'sofa', name: 'Sofá de musgo', desc: 'Musgo blando sobre raíces.', price: 3500, w: 2, h: 1 },
      { id: 'crystal', name: 'Cristal de luz', desc: 'Un cristal de la tribu que brilla rosa.', price: 4000, w: 1, h: 1, glow: '#ff7ad8' },
      { id: 'stove', name: 'Hornillo', desc: 'Calienta la choza y huele a bayas.', price: 5000, w: 2, h: 1, glow: '#ffc04a' },
      { id: 'tank', name: 'Pecera', desc: 'Agua que brilla con algas.', price: 6000, w: 2, h: 1, glow: '#5ff0ff' }
    ] },
    { id: 'floor', name: 'Suelo', items: [
      { id: 'wood', name: 'Tablas', desc: 'Suelo de tablas de madera.', price: 0 },
      { id: 'moss', name: 'Musgo', desc: 'Musgo blando que brilla un poco.', price: 1500 },
      { id: 'weave', name: 'Hojas tejidas', desc: 'Hojas grandes trenzadas.', price: 2000 },
      { id: 'stone', name: 'Losas', desc: 'Losas de piedra con musgo.', price: 2500 },
      { id: 'crystal', name: 'Cristal', desc: 'Baldosas de cristal de la tribu.', price: 5000 }
    ] },
    { id: 'wallp', name: 'Pared', items: [
      { id: 'wood', name: 'Tablas', desc: 'Paredes de tablas.', price: 0 },
      { id: 'roots', name: 'Raíces', desc: 'Raíces trenzadas.', price: 1500 },
      { id: 'leaf', name: 'Hojas', desc: 'Hojas grandes del bosque.', price: 2000 },
      { id: 'stone', name: 'Piedra con musgo', desc: 'Piedra vieja con musgo que brilla.', price: 2500 },
      { id: 'metal', name: 'Metal de la tribu', desc: 'Planchas con luces.', price: 4000 }
    ] }
  ];
  const IN_BY = {};
  for (const c of IN_CATS) { IN_BY[c.id] = c; c.by = {}; for (const it of c.items) c.by[it.id] = it; }
  /** La habitación de serie (y la de una partida vieja). */
  const DEFAULT_ITEMS = [{ id: 'bed', x: 0, y: 0, f: 0 }, { id: 'table', x: 7, y: 2, f: 0 }, { id: 'lamp', x: 11, y: 0, f: 0 }, { id: 'window', x: 3, y: -1, f: 0 }];

  const save = () => G.DB && G.DB.save;
  const item = (cat, id) => (BY[cat] && BY[cat].by[id]) || (IN_BY[cat] && IN_BY[cat].by[id]);
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

  // ---------------- el interior ----------------
  const furn = id => IN_BY.furn.by[id];
  /** Las casillas que ocupa un mueble puesto en (x, y). */
  function cells(it, x, y) {
    const f = furn(it.id || it), out = [];
    if (!f) return out;
    for (let j = 0; j < (f.wall ? 1 : f.h); j++) for (let i = 0; i < f.w; i++) out.push([x + i, y + j]);
    return out;
  }
  /**
   * ¿Se puede poner el mueble id en (x, y)? skip: el índice de un mueble que se está moviendo (no cuenta).
   * Dentro de la habitación, sin pisar a otro de su misma capa (lo que choca con lo que choca, lo plano con lo plano, los
   * de la pared con los de la pared) y sin tapar la puerta con algo que choque.
   */
  function fits(items, id, x, y, skip = -1) {
    const f = furn(id);
    if (!f || !Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (f.wall) { if (y !== -1 || x < 0 || x + f.w > ROOM.W) return false; }
    else if (x < 0 || y < 0 || x + f.w > ROOM.W || y + f.h > ROOM.H) return false;
    const mine = cells(id, x, y);
    if (!f.wall && !f.flat && mine.some(([cx, cy]) => cy === ROOM.H - 1 && DOOR.includes(cx))) return false;
    const layer = g => (g.wall ? 'w' : g.flat ? 'f' : 's');
    for (let k = 0; k < items.length; k++) {
      if (k === skip) continue;
      const o = items[k], g = furn(o.id);
      if (!g || layer(g) !== layer(f)) continue;
      const theirs = cells(o.id, o.x, o.y);
      if (mine.some(([a, b]) => theirs.some(([c, d]) => a === c && b === d))) return false;
    }
    return true;
  }
  /** La habitación de serie; la mascota de la puerta (si la había) pasa a vivir dentro. */
  function defaultRoom(s) {
    const pet = s && s.hset && +s.hset.pet;
    return { v: 1, floor: 'wood', wall: 'wood', items: DEFAULT_ITEMS.map(o => Object.assign({}, o)),
      guests: pet && s.owned && s.owned[pet] ? [pet] : [], at: 0 };
  }
  /** Partida de antes del interior (sin hin): la habitación de serie. → true si ha cambiado algo. */
  function migrateRoom(s) {
    if (s.hin && typeof s.hin === 'object' && !Array.isArray(s.hin)) return false;
    s.hin = defaultRoom(s);
    return true;
  }
  /** Lo que hay dentro (sin tocar lo guardado; lo de serie si no hay nada). */
  function room(s = save()) {
    const h = s && s.hin;
    if (!h || typeof h !== 'object') return defaultRoom(s);
    return { v: 1, floor: ownsIn(s, 'floor', h.floor) ? h.floor : 'wood', wall: ownsIn(s, 'wallp', h.wall) ? h.wall : 'wood',
      items: Array.isArray(h.items) ? h.items : [], guests: Array.isArray(h.guests) ? h.guests : [], at: +h.at || 0 };
  }
  /** Limpia el interior guardado (db.js, al cargar; también migra las partidas viejas). n: números de db.js. */
  function cleanRoom(s, n) {
    migrateRoom(s);
    const h = s.hin;
    h.v = 1;
    h.at = n(h.at);
    if (!item('floor', h.floor)) h.floor = 'wood';
    if (!item('wallp', h.wall)) h.wall = 'wood';
    const raw = Array.isArray(h.items) ? h.items : [], items = [], per = {};
    for (const o of raw) {
      if (!o || typeof o !== 'object' || !furn(o.id) || items.length >= MAX_ITEMS) continue;
      const it = { id: String(o.id), x: Math.round(+o.x), y: Math.round(+o.y), f: o.f ? 1 : 0 };
      if ((per[it.id] || 0) >= MAX_COPIES || !fits(items, it.id, it.x, it.y)) continue;
      per[it.id] = (per[it.id] || 0) + 1;
      items.push(it);
    }
    h.items = items;
    const g = [];
    for (const d of Array.isArray(h.guests) ? h.guests : []) {
      const x = Math.floor(+d);
      if (x > 0 && !g.includes(x) && g.length < MAX_GUESTS && (!s.owned || s.owned[x])) g.push(x);
    }
    h.guests = g;
    for (const k of Object.keys(h)) if (!['v', 'floor', 'wall', 'items', 'guests', 'at'].includes(k)) delete h[k];
  }
  /** Copia de lo de dentro para cambiarla y guardarla (con lo de serie si era una partida vieja). */
  function edit(fn) {
    const s = save();
    if (!s) return false;
    migrateRoom(s);
    const r = room(s), next = { v: 1, floor: r.floor, wall: r.wall, items: r.items.map(o => Object.assign({}, o)), guests: r.guests.slice(), at: r.at };
    if (fn(next, s) === false) return false;
    next.at = Date.now();
    s.hin = next;
    G.DB.commit(true);
    return true;
  }
  /** Cuántos de ese mueble hay puestos. */
  const placed = (id, s = save()) => room(s).items.filter(o => o.id === id).length;
  /** Pone un mueble tuyo. → { ok, error? } */
  function place(id, x, y, f = 0) {
    const it = furn(id);
    if (!it) return { ok: false };
    if (!owns('furn', id)) return { ok: false, error: 'Aún no es tuyo.' };
    const r = room();
    if (r.items.length >= MAX_ITEMS) return { ok: false, error: 'No cabe nada más.' };
    if (placed(id) >= MAX_COPIES) return { ok: false, error: 'Ya tienes puestos todos los que caben de este.' };
    if (!fits(r.items, id, x, y)) return { ok: false, error: 'Ahí no cabe.' };
    edit(h => { h.items.push({ id, x, y, f: f ? 1 : 0 }); });
    return { ok: true };
  }
  /** Mueve el mueble i a (x, y). */
  function move(i, x, y) {
    const r = room(), o = r.items[i];
    if (!o || !fits(r.items, o.id, x, y, i)) return false;
    return edit(h => { h.items[i].x = x; h.items[i].y = y; });
  }
  function remove(i) { return !!room().items[i] && edit(h => { h.items.splice(i, 1); }); }
  function flip(i) { return !!room().items[i] && edit(h => { h.items[i].f = h.items[i].f ? 0 : 1; }); }
  /** Suelo o pared tuyos (cat: 'floor' | 'wallp'). */
  function setSurface(cat, id) {
    if (!owns(cat, id)) return false;
    const key = cat === 'floor' ? 'floor' : 'wall';
    if (room()[key] === id) return false;
    return edit(h => { h[key] = id; });
  }
  /** Invita a vivir a uno de tus Pokémon (o deja de vivir aquí). → { ok, error? } */
  function invite(dex) {
    const s = save(), d = +dex;
    if (!s || !s.owned || !s.owned[d]) return { ok: false };
    const r = room();
    if (r.guests.includes(d)) return { ok: false, error: 'Ya vive aquí.' };
    if (r.guests.length >= MAX_GUESTS) return { ok: false, error: 'Tu choza está llena.' };
    edit(h => { h.guests.push(d); });
    return { ok: true };
  }
  function uninvite(dex) { const d = +dex; return room().guests.includes(d) && edit(h => { h.guests = h.guests.filter(g => g !== d); }); }
  /** Fusión: lo de dentro, lo último que se cambió. */
  function mergeRoom(r, older) {
    const a = r.hin, b = older.hin;
    if (b && typeof b === 'object' && (!a || (+b.at || 0) > (+a.at || 0))) r.hin = JSON.parse(JSON.stringify(b));
  }

  return { CATS, BY, SLOTS, DEFAULT, item, owns, current, buy, wear, clean: (s, n) => { clean(s, n); cleanRoom(s, n); },
    merge: (r, o) => { merge(r, o); mergeRoom(r, o); }, count,
    ROOM, DOOR, MAX_GUESTS, MAX_ITEMS, MAX_COPIES, IN_CATS, IN_BY, DEFAULT_ITEMS, furn, cells, fits, room, migrateRoom, cleanRoom,
    defaultRoom, placed, place, move, remove, flip, setSurface, invite, uninvite };
})();
