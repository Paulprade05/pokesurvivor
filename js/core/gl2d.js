/* ============ gl2d.js — el lienzo del juego en WebGL2, con la misma forma de dibujar que el Canvas 2D ============
 * Pedido del dueño (14-11-2026): «que el juego vaya lo mejor posible de fps [...] que se vea lo más parecido a lo actual
 * pero con fps estables a 60 o 120». Medido (docs/FPS-TECNOLOGIA.md): la lógica gasta 1-1,5 ms por fotograma y lo que
 * frena es la GPU pintando el Canvas 2D (50 % ocupada en una partida tranquila, 97-99 % en la horda, a 60 Hz). La misma
 * mezcla de dibujo en WebGL2 por lotes va ~11 veces más rápida. El dueño eligió esto: WebGL2 propio.
 *
 * Cómo: G.GL2D.create(lienzo) da un objeto con la misma forma que el contexto 2D (drawImage, fillRect, save, setTransform,
 * arc, fillText...), así el resto del juego dibuja igual que siempre. Por debajo:
 *   - NATIVO, por lotes (una llamada de WebGL por cada 8 imágenes distintas seguidas como mucho):
 *       · drawImage, fillRect y clearRect de color liso, con transformaciones, globalAlpha, suavizado o no por dibujo y los
 *         modos de mezcla (source-over, lighter, copy, multiply, source-atop, source-in, destination-in/out, screen).
 *         Cada imagen o lienzo se sube una vez a la GPU; un lienzo 2D, otra vez sólo cuando cambia (se cuentan sus dibujos).
 *       · Formas sueltas de color liso: círculos y elipses (arc, ellipse), rectángulos y rectángulos redondeados (rect,
 *         roundRect y el de moveTo + 4 arcTo del HUD), rellenas o con borde: el shader calcula la distancia al borde y
 *         suaviza 1 px como el Canvas 2D.
 *       · Textos de color liso sin girar: cada texto se pinta UNA vez con el Canvas 2D de verdad (misma letra, mismo
 *         tamaño en píxeles de pantalla) en un atlas, y luego se copia. Los números de daño y el HUD se repiten mucho.
 *   - DE RESPALDO, todo lo demás (trazados de varias piezas, líneas, degradados, patrones, sombras, filtros, recortes):
 *     se pinta con un Canvas 2D de verdad en un lienzo aparte del tamaño de la pantalla y, cuando vuelve lo nativo, el
 *     trozo pintado se sube y se pone en su sitio, en el mismo orden. Se ve igual (lo pinta el Canvas 2D).
 *
 * Interruptor (hasta que iguale o supere al Canvas 2D): ?gl=1 / ?gl=0 en la dirección, o Ajustes › Gráficos «Motor
 * WebGL2» (ajuste 'glDraw', se aplica al recargar). Sin WebGL2, o si falla al empezar, el juego sigue con el Canvas 2D.
 *
 *   G.GL2D.wanted()        ¿se pidió? (ajuste o dirección)
 *   G.GL2D.create(cv)      contexto para el lienzo de la pantalla, o null (sin WebGL2: usa getContext('2d'))
 *   G.GL2D.canvas()        un lienzo aparte en la GPU (para las capas del suelo y del aire de game.js D3)
 *   G.GL2D.on              ¿está dibujando en WebGL2?
 *   G.GL2D.flush()         manda lo pendiente (se hace solo al acabar cada fotograma)
 *   G.GL2D.stats()         lo del último fotograma: quads, llamadas, imágenes subidas, dibujos de respaldo...
 *   ?gldbg=1 → G.GL2D.census(): qué dibujos van al respaldo y desde qué línea (para pasarlos a nativo).
 */
