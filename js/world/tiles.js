/* ============ tiles.js — pixel art del mundo, pintado en código ============
 * Todo se pinta a resolución de ARTE (16 px por tile) escribiendo en un
 * ImageData, y luego se dibuja escalado ×G.Sprites.PX sin suavizado. Así los
 * tiles comparten tamaño de píxel con los sprites de Mundo Misterioso.
 *
 * Autotiling: cada tile mira a sus 8 vecinos al pintarse (bordes de pared,
 * cara frontal, esquinas redondeadas, espuma de la orilla...).
 *
 * Estilo «Pokémon de DS» (26-10-2026), sobre todo Mundo Misterioso (Exploradores):
 *   - suelo con textura de verdad según el bioma (ground): briznas de hierba,
 *     losas, ceniza, arena con ondas, nieve, tablas de madera, chapas;
 *   - caminos de tierra clara con el borde de hierba que asoma por encima;
 *   - paredes de arbustos (bosques: copas apretadas y troncos debajo, como las
 *     paredes de los bosques de Mundo Misterioso) o de roca (losas y estratos);
 *   - agua hundida: se ve el talud de tierra en la orilla de arriba;
 *   - hierba alta como la de los juegos (matas de tres puntas, en filas);
 *   - trampas pintadas en el suelo (charco de veneno, baba, baldosa agrietada
 *     que brilla) en vez de un recuadro.
 * Todo es dibujo propio: nada copiado de los juegos.
 *
 * Modo Ultra (2,5D, G.Settings 'ultra'): las paredes se levantan (RAISE px de
 * arte más altas, la cara el doble) y se pintan aparte en tiras por fila
 * (caps) para ordenarse por Y con los Pokémon (world.js); el suelo lleva las
 * sombras que proyectan (la luz viene de arriba a la izquierda) y los objetos,
 * su sombra proyectada (castShadow).
 */
