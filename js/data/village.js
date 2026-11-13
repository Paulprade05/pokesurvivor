/* ============ village.js — la aldea del menú: plano, chozas, Pokémon y frases (datos) ============
 * Pedido del dueño (11-11-2026): el menú principal es una aldea Pokémon por la que se pasea con tu Pokémon. Cada choza
 * abre un apartado del menú de siempre; para jugar se va al monumento.
 * Decisiones del dueño: un Pokémon tendero en cada choza y paseantes clásicos fijos; ciclo corto (~10 min); el menú
 * clásico sólo sale si falla el 3D.
 * (12-11-2026) Segunda fase, pedida por el dueño: «algo más misterioso, algo que puedan construir los Pokémon y esté en un
 * bosque, como una tribu de ciencia ficción con tecnología pero con naturaleza». Eligió el bosque bioluminiscente: casi
 * siempre de noche, setas, vainas y lianas que brillan en verde, cian y rosa, tecnología de la tribu (cables, cristales
 * de energía, hologramas) y el monumento es una flor gigante con el portal en el centro. Tu choza se personaliza con
 * monedas (data/home.js).
 *
 * Unidades: casillas de 48 de mundo (24 px de arte), x al este, y al sur. Los sitios llevan su centro (x, y), su planta
 * (w × h: dónde se toca o se hace clic para ir y dónde va su nombre) y su puerta (door: donde hay que estar para entrar,
 * delante de la fachada sur). Lo que choca no sale de aquí, sino de los modelos 3D (village3d.js solids, abajo hits).
 * El plano se construye con build(): suelo, el bosque del borde (pared del tileset: pinos), la charca y las máscaras de
 * caminos, plaza y hierba alta. Todo sale de un hash fijo: siempre la misma aldea.
 */
