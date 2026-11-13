/* ============ village3d.js — la aldea del menú en WebGL (three.js) ============
 * Mezcla 2D y 3D como el juego en Ultra 3D (ultra3d.js):
 *   - el suelo y los Pokémon son 2D: el suelo, horneado con el tileset de Mundo Misterioso (tileset.js paintChunk, como un
 *     chunk del mundo) más el musgo, los caminos y la plaza; los Pokémon, sus sprites de siempre en cuadros de pie;
 *   - el bosque del borde, las chozas, la Flor del Portal y los decorados son 3D de verdad, con luz y sombras duras.
 * La cámara es la de Ultra: la homografía del suelo de G.Camera (q = 1 − a·dv) con lo alto subiendo en la pantalla, escrita
 * como matriz de proyección. Se dibuja en un lienzo WebGL a la resolución de la pantalla (ver «pulido» abajo) y village.js
 * lo pasa al lienzo del juego.
 *
 * (12-11-2026) Bosque bioluminiscente (decisión del dueño): casi siempre de noche, con lo que brilla hecho con materiales
 * que se encienden solos (emisivos: no hacen falta luces de verdad, que en el iPhone cuestan), halos de color en el suelo,
 * niebla baja (dos capas que se deslizan), esporas que flotan y la tecnología de la tribu (cables, cristales, hologramas).
 * Tu choza (data/home.js) va aparte, en su grupo: se rehace sola al cambiar una pieza (setHome).
 *
 * Ejes (los de three.js): X al este, Y arriba, Z al sur (hacia la cámara). Un punto del juego (x, y) es (x, 0, y).
 *
 * Memoria (iPhone): un solo lienzo WebGL, texturas soltadas al subirlas (sus lienzos), lo quieto juntado en pocas
 * mallas (una por material), mapa de sombras más pequeño en móvil y sin sombras en calidad baja. free() lo suelta todo
 * (al empezar una partida): la aldea se rehace al volver.
 *
 * (12-11-2026, pulido pedido por el dueño: «que no esté todo tan pixelado y se vea más nítido, los modelados 3D
 *  principalmente y algunos efectos») Antes se dibujaba a la escala del arte (0,5 px por unidad: un lienzo de 484×274 en
 *  una pantalla de 1280×720) y se ampliaba sin suavizar. Ahora:
 *   - se dibuja a la resolución de la pantalla (con su devicePixelRatio, con tope de píxeles) y con antialias;
 *   - la calidad se ajusta sola (Q): si van lentos los fotogramas, baja la resolución por escalones, y sube si sobra;
 *   - los modelos llevan texturas suaves (más grandes, con mipmaps) y más segmentos, sin sombreado plano;
 *   - lo que es pixel art (el suelo del tileset, los Pokémon, los letreros y las pantallas) se muestrea «nítido»
 *     (crisp: cada texel es un cuadrado limpio con el borde suavizado), nunca borroso ni con píxeles torcidos;
 *   - lo que brilla lleva un halo de luz (bloom barato: un solo dibujo de puntos que se suman), la niebla, los halos
 *     del suelo, las esporas y el portal son suaves en lugar de a escalones;
 *   - lo que choca sale de la geometría (solids): cada pieza que toca el suelo deja su huella (casco convexo) y
 *     village.js choca con eso. Lo que se ve es lo que choca (tests/village-solids.test.cjs).
 */