G.Tiles = (() => {
  const T = 16;                       // píxeles de arte por tile
  const RAISE = 8;                    // Ultra: cuánto sube la parte de arriba de las paredes (px de arte)
  const CAP_H = T + RAISE;            // Ultra: alto de la tira de paredes de una fila
  // Ultra: hacia dónde cae la sombra por cada px de altura (luz de arriba a la izquierda).
  const SUN_X = 0.5, SUN_Y = 0.25;

  /*
   * ground: textura del suelo · walls: 'bush' (arbustos y troncos) o 'rock' ·
   * mood: luz del modo Ultra { warm, cool, dark } (dark 0..1: oscuridad lejos de ti)
   */
  const BIOMES = [
    { name: 'Bosque Umbrío', liquid: 'water', ground: 'grass', walls: 'bush',
      floor: ['#4a8d40', '#53984a', '#43833a'], dirt: ['#9e8150', '#ab8e5b', '#907448'],
      speck: '#2d662a', light: '#76b95b', flowers: ['#f4d65c', '#f39ac0', '#eef2ff'],
      wallTop: ['#5d6e49', '#677a50', '#566544'], wallLight: '#88a06e', wallEdge: '#10240f',
      wallFace: ['#3e4934', '#363f2d'], wallFaceDark: '#0d1c0c',
      liq: '#3f86d0', liqDeep: '#2c64a6', foam: '#c8ecff', shore: '#4e5a2e',
      prop: 'tree', leaf: ['#1d4d24', '#2a6a2e', '#3f8c3a', '#62b04e'], trunk: ['#5b3b22', '#7a5130'],
      rock: ['#636b75', '#848d98', '#a8b1bb'], grass: ['#2a682a', '#3f9038', '#6cc04e'],
      mood: { warm: '#ffe9a8', cool: '#0b2a3a', dark: 0 } },
    { name: 'Cueva Cristal', liquid: 'water', ground: 'stone', walls: 'rock',
      floor: ['#4d5778', '#535e81', '#47506f'], dirt: ['#3c4462', '#424a69', '#37405b'],
      speck: '#3b4363', light: '#6a78a4', flowers: ['#8fe3ff', '#c9a6ff', '#7ef0d0'],
      wallTop: ['#5f5089', '#695996', '#56497d'], wallLight: '#a08ddc', wallEdge: '#1f1934',
      wallFace: ['#3f3463', '#382e59'], wallFaceDark: '#221c3a',
      liq: '#2a9cab', liqDeep: '#1d7c8a', foam: '#aaf4f7', shore: '#33405e',
      prop: 'crystal', leaf: ['#5ad1e8', '#8fe7f5', '#c8f7ff', '#ffffff'], trunk: ['#3a4a78', '#4e64a0'],
      rock: ['#555d79', '#737c9c', '#959fc0'], grass: ['#3d5c8a', '#5a86c0', '#8ab8ee'],
      mood: { warm: '#b8f4ff', cool: '#120a30', dark: 0.42 } },
    { name: 'Volcán Ceniza', liquid: 'lava', ground: 'ash', walls: 'rock',
      floor: ['#5b4537', '#644c3c', '#533f32'], dirt: ['#403530', '#473b34', '#392f2b'],
      speck: '#47362b', light: '#806452', flowers: ['#ff8d3d', '#ffc45e', '#e06a4a'],
      wallTop: ['#3c3634', '#443d3a', '#35302e'], wallLight: '#625752', wallEdge: '#141110',
      wallFace: ['#2b2624', '#25201f'], wallFaceDark: '#151211',
      liq: '#e45a1f', liqDeep: '#b9401a', foam: '#ffd46a', shore: '#3a2a22',
      prop: 'dead', leaf: ['#4a3a30', '#5e4a3c', '#6f5a49', '#806a58'], trunk: ['#3a2e27', '#52423a'],
      rock: ['#4e4642', '#6a605b', '#877c76'], grass: ['#6b4a2a', '#94693a', '#c4914e'],
      mood: { warm: '#ffb46a', cool: '#2a0a08', dark: 0.12 } },
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
   *   ground / walls / mood   como en BIOMES (textura del suelo, paredes, luz del Ultra)
   */
  const ARENA_THEMES = {
    normal:   { name: 'Pradera Eterna', floor: '#6f8a4f', wall: '#8a7f6a', liquid: 'water', liq: '#4f8fd0', prop: 'tree',
                leaf: '#5aa04a', trunk: '#6b4a2a', flowers: ['#f4d65c', '#ffffff', '#f39ac0'], grass: '#5a9a40', rock: '#8a8a8a',
                pools: 0, pillars: 0.035, props: { tree: 0.025, grass: 0.05 }, weather: null,
                ground: 'grass', walls: 'bush', mood: { warm: '#fff0b0', cool: '#10283a', dark: 0 } },
    fire:     { name: 'Volcán Ígneo', floor: '#5b3a2e', wall: '#3a2826', liquid: 'lava', liq: '#e45a1f', foam: '#ffd46a', prop: 'dead',
                leaf: '#5e4a3c', trunk: '#3a2e27', flowers: ['#ff8d3d', '#ffc45e', '#e06a4a'], grass: '#94693a', rock: '#6a605b',
                pools: 0.31, pillars: 0.03, props: { tree: 0.01 }, weather: 'sun',
                ground: 'ash', walls: 'rock', mood: { warm: '#ffa050', cool: '#300806', dark: 0.1 } },
    water:    { name: 'Gruta Marina', floor: '#3c6a80', wall: '#2a4660', liquid: 'water', liq: '#2f86d6', foam: '#bfeaff', prop: 'crystal',
                leaf: '#5fd0e8', trunk: '#2a4a78', flowers: ['#ff9ec4', '#7ef0d0', '#ffffff'], grass: '#3f8a9a', rock: '#5d7a90',
                pools: 0.33, pillars: 0.02, props: { tree: 0.015 }, weather: 'rain',
                ground: 'stone', walls: 'rock', mood: { warm: '#c0f0ff', cool: '#04203a', dark: 0.18 } },
    grass:    { name: 'Selva Esmeralda', floor: '#3a7a32', wall: '#4a6a36', liquid: 'swamp', liq: '#4f6b2a', foam: '#9ac25a', prop: 'tree',
                leaf: '#3f9a3a', trunk: '#5b3b22', flowers: ['#f4d65c', '#ff8ad8', '#ffffff'], grass: '#4caa3f', rock: '#6a7a5a',
                pools: 0.22, pillars: 0, props: { tree: 0.05, grass: 0.12 }, weather: null,
                ground: 'grass', walls: 'bush', mood: { warm: '#f0ffb0', cool: '#06281a', dark: 0.06 } },
    electric: { name: 'Central Voltio', floor: '#4a4840', wall: '#3a3a48', liquid: 'spark', liq: '#e8c020', foam: '#fff6c0', prop: 'crystal',
                leaf: '#ffd23f', trunk: '#5a5030', flowers: ['#ffe14d', '#ffffff', '#7fd0ff'], grass: '#8a8a40', rock: '#70707a',
                pools: 0.28, pillars: 0.04, props: { tree: 0.01 }, weather: 'rain',
                ground: 'metal', walls: 'rock', mood: { warm: '#fff4a0', cool: '#10102a', dark: 0.15 } },
    ice:      { name: 'Glaciar Eterno', floor: '#b8cfe0', wall: '#7f9fc0', liquid: 'ice', liq: '#9fd8f0', foam: '#ffffff', prop: 'crystal',
                leaf: '#bfe8ff', trunk: '#6f8fb0', flowers: ['#ffffff', '#9fe0ff', '#d8f1ff'], grass: '#9fc0d8', rock: '#8fa8c0',
                pools: 0.36, pillars: 0.02, props: { tree: 0.02 }, weather: 'snow',
                ground: 'snow', walls: 'rock', mood: { warm: '#ffffff', cool: '#1a3a6a', dark: 0 } },
    fighting: { name: 'Dojo Ancestral', floor: '#8a6a46', wall: '#5e4232', liquid: 'water', liq: '#4f8fd0', prop: 'tree',
                leaf: '#4f8a3a', trunk: '#5b3b22', flowers: ['#ff5f6d', '#f4d65c', '#ffffff'], grass: '#6a8a40', rock: '#8a7a6a',
                pools: 0, pillars: 0.075, props: { tree: 0.008 }, weather: null,
                ground: 'wood', walls: 'rock', mood: { warm: '#ffe0a0', cool: '#2a140a', dark: 0.05 } },
    poison:   { name: 'Ciénaga Tóxica', floor: '#46384f', wall: '#33263f', liquid: 'poison', liq: '#9a4fc0', foam: '#e0a6ff', prop: 'dead',
                leaf: '#5a4a6a', trunk: '#3a2f45', flowers: ['#c86bdc', '#8bd94a', '#e0a6ff'], grass: '#6a5a8a', rock: '#5a4f6a',
                pools: 0.31, pillars: 0.015, props: { tree: 0.02 }, weather: null,
                ground: 'stone', walls: 'rock', mood: { warm: '#e8b0ff', cool: '#140820', dark: 0.32 } },
    ground:   { name: 'Desierto Rojo', floor: '#b08a52', wall: '#8a5e34', liquid: 'swamp', liq: '#9a7a48', foam: '#d6b98a', prop: 'dead',
                leaf: '#8a6a40', trunk: '#6a4a2a', flowers: ['#e06a4a', '#f4d65c', '#ffffff'], grass: '#b0904a', rock: '#9a7a5a',
                pools: 0.25, pillars: 0.04, props: { tree: 0.01, rock: 0.015 }, weather: 'sand',
                ground: 'sand', walls: 'rock', mood: { warm: '#ffd890', cool: '#3a1a08', dark: 0 } },
    flying:   { name: 'Pico Celeste', floor: '#9fb8d8', wall: '#dfe8f4', liquid: 'water', liq: '#7fb8ff', prop: 'tree',
                leaf: '#e8f2ff', trunk: '#9aa8c0', flowers: ['#ffffff', '#ffe14d', '#bfe0ff'], grass: '#b8d0e8', rock: '#c0ccdc',
                pools: 0, pillars: 0.02, props: { tree: 0.025 }, weather: null,
                ground: 'snow', walls: 'rock', mood: { warm: '#ffffff', cool: '#20406a', dark: 0 } },
    psychic:  { name: 'Templo Mental', floor: '#5e4470', wall: '#3e2a55', liquid: 'water', liq: '#8a5ad0', prop: 'crystal',
                leaf: '#ff8ad8', trunk: '#5a3a7a', flowers: ['#ff8ad8', '#c9a6ff', '#ffffff'], grass: '#8a5a9a', rock: '#7a6a8a',
                pools: 0, pillars: 0.045, props: { tree: 0.02 }, weather: null,
                ground: 'stone', walls: 'rock', mood: { warm: '#ffc0f0', cool: '#180a30', dark: 0.2 } },
    bug:      { name: 'Bosque Colmena', floor: '#5a6a2a', wall: '#5e4a26', liquid: 'swamp', liq: '#6a7a2a', foam: '#c4d65a', prop: 'tree',
                leaf: '#8aaa30', trunk: '#5b3b22', flowers: ['#f4d65c', '#ffffff', '#c4d65a'], grass: '#8aaa30', rock: '#7a7a5a',
                pools: 0.2, pillars: 0, props: { tree: 0.04, grass: 0.12 }, weather: null,
                ground: 'grass', walls: 'bush', mood: { warm: '#fff0a0', cool: '#1a200a', dark: 0.08 } },
    rock:     { name: 'Cantera Antigua', floor: '#7a6a58', wall: '#55473a', liquid: 'water', liq: '#4f8fd0', prop: 'dead',
                leaf: '#6a5a4a', trunk: '#4a3e32', flowers: ['#c9b28a', '#ffffff', '#a89070'], grass: '#8a7a5a', rock: '#8a7a6a',
                pools: 0, pillars: 0.08, props: { rock: 0.03 }, weather: 'sand',
                ground: 'stone', walls: 'rock', mood: { warm: '#ffe0b0', cool: '#20140a', dark: 0 } },
    ghost:    { name: 'Cementerio Sombrío', floor: '#383447', wall: '#24202e', liquid: 'water', liq: '#3a3a6a', prop: 'dead',
                leaf: '#4a4060', trunk: '#2e2838', flowers: ['#9a8ad0', '#5fe0c0', '#c9cfdc'], grass: '#4a4a60', rock: '#5a5670',
                pools: 0, pillars: 0.03, props: { tree: 0.03 }, weather: 'fog',
                ground: 'stone', walls: 'rock', mood: { warm: '#c8c0ff', cool: '#08061a', dark: 0.5 } },
    dragon:   { name: 'Santuario Dragón', floor: '#363a5e', wall: '#24264a', liquid: 'lava', liq: '#7b5cff', foam: '#c9a6ff', prop: 'crystal',
                leaf: '#7b5cff', trunk: '#2a2a5a', flowers: ['#7b5cff', '#ffd23f', '#ffffff'], grass: '#4a4a8a', rock: '#5a5a8a',
                pools: 0.22, pillars: 0.04, props: { tree: 0.015 }, weather: null,
                ground: 'stone', walls: 'rock', mood: { warm: '#d8c8ff', cool: '#0a0628', dark: 0.32 } },
    dark:     { name: 'Callejón Oscuro', floor: '#2c282e', wall: '#1c181f', liquid: 'water', liq: '#2a2a3a', prop: 'dead',
                leaf: '#3a3040', trunk: '#241e28', flowers: ['#ff5f6d', '#6b5c52', '#9a8a9a'], grass: '#3a343a', rock: '#4a444a',
                pools: 0, pillars: 0.05, props: { tree: 0.02 }, weather: null,
                ground: 'stone', walls: 'rock', mood: { warm: '#ffd0c0', cool: '#06040a', dark: 0.52 } },
    steel:    { name: 'Fortaleza de Acero', floor: '#6d7888', wall: '#465060', liquid: 'water', liq: '#4f8fd0', prop: 'crystal',
                leaf: '#c9d2de', trunk: '#5d6773', flowers: ['#c9d2de', '#ffd23f', '#ffffff'], grass: '#8a96a6', rock: '#9aa6b5',
                pools: 0, pillars: 0.08, props: { tree: 0.01 }, weather: null,
                ground: 'metal', walls: 'rock', mood: { warm: '#f0f6ff', cool: '#0a1428', dark: 0.08 } },
    fairy:    { name: 'Bosque Encantado', floor: '#4f7f5a', wall: '#7a5a8a', liquid: 'water', liq: '#8fd8ff', foam: '#ffe0f4', prop: 'tree',
                leaf: '#e08ad0', trunk: '#6b4a5a', flowers: ['#ff8ad8', '#ffffff', '#c9a6ff'], grass: '#c48ad8', rock: '#9a8aa8',
                pools: 0.16, pillars: 0, props: { tree: 0.05, grass: 0.1 }, weather: null,
                ground: 'grass', walls: 'bush', mood: { warm: '#ffe0f8', cool: '#1a0a2a', dark: 0.06 } },
    // La arena de Arceus al minuto 30 (systems/judgment.js): ceniza, ruinas y
    // árboles muertos, con un claro donde aterriza (clear). No es de ninguna grieta.
    judgment: { name: 'Ruinas del Juicio', floor: '#4a4240', wall: '#2e2829', liquid: 'lava', liq: '#e8a82a', foam: '#fff1b8', prop: 'dead',
                leaf: '#3e3633', trunk: '#2a2321', flowers: ['#8a7f76', '#e8a82a', '#5a514c'], grass: '#5e544c', rock: '#6a625c',
                pools: 0, pillars: 0.03, props: { tree: 0.012, rock: 0.02 }, weather: null, clear: 4.5,
                ground: 'ash', walls: 'rock', mood: { warm: '#fff0b8', cool: '#1a1008', dark: 0.15 } }
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
    const bush = th.walls === 'bush';
    return {
      name: 'Grieta · ' + th.name, liquid: th.liquid, ground: th.ground || 'stone', walls: th.walls || 'rock', mood: th.mood,
      floor: [f, shade(f, 0.05), shade(f, -0.06)], dirt: [shade(f, -0.16), shade(f, -0.12), shade(f, -0.2)],
      speck: shade(f, -0.25), light: shade(f, 0.22), flowers: th.flowers,
      wallTop: [w, shade(w, 0.07), shade(w, -0.07)], wallLight: shade(w, 0.32), wallEdge: shade(bush ? th.leaf : w, -0.75),
      wallFace: [shade(w, -0.3), shade(w, -0.38)], wallFaceDark: shade(bush ? th.leaf : w, bush ? -0.8 : -0.55),
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
  /** Oscurece un color ya empaquetado (k = cuánto queda: 0..1) tirando un poco a azul (sombra). */
  function dimPacked(c, k) {
    const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
    return ((255 << 24) | (Math.min(255, b * k + 14) << 16) | ((g * k + 3) << 8) | (r * k)) >>> 0;
  }

  /** Lienzo de píxeles: set(x,y,color) y canvas() al final. */
  function Pix(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const buf = new Uint32Array(img.data.buffer);
    return {
      w, h, buf,
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

  /*
   * Bultos de los bordes de los arbustos (0..2 px que se come el borde), en
   * bucle de 32 px: 6 bultos redondos con algo de variación.
   */
  const BUMP = new Int8Array(32);
  for (let i = 0; i < 32; i++) {
    const v = 1 + Math.cos(i * 6 / 32 * Math.PI * 2) + (H(i, 3, 77) - 0.5) * 0.7;
    BUMP[i] = Math.max(0, Math.min(2, Math.round(v)));
  }

  /**
   * Campo suave (ruido de valor) con celdas de 2^bits px, continuo entre chunks:
   * se evalúa en una rejilla que cubre el chunk (y un píxel de borde) y se
   * interpola por píxel. f(gx, gy) en coordenadas globales de arte, 0..1.
   */
  function smoothField(gx0, gy0, W, bits, s) {
    const cell = 1 << bits, m = cell - 1;
    const cx0 = (gx0 - 1 - RAISE) >> bits, cy0 = (gy0 - 1 - RAISE) >> bits;
    const gw = ((gx0 + W) >> bits) - cx0 + 3;
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

  /*
   * Textura de hojas de 32×32 que encaja consigo misma (para la parte de arriba
   * de las paredes de arbustos): racimos redondos con luz arriba a la izquierda,
   * pintados de arriba abajo para que cada uno tape un poco al de detrás.
   */
  function leafTexture(B) {
    const L = ramp(B.leaf), out = new Uint32Array(32 * 32);
    const edge = pack(B.wallEdge);
    out.fill(L[0]);
    const clumps = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      clumps.push([i * 8 + (j & 1) * 4 + H(i, j, 11) * 3, j * 8 + H(i, j, 12) * 3, 4.6 + H(i, j, 13) * 1.4]);
    }
    clumps.sort((a, b) => a[1] - b[1]);
    for (const [cx, cy, r] of clumps) {
      for (let y = Math.floor(cy - r) - 1; y <= cy + r + 1; y++) for (let x = Math.floor(cx - r) - 1; x <= cx + r + 1; x++) {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        const lit = (-dx * 0.6 - dy * 0.8) / r;
        let idx = lit > 0.45 ? 3 : lit > 0 ? 2 : lit > -0.5 ? 1 : 0;
        if (d > 0.82 && lit < -0.1) idx = 0;
        const tex = H(x >> 1, (y + (x & 1)) >> 1, 14);
        if (tex > 0.86 && idx < 3 && lit > -0.2) idx++;
        let c = L[idx];
        if (d > 0.9 && dy > 0) c = edge;                    // contorno de abajo de cada racimo
        out[(y & 31) * 32 + (x & 31)] = c;
      }
    }
    return out;
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
      dirtEdge: mixPack(dt[0], B.speck, 0.55), dirtShade: mixPack(dt[0], B.speck, 0.25),
      crack: mixPack(wt[0], B.wallEdge, 0.55), wallRim: mixPack(wt[2], B.wallLight, 0.6),
      faceLight: mixPack(sortHex(B.wallFace)[1], B.wallTop[0], 0.45),
      flowerMid: B.flowers.map(h => pack(lum(h) > 175 ? '#c8742c' : '#fff1a8')),
      // Talud de la orilla de arriba del agua (se ve la tierra: el agua está más baja).
      bank: [mixPack(B.shore, '#000000', 0.35), pack(B.shore), mixPack(B.shore, dt[1], 0.45)],
      bankShadow: mixPack(B.liqDeep, '#000000', 0.25),
      // Arbustos: hojas, troncos y el hueco oscuro entre ellos.
      leaf: ramp(B.leaf), trunk: ramp(B.trunk), gap: pack(B.wallFaceDark),
      trunkDark: mixPack(sortHex(B.trunk)[0], B.wallFaceDark, 0.45),
      leafTex: B.walls === 'bush' ? leafTexture(B) : null,
      // Grietas / juntas del suelo de piedra, madera y metal.
      seam: mixPack(fl[0], '#000000', 0.32), seamLight: mixPack(fl[2], '#ffffff', 0.18),
      cinder: pack('#ff8a3d'), sparkle: pack('#ffffff')
    };
    palCache.set(bi, C);
    return C;
  }

  // ---------------- chunk de suelo ----------------

  /**
   * Máscara de tierra del chunk a resolución de píxel (con DOS filas de más por
   * arriba y una por abajo para ver los bordes). El ruido se evalúa cada 4 px y se
   * interpola: ~30 veces menos llamadas que evaluarlo píxel a píxel.
   */
  const MT = 2;                      // filas de más por arriba en la máscara
  function dirtMask(gx0, gy0, W, field, seed) {
    const S = 4, gw = W / S + 3;
    const grid = new Float32Array(gw * gw);
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++)
      grid[j * gw + i] = field(gx0 + (i - 1) * S, gy0 + (j - 1) * S);
    const mask = new Uint8Array(W * (W + MT + 1));
    // El temblor del borde va por bloques de 2×2 px: se calcula una vez por bloque.
    const jit = new Float32Array(W >> 1);
    for (let y = -MT; y <= W; y++) {
      if (y === -MT || !(y & 1)) for (let i = 0; i < W >> 1; i++) jit[i] = (H((gx0 >> 1) + i, (gy0 + y) >> 1, seed + 9) - 0.5) * 0.05;
      const fy = (y + S) / S, j = Math.floor(fy), v = fy - j;
      for (let x = 0; x < W; x++) {
        const fx = (x + S) / S, i = Math.floor(fx), u = fx - i;
        const a = grid[j * gw + i], b = grid[j * gw + i + 1];
        const c = grid[(j + 1) * gw + i], d = grid[(j + 1) * gw + i + 1];
        const val = (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v + jit[x >> 1];
        mask[(y + MT) * W + x] = val > 0.64 ? 1 : 0;
      }
    }
    // dirtAt(x, y) en coordenadas locales del chunk (y de -MT a W); .mask: fila y en (y+MT)·W.
    const dirtAt = (x, y) => mask[(y + MT) * W + x] === 1;
    dirtAt.mask = mask;
    return dirtAt;
  }

  /**
   * Pinta un chunk de n×n tiles. `at(tx,ty)` devuelve el tipo de terreno
   * global ('floor' | 'wall' | 'liquid'), así el autotiling ve más allá del
   * borde del chunk. Se hornea una vez (y otra al cambiar de bioma): nada de esto
   * cuesta por fotograma.
   *
   * ultra: las paredes no van en el suelo sino en .caps (una tira de CAP_H px por
   * fila con paredes; .capSlot[fila] = su hueco o -1) y el suelo lleva las sombras
   * que proyectan.
   */
  function paintChunk(cx, cy, n, at, dirtField, bi, seed = 0, ultra = false) {
    const P = Pix(n * T, n * T);
    const C = palette(bi), B = BIOMES[bi];
    const tx0 = cx * n, ty0 = cy * n, gx0 = tx0 * T, gy0 = ty0 * T, W = n * T;
    const dirtAt = dirtMask(gx0, gy0, W, dirtField, seed);
    const F = { tone: toneMap(gx0, gy0, W, seed), W, rock: null, crack: null, ultra };
    // Terreno del chunk con un tile de borde (para no preguntar a at() en cada píxel).
    const gw = n + 2, kinds = new Uint8Array(gw * gw);
    for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) {
      const k = at(tx0 + i, ty0 + j);
      kinds[(j + 1) * gw + i + 1] = k === 'wall' ? 1 : k === 'liquid' ? 2 : 0;
    }
    const kindAt = (i, j) => kinds[(j + 1) * gw + i + 1];
    let caps = null, capSlot = null;
    if (ultra) {
      capSlot = new Int8Array(n).fill(-1);
      let rows = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (kindAt(i, j) === 1) { capSlot[j] = rows++; break; }
      if (rows) caps = Pix(W, rows * CAP_H);
    }

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const tx = tx0 + i, ty = ty0 + j;
        const ox = i * T, oy = j * T;
        const kind = kindAt(i, j);

        // 1) Suelo bajo todo (las esquinas redondeadas de paredes y agua lo dejan ver).
        paintFloor(P, C, B, ox, oy, tx, ty, dirtAt, at, F, kind === 0);

        if (kind === 1) {
          if (!F.rock) { F.rock = smoothField(gx0, gy0, W, 2, seed + 43); F.crack = smoothField(gx0, gy0, W, 4, seed + 44); }
          if (ultra) paintWall(caps, C, B, ox, capSlot[j] * CAP_H, tx, ty, at, F, true);
          else paintWall(P, C, B, ox, oy, tx, ty, at, F, false);
        } else if (kind === 2) paintLiquid(P, C, ox, oy, tx, ty, at);
      }
    }
    if (ultra) castWallShadows(P, n, kindAt);
    const cv = P.canvas();
    if (ultra) { cv.caps = caps ? caps.canvas() : null; cv.capSlot = capSlot; }
    return cv;
  }

  /*
   * Ultra: sombra que proyectan las paredes (altas: T px de arte) sobre el suelo,
   * hacia abajo a la derecha. Un píxel está en sombra si yendo hacia el sol
   * (arriba a la izquierda) se topa con una pared antes de T·SUN px. Sólo mira
   * los tiles que tienen una pared al lado.
   */
  function castWallShadows(P, n, kindAt) {
    const W = n * T, buf = P.buf;
    const L = T * 0.6;                                   // largo de la sombra (en x; en y, la mitad)
    const wallPx = (x, y) => kindAt(Math.floor(x / T), Math.floor(y / T)) === 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (kindAt(i, j) === 1) {
        // Bajo la pared (se ve en las esquinas recortadas): oscuro.
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const o = (j * T + y) * W + i * T + x; buf[o] = dimPacked(buf[o], 0.5); }
        continue;
      }
      if (kindAt(i - 1, j) !== 1 && kindAt(i, j - 1) !== 1 && kindAt(i - 1, j - 1) !== 1) continue;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const px = i * T + x, py = j * T + y;
        let hit = 0;
        for (let s = 1; s <= 4 && !hit; s++) if (wallPx(px - L * s / 4, py - L * s / 8)) hit = s;
        if (!hit) continue;
        // Junto a la pared, más oscura (oclusión); al final de la sombra, tramada.
        if (hit === 4 && bay(px, py) < 0.5) continue;
        const o = py * W + px;
        buf[o] = dimPacked(buf[o], hit === 1 ? 0.58 : 0.68);
      }
    }
  }

  // Detalles del suelo: [dx, dy, color] (L luz, G hierba clara, D sombra, F flor,
  // M centro de la flor, R0..R2 piedra de oscura a clara).
  const TUFT = [[-1, -2, 'L'], [1, -2, 'L'], [0, -1, 'L'], [-1, -1, 'G'], [1, -1, 'G'], [-1, 0, 'D'], [0, 0, 'G'], [1, 0, 'D']];
  const FLOWER = [[0, -1, 'F'], [-1, 0, 'F'], [1, 0, 'F'], [0, 1, 'F'], [0, 0, 'M'], [1, 1, 'D'], [0, 2, 'D'], [-1, 1, 'D']];
  const PEBBLE = [[0, 0, 'R2'], [1, 0, 'R1'], [0, 1, 'R1'], [1, 1, 'R0'], [2, 1, 'D'], [1, 2, 'D']];
  const CRACK = [[0, 0, 'D'], [1, 1, 'D'], [2, 1, 'D'], [3, 2, 'D'], [1, 0, 'R1']];
  const CRACK2 = [[0, 0, 'D'], [1, 0, 'D'], [2, 1, 'D'], [2, 2, 'D'], [3, 3, 'D'], [1, 1, 'R1'], [3, 2, 'R1']];
  // Briznas de hierba del suelo (estilo de las rutas de DS): V, W y una sola.
  const BLADE_V = [[-1, -1, 'L'], [1, -1, 'L'], [-1, 0, 'G'], [0, 0, 'D'], [1, 0, 'G']];
  const BLADE_W = [[-2, -1, 'L'], [0, -2, 'L'], [2, -1, 'L'], [0, -1, 'G'], [-1, 0, 'D'], [1, 0, 'D']];
  const BLADE_1 = [[0, -1, 'L'], [0, 0, 'G'], [1, 0, 'D']];
  const SPARK = [[0, -1, 'S'], [-1, 0, 'S'], [0, 0, 'W'], [1, 0, 'S'], [0, 1, 'S']];
  const DIMPLE = [[0, 0, 'D'], [1, 0, 'D'], [2, 0, 'D'], [-1, -1, 'L'], [3, -1, 'L']];

  function stamp(P, shape, x, y, cols) {
    for (const [dx, dy, k] of shape) P.set(x + dx, y + dy, cols[k]);
  }

  // Ondas de la arena (tabla de senos en bucle de 64 px).
  const WAVE = new Float32Array(64);
  for (let i = 0; i < 64; i++) WAVE[i] = Math.sin(i / 64 * Math.PI * 2) * 2.2;

  function paintFloor(P, C, B, ox, oy, tx, ty, dirtAt, at, F, open) {
    let dirtCount = 0;
    const mask = dirtAt.mask, W = F.W, tone = F.tone, style = B.ground;
    const grassy = style === 'grass';
    for (let y = 0; y < T; y++) {
      const gy = ty * T + y, ly = oy + y, mrow = (ly + MT) * W;
      for (let x = 0; x < T; x++) {
        const gx = tx * T + x, lx = ox + x;
        const dirt = mask[mrow + lx] === 1;
        const pal = dirt ? C.dirt : C.floor;
        // Tono suave con tramado: manchas grandes que se funden, sin cuadros ni ruido de sal y pimienta.
        let v = tone[(ly >> 1) * (W >> 1) + (lx >> 1)] + (BAYER[((gy & 3) << 2) | (gx & 3)] - 0.5) * 0.11;
        if (!dirt) {
          if (style === 'wood') {
            // Tablas de 5 px de alto con juntas a tresbolillo; cada tabla, su tono.
            const row = Math.floor(gy / 5), seg = Math.floor((gx + H(row, 0, 61) * 24) / 24);
            v = 0.28 + H(row, seg, 62) * 0.5 + (BAYER[((gy & 3) << 2) | (gx & 3)] - 0.5) * 0.12;
          } else if (style === 'metal') {
            v = 0.3 + H(gx >> 4, gy >> 4, 63) * 0.42 + (BAYER[((gy & 3) << 2) | (gx & 3)] - 0.5) * 0.1;
          }
        }
        let col = v < 0.41 ? pal[0] : v > 0.6 ? pal[2] : pal[1];
        const r = H(gx, gy, 13);
        if (dirt) {
          dirtCount++;
          if (r < 0.03) col = pal[0];
          else if (r > 0.985) col = pal[2];
          // Bordes de la tierra: la hierba asoma por encima con bultos (como en
          // los caminos de los juegos), con su sombra debajo; borde con luz abajo.
          const up1 = mask[mrow - W + lx] === 1, up2 = mask[mrow - 2 * W + lx] === 1;
          const bump = grassy && BUMP[(gx + 3) & 31] > 0;
          if (!up1) col = bump ? C.floor[1] : C.dirtEdge;
          else if (!up2) col = bump ? C.dirtEdge : C.dirtShade;
          else if (mask[mrow + W + lx] !== 1) col = pal[2];
          else if (mask[mrow + lx - 1] !== 1 || mask[mrow + lx + 1] !== 1) col = pal[0];
        } else {
          if (style === 'wood') {
            if (gy % 5 === 0) col = C.seam;
            else if (gy % 5 === 1) col = C.seamLight;
            else if (Math.floor((gx + H(Math.floor(gy / 5), 0, 61) * 24) % 24) === 0) col = C.seam;
            else if (r < 0.02) col = C.speck;
          } else if (style === 'metal') {
            const mx = gx & 15, my = gy & 15;
            if (mx === 0 || my === 0) col = C.seam;
            else if (mx === 1 || my === 1) col = C.seamLight;
            else if ((mx === 3 || mx === 13) && (my === 3 || my === 13)) col = C.light;
            else if ((mx === 4 || mx === 14) && (my === 4 || my === 14)) col = C.seam;
            else if (r < 0.01) col = C.speck;
          } else if (style === 'sand') {
            // Ondas de arena: líneas onduladas con luz arriba y sombra abajo.
            const w = ((gy + WAVE[(gx + (H(gx >> 6, 0, 64) * 64 | 0)) & 63]) % 9 + 9) % 9;
            const on = H((gx + 3) >> 3, Math.floor((gy + 4) / 9), 65) < 0.62;     // a trozos, no rayas enteras
            if (on && w < 1) col = C.light;
            else if (on && w < 2) col = pal[0];
            else if (r < 0.008) col = C.speck;
          } else {
            // (Pocas motas sueltas: el suelo de los juegos de DS es más limpio.)
            if (r < 0.006) col = C.speck;
            else if (r > 0.997) col = C.light;
          }
          // La hierba asoma sobre la tierra que queda arriba: un borde con luz.
          if (mask[mrow - W + lx] === 1) col = r < 0.75 ? C.light : C.floor[2];
        }
        P.set(lx, ly, col);
      }
    }
    if (!open) return;

    // Sombra de contacto de las paredes que hay al norte y al oeste (la luz viene
    // de arriba a la izquierda). En Ultra la pone castWallShadows, más larga.
    const wn = at(tx, ty - 1) === 'wall', ww = at(tx - 1, ty) === 'wall';
    if (!F.ultra) {
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
    }

    // Detalles: matojo, flor, piedrecita, briznas...
    const cols = { L: C.light, G: C.floor[2], D: C.speck, F: 0, M: 0, R0: C.rock[0], R1: C.rock[1], R2: C.rock[2], S: C.light, W: C.sparkle };
    const d = H(tx, ty, 14);
    const dx = ox + 3 + Math.floor(H(tx, ty, 15) * 10), dy = oy + 4 + Math.floor(H(tx, ty, 16) * 9);
    const lo = wn ? 3 : 0;                 // no pintar sobre la sombra de la pared
    if (dirtCount > T * T / 2 || dirtAt(dx, dy)) {
      cols.D = C.dirt[0];
      if (dy - oy > lo + 1) {
        if (d < 0.12) stamp(P, PEBBLE, dx, dy, cols);
        else if (d < 0.2) { cols.R1 = C.dirt[2]; stamp(P, CRACK, dx - 1, dy, cols); }
      }
      return;
    }
    if (grassy) {
      // Briznas repartidas en los cuatro cuartos del tile (textura de hierba de las rutas).
      for (let q = 0; q < 4; q++) {
        const hq = H(tx * 2 + (q & 1), ty * 2 + (q >> 1), 22);
        if (hq > 0.5) continue;
        const bx = ox + (q & 1) * 8 + 2 + Math.floor(H(tx, ty, 23 + q) * 5), by = oy + (q >> 1) * 8 + 3 + Math.floor(H(tx, ty, 27 + q) * 5);
        if (by - oy <= lo + 1 || dirtAt(bx, by)) continue;
        stamp(P, hq < 0.2 ? BLADE_V : hq < 0.38 ? BLADE_W : BLADE_1, bx, by, cols);
      }
      if (dy - oy > lo + 2) {
        if (d < 0.1) stamp(P, TUFT, dx, dy, cols);
        else if (d < 0.19) {
          const f = Math.floor(H(tx, ty, 17) * C.flowers.length);
          cols.F = C.flowers[f]; cols.M = C.flowerMid[f];
          stamp(P, FLOWER, dx, dy - 1, cols);
          if (H(tx, ty, 21) < 0.45) stamp(P, FLOWER, dx + 3, dy + 1, cols);   // a veces, dos o tres juntas
          if (H(tx, ty, 24) < 0.2) stamp(P, FLOWER, dx - 3, dy + 2, cols);
        } else if (d < 0.23) stamp(P, PEBBLE, dx, dy, cols);
      }
      return;
    }
    if (dy - oy <= lo + 2) return;
    if (style === 'snow') {
      cols.D = C.floor[0];
      if (d < 0.22) stamp(P, SPARK, dx, dy, cols);
      else if (d < 0.36) stamp(P, DIMPLE, dx - 1, dy, cols);
      else if (d < 0.4) stamp(P, PEBBLE, dx, dy, cols);
    } else if (style === 'sand') {
      if (d < 0.08) stamp(P, PEBBLE, dx, dy, cols);
      else if (d < 0.13) { const f = Math.floor(H(tx, ty, 17) * C.flowers.length); cols.F = C.flowers[f]; cols.M = C.flowerMid[f]; stamp(P, FLOWER, dx, dy, cols); }
    } else if (style === 'wood' || style === 'metal') {
      if (d < 0.05) stamp(P, PEBBLE, dx, dy, cols);
    } else {
      // Piedra y ceniza: grietas, piedrecitas y (en la ceniza) brasas.
      cols.R1 = C.floor[2];
      if (d < 0.14) stamp(P, CRACK, dx - 1, dy, cols);
      else if (d < 0.24) stamp(P, CRACK2, dx - 1, dy - 1, cols);
      else if (d < 0.34) { cols.R1 = C.rock[1]; stamp(P, PEBBLE, dx, dy, cols); }
      else if (d < 0.4) { const f = Math.floor(H(tx, ty, 17) * C.flowers.length); cols.F = C.flowers[f]; cols.M = C.flowerMid[f]; stamp(P, FLOWER, dx, dy, cols); }
      if (style === 'ash' && H(tx, ty, 25) < 0.18) {
        const ex = ox + 2 + Math.floor(H(tx, ty, 26) * 12), ey = oy + 3 + Math.floor(H(tx, ty, 27) * 12);
        P.set(ex, ey, C.cinder);
      }
    }
  }

  /*
   * Pared. ultra: la tira de su fila (CAP_H px de alto, la de arriba RAISE px por
   * encima del tile) con la cara el doble de alta. Sin pared al sur hay cara frontal.
   */
  function paintWall(P, C, B, ox, oy, tx, ty, at, F, ultra) {
    const W = (x, y) => at(x, y) === 'wall';
    const n = W(tx, ty - 1), s = W(tx, ty + 1), w = W(tx - 1, ty), e = W(tx + 1, ty);
    const rows = ultra && !s ? CAP_H : T;
    const FACE = s ? 0 : ultra ? T : 8;     // filas de cara frontal visibles
    const gy0 = ty * T - (ultra ? RAISE : 0);
    if (B.walls === 'bush') return paintBush(P, C, ox, oy, tx, gy0, rows, FACE, n, s, w, e);
    const top = C.wallTop, face = C.wallFace;

    for (let y = 0; y < rows; y++) {
      const gy = gy0 + y;
      for (let x = 0; x < T; x++) {
        // Esquinas redondeadas exteriores: dejan ver el suelo.
        if (!n && !w && x + y < 3) continue;
        if (!n && !e && (T - 1 - x) + y < 3) continue;
        if (!s && !w && x + (rows - 1 - y) < 2) continue;
        if (!s && !e && (T - 1 - x) + (rows - 1 - y) < 2) continue;

        const gx = tx * T + x;
        let col;
        if (y >= rows - FACE) {
          // Cara frontal: borde en sombra, estratos verticales con luz a la izquierda y base oscura.
          const fy = y - (rows - FACE);
          const cut = H(gx, 0, 21) < 0.3, after = H(gx - 1, 0, 21) < 0.3;
          col = cut ? face[0] : after ? C.faceLight : face[1];
          if (fy === 0) col = C.wallEdge;
          else if (fy === 1) col = cut ? C.wallFaceDark : face[0];
          else if (y === rows - 1) col = C.wallFaceDark;
          else if ((fy === 3 || fy === 10) && H(gx >> 2, ty + fy, 26) < 0.35) col = face[0];   // grietas horizontales
          else if (H(gx, gy, 22) < 0.06) col = C.wallFaceDark;
          else if (ultra && y >= rows - 3 && bay(gx, gy) < 0.5) col = C.wallFaceDark;        // pie de la pared, en sombra
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
          const edgeY = rows - FACE - 1;
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

  /*
   * Pared de arbustos (bosques, como en Mundo Misterioso): arriba, copas de hojas
   * apretadas con el borde a bultos; delante, el borde de las copas colgando y los
   * troncos en la sombra.
   */
  function paintBush(P, C, ox, oy, tx, gy0, rows, FACE, n, s, w, e) {
    const L = C.leaf, tex = C.leafTex, Tr = C.trunk;
    for (let y = 0; y < rows; y++) {
      const gy = gy0 + y;
      const bw = w ? -9 : BUMP[(gy + 7) & 31], be = e ? -9 : BUMP[(gy + 19) & 31];
      for (let x = 0; x < T; x++) {
        const gx = tx * T + x;
        const bn = n ? -9 : BUMP[gx & 31];
        if (y < bn || x < bw || T - 1 - x < be) continue;
        if (!n && !w && x + y < 3) continue;
        if (!n && !e && (T - 1 - x) + y < 3) continue;
        let col;
        if (y >= rows - FACE) {
          const fy = y - (rows - FACE);
          const lip = 2 + BUMP[(gx + 5) & 31];         // las copas cuelgan 2..4 px sobre los troncos
          if (fy < lip - 1) col = fy === 0 ? L[1] : L[0];
          else if (fy === lip - 1) col = C.wallEdge;
          else {
            // Troncos de 2 px cada 5-6, con luz a la izquierda; entre ellos, oscuridad.
            const k = (gx + Math.floor(H(gx >> 3, 1, 57) * 3)) % 6;
            const bottom = y === rows - 1;
            if (k === 1) col = Tr[1];
            else if (k === 2) col = C.trunkDark;
            else col = C.gap;
            if (fy === lip && k > 0 && k < 3) col = C.trunkDark;     // sombra de las copas en el tronco
            if (bottom) col = k === 0 || k === 3 ? C.trunkDark : C.wallEdge;
          }
          if (!w && x === bw && fy >= lip) col = C.wallEdge;
          if (!e && T - 1 - x === be && fy >= lip) col = C.wallEdge;
        } else {
          col = tex[(gy & 31) * 32 + (gx & 31)];
          if (!n && y === bn) col = C.wallEdge;
          else if (!n && y === bn + 1) col = L[3];
          if (!w && x === bw) col = C.wallEdge;
          else if (!w && x === bw + 1 && col !== C.wallEdge) col = L[2];
          if (!e && T - 1 - x === be) col = C.wallEdge;
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
        // Orilla de arriba: el agua está más baja que el suelo y se ve el talud
        // de tierra (dos filas) y su sombra en el agua.
        const dn = n ? BIG : y;
        if (dn <= d + 0.6 && dn < 4) {
          col = dn < 1 ? C.bank[2] : dn < 2 ? C.bank[H(gx, 0, 38) < 0.3 ? 0 : 1] : dn < 3 ? C.bank[0] : C.bankShadow;
        } else if (d < 1) col = C.shore;                                       // labio de tierra mojada
        else if (d < 2) col = H(gx, gy, 36) < 0.2 ? C.liqLight : C.foam; // espuma, a trozos
        else {
          // De somero a hondo con tramado (sin el ruido de antes).
          const k = (d - 2) / 5 + (bay(gx, gy) - 0.5) * 0.4;
          col = k < 0.3 ? C.liqLight : k < 0.78 ? C.liq : C.liqDeep;
        }
        if (d >= 3.5 && dn >= 4) {
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
   *   grass     aspecto*3 + estado (0 quieta · 1 viento · 2 la pisan); +9 en Ultra (con su sombra)
   *   altar     efecto*2 + (usado ? 1 : 0)      spring  1 = seco
   *   trap      tipo*4 + fotograma (0..3)
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

  /*
   * Ultra: sombra proyectada de un objeto (su silueta tumbada en el suelo hacia
   * abajo a la derecha, SUN_X/SUN_Y px por px de altura). Se guarda con .dy, la
   * fila del sprite donde empieza (la base del objeto).
   */
  const castCache = new Map();
  function castShadow(bi, type, variant = 0) {
    const k = bi + '/' + type + '/' + variant;
    let cv = castCache.get(k);
    if (cv) return cv;
    const src = propSprite(bi, type, variant);
    const w = src.width, h = src.height;
    const px = new Uint32Array(src.getContext('2d').getImageData(0, 0, w, h).data.buffer);
    let b = h - 1;
    while (b > 0 && !px.subarray(b * w, b * w + w).some(v => v >>> 24)) b--;
    const ext = Math.ceil(b * SUN_X) + 2, down = Math.ceil(b * SUN_Y) + 3;
    const P = Pix(w + ext, down);
    const out = pack('#06101e', 88), core = pack('#06101e', 120);
    for (let y = 0; y <= b; y++) for (let x = 0; x < w; x++) {
      if (!(px[y * w + x] >>> 24)) continue;
      const z = b - y;
      P.set(x + Math.round(z * SUN_X), 1 + Math.round(z * SUN_Y), z < 3 ? core : out);
    }
    cv = P.canvas();
    cv.dy = b - 1;
    castCache.set(k, cv);
    return cv;
  }

  /*
   * Un sprite con su sombra proyectada debajo, en la misma imagen. Crece hacia la
   * derecha y hacia abajo: .padR y .padB dicen cuánto (world.js lo descuenta al
   * colocarlo).
   */
  function withCastShadow(src) {
    const w = src.width, h = src.height, b = h - 1;
    const px = new Uint32Array(src.getContext('2d').getImageData(0, 0, w, h).data.buffer);
    const padR = Math.ceil(b * SUN_X), padB = Math.ceil(b * SUN_Y);
    const P = Pix(w + padR, h + padB);
    const sh = pack('#06101e', 84);
    for (let y = 0; y <= b; y++) for (let x = 0; x < w; x++) {
      if (!(px[y * w + x] >>> 24)) continue;
      const z = b - y;
      P.set(x + Math.round(z * SUN_X), b + Math.round(z * SUN_Y), sh);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = px[y * w + x]; if (c >>> 24) P.set(x, y, c); }
    const cv = P.canvas();
    cv.padR = padR; cv.padB = padB;
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

  // Copas: racimos [x, y, radio]. 0 redondo · 2 ancho (el 1 es el pino).
  const TREE_SHAPES = [
    [[15, 20, 10], [9, 16, 7], [21, 16, 7], [15, 10, 8], [10, 23, 6], [20, 23, 6]],
    null,
    [[15, 21, 9], [7, 19, 7], [23, 19, 7], [11, 13, 7], [19, 13, 7], [15, 24, 7]]
  ];

  const PAINT = {
    tree(B, variant = 0) {
      if (B.prop === 'crystal') return PAINT.crystal(B, variant);
      if (B.prop === 'dead') return PAINT.deadtree(B, variant);
      const look = variant % 3;
      if (look === 1) return PAINT.pine(B);
      const P = Pix(30, 40);
      const L = ramp(B.leaf), Tr = ramp(B.trunk);
      const bark = mixPack(sortHex(B.trunk)[0], '#000000', 0.35);
      const hi = mixPack(sortHex(B.leaf)[3], '#ffffff', 0.35);
      // Tronco con raíces, corteza y la sombra de la copa encima.
      const t0 = 26;
      for (let y = t0; y < 38; y++) for (let x = 13; x < 18; x++) {
        let c = x === 13 ? Tr[0] : x === 17 ? bark : x === 14 ? Tr[1] : Tr[x === 16 ? 0 : 1];
        if (x === 15 && H(x, y, 43 + look) < 0.3) c = Tr[0];
        if (y < t0 + 3) c = bark;
        P.set(x, y, c);
      }
      [[12, 37], [18, 37], [11, 38], [12, 38], [18, 38], [19, 38]].forEach(([x, y]) => P.set(x, y, x < 15 ? Tr[0] : bark));
      // Copa: racimos con luz de arriba a la izquierda, escamas de hojas y el
      // borde de abajo de cada racimo en sombra (como las copas de Mundo Misterioso).
      for (const [bx, by, br] of TREE_SHAPES[look]) {
        disc(P, bx, by, br, (x, y, d) => {
          const lit = ((x - bx) * -0.6 + (y - by) * -0.8) / br;
          let idx = lit > 0.5 ? 3 : lit > 0.05 ? 2 : lit > -0.45 ? 1 : 0;
          // Escamas: arquitos de luz cada 4 px (hojas).
          const sx = (x + ((y >> 2) & 1) * 2) & 3, sy = y & 3;
          if (sy === 0 && sx < 2 && idx < 3 && lit > -0.35) idx++;
          else if (sy === 1 && sx === 3 && idx > 0) idx--;
          if (d > 0.86 && lit < -0.2) idx = 0;
          if (d > 0.7 && lit > 0.55 && H(x, y, 44 + look) < 0.5) return hi;
          return L[idx];
        });
      }
      outline(P, pack(shade(sortHex(B.leaf)[0], -0.6)));
      return P.canvas();
    },

    /** Pino de pisos (como los árboles de las rutas de Sinnoh, dibujo propio). */
    pine(B) {
      const P = Pix(28, 44);
      const L = ramp(B.leaf), Tr = ramp(B.trunk);
      const bark = mixPack(sortHex(B.trunk)[0], '#000000', 0.35);
      const hi = mixPack(sortHex(B.leaf)[3], '#ffffff', 0.3);
      for (let y = 36; y < 42; y++) for (let x = 12; x < 16; x++) P.set(x, y, x === 12 ? Tr[1] : x === 15 ? bark : Tr[0]);
      [[11, 41], [16, 41]].forEach(([x, y]) => P.set(x, y, Tr[0]));
      // Pisos: [y de la punta, y de la base, medio ancho de la base]. Se pintan de
      // abajo arriba: la falda de cada piso tapa el de debajo y le deja sombra.
      const tiers = [[1, 13, 6], [7, 22, 9], [14, 31, 11.5], [22, 38, 13]];
      const edge = pack(shade(sortHex(B.leaf)[0], -0.6));
      for (let ti = tiers.length - 1; ti >= 0; ti--) {
        const [y0, y1, hw] = tiers[ti];
        for (let y = y0; y <= y1; y++) {
          const t = (y - y0) / (y1 - y0);
          const half = 1 + (hw - 1) * t;
          for (let x = Math.floor(13.5 - half); x <= Math.ceil(13.5 + half); x++) {
            const u = (x - 13.5) / half;                    // -1 izquierda .. 1 derecha
            if (Math.abs(u) > 1) continue;
            // Borde de abajo en dientes de sierra (las ramas).
            const zig = (x + ti) % 3;
            if (y === y1 && zig !== 1) continue;
            let idx = u < -0.45 ? 3 : u < 0.05 ? 2 : u < 0.55 ? 1 : 0;
            if (y >= y1 - 1) idx = Math.max(0, idx - 1);
            if (t > 0.25 && ((x * 2 + y) % 5 === 0) && idx > 0 && idx < 3) idx++;
            P.set(x, y, idx === 3 && H(x, y, 45) < 0.35 ? hi : L[idx]);
          }
        }
        // Sombra de la falda sobre el piso de abajo (y un contorno que los separa).
        if (ti < tiers.length - 1) {
          const half = hw;
          for (let x = Math.floor(13.5 - half); x <= Math.ceil(13.5 + half); x++) {
            const yb = y1 + ((x + ti) % 3 === 1 ? 1 : 0);
            if (P.get(x, yb) >>> 24) P.set(x, yb, edge);
            if (P.get(x, yb + 1) >>> 24) P.set(x, yb + 1, L[0]);
          }
        }
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
      const deep = mixPack(sortHex(B.rock)[0], '#000000', 0.3);
      // Peñasco (o un peñasco y una piedra al lado): base plana, luz arriba a la
      // izquierda, cara de abajo en sombra (se nota el volumen) y vetas.
      const blobs = look ? [[8.5, 9.5, 7.5, 6.5], [16.5, 11.5, 4.5, 4]] : [[10.5, 9.5, 9.5, 7]];
      for (const [bx, by, rx, ry] of blobs) {
        for (let y = 1; y <= 15; y++) for (let x = 0; x <= 21; x++) {
          const nx = (x - bx) / rx, ny = (y - by) / ry;
          const d = nx * nx + ny * ny + (H(x, y, 61 + look) - 0.5) * 0.08;
          if (d > 1 || y > 15) continue;
          const lit = -nx * 0.55 - ny * 0.85 + (H(x >> 1, y >> 1, 62 + look) - 0.5) * 0.3;
          let c = R[lit > 0.45 ? 2 : lit > -0.15 ? 1 : 0];
          if (ny > 0.55 && lit < 0) c = deep;                                  // cara de abajo
          if (y >= 14) c = deep;
          if (mossy && ny < -0.35 && H(x, y >> 1, 63) < 0.55) c = moss[lit > 0.3 ? 2 : 1];
          P.set(x, y, c);
        }
        // Brillo y una arista (sólo sobre la piedra).
        const on = (x, y, c) => { if (P.get(x, y) >>> 24) P.set(x, y, c); };
        const hx = Math.round(bx - rx * 0.45), hy = Math.round(by - ry * 0.55);
        on(hx, hy, shine); on(hx + 1, hy, shine); on(hx, hy + 1, R[2]); on(hx - 1, hy + 1, shine);
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

    /*
     * Hierba alta como la de los juegos de Pokémon (dibujo propio): matas de tres
     * puntas en dos filas (la de delante tapa la base de la de detrás), oscuras
     * abajo y con las puntas claras. Ocupa el ancho del tile y un poco más, así
     * varias seguidas forman un campo. Estado: 0 quieta · 1 viento · 2 la pisan.
     */
    grass(B, variant = 0) {
      // Ultra (variantes 9..17): la misma mata con su sombra proyectada ya pintada
      // debajo (así no cuesta un dibujo más por mata).
      if (variant >= 9) return withCastShadow(PAINT.grass(B, variant - 9));
      const P = Pix(20, 17);
      const Gc = ramp(B.grass);
      const out = pack(shade(sortHex(B.grass)[0], -0.62));
      const tip = mixPack(sortHex(B.grass)[2], '#ffffff', 0.25);
      const look = Math.floor(variant / 3) % 3, st = variant % 3;
      const wind = st === 1 ? 0.45 : 0, open = st === 2 ? 1.2 : 0;
      // Una mata: tres hojas (la del centro, más alta) que se afilan hasta la punta,
      // claras a la izquierda y oscuras abajo, con UN contorno alrededor de toda la
      // mata (así cada mata se lee entera y tapa la base de la de detrás).
      // Viento: las hojas se doblan a la derecha; pisada: se abren y se aplastan.
      const tuft = (bx, by, h) => {
        const px = new Map();
        const blade = (cx0, hh, lean, k) => {
          for (let i = 0; i < hh; i++) {
            const t = i / (hh - 1), cx = cx0 + lean * t * t * 2.4;
            const half = 2.1 * (1 - t) + 0.35;
            for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
              const right = x > cx + 0.3;
              const c = t > 0.66 ? (right ? Gc[2] : tip) : t > 0.28 ? (right ? Gc[k] : Gc[2]) : (right ? Gc[0] : Gc[1]);
              px.set(x + ',' + (by - i), c);
            }
          }
        };
        blade(bx - 2.6, h - 3, -0.8 - open + wind, 1);
        blade(bx + 2.6, h - 3, 0.8 + open + wind, 1);
        blade(bx, h - (st === 2 ? 2 : 0), wind * 1.2, 1);
        for (const [k, c] of px) {
          const [x, y] = k.split(',').map(Number);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) if (!px.has((x + dx) + ',' + (y + dy))) P.set(x + dx, y + dy, out);
        }
        for (const [k, c] of px) { const [x, y] = k.split(',').map(Number); P.set(x, y, c); }
      };
      const jig = [0, 1, -1][look];
      [[2.5 + jig, 10, 8], [10 - jig, 9, 9], [17.5 + jig, 10, 8]].forEach(([x, y, h]) => tuft(x, y, h));
      [[6 - jig, 16, 9 + (look === 1 ? 1 : 0)], [14 + jig, 16, 9 - (look === 2 ? 1 : 0)]].forEach(([x, y, h]) => tuft(x, y, h));
      outline(P, out);
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

    /*
     * Trampa de Mundo Misterioso pintada en el suelo, sin recuadro: 0 charco de
     * veneno que burbujea · 1 charco de baba pegajosa · 2 baldosa agrietada cuyas
     * grietas brillan (explota). variante = tipo*4 + fotograma (0..3, world.js
     * los pasa a 5 por segundo). Se ve bien que es una trampa (brilla, burbujea)
     * pero parece parte del suelo.
     */
    trap(B, variant) {
      const kind = (variant >> 2) % 3, f = variant & 3;
      const P = Pix(24, 16);
      const cx = 11.5, cy = 7.5;
      const stain = pack('#000000', 46);
      if (kind === 2) return crackedTrap(P, B, f, cx, cy);
      const pal = kind === 0
        ? ['#3a1748', '#6e2b8a', '#9b48bb', '#d9a0ee']
        : ['#2c5a18', '#5aa232', '#86cf52', '#e2ffbe'];
      const [rim, body, mid, hi] = pal.map(h => pack(h));
      // Forma: un charco (veneno) o tres gotas unidas (baba), que «respiran».
      const breathe = [0, 0.03, 0.06, 0.03][f];
      const blobs = kind === 0 ? [[cx, cy, 9.6, 5.6]]
        : [[cx + 1, cy + 0.5, 7.2, 4.4], [cx - 5.5, cy - 1.2, 4.2, 3.4], [cx + 6.5, cy + 2.4, 3.4, 2.6], [cx - 2, cy + 3.2, 3.2, 2.4]];
      const field = (x, y) => {
        let best = 9;
        for (const [bx, by, rx, ry] of blobs) {
          const q = ((x - bx) / (rx * (1 + breathe))) ** 2 + ((y - by) / (ry * (1 + breathe))) ** 2;
          if (q < best) best = q;
        }
        return best + (H(x >> 1, y >> 1, 81 + kind) - 0.5) * (kind ? 0.34 : 0.18);
      };
      for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) {
        const d = field(x, y);
        if (d > 1.3) continue;
        if (d > 1) { P.set(x, y, stain); continue; }                    // suelo manchado alrededor
        const lit = -(x - cx) * 0.06 - (y - cy) * 0.14;
        let c = d > 0.78 ? rim : lit > 0.25 ? mid : body;
        if (d > 0.55 && d <= 0.78 && y > cy) c = rim;                      // borde de abajo, más hondo
        P.set(x, y, c);
      }
      // Brillo (la baba, más brillante y alargado).
      const gl = kind === 0 ? [[7, 4], [8, 4]] : [[6, 5], [7, 4], [8, 4], [9, 4], [5, 6]];
      gl.forEach(([x, y]) => P.set(x + (f === 2 ? 1 : 0), y, hi));
      if (kind === 0) {
        // Burbujas que salen, crecen y revientan (cada una, desfasada).
        [[8, 8], [14, 6], [12, 10], [17, 9]].forEach(([x, y], i) => {
          const s = (i + f) & 3;
          if (s === 1) P.set(x, y, mid);
          else if (s === 2) { P.set(x, y, hi); P.set(x + 1, y, mid); P.set(x, y + 1, mid); P.set(x + 1, y + 1, rim); }
          else if (s === 3) { P.set(x - 1, y, hi); P.set(x + 1, y, hi); P.set(x, y - 1, hi); P.set(x, y + 1, hi); }
        });
      } else {
        // Hilos y gotas de baba alrededor.
        [[1, 9], [22, 6], [3, 3]].forEach(([x, y], i) => { P.set(x, y, (i + f) & 1 ? mid : body); P.set(x, y + 1, rim); });
        P.set(16, 4 + (f & 1), hi);
      }
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

  /*
   * Trampa explosiva: un trozo de suelo hundido y roto en losas (del color del
   * bioma) con grietas que brillan como brasas, latiendo, y una runa en el centro.
   */
  const GLOW = ['#5a1a0c', '#b8441a', '#ff8a2a', '#ffd46a'];
  function crackedTrap(P, B, f, cx, cy) {
    const Fl = sortHex(B.floor).map(h => pack(shade(h, -0.24)));       // losas hundidas: más oscuras que el suelo
    const deep = pack(shade(sortHex(B.floor)[0], -0.62)), lip = pack(shade(sortHex(B.floor)[2], 0.22));
    const lvl = [1, 2, 3, 2][f];
    const G = GLOW.map(h => pack(h)), warm = mixPack(sortHex(B.floor)[1], '#ff8a2a', 0.28);
    const RX = 10, RY = 6.4;
    const inside = (x, y) => ((x - cx) / RX) ** 2 + ((y - cy) / RY) ** 2;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) {
      const d = inside(x, y) + (H(x >> 1, y >> 1, 85) - 0.5) * 0.12;
      if (d > 1) continue;
      // Losas: luz arriba a la izquierda dentro de cada una (celdas de 5×4).
      const lx = (x + (y >> 2 & 1) * 2) % 5, ly = y & 3;
      let c = lx === 0 || ly === 0 ? Fl[2] : lx === 4 || ly === 3 ? Fl[0] : Fl[1];
      if (d > 0.8) c = y < cy + 1 ? deep : lip;              // borde: se ve que está hundida
      P.set(x, y, c);
    }
    // Contorno oscuro fino alrededor (el corte del suelo).
    const ring = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) {
      if (P.get(x, y) >>> 24) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => x + a >= 0 && x + a < 24 && y + b >= 0 && y + b < 16 && (P.get(x + a, y + b) >>> 24))) ring.push([x, y]);
    }
    for (const [x, y] of ring) P.set(x, y, pack('#000000', 70));
    // Grietas desde el centro (6 rayos con temblor) que brillan.
    const crackPx = [];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + H(i, 2, 86) * 0.6;
      let x = cx, y = cy;
      for (let k = 0; k < 14; k++) {
        x += Math.cos(a) * 0.9 + (H(i, k, 87) - 0.5) * 0.9;
        y += Math.sin(a) * 0.6 + (H(i, k, 88) - 0.5) * 0.6;
        if (inside(x, y) > 0.86) break;
        crackPx.push([Math.round(x), Math.round(y), k]);
      }
    }
    for (const [x, y, k] of crackPx) {
      if (lvl >= 2) { P.set(x + 1, y, warm); P.set(x, y + 1, warm); }
      P.set(x, y, G[Math.max(0, lvl - (k > 8 ? 1 : 0))]);
    }
    // Runa del centro: un aro que brilla con el latido.
    for (let a = 0; a < 12; a++) {
      const x = Math.round(cx + Math.cos(a / 12 * Math.PI * 2) * 2.6), y = Math.round(cy + Math.sin(a / 12 * Math.PI * 2) * 1.8);
      P.set(x, y, G[lvl]);
    }
    P.set(Math.round(cx), Math.round(cy), G[Math.min(3, lvl + 1)]);
    return P.canvas();
  }

  function clearProps() { propCache.clear(); castCache.clear(); }

  return { T, RAISE, CAP_H, BIOMES, NORMAL, ARENA, ARENA_THEMES, ARENA_TYPES, paintChunk, propSprite, shadow, castShadow, clearProps,
           /** Índice de bioma de la arena de un tipo. */
           arenaBiome: type => ARENA + Math.max(0, ARENA_TYPES.indexOf(type)) };
})();