G.GL2D = (() => {
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
  function wanted() {
    const q = QS.get('gl');
    if (q === '1') return true;
    if (q === '0') return false;
    try { return !!(G.Settings && G.Settings.get('glDraw')); } catch (e) { return false; }
  }

  // ---------------- estado de la GPU ----------------
  let gl = null, screen = null, lost = false, gen = 0, prog = null, vao = null, vbo = null, ibo = null;
  let uRes = null, uFlip = null, MAXT = 4096;
  const U = 8;                                          // texturas por llamada
  const MAXQ = 8192, STRIDE = 40;                       // quads por lote; bytes por vértice
  const buf = new ArrayBuffer(MAXQ * 4 * STRIDE), F = new Float32Array(buf), B = new Uint8Array(buf);
  let nq = 0, addQ = 0, srgbQ = 0;  // srgbQ: el próximo quad viene en lineal (three.js a una textura) y se pasa a sRGB
                                  // addQ: los quads que vienen, «lighter» dentro del lote (ver FS)
  const units = new Array(U).fill(null);
  let nunits = 0, blendNow = '', target = null;          // target: { fbo, w, h } (null = la pantalla)
  let frameId = 1, queued = false, open = null;          // open: el contexto con un trozo de respaldo abierto
  const st = { quads: 0, draws: 0, uploads: 0, upPx: 0, fb: 0, groups: 0, groupPx: 0, shapes: 0, texts: 0, textNew: 0 };
  const last = Object.assign({}, st);
  const warned = new Set();
  const warn = (k, m) => { if (warned.has(k)) return; warned.add(k); console.warn('[GL2D] ' + m); };
  const DBG = QS.get('gldbg') ? new Map() : null;
  const TAU = Math.PI * 2;

  // vS (modo del quad): 0 imagen sin suavizar, 1 imagen suavizada, 2 elipse rellena, 3 borde de elipse,
  //                     4 rectángulo redondeado relleno, 5 su borde. vU 255: sin textura (color liso).
  const VS = `#version 300 es
layout(location=0) in vec2 aP; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCl; layout(location=3) in vec4 aCol; layout(location=4) in vec4 aI;
uniform vec2 uRes; uniform float uFlip;
out vec2 vUV; flat out vec4 vCl; out vec4 vCol; flat out int vU; flat out int vS; flat out int vA; flat out int vR;
void main() {
  vec2 p = aP / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y * uFlip, 0.0, 1.0);
  vUV = aUV; vCl = aCl; vCol = aCol; vU = int(aI.x * 255.0 + 0.5); vS = int(aI.y * 255.0 + 0.5); vA = int(aI.z * 255.0 + 0.5); vR = int(aI.w * 255.0 + 0.5);
}`;
  const FS = `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D uT[8];
in vec2 vUV; flat in vec4 vCl; in vec4 vCol; flat in int vU; flat in int vS; flat in int vA; flat in int vR;
out vec4 o;
vec4 tf(int u, ivec2 p) {
  if (u == 0) return texelFetch(uT[0], p, 0); if (u == 1) return texelFetch(uT[1], p, 0);
  if (u == 2) return texelFetch(uT[2], p, 0); if (u == 3) return texelFetch(uT[3], p, 0);
  if (u == 4) return texelFetch(uT[4], p, 0); if (u == 5) return texelFetch(uT[5], p, 0);
  if (u == 6) return texelFetch(uT[6], p, 0); return texelFetch(uT[7], p, 0);
}
void shade() {
  if (vS >= 2) {
    float d;
    if (vS <= 3) {
      vec2 r = max(vCl.xy, vec2(1e-4));
      float k = length(vUV / r), g = length(vUV / (r * r));
      d = g > 1e-6 ? (k - 1.0) * k / g : -min(r.x, r.y);
    } else {
      vec2 q = abs(vUV) - vCl.xy + vCl.z;
      // (Sin redondeo, esquinas en ángulo recto también por fuera: así quedan los bordes de un rectángulo en el Canvas 2D.)
      d = vCl.z > 0.0 ? length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vCl.z : max(q.x, q.y);
    }
    if (vS == 3 || vS == 5) d = abs(d) - vCl.w * 0.5;
    float aa = max(fwidth(d), 1e-4);
    o = vCol * clamp(0.5 - d / aa, 0.0, 1.0);
    return;
  }
  if (vU >= 8) { o = vCol; return; }
  vec2 lo = vCl.xy, hi = vCl.zw - 1.0;
  if (vS == 0) { o = tf(vU, ivec2(clamp(floor(vUV), lo, hi))) * vCol; return; }
  vec2 q = vUV - 0.5, f = fract(q), b = floor(q);
  ivec2 a = ivec2(clamp(b, lo, hi)), c = ivec2(clamp(b + 1.0, lo, hi));
  o = mix(mix(tf(vU, a), tf(vU, ivec2(c.x, a.y)), f.x), mix(tf(vU, ivec2(a.x, c.y)), tf(vU, c), f.x), f.y) * vCol;
}
// vA 1: «lighter» sobre lo opaco dentro del mismo lote: alfa 0 con source-over premultiplicado = suma exacta.
// vR 1: color en lineal (three.js pintando a una textura no lo pasa a sRGB; a la pantalla sí): se pasa aquí, como haría él.
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main() { shade(); if (vR == 1 && o.a > 0.0) o.rgb = srgb(clamp(o.rgb / o.a, 0.0, 1.0)) * o.a; if (vA == 1) o.a = 0.0; }`;

  function init(cv) {
    const g = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!g) return false;
    gl = g; screen = cv; gen++;
    if (!setup()) { gl = null; return false; }
    if (!cv.__gl2dBound) {
      cv.__gl2dBound = true;
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; nq = 0; nunits = 0; open = null; });
      cv.addEventListener('webglcontextrestored', () => { if (cv !== screen) return; gen++; lost = !setup(); TA.reset(); IA.reset(); });
    }
    return true;
  }

  function setup() {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.error('[GL2D] shader', gl.getShaderInfoLog(o)); return null; } return o; };
    const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
    if (!v || !f) return false;
    prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error('[GL2D] link', gl.getProgramInfoLog(prog)); return false; }
    gl.useProgram(prog);
    uRes = gl.getUniformLocation(prog, 'uRes'); uFlip = gl.getUniformLocation(prog, 'uFlip');
    gl.uniform1iv(gl.getUniformLocation(prog, 'uT'), [0, 1, 2, 3, 4, 5, 6, 7]);
    MAXT = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, 4096 * 4 * STRIDE, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, STRIDE, 36);
    // Índices de 16 bits: 4096 quads (16384 vértices) por llamada; un lote más grande se manda en varias.
    const idx = new Uint16Array(4096 * 6);
    for (let i = 0, q = 0; i < idx.length; i += 6, q += 4) { idx[i] = q; idx[i + 1] = q + 1; idx[i + 2] = q + 2; idx[i + 3] = q + 2; idx[i + 4] = q + 1; idx[i + 5] = q + 3; }
    ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.enable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    blendNow = ''; target = null; nq = 0; nunits = 0; units.fill(null);
    return true;
  }

  // ---------------- modos de mezcla (colores premultiplicados: Porter-Duff exacto) ----------------
  const BLEND = {
    'source-over': g => g.blendFuncSeparate(g.ONE, g.ONE_MINUS_SRC_ALPHA, g.ONE, g.ONE_MINUS_SRC_ALPHA),
    'lighter': g => g.blendFuncSeparate(g.ONE, g.ONE, g.ONE, g.ONE),
    'copy': g => g.blendFuncSeparate(g.ONE, g.ZERO, g.ONE, g.ZERO),
    'multiply': g => g.blendFuncSeparate(g.DST_COLOR, g.ONE_MINUS_SRC_ALPHA, g.ONE, g.ONE_MINUS_SRC_ALPHA),
    'source-atop': g => g.blendFuncSeparate(g.DST_ALPHA, g.ONE_MINUS_SRC_ALPHA, g.ZERO, g.ONE),
    'source-in': g => g.blendFuncSeparate(g.DST_ALPHA, g.ZERO, g.DST_ALPHA, g.ZERO),
    'destination-in': g => g.blendFuncSeparate(g.ZERO, g.SRC_ALPHA, g.ZERO, g.SRC_ALPHA),
    'destination-out': g => g.blendFuncSeparate(g.ZERO, g.ONE_MINUS_SRC_ALPHA, g.ZERO, g.ONE_MINUS_SRC_ALPHA),
    'destination-over': g => g.blendFuncSeparate(g.ONE_MINUS_DST_ALPHA, g.ONE, g.ONE_MINUS_DST_ALPHA, g.ONE),
    'screen': g => g.blendFuncSeparate(g.ONE, g.ONE_MINUS_SRC_COLOR, g.ONE, g.ONE_MINUS_SRC_ALPHA),
  };
  // (En el respaldo, estos van de uno en uno: varios dibujos juntos en un trozo no darían lo mismo.)
  const SOLO = new Set(['multiply', 'source-atop', 'source-in', 'destination-in', 'destination-out', 'destination-over', 'screen', 'copy']);

  // ---------------- lotes ----------------
  function bindTarget(t) {
    if (t === target) return;
    draw('destino'); target = t;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
  }
  function draw(why) {
    if (!nq || lost) { nq = 0; nunits = 0; return; }
    if (DBG) { const k = 'corte ' + (why || ((new Error().stack || '').split('\n')[2] || '').replace(/^.*\/js\//, '').replace(/[()]/g, '').trim()); DBG.set(k, (DBG.get(k) || 0) + 1); }
    const t = target, W = t ? t.w : screen.width, H = t ? t.h : screen.height;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(uRes, W, H); gl.uniform1f(uFlip, t ? -1 : 1);
    for (let i = 0; i < nunits; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, units[i]); }
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    for (let q0 = 0; q0 < nq; q0 += 4096) {
      const n = Math.min(4096, nq - q0);
      gl.bufferData(gl.ARRAY_BUFFER, 4096 * 4 * STRIDE, gl.STREAM_DRAW);           // (búfer nuevo: no espera al de antes)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, B, q0 * 4 * STRIDE, n * 4 * STRIDE);
      gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_SHORT, 0);
      st.draws++;
    }
    st.quads += nq;
    nq = 0; nunits = 0;
    for (let i = 0; i < U; i++) units[i] = null;
  }
  function setBlend(m) {
    if (m === blendNow) return;
    draw('mezcla ' + blendNow + '>' + m);
    (BLEND[m] || BLEND['source-over'])(gl);
    blendNow = m;
  }
  function unitFor(tex) {
    for (let i = 0; i < nunits; i++) if (units[i] === tex) return i;
    if (nunits >= U) draw('texturas');
    units[nunits] = tex;
    return nunits++;
  }
  // ?glgpu=1: tiempo de la GPU de verdad (EXT_disjoint_timer_query_webgl2) por partes del fotograma: 'dibujo' (este motor) y
  // lo que se marque con G.GL2D.gpuMark (p. ej. '3d', three.js). Sólo para medir; G.GL2D.gpu() da la media de ms por parte.
  const GT = { on: QS.get('glgpu') === '1', ext: null, cur: null, q: null, pend: [], acc: {}, n: 0 };
  function gpuMark(label) {
    if (!GT.on || !gl) return;
    if (!GT.ext) { GT.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!GT.ext) { GT.on = false; return; } }
    if (GT.q) { gl.endQuery(GT.ext.TIME_ELAPSED_EXT); GT.pend.push([GT.q, GT.cur, frameId]); GT.q = null; }
    if (label) { GT.q = gl.createQuery(); GT.cur = label; gl.beginQuery(GT.ext.TIME_ELAPSED_EXT, GT.q); }
  }
  function gpuPoll() {
    if (!GT.pend.length) return;
    if (gl.getParameter(GT.ext.GPU_DISJOINT_EXT)) { for (const [q] of GT.pend) gl.deleteQuery(q); GT.pend = []; return; }
    while (GT.pend.length && gl.getQueryParameter(GT.pend[0][0], gl.QUERY_RESULT_AVAILABLE)) {
      const [q, lab] = GT.pend.shift();
      GT.acc[lab] = (GT.acc[lab] || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
    }
  }
  function schedule() { if (!queued) { queued = true; if (GT.on && !GT.q) gpuMark('dibujo'); queueMicrotask(endFrame); } }
  function endFrame() {
    queued = false;
    if (open) open._close();
    draw();
    if (GT.on && GT.ext) { gpuMark(null); GT.n++; gpuPoll(); }
    // (Puede haber varias tandas por fotograma, p. ej. otro aviso de rAF que no dibuja: se guarda la que dibujó algo.)
    if (st.quads || st.fb || st.uploads || st.draws) { Object.assign(last, st); for (const k in st) st[k] = 0; }
    frameId++;
  }
  // Un quad: el rectángulo (dx, dy, dw, dh) con la matriz m; u/v en las esquinas; cl: 4 números para el shader.
  function quad(m, dx, dy, dw, dh, u0, v0, u1, v1, c0, c1, c2, c3, unit, mode, r, g, b, a) {
    if (nq >= MAXQ) draw();
    schedule();
    const o = nq * 40, ob = nq * 4 * STRIDE + 32;
    const A = m[0], Bm = m[1], C = m[2], D = m[3], E = m[4], Fm = m[5];
    const xa = dx, xb = dx + dw, ya = dy, yb = dy + dh;
    F[o] = A * xa + C * ya + E; F[o + 1] = Bm * xa + D * ya + Fm; F[o + 2] = u0; F[o + 3] = v0;
    F[o + 10] = A * xb + C * ya + E; F[o + 11] = Bm * xb + D * ya + Fm; F[o + 12] = u1; F[o + 13] = v0;
    F[o + 20] = A * xa + C * yb + E; F[o + 21] = Bm * xa + D * yb + Fm; F[o + 22] = u0; F[o + 23] = v1;
    F[o + 30] = A * xb + C * yb + E; F[o + 31] = Bm * xb + D * yb + Fm; F[o + 32] = u1; F[o + 33] = v1;
    for (let i = 0; i < 4; i++) {
      const k = o + i * 10 + 4; F[k] = c0; F[k + 1] = c1; F[k + 2] = c2; F[k + 3] = c3;
      const bb = ob + i * STRIDE; B[bb] = r; B[bb + 1] = g; B[bb + 2] = b; B[bb + 3] = a; B[bb + 4] = unit; B[bb + 5] = mode; B[bb + 6] = addQ; B[bb + 7] = srgbQ;
    }
    nq++;
  }

  // ---------------- texturas de imágenes y lienzos ----------------
  // (Una imagen o lienzo que ya no existe: su textura propia se borra de la GPU.)
  const reg = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry(h => { if (gl && h.gen === gen && h.tex && !h.page) gl.deleteTexture(h.tex); }) : null;
  const fin = (src, e) => { if (reg) reg.register(src, e); };
  /** Suelta ya la textura de un lienzo (G.U.freeCanvas lo pone a tamaño 0). */
  function drop(src) {
    const e = src.__gle;
    if (!e) return;
    src.__gle = null;
    if (gl && e.gen === gen && e.tex && !e.page) { draw(); gl.deleteTexture(e.tex); e.tex = null; }
  }
  // Atlas de imágenes pequeñas: páginas de 2048×2048 en estantes. Llenas todas, se vacían y se vuelven a llenar con lo que se use.
  const IA = {
    S: 2048, MAXS: 512, MAXP: 6, pages: [], cur: null,
    alloc(w, h) {
      let p = this.cur;
      if (!p || !this.fits(p, w, h)) {
        p = this.pages.find(q => this.fits(q, w, h));
        if (!p) {
          if (this.pages.length < this.MAXP) {
            p = { tex: newTex(), x: 0, y: 0, rowH: 0, epoch: 1 };
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.S, this.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            this.pages.push(p);
          } else {
            // (Todas llenas: se vacían todas; lo que se dibuje se vuelve a subir.)
            for (const q of this.pages) { q.x = q.y = q.rowH = 0; q.epoch++; }
            p = this.pages[0];
          }
        }
        this.cur = p;
      }
      if (p.x + w > this.S) { p.x = 0; p.y += p.rowH + 1; p.rowH = 0; }
      const r = [p, p.x, p.y];
      p.x += w + 1; p.rowH = Math.max(p.rowH, h);
      return r;
    },
    fits(p, w, h) { return (p.x + w <= this.S && p.y + h <= this.S) || (p.y + p.rowH + 1 + h <= this.S && w <= this.S); },
    reset() { this.pages = []; this.cur = null; },
  };
  function newTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  /** La textura de lo que se va a dibujar: { tex, w, h, flip } o null si aún no hay nada que dibujar. */
  function entry(src) {
    if (src && src.__gl2dLayer) return src._entry();
    if (src && src.__gl2dExt) { const r = src._f(); return r && r.tex ? { tex: r.tex, w: r.w, h: r.h, flip: true, srgb: !!r.linear } : null; }
    if (src === screen) return screenCopy();
    // Lo de siempre (la misma imagen o el mismo lienzo sin cambios): directo. Los cambios suben su versión (__v): un lienzo
    // 2D al dibujar en él o cambiar de tamaño, una imagen al cambiar de dirección (ver patch).
    const e0 = src.__gle;
    if (e0 && e0.gen === gen && e0.kind !== 2 && e0.ver === (src.__v | 0) && (!e0.page || e0.page.epoch === e0.epoch)) return e0;
    let w, h, kind = 0, key = null;      // kind: 0 imagen, 1 lienzo 2D, 2 cambia cada fotograma (WebGL, vídeo)
    if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
      if (!src.complete || !src.naturalWidth) return null;
      w = src.naturalWidth; h = src.naturalHeight; key = src.currentSrc || src.src;
    } else if (typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement) { w = src.videoWidth; h = src.videoHeight; kind = 2; }
    else if (src && src.width !== undefined) {
      w = src.width; h = src.height;
      kind = src.__ctxType && src.__ctxType !== '2d' ? 2 : (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap ? 0 : 1);
    } else return null;
    if (!w || !h) return null;
    let e = src.__gle;
    const ver = kind === 2 ? frameId : (src.__v | 0);
    if (e && e.gen === gen && e.w === w && e.h === h && e.ver === ver && e.key === key && (!e.page || e.page.epoch === e.epoch)) return e;
    if (w > MAXT || h > MAXT) { warn('big', 'imagen más grande que la GPU (' + w + '×' + h + '): no se dibuja'); return null; }
    draw();                              // (lo pendiente puede usar lo de antes de esta textura)
    // Pequeñas (hojas de sprites, efectos, iconos): en un atlas, para que muchas vayan en la misma llamada. Grandes, o que
    // cambian en cada fotograma: su propia textura.
    const small = kind !== 2 && w <= IA.MAXS && h <= IA.MAXS;
    if (!e || e.gen !== gen || (e.page && e.page.epoch !== e.epoch) || (small && (!e.page || e.w !== w || e.h !== h)) || (!small && e.page)) {
      if (e && !e.page && e.gen === gen && e.tex) gl.deleteTexture(e.tex);
      e = { tex: null, w: 0, h: 0, ver: -1, gen, flip: false, key: null, ox: 0, oy: 0, page: null, epoch: 0, kind };
      if (small) { const at = IA.alloc(w, h); e.page = at[0]; e.epoch = at[0].epoch; e.tex = at[0].tex; e.ox = at[1]; e.oy = at[2]; }
      else { e.tex = newTex(); fin(src, e); }
      try { src.__gle = e; } catch (er) { /* (no admite propiedades: se sube cada vez) */ }
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e.tex);
    try {
      if (e.page || (e.w === w && e.h === h)) gl.texSubImage2D(gl.TEXTURE_2D, 0, e.ox, e.oy, gl.RGBA, gl.UNSIGNED_BYTE, src);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (err) { warn('up', 'no se pudo subir una imagen: ' + err.message); return null; }
    e.w = w; e.h = h; e.ver = ver; e.key = key;
    st.uploads++; st.upPx += w * h;
    if (DBG) { const k = 'subida ' + (src.constructor && src.constructor.name) + ' ' + w + '×' + h + ' k' + kind + ' ' + ((new Error().stack || '').split('\n').slice(3, 6).join(' < ')).replace(/https?:\/\/[^/]+\/js\//g, '').replace(/\s+at\s+/g, ' ').trim();
      DBG.set(k, (DBG.get(k) || 0) + 1); }
    return e;
  }
  // drawImage(el propio lienzo de la pantalla): se copia lo que hay (queda boca abajo: flip).
  let scr = null;
  function screenCopy() {
    const W = screen.width, H = screen.height;
    if (!scr || scr.gen !== gen) scr = { tex: newTex(), w: 0, h: 0, gen, flip: true, fr: -1, dirty: true };
    if (scr.fr === frameId && scr.w === W && scr.h === H && !scr.dirty) return scr;
    const t = target; bindTarget(null); draw();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scr.tex);
    if (scr.w !== W || scr.h !== H) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); scr.w = W; scr.h = H; }
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
    scr.fr = frameId; scr.dirty = false;
    bindTarget(t);
    return scr;
  }

  // ---------------- atlas de textos ----------------
  // Cada texto (con su letra, color, borde, alineación y escala) se pinta una vez con el Canvas 2D en «stage» y se sube a su
  // hueco del atlas (estantes). Lleno: se vacía y se vuelve a llenar con lo que se use.
  const TA = {
    S: 2048, tex: null, gen: -1, x: 0, y: 0, rowH: 0, map: new Map(), stage: null, sx: null,
    reset() { this.map.clear(); this.x = this.y = this.rowH = 0; },
    ready() {
      if (this.tex && this.gen === gen) return true;
      this.tex = newTex(); this.gen = gen;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.S, this.S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.reset();
      return true;
    },
    alloc(w, h) {
      if (w > this.S || h > this.S) return null;
      if (this.x + w > this.S) { this.x = 0; this.y += this.rowH + 1; this.rowH = 0; }
      if (this.y + h > this.S) { draw(); this.reset(); }
      const r = [this.x, this.y];
      this.x += w + 1; this.rowH = Math.max(this.rowH, h);
      return r;
    },
  };
  if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
    // (Una letra que llega tarde: los textos ya pintados con la de respaldo se vuelven a pintar.)
    document.fonts.addEventListener('loadingdone', () => { if (gl) { draw(); TA.reset(); } });
  }

  // ---------------- colores ----------------
  const colors = new Map();
  let parser = null;
  function rgba(s) {
    let c = colors.get(s);
    if (c) return c;
    if (!parser) parser = document.createElement('canvas').getContext('2d');
    parser.fillStyle = '#000'; parser.fillStyle = s;
    const n = parser.fillStyle;
    if (n[0] === '#') c = [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16), 1];
    else { const m = n.match(/[\d.]+/g) || [0, 0, 0, 0]; c = [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]]; }
    if (colors.size > 4000) colors.clear();
    colors.set(s, c);
    return c;
  }

  // ---------------- estado del contexto ----------------
  class State {
    constructor(o) {
      if (!o) {
        this.m = [1, 0, 0, 1, 0, 0]; this.alpha = 1; this.comp = 'source-over'; this.fill = '#000000'; this.stroke = '#000000';
        this.lw = 1; this.cap = 'butt'; this.join = 'miter'; this.miter = 10; this.dash = null; this.dashOff = 0;
        this.font = '10px sans-serif'; this.align = 'start'; this.base = 'alphabetic'; this.smooth = true; this.smoothQ = 'low';
        this.filter = 'none'; this.sBlur = 0; this.sColor = 'rgba(0, 0, 0, 0)'; this.sX = 0; this.sY = 0; this.dir = 'inherit';
        this.ls = '0px'; this.clip = 0; this.sc = 0; this._sig = {};
        return;
      }
      this.m = o.m.slice(); this.alpha = o.alpha; this.comp = o.comp; this.fill = o.fill; this.stroke = o.stroke;
      this.lw = o.lw; this.cap = o.cap; this.join = o.join; this.miter = o.miter; this.dash = o.dash; this.dashOff = o.dashOff;
      this.font = o.font; this.align = o.align; this.base = o.base; this.smooth = o.smooth; this.smoothQ = o.smoothQ;
      this.filter = o.filter; this.sBlur = o.sBlur; this.sColor = o.sColor; this.sX = o.sX; this.sY = o.sY; this.dir = o.dir;
      this.ls = o.ls; this.clip = o.clip; this.sc = 0; this._sig = o._sig;     // (copia: la misma firma hasta que algo cambie)
    }
  }
  const PROPS = { globalAlpha: 'alpha', globalCompositeOperation: 'comp', fillStyle: 'fill', strokeStyle: 'stroke', lineWidth: 'lw',
    lineCap: 'cap', lineJoin: 'join', miterLimit: 'miter', lineDashOffset: 'dashOff', font: 'font', textAlign: 'align', textBaseline: 'base',
    imageSmoothingEnabled: 'smooth', imageSmoothingQuality: 'smoothQ', filter: 'filter', shadowBlur: 'sBlur', shadowColor: 'sColor',
    shadowOffsetX: 'sX', shadowOffsetY: 'sY', direction: 'dir', letterSpacing: 'ls' };
  // Lo que se copia a un Canvas 2D de verdad (respaldo, atlas de textos) antes de pintar en él (sólo si ha cambiado).
  const SYNC = ['alpha', 'comp', 'fill', 'stroke', 'lw', 'cap', 'join', 'miter', 'dashOff', 'font', 'align', 'base', 'smooth', 'smoothQ',
    'filter', 'sBlur', 'sColor', 'sX', 'sY', 'dir', 'ls'];
  const NAME = {};
  for (const p in PROPS) NAME[PROPS[p]] = p;
  function syncTo(s, sx, cache) {
    if (cache.__sig === s._sig) return;      // (nada ha cambiado desde la última vez: la misma firma)
    cache.__sig = s._sig;
    for (let i = 0; i < SYNC.length; i++) {
      const p = SYNC[i], v = s[p];
      if (cache[p] !== v) { sx[NAME[p]] = v; cache[p] = v; }
    }
    const dk = s.dash ? s.dash.join(',') : '';
    if (cache.dash !== dk) { sx.setLineDash(s.dash || []); cache.dash = dk; }
  }

  // Trazados: cada pieza se guarda (con la matriz de ese momento) para dibujarla nativa si es una forma suelta o, si no,
  // repetirla en el Canvas 2D de respaldo.
  const OP = { move: 0, line: 1, rect: 2, rrect: 3, arc: 4, arcTo: 5, ell: 6, quadTo: 7, bez: 8, close: 9 };
  const OPN = ['moveTo', 'lineTo', 'rect', 'roundRect', 'arc', 'arcTo', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'closePath'];

  class Ctx {
    constructor(canvas, layer) {
      this.canvas = canvas; this._layer = layer || null;       // (layer: lienzo aparte en la GPU; null: la pantalla)
      this._sx = null; this._sxs = {}; this._sxDepth = 0; this._fbMode = 'source-over'; this._gb = [0, 0, 0, 0];
      this._p = []; this._pms = []; this._mv = 0; this._pmv = -1; this._pb = [Infinity, Infinity, -Infinity, -Infinity];
      this._bb = [0, 0, 0, 0]; this._rawT = false; this._cl = [0, 0, 0, 0]; this._clips = [];
      this._reset();
    }
    _reset() {
      this.s = new State();
      this._stack = [];
      this._mv++;
      if (this._sx) {
        if (open === this) open = null;
        while (this._sxDepth > 0) { this._sx.restore(); this._sxDepth--; }
        const W = this._W(), H = this._H();
        if (W && H && (this._sx.canvas.width !== W || this._sx.canvas.height !== H)) this._resizeScratch(W, H);
        this._sxs = {};
      }
      this._sxDepth = 0; this._clips = [];
    }
    _tgt() { return this._layer ? this._layer._target() : null; }
    _W() { return this._layer ? this._layer._w : this.canvas.width; }
    _H() { return this._layer ? this._layer._h : this.canvas.height; }
    isContextLost() { return lost; }
    getContextAttributes() { return { alpha: true }; }

    // ---- estado ----
    save() { this._stack.push(this.s); this.s = new State(this.s); }
    restore() {
      if (!this._stack.length) return;
      const sc = this.s.sc, m0 = this.s.m;
      this.s = this._stack.pop();
      if (m0[0] !== this.s.m[0] || m0[1] !== this.s.m[1] || m0[2] !== this.s.m[2] || m0[3] !== this.s.m[3] || m0[4] !== this.s.m[4] || m0[5] !== this.s.m[5]) this._mv++;
      if (sc && this._sx) { if (open === this) this._close(); for (let i = 0; i < sc; i++) { this._sx.restore(); this._sxDepth--; } this._clips.length = this._sxDepth; this._sxs = {}; }
    }
    setTransform(a, b, c, d, e, f) {
      const m = this.s.m; this._mv++;
      if (typeof a === 'object' && a) { m[0] = a.a; m[1] = a.b; m[2] = a.c; m[3] = a.d; m[4] = a.e; m[5] = a.f; }
      else if (a === undefined) { m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 1; m[4] = 0; m[5] = 0; }
      else { m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = e; m[5] = f; }
    }
    resetTransform() { this.setTransform(1, 0, 0, 1, 0, 0); }
    getTransform() { const m = this.s.m; return new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]); }
    transform(a, b, c, d, e, f) {
      const m = this.s.m, A = m[0], B2 = m[1], C = m[2], D = m[3]; this._mv++;
      m[0] = A * a + C * b; m[1] = B2 * a + D * b; m[2] = A * c + C * d; m[3] = B2 * c + D * d;
      m[4] += A * e + C * f; m[5] += B2 * e + D * f;
    }
    translate(x, y) { const m = this.s.m; this._mv++; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
    scale(x, y) { const m = this.s.m; this._mv++; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
    rotate(r) { const c = Math.cos(r), s = Math.sin(r); this.transform(c, s, -s, c, 0, 0); }
    setLineDash(d) { this.s.dash = d && d.length ? d.slice() : null; this.s._sig = {}; }
    getLineDash() { return this.s.dash ? this.s.dash.slice() : []; }

    // ---- nativo ----
    _native() {
      const s = this.s;
      return !s.clip && s.filter === 'none' && BLEND[s.comp] !== undefined && !((s.sBlur > 0 || s.sX || s.sY) && rgba(String(s.sColor))[3] > 0);
    }
    _prep() {
      if (lost) return false;
      const t = this._tgt(); if (t && t.dummy) return false;
      if (open && open !== this) open._close();
      bindTarget(t);
      if (open === this) this._close();
      // (En la pantalla, que es opaca, «lighter» va en el mismo lote que lo normal; en una capa transparente, aparte.)
      if (this.s.comp === 'lighter' && !t) { setBlend('source-over'); addQ = 1; }
      else { setBlend(this.s.comp); addQ = 0; }
      return true;
    }
    fillRect(x, y, w, h) {
      const s = this.s;
      if (typeof s.fill !== 'string' || !this._native()) return this._fb('fillRect', arguments, this._rectBB(x, y, w, h, 0));
      if (!(w && h) || !this._prep()) return;
      const c = rgba(s.fill), a = c[3] * s.alpha;
      if (a <= 0 && s.comp !== 'copy') return;
      // (Bordes en medio de un píxel de la pantalla: el Canvas 2D los suaviza; aquí también, con el rectángulo del shader.)
      const m = s.m;
      if (m[1] === 0 && m[2] === 0) {
        const X0 = m[0] * x + m[4], Y0 = m[3] * y + m[5], X1 = X0 + m[0] * w, Y1 = Y0 + m[3] * h, fr = v => Math.abs(v - Math.round(v)) > 0.01;
        if (fr(X0) || fr(Y0) || fr(X1) || fr(Y1)) {
          if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
          return this._shape(m, 4, x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, s.fill, 0);
        }
      }
      quad(m, x, y, w, h, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, c[0] * a + 0.5 | 0, c[1] * a + 0.5 | 0, c[2] * a + 0.5 | 0, a * 255 + 0.5 | 0);
    }
    strokeRect(x, y, w, h) {
      const s = this.s;
      if (typeof s.stroke !== 'string' || s.dash || !this._native()) return this._fb('strokeRect', arguments, this._rectBB(x, y, w, h, 1));
      if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
      this._shape(s.m, 4, x + w / 2, y + h / 2, w / 2, h / 2, 0, s.lw, s.stroke, 0);
    }
    clearRect(x, y, w, h) {
      if (lost) return;
      const t0 = this._tgt(); if (t0 && t0.dummy) return;
      const m = this.s.m;
      if (open && open !== this) open._close();
      bindTarget(t0);
      if (open === this) this._close();
      // Todo el lienzo, sin girar: gl.clear (lo más barato).
      if (m[1] === 0 && m[2] === 0 && !this.s.clip) {
        const W = this._W(), H = this._H();
        const x0 = m[0] * x + m[4], y0 = m[3] * y + m[5], x1 = x0 + m[0] * w, y1 = y0 + m[3] * h;
        if (Math.min(x0, x1) <= 0 && Math.min(y0, y1) <= 0 && Math.max(x0, x1) >= W && Math.max(y0, y1) >= H) {
          draw(); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          if (!this._layer && scr) scr.dirty = true;
          return;
        }
      }
      setBlend('copy'); addQ = 0;
      quad(m, x, y, w, h, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0);
    }
    drawImage(img, a, b, c, d, e, f, g, h) {
      let sx = 0, sy = 0, sw, sh, dx, dy, dw, dh;
      const n = arguments.length;
      if (!this._native()) return this._fb('drawImage', arguments, null, img);
      if (lost) return;
      const E = entry(img);
      if (!E || !this._prep()) return;
      if (n === 3) { dx = a; dy = b; dw = sw = E.w; dh = sh = E.h; }
      else if (n === 5) { dx = a; dy = b; dw = c; dh = d; sw = E.w; sh = E.h; }
      else { sx = a; sy = b; sw = c; sh = d; dx = e; dy = f; dw = g; dh = h; }
      if (!sw || !sh || !dw || !dh) return;
      // (Como el Canvas 2D: un trozo de origen que se sale de la imagen se recorta, y el destino con él.)
      if (n === 9) {
        if (sw < 0) { sx += sw; sw = -sw; } if (sh < 0) { sy += sh; sh = -sh; }
        const kx = dw / sw, ky = dh / sh;
        if (sx < 0) { dx -= sx * kx; dw += sx * kx; sw += sx; sx = 0; }
        if (sy < 0) { dy -= sy * ky; dh += sy * ky; sh += sy; sy = 0; }
        if (sx + sw > E.w) { const o = sx + sw - E.w; sw -= o; dw -= o * kx; }
        if (sy + sh > E.h) { const o = sy + sh - E.h; sh -= o; dh -= o * ky; }
        if (sw <= 0 || sh <= 0) return;
      }
      const s = this.s, al = s.alpha;
      if (al <= 0 && s.comp !== 'copy') return;
      const u = unitFor(E.tex), A = al * 255 + 0.5 | 0, sm = s.smooth ? 1 : 0;
      srgbQ = E.srgb ? 1 : 0;
      if (E.flip) quad(s.m, dx, dy, dw, dh, sx, E.h - sy, sx + sw, E.h - sy - sh, sx, E.h - sy - sh, sx + sw, E.h - sy, u, sm, A, A, A, A);
      else { const ox = E.ox || 0, oy = E.oy || 0; sx += ox; sy += oy; quad(s.m, dx, dy, dw, dh, sx, sy, sx + sw, sy + sh, sx, sy, sx + sw, sy + sh, u, sm, A, A, A, A); }
      srgbQ = 0;
    }

    // ---- formas nativas ----
    // mode 2 elipse / 4 rectángulo redondeado, en el sistema de la matriz m centrado en (cx, cy) y girado rot.
    _shape(m, mode, cx, cy, hx, hy, r, lw, style, rot) {
      if (!this._prep()) return;
      const s = this.s, c = rgba(style), a = c[3] * s.alpha;
      if (a <= 0) return;
      const stroke = lw > 0;
      // La matriz de la forma: m · trasladar(cx, cy) · girar(rot)
      let A = m[0], Bm = m[1], C = m[2], D = m[3];
      const E = m[4] + A * cx + C * cy, Fm = m[5] + Bm * cx + D * cy;
      if (rot) { const co = Math.cos(rot), si = Math.sin(rot), a0 = A, b0 = Bm; A = a0 * co + C * si; Bm = b0 * co + D * si; C = -a0 * si + C * co; D = -b0 * si + D * co; }
      const M = this._sm || (this._sm = [0, 0, 0, 0, 0, 0]);
      M[0] = A; M[1] = Bm; M[2] = C; M[3] = D; M[4] = E; M[5] = Fm;
      const k = Math.min(Math.hypot(A, Bm), Math.hypot(C, D)) || 1;
      const pad = (stroke ? lw / 2 : 0) + 1.5 / k;
      const ex = hx + pad, ey = hy + pad;
      st.shapes++;
      quad(M, -ex, -ey, 2 * ex, 2 * ey, -ex, -ey, ex, ey, hx, hy, r, lw, 255, mode + (stroke ? 1 : 0),
        c[0] * a + 0.5 | 0, c[1] * a + 0.5 | 0, c[2] * a + 0.5 | 0, a * 255 + 0.5 | 0);
    }
    /** ¿El trazado es una sola forma que se puede hacer nativa? → [mode, cx, cy, hx, hy, r, rot, mIndex] o null. */
    _single() {
      const p = this._p, n = p.length;
      if (!n || n > 7) return null;
      let i = 0;
      const o0 = p[0];
      // moveTo + 4 arcTo + closePath (el rectángulo redondeado del HUD)
      if (n >= 5 && o0.c === OP.move && p[1].c === OP.arcTo && p[2].c === OP.arcTo && p[3].c === OP.arcTo && p[4].c === OP.arcTo && (n === 5 || (n === 6 && p[5].c === OP.close))) {
        const mi = o0.mi;
        for (let j = 1; j < 5; j++) if (p[j].mi !== mi) return null;
        // (Esquinas: arriba-der, abajo-der, abajo-izq, arriba-izq. Con tolerancia: x + r - r no siempre da x.)
        const a1 = p[1].a, a2 = p[2].a, a3 = p[3].a, a4 = p[4].a, r = a1[4];
        const L = a3[0], T = a4[1], R = a1[0], Bt = a2[1], w = R - L, h = Bt - T, eq = (u, v) => Math.abs(u - v) <= 1e-6 * (1 + Math.abs(u));
        if (!(w > 0 && h > 0) || !eq(o0.a[0], L + r) || !eq(o0.a[1], T) ||
            !eq(a1[1], T) || !eq(a1[2], R) || !eq(a1[3], Bt) || !eq(a2[0], R) || !eq(a2[2], L) || !eq(a2[3], Bt) ||
            !eq(a3[1], Bt) || !eq(a3[2], L) || !eq(a3[3], T) || !eq(a4[0], L) || !eq(a4[2], R) || !eq(a4[3], T) ||
            a2[4] !== r || a3[4] !== r || a4[4] !== r || !(r >= 0) || r > Math.min(w, h) / 2 + 1e-6) return null;
        return [4, L + w / 2, T + h / 2, w / 2, h / 2, r, 0, mi];
      }
      if (n > 3) return null;
      let mv = null;
      if (o0.c === OP.move) { mv = o0; i = 1; }
      const op = p[i];
      if (!op || (i + 1 < n && !(i + 2 === n && p[i + 1].c === OP.close))) return null;
      if (mv && mv.mi !== op.mi) return null;
      const a = op.a;
      if (op.c === OP.ell || op.c === OP.arc) {
        const isE = op.c === OP.ell, cx = a[0], cy = a[1], rx = a[2], ry = isE ? a[3] : a[2], rot = isE ? a[4] : 0;
        const a0 = isE ? a[5] : a[3], a1 = isE ? a[6] : a[4];
        if (!(rx >= 0 && ry >= 0) || Math.abs(a1 - a0) < TAU - 1e-4) return null;
        // (un moveTo antes vale si es justo donde empieza el arco: no añade ninguna línea)
        if (mv) { const sx = cx + rx * Math.cos(a0) * Math.cos(rot) - ry * Math.sin(a0) * Math.sin(rot), sy = cy + rx * Math.cos(a0) * Math.sin(rot) + ry * Math.sin(a0) * Math.cos(rot);
          if (Math.abs(sx - mv.a[0]) > 1e-3 || Math.abs(sy - mv.a[1]) > 1e-3) return null; }
        return [2, cx, cy, rx, ry, 0, rot, op.mi];
      }
      if (mv) return null;
      if (op.c === OP.rect) { let [x, y, w, h] = a; if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; } return [4, x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, op.mi]; }
      if (op.c === OP.rrect) {
        let [x, y, w, h, r] = a; if (Array.isArray(r)) { if (r.length !== 1) return null; r = r[0]; }
        if (typeof r !== 'number' || w < 0 || h < 0) return null;
        r = Math.min(r, w / 2, h / 2);
        return [4, x + w / 2, y + h / 2, w / 2, h / 2, r, 0, op.mi];
      }
      return null;
    }

    // ---- trazados ----
    _op(c, a, bbFn) {
      if (this._pmv !== this._mv) { this._pms.push(this.s.m.slice()); this._pmv = this._mv; }
      this._p.push({ c, mi: this._pms.length - 1, a });
      bbFn();
    }
    _pt(x, y, r) {
      const m = this.s.m, X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5], pb = this._pb;
      const R = r ? r * Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])) : 0;
      if (X - R < pb[0]) pb[0] = X - R; if (Y - R < pb[1]) pb[1] = Y - R; if (X + R > pb[2]) pb[2] = X + R; if (Y + R > pb[3]) pb[3] = Y + R;
    }
    beginPath() { this._p.length = 0; this._pms.length = 0; this._pmv = -1; this._pb[0] = this._pb[1] = Infinity; this._pb[2] = this._pb[3] = -Infinity; }
    closePath() { this._op(OP.close, null, () => {}); }
    moveTo(x, y) { this._op(OP.move, [x, y], () => this._pt(x, y)); }
    lineTo(x, y) { this._op(OP.line, [x, y], () => this._pt(x, y)); }
    rect(x, y, w, h) { this._op(OP.rect, [x, y, w, h], () => { this._pt(x, y); this._pt(x + w, y + h); this._pt(x + w, y); this._pt(x, y + h); }); }
    roundRect(x, y, w, h, r) { this._op(OP.rrect, [x, y, w, h, r === undefined ? 0 : r], () => { this._pt(x, y); this._pt(x + w, y + h); this._pt(x + w, y); this._pt(x, y + h); }); }
    arc(x, y, r, a0, a1, ccw) { this._op(OP.arc, [x, y, r, a0, a1, !!ccw], () => this._pt(x, y, Math.abs(r))); }
    arcTo(x1, y1, x2, y2, r) { this._op(OP.arcTo, [x1, y1, x2, y2, r], () => { this._pt(x1, y1); this._pt(x2, y2); }); }
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) { this._op(OP.ell, [x, y, rx, ry, rot, a0, a1, !!ccw], () => this._pt(x, y, Math.max(Math.abs(rx), Math.abs(ry)))); }
    quadraticCurveTo(cx, cy, x, y) { this._op(OP.quadTo, [cx, cy, x, y], () => { this._pt(cx, cy); this._pt(x, y); }); }
    bezierCurveTo(a, b, c, d, x, y) { this._op(OP.bez, [a, b, c, d, x, y], () => { this._pt(a, b); this._pt(c, d); this._pt(x, y); }); }
    /** Repite el trazado en el Canvas 2D de respaldo (con la matriz de cada pieza) y deja puesta la de ahora. */
    _replay(sx) {
      this._replayOps(sx, this._p, this._pms);
      const m = this.s.m; sx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    }
    _replayOps(sx, ops, pms) {
      sx.beginPath();
      let mi = -1;
      for (const o of ops) {
        if (o.mi !== mi) { mi = o.mi; const m = pms[mi]; sx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }
        if (o.c === OP.close) sx.closePath(); else sx[OPN[o.c]].apply(sx, o.a);
      }
    }
    fill(p, rule) {
      const s = this.s;
      if (!(p && typeof p === 'object') && typeof s.fill === 'string' && this._native()) {
        const f = this._single();
        if (f) { const m = this._pms[f[7]]; return this._shape(m, f[0], f[1], f[2], f[3], f[4], f[5], 0, s.fill, f[6]); }
      }
      if (p && typeof p === 'object') return this._fb('fill', arguments, null);
      this._fb('fill', arguments, this._grow(0), null, true);
    }
    stroke(p) {
      const s = this.s;
      if (!(p && typeof p === 'object') && typeof s.stroke === 'string' && !s.dash && this._native()) {
        const f = this._single();
        // (Con el borde, sólo si la matriz no deforma: el grosor de la línea es el mismo en todas direcciones.)
        if (f && s.lw > 0) { const m = this._pms[f[7]]; return this._shape(m, f[0], f[1], f[2], f[3], f[4], f[5], s.lw, s.stroke, f[6]); }
      }
      if (p && typeof p === 'object') return this._fb('stroke', arguments, null);
      this._fb('stroke', arguments, this._grow(1), null, true);
    }
    clip() {
      const sx = this._sxc();
      if (open === this) this._close();
      this._replay(sx);
      sx.save(); this._sxDepth++; this.s.sc++;
      this.s.clip++;
      sx.clip.apply(sx, arguments);
      // (Se guarda para volver a ponerlo al borrar el respaldo, ver _close.)
      this._clips.length = this._sxDepth - 1;
      this._clips.push({ p: this._p.slice(), pms: this._pms.map(m => m.slice()), args: [...arguments] });
      this._sxs = {};
    }
    isPointInPath() { const sx = this._sxc(); this._replay(sx); return sx.isPointInPath.apply(sx, arguments); }
    isPointInStroke() { const sx = this._sxc(); this._replay(sx); syncTo(this.s, sx, this._sxs); return sx.isPointInStroke.apply(sx, arguments); }

    // ---- texto ----
    fillText(t, x, y, mw) { if (!this._text(0, t, x, y, mw)) this._fb('fillText', arguments, this._textBB(t, x, y, 0)); }
    strokeText(t, x, y, mw) { if (!this._text(1, t, x, y, mw)) this._fb('strokeText', arguments, this._textBB(t, x, y, 1)); }
    /** Texto sin traducir (G.I18n.rawCanvas): como fillText/strokeText/measureText, sin pasar por el traductor. */
    raw(method, t, ...a) {
      const sx = this._sxc();
      if (method === 'measureText') { syncTo(this.s, sx, this._sxs); return G.I18n.rawCanvas(sx, 'measureText', t); }
      this._rawT = true;
      try {
        const k = method === 'strokeText' ? 1 : 0;
        if (!this._text(k, t, a[0], a[1], a[2])) this._fb(method, [t, ...a], this._textBB(t, a[0], a[1], k));
      } finally { this._rawT = false; }
    }
    measureText(t) { const sx = this._sxc(); syncTo(this.s, sx, this._sxs); return sx.measureText(t); }
    /** Texto nativo: del atlas (pintado una vez con el Canvas 2D). false si no se puede (girado, degradado...). */
    _text(stroke, t, x, y, mw) {
      const s = this.s, m = s.m, style = stroke ? s.stroke : s.fill;
      if (typeof style !== 'string' || !this._native() || m[1] !== 0 || m[2] !== 0 || !(m[0] > 0) || !(m[3] > 0) || s.ls !== '0px' || (stroke && s.dash)) return false;
      t = String(t);
      if (!t.length) return true;
      if (t.length > 120 || !this._prep()) return !lost && t.length <= 120;
      const al = s.alpha;
      if (al <= 0) return true;
      const X = m[0] * x + m[4], Y = m[3] * y + m[5];
      // (Al píxel entero de la pantalla: con medio píxel había 4 versiones de cada número de daño que sube.)
      const fx = 0, fy = 0;
      const key = (stroke ? 'S' : 'F') + (this._rawT ? 'r' : '') + '|' + s.font + '|' + style + '|' + (stroke ? s.lw + s.join + s.miter : '') + '|' + s.align + s.base + s.dir +
        '|' + m[0].toFixed(3) + ',' + m[3].toFixed(3) + '|' + (mw === undefined ? '' : mw) + '|' + t;
      TA.ready();
      let e = TA.map.get(key);
      if (!e) {
        e = this._bake(stroke, t, mw, m[0], m[3], fx, fy, key);
        if (!e) return false;
      }
      e.f = frameId;
      st.texts++;
      // (Una textura nueva en el lote si hace falta: el atlas es una más.)
      const u = unitFor(TA.tex), A = al * 255 + 0.5 | 0;
      const dx = Math.round(X) - e.ox, dy = Math.round(Y) - e.oy;
      quad(IDENT, dx, dy, e.w, e.h, e.x, e.y, e.x + e.w, e.y + e.h, e.x, e.y, e.x + e.w, e.y + e.h, u, 0, A, A, A, A);
      return true;
    }
    _bake(stroke, t, mw, kx, ky, fx, fy, key) {
      if (!TA.stage) { TA.stage = document.createElement('canvas'); TA.stage.__gl2dScratch = true; TA.stage.width = TA.stage.height = 64; TA.sx = TA.stage.getContext('2d', { willReadFrequently: true }); TA.sxs = {}; }
      const c = TA.stage, x2 = TA.sx, s = this.s;
      // Medir con la misma letra (y traducido o no, como se vaya a pintar).
      x2.setTransform(1, 0, 0, 1, 0, 0);
      syncTo(s, x2, TA.sxs);
      const mt = this._rawT ? G.I18n.rawCanvas(x2, 'measureText', t) : x2.measureText(t);
      let L = mt.actualBoundingBoxLeft, R = mt.actualBoundingBoxRight, As = mt.actualBoundingBoxAscent, Ds = mt.actualBoundingBoxDescent;
      if (!Number.isFinite(L) || !Number.isFinite(As)) return null;
      if (mw !== undefined && mt.width > mw && mt.width > 0) { const q = mw / mt.width; L *= q; R *= q; }
      const g = (stroke ? s.lw * (s.join === 'miter' ? Math.min(s.miter, 4) : 1) / 2 : 0) + 2;
      const ox = Math.ceil((L + g) * kx) + 1, oy = Math.ceil((As + g) * ky) + 1;
      const w = ox + Math.ceil((R + g) * kx) + 2, h = oy + Math.ceil((Ds + g) * ky) + 2;
      if (w > 1024 || h > 512 || w <= 0 || h <= 0) return null;
      // (Cambiar el tamaño vacía el lienzo y su estado.)
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; TA.sxs = {}; } else x2.clearRect(0, 0, w, h);
      syncTo(s, x2, TA.sxs);
      x2.globalAlpha = 1; TA.sxs.alpha = 1;               // (la transparencia va en el quad)
      x2.setTransform(kx, 0, 0, ky, ox + fx, oy + fy);
      const fn = stroke ? 'strokeText' : 'fillText';
      if (this._rawT) { if (mw === undefined) G.I18n.rawCanvas(x2, fn, t, 0, 0); else G.I18n.rawCanvas(x2, fn, t, 0, 0, mw); }
      else if (mw === undefined) x2[fn](t, 0, 0); else x2[fn](t, 0, 0, mw);
      const at = TA.alloc(w, h);
      if (!at) return null;
      draw();                              // (por si lo pendiente usa el atlas antes de vaciarse)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, TA.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, at[0], at[1], gl.RGBA, gl.UNSIGNED_BYTE, c);
      st.textNew++; st.uploads++; st.upPx += w * h;
      const e = { x: at[0], y: at[1], w, h, ox, oy, f: frameId };
      TA.map.set(key, e);
      return e;
    }

    // ---- lo que crea objetos: del lienzo de respaldo (sirven para él) ----
    createLinearGradient(a, b, c, d) { return this._sxc().createLinearGradient(a, b, c, d); }
    createRadialGradient(a, b, c, d, e, f) { return this._sxc().createRadialGradient(a, b, c, d, e, f); }
    createConicGradient(a, b, c) { return this._sxc().createConicGradient(a, b, c); }
    createPattern(i, r) { const sx = this._sxc(); return i && i.__gl2dLayer ? null : sx.createPattern(i, r); }
    createImageData(a, b) { return this._sxc().createImageData(a, b); }

    // ---- leer y escribir píxeles ----
    getImageData(x, y, w, h) {
      flushAll();
      const out = new ImageData(Math.max(1, w | 0), Math.max(1, h | 0));
      if (lost) return out;
      const t = this._tgt(); if (t && t.dummy) return out;
      bindTarget(t);
      const H = this._H(), d = new Uint8Array(out.width * out.height * 4);
      gl.readPixels(x | 0, t ? (y | 0) : H - (y | 0) - out.height, out.width, out.height, gl.RGBA, gl.UNSIGNED_BYTE, d);
      // (WebGL lee de abajo arriba y premultiplicado; getImageData es de arriba abajo y sin premultiplicar.)
      const W4 = out.width * 4, o = out.data;
      for (let r = 0; r < out.height; r++) {
        const src = (t ? r : out.height - 1 - r) * W4, dst = r * W4;
        for (let i = 0; i < W4; i += 4) {
          const a = d[src + i + 3];
          if (a && a < 255) { const k = 255 / a; o[dst + i] = d[src + i] * k; o[dst + i + 1] = d[src + i + 1] * k; o[dst + i + 2] = d[src + i + 2] * k; }
          else { o[dst + i] = d[src + i]; o[dst + i + 1] = d[src + i + 1]; o[dst + i + 2] = d[src + i + 2]; }
          o[dst + i + 3] = a;
        }
      }
      return out;
    }
    putImageData(img, dx, dy) {
      const c = this._pid || (this._pid = document.createElement('canvas'));
      if (c.width !== img.width || c.height !== img.height) { c.width = img.width; c.height = img.height; }
      c.getContext('2d').putImageData(img, 0, 0);
      const s = this.s, m = s.m, al = s.alpha, sm = s.smooth, cp = s.comp, cl = s.clip;
      s.m = [1, 0, 0, 1, 0, 0]; s.alpha = 1; s.smooth = false; s.comp = 'copy'; s.clip = 0;
      this.drawImage(c, dx, dy);
      s.m = m; s.alpha = al; s.smooth = sm; s.comp = cp; s.clip = cl;
    }

    // ---- respaldo: el Canvas 2D de verdad en un lienzo aparte, y luego su trozo a la GPU ----
    _sxc() {
      if (this._sx) return this._sx;
      const c = document.createElement('canvas');
      c.__gl2dScratch = true;
      c.width = Math.max(1, this._W()); c.height = Math.max(1, this._H());
      this._sx = c.getContext('2d');           // (en la GPU: se copia a WebGL dentro de la GPU, ver _close)
      this._sxs = {};
      return this._sx;
    }
    _rectBB(x, y, w, h, stroke) {
      const pb = this._pb, k0 = pb[0], k1 = pb[1], k2 = pb[2], k3 = pb[3];
      pb[0] = pb[1] = Infinity; pb[2] = pb[3] = -Infinity;
      this._pt(x, y); this._pt(x + w, y); this._pt(x, y + h); this._pt(x + w, y + h);
      const r = this._grow(stroke);
      pb[0] = k0; pb[1] = k1; pb[2] = k2; pb[3] = k3;
      return r;
    }
    _textBB(t, x, y, stroke) {
      const s = this.s, sx = this._sxc(); syncTo(s, sx, this._sxs);
      const mt = this._rawT ? G.I18n.rawCanvas(sx, 'measureText', String(t)) : sx.measureText(String(t));
      const l = mt.actualBoundingBoxLeft, r = mt.actualBoundingBoxRight, a = mt.actualBoundingBoxAscent, d = mt.actualBoundingBoxDescent;
      const pb = this._pb, k0 = pb[0], k1 = pb[1], k2 = pb[2], k3 = pb[3];
      pb[0] = pb[1] = Infinity; pb[2] = pb[3] = -Infinity;
      if (Number.isFinite(l) && Number.isFinite(a)) { this._pt(x - l, y - a); this._pt(x + r, y + d); this._pt(x - l, y + d); this._pt(x + r, y - a); }
      else { const fs = parseFloat((s.font.match(/(\d+(\.\d+)?)px/) || [0, 16])[1]); this._pt(x - mt.width - fs, y - fs * 1.5); this._pt(x + mt.width + fs, y + fs * 1.5); }
      const out = this._grow(stroke);
      pb[0] = k0; pb[1] = k1; pb[2] = k2; pb[3] = k3;
      return out;
    }
    // La caja de lo que hay en _pb en px del destino, con el grosor de la línea, la sombra y el filtro; null si no se sabe.
    _grow(stroke) {
      const s = this.s, pb = this._pb;
      if (!(pb[0] <= pb[2])) return [0, 0, 0, 0];
      const m = s.m, k = Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
      let g = 2;
      if (stroke) g += s.lw * k * (s.join === 'miter' ? Math.max(1, s.miter) : 1) / 2 + 1;
      if (s.sBlur > 0) g += s.sBlur * 2 + Math.abs(s.sX) + Math.abs(s.sY);
      if (s.filter !== 'none') { const b = s.filter.match(/blur\(([\d.]+)px\)/); if (/drop-shadow|url/.test(s.filter)) return null; if (b) g += +b[1] * 3; }
      const o = this._bb;
      o[0] = Math.floor(pb[0] - g); o[1] = Math.floor(pb[1] - g); o[2] = Math.ceil(pb[2] + g); o[3] = Math.ceil(pb[3] + g);
      return o;
    }
    _fb(name, args, bb, img, path) {
      if (lost) return;
      const t0 = this._tgt(); if (t0 && t0.dummy) return;
      if (img && img.__gl2dLayer) { warn('layerfb', 'un lienzo de la GPU dibujado con recorte o filtro: no se ve'); return; }
      if (open && open !== this) open._close();
      const comp = BLEND[this.s.comp] ? this.s.comp : 'source-over';
      if (!BLEND[this.s.comp]) warn('comp:' + this.s.comp, 'modo de mezcla «' + this.s.comp + '» sin hacer: va como source-over');
      if (open === this && (this._fbMode !== comp || SOLO.has(comp))) this._close();
      const sx = this._sxc(), W = this._W(), H = this._H();
      if (sx.canvas.width !== W || sx.canvas.height !== H) { this._close(); this._resizeScratch(W, H); }
      syncTo(this.s, sx, this._sxs);
      // (Dentro del trozo, los dibujos se juntan con source-over; lighter se suma igual dentro y fuera.)
      if (comp !== 'lighter') { sx.globalCompositeOperation = 'source-over'; this._sxs.comp = 'source-over'; }
      if (path) this._replay(sx);
      else { const m = this.s.m; sx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }
      if (img) { try { sx.drawImage.apply(sx, args); } catch (e) { return; } bb = this._imgBB(args); }
      else if (this._rawT) G.I18n.rawCanvas(sx, name, ...args);
      else sx[name].apply(sx, args);
      if (!bb) bb = [0, 0, W, H];
      const x0 = Math.max(0, bb[0]), y0 = Math.max(0, bb[1]), x1 = Math.min(W, bb[2]), y1 = Math.min(H, bb[3]);
      if (x1 <= x0 || y1 <= y0) return;
      st.fb++;
      if (DBG) { const k = name + ' ' + ((new Error().stack || '').split('\n')[3] || '').replace(/^.*\/js\//, '').replace(/[()]/g, '').trim(); DBG.set(k, (DBG.get(k) || 0) + 1); }
      if (open !== this) { open = this; this._fbMode = comp; const o = this._gb; o[0] = x0; o[1] = y0; o[2] = x1; o[3] = y1; schedule(); }
      else { const o = this._gb; if (x0 < o[0]) o[0] = x0; if (y0 < o[1]) o[1] = y0; if (x1 > o[2]) o[2] = x1; if (y1 > o[3]) o[3] = y1; }
    }
    _imgBB(a) {
      const n = a.length, pb = this._pb, k0 = pb[0], k1 = pb[1], k2 = pb[2], k3 = pb[3];
      pb[0] = pb[1] = Infinity; pb[2] = pb[3] = -Infinity;
      const src = a[0], iw = src.naturalWidth || src.width || 0, ih = src.naturalHeight || src.height || 0;
      let dx, dy, dw, dh;
      if (n === 3) { dx = a[1]; dy = a[2]; dw = iw; dh = ih; } else if (n === 5) { dx = a[1]; dy = a[2]; dw = a[3]; dh = a[4]; } else { dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; }
      this._pt(dx, dy); this._pt(dx + dw, dy); this._pt(dx, dy + dh); this._pt(dx + dw, dy + dh);
      const out = this._grow(0);
      pb[0] = k0; pb[1] = k1; pb[2] = k2; pb[3] = k3;
      return out || [0, 0, this._W(), this._H()];
    }
    _resizeScratch(W, H) {
      // (Cambiar el tamaño vacía el lienzo y su estado.)
      const sx = this._sx;
      sx.canvas.width = Math.max(1, W); sx.canvas.height = Math.max(1, H);
      this._sxs = {}; this._sxDepth = 0; this._clips = [];
      if (this.s.clip) warn('clipresize', 'el lienzo cambió de tamaño con un recorte puesto');
    }
    /** Pone en su sitio lo pintado en el lienzo de respaldo (el trozo abierto). */
    _close() {
      if (open !== this) return;
      open = null;
      const o = this._gb, x = o[0], y = o[1], w = o[2] - o[0], h = o[3] - o[1];
      if (w <= 0 || h <= 0 || lost) return;
      const sx = this._sx, W = sx.canvas.width, H = sx.canvas.height, tg = this._tgt();
      if (tg && tg.dummy) return;
      bindTarget(tg);
      if (GT.on) { draw(); gpuMark("respaldo"); }
      draw();
      // El lienzo de respaldo entero, a una textura: es de la GPU, así que es una copia dentro de la GPU (sin leerlo en la CPU,
      // que espera a que acabe y, con sombras difuminadas, pintaba en la CPU: medido, más de la mitad del fotograma).
      const T = this._fbt && this._fbt.gen === gen ? this._fbt : (this._fbt = { tex: newTex(), w: 0, h: 0, gen });
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.tex);
      if (T.w !== W || T.h !== H) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sx.canvas); T.w = W; T.h = H; }
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sx.canvas);
      st.groups++; st.groupPx += w * h;
      // Y se borra del respaldo: sin transformación y sin recorte (se quitan los recortes, se borra y se vuelven a poner).
      const depth = this._sxDepth;
      for (let i = 0; i < depth; i++) sx.restore();
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.clearRect(x, y, w, h);
      for (let i = 0; i < depth; i++) { const c = this._clips[i]; this._replayOps(sx, c.p, c.pms); sx.save(); sx.clip.apply(sx, c.args); }
      this._sxs = {};
      setBlend(this._fbMode); addQ = 0;
      const u = unitFor(T.tex);
      quad(IDENT, x, y, w, h, x, y, x + w, y + h, x, y, x + w, y + h, u, 0, 255, 255, 255, 255);
      draw();
      setBlend(BLEND[this.s.comp] ? this.s.comp : 'source-over');
      if (GT.on) gpuMark('dibujo');
    }
  }
  const IDENT = [1, 0, 0, 1, 0, 0];
  Ctx.prototype.__gl2d = true;
  // Las propiedades, cada una con su comprobación (como el Canvas 2D: un valor no válido se ignora).
  const num = (v, ok) => { v = +v; return ok(v) ? v : undefined; };
  const CHECK = {
    alpha: v => num(v, x => x >= 0 && x <= 1), lw: v => num(v, x => x > 0 && isFinite(x)), miter: v => num(v, x => x > 0 && isFinite(x)),
    sBlur: v => num(v, x => x >= 0 && isFinite(x)), sX: v => num(v, isFinite), sY: v => num(v, isFinite), dashOff: v => num(v, isFinite),
    smooth: v => !!v,
    comp: v => { v = String(v); return BLEND[v] || /^(source|destination)-|^(xor|darken|lighten|overlay|color|hue|saturation|luminosity|difference|exclusion|hard-light|soft-light)/.test(v) ? v : undefined; },
  };
  for (const p in PROPS) {
    const k = PROPS[p], chk = CHECK[k];
    Object.defineProperty(Ctx.prototype, p, { configurable: true,
      get() { return this.s[k]; },
      set: chk ? function (v) { v = chk(v); const s = this.s; if (v !== undefined && s[k] !== v) { s[k] = v; s._sig = {}; } }
               : function (v) { const s = this.s; if (s[k] !== v) { s[k] = v; s._sig = {}; } },
    });
  }


  // ---------------- lienzos aparte en la GPU (capas) ----------------
  class Layer {
    constructor() { this.__gl2dLayer = true; this._w = 300; this._h = 150; this._t = null; this._ctx = null; }
    get width() { return this._w; }
    set width(v) { v = Math.max(0, v | 0); if (v === this._w && this._t) { this._clearAll(); return; } this._w = v; this._resize(); }
    get height() { return this._h; }
    set height(v) { v = Math.max(0, v | 0); if (v === this._h && this._t) { this._clearAll(); return; } this._h = v; this._resize(); }
    getContext(type) { if (type !== '2d') return null; if (!this._ctx) this._ctx = new Ctx(this, this); return this._ctx; }
    _resize() {
      if (this._t && gl && !lost && this._t.gen === gen) { if (target === this._t) bindTarget(null); gl.deleteFramebuffer(this._t.fbo); gl.deleteTexture(this._t.tex); }
      this._t = null;
      if (this._ctx) { if (open === this._ctx) open = null; this._ctx._reset(); }
    }
    _clearAll() {
      if (this._ctx) { if (open === this._ctx) open = null; this._ctx._reset(); }
      if (this._t && this._t.gen === gen && !lost) { const t = target; bindTarget(this._t); draw(); gl.viewport(0, 0, this._w, this._h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); bindTarget(t); }
    }
    _target() {
      if (this._t && this._t.gen === gen) return this._t;
      if (!gl || lost || !this._w || !this._h) return { fbo: null, w: 1, h: 1, dummy: true };
      if (this._w > MAXT || this._h > MAXT) { warn('bigl', 'capa más grande que la GPU'); return { fbo: null, w: 1, h: 1, dummy: true }; }
      const t = { tex: newTex(), fbo: gl.createFramebuffer(), w: this._w, h: this._h, gen, flip: false };
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.w, t.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      draw();
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
      gl.viewport(0, 0, t.w, t.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      this._t = t;
      return t;
    }
    _entry() {
      const t = this._target();
      if (t.dummy) return null;
      if (open === this._ctx) this._ctx._close();
      if (target === t) bindTarget(null);       // (se va a leer: lo suyo, mandado; y se dibuja en otro sitio)
      return t;
    }
  }

  // ---------------- los lienzos 2D: contar sus cambios (para volver a subirlos sólo entonces) ----------------
  let patched = false;
  function patch() {
    if (patched) return;
    patched = true;
    const bump = c => { if (c) c.__v = (c.__v | 0) + 1; };
    for (const P of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
      if (!P) continue;
      const p = P.prototype;
      for (const n of ['fillRect', 'clearRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText', 'putImageData', 'reset']) {
        const o = p[n]; if (typeof o !== 'function') continue;
        p[n] = function () { bump(this.canvas); return o.apply(this, arguments); };
      }
      const di = p.drawImage;
      // (Leer el lienzo de la pantalla desde un 2D, como el bloom de Máxima: antes, lo pendiente a la GPU.)
      p.drawImage = function (src) { bump(this.canvas); if (src === screen && gl) flushAll(); return di.apply(this, arguments); };
    }
    // (Una imagen que cambia de dirección es otra imagen: sube su versión.)
    if (window.HTMLImageElement) {
      const ip = HTMLImageElement.prototype, d = Object.getOwnPropertyDescriptor(ip, 'src');
      if (d && d.set) Object.defineProperty(ip, 'src', { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { bump(this); d.set.call(this, v); } });
    }
    for (const C of [window.HTMLCanvasElement, window.OffscreenCanvas]) {
      if (!C) continue;
      const p = C.prototype;
      for (const k of ['width', 'height']) {
        const d = Object.getOwnPropertyDescriptor(p, k);
        if (!d || !d.set) continue;
        Object.defineProperty(p, k, { configurable: true, enumerable: d.enumerable, get: d.get,
          set(v) { bump(this); d.set.call(this, v); if (this.__gl2dCtx) this.__gl2dCtx._reset(); else if (!(v > 0)) drop(this); } });
      }
      const gc = p.getContext;
      p.getContext = function (type) {
        if (this.__gl2dCtx && type === '2d') return this.__gl2dCtx;
        const c = gc.apply(this, arguments);
        if (c && !this.__ctxType) this.__ctxType = String(type).replace('experimental-', '');
        return c;
      };
    }
  }

  function flushAll() { if (open) open._close(); draw(); }

  // ---------------- bloom de Máxima (game.js Bloom), en la GPU ----------------
  // Lo mismo que con el Canvas 2D: la pantalla a un cuarto de tamaño con filter 'brightness(0.8) contrast(2.8) saturate(1.35)'
  // (suavizado sencillo), difuminado gaussiano de r px (blur(r px): sigma r) y sumado («lighter») con globalAlpha 0,34. Antes eran
  // dos lienzos 2D con filtros y una subida a la GPU en cada fotograma.
  const BL = { prog: null, vao: null, a: null, b: null, w: 0, h: 0, gen: -1 };
  const BVS = `#version 300 es
out vec2 vT;
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vT = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const BFS = `#version 300 es
precision highp float;
uniform sampler2D uS; uniform int uMode; uniform vec2 uStep; uniform float uSig; uniform vec2 uSrcPx;
in vec2 vT; out vec4 o;
void main() {
  if (uMode == 0) {
    // (bilineal en el centro de cada píxel de destino, como drawImage reducido sin más calidad)
    vec4 c = texture(uS, vT);
    vec3 r = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    r *= 0.8;
    r = (r - 0.5) * 2.8 + 0.5;
    r = clamp(r, 0.0, 1.0);
    float s = 1.35;
    mat3 m = mat3(0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
                  0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
                  0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s);
    r = clamp(m * r, 0.0, 1.0);
    o = vec4(r * c.a, c.a);
    return;
  }
  // Gaussiana separable (3 sigmas a cada lado).
  vec4 acc = vec4(0.0); float wsum = 0.0;
  int n = int(ceil(uSig * 3.0));
  for (int i = -24; i <= 24; i++) {
    if (i < -n || i > n) continue;
    float w = exp(-0.5 * float(i * i) / (uSig * uSig));
    acc += texture(uS, vT + uStep * float(i)) * w; wsum += w;
  }
  o = acc / wsum;
}`;
  function bloomSetup() {
    if (BL.prog && BL.gen === gen) return true;
    const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.error('[GL2D] bloom', gl.getShaderInfoLog(o)); return null; } return o; };
    const v = sh(gl.VERTEX_SHADER, BVS), f = sh(gl.FRAGMENT_SHADER, BFS);
    if (!v || !f) return false;
    const pr = gl.createProgram(); gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    BL.prog = pr; BL.vao = gl.createVertexArray(); BL.gen = gen; BL.a = BL.b = null; BL.w = BL.h = 0;
    BL.u = { s: gl.getUniformLocation(pr, 'uS'), mode: gl.getUniformLocation(pr, 'uMode'), step: gl.getUniformLocation(pr, 'uStep'), sig: gl.getUniformLocation(pr, 'uSig') };
    return true;
  }
  function bloomTarget(w, h) {
    const t = { tex: newTex(), fbo: gl.createFramebuffer(), w, h };
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    return t;
  }
  /** Bloom en la GPU sobre lo que hay en la pantalla. bw×bh: el tamaño reducido; r: el difuminado (px); k: globalAlpha. */
  function bloom(ctx, bw, bh, r, k) {
    if (!gl || lost || !bloomSetup()) return false;
    flushAll();
    const src = screenCopy();                       // (lo de la pantalla, en una textura; filas de abajo arriba)
    if (BL.w !== bw || BL.h !== bh) {
      for (const t of [BL.a, BL.b]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      BL.a = bloomTarget(bw, bh); BL.b = bloomTarget(bw, bh); BL.w = bw; BL.h = bh;
    }
    gl.useProgram(BL.prog); gl.bindVertexArray(BL.vao);
    gl.disable(gl.BLEND); gl.viewport(0, 0, bw, bh);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(BL.u.s, 0);
    // 1) reducido con el filtro de color (la copia de la pantalla, suavizada)
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, BL.a.fbo); gl.uniform1i(BL.u.mode, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // 2) difuminado: en x (a → b) y en y (b → a)
    gl.uniform1i(BL.u.mode, 1); gl.uniform1f(BL.u.sig, Math.max(0.5, r));
    gl.bindTexture(gl.TEXTURE_2D, BL.a.tex); gl.bindFramebuffer(gl.FRAMEBUFFER, BL.b.fbo); gl.uniform2f(BL.u.step, 1 / bw, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, BL.b.tex); gl.bindFramebuffer(gl.FRAMEBUFFER, BL.a.fbo); gl.uniform2f(BL.u.step, 0, 1 / bh); gl.drawArrays(gl.TRIANGLES, 0, 3);
    st.draws += 4;
    // Lo de este motor otra vez, y el resultado sumado a la pantalla (con su suavizado al ampliarlo).
    G.GL2D.restore();
    const s = ctx.s, m = s.m.slice(), al = s.alpha, cp = s.comp, sm = s.smooth;
    s.m = [1, 0, 0, 1, 0, 0]; s.alpha = k; s.comp = 'lighter'; s.smooth = true;
    ctx.drawImage({ __gl2dExt: true, _f: () => ({ tex: BL.a.tex, w: bw, h: bh }) }, 0, 0, bw, bh, 0, 0, screen.width, screen.height);
    s.m = m; s.alpha = al; s.comp = cp; s.smooth = sm;
    return true;
  }

  /** El contexto de la pantalla en WebGL2, o null (se queda el Canvas 2D). */
  function create(cv) {
    if (!wanted() || typeof WebGL2RenderingContext === 'undefined') return null;
    try {
      if (cv.__gl2dCtx) return cv.__gl2dCtx;
      if (!init(cv)) { warn('init', 'sin WebGL2: se dibuja con el Canvas 2D'); return null; }
      patch();
      const c = new Ctx(cv, null);
      cv.__gl2dCtx = c;
      return c;
    } catch (e) {
      console.error('[GL2D] no arranca, se dibuja con el Canvas 2D:', e);
      gl = null; screen = null;
      return null;
    }
  }

  // ---------------- espejo (sólo para comparar, tools/gl-compara.cjs) ----------------
  // Con el espejo puesto, cada orden de dibujo de cada contexto se repite en un Canvas 2D de verdad del mismo tamaño: en el
  // mismo fotograma se tiene lo que pinta este motor y lo que habría pintado el Canvas 2D, para compararlos píxel a píxel.
  let teeOn = false;
  const TEE_M = ['save', 'restore', 'setTransform', 'resetTransform', 'transform', 'translate', 'scale', 'rotate', 'setLineDash',
    'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'rect', 'roundRect', 'arc', 'arcTo',
    'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'clip', 'fillText', 'strokeText', 'putImageData'];
  function teeCtx(c) {
    const cv = c._layer || c.canvas, W = c._W(), H = c._H();
    let t = cv.__tee;
    if (!t) { const e = document.createElement('canvas'); e.__gl2dScratch = true; t = cv.__tee = e.getContext('2d'); }
    if (t.canvas.width !== W || t.canvas.height !== H) { t.canvas.width = W; t.canvas.height = H; }
    return t;
  }
  // (Una textura de otro, como la de three.js: para el espejo se lee a un lienzo, una vez por fotograma.)
  function extCanvas(a) {
    const r = a._f();
    if (!r || !r.tex) return null;
    if (a.__teeF === frameId && a.__teeC) return a.__teeC;
    draw();
    const fb = gl.createFramebuffer(), prev = target;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.tex, 0);
    // (La de three.js es de media precisión: se lee en coma flotante.)
    let d = new Uint8Array(r.w * r.h * 4);
    if (r.linear) { const f = new Float32Array(r.w * r.h * 4); gl.readPixels(0, 0, r.w, r.h, gl.RGBA, gl.FLOAT, f); for (let i = 0; i < f.length; i++) d[i] = Math.max(0, Math.min(255, f[i] * 255 + 0.5)); }
    else gl.readPixels(0, 0, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev ? prev.fbo : null); gl.deleteFramebuffer(fb);
    const c = a.__teeC || (a.__teeC = document.createElement('canvas'));
    c.__gl2dScratch = true; c.width = r.w; c.height = r.h;
    const img = new ImageData(r.w, r.h), o = img.data, W4 = r.w * 4;
    const cv = r.linear ? (v => { v = Math.min(1, v / 255); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }) : (v => v);
    for (let y = 0; y < r.h; y++) {
      const s = (r.h - 1 - y) * W4, t = y * W4;
      for (let i = 0; i < W4; i += 4) { const al = d[s + i + 3], k = al ? 255 / al : 0; o[t + i] = cv(d[s + i] * k); o[t + i + 1] = cv(d[s + i + 1] * k); o[t + i + 2] = cv(d[s + i + 2] * k); o[t + i + 3] = al; }
    }
    c.getContext('2d').putImageData(img, 0, 0);
    a.__teeF = frameId;
    return c;
  }
  const teeArg = a => (a && a.__gl2dLayer ? (a.__tee ? a.__tee.canvas : null) : a && a.__gl2dExt ? extCanvas(a) : a === screen && screen.__tee ? screen.__tee.canvas : a);
  function tee(on) {
    if (on === teeOn) return;
    teeOn = on;
    const P = Ctx.prototype;
    if (on) {
      for (const n of TEE_M) {
        const o = P[n]; P['__o' + n] = o;
        P[n] = function (...a) {
          if (this._teeOff) return o.apply(this, a);         // (lo que un método llama dentro ya está en el espejo)
          const t = teeCtx(this);
          // (Las capas y la propia pantalla: en el espejo, su espejo.)
          const b = a.map(teeArg);
          if (n === 'drawImage' && !b[0]) { /* sin espejo de la capa: nada */ } else try { t[n](...b); } catch (e) { /* (como el 2D) */ }
          this._teeOff = true;
          try { return o.apply(this, a); } finally { this._teeOff = false; }
        };
      }
      P.__oraw = P.raw;
      P.raw = function (method, ...a) { const t = teeCtx(this); if (method !== 'measureText') try { G.I18n.rawCanvas(t, method, ...a); } catch (e) { /* */ } return P.__oraw.call(this, method, ...a); };
      for (const p in PROPS) {
        const d = Object.getOwnPropertyDescriptor(P, p);
        P['__d' + p] = d;
        Object.defineProperty(P, p, { configurable: true, get: d.get, set(v) { try { teeCtx(this)[p] = v; } catch (e) { /* */ } d.set.call(this, v); } });
      }
      // (Al vaciar un contexto, también su espejo.)
      P.__oreset = P._reset;
      P._reset = function () { if (this.canvas && (this._layer || this.canvas).__tee) { const t = (this._layer || this.canvas).__tee; t.canvas.width = t.canvas.width; } return P.__oreset.call(this); };
    } else {
      for (const n of TEE_M) { P[n] = P['__o' + n]; delete P['__o' + n]; }
      P.raw = P.__oraw; P._reset = P.__oreset;
      for (const p in PROPS) Object.defineProperty(P, p, P['__d' + p]);
    }
  }

  return {
    wanted, create, flush: flushAll,
    /** Para comparar (tools/gl-compara.cjs): el espejo en Canvas 2D de cada contexto. tee(true) lo pone; mirror() da el de la pantalla. */
    tee, mirror() { return screen && screen.__tee ? screen.__tee.canvas : null; },
    /** El contexto WebGL2 (para three.js en el mismo contexto, ultra3d.js), o null. */
    get gl() { return gl && !lost ? gl : null; },
    get gen() { return gen; },
    get maxTex() { return MAXT; },
    /** Bloom de Máxima en la GPU (game.js Bloom): false si no se puede (se hace como siempre). */
    bloom,
    /** (?glgpu=1) Marca el principio de una parte del fotograma para medir su tiempo de GPU; gpu(): media de ms por fotograma. */
    gpuMark(l) { if (GT.on) { draw(); gpuMark(l); } },
    gpu(reset) { const o = {}; for (const k in GT.acc) o[k] = +(GT.acc[k] / Math.max(1, GT.n)).toFixed(3); if (reset) { GT.acc = {}; GT.n = 0; } return o; },
    /** Algo que se dibuja con drawImage y es una textura de otro (three.js): f() → { tex, w, h } (filas de abajo arriba). */
    external(f) { return { __gl2dExt: true, _f: f, get width() { const r = f(); return r ? r.w : 0; }, get height() { const r = f(); return r ? r.h : 0; } }; },
    /** Tras usar el contexto otro (three.js): vuelve a poner el estado que usa este motor. */
    restore() {
      if (!gl || lost) return;
      gl.useProgram(prog); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); target = null;
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.colorMask(true, true, true, true); gl.depthMask(true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      for (let i = 0; i < U; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindSampler(i, null); }
      blendNow = ''; nunits = 0; units.fill(null);
    },
    /** Un lienzo aparte en la GPU con su contexto 2D (o uno normal si no está en marcha). */
    canvas() { return gl && !lost ? new Layer() : document.createElement('canvas'); },
    get on() { return !!gl; },
    get lost() { return lost; },
    stats() { return Object.assign({ gen, maxTex: MAXT, atlas: TA.map.size }, last); },
    census() { return DBG ? [...DBG.entries()].sort((a, b) => b[1] - a[1]) : null; },
  };
})();
