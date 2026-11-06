/* ============ tileset.js — el suelo con tilesets DTEF de Mundo Misterioso (2.0, bloque 6) ============
 * Opción B del dueño (docs/PROMPT-2.0.md §0 y §11): los tilesets de 24 px de Exploradores del Cielo (PMDCollab,
 * preparados por tools/fetch_tiles.py en assets/tiles-pmd/, datos en js/data/tilesets.js), con interruptor en
 * Ajustes > Gráficos («Casillas de Mundo Misterioso») y el pintor de tiles.js como respaldo: sin los datos, apagado o
 * mientras carga el PNG de un bioma, se pinta como antes. Retirarlos es borrar esa carpeta (y, si se quiere, tilesets.js
 * con su línea de dev.html).
 *
 * Formato DTEF: tileset_0 tiene 18×8 casillas de 24 px en tres secciones de 6×8 (pared, secundario, suelo); cada casilla
 * de una sección es una de las 47 «reglas» de autotiling. Cada vecino del mismo terreno pone un bit (N 1, NE 2, E 4, SE 8,
 * S 16, SO 32, O 64, NO 128) y una diagonal sólo cuenta si sus dos cardinales están puestos: 256 → 47. RULE da, para las
 * 256, la casilla (fila·6 + columna) de la sección: sacada leyendo la plantilla template.png de la especificación
 * (SkyTemple/skytemple-dtef, docs), no su código (GPL). Las variaciones (tileset_1, _2) se eligen con un hash de la
 * casilla y la semilla (todos ven lo mismo en cooperativo); el líquido se anima con los fotogramas de liq.png.
 * Con el tileset, el modo Ultra pinta las paredes planas (world.js no levanta filas de pared).
 *
 * (Bloque 6b) Los objetos del mundo, con el mismo interruptor y la misma escala (24 px de arte por casilla):
 *   - árboles: la pieza de pared suelta del tileset (en los bosques, un árbol; en las cuevas, una roca o un cristal):
 *     un árbol se lee como un trozo de pared, con su contorno y su cara, como en PMD («un bosque es pared»);
 *   - el cofre con candado y las trampas: los de PMD (tools/fetch_objects.py → assets/objects-pmd/, js/data/objects-pmd.js);
 *   - rocas, hierba alta, cofres, torres y manantiales: tiles.js con la paleta corta del bioma (pal, sacada del tileset).
 * Sin esos archivos, o mientras cargan, los pinta tiles.js como antes. Al pie de las paredes, una sombra corta en el
 * suelo para que se lean como obstáculo de un vistazo.
 *
 * (Arte PixelLab, 01-11-2026) Con el mismo interruptor, arte generado con PixelLab para PokéSurvivor
 * (tools/pixellab_gen.cjs + tools/pixellab_art.py → assets/objects-px/), a la misma escala:
 *   - las paredes son una elevación del suelo (como una meseta o un monte bajo): arriba, el suelo del bioma más claro,
 *     con el borde iluminado; al sur, una cara de roca (cliff.png, con los colores de roca del tileset) y su sombra en el
 *     suelo. Se lee como un bloque sólido con altura y no como baldosas planas;
 *   - los cofres (chest.png, bigchest.png, de tools/chest3d.py) en bloque como las paredes: la tapa vista desde arriba,
 *     el frente debajo, la misma luz y su sombra en el suelo;
 *   - las trampas, como algo del suelo: un charco de veneno, una telaraña y unas setas explosivas (trap0-2.png).
 * Si falta alguno de esos archivos, lo de antes (PMD o tiles.js).
 *
 * (Muros nuevos, 05-11-2026) Dibujados con pxl (tools/pxl/muros.px.js → assets/pxl/wallset.png) en tonos neutros: cada bioma les
 * pone sus colores (ramped), así que los 22 mapas comparten estilo. Cima con matas y bultos (los tonos de hierba del tileset),
 * cara de roca en facetas (los tonos de roca), borde que cuelga sobre la pared y, según el suelo, lianas, cristales o magma.
 */
