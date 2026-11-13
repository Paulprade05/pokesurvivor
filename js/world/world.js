/* ============ world.js — arena abierta infinita con obstáculos ============
 *
 * Terreno por tile, determinista (ruido de valor con semilla):
 *   floor   suelo (con manchas de tierra)
 *   wall    formaciones rocosas: bloquean a quien camina y a los proyectiles
 *   liquid  agua (ralentiza) o lava en el volcán (quema)
 *
 * Objetos del escenario (props), dibujados ordenados por Y con las entidades:
 *   tree    bloquea, indestructible (cobertura)
 *   rock    bloquea, se rompe; puede soltar experiencia, monedas o bayas
 *   chest   bloquea, los ataques no le hacen nada; se abre con el botón (interact.js) y suelta un buen botín
 *   grass   hierba alta, no bloquea; se corta con cualquier ataque
 *   altar   torre de poder: al tocarla da un poder temporal (una vez)
 *   spring  manantial: cura mientras estás encima; se agota y se recarga
 *   bigchest cofre con candado: se abre manteniendo pulsado el botón a su lado unos segundos
 *   trap    trampa (veneno, pegajosa, explosiva): salta al pisarla, también
 *           con los enemigos
 *   (la lógica de los interactivos está en systems/interact.js; cómo se
 *   reparten torres, manantiales y cofres, en blockSpecial)
 *
 * Grieta: setArena() convierte una zona lejana del mapa en una arena redonda
 * cerrada por paredes, donde se lucha contra un legendario (systems/rift.js).
 *
 * Los Pokémon que flotan y los jefes del calendario ignoran el terreno. El resto
 * choca con él; desde la 2.0 (bloque 4) algunos tipos lo usan a su manera (los
 * fantasma atraviesan paredes un rato, los Tierra/Roca excavan, los Agua nadan):
 * ver systems/enemy-ai.js.
 *
 * (2.0, bloque 6) Dibujo: con los tilesets de Mundo Misterioso (world/tileset.js) si están y el interruptor de
 * Ajustes está encendido; si no, el pintor de tiles.js. El terreno se limpia (sin paredes sueltas: cada pared es
 * parte de un bloque de 2×2), las arboledas dejan paso entre troncos y ya no hay caminos de tierra (WV 3).
 * (Bloque 6b) Los objetos, con el mismo interruptor: los árboles son la pieza de pared suelta del tileset, cofres y
 * trampas los de PMD y lo demás con la paleta del tileset a 24 px por casilla; en las arboledas, entre dos árboles
 * queda siempre una casilla libre (WV 4): como cada árbol se ve como un trozo de pared, lo que parece paso es paso.
 *
 * Coordenadas: (x, y) de una entidad = sus PIES, en el plano del suelo.
 * Los chunks se separan en DATOS (baratos, siempre) e IMAGEN (horneada a
 * resolución de arte y sólo para los visibles).
 */
