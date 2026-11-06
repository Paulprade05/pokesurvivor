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
  for (const m of G.TILESETS || []) meta[m.bi] = m;
  const st = {};                                    // bi -> { sheet, vars: [img], liq, left, ok, fail }
  let onReady = null;
  const ISO = RULE[0];                              // la pieza de pared suelta (sin vecinos de pared)
  const objs = {};                                  // (6b) cofres y trampas de PMD: tipo -> Image (o null si falló)
  const propCache = new Map();                      // "bi/variante" -> lienzo del árbol
  // (Arte PixelLab) Archivos de assets/objects-px/; px[k]: Image, null mientras carga, false si falló.
  const PX_FILES = ['chest', 'bigchest', 'trap2'];
  const PXL_FILES = ['wallset', 'decor', 'flora', 'riftp', 'riftsuelo', 'trap0', 'trap1'];      // (dibujados con pxl: assets/pxl/)
  // Filas de wallset.png: [y, alto].
  const WS = { top: [0, 24], cliff: [24, 16], lip: [40, 7], vine: [47, 16], crystal: [63, 16], magma: [79, 16], pilC: [95, 26], pilB: [121, 26], pilL: [147, 26], rock: [173, 17], moss: [190, 17] };
  const WW = 96;
  const px = {};
  const TM = 2;                                     // (arte animado) hueco del árbol a los lados y arriba, para que el viento no lo corte
  const FH = 16;                                    // alto de la cara de roca de una pared (px de arte; cliff.png)
  const FH3 = 20;                                   // (Ultra 3D) la misma cara con su pie en sombra

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
      im.onload = () => {
        put(im);
        if (--s.left || s.fail) return;
        if (s.liq) toneLiq(bi, s.liq);               // (ahora, al cargar: una vez horneado el bioma ya no hay que pararse a pintarla)
        s.ok = true;
        if (onReady) onReady(bi);
      };
      im.onerror = () => { s.fail = true; };
      im.src = dir + file;
    };
    img('sheet.png', im => { s.sheet = im; });
    m.vars.forEach((v, i) => img(v.file, im => { s.vars[i] = im; }));
    if (m.frames) img('liq.png', im => { s.liq = im; });
    pxImg('wallset');
  }

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
    return st[bi].ok && pxImg('wallset') !== null;
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
  function paintChunk(cx, cy, N, at, bi, seed, flat3d = false, grassAt = null) {
    const s = st[bi], m = meta[bi];
    const cv = document.createElement('canvas');
    cv.width = cv.height = N * T;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }   // sin memoria de lienzos (iPhone): world.js suelta y reintenta
    g.imageSmoothingEnabled = false;
    // (Mundo integrado, 06-11-2026) Como en Mundo Misterioso: suelo, paredes y líquido salen de las piezas de autotile del
    // tileset, con su borde irregular y la franja de plantas o cristales que hace de transición. Nada se dibuja encima con otro estilo.
    const fl = floorSheet(s, m, bi), seat = grassAt ? seatSheet(bi) : null;
    // (Hierba integrada) ¿Hay hierba en esta casilla o en la de al lado? Cada consulta cuesta un ruido: una vez por casilla.
    const W2 = N + 2, known = seat ? new Int8Array(W2 * W2).fill(-1) : null, x0 = cx * N, y0 = cy * N;
    const has = (tx, ty) => {
      const o = (ty - y0 + 1) * W2 + tx - x0 + 1;
      if (known[o] < 0) known[o] = grassAt(tx, ty) ? 1 : 0;
      return known[o];
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j, t = at(tx, ty), sec = SEC[t];
      // (Ultra 3D) Las paredes las levanta ultra3d.js en 3D: aquí sólo el suelo (queda tapado).
      if (flat3d && t === 1) { g.drawImage(s.sheet, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, i * T, j * T, T, T); continue; }
      // Debajo, el suelo lleno (algunas casillas de pared o agua tienen huecos transparentes).
      if (sec !== 2) g.drawImage(s.sheet, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, i * T, j * T, T, T);
      const cell = cellOf(at, tx, ty, t);
      const full = t === 0 && cell === FULL && fl;
      if (full) {
        // (Lo normal, la casilla limpia y sus espejos; de vez en cuando, una de las variaciones, que llevan ramitas o marcas.)
        const h = H(tx, ty, seed + 813), n = fl.width / T, f = h < 0.96 || n <= 4 ? Math.floor(H(tx, ty, seed + 814) * 4) : 4 + Math.floor(H(tx, ty, seed + 815) * (n - 4));
        g.drawImage(fl, f * T, 0, T, T, i * T, j * T, T, T);
      } else {
        const src = srcOf(s, m, sec, cell, tx, ty, seed);
        g.drawImage(sec === 1 ? toneLiq(bi, src) : src, (sec * 6 + cell % 6) * T, ((cell / 6) | 0) * T, T, T, i * T, j * T, T, T);
      }
      if (seat && t === 0) {
        const bits = has(tx, ty - 1) | has(tx + 1, ty) << 1 | has(tx, ty + 1) << 2 | has(tx - 1, ty) << 3, self = has(tx, ty);
        if (self || bits) g.drawImage(seat, bits * T, (self * 2 + (H(tx, ty, seed + 821) < 0.5 ? 0 : 1)) * T, T, T, i * T, j * T, T, T);
      }
      if (full) decor(g, at, tx, ty, i * T, j * T, bi, seed, seat ? has : null);
      if (flat3d && t === 0) {
        const nW = at(tx, ty - 1) === 1, wW = at(tx - 1, ty) === 1, eW = at(tx + 1, ty) === 1;
        if (nW || wW || eW) footShade(g, i * T, j * T, m.pal.edge, nW, wW, eW);
      }
    }
    if (G.Atmos) G.Atmos.bake(g, cx, cy, N, at, bi, seed, flat3d);     // (ambientación: tono del mapa, luz por zonas y muros en penumbra)
    cv.pmd = true;
    return cv;
  }

  /** Mezcla dos colores #rrggbb; devuelve [r, g, b]. */
  const hex3 = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix3 = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const css3 = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

  /**
   * (Hierba integrada, 06-11-2026) La hierba no se posa encima: nace del suelo. En Mundo Misterioso las plantas son parte del terreno,
   * con tierra oscura debajo y brotes pequeños alrededor. Aquí, una hoja de 4 filas (casilla sin o con hierba, 2 aspectos) y 16 columnas
   * (qué vecinos tienen hierba: N 1, E 2, S 4, O 8): manchas de tierra húmeda que dejan ver la textura del suelo, se deshacen hacia los
   * bordes y siguen unos píxeles fuera. El ruido se repite cada casilla y sus bordes son iguales en los dos aspectos, sin cortes.
   */
  function seatSheet(bi) {
    const k = 'seat/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const m = meta[bi];
    if (!m.pal) return null;
    const cv = document.createElement('canvas');
    cv.width = 16 * T; cv.height = 4 * T;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    const fl = m.pal.floor.map(hex3), gr = m.pal.grass.map(hex3), ed = hex3(m.pal.edge);
    const deep = mix3(mix3(fl[0], ed, 0.12), gr[1], 0.42), soft = mix3(fl[1], gr[1], 0.42);
    const sprig = mix3(gr[2], fl[2], 0.08), tip = gr[3] || gr[2];
    const lat = (i, j, look, n) => {
      i = (i + n) % n; j = (j + n) % n;
      return H(i * 7 + n, j * 5 + n, i && j ? 11 + look * 37 : 11);
    };
    const bil = (x, y, S, look) => {
      const n = T / S, i = Math.floor(x / S), j = Math.floor(y / S), u = x / S - i, v = y / S - j;
      const a = lat(i, j, look, n), b = lat(i + 1, j, look, n), c = lat(i, j + 1, look, n), e = lat(i + 1, j + 1, look, n);
      return (a + (b - a) * u) * (1 - v) + (c + (e - c) * u) * v;
    };
    const cl = v => Math.max(0, Math.min(1, v));
    let d;
    try { d = g.createImageData(cv.width, cv.height); } catch (e) { G.U.freeCanvas(cv); return null; }
    const put = (x, y, c, a) => { const o = (y * cv.width + x) * 4; d.data[o] = c[0]; d.data[o + 1] = c[1]; d.data[o + 2] = c[2]; d.data[o + 3] = a; };
    for (let row = 0; row < 4; row++) for (let bits = 0; bits < 16; bits++) {
      const self = row >> 1, look = row & 1, X = bits * T, Y = row * T;
      const weight = (x, y) => {
        const D = [y, T - 1 - x, T - 1 - y, x];
        let w = self ? 1 : 0;
        for (let s = 0; s < 4; s++) {
          // (El borde se tuerce con ruido: si siguiera la casilla, la mancha se vería cuadrada.)
          const on = (bits >> s) & 1, q = cl((D[s] + (bil(x, y, 6, look) - 0.5) * 16) / 10);
          if (self && !on) w = Math.min(w, 0.3 + 0.7 * q);
          if (!self && on) w = Math.max(w, 0.3 * (1 - q));
        }
        return w;
      };
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const w = weight(x, y), v = cl((0.6 * bil(x, y, 4, look) + 0.4 * bil(x, y, 2, look) - 0.25) * 2);
        if (v >= w * 0.9) continue;
        if (v < w * 0.34) put(X + x, Y + y, deep, 190); else put(X + x, Y + y, soft, 140);
      }
      // Brotes sueltos, dentro de la mancha.
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
        const px = i * 5 + 1 + Math.floor(H(i + look * 5, j, 901) * 3), py = j * 5 + 2 + Math.floor(H(i, j + look * 5, 902) * 3);
        if (px < 1 || px > T - 2 || py > T - 1 || weight(px, py) < 0.45 || H(i, j, 903 + look) > 0.9) continue;
        put(X + px, Y + py, sprig, 255); put(X + px - 1, Y + py - 1, sprig, 255); put(X + px + 1, Y + py - 1, sprig, 255); put(X + px, Y + py - 2, tip, 255);
      }
    }
    g.putImageData(d, 0, 0);
    propCache.set(k, cv);
    return cv;
  }

  /** (Objetos integrados) Una fila de sombra justo debajo de cada dibujo y sus colores, algo más cerca del suelo: así apoyan en él. */
  function grounded(g, cv, m, mute = 0.3) {
    let d;
    try { d = g.getImageData(0, 0, cv.width, cv.height); } catch (e) { return; }
    const a = d.data, W = cv.width, fl = hex3(m.pal.floor[1]), sh = mix3(hex3(m.pal.floor[0]), hex3(m.pal.edge), 0.42), edge = hex3(inkOf(m));
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 128 || (a[i] === edge[0] && a[i + 1] === edge[1] && a[i + 2] === edge[2])) continue;
      // (Ambientación) Rojos, amarillos y verdes a todo color eran lo que más se despegaba: pierden saturación y toman el tono del suelo.
      const l = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11, c = mix3([a[i], a[i + 1], a[i + 2]].map(v => v + (l - v) * mute), fl, 0.18);
      a[i] = c[0] * 0.94; a[i + 1] = c[1] * 0.94; a[i + 2] = c[2] * 0.94;
    }
    for (let y = cv.height - 1; y > 0; y--) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4, u = o - W * 4;
      if (a[o + 3] < 128 && a[u + 3] >= 128) { a[o] = sh[0]; a[o + 1] = sh[1]; a[o + 2] = sh[2]; a[o + 3] = 150; }
    }
    g.putImageData(d, 0, 0);
  }

  /** (Ultra) Dónde el muro toca el suelo, el suelo se oscurece a escalones: es lo que hace que parezca que está de pie. */
  function footShade(g, x, y, edge, N, W, E) {
    g.fillStyle = edge;
    const step = [0.34, 0.24, 0.14, 0.07];
    for (let k = 0; k < 4; k++) {
      g.globalAlpha = step[k];
      if (N) g.fillRect(x, y + k * 2, T, 2);
      if (W && k < 2) g.fillRect(x + k * 2, y, 2, T);
      if (E && k < 2) g.fillRect(x + T - 2 - k * 2, y, 2, T);
    }
    g.globalAlpha = 1;
  }

  /** (Ultra) La bruma de lo lejano: {c, a}. Clara al aire libre, oscura en lo que ya es oscuro. */
  function haze(bi) {
    const m = meta[bi];
    if (!m || !m.pal) return null;
    if (m.haze) return m.haze;
    const f = hex3(m.pal.floor[2]), lum = f[0] * 0.3 + f[1] * 0.59 + f[2] * 0.11;
    m.haze = lum > 88 ? { c: css3(mix3(f, [214, 232, 255], 0.62)), a: 0.26 } : { c: css3(mix3(hex3(m.pal.edge), hex3(m.pal.wall[0]), 0.4)), a: 0.4 };
    return m.haze;
  }

  /**
   * (Ambientación) El tono del contorno de lo que está en el suelo: el suelo oscurecido, no el «oscuro del mapa» a secas. Ese sale de la pared y en
   * muchos mapas es de otro color (verde casi negro en el Bosque Umbrío): piedras y terrones se veían con un cerco verde, pegados encima.
   */
  function inkOf(m) {
    if (m.ink) return m.ink;
    const f = hex3(m.pal.floor[0]), lum = f[0] * 0.3 + f[1] * 0.59 + f[2] * 0.11;
    m.ink = css3(mix3(f.map(v => Math.round(v * (lum > 110 ? 0.5 : 0.62))), hex3(m.pal.edge), 0.22));
    return m.ink;
  }

  /** El contorno casi negro de los dibujos pasa al tono del suelo: los Pokémon lo llevan negro, el terreno no. */
  function softEdge(g, cv, m) {
    let d;
    try { d = g.getImageData(0, 0, cv.width, cv.height); } catch (e) { return; }
    const a = d.data, e = parseInt(inkOf(m).slice(1), 16);
    for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 200 && a[i] < 40 && a[i + 1] < 34 && a[i + 2] < 46) { a[i] = e >> 16; a[i + 1] = e >> 8 & 255; a[i + 2] = e & 255; }
    g.putImageData(d, 0, 0);
  }

  /** La flora con el contorno del tileset (ambient.js). null si no está. */
  function floraSheet(bi) {
    const k = 'flora/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const im = pxImg('flora');
    if (!im || !meta[bi].pal) return null;
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.drawImage(im, 0, 0);
    softEdge(g, cv, meta[bi]);
    grounded(g, cv, meta[bi]);
    propCache.set(k, cv);
    return cv;
  }

  /**
   * (Mundo integrado) La casilla de suelo lleno, en todas sus formas: la del tileset, sus variaciones y sus espejos. Elegir una al azar
   * rompe el dibujo que se repite sin salir del arte del tileset. null si no se puede (entonces, la casilla tal cual).
   */
  function floorSheet(s, m, bi) {
    const k = 'floorS/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const src = [s.sheet];
    m.vars.forEach((v, i) => { if (s.vars[i] && (v.cells[2] / Math.pow(2, FULL)) % 2 >= 1) src.push(s.vars[i]); });
    const F = [[1, 1], [-1, 1], [1, -1], [-1, -1]], cv = document.createElement('canvas');
    cv.width = src.length * F.length * T; cv.height = T;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.imageSmoothingEnabled = false;
    src.forEach((im, a) => F.forEach(([fx, fy], b) => {
      const x = (a * F.length + b) * T;
      g.save(); g.translate(x + (fx < 0 ? T : 0), fy < 0 ? T : 0); g.scale(fx, fy);
      g.drawImage(im, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T, 0, 0, T, T);
      g.restore();
    }));
    muteMarks(g, cv, F.length * T);
    propCache.set(k, cv);
    return cv;
  }

  /**
   * (Ambientación) Las variaciones del tileset traen ramitas y brotes de un color muy fuerte (las «V» amarillas del Bosque Umbrío). Lo que no es de la
   * casilla limpia se acerca al suelo: la marca sigue ahí, como textura, sin saltar a la vista ni dejar ver que es la misma pieza repetida.
   */
  function muteMarks(g, cv, from) {
    if (cv.width <= from) return;
    let d;
    try { d = g.getImageData(0, 0, cv.width, T); } catch (e) { return; }
    const a = d.data, base = new Set(), w = cv.width;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = (y * w + x) * 4;
      base.add(a[i] << 16 | a[i + 1] << 8 | a[i + 2]);
      r += a[i]; gg += a[i + 1]; b += a[i + 2]; n++;
    }
    r /= n; gg /= n; b /= n;
    for (let y = 0; y < T; y++) for (let x = from; x < w; x++) {
      const i = (y * w + x) * 4;
      if (a[i + 3] < 128 || base.has(a[i] << 16 | a[i + 1] << 8 | a[i + 2])) continue;
      a[i] += (r - a[i]) * 0.66; a[i + 1] += (gg - a[i + 1]) * 0.66; a[i + 2] += (b - a[i + 2]) * 0.66;
    }
    g.putImageData(d, 0, 0);
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
    softEdge(g, cv, m);
    grounded(g, cv, m);
    propCache.set(k, cv);
    return cv;
  }

  /**
   * (Mapas con vida) De vez en cuando, una cosa del suelo horneada en el chunk: flores, setas, cristales, huesos, piedras...
   * Según el suelo del bioma. No cuesta nada al dibujar, sale de un hash (todos ven lo mismo) y no toca el terreno.
   */
  function decor(g, at, tx, ty, x, y, bi, seed, grassAt) {
    const row = DECOR_ROW[G.Tiles.BIOMES[bi].ground];
    if (row == null || at(tx, ty - 1) === 1) return;
    const h = H(tx, ty, seed + 616);
    if (h >= 0.045) return;
    const sh = decorSheet(bi);
    if (!sh) return;
    // (Ambientación) «Pocos adornos y con causa»: lo que crece, junto a la hierba; suelto en medio de la tierra parecía pegado.
    const live = h < 0.02;
    if (live && grassAt && !(grassAt(tx, ty) || grassAt(tx + 1, ty) || grassAt(tx - 1, ty) || grassAt(tx, ty + 1) || grassAt(tx, ty - 1))) return;
    const r = live ? row : 4, c = Math.floor(H(tx, ty, seed + 617) * 6);
    g.drawImage(sh, c * 16, r * 16, 16, 16, x + Math.floor(H(tx, ty, seed + 618) * 8), y + Math.floor(H(tx, ty, seed + 619) * 8), 16, 16);
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
    // (Mundo integrado) Arriba, la pieza de pared del tileset, igual que en 2D.
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j;
      if (at(tx, ty) !== 1) continue;
      const cell = cellOf(at, tx, ty, 1), x = i * T, y = j * T;
      // Debajo, el interior del muro y no el suelo: lo de arriba es una sola masa.
      g.fillStyle = m.pal.wall[0];
      g.fillRect(x, y, T, T);
      g.drawImage(s.sheet, FULL % 6 * T, ((FULL / 6) | 0) * T, T, T, x, y, T, T);
      g.drawImage(srcOf(s, m, 0, cell, tx, ty, seed), (cell % 6) * T, ((cell / 6) | 0) * T, T, T, x, y, T, T);
    }
    // (Ambientación) Como en 2D: el tono del mapa y el interior del muro en penumbra (sólo sobre lo pintado).
    moodTone(g, cv, bi);
    if (G.Atmos) G.Atmos.tops(g, cx, cy, N, at, bi, seed);
    return cv;
  }
  function face3d(bi) {
    const k = 'face3d/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    const face = ready(bi) ? cliffFace(bi) : null;
    if (!face) return null;
    const cv = document.createElement('canvas');
    cv.width = face.width; cv.height = FH3;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    const W = cv.width;
    g.imageSmoothingEnabled = false;
    // Más alta que la cara: repite su tramo de abajo y se hunde en sombra a escalones hasta tocar el suelo.
    g.drawImage(face, 0, 8, W, 6, 0, FH - 2, W, 6);
    g.drawImage(face, 0, 0, W, FH - 2, 0, 0, W, FH - 2);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = meta[bi].pal.edge;
    [[9, 0.1], [13, 0.14], [16, 0.16], [18, 0.16]].forEach(([y, a]) => { g.globalAlpha = a; g.fillRect(0, y, W, FH3 - y); });
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    moodTone(g, cv, bi);
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

  const topRamp = bi => meta[bi].pal.grass;

  /**
   * (Muros nuevos) La cara de roca del bioma bi, o null: la roca con sus tonos, lo que crece en ella según el suelo (lianas,
   * cristales, magma) y el borde de la cima que cuelga encima. Una tira de 96 px que se repite a lo largo.
   */
  function cliffFace(bi) {
    const im = pxImg('wallset'), m = meta[bi];
    if (!im || !m.pal) return null;
    const k = 'cliff/' + bi;
    if (propCache.has(k)) return propCache.get(k);
    // (2,5D) La cara es del mismo material que el suelo y más oscura, no una franja gris aparte.
    const earth = m.pal.rock.map((c, i) => css3(mix3(mix3(hex3(c), hex3(m.pal.floor[i]), 0.68), hex3(m.pal.edge), 0.16)));
    const line = css3(mix3(hex3(m.pal.edge), hex3(m.pal.floor[0]), 0.4));
    const B = G.Tiles.BIOMES[bi], gr = topRamp(bi), face = ramped(im, WS.cliff, [line, ...earth]);
    if (!face) return null;
    const g = face.getContext('2d');
    const over = (part, ramp) => { const c = ramped(im, WS[part], ramp); if (c) { g.drawImage(c, 0, 0); G.U.freeCanvas(c); } };
    if (B.ground === 'grass') over('vine', [line, ...m.pal.grass]);
    else if (B.ground === 'stone') over('crystal', [line, ...B.leaf]);
    else if (B.ground === 'ash') over('magma', null);
    over('lip', [line, ...gr]);
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
    // (Muros nuevos) Sin árboles donde no hay hojas: en cuevas, cristales con los tonos de la pared del tileset; en volcanes, agujas de
    // basalto. Donde hay hojas, la pieza suelta del tileset, que es del mismo arte que el suelo y las paredes.
    const gd = G.Tiles.BIOMES[bi].ground, sheet = gd === 'stone' || gd === 'ash' ? pxImg('wallset') : null;
    if (sheet) {
      const p = meta[bi].pal, row = ramped(sheet, gd === 'stone' ? WS.pilC : WS.pilB, gd === 'stone' ? [p.edge, ...p.wall] : null);
      if (!row) return null;
      const c = document.createElement('canvas');
      c.width = T + TM * 2; c.height = T + TM;
      const cg = c.getContext('2d', { willReadFrequently: true });
      if (!cg) { G.U.freeCanvas(row); G.U.freeCanvas(c); return null; }
      cg.drawImage(row, look * (T + TM * 2), 0, T + TM * 2, T + TM, 0, 0, T + TM * 2, T + TM);
      G.U.freeCanvas(row);
      moodTone(cg, c, bi);
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
    moodTone(g, cv, bi);
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
    // (Objetos integrados) Contorno entre el oscuro del mapa y su suelo: la roca sigue leyéndose, sin parecer recortada.
    const row = ramped(im, WS.rock, [inkOf(m), ...m.pal.rock]);
    const moss = G.Tiles.BIOMES[bi].ground === 'grass' ? ramped(im, WS.moss, m.pal.grass) : null;
    const cv = document.createElement('canvas');
    cv.width = 22; cv.height = 17;
    const g = cv.getContext('2d');
    if (!row || !g) { if (row) G.U.freeCanvas(row); if (moss) G.U.freeCanvas(moss); G.U.freeCanvas(cv); return null; }
    const sx = (variant % 4) * 22;
    g.drawImage(row, sx, 0, 22, 17, 0, 0, 22, 17);
    if (moss) { g.drawImage(moss, sx, 0, 22, 17, 0, 0, 22, 17); G.U.freeCanvas(moss); }
    G.U.freeCanvas(row);
    moodTone(g, cv, bi);
    propCache.set(k, cv);
    return cv;
  }

  /** (Ambientación) El tono del mapa también en lo que no va en el chunk, para que no salga más vivo que el suelo que pisa. */
  function moodTone(g, cv, bi) {
    const c = G.Atmos && G.Atmos.mood(bi).mul;
    if (!c) return;
    let d;
    try { d = g.getImageData(0, 0, cv.width, cv.height); } catch (e) { return; }
    const a = d.data, [r, gg, b] = hex3(c);
    for (let i = 0; i < a.length; i += 4) { a[i] = a[i] * r / 255; a[i + 1] = a[i + 1] * gg / 255; a[i + 2] = a[i + 2] * b / 255; }
    g.putImageData(d, 0, 0);
  }

  /** (Arte PixelLab) El dibujo generado de un objeto (ya cargado), o null: cofres y trampas (los árboles, como antes). */
  function pxProp(bi, type, variant) {
    if (type === 'chest' || type === 'bigchest') return pxImg(type) || null;
    if (type === 'trap') return pxImg('trap' + ((variant >> 2) % 3)) || null;
    return null;
  }
  /** (Arte PixelLab) ¿Es un dibujo generado? (lleva su sombra y va a la escala de los Pokémon) */
  const isPx = img => !!img && (img.pxArt === true || (img instanceof Image && /\/(objects-px|pxl)\//.test(img.src)));

  /*
   * (Ambientación) El agua no casaba con su mapa (Pico Celeste, Selva, Templo...): el tileset trae la suya, a veces de otro color que el líquido del
   * juego (un pantano azul, una corriente eléctrica o un veneno que no se leían como tales). Aquí cada mapa la lleva del color de su BIOMES[bi].liq: los
   * colores del agua, del más oscuro al más claro, se cambian por una escala de ese color; los líquidos que ya son de ese tono se quedan como están.
   * Además, liq.png trae la orilla con el suelo sin el tono del mapa y se veía un cuadro claro alrededor de cada charca: ese suelo se quita.
   * Son copias, en propCache: las imágenes del tileset no se tocan y, si Safari vacía una copia, se rehace. De la animada (la más grande) hay LIQ_MAX.
   */
  const LIQ_T = new Map(), LIQ_MAX = 3, liqLive = [];    // bi -> { list, floor, L, foam, keep }; liqLive: las copias animadas que hay
  const hue = c => {
    const [r, g, b] = c, M = Math.max(r, g, b), n = Math.min(r, g, b), d = M - n;
    if (!d) return { h: 0, s: 0 };
    const h = M === r ? ((g - b) / d + 6) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: d / M };
  };
  const rgbKey = (a, i) => a[i] << 16 | a[i + 1] << 8 | a[i + 2];
  function liqTable(bi) {
    if (LIQ_T.has(bi)) return LIQ_T.get(bi);
    const s = st[bi], B = G.Tiles.BIOMES[bi];
    let tab = null;
    try {
      const cv = document.createElement('canvas');
      cv.width = s.liq ? T * 6 : T; cv.height = s.liq ? T * 8 : T;
      const g = cv.getContext('2d', { willReadFrequently: true });
      const grab = (im, sx, sy, w, h) => { g.clearRect(0, 0, cv.width, cv.height); g.drawImage(im, sx, sy, w, h, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
      const water = new Map(), floor = new Set();
      let d = grab(s.sheet, (12 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T);
      for (let i = 0; i < d.length; i += 4) floor.add(rgbKey(d, i));
      d = grab(s.sheet, (6 + FULL % 6) * T, ((FULL / 6) | 0) * T, T, T);
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && !floor.has(rgbKey(d, i))) water.set(rgbKey(d, i), [d[i], d[i + 1], d[i + 2]]);
      let core = [...water.values()];
      const L = hex3(B.liq), lh = hue(L);
      if (s.liq) {
        // (Lo que se ve es la capa animada: su casilla llena dice de qué color es el agua, no la quieta de debajo.)
        d = grab(s.liq, (FULL % 6) * T, ((FULL / 6) | 0) * T, T, T);
        const top = [];
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && !floor.has(rgbKey(d, i))) top.push([d[i], d[i + 1], d[i + 2]]);
        if (top.length > T * T / 2) core = top;
        d = grab(s.liq, 0, 0, T * 6, T * 8);
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && !floor.has(rgbKey(d, i))) water.set(rgbKey(d, i), [d[i], d[i + 1], d[i + 2]]);
      }
      G.U.freeCanvas(cv);
      tab = { list: [...water.values()], floor, L, foam: hex3(B.foam), keep: true, wet: () => true };
      if (core.length) {
        const mean = core.reduce((a, c) => [a[0] + c[0] / core.length, a[1] + c[1] / core.length, a[2] + c[2] / core.length], [0, 0, 0]), mh = hue(mean);
        // (La orilla de tierra va en las mismas casillas: si se pintara del color del agua, cada charca saldría con un marco recto.)
        // (La lava va de rojo a amarillo sin orilla de tierra: toda es líquido.)
        if (B.liquid !== 'lava') tab.wet = c => { const q = hue(c), e = Math.abs(q.h - mh.h); return q.s < 0.12 || Math.min(e, 360 - e) < 70; };
        tab.list = tab.list.filter(tab.wet);
        const dh = Math.min(Math.abs(mh.h - lh.h), 360 - Math.abs(mh.h - lh.h));
        const luma = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
        tab.keep = dh < 38 && Math.abs(mh.s - lh.s) < 0.4 && Math.abs(luma(mean) - luma(L)) < 40;
      }
    } catch (e) { tab = null; }
    LIQ_T.set(bi, tab);
    return tab;
  }
  /** La misma imagen con el agua de su color (y, la animada, sin el suelo de la orilla). Si no se puede, la de siempre. */
  function toneLiq(bi, src) {
    const anim = src === st[bi].liq, tab = liqTable(bi);
    if (!tab || (tab.keep && !anim)) return src;
    const k = 'liq/' + bi + '/' + (anim ? 'a' : src === st[bi].sheet ? 's' : 'v' + st[bi].vars.indexOf(src));
    if (propCache.has(k)) return propCache.get(k);
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return src; }
    g.drawImage(src, 0, 0);
    let d;
    try { d = g.getImageData(0, 0, cv.width, cv.height); } catch (e) { G.U.freeCanvas(cv); return src; }
    const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11, a = d.data, Ls = tab.list.map(lum), lo = Math.min(...Ls), hi = Math.max(...Ls);
    const ramp = c => {
      const t = Math.max(0, Math.min(1, (lum(c) - lo) / Math.max(1, hi - lo)));
      return t < 0.72 ? mix3(tab.L.map(v => v * (lum(tab.L) > 140 ? 0.76 : 0.56)), tab.L, t / 0.72) : mix3(tab.L, tab.foam, (t - 0.72) / 0.28 * 0.6);
    };
    const mul = anim && G.Atmos && G.Atmos.mood(bi).mul ? hex3(G.Atmos.mood(bi).mul) : null, known = new Set(tab.list.map(c => c[0] << 16 | c[1] << 8 | c[2]));
    const seen = new Map();                          // color de origen -> color nuevo, o null si es suelo (se quita) o no es líquido
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 8) continue;
      const q = rgbKey(a, i);
      let o = seen.get(q);
      if (o === undefined) {
        // (La capa animada cambia de colores en cada fotograma: todo lo que no es suelo cuenta como agua.)
        o = tab.floor.has(q) && anim ? null : tab.keep || !((anim && tab.wet([a[i], a[i + 1], a[i + 2]])) || known.has(q)) ? [a[i], a[i + 1], a[i + 2]] : ramp([a[i], a[i + 1], a[i + 2]]);
        if (o && mul) o = o.map((v, n) => Math.round(v * mul[n] / 255));
        seen.set(q, o);
      }
      if (o) { a[i] = o[0]; a[i + 1] = o[1]; a[i + 2] = o[2]; } else a[i + 3] = 0;
    }
    g.putImageData(d, 0, 0);
    propCache.set(k, cv);
    if (anim) {
      liqLive.push(k);
      if (liqLive.length > LIQ_MAX) { const o = liqLive.shift(); G.U.freeCanvas(propCache.get(o)); propCache.delete(o); }
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
    ctx.drawImage(toneLiq(bi, s.liq), (f * 6 + cell % 6) * T, ((cell / 6) | 0) * T, T, T, x, y, size, size);
  }

  /** Suelta los árboles, rocas y caras repintados (Safari los ha vaciado, game.js gfxCheck); se rehacen al dibujar. */
  function purge() { for (const c of propCache.values()) G.U.freeCanvas(c); propCache.clear(); liqLive.length = 0; }

  return { T, RULE, FH, FH3, haze, cliffFace, floraSheet, enabled, ready, preload, warm, paintChunk, animated, drawLiquid, pal, prop, isPx, top3d, face3d, pxImg, purge,
    set onReady(fn) { onReady = fn; } };
})();
