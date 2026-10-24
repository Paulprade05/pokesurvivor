/* ============ ability-fx.js — qué hace cada habilidad en el juego ============
 * (20-10-2026, del PR #236 de TheAdro7, adaptado a este juego. Repaso del 24-10-2026: TODAS las
 * habilidades tienen un efecto propio, fiel a lo que hacen en los juegos, y valen lo mismo.)
 *
 * Los nombres están en data/abilities.js. Equilibrio: `node tools/balance.cjs --habilidades` mide cada
 * una con los Pokémon que la llevan, en «puntos» (10 = una carta de subir de nivel: +10 % de daño,
 * −6 % de daño recibido, +7 % de velocidad...); todas rondan los 13. Antes del repaso, la mitad se
 * quedaba en nada: las de clima (el clima sale el 18 % del tiempo), las de poca vida (menos de 1/3,
 * el 3 % del tiempo), las de frenazos (casi nunca te frenan), las de contacto (te tocan una vez cada
 * 5 s) y las 106 «genéricas» (+8 % con su tipo).
 *
 * Ganchos (todos opcionales):
 *   start(pl)             al empezar la partida (stats fijos)
 *   out(pl, m, e)         × al daño que hace el movimiento m al enemigo e (combat.js)
 *   hit(pl, e, m)         ha golpeado a e (después del daño)
 *   inMul(pl, type, cls)  × al daño que recibe (cls 'p' físico, 's' especial; pl.touchHit: cuerpo a cuerpo)
 *   absorb: 'tipo'        ese tipo no le hace daño: le cura un poco
 *   dodge(pl, type, cls)  probabilidad de esquivar un golpe
 *   hurt(pl, type, cls)   le acaban de golpear (pl.touchHit: cuerpo a cuerpo)
 *   contact(pl, e)        un enemigo le ha golpeado cuerpo a cuerpo
 *   tick(pl, dt)          cada fotograma
 *   kill(pl, e)           ha caído un enemigo
 *   speed(pl)             × a la velocidad
 *   healMul               × a lo que le curan
 *   statusCd              × a la recarga de los potenciadores y escudos · cdMul × a todas
 *   critMul               daño del crítico (normal ×1,5)
 *   summon: 'clima'       pone su clima al empezar y cada 3 min (si no hay otro)
 *   block: s              (sólo para balance.cjs) para un golpe entero cada s segundos (en inMul)
 *   levitate / steady / sturdy / sheer / serene / lavaProof / trapProof / damp / touchPoison  (marcas)
 * Las descripciones van en español; las traducciones, en lang-en.js y lang-updates.js. d2 es una
 * segunda frase (se traduce aparte: muchas habilidades comparten una de las dos).
 * Todo es del Pokémon de este ordenador: en cooperativo, cada uno el suyo (los estados y el daño a
 * los enemigos van al anfitrión como los de los movimientos).
 */