G.World = (() => {
  /*
   * (2.0) Casilla de 24 px de arte (TS = 48), como en Mundo Misterioso: un Pokémon ocupa
   * una casilla (antes, 16 px de arte y TS = 32: se veían 1,5 veces más grandes que el
   * suelo). Las distancias del mundo no cambian: lo que iba en casillas se ha pasado ×2/3.
   * El pintor de respaldo (tiles.js) sigue pintando 16 px por casilla (PT): su imagen se
   * dibuja a GS = 3 unidades de mundo por píxel (entero: no deforma el pixel art).
   * WV: versión del generador del mundo. En cooperativo, todos tienen que tener la misma
   * (social-ui.js): con otra, cada uno vería otras paredes y otra arena.
   */
  const PT = G.Tiles.T;                    // px del pintor por tile (16)
  const N = 16;                            // tiles por chunk
  const TS = 48;                           // tamaño de tile en mundo
  const GS = TS / PT;                      // unidades de mundo por px del pintor (3)
  const CW = N * TS;                       // tamaño de chunk en mundo (768)
  const WV = 4;                            // versión del mundo (1: casillas de 32, sin `wv`; 2: casillas de 48; 3: terreno
                                           //  limpio y arboledas con paso, bloque 6; 4: arboledas con una casilla libre
                                           //  entre árboles, bloque 6b)
  const FLOOR = 0, WALL = 1, LIQUID = 2;
  const KIND = ['floor', 'wall', 'liquid'];

  let seed = 1, biome = 0;
  let arena = null;                        // { tx, ty, r } en tiles
  // (2.0, bloque 4) Claves numéricas (sin crear textos: walkable/collide se llaman miles de veces por fotograma)
  //  y el último chunk consultado a mano. Antes el 93 % de construir un campo de pathing.js eran claves "cx,cy".
  const data = new Map();                  // ckey(cx, cy) -> datos del chunk
  const ckey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
  let lastC = null;                        // último chunk devuelto por chunkAt
  let gen = null;                          // terreno de prueba (tests): (tx, ty, base) -> FLOOR/WALL/LIQUID
  let images = new Map();                  // "cx,cy" -> canvas horneado
  // Cambio de bioma: durante FADE segundos se funde la paleta vieja con la nueva.
  const FADE = 2.6;
  let fade = null;                         // { from, images, t }
  // (Bloque 6, revisión: 24 como pide §11.3. Con el tileset cada imagen es de 384 px (576 KB) y en el fundido hay dos
  //  cachés: con 48 eran hasta ~56 MB en el móvil. Se ven como mucho ~12 chunks, también en Ultra.)
  const MAX_IMAGES = 24, MAX_DATA = 400;
  // (iPhone: pantalla negra, 01-11-2026) Los chunks que se tiran se sueltan ya (G.U.freeCanvas): Safari cuenta
  //  la memoria de un lienzo hasta que el recolector pasa, y con su tope lleno los nuevos salen en negro.
  const EMPTY = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 1, height: 1 }) : null;
  let bakeWait = 0;
  function dropImages(m) { if (!m) return; for (const c of m.values()) G.U.freeCanvas(c); m.clear(); }
  const broken = new Set();                // props destruidos: "tx,ty"
  let nextPropId = 1;

  // ---------------- ruido ----------------

  // El mismo hash que G.U.hash (mismos números), local: el ruido del terreno lo llama mucho.
  function H(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = H(xi, yi, s), b = H(xi + 1, yi, s), c = H(xi, yi + 1, s), d = H(xi + 1, yi + 1, s);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.65 + vnoise(x * 2.13 + 17, y * 2.13 - 9, s + 1) * 0.35;

  /** Terreno "puro" de un tile (sin caché). */
  function arenaDist(tx, ty) { return arena ? Math.hypot(tx - arena.tx, ty - arena.ty) : Infinity; }

  /**
   * Pasillo libre de la arena: donde aparecéis (sur) y el legendario (norte).
   * Con `clear` en el tema, además un claro donde aterriza Arceus (160 al norte; `clear`
   * va en casillas de 32). (2.0: en casillas de 48; antes |lx| ≤ 2, ly en [-6, 5] y 2,5.)
   */
  function arenaSafe(tx, ty) {
    const lx = tx - arena.tx, ly = ty - arena.ty;
    return (Math.abs(lx) <= 1 && ly >= -4 && ly <= 3) || Math.hypot(lx, ly) < 1.7 ||
           (arena.th.clear > 0 && Math.hypot(lx, ly + 160 / TS) < arena.th.clear * 32 / TS);
  }

  function terrainRaw(tx, ty) {
    if (gen) return gen(tx, ty, terrainBase(tx, ty));
    const ad = arenaDist(tx, ty);
    if (ad < arena_outer()) {
      if (ad >= arena.r) return WALL;
      if (arenaSafe(tx, ty)) return FLOOR;
      const th = arena.th;
      // Columnas de 2×2 (cobertura) y charcos según el tipo de la arena.
      // (2.0: columnas de una casilla de 48, casi como las de 2×2 de 32.)
      if (th.pillars && ad < arena.r - 1.3 && H(tx, ty, seed + 31 + arena.tx) < th.pillars) return WALL;
      if (th.pools && ad < arena.r - 1 && fbm(tx / 2.13, ty / 2.13, seed + 37 + arena.tx) < th.pools) return LIQUID;
      return FLOOR;
    }
    return terrainBase(tx, ty);
  }

  /**
   * (2.0, bloque 6) Terreno sin la arena de la grieta, limpio: una pared que no es parte de ningún bloque de 2×2 de pared
   * es suelo (antes un 6 % de las paredes iban sueltas o en tiras de una casilla: con el tileset se ven como manchas y
   * hacían pasillos de una casilla). Sólo semilla y coordenadas: todos ven lo mismo.
   */
  function terrainBase(tx, ty) {
    const t = terrainNoise(tx, ty);
    if (t !== WALL) return t;
    const w = (a, b) => terrainNoise(tx + a, ty + b) === WALL;
    const n = w(0, -1), s = w(0, 1), e = w(1, 0), o = w(-1, 0);
    if ((n && e && w(1, -1)) || (n && o && w(-1, -1)) || (s && e && w(1, 1)) || (s && o && w(-1, 1))) return WALL;
    return FLOOR;
  }

  /** El ruido del terreno, sin limpiar. */
  function terrainNoise(tx, ty) {
    const d = Math.hypot(tx, ty);
    if (d < 6) return FLOOR;                          // claro inicial
    const ramp = G.U.clamp((d - 6) / 5.33, 0, 1);    // aparición suave
    if (fbm(tx / 8.67, ty / 8.67, seed + 101) < 0.04 + 0.23 * ramp) return LIQUID;
    if (fbm(tx / 5.33, ty / 5.33, seed + 202) > 1 - 0.27 * ramp) return WALL;
    return FLOOR;
  }

  // ---------------- datos de chunk ----------------

  function chunkData(cx, cy) {
    const k = ckey(cx, cy);
    let c = data.get(k);
    if (c) return c;

    // solid: 1 si la casilla bloquea (pared u objeto sólido); pa: el objeto sólido de cada casilla.
    // (El líquido que hace daño depende del bioma: se mira aparte con terr.)
    c = { cx, cy, terr: new Uint8Array(N * N), solid: new Uint8Array(N * N), pa: new Array(N * N).fill(null),
          props: [], liquids: [] };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j;
      const t = terrainRaw(tx, ty);
      c.terr[j * N + i] = t;
      if (t === LIQUID) c.liquids.push(tx, ty);
    }
    if (data.size > MAX_DATA) { data.delete(data.keys().next().value); lastC = null; }
    data.set(k, c);
    if (!gen) placeProps(c);
    for (let i = 0; i < N * N; i++) c.solid[i] = c.terr[i] === WALL || c.pa[i] ? 1 : 0;
    return c;
  }

  /** El chunk de la casilla (tx, ty), sin crear textos (el último, guardado). */
  function chunkAt(tx, ty) {
    const cx = Math.floor(tx / N), cy = Math.floor(ty / N);
    if (lastC && lastC.cx === cx && lastC.cy === cy) return lastC;
    return (lastC = data.get(ckey(cx, cy)) || chunkData(cx, cy));
  }
  /** Pone el objeto sólido p en su casilla (o lo quita: p = null). */
  function setSolidProp(c, tx, ty, p) {
    const i = (ty - c.cy * N) * N + (tx - c.cx * N);
    c.pa[i] = p;
    c.solid[i] = p || c.terr[i] === WALL ? 1 : 0;
  }

  function terrainAt(tx, ty) {
    const c = chunkAt(tx, ty);
    return c.terr[(ty - c.cy * N) * N + (tx - c.cx * N)];
  }

  const arena_outer = () => (arena ? arena.r + 4.67 : 0);

  // ---------------- interactivos: un reparto justo ----------------
  /*
   * Torres de poder (altares), manantiales, cofres con candado y cofres. Antes cada
   * casilla tiraba su dado y salía muy desigual: a 2 pantallas del inicio, el 16 % de
   * las partidas no tenía ninguna torre y el 27 % ningún cofre con candado, y otras
   * tenían 7 u 8 (medido en 300 semillas).
   *
   * Ahora el mapa se parte en bloques de BLK×BLK casillas y los bloques se agrupan
   * de LOT×LOT en «lotes». Cada lote reparte su baraja (RATES: cuántos de cada uno
   * lleva, de media) en bloques distintos elegidos al azar, y cada uno cae en un
   * sitio al azar de su bloque, lejos de sus bordes (MARGIN: dos nunca quedan a menos
   * de 2·MARGIN casillas) y con suelo libre alrededor (sin agua ni muros: ROOM).
   * La parte con decimales (0,8 cofres con candado por lote...) se reparte entre lotes
   * vecinos con una secuencia de baja discrepancia: de cada 5 lotes, 4 lo llevan.
   * El lote del inicio va centrado en el claro (con unas casillas de juego según la
   * semilla) y lleva uno de cada, alrededor del claro: toda partida tiene una torre, un
   * manantial, un cofre con candado y un cofre a menos de 2 pantallas del principio.
   *
   * Todo sale de la semilla y de las coordenadas (con el terreno SIN la arena de la
   * grieta), nunca del orden en que se crean los chunks: en cooperativo todos ven lo
   * mismo, y un chunk que se olvida y se vuelve a crear sale igual.
   */
  // (2.0, casillas de 48: BLK 20 → 13, MARGIN 3 → 2, START_CLEAR 14 → 9, ROOM/CLEAR 2 → 1; el mismo reparto por superficie.)
  const BLK = 13, LOT = 3, MARGIN = 2, TRIES = 14, HOME_PICK = 8;
  const RATES = [['altar', 1.2], ['spring', 1], ['bigchest', 0.8], ['chest', 1.3]];
  const ROOM = { altar: 1, spring: 1, bigchest: 1, chest: 1 };    // suelo libre alrededor (casillas)
  const CLEAR = { altar: 1, spring: 1, bigchest: 1, chest: 1 };   // sin árboles, rocas, hierba ni trampas alrededor
  const START_CLEAR = 9;                                           // nada de esto en el claro del principio
  const lots = new Map(), blocks = new Map();
  let offX = 0, offY = 0;

  /** Qué lleva cada bloque de un lote (9 casillas: tipo o null). */
  function lotDeck(gx, gy) {
    const k = gx + ',' + gy;
    let deck = lots.get(k);
    if (deck) return deck;
    const n = LOT * LOT, start = gx === 0 && gy === 0, mid = (n - 1) / 2;
    const cells = [];
    // (El bloque del centro del lote del inicio es el claro: allí no va nada.)
    for (let i = 0; i < n; i++) if (!start || i !== mid) cells.push(i);
    for (let i = cells.length - 1; i > 0; i--) {  // barajar (Fisher-Yates con la semilla)
      const j = Math.floor(H(gx, gy, seed + 960 + i) * (i + 1));
      const t = cells[i]; cells[i] = cells[j]; cells[j] = t;
    }
    deck = new Array(n).fill(null);
    const adj = (a, b) => Math.abs(a % LOT - b % LOT) <= 1 && Math.abs(Math.floor(a / LOT) - Math.floor(b / LOT)) <= 1;
    RATES.forEach(([type, rate], r) => {
      // Secuencia R2 (baja discrepancia) para la parte decimal.
      const v = (gx * 0.7548776662 + gy * 0.5698402910 + H(r, 5, seed + 975)) % 1;
      let count = start ? 1 : Math.floor(rate) + ((v + 1) % 1 < rate % 1 ? 1 : 0);
      let first = -1;
      while (count-- > 0 && cells.length) {
        // El segundo del mismo tipo, en un bloque que no toque al primero (si se puede).
        let pick = 0;
        if (first >= 0) { const f = cells.findIndex(c => !adj(c, first)); if (f >= 0) pick = f; }
        const cell = cells.splice(pick, 1)[0];
        deck[cell] = type;
        if (first < 0) first = cell;
      }
    });
    // En el lote del inicio, si uno no cabe en su bloque (un lago entero), pasa a otro libre.
    if (start) {
      const at = c => [gx * LOT + c % LOT, gy * LOT + Math.floor(c / LOT)];
      for (let c = 0; c < n; c++) {
        if (!deck[c] || placeIn(...at(c), deck[c])) continue;
        const f = cells.findIndex(e => placeIn(...at(e), deck[c]));
        if (f >= 0) { deck[cells.splice(f, 1)[0]] = deck[c]; deck[c] = null; }
      }
    }
    if (lots.size > 3000) lots.clear();
    lots.set(k, deck);
    return deck;
  }

  /** ¿Hay suelo (sin agua ni muros) en todo el cuadrado de radio r? */
  function roomy(tx, ty, r) {
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (terrainBase(tx + a, ty + b) !== FLOOR) return false;
    return true;
  }

  /** Dónde cae un `type` en el bloque (bx, by): { type, tx, ty, kind } o null si no cabe. */
  function placeIn(bx, by, type) {
    const x0 = bx * BLK - offX + MARGIN, y0 = by * BLK - offY + MARGIN, span = BLK - 2 * MARGIN;
    const home = Math.floor(bx / LOT) === 0 && Math.floor(by / LOT) === 0;
    const tries = home ? TRIES * 3 : TRIES;      // los del inicio, casi seguro
    // Los del inicio, además, hacia el claro: de los HOME_PICK primeros sitios que valen,
    // el más cercano (probado en partidas el 24-10-2026: antes, 7 de cada 20 no tenían
    // ninguna torre a menos de 900 px del principio; con esto se ven en el primer paseo).
    let best = null, bestD = Infinity, valid = 0;
    for (let a = 0; a < tries; a++) {
      const tx = x0 + Math.floor(H(bx, by, seed + 981 + a * 2) * span);
      const ty = y0 + Math.floor(H(bx, by, seed + 982 + a * 2) * span);
      const d = Math.hypot(tx, ty);
      if (d < START_CLEAR || !roomy(tx, ty, ROOM[type])) continue;
      if (d < bestD) { bestD = d; best = { tx, ty }; }
      if (!home || ++valid >= HOME_PICK) break;
    }
    return best && { type, tx: best.tx, ty: best.ty, kind: Math.floor(H(best.tx, best.ty, seed + 910) * (type === 'altar' ? 4 : 1)) };
  }

  /** El interactivo del bloque (bx, by), o null. */
  function blockSpecial(bx, by) {
    const k = bx + ',' + by;
    if (blocks.has(k)) return blocks.get(k);
    const gx = Math.floor(bx / LOT), gy = Math.floor(by / LOT);
    const type = lotDeck(gx, gy)[(bx - gx * LOT) + (by - gy * LOT) * LOT];
    const out = type ? placeIn(bx, by, type) : null;
    if (blocks.size > 6000) blocks.clear();
    blocks.set(k, out);
    return out;
  }

  /** Interactivos cuyas casillas caen en [x0..x1]×[y0..y1]. */
  function specialsIn(x0, y0, x1, y1) {
    const out = [];
    const b0x = Math.floor((x0 + offX) / BLK), b1x = Math.floor((x1 + offX) / BLK);
    const b0y = Math.floor((y0 + offY) / BLK), b1y = Math.floor((y1 + offY) / BLK);
    for (let by = b0y; by <= b1y; by++) for (let bx = b0x; bx <= b1x; bx++) {
      const s = blockSpecial(bx, by);
      if (s && s.tx >= x0 && s.tx <= x1 && s.ty >= y0 && s.ty <= y1) out.push(s);
    }
    return out;
  }

  function placeProps(c) {
    const X0 = c.cx * N, Y0 = c.cy * N;
    // Los interactivos de este chunk y de su borde (alrededor no crece nada).
    // (Dentro de la arena de la grieta no hay: allí manda su decoración.)
    const near = specialsIn(X0 - 2, Y0 - 2, X0 + N + 1, Y0 + N + 1).filter(s => arenaDist(s.tx, s.ty) >= arena_outer() + 1.33);
    for (const s of near) {
      if (s.tx < X0 || s.ty < Y0 || s.tx >= X0 + N || s.ty >= Y0 + N) continue;
      if (broken.has(s.tx + ',' + s.ty)) continue;
      if (c.terr[(s.ty - Y0) * N + (s.tx - X0)] !== FLOOR) continue;
      const p = makeProp(s.type, s.tx, s.ty, s.kind);
      c.props.push(p);
      if (p.solid) c.pa[(s.ty - Y0) * N + (s.tx - X0)] = p;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (c.terr[j * N + i] !== FLOOR) continue;
      const tx = c.cx * N + i, ty = c.cy * N + j;
      if (Math.hypot(tx, ty) < 4.67) continue;
      if (broken.has(tx + ',' + ty)) continue;
      let busy = false;
      for (const s of near) if (Math.abs(s.tx - tx) <= CLEAR[s.type] && Math.abs(s.ty - ty) <= CLEAR[s.type]) { busy = true; break; }
      if (busy) continue;

      // Necesita suelo alrededor para no pegarse a paredes / agua.
      let open = true;
      for (let b = -1; b <= 1 && open; b++) for (let a = -1; a <= 1; a++)
        if (terrainRaw(tx + a, ty + b) !== FLOOR) { open = false; break; }

      // Dentro de la arena: la decoración de su tipo (y nada en el pasillo).
      const ad = arenaDist(tx, ty);
      if (ad < arena_outer() + 1.33) {
        if (!arena || ad >= arena.r - 0.8 || arenaSafe(tx, ty)) continue;
        const pr = arena.th.props, hh = H(tx, ty, seed + 777);
        let at = null;
        if (open && hh < (pr.tree || 0)) at = 'tree';
        else if (open && hh < (pr.tree || 0) + (pr.rock || 0)) at = 'rock';
        // (La hierba alta, en manchas: el umbral deja más o menos la misma cantidad que antes.)
        else if (pr.grass && fbm(tx / 3, ty / 3, seed + 717) > 0.8 - 0.9 * pr.grass) at = 'grass';
        if (at) { const p = makeProp(at, tx, ty); c.props.push(p); if (p.solid) c.pa[j * N + i] = p; }
        continue;
      }

      const h = H(tx, ty, seed + 404);
      const grove = fbm(tx / 6.67, ty / 6.67, seed + 505) > 0.6;
      let type = null, kind = 0;
      // Trampas: sueltas, como siempre, lejos del claro del principio. (Los demás
      // interactivos van repartidos por bloques: ver blockSpecial.)
      // (2.0: rocas y trampas ×2,25 por casilla, para que haya las mismas por superficie con casillas de 48;
      //  los árboles no: con casillas más grandes salen 2,25 veces menos, como pedía §11.3.)
      const hs = H(tx, ty, seed + 909);
      if (open && Math.hypot(tx, ty) > 8 && hs >= 0.0011 && hs < 0.0058) {
        type = 'trap';
        kind = Math.floor(H(tx, ty, seed + 910) * 3);
      }
      if (type) { /* ya elegido */ }
      // (Bloque 6: en las arboledas, sólo en casillas de un mismo color de un tablero de ajedrez: entre dos troncos queda
      //  siempre paso en diagonal; antes, pegados, parecía que se podía pasar entre ellos y no.)
      // (Bloque 6b: todos, también los sueltos, sólo en casillas pares en x y en y, con más probabilidad para que salgan
      //  los mismos: entre dos árboles queda siempre una casilla entera libre. Con el tileset cada árbol llena su casilla
      //  como un trozo de pared, y dos en diagonal se tocaban por la esquina: parecía cerrado y se pasaba.)
      else if (open && h < (grove ? 0.14 : 0.024) && ((tx | ty) & 1) === 0) type = 'tree';
      else if (open && h > 0.982) type = 'rock';
      // Hierba alta en manchas enteras, sin huecos (como en las rutas); antes, 0,66 y
      // una de cada cuatro casillas vacía al azar (se veían matas sueltas). Sale la misma cantidad.
      else if (fbm(tx / 3.33, ty / 3.33, seed + 707) > 0.69) type = 'grass';
      if (!type) continue;

      const p = makeProp(type, tx, ty, kind);
      c.props.push(p);
      if (p.solid) c.pa[j * N + i] = p;
    }
  }

  const PROP = {
    tree:  { solid: true,  hp: Infinity, r: 13 },
    rock:  { solid: true,  hp: 34,       r: 12 },
    chest: { solid: true,  hp: Infinity, r: 12 },
    grass: { solid: false, hp: 1,        r: 14 },
    altar:    { solid: true,  hp: Infinity, r: 9 },
    spring:   { solid: false, hp: Infinity, r: 22, flat: true },
    bigchest: { solid: true,  hp: Infinity, r: 14 },
    trap:     { solid: false, hp: Infinity, r: 9, flat: true }
  };
  const SPECIAL = new Set(['altar', 'spring', 'chest', 'bigchest', 'trap']);

  function makeProp(type, tx, ty, kind = 0) {
    const d = PROP[type];
    return {
      id: nextPropId++, type, tx, ty, kind,
      x: tx * TS + TS / 2, y: ty * TS + TS - 4,
      r: d.r, hp: d.hp, maxHp: d.hp, solid: d.solid, flat: !!d.flat,
      destructible: d.hp !== Infinity, flash: 0,
      wiggle: H(tx, ty, 9) * 6.28,
      look: Math.floor(H(tx, ty, seed + 919) * 6),   // aspecto (árboles, rocas, hierba: ver drawProp)
      used: false, charge: 1, open: 0          // altar / manantial / cofre con candado
    };
  }

  // ---------------- consultas ----------------

  const tileOf = v => Math.floor(v / TS);

  function kindAt(x, y) { return KIND[terrainAt(tileOf(x), tileOf(y))]; }
  /** (Hierba integrada) ¿Es casilla de mancha de hierba? La misma cuenta que al repartir los objetos, sin mirar si salió otra cosa. */
  function grassField(tx, ty) {
    if (terrainAt(tx, ty) !== FLOOR) return false;
    if (arenaDist(tx, ty) < arena_outer() + 1.33) {
      const g = arena && arena.th.props.grass;
      return !!g && fbm(tx / 3, ty / 3, seed + 717) > 0.8 - 0.9 * g;
    }
    return fbm(tx / 3.33, ty / 3.33, seed + 707) > 0.69;
  }
  function isWall(x, y) { return terrainAt(tileOf(x), tileOf(y)) === WALL; }
  function isLiquid(x, y) { return terrainAt(tileOf(x), tileOf(y)) === LIQUID; }
  function liquidKind() { return G.Tiles.BIOMES[biome].liquid; }

  /**
   * Efecto del charco actual sobre un Pokémon de estos tipos:
   *   { slow, dmg, every, color, slide }  (dmg en % de vida máxima)
   * Los de su tipo no sufren el suyo (Fuego en lava, Veneno en veneno...).
   */
  const LIQ = {
    water: { slow: 0.6, immune: ['water'] },     // los de tipo agua nadan sin frenarse
    swamp: { slow: 0.45, immune: ['water'] },
    lava:   { dmg: 0.06, flat: 5, every: 0.5, color: '#ff8a3d', immune: ['fire'] },
    poison: { dmg: 0.035, flat: 3, every: 0.5, color: '#c86bdc', immune: ['poison', 'steel'] },
    spark:  { dmg: 0.045, flat: 4, every: 0.7, color: '#ffe14d', immune: ['electric', 'ground'] },
    ice:    { slide: true, immune: ['ice'] }
  };
  function liquidEffect(types) {
    const e = LIQ[liquidKind()] || LIQ.water;
    if (e.immune && types && types.some(t => e.immune.includes(t))) return {};
    return e;
  }

  function propAtTile(tx, ty) {
    const c = chunkAt(tx, ty);
    return c.pa[(ty - c.cy * N) * N + (tx - c.cx * N)];
  }

  /** ¿Se puede pasar por esta casilla andando? */
  function walkable(tx, ty) {
    const c = chunkAt(tx, ty), i = (ty - c.cy * N) * N + (tx - c.cx * N);
    if (c.solid[i]) return false;
    return !(c.terr[i] === LIQUID && (LIQ[liquidKind()] || {}).dmg);   // lava, veneno, descarga
  }

  /**
   * (2.0, bloque 4) Lo que es la casilla para los campos de pathing.js: 0 suelo, 1 bloquea (pared u objeto sólido),
   * 2 líquido que sólo frena (agua, pantano; el hielo cuenta como suelo), 3 líquido que hace daño (lava, veneno, descarga).
   */
  function cellAt(tx, ty) {
    const c = chunkAt(tx, ty), i = (ty - c.cy * N) * N + (tx - c.cx * N);
    if (c.solid[i]) return 1;
    if (c.terr[i] !== LIQUID) return 0;
    const l = LIQ[liquidKind()] || LIQ.water;
    return l.dmg ? 3 : l.slow ? 2 : 0;
  }

  /*
   * Los objetos tienen los pies en y = ty·TS+TS−4 y un radio de hasta 14: su
   * círculo baja hasta PROP_DIP u dentro del tile de debajo. collide e isFree
   * miran también la fila de arriba cuando el círculo llega a esa franja (si no,
   * al llegar desde el sur el árbol aparecía de golpe con mucho solape y temblabas).
   */
  const PROP_DIP = 10;
  const propRow = (top, t0y) => (top - t0y * TS < PROP_DIP ? t0y - 1 : t0y);

  /** cellAt de un cuadrado de n×n casillas desde (ox, oy), en out[j·n + i]: por tramos de chunk (pathing.js). */
  function fillCells(ox, oy, n, out) {
    const l = LIQ[liquidKind()] || LIQ.water, lc = l.dmg ? 3 : l.slow ? 2 : 0;
    for (let j = 0; j < n; j++) {
      const ty = oy + j, cy = Math.floor(ty / N), row = (ty - cy * N) * N;
      for (let i = 0; i < n;) {
        const tx = ox + i, cx = Math.floor(tx / N);
        const c = lastC && lastC.cx === cx && lastC.cy === cy ? lastC : (lastC = data.get(ckey(cx, cy)) || chunkData(cx, cy));
        const lx = tx - cx * N, len = Math.min(N - lx, n - i), solid = c.solid, terr = c.terr;
        for (let k = 0, o = j * n + i, ci = row + lx; k < len; k++, o++, ci++) out[o] = solid[ci] ? 1 : terr[ci] === LIQUID ? lc : 0;
        i += len;
      }
    }
  }

  /** ¿Hay sitio para que algo de radio r esté aquí? */
  function isFree(x, y, r = 12, allowLiquid = false) {
    const t0x = tileOf(x - r), t1x = tileOf(x + r), t0y = tileOf(y - r), t1y = tileOf(y + r);
    for (let ty = propRow(y - r, t0y); ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
      if (ty >= t0y) {
        const t = terrainAt(tx, ty);
        if (t === WALL || (!allowLiquid && t === LIQUID)) return false;
      }
      const p = propAtTile(tx, ty);
      if (p && G.U.dist2(x, y, p.x, p.y) < (r + p.r) ** 2) return false;
    }
    return true;
  }

  /** Objetos destructibles (incluida la hierba) que tocan un círculo. */
  function propsInCircle(x, y, r) {
    const out = [];
    const c0x = Math.floor((x - r) / CW), c1x = Math.floor((x + r) / CW);
    const c0y = Math.floor((y - r) / CW), c1y = Math.floor((y + r) / CW);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = chunkData(cx, cy);
      for (const p of c.props) {
        if (!p.destructible || p.hp <= 0) continue;
        if (G.U.dist2(x, y, p.x, p.y) <= (r + p.r) ** 2) out.push(p);
      }
    }
    return out;
  }

  /** Objetos interactivos (altares, manantiales, cofres, trampas) cerca. */
  function specialsNear(x, y, r) {
    const out = [];
    const c0x = Math.floor((x - r) / CW), c1x = Math.floor((x + r) / CW);
    const c0y = Math.floor((y - r) / CW), c1y = Math.floor((y + r) / CW);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      for (const p of chunkData(cx, cy).props) {
        if (SPECIAL.has(p.type) && G.U.dist2(x, y, p.x, p.y) <= (r + p.r) ** 2) out.push(p);
      }
    }
    return out;
  }

  /** Roca más cercana (para apuntar cuando no hay enemigos): los cofres ya no se rompen a golpes. */
  function nearestBreakable(x, y, r) {
    let best = null, bd = r * r;
    for (const p of propsInCircle(x, y, r)) {
      if (!p.solid) continue;
      const d = G.U.dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /**
   * Empuja un círculo fuera de paredes y objetos sólidos (deslizando).
   * Devuelve true si ha chocado con algo. Usa e.wr si lo tiene (el jugador:
   * su radio contra el terreno, más pequeño que el de los golpes).
   */
  function collide(e) {
    const r = e.wr || e.r;
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const t0x = tileOf(e.x - r), t1x = tileOf(e.x + r), t0y = tileOf(e.y - r), t1y = tileOf(e.y + r);
      // (Fila de arriba para los objetos: ver PROP_DIP.)
      for (let ty = propRow(e.y - r, t0y); ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
        const c = chunkAt(tx, ty), ci = (ty - c.cy * N) * N + (tx - c.cx * N);
        if (!c.solid[ci]) continue;
        if (ty >= t0y && c.terr[ci] === WALL) {
          // Punto más cercano de la caja del tile al centro del círculo.
          const bx0 = tx * TS, by0 = ty * TS, bx1 = bx0 + TS, by1 = by0 + TS;
          const qx = G.U.clamp(e.x, bx0, bx1), qy = G.U.clamp(e.y, by0, by1);
          let dx = e.x - qx, dy = e.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          hit = true;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            e.x += dx / d * (r - d); e.y += dy / d * (r - d);
          } else {
            // Centro dentro de la caja: sal hacia la casilla sin pared más cercana (11-11-2026: antes, por el lado más
            //  cercano a secas; dentro de un bloque grande de roca iba de casilla en casilla sin salir y el enemigo se
            //  veía metido en la roca 1-3 s, hasta que el desatasco lo sacaba).
            escapeWall(e, r, tx, ty);
          }
        }
        const p = c.pa[ci];
        if (p) {
          const dx = e.x - p.x, dy = e.y - p.y;
          const min = r + p.r, d2 = dx * dx + dy * dy;
          if (d2 < min * min) {
            hit = true;
            const d = Math.sqrt(d2) || 0.01;
            e.x = p.x + dx / d * min; e.y = p.y + dy / d * min;
          }
        }
      }
    }
    return hit;
  }

  /**
   * (11-11-2026) Con el centro dentro de la pared (tx, ty): al punto más cercano de la casilla sin pared ni objeto
   * sólido más cercana (anillos de hasta 4 casillas), metido r (como mucho media casilla) hacia su centro. Pasa poco
   * (empujones, aparecer, saltos): el coste no importa. Sin ninguna libre, por el lado más cercano, como antes.
   */
  function escapeWall(e, r, tx, ty) {
    const bx0 = tx * TS, by0 = ty * TS;
    let best = null, bd = Infinity;
    for (let k = 1; k <= 4 && !best; k++) {
      for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== k) continue;
        const c = chunkAt(tx + i, ty + j), ci = (ty + j - c.cy * N) * N + (tx + i - c.cx * N);
        if (c.solid[ci]) continue;
        const x0 = (tx + i) * TS, y0 = (ty + j) * TS;
        const qx = G.U.clamp(e.x, x0, x0 + TS), qy = G.U.clamp(e.y, y0, y0 + TS), d = (qx - e.x) ** 2 + (qy - e.y) ** 2;
        if (d < bd) { bd = d; best = [qx, qy, x0 + TS / 2, y0 + TS / 2]; }
      }
    }
    if (best) {
      const [qx, qy, cx, cy] = best, dx = cx - qx, dy = cy - qy, l = Math.hypot(dx, dy) || 1, s = Math.min(r, TS / 2, l);
      e.x = qx + dx / l * s; e.y = qy + dy / l * s;
      return;
    }
    const l = e.x - bx0, rr = bx0 + TS - e.x, u = e.y - by0, b = by0 + TS - e.y, m = Math.min(l, rr, u, b);
    if (m === l) e.x = bx0 - r; else if (m === rr) e.x = bx0 + TS + r;
    else if (m === u) e.y = by0 - r; else e.y = by0 + TS + r;
  }

  /** ¿Choca un proyectil aquí? Devuelve 'wall', el prop sólido, o null. */
  function projectileBlock(x, y, r) {
    const tx = tileOf(x), ty = tileOf(y);
    if (terrainAt(tx, ty) === WALL) return 'wall';
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const p = propAtTile(tx + a, ty + b);
      if (p && p.solid && G.U.dist2(x, y, p.x, p.y) < (r + p.r) ** 2) return p;
    }
    return null;
  }

  // ---------------- daño a objetos ----------------

  function damageProp(p, amount, color = '#fff') {
    if (!p.destructible || p.hp <= 0) return false;
    p.hp -= amount;
    p.flash = 0.08;
    if (p.type !== 'grass') G.FX.spark(p.x, p.y - 10, color, 0, -1, 3);
    if (p.hp <= 0) { destroyProp(p); return true; }
    return false;
  }

  /** Rompe el objeto de esa casilla (llega por la red en cooperativo). */
  function breakAt(tx, ty) {
    const k = tx + ',' + ty;
    if (broken.has(k)) return;
    const c = data.get(ckey(Math.floor(tx / N), Math.floor(ty / N)));
    const p = c && c.props.find(o => o.tx === tx && o.ty === ty);
    if (p) destroyProp(p, true); else broken.add(k);
  }

  function destroyProp(p, fromNet = false) {
    broken.add(p.tx + ',' + p.ty);
    if (G.Coop.active && !fromNet) G.Coop.propBroken(p);
    const cx = Math.floor(p.tx / N), cy = Math.floor(p.ty / N);
    const c = data.get(ckey(cx, cy));
    if (c) {
      c.props.splice(c.props.indexOf(p), 1);
      if (p.solid) setSolidProp(c, p.tx, p.ty, null);
    }
    const B = G.Tiles.BIOMES[biome];
    G.Audio.sfx(p.type === 'grass' ? 'grass' : p.type === 'chest' ? 'chest' : 'break');
    if (p.type === 'grass') {
      G.FX.burst(p.x, p.y - 6, B.grass[1], 6, 70);
      const r = Math.random();
      if (r < 0.05) G.Pickups.drop('heal', p.x, p.y);
      else if (r < 0.11) G.Pickups.drop('coin', p.x, p.y, 1);
      return;
    }
    if (p.type === 'rock') {
      G.FX.burst(p.x, p.y - 10, B.rock[1], 14, 140);
      G.FX.ring(p.x, p.y - 8, 4, 26, B.rock[2], 0.3, 3);
      const r = Math.random();
      if (r < 0.40) G.Pickups.dropXp(p.x, p.y, 6);
      if (r > 0.75) G.Pickups.drop('coin', p.x, p.y, 2);
      if (r > 0.94) G.Pickups.drop('heal', p.x + 8, p.y);
      return;
    }
    if (p.type === 'chest') {
      G.FX.burst(p.x, p.y - 10, '#f2c443', 22, 180);
      G.FX.ring(p.x, p.y - 8, 6, 46, '#f2c443', 0.45, 4);
      G.Camera.kick(0.25);
      const n = G.U.randInt(4, 7);
      for (let i = 0; i < n; i++) G.Pickups.drop('coin', p.x + G.U.rand(-14, 14), p.y + G.U.rand(-10, 10), 3);
      G.Pickups.drop(Math.random() < 0.5 ? 'heal' : 'magnet', p.x, p.y);
      G.Pickups.dropXp(p.x, p.y, 20);
      if (Math.random() < 0.08) G.Pickups.drop('item', p.x, p.y - 12, G.Items.roll());
      return;
    }
    if (p.type === 'bigchest') {
      // Botín grande: monedas y experiencia para subir un nivel. (2.0, bloque 5: antes 1-3 tickets y, 15 %, un ×10;
      //  ahora esos ~3,5 tickets en monedas, 25 cada uno: systems/tickets.js.)
      G.FX.burst(p.x, p.y - 12, '#f2c443', 34, 220);
      G.FX.ring(p.x, p.y - 8, 6, 80, '#f2c443', 0.6, 5);
      G.Camera.kick(0.4);
      for (let i = 0; i < 9; i++) G.Pickups.drop('coin', p.x + G.U.rand(-22, 22), p.y + G.U.rand(-14, 14), 4);
      for (let i = 0; i < 18; i++) G.Pickups.drop('coin', p.x + G.U.rand(-26, 26), p.y + G.U.rand(-16, 16), 5);
      if (Math.random() < 0.5) G.Pickups.drop('item', p.x + 14, p.y - 14, G.Items.roll());
      G.Pickups.dropXp(p.x, p.y, G.Game.levelXp());
      G.Progress.event('chest');
      return;
    }
    if (p.type === 'trap') G.Interact.trapEffect(p);
  }

  // ---------------- dibujo ----------------

  /*
   * Modo Ultra (calidad 'ultra' en Ajustes): 2,5D como los juegos de DS. La cámara
   * inclinada con perspectiva la pone game.js (D3, 27-10-2026); aquí, las paredes
   * se levantan y se dibujan por filas ordenadas por Y con los Pokémon (wallRows /
   * drawWallRow: tapan lo que queda detrás) y la copa de un árbol se transparenta si
   * tu Pokémon queda detrás. (Antes, además, los objetos se inclinaban con un sesgo
   * que deformaba el pixel art, llevaban sombras largas y una luz que oscurecía la
   * pantalla: se veía raro y apagado; ya no.) Los chunks se vuelven a hornear al
   * cambiar de modo (las paredes van aparte).
   */
  let ultra = false;
  let livePl = null;                                        // tu Pokémon en partida (en el menú, ninguno)
  function syncMode() {
    livePl = G.Game.state !== 'ui' ? G.Game.player : null;
    const u = G.Settings.ultra, p = !!(G.Tileset && G.Tileset.enabled());
    const f = u && p && !!(G.Ultra3D && G.Ultra3D.on());      // (Ultra 3D) las paredes, en 3D (ultra3d.js): el suelo, plano
    if (u === ultra && p === pmd && f === flat3d) return;
    ultra = u; pmd = p; flat3d = f;
    dropImages(images); if (fade) dropImages(fade.images); fade = null;
  }
  // (Bloque 6) Tileset de Mundo Misterioso: ¿se usa ya para el bioma bi? Al acabar de cargar uno, se rehornea.
  let pmd = false, flat3d = false, g24 = false;
  const pmdOn = bi => !!(G.Tileset && G.Tileset.ready(bi));
  if (G.Tileset) G.Tileset.onReady = bi => { if (bi === biome || (fade && bi === fade.from)) { dropImages(images); if (fade) dropImages(fade.images); } };

  function chunkImage(cx, cy, bi = biome, cache = images) {
    const k = cx + ',' + cy;
    let img = cache.get(k);
    if (img) return img;
    // (Bloque 6) Con el tileset de Mundo Misterioso de este bioma, si está listo; si no, el pintor de tiles.js, ya sin
    //  caminos de tierra (PMD no los tiene: el campo de tierra a 0).
    const paint = () => pmdOn(bi) ? G.Tileset.paintChunk(cx, cy, N, terrainAt, bi, seed, flat3d, grassField)
      : G.Tiles.paintChunk(cx, cy, N, (tx, ty) => KIND[terrainAt(tx, ty)], () => 0, bi, seed, ultra);
    // (iPhone: pantalla negra, 01-11-2026) Con el tope de memoria de lienzos de Safari lleno, el lienzo nuevo sale
    //  sin dibujo (getContext da null) y fallaba todo el fotograma: negro. Se suelta lo guardado y se prueba otra
    //  vez; si aún no, este chunk va vacío este fotograma (sin guardarlo: el siguiente lo vuelve a intentar).
    if (performance.now() < bakeWait) return EMPTY;
    try { img = paint(); } catch (e) { img = null; }
    if (!img) {
      if (G.Sprites) G.Sprites.purge(); dropImages(images); if (fade) dropImages(fade.images);
      try { img = paint(); } catch (e) { img = null; }
      if (!img) { bakeWait = performance.now() + 300; return EMPTY; }   // (un rato sin intentarlo: sin crear lienzos en vano)
    }
    if (cache.size > MAX_IMAGES) { const k0 = cache.keys().next().value; G.U.freeCanvas(cache.get(k0)); cache.delete(k0); }
    cache.set(k, img);
    return img;
  }

  /*
   * Ultra: filas del chunk con paredes, como «objetos» para el orden por Y
   * (game.js los mezcla con los demás). Cada una: los tramos seguidos de pared
   * [i0, i1]. Se calculan una vez por chunk (sólo dependen del terreno).
   */
  function wallRows(c) {
    if (c.rows) return c.rows;
    c.rows = [];
    for (let j = 0; j < N; j++) {
      const runs = [];
      for (let i = 0; i < N; i++) {
        if (c.terr[j * N + i] !== WALL) continue;
        let e = i;
        while (e + 1 < N && c.terr[j * N + e + 1] === WALL) e++;
        runs.push([i, e]);
        i = e;
      }
      // y = arriba del tile: lo que está al norte queda detrás (tapado por lo alto de
      // la pared) y lo que vuela por encima de la pared (fantasmas, jefes), delante.
      // face: algún tramo sin pared al sur (lleva cara frontal: la tira entera; si no,
      // sólo la meseta, y game.js se ahorra las tiras vacías de abajo).
      const ty = c.cy * N + j, face = runs.some(([i0, i1]) => { for (let i = i0; i <= i1; i++) if (terrainAt(c.cx * N + i, ty + 1) !== WALL) return true; return false; });
      if (runs.length) c.rows.push({ wallrow: true, type: 'wallrow', flat: false, cx: c.cx, cy: c.cy, j, runs, face, x: c.cx * CW + CW / 2, y: ty * TS + 1 });
    }
    return c.rows;
  }

  /** a0..a1: sólo esas filas (px del pintor) de la tira (game.js la pinta por tiras, cada una a su escala). */
  function drawWallRow(ctx, r, a0 = 0, a1 = G.Tiles.CAP_H) {
    const P = GS, CH = G.Tiles.CAP_H, AH = a1 - a0;
    const X = r.cx * CW, Y = (r.cy * N + r.j) * TS - G.Tiles.RAISE * P + a0 * P;
    const e = G.Camera.persp ? G.Camera._ext() : null, ex = e ? e.x : 0;     // (con perspectiva, arriba se ve más)
    const l = G.Camera.left() - 40 - ex, rr = G.Camera.left() + G.Camera.w + 40 + ex;
    const k = fadeK();
    const draw = img => {
      const slot = img.capSlot ? img.capSlot[r.j] : -1;
      if (slot < 0 || !img.caps) return;
      for (const [i0, i1] of r.runs) {
        const x0 = X + i0 * TS, w = (i1 - i0 + 1) * TS;
        if (x0 > rr || x0 + w < l) continue;
        ctx.drawImage(img.caps, i0 * PT, slot * CH + a0, (i1 - i0 + 1) * PT, AH, x0, Y, w + (i1 === N - 1 ? 1 : 0), AH * P);
      }
    };
    if (k != null) {
      ctx.globalAlpha = 1 - k;
      draw(chunkImage(r.cx, r.cy, fade.from, fade.images));
      ctx.globalAlpha = k;
    }
    draw(chunkImage(r.cx, r.cy));
    ctx.globalAlpha = 1;
  }

  /** 0..1 del fundido de bioma (suavizado), o null si no hay. */
  function fadeK() { if (!fade) return null; const x = Math.min(1, fade.t / FADE); return x * x * (3 - 2 * x); }

  function visibleChunks(cam, pad = 0) {
    const out = [];
    const x0 = Math.floor((cam.left() - pad) / CW), x1 = Math.floor((cam.left() + cam.w + pad) / CW);
    const y0 = Math.floor((cam.top() - pad) / CW), y1 = Math.floor((cam.top() + cam.h + pad) / CW);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) out.push([cx, cy]);
    return out;
  }

  /** exact: a escala entera (el lienzo del suelo del modo Ultra, en game.js): sin el px de solape. */
  function drawGround(ctx, cam, exact = false) {
    syncMode();
    G.Anim.frame(performance.now());
    g24 = pmd && pmdOn(biome) && G.Tiles.grass24(biome);
    ctx.imageSmoothingEnabled = false;
    const k = fadeK(), S = exact ? CW : CW + 1;
    // (Revisión del bloque 6) En el fundido, los chunks del bioma nuevo se hornean poco a poco: uno por fotograma y
    //  más mientras no pasen 2 ms (§11.4). Al empezar el fundido apenas se ven; antes se horneaban los 6-12 de golpe
    //  (1-2 ms cada uno en el ordenador, varias veces más en el móvil: un tirón cada 4 minutos).
    let one = true;
    const until = k == null ? 0 : performance.now() + 2;
    for (const [cx, cy] of visibleChunks(cam)) {
      // +1 de solape: con escalas no enteras evita juntas entre chunks.
      if (k == null) { ctx.drawImage(chunkImage(cx, cy), cx * CW, cy * CW, S, S); continue; }
      // Fundido: el bioma viejo debajo y el nuevo apareciendo encima.
      ctx.drawImage(chunkImage(cx, cy, fade.from, fade.images), cx * CW, cy * CW, S, S);
      let img = images.get(cx + ',' + cy);
      if (!img && (one || performance.now() < until)) { one = false; img = chunkImage(cx, cy); }
      if (!img) continue;
      ctx.globalAlpha = k;
      ctx.drawImage(img, cx * CW, cy * CW, S, S);
      ctx.globalAlpha = 1;
    }
  }

  /** Brillos animados sobre el agua / burbujas de la lava (y del veneno y la electricidad). */
  function drawLiquid(ctx, cam, t) {
    // (Bloque 6) Con el tileset: cada casilla de líquido con su fotograma (el ciclo de color de PMD); en el fundido de
    //  bioma, como antes. Cada casilla, justo de su tamaño: con medio px de más (antes) se colaba en la de al lado una
    //  fila de la casilla vecina de la hoja (rayas de agua en la tierra, sobre todo en Ultra); debajo ya está el chunk.
    if (!fade && pmdOn(biome)) {
      if (!G.Tileset.animated(biome)) return;
      ctx.imageSmoothingEnabled = false;
      for (const [cx, cy] of visibleChunks(cam)) {
        const c = chunkData(cx, cy);
        for (let i = 0; i < c.liquids.length; i += 2) {
          const tx = c.liquids[i], ty = c.liquids[i + 1];
          if (!cam.sees(tx * TS + TS / 2, ty * TS + TS / 2, TS)) continue;
          G.Tileset.drawLiquid(ctx, biome, terrainAt, tx, ty, tx * TS, ty * TS, TS, t);
        }
      }
      return;
    }
    const B = G.Tiles.BIOMES[biome];
    const lava = B.liquid === 'lava' || B.liquid === 'poison' || B.liquid === 'spark';
    ctx.fillStyle = B.foam;
    const P = GS;
    for (const [cx, cy] of visibleChunks(cam)) {
      const c = chunkData(cx, cy);
      for (let i = 0; i < c.liquids.length; i += 2) {
        const tx = c.liquids[i], ty = c.liquids[i + 1];
        const x = tx * TS, y = ty * TS;
        if (!cam.sees(x + TS / 2, y + TS / 2, TS)) continue;
        const ph = H(tx, ty, 77) * 6.28;
        const k = (Math.sin(t * (lava ? 2.2 : 1.6) + ph) + 1) / 2;
        ctx.globalAlpha = lava ? 0.35 + k * 0.5 : k * 0.7;
        const sx = x + Math.floor(H(tx, ty, 78) * 12 + 2) * P;
        const sy = y + Math.floor(H(tx, ty, 79) * 12 + 2) * P;
        ctx.fillRect(sx + Math.round(k * 2) * P, sy, P * (lava ? 2 : 3), P);
        if (lava && k > 0.8) ctx.fillRect(sx, sy - P * 2, P, P);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Props visibles, para mezclarlos en el orden por Y con las entidades (en Ultra, también las filas de pared). */
  function visibleProps(cam) {
    const out = [];
    // (Filas de pared: sólo las que se ven; así su chunk ya está horneado por drawGround.)
    const top = cam.top(), bot = top + cam.h, l = cam.left(), r = l + cam.w;
    for (const [cx, cy] of visibleChunks(cam, 60)) {
      const c = chunkData(cx, cy);
      for (const p of c.props) if (cam.sees(p.x, p.y, 70)) out.push(p);
      if (ultra && !pmdOn(biome) && cx * CW < r && cx * CW + CW > l) for (const w of wallRows(c)) if (w.y + TS > top && w.y - 18 < bot) out.push(w);
    }
    return out;
  }

  /*
   * Variante del sprite (tiles.js las pinta una vez y las guarda): aspecto (3 árboles,
   * 2 rocas, 3 matas de hierba) y estado (mecida por el viento, rota, usada, seca...).
   * Todo el dibujo de un objeto es drawImage de imágenes ya hechas: su sombra también.
   * La hierba se agita cuando la pisas y le pasan rachas de viento por encima (una
   * ola que cruza el campo); las trampas tienen 4 fotogramas (burbujas, brillo).
   */
  function propVariant(p, t) {
    switch (p.type) {
      case 'grass': {
        const pl = livePl, step = pl && !pl.dead && Math.abs(pl.x - p.x) < 26 && pl.y > p.y - 42 && pl.y < p.y + 8;
        // (Arte animado) Con el tileset, la hierba de 24 px: 8 fotogramas de viento y uno pisada (tiles.js grass24).
        if (g24) {
          // En la orilla de la mancha, matas sueltas (se mira al dibujarla la primera vez: al repartir, los vecinos aún no existen).
          if (p.thin === undefined) p.thin = !(grassField(p.tx, p.ty - 1) && grassField(p.tx + 1, p.ty) && grassField(p.tx, p.ty + 1) && grassField(p.tx - 1, p.ty));
          return (p.thin ? 4 + p.look % 2 : p.look % 4) * 9 + (step ? 8 : G.Anim.wind(p.x, p.y));
        }
        if (step) return (p.look % 3) * 3 + 2;
        return (p.look % 3) * 3 + (G.Anim.on && Math.sin(t * 1.8 - p.x * 0.012 - p.y * 0.006) > 0.86 ? 1 : 0);
      }
      case 'rock': return (p.look % 2) * 2 + (p.hp < p.maxHp * 0.5 ? 1 : 0);
      case 'tree': return p.look % 3 + 3 * G.Anim.wind(p.x, p.y);      // (arte animado: tileset.js prop)
      case 'altar': return p.kind * 2 + (p.used ? 1 : 0);
      case 'spring': return p.charge < 0.15 ? 1 : 0;
      case 'trap': return p.kind * 4 + (((t * 5 + p.wiggle) | 0) & 3);
      default: return 0;
    }
  }

  /*
   * (Bloque 6b) El dibujo de un objeto en el bioma bi y su escala (unidades de mundo por px de arte):
   *   - con el tileset de Mundo Misterioso listo: árboles, cofres y trampas de PMD (G.Tileset.prop) y lo demás pintado
   *     por tiles.js con la paleta del tileset; todo a 24 px por casilla (×2), también la hierba alta;
   *   - si no: tiles.js como antes (la hierba alta llena su casilla a la escala del pintor, ×3; lo demás, como los Pokémon).
   * pmd: si es un dibujo de PMD que va justo en su casilla (el árbol, que es la pieza de pared: sin sombra y con la
   * base en el borde de abajo; las trampas, centradas).
   */
  const SPR = { img: null, P: 2, pmd: false };
  function spriteOf(bi, type, variant) {
    SPR.pmd = false;
    // (Arte animado) Sólo el árbol del tileset tiene fotogramas: los de tiles.js eligen forma con variant (si no, cambiarían de forma).
    const look = type === 'tree' ? variant % 3 : variant;
    if (pmdOn(bi)) {
      const o = G.Tileset.prop(bi, type, variant);
      // (Los cofres en bloque, como las paredes, llevan su sombra dibujada: como los árboles de PMD.)
      if (o) { SPR.img = o; SPR.P = TS / G.Tileset.T; SPR.pmd = type === 'tree' || type === 'trap' || (type !== 'rock' && G.Tileset.isPx(o)); return SPR; }
      const pal = G.Tileset.pal(bi), g24 = !!pal && (type !== 'grass' || G.Tiles.grass24(bi));
      SPR.img = G.Tiles.propSprite(bi, type, look, g24 ? pal : null);
      SPR.P = type === 'grass' ? (g24 ? TS / G.Tileset.T : GS) : G.Sprites.PX;
      return SPR;
    }
    SPR.img = G.Tiles.propSprite(bi, type, look);
    SPR.P = type === 'grass' ? GS : G.Sprites.PX;
    return SPR;
  }

  // (iPhone: ataques invisibles, 02-11-2026) Sin memoria de lienzos para pintar un árbol o una roca (tiles.js Pix),
  // ese no sale este fotograma; antes el error cortaba el fotograma entero (sin ataques) y, seguido, cerraba la partida.
  function drawProp(ctx, p, t, a0, a1) {
    try { drawProp0(ctx, p, t, a0, a1); }
    catch (e) { if (!/sin memoria de lienzos/.test(e && e.message)) throw e; ctx.globalAlpha = 1; }
  }
  /** Lo que hace un objeto al dibujarse además del dibujo (hojas que caen, destellos del manantial). También lo usa ultra3d.js. */
  function propFx(p, t) {
    if (p.type === 'tree') G.Ambient.tree(p);
    if (p.type === 'spring' && p.charge >= 0.15 && G.Anim.on && Math.sin(t * 3 + p.wiggle) > 0.92) {
      G.FX.twinkle(p.x + G.U.rand(-20, 20), p.y - 8 + G.U.rand(-6, 6));
      G.Ambient.ring(p.x + G.U.rand(-14, 14), p.y - 8 + G.U.rand(-5, 5));
    }
  }
  function drawProp0(ctx, p, t, a0, a1) {
    if (p.wallrow) { drawWallRow(ctx, p, a0, a1); return; }
    const variant = propVariant(p, t);
    propFx(p, t);
    const { img, P, pmd: block } = spriteOf(biome, p.type, variant);
    const w = img.width * P, h = img.height * P;
    if (p.flat) {
      // Planos (manantial, trampa): pegados al suelo, centrados en su casilla (las trampas de PMD, en toda la casilla).
      ctx.drawImage(img, Math.round(p.x - w / 2), Math.round((block ? p.y + 4 - TS / 2 : p.y - 8) - h / 2), w, h);
      return;
    }
    if (p.type === 'altar' && !p.used) {
      // Halo del orbe (el orbe va en (10, 5.5) del sprite): a píxeles y latiendo; con «Animaciones» apagado, quieto.
      const col = ORB_COL[p.kind], ox = p.x, oy = p.y - h + 2 + 5.5 * P, pu = G.Anim.tick(4, 5, p.wiggle * 3);
      const ha = G.Pickups.glow(col, pu & 1, pu === 2 ? 8 : 7);
      if (ha) {
        const D = ha.width * 2;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(ha, Math.round(ox - D / 2), Math.round(oy - D / 2), D, D);
        ctx.globalAlpha = 1;
      }
    }
    const dy = block ? 4 : p.type === 'grass' ? 4 : 2;
    const x = Math.round((p.x - w / 2) / 2) * 2, y = Math.round((p.y - h + dy) / 2) * 2;       // (sobre la rejilla de los píxeles de arte)
    if (p.type !== 'grass' && !block) {
      // Sombra suave debajo (como en los juegos de DS): imagen guardada.
      const sh = G.Tiles.shadow(p.type), sw = sh.width * P, shh = sh.height * P;
      ctx.drawImage(sh, Math.round(p.x - sw / 2), Math.round(p.y - shh / 2), sw, shh);
    }
    let a = 1;
    if (ultra && p.type === 'tree') {
      // Si tu Pokémon queda detrás de la copa, se transparenta un poco.
      const pl = livePl;
      if (pl && pl.y < p.y - 2 && pl.y > p.y - h * 0.85 && Math.abs(pl.x - p.x) < w * 0.42) a = 0.55;
    }
    const k = fadeK();
    if (k != null) {
      // El objeto viejo se desvanece mientras aparece el nuevo.
      const o = spriteOf(fade.from, p.type, variant), old = o.img, OP = o.P, ody = o.pmd || p.type === 'grass' ? 4 : 2;
      ctx.globalAlpha = (1 - k) * a;
      ctx.drawImage(old, Math.round(p.x - old.width * OP / 2), Math.round(p.y - old.height * OP + ody), old.width * OP, old.height * OP);
      ctx.globalAlpha = k * a;
    } else if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(img, x, y, w, h);
    const wc = p.flash > 0 && G.Sprites.white(img);
    if (wc) { ctx.globalAlpha = 0.6; ctx.drawImage(wc, x, y, w, h); }
    // (Sin save/restore por objeto: sólo se toca la transparencia y aquí se deja como estaba.)
    ctx.globalAlpha = 1;
    // (Encima del cofre: detrás, el arte nuevo lo tapaba y el progreso no se veía.)
    if (p.type === 'bigchest' && p.open > 0) drawChestRing(ctx, p, h / 2);
  }

  /** El aro de «abriendo» del cofre con candado, a dy por encima de sus pies (también lo usa el Ultra 3D). */
  function drawChestRing(ctx, p, dy = 27) {
    ctx.save();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y - dy, 36, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(1, p.open / G.Interact.CHEST_TIME));
    ctx.stroke();
    ctx.restore();
  }

  /*
   * (Arte animado, 05-11-2026) Lo que hace cada objeto de vez en cuando (veces por segundo; sale del mismo bucle que ya
   * recorre los objetos que se ven y son partículas normales, con su tope): los cofres brillan, las trampas burbujean, sueltan
   * esporas o tiemblan, los manantiales hacen ondas. Las torres, sus chispas de poder.
   */
  const LIVELY = { chest: 0.35, bigchest: 0.7, trap: 1.3, altar: 1.4 };
  const ORB_COL = ['#ff5f6d', '#5fd4ff', '#ff8ad8', '#ffd23f'];
  function lively(p) {
    const r = Math.random;
    switch (p.type) {
      case 'chest': case 'bigchest': G.FX.twinkle(p.x + G.U.rand(-20, 20), p.y - 8 - r() * 26); break;
      case 'trap': {
        const c = p.kind === 0 ? '#c48ae8' : p.kind === 1 ? '#f4f0d0' : '#ffb8a0';
        G.FX.px(p.x + G.U.rand(-14, 14), p.y - 2 + G.U.rand(-10, 8), c, { vy: -G.U.rand(14, 30), vx: G.U.rand(-6, 6), life: 0.7, drag: 1 });
        break;
      }
      case 'altar':
        if (!p.used) G.FX.px(p.x + G.U.rand(-9, 9), p.y - 36, ORB_COL[p.kind], { vy: -G.U.rand(22, 40), life: 0.8, drag: 1 });
        break;
    }
  }

  function update(dt, cam) {
    if (fade && (fade.t += dt) >= FADE) { dropImages(fade.images); fade = null; }
    // (Ultra: con la perspectiva se ve más por arriba y por los lados.)
    const anim = G.Anim.on;
    for (const [cx, cy] of visibleChunks(cam, G.Camera.persp ? 150 : 60)) {
      for (const p of chunkData(cx, cy).props) {
        if (p.flash > 0) p.flash -= dt;
        if (anim && LIVELY[p.type] && Math.random() < dt * LIVELY[p.type]) lively(p);
      }
    }
  }

  // ---------------- control ----------------

  /** @param terr  sólo para los tests: terreno propio (tx, ty, base) -> 0 suelo / 1 pared / 2 líquido, sin objetos. */
  function reset(s, terr = null) {
    seed = (s | 0) || 1;
    gen = terr; lastC = null;
    if (G.Tileset) G.Tileset.preload([0, 1, 2]);
    data.clear(); dropImages(images); if (fade) dropImages(fade.images); broken.clear(); lots.clear(); blocks.clear();
    // La rejilla de los interactivos: el lote (0,0) centrado en el inicio, ±3 casillas (ver blockSpecial).
    offX = Math.floor(BLK * LOT / 2) + Math.floor(H(3, 7, seed + 950) * 7) - 3;
    offY = Math.floor(BLK * LOT / 2) + Math.floor(H(7, 3, seed + 951) * 7) - 3;
    fade = null; arena = null;
  }

  /**
   * @param i        bioma (G.Tiles.ARENA y siguientes son las arenas de la grieta)
   * @param instant  sin fundido (al empezar una run)
   * Una run cambia de bioma cada 4 min y recorre toda la lista; al acabarse,
   * vuelve a empezar. (Antes, pasado el último, hacia el minuto 84, se pedía
   * un bioma que no existe: pantalla negra, el juego roto y niveles sin fin.)
   */
  function setBiome(i, instant = false) {
    const n = G.Tiles.BIOMES.length;
    const b = ((i % n) + n) % n;
    if (b === biome) return;
    // (Bloque 6) El tileset del siguiente, ya cargando (así no se ve antes el dibujo de respaldo).
    if (G.Tileset) G.Tileset.preload([b, (b + 1) % n]);
    // El terreno es el mismo: sólo cambia la paleta, fundiéndose poco a poco.
    if (fade) dropImages(fade.images);
    if (instant) dropImages(images);
    fade = instant ? null : { from: biome, images, t: 0 };
    biome = b;
    images = new Map();
  }

  // (Pasado el minuto 12 el mapa se pinta también con las paletas de las grietas: fuera de una grieta
  // su nombre va sin «Grieta · », que hacía creer que habías entrado en una.)
  function biomeName() { const n = G.Tiles.BIOMES[biome].name; return G.Rift && G.Rift.inArena ? n : n.replace(/^Grieta · /, ''); }

  /*
   * Viñeta en coordenadas de pantalla (el degradado se guarda: sólo cambia con el
   * tamaño). Suave, para que el mapa se vea vivo y claro como en los juegos de DS
   * (antes, 0,5 en las esquinas; y en Ultra, una luz que oscurecía arriba).
   */
  let vig = null, vigW = 0, vigH = 0;
  function drawVignette(ctx, w, h) {
    // (Ambientación) Del tono del mapa y algo más cerrada: lo que da fondo. Sigue sin tocar el centro, donde pasa todo.
    const e = G.Atmos.edge(biome);
    drawEdge(ctx, w, h, e[0], e[1], 0.42, 0.78);
  }

  /*
   * Oscurecer (o aclarar, la niebla) los bordes de la pantalla: el círculo va de min(w, h)·r0 a max(w, h)·r1.
   * (Pantalla negra, 06-11-2026) Antes, un degradado guardado que se rellenaba por toda la pantalla justo antes del
   * HUD: es lo único que va ahí en todas las partidas y es negro. Si Safari deja de pintarlo bien (ver docs), tapa el
   * mundo entero con negro y deja el HUD encima, como en las capturas. Ahora va horneado en un lienzo pequeño: si se
   * pierde, sale transparente (sin viñeta) y no puede tapar nada.
   */
  const edges = new Map();           // color -> { cv, w, h, a, r0, r1 }
  function drawEdge(ctx, w, h, rgb, a, r0, r1) {
    let e = edges.get(rgb);
    if (!e || e.w !== w || e.h !== h) {
      if (e) G.U.freeCanvas(e.cv);
      edges.delete(rgb);
      const W = 128, H = Math.max(8, Math.round(W * h / w)), k = W / w, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      if (!g) { G.U.freeCanvas(cv); return; }
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(w, h) * r0 * k, W / 2, H / 2, Math.max(w, h) * r1 * k);
      gr.addColorStop(0, 'rgba(' + rgb + ',0)');
      gr.addColorStop(1, 'rgba(' + rgb + ',' + a + ')');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      e = { cv, w, h };
      edges.set(rgb, e);
    }
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(e.cv, 0, 0, w, h);
    ctx.imageSmoothingEnabled = prev;
  }
  function purgeEdges() { for (const e of edges.values()) G.U.freeCanvas(e.cv); edges.clear(); }

  return {
    grassField,
    TS, GS, CW, WV, reset, setBiome, biomeName, liquidKind, liquidEffect, walkable, cellAt, fillCells,
    kindAt, isWall, isLiquid, isFree, collide, projectileBlock, propsInCircle, nearestBreakable,
    damageProp, breakAt, specialsNear, update,
    breakProp(p) { if (!broken.has(p.tx + ',' + p.ty)) destroyProp(p); },
    /** Arena de la grieta: { tx, ty, r } (en tiles) o null. */
    setArena(a) {
      arena = a;
      if (!a) return;
      a.th = G.Tiles.ARENA_THEMES[a.type] || G.Tiles.ARENA_THEMES.normal;
      // Olvida los chunks de esa zona (si se hubieran generado antes).
      const R = a.r + 6, near = (cx, cy) => Math.abs(cx * N + N / 2 - a.tx) < R + N && Math.abs(cy * N + N / 2 - a.ty) < R + N;
      for (const [k, c] of [...data]) if (near(c.cx, c.cy)) data.delete(k);
      for (const k of [...images.keys()]) { const [cx, cy] = k.split(',').map(Number); if (near(cx, cy)) { G.U.freeCanvas(images.get(k)); images.delete(k); } }
      lastC = null;
    },
    get arena() { return arena; }, drawGround, drawLiquid, visibleProps, drawProp, propFx, drawVignette, drawEdge, drawChestRing,
    // (Ultra 3D, ultra3d.js) Los datos de un chunk (terreno y objetos), el terreno de una casilla y si el bioma va con tileset.
    N, chunk: chunkData, terrainAt, pmdOn: bi => pmdOn(bi), get seed() { return seed; },
    /** Suelta los chunks horneados (se vuelven a hornear al dibujarlos): sin memoria de lienzos o al perder el lienzo. */
    purge() { dropImages(images); if (fade) dropImages(fade.images); purgeEdges(); },
    get biome() { return biome; }
  };
})();
