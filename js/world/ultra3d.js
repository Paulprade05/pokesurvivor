/* ============ ultra3d.js — Ultra 3D: paredes, rocas y cofres en 3D de verdad (WebGL, three.js) ============
 * Pedido del dueño (01-11-2026): con la calidad Ultra, las paredes, las piedras y los cofres con volumen de verdad, no un
 * 3D pintado. Es sólo dibujo: choques, reparto de objetos y red no cambian.
 *
 * (12-11-2026, pulido pedido por el dueño: «que los muros, rocas y cofres tengan el mismo estilo de pulición que la aldea»)
 * Lo mismo que se hizo en la aldea del menú (village3d.js):
 *  - a la resolución de la pantalla (en PC; con tope de píxeles y calidad automática que la baja si van lentos los
 *    fotogramas) y con antialias (MSAA). En móvil, a la escala de siempre (no cuesta más) y ampliado suavizado;
 *  - las rocas, lisas: una esfera deformada con ruido suave, sombreado continuo, textura suave del tono de roca del mapa
 *    (con mipmaps), musgo y grietas suaves al romperse, y su contorno del tono oscuro del mapa;
 *  - los cofres, modelados: cuerpo de tablas con las esquinas redondeadas, tapa abombada, flejes y cerradura de oro que
 *    brillan (Phong) y un halo de luz en el suelo; el cofre con candado, granate y con más oro;
 *  - las paredes: su pixel art del tileset (arriba y la cara) se muestrea nítido (crisp, como el suelo de la aldea) y la
 *    cara se oscurece suave hacia el pie (oclusión);
 *  - luz de cielo y suelo (HemisphereLight) y sombras con el borde suave (PCF; en Máxima, mapa de 4096).
 *
 * (13-11-2026, el dueño: «que las rocas, las setas, los cofres, grietas y más elementos de la partida también sean en 3D
 *  nítido») Además, con instancing: árboles, torres de poder, manantiales, setas explosivas, flora que brilla y el portal
 *  de la grieta (modelos en props3d.js; ver «instancing» abajo). La hierba alta sigue en pixel art. Móvil: en 2D.
 *
 * Cómo va:
 *  - three.js (js/vendor/three/, r160, MIT) se carga sólo con Ultra (o Máxima) y el ajuste «Ultra en 3D» encendidos (como
 *    módulo, three-boot.js). Sin WebGL, si falla o si se pierde el contexto, vuelve solo el Ultra 2D de siempre (world.js
 *    levanta las paredes dibujadas otra vez). Necesita el tileset de Mundo Misterioso del bioma: sin él, también el 2D.
 *  - La cámara es la misma de game.js (D3 / G.Camera.toScreen): la homografía del suelo q = 1 − a·dv, escrita como matriz
 *    de proyección de una cámara de verdad. Lo alto (z, en unidades de mundo «de pantalla»: sube en la pantalla lo que
 *    mide) va como los sprites de pie: a la escala del sitio que pisa. Así encaja casilla a casilla con el suelo 2D, los
 *    Pokémon y los proyectiles.
 *  - Orden de dibujo: cada fila de pared y cada roca o cofre entra en el orden por Y de game.js como los demás objetos.
 *    Lo seguido sin nada 2D en medio va en una sola pasada (render con tijera + drawImage de ese trozo), así un Pokémon
 *    detrás de una pared queda tapado y uno delante, encima.
 *  - Geometría: por chunk, una malla por fila con paredes (arriba + caras), y sombras de verdad (también en el suelo: un
 *    plano que sólo recibe sombra, que va justo después del suelo). Contorno oscuro por «casco invertido».
 *  - Memoria (iPhone): en móvil el lienzo pequeño de siempre, un mapa de sombras de 512 y sin MSAA; los lienzos de las
 *    texturas se sueltan al subirlas y los chunks que se dejan de ver se liberan.
 */
