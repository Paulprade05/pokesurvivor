/* ============ tiles.js — pixel art del mundo, pintado en código ============
 * Todo se pinta a resolución de ARTE (16 px por tile) escribiendo en un
 * ImageData, y luego se dibuja escalado ×G.Sprites.PX sin suavizado. Así los
 * tiles comparten tamaño de píxel con los sprites de Mundo Misterioso.
 *
 * Autotiling: cada tile mira a sus 8 vecinos al pintarse (bordes de pared,
 * cara frontal, esquinas redondeadas, espuma de la orilla...).
 *
 * Estilo «Pokémon Platino» (27-10-2026; antes, 26-10, más Mundo Misterioso):
 *   - suelo limpio, de colores vivos, con un dibujo que se repite por tile (las
 *     «w» de hierba de las rutas, losas, ondas de arena...): se nota la cuadrícula
 *     como en los juegos de DS y no hay ruido de puntos ni tramados;
 *   - caminos hechos de tiles con las esquinas redondeadas y el borde limpio;
 *   - bosques de coníferas redondeadas en filas apretadas (paredes 'bush'): cada
 *     fila tapa la falda de la de detrás, con contorno marcado;
 *   - acantilados de roca con estratos (paredes 'rock');
 *   - agua con su orilla clara y ondas «~»;
 *   - hierba alta en un tile que se repite (dos filas de matas con las puntas
 *     claras) que forma campos sin huecos;
 *   - sombras suaves y redondas debajo de los objetos.
 * Todo es dibujo propio en código: nada copiado ni sacado de los juegos.
 *
 * Modo Ultra (2,5D, G.Settings 'ultra'): la cámara inclinada con perspectiva va en
 * game.js (D3). Aquí, las paredes se levantan (RAISE px de arte más altas, la cara
 * el doble) y se pintan aparte en tiras por fila (caps) para ordenarse por Y con
 * los Pokémon (world.js).
 */
