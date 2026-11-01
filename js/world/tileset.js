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
 *   - los árboles sueltos de los biomas de árboles: árboles en vista 3/4 con tronco (tree0-2.png, con los verdes del
 *     tileset) y su sombra;
 *   - los cofres (chest.png, bigchest.png) con su sombra, del tamaño de su casilla;
 *   - las trampas, como algo del suelo: un charco de veneno, una telaraña y unas setas explosivas (trap0-2.png).
 * Si falta alguno de esos archivos, lo de antes (PMD o tiles.js).
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
  for (const m of G.TILESETS || []) meta[m.bi] = m;
  const st = {};                                    // bi -> { sheet, vars: [img], liq, left, ok, fail }
  let onReady = null;
  const ISO = RULE[0];                              // la pieza de pared suelta (sin vecinos de pared)
  const objs = {};                                  // (6b) cofres y trampas de PMD: tipo -> Image (o null si falló)
  const propCache = new Map();                      // "bi/variante" -> lienzo del árbol
  // (Arte PixelLab) Archivos de assets/objects-px/; px[k]: Image, null mientras carga, false si falló.
  const PX_FILES = ['tree0', 'tree1', 'tree2', 'chest', 'bigchest', 'trap0', 'trap1', 'trap2', 'cliff'];
  const px = {};
  const FH = 16;                                    // alto de la cara de roca de una pared (px de arte; cliff.png)

  /** ¿Se usan? (hay datos y el interruptor de Ajustes está encendido) */
  function enabled() { return !!(G.TILESETS && G.TILESETS.length) && G.Settings.get('pmdTiles') !== false; }

  function load(bi) {
    const m = meta[bi];
    if (!m || st[bi]) return;
    const s = st[bi] = { vars: [], left: 0, ok: false, fail: false };
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
    pxImg('cliff');
  }

  /** (Arte PixelLab) Una imagen de assets/objects-px/: la Image, null mientras carga o false si no está. */
  function pxImg(k) {
    if (!(k in px)) {
      const im = new Image();
      px[k] = null;
      im.onload = () => { px[k] = im; for (const bi in st) if (st[bi].ok && onReady) onReady(+bi); };
      im.onerror = () => { px[k] = false; };
      im.src = 'assets/objects-px/' + k + '.png';
    }
    return px[k];
  }

  /** ¿Está listo el de este bioma? (si no, lo pide y se pinta con tiles.js mientras) */
  function ready(bi) {
    if (!enabled() || !meta[bi]) return false;
    if (!st[bi]) load(bi);
    // (Arte PixelLab) Y la roca de las paredes, cargada o descartada (así no se hornea un chunk con las paredes de antes).
    return st[bi].ok && pxImg('cliff') !== null;
  }

  /** Precarga: los de esta lista (los del mapa al empezar; el siguiente al cambiar de bioma). */
  function preload(list) {
    if (!enabled()) return;
    for (const bi of list) load(bi);
    for (const k in G.OBJECTS_PMD || {}) obj(k);                 // (6b) los cofres y las trampas, una vez
    for (const k of PX_FILES) pxImg(k);                           // (arte PixelLab)
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
  function paintChunk(cx, cy, N, at, bi, seed) {
    const s = st[bi], m = meta[bi];
    const cv = document.createElement('canvas');
    cv.width = cv.height = N * T;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }   // sin memoria de lienzos (iPhone): world.js suelta y reintenta
    g.imageSmoothingEnabled = false;
    const face = cliffFace(bi);                     // (arte PixelLab) con ella, las paredes son una elevación del suelo
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j, t = at(tx, ty), sec = SEC[t];
      if (t === 1 && face) { raised(g, at, tx, ty, i * T, j * T, s, m, seed, face); continue; }
      // Debajo, el suelo lleno (algunas casillas de pared o agua tienen huecos transparentes).
      if (sec !== 2) g.drawImage(s.sheet, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, i * T, j * T, T, T);
      const cell = cellOf(at, tx, ty, t);
      g.drawImage(srcOf(s, m, sec, cell, tx, ty, seed), (sec * 6 + cell % 6) * T, ((cell / 6) | 0) * T, T, T, i * T, j * T, T, T);
      // (6b) Sombra en el suelo al pie de una pared (al sur), para que la pared se lea como obstáculo; (arte PixelLab)
      //  más larga y, con la luz de arriba a la izquierda, también un poco al este de la pared.
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
    const n = w(0, -1), so = w(0, 1), e = w(1, 0), wo = w(-1, 0);
    const top = so ? T : T - FH;                    // alto de la parte de arriba (la meseta)
    g.drawImage(srcOf(s, m, 2, FULL, tx, ty, seed), (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, x, y, T, T);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x, y, T, top);
    const edge = (m.pal && m.pal.edge) || '#141414', lite = 'rgba(255,255,255,0.32)', dark = 'rgba(0,0,0,0.2)';
    if (!so) {
      // La cara de roca: la textura seguida a lo largo de la fila (sin costuras entre casillas vecinas).
      const FW = face.width, o = ((tx * T) % FW + FW) % FW, a = Math.min(T, FW - o);
      g.drawImage(face, o, 0, a, FH, x, y + top, a, FH);
      if (a < T) g.drawImage(face, 0, 0, T - a, FH, x + a, y + top, T - a, FH);
      g.fillStyle = lite; g.fillRect(x, y + top - 1, T, 1);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + top, T, 1);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y + T - 3, T, 2);
      g.fillStyle = edge; g.fillRect(x, y + T - 1, T, 1);
      // Donde la cara acaba contra la elevación que sigue bajando (esquina interior): su contorno.
      if (wo && w(-1, 1)) g.fillRect(x, y + top, 1, FH);
      if (e && w(1, 1)) g.fillRect(x + T - 1, y + top, 1, FH);
    }
    if (!n) { g.fillStyle = edge; g.fillRect(x, y, T, 1); g.fillStyle = lite; g.fillRect(x, y + 1, T, 1); }
    if (!wo) { g.fillStyle = lite; g.fillRect(x + 1, y + 1, 1, top - 1); g.fillStyle = edge; g.fillRect(x, y, 1, T); }
    if (!e) {
      g.fillStyle = dark; g.fillRect(x + T - 2, y, 1, top);
      if (!so) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + T - 3, y + top, 2, FH); }
      g.fillStyle = edge; g.fillRect(x + T - 1, y, 1, T);
    }
    // Esquinas interiores de arriba: un punto de contorno.
    g.fillStyle = edge;
    if (n && wo && !w(-1, -1)) g.fillRect(x, y, 1, 1);
    if (n && e && !w(1, -1)) g.fillRect(x + T - 1, y, 1, 1);
  }

  /**
   * (Arte PixelLab) Recolorea una imagen con una rampa de colores (oscuro → claro) según lo clara que es cada píxel, sólo
   * en los que elige pick(r, g, b); los demás, igual. Los tramos de la rampa se reparten por cuantiles (de cada tono hay
   * más o menos lo mismo que en el original). null si no se puede (sin lienzo).
   */
  function recolor(img, ramp, pick) {
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
    for (let i = 0; i < a.length; i += 4) if (a[i + 3] && pick(a[i], a[i + 1], a[i + 2])) L.push(lum(i));
    L.sort((p, q) => p - q);
    const cut = C.map((_, k) => L[Math.max(0, Math.floor(L.length * (k + 1) / C.length) - 1)]);
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3] || !pick(a[i], a[i + 1], a[i + 2])) continue;
      const l = lum(i);
      let k = 0;
      while (k < C.length - 1 && l > cut[k]) k++;
      a[i] = C[k][0]; a[i + 1] = C[k][1]; a[i + 2] = C[k][2];
    }
    g.putImageData(d, 0, 0);
    return cv;
  }

  /** (Arte PixelLab) La cara de roca del bioma bi (cliff.png con su contorno y sus 4 tonos de roca), o null. */
  function cliffFace(bi) {
    const im = pxImg('cliff'), m = meta[bi];
    if (!im || !m.pal) return null;
    const k = 'cliff/' + bi;
    if (!propCache.has(k)) propCache.set(k, recolor(im, [m.pal.edge, ...m.pal.rock], () => true));
    return propCache.get(k);
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
    // (Arte PixelLab) Cofres, trampas y árboles generados; si faltan, los de PMD.
    const x = pxProp(bi, type, variant);
    if (x) return x;
    if (type === 'bigchest') return obj('bigchest');            // (el pequeño de PMD no cabe en su casilla: tiles.js)
    if (type === 'trap') return obj('trap' + ((variant >> 2) % 3));
    if (type !== 'tree') return null;
    const k = bi + '/' + (variant % 3);
    let cv = propCache.get(k);
    if (!cv) {
      const s = st[bi], m = meta[bi], v = variant % 3 - 1;
      let src = s.sheet;
      if (v >= 0 && m.vars[v] && s.vars[v] && (m.vars[v].cells[0] / Math.pow(2, ISO)) % 2 >= 1) src = s.vars[v];
      cv = document.createElement('canvas');
      cv.width = cv.height = T;
      const g = cv.getContext('2d');
      if (!g) { G.U.freeCanvas(cv); return null; }   // (sin memoria de lienzos: este fotograma, el de tiles.js)
      g.imageSmoothingEnabled = false;
      g.drawImage(src, (ISO % 6) * T, ((ISO / 6) | 0) * T, T, T, 0, 0, T, T);
      propCache.set(k, cv);
    }
    return cv;
  }

  /**
   * (Arte PixelLab) El dibujo generado de un objeto (ya cargado), o null: cofres, trampas y, en los biomas de árboles,
   * los árboles (la copa con los verdes del tileset; el tronco y el contorno, como están).
   */
  function pxProp(bi, type, variant) {
    if (type === 'chest' || type === 'bigchest') return pxImg(type) || null;
    if (type === 'trap') return pxImg('trap' + ((variant >> 2) % 3)) || null;
    const B = G.Tiles && G.Tiles.BIOMES[bi];
    if (type !== 'tree' || !B || B.prop !== 'tree') return null;
    const v = variant % 3, im = pxImg('tree' + v), m = meta[bi];
    if (!im) return null;
    const k = 'pxtree/' + bi + '/' + v;
    if (!propCache.has(k)) {
      const leaf = (r, g, b) => g > r + 8 && g >= b && r + g + b > 90;
      propCache.set(k, m.pal && m.pal.grass ? recolor(im, m.pal.grass, leaf) || im : im);
    }
    return propCache.get(k);
  }
  /** (Arte PixelLab) ¿Es un dibujo generado? (lleva su sombra y va a la escala de los Pokémon) */
  const isPx = img => !!img && (img.pxArt === true || (img instanceof Image && img.src.indexOf('/objects-px/') >= 0));

  /** ¿Tiene el líquido animado? */
  function animated(bi) { const s = st[bi]; return !!(s && s.ok && s.liq && meta[bi].frames > 1); }

  /** Dibuja el líquido de (tx, ty) en el fotograma del segundo t, en (x, y) con lado `size` (world.drawLiquid). */
  function drawLiquid(ctx, bi, at, tx, ty, x, y, size, t) {
    const s = st[bi], m = meta[bi];
    const f = Math.floor(t / Math.max(0.05, m.dur)) % m.frames;
    const cell = cellOf(at, tx, ty, 2);
    ctx.drawImage(s.liq, (f * 6 + cell % 6) * T, ((cell / 6) | 0) * T, T, T, x, y, size, size);
  }

  return { T, RULE, enabled, ready, preload, warm, paintChunk, animated, drawLiquid, pal, prop, isPx, set onReady(fn) { onReady = fn; } };
})();
