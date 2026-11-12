/* ============ village3d.js — la aldea del menú en WebGL (three.js) ============
 * Mezcla 2D y 3D como el juego en Ultra 3D (ultra3d.js):
 *   - el suelo y los Pokémon son 2D: el suelo, horneado con el tileset de Mundo Misterioso (tileset.js paintChunk, como un
 *     chunk del mundo) más los caminos y la plaza; los Pokémon, sus sprites de siempre en cuadros de pie (un trozo de su hoja);
 *   - setos, carpas, el árbol del portal y los decorados son 3D de verdad, con geometría propia, luz y sombras duras.
 * La cámara es la de Ultra: la homografía del suelo de G.Camera (q = 1 − a·dv) con lo alto subiendo en la pantalla, escrita
 * como matriz de proyección. Se dibuja a la escala del arte (24 px por casilla, 0,5 px por unidad de mundo) en un lienzo
 * WebGL pequeño, y village.js lo pasa a la pantalla sin suavizar: píxeles nítidos, como el resto.
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
  const anim = [];                       // cosas que se mueven: { fn(t, dt) }
  const disposables = [];                // geometrías, materiales y texturas para free()
  let sprites = new Map();               // entidad -> { mesh, mat, shadow, tex: Map(img -> textura) }
  const baseTex = new Map();             // img -> textura base (las de cada entidad la comparten: una subida a la GPU)
  let uni = null;                        // uniformes compartidos (tiempo, tinte, jugador)
  let lights = null;                     // materiales que se encienden de noche
  let shadowSun = null, shadowAt = -1;
  let pondTex = null, pondFrames = 1, fountainTex = null;
  let flags = [];
  let edgeCol = '#104743';

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
    renderer.setClearColor(0x16301c, 1);
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
  const ramp = (h) => [shade(h, -0.42), shade(h, -0.2), h, shade(h, 0.28)];
  /** Pinta w×h píxeles con fn(x, y) → color (o null: transparente). */
  function pix(w, h, fn) {
    const [c, g] = canvas(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = fn(x, y);
      if (!col) continue;
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  /** Ruido de 4 tonos con grano de `k` píxeles (madera, hojas, piedra...). */
  const noisy = (w, h, tones, seed, k = 2) => pix(w, h, (x, y) => {
    const n = H(x / k | 0, y / k | 0, seed) * 0.65 + H(x, y, seed + 1) * 0.35;
    return tones[n < 0.18 ? 0 : n < 0.5 ? 1 : n < 0.84 ? 2 : 3];
  });

  const WOOD = ['#4e321c', '#6c4628', '#8c5e36', '#ad7c4a'];
  const STONE = ['#5f5c56', '#7f7b72', '#a19c8e', '#c4bea9'];
  const BARK = ['#3e2818', '#573922', '#71492c', '#8c5e3a'];
  const LEAF = ['#24552c', '#357a36', '#4f9c40', '#7cc458'];
  const GOLD = ['#8a5a12', '#c08a1e', '#e8b838', '#fff08a'];

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
  const woodM = () => lambert('wood', () => tex(planks(32, 32), true));
  const stoneM = () => lambert('stone', () => tex(bricks(32, 32), true));
  // Corteza: vetas verticales que se cortan y nudos (sin rayas iguales: con la textura repetida parecía un tonel).
  const barkM = () => lambert('bark', () => tex(pix(32, 32, (x, y) => {
    const v = H(x, (y + (H(x, 0, 6) * 32 | 0)) >> 3, 5), k = H(x >> 2, y >> 2, 7);
    if ((x * 7 + (y >> 2) * 3) % 23 === 0 && k > 0.6) return BARK[0];
    return BARK[v < 0.25 ? 0 : v < 0.6 ? 1 : v < 0.9 ? 2 : 3];
  }), true), { flat: true });
  const leafM = () => lambert('leaf', () => tex(noisy(32, 32, LEAF, 21), true), { flat: true });
  const goldM = () => lambert('gold', () => tex(noisy(8, 8, GOLD, 31, 1), true), { emissive: new T.Color(0x3a2a00) });

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
  /** Rayas verticales (lonas de las carpas): n rayas alternas a/b, con costura y sombra abajo. */
  function stripes(n, a, b, hpx = 24) {
    const ra = ramp(a), rb = ramp(b), sw = 8;
    return pix(n * sw, hpx, (x, y) => {
      const r = (x / sw | 0) % 2 ? rb : ra, lx = x % sw;
      if (lx === 0) return r[1];
      if (y >= hpx - 2) return r[0];
      if (y >= hpx - 5) return r[1];
      return lx === sw - 1 ? r[1] : (y < 2 ? r[3] : r[2]);
    });
  }

  // ---------------- geometría: lo quieto, juntado por material ----------------
  // Cada pieza se apunta con su material y su matriz; al acabar, una malla por material (pocas llamadas de dibujo) y otra
  // con los contornos (casco invertido del tono oscuro del mapa).
  let batch = null;
  const tmpM = () => new T.Matrix4();
  function put(geo, mat, at, o = {}) {
    const m = at instanceof T.Matrix4 ? at : compose(at);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (o.uv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.uv[0], uv.getY(i) * o.uv[1]); }
    // ghost: sólo su contorno (la pieza de verdad va aparte, p. ej. una lona abierta que necesita un casco cerrado).
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
  let hulls = [];
  /** {x, y, z, rx, ry, rz, sx, sy, sz} → matriz. */
  function compose(a = {}) {
    const m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(a.rx || 0, a.ry || 0, a.rz || 0));
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
      const mesh = new T.Mesh(merge(hulls), hm);
      fixed(mesh);
    }
    batch = null; hulls = [];
  }
  function fixed(o) {
    o.matrixAutoUpdate = false; o.updateMatrix(); o.frustumCulled = false;
    o.traverse(c => { c.frustumCulled = false; });
    scene.add(o);
    return o;
  }

  // Piezas
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, n = 8, open = false) => new T.CylinderGeometry(rt, rb, h, n, 1, open);
  const cone = (r, h, n = 8, open = false) => new T.ConeGeometry(r, h, n, 1, open);
  const ball = (r, d = 1) => new T.IcosahedronGeometry(r, d);
  /** Prisma de tejado a dos aguas (largo en X): ancho w, fondo d, alto h. */
  function gable(w, d, h) {
    const g = new T.BufferGeometry(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const p = [], uv = [];
    const tri = (a, b, c, ua, ub, uc) => { p.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
    const qd = (a, b, c, d2, U) => { tri(a, b, c, [0, 0], [U, 0], [U, 1]); tri(a, c, d2, [0, 0], [U, 1], [0, 1]); };
    const U = w / 32;
    qd([x0, 0, z1], [x1, 0, z1], [x1, h, 0], [x0, h, 0], U);           // sur
    qd([x1, 0, z0], [x0, 0, z0], [x0, h, 0], [x1, h, 0], U);           // norte
    tri([x0, 0, z0], [x0, 0, z1], [x0, h, 0], [0, 0], [1, 0], [0.5, 1]); // oeste
    tri([x1, 0, z1], [x1, 0, z0], [x1, h, 0], [0, 0], [1, 0], [0.5, 1]); // este
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

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
    paths(g, b, A);
    return { ground: cv, tops: tc };
  }
  /** Caminos de tierra y la plaza de losas, a píxeles y con el borde irregular (sobre el suelo horneado). */
  function paths(g, b, A) {
    const VG = V(), W = VG.W, Hh = VG.H, k = A / 1;
    const DIRT = ['#7c5c34', '#94703e', '#a8834a', '#bf9a5c'], DARK = '#5e4426';
    const sample = (arr, fx, fy) => {
      const x = fx - 0.5, y = fy - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
      const v = (i, j) => (i < 0 || j < 0 || i >= W || j >= Hh) ? 0 : arr[j * W + i];
      return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
    };
    const P = VG.PLAZA;
    for (let py = 0; py < Hh * A; py += 1) for (let px = 0; px < W * A; px += 1) {
      const fx = px / A, fy = py / A;
      // Plaza: losas irregulares con junta oscura y un anillo de piedra más oscura en el borde.
      const d = Math.hypot(fx - P.x, fy - P.y);
      if (d < P.r + (H(px >> 2, py >> 2, 91) - 0.5) * 0.18) {
        const sx = Math.floor(px / 7 + (Math.floor(py / 6) % 2) * 0.5), sy = Math.floor(py / 6);
        const edge = d > P.r - 0.45;
        const joint = (px % 7 === 0 && !(Math.floor(py / 6) % 2)) || (px % 7 === 3 && Math.floor(py / 6) % 2) || py % 6 === 0;
        const n = H(sx, sy, 92);
        let col = joint ? STONE[0] : STONE[n < 0.3 ? 1 : n < 0.85 ? 2 : 3];
        if (edge && !joint) col = STONE[n < 0.5 ? 1 : 0];
        g.fillStyle = col; g.fillRect(px, py, 1, 1);
        continue;
      }
      const p = sample(b.path, fx, fy);
      if (p <= 0.05) continue;
      const n = H(px >> 1, py >> 1, 93);
      if (p + (n - 0.5) * 0.34 < 0.42) continue;
      const v = H(px, py, 94);
      let col = DIRT[v < 0.16 ? 0 : v < 0.6 ? 1 : v < 0.92 ? 2 : 3];
      if (p + (n - 0.5) * 0.34 < 0.5) col = DARK;            // borde de tierra húmeda
      if (H(px >> 1, py >> 1, 95) > 0.985) col = STONE[3];   // guijarros
      g.fillStyle = col; g.fillRect(px, py, 1, 1);
    }
  }

  function buildGround() {
    const VG = V(), W = VG.W, Hh = VG.H;
    const { ground, tops } = paintGround();
    const gt = tex(ground), mat = new T.MeshLambertMaterial({ map: gt });
    disposables.push(mat);
    const geo = new T.PlaneGeometry(W * TS, Hh * TS);
    disposables.push(geo);
    const mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(W * TS / 2, 0, Hh * TS / 2);
    mesh.receiveShadow = true;
    mat.depthWrite = false;                 // lo que está de pie nunca queda tapado por el suelo (pies y sombras 2D)
    mesh.renderOrder = -10;
    fixed(mesh);
    // Setos levantados: arriba, la pieza de pared del tileset (top3d); delante y a los lados, la cara de roca (face3d).
    const face = G.Tileset.face3d(VG.BI);
    const topT = tex(tops), topM = new T.MeshLambertMaterial({ map: topT, side: T.FrontSide });
    disposables.push(topM);
    let faceM = null;
    if (face) {
      const fc = document.createElement('canvas');
      fc.width = face.width; fc.height = face.height;
      fc.getContext('2d').drawImage(face, 0, 0);
      faceM = new T.MeshLambertMaterial({ map: tex(fc, true) });
      disposables.push(faceM);
    }
    const HW = 40, FW = face ? face.width * PX : 96;
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
      // (orden visto desde fuera: abajo-izq., abajo-der., arriba-der., arriba-izq.)
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

  // ---------------- agua: el estanque (capa animada del tileset) y la fuente ----------------
  function buildWater() {
    const VG = V(), BI = VG.BI, A = G.Tileset.T;
    if (!G.Tileset.animated(BI)) return;
    const meta = (G.TILESETS || []).find(m => m.bi === BI);
    const frames = meta ? meta.frames : 1, dur = meta ? meta.dur : 0.4;
    // Casillas de agua: su caja.
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
    pondFrames = frames;
    const m = new T.MeshBasicMaterial({ map: pondTex, transparent: true, alphaTest: 0.5, depthWrite: false });
    m.color = uni.tintCol;
    disposables.push(m);
    const geo = new T.PlaneGeometry(w * TS, h * TS);
    disposables.push(geo);
    const mesh = new T.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + w / 2) * TS, 0.4, (y0 + h / 2) * TS);
    mesh.renderOrder = -8;
    fixed(mesh);
    anim.push({ fn: t => { pondTex.offset.x = (Math.floor(t / dur) % frames) / frames; } });
  }

  // ---------------- modelos ----------------
  const tile = v => v * TS;

  /** Letreros: los iconos de los sitios en un atlas (una sola textura). */
  let signs = null;
  function signAtlas() {
    if (signs) return signs;
    const list = V().PLACES, S = 24, [c, g] = canvas(S * list.length, S);
    list.forEach((p, i) => {
      // Tabla de madera con su borde y el icono encima.
      g.fillStyle = WOOD[0]; g.fillRect(i * S, 0, S, S);
      g.fillStyle = WOOD[2]; g.fillRect(i * S + 1, 1, S - 2, S - 2);
      g.fillStyle = WOOD[3]; g.fillRect(i * S + 1, 1, S - 2, 1);
      g.fillStyle = WOOD[1]; g.fillRect(i * S + 1, S - 3, S - 2, 2);
      try { G.Icons.draw(g, p.icon, i * S + 2, 2, S - 4); } catch (e) { /* sin icono */ }
    });
    const t = tex(c, false, true);
    const m = new T.MeshLambertMaterial({ map: t });
    disposables.push(m);
    signs = { mat: m, tex: t, canvas: c, n: list.length, S };
    // Los iconos pueden no haber llegado aún: se repintan un par de veces.
    let tries = 0;
    const again = () => {
      if (!signs || tries++ > 4) { if (signs && signs.canvas) { G.U.freeCanvas(signs.canvas); signs.canvas = null; } return; }
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

  /** Bandera que ondea (la mueve anim). */
  function flag(x, y, z, col, w = 22, h = 13) {
    const g = new T.PlaneGeometry(w, h, 5, 1);
    g.translate(w / 2, 0, 0);
    const m = new T.MeshLambertMaterial({ color: col, side: T.DoubleSide });
    disposables.push(g, m);
    const mesh = new T.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    const p = g.attributes.position, base = Float32Array.from(p.array), ph = Math.random() * 6;
    flags.push({ fn: t => {
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3], k = bx / w;
        p.setZ(i, base[i * 3 + 2] + Math.sin(t * 5 + ph + bx * 0.25) * 3.2 * k);
        p.setY(i, base[i * 3 + 1] + Math.sin(t * 3.4 + ph + bx * 0.2) * 1.2 * k);
      }
      p.needsUpdate = true;
    } });
  }

  function tent(p, i) {
    const L = p.look, r = tile(L.r), n = L.shape, wallH = 48, roofH = r * 0.95, X = tile(p.x), Z = tile(p.y), sx = L.wide ? 1.32 : 1;
    const th = n === 4 ? Math.PI / 4 : Math.PI / n;          // una cara plana mirando al sur
    const wall = lambert('tw' + i, () => tex(stripes(n, L.a, L.b), true));
    const roof = lambert('tr' + i, () => tex(stripes(n, L.a, L.b, 32), true), { flat: true });
    const trim = lambert('tt' + i, () => tex(pix(16, 8, (x, y) => {
      // Faldón de picos: triángulos colgando (transparente entre picos).
      const lx = x % 8, d = Math.abs(lx - 3.5);
      if (y < 3) return y === 0 ? shade(L.trim, 0.25) : L.trim;
      return d < (8 - y) * 0.9 ? (y === 7 - (d | 0) ? shade(L.trim, -0.35) : shade(L.trim, -0.1)) : null;
    }), true), { alphaTest: 0.5, side: T.DoubleSide });
    // Paredes (cilindro abierto) y tejado (cono): rayas alternas, una por cara.
    const wg = cyl(r, r * 1.03, wallH, n, true); wg.rotateY(th);
    put(wg, wall, { x: X, y: wallH / 2, z: Z, sx }, { hull: false });
    const hull = cyl(r, r * 1.03, wallH, n); hull.rotateY(th);
    put(hull, wall, { x: X, y: wallH / 2, z: Z, sx }, { hull: 2.4, ghost: true });
    const rg = cone(r * 1.2, roofH, n, true); rg.rotateY(th);
    put(rg, roof, { x: X, y: wallH + roofH / 2 - 2, z: Z, sx }, { hull: false });
    const rh = cone(r * 1.2, roofH, n); rh.rotateY(th);
    put(rh, roof, { x: X, y: wallH + roofH / 2 - 2, z: Z, sx }, { hull: 2.4, ghost: true });
    const vg = cyl(r * 1.21, r * 1.21, 10, n * 2, true); vg.rotateY(th);
    put(vg, trim, { x: X, y: wallH - 6, z: Z, sx }, { hull: false, cast: false });
    // Puerta: la entrada oscura con las lonas recogidas a los lados.
    const ap = r * Math.cos(Math.PI / n) * 1.0 + 1.2, dw = Math.min(46, r * 0.62), dh = 40;
    const door = lambert('door' + i, () => tex(pix(16, 16, (x, y) => {
      const cxp = 7.5, top = 3 + Math.abs(x - cxp) * 0.5;
      if (y < top - 1) return null;
      if (x < 3 || x > 12) return (y > 4 + (x < 3 ? x : 15 - x) * 2) ? null : shade(L.b, -0.15);
      if (y < top) return shade(L.a, -0.5);
      return y > 13 ? '#1a1010' : (H(x, y, 3) > 0.9 ? '#3a2420' : '#2a1816');
    })), { alphaTest: 0.5 });
    put(new T.PlaneGeometry(dw, dh), door, { x: X, y: dh / 2, z: Z + ap * (n === 4 ? 1.0 : 1) }, { hull: false, cast: false });
    // Remate: mástil, bola y banderín (o la Poké Ball gigante del gacha).
    const topY = wallH + roofH - 4;
    if (L.ball) {
      const bm = lambert('pball', () => tex(pix(16, 16, (x, y) => y < 7 ? (y < 2 ? '#ff7a7a' : '#e03030') : y < 9 ? '#202020' : (y > 13 ? '#c8c8c8' : '#f4f4f4')), true), { flat: true });
      put(new T.SphereGeometry(17, 10, 8), bm, { x: X, y: topY + 14, z: Z }, { hull: 2.2 });
      put(cyl(5, 5, 3, 10), plain('#f4f4f4'), { x: X, y: topY + 14, z: Z + 16, rx: Math.PI / 2 }, { hull: 1.4 });
    } else {
      put(cyl(1.6, 1.6, 30, 5), woodM(), { x: X, y: topY + 15, z: Z }, { hull: 1 });
      put(ball(4, 0), goldM(), { x: X, y: topY + 31, z: Z }, { hull: 1.2 });
      flag(X + 1.6, topY + 24, Z, L.flag);
    }
    // Letrero colgado sobre la puerta.
    sign(i, 26, X, wallH + 10, Z + ap * 1.08 + 4);
    // Estacas y cuerdas (dos a cada lado).
    for (const s of [-1, 1]) put(box(4, 12, 4), woodM(), { x: X + s * (r * sx + 14), y: 6, z: Z + r * 0.4 }, { hull: 1.2 });
  }

  function stall(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y), w = tile(p.w) - 10;
    // Pared del fondo, mostrador delante, postes y toldo a rayas con picos.
    put(box(w, 74, 10), woodM(), { x: X, y: 37, z: Z - 24 });
    put(box(w - 8, 34, 26), woodM(), { x: X, y: 17, z: Z + 30 });
    put(box(w - 4, 4, 30), lambert('woodTop', () => tex(pix(16, 16, (x, y) => WOOD[y % 5 === 0 ? 1 : 3]), true)), { x: X, y: 36, z: Z + 30 }, { hull: 1.2 });
    // (El toldo va alto y corto, pegado a la pared del fondo: con la cámara desde arriba, uno largo tapaba a Kecleon.)
    for (const sx of [-1, 1]) {
      put(box(6, 116, 6), woodM(), { x: X + sx * (w / 2 - 3), y: 58, z: Z - 24 }, { hull: 1.2 });
      put(box(6, 94, 6), woodM(), { x: X + sx * (w / 2 - 3), y: 47, z: Z + 4 }, { hull: 1.2 });
    }
    const aw = lambert('aw' + i, () => tex(stripes(8, L.a, L.b, 16), true), { side: T.DoubleSide, flat: true });
    put(new T.PlaneGeometry(w + 16, 40), aw, compose({ x: X, y: 104, z: Z - 8, rx: -Math.PI / 2 + 0.6 }), { hull: 1.6 });
    const trim = lambert('awt' + i, () => tex(pix(16, 8, (x, y) => {
      const lx = x % 8, d = Math.abs(lx - 3.5), col = (x >> 3) % 2 ? L.b : L.a;
      return y < 2 ? col : d < (8 - y) * 0.8 ? shade(col, y > 5 ? -0.3 : -0.1) : null;
    }), true), { alphaTest: 0.5, side: T.DoubleSide });
    put(new T.PlaneGeometry(w + 16, 12), trim, { x: X, y: 86, z: Z + 9 }, { hull: false, cast: false, uv: [(w + 16) / 32, 1] });
    // Género: manzanas, bayas y cajas sobre el mostrador.
    const fruit = [['#d83a2a', -40], ['#3a6ad8', -22], ['#e8b030', 18], ['#d83a2a', 34], ['#8a3ac0', 50]];
    for (const [col, dx] of fruit) put(ball(6, 1), plain(col, { flat: true }), { x: X + dx, y: 44, z: Z + 30 + (H(dx, 1, 3) - 0.5) * 10 }, { hull: 1.2 });
    put(box(22, 14, 16), woodM(), { x: X - 2, y: 45, z: Z + 28 }, { hull: 1.2 });
    sign(i, 26, X, 132, Z - 20);
  }

  function hut(p, i, house = false) {
    const X = tile(p.x), Z = tile(p.y), w = tile(p.w) - 8, d = tile(p.h) - 12, wh = house ? 70 : 62;
    const wallM = house
      ? lambert('plaster', () => tex(pix(32, 32, (x, y) => (x % 16 === 0 || y === 31 || y === 0) ? WOOD[1] : (H(x >> 1, y >> 1, 61) > 0.8 ? '#e6d8b4' : '#f2e6c6')), true))
      : woodM();
    put(box(w, wh, d), wallM, { x: X, y: wh / 2, z: Z });
    const roofCol = house ? '#c0453a' : '#7a5a3a';
    const roofM = lambert('roof' + house, () => tex(pix(32, 32, (x, y) => {
      const r = ramp(roofCol), row = y >> 2, off = (row % 2) * 4;
      if (y % 4 === 3) return r[0];
      return (x + off) % 8 === 0 ? r[1] : H((x + off) >> 3, row, 62) > 0.7 ? r[3] : r[2];
    }), true), { flat: true });
    put(gable(w + 22, d + 22, house ? 58 : 46), roofM, { x: X, y: wh - 2, z: Z }, { uv: [1, (d + 22) / 32 * 0.5] });
    // Puerta y ventanas (de noche se encienden).
    const doorM = lambert('hdoor', () => tex(pix(12, 20, (x, y) => (x === 0 || x === 11 || y === 0) ? WOOD[0] : (x === 8 && y === 11) ? GOLD[3] : WOOD[(x % 4 === 0) ? 1 : 2])));
    put(box(26, 42, 3), doorM, { x: X + (house ? -22 : 0), y: 21, z: Z + d / 2 + 1.5 }, { hull: 1.2 });
    if (house) {
      for (const dx of [26]) put(box(26, 22, 3), lights.window, { x: X + dx, y: 40, z: Z + d / 2 + 1.5 }, { hull: 1.6 });
      put(box(30, 8, 8), woodM(), { x: X + 26, y: 26, z: Z + d / 2 + 4 }, { hull: 1.2 });
      for (let k = 0; k < 4; k++) put(ball(4, 0), plain(['#e84a6a', '#f0d040', '#e84a6a', '#ffffff'][k], { flat: true }), { x: X + 16 + k * 7, y: 32, z: Z + d / 2 + 5 }, { hull: false, cast: false });
      put(box(16, 40, 16), stoneM(), { x: X + w / 2 - 16, y: wh + 42, z: Z - 6 });
      smoke(X + w / 2 - 16, wh + 64, Z - 6);
    } else {
      put(cyl(11, 11, 26, 8), woodM(), { x: X + w / 2 + 2, y: 13, z: Z + d / 2 + 8 }, { hull: 1.4 });
    }
    sign(i, 24, X + (house ? -22 : 0), 56, Z + d / 2 + 4);
  }

  function board(p, i) {
    const X = tile(p.x), Z = tile(p.y), w = tile(p.w) - 14;
    for (const s of [-1, 1]) put(box(7, 92, 7), woodM(), { x: X + s * (w / 2 - 2), y: 46, z: Z });
    const cork = lambert('cork', () => tex(pix(48, 24, (x, y) => {
      // Corcho con papeles clavados (misiones).
      const papers = [[3, 3, 10, 9], [16, 2, 11, 12], [30, 4, 9, 8], [41, 3, 5, 9], [6, 14, 12, 8], [22, 15, 10, 7], [35, 14, 10, 8]];
      for (const [px0, py0, pw, ph] of papers) if (x >= px0 && x < px0 + pw && y >= py0 && y < py0 + ph) {
        if (y === py0 && x === px0 + (pw >> 1)) return '#d83a3a';
        return (y - py0) % 2 === 0 && y > py0 + 1 && x > px0 && x < px0 + pw - 1 ? '#8a8a98' : '#f4f0e4';
      }
      if (x === 0 || y === 0 || x === 47 || y === 23) return WOOD[1];
      return H(x, y, 71) > 0.5 ? '#b8864e' : '#a6763e';
    })));
    put(box(w, 50, 5), cork, { x: X, y: 60, z: Z + 3 });
    put(gable(w + 18, 22, 14), lambert('roofb', () => tex(noisy(16, 16, ramp('#3a7a4a'), 72), true), { flat: true }), { x: X, y: 88, z: Z });
    sign(i, 20, X, 22, Z + 6);
  }

  function showcase(p, i) {
    const X = tile(p.x), Z = tile(p.y);
    put(box(78, 14, 50), stoneM(), { x: X, y: 7, z: Z });
    put(box(62, 26, 38), stoneM(), { x: X, y: 27, z: Z });
    // Copa dorada (torno) y dos medallas.
    const prof = [[0, 0], [12, 0], [12, 3], [4, 6], [4, 16], [16, 24], [19, 40], [14, 40], [12, 28], [0, 26]].map(([x, y]) => new T.Vector2(x, y));
    put(new T.LatheGeometry(prof, 10), goldM(), { x: X, y: 40, z: Z }, { hull: 1.6 });
    for (const s of [-1, 1]) put(cyl(8, 8, 3, 10), goldM(), { x: X + s * 30, y: 52, z: Z + 6, rx: Math.PI / 2 - 0.2 }, { hull: 1.2 });
    for (const s of [-1, 1]) put(box(3, 22, 3), plain('#3a5ad8'), { x: X + s * 30, y: 64, z: Z + 3 }, { hull: false, cast: false });
    sign(i, 18, X, 20, Z + 26);
    sparkle(X, 70, Z, 10);
  }

  function podium(p, i) {
    const X = tile(p.x), Z = tile(p.y);
    const step = (dx, h, col, num) => {
      const m = lambert('pod' + num, () => tex(pix(16, 16, (x, y) => {
        // Número del puesto (1, 2 o 3) en la cara.
        const D = { 1: ['.##.', '###.', '.##.', '.##.', '.##.', '####'], 2: ['###.', '...#', '.##.', '#...', '#...', '####'], 3: ['###.', '...#', '.##.', '...#', '...#', '###.'] }[num];
        const gx = x - 6, gy = y - 5;
        if (gx >= 0 && gx < 4 && gy >= 0 && gy < 6 && D[gy][gx] === '#') return '#ffffff';
        return y < 2 ? shade(col, 0.3) : (y > 13 ? shade(col, -0.25) : col);
      })));
      put(box(50, h, 46), m, { x: X + dx, y: h / 2, z: Z });
    };
    step(0, 48, '#d8a828', 1); step(-52, 32, '#9aa4b4', 2); step(52, 22, '#b8743a', 3);
    const prof = [[0, 0], [9, 0], [9, 2], [3, 5], [3, 12], [12, 17], [14, 30], [10, 30], [9, 21], [0, 19]].map(([x, y]) => new T.Vector2(x, y));
    put(new T.LatheGeometry(prof, 10), goldM(), { x: X, y: 48, z: Z }, { hull: 1.6 });
    sign(i, 18, X - 52, 46, Z + 18);
    sparkle(X, 86, Z, 8);
  }

  function mailbox(p, i) {
    const X = tile(p.x), Z = tile(p.y);
    put(box(6, 46, 6), woodM(), { x: X, y: 23, z: Z });
    const red = plain('#d0403a', { flat: true });
    put(box(28, 18, 36), red, { x: X, y: 52, z: Z });
    const top = cyl(14, 14, 36, 10); top.rotateX(Math.PI / 2);
    put(top, red, { x: X, y: 61, z: Z }, { hull: 1.6 });
    put(box(22, 3, 2), plain('#202020'), { x: X, y: 56, z: Z + 18.5 }, { hull: false, cast: false });
    // Banderita: arriba si hay novedades sin leer (village.js: mailFlag).
    const fm = new T.Mesh(new T.BoxGeometry(2.4, 18, 2.4), plain('#f0d040'));
    const fl = new T.Mesh(new T.BoxGeometry(10, 7, 2), plain('#f0d040'));
    fl.position.set(5, 7, 0);
    const pivot = new T.Group();
    pivot.add(fm, fl);
    fm.position.y = 9;
    pivot.position.set(X + 16, 50, Z + 6);
    disposables.push(fm.geometry, fl.geometry);
    scene.add(pivot);
    mailPivot = pivot;
    sign(i, 14, X, 30, Z + 4);
  }
  let mailPivot = null;

  function pc(p, i) {
    const X = tile(p.x), Z = tile(p.y);
    put(box(52, 40, 34), lambert('pcb', () => tex(pix(16, 16, (x, y) => y === 0 ? '#c8d0dc' : (x === 0 || x === 15) ? '#6a7484' : (y % 5 === 4 ? '#7a8494' : '#98a2b2')), true)), { x: X, y: 20, z: Z });
    const screen = lambert('pcs', () => tex(pix(20, 14, (x, y) => {
      if (x === 0 || y === 0 || x === 19 || y === 13) return '#2a3040';
      const cx = x - 9.5, cy = y - 6.5, r = Math.hypot(cx, cy);
      if (r < 4.6 && r > 2 && (Math.atan2(cy, cx) * 8 / Math.PI | 0) % 2 === 0) return '#e8f4ff';
      if (r <= 2.2 && r > 1) return '#e8f4ff';
      return y % 3 === 0 ? '#3a8ad8' : '#4aa0f0';
    })), { emissive: new T.Color(0x1a4a80) });
    put(box(46, 32, 6), screen, compose({ x: X, y: 58, z: Z + 2, rx: -0.18 }), { hull: 1.6 });
    put(box(56, 4, 40), plain('#5a6474'), { x: X, y: 41, z: Z }, { hull: 1.2 });
    sign(i, 14, X + 22, 26, Z + 18);
  }

  /** El monumento: un árbol enorme con un portal en el tronco (decisión del dueño). */
  function portalTree(p, i) {
    const X = tile(p.x), Z = tile(p.y);
    // Raíces que se abren en el suelo, tronco grueso y algo torcido, copa de muchas bolas de hojas.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3, len = 70 + H(k, 1, 81) * 40;
      const g = cone(18 + H(k, 2, 81) * 8, len, 5); g.rotateZ(Math.PI / 2); g.translate(len / 2, 0, 0);
      put(g, barkM(), compose({ x: X + Math.cos(a) * 50, y: 8, z: Z + Math.sin(a) * 34, ry: -a, rz: -0.22 }), { hull: 2 });
    }
    // (Con la cámara desde arriba lo alto sube en la pantalla lo que mide: un árbol alto se sale por arriba. Por eso es más
    //  ancho que alto, con la copa baja justo encima del portal, como un árbol viejo enorme.)
    put(cyl(80, 96, 84, 11), barkM(), { x: X, y: 42, z: Z }, { hull: 2.6 });
    put(cyl(62, 80, 52, 10), barkM(), { x: X + 4, y: 110, z: Z - 6 }, { hull: 2.6 });
    // Ramas gruesas hacia los lados (salen de debajo de la copa).
    for (const [dx, dy, rz, len] of [[-40, 120, 1.05, 120], [44, 126, -1.0, 124], [-10, 132, 0.25, 70]]) {
      const g = cyl(11, 22, len, 6); g.translate(0, len / 2, 0);
      put(g, barkM(), compose({ x: X + dx, y: dy, z: Z - 10, rz }), { hull: 1.8 });
    }
    // Copa: bolas de hojas (caras planas), anchas y bajas; las de delante, por encima del arco del portal.
    const blobs = [[0, 196, -34, 112], [-128, 168, -22, 88], [132, 172, -26, 90], [-66, 234, -56, 86], [74, 236, -60, 88],
                   [0, 262, -74, 76], [-196, 146, -8, 62], [200, 150, -12, 64], [-60, 160, 22, 66], [64, 164, 20, 68], [0, 150, 30, 58]];
    for (const [dx, dy, dz, r] of blobs) put(ball(r, 1), leafM(), { x: X + dx, y: dy, z: Z + dz, sy: 0.7 }, { hull: 2.6 });
    // Lianas que cuelgan.
    const vine = lambert('vine', () => tex(pix(4, 32, (x, y) => (x === 1 || (x === 2 && y % 6 < 2)) ? LEAF[(y % 5) ? 1 : 2] : (x === 0 && y % 7 === 3) ? LEAF[3] : null)), { alphaTest: 0.5, side: T.DoubleSide });
    for (const [dx, len, dz] of [[-110, 70, 40], [-150, 50, 30], [118, 64, 40], [160, 44, 30], [-70, 30, 70], [76, 34, 70]]) put(new T.PlaneGeometry(8, len), vine, { x: X + dx, y: 138 - len / 2, z: Z + dz }, { hull: false, cast: false });
    // El portal: un arco hundido en el tronco, con su marco de corteza clara y el remolino dentro (shader).
    const pw = 64, ph = 86, pz = Z + 84;
    const rim = lambert('rim', () => tex(noisy(8, 16, ['#6a4a2c', '#8a6238', '#a87a46', '#c89a5c'], 82), true));
    const arch = new T.TorusGeometry(pw / 2 + 4, 6, 4, 12, Math.PI);
    put(arch, rim, { x: X, y: ph - pw / 2, z: pz - 2 }, { hull: 1.6 });
    for (const s of [-1, 1]) put(box(12, ph - pw / 2, 10), rim, { x: X + s * (pw / 2 + 4), y: (ph - pw / 2) / 2, z: pz - 2 }, { hull: 1.6 });
    put(box(pw + 30, 6, 24), stoneM(), { x: X, y: 3, z: pz + 14 }, { hull: 1.4 });
    put(box(pw + 50, 4, 22), stoneM(), { x: X, y: 2, z: pz + 34 }, { hull: 1.4 });
    portal(X, ph, pz, pw);
    // Setas que brillan entre las raíces (de noche, más).
    for (const [dx, dz, s] of [[-96, 40, 1], [-80, 62, 0.8], [100, 44, 1.1], [86, 66, 0.8], [-40, 76, 0.7], [44, 80, 0.7]]) {
      put(cyl(1.6 * s, 2.2 * s, 9 * s, 5), plain('#f4ead0'), { x: X + dx, y: 4.5 * s, z: Z + dz }, { hull: false, cast: false });
      put(new T.SphereGeometry(7 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), lights.mush, { x: X + dx, y: 8 * s, z: Z + dz }, { hull: 1.2, cast: false });
    }
    sparkle(X, 150, Z + 40, 16, true);
  }

  /** El remolino del portal: un shader a píxeles (bandas que giran), con su arco recortado. */
  function portal(X, ph, z, pw) {
    const m = new T.ShaderMaterial({
      uniforms: { uTime: uni.time, uGlow: uni.night },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec2 vUv; uniform float uTime; uniform float uGlow;',
        'void main(){',
        '  vec2 q = (floor(vUv * vec2(32.0, 43.0)) + 0.5) / vec2(32.0, 43.0);',
        '  vec2 p = vec2(q.x * 2.0 - 1.0, q.y * 43.0 / 32.0 * 2.0 - 43.0 / 32.0);',
        '  float topY = 43.0 / 32.0 - 1.0;',
        '  float inside = p.y < topY ? step(abs(p.x), 0.94) : step(length(vec2(p.x, p.y - topY)), 0.94);',
        '  if (inside < 0.5) discard;',
        '  vec2 c = vec2(p.x, p.y - topY * 0.4);',
        '  float r = length(c), a = atan(c.y, c.x);',
        '  float sw = sin(a * 3.0 + r * 9.0 - uTime * 2.6);',
        '  float b = step(0.15, sw) + step(0.7, sw);',
        '  vec3 col = b < 0.5 ? vec3(0.13, 0.07, 0.32) : b < 1.5 ? vec3(0.33, 0.2, 0.78) : vec3(0.55, 0.62, 1.0);',
        '  if (r < 0.22 + 0.05 * sin(uTime * 3.0)) col = vec3(0.86, 0.94, 1.0);',
        '  col *= 0.85 + 0.35 * uGlow;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    const g = new T.PlaneGeometry(pw, ph);
    disposables.push(m, g);
    const mesh = new T.Mesh(g, m);
    mesh.position.set(X, ph / 2, z);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ---------------- decorados ----------------
  function decor(d) {
    const X = tile(d.x || 0), Z = tile(d.y || 0);
    switch (d.k) {
      case 'tree': {
        const s = d.s || 1;
        put(cyl(6 * s, 10 * s, 46 * s, 6), barkM(), { x: X, y: 23 * s, z: Z }, { hull: 1.6 });
        const tops = [[0, 70, 0, 34], [-18, 58, 6, 24], [20, 60, 4, 26], [2, 92, -4, 24]];
        for (const [dx, dy, dz, r] of tops) put(ball(r * s, 1), leafM(), { x: X + dx * s, y: dy * s, z: Z + dz * s, sy: 0.85 }, { hull: 2.2 });
        break;
      }
      case 'lamp': {
        // (Con la cámara desde arriba, un tejadillo que sobresale tapa lo que tiene debajo lo mismo que sobresale: casi no sobresale.)
        put(box(5, 50, 5), woodM(), { x: X, y: 25, z: Z });
        put(box(15, 3, 15), woodM(), { x: X, y: 51.5, z: Z }, { hull: 1.2 });
        put(box(12, 17, 12), lights.lamp, { x: X, y: 61.5, z: Z }, { hull: 1.4 });
        put(box(3, 17.4, 12.4), woodM(), { x: X, y: 61.5, z: Z }, { hull: false, cast: false });
        put(cone(10, 8, 4), plain('#4a3a2a', { flat: true }), { x: X, y: 74, z: Z, ry: Math.PI / 4 }, { hull: 1.2 });
        glow(X, Z, 46);
        break;
      }
      case 'torch': {
        put(cyl(3, 4, 54, 5), woodM(), { x: X, y: 27, z: Z }, { hull: 1.2 });
        put(cyl(7, 4, 8, 6), plain('#3a3a3a'), { x: X, y: 56, z: Z }, { hull: 1.2 });
        flame(X, 60, Z);
        glow(X, Z, 44, true);
        break;
      }
      case 'bench': {
        put(box(50, 4, 14), woodM(), { x: X, y: 14, z: Z });
        put(box(50, 12, 3), woodM(), { x: X, y: 24, z: Z - 7 });
        for (const s of [-1, 1]) put(box(4, 14, 12), woodM(), { x: X + s * 20, y: 7, z: Z }, { hull: 1 });
        break;
      }
      case 'barrel': put(cyl(13, 12, 28, 8), lambert('barrel', () => tex(pix(16, 16, (x, y) => (y === 3 || y === 12) ? '#3a3a40' : WOOD[(x % 4 === 0) ? 1 : 2]), true)), { x: X, y: 14, z: Z }); break;
      case 'crate': put(box(26, 24, 26), lambert('crate', () => tex(pix(16, 16, (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 || x === y || x === 15 - y) ? WOOD[0] : WOOD[2]))), { x: X, y: 12, z: Z, ry: H(d.x * 10, d.y * 10, 3) * 0.6 }); break;
      case 'rock': put(ball(16, 0), stoneM(), { x: X, y: 6, z: Z, sy: 0.6, ry: H(d.x * 9, d.y * 9, 4) * 3 }, { hull: 1.6 }); break;
      case 'well': {
        put(cyl(26, 28, 24, 10, true), stoneM(), { x: X, y: 12, z: Z }, { hull: false });
        put(cyl(26, 28, 24, 10), stoneM(), { x: X, y: 12, z: Z }, { hull: 2.2, ghost: true });
        put(cyl(22, 22, 2, 10), plain('#2a4a7a'), { x: X, y: 18, z: Z }, { hull: false, cast: false });
        for (const s of [-1, 1]) put(box(5, 52, 5), woodM(), { x: X + s * 24, y: 26, z: Z }, { hull: 1 });
        put(gable(64, 40, 18), lambert('roof' + true, null), { x: X, y: 52, z: Z });
        break;
      }
      case 'fence': {
        const x0 = tile(d.a[0]), z0 = tile(d.a[1]), x1 = tile(d.b[0]), z1 = tile(d.b[1]), L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 30));
        for (let k = 0; k <= n; k++) put(box(5, 24, 5), woodM(), { x: x0 + (x1 - x0) * k / n, y: 12, z: z0 + (z1 - z0) * k / n }, { hull: 1 });
        const ry = -Math.atan2(z1 - z0, x1 - x0);
        for (const y of [9, 18]) put(box(L, 3, 2), woodM(), { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, ry }, { hull: false });
        break;
      }
      case 'fountain': {
        put(cyl(54, 58, 20, 10, true), stoneM(), { x: X, y: 10, z: Z }, { hull: false });
        put(cyl(54, 58, 20, 10), stoneM(), { x: X, y: 10, z: Z }, { hull: 2.4, ghost: true });
        // Borde de piedra (un aro: el agua se ve dentro), columna y la taza de arriba (abierta).
        const rim = new T.TorusGeometry(56, 5, 4, 12); rim.rotateX(Math.PI / 2);
        put(rim, stoneM(), { x: X, y: 20, z: Z }, { hull: 1.4 });
        put(cyl(10, 14, 50, 8), stoneM(), { x: X, y: 30, z: Z }, { hull: 1.6 });
        put(cyl(24, 12, 10, 8, true), stoneM(), { x: X, y: 58, z: Z }, { hull: false });
        put(cyl(24, 12, 10, 8), stoneM(), { x: X, y: 58, z: Z }, { hull: 1.6, ghost: true });
        water(X, Z, 52, 16); water(X, Z, 21, 61);
        spray(X, 66, Z);
        break;
      }
      case 'flowers': for (let k = 0; k < 9; k++) {
        const a = H(d.x * 7, d.y * 7, k) * 6.28, rr = 8 + H(k, d.x * 3, 9) * 22, col = ['#e8486a', '#f4d040', '#ffffff', '#9a6ae8'][k % 4];
        flowerTuft(X + Math.cos(a) * rr, Z + Math.sin(a) * rr * 0.7, col);
      } break;
      case 'reeds': for (let k = 0; k < 6; k++) reed(X + (H(k, d.x * 5, 1) - 0.5) * 40, Z + (H(k, d.y * 5, 2) - 0.5) * 20); break;
    }
  }

  // ---------------- cosas que se mueven ----------------
  /** Agua de la fuente: la casilla llena del líquido animado, en un disco. */
  function water(X, Z, r, y) {
    if (!fountainTex) {
      const BI = V().BI, A = G.Tileset.T, meta = (G.TILESETS || []).find(m => m.bi === BI) || { frames: 1, dur: 0.4 };
      const fr = G.Tileset.animated(BI) ? meta.frames : 1;
      const [c, g] = canvas(A * fr, A);
      g.fillStyle = '#3a7ad8'; g.fillRect(0, 0, c.width, c.height);
      const full = () => 2;
      for (let f = 0; f < fr; f++) if (G.Tileset.animated(BI)) G.Tileset.drawLiquid(g, BI, full, 0, 0, f * A, 0, A, (f + 0.5) * meta.dur);
      fountainTex = tex(c, true);
      fountainTex.repeat.set(1 / fr, 1);
      anim.push({ fn: t => { fountainTex.offset.x = (Math.floor(t / meta.dur) % fr) / fr; } });
    }
    const m = new T.MeshBasicMaterial({ map: fountainTex });
    m.color = uni.tintCol;
    disposables.push(m);
    const g = new T.CircleGeometry(r, 12);
    disposables.push(g);
    const mesh = new T.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(X, y, Z);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /** Llama de antorcha: dos cuadros de colores que parpadean. */
  function flame(X, y, Z) {
    const m = new T.MeshBasicMaterial({ color: 0xffb030 }), m2 = new T.MeshBasicMaterial({ color: 0xfff0a0 });
    const g = new T.PlaneGeometry(10, 16), g2 = new T.PlaneGeometry(5, 9);
    disposables.push(m, m2, g, g2);
    const a = new T.Mesh(g, m), b = new T.Mesh(g2, m2);
    a.position.set(X, y + 8, Z + 1); b.position.set(X, y + 6, Z + 2);
    a.frustumCulled = b.frustumCulled = false;
    scene.add(a, b);
    const ph = Math.random() * 6;
    anim.push({ fn: t => {
      const k = 0.82 + 0.18 * Math.sin(t * 13 + ph) * Math.sin(t * 7.3 + ph);
      a.scale.set(1, k, 1); a.position.y = y + 8 * k;
      b.scale.set(1, 0.7 + 0.3 * k, 1);
    } });
  }

  /** Halo de luz en el suelo (de noche): círculo a escalones que se suma. */
  let glowMat = null;
  const glows = [];
  function glow(X, Z, r, warm = false) {
    if (!glowMat) {
      const c = pix(32, 32, (x, y) => {
        const d = Math.hypot(x - 15.5, (y - 15.5) * 1.35) / 16;
        return d < 0.4 ? 'rgba(255,210,140,.34)' : d < 0.7 ? 'rgba(255,196,120,.2)' : d < 1 ? 'rgba(255,186,110,.09)' : null;
      });
      glowMat = new T.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
      disposables.push(glowMat);
    }
    const g = new T.PlaneGeometry(r * 2, r * 2);
    disposables.push(g);
    const mesh = new T.Mesh(g, glowMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(X, 0.6, Z);
    mesh.renderOrder = -6;
    mesh.frustumCulled = false;
    scene.add(mesh);
    glows.push(mesh);
  }

  // Partículas: un solo shader (modos: luciérnagas, pétalos que caen, humo, chispas, salpicaduras).
  const PV = [
    'attribute float aSeed; attribute vec3 aCol; uniform float uTime; uniform float uMode; uniform float uSize; uniform float uAlpha;',
    'varying float vA; varying vec3 vC;',
    'void main(){',
    '  vec3 p = position; float s = aSeed; vC = aCol;',
    '  if (uMode < 0.5) {',
    '    p.x += sin(uTime * 0.6 + s * 6.28) * 40.0 + sin(uTime * 1.7 + s * 17.0) * 8.0;',
    '    p.z += cos(uTime * 0.45 + s * 12.0) * 26.0; p.y += 14.0 + sin(uTime * 1.1 + s * 3.0) * 10.0;',
    '    vA = smoothstep(0.3, 1.0, sin(uTime * 2.2 + s * 40.0) * 0.5 + 0.5);',
    '  } else if (uMode < 1.5) {',
    '    float c = fract(uTime * 0.05 + s);',
    '    p.y = 200.0 * (1.0 - c); p.x += sin(uTime * 1.3 + s * 20.0) * 18.0 + c * 90.0; p.z += c * 50.0;',
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
    '    float c = fract(uTime * 0.9 + s);',
    '    float a = s * 6.2832;',
    '    p.x += cos(a) * c * 30.0; p.z += sin(a) * c * 22.0; p.y += c * (1.0 - c) * 70.0 - 6.0;',
    '    vA = 1.0 - c;',
    '  }',
    '  vA *= uAlpha;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '  gl_PointSize = uSize;',
    '}'].join('\n');
  const PF = 'varying float vA; varying vec3 vC; void main(){ if (vA < 0.06) discard; gl_FragColor = vec4(vC, vA);\n#include <colorspace_fragment>\n}';
  const particleSets = [];
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
    scene.add(o);
    particleSets.push(o);
    return o;
  }
  const smokeQ = [], sparkQ = [], sprayQ = [];
  function smoke(x, y, z) { smokeQ.push([x, y, z]); }
  function sparkle(x, y, z, n, big) { for (let k = 0; k < n; k++) sparkQ.push([x + (H(k, x, 1) - 0.5) * (big ? 180 : 50), y + (H(k, y, 2) - 0.5) * (big ? 120 : 30), z + (H(k, z, 3) - 0.5) * (big ? 60 : 20)]); }
  function spray(x, y, z) { sprayQ.push([x, y, z]); }

  /** Matas de hierba que se mecen (y se apartan al pasar tu Pokémon) y flores: un shader con todas juntas. */
  const tufts = [];
  function flowerTuft(x, z, col) { tufts.push([x, z, 3, col]); }
  function reed(x, z) { tufts.push([x, z, 4, null]); }
  function buildTufts() {
    const VG = V(), b = VG.build(), pal = G.Tileset.pal(VG.BI);
    const GR = pal ? pal.grass : ['#598031', '#7bb244', '#9ae055', '#c6ff8c'];
    // En la hierba alta: matas sueltas (menos en calidad baja).
    const dens = fx() === 0 ? 0.25 : fx() === 1 ? 0.55 : 1;
    for (let ty = 0; ty < VG.H; ty++) for (let tx = 0; tx < VG.W; tx++) {
      if (!b.grass[ty * VG.W + tx]) continue;
      for (let k = 0; k < 3; k++) if (H(tx, ty, 300 + k) < dens * 0.9) tufts.push([(tx + 0.15 + H(tx, ty, 310 + k) * 0.7) * TS, (ty + 0.2 + H(tx, ty, 320 + k) * 0.7) * TS, (H(tx, ty, 330 + k) * 3) | 0, null]);
    }
    if (!tufts.length) return;
    // Atlas: 5 dibujos de 12×14 (3 matas, flor, juncos).
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
    // flor (tallo y una cabeza blanca que se tiñe con el color de cada una)
    g.fillStyle = GR[1]; g.fillRect(36 + 6, 6, 1, 8); g.fillStyle = GR[2]; g.fillRect(36 + 4, 10, 2, 1); g.fillRect(36 + 7, 9, 2, 1);
    g.fillStyle = '#ffffff'; for (const [dx, dy] of [[5, 3], [7, 3], [4, 4], [6, 4], [8, 4], [5, 5], [7, 5]]) g.fillRect(36 + dx, dy, 1, 1);
    g.fillStyle = '#f4d040'; g.fillRect(36 + 6, 4, 1, 1);
    // juncos
    for (const [bx, bh] of [[3, 13], [6, 11], [9, 12]]) { g.fillStyle = '#5a7a3a'; g.fillRect(48 + bx, 14 - bh, 1, bh); g.fillStyle = '#7a4a2a'; g.fillRect(48 + bx, 14 - bh, 1, 3); }
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
      fragmentShader: 'uniform sampler2D uMap; uniform vec3 uTint; varying vec2 vUv; varying vec3 vC; void main(){ vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard; vec3 col = c.rgb; if (col.r > 0.95 && col.g > 0.95 && col.b > 0.95) col = vC; gl_FragColor = vec4(col * uTint, 1.0);\n#include <colorspace_fragment>\n}',
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
      edgeCol = pal ? pal.edge : '#104743';
      uni = { time: { value: 0 }, night: { value: 0 }, tint: { value: new T.Vector3(1, 1, 1) }, tintCol: new T.Color(1, 1, 1), player: { value: new T.Vector3() } };
      amb = new T.AmbientLight(0xffffff, 0.6 * Math.PI);
      sun = new T.DirectionalLight(0xffffff, 0.5 * Math.PI);
      sun.castShadow = fx() > 0;
      const ms = mobile() ? 512 : 1024;
      sun.shadow.mapSize.set(ms, ms);
      sun.shadow.bias = -0.002;
      const sc = sun.shadow.camera, half = Math.max(V().W, V().H) * TS * 0.62;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 10; sc.far = 6000;
      sc.updateProjectionMatrix();
      sun.target.position.set(V().W * TS / 2, 0, V().H * TS / 2);
      scene.add(amb, sun, sun.target);
      lights = {
        lamp: new T.MeshLambertMaterial({ color: 0xffe8a0, emissive: new T.Color(0xffb040), emissiveIntensity: 0 }),
        window: new T.MeshLambertMaterial({ color: 0x8ab0d8, emissive: new T.Color(0xffc060), emissiveIntensity: 0 }),
        mush: new T.MeshLambertMaterial({ color: 0x60c8ff, emissive: new T.Color(0x40a0ff), emissiveIntensity: 0.15, flatShading: true })
      };
      disposables.push(lights.lamp, lights.window, lights.mush);
      batch = new Map();
      buildGround();
      buildWater();
      V().PLACES.forEach((p, i) => {
        const k = p.look.kind;
        if (k === 'tent') tent(p, i); else if (k === 'stall') stall(p, i); else if (k === 'hut') hut(p, i); else if (k === 'house') hut(p, i, true);
        else if (k === 'board') board(p, i); else if (k === 'case') showcase(p, i); else if (k === 'podium') podium(p, i);
        else if (k === 'mailbox') mailbox(p, i); else if (k === 'pc') pc(p, i); else if (k === 'tree') portalTree(p, i);
      });
      for (const d of V().DECOR) decor(d);
      flush();
      buildTufts();
      // Partículas: pétalos de día, luciérnagas de noche, humo de la chimenea, chispas doradas y la fuente.
      const VG = V(), f = fx();
      const nFly = f === 0 ? 14 : f === 1 ? 26 : 44, nPet = f === 0 ? 10 : f === 1 ? 20 : 34;
      const spots = (n, s) => Array.from({ length: n }, (_, i) => [(3 + H(i, s, 1) * (VG.W - 6)) * TS, 0, (3 + H(i, s, 2) * (VG.H - 6)) * TS]);
      uni.flyA = { value: 0 }; uni.petA = { value: 1 };
      particles(0, spots(nFly, 1), ['#d8ff70', '#fff490', '#a8ff90'], 2, true, uni.flyA);
      particles(1, spots(nPet, 2), ['#ffc0d8', '#ffffff', '#ffe08a', '#c8f0a0'], 2, false, uni.petA);
      if (smokeQ.length) particles(2, smokeQ.flatMap(p => Array.from({ length: 8 }, () => p)), ['#d8d8d8', '#bcbcbc'], 3, false);
      if (sparkQ.length) particles(3, sparkQ, ['#fff6b0', '#ffffff', '#b8e0ff'], 2, true);
      if (sprayQ.length) particles(4, sprayQ.flatMap(p => Array.from({ length: f === 0 ? 8 : 18 }, () => p)), ['#cfe8ff', '#ffffff', '#8ac0ff'], 2, false);
      smokeQ.length = sparkQ.length = sprayQ.length = 0;
      built = true;
      shadowAt = -1;
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
    // Sombra a píxeles (como sprites.js drawShadow): una elipse en escalones, sin suavizar.
    const h = Math.max(1, Math.round(R * 0.42));
    const c = pix(R * 2, h * 2, (x, y) => {
      const w = Math.round(Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.5 - h) / h, 2))) * R);
      return x >= R - w && x < R + w ? '#000000' : null;
    });
    m = new T.MeshBasicMaterial({ map: tex(c), transparent: true, opacity: 0.34, depthWrite: false });
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
  /** Pone (o actualiza) el sprite de una entidad: { anim (G.Sprites.Animator), x, y, z?, hide? }. */
  function sprite(e) {
    if (!built) return;
    let s = sprites.get(e);
    if (!s) {
      if (!planeGeo) { planeGeo = new T.PlaneGeometry(1, 1); planeGeo.__keep = true; }
      const mat = new T.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, depthWrite: true });
      const mesh = new T.Mesh(planeGeo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 5;
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
    s.shadow.visible = !!ok && !e.noShadow;
    if (!ok) return;
    let t = s.tex.get(sh.img);
    if (!t) { t = baseOf(sh.img).clone(); s.tex.set(sh.img, t); }
    if (s.mat.map !== t) { s.mat.map = t; s.mat.needsUpdate = true; }
    const frame = own ? Math.min(a.frame, m.n - 1) : 0, row = Math.min(a.dir, m.r - 1);
    const sx = (m.x || 0) + frame * m.w, sy = (m.y || 0) + row * m.h, W = sh.img.width, Hh = sh.img.height;
    t.repeat.set(m.w / W, m.h / Hh);
    t.offset.set(sx / W, 1 - (sy + m.h) / Hh);
    const k = PX * a.scale;
    // Pies en (x, y) sobre la rejilla del arte, como sprites.js.
    const left = Math.round((e.x - m.ax * k) / PX) * PX, top = Math.round((m.ay * k + (e.z || 0)) / PX) * PX;
    s.mesh.scale.set(m.w * k, m.h * k, 1);
    s.mesh.position.set(left + m.w * k / 2, top - m.h * k / 2, e.y + 1);
    s.mesh.renderOrder = 5;
    const sh2 = Math.max(1, Math.round(s.R * 0.42)) * 2 * PX;
    s.shadow.position.set(Math.round((e.x) / PX) * PX, 0.8, Math.round(e.y / PX) * PX - sh2 / 2 + PX);
    s.mat.color.setRGB(e.flash ? 1.6 : 1, e.flash ? 1.6 : 1, e.flash ? 1.6 : 1);
  }
  function unsprite(e) {
    const s = sprites.get(e);
    if (!s) return;
    scene.remove(s.mesh, s.shadow);
    s.mat.dispose();
    for (const t of s.tex.values()) t.dispose();
    sprites.delete(e);
  }

  // ---------------- luz del día ----------------
  /*
   * Ciclo corto (decisión del dueño): l = { amb: [r,g,b], ai, sun: [r,g,b], si, az, el, night (0..1), dusk (0..1) }.
   * De día, el suelo sale con el color justo del tileset (amb 0,6 + sol 0,5 · 0,8 = 1, como Ultra 3D).
   */
  function setLight(l) {
    amb.color.setRGB(...l.amb); amb.intensity = l.ai * Math.PI;
    sun.color.setRGB(...l.sun); sun.intensity = l.si * Math.PI;
    const ce = Math.cos(l.el), dir = [Math.cos(l.az) * ce, Math.sin(l.el), Math.sin(l.az) * ce];
    const c = sun.target.position;
    sun.position.set(c.x + dir[0] * 2000, dir[1] * 2000, c.z + dir[2] * 2000);
    // Tinte de lo que no lleva luz (hierba, agua): lo que le llega al suelo.
    const k = Math.max(0, dir[1]);
    const tr = l.amb[0] * l.ai + l.sun[0] * l.si * k, tg = l.amb[1] * l.ai + l.sun[1] * l.si * k, tb = l.amb[2] * l.ai + l.sun[2] * l.si * k;
    uni.tint.value.set(tr, tg, tb);
    uni.tintCol.setRGB(tr, tg, tb);
    uni.night.value = l.night;
    lights.lamp.emissiveIntensity = l.night * 1.4 + l.dusk * 0.6;
    lights.window.emissiveIntensity = l.night * 1.1 + l.dusk * 0.4;
    lights.mush.emissiveIntensity = 0.15 + l.night * 1.2;
    if (glowMat) glowMat.opacity = Math.min(1, l.night * 1.2 + l.dusk * 0.4);
    uni.flyA.value = l.night;
    uni.petA.value = 1 - l.night;
    // Sombras: se rehacen sólo si el sol se ha movido (todo lo que da sombra está quieto).
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
    // Cámara pegada a la rejilla del arte (sin «nadar»); el resto se corrige al pasarlo a la pantalla.
    const cxs = Math.round(view.cx * KL) / KL, czs = Math.round(view.cy * KL) / KL;
    const Cx = Math.round(Wl / 2), Cy = Math.round(Hl / 2);
    const R = view.scale / KL;
    const ox = (cxs - view.cx + hw) * view.scale - Cx * R, oy = (czs - view.cy + hh) * view.scale - Cy * R;
    // En (X, Y, Z): w = 1 − a·(Z − cz) − b·Y; x de pantalla ∝ (X − cx)/w; y ∝ (Z − cz − Y)/w (lo alto sube).
    const w = [0, -b, -a, 1 + a * czs];
    const xr = [2 * KL / Wl, 0, 0, -2 * KL * cxs / Wl].map((v, i) => v + (2 * Cx / Wl - 1) * w[i]);
    const yr = [0, 2 * KL / Hl, -2 * KL / Hl, 2 * KL * czs / Hl].map((v, i) => v + (1 - 2 * Cy / Hl) * w[i]);
    // Profundidad: z = A − B/w (w de 0,3 a 2,5; lo cercano, w pequeño, delante).
    const A = 1.2727, B = 0.6818;
    const zr = w.map((v, i) => A * v + (i === 3 ? -B : 0));
    P.set([...xr, ...yr, ...zr, ...w]);
    cam3.projectionMatrix.set(...P);
    cam3.projectionMatrixInverse.copy(cam3.projectionMatrix).invert();
    view.proj = { cxs, czs, Cx, Cy, a, b, R, ox, oy };
    uni.time.value = t;
    setLight(light);
    for (const o of anim) o.fn(t, dt);
    for (const o of flags) o.fn(t, dt);
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
    if (!gpuGone) {
      for (const d of disposables) { try { d.dispose(); } catch (e) { /* nada */ } }
      for (const t of baseTex.values()) { try { t.dispose(); } catch (e) { /* nada */ } }
    }
    disposables.length = 0; baseTex.clear(); mats.clear(); shadowMats.clear();
    anim.length = 0; flags = []; glows.length = 0; particleSets.length = 0; tufts.length = 0;
    if (signs && signs.canvas) G.U.freeCanvas(signs.canvas);
    signs = null; glowMat = null; pondTex = null; fountainTex = null; mailPivot = null; planeGeo = null; batch = null; hulls = [];
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

  return { probe, start, build, render, sprite, unsprite, toScreen, toWorld, free,
    get ready() { return built && !lost; }, get lost() { return lost; }, get started() { return !!renderer; }, get failed() { return failed; },
    /** Para depurar (sólo con ?dev): la escena. */
    get scene() { return /[?&]dev\b/.test(location.search) ? scene : null; },
    /** Para pruebas: cuántas mallas y llamadas de dibujo. */
    stats() { return renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures, W: Wl, H: Hl } : null; } };
})();