G.AbilityFX = (() => {
  const half = pl => pl.hp < pl.maxHp / 2;
  const nearFull = pl => pl.hp >= pl.maxHp * 0.95;
  const wx = () => (G.Weather.current || {}).kind;
  const mult = (type, types) => G.Types.mult(type, types || []);
  const cls = m => (m && m.cat === 'physical' ? 'p' : m && m.cat === 'special' ? 's' : '');
  const TN = t => G.U.TYPE_NAME[t];
  const heal = (pl, k) => { pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * k); };
  const now = () => G.Game.st.time;
  const touch = pl => !!pl.touchHit;                       // golpe cuerpo a cuerpo (combat.js)
  const close = m => m.kind === 'melee' || m.kind === 'dash';
  const superEff = (pl, type) => type && mult(type, pl.mon.types) > 1;
  const nameOf = id => (G.Mons && G.Mons.abilityName ? G.Mons.abilityName(id) : '');
  const say = (pl, id, col) => G.FX.dmgText(pl.x, pl.y - pl.bodyH - 16, nameOf(id), col, true);
  const allOut = k => () => k;
  const allIn = k => () => k;

  // ---------------- plantillas ----------------
  /**
   * Espesura, Mar Llamas, Torrente, Enjambre: su tipo pega más, y mucho más con poca vida (en los juegos,
   * con menos de 1/3: aquí, la mitad; con 1/3 apenas pasaba un 3 % del tiempo). Y algo para todos sus
   * movimientos: Swampert o Empoleon pegan sobre todo con los de su otro tipo.
   */
  const pinch = (type, k = 12, kLow = 35) => ({ d: '+6 % de daño; con movimientos de tipo ' + TN(type) + ', +' + k + ' % (con menos de la mitad de vida, +' + kLow + ' %).',
    out: (pl, m) => (m.type === type ? 1 + (half(pl) ? kLow : k) / 100 : 1.06) });
  const boost = (type, k = 15) => ({ d: '+' + k + ' % de daño con movimientos de tipo ' + TN(type) + '.',
    out: (pl, m) => (m.type === type ? 1 + k / 100 : 1) });
  const surge = type => ({ d: '+6 % de daño; con movimientos de tipo ' + TN(type) + ', +16 %.', out: (pl, m) => (m.type === type ? 1.16 : 1.06) });
  /** Nado Rápido, Clorofila...: algo más rápido siempre; con su clima, mucho más. */
  const rush = (w, es) => ({ d: '+8 % de velocidad; con ' + es + ', +40 %.', speed: () => (wx() === w ? 1.4 : 1.08) });
  /** Cura Lluvia, Gélido: se cura poco a poco; con su clima, deprisa. */
  const wheal = (w, es) => ({ d: 'Recupera un 0,6 % de vida por segundo; con ' + es + ', un 2 %.',
    tick: (pl, dt) => heal(pl, (wx() === w ? 0.02 : 0.006) * dt) });
  /** Velo Arena, Manto Níveo: esquiva algo siempre; con su clima, mucho. */
  const veil = (w, es) => ({ d: 'Esquiva el 7 % de los golpes; con ' + es + ', el 25 %.', dodge: () => (wx() === w ? 0.25 : 0.07) });
  const summon = (w, es) => ({ d: 'Pone ' + es + ' al empezar la partida y cada 3 minutos.', summon: w });
  /** Absorbe Agua y parecidas: ese tipo le cura; y lo que hacen además en los juegos (d2). */
  const absorb = (type, extra = {}) => Object.assign({ d: 'Los ataques de tipo ' + TN(type) + ' no le hacen daño: le curan un poco.', absorb: type }, extra);
  const steady = { d: 'No le frenan las trampas pegajosas ni el terreno.', steady: true };
  /** Lo de Fuerza Mental, Ritmo Propio...: no les frenan; y algo más (d2). */
  const steadyAnd = extra => Object.assign({}, steady, extra);
  const moxie = { d: 'Cada enemigo derrotado le da +0,5 % de daño (hasta +15 %).',
    kill: pl => { pl.moxie = Math.min(0.15, (pl.moxie || 0) + 0.005); }, out: pl => 1 + (pl.moxie || 0) };
  /** Las de contacto (Elec. Estática, Cuerpo Llama...): le hacen menos cuerpo a cuerpo y quien le toca lo paga. */
  const TOUCH_D2 = 'Recibe un 12 % menos de daño cuerpo a cuerpo.';
  const touchIn = (pl) => (touch(pl) ? 0.88 : 1);
  const contact = (fn, d, extra = {}) => Object.assign({ d, d2: TOUCH_D2, contact: fn, inMul: touchIn }, extra);
  const dmgBack = pl => 20 + pl.level * 6;
  const lessDmg = (k, d = 'Recibe un ' + k + ' % menos de daño.') => ({ d, inMul: allIn(1 - k / 100) });
  /** Escudos que paran un golpe entero cada `every` s (Disfraz, Cara de Hielo; only: sólo los físicos 'p'). */
  const guard = (id, every, d, col, only) => ({ d, block: every, blockCls: only || '',
    inMul: (pl, type, c) => {
      if (only && c !== only) return 1;
      const t = now();
      if (pl.blockAt != null && t - pl.blockAt < every) return 1;
      pl.blockAt = t;
      say(pl, id, col);
      return 0;
    } });
  const RANGED = 'Recibe un 22 % menos de daño a distancia (disparos y zonas).';
  const ranged = (k = 0.78, d = RANGED) => ({ d, inMul: pl => (touch(pl) ? 1 : k) });
  const magnet = (k, d) => ({ d, start: pl => { pl.magnet *= k; } });
  const regen = (k, d) => ({ d, start: pl => { pl.regenFlat += pl.maxHp * k; } });
  /** Una baya cada `every` s que se come en cuanto le falta vida: cura k. */
  const berry = (every, k, d) => ({ d, tick: (pl, dt) => {
    pl.berryT = Math.min(every, (pl.berryT || 0) + dt);
    if (pl.berryT >= every && pl.hp < pl.maxHp * 0.99) { pl.berryT = 0; heal(pl, k); }
  } });
  /** Al recibir un golpe, +amount de stat durante dur s (hasta max veces). */
  const onHurt = (stat, amount, dur, max, d, cond) => ({ d, hurt: (pl, type, c) => { if (!cond || cond(pl, type, c)) pl.addBuff(stat, amount, dur, max); } });

  const FX = {
    // ---------------- más daño ----------------
    'overgrow': pinch('grass'), 'blaze': pinch('fire'), 'torrent': pinch('water'),
    // (Casi todos los de Bicho tienen otro tipo con mejores ataques: Enjambre pega algo más.)
    'swarm': pinch('bug', 18, 45),
    'steely-spirit': boost('steel'), 'dragons-maw': boost('dragon'), 'transistor': boost('electric'),
    'fairy-aura': boost('fairy', 18), 'dark-aura': boost('dark', 18),
    // (Los «-génesis» ponen un campo que potencia su tipo: aquí, siempre.)
    'grassy-surge': surge('grass'), 'electric-surge': surge('electric'), 'psychic-surge': surge('psychic'),
    'misty-surge': { d: 'Recibe un 8 % menos de daño y la mitad de daño de Dragón.', inMul: (pl, type) => (type === 'dragon' ? 0.5 : 0.92) },
    'rock-head': { d: '+6 % de daño con movimientos físicos y recibe un 5 % menos de daño.', out: (pl, m) => (cls(m) === 'p' ? 1.06 : 1), inMul: allIn(0.95) },
    'wonder-skin': { d: 'Esquiva el 8 % de los golpes.', dodge: () => 0.08 },
    // (Dhelmise, el único con Acero Templado, no aprende movimientos de Acero: aguanta como el acero.)
    'steelworker': { d: 'Recibe un 8 % menos de daño.', d2: '+15 % de daño con movimientos de tipo Acero.',
      inMul: allIn(0.92), out: (pl, m) => (m.type === 'steel' ? 1.15 : 1) },
    'water-bubble': { d: '+12 % de daño de tipo Agua y recibe la mitad de daño de Fuego.',
      out: (pl, m) => (m.type === 'water' ? 1.12 : 1), inMul: (pl, type) => (type === 'fire' ? 0.5 : 1) },
    'technician': { d: '+40 % de daño con los ataques de golpes flojos.', out: (pl, m) => ((m.def || m).dmg <= 12 ? 1.4 : 1) },
    // Potencia y Energía Pura: en los juegos doblan el Ataque; aquí sus golpes físicos pegan con su
    // mejor ataque y un 20 % más (Azumarill tiene más Ataque Especial que Ataque).
    'huge-power': { d: 'Sus movimientos físicos pegan con su mejor ataque y un 20 % más.',
      start: pl => { const m = pl.mon; m.pa = Math.max(m.pa, m.sa) * 1.2; m.atk = Math.max(m.pa, m.sa); pl.baseAtk = m.atk; } },
    'hustle': { d: '+30 % de daño con movimientos físicos, pero 1 de cada 8 golpes físicos sale flojo.',
      out: (pl, m) => (cls(m) !== 'p' ? 1 : Math.random() < 1 / 8 ? 0.4 : 1.3) },
    'guts': { d: '+12 % de daño con movimientos físicos; con menos de la mitad de vida, +40 %.',
      out: (pl, m) => (cls(m) === 'p' ? (half(pl) ? 1.4 : 1.12) : 1) },
    'toxic-boost': { d: '+10 % de daño; con menos de la mitad de vida, +40 %.', out: pl => (half(pl) ? 1.4 : 1.1) },
    'flare-boost': { d: '+10 % de daño; con menos de la mitad de vida, +40 %.', out: pl => (half(pl) ? 1.4 : 1.1) },
    'adaptability': { d: '+15 % de daño con los movimientos de sus tipos.', out: (pl, m) => (pl.mon.types.includes(m.type) ? 1.15 : 1) },
    'stalwart': { d: '+15 % de daño con los movimientos de sus tipos.', out: (pl, m) => (pl.mon.types.includes(m.type) ? 1.15 : 1) },
    'protean': { d: '+13 % de daño con todos sus movimientos.', out: allOut(1.13) },
    'quark-drive': { d: '+13 % de daño con todos sus movimientos.', out: allOut(1.13) },
    'power-spot': { d: '+13 % de daño con todos sus movimientos.', out: allOut(1.13) },
    'intrepid-sword': { d: '+13 % de daño con todos sus movimientos.', out: allOut(1.13) },
    'sheer-force': { d: '+20 % de daño con movimientos que queman, envenenan, frenan o empujan, pero pierden ese efecto.',
      out: (pl, m) => (m.burn || m.poison || m.slow || m.knock ? 1.2 : 1), sheer: true },
    'serene-grace': { d: '+12 % de probabilidad de golpe crítico y críticos un 30 % más fuertes.',
      d2: 'Las quemaduras, venenos y frenazos de sus movimientos son el doble de fuertes.', serene: true,
      start: pl => { pl.critChance += 0.12; pl.critDmg = (pl.critDmg || 0) + 0.3; } },
    'tough-claws': { d: '+10 % de daño con movimientos físicos; con los cuerpo a cuerpo y embestidas, +35 %.',
      out: (pl, m) => (close(m) ? 1.35 : cls(m) === 'p' ? 1.1 : 1) },
    'reckless': { d: '+12 % de daño con movimientos físicos; con las embestidas, +40 %.',
      out: (pl, m) => (m.kind === 'dash' ? 1.4 : cls(m) === 'p' ? 1.12 : 1) },
    // (Gancho Alto es un puñetazo en los juegos; Filo no lo cuenta como corte, pero sí Veneno X.)
    'iron-fist': { d: '+8 % de daño con movimientos físicos; con los puñetazos y los cuerpo a cuerpo, +20 %.',
      out: (pl, m) => (/punch|uppercut/.test(m.id) || m.kind === 'melee' ? 1.2 : cls(m) === 'p' ? 1.08 : 1) },
    'strong-jaw': { d: '+12 % de daño con movimientos físicos; con los mordiscos, +40 %.',
      out: (pl, m) => (/bite|fang|crunch|jaw/.test(m.id) ? 1.4 : cls(m) === 'p' ? 1.12 : 1) },
    'sharpness': { d: '+12 % de daño con movimientos físicos; con los cortes, +40 %.',
      out: (pl, m) => (/(^|-)cut|slash|blade|razor|scissor|sword|cross-poison|leaf-blade/.test(m.id) ? 1.4 : cls(m) === 'p' ? 1.12 : 1) },
    'mega-launcher': { d: '+15 % de daño con todo lo que no es cuerpo a cuerpo ni embestida; con los pulsos y esferas, +40 %.',
      out: (pl, m) => (/pulse|aura-sphere/.test(m.id) ? 1.4 : close(m) ? 1 : 1.15) },
    'punk-rock': { d: '+12 % de daño con movimientos especiales; con los sonidos, +40 %.',
      out: (pl, m) => (/voice|buzz|boom|noise|sing|song|echo|uproar|snarl/.test(m.id) ? 1.4 : cls(m) === 's' ? 1.12 : 1) },
    'liquid-voice': { d: '+15 % de daño con movimientos de tipo Agua y con los sonidos.',
      out: (pl, m) => (m.type === 'water' || /voice|buzz|noise|sing|song|echo/.test(m.id) ? 1.15 : 1) },
    'tinted-lens': { d: 'Sus movimientos poco eficaces hacen daño normal.',
      out: (pl, m, e) => { const k = e ? mult(m.type, e.types) : 1; return k < 1 && k > 0 ? Math.min(1 / k, 1 / 0.6) : 1; } },
    'scrappy': { d: '+10 % de daño con movimientos Normal y Lucha, que dañan del todo a los Fantasma.',
      out: (pl, m, e) => (m.type !== 'normal' && m.type !== 'fighting' ? 1 : 1.1 * (e && (e.types || []).includes('ghost') ? Math.min(2, 1 / Math.max(0.3, mult(m.type, e.types))) : 1)) },
    'sand-force': { d: '+12 % de daño con movimientos de tipo Roca, Tierra y Acero; con tormenta de arena, +35 %.',
      out: (pl, m) => (['rock', 'ground', 'steel'].includes(m.type) ? (wx() === 'sand' ? 1.35 : 1.12) : 1) },
    'solar-power': { d: '+12 % de daño con movimientos especiales; con sol, +45 %, pero el sol le quita algo de vida.',
      out: (pl, m) => (cls(m) === 's' ? (wx() === 'sun' ? 1.45 : 1.12) : 1),
      tick: (pl, dt) => { if (wx() === 'sun' && pl.hp > pl.maxHp * 0.1) pl.hp -= pl.maxHp * 0.003 * dt; } },
    'protosynthesis': { d: '+12 % de daño con todos sus movimientos; con sol, +30 %.', out: () => (wx() === 'sun' ? 1.3 : 1.12) },
    'flower-gift': { d: '+8 % de daño y recibe un 4 % menos; con sol, +25 % de daño y un 12 % menos.',
      out: () => (wx() === 'sun' ? 1.25 : 1.08), inMul: () => (wx() === 'sun' ? 0.88 : 0.96) },
    'forecast': { d: '+10 % de daño; con cualquier clima, +35 %.', out: () => (wx() ? 1.35 : 1.1) },
    'sniper': { d: 'Sus golpes críticos hacen ×2,2 de daño (en vez de ×1,5).', d2: '+5 % de probabilidad de golpe crítico.',
      critMul: 2.2, start: pl => { pl.critChance += 0.05; } },
    'super-luck': { d: '+15 % de probabilidad de golpe crítico y críticos un 30 % más fuertes.',
      start: pl => { pl.critChance += 0.15; pl.critDmg = (pl.critDmg || 0) + 0.3; } },
    'compound-eyes': { d: '+10 % de probabilidad de golpe crítico y +8 % de daño.', out: allOut(1.08), start: pl => { pl.critChance += 0.1; } },
    'keen-eye': { d: '+10 % de probabilidad de golpe crítico y +8 % de daño.', out: allOut(1.08), start: pl => { pl.critChance += 0.1; } },
    'victory-star': { d: '+10 % de probabilidad de golpe crítico y +8 % de daño.', out: allOut(1.08), start: pl => { pl.critChance += 0.1; } },
    'moxie': moxie, 'chilling-neigh': moxie, 'grim-neigh': moxie, 'beast-boost': moxie, 'supreme-overlord': moxie,
    'soul-heart': moxie, 'receiver': moxie,
    'merciless': { d: '+35 % de daño a los enemigos envenenados o con menos de la mitad de vida.',
      out: (pl, m, e) => (e && (e.poison > 0 || e.hp < e.maxHp * 0.5) ? 1.35 : 1) },
    'analytic': { d: '+35 % de daño a enemigos con menos de la mitad de vida.', out: (pl, m, e) => (e && e.hp < e.maxHp * 0.5 ? 1.35 : 1) },
    'stakeout': { d: '+40 % de daño a los enemigos que aún tienen la vida llena.', out: (pl, m, e) => (e && e.hp >= e.maxHp * 0.99 ? 1.4 : 1) },
    'mold-breaker': { d: '+10 % de daño; a los jefes, +30 %.', out: (pl, m, e) => (e && e.boss ? 1.3 : 1.1) },
    'teravolt': { d: '+10 % de daño; a los jefes, +30 %.', out: (pl, m, e) => (e && e.boss ? 1.3 : 1.1) },
    'turboblaze': { d: '+10 % de daño; a los jefes, +30 %.', out: (pl, m, e) => (e && e.boss ? 1.3 : 1.1) },
    'aura-break': { d: '+10 % de daño; a los jefes, +30 %.', out: (pl, m, e) => (e && e.boss ? 1.3 : 1.1) },
    'infiltrator': { d: '+12 % de daño y sus golpes rompen los escudos de los enemigos.', out: allOut(1.12),
      hit: (pl, e) => { if (!e.remote && e.shield > 0) { e.shield = 0; e.shieldT = 0; } } },
    'unseen-fist': { d: '+12 % de daño y sus golpes rompen los escudos de los enemigos.', out: allOut(1.12),
      hit: (pl, e) => { if (!e.remote && e.shield > 0) { e.shield = 0; e.shieldT = 0; } } },
    'rivalry': { d: '+10 % de daño; a los enemigos que comparten un tipo con él, +30 %.',
      out: (pl, m, e) => (e && (e.types || []).some(t => pl.mon.types.includes(t)) ? 1.3 : 1.1) },
    'justified': { d: '+10 % de daño; a los Pokémon de tipo Siniestro, +40 %.', out: (pl, m, e) => (e && (e.types || []).includes('dark') ? 1.4 : 1.1) },
    'plus': { d: '+10 % de daño; con movimientos especiales, +15 %.', out: (pl, m) => (cls(m) === 's' ? 1.15 : 1.1) },
    'minus': { d: '+10 % de daño; con movimientos especiales, +15 %.', out: (pl, m) => (cls(m) === 's' ? 1.15 : 1.1) },
    'beads-of-ruin': { d: '+13 % de daño con movimientos especiales.', out: (pl, m) => (cls(m) === 's' ? 1.13 : 1) },
    'hyper-cutter': { d: '+13 % de daño con movimientos físicos.', out: (pl, m) => (cls(m) === 'p' ? 1.13 : 1) },
    'download': { d: '+13 % de daño con todos sus movimientos.', out: allOut(1.13) },
    'no-guard': { d: 'Todo acierta: +20 % de daño hecho, pero recibe un 5 % más.', out: allOut(1.2), inMul: allIn(1.05) },
    'skill-link': { d: '+25 % de daño con los movimientos de varios golpes y +10 % con los demás.', out: (pl, m) => ((m.count || 1) >= 2 || m.bounce ? 1.25 : 1.1) },
    'long-reach': { d: 'Ataca desde lejos: recibe un 15 % menos de daño cuerpo a cuerpo.', inMul: pl => (touch(pl) ? 0.85 : 1) },
    'normalize': { d: '+15 % de daño con movimientos de tipo Normal.', out: (pl, m) => (m.type === 'normal' ? 1.15 : 1) },
    // (Piel Helada y Piel Feérica vuelven Hielo / Hada sus movimientos Normales: aquí, los dos tipos pegan más.)
    'refrigerate': { d: '+10 % de daño; con movimientos de tipo Normal y Hielo, +20 %.', out: (pl, m) => (m.type === 'normal' || m.type === 'ice' ? 1.2 : 1.1) },
    'pixilate': { d: '+15 % de daño con movimientos de tipo Normal y Hada.', out: (pl, m) => (m.type === 'normal' || m.type === 'fairy' ? 1.15 : 1) },
    'multitype': { d: '+13 % de daño con todos sus movimientos.', out: allOut(1.13) },
    'rks-system': { d: '+13 % de daño con todos sus movimientos.', out: allOut(1.13) },
    'corrosion': { d: 'Sus golpes envenenan a veces (1 de cada 5), incluso a los de tipo Acero y Veneno.', hit: (pl, e) => { if (Math.random() < 0.2) e.applyPoison(1); } },
    'toxic-chain': { d: 'Sus golpes envenenan a veces (1 de cada 3).', hit: (pl, e) => { if (Math.random() < 1 / 3) e.applyPoison(1); } },
    'poison-touch': { d: 'Sus ataques cuerpo a cuerpo y embestidas envenenan.', touchPoison: true },
    'magician': { d: '+10 % de daño y +15 % de Pokémonedas.', out: allOut(1.1), start: pl => { pl.coinMul *= 1.15; } },
    'simple': { d: '+8 % de daño y +5 % de velocidad.', out: allOut(1.08), speed: () => 1.05 },
    'tera-shift': { d: '+8 % de daño y recibe un 4 % menos de daño.', out: allOut(1.08), inMul: allIn(0.96) },
    'trace': { d: '+8 % de daño y recibe un 4 % menos de daño.', out: allOut(1.08), inMul: allIn(0.96) },
    'commander': { d: '+8 % de daño y recibe un 4 % menos de daño.', out: allOut(1.08), inMul: allIn(0.96) },
    'thermal-exchange': { d: 'El Fuego le hace la mitad de daño y sus movimientos físicos hacen +8 %.',
      inMul: (pl, type) => (type === 'fire' ? 0.5 : 1), out: (pl, m) => (cls(m) === 'p' ? 1.08 : 1) },
    'zero-to-hero': { d: 'Pasado el primer minuto se transforma en héroe: +14 % de daño.', out: () => (now() >= 60 ? 1.14 : 1) },

    // ---------------- velocidad ----------------
    'speed-boost': { d: 'Cada 10 segundos va un 1 % más rápido (hasta +10 %).',
      tick: (pl, dt) => { pl.boostT = (pl.boostT || 0) + dt; if (pl.boostT >= 10) { pl.boostT = 0; pl.abSpd = Math.min(0.1, (pl.abSpd || 0) + 0.01); } },
      speed: pl => 1 + (pl.abSpd || 0) },
    'swift-swim': rush('rain', 'lluvia'), 'chlorophyll': rush('sun', 'sol'),
    'sand-rush': rush('sand', 'tormenta de arena'), 'slush-rush': rush('snow', 'nieve'),
    'run-away': { d: '+8 % de velocidad; con menos de la mitad de vida, +30 %.', speed: pl => (half(pl) ? 1.3 : 1.08) },
    'quick-feet': steadyAnd({ d2: '+9 % de velocidad.', speed: () => 1.09 }),
    'light-metal': { d: '+10 % de velocidad.', speed: () => 1.1 },
    'propeller-tail': { d: '+10 % de velocidad.', speed: () => 1.1 },
    'dancer': { d: '+10 % de velocidad.', speed: () => 1.1 },
    'unburden': { d: 'Sin objeto va un 15 % más rápido.', speed: pl => (pl.item ? 1 : 1.15) },
    'gale-wings': { d: 'Con la vida casi llena, +10 % de velocidad y +15 % de daño con movimientos de tipo Volador.',
      speed: pl => (nearFull(pl) ? 1.1 : 1), out: (pl, m) => (m.type === 'flying' && nearFull(pl) ? 1.15 : 1) },
    'wind-rider': { d: '+8 % de velocidad; con cualquier clima, +30 %.', speed: () => (wx() ? 1.3 : 1.08) },
    'wimp-out': { d: 'Con menos de la mitad de vida sale corriendo: +35 % de velocidad y recibe un 20 % menos de daño.',
      speed: pl => (half(pl) ? 1.35 : 1), inMul: pl => (half(pl) ? 0.8 : 1) },
    'emergency-exit': { d: 'Con menos de la mitad de vida sale corriendo: +35 % de velocidad y recibe un 20 % menos de daño.',
      speed: pl => (half(pl) ? 1.35 : 1), inMul: pl => (half(pl) ? 0.8 : 1) },
    'hunger-switch': { d: 'Alterna cada 10 s entre hambre (+15 % de daño) y saciedad (+9 % de velocidad).',
      tick: (pl, dt) => { pl.hungerT = (pl.hungerT || 0) + dt; if (pl.hungerT >= 10) { pl.hungerT = 0; pl.hangry = !pl.hangry; } },
      out: pl => (pl.hangry ? 1 : 1.15), speed: pl => (pl.hangry ? 1.09 : 1) },

    // ---------------- climas ----------------
    'drought': Object.assign(summon('sun', 'sol'), { d2: 'Con sol, sus movimientos de tipo Tierra hacen +30 %.', out: (pl, m) => (m.type === 'ground' && wx() === 'sun' ? 1.3 : 1) }),
    'orichalcum-pulse': Object.assign(summon('sun', 'sol'), { d2: '+8 % de daño con movimientos físicos; con sol, +25 %.',
      out: (pl, m) => (cls(m) === 'p' ? (wx() === 'sun' ? 1.25 : 1.08) : 1) }),
    'drizzle': Object.assign(summon('rain', 'lluvia'), { d2: '+6 % de daño con movimientos de tipo Agua.', out: (pl, m) => (m.type === 'water' ? 1.06 : 1) }),
    'sand-stream': Object.assign(summon('sand', 'una tormenta de arena'), { d2: 'Recibe un 5 % menos de daño.', inMul: allIn(0.95) }),
    'snow-warning': Object.assign(summon('snow', 'nieve'), { d2: '+12 % de daño con movimientos de tipo Hielo.', out: (pl, m) => (m.type === 'ice' ? 1.12 : 1) }),
    'rain-dish': wheal('rain', 'lluvia'), 'ice-body': wheal('snow', 'nieve'),
    'sand-veil': veil('sand', 'tormenta de arena'), 'snow-cloak': veil('snow', 'nieve'),
    'dry-skin': absorb('water', { d2: 'El Fuego le hace un 35 % más de daño.', inMul: (pl, type) => (type === 'fire' ? 1.35 : 1) }),
    'hydration': steadyAnd({ d2: 'Recupera un 0,6 % de vida por segundo; con lluvia, un 2 %.',
      tick: (pl, dt) => { heal(pl, (wx() === 'rain' ? 0.02 : 0.006) * dt); } }),
    'leaf-guard': { d: 'Recibe un 7 % menos de daño; con sol, un 25 % menos y nada le frena.',
      tick: pl => { if (wx() === 'sun') pl.slowT = 0; }, inMul: () => (wx() === 'sun' ? 0.75 : 0.93) },
    'cloud-nine': { d: 'Recibe un 8 % menos de daño y el clima no potencia los ataques que le hacen.',
      inMul: (pl, type) => 0.92 / Math.max(1, type ? G.Weather.mult(type) : 1) },
    'air-lock': { d: 'Recibe un 8 % menos de daño y el clima no potencia los ataques que le hacen.',
      inMul: (pl, type) => 0.92 / Math.max(1, type ? G.Weather.mult(type) : 1) },

    // ---------------- defensa ----------------
    'levitate': { d: 'Flota: no le afectan el agua, la lava ni las trampas, y la Tierra le hace muy poco.', d2: 'Esquiva el 5 % de los golpes.',
      levitate: true, inMul: (pl, type) => (type === 'ground' ? 0.3 : 1), dodge: () => 0.05 },
    'thick-fat': { d: 'Recibe la mitad de daño de Fuego y Hielo.', d2: 'Recibe un 4 % menos de daño.', inMul: (pl, type) => (type === 'fire' || type === 'ice' ? 0.5 : 0.96) },
    'heatproof': { d: 'Recibe la mitad de daño de Fuego.', inMul: (pl, type) => (type === 'fire' ? 0.5 : 1) },
    'water-veil': { d: 'La lava no le quema y recibe la mitad de daño de Fuego.', d2: 'Recibe un 4 % menos de daño.',
      lavaProof: true, inMul: (pl, type) => (type === 'fire' ? 0.5 : 0.96) },
    'magma-armor': { d: 'La lava no le quema y recibe un 20 % menos de daño de Agua y Hielo.',
      lavaProof: true, inMul: (pl, type) => (type === 'water' || type === 'ice' ? 0.8 : 1) },
    'immunity': { d: 'El Veneno apenas le hace daño.', d2: 'Recibe un 6 % menos de daño.', inMul: (pl, type) => (type === 'poison' ? 0.3 : 0.94) },
    'purifying-salt': steadyAnd({ d2: 'Recibe la mitad de daño de Fantasma y un 6 % menos del resto.', inMul: (pl, type) => (type === 'ghost' ? 0.5 : 0.94) }),
    'water-compaction': { d: 'Recibe un 35 % menos de daño de Agua.', inMul: (pl, type) => (type === 'water' ? 0.65 : 1) },
    'water-absorb': absorb('water'), 'storm-drain': absorb('water'),
    'volt-absorb': absorb('electric', { d2: 'Recupera un 0,3 % de vida por segundo.', start: pl => { pl.regenFlat += pl.maxHp * 0.003; } }),
    'lightning-rod': absorb('electric', { d2: '+5 % de daño con todos sus movimientos.', out: allOut(1.05) }),
    'motor-drive': absorb('electric', { d2: '+3 % de velocidad.', speed: () => 1.03 }),
    'flash-fire': absorb('fire', { d2: '+6 % de daño con movimientos de tipo Fuego.', out: (pl, m) => (m.type === 'fire' ? 1.06 : 1) }),
    'well-baked-body': absorb('fire'),
    'sap-sipper': absorb('grass'),
    'earth-eater': absorb('ground', { d2: 'Recupera un 0,15 % de vida por segundo.', start: pl => { pl.regenFlat += pl.maxHp * 0.0015; } }),
    'multiscale': { d: 'Con la vida casi llena recibe un 40 % menos de daño.', inMul: pl => (nearFull(pl) ? 0.6 : 1) },
    'shadow-shield': { d: 'Con la vida casi llena recibe un 40 % menos de daño.', inMul: pl => (nearFull(pl) ? 0.6 : 1) },
    'filter': { d: 'Los ataques muy eficaces le hacen un 30 % menos.', d2: 'Recibe un 4 % menos de daño.', inMul: (pl, type) => (superEff(pl, type) ? 0.7 : 0.96) },
    'solid-rock': { d: 'Los ataques muy eficaces le hacen un 20 % menos.', inMul: (pl, type) => (superEff(pl, type) ? 0.8 : 1) },
    'prism-armor': { d: 'Los ataques muy eficaces le hacen un 30 % menos.', d2: 'Recibe un 4 % menos de daño.', inMul: (pl, type) => (superEff(pl, type) ? 0.7 : 0.96) },
    'color-change': lessDmg(8),
    'fur-coat': { d: 'Recibe un 12 % menos de daño físico.', inMul: (pl, type, c) => (c === 'p' ? 0.88 : 1) },
    'big-pecks': { d: 'Recibe un 12 % menos de daño físico.', inMul: (pl, type, c) => (c === 'p' ? 0.88 : 1) },
    'fluffy': { d: 'Recibe un 25 % menos de daño cuerpo a cuerpo, pero el Fuego le hace un 50 % más.',
      inMul: (pl, type) => (type === 'fire' ? 1.5 : touch(pl) ? 0.75 : 1) },
    'ice-scales': { d: 'Recibe un 30 % menos de daño especial.', inMul: (pl, type, c) => (c === 's' ? 0.7 : 1) },
    'soundproof': { d: 'Recibe un 30 % menos de daño especial.', inMul: (pl, type, c) => (c === 's' ? 0.7 : 1) },
    'shell-armor': lessDmg(8), 'battle-armor': lessDmg(8), 'pressure': lessDmg(8), 'friend-guard': lessDmg(8),
    'armor-tail': lessDmg(8), 'dauntless-shield': lessDmg(8), 'grass-pelt': lessDmg(8),
    'unaware': lessDmg(8, 'No se deja impresionar: recibe un 8 % menos de daño.'),
    'unnerve': lessDmg(8, 'Pone nerviosos a los enemigos: le hacen un 8 % menos de daño.'),
    'neutralizing-gas': lessDmg(8, 'Pone nerviosos a los enemigos: le hacen un 8 % menos de daño.'),
    'queenly-majesty': lessDmg(8, 'Pone nerviosos a los enemigos: le hacen un 8 % menos de daño.'),
    'dazzling': lessDmg(8, 'Pone nerviosos a los enemigos: le hacen un 8 % menos de daño.'),
    'bad-dreams': lessDmg(8, 'Pone nerviosos a los enemigos: le hacen un 8 % menos de daño.'),
    'intimidate': { d: 'Los enemigos le hacen un 12 % menos de daño físico.', inMul: (pl, type, c) => (c === 'p' ? 0.88 : 1) },
    'overcoat': ranged(), 'bulletproof': ranged(), 'mirror-armor': ranged(), 'shield-dust': ranged(),
    'magic-bounce': Object.assign(ranged(0.86, 'Recibe un 14 % menos de daño a distancia y esquiva el 8 % de esos golpes.'),
      { dodge: pl => (touch(pl) ? 0 : 0.08) }),
    'good-as-gold': steadyAnd({ d2: RANGED, inMul: pl => (touch(pl) ? 1 : 0.78) }),
    'sturdy': { d: 'Un golpe que le dejaría KO le deja con 1 de vida (cada 90 s).', d2: 'Recibe un 5 % menos de daño.', sturdy: true, inMul: allIn(0.95) },
    'regenerator': regen(0.007, 'Recupera un 0,7 % de su vida por segundo.'),
    'hospitality': regen(0.007, 'Recupera un 0,7 % de su vida por segundo.'),
    'poison-heal': regen(0.007, 'Recupera un 0,7 % de su vida por segundo.'),
    'natural-cure': regen(0.007, 'Recupera un 0,7 % de su vida por segundo.'),
    'healer': regen(0.007, 'Recupera un 0,7 % de su vida por segundo.'),
    'magic-guard': { d: 'Sólo le hacen daño los ataques: ni la lava, ni las trampas, ni las explosiones.', d2: 'Recibe un 12 % menos de daño a distancia (disparos y zonas).',
      lavaProof: true, trapProof: true, damp: true, inMul: pl => (touch(pl) ? 1 : 0.88) },
    'stamina': onHurt('def', 0.04, 6, 3, 'Cada golpe que recibe le sube la defensa un 4 % durante 6 s (hasta 3 veces).'),
    'marvel-scale': { d: 'Recibe un 6 % menos de daño; con menos de la mitad de vida, un 25 % menos.', inMul: pl => (half(pl) ? 0.75 : 0.94) },
    'shields-down': { d: 'Con más de la mitad de vida recibe un 10 % menos de daño; con menos, hace +20 % de daño.',
      inMul: pl => (half(pl) ? 1 : 0.9), out: pl => (half(pl) ? 1.2 : 1) },
    'heavy-metal': { d: 'Recibe un 12 % menos de daño, pero va un 4 % más lento.', inMul: allIn(0.88), speed: () => 0.96 },
    'stall': { d: 'Recibe un 12 % menos de daño, pero va un 4 % más lento.', inMul: allIn(0.88), speed: () => 0.96 },
    'wonder-guard': { d: 'Lo que no es muy eficaz le hace un 40 % menos; lo muy eficaz, un 40 % más.',
      inMul: (pl, type) => (!type ? 1 : superEff(pl, type) ? 1.4 : 0.6) },
    'disguise': guard('disguise', 60, 'Cada 60 s, el primer golpe que recibe no le hace daño.', '#f4d35e'),
    'ice-face': guard('ice-face', 60, 'Cada 60 s, el primer golpe físico que recibe no le hace daño.', '#bfe8ff', 'p'),
    'illusion': { d: 'Lee las intenciones: esquiva el 8 % de los golpes.', dodge: () => 0.08 },
    'telepathy': { d: 'Lee las intenciones: esquiva el 8 % de los golpes.', dodge: () => 0.08 },
    'anticipation': { d: 'Presiente el peligro: esquiva el 8 % de los golpes.', dodge: () => 0.08 },
    'forewarn': { d: 'Presiente el peligro: esquiva el 8 % de los golpes.', dodge: () => 0.08 },
    'damp': { d: 'Las explosiones de los Pokémon kamikaze no le dañan.', d2: 'Recibe un 6 % menos de daño.', damp: true, inMul: allIn(0.94) },
    'suction-cups': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'comatose': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'aroma-veil': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'flower-veil': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'sweet-veil': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'oblivious': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'clear-body': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'white-smoke': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'full-metal-body': steadyAnd({ d2: 'Recibe un 8 % menos de daño.', inMul: allIn(0.92) }),
    'limber': steadyAnd({ d2: 'Esquiva el 8 % de los golpes.', dodge: () => 0.08 }),
    'own-tempo': steadyAnd({ d2: '+9 % de velocidad.', speed: () => 1.09 }),
    'inner-focus': steadyAnd({ d2: 'Sus movimientos se recargan un 11 % antes.', cdMul: 0.89 }),
    'insomnia': steadyAnd({ d2: 'Gana un 15 % más de experiencia.', start: pl => { pl.xpMul *= 1.15; } }),
    'vital-spirit': steadyAnd({ d2: 'Gana un 15 % más de experiencia.', start: pl => { pl.xpMul *= 1.15; } }),
    'early-bird': { d: 'Gana un 15 % más de experiencia.', start: pl => { pl.xpMul *= 1.15; } },

    // ---------------- contraataques (al recibir un golpe cuerpo a cuerpo) ----------------
    'static': contact((pl, e) => e.applySlow(0.5, 2.5), 'Quien le golpea cuerpo a cuerpo se queda frenado (paralizado).'),
    'flame-body': contact((pl, e) => e.applyBurn(2), 'Quien le golpea cuerpo a cuerpo se quema.'),
    'poison-point': contact((pl, e) => e.applyPoison(2), 'Quien le golpea cuerpo a cuerpo se envenena.'),
    'liquid-ooze': contact((pl, e) => e.applyPoison(2), 'Quien le golpea cuerpo a cuerpo se envenena.'),
    'toxic-debris': contact((pl, e) => e.applyPoison(2), 'Quien le golpea cuerpo a cuerpo se envenena.'),
    'cute-charm': contact((pl, e) => e.applySlow(0.4, 2.5), 'Quien le golpea cuerpo a cuerpo se queda embobado (frenado).'),
    'effect-spore': contact((pl, e) => (Math.random() < 0.5 ? e.applySlow(0.45, 2.5) : e.applyPoison(2)), 'Quien le golpea cuerpo a cuerpo se frena o se envenena.'),
    'rough-skin': contact((pl, e) => e.hurt(dmgBack(pl), '#9aa6b5'), 'Quien le golpea cuerpo a cuerpo recibe daño.'),
    'iron-barbs': contact((pl, e) => e.hurt(dmgBack(pl), '#9aa6b5'), 'Quien le golpea cuerpo a cuerpo recibe daño.'),
    'innards-out': contact((pl, e) => e.hurt(dmgBack(pl), '#ff9fcf'), 'Quien le golpea cuerpo a cuerpo recibe daño.'),
    'perish-body': contact((pl, e) => e.hurt(dmgBack(pl), '#9a7bd6'), 'Quien le golpea cuerpo a cuerpo recibe daño.'),
    'gulp-missile': contact((pl, e) => { e.hurt(dmgBack(pl), '#7fb8ff'); e.applySlow(0.4, 2); }, 'Quien le golpea cuerpo a cuerpo recibe daño.'),
    'synchronize': contact((pl, e) => e.hurt(dmgBack(pl), '#ff9fcf'), 'Quien le golpea cuerpo a cuerpo recibe parte del golpe.'),
    'cursed-body': contact((pl, e) => { if (Math.random() < 0.3) e.applySlow(0.5, 2); }, 'A veces frena a quien le golpea cuerpo a cuerpo.'),
    'gooey': contact((pl, e) => e.applySlow(0.5, 2.5), 'Quien le golpea cuerpo a cuerpo se queda frenado (pegajoso).'),
    'cotton-down': contact((pl, e) => e.applySlow(0.5, 2.5), 'Quien le golpea cuerpo a cuerpo se queda frenado (pegajoso).'),
    'arena-trap': contact((pl, e) => e.applySlow(0.6, 2), 'Quien le golpea cuerpo a cuerpo se queda atrapado (muy frenado).'),
    'shadow-tag': contact((pl, e) => e.applySlow(0.6, 2), 'Quien le golpea cuerpo a cuerpo se queda atrapado (muy frenado).'),
    'sand-spit': contact((pl, e) => e.applySlow(0.6, 2), 'Quien le golpea cuerpo a cuerpo se queda atrapado (muy frenado).'),
    'mummy': contact((pl, e) => e.applyStun(0.6), 'Quien le golpea cuerpo a cuerpo se queda aturdido un momento.'),
    'lingering-aroma': contact((pl, e) => e.applyStun(0.6), 'Quien le golpea cuerpo a cuerpo se queda aturdido un momento.'),
    'wandering-spirit': contact((pl, e) => e.applyStun(0.6), 'Quien le golpea cuerpo a cuerpo se queda aturdido un momento.'),
    'stench': { d: 'Su olor echa para atrás: recibe un 15 % menos de daño cuerpo a cuerpo.', inMul: pl => (touch(pl) ? 0.85 : 1) },
    // Detonación: una vez por minuto, al quedarse con poca vida, explota y daña a los de alrededor.
    'aftermath': { d: 'Una vez por minuto, al quedar con poca vida, explota y daña a los de alrededor.', d2: TOUCH_D2, inMul: touchIn,
      tick: pl => {
        if (pl.dead || pl.hp >= pl.maxHp * 0.25 || now() - (pl.boomAt == null ? -1e9 : pl.boomAt) < 60) return;
        pl.boomAt = now();
        G.FX.ring(pl.x, pl.y, 10, 140, '#ff7b3d', 0.5, 6); G.Camera.kick(0.6); G.Audio.sfx('break');
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 140)) e.hurt(60 + pl.level * 14, '#ff7b3d', e.x - pl.x, e.y - pl.y, 160);
      } },
    // Hurto: a quien le golpea cuerpo a cuerpo le roba vida y, a veces, una moneda.
    'pickpocket': { d: 'A quien le golpea cuerpo a cuerpo le roba: recupera un 4 % de vida y a veces coge una moneda.',
      contact: pl => { heal(pl, 0.04); if (Math.random() < 0.15) G.Pickups.drop('coin', pl.x + G.U.rand(-10, 10), pl.y + G.U.rand(-10, 10), 2); } },

    // ---------------- al recibir golpes ----------------
    'weak-armor': onHurt('spd', 0.25, 3, 1, 'Al recibir un golpe físico se aligera: +25 % de velocidad un momento.', (pl, type, c) => c === 'p'),
    'steadfast': onHurt('spd', 0.08, 4, 2, 'Al recibir un golpe, +8 % de velocidad un momento (se acumula).'),
    'rattled': onHurt('spd', 0.2, 3, 1, 'Los golpes le asustan: +20 % de velocidad un momento.'),
    'contrary': onHurt('atk', 0.08, 8, 3, 'Le salen al revés: cada golpe que recibe le da +8 % de daño durante 8 s (hasta 3 veces).'),
    'defiant': onHurt('patk', 0.12, 8, 2, 'Al recibir un golpe se pica: +12 % de daño físico durante 8 s (hasta 2 veces).'),
    'competitive': onHurt('satk', 0.12, 8, 2, 'Al recibir un golpe se pica: +12 % de daño especial durante 8 s (hasta 2 veces).'),
    'electromorphosis': onHurt('atk', 0.2, 6, 1, 'Al recibir un golpe se carga: +20 % de daño durante 6 s.'),
    'wind-power': onHurt('atk', 0.2, 6, 1, 'Al recibir un golpe se carga: +20 % de daño durante 6 s.'),
    'seed-sower': { d: 'Al recibir un golpe, siembra semillas que le curan un 4 % de vida.', hurt: pl => heal(pl, 0.04) },
    'tangled-feet': { d: 'Al recibir un golpe se tambalea: esquiva el 20 % de los golpes durante 3 s.',
      hurt: pl => { pl.tangleAt = now(); }, dodge: pl => (pl.tangleAt != null && now() - pl.tangleAt < 3 ? 0.2 : 0) },
    'anger-point': { d: '+10 % de daño; al bajar de la mitad de vida se enfurece: +35 % durante 10 s (una vez cada 30 s).',
      tick: pl => { if (half(pl) && now() - (pl.angryAt == null ? -1e9 : pl.angryAt) >= 30) { pl.angryAt = now(); say(pl, 'anger-point', '#ff6b4d'); } },
      out: pl => (pl.angryAt != null && now() - pl.angryAt < 10 ? 1.35 : 1.1) },
    'berserk': { d: '+10 % de daño; al bajar de la mitad de vida se enfurece: +35 % durante 10 s (una vez cada 30 s).',
      tick: pl => { if (half(pl) && now() - (pl.angryAt == null ? -1e9 : pl.angryAt) >= 30) { pl.angryAt = now(); say(pl, 'berserk', '#ff6b4d'); } },
      out: pl => (pl.angryAt != null && now() - pl.angryAt < 10 ? 1.35 : 1.1) },

    // ---------------- curas, botín y experiencia ----------------
    'pickup': Object.assign(berry(10, 0.05, '+15 % de Pokémonedas y cada 10 s encuentra una baya: recupera un 5 % de vida (si le hace falta).'),
      { start: pl => { pl.coinMul *= 1.15; } }),
    'honey-gather': Object.assign(berry(10, 0.05, '+15 % de Pokémonedas y cada 10 s encuentra una baya: recupera un 5 % de vida (si le hace falta).'),
      { start: pl => { pl.coinMul *= 1.15; } }),
    'harvest': berry(8, 0.07, 'Cada 8 s le crece una baya: recupera un 7 % de vida (si le hace falta).'),
    'gluttony': { d: 'Las curas le curan un 60 % más y cada enemigo derrotado le cura un 0,4 % de vida.', healMul: 1.6, kill: pl => heal(pl, 0.004) },
    'cheek-pouch': { d: 'Las curas le curan un 60 % más y cada enemigo derrotado le cura un 0,4 % de vida.', healMul: 1.6, kill: pl => heal(pl, 0.004) },
    'ripen': { d: 'Las curas le curan el doble y recupera un 0,25 % de vida por segundo.', healMul: 2, start: pl => { pl.regenFlat += pl.maxHp * 0.0025; } },
    'cud-chew': { d: 'Las curas le curan el doble y recupera un 0,25 % de vida por segundo.', healMul: 2, start: pl => { pl.regenFlat += pl.maxHp * 0.0025; } },
    'triage': { d: 'Las curas le curan el doble y recupera un 0,25 % de vida por segundo.', healMul: 2, start: pl => { pl.regenFlat += pl.maxHp * 0.0025; } },
    'symbiosis': { d: 'Las curas le curan el doble y recupera un 0,25 % de vida por segundo.', healMul: 2, start: pl => { pl.regenFlat += pl.maxHp * 0.0025; } },
    'supersweet-syrup': { d: 'Atrae los objetos desde más lejos (+30 % de imán) y las curas le curan un 50 % más.', healMul: 1.5,
      start: pl => { pl.magnet *= 1.3; } },
    'shed-skin': { d: 'Cada 4 s muda: se quita los frenazos y recupera un 3,5 % de vida (si le hace falta).',
      tick: (pl, dt) => { pl.shedT = Math.min(4, (pl.shedT || 0) + dt); if (pl.shedT >= 4 && (pl.slowT > 0 || pl.hp < pl.maxHp * 0.99)) { pl.shedT = 0; pl.slowT = 0; heal(pl, 0.035); } } },
    'frisk': { d: 'Atrae los objetos desde más lejos (+30 % de imán) y +5 % de daño.', out: allOut(1.05), start: pl => { pl.magnet *= 1.3; } },
    'magnet-pull': magnet(1.4, 'Atrae los objetos desde más lejos (+40 % de imán).'),
    'sticky-hold': magnet(1.4, 'Atrae los objetos desde más lejos (+40 % de imán).'),
    'illuminate': magnet(1.4, 'Atrae los objetos desde más lejos (+40 % de imán).'),
    'ball-fetch': { d: '+20 % de Pokémonedas y atrae los objetos desde más lejos (+20 % de imán).', start: pl => { pl.coinMul *= 1.2; pl.magnet *= 1.2; } },
    // (statusCd va además de cdMul: 0,93 × 0,645 = 0,6.)
    'prankster': { d: 'Sus potenciadores y escudos se recargan un 40 % antes; los demás movimientos, un 7 %.', statusCd: 0.645, cdMul: 0.93 },
    'battery': { d: 'Sus movimientos se recargan un 11 % antes.', cdMul: 0.89 },

    // ---------------- las que en los juegos son un lastre: aquí, un intercambio ----------------
    'truant': { d: 'Golpes sueltos y brutales: tarda un 40 % más en recargar, pero cada golpe hace +60 %.', cdMul: 1.4, out: allOut(1.6) },
    'slow-start': { d: 'Arranca lento: el primer minuto hace −40 % de daño y va más despacio; después, +15 % de daño.',
      out: () => (now() < 60 ? 0.6 : 1.15), speed: () => (now() < 60 ? 0.8 : 1) },
    'defeatist': { d: 'Cañón de cristal: +16 % de daño con más de la mitad de vida; con menos, −25 %.', out: pl => (half(pl) ? 0.75 : 1.16) },
    'schooling': { d: 'Forma banco: +8 % de vida y, con más de 1/4 de vida, +10 % de daño.',
      start: pl => { pl.maxHp = Math.round(pl.maxHp * 1.08); pl.hp = pl.maxHp; }, out: pl => (pl.hp > pl.maxHp / 4 ? 1.1 : 1) },
    'zen-mode': { d: '+10 % de daño; con menos de la mitad de vida entra en Modo Daruma: +40 %.', out: pl => (half(pl) ? 1.4 : 1.1) },
    'stance-change': { d: 'Alterna cada 8 s entre filo (+12 % de daño) y escudo (−12 % de daño recibido).',
      tick: (pl, dt) => { pl.stanceT = (pl.stanceT || 0) + dt; if (pl.stanceT >= 8) { pl.stanceT = 0; pl.shieldForm = !pl.shieldForm; } },
      out: pl => (pl.shieldForm ? 1 : 1.12), inMul: pl => (pl.shieldForm ? 0.88 : 1) },
    'imposter': { d: 'Se transforma: pega y aguanta como un Pokémon equilibrado.',
      start: pl => { const m = pl.mon; m.pa = m.sa = m.atk = pl.baseAtk = Math.max(m.atk, 0.95); m.df = Math.max(m.df, 58); m.sd = Math.max(m.sd, 58); } },
    'moody': { d: 'Cada 10 s, +15 % a algo al azar: ataque, ataque especial, velocidad o defensa.',
      tick: (pl, dt) => {
        pl.moodT = (pl.moodT || 0) - dt;
        if (pl.moodT > 0) return;
        pl.moodT = 10; pl.mood = G.U.pick(['atk', 'spa', 'spd', 'def']);
        G.FX.ring(pl.x, pl.y, pl.r * 2.4, pl.r * 1.1, { atk: '#ff6b4d', spa: '#ff8ad8', spd: '#7fe0ff', def: '#b0b8c8' }[pl.mood], 0.35, 2.5);
      },
      out: (pl, m) => (pl.mood === (cls(m) === 's' ? 'spa' : 'atk') ? 1.15 : 1),
      speed: pl => (pl.mood === 'spd' ? 1.15 : 1), inMul: pl => (pl.mood === 'def' ? 0.85 : 1) },
    'klutz': { d: 'Sin objeto, +18 % de daño.', out: pl => (pl.item ? 1 : 1.18) }
  };
  FX['pure-power'] = FX['huge-power'];                // Energía Pura = Potencia
  FX['libero'] = FX['protean'];                       // Líbero = Mutatipo

  /** Pasiva genérica (por si una habilidad nueva aún no tiene efecto): +8 % con los movimientos de su tipo principal. */
  function generic(mon) {
    const t = mon.types[0];
    return { generic: true, d: '+8 % de daño con movimientos de tipo ' + TN(t) + '.', out: (pl, m) => (m.type === t ? 1.08 : 1) };
  }

  /** Efecto de la habilidad `id` para el Pokémon `mon` (nunca null). */
  function of(id, mon) {
    return (id && FX[id]) || generic(mon);
  }

  return { FX, of };
})();