G.Tiles = (() => {
  const T = 16;                       // píxeles de arte por tile
  const RAISE = 8;                    // Ultra: cuánto sube la parte de arriba de las paredes (px de arte)
  const CAP_H = T + RAISE;            // Ultra: alto de la tira de paredes de una fila

  /*
   * ground: textura del suelo ('grass' | 'stone' | 'ash' | 'sand' | 'snow' | 'wood' | 'metal')
   * walls: 'bush' (bosque de coníferas) o 'rock' (acantilados)
   */
  const BIOMES = [
    // Como una ruta de Sinnoh: hierba viva, caminos de tierra clara y bosques de coníferas.
    { name: 'Bosque Umbrío', liquid: 'water', ground: 'grass', walls: 'bush',
      floor: ['#5cbb51', '#68c75a', '#52ad49'], dirt: ['#c39b5e', '#d3ae70', '#e0c186'],
      speck: '#3e953f', light: '#98e17b', flowers: ['#ffd54a', '#ff7f9e', '#ffffff'],
      wallTop: ['#5d6e49', '#677a50', '#566544'], wallLight: '#88a06e', wallEdge: '#123a1c',
      wallFace: ['#2f5a2e', '#264d27'], wallFaceDark: '#0c2412',
      liq: '#4a98e6', liqDeep: '#3b84d4', foam: '#eaf7ff', shore: '#8a6d43',
      prop: 'tree', leaf: ['#1d5a2c', '#2e7d36', '#47a043', '#7dca5c'], trunk: ['#5b3a22', '#87582f'],
      rock: ['#7a818b', '#a1a8b2', '#cbd1d8'], grass: ['#1f7434', '#3a9a42', '#82d266'] },
    { name: 'Cueva Cristal', liquid: 'water', ground: 'stone', walls: 'rock',
      floor: ['#5a6590', '#6470a0', '#525c84'], dirt: ['#454f79', '#4c5682', '#535e8b'],
      speck: '#3f4970', light: '#8794c6', flowers: ['#8fe3ff', '#c9a6ff', '#7ef0d0'],
      wallTop: ['#6a5a98', '#7666a8', '#5e4f8a'], wallLight: '#b09ce8', wallEdge: '#1f1934',
      wallFace: ['#463a70', '#3c3164'], wallFaceDark: '#221c3a',
      liq: '#2fa8c0', liqDeep: '#2389a3', foam: '#c4fbff', shore: '#3a4670',
      prop: 'crystal', leaf: ['#5ad1e8', '#8fe7f5', '#c8f7ff', '#ffffff'], trunk: ['#3a4a78', '#4e64a0'],
      rock: ['#5d6684', '#7d87a8', '#a0aaca'], grass: ['#3d5c8a', '#5a86c0', '#8ab8ee'] },
    { name: 'Volcán Ceniza', liquid: 'lava', ground: 'ash', walls: 'rock',
      floor: ['#6a5040', '#755a48', '#604838'], dirt: ['#4a3d36', '#52443c', '#5a4b42'],
      speck: '#4d3a2e', light: '#97775f', flowers: ['#ff8d3d', '#ffc45e', '#e06a4a'],
      wallTop: ['#4a4240', '#554c49', '#403937'], wallLight: '#7d6f68', wallEdge: '#141110',
      wallFace: ['#342e2c', '#2c2725'], wallFaceDark: '#151211',
      liq: '#f0641f', liqDeep: '#c8461a', foam: '#ffe07a', shore: '#3a2a22',
      prop: 'dead', leaf: ['#4a3a30', '#5e4a3c', '#6f5a49', '#806a58'], trunk: ['#3a2e27', '#52423a'],
      rock: ['#5a514c', '#776c66', '#968a83'], grass: ['#6b4a2a', '#94693a', '#c4914e'] },
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
   *   ground / walls   como en BIOMES (textura del suelo y paredes)
   */
  const ARENA_THEMES = {
    normal:   { name: 'Pradera Eterna', floor: '#63b552', wall: '#8a7f6a', liquid: 'water', liq: '#4f98e0', prop: 'tree',
                leaf: '#55a848', trunk: '#6b4a2a', flowers: ['#f4d65c', '#ffffff', '#f39ac0'], grass: '#4fa040', rock: '#8a8a8a',
                pools: 0, pillars: 0.035, props: { tree: 0.025, grass: 0.05 }, weather: null,
                ground: 'grass', walls: 'bush' },
    fire:     { name: 'Volcán Ígneo', floor: '#653f30', wall: '#3a2826', liquid: 'lava', liq: '#f0601f', foam: '#ffd46a', prop: 'dead',
                leaf: '#5e4a3c', trunk: '#3a2e27', flowers: ['#ff8d3d', '#ffc45e', '#e06a4a'], grass: '#94693a', rock: '#6a605b',
                pools: 0.31, pillars: 0.03, props: { tree: 0.01 }, weather: 'sun',
                ground: 'ash', walls: 'rock' },
    water:    { name: 'Gruta Marina', floor: '#457891', wall: '#2a4660', liquid: 'water', liq: '#3a90e0', foam: '#cff0ff', prop: 'crystal',
                leaf: '#5fd0e8', trunk: '#2a4a78', flowers: ['#ff9ec4', '#7ef0d0', '#ffffff'], grass: '#3f8a9a', rock: '#5d7a90',
                pools: 0.33, pillars: 0.02, props: { tree: 0.015 }, weather: 'rain',
                ground: 'stone', walls: 'rock' },
    grass:    { name: 'Selva Esmeralda', floor: '#4ea844', wall: '#4a6a36', liquid: 'swamp', liq: '#557531', foam: '#a6cc66', prop: 'tree',
                leaf: '#3f9a3a', trunk: '#5b3b22', flowers: ['#f4d65c', '#ff8ad8', '#ffffff'], grass: '#46a83c', rock: '#6a7a5a',
                pools: 0.22, pillars: 0, props: { tree: 0.05, grass: 0.12 }, weather: null,
                ground: 'grass', walls: 'bush' },
    electric: { name: 'Central Voltio', floor: '#55534a', wall: '#3a3a48', liquid: 'spark', liq: '#e8c020', foam: '#fff6c0', prop: 'crystal',
                leaf: '#ffd23f', trunk: '#5a5030', flowers: ['#ffe14d', '#ffffff', '#7fd0ff'], grass: '#8a8a40', rock: '#70707a',
                pools: 0.28, pillars: 0.04, props: { tree: 0.01 }, weather: 'rain',
                ground: 'metal', walls: 'rock' },
    ice:      { name: 'Glaciar Eterno', floor: '#c6dcec', wall: '#7f9fc0', liquid: 'ice', liq: '#a6dcf4', foam: '#ffffff', prop: 'crystal',
                leaf: '#bfe8ff', trunk: '#6f8fb0', flowers: ['#ffffff', '#9fe0ff', '#d8f1ff'], grass: '#9fc0d8', rock: '#8fa8c0',
                pools: 0.36, pillars: 0.02, props: { tree: 0.02 }, weather: 'snow',
                ground: 'snow', walls: 'rock' },
    fighting: { name: 'Dojo Ancestral', floor: '#9a7650', wall: '#5e4232', liquid: 'water', liq: '#4f98e0', prop: 'tree',
                leaf: '#4f8a3a', trunk: '#5b3b22', flowers: ['#ff5f6d', '#f4d65c', '#ffffff'], grass: '#6a8a40', rock: '#8a7a6a',
                pools: 0, pillars: 0.075, props: { tree: 0.008 }, weather: null,
                ground: 'wood', walls: 'rock' },
    poison:   { name: 'Ciénaga Tóxica', floor: '#4e3f58', wall: '#33263f', liquid: 'poison', liq: '#a452cc', foam: '#e6b0ff', prop: 'dead',
                leaf: '#5a4a6a', trunk: '#3a2f45', flowers: ['#c86bdc', '#8bd94a', '#e0a6ff'], grass: '#6a5a8a', rock: '#5a4f6a',
                pools: 0.31, pillars: 0.015, props: { tree: 0.02 }, weather: null,
                ground: 'stone', walls: 'rock' },
    ground:   { name: 'Desierto Rojo', floor: '#c49a5c', wall: '#8a5e34', liquid: 'swamp', liq: '#9a7a48', foam: '#d6b98a', prop: 'dead',
                leaf: '#8a6a40', trunk: '#6a4a2a', flowers: ['#e06a4a', '#f4d65c', '#ffffff'], grass: '#b0904a', rock: '#9a7a5a',
                pools: 0.25, pillars: 0.04, props: { tree: 0.01, rock: 0.015 }, weather: 'sand',
                ground: 'sand', walls: 'rock' },
    flying:   { name: 'Pico Celeste', floor: '#a8c2e2', wall: '#dfe8f4', liquid: 'water', liq: '#7fb8ff', prop: 'tree',
                leaf: '#e8f2ff', trunk: '#9aa8c0', flowers: ['#ffffff', '#ffe14d', '#bfe0ff'], grass: '#b8d0e8', rock: '#c0ccdc',
                pools: 0, pillars: 0.02, props: { tree: 0.025 }, weather: null,
                ground: 'snow', walls: 'rock' },
    psychic:  { name: 'Templo Mental', floor: '#684c7c', wall: '#3e2a55', liquid: 'water', liq: '#8a5ad0', prop: 'crystal',
                leaf: '#ff8ad8', trunk: '#5a3a7a', flowers: ['#ff8ad8', '#c9a6ff', '#ffffff'], grass: '#8a5a9a', rock: '#7a6a8a',
                pools: 0, pillars: 0.045, props: { tree: 0.02 }, weather: null,
                ground: 'stone', walls: 'rock' },
    bug:      { name: 'Bosque Colmena', floor: '#74962e', wall: '#5e4a26', liquid: 'swamp', liq: '#6a7a2a', foam: '#c4d65a', prop: 'tree',
                leaf: '#8aaa30', trunk: '#5b3b22', flowers: ['#f4d65c', '#ffffff', '#c4d65a'], grass: '#8aaa30', rock: '#7a7a5a',
                pools: 0.2, pillars: 0, props: { tree: 0.04, grass: 0.12 }, weather: null,
                ground: 'grass', walls: 'bush' },
    rock:     { name: 'Cantera Antigua', floor: '#8a7864', wall: '#55473a', liquid: 'water', liq: '#4f98e0', prop: 'dead',
                leaf: '#6a5a4a', trunk: '#4a3e32', flowers: ['#c9b28a', '#ffffff', '#a89070'], grass: '#8a7a5a', rock: '#8a7a6a',
                pools: 0, pillars: 0.08, props: { rock: 0.03 }, weather: 'sand',
                ground: 'stone', walls: 'rock' },
    ghost:    { name: 'Cementerio Sombrío', floor: '#3e3a4f', wall: '#24202e', liquid: 'water', liq: '#3a3a6a', prop: 'dead',
                leaf: '#4a4060', trunk: '#2e2838', flowers: ['#9a8ad0', '#5fe0c0', '#c9cfdc'], grass: '#4a4a60', rock: '#5a5670',
                pools: 0, pillars: 0.03, props: { tree: 0.03 }, weather: 'fog',
                ground: 'stone', walls: 'rock' },
    dragon:   { name: 'Santuario Dragón', floor: '#3c4066', wall: '#24264a', liquid: 'lava', liq: '#7b5cff', foam: '#c9a6ff', prop: 'crystal',
                leaf: '#7b5cff', trunk: '#2a2a5a', flowers: ['#7b5cff', '#ffd23f', '#ffffff'], grass: '#4a4a8a', rock: '#5a5a8a',
                pools: 0.22, pillars: 0.04, props: { tree: 0.015 }, weather: null,
                ground: 'stone', walls: 'rock' },
    dark:     { name: 'Callejón Oscuro', floor: '#332e35', wall: '#1c181f', liquid: 'water', liq: '#2a2a3a', prop: 'dead',
                leaf: '#3a3040', trunk: '#241e28', flowers: ['#ff5f6d', '#6b5c52', '#9a8a9a'], grass: '#3a343a', rock: '#4a444a',
                pools: 0, pillars: 0.05, props: { tree: 0.02 }, weather: null,
                ground: 'stone', walls: 'rock' },
    steel:    { name: 'Fortaleza de Acero', floor: '#76818f', wall: '#465060', liquid: 'water', liq: '#4f98e0', prop: 'crystal',
                leaf: '#c9d2de', trunk: '#5d6773', flowers: ['#c9d2de', '#ffd23f', '#ffffff'], grass: '#8a96a6', rock: '#9aa6b5',
                pools: 0, pillars: 0.08, props: { tree: 0.01 }, weather: null,
                ground: 'metal', walls: 'rock' },
    fairy:    { name: 'Bosque Encantado', floor: '#5fa46c', wall: '#7a5a8a', liquid: 'water', liq: '#8fd8ff', foam: '#ffe0f4', prop: 'tree',
                leaf: '#e08ad0', trunk: '#6b4a5a', flowers: ['#ff8ad8', '#ffffff', '#c9a6ff'], grass: '#c48ad8', rock: '#9a8aa8',
                pools: 0.16, pillars: 0, props: { tree: 0.05, grass: 0.1 }, weather: null,
                ground: 'grass', walls: 'bush' },
    // La arena de Arceus al minuto 30 (systems/judgment.js): ceniza, ruinas y
    // árboles muertos, con un claro donde aterriza (clear). No es de ninguna grieta.
    judgment: { name: 'Ruinas del Juicio', floor: '#4f4644', wall: '#2e2829', liquid: 'lava', liq: '#e8a82a', foam: '#fff1b8', prop: 'dead',
                leaf: '#3e3633', trunk: '#2a2321', flowers: ['#8a7f76', '#e8a82a', '#5a514c'], grass: '#5e544c', rock: '#6a625c',
                pools: 0, pillars: 0.03, props: { tree: 0.012, rock: 0.02 }, weather: null, clear: 4.5,
                ground: 'ash', walls: 'rock' }
  };
  const ARENA_TYPES = Object.keys(ARENA_THEMES);

  /** Aclara (k>0) u oscurece (k<0) un color. */
  function shade(hex, k) {
    const c = rgb(hex).map(v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  /** Mezcla dos colores hex (t = cuánto del segundo) y devuelve hex. */
  function mixHex(h1, h2, t) {
    const a = rgb(h1), b = rgb(h2);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  /** Paleta completa de bioma a partir de los pocos colores de una arena. */
  function arenaBiome(th) {
    const f = th.floor, w = th.wall, L = th.liq;
    const bush = th.walls === 'bush', grassy = th.ground === 'grass';
    // (En los de hierba, los caminos son de tierra clara, como en las rutas; en los demás, del suelo más oscuro.)
    const d = grassy ? mixHex(f, '#d4ad6c', 0.78) : shade(f, -0.13);
    return {
      name: 'Grieta · ' + th.name, liquid: th.liquid, ground: th.ground || 'stone', walls: th.walls || 'rock',
      floor: [f, shade(f, 0.06), shade(f, -0.06)], dirt: [shade(d, -0.08), d, shade(d, 0.1)],
      speck: shade(f, grassy ? -0.3 : -0.25), light: shade(f, grassy ? 0.32 : 0.22), flowers: th.flowers,
      wallTop: [w, shade(w, 0.07), shade(w, -0.07)], wallLight: shade(w, 0.32), wallEdge: shade(bush ? th.leaf : w, -0.75),
      wallFace: [shade(w, -0.3), shade(w, -0.38)], wallFaceDark: shade(bush ? th.leaf : w, bush ? -0.8 : -0.55),
      liq: L, liqDeep: shade(L, -0.18), foam: th.foam || shade(L, 0.6), shore: grassy ? shade(d, -0.3) : shade(f, -0.32),
      prop: th.prop, leaf: [shade(th.leaf, -0.42), shade(th.leaf, -0.2), th.leaf, shade(th.leaf, 0.32)],
      trunk: [shade(th.trunk, -0.2), th.trunk],
      rock: [shade(th.rock, -0.2), th.rock, shade(th.rock, 0.22)],
      grass: [shade(th.grass, -0.32), th.grass, shade(th.grass, 0.34)]
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

  /** Luminancia aproximada de un color hex (0..255). */
  const lum = hex => { const [r, g, b] = rgb(hex); return r * 0.3 + g * 0.59 + b * 0.11; };
  /** Colores ordenados de oscuro a claro (las paletas no siempre vienen en orden). */
  const sortHex = list => list.slice().sort((a, b) => lum(a) - lum(b));
  const ramp = list => sortHex(list).map(h => pack(h));

  /*
   * Bultos de los bordes de los bosques (0..2 px que se come el borde), en bucle
   * de 32 px: 6 bultos redondos con algo de variación.
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
   * Tono del suelo de todo el chunk (0..1): manchas grandes (32 px) y medianas
   * (16 px), calculado cada 2 px. Con él se hacen manchas de 2 o 3 tonos con el
   * borde limpio (sin tramado: el «ruido de puntos» de antes).
   */
  function toneMap(gx0, gy0, W, s) {
    const hw = W >> 1, out = new Float32Array(hw * hw);
    addTone(out, hw, gx0, gy0, 4, 0.66, s + 41);    // celdas de 32 px (16 en la rejilla de 2 px)
    addTone(out, hw, gx0, gy0, 3, 0.34, s + 42);    // celdas de 16 px
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
   * Bosque denso (paredes 'bush'), como los bosques de coníferas de las rutas de
   * Sinnoh (dibujo propio): copas de conífera de 18×17 en filas cada 8 px, al
   * tresbolillo (cada fila, media copa de lado); se pintan de arriba abajo, así la
   * de delante tapa la falda de la de detrás. Se hace una textura de 32×32 que
   * encaja consigo misma (full) y, para la primera fila de tiles de cada bosque,
   * otra con sólo las dos filas de copas que nacen en ese tile (top; entre las
   * puntas queda transparente y se ve el suelo de detrás). k0odd: la primera fila
   * de copas es de las desplazadas (en Ultra, las paredes suben 8 px).
   */
  function coneShape(L, edge) {
    // Tres pisos que se ensanchan; el de abajo, más ancho que el de arriba (falda).
    const TIERS = [[0, 5, 1, 4.2], [5, 10, 2.8, 6.6], [10, 16, 4.6, 8.8]];
    const px = [];
    for (const [y0, y1, w0, w1] of TIERS) {
      for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / (y1 - y0), hw = w0 + (w1 - w0) * t;
        for (let x = 0; x < 18; x++) {
          const dx = x + 0.5 - 9, u = dx / hw;
          if (Math.abs(u) > 1) continue;
          let idx = u < -0.45 ? 3 : u < 0.05 ? 2 : u < 0.6 ? 1 : 0;
          if (y >= y1 - 1) idx = Math.max(0, idx - 1);                 // la falda, en sombra
          else if (y <= y0 + 1 && Math.abs(dx) < 1.6) idx = 3;          // luz en la punta de cada piso
          let c = L[idx];
          if (Math.abs(dx) > hw - 1 || y === y1 && y1 === 16) c = edge; // contorno
          else if (y === y1) c = L[0];                                  // raya oscura entre pisos
          px.push([x, y, c]);
        }
      }
    }
    return px;
  }
  function canopy(B, top, k0odd) {
    const L = ramp(B.leaf), edge = pack(B.wallEdge), shape = coneShape(L, edge);
    const BW = 96, BH = 96, buf = new Uint32Array(BW * BH);
    // Filas k (y = 8k); desplazadas las impares (+8 en x). Se recorta [32, 64) en x e y.
    for (let k = 0; k < 12; k++) {
      const y0 = k * 8;
      if (top && (y0 < 32 || y0 > 40)) continue;                        // top: sólo las filas en y = 0 y 8 del recorte
      const odd = ((k + (top && k0odd ? 1 : 0)) & 1) === 1;
      for (let m = 0; m < 7; m++) {
        const cx = m * 16 + (odd ? 8 : 0);
        for (const [x, y, c] of shape) {
          const X = cx + x - 9 + 8, Y = y0 + y;
          if (X >= 0 && X < BW && Y < BH) buf[Y * BW + X] = c;
        }
      }
    }
    const out = new Uint32Array(32 * 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) out[y * 32 + x] = buf[(y + 32) * BW + x + 32];
    return out;
  }

  /** Colores empaquetados de un bioma (una vez por bioma). */
  const palCache = new Map();
  function palette(bi) {
    let C = palCache.get(bi);
    if (C) return C;
    const B = BIOMES[bi];
    const fl = sortHex(B.floor), dt = sortHex(B.dirt), wt = sortHex(B.wallTop);
    const bush = B.walls === 'bush';
    C = {
      floor: fl.map(h => pack(h)), dirt: dt.map(h => pack(h)), wallTop: wt.map(h => pack(h)),
      wallFace: ramp(B.wallFace), flowers: B.flowers.map(h => pack(h)), rock: ramp(B.rock),
      speck: pack(B.speck), light: pack(B.light), wallLight: pack(B.wallLight), wallEdge: pack(B.wallEdge),
      wallFaceDark: pack(B.wallFaceDark), liq: pack(B.liq), liqDeep: pack(B.liqDeep), foam: pack(B.foam), shore: pack(B.shore),
      liqLight: mixPack(B.liq, B.foam, 0.3),
      // Sombra de contacto de las paredes sobre el suelo (fuerte y suave).
      shade: mixPack(fl[0], B.wallFaceDark, 0.5), shade2: mixPack(fl[0], B.wallFaceDark, 0.22),
      // Caminos: borde oscuro, sombra de la hierba en el borde de arriba, piedrecitas.
      dirtEdge: mixPack(dt[0], B.speck, 0.5), dirtShade: mixPack(dt[0], dt[1], 0.35),
      grassRim: mixPack(fl[0], B.speck, 0.55),
      crack: mixPack(wt[0], B.wallEdge, 0.55), wallRim: mixPack(wt[2], B.wallLight, 0.6),
      faceLight: mixPack(sortHex(B.wallFace)[1], B.wallTop[0], 0.45),
      faceSeam: mixPack(sortHex(B.wallFace)[0], B.wallFaceDark, 0.6),
      flowerMid: B.flowers.map(h => pack(lum(h) > 175 ? '#e0902c' : '#fff1a8')),
      // Talud de la orilla de arriba del agua (se ve la tierra: el agua está más baja).
      bank: [mixPack(B.shore, '#000000', 0.3), pack(B.shore), mixPack(B.shore, dt[2], 0.45)],
      bankShadow: mixPack(B.liqDeep, '#000000', 0.22),
      // Bosques: hojas, troncos y el hueco oscuro entre ellos.
      leaf: ramp(B.leaf), trunk: ramp(B.trunk),
      gap: mixPack(sortHex(B.leaf)[0], B.wallFaceDark, 0.55),
      trunkDark: mixPack(sortHex(B.trunk)[0], B.wallFaceDark, 0.45),
      canopy: bush ? canopy(B, false, false) : null,
      canopyTop: bush ? [canopy(B, true, false), canopy(B, true, true)] : null,
      // Juntas del suelo de piedra, madera y metal.
      seam: mixPack(fl[0], '#000000', 0.3), seamLight: mixPack(fl[2], '#ffffff', 0.2),
      cinder: pack('#ff8a3d'), sparkle: pack('#ffffff')
    };
    palCache.set(bi, C);
    return C;
  }

  // ---------------- chunk de suelo ----------------

  /*
   * Caminos de tierra hechos de tiles, como en los juegos de DS: cada tile es de
   * tierra o no (el campo suave de world.js en su centro) y las esquinas se
   * redondean (radio RC) por fuera y por dentro: borde limpio, sin deshilachar.
   * Máscara del chunk a resolución de píxel con un píxel de margen a los lados,
   * MT filas de más por arriba y una por abajo (para ver los bordes).
   */
  const MT = 2, RC = 5;
  function dirtMask(tx0, ty0, n, field) {
    const W = n * T, gw = n + 4;
    const tiles = new Uint8Array(gw * gw);                // tiles de -2 a n+1
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++)
      tiles[j * gw + i] = field((tx0 + i - 2) * T + T / 2, (ty0 + j - 2) * T + T / 2) > 0.67 ? 1 : 0;
    const D = (i, j) => tiles[(j + 2) * gw + i + 2] === 1;
    const MW = W + 2, mask = new Uint8Array(MW * (W + MT + 2));
    for (let y = -MT; y <= W; y++) for (let x = -1; x <= W; x++) {
      const i = x >> 4, j = y >> 4, lx = x & 15, ly = y & 15;
      let d = D(i, j);
      const sx = lx < RC ? -1 : lx >= T - RC ? 1 : 0, sy = ly < RC ? -1 : ly >= T - RC ? 1 : 0;
      if (sx && sy) {
        const hn = D(i + sx, j), vn = D(i, j + sy);
        const ccx = sx < 0 ? RC - 0.5 : T - RC - 0.5, ccy = sy < 0 ? RC - 0.5 : T - RC - 0.5;
        if (hn === vn && hn !== d && (lx - ccx) ** 2 + (ly - ccy) ** 2 > RC * RC) d = hn;   // esquina por fuera / por dentro
      }
      mask[(y + MT) * MW + x + 1] = d ? 1 : 0;
    }
    // dirtAt(x, y) en coordenadas locales del chunk (x de -1 a W, y de -MT a W).
    const dirtAt = (x, y) => mask[(y + MT) * MW + x + 1] === 1;
    dirtAt.mask = mask; dirtAt.MW = MW;
    return dirtAt;
  }

  /**
   * Pinta un chunk de n×n tiles. `at(tx,ty)` devuelve el tipo de terreno
   * global ('floor' | 'wall' | 'liquid'), así el autotiling ve más allá del
   * borde del chunk. Se hornea una vez (y otra al cambiar de bioma): nada de esto
   * cuesta por fotograma.
   *
   * ultra: las paredes no van en el suelo sino en .caps (una tira de CAP_H px por
   * fila con paredes; .capSlot[fila] = su hueco o -1).
   */
  function paintChunk(cx, cy, n, at, dirtField, bi, seed = 0, ultra = false) {
    const P = Pix(n * T, n * T);
    const C = palette(bi), B = BIOMES[bi];
    const tx0 = cx * n, ty0 = cy * n, gx0 = tx0 * T, gy0 = ty0 * T, W = n * T;
    const dirtAt = dirtMask(tx0, ty0, n, dirtField);
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
          if (!F.rock) { F.rock = smoothField(gx0, gy0, W, 3, seed + 43); F.crack = smoothField(gx0, gy0, W, 4, seed + 44); }
          if (ultra) paintWall(caps, C, B, ox, capSlot[j] * CAP_H, tx, ty, at, F, true);
          else paintWall(P, C, B, ox, oy, tx, ty, at, F, false);
        } else if (kind === 2) paintLiquid(P, C, ox, oy, tx, ty, at);
      }
    }
    const cv = P.canvas();
    if (ultra) { cv.caps = caps ? caps.canvas() : null; cv.capSlot = capSlot; }
    return cv;
  }

  // Detalles del suelo: [dx, dy, color] (L luz, G hierba clara, D oscuro, F flor,
  // M centro de la flor, R0..R2 piedra de oscura a clara, S/W brillo).
  const FLOWER = [[0, -1, 'F'], [-1, 0, 'F'], [1, 0, 'F'], [0, 1, 'F'], [0, 0, 'M'], [1, 1, 'D'], [0, 2, 'D'], [-1, 1, 'D']];
  const PEBBLE = [[0, 0, 'R2'], [1, 0, 'R1'], [0, 1, 'R1'], [1, 1, 'R0'], [2, 1, 'D'], [1, 2, 'D']];
  const CRACK = [[0, 0, 'D'], [1, 1, 'D'], [2, 1, 'D'], [3, 2, 'D'], [1, 0, 'R1']];
  const CRACK2 = [[0, 0, 'D'], [1, 0, 'D'], [2, 1, 'D'], [2, 2, 'D'], [3, 3, 'D'], [1, 1, 'R1'], [3, 2, 'R1']];
  // La «w» de las rutas: dos briznas en V, con luz en la punta de la izquierda.
  const GRASS_W = [[0, -1, 'D'], [1, 0, 'D'], [2, -1, 'D'], [3, 0, 'D'], [4, -1, 'D'], [0, -2, 'L']];
  const GRASS_V = [[0, -1, 'D'], [1, 0, 'D'], [2, -1, 'D'], [0, -2, 'L']];
  const SPARK = [[0, -1, 'S'], [-1, 0, 'S'], [0, 0, 'W'], [1, 0, 'S'], [0, 1, 'S']];
  const DIMPLE = [[0, 0, 'D'], [1, 0, 'D'], [2, 0, 'D'], [-1, -1, 'L'], [3, -1, 'L']];
  const RIPPLE = [[0, 0, 'L'], [1, -1, 'L'], [2, -1, 'L'], [3, 0, 'L'], [0, 1, 'D'], [1, 0, 'D'], [2, 0, 'D'], [3, 1, 'D']];
  // Dónde van los detalles en cada una de las 4 variantes de tile (un dibujo que se
  // repite, como el de los tiles de los juegos de DS).
  const LAYOUT = [
    [[2, 5], [10, 3], [6, 10], [12, 13]],
    [[5, 3], [12, 7], [2, 12], [8, 14]],
    [[3, 8], [10, 11], [8, 4], [13, 2]],
    [[9, 5], [2, 3], [11, 13], [4, 13]]
  ];

  function stamp(P, shape, x, y, cols) {
    for (const [dx, dy, k] of shape) P.set(x + dx, y + dy, cols[k]);
  }

  // Ondas de la arena (tabla de senos en bucle de 64 px).
  const WAVE = new Float32Array(64);
  for (let i = 0; i < 64; i++) WAVE[i] = Math.sin(i / 64 * Math.PI * 2) * 2.2;

  function paintFloor(P, C, B, ox, oy, tx, ty, dirtAt, at, F, open) {
    let dirtCount = 0;
    const mask = dirtAt.mask, MW = dirtAt.MW, W = F.W, tone = F.tone, style = B.ground;
    const grassy = style === 'grass';
    for (let y = 0; y < T; y++) {
      const gy = ty * T + y, ly = oy + y, mrow = (ly + MT) * MW + 1;
      for (let x = 0; x < T; x++) {
        const gx = tx * T + x, lx = ox + x, mo = mrow + lx;
        const dirt = mask[mo] === 1;
        const v = tone[(ly >> 1) * (W >> 1) + (lx >> 1)];
        let col;
        if (dirt) {
          dirtCount++;
          // Tierra: lisa, con alguna mancha suave y el borde limpio.
          col = v < 0.24 ? C.dirt[0] : v > 0.8 ? C.dirt[2] : C.dirt[1];
          // Borde: una raya más oscura; arriba, la sombra de la hierba sobre el camino.
          // (Fuera de la hierba, sólo un borde suave: son zonas del suelo más oscuras.)
          if (mask[mo - MW] !== 1 || mask[mo + MW] !== 1 || mask[mo - 1] !== 1 || mask[mo + 1] !== 1) col = grassy ? C.dirtEdge : C.dirt[0];
          else if (grassy && mask[mo - 2 * MW] !== 1) col = C.dirtShade;
        } else {
          if (grassy) {
            // Hierba: un verde limpio con manchas grandes muy suaves (casi no se notan).
            col = v < 0.3 ? C.floor[0] : C.floor[1];
          } else if (style === 'wood') {
            // Tablas de 5 px de alto con juntas a tresbolillo; cada tabla, su tono.
            // (ry y la junta con floor: también con coordenadas negativas, donde % daba
            // restos negativos y las tablas salían sin juntas.)
            const row = Math.floor(gy / 5), sx = gx + H(row, 0, 61) * 24, seg = Math.floor(sx / 24);
            const k = H(row, seg, 62), ry = gy - row * 5;
            col = k < 0.33 ? C.floor[0] : k > 0.7 ? C.floor[2] : C.floor[1];
            if (ry === 0) col = C.seam;
            else if (ry === 1) col = C.seamLight;
            else if (Math.floor(sx - seg * 24) === 0) col = C.seam;
          } else if (style === 'metal') {
            const k = H(gx >> 4, gy >> 4, 63);
            col = k < 0.33 ? C.floor[0] : k > 0.7 ? C.floor[2] : C.floor[1];
            const mx = gx & 15, my = gy & 15;
            if (mx === 0 || my === 0) col = C.seam;
            else if (mx === 1 || my === 1) col = C.seamLight;
            else if ((mx === 3 || mx === 13) && (my === 3 || my === 13)) col = C.light;
            else if ((mx === 4 || mx === 14) && (my === 4 || my === 14)) col = C.seam;
          } else {
            // Piedra, ceniza, arena y nieve: manchas de tres tonos con el borde limpio.
            col = v < 0.36 ? C.floor[0] : v > 0.64 ? C.floor[2] : C.floor[1];
            if (style === 'sand') {
              // Ondas de arena: líneas onduladas a trozos con luz arriba y sombra abajo.
              const w = ((gy + WAVE[(gx + (H(gx >> 6, 0, 64) * 64 | 0)) & 63]) % 9 + 9) % 9;
              const on = H((gx + 3) >> 3, Math.floor((gy + 4) / 9), 65) < 0.55;
              if (on && w < 1) col = C.light;
              else if (on && w < 2) col = C.floor[0];
            }
          }
          // Junto al camino, la hierba lleva un borde oscuro (se lee bien dónde acaba).
          if (grassy && (mask[mo + MW] === 1 || mask[mo - MW] === 1 || mask[mo - 1] === 1 || mask[mo + 1] === 1)) col = C.grassRim;
        }
        P.set(lx, ly, col);
      }
    }
    if (!open) return;

    // Sombra de contacto de las paredes que hay al norte y al oeste (la luz viene
    // de arriba a la izquierda): bandas lisas, como en los juegos de DS (antes, con
    // tramado: un borde de puntitos junto a las paredes). En Ultra, sólo al pie de la
    // cara: el lado de la pared va de pie y en perspectiva (por filas), y la sombra
    // lateral, pegada al suelo, quedaba como una raya suelta junto a ella.
    const wn = at(tx, ty - 1) === 'wall', ww = !F.ultra && at(tx - 1, ty) === 'wall';
    if (wn) {
      for (let x = 0; x < T; x++) { P.set(ox + x, oy, C.shade); P.set(ox + x, oy + 1, C.shade2); }
    }
    if (ww) {
      for (let y = wn ? 2 : 0; y < T; y++) P.set(ox, oy + y, C.shade2);
    } else if (!F.ultra && !wn && at(tx - 1, ty - 1) === 'wall') {
      P.set(ox, oy, C.shade2);
    }

    // Detalles: el dibujo del tile (una de 4 variantes) y, a veces, flores o piedras.
    const cols = { L: C.light, G: C.floor[2], D: C.speck, F: 0, M: 0, R0: C.rock[0], R1: C.rock[1], R2: C.rock[2], S: C.light, W: C.sparkle };
    const d = H(tx, ty, 14), lay = LAYOUT[Math.floor(H(tx, ty, 15) * 4)];
    const lo = wn ? 3 : 0;                 // no pintar sobre la sombra de la pared
    const ok = (x, y) => y - oy > lo + 1 && y - oy < T && !dirtAt(x, y) && !dirtAt(x + 3, y) && !dirtAt(x, y - 2);
    if (dirtCount > T * T / 2) {
      // Camino: alguna piedrecita.
      cols.D = C.dirt[0];
      const [px, py] = lay[0];
      if (d < 0.16 && dirtAt(ox + px, oy + py) && py > lo + 1) stamp(P, PEBBLE, ox + px, oy + py, cols);
      return;
    }
    if (grassy) {
      if (d < 0.07) {
        // Flores (dos o tres juntas, como en los parterres de las rutas).
        const f = Math.floor(H(tx, ty, 17) * C.flowers.length);
        cols.F = C.flowers[f]; cols.M = C.flowerMid[f]; cols.D = C.floor[0];
        for (let q = 0; q < 3; q++) { const [px, py] = lay[q]; if (ok(ox + px, oy + py)) stamp(P, FLOWER, ox + px + 1, oy + py, cols); }
        return;
      }
      for (let q = 0; q < 4; q++) {
        const [px, py] = lay[q];
        if (!ok(ox + px, oy + py)) continue;
        stamp(P, q & 1 ? GRASS_V : GRASS_W, ox + px, oy + py, cols);
      }
      if (d > 0.97 && ok(ox + 7, oy + 8)) stamp(P, PEBBLE, ox + 7, oy + 8, cols);
      return;
    }
    if (style === 'snow') {
      cols.D = C.floor[0];
      for (let q = 0; q < 2; q++) {
        const [px, py] = lay[q];
        if (!ok(ox + px, oy + py)) continue;
        stamp(P, (d + q * 0.5) % 1 < 0.45 ? SPARK : DIMPLE, ox + px, oy + py, cols);
      }
    } else if (style === 'sand') {
      const [px, py] = lay[0];
      if (d < 0.1 && ok(ox + px, oy + py)) stamp(P, PEBBLE, ox + px, oy + py, cols);
      else if (d < 0.16 && ok(ox + px, oy + py)) { const f = Math.floor(H(tx, ty, 17) * C.flowers.length); cols.F = C.flowers[f]; cols.M = C.flowerMid[f]; stamp(P, FLOWER, ox + px, oy + py, cols); }
    } else if (style === 'wood' || style === 'metal') {
      const [px, py] = lay[1];
      if (d < 0.05 && ok(ox + px, oy + py)) stamp(P, PEBBLE, ox + px, oy + py, cols);
    } else {
      // Piedra y ceniza: grietas, piedrecitas, alguna flor y (en la ceniza) brasas.
      cols.R1 = C.floor[2];
      const [px, py] = lay[0], [qx, qy] = lay[2];
      if (ok(ox + px, oy + py)) {
        if (d < 0.2) stamp(P, CRACK, ox + px - 1, oy + py, cols);
        else if (d < 0.36) stamp(P, CRACK2, ox + px - 1, oy + py - 1, cols);
      }
      if (ok(ox + qx, oy + qy)) {
        if (d > 0.55 && d < 0.8) { cols.R1 = C.rock[1]; stamp(P, PEBBLE, ox + qx, oy + qy, cols); }
        else if (d >= 0.94) { const f = Math.floor(H(tx, ty, 17) * C.flowers.length); cols.F = C.flowers[f]; cols.M = C.flowerMid[f]; stamp(P, FLOWER, ox + qx, oy + qy, cols); }
      }
      if (style === 'ash' && H(tx, ty, 25) < 0.22) {
        const [ex, ey] = lay[3];
        if (ok(ox + ex, oy + ey)) { P.set(ox + ex, oy + ey, C.cinder); if (H(tx, ty, 26) < 0.4) P.set(ox + ex + 1, oy + ey, C.cinder); }
      }
    }
  }

  /*
   * Pared. ultra: la tira de su fila (CAP_H px de alto, la de arriba RAISE px por
   * encima del tile) con la cara el doble de alta. Sin pared al sur hay cara frontal.
   * Roca: arriba, una meseta de dos tonos con el canto claro; delante, el
   * acantilado en estratos horizontales (como los de las rutas de montaña de DS).
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
          // Acantilado: estratos de 4 px (luz arriba, raya oscura abajo), alguna
          // grieta vertical, el canto de arriba claro y el pie en sombra.
          const fy = y - (rows - FACE);
          const band = (fy - 1) >> 2, r = (fy - 1) & 3, alt = (band + (H(gx >> 3, band, 27) < 0.3 ? 1 : 0)) & 1;
          col = r === 0 ? C.faceLight : r === 3 ? C.faceSeam : face[alt];
          if (fy === 0) col = C.wallRim;
          else if (y === rows - 1) col = C.wallFaceDark;
          else if (r > 0 && r < 3 && H(gx, band, 28) < 0.08) col = C.faceSeam;     // grieta
          if (!w && x === 0 || !e && x === T - 1) col = C.wallFaceDark;
        } else {
          // Meseta: manchas grandes de dos tonos con el borde limpio y alguna grieta.
          const v = F.rock(gx, gy);
          col = v < 0.38 ? top[0] : v > 0.66 ? top[2] : top[1];
          const c = F.crack(gx, gy) - 0.5;
          if (Math.abs(c) < 0.018 && H(gx >> 2, gy >> 2, 29) < 0.6) col = C.crack;
          else if (H(gx, gy, 25) < 0.008) col = C.wallLight;
          // Bordes: contorno oscuro fuera, canto con luz dentro (más a la izquierda y arriba).
          const edgeY = rows - FACE - 1;
          if (!n && y === 0) col = C.wallEdge;
          else if (!n && y === 1) col = C.wallLight;
          else if (!n && y === 2) col = C.wallRim;
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
   * Bosque (paredes 'bush'): arriba, las copas de conífera en filas (canopy; en el
   * borde de arriba, sus puntas con el suelo entre ellas); delante, la falda de las
   * copas colgando y los troncos en la sombra.
   */
  function paintBush(P, C, ox, oy, tx, gy0, rows, FACE, n, s, w, e) {
    const Tr = C.trunk, full = C.canopy;
    const top = n ? null : C.canopyTop[(gy0 >> 3) & 1];
    for (let y = 0; y < rows; y++) {
      const gy = gy0 + y;
      const bw = w ? -9 : BUMP[(gy + 7) & 31], be = e ? -9 : BUMP[(gy + 19) & 31];
      for (let x = 0; x < T; x++) {
        const gx = tx * T + x;
        if (x < bw || T - 1 - x < be) continue;
        let col;
        if (y >= rows - FACE) {
          const fy = y - (rows - FACE);
          // Las faldas de la última fila de copas cuelgan sobre los troncos (más en Ultra).
          const lip = (FACE > 8 ? 5 : 2) + BUMP[(gx + 5) & 31];
          if (fy < lip - 1) col = full[(gy & 31) * 32 + (gx & 31)];
          else if (fy === lip - 1) col = C.wallEdge;
          else {
            // Troncos de 2 px debajo de cada copa (cada 8 px, como las copas de las dos
            // últimas filas), con luz a la izquierda; entre ellos, la sombra verde lisa.
            // (gx & 7 también con x negativas: antes, con %, allí no salía ningún tronco
            // y la cara del bosque era un bloque oscuro.)
            const m = gx & 7, trunk = m === 7 || m === 0;
            col = m === 7 ? Tr[1] : m === 0 ? C.trunkDark : C.gap;
            if (fy === lip && trunk) col = C.trunkDark;               // sombra de las copas en el tronco
            if (y === rows - 1) col = trunk || m === 6 || m === 1 ? C.trunkDark : C.wallEdge;   // raíces
          }
          if (!w && x === bw && fy >= lip) col = C.wallEdge;
          if (!e && T - 1 - x === be && fy >= lip) col = C.wallEdge;
        } else {
          col = top && y < 32 ? top[y * 32 + (gx & 31)] : full[(gy & 31) * 32 + (gx & 31)];
          if (!(col >>> 24)) continue;                  // entre las puntas: el suelo de detrás
          if (!w && x === bw) col = C.wallEdge;
          if (!e && T - 1 - x === be) col = C.wallEdge;
        }
        P.set(ox + x, oy + y, col);
      }
    }
  }

  /*
   * Agua (y lava, veneno...): orilla clara de espuma, una franja menos honda y el
   * resto liso, con ondas «~» (como los estanques de las rutas). Arriba se ve el
   * talud de tierra (el agua está más baja que el suelo).
   */
  function paintLiquid(P, C, ox, oy, tx, ty, at) {
    const L = (x, y) => at(x, y) === 'liquid';
    const n = L(tx, ty - 1), s = L(tx, ty + 1), w = L(tx - 1, ty), e = L(tx + 1, ty);
    const nw = L(tx - 1, ty - 1), ne = L(tx + 1, ty - 1), sw = L(tx - 1, ty + 1), se = L(tx + 1, ty + 1);
    const BIG = 99, RC = 4.5;               // radio de las esquinas de fuera
    // Una o dos ondas «~» por tile, en sitios fijos según el tile.
    const wv = [[Math.floor(H(tx, ty, 37) * 9) + 1, Math.floor(H(tx, ty, 38) * 5) + 3], [Math.floor(H(tx, ty, 39) * 9) + 2, Math.floor(H(tx, ty, 40) * 4) + 10]];
    const twoW = H(tx, ty, 41) < 0.6;

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
        if (d < 0) continue;                 // se ve el suelo de debajo

        const gx = tx * T + x;
        let col;
        // Orilla de arriba: el agua está más baja que el suelo y se ve el talud
        // de tierra (dos filas) y su sombra en el agua.
        const dn = n ? BIG : y;
        if (dn <= d + 0.6 && dn < 4) {
          col = dn < 1 ? C.bank[2] : dn < 2 ? C.bank[1] : dn < 3 ? C.bank[0] : C.bankShadow;
        } else if (d < 1) col = C.foam;                                       // espuma de la orilla
        else if (d < 3) col = C.liqLight;                                     // franja menos honda
        else col = d > 6.5 ? C.liqDeep : C.liq;
        if (d >= 3 && dn >= 4) {
          // Ondas «~» de 5 px.
          for (let q = 0; q < (twoW ? 2 : 1); q++) {
            const [wx, wy] = wv[q], rx = x - wx, ry = y - wy;
            if ((ry === 0 && (rx === 1 || rx === 2)) || (ry === 1 && (rx === 0 || rx === 3 || rx === 4))) col = C.liqLight;
          }
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
   *   grass     aspecto*3 + estado (0 quieta · 1 viento · 2 la pisan)
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
   * una elipse suave (dos tonos) debajo, como en los juegos de DS.
   */
  const SHADOW = { tree: [11, 3.5], rock: [9, 3], chest: [7, 2.5], bigchest: [11, 3], altar: [8, 3] };
  const shadowCache = new Map();
  function shadow(type) {
    let cv = shadowCache.get(type);
    if (cv) return cv;
    const [rx, ry] = SHADOW[type] || [7, 2.5];
    const w = Math.ceil(rx) * 2 + 1, h = Math.ceil(ry) * 2 + 1, cx = (w - 1) / 2, cy = (h - 1) / 2;
    const P = Pix(w, h);
    const out = pack('#06200e', 54), core = pack('#06200e', 84);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (q <= 1) P.set(x, y, q < 0.5 ? core : out);
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

  // Copa redonda: racimos [x, y, radio].
  const ROUND = [[15, 20, 10], [9, 16, 7], [21, 16, 7], [15, 10, 8], [10, 23, 6], [20, 23, 6]];

  const PAINT = {
    /*
     * Árboles de las rutas: 0 y 1, coníferas redondeadas (como las de Sinnoh; la 1,
     * más estrecha); 2, árbol de copa redonda. Dibujo propio.
     */
    tree(B, variant = 0) {
      if (B.prop === 'crystal') return PAINT.crystal(B, variant);
      if (B.prop === 'dead') return PAINT.deadtree(B, variant);
      const look = variant % 3;
      if (look < 2) return PAINT.conifer(B, look);
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
      // borde de abajo de cada racimo en sombra.
      for (const [bx, by, br] of ROUND) {
        disc(P, bx, by, br, (x, y, d) => {
          const lit = ((x - bx) * -0.6 + (y - by) * -0.8) / br;
          let idx = lit > 0.5 ? 3 : lit > 0.05 ? 2 : lit > -0.45 ? 1 : 0;
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

    /*
     * Conífera redondeada de las rutas (dibujo propio): pisos de ramas con la falda
     * redondeada a bultos, cada uno tapando el de debajo, luz en la cresta del
     * centro y a la izquierda, contorno oscuro y un poco de tronco abajo.
     * look 1: más estrecha y baja.
     */
    conifer(B, look = 0) {
      const narrow = look === 1;
      const Wd = narrow ? 24 : 30, Ht = narrow ? 38 : 44, cx = Wd / 2;
      const P = Pix(Wd, Ht);
      const L = ramp(B.leaf), Tr = ramp(B.trunk);
      const hi = mixPack(sortHex(B.leaf)[3], '#ffffff', 0.3);
      const edge = pack(shade(sortHex(B.leaf)[0], -0.6));
      const k = narrow ? 0.8 : 1;
      // Tronco.
      for (let y = Ht - 7; y < Ht - 1; y++) for (let x = Math.floor(cx) - 2; x < Math.floor(cx) + 2; x++)
        P.set(x, y, x === Math.floor(cx) - 2 ? Tr[1] : x === Math.floor(cx) + 1 ? mixPack(sortHex(B.trunk)[0], '#000000', 0.3) : Tr[0]);
      // Pisos: [y de arriba, y de abajo, medio ancho abajo]; de abajo arriba.
      const tiers = narrow
        ? [[1, 12, 5.5], [7, 21, 8.2], [14, 30, 10.6]]
        : [[1, 12, 6], [7, 21, 9.4], [14, 30, 12.2], [22, 37, 14]];
      for (let ti = tiers.length - 1; ti >= 0; ti--) {
        const [y0, y1, hw0] = tiers[ti], hwB = hw0 * (narrow ? 1 : k);
        for (let y = y0; y <= y1 + 1; y++) {
          const t = Math.min(1, (y - y0) / (y1 - y0));
          const half = 1.2 + (hwB - 1.2) * Math.pow(t, 0.75);
          for (let x = 0; x < Wd; x++) {
            const dx = x + 0.5 - cx, u = dx / half;
            if (Math.abs(u) > 1) continue;
            // Falda redondeada: bultos de 4 px (más abajo en el centro de cada bulto).
            const bump = Math.cos(((x + ti * 2) % 4) / 4 * Math.PI * 2) > 0 ? 1 : 0;
            if (y > y1 + bump - (Math.abs(u) > 0.85 ? 1 : 0)) continue;
            let idx = u < -0.4 ? 3 : u < 0.1 ? 2 : u < 0.6 ? 1 : 0;
            if (y >= y1 + bump - 1) idx = Math.max(0, idx - 2);                 // la falda, en sombra
            else if (Math.abs(dx) < 1.5 && t < 0.6) idx = 3;                    // cresta del centro, con luz
            else if (t < 0.18) idx = Math.min(3, idx + 1);
            let c = L[idx];
            if (idx === 3 && H(x, y, 45 + look) < 0.3 && u < -0.2) c = hi;
            P.set(x, y, c);
          }
        }
      }
      outline(P, edge);
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
     * Hierba alta como la de los juegos de Pokémon de DS (dibujo propio): un tile que
     * se repite, con dos filas de matas de tres hojas (la de delante tapa la base de
     * la de detrás), oscuro abajo y con las puntas claras. Mide 18 px: 16 del tile y
     * uno de cada lado que coincide con el del vecino, así varias seguidas forman un
     * campo sin huecos; sobresale 2 px por arriba y tapa la mitad de abajo de quien
     * está dentro. Estado: 0 quieta · 1 viento · 2 la pisan.
     */
    grass(B, variant = 0) {
      if (variant >= 9) variant -= 9;                    // (las variantes 9..17 eran las del Ultra de antes)
      const P = Pix(18, 18);
      const Gc = ramp(B.grass);
      const out = pack(shade(sortHex(B.grass)[0], -0.58));
      const base = mixPack(sortHex(B.grass)[0], shade(sortHex(B.grass)[0], -0.58), 0.45);
      const tip = mixPack(sortHex(B.grass)[2], '#ffffff', 0.28);
      const look = Math.floor(variant / 3) % 3, st = variant % 3;
      const wind = st === 1 ? 1 : 0, open = st === 2 ? 1.4 : 0, low = st === 2 ? 2 : 0;
      // Base oscura que llena el tile por debajo de las puntas: el campo se ve entero.
      for (let y = 3; y < 18; y++) for (let x = 0; x < 18; x++) P.set(x, y, base);
      // Una mata: tres hojas que se afilan hasta la punta, claras a la izquierda,
      // con UN contorno alrededor (así cada mata se lee entera).
      const tuft = (bx, by, h) => {
        const px = new Map();
        const blade = (cx0, hh, lean) => {
          for (let i = 0; i < hh; i++) {
            const t = i / (hh - 1), cx = cx0 + lean * t * t * 2.2;
            const half = 1.9 * (1 - t) + 0.3;
            for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
              const right = x > cx + 0.3;
              const c = t > 0.62 ? (right ? Gc[2] : tip) : t > 0.25 ? (right ? Gc[1] : Gc[2]) : (right ? Gc[0] : Gc[1]);
              px.set(x + ',' + (by - i), c);
            }
          }
        };
        blade(bx - 2.4, h - 3 - low, -0.75 - open + wind);
        blade(bx + 2.4, h - 3 - low, 0.75 + open + wind);
        blade(bx, h - low, wind * 1.2);
        for (const k of px.keys()) {
          const [x, y] = k.split(',').map(Number);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) if (!px.has((x + dx) + ',' + (y + dy))) P.set(x + dx, y + dy, out);
        }
        for (const [k, c] of px) { const [x, y] = k.split(',').map(Number); P.set(x, y, c); }
      };
      // El dibujo se repite cada 16 px (el sprite empieza 1 px antes del tile).
      const hb = [9, 10, 8][look], hf = [10, 9, 11][look];
      for (const x of [-3, 5, 13, 21]) tuft(x + 1, 10, hb);           // fila de detrás
      for (const x of [1, 9, 17]) tuft(x + 1, 15, hf - 1);             // fila de delante (abajo queda la base oscura)
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
      if (kind === 2) return crackedTrap(P, B, f, cx, cy);
      // (27-10-2026) Sin el cerco oscuro de antes: alrededor, el suelo del bioma
      // teñido del color de la trampa, a trozos, para que parezca parte del campo.
      // La pegajosa es miel ámbar (antes, verde: sobre la hierba casi no se veía).
      const pal = kind === 0
        ? ['#3a1748', '#6e2b8a', '#9b48bb', '#d9a0ee']
        : ['#7a4510', '#c8841c', '#eab040', '#fff2b8'];
      const [rim, body, mid, hi] = pal.map(h => pack(h));
      const stain = mixPack(sortHex(B.floor)[0], pal[1], 0.32), stain2 = mixPack(sortHex(B.floor)[0], pal[0], 0.5);
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
        if (d > 1) {                                                       // suelo manchado alrededor, a trozos
          if (H(x, y, 89 + kind) < 0.7) P.set(x, y, d < 1.12 && y > cy ? stain2 : stain);
          continue;
        }
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
    const deep = pack(shade(sortHex(B.floor)[0], -0.45)), lip = pack(shade(sortHex(B.floor)[2], 0.22));
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
    // Alrededor, el suelo con grietitas que salen (a trozos, del color del suelo
    // más oscuro): se funde con el campo en vez de un cerco negro.
    const ring = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) {
      if (P.get(x, y) >>> 24) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => x + a >= 0 && x + a < 24 && y + b >= 0 && y + b < 16 && (P.get(x + a, y + b) >>> 24))) ring.push([x, y]);
    }
    const rim = mixPack(sortHex(B.floor)[0], '#000000', 0.28);
    for (const [x, y] of ring) if (H(x, y, 84) < 0.75) P.set(x, y, rim);
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

  function clearProps() { propCache.clear(); }

  return { T, RAISE, CAP_H, BIOMES, NORMAL, ARENA, ARENA_THEMES, ARENA_TYPES, paintChunk, propSprite, shadow, clearProps,
           /** Índice de bioma de la arena de un tipo. */
           arenaBiome: type => ARENA + Math.max(0, ARENA_TYPES.indexOf(type)) };
})();
