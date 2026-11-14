/* ============ rift.js — grietas y arena del legendario ============
 *
 * De vez en cuando (pocas veces por partida) se abre una GRIETA cerca de un
 * jugador. Dura GRIETA_TTL segundos; si entras, te lleva (con todo el grupo)
 * a una arena cerrada en el Mundo Distorsión, contra un Pokémon LEGENDARIO.
 * Desde el 23-10-2026, contra varios a la vez: 2 desde el minuto 10 y 3 desde
 * el 20 (uno más con 3 o 4 jugadores, sin pasar de 3). Cada uno algo menos
 * duro que si fuera solo, la arena dura más y cada uno suelta su premio; se
 * gana al vencerlos a todos.
 *
 *   ganas    cada legendario suelta monedas (2.0: ya no tickets, ver tickets.js), y cada uno se lleva un
 *            VÍNCULO (fusiona movimientos, ver Player.fuse); a los pocos
 *            segundos volvéis al mapa donde estabais y se elige la fusión
 *   pierdes  (caéis todos o se acaba el tiempo) volvéis sin premio, con algo
 *            de vida; la partida sigue
 *
 * Mientras dura la arena, los enemigos del mapa se guardan (EnemyMgr.stash) y
 * no aparecen nuevos; al volver todo sigue como estaba.
 *
 * Cooperativo: lo decide el anfitrión. Mensajes (ver coop.js):
 *   'rift' x y ttl · 'riftx' · 'arena' cfg · 'aw' (ganada) · 'al' (perdida)
 *   y del invitado al anfitrión 're' (he entrado en la grieta).
 *
 * Viaje y llegada (26-10-2026). Al entrar, tu Pokémon viaja por el túnel del
 * Mundo Distorsión (TRAVEL s, se salta tocando la pantalla o con Espacio; en grupo
 * lo salta el anfitrión para todos: 'rk'). Al llegar, el legendario tarda INTRO s en
 * aparecer, cada uno a su manera (APPEAR: Groudon sale de la lava, Kyogre de un
 * remolino, Zapdos entre rayos, Rayquaza cae del cielo, Mewtwo se materializa,
 * Giratina sale de su sombra, Dialga con su reloj, Palkia por una grieta en el
 * espacio...). El anfitrión dice dónde salen con 'lgi' y los crea al acabar.
 * Un 'arena' de antes no trae `intro`: el invitado va directo, como antes. Un
 * invitado de antes no conoce `intro`: entra directo y ve salir a los legendarios
 * unos segundos después, sin la animación.
 */
