/* ============ village.js — la aldea del menú: plano, carpas, Pokémon y frases (datos) ============
 * Pedido del dueño (11-11-2026): el menú principal es una aldea Pokémon por la que se pasea con tu Pokémon. Cada carpa
 * abre un apartado del menú de siempre; para jugar se va al monumento, un árbol enorme con un portal en el tronco.
 * Decisiones del dueño: un Pokémon tendero en cada carpa y paseantes clásicos fijos; ciclo de día corto (~10 min); el
 * menú clásico sólo sale si falla el 3D.
 *
 * Unidades: casillas de 48 de mundo (24 px de arte), x al este, y al sur. Los sitios llevan su centro (x, y), su planta
 * (w × h, lo que no se puede pisar) y su puerta (door: donde hay que estar para entrar, delante de la fachada sur).
 * El plano se construye con build(): suelo, setos del borde (pared del tileset), estanque y las máscaras de caminos,
 * plaza y hierba alta. Todo sale de un hash fijo: siempre la misma aldea.
 */
G.VILLAGE = (() => {
  const W = 46, H = 38, TS = 48;
  const BI = 3;                                // tileset del suelo: LushPrairie («normal»: pradera verde con agua azul)

  /*
   * Sitios. go: lo que abre (village.js, open). icon: G.Icons. look: el modelo de village3d.js y sus colores.
   * npc: el tendero (dex) y dónde está, con sus frases. Los textos en español; el inglés, en lang-en.js.
   */
  const PLACES = [
    { id: 'play', go: 'play', name: 'Árbol del Portal', act: 'Jugar', sub: 'Entra en la mazmorra', icon: 'ball',
      x: 23, y: 6.2, w: 4.6, h: 3, door: [23, 9.2], look: { kind: 'tree' },
      npc: { dex: 185, at: [27.4, 9.4], lines: ['¿Un árbol? ¡Sí, soy un árbol! ...No me mires así.', 'El portal lleva a la mazmorra. Nadie sabe quién plantó este árbol.', 'Cuando cae la noche, el portal brilla más.'] } },
    { id: 'goals', go: 'goals', name: 'Tablón de misiones', act: 'Mirar', sub: 'Misiones y premios', icon: 'medal3',
      x: 15.5, y: 9.2, w: 3, h: 1, door: [15.5, 10.6], look: { kind: 'board' },
      npc: { dex: 441, at: [13.4, 10.8], lines: ['¡Atención, atención! Hay misiones nuevas en el tablón.', 'Cumple misiones y recoge tus premios aquí.', '¡Cuidado! ¡Los encargos no se hacen solos!'] } },
    { id: 'ach', go: 'ach', name: 'Vitrina de logros', act: 'Mirar', sub: 'Tus logros', icon: 'medal1',
      x: 30.5, y: 9.2, w: 2.2, h: 1.4, door: [30.5, 10.6], look: { kind: 'case' },
      npc: { dex: 302, at: [32.6, 10.8], lines: ['Brillan... ¡todos tus logros brillan!', 'Me encantan las cosas que relucen. Consigue más logros, ¿vale?', 'No pienso comérmelos. Bueno... quizá uno.'] } },
    { id: 'upgrades', go: 'upgrades', name: 'Carpa de Mejoras', act: 'Entrar', sub: 'Haz más fuerte cada run', icon: 'up',
      x: 8, y: 12, w: 3.6, h: 3, door: [8, 14.3], look: { kind: 'tent', shape: 4, a: '#c8423a', b: '#f2e8d2', trim: '#f0c050', flag: '#c8423a', r: 1.75 },
      npc: { dex: 67, at: [10.2, 14.4], lines: ['¡Entrena duro y vuelve más fuerte!', 'Cada mejora cuenta. ¡Hasta la más pequeña!', '¡Uno, dos! ¡Uno, dos! ¿Entrenas conmigo?'] } },
    { id: 'gacha', go: 'gacha', name: 'Carpa del Gacha', act: 'Entrar', sub: '9 regiones · Pokémon y shinies', icon: 'ball4',
      x: 38, y: 12, w: 3.8, h: 3.2, door: [38, 14.4], look: { kind: 'tent', shape: 10, a: '#e0b030', b: '#c8407a', trim: '#7a3cc0', flag: '#ffd84a', r: 1.85, ball: true },
      npc: { dex: 52, at: [35.8, 14.6], lines: ['¡Tira y prueba suerte, nya!', 'Dicen que hoy salen muchos shinies... o eso digo yo.', 'Las monedas brillan, pero un shiny brilla más, nya.'] } },
    { id: 'dex', go: 'dex', name: 'Carpa de la Pokédex', act: 'Entrar', sub: 'Tus Pokémon', icon: 'book',
      x: 7.5, y: 19, w: 3.4, h: 3, door: [7.5, 21.2], look: { kind: 'tent', shape: 8, a: '#3c78c8', b: '#eef2fa', trim: '#f0c050', flag: '#3c78c8', r: 1.7 },
      npc: { dex: 137, at: [9.7, 21.4], lines: ['Datos cargados. Tu Pokédex te espera.', 'Pi-pi. Registro cada Pokémon que consigues.', 'Error 404: Pokémon no encontrado. ¡Ve a buscarlo!'] } },
    { id: 'shop', go: 'shop', name: 'Tienda Kecleon', act: 'Entrar', sub: 'Mentas, Cápsulas y MT', icon: 'shop',
      x: 38.5, y: 19, w: 3.8, h: 2.2, door: [38.5, 20.9], look: { kind: 'stall', a: '#4aa84a', b: '#8a4ab8' },
      npc: { dex: 352, at: [38.5, 19.22], counter: true, lines: ['¡Bienvenido! ¡Bienvenido! Pasa y mira.', 'Hoy tengo mentas y cápsulas a buen precio.', 'Aquí no se roba, ¿eh? Je, je.'] } },
    { id: 'compendium', go: 'compendium', name: 'Carpa del Compendio', act: 'Entrar', sub: 'Ataques, pasivas y objetos', icon: 'cards',
      x: 8, y: 25.6, w: 3.4, h: 3, door: [8, 27.8], look: { kind: 'tent', shape: 6, a: '#6a3cb0', b: '#e8d8a8', trim: '#3cc0b0', flag: '#e8c040', r: 1.7 },
      npc: { dex: 178, at: [10.2, 27.9], lines: ['Lo veo todo: pasado, presente... y tus ataques.', 'El saber es la mejor arma de un explorador.', '...'] } },
    { id: 'bag', go: 'bag', name: 'Almacén', act: 'Entrar', sub: 'Tu mochila', icon: 'bag',
      x: 38, y: 25.2, w: 3.4, h: 2.4, door: [38, 27.2], look: { kind: 'hut' },
      npc: { dex: 115, at: [35.8, 27.4], lines: ['Te guardo todo lo que traigas. Bien guardadito.', 'Mi bolsa siempre tiene sitio para una cosa más.', '¿Has mirado tu mochila? Igual llevas algo útil.'] } },
    { id: 'profile', go: 'profile', name: 'Tu casa', act: 'Entrar', sub: 'Tu perfil y tus partidas', icon: 'crown',
      x: 12, y: 29.8, w: 3.6, h: 2.6, door: [12, 31.8], look: { kind: 'house' } },
    { id: 'news', go: 'news', name: 'Buzón de novedades', act: 'Leer', sub: 'Lo nuevo del juego', icon: 'star',
      x: 17.6, y: 31, w: 1, h: 0.8, door: [17.6, 32.1], look: { kind: 'mailbox' },
      npc: { dex: 279, at: [19.2, 31.6], lines: ['¡Correo! ¡Hay novedades en el buzón!', 'Reparto las noticias de la aldea. ¡Todas!', 'Hoy hace buen viento para volar.'] } },
    { id: 'settings', go: 'settings', name: 'PC de ajustes', act: 'Usar', sub: 'Sonido, gráficos y controles', icon: 'scope-lens',
      x: 21, y: 31, w: 1.6, h: 1, door: [21.2, 32.2], look: { kind: 'pc' },
      npc: { dex: 479, at: [19.9, 30.2], lines: ['¡Bzzt! Vivo dentro de este PC. Y lo arreglo todo.', 'Sonido, gráficos, controles... ¡Lo que quieras!', '¡Bzzzt! Perdona, me ha dado un calambre.'] } },
    { id: 'friends', go: 'friends', name: 'Carpa del Grupo', act: 'Entrar', sub: 'Juega en grupo, hasta 4', icon: 'friends',
      x: 28, y: 29.8, w: 4.4, h: 2.8, door: [28, 31.9], look: { kind: 'tent', shape: 12, a: '#e07830', b: '#30a8a0', trim: '#f4e8c8', flag: '#e07830', r: 1.9, wide: true },
      npc: { dex: 327, at: [30.8, 32.1], lines: ['¡Juntos se explora mejor! Hasta cuatro a la vez.', 'Invita a tus amigos y entrad en la mazmorra.', 'Bailo así desde que nací. ¿Bailas conmigo?'] } },
    { id: 'rank', go: 'rank', name: 'Podio del Ranking', act: 'Mirar', sub: 'Quién aguanta más', icon: 'trophy',
      x: 34.2, y: 30.6, w: 3, h: 1.4, door: [34.2, 32.1], look: { kind: 'podium' },
      npc: { dex: 448, at: [36.4, 32.2], lines: ['Los mejores exploradores suben a este podio.', 'Aguanta más que nadie y tu nombre saldrá aquí.', 'Siento tu aura. Hoy puedes batir tu récord.'] } }
  ];

  /*
   * Paseantes (clásicos fijos, decisión del dueño). at: dónde vive (pasea cerca); r: cuánto se aleja (casillas).
   * follow: puede seguirte un rato. Los fijos (still) no se mueven: Snorlax duerme, Slowpoke pesca, Magikarp salpica.
   * lowq: en calidad baja también sale (si no, sólo con calidad media o alta).
   */
  const CAST = [
    { dex: 25, at: [23, 22], r: 5, follow: true, lowq: true, emote: '!', lines: ['¡Pika! ¡Pikachu!', '¡Pika pika! (Parece contento de verte.)', '¡Chuuu!'] },
    { dex: 133, at: [19, 24], r: 4, follow: true, lowq: true, emote: '♥', lines: ['¡Vui! (Te mira con curiosidad.)', '¡Eevee! (Mueve la cola.)', '¡Vuii!'] },
    { dex: 1, at: [15, 17], r: 3, follow: true, lowq: true, emote: '♪', lines: ['¡Bulba! (Sacude las hojas al sol.)', '¡Bulbasaur!', '¡Saur, saur!'] },
    { dex: 4, at: [30, 17], r: 3, follow: true, emote: '!', lines: ['¡Char! (Su llama arde con fuerza.)', '¡Charmander!', '¡Chaaar!'] },
    { dex: 7, at: [32, 24], r: 3, follow: true, emote: '♪', lines: ['¡Vamos a la mazmorra! ...¡Squirtle!', '¡Squirtle squirt!', '¡Vamo vamo!'] },
    { dex: 39, at: [23, 15.8], r: 2, emote: '♪', lines: ['¡Jiggly... puuuff! ♪ (Canta en la plaza.)', '¡Puri puri! ♪', '...¿Te has dormido? ¡Qué falta de respeto!'] },
    { dex: 54, at: [37.5, 31.5], r: 1.5, emote: '?', lines: ['¿Psy...? (Le duele la cabeza.)', '¡Psyduck! ...¿Psy?', '...'] },
    { dex: 175, at: [14, 27], r: 2.5, follow: true, emote: '♥', lines: ['¡Toge togepi! ♥', '¡Prrriii!', '¡Togepi!'] },
    { dex: 183, at: [39.5, 29.2], r: 2, emote: '♪', lines: ['¡Marill! (Juega junto al agua.)', '¡Ma-rill!', '¡Riru!'] },
    { dex: 16, at: [17, 13.5], r: 4, emote: '!', lines: ['¡Pidgey! (Picotea el suelo.)', '¡Pi-pidgey!', '¡Gey!'] },
    { dex: 43, at: [30, 26], r: 2, emote: '♪', lines: ['¡Oddish! (Se mueve con el viento.)', '¡Odd-odd!', '¡Shhh! Estoy tomando el sol.'] },
    { dex: 12, at: [11, 23], r: 4, fly: true, emote: '♪', lines: ['¡Free! ¡Butterfree! (Revolotea entre las flores.)', '¡Furi furi!', '¡Free!'] },
    { dex: 143, at: [4.6, 20.4], still: 'Sleep', lowq: true, emote: 'z', lines: ['Zzz... Zzz...', 'Zzz... ¿comida...? Zzz...', '...Ronca tan fuerte que tiembla la hierba.'] },
    { dex: 79, at: [39.2, 32.6], still: 'Idle', dir: 3, emote: '…', lines: ['... ... ...¿Slow?', '(Lleva toda la mañana pescando. No ha pescado nada.)', '...Poke.'] },
    { dex: 129, at: [42.6, 31.4], still: 'Idle', water: true, emote: '!', lines: ['¡Splash! ¡Splash!', '(Salta y salta. No pasa nada.)', '¡Karp!'] }
  ];

  /** Frases de cuando te sigue o se va. */
  const FOLLOW = ['¡Voy contigo un rato!', '¡Te acompaño!', '¡Vamos juntos!'];
  const BYE = ['¡Hasta luego!', '¡Me vuelvo a casa!', '¡Adiós!'];

  /*
   * Decorados 3D (village3d.js). tree: árbol; lamp: farolillo; bench; barrel; crate; fence (de [x0,y0] a [x1,y1]); rock;
   * flowers (macizo de flores); fountain (la fuente de la plaza); reeds (juncos); sign (letrero); well (pozo).
   * Los que se pueden pisar no llevan r.
   */
  const DECOR = [
    { k: 'fountain', x: 23, y: 19.2, r: 1.15 },
    // árboles junto al seto (y alguno suelto)
    { k: 'tree', x: 4, y: 4.6, s: 1.1, r: 0.55 }, { k: 'tree', x: 8.6, y: 4.2, s: 0.95, r: 0.5 }, { k: 'tree', x: 14, y: 3.8, s: 1.05, r: 0.55 },
    { k: 'tree', x: 32, y: 3.8, s: 1.05, r: 0.55 }, { k: 'tree', x: 37.4, y: 4.2, s: 0.95, r: 0.5 }, { k: 'tree', x: 42, y: 4.8, s: 1.1, r: 0.55 },
    { k: 'tree', x: 3.6, y: 9.4, s: 0.9, r: 0.5 }, { k: 'tree', x: 42.6, y: 9.6, s: 0.9, r: 0.5 }, { k: 'tree', x: 3.4, y: 19, s: 1.2, r: 0.6 },
    { k: 'tree', x: 42.8, y: 17.6, s: 1, r: 0.5 }, { k: 'tree', x: 3.6, y: 29.4, s: 1, r: 0.5 }, { k: 'tree', x: 43, y: 24.6, s: 0.9, r: 0.5 },
    { k: 'tree', x: 4.4, y: 33.2, s: 0.85, r: 0.45 }, { k: 'tree', x: 25.6, y: 34, s: 0.8, r: 0.45 }, { k: 'tree', x: 14.6, y: 22.6, s: 0.8, r: 0.45 },
    { k: 'tree', x: 31.8, y: 21.6, s: 0.8, r: 0.45 },
    // farolillos por los caminos
    { k: 'lamp', x: 21.4, y: 12.6, r: 0.25 }, { k: 'lamp', x: 24.6, y: 12.6, r: 0.25 }, { k: 'lamp', x: 21.4, y: 26.4, r: 0.25 }, { k: 'lamp', x: 24.6, y: 26.4, r: 0.25 },
    { k: 'lamp', x: 13.4, y: 20.2, r: 0.25 }, { k: 'lamp', x: 32.6, y: 20.2, r: 0.25 }, { k: 'lamp', x: 10.2, y: 16.6, r: 0.25 }, { k: 'lamp', x: 35.8, y: 16.6, r: 0.25 },
    { k: 'lamp', x: 16.2, y: 33.2, r: 0.25 }, { k: 'lamp', x: 31.2, y: 33.2, r: 0.25 },
    // la plaza
    { k: 'bench', x: 19.2, y: 16.4, r: 0.4 }, { k: 'bench', x: 26.8, y: 16.4, r: 0.4 }, { k: 'flowers', x: 19.4, y: 22.2 }, { k: 'flowers', x: 26.6, y: 22.2 },
    // tienda y almacén
    { k: 'barrel', x: 36, y: 18.4, r: 0.3 }, { k: 'crate', x: 41, y: 18.6, r: 0.32 }, { k: 'barrel', x: 40.6, y: 25, r: 0.3 }, { k: 'crate', x: 40.4, y: 26.2, r: 0.32 },
    { k: 'crate', x: 35.6, y: 24.6, r: 0.32 },
    // casa y jardín
    { k: 'flowers', x: 9.4, y: 31.4 }, { k: 'flowers', x: 14.6, y: 31.4 }, { k: 'fence', a: [8.6, 28.2], b: [8.6, 32.6] }, { k: 'well', x: 6.8, y: 30.6, r: 0.6 },
    // estanque
    { k: 'reeds', x: 39, y: 30 }, { k: 'reeds', x: 44, y: 29.4 }, { k: 'reeds', x: 44.2, y: 32.6 }, { k: 'rock', x: 38.4, y: 31.2, r: 0.35 }, { k: 'rock', x: 43.6, y: 28.6, r: 0.3 },
    // árbol del portal: setas que brillan y antorchas
    { k: 'torch', x: 20.2, y: 9.4, r: 0.22 }, { k: 'torch', x: 25.8, y: 9.4, r: 0.22 },
    { k: 'flowers', x: 6, y: 7.4 }, { k: 'flowers', x: 40.4, y: 7.6 }, { k: 'rock', x: 5.2, y: 14.6, r: 0.35 }, { k: 'rock', x: 41.4, y: 14.2, r: 0.3 }
  ];

  /** Caminos (de tierra): tramos [x0, y0, x1, y1] con su ancho (casillas). La plaza: círculo de piedra. */
  const PATHS = [
    [23, 9.6, 23, 15.8], [23, 22.6, 23, 32.8],
    [15.5, 11, 30.5, 11], [8, 14.8, 11.6, 14.8], [11.6, 14.8, 11.6, 28.4], [8, 28.4, 11.6, 28.4], [7.5, 21.6, 19.6, 21.6],
    [38, 14.8, 34.4, 14.8], [34.4, 14.8, 34.4, 27.8], [38, 27.8, 34.4, 27.8], [26.4, 21.6, 38.5, 21.6],
    [12, 32.8, 34.2, 32.8]
  ];
  const PATH_W = 1.7;
  const PLAZA = { x: 23, y: 19.2, r: 3.7 };
  const POND = { x: 41.6, y: 31, rx: 2.9, ry: 2.1 };
  /** Hierba alta (manchas: x, y, radio). */
  const GRASS = [[14.6, 16.4, 1.9], [31.6, 16.2, 1.9], [5.4, 26.8, 1.7], [41.2, 6.8, 1.8], [5.2, 6.6, 1.6], [16.8, 25.6, 1.4], [29.8, 25.4, 1.5], [26.8, 6.4, 1.2], [19, 6.6, 1.2]];
  const SPAWN = [23, 24];

  // ---------------- el plano ----------------
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** Distancia del punto (px, py) al tramo (x0, y0)-(x1, y1). */
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L)) : 0;
    return Math.hypot(px - x0 - dx * t, py - y0 - dy * t);
  }

  let built = null;
  /**
   * → { W, H, terr: Uint8Array (0 suelo, 1 seto, 2 agua), path: Float32Array (0..1, cuánto camino), plaza, grass } por casilla.
   * El centro de la casilla (tx, ty) está en (tx + 0.5, ty + 0.5).
   */
  function build() {
    if (built) return built;
    const n = W * H, terr = new Uint8Array(n), path = new Float32Array(n), plaza = new Uint8Array(n), grass = new Uint8Array(n);
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const i = ty * W + tx, cx = tx + 0.5, cy = ty + 0.5;
      // Setos del borde: 2 casillas, con bultos hacia dentro (sin llegar a los caminos).
      const e = Math.min(tx, ty, W - 1 - tx, H - 1 - ty);
      let p = 0;
      for (const s of PATHS) p = Math.max(p, 1 - segDist(cx, cy, s[0], s[1], s[2], s[3]) / (PATH_W / 2 + 0.4));
      if (e < 2 || (p <= 0 && ((e === 2 && hash(tx, ty, 7) < 0.45) || (e === 3 && hash(tx, ty, 8) < 0.12 && hash(tx >> 1, ty >> 1, 9) < 0.5)))) terr[i] = 1;
      // Estanque (elipse con el borde algo irregular).
      const pd = Math.hypot((cx - POND.x) / POND.rx, (cy - POND.y) / POND.ry);
      if (pd < 1 - hash(tx, ty, 11) * 0.12) terr[i] = 2;
      // Caminos (0..1 según lo cerca del centro del tramo) y plaza.
      const pz = Math.hypot(cx - PLAZA.x, cy - PLAZA.y);
      if (pz < PLAZA.r) { plaza[i] = 1; p = 0; }
      path[i] = Math.max(0, p);
      for (const [gx, gy, gr] of GRASS) if (Math.hypot(cx - gx, cy - gy) < gr * (0.8 + hash(tx, ty, 13) * 0.35)) grass[i] = 1;
      if (terr[i] || path[i] > 0.2 || plaza[i]) grass[i] = 0;
    }
    built = { W, H, terr, path, plaza, grass };
    return built;
  }
  /** Terreno de la casilla (fuera del plano: seto). */
  function terrainAt(tx, ty) {
    const b = build();
    return tx < 0 || ty < 0 || tx >= W || ty >= H ? 1 : b.terr[ty * W + tx];
  }

  return { W, H, TS, BI, PLACES, CAST, DECOR, PATHS, PATH_W, PLAZA, POND, GRASS, SPAWN, FOLLOW, BYE, build, terrainAt, hash };
})();
