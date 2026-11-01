/* ============ ultra3d.js — Ultra 3D: paredes, rocas y cofres en 3D de verdad (WebGL, three.js) ============
 * Pedido del dueño (01-11-2026): con la calidad Ultra, las paredes, las piedras y los cofres con volumen de verdad, no un
 * 3D pintado, pero sin dejar de ser pixel art. Es sólo dibujo: choques, reparto de objetos y red no cambian.
 *
 * Cómo va:
 *  - three.js (js/vendor/three/, r160, MIT) se carga sólo con Ultra y el ajuste «Ultra en 3D» encendidos (como módulo,
 *    three-boot.js). Sin WebGL, si falla o si se pierde el contexto, vuelve solo el Ultra 2D de siempre (world.js levanta
 *    las paredes dibujadas otra vez). Necesita el tileset de Mundo Misterioso del bioma: sin él, también el 2D.
 *  - La cámara es la misma de game.js (D3 / G.Camera.toScreen): la homografía del suelo q = 1 − a·dv, escrita como matriz
 *    de proyección de una cámara de verdad. Lo alto (z, en unidades de mundo «de pantalla»: sube en la pantalla lo que
 *    mide) va como los sprites de pie: a la escala del sitio que pisa. Así encaja casilla a casilla con el suelo 2D, los
 *    Pokémon y los proyectiles.
 *  - Se dibuja a la escala del arte (24 px por casilla: 0,5 px por unidad de mundo) en un lienzo WebGL pequeño, con la
 *    cámara pegada a esa rejilla, y se pasa a la pantalla sin suavizar: píxeles nítidos, como el resto.
 *  - Orden de dibujo: cada fila de pared y cada roca o cofre entra en el orden por Y de game.js como los demás objetos.
 *    Lo seguido sin nada 2D en medio va en una sola pasada (render con tijera + drawImage de ese trozo), así un Pokémon
 *    detrás de una pared queda tapado y uno delante, encima.
 *  - Geometría: por chunk, una malla por fila con paredes (arriba + caras), con la luz del arte (arriba a la izquierda) y
 *    sombras de verdad (también en el suelo: un plano que sólo recibe sombra, que va justo después del suelo). Texturas:
 *    las de tileset.js (top3d / face3d: el mismo dibujo del Ultra 2D), los cofres de PixelLab recortados y rocas de pocos
 *    polígonos con los tonos de roca del bioma. Contorno oscuro por «casco invertido» (rocas y cofres).
 *  - Memoria (iPhone): lienzo pequeño, un mapa de sombras de 1024 (512 en móvil), los lienzos de las texturas se sueltan
 *    al subirlas y los chunks que se dejan de ver se liberan.
 */
