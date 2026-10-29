/* ============ enemies.js — Pokémon salvajes de todas las generaciones ============
 *
 * Los tramos ya no son listas fijas: cada tramo recoge a todos los Pokémon
 * (de cualquier generación) cuyo total de stats base cae en su rango, y al
 * empezar una run se elige al azar un ELENCO de cada tramo. Así cada partida
 * trae Pokémon distintos sin tener que cargar cientos de sprites a la vez.
 *
 * Los stats de combate salen de la plantilla del tramo, ajustados con la
 * vida y la velocidad propias de cada Pokémon.
 *
 * behavior:
 *   chase    va directo a por ti
 *   charger  se para, apunta y embiste
 *   ranged   se mantiene a distancia y dispara
 *   tank     lento, mucha vida
 *   ---- con personalidad ----
 *   healer   cura a los de alrededor (Chansey, Blissey, Audino...)
 *   shielder pone escudos a sus compañeros (Shuckle, Bronzong, Mr. Mime...)
 *   summoner llama a su manada (Nidoqueen trae Nidoran, Vespiquen Combee...)
 *   bomber   se acerca y explota (Voltorb, Electrode, Koffing, Geodude...)
 *   beamer   rayo que avisa en el suelo antes de disparar
 *   zoner    zonas de daño bajo tus pies que estallan al poco
 *   fan      dispara en abanico
 *   jumper   salta y cae sobre ti (la caída se ve antes en el suelo)
 *   runner   corredor: muy rápido y frágil, va a donde vas a estar (corta el
 *            paso al que sólo huye). Uno por tramo: el más rápido del elenco.
 * Los ataques con aviso están en systems/hazards.js.
 *
 * Jefes: Pokémon fuertes NO legendarios (pseudolegendarios, Slaking...), al
 * azar por franjas de poder. Los legendarios sólo salen en las grietas
 * (systems/rift.js). Desde el 23-10-2026 siguen saliendo hasta el final (antes
 * el último era el del minuto 15) y en los minutos 24 y 27 vienen dos a la vez.
 *
 * Enjambres (oleada de spawner.js): un Pokémon volador pequeño (Zubat, Combee...)
 * elegido al empezar la run.
 */