G.Rift = (() => {
  // (0.14 hasta el 11-10-2026: más grietas para que se vean los vínculos. Del 12-10-2026 al 07-11-2026, cada 30 s un 20 %
  //  que subía con cada fallo, 40 %, 60 %..., desde el minuto 4: como mucho 2,5 min sin grieta.)
  // 07-11-2026 (pedido del dueño): una grieta cada RIFT_EVERY s (minutos 5, 10, 15, 20 y 25), cada una en un momento al azar
  // de ±RIFT_JIT s alrededor de su marca (plan(), lo sortea quien manda). Con un jefe vivo espera; y si en su marca también
  // toca jefe (todas: los jefes van cada 2,5 min), espera a que ése salga y caiga (primero el jefe, lo eligió el dueño). Si
  // pasa RIFT_LATE s de su marca sin poder abrirse, se pierde. Desde 2 min antes de la Sentencia (minuto 30) ya no se abren.
  const RIFT_EVERY = 300, RIFT_JIT = 22.5, RIFT_LATE = 150, TTL = 45;
  // (29-10-2026: desde el minuto 4, no desde el 1:15: medido con tools/curve.cjs, una grieta en el minuto 2 con el nivel 10
  //  sólo quitaba 2 minutos de experiencia y ahí se caía.)
  // (2.0, casillas de 48) ARENA_R, SPOTS, SPOTS_IN y PLAYERS_IN van en baldosas de U = 32 unidades de mundo (las casillas
  //  de antes): así las distancias no cambian. La arena se manda en casillas de verdad (cfg.r = ARENA_R·U/TS, ~7,3).
  const U = 32;
  const ARENA_R = 11, ARENA_TIME = 120;
  // Cuántos legendarios según el minuto y los jugadores; vida de cada uno (respecto a
  // uno solo) y segundos de arena según cuántos son.
  const legendsFor = (t, np) => G.U.clamp((t >= 1200 ? 3 : t >= 600 ? 2 : 1) + (np >= 3 ? 1 : 0), 1, 3);
  // (2.0, bloque 3: con 2 y 3 legendarios la arena duraba lo mismo que con uno, ~40 s; ahora ~30 / 55 / 70 s, ARENA_TTK,
  //  que es también el objetivo del tope blando de daño compartido.)
  const HP_EACH = [1, 0.65, 0.95, 0.8], TIME_FOR = [ARENA_TIME, ARENA_TIME, 170, 215], ARENA_TTK = [0, 32, 55, 72];
  // Dónde salen (en baldosas desde el centro; vosotros, 3 al sur).
  const SPOTS = [[], [[0, -3.5]], [[-2.6, -3.6], [2.6, -3.6]], [[-3.4, -2.6], [0, -4.6], [3.4, -2.6]]];
  // Con la llegada (26-10-2026) salen a tus lados, donde se ven en el móvil tumbado (la vista
  // es ancha y baja: al norte, a 6 baldosas, no se veía nada). Vosotros, 1 baldosa al sur.
  // (28-10-2026: a 5,6 baldosas, no a 3,8: a 3,8 salía casi encima y te embestía nada más aparecer. Se sigue viendo
  //  en el móvil más pequeño tumbado: la vista tiene unas 12 baldosas de ancho a cada lado.)
  //  29-10-2026: el tercero, abajo a la derecha y más lejos (debajo, a 3,6, salía justo bajo ti y el jefe de verdad, casi
  //  encima; arriba lo tapaban las barras de los jefes en el móvil).
  const SPOTS_IN = [[], [[5.6, 0.6]], [[-5.6, 0.6], [5.6, 0.6]], [[-5.8, 0.6], [5.8, 0.6], [3.4, 4.0]]], PLAYERS_IN = 1;
  const EXIT_GRACE = 2.5, EXIT_R = 140;     // al volver: segundos de gracia y hueco sin enemigos
  // Viaje por el túnel (s), cuándo se llega de verdad a la arena (tapado por el túnel) y lo que tarda el legendario.
  const TRAVEL = 2.0, T_PORT = 0.45, INTRO = 2.0;
  let travel = null;        // { t, cfg, ported, canSkip, mons: [Animator] }
  let pendingLgi = null;    // 'lgi' llegado antes que startIntro (bloque 3)
  let intro = null;         // { t, list: [{ dex, x, y, st, col, col2, an, sc, seed, at, cue }], done }
  let rift = null;          // { x, y, ttl, t }
  let arena = null;         // { tx, ty, r, dex, dexes, shiny, shinies, time, x, y, back, biome, t, phase, endT, bossIds }
  let zone = null;          // dónde estaba la última arena { x, y, r } (ver leftBehind)
  let asked = false, downT = 0;
  let sched = [], schedI = 0, retryT = 0;   // calendario de grietas de esta partida: [{ mark, at }] (sólo cuenta el de quien manda)
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const TS = () => G.World.TS;

  function reset() { rift = null; arena = null; zone = null; asked = false; downT = 0; travel = null; intro = null; pendingLgi = null; sched = plan(); schedI = 0; retryT = 0; }

  /** Calendario de grietas de una partida: una por marca de RIFT_EVERY s, ±RIFT_JIT s, hasta 2 min antes de la Sentencia. */
  function plan(end = (G.Judgment && G.Judgment.AT || 1800) - 120) {
    const out = [];
    for (let m = RIFT_EVERY; m + RIFT_JIT < end; m += RIFT_EVERY)
      out.push({ mark: m, at: Math.round((m + (Math.random() * 2 - 1) * RIFT_JIT) * 10) / 10 });
    return out;
  }

  /** ¿Puede abrirse ya la siguiente grieta del calendario? (lo mira quien manda) */
  function due(time) {
    while (sched[schedI] && time > sched[schedI].mark + RIFT_LATE) schedI++;   // se pasó su hueco (p. ej. con un jefe que no caía)
    const s = sched[schedI];
    if (!s || time < s.at) return false;
    if (G.EnemyMgr.bossAlive()) return false;                                  // con un jefe vivo, espera
    if (G.Spawner.bossDue && G.Spawner.bossDue(s.mark)) return false;          // primero el jefe de su misma marca
    return true;
  }

  /**
   * ¿Sigue este jugador en la arena aunque aquí ya se haya vuelto al mapa?
   * En grupo, el anfitrión vuelve unas décimas antes que los invitados (el aviso
   * tarda en llegar) y en ese rato los ve aún allí: el jefe que esperaba salía a su
   * lado, a miles de metros, y ya no se le encontraba (ni salían más grietas).
   */
  function leftBehind(p) {
    return !arena && !!zone && G.U.dist2(p.x, p.y, zone.x, zone.y) < zone.r * zone.r;
  }

  // ---------------- grieta en el mapa ----------------

  function update(dt, pl, time) {
    if (rift) {
      rift.t += dt;
      rift.ttl -= dt;
      if (rift.ttl <= 0) { rift = null; return; }
      if (!arena && !pl.dead && G.U.dist2(pl.x, pl.y, rift.x, rift.y - 10) < 30 * 30) enter();
    } else if (!arena && authority() && time < G.Judgment.AT - 120) {
      if (retryT > 0) retryT -= dt;
      // Si no hay sitio libre para la grieta, se vuelve a probar a los 5 s.
      else if (due(time)) { if (open(sched[schedI].mark)) schedI++; else retryT = 5; }
    }
    if (arena) arenaTick(dt, pl);
  }

  /** @param mark  la marca del calendario (s): la fuerza de la arena va con ella, no con cuándo se abre (11-11-2026). */
  function open(mark = null) {
    const alive = G.Game.everyone().filter(p => !p.dead);
    const near = G.U.pick(alive.length ? alive : [G.Game.player]);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.2832, d = G.U.rand(380, 560);
      const x = near.x + Math.cos(a) * d, y = near.y + Math.sin(a) * d * 0.85;
      if (!G.World.isFree(x, y, 22)) continue;
      show(x, y, TTL);
      rift.mark = mark;
      if (G.Coop.isHost) G.Coop.broadcast(['rift', Math.round(x), Math.round(y), TTL]);
      return true;
    }
    return false;
  }

  /** Aparece la grieta (también la que manda el anfitrión). */
  function show(x, y, ttl) {
    rift = { x, y, ttl, t: 0 };
    asked = false;
    // (El aviso grande lo dibuja hud.js mientras rift.t < 4,5 s.)
    G.Audio.sfx('rift');
    G.FX.ring(x, y, 6, 80, '#b48aff', 0.7, 5);
  }

  function enter() {
    if (asked) return;
    asked = true;
    if (authority()) start();
    else G.Coop.toHost(['re']);
  }

  // ---------------- arena ----------------

  /** Quien manda: elige legendario y lugar, y avisa a todos. */
  let nextType = null;          // pruebas/vídeos: tipo de la próxima arena
  let nextN = 0;                // pruebas: cuántos legendarios en la próxima arena

  /** Legendario al azar de `pool` (los que aún no has vencido salen 4 veces más: menos repetidos). */
  function pickLegend(pool) {
    const beaten = (G.DB.save && G.DB.save.legends) || {};
    const ws = pool.map(p => (beaten[p.dex] ? 1 : 4));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0), mi = 0;
    while (mi < pool.length - 1 && (r -= ws[mi]) > 0) mi++;
    return pool[mi];
  }

  /** ¿Sus golpes (su primer tipo, e.atkType) os hacen más daño por tipo a alguno de vosotros? */
  function beatsUs(p) {
    return G.Game.everyone().some(pl => pl && pl.mon && pl.mon.types && G.Types.mult(p.types[0], pl.mon.types) > 1.05);
  }

  function start(forceType, forceN, forceDex = 0) {
    if (arena || travel) return;
    forceType = forceType || nextType; nextType = null;
    forceN = forceN || nextN; nextN = 0;
    const all = G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]);
    let pool = all;
    if (forceType && pool.some(p => p.types.includes(forceType))) pool = pool.filter(p => p.types.includes(forceType));
    const mon = (forceDex && all.find(p => p.dex === forceDex)) || pickLegend(pool);
    // La arena es la de uno de sus tipos, al azar.
    const type = forceType || G.U.pick(mon.types);
    /*
     * (11-11-2026, el dueño: «las grietas unas veces son muy difíciles y otras muy fáciles».) Cuántos legendarios y lo
     * fuertes que son van con la MARCA del calendario (minuto 5, 10, 15...), no con cuándo se abre la grieta: se abre
     * ±22,5 s alrededor y espera al jefe de su marca, así que la del 20 salía entre el 20:12 y el 22:30 (medido) y el
     * tiempo efectivo de los enemigos (vida y daño) sube un 37 % en esos 2 minutos. Sin grieta del calendario (pruebas), el reloj.
     */
    const tm = rift && rift.mark > 0 ? rift.mark : G.Game.st.time;
    // Los demás, si puede, del tipo de la arena (y nunca repetidos). (11-11-2026) Pero como mucho uno cuyo tipo os gane:
    //  medido, tres de Agua contra un Charizard eran la grieta más dura con diferencia (ver G.Types.legK).
    const n = G.U.clamp(forceN || legendsFor(tm, G.Game.everyone().length), 1, 3);
    const mons = [mon];
    while (mons.length < n) {
      const rest = all.filter(p => !mons.includes(p));
      if (!rest.length) break;
      const same = rest.filter(p => p.types.includes(type)), strong = mons.some(beatsUs);
      const fair = a => a.filter(p => !beatsUs(p));
      mons.push(pickLegend([strong ? fair(same) : same, strong ? fair(rest) : [], same, rest].find(a => a.length)));
    }
    const shinies = mons.map(p => G.Sprites.hasShiny(p.dex) && Math.random() < 1 / 512);
    const cfg = {
      tx: 5000 + Math.floor(Math.random() * 3000), ty: 5000 + Math.floor(Math.random() * 3000), r: ARENA_R * U / TS(),
      // (dex y shiny: el primero, para los invitados de antes del 23-10-2026.)
      dex: mon.dex, shiny: shinies[0], type,
      dexes: mons.map(p => p.dex), shinies, time: TIME_FOR[mons.length], tm,
      // (26-10-2026) Viaje por el túnel y llegada del legendario: los invitados de antes no lo leen.
      intro: INTRO
    };
    if (G.Coop.isHost) G.Coop.broadcast(['arena', cfg]);
    begin(cfg);
  }

  /** En cada ordenador: el viaje por la grieta (o, si el anfitrión es de antes, directo a la arena). */
  function begin(cfg) {
    if (arena || travel) return;
    if (!(cfg.intro > 0)) { port(cfg); return; }
    const pl = G.Game.player;
    // Lo que ve en el túnel: tu Pokémon y, en grupo, los demás detrás.
    const who = [pl, ...G.Game.everyone().filter(p => p !== pl && !p.dead)].slice(0, 4);
    travel = { t: 0, cfg, ported: false, canSkip: authority(),
               mons: who.map(p => { const a = new G.Sprites.Animator(p.form || p.dex, 1, !!p.shiny); a.dir = 0; return a; }) };
    G.Sprites.preload(Array.isArray(cfg.dexes) ? cfg.dexes.filter(d => G.DEX_BY[d]).slice(0, 3) : [cfg.dex], 8000);
    // (Rendimiento, 13-11-2026) Y las imágenes del mapa de la arena: así ya están al llegar (a los 0,45 s) y no se pinta dos veces.
    if (G.Tileset && G.Tiles.arenaBiome) G.Tileset.preload([G.Tiles.arenaBiome(cfg.type)]);
    G.Touch.reset();
    G.Audio.sfx('rift');
  }

  /** Durante el viaje (lo llama la Sentencia, que es quien lleva las animaciones: ver judgment.js). */
  function travelTick(dt) {
    if (!travel) return;
    const t0 = travel.t;
    travel.t += dt;
    for (const a of travel.mons) a.loop('Walk', 1.6), a.update(dt);
    if (t0 < T_PORT && travel.t >= T_PORT && !travel.ported) { travel.ported = true; port(travel.cfg, true); }
    if (travel.t >= TRAVEL) endTravel();
  }

  /** Salta el viaje (tecla o toque; en grupo, el anfitrión para todos). */
  function skipTravel() {
    if (!travel || !travel.canSkip || travel.t < 0.3) return;
    if (G.Coop.isHost) G.Coop.broadcast(['rk']);
    doSkip();
  }
  function doSkip() {
    if (!travel) return;
    if (!travel.ported) { travel.ported = true; port(travel.cfg, true); }
    endTravel();
  }

  function endTravel() {
    travel = null;
    if (!arena) return;
    G.Game.flash('#efe4ff', 0.5);
    startIntro();
  }

  /** En cada ordenador: llegada a la arena (el destello lo tapa). */
  function port(cfg, quiet = false) {
    const pl = G.Game.player;
    const ts = TS();
    // (Lo que manda el anfitrión, con sus límites; uno de antes no manda dexes ni time.)
    const dexes = Array.isArray(cfg.dexes) ? cfg.dexes.filter(d => G.DEX_BY[d]).slice(0, 3) : [];
    const time = typeof cfg.time === 'number' && cfg.time >= 30 && cfg.time <= 400 ? cfg.time : ARENA_TIME;
    arena = Object.assign({}, cfg, {
      x: cfg.tx * ts + ts / 2, y: cfg.ty * ts + ts / 2, dexes: dexes.length ? dexes : [cfg.dex], time,
      back: { x: pl.x, y: pl.y }, biome: G.World.biome, t: 0, phase: 'fight', endT: 0, bossIds: []
    });
    zone = { x: arena.x, y: arena.y, r: cfg.r * ts + 10 * U };
    rift = null; asked = false; downT = 0;
    if (authority()) G.EnemyMgr.stash(); else G.EnemyMgr.clearRemote();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    G.World.setArena({ tx: cfg.tx, ty: cfg.ty, r: cfg.r, type: cfg.type });
    G.World.setBiome(G.Tiles.arenaBiome(cfg.type), true);
    // Cada arena trae su clima (el volcán, sol; el glaciar, nieve...).
    const th = G.Tiles.ARENA_THEMES[cfg.type];
    if (th && th.weather) G.Weather.force(th.weather, time + 15);
    // Todos al sur de la arena, en fila; el legendario aparece al norte.
    const ps = G.Game.everyone();
    // Quien manda apunta de dónde sale cada uno para hacerle hueco al volver: cada
    // invitado vuelve a donde estaba él, no adonde el anfitrión (ver clearExit).
    if (authority()) arena.backs = ps.map(p => ({ x: p.x, y: p.y }));
    const py = cfg.intro > 0 ? PLAYERS_IN : 3;
    ps.forEach((p, i) => { p.x = arena.x + (i - (ps.length - 1) / 2) * 34; p.y = arena.y + U * py; });
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    if (!quiet) { G.Game.flash('#c9a6ff', 0.9); G.Audio.sfx('rift'); }
    G.Spawner.say('Has entrado en la grieta…', 2.4, true);
    // Con viaje, los legendarios llegan después (startIntro); el anfitrión de antes los crea él.
    if (cfg.intro > 0) arena.phase = 'intro';
    else if (authority()) spawnLegends();
  }

  // ---------------- llegada del legendario (26-10-2026) ----------------

  /*
   * Cómo aparece cada legendario (28-10-2026: cada uno distinto). [estilo, toque]:
   *   estilo (G.BossFX.appear): erupt (sale de la lava), quake (parte el suelo), whirl (de un
   *     remolino), lake (de un lago en calma), bolt (entre rayos), storm (baja de una nube negra),
   *     dive (cae del cielo), coil (baja en espiral), warp (se materializa), shadow (sale de su
   *     sombra), crystal (cristales que se rompen), bloom (pétalos), shell (su caparazón se abre),
   *     braille (los puntos de los Regi), clock (Dialga), space (Palkia), portal (Hoopa),
   *     genesis (Arceus), cells (Zygarde), meteor (Deoxys), wish (Jirachi), bubble, prism, eternal.
   *   toque (G.BossFX.accent): copos, lluvia, plumas, hojas, pétalos, brasas, magma, burbujas,
   *     fuegos fatuos, corazones, notas, aura, humo, niebla, estrellas, lunas, engranajes,
   *     espadas, arena, hexágonos, tablas, runas, esquirlas, hielo, chispas, rayos, viento, sol,
   *     aurora, arcoíris, ADN, ojos, cadenas, la V de Victini...
   * No hay dos iguales (lo comprueba tests/jefes.test.cjs). Los que no están, según su tipo.
   */
  const APPEAR = {
    144: 'dive snow', 145: 'bolt sparks', 146: 'dive embers', 150: 'warp aura', 151: 'bubble dna', 243: 'bolt rain', 244: 'erupt smoke',
    245: 'whirl aurora', 249: 'dive feathers', 250: 'dive rainbow', 251: 'bloom leaves', 377: 'braille shards', 378: 'braille ice',
    379: 'braille gears', 380: 'warp fog', 381: 'dive wind', 382: 'whirl rain', 383: 'erupt sun', 384: 'coil wind', 385: 'wish stars',
    386: 'meteor aura', 480: 'lake runes', 481: 'lake hearts', 482: 'lake sparks', 483: 'clock aura', 484: 'space stars', 485: 'erupt magma',
    486: 'braille runes', 487: 'shadow smoke', 488: 'warp moons', 489: 'bubble rain', 490: 'bubble hearts', 491: 'shadow eyes',
    492: 'bloom petals', 493: 'genesis plates', 494: 'erupt vee', 638: 'crystal swords', 639: 'quake swords', 640: 'bloom swords',
    641: 'storm wind', 642: 'storm bolts', 643: 'dive bluefire', 644: 'bolt smoke', 645: 'storm sand', 646: 'crystal ice', 647: 'whirl swords',
    648: 'warp notes', 649: 'crystal gears', 716: 'bloom rainbow', 717: 'shadow feathers', 718: 'cells hex', 719: 'crystal stars',
    720: 'portal sparks', 721: 'erupt fog', 772: 'crystal chains', 773: 'crystal rainbow', 785: 'shell sparks', 786: 'shell petals',
    787: 'shell leaves', 788: 'shell fog', 789: 'bubble stars', 790: 'genesis stars', 791: 'dive sun', 792: 'shadow moons',
    800: 'prism shards', 801: 'bloom gears', 802: 'shadow wisps', 807: 'bolt wind', 808: 'cells gears', 809: 'erupt gears',
    888: 'dive swords', 889: 'crystal hex', 890: 'eternal smoke', 891: 'quake aura', 892: 'quake wind', 894: 'braille bolts',
    895: 'braille wisps', 896: 'quake ice', 897: 'shadow fog', 898: 'warp leaves', 905: 'storm hearts', 1004: 'erupt runes',
    1007: 'quake sun', 1015: 'shadow toxic', 1016: 'bloom hearts', 1017: 'quake leaves', 1024: 'prism hex', 1025: 'bubble toxic'
  };
  const APPEAR_TYPE = { fire: 'erupt embers', ground: 'quake sand', water: 'whirl bubbles', electric: 'bolt sparks', flying: 'dive feathers', dragon: 'coil wisps',
                        fighting: 'quake aura', normal: 'dive stars', psychic: 'warp aura', fairy: 'warp petals', ghost: 'shadow wisps', dark: 'shadow smoke',
                        poison: 'shadow toxic', ice: 'crystal ice', rock: 'crystal shards', steel: 'crystal gears', grass: 'bloom leaves', bug: 'bloom leaves' };
  /** [estilo, toque] de un legendario. */
  function appearOf(dex) { const m = G.DEX_BY[dex]; return (APPEAR[dex] || (m && APPEAR_TYPE[m.types[0]]) || 'warp aura').split(' '); }

  /** Al llegar: dónde sale cada legendario y su animación (quien manda, también 'lgi' a los demás). */
  function startIntro() {
    const ts = U, k = arena.dexes.length, placed = [];
    // (2.0, bloque 3) Quien manda los pone al azar (pickSpots); los demás, en SPOTS_IN hasta que llegue 'lgi'.
    const spots = (authority() && pickSpots(k)) || SPOTS_IN[k] || SPOTS_IN[1];
    const list = arena.dexes.map((dex, i) => {
      const [sx, sy] = spots[i] || [0, -3.5], sc = G.Enemy.bossScaleOf ? G.Enemy.bossScaleOf(dex) : 1.5;
      const o = { x: arena.x + sx * ts, y: arena.y + sy * ts, r: G.Sprites.bodyRadius(dex, sc) };
      if (authority()) { placeIntro(o, placed); placed.push(o); }
      const m = G.DEX_BY[dex], [st, acc] = appearOf(dex);
      let col = G.U.TYPE_COLOR[m.types[0]] || '#c9a6ff', col2 = G.U.TYPE_COLOR[m.types[1] || m.types[0]] || '#ffffff';
      // (Sale de la lava aunque no sea de Fuego: Groudon.)
      if (st === 'erupt' && m.types[0] !== 'fire' && m.types[0] !== 'steel') { col = '#ff6a1f'; col2 = '#ffd25e'; }
      const an = new G.Sprites.Animator(dex, sc, !!(arena.shinies || [])[i]);
      an.dir = 0;
      return { dex, x: o.x, y: o.y, st, acc, col, col2: st === 'erupt' ? '#ffd25e' : col2 === col ? '#ffffff' : col2, an, sc, seed: dex * 7 + i, at: i * 0.25, cue: false };
    });
    intro = { t: 0, list };
    // (Un 'lgi' que llegó antes que esto: se aplica ahora; antes se perdía.)
    if (pendingLgi) { introAt(pendingLgi); pendingLgi = null; }
    arena.phase = 'intro';
    if (authority() && G.Coop.isHost) G.Coop.broadcast(['lgi', list.map(l => [l.dex, Math.round(l.x), Math.round(l.y)])]);
    G.Audio.sfx('rift');
  }

  /** Como place(), pero también lejos de vosotros (que no os aparezca encima). */
  function placeIntro(o, others) {
    const x0 = o.x, y0 = o.y, r = Math.min(o.r, 26), ps = G.Game.everyone();
    const ok = (x, y) => G.World.isFree(x, y, r) && others.every(q => G.U.dist2(x, y, q.x, q.y) > (q.r + o.r + 8) ** 2) &&
                         ps.every(p => G.U.dist2(x, y, p.x, p.y) > (o.r + 110) ** 2);
    for (let d = 0; d <= 112; d += 16) {
      for (let j = 0, m = d ? 10 : 1; j < m; j++) {
        const a = j / m * 6.2832, x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d * 0.8;
        if (ok(x, y)) { o.x = x; o.y = y; return; }
      }
    }
    place(o, others);
  }

  /*
   * (2.0, bloque 3) Sitios al azar para k legendarios (en baldosas desde vuestro punto de llegada): 12 ángulos y radios de
   * 4,5, 5,5 y 6,5; dentro de la arena (ARENA_R − 2), libres, lejos de vosotros y entre sí (2,5 baldosas) y dentro de la
   * franja que se ve en el móvil tumbado y en Ultra (3,5 hacia arriba, 4 hacia abajo). null si no caben todos.
   */
  function pickSpots(k, rnd = Math.random) {
    const ts = U, py = PLAYERS_IN, ps = G.Game.everyone(), cand = [];
    for (let j = 0; j < 12; j++) for (const d of [4.5, 5.5, 6.5]) {
      const a = (j + rnd() * 0.6 - 0.3) / 12 * 6.2832, sx = Math.cos(a) * d, sy = py + Math.sin(a) * d;
      if (Math.hypot(sx, sy) > ARENA_R - 2 || sy - py < -3.5 || sy - py > 4) continue;
      const x = arena.x + sx * ts, y = arena.y + sy * ts;
      if (!G.World.isFree(x, y, 26) || !ps.every(p => G.U.dist2(x, y, p.x, p.y) > (26 + 110) ** 2)) continue;
      cand.push([sx, sy]);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    const out = [];
    for (const c of cand) {
      if (out.every(o => Math.hypot(o[0] - c[0], o[1] - c[1]) > 2.5)) out.push(c);
      if (out.length === k) return out;
    }
    return null;
  }

  /** Invitado: dónde salen de verdad (lo dice el anfitrión). */
  function introAt(a) {
    if (!Array.isArray(a)) return;
    if (!intro) { pendingLgi = a; return; }
    for (const p of a) {
      if (!Array.isArray(p)) continue;
      const l = intro.list.find(q => q.dex === p[0]);
      if (l && Number.isFinite(p[1]) && Number.isFinite(p[2])) { l.x = p[1]; l.y = p[2]; }
    }
  }

  function introTick(dt) {
    intro.t += dt;
    for (const l of intro.list) {
      const k = (intro.t - l.at) / INTRO;
      l.an.update(dt);
      l.an.loop(k > 0.7 ? 'Idle' : 'Walk');
      // Golpe al aparecer: temblor y sonido (una vez).
      if (!l.cue && k >= 0.8) { l.cue = true; G.Camera.kick(0.6); G.FX.ring(l.x, l.y, 8, 120, l.col, 0.5, 5); G.FX.burst(l.x, l.y - 20, l.col2, 18, 200); G.Audio.sfx('land'); }
    }
    if (intro.t >= INTRO + (intro.list.length - 1) * 0.25) {
      if (authority()) spawnLegends(intro.list);
      arena.phase = 'fight';
      intro.done = true;
    }
  }

  /** Lo que se ve mientras aparecen (ordenado por Y con lo demás). */
  function drawIntro(ctx) {
    if (!intro) return;
    const now = performance.now() / 1000;
    for (const l of intro.list) {
      // (Cuando ya está el de verdad, el suyo; en el invitado puede tardar un poco en llegar. Y si el invitado
      //  llega tarde, porque tenía las cartas abiertas, el de verdad ya está: no se dibuja otro encima.)
      if (G.EnemyMgr.bosses().some(e => e.dex === l.dex) || (intro.done && intro.t > INTRO + 2.5)) continue;
      const k = G.U.clamp((intro.t - l.at) / INTRO, 0, 1);
      G.BossFX.appear(ctx, l.st, l.x, l.y, k, l.col, l.col2, now, l.seed, true);
      const s = G.BossFX.appearSprite(l.st, k);
      if (s.a > 0) {
        ctx.save();
        if (s.rise > 0) {
          // Sale del suelo: sólo lo que ya asoma por encima.
          const h = G.Sprites.bodyHeight(l.dex, l.sc) + 10;
          ctx.beginPath(); ctx.rect(l.x - 200, l.y - 400, 400, 400); ctx.clip();
          l.an.draw(ctx, l.x, l.y + h * s.rise, { alpha: s.a, flash: s.flash });
        } else {
          if (s.lift < 30) G.Sprites.drawShadow(ctx, l.dex, l.x, l.y, l.sc);
          l.an.draw(ctx, l.x + (s.ox || 0), l.y - s.lift, { alpha: s.a, flash: s.flash || (s.dark > 0.5) });
          if (s.scan && s.a < 1) {
            ctx.globalAlpha = (1 - s.a) * 0.7; ctx.fillStyle = l.col;
            const h = G.Sprites.bodyHeight(l.dex, l.sc);
            for (let y = 0; y < h; y += 4) ctx.fillRect(Math.round(l.x - 22), Math.round(l.y - y - s.lift), 44, 1);
          }
        }
        ctx.restore();
      }
      G.BossFX.appear(ctx, l.st, l.x, l.y, k, l.col, l.col2, now, l.seed, false);
      if (G.BossFX.accent) G.BossFX.accent(ctx, l.acc, l.x, l.y, k, l.col, l.col2, now, l.seed);
    }
  }

  // ---------------- viaje: dibujo (en pantalla, encima de todo) ----------------

  function drawTravel(ctx, w, h) {
    if (!travel) return;
    G.Touch.clearButtons();             // (el HUD no se dibuja mientras dura)
    const pl = G.Game.player, cam = G.Camera;
    const ps = pl ? cam.toScreen(pl.x, pl.y - pl.bodyH * 0.5) : null, cx = ps ? ps.x : w / 2, cy = ps ? ps.y : h / 2;
    const r = G.BossFX.tunnel(ctx, w, h, travel.t, TRAVEL, cx, cy);
    // Tu Pokémon (y los demás) cruzando el túnel, con estela.
    const sc = Math.max(1, Math.round(Math.min(w, h) / 430 * 1.5 * 2) / 2), bob = Math.sin(travel.t * 9) * 4;
    // (28-10-2026) Se da la vuelta y se adentra en el túnel (de espaldas), balanceándose, y se hace
    // pequeño al final, cuando llega a la otra punta.
    const deep = 1 - 0.3 * G.U.clamp((travel.t - TRAVEL * 0.6) / (TRAVEL * 0.3), 0, 1);
    ctx.save();
    ctx.globalAlpha = r.alpha;
    travel.mons.forEach((a, i) => {
      a.scale = (i ? sc * 0.7 : sc) * deep;
      a.dir = travel.t < 0.35 ? 0 : 4;
      const off = i ? [[-70, 26], [70, 26], [0, 48]][i - 1] : [0, 0], sway = Math.sin(travel.t * 3.1 + i * 1.7) * 16 * r.open;
      const x = r.x + off[0] * r.open + sway, y = r.y + 30 + off[1] * r.open + bob * (i % 2 ? -1 : 1);
      for (let k = 3; k >= 1; k--) { ctx.globalAlpha = r.alpha * 0.12 * (4 - k) * r.open; a.draw(ctx, x, y + k * 9, { flash: true }); }
      ctx.globalAlpha = r.alpha;
      a.draw(ctx, x, y);
    });
    ctx.restore();
    if (travel.canSkip && travel.t > 0.3 && travel.t < TRAVEL - 0.3) {
      // (29-10-2026) En una chapa oscura, como los avisos del HUD, y casi opaco: en lila sobre los anillos del
      // túnel, a 12 px y medio transparente, apenas se leía.
      const sa = G.Touch.safeArea(), s = G.T(G.Touch.active ? 'Toca la pantalla para saltar' : 'Pulsa Espacio para saltar');
      ctx.save();
      ctx.font = G.HUD.N(800, 13);
      const tw = Math.min(ctx.measureText(s).width, w - 60), ph = 24, pw = tw + 22;
      const x1 = w - 12 - sa.right, y0 = h - 12 - Math.min(28, sa.bottom) - ph;
      ctx.globalAlpha = 0.85 + Math.sin(travel.t * 4) * 0.1;
      ctx.fillStyle = 'rgba(14,10,34,.82)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x1 - pw, y0, pw, ph, ph / 2) : ctx.rect(x1 - pw, y0, pw, ph); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(201,166,255,.75)'; ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(s, x1 - 11, y0 + ph / 2 + 1, w - 60);
      ctx.restore();
      // Toda la pantalla es un botón (móvil y ratón).
      G.Touch.addButton(0, 0, w, h, skipTravel, 0);
    }
  }

  // (02-11-2026) Los legendarios pegan mucho más (pedido del dueño): un golpe suyo ~45 de lo que ves con las mejoras compradas
  //  (antes 13-15) y su firma ~85 (SIG_LEG, enemy.js). Daño de un golpe, igual toda la partida: lo que ves sube solo con los
  //  minutos (al principio, youngK y menos nivel). Medido con tools/curve.cjs: ver
  //  docs/2.0-ESTADO.md. (Tarde del 02-11-2026: algo menos, 70 → 39; golpe ~26 y firma ~68 con tipo neutro.)
  const LEG_HIT = 39;

  /** @param at  dónde sale cada uno (la llegada: startIntro); si no, en su sitio de SPOTS. */
  function spawnLegends(at = null) {
    // (Su fuerza va con el tiempo «efectivo» de los enemigos, 26-10-2026: ver G.Enemies.eff. Desde el 11-11-2026, el de la
    //  marca del calendario, arena.tm: ver start.)
    const now = arena.tm > 0 ? arena.tm : G.Game.st.time;
    const t = G.Enemies.eff ? G.Enemies.eff(now) : now;
    // (28-10-2026) Una grieta en los primeros minutos no puede ser un muro: hasta el minuto 3, un 45 % menos de vida y
    //  de daño (y llega a lo normal en el 10). Medido: un Delibird sin mejoras caía diez veces en una grieta del minuto 3.
    const soft = 0.55 + 0.45 * Math.min(1, Math.max(0, (now - 180) / 420));
    // (02-11-2026) El daño, menos rebajado al principio: un 15 % menos hasta el minuto 3.
    const hitSoft = 0.85 + 0.15 * Math.min(1, Math.max(0, (now - 180) / 420));
    const n = G.Coop.scale(G.Game.everyone().length);     // (cooperativo: vida y daño ×n, 01-11-2026)
    const ts = U;
    const k = arena.dexes.length, spots = SPOTS[k] || SPOTS[1];
    const placed = [];
    arena.dexes.forEach((dex, i) => {
      const mon = G.DEX_BY[dex];
      const def = {
        dex: mon.dex, name: mon.name,
        // (2.0) Mínimo más alto (4000 + 22·eff; antes 3200 + 9·eff, menos que un enemigo normal en el minuto 20) y, encima,
        //  según tu DPS medido (G.Enemies.bossHp). En grupo, ×n sobre lo de solitario (bossHp cuenta el DPS de cada uno;
        //  antes el mínimo ×(1+0,3·(n-1))×1,4).
        hp: Math.round((G.Enemies.bossHp ? G.Enemies.bossHp((4000 + t * 22) * soft, now, 'leg', n)
                                         : (3200 + t * 9) * soft * n) * HP_EACH[k]),
        spd: Math.round(G.U.clamp(48 + (mon.spd - 78) * 0.6, 48, 105)),
        // (02-11-2026) Daño igual toda la partida (antes 36 + t/20 hasta 40 + t/10: 7-16 en las grietas de los minutos
        //  5-9 y hasta 121 en el 18, con ~200 de vida) y los disparos como un golpe (antes la mitad). Ver LEG_HIT.
        dmg: Math.round(LEG_HIT * hitSoft),
        xp: Math.round(500 + t * 1.2),
        behavior: mon.types.some(x => ['psychic', 'electric', 'ghost', 'fairy', 'fire', 'water', 'ice', 'dragon'].includes(x)) ? 'ranged' : 'charger',
        shotDmg: Math.round(LEG_HIT * hitSoft), shotCd: 0.9, range: 300
      };
      const [sx, sy] = spots[i] || [0, -3.5];
      const e = new G.Enemy(def, arena.x + sx * ts, arena.y + sy * ts, { hp: 1, spd: 1, dmg: 1 }, true);
      e.legend = true;
      // (2.0, bloque 2) Su daño, con el director; su vida no (va aparte, bloque 3). Y ×n en cooperativo.
      if (G.Director) e.dmg *= G.Director.dmg();
      e.dmg *= n; e.coopN = n;
      // Choca con las paredes y columnas como tú: si volara por encima de las
      // rocas, tus disparos no podrían alcanzarle (bug de Celebi).
      e.flying = false;
      // (2.0, bloque 4) Campo «lava» (su arena no le frena ni le quema) y siempre el de los grandes (enemy-ai.js).
      e.mv = 'lava'; e.aiBig = true;
      const p = at && at.find(l => l.dex === dex);
      if (p) { e.x = p.x; e.y = p.y; } else place(e, placed);
      if ((arena.shinies || [arena.shiny])[i]) e.makeShiny();
      // Que no ataquen todos a la vez nada más empezar (y la firma, uno tras otro: legI).
      e.legI = i;
      e.bossInit(); e.ai.cd = 1.6 + i * 1.1;
      G.EnemyMgr.add(e);
      arena.bossIds.push(e.id);
      placed.push(e);
    });
    // (2.0, bloque 3) Fases al 66 % y al 33 % y un tope blando de daño compartido por toda la arena.
    if (placed[0] && placed[0].armBoss) {
      const sum = placed.reduce((a, e) => a + e.maxHp, 0), T = ARENA_TTK[k] || ARENA_TTK[1];
      const cap = { rate: sum / (0.6 * T), max: sum * 0.1, pool: sum * 0.1, by: null };
      for (const e of placed) e.armBoss({ phases: [0.66, 0.33], ttk: T, cap });
    }
    const nm = e => e.name + (e.shiny ? ' shiny' : '');
    if (placed.length === 3) G.Spawner.say('¡' + nm(placed[0]) + ', ' + nm(placed[1]) + ' y ' + nm(placed[2]) + ' te esperaban en la grieta!', 3.6);
    else if (placed.length === 2) G.Spawner.say('¡' + nm(placed[0]) + ' y ' + nm(placed[1]) + ' te esperaban en la grieta!', 3.4);
    else G.Spawner.say('¡' + nm(placed[0]) + ' te esperaba en la grieta!', 3.2);
    G.Camera.kick(1.1);
    G.Audio.sfx('boss');
  }

  /** Lo más cerca de su sitio donde quepa: sin columnas, charcos ni otro legendario encima. */
  function place(e, others) {
    const x0 = e.x, y0 = e.y, r = Math.min(e.r, 26);
    const ok = (x, y) => G.World.isFree(x, y, r) && others.every(o => G.U.dist2(x, y, o.x, o.y) > (o.r + e.r + 8) ** 2);
    for (let d = 0; d <= 96; d += 16) {
      for (let j = 0, m = d ? 10 : 1; j < m; j++) {
        const a = j / m * 6.2832, x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d * 0.8;
        if (ok(x, y)) { e.x = x; e.y = y; return; }
      }
    }
    // (Si no hay sitio, al pasillo del centro, que siempre está libre.)
    e.x = arena.x; e.y = arena.y - U * (2 + others.length * 1.6);
  }

  /** Nadie sale del círculo de la arena (por si algo empuja demasiado). */
  function keepInside() {
    const max = arena.r * TS() - 1.4 * U;
    for (const e of G.EnemyMgr.all()) {
      if (e.remote) continue;
      const dx = e.x - arena.x, dy = e.y - arena.y, d = Math.hypot(dx, dy);
      if (d > max) { e.x = arena.x + dx / d * max; e.y = arena.y + dy / d * max; }
    }
  }

  function arenaTick(dt, pl) {
    // Llegada del legendario: el reloj de la arena aún no corre.
    if (arena.phase === 'intro') { if (intro) introTick(dt); else arena.phase = 'fight'; return; }
    arena.t += dt;
    if (arena.phase === 'fight') {
      if (!authority()) return;
      keepInside();
      const left = arena.bossIds.some(id => { const b = G.EnemyMgr.get(id); return b && !b.dead; });
      if (!left) { G.Coop.isHost && G.Coop.broadcast(['aw']); won(); return; }
      const allDown = G.Game.everyone().every(p => p.dead);
      downT = allDown ? downT + dt : 0;
      if (downT > 1.4 || arena.t > arena.time) { G.Coop.isHost && G.Coop.broadcast(['al']); lost(); }
      return;
    }
    arena.endT -= dt;
    if (arena.endT <= 0) finish();
  }

  function won() {
    if (!arena || arena.phase !== 'fight') return;
    arena.phase = 'won'; arena.endT = 5;
    G.Progress.event('rift', { type: arena.type });
    G.Pickups.pullAll();
    G.Spawner.say(arena.dexes.length > 1 ? '¡Has vencido a los legendarios! Recoge el premio…'
                                         : '¡Has vencido a ' + G.DEX_BY[arena.dex].name + '! Recoge el premio…', 3.4, true);
    G.Audio.sfx('legend');
    const pl = G.Game.player;
    if (pl) {
      pl.bonds++;
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, '¡Vínculo!', '#ff8ad8', true);
      G.FX.ring(pl.x, pl.y, 8, 90, '#ff8ad8', 0.7, 5);
    }
  }

  function lost() {
    if (!arena || arena.phase !== 'fight') return;
    arena.phase = 'lost'; arena.endT = 1.2;
    G.Spawner.say('La grieta os ha expulsado…', 2.6, true);
    G.Audio.sfx('back');
  }

  /** En cada ordenador: vuelta al mapa. */
  function finish() {
    const pl = G.Game.player;
    const a = arena;
    arena = null; intro = null;
    G.World.setBiome(a.biome, true);
    G.Weather.clear();
    // Invitado: no se borra nada. El anfitrión avisa de los de la arena que se
    // van y de los del mapa que vuelven; si el invitado terminaba su cuenta
    // atrás un poco más tarde (pasa casi siempre), borraba los que acababan de
    // volver y no se veían hasta que caían (sólo sus ataques).
    if (authority()) { G.EnemyMgr.restore(); for (const b of a.backs || [a.back]) clearExit(b.x, b.y); }
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.Hazards.clear();
    for (const p of G.Game.everyone()) { p.x = a.back.x; p.y = a.back.y; }
    pl.x = a.back.x; pl.y = a.back.y;
    if (pl.dead) pl.revive(0.3);
    // Unos segundos de gracia al volver: la horda seguía donde la dejaste y te
    // tumbaba al instante (#11, #156). Cada uno, la de su Pokémon.
    pl.graceT = Math.max(pl.graceT || 0, EXIT_GRACE);
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Game.flash('#c9a6ff', 0.8);
    if (pl.bonds > 0) G.Game.offerBond();
  }

  /**
   * Quien manda: aparta a los enemigos (no a los jefes) que esperaban encima del
   * punto de vuelta, hasta un poco más allá de EXIT_R. Avanzan hacia fuera de 8
   * en 8 mientras haya sitio, así no cruzan paredes; no se ve porque la vuelta
   * llega con un destello.
   */
  function clearExit(x, y) {
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || e.boss || e.remote) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d >= EXIT_R) continue;
      const a = d > 1 ? Math.atan2(e.y - y, e.x - x) : Math.random() * 6.2832;
      const ca = Math.cos(a), sa = Math.sin(a), r = Math.min(e.r, 14);
      let s = d;
      for (let k = d + 8; k <= EXIT_R + 20; k += 8) {
        if (!e.flying && !G.World.isFree(x + ca * k, y + sa * k, r, true)) break;
        s = k;
      }
      e.x = x + ca * s; e.y = y + sa * s;
    }
  }

  // ---------------- dibujo ----------------

  /** La grieta, para ordenarla por Y con el resto de la escena. */
  const introDrawable = { y: 0, draw: ctx => drawIntro(ctx) };
  function drawable() {
    if (intro && arena && !(intro.done && intro.t > INTRO + 3)) { introDrawable.y = Math.max(...intro.list.map(l => l.y)); return introDrawable; }
    if (!rift) return null;
    return {
      y: rift.y,
      draw(ctx) {
        const P = G.Sprites.PX;
        const fadeIn = Math.min(1, rift.t * 2), fadeOut = Math.min(1, rift.ttl / 1.5);
        // (Muros y grietas, 05-11-2026) El portal dibujado con pxl (tools/pxl/mapas.px.js): 8 fotogramas y el suelo roto debajo.
        const sheet = G.Tileset && G.Tileset.pxImg('riftp'), rot = G.Tileset && G.Tileset.pxImg('riftsuelo');
        // (Pulido 12-11-2026: «grietas con más presencia») Luz violeta que late en el suelo y una columna de luz que sube.
        const pu = 0.5 + Math.sin(rift.t * 2.6) * 0.5, fa = fadeIn * fadeOut;
        G.FX.glowAt(ctx, rift.x, rift.y - 6, 130 + pu * 20, 50 + pu * 8, '#8a4cff', (0.8 + pu * 0.2) * fa);
        G.FX.glowAt(ctx, rift.x, rift.y - 70, 50, 130, '#c9a6ff', (0.38 + pu * 0.16) * fa);
        if (G.Settings.fx > 1 && Math.random() < 0.5) {
          // Motas que giran hacia dentro del portal.
          const a = Math.random() * 6.2832, d = G.U.rand(60, 110);
          G.FX.px(rift.x + Math.cos(a) * d, rift.y - 50 + Math.sin(a) * d * 0.5, Math.random() < 0.5 ? '#b48cff' : '#ffffff', { vx: -Math.cos(a) * d * 1.4, vy: -Math.sin(a) * d * 0.7, life: 0.65, drag: 1 });
        }
        if (sheet) {
          ctx.save();
          ctx.globalAlpha = fadeIn * fadeOut;
          ctx.imageSmoothingEnabled = false;
          if (rot) ctx.drawImage(rot, Math.round(rift.x - rot.width), Math.round(rift.y - rot.height), rot.width * P, rot.height * P);
          // (Partida en 3D: con bare, el portal lo dibuja ultra3d.js.)
          if (!this.bare) ctx.drawImage(sheet, (Math.floor(rift.t * 8) % 8) * 48, 0, 48, 64, Math.round(rift.x - 48), Math.round(rift.y - 118), 96, 128);
          ctx.restore();
          if (Math.random() < 0.3) G.FX.px(rift.x + G.U.rand(-24, 24), rift.y - G.U.rand(10, 110), '#d9c2ff', { vy: -40, life: 0.6 });
          return;
        }
        const img = G.Tiles.propSprite(0, 'rift', Math.floor(rift.t * 8) % 4);
        const w = img.width * P, h = img.height * P;
        ctx.save();
        ctx.globalAlpha = 0.25 * fadeIn * fadeOut;
        ctx.fillStyle = '#7b3cff';
        ctx.beginPath(); ctx.ellipse(rift.x, rift.y, 34, 12, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = fadeIn * fadeOut;
        ctx.drawImage(img, Math.round(rift.x - w / 2), Math.round(rift.y - h + 4), w, h);
        ctx.restore();
        if (Math.random() < 0.3) G.FX.px(rift.x + G.U.rand(-14, 14), rift.y - G.U.rand(10, 80), '#d9c2ff', { vy: -40, life: 0.6 });
      }
    };
  }

  // ---------------- red ----------------

  function onEvent(ev) {
    switch (ev[0]) {
      case 'rift': show(ev[1], ev[2], ev[3]); break;
      case 'riftx': rift = null; break;
      case 'arena': begin(ev[1]); break;
      case 'aw': won(); break;
      case 'al': lost(); break;
      case 'rk': doSkip(); break;
      case 'lgi': introAt(ev[1]); break;
    }
  }

  return {
    reset, update, drawable, onEvent, leftBehind, enterRequest() { if (!arena && !travel) start(); },
    // Viaje por la grieta: lo lleva la Sentencia (judgment.js), que es quien pone las animaciones del juego.
    travelTick, skipTravel, drawTravel, get traveling() { return !!travel; },
    /** Cómo llega cada legendario (para las pruebas y docs/JEFES.md). */
    APPEAR, appearOf,
    /** (Bloque 3, para las pruebas) sitios al azar de k legendarios y el 'lgi' de un invitado. */
    pickSpots, introAt, SPOTS_IN, ARENA_R, PLAYERS_IN, get pendingLgi() { return pendingLgi; },
    /** Para las pruebas y las capturas: segundos de viaje y de llegada (-1 si no hay). */
    get travelT() { return travel ? travel.t : -1; }, get introT() { return intro && !intro.done ? intro.t : -1; },
    get rift() { return rift; }, get arena() { return arena; },
    get inArena() { return !!arena; },
    get timeLeft() { return arena ? Math.max(0, arena.time - arena.t) : 0; },
    debugOpen() { open(); },
    /** (07-11-2026, para las pruebas) calendario de grietas: [{ mark, at }], la siguiente y si ya puede abrirse. */
    RIFT_EVERY, RIFT_JIT, RIFT_LATE, plan, due, get schedule() { return sched; }, get schedNext() { return sched[schedI] || null; },
    /** Para pruebas: arena de un tipo ya (y, si se dice, con `n` legendarios; `dex`: el primero). */
    debugArena(type, n, dex) { start(type, n, dex); },
    /** Para pruebas: la próxima grieta, con `n` legendarios. */
    debugNextCount(n) { nextN = n; },
    /** Para vídeos: la próxima grieta en la que entres será de este tipo. */
    debugNextType(type) { nextType = type; }
  };
})();