G.Ultra3D = (() => {
  const KL = 0.5;            // px del lienzo 3D por unidad de mundo (24 px de arte por casilla de 48)
  const HW = 32;             // alto de las paredes (16 px de arte: el alto de la cara de roca, cliff.png)
  const KEEP = 6;            // chunks con mallas guardados de más (además de los de la vista y su margen)
  const OWN = { rock: 1, chest: 1, bigchest: 1 };
  const L = [-0.45 / 1.25, -0.6 / 1.25, 1 / 1.25];          // hacia la luz (arriba a la izquierda y del norte)
  let T = null, state = 'idle', lost = false;
  let renderer = null, glcv = null, scene, cam3, sun, plane, frame = 0;
  let Wl = 0, Hl = 0, R = 1, Ox = 0, Oy = 0;
  const P = new Float64Array(16);                          // la proyección (por filas), también para las cajas de tijera
  const chunks = new Map();                                // "cx,cy" -> { c, bi, rows: [{ ty, mesh }], tex, top, used }
  const faceMats = new Map(), rockMats = new Map(), flashMats = new Map();
  const props = new Map();                                 // id -> { obj, p, used, ... }
  let shared = null;                                       // geometrías y materiales de rocas y cofres (los mismos siempre)
  let shownRows = [], nBuilt = 0, nPass = 0, shadowDirty = true;                                      // filas de la vista (para game.js)
  const lay = new Set();                                   // objetos en la capa de la pasada actual

  const wanted = () => !!(G.Settings.ultra && G.Settings.get('ultra3d') !== false && G.Tileset && G.Tileset.enabled());
  /** ¿Van las paredes en 3D? (con Ultra y el ajuste; la primera vez pide three.js) */
  function on() {
    if (!wanted()) return false;
    if (state === 'idle') load();
    return state === 'ready' && !lost;
  }

  function load() {
    state = 'loading';
    if (typeof document === 'undefined' || location.protocol === 'file:') { state = 'fail'; return; }
    if (window.PS_THREE) { T = window.PS_THREE; start(); return; }
    const t0 = setTimeout(() => { if (state === 'loading') state = 'fail'; }, 20000);
    addEventListener('ps-three', () => { clearTimeout(t0); T = window.PS_THREE; start(); }, { once: true });
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'js/vendor/three/three-boot.js';
    s.onerror = () => { clearTimeout(t0); state = 'fail'; };
    document.head.appendChild(s);
  }

  function start() {
    try {
      glcv = document.createElement('canvas');
      glcv.width = glcv.height = 16;
      glcv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
      // (Al volver el contexto, lo de antes ya no existe en la GPU: se olvida sin borrarlo y se rehace al dibujar.)
      glcv.addEventListener('webglcontextrestored', () => { dropAll(true); lost = false; });
      // ¿Hay WebGL? (si no, three.js lo dice con un error en la consola: se mira antes y se queda el 2D)
      const probe = document.createElement('canvas'), gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) throw Error('sin WebGL');
      const lc = gl.getExtension('WEBGL_lose_context');
      if (lc) lc.loseContext();                            // (suelta el de la prueba al momento)
      renderer = new T.WebGLRenderer({ canvas: glcv, antialias: false, alpha: true, depth: true, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.BasicShadowMap;          // sombras duras: píxeles, como el arte
      renderer.shadowMap.autoUpdate = false;
      scene = new T.Scene();
      scene.matrixWorldAutoUpdate = false;
      cam3 = new T.Camera();
      cam3.matrixAutoUpdate = false;
      // Luz del arte: de arriba a la izquierda y algo del norte (la cara de delante, en sombra suave como en el 2D).
      // Lambert de three r160: lo que llega se divide entre π; arriba sale el color justo de la textura (0,6 + 0,5·0,8 = 1).
      const amb = new T.AmbientLight(0xffffff, 0.6 * Math.PI);
      sun = new T.DirectionalLight(0xffffff, 0.5 * Math.PI);
      sun.castShadow = true;
      const ms = G.U.IOS || G.Settings.touch ? 512 : 1024;
      sun.shadow.mapSize.set(ms, ms);
      sun.shadow.bias = -0.0015;
      sun.shadow.camera.near = 10; sun.shadow.camera.far = 3000;
      // (three.js también mira las capas de las luces: en todas, si no las pasadas salen negras.)
      amb.layers.enableAll(); sun.layers.enableAll();
      scene.add(amb, sun, sun.target);
      plane = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShadowMaterial({ opacity: 0.3, side: T.DoubleSide }));
      plane.receiveShadow = true;
      plane.layers.set(2);
      plane.frustumCulled = false;
      scene.add(plane);
      state = 'ready';
    } catch (e) {
      state = 'fail';
      if (renderer) try { renderer.dispose(); } catch (e2) { /* nada */ }
      renderer = null;
    }
  }

  // ---------------- texturas y materiales ----------------
  function tex(cv, repeat = false) {
    const t = new T.CanvasTexture(cv);
    t.magFilter = t.minFilter = T.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = T.RepeatWrapping;
    // (iPhone) El lienzo ya no hace falta al subirla: se suelta (si se pierde el contexto, se rehace todo).
    t.onUpdate = () => { if (!repeat) G.U.freeCanvas(cv); };
    return t;
  }
  const lambert = map => new T.MeshLambertMaterial({ map, side: T.DoubleSide, shadowSide: T.DoubleSide });

  function faceMat(bi) {
    let m = faceMats.get(bi);
    if (!m) { const cv = G.Tileset.face3d(bi); if (!cv) return null; m = lambert(tex(cv, true)); m.fw = cv.width; faceMats.set(bi, m); }
    return m;
  }

  /** Un golpe: el objeto se ve más claro un instante (como el destello blanco de los sprites). */
  function flashOf(m) {
    let f = flashMats.get(m);
    if (!f) { f = m.clone(); f.emissive = new T.Color(0x9a9a9a); flashMats.set(m, f); }
    return f;
  }

  // Hash de casilla (como world.js) para las rocas.
  function H(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** Textura de roca del bioma (16×16, sus 4 tonos de roca; rota: con grietas). */
  function rockMat(bi, cracked) {
    const k = bi + (cracked ? 'x' : '');
    let m = rockMats.get(k);
    if (m) return m;
    const pal = G.Tileset.pal(bi);
    const tone = pal ? pal.rock : ['#55535e', '#73717f', '#8e8c9d', '#a7a4b8'], edge = pal ? pal.edge : '#141414';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    const g = cv.getContext('2d');
    if (!g) return null;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = H(x >> 1, y >> 1, 31) * 0.6 + H(x, y, 32) * 0.4;
      g.fillStyle = tone[n < 0.12 ? 0 : n < 0.45 ? 1 : n < 0.85 ? 2 : 3];
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = tone[0];
    for (const [x, y] of [[3, 4], [4, 4], [11, 9], [12, 10], [7, 13]]) g.fillRect(x, y, 1, 1);
    if (cracked) {
      g.fillStyle = edge;
      for (const [x, y] of [[8, 1], [8, 2], [7, 3], [7, 4], [8, 5], [9, 6], [9, 7], [10, 8], [2, 9], [3, 10], [4, 10], [5, 11], [13, 3], [14, 4]]) g.fillRect(x, y, 1, 1);
    }
    const t = tex(cv, true);
    t.wrapT = T.RepeatWrapping;
    t.onUpdate = null;
    // (Con el tono de cada cara, en los colores del vértice: con sólo la luz, una roca de pocas caras se veía lisa.)
    m = new T.MeshLambertMaterial({ map: t, vertexColors: true, side: T.FrontSide, shadowSide: T.DoubleSide });
    rockMats.set(k, m);
    return m;
  }

  // ---------------- geometría ----------------
  /** Un cuadrilátero (a abajo-izq., b abajo-der., c arriba-der., d arriba-izq., visto desde fuera) con su normal y uv. */
  function quad(A, a, b, c, d, n, uv) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const p = [a, b, c, d][k];
      A.pos.push(p[0], p[1], p[2]); A.nor.push(n[0], n[1], n[2]); A.uv.push(uv[k * 2], uv[k * 2 + 1]);
    }
  }
  const rect = (u0, v0, u1, v1) => [u0, v0, u1, v0, u1, v1, u0, v1];

  function geo(A, groups) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(A.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(A.nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(A.uv, 2));
    if (groups) for (const [s, n, m] of groups) g.addGroup(s, n, m);
    return g;
  }

  /** Una caja (x0..x1, y0..y1, z0..z1) con una uv por cara: { top, front, west, east, back } (rect). */
  function box(A, x0, y0, z0, x1, y1, z1, f) {
    if (f.top) quad(A, [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1], [0, 0, 1], f.top);
    if (f.front) quad(A, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], f.front);
    if (f.west) quad(A, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0], f.west);
    if (f.east) quad(A, [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [1, 0, 0], f.east);
    if (f.back) quad(A, [x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [0, -1, 0], f.back);
  }

  /** Las mallas de las paredes de un chunk: una por fila (arriba con la textura del chunk; las caras, con la de roca). */
  function buildChunk(cx, cy, bi) {
    const W = G.World, N = W.N, TS = W.TS, c = W.chunk(cx, cy), at = W.terrainAt;
    const e = { c, bi, rows: [], tex: null, top: null, used: frame };
    if (!c.terr.includes(1)) return e;
    const fm = faceMat(bi), cv = G.Tileset.top3d(cx, cy, N, at, bi, W.seed);
    if (!fm || !cv) { if (cv) G.U.freeCanvas(cv); return null; }
    e.tex = tex(cv);
    e.top = lambert(e.tex);
    const FW = fm.fw * 2;                                // ancho de la textura de roca en el mundo (2 por px de arte)
    for (let j = 0; j < N; j++) {
      const ty = cy * N + j, y0 = ty * TS, y1 = y0 + TS;
      const A = { pos: [], nor: [], uv: [] }, F = { pos: [], nor: [], uv: [] };
      const wall = i => at(cx * N + i, ty) === 1;
      for (let i = 0; i < N; i++) {
        if (!wall(i)) continue;
        let k = i;
        while (k + 1 < N && wall(k + 1)) k++;
        const x0 = (cx * N + i) * TS, x1 = (cx * N + k + 1) * TS;
        quad(A, [x0, y1, HW], [x1, y1, HW], [x1, y0, HW], [x0, y0, HW], [0, 0, 1], rect(i / N, 1 - (j + 1) / N, (k + 1) / N, 1 - j / N));
        i = k;
      }
      for (let i = 0; i < N; i++) {
        const tx = cx * N + i;
        if (!wall(i)) continue;
        const x0 = tx * TS, x1 = x0 + TS;
        if (at(tx, ty + 1) !== 1) quad(F, [x0, y1, 0], [x1, y1, 0], [x1, y1, HW], [x0, y1, HW], [0, 1, 0], rect(x0 / FW, 0, x1 / FW, 1));
        if (at(tx - 1, ty) !== 1) quad(F, [x0, y0, 0], [x0, y1, 0], [x0, y1, HW], [x0, y0, HW], [-1, 0, 0], rect(y0 / FW, 0, y1 / FW, 1));
        if (at(tx + 1, ty) !== 1) quad(F, [x1, y1, 0], [x1, y0, 0], [x1, y0, HW], [x1, y1, HW], [1, 0, 0], rect(y0 / FW, 0, y1 / FW, 1));
      }
      if (!A.pos.length) continue;
      const nA = A.pos.length / 3, nF = F.pos.length / 3;
      for (const k of ['pos', 'nor', 'uv']) A[k].push(...F[k]);
      const mesh = new T.Mesh(geo(A, [[0, nA, 0], [nA, nF, 1]]), [e.top, fm]);
      setup(mesh, true);
      e.rows.push({ ty, mesh, x0: cx * N * TS, x1: (cx + 1) * N * TS });
    }
    return e;
  }

  function setup(o, receive) {
    o.matrixAutoUpdate = false;
    o.updateMatrix(); o.updateMatrixWorld(true);
    o.frustumCulled = false;
    o.traverse(m => { if (m.isMesh) { m.castShadow = !m.hull; m.receiveShadow = receive && !m.hull; m.frustumCulled = false; } });
    scene.add(o);
  }

  function dropChunk(k) {
    const e = chunks.get(k);
    shadowDirty = true;
    chunks.delete(k);
    if (!e) return;
    for (const r of e.rows) { scene.remove(r.mesh); r.mesh.geometry.dispose(); }
    if (e.tex) e.tex.dispose();
    if (e.top) e.top.dispose();
  }

  // ---------------- rocas y cofres ----------------
  /** Las piezas que no cambian: 2 rocas de pocos polígonos, 2 cofres (texturas de PixelLab recortadas) y el contorno. */
  function sharedParts() {
    if (shared) return shared;
    const chest = G.Tileset.pxImg('chest'), big = G.Tileset.pxImg('bigchest');
    if (!chest || !big) return null;
    const s = { rocks: [], hullMat: new T.MeshBasicMaterial({ color: 0x141010, side: T.BackSide }) };
    // Rocas: un icosaedro aplastado con las esquinas movidas (las mismas en cada vértice repetido), la base plana.
    // (Los ejes del juego —x al este, y al sur, z arriba— son un espejo de los de three.js: se da la vuelta al orden de los
    //  vértices de cada triángulo para que lo de fuera mire a la cámara, y cada normal, hacia fuera de la roca.)
    for (let look = 0; look < 2; look++) {
      const g = new T.IcosahedronGeometry(1, 0), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const h = H(Math.round(x * 9), Math.round(y * 9) + look * 31, Math.round(z * 9) + 7);
        const k = 0.78 + h * 0.44;
        x *= (look ? 19 : 17) * k; y *= 10 * k; z = (z * 0.6 + 0.4) * (look ? 13 : 16) * k;
        p.setXYZ(i, x, y, Math.max(0, z));
      }
      const v = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), n = new T.Vector3(), nor = [], uv = [], col = [];
      for (let i = 0; i < p.count; i += 3) {
        // (vuelta: 0 1 2 → 0 2 1)
        const x1 = p.getX(i + 1), y1 = p.getY(i + 1), z1 = p.getZ(i + 1);
        p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x1, y1, z1);
        v.fromBufferAttribute(p, i); a.fromBufferAttribute(p, i + 1).sub(v); b.fromBufferAttribute(p, i + 2).sub(v);
        n.crossVectors(a, b).normalize();
        const c = new T.Vector3().fromBufferAttribute(p, i).add(a.add(v)).add(b.add(v)).divideScalar(3).sub(new T.Vector3(0, 0, 6));
        if (n.dot(c) < 0) n.negate();
        // Cada cara, uno de 3 tonos según mira a la luz (como una roca de pixel art: cara clara, media y oscura).
        const d = n.x * L[0] + n.y * L[1] + n.z * L[2], tone = d > 0.75 ? 1.15 : d > 0.35 ? 0.85 : 0.6;
        for (let k = 0; k < 3; k++) { nor.push(n.x, n.y, n.z); col.push(tone, tone, tone); }
      }
      for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + p.getY(i) * 0.4) / 32, (p.getZ(i) - p.getY(i) * 0.5) / 32);
      g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      const hull = g.clone();
      hull.translate(0, 0, -6); hull.scale(1.13, 1.18, 1.12); hull.translate(0, 0, 6);
      s.rocks.push({ g, hull });
    }
    // Cofres: tapa (arriba y su frente), cuerpo (su frente) y lados, del dibujo de PixelLab (chest.png 21×21, bigchest 29×27).
    s.chest = chestParts(chest, { w: 20, lidTop: [0, 8], lidFront: [8, 12], body: [12, 18] });
    s.big = chestParts(big, { w: 28, lidTop: [0, 11], lidFront: [11, 16], body: [16, 24] });
    return (shared = s);
  }

  function crop(img, x, y, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (!g) return null;
    g.drawImage(img, x, y, w, h, 0, 0, w, h);
    return cv;
  }

  /** Un cofre: medidas en px de arte (×2 en el mundo); filas de la imagen para cada parte. */
  function chestParts(img, L) {
    const D = L.lidTop[1] - L.lidTop[0], hl = L.lidFront[1] - L.lidFront[0], hb = L.body[1] - L.body[0], w = L.w;
    const mat = cv => lambert(tex(cv));
    const m = {
      top: mat(crop(img, 0, L.lidTop[0], w, D)), lidF: mat(crop(img, 0, L.lidFront[0], w, hl)), body: mat(crop(img, 0, L.body[0], w, hb)),
      lidS: mat(crop(img, 0, L.lidFront[0], Math.min(D, w), hl)), bodyS: mat(crop(img, 0, L.body[0], Math.min(D, w), hb))
    };
    const X = w, Y = D * 2, Zb = hb * 2, Zl = hl * 2;   // (mundo) ancho, fondo, alto del cuerpo y de la tapa
    const x0 = -X, x1 = X, y0 = -Y, y1 = 0, U = rect(0, 0, 1, 1);
    const B = { pos: [], nor: [], uv: [] };
    box(B, x0, y0, 0, x1, y1, Zb, { front: U });
    const nf = B.pos.length / 3;
    box(B, x0, y0, 0, x1, y1, Zb, { west: U, east: U, back: U });
    const body = geo(B, [[0, nf, 0], [nf, B.pos.length / 3 - nf, 1]]);
    // La tapa, con el giro en el borde de atrás (y = y0, z = Zb): el cofre con candado la levanta al abrirse.
    const Lg = { pos: [], nor: [], uv: [] };
    box(Lg, x0, 0, 0, x1, Y, Zl, { top: U });
    const n1 = Lg.pos.length / 3;
    box(Lg, x0, 0, 0, x1, Y, Zl, { front: U });
    const n2 = Lg.pos.length / 3;
    box(Lg, x0, 0, 0, x1, Y, Zl, { west: U, east: U, back: U });
    const lid = geo(Lg, [[0, n1, 0], [n1, n2 - n1, 1], [n2, Lg.pos.length / 3 - n2, 2]]);
    const HB = { pos: [], nor: [], uv: [] };
    const o = 1.6;
    box(HB, x0 - o, y0 - o, -o, x1 + o, y1 + o, Zb + Zl + o, { top: U, front: U, west: U, east: U, back: U });
    return { m, body, lid, hull: geo(HB), Y, Zb, Zl, X };
  }

  function makeProp(p) {
    const s = sharedParts();
    if (!s) return null;
    const o = new T.Group();
    let it;
    if (p.type === 'rock') {
      const r = s.rocks[p.look % 2], mesh = new T.Mesh(r.g, rockMat(G.World.biome, false)), hull = new T.Mesh(r.hull, s.hullMat);
      hull.hull = true;
      o.add(mesh, hull);
      it = { obj: o, mesh, kind: 'rock', h: 26 };
    } else {
      const c = p.type === 'bigchest' ? s.big : s.chest;
      const body = new T.Mesh(c.body, [c.m.body, c.m.bodyS]);
      const pivot = new T.Group();
      pivot.position.set(0, -c.Y, c.Zb);
      const lid = new T.Mesh(c.lid, [c.m.top, c.m.lidF, c.m.lidS]);
      pivot.add(lid);
      const hull = new T.Mesh(c.hull, s.hullMat);
      hull.hull = true;
      o.add(body, pivot, hull);
      it = { obj: o, mesh: body, lid, pivot, kind: p.type, h: c.Zb + c.Zl + 14, c };
    }
    // Donde está: centrado en su casilla, apoyado en el suelo (los pies del objeto, p.y, están 4 por encima del borde).
    o.position.set(p.x, p.type === 'rock' ? p.y - 16 : p.y - 6, 0);
    setup(o, true);
    o.traverse(m => { m.matrixAutoUpdate = true; });
    o.updateMatrixWorld(true);
    it.p = p; it.bi = G.World.biome; it.used = frame; it.mats = null;
    return it;
  }

  function syncProp(p, t) {
    let it = props.get(p.id);
    if (it && it.bi !== G.World.biome) { dropProp(p.id); it = null; }
    if (!it) { it = makeProp(p); if (!it) return null; props.set(p.id, it); shadowDirty = true; }
    it.used = frame;
    if (it.kind === 'rock') {
      const m = rockMat(it.bi, p.hp < p.maxHp * 0.5);
      it.mesh.material = p.flash > 0 ? flashOf(m) : m;
    } else {
      const c = it.c;
      const want = p.flash > 0;
      if (want !== !!it.flashing) {
        it.flashing = want;
        it.mesh.material = want ? [flashOf(c.m.body), flashOf(c.m.bodyS)] : [c.m.body, c.m.bodyS];
        it.lid.material = want ? [flashOf(c.m.top), flashOf(c.m.lidF), flashOf(c.m.lidS)] : [c.m.top, c.m.lidF, c.m.lidS];
      }
      // El cofre con candado levanta la tapa mientras lo abres.
      const a = it.kind === 'bigchest' ? 0.55 * Math.min(1, p.open / G.Interact.CHEST_TIME) : 0;
      if (it.pivot.rotation.x !== a) { it.pivot.rotation.x = a; it.obj.updateMatrixWorld(true); shadowDirty = true; }
    }
    return it;
  }

  function dropProp(id) {
    const it = props.get(id);
    props.delete(id);
    if (it) { scene.remove(it.obj); shadowDirty = true; }
  }

  function dropAll(gone = false) {
    if (gone) {
      for (const e of chunks.values()) for (const r of e.rows) scene.remove(r.mesh);
      for (const it of props.values()) scene.remove(it.obj);
      chunks.clear(); props.clear(); faceMats.clear(); rockMats.clear(); flashMats.clear(); shared = null; shadowDirty = true;
      return;
    }
    for (const k of [...chunks.keys()]) dropChunk(k);
    for (const id of [...props.keys()]) dropProp(id);
    const kill = m => { if (m.map) m.map.dispose(); m.dispose(); };
    for (const m of faceMats.values()) kill(m);
    for (const m of rockMats.values()) kill(m);
    for (const m of flashMats.values()) m.dispose();
    faceMats.clear(); rockMats.clear(); flashMats.clear();
    if (shared) {
      for (const r of shared.rocks) { r.g.dispose(); r.hull.dispose(); }
      for (const c of [shared.chest, shared.big]) { c.body.dispose(); c.lid.dispose(); c.hull.dispose(); for (const k in c.m) kill(c.m[k]); }
      shared.hullMat.dispose();
      shared = null;
    }
  }

  // ---------------- cada fotograma ----------------
  /** Mundo → px del lienzo 3D (con la proyección de este fotograma). */
  function proj(x, y, z) {
    const w = P[12] * x + P[13] * y + P[14] * z + P[15];
    return [((P[0] * x + P[1] * y + P[2] * z + P[3]) / w + 1) * Wl / 2, (1 - (P[4] * x + P[5] * y + P[6] * z + P[7]) / w) * Hl / 2];
  }

  /**
   * Prepara el fotograma (game.js, D3.draw): tamaño, cámara, chunks a la vista, rocas y cofres (vis: los objetos visibles),
   * luz y sombras. Kd: px del lienzo del juego por unidad de mundo; Wd, Hd: su tamaño. false: este fotograma, en 2D.
   */
  function begin(cam, Kd, Wd, Hd, vis) {
    if (!on()) return false;
    const W = G.World, bi = W.biome;
    if (!W.pmdOn(bi) || !faceMat(bi) || !sharedParts()) return false;
    frame++;
    // Tamaño del lienzo 3D: la pantalla a la escala del arte (y como mucho 1024: memoria de lienzos).
    const wl = Math.min(1024, Math.ceil(Wd * KL / Kd) + 2), hl = Math.min(1024, Math.ceil(Hd * KL / Kd) + 2);
    if (wl !== Wl || hl !== Hl) { Wl = wl; Hl = hl; renderer.setSize(Wl, Hl, false); }    // (el atlas crece en render())
    R = Kd / KL;
    // Cámara pegada a la rejilla de píxeles del arte (sin «nadar» al moverse); el resto se corrige al pasarlo a la pantalla.
    const hw = cam.w / 2, hh = cam.h / 2, a = cam.persp / hh, b = a;
    const cxs = Math.round(cam.x * KL) / KL, cys = Math.round(cam.y * KL) / KL;
    const Cx = Math.round(hw * KL), Cy = Math.round(hh * KL);
    Ox = (cxs - cam.x + hw + cam._sx) * Kd - Cx * R;
    Oy = (cys - cam.y + hh + cam._sy) * Kd - Cy * R;
    // La homografía del suelo de G.Camera (q = 1 − a·dv) como cámara: w = q − b·z; lo alto sube en la pantalla.
    const w = [0, -a, -b, 1 + a * cys];
    const xr = [2 * KL / Wl, 0, 0, -2 * KL * cxs / Wl].map((v, i) => v + (2 * Cx / Wl - 1) * w[i]);
    const yr = [0, KL, -KL, -KL * cys].map((v, i) => -2 * v / Hl + (1 - 2 * Cy / Hl) * w[i]);
    // Profundidad: z = 5/3 − (4/3)/w (w de 0,5 a 2: de sobra; lo cercano, w más pequeño, delante).
    const zr = w.map((v, i) => 5 / 3 * v + (i === 3 ? -4 / 3 : 0));
    P.set([...xr, ...yr, ...zr, ...w]);
    cam3.projectionMatrix.set(...P);
    cam3.projectionMatrixInverse.copy(cam3.projectionMatrix).invert();

    // Lo que se ve (como D3): más ancho arriba. Con margen para las sombras de lo que queda justo fuera.
    const K = cam.persp, ex = hw / (1 - K) + 60, top = cam.y - hh / (1 - K) - 60, bot = cam.y + hh / (1 + K) + 60 + HW;
    const CW = W.CW, N = W.N, TS = W.TS;
    const c0 = Math.floor((cam.x - ex - 200) / CW), c1 = Math.floor((cam.x + ex + 200) / CW);
    const r0 = Math.floor((top - 200) / CW), r1 = Math.floor((bot + 100) / CW);
    let built = 0;
    shownRows = [];
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const k = cx + ',' + cy;
      let e = chunks.get(k);
      if (e && (e.bi !== bi || e.c !== W.chunk(cx, cy))) { dropChunk(k); e = null; }
      if (!e) {
        // Los del margen, como mucho 2 por fotograma (se hacen antes de verse); los que ya se ven, al momento.
        const seen = (cx + 1) * CW > cam.x - ex && cx * CW < cam.x + ex && (cy + 1) * CW > top && cy * CW < bot;
        if (!seen && built >= 2) continue;
        built++;
        e = buildChunk(cx, cy, bi); nBuilt++; shadowDirty = true;
        if (!e) continue;
        chunks.set(k, e);
      }
      e.used = frame;
      for (const r of e.rows) {
        const y0 = r.ty * TS;
        if (y0 + TS > top - HW && y0 - HW < bot && r.x1 > cam.x - ex && r.x0 < cam.x + ex) shownRows.push(r);
      }
    }
    const MAX = (r1 - r0 + 1) * (c1 - c0 + 1) + KEEP;
    if (chunks.size > MAX) {
      const old = [...chunks].filter(([, e]) => e.used !== frame).sort((p, q) => p[1].used - q[1].used);
      for (let i = 0; i < old.length && chunks.size > MAX; i++) dropChunk(old[i][0]);
    }

    // Rocas y cofres a la vista; los que no se ven en un rato, fuera.
    const t = performance.now() / 1000;
    for (const p of vis) if (OWN[p.type]) syncProp(p, t);
    // (Los que no se ven, ni se dibujan ni dan sombra: un cofre roto dejaba su sombra en el suelo.)
    for (const [id, it] of props) {
      if (frame - it.used > 90) { dropProp(id); continue; }
      const v = it.used === frame;
      if (it.obj.visible !== v) { it.obj.visible = v; shadowDirty = true; }
    }

    // Luz y sombras. El mapa de sombras sólo se rehace si algo cambia (rehacerlo cada fotograma era de lo que más costaba
    // en el móvil): la luz va a saltos de STEP, con margen de sobra, y se marca al hacer o soltar chunks y objetos.
    const STEP = 192, S = Math.max(ex, (bot - top) / 2) + STEP + 160;
    const sx = Math.round(cam.x / STEP) * STEP, sy = Math.round((top + bot) / 2 / STEP) * STEP;
    const sc = sun.shadow.camera;
    if (Math.abs(sc.right - S) > STEP) { sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.updateProjectionMatrix(); shadowDirty = true; }
    if (sun.target.position.x !== sx || sun.target.position.y !== sy) {
      sun.target.position.set(sx, sy, 0);
      sun.position.set(sx + L[0] * 1500, sy + L[1] * 1500, L[2] * 1500);
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
      shadowDirty = true;
    }
    plane.position.set(cam.x, (top + bot) / 2, 0);
    plane.scale.set(2 * ex + 400, bot - top + 400, 1);
    plane.updateMatrix(); plane.updateMatrixWorld(true);
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    return true;
  }

  /** Las filas de pared a la vista, para el orden por Y de game.js: { y, u3row }. */
  function rows(items) {
    const TS = G.World.TS;
    for (const r of shownRows) items.push({ y: r.ty * TS + 1, u3row: r });
  }

  const owns = p => !!OWN[p.type] && props.has(p.id);

  /*
   * Las pasadas. game.js va metiendo lo 3D en lotes (add) en el orden por Y; un lote acaba justo antes de lo 2D que se le
   * cruza en la pantalla (hits). Lo que no se cruza puede ir antes o después sin que se note: casi siempre, pocos lotes.
   * Después, render() los dibuja todos en el lienzo 3D, uno debajo de otro (un «atlas»: arriba las sombras del suelo y
   * debajo cada lote, con su tijera), y game.js pega cada trozo en su sitio (ground / blit). Así el lienzo WebGL se copia
   * una sola vez por fotograma: copiarlo después de cada render era lo que más costaba (medido: la mitad del tiempo).
   */
  function add(b, it) {
    const TS = G.World.TS;
    let o, x0, x1, y0, y1, h;
    if (it.u3row) { o = it.u3row.mesh; x0 = it.u3row.x0; x1 = it.u3row.x1; y0 = it.u3row.ty * TS; y1 = y0 + TS; h = HW; }
    else {
      const q = props.get(it.u3.id);
      if (!q) return b;
      o = q.obj; x0 = it.u3.x - 34; x1 = it.u3.x + 34; y0 = it.u3.y - 50; y1 = it.u3.y + 6; h = q.h;
    }
    if (!b) b = { objs: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, ay: -1 };
    b.objs.push(o);
    for (const x of [x0, x1]) for (const [y, z] of [[y0, h], [y1, 0], [y1, h]]) {
      const [u, v] = proj(x, y, z);
      if (u < b.x0) b.x0 = u; if (u > b.x1) b.x1 = u; if (v < b.y0) b.y0 = v; if (v > b.y1) b.y1 = v;
    }
    return b;
  }

  /** ¿Se cruza el rectángulo (px del lienzo del juego) con lo del lote? */
  function hits(b, x0, y0, x1, y1) {
    return x1 > b.x0 * R + Ox && x0 < b.x1 * R + Ox && y1 > b.y0 * R + Oy && y0 < b.y1 * R + Oy;
  }

  /** Una pasada al atlas: la imagen entera (Wl×Hl) con su esquina en (0, oy) del lienzo, sólo lo de la tijera. */
  function draw(oy, sx, sy, sw, sh, layer) {
    const Ha = glcv.height;
    renderer.setViewport(0, Ha - oy - Hl, Wl, Hl);
    renderer.setScissor(sx, Ha - (sy + oy) - sh, sw, sh);
    renderer.setScissorTest(true);
    cam3.layers.set(layer);
    renderer.render(scene, cam3);
    nPass++;
  }

  /** Dibuja las sombras del suelo y todos los lotes del fotograma en el lienzo 3D. */
  function render(list) {
    // Sitio de cada lote, debajo de las sombras del suelo (como mucho 4 pantallas: si no caben, con el anterior).
    let y = Hl, prev = null;
    for (const b of list) {
      b.x = Math.max(0, Math.floor(b.x0) - 2); b.y = Math.max(0, Math.floor(b.y0) - 2);
      b.w = Math.min(Wl, Math.ceil(b.x1) + 2) - b.x; b.h = Math.min(Hl, Math.ceil(b.y1) + 2) - b.y;
      if (b.w <= 0 || b.h <= 0) { b.ay = -1; continue; }
      if (y + b.h > 4 * Hl && prev) {
        prev.objs.push(...b.objs);
        const x1 = Math.max(prev.x + prev.w, b.x + b.w), y1 = Math.max(prev.y + prev.h, b.y + b.h);
        prev.x = Math.min(prev.x, b.x); prev.w = x1 - prev.x;
        const ny = Math.min(prev.y, b.y), nh = Math.min(Hl, y1) - ny;
        y += nh - prev.h; prev.y = ny; prev.h = nh;
        b.ay = -1; continue;
      }
      b.ay = prev ? prev.ay + prev.h : Hl; y = b.ay + b.h; prev = b;
    }
    const H = Math.min(4 * Hl, Math.ceil(y / Hl) * Hl);
    if (glcv.height < H) renderer.setSize(Wl, H, false);
    // El mapa de sombras (si toca), con todas las capas (three.js sólo mete las que ve la cámara) y sin dibujar nada.
    if (renderer.shadowMap.needsUpdate) {
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, 0, 0);
      cam3.layers.enableAll();
      renderer.render(scene, cam3);
    }
    draw(0, 0, 0, Wl, Hl, 2);                                    // el plano que recibe las sombras
    for (const b of list) {
      if (b.ay < 0) continue;
      for (const o of b.objs) o.traverse(m => { m.layers.enable(1); lay.add(m); });
      draw(b.ay - b.y, b.x, b.y, b.w, b.h, 1);
      for (const m of lay) m.layers.disable(1);
      lay.clear();
    }
  }

  /** Las sombras de lo 3D en el suelo (después del suelo y antes de todo lo de pie). */
  function ground(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(glcv, 0, 0, Wl, Hl, Ox, Oy, Wl * R, Hl * R);
  }

  /** Pega un lote en la pantalla (en su sitio del orden por Y). */
  function blit(ctx, b) {
    if (b.ay < 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(glcv, b.x, b.ay, b.w, b.h, b.x * R + Ox, b.y * R + Oy, b.w * R, b.h * R);
  }

  /** Suelta todo lo de la GPU (sin memoria de lienzos, game.js purgeGfx); se rehace al dibujar. */
  function free() { if (state === 'ready') dropAll(); }

  /** Para medir: chunks, filas, objetos y llamadas de dibujo del último render. */
  function stats() {
    return { built: nBuilt, passes: nPass, state, lost, chunks: chunks.size, rows: shownRows.length, props: props.size, size: [Wl, Hl],
      calls: renderer ? renderer.info.render.calls : 0, mem: renderer ? { ...renderer.info.memory } : null };
  }

  return { on, begin, ground, rows, owns, add, hits, render, blit, free, stats, get state() { return state; } };
})();
