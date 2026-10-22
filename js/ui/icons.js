/* ============ icons.js — iconos: objetos reales de Pokémon ============
 * Cada icono es el sprite de un objeto de la Mochila (PokeAPI/sprites, 30×30,
 * pixel art) guardado en assets/items/. La tabla ITEM dice qué objeto lleva
 * cada nombre; tools/fetch_items.js la lee y descarga lo que falte. Añadir un
 * icono = una línea en ITEM + `node tools/fetch_items.js`.
 * Los controles de la interfaz (sonido, ajustes, cerrar...) son SVG lisos.
 *
 *   G.Icons.html('coin', 30)               <img> (o <svg>) para el DOM
 *   G.Icons.draw(ctx, 'coin', x, y, 18)    en el canvas: el dibujo llena la caja
 *   G.Icons.sprite(ctx, 'coin', cx, cy, k) en el mundo: centrado, k unidades por píxel
 *   G.Icons.url('star')                    ruta del png (para CSS)
 *   'move:<id>'                            disco MT de su tipo + insignia de la familia
 *   'type:<tipo>'                          emblema del tipo
 */
G.Icons = (() => {
  const K = '#1b1528';          // contorno
  const DIR = 'assets/items/';

  /* objetos:begin — nombre del icono → objeto (assets/items/<objeto>.png). tools/fetch_items.js descarga estos. */
  const ITEM = {
    // Dinero y tickets del gacha
    coin: 'nugget', ticket: 'ss-ticket', ticket10: 'rainbow-pass',
    // Mejoras de stats (cartas de nivel y mejoras permanentes)
    hpup: 'hp-up', fist: 'protein', boot: 'carbos', clock: 'metronome', shield: 'iron',
    sprout: 'big-root', magnet: 'magnet', exp: 'exp-candy-xl', berry: 'sitrus-berry',
    crit: 'razor-claw', reroll: 'loaded-dice', ban: 'red-card', start: 'tm-normal', cards: 'tm-case',
    // Libres, para pasivas nuevas: área, duración, velocidad, suerte, revivir
    area: 'wide-lens', duration: 'light-clay', speed: 'quick-powder', luck: 'lucky-punch', revive: 'revive',
    // Menú, colección y premios
    up: 'rare-candy', book: 'journal', star: 'star-piece', starDim: 'star-piece', bag: 'berry-pouch',
    shop: 'coin-case', crown: 'kings-rock', trophy: 'luck-incense', bond: 'red-chain', friends: 'friend-ball',
    bomb: 'flame-orb', medal1: 'gold-bottle-cap', medal2: 'bottle-cap', medal3: 'gold-bottle-cap', medalOff: 'bottle-cap',
    // Tienda Kecleon
    mint: 'timid-mint', capsule: 'ability-capsule', capsuleh: 'ability-patch', tm: 'tm-normal',
    // Clima
    wsun: 'heat-rock', wrain: 'damp-rock', wsand: 'smooth-rock', wsnow: 'icy-rock', wfog: 'smoke-ball',
    // Poké Balls (rarezas y gacha)
    ball: 'poke-ball', ball2: 'great-ball', ball3: 'ultra-ball', ball4: 'master-ball', ballLux: 'luxury-ball',
    // Objetos equipables (data/items.js: el icono es su id)
    leftovers: 'leftovers', choiceband: 'choice-band', quickclaw: 'quick-claw', focussash: 'focus-sash',
    shellbell: 'shell-bell', amuletcoin: 'amulet-coin', luckyegg: 'lucky-egg', lifeorb: 'life-orb',
    choicescarf: 'choice-scarf', rockyhelmet: 'rocky-helmet', assaultvest: 'assault-vest',
    // Experiencia que sueltan los enemigos, de menos a más (pickup.js)
    xp1: 'exp-candy-xs', xp2: 'exp-candy-s', xp3: 'exp-candy-m', xp4: 'exp-candy-l', xp5: 'exp-candy-xl',
    // Con su nombre de PokeAPI (pasivas y familias de ataque nuevas). Cualquier
    // objeto de esta tabla vale también por su nombre de archivo ('wide-lens'...).
    'zoom-lens': 'zoom-lens', 'scope-lens': 'scope-lens', 'expert-belt': 'expert-belt', 'iron-ball': 'iron-ball',
    'razor-fang': 'razor-fang', 'air-balloon': 'air-balloon', 'cleanse-tag': 'cleanse-tag',
    'protective-pads': 'protective-pads', 'poke-doll': 'poke-doll', 'pretty-wing': 'pretty-wing',
    'fresh-water': 'fresh-water', stardust: 'stardust'
  };
  // Disco MT de cada tipo (iconos 'move:<id>').
  const TM = {
    normal: 'tm-normal', fire: 'tm-fire', water: 'tm-water', grass: 'tm-grass', electric: 'tm-electric',
    ice: 'tm-ice', fighting: 'tm-fighting', poison: 'tm-poison', ground: 'tm-ground', flying: 'tm-flying',
    psychic: 'tm-psychic', bug: 'tm-bug', rock: 'tm-rock', ghost: 'tm-ghost', dragon: 'tm-dragon',
    dark: 'tm-dark', steel: 'tm-steel', fairy: 'tm-fairy'
  };
  /* objetos:end */

  const FALLBACK = 'poke-ball';                                           // nombre desconocido
  const FILES = new Set([...Object.values(ITEM), ...Object.values(TM)]);  // también valen como nombre
  const TINT = { medal1: 'bronze', medalOff: 'off', starDim: 'off' };    // variantes con filtro CSS

  // ---------------- controles de la interfaz (SVG 24×24, trazo redondeado) ----------------
  // Sin color propio: toman el del texto (currentColor).
  const VEC = {
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    gear: '<path d="M10.3 5.1L10.6 2.6L13.4 2.6L13.7 5.1L15.7 5.9L17.6 4.4L19.6 6.4L18.1 8.3L18.9 10.3L21.4 10.6L21.4 13.4L18.9 13.7L18.1 15.7L19.6 17.6L17.6 19.6L15.7 18.1L13.7 18.9L13.4 21.4L10.6 21.4L10.3 18.9L8.3 18.1L6.4 19.6L4.4 17.6L5.9 15.7L5.1 13.7L2.6 13.4L2.6 10.6L5.1 10.3L5.9 8.3L4.4 6.4L6.4 4.4L8.3 5.9Z"/><circle cx="12" cy="12" r="3"/>',
    flag: '<path d="M5.5 21V3.5M5.5 4h12l-2.5 4.5 2.5 4.5h-12"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
    save: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10.6a3.9 3.9 0 0 1-.5 7.9"/><path d="M12 12v8M9 15l3-3 3 3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10"/>'
  };
  // Con su color: corazón (apoyar, cariño, curar), marca de shiny y cursor del menú.
  const VEC_COLOR = {
    heart: '<path d="M12 20.3c-.3 0-7.8-4.6-7.8-10.1 0-2.6 2-4.5 4.4-4.5 1.5 0 2.8.8 3.4 2 .6-1.2 1.9-2 3.4-2 2.4 0 4.4 1.9 4.4 4.5 0 5.5-7.5 10.1-7.8 10.1z" fill="#ee3b3b" stroke="#7a1626" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.4 9.6a2.1 2.1 0 0 1 1.9-1.8" fill="none" stroke="#ffc9cf" stroke-width="1.5" stroke-linecap="round"/>',
    shiny: '<path d="M12 2.8l1.9 6.6 6.6 2.1-6.6 2.1L12 20.2l-1.9-6.6-6.6-2.1 6.6-2.1z" fill="#ff4d5e" stroke="#8e1b2b" stroke-width="1.3" stroke-linejoin="round"/><path d="M19 2.5v4M17 4.5h4" stroke="#ffcb05" stroke-width="1.6" stroke-linecap="round"/>',
    cursor: '<path d="M8 4.5l9 7.5-9 7.5z" fill="#ffcb05" stroke="#1d3b78" stroke-width="1.6" stroke-linejoin="round"/>'
  };

  // ---------------- dibujos de antes (12×12) ----------------
  // Sólo de reserva en el canvas mientras carga el png (o si no llega).
  const MEDAL = ['.kkk....kkk.', '.krk....kqk.', '..krk..kqk..', '...krkkqk...', '....kkkk....', '...kmmmmk...',
                 '..kmwmmmnk..', '.kmwmsmmmnk.', '.kmmsssmmnk.', '.kmmmsmmmnk.', '..kmmmmmnk..', '...kkkkkk...'];
  const BALL = ['....kkkk....', '..kkrrrrkk..', '.krwrrrrrrk.', '.krwrrrrrsk.', 'krrrrkkrrssk', 'kkkkkbbkkkkk',
                'kbbbkbbkbbbk', 'kbbbbkkbbbbk', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '..kkbbbbkk..', '....kkkk....'];

  const LEGACY = {
    tm: { pal: { b: '#7f93ff', d: '#4a5bc4', w: '#e6ecff' }, rows: [
      '....kkkk....', '..kkbbbbkk..', '.kbbwwbbbbk.', '.kbwwbbbbbk.', 'kbbwbkkbbbbk', 'kbbbk..kbbbk',
      'kbbbk..kbbbk', 'kbbbbkkbbbdk', '.kbbbbbbbdk.', '.kbbbbbbddk.', '..kkbbddkk..', '....kkkk....'] },
    mint: { pal: { g: '#5fe08a', w: '#d6ffe2' }, rows: [
      '............', '.......kkk..', '.....kkgggk.', '....kgggwgk.', '...kgggwggk.', '..kgggwgggk.',
      '..kggwgggk..', '.kggwgggk...', '.kgwgggk....', '.kwkkkk.....', 'kk..........', 'k...........'] },
    capsule: { pal: { r: '#ff5f6d', w: '#f4f8ff' }, rows: [
      '............', '.......kkk..', '......krrrk.', '.....krwrrk.', '....krwrrrk.', '...kkrrrrk..',
      '..kwwkkrk...', '.kwwwwkk....', '.kwwwwk.....', '.kwwwk......', '..kkk.......', '............'] },
    capsuleh: { pal: { r: '#ffd23f', w: '#c47bff' }, rows: [
      '............', '.......kkk..', '......krrrk.', '.....krwrrk.', '....krrrrrk.', '...kkrrrrk..',
      '..kwwkkrk...', '.kwwwwkk....', '.kwwwwk.....', '.kwwwk......', '..kkk.......', '............'] },
    heart: { pal: { r: '#ff5f6d', s: '#c23a4b', w: '#ffd3d8' }, rows: [
      '............', '.kkk....kkk.', 'kwwrk..krrrk', 'kwrrrkkrrrsk', 'krrrrrrrrrsk', 'krrrrrrrrrsk',
      '.krrrrrrrsk.', '..krrrrrsk..', '...krrrsk...', '....krsk....', '.....kk.....', '............'] },
    bond: { pal: { y: '#ffd23f', w: '#fff3b0', p: '#ff8ad8', q: '#ffd3f1' }, rows: [
      '.kkkkk......', 'kwyyyyk.....', 'kykkkyk.....', 'kyk.kyk.....', 'kykkkyk.....', 'kyyyyykkkkk.',
      '.kkkkkqppppk', '.....kpkkkpk', '.....kpk.kpk', '.....kpkkkpk', '.....kpppppk', '......kkkkk.'] },
    shield: { pal: { s: '#9fb1c9', d: '#5d6f8c', w: '#e6eef8', r: '#4fb4ff' }, rows: [
      '............', '.kkkkkkkkkk.', '.kwwsssssdk.', '.kwssrrssdk.', '.kwssrrssdk.', '.kssrrrrsdk.',
      '.kssrrrrsdk.', '..kssrrsdk..', '..kssssddk..', '...ksssdk...', '....kddk....', '.....kk.....'] },
    magnet: { pal: { r: '#ff5f6d', s: '#c23a4b', w: '#e8e8f0' }, rows: [
      '............', '..kkkkkkkk..', '.krrrrrrrrk.', 'krrsskkssrrk', 'krrk....krrk', 'krrk....krrk',
      'krrk....krrk', 'kwwk....kwwk', 'kwwk....kwwk', 'kkkk....kkkk', '............', '............'] },
    coin: { pal: { y: '#ffd23f', o: '#c08a10', w: '#fff4b0' }, rows: [
      '....kkkk....', '..kkyyyykk..', '.kyywwyyyyk.', '.kywyyyyyok.', 'kyyyyooyyyok', 'kywyoyyoyyok',
      'kyyyoyyoyyok', 'kyyyyooyyyok', '.kyyyyyyyok.', '.kooyyyyook.', '..kkooookk..', '....kkkk....'] },
    berry: { pal: { r: '#ff7a9e', s: '#c23a6b', w: '#ffd3e0', g: '#5fe08a', d: '#2f9a52' }, rows: [
      '............', '.....kkk....', '....kgggk...', '..kkkgdkkk..', '.krrrkkrrrk.', 'krwwrrrrrrsk',
      'krwrrrrrrrsk', 'krrrrrrrrrsk', 'krrrrrrrrssk', '.krrrrrrssk.', '..kkssssskk.', '....kkkkk...'] },
    bomb: { pal: { b: '#3a3a4a', w: '#8a8aa0', f: '#ffd23f', r: '#ff7b3d' }, rows: [
      '........r...', '.......rfr..', '......kfr...', '.....kfk....', '...kkkkkk...', '..kbbbbbbk..',
      '.kbwwbbbbbk.', '.kbwbbbbbbk.', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '..kbbbbbbk..', '...kkkkkk...'] },
    star: { pal: { y: '#ffd23f', o: '#c08a10', w: '#fff4b0' }, rows: [
      '.....kk.....', '.....kk.....', '....kwyk....', '....kyyk....', 'kkkkwyyykkkk', 'kwyyyyyyyyok',
      '.kyyyyyyyok.', '..kyyyyyyk..', '..kyyyoyyk..', '.kyok..koyk.', '.kok....kok.', '.kk......kk.'] },
    shiny: { pal: { y: '#ff4d5e', w: '#ffd0d6', o: '#b8283a', x: '#fff6b0' }, rows: [
      '.....kk...x.', '.....kk..xxx', '....kwyk..x.', '....kyyk....', 'kkkkwyyykkkk', 'kwyyyyyyyyok',
      '.kyyyyyyyok.', '..kyyyyyyk..', '..kyyyoyyk..', '.kyok..koyk.', '.kok....kok.', '.kk......kk.'] },
    crown: { pal: { y: '#ffd23f', o: '#c08a10', r: '#ff5f6d' }, rows: [
      '............', '............', 'k....k....k.', 'kk..kyk..kk.', 'kyk.kyk.kyk.', 'kyykyyykyyk.',
      'kyyyyyyyyyk.', 'kyyryyyryyk.', 'kyyyyyyyyyk.', 'koooooooook.', 'kkkkkkkkkkk.', '............'] },
    ticket: { pal: { y: '#ffd23f', d: '#c08a10', w: '#fff3b0', r: '#ff5f6d' }, rows: [
      '............', '............', 'kkkkkkkkkkkk', 'kwyyydyyyyyk', 'kyyyyyyrryyk', '.kyyydyrryk.',
      '.kyyyyyrryk.', 'kyyyydyyyyyk', 'kddddddddddk', 'kkkkkkkkkkkk', '............', '............'] },
    ticket10: { pal: { p: '#c47bff', q: '#8a3fd0', w: '#f0d8ff', y: '#ffd23f' }, rows: [
      '............', '............', 'kkkkkkkkkkkk', 'kwpppqppyypk', 'kppppqpyyypk', '.kpppqpyyyk.',
      '.kpppqppyyk.', 'kppppqpppppk', 'kqqqqqqqqqqk', 'kkkkkkkkkkkk', '............', '............'] },
    wsun: { pal: { y: '#ffd23f', o: '#ff9a3d' }, rows: [
      '.....yy.....', '..y..yy..y..', '...y....y...', '....kkkk....', 'yy.kyyyyk.yy', 'yy.kyyoyk.yy',
      '...kyooyk...', '....kkkk....', '...y....y...', '..y..yy..y..', '.....yy.....', '............'] },
    wrain: { pal: { w: '#e8eef8', g: '#9fb1c9', b: '#4fb4ff' }, rows: [
      '............', '...kkkk.....', '..kwwwwkkk..', '.kwwwwwwwwk.', 'kwwwwwwwwwgk', 'kggggggggggk',
      '.kkkkkkkkkk.', '..b...b...b.', '.b...b...b..', '..b...b...b.', '.b...b...b..', '............'] },
    wsand: { pal: { s: '#e0bf73', d: '#9a7a3a' }, rows: [
      '............', '..ssssss....', '........ss..', 'ssssssss..s.', '.........s..', '..dddddd....',
      '........dd..', 'dddddd....d.', '.........d..', '...sssss....', '............', '............'] },
    wsnow: { pal: { w: '#ffffff', c: '#9fe0ff' }, rows: [
      '.....w......', '...w.w.w....', '....www.....', '.w..cwc..w..', '..w.cwc.w...', 'wwwwwwwwwww.',
      '..w.cwc.w...', '.w..cwc..w..', '....www.....', '...w.w.w....', '.....w......', '............'] },
    wfog: { pal: { g: '#c9cfdc', d: '#8f98ab' }, rows: [
      '............', '............', '..gggggg....', '.g......gg..', '............', '....gggggg..',
      '..dd......d.', '............', '.ggggggg....', 'g.......gg..', '............', '............'] },
    ball: { pal: { r: '#ff4d4d', s: '#c23a3a', w: '#f4f4f4', b: '#f4f4f4' }, rows: BALL },
    ball2: { pal: { r: '#3d7bff', s: '#2a56b8', w: '#cfe0ff', b: '#f4f4f4' }, rows: BALL },
    ball3: { pal: { r: '#3a3a46', s: '#1d1d26', w: '#ffd23f', b: '#f4f4f4' }, rows: BALL },
    ball4: { pal: { r: '#8a3fd0', s: '#5e2a96', w: '#ff8ad8', b: '#f4f4f4' }, rows: BALL },
    ballLux: { pal: { r: '#30303a', s: '#18181e', w: '#ff5f6d', b: '#ffd23f' }, rows: BALL },
    friends: { pal: { b: '#4fb4ff', d: '#2a6fb0', g: '#5fe08a', h: '#2f9a52' }, rows: [
      '............', '..kkk..kkk..', '.kbbbkkgggk.', '.kbbbkkgggk.', '..kkk..kkk..', '............',
      '.kkkkkkkkkk.', 'kbbbbkkggggk', 'kbbbbkkggggk', 'kddddkkhhhhk', 'kkkkkkkkkkkk', '............'] },
    medal1: { pal: { r: '#ff5f6d', q: '#b8283a', m: '#d08a4a', n: '#8a5226', w: '#ffd0a0', s: '#ffe8c8' }, rows: MEDAL },
    medal2: { pal: { r: '#4fb4ff', q: '#2a6fb0', m: '#c9d2de', n: '#7d8899', w: '#ffffff', s: '#ffffff' }, rows: MEDAL },
    medal3: { pal: { r: '#c47bff', q: '#7a3fb0', m: '#ffd23f', n: '#c08a10', w: '#fff3b0', s: '#fffbe0' }, rows: MEDAL }
  };

  // ---------------- glifos de tipo (8×8, blancos sobre el emblema) ----------------
  const TYPE_GLYPH = {
    normal:   ['..####..', '.#....#.', '#......#', '#..##..#', '#..##..#', '#......#', '.#....#.', '..####..'],
    fire:     ['...#....', '...##...', '..###.#.', '.#####..', '.######.', '##.####.', '##..###.', '.######.'],
    water:    ['...##...', '...##...', '..####..', '.######.', '.##.###.', '.#.####.', '.######.', '..####..'],
    grass:    ['.....###', '...#####', '..######', '.####.##', '.###.###', '.##.####', '.#.####.', '#.......'],
    electric: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.##.....', '#.......'],
    psychic:  ['.######.', '#......#', '#.####.#', '#.#..#.#', '#.#.##.#', '#.#....#', '#.######', '#.......'],
    ice:      ['...#....', '.#.#.#..', '..###...', '#######.', '..###...', '.#.#.#..', '...#....', '........'],
    fighting: ['.######.', '########', '########', '#.#.#.##', '########', '.#######', '..#####.', '..####..'],
    poison:   ['.....##.', '....####', '.....##.', '.###....', '#####...', '#####.##', '.###.###', '.....##.'],
    ground:   ['........', '...##...', '..####..', '.##..##.', '.######.', '##.##.##', '########', '........'],
    flying:   ['#.......', '##......', '###.....', '####....', '######..', '########', '.#######', '...####.'],
    bug:      ['.#....#.', '..#..#..', '..####..', '.##.###.', '########', '###.####', '.######.', '..####..'],
    rock:     ['...###..', '..#####.', '.###.###', '######.#', '##.#####', '#######.', '.#####..', '........'],
    ghost:    ['..####..', '.######.', '##.##.##', '##.##.##', '########', '########', '########', '#.#..#.#'],
    dragon:   ['#.......', '##....#.', '.##..##.', '.######.', '..####..', '.######.', '##.##.##', '#..##..#'],
    dark:     ['..####..', '.###....', '###.....', '###.....', '###.....', '###.....', '.###....', '..####..'],
    steel:    ['..####..', '.######.', '###..###', '##....##', '##....##', '###..###', '.######.', '..####..'],
    fairy:    ['...#....', '...#....', '..###...', '#######.', '..###...', '..#.#...', '.#...#..', '........']
  };

  // Insignia de la familia de movimiento (5×5).
  const KIND_GLYPH = {
    projectile: ['..#..', '...#.', '#####', '...#.', '..#..'],
    melee:      ['....#', '...#.', '..#..', '.#...', '#....'],
    beam:       ['.....', '#####', '.....', '#####', '.....'],
    orbit:      ['.###.', '#...#', '#...#', '#...#', '.###.'],
    nova:       ['#.#.#', '.###.', '#####', '.###.', '#.#.#'],
    aura:       ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
    buff:       ['..#..', '.###.', '#####', '..#..', '..#..'],
    boomerang:  ['####.', '#....', '#....', '#....', '#....'],
    chain:      ['##...', '..#..', '...##', '..#..', '##...'],
    mine:       ['..#..', '.###.', '##.##', '.###.', '..#..'],
    meteor:     ['....#', '...#.', '.##..', '####.', '.##..'],
    turret:     ['.###.', '.#.#.', '.###.', '..#..', '#####'],
    dash:       ['#.#..', '.#.#.', '..#.#', '.#.#.', '#.#..'],
    trail:      ['#....', '.....', '..#..', '.....', '....#'],
    cone:       ['....#', '..###', '#####', '..###', '....#'],
    // nuevas (19-10-2026)
    homing:     ['.#...', '..#..', '#..#.', '.#..#', '..###'],
    bounce:     ['#...#', '.#.#.', '..#..', '.....', '#####'],
    charge:     ['.###.', '#####', '##.##', '#####', '.###.'],
    spin:       ['.###.', '#....', '#.#.#', '....#', '.###.'],
    quake:      ['.....', '#...#', '##.##', '#####', '#.#.#'],
    vortex:     ['####.', '#....', '#.##.', '#..#.', '####.'],
    shove:      ['#...#', '.#.#.', '.....', '.#.#.', '#...#'],
    stun:       ['#.#.#', '.....', '..#..', '.....', '#.#.#'],
    // familias al estilo de Vampire Survivors (22-10-2026)
    lob:        ['.###.', '#...#', '....#', '....#', '...##'],
    knife:      ['.....', '##.##', '.....', '####.', '.....'],
    cross:      ['..#..', '..#..', '#####', '..#..', '..#..'],
    column:     ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
    sweep:      ['.###.', '#.#.#', '#.##.', '#...#', '.###.'],
    ricochet:   ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
    wipe:       ['#####', '#...#', '#.#.#', '#...#', '#####'],
    ward:       ['#####', '#...#', '#...#', '.#.#.', '..#..'],
    ally:       ['.#.#.', '#####', '.....', '.#.#.', '#####'],
    wings:      ['#...#', '##.##', '#####', '.###.', '..#..'],
    puddle:     ['.....', '..#..', '.###.', '#####', '.###.'],
    dusting:    ['#..#.', '.....', '.#..#', '.....', '#..#.']
  };

  // ---------------- qué es cada nombre ----------------

  const infos = new Map();      // nombre -> { t: 'item'|'move'|'type'|'vec', name, file, kind, tint, pic }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function info(name) {
    name = String(name);
    let r = infos.get(name);
    if (r) return r;
    r = { t: 'item', name, file: '', kind: null, tint: '', pic: null };
    if (name.startsWith('move:')) {
      const m = G.Moves && G.Moves.BY_ID[name.slice(5)];
      r.t = 'move';
      r.file = DIR + TM[m && own(TM, m.type) ? m.type : 'normal'] + '.png';
      r.kind = m && own(KIND_GLYPH, m.kind) ? m.kind : null;     // familia nueva sin insignia: el disco solo
      if (!G.Moves) return r;                     // (sin datos aún: no se guarda)
    } else if (name.startsWith('type:')) {
      r.t = 'type';
    } else if (own(VEC, name) || own(VEC_COLOR, name)) {
      r.t = 'vec';
    } else {
      const f = own(ITEM, name) ? ITEM[name] : FILES.has(name) ? name : '';
      if (!f) console.warn('[Icons] icono sin objeto:', name);     // (una vez: se guarda)
      r.file = DIR + (f || FALLBACK) + '.png';
      r.tint = own(TINT, name) ? TINT[name] : '';
    }
    infos.set(name, r);
    return r;
  }

  /** ¿Tiene icono propio este nombre? */
  function has(name) {
    name = String(name);
    return own(ITEM, name) || FILES.has(name) || own(VEC, name) || own(VEC_COLOR, name) || name.startsWith('type:') ||
      (name.startsWith('move:') && !!G.Moves && !!G.Moves.BY_ID[name.slice(5)]);
  }

  // ---------------- imágenes para el canvas ----------------

  const pics = new Map();       // src -> { img, ok, x, y, w, h } (x..h: la caja del dibujo)
  let probe = null;             // lienzo para medir la caja del dibujo

  function pic(src) {
    let s = pics.get(src);
    if (s) return s;
    s = { img: new Image(), ok: false, x: 0, y: 0, w: 0, h: 0 };
    s.img.decoding = 'async';
    s.img.onload = () => {
      s.w = s.img.naturalWidth || 30; s.h = s.img.naturalHeight || 30;
      if (!src.startsWith('data:')) measure(s);
      s.ok = true;
    };
    s.img.src = src;
    pics.set(src, s);
    return s;
  }

  /** Recorta el margen transparente del sprite (una vez, al cargar). */
  function measure(s) {
    try {
      if (!probe) probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const W = s.w, H = s.h;
      probe.canvas.width = W; probe.canvas.height = H;
      probe.drawImage(s.img, 0, 0);
      const d = probe.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 >= 0) { s.x = x0; s.y = y0; s.w = x1 - x0 + 1; s.h = y1 - y0 + 1; }
    } catch (e) { /* lienzo bloqueado (file://): se usa el sprite entero */ }
  }

  /** La imagen de un nombre ya resuelto (se guarda en él: nada que buscar en cada fotograma). */
  function picOf(r) { return r.pic || (r.pic = pic(r.t === 'vec' ? vecUrl(r.name) : r.file)); }

  /** Insignia de la familia (9×9, abajo a la derecha del disco: x, y 21..29). */
  const badges = new Map();
  function badge(kind) {
    let cv = badges.get(kind);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = 9;
    const c = cv.getContext('2d');
    c.fillStyle = K; c.fillRect(1, 0, 7, 9); c.fillRect(0, 1, 9, 7);
    c.fillStyle = '#1d3b78'; c.fillRect(1, 1, 7, 7);
    c.fillStyle = '#ffcb05';
    KIND_GLYPH[kind].forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#') c.fillRect(x + 2, y + 2, 1, 1); });
    badges.set(kind, cv);
    return cv;
  }

  // ---------------- dibujos de antes y emblemas de tipo ----------------

  const cache = new Map();      // clave -> canvas a 1×

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
    return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function fromRows(def) {
    const h = def.rows.length, w = Math.max(...def.rows.map(r => r.length));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const pal = Object.assign({ k: K }, def.pal);
    def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ' || !pal[ch]) return;
      c.fillStyle = pal[ch];
      c.fillRect(x, y, 1, 1);
    }));
    return cv;
  }

  /** Emblema circular de un tipo (16×16), con insignia de familia opcional. */
  function emblem(type, kind) {
    const S = 16;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d', { willReadFrequently: true });   // se lee en svgOf()
    const col = G.U.TYPE_COLOR[type] || '#b0a99f';
    const dark = shade(col, 0.55), lite = shade(col, 1.3);
    // Disco con contorno, sombra abajo-derecha y brillo arriba-izquierda.
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.6) continue;
      let f = col;
      if (d > 6.6) f = K;
      else if ((x - 7.5) + (y - 7.5) > 6) f = dark;
      else if ((x - 7.5) + (y - 7.5) < -6.5) f = lite;
      c.fillStyle = f; c.fillRect(x, y, 1, 1);
    }
    const g = TYPE_GLYPH[type] || TYPE_GLYPH.normal;
    // Sombra del glifo y glifo.
    c.fillStyle = dark;
    g.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(x + 5, y + 5, 1, 1); }));
    c.fillStyle = '#ffffff';
    g.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(x + 4, y + 4, 1, 1); }));

    if (kind && KIND_GLYPH[kind]) {
      c.fillStyle = K; c.fillRect(9, 9, 7, 7);
      c.fillStyle = '#2b3454'; c.fillRect(10, 10, 5, 5);
      c.fillStyle = '#ffd23f';
      KIND_GLYPH[kind].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(x + 10, y + 10, 1, 1); }));
    }
    return cv;
  }

  /** Canvas a 1× de los dibujos de antes y de los emblemas (null si no hay). */
  function canvas(name) {
    let cv = cache.get(name);
    if (cv !== undefined) return cv;
    if (name.startsWith('move:')) {
      const m = G.Moves.BY_ID[name.slice(5)];
      cv = emblem(m ? m.type : 'normal', m ? m.kind : null);
    } else if (name.startsWith('type:')) {
      cv = emblem(name.slice(5));
    } else {
      cv = own(LEGACY, name) ? fromRows(LEGACY[name]) : null;
    }
    cache.set(name, cv);
    return cv;
  }

  // ---------------- URL ----------------

  const urls = new Map();

  function svgDoc(W, H, rects) {
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects}</svg>`);
  }

  /**
   * Un canvas como SVG de texto (un rectángulo por tramo de píxeles iguales).
   * toDataURL() hacía lo mismo en PNG, pero la primera vez el navegador tarda
   * ~175 ms en prepararlo y eso bloqueaba la carga de la página (Lighthouse).
   */
  function svgOf(cv) {
    const W = cv.width, H = cv.height;
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    let out = '';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W;) {
        const i = (y * W + x) * 4, a = d[i + 3];
        if (!a) { x++; continue; }
        let n = 1;
        while (x + n < W && d[i + n * 4] === d[i] && d[i + n * 4 + 1] === d[i + 1] && d[i + n * 4 + 2] === d[i + 2] && d[i + n * 4 + 3] === a) n++;
        const hex = '#' + ((1 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).slice(1);
        out += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${hex}"${a < 255 ? ` fill-opacity="${(a / 255).toFixed(3)}"` : ''}/>`;
        x += n;
      }
    }
    return svgDoc(W, H, out);
  }

  /** Insignia de la familia como SVG de 30×30 (lo demás transparente): va encima del disco. */
  function badgeUrl(kind) {
    const key = 'badge:' + kind;
    let u = urls.get(key);
    if (!u) {
      let r = `<rect x="22" y="21" width="7" height="9" fill="${K}"/><rect x="21" y="22" width="9" height="7" fill="${K}"/><rect x="22" y="22" width="7" height="7" fill="#1d3b78"/>`;
      KIND_GLYPH[kind].forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#') r += `<rect x="${x + 23}" y="${y + 23}" width="1" height="1" fill="#ffcb05"/>`; });
      u = svgDoc(30, 30, r);
      urls.set(key, u);
    }
    return u;
  }

  /** Icono SVG como imagen (para el canvas y para CSS): los de un color, en claro con borde oscuro. */
  function vecUrl(name) {
    const key = 'vec:' + name;
    let u = urls.get(key);
    if (!u) {
      const mono = VEC[name];
      const body = mono
        ? `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#0b1530" stroke-width="4">${mono}</g><g stroke="#f4f7ff" stroke-width="2">${mono}</g></g>`
        : VEC_COLOR[name];
      u = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">${body}</svg>`);
      urls.set(key, u);
    }
    return u;
  }

  /** Ruta de la imagen del icono (png del objeto; los emblemas y los SVG, como data URL). */
  function url(name) {
    const r = info(name);
    if (r.t === 'vec') return vecUrl(r.name);
    if (r.t === 'type') {
      let u = urls.get(r.name);
      if (!u) { u = svgOf(canvas(r.name)); urls.set(r.name, u); }
      return u;
    }
    return r.file;
  }

  // ---------------- DOM ----------------

  /**
   * Lado en el DOM: cerca de 30 o de un múltiplo (de -3 a +8 px) se queda en
   * el múltiplo, para que el pixel art salga nítido (cada píxel, 1 o 2 px).
   */
  function fit(size) {
    size = Math.max(1, Math.round(+size || 20));
    const n = Math.floor(size / 30);
    if (n >= 1 && size - n * 30 <= 8) return n * 30;
    if ((n + 1) * 30 - size <= 3) return (n + 1) * 30;
    return size;
  }

  /**
   * <img> del objeto (o <svg> de los controles) para el DOM. Clase «pix», no
   * «ico»: <div class="ico"> es la caja de las cartas (run-ui) y sus medidas
   * (.card .ico, #cards .card .ico) estiraban el icono de dentro.
   */
  function html(name, size = 20, cls = '') {
    const r = info(name);
    const extra = cls ? ' ' + cls : '';
    if (r.t === 'vec') {
      const mono = VEC[r.name];
      return `<svg class="pix ico-vec${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"`
        + (mono ? ` fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${mono}` : `>${VEC_COLOR[r.name]}`)
        + '</svg>';
    }
    if (r.t === 'type') {
      // Emblema de 16×16: a un múltiplo entero.
      const w = 16 * Math.max(1, Math.round(size / 16));
      return `<img class="pix ico-type${extra}" src="${url(name)}" width="${w}" height="${w}" alt="" draggable="false">`;
    }
    const d = fit(size);
    const c = 'pix' + (d < 27 ? ' ico-sm' : '') + (r.tint ? ' ico-' + r.tint : '') + extra;
    const tail = `width="${d}" height="${d}" alt="" draggable="false" decoding="async">`;
    // Movimiento: el disco de fondo y la insignia encima (un solo <img>).
    if (r.kind) return `<img class="${c} ico-mv" src="${badgeUrl(r.kind)}" style="background:url(${r.file}) center/100% 100% no-repeat" ${tail}`;
    return `<img class="${c}" src="${r.file}" ${tail}`;
  }

  // ---------------- canvas ----------------

  /** Dibujo de antes, a un múltiplo entero de su tamaño (sólo de reserva). */
  function drawOld(ctx, cv, x, y, size) {
    const w = cv.width, s2 = w * Math.max(1, Math.round(size / w));
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, Math.round(x + (size - s2) / 2), Math.round(y + (size - s2) / 2), s2, s2 * cv.height / cv.width);
    ctx.imageSmoothingEnabled = prev;
  }

  /**
   * Pinta el icono llenando la caja size×size (el dibujo, sin el margen
   * transparente del sprite). Si el png aún no ha llegado, el dibujo de antes
   * (o nada): en cuanto carga, se ve el bueno.
   */
  function draw(ctx, name, x, y, size) {
    const r = info(name);
    if (r.t === 'type') { drawOld(ctx, canvas(r.name), x, y, size); return; }
    const s = picOf(r);
    if (!s.ok) {
      const old = r.t === 'move' || own(LEGACY, r.name) ? canvas(r.name) : null;
      if (old) drawOld(ctx, old, x, y, size);
      return;
    }
    // Caja del dibujo (con la insignia, si es un movimiento).
    let bx = s.x, by = s.y, bw = s.w, bh = s.h;
    if (r.kind) { bw = Math.max(bx + bw, 30) - bx; bh = Math.max(by + bh, 30) - by; }
    let k = size / Math.max(bw, bh);
    // Cerca de un múltiplo entero (±12 %), a ese múltiplo: píxeles iguales y nítidos
    // (p. ej. una roca de 22 px en una caja de 20 sale a 22, no reducida y borrosa).
    const kr = Math.round(k);
    if (r.t !== 'vec' && kr >= 1 && Math.abs(k - kr) <= kr * 0.12) k = kr;
    const ox = Math.round(x + (size - bw * k) / 2), oy = Math.round(y + (size - bh * k) / 2);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = r.t === 'vec' || k < 1;
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, ox + (s.x - bx) * k, oy + (s.y - by) * k, s.w * k, s.h * k);
    if (r.kind) ctx.drawImage(badge(r.kind), ox + (21 - bx) * k, oy + (21 - by) * k, 9 * k, 9 * k);
    ctx.imageSmoothingEnabled = prev;
  }

  /**
   * Objeto en el mundo: el dibujo centrado en (cx, cy), a k unidades por
   * píxel del sprite (1 = la mitad de un píxel de los Pokémon). Devuelve
   * false si aún no ha cargado (el que llama pinta otra cosa).
   */
  function sprite(ctx, name, cx, cy, k = 1) {
    const r = info(name);
    if (r.t !== 'item' && r.t !== 'move') return false;
    const s = picOf(r);
    if (!s.ok) return false;
    const w = s.w * k, h = s.h * k;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    ctx.imageSmoothingEnabled = prev;
    return true;
  }

  /** Pide ya todos los sprites (los usa el canvas: HUD, objetos del suelo, tienda...). */
  function preload() {
    for (const k in ITEM) pic(DIR + ITEM[k] + '.png');
    for (const k in TM) pic(DIR + TM[k] + '.png');
    for (const k in VEC_COLOR) pic(vecUrl(k));
  }
  // Después de cargar la página, sin prisa.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('load', () => {
      const go = () => { try { preload(); } catch (e) { /* sin imágenes: se pintan los de reserva */ } };
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
    }, { once: true });
  }

  /**
   * Centelleo de shiny, dibujado píxel a píxel (no es un icono): una cruz que
   * nace, crece, echa puntas en diagonal y se apaga, como en los juegos.
   * phase 0..1 · px = tamaño de píxel en pantalla.
   */
  function twinkle(ctx, x, y, phase, px = 2) {
    const st = phase < 0.15 ? 0 : phase < 0.32 ? 1 : phase < 0.62 ? 2 : phase < 0.82 ? 1 : 0;
    const X = Math.round(x / px) * px, Y = Math.round(y / px) * px;
    const dot = (dx, dy, c) => { ctx.fillStyle = c; ctx.fillRect(X + dx * px, Y + dy * px, px, px); };
    const ARM = '#fff3a8', TIP = '#9ae6ff';
    dot(0, 0, '#ffffff');
    if (st >= 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(dx, dy, ARM);
    if (st >= 2) {
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) dot(dx, dy, ARM);
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) dot(dx, dy, TIP);
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) dot(dx, dy, TIP);
    }
  }

  /**
   * Rareza como Poké Ball: Poké (Común), Super (Poco común), Ultra (Rara),
   * Lujo (Épica) y Master (Legendaria).
   */
  const RARITY_BALL = { 1: 'ball', 2: 'ball2', 3: 'ball3', 4: 'ballLux', 5: 'ball4' };
  function rarity(n, size = 12) {
    return `<span class="rarity-ball" title="${(G.Gacha && G.Gacha.RARITY_NAME[n]) || ''}">${html(RARITY_BALL[n] || 'ball', size)}</span>`;
  }

  /** Publica en CSS los iconos que usan las hojas de estilo (con la URL entera: valen en cualquier hoja). */
  function installCss() {
    const abs = u => { try { return new URL(u, document.baseURI).href; } catch (e) { return u; } };
    const r = document.documentElement.style;
    r.setProperty('--ico-coin', `url("${abs(url('coin'))}")`);
    r.setProperty('--ico-cursor', `url("${url('cursor')}")`);
  }

  return { canvas, url, html, draw, sprite, preload, has, twinkle, rarity, RARITY_BALL, installCss,
           ITEM, TM, UI: LEGACY, TYPE_GLYPH, KIND_GLYPH };
})();
