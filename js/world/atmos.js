/* ============ atmos.js — la atmósfera del mundo: niebla, luz por zonas y tono de cada mapa ============
 * (Ambientación, 06-11-2026) El dueño: «un poco de niebla o algo así para que no parezca tan plano el mundo, para que le dé
 * profundidad y misticismo». Puro adorno: no choca, no hace daño, no va por la red y cada jugador ve la suya.
 *
 * La regla de oro: LA NIEBLA NO PUEDE TAPAR EL PELIGRO. Por eso va pegada al suelo: se dibuja encima del terreno y debajo de
 * avisos, campos, recompensas, trampas, Pokémon y disparos (game.js, drawScene). Todo lo que importa queda por encima, nítido,
 * y además resalta más porque el suelo pierde contraste. Nada de este archivo se pinta sobre un enemigo.
 *
 *   bake(g, ...)      al hornear un chunk (tileset.js): el tono del mapa, manchas grandes de luz y sombra y el interior de los
 *                     muros en penumbra. Sólo cuesta al hornear: dibujar el chunk sigue siendo un drawImage.
 *   ground(ctx, view) cada fotograma: bancos de niebla y de sombra que se mueven despacio y el anochecer de la partida.
 *   edge(bi)          el color de la viñeta del mapa (world.js).
 *
 * Coste y memoria (iPhone, ver docs/2.0-ESTADO.md «Pantalla negra»): un mapa de ruido en un Uint8Array y DOS lienzos de 192×192
 * (mismo tamaño siempre, 150 KB cada uno) que se repiten por el mundo. Si Safari los vacía salen transparentes: sin niebla, nunca
 * negro. Como mucho 12 drawImage por fotograma, sin degradados ni cuentas por casilla. Por calidad:
 *   Bajo    sólo lo horneado (nada por fotograma)
 *   Medio   un banco de niebla
 *   Alto    dos bancos de niebla, el de sombra y el anochecer
 * Con «Animaciones» apagado la niebla se queda quieta.
 */
