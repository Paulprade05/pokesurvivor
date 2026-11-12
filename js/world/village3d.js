/* ============ village3d.js — la aldea del menú en WebGL (three.js) ============
 * Mezcla 2D y 3D como el juego en Ultra 3D (ultra3d.js):
 *   - el suelo y los Pokémon son 2D: el suelo, horneado con el tileset de Mundo Misterioso (tileset.js paintChunk, como un
 *     chunk del mundo) más el musgo, los caminos y la plaza; los Pokémon, sus sprites de siempre en cuadros de pie;
 *   - el bosque del borde, las chozas, la Flor del Portal y los decorados son 3D de verdad, con luz y sombras duras.
 * La cámara es la de Ultra: la homografía del suelo de G.Camera (q = 1 − a·dv) con lo alto subiendo en la pantalla, escrita
 * como matriz de proyección. Se dibuja a la escala del arte (24 px por casilla, 0,5 px por unidad de mundo) en un lienzo
 * WebGL pequeño, y village.js lo pasa a la pantalla sin suavizar: píxeles nítidos, como el resto.
 *
 * (12-11-2026) Bosque bioluminiscente (decisión del dueño): casi siempre de noche, con lo que brilla hecho con materiales
 * que se encienden solos (emisivos: no hacen falta luces de verdad, que en el iPhone cuestan), halos de color en el suelo,
 * niebla baja (dos capas que se deslizan), esporas que flotan y la tecnología de la tribu (cables, cristales, hologramas).
 * Tu choza (data/home.js) va aparte, en su grupo: se rehace sola al cambiar una pieza (setHome).
 *
 * Ejes (los de three.js): X al este, Y arriba, Z al sur (hacia la cámara). Un punto del juego (x, y) es (x, 0, y).
 *
 * Memoria (iPhone): un solo lienzo WebGL pequeño, texturas soltadas al subirlas (sus lienzos), lo quieto juntado en pocas
 * mallas (una por material), mapa de sombras de 512 en móvil y sin sombras en calidad baja. free() lo suelta todo (al
 * empezar una partida): la aldea se rehace al volver.
 */
