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
 *   'move:<id>'                            dibujo del ataque: la forma de su familia con los colores y la munición de su tipo
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
  // Disco MT de cada tipo (desde el 23-10-2026 los ataques llevan su propio dibujo, moveArt: quedan como objetos).
  const TM = {
    normal: 'tm-normal', fire: 'tm-fire', water: 'tm-water', grass: 'tm-grass', electric: 'tm-electric',
    ice: 'tm-ice', fighting: 'tm-fighting', poison: 'tm-poison', ground: 'tm-ground', flying: 'tm-flying',
    psychic: 'tm-psychic', bug: 'tm-bug', rock: 'tm-rock', ghost: 'tm-ghost', dragon: 'tm-dragon',
    dark: 'tm-dark', steel: 'tm-steel', fairy: 'tm-fairy'
  };
  // Cristales Z de cada tipo (Tienda Kecleon, 24-10-2026): el icono 'z:<tipo>'; la Pulsera Z, 'zring'.
  const ZC = {
    normal: 'normalium-z--bag', fire: 'firium-z--bag', water: 'waterium-z--bag', grass: 'grassium-z--bag',
    electric: 'electrium-z--bag', ice: 'icium-z--bag', fighting: 'fightinium-z--bag', poison: 'poisonium-z--bag',
    ground: 'groundium-z--bag', flying: 'flyinium-z--bag', psychic: 'psychium-z--bag', bug: 'buginium-z--bag',
    rock: 'rockium-z--bag', ghost: 'ghostium-z--bag', dragon: 'dragonium-z--bag', dark: 'darkinium-z--bag',
    steel: 'steelium-z--bag', fairy: 'fairium-z--bag', ring: 'z-ring'
  };
  /* objetos:end */
  for (const t in ZC) ITEM[t === 'ring' ? 'zring' : 'z:' + t] = ZC[t];

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

  // ---------------- dibujos de los ataques (23-10-2026) ----------------
  /*
   * Al estilo de Vampire Survivors, cada ataque tiene su propio dibujo de 30×30
   * en pixel art (antes, todos los de un tipo eran el mismo disco MT con una
   * insignia diminuta). Manda la FORMA DE SU FAMILIA, grande: proyectil, órbita,
   * rayo, parábola, aspas, columnas... Con los COLORES de su tipo y, casi siempre,
   * su MUNICIÓN: la llama del fuego, la gota del agua, la hoja de planta, el rayo
   * eléctrico, el cristal de hielo... Si dos ataques comparten tipo y familia,
   * VARIANT (o el stat de los potenciadores) les da otra forma.
   * Se pinta por capas con figuras sencillas; cada capa se sombrea sola (luz
   * arriba a la izquierda, sombra abajo a la derecha) y se perfila con el
   * contorno, que la separa de lo que tiene debajo.
   */
  // Colores de cada tipo: sombra, base, luz, brillo, acento y acento oscuro.
  const ART_PAL = {
    normal:   ['#8f8574', '#cfc6b4', '#f1ebdd', '#ffffff', '#ffe9a8', '#a8916a'],
    fire:     ['#c2401b', '#ff7b3d', '#ffb070', '#fff6d0', '#ffd23f', '#ff4a1c'],
    water:    ['#2a5cc4', '#4b9bff', '#9cd0ff', '#f0faff', '#d6f0ff', '#1d3b8a'],
    grass:    ['#2f8a3a', '#5fcb6a', '#a8eea0', '#f0ffe8', '#9a6a34', '#1d5a26'],
    electric: ['#c49a10', '#ffd33d', '#fff3a0', '#ffffff', '#fffbe0', '#ff9a1c'],
    ice:      ['#3a9cb8', '#7fe0e0', '#d2fbff', '#ffffff', '#ffffff', '#4b9bff'],
    fighting: ['#9a2a1d', '#e0533d', '#ff9a80', '#fff0e8', '#ffd2a0', '#7a3a1a'],
    poison:   ['#6e2a86', '#b45ec4', '#e0a6ec', '#fff0ff', '#e8b0ff', '#4a1a5a'],
    ground:   ['#8f6a2a', '#d6b25c', '#f0dca0', '#fff8e0', '#8a5a2a', '#5a3a1a'],
    flying:   ['#5a74c4', '#9bb8ff', '#dce8ff', '#ffffff', '#ffffff', '#3a4f9a'],
    psychic:  ['#b82a66', '#ff5f9e', '#ffb0d0', '#ffffff', '#c47bff', '#6a1a4a'],
    bug:      ['#64801a', '#a3c43d', '#d8ef8a', '#fbffe0', '#5a3a1a', '#3a5a10'],
    rock:     ['#7a6a3a', '#bfa96b', '#e4d6a6', '#fff8e0', '#8a7a5a', '#4a3e22'],
    ghost:    ['#463a86', '#7a6bc4', '#b8acf0', '#f4f0ff', '#ff8ad8', '#2a2050'],
    dragon:   ['#3a2ab8', '#6b58ff', '#b0a6ff', '#f0eeff', '#ffb03d', '#24186e'],
    dark:     ['#3e342e', '#7d6c60', '#b4a294', '#f0e6dc', '#ff5f6d', '#241e1a'],
    steel:    ['#66788a', '#a8b8c4', '#e4eef4', '#ffffff', '#ffffff', '#3e4a58'],
    fairy:    ['#c45a9a', '#ff9ed8', '#ffd8f0', '#ffffff', '#ffe14d', '#8a2a6a']
  };
  // Índices de color: vacío, contorno, los seis del tipo y cuatro comunes (gris claro, gris oscuro, amarillo, rojo).
  const O = 1, D = 2, M = 3, L = 4, W = 5, A = 6, B = 7, N = 8, S = 9, Y = 10, R = 11;
  const ART_SHARED = ['#e4ecf6', '#7d8899', '#ffe14d', '#ff5f6d'];
  // Mismo tipo y misma familia: el segundo lleva otra forma.
  const VARIANT = { 'body-slam': 1, 'poison-sting': 1 };
  const DEG = Math.PI / 180;
  const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const starPts = (cx, cy, ro, ri, n, a0 = -90 * DEG) => {
    const p = [];
    for (let i = 0; i < n * 2; i++) p.push(pol(cx, cy, i % 2 ? ri : ro, a0 + i * Math.PI / n));
    return p;
  };

  /** Lápiz sobre una cuadrícula de 30×30 (índices de color); x, y: centros de píxel. */
  function artPen(type) {
    let cur = new Uint8Array(900);
    const base = cur;
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < 30 && y < 30) cur[y * 30 + x] = c; };
    const each = (x0, y0, x1, y1, f) => {
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(29, Math.ceil(y1)); y++)
        for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(29, Math.ceil(x1)); x++) f(x, y);
    };
    const P = {
      set: (x, y, c) => put(Math.round(x), Math.round(y), c),
      rect: (x0, y0, x1, y1, c) => each(x0, y0, x1, y1, (x, y) => { cur[y * 30 + x] = c; }),
      disc: (cx, cy, r, c) => {
        const r2 = r * r + r * 0.6, y1 = Math.min(29, Math.ceil(cy + r + 1)), x1 = Math.min(29, Math.ceil(cx + r + 1));
        for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= y1; y++) {
          const dy = (y - cy) * (y - cy);
          for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= x1; x++) if ((x - cx) * (x - cx) + dy <= r2) cur[y * 30 + x] = c;
        }
      },
      ell: (cx, cy, rx, ry, c, rot = 0) => {
        const co = Math.cos(rot), si = Math.sin(rot), m = Math.max(rx, ry) + 1;
        each(cx - m, cy - m, cx + m, cy + m, (x, y) => {
          const dx = x - cx, dy = y - cy, u = dx * co + dy * si, v = -dx * si + dy * co;
          if ((u / (rx + 0.4)) ** 2 + (v / (ry + 0.4)) ** 2 <= 1) cur[y * 30 + x] = c;
        });
      },
      /** Anillo de r0 a r1; con a0, a1 (radianes, 0 = derecha, en el sentido del reloj), sólo ese arco. */
      ring: (cx, cy, r0, r1, c, a0, a1) => each(cx - r1 - 1, cy - r1 - 1, cx + r1 + 1, cy + r1 + 1, (x, y) => {
        const d = Math.hypot(x - cx, y - cy);
        if (d < r0 || d > r1 + 0.3) return;
        if (a0 !== undefined) { let a = Math.atan2(y - cy, x - cx); while (a < a0) a += Math.PI * 2; if (a > a1) return; }
        cur[y * 30 + x] = c;
      }),
      line: (x0, y0, x1, y1, c, w = 1) => {
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * (w >= 3 ? 1.5 : 3)));
        for (let i = 0; i <= n; i++) {
          const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
          if (w >= 3) P.disc(x, y, w / 2 - 0.5, c);
          else for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) put(Math.round(x - (w - 1) / 2) + a, Math.round(y - (w - 1) / 2) + b, c);
        }
      },
      path: (pts, c, w = 1) => { for (let i = 1; i < pts.length; i++) P.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, w); },
      poly: (pts, c) => {
        let x0 = 30, y0 = 30, x1 = 0, y1 = 0;
        for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        each(x0, y0, x1, y1, (x, y) => {
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const [xi, yi] = pts[i], [xj, yj] = pts[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) cur[y * 30 + x] = c;
        });
      },
      star: (cx, cy, ro, ri, n, c, a0) => P.poly(starPts(cx, cy, ro, ri, n, a0), c),
      /** Flecha hacia arriba (potenciadores): punta en (cx, top). */
      arrow: (cx, top, bot, w, c) => {
        P.poly([[cx, top - 0.5], [cx + w + 2.5, top + w + 2], [cx - w - 2.5, top + w + 2]], c);
        P.rect(cx - w / 2 + 0.5, top + w + 1, cx + w / 2 - 0.5, bot, c);
      },
      /** Puntos (rastro) a lo largo de una curva cuadrática, de t0 a t1. */
      dots: (p0, p1, p2, t0, t1, n, r, c) => {
        for (let i = 0; i < n; i++) {
          const t = t0 + (t1 - t0) * i / Math.max(1, n - 1), u = 1 - t;
          P.disc(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], r, c);
        }
      },
      /** Una capa aparte: se sombrea, se perfila y tapa lo de debajo. */
      lay: fn => {
        const under = cur;
        cur = new Uint8Array(900);
        fn();
        const top = cur;
        cur = under;
        finish(top);
        for (let i = 0; i < 900; i++) if (top[i]) cur[i] = top[i];
      },
      /** La munición del tipo, en su capa, centrada en (x, y) con radio r. */
      el: (x, y, r) => P.lay(() => (ELEM[type] || ELEM.normal)(P, x, y, r)),
      done: () => { finish(base); return base; }
    };
    return P;
  }

  /** Sombrea (la base de color, M) y perfila una capa. */
  const finOut = new Uint8Array(900);
  function finish(b) {
    const out = finOut;
    out.set(b);
    for (let y = 0, i = 0; y < 30; y++) for (let x = 0; x < 30; x++, i++) {
      const c = b[i];
      if (c > O && c !== M) continue;
      const up = y ? b[i - 30] : 0, lf = x ? b[i - 1] : 0, dn = y < 29 ? b[i + 30] : 0, rt = x < 29 ? b[i + 1] : 0;
      if (c === M) {
        const lit = !up || !lf, dim = !dn || !rt;
        if (dim && !lit) out[i] = D;
        else if (lit && !dim) out[i] = L;
      } else if (!c && ((up > O) || (lf > O) || (dn > O) || (rt > O))) out[i] = O;
    }
    b.set(out);
  }

  /** La munición de cada tipo (lo que lanza): llama, gota, hoja, rayo, cristal... */
  const ELEM = {
    normal(P, x, y, r) {          // estrella
      P.star(x, y + r * 0.08, r * 1.12, r * 0.5, 5, M);
      if (r >= 4) P.set(x - 1, y - 1, W);
    },
    fire(P, x, y, r) {            // llama
      P.disc(x, y + r * 0.3, r * 0.72, M);
      P.poly([[x - r * 0.66, y + r * 0.15], [x + r * 0.15, y - r * 1.1], [x + r * 0.7, y + r * 0.1]], M);
      if (r >= 3.5) {
        P.disc(x, y + r * 0.45, r * 0.4, A);
        P.poly([[x - r * 0.38, y + r * 0.4], [x + r * 0.08, y - r * 0.4], [x + r * 0.4, y + r * 0.4]], A);
      } else P.set(x, y + r * 0.4, A);
    },
    water(P, x, y, r) {           // gota
      P.disc(x, y + r * 0.32, r * 0.7, M);
      P.poly([[x - r * 0.64, y + r * 0.12], [x, y - r * 1.1], [x + r * 0.64, y + r * 0.12]], M);
      if (r >= 3.5) { P.set(x - r * 0.35, y + r * 0.15, W); P.set(x - r * 0.35, y + r * 0.45, W); }
    },
    grass(P, x, y, r) {           // hoja
      P.ell(x + r * 0.1, y - r * 0.1, r * 1.05, r * 0.52, M, -45 * DEG);
      P.line(x - r * 0.95, y + r * 0.95, x - r * 0.55, y + r * 0.55, A, 1);
      if (r >= 3.5) P.line(x - r * 0.5, y + r * 0.5, x + r * 0.55, y - r * 0.55, D, 1);
    },
    electric(P, x, y, r) {        // rayo
      const q = [[0.32, -1.1], [-0.6, 0.14], [-0.04, 0.14], [-0.34, 1.1], [0.62, -0.2], [0.06, -0.2]];
      P.poly(q.map(([a, b]) => [x + a * r, y + b * r]), M);
    },
    ice(P, x, y, r) {             // cristal
      const q = [[0, -1.12], [0.64, -0.38], [0.64, 0.38], [0, 1.12], [-0.64, 0.38], [-0.64, -0.38]];
      P.poly(q.map(([a, b]) => [x + a * r, y + b * r]), M);
      P.poly([[x, y - r * 1.12], [x - r * 0.64, y - r * 0.38], [x - r * 0.64, y + r * 0.38], [x, y + r * 1.12]], L);
      if (r >= 4) P.line(x, y - r * 0.6, x, y + r * 0.6, W, 1);
    },
    fighting(P, x, y, r) {        // puño (de frente: cuatro nudillos y el pulgar)
      P.rect(x - r * 0.85, y - r * 0.45, x + r * 0.85, y + r * 0.8, M);
      for (const f of [-0.62, -0.2, 0.22, 0.64]) P.disc(x + f * r, y - r * 0.5, r * 0.27, M);
      if (r >= 4) {
        for (const f of [-0.41, 0.01, 0.43]) P.line(x + f * r, y - r * 0.55, x + f * r, y - r * 0.05, D, 1);
        P.line(x - r * 0.75, y + r * 0.22, x + r * 0.2, y + r * 0.22, L, 2);
        P.rect(x - r * 0.6, y + r * 0.85, x + r * 0.6, y + r * 1.15, A);
      }
    },
    poison(P, x, y, r) {          // burbuja de lodo
      P.disc(x - r * 0.1, y + r * 0.18, r * 0.78, M);
      P.disc(x + r * 0.62, y - r * 0.62, r * 0.32, M);
      if (r >= 4) { P.disc(x - r * 0.42, y - r * 0.82, r * 0.2, L); P.set(x - r * 0.4, y - r * 0.05, W); }
    },
    ground(P, x, y, r) {          // hueso
      const a = r * 0.62;
      P.line(x - a, y + a, x + a, y - a, M, r >= 4 ? 3 : 2);
      for (const [px, py] of [[x - a, y + a], [x + a, y - a]]) {
        P.disc(px - r * 0.32, py - r * 0.32, r * 0.3, M);
        P.disc(px + r * 0.32, py + r * 0.32, r * 0.3, M);
      }
    },
    flying(P, x, y, r) {          // pluma
      P.ell(x + r * 0.1, y - r * 0.1, r * 1.05, r * 0.45, M, -50 * DEG);
      P.line(x - r * 1.0, y + r * 1.0, x + r * 0.4, y - r * 0.55, r >= 4 ? D : B, 1);
    },
    psychic(P, x, y, r) {         // onda psíquica
      P.disc(x, y, r * 0.95, M);
      if (r >= 3.5) { P.ring(x, y, r * 0.38, r * 0.62, W); P.set(x, y, A); } else P.set(x, y, W);
    },
    bug(P, x, y, r) {             // escarabajo
      P.ell(x, y + r * 0.2, r * 0.72, r * 0.82, M);
      P.disc(x, y - r * 0.7, r * 0.36, B);
      if (r >= 3.5) {
        P.line(x, y - r * 0.35, x, y + r * 0.95, D, 1);
        P.line(x - r * 0.25, y - r * 0.9, x - r * 0.7, y - r * 1.2, B, 1);
        P.line(x + r * 0.25, y - r * 0.9, x + r * 0.7, y - r * 1.2, B, 1);
      }
    },
    rock(P, x, y, r) {            // roca
      const q = [[-0.98, 0.15], [-0.55, -0.78], [0.28, -0.98], [0.98, -0.25], [0.78, 0.78], [-0.25, 0.98]];
      P.poly(q.map(([a, b]) => [x + a * r, y + b * r]), M);
      if (r >= 4) P.line(x - r * 0.1, y - r * 0.2, x + r * 0.35, y + r * 0.35, D, 1);
    },
    ghost(P, x, y, r) {           // fantasmita
      P.disc(x, y - r * 0.15, r * 0.8, M);
      P.rect(x - r * 0.8, y - r * 0.15, x + r * 0.8, y + r * 0.85, M);
      for (let i = -1; i <= 1; i += 2) P.set(x + i * r * 0.4, y + r * 0.95, 0);
      P.set(x - r * 0.32, y - r * 0.15, O); P.set(x + r * 0.32, y - r * 0.15, O);
      if (r >= 4.5) { P.set(x - r * 0.32, y + r * 0.05, O); P.set(x + r * 0.32, y + r * 0.05, O); }
    },
    dragon(P, x, y, r) {          // ojo de dragón
      P.ell(x, y, r * 1.08, r * 0.64, M);
      P.disc(x, y, r * 0.46, A);
      P.line(x, y - r * 0.5, x, y + r * 0.5, O, 1);
    },
    dark(P, x, y, r) {            // luna menguante
      P.disc(x, y, r * 0.98, M);
      P.disc(x + r * 0.5, y - r * 0.38, r * 0.72, 0);
      if (r >= 4) P.set(x + r * 0.55, y + r * 0.55, A);
    },
    steel(P, x, y, r) {           // tuerca
      P.poly([0, 1, 2, 3, 4, 5].map(i => pol(x, y, r * 1.02, (i * 60) * DEG)), M);
      P.disc(x, y, r * 0.34, r >= 4 ? N : S);
    },
    fairy(P, x, y, r) {           // destello
      P.star(x, y, r * 1.18, r * 0.34, 4, M);
      P.set(x, y, W);
      if (r >= 4) P.star(x + r * 0.95, y - r * 0.95, r * 0.42, r * 0.14, 4, A);
    }
  };

  /** Dibujo de cada familia. v: variante (VARIANT) o el stat del potenciador. */
  const KIND_ART = {
    projectile(P, v) {
      if (v === 1) {                                       // aguijón
        P.lay(() => { P.line(2, 22, 8, 16, L, 1); P.line(9, 28, 15, 22, L, 1); });
        P.lay(() => {
          P.poly([[28, 1], [22, 11], [8, 25], [5, 22], [19, 8]], M);
          P.poly([[9, 18], [12, 21], [5, 27], [3, 25]], D);
          P.line(26, 3, 19, 10, W, 1);
        });
        P.el(23, 22, 4.5);
        return;
      }
      P.lay(() => { P.line(2, 20, 9, 13, L, 2); P.line(5, 27, 13, 19, M, 3); P.line(11, 28, 16, 23, L, 2); });
      P.el(19, 11, 7.6);
    },
    homing(P) {
      P.lay(() => P.dots([3, 27], [3, 8], [16, 11], 0, 0.82, 6, 1.3, L));
      P.lay(() => { P.ring(23, 23, 4, 5.4, N); P.line(23, 16, 23, 18, N, 1); P.line(23, 28, 23, 29, N, 1); P.line(16, 23, 18, 23, N, 1); P.line(28, 23, 29, 23, N, 1); });
      P.el(20, 10, 6.4);
    },
    bounce(P) {
      P.lay(() => { P.path([[2, 9], [8, 26], [14, 12], [20, 26]], L, 2); P.line(4, 28, 12, 28, N, 1); P.line(16, 28, 24, 28, N, 1); });
      P.el(22, 12, 6.2);
    },
    lob(P) {
      P.lay(() => P.dots([3, 27], [12, -6], [21, 16], 0, 0.78, 7, 1.25, L));
      P.lay(() => { P.line(15, 28, 28, 28, N, 1); });
      P.el(22, 21, 6.3);
    },
    knife(P) {
      const dart = (tx, ty) => P.lay(() => {
        P.poly([[tx + 0.5, ty], [tx - 6, ty - 2.6], [tx - 15, ty - 1], [tx - 15, ty + 1], [tx - 6, ty + 2.6]], M);
        P.line(tx - 13, ty, tx - 2, ty, L, 1);
        P.rect(tx - 18, ty - 1, tx - 16, ty + 1, B);
      });
      dart(27, 5); dart(20, 15); dart(27, 25);
    },
    cross(P) {
      P.lay(() => {
        for (let k = 0; k < 4; k++) {
          const a = (k * 90 - 70) * DEG;
          P.poly([[15, 15], pol(15, 15, 14, a), pol(15, 15, 7.5, a + 62 * DEG)], M);
        }
      });
      P.el(15, 15, 4.2);
    },
    nova(P) {
      P.lay(() => { for (let k = 0; k < 8; k++) { const a = k * 45 * DEG; P.line(...pol(15, 15, 9.5, a), ...pol(15, 15, 13.6, a), M, 3); } });
      P.el(15, 15, 6.4);
    },
    cone(P) {
      P.lay(() => {
        const pts = [[4, 26]];
        for (let a = -88; a <= -2; a += 6) pts.push(pol(4, 26, 25, a * DEG));
        P.poly(pts, M);
        const ins = [[4, 26]];
        for (let a = -72; a <= -18; a += 6) ins.push(pol(4, 26, 18, a * DEG));
        P.poly(ins, L);
      });
      P.el(6, 24, 4.6);
    },
    ricochet(P) {
      P.lay(() => {
        for (const [x, y, dx, dy] of [[1, 1, 1, 1], [28, 1, -1, 1], [1, 28, 1, -1], [28, 28, -1, -1]]) {
          P.line(x, y, x + dx * 6, y, N, 2); P.line(x, y, x, y + dy * 6, N, 2);
        }
      });
      P.lay(() => P.path([[5, 13], [11, 25], [25, 17], [19, 8]], L, 1));
      P.el(16, 10, 5.4);
    },
    dusting(P) {
      for (const [x, y] of [[7, 8], [18, 5], [25, 15], [11, 19], [20, 25]]) {
        P.lay(() => P.line(x - 5, y - 5, x - 2, y - 2, L, 1));
        P.el(x, y, 3.8);
      }
    },
    meteor(P) {
      P.lay(() => P.ell(18, 26.5, 9, 2.2, S));
      P.lay(() => { P.poly([[1, 3], [4, 1], [20, 11], [13, 18]], M); P.line(3, 3, 14, 12, W, 1); });
      P.el(17, 15, 7.4);
    },
    orbit(P) {
      P.lay(() => P.ring(15, 15, 10.3, 11.3, L));
      P.lay(() => { P.disc(15, 15, 3.4, N); P.set(14, 14, W); });
      for (const a of [-90, 30, 150]) P.el(...pol(15, 15, 10.8, a * DEG), 4.4);
    },
    beam(P) {
      P.lay(() => { P.line(6, 24, 31, -1, M, 9); P.line(6, 24, 31, -1, L, 5); P.line(6, 24, 31, -1, W, 2); });
      P.el(6, 24, 5.4);
    },
    charge(P) {
      P.lay(() => { for (let k = 0; k < 8; k++) { const a = (k * 45 + 22.5) * DEG; P.line(...pol(15, 15, 14.2, a), ...pol(15, 15, 11.2, a), L, 2); } });
      P.lay(() => { P.disc(15, 15, 9, M); P.disc(15, 15, 6.2, L); });
      P.el(15, 15, 4.6);
    },
    sweep(P) {
      P.lay(() => {
        const pts = [[15, 16]];
        for (let a = -120; a <= -36; a += 6) pts.push(pol(15, 16, 13.5, a * DEG));
        P.poly(pts, L);
      });
      P.lay(() => { P.line(15, 16, ...pol(15, 16, 15.5, -32 * DEG), M, 4); P.line(15, 16, ...pol(15, 16, 15, -32 * DEG), W, 1); });
      P.el(15, 17, 4.8);
    },
    column(P) {
      for (const [x, top] of [[6, 7], [15, 2], [24, 9]]) {
        P.lay(() => { P.rect(x - 2.5, top, x + 2.5, 26, M); P.line(x, top + 1, x, 25, W, 1); P.ell(x, 27, 4, 1.4, A); });
      }
    },
    melee(P, v) {
      if (v === 1) {                                       // aplastar (Golpe Cuerpo): una mole cae sobre el suelo, que se agrieta
        P.lay(() => { P.rect(0, 23, 29, 29, S); P.path([[9, 29], [12, 25], [15, 27], [18, 24], [21, 29]], O, 1); });
        P.lay(() => { P.line(5, 1, 5, 6, L, 2); P.line(15, 0, 15, 3, L, 2); P.line(25, 1, 25, 6, L, 2); });
        P.lay(() => { P.disc(15, 15, 9.5, M); P.rect(5.5, 15, 24.5, 22, M); P.disc(11, 11, 2, W); });
        for (const s of [-1, 1]) P.lay(() => { P.disc(15 + s * 12, 20, 2.4, N); P.disc(15 + s * 10.5, 16.5, 1.4, N); });
        return;
      }
      for (const o of [-7, 0, 7]) {                        // zarpazo
        P.lay(() => {
          P.path([[22 + o, 1], [19 + o, 9], [13 + o, 19], [5 + o, 28]], M, 2);
          P.path([[21 + o, 4], [17 + o, 12], [12 + o, 19]], M, 3);
          P.line(19 + o, 8, 13 + o, 17, W, 1);
        });
      }
    },
    spin(P) {
      P.lay(() => {
        P.ring(15, 15, 9.5, 12.8, M, 200 * DEG, 330 * DEG);
        P.ring(15, 15, 9.5, 12.8, M, 20 * DEG, 150 * DEG);
        P.poly([pol(15, 15, 7.6, 330 * DEG), pol(15, 15, 14.8, 330 * DEG), pol(15, 15, 11.2, 358 * DEG)], M);
        P.poly([pol(15, 15, 7.6, 150 * DEG), pol(15, 15, 14.8, 150 * DEG), pol(15, 15, 11.2, 178 * DEG)], M);
      });
      P.el(15, 15, 5);
    },
    dash(P) {
      P.lay(() => { P.line(1, 8, 6, 8, L, 2); P.line(0, 15, 4, 15, L, 2); P.line(1, 22, 6, 22, L, 2); });
      P.lay(() => P.path([[9, 4], [18, 15], [9, 26]], M, 4));
      P.lay(() => P.path([[17, 4], [26, 15], [17, 26]], M, 4));
    },
    shove(P) {
      P.lay(() => {
        for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          P.line(15 + sx * 6.5, 15 + sy * 6.5, 15 + sx * 10.5, 15 + sy * 10.5, M, 3);
          P.poly([[15 + sx * 14.5, 15 + sy * 14.5], [15 + sx * 8, 15 + sy * 14.5], [15 + sx * 14.5, 15 + sy * 8]], M);
        }
      });
      P.el(15, 15, 5.2);
    },
    stun(P) {
      P.lay(() => { P.ell(15, 23, 12.5, 4.8, N); P.ell(15, 23, 10.5, 3, 0); });
      P.el(15, 15, 6.5);
      for (const [x, y] of [[5, 5], [15, 2], [25, 5]]) P.lay(() => P.star(x, y, 2.6, 0.9, 4, Y));
    },
    quake(P) {
      P.lay(() => { P.rect(0, 20, 29, 29, M); P.path([[4, 29], [8, 25], [13, 26], [16, 21]], O, 1); P.path([[16, 21], [21, 24], [25, 20]], O, 1); });
      for (const [x, y, r] of [[8, 12, 3], [16, 6, 3.6], [23, 13, 2.6]]) P.lay(() => P.poly([[x - r, y], [x - r * 0.3, y - r], [x + r, y - r * 0.4], [x + r * 0.6, y + r], [x - r * 0.5, y + r * 0.8]], M));
    },
    vortex(P) {
      P.lay(() => {
        let last = null;
        for (let t = 0; t <= 3.6 * Math.PI; t += 0.08) {
          const r = 1.2 + t * 1.12, p = pol(15, 15, r, t - Math.PI / 2);
          if (last) P.line(last[0], last[1], p[0], p[1], M, t > 6 ? 3 : 2);
          last = p;
        }
      });
      P.el(15, 15, 3.6);
    },
    aura(P) {
      P.lay(() => P.ring(15, 15, 12.6, 14.2, L));
      P.lay(() => P.ring(15, 15, 8.6, 10.8, M));
      P.el(15, 15, 5.8);
    },
    chain(P) {
      P.lay(() => {
        P.path([[5, 23], [9, 15], [11, 16], [15, 7]], W, 2);
        P.path([[15, 7], [18, 14], [21, 13], [25, 21]], W, 2);
      });
      for (const [x, y] of [[5, 23], [15, 7], [25, 21]]) P.el(x, y, 4.4);
    },
    mine(P) {
      P.lay(() => P.ell(15, 26.5, 9, 2, S));
      P.lay(() => { for (let k = 0; k < 8; k++) { const a = k * 45 * DEG; P.line(...pol(15, 16, 6, a), ...pol(15, 16, 10.6, a), D, 2); } });
      P.lay(() => { P.disc(15, 16, 7.2, M); P.set(12, 13, W); P.set(13, 13, W); P.set(12, 14, W); });
      P.lay(() => P.disc(15, 7.5, 1.4, R));
    },
    trail(P) {
      P.lay(() => { P.ell(7, 25, 6, 2.6, M); P.ell(15, 18, 4.6, 2, M); P.ell(20.5, 12.5, 3.2, 1.5, M); });
      P.el(24.5, 6, 4.4);
    },
    puddle(P) {
      P.lay(() => { P.ell(21, 26, 8, 2.6, M); P.disc(27, 19, 1.2, M); P.disc(23, 17, 1, M); });
      P.lay(() => {
        P.disc(12, 17, 7.6, N);
        P.rect(9.5, 5, 14.5, 10, N);
        P.disc(12, 18.5, 6, M);
        P.rect(6, 13, 18, 16, N);
        P.rect(9.5, 2, 14.5, 4.5, S);
      });
    },
    turret(P) {
      P.lay(() => P.poly([[5, 28], [25, 28], [21, 20], [9, 20]], S));
      P.lay(() => P.line(15, 15, 26, 5, N, 4));
      P.lay(() => P.disc(15, 15, 6.3, M));
      P.el(15, 15, 3.4);
    },
    boomerang(P) {
      P.lay(() => P.dots([26, 23], [30, 30], [20, 28], 0, 1, 3, 1, L));
      P.lay(() => {
        P.path([[4, 5], [7, 14], [12, 23]], M, 5);
        P.path([[12, 23], [19, 19], [27, 16]], M, 5);
        P.path([[5, 7], [8, 14], [12, 20]], L, 1);
      });
    },
    wipe(P) {
      P.lay(() => { P.rect(2, 3, 27, 26, N); P.rect(4, 5, 25, 24, 0); });
      P.lay(() => { P.line(1, 29, 29, 1, M, 8); P.line(2, 28, 28, 2, W, 2); });
      P.el(22, 22, 4.6);
    },
    ward(P) {
      P.lay(() => {
        P.poly([[3, 3], [27, 3], [27, 14], [15, 28], [3, 14]], M);
        P.poly([[6, 6], [24, 6], [24, 13.5], [15, 24.5], [6, 13.5]], D);
      });
      P.el(15, 13, 5.6);
    },
    ally(P) {
      const mon = (x, y, rx, ry) => P.lay(() => {
        P.ell(x, y, rx, ry, M);
        P.rect(x - rx * 0.6, y + ry * 0.6, x - rx * 0.2, y + ry + 1, M); P.rect(x + rx * 0.2, y + ry * 0.6, x + rx * 0.6, y + ry + 1, M);
        for (const s of [-1, 1]) { P.disc(x + s * rx * 0.38, y - ry * 0.15, Math.max(1, rx * 0.2), W); P.set(x + s * rx * 0.38 + s * 0.4, y - ry * 0.1, O); }
      });
      mon(8, 12, 5, 4.5);
      mon(18, 19, 8, 7);
      P.el(24, 6, 3.8);
    },
    wings(P) {
      P.lay(() => {
        P.poly([[15, 12], [1, 4], [3, 11], [12, 18]], M);
        P.poly([[15, 12], [29, 4], [27, 11], [18, 18]], M);
        P.ell(15, 14, 3, 5, M); P.disc(15, 8.5, 2.6, M);
        P.set(14, 8, O);
      });
      P.el(15, 24.5, 3.8);
    },
    buff(P, v) {
      if (v === 'patk') {                                  // espada
        P.lay(() => { P.poly([[13, 1], [16, 4], [16, 19], [12, 19], [12, 4]], N); P.line(13, 3, 13, 18, W, 1); });
        P.lay(() => { P.rect(7, 19, 21, 21, B); P.rect(12.5, 22, 15.5, 26, S); P.disc(14, 27.5, 1.5, B); });
        P.lay(() => P.arrow(24, 4, 15, 2, M));
        return;
      }
      if (v === 'satk') {                                  // destello (ataque especial)
        P.lay(() => { P.star(12, 17, 12, 3.6, 4, M); P.star(12, 17, 6, 1.8, 4, L); P.set(12, 17, W); });
        P.lay(() => P.star(5, 5, 3.4, 1.1, 4, A));
        P.lay(() => P.arrow(25, 2, 14, 2, M));
        return;
      }
      if (v === 'spd') {                                   // galones hacia arriba
        P.lay(() => P.path([[4, 15], [15, 4], [26, 15]], M, 4));
        P.lay(() => P.path([[4, 26], [15, 15], [26, 26]], M, 4));
        return;
      }
      if (v === 'def') {                                   // placa
        P.lay(() => { P.poly([0, 1, 2, 3, 4, 5].map(i => pol(12, 17, 10, (i * 60 + 30) * DEG)), M); P.poly([0, 1, 2, 3, 4, 5].map(i => pol(12, 17, 5.6, (i * 60 + 30) * DEG)), L); });
        P.lay(() => P.arrow(25, 2, 14, 2, M));
        return;
      }
      if (v === 'regen') {                                 // aro y corazón
        P.lay(() => P.ring(15, 15, 10.5, 13.5, M));
        P.lay(() => {
          P.disc(12, 13, 3.2, R); P.disc(18, 13, 3.2, R);
          P.poly([[8.6, 14], [21.4, 14], [15, 21.5]], R);
          P.set(11, 12, W);
        });
        return;
      }
      P.lay(() => P.arrow(15, 3, 27, 5, M));
    }
  };
  // -- ataques únicos: Normal, Fuego, Agua, Planta, Eléctrico, Hielo (26-10-2026) --
  // Los que han cambiado tanto de forma que el dibujo de su familia ya no encaja (manda sobre KIND_ART).
  const ID_ART = {
    // Sustituto: un muñeco de trapo con cara (el señuelo), no una torreta.
    substitute(P) {
      P.lay(() => P.ell(15, 27.5, 8, 1.8, S));
      P.lay(() => { P.line(4, 20, 10, 17, M, 3); P.line(20, 17, 26, 20, M, 3); P.rect(10.5, 23, 13.5, 27, M); P.rect(16.5, 23, 19.5, 27, M); });
      P.lay(() => { P.rect(9.5, 14, 20.5, 24, M); P.line(15, 15, 15, 23, B, 1); P.set(13, 17, B); P.set(17, 21, B); });
      P.lay(() => { P.disc(15, 8.5, 6.8, M); P.rect(12, 7, 12, 8, O); P.rect(18, 7, 18, 8, O); P.line(13, 11, 17, 11, B, 1); });
      P.lay(() => P.star(25, 5, 3.2, 1.1, 4, A));
    },
    // Fuego Fatuo: llamas que flotan con su estela y se quedan pegadas a un enemigo (silueta gris).
    'will-o-wisp'(P) {
      P.lay(() => { P.ell(18, 23, 9, 5.5, S); P.disc(18, 15, 5.5, S); P.set(16, 14, N); P.set(20, 14, N); });
      P.lay(() => { P.path([[1, 13], [4, 10], [7, 12], [10, 9]], L, 1); P.path([[9, 2], [12, 4], [15, 2]], L, 1); });
      P.el(10, 10, 4.6); P.el(17, 4, 3.4); P.el(23, 17, 4.8);
    },
    // Giro Fuego: una jaula de llamas alrededor de un enemigo (silueta gris), no orbes a tu alrededor.
    'fire-spin'(P) {
      P.lay(() => P.ell(15, 25, 11, 3, S));
      P.lay(() => { P.ell(15, 19, 5, 4.2, S); P.disc(15, 12.5, 4, S); P.set(13, 12, N); P.set(17, 12, N); });
      for (const [x, y, r] of [[4.5, 21, 3.6], [6.5, 9.5, 3.4], [15, 4.5, 3.5], [23.5, 9.5, 3.4], [25.5, 21, 3.6], [15, 26.5, 3.2]]) P.el(x, y, r);
    },
    // Onda Ígnea: un frente de aire ardiente en arco que avanza.
    'heat-wave'(P) {
      P.lay(() => P.ring(3, 27, 20.5, 24, M, -88 * DEG, -2 * DEG));
      P.lay(() => P.ring(3, 27, 13, 16, A, -84 * DEG, -6 * DEG));
      P.lay(() => P.ring(3, 27, 6, 8.5, W, -80 * DEG, -10 * DEG));
      for (const a of [-76, -45, -14]) { const [x, y] = pol(3, 27, 25, a * DEG); P.el(x, y, 3.2); }
    },
    // Bomba Germen: una semilla clavada que brota y estalla.
    'seed-bomb'(P) {
      P.lay(() => P.ell(15, 26.5, 9, 2.4, S));
      P.lay(() => { for (const a of [-160, -125, -55, -20]) { const [x0, y0] = pol(15, 18, 9.5, a * DEG), [x1, y1] = pol(15, 18, 13.5, a * DEG); P.line(x0, y0, x1, y1, Y, 2); } });
      P.lay(() => { P.ell(15, 22.5, 5.5, 3.8, A); P.set(13, 21, W); });
      P.lay(() => P.line(15, 18.5, 15, 10, M, 2));
      P.el(10.5, 9, 4.2); P.el(19.5, 8, 4.2);
    },
    // Golpe Cuerpo: saltas y caes con todo tu peso (la onda en el suelo).
    'body-slam'(P) {
      P.lay(() => { P.ell(15, 26, 13.5, 3.3, A); P.ell(15, 26, 9.5, 1.8, 0); });
      P.lay(() => { P.line(7, 2, 7, 8, L, 1); P.line(23, 2, 23, 8, L, 1); P.line(11, 0, 11, 4, L, 1); P.line(19, 0, 19, 4, L, 1); });
      P.lay(() => { P.ell(15, 15.5, 8.5, 7.5, M); P.set(12, 13, O); P.set(18, 13, O); P.line(13, 18, 17, 18, O, 1); });
      P.lay(() => { P.star(4, 21, 3, 1.1, 4, Y); P.star(26, 20, 3, 1.1, 4, Y); });
    },
    // Látigo Cepa: la liana agarra a un enemigo y lo trae hacia ti.
    'vine-whip'(P) {
      P.lay(() => { P.ell(22, 13, 5, 4.4, S); P.disc(22, 6.5, 3.6, S); P.set(20, 6, N); P.set(24, 6, N); });
      P.lay(() => { P.path([[2, 28], [5, 23], [9, 21], [13, 16], [17, 13]], M, 3); P.ring(22, 12, 4.4, 6.4, M, -200 * DEG, 40 * DEG); });
      P.el(6.5, 17.5, 3.2); P.el(13.5, 22.5, 3);
      P.lay(() => P.poly([[9, 3], [3, 8], [10, 9]], Y));
    }
  };
  const ART_FALLBACK = 'projectile';
  const ART_BLANK = { px: new Uint8Array(900), pal: [] };   // sin datos de movimientos aún: nada

  const arts = new Map();       // id -> { px: índices 30×30, pal: colores (null si vacío) }

  /** Dibujo de un ataque: { px, pal } (null si no existe). */
  function moveArt(id) {
    let a = arts.get(id);
    if (a) return a;
    const m = G.Moves && G.Moves.BY_ID[id];
    if (!m) return null;
    const type = own(ART_PAL, m.type) ? m.type : 'normal';
    const P = artPen(type);
    const v = m.kind === 'buff' ? m.stat : VARIANT[id] || 0;
    (ID_ART[id] || KIND_ART[m.kind] || KIND_ART[ART_FALLBACK])(P, v);     // (ID_ART: ataques únicos, 26-10-2026)
    a = { px: P.done(), pal: [null, K, ...ART_PAL[type], ...ART_SHARED] };
    arts.set(id, a);
    return a;
  }

  // ---------------- qué es cada nombre ----------------

  const infos = new Map();      // nombre -> { t: 'item'|'move'|'type'|'vec', name, file, id, tint, pic }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function info(name) {
    name = String(name);
    let r = infos.get(name);
    if (r) return r;
    r = { t: 'item', name, file: '', id: '', tint: '', pic: null };
    if (name.startsWith('move:')) {
      // Su dibujo (moveArt); uno que no existe, el de Placaje.
      r.t = 'move';
      r.id = G.Moves && G.Moves.BY_ID[name.slice(5)] ? name.slice(5) : 'tackle';
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

  /** El dibujo de un ataque en un canvas de 30×30 (para el HUD y el mundo). */
  const artCanvases = new Map();
  function artCanvas(id) {
    let cv = artCanvases.get(id);
    if (cv) return cv;
    const a = moveArt(id) || ART_BLANK;
    cv = document.createElement('canvas');
    cv.width = cv.height = 30;
    const c = cv.getContext('2d');
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30;) {
      const v = a.px[y * 30 + x];
      let n = 1;
      while (x + n < 30 && a.px[y * 30 + x + n] === v) n++;
      if (v) { c.fillStyle = a.pal[v]; c.fillRect(x, y, n, 1); }
      x += n;
    }
    if (a !== ART_BLANK) artCanvases.set(id, cv);       // (sin datos aún: no se guarda)
    return cv;
  }

  /** El dibujo de un ataque como SVG (un trazado por color, un tramo por fila): para el DOM. */
  function artUrl(id) {
    const key = 'move:' + id;
    let u = urls.get(key);
    if (u) return u;
    const a = moveArt(id) || ART_BLANK, d = {};
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30;) {
      const v = a.px[y * 30 + x];
      let n = 1;
      while (x + n < 30 && a.px[y * 30 + x + n] === v) n++;
      if (v) d[v] = (d[v] || '') + `M${x} ${y}h${n}v1h-${n}z`;
      x += n;
    }
    const body = Object.keys(d).map(v => `<path fill='${a.pal[v]}' d='${d[v]}'/>`).join('');
    u = 'data:image/svg+xml,' + `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30' shape-rendering='crispEdges'>${body}</svg>`
      .replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, '%22');
    if (a !== ART_BLANK) urls.set(key, u);
    return u;
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

  /** Emblema circular de un tipo (16×16). */
  function emblem(type) {
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
    return cv;
  }

  /** Canvas a 1× de los dibujos de antes y de los emblemas (null si no hay). */
  function canvas(name) {
    let cv = cache.get(name);
    if (cv !== undefined) return cv;
    if (name.startsWith('move:')) {
      cv = artCanvas(info(name).id);
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

  /** Ruta de la imagen del icono (png del objeto; los ataques, los emblemas y los SVG, como data URL). */
  function url(name) {
    const r = info(name);
    if (r.t === 'vec') return vecUrl(r.name);
    if (r.t === 'move') return artUrl(r.id);
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
    const tail = `width="${d}" height="${d}" alt="" draggable="false" decoding="async">`;
    // Ataque: su dibujo, que llena la caja (sin el aumento de ico-sm de los objetos pequeños).
    if (r.t === 'move') return `<img class="pix ico-mv${extra}" src="${artUrl(r.id)}" ${tail}`;
    const c = 'pix' + (d < 27 ? ' ico-sm' : '') + (r.tint ? ' ico-' + r.tint : '') + extra;
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
    if (r.t === 'move') { drawArt(ctx, artCanvas(r.id), x, y, size); return; }
    const s = picOf(r);
    if (!s.ok) {
      const old = own(LEGACY, r.name) ? canvas(r.name) : null;
      if (old) drawOld(ctx, old, x, y, size);
      return;
    }
    const bx = s.x, by = s.y, bw = s.w, bh = s.h;
    let k = size / Math.max(bw, bh);
    // Cerca de un múltiplo entero (±12 %), a ese múltiplo: píxeles iguales y nítidos
    // (p. ej. una roca de 22 px en una caja de 20 sale a 22, no reducida y borrosa).
    const kr = Math.round(k);
    if (r.t !== 'vec' && kr >= 1 && Math.abs(k - kr) <= kr * 0.12) k = kr;
    const ox = Math.round(x + (size - bw * k) / 2), oy = Math.round(y + (size - bh * k) / 2);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = r.t === 'vec' || k < 1;
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, ox + (s.x - bx) * k, oy + (s.y - by) * k, s.w * k, s.h * k);
    ctx.imageSmoothingEnabled = prev;
  }

  /** Dibujo de un ataque (30×30) en la caja size×size: cerca de un múltiplo entero (±12 %), a ese múltiplo. */
  function drawArt(ctx, cv, x, y, size) {
    let k = size / 30;
    const kr = Math.round(k);
    if (kr >= 1 && Math.abs(k - kr) <= kr * 0.12) k = kr;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = k < 1;
    ctx.drawImage(cv, Math.round(x + (size - 30 * k) / 2), Math.round(y + (size - 30 * k) / 2), 30 * k, 30 * k);
    ctx.imageSmoothingEnabled = prev;
  }

  /**
   * Objeto en el mundo: el dibujo centrado en (cx, cy), a k unidades por
   * píxel del sprite (1 = la mitad de un píxel de los Pokémon). Devuelve
   * false si aún no ha cargado (el que llama pinta otra cosa).
   */
  function sprite(ctx, name, cx, cy, k = 1) {
    const r = info(name);
    if (r.t === 'move') {
      const cv = artCanvas(r.id), w = 30 * k, prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cv, Math.round(cx - w / 2), Math.round(cy - w / 2), w, w);
      ctx.imageSmoothingEnabled = prev;
      return true;
    }
    if (r.t !== 'item') return false;
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
           moveArt, ITEM, TM, UI: LEGACY, TYPE_GLYPH };
})();
