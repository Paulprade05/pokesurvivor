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
  }

  /** ¿Está listo el de este bioma? (si no, lo pide y se pinta con tiles.js mientras) */
  function ready(bi) {
    if (!enabled() || !meta[bi]) return false;
    if (!st[bi]) load(bi);
    return st[bi].ok;
  }

  /** Precarga: los de esta lista (los del mapa al empezar; el siguiente al cambiar de bioma). */
  function preload(list) {
    if (!enabled()) return;
    for (const bi of list) load(bi);
    for (const k in G.OBJECTS_PMD || {}) obj(k);                 // (6b) los cofres y las trampas, una vez
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
    g.imageSmoothingEnabled = false;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j, t = at(tx, ty), sec = SEC[t];
      // Debajo, el suelo lleno (algunas casillas de pared o agua tienen huecos transparentes).
      if (sec !== 2) g.drawImage(s.sheet, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, i * T, j * T, T, T);
      const cell = cellOf(at, tx, ty, t);
      g.drawImage(srcOf(s, m, sec, cell, tx, ty, seed), (sec * 6 + cell % 6) * T, ((cell / 6) | 0) * T, T, T, i * T, j * T, T, T);
      // (6b) Sombra corta en el suelo al pie de una pared (al sur), para que la pared se lea como obstáculo.
      if (t !== 1 && at(tx, ty - 1) === 1) {
        g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(i * T, j * T, T, 2);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(i * T, j * T + 2, T, 2);
      }
    }
    cv.pmd = true;
    return cv;
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
      g.imageSmoothingEnabled = false;
      g.drawImage(src, (ISO % 6) * T, ((ISO / 6) | 0) * T, T, T, 0, 0, T, T);
      propCache.set(k, cv);
    }
    return cv;
  }

  /** ¿Tiene el líquido animado? */
  function animated(bi) { const s = st[bi]; return !!(s && s.ok && s.liq && meta[bi].frames > 1); }

  /** Dibuja el líquido de (tx, ty) en el fotograma del segundo t, en (x, y) con lado `size` (world.drawLiquid). */
  function drawLiquid(ctx, bi, at, tx, ty, x, y, size, t) {
    const s = st[bi], m = meta[bi];
    const f = Math.floor(t / Math.max(0.05, m.dur)) % m.frames;
    const cell = cellOf(at, tx, ty, 2);
    ctx.drawImage(s.liq, (f * 6 + cell % 6) * T, ((cell / 6) | 0) * T, T, T, x, y, size, size);
  }

  return { T, RULE, enabled, ready, preload, warm, paintChunk, animated, drawLiquid, pal, prop, set onReady(fn) { onReady = fn; } };
})();