G.Village3D = (() => {
  const V = () => G.VILLAGE;
  const TS = 48, KL = 0.5, PX = 2;
  let T = null, renderer = null, glcv = null, scene = null, cam3 = null, amb = null, sun = null;
  let built = false, lost = false, failed = '';
  let Wl = 0, Hl = 0;
  const P = new Float64Array(16);
  let anim = [];                         // cosas que se mueven: { fn(t, dt) }
  let disposables = [];                  // geometrías, materiales y texturas para free()
  let sink = null;                       // dónde van las mallas (la escena o el grupo de tu choza)
  let sprites = new Map();               // entidad -> { mesh, mat, shadow, tex: Map(img -> textura) }
  const baseTex = new Map();             // img -> textura base (las de cada entidad la comparten: una subida a la GPU)
  let uni = null;                        // uniformes compartidos (tiempo, tinte, jugador)
  let glowList = [];                     // materiales que brillan solos: { m, base, ph }
  let shadowSun = null;
  let pondTex = null, pondCol = null;
  let mailPivot = null;
  let edgeCol = '#000000';
  let home = null;                       // { group, disp, anim, key, holo, top }
  const tops = {};                       // id del sitio -> alto (mundo) de lo de encima: ahí va su nombre (village.js)

  // ---------------- arranque ----------------
  /** ¿Hay WebGL? (sin crear three.js: si no, three.js lo diría con un error en la consola) */
  function probe() {
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      const lc = gl.getExtension('WEBGL_lose_context');
      if (lc) lc.loseContext();
      return true;
    } catch (e) { return false; }
  }

  function start(THREE) {
    T = THREE;
    glcv = document.createElement('canvas');
    glcv.width = glcv.height = 16;
    glcv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
    glcv.addEventListener('webglcontextrestored', () => { lost = false; drop(true); });
    renderer = new T.WebGLRenderer({ canvas: glcv, antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: G.U.IOS ? 'default' : 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x050a12, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.BasicShadowMap;          // sombras duras: píxeles, como el arte
    renderer.shadowMap.autoUpdate = false;
    renderer.sortObjects = true;
  }

  const fx = () => (G.Settings ? G.Settings.fx : 2);
  const mobile = () => !!(G.U.IOS || (G.Settings && G.Settings.touch));

  // ---------------- texturas ----------------
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) { G.U.freeCanvas(c); throw Error('sin lienzo'); }
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  function tex(c, repeat = false, keep = false) {
    const t = new T.CanvasTexture(c);
    t.magFilter = t.minFilter = T.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    // (iPhone) El lienzo ya no hace falta al subirla: se suelta (si se pierde el contexto, se rehace todo).
    if (!keep) t.onUpdate = () => { G.U.freeCanvas(c); t.onUpdate = null; };
    disposables.push(t);
    return t;
  }
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const css = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => css(hex(h).map(v => k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  const H = (x, y, s) => G.VILLAGE.hash(x, y, s);
  /** Rampa de 4 tonos (oscuro → claro) a partir de uno. */
  const ramp = (h) => [shade(h, -0.45), shade(h, -0.22), h, shade(h, 0.3)];
  /** Pinta w×h píxeles con fn(x, y) → color (o null: transparente). */
  function pix(w, h, fn) {
    const [c, g] = canvas(w, h);
    const id = g.createImageData(w, h), d = id.data, cache = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = fn(x, y);
      if (!col) continue;
      let v = cache.get(col);
      if (!v) { v = hex(col); cache.set(col, v); }
      const o = (y * w + x) * 4;
      d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  /** Ruido de 4 tonos con grano de `k` píxeles (madera, hojas, piedra...). */
  const noisy = (w, h, tones, seed, k = 2) => pix(w, h, (x, y) => {
    const n = H(x / k | 0, y / k | 0, seed) * 0.65 + H(x, y, seed + 1) * 0.35;
    return tones[n < 0.18 ? 0 : n < 0.5 ? 1 : n < 0.84 ? 2 : 3];
  });
  /** Ruido suave (0..1) con celdas de `s` px: manchas de musgo y niebla. */
  function vn(x, y, s, seed) {
    const fx0 = x / s, fy0 = y / s, x0 = Math.floor(fx0), y0 = Math.floor(fy0), tx = fx0 - x0, ty = fy0 - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = H(x0, y0, seed), b = H(x0 + 1, y0, seed), c = H(x0, y0 + 1, seed), d = H(x0 + 1, y0 + 1, seed);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }

  const WOOD = ['#3a2418', '#52341f', '#6c4628', '#8a5e38'];
  const STONE = ['#2e3338', '#424a50', '#58626a', '#727e86'];
  const BARK = ['#1e1612', '#2c201a', '#3c2c22', '#4e3a2c'];
  const LEAF = ['#0e2a24', '#16402f', '#1f573c', '#2e7048'];
  const MOSS = ['#13281f', '#1a3428', '#22412f', '#2d5238'];
  const METAL = ['#3a4450', '#55606c', '#76828e', '#a4b0ba'];
  const GOLD = ['#8a5a12', '#c08a1e', '#e8b838', '#fff08a'];
  const CYAN = '#5ff0ff', PINK = '#ff7ad8', GREEN = '#7cff7a', AMBER = '#ffc04a', VIOLET = '#b07aff';

  // ---------------- materiales ----------------
  const mats = new Map();
  function lambert(key, make, opts = {}) {
    let m = mats.get(key);
    if (m) return m;
    const map = make ? make() : null, o = Object.assign({}, opts), flat = !!o.flat;
    delete o.flat;
    m = new T.MeshLambertMaterial(Object.assign({ map, side: T.FrontSide, shadowSide: T.DoubleSide }, o));
    if (flat) m.flatShading = true;
    mats.set(key, m);
    disposables.push(m);
    return m;
  }
  const plain = (col, opts) => lambert('c' + col + JSON.stringify(opts || {}), null, Object.assign({ color: col }, opts || {}));
  /** Material que brilla solo (setas, cristales, luces de la tribu). base: cuánto; se aviva de noche y late despacio. */
  function glowM(col, base = 1, opts = {}) {
    const key = 'g' + col + base + JSON.stringify(opts);
    let m = mats.get(key);
    if (m) return m;
    m = new T.MeshLambertMaterial(Object.assign({ color: shade(col, -0.55), emissive: new T.Color(col), emissiveIntensity: base, side: T.FrontSide }, opts));
    if (opts.flatShading) m.flatShading = true;
    mats.set(key, m);
    disposables.push(m);
    glowList.push({ m, base, ph: H(col.length, base * 10, hex(col)[0]) * 6.28 });
    return m;
  }
  /** Lo mismo con textura (lo brillante de la textura brilla: emissiveMap). */
  function glowTexM(key, make, col, base = 1, opts = {}) {
    let m = mats.get(key);
    if (m) return m;
    const t = make();
    m = new T.MeshLambertMaterial(Object.assign({ map: t, emissive: new T.Color(col), emissiveMap: t, emissiveIntensity: base, side: T.FrontSide }, opts));
    mats.set(key, m);
    disposables.push(m);
    glowList.push({ m, base, ph: H(key.length, 3, 7) * 6.28 });
    return m;
  }
  /** Sin luz: siempre del mismo color (hologramas, puertas encendidas). */
  function basic(key, make, opts = {}) {
    let m = mats.get(key);
    if (m) return m;
    m = new T.MeshBasicMaterial(Object.assign({ map: make ? make() : null }, opts));
    mats.set(key, m);
    disposables.push(m);
    return m;
  }
  const woodM = () => lambert('wood', () => tex(planks(32, 32), true));
  const stoneM = () => lambert('stone', () => tex(bricks(32, 32), true));
  const mossStoneM = () => glowTexM('mstone', () => tex(pix(32, 32, (x, y) => {
    const row = y >> 3, off = row % 2 ? 6 : 0;
    if (y % 8 === 7 || ((x + off) % 12) === 11) return '#0c1012';
    const m = vn(x, y, 6, 52);
    if (m > 0.66) return H(x, y, 53) > 0.93 ? '#7cffb0' : MOSS[m > 0.8 ? 3 : 2];
    const n = H((x + off) / 12 | 0, row, 51);
    return STONE[y % 8 === 0 ? 3 : n < 0.35 ? 1 : 2];
  }), true), '#ffffff', 0.25);
  // Corteza oscura: vetas verticales que se cortan y nudos.
  const barkM = () => lambert('bark', () => tex(pix(32, 32, (x, y) => {
    const v = H(x, (y + (H(x, 0, 6) * 32 | 0)) >> 3, 5), k = H(x >> 2, y >> 2, 7);
    if ((x * 7 + (y >> 2) * 3) % 23 === 0 && k > 0.6) return BARK[0];
    return BARK[v < 0.25 ? 0 : v < 0.6 ? 1 : v < 0.9 ? 2 : 3];
  }), true), { flat: true });
  const leafM = () => lambert('leaf', () => tex(noisy(32, 32, LEAF, 21), true), { flat: true });
  const goldM = () => lambert('gold', () => tex(noisy(8, 8, GOLD, 31, 1), true), { emissive: new T.Color(0x5a3a00) });
  const metalM = () => lambert('metal', () => tex(pix(16, 16, (x, y) => (x === 0 || y === 0) ? METAL[0] : (x === 3 && y === 3) || (x === 12 && y === 12) ? METAL[3] : METAL[H(x >> 2, y >> 2, 44) > 0.5 ? 1 : 2]), true));
  const paleM = () => lambert('pale', () => tex(pix(8, 16, (x, y) => ['#9a94a0', '#b4aebc', '#cec8d4', '#e2dce6'][(H(x, y >> 1, 33) * 4) | 0]), true));

  function planks(w, h) {
    return pix(w, h, (x, y) => {
      const row = y >> 3, off = (row * 13) % 16, seam = ((x + off) % 16) === 0;
      if (y % 8 === 7 || seam) return WOOD[0];
      const n = H(x >> 2, y, 40 + row);
      return WOOD[y % 8 === 0 ? 3 : n < 0.3 ? 1 : 2];
    });
  }
  function bricks(w, h) {
    return pix(w, h, (x, y) => {
      const row = y >> 3, off = row % 2 ? 6 : 0;
      if (y % 8 === 7 || ((x + off) % 12) === 11) return STONE[0];
      const n = H((x + off) / 12 | 0, row, 51);
      return STONE[y % 8 === 0 ? 3 : n < 0.35 ? 1 : 2];
    });
  }
  /** Escamas de hojas grandes (las vainas y techos): n columnas con su nervio oscuro, del color c. */
  function scales(n, c, hpx = 32, seed = 0) {
    const r = ramp(c), sw = 8;
    return pix(n * sw, hpx, (x, y) => {
      const lx = x % sw, row = (y / 5) | 0, off = (row % 2) * 4, sx = (x + off) % sw, sy = y % 5;
      if (lx === 0) return r[0];                                    // costilla de madera
      if (sy === 4) return r[1];
      const k = Math.abs(sx - 3.5) / 4;
      if (sy === 0 && k < 0.6) return r[3];
      return H(x >> 1, y, 61 + seed) > 0.86 ? r[1] : r[2];
    });
  }

  // ---------------- geometría: lo quieto, juntado por material ----------------
  // Cada pieza se apunta con su material y su matriz; al acabar, una malla por material (pocas llamadas de dibujo) y otra
  // con los contornos (casco invertido del tono oscuro del mapa).
  let batch = null, hulls = [];
  function put(geo, mat, at, o = {}) {
    const m = at instanceof T.Matrix4 ? at : compose(at);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (o.uv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.uv[0], uv.getY(i) * o.uv[1]); }
    // ghost: sólo su contorno (la pieza de verdad va aparte, p. ej. una pieza abierta que necesita un casco cerrado).
    if (!o.ghost) {
      const k = mat.uuid;
      if (!batch.has(k)) batch.set(k, { mat, list: [], cast: false });
      const e = batch.get(k);
      e.list.push(g);
      if (o.cast !== false) e.cast = true;
    } else g.dispose();
    if (o.hull !== false) {
      const h = (geo.index ? geo.toNonIndexed() : geo.clone());
      h.computeBoundingBox();
      const bb = h.boundingBox, c = new T.Vector3(), s = new T.Vector3();
      bb.getCenter(c); bb.getSize(s);
      const t = o.hull || 2.6;
      h.translate(-c.x, -c.y, -c.z);
      h.scale(1 + 2 * t / Math.max(4, s.x), 1 + 2 * t / Math.max(4, s.y), 1 + 2 * t / Math.max(4, s.z));
      h.translate(c.x, c.y, c.z);
      h.applyMatrix4(m);
      hulls.push(h);
    }
    geo.dispose && !geo.__keep && geo.dispose();
  }
  /** {x, y, z, rx, ry, rz, sx, sy, sz} → matriz. */
  function compose(a = {}) {
    const m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(a.rx || 0, a.ry || 0, a.rz || 0, a.order || 'XYZ'));
    m.compose(new T.Vector3(a.x || 0, a.y || 0, a.z || 0), q, new T.Vector3(a.sx || a.s || 1, a.sy || a.s || 1, a.sz || a.s || 1));
    return m;
  }
  function merge(list) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      uv.set(g.attributes.uv ? g.attributes.uv.array : new Float32Array(c * 2), o * 2);
      o += c;
      g.dispose();
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    disposables.push(g);
    return g;
  }
  function flush() {
    for (const e of batch.values()) {
      const mesh = new T.Mesh(merge(e.list), e.mat);
      mesh.castShadow = e.cast && fx() > 0; mesh.receiveShadow = true;
      fixed(mesh);
    }
    if (hulls.length) {
      const hm = new T.MeshBasicMaterial({ color: edgeCol, side: T.BackSide });
      disposables.push(hm);
      fixed(new T.Mesh(merge(hulls), hm));
    }
    batch = null; hulls = [];
  }
  function fixed(o) {
    o.matrixAutoUpdate = false; o.updateMatrix(); o.frustumCulled = false;
    o.traverse(c => { c.frustumCulled = false; });
    (sink || scene).add(o);
    return o;
  }
  /** Una malla suelta (lo que se mueve: no va en el lote). */
  function loose(geo, mat, x, y, z, order) {
    disposables.push(geo);
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.frustumCulled = false;
    if (order != null) mesh.renderOrder = order;
    (sink || scene).add(mesh);
    return mesh;
  }

  // Piezas
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, n = 8, open = false) => new T.CylinderGeometry(rt, rb, h, n, 1, open);
  const cone = (r, h, n = 8, open = false) => new T.ConeGeometry(r, h, n, 1, open);
  const ball = (r, d = 1) => new T.IcosahedronGeometry(r, d);
  const cap = (r, n = 10) => new T.SphereGeometry(r, n, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const lathe = (pts, n = 10) => new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), n);
  /** Prisma de tejado a dos aguas (largo en X): ancho w, fondo d, alto h. */
  function gable(w, d, h) {
    const g = new T.BufferGeometry(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const p = [], uv = [];
    const tri = (a, b, c, ua, ub, uc) => { p.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
    const qd = (a, b, c, d2, U) => { tri(a, b, c, [0, 0], [U, 0], [U, 1]); tri(a, c, d2, [0, 0], [U, 1], [0, 1]); };
    const U = w / 32;
    qd([x0, 0, z1], [x1, 0, z1], [x1, h, 0], [x0, h, 0], U);
    qd([x1, 0, z0], [x0, 0, z0], [x0, h, 0], [x1, h, 0], U);
    tri([x0, 0, z0], [x0, 0, z1], [x0, h, 0], [0, 0], [1, 0], [0.5, 1]);
    tri([x1, 0, z1], [x1, 0, z0], [x1, h, 0], [0, 0], [1, 0], [0.5, 1]);
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  /** Cristal: octaedro estirado (caras planas). */
  function crystal(r, h) { const g = new T.OctahedronGeometry(r, 0); g.scale(1, h / r, 1); return g; }

  // ---------------- suelo ----------------
  function paintGround() {
    const VG = V(), b = VG.build(), W = VG.W, Hh = VG.H, N = 16, A = G.Tileset.T, BI = VG.BI, seed = 777;
    const at = (tx, ty) => VG.terrainAt(tx, ty);
    const grassAt = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < Hh && !!b.grass[ty * W + tx];
    const [cv, g] = canvas(W * A, Hh * A);
    const [tc, tg] = canvas(W * A, Hh * A);
    for (let cy = 0; cy * N < Hh; cy++) for (let cx = 0; cx * N < W; cx++) {
      const c = G.Tileset.paintChunk(cx, cy, N, at, BI, seed, true, grassAt);
      if (!c) throw Error('sin suelo');
      g.drawImage(c, cx * N * A, cy * N * A);
      G.U.freeCanvas(c);
      const t = G.Tileset.top3d(cx, cy, N, at, BI, seed);
      if (t) { tg.drawImage(t, cx * N * A, cy * N * A); G.U.freeCanvas(t); }
    }
    const glow = forest(g, b, A);
    return { ground: cv, tops: tc, glow };
  }
  /**
   * Encima del suelo del tileset: musgo a manchas, caminos de tierra oscura con piedras que brillan en el borde y la
   * plaza de losas con un anillo de runas. A píxeles (ImageData: en el iPhone, un fillRect por píxel tardaba segundos).
   * → el lienzo de lo que brilla (mapa emisivo del suelo).
   */
  function forest(g, b, A) {
    const VG = V(), W = VG.W, Hh = VG.H, w = W * A, h = Hh * A;
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const [gc, gg] = canvas(w, h);
    const gimg = gg.createImageData(w, h), e = gimg.data;
    const set = (o, c) => { const v = hex(c); d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; };
    const lit = (o, c) => { const v = hex(c); e[o] = v[0]; e[o + 1] = v[1]; e[o + 2] = v[2]; e[o + 3] = 255; };
    const DIRT = ['#241a14', '#2e2118', '#3a2a1e', '#4a3626'], EDGE = '#1a120e';
    const SLATE = ['#1c2228', '#262e36', '#323c46', '#3e4a56'];
    const sample = (arr, fx, fy) => {
      const x = fx - 0.5, y = fy - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
      const v = (i, j) => (i < 0 || j < 0 || i >= W || j >= Hh) ? 0 : arr[j * W + i];
      return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
    };
    const P = VG.PLAZA, gl = [CYAN, GREEN, CYAN, PINK];
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const o = (py * w + px) * 4, fx = px / A, fy = py / A, tx = fx | 0, ty = fy | 0;
      if (VG.terrainAt(tx, ty) !== 0) continue;
      // Plaza: losas oscuras irregulares y un anillo de runas que brilla.
      const dd = Math.hypot(fx - P.x, fy - P.y);
      if (dd < P.r + (H(px >> 2, py >> 2, 91) - 0.5) * 0.18) {
        const row = Math.floor(py / 6), sx = Math.floor(px / 7 + (row % 2) * 0.5);
        const joint = (px % 7 === 0 && !(row % 2)) || (px % 7 === 3 && row % 2) || py % 6 === 0;
        const n = H(sx, row, 92);
        set(o, joint ? '#0e1216' : SLATE[n < 0.3 ? 1 : n < 0.85 ? 2 : 3]);
        const ring = Math.abs(dd - (P.r - 0.62));
        if (ring < 0.05) { set(o, '#0e1216'); }
        else if (ring < 0.13) {
          // Runas: rayas cortas con huecos, a lo largo del anillo.
          const a = Math.atan2(fy - P.y, fx - P.x), k = ((a + Math.PI) / (Math.PI * 2) * 48) % 1;
          if (k > 0.15 && k < 0.75 && H(Math.floor((a + 4) * 7.6), 0, 97) > 0.3) { set(o, '#2a6a7a'); lit(o, '#2aa8b8'); }
        }
        continue;
      }
      const p = sample(b.path, fx, fy);
      const n = H(px >> 1, py >> 1, 93);
      if (p > 0.05 && p + (n - 0.5) * 0.34 >= 0.42) {
        const v = H(px, py, 94);
        set(o, DIRT[v < 0.16 ? 0 : v < 0.6 ? 1 : v < 0.92 ? 2 : 3]);
        if (p + (n - 0.5) * 0.34 < 0.5) {
          set(o, EDGE);
          // Piedras que brillan en el borde (de dos en dos píxeles).
          if (H(px >> 1, py >> 1, 95) > 0.93) { const c = gl[(H(px >> 3, py >> 3, 96) * 4) | 0]; set(o, shade(c, -0.3)); lit(o, c); }
        }
        continue;
      }
      // Musgo a manchas (y algún punto que brilla).
      const m = vn(px, py, 12, 81) * 0.6 + vn(px, py, 4, 82) * 0.4;
      if (m > 0.3) {
        const k = H(px, py, 83);
        set(o, MOSS[m > 0.68 ? 3 : m > 0.5 ? 2 : k < 0.3 ? 0 : 1]);
        if (m > 0.62 && H(px >> 1, py >> 1, 84) > 0.985) { const c = H(px >> 2, py >> 2, 85) > 0.5 ? GREEN : CYAN; set(o, c); lit(o, shade(c, -0.25)); }
      }
    }
    g.putImageData(img, 0, 0);
    gg.putImageData(gimg, 0, 0);
    return gc;
  }

  function buildGround() {
    const VG = V(), W = VG.W, Hh = VG.H;
    const { ground, tops: topC, glow } = paintGround();
    const gt = tex(ground), et = tex(glow);
    const mat = new T.MeshLambertMaterial({ map: gt, emissive: new T.Color(0xffffff), emissiveMap: et, emissiveIntensity: 1 });
    disposables.push(mat);
    glowList.push({ m: mat, base: 1, ph: 0 });
    const geo = new T.PlaneGeometry(W * TS, Hh * TS);
    disposables.push(geo);
    const mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(W * TS / 2, 0, Hh * TS / 2);
    mesh.receiveShadow = true;
    mat.depthWrite = false;                 // lo que está de pie nunca queda tapado por el suelo (pies y sombras 2D)
    mesh.renderOrder = -10;
    fixed(mesh);
    // El bosque del borde levantado: arriba, la pieza de pared del tileset (copas de pino, top3d); delante y a los
    // lados, su cara (face3d).
    const face = G.Tileset.face3d(VG.BI);
    const topT = tex(topC), topM = new T.MeshLambertMaterial({ map: topT, side: T.FrontSide });
    disposables.push(topM);
    let faceM = null;
    if (face) {
      const fc = document.createElement('canvas');
      fc.width = face.width; fc.height = face.height;
      fc.getContext('2d').drawImage(face, 0, 0);
      faceM = new T.MeshLambertMaterial({ map: tex(fc, true) });
      disposables.push(faceM);
    }
    const HW = 46, FW = face ? face.width * PX : 96;
    const A = { pos: [], nor: [], uv: [] }, F = { pos: [], nor: [], uv: [] };
    const quad = (o, a, b2, c, d, n, uv) => {
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const p = [a, b2, c, d][k];
        o.pos.push(p[0], p[1], p[2]); o.nor.push(n[0], n[1], n[2]); o.uv.push(uv[k * 2], uv[k * 2 + 1]);
      }
    };
    const at = (tx, ty) => VG.terrainAt(tx, ty);
    for (let ty = 0; ty < Hh; ty++) for (let tx = 0; tx < W; tx++) {
      if (at(tx, ty) !== 1) continue;
      const x0 = tx * TS, x1 = x0 + TS, z0 = ty * TS, z1 = z0 + TS;
      const u0 = tx / W, u1 = (tx + 1) / W, v0 = 1 - (ty + 1) / Hh, v1 = 1 - ty / Hh;
      quad(A, [x0, HW, z1], [x1, HW, z1], [x1, HW, z0], [x0, HW, z0], [0, 1, 0], [u0, v0, u1, v0, u1, v1, u0, v1]);
      if (at(tx, ty + 1) !== 1) quad(F, [x0, 0, z1], [x1, 0, z1], [x1, HW, z1], [x0, HW, z1], [0, 0, 1], [x0 / FW, 0, x1 / FW, 0, x1 / FW, 1, x0 / FW, 1]);
      if (at(tx - 1, ty) !== 1) quad(F, [x0, 0, z0], [x0, 0, z1], [x0, HW, z1], [x0, HW, z0], [-1, 0, 0], [z0 / FW, 0, z1 / FW, 0, z1 / FW, 1, z0 / FW, 1]);
      if (at(tx + 1, ty) !== 1) quad(F, [x1, 0, z1], [x1, 0, z0], [x1, HW, z0], [x1, HW, z1], [1, 0, 0], [z1 / FW, 0, z0 / FW, 0, z0 / FW, 1, z1 / FW, 1]);
    }
    const mk = (o, m) => {
      if (!o.pos.length || !m) return;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(o.pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(o.nor, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(o.uv, 2));
      disposables.push(g);
      const mesh = new T.Mesh(g, m);
      mesh.castShadow = fx() > 0; mesh.receiveShadow = true;
      fixed(mesh);
    };
    mk(A, topM); mk(F, faceM);
  }

  // ---------------- agua: la charca (capa animada del tileset, teñida de luz) ----------------
  function buildWater() {
    const VG = V(), BI = VG.BI, A = G.Tileset.T;
    if (!G.Tileset.animated(BI)) return;
    const meta = (G.TILESETS || []).find(m => m.bi === BI);
    const frames = meta ? meta.frames : 1, dur = meta ? Math.max(0.25, meta.dur * 2) : 0.4;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let ty = 0; ty < VG.H; ty++) for (let tx = 0; tx < VG.W; tx++) if (VG.terrainAt(tx, ty) === 2) { x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); }
    if (x1 < 0) return;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const [c, g] = canvas(w * A * frames, h * A);
    const at = (tx, ty) => VG.terrainAt(tx, ty);
    for (let f = 0; f < frames; f++) for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (at(tx, ty) !== 2) continue;
      G.Tileset.drawLiquid(g, BI, at, tx, ty, f * w * A + (tx - x0) * A, (ty - y0) * A, A, (f + 0.5) * dur);
    }
    pondTex = tex(c);
    pondTex.repeat.set(1 / frames, 1);
    const m = new T.MeshBasicMaterial({ map: pondTex, transparent: true, alphaTest: 0.5, depthWrite: false });
    pondCol = m.color;
    disposables.push(m);
    const geo = new T.PlaneGeometry(w * TS, h * TS);
    disposables.push(geo);
    const mesh = new T.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + w / 2) * TS, 0.4, (y0 + h / 2) * TS);
    mesh.renderOrder = -8;
    fixed(mesh);
    anim.push({ fn: t => { pondTex.offset.x = (Math.floor(t / dur) % frames) / frames; } });
    glow(41.6 * TS, 31 * TS, 150, CYAN, 0.6);
  }

  // ---------------- modelos ----------------
  const tile = v => v * TS;

  /** Letreros: los iconos de los sitios en un atlas (una sola textura). Brillan un poco: de noche se leen. */
  let signs = null;
  function signAtlas() {
    if (signs) return signs;
    const list = V().PLACES, S = 24, [c, g] = canvas(S * list.length, S);
    list.forEach((p, i) => {
      g.fillStyle = WOOD[0]; g.fillRect(i * S, 0, S, S);
      g.fillStyle = WOOD[2]; g.fillRect(i * S + 1, 1, S - 2, S - 2);
      g.fillStyle = WOOD[3]; g.fillRect(i * S + 1, 1, S - 2, 1);
      g.fillStyle = WOOD[1]; g.fillRect(i * S + 1, S - 3, S - 2, 2);
      try { G.Icons.draw(g, p.icon, i * S + 2, 2, S - 4); } catch (e) { /* sin icono */ }
    });
    const t = tex(c, false, true);
    const m = new T.MeshLambertMaterial({ map: t, emissive: new T.Color(0xffffff), emissiveMap: t, emissiveIntensity: 0.45 });
    disposables.push(m);
    signs = { mat: m, tex: t, canvas: c, n: list.length, S };
    let tries = 0;
    const again = () => {
      // (Al acabar, el lienzo se suelta cuando se haya subido a la GPU: la aldea se monta en el título, antes de dibujarse.)
      if (!signs || tries++ > 4) { if (signs && signs.canvas) { const sg = signs; t.onUpdate = () => { if (sg.canvas) { G.U.freeCanvas(sg.canvas); sg.canvas = null; } t.onUpdate = null; }; t.needsUpdate = true; } return; }
      list.forEach((p, i) => { try { G.Icons.draw(g, p.icon, i * S + 2, 2, S - 4); } catch (e) { /* nada */ } });
      t.needsUpdate = true;
      setTimeout(again, 1200);
    };
    setTimeout(again, 600);
    return signs;
  }
  /** Un letrero con el icono del sitio i: ancho w (mundo), en (x, y, z), mirando al sur. */
  function sign(i, w, x, y, z) {
    const s = signAtlas();
    const g = new T.PlaneGeometry(w, w);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / s.n);
    put(g, s.mat, { x, y, z }, { hull: 1.6, cast: false });
    put(box(w + 4, w + 4, 4), woodM(), { x, y, z: z - 2.6 }, { hull: false });
  }
  /** Puerta encendida: un arco con la luz de dentro (sin luz: siempre se ve). */
  function doorM(col) {
    return basic('door' + col, () => tex(pix(16, 20, (x, y) => {
      const cx = 7.5, top = 3 + Math.pow(Math.abs(x - cx) / 7.5, 2) * 5;
      if (y < top - 1 || x < 1 || x > 14) return null;
      if (y < top + 0.6 || x < 2 || x > 13) return '#1a1210';
      const k = (y - top) / (20 - top);
      return k > 0.75 ? shade(col, -0.55) : k > 0.4 ? shade(col, -0.3) : shade(col, -0.1);
    })), { alphaTest: 0.5 });
  }
  /** Antena de la tribu con su luz que parpadea. */
  function antenna(x, y, z, col, h = 34) {
    put(cyl(1.4, 2, h, 5), metalM(), { x, y: y + h / 2, z }, { hull: 1 });
    put(box(10, 2, 2), metalM(), { x, y: y + h * 0.7, z }, { hull: false });
    blink(x, y + h + 3, z, col);
  }
  function blink(x, y, z, col, r = 3.4) {
    const m = new T.MeshBasicMaterial({ color: col });
    disposables.push(m);
    const mesh = loose(ball(r, 0), m, x, y, z);
    const ph = H(x | 0, z | 0, 5) * 6;
    anim.push({ fn: t => { mesh.visible = Math.sin(t * 2.4 + ph) > -0.4; } });
    return mesh;
  }

  /** Vaina de la tribu (las carpas): un capullo de hojas sobre costillas de madera, con su anillo de luz. */
  const FORMS = {
    bulb: [[0.92, 0], [1, 0.16], [1.04, 0.36], [0.96, 0.56], [0.74, 0.76], [0.44, 0.9], [0.14, 0.98], [0, 1]],
    dome: [[1, 0], [1.03, 0.22], [0.94, 0.5], [0.7, 0.78], [0.36, 0.95], [0, 1]],
    cone: [[1, 0], [0.96, 0.24], [0.74, 0.5], [0.46, 0.74], [0.18, 0.93], [0, 1]],
    wide: [[1, 0], [1.03, 0.22], [0.94, 0.5], [0.7, 0.78], [0.36, 0.95], [0, 1]]
  };
  function pod(p, i) {
    const L = p.look, R = tile(L.r), X = tile(p.x), Z = tile(p.y), sx = L.wide ? 1.32 : 1;
    const Hh = { bulb: 128, dome: 112, cone: 136, wide: 104 }[L.form] || 120;
    const prof = FORMS[L.form] || FORMS.dome, n = 10;
    const shell = lambert('pod' + i, () => tex(scales(n, L.a, 32, i), true), { flat: true });
    const g = lathe(prof.map(([r, y]) => [r * R, y * Hh]), n);
    g.rotateY(Math.PI / n);
    put(g, shell, { x: X, y: 0, z: Z, sx }, { hull: 2.4 });
    // Anillos de luz (abajo y arriba): aros finos del color de la carpa.
    const rAt = yk => { for (let k = 1; k < prof.length; k++) if (prof[k][1] >= yk) { const a = prof[k - 1], b = prof[k], u = (yk - a[1]) / (b[1] - a[1]); return (a[0] + (b[0] - a[0]) * u) * R; } return 0; };
    for (const yk of [0.3, 0.72]) {
      const tg = new T.TorusGeometry(rAt(yk) + 1.5, 2.2, 4, 20); tg.rotateX(Math.PI / 2);
      put(tg, glowM(L.glow, 1.1), { x: X, y: yk * Hh, z: Z, sx }, { hull: false, cast: false });
    }
    // Puerta encendida y su letrero.
    const zf = Z + rAt(0.2) + 1.6;
    put(new T.PlaneGeometry(40, 50), doorM(L.glow), { x: X, y: 25, z: zf }, { hull: false, cast: false });
    sign(i, 24, X, 66, Z + rAt(0.5) + 4);
    glow(X, zf + 10, 70, L.glow, 0.8);
    // Remate: la Poké Ball que brilla (gacha) o una antena.
    if (L.ball) {
      const bm = glowTexM('pball', () => tex(pix(16, 16, (x, y) => y < 7 ? (y < 2 ? '#ff9a9a' : '#e83a5a') : y < 9 ? '#101010' : (y > 13 ? '#b8b8c8' : '#f4f4f8')), true), '#ffffff', 0.35, { flatShading: true });
      put(new T.SphereGeometry(18, 10, 8), bm, { x: X, y: Hh + 14, z: Z }, { hull: 2.2 });
      put(cyl(5, 5, 3, 10), glowM('#ffffff', 0.9), { x: X, y: Hh + 14, z: Z + 17, rx: Math.PI / 2 }, { hull: 1.4 });
      sparkle(X, Hh + 20, Z, 8);
    } else antenna(X, Hh - 4, Z, L.glow);
    // Raíces que la sujetan al suelo.
    for (const s of [-1, 1]) {
      const rg = cone(7, 40, 5); rg.rotateZ(Math.PI / 2); rg.translate(20, 0, 0);
      put(rg, barkM(), compose({ x: X + s * R * sx * 0.92, y: 5, z: Z + R * 0.35, ry: s > 0 ? -0.4 : Math.PI + 0.4, rz: -0.25 }), { hull: 1.4 });
    }
    tops[p.id] = Hh + (L.ball ? 40 : 30);
  }

  /** Tienda Kecleon: mostrador de raíz, toldo de holograma y frutas que brillan. */
  function stall(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y), w = tile(p.w) - 10;
    put(box(w, 74, 10), lambert('weave', () => tex(scales(4, '#2a5a3a', 32, 9), true)), { x: X, y: 37, z: Z - 24 });
    put(box(w - 8, 34, 26), woodM(), { x: X, y: 17, z: Z + 30 });
    put(box(w - 4, 4, 30), glowM(L.glow, 0.45), { x: X, y: 36, z: Z + 30 }, { hull: 1.2 });
    for (const sx of [-1, 1]) {
      put(box(6, 116, 6), barkM(), { x: X + sx * (w / 2 - 3), y: 58, z: Z - 24 }, { hull: 1.2 });
      put(box(6, 94, 6), barkM(), { x: X + sx * (w / 2 - 3), y: 47, z: Z + 4 }, { hull: 1.2 });
    }
    // Toldo: un panel de luz (alto y corto, pegado al fondo: con la cámara desde arriba, uno largo tapaba a Kecleon).
    const holo = basic('holo' + L.glow, () => tex(pix(16, 8, (x, y) => (y === 0 || y === 7 || x % 8 === 0) ? shade(L.glow, 0.2) : (y % 2 ? shade(L.glow, -0.35) : shade(L.glow, -0.15)), true)),
      { transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    const aw = new T.Mesh(new T.PlaneGeometry(w + 16, 40), holo);
    disposables.push(aw.geometry);
    aw.position.set(X, 104, Z - 8); aw.rotation.x = -Math.PI / 2 + 0.6; aw.frustumCulled = false; aw.renderOrder = 12;
    (sink || scene).add(aw);
    anim.push({ fn: t => { holo.opacity = 0.55 + 0.15 * Math.sin(t * 3.1) * Math.sin(t * 7.7); } });
    for (const s of [-1, 0, 1]) { put(cyl(0.6, 0.6, 14, 3), metalM(), { x: X + s * 46, y: 93, z: Z + 4 }, { hull: false, cast: false }); put(ball(4, 0), glowM([CYAN, PINK, GREEN][s + 1], 1.2), { x: X + s * 46, y: 85, z: Z + 4 }, { hull: 1 }); }
    const fruit = [[PINK, -40], [CYAN, -22], [AMBER, 18], [PINK, 34], [VIOLET, 50]];
    for (const [col, dx] of fruit) put(ball(6, 1), glowM(col, 0.7, { flatShading: true }), { x: X + dx, y: 44, z: Z + 30 + (H(dx, 1, 3) - 0.5) * 10 }, { hull: 1.2 });
    put(box(22, 14, 16), woodM(), { x: X - 2, y: 45, z: Z + 28 }, { hull: 1.2 });
    sign(i, 26, X, 132, Z - 20);
    glow(X, Z + 40, 80, L.glow, 0.7);
    tops[p.id] = 146;
  }

  /** Almacén: una seta gigante con su puerta en el pie y lunares que brillan. */
  function mush(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y);
    put(cyl(40, 48, 70, 10), paleM(), { x: X, y: 35, z: Z }, { hull: 2 });
    const capM = lambert('mcap' + i, () => tex(pix(32, 16, (x, y) => { const r = ramp(L.a); return y > 13 ? r[0] : H(x >> 1, y >> 1, 71) > 0.8 ? r[3] : r[2]; }), true), { flat: true });
    put(cap(92, 12), capM, { x: X, y: 62, z: Z, sy: 0.56 }, { hull: 2.6 });
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4 + 0.3, rr = 30 + (k % 3) * 18, yy = 62 + Math.sqrt(Math.max(0, 1 - (rr / 92) ** 2)) * 92 * 0.56;
      put(ball(7 - (k % 3), 0), glowM(L.glow, 1), { x: X + Math.cos(a) * rr, y: yy, z: Z + Math.sin(a) * rr * 0.9, sy: 0.4 }, { hull: false, cast: false });
    }
    put(new T.PlaneGeometry(30, 42), doorM(AMBER), { x: X, y: 21, z: Z + 47.5 }, { hull: false, cast: false });
    put(new T.PlaneGeometry(14, 12), doorM(AMBER), { x: X + 26, y: 46, z: Z + 42 }, { hull: false, cast: false });
    put(cyl(11, 11, 26, 8), woodM(), { x: X + 62, y: 13, z: Z + 36 }, { hull: 1.4 });
    sign(i, 22, X, 56, Z + 47);
    glow(X, Z + 60, 70, AMBER, 0.6);
    tops[p.id] = 128;
  }

  /** Tótem de misiones: dos postes tallados y una pantalla de holograma con los encargos. */
  function board(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y), w = tile(p.w) - 14;
    for (const s of [-1, 1]) {
      put(box(9, 96, 9), lambert('carved', () => tex(pix(8, 32, (x, y) => (y % 8 === 0) ? WOOD[0] : (y % 8 === 3 && (x === 2 || x === 5)) ? '#101010' : WOOD[x === 0 ? 1 : 2]), true)), { x: X + s * (w / 2 - 2), y: 48, z: Z }, { hull: 1.4 });
      put(crystal(5, 12), glowM(L.glow, 1.2, { flatShading: true }), { x: X + s * (w / 2 - 2), y: 106, z: Z }, { hull: 1 });
    }
    const screen = basic('bscreen', () => tex(pix(48, 24, (x, y) => {
      const papers = [[3, 3, 10, 8], [16, 2, 11, 10], [30, 4, 9, 7], [41, 3, 5, 8], [6, 14, 12, 7], [22, 15, 10, 6], [35, 14, 10, 7]];
      for (const [px0, py0, pw, ph] of papers) if (x >= px0 && x < px0 + pw && y >= py0 && y < py0 + ph) {
        if (y === py0 || x === px0) return '#d8ffff';
        return (y - py0) % 2 === 0 && x > px0 + 1 && x < px0 + pw - 1 ? '#5ac8d8' : '#2a7a8a';
      }
      if (x === 0 || y === 0 || x === 47 || y === 23) return '#8af4ff';
      return y % 3 === 0 ? '#0c3038' : '#0a242c';
    })), { transparent: true, opacity: 0.86 });
    const sc = loose(new T.PlaneGeometry(w, 50), screen, X, 60, Z + 3, 6);
    anim.push({ fn: t => { screen.opacity = 0.8 + 0.08 * Math.sin(t * 9) * (Math.sin(t * 1.7) > 0.8 ? 1 : 0.2); sc.position.y = 60 + Math.sin(t * 1.5) * 0.8; } });
    put(gable(w + 18, 22, 14), lambert('roofb', () => tex(noisy(16, 16, ramp('#1f573c'), 72), true), { flat: true }), { x: X, y: 88, z: Z });
    sign(i, 20, X, 22, Z + 6);
    glow(X, Z + 20, 70, L.glow, 0.8);
    tops[p.id] = 124;
  }

  /** Vitrina de logros: pedestal de piedra con musgo, la copa que flota y cristales. */
  function showcase(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y);
    put(box(78, 14, 50), mossStoneM(), { x: X, y: 7, z: Z });
    put(box(62, 26, 38), mossStoneM(), { x: X, y: 27, z: Z });
    const prof = [[0, 0], [12, 0], [12, 3], [4, 6], [4, 16], [16, 24], [19, 40], [14, 40], [12, 28], [0, 26]].map(([x, y]) => new T.Vector2(x, y));
    const cup = loose(new T.LatheGeometry(prof, 10), goldM(), X, 46, Z);
    anim.push({ fn: t => { cup.position.y = 46 + Math.sin(t * 1.6) * 3; cup.rotation.y = t * 0.6; } });
    for (const s of [-1, 1]) put(crystal(6, 20), glowM(L.glow, 1, { flatShading: true }), { x: X + s * 30, y: 56, z: Z + 4, rz: s * 0.25 }, { hull: 1.2 });
    const ring = new T.TorusGeometry(26, 1.6, 4, 20); ring.rotateX(Math.PI / 2);
    put(ring, glowM(L.glow, 1.2), { x: X, y: 41, z: Z }, { hull: false, cast: false });
    sign(i, 18, X, 20, Z + 26);
    sparkle(X, 70, Z, 10);
    glow(X, Z + 10, 70, L.glow, 0.8);
    tops[p.id] = 104;
  }

  function podium(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y);
    const step = (dx, h, col, num) => {
      const D = { 1: ['.##.', '###.', '.##.', '.##.', '.##.', '####'], 2: ['###.', '...#', '.##.', '#...', '#...', '####'], 3: ['###.', '...#', '.##.', '...#', '...#', '###.'] }[num];
      const on = (x, y) => { const gx = x - 6, gy = y - 5; return gx >= 0 && gx < 4 && gy >= 0 && gy < 6 && D[gy][gx] === '#'; };
      const m = glowTexM('podn' + num, () => tex(pix(16, 16, (x, y) => on(x, y) ? '#ffffff' : null)), L.glow, 1);
      m.map = tex(pix(16, 16, (x, y) => on(x, y) ? '#ffffff' : y < 2 ? shade(col, 0.3) : (y > 13 ? shade(col, -0.25) : col)));
      put(box(50, h, 46), m, { x: X + dx, y: h / 2, z: Z });
    };
    step(0, 48, '#4a5a66', 1); step(-52, 32, '#3e4a56', 2); step(52, 22, '#343e48', 3);
    const prof = [[0, 0], [9, 0], [9, 2], [3, 5], [3, 12], [12, 17], [14, 30], [10, 30], [9, 21], [0, 19]].map(([x, y]) => new T.Vector2(x, y));
    put(new T.LatheGeometry(prof, 10), goldM(), { x: X, y: 48, z: Z }, { hull: 1.6 });
    sign(i, 18, X - 52, 46, Z + 18);
    sparkle(X, 86, Z, 8);
    glow(X, Z + 16, 80, L.glow, 0.6);
    tops[p.id] = 104;
  }

  function mailbox(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y);
    put(cyl(3, 5, 46, 5), barkM(), { x: X, y: 23, z: Z });
    put(ball(19, 1), lambert('mpod', () => tex(scales(4, '#7a5a2a', 16, 4), true), { flat: true }), { x: X, y: 58, z: Z, sx: 0.9, sz: 1.1, sy: 0.85 }, { hull: 1.8 });
    put(box(18, 3, 2), glowM(L.glow, 1.2), { x: X, y: 58, z: Z + 20 }, { hull: false, cast: false });
    const fm = new T.Mesh(new T.BoxGeometry(2.4, 18, 2.4), plain('#e8e0c8'));
    const fl = new T.Mesh(new T.BoxGeometry(10, 7, 2), glowM(AMBER, 1.3));
    fl.position.set(5, 7, 0);
    const pivot = new T.Group();
    pivot.add(fm, fl);
    fm.position.y = 9;
    pivot.position.set(X + 16, 54, Z + 6);
    disposables.push(fm.geometry, fl.geometry);
    (sink || scene).add(pivot);
    mailPivot = pivot;
    sign(i, 14, X, 30, Z + 6);
    glow(X, Z + 14, 44, L.glow, 0.6);
    tops[p.id] = 90;
  }

  /** Terminal de ajustes: un tocón con su pantalla y cables. */
  function pc(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y);
    put(cyl(28, 34, 36, 9), barkM(), { x: X, y: 18, z: Z }, { hull: 2 });
    put(cyl(28, 28, 2, 9), lambert('rings', () => tex(pix(16, 16, (x, y) => { const r = Math.hypot(x - 7.5, y - 7.5); return (r | 0) % 3 === 0 ? WOOD[1] : WOOD[3]; }))), { x: X, y: 37, z: Z }, { hull: false });
    const screen = glowTexM('pcs', () => tex(pix(20, 14, (x, y) => {
      if (x === 0 || y === 0 || x === 19 || y === 13) return '#1a2a38';
      const cx = x - 9.5, cy = y - 6.5, r = Math.hypot(cx, cy);
      if (r < 4.6 && r > 2 && (Math.atan2(cy, cx) * 8 / Math.PI | 0) % 2 === 0) return '#e8ffff';
      if (r <= 2.2 && r > 1) return '#e8ffff';
      return y % 3 === 0 ? '#2a8aa8' : '#3aa8c8';
    })), '#ffffff', 0.9);
    put(box(46, 32, 6), screen, compose({ x: X, y: 58, z: Z + 2, rx: -0.18 }), { hull: 1.6 });
    put(box(8, 22, 6), metalM(), { x: X, y: 44, z: Z - 2 }, { hull: 1 });
    for (const s of [-1, 1]) {
      const cg = new T.TorusGeometry(16, 1.4, 3, 8, Math.PI); cg.rotateY(Math.PI / 2);
      put(cg, plain('#14181c'), { x: X + s * 22, y: 4, z: Z + 18 }, { hull: false, cast: false });
    }
    sign(i, 14, X + 22, 26, Z + 26);
    glow(X, Z + 26, 56, L.glow, 0.8);
    tops[p.id] = 92;
  }

  /*
   * El monumento: la Flor del Portal (decisión del dueño). Una flor enorme, abierta hacia la cámara, con el portal que
   * gira en el centro, un aro de la tribu con sus luces, estambres que brillan y hojas grandes en el suelo.
   * (Con la cámara desde arriba lo alto sube en la pantalla lo que mide: por eso los pétalos se echan hacia atrás y la
   *  flor queda ancha y baja.)
   */
  function flower(p, i) {
    const X = tile(p.x), Z = tile(p.y), cy = 74, cz = Z + 40;
    // Hojas en el suelo y raíces.
    const bigLeaf = lambert('bleaf', () => tex(pix(16, 32, (x, y) => (x === 7 || x === 8) ? '#5aa860' : ((x + y) % 7 === 0 ? '#245a34' : '#2e7040')), true), { flat: true });
    // (Sólo a los lados: delante tapaban los escalones.)
    for (const k of [0, 1, 5, 6]) {
      const a = Math.PI * (0.05 + k / 6 * 0.9) + Math.PI, len = 80 + H(k, 3, 81) * 26;
      const lg = ball(1, 1); lg.scale(len * 0.55, 6, 26);
      put(lg, bigLeaf, { x: X + Math.cos(a) * len * 0.7, y: 6, z: Z + 10 - Math.sin(a) * len * 0.45, ry: -a }, { hull: 2 });
    }
    // Tallo grueso detrás del portal.
    put(cyl(26, 36, cy + 10, 9), lambert('stem', () => tex(noisy(16, 16, ['#123a26', '#1a4e32', '#226040', '#2e7a50'], 83), true)), { x: X, y: (cy + 10) / 2, z: Z }, { hull: 2.2 });
    // Pétalos: un anillo de óvalos alrededor del portal, abiertos y echados hacia atrás.
    const petal = glowTexM('petal', () => tex(pix(16, 32, (x, y) => {
      const c = Math.abs(x - 7.5);
      if (c < 1 && y > 4) return '#ffd0f4';                                       // nervio que brilla
      return y > 26 ? '#5a2a7a' : y > 16 ? (c > 5 ? '#8a3aa8' : '#b04ac0') : (c > 5 ? '#c45ab8' : '#e070c8');
    }), true), '#ff7ad8', 0.35, { flatShading: true });
    const NP = 11;
    for (let k = 0; k < NP; k++) {
      const a = (k / NP) * Math.PI * 2 + 0.15, len = 74 + (k % 2) * 10;
      if (Math.sin(a) < -0.6) continue;               // (los de abajo se meterían en el suelo)
      const r0 = 52, px = X + Math.cos(a) * (r0 + len * 0.42), py = cy + Math.sin(a) * (r0 + len * 0.42) * 0.82;
      // Elipsoide aplastado: largo en su eje, girado hacia fuera y echado hacia atrás.
      const g = ball(1, 1); g.scale(len * 0.32, len * 0.5, 7);
      put(g, petal, compose({ x: px, y: Math.max(8, py), z: cz - 18 - Math.max(0, Math.sin(a)) * 26, rz: a - Math.PI / 2, rx: -0.55, order: 'ZXY' }), { hull: 2.2 });
    }
    // Aro de la tribu alrededor del portal, con luces.
    const ring = new T.TorusGeometry(50, 5, 5, 24);
    put(ring, metalM(), { x: X, y: cy, z: cz }, { hull: 1.6 });
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      put(box(6, 6, 6), glowM(k % 2 ? CYAN : PINK, 1.3), { x: X + Math.cos(a) * 50, y: cy + Math.sin(a) * 50, z: cz + 4, rz: a }, { hull: 1 });
    }
    portal(X, cy, cz + 1, 46);
    // Estambres que brillan, a los lados del aro.
    for (const [dx, dy, h] of [[-66, -18, 36], [-58, 30, 30], [66, -18, 36], [58, 30, 30], [-30, 58, 26], [30, 58, 26]]) {
      put(cyl(1.2, 1.6, h, 4), plain('#d8f0c0'), compose({ x: X + dx, y: cy + dy + h / 2, z: cz + 6, rz: -dx / 200 }), { hull: false, cast: false });
      put(ball(4.5, 0), glowM('#fff27a', 1.3), { x: X + dx - dx / 200 * h, y: cy + dy + h, z: cz + 6 }, { hull: 1 });
    }
    // Escalones de piedra delante y cables hasta los pilones.
    put(box(110, 6, 24), mossStoneM(), { x: X, y: 3, z: cz + 34 }, { hull: 1.4 });
    put(box(140, 4, 22), mossStoneM(), { x: X, y: 2, z: cz + 54 }, { hull: 1.4 });
    cable([X - 50, 30, cz], [tile(19.6), 58, tile(9.2)], 24);
    cable([X + 50, 30, cz], [tile(26.4), 58, tile(9.2)], 24);
    sparkle(X, cy + 50, cz, 18, true);
    glow(X, cz + 30, 150, PINK, 1);
    glow(X, cz + 40, 90, CYAN, 0.8);
    tops[p.id] = 200;
  }

  /** El remolino del portal: un shader a píxeles (bandas que giran) en un disco. */
  function portal(X, y, z, r) {
    const m = new T.ShaderMaterial({
      uniforms: { uTime: uni.time, uGlow: uni.night },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec2 vUv; uniform float uTime; uniform float uGlow;',
        'void main(){',
        '  vec2 q = (floor(vUv * 46.0) + 0.5) / 46.0;',
        '  vec2 c = q * 2.0 - 1.0;',
        '  float r = length(c), a = atan(c.y, c.x);',
        '  if (r > 1.0) discard;',
        '  float sw = sin(a * 3.0 + r * 10.0 - uTime * 2.4);',
        '  float b = step(0.1, sw) + step(0.68, sw);',
        '  vec3 col = b < 0.5 ? vec3(0.16, 0.05, 0.3) : b < 1.5 ? vec3(0.62, 0.22, 0.78) : vec3(0.4, 0.95, 1.0);',
        '  if (r < 0.2 + 0.05 * sin(uTime * 3.0)) col = vec3(0.95, 1.0, 1.0);',
        '  if (r > 0.9) col = vec3(1.0, 0.6, 0.95);',
        '  col *= 0.85 + 0.3 * uGlow;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    const g = new T.CircleGeometry(r, 24);
    disposables.push(m);
    loose(g, m, X, y, z);
  }

  /** Cable de luz colgando de a a b ([x, alto, z] en mundo) con bombillas cada `step`. */
  function cable(a, b, step = 28) {
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(4, Math.round(L / 10)), sag = Math.min(40, L * 0.16);
    const pt = u => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag, a[2] + (b[2] - a[2]) * u];
    const dark = plain('#101418');
    for (let k = 0; k < n; k++) {
      const p0 = pt(k / n), p1 = pt((k + 1) / n), dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], len = Math.hypot(dx, dy, dz);
      const g = cyl(0.9, 0.9, len, 3);
      g.translate(0, len / 2, 0);
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx / len, dy / len, dz / len));
      put(g, dark, new T.Matrix4().compose(new T.Vector3(...p0), q, new T.Vector3(1, 1, 1)), { hull: false, cast: false });
    }
    const nb = Math.max(1, Math.round(L / step)), cols = [CYAN, PINK, GREEN, AMBER];
    for (let k = 1; k < nb; k++) { const p = pt(k / nb); put(ball(2.6, 0), glowM(cols[k % 4], 1.4), { x: p[0], y: p[1] - 3, z: p[2] }, { hull: false, cast: false }); }
  }

  // ---------------- tu choza (data/home.js) ----------------
  /*
   * Va en su propio grupo: al cambiar una pieza se suelta y se rehace (sin tocar lo demás). cfg: G.Home.current()
   * → { holo: [x, y] | null } (dónde va el holograma de tu Pokémon, que pone village.js como un sprite).
   */
  function setHome(cfg) {
    if (!built || !scene) return null;
    const key = JSON.stringify(cfg || {});
    if (home && home.key === key) return home.info;
    if (home) {
      scene.remove(home.group);
      for (const d of home.disp) { try { d.dispose(); } catch (e) { /* nada */ } }
      glowList = glowList.filter(g => !home.mats.includes(g.m));
      anim = anim.filter(a => !home.anim.includes(a));
    }
    const group = new T.Group();
    scene.add(group);
    const keepD = disposables, keepA = anim, keepB = batch, keepH = hulls, keepG = glowList.length;
    const disp = [], hAnim = [];
    disposables = disp; anim = hAnim; sink = group; batch = new Map(); hulls = [];
    let info = { holo: null };
    const homeMats = [];
    homeSpark = [];
    try {
      info = buildHome(cfg || G.Home.DEFAULT, homeMats);
      flush();
      if (homeSpark.length) particles(3, homeSpark, ['#fff6b0', '#ffffff', '#b8e0ff', '#ffb8f0'], 2, true);
    } catch (e) { console.warn('[Aldea] choza:', e); batch = null; hulls = []; }
    homeSpark = null;
    for (const g of glowList.slice(keepG)) homeMats.push(g.m);
    // Los materiales que se han hecho para la choza se sueltan con ella: fuera de las cachés (si no, quedarían muertos).
    for (const d of disp) if (d && d.isMaterial) { mats.forEach((v, k) => { if (v === d) mats.delete(k); }); glowMats.forEach((v, k) => { if (v === d) glowMats.delete(k); }); }
    disposables = keepD; anim = keepA.concat(hAnim); sink = null; batch = keepB; hulls = keepH;
    home = { group, disp, anim: hAnim, mats: homeMats, key, info };
    renderer.shadowMap.needsUpdate = true;
    return info;
  }
  /** Colores de la choza: techo según el color elegido (o el natural de cada techo); luces. */
  const ROOF_NAT = { leaf: '#2e7048', straw: '#b8904a', petal: '#d0609a', crystal: '#5ff0ff', solar: '#26345e' };
  function buildHome(c, homeMats) {
    const p = V().PLACES.find(q => q.id === 'home');
    const X = tile(p.x), Z = tile(p.y), Hm = G.Home;
    const colIt = Hm.item('color', c.color), lightIt = Hm.item('lights', c.lights);
    const roofCol = (colIt && colIt.look) || ROOF_NAT[c.roof] || ROOF_NAT.leaf;
    const rainbow = lightIt && lightIt.look === 'rainbow';
    const lc = rainbow ? CYAN : (lightIt && lightIt.look) || CYAN;
    // Las luces de la choza: un material suyo (el arcoíris cambia de color poco a poco).
    const lightM = new T.MeshLambertMaterial({ color: shade(lc, -0.5), emissive: new T.Color(lc), emissiveIntensity: 1.2 });
    disposables.push(lightM);
    glowList.push({ m: lightM, base: 1.2, ph: 1 });
    const doorMat = new T.MeshBasicMaterial({ map: doorM('#ffffff').map, alphaTest: 0.5, color: new T.Color(lc) });
    disposables.push(doorMat);
    if (rainbow) {
      const hsl = new T.Color();
      anim.push({ fn: t => { hsl.setHSL((t * 0.05) % 1, 0.85, 0.62); lightM.emissive.copy(hsl); doorMat.color.copy(hsl); } });
    }
    // Materiales del techo y de las paredes.
    const roofM = c.roof === 'crystal'
      ? glowTexM('hcrys' + roofCol, () => tex(pix(16, 16, (x, y) => { const d = (x + y * 2) % 16, e = (x * 3 - y + 32) % 11; return d === 0 || e === 0 ? '#ffffff' : (x + y) % 9 < 3 ? shade(roofCol, 0.15) : (x * y) % 7 < 2 ? shade(roofCol, -0.45) : shade(roofCol, -0.2); }), true), '#ffffff', 0.55, { flatShading: true })
      : c.roof === 'solar'
        ? glowTexM('hsolar' + roofCol + lc, () => tex(pix(16, 16, (x, y) => (x % 8 === 0 || y % 8 === 0) ? lc : (x + y) % 5 === 0 ? shade(roofCol, 0.3) : roofCol), true), lc, 0.6, { flatShading: true })
        : c.roof === 'straw'
          ? lambert('hstraw' + roofCol, () => tex(pix(16, 16, (x, y) => { const r = ramp(roofCol); return y % 4 === 3 ? r[0] : H(x, y >> 2, 31) > 0.7 ? r[3] : H(x >> 1, y, 32) > 0.4 ? r[2] : r[1]; }), true), { flat: true })
          : c.roof === 'petal'
            ? glowTexM('hpetal' + roofCol, () => tex(pix(16, 16, (x, y) => { const r = ramp(roofCol), sx = (x + ((y >> 3) % 2) * 4) % 8; return y % 8 === 7 ? r[0] : (sx === 4 && y % 8 > 1 ? '#ffffff' : (Math.abs(sx - 4) > 3 ? r[1] : r[2])); }), true), roofCol, 0.25, { flatShading: true })
            : lambert('hleaf' + roofCol, () => tex(scales(6, roofCol, 32, 7), true), { flat: true });
    const wallM = c.walls === 'roots'
      ? lambert('hroots', () => tex(pix(16, 16, (x, y) => { const k = (x + Math.round(Math.sin(y * 0.8) * 2) + 16) % 6; return k === 0 ? BARK[0] : k < 3 ? BARK[2] : BARK[3]; }), true))
      : c.walls === 'stone' ? mossStoneM()
        : c.walls === 'metal' ? metalM() : woodM();
    const S = c.shape;
    let hTop = 110, frontZ = Z + 54, doorY = 22, doorW = 32, doorH = 44, roofTop = [X, 110, Z];
    if (S === 'pod') {
      const R = 66, Hh = 124, prof = FORMS.bulb;
      const low = lathe(prof.slice(0, 3).map(([r, y]) => [r * R, y * Hh]), 10); low.rotateY(Math.PI / 10);
      put(low, wallM, { x: X, y: 0, z: Z }, { hull: 2.4 });
      const top = lathe(prof.slice(2).map(([r, y]) => [r * R, y * Hh]), 10); top.rotateY(Math.PI / 10);
      put(top, roofM, { x: X, y: 0, z: Z }, { hull: 2.4 });
      const tg = new T.TorusGeometry(R * 1.04 + 1.5, 2.4, 4, 20); tg.rotateX(Math.PI / 2);
      put(tg, lightM, { x: X, y: Hh * 0.36, z: Z }, { hull: false, cast: false });
      hTop = Hh; frontZ = Z + R * 1.0 + 1.6; roofTop = [X, Hh - 4, Z];
    } else if (S === 'mush') {
      put(cyl(40, 48, 66, 10), wallM, { x: X, y: 33, z: Z }, { hull: 2 });
      put(cap(86, 12), roofM, { x: X, y: 58, z: Z, sy: 0.6 }, { hull: 2.6 });
      for (let k = 0; k < 7; k++) { const a = k * 2.6 + 0.5, rr = 26 + (k % 3) * 16, yy = 58 + Math.sqrt(Math.max(0, 1 - (rr / 86) ** 2)) * 86 * 0.6; put(ball(6 - (k % 3), 0), lightM, { x: X + Math.cos(a) * rr, y: yy, z: Z + Math.sin(a) * rr * 0.9, sy: 0.4 }, { hull: false, cast: false }); }
      hTop = 58 + 86 * 0.6; frontZ = Z + 47.5; roofTop = [X, hTop - 2, Z];
    } else if (S === 'tree') {
      put(cyl(44, 56, 84, 10), wallM, { x: X, y: 42, z: Z }, { hull: 2.4 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.4, len = 46;
        const g = cone(12, len, 5); g.rotateZ(Math.PI / 2); g.translate(len / 2, 0, 0);
        put(g, barkM(), compose({ x: X + Math.cos(a) * 46, y: 6, z: Z + Math.sin(a) * 40, ry: -a, rz: -0.3 }), { hull: 1.8 });
      }
      for (const [dx, dy, dz, r] of [[0, 112, -6, 62], [-56, 96, 4, 42], [58, 98, 2, 44], [0, 136, -24, 46], [-26, 92, 34, 34], [30, 94, 32, 34]])
        put(ball(r, 1), roofM, { x: X + dx, y: dy, z: Z + dz, sy: 0.7 }, { hull: 2.6 });
      put(new T.PlaneGeometry(14, 12), doorMat, { x: X + 26, y: 60, z: Z + 52 }, { hull: false, cast: false });
      hTop = 160; frontZ = Z + 55; roofTop = [X, 150, Z - 10];
    } else {
      put(cyl(56, 60, 52, 10), wallM, { x: X, y: 26, z: Z }, { hull: 2.2 });
      put(cone(76, 62, 10), roofM, { x: X, y: 52 + 29, z: Z, ry: Math.PI / 10 }, { hull: 2.4 });
      const tg = new T.TorusGeometry(58, 2.2, 4, 20); tg.rotateX(Math.PI / 2);
      put(tg, lightM, { x: X, y: 50, z: Z }, { hull: false, cast: false });
      hTop = 52 + 62; frontZ = Z + 59.5; roofTop = [X, hTop - 6, Z];
    }
    put(new T.PlaneGeometry(doorW, doorH), doorMat, { x: X, y: doorY, z: frontZ }, { hull: false, cast: false });
    put(box(doorW + 8, 4, 4), lightM, { x: X, y: doorY + doorH / 2 + 2, z: frontZ + 1 }, { hull: 1 });
    sign(V().PLACES.indexOf(p), 20, X, doorY + doorH / 2 + 16, frontZ + 2);
    glow(X, frontZ + 24, 80, lc, 0.9);
    // Decoración.
    const front = frontZ + 6;
    if (c.deco === 'pots') {
      for (const s of [-1, 1]) {
        put(cyl(9, 7, 12, 8), lambert('pot', () => tex(noisy(8, 8, ['#5a3020', '#7a4428', '#94583a', '#b0704a'], 34), true)), { x: X + s * 34, y: 6, z: front + 6 }, { hull: 1.2 });
        put(cyl(1.5, 2, 10, 4), paleM(), { x: X + s * 34, y: 16, z: front + 6 }, { hull: false });
        put(cap(8, 8), lightM, { x: X + s * 34, y: 20, z: front + 6, sy: 0.7 }, { hull: 1 });
        put(cap(5, 8), glowM(s > 0 ? PINK : GREEN, 1), { x: X + s * 28, y: 13, z: front + 10, sy: 0.7 }, { hull: 1 });
      }
    } else if (c.deco === 'flags') {
      const cols = ['#e8486a', '#f4d040', '#5ff0ff', '#7cff7a', '#ff7ad8', '#ffffff'];
      const fm = cols.map(col => lambert('flag' + col, null, { color: col, side: T.DoubleSide }));
      const a = [X - 72, 66, front - 8], b = [X + 72, 66, front - 8];
      cable(a, b, 400);
      for (let k = 1; k < 9; k++) {
        const u = k / 9, px = a[0] + (b[0] - a[0]) * u, py = a[1] - Math.sin(u * Math.PI) * 23;
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute([-6, 0, 0, 6, 0, 0, 0, -12, 0], 3));
        g.computeVertexNormals();
        put(g, fm[k % fm.length], { x: px, y: py, z: front - 7 }, { hull: false, cast: false });
      }
      for (const s of [-1, 1]) put(cyl(2, 2.5, 66, 5), barkM(), { x: X + s * 72, y: 33, z: front - 8 }, { hull: 1 });
    } else if (c.deco === 'lanterns') {
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (0.1 + k * 0.2), px = X - Math.cos(a) * 92, pz = Z + Math.sin(a) * 76;
        put(cyl(0.5, 0.5, 14, 3), plain('#101418'), { x: px, y: 58, z: pz }, { hull: false, cast: false });
        put(box(7, 9, 7), lightM, { x: px, y: 47, z: pz }, { hull: 1 });
        glow(px, pz, 30, lc, 0.5);
      }
    } else if (c.deco === 'antenna') {
      antenna(roofTop[0] + 6, roofTop[1] - 6, roofTop[2], lc, 46);
      const dish = cap(12, 8); dish.rotateX(-Math.PI / 2 - 0.5);
      put(dish, metalM(), { x: roofTop[0] + 6, y: roofTop[1] + 26, z: roofTop[2] + 4 }, { hull: 1.2 });
    } else if (c.deco === 'holo') {
      put(cyl(12, 14, 5, 10), metalM(), { x: X + 78, y: 2.5, z: Z + 44 }, { hull: 1.2 });
      put(cyl(10, 10, 1, 10), lightM, { x: X + 78, y: 5.5, z: Z + 44 }, { hull: false, cast: false });
      glow(X + 78, Z + 44, 36, lc, 0.7);
    }
    // Tótem.
    if (c.totem !== 'none') {
      const tx = X - 82, tz = Z + 44;
      if (c.totem === 'crystal') {
        put(cyl(16, 20, 10, 8), mossStoneM(), { x: tx, y: 5, z: tz }, { hull: 1.4 });
        const cm = glowM(lc, 1.1, { flatShading: true });
        const cr = loose(crystal(13, 30), cm, tx, 44, tz);
        homeMats.push(cm);
        anim.push({ fn: t => { cr.rotation.y = t * 0.8; cr.position.y = 44 + Math.sin(t * 1.4) * 4; } });
        sparkle(tx, 46, tz, 8);
        glow(tx, tz, 50, lc, 0.9);
      } else {
        const face = lambert('tface', () => tex(pix(8, 8, (x, y) => (y === 2 && (x === 2 || x === 5)) || (y === 5 && x > 1 && x < 6) ? '#101010' : y === 0 ? WOOD[3] : WOOD[2]), true));
        for (let k = 0; k < 3; k++) put(box(22 - k * 2, 20, 18), face, { x: tx, y: 10 + k * 20, z: tz }, { hull: 1.4 });
        put(box(46, 6, 8), woodM(), { x: tx, y: 52, z: tz }, { hull: 1.2 });
        if (c.totem === 'holo') {
          for (let k = 0; k < 3; k++) put(box(12, 4, 2), lightM, { x: tx, y: 8 + k * 20, z: tz + 9.5 }, { hull: false, cast: false });
          const ring = new T.TorusGeometry(16, 1.4, 3, 16); ring.rotateX(Math.PI / 2);
          const rm = loose(ring, lightM, tx, 72, tz);
          anim.push({ fn: t => { rm.position.y = 72 + Math.sin(t * 2) * 3; rm.rotation.z = Math.sin(t) * 0.2; } });
          glow(tx, tz, 44, lc, 0.7);
        }
      }
    }
    // El cojín de la mascota.
    if (c.pet) put(cyl(18, 20, 5, 10), lambert('cushion', () => tex(noisy(8, 8, ['#5a2a6a', '#7a3a8a', '#9a4aa8', '#c070c8'], 35), true)), { x: tile(V().PET[0]), y: 2.5, z: tile(V().PET[1]) }, { hull: 1.2 });
    tops.home = hTop + 26;
    return { holo: c.deco === 'holo' ? [X + 78, Z + 44] : null, top: hTop + 26 };
  }

  // ---------------- decorados ----------------
  function decor(d) {
    const X = tile(d.x || 0), Z = tile(d.y || 0);
    switch (d.k) {
      case 'gtree': {
        const s = d.s || 1;
        put(cyl(10 * s, 18 * s, 64 * s, 7), barkM(), { x: X, y: 32 * s, z: Z }, { hull: 1.8 });
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + H(d.x, d.y, 1) * 3, len = 30 * s;
          const g = cone(7 * s, len, 4); g.rotateZ(Math.PI / 2); g.translate(len / 2, 0, 0);
          put(g, barkM(), compose({ x: X + Math.cos(a) * 12 * s, y: 4, z: Z + Math.sin(a) * 10 * s, ry: -a, rz: -0.3 }), { hull: 1.4 });
        }
        const tps = [[0, 84, 0, 44], [-26, 70, 8, 30], [28, 72, 6, 32], [2, 108, -6, 30]];
        for (const [dx, dy, dz, r] of tps) put(ball(r * s, 1), leafM(), { x: X + dx * s, y: dy * s, z: Z + dz * s, sy: 0.78 }, { hull: 2.4 });
        // Hongos de repisa que brillan en el tronco y una liana de luz.
        const c = [CYAN, PINK, GREEN][(H(d.x * 3, d.y * 3, 2) * 3) | 0];
        for (const [dy, a] of [[22, 0.4], [36, -0.6]]) put(cap(7 * s, 8), glowM(c, 0.9), { x: X + Math.sin(a) * 12 * s, y: dy * s, z: Z + Math.cos(a) * 12 * s, sy: 0.35 }, { hull: 1, cast: false });
        vine(X - 24 * s, 66 * s, Z + 30 * s, 34 * s, c);
        vine(X + 30 * s, 64 * s, Z + 26 * s, 26 * s, c);
        break;
      }
      case 'shroom': {
        const c = d.c || CYAN;
        for (let k = 0; k < 4; k++) {
          const s = 0.6 + H(d.x * 5, k, 3) * 0.7, dx = (H(k, d.x * 7, 4) - 0.5) * 34, dz = (H(k, d.y * 7, 5) - 0.5) * 22, h = 12 + s * 14;
          put(cyl(1.8 * s, 2.6 * s, h, 5), paleM(), { x: X + dx, y: h / 2, z: Z + dz }, { hull: false, cast: false });
          put(cap(8 * s + 3, 8), capM(c), { x: X + dx, y: h - 1, z: Z + dz, sy: 0.6 }, { hull: 1.2, cast: false });
        }
        glow(X, Z, 46, c, 0.8);
        break;
      }
      case 'bulb': {
        // Farol-flor: tallo curvo, una hoja y la flor que cuelga encendida.
        const stem = lambert('bstem', () => tex(noisy(8, 8, ['#123a26', '#1a4e32', '#226040', '#2e7a50'], 36), true));
        put(cyl(2, 3, 58, 5), stem, { x: X, y: 29, z: Z }, { hull: 1 });
        put(cyl(1.6, 2, 18, 5), stem, compose({ x: X + 6, y: 62, z: Z, rz: -1.1 }), { hull: 1 });
        put(ball(8, 1), glowM(AMBER, 1.2, { flatShading: true }), { x: X + 13, y: 58, z: Z, sy: 1.2 }, { hull: 1.4, cast: false });
        put(cap(10, 6), lambert('bpetal', null, { color: '#2e7a50', side: T.DoubleSide }), { x: X + 13, y: 64, z: Z, sy: 0.5 }, { hull: 1 });
        glow(X + 8, Z, 54, AMBER, 0.9);
        break;
      }
      case 'pylon': {
        const c = d.c || CYAN;
        put(cyl(13, 16, 12, 6), mossStoneM(), { x: X, y: 6, z: Z }, { hull: 1.6 });
        put(crystal(9, 30), glowM(c, 1.2, { flatShading: true }), { x: X, y: 42, z: Z }, { hull: 1.4, cast: false });
        for (const y of [28, 54]) { const r = new T.TorusGeometry(10, 1.6, 3, 12); r.rotateX(Math.PI / 2); put(r, metalM(), { x: X, y, z: Z }, { hull: false }); }
        glow(X, Z, 60, c, 1);
        break;
      }
      case 'spring': {
        // Manantial de la plaza: aro de piedra, agua que brilla y un cristal que flota encima.
        put(cyl(54, 58, 16, 12, true), mossStoneM(), { x: X, y: 8, z: Z }, { hull: false });
        put(cyl(54, 58, 16, 12), mossStoneM(), { x: X, y: 8, z: Z }, { hull: 2.4, ghost: true });
        const rim = new T.TorusGeometry(56, 5, 4, 14); rim.rotateX(Math.PI / 2);
        put(rim, mossStoneM(), { x: X, y: 16, z: Z }, { hull: 1.4 });
        const wm = basic('swater', () => tex(pix(32, 32, (x, y) => {
          const r = Math.hypot(x - 15.5, y - 15.5);
          return ((r * 1.4 + Math.atan2(y - 15.5, x - 15.5) * 2) | 0) % 4 === 0 ? '#8affff' : r > 14 ? '#1a6a7a' : '#2aa0b0';
        })), {});
        const w = loose(new T.CircleGeometry(52, 16), wm, X, 13, Z, -5);
        w.rotation.x = -Math.PI / 2;
        anim.push({ fn: t => { w.rotation.z = t * 0.25; } });
        const cm = glowM(CYAN, 1.3, { flatShading: true });
        const cr = loose(crystal(12, 26), cm, X, 66, Z);
        anim.push({ fn: t => { cr.rotation.y = t * 0.7; cr.position.y = 66 + Math.sin(t * 1.2) * 5; } });
        for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; put(crystal(6, 16), glowM(k ? PINK : GREEN, 1, { flatShading: true }), { x: X + Math.cos(a) * 44, y: 20, z: Z + Math.sin(a) * 38, rz: Math.cos(a) * 0.4, rx: Math.sin(a) * 0.4 }, { hull: 1.2, cast: false }); }
        spray(X, 18, Z);
        glow(X, Z, 120, CYAN, 1);
        break;
      }
      case 'log': {
        const lg = cyl(9, 9, 52, 7); lg.rotateZ(Math.PI / 2);
        put(lg, barkM(), { x: X, y: 9, z: Z }, { hull: 1.4 });
        put(box(40, 3, 10), lambert('mosstop', () => tex(noisy(8, 8, MOSS, 37), true)), { x: X, y: 18, z: Z }, { hull: false });
        put(cap(4, 6), glowM(GREEN, 1), { x: X + 18, y: 15, z: Z + 7, sy: 0.6 }, { hull: false, cast: false });
        break;
      }
      case 'pod': put(ball(13, 1), lambert('seedpod', () => tex(scales(4, '#6a4a2a', 16, 3), true), { flat: true }), { x: X, y: 13, z: Z, sy: 1.15 }, { hull: 1.6 });
        put(cyl(13.5, 13.5, 2, 10, true), glowM(GREEN, 1), { x: X, y: 13, z: Z }, { hull: false, cast: false }); break;
      case 'crate': put(box(26, 24, 26), lambert('crate', () => tex(pix(16, 16, (x, y) => (x === 0 || y === 0 || x === 15 || y === 15) ? METAL[1] : (x === y || x === 15 - y) ? WOOD[0] : WOOD[2]))), { x: X, y: 12, z: Z, ry: H(d.x * 10, d.y * 10, 3) * 0.6 });
        put(box(27, 2, 27), glowM(CYAN, 0.8), { x: X, y: 16, z: Z, ry: H(d.x * 10, d.y * 10, 3) * 0.6 }, { hull: false, cast: false }); break;
      case 'rock': put(ball(16, 0), mossStoneM(), { x: X, y: 6, z: Z, sy: 0.6, ry: H(d.x * 9, d.y * 9, 4) * 3 }, { hull: 1.6 }); break;
      case 'fern': {
        const fm = lambert('fern', () => tex(pix(8, 24, (x, y) => (x === 3 || x === 4) ? LEAF[1] : (Math.abs(x - 3.5) < 4 - y / 8 && (y % 3)) ? LEAF[(x + y) % 4 === 0 ? 3 : 2] : null), true), { alphaTest: 0.5, side: T.DoubleSide });
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2 + H(d.x, d.y, 9);
          const g = new T.PlaneGeometry(12, 40); g.translate(0, 20, 0);
          put(g, fm, compose({ x: X, y: 0, z: Z, ry: -a, rx: 0.9, order: 'YXZ' }), { hull: false, cast: false });
        }
        break;
      }
      case 'totem': {
        const c = d.c || CYAN;
        put(box(14, 64, 14), lambert('carved', () => tex(pix(8, 32, (x, y) => (y % 8 === 0) ? WOOD[0] : (y % 8 === 3 && (x === 2 || x === 5)) ? '#101010' : WOOD[x === 0 ? 1 : 2]), true)), { x: X, y: 32, z: Z }, { hull: 1.4 });
        for (let k = 0; k < 3; k++) put(box(8, 3, 1), glowM(c, 1.2), { x: X, y: 14 + k * 18, z: Z + 7.5 }, { hull: false, cast: false });
        const hm = basic('thol' + c, () => tex(pix(8, 8, (x, y) => (y % 2 === 0) ? c : shade(c, -0.4))), { transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
        const hp = loose(new T.PlaneGeometry(16, 16), hm, X, 82, Z, 12);
        anim.push({ fn: t => { hp.rotation.y = t * 1.2; hp.position.y = 82 + Math.sin(t * 2.2) * 2; hm.opacity = 0.45 + 0.2 * Math.sin(t * 6); } });
        glow(X, Z, 40, c, 0.8);
        break;
      }
      case 'well': {
        put(cyl(26, 28, 22, 10, true), mossStoneM(), { x: X, y: 11, z: Z }, { hull: false });
        put(cyl(26, 28, 22, 10), mossStoneM(), { x: X, y: 11, z: Z }, { hull: 2.2, ghost: true });
        put(cyl(22, 22, 2, 10), glowM(CYAN, 1.1), { x: X, y: 17, z: Z }, { hull: false, cast: false });
        const arch = new T.TorusGeometry(26, 4, 4, 10, Math.PI);
        put(arch, barkM(), { x: X, y: 22, z: Z }, { hull: 1.4 });
        put(crystal(4, 10), glowM(PINK, 1.2, { flatShading: true }), { x: X, y: 40, z: Z }, { hull: 1 });
        glow(X, Z, 50, CYAN, 0.8);
        break;
      }
      case 'fence': {
        const x0 = tile(d.a[0]), z0 = tile(d.a[1]), x1 = tile(d.b[0]), z1 = tile(d.b[1]), L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 30));
        for (let k = 0; k <= n; k++) {
          const px = x0 + (x1 - x0) * k / n, pz = z0 + (z1 - z0) * k / n;
          put(cyl(2.4, 3.4, 26, 5), barkM(), { x: px, y: 13, z: pz, rz: (H(k, 1, 2) - 0.5) * 0.2 }, { hull: 1 });
          if (k % 2 === 0) put(ball(2.4, 0), glowM(GREEN, 1.2), { x: px, y: 28, z: pz }, { hull: false, cast: false });
        }
        const ry = -Math.atan2(z1 - z0, x1 - x0);
        for (const y of [9, 18]) put(box(L, 3, 3), barkM(), { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, ry }, { hull: false });
        break;
      }
      case 'cable': cable([tile(d.a[0]), d.a[2], tile(d.a[1])], [tile(d.b[0]), d.b[2], tile(d.b[1])]); break;
      case 'flowers': for (let k = 0; k < 9; k++) {
        const a = H(d.x * 7, d.y * 7, k) * 6.28, rr = 8 + H(k, d.x * 3, 9) * 22, col = [CYAN, PINK, GREEN, VIOLET][k % 4];
        flowerTuft(X + Math.cos(a) * rr, Z + Math.sin(a) * rr * 0.7, col);
      } break;
      case 'reeds': for (let k = 0; k < 6; k++) reed(X + (H(k, d.x * 5, 1) - 0.5) * 40, Z + (H(k, d.y * 5, 2) - 0.5) * 20); break;
    }
  }
  /** Sombrero de seta que brilla: el centro claro, el borde más oscuro y lunares. */
  const capM = c => glowTexM('cap' + c, () => tex(pix(16, 8, (x, y) => (y < 3 && (x * 5 + y * 3) % 7 === 0) ? '#ffffff' : y < 2 ? shade(c, 0.35) : y < 5 ? c : shade(c, -0.35)), true), '#ffffff', 0.85, { flatShading: true });
  /** Liana de luz que cuelga (sin luz: brilla siempre). */
  function vine(x, y, z, len, col) {
    const m = basic('vine' + col, () => tex(pix(4, 32, (px, py) => (px === 1 || (px === 2 && py % 6 < 2)) ? ((py % 5) ? shade(col, -0.35) : col) : (px === 0 && py % 7 === 3) ? col : null)), { alphaTest: 0.5, side: T.DoubleSide });
    put(new T.PlaneGeometry(6, len), m, { x, y: y - len / 2, z }, { hull: false, cast: false });
  }

  // ---------------- cosas que se mueven ----------------
  /** Halo de luz de color en el suelo: círculo a escalones que se suma (de noche, más). */
  const glowMats = new Map();
  let glowMeshes = [];
  function glow(X, Z, r, col = AMBER, k = 1) {
    const key = col + k;
    let m = glowMats.get(key);
    if (!m) {
      const c = pix(32, 32, (x, y) => {
        const d = Math.hypot(x - 15.5, (y - 15.5) * 1.35) / 16;
        return d < 0.4 ? '#575757' : d < 0.7 ? '#333333' : d < 1 ? '#171717' : null;
      });
      m = new T.MeshBasicMaterial({ map: tex(c), color: new T.Color(col), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
      m.__k = k;
      disposables.push(m);
      glowMats.set(key, m);
    }
    const g = new T.PlaneGeometry(r * 2, r * 2);
    disposables.push(g);
    const mesh = new T.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(X, 0.6, Z);
    mesh.renderOrder = -6;
    mesh.frustumCulled = false;
    (sink || scene).add(mesh);
    glowMeshes.push(mesh);
  }

  /** Niebla baja: dos capas de nubes a píxeles que se deslizan despacio (cubren los pies: parece que caminan en ella). */
  let mistMats = [];
  function buildMist() {
    if (fx() === 0) return;
    const VG = V(), W = VG.W * TS, Hh = VG.H * TS;
    const mk = () => pix(64, 64, (x, y) => {
      const n = vn(x, y, 16, 501) * 0.6 + vn(x, y, 6, 502) * 0.4;
      // (vn no es periódico: los bordes se igualan mezclando con la otra punta)
      const n2 = vn((x + 32) % 64, (y + 32) % 64, 16, 501) * 0.6 + vn((x + 32) % 64, (y + 32) % 64, 6, 502) * 0.4;
      const k = Math.min(1, Math.min(x, 63 - x, y, 63 - y) / 12), v = n * k + n2 * (1 - k);
      return v > 0.68 ? '#7ab8c8' : v > 0.58 ? '#4a8090' : v > 0.5 ? '#2a4a58' : null;
    });
    for (const [y, op, sp, rep] of [[7, 0.16, 6, 12], [30, 0.07, -4, 8]]) {
      const t = tex(mk(), true);
      t.repeat.set(rep, rep * Hh / W);
      const m = new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: op, blending: T.AdditiveBlending });
      m.__op = op;
      disposables.push(m);
      mistMats.push(m);
      const g = new T.PlaneGeometry(W, Hh);
      disposables.push(g);
      const mesh = new T.Mesh(g, m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(W / 2, y, Hh / 2);
      mesh.renderOrder = 15;
      mesh.frustumCulled = false;
      scene.add(mesh);
      anim.push({ fn: tt => { t.offset.x = (tt * sp / 900) % 1; t.offset.y = (tt * sp / 2600) % 1; } });
    }
  }

  // Partículas: un solo shader (modos: esporas que flotan, esporas que caen, humo, chispas, salpicaduras).
  const PV = [
    'attribute float aSeed; attribute vec3 aCol; uniform float uTime; uniform float uMode; uniform float uSize; uniform float uAlpha;',
    'varying float vA; varying vec3 vC;',
    'void main(){',
    '  vec3 p = position; float s = aSeed; vC = aCol;',
    '  if (uMode < 0.5) {',
    '    p.x += sin(uTime * 0.6 + s * 6.28) * 40.0 + sin(uTime * 1.7 + s * 17.0) * 8.0;',
    '    p.z += cos(uTime * 0.45 + s * 12.0) * 26.0; p.y += 14.0 + sin(uTime * 1.1 + s * 3.0) * 10.0 + s * 40.0;',
    '    vA = smoothstep(0.3, 1.0, sin(uTime * 2.2 + s * 40.0) * 0.5 + 0.5);',
    '  } else if (uMode < 1.5) {',
    '    float c = fract(uTime * 0.035 + s);',
    '    p.y = 160.0 * (1.0 - c); p.x += sin(uTime * 1.3 + s * 20.0) * 18.0 + c * 50.0; p.z += c * 30.0;',
    '    vA = min(1.0, (1.0 - c) * 5.0) * min(1.0, c * 10.0);',
    '  } else if (uMode < 2.5) {',
    '    float c = fract(uTime * 0.16 + s);',
    '    p.y += c * 110.0; p.x += sin(uTime * 0.9 + s * 9.0) * 6.0 + c * 26.0;',
    '    vA = (1.0 - c) * 0.75;',
    '  } else if (uMode < 3.5) {',
    '    float c = fract(uTime * 0.22 + s);',
    '    p.y += c * 40.0 + sin(s * 31.0) * 10.0; p.x += sin(s * 50.0 + uTime) * 18.0; p.z += cos(s * 70.0) * 12.0;',
    '    vA = sin(c * 3.1416) * step(0.5, fract(uTime * 3.0 + s * 7.0));',
    '  } else {',
    '    float c = fract(uTime * 0.5 + s);',
    '    float a = s * 6.2832;',
    '    p.x += cos(a) * c * 26.0; p.z += sin(a) * c * 20.0; p.y += c * (1.0 - c) * 120.0;',
    '    vA = 1.0 - c;',
    '  }',
    '  vA *= uAlpha;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '  gl_PointSize = uSize;',
    '}'].join('\n');
  const PF = 'varying float vA; varying vec3 vC; void main(){ if (vA < 0.06) discard; gl_FragColor = vec4(vC, vA);\n#include <colorspace_fragment>\n}';
  function particles(mode, pts, cols, size, add, alphaU) {
    const n = pts.length, pos = new Float32Array(n * 3), seed = new Float32Array(n), col = new Float32Array(n * 3);
    pts.forEach((p, i) => {
      pos.set(p, i * 3); seed[i] = H(i, mode, 99 + n);
      const c = new T.Color(cols[i % cols.length]);
      col.set([c.r, c.g, c.b], i * 3);
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
    g.setAttribute('aCol', new T.BufferAttribute(col, 3));
    const m = new T.ShaderMaterial({ uniforms: { uTime: uni.time, uMode: { value: mode }, uSize: { value: size }, uAlpha: alphaU || { value: 1 } },
      vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: add ? T.AdditiveBlending : T.NormalBlending });
    disposables.push(g, m);
    const o = new T.Points(g, m);
    o.frustumCulled = false;
    o.renderOrder = 20;
    (sink || scene).add(o);
    return o;
  }
  const sparkQ = [], sprayQ = [];
  let homeSpark = null;
  function sparkle(x, y, z, n, big) { const q = sink && homeSpark ? homeSpark : sparkQ; for (let k = 0; k < n; k++) q.push([x + (H(k, x, 1) - 0.5) * (big ? 180 : 50), y + (H(k, y, 2) - 0.5) * (big ? 120 : 30), z + (H(k, z, 3) - 0.5) * (big ? 60 : 20)]); }
  function spray(x, y, z) { sprayQ.push([x, y, z]); }

  /** Matas de hierba que se mecen (y se apartan al pasar tu Pokémon) y flores que brillan: un shader con todas. */
  const tufts = [];
  function flowerTuft(x, z, col) { tufts.push([x, z, 3, col]); }
  function reed(x, z) { tufts.push([x, z, 4, null]); }
  function buildTufts() {
    const VG = V(), b = VG.build(), pal = G.Tileset.pal(VG.BI);
    const GR = pal ? pal.grass : ['#14362c', '#1c4b3e', '#245e4d', '#3e7163'];
    const dens = fx() === 0 ? 0.25 : fx() === 1 ? 0.55 : 1;
    for (let ty = 0; ty < VG.H; ty++) for (let tx = 0; tx < VG.W; tx++) {
      if (!b.grass[ty * VG.W + tx]) continue;
      for (let k = 0; k < 3; k++) if (H(tx, ty, 300 + k) < dens * 0.9) {
        const kind = H(tx, ty, 340 + k) > 0.9 ? 3 : (H(tx, ty, 330 + k) * 3) | 0;
        tufts.push([(tx + 0.15 + H(tx, ty, 310 + k) * 0.7) * TS, (ty + 0.2 + H(tx, ty, 320 + k) * 0.7) * TS, kind, kind === 3 ? [CYAN, GREEN, PINK][(H(tx, ty, 350 + k) * 3) | 0] : null]);
      }
    }
    if (!tufts.length) return;
    const [c, g] = canvas(60, 14);
    const drawTuft = (o, kind) => {
      const blades = kind === 0 ? [[2, 9], [5, 13], [8, 11], [10, 8]] : kind === 1 ? [[3, 12], [6, 10], [9, 13]] : [[1, 8], [4, 11], [6, 13], [9, 10], [11, 7]];
      for (const [bx, bh] of blades) for (let y = 0; y < bh; y++) {
        const lean = Math.round((y / bh) * (bx < 6 ? -1.6 : 1.6));
        g.fillStyle = y > bh - 3 ? GR[3] : y > bh / 2 ? GR[2] : GR[1];
        g.fillRect(o + bx + lean, 13 - y, 1, 1);
      }
      g.fillStyle = GR[0]; g.fillRect(o + 2, 13, 9, 1);
    };
    drawTuft(0, 0); drawTuft(12, 1); drawTuft(24, 2);
    // flor (tallo y una cabeza blanca que se tiñe con el color de cada una: esa brilla)
    g.fillStyle = GR[1]; g.fillRect(36 + 6, 6, 1, 8); g.fillStyle = GR[2]; g.fillRect(36 + 4, 10, 2, 1); g.fillRect(36 + 7, 9, 2, 1);
    g.fillStyle = '#ffffff'; for (const [dx, dy] of [[5, 3], [7, 3], [4, 4], [6, 4], [8, 4], [5, 5], [7, 5], [6, 2]]) g.fillRect(36 + dx, dy, 1, 1);
    for (const [bx, bh] of [[3, 13], [6, 11], [9, 12]]) { g.fillStyle = '#2a4a3a'; g.fillRect(48 + bx, 14 - bh, 1, bh); g.fillStyle = '#5a3a2a'; g.fillRect(48 + bx, 14 - bh, 1, 3); }
    const t = tex(c);
    const n = tufts.length, pos = new Float32Array(n * 18), base = new Float32Array(n * 12), uv = new Float32Array(n * 12), col = new Float32Array(n * 18);
    const w = 24, hgt = 28;
    tufts.forEach(([x, z, kind, cc], i) => {
      const C = new T.Color(cc || '#ffffff');
      const corners = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
      corners.forEach(([cx, cy], k) => {
        const o = i * 6 + k;
        pos.set([x + cx * w / 2, cy * hgt, z], o * 3);
        base.set([x, z], o * 2);
        uv.set([(kind * 12 + (cx < 0 ? 0 : 12)) / 60, cy], o * 2);
        col.set([C.r, C.g, C.b], o * 3);
      });
    });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aBase', new T.BufferAttribute(base, 2));
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geo.setAttribute('aCol', new T.BufferAttribute(col, 3));
    const m = new T.ShaderMaterial({
      uniforms: { uTime: uni.time, uMap: { value: t }, uTint: uni.tint, uPlayer: uni.player },
      vertexShader: [
        'attribute vec2 aBase; attribute vec3 aCol; uniform float uTime; uniform vec3 uPlayer; varying vec2 vUv; varying vec3 vC;',
        'void main(){ vUv = uv; vC = aCol; vec3 p = position; float k = uv.y;',
        '  p.x += sin(uTime * 2.1 + aBase.x * 0.031 + aBase.y * 0.017) * 2.6 * k + sin(uTime * 0.7 + aBase.x * 0.01) * 1.6 * k;',
        '  vec2 d = aBase - uPlayer.xz; float L = length(d);',
        '  if (L < 46.0 && L > 0.1) { float f = (46.0 - L) / 46.0; p.x += d.x / L * f * 9.0 * k; p.y -= f * 6.0 * k; }',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }'].join('\n'),
      // Lo blanco de la textura (cabezas de las flores) toma su color y brilla (sin el tinte de la noche).
      fragmentShader: 'uniform sampler2D uMap; uniform vec3 uTint; varying vec2 vUv; varying vec3 vC; void main(){ vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard; vec3 col = c.rgb * uTint; if (c.r > 0.95 && c.g > 0.95 && c.b > 0.95) col = vC; gl_FragColor = vec4(col, 1.0);\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: true
    });
    disposables.push(geo, m);
    const mesh = new T.Mesh(geo, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
  }

  // ---------------- construir ----------------
  /** Construye la escena (una vez). → '' si va bien; si no, el motivo (y la aldea no se usa). */
  function build() {
    if (built) return '';
    if (!renderer) return 'sin WebGL';
    try {
      scene = new T.Scene();
      cam3 = new T.Camera();
      cam3.matrixAutoUpdate = false;
      const pal = G.Tileset.pal(V().BI);
      edgeCol = pal ? pal.edge : '#000000';
      uni = { time: { value: 0 }, night: { value: 1 }, tint: { value: new T.Vector3(1, 1, 1) }, tintCol: new T.Color(1, 1, 1), player: { value: new T.Vector3() } };
      amb = new T.AmbientLight(0xffffff, 0.6 * Math.PI);
      sun = new T.DirectionalLight(0xffffff, 0.3 * Math.PI);
      sun.castShadow = fx() > 0;
      const ms = mobile() ? 512 : 1024;
      sun.shadow.mapSize.set(ms, ms);
      sun.shadow.bias = -0.002;
      const sc = sun.shadow.camera, half = Math.max(V().W, V().H) * TS * 0.62;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 10; sc.far = 6000;
      sc.updateProjectionMatrix();
      sun.target.position.set(V().W * TS / 2, 0, V().H * TS / 2);
      scene.add(amb, sun, sun.target);
      batch = new Map();
      buildGround();
      buildWater();
      V().PLACES.forEach((p, i) => {
        const k = p.look.kind;
        if (k === 'pod') pod(p, i); else if (k === 'stall') stall(p, i); else if (k === 'mush') mush(p, i);
        else if (k === 'board') board(p, i); else if (k === 'case') showcase(p, i); else if (k === 'podium') podium(p, i);
        else if (k === 'mailbox') mailbox(p, i); else if (k === 'pc') pc(p, i); else if (k === 'flower') flower(p, i);
      });
      for (const d of V().DECOR) decor(d);
      flush();
      buildTufts();
      buildMist();
      // Partículas: esporas que flotan (siempre) y que caen, chispas y el manantial.
      const VG = V(), f = fx();
      const nFly = f === 0 ? 14 : f === 1 ? 24 : 36, nPet = f === 0 ? 6 : f === 1 ? 12 : 18;
      const spots = (n, s) => Array.from({ length: n }, (_, i) => [(3 + H(i, s, 1) * (VG.W - 6)) * TS, 0, (3 + H(i, s, 2) * (VG.H - 6)) * TS]);
      uni.flyA = { value: 1 }; uni.petA = { value: 0.7 };
      particles(0, spots(nFly, 1), [CYAN, GREEN, '#d8ff70', PINK], 2, true, uni.flyA);
      particles(1, spots(nPet, 2), ['#8affff', '#c0ffd0', '#ffc0f0'], 2, true, uni.petA);
      if (sparkQ.length) particles(3, sparkQ, ['#fff6b0', '#ffffff', '#b8e0ff', '#ffb8f0'], 2, true);
      if (sprayQ.length) particles(4, sprayQ.flatMap(p => Array.from({ length: f === 0 ? 8 : 18 }, () => p)), ['#8affff', '#ffffff', '#5ff0ff'], 2, true);
      sparkQ.length = sprayQ.length = 0;
      built = true;
      shadowSun = null;
      setHome(G.Home ? G.Home.current() : null);
      return '';
    } catch (e) {
      console.warn('[Aldea] no se pudo construir:', e);
      failed = String(e && e.message || e);
      drop(false);
      return failed || 'error';
    }
  }

  // ---------------- sprites (Pokémon) ----------------
  const shadowMats = new Map();
  let planeGeo = null;
  function shadowMat(R) {
    let m = shadowMats.get(R);
    if (m) return m;
    const h = Math.max(1, Math.round(R * 0.42));
    const c = pix(R * 2, h * 2, (x, y) => {
      const w = Math.round(Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.5 - h) / h, 2))) * R);
      return x >= R - w && x < R + w ? '#000000' : null;
    });
    m = new T.MeshBasicMaterial({ map: tex(c), transparent: true, opacity: 0.4, depthWrite: false });
    disposables.push(m);
    shadowMats.set(R, m);
    return m;
  }
  function baseOf(img) {
    let t = baseTex.get(img);
    if (!t) {
      t = new T.Texture(img);
      t.magFilter = t.minFilter = T.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = T.SRGBColorSpace;
      t.needsUpdate = true;
      baseTex.set(img, t);
    }
    return t;
  }
  /** Pone (o actualiza) el sprite de una entidad: { anim (G.Sprites.Animator), x, y, z?, hide?, holo? }. */
  function sprite(e) {
    if (!built) return;
    let s = sprites.get(e);
    if (!s) {
      if (!planeGeo) { planeGeo = new T.PlaneGeometry(1, 1); planeGeo.__keep = true; }
      const mat = new T.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, depthWrite: true });
      if (e.holo) { mat.depthWrite = false; mat.blending = T.AdditiveBlending; mat.alphaTest = 0.3; }
      const mesh = new T.Mesh(planeGeo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = e.holo ? 13 : 5;
      const meta = G.Sprites.meta(e.anim.dex), R = Math.round([5, 8, 12][Math.max(0, Math.min(2, meta ? meta.s : 1))] * e.anim.scale);
      const shadow = new T.Mesh(planeGeo, shadowMat(R));
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(R * 2 * PX, Math.max(1, Math.round(R * 0.42)) * 2 * PX, 1);
      shadow.frustumCulled = false; shadow.renderOrder = 1;
      scene.add(mesh, shadow);
      s = { mesh, mat, shadow, tex: new Map(), R };
      sprites.set(e, s);
    }
    const a = e.anim;
    let m = G.Sprites.animMeta(a.dex, a.cur, a.shiny), sh = G.Sprites.sheet(a.dex, a.cur, a.shiny);
    if (sh && !sh.ready) {
      const idle = G.Sprites.sheet(a.dex, 'Idle', a.shiny);
      if (idle && idle.ready) { sh = idle; m = G.Sprites.animMeta(a.dex, 'Idle', a.shiny); }
    }
    const own = sh === G.Sprites.sheet(a.dex, a.cur, a.shiny);
    const ok = !e.hide && m && sh && sh.ready && sh.img.width;
    s.mesh.visible = !!ok;
    s.shadow.visible = !!ok && !e.noShadow && !e.holo;
    if (!ok) return;
    let t = s.tex.get(sh.img);
    if (!t) { t = baseOf(sh.img).clone(); s.tex.set(sh.img, t); }
    if (s.mat.map !== t) { s.mat.map = t; s.mat.needsUpdate = true; }
    const frame = own ? Math.min(a.frame, m.n - 1) : 0, row = Math.min(a.dir, m.r - 1);
    const sx = (m.x || 0) + frame * m.w, sy = (m.y || 0) + row * m.h, W = sh.img.width, Hh = sh.img.height;
    t.repeat.set(m.w / W, m.h / Hh);
    t.offset.set(sx / W, 1 - (sy + m.h) / Hh);
    const k = PX * a.scale;
    const left = Math.round((e.x - m.ax * k) / PX) * PX, top = Math.round((m.ay * k + (e.z || 0)) / PX) * PX;
    s.mesh.scale.set(m.w * k, m.h * k, 1);
    s.mesh.position.set(left + m.w * k / 2, top - m.h * k / 2, e.y + 1);
    const sh2 = Math.max(1, Math.round(s.R * 0.42)) * 2 * PX;
    s.shadow.position.set(Math.round((e.x) / PX) * PX, 0.8, Math.round(e.y / PX) * PX - sh2 / 2 + PX);
    if (e.holo) { const fl = 0.75 + 0.25 * Math.sin(uni.time.value * 11) * Math.sin(uni.time.value * 3.3); s.mat.color.setRGB(0.25 * fl, 0.95 * fl, 1.1 * fl); return; }
    // De noche los Pokémon se tiñen algo (sin perderse: la mitad del tinte del suelo).
    const tc = uni.tintCol, f = e.flash ? 1.6 : 1;
    s.mat.color.setRGB(f * (0.45 + tc.r * 0.55), f * (0.45 + tc.g * 0.55), f * (0.45 + tc.b * 0.55));
  }
  function unsprite(e) {
    const s = sprites.get(e);
    if (!s) return;
    if (scene) scene.remove(s.mesh, s.shadow);
    s.mat.dispose();
    for (const t of s.tex.values()) t.dispose();
    sprites.delete(e);
  }

  // ---------------- luz ----------------
  /*
   * Ciclo corto (decisión del dueño), casi siempre de noche: l = { amb: [r,g,b], ai, sun: [r,g,b], si, az, el, night
   * (0..1: cuánto brilla lo que brilla), dusk, mist }.
   */
  function setLight(l, t) {
    amb.color.setRGB(...l.amb); amb.intensity = l.ai * Math.PI;
    sun.color.setRGB(...l.sun); sun.intensity = l.si * Math.PI;
    const ce = Math.cos(l.el), dir = [Math.cos(l.az) * ce, Math.sin(l.el), Math.sin(l.az) * ce];
    const c = sun.target.position;
    sun.position.set(c.x + dir[0] * 2000, dir[1] * 2000, c.z + dir[2] * 2000);
    const k = Math.max(0, dir[1]);
    const tr = l.amb[0] * l.ai + l.sun[0] * l.si * k, tg = l.amb[1] * l.ai + l.sun[1] * l.si * k, tb = l.amb[2] * l.ai + l.sun[2] * l.si * k;
    uni.tint.value.set(tr, tg, tb);
    uni.tintCol.setRGB(tr, tg, tb);
    uni.night.value = l.night;
    if (pondCol) pondCol.setRGB(Math.min(1.4, tr * 0.8 + 0.12), Math.min(1.4, tg * 1.1 + 0.2), Math.min(1.4, tb * 1.2 + 0.26));
    const gk = 0.55 + 0.6 * l.night;
    for (const g of glowList) g.m.emissiveIntensity = g.base * gk * (1 + 0.1 * Math.sin(t * 1.3 + g.ph));
    for (const m of glowMats.values()) m.opacity = Math.min(1, (0.45 + l.night * 0.75) * m.__k);
    for (const m of mistMats) m.opacity = m.__op * (l.mist == null ? 1 : l.mist);
    uni.flyA.value = 0.55 + l.night * 0.45;
    uni.petA.value = 0.5 + l.night * 0.3;
    const key = Math.round(l.az * 40) + ',' + Math.round(l.el * 40);
    if (key !== shadowSun) { shadowSun = key; renderer.shadowMap.needsUpdate = true; }
  }

  // ---------------- dibujo ----------------
  /**
   * Dibuja la aldea. view: { cx, cy (centro de la cámara), w, h (lo que se ve, en mundo), scale (px CSS por unidad), K (perspectiva) }.
   * → { cv, Wl, Hl, ox, oy, k } (el lienzo, su tamaño, dónde va en la pantalla en px CSS y px CSS por px del lienzo) o null.
   */
  function render(view, t, dt, light) {
    if (!built || lost) return null;
    const wl = Math.min(1400, Math.ceil(view.w * KL) + 4), hl = Math.min(1000, Math.ceil(view.h * KL) + 4);
    if (wl !== Wl || hl !== Hl) { Wl = wl; Hl = hl; renderer.setSize(Wl, Hl, false); }
    const hw = view.w / 2, hh = view.h / 2, a = view.K / hh, b = a;
    const cxs = Math.round(view.cx * KL) / KL, czs = Math.round(view.cy * KL) / KL;
    const Cx = Math.round(Wl / 2), Cy = Math.round(Hl / 2);
    const R = view.scale / KL;
    const ox = (cxs - view.cx + hw) * view.scale - Cx * R, oy = (czs - view.cy + hh) * view.scale - Cy * R;
    // En (X, Y, Z): w = 1 − a·(Z − cz) − b·Y; x de pantalla ∝ (X − cx)/w; y ∝ (Z − cz − Y)/w (lo alto sube).
    const w = [0, -b, -a, 1 + a * czs];
    const xr = [2 * KL / Wl, 0, 0, -2 * KL * cxs / Wl].map((v, i) => v + (2 * Cx / Wl - 1) * w[i]);
    const yr = [0, 2 * KL / Hl, -2 * KL / Hl, 2 * KL * czs / Hl].map((v, i) => v + (1 - 2 * Cy / Hl) * w[i]);
    const A = 1.2727, B = 0.6818;
    const zr = w.map((v, i) => A * v + (i === 3 ? -B : 0));
    P.set([...xr, ...yr, ...zr, ...w]);
    cam3.projectionMatrix.set(...P);
    cam3.projectionMatrixInverse.copy(cam3.projectionMatrix).invert();
    view.proj = { cxs, czs, Cx, Cy, a, b, R, ox, oy };
    uni.time.value = t;
    if (view.player) uni.player.value.set(view.player.x, 0, view.player.y);
    setLight(light, t);
    for (const o of anim) o.fn(t, dt);
    if (mailPivot) mailPivot.rotation.z = view.mail ? 0 : -Math.PI / 2;
    try { renderer.render(scene, cam3); } catch (e) { console.warn('[Aldea] fallo al dibujar:', e); return null; }
    return { cv: glcv, Wl, Hl, ox, oy, k: R };
  }

  /** Punto del mundo (x, y del suelo; z de alto) → px CSS de la pantalla (con la cámara del último render). */
  function toScreen(view, x, y, z = 0) {
    const p = view.proj;
    if (!p) return { x: 0, y: 0 };
    const w = 1 - p.a * (y - p.czs) - p.b * z;
    return { x: p.ox + (p.Cx + KL * (x - p.cxs) / w) * p.R, y: p.oy + (p.Cy + KL * (y - p.czs - z) / w) * p.R };
  }
  /** px CSS de la pantalla → punto del suelo. */
  function toWorld(view, sx, sy) {
    const p = view.proj;
    if (!p) return { x: 0, y: 0 };
    const u = ((sx - p.ox) / p.R - p.Cx) / KL, v = ((sy - p.oy) / p.R - p.Cy) / KL;
    const dv = v / (1 + p.a * v);
    return { x: p.cxs + u * (1 - p.a * dv), y: p.czs + dv };
  }

  // ---------------- soltar ----------------
  /** Lo suelta todo (al empezar una partida, sin memoria o al perder el contexto). gpuGone: el contexto ya no existe. */
  function drop(gpuGone) {
    for (const e of [...sprites.keys()]) { try { unsprite(e); } catch (er) { /* nada */ } }
    sprites = new Map();
    const all = disposables.concat(home ? home.disp : []);
    if (!gpuGone) {
      for (const d of all) { try { d.dispose(); } catch (e) { /* nada */ } }
      for (const t of baseTex.values()) { try { t.dispose(); } catch (e) { /* nada */ } }
    }
    disposables = []; baseTex.clear(); mats.clear(); shadowMats.clear(); glowMats.clear();
    anim = []; glowList = []; glowMeshes = []; mistMats = []; tufts.length = 0; home = null; homeSpark = null;
    if (signs && signs.canvas) G.U.freeCanvas(signs.canvas);
    signs = null; pondTex = null; pondCol = null; mailPivot = null; planeGeo = null; batch = null; hulls = []; sink = null;
    scene = null; built = false; shadowSun = null;
  }
  function free() {
    drop(false);
    if (renderer) {
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* nada */ }
      renderer = null;
    }
    if (glcv) { G.U.freeCanvas(glcv); glcv = null; }
    Wl = Hl = 0;
  }

  return { probe, start, build, render, sprite, unsprite, toScreen, toWorld, free, setHome,
    /** Alto (mundo) de lo de encima de un sitio (su nombre va ahí). */
    top: id => tops[id] || 0,
    get ready() { return built && !lost; }, get lost() { return lost; }, get started() { return !!renderer; }, get failed() { return failed; },
    /** Para depurar (sólo con ?dev): la escena. */
    get scene() { return /[?&]dev\b/.test(location.search) ? scene : null; },
    /** Para pruebas: cuántas mallas y llamadas de dibujo. */
    stats() { return renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures, W: Wl, H: Hl } : null; } };
})();
