/* ============ tiles.js — pixel art del mundo, pintado en código ============
 * Todo se pinta a resolución de ARTE (16 px por tile) escribiendo en un
 * ImageData, y luego se dibuja escalado ×G.Sprites.PX sin suavizado. Así los
 * tiles comparten tamaño de píxel con los sprites de Mundo Misterioso.
 *
 * Autotiling: cada tile mira a sus 8 vecinos al pintarse (bordes de pared,
 * cara frontal, esquinas redondeadas, espuma de la orilla...).
 */
G.Tiles = (() => {
  const T = 16;                       // píxeles de arte por tile

  const BIOMES = [
    { name: 'Bosque Umbrío', liquid: 'water',
      floor: ['#3e7a39', '#44813d', '#397134'], dirt: ['#7d6742', '#735e3b', '#86704a'],
      speck: '#2f5f2b', light: '#5f9d50', flowers: ['#f4d65c', '#f39ac0', '#eef2ff'],
      wallTop: ['#5d6e49', '#677a50', '#566544'], wallLight: '#88a06e', wallEdge: '#26301f',
      wallFace: ['#3e4934', '#363f2d'], wallFaceDark: '#232a1d',
      liq: '#3b7fc6', liqDeep: '#2c64a6', foam: '#b3defa', shore: '#2b5b2a',
      prop: 'tree', leaf: ['#235a2b', '#2f7535', '#45943f', '#64b252'], trunk: ['#5b3b22', '#7a5130'],
      rock: ['#5e6670', '#7f8893', '#a1aab4'], grass: ['#2f6b2c', '#4c9a3f', '#7cc45a'] },
    { name: 'Cueva Cristal', liquid: 'water',
      floor: ['#4d5778', '#535e81', '#47506f'], dirt: ['#3c4462', '#424a69', '#37405b'],
      speck: '#3b4363', light: '#6a78a4', flowers: ['#8fe3ff', '#c9a6ff', '#7ef0d0'],
      wallTop: ['#5f5089', '#695996', '#56497d'], wallLight: '#a08ddc', wallEdge: '#1f1934',
      wallFace: ['#3f3463', '#382e59'], wallFaceDark: '#221c3a',
      liq: '#2a9cab', liqDeep: '#1d7c8a', foam: '#aaf4f7', shore: '#33405e',
      prop: 'crystal', leaf: ['#5ad1e8', '#8fe7f5', '#c8f7ff', '#ffffff'], trunk: ['#3a4a78', '#4e64a0'],
      rock: ['#555d79', '#737c9c', '#959fc0'], grass: ['#3d5c8a', '#5a86c0', '#8ab8ee'] },
    { name: 'Volcán Ceniza', liquid: 'lava',
      floor: ['#5b4537', '#644c3c', '#533f32'], dirt: ['#403530', '#473b34', '#392f2b'],
      speck: '#47362b', light: '#806452', flowers: ['#ff8d3d', '#ffc45e', '#e06a4a'],
      wallTop: ['#3c3634', '#443d3a', '#35302e'], wallLight: '#625752', wallEdge: '#141110',
      wallFace: ['#2b2624', '#25201f'], wallFaceDark: '#151211',
      liq: '#e45a1f', liqDeep: '#b9401a', foam: '#ffd46a', shore: '#3a2a22',
      prop: 'dead', leaf: ['#4a3a30', '#5e4a3c', '#6f5a49', '#806a58'], trunk: ['#3a2e27', '#52423a'],
      rock: ['#4e4642', '#6a605b', '#877c76'], grass: ['#6b4a2a', '#94693a', '#c4914e'] },
  ];
  const NORMAL = 3;                   // biomas que se van turnando en una run
  const ARENA = 3;                    // a partir de aquí, las arenas de la grieta (una por tipo)

  // ---------------- arenas de la grieta ----------------
  /*
   * Cada tipo tiene su arena: paleta, terreno y clima.
   *   liquid   charcos: water (frena) · swamp (frena más) · lava (quema) ·
   *            poison (envenena) · spark (descarga) · ice (resbala)
   *   pools    cuánto terreno es charco (0 = ninguno)
   *   pillars  probabilidad de una columna 2×2 (cobertura) por bloque
   *   props    densidad de árboles / rocas / hierba
   *   weather  clima que trae (ver systems/weather.js) o null
   */
  const ARENA_THEMES = {
    normal:   { name: 'Pradera Eterna', floor: '#6f8a4f', wall: '#8a7f6a', liquid: 'water', liq: '#4f8fd0', prop: 'tree',
                leaf: '#5aa04a', trunk: '#6b4a2a', flowers: ['#f4d65c', '#ffffff', '#f39ac0'], grass: '#5a9a40', rock: '#8a8a8a',
                pools: 0, pillars: 0.035, props: { tree: 0.025, grass: 0.05 }, weather: null },
    fire:     { name: 'Volcán Ígneo', floor: '#5b3a2e', wall: '#3a2826', liquid: 'lava', liq: '#e45a1f', foam: '#ffd46a', prop: 'dead',
                leaf: '#5e4a3c', trunk: '#3a2e27', flowers: ['#ff8d3d', '#ffc45e', '#e06a4a'], grass: '#94693a', rock: '#6a605b',
                pools: 0.31, pillars: 0.03, props: { tree: 0.01 }, weather: 'sun' },
    water:    { name: 'Gruta Marina', floor: '#3c6a80', wall: '#2a4660', liquid: 'water', liq: '#2f86d6', foam: '#bfeaff', prop: 'crystal',
                leaf: '#5fd0e8', trunk: '#2a4a78', flowers: ['#ff9ec4', '#7ef0d0', '#ffffff'], grass: '#3f8a9a', rock: '#5d7a90',
                pools: 0.33, pillars: 0.02, props: { tree: 0.015 }, weather: 'rain' },
    grass:    { name: 'Selva Esmeralda', floor: '#3a7a32', wall: '#4a6a36', liquid: 'swamp', liq: '#4f6b2a', foam: '#9ac25a', prop: 'tree',
                leaf: '#3f9a3a', trunk: '#5b3b22', flowers: ['#f4d65c', '#ff8ad8', '#ffffff'], grass: '#4caa3f', rock: '#6a7a5a',
                pools: 0.22, pillars: 0, props: { tree: 0.05, grass: 0.12 }, weather: null },
    electric: { name: 'Central Voltio', floor: '#4a4840', wall: '#3a3a48', liquid: 'spark', liq: '#e8c020', foam: '#fff6c0', prop: 'crystal',
                leaf: '#ffd23f', trunk: '#5a5030', flowers: ['#ffe14d', '#ffffff', '#7fd0ff'], grass: '#8a8a40', rock: '#70707a',
                pools: 0.28, pillars: 0.04, props: { tree: 0.01 }, weather: 'rain' },
    ice:      { name: 'Glaciar Eterno', floor: '#b8cfe0', wall: '#7f9fc0', liquid: 'ice', liq: '#9fd8f0', foam: '#ffffff', prop: 'crystal',
                leaf: '#bfe8ff', trunk: '#6f8fb0', flowers: ['#ffffff', '#9fe0ff', '#d8f1ff'], grass: '#9fc0d8', rock: '#8fa8c0',
                pools: 0.36, pillars: 0.02, props: { tree: 0.02 }, weather: 'snow' },
    fighting: { name: 'Dojo Ancestral', floor: '#8a6a46', wall: '#5e4232', liquid: 'water', liq: '#4f8fd0', prop: 'tree',
                leaf: '#4f8a3a', trunk: '#5b3b22', flowers: ['#ff5f6d', '#f4d65c', '#ffffff'], grass: '#6a8a40', rock: '#8a7a6a',
                pools: 0, pillars: 0.075, props: { tree: 0.008 }, weather: null },
    poison:   { name: 'Ciénaga Tóxica', floor: '#46384f', wall: '#33263f', liquid: 'poison', liq: '#9a4fc0', foam: '#e0a6ff', prop: 'dead',
                leaf: '#5a4a6a', trunk: '#3a2f45', flowers: ['#c86bdc', '#8bd94a', '#e0a6ff'], grass: '#6a5a8a', rock: '#5a4f6a',
                pools: 0.31, pillars: 0.015, props: { tree: 0.02 }, weather: null },
    ground:   { name: 'Desierto Rojo', floor: '#b08a52', wall: '#8a5e34', liquid: 'swamp', liq: '#9a7a48', foam: '#d6b98a', prop: 'dead',
                leaf: '#8a6a40', trunk: '#6a4a2a', flowers: ['#e06a4a', '#f4d65c', '#ffffff'], grass: '#b0904a', rock: '#9a7a5a',
                pools: 0.25, pillars: 0.04, props: { tree: 0.01, rock: 0.015 }, weather: 'sand' },
    flying:   { name: 'Pico Celeste', floor: '#9fb8d8', wall: '#dfe8f4', liquid: 'water', liq: '#7fb8ff', prop: 'tree',
                leaf: '#e8f2ff', trunk: '#9aa8c0', flowers: ['#ffffff', '#ffe14d', '#bfe0ff'], grass: '#b8d0e8', rock: '#c0ccdc',
                pools: 0, pillars: 0.02, props: { tree: 0.025 }, weather: null },
    psychic:  { name: 'Templo Mental', floor: '#5e4470', wall: '#3e2a55', liquid: 'water', liq: '#8a5ad0', prop: 'crystal',
                leaf: '#ff8ad8', trunk: '#5a3a7a', flowers: ['#ff8ad8', '#c9a6ff', '#ffffff'], grass: '#8a5a9a', rock: '#7a6a8a',
                pools: 0, pillars: 0.045, props: { tree: 0.02 }, weather: null },
    bug:      { name: 'Bosque Colmena', floor: '#5a6a2a', wall: '#5e4a26', liquid: 'swamp', liq: '#6a7a2a', foam: '#c4d65a', prop: 'tree',
                leaf: '#8aaa30', trunk: '#5b3b22', flowers: ['#f4d65c', '#ffffff', '#c4d65a'], grass: '#8aaa30', rock: '#7a7a5a',
                pools: 0.2, pillars: 0, props: { tree: 0.04, grass: 0.12 }, weather: null },
    rock:     { name: 'Cantera Antigua', floor: '#7a6a58', wall: '#55473a', liquid: 'water', liq: '#4f8fd0', prop: 'dead',
                leaf: '#6a5a4a', trunk: '#4a3e32', flowers: ['#c9b28a', '#ffffff', '#a89070'], grass: '#8a7a5a', rock: '#8a7a6a',
                pools: 0, pillars: 0.08, props: { rock: 0.03 }, weather: 'sand' },
    ghost:    { name: 'Cementerio Sombrío', floor: '#383447', wall: '#24202e', liquid: 'water', liq: '#3a3a6a', prop: 'dead',
                leaf: '#4a4060', trunk: '#2e2838', flowers: ['#9a8ad0', '#5fe0c0', '#c9cfdc'], grass: '#4a4a60', rock: '#5a5670',
                pools: 0, pillars: 0.03, props: { tree: 0.03 }, weather: 'fog' },
    dragon:   { name: 'Santuario Dragón', floor: '#363a5e', wall: '#24264a', liquid: 'lava', liq: '#7b5cff', foam: '#c9a6ff', prop: 'crystal',
                leaf: '#7b5cff', trunk: '#2a2a5a', flowers: ['#7b5cff', '#ffd23f', '#ffffff'], grass: '#4a4a8a', rock: '#5a5a8a',
                pools: 0.22, pillars: 0.04, props: { tree: 0.015 }, weather: null },
    dark:     { name: 'Callejón Oscuro', floor: '#2c282e', wall: '#1c181f', liquid: 'water', liq: '#2a2a3a', prop: 'dead',
                leaf: '#3a3040', trunk: '#241e28', flowers: ['#ff5f6d', '#6b5c52', '#9a8a9a'], grass: '#3a343a', rock: '#4a444a',
                pools: 0, pillars: 0.05, props: { tree: 0.02 }, weather: null },
    steel:    { name: 'Fortaleza de Acero', floor: '#6d7888', wall: '#465060', liquid: 'water', liq: '#4f8fd0', prop: 'crystal',
                leaf: '#c9d2de', trunk: '#5d6773', flowers: ['#c9d2de', '#ffd23f', '#ffffff'], grass: '#8a96a6', rock: '#9aa6b5',
                pools: 0, pillars: 0.08, props: { tree: 0.01 }, weather: null },
    fairy:    { name: 'Bosque Encantado', floor: '#4f7f5a', wall: '#7a5a8a', liquid: 'water', liq: '#8fd8ff', foam: '#ffe0f4', prop: 'tree',
                leaf: '#e08ad0', trunk: '#6b4a5a', flowers: ['#ff8ad8', '#ffffff', '#c9a6ff'], grass: '#c48ad8', rock: '#9a8aa8',
                pools: 0.16, pillars: 0, props: { tree: 0.05, grass: 0.1 }, weather: null },
    // La arena de Arceus al minuto 30 (systems/judgment.js): ceniza, ruinas y
    // árboles muertos, con un claro donde aterriza (clear). No es de ninguna grieta.
    judgment: { name: 'Ruinas del Juicio', floor: '#4a4240', wall: '#2e2829', liquid: 'lava', liq: '#e8a82a', foam: '#fff1b8', prop: 'dead',
                leaf: '#3e3633', trunk: '#2a2321', flowers: ['#8a7f76', '#e8a82a', '#5a514c'], grass: '#5e544c', rock: '#6a625c',
                pools: 0, pillars: 0.03, props: { tree: 0.012, rock: 0.02 }, weather: null, clear: 4.5 }
  };
  const ARENA_TYPES = Object.keys(ARENA_THEMES);

  /** Aclara (k>0) u oscurece (k<0) un color. */
  function shade(hex, k) {
    const c = rgb(hex).map(v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /** Paleta completa de bioma a partir de los pocos colores de una arena. */
  function arenaBiome(th) {
    const f = th.floor, w = th.wall, L = th.liq;
    return {
      name: 'Grieta · ' + th.name, liquid: th.liquid,
      floor: [f, shade(f, 0.05), shade(f, -0.06)], dirt: [shade(f, -0.16), shade(f, -0.12), shade(f, -0.2)],
      speck: shade(f, -0.25), light: shade(f, 0.22), flowers: th.flowers,
      wallTop: [w, shade(w, 0.07), shade(w, -0.07)], wallLight: shade(w, 0.32), wallEdge: shade(w, -0.7),
      wallFace: [shade(w, -0.3), shade(w, -0.38)], wallFaceDark: shade(w, -0.55),
      liq: L, liqDeep: shade(L, -0.22), foam: th.foam || shade(L, 0.55), shore: shade(f, -0.32),
      prop: th.prop, leaf: [shade(th.leaf, -0.35), shade(th.leaf, -0.15), th.leaf, shade(th.leaf, 0.3)],
      trunk: [shade(th.trunk, -0.2), th.trunk],
      rock: [shade(th.rock, -0.2), th.rock, shade(th.rock, 0.22)],
      grass: [shade(th.grass, -0.28), th.grass, shade(th.grass, 0.28)]
    };
  }
  for (const t of ARENA_TYPES) BIOMES.push(arenaBiome(ARENA_THEMES[t]));
  BIOMES[ARENA + ARENA_TYPES.indexOf('judgment')].name = ARENA_THEMES.judgment.name;

  // ---------------- utilidades de color / píxel ----------------

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // Empaquetado ABGR (little-endian) para escribir de golpe en un Uint32Array.
  function pack(hex, a = 255) {
    const [r, g, b] = rgb(hex);
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  /** Mezcla dos colores hex y devuelve el empaquetado. */
  function mixPack(h1, h2, t) {
    const a = rgb(h1), b = rgb(h2);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  }

  /** Lienzo de píxeles: set(x,y,color) y canvas() al final. */
  function Pix(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const buf = new Uint32Array(img.data.buffer);
    return {
      w, h,
      set(x, y, col) { if (x >= 0 && y >= 0 && x < w && y < h) buf[y * w + x] = col; },
      get(x, y) { return buf[y * w + x]; },
      canvas() { c.putImageData(img, 0, 0); return cv; }
    };
  }

  /**
   * El mismo hash que G.U.hash (mismos números), pero aquí dentro: es lo más
   * llamado al hornear el mapa y así no busca G.U en cada píxel.
   */
  function H(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Tramado ordenado (Bayer 4×4), en 0..1: pasa de un tono a otro sin manchas cuadradas.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

  /** Luminancia aproximada de un color hex (0..255). */
  const lum = hex => { const [r, g, b] = rgb(hex); return r * 0.3 + g * 0.59 + b * 0.11; };
  /** Colores ordenados de oscuro a claro (las paletas no siempre vienen en orden). */
  const sortHex = list => list.slice().sort((a, b) => lum(a) - lum(b));
  const ramp = list => sortHex(list).map(h => pack(h));

  /**
   * Campo suave (ruido de valor) con celdas de 2^bits px, continuo entre chunks:
   * se evalúa en una rejilla que cubre el chunk (y un píxel de borde) y se
   * interpola por píxel. f(gx, gy) en coordenadas globales de arte, 0..1.
   */
  function smoothField(gx0, gy0, W, bits, s) {
    const cell = 1 << bits, m = cell - 1;
    const cx0 = (gx0 - 1) >> bits, cy0 = (gy0 - 1) >> bits;
    const gw = ((gx0 + W) >> bits) - cx0 + 2;
    const grid = new Float32Array(gw * gw);
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) grid[j * gw + i] = H(cx0 + i, cy0 + j, s);
    const sm = new Float32Array(cell);
    for (let k = 0; k < cell; k++) { const u = k / cell; sm[k] = u * u * (3 - 2 * u); }
    return (gx, gy) => {
      const o = ((gy >> bits) - cy0) * gw + (gx >> bits) - cx0;
      const u = sm[gx & m], v = sm[gy & m];
      const a = grid[o], b = grid[o + 1], c = grid[o + gw], d = grid[o + gw + 1];
      return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
    };
  }

  /**
   * Tono del suelo de todo el chunk (0..1, con el tramado ya puesto): manchas
   * grandes (16 px) y medianas (8 px) del mismo ruido que smoothField, pero en
   * un solo recorrido (el chunk empieza en múltiplo de 16: las celdas encajan).
   */
  function toneMap(gx0, gy0, W, s) {
    // El campo es muy suave: se calcula cada 2 px (un cuarto del trabajo) y el
    // tramado, que sí va píxel a píxel, se suma al leerlo (paintFloor).
    const hw = W >> 1, out = new Float32Array(hw * hw);
    addTone(out, hw, gx0, gy0, 3, 0.62, s + 41);    // celdas de 16 px (8 en la rejilla de 2 px)
    addTone(out, hw, gx0, gy0, 2, 0.38, s + 42);    // celdas de 8 px
    return out;
  }
  function addTone(out, hw, gx0, gy0, bits, k, s) {
    const cell = 1 << bits, m = cell - 1, gw = (hw >> bits) + 1;
    const cx0 = gx0 >> (bits + 1), cy0 = gy0 >> (bits + 1);
    const grid = new Float32Array(gw * gw);
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) grid[j * gw + i] = H(cx0 + i, cy0 + j, s) * k;
    const sm = new Float32Array(cell);
    for (let q = 0; q < cell; q++) { const u = q / cell; sm[q] = u * u * (3 - 2 * u); }
    for (let y = 0; y < hw; y++) {
      const o = (y >> bits) * gw, v = sm[y & m], row = y * hw;
      for (let x = 0; x < hw; x++) {
        const p = o + (x >> bits), u = sm[x & m];
        const a = grid[p], b = grid[p + 1], c = grid[p + gw], d = grid[p + gw + 1];
        out[row + x] += (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
      }
    }
  }

  /** Colores empaquetados de un bioma (una vez por bioma). */
  const palCache = new Map();
  function palette(bi) {
    let C = palCache.get(bi);
    if (C) return C;
    const B = BIOMES[bi];
    const fl = sortHex(B.floor), dt = sortHex(B.dirt), wt = sortHex(B.wallTop);
    C = {
      floor: fl.map(h => pack(h)), dirt: dt.map(h => pack(h)), wallTop: wt.map(h => pack(h)),
      wallFace: ramp(B.wallFace), flowers: B.flowers.map(h => pack(h)), rock: ramp(B.rock),
      speck: pack(B.speck), light: pack(B.light), wallLight: pack(B.wallLight), wallEdge: pack(B.wallEdge),
      wallFaceDark: pack(B.wallFaceDark), liq: pack(B.liq), liqDeep: pack(B.liqDeep), foam: pack(B.foam), shore: pack(B.shore),
      liqLight: mixPack(B.liq, B.foam, 0.28),
      // Sombra de contacto de las paredes sobre el suelo (fuerte y suave).
      shade: mixPack(fl[0], B.wallFaceDark, 0.55), shade2: mixPack(fl[0], B.wallFaceDark, 0.22),
      dirtEdge: mixPack(dt[0], B.speck, 0.55),
      crack: mixPack(wt[0], B.wallEdge, 0.55), wallRim: mixPack(wt[2], B.wallLight, 0.6),
      faceLight: mixPack(sortHex(B.wallFace)[1], B.wallTop[0], 0.45),
      flowerMid: B.flowers.map(h => pack(lum(h) > 175 ? '#c8742c' : '#fff1a8'))
    };
    palCache.set(bi, C);
    return C;
  }

  // ---------------- chunk de suelo ----------------

  /**
   * Máscara de tierra del chunk a resolución de píxel (con una fila de más por
   * arriba y por abajo para ver los bordes). El ruido se evalúa cada 4 px y se
   * interpola: ~30 veces menos llamadas que evaluarlo píxel a píxel.
   */
  function dirtMask(gx0, gy0, W, field, seed) {
    const S = 4, gw = W / S + 3;
    const grid = new Float32Array(gw * gw);
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++)
      grid[j * gw + i] = field(gx0 + (i - 1) * S, gy0 + (j - 1) * S);
    const mask = new Uint8Array(W * (W + 2));
    // El temblor del borde va por bloques de 2×2 px: se calcula una vez por bloque
    // (antes, una vez por píxel: 4 veces el mismo número).
    const jit = new Float32Array(W >> 1);
    for (let y = -1; y <= W; y++) {
      if (y === -1 || !(y & 1)) for (let i = 0; i < W >> 1; i++) jit[i] = (H((gx0 >> 1) + i, (gy0 + y) >> 1, seed + 9) - 0.5) * 0.05;
      const fy = (y + S) / S, j = Math.floor(fy), v = fy - j;
      for (let x = 0; x < W; x++) {
        const fx = (x + S) / S, i = Math.floor(fx), u = fx - i;
        const a = grid[j * gw + i], b = grid[j * gw + i + 1];
        const c = grid[(j + 1) * gw + i], d = grid[(j + 1) * gw + i + 1];
        const val = (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v + jit[x >> 1];
        mask[(y + 1) * W + x] = val > 0.64 ? 1 : 0;
      }
    }
    // dirtAt(x, y) en coordenadas locales del chunk (y puede ser -1 o W); .mask: fila y en (y+1)·W.
    const dirtAt = (x, y) => mask[(y + 1) * W + x] === 1;
    dirtAt.mask = mask;
    return dirtAt;
  }

  /**
   * Pinta un chunk de n×n tiles. `at(tx,ty)` devuelve el tipo de terreno
   * global ('floor' | 'wall' | 'liquid'), así el autotiling ve más allá del
   * borde del chunk. Se hornea una vez (y otra al cambiar de bioma): nada de esto
   * cuesta por fotograma.
   */
  function paintChunk(cx, cy, n, at, dirtField, bi, seed = 0) {
    const P = Pix(n * T, n * T);
    const C = palette(bi);
    const tx0 = cx * n, ty0 = cy * n, gx0 = tx0 * T, gy0 = ty0 * T, W = n * T;
    const dirtAt = dirtMask(gx0, gy0, W, dirtField, seed);
    const F = { tone: toneMap(gx0, gy0, W, seed), W, rock: null, crack: null };

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const tx = tx0 + i, ty = ty0 + j;
        const ox = i * T, oy = j * T;
        const kind = at(tx, ty);

        // 1) Suelo bajo todo (las esquinas redondeadas de paredes y agua lo dejan ver).
        paintFloor(P, C, ox, oy, tx, ty, dirtAt, at, F, kind === 'floor');

        if (kind === 'wall') {
          if (!F.rock) { F.rock = smoothField(gx0, gy0, W, 2, seed + 43); F.crack = smoothField(gx0, gy0, W, 4, seed + 44); }
          paintWall(P, C, ox, oy, tx, ty, at, F);
        } else if (kind === 'liquid') paintLiquid(P, C, ox, oy, tx, ty, at);
      }
    }
    return P.canvas();
  }

  // Detalles del suelo: [dx, dy, color] (L luz, G hierba clara, D sombra, F flor,
  // M centro de la flor, R0..R2 piedra de oscura a clara).
  const TUFT = [[-1, -2, 'L'], [1, -2, 'L'], [0, -1, 'L'], [-1, -1, 'G'], [1, -1, 'G'], [-1, 0, 'D'], [0, 0, 'G'], [1, 0, 'D']];
  const SPROUT = [[0, -1, 'L'], [1, -2, 'L'], [1, -1, 'G'], [0, 0, 'D']];
  const FLOWER = [[0, -1, 'F'], [-1, 0, 'F'], [1, 0, 'F'], [0, 1, 'F'], [0, 0, 'M'], [1, 1, 'D'], [0, 2, 'D']];
  const PEBBLE = [[0, 0, 'R2'], [1, 0, 'R1'], [0, 1, 'R1'], [1, 1, 'R0'], [2, 1, 'D'], [1, 2, 'D']];
  const CRACK = [[0, 0, 'D'], [1, 1, 'D'], [2, 1, 'D'], [3, 2, 'D'], [1, 0, 'R1']];

  function stamp(P, shape, x, y, cols) {
    for (const [dx, dy, k] of shape) P.set(x + dx, y + dy, cols[k]);
  }

  function paintFloor(P, C, ox, oy, tx, ty, dirtAt, at, F, open) {
    let dirtCount = 0;
    const mask = dirtAt.mask, W = F.W, tone = F.tone;
    for (let y = 0; y < T; y++) {
      const gy = ty * T + y, ly = oy + y, mrow = (ly + 1) * W;
      for (let x = 0; x < T; x++) {
        const gx = tx * T + x, lx = ox + x;
        const dirt = mask[mrow + lx] === 1;
        const pal = dirt ? C.dirt : C.floor;
        // Tono suave con tramado: manchas grandes que se funden, sin cuadros ni ruido de sal y pimienta.
        const v = tone[(ly >> 1) * (W >> 1) + (lx >> 1)] + (BAYER[((gy & 3) << 2) | (gx & 3)] - 0.5) * 0.16;
        let col = v < 0.41 ? pal[0] : v > 0.6 ? pal[2] : pal[1];
        const r = H(gx, gy, 13);
        if (dirt) {
          dirtCount++;
          if (r < 0.02) col = pal[0];
          else if (r > 0.99) col = pal[2];
          // Bordes de la tierra: labio en sombra arriba, borde iluminado abajo.
          if (mask[mrow - W + lx] !== 1) col = C.dirtEdge;
          else if (mask[mrow + W + lx] !== 1) col = pal[2];
        } else {
          if (r < 0.012) col = C.speck;
          else if (r > 0.994) col = C.light;
          else if (r < 0.6 && mask[mrow - W + lx] === 1) col = C.light;   // la hierba asoma sobre la tierra
        }
        P.set(lx, ly, col);
      }
    }
    if (!open) return;

    // Sombra de contacto de las paredes que hay al norte y al oeste (la luz viene de arriba a la izquierda).
    const wn = at(tx, ty - 1) === 'wall', ww = at(tx - 1, ty) === 'wall';
    if (wn) {
      for (let x = 0; x < T; x++) {
        const gx = tx * T + x;
        P.set(ox + x, oy, C.shade);
        P.set(ox + x, oy + 1, bay(gx, ty * T + 1) < 0.6 ? C.shade : C.shade2);
        if (bay(gx, ty * T + 2) < 0.4) P.set(ox + x, oy + 2, C.shade2);
      }
    }
    if (ww) {
      for (let y = wn ? 2 : 0; y < T; y++) {
        const gy = ty * T + y;
        P.set(ox, oy + y, bay(tx * T, gy) < 0.7 ? C.shade2 : C.shade);
        if (bay(tx * T + 1, gy) < 0.3) P.set(ox + 1, oy + y, C.shade2);
      }
    } else if (!wn && at(tx - 1, ty - 1) === 'wall') {
      P.set(ox, oy, C.shade); P.set(ox + 1, oy, C.shade2); P.set(ox, oy + 1, C.shade2);
    }

    // Detalles: matojo, flor, piedrecita (y algún brote suelto).
    const cols = { L: C.light, G: C.floor[2], D: C.speck, F: 0, M: 0, R0: C.rock[0], R1: C.rock[1], R2: C.rock[2] };
    const d = H(tx, ty, 14);
    const dx = ox + 3 + Math.floor(H(tx, ty, 15) * 10), dy = oy + 4 + Math.floor(H(tx, ty, 16) * 9);
    const lo = wn ? 3 : 0;                 // no pintar sobre la sombra de la pared
    if (dirtCount > T * T / 2 || dirtAt(dx, dy)) {
      cols.D = C.dirt[0];
      if (dy - oy > lo + 1) {
        if (d < 0.1) stamp(P, PEBBLE, dx, dy, cols);
        else if (d < 0.17) { cols.R1 = C.dirt[2]; stamp(P, CRACK, dx - 1, dy, cols); }
      }
      return;
    }
    if (dy - oy > lo + 2) {
      if (d < 0.16) stamp(P, TUFT, dx, dy, cols);
      else if (d < 0.235) {
        const f = Math.floor(H(tx, ty, 17) * C.flowers.length);
        cols.F = C.flowers[f]; cols.M = C.flowerMid[f];
        stamp(P, FLOWER, dx, dy - 1, cols);
        if (H(tx, ty, 21) < 0.35) stamp(P, FLOWER, dx + 3, dy + 1, cols);   // a veces, dos juntas
      } else if (d < 0.28) stamp(P, PEBBLE, dx, dy, cols);
    }
    const d2 = H(tx, ty, 18);
    if (d2 < 0.22) {
      const ex = ox + 2 + Math.floor(H(tx, ty, 19) * 12), ey = oy + 3 + lo + Math.floor(H(tx, ty, 20) * (11 - lo));
      if (!dirtAt(ex, ey)) stamp(P, SPROUT, ex, ey, cols);
    }
  }

  function paintWall(P, C, ox, oy, tx, ty, at, F) {
    const W = (x, y) => at(x, y) === 'wall';
    const n = W(tx, ty - 1), s = W(tx, ty + 1), w = W(tx - 1, ty), e = W(tx + 1, ty);
    const FACE = s ? 0 : 8;                 // filas de cara frontal visibles (más alta: se ve el relieve)
    const top = C.wallTop, face = C.wallFace;

    for (let y = 0; y < T; y++) {
      const gy = ty * T + y;
      for (let x = 0; x < T; x++) {
        // Esquinas redondeadas exteriores: dejan ver el suelo.
        if (!n && !w && x + y < 3) continue;
        if (!n && !e && (T - 1 - x) + y < 3) continue;
        if (!s && !w && x + (T - 1 - y) < 2) continue;
        if (!s && !e && (T - 1 - x) + (T - 1 - y) < 2) continue;

        const gx = tx * T + x;
        let col;
        if (y >= T - FACE) {
          // Cara frontal: borde en sombra, estratos verticales con luz a la izquierda y base oscura.
          const fy = y - (T - FACE);
          const cut = H(gx, 0, 21) < 0.3, after = H(gx - 1, 0, 21) < 0.3;
          col = cut ? face[0] : after ? C.faceLight : face[1];
          if (fy === 0) col = C.wallEdge;
          else if (fy === 1) col = cut ? C.wallFaceDark : face[0];
          else if (y === T - 1) col = C.wallFaceDark;
          else if (fy === 3 && H(gx >> 2, ty, 26) < 0.35) col = face[0];          // grieta horizontal
          else if (H(gx, gy, 22) < 0.06) col = C.wallFaceDark;
          if (!w && x === 0 || !e && x === T - 1) col = C.wallFaceDark;
        } else {
          // Cara de arriba: losas de roca (separadas por la curva de nivel 0,5 de un
          // ruido suave: grietas de 1 px), cada una con su tono y tramado.
          const c = F.crack(gx, gy) - 0.5;
          const v = F.rock(gx, gy) + (c > 0 ? 0.07 : -0.07) + (bay(gx, gy) - 0.5) * 0.22;
          col = v < 0.38 ? top[0] : v > 0.64 ? top[2] : top[1];
          if (c * (F.crack(gx - 1, gy) - 0.5) < 0 || c * (F.crack(gx, gy - 1) - 0.5) < 0) col = C.crack;
          else {
            const cu = F.crack(gx, gy - 1) - 0.5;
            if (cu * (F.crack(gx, gy - 2) - 0.5) < 0) col = C.wallRim;    // canto iluminado bajo la grieta
            else if (H(gx, gy, 25) < 0.012) col = C.wallLight;
          }
          // Bordes: contorno oscuro fuera, canto con luz dentro (más a la izquierda y arriba).
          const edgeY = T - FACE - 1;
          if (!n && y === 0) col = C.wallEdge;
          else if (!n && y === 1) col = C.wallLight;
          else if (!n && y === 2 && bay(gx, gy) < 0.5) col = C.wallRim;
          if (!s && y === edgeY) col = C.wallRim;
          if (!w && x === 0) col = C.wallEdge;
          else if (!w && x === 1 && y > 0) col = C.wallRim;
          if (!e && x === T - 1) col = C.wallEdge;
          else if (!e && x === T - 2 && y > 1 && y < edgeY) col = top[0];
        }
        P.set(ox + x, oy + y, col);
      }
    }
  }

  function paintLiquid(P, C, ox, oy, tx, ty, at) {
    const L = (x, y) => at(x, y) === 'liquid';
    const n = L(tx, ty - 1), s = L(tx, ty + 1), w = L(tx - 1, ty), e = L(tx + 1, ty);
    const nw = L(tx - 1, ty - 1), ne = L(tx + 1, ty - 1), sw = L(tx - 1, ty + 1), se = L(tx + 1, ty + 1);
    const BIG = 99, RC = 4.5;               // radio de las esquinas de fuera

    for (let y = 0; y < T; y++) {
      const gy = ty * T + y;
      for (let x = 0; x < T; x++) {
        // Distancia a la orilla dentro del tile (incluye esquinas interiores y exteriores redondeadas).
        let d = Math.min(n ? BIG : y, s ? BIG : T - 1 - y, w ? BIG : x, e ? BIG : T - 1 - x);
        if (n && w && !nw) d = Math.min(d, Math.hypot(x, y) - 0.5);
        if (n && e && !ne) d = Math.min(d, Math.hypot(T - 1 - x, y) - 0.5);
        if (s && w && !sw) d = Math.min(d, Math.hypot(x, T - 1 - y) - 0.5);
        if (s && e && !se) d = Math.min(d, Math.hypot(T - 1 - x, T - 1 - y) - 0.5);
        const xr = T - 1 - x, yr = T - 1 - y;
        if (!n && !w && x < RC && y < RC) d = Math.min(d, RC - 0.5 - Math.hypot(RC - 0.5 - x, RC - 0.5 - y));
        if (!n && !e && xr < RC && y < RC) d = Math.min(d, RC - 0.5 - Math.hypot(RC - 0.5 - xr, RC - 0.5 - y));
        if (!s && !w && x < RC && yr < RC) d = Math.min(d, RC - 0.5 - Math.hypot(RC - 0.5 - x, RC - 0.5 - yr));
        if (!s && !e && xr < RC && yr < RC) d = Math.min(d, RC - 0.5 - Math.hypot(RC - 0.5 - xr, RC - 0.5 - yr));

        const gx = tx * T + x;
        // Orilla irregular (sólo junto a tierra): se come un píxel aquí y allá.
        if (d < 3) d += (H(gx >> 1, gy >> 1, 35) - 0.5) * 1.1;
        if (d < 0) continue;                 // se ve el suelo de debajo

        let col;
        if (d < 1) col = C.shore;                                       // labio de tierra mojada
        else if (d < 2) col = H(gx, gy, 36) < 0.2 ? C.liqLight : C.foam; // espuma, a trozos
        else {
          // De somero a hondo con tramado (sin el ruido de antes).
          const k = (d - 2) / 5 + (bay(gx, gy) - 0.5) * 0.4;
          col = k < 0.3 ? C.liqLight : k < 0.78 ? C.liq : C.liqDeep;
        }
        if (d >= 3.5) {
          // Olas: arquitos de 4 px repartidos en celdas de 8×6.
          const cw = gx >> 3, ch = Math.floor(gy / 6), wy = gy - ch * 6;
          if ((wy === 2 || wy === 3) && H(cw, ch, 33) < 0.42) {
            const wx = (gx & 7) - Math.floor(H(cw, ch, 37) * 4);
            if (wy === 2 ? wx === 1 || wx === 2 : wx === 0 || wx === 3) col = C.liqLight;
          }
          if (H(gx, gy, 34) < 0.003) col = C.foam;
        }
        P.set(ox + x, oy + y, col);
      }
    }
  }

  // ---------------- sprites de objetos del escenario ----------------
  /*
   * Se pintan una vez por bioma y variante y se guardan. Variantes (world.drawProp):
   *   tree      aspecto 0..2 (crystal y deadtree, 0..1)
   *   rock      aspecto*2 + (rota ? 1 : 0)
   *   grass     aspecto*2 + (mecida por el viento ? 1 : 0)
   *   altar     efecto*2 + (usado ? 1 : 0)      spring  1 = seco      trap  tipo
   */

  const propCache = new Map();          // "bioma/tipo/variante" -> canvas

  function propSprite(bi, type, variant = 0) {
    const k = bi + '/' + type + '/' + variant;
    let cv = propCache.get(k);
    if (!cv) { cv = PAINT[type](BIOMES[bi], variant); propCache.set(k, cv); }
    return cv;
  }

  /*
   * Sombras de los objetos, en píxeles de arte (radio x, radio y) y guardadas:
   * antes era una elipse suavizada pintada en cada fotograma; así es una imagen
   * más (igual de barata o más) y con el mismo píxel que el resto.
   */
  const SHADOW = { tree: [11, 3.5], rock: [9, 3], chest: [7, 2.5], bigchest: [11, 3], altar: [8, 3] };
  const shadowCache = new Map();
  function shadow(type) {
    let cv = shadowCache.get(type);
    if (cv) return cv;
    const [rx, ry] = SHADOW[type] || [7, 2.5];
    const w = Math.ceil(rx) * 2 + 1, h = Math.ceil(ry) * 2 + 1, cx = (w - 1) / 2, cy = (h - 1) / 2;
    const P = Pix(w, h);
    const out = pack('#000000', 62), core = pack('#000000', 92);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (q <= 1) P.set(x, y, q < 0.45 ? core : out);
    }
    cv = P.canvas();
    shadowCache.set(type, cv);
    return cv;
  }

  function disc(P, cx, cy, r, colFn) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) { const c = colFn(x, y, d / r); if (c != null) P.set(x, y, c); }
      }
  }

  function outline(P, col) {
    // Contorno de 1 px alrededor de todo lo opaco.
    const marks = [];
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
      if (P.get(x, y) >>> 24) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => {
        const xx = x + a, yy = y + b;
        return xx >= 0 && yy >= 0 && xx < P.w && yy < P.h && (P.get(xx, yy) >>> 24);
      });
      if (near) marks.push([x, y]);
    }
    for (const [x, y] of marks) P.set(x, y, col);
  }

  /** Línea de píxeles (Bresenham) con grosor 1 o 2. */
  function line(P, x0, y0, x1, y1, col, thick = 1, col2 = col) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      P.set(x, y, col);
      if (thick > 1) P.set(x + 1, y, col2);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  const TREE_SHAPES = [
    [[15, 20, 10], [9, 16, 7], [21, 16, 7], [15, 10, 8], [10, 23, 6], [20, 23, 6]],            // redondo
    [[15, 23, 8], [10, 19, 6], [20, 19, 6], [15, 13, 7], [15, 6, 5], [11, 25, 5], [19, 25, 5]], // alto
    [[15, 21, 9], [7, 19, 7], [23, 19, 7], [11, 13, 7], [19, 13, 7], [15, 24, 7]]              // ancho
  ];

  const PAINT = {
    tree(B, variant = 0) {
      if (B.prop === 'crystal') return PAINT.crystal(B, variant);
      if (B.prop === 'dead') return PAINT.deadtree(B, variant);
      const look = variant % TREE_SHAPES.length;
      const P = Pix(30, 40);
      const L = ramp(B.leaf), Tr = ramp(B.trunk);
      const bark = mixPack(sortHex(B.trunk)[0], '#000000', 0.35);
      // Tronco con raíces, corteza y la sombra de la copa encima.
      const t0 = look === 1 ? 27 : 26;
      for (let y = t0; y < 38; y++) for (let x = 13; x < 18; x++) {
        let c = x === 13 ? Tr[0] : x === 17 ? bark : x === 14 ? Tr[1] : Tr[x === 16 ? 0 : 1];
        if (x === 15 && H(x, y, 43 + look) < 0.3) c = Tr[0];
        if (y < t0 + 3) c = bark;
        P.set(x, y, c);
      }
      [[12, 37], [18, 37], [11, 38], [12, 38], [18, 38], [19, 38]].forEach(([x, y]) => P.set(x, y, x < 15 ? Tr[0] : bark));
      // Copa: racimos con luz de arriba a la izquierda y textura de hojas.
      for (const [bx, by, br] of TREE_SHAPES[look]) {
        disc(P, bx, by, br, (x, y, d) => {
          const lit = ((x - bx) * -0.6 + (y - by) * -0.8) / br;
          let idx = lit > 0.5 ? 3 : lit > 0.05 ? 2 : lit > -0.45 ? 1 : 0;
          const tex = H(x >> 1, (y + (x & 1)) >> 1, 41 + look);
          if (tex > 0.82 && idx < 3 && lit > -0.3) idx++;
          else if (tex < 0.16 && idx > 0) idx--;
          if (d > 0.88 && lit < -0.2) idx = 0;
          return L[idx];
        });
      }
      outline(P, pack(shade(sortHex(B.leaf)[0], -0.6)));
      return P.canvas();
    },

    crystal(B, variant = 0) {
      const P = Pix(26, 40);
      const L = ramp(B.leaf), D = ramp(B.trunk);
      const deep = mixPack(sortHex(B.leaf)[0], sortHex(B.trunk)[1], 0.45);
      const spires = variant % 2 ? [[11, 6, 5, 37], [18, 1, 4, 37], [5, 18, 3, 38], [21, 17, 3, 38]]
                                 : [[13, 2, 5, 37], [7, 14, 4, 38], [19, 12, 4, 38]];
      for (const [cx, topY, half, bot] of spires) {
        for (let y = topY; y <= bot; y++) {
          const t = Math.min(1, (y - topY) / 8);
          const hw = Math.round(half * t);
          for (let x = cx - hw; x <= cx + hw; x++) {
            let c;
            if (x === cx) c = L[3];                                       // arista con luz
            else if (x < cx) c = x === cx - hw ? L[2] : L[1];             // cara iluminada
            else c = x === cx + hw ? deep : L[0];                         // cara en sombra
            // Vetas en diagonal por la cara iluminada.
            if (x < cx && (y - topY + (cx - x)) % 7 === 0) c = L[2];
            if (y > bot - 3) c = x <= cx ? D[1] : D[0];                   // base en la roca
            P.set(x, y, c);
          }
        }
        P.set(cx, topY, pack('#ffffff'));
        if (topY + 1 <= bot) P.set(cx, topY + 1, L[3]);
      }
      // Piedrecitas al pie.
      [[3, 38], [4, 38], [22, 38], [23, 37], [12, 38]].forEach(([x, y]) => P.set(x, y, D[0]));
      outline(P, pack(shade(sortHex(B.trunk)[0], -0.55)));
      return P.canvas();
    },

    deadtree(B, variant = 0) {
      const P = Pix(28, 40);
      const Tr = ramp(B.trunk), L = ramp(B.leaf);
      // Tronco que se estrecha hacia arriba, con corteza.
      for (let y = 10; y < 38; y++) {
        const wdt = y > 30 ? 4 : y > 20 ? 3 : 2;
        for (let x = 12; x < 12 + wdt; x++) {
          let c = x === 12 ? Tr[0] : x === 11 + wdt ? Tr[0] : Tr[1];
          if (x === 13 && H(x, y, 47 + variant) < 0.25) c = Tr[0];
          P.set(x, y, c);
        }
      }
      [[11, 37], [10, 38], [16, 37], [17, 38], [11, 38], [16, 38]].forEach(([x, y]) => P.set(x, y, Tr[0]));
      // Ramas (con su horquilla al final).
      const branch = (x0, y0, x1, y1, fx, fy) => {
        line(P, x0, y0, x1, y1, L[1], 1);
        line(P, x0, y0 + 1, x1, y1 + 1, L[0], 1);
        line(P, x1, y1, x1 + fx, y1 + fy, L[2], 1);
      };
      if (variant % 2) {
        branch(12, 22, 4, 13, -1, -3); branch(14, 18, 23, 10, 2, -2); branch(13, 14, 8, 6, 1, -3); branch(13, 11, 17, 3, -1, -2);
      } else {
        branch(12, 20, 3, 11, 0, -3); branch(15, 17, 25, 7, -1, -3); branch(12, 13, 6, 6, -2, -1); branch(14, 12, 20, 6, 2, -2);
      }
      P.set(13, 9, Tr[1]); P.set(13, 8, L[1]);
      outline(P, pack('#0f0b09'));
      return P.canvas();
    },

    rock(B, variant = 0) {
      const P = Pix(22, 17);
      const R = ramp(B.rock);
      const look = variant >> 1, broken = variant & 1;
      const mossy = B.prop === 'tree' && lum(B.leaf[1]) < 150;
      const moss = ramp(B.leaf);
      const shine = mixPack(sortHex(B.rock)[2], '#ffffff', 0.6);
      // Peñasco (o un peñasco y una piedra al lado): base plana, luz arriba a la izquierda.
      const blobs = look ? [[8.5, 9.5, 7.5, 6.5], [16.5, 11.5, 4.5, 4]] : [[10.5, 9.5, 9.5, 7]];
      for (const [bx, by, rx, ry] of blobs) {
        for (let y = 1; y <= 15; y++) for (let x = 0; x <= 21; x++) {
          const nx = (x - bx) / rx, ny = (y - by) / ry;
          const d = nx * nx + ny * ny + (H(x, y, 61 + look) - 0.5) * 0.08;
          if (d > 1 || y > 15) continue;
          const lit = -nx * 0.55 - ny * 0.85 + (H(x >> 1, y >> 1, 62 + look) - 0.5) * 0.3;
          let c = R[lit > 0.45 ? 2 : lit > -0.15 ? 1 : 0];
          if (y >= 14) c = R[0];
          if (mossy && ny < -0.35 && H(x, y >> 1, 63) < 0.55) c = moss[lit > 0.3 ? 2 : 1];
          P.set(x, y, c);
        }
        // Brillo y una arista (sólo sobre la piedra).
        const on = (x, y, c) => { if (P.get(x, y) >>> 24) P.set(x, y, c); };
        const hx = Math.round(bx - rx * 0.45), hy = Math.round(by - ry * 0.55);
        on(hx, hy, shine); on(hx + 1, hy, shine); on(hx, hy + 1, R[2]);
        for (let k = 0; k < Math.round(rx * 0.6); k++) on(Math.round(bx + 1 + k), Math.round(by + 1 - k * 0.4), R[0]);
      }
      // Grietas en la variante dañada.
      if (broken) {
        const dark = pack('#1b1d22');
        [[9, 4], [10, 5], [10, 6], [11, 7], [10, 8], [12, 8], [13, 9], [8, 9], [7, 10], [11, 9], [6, 11]].forEach(([x, y]) => P.set(x, y, dark));
      }
      outline(P, pack(shade(sortHex(B.rock)[0], -0.7)));
      return P.canvas();
    },

    grass(B, variant = 0) {
      // Matojo de hojas en abanico: cada hoja es una curva que se inclina hacia
      // fuera, con la base oscura y la punta clara. variante = aspecto*2 + viento.
      const P = Pix(20, 17);
      const Gc = ramp(B.grass);
      const dark = pack(B.speck);
      const look = variant >> 1, sway = variant & 1 ? 1.2 : 0;
      const blades = [11, 9, 12][look % 3];
      const tall = [0, 2, 1][look % 3];
      for (let pass = 0; pass < 2; pass++) {
        for (let b = pass; b < blades; b += 2) {
          const t = b / (blades - 1);                     // 0 izquierda .. 1 derecha
          const x0 = 3 + t * 13 + (H(b, 7 + look, 52) - 0.5) * 2;
          const hgt = Math.min(15, 8 + tall + Math.floor(H(b, 3 + look, 51) * 6) + (Math.abs(t - 0.5) < 0.25 ? 3 : 0));
          const lean = (t - 0.5) * 7 + sway * (0.6 + H(b, 1, 53));
          for (let i = 0; i <= hgt; i++) {
            const k = i / hgt;
            const x = Math.round(x0 + lean * k * k);
            const y = 16 - i;
            let c = k > 0.78 ? Gc[2] : k > 0.25 ? Gc[1] : Gc[0];
            if (pass === 0 && k <= 0.78) c = Gc[0];
            P.set(x, y, c);
            if (i < hgt * 0.45) P.set(x + 1, y, k < 0.15 ? dark : Gc[0]);
          }
        }
      }
      outline(P, pack(shade(sortHex(B.grass)[0], -0.65)));
      return P.canvas();
    },

    // ---------- objetos interactivos ----------

    /** Torre de poder (altar). variante = efecto*2 + (usado ? 1 : 0). El orbe va centrado en (10, 5.5). */
    altar(B, variant) {
      const P = Pix(20, 32);
      const R = ramp(B.rock);
      const mortar = mixPack(sortHex(B.rock)[0], '#000000', 0.3);
      const eff = variant >> 1, used = variant & 1;
      const ORB = [['#ff5f6d', '#c23a4b', '#ffd3d8'], ['#5fd4ff', '#2a8fd0', '#d8f6ff'],
                   ['#ff8ad8', '#b03d84', '#ffe0f4'], ['#ffd23f', '#c08a10', '#fff3b0']][eff];
      const O = (used ? ['#6b7380', '#4a505c', '#9aa2ae'] : ORB).map(h => pack(h));
      const runeOff = mixPack(sortHex(B.rock)[0], '#000000', 0.15);
      // Escalones.
      for (let y = 27; y <= 31; y++) for (let x = 1; x <= 18; x++) {
        if (y <= 28 && (x < 3 || x > 16)) continue;
        P.set(x, y, R[y === 27 || y === 29 ? 2 : y === 31 || x === 18 || (y === 28 && x === 16) ? 0 : 1]);
      }
      // Columna de bloques de piedra (juntas cada 5 filas, alternadas), con luz a la izquierda.
      for (let y = 11; y <= 26; y++) for (let x = 6; x <= 13; x++) {
        let c = x === 6 ? R[2] : x >= 12 ? R[0] : R[1];
        const row = Math.floor((y - 11) / 5);
        if ((y - 11) % 5 === 4) c = mortar;
        else if (x === (row % 2 ? 9 : 10) && x > 6) c = mortar;
        P.set(x, y, c);
      }
      // Runas que brillan en el color de su poder.
      for (const [x, y] of [[8, 13], [8, 14], [9, 15], [8, 16], [10, 18], [11, 19], [10, 20], [8, 22], [9, 23], [8, 24]])
        P.set(x, y, used ? runeOff : (y % 3 ? O[0] : O[2]));
      // Capitel y los dos cuernos que sujetan el orbe.
      for (let y = 8; y <= 10; y++) for (let x = 4; x <= 15; x++) P.set(x, y, R[y === 8 ? 2 : y === 10 ? 0 : 1]);
      for (let y = 6; y <= 7; y++) { P.set(5, y, R[2]); P.set(14, y, R[0]); }
      // Orbe.
      disc(P, 9.5, 5.5, 4.2, (x, y, d) => {
        const lit = (9.5 - x) * 0.5 + (5.5 - y) * 0.7;
        return lit > 1.6 ? O[2] : d > 0.75 ? O[1] : O[0];
      });
      if (!used) P.set(8, 3, pack('#ffffff'));
      outline(P, pack('#120e1a'));
      return P.canvas();
    },

    /** Manantial curativo. variante 1 = agotado. */
    spring(B, variant) {
      const P = Pix(34, 16);
      const R = ramp(B.rock);
      const W = (variant ? ['#2f5f68', '#3a6f7a', '#4f8a92'] : ['#2ba8b8', '#5fe8d8', '#b8fff4']).map(h => pack(h));
      const deep = pack(variant ? '#244a52' : '#1f8a9c');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 34; x++) {
        const nx = (x - 16.5) / 16.5, ny = (y - 8) / 7.5;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        if (d > 0.62) {
          // Aro de piedras: una piedra cada pocos píxeles, con luz arriba.
          const a = Math.atan2(ny, nx), stone = Math.floor((a + Math.PI) / (Math.PI * 2) * 14);
          const seam = Math.abs(((a + Math.PI) / (Math.PI * 2) * 14) - stone - 0.5) > 0.42;
          P.set(x, y, seam ? R[0] : R[ny < -0.2 ? 2 : H(stone, 1, 71) < 0.5 ? 1 : 0]);
          continue;
        }
        // Agua: más honda en el centro y ondas en círculo.
        const ring = Math.sin(Math.sqrt(d) * 15) > 0.75;
        let c = d < 0.12 ? deep : d < 0.38 ? W[0] : W[1];
        if (ring && d > 0.12) c = W[2];
        if (d > 0.5 && ny < 0) c = W[0];                 // sombra del borde de arriba
        P.set(x, y, c);
      }
      if (!variant) [[10, 6], [11, 5], [22, 9], [23, 8], [16, 11]].forEach(([x, y]) => P.set(x, y, pack('#ffffff')));
      outline(P, pack('#14161c'));
      return P.canvas();
    },

    /** Cofre grande con candado. */
    bigchest() {
      const P = Pix(24, 20);
      const wood = pack('#6b3a1e'), woodL = pack('#8e5329'), woodLL = pack('#a8673a'), woodD = pack('#432210');
      const iron = pack('#9aa6b5'), ironL = pack('#d5dde6'), ironD = pack('#5d6773'), gold = pack('#f2c443'), goldL = pack('#fff0a0'), goldD = pack('#b5832a');
      for (let y = 1; y < 19; y++) for (let x = 1; x < 23; x++) {
        // Tapa abombada: las esquinas de arriba, redondeadas.
        if (y === 1 && (x < 4 || x > 19)) continue;
        if (y === 2 && (x < 2 || x > 21)) continue;
        let c = y < 8 ? (y <= 3 ? woodLL : woodL) : wood;
        if (y >= 10 && (x === 9 || x === 15)) c = woodD;                 // tablas
        if (y === 8 || y === 9) c = y === 8 ? woodD : ironD;              // junta de la tapa
        if (x === 1 || x === 22 || y === 18) c = woodD;
        if (x === 4 || x === 5 || x === 18 || x === 19) c = (x === 4 || x === 18) ? (y < 8 ? ironL : iron) : ironD;   // flejes
        if ((y === 1 || y === 2) && c !== woodD) c = iron;
        P.set(x, y, c);
      }
      // Remaches.
      [[4, 5], [18, 5], [4, 13], [18, 13], [4, 16], [18, 16]].forEach(([x, y]) => P.set(x, y, ironL));
      // Candado: arco de hierro y cuerpo de oro con brillo y ojo de cerradura.
      for (let x = 10; x <= 13; x++) P.set(x, 4, iron);
      P.set(9, 5, iron); P.set(14, 5, iron); P.set(9, 6, iron); P.set(14, 6, ironD); P.set(9, 7, iron); P.set(14, 7, ironD);
      for (let y = 8; y <= 14; y++) for (let x = 8; x <= 15; x++) P.set(x, y, x === 8 || y === 8 ? goldL : x === 15 || y === 14 ? goldD : gold);
      P.set(11, 10, woodD); P.set(12, 10, woodD); P.set(11, 11, woodD); P.set(12, 11, woodD); P.set(11, 12, woodD);
      outline(P, pack('#1e0f06'));
      return P.canvas();
    },

    /** Trampa de Mundo Misterioso. variante: 0 veneno · 1 pegajosa · 2 explosiva. */
    trap(B, variant) {
      const P = Pix(14, 14);
      const COL = [['#b45ec4', '#e6a3f0'], ['#8bd94a', '#d2ff9a'], ['#ff7b3d', '#ffd08a']][variant];
      const c = pack(COL[0]), l = pack(COL[1]);
      const base = pack('#2a2238'), baseL = pack('#3b3150');
      for (let y = 1; y < 13; y++) for (let x = 1; x < 13; x++) {
        const edge = x === 1 || y === 1 || x === 12 || y === 12;
        P.set(x, y, edge ? (x === 1 || y === 1 ? l : c) : (x + y) % 2 ? base : baseL);
      }
      const sym = [
        // veneno: calavera de puntos
        [[5, 4], [6, 4], [7, 4], [8, 4], [4, 5], [9, 5], [4, 6], [6, 6], [7, 6], [9, 6], [5, 7], [8, 7], [5, 8], [6, 8], [7, 8], [8, 8], [5, 9], [8, 9]],
        // pegajosa: gotas
        [[4, 4], [4, 5], [3, 6], [5, 6], [4, 7], [8, 5], [8, 6], [7, 7], [9, 7], [8, 8], [6, 9], [5, 10], [7, 10], [6, 11]],
        // explosiva: mina
        [[6, 3], [7, 3], [5, 4], [8, 4], [4, 5], [9, 5], [4, 6], [6, 6], [7, 6], [9, 6], [4, 7], [6, 7], [7, 7], [9, 7], [4, 8], [9, 8], [5, 9], [8, 9], [6, 10], [7, 10]]
      ][variant];
      for (const [x, y] of sym) P.set(x, y, l);
      outline(P, pack('#0c0812'));
      return P.canvas();
    },

    /** Grieta hacia la arena del legendario. variante = fotograma 0..3. */
    rift(B, variant) {
      const P = Pix(30, 46);
      const glow = pack('#7b3cff'), mid = pack('#b48aff'), core = pack('#140a26'), white = pack('#f2e6ff');
      for (let y = 2; y < 44; y++) {
        const t = (y - 2) / 42;
        const w = Math.sin(t * Math.PI) * 9 + 1;
        const off = Math.round(Math.sin(t * 9 + variant * 1.6) * 2.2 + (H(y, variant, 91) - 0.5) * 2);
        for (let x = -Math.ceil(w) - 2; x <= Math.ceil(w) + 2; x++) {
          const ax = Math.abs(x) / w;
          const px = 15 + x + off;
          if (ax <= 0.45) P.set(px, y, core);
          else if (ax <= 0.75) P.set(px, y, H(px, y, 92 + variant) < 0.15 ? white : mid);
          else if (ax <= 1.15 || H(px, y, 93 + variant) < 0.3) P.set(px, y, glow);
        }
      }
      // Chispas en el centro.
      for (let i = 0; i < 6; i++) P.set(13 + Math.floor(H(i, variant, 94) * 5), 8 + Math.floor(H(i, variant, 95) * 30), white);
      return P.canvas();
    },

    chest() {
      const P = Pix(16, 14);
      const gold = pack('#f2c443'), goldL = pack('#fff0a0'), goldD = pack('#b5832a'), wood = pack('#8a4f2a'), woodD = pack('#5e3418');
      const lid = pack('#c4662e'), lidL = pack('#e08a48');
      for (let y = 2; y < 13; y++) for (let x = 1; x < 15; x++) {
        if (y === 2 && (x < 3 || x > 12)) continue;                       // tapa redondeada
        let c = y < 6 ? (y === 3 ? lidL : lid) : wood;
        if (y === 2) c = lidL;
        if (y === 6) c = goldD;
        if (y >= 8 && y <= 11 && x === 7) c = woodD;                      // tablas
        if (x === 1 || x === 14) c = woodD;
        if ((x === 3 || x === 12) && y > 2) c = y < 6 ? gold : goldD;     // esquinas de oro
        if (y === 12) c = woodD;
        P.set(x, y, c);
      }
      for (let x = 6; x < 10; x++) for (let y = 5; y < 9; y++) P.set(x, y, x === 6 || y === 5 ? goldL : x === 9 || y === 8 ? goldD : gold);
      P.set(7, 7, woodD); P.set(8, 7, woodD);
      outline(P, pack('#2a160a'));
      return P.canvas();
    }
  };

  function clearProps() { propCache.clear(); }

  return { T, BIOMES, NORMAL, ARENA, ARENA_THEMES, ARENA_TYPES, paintChunk, propSprite, shadow, clearProps,
           /** Índice de bioma de la arena de un tipo. */
           arenaBiome: type => ARENA + Math.max(0, ARENA_TYPES.indexOf(type)) };
})();
