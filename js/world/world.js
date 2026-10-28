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
 *   chest   bloquea, se rompe; suelta un buen botín
 *   grass   hierba alta, no bloquea; se corta con cualquier ataque
 *   altar   torre de poder: al tocarla da un poder temporal (una vez)
 *   spring  manantial: cura mientras estás encima; se agota y se recarga
 *   bigchest cofre con candado: se abre quedándote al lado unos segundos
 *   trap    trampa (veneno, pegajosa, explosiva): salta al pisarla, también
 *           con los enemigos
 *   (la lógica de los interactivos está en systems/interact.js; cómo se
 *   reparten torres, manantiales y cofres, en blockSpecial)
 *
 * Grieta: setArena() convierte una zona lejana del mapa en una arena redonda
 * cerrada por paredes, donde se lucha contra un legendario (systems/rift.js).
 *
 * Los Pokémon voladores, los fantasma y los jefes ignoran el terreno.
 *
 * Coordenadas: (x, y) de una entidad = sus PIES, en el plano del suelo.
 * Los chunks se separan en DATOS (baratos, siempre) e IMAGEN (horneada a
 * resolución de arte y sólo para los visibles).
 */
G.World = (() => {
  const T = G.Tiles.T;                     // px de arte por tile
  const N = 16;                            // tiles por chunk
  const TS = T * G.Sprites.PX;             // tamaño de tile en mundo (32)
  const CW = N * TS;                       // tamaño de chunk en mundo (512)
  const FLOOR = 0, WALL = 1, LIQUID = 2;
  const KIND = ['floor', 'wall', 'liquid'];

  let seed = 1, biome = 0;
  let arena = null;                        // { tx, ty, r } en tiles
  const data = new Map();                  // "cx,cy" -> datos del chunk
  let images = new Map();                  // "cx,cy" -> canvas horneado
  // Cambio de bioma: durante FADE segundos se funde la paleta vieja con la nueva.
  const FADE = 2.6;
  let fade = null;                         // { from, images, t }
  const MAX_IMAGES = 48, MAX_DATA = 400;
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
   * Con `clear` en el tema, además un claro donde aterriza Arceus (5 al norte).
   */
  function arenaSafe(tx, ty) {
    const lx = tx - arena.tx, ly = ty - arena.ty;
    return (Math.abs(lx) <= 2 && ly >= -6 && ly <= 5) || Math.hypot(lx, ly) < 2.5 ||
           (arena.th.clear > 0 && Math.hypot(lx, ly + 5) < arena.th.clear);
  }

  function terrainRaw(tx, ty) {
    const ad = arenaDist(tx, ty);
    if (ad < arena_outer()) {
      if (ad >= arena.r) return WALL;
      if (arenaSafe(tx, ty)) return FLOOR;
      const th = arena.th;
      // Columnas de 2×2 (cobertura) y charcos según el tipo de la arena.
      if (th.pillars && ad < arena.r - 2 && H(tx >> 1, ty >> 1, seed + 31 + arena.tx) < th.pillars) return WALL;
      if (th.pools && ad < arena.r - 1.5 && fbm(tx / 3.2, ty / 3.2, seed + 37 + arena.tx) < th.pools) return LIQUID;
      return FLOOR;
    }
    return terrainBase(tx, ty);
  }

  /** Terreno sin la arena de la grieta (sólo semilla y coordenadas). */
  function terrainBase(tx, ty) {
    const d = Math.hypot(tx, ty);
    if (d < 9) return FLOOR;                          // claro inicial
    const ramp = G.U.clamp((d - 9) / 8, 0, 1);       // aparición suave
    if (fbm(tx / 13, ty / 13, seed + 101) < 0.04 + 0.23 * ramp) return LIQUID;
    if (fbm(tx / 8, ty / 8, seed + 202) > 1 - 0.27 * ramp) return WALL;
    return FLOOR;
  }

  // ---------------- datos de chunk ----------------

  function chunkData(cx, cy) {
    const k = cx + ',' + cy;
    let c = data.get(k);
    if (c) return c;

    c = { cx, cy, terr: new Uint8Array(N * N),
          props: [], propAt: new Map(), liquids: [] };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j;
      const t = terrainRaw(tx, ty);
      c.terr[j * N + i] = t;
      if (t === LIQUID) c.liquids.push(tx, ty);
    }
    if (data.size > MAX_DATA) data.delete(data.keys().next().value);
    data.set(k, c);
    placeProps(c);
    return c;
  }

  function terrainAt(tx, ty) {
    const cx = Math.floor(tx / N), cy = Math.floor(ty / N);
    const c = data.get(cx + ',' + cy) || chunkData(cx, cy);
    return c.terr[(ty - cy * N) * N + (tx - cx * N)];
  }

  const arena_outer = () => (arena ? arena.r + 7 : 0);

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
  const BLK = 20, LOT = 3, MARGIN = 3, TRIES = 14, HOME_PICK = 8;
  const RATES = [['altar', 1.2], ['spring', 1], ['bigchest', 0.8], ['chest', 1.3]];
  const ROOM = { altar: 2, spring: 2, bigchest: 2, chest: 1 };    // suelo libre alrededor (casillas)
  const CLEAR = { altar: 2, spring: 2, bigchest: 2, chest: 1 };   // sin árboles, rocas, hierba ni trampas alrededor
  const START_CLEAR = 14;                                          // nada de esto en el claro del principio
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
    const near = specialsIn(X0 - 2, Y0 - 2, X0 + N + 1, Y0 + N + 1).filter(s => arenaDist(s.tx, s.ty) >= arena_outer() + 2);
    for (const s of near) {
      if (s.tx < X0 || s.ty < Y0 || s.tx >= X0 + N || s.ty >= Y0 + N) continue;
      if (broken.has(s.tx + ',' + s.ty)) continue;
      if (c.terr[(s.ty - Y0) * N + (s.tx - X0)] !== FLOOR) continue;
      const p = makeProp(s.type, s.tx, s.ty, s.kind);
      c.props.push(p);
      if (p.solid) c.propAt.set(s.tx + ',' + s.ty, p);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (c.terr[j * N + i] !== FLOOR) continue;
      const tx = c.cx * N + i, ty = c.cy * N + j;
      if (Math.hypot(tx, ty) < 7) continue;
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
      if (ad < arena_outer() + 2) {
        if (!arena || ad >= arena.r - 1.2 || arenaSafe(tx, ty)) continue;
        const pr = arena.th.props, hh = H(tx, ty, seed + 777);
        let at = null;
        if (open && hh < (pr.tree || 0)) at = 'tree';
        else if (open && hh < (pr.tree || 0) + (pr.rock || 0)) at = 'rock';
        else if (hh > 1 - (pr.grass || 0)) at = 'grass';
        if (at) { const p = makeProp(at, tx, ty); c.props.push(p); if (p.solid) c.propAt.set(tx + ',' + ty, p); }
        continue;
      }

      const h = H(tx, ty, seed + 404);
      const grove = fbm(tx / 10, ty / 10, seed + 505) > 0.6;
      let type = null, kind = 0;
      // Trampas: sueltas, como siempre, lejos del claro del principio. (Los demás
      // interactivos van repartidos por bloques: ver blockSpecial.)
      const hs = H(tx, ty, seed + 909);
      if (open && Math.hypot(tx, ty) > 12 && hs >= 0.0011 && hs < 0.0032) {
        type = 'trap';
        kind = Math.floor(H(tx, ty, seed + 910) * 3);
      }
      if (type) { /* ya elegido */ }
      else if (open && h < (grove ? 0.07 : 0.006)) type = 'tree';
      else if (open && h > 0.992) type = 'rock';
      else if (fbm(tx / 5, ty / 5, seed + 707) > 0.66 && H(tx, ty, seed + 808) < 0.75) type = 'grass';
      if (!type) continue;

      const p = makeProp(type, tx, ty, kind);
      c.props.push(p);
      if (p.solid) c.propAt.set(tx + ',' + ty, p);
    }
  }

  const PROP = {
    tree:  { solid: true,  hp: Infinity, r: 13 },
    rock:  { solid: true,  hp: 34,       r: 12 },
    chest: { solid: true,  hp: 22,       r: 12 },
    grass: { solid: false, hp: 1,        r: 14 },
    altar:    { solid: true,  hp: Infinity, r: 9 },
    spring:   { solid: false, hp: Infinity, r: 22, flat: true },
    bigchest: { solid: true,  hp: Infinity, r: 14 },
    trap:     { solid: false, hp: Infinity, r: 9, flat: true }
  };
  const SPECIAL = new Set(['altar', 'spring', 'bigchest', 'trap']);

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
    const cx = Math.floor(tx / N), cy = Math.floor(ty / N);
    const c = data.get(cx + ',' + cy) || chunkData(cx, cy);
    return c.propAt.get(tx + ',' + ty) || null;
  }

  /** ¿Se puede pasar por esta casilla andando? (pathing.js) */
  function walkable(tx, ty) {
    const t = terrainAt(tx, ty);
    if (t === WALL) return false;
    if (t === LIQUID && (LIQ[liquidKind()] || {}).dmg) return false;   // lava, veneno, descarga
    const p = propAtTile(tx, ty);
    return !(p && p.solid);
  }

  /*
   * Los objetos tienen los pies en y = ty·32+28 y un radio de hasta 14: su
   * círculo baja hasta PROP_DIP u dentro del tile de debajo. collide e isFree
   * miran también la fila de arriba cuando el círculo llega a esa franja (si no,
   * al llegar desde el sur el árbol aparecía de golpe con mucho solape y temblabas).
   */
  const PROP_DIP = 10;
  const propRow = (top, t0y) => (top - t0y * TS < PROP_DIP ? t0y - 1 : t0y);

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

  /** Objetos interactivos (altares, manantiales, cofres con candado, trampas) cerca. */
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

  /** Roca o cofre más cercano (para apuntar cuando no hay enemigos). */
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
        if (ty >= t0y && terrainAt(tx, ty) === WALL) {
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
            // Centro dentro de la caja: sal por el lado más cercano.
            const l = e.x - bx0, rr = bx1 - e.x, u = e.y - by0, b = by1 - e.y;
            const m = Math.min(l, rr, u, b);
            if (m === l) e.x = bx0 - r; else if (m === rr) e.x = bx1 + r;
            else if (m === u) e.y = by0 - r; else e.y = by1 + r;
          }
        }
        const p = propAtTile(tx, ty);
        if (p && p.solid) {
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
    const c = data.get(Math.floor(tx / N) + ',' + Math.floor(ty / N));
    const p = c && c.props.find(o => o.tx === tx && o.ty === ty);
    if (p) destroyProp(p, true); else broken.add(k);
  }

  function destroyProp(p, fromNet = false) {
    broken.add(p.tx + ',' + p.ty);
    if (G.Coop.active && !fromNet) G.Coop.propBroken(p);
    const cx = Math.floor(p.tx / N), cy = Math.floor(p.ty / N);
    const c = data.get(cx + ',' + cy);
    if (c) {
      c.props.splice(c.props.indexOf(p), 1);
      c.propAt.delete(p.tx + ',' + p.ty);
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
      // Botín grande: monedas, tickets y experiencia para subir un nivel.
      G.FX.burst(p.x, p.y - 12, '#f2c443', 34, 220);
      G.FX.ring(p.x, p.y - 8, 6, 80, '#f2c443', 0.6, 5);
      G.Camera.kick(0.4);
      for (let i = 0; i < 9; i++) G.Pickups.drop('coin', p.x + G.U.rand(-22, 22), p.y + G.U.rand(-14, 14), 4);
      const tk = G.U.randInt(1, 3);
      for (let i = 0; i < tk; i++) G.Pickups.drop('ticket', p.x + G.U.rand(-16, 16), p.y + G.U.rand(-10, 10), 1);
      if (Math.random() < 0.15) G.Pickups.drop('ticket10', p.x, p.y - 10, 1);
      if (Math.random() < 0.5) G.Pickups.drop('item', p.x + 14, p.y - 14, G.Items.roll());
      G.Pickups.dropXp(p.x, p.y, G.Game.levelXp());
      G.Progress.event('chest');
      return;
    }
    if (p.type === 'trap') G.Interact.trapEffect(p);
  }

  // ---------------- dibujo ----------------

  /*
   * Modo Ultra (calidad 'ultra' en Ajustes): 2,5D como los juegos de DS. Las
   * paredes se levantan y se dibujan por filas ordenadas por Y con los Pokémon
   * (wallRows / drawWallRow: tapan lo que queda detrás), los objetos llevan su
   * sombra proyectada y se inclinan un poco hacia fuera del centro de la pantalla
   * (perspectiva de cámara), y encima va la luz del bioma (drawLight). Los demás
   * modos no pagan nada de esto. Los chunks se vuelven a hornear al cambiar de modo.
   */
  let ultra = false;
  const LEAN = 0.11;                                        // inclinación en el borde de la pantalla
  const CAST = { tree: 1, rock: 1, altar: 1, bigchest: 1, chest: 1 };     // con sombra proyectada
  const TALL = { tree: 1, rock: 1, altar: 1, bigchest: 1 };               // se inclinan
  let livePl = null;                                        // tu Pokémon en partida (en el menú, ninguno)
  function syncMode() {
    livePl = G.Game.state !== 'ui' ? G.Game.player : null;
    const u = G.Settings.get('quality') === 'ultra';
    if (u === ultra) return;
    ultra = u;
    images.clear(); fade = null;
  }

  function chunkImage(cx, cy, bi = biome, cache = images) {
    const k = cx + ',' + cy;
    let img = cache.get(k);
    if (img) return img;
    const at = (tx, ty) => KIND[terrainAt(tx, ty)];
    // Campo continuo de "tierra"; tiles.js lo muestrea en rejilla y lo
    // interpola por píxel para que las manchas tengan bordes orgánicos.
    const S = 6 * G.Tiles.T;
    const dirtField = (gx, gy) => fbm(gx / S, gy / S, seed + 303);
    img = G.Tiles.paintChunk(cx, cy, N, at, dirtField, bi, seed, ultra);
    if (cache.size > MAX_IMAGES) cache.delete(cache.keys().next().value);
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
      if (runs.length) c.rows.push({ wallrow: true, type: 'wallrow', flat: false, cx: c.cx, cy: c.cy, j, runs, x: c.cx * CW + CW / 2, y: (c.cy * N + j) * TS + 1 });
    }
    return c.rows;
  }

  function drawWallRow(ctx, r) {
    const P = G.Sprites.PX, CH = G.Tiles.CAP_H;
    const X = r.cx * CW, Y = (r.cy * N + r.j) * TS - G.Tiles.RAISE * P;
    const l = G.Camera.left() - 40, rr = l + G.Camera.w + 80;
    const k = fadeK();
    const draw = img => {
      const slot = img.capSlot ? img.capSlot[r.j] : -1;
      if (slot < 0 || !img.caps) return;
      for (const [i0, i1] of r.runs) {
        const x0 = X + i0 * TS, w = (i1 - i0 + 1) * TS;
        if (x0 > rr || x0 + w < l) continue;
        ctx.drawImage(img.caps, i0 * T, slot * CH, (i1 - i0 + 1) * T, CH, x0, Y, w + (i1 === N - 1 ? 1 : 0), CH * P);
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

  function drawGround(ctx, cam) {
    syncMode();
    ctx.imageSmoothingEnabled = false;
    const k = fadeK();
    for (const [cx, cy] of visibleChunks(cam)) {
      // +1 de solape: con escalas no enteras evita juntas entre chunks.
      if (k == null) { ctx.drawImage(chunkImage(cx, cy), cx * CW, cy * CW, CW + 1, CW + 1); continue; }
      // Fundido: el bioma viejo debajo y el nuevo apareciendo encima.
      ctx.drawImage(chunkImage(cx, cy, fade.from, fade.images), cx * CW, cy * CW, CW + 1, CW + 1);
      ctx.globalAlpha = k;
      ctx.drawImage(chunkImage(cx, cy), cx * CW, cy * CW, CW + 1, CW + 1);
      ctx.globalAlpha = 1;
    }
  }

  /** Brillos animados sobre el agua / burbujas de la lava (y del veneno y la electricidad). */
  function drawLiquid(ctx, cam, t) {
    const B = G.Tiles.BIOMES[biome];
    const lava = B.liquid === 'lava' || B.liquid === 'poison' || B.liquid === 'spark';
    ctx.fillStyle = B.foam;
    const P = G.Sprites.PX;
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
      if (ultra && cx * CW < r && cx * CW + CW > l) for (const w of wallRows(c)) if (w.y + TS > top && w.y - 18 < bot) out.push(w);
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
        // (En Ultra, de la 9 en adelante: las mismas con su sombra proyectada.)
        const pl = livePl, u = ultra ? 9 : 0;
        if (pl && !pl.dead && Math.abs(pl.x - p.x) < 20 && pl.y > p.y - 30 && pl.y < p.y + 8) return u + (p.look % 3) * 3 + 2;
        return u + (p.look % 3) * 3 + (Math.sin(t * 1.8 - p.x * 0.012 - p.y * 0.006) > 0.86 ? 1 : 0);
      }
      case 'rock': return (p.look % 2) * 2 + (p.hp < p.maxHp * 0.5 ? 1 : 0);
      case 'tree': return p.look % 3;
      case 'altar': return p.kind * 2 + (p.used ? 1 : 0);
      case 'spring': return p.charge < 0.15 ? 1 : 0;
      case 'trap': return p.kind * 4 + (((t * 5 + p.wiggle) | 0) & 3);
      default: return 0;
    }
  }

  function drawProp(ctx, p, t) {
    if (p.wallrow) { drawWallRow(ctx, p); return; }
    const P = G.Sprites.PX;
    const variant = propVariant(p, t);
    const img = G.Tiles.propSprite(biome, p.type, variant);
    const w = img.width * P, h = img.height * P;
    if (p.flat) {
      // Planos (manantial, trampa): pegados al suelo, centrados en su casilla.
      ctx.drawImage(img, Math.round(p.x - w / 2), Math.round(p.y - 8 - h / 2), w, h);
      if (p.type === 'spring' && p.charge >= 0.15 && Math.sin(t * 3 + p.wiggle) > 0.92) {
        G.FX.twinkle(p.x + G.U.rand(-20, 20), p.y - 8 + G.U.rand(-6, 6));
      }
      return;
    }
    if (p.type === 'altar' && !p.used) {
      // Halo del orbe, latiendo (el orbe va en (10, 5.5) del sprite).
      const col = ['#ff5f6d', '#5fd4ff', '#ff8ad8', '#ffd23f'][p.kind];
      ctx.globalAlpha = 0.22 + Math.sin(t * 3 + p.wiggle) * 0.1;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y - h + 2 + 5.5 * P, 13, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (p.type === 'bigchest' && p.open > 0) {
      ctx.save();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - h / 2, 26, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(1, p.open / G.Interact.CHEST_TIME));
      ctx.stroke();
      ctx.restore();
    }
    // (padR/padB: lo que la sombra pintada en el sprite le añade a la derecha y abajo.)
    const x = Math.round(p.x - (w - (img.padR || 0) * P) / 2), y = Math.round(p.y - h + (img.padB || 0) * P + (p.type === 'grass' ? 4 : 2));
    if (p.type !== 'grass') {
      if (ultra && CAST[p.type]) {
        // Ultra: su silueta tumbada en el suelo (sombra proyectada, guardada por variante).
        const cs = G.Tiles.castShadow(biome, p.type, variant);
        ctx.drawImage(cs, x, y + cs.dy * P, cs.width * P, cs.height * P);
      } else {
        // Sombra: imagen guardada (antes, una elipse con su trazado en cada fotograma).
        const sh = G.Tiles.shadow(p.type), sw = sh.width * P, shh = sh.height * P;
        ctx.drawImage(sh, Math.round(p.x - sw / 2), Math.round(p.y - shh / 2), sw, shh);
      }
    }
    // Ultra: lo alto se inclina hacia fuera del centro de la pantalla (cámara en
    // perspectiva, como en los juegos de DS): una sola transformación por objeto.
    const lean = ultra && TALL[p.type] ? -(p.x - G.Camera.x) / (G.Camera.w / 2) * LEAN : 0;
    const by = p.y + 2;
    if (lean) { ctx.translate(p.x, by); ctx.transform(1, 0, lean, 1, 0, 0); ctx.translate(-p.x, -by); }
    let a = 1;
    if (ultra && p.type === 'tree') {
      // Si tu Pokémon queda detrás de la copa, se transparenta un poco.
      const pl = livePl;
      if (pl && pl.y < p.y - 2 && pl.y > p.y - h * 0.85 && Math.abs(pl.x - p.x) < w * 0.42) a = 0.55;
    }
    const k = fadeK();
    if (k != null) {
      // El objeto viejo se desvanece mientras aparece el nuevo.
      const old = G.Tiles.propSprite(fade.from, p.type, variant);
      ctx.globalAlpha = (1 - k) * a;
      ctx.drawImage(old, Math.round(p.x - (old.width - (old.padR || 0)) * P / 2), Math.round(p.y - (old.height - (old.padB || 0)) * P + (p.type === 'grass' ? 4 : 2)), old.width * P, old.height * P);
      ctx.globalAlpha = k * a;
    } else if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(img, x, y, w, h);
    if (p.flash > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(G.Sprites.white(img), x, y, w, h); }
    if (lean) { ctx.translate(p.x, by); ctx.transform(1, 0, -lean, 1, 0, 0); ctx.translate(-p.x, -by); }
    // (Sin save/restore por objeto: sólo se toca la transparencia y aquí se deja como estaba.)
    ctx.globalAlpha = 1;
  }

  function update(dt, cam) {
    if (fade && (fade.t += dt) >= FADE) fade = null;
    for (const [cx, cy] of visibleChunks(cam, 60)) {
      for (const p of chunkData(cx, cy).props) if (p.flash > 0) p.flash -= dt;
    }
  }

  // ---------------- control ----------------

  function reset(s) {
    seed = (s | 0) || 1;
    data.clear(); images.clear(); broken.clear(); lots.clear(); blocks.clear();
    // La rejilla de los interactivos: el lote (0,0) centrado en el inicio, ±5 casillas (ver blockSpecial).
    offX = BLK * LOT / 2 + Math.floor(H(3, 7, seed + 950) * 11) - 5;
    offY = BLK * LOT / 2 + Math.floor(H(7, 3, seed + 951) * 11) - 5;
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
    // El terreno es el mismo: sólo cambia la paleta, fundiéndose poco a poco.
    fade = instant ? null : { from: biome, images, t: 0 };
    biome = b;
    images = new Map();
  }

  function biomeName() { return G.Tiles.BIOMES[biome].name; }

  /*
   * Ultra: luz del bioma en coordenadas de pantalla (en vez de la viñeta). Una
   * imagen pequeña guardada (¼ de la pantalla, se estira suavizada): luz cálida
   * arriba a la izquierda, sombra fresca abajo a la derecha, bruma arriba (lo
   * lejano, como con la cámara inclinada de DS) y la viñeta. En los biomas oscuros
   * (mood.dark), además, la luz alrededor de tu Pokémon como en las mazmorras de
   * Mundo Misterioso. Cuesta dos drawImage por fotograma.
   */
  let lightCv = null, lightKey = '', darkCv = null, darkKey = '';
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  function makeLight(w, h, m) {
    const cw = Math.max(48, Math.ceil(w / 4)), ch = Math.max(32, Math.ceil(h / 4));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, cw * 0.8, ch * 1.2);
    gr.addColorStop(0, rgba(m.warm || '#fff0c0', 0.2));
    gr.addColorStop(0.45, rgba(m.warm || '#fff0c0', 0));
    gr.addColorStop(1, rgba(m.cool || '#0a1838', 0.3));
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    gr = g.createLinearGradient(0, 0, 0, ch * 0.32);
    gr.addColorStop(0, rgba('#d8e6ff', 0.12)); gr.addColorStop(1, rgba('#d8e6ff', 0));
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    gr = g.createRadialGradient(cw / 2, ch * 0.46, Math.min(cw, ch) * 0.36, cw / 2, ch * 0.46, Math.max(cw, ch) * 0.78);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, rgba(m.cool || '#000000', 0.55));
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    return c;
  }
  function makeDark(w, h, m) {
    const cw = Math.max(64, Math.ceil(w / 2)), ch = Math.max(48, Math.ceil(h / 2));   // 2× la pantalla a ¼
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const r0 = Math.min(cw, ch) * 0.2, r1 = Math.max(cw, ch) * 0.34;
    const gr = g.createRadialGradient(cw / 2, ch / 2, r0, cw / 2, ch / 2, r1);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, rgba(m.cool || '#000000', m.dark));
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    return c;
  }
  function drawLight(ctx, w, h) {
    const m = G.Tiles.BIOMES[biome].mood || {};
    const key = w + 'x' + h + '/' + biome;
    if (key !== lightKey) { lightCv = makeLight(w, h, m); lightKey = key; }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightCv, 0, 0, w, h);
    if (m.dark > 0) {
      if (key !== darkKey) { darkCv = makeDark(w, h, m); darkKey = key; }
      const cam = G.Camera, pl = livePl;
      let px = w / 2, py = h / 2;
      if (pl) { px = (pl.x - cam.left()) * cam.scale; py = (pl.y - G.LIFT - cam.top()) * cam.scale; }
      ctx.drawImage(darkCv, px - w, py - h, w * 2, h * 2);
    }
    ctx.imageSmoothingEnabled = false;
  }

  /** Viñeta en coordenadas de pantalla (el degradado se guarda: sólo cambia con el tamaño). */
  let vig = null, vigW = 0, vigH = 0;
  function drawVignette(ctx, w, h) {
    if (ultra) { drawLight(ctx, w, h); return; }
    if (!vig || vigW !== w || vigH !== h) {
      vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.78);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,.5)');
      vigW = w; vigH = h;
    }
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  return {
    TS, CW, reset, setBiome, biomeName, liquidKind, liquidEffect, walkable,
    kindAt, isWall, isLiquid, isFree, collide, projectileBlock, propsInCircle, nearestBreakable,
    damageProp, breakAt, specialsNear, update,
    breakProp(p) { if (!broken.has(p.tx + ',' + p.ty)) destroyProp(p); },
    /** Arena de la grieta: { tx, ty, r } (en tiles) o null. */
    setArena(a) {
      arena = a;
      if (!a) return;
      a.th = G.Tiles.ARENA_THEMES[a.type] || G.Tiles.ARENA_THEMES.normal;
      // Olvida los chunks de esa zona (si se hubieran generado antes).
      const R = a.r + 9;
      for (const k of [...data.keys(), ...images.keys()]) {
        const [cx, cy] = k.split(',').map(Number);
        if (Math.abs(cx * N + N / 2 - a.tx) < R + N && Math.abs(cy * N + N / 2 - a.ty) < R + N) { data.delete(k); images.delete(k); }
      }
    },
    get arena() { return arena; }, drawGround, drawLiquid, visibleProps, drawProp, drawVignette,
    get biome() { return biome; }
  };
})();