G.Enemies = (() => {
  const TIERS = [
    { from: 0,   bst: [180, 330], hp: 17,  spd: 56, dmg: 6,  xp: 3.5, cast: 7 },
    { from: 70,  bst: [300, 405], hp: 32,  spd: 62, dmg: 8.5, xp: 5,  cast: 7 },
    { from: 160, bst: [385, 465], hp: 52,  spd: 60, dmg: 11, xp: 8,  cast: 7 },
    { from: 260, bst: [445, 515], hp: 88,  spd: 70, dmg: 14, xp: 13, cast: 7 },
    { from: 380, bst: [495, 560], hp: 150, spd: 66, dmg: 22, xp: 24, cast: 7 },
    { from: 500, bst: [530, 620], hp: 250, spd: 72, dmg: 28, xp: 38, cast: 7 }
  ];

  // Franjas de jefe: minuto en que salen, PV base y franja de BST.
  // (26-10-2026: algo menos de daño; el primero, del minuto 3, quitaba 2/3 de la vida
  //  a un Pokémon sin mejoras de un pisotón. Los cuatro primeros, también menos vida:
  //  sin mejoras no se les podía tumbar, se juntaban dos o tres y ahí acababa la partida. Los de los minutos
  //  15, 18 y 21, también (28-10-2026): con todas las mejoras se tardaba 5-9 minutos en tumbar cada uno y
  //  se amontonaban hacia el 15.
  //  Además ahora traen su firma: G.BossSig.
  //  29-10-2026: los de los minutos 3 a 12, otra vez algo menos de vida y de daño (antes 1050/2400/4400/7600 PV y
  //  26/34/42/50): con todas las mejoras, la primera caída solía llegar con el jefe del 9 o el del 12 en pantalla.
  //  El del 9, otra vez (revisión 2: 3700 → 3000 PV): a un Garchomp que iba flojo le duraba hasta el minuto 16.)
  const BOSS_SLOTS = [
    { at: 180, hp: 720,   dmg: 20, xp: 220,  bst: [490, 545] },
    { at: 360, hp: 1700,  dmg: 26, xp: 420,  bst: [520, 580] },
    { at: 540, hp: 3000,  dmg: 36, xp: 680,  bst: [540, 600] },
    { at: 720, hp: 6400,  dmg: 43, xp: 1000, bst: [580, 700] },
    { at: 900, hp: 13000, dmg: 58, xp: 1800, bst: [600, 700] },
    // Tramo final (23-10-2026): n = cuántos salen a la vez (cada uno con esta vida).
    { at: 1080, hp: 18000, dmg: 64, xp: 2400, bst: [580, 720] },
    { at: 1260, hp: 22000, dmg: 70, xp: 2900, bst: [580, 720] },
    { at: 1440, hp: 20000, dmg: 72, xp: 2400, bst: [560, 720], n: 2 },
    { at: 1620, hp: 25000, dmg: 78, xp: 2900, bst: [560, 720], n: 2 }
  ];
  // Voladores pequeños para los enjambres (los que tengan sprite y floten).
  const SWARM = [41, 415, 165, 193, 12, 15, 527, 278, 333, 425, 267, 742, 92, 81];

  // Stats base aproximados a partir de los de juego (inverso de fetch_pokedex).
  const baseHp = p => (p.hp - 70) / 0.45;
  const baseSpd = p => (p.spd - 78) / 0.42;

  const H = (d, s) => G.U.hash(d, 7, s);

  // Personalidades fijas de algunos Pokémon.
  const HEAL = new Set([35, 36, 113, 173, 183, 184, 242, 301, 440, 531, 594, 700, 764, 858]);
  const SHIELD = new Set([95, 122, 208, 213, 227, 306, 375, 410, 411, 436, 437, 439, 476, 703]);
  const BOMB = new Set([74, 75, 76, 100, 101, 102, 109, 110, 337, 338, 343, 344]);
  // Invocador -> Pokémon de su manada.
  const SUMMON = { 15: 13, 18: 16, 24: 23, 28: 27, 31: 29, 34: 32, 42: 41, 51: 50, 53: 52, 57: 56, 59: 58,
                   62: 60, 68: 66, 73: 72, 78: 77, 82: 81, 85: 84, 91: 90, 117: 116, 130: 129, 168: 167, 169: 41,
                   199: 79, 230: 116, 262: 261, 334: 333, 405: 403, 416: 415, 462: 81, 466: 239, 553: 551, 637: 636 };

  function behaviorOf(p) {
    const t = p.types, h = H(p.dex, 11);
    const has = (...xs) => xs.some(x => t.includes(x));
    if (HEAL.has(p.dex)) return 'healer';
    if (SHIELD.has(p.dex)) return 'shielder';
    if (BOMB.has(p.dex)) return 'bomber';
    if (SUMMON[p.dex] && G.SPRITE_META[SUMMON[p.dex]]) return 'summoner';
    // Enjambres: algunos Bicho llaman a más de los suyos (desde el principio).
    if (has('bug') && h >= 0.6 && h < 0.78) return 'summoner';
    if (has('electric', 'psychic', 'dragon', 'ice') && h < 0.18) return 'beamer';
    if (has('fire', 'ground', 'poison') && h < 0.18) return 'zoner';
    if (has('water', 'grass', 'bug', 'fairy') && h >= 0.18 && h < 0.32) return 'fan';
    if (has('fighting', 'ground', 'normal', 'rock') && h >= 0.42 && h < 0.56) return 'jumper';
    if (has('psychic', 'electric', 'ghost', 'fairy') && h < 0.4) return 'ranged';
    if (has('fire', 'water', 'poison', 'ice') && h < 0.22) return 'ranged';
    if (has('fighting', 'normal', 'ground', 'rock', 'dragon', 'steel', 'dark') && h < 0.4) return 'charger';
    if (baseHp(p) > 95 && baseSpd(p) < 50) return 'tank';
    return 'chase';
  }

  /** Construye la definición de enemigo de un Pokémon para un tramo. */
  function defFor(p, tier, ti) {
    const hpK = G.U.clamp(baseHp(p) / 65, 0.7, 1.6);
    const spdK = G.U.clamp(0.75 + baseSpd(p) / 260, 0.75, 1.3);
    const behavior = behaviorOf(p);
    const d = {
      dex: p.dex, name: p.name, behavior,
      hp: Math.round(tier.hp * hpK * (behavior === 'tank' ? 1.5 : 1)),
      spd: Math.round(tier.spd * spdK * (behavior === 'tank' ? 0.7 : 1)),
      dmg: Math.round(tier.dmg * (behavior === 'tank' ? 1.2 : 1)),
      xp: Math.max(3, Math.round(tier.xp * (behavior === 'tank' ? 1.3 : 1)))
    };
    // Los que pelean de lejos: daño del disparo, recarga y distancia.
    const CD = { ranged: 2.2 - ti * 0.15, fan: 3.2 - ti * 0.15, beamer: 4.4 - ti * 0.2, zoner: 4.6 - ti * 0.2,
                 healer: 3.5, summoner: 7 };
    if (CD[behavior]) {
      d.shotDmg = Math.round(tier.dmg * (behavior === 'fan' ? 0.7 : 0.8));
      d.shotCd = +CD[behavior].toFixed(2);
      d.range = (behavior === 'beamer' ? 260 : behavior === 'healer' || behavior === 'summoner' ? 230 : 190) + ti * 6;
    }
    if (behavior === 'summoner') d.minion = SUMMON[p.dex];
    if (behavior === 'fan') d.fanN = ti < 2 ? 3 : 5;             // abanico más ancho más adelante
    if (behavior === 'zoner') d.zones = ti < 2 ? 1 : ti < 4 ? 2 : 3;   // más zonas más adelante
    if (behavior === 'bomber') { d.spd = Math.round(d.spd * 1.25); d.hp = Math.round(d.hp * 0.8); }
    return d;
  }

  /** Todos los candidatos de un tramo (sin legendarios ni míticos). */
  function candidates(tier) {
    return G.DEX.filter(p => p.rarity < 5 && p.bst >= tier.bst[0] && p.bst <= tier.bst[1] && G.SPRITE_META[p.dex]);
  }

  // ---------------- elenco de la run ----------------

  const PLAIN = ['chase', 'charger', 'ranged', 'tank'];
  const SUPPORT = ['healer', 'shielder', 'summoner'];

  /**
   * Elenco de un tramo: siempre un "apoyo" (curandero, escudo o invocador)
   * y, desde el segundo tramo, también uno de los que atacan con aviso.
   * En el primero no hay más personalidades (para ir aprendiendo).
   */
  function castFor(tier) {
    const all = candidates(tier);
    const kind = p => behaviorOf(p);
    // Primero el tipo de apoyo (a partes iguales) y luego el Pokémon.
    const kinds = SUPPORT.filter(k => all.some(p => kind(p) === k));
    const sk = kinds.length ? kinds[Math.floor(Math.random() * kinds.length)] : null;
    const pick = sk ? G.U.pickN(all.filter(p => kind(p) === sk), 1) : [];
    if (tier.from > 0) pick.push(...G.U.pickN(all.filter(p => !PLAIN.includes(kind(p)) && !SUPPORT.includes(kind(p))), 1));
    if (tier.from === 0) return pick.concat(G.U.pickN(all.filter(p => !pick.includes(p) && PLAIN.includes(kind(p))), tier.cast - pick.length));
    return pick.concat(G.U.pickN(all.filter(p => !pick.includes(p)), tier.cast - pick.length));
  }

  let cast = null;      // [{ from, list: [def] }]
  let bosses = null;    // [def de jefe] (los de un mismo minuto salen juntos)
  let swarmDex = [];    // [dex del enjambre de antes del minuto 18, dex del de después]

  /** Sortea el elenco de una run nueva. */
  function rollRun() {
    cast = TIERS.map((tier, ti) => ({
      from: tier.from,
      list: castFor(tier).map(p => defFor(p, tier, ti))
    }));
    for (const tier of cast) {
      const plain = tier.list.filter(d => d.behavior === 'chase' || d.behavior === 'charger' || d.behavior === 'tank');
      const r = plain.sort((a, b) => b.spd - a.spd)[0];
      if (r) { r.behavior = 'runner'; r.spd = Math.round(r.spd * 1.6); r.hp = Math.round(r.hp * 0.7); }
    }
    const used = new Set();
    bosses = [];
    for (const slot of BOSS_SLOTS) for (let k = 0; k < (slot.n || 1); k++) bosses.push(bossDef(slot, used));
    const sw = SWARM.filter(d => G.SPRITE_META[d] && G.SPRITE_META[d].hv && G.DEX_BY[d]);
    swarmDex = G.U.pickN(sw.length ? sw : [41], 2);
    return { cast, bosses };
  }

  /** Jefe de una franja (sin repetir Pokémon en la run). */
  function bossDef(slot, used) {
    const ok = p => !p.leg && G.SPRITE_META[p.dex] && !used.has(p.dex);
    let pool = G.DEX.filter(p => ok(p) && p.bst >= slot.bst[0] && p.bst <= slot.bst[1]);
    if (!pool.length) pool = G.DEX.filter(p => ok(p) && p.bst >= 580);
    if (!pool.length) pool = G.DEX.filter(p => ok(p) && p.bst >= 500);
    const p = G.U.pick(pool);
    used.add(p.dex);
    return {
      at: slot.at, dex: p.dex, name: p.name,
      // (Desde 2026-10-10 más duros: ×1,35 de vida y ×1,2 de daño.)
      hp: Math.round(slot.hp * 1.35), spd: Math.round(G.U.clamp(40 + baseSpd(p) * 0.5, 40, 100)),
      dmg: Math.round(slot.dmg * 1.2), xp: slot.xp,
      behavior: behaviorOf(p) === 'ranged' ? 'ranged' : (baseSpd(p) > 90 ? 'charger' : 'chase'),
      shotDmg: Math.round(slot.dmg * 0.55), shotCd: 1.1, range: 260
    };
  }

  /** Definición del volador del enjambre en el segundo `t` (con los stats del tramo). */
  function swarmDef(t) {
    if (!cast) rollRun();
    const dex = swarmDex[t < 1080 ? 0 : swarmDex.length - 1], p = G.DEX_BY[dex];
    if (!p) return null;
    const ti = tierAt(t), d = defFor(p, TIERS[ti], ti);
    return Object.assign(d, { behavior: 'chase', spd: Math.min(150, Math.round(d.spd * 1.35)) });
  }

  /*
   * Curva de dificultad (26-10-2026). «Con todas las mejoras al máximo me cuesta
   * pasar del minuto 10»: medido con un bot (esquiva, recoge y elige bien las
   * cartas) en Chrome, con mejoras al máximo el muro estaba en el minuto 8-10 y sin
   * mejoras en el 3-5: cada golpe de un enemigo crecía ×30 en la partida y tu vida,
   * ×2. Ahora la fuerza de los enemigos (vida, daño, tramos, campeones, jefes y
   * legendarios) va con un tiempo «efectivo» que corre más despacio al principio y
   * se acelera al final: el minuto 10 se parece al 4-5 de antes, el 20 al 9 y el 30
   * al 18, y el tramo final (spawner.js) se encarga de que del 20 al 30 siga siendo
   * lo más duro. Lo que sale por segundo sigue con el reloj real; cuántos caben, también
   * (al principio, algo menos: ver capAt en spawner.js).
   * Medido el 28-10-2026 con tools/curve.cjs (Delibird, Charizard, Garchomp y Mewtwo, dos
   * partidas de cada): con todas las mejoras, muro en los minutos 15-25 (la mitad, del 21 en
   * adelante; dos partidas, sin muro); sin mejoras, en el 11-19 (Mewtwo, el más fuerte, en el 19).
   * Caídas medias en los minutos 0-10 / 10-20 / 20-30: con mejoras 0 / 29 / 174 (antes 68 / 350 / 575);
   * sin mejoras 8 / 86 / 224 (antes 89 / 525 / 535). Detalle en docs/JEFES.md.
   * 29-10-2026, con los ataques finales de los 18 tipos y el principio más suave (earlyK/earlyHp): con mejoras, muro en
   * los minutos 15-28 (la mitad de las partidas, sin muro); sin mejoras, en el 9-17 (Mewtwo, 28 o sin muro); caídas
   * 0 / 19 / 78 con mejoras y 5 / 116 / 287 sin ellas.
   * 29-10-2026 (revisión): se decide también con la PRIMERA caída (la queja era «no paso del minuto 10»), que con todas las
   * mejoras seguía en el 9-12 (mediana 11,7). Más suave del 5 al 20 (600→245, 900→335, 1200→525; antes 275, 390 y 540), con el
   * principio y los jefes del 3 al 12 más flojos, como mucho 2 jefes del mapa a la vez (spawner.js) y grietas desde el minuto 4:
   * ahora, con todas las mejoras, primera caída mediana en el minuto 20,9 (10 partidas; ninguna antes del 12,8) y muro en el
   * 23-27 o ninguno; caídas 0 / 1 / 20. Sin mejoras: primera caída 3-10 y muro en el 7-20; caídas 12 / 88 / 579.
   * 29-10-2026 (revisión 2): otra revisión midió 11 partidas con todas las mejoras (mediana 16,7; Garchomp caía hacia el
   * minuto 5 en 3 de 6 y Charizard en el 11 en 2 de 5, y un Garchomp flojo seguía en el Nv. 23 en el minuto 10). Ahora los que
   * empiezan como preevolución reciben menos al principio (youngK), mientras hay un jefe cada enemigo da 2,5 veces su
   * experiencia (spawner.js, FIGHT_XP), el jefe del 9 tiene 3000 PV y los dúos del final cuentan para el tope de 2 jefes.
   * Con todas las mejoras, primera caída: Garchomp 16,8 y sin caer; Charizard 15,1, 16,8, 17,9 y 21,9 (con la protección sólo
   * hasta el 12: Garchomp 16,1-26,9 en 6 partidas y Charizard 11,1, 12,4, 16,4 y 19,5). Nivel en el minuto 10: 43-69.
   * Sin mejoras: Garchomp 5,1 y 12,2; Charizard 5,6 y 8,7 (muro en el 12-20).
   */
  const EFF = [[0, 0], [120, 80], [300, 150], [600, 245], [900, 335], [1200, 525], [1500, 760], [1800, 1080]];
  function eff(t) {
    if (!(t > 0)) return 0;
    for (let i = 1; i < EFF.length; i++) {
      const [t1, e1] = EFF[i];
      if (t <= t1) { const [t0, e0] = EFF[i - 1]; return e0 + (e1 - e0) * (t - t0) / (t1 - t0); }
    }
    const [tl, el] = EFF[EFF.length - 1];
    return el + (t - tl);     // (pasado el 30, en la Sentencia: al ritmo normal)
  }

  // (El "tiempo extra" del minuto 60 se quitó al llegar la Sentencia de Arceus,
  //  que acaba todas las partidas en el minuto 30: ver systems/judgment.js.)
  function scale(t) {
    const e = eff(t);
    return { hp: 1 + e / 95, dmg: 1 + e / 420, spd: 1 + Math.min(0.35, e / 1400) };
  }

  /**
   * Los jefes ya traen su vida base creciente (1.400 ... 16.000), así que
   * escalan mucho más suave: con la curva normal el último llegaba a 168.000 PV.
   */
  function bossScale(t) { const e = eff(t); return { hp: 1 + e / 600, dmg: 1 + e / 600, spd: 1 }; }

  /** Tramo que toca en el segundo `t` (con el tiempo efectivo). */
  function tierAt(t) { const e = eff(t); let ti = 0; TIERS.forEach((tr, i) => { if (e >= tr.from) ti = i; }); return ti; }
  /**
   * Experiencia: la de cada enemigo sale de su tramo, que ahora llega más tarde; esto
   * la deja como la del tramo que tocaría con el reloj real (como antes). Medido: sin
   * esto se subía de nivel bastante más despacio y se llegaba flojo al final.
   */
  function xpLag(t) {
    let ti = 0; TIERS.forEach((tr, i) => { if (t >= tr.from) ti = i; });
    // (28-10-2026: a la 0,75; con el cociente entero se llegaba al nivel 140 en el minuto 29 y con la raíz
    //  los que van flojos se quedaban atascados en el nivel 10-20. 29-10-2026: a la 0,85, con los tramos aún más tarde;
    //  un Pokémon que no mataba bastante se quedaba sin subir de nivel del minuto 10 al 20.)
    return Math.pow(TIERS[ti].xp / TIERS[tierAt(t)].xp, 0.85);
  }

  /**
   * Principio suave (28-10-2026): los golpes de los enemigos (también jefes y legendarios)
   * empiezan en EARLY_K y llegan a 1 (ver abajo las fechas); su vida, en EARLY_HP. Medido con tools/curve.cjs: sin mejoras se
   * caía en el minuto 1-4 (una marea o una grieta temprana), y ahí no hay tiempo de nada. (29-10-2026, con los ataques ya
   * finales de los 18 tipos: sin mejoras el muro volvía al minuto 3-9; antes llegaban a 1 en el 9 y el 8, desde 0,55.)
   * 29-10-2026: los golpes, de 0,45 a 1 en el minuto 15; la vida, de 0,7 a 1 en el 12 (antes 0,5 en el 11 y 0,75 en el 10):
   * los que empiezan flojos (Gible, Charmander) caían en los primeros minutos aun con todas las mejoras.
   */
  const EARLY_K = 0.45, EARLY_HP = 0.7;
  function earlyK(t) { return EARLY_K + (1 - EARLY_K) * Math.min(1, Math.max(0, (t - 60) / 840)); }
  function earlyHp(t) { return EARLY_HP + (1 - EARLY_HP) * Math.min(1, Math.max(0, (t - 60) / 660)); }
  /**
   * Los que empiezan la partida como preevolución (29-10-2026, revisión 2): reciben un 25 % menos hasta el minuto 8 y
   * vuelven a lo normal en el 14 (lo aplica player.hurt). Medido con tools/curve.cjs: con todas las mejoras, Garchomp (que
   * empieza de Gible, con poca vida) caía hacia el minuto 5 en la mitad de las partidas, y Charizard hacia el 11; los que
   * empiezan ya en su forma final (Delibird, Mewtwo) no tenían ese bache. pl: el jugador (pl.evo.plan: su línea).
   */
  const YOUNG_K = 0.75, YOUNG_T0 = 480, YOUNG_T1 = 840;
  function youngK(pl, t) {
    if (!pl || !(t < YOUNG_T1)) return 1;
    const plan = pl.evo && pl.evo.plan;
    const young = plan ? plan.length > 1 : !!(G.Fam && G.Fam.ready() && pl.form && !G.Fam.isFinal(pl.form));
    return young ? YOUNG_K + (1 - YOUNG_K) * Math.min(1, Math.max(0, (t - YOUNG_T0) / (YOUNG_T1 - YOUNG_T0))) : 1;
  }

  const NO_HORDE = new Set(['bomber', 'healer', 'shielder', 'summoner']);
  /** Tipos con bastantes Pokémon en el tramo actual para una horda (events.js). */
  function hordeTypes(t) {
    const all = candidates(TIERS[tierAt(t)]).filter(p => !NO_HORDE.has(behaviorOf(p)));
    return Object.keys(G.U.TYPE_COLOR).filter(ty => all.filter(p => p.types.includes(ty)).length >= 3);
  }
  /** Hasta 4 Pokémon de un tipo, con los stats del tramo actual. */
  function hordeDefs(type, t) {
    const ti = tierAt(t);
    const pool = candidates(TIERS[ti]).filter(p => p.types.includes(type) && !NO_HORDE.has(behaviorOf(p)));
    return G.U.pickN(pool, 4).map(p => defFor(p, TIERS[ti], ti));
  }

  /** Bolsa de enemigos disponibles en el segundo `t`. */
  function bagAt(t) {
    // Durante una horda de un tipo sólo salen los de ese tipo (systems/events.js).
    const horde = G.Events && G.Events.bag();
    if (horde) return horde;
    if (!cast) rollRun();
    const bag = [], e = eff(t);
    for (const tier of cast) {
      if (e < tier.from) continue;
      const w = e - tier.from > 260 ? 3 : 10;       // los tramos viejos pierden peso (tiempo efectivo)
      for (const e of tier.list) for (let i = 0; i < w; i++) bag.push(e);
    }
    return bag.length ? bag : cast[0].list;
  }

  /** dex del elenco que aparecerán pronto (para precargar sprites). */
  function upcomingDex(t, ahead = 60) {
    if (!cast) rollRun();
    const out = [];
    const ea = eff(t + ahead);
    for (const tier of cast) if (tier.from <= ea) for (const e of tier.list) out.push(e.dex);
    for (const b of bosses) if (b.at <= t + ahead) out.push(b.dex);
    if (t + ahead >= 360) out.push(...swarmDex);
    return out;
  }

  return {
    TIERS, BOSS_SLOTS, rollRun, scale, eff, xpLag, earlyK, earlyHp, youngK, bossScale, bagAt, upcomingDex, candidates, hordeTypes, hordeDefs, swarmDef,
    get BOSSES() { if (!bosses) rollRun(); return bosses; },
    get cast() { if (!cast) rollRun(); return cast; }
  };
})();