G.Village3D = (() => {
  const V = () => G.VILLAGE;
  const TS = 48, PX = 2;
  let KL = 0.5;                          // px del lienzo por unidad de mundo (lo pone render según la pantalla y la calidad)
  let gl2 = false, aniso = 1;
  let T = null, renderer = null, glcv = null, scene = null, cam3 = null, amb = null, sun = null, hemi = null;
  let built = false, lost = false, failed = '', dry = false;   // dry: sin pintar texturas (collect, en los tests)
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
    const c = glcv = document.createElement('canvas');
    glcv.width = glcv.height = 16;
    lost = false;
    // (Sólo el lienzo de ahora: al soltar la aldea, free() pierde el contexto a propósito y el aviso del lienzo viejo llega
    //  más tarde; si contaba, la aldea rehecha al volver de la partida se daba por perdida y salía el menú clásico.)
    c.addEventListener('webglcontextlost', e => { e.preventDefault(); if (c === glcv) lost = true; });
    c.addEventListener('webglcontextrestored', () => { if (c !== glcv) return; lost = false; drop(true); });
    // Antialias (MSAA) salvo en calidad baja. El tamaño del lienzo lo pone render (ya en píxeles físicos).
    renderer = new T.WebGLRenderer({ canvas: glcv, antialias: fx() > 0, alpha: false, depth: true, stencil: false,
      powerPreference: G.U.IOS ? 'default' : 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x050a12, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = fx() > 1 ? T.PCFShadowMap : T.BasicShadowMap;   // borde de sombra suavizado (salvo calidad baja)
    renderer.shadowMap.autoUpdate = false;
    renderer.sortObjects = true;
    const cap = renderer.capabilities || {};
    gl2 = !!cap.isWebGL2;
    aniso = Math.min(4, cap.getMaxAnisotropy ? cap.getMaxAnisotropy() : 1);
    Q.init();
  }

  const fx = () => (G.Settings ? G.Settings.fx : 2);
  const mobile = () => !!(G.U.IOS || (G.Settings && G.Settings.touch));

  /*
   * Calidad automática (pedido: «el iPhone importa»). q: la parte de la resolución nativa que se dibuja (1 = toda).
   * La calidad de los ajustes pone el tope (alta: hasta 2 px físicos por px CSS; media: 1,5; baja: 1 y sin antialias)
   * y un tope de píxeles por fotograma (menos en móvil). tune(dt) mira lo que tardan los fotogramas mientras paseas: si van
   * por debajo de ~40 FPS un par de segundos, baja un escalón; si van holgados un rato, sube. El escalón se recuerda.
   */
  const Q = {
    STEPS: [1, 0.85, 0.7, 0.58, 0.48], i: 0, ema: 1 / 60, slow: 0, fast: 0, fixed: null,
    init() { let i = 0; try { i = +localStorage.getItem('ps.vil.q') || 0; } catch (e) { /* nada */ } this.i = Math.max(0, Math.min(this.STEPS.length - 1, i | 0)); this.ema = 1 / 60; this.slow = this.fast = 0; },
    get q() { return this.fixed != null ? this.fixed : this.STEPS[this.i]; },
    // (12-11-2026) Máxima (PC): hasta 2,5 px físicos por px CSS y 6,5 M px por fotograma.
    dprCap() { const f = fx(); return f === 0 ? 1 : f === 1 ? 1.5 : G.Settings && G.Settings.max ? 2.5 : 2; },
    maxPx() { const f = fx(), m = mobile(); return (f === 0 ? 0.9e6 : f === 1 ? (m ? 1.4e6 : 2.4e6) : (m ? 2.2e6 : G.Settings && G.Settings.max ? 6.5e6 : 4.2e6)); },
    save() { try { localStorage.setItem('ps.vil.q', String(this.i)); } catch (e) { /* nada */ } },
    tune(dt) {
      if (this.fixed != null || !(dt > 0) || dt > 0.25) return;
      this.ema += (dt - this.ema) * 0.08;
      if (this.ema > 1 / 40) { this.slow += dt; this.fast = 0; } else if (this.ema < 1 / 56) { this.fast += dt; this.slow = 0; } else { this.slow = Math.max(0, this.slow - dt); this.fast = 0; }
      if (this.slow > 1.6 && this.i < this.STEPS.length - 1) { this.i++; this.slow = 0; this.ema = 1 / 50; this.save(); }
      else if (this.fast > 8 && this.i > 0) { this.i--; this.fast = 0; this.save(); }
    }
  };

  // ---------------- texturas ----------------
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) { G.U.freeCanvas(c); throw Error('sin lienzo'); }
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  /**
   * Textura de pixel art (suelo, letreros, pantallas, puertas): sin mipmaps. Con WebGL2 se filtra lineal y el material
   * la muestrea nítida (crisp); si no, al píxel más cercano.
   */
  function tex(c, repeat = false, keep = false) {
    const t = new T.CanvasTexture(c);
    t.magFilter = t.minFilter = gl2 ? T.LinearFilter : T.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    // (iPhone) El lienzo ya no hace falta al subirla: se suelta (si se pierde el contexto, se rehace todo).
    if (!keep) t.onUpdate = () => { G.U.freeCanvas(c); t.onUpdate = null; };
    t.userData.crisp = true;
    disposables.push(t);
    return t;
  }
  /** Si el material lleva pixel art (texturas de tex()), se muestrea nítido. */
  const fin = m => ((m.map && m.map.userData.crisp) || (m.emissiveMap && m.emissiveMap.userData.crisp) ? crisp(m) : m);
  /** Textura suave de un modelo (madera, corteza, hojas...): filtrado lineal con mipmaps y anisotropía. */
  function stex(c, repeat = true) {
    const t = new T.CanvasTexture(c);
    t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = aniso;
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.onUpdate = () => { G.U.freeCanvas(c); t.onUpdate = null; };
    disposables.push(t);
    return t;
  }
  /*
   * Muestreo nítido del pixel art (crisp): cada texel se ve como un cuadrado limpio a cualquier escala (también con la
   * perspectiva, que cambia el tamaño con la altura), con el borde suavizado medio píxel de pantalla. Ni borroso como el
   * lineal ni con píxeles de distinto ancho como el más cercano. Se cambia el muestreo del mapa y del mapa emisivo de los
   * materiales de three.js (crisp(m)) y de los shaders propios (CRISP).
   */
  const CRISP = [
    'vec4 crispTex(sampler2D t, vec2 uv) {',
    '  vec2 sz = vec2(textureSize(t, 0)), p = uv * sz, s = floor(p + 0.5);',
    '  vec2 d = max(fwidth(p), vec2(1e-4));',
    '  p = s + clamp((p - s) / d, -0.5, 0.5);',
    '  return texture2D(t, p / sz);',
    '}'].join('\n');
  /*
   * (12-11-2026) Filtro «Pokémon más nítidos» (pixfilter.js) en la aldea: Scale2x / EPX en el propio shader, sin memoria
   * de más. Cada texel se parte en cuatro y cada cuarto copia a un vecino si está en una diagonal (redondea los bordes sin
   * desenfocar ni inventar colores). Sólo con WebGL2 (textureSize).
   */
  const EPX_GLSL = [
    'bool pxEq(vec4 a, vec4 b) { return (a.a < 0.5 && b.a < 0.5) || (a.a >= 0.5 && b.a >= 0.5 && dot(a.rgb - b.rgb, a.rgb - b.rgb) < 0.002); }',
    'vec4 crispTex(sampler2D t, vec2 uv) {',
    '  vec2 sz = vec2(textureSize(t, 0)), p = uv * sz, c = floor(p), f = p - c, d = 1.0 / sz, q = (c + 0.5) * d;',
    '  vec4 P = texture2D(t, q), A = texture2D(t, q + vec2(0.0, d.y)), D = texture2D(t, q - vec2(0.0, d.y));',
    '  vec4 B = texture2D(t, q + vec2(d.x, 0.0)), C = texture2D(t, q - vec2(d.x, 0.0));',
    '  bool l = f.x < 0.5, u = f.y > 0.5;',          // (la textura va con flipY: arriba es +y)
    '  if (u && l && pxEq(C, A) && !pxEq(C, D) && !pxEq(A, B)) return A;',
    '  if (u && !l && pxEq(A, B) && !pxEq(A, C) && !pxEq(B, D)) return B;',
    '  if (!u && l && pxEq(D, C) && !pxEq(D, B) && !pxEq(C, A)) return C;',
    '  if (!u && !l && pxEq(B, D) && !pxEq(B, A) && !pxEq(D, C)) return D;',
    '  return P;',
    '}'].join('\n');
  function pixSmooth(m) {
    if (!gl2) return crisp(m);
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', EPX_GLSL + '\nvoid main() {')
        .replace('#include <map_fragment>', '#ifdef USE_MAP\n  diffuseColor *= crispTex(map, vMapUv);\n#endif');
    };
    m.customProgramCacheKey = () => 'epx';
    return m;
  }
  function crisp(m) {
    if (!gl2) return m;
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', CRISP + '\nvoid main() {')
        .replace('#include <map_fragment>', '#ifdef USE_MAP\n  diffuseColor *= crispTex(map, vMapUv);\n#endif')
        .replace('#include <emissivemap_fragment>', '#ifdef USE_EMISSIVEMAP\n  totalEmissiveRadiance *= crispTex(emissiveMap, vEmissiveMapUv).rgb;\n#endif');
    };
    m.customProgramCacheKey = () => 'crisp';
    return m;
  }
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const css = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => css(hex(h).map(v => k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  const H = (x, y, s) => G.VILLAGE.hash(x, y, s);
  /** Rampa de 4 tonos (oscuro → claro) a partir de uno. */
  const ramp = (h) => [shade(h, -0.45), shade(h, -0.22), h, shade(h, 0.3)];
  /** Pinta w×h píxeles con fn(x, y) → color (o null: transparente). */
  function pix(w, h, fn) {
    if (dry) return canvas(1, 1)[0];
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

  // ---- texturas suaves de los modelos (pulido 12-11-2026) ----
  /** Pinta w×h con fn(x, y) → [r, g, b] (0..255, sin redondear). Sin transparencia. */
  function soft(w, h, fn) {
    if (dry) return canvas(1, 1)[0];
    const t0 = performance.now();
    const [c, g] = canvas(w, h);
    const id = g.createImageData(w, h), d = id.data;
    // (Se guardan los píxeles: al volver de una partida la aldea se rehace sin volver a pintarlas.)
    const mk = memoKey ? memoKey + '|' + (memoN++) + '|' + w + 'x' + h : '', old = mk && MEMO.get(mk);
    if (old) d.set(old);
    else {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = fn(x, y), o = (y * w + x) * 4;
        d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = 255;
      }
      if (mk) MEMO.set(mk, d.slice());
    }
    g.putImageData(id, 0, 0);
    PERF.soft += performance.now() - t0; PERF.px += w * h;
    return c;
  }
  const PERF = { soft: 0, px: 0 };
  /** Píxeles ya pintados de las texturas suaves, por material (memoKey: el material que se está haciendo). */
  const MEMO = new Map();
  let memoKey = '', memoN = 0;
  const memo = (key, make) => { memoKey = key; memoN = 0; try { return make(); } finally { memoKey = ''; } };
  const RGB = new Map();
  const rgb = h => { let v = RGB.get(h); if (!v) { v = hex(h); RGB.set(h, v); } return v; };
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  /** Tono continuo de una rampa de colores (0..1). */
  function tone(tones, t) {
    t = sat(t) * (tones.length - 1);
    const i = Math.min(tones.length - 2, Math.floor(t));
    return mixc(rgb(tones[i]), rgb(tones[i + 1]), t - i);
  }
  /** Ruido suave periódico (se repite cada `per` px sin costura): tres octavas. */
  function pn(x, y, s, seed, per) {
    const one = (k, sd) => {
      const ps = per / k, fx0 = x / k, fy0 = y / k, x0 = Math.floor(fx0), y0 = Math.floor(fy0), tx = fx0 - x0, ty = fy0 - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), m = v => ((v % ps) + ps) % ps;
      const a = H(m(x0), m(y0), sd), b = H(m(x0 + 1), m(y0), sd), c = H(m(x0), m(y0 + 1), sd), d = H(m(x0 + 1), m(y0 + 1), sd);
      return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    };
    return one(s, seed) * 0.6 + one(s / 2, seed + 1) * 0.28 + one(s / 4, seed + 2) * 0.12;
  }
  /** Lo oscuro de una junta a distancia d (px) de su centro, de ancho w, con el borde suavizado. */
  const seam = (d, w) => 1 - sstep(w * 0.5 - 0.6, w * 0.5 + 0.6, Math.abs(d));

  const WOOD = ['#3a2418', '#52341f', '#6c4628', '#8a5e38'];
  const STONE = ['#2e3338', '#424a50', '#58626a', '#727e86'];
  const BARK = ['#1e1612', '#2c201a', '#3c2c22', '#4e3a2c'];
  const LEAF = ['#123430', '#1b4c3c', '#256650', '#3a8462'];
  const MOSS = ['#13281f', '#1a3428', '#22412f', '#2d5238'];
  const METAL = ['#3a4450', '#55606c', '#76828e', '#a4b0ba'];
  const GOLD = ['#8a5a12', '#c08a1e', '#e8b838', '#fff08a'];
  const CYAN = '#5ff0ff', PINK = '#ff7ad8', GREEN = '#7cff7a', AMBER = '#ffc04a', VIOLET = '#b07aff';

  // ---------------- materiales ----------------
  const mats = new Map();
  function lambert(key, make, opts = {}) {
    let m = mats.get(key);
    if (m) return m;
    const map = make ? memo('l' + key, make) : null, o = Object.assign({}, opts);
    delete o.flat;
    m = fin(new T.MeshLambertMaterial(Object.assign({ map, side: T.FrontSide, shadowSide: T.DoubleSide }, o)));
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
    mats.set(key, m);
    disposables.push(m);
    glowList.push({ m, base, ph: H(col.length, base * 10, hex(col)[0]) * 6.28 });
    return m;
  }
  /** Lo mismo con textura (lo brillante de la textura brilla: emissiveMap). */
  function glowTexM(key, make, col, base = 1, opts = {}) {
    let m = mats.get(key);
    if (m) return m;
    const t = memo('t' + key, make);
    m = fin(new T.MeshLambertMaterial(Object.assign({ map: t, emissive: new T.Color(col), emissiveMap: t, emissiveIntensity: base, side: T.FrontSide }, opts)));
    mats.set(key, m);
    disposables.push(m);
    glowList.push({ m, base, ph: H(key.length, 3, 7) * 6.28 });
    return m;
  }
  /** Sin luz: siempre del mismo color (hologramas, puertas encendidas). */
  function basic(key, make, opts = {}) {
    let m = mats.get(key);
    if (m) return m;
    m = fin(new T.MeshBasicMaterial(Object.assign({ map: make ? memo('b' + key, make) : null }, opts)));
    mats.set(key, m);
    disposables.push(m);
    return m;
  }
  const P2 = Math.PI * 2;
  // Texturas suaves (128 px, se repiten sin costura): las juntas y vetas con el borde suavizado y tonos continuos.
  function planks(S = 128, tones = WOOD, seed = 40) {
    return soft(S, S, (x, y) => {
      const r = y >> 5, ly = y - r * 32, off = (H(r, seed, 40) * 4 | 0) * 16, jx = (x + off) % 64;
      const n = pn(x, y, 24, seed + 1 + r, S), grain = 0.5 + 0.5 * Math.sin((y + n * 16) * P2 * 12 / S + r * 1.7);
      let c = tone(tones, 0.32 + grain * 0.32 + (n - 0.5) * 0.55 + (H(r, (x + off) >> 6, seed + 3) - 0.5) * 0.25);
      if (ly < 4) c = mixc(c, rgb(tones[3]), (4 - ly) / 4 * 0.45);
      const dark = Math.max(seam(Math.min(ly, 32 - ly), 3), seam(Math.min(jx, 64 - jx), 3));
      return mixc(c, rgb(shade(tones[0], -0.35)), dark * 0.85);
    });
  }
  function bricks(S = 128, tones = STONE, mossy = false) {
    return soft(S, S, (x, y) => {
      const r = y >> 5, ly = y - r * 32, off = r % 2 ? 32 : 0, bx = ((x + off) % S) >> 6, lx = (x + off) % 64;
      const n = pn(x, y, 20, 51, S);
      let c = tone(tones, 0.4 + (H(bx, r, 52) - 0.5) * 0.45 + (n - 0.5) * 0.6);
      const ed = Math.min(ly, 32 - ly, lx, 64 - lx);
      if (ly < 6 || lx < 6) c = mixc(c, rgb(tones[3]), (1 - Math.min(ly, lx) / 6) * 0.35);
      c = mixc(c, rgb(shade(tones[0], -0.4)), seam(ed, 3.4) * 0.9);
      if (mossy) {
        const m = pn(x, y, 28, 53, S);
        if (m > 0.52) c = mixc(c, tone(MOSS, (m - 0.52) * 3.4), sstep(0.52, 0.6, m));
        // Puntitos de musgo que brillan (suaves).
        const cx = (x >> 4), cy = (y >> 4), h2 = H(cx, cy, 54);
        if (m > 0.55 && h2 > 0.8) { const dx = x - (cx * 16 + 8), dy = y - (cy * 16 + 8), dd = Math.hypot(dx, dy); c = mixc(c, rgb('#9affc8'), (1 - sstep(0.5, 2.6, dd)) * 0.95); }
      }
      return c;
    });
  }
  /** Corteza: vetas verticales onduladas con grietas oscuras. */
  function bark(S = 128, tones = BARK, seed = 5) {
    return soft(S, S, (x, y) => {
      const n = pn(x, y, 32, seed, S), w = 0.5 + 0.5 * Math.sin(x * P2 * 9 / S + n * 7 + Math.sin(y * P2 * 2 / S) * 1.3);
      let c = tone(tones, 0.2 + w * 0.65 + (pn(x, y, 8, seed + 9, S) - 0.5) * 0.35);
      if (w < 0.16) c = mixc(c, rgb(shade(tones[0], -0.4)), (0.16 - w) / 0.16 * 0.9);
      return c;
    });
  }
  /** Follaje: manchas de hojas en tonos continuos con brillos claros en lo alto de cada mata. */
  function foliage(S = 128, tones = LEAF, seed = 21) {
    return soft(S, S, (x, y) => {
      const a = pn(x, y, 22, seed, S), b = pn(x, y, 7, seed + 7, S);
      let c = tone(tones, a * 0.9 + (b - 0.5) * 0.5);
      if (b > 0.68) c = mixc(c, rgb(shade(tones[3], 0.25)), (b - 0.68) * 2.2);
      if (b < 0.3) c = mixc(c, rgb(shade(tones[0], -0.3)), (0.3 - b) * 1.6);
      return c;
    });
  }
  /** Escamas de hojas grandes (las vainas y techos): n columnas con su costilla oscura, del color c. */
  function scales(n, c, hpx = 128, seed = 0) {
    const r = ramp(c), sw = 32, sh = 20, W = n * sw, Hh = 120;
    return soft(W, Hh, (x, y) => {
      const lx = x % sw, row = (y / sh) | 0, off = (row % 2) * sw / 2, sx = (x + off) % sw, sy = y - row * sh;
      const k = Math.abs(sx - sw / 2) / (sw / 2), edge = sh - 6 * (1 - k * k) - 1;
      let col = tone(r, 0.32 + (1 - sy / sh) * 0.5 - k * k * 0.18 + (pn(x, y, 10, 61 + seed, W) - 0.5) * 0.22);
      col = mixc(col, rgb(r[0]), seam(sy - edge, 2.2) * 0.75);                         // borde de la escama
      col = mixc(col, rgb(shade(r[0], -0.35)), seam(Math.min(lx, sw - lx), 4) * 0.95);  // costilla de madera
      return col;
    });
  }
  /** Sombrero de seta: claro arriba, oscuro en el borde, con lunares suaves (blancos: brillan con el emisivo). */
  function capTex(c, seed = 0, spots = true) {
    const S = 64, r = [shade(c, -0.45), shade(c, -0.2), c, shade(c, 0.35)];
    return soft(S * 2, S, (x, y) => {
      const t = y / S;
      let col = tone(r, 0.95 - t * 0.85 + (pn(x, y, 12, 70 + seed, S * 2) - 0.5) * 0.2);
      if (spots && t < 0.8) {
        const cw = 21, cx = Math.floor(x / cw), cy = Math.floor(y / 16), h1 = H(cx, cy, 71 + seed);
        if (h1 > 0.45) {
          const px = cx * cw + 4 + H(cx, cy, 72) * 13, py = cy * 16 + 4 + H(cx, cy, 73) * 8, rr = 2.2 + H(cx, cy, 74) * 2.2;
          col = mixc(col, [255, 255, 255], (1 - sstep(rr - 0.8, rr + 0.8, Math.hypot(x - px, y - py))) * 0.92);
        }
      }
      return col;
    });
  }
  /** Madera tallada (tótems): bandas con surcos y ojos hundidos. */
  function carvedTex() {
    return soft(64, 256, (x, y) => {
      const ly = y % 64, n = pn(x, y, 18, 75, 64);
      let c = tone(WOOD, 0.45 + (n - 0.5) * 0.5 + 0.15 * Math.sin(x * P2 / 64));
      c = mixc(c, rgb(shade(WOOD[0], -0.4)), seam(Math.min(ly, 64 - ly), 5) * 0.9);
      for (const ex of [18, 46]) { const d = Math.hypot((x - ex) / 1.3, ly - 24); c = mixc(c, [12, 10, 10], 1 - sstep(4, 6, d)); }
      c = mixc(c, rgb(shade(WOOD[0], -0.3)), seam(ly - 42, 3) * (1 - sstep(16, 20, Math.abs(x - 32))) * 0.9);
      return c;
    });
  }
  /** Cara de tótem de la choza (un bloque). */
  function faceTex() {
    return soft(64, 64, (x, y) => {
      let c = tone(WOOD, 0.5 + (pn(x, y, 14, 76, 64) - 0.5) * 0.5 + (y < 8 ? 0.3 : 0));
      for (const ex of [20, 44]) c = mixc(c, [14, 10, 10], 1 - sstep(4, 6, Math.hypot(x - ex, y - 22)));
      c = mixc(c, [14, 10, 10], seam(y - 42, 4) * (1 - sstep(14, 18, Math.abs(x - 32))));
      return c;
    });
  }
  /** Anillos del tocón. */
  const ringsTex = () => soft(64, 64, (x, y) => { const r = Math.hypot(x - 31.5, y - 31.5) + pn(x, y, 12, 77, 64) * 3; return tone(WOOD, 0.75 - 0.35 * (0.5 + 0.5 * Math.cos(r * 0.9)) - (r > 29 ? 0.4 : 0)); });
  /** Caja de la tribu: tablas con marco de metal y la cruz. */
  const crateTex = () => soft(64, 64, (x, y) => {
    let c = tone(WOOD, 0.45 + (pn(x, y, 12, 78, 64) - 0.5) * 0.5);
    const ed = Math.min(x, y, 63 - x, 63 - y);
    c = mixc(c, rgb(shade(WOOD[0], -0.3)), Math.max(seam(x - y, 6), seam(x + y - 63, 6)) * 0.8);
    if (ed < 6) c = mixc(tone(METAL, 0.5 + (ed < 2 ? -0.3 : 0.1)), c, sstep(5, 6.5, ed));
    return c;
  });
  /**
   * Losa de arriba del Altar del Portal (vista desde arriba, en un disco): anillos de losas de piedra oscura, un anillo de
   * runas que brilla (cian) y rayas hacia el centro (rosa). Lo claro brilla (emissiveMap: la misma textura).
   */
  const daisTex = () => soft(256, 256, (x, y) => {
    const dx = x - 127.5, dy = y - 127.5, r = Math.hypot(dx, dy) / 128, a = Math.atan2(dy, dx), n = pn(x, y, 24, 61, 256);
    const ring = Math.floor(r * 6), cells = 8 + ring * 6, ca = ((a / P2 + 1) * cells + ring * 0.5) % 1;
    let c = tone(['#1e2430', '#2a3240', '#384252', '#465266'], 0.35 + n * 0.4 + (H(ring, Math.floor((a / P2 + 1) * cells), 62) - 0.5) * 0.3);
    c = mixc(c, [10, 12, 18], Math.max(seam(Math.min(ca, 1 - ca) * 40, 2.4), seam(((r * 6) % 1) * 30, 2)) * 0.8);
    // Anillo de runas (rayas cortas con huecos) y su borde.
    const rr = Math.abs(r - 0.82);
    if (rr < 0.055) { const k = ((a / P2 + 1) * 40) % 1; c = mixc(c, [12, 16, 24], 0.8); if (k > 0.18 && k < 0.7 && H(Math.floor((a / P2 + 1) * 40), 3, 63) > 0.25) c = mixc(c, [110, 240, 255], 1 - sstep(0.03, 0.05, rr)); }
    c = mixc(c, [150, 250, 255], seam((r - 0.9) * 256, 2.4) * 0.9);
    // Rayas rosas hacia el círculo de en medio y su aro.
    const sp = ((a / P2 + 1) * 6) % 1;
    if (r > 0.34 && r < 0.72) c = mixc(c, [255, 130, 220], seam(Math.min(sp, 1 - sp) * 60, 2) * 0.85);
    c = mixc(c, [255, 160, 230], seam((r - 0.3) * 256, 2.6));
    return c;
  });
  /** Techos de la choza. */
  const crysTex = col => soft(128, 128, (x, y) => {
    const a = ((x + y * 2) % 64 + 64) % 64, b = ((x * 3 - y) % 44 + 44) % 44, n = pn(x, y, 32, 79, 128);
    let c = tone([shade(col, -0.5), shade(col, -0.2), col, shade(col, 0.4)], 0.3 + n * 0.6);
    return mixc(c, [255, 255, 255], Math.max(seam(Math.min(a, 64 - a), 2.2), seam(Math.min(b, 44 - b), 2.2)) * 0.9);
  });
  const solarTex = (col, lc) => soft(128, 128, (x, y) => {
    const lx = x % 32, ly = y % 32, ed = Math.min(lx, 32 - lx, ly, 32 - ly);
    const c = tone([shade(col, -0.35), col, shade(col, 0.3)], 0.3 + (ly / 32) * 0.4 + (H(x >> 5, y >> 5, 80) - 0.5) * 0.2);
    return mixc(c, rgb(lc), seam(ed, 2.4));
  });
  const strawTex = col => soft(128, 128, (x, y) => {
    const ly = y % 16, w = 0.5 + 0.5 * Math.sin(x * P2 * 20 / 128 + pn(x, y, 16, 31, 128) * 5);
    return mixc(tone(ramp(col), 0.3 + w * 0.6 - ly / 40), rgb(ramp(col)[0]), seam(ly - 15, 2.4) * 0.8);
  });
  const petalRoofTex = col => soft(128, 128, (x, y) => {
    const row = y >> 5, sx = (x + (row % 2) * 16) % 32, ly = y % 32, k = Math.abs(sx - 16) / 16;
    let c = tone(ramp(col), 0.85 - ly / 40 - k * k * 0.3);
    c = mixc(c, rgb(ramp(col)[0]), seam(ly - (30 - 6 * (1 - k * k)), 2.4) * 0.8);
    return mixc(c, [255, 255, 255], seam(sx - 16, 1.6) * (ly > 4 && ly < 24 ? 0.8 : 0));
  });
  const rootsTex = () => soft(128, 128, (x, y) => {
    const k = (x + Math.sin(y * P2 * 3 / 128) * 8 + 128) % 24, n = pn(x, y, 16, 82, 128);
    return mixc(tone(BARK, 0.35 + 0.5 * Math.sin(k / 24 * Math.PI) + (n - 0.5) * 0.3), rgb(shade(BARK[0], -0.4)), seam(Math.min(k, 24 - k), 4) * 0.9);
  });
  const woodM = () => lambert('wood', () => stex(planks()));
  const stoneM = () => lambert('stone', () => stex(bricks()));
  const mossStoneM = () => glowTexM('mstone', () => stex(bricks(128, STONE, true)), '#ffffff', 0.18);
  const barkM = () => lambert('bark', () => stex(bark()));
  const leafM = () => lambert('leaf', () => stex(foliage()));
  const goldM = () => lambert('gold', () => stex(soft(64, 64, (x, y) => tone(GOLD, 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(y * P2 * 3 / 64)) + (pn(x, y, 16, 31, 64) - 0.5) * 0.3))), { emissive: new T.Color(0x4a3000) });
  const metalM = () => lambert('metal', () => stex(soft(128, 128, (x, y) => {
    const lx = x % 64, ly = y % 64, ed = Math.min(lx, 64 - lx, ly, 64 - ly);
    let c = tone(METAL, 0.45 + (H(x >> 6, y >> 6, 44) - 0.5) * 0.3 + (pn(x, y * 0.25, 16, 45, 128) - 0.5) * 0.18);
    c = mixc(c, rgb(METAL[0]), seam(ed, 2.6) * 0.85);
    for (const [rx, ry] of [[8, 8], [56, 8], [8, 56], [56, 56]]) { const d = Math.hypot(lx - rx, ly - ry); if (d < 4) c = mixc(c, tone(METAL, 1 - d / 5), 1 - sstep(2.4, 3.6, d)); }
    return c;
  })));
  const paleM = () => lambert('pale', () => stex(soft(64, 128, (x, y) => tone(['#8a8494', '#a8a2b0', '#c6c0cc', '#e2dce6'], 0.45 + (pn(x * 3 % 64, y, 18, 33, 64) - 0.5) * 0.7 + Math.sin(x * P2 * 6 / 64) * 0.08))));

  // ---------------- geometría: lo quieto, juntado por material ----------------
  // Cada pieza se apunta con su material y su matriz; al acabar, una malla por material (pocas llamadas de dibujo) y otra
  // con los contornos (casco invertido del tono oscuro del mapa).
  let batch = null, hulls = [];
  /*
   * Lo que choca (pulido 12-11-2026: «el personaje atraviesa ciertas cosas»). Cada pieza que toca la franja del cuerpo
   * de los Pokémon (de 0 a FOOT_H de alto) y abulta más de FOOT_MIN deja su huella en el suelo: el casco convexo de sus
   * vértices (y de los cortes de sus aristas) por debajo de FOOT_H. Se apunta con el sitio o decorado al que pertenece
   * (curId). Se pueden pisar: lo plano (planos: puertas, letreros, lianas, helechos), lo que va por encima de FOOT_H (copas,
   * cables) y lo que se marca con walk. solid: choca aunque sea bajo (barandillas de una valla).
   */
  const FOOT_H = 48, FOOT_MIN = 14;
  let solidList = [], curId = '';
  function foot(g, o, plane) {
    if (o.walk || !curId || (plane && !o.solid)) return;
    const p = g.attributes.position.array, n = p.length / 3;
    let maxY = -1e9, minY = 1e9;
    for (let i = 0; i < n; i++) { const y = p[i * 3 + 1]; if (y > maxY) maxY = y; if (y < minY) minY = y; }
    if (minY > FOOT_H || (maxY < FOOT_MIN && !o.solid)) return;
    const pts = [];
    for (let i = 0; i < n; i++) if (p[i * 3 + 1] <= FOOT_H) pts.push([p[i * 3], p[i * 3 + 2]]);
    // Cortes de las aristas con el plano FOOT_H (un lado alto de un cilindro, por ejemplo).
    for (let t = 0; t + 2 < n; t += 3) for (let e = 0; e < 3; e++) {
      const a = t + e, b = t + (e + 1) % 3, ya = p[a * 3 + 1], yb = p[b * 3 + 1];
      if ((ya - FOOT_H) * (yb - FOOT_H) < 0) { const k = (FOOT_H - ya) / (yb - ya); pts.push([p[a * 3] + (p[b * 3] - p[a * 3]) * k, p[a * 3 + 2] + (p[b * 3 + 2] - p[a * 3 + 2]) * k]); }
    }
    if (pts.length < 3) return;
    const h = G.VILLAGE.hull(pts);
    if (h.length >= 3) solidList.push({ id: curId, pts: h });
  }
  function put(geo, mat, at, o = {}) {
    const m = at instanceof T.Matrix4 ? at : compose(at);
    const plane = geo.type === 'PlaneGeometry' || geo.type === 'CircleGeometry';
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    foot(g, o, plane);
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
  // (Pulido 12-11-2026) Más segmentos que antes (×2, ×1,4 en calidad baja): sin aristas de polígono en lo redondo.
  const SEG = () => (fx() === 0 ? 1.4 : 2);
  const seg = n => Math.max(3, Math.round(n * SEG()));
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, n = 8, open = false) => new T.CylinderGeometry(rt, rb, h, seg(n), 1, open);
  const cone = (r, h, n = 8, open = false) => new T.ConeGeometry(r, h, seg(n), 1, open);
  /** Bola suave (d: el detalle de antes; ahora uno más, y las piedras con caras siguen con d = 0). */
  const ball = (r, d = 1) => new T.IcosahedronGeometry(r, d === 0 ? 1 : Math.min(3, d + (fx() === 0 ? 1 : 2)));
  const cap = (r, n = 10) => new T.SphereGeometry(r, seg(n), seg(5), 0, Math.PI * 2, 0, Math.PI / 2);
  const lathe = (pts, n = 10) => new T.LatheGeometry(smoothProfile(pts).map(([x, y]) => new T.Vector2(x, y)), seg(n));
  const torus = (R, r, a = 4, b = 20, arc) => new T.TorusGeometry(R, r, seg(a), seg(b), arc);
  /** Perfil de torno más redondo: puntos intermedios con una curva (Catmull-Rom) entre los de siempre. */
  function smoothProfile(pts) {
    if (pts.length < 3) return pts;
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 3; k++) {
        const t = k / 3, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([Math.max(0, f(p0[0], p1[0], p2[0], p3[0])), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
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
    // (La charca va aparte, redonda: aquí su sitio es suelo.)
    const at = (tx, ty) => { const v = VG.terrainAt(tx, ty); return v === 2 ? 0 : v; };
    const grassAt = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < Hh && !!b.grass[ty * W + tx];
    const [cv, g] = canvas(W * A, Hh * A);
    for (let cy = 0; cy * N < Hh; cy++) for (let cx = 0; cx * N < W; cx++) {
      const c = G.Tileset.paintChunk(cx, cy, N, at, BI, seed, true, grassAt);
      if (!c) throw Error('sin suelo');
      g.drawImage(c, cx * N * A, cy * N * A);
      G.U.freeCanvas(c);
    }
    const glow = forest(g, b, A);
    return { ground: cv, glow };
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
    // (13-11-2026, «se ve demasiado oscuro») Caminos de tierra más clara y plaza de losas más claras: se leen de noche.
    const DIRT = ['#3a2a1e', '#4a3626', '#5a4430', '#6e543a'], EDGE = '#22180f';
    const SLATE = ['#262e38', '#323c48', '#404c5a', '#4e5c6c'];
    const sample = (arr, fx, fy) => {
      const x = fx - 0.5, y = fy - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
      const v = (i, j) => (i < 0 || j < 0 || i >= W || j >= Hh) ? 0 : arr[j * W + i];
      return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
    };
    const P = VG.PLAZA, gl = [CYAN, GREEN, CYAN, PINK];
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const o = (py * w + px) * 4, fx = px / A, fy = py / A, tx = fx | 0, ty = fy | 0;
      if (VG.terrainAt(tx, ty) === 1) {
        // (12-11-2026) Bajo los árboles del borde: suelo de bosque oscuro, musgo y hojarasca (antes, la pared del tileset).
        const m = vn(px, py, 10, 86) * 0.6 + vn(px, py, 3, 87) * 0.4, k = H(px, py, 88);
        set(o, m > 0.62 ? MOSS[1] : m > 0.4 ? MOSS[0] : k < 0.5 ? '#0e1a16' : '#121f1a');
        if (m > 0.66 && H(px >> 1, py >> 1, 89) > 0.992) { const c = H(px >> 2, py >> 2, 90) > 0.5 ? CYAN : GREEN; set(o, shade(c, -0.3)); lit(o, shade(c, -0.35)); }
        continue;
      }
      // Plaza: losas oscuras irregulares y un anillo de runas que brilla.
      const dd = Math.hypot(fx - P.x, fy - P.y);
      if (dd < P.r + (H(px >> 2, py >> 2, 91) - 0.5) * 0.18) {
        const row = Math.floor(py / 6), sx = Math.floor(px / 7 + (row % 2) * 0.5);
        const joint = (px % 7 === 0 && !(row % 2)) || (px % 7 === 3 && row % 2) || py % 6 === 0;
        const n = H(sx, row, 92);
        set(o, joint ? '#141a20' : SLATE[n < 0.3 ? 1 : n < 0.85 ? 2 : 3]);
        if (!joint) lit(o, '#0a0e14');
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
        lit(o, '#120d09');                 // (un poco de luz propia: el camino no se pierde de noche)
        if (p + (n - 0.5) * 0.34 < 0.5) {
          set(o, EDGE); lit(o, '#000000');
          // Piedras que brillan en el borde (de dos en dos píxeles).
          if (H(px >> 1, py >> 1, 95) > 0.96) { const c = gl[(H(px >> 3, py >> 3, 96) * 4) | 0]; set(o, shade(c, -0.2)); lit(o, c); }
        }
        continue;
      }
      // Musgo a manchas (y algún punto que brilla).
      const m = vn(px, py, 12, 81) * 0.6 + vn(px, py, 4, 82) * 0.4;
      if (m > 0.3) {
        const k = H(px, py, 83);
        set(o, MOSS[m > 0.68 ? 3 : m > 0.5 ? 2 : k < 0.3 ? 0 : 1]);
        if (m > 0.62 && H(px >> 1, py >> 1, 84) > 0.994) { const c = H(px >> 2, py >> 2, 85) > 0.5 ? GREEN : CYAN; set(o, c); lit(o, shade(c, -0.25)); }
      }
    }
    g.putImageData(img, 0, 0);
    gg.putImageData(gimg, 0, 0);
    return gc;
  }

  function buildGround() {
    const VG = V(), W = VG.W, Hh = VG.H;
    const { ground, glow } = paintGround();
    const gt = tex(ground), et = tex(glow);
    const mat = fin(new T.MeshLambertMaterial({ map: gt, emissive: new T.Color(0xffffff), emissiveMap: et, emissiveIntensity: 1 }));
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
    buildForest();
  }

  /*
   * (12-11-2026, el dueño: «quiero que los bordes de la aldea cambien a ser un montón de árboles») El borde es un bosque
   * denso del bosque bioluminiscente: pinos, árboles de copa redonda con vainas que brillan, setas gigantes que se
   * encienden de noche y matas por delante. Antes era una pared levantada con el dibujo del tileset y unos pinos encima.
   *  - Instancing: una malla por tipo de planta (4) y su contorno (4), con un solo material (una textura atlas: corteza,
   *    agujas, hojas y sombreros) y un color por planta. 8 llamadas de dibujo para todo el bosque, con cualquier número de
   *    árboles (antes, la pared, su cara y el lote de pinos con su contorno).
   *  - Choca como se ve: los árboles nacen en las casillas de bosque (terrainAt = 1, que son las que chocan) y cada casilla
   *    de bosque que da a la aldea lleva al menos una planta pegada a su borde (forestPlan; tests/village-solids.test.cjs).
   *  - Abajo del todo, sólo matas y setas bajas (los árboles taparían el camino del sur).
   *  - Más árboles con más calidad (en Máxima, una vez y media; en móvil o calidad baja, menos). Se mecen con el viento
   *    (en el shader: no cuesta) y lo que brilla lleva su halo.
   */
  function buildForest() {
    const VG = V(), plan = forestPlan(VG, G.Settings && G.Settings.max ? 1.5 : mobile() || fx() === 0 ? 0.6 : 1);
    // Atlas 256×256: corteza | agujas / hojas | sombrero (arriba, brilla blanco) y vainas (abajo, brillan cian).
    let atlas = null, glowA = null;
    if (!dry) {
      const [ac, ag] = canvas(256, 256), [ec, eg] = canvas(256, 256);
      ag.drawImage(memo('fbark', () => bark(128, ['#1a1410', '#261c16', '#34261c', '#463426'], 9)), 0, 0);
      ag.drawImage(memo('fpine', () => foliage(128, ['#0b2426', '#123638', '#1b4e4a', '#2c6e5c'], 23)), 128, 0);
      ag.drawImage(memo('fleaf', () => foliage(128, ['#0f2c32', '#174444', '#205e54', '#33806a'], 29)), 0, 128);
      ag.drawImage(memo('fcap', () => capTex('#e8e4f0', 5)), 128, 128, 128, 64);
      ag.fillStyle = '#bff8ff'; ag.fillRect(128, 192, 128, 64);
      eg.fillStyle = '#000000'; eg.fillRect(0, 0, 256, 256);
      eg.globalAlpha = 0.55; eg.drawImage(ac, 128, 128, 128, 64, 128, 128, 128, 64); eg.globalAlpha = 1;
      eg.fillStyle = '#5ff0ff'; eg.fillRect(128, 192, 128, 64);
      // (Un poco de luz en las hojas, como el musgo que brilla: casi nada, para que de noche no sea una mancha negra.)
      eg.globalAlpha = 0.07; eg.drawImage(ac, 0, 128, 128, 128, 0, 128, 128, 128); eg.globalAlpha = 1;
      atlas = stex(ac, false); glowA = stex(ec, false);
    }
    const mat = new T.MeshLambertMaterial({ map: atlas, emissive: new T.Color(0xffffff), emissiveMap: glowA, emissiveIntensity: 1, side: T.FrontSide, shadowSide: T.DoubleSide });
    const hullM = new T.MeshBasicMaterial({ color: edgeCol, side: T.BackSide });
    sway(mat, true); sway(hullM, false);
    disposables.push(mat, hullM);
    glowList.push({ m: mat, base: 1, ph: 1.3 });
    const R = { bark: [0, 0], pine: [0.5, 0], leaf: [0, 0.5], cap: [0.5, 0.5, 0.25], pod: [0.5, 0.75, 0.25] };
    // Una pieza con sus uv llevadas a su trozo del atlas (con 10 px de margen: de lejos, los mipmaps no mezclan el sombrero
    // blanco ni las vainas con las hojas).
    const part = (g, at, r) => {
      const q = g.index ? g.toNonIndexed() : g, uv = q.attributes.uv, [u0, v0, vh = 0.5] = R[r], m = 10 / 256;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + m + uv.getX(i) * (0.5 - 2 * m), 1 - (v0 + m + (1 - uv.getY(i)) * (vh - 2 * m)));
      q.applyMatrix4(compose(at));
      if (q !== g) g.dispose();
      return q;
    };
    // Las piezas a dos detalles: la planta (q = 1; en Máxima, más redonda) y su contorno (q = 0: basta la silueta).
    const hi = mobile() || fx() < 2 ? 1 : 2;      // (PC con calidad alta: copas más redondas)
    const CY = (rt, rb, h, n) => new T.CylinderGeometry(rt, rb, h, n, 1, false), CO = (r, h, n) => new T.ConeGeometry(r, h, n, 1, false);
    const BL = (r, q) => new T.IcosahedronGeometry(r, q ? hi : 0), CAP = (r, q) => new T.SphereGeometry(r, q ? 14 : 8, q ? 5 : 3, 0, Math.PI * 2, 0, Math.PI / 2);
    const KIND = {
      pine: q => [part(CY(3.2, 5, 26, q ? 8 : 5), { y: 13 }, 'bark')].concat([[26, 40, 34], [20, 34, 56], [13, 30, 76]].map(([r, h, y], i) => part(CO(r, h, q ? 16 : 7), { y, ry: i * 0.9 }, 'pine'))),
      round: q => [part(CY(4, 6.5, 52, q ? 8 : 5), { y: 26 }, 'bark'),
        part(BL(30, q), { y: 74 }, 'leaf'), part(BL(22, q), { x: -20, y: 60, z: 6 }, 'leaf'), part(BL(20, q), { x: 18, y: 64, z: -5 }, 'leaf')].concat(q ? [
        part(BL(2.6, 0), { x: -8, y: 46, z: 18 }, 'pod'), part(BL(2.2, 0), { x: 16, y: 50, z: 14 }, 'pod'), part(BL(2.4, 0), { x: -26, y: 44, z: 2 }, 'pod')] : []),
      shroom: q => [part(CY(4, 6, 36, q ? 8 : 5), { y: 18 }, 'bark'), part(CAP(24, q), { y: 34, sy: 0.42 }, 'cap')].concat(q ? [part(CY(23, 6, 3, 14), { y: 33 }, 'bark')] : []),   // (láminas oscuras debajo del sombrero)
      bush: q => [part(BL(14, q), { y: 8, sy: 0.75 }, 'leaf'), part(BL(11, q), { x: -12, y: 6, z: 4, sy: 0.7 }, 'leaf'), part(BL(10, q), { x: 11, y: 6, z: -3, sy: 0.7 }, 'leaf')]
        .concat(q ? [part(BL(1.8, 0), { x: 4, y: 13, z: 10 }, 'pod')] : [])
    };
    const M = new T.Matrix4(), C = new T.Color();
    for (const k in KIND) {
      const list = plan.filter(p => p.k === k);
      if (!list.length) continue;
      const g = merge(KIND[k](1));
      // El contorno: la planta en poco detalle, hinchada un poco por sus normales (sigue a la planta al mecerse: el mismo shader).
      const hg = merge(KIND[k](0)), hp = hg.attributes.position, hn = hg.attributes.normal;
      for (let i = 0; i < hp.count; i++) hp.setXYZ(i, hp.getX(i) + hn.getX(i) * 1.7, hp.getY(i) + hn.getY(i) * 1.7, hp.getZ(i) + hn.getZ(i) * 1.7);
      const im = new T.InstancedMesh(g, mat, list.length), ih = new T.InstancedMesh(hg, hullM, list.length);
      list.forEach((p, i) => {
        M.compose(new T.Vector3(p.x * TS, 0, p.z * TS), new T.Quaternion().setFromEuler(new T.Euler(0, p.ry, 0)), new T.Vector3(p.s, p.s * p.sy, p.s));
        im.setMatrixAt(i, M); ih.setMatrixAt(i, M);
        im.setColorAt(i, C.set(p.c));
        // Lo que brilla, con su halo (las setas y las vainas de los de delante: los de detrás quedan tapados).
        if (p.edge && k === 'shroom') halo(p.x * TS, 34 * p.s + 6, p.z * TS, p.c, 46 * p.s, 0.45);
        if (p.edge && k === 'round' && p.glow) halo(p.x * TS, 48 * p.s, p.z * TS + 10, CYAN, 34 * p.s, 0.4);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = fx() > 0; im.receiveShadow = true;
      ih.castShadow = false;
      fixed(im); fixed(ih);
    }
  }

  /** Viento: lo alto de cada planta se mece (con su fase por planta, de su sitio). glow: lo que brilla, del color de la planta. */
  function sway(m, glow) {
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = uni.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  float ph = instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.021;',
        '  float h = max(0.0, position.y - 18.0);',
        '  transformed.x += sin(uTime * 0.9 + ph) * h * 0.035 + sin(uTime * 2.3 + ph * 3.0) * h * 0.008;',
        '  transformed.z += cos(uTime * 0.7 + ph * 1.7) * h * 0.02;',
        '#endif'].join('\n'));
      if (glow) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor;\n#endif');
    };
    m.customProgramCacheKey = () => 'sway' + (glow ? 1 : 0);
  }

  /*
   * Dónde va cada planta del bosque del borde (sin three.js: también para los tests). k: densidad (1 normal).
   * → [{ k: 'pine' | 'round' | 'shroom' | 'bush', x, z (casillas), s (escala), sy, ry, c (color), edge, glow, tx, ty }]
   * Cada casilla de bosque que da a la aldea lleva al menos una planta pegada a su lado abierto; las de dentro, a veces.
   * Una fila más fuera del plano (arriba y a los lados: con la perspectiva se ve algo). Abajo del todo, sólo plantas bajas.
   */
  function forestPlan(VG, k = 1) {
    const W = VG.W, Hh = VG.H, at = (tx, ty) => VG.terrainAt(tx, ty), out = [];
    const open = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < Hh && at(tx, ty) !== 1;
    const caps = [CYAN, PINK, GREEN, VIOLET, CYAN];
    const tint = (a, b) => { const v = 0.86 + H(a, b, 640) * 0.26; return css([v * 255, (v + (H(a, b, 641) - 0.5) * 0.08) * 255, (v + (H(a, b, 642) - 0.5) * 0.1) * 255]); };
    for (let ty = -1; ty < Hh; ty++) for (let tx = -1; tx <= W; tx++) {
      if (at(tx, ty) !== 1) continue;
      let dx = 0, dy = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (open(tx + i, ty + j)) { dx += i; dy += j; n++; }
      const edge = n > 0, south = ty >= Hh - 3;
      const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const count = edge ? 1 + (H(tx, ty, 650) < 0.45 * k ? 1 : 0) + (k > 1.2 && H(tx, ty, 651) < 0.4 ? 1 : 0) : (H(tx, ty, 652) < 0.5 * k ? 1 : 0) + (k > 1.2 && H(tx, ty, 653) < 0.35 ? 1 : 0);
      for (let q = 0; q < count; q++) {
        const h = H(tx, ty, 660 + q);
        let kind;
        if (south) kind = h < 0.9 ? 'bush' : 'shroom';
        else if (edge && q > 0) kind = h < 0.55 ? 'bush' : h < 0.8 ? 'shroom' : 'round';
        else kind = h < 0.42 ? 'pine' : h < 0.82 ? 'round' : 'shroom';
        // Pegada al lado abierto (las de delante) o suelta dentro de la casilla; siempre dentro de ella.
        const jx = (H(tx, ty, 670 + q) - 0.5) * 0.5, jy = (H(tx, ty, 680 + q) - 0.5) * 0.5;
        const pull = edge ? (q === 0 ? 0.24 : 0.3) : 0;
        const x = Math.max(tx + 0.1, Math.min(tx + 0.9, tx + 0.5 + ux * pull + jx * (edge ? 0.6 : 1)));
        const z = Math.max(ty + 0.1, Math.min(ty + 0.9, ty + 0.5 + uy * pull + jy * (edge ? 0.6 : 1)));
        const r = H(tx, ty, 690 + q);
        const s = kind === 'pine' ? 1.15 + r * 0.5 : kind === 'round' ? 1.0 + r * 0.45 : kind === 'shroom' ? (south ? 0.5 + r * 0.25 : 0.8 + r * 0.45) : 0.8 + r * 0.5;
        out.push({ k: kind, x, z, s, sy: kind === 'pine' ? 0.95 + H(tx, ty, 700 + q) * 0.25 : 1, ry: H(tx, ty, 710 + q) * 6.283,
          c: kind === 'shroom' ? caps[(H(tx, ty, 720 + q) * 5) | 0] : tint(tx * 3 + q, ty), edge, glow: H(tx, ty, 730 + q) < 0.5, tx, ty });
      }
    }
    return out;
  }

  // ---------------- agua: la charca (capa animada del tileset, teñida de luz) ----------------
  /*
   * (Pulido 12-11-2026) La charca era de casillas (una elipse a escalones de 48: se veía cuadrada). Ahora es una elipse
   * de verdad con el agua animada del tileset dentro (pintada entera, sin las orillas de las casillas) y una orilla
   * oscura y suave alrededor. Choca la elipse (un poco por dentro: se puede estar en la orilla), no las casillas.
   */
  const POND_IN = 0.9;
  function pondShape() {
    const P = V().POND, pts = [];
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; pts.push([(P.x + Math.cos(a) * P.rx * POND_IN) * TS, (P.y + Math.sin(a) * P.ry * POND_IN) * TS]); }
    return pts;
  }
  function buildWater() {
    const VG = V(), BI = VG.BI, A = G.Tileset.T, P = VG.POND;
    solidList.push({ id: 'pond', pts: pondShape() });
    if (!G.Tileset.animated(BI)) return;
    const meta = (G.TILESETS || []).find(m => m.bi === BI);
    const frames = meta ? meta.frames : 1, dur = meta ? Math.max(0.25, meta.dur * 2) : 0.4;
    const x0 = Math.floor(P.x - P.rx) - 1, y0 = Math.floor(P.y - P.ry) - 1, x1 = Math.ceil(P.x + P.rx), y1 = Math.ceil(P.y + P.ry);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const [c, g] = canvas(w * A * frames, h * A);
    const all = () => 2, N = 16;
    // El fondo del agua sale del suelo del tileset (las casillas de agua del chunk); encima, la capa animada.
    const [bc, bg] = canvas(w * A, h * A);
    for (let cy = Math.floor(y0 / N); cy <= Math.floor(y1 / N); cy++) for (let cx = Math.floor(x0 / N); cx <= Math.floor(x1 / N); cx++) {
      const ch = G.Tileset.paintChunk(cx, cy, N, all, BI, 777, true, () => false);
      if (ch) { bg.drawImage(ch, (cx * N - x0) * A, (cy * N - y0) * A); G.U.freeCanvas(ch); }
    }
    for (let f = 0; f < frames; f++) {
      g.drawImage(bc, f * w * A, 0);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
        G.Tileset.drawLiquid(g, BI, all, tx, ty, f * w * A + (tx - x0) * A, (ty - y0) * A, A, (f + 0.5) * dur);
    }
    G.U.freeCanvas(bc);
    pondTex = tex(c, true);
    pondTex.repeat.set(1 / frames, 1);
    const m = fin(new T.MeshBasicMaterial({ map: pondTex, depthWrite: false }));
    pondCol = m.color;
    disposables.push(m);
    // Elipse con las uv del trozo de agua pintado (mundo → textura).
    const geo = new T.CircleGeometry(1, 64), pos = geo.attributes.position, uv = geo.attributes.uv;
    const RX = P.rx * TS * 0.98, RY = P.ry * TS * 0.98, CX = P.x * TS, CZ = P.y * TS;
    for (let i = 0; i < pos.count; i++) {
      const wx = CX + pos.getX(i) * RX, wz = CZ - pos.getY(i) * RY;
      uv.setXY(i, (wx / TS - x0) / w, 1 - (wz / TS - y0) / h);
    }
    geo.scale(RX, RY, 1);
    disposables.push(geo);
    const mesh = new T.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(CX, 0.4, CZ);
    mesh.renderOrder = -8;
    fixed(mesh);
    // Orilla: un aro oscuro que se difumina hacia fuera y un brillo fino en el borde del agua.
    const shore = (r0, r1, col, op, add) => {
      const rg = new T.RingGeometry(r0, r1, 72, 1), rp = rg.attributes.position, cc = new Float32Array(rp.count * 4), C = new T.Color(col);
      for (let i = 0; i < rp.count; i++) {
        const r = Math.hypot(rp.getX(i), rp.getY(i)), k = Math.abs(r - (r0 + r1) / 2) / ((r1 - r0) / 2);
        cc.set([C.r, C.g, C.b, op * (r < (r0 + r1) / 2 ? 1 : 1 - k)], i * 4);
      }
      rg.setAttribute('color', new T.BufferAttribute(cc, 4));
      rg.scale(RX, RY, 1);
      const sm = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: add ? T.AdditiveBlending : T.NormalBlending });
      disposables.push(rg, sm);
      const o = new T.Mesh(rg, sm);
      o.rotation.x = -Math.PI / 2; o.position.set(CX, add ? 0.55 : 0.5, CZ); o.renderOrder = add ? -7 : -7.5;
      fixed(o);
    };
    shore(0.94, 1.16, '#081014', 0.8, false);
    shore(0.95, 1.0, '#5ff0ff', 0.35, true);
    anim.push({ fn: t => { pondTex.offset.x = (Math.floor(t / dur) % frames) / frames; } });
    glow(P.x * TS, P.y * TS, 150, CYAN, 0.6);
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
    const m = fin(new T.MeshLambertMaterial({ map: t, emissive: new T.Color(0xffffff), emissiveMap: t, emissiveIntensity: 0.75 }));
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
      return k > 0.75 ? shade(col, -0.3) : k > 0.4 ? shade(col, -0.05) : shade(col, 0.25);
    })), { alphaTest: 0.5 });
  }
  /** Antena de la tribu con su luz que parpadea. */
  function antenna(x, y, z, col, h = 34) {
    put(cyl(1.4, 2, h, 5), metalM(), { x, y: y + h / 2, z }, { hull: 1 });
    put(box(10, 2, 2), metalM(), { x, y: y + h * 0.7, z }, { hull: false });
    blink(x, y + h + 3, z, col);
  }
  function blink(x, y, z, col, r = 3.4) {
    halo(x, y, z, col, 26, 0.8);
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
    const shell = lambert('pod' + i, () => stex(scales(n, L.a, 32, i)));
    const g = lathe(prof.map(([r, y]) => [r * R, y * Hh]), n);
    g.rotateY(Math.PI / n);
    put(g, shell, { x: X, y: 0, z: Z, sx }, { hull: 2.4 });
    // Anillos de luz (abajo y arriba): aros finos del color de la carpa.
    const rAt = yk => { for (let k = 1; k < prof.length; k++) if (prof[k][1] >= yk) { const a = prof[k - 1], b = prof[k], u = (yk - a[1]) / (b[1] - a[1]); return (a[0] + (b[0] - a[0]) * u) * R; } return 0; };
    for (const yk of [0.3, 0.72]) {
      const tg = torus(rAt(yk) + 1.5, 2.2, 4, 20); tg.rotateX(Math.PI / 2);
      put(tg, glowM(L.glow, 1.1), { x: X, y: yk * Hh, z: Z, sx }, { hull: false, cast: false });
    }
    // Puerta encendida y su letrero.
    const zf = Z + rAt(0.2) + 1.6;
    put(new T.PlaneGeometry(40, 50), doorM(L.glow), { x: X, y: 25, z: zf }, { hull: false, cast: false });
    sign(i, 24, X, 66, Z + rAt(0.5) + 4);
    glow(X, zf + 14, 96, L.glow, 1);
    halo(X, 30, zf + 2, L.glow, 70, 0.55);
    lamp(X, 40, zf + 30, L.glow, 0.55, 200);
    // Remate: la Poké Ball que brilla (gacha) o una antena.
    if (L.ball) {
      const bm = glowTexM('pball', () => stex(soft(32, 64, (x, y) => { const t = y / 64, b = sstep(0.43, 0.47, t) * (1 - sstep(0.53, 0.57, t)); const top = tone(['#e83a5a', '#ff7a8a', '#ffc0c8'], sat(1 - t * 2.4)), bot = tone(['#a8a8b8', '#f4f4f8'], sat((1 - t) * 2.2)); return mixc(t < 0.5 ? top : bot, [16, 16, 16], b); })), '#ffffff', 0.35);
      put(new T.SphereGeometry(18, seg(10), seg(8)), bm, { x: X, y: Hh + 14, z: Z }, { hull: 2.2 });
      put(cyl(5, 5, 3, 10), glowM('#ffffff', 0.9), { x: X, y: Hh + 14, z: Z + 17, rx: Math.PI / 2 }, { hull: 1.4 });
      sparkle(X, Hh + 20, Z, 8);
    } else antenna(X, Hh - 4, Z, L.glow);
    // Base de piedra con musgo (pulido: antes, dos raíces que desde arriba parecían pinchos negros).
    put(cyl(R * 1.02 * sx, R * 1.1 * sx, 7, 12), mossStoneM(), { x: X, y: 3.5, z: Z, sz: 1 / sx }, { hull: 1.4 });
    tops[p.id] = Hh + (L.ball ? 40 : 30);
  }

  /** Tienda Kecleon: mostrador de raíz, toldo de holograma y frutas que brillan. */
  function stall(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y), w = tile(p.w) - 10;
    put(box(w, 74, 10), lambert('weave', () => stex(scales(4, '#2a5a3a', 32, 9))), { x: X, y: 37, z: Z - 24 });
    put(box(w - 8, 34, 26), woodM(), { x: X, y: 17, z: Z + 30 });
    put(box(w - 4, 4, 30), woodM(), { x: X, y: 36, z: Z + 30 }, { hull: 1.2 });
    put(box(w - 4, 2.4, 2.4), glowM(L.glow, 1.2), { x: X, y: 33, z: Z + 45.5 }, { hull: false, cast: false });
    halo(X, 33, Z + 46, L.glow, 60, 0.4);
    for (const sx of [-1, 1]) {
      put(box(6, 116, 6), barkM(), { x: X + sx * (w / 2 - 3), y: 58, z: Z - 24 }, { hull: 1.2 });
      put(box(6, 94, 6), barkM(), { x: X + sx * (w / 2 - 3), y: 47, z: Z + 4 }, { hull: 1.2 });
    }
    // Toldo de hojas sobre los postes, inclinado hacia delante, con su ribete de luz (pulido: antes, un panel de luz que
    // se sumaba por encima de todo y tapaba a tu Pokémon al pasar por detrás). Alto y corto: no tapa a Kecleon.
    const roof = lambert('stallroof', () => stex(scales(6, '#2e6a44', 120, 12)));
    put(box(w + 18, 4, 38), roof, { x: X, y: 106, z: Z - 11, rx: 0.62 }, { hull: 1.8 });
    put(box(w + 20, 3, 3), glowM(L.glow, 1.1), { x: X, y: 94, z: Z + 6 }, { hull: false, cast: false });
    halo(X, 94, Z + 6, L.glow, 50, 0.35);
    for (const s of [-1, 0, 1]) { put(cyl(0.6, 0.6, 14, 3), metalM(), { x: X + s * 46, y: 93, z: Z + 4 }, { hull: false, cast: false }); put(ball(4, 0), glowM([CYAN, PINK, GREEN][s + 1], 1.2), { x: X + s * 46, y: 85, z: Z + 4 }, { hull: 1 }); halo(X + s * 46, 85, Z + 4, [CYAN, PINK, GREEN][s + 1], 30, 0.8); }
    const fruit = [[PINK, -40], [CYAN, -22], [AMBER, 18], [PINK, 34], [VIOLET, 50]];
    for (const [col, dx] of fruit) put(ball(6, 1), glowM(col, 0.7), { x: X + dx, y: 44, z: Z + 30 + (H(dx, 1, 3) - 0.5) * 10 }, { hull: 1.2 });
    put(box(22, 14, 16), woodM(), { x: X - 2, y: 45, z: Z + 28 }, { hull: 1.2 });
    sign(i, 26, X, 132, Z - 20);
    glow(X, Z + 40, 80, L.glow, 0.7);
    tops[p.id] = 146;
  }

  /** Almacén: una seta gigante con su puerta en el pie y lunares que brillan. */
  function mush(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y);
    put(cyl(40, 48, 70, 10), paleM(), { x: X, y: 35, z: Z }, { hull: 2 });
    const capM = lambert('mcap' + i, () => stex(capTex(L.a, i, false)));
    put(cap(92, 12), capM, { x: X, y: 62, z: Z, sy: 0.56 }, { hull: 2.6 });
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4 + 0.3, rr = 30 + (k % 3) * 18, yy = 62 + Math.sqrt(Math.max(0, 1 - (rr / 92) ** 2)) * 92 * 0.56;
      put(ball(7 - (k % 3), 0), glowM(L.glow, 1), { x: X + Math.cos(a) * rr, y: yy, z: Z + Math.sin(a) * rr * 0.9, sy: 0.4 }, { hull: false, cast: false });
      halo(X + Math.cos(a) * rr, yy + 2, Z + Math.sin(a) * rr * 0.9, L.glow, 22, 0.7);
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
      put(box(9, 96, 9), lambert('carved', () => stex(carvedTex())), { x: X + s * (w / 2 - 2), y: 48, z: Z }, { hull: 1.4 });
      put(crystal(5, 12), glowM(L.glow, 1.2), { x: X + s * (w / 2 - 2), y: 106, z: Z }, { hull: 1 });
      halo(X + s * (w / 2 - 2), 106, Z, L.glow, 30, 0.8);
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
    put(gable(w + 18, 22, 14), lambert('roofb', () => stex(foliage(64, ramp('#1f573c'), 72))), { x: X, y: 88, z: Z });
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
    for (const s of [-1, 1]) { put(crystal(6, 20), glowM(L.glow, 1), { x: X + s * 30, y: 56, z: Z + 4, rz: s * 0.25 }, { hull: 1.2 }); halo(X + s * 30, 56, Z + 4, L.glow, 40, 0.7); }
    halo(X, 50, Z, '#ffd870', 50, 0.4);
    const ring = torus(26, 1.6, 4, 20); ring.rotateX(Math.PI / 2);
    put(ring, glowM(L.glow, 1.2), { x: X, y: 41, z: Z }, { hull: false, cast: false });
    sign(i, 18, X, 20, Z + 26);
    sparkle(X, 70, Z, 10);
    glow(X, Z + 10, 70, L.glow, 0.8);
    tops[p.id] = 104;
  }

  function podium(p, i) {
    const L = p.look, X = tile(p.x), Z = tile(p.y);
    // (Pulido) El número sólo en la cara de delante (antes salía en todas, también encima y girado).
    const step = (dx, h, col, num) => {
      const D = { 1: ['.##.', '###.', '.##.', '.##.', '.##.', '####'], 2: ['###.', '...#', '.##.', '#...', '#...', '####'], 3: ['###.', '...#', '.##.', '...#', '...#', '###.'] }[num];
      const on = (x, y) => { const gx = x - 6, gy = y - 5; return gx >= 0 && gx < 4 && gy >= 0 && gy < 6 && D[gy][gx] === '#'; };
      put(box(50, h, 46), lambert('pstep' + col, () => stex(bricks(128, ramp(col)))), { x: X + dx, y: h / 2, z: Z });
      const m = glowTexM('podn' + num, () => tex(pix(16, 16, (x, y) => on(x, y) ? '#ffffff' : null)), L.glow, 1.2, { transparent: true, alphaTest: 0.5 });
      put(new T.PlaneGeometry(30, 30), m, { x: X + dx, y: h / 2, z: Z + 23.4 }, { hull: false, cast: false });
      halo(X + dx, h / 2, Z + 24, L.glow, 34, 0.35);
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
    put(ball(19, 1), lambert('mpod', () => stex(scales(4, '#7a5a2a', 16, 4))), { x: X, y: 58, z: Z, sx: 0.9, sz: 1.1, sy: 0.85 }, { hull: 1.8 });
    put(box(18, 3, 2), glowM(L.glow, 1.2), { x: X, y: 58, z: Z + 20 }, { hull: false, cast: false });
    halo(X, 58, Z + 21, L.glow, 30, 0.7);
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
    put(cyl(28, 28, 2, 9), lambert('rings', () => stex(ringsTex())), { x: X, y: 37, z: Z }, { hull: false });
    const screen = glowTexM('pcs', () => tex(pix(20, 14, (x, y) => {
      if (x === 0 || y === 0 || x === 19 || y === 13) return '#1a2a38';
      const cx = x - 9.5, cy = y - 6.5, r = Math.hypot(cx, cy);
      if (r < 4.6 && r > 2 && (Math.atan2(cy, cx) * 8 / Math.PI | 0) % 2 === 0) return '#e8ffff';
      if (r <= 2.2 && r > 1) return '#e8ffff';
      return y % 3 === 0 ? '#2a8aa8' : '#3aa8c8';
    })), '#ffffff', 0.9);
    put(box(46, 32, 6), screen, compose({ x: X, y: 58, z: Z + 2, rx: -0.18 }), { hull: 1.6 });
    halo(X, 58, Z + 6, L.glow, 80, 0.35);
    put(box(8, 22, 6), metalM(), { x: X, y: 44, z: Z - 2 }, { hull: 1 });
    for (const s of [-1, 1]) {
      const cg = torus(16, 1.4, 3, 8, Math.PI); cg.rotateY(Math.PI / 2);
      put(cg, plain('#14181c'), { x: X + s * 22, y: 4, z: Z + 18 }, { hull: false, cast: false });
    }
    sign(i, 14, X + 22, 26, Z + 26);
    glow(X, Z + 26, 56, L.glow, 0.8);
    tops[p.id] = 92;
  }

  /*
   * El Altar del Portal (13-11-2026, pedido del dueño: «mejora el altar para entrar a la partida»; antes, la Flor del
   * Portal). La entrada a la aventura, en el estilo de la tribu (tecnología y naturaleza): un estrado de piedra de dos
   * escalones con un anillo de runas, el arco del portal de metal con sus luces sobre una cuna, dos pilares tallados con
   * cristales encima, raíces enormes que abrazan el arco por arriba con lianas de luz, y delante, en el estrado, el
   * círculo donde ponerse (con flechas que giran hacia dentro y se aviva al pisarlo). Lleva su luz de verdad (la del
   * portal, que late) y sus partículas (motas que suben del círculo y que caen en espiral al portal).
   * (Con la cámara desde arriba lo alto sube en la pantalla: el arco va al fondo del estrado.)
   */
  const ALTAR_Z = 34, ALTAR_CY = 104, ALTAR_R = 66;
  /** El estrado del altar: [radio, alto de arriba] de cada escalón; PAD_R: el círculo donde ponerse. */
  const DAIS = [[138, 5], [104, 10]], PAD_R = 40;
  let padU = null, portalU = null, altarPts = null;
  function altar(p, i) {
    const X = tile(p.x), Z0 = tile(p.y), Cz = Z0 - ALTAR_Z, cy = ALTAR_CY, R = ALTAR_R;
    const pz = tile(p.door[1]);
    // El estrado: dos escalones bajos (se pisan: no llegan a FOOT_MIN) y la losa de runas arriba.
    put(cyl(DAIS[0][0], DAIS[0][0] + 4, DAIS[0][1], 16), mossStoneM(), { x: X, y: DAIS[0][1] / 2, z: Z0 }, { hull: 1.6 });
    put(cyl(DAIS[1][0], DAIS[1][0] + 3, DAIS[1][1] - DAIS[0][1], 16), mossStoneM(), { x: X, y: (DAIS[1][1] + DAIS[0][1]) / 2, z: Z0 }, { hull: 1.4 });
    const top = new T.CircleGeometry(DAIS[1][0] - 1, seg(24));
    top.rotateX(-Math.PI / 2);
    put(top, glowTexM('dais', () => stex(daisTex(), false), '#ffffff', 0.55), { x: X, y: DAIS[1][1] + 0.3, z: Z0 }, { hull: false, cast: false });
    put(box(120, 3, 16), mossStoneM(), { x: X, y: 1.5, z: Z0 + DAIS[0][0] + 6 }, { hull: 1.2 });
    // La cuna del arco y el arco: metal con luces, y un aro de luz por dentro.
    put(box(84, 20, 30), metalM(), { x: X, y: DAIS[1][1] + 10, z: Cz }, { hull: 1.6 });
    put(box(70, 3, 2), glowM(CYAN, 1.3), { x: X, y: DAIS[1][1] + 12, z: Cz + 15.5 }, { hull: false, cast: false });
    put(torus(R + 8, 8, 6, 32), metalM(), { x: X, y: cy, z: Cz }, { hull: 1.8 });
    put(torus(R + 1, 2.2, 4, 32), glowM(VIOLET, 1.4), { x: X, y: cy, z: Cz + 3 }, { hull: false, cast: false });
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, c = k % 2 ? CYAN : PINK;
      put(box(9, 6, 8), glowM(c, 1.3), { x: X + Math.cos(a) * (R + 8), y: cy + Math.sin(a) * (R + 8), z: Cz + 6, rz: a }, { hull: 1 });
      if (k % 3 === 0) halo(X + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8), Cz + 9, c, 30, 0.8);
    }
    portal(X, cy, Cz + 2, R);
    halo(X, cy, Cz + 12, PINK, 260, 0.45);
    halo(X, cy, Cz + 14, CYAN, 140, 0.4);
    // Pilares tallados con sus luces y un cristal encima (que gira despacio).
    for (const s of [-1, 1]) {
      const px = X + s * 108, c = s < 0 ? PINK : CYAN;
      put(box(30, 150, 28), lambert('carved', () => stex(carvedTex())), { x: px, y: DAIS[0][1] + 75, z: Cz + 6 }, { hull: 1.8 });
      put(box(38, 10, 36), metalM(), { x: px, y: DAIS[0][1] + 5, z: Cz + 6 }, { hull: 1.4 });
      put(box(38, 8, 36), metalM(), { x: px, y: DAIS[0][1] + 150, z: Cz + 6 }, { hull: 1.4 });
      for (let k = 0; k < 4; k++) put(box(14, 4, 1.4), glowM(c, 1.3), { x: px, y: DAIS[0][1] + 30 + k * 30, z: Cz + 20.6 }, { hull: false, cast: false });
      const cm = glowM(c, 1.35);
      const cr = loose(crystal(13, 34), cm, px, DAIS[0][1] + 186, Cz + 6);
      const ph = s * 1.3;
      anim.push({ fn: t => { cr.rotation.y = t * 0.6 + ph; cr.position.y = DAIS[0][1] + 186 + Math.sin(t * 1.3 + ph) * 4; } });
      halo(px, DAIS[0][1] + 186, Cz + 8, c, 110, 0.75);
      glow(px, Cz + 40, 90, c, 0.8);
      lamp(px, DAIS[0][1] + 186, Cz + 20, c, 0.7, 260);
      // Raíces que bajan del pilar y se hunden en el suelo, por fuera (delante, no: taparían el círculo).
      for (const [a, len] of [[s > 0 ? -0.2 : Math.PI + 0.2, 46], [s > 0 ? -0.9 : Math.PI + 0.9, 38]]) {
        const g = cone(12, len, 6); g.rotateZ(-Math.PI / 2); g.translate(len / 2, 0, 0);
        put(g, barkM(), compose({ x: px + Math.cos(a) * 14, y: 4, z: Cz + 6 + Math.sin(a) * 12, ry: -a, rz: -0.14, sy: 0.6 }), { hull: 1.2 });
      }
    }
    // El arco de raíces que abraza el portal por arriba, con hojas, vainas y lianas de luz.
    put(torus(110, 13, 6, 26, Math.PI), barkM(), { x: X, y: cy + 4, z: Cz - 6 }, { hull: 2 });
    for (const [dx, dy, r] of [[0, 120, 30], [-54, 100, 24], [56, 98, 26], [-92, 50, 18], [94, 46, 18]]) put(ball(r, 1), leafM(), { x: X + dx, y: cy + dy, z: Cz - 14, sy: 0.7 }, { hull: 2 });
    for (const [dx, len, c] of [[-70, 30, CYAN], [-38, 22, PINK], [40, 26, GREEN], [74, 34, CYAN]]) {
      const a = Math.acos(Math.max(-1, Math.min(1, dx / 110)));
      vine(X + dx, cy + 4 + Math.sin(a) * 110 - 6, Cz + 4, len, c);
    }
    // Cables de luz desde los pilones de cristal hasta los pilares.
    cable([tile(18.8), 52, tile(9.6)], [X - 108, 92, Cz + 20], 24);
    cable([tile(27.2), 52, tile(9.6)], [X + 108, 92, Cz + 20], 24);
    // El círculo donde ponerse: flechas que giran hacia dentro y un aro que late (más fuerte si estás encima).
    padU = { uTime: uni.time, uOn: { value: 0 }, uNight: uni.night };
    const pm = new T.ShaderMaterial({ uniforms: padU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec2 vUv; uniform float uTime; uniform float uOn; uniform float uNight;',
        'void main(){',
        '  vec2 c = vUv * 2.0 - 1.0; float r = length(c), a = atan(c.y, c.x), aa = fwidth(r) * 1.5;',
        '  if (r > 1.0) discard;',
        '  float pulse = 0.5 + 0.5 * sin(uTime * 3.2);',
        '  float ring = (1.0 - smoothstep(0.05, 0.05 + aa * 2.0, abs(r - 0.88))) * (0.75 + 0.25 * pulse);',
        '  float fr = fract(uTime * 0.6);',
        '  float ring2 = (1.0 - smoothstep(0.02, 0.02 + aa * 2.0, abs(r - (0.88 - fr * 0.6)))) * (1.0 - fr) * 0.7;',
        // Cuatro flechas (chevrones) que van del borde hacia el centro.
        '  float sa = mod(a - uTime * 0.5, 1.5708) - 0.7854, mv = fract(-uTime * 0.7);',
        '  float ch = abs(sa) * 0.5 + r - (0.3 + mv * 0.45);',
        '  float chev = (1.0 - smoothstep(0.03, 0.03 + aa * 2.0, abs(ch))) * step(abs(sa), 0.5) * smoothstep(0.12, 0.3, r) * (1.0 - smoothstep(0.7, 0.8, r));',
        '  float fill = (1.0 - smoothstep(0.0, 0.95, r)) * (0.14 + 0.1 * uOn);',
        '  vec3 col = vec3(1.0, 0.55, 0.9) * ring + vec3(0.4, 0.95, 1.0) * (chev * 0.9 + ring2) + vec3(0.95, 0.85, 1.0) * fill;',
        '  gl_FragColor = vec4(col * (0.75 + 0.35 * uNight) * (1.0 + 0.35 * uOn), 1.0);',
        '}'].join('\n'), extensions: { derivatives: true } });
    disposables.push(pm);
    const pg = new T.CircleGeometry(PAD_R, seg(24));
    pg.rotateX(-Math.PI / 2);
    loose(pg, pm, X, DAIS[1][1] + 0.7, pz, -3);
    halo(X, DAIS[1][1] + 6, pz, PINK, 90, 0.35);
    glow(X, Z0 + DAIS[0][0] + 26, 150, PINK, 0.9);
    glow(X, Z0 + DAIS[0][0] + 10, 120, CYAN, 0.6);
    // Partículas propias: motas que suben del círculo y que caen en espiral al portal (un solo dibujo, ver build).
    altarPts = { pad: [X, DAIS[1][1] + 2, pz], ring: [X, cy, Cz + 4], R };
    sparkle(X, cy + 40, Cz, 22, true);
    lamp(X, cy, Cz + 40, '#e070ff', 1.4, 420, true);
    tops[p.id] = 236;
  }
  /** Alto del suelo en (x, y): sobre el estrado del altar, su escalón (así los Pokémon no se hunden en él). */
  function heightAt(x, y) {
    const p = V().PLACES[0];
    if (!p || p.look.kind !== 'altar') return 0;
    const d = Math.hypot(x - tile(p.x), y - tile(p.y));
    return d < DAIS[1][0] - 4 ? DAIS[1][1] : d < DAIS[0][0] - 4 ? DAIS[0][1] : 0;
  }

  /** El remolino del portal: un shader (bandas que giran) en un disco. uBoost (0..1): se aviva al entrar. */
  function portal(X, y, z, r) {
    portalU = { uTime: uni.time, uGlow: uni.night, uBoost: { value: 0 } };
    const m = new T.ShaderMaterial({
      uniforms: portalU,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec2 vUv; uniform float uTime; uniform float uGlow; uniform float uBoost;',
        'void main(){',
        // (Pulido) Bandas suaves con el borde sin dientes (antes, a cuadritos de 46 por lado).
        '  vec2 c = vUv * 2.0 - 1.0;',
        '  float r = length(c), a = atan(c.y, c.x), aa = fwidth(r) * 1.5;',
        '  float sw = sin(a * 3.0 + r * 10.0 - uTime * (2.4 + uBoost * 6.0));',
        '  float e = max(fwidth(sw), 0.02);',
        '  vec3 col = mix(vec3(0.16, 0.05, 0.3), vec3(0.62, 0.22, 0.78), smoothstep(0.1 - e, 0.1 + e, sw));',
        '  col = mix(col, vec3(0.4, 0.95, 1.0), smoothstep(0.68 - e, 0.68 + e, sw));',
        '  col += vec3(0.25, 0.1, 0.35) * (1.0 - r);',
        '  float rc = 0.2 + 0.05 * sin(uTime * 3.0) + uBoost * 0.6;',
        '  col = mix(col, vec3(0.95, 1.0, 1.0), 1.0 - smoothstep(rc - aa, rc + aa, r));',
        '  col = mix(col, vec3(1.0, 0.6, 0.95), smoothstep(0.9 - aa, 0.9 + aa, r));',
        '  if (r > 1.0) discard;',
        '  col *= 0.85 + 0.3 * uGlow + uBoost * 0.8;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      extensions: { derivatives: true }
    });
    const g = new T.CircleGeometry(r, 48);
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
      put(g, dark, new T.Matrix4().compose(new T.Vector3(...p0), q, new T.Vector3(1, 1, 1)), { hull: false, cast: false, walk: true });
    }
    const nb = Math.max(1, Math.round(L / step)), cols = [CYAN, PINK, GREEN, AMBER];
    for (let k = 1; k < nb; k++) { const p = pt(k / nb); put(ball(2.6, 0), glowM(cols[k % 4], 1.4), { x: p[0], y: p[1] - 3, z: p[2] }, { hull: false, cast: false, walk: true }); halo(p[0], p[1] - 3, p[2], cols[k % 4], 14, 0.5); }
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
    const keepS = solidList, keepC = curId, keepHalo = haloQ, keepGlow = glowQ;
    solidList = []; curId = 'home'; haloQ = []; glowQ = new Map();
    let info = { holo: null };
    const homeMats = [];
    homeSpark = [];
    try {
      info = buildHome(cfg || G.Home.DEFAULT, homeMats);
      flush();
      if (homeSpark.length) particles(3, homeSpark, ['#fff6b0', '#ffffff', '#b8e0ff', '#ffb8f0'], 2, true);
      if (haloQ.length) halos(haloQ);
      flushGlows();
    } catch (e) { console.warn('[Aldea] choza:', e); batch = null; hulls = []; }
    homeSpark = null;
    const hSolids = solidList;
    solidList = keepS; curId = keepC; haloQ = keepHalo; glowQ = keepGlow;
    for (const g of glowList.slice(keepG)) homeMats.push(g.m);
    // Los materiales que se han hecho para la choza se sueltan con ella: fuera de las cachés (si no, quedarían muertos).
    for (const d of disp) if (d && d.isMaterial) { mats.forEach((v, k) => { if (v === d) mats.delete(k); }); glowMats.forEach((v, k) => { if (v === d) glowMats.delete(k); }); }
    disposables = keepD; anim = keepA.concat(hAnim); sink = null; batch = keepB; hulls = keepH;
    home = { group, disp, anim: hAnim, mats: homeMats, key, info, solids: hSolids };
    if (renderer) renderer.shadowMap.needsUpdate = true;
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
    const doorMat = fin(new T.MeshBasicMaterial({ map: doorM('#ffffff').map, alphaTest: 0.5, color: new T.Color(lc) }));
    disposables.push(doorMat);
    if (rainbow) {
      const hsl = new T.Color();
      anim.push({ fn: t => { hsl.setHSL((t * 0.05) % 1, 0.85, 0.62); lightM.emissive.copy(hsl); doorMat.color.copy(hsl); } });
    }
    // Materiales del techo y de las paredes.
    const roofM = c.roof === 'crystal'
      ? glowTexM('hcrys' + roofCol, () => stex(crysTex(roofCol)), '#ffffff', 0.55)
      : c.roof === 'solar'
        ? glowTexM('hsolar' + roofCol + lc, () => stex(solarTex(roofCol, lc)), lc, 0.6)
        : c.roof === 'straw'
          ? lambert('hstraw' + roofCol, () => stex(strawTex(roofCol)))
          : c.roof === 'petal'
            ? glowTexM('hpetal' + roofCol, () => stex(petalRoofTex(roofCol)), roofCol, 0.25)
            : lambert('hleaf' + roofCol, () => stex(scales(6, roofCol, 32, 7)));
    const wallM = c.walls === 'roots'
      ? lambert('hroots', () => stex(rootsTex()))
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
      const tg = torus(R * 1.04 + 1.5, 2.4, 4, 20); tg.rotateX(Math.PI / 2);
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
        const a = (k / 6) * Math.PI * 2 + 0.4, len = 34;
        if (Math.sin(a) > 0.7) continue;                 // (delante, no: taparía la puerta)
        // (Pulido) Raíces bajas que se hunden en el suelo (antes, pinchos negros de pie).
        const g = cone(15, len, 6); g.rotateZ(-Math.PI / 2); g.translate(len / 2, 0, 0);
        put(g, barkM(), compose({ x: X + Math.cos(a) * 44, y: 3, z: Z + Math.sin(a) * 38, ry: -a, rz: -0.16, sy: 0.6 }), { hull: 1.2 });
      }
      for (const [dx, dy, dz, r] of [[0, 112, -6, 62], [-56, 96, 4, 42], [58, 98, 2, 44], [0, 136, -24, 46], [-26, 92, 34, 34], [30, 94, 32, 34]])
        put(ball(r, 1), roofM, { x: X + dx, y: dy, z: Z + dz, sy: 0.7 }, { hull: 2.6 });
      put(new T.PlaneGeometry(14, 12), doorMat, { x: X + 26, y: 60, z: Z + 52 }, { hull: false, cast: false });
      hTop = 160; frontZ = Z + 55; roofTop = [X, 150, Z - 10];
    } else {
      put(cyl(56, 60, 52, 10), wallM, { x: X, y: 26, z: Z }, { hull: 2.2 });
      put(cone(76, 62, 10), roofM, { x: X, y: 52 + 29, z: Z, ry: Math.PI / 10 }, { hull: 2.4 });
      const tg = torus(58, 2.2, 4, 20); tg.rotateX(Math.PI / 2);
      put(tg, lightM, { x: X, y: 50, z: Z }, { hull: false, cast: false });
      hTop = 52 + 62; frontZ = Z + 59.5; roofTop = [X, hTop - 6, Z];
    }
    put(new T.PlaneGeometry(doorW, doorH), doorMat, { x: X, y: doorY, z: frontZ }, { hull: false, cast: false });
    put(box(doorW + 8, 4, 4), lightM, { x: X, y: doorY + doorH / 2 + 2, z: frontZ + 1 }, { hull: 1 });
    sign(V().PLACES.indexOf(p), 20, X, doorY + doorH / 2 + 16, frontZ + 2);
    glow(X, frontZ + 24, 80, lc, 0.9);
    halo(X, doorY + doorH / 2 + 2, frontZ + 3, lc, 50, 0.6);
    // Decoración (lo que choca de aquí abajo va aparte de la choza: tests/village-solids.test.cjs mira que no tape la puerta).
    const homeId = curId;
    curId = homeId + ':deco';
    const front = frontZ + 6;
    // (13-11-2026, «a veces hay cosas en medio y no puedo entrar») Nada de lo que choca delante de la puerta: las macetas,
    // a los lados del pasillo; los farolillos cuelgan (se pasa por debajo) y ninguno va justo delante.
    if (c.deco === 'pots') {
      for (const s of [-1, 1]) {
        put(cyl(9, 7, 12, 8), lambert('pot', () => stex(foliage(64, ['#5a3020', '#7a4428', '#94583a', '#b0704a'], 34))), { x: X + s * 50, y: 6, z: front + 2 }, { hull: 1.2 });
        put(cyl(1.5, 2, 10, 4), paleM(), { x: X + s * 50, y: 16, z: front + 2 }, { hull: false });
        put(cap(8, 8), lightM, { x: X + s * 50, y: 20, z: front + 2, sy: 0.7 }, { hull: 1 });
        put(cap(5, 8), glowM(s > 0 ? PINK : GREEN, 1), { x: X + s * 62, y: 13, z: front + 6, sy: 0.7 }, { hull: 1 });
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
      for (const k of [0, 1, 3, 4]) {
        const a = Math.PI * (0.1 + k * 0.2), px = X - Math.cos(a) * 92, pz = Z + Math.sin(a) * 76;
        put(cyl(0.5, 0.5, 14, 3), plain('#101418'), { x: px, y: 58, z: pz }, { hull: false, cast: false });
        put(box(7, 9, 7), lightM, { x: px, y: 47, z: pz }, { hull: 1, walk: true });
        halo(px, 47, pz, lc, 30, 0.8);
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
        const cm = glowM(lc, 1.1);
        const cr = loose(crystal(13, 30), cm, tx, 44, tz);
        halo(tx, 46, tz, lc, 80, 0.6);
        homeMats.push(cm);
        anim.push({ fn: t => { cr.rotation.y = t * 0.8; cr.position.y = 44 + Math.sin(t * 1.4) * 4; } });
        sparkle(tx, 46, tz, 8);
        glow(tx, tz, 50, lc, 0.9);
      } else {
        const face = lambert('tface', () => stex(faceTex()));
        for (let k = 0; k < 3; k++) put(box(22 - k * 2, 20, 18), face, { x: tx, y: 10 + k * 20, z: tz }, { hull: 1.4 });
        put(box(46, 6, 8), woodM(), { x: tx, y: 52, z: tz }, { hull: 1.2 });
        if (c.totem === 'holo') {
          for (let k = 0; k < 3; k++) put(box(12, 4, 2), lightM, { x: tx, y: 8 + k * 20, z: tz + 9.5 }, { hull: false, cast: false });
          const ring = torus(16, 1.4, 3, 16); ring.rotateX(Math.PI / 2);
          const rm = loose(ring, lightM, tx, 72, tz);
          anim.push({ fn: t => { rm.position.y = 72 + Math.sin(t * 2) * 3; rm.rotation.z = Math.sin(t) * 0.2; } });
          glow(tx, tz, 44, lc, 0.7);
        }
      }
    }
    // El cojín de la mascota.
    if (c.pet) put(cyl(18, 20, 5, 10), lambert('cushion', () => stex(foliage(64, ['#5a2a6a', '#7a3a8a', '#9a4aa8', '#c070c8'], 35))), { x: tile(V().PET[0]), y: 2.5, z: tile(V().PET[1]) }, { hull: 1.2 });
    curId = homeId;
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
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + H(d.x, d.y, 1) * 3, len = 24 * s;
          const g = cone(8 * s, len * 0.8, 6); g.rotateZ(-Math.PI / 2); g.translate(len * 0.4, 0, 0);
          put(g, barkM(), compose({ x: X + Math.cos(a) * 10 * s, y: 3, z: Z + Math.sin(a) * 9 * s, ry: -a, rz: -0.2 }), { hull: 1 });
        }
        const tps = [[0, 84, 0, 44], [-26, 70, 8, 30], [28, 72, 6, 32], [2, 108, -6, 30]];
        for (const [dx, dy, dz, r] of tps) put(ball(r * s, 1), leafM(), { x: X + dx * s, y: dy * s, z: Z + dz * s, sy: 0.78 }, { hull: 2.4 });
        // Hongos de repisa que brillan en el tronco y una liana de luz.
        const c = [CYAN, PINK, GREEN][(H(d.x * 3, d.y * 3, 2) * 3) | 0];
        for (const [dy, a] of [[22, 0.4], [36, -0.6]]) { put(cap(7 * s, 8), glowM(c, 0.9), { x: X + Math.sin(a) * 12 * s, y: dy * s, z: Z + Math.cos(a) * 12 * s, sy: 0.35 }, { hull: 1, cast: false }); halo(X + Math.sin(a) * 13 * s, dy * s, Z + Math.cos(a) * 13 * s, c, 24, 0.7); }
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
        halo(X, 22, Z, c, 64, 0.55);
        break;
      }
      case 'bulb': {
        // Farol-flor: tallo curvo, una hoja y la flor que cuelga encendida.
        const stem = lambert('bstem', () => stex(foliage(64, ['#123a26', '#1a4e32', '#226040', '#2e7a50'], 36)));
        put(cyl(2, 3, 58, 5), stem, { x: X, y: 29, z: Z }, { hull: 1 });
        put(cyl(1.6, 2, 18, 5), stem, compose({ x: X + 6, y: 62, z: Z, rz: -1.1 }), { hull: 1 });
        put(ball(8, 1), glowM(AMBER, 1.2), { x: X + 13, y: 58, z: Z, sy: 1.2 }, { hull: 1.4, cast: false });
        halo(X + 13, 56, Z, AMBER, 84, 1);
        put(cap(10, 6), lambert('bpetal', null, { color: '#2e7a50', side: T.DoubleSide }), { x: X + 13, y: 64, z: Z, sy: 0.5 }, { hull: 1 });
        glow(X + 10, Z + 6, 104, AMBER, 1);
        lamp(X + 13, 54, Z + 4, '#ffd27a', 1, 230);
        break;
      }
      case 'pylon': {
        const c = d.c || CYAN;
        put(cyl(13, 16, 12, 6), mossStoneM(), { x: X, y: 6, z: Z }, { hull: 1.6 });
        put(crystal(9, 30), glowM(c, 1.2), { x: X, y: 42, z: Z }, { hull: 1.4, cast: false });
        halo(X, 42, Z, c, 80, 0.8);
        for (const y of [28, 54]) { const r = torus(10, 1.6, 3, 12); r.rotateX(Math.PI / 2); put(r, metalM(), { x: X, y, z: Z }, { hull: false }); }
        glow(X, Z, 60, c, 1);
        break;
      }
      case 'spring': {
        // Manantial de la plaza: aro de piedra, agua que brilla y un cristal que flota encima.
        put(cyl(54, 58, 16, 12, true), mossStoneM(), { x: X, y: 8, z: Z }, { hull: false });
        put(cyl(54, 58, 16, 12), mossStoneM(), { x: X, y: 8, z: Z }, { hull: 2.4, ghost: true });
        const rim = torus(56, 5, 4, 14); rim.rotateX(Math.PI / 2);
        put(rim, mossStoneM(), { x: X, y: 16, z: Z }, { hull: 1.4 });
        const wm = basic('swater', () => tex(pix(32, 32, (x, y) => {
          const r = Math.hypot(x - 15.5, y - 15.5);
          return ((r * 1.4 + Math.atan2(y - 15.5, x - 15.5) * 2) | 0) % 4 === 0 ? '#8affff' : r > 14 ? '#1a6a7a' : '#2aa0b0';
        })), {});
        const w = loose(new T.CircleGeometry(52, 40), wm, X, 13, Z, -5);
        w.rotation.x = -Math.PI / 2;
        anim.push({ fn: t => { w.rotation.z = t * 0.25; } });
        const cm = glowM(CYAN, 1.3);
        const cr = loose(crystal(12, 26), cm, X, 66, Z);
        halo(X, 66, Z, CYAN, 110, 0.8);
        anim.push({ fn: t => { cr.rotation.y = t * 0.7; cr.position.y = 66 + Math.sin(t * 1.2) * 5; } });
        for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; put(crystal(6, 16), glowM(k ? PINK : GREEN, 1), { x: X + Math.cos(a) * 44, y: 20, z: Z + Math.sin(a) * 38, rz: Math.cos(a) * 0.4, rx: Math.sin(a) * 0.4 }, { hull: 1.2, cast: false }); }
        spray(X, 18, Z);
        glow(X, Z, 120, CYAN, 1);
        break;
      }
      case 'log': {
        const lg = cyl(9, 9, 52, 7); lg.rotateZ(Math.PI / 2);
        put(lg, barkM(), { x: X, y: 9, z: Z }, { hull: 1.4 });
        put(box(40, 3, 10), lambert('mosstop', () => stex(foliage(64, MOSS, 37))), { x: X, y: 18, z: Z }, { hull: false });
        put(cap(4, 6), glowM(GREEN, 1), { x: X + 18, y: 15, z: Z + 7, sy: 0.6 }, { hull: false, cast: false });
        break;
      }
      case 'pod': put(ball(13, 1), lambert('seedpod', () => stex(scales(4, '#6a4a2a', 16, 3))), { x: X, y: 13, z: Z, sy: 1.15 }, { hull: 1.6 });
        put(cyl(13.5, 13.5, 2, 10, true), glowM(GREEN, 1), { x: X, y: 13, z: Z }, { hull: false, cast: false }); break;
      case 'crate': put(box(26, 24, 26), lambert('crate', () => stex(crateTex())), { x: X, y: 12, z: Z, ry: H(d.x * 10, d.y * 10, 3) * 0.6 });
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
        put(box(14, 64, 14), lambert('carved', () => stex(carvedTex())), { x: X, y: 32, z: Z }, { hull: 1.4 });
        for (let k = 0; k < 3; k++) put(box(8, 3, 1), glowM(c, 1.2), { x: X, y: 14 + k * 18, z: Z + 7.5 }, { hull: false, cast: false });
        const hm = basic('thol' + c, () => tex(pix(8, 8, (x, y) => (y % 2 === 0) ? c : shade(c, -0.4))), { transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
        const hp = loose(new T.PlaneGeometry(16, 16), hm, X, 82, Z, 12);
        halo(X, 82, Z, c, 40, 0.6);
        anim.push({ fn: t => { hp.rotation.y = t * 1.2; hp.position.y = 82 + Math.sin(t * 2.2) * 2; hm.opacity = 0.45 + 0.2 * Math.sin(t * 6); } });
        glow(X, Z, 40, c, 0.8);
        break;
      }
      case 'well': {
        put(cyl(26, 28, 22, 10, true), mossStoneM(), { x: X, y: 11, z: Z }, { hull: false });
        put(cyl(26, 28, 22, 10), mossStoneM(), { x: X, y: 11, z: Z }, { hull: 2.2, ghost: true });
        put(cyl(22, 22, 2, 10), glowM(CYAN, 1.1), { x: X, y: 17, z: Z }, { hull: false, cast: false });
        const arch = torus(26, 4, 4, 10, Math.PI);
        put(arch, barkM(), { x: X, y: 22, z: Z }, { hull: 1.4 });
        put(crystal(4, 10), glowM(PINK, 1.2), { x: X, y: 40, z: Z }, { hull: 1 });
        halo(X, 18, Z, CYAN, 60, 0.5); halo(X, 40, Z, PINK, 24, 0.8);
        glow(X, Z, 50, CYAN, 0.8);
        break;
      }
      case 'fence': {
        const x0 = tile(d.a[0]), z0 = tile(d.a[1]), x1 = tile(d.b[0]), z1 = tile(d.b[1]), L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 30));
        for (let k = 0; k <= n; k++) {
          const px = x0 + (x1 - x0) * k / n, pz = z0 + (z1 - z0) * k / n;
          put(cyl(3.6, 4.6, 30, 6), barkM(), { x: px, y: 15, z: pz, rz: (H(k, 1, 2) - 0.5) * 0.16 }, { hull: 1.2 });
          if (k % 2 === 0) { put(ball(3, 0), glowM(GREEN, 1.2), { x: px, y: 32, z: pz }, { hull: false, cast: false }); halo(px, 32, pz, GREEN, 22, 0.7); }
        }
        const ry = -Math.atan2(z1 - z0, x1 - x0);
        for (const y of [10, 21]) put(box(L, 4.5, 4), barkM(), { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, ry }, { hull: 1, solid: true });
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
  const capM = c => glowTexM('cap' + c, () => stex(capTex(c, c.length)), '#ffffff', 0.85);
  /** Liana de luz que cuelga (sin luz: brilla siempre). */
  function vine(x, y, z, len, col) {
    // (Pulido) Un tallo fino que brilla con una luz al final (antes, un plano de píxeles que parecía un pincho).
    put(cyl(1.1, 1.5, len, 5), glowM(shade(col, -0.25), 0.7), { x, y: y - len / 2, z, rz: 0.08 }, { hull: false, cast: false, walk: true });
    put(ball(3.2, 1), glowM(col, 1.3), { x: x + len * 0.04, y: y - len, z }, { hull: false, cast: false, walk: true });
    halo(x + len * 0.04, y - len, z, col, 26, 0.9);
  }

  // ---------------- cosas que se mueven ----------------
  /** Halo de luz de color en el suelo: círculo a escalones que se suma (de noche, más). */
  const glowMats = new Map();
  let glowMeshes = [];
  function glow(X, Z, r, col = AMBER, k = 1) {
    const key = col + k;
    let m = glowMats.get(key);
    if (!m) {
      // (Pulido) Halo suave (antes, tres aros a escalones).
      const c = soft(64, 64, (x, y) => {
        const d = Math.min(1, Math.hypot(x - 31.5, (y - 31.5) * 1.35) / 32), v = Math.pow(1 - d, 1.8) * 92;
        return [v, v, v];
      });
      m = new T.MeshBasicMaterial({ map: stex(c, false), color: new T.Color(col), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
      m.__k = k;
      disposables.push(m);
      glowMats.set(key, m);
    }
    // (13-11-2026) Se juntan: todas las del mismo color en una malla (flushGlows). Antes, una llamada de dibujo por halo.
    const g0 = new T.PlaneGeometry(r * 2, r * 2), g = g0.toNonIndexed();
    g0.dispose();
    g.rotateX(-Math.PI / 2);
    g.translate(X, 0.6, Z);
    if (!glowQ.has(m)) glowQ.set(m, []);
    glowQ.get(m).push(g);
  }
  let glowQ = new Map();
  /** Las manchas de luz apuntadas, una malla por material (en la escena o en el grupo de tu choza). */
  function flushGlows() {
    for (const [m, list] of glowQ) {
      const mesh = new T.Mesh(merge(list), m);
      mesh.renderOrder = -6;
      mesh.frustumCulled = false;
      (sink || scene).add(mesh);
      glowMeshes.push(mesh);
    }
    glowQ = new Map();
  }

  /*
   * Luces de verdad (13-11-2026, el dueño: «se ve demasiado oscuro»). Las luces puntuales cuestan en cada píxel de cada
   * modelo (más en el iPhone), así que hay pocas y se reparten: los faroles y las luces fuertes se apuntan (lamp) y en
   * cada fotograma las N luces del montón van a los más cercanos al centro de la cámara (N: 4 en PC, 1 en móvil, 0 en
   * calidad baja), apagándose poco a poco antes de cambiar de farol (sin saltos). Además, siempre: la luz del portal
   * (late y se aviva al entrar) y una luz suave que acompaña a tu Pokémon (que se vea bien de noche).
   */
  let lamps = [], pool = [], plLight = null, altarLight = null, altarLamp = null, boost = 0;
  function lamp(x, y, z, col, k = 1, dist = 220, main = false) {
    if (dry) return;
    const L = { x, y, z, c: new T.Color(col), k, dist };
    if (main) altarLamp = L; else lamps.push(L);
  }
  function makeLights() {
    // (Para medir: con ?dev, window.PS_VIL_LIGHTS = [montón, tuya 0/1, altar 0/1] antes de que se monte la aldea.)
    const dbg = /[?&]dev/.test(location.search) && typeof window !== 'undefined' && window.PS_VIL_LIGHTS;
    const n = dbg ? dbg[0] : fx() === 0 ? 0 : mobile() ? 1 : 4;
    pool = [];
    for (let i = 0; i < n; i++) { const L = new T.PointLight(0xffffff, 0, 220, 1); scene.add(L); pool.push(L); }
    plLight = !dbg || dbg[1] ? new T.PointLight(0xfff0dc, 0, 240, 1) : null;
    if (plLight) scene.add(plLight);
    altarLight = (dbg ? dbg[2] : fx() > 0) ? new T.PointLight(0xe070ff, 0, 420, 1) : null;
    if (altarLight) scene.add(altarLight);
  }
  const LAMP_I = 95, PLAYER_I = 62;
  function setLights(view, l, t) {
    const gk = 0.7 + 0.45 * l.night;
    if (plLight) {
      const p = view.player;
      if (p) plLight.position.set(p.x, 48 + (p.z || 0), p.y + 8);
      plLight.intensity = p ? PLAYER_I * gk : 0;
    }
    if (altarLight && altarLamp) {
      const a = altarLamp;
      altarLight.position.set(a.x, a.y, a.z);
      altarLight.color.copy(a.c);
      altarLight.distance = a.dist * (1 + boost * 0.6);
      altarLight.intensity = LAMP_I * a.k * gk * (0.85 + 0.15 * Math.sin(t * 2.2)) * (1 + boost * 2.5);
    }
    if (!pool.length) return;
    const cx = view.cx, cz = view.cy;
    const by = lamps.map(L => [(L.x - cx) ** 2 + (L.z - cz) ** 2, L]).sort((a, b) => a[0] - b[0]);
    const next = by.length > pool.length ? Math.sqrt(by[pool.length][0]) : 1e9;
    pool.forEach((P, i) => {
      const e = by[i];
      if (!e) { P.intensity = 0; return; }
      const L = e[1], d = Math.sqrt(e[0]), w = next >= 1e9 ? 1 : sat((next - d) / Math.max(40, next * 0.3));
      P.position.set(L.x, L.y, L.z);
      P.color.copy(L.c);
      P.distance = L.dist;
      P.intensity = LAMP_I * L.k * gk * w;
    });
  }

  /** Niebla baja: dos capas de nubes a píxeles que se deslizan despacio (cubren los pies: parece que caminan en ella). */
  let mistMats = [];
  function buildMist() {
    if (fx() === 0) return;
    const VG = V(), W = VG.W * TS, Hh = VG.H * TS;
    // (Pulido) Nubes suaves que se repiten sin costura (antes, tres tonos a escalones).
    const mk = () => soft(128, 128, (x, y) => {
      const v = sstep(0.42, 0.78, pn(x, y, 40, 501, 128));
      return mixc([0, 0, 0], [122, 184, 200], v);
    });
    for (const [y, op, sp, rep] of [[7, 0.16, 6, 12], [30, 0.07, -4, 8]]) {
      const t = stex(mk());
      t.repeat.set(rep / 2, rep / 2 * Hh / W);
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
    'attribute float aSeed; attribute vec3 aCol; uniform float uTime; uniform float uMode; uniform float uSize; uniform float uAlpha; uniform float uPx;',
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
    '  } else if (uMode < 4.5) {',
    '    float c = fract(uTime * 0.5 + s);',
    '    float a = s * 6.2832;',
    '    p.x += cos(a) * c * 26.0; p.z += sin(a) * c * 20.0; p.y += c * (1.0 - c) * 120.0;',
    '    vA = 1.0 - c;',
    // (13-11-2026) El altar: motas que suben del círculo (las de abajo) y que caen en espiral al portal (las del arco).
    '  } else if (position.y < 50.0) {',
    '    float c = fract(uTime * 0.38 + s * 7.0), a = s * 157.0 + uTime * 0.8, rr = 34.0 * (0.25 + fract(s * 13.0) * 0.75) * (1.0 - c * 0.5);',
    '    p.x += cos(a) * rr; p.z += sin(a) * rr * 0.7; p.y += c * 170.0;',
    '    vA = sin(c * 3.1416);',
    '  } else {',
    '    float k = fract(uTime * 0.42 + s * 5.0), a = s * 91.0 + k * 5.0, rad = 84.0 * (1.0 - k);',
    '    p.x += cos(a) * rad; p.y += sin(a) * rad; p.z += 4.0;',
    '    vA = smoothstep(0.0, 0.25, k) * (1.0 - smoothstep(0.85, 1.0, k));',
    '  }',
    '  vA *= uAlpha;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '  gl_PointSize = max(1.5, uSize * uPx / gl_Position.w);',
    '}'].join('\n');
  // (Pulido) Motas redondas con el borde suave y un núcleo claro (antes, cuadrados de 2 px).
  const PF = 'varying float vA; varying vec3 vC; void main(){ if (vA < 0.04) discard; vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard;' +
    ' float a = vA * (1.0 - smoothstep(0.35, 1.0, d)); gl_FragColor = vec4(mix(vC, vec3(1.0), (1.0 - smoothstep(0.0, 0.4, d)) * 0.5), a);\n#include <colorspace_fragment>\n}';
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
    // size: en px de arte de antes (2 unidades de mundo cada uno); ahora va en mundo y se ve igual de grande a cualquier resolución.
    const m = new T.ShaderMaterial({ uniforms: { uTime: uni.time, uMode: { value: mode }, uSize: { value: size * PX * 1.6 }, uAlpha: alphaU || { value: 1 }, uPx: uni.px },
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

  /*
   * Halos de luz (pulido 12-11-2026: «quizá bloom suave para la bioluminiscencia»). Un bloom de verdad (dibujar la
   * escena aparte, difuminar y sumar) cuesta varias pasadas a pantalla completa: en el iPhone, demasiado. En su lugar, cada
   * cosa que brilla deja un halo (x, y, z, color, tamaño en mundo, fuerza) y todos van en un solo dibujo de puntos que se
   * suman, del tamaño que toque con la perspectiva. Lo que tapa al halo lo tapa (prueba de profundidad), así que se ve
   * como un resplandor alrededor de la luz. Se avivan de noche, como lo que brilla.
   */
  let haloQ = [];
  function halo(x, y, z, col, size = 40, k = 1) { if (fx() > 0) haloQ.push([x, y, z, col, size, k]); }
  const HV = ['attribute vec3 aCol; attribute float aSize; attribute float aSeed; uniform float uTime; uniform float uPx; uniform float uNight;',
    'varying vec3 vC; varying float vA;',
    'void main(){ vC = aCol; vA = (0.5 + 0.5 * uNight) * (0.86 + 0.14 * sin(uTime * 1.6 + aSeed * 6.2832));',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = min(256.0, aSize * uPx / gl_Position.w); }'].join('\n');
  const HF = 'varying vec3 vC; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard;' +
    ' float a = pow(1.0 - d, 2.2) * 0.75 + exp(-d * d * 18.0) * 0.35; gl_FragColor = vec4(vC, a * vA);\n#include <colorspace_fragment>\n}';
  function halos(list) {
    const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
    list.forEach(([x, y, z, c, sz, k], i) => {
      pos.set([x, y, z], i * 3);
      const C = new T.Color(c);
      col.set([C.r * k, C.g * k, C.b * k], i * 3);
      size[i] = sz; seed[i] = H(i, x | 0, 7);
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new T.BufferAttribute(col, 3));
    g.setAttribute('aSize', new T.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
    const m = new T.ShaderMaterial({ uniforms: { uTime: uni.time, uPx: uni.px, uNight: uni.night }, vertexShader: HV, fragmentShader: HF,
      transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending });
    disposables.push(g, m);
    const o = new T.Points(g, m);
    o.frustumCulled = false;
    o.renderOrder = 18;
    (sink || scene).add(o);
    return o;
  }

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
      fragmentShader: (gl2 ? CRISP : 'vec4 crispTex(sampler2D t, vec2 uv) { return texture2D(t, uv); }') + '\nuniform sampler2D uMap; uniform vec3 uTint; varying vec2 vUv; varying vec3 vC; void main(){ vec4 c = crispTex(uMap, vUv); if (c.a < 0.5) discard; vec3 col = c.rgb * uTint; if (c.r > 0.95 && c.g > 0.95 && c.b > 0.95) col = vC; gl_FragColor = vec4(col, 1.0);\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: true, extensions: { derivatives: true }
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
      uni = { time: { value: 0 }, night: { value: 1 }, px: { value: KL }, tint: { value: new T.Vector3(1, 1, 1) }, tintCol: new T.Color(1, 1, 1), player: { value: new T.Vector3() } };
      haloQ = []; glowQ = new Map(); lamps = []; altarLamp = null; boost = 0;
      amb = new T.AmbientLight(0xffffff, 0.6 * Math.PI);
      // (Pulido) Luz de cielo y suelo: lo de arriba algo más azul que lo de abajo (los modelos dejan de verse planos).
      hemi = new T.HemisphereLight(0x9cb0ff, 0x2c5a48, 0.3 * Math.PI);
      scene.add(hemi);
      sun = new T.DirectionalLight(0xffffff, 0.3 * Math.PI);
      sun.castShadow = fx() > 0;
      const ms = mobile() ? 1024 : G.Settings && G.Settings.max ? 4096 : 2048;      // (Máxima: sombras más finas)
      sun.shadow.mapSize.set(ms, ms);
      sun.shadow.bias = -0.002;
      const sc = sun.shadow.camera, half = Math.max(V().W, V().H) * TS * 0.62;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 10; sc.far = 6000;
      sc.updateProjectionMatrix();
      sun.target.position.set(V().W * TS / 2, 0, V().H * TS / 2);
      scene.add(amb, sun, sun.target);
      batch = new Map();
      solidList = []; curId = '';
      buildGround();
      buildWater();
      V().PLACES.forEach((p, i) => {
        const k = p.look.kind;
        curId = 'p:' + p.id;
        if (k === 'pod') pod(p, i); else if (k === 'stall') stall(p, i); else if (k === 'mush') mush(p, i);
        else if (k === 'board') board(p, i); else if (k === 'case') showcase(p, i); else if (k === 'podium') podium(p, i);
        else if (k === 'mailbox') mailbox(p, i); else if (k === 'pc') pc(p, i); else if (k === 'altar') altar(p, i);
      });
      V().DECOR.forEach((d, i) => { curId = 'd:' + i + ':' + d.k; decor(d); });
      curId = '';
      flush();
      buildTufts();
      buildMist();
      // Partículas: esporas que flotan (siempre) y que caen, chispas y el manantial.
      const VG = V(), f = fx();
      const mx = G.Settings && G.Settings.max;          // (Máxima: más esporas y luciérnagas)
      const nFly = f === 0 ? 14 : f === 1 ? 24 : mx ? 64 : 36, nPet = f === 0 ? 6 : f === 1 ? 12 : mx ? 30 : 18;
      const spots = (n, s) => Array.from({ length: n }, (_, i) => [(3 + H(i, s, 1) * (VG.W - 6)) * TS, 0, (3 + H(i, s, 2) * (VG.H - 6)) * TS]);
      uni.flyA = { value: 1 }; uni.petA = { value: 0.7 };
      particles(0, spots(nFly, 1), [CYAN, GREEN, '#d8ff70', PINK], 2, true, uni.flyA);
      particles(1, spots(nPet, 2), ['#8affff', '#c0ffd0', '#ffc0f0'], 2, true, uni.petA);
      if (sparkQ.length) particles(3, sparkQ, ['#fff6b0', '#ffffff', '#b8e0ff', '#ffb8f0'], 2, true);
      if (altarPts) {
        const na = f === 0 ? 10 : mobile() ? 18 : 30;
        uni.altA = { value: 1 };
        particles(5, Array.from({ length: na * 2 }, (_, k) => k < na ? altarPts.pad : altarPts.ring), ['#ff9ae8', '#9af6ff', '#ffffff', '#c8a0ff'], 2.2, true, uni.altA);
      }
      if (sprayQ.length) particles(4, sprayQ.flatMap(p => Array.from({ length: f === 0 ? 8 : 18 }, () => p)), ['#8affff', '#ffffff', '#5ff0ff'], 2, true);
      sparkQ.length = sprayQ.length = 0;
      if (haloQ.length) halos(haloQ);
      haloQ = [];
      flushGlows();
      makeLights();
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

  /**
   * Para los tests (sin WebGL ni lienzo de verdad): monta los modelos con three.js y devuelve lo que choca, con tu choza
   * como cfg. → { fixed: [{ id, pts }], home: [{ id, pts }] }. No deja nada montado. homeOnly: sólo tu choza (fixed vacío).
   */
  function collect(THREE, cfg, homeOnly) {
    T = THREE; gl2 = false; dry = true;
    scene = new T.Scene(); sink = null;
    uni = { time: { value: 0 }, night: { value: 1 }, px: { value: 1 }, tint: { value: new T.Vector3(1, 1, 1) }, tintCol: new T.Color(1, 1, 1), player: { value: new T.Vector3() } };
    batch = new Map(); hulls = []; solidList = []; curId = ''; haloQ = []; glowQ = new Map();
    if (!homeOnly) {
      solidList.push({ id: 'pond', pts: pondShape() });
      V().PLACES.forEach((p, i) => {
        const k = p.look.kind;
        curId = 'p:' + p.id;
        if (k === 'pod') pod(p, i); else if (k === 'stall') stall(p, i); else if (k === 'mush') mush(p, i);
        else if (k === 'board') board(p, i); else if (k === 'case') showcase(p, i); else if (k === 'podium') podium(p, i);
        else if (k === 'mailbox') mailbox(p, i); else if (k === 'pc') pc(p, i); else if (k === 'altar') altar(p, i);
      });
      V().DECOR.forEach((d, i) => { curId = 'd:' + i + ':' + d.k; decor(d); });
    }
    const fixedS = solidList;
    solidList = []; curId = 'home';
    buildHome(cfg || G.Home.DEFAULT, []);
    const homeS = solidList;
    solidList = []; curId = ''; batch = null; hulls = []; sparkQ.length = sprayQ.length = 0; haloQ = []; tufts.length = 0; glowQ = new Map(); lamps = []; altarLamp = null;
    for (const d of disposables) { try { d.dispose(); } catch (e) { /* nada */ } }
    disposables = []; mats.clear(); glowMats.clear(); glowList = []; anim = []; scene = null; signs = null; dry = false;
    return { fixed: fixedS, home: homeS };
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
    m = crisp(new T.MeshBasicMaterial({ map: tex(c), transparent: true, opacity: 0.4, depthWrite: false }));
    disposables.push(m);
    shadowMats.set(R, m);
    return m;
  }
  function baseOf(img) {
    let t = baseTex.get(img);
    if (!t) {
      t = new T.Texture(img);
      t.magFilter = t.minFilter = gl2 ? T.LinearFilter : T.NearestFilter;      // (nítido con crisp; ver arriba)
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
    const pf = !!(G.PixFilter && G.PixFilter.on && gl2 && !e.holo);
    if (s && s.pf !== pf) { unsprite(e); s = null; }        // (al encender o apagar el filtro, su material nuevo)
    if (!s) {
      if (!planeGeo) { planeGeo = new T.PlaneGeometry(1, 1); planeGeo.__keep = true; }
      const m0 = new T.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, depthWrite: true }), mat = pf ? pixSmooth(m0) : crisp(m0);
      if (e.holo) { mat.depthWrite = false; mat.blending = T.AdditiveBlending; mat.alphaTest = 0.3; }
      const mesh = new T.Mesh(planeGeo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = e.holo ? 13 : 5;
      const meta = G.Sprites.meta(e.anim.dex), R = Math.round([5, 8, 12][Math.max(0, Math.min(2, meta ? meta.s : 1))] * e.anim.scale);
      const shadow = new T.Mesh(planeGeo, shadowMat(R));
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(R * 2 * PX, Math.max(1, Math.round(R * 0.42)) * 2 * PX, 1);
      shadow.frustumCulled = false; shadow.renderOrder = 1;
      scene.add(mesh, shadow);
      s = { mesh, mat, shadow, tex: new Map(), R, pf };
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
    // (Pulido) A la rejilla de px del lienzo (antes, a la del arte: a saltos de 2 unidades): se mueven suaves y nítidos.
    const g = 1 / KL, left = Math.round((e.x - m.ax * k) / g) * g, top = Math.round((m.ay * k + (e.z || 0)) / g) * g;
    s.mesh.scale.set(m.w * k, m.h * k, 1);
    s.mesh.position.set(left + m.w * k / 2, top - m.h * k / 2, e.y + 1);
    const sh2 = Math.max(1, Math.round(s.R * 0.42)) * 2 * PX;
    s.shadow.position.set(Math.round(e.x / g) * g, 0.8 + (e.gz || 0), Math.round(e.y / g) * g - sh2 / 2 + PX);
    if (e.fade != null) { s.mat.opacity = e.fade; s.mat.transparent = true; s.mat.alphaTest = e.fade < 0.99 ? 0.02 : 0.5; s.shadow.visible = s.shadow.visible && e.fade > 0.5; }
    if (e.holo) { const fl = 0.75 + 0.25 * Math.sin(uni.time.value * 11) * Math.sin(uni.time.value * 3.3); s.mat.color.setRGB(0.25 * fl, 0.95 * fl, 1.1 * fl); return; }
    // De noche los Pokémon se tiñen algo (sin perderse). (13-11-2026, «se ve demasiado oscuro») Menos que antes, y tu
    // Pokémon casi nada: que se vea bien siempre.
    const tc = uni.tintCol, f = e.flash ? 1 + e.flash : 1, a0 = e.lit ? 0.86 : 0.64, a1 = 1.06 - a0;
    s.mat.color.setRGB(f * (a0 + tc.r * a1), f * (a0 + tc.g * a1), f * (a0 + tc.b * a1));
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
    amb.color.setRGB(...l.amb); amb.intensity = l.ai * 0.72 * Math.PI;
    if (hemi) hemi.intensity = l.ai * 0.5 * Math.PI;
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
    // Resolución (pulido): px físicos de la pantalla × la calidad, con tope de px por fotograma; nunca menos que antes.
    const dpr = Math.min(Q.dprCap(), Math.max(1, (G.Camera && G.Camera.dpr) || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)));
    let k = view.scale * dpr * Q.q;
    const area = view.w * view.h * k * k, mp = Q.maxPx();
    if (area > mp) k *= Math.sqrt(mp / area);
    KL = Math.max(0.5, Math.round(k * 32) / 32);
    uni.px.value = KL;
    const wl = Math.ceil(view.w * KL) + 4, hl = Math.ceil(view.h * KL) + 4;
    if (wl !== Wl || hl !== Hl) { Wl = wl; Hl = hl; renderer.setSize(Wl, Hl, false); }
    const hw = view.w / 2, hh = view.h / 2, a = view.K / hh, b = a;
    const cxs = Math.round(view.cx * KL) / KL, czs = Math.round(view.cy * KL) / KL;
    const Cx = Math.round(Wl / 2), Cy = Math.round(Hl / 2);
    const R = view.scale / KL;
    // (A px físicos enteros: el lienzo se copia sin remuestrear cuando va a la resolución nativa.)
    const ox = Math.round(((cxs - view.cx + hw) * view.scale - Cx * R) * dpr) / dpr, oy = Math.round(((czs - view.cy + hh) * view.scale - Cy * R) * dpr) / dpr;
    // En (X, Y, Z): w = 1 − a·(Z − cz) − b·Y; x de pantalla ∝ (X − cx)/w; y ∝ (Z − cz − Y)/w (lo alto sube).
    const w = [0, -b, -a, 1 + a * czs];
    const xr = [2 * KL / Wl, 0, 0, -2 * KL * cxs / Wl].map((v, i) => v + (2 * Cx / Wl - 1) * w[i]);
    const yr = [0, 2 * KL / Hl, -2 * KL / Hl, 2 * KL * czs / Hl].map((v, i) => v + (1 - 2 * Cy / Hl) * w[i]);
    const A = 1.2727, B = 0.6818;
    const zr = w.map((v, i) => A * v + (i === 3 ? -B : 0));
    P.set([...xr, ...yr, ...zr, ...w]);
    cam3.projectionMatrix.set(...P);
    cam3.projectionMatrixInverse.copy(cam3.projectionMatrix).invert();
    view.proj = { cxs, czs, Cx, Cy, a, b, R, ox, oy, KL };
    uni.time.value = t;
    if (view.player) uni.player.value.set(view.player.x, 0, view.player.y);
    setLight(light, t);
    boost = Math.max(0, Math.min(1, view.boost || 0));
    setLights(view, light, t);
    if (padU) padU.uOn.value += ((view.onPad ? 1 : 0) - padU.uOn.value) * Math.min(1, dt * 6);
    if (portalU) portalU.uBoost.value = boost;
    if (uni.altA) uni.altA.value = 1 + boost * 2;
    for (const o of anim) o.fn(t, dt);
    if (mailPivot) mailPivot.rotation.z = view.mail ? 0 : -Math.PI / 2;
    try { renderer.render(scene, cam3); } catch (e) { console.warn('[Aldea] fallo al dibujar:', e); return null; }
    return { cv: glcv, Wl, Hl, ox, oy, k: R, smooth: R * dpr < 0.98 };
  }

  /** Punto del mundo (x, y del suelo; z de alto) → px CSS de la pantalla (con la cámara del último render). */
  function toScreen(view, x, y, z = 0) {
    const p = view.proj;
    if (!p) return { x: 0, y: 0 };
    const w = 1 - p.a * (y - p.czs) - p.b * z;
    return { x: p.ox + (p.Cx + p.KL * (x - p.cxs) / w) * p.R, y: p.oy + (p.Cy + p.KL * (y - p.czs - z) / w) * p.R };
  }
  /** px CSS de la pantalla → punto del suelo. */
  function toWorld(view, sx, sy) {
    const p = view.proj;
    if (!p) return { x: 0, y: 0 };
    const u = ((sx - p.ox) / p.R - p.Cx) / p.KL, v = ((sy - p.oy) / p.R - p.Cy) / p.KL;
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
    glowQ = new Map(); lamps = []; pool = []; plLight = null; altarLight = null; altarLamp = null; padU = null; portalU = null; altarPts = null; boost = 0;
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

  return { probe, start, build, render, sprite, unsprite, toScreen, toWorld, free, setHome, collect, heightAt,
    /** El altar: el centro del círculo donde ponerse y del portal (mundo; z: alto). */
    altar: () => { const p = V().PLACES[0]; return { pad: [tile(p.door[0]), tile(p.door[1])], ring: [tile(p.x), tile(p.y) - ALTAR_Z, ALTAR_CY], R: ALTAR_R, padR: PAD_R }; },
    /** Alto (mundo) de lo de encima de un sitio (su nombre va ahí). */
    top: id => tops[id] || 0,
    /** Lo que choca: [{ id, pts }] (cascos convexos en el suelo, en mundo), lo fijo y tu choza. */
    solids: () => solidList.concat(home && home.solids || []),
    get ready() { return built && !lost; }, get lost() { return lost; }, get started() { return !!renderer; }, get failed() { return failed; },
    /** Para depurar (sólo con ?dev): la escena. */
    get scene() { return /[?&]dev\b/.test(location.search) ? scene : null; },
    /** Para pruebas: cuántas mallas y llamadas de dibujo. */
    stats() { return renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, texs: renderer.info.memory.textures, W: Wl, H: Hl, KL, q: Q.q, step: Q.i, gl2, aa: fx() > 0 } : null; },
    /** Calidad automática: village.js le pasa lo que tarda cada fotograma mientras paseas. */
    tune: dt => Q.tune(dt), perf: PERF,
    /** Para pruebas y capturas: fija la calidad (null: automática). */
    quality(q) { Q.fixed = q == null ? null : q; },
    /** (12-11-2026) Las texturas suaves y el muestreo nítido, también para el mundo de la partida (ultra3d.js). */
    forestPlan: (VG, k) => forestPlan(VG || V(), k),
    paint: { soft, pn, tone, rgb, mixc, sat, sstep, seam, shade, ramp, planks, bark, foliage, CRISP } };
})();