G.Atmos = (() => {
  const S = 192, PX = 2;                                 // lado del mapa de ruido y píxel de arte (en unidades de mundo)
  const T = 24;                                          // casilla del chunk, en píxeles de arte

  /*
   * El tono de cada mapa.
   *   mul   se multiplica sobre todo el chunk: quita el brillo plano y casa suelo, muro y adornos (null: tal cual)
   *   mist  [color, opacidad] de los bancos de niebla
   *   dark  [color, opacidad] de los bancos de sombra (nubes al aire libre, penumbra bajo techo)
   *   edge  [r,g,b, opacidad] de la viñeta
   *   lit   luz de las manchas horneadas; pool: fuerza de esas manchas
   *   wall  tono del interior de los muros; night: a qué tono va cayendo el suelo según avanza la partida
   */
  const MOODS = {
    forest:   { mul: '#b4c2a4', mist: ['#b4e0d0', 0.26], dark: ['#06201a', 0.3],  edge: [8, 26, 22, 0.34],    lit: '#e6e49a', pool: 1,   night: '#06162a' },
    crystal:  { mul: '#b4b0d4', mist: ['#a9c8ff', 0.26], dark: ['#120a34', 0.3],  edge: [16, 8, 44, 0.36],    lit: '#a8c8ff', pool: 1,   night: '#0a0626' },
    volcano:  { mul: '#b48a74', mist: ['#c98a5c', 0.17], dark: ['#1c0a08', 0.32], edge: [34, 10, 6, 0.36],    lit: '#ffb060', pool: 1,   night: '#1a0608' },
    normal:   { mul: '#c8d2a2', mist: ['#f2ffe2', 0.22], dark: ['#123a34', 0.16], edge: [14, 44, 40, 0.26],   lit: '#fff6b8', pool: 0.8, night: '#0a1c34' },
    fire:     { mul: '#c89a88', mist: ['#ff9a50', 0.13], dark: ['#1e0606', 0.3],  edge: [36, 8, 4, 0.36],     lit: '#ffa040', pool: 1,   night: '#1a0406' },
    water:    { mul: '#c0ceda', mist: ['#dff4ff', 0.28], dark: ['#123450', 0.2],  edge: [10, 34, 56, 0.3],    lit: '#d8f4ff', pool: 0.8, night: '#061a30' },
    grass:    { mul: '#dbe6c8', mist: ['#b6efc0', 0.18], dark: ['#011a0e', 0.3],  edge: [2, 22, 14, 0.36],    lit: '#d8f08a', pool: 1,   night: '#021420' },
    electric: { mul: '#cfc6a2', mist: ['#ffefa0', 0.13], dark: ['#281a08', 0.22], edge: [38, 28, 8, 0.3],     lit: '#fff0a0', pool: 0.9, night: '#10102a' },
    ice:      { mul: '#c6d2e6', mist: ['#ecf8ff', 0.3],  dark: ['#18345a', 0.18], edge: [20, 44, 80, 0.28],   lit: '#f4fcff', pool: 0.7, night: '#0e2244' },
    fighting: { mul: '#cdc4a4', mist: ['#ffefd0', 0.15], dark: ['#281a0e', 0.22], edge: [38, 26, 12, 0.3],    lit: '#ffe8b0', pool: 0.9, night: '#141030' },
    poison:   { mul: '#b4ae98', mist: ['#c49ee0', 0.22], dark: ['#180a20', 0.28], edge: [26, 8, 38, 0.36],    lit: '#d8d088', pool: 1,   night: '#100a2a' },
    ground:   { mul: '#d8c6a2', mist: ['#f6dcac', 0.15], dark: ['#442610', 0.18], edge: [60, 30, 10, 0.26],   lit: '#fff0c0', pool: 0.7, night: '#201434' },
    flying:   { mul: '#d6e2f0', mist: ['#ffffff', 0.32], dark: ['#3e6088', 0.14], edge: [40, 74, 120, 0.22],  lit: '#ffffff', pool: 0.5, night: '#20345c' },
    psychic:  { mul: '#c6aec8', mist: ['#ffc4ee', 0.2],  dark: ['#1a0a2e', 0.26], edge: [30, 10, 52, 0.34],   lit: '#ffd0e8', pool: 1,   night: '#140a30' },
    bug:      { mul: '#bfc8a0', mist: ['#ddf0a0', 0.17], dark: ['#08200c', 0.26], edge: [10, 32, 14, 0.32],   lit: '#eaf09a', pool: 1,   night: '#061a24' },
    rock:     { mul: '#d6cece', mist: ['#c4aca2', 0.15], dark: ['#100810', 0.28], edge: [18, 10, 18, 0.34],   lit: '#e8b090', pool: 1,   night: '#0c0a1c' },
    ghost:    { mul: null,      mist: ['#84ecd4', 0.17], dark: ['#000a10', 0.3],  edge: [0, 12, 18, 0.4],     lit: '#7ad8c8', pool: 1.1, night: '#000814' },
    dragon:   { mul: null,      mist: ['#b294ff', 0.17], dark: ['#0a0420', 0.3],  edge: [12, 4, 34, 0.4],     lit: '#c8a0ff', pool: 1.1, night: '#080418' },
    dark:     { mul: '#d0ccd0', mist: ['#a06a80', 0.15], dark: ['#0a0408', 0.32], edge: [12, 4, 10, 0.42],    lit: '#c8987a', pool: 1.1, night: '#080410' },
    steel:    { mul: null,      mist: ['#a4c6d6', 0.15], dark: ['#04080c', 0.28], edge: [6, 12, 18, 0.38],    lit: '#b8d8e8', pool: 1,   night: '#040814' },
    fairy:    { mul: '#dcc6c2', mist: ['#ffd6f0', 0.24], dark: ['#3a1040', 0.15], edge: [54, 18, 62, 0.26],   lit: '#fff0c8', pool: 0.8, night: '#1a1038' },
    judgment: { mul: '#c4b4a0', mist: ['#ffd88e', 0.13], dark: ['#100804', 0.3],  edge: [24, 12, 4, 0.38],    lit: '#ffc870', pool: 1,   night: '#100408' }
  };
  const MAIN = ['forest', 'crystal', 'volcano'];
  function mood(bi) {
    const A = G.Tiles.ARENA;
    return MOODS[bi < A ? MAIN[bi] : G.Tiles.ARENA_TYPES[bi - A]] || MOODS.forest;
  }

  // ---------------- el mapa de ruido: uno solo, se repite sin costuras ----------------
  let map = null, lv = null;                             // Uint8Array S×S; lv: umbrales de ese mapa (reparto real, no a ojo)
  function build() {
    if (map) return;
    let seed = 90210;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const f = new Float32Array(S * S);
    const smooth = u => u * u * (3 - 2 * u);
    for (const [cells, amp] of [[3, 1], [6, 0.55], [12, 0.3], [24, 0.18], [48, 0.13], [96, 0.09]]) {
      const L = new Float32Array(cells * cells);
      for (let i = 0; i < L.length; i++) L[i] = rnd();
      const k = cells / S;
      for (let y = 0; y < S; y++) {
        const py = y * k, j0 = py | 0, v = smooth(py - j0), j1 = (j0 + 1) % cells;
        for (let x = 0; x < S; x++) {
          const px = x * k, i0 = px | 0, u = smooth(px - i0), i1 = (i0 + 1) % cells;
          const a = L[j0 * cells + i0], b = L[j0 * cells + i1], c = L[j1 * cells + i0], d = L[j1 * cells + i1];
          f[y * S + x] += amp * ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v);
        }
      }
    }
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < f.length; i++) { if (f[i] < lo) lo = f[i]; if (f[i] > hi) hi = f[i]; }
    map = new Uint8Array(S * S);
    for (let i = 0; i < f.length; i++) map[i] = (f[i] - lo) / (hi - lo) * 255;
    const sorted = Uint8Array.from(map).sort(), pct = q => sorted[Math.floor(q * (sorted.length - 1))];
    lv = { d2: pct(0.1), d1: pct(0.26), l1: pct(0.76), l2: pct(0.9), m0: pct(0.54), m1: pct(0.67), m2: pct(0.8), m3: pct(0.92) };
  }

  // ---------------- lo que se hornea en el chunk ----------------
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  /**
   * Tono del mapa, manchas de luz y sombra y penumbra dentro de los muros. Al hornear, una vez por chunk: las manchas se sacan del mapa de
   * ruido con la posición en el mundo (sin costuras entre chunks) y en bloques de 4 píxeles de arte, por tramos seguidos para pintar poco.
   */
  function bake(g, cx, cy, N, at, bi, seed, flat3d) {
    build();
    const m = mood(bi), P = G.Tileset.pal(bi), W = N * T;
    if (m.mul) {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = m.mul;
      g.fillRect(0, 0, W, W);
      g.globalCompositeOperation = 'source-over';
    }
    const ink = P ? P.edge : '#000000', k = m.pool;
    const STY = [rgba(ink, 0.16 * k), rgba(ink, 0.08 * k), null, rgba(m.lit, 0.05 * k), rgba(m.lit, 0.09 * k)];
    const C = G.Settings.fx ? 4 : 8, n = W / C, ox = (seed & 127) * 3,     // (en Bajo, bloques más grandes: hornea antes)
      scale = C / 4, oy = (seed >> 7 & 127) * 3;
    for (let y = 0; y < n; y++) {
      let run = 0, cur = 2;
      for (let x = 0; x <= n; x++) {
        let l = 2;
        if (x < n) {
          const wx = (cx * n + x) * scale + ox, wy = (cy * n + y) * scale + oy, v = map[((wy % S) + S) % S * S + ((wx % S) + S) % S] + (((x * 7 + y * 13) ^ (x * y)) & 15) - 7;
          l = v < lv.d2 ? 0 : v < lv.d1 ? 1 : v > lv.l2 ? 4 : v > lv.l1 ? 3 : 2;
        }
        if (l === cur) continue;
        if (STY[cur]) { g.fillStyle = STY[cur]; g.fillRect(run * C, y * C, (x - run) * C, C); }
        cur = l; run = x;
      }
    }
    if (!flat3d) wallShade(g, cx, cy, N, at, bi, seed);
  }

  /**
   * El interior de los muros: el tileset lo pinta de un color liso y vivo que tira de la vista (los amarillos de Central Voltio o el Dojo, el
   * verde del Bosque). En penumbra hacia dentro, a escalones de borde irregular, se lee como masa alta y el ojo se queda en el suelo.
   */
  const DS = new Float32Array(19 * 19);
  function wallShade(g, cx, cy, N, at, bi, seed) {
    const x0 = cx * N, y0 = cy * N, W2 = N + 2;
    const inner = (tx, ty, r) => {
      for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if ((Math.abs(a) === r || Math.abs(b) === r) && at(tx + a, ty + b) !== 1) return false;
      return true;
    };
    let any = false;
    for (let j = -1; j <= N; j++) for (let i = -1; i <= N; i++) {
      const tx = x0 + i, ty = y0 + j;
      let d = 0;
      if (at(tx, ty) === 1 && inner(tx, ty, 1)) { d = 1; if (inner(tx, ty, 2)) d = inner(tx, ty, 3) ? 3 : 2; }
      DS[(j + 1) * W2 + i + 1] = d;
      if (d) any = true;
    }
    if (!any) return;
    // La profundidad, suavizada entre casillas y torcida con el mapa de ruido: curvas de borde irregular, no los bordes de las casillas.
    const ink = mood(bi).dark[0], STY = [null, rgba(ink, 0.2), rgba(ink, 0.34), rgba(ink, 0.48)], C = G.Settings.fx ? 2 : 4, n = N * T / C, TC = T / C, zoom = C / 2;
    for (let y = 0; y < n; y++) {
      const fy = (y + 0.5) / TC - 0.5, j = Math.floor(fy), v = fy - j, wy = (cy * n + y) * zoom;
      let run = 0, cur = 0;
      for (let x = 0; x <= n; x++) {
        let l = 0;
        if (x < n) {
          const fx = (x + 0.5) / TC - 0.5, i = Math.floor(fx), u = fx - i, o = (j + 1) * W2 + i + 1;
          const d = (DS[o] * (1 - u) + DS[o + 1] * u) * (1 - v) + (DS[o + W2] * (1 - u) + DS[o + W2 + 1] * u) * v;
          if (d > 0.2) {
            const wx = (cx * n + x) * zoom, e = map[((wy % S) + S) % S * S + ((wx % S) + S) % S] / 255 - 0.5, q = d + e * 1.1 + (((x * 7 + y * 13) ^ (x * y)) & 7) * 0.09 - 0.3;
            l = q > 2.3 ? 3 : q > 1.5 ? 2 : q > 0.75 ? 1 : 0;
          }
        }
        if (l === cur) continue;
        if (STY[cur]) { g.fillStyle = STY[cur]; g.fillRect(run * C, y * C, (x - run) * C, C); }
        cur = l; run = x;
      }
    }
  }

  /** (Ultra 3D) Lo mismo en la cara de arriba de los muros, que va en su propio lienzo: sólo sobre lo pintado. */
  function tops(g, cx, cy, N, at, bi, seed) {
    build();
    g.globalCompositeOperation = 'source-atop';
    wallShade(g, cx, cy, N, at, bi, seed);
    g.globalCompositeOperation = 'source-over';
  }

  // ---------------- la niebla ----------------
  let mistC = null, darkC = null, forBi = -1, want = -1, k = 0;
  /** El banco, en el color del mapa: a escalones de opacidad, como las sombras del juego. */
  function paint(hex, a0) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    let d;
    try { d = g.createImageData(S, S); } catch (e) { G.U.freeCanvas(cv); return null; }
    const n = parseInt(hex.slice(1), 16), r = n >> 16, gr = n >> 8 & 255, b = n & 255, o = d.data, q = a0;
    for (let i = 0; i < map.length; i++) {
      const v = map[i], s = v < lv.m0 ? 0 : v < lv.m1 ? 0.34 : v < lv.m2 ? 0.67 : v < lv.m3 ? 0.86 : 1;
      if (!s) continue;
      const p = i * 4;
      o[p] = r; o[p + 1] = gr; o[p + 2] = b; o[p + 3] = 255 * s * q;
    }
    g.putImageData(d, 0, 0);
    return cv;
  }
  function tint(bi) {
    build();
    free();
    const m = mood(bi);
    mistC = paint(m.mist[0], 1);
    darkC = paint(m.dark[0], 1);
    forBi = bi;
  }
  function free() {
    if (mistC) G.U.freeCanvas(mistC);
    if (darkC) G.U.freeCanvas(darkC);
    mistC = darkC = null; forBi = -1;
  }

  /** Repite el banco por la vista. sx, sy: píxeles de arte por celda (enteros, en la rejilla; más ancho que alto: jirones, no manchas). */
  function tile(ctx, im, L, Tp, W, H, ox, oy, sx, sy) {
    const Dx = S * sx * PX, Dy = S * sy * PX, a = Math.round((((ox % Dx) + Dx) % Dx) / PX) * PX, b = Math.round((((oy % Dy) + Dy) % Dy) / PX) * PX;
    for (let y = Math.floor((Tp - b) / Dy) * Dy + b; y < Tp + H; y += Dy)
      for (let x = Math.floor((L - a) / Dx) * Dx + a; x < L + W; x += Dx) ctx.drawImage(im, x, y, Dx, Dy);
  }

  /** 0..1: cuánto ha caído la tarde. Los 4 primeros minutos, de día; a los 20, de noche. Fuera de una partida, de día. */
  function dusk() {
    if (!G.Game || G.Game.state === 'ui' || !G.Game.st) return 0;
    const u = Math.max(0, Math.min(1, (G.Game.st.time / 60 - 4) / 16));
    return u * u * (3 - 2 * u);
  }

  // (El dueño eligió la niebla densa, 07-11-2026: se ve claro como bancos.) La de MOODS, por estos factores.
  // MIST_MAX: el tope, también con el clima Niebla: muros, agua y lava están debajo y tienen que seguir leyéndose.
  const MIST_K = 1.36, DARK_K = 1.19, MIST_MAX = 0.5;
  /** Encima del terreno y debajo de todo lo demás (game.js). */
  function ground(ctx, view) {
    const fx = G.Settings.fx;
    if (!fx) return;
    const bi = G.World.biome;
    const dt = G.Anim.dt;
    // Al cambiar de mapa la niebla se va y vuelve en su color nuevo.
    if (want !== bi) { want = bi; }
    if (forBi !== want) {
      k -= dt * 1.2;
      if (k <= 0 || !mistC) { k = 0; tint(want); }
    } else k = Math.min(1, k + dt * 0.6);
    if (!mistC || k <= 0) return;
    const m = mood(forBi), now = G.Anim.on ? G.Anim.now : 0;
    const L = view.left(), Tp = view.top(), W = view.w, H = view.h;
    const nn = dusk(), wx = G.Weather ? G.Weather.vignette : 0;     // (el clima «Niebla» la espesa)
    const a = Math.min(MIST_MAX, m.mist[1] * MIST_K * (1 + nn * 0.45 + wx * 1.1)) * k;
    if (fx > 1) {
      if (darkC) { ctx.globalAlpha = Math.min(0.6, m.dark[1] * DARK_K) * k; tile(ctx, darkC, L, Tp, W, H, -now * 9, now * 3.5, 4, 3); }
    }
    ctx.globalAlpha = a;
    tile(ctx, mistC, L, Tp, W, H, now * 7, now * 2.2, 3, 2);
    if (fx > 1) { ctx.globalAlpha = a * 0.62; tile(ctx, mistC, L, Tp, W, H, 300 - now * 4.5, 170 + now * 3, 4, 2); }
    // (El anochecer, lo último: también baja la niebla, que si no brillaría sobre el suelo oscuro.)
    if (fx > 1 && nn > 0) { ctx.globalAlpha = nn * 0.34 * k; ctx.fillStyle = m.night; ctx.fillRect(L, Tp, W, H); }
    ctx.globalAlpha = 1;
  }

  /** La viñeta del mapa: [color 'r,g,b', opacidad]. */
  const edgeOf = new Map();
  function edge(bi) {
    let e = edgeOf.get(bi);
    if (!e) { const c = mood(bi).edge; e = [c[0] + ',' + c[1] + ',' + c[2], c[3]]; edgeOf.set(bi, e); }
    return e;
  }

  return { MOODS, mood, bake, tops, ground, edge, purge: free,
    reset() { k = 0; want = -1; free(); } };
})();