G.VILLAGE = (() => {
  const W = 46, H = 38, TS = 48;
  const BI = 18;                               // tileset del suelo: DeepDuskForest («siniestro»: bosque de pinos de noche)

  /*
   * Sitios. go: lo que abre (village.js, go). icon: G.Icons. look: el modelo de village3d.js y sus colores
   * (a: el de la choza, glow: el de su luz). npc: el tendero (dex) y dónde está, con sus frases.
   * Los textos en español; el inglés, en lang-en.js.
   */
  const PLACES = [
    // (13-11-2026, pedido del dueño: «mejora el altar para entrar a la partida») El Altar del Portal: más grande, con su
    // estrado y el círculo donde ponerse (door: el centro del círculo).
    { id: 'play', go: 'play', name: 'Altar del Portal', act: 'Jugar', sub: 'Entra en la mazmorra', icon: 'ball',
      x: 23, y: 8, w: 6, h: 3.6, door: [23, 9.4], look: { kind: 'altar' },
      npc: { dex: 185, at: [28.2, 11.9], lines: ['¿Un árbol? ¡Sí, soy un árbol! ...No me mires así.', 'Ponte en el círculo de luz del altar y el portal te llevará a la mazmorra.', 'Los Pokémon de la aldea lo cuidan. Dicen que lo construyó alguien de otro mundo.'] } },
    { id: 'goals', go: 'goals', name: 'Tótem de misiones', act: 'Mirar', sub: 'Misiones y premios', icon: 'medal3',
      x: 15.5, y: 9.2, w: 3, h: 1, door: [15.5, 10.6], look: { kind: 'board', glow: '#5ff0ff' },
      npc: { dex: 441, at: [13.4, 10.8], lines: ['¡Atención, atención! Hay misiones nuevas en el tótem.', 'Cumple misiones y recoge tus premios aquí.', '¡Cuidado! ¡Los encargos no se hacen solos!'] } },
    { id: 'ach', go: 'ach', name: 'Vitrina de logros', act: 'Mirar', sub: 'Tus logros', icon: 'medal1',
      x: 30.5, y: 9.2, w: 2.2, h: 1.4, door: [30.5, 10.6], look: { kind: 'case', glow: '#b07aff' },
      npc: { dex: 302, at: [32.6, 10.8], lines: ['Brillan... ¡todos tus logros brillan!', 'Me encantan las cosas que relucen. Consigue más logros, ¿vale?', 'No pienso comérmelos. Bueno... quizá uno.'] } },
    { id: 'upgrades', go: 'upgrades', name: 'Carpa de Mejoras', act: 'Entrar', sub: 'Haz más fuerte cada run', icon: 'up',
      x: 8, y: 12, w: 3.6, h: 3, door: [8, 14.3], look: { kind: 'pod', form: 'bulb', a: '#a8402e', glow: '#ff9a4a', r: 1.75 },
      npc: { dex: 67, at: [10.2, 14.4], lines: ['¡Entrena duro y vuelve más fuerte!', 'Cada mejora cuenta. ¡Hasta la más pequeña!', '¡Uno, dos! ¡Uno, dos! ¿Entrenas conmigo?'] } },
    { id: 'gacha', go: 'gacha', name: 'Carpa del Gacha', act: 'Entrar', sub: '9 regiones · Pokémon y shinies', icon: 'ball4',
      x: 38, y: 12, w: 3.8, h: 3.2, door: [38, 14.4], look: { kind: 'pod', form: 'dome', a: '#6a3a9a', glow: '#ff6ad8', r: 1.85, ball: true },
      npc: { dex: 52, at: [35.8, 14.6], lines: ['¡Tira y prueba suerte, nya!', 'Dicen que hoy salen muchos shinies... o eso digo yo.', 'Las monedas brillan, pero un shiny brilla más, nya.'] } },
    { id: 'dex', go: 'dex', name: 'Carpa de la Pokédex', act: 'Entrar', sub: 'Tus Pokémon', icon: 'book',
      x: 7.5, y: 19, w: 3.4, h: 3, door: [7.5, 21.2], look: { kind: 'pod', form: 'cone', a: '#2e5a9a', glow: '#5ff0ff', r: 1.7 },
      npc: { dex: 137, at: [9.7, 21.4], lines: ['Datos cargados. Tu Pokédex te espera.', 'Pi-pi. Registro cada Pokémon que consigues.', 'Error 404: Pokémon no encontrado. ¡Ve a buscarlo!'] } },
    { id: 'shop', go: 'shop', name: 'Tienda Kecleon', act: 'Entrar', sub: 'Mentas, Cápsulas y MT', icon: 'shop',
      x: 38.5, y: 19, w: 3.8, h: 2.2, door: [38.5, 20.9], look: { kind: 'stall', a: '#3a8a5a', glow: '#7cff7a' },
      npc: { dex: 352, at: [38.5, 19.22], counter: true, lines: ['¡Bienvenido! ¡Bienvenido! Pasa y mira.', 'Hoy tengo mentas y cápsulas a buen precio.', 'Aquí no se roba, ¿eh? Je, je.'] } },
    { id: 'compendium', go: 'compendium', name: 'Carpa del Compendio', act: 'Entrar', sub: 'Ataques, pasivas y objetos', icon: 'cards',
      x: 8, y: 25.6, w: 3.4, h: 3, door: [8, 28], look: { kind: 'pod', form: 'bulb', a: '#4a3a8a', glow: '#b07aff', r: 1.7 },
      npc: { dex: 178, at: [10.2, 27.9], lines: ['Lo veo todo: pasado, presente... y tus ataques.', 'El saber es la mejor arma de un explorador.', '...'] } },
    { id: 'bag', go: 'bag', name: 'Almacén', act: 'Entrar', sub: 'Tu mochila', icon: 'bag',
      x: 38, y: 25.2, w: 3.4, h: 2.4, door: [38, 27.2], look: { kind: 'mush', a: '#c8586a', glow: '#ff7ad8' },
      npc: { dex: 115, at: [35.8, 27.4], lines: ['Te guardo todo lo que traigas. Bien guardadito.', 'Mi bolsa siempre tiene sitio para una cosa más.', '¿Has mirado tu mochila? Igual llevas algo útil.'] } },
    { id: 'home', go: 'home', name: 'Tu choza', act: 'Entrar', sub: 'Personalízala con monedas', icon: 'sprout',
      x: 12, y: 29.8, w: 3.6, h: 2.6, door: [12, 31.8], look: { kind: 'home' } },
    { id: 'news', go: 'news', name: 'Buzón de novedades', act: 'Leer', sub: 'Lo nuevo del juego', icon: 'star',
      x: 17.6, y: 31, w: 1, h: 0.8, door: [17.6, 32.1], look: { kind: 'mailbox', glow: '#ffc04a' },
      npc: { dex: 279, at: [19.2, 31.6], lines: ['¡Correo! ¡Hay novedades en el buzón!', 'Reparto las noticias de la aldea. ¡Todas!', 'Esta noche el bosque brilla más que nunca.'] } },
    { id: 'settings', go: 'settings', name: 'Terminal de ajustes', act: 'Usar', sub: 'Sonido, gráficos y controles', icon: 'scope-lens',
      x: 21, y: 31, w: 1.6, h: 1, door: [21.2, 32.2], look: { kind: 'pc', glow: '#5ff0ff' },
      npc: { dex: 479, at: [19.9, 30.2], lines: ['¡Bzzt! Vivo dentro de este terminal. Y lo arreglo todo.', 'Sonido, gráficos, controles... ¡Lo que quieras!', '¡Bzzzt! Los cables de la aldea me hacen cosquillas.'] } },
    { id: 'friends', go: 'friends', name: 'Carpa del Grupo', act: 'Entrar', sub: 'Juega en grupo, hasta 4', icon: 'friends',
      x: 28, y: 29.8, w: 4.4, h: 2.8, door: [28, 32.2], look: { kind: 'pod', form: 'wide', a: '#2a7a6a', glow: '#7cff7a', r: 1.9, wide: true },
      npc: { dex: 327, at: [30.8, 32.1], lines: ['¡Juntos se explora mejor! Hasta cuatro a la vez.', 'Invita a tus amigos y entrad en la mazmorra.', 'Bailo así desde que nací. ¿Bailas conmigo?'] } },
    { id: 'rank', go: 'rank', name: 'Podio del Ranking', act: 'Mirar', sub: 'Quién aguanta más', icon: 'trophy',
      x: 34.2, y: 30.6, w: 3, h: 1.4, door: [34.2, 32.1], look: { kind: 'podium', glow: '#ffc04a' },
      npc: { dex: 448, at: [36.4, 32.2], lines: ['Los mejores exploradores suben a este podio.', 'Aguanta más que nadie y tu nombre saldrá aquí.', 'Siento tu aura. Hoy puedes batir tu récord.'] } }
  ];
  /** Dónde descansa la mascota de tu choza (data/home.js): junto a la puerta. */
  const PET = [14.2, 32];

  /*
   * Paseantes (clásicos fijos, decisión del dueño). at: dónde vive (pasea cerca); r: cuánto se aleja (casillas).
   * follow: puede seguirte un rato. Los fijos (still) no se mueven: Snorlax duerme, Slowpoke pesca, Magikarp salpica.
   * lowq: en calidad baja también sale (si no, sólo con calidad media o alta).
   */
  const CAST = [
    { dex: 25, at: [23, 22], r: 5, follow: true, lowq: true, emote: '!', lines: ['¡Pika! ¡Pikachu!', '¡Pika pika! (Sus mejillas chispean en la oscuridad.)', '¡Chuuu!'] },
    { dex: 133, at: [19, 24], r: 4, follow: true, lowq: true, emote: '♥', lines: ['¡Vui! (Te mira con curiosidad.)', '¡Eevee! (Mueve la cola.)', '¡Vuii!'] },
    { dex: 1, at: [15, 17], r: 3, follow: true, lowq: true, emote: '♪', lines: ['¡Bulba! (Su bulbo brilla un poco de noche.)', '¡Bulbasaur!', '¡Saur, saur!'] },
    { dex: 4, at: [30, 17], r: 3, follow: true, emote: '!', lines: ['¡Char! (Su llama alumbra el camino.)', '¡Charmander!', '¡Chaaar!'] },
    { dex: 7, at: [32, 24], r: 3, follow: true, emote: '♪', lines: ['¡Vamos a la mazmorra! ...¡Squirtle!', '¡Squirtle squirt!', '¡Vamo vamo!'] },
    { dex: 39, at: [23, 15.8], r: 2, emote: '♪', lines: ['¡Jiggly... puuuff! ♪ (Canta junto al manantial.)', '¡Puri puri! ♪', '...¿Te has dormido? ¡Qué falta de respeto!'] },
    { dex: 54, at: [37.5, 31.5], r: 1.5, emote: '?', lines: ['¿Psy...? (Le duele la cabeza.)', '¡Psyduck! ...¿Psy?', '...'] },
    { dex: 175, at: [14, 27], r: 2.5, follow: true, emote: '♥', lines: ['¡Toge togepi! ♥', '¡Prrriii!', '¡Togepi!'] },
    { dex: 183, at: [39.5, 29.2], r: 2, emote: '♪', lines: ['¡Marill! (Juega junto a la charca.)', '¡Ma-rill!', '¡Riru!'] },
    { dex: 16, at: [17, 13.5], r: 4, emote: '!', lines: ['¡Pidgey! (Picotea las esporas que caen.)', '¡Pi-pidgey!', '¡Gey!'] },
    { dex: 43, at: [30, 26], r: 2, emote: '♪', lines: ['¡Oddish! (Baila con las luciérnagas.)', '¡Odd-odd!', '¡Shhh! Estoy tomando la luz de la luna.'] },
    { dex: 12, at: [11, 23], r: 4, fly: true, emote: '♪', lines: ['¡Free! ¡Butterfree! (Revolotea entre las setas.)', '¡Furi furi!', '¡Free!'] },
    { dex: 143, at: [4.6, 20.4], still: 'Sleep', lowq: true, emote: 'z', lines: ['Zzz... Zzz...', 'Zzz... ¿comida...? Zzz...', '...Ronca tan fuerte que tiemblan las setas.'] },
    { dex: 79, at: [39.2, 32.6], still: 'Idle', dir: 3, emote: '…', lines: ['... ... ...¿Slow?', '(Lleva toda la noche pescando. No ha pescado nada.)', '...Poke.'] },
    { dex: 129, at: [42.6, 31.4], still: 'Idle', water: true, emote: '!', lines: ['¡Splash! ¡Splash!', '(Salta y salta. No pasa nada.)', '¡Karp!'] }
  ];

  /** Frases de cuando te sigue o se va. */
  const FOLLOW = ['¡Voy contigo un rato!', '¡Te acompaño!', '¡Vamos juntos!'];
  const BYE = ['¡Hasta luego!', '¡Me vuelvo a casa!', '¡Adiós!'];

  /*
   * Decorados 3D (village3d.js). r: lo que abultaba antes (ya no choca con eso: chocan los modelos; se deja de referencia).
   *   gtree: árbol enorme del bosque (con lianas y hongos que brillan); shroom: setas luminosas (c: cian, rosa o verde);
   *   bulb: farol-flor; pylon: pilón de cristal de energía; spring: el manantial de la plaza; log: banco de tronco;
   *   pod: vaina de semillas; crate: caja de la tribu con su luz; rock: roca con musgo que brilla; fern: helecho;
   *   totem: tótem de la tribu con su holograma; well: pozo de energía; fence: valla de raíces (de a a b);
   *   flowers: flores que brillan; reeds: juncos; cable: cable de luz de a a b ([x, y, alto en mundo]).
   */
  const DECOR = [
    { k: 'spring', x: 23, y: 19.2, r: 1.15 },
    // árboles enormes junto al bosque del borde (y alguno suelto)
    { k: 'gtree', x: 4, y: 4.6, s: 1.1, r: 0.6 }, { k: 'gtree', x: 8.6, y: 4.2, s: 0.95, r: 0.55 }, { k: 'gtree', x: 14, y: 3.8, s: 1.05, r: 0.6 },
    { k: 'gtree', x: 32, y: 3.8, s: 1.05, r: 0.6 }, { k: 'gtree', x: 37.4, y: 4.2, s: 0.95, r: 0.55 }, { k: 'gtree', x: 42, y: 4.8, s: 1.1, r: 0.6 },
    { k: 'gtree', x: 3.6, y: 9.4, s: 0.9, r: 0.5 }, { k: 'gtree', x: 42.6, y: 9.6, s: 0.9, r: 0.5 }, { k: 'gtree', x: 3.4, y: 19, s: 1.2, r: 0.65 },
    { k: 'gtree', x: 42.8, y: 17.6, s: 1, r: 0.55 }, { k: 'gtree', x: 3.6, y: 29.4, s: 1, r: 0.55 }, { k: 'gtree', x: 43, y: 24.6, s: 0.9, r: 0.5 },
    { k: 'gtree', x: 4.4, y: 33.2, s: 0.85, r: 0.5 }, { k: 'gtree', x: 25.6, y: 34, s: 0.8, r: 0.5 }, { k: 'gtree', x: 14.6, y: 22.6, s: 0.8, r: 0.5 },
    { k: 'gtree', x: 31.8, y: 21.6, s: 0.8, r: 0.5 },
    // farol-flores por los caminos
    { k: 'bulb', x: 21.4, y: 12.6, r: 0.25 }, { k: 'bulb', x: 24.6, y: 12.6, r: 0.25 }, { k: 'bulb', x: 21.4, y: 26.4, r: 0.25 }, { k: 'bulb', x: 24.6, y: 26.4, r: 0.25 },
    { k: 'bulb', x: 13.4, y: 20.2, r: 0.25 }, { k: 'bulb', x: 32.6, y: 20.2, r: 0.25 }, { k: 'bulb', x: 10.2, y: 16.6, r: 0.25 }, { k: 'bulb', x: 35.8, y: 16.6, r: 0.25 },
    { k: 'bulb', x: 16.2, y: 33.2, r: 0.25 }, { k: 'bulb', x: 31.2, y: 33.2, r: 0.25 },
    // cables de luz entre faroles (cruzan los caminos por arriba)
    { k: 'cable', a: [21.4, 12.6, 76], b: [24.6, 12.6, 76] }, { k: 'cable', a: [21.4, 26.4, 76], b: [24.6, 26.4, 76] },
    { k: 'cable', a: [10.2, 16.6, 76], b: [13.4, 20.2, 76] }, { k: 'cable', a: [35.8, 16.6, 76], b: [32.6, 20.2, 76] },
    // la plaza
    { k: 'log', x: 19.2, y: 16.4, r: 0.4 }, { k: 'log', x: 26.8, y: 16.4, r: 0.4 }, { k: 'flowers', x: 19.4, y: 22.2 }, { k: 'flowers', x: 26.6, y: 22.2 },
    { k: 'totem', x: 18.6, y: 19.4, r: 0.3, c: '#5ff0ff' }, { k: 'totem', x: 27.4, y: 19.4, r: 0.3, c: '#ff7ad8' },
    // tienda y almacén
    { k: 'pod', x: 36, y: 18.4, r: 0.3 }, { k: 'crate', x: 41, y: 18.6, r: 0.32 }, { k: 'pod', x: 40.6, y: 25, r: 0.3 }, { k: 'crate', x: 40.4, y: 26.2, r: 0.32 },
    { k: 'crate', x: 35.6, y: 24.6, r: 0.32 },
    // choza y jardín
    { k: 'flowers', x: 9.4, y: 31.4 }, { k: 'fence', a: [8.6, 30.1], b: [8.6, 32.6] }, { k: 'well', x: 6.8, y: 30.6, r: 0.6 },
    // charca
    { k: 'reeds', x: 39, y: 30 }, { k: 'reeds', x: 44, y: 29.4 }, { k: 'reeds', x: 44.2, y: 32.6 }, { k: 'rock', x: 38.4, y: 31.2, r: 0.35 }, { k: 'rock', x: 43.6, y: 28.6, r: 0.3 },
    // el Altar del Portal: pilones de cristal a los lados (los cables hasta el arco salen del altar)
    { k: 'pylon', x: 18.8, y: 9.6, r: 0.3, c: '#ff7ad8' }, { k: 'pylon', x: 27.2, y: 9.6, r: 0.3, c: '#5ff0ff' },
    // setas y helechos por todas partes
    { k: 'shroom', x: 6, y: 7.4, c: '#5ff0ff' }, { k: 'shroom', x: 40.4, y: 7.6, c: '#ff7ad8' }, { k: 'shroom', x: 17.4, y: 6.4, c: '#7cff7a' }, { k: 'shroom', x: 28.8, y: 6.6, c: '#5ff0ff' },
    { k: 'shroom', x: 5.4, y: 16, c: '#7cff7a' }, { k: 'shroom', x: 41, y: 21.6, c: '#5ff0ff' }, { k: 'shroom', x: 16.6, y: 26, c: '#ff7ad8' }, { k: 'shroom', x: 30.4, y: 23.6, c: '#7cff7a' },
    { k: 'shroom', x: 5.6, y: 24.4, c: '#ff7ad8' }, { k: 'shroom', x: 24.6, y: 35, c: '#5ff0ff' }, { k: 'shroom', x: 33, y: 35.2, c: '#ff7ad8' }, { k: 'shroom', x: 42, y: 13.6, c: '#7cff7a' },
    { k: 'fern', x: 5.2, y: 12.4 }, { k: 'fern', x: 41.6, y: 11.6 }, { k: 'fern', x: 15.8, y: 15 }, { k: 'fern', x: 30.6, y: 14.6 }, { k: 'fern', x: 6.4, y: 34.4 },
    { k: 'fern', x: 20.4, y: 35 }, { k: 'fern', x: 36.4, y: 34.8 }, { k: 'fern', x: 27, y: 24.6 },
    { k: 'rock', x: 5.2, y: 14.6, r: 0.35 }, { k: 'rock', x: 41.4, y: 14.2, r: 0.3 }
  ];

  /** Caminos (de tierra oscura con piedras que brillan): tramos [x0, y0, x1, y1] con su ancho (casillas). La plaza: un círculo. */
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
  const GRASS = [[14.6, 16.4, 1.9], [31.6, 16.2, 1.9], [5.4, 26.8, 1.7], [41.2, 6.8, 1.8], [5.2, 6.6, 1.6], [16.8, 25.6, 1.4], [29.8, 25.4, 1.5], [28.4, 6.4, 1.1], [17.6, 6.6, 1.1]];
  const SPAWN = [23, 24];
  /** El estrado del altar (casillas): ahí no crece el bosque del borde ni la hierba. */
  const ALTAR = { x: 23, y: 8, r: 2.9 };

  /*
   * Puertas libres (13-11-2026, el dueño: «hay a veces elementos en medio y no puedo entrar a los edificios»). Delante de
   * cada puerta hay un pasillo (DOOR_LANE casillas hacia el sur, DOOR_HALF de medio ancho) donde no se pone nada que choque
   * ni para nadie a pasear, y una zona de entrar generosa (ENTER: a esa distancia de la puerta ya se puede entrar).
   * tests/village-solids.test.cjs comprueba que el pasillo está libre con cualquier choza y que ningún paseante lo tapa.
   */
  const ENTER = 92, DOOR_LANE = 1.5, DOOR_HALF = 0.62;
  /** ¿Está (x, y) (mundo) en el pasillo de una puerta (más `pad` de margen)? → el sitio o null. */
  function doorLane(x, y, pad = 0) {
    for (const p of PLACES) {
      const dx = x / TS - p.door[0], dy = y / TS - p.door[1];
      if (Math.abs(dx) < DOOR_HALF + pad / TS && dy > -0.55 - pad / TS && dy < DOOR_LANE + pad / TS) return p;
    }
    return null;
  }
  /*
   * Qué Pokémon de la aldea choca contigo (13-11-2026, «hay veces que me choco con los Pokémon»). Los que se mueven
   * (paseantes, tenderos, los que te siguen) nunca: se apartan con un empujón suave. Sólo los quietos y grandes (Snorlax
   * dormido...) chocan, y con una huella pequeña. → el radio de su huella (0: no choca).
   */
  function npcFoot(still, body) {
    if (!still || !(body >= 18)) return 0;
    return Math.min(16, body * 0.45);
  }

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
   * → { W, H, terr: Uint8Array (0 suelo, 1 bosque, 2 agua), path: Float32Array (0..1, cuánto camino), plaza, grass } por casilla.
   * El centro de la casilla (tx, ty) está en (tx + 0.5, ty + 0.5).
   */
  function build() {
    if (built) return built;
    const n = W * H, terr = new Uint8Array(n), path = new Float32Array(n), plaza = new Uint8Array(n), grass = new Uint8Array(n);
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const i = ty * W + tx, cx = tx + 0.5, cy = ty + 0.5;
      // Bosque del borde: 2 casillas, con bultos hacia dentro (sin llegar a los caminos).
      const e = Math.min(tx, ty, W - 1 - tx, H - 1 - ty);
      let p = 0;
      for (const s of PATHS) p = Math.max(p, 1 - segDist(cx, cy, s[0], s[1], s[2], s[3]) / (PATH_W / 2 + 0.4));
      const nearAltar = Math.hypot(cx - ALTAR.x, (cy - ALTAR.y) * 1.25) < ALTAR.r + 0.6;
      if (e < 2 || (p <= 0 && !nearAltar && ((e === 2 && hash(tx, ty, 7) < 0.45) || (e === 3 && hash(tx, ty, 8) < 0.12 && hash(tx >> 1, ty >> 1, 9) < 0.5)))) terr[i] = 1;
      // Charca (elipse con el borde algo irregular).
      const pd = Math.hypot((cx - POND.x) / POND.rx, (cy - POND.y) / POND.ry);
      if (pd < 1 - hash(tx, ty, 11) * 0.12) terr[i] = 2;
      // Caminos (0..1 según lo cerca del centro del tramo) y plaza.
      const pz = Math.hypot(cx - PLAZA.x, cy - PLAZA.y);
      if (pz < PLAZA.r) { plaza[i] = 1; p = 0; }
      path[i] = Math.max(0, p);
      for (const [gx, gy, gr] of GRASS) if (Math.hypot(cx - gx, cy - gy) < gr * (0.8 + hash(tx, ty, 13) * 0.35)) grass[i] = 1;
      if (terr[i] || path[i] > 0.2 || plaza[i] || Math.hypot(cx - ALTAR.x, cy - ALTAR.y) < ALTAR.r + 0.2) grass[i] = 0;
    }
    built = { W, H, terr, path, plaza, grass };
    return built;
  }
  /** Terreno de la casilla (fuera del plano: bosque). */
  function terrainAt(tx, ty) {
    const b = build();
    return tx < 0 || ty < 0 || tx >= W || ty >= H ? 1 : b.terr[ty * W + tx];
  }

  // ---------------- choques (pulido 12-11-2026) ----------------
  /*
   * Lo que choca sale de los modelos 3D (village3d.js solids: el casco convexo de cada pieza que toca el suelo), así que
   * lo que se ve es lo que choca. Aquí, las cuentas (también las usan los tests): casco convexo, distancia con signo a una
   * figura, un índice por casillas y el relleno de lo que se alcanza andando.
   */
  /** Casco convexo de puntos [x, y] (cadena monótona). */
  function hull(pts) {
    const P = pts.map(p => [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  /** Distancia con signo de (x, y) a una figura: { pts } (polígono convexo) o { x, y, r } (círculo). Dentro, negativa. */
  function sdist(s, x, y) {
    if (s.r != null) return Math.hypot(x - s.x, y - s.y) - s.r;
    const P = s.pts, n = P.length;
    let best = 1e9, pos = 0, neg = 0;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = ex * ex + ey * ey;
      const c = ex * (y - a[1]) - ey * (x - a[0]);
      if (c > 0) pos++; else if (c < 0) neg++;
      const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L)) : 0;
      const d = Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t);
      if (d < best) best = d;
    }
    return pos && neg ? best : -best;
  }
  /** Índice por casillas de una lista de figuras (cada una, en las casillas que toca con un margen de `pad`). */
  function index(list, pad = 24) {
    const cells = new Map();
    for (const s of list) {
      let x0, y0, x1, y1;
      if (s.r != null) { x0 = s.x - s.r; x1 = s.x + s.r; y0 = s.y - s.r; y1 = s.y + s.r; }
      else { x0 = y0 = 1e9; x1 = y1 = -1e9; for (const [px, py] of s.pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); } }
      s.bb = [x0, y0, x1, y1];
      for (let cy = Math.floor((y0 - pad) / TS); cy <= Math.floor((y1 + pad) / TS); cy++) for (let cx = Math.floor((x0 - pad) / TS); cx <= Math.floor((x1 + pad) / TS); cx++) {
        const k = cy * 1000 + cx;
        let c = cells.get(k);
        if (!c) cells.set(k, c = []);
        c.push(s);
      }
    }
    return { cells, list };
  }
  /**
   * ¿Choca un círculo (x, y, r) con algo del índice? from: [x, y] de donde viene; si ya estaba metido en una figura,
   * puede moverse si sale (no se queda atascado nunca).
   */
  function hits(ix, x, y, r, from) {
    const c = ix.cells.get(Math.floor(y / TS) * 1000 + Math.floor(x / TS));
    if (!c) return false;
    for (const s of c) {
      const b = s.bb;
      if (x + r < b[0] || x - r > b[2] || y + r < b[1] || y - r > b[3]) continue;
      const d = sdist(s, x, y) - r;
      if (d >= 0) continue;
      if (from && d > sdist(s, from[0], from[1]) - r + 1e-3) continue;
      return true;
    }
    return false;
  }
  /**
   * Lo que se alcanza andando desde (sx, sy) en una rejilla de `step`: free(x, y) dice si se puede estar en el centro de
   * cada celda. → { step, cw, ch, seen: Uint8Array (1: se llega) }.
   */
  function flood(free, sx, sy, step = 12) {
    const cw = Math.ceil(W * TS / step), ch = Math.ceil(H * TS / step), ok = new Int8Array(cw * ch).fill(-1), seen = new Uint8Array(cw * ch);
    const fr = i => { if (ok[i] < 0) ok[i] = free((i % cw + 0.5) * step, ((i / cw | 0) + 0.5) * step) ? 1 : 0; return ok[i] === 1; };
    const s0 = Math.floor(sy / step) * cw + Math.floor(sx / step);
    if (!fr(s0)) return { step, cw, ch, seen, ok };
    const q = [s0];
    seen[s0] = 1;
    while (q.length) {
      const i = q.pop(), x = i % cw, y = i / cw | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const j = ny * cw + nx;
        if (!seen[j] && fr(j)) { seen[j] = 1; q.push(j); }
      }
    }
    return { step, cw, ch, seen, ok };
  }

  return { W, H, TS, BI, PLACES, PET, CAST, DECOR, PATHS, PATH_W, PLAZA, POND, GRASS, SPAWN, ALTAR, FOLLOW, BYE, build, terrainAt, hash,
    hull, sdist, index, hits, flood, ENTER, DOOR_LANE, DOOR_HALF, doorLane, npcFoot };
})();