G.Tileset = (() => {
  const T = 24;
  const RULE = new Uint8Array([10,28,10,28,21,15,21,12,10,28,10,28,21,15,21,12,16,9,16,9,3,27,3,32,16,9,16,9,0,38,0,6,10,28,10,28,21,15,21,12,10,28,10,28,21,15,21,12,16,9,16,9,3,27,3,32,16,9,16,9,0,38,0,6,
    23,11,23,11,4,26,4,41,23,11,23,11,4,26,4,41,5,29,5,29,20,22,20,44,5,29,5,29,35,42,35,19,23,11,23,11,4,26,4,41,23,11,23,11,4,26,4,41,2,39,2,39,34,43,34,46,2,39,2,39,1,24,1,37,
    10,28,10,28,21,15,21,12,10,28,10,28,21,15,21,12,16,9,16,9,3,27,3,32,16,9,16,9,0,38,0,6,10,28,10,28,21,15,21,12,10,28,10,28,21,15,21,12,16,9,16,9,3,27,3,32,16,9,16,9,0,38,0,6,
    23,14,23,14,4,40,4,13,23,14,23,14,4,40,4,13,5,33,5,33,20,45,20,25,5,33,5,33,35,47,35,31,23,14,23,14,4,40,4,13,23,14,23,14,4,40,4,13,2,8,2,8,34,18,34,30,2,8,2,8,1,36,1,7]);
  const FULL = RULE[255];                           // la casilla rodeada de lo suyo (el relleno)
  // Sección de cada terreno de world.js (0 suelo, 1 pared, 2 líquido): pared 0, secundario 1, suelo 2.
  const SEC = [2, 0, 1];
  const D8 = [[0, -1, 1], [1, -1, 2], [1, 0, 4], [1, 1, 8], [0, 1, 16], [-1, 1, 32], [-1, 0, 64], [-1, -1, 128]];
  const meta = {};
  for (const m of G.TILESETS || []) { meta[m.bi] = m; themed(m); }
  const st = {};                                    // bi -> { sheet, vars: [img], liq, left, ok, fail }
  let onReady = null;
  const ISO = RULE[0];                              // la pieza de pared suelta (sin vecinos de pared)
  const objs = {};                                  // (6b) cofres y trampas de PMD: tipo -> Image (o null si falló)
  const propCache = new Map();                      // "bi/variante" -> lienzo del árbol
  // (Arte PixelLab) Archivos de assets/objects-px/; px[k]: Image, null mientras carga, false si falló.
  const PX_FILES = ['chest', 'bigchest', 'trap2'];
  const FLOORS = ['grass', 'stone', 'ash', 'sand', 'snow', 'wood', 'metal'];
  const PXL_FILES = ['wallset', 'decor', 'flora', 'riftp', 'riftsuelo', 'trap0', 'trap1'].concat(FLOORS.map(f => 'floor_' + f));      // (dibujados con pxl: assets/pxl/)
  // Filas de wallset.png: [y, alto].
  const WS = { top: [0, 24], cliff: [24, 16], lip: [40, 7], vine: [47, 16], crystal: [63, 16], magma: [79, 16], pilC: [95, 26], pilB: [121, 26], pilL: [147, 26], rock: [173, 17], moss: [190, 17] };
  const WW = 96;
  const px = {};
  const TM = 2;                                     // (arte animado) hueco del árbol a los lados y arriba, para que el viento no lo corte
  const FH = 16;                                    // alto de la cara de roca de una pared (px de arte; cliff.png)

  /**
   * (Estilo común, 06-11-2026) Los colores del mundo salen de la paleta de cada bioma (tiles.js) y no de los del tileset: así todo lo
   * del mapa casa entre sí y con su nombre (antes las Ruinas del Juicio salían verdes y el Bosque Encantado, azul).
   * Cuatro tonos por material, de oscuro a claro. Del tileset sólo queda el agua.
   */
  function themed(m) {
    const B = G.Tiles && G.Tiles.BIOMES && G.Tiles.BIOMES[m.bi];
    if (!B || !B.floor || !B.dirt) return;
    const lum = h => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
    const lit = (h, k) => '#' + [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * k))).map(v => v.toString(16).padStart(2, '0')).join('');
    const four = list => { const s = list.slice(0, 3).sort((p, q) => lum(p) - lum(q)); return [s[0], s[1], s[2], lit(s[2], 1.14)]; };
    m.pal = Object.assign({}, m.pal, { floor: four(B.floor), dirt: four(B.dirt), grass: four(B.grass), rock: four(B.rock), edge: B.wallEdge || m.pal.edge });
  }

  /** ¿Se usan? (hay datos y el interruptor de Ajustes está encendido) */
  function enabled() { return !!(G.TILESETS && G.TILESETS.length) && G.Settings.get('pmdTiles') !== false; }

  function load(bi) {
    const m = meta[bi];
    if (!m || st[bi]) return;
    const s = st[bi] = { bi, vars: [], left: 0, ok: false, fail: false };
    const dir = 'assets/tiles-pmd/' + m.key + '/';
    const img = (file, put) => {
      s.left++;
      const im = new Image();
      im.onload = () => { put(im); if (--s.left === 0 && !s.fail) { s.ok = true; if (onReady) onReady(bi); } };
      im.onerror = () => { s.fail = true; };
      im.src = dir + file;
    };
    img('sheet.png', im => { s.sheet = im; });
    m.vars.forEach((v, i) => img(v.file, im => { s.vars[i] = im; }));
    if (m.frames) img('liq.png', im => { s.liq = im; });
    pxImg('wallset');
    pxImg(floorKey(bi));
  }

  /** La hoja de suelo del bioma (tools/pxl/suelos.px.js). */
  function floorKey(bi) { const g = G.Tiles.BIOMES[bi].ground; return 'floor_' + (FLOORS.includes(g) ? g : 'stone'); }

  /** (Arte PixelLab) Una imagen de assets/objects-px/: la Image, null mientras carga o false si no está. */
  function pxImg(k) {
    if (!(k in px)) {
      const im = new Image();
      px[k] = null;
      im.onload = () => { px[k] = im; for (const bi in st) if (st[bi].ok && onReady) onReady(+bi); };
      im.onerror = () => { px[k] = false; };
      im.src = (PXL_FILES.includes(k) ? 'assets/pxl/' : 'assets/objects-px/') + k + '.png';
    }
    return px[k];
  }

  /** ¿Está listo el de este bioma? (si no, lo pide y se pinta con tiles.js mientras) */
  function ready(bi) {
    if (!enabled() || !meta[bi]) return false;
    if (!st[bi]) load(bi);
    // (Arte PixelLab) Y la roca de las paredes, cargada o descartada (así no se hornea un chunk con las paredes de antes).
    return st[bi].ok && pxImg('wallset') !== null && pxImg(floorKey(bi)) !== null;
  }

  /** Precarga: los de esta lista (los del mapa al empezar; el siguiente al cambiar de bioma). */
  function preload(list) {
    if (!enabled()) return;
    for (const bi of list) load(bi);
    for (const k in G.OBJECTS_PMD || {}) obj(k);                 // (6b) los cofres y las trampas, una vez
    for (const k of PX_FILES.concat(PXL_FILES)) pxImg(k);         // (arte PixelLab y pxl)
  }

  /**
   * (Revisión del bloque 6) Con el menú en reposo: los PNG de todos los biomas a la caché (la de sw.js, o la del
   * navegador), uno tras otro y sin decodificarlos (no gastan memoria). Así las grietas y los biomas que aún no se han
   * visto cargan al momento en partida. Se para en partida y sigue al volver al menú. Una vez por sesión.
   */
  let warmQ = null;
  function warm() {
    if (warmQ || !enabled() || typeof fetch !== 'function' || location.protocol === 'file:') return;
    warmQ = [];
    for (const m of G.TILESETS) {
      const dir = 'assets/tiles-pmd/' + m.key + '/';
      warmQ.push(dir + 'sheet.png', ...m.vars.map(v => dir + v.file));
      if (m.frames) warmQ.push(dir + 'liq.png');
    }
    for (const k in G.OBJECTS_PMD || {}) warmQ.push('assets/objects-pmd/' + G.OBJECTS_PMD[k].file);
    for (const k of PX_FILES) warmQ.push('assets/objects-px/' + k + '.png');
    for (const k of PXL_FILES) warmQ.push('assets/pxl/' + k + '.png');
    const next = () => {
      if (!warmQ.length) return;
      if (G.Game.state !== 'ui') { setTimeout(next, 5000); return; }
      fetch(warmQ.shift()).then(r => r.blob()).catch(() => {}).then(() => setTimeout(next, 250));
    };
    setTimeout(next, 4000);
  }

  // Mismo hash que world.js (todos ven las mismas variaciones).
  function H(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** Casilla (0..47) de la sección para (tx, ty) con terreno t; at(tx, ty) -> terreno. */
  function cellOf(at, tx, ty, t) {
    let m = 0;
    for (const [dx, dy, b] of D8) if (at(tx + dx, ty + dy) === t) m |= b;
    return RULE[m];
  }

  /** De qué imagen sale la casilla: la base o una variación que la tenga (85 % la base). */
  function srcOf(s, m, sec, cell, tx, ty, seed) {
    const h = H(tx, ty, seed + 4242);
    const v = h < 0.85 ? -1 : h < 0.93 ? 0 : 1;
    for (let i = v; i >= 0; i--) {
      const mv = m.vars[i];
      if (mv && s.vars[i] && (mv.cells[sec] / Math.pow(2, cell)) % 2 >= 1) return s.vars[i];
    }
    return s.sheet;
  }

  /**
   * Hornea un chunk: N×N casillas de 24 px (world.js lo dibuja a su tamaño en el mundo, CW). at(tx, ty) -> terreno de
   * world.js (0 suelo, 1 pared, 2 líquido), también fuera del chunk (sin costuras).
   */
  function paintChunk(cx, cy, N, at, bi, seed, flat3d = false) {
    const s = st[bi], m = meta[bi];
    const cv = document.createElement('canvas');
    cv.width = cv.height = N * T;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }   // sin memoria de lienzos (iPhone): world.js suelta y reintenta
    g.imageSmoothingEnabled = false;
    const face = cliffFace(bi);                     // (arte PixelLab) con ella, las paredes son una elevación del suelo
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j, t = at(tx, ty), sec = SEC[t];
      // (Ultra 3D) Las paredes las levanta ultra3d.js en 3D: aquí sólo el suelo (queda tapado) y sin sombras pintadas.
      if (flat3d && t === 1) { if (!newFloor(g, bi, seed, tx, ty, i * T, j * T)) g.drawImage(s.sheet, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, i * T, j * T, T, T); continue; }
      if (t === 1 && face) { raised(g, at, tx, ty, i * T, j * T, s, m, seed, face); continue; }
      // Debajo, el suelo lleno (algunas casillas de pared o agua tienen huecos transparentes).
      const nf = newFloor(g, bi, seed, tx, ty, i * T, j * T);
      if (sec !== 2 && !nf) g.drawImage(s.sheet, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, i * T, j * T, T, T);
      const cell = cellOf(at, tx, ty, t);
      if (sec !== 2 || !nf) g.drawImage(srcOf(s, m, sec, cell, tx, ty, seed), (sec * 6 + cell % 6) * T, ((cell / 6) | 0) * T, T, T, i * T, j * T, T, T);
      if (t === 0) decor(g, at, tx, ty, i * T, j * T, bi, seed);
      // (6b) Sombra en el suelo al pie de una pared (al sur), para que la pared se lea como obstáculo; (arte PixelLab)
      //  más larga y, con la luz de arriba a la izquierda, también un poco al este de la pared.
      if (flat3d) continue;
      if (t !== 1 && at(tx, ty - 1) === 1) {
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(i * T, j * T, T, 2);
        g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(i * T, j * T + 2, T, 2);
        g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(i * T, j * T + 4, T, 2);
      }
      if (t !== 1 && at(tx - 1, ty) === 1) { g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(i * T, j * T, 2, T); }
    }
    cv.pmd = true;
    return cv;
  }

  /**
   * (Arte PixelLab) Una casilla de pared como elevación del suelo, en (x, y) del lienzo del chunk: arriba el suelo del
   * bioma más claro; si al sur no hay pared, la cara de roca (FH px) con su labio iluminado; contorno oscuro donde acaba
   * la elevación, luz en los bordes de arriba y de la izquierda y sombra en el de la derecha (luz de arriba a la izquierda).
   */
  //  (Un escalón más en el centro de las paredes grandes se probó y parecía un agujero: una sola elevación.)
  function raised(g, at, tx, ty, x, y, s, m, seed, face) {
    const w = (dx, dy) => at(tx + dx, ty + dy) === 1;
    const n = w(0, -1), so = w(0, 1), e = w(1, 0), wo = w(-1, 0), bi = s.bi;
    const top = so ? T : T - FH;                    // alto de la parte de arriba (la meseta)
    // Lo que queda fuera de las esquinas redondeadas: el suelo.
    const cut = (cx, cy, cw) => g.drawImage(s.sheet, (12 + FULL % 6) * T + (cx - x), ((FULL / 6) | 0) * T + (cy - y), cw, 1, cx, cy, cw, 1);
    topTile(g, bi, x, y, top, H(tx, ty, seed + 515));
    if (!so) {
      // La cara de roca: la textura seguida a lo largo de la fila (sin costuras entre casillas vecinas).
      const FW = face.width, o = ((tx * T) % FW + FW) % FW, a = Math.min(T, FW - o);
      g.drawImage(face, o, 0, a, FH, x, y + top, a, FH);
      if (a < T) g.drawImage(face, 0, 0, T - a, FH, x + a, y + top, T - a, FH);
      // Donde la cara acaba contra la elevación que sigue bajando (esquina interior): su contorno.
      g.fillStyle = m.pal.edge;
      if (wo && w(-1, 1)) g.fillRect(x, y + top, 1, FH);
      if (e && w(1, 1)) g.fillRect(x + T - 1, y + top, 1, FH);
    }
    rim(g, m, x, y, top, n, so, e, wo, !so, cut);
    g.fillStyle = m.pal.edge;
    if (n && wo && !w(-1, -1)) g.fillRect(x, y, 1, 1);
    if (n && e && !w(1, -1)) g.fillRect(x + T - 1, y, 1, 1);
  }

  /** Ruido suave de baja frecuencia: da manchas de varias casillas, que nunca se repiten. */
  function soft(x, y, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y), u = x - x0, v = y - y0, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    return (H(x0, y0, s) * (1 - a) + H(x0 + 1, y0, s) * a) * (1 - b) + (H(x0, y0 + 1, s) * (1 - a) + H(x0 + 1, y0 + 1, s) * a) * b;
  }
  /** ¿Material B en esta esquina de casilla? Dos escalas de ruido: manchas grandes con entrantes. */
  const cornerB = (vx, vy, seed) => soft(vx / 7, vy / 7, seed + 811) * 0.7 + soft(vx / 2.6, vy / 2.6, seed + 812) * 0.3 > 0.56;

  /**
   * (Suelo nuevo, 06-11-2026) Hoja de suelo con los colores del bioma: a b c d, el suelo; e f g h, el otro material (tierra, grava...).
   * tools/pxl/suelos.px.js. null si no se puede.
   */
  function floorSheet(bi) {
    const k = 'floorS/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const im = pxImg(floorKey(bi)), p = meta[bi].pal;
    if (!im || !p.dirt) return null;
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.drawImage(im, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, cv.width, cv.height); } catch (e) { G.U.freeCanvas(cv); return null; }
    const a = d.data, cols = [...p.floor, ...p.dirt].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    for (let i = 0; i < a.length; i += 4) {
      const c = cols[a[i] ? (a[i] >> 4) - 1 : (a[i + 1] >> 4) + 3];
      if (c) { a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; }
    }
    g.putImageData(d, 0, 0);
    propCache.set(k, cv);
    return cv;
  }

  /** Pinta la casilla de suelo nueva en (x, y). false si no está (entonces, la de antes). */
  function newFloor(g, bi, seed, tx, ty, x, y) {
    const sh = floorSheet(bi);
    if (!sh) return false;
    const mask = (cornerB(tx, ty, seed) ? 1 : 0) | (cornerB(tx + 1, ty, seed) ? 2 : 0) | (cornerB(tx, ty + 1, seed) ? 4 : 0) | (cornerB(tx + 1, ty + 1, seed) ? 8 : 0);
    g.drawImage(sh, mask * T, Math.floor(H(tx, ty, seed + 813) * 3) * T, T, T, x, y, T, T);
    return true;
  }

  /** Un trozo de cima de la casilla: una de las 8 variantes (las 4 de la hoja y sus espejos), con los colores del bioma. */
  function topTile(g, bi, x, y, top, h) {
    const tex = wallPart(bi, 'top');
    g.drawImage(tex, Math.floor(h * 8) * T, 0, T, top, x, y, T, top);
  }

  /** Fila de decor.png de cada suelo (null: suelos hechos, sin nada por el suelo). */
  const DECOR_ROW = { grass: 0, stone: 1, ash: 2, sand: 3, snow: 3 };

  /** La hoja de cosas del suelo del bioma: la última fila, con los tonos de roca del tileset. null mientras carga. */
  function decorSheet(bi) {
    const k = 'decor/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const im = pxImg('decor'), m = meta[bi];
    if (!im || !m.pal) return null;
    const cv = document.createElement('canvas');
    cv.width = WW; cv.height = 80;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.drawImage(im, 0, 0);
    const n = ramped(im, [64, 16], m.pal.rock);
    if (n) { g.clearRect(0, 64, WW, 16); g.drawImage(n, 0, 64); G.U.freeCanvas(n); }
    propCache.set(k, cv);
    return cv;
  }

  /**
   * (Mapas con vida) De vez en cuando, una cosa del suelo horneada en el chunk: flores, setas, cristales, huesos, piedras...
   * Según el suelo del bioma. No cuesta nada al dibujar, sale de un hash (todos ven lo mismo) y no toca el terreno.
   */
  function decor(g, at, tx, ty, x, y, bi, seed) {
    const row = DECOR_ROW[G.Tiles.BIOMES[bi].ground];
    if (row == null || at(tx, ty - 1) === 1) return;
    const h = H(tx, ty, seed + 616);
    if (h >= 0.13) return;
    const sh = decorSheet(bi);
    if (!sh) return;
    const r = h < 0.06 ? row : 4, c = Math.floor(H(tx, ty, seed + 617) * 6);
    g.drawImage(sh, c * 16, r * 16, 16, 16, x + Math.floor(H(tx, ty, seed + 618) * 8), y + Math.floor(H(tx, ty, seed + 619) * 8), 16, 16);
  }

  /**
   * El borde de la elevación: contorno oscuro, luz a la izquierda y arriba y sombra a la derecha, con las esquinas de fuera
   * redondeadas (una elevación del terreno no acaba en ángulo recto). cut(x, y, ancho) quita una fila; face: lleva cara al sur.
   */
  function rim(g, m, x, y, top, n, so, e, wo, face, cut) {
    const ramp = topRamp(m.bi), edge = m.pal.edge, lite = ramp[3], dark = ramp[0], R = x + T - 1, B = y + T - 1;
    if (!n) { g.fillStyle = lite; g.fillRect(x, y + 1, T, 1); g.fillStyle = edge; g.fillRect(x, y, T, 1); }
    if (!wo) { g.fillStyle = lite; g.fillRect(x + 1, y + 1, 1, top - 1); g.fillStyle = edge; g.fillRect(x, y, 1, T); }
    if (!e) { g.fillStyle = dark; g.fillRect(x + T - 2, y + 1, 1, top - 1); g.fillStyle = edge; g.fillRect(R, y, 1, T); }
    g.fillStyle = edge;
    const corner = (sx, sy) => {                     // sx, sy: ±1, hacia dentro de la casilla
      const X = sx > 0 ? x : R, Y = sy > 0 ? y : B;
      cut(sx > 0 ? X : X - 2, Y, 3); cut(sx > 0 ? X : X - 1, Y + sy, 2); cut(X, Y + 2 * sy, 1);
      g.fillRect(X + 3 * sx, Y, 1, 1); g.fillRect(X + 2 * sx, Y + sy, 1, 1); g.fillRect(X + sx, Y + 2 * sy, 1, 1); g.fillRect(X, Y + 3 * sy, 1, 1);
    };
    if (!n && !wo) corner(1, 1);
    if (!n && !e) corner(-1, 1);
    if (!so && !wo && face) corner(1, -1);
    if (!so && !e && face) corner(-1, -1);
  }

  /**
   * (Ultra 3D) Las texturas de las paredes en 3D (ultra3d.js), con el mismo dibujo que raised():
   *  - top3d: las caras de arriba del chunk (N×N casillas de 24 px; transparente donde no hay pared): el suelo del bioma
   *    más claro, contorno donde acaba la pared y luz en los bordes de arriba y de la izquierda;
   *  - face3d: la cara de roca (cliff.png con los colores del bioma, FH px de alto) con su sombra arriba y su contorno abajo.
   * null si no se puede (sin el arte o sin lienzo).
   */
  function top3d(cx, cy, N, at, bi, seed) {
    const s = st[bi], m = meta[bi];
    if (!s || !s.ok) return null;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N * T;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.imageSmoothingEnabled = false;
    if (!cliffFace(bi)) return null;
    const edge = m.pal.edge;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j;
      if (at(tx, ty) !== 1) continue;
      const w = (dx, dy) => at(tx + dx, ty + dy) === 1, x = i * T, y = j * T;
      const n = w(0, -1), so = w(0, 1), e = w(1, 0), wo = w(-1, 0);
      topTile(g, bi, x, y, T, H(tx, ty, seed + 515));
      if (!so) { g.fillStyle = topRamp(bi)[3]; g.fillRect(x, y + T - 2, T, 1); g.fillStyle = edge; g.fillRect(x, y + T - 1, T, 1); }
      rim(g, m, x, y, T, n, true, e, wo, false, (cx, cy, cw) => g.clearRect(cx, cy, cw, 1));
      g.fillStyle = edge;
      if (n && wo && !w(-1, -1)) g.fillRect(x, y, 1, 1);
      if (n && e && !w(1, -1)) g.fillRect(x + T - 1, y, 1, 1);
      if (so && wo && !w(-1, 1)) g.fillRect(x, y + T - 1, 1, 1);
      if (so && e && !w(1, 1)) g.fillRect(x + T - 1, y + T - 1, 1, 1);
    }
    return cv;
  }
  function face3d(bi) {
    const k = 'face3d/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const face = ready(bi) ? cliffFace(bi) : null;
    if (!face) return null;
    const cv = document.createElement('canvas');
    cv.width = face.width; cv.height = FH;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    const W = cv.width;
    g.drawImage(face, 0, 0);
    propCache.set(k, cv);
    return cv;
  }

  /**
   * (Arte PixelLab) Recolorea una imagen con una rampa de colores (oscuro → claro) según lo clara que es cada píxel. Los tramos de la rampa se reparten por cuantiles (de cada tono hay
   * más o menos lo mismo que en el original). null si no se puede (sin lienzo).
   */
  function recolor(img, ramp) {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.drawImage(img, 0, 0);
    cv.pxArt = true;
    let d;
    try { d = g.getImageData(0, 0, cv.width, cv.height); } catch (e) { return cv; }   // (file://: tal cual)
    const a = d.data, L = [], C = ramp.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    const lum = i => a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11;
    for (let i = 0; i < a.length; i += 4) if (a[i + 3]) L.push(lum(i));
    L.sort((p, q) => p - q);
    const cut = C.map((_, k) => L[Math.max(0, Math.floor(L.length * (k + 1) / C.length) - 1)]);
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      const l = lum(i);
      let k = 0;
      while (k < C.length - 1 && l > cut[k]) k++;
      a[i] = C[k][0]; a[i + 1] = C[k][1]; a[i + 2] = C[k][2];
    }
    g.putImageData(d, 0, 0);
    return cv;
  }

  /**
   * (Muros nuevos) Un trozo de wallset.png con los colores de ramp: los tonos del dibujo, ordenados de oscuro a claro, pasan a
   * los de ramp. Exacto (no por cuantiles como recolor): el dibujo no cambia, sólo su color. ramp null: con sus colores.
   */
  function ramped(im, [sy, sh], ramp) {
    const cv = document.createElement('canvas');
    cv.width = WW; cv.height = sh;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.drawImage(im, 0, sy, WW, sh, 0, 0, WW, sh);
    if (!ramp) return cv;
    let d;
    try { d = g.getImageData(0, 0, WW, sh); } catch (e) { return cv; }
    const a = new Uint32Array(d.data.buffer), lum = c => (c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11;
    const tones = [...new Set(a)].filter(c => c >>> 24).sort((p, q) => lum(p) - lum(q));
    const C = ramp.map(h => ((255 << 24) | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16)) >>> 0);
    const to = new Map(tones.map((c, i) => [c, C[tones.length > 1 ? Math.round(i * (C.length - 1) / (tones.length - 1)) : 0]]));
    for (let i = 0; i < a.length; i++) if (a[i] >>> 24) a[i] = to.get(a[i]);
    g.putImageData(d, 0, 0);
    return cv;
  }

  /** Los tonos de la cima: los de hierba del tileset; en el volcán, basalto (la tierra parda parecía un bloque plano). */
  const topRamp = bi => (G.Tiles.BIOMES[bi].ground === 'ash' ? meta[bi].pal.rock : meta[bi].pal.grass);

  /** La cima del bioma: 8 variantes de 24 px (las 4 del dibujo y sus espejos, para que no se note que se repite), o null. */
  function wallPart(bi, part) {
    const k = 'wall/' + part + '/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const c = ramped(pxImg('wallset'), WS[part], topRamp(bi));
    if (!c) return null;
    const cv = document.createElement('canvas');
    cv.width = WW * 2; cv.height = T;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(c); G.U.freeCanvas(cv); return null; }
    g.drawImage(c, 0, 0);
    g.translate(WW * 2, 0); g.scale(-1, 1);
    g.drawImage(c, 0, 0);
    G.U.freeCanvas(c);
    cv.wallTop = true;
    propCache.set(k, cv);
    return cv;
  }

  /**
   * (Muros nuevos) La cara de roca del bioma bi, o null: la roca con sus tonos, lo que crece en ella según el suelo (lianas,
   * cristales, magma) y el borde de la cima que cuelga encima. Una tira de 96 px que se repite a lo largo.
   */
  function cliffFace(bi) {
    const im = pxImg('wallset'), m = meta[bi];
    if (!im || !m.pal) return null;
    const k = 'cliff/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const B = G.Tiles.BIOMES[bi], gr = topRamp(bi), face = ramped(im, WS.cliff, [m.pal.edge, ...m.pal.rock]);
    if (!face) return null;
    const g = face.getContext('2d');
    const over = (part, ramp) => { const c = ramped(im, WS[part], ramp); if (c) { g.drawImage(c, 0, 0); G.U.freeCanvas(c); } };
    if (B.ground === 'grass') over('vine', [m.pal.edge, ...m.pal.grass]);
    else if (B.ground === 'stone') over('crystal', [m.pal.edge, ...B.leaf]);
    else if (B.ground === 'ash') over('magma', null);
    over('lip', [m.pal.edge, ...gr]);
    face.pxArt = true;
    propCache.set(k, face);
    return face;
  }

  /** (6b) Paleta corta del bioma (suelo, pared, contorno, roca, hierba), si su tileset está listo; si no, null. */
  function pal(bi) { return ready(bi) && meta[bi].pal ? meta[bi].pal : null; }

  /** (6b) Un cofre o una trampa de PMD (la imagen ya cargada), o null mientras carga, si falló o sin datos. */
  function obj(key) {
    const m = G.OBJECTS_PMD && G.OBJECTS_PMD[key];
    if (!m) return null;
    if (!(key in objs)) {
      const im = new Image();
      objs[key] = null;
      im.onload = () => { objs[key] = im; };
      im.src = 'assets/objects-pmd/' + m.file;
    }
    return objs[key];
  }

  /**
   * (6b) El dibujo de PMD de un objeto del mundo para el bioma bi (24 px de arte por casilla), o null si no lo hay y lo
   * pinta tiles.js: árboles (la pieza de pared suelta, con las variaciones del tileset según el aspecto), cofres y trampas.
   */
  function prop(bi, type, variant = 0) {
    if (!ready(bi)) return null;
    // (Arte PixelLab) Cofres y trampas nuevos; si faltan, los de PMD.
    const x = pxProp(bi, type, variant);
    if (x) return x;
    if (type === 'rock') return rockArt(bi, variant);
    if (type === 'bigchest') return obj('bigchest');            // (el pequeño de PMD no cabe en su casilla: tiles.js)
    if (type === 'trap') return obj('trap' + ((variant >> 2) % 3));
    if (type !== 'tree') return null;
    // (variant = aspecto + 3 × fotograma: ver world.js. Sin lienzo: null, este fotograma el de tiles.js.)
    return treeFrame(bi, variant % 3, (variant / 3) | 0);
  }

  /**
   * (Arte animado, 05-11-2026) El árbol, sin tronco y en su casilla. Lo normal es el dibujo de la hoja de muros (abajo); sin ella, la
   * pieza de pared suelta del tileset, recortada del suelo que lleva pintado: lo que sea suelo se quita desde el borde hacia dentro
   * (los colores del suelo dentro de la copa se quedan). Con TM px de hueco a los lados y arriba.
   */
  function treeCut(bi, look) {
    const k = 'cut/' + bi + '/' + look;
    if (propCache.has(k)) return propCache.get(k);
    // (Estilo común, 06-11-2026) Con las reglas de los Pokémon: copa sin tronco donde hay viento, cristales en cuevas y agujas
    //  de basalto en volcanes; en suelos hechos, agujas con los tonos de la roca. Todo con contorno oscuro.
    const gd = G.Tiles.BIOMES[bi].ground, sheet = pxImg('wallset');
    if (sheet) {
      const p = meta[bi].pal, part = leafy(bi) ? WS.pilL : gd === 'ash' ? WS.pilB : WS.pilC;
      const ramp = leafy(bi) ? [p.edge, ...p.grass] : gd === 'ash' ? null : gd === 'stone' ? [p.edge, ...G.Tiles.BIOMES[bi].leaf] : [p.edge, ...p.rock];
      const row = ramped(sheet, part, ramp);
      if (!row) return null;
      const c = document.createElement('canvas');
      c.width = T + TM * 2; c.height = T + TM;
      const cg = c.getContext('2d', { willReadFrequently: true });
      if (!cg) { G.U.freeCanvas(row); G.U.freeCanvas(c); return null; }
      cg.drawImage(row, look * (T + TM * 2), 0, T + TM * 2, T + TM, 0, 0, T + TM * 2, T + TM);
      G.U.freeCanvas(row);
      propCache.set(k, c);
      return c;
    }
    const s = st[bi], m = meta[bi], v = look - 1;
    let src = s.sheet;
    if (v >= 0 && m.vars[v] && s.vars[v] && (m.vars[v].cells[0] / Math.pow(2, ISO)) % 2 >= 1) src = s.vars[v];
    const cv = document.createElement('canvas');
    cv.width = T + TM * 2; cv.height = T + TM;
    const g = cv.getContext('2d', { willReadFrequently: true });       // (de aquí se leen sus 8 fotogramas)
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.imageSmoothingEnabled = false;
    g.drawImage(src, (ISO % 6) * T, ((ISO / 6) | 0) * T, T, T, TM, TM, T, T);
    try {
      // Los colores del suelo: los de la casilla llena de suelo de la hoja.
      const c = document.createElement('canvas');
      c.width = c.height = T;
      const cg = c.getContext('2d');
      cg.drawImage(s.sheet, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, 0, 0, T, T);
      const fl = new Set(new Uint32Array(cg.getImageData(0, 0, T, T).data.buffer));
      G.U.freeCanvas(c);
      const W = cv.width, Hh = cv.height, d = g.getImageData(0, 0, W, Hh), a = new Uint32Array(d.data.buffer);
      const q = [];
      const push = (x, y) => { const i = y * W + x; if (a[i] && fl.has(a[i])) { a[i] = 0; q.push(x, y); } };
      for (let i = 0; i < T; i++) { push(TM + i, TM); push(TM + i, TM + T - 1); push(TM, TM + i); push(TM + T - 1, TM + i); }
      while (q.length) {
        const y = q.pop(), x = q.pop();
        if (x > 0) push(x - 1, y);
        if (x < W - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < Hh - 1) push(x, y + 1);
      }
      // Las motas de suelo sueltas que quedan al lado del recorte también se van.
      for (let y = 1; y < Hh - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (a[i] && fl.has(a[i]) && (!a[i - 1] + !a[i + 1] + !a[i - W] + !a[i + W]) >= 2) a[i] = 0;
      }
      // Sin viento (cristales, rocas): la pieza no tiene suelo que quitar y se veía el cuadrado. Las esquinas, redondeadas.
      let solid = 0;
      for (let i = 0; i < a.length; i++) if (a[i]) solid++;
      if (solid > T * T * 0.8) {
        const c0 = TM + T / 2 - 0.5, R3 = Math.pow(T / 2, 3), edge = hex32(m.pal ? m.pal.edge : '#141414');
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
          const q = Math.pow(Math.abs(x - c0), 3) + Math.pow(Math.abs(y - c0), 3);
          if (q > R3) a[y * W + x] = 0;
          else if (q > R3 * 0.72 && a[y * W + x]) a[y * W + x] = edge;
        }
      }
      g.putImageData(d, 0, 0);
    } catch (e) { /* file://: con su cuadrado, como antes */ }
    propCache.set(k, cv);
    return cv;
  }

  const hex32 = h => ((255 << 24) | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16)) >>> 0;

  /** La sombra del árbol en el suelo (no se mueve con el viento). */
  function treeShade(bi, look) {
    const k = 'shade/' + bi + '/' + look;
    if (propCache.has(k)) return propCache.get(k);
    const base = treeCut(bi, look);
    if (!base) return null;
    const cv = document.createElement('canvas');
    cv.width = base.width; cv.height = base.height;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.drawImage(base, 1, 2);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 0, cv.width, cv.height);
    propCache.set(k, cv);
    return cv;
  }

  /** ¿Con viento? En cuevas, volcanes y suelos hechos no sopla: ahí el árbol es cristal o roca y brilla o late. */
  const leafy = bi => { const g = G.Tiles.BIOMES[bi].ground; return g === 'grass' || g === 'sand' || g === 'snow'; };

  /** El árbol del bioma: aspecto look (0..2), fotograma f (0..7, ver G.Anim.wind). */
  function treeFrame(bi, look, f) {
    const k = bi + '/' + look + '/' + f;
    let cv = propCache.get(k);
    if (cv) return cv;
    if (f && !G.Anim.take()) return treeFrame(bi, look, 0);
    const base = treeCut(bi, look), sh = treeShade(bi, look);
    if (!base || !sh) return null;
    const W = base.width, Hh = base.height;
    cv = leafy(bi) ? G.Anim.sway(base, f, 8, W / 2, Hh * 0.62, 2.2, sh)
      : G.Anim.sheen(base, f, 8, G.Tiles.BIOMES[bi].ground === 'ash', sh);
    if (cv) propCache.set(k, cv);
    return cv;
  }

  /**
   * (Objetos con pxl) La roca del bioma: variant = aspecto × 2 + rota. Con los tonos de roca del tileset y, en los bosques,
   * musgo. Mismas facetas que la cara de los muros. null sin la hoja: la pinta tiles.js.
   */
  function rockArt(bi, variant) {
    const k = 'rock/' + bi + '/' + variant;
    if (propCache.has(k)) return propCache.get(k);
    const im = pxImg('wallset'), m = meta[bi];
    if (!im || !m.pal) return null;
    const row = ramped(im, WS.rock, [m.pal.edge, ...m.pal.rock]);
    const moss = G.Tiles.BIOMES[bi].ground === 'grass' ? ramped(im, WS.moss, m.pal.grass) : null;
    const cv = document.createElement('canvas');
    cv.width = 22; cv.height = 17;
    const g = cv.getContext('2d');
    if (!row || !g) { if (row) G.U.freeCanvas(row); if (moss) G.U.freeCanvas(moss); G.U.freeCanvas(cv); return null; }
    const sx = (variant % 4) * 22;
    g.drawImage(row, sx, 0, 22, 17, 0, 0, 22, 17);
    if (moss) { g.drawImage(moss, sx, 0, 22, 17, 0, 0, 22, 17); G.U.freeCanvas(moss); }
    G.U.freeCanvas(row);
    propCache.set(k, cv);
    return cv;
  }

  /** (Arte PixelLab) El dibujo generado de un objeto (ya cargado), o null: cofres y trampas (los árboles, como antes). */
  function pxProp(bi, type, variant) {
    if (type === 'chest' || type === 'bigchest') return pxImg(type) || null;
    if (type === 'trap') return pxImg('trap' + ((variant >> 2) % 3)) || null;
    return null;
  }
  /** (Arte PixelLab) ¿Es un dibujo generado? (lleva su sombra y va a la escala de los Pokémon) */
  const isPx = img => !!img && (img.pxArt === true || (img instanceof Image && /\/(objects-px|pxl)\//.test(img.src)));

  /** ¿Tiene el líquido animado? */
  function animated(bi) { const s = st[bi]; return !!(s && s.ok && s.liq && meta[bi].frames > 1); }

  /** Dibuja el líquido de (tx, ty) en el fotograma del segundo t, en (x, y) con lado `size` (world.drawLiquid). */
  function drawLiquid(ctx, bi, at, tx, ty, x, y, size, t) {
    const s = st[bi], m = meta[bi];
    const f = Math.floor(t / Math.max(0.05, m.dur)) % m.frames;
    const cell = cellOf(at, tx, ty, 2);
    ctx.drawImage(s.liq, (f * 6 + cell % 6) * T, ((cell / 6) | 0) * T, T, T, x, y, size, size);
  }

  /** Suelta los árboles, rocas y caras repintados (Safari los ha vaciado, game.js gfxCheck); se rehacen al dibujar. */
  function purge() { for (const c of propCache.values()) G.U.freeCanvas(c); propCache.clear(); }

  return { T, RULE, FH, floorSheet, wallPart, cliffFace, enabled, ready, preload, warm, paintChunk, animated, drawLiquid, pal, prop, isPx, top3d, face3d, pxImg, purge,
    set onReady(fn) { onReady = fn; } };
})();