G.Ultra3D = (() => {
  let KL = 0.5;              // px del lienzo 3D por unidad de mundo (lo pone begin según la pantalla y la calidad)
  const HW = 40;             // alto de las paredes (20 px de arte: G.Tileset.FH3, cara de roca y su pie en sombra)
  const KEEP = 6;            // chunks con mallas guardados de más (además de los de la vista y su margen)
  const OWN = { chest: 1, bigchest: 1 };            // (los cofres, un objeto cada uno: la tapa se abre; lo demás, instancing)
  const L = [-0.45 / 1.25, -0.6 / 1.25, 1 / 1.25];          // hacia la luz (arriba a la izquierda y del norte)
  let T = null, state = 'idle', lost = false, gl2 = false, aniso = 1, mob = false;
  let renderer = null, glcv = null, scene, cam3, sun, hemi, plane, frame = 0, tinted = -1;
  let Wl = 0, Hl = 0, R = 1, Ox = 0, Oy = 0;
  const P = new Float64Array(16);                          // la proyección (por filas), también para las cajas de tijera
  const chunks = new Map();                                // "cx,cy" -> { c, bi, rows: [{ ty, mesh }], tex, top, used }
  const faceMats = new Map(), rockMats = new Map(), flashMats = new Map();
  const props = new Map();                                 // id -> { obj, p, used, ... }
  let shared = null;                                       // geometrías y materiales de rocas y cofres (los mismos siempre)
  let shownRows = [], nBuilt = 0, nPass = 0, nShadow = 0, shadowDirty = true;                                      // filas de la vista (para game.js)
  const lay = new Set();                                   // objetos en la capa de la pasada actual
  let glowSeen = [];                                       // cofres a la vista este fotograma (su halo en el suelo)
  /*
   * (Partida en 3D, 13-11-2026) Lo demás que sobresale del mapa (árboles, cristales, torres, manantiales,
   * setas, flora y las rocas) va con instancing: una InstancedMesh por modelo (props3d.js) y su contorno, que comparten
   * las matrices. En cada pasada se escriben sólo los de ese lote (count = los suyos): 2 llamadas de dibujo por modelo a
   * la vista, con cualquier número de objetos. Para el mapa de sombras, todos.
   */
  const uni = { time: { value: 0 } };                      // (el viento de los modelos)
  const kinds = new Map();                                 // "bi:modelo" -> { im, ih, cap, n, used }
  const ins = new Map();                                   // id -> { key, x, y, z, a, s, c, w, h, cast } a la vista este fotograma
  let allIns = [], insSig = 0, floraOn = false, okAt = -1e9;

  /*
   * (Pulido 12-11-2026) En PC, con calidad alta, las rocas y los cofres van en 3D también con la vista normal (sin
   * Ultra): se dibujan con la misma cámara sin perspectiva (game.js D3 con persp 0). Las paredes siguen siendo el tileset
   * plano de Mundo Misterioso (con la penumbra suave de atmos.js). En móvil, la vista normal sigue en 2D: no cuesta más.
   */
  // (Partida en 3D, 13-11-2026) Para medir en móvil: localStorage ps.u3.mob = 1 lo enciende también allí (ver docs).
  let mobTry = false;
  try { mobTry = localStorage.getItem('ps.u3.mob') === '1'; } catch (e) { /* nada */ }
  const flatOk = () => (mobTry || (!G.U.IOS && !G.Settings.touch)) && G.Settings.fx >= 2;
  const wanted = () => !!((G.Settings.ultra || flatOk()) && G.Settings.get('ultra3d') !== false && G.Tileset && G.Tileset.enabled());
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
      mob = !!(G.U.IOS || G.Settings.touch);
      glcv = document.createElement('canvas');
      glcv.width = glcv.height = 16;
      glcv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
      // (Al volver el contexto, lo de antes ya no existe en la GPU: se olvida sin borrarlo y se rehace al dibujar.)
      glcv.addEventListener('webglcontextrestored', () => { dropAll(true); lost = false; });
      // ¿Hay WebGL? (si no, three.js lo dice con un error en la consola: se mira antes y se queda el 2D)
      const probe = document.createElement('canvas'), gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) throw Error('sin WebGL');
      const lc = gl.getExtension('WEBGL_lose_context');
      if (lc) lc.loseContext();
      // (Pulido) Antialias en PC; en móvil, como siempre (el lienzo pequeño, sin MSAA: memoria y batería).
      renderer = new T.WebGLRenderer({ canvas: glcv, antialias: !mob, alpha: true, depth: true, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = mob ? T.BasicShadowMap : T.PCFSoftShadowMap;      // (PC: borde de sombra suave)
      renderer.shadowMap.autoUpdate = false;
      const cap = renderer.capabilities || {};
      gl2 = !!cap.isWebGL2;
      aniso = mob ? 1 : Math.min(8, cap.getMaxAnisotropy ? cap.getMaxAnisotropy() : 1);
      scene = new T.Scene();
      scene.matrixWorldAutoUpdate = false;
      cam3 = new T.Camera();
      cam3.matrixAutoUpdate = false;
      // Luz del arte: de arriba a la izquierda y algo del norte (la cara de delante, en sombra suave como en el 2D).
      // Lambert de three r160: lo que llega se divide entre π; arriba sale el color justo de la textura (0,6 + 0,5·0,8 = 1).
      // (Pulido) La luz de ambiente es de cielo y suelo: lo que mira abajo y los lados, algo más oscuros (como en la aldea).
      // (Los ejes del juego llevan z arriba: la luz de cielo va de +z.)
      hemi = new T.HemisphereLight(0xffffff, 0x8a8478, 0.6 * Math.PI);
      hemi.position.set(0, 0, 1);
      hemi.updateMatrixWorld();
      sun = new T.DirectionalLight(0xffffff, 0.5 * Math.PI);
      sun.castShadow = true;
      const ms = mob ? 512 : G.Settings.max ? 4096 : 2048;
      sun.shadow.mapSize.set(ms, ms);
      sun.shadow.bias = mob ? -0.0015 : -0.0006;
      sun.shadow.normalBias = mob ? 0 : 0.6;
      sun.shadow.radius = 3;
      sun.shadow.camera.near = 10; sun.shadow.camera.far = 3000;
      // (three.js también mira las capas de las luces: en todas, si no las pasadas salen negras.)
      hemi.layers.enableAll(); sun.layers.enableAll();
      scene.add(hemi, sun, sun.target);
      plane = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShadowMaterial({ opacity: 0.38, side: T.DoubleSide }));
      plane.receiveShadow = true;
      plane.layers.set(2);
      plane.frustumCulled = false;
      scene.add(plane);
      Q.init();
      if (G.Props3D) G.Props3D.init(T, mob, stex, uni);
      state = 'ready';
    } catch (e) {
      state = 'fail';
      if (renderer) try { renderer.dispose(); } catch (e2) { /* nada */ }
      renderer = null;
    }
  }

  /*
   * Calidad automática (como la de la aldea, Q de village3d.js). q: la parte de la resolución nativa que se dibuja. Si los
   * fotogramas van por debajo de ~42 FPS un par de segundos, baja un escalón; si van holgados un rato, sube. En móvil no
   * cuenta: va siempre a la escala del arte (la de antes). Con Máxima, hasta toda la resolución; con Ultra, el 85 %.
   */
  const Q = {
    STEPS: [1, 0.85, 0.72, 0.6, 0.5], i: 0, ema: 1 / 60, slow: 0, fast: 0, last: 0,
    init() { let i = 0; try { i = +localStorage.getItem('ps.u3.q') || 0; } catch (e) { /* nada */ } this.i = Math.max(0, Math.min(this.STEPS.length - 1, i | 0)); },
    get q() { return this.STEPS[this.i]; },
    save() { try { localStorage.setItem('ps.u3.q', String(this.i)); } catch (e) { /* nada */ } },
    tune() {
      const now = performance.now(), dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0) || dt > 0.25) return;
      this.ema += (dt - this.ema) * 0.08;
      if (this.ema > 1 / 42) { this.slow += dt; this.fast = 0; } else if (this.ema < 1 / 57) { this.fast += dt; this.slow = 0; } else { this.slow = Math.max(0, this.slow - dt); this.fast = 0; }
      if (this.slow > 1.8 && this.i < this.STEPS.length - 1) { this.i++; this.slow = 0; this.ema = 1 / 50; this.save(); }
      else if (this.fast > 8 && this.i > 0) { this.i--; this.fast = 0; this.save(); }
    }
  };

  // ---------------- texturas y materiales ----------------
  /** Pixel art (paredes del tileset): sin mipmaps; con WebGL2 filtrado lineal y muestreo nítido (crisp); si no, el más cercano. */
  function tex(cv, repeat = false) {
    const t = new T.CanvasTexture(cv);
    // (En móvil el lienzo va a la escala del arte: al píxel más cercano ya es nítido, y más barato.)
    t.magFilter = t.minFilter = gl2 && !mob ? T.LinearFilter : T.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) t.wrapS = T.RepeatWrapping;
    // (iPhone) El lienzo ya no hace falta al subirla: se suelta (si se pierde el contexto, se rehace todo).
    t.onUpdate = () => { if (!repeat) G.U.freeCanvas(cv); };
    return t;
  }
  /** Textura suave de un modelo (roca, madera): lineal con mipmaps y anisotropía. */
  function stex(cv) {
    const t = new T.CanvasTexture(cv);
    t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = aniso;
    t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.onUpdate = () => { G.U.freeCanvas(cv); t.onUpdate = null; };
    return t;
  }
  // Muestreo nítido del pixel art: cada texel, un cuadrado limpio con el borde suavizado medio píxel (como village3d.js).
  const CRISP = ['vec4 crispTex(sampler2D t, vec2 uv) {',
    '  vec2 sz = vec2(textureSize(t, 0)), p = uv * sz, s = floor(p + 0.5);',
    '  vec2 d = max(fwidth(p), vec2(1e-4));',
    '  p = s + clamp((p - s) / d, -0.5, 0.5);',
    '  return texture2D(t, p / sz);', '}'].join('\n');
  function crisp(m) {
    if (!gl2 || mob) return m;
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', CRISP + '\nvoid main() {')
        .replace('#include <map_fragment>', '#ifdef USE_MAP\n  diffuseColor *= crispTex(map, vMapUv);\n#endif');
    };
    m.customProgramCacheKey = () => 'u3crisp';
    return m;
  }
  const lambert = (map, vc = false) => crisp(new T.MeshLambertMaterial({ map, side: T.DoubleSide, shadowSide: T.DoubleSide, vertexColors: vc }));
  const K = () => G.Village3D && G.Village3D.paint;          // texturas suaves de la aldea (soft, pn, tone...)

  function faceMat(bi) {
    let m = faceMats.get(bi);
    if (!m) { const cv = G.Tileset.face3d(bi); if (!cv) return null; m = lambert(tex(cv, true), true); m.fw = cv.width; faceMats.set(bi, m); }
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

  /*
   * Textura de roca del bioma (128 px, se repite sin costura): sus 4 tonos de roca en tonos continuos, vetas, motas de
   * mineral y musgo del verde del mapa a manchas. Rota: grietas oscuras con el borde suave.
   */
  function rockMat(bi, cracked) {
    const k = bi + (cracked ? 'x' : '');
    let m = rockMats.get(k);
    if (m) return m;
    const pal = G.Tileset.pal(bi), kit = K();
    const tones = pal ? pal.rock : ['#55535e', '#73717f', '#8e8c9d', '#a7a4b8'], edge = pal ? pal.edge : '#141414';
    const moss = pal && pal.grass ? pal.grass : ['#205420', '#2c742c', '#379237', '#61b061'];
    const S = mob ? 64 : 128;
    let cv;
    if (kit) {
      const { soft, pn, tone, rgb, mixc, sstep } = kit, sc = S / 128;
      cv = soft(S, S, (x, y) => {
        const n = pn(x, y, 40 * sc, 31, S), d = pn(x, y, 10 * sc, 33, S);
        const vein = 0.5 + 0.5 * Math.sin((x * 0.6 + y + n * 40 * sc) * 6.2832 * 3 / S);
        let c = tone(tones, 0.15 + n * 0.75 + (d - 0.5) * 0.55 + (vein - 0.5) * 0.18);
        const mo = pn(x, y, 30 * sc, 35, S);
        if (mo > 0.58) c = mixc(c, tone(moss, 0.2 + (d - 0.3) * 0.8), sstep(0.58, 0.68, mo) * 0.75);
        if (d > 0.8) c = mixc(c, rgb(tones[3]), (d - 0.8) * 2.5);
        return c;
      });
    } else {
      cv = document.createElement('canvas');
      cv.width = cv.height = 16;
      const g = cv.getContext('2d');
      if (!g) return null;
      g.fillStyle = tones[2]; g.fillRect(0, 0, 16, 16);
    }
    if (cracked) {
      const g = cv.getContext('2d');
      if (g) {
        // Grietas: líneas quebradas con el borde suavizado (el lienzo las dibuja con antialias); se repiten por los bordes.
        g.strokeStyle = edge; g.lineCap = g.lineJoin = 'round'; g.lineWidth = Math.max(1.5, cv.width / 48);
        for (let c = 0; c < 4; c++) {
          let x = H(c, 1, 81) * cv.width, y = H(c, 2, 81) * cv.height, a = H(c, 3, 81) * 6.28;
          g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 6; s++) { a += (H(c, s, 82) - 0.5) * 1.6; x += Math.cos(a) * cv.width / 9; y += Math.sin(a) * cv.height / 9; g.lineTo(x, y); }
          g.stroke();
        }
      }
    }
    const t = stex(cv);
    // (Con un tono por vértice: oscuro abajo, claro arriba. La luz hace el resto.)
    m = new T.MeshLambertMaterial({ map: t, vertexColors: true, side: T.FrontSide, shadowSide: T.DoubleSide });
    rockMats.set(k, m);
    return m;
  }

  // ---------------- geometría ----------------
  /** Un cuadrilátero (a abajo-izq., b abajo-der., c arriba-der., d arriba-izq., visto desde fuera) con su normal y uv. */
  function quad(A, a, b, c, d, n, uv, col) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const p = [a, b, c, d][k];
      A.pos.push(p[0], p[1], p[2]); A.nor.push(n[0], n[1], n[2]); A.uv.push(uv[k * 2], uv[k * 2 + 1]);
      // Tono del vértice (oclusión): las caras de la pared, más oscuras al pie.
      const v = col ? (p[2] <= 0.01 ? col[0] : col[1]) : 1;
      A.col.push(v, v, v);
    }
  }
  const rect = (u0, v0, u1, v1) => [u0, v0, u1, v0, u1, v1, u0, v1];

  function geo(A, groups) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(A.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(A.nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(A.uv, 2));
    if (A.col) g.setAttribute('color', new T.Float32BufferAttribute(A.col, 3));
    if (groups) for (const [s, n, m] of groups) g.addGroup(s, n, m);
    return g;
  }

  /** Las mallas de las paredes de un chunk: una por fila (arriba con la textura del chunk; las caras, con la de roca). */
  function buildChunk(cx, cy, bi) {
    const W = G.World, N = W.N, TS = W.TS, c = W.chunk(cx, cy), at = W.terrainAt;
    const e = { c, bi, rows: [], tex: null, top: null, used: frame };
    if (!c.terr.includes(1)) return e;
    const fm = faceMat(bi), cv = G.Tileset.top3d(cx, cy, N, at, bi, W.seed);
    if (!fm || !cv) { if (cv) G.U.freeCanvas(cv); return null; }
    e.tex = tex(cv);
    e.top = lambert(e.tex, true);
    const FW = fm.fw * 2;                                // ancho de la textura de roca en el mundo (2 por px de arte)
    const AO = [0.6, 1];                                 // tono de la cara al pie y arriba
    for (let j = 0; j < N; j++) {
      const ty = cy * N + j, y0 = ty * TS, y1 = y0 + TS;
      const A = { pos: [], nor: [], uv: [], col: [] }, F = { pos: [], nor: [], uv: [], col: [] };
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
        if (at(tx, ty + 1) !== 1) quad(F, [x0, y1, 0], [x1, y1, 0], [x1, y1, HW], [x0, y1, HW], [0, 1, 0], rect(x0 / FW, 0, x1 / FW, 1), AO);
        if (at(tx - 1, ty) !== 1) quad(F, [x0, y0, 0], [x0, y1, 0], [x0, y1, HW], [x0, y0, HW], [-1, 0, 0], rect(y0 / FW, 0, y1 / FW, 1), AO);
        if (at(tx + 1, ty) !== 1) quad(F, [x1, y1, 0], [x1, y0, 0], [x1, y0, HW], [x1, y1, HW], [1, 0, 0], rect(y0 / FW, 0, y1 / FW, 1), AO);
      }
      if (!A.pos.length) continue;
      const nA = A.pos.length / 3, nF = F.pos.length / 3;
      for (const k of ['pos', 'nor', 'uv', 'col']) A[k].push(...F[k]);
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
  /*
   * Las piezas se hacen con las de three.js (Y arriba) y se pasan a los ejes del juego (x al este, y al sur, z arriba):
   * (X, Y, Z) → (X, Z, Y). Ese cambio es un espejo, igual que la cámara del juego respecto a la de three.js: lo de fuera
   * sigue mirando a la cámara y las normales, hacia fuera.
   */
  function toGame(g) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); p.setY(i, p.getZ(i)); p.setZ(i, y);
      if (n) { const ny = n.getY(i); n.setY(i, n.getZ(i)); n.setZ(i, ny); }
    }
    p.needsUpdate = true; if (n) n.needsUpdate = true;
    g.computeBoundingBox();
    return g;
  }
  /** Junta los vértices repetidos (costuras y polos de la esfera): así las normales salen continuas. */
  function weld(g) {
    const p = g.attributes.position, idx = g.index ? g.index.array : null, map = new Map(), pos = [], remap = new Int32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
      let j = map.get(k);
      if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
      remap[i] = j;
    }
    const tri = [], n = idx ? idx.length : p.count;
    for (let t = 0; t < n; t += 3) {
      const a = remap[idx ? idx[t] : t], b = remap[idx ? idx[t + 1] : t + 1], c = remap[idx ? idx[t + 2] : t + 2];
      if (a !== b && b !== c && a !== c) tri.push(a, b, c);
    }
    const o = new T.BufferGeometry();
    o.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    o.setIndex(tri);
    g.dispose();
    return o;
  }
  /** Ruido suave en 3D (valor con interpolación suave) para deformar las rocas. */
  function n3(x, y, z, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), fx = x - x0, fy = y - y0, fz = z - z0;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const h = (a, b, c) => H(x0 + a + (z0 + c) * 131, y0 + b, s);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
  }
  /** Una roca lisa: esfera deformada (ruido suave), aplastada, con la base plana y sus tonos por vértice. */
  function rockGeo(look) {
    const seg = mob ? [10, 7] : [22, 14];
    let g = weld(new T.SphereGeometry(1, seg[0], seg[1]));
    const p = g.attributes.position, col = [], uv = [];
    const W = look ? 19 : 17, D = 10.5, Hh = look ? 13 : 16;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = 0.74 + 0.44 * n3(x * 1.7 + 3, y * 1.7 + look * 7, z * 1.7, 91) + 0.14 * n3(x * 4.5, y * 4.5, z * 4.5 + look * 5, 92);
      // (Y de three.js = alto) la parte de abajo, hundida en el suelo (la base plana a 0).
      p.setXYZ(i, x * W * r, Math.max(0, y * 0.6 + 0.4) * Hh * r, z * D * r);
    }
    g.computeVertexNormals();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = Math.min(1, y / Hh);
      const v = 0.62 + 0.5 * t;                            // oscuro al pie, claro arriba
      col.push(v, v, v);
      uv.push((x + z * 0.5) / 30, (y - z * 0.4) / 30);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return toGame(g);
  }
  /** Su contorno: la misma roca un poco más grande (se dibujan sus caras de dentro). */
  function hullOf(g, k) {
    if (!g.boundingBox) g.computeBoundingBox();
    const h = g.clone(), bb = g.boundingBox, c = new T.Vector3();
    bb.getCenter(c); c.z = 0;
    h.translate(-c.x, -c.y, -6); h.scale(k[0], k[1], k[2]); h.translate(c.x, c.y, 6);
    return h;
  }

  /** Las piezas que no cambian: 2 rocas lisas (con su contorno) y 2 cofres modelados. */
  function sharedParts() {
    if (shared) return shared;
    const s = { rocks: [], hullMat: new T.MeshBasicMaterial({ color: 0x141010, side: T.BackSide }) };
    for (let look = 0; look < 2; look++) {
      const g = rockGeo(look);
      s.rocks.push({ g, hull: hullOf(g, [1.1, 1.14, 1.08]) });
    }
    s.chest = chestParts(false);
    s.big = chestParts(true);
    return (shared = s);
  }

  /** Caja con las esquinas redondeadas (r) de w×h×d, centrada (ejes de three.js), con sus normales suaves. */
  function roundBox(w, h, d, r, n = 3) {
    const g = new T.BoxGeometry(w, h, d, n * 2, n * 2, n * 2), p = g.attributes.position, nr = g.attributes.normal;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ix = Math.max(-hx, Math.min(hx, x)), iy = Math.max(-hy, Math.min(hy, y)), iz = Math.max(-hz, Math.min(hz, z));
      v.set(x - ix, y - iy, z - iz);
      if (v.lengthSq() < 1e-8) continue;
      v.normalize();
      p.setXYZ(i, ix + v.x * r, iy + v.y * r, iz + v.z * r);
      nr.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }
  /** Tapa abombada: medio cilindro tumbado (largo w en X), de fondo d y alto h, apoyado en y = 0 (ejes de three.js). */
  function domeLid(w, d, h, seg = 14) {
    const g = new T.CylinderGeometry(d / 2, d / 2, w, seg, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2);                              // el eje, a lo largo de X; la mitad abombada, arriba (y ≥ 0)
    g.scale(1, (h / (d / 2)), 1);
    return g;
  }
  /** Coloca una pieza de three.js (Y arriba) en los ejes del juego, con su caja en (x, y, z) del juego. */
  function place(g, x, y, z) { toGame(g); g.translate(x, y, z); g.computeBoundingBox(); return g; }

  /*
   * Un cofre (medidas de mundo, como el dibujo de antes): cuerpo de tablas con las esquinas redondeadas, tapa abombada
   * con el giro en el borde de atrás (el cofre con candado la levanta al abrirse), flejes, cerradura de oro y, dentro,
   * monedas. big: el cofre con candado (granate, más grande, con más oro).
   */
  function chestParts(big) {
    const kit = K();
    const X = big ? 28 : 20, Y = big ? 22 : 16, Zb = big ? 16 : 12, Zl = big ? 10 : 8;
    const woodT = big ? ['#2a0f1c', '#5e1a36', '#86284a', '#ab3e62'] : ['#2e1a12', '#5c3520', '#83502c', '#a86c3c'];
    const wood = kit ? new T.MeshLambertMaterial({ map: stex(kit.planks(mob ? 64 : 128, woodT, big ? 47 : 43)) })
      : new T.MeshLambertMaterial({ color: woodT[2] });
    const woodL = kit ? new T.MeshLambertMaterial({ map: stex(kit.planks(mob ? 64 : 128, woodT.map(c => kit.shade(c, 0.16)), big ? 48 : 44)) })
      : new T.MeshLambertMaterial({ color: woodT[3] });
    // (En móvil, sin brillo especular: Lambert, más barato.)
    const gold = mob ? new T.MeshLambertMaterial({ color: 0xe0ac34, emissive: 0x3a2400 }) : new T.MeshPhongMaterial({ color: 0xe0ac34, specular: 0xfff0b0, shininess: 70, emissive: 0x3a2400 });
    const dark = new T.MeshLambertMaterial({ color: 0x160a06 });
    const coin = mob ? gold : new T.MeshPhongMaterial({ color: 0xf0c048, specular: 0xffffff, shininess: 90, emissive: 0x6a4a08 });
    const m = { wood, gold, dark, coin, woodL };
    const r = big ? 3 : 2.4, B = [], Lp = [];
    // Cuerpo (de y = −Y a 0, z de 0 a Zb): las tablas y el borde de arriba un poco más claro.
    B.push([place(roundBox(2 * X, Zb, Y, r), 0, -Y / 2, Zb / 2), 0]);
    // Dentro, a oscuras, con monedas (se ve al levantar la tapa).
    B.push([place(new T.BoxGeometry(2 * X - 2 * r, 0.6, Y - 2 * r), 0, -Y / 2, Zb - 1.2), 2]);
    for (let i = 0; i < (big ? 9 : 5); i++) {
      const cx = (H(i, 1, 61) - 0.5) * (2 * X - 10), cy = -Y / 2 + (H(i, 2, 61) - 0.5) * (Y - 8);
      B.push([place(new T.CylinderGeometry(2.4, 2.4, 0.8, 10), cx, cy, Zb - 0.6 + H(i, 3, 61) * 0.8), 3]);
    }
    // Flejes de oro: dos verticales en el cuerpo y el ribete de abajo.
    for (const sx of [-1, 1]) B.push([place(roundBox(3.4, Zb + 0.6, Y + 1.2, 1, 1), sx * (X - (big ? 7 : 5)), -Y / 2, Zb / 2), 1]);
    B.push([place(roundBox(2 * X + 1, 2.4, Y + 1, 1, 1), 0, -Y / 2, 1.3), 1]);
    if (big) B.push([place(roundBox(2 * X + 1, 2, Y + 1, 0.9, 1), 0, -Y / 2, Zb - 1), 1]);
    // Cerradura (delante, entre el cuerpo y la tapa) con el ojo de la llave.
    const lk = big ? [8, 9, 3] : [6, 7, 2.4];
    B.push([place(roundBox(lk[0], lk[1], lk[2], 1.2, 1), 0, 0.6, Zb - lk[1] / 2 + 2), 1]);
    B.push([place(new T.CylinderGeometry(0.9, 0.9, 1, 8).rotateX(Math.PI / 2), 0, 0.6 + lk[2] / 2 + 0.2, Zb - lk[1] / 2 + 2.6), 2]);
    // La tapa: de y = 0 (el giro, atrás) a Y (delante), z de 0 a Zl. Tablas abombadas y flejes que la abrazan.
    Lp.push([place(domeLid(2 * X, Y, Zl, mob ? 10 : 16), 0, Y / 2, 0), 4]);
    for (const sx of [-1, 1]) Lp.push([place(domeLid(3.4, Y + 1.2, Zl + 0.7, mob ? 10 : 16), sx * (X - (big ? 7 : 5)), Y / 2, 0), 1]);
    if (big) Lp.push([place(domeLid(3, Y + 1.2, Zl + 0.7, mob ? 10 : 16), 0, Y / 2, 0), 1]);
    // Su cara de dentro (por debajo): con la tapa levantada queda de pie detrás del cofre, mirándote.
    Lp.push([place(new T.BoxGeometry(2 * X - 1, 0.4, Y - 1), 0, Y / 2, 0.2), 2]);
    // (En móvil, las monedas con el oro y la tapa con la madera: menos llamadas de dibujo.)
    if (mob) for (const L2 of [B, Lp]) for (const e of L2) e[1] = e[1] === 3 ? 1 : e[1] === 4 ? 0 : e[1];
    const join = list => {
      // Una geometría con un grupo por material (madera, oro, oscuro, monedas, madera de la tapa).
      const out = { pos: [], nor: [], uv: [], groups: [] };
      for (let mi = 0; mi < 5; mi++) {
        const s0 = out.pos.length / 3;
        for (const [g, k] of list) {
          if (k !== mi) continue;
          const q = g.index ? g.toNonIndexed() : g;
          out.pos.push(...q.attributes.position.array); out.nor.push(...q.attributes.normal.array);
          out.uv.push(...(q.attributes.uv ? q.attributes.uv.array : new Float32Array(q.attributes.position.count * 2)));
          if (q !== g) q.dispose();
        }
        const n = out.pos.length / 3 - s0;
        if (n) out.groups.push([s0, n, mi]);
      }
      for (const [g] of list) g.dispose();
      return geo(out, out.groups);
    };
    // Las uv de las tablas, a escala del mundo (las de cada pieza van de 0 a 1: en un cofre ancho, tablas enormes).
    const scaleUv = (g, k) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k * 0.5); };
    for (const [g, k] of B) if (k === 0) scaleUv(g, big ? 1.4 : 1);
    for (const [g, k] of Lp) if (k === 4 || k === 0) scaleUv(g, big ? 1.4 : 1);
    const body = join(B), lid = join(Lp);
    const hulls = [hullOf(body, [1.06, 1.1, 1.05]), lid.clone().scale(1.05, 1.07, 1.1)];
    return { m, body, lid, hulls, Y, Zb, Zl, X };
  }

  function makeProp(p) {
    const s = sharedParts();
    if (!s) return null;
    const o = new T.Group();
    let it;
    {
      const c = p.type === 'bigchest' ? s.big : s.chest, mats = [c.m.wood, c.m.gold, c.m.dark, c.m.coin, c.m.woodL];
      const body = new T.Mesh(c.body, mats), bh = new T.Mesh(c.hulls[0], s.hullMat);
      bh.hull = true;
      const pivot = new T.Group();
      pivot.position.set(0, -c.Y, c.Zb);
      const lid = new T.Mesh(c.lid, mats), lh = new T.Mesh(c.hulls[1], s.hullMat);
      lh.hull = true;
      pivot.add(lid, lh);
      o.add(body, bh, pivot);
      it = { obj: o, mesh: body, lid, pivot, kind: p.type, h: c.Zb + c.Zl + 14, c };
    }
    // Donde está: centrado en su casilla, apoyado en el suelo (los pies del objeto, p.y, están 4 por encima del borde).
    o.position.set(p.x, p.y - 6, 0);
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
    {
      const c = it.c;
      const want = p.flash > 0;
      if (want !== !!it.flashing) {
        it.flashing = want;
        const ms = [c.m.wood, c.m.gold, c.m.dark, c.m.coin, c.m.woodL];
        it.mesh.material = it.lid.material = want ? ms.map(flashOf) : ms;
      }
      // El cofre con candado levanta la tapa mientras lo abres, hasta dejarla de pie detrás (con 0,55 rad se veía casi sólo
      // su canto: parecía que al cofre le faltaba un trozo).
      const a = it.kind === 'bigchest' ? 1.9 * Math.min(1, p.open / G.Interact.CHEST_TIME) : 0;
      if (it.pivot.rotation.x !== a) { it.pivot.rotation.x = a; it.obj.updateMatrixWorld(true); shadowDirty = true; }
      const big = it.kind === 'bigchest';
      glowSeen.push({ x: p.x, y: p.y - 12, z: 2, s: big ? 120 : 84, k: big ? 0.42 : 0.26, col: null });
    }
    return it;
  }

  function dropProp(id) {
    const it = props.get(id);
    props.delete(id);
    if (it) { scene.remove(it.obj); shadowDirty = true; if (it.pt) it.pt.dispose(); }
  }

  /** (Partida en 3D) El portal de la grieta abierta en el mundo (props3d.js portal), como un objeto más (id 'rift'). */
  function syncRift(bi, t) {
    const rf = G.Rift && G.Rift.rift;
    if (!rf || !G.Props3D) return;
    let it = props.get('rift');
    if (it && it.bi !== bi) { dropProp('rift'); it = null; }
    if (!it) {
      const pt = G.Props3D.portal(bi);
      if (!pt) return;
      setup(pt.obj, false);
      pt.obj.traverse(m => { m.matrixAutoUpdate = true; m.castShadow = false; m.receiveShadow = false; });
      it = { obj: pt.obj, pt, kind: 'rift', h: pt.h, r: pt.r, bi };
      props.set('rift', it);
    }
    it.used = frame;
    it.pt.obj.position.set(rf.x, rf.y - 6, 0);
    it.pt.set(t, Math.min(1, rf.t * 2) * Math.min(1, rf.ttl / 1.5));
  }

  function dropAll(gone = false) {
    if (gone) {
      for (const e of chunks.values()) for (const r of e.rows) scene.remove(r.mesh);
      for (const it of props.values()) scene.remove(it.obj);
      for (const k of kinds.values()) { scene.remove(k.im); if (k.ih) scene.remove(k.ih); }
      chunks.clear(); props.clear(); kinds.clear(); faceMats.clear(); rockMats.clear(); flashMats.clear(); shared = null; tinted = -1; shadowDirty = true;
      if (G.Props3D) G.Props3D.free(true);
      return;
    }
    for (const key of [...kinds.keys()]) dropKind(key);
    if (G.Props3D) G.Props3D.free(false);
    for (const k of [...chunks.keys()]) dropChunk(k);
    for (const id of [...props.keys()]) dropProp(id);
    const kill = m => { if (m.map) m.map.dispose(); m.dispose(); };
    for (const m of faceMats.values()) kill(m);
    for (const m of rockMats.values()) kill(m);
    for (const m of flashMats.values()) m.dispose();
    faceMats.clear(); rockMats.clear(); flashMats.clear();
    if (shared) {
      for (const r of shared.rocks) { r.g.dispose(); r.hull.dispose(); }
      for (const c of [shared.chest, shared.big]) { c.body.dispose(); c.lid.dispose(); for (const h of c.hulls) h.dispose(); for (const k in c.m) kill(c.m[k]); }
      shared.hullMat.dispose();
      shared = null; tinted = -1;
    }
  }

  // ---------------- instancing (partida en 3D) ----------------
  /** El modelo key («bi:nombre», con «~» al final: el transparente) listo para dibujar, o null. */
  function kindOf(key) {
    let k = kinds.get(key);
    if (k) return k;
    const i = key.indexOf(':'), bi = +key.slice(0, i), name = key.slice(i + 1), fade = name.endsWith('~'), base = fade ? name.slice(0, -1) : name;
    let o = null;
    if (base.startsWith('rock')) {
      const s = sharedParts(), r = s && s.rocks[+base[4] % 2], m = r && rockMat(bi, base.endsWith('x'));
      if (m) o = { g: r.g, hg: r.hull, w: 22, h: 26, cast: true, mat: m, hullMat: s.hullMat };
    } else if (G.Props3D) o = G.Props3D.geo(bi, base);
    if (!o) return null;
    const cap = 192;
    const im = new T.InstancedMesh(o.g, fade ? o.fadeMat : o.mat, cap);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    im.setColorAt(0, new T.Color(1, 1, 1));
    im.instanceColor.setUsage(T.DynamicDrawUsage);
    let ih = null;
    if (o.hg) { ih = new T.InstancedMesh(o.hg, fade ? o.fadeHull : o.hullMat, cap); ih.instanceMatrix = im.instanceMatrix; ih.hull = true; }
    for (const m of ih ? [im, ih] : [im]) {
      m.count = 0; m.visible = false; m.matrixAutoUpdate = false; m.frustumCulled = false;
      m.layers.enable(1);                                   // (capa 0 para las sombras; 1, la de las pasadas)
      m.castShadow = m === im && o.cast && !fade; m.receiveShadow = m === im;
      scene.add(m);
    }
    k = { im, ih, cap, n: 0, w: o.w, h: o.h, cast: o.cast };
    kinds.set(key, k);
    return k;
  }
  function dropKind(key) {
    const k = kinds.get(key);
    kinds.delete(key);
    if (!k) return;
    scene.remove(k.im); k.im.dispose();
    if (k.ih) { scene.remove(k.ih); k.ih.dispose(); }
    shadowDirty = true;
  }
  /** Escribe el objeto e en el hueco i del modelo k: girado a sobre z, a escala s, en (x, y, z); su tono c. */
  function put(k, i, e) {
    const a = k.im.instanceMatrix.array, o = i * 16, c = Math.cos(e.a) * e.s, sn = Math.sin(e.a) * e.s;
    a[o] = c; a[o + 1] = sn; a[o + 2] = 0; a[o + 3] = 0;
    a[o + 4] = -sn; a[o + 5] = c; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = e.s; a[o + 11] = 0;
    a[o + 12] = e.x; a[o + 13] = e.y; a[o + 14] = e.z; a[o + 15] = 1;
    const ca = k.im.instanceColor.array;
    ca[i * 3] = ca[i * 3 + 1] = ca[i * 3 + 2] = e.c;
  }
  /** Deja en cada modelo sólo los objetos de la lista (los de un lote, o todos para las sombras). */
  function fill(list) {
    for (const k of kinds.values()) k.n = 0;
    for (const e of list) { const k = kindOf(e.key); if (k && k.n < k.cap) put(k, k.n++, e); }
    for (const k of kinds.values()) {
      const n = k.n, v = n > 0;
      k.im.count = n; k.im.visible = v;
      if (k.ih) { k.ih.count = n; k.ih.visible = v; }
      if (!v) continue;
      const am = k.im.instanceMatrix, ac = k.im.instanceColor;
      am.clearUpdateRanges(); am.addUpdateRange(0, n * 16); am.needsUpdate = true;
      ac.clearUpdateRanges(); ac.addUpdateRange(0, n * 3); ac.needsUpdate = true;
    }
  }

  /** Lo que va con instancing de este fotograma: los objetos de world.js (vis) y la flora de ambient.js. */
  function collect(vis, bi, t) {
    ins.clear();
    allIns = [];
    const P3 = G.Props3D, pl = G.Game && G.Game.player;
    let sig = 0;
    const push = (id, key, x, y, z, a, s, c) => {
      const k = kindOf(bi + ':' + key);
      if (!k) return null;
      const e = { key: bi + ':' + key, x, y, z, a, s, c, w: k.w, h: k.h };
      ins.set(id, e);
      allIns.push(e);
      if (k.cast) sig = (sig + x * 0.731 + y * 1.379 + 17) % 1e9;
      return e;
    };
    for (const p of vis) {
      if (OWN[p.type] || p.wallrow) continue;
      const fl = p.flash > 0 ? 1.9 : 1;
      if (p.type === 'rock') { push(p.id, 'rock' + (p.look % 2) + (p.hp < p.maxHp * 0.5 ? 'x' : ''), p.x, p.y - 16, 0, 0, 1, fl); continue; }
      let key = P3 && P3.keyOf(p, bi);
      if (!key) continue;
      const h1 = H(p.tx, p.ty, 41), h2 = H(p.tx, p.ty, 42);
      switch (p.type) {
        case 'tree':
          // Si tu Pokémon queda detrás, ese árbol se transparenta un poco (como en el Ultra 2D).
          if (pl && pl.y < p.y - 2 && pl.y > p.y - 58 && Math.abs(pl.x - p.x) < 26) key += '~';
          push(p.id, key, p.x + (h1 - 0.5) * 4, p.y - 18, 0, (h2 - 0.5) * 0.6, 0.92 + h1 * 0.16, 0.94 + h2 * 0.1);
          break;
        case 'altar':
          push(p.id, key, p.x, p.y - 18, 0, 0, 1, 1);
          if (!p.used) glowSeen.push({ x: p.x, y: p.y - 18, z: 51, s: 64, k: 0.55 * (0.85 + Math.sin(t * 3 + p.wiggle) * 0.15), col: P3.ORB[p.kind & 3] });
          break;
        case 'spring':
          push(p.id, key, p.x, p.y - 8, 0, 0, 1, 1);
          if (p.charge >= 0.15) glowSeen.push({ x: p.x, y: p.y - 8, z: 1, s: 60, k: 0.22, col: '#5fe8d8' });
          break;
        case 'trap': push(p.id, key, p.x, p.y - 20, 0, (h2 - 0.5) * 0.8, 1 + Math.sin(t * 9 + p.wiggle) * 0.035, 1); break;
      }
      if (G.World.propFx) G.World.propFx(p, t);
    }
    // La flora (setas que brillan y cristales): ambient.js la deja aquí en vez de dibujarla.
    const fl = G.Ambient && G.Ambient.flora3d;
    if (P3 && fl) for (const f of fl) {
      const key = P3.FLORA[f.row];
      if (key) push('f' + f.x + ',' + f.y, key, f.x, f.y - 4, 0, (H(f.x, f.y, 43) - 0.5) * 0.8, 0.85 + H(f.x, f.y, 44) * 0.3, 1);
    }
    if (sig !== insSig) { insSig = sig; shadowDirty = true; }
  }

  // ---------------- cada fotograma ----------------
  /** Mundo → px del lienzo 3D (con la proyección de este fotograma). */
  function proj(x, y, z) {
    const w = P[12] * x + P[13] * y + P[14] * z + P[15];
    return [((P[0] * x + P[1] * y + P[2] * z + P[3]) / w + 1) * Wl / 2, (1 - (P[4] * x + P[5] * y + P[6] * z + P[7]) / w) * Hl / 2];
  }

  /**
   * Resolución del lienzo 3D (px por unidad de mundo). Kd: px del lienzo del juego por unidad; Wd×Hd, su tamaño.
   *  - móvil: 0,5 (la escala del arte, como siempre: lo que costaba antes);
   *  - PC: la del juego por la calidad automática (Máxima: toda; Ultra: el 85 %), con tope de píxeles por pantalla.
   */
  function scaleFor(Kd, Wd, Hd) {
    if (mob) return 0.5;
    Q.tune();
    const cap = G.Settings.max ? 4.2e6 : 2.4e6;
    let k = Kd * (G.Settings.max ? 1 : 0.85) * Q.q;
    k = Math.min(k, Kd * Math.sqrt(cap / Math.max(1, Wd * Hd)));
    return Math.max(0.5, k);
  }

  /**
   * Prepara el fotograma (game.js, D3.draw): tamaño, cámara, chunks a la vista, rocas y cofres (vis: los objetos visibles),
   * luz y sombras. Kd: px del lienzo del juego por unidad de mundo; Wd, Hd: su tamaño. false: este fotograma, en 2D.
   */
  function begin(cam, Kd, Wd, Hd, vis) {
    floraOn = false;
    if (!on()) return false;
    const W = G.World, bi = W.biome;
    if (!W.pmdOn(bi) || !faceMat(bi) || !sharedParts()) return false;
    if (tinted !== bi) {
      // Sombras y contornos, del tono oscuro del mapa y no negros.
      const edge = G.Tileset.pal(bi).edge;
      plane.material.color.set(edge); shared.hullMat.color.set(edge);
      // (Otro bioma: los modelos del de antes, fuera.)
      for (const key of [...kinds.keys()]) if (!key.startsWith(bi + ':')) dropKind(key);
      if (G.Props3D) G.Props3D.free(false, bi);
      tinted = bi;
    }
    frame++;
    floraOn = false;
    glowSeen = [];
    // Tamaño del lienzo 3D (y como mucho 4096 de lado: memoria de lienzos).
    KL = scaleFor(Kd, Wd, Hd);
    const lim = mob ? 1024 : 4096;
    const wl = Math.min(lim, Math.ceil(Wd * KL / Kd) + 2), hl = Math.min(lim, Math.ceil(Hd * KL / Kd) + 2);
    if (wl !== Wl || hl !== Hl) { Wl = wl; Hl = hl; renderer.setSize(Wl, Hl, false); }    // (el atlas crece en render())
    R = Kd / KL;
    // Cámara pegada a la rejilla de píxeles del lienzo 3D (sin «nadar» al moverse); el resto se corrige al pasarlo a la pantalla.
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
    // (Vista normal, sin perspectiva: w es 1 en todas partes y la profundidad saldría igual para todo. Entonces, lo de más
    //  al sur y lo más alto, delante: z = −(y − cy + z) / 3000.)
    const zr = a > 1e-7 ? w.map((v, i) => 5 / 3 * v + (i === 3 ? -4 / 3 : 0)) : [0, -1 / 3000, -1 / 3000, cys / 3000];
    P.set([...xr, ...yr, ...zr, ...w]);
    cam3.projectionMatrix.set(...P);
    cam3.projectionMatrixInverse.copy(cam3.projectionMatrix).invert();

    // Lo que se ve (como D3): más ancho arriba. Con margen para las sombras de lo que queda justo fuera.
    const Kp = cam.persp, ex = hw / (1 - Kp) + 60, top = cam.y - hh / (1 - Kp) - 60, bot = cam.y + hh / (1 + Kp) + 60 + HW;
    const CW = W.CW, N = W.N, TS = W.TS;
    const c0 = Math.floor((cam.x - ex - 200) / CW), c1 = Math.floor((cam.x + ex + 200) / CW);
    const r0 = Math.floor((top - 200) / CW), r1 = Math.floor((bot + 100) / CW);
    let built = 0;
    shownRows = [];
    const walls = !!G.Settings.ultra;                       // (vista normal: sólo rocas y cofres; las paredes, en el suelo 2D)
    if (!walls && chunks.size) for (const k of [...chunks.keys()]) dropChunk(k);
    for (let cy = r0; cy <= r1 && walls; cy++) for (let cx = c0; cx <= c1; cx++) {
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
    uni.time.value = G.Anim && !G.Anim.on ? 0 : t;
    collect(vis, bi, t);
    syncRift(bi, t);
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
    floraOn = true; okAt = performance.now();
    return true;
  }

  /** Las filas de pared a la vista, para el orden por Y de game.js: { y, u3row }. */
  function rows(items) {
    const TS = G.World.TS;
    for (const r of shownRows) items.push({ y: r.ty * TS + 1, u3row: r });
    // (La flora en 3D también va por orden de Y: sus pies.)
    for (const [id, e] of ins) if (typeof id === 'string') items.push({ y: e.y + 4, u3: { id } });
  }

  const owns = p => (!!OWN[p.type] && props.has(p.id)) || ins.has(p.id);

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
    let e = null;
    if (it.u3row) { o = it.u3row.mesh; x0 = it.u3row.x0; x1 = it.u3row.x1; y0 = it.u3row.ty * TS; y1 = y0 + TS; h = HW; }
    else {
      const q = props.get(it.u3.id);
      if (q) { const r = q.r || 34; o = q.obj; x0 = it.u3.x - r; x1 = it.u3.x + r; y0 = it.u3.y - 50; y1 = it.u3.y + 6; h = q.h; }
      else {
        e = ins.get(it.u3.id);
        if (!e) return b;
        // (Con margen: lo que se mece con el viento y el contorno.)
        const r = e.w * e.s + 6, d = e.w * e.s * 0.62 + 6;
        x0 = e.x - r; x1 = e.x + r; y0 = e.y - d; y1 = e.y + d; h = e.h * e.s + 6;
      }
    }
    if (!b) b = { objs: [], inst: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, ay: -1 };
    if (e) b.inst.push(e); else b.objs.push(o);
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

  let tris = 0, calls = 0;
  /** Dibuja las sombras del suelo y todos los lotes del fotograma en el lienzo 3D. */
  function render(list) {
    // Sitio de cada lote, debajo de las sombras del suelo (como mucho 4 pantallas: si no caben, con el anterior).
    let y = Hl, prev = null;
    const AT = mob ? 4 : 3;                                    // (PC, a la resolución de la pantalla: 3 pantallas de atlas)
    for (const b of list) {
      b.x = Math.max(0, Math.floor(b.x0) - 2); b.y = Math.max(0, Math.floor(b.y0) - 2);
      b.w = Math.min(Wl, Math.ceil(b.x1) + 2) - b.x; b.h = Math.min(Hl, Math.ceil(b.y1) + 2) - b.y;
      if (b.w <= 0 || b.h <= 0) { b.ay = -1; continue; }
      if (y + b.h > AT * Hl && prev) {
        prev.objs.push(...b.objs);
        for (const e of b.inst) prev.inst.push(e);
        const x1 = Math.max(prev.x + prev.w, b.x + b.w), y1 = Math.max(prev.y + prev.h, b.y + b.h);
        prev.x = Math.min(prev.x, b.x); prev.w = x1 - prev.x;
        const ny = Math.min(prev.y, b.y), nh = Math.min(Hl, y1) - ny;
        y += nh - prev.h; prev.y = ny; prev.h = nh;
        b.ay = -1; continue;
      }
      b.ay = prev ? prev.ay + prev.h : Hl; y = b.ay + b.h; prev = b;
    }
    const H = Math.min(AT * Hl, Math.ceil(y / Hl) * Hl);
    if (glcv.height < H) renderer.setSize(Wl, H, false);
    tris = calls = 0;
    // El mapa de sombras (si toca), con todas las capas (three.js sólo mete las que ve la cámara) y sin dibujar nada.
    if (renderer.shadowMap.needsUpdate) {
      nShadow++;
      fill(allIns);                                             // (para las sombras, todos los de instancing)
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, 0, 0);
      cam3.layers.enableAll();
      renderer.render(scene, cam3);
    }
    fill([]);
    draw(0, 0, 0, Wl, Hl, 2);                                    // el plano que recibe las sombras
    tris += renderer.info.render.triangles; calls += renderer.info.render.calls;
    for (const b of list) {
      if (b.ay < 0) continue;
      for (const o of b.objs) o.traverse(m => { m.layers.enable(1); lay.add(m); });
      fill(b.inst);
      draw(b.ay - b.y, b.x, b.y, b.w, b.h, 1);
      tris += renderer.info.render.triangles; calls += renderer.info.render.calls;
      for (const m of lay) m.layers.disable(1);
      lay.clear();
    }
  }

  /*
   * El halo de los cofres en el suelo (luz dorada que late, más fuerte en el de candado): un degradado guardado que se
   * suma (lighter), justo después de las sombras y antes de todo lo de pie. Sin coste por píxel en el móvil: un drawImage.
   */
  const glowC = new Map();
  /** El degradado de un halo (dorado, el de los cofres; o del color col: torres, manantiales). */
  function glowImg(col) {
    const key = col || 'gold';
    if (glowC.has(key)) return glowC.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (!col) { gr.addColorStop(0, 'rgba(255,214,110,0.9)'); gr.addColorStop(0.35, 'rgba(255,190,70,0.4)'); gr.addColorStop(1, 'rgba(255,170,40,0)'); }
    else {
      const n = parseInt(col.slice(1), 16), rgb = (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255);
      gr.addColorStop(0, 'rgba(' + rgb + ',0.85)'); gr.addColorStop(0.4, 'rgba(' + rgb + ',0.32)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    }
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowC.set(key, c);
    return c;
  }
  /** Las sombras de lo 3D en el suelo (después del suelo y antes de todo lo de pie). */
  function ground(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // (Pulido) Ampliado suavizado: lo 3D ya no es pixel art (en PC va casi a la resolución de la pantalla).
    // (En móvil, como antes: al píxel más cercano. Ampliar suavizado varias veces por fotograma costaba en Safari.)
    ctx.imageSmoothingEnabled = R > 1.01 && !mob;
    ctx.drawImage(glcv, 0, 0, Wl, Hl, Ox, Oy, Wl * R, Hl * R);
    if (G.Settings.fx > 0 && glowSeen.length) {
      const t = performance.now() / 1000;
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      for (const o of glowSeen) {
        const gi = glowImg(o.col);
        if (!gi) continue;
        const [u, v] = proj(o.x, o.y, o.z), w = Math.sin(t * 2.2 + o.x * 0.01);
        const s = o.s * (KL * R) * (1 + w * 0.06), k = o.k * (1 + w * 0.25);
        ctx.globalAlpha = Math.min(1, k);
        // (Lo del suelo, aplastado como el suelo; lo de en alto, como el orbe, redondo.)
        const sy = o.z > 10 ? 1 : 0.64;
        ctx.drawImage(gi, u * R + Ox - s / 2, v * R + Oy - s * sy / 2, s, s * sy);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.imageSmoothingEnabled = false;
  }

  /** Pega un lote en la pantalla (en su sitio del orden por Y). */
  function blit(ctx, b) {
    if (b.ay < 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = R > 1.01 && !mob;
    ctx.drawImage(glcv, b.x, b.ay, b.w, b.h, b.x * R + Ox, b.y * R + Oy, b.w * R, b.h * R);
    ctx.imageSmoothingEnabled = false;
  }

  /** Suelta todo lo de la GPU (sin memoria de lienzos, game.js purgeGfx); se rehace al dibujar. */
  function free() { if (state === 'ready') dropAll(); }

  /** Para medir: chunks, filas, objetos y llamadas de dibujo y triángulos del último fotograma. */
  function stats() {
    return { built: nBuilt, passes: nPass, shadows: nShadow, state, lost, chunks: chunks.size, rows: shownRows.length, props: props.size, size: [Wl, Hl], KL: +KL.toFixed(2), q: Q.q,
      aa: !mob, calls, tris, inst: allIns.length, kinds: kinds.size, mem: renderer ? { ...renderer.info.memory } : null };
  }

  /** ¿Van las rocas y los cofres en 3D con la vista normal (sin Ultra)? (game.js dibuja entonces por D3 sin perspectiva) */
  const flat = () => !G.Settings.ultra && flatOk() && on();

  return { on, flat, begin, ground, rows, owns, add, hits, render, blit, free, stats, get state() { return state; },
    /** ¿Va la flora en 3D? (ambient.js no la dibuja entonces: la deja en G.Ambient.flora3d) */
    // (Sólo si el último fotograma fue en 3D: con la calidad bajada a mitad de partida, la flora vuelve al 2D al momento.)
    get floraOn() { return floraOn && performance.now() - okAt < 250; },
    /** ¿Va el portal de la grieta en 3D este fotograma? (game.js: entonces rift.js sólo dibuja su luz y el suelo roto) */
    riftOn() { const it = props.get('rift'); return !!it && it.used === frame && floraOn; } };
})();
