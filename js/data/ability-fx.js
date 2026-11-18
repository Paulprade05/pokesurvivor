/* ============ ability-fx.js — qué hace cada habilidad en el juego ============
 * (20-10-2026, del PR #236 de TheAdro7, adaptado a este juego. Repaso del 24-10-2026: TODAS las
 * habilidades tienen un efecto propio. 17-11-2026, «habilidades», lo pidió el dueño: casi todas eran
 * «un poco más de daño» o «esquiva un poco» y se repetían; ahora reaccionan a lo que pasa (al recibir un
 * golpe, al derrotar, con poca vida, cada N s), son auras, barreras, ondas, rayos o marcas, y ninguna
 * comparte efecto con otra. Cada legendario y singular lleva una propia que no tiene nadie más
 * (sección LEGENDARIOS, al final; nombres en data/abilities.js).)
 *
 * Los nombres están en data/abilities.js. Equilibrio: `node tools/balance.cjs --habilidades` mide cada
 * una con los Pokémon que la llevan, en «puntos» (10 = una carta de subir de nivel: +10 % de daño,
 * −6 % de daño recibido, +7 % de velocidad...); las normales rondan los 13 y las de legendario, 20-30.
 *
 * Ganchos (todos opcionales):
 *   start(pl)             al empezar la partida (lo que NO depende de la fase: críticos, monedas, imán...)
 *   mon(m)                cambia los stats de la fase (Potencia...): al empezar y otra vez en cada
 *                         evolución, sobre la fase nueva (begin / stage, abajo; 24-10-2026)
 *   regenK                regenera esa parte de la vida máxima por segundo (crece con ella: player.js regen)
 *   hpMul                 × a la vida máxima (y a lo que sube al evolucionar)
 *   out(pl, m, e)         × al daño que hace el movimiento m al enemigo e (combat.js)
 *   hit(pl, e, m)         ha golpeado a e (después del daño)
 *   inMul(pl, type, cls, src)  × al daño que recibe (cls 'p' físico, 's' especial; pl.touchHit: cuerpo a
 *                         cuerpo; src: quien pega, si es un enemigo —foeOf—)
 *   absorb: 'tipo'        ese tipo no le hace daño: le cura un poco
 *   dodge(pl, type, cls)  probabilidad de esquivar un golpe
 *   hurt(pl, type, cls, src)  le acaban de golpear (pl.touchHit: cuerpo a cuerpo)
 *   taken(pl, d, src)     daño final de un golpe (después de todo): lo que devuelve es lo que quita (17-11)
 *   fall(pl)              iba a caer: true si se salva (pone él la vida) (17-11)
 *   contact(pl, e)        un enemigo le ha golpeado cuerpo a cuerpo
 *   tick(pl, dt)          cada fotograma
 *   kill(pl, e)           ha caído un enemigo
 *   speed(pl)             × a la velocidad
 *   healMul               × a lo que le curan
 *   statusCd              × a la recarga de los potenciadores y escudos · cdMul × a todas
 *   critMul               daño del crítico (normal ×1,5)
 *   summon: 'clima'       pone su clima al empezar y cada 3 min (si no hay otro)
 *   block: s              (sólo para balance.cjs) para un golpe entero cada s segundos (en inMul)
 *   aura                  (sólo para balance.cjs) su tick daña o frena enemigos: se mide en el combate de verdad
 *   pts                   (sólo para balance.cjs) puntos «a ojo» de lo que no se puede medir (barreras, salvarse...)
 *   leg                   habilidad propia de un legendario o singular (tests/habilidades.test.cjs)
 *   levitate / steady / sturdy / sheer / serene / lavaProof / trapProof / damp / touchPoison  (marcas)
 * Barrera (pl.abShield): vida de más que se gasta antes que la de verdad (player.js hurt; la ponen shield()).
 * Las descripciones van en español; las traducciones, en lang-en.js. d2 es una segunda frase.
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

  // ---------------- motor de las habilidades activas (17-11-2026) ----------------
  /** Quien pega, si es un enemigo de verdad (src de player.hurt: también puede ser un texto). */
  const foeOf = src => (src && typeof src === 'object' && typeof src.hurt === 'function' && !src.dead ? src : null);
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  /**
   * Daño de una habilidad: k «golpes» de su nivel. Crece con el ataque del Pokémon (cartas, mejoras,
   * evolución) y su nivel, como un movimiento: k = 1 es un golpe flojo de un ataque normal.
   */
  const pow = (pl, k) => k * (pl.atk || 1) * (10 + (pl.level || 1) * 0.9);
  const live = pl => !pl.remote && !pl.dead;
  const foes = (pl, r, x = pl.x, y = pl.y) => ((G.EnemyMgr && G.EnemyMgr.queryCircle) ? G.EnemyMgr.queryCircle(x, y, r) : []).filter(e => !e.dead);
  const S = pl => pl.abS || (pl.abS = {});
  /** Cada s segundos (acumula dt): cuántas veces toca en este paso (0 casi siempre; balance.cjs va en pasos de 3 s). */
  function every(pl, key, s, dt) { const o = S(pl); o[key] = (o[key] || 0) + dt; if (o[key] < s) return 0; const n = Math.floor(o[key] / s); o[key] -= n * s; return n; }
  /** Una vez cada s segundos de partida: true si ya toca (y lo apunta). */
  function cool(pl, key, s) { const o = S(pl), t = now(); if (o[key] != null && t - o[key] < s) return false; o[key] = t; return true; }
  const ago = (pl, key) => { const v = S(pl)[key]; return v == null ? 1e9 : now() - v; };
  /** Golpe de la habilidad a e: k golpes (pow), con su color y empujón. */
  function strike(pl, e, k, col, knock = 0) {
    if (!e || e.dead) return;
    const d = pow(pl, k);
    e.hurt(d, col, e.x - pl.x, e.y - pl.y, knock);
    pl.dmgDealt = (pl.dmgDealt || 0) + d;
  }
  /** Onda alrededor: daña (k) a todo lo que hay a menos de r y le pasa fn. */
  function nova(pl, r, k, col, fn, knock = 140) {
    if (!live(pl)) return;
    G.FX.ring(pl.x, pl.y, 8, r, col, 0.45, 5);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col, 10, 160);
    for (const e of foes(pl, r)) { if (k) strike(pl, e, k, col, knock); if (fn && !e.dead) fn(e); }
  }
  /** Rayos del cielo a n enemigos al azar a menos de r (los más cercanos, si near). */
  function zap(pl, n, r, k, col, pal, fn, near) {
    if (!live(pl)) return [];
    const l = foes(pl, r);
    if (near) l.sort((a, b) => dist2(a, pl) - dist2(b, pl));
    else for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = l[i]; l[i] = l[j]; l[j] = t; }
    const hit = l.slice(0, n);
    for (const e of hit) {
      G.FX.beam(e.x, e.y - 220, Math.PI / 2, 220, 8, col, { pal });
      G.FX.ring(e.x, e.y, 4, 34, col, 0.3, 3);
      if (k) strike(pl, e, k, col, 60);
      if (fn && !e.dead) fn(e);
    }
    return hit;
  }
  /** Rayo recto desde el Pokémon hacia donde apunta (pl.aim): daña a todo lo que toca. */
  function lance(pl, len, w, k, col, pal, fn) {
    if (!live(pl)) return;
    const a = pl.aim || 0, ca = Math.cos(a), sa = Math.sin(a);
    G.FX.beam(pl.x, pl.y - pl.bodyH * 0.5, a, len, w, col, { pal });
    for (const e of foes(pl, len)) {
      const dx = e.x - pl.x, dy = e.y - pl.y, t = dx * ca + dy * sa;
      if (t < 0 || t > len || Math.abs(dx * sa - dy * ca) > w / 2 + (e.r || 12)) continue;
      strike(pl, e, k, col, 80);
      if (fn && !e.dead) fn(e);
    }
  }
  /** Le pasa fn a los enemigos a menos de r cada s segundos (auras). */
  function aura(pl, dt, key, s, r, fn) {
    if (!live(pl)) return;
    for (let n = every(pl, key, s, dt); n > 0; n--) for (const e of foes(pl, r)) fn(e);
  }
  /** Barrera: k de la vida máxima que se gasta antes (player.js hurt). */
  function shield(pl, k, col) {
    pl.abShield = Math.max(pl.abShield || 0, pl.maxHp * k);
    if (G.FX.ring) G.FX.ring(pl.x, pl.y, pl.r * 2.6, pl.r * 1.4, col || '#bfe8ff', 0.4, 3);
  }
  /** Marca a e: recibe ×k de tus golpes durante dur s (outMark). */
  const mark = (e, k, dur) => { e.abMark = Math.max(e.abMark || 0, k); e.abMarkT = now() + dur; };
  const marked = e => (e && e.abMarkT > now() ? e.abMark : 1);

  // ---------------- plantillas ----------------
  /**
   * Espesura, Mar Llamas, Torrente, Enjambre: su tipo pega más, y mucho más con poca vida; y con menos de
   * la mitad de vida, cada 6 s suelta una onda de su tipo (17-11-2026: antes sólo era daño).
   */
  const pinch = (id, type, col, fn, k = 12, kLow = 35) => ({ d: '+6 % de daño; con movimientos de tipo ' + TN(type) + ', +' + k + ' % (con menos de la mitad de vida, +' + kLow + ' %).',
    d2: 'Con menos de la mitad de vida, cada 6 s suelta una onda de su tipo alrededor.',
    out: (pl, m) => (m.type === type ? 1 + (half(pl) ? kLow : k) / 100 : 1.06),
    tick: (pl, dt) => { if (half(pl) && every(pl, 'pinch', 6, dt)) { say(pl, id, col); nova(pl, 130, 3, col, fn); } } });
  const boost = (type, k = 15) => ({ d: '+' + k + ' % de daño con movimientos de tipo ' + TN(type) + '.',
    out: (pl, m) => (m.type === type ? 1 + k / 100 : 1) });
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
  const steadyAnd = extra => Object.assign({}, steady, extra);
  /** Las de contacto (Elec. Estática, Cuerpo Llama...): le hacen menos cuerpo a cuerpo y quien le toca lo paga. */
  const TOUCH_D2 = 'Recibe un 12 % menos de daño cuerpo a cuerpo.';
  const touchIn = (pl) => (touch(pl) ? 0.88 : 1);
  const contact = (fn, d, extra = {}) => Object.assign({ d, d2: TOUCH_D2, contact: fn, inMul: touchIn }, extra);
  const dmgBack = pl => 20 + pl.level * 6;
  /** Escudos que paran un golpe entero cada `every` s (Disfraz, Cara de Hielo; only: sólo los físicos 'p'). */
  const guard = (id, sec, d, col, only, then) => ({ d, block: sec, blockCls: only || '',
    inMul: (pl, type, c) => {
      if (only && c !== only) return 1;
      const t = now();
      if (pl.blockAt != null && t - pl.blockAt < sec) return 1;
      pl.blockAt = t;
      say(pl, id, col);
      if (then) then(pl);
      return 0;
    } });
  const ranged = (k, d) => ({ d, inMul: pl => (touch(pl) ? 1 : k) });
  const magnet = (k, d) => ({ d, start: pl => { pl.magnet *= k; } });
  const regen = (k, d) => ({ d, regenK: k });
  /** Una baya cada `every` s que se come en cuanto le falta vida: cura k. */
  const berry = (sec, k, d) => ({ d, tick: (pl, dt) => {
    pl.berryT = Math.min(sec, (pl.berryT || 0) + dt);
    if (pl.berryT >= sec && pl.hp < pl.maxHp * 0.99) { pl.berryT = 0; heal(pl, k); }
  } });
  /** Al recibir un golpe, +amount de stat durante dur s (hasta max veces). */
  const onHurt = (stat, amount, dur, max, d, cond) => ({ d, hurt: (pl, type, c) => { if (!cond || cond(pl, type, c)) pl.addBuff(stat, amount, dur, max); } });
  /** Lo de quien le pega cuerpo a cuerpo y está cerca (para las auras de proximidad con src). */
  const PSY0 = '#ff8ad8';
  const nearSrc = (pl, src, r) => { const f = foeOf(src); return !!f && dist2(f, pl) <= r * r; };

  const FX = {
    // ---------------- más daño ----------------
    'overgrow': pinch('overgrow', 'grass', '#6fd36a', e => e.applySlow(0.45, 2)),
    'blaze': pinch('blaze', 'fire', '#ff7b3d', e => e.applyBurn(2)),
    'torrent': pinch('torrent', 'water', '#5aa8ff', e => e.applySlow(0.3, 1.5)),
    // (Casi todos los de Bicho tienen otro tipo con mejores ataques: Enjambre pega algo más.)
    'swarm': pinch('swarm', 'bug', '#a8c83a', e => e.applyPoison(1), 18, 45),
    'steely-spirit': boost('steel', 25),
    // (Los «-génesis» ponen un campo: aquí, alrededor del Pokémon, siempre.)
    'grassy-surge': { d: '+12 % de daño con movimientos de tipo Planta.', d2: 'Su campo de hierba le cura un 0,5 % de vida por segundo.',
      out: (pl, m) => (m.type === 'grass' ? 1.12 : 1), regenK: 0.005 },
    'electric-surge': { d: '+12 % de daño con movimientos de tipo Eléctrico.', d2: 'Su campo eléctrico da una descarga cada 1,5 s a un enemigo cercano y lo frena.', aura: true,
      out: (pl, m) => (m.type === 'electric' ? 1.12 : 1),
      tick: (pl, dt) => { if (!live(pl)) return; for (let n = every(pl, 'esurge', 1.5, dt); n > 0; n--) zap(pl, 1, 150, 1.2, '#ffe14d', 'electric', e => e.applySlow(0.4, 1)); } },
    'psychic-surge': { d: '+12 % de daño con movimientos de tipo Psíquico.', d2: 'Su campo psíquico frena un 25 % a los enemigos que se le acercan y les hace daño cada segundo.', aura: true,
      out: (pl, m) => (m.type === 'psychic' ? 1.12 : 1), tick: (pl, dt) => { aura(pl, dt, 'psurge', 0.5, 110, e => e.applySlow(0.25, 0.7)); aura(pl, dt, 'psurgeD', 1, 110, e => strike(pl, e, 0.5, PSY0)); } },
    'misty-surge': { d: 'Recibe un 10 % menos de daño y la mitad de daño de Dragón.', inMul: (pl, type) => (type === 'dragon' ? 0.5 : 0.9) },
    'rock-head': { d: 'Recibe un 15 % menos de daño cuerpo a cuerpo.', d2: 'Sus cabezazos (cuerpo a cuerpo y embestidas) aturden un momento 1 de cada 4 veces.',
      inMul: pl => (touch(pl) ? 0.85 : 1), hit: (pl, e, m) => { if (m && close(m) && Math.random() < 0.25) e.applyStun(0.35); } },
    'wonder-skin': { d: 'Esquiva el 22 % de los golpes a distancia (disparos y zonas).', dodge: pl => (touch(pl) ? 0 : 0.22) },
    'steelworker': { d: 'Recibe un 8 % menos de daño.', d2: '+15 % de daño con movimientos de tipo Acero.',
      inMul: allIn(0.92), out: (pl, m) => (m.type === 'steel' ? 1.15 : 1) },
    'water-bubble': { d: '+12 % de daño de tipo Agua y recibe la mitad de daño de Fuego.',
      out: (pl, m) => (m.type === 'water' ? 1.12 : 1), inMul: (pl, type) => (type === 'fire' ? 0.5 : 1) },
    'technician': { d: '+40 % de daño con los ataques de golpes flojos.', out: (pl, m) => ((m.def || m).dmg <= 12 ? 1.4 : 1) },
    // Potencia y Energía Pura: en los juegos doblan el Ataque; aquí sus golpes físicos pegan con su
    // mejor ataque y un 20 % más (Azumarill tiene más Ataque Especial que Ataque).
    'huge-power': { d: 'Sus movimientos físicos pegan con su mejor ataque y un 20 % más.',
      mon: m => { m.pa = Math.max(m.pa, m.sa) * 1.2; m.atk = Math.max(m.pa, m.sa); } },
    'hustle': { d: '+30 % de daño con movimientos físicos, pero 1 de cada 8 golpes físicos sale flojo.',
      out: (pl, m) => (cls(m) !== 'p' ? 1 : Math.random() < 1 / 8 ? 0.4 : 1.3) },
    'guts': { d: '+12 % de daño con movimientos físicos; con menos de la mitad de vida, +40 %.',
      out: (pl, m) => (cls(m) === 'p' ? (half(pl) ? 1.4 : 1.12) : 1) },
    'toxic-boost': { d: '+8 % de daño; sus golpes envenenan 1 de cada 3 veces y hace +30 % de daño a los envenenados.',
      out: (pl, m, e) => (e && e.poison > 0 ? 1.3 : 1.08), hit: (pl, e) => { if (Math.random() < 1 / 3) e.applyPoison(1); } },
    'flare-boost': { d: '+10 % de daño; con menos de la mitad de vida, +40 % de daño especial y sus golpes queman.',
      out: (pl, m) => (half(pl) && cls(m) === 's' ? 1.4 : 1.1), hit: (pl, e) => { if (half(pl)) e.applyBurn(1); } },
    'adaptability': { d: '+25 % de daño con los movimientos de sus tipos.', out: (pl, m) => (pl.mon.types.includes(m.type) ? 1.25 : 1) },
    'stalwart': steadyAnd({ d2: '+15 % de daño con los movimientos de sus tipos.', out: (pl, m) => (pl.mon.types.includes(m.type) ? 1.15 : 1) }),
    // (Mutatipo: en los juegos cambia a su tipo el de cada ataque: aquí, lo de otro tipo pega como propio.)
    'protean': { d: '+22 % de daño con los movimientos que no son de sus tipos; +6 % con los suyos.',
      out: (pl, m) => (pl.mon.types.includes(m.type) ? 1.06 : 1.22) },
    'quark-drive': { d: 'Cada 20 s se sobrecarga: 6 s con +35 % de daño y +20 % de velocidad.',
      tick: (pl) => { if (!(ago(pl, 'quark') < 20)) { S(pl).quark = now(); say(pl, 'quark-drive', '#7fe0ff'); G.FX.ring(pl.x, pl.y, pl.r, 90, '#7fe0ff', 0.4, 4); } },
      out: pl => (ago(pl, 'quark') < 6 ? 1.35 : 1), speed: pl => (ago(pl, 'quark') < 6 ? 1.2 : 1) },
    'power-spot': { d: '+16 % de daño a los enemigos que tiene cerca (a menos de 150 px).',
      out: (pl, m, e) => (e && dist2(e, pl) < 150 * 150 ? 1.16 : 1) },
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
    'protosynthesis': { d: 'Cada 25 s se activa 8 s: +30 % de daño y recibe un 15 % menos. Con sol, siempre activa.',
      tick: pl => { if (!(ago(pl, 'proto') < 25)) { S(pl).proto = now(); say(pl, 'protosynthesis', '#ffd36b'); } },
      out: pl => (wx() === 'sun' || ago(pl, 'proto') < 8 ? 1.3 : 1), inMul: pl => (wx() === 'sun' || ago(pl, 'proto') < 8 ? 0.85 : 1) },
    'flower-gift': { d: '+8 % de daño y recibe un 4 % menos; con sol, +25 % de daño y un 12 % menos.',
      out: () => (wx() === 'sun' ? 1.25 : 1.08), inMul: () => (wx() === 'sun' ? 0.88 : 0.96) },
    'forecast': { d: '+10 % de daño; con cualquier clima, +35 %.', out: () => (wx() ? 1.35 : 1.1) },
    'sniper': { d: 'Sus golpes críticos hacen ×2,2 de daño (en vez de ×1,5).', d2: '+5 % de probabilidad de golpe crítico.',
      critMul: 2.2, start: pl => { pl.critChance += 0.05; } },
    'super-luck': { d: '+15 % de probabilidad de golpe crítico y críticos un 30 % más fuertes.',
      start: pl => { pl.critChance += 0.15; pl.critDmg = (pl.critDmg || 0) + 0.3; } },
    'compound-eyes': { d: '+22 % de probabilidad de golpe crítico.', start: pl => { pl.critChance += 0.22; } },
    'keen-eye': { d: '+10 % de probabilidad de golpe crítico.', d2: '+10 % de daño con todo lo que no es cuerpo a cuerpo ni embestida.',
      out: (pl, m) => (close(m) ? 1 : 1.1), start: pl => { pl.critChance += 0.1; } },
    'moxie': { d: 'Cada enemigo derrotado le da +0,5 % de daño (hasta +18 %).',
      kill: pl => { pl.moxie = Math.min(0.18, (pl.moxie || 0) + 0.005); }, out: pl => 1 + (pl.moxie || 0) },
    // Ultraimpulso (los Ultraentes): una racha de bajas les acelera.
    'beast-boost': { d: 'Cada enemigo que derrota le da 1,5 s de frenesí: +8 % de daño y +8 % de velocidad.',
      kill: pl => { S(pl).beast = now(); }, out: pl => (ago(pl, 'beast') < 1.5 ? 1.08 : 1), speed: pl => (ago(pl, 'beast') < 1.5 ? 1.08 : 1) },
    'supreme-overlord': { d: '+0,3 % de daño por cada enemigo derrotado (hasta +12 %) y +8 % más por cada jefe.',
      kill: (pl, e) => { pl.lordK = (pl.lordK || 0) + (e && e.boss ? 0.08 : 0); pl.lordN = Math.min(0.12, (pl.lordN || 0) + 0.003); },
      out: pl => 1 + (pl.lordN || 0) + (pl.lordK || 0) },
    'receiver': { d: 'Cada 20 enemigos derrotados recoge su fuerza: 10 s con +30 % de daño.',
      kill: pl => { const o = S(pl); o.recN = (o.recN || 0) + 1; if (o.recN >= 20) { o.recN = 0; o.rec = now(); say(pl, 'receiver', '#ffb04d'); } },
      out: pl => (ago(pl, 'rec') < 10 ? 1.3 : 1) },
    // Sólo de los que entraron el 06-11-2026 (Toedscool y Pecharunt).
    'mycelium-might': { d: '+10 % de daño; a los enemigos envenenados, +25 %.', out: (pl, m, e) => (e && e.poison > 0 ? 1.25 : 1.1) },
    'rocky-payload': boost('rock', 20),
    // Sólo de megaevoluciones (06-11-2026): sin dos golpes, para no doblar números de daño.
    'parental-bond': { d: '+20 % de daño: la cría también golpea.', out: allOut(1.2) },
    'piercing-drill': { d: '+12 % de daño; con ataques cuerpo a cuerpo y embestidas, +25 %.', out: (pl, m) => (close(m) ? 1.25 : 1.12) },
    'eelevate': { d: 'Flota, y cada enemigo derrotado le da +0,5 % de daño (hasta +15 %).', levitate: true,
      kill: pl => { pl.eelK = Math.min(0.15, (pl.eelK || 0) + 0.005); }, out: pl => 1 + (pl.eelK || 0) },
    'merciless': { d: '+35 % de daño a los enemigos envenenados o con menos de la mitad de vida.',
      out: (pl, m, e) => (e && (e.poison > 0 || e.hp < e.maxHp * 0.5) ? 1.35 : 1) },
    'analytic': { d: '+35 % de daño a enemigos con menos de la mitad de vida.', out: (pl, m, e) => (e && e.hp < e.maxHp * 0.5 ? 1.35 : 1) },
    'stakeout': { d: '+40 % de daño a los enemigos que aún tienen la vida llena.', out: (pl, m, e) => (e && e.hp >= e.maxHp * 0.99 ? 1.4 : 1) },
    'mold-breaker': { d: '+10 % de daño; a los jefes, +35 %.', out: (pl, m, e) => (e && e.boss ? 1.35 : 1.1) },
    'infiltrator': { d: '+12 % de daño y sus golpes rompen los escudos de los enemigos.', out: allOut(1.12),
      hit: (pl, e) => { if (!e.remote && e.shield > 0) { e.shield = 0; e.shieldT = 0; } } },
    'rivalry': { d: '+10 % de daño; a los enemigos que comparten un tipo con él, +30 %.',
      out: (pl, m, e) => (e && (e.types || []).some(t => pl.mon.types.includes(t)) ? 1.3 : 1.1) },
    'justified': { d: '+10 % de daño; a los Pokémon de tipo Siniestro, +40 %.', d2: 'Un golpe de tipo Siniestro le enciende: 8 s con +25 % de daño.',
      hurt: (pl, type) => { if (type === 'dark') S(pl).just = now(); },
      out: (pl, m, e) => (e && (e.types || []).includes('dark') ? 1.4 : 1.1) * (ago(pl, 'just') < 8 ? 1.25 : 1) },
    // Más y Menos: cargas opuestas.
    'plus': { d: 'Carga positiva: cada golpe que recibe le da +10 % de daño especial durante 12 s (hasta 5 veces).',
      hurt: pl => pl.addBuff('satk', 0.1, 12, 5) },
    'minus': { d: '+12 % de daño y sus golpes especiales frenan un 25 % a los enemigos.',
      out: allOut(1.12), hit: (pl, e, m) => { if (cls(m) === 's') e.applySlow(0.25, 1.2); } },
    'hyper-cutter': { d: '+16 % de daño con movimientos físicos.', out: (pl, m) => (cls(m) === 'p' ? 1.16 : 1) },
    // Descarga: mira las defensas del enemigo y pega por el lado flojo.
    'download': { d: 'Analiza a cada enemigo: +22 % de daño si lo golpea por su defensa más floja (física o especial).',
      out: (pl, m, e) => { const p = e && e.mon; if (!p || !p.df || !p.sd) return 1.05; const c = cls(m); return (c === 's' && p.sd < p.df) || (c === 'p' && p.df < p.sd) ? 1.22 : 1; } },
    'no-guard': { d: 'Todo acierta: +20 % de daño hecho, pero recibe un 5 % más.', out: allOut(1.2), inMul: allIn(1.05) },
    'skill-link': { d: '+25 % de daño con los movimientos de varios golpes y +10 % con los demás.', out: (pl, m) => ((m.count || 1) >= 2 || m.bounce ? 1.25 : 1.1) },
    'long-reach': { d: 'Ataca desde lejos: recibe un 15 % menos de daño cuerpo a cuerpo.', inMul: pl => (touch(pl) ? 0.85 : 1) },
    'normalize': { d: '+20 % de daño con movimientos de tipo Normal.', out: (pl, m) => (m.type === 'normal' ? 1.2 : 1) },
    // (Piel Helada y Piel Feérica vuelven Hielo / Hada sus movimientos Normales: aquí, los dos tipos pegan más.)
    'refrigerate': { d: '+10 % de daño; con movimientos de tipo Normal y Hielo, +20 %.', out: (pl, m) => (m.type === 'normal' || m.type === 'ice' ? 1.2 : 1.1) },
    'pixilate': { d: '+15 % de daño con movimientos de tipo Normal y Hada.', out: (pl, m) => (m.type === 'normal' || m.type === 'fairy' ? 1.15 : 1) },
    // Corrosión (24-10-2026: valía 7,7 con 1 de cada 5): en los juegos envenena incluso a los de tipo Acero
    // y Veneno; aquí su veneno corroe: sus ataques de tipo Veneno no pierden fuerza contra ellos.
    'corrosion': { d: 'Sus golpes envenenan a menudo (3 de cada 10) y sus movimientos de tipo Veneno dañan del todo a los de tipo Acero y Veneno.',
      out: (pl, m, e) => {
        const t = m.type === 'poison' && e && e.types;
        if (!t || !(t.includes('steel') || t.includes('poison'))) return 1;
        return mult('poison', t.filter(x => x !== 'steel' && x !== 'poison')) / Math.max(0.3, mult('poison', t));
      },
      hit: (pl, e) => { if (Math.random() < 0.3) e.applyPoison(1); } },
    'toxic-chain': { d: 'Sus golpes envenenan a veces (1 de cada 3).', hit: (pl, e) => { if (Math.random() < 1 / 3) e.applyPoison(1); } },
    'poison-touch': { d: 'Sus ataques cuerpo a cuerpo y embestidas envenenan.', touchPoison: true },
    'magician': { d: '+10 % de daño.', d2: 'Los enemigos que derrota sueltan a veces (1 de cada 8) una Pokémoneda.', out: allOut(1.1),
      kill: (pl, e) => { if (Math.random() < 1 / 8 && G.Pickups && e) G.Pickups.drop('coin', e.x, e.y, 1); } },
    'simple': { d: '+8 % de daño y +8 % de velocidad.', out: allOut(1.08), speed: () => 1.08 },
    // Calco: copia el tipo de quien le pega.
    'trace': { d: 'Calca la fuerza de quien le pega: tras recibir un golpe, +15 % de daño durante 6 s (+35 % con los movimientos de su mismo tipo).',
      hurt: (pl, type) => { if (type) { S(pl).traceT = type; } S(pl).trace = now(); },
      out: (pl, m) => (ago(pl, 'trace') < 6 ? (m.type === S(pl).traceT ? 1.35 : 1.15) : 1) },
    'commander': { d: 'Da órdenes: cada 8 s marca al enemigo más fuerte de cerca, que recibe +40 % de su daño durante 5 s.', d2: 'Y su compañero embiste: una onda que daña a los de alrededor.', aura: true,
      out: (pl, m, e) => marked(e),
      tick: (pl, dt) => {
        if (!live(pl) || !every(pl, 'cmd', 8, dt)) return;
        const l = foes(pl, 260).sort((a, b) => (b.boss - a.boss) || (b.maxHp - a.maxHp));
        if (l[0]) { mark(l[0], 1.4, 5); G.FX.ring(l[0].x, l[0].y, 30, 8, '#ffcf4d', 0.5, 3); }
        nova(pl, 130, 3, '#7fb8ff', null, 220);
      } },
    'thermal-exchange': { d: 'El Fuego le hace la mitad de daño y sus movimientos físicos hacen +8 %.',
      inMul: (pl, type) => (type === 'fire' ? 0.5 : 1), out: (pl, m) => (cls(m) === 'p' ? 1.08 : 1) },
    'zero-to-hero': { d: 'Pasado el primer minuto se transforma en héroe: +16 % de daño.', out: () => (now() >= 60 ? 1.16 : 1) },

    // ---------------- velocidad ----------------
    'speed-boost': { d: 'Cada 10 segundos va un 2 % más rápido (hasta +12 %).',
      tick: (pl, dt) => { pl.boostT = (pl.boostT || 0) + dt; if (pl.boostT >= 10) { pl.boostT = 0; pl.abSpd = Math.min(0.12, (pl.abSpd || 0) + 0.02); } },
      speed: pl => 1 + (pl.abSpd || 0) },
    'swift-swim': rush('rain', 'lluvia'), 'chlorophyll': rush('sun', 'sol'),
    'sand-rush': rush('sand', 'tormenta de arena'), 'slush-rush': rush('snow', 'nieve'),
    'run-away': { d: '+8 % de velocidad; con menos de la mitad de vida, +30 %.', speed: pl => (half(pl) ? 1.3 : 1.08) },
    'quick-feet': steadyAnd({ d2: '+8 % de velocidad; con menos de la mitad de vida, +30 %.', speed: pl => (half(pl) ? 1.3 : 1.08) }),
    'light-metal': { d: '+12 % de velocidad.', speed: () => 1.12 },
    'propeller-tail': { d: '+10 % de velocidad y +25 % de daño con las embestidas.', speed: () => 1.1, out: (pl, m) => (m.kind === 'dash' ? 1.25 : 1) },
    'dancer': { d: 'Cada 5 s da un giro de baile: 2 s con +15 % de velocidad y un remolino que frena a los de alrededor.', aura: true,
      tick: (pl, dt) => { if (live(pl) && every(pl, 'dance', 5, dt)) { S(pl).dance = now(); nova(pl, 90, 0, '#ff9ad6', e => e.applySlow(0.4, 1.5)); } },
      speed: pl => (ago(pl, 'dance') < 2 ? 1.15 : 1) },
    'unburden': { d: 'Sin objeto va un 15 % más rápido.', speed: pl => (pl.item ? 1 : 1.15) },
    'gale-wings': { d: 'Con la vida casi llena, +10 % de velocidad y +15 % de daño con movimientos de tipo Volador.',
      speed: pl => (nearFull(pl) ? 1.1 : 1), out: (pl, m) => (m.type === 'flying' && nearFull(pl) ? 1.15 : 1) },
    'wind-rider': { d: '+8 % de velocidad; con cualquier clima, +30 %.', speed: () => (wx() ? 1.3 : 1.08) },
    'wimp-out': { d: 'Con menos de la mitad de vida sale corriendo: +35 % de velocidad y recibe un 20 % menos de daño.',
      speed: pl => (half(pl) ? 1.35 : 1), inMul: pl => (half(pl) ? 0.8 : 1) },
    'emergency-exit': { d: 'Al bajar de la mitad de vida sale disparado: 2 s sin recibir daño y 5 s con +50 % de velocidad (cada 40 s).',
      tick: pl => { if (half(pl) && cool(pl, 'exit', 40)) { pl.invuln = Math.max(pl.invuln || 0, 2); say(pl, 'emergency-exit', '#bfe8ff'); } },
      speed: pl => (ago(pl, 'exit') < 5 ? 1.5 : 1), pts: 5 },
    'hunger-switch': { d: 'Alterna cada 10 s entre hambre (+15 % de daño) y saciedad (+9 % de velocidad).',
      tick: (pl, dt) => { pl.hungerT = (pl.hungerT || 0) + dt; if (pl.hungerT >= 10) { pl.hungerT = 0; pl.hangry = !pl.hangry; } },
      out: pl => (pl.hangry ? 1 : 1.15), speed: pl => (pl.hangry ? 1.09 : 1) },

    // ---------------- climas ----------------
    'drought': Object.assign(summon('sun', 'sol'), { d2: 'Con sol, sus movimientos de tipo Fuego y Tierra hacen +30 %.', out: (pl, m) => ((m.type === 'ground' || m.type === 'fire') && wx() === 'sun' ? 1.3 : 1) }),
    'drizzle': Object.assign(summon('rain', 'lluvia'), { d2: '+20 % de daño con movimientos de tipo Agua.', out: (pl, m) => (m.type === 'water' ? 1.2 : 1) }),
    'sand-stream': Object.assign(summon('sand', 'una tormenta de arena'), { d2: 'Con tormenta de arena, la arena daña cada segundo a los enemigos de alrededor.', aura: true,
      tick: (pl, dt) => { if (wx() === 'sand') aura(pl, dt, 'sand', 1, 130, e => strike(pl, e, 0.8, '#d8b86a')); } }),
    'snow-warning': Object.assign(summon('snow', 'nieve'), { d2: '+20 % de daño con movimientos de tipo Hielo.', out: (pl, m) => (m.type === 'ice' ? 1.2 : 1) }),
    'rain-dish': wheal('rain', 'lluvia'), 'ice-body': wheal('snow', 'nieve'),
    'sand-veil': veil('sand', 'tormenta de arena'), 'snow-cloak': veil('snow', 'nieve'),
    'dry-skin': absorb('water', { d2: 'El Fuego le hace un 35 % más de daño.', inMul: (pl, type) => (type === 'fire' ? 1.35 : 1) }),
    'hydration': steadyAnd({ d2: 'Recupera un 0,6 % de vida por segundo; con lluvia, un 2 %.',
      tick: (pl, dt) => { heal(pl, (wx() === 'rain' ? 0.02 : 0.006) * dt); } }),
    'leaf-guard': { d: 'Recibe un 7 % menos de daño; con sol, un 25 % menos y nada le frena.',
      tick: pl => { if (wx() === 'sun') pl.slowT = 0; }, inMul: () => (wx() === 'sun' ? 0.75 : 0.93) },
    'cloud-nine': { d: 'Recibe un 10 % menos de daño y el clima no potencia los ataques que le hacen.',
      inMul: (pl, type) => 0.9 / Math.max(1, type ? G.Weather.mult(type) : 1) },

    // ---------------- defensa ----------------
    'levitate': { d: 'Flota: no le afectan el agua, la lava ni las trampas, y la Tierra le hace muy poco.', d2: 'Esquiva el 12 % de los golpes cuerpo a cuerpo.',
      levitate: true, inMul: (pl, type) => (type === 'ground' ? 0.3 : 1), dodge: pl => (touch(pl) ? 0.12 : 0) },
    'thick-fat': { d: 'Recibe la mitad de daño de Fuego y Hielo.', d2: 'Recibe un 4 % menos de daño.', inMul: (pl, type) => (type === 'fire' || type === 'ice' ? 0.5 : 0.96) },
    'heatproof': { d: 'Recibe la mitad de daño de Fuego y la lava no le quema.', lavaProof: true,
      inMul: (pl, type) => (type === 'fire' ? 0.5 : 1) },
    'water-veil': { d: 'La lava no le quema y recibe la mitad de daño de Fuego.', d2: 'Recibe un 4 % menos de daño.',
      lavaProof: true, inMul: (pl, type) => (type === 'fire' ? 0.5 : 0.96) },
    'magma-armor': { d: 'La lava no le quema y recibe un 20 % menos de daño de Agua y Hielo.',
      lavaProof: true, inMul: (pl, type) => (type === 'water' || type === 'ice' ? 0.8 : 1) },
    'immunity': { d: 'El Veneno apenas le hace daño.', d2: 'Recibe un 6 % menos de daño.', inMul: (pl, type) => (type === 'poison' ? 0.3 : 0.94) },
    'purifying-salt': steadyAnd({ d2: 'Recibe la mitad de daño de Fantasma y un 6 % menos del resto.', inMul: (pl, type) => (type === 'ghost' ? 0.5 : 0.94) }),
    'water-compaction': { d: 'Recibe un 35 % menos de daño de Agua.', d2: 'Cada golpe de Agua le sube la defensa un 10 % durante 8 s (hasta 3 veces).',
      inMul: (pl, type) => (type === 'water' ? 0.65 : 1), hurt: (pl, type) => { if (type === 'water') pl.addBuff('def', 0.1, 8, 3); } },
    'water-absorb': absorb('water', { d2: 'Recupera un 0,2 % de vida por segundo.', regenK: 0.002 }),
    'storm-drain': absorb('water', { d2: '+10 % de daño con movimientos de tipo Agua.', out: (pl, m) => (m.type === 'water' ? 1.1 : 1) }),
    'volt-absorb': absorb('electric', { d2: 'Recupera un 0,3 % de vida por segundo.', regenK: 0.003 }),
    'lightning-rod': absorb('electric', { d2: '+12 % de daño con movimientos especiales.', out: (pl, m) => (cls(m) === 's' ? 1.12 : 1) }),
    'motor-drive': absorb('electric', { d2: '+6 % de velocidad.', speed: () => 1.06 }),
    'flash-fire': absorb('fire', { d2: '+15 % de daño con movimientos de tipo Fuego.', out: (pl, m) => (m.type === 'fire' ? 1.15 : 1) }),
    'well-baked-body': absorb('fire'),
    'sap-sipper': absorb('grass', { d2: 'Recibe un 6 % menos de daño cuerpo a cuerpo.', inMul: pl => (touch(pl) ? 0.94 : 1) }),
    'earth-eater': absorb('ground', { d2: 'Recupera un 0,3 % de vida por segundo.', regenK: 0.003 }),
    'multiscale': { d: 'Con la vida casi llena recibe un 40 % menos de daño.', inMul: pl => (nearFull(pl) ? 0.6 : 1) },
    'filter': { d: 'Los ataques muy eficaces le hacen un 30 % menos.', d2: 'Recibe un 4 % menos de daño.', inMul: (pl, type) => (superEff(pl, type) ? 0.7 : 0.96) },
    'solid-rock': { d: 'Los ataques muy eficaces le hacen un 25 % menos.', inMul: (pl, type) => (superEff(pl, type) ? 0.75 : 1) },
    // Cambio Color: se vuelve del tipo de quien le pega.
    'color-change': { d: 'Cambia de color: al recibir un golpe, ese tipo le hace la mitad de daño durante 20 s; los demás, un 8 % menos.',
      hurt: (pl, type) => { if (type) { S(pl).colT = type; S(pl).col = now(); } },
      inMul: (pl, type) => (type && type === S(pl).colT && ago(pl, 'col') < 20 ? 0.5 : 0.92) },
    'fur-coat': { d: 'Recibe un 18 % menos de daño físico.', inMul: (pl, type, c) => (c === 'p' ? 0.82 : 1) },
    'big-pecks': { d: 'Recibe un 15 % menos de daño físico.', inMul: (pl, type, c) => (c === 'p' ? 0.85 : 1) },
    'fluffy': { d: 'Recibe un 25 % menos de daño cuerpo a cuerpo, pero el Fuego le hace un 50 % más.',
      inMul: (pl, type) => (type === 'fire' ? 1.5 : touch(pl) ? 0.75 : 1) },
    'ice-scales': { d: 'Recibe un 25 % menos de daño especial; con nieve, un 45 % menos.', inMul: (pl, type, c) => (c === 's' ? (wx() === 'snow' ? 0.55 : 0.75) : 1) },
    'soundproof': { d: 'Recibe un 30 % menos de daño especial.', inMul: (pl, type, c) => (c === 's' ? 0.7 : 1) },
    // Caparazón: en los juegos, sin golpes críticos. Aquí, ningún golpe le quita mucho de una vez.
    'shell-armor': { d: 'Ningún golpe le quita más del 12 % de su vida máxima.', d2: 'Recibe un 5 % menos de daño.',
      inMul: allIn(0.95), taken: (pl, d) => Math.min(d, pl.maxHp * 0.12), pts: 4 },
    'battle-armor': { d: 'Los jefes le hacen un 25 % menos de daño; el resto, un 6 % menos.',
      inMul: (pl, type, c, src) => { const f = foeOf(src); return f && f.boss ? 0.75 : 0.94; } },
    // Presión: los enemigos de cerca le pegan peor y se mueven peor.
    'pressure': { d: 'Presiona a los de alrededor: los enemigos a menos de 150 px le hacen un 15 % menos y van un 15 % más lentos.', aura: true,
      inMul: (pl, type, c, src) => (nearSrc(pl, src, 150) ? 0.85 : 1), tick: (pl, dt) => aura(pl, dt, 'press', 0.5, 150, e => e.applySlow(0.15, 0.7)) },
    'friend-guard': { d: 'Cada 15 s le protege una barrera que para el 10 % de su vida máxima de daño.',
      tick: (pl, dt) => { if (every(pl, 'fguard', 15, dt)) shield(pl, 0.1, '#ffc6e8'); }, barrier: [0.1, 15] },
    'armor-tail': { d: 'Cada 50 s, el primer golpe que recibe no le hace daño y aturde 1 s a los enemigos de alrededor.', aura: true,
      ...guard('armor-tail', 50, '', '#e8c070', '', pl => nova(pl, 110, 0, '#e8c070', e => e.applyStun(1))) },
    'grass-pelt': { d: 'Mientras camina se cubre de hierba: recupera un 0,8 % de vida por segundo.',
      tick: (pl, dt) => { if (pl.walking) heal(pl, 0.008 * dt); } },
    // Ignorante: los golpes fuertes le hacen menos.
    'unaware': { d: 'No se deja impresionar: lo que pasa del 8 % de su vida máxima en un golpe le hace la mitad.',
      taken: (pl, d) => { const t = pl.maxHp * 0.08; return d > t ? t + (d - t) * 0.5 : d; }, pts: 8 },
    'unnerve': { d: 'Cada 5 s pone nerviosos a los enemigos de alrededor: les hace daño y se quedan frenados un 45 % durante 2 s.', aura: true,
      tick: (pl, dt) => { if (live(pl) && every(pl, 'unnerve', 5, dt)) nova(pl, 140, 2.5, '#c78bff', e => e.applySlow(0.45, 2)); } },
    'neutralizing-gas': { d: 'Le rodea un gas que envenena a los enemigos a menos de 100 px.', aura: true,
      tick: (pl, dt) => aura(pl, dt, 'gas', 1.5, 100, e => e.applyPoison(1)) },
    'queenly-majesty': { d: 'Regia presencia: los enemigos que se le acercan mucho reciben un golpe y se quedan aturdidos 0,8 s (cada uno, como mucho cada 3 s).', aura: true,
      tick: (pl, dt) => aura(pl, dt, 'queen', 0.3, 80, e => { if (!(e.qmAt > now())) { e.qmAt = now() + 3; e.applyStun(0.8); strike(pl, e, 2.5, '#ffd36b'); } }) },
    'dazzling': { d: 'Cada 8 s suelta un destello que daña y aturde 0,8 s a los enemigos de alrededor.', aura: true,
      tick: (pl, dt) => { if (live(pl) && every(pl, 'dazzle', 8, dt)) nova(pl, 130, 2.5, '#fff4a0', e => e.applyStun(0.8)); } },
    'intimidate': { d: 'Recibe un 12 % menos de daño físico y quien le golpea cuerpo a cuerpo retrocede asustado.',
      inMul: (pl, type, c) => (c === 'p' ? 0.88 : 1), contact: (pl, e) => { e.hurt(1, '#c9a0a8', e.x - pl.x, e.y - pl.y, 260); } },
    'overcoat': { d: 'Recibe un 22 % menos de daño a distancia (disparos y zonas).', d2: 'Las trampas no le hacen daño.', trapProof: true, inMul: pl => (touch(pl) ? 1 : 0.78) },
    'bulletproof': ranged(0.75, 'Recibe un 25 % menos de daño a distancia (disparos y zonas).'),
    // Coraza Reflejo: lo que le disparan vuelve.
    'mirror-armor': { d: 'Recibe un 12 % menos de daño a distancia y devuelve cada disparo al enemigo más cercano.', aura: true,
      inMul: pl => (touch(pl) ? 1 : 0.88), hurt: pl => { if (!touch(pl) && cool(pl, 'mirror', 0.6)) zap(pl, 1, 260, 2.5, '#c8d4e8', 'steel', null, true); } },
    'shield-dust': { d: 'Recibe un 12 % menos de daño a distancia y quien le dispara se queda frenado por el polvo.', d2: 'Las trampas no le hacen daño.', trapProof: true,
      inMul: pl => (touch(pl) ? 1 : 0.88), hurt: (pl, type, c, src) => { const f = foeOf(src); if (f && !touch(pl)) f.applySlow(0.4, 2); } },
    'magic-bounce': Object.assign(ranged(0.86, 'Recibe un 14 % menos de daño a distancia y esquiva el 8 % de esos golpes.'),
      { dodge: pl => (touch(pl) ? 0 : 0.08) }),
    'good-as-gold': steadyAnd({ d2: 'Recibe un 22 % menos de daño a distancia (disparos y zonas).', inMul: pl => (touch(pl) ? 1 : 0.78) }),
    'sturdy': { d: 'Un golpe que le dejaría KO le deja con 1 de vida y suelta una onda que aparta a los de alrededor (cada 90 s).', d2: 'Recibe un 6 % menos de daño.',
      sturdy: true, inMul: allIn(0.94),
      fall: pl => { if (!cool(pl, 'sturdy', 90)) return false; pl.hp = 1; pl.invuln = Math.max(pl.invuln || 0, 1.2); pl.graceT = Math.max(pl.graceT || 0, 1.2); say(pl, 'sturdy', '#c9b48a'); nova(pl, 120, 0, '#c9b48a', null, 320); return true; } },
    'regenerator': regen(0.008, 'Recupera un 0,8 % de su vida por segundo.'),
    'hospitality': { d: 'Cada 20 s se sirve un té: recupera un 15 % de vida (si le hace falta).', d2: 'Las curas le curan un 30 % más.', healMul: 1.3,
      tick: (pl, dt) => { pl.teaT = Math.min(20, (pl.teaT || 0) + dt); if (pl.teaT >= 20 && pl.hp < pl.maxHp * 0.9) { pl.teaT = 0; heal(pl, 0.15); say(pl, 'hospitality', '#9fe0a0'); } } },
    'poison-heal': { d: 'Recupera un 1,2 % de vida por segundo con menos de la mitad de vida; si no, un 0,3 %.',
      tick: (pl, dt) => heal(pl, (half(pl) ? 0.012 : 0.003) * dt) },
    'natural-cure': { d: 'Recupera un 0,4 % de vida por segundo, y un 1,5 % si no le han golpeado en 4 s.',
      hurt: pl => { S(pl).nc = now(); }, tick: (pl, dt) => heal(pl, (ago(pl, 'nc') > 4 ? 0.015 : 0.004) * dt) },
    'healer': { d: 'Recupera un 0,5 % de vida por segundo y las curas le curan un 40 % más.', regenK: 0.005, healMul: 1.4 },
    'magic-guard': { d: 'Sólo le hacen daño los ataques: ni la lava, ni las trampas, ni las explosiones.', d2: 'Recibe un 12 % menos de daño a distancia (disparos y zonas).',
      lavaProof: true, trapProof: true, damp: true, inMul: pl => (touch(pl) ? 1 : 0.88) },
    'stamina': onHurt('def', 0.06, 6, 3, 'Cada golpe que recibe le sube la defensa un 6 % durante 6 s (hasta 3 veces).'),
    'marvel-scale': { d: 'Recibe un 6 % menos de daño; con menos de la mitad de vida, un 25 % menos.', inMul: pl => (half(pl) ? 0.75 : 0.94) },
    'shields-down': { d: 'Con más de la mitad de vida recibe un 10 % menos de daño; con menos, hace +20 % de daño.',
      inMul: pl => (half(pl) ? 1 : 0.9), out: pl => (half(pl) ? 1.2 : 1) },
    'heavy-metal': { d: 'Recibe un 14 % menos de daño, pero va un 5 % más lento.', inMul: allIn(0.86), speed: () => 0.95 },
    'stall': { d: 'Va el último: sus movimientos tardan un 10 % más en recargar, pero hacen +25 % de daño.', cdMul: 1.1, out: allOut(1.25) },
    'wonder-guard': { d: 'Lo que no es muy eficaz le hace un 40 % menos; lo muy eficaz, un 40 % más.',
      inMul: (pl, type) => (!type ? 1 : superEff(pl, type) ? 1.4 : 0.6) },
    'disguise': guard('disguise', 60, 'Cada 60 s, el primer golpe que recibe no le hace daño.', '#f4d35e'),
    'ice-face': guard('ice-face', 60, 'Cada 60 s, el primer golpe físico que recibe no le hace daño.', '#bfe8ff', 'p'),
    'illusion': guard('illusion', 45, 'Cada 45 s, el primer golpe se lo lleva su doble: no le hace daño.', '#c78bff'),
    'telepathy': { d: 'Lee la mente: esquiva el 14 % de los golpes a distancia.', dodge: pl => (touch(pl) ? 0 : 0.14) },
    'anticipation': { d: 'Presiente el peligro: tras recibir un golpe, esquiva todo durante 1 s (cada 6 s).',
      hurt: pl => { if (cool(pl, 'antic', 6)) pl.invuln = Math.max(pl.invuln || 0, 1); }, pts: 9 },
    'forewarn': { d: 'Ve venir a los fuertes: +25 % de daño a los jefes y le hacen un 15 % menos.',
      out: (pl, m, e) => (e && e.boss ? 1.25 : 1), inMul: (pl, type, c, src) => { const f = foeOf(src); return f && f.boss ? 0.85 : 1; }, pts: 3 },
    'damp': { d: 'Las explosiones de los Pokémon kamikaze no le dañan.', d2: 'Recibe un 6 % menos de daño.', damp: true, inMul: allIn(0.94) },
    'suction-cups': steadyAnd({ d2: '+12 % de daño; con los ataques cuerpo a cuerpo y embestidas, +25 %.', out: (pl, m) => (close(m) ? 1.25 : 1.12) }),
    'comatose': steadyAnd({ d2: 'Siempre dormido: recibe un 14 % menos de daño, pero va un 5 % más lento.', inMul: allIn(0.86), speed: () => 0.95 }),
    'aroma-veil': { d: 'Su aroma calma: los enemigos a menos de 100 px le hacen un 15 % menos de daño.',
      inMul: (pl, type, c, src) => (nearSrc(pl, src, 100) ? 0.85 : 1) },
    'flower-veil': { d: 'Con más de 3/4 de vida recibe un 20 % menos de daño.', inMul: pl => (pl.hp > pl.maxHp * 0.75 ? 0.8 : 1) },
    'sweet-veil': { d: 'Recibe un 8 % menos de daño y las curas le curan un 30 % más.', inMul: allIn(0.92), healMul: 1.3 },
    'oblivious': steadyAnd({ d2: '+10 % de vida máxima.', hpMul: 1.1 }),
    'clear-body': steadyAnd({ d2: 'Recibe un 10 % menos de daño.', inMul: allIn(0.9) }),
    'white-smoke': { d: 'Cada 8 s suelta humo caliente: los enemigos de alrededor se queman y quedan cegados (frenados un 50 %) durante 3 s.', aura: true,
      tick: (pl, dt) => { if (live(pl) && every(pl, 'smoke', 8, dt)) nova(pl, 130, 2.5, '#d8d8d8', e => { e.applySlow(0.5, 3); e.applyBurn(2); }); } },
    'limber': steadyAnd({ d2: 'Esquiva el 10 % de los golpes.', dodge: () => 0.1 }),
    'own-tempo': steadyAnd({ d2: '+12 % de velocidad.', speed: () => 1.12 }),
    'inner-focus': steadyAnd({ d2: 'Sus movimientos se recargan un 11 % antes.', cdMul: 0.89 }),
    'insomnia': steadyAnd({ d2: 'Gana un 20 % más de experiencia.', start: pl => { pl.xpMul *= 1.2; } }),
    'vital-spirit': { d: 'Gana un 10 % más de experiencia y va un 6 % más rápido.', start: pl => { pl.xpMul *= 1.1; }, speed: () => 1.06 },
    'early-bird': { d: 'Madruga: los primeros 5 minutos gana el doble de experiencia.',
      tick: pl => { const o = S(pl); if (!o.eb && now() < 300) { o.eb = 1; pl.xpMul *= 2; } else if (o.eb === 1 && now() >= 300) { o.eb = 2; pl.xpMul /= 2; } }, pts: 12 },

    // ---------------- contraataques (al recibir un golpe cuerpo a cuerpo) ----------------
    'static': contact((pl, e) => { e.applySlow(0.5, 2.5); if (Math.random() < 1 / 3) e.applyStun(0.5); }, 'Quien le golpea cuerpo a cuerpo se queda paralizado (frenado y, a veces, aturdido).'),
    'flame-body': contact((pl, e) => e.applyBurn(2), 'Quien le golpea cuerpo a cuerpo se quema.'),
    'poison-point': contact((pl, e) => e.applyPoison(2), 'Quien le golpea cuerpo a cuerpo se envenena.'),
    'liquid-ooze': { d: 'Cada 6 s escupe lodo: daña y envenena a los enemigos de alrededor.', aura: true,
      tick: (pl, dt) => { if (live(pl) && every(pl, 'ooze', 6, dt)) nova(pl, 110, 1.5, '#a46ad8', e => e.applyPoison(2)); } },
    'toxic-debris': { d: 'Al recibir un golpe físico siembra púas tóxicas: daña y envenena a los enemigos de alrededor (cada 2 s).', aura: true,
      hurt: (pl, type, c) => { if (c === 'p' && cool(pl, 'debris', 2)) nova(pl, 110, 2.5, '#b36ad8', e => e.applyPoison(2)); } },
    'cute-charm': contact((pl, e) => e.applyStun(1.2), 'Quien le golpea cuerpo a cuerpo se enamora: se queda quieto 1,2 s.'),
    'effect-spore': contact((pl, e) => (Math.random() < 0.5 ? e.applySlow(0.45, 2.5) : e.applyPoison(2)), 'Quien le golpea cuerpo a cuerpo se frena o se envenena.'),
    'rough-skin': contact((pl, e) => e.hurt(dmgBack(pl) * 1.5, '#9aa6b5'), 'Quien le golpea cuerpo a cuerpo recibe mucho daño.'),
    'iron-barbs': contact((pl, e) => { e.hurt(dmgBack(pl), '#9aa6b5'); e.applySlow(0.35, 1.5); }, 'Quien le golpea cuerpo a cuerpo recibe daño y se queda frenado.'),
    'innards-out': { d: 'Cada 6 golpes que recibe revienta por dentro: un golpe enorme a los de alrededor.', aura: true,
      hurt: pl => { const o = S(pl); o.inn = (o.inn || 0) + 1; if (o.inn >= 6 && live(pl)) { o.inn = 0; say(pl, 'innards-out', '#ff9fcf'); nova(pl, 150, 8, '#ff9fcf', null, 220); G.Camera.kick(0.6); } } },
    // Cuerpo Mortal: quien le toca recibe un golpe fuerte 3 s después.
    'perish-body': { d: 'Quien le golpea cuerpo a cuerpo queda maldito: 3 s después recibe un golpe fuerte.', d2: TOUCH_D2, inMul: touchIn,
      contact: (pl, e) => { if (!(e.perishAt > now())) e.perishAt = now() + 3; (S(pl).perish = S(pl).perish || []).push(e); },
      tick: pl => { const l = S(pl).perish; if (!l || !l.length) return; for (let i = l.length - 1; i >= 0; i--) { const e = l[i]; if (e.dead || !(e.perishAt <= now())) { if (e.dead) l.splice(i, 1); continue; } l.splice(i, 1); e.perishAt = 0; G.FX.ring(e.x, e.y, 30, 4, '#9a7bd6', 0.4, 3); strike(pl, e, 4, '#9a7bd6'); } } },
    'gulp-missile': { d: 'Al recibir un golpe escupe un Arrokuda al enemigo más cercano: mucho daño y lo frena (cada 3 s).', aura: true,
      hurt: pl => { if (cool(pl, 'gulp', 3)) zap(pl, 1, 240, 7, '#7fb8ff', 'water', e => e.applySlow(0.5, 2), true); } },
    // Sincronía: lo que le hacen, lo devuelve (también a distancia).
    'synchronize': { d: 'Quien le golpea, también desde lejos, recibe parte del golpe (como mucho una vez por segundo).', d2: TOUCH_D2, inMul: touchIn,
      hurt: (pl, type, c, src) => { const f = foeOf(src); if (f && cool(pl, 'sync', 1)) { strike(pl, f, 2, '#ff9fcf'); G.FX.ring(f.x, f.y, 4, 26, '#ff9fcf', 0.3, 2); } } },
    'cursed-body': contact((pl, e) => { if (Math.random() < 0.3) e.applyStun(1.2); }, '3 de cada 10 que le golpean cuerpo a cuerpo se quedan malditos: aturdidos 1,2 s.'),
    'gooey': contact((pl, e) => e.applySlow(0.5, 2.5), 'Quien le golpea cuerpo a cuerpo se queda frenado (pegajoso).'),
    'cotton-down': { d: 'Al recibir un golpe suelta pelusa: daña y frena un 45 % a todos los de alrededor durante 2 s.', aura: true,
      hurt: pl => { if (cool(pl, 'cotton', 1.5)) nova(pl, 120, 2.5, '#f4f0e0', e => e.applySlow(0.45, 2)); } },
    'arena-trap': { d: 'Los enemigos a menos de 100 px se hunden en la arena: muy frenados y la arena les muerde cada segundo.', aura: true,
      tick: (pl, dt) => { aura(pl, dt, 'arena', 0.4, 100, e => e.applySlow(0.55, 0.6)); aura(pl, dt, 'arenaD', 1, 100, e => strike(pl, e, 0.7, '#d8b86a')); } },
    'shadow-tag': contact((pl, e) => e.applyStun(1), 'Quien le golpea cuerpo a cuerpo queda atrapado en su sombra: aturdido 1 s.'),
    'sand-spit': { d: 'Al recibir un golpe escupe arena: daña y frena a los enemigos de alrededor (cada 3 s).', aura: true,
      hurt: pl => { if (cool(pl, 'spit', 3)) nova(pl, 110, 4, '#d8b86a', e => e.applySlow(0.5, 2)); } },
    'mummy': contact((pl, e) => { e.applySlow(0.5, 2.5); e.applyPoison(1); }, 'Quien le golpea cuerpo a cuerpo queda momificado: frenado y envenenado.'),
    'lingering-aroma': contact((pl, e) => mark(e, 1.3, 5), 'Quien le golpea cuerpo a cuerpo se queda con su olor: recibe +30 % de su daño durante 5 s.',
      { out: (pl, m, e) => marked(e) }),
    'wandering-spirit': contact((pl, e) => { e.applyStun(0.8); heal(pl, 0.02); }, 'Quien le golpea cuerpo a cuerpo pierde el alma: aturdido 0,8 s; él recupera un 2 % de vida.'),
    'stench': { d: 'Su olor echa para atrás: cada 2 s aparta a los enemigos que se le pegan.', d2: 'Recibe un 10 % menos de daño cuerpo a cuerpo.', aura: true,
      inMul: pl => (touch(pl) ? 0.9 : 1), tick: (pl, dt) => aura(pl, dt, 'stench', 2, 70, e => e.hurt(1, '#9fae6a', e.x - pl.x, e.y - pl.y, 240)) },
    // Detonación: los que derrota a veces revientan y dañan a los de al lado.
    'aftermath': { d: 'Los enemigos que derrota revientan 1 de cada 2 veces y dañan a los que tienen al lado.', aura: true,
      kill: (pl, e) => { if (!e || Math.random() >= 0.5 || !live(pl)) return; G.FX.ring(e.x, e.y, 6, 90, '#ff7b3d', 0.35, 4); for (const f of foes(pl, 90, e.x, e.y)) strike(pl, f, 3, '#ff7b3d', 120); } },
    // Hurto: a quien le golpea cuerpo a cuerpo le roba vida y, a veces, una moneda.
    'pickpocket': { d: 'A quien le golpea cuerpo a cuerpo le roba: recupera un 4 % de vida y a veces coge una moneda.',
      contact: pl => { heal(pl, 0.04); if (Math.random() < 0.15) G.Pickups.drop('coin', pl.x + G.U.rand(-10, 10), pl.y + G.U.rand(-10, 10), 2); } },

    // ---------------- al recibir golpes ----------------
    'weak-armor': onHurt('spd', 0.25, 3, 1, 'Al recibir un golpe físico se aligera: +25 % de velocidad un momento.', (pl, type, c) => c === 'p'),
    'steadfast': onHurt('spd', 0.08, 4, 3, 'Al recibir un golpe, +8 % de velocidad un momento (hasta 3 veces).'),
    'steam-engine': { d: 'Los golpes de Fuego y Agua le calientan la caldera: +60 % de velocidad 6 s; los demás, +15 % 3 s.',
      hurt: (pl, type) => (type === 'fire' || type === 'water' ? pl.addBuff('spd', 0.6, 6, 1) : pl.addBuff('spd', 0.15, 3, 1)) },
    'rattled': { d: 'Los golpes le asustan: sale corriendo (+30 % de velocidad 2 s) y no le pueden dar durante medio segundo.',
      hurt: pl => { pl.addBuff('spd', 0.3, 2, 1); pl.invuln = Math.max(pl.invuln || 0, 0.5); } },
    'contrary': onHurt('atk', 0.08, 8, 3, 'Le salen al revés: cada golpe que recibe le da +8 % de daño durante 8 s (hasta 3 veces).'),
    'defiant': onHurt('patk', 0.12, 8, 2, 'Al recibir un golpe se pica: +12 % de daño físico durante 8 s (hasta 2 veces).'),
    'competitive': onHurt('satk', 0.12, 8, 2, 'Al recibir un golpe se pica: +12 % de daño especial durante 8 s (hasta 2 veces).'),
    'electromorphosis': onHurt('atk', 0.2, 6, 1, 'Al recibir un golpe se carga: +20 % de daño durante 6 s.'),
    'wind-power': { d: 'Al recibir un golpe se carga: su siguiente ataque eléctrico lanza además un rayo al enemigo más cercano.', aura: true, pts: 8,
      hurt: pl => { S(pl).windC = 1; },
      hit: (pl, e, m) => { if (S(pl).windC && m && m.type === 'electric' && cool(pl, 'wind', 1)) { S(pl).windC = 0; zap(pl, 1, 260, 3, '#ffe14d', 'electric', null, true); } } },
    'seed-sower': { d: 'Al recibir un golpe, siembra semillas que le curan un 4 % de vida.', hurt: pl => heal(pl, 0.04) },
    'tangled-feet': { d: 'Al recibir un golpe se tambalea: esquiva el 20 % de los golpes durante 3 s.',
      hurt: pl => { pl.tangleAt = now(); }, dodge: pl => (pl.tangleAt != null && now() - pl.tangleAt < 3 ? 0.2 : 0) },
    'anger-point': { d: '+10 % de daño; al bajar de la mitad de vida se enfurece: +35 % durante 10 s (una vez cada 30 s).',
      tick: pl => { if (half(pl) && now() - (pl.angryAt == null ? -1e9 : pl.angryAt) >= 30) { pl.angryAt = now(); say(pl, 'anger-point', '#ff6b4d'); } },
      out: pl => (pl.angryAt != null && now() - pl.angryAt < 10 ? 1.35 : 1.1) },
    'berserk': { d: '+10 % de daño; con menos de la mitad de vida entra en cólera: +30 % de daño especial y +15 % de velocidad.',
      out: (pl, m) => (half(pl) && cls(m) === 's' ? 1.3 : 1.1), speed: pl => (half(pl) ? 1.15 : 1) },

    // ---------------- curas, botín y experiencia ----------------
    'pickup': Object.assign(berry(10, 0.05, '+15 % de Pokémonedas y cada 10 s encuentra una baya: recupera un 5 % de vida (si le hace falta).'),
      { start: pl => { pl.coinMul *= 1.15; } }),
    'honey-gather': { d: 'Recoge miel: +30 % de Pokémonedas.', start: pl => { pl.coinMul *= 1.3; } },
    'harvest': berry(8, 0.07, 'Cada 8 s le crece una baya: recupera un 7 % de vida (si le hace falta).'),
    'gluttony': { d: 'Las curas le curan un 60 % más y cada enemigo derrotado le cura un 0,4 % de vida.', healMul: 1.6, kill: pl => heal(pl, 0.004) },
    'cheek-pouch': { d: 'Guarda bayas en los carrillos: cada 12 s, con menos de 2/3 de vida, se come una y recupera un 18 %.',
      tick: (pl, dt) => { pl.pouchT = Math.min(12, (pl.pouchT || 0) + dt); if (pl.pouchT >= 12 && pl.hp < pl.maxHp * 2 / 3) { pl.pouchT = 0; heal(pl, 0.18); say(pl, 'cheek-pouch', '#9fe0a0'); } } },
    'ripen': { d: 'Las curas le curan el doble y recupera un 0,25 % de vida por segundo.', healMul: 2, regenK: 0.0025 },
    'cud-chew': { d: 'Rumia: cada 20 s recupera un 35 % de la vida que ha perdido en esos 20 s.',
      tick: (pl, dt) => { if (every(pl, 'cud', 20, dt)) { const o = S(pl), lost = (pl.dmgTaken || 0) - (o.cud0 || 0); o.cud0 = pl.dmgTaken || 0; if (lost > 0) pl.hp = Math.min(pl.maxHp, pl.hp + lost * 0.35); } }, pts: 10 },
    'triage': { d: 'Las curas le curan el doble y cada 12 s recupera un 4 % de vida.', healMul: 2,
      tick: (pl, dt) => { if (every(pl, 'triage', 12, dt)) heal(pl, 0.04); } },
    'symbiosis': { d: 'Cada 25 s comparte su energía: recupera un 10 % de vida y gana +15 % de daño durante 6 s.',
      tick: (pl, dt) => { if (every(pl, 'symb', 25, dt)) { heal(pl, 0.1); S(pl).symb2 = now(); } }, out: pl => (ago(pl, 'symb2') < 6 ? 1.15 : 1) },
    'supersweet-syrup': { d: 'Atrae los objetos desde más lejos (+30 % de imán) y las curas le curan un 50 % más.', healMul: 1.5,
      start: pl => { pl.magnet *= 1.3; } },
    'shed-skin': { d: 'Cada 4 s muda: se quita los frenazos y recupera un 3,5 % de vida (si le hace falta).',
      tick: (pl, dt) => { pl.shedT = Math.min(4, (pl.shedT || 0) + dt); if (pl.shedT >= 4 && (pl.slowT > 0 || pl.hp < pl.maxHp * 0.99)) { pl.shedT = 0; pl.slowT = 0; heal(pl, 0.035); } } },
    'frisk': { d: 'Atrae los objetos desde más lejos (+35 % de imán) y +10 % de Pokémonedas.', start: pl => { pl.magnet *= 1.35; pl.coinMul *= 1.1; } },
    'magnet-pull': { d: 'Cada 30 s atrae a la vez todos los objetos del mapa.', d2: '+20 % de imán.',
      start: pl => { pl.magnet *= 1.2; }, tick: (pl, dt) => { if (live(pl) && every(pl, 'mpull', 30, dt) && G.Pickups && G.Pickups.pullAll) { G.Pickups.pullAll(); say(pl, 'magnet-pull', '#9ad0ff'); } }, pts: 6 },
    'sticky-hold': magnet(1.4, 'Atrae los objetos desde más lejos (+40 % de imán).'),
    'illuminate': { d: '+25 % de imán y +12 % de experiencia.', start: pl => { pl.magnet *= 1.25; pl.xpMul *= 1.12; } },
    'ball-fetch': { d: '+20 % de Pokémonedas y atrae los objetos desde más lejos (+20 % de imán).', start: pl => { pl.coinMul *= 1.2; pl.magnet *= 1.2; } },
    // (statusCd va además de cdMul: 0,93 × 0,645 = 0,6.)
    'prankster': { d: 'Sus potenciadores y escudos se recargan un 40 % antes; los demás movimientos, un 7 %.', statusCd: 0.645, cdMul: 0.93 },
    'battery': { d: 'Sus movimientos se recargan un 11 % antes.', cdMul: 0.89 },

    // ---------------- las que en los juegos son un lastre: aquí, un intercambio ----------------
    'truant': { d: 'Golpes sueltos y brutales: tarda un 40 % más en recargar, pero cada golpe hace +60 %.', cdMul: 1.4, out: allOut(1.6) },
    'defeatist': { d: 'Cañón de cristal: +16 % de daño con más de la mitad de vida; con menos, −25 %.', out: pl => (half(pl) ? 0.75 : 1.16) },
    'schooling': { d: 'Forma banco: +8 % de vida y, con más de 1/4 de vida, +10 % de daño.',
      hpMul: 1.08, out: pl => (pl.hp > pl.maxHp / 4 ? 1.1 : 1) },
    'zen-mode': { d: '+10 % de daño; con menos de la mitad de vida entra en Modo Daruma: +40 %.', out: pl => (half(pl) ? 1.4 : 1.1) },
    'stance-change': { d: 'Alterna cada 8 s entre filo (+12 % de daño) y escudo (−12 % de daño recibido).',
      tick: (pl, dt) => { pl.stanceT = (pl.stanceT || 0) + dt; if (pl.stanceT >= 8) { pl.stanceT = 0; pl.shieldForm = !pl.shieldForm; } },
      out: pl => (pl.shieldForm ? 1 : 1.12), inMul: pl => (pl.shieldForm ? 0.88 : 1) },
    'imposter': { d: 'Se transforma: pega y aguanta como un Pokémon equilibrado.',
      mon: m => { m.pa = m.sa = m.atk = Math.max(m.atk, 0.95); m.df = Math.max(m.df, 58); m.sd = Math.max(m.sd, 58); } },
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
  FX['armor-tail'].d = 'Cada 50 s, el primer golpe que recibe no le hace daño y aturde 1 s a los enemigos de alrededor.';

  // ================= LEGENDARIOS Y SINGULARES (17-11-2026) =================
  /*
   * Una cada uno, que no lleva nadie más (data/abilities.js; tests/habilidades.test.cjs). Fuertes y que se
   * vean: ondas, rayos, auras, barreras, volver a la vida... Medidas con balance.cjs --habilidades: rondan
   * 20-30 puntos (las normales, 13): un legendario se nota, pero no gana solo.
   */
  const L = (o) => Object.assign({ leg: true }, o);
  const ICE = '#a8e6ff', ELEC = '#ffe14d', FIRE = '#ff7b3d', PSY = '#ff8ad8', WATER = '#5aa8ff', GRASS = '#6fd36a',
        ROCK = '#c9a26a', STEEL = '#c8d4e8', DRAGON = '#8a7bff', DARK = '#7a5a8a', GHOST = '#9a7bd6', FAIRY = '#ffb3e0',
        POISON = '#b36ad8', GROUND = '#d8b86a', FLY = '#bfe8ff', FIGHT = '#e0704a', NORM = '#e8e2d0';
  const tick = (key, s, fn) => (pl, dt) => { if (!live(pl)) return; for (let n = every(pl, key, s, dt); n > 0; n--) fn(pl); };
  const typeK = (types, k) => (pl, m) => (types.includes(m.type) ? k : 1);
  /** Le salva de caer una vez cada `sec` s: vuelve con k de vida y hace fn. */
  const rise = (id, sec, k, col, fn) => pl => {
    if (!cool(pl, 'rise', sec)) return false;
    pl.hp = pl.maxHp * k; pl.invuln = Math.max(pl.invuln || 0, 1.5); pl.graceT = Math.max(pl.graceT || 0, 1.5);
    say(pl, id, col); G.FX.ring(pl.x, pl.y, 6, 200, col, 0.7, 7); G.Camera.kick(0.7);
    if (fn) fn(pl);
    return true;
  };

  Object.assign(FX, {
    // --- Kanto ---
    'endless-blizzard': L({ d: 'Ventisca perpetua: los enemigos a menos de 150 px van un 30 % más lentos.', d2: 'Cada 10 s, una onda helada daña y congela (aturde 1,2 s) a los de alrededor.', aura: true,
      tick: (pl, dt) => { aura(pl, dt, 'bliz', 0.5, 150, e => e.applySlow(0.3, 0.7)); if (live(pl) && every(pl, 'blizN', 10, dt)) { say(pl, 'endless-blizzard', ICE); nova(pl, 170, 5, ICE, e => e.applyStun(1.2)); } } }),
    'thunderstorm': L({ d: '+20 % de daño con movimientos de tipo Eléctrico.', d2: 'Cada 2,5 s cae un rayo sobre 2 enemigos de alrededor: daño y parálisis.', aura: true,
      out: typeK(['electric'], 1.2), tick: tick('storm', 2.5, pl => zap(pl, 2, 280, 3.5, ELEC, 'electric', e => e.applySlow(0.5, 2))) }),
    'blazing-trail': L({ d: 'Alas de fuego: cada medio segundo quema y daña a los enemigos a menos de 85 px.', d2: '+10 % de velocidad.', aura: true,
      speed: () => 1.1, tick: (pl, dt) => aura(pl, dt, 'trail', 0.5, 85, e => { e.applyBurn(1); strike(pl, e, 0.6, FIRE); }) }),
    'absolute-psyche': L({ d: '+12 % de daño.', d2: 'Cada 12 s, una onda psíquica enorme daña, aparta y aturde a todo lo que le rodea.', aura: true,
      out: allOut(1.12), tick: tick('psyche', 12, pl => { say(pl, 'absolute-psyche', PSY); G.Camera.kick(0.5); nova(pl, 200, 4.5, PSY, e => e.applyStun(0.6), 340); }) }),
    'ancestral-genome': L({ d: '+10 % de daño. Cada 15 s despierta un gen al azar durante 8 s: +40 % de daño, +40 % de velocidad, −40 % de daño recibido o una cura del 20 %.',
      tick: (pl, dt) => { if (every(pl, 'gene', 15, dt)) { const g = G.U.pick(['atk', 'spd', 'def', 'heal']); S(pl).gene = g; S(pl).geneT = now(); if (g === 'heal') heal(pl, 0.2); say(pl, 'ancestral-genome', PSY); G.FX.ring(pl.x, pl.y, pl.r, 90, PSY, 0.5, 4); } },
      out: pl => (S(pl).gene === 'atk' && ago(pl, 'geneT') < 8 ? 1.4 : 1.1),
      speed: pl => (S(pl).gene === 'spd' && ago(pl, 'geneT') < 8 ? 1.4 : 1),
      inMul: pl => (S(pl).gene === 'def' && ago(pl, 'geneT') < 8 ? 0.6 : 1) }),
    // --- Johto ---
    'thunder-roar': L({ d: 'Cada 6 s, un relámpago en cadena salta del enemigo más cercano a otros 4.', d2: '+12 % de velocidad.', aura: true,
      speed: () => 1.12,
      tick: tick('roar', 6, pl => {
        let cur = foes(pl, 260).sort((a, b) => dist2(a, pl) - dist2(b, pl))[0], from = pl;
        const done = new Set();
        for (let i = 0; i < 5 && cur; i++) {
          done.add(cur);
          G.FX.beam(from.x, from.y, Math.atan2(cur.y - from.y, cur.x - from.x), Math.sqrt(dist2(cur, from)), 6, ELEC, { pal: 'electric' });
          strike(pl, cur, 2.5, ELEC, 40); cur.applySlow(0.5, 1.5);
          from = cur;
          cur = foes(pl, 160, cur.x, cur.y).filter(e => !done.has(e)).sort((a, b) => dist2(a, from) - dist2(b, from))[0];
        }
      }) }),
    'volcanic-eruption': L({ d: 'Cada 7 s, cuatro columnas de lava estallan bajo los enemigos: daño y quemaduras alrededor de cada una.', d2: 'La lava no le quema.', aura: true, lavaProof: true,
      tick: tick('erupt', 7, pl => { for (const t of zap(pl, 4, 260, 0, FIRE, 'fire')) { G.FX.ring(t.x, t.y, 6, 60, FIRE, 0.4, 4); for (const e of foes(pl, 60, t.x, t.y)) { strike(pl, e, 4, FIRE, 90); e.applyBurn(2); } } }) }),
    'purifying-aurora': L({ d: 'Nada le frena y recupera un 0,8 % de vida por segundo.', d2: 'Cada 14 s, una aurora le cura un 8 % y frena un 45 % a los enemigos de alrededor durante 3 s.', steady: true, aura: true,
      regenK: 0.008, tick: tick('aurora', 14, pl => { heal(pl, 0.08); say(pl, 'purifying-aurora', '#9fe8ff'); nova(pl, 190, 2, '#9fe8ff', e => e.applySlow(0.45, 3)); }) }),
    'deep-sea-ward': L({ d: 'Con la vida casi llena recibe la mitad de daño.', d2: 'Cada 10 s bate las alas: un vendaval daña y aparta lejos a los de alrededor.', aura: true,
      inMul: pl => (nearFull(pl) ? 0.5 : 1), tick: tick('aero', 10, pl => nova(pl, 170, 4, FLY, null, 420)) }),
    'sacred-phoenix': L({ d: 'Fénix: al caer, renace con el 60 % de su vida y una llamarada quema todo a su alrededor (una vez cada 4 min).', d2: 'Recupera un 0,4 % de vida por segundo.', aura: true,
      regenK: 0.004, fall: rise('sacred-phoenix', 240, 0.6, FIRE, pl => nova(pl, 220, 9, FIRE, e => e.applyBurn(3), 300)), pts: 16 }),
    'time-rewind': L({ d: 'Al bajar de 1/3 de vida, vuelve atrás en el tiempo: recupera la vida que tenía hace 6 s (cada 40 s).', d2: '+15 % de daño.',
      out: allOut(1.15),
      tick: (pl, dt) => {
        const o = S(pl); o.hist = o.hist || []; o.histT = (o.histT || 0) + dt;
        if (o.histT >= 1) { o.histT = 0; o.hist.push(pl.hp); if (o.hist.length > 6) o.hist.shift(); }
        if (pl.hp < pl.maxHp / 3 && o.hist.length >= 6 && o.hist[0] > pl.hp && cool(pl, 'rewind', 40)) {
          pl.hp = Math.min(pl.maxHp, o.hist[0]); say(pl, 'time-rewind', '#9fe0a0'); G.FX.ring(pl.x, pl.y, 90, 6, '#9fe0a0', 0.6, 4);
        }
      }, pts: 9 }),
    // --- Hoenn ---
    'tectonic-stomp': L({ d: 'Recibe un 15 % menos de daño físico.', d2: 'Cada 10 s pisa fuerte: un terremoto daña y aturde a los de alrededor.', aura: true,
      inMul: (pl, type, c) => (c === 'p' ? 0.85 : 1), tick: tick('stomp', 10, pl => { G.Camera.kick(0.5); nova(pl, 160, 4, ROCK, e => e.applyStun(0.7)); }) }),
    'glacial-body': L({ d: 'Quien le golpea cuerpo a cuerpo se congela 1,5 s.', d2: 'El frío que suelta frena un 25 % a los enemigos a menos de 110 px. Recibe un 10 % menos de daño.', aura: true,
      inMul: allIn(0.9), contact: (pl, e) => e.applyStun(1.5), tick: (pl, dt) => aura(pl, dt, 'glac', 0.5, 110, e => e.applySlow(0.25, 0.7)) }),
    'unyielding-steel': L({ d: 'Ningún golpe le quita más del 9 % de su vida máxima.', d2: 'Nada le frena ni las trampas le hacen daño.', steady: true, trapProof: true,
      taken: (pl, d) => Math.min(d, pl.maxHp * 0.09), pts: 16 }),
    'mist-veil': L({ d: 'Esquiva el 12 % de los golpes.', d2: 'Cada 16 s se envuelve en niebla: 1,5 s sin recibir daño y recupera un 6 % de vida.',
      dodge: () => 0.12, tick: (pl, dt) => { if (every(pl, 'mist', 16, dt)) { pl.invuln = Math.max(pl.invuln || 0, 1.5); heal(pl, 0.06); G.FX.ring(pl.x, pl.y, pl.r * 3, pl.r, '#ffc6e8', 0.5, 4); } }, pts: 6 }),
    'luster-purge': L({ d: 'Cada 4 s dispara un rayo de luz hacia donde apunta: atraviesa y daña a todo lo que toca.', d2: '+10 % de daño especial.', aura: true,
      out: (pl, m) => (cls(m) === 's' ? 1.1 : 1), tick: tick('luster', 4, pl => lance(pl, 320, 46, 8, '#9ad0ff', 'psychic')) }),
    'primordial-sea': L({ d: 'Mar del albor: pone lluvia al empezar y cada minuto. +15 % de daño con movimientos de tipo Agua.', d2: 'Cada 12 s, una marejada daña, aparta y frena a los de alrededor. El Fuego le hace la mitad.', summon: 'rain', aura: true,
      out: typeK(['water'], 1.15), inMul: (pl, type) => (type === 'fire' ? 0.5 : 1),
      tick: (pl, dt) => { if (live(pl) && every(pl, 'tide', 12, dt)) nova(pl, 210, 3.5, WATER, e => e.applySlow(0.4, 2), 320); if (every(pl, 'seaW', 60, dt) && !G.Weather.current && (!G.Coop || !G.Coop.active || G.Coop.isHost) && G.Weather.debugStart) G.Weather.debugStart('rain', 50); } }),
    'desolate-land': L({ d: 'Tierra del ocaso: pone sol al empezar y cada minuto. El Agua le hace la mitad de daño.', d2: '+15 % de daño con movimientos de tipo Fuego y Tierra; la lava no le quema.', summon: 'sun', lavaProof: true,
      out: typeK(['fire', 'ground'], 1.15), inMul: (pl, type) => (type === 'water' ? 0.5 : 1),
      tick: (pl, dt) => { if (every(pl, 'landW', 60, dt) && !G.Weather.current && (!G.Coop || !G.Coop.active || G.Coop.isHost) && G.Weather.debugStart) G.Weather.debugStart('sun', 50); } }),
    'delta-stream': L({ d: 'Corriente delta: +10 % de velocidad y el clima no potencia los ataques que le hacen.', d2: 'Cada 8 s caen tres meteoros de dragón sobre los enemigos.', aura: true,
      speed: () => 1.1, inMul: (pl, type) => 1 / Math.max(1, type ? G.Weather.mult(type) : 1),
      tick: tick('delta', 8, pl => zap(pl, 3, 300, 6, DRAGON, 'dragon', null)) }),
    'wish-star': L({ d: 'Cada 20 s se cumple un deseo: recupera un 20 % de vida y gana +30 % de daño durante 6 s.', d2: '+10 % de probabilidad de golpe crítico.',
      start: pl => { pl.critChance += 0.1; },
      tick: (pl, dt) => { if (every(pl, 'wish', 20, dt)) { heal(pl, 0.2); S(pl).wishT = now(); say(pl, 'wish-star', '#fff4a0'); G.FX.ring(pl.x, pl.y, 80, 6, '#fff4a0', 0.6, 4); } },
      out: pl => (ago(pl, 'wishT') < 6 ? 1.3 : 1) }),
    'shifting-form': L({ d: 'Cambia de forma cada 12 s: Ataque (+25 % de daño), Defensa (−25 % de daño recibido) o Velocidad (+25 % de velocidad).',
      tick: (pl, dt) => { if (!S(pl).form || every(pl, 'form', 12, dt)) { S(pl).form = ['atk', 'def', 'spd'][((S(pl).formI = ((S(pl).formI || 0) + 1)) % 3)]; say(pl, 'shifting-form', '#ff9a3d'); } },
      out: pl => (S(pl).form === 'atk' ? 1.25 : 1), inMul: pl => (S(pl).form === 'def' ? 0.75 : 1), speed: pl => (S(pl).form === 'spd' ? 1.25 : 1) }),
    // --- Sinnoh ---
    'clear-mind': L({ d: 'Sabiduría: gana un 20 % más de experiencia y sus movimientos se recargan un 10 % antes.', d2: 'Cada 15 s borra la memoria de los enemigos de alrededor: se quedan quietos 2 s, sin saber qué hacían.', aura: true,
      cdMul: 0.9, start: pl => { pl.xpMul *= 1.2; }, tick: tick('mind', 15, pl => nova(pl, 170, 1.5, '#ffe08a', e => e.applyStun(2))) }),
    'emotion-pulse': L({ d: 'Al recibir un golpe suelta una ola de emociones: daña y deja embobados (frenados un 50 %) a los de alrededor (cada 3 s).', d2: 'Recupera un 0,5 % de vida por segundo.', aura: true,
      regenK: 0.005, hurt: pl => { if (cool(pl, 'emo', 3)) nova(pl, 130, 3.5, PSY, e => e.applySlow(0.5, 2)); } }),
    'willpower': L({ d: 'Con menos de la mitad de vida, +40 % de daño y +20 % de velocidad.', d2: 'Un golpe que le dejaría KO le deja con 1 de vida (cada 60 s).',
      out: pl => (half(pl) ? 1.4 : 1.05), speed: pl => (half(pl) ? 1.2 : 1),
      fall: pl => { if (!cool(pl, 'will', 60)) return false; pl.hp = 1; pl.invuln = 1.2; pl.graceT = Math.max(pl.graceT || 0, 1.2); say(pl, 'willpower', '#ff6b4d'); return true; }, pts: 6 }),
    'time-roar': L({ d: 'Rugido del tiempo: cada 25 s detiene el tiempo: todos los enemigos de la pantalla se quedan quietos 2,5 s.', d2: 'Sus movimientos se recargan un 12 % antes.', aura: true,
      cdMul: 0.88, tick: tick('troar', 25, pl => { say(pl, 'time-roar', '#7fe0c0'); G.Camera.kick(0.4); nova(pl, 420, 0, '#7fe0c0', e => e.applyStun(2.5)); }) }),
    'spatial-rend': L({ d: 'Cada 7 s rasga el espacio: seis tajos sobre enemigos de la pantalla.', d2: '+30 % de imán.', aura: true,
      start: pl => { pl.magnet *= 1.3; }, tick: tick('rend', 7, pl => { for (const e of zap(pl, 6, 320, 3, '#ffb3e0', 'dragon')) G.FX.slash(e.x, e.y, Math.random() * 6.28, 30, 1.6, '#ffb3e0'); }) }),
    'living-magma': L({ d: 'El Fuego le cura en vez de dañarle y la lava no le quema.', d2: 'El calor que suelta quema cada segundo a los enemigos a menos de 100 px.', absorb: 'fire', lavaProof: true, aura: true,
      tick: (pl, dt) => aura(pl, dt, 'magma', 1, 100, e => { e.applyBurn(1); strike(pl, e, 0.8, FIRE); }) }),
    'slow-start': L({ d: 'Arranca lento: los primeros 45 s hace −30 % de daño.', d2: 'Después despierta: +20 % de daño y cada 14 s pisa la tierra: un golpe enorme que aturde a los de alrededor.', aura: true,
      out: () => (now() < 45 ? 0.7 : 1.2), speed: () => (now() < 45 ? 0.85 : 1),
      tick: (pl, dt) => { if (now() >= 45 && live(pl) && every(pl, 'giga', 14, dt)) { G.Camera.kick(0.6); nova(pl, 180, 5, NORM, e => e.applyStun(0.8), 260); } } }),
    'distortion-world': L({ d: 'Al bajar de 1/4 de vida desaparece en el Mundo Distorsión: 3 s sin recibir daño y vuelve con una onda de sombras (cada 60 s).', d2: '+15 % de daño.', aura: true,
      out: allOut(1.15),
      tick: pl => { if (pl.hp < pl.maxHp / 4 && live(pl) && cool(pl, 'dist', 60)) { pl.invuln = Math.max(pl.invuln || 0, 3); S(pl).distT = now(); say(pl, 'distortion-world', GHOST); }
        if (S(pl).distT && ago(pl, 'distT') >= 3) { S(pl).distT = 0; nova(pl, 200, 7, GHOST, e => e.applyStun(0.8), 260); } }, pts: 8 }),
    'lunar-light': L({ d: 'Recupera un 0,8 % de vida por segundo y las curas le curan un 50 % más.', d2: 'Cada 15 s le protege una barrera lunar que para el 15 % de su vida máxima.',
      regenK: 0.008, healMul: 1.5, tick: (pl, dt) => { if (every(pl, 'moon', 15, dt)) shield(pl, 0.15, '#ffe8a8'); }, barrier: [0.15, 15] }),
    'sea-bubble': L({ d: 'Cada 10 s se envuelve en una burbuja que para el 10 % de su vida máxima de daño; mientras dura, +15 % de velocidad.',
      tick: (pl, dt) => { if (every(pl, 'bubble', 10, dt)) shield(pl, 0.1, WATER); }, speed: pl => ((pl.abShield || 0) > 0 ? 1.15 : 1), barrier: [0.1, 10] }),
    'heart-swap': L({ d: 'Cada 8 s roba el corazón de los 3 enemigos más cercanos: les hace daño y recupera un 2 % de vida por cada uno.', d2: '+10 % de daño de tipo Agua.', aura: true,
      out: typeK(['water'], 1.1), tick: tick('heart', 8, pl => { for (const e of zap(pl, 3, 220, 4, FAIRY, 'fairy', null, true)) heal(pl, 0.02); }) }),
    'bad-dreams': L({ d: 'Pesadilla: cada 8 s duerme 2 s a los enemigos de alrededor.', d2: 'Los enemigos dormidos o aturdidos reciben +35 % de su daño.', aura: true,
      out: (pl, m, e) => (e && e.stunT > 0 ? 1.35 : 1), tick: tick('dream', 8, pl => nova(pl, 170, 2, DARK, e => e.applyStun(2))), pts: 10 }),
    'bloom': L({ d: 'Mientras camina deja flores: recupera un 0,7 % de vida por segundo.', d2: 'Cada 11 s, una explosión de semillas daña a los de alrededor.', aura: true,
      tick: (pl, dt) => { if (pl.walking) heal(pl, 0.007 * dt); if (live(pl) && every(pl, 'seed', 11, dt)) nova(pl, 180, 5.5, GRASS); } }),
    'multitype': L({ d: 'Juicio divino: +10 % de daño y recibe un 8 % menos.', d2: 'Cada 14 s caen 6 rayos de luz sobre los enemigos de la pantalla.', aura: true,
      out: allOut(1.1), inMul: allIn(0.92), tick: tick('judge', 14, pl => { say(pl, 'multitype', '#fff4c0'); zap(pl, 6, 340, 3.5, '#fff4c0', 'normal'); }) }),
    // --- Teselia ---
    'victory-star': L({ d: '+15 % de probabilidad de golpe crítico y críticos ×2.', d2: 'Cada 14 s estalla en una V de fuego: daño y quemaduras alrededor.', aura: true,
      critMul: 2, start: pl => { pl.critChance += 0.15; }, tick: tick('vcreate', 14, pl => nova(pl, 150, 6, FIRE, e => e.applyBurn(2))) }),
    'justice-shield': L({ d: 'Cada 10 s levanta un escudo de acero que para el 12 % de su vida máxima.', d2: '+10 % de daño; a los de tipo Siniestro, +40 %.',
      out: (pl, m, e) => (e && (e.types || []).includes('dark') ? 1.4 : 1.1), tick: (pl, dt) => { if (every(pl, 'jshield', 10, dt)) shield(pl, 0.12, STEEL); }, barrier: [0.12, 10] }),
    'stone-charge': L({ d: '+35 % de daño con cuerpo a cuerpo y embestidas.', d2: 'Cada 9 s, rocas afiladas estallan a su alrededor: daño y empujón.', aura: true,
      out: (pl, m) => (close(m) ? 1.35 : 1.05), tick: tick('stoneC', 9, pl => nova(pl, 140, 5, ROCK, null, 300)) }),
    'leaf-dance': L({ d: '+10 % de velocidad.', d2: 'Al moverse junta hojas: cada 5 s las lanza contra 5 enemigos.', aura: true,
      speed: () => 1.1, tick: (pl, dt) => { if (pl.walking && live(pl) && every(pl, 'leaf', 5, dt)) zap(pl, 5, 260, 2.2, GRASS, 'grass', null, true); } }),
    'hurricane-wind': L({ d: 'Un huracán le rodea: cada segundo aparta a los enemigos que se le acercan y los daña.', d2: '+10 % de velocidad.', aura: true,
      speed: () => 1.1, tick: (pl, dt) => aura(pl, dt, 'hurr', 1, 95, e => strike(pl, e, 0.6, FLY, 320)) }),
    'thundercloud': L({ d: 'Una nube de tormenta le sigue: cada 1,5 s fulmina al enemigo más cercano.', d2: 'Recibe un 10 % menos de daño a distancia.', aura: true,
      inMul: pl => (touch(pl) ? 1 : 0.9), tick: tick('cloud', 1.5, pl => zap(pl, 1, 230, 3, ELEC, 'electric', e => e.applyStun(0.25), true)) }),
    'turboblaze': L({ d: 'Llama blanca: +25 % de daño de tipo Fuego y todos sus golpes queman; los quemados reciben +15 % de su daño.', d2: 'Cada 8 s lanza una llamarada blanca hacia donde apunta que atraviesa a todos.', aura: true,
      out: (pl, m, e) => (m.type === 'fire' ? 1.25 : 1) * (e && e.burn > 0 ? 1.15 : 1), hit: (pl, e) => e.applyBurn(1),
      tick: tick('blueF', 8, pl => lance(pl, 320, 50, 7, '#bfe8ff', 'fire', e => e.applyBurn(3))) }),
    'teravolt': L({ d: 'Voltio negro: +25 % de daño de tipo Eléctrico y sus golpes paralizan 1 de cada 6 veces; los aturdidos reciben +25 % de su daño.', d2: 'Cada 8 s caen rayos negros sobre 4 enemigos.', aura: true,
      out: (pl, m, e) => (m.type === 'electric' ? 1.25 : 1) * (e && e.stunT > 0 ? 1.25 : 1), hit: (pl, e) => { if (Math.random() < 1 / 6) e.applyStun(0.6); },
      tick: tick('blackV', 8, pl => zap(pl, 4, 280, 5, '#9ab0ff', 'electric', e => e.applyStun(0.6))) }),
    'earth-force': L({ d: '+15 % de daño con movimientos de tipo Tierra, Roca y Acero.', d2: 'Cada 10 s, un temblor daña y frena un 50 % a los de alrededor.', aura: true,
      out: typeK(['ground', 'rock', 'steel'], 1.15), tick: tick('quake', 10, pl => { G.Camera.kick(0.5); nova(pl, 200, 4, GROUND, e => e.applySlow(0.5, 2)); }) }),
    'absolute-zero': L({ d: 'Sus golpes frenan un 25 % y los enemigos frenados reciben +20 % de su daño.', d2: 'Cada 14 s, el cero absoluto congela (aturde 1,5 s) y daña a todo lo de alrededor.', aura: true,
      out: (pl, m, e) => (e && e.slow > 0 ? 1.2 : 1), hit: (pl, e) => e.applySlow(0.25, 1.5),
      tick: tick('zero', 14, pl => { say(pl, 'absolute-zero', ICE); nova(pl, 200, 6, ICE, e => e.applyStun(1.5)); }) }),
    'secret-sword': L({ d: 'Cada 7 s, la espada mística da un tajo en círculo a los de alrededor.', d2: 'Con más de la mitad de vida, +15 % de daño.', aura: true,
      out: pl => (half(pl) ? 1 : 1.15), tick: tick('ssword', 7, pl => { G.FX.slash(pl.x, pl.y, pl.aim || 0, 110, 6.2, '#8ad0ff'); nova(pl, 115, 4, '#8ad0ff'); }) }),
    'relic-song': L({ d: 'Cambia cada 10 s: Lírica (recupera un 1 % de vida por segundo y frena a los de alrededor) o Danza (+20 % de daño y +15 % de velocidad).', aura: true,
      tick: (pl, dt) => { const o = S(pl); if (every(pl, 'song', 10, dt)) { o.dance = !o.dance; say(pl, 'relic-song', '#9fe0a0'); }
        if (!o.dance) { heal(pl, 0.01 * dt); aura(pl, dt, 'songA', 0.5, 140, e => e.applySlow(0.35, 0.7)); } },
      out: pl => (S(pl).dance ? 1.2 : 1), speed: pl => (S(pl).dance ? 1.15 : 1) }),
    'techno-drive': L({ d: 'Cada 3 s dispara su cañón al enemigo más cercano; el cartucho cambia cada vez: quema, frena, aturde o congela.', aura: true,
      tick: tick('techno', 3, pl => { const c = (S(pl).drive = ((S(pl).drive || 0) + 1) % 4);
        const [col, pal, fn] = [[FIRE, 'fire', e => e.applyBurn(2)], [WATER, 'water', e => e.applySlow(0.5, 2)], [ELEC, 'electric', e => e.applyStun(0.6)], [ICE, 'ice', e => e.applyStun(1)]][c];
        zap(pl, 1, 280, 6, col, pal, fn, true); }) }),
    // --- Kalos ---
    'fairy-aura': L({ d: 'Geomancia: cada 30 s, 8 s con +40 % de daño y +20 % de velocidad.', d2: '+20 % de daño con movimientos de tipo Hada; recupera un 0,4 % de vida por segundo.',
      regenK: 0.004, tick: pl => { if (!(ago(pl, 'geo') < 30)) { S(pl).geo = now(); say(pl, 'fairy-aura', FAIRY); G.FX.ring(pl.x, pl.y, pl.r, 120, FAIRY, 0.6, 5); } },
      out: (pl, m) => (m.type === 'fairy' ? 1.2 : 1) * (ago(pl, 'geo') < 8 ? 1.4 : 1), speed: pl => (ago(pl, 'geo') < 8 ? 1.2 : 1) }),
    'dark-aura': L({ d: 'Ala mortífera: sus golpes le curan el 3 % del daño que hacen.', d2: '+20 % de daño de tipo Siniestro. Cada 15 s, una onda oscura daña a los de alrededor y le cura por cada uno.', aura: true,
      out: typeK(['dark'], 1.2),
      hit: (pl, e, m) => { if (m && pl.hp < pl.maxHp) { const o = S(pl), d = (pl.dmgDealt || 0) - (o.dkD || 0); o.dkD = pl.dmgDealt || 0; if (d > 0) pl.hp = Math.min(pl.maxHp, pl.hp + Math.min(pl.maxHp * 0.01, d * 0.03)); } },
      tick: tick('oblivion', 15, pl => nova(pl, 180, 6, DARK, () => heal(pl, 0.01))) }),
    'aura-break': L({ d: 'Forma Perfecta: al bajar de la mitad de vida se completa: recupera un 40 % y 15 s con +30 % de daño y −25 % de daño recibido (cada 2 min).',
      tick: pl => { if (half(pl) && cool(pl, 'perfect', 120)) { heal(pl, 0.4); S(pl).perfT = now(); say(pl, 'aura-break', '#7fe08a'); G.FX.ring(pl.x, pl.y, 6, 160, '#7fe08a', 0.6, 6); } },
      out: pl => (ago(pl, 'perfT') < 15 ? 1.3 : 1.05), inMul: pl => (ago(pl, 'perfT') < 15 ? 0.75 : 1), pts: 8 }),
    'diamond-shell': L({ d: 'Cada 12 s le cubre una coraza de diamante que para el 15 % de su vida máxima.', d2: 'Cuando se rompe, los cristales salen disparados contra los de alrededor.', aura: true,
      tick: (pl, dt) => { const o = S(pl); if (o.dia && !(pl.abShield > 0)) { o.dia = 0; nova(pl, 130, 5, '#ffd6f0'); } if (every(pl, 'diamond', 12, dt)) { shield(pl, 0.15, '#ffd6f0'); o.dia = 1; } }, barrier: [0.15, 12] }),
    'dimension-rings': L({ d: 'Abre anillos: cada 10 s atrae todos los objetos del mapa y lanza tres golpes por los anillos a enemigos.', d2: '+25 % de Pokémonedas.', aura: true,
      start: pl => { pl.coinMul *= 1.25; },
      tick: tick('rings', 10, pl => { if (G.Pickups && G.Pickups.pullAll) G.Pickups.pullAll(); zap(pl, 3, 300, 5, '#ffcf4d', 'psychic'); }), pts: 4 }),
    'steam-blast': L({ d: 'El Agua le cura en vez de dañarle; +12 % de daño de tipo Fuego y Agua.', d2: 'Le rodea un vapor que quema a los enemigos a menos de 100 px.', absorb: 'water', aura: true,
      out: typeK(['fire', 'water'], 1.12), tick: (pl, dt) => aura(pl, dt, 'steam', 1.2, 100, e => { e.applyBurn(1); strike(pl, e, 0.4, '#f0f0f0'); }) }),
    // --- Alola ---
    'rks-system': L({ d: 'Memoria adaptativa: sus golpes nunca son poco eficaces.', d2: 'Cada 14 s descarga su memoria: una onda de su tipo daña a los de alrededor.', aura: true,
      tick: tick('rks', 14, pl => nova(pl, 170, 3.5, '#c8d4e8')),
      out: (pl, m, e) => { const k = e ? mult(m.type, e.types) : 1; return k > 0 && k < 1 ? 1 / k : 1; } }),
    'electric-field': L({ d: 'Campo eléctrico a su alrededor: cada segundo descarga sobre los enemigos a menos de 140 px y los frena.', d2: '+10 % de velocidad.', aura: true,
      speed: () => 1.1, tick: (pl, dt) => aura(pl, dt, 'efield', 1, 140, e => { strike(pl, e, 0.6, ELEC); e.applySlow(0.3, 1); }) }),
    'psychic-field': L({ d: 'Campo psíquico: los enemigos no se le pueden pegar (cada medio segundo los aparta y los daña).', d2: '+20 % de daño con movimientos de tipo Psíquico.', aura: true,
      out: typeK(['psychic'], 1.2), tick: (pl, dt) => aura(pl, dt, 'pfield', 0.5, 85, e => strike(pl, e, 0.7, PSY, 260)) }),
    'grassy-field': L({ d: 'Campo de hierba: recupera un 1,2 % de vida por segundo.', d2: 'Los enemigos a menos de 140 px se enredan: frenados un 30 %.', aura: true,
      regenK: 0.012, tick: (pl, dt) => aura(pl, dt, 'gfield', 0.5, 140, e => e.applySlow(0.3, 0.7)) }),
    'misty-field': L({ d: 'Campo de niebla: recibe un 12 % menos de daño y la mitad de daño de Dragón.', d2: 'Cada 12 s, la niebla le cura un 8 % y le quita los frenazos.',
      inMul: (pl, type) => (type === 'dragon' ? 0.5 : 0.88), steady: true, tick: (pl, dt) => { if (every(pl, 'mfield', 12, dt)) { heal(pl, 0.08); pl.slowT = 0; } } }),
    'full-metal-body': L({ d: 'Metal solar: nada le frena y recibe un 10 % menos de daño.', d2: 'Cada 12 s, una llamarada solar daña y quema a todo lo de alrededor.', steady: true, aura: true,
      inMul: allIn(0.9), tick: tick('flare', 12, pl => { say(pl, 'full-metal-body', '#ffd36b'); nova(pl, 200, 4, '#ffd36b', e => e.applyBurn(2)); }) }),
    'shadow-shield': L({ d: 'Con la vida casi llena recibe un 40 % menos de daño.', d2: 'Cada 12 s, un eclipse frena un 50 % a los enemigos de alrededor 3 s y los daña.', aura: true,
      inMul: pl => (nearFull(pl) ? 0.6 : 1), tick: tick('eclipse', 12, pl => nova(pl, 220, 3, GHOST, e => e.applySlow(0.5, 3))) }),
    'prism-armor': L({ d: 'Los ataques muy eficaces le hacen un 35 % menos; devora la luz de los que derrota: +0,1 % de daño cada uno (hasta +15 %).', d2: 'Cada 15 s dispara seis rayos de prisma.', aura: true,
      inMul: (pl, type) => (superEff(pl, type) ? 0.65 : 1), kill: pl => { pl.prismK = Math.min(0.15, (pl.prismK || 0) + 0.001); }, out: pl => 1 + (pl.prismK || 0),
      tick: tick('prism', 15, pl => zap(pl, 6, 300, 3, '#fff4c0', 'psychic')) }),
    'soul-heart': L({ d: 'Corazón artificial: cada enemigo derrotado le da +0,3 % de daño especial hasta acabar la partida (hasta +30 %).', d2: 'Sus movimientos se recargan un 10 % antes.',
      cdMul: 0.9, kill: pl => { pl.soulK = Math.min(0.3, (pl.soulK || 0) + 0.003); }, out: (pl, m) => (cls(m) === 's' ? 1 + (pl.soulK || 0) : 1) }),
    'shadow-thief': L({ d: '+30 % de daño con cuerpo a cuerpo y embestidas.', d2: 'Cada 5 s golpea la sombra de los 2 enemigos más cercanos: daño y los deja aturdidos.', aura: true,
      out: (pl, m) => (close(m) ? 1.3 : 1.05), tick: tick('sthief', 5, pl => zap(pl, 2, 200, 5, GHOST, 'ghost', e => e.applyStun(0.5), true)) }),
    'volt-rush': L({ d: '+15 % de velocidad.', d2: 'Mientras corre se carga: cada 4 s suelta una descarga que daña y frena a los de alrededor.', aura: true,
      speed: () => 1.15, tick: (pl, dt) => { if (pl.walking && live(pl) && every(pl, 'vrush', 4, dt)) nova(pl, 110, 3.5, ELEC, e => e.applySlow(0.5, 1.5)); } }),
    'molten-metal': L({ d: 'Recibe un 20 % menos de daño físico.', d2: 'Cada golpe que recibe le carga (10 cargas): entonces suelta un doble puñetazo de hierro enorme a los de alrededor.', aura: true,
      inMul: (pl, type, c) => (c === 'p' ? 0.8 : 1),
      hurt: pl => { const o = S(pl); o.melN = (o.melN || 0) + 1; if (o.melN >= 10 && live(pl)) { o.melN = 0; say(pl, 'molten-metal', STEEL); G.Camera.kick(0.6); nova(pl, 160, 10, STEEL, null, 300); } } }),
    // --- Galar ---
    'intrepid-sword': L({ d: '+10 % de daño.', d2: 'Cada 10 s, la espada da un tajo en círculo enorme a los de alrededor.', aura: true,
      out: allOut(1.1), tick: tick('isword', 10, pl => { G.FX.slash(pl.x, pl.y, pl.aim || 0, 150, 6.2, '#9ad0ff'); nova(pl, 150, 5, '#9ad0ff'); }) }),
    'dauntless-shield': (() => { const g = guard('dauntless-shield', 25, '', '#e07a5a', '', pl => nova(pl, 130, 3, '#e07a5a', e => e.applyStun(1.2), 300));
      return L(Object.assign({}, g, { d: 'Cada 25 s, el siguiente golpe no le hace daño y su escudo golpea y aturde 1,2 s a los de alrededor.', d2: '+15 % de daño con cuerpo a cuerpo y embestidas.', aura: true,
        out: (pl, m) => (close(m) ? 1.15 : 1) })); })(),
    'eternabeam': L({ d: '+15 % de vida máxima.', d2: 'Cada 15 s dispara el Rayo Infinito hacia donde apunta: atraviesa la pantalla y hace un daño enorme.', aura: true,
      hpMul: 1.15, tick: tick('eterna', 15, pl => { say(pl, 'eternabeam', '#ff4d7a'); G.Camera.kick(0.6); lance(pl, 460, 60, 13, '#ff4d7a', 'dragon'); }) }),
    'unseen-fist': L({ d: '+15 % de daño y +20 % con cuerpo a cuerpo; sus golpes rompen los escudos de los enemigos.', d2: '+12 % de probabilidad de golpe crítico.',
      out: (pl, m) => (close(m) ? 1.35 : 1.15), start: pl => { pl.critChance += 0.12; },
      hit: (pl, e) => { if (!e.remote && e.shield > 0) { e.shield = 0; e.shieldT = 0; } } }),
    'transistor': L({ d: '+30 % de daño con movimientos de tipo Eléctrico y +10 % de velocidad.', d2: 'Cada 3 s, un rayo al enemigo más cercano.', aura: true,
      out: typeK(['electric'], 1.3), speed: () => 1.1, tick: tick('trans', 3, pl => zap(pl, 1, 240, 2.5, ELEC, 'electric', null, true)) }),
    'dragons-maw': L({ d: '+20 % de daño con movimientos de tipo Dragón.', d2: 'Cada 10 s suelta una onda de energía de dragón: hace más daño cuanta más vida tiene.', aura: true,
      out: typeK(['dragon'], 1.2), tick: tick('maw', 10, pl => nova(pl, 170, 2 + 5 * pl.hp / pl.maxHp, DRAGON)) }),
    'chilling-neigh': L({ d: 'Cada enemigo derrotado: +1 % de daño (hasta +20 %) y, 1 de cada 3 veces, congela a los que tenía al lado.', aura: true,
      kill: (pl, e) => { pl.chillK = Math.min(0.2, (pl.chillK || 0) + 0.01); if (e && Math.random() < 1 / 3 && live(pl)) { G.FX.ring(e.x, e.y, 6, 70, ICE, 0.35, 3); for (const f of foes(pl, 70, e.x, e.y)) f.applyStun(0.8); } },
      out: pl => 1 + (pl.chillK || 0) }),
    'grim-neigh': L({ d: 'Cada enemigo derrotado: +1 % de daño especial (hasta +20 %) y su alma golpea al enemigo más cercano (como mucho una por segundo).', aura: true,
      kill: (pl) => { pl.grimK = Math.min(0.2, (pl.grimK || 0) + 0.01); if (live(pl) && cool(pl, 'grim', 1)) zap(pl, 1, 220, 5, GHOST, 'ghost', null, true); },
      out: (pl, m) => (cls(m) === 's' ? 1 + (pl.grimK || 0) : 1) }),
    'as-one': L({ d: 'Unidad ecuestre: +10 % de daño y +10 % de velocidad.', d2: 'Cada 12 s siembra 6 enemigos: les hace daño y recupera un 1 % de vida por cada uno.', aura: true,
      out: allOut(1.1), speed: () => 1.1, tick: tick('asone', 12, pl => { for (const e of zap(pl, 6, 280, 1.5, GRASS, 'grass')) heal(pl, 0.01); }) }),
    'overflowing-love': L({ d: 'Quien le golpea cuerpo a cuerpo se enamora (quieto 1,2 s).', d2: '+20 % de daño de tipo Hada. Cada 12 s, una lluvia de corazones enamora a los de alrededor.', aura: true,
      out: typeK(['fairy'], 1.2), contact: (pl, e) => e.applyStun(1.2), tick: tick('love', 12, pl => nova(pl, 160, 3, FAIRY, e => e.applyStun(1.2))) }),
    // --- Paldea ---
    'beads-of-ruin': L({ d: 'Abalorio debacle: los enemigos a menos de 160 px reciben +25 % de su daño.', d2: 'Deja brasas al andar: quema a los enemigos que se le acercan.', aura: true,
      out: (pl, m, e) => (e && dist2(e, pl) < 160 * 160 ? 1.25 : 1), tick: (pl, dt) => aura(pl, dt, 'beads', 1, 80, e => e.applyBurn(1)) }),
    'orichalcum-pulse': L({ d: 'Pone sol al empezar y cada 3 minutos. +12 % de daño físico; con sol, +30 %.', d2: 'Con sol, cada enemigo que derrota le cura un 0,4 % de vida.', summon: 'sun',
      out: (pl, m) => (cls(m) === 'p' ? (wx() === 'sun' ? 1.3 : 1.12) : 1.04), kill: pl => { if (wx() === 'sun') heal(pl, 0.004); } }),
    'toxic-mind': L({ d: 'Sus golpes envenenan 1 de cada 3 veces y cada 6 s su mente envenena a 3 enemigos.', d2: 'Cada segundo, su mente daña a los enemigos envenenados a menos de 220 px.', aura: true,
      hit: (pl, e) => { if (Math.random() < 1 / 3) e.applyPoison(1); },
      tick: (pl, dt) => { aura(pl, dt, 'tmind', 1, 220, e => { if (e.poison > 0) strike(pl, e, 1.2, PSY); }); if (live(pl)) for (let n = every(pl, 'tmind2', 6, dt); n > 0; n--) zap(pl, 3, 260, 2, POISON, 'poison', e => e.applyPoison(2)); } }),
    'toxic-perfume': L({ d: 'Su perfume envenena cada segundo a los enemigos a menos de 120 px y los deja embobados (frenados un 30 %).', d2: '+15 % de daño a los envenenados.', aura: true,
      out: (pl, m, e) => (e && e.poison > 0 ? 1.15 : 1), tick: (pl, dt) => aura(pl, dt, 'perfume', 1, 120, e => { e.applyPoison(1); e.applySlow(0.3, 1.2); }) }),
    'masked-fury': L({ d: 'Cada golpe que recibe le da +6 % de daño durante 8 s (hasta 5 veces).', d2: 'Con 5 cargas, el garrote estalla: un golpe enorme a los de alrededor (cada 6 s).', aura: true,
      hurt: pl => { pl.addBuff('atk', 0.06, 8, 5); const o = S(pl); o.ogN = (o.ogN || 0) + 1; if (o.ogN >= 5 && live(pl) && cool(pl, 'og', 6)) { o.ogN = 0; say(pl, 'masked-fury', GRASS); nova(pl, 150, 8, GRASS, null, 260); } } }),
    'tera-shift': L({ d: 'Teraestelar: +12 % de daño.', d2: 'Cada 20 s se cubre de cristal 6 s: recibe la mitad de daño.',
      out: allOut(1.12), tick: pl => { if (!(ago(pl, 'tera') < 20)) { S(pl).tera = now(); say(pl, 'tera-shift', '#bfe8ff'); G.FX.ring(pl.x, pl.y, pl.r * 3, pl.r, '#bfe8ff', 0.5, 4); } },
      inMul: pl => (ago(pl, 'tera') < 6 ? 0.5 : 1) }),
    'poison-puppeteer': L({ d: 'Sus ataques cuerpo a cuerpo y embestidas envenenan; +20 % de daño a los envenenados.', d2: 'Cada 6 s sus cadenas envenenan y dañan a 4 enemigos, y los envenenados de cerca quedan como marionetas: muy frenados.', touchPoison: true, aura: true,
      out: (pl, m, e) => (e && e.poison > 0 ? 1.2 : 1), hit: (pl, e) => { if (Math.random() < 0.2) e.applyPoison(1); },
      tick: (pl, dt) => { aura(pl, dt, 'puppet', 0.5, 150, e => { if (e.poison > 0) e.applySlow(0.5, 0.7); }); if (live(pl)) for (let n = every(pl, 'chains', 6, dt); n > 0; n--) zap(pl, 4, 260, 3, POISON, 'poison', e => e.applyPoison(2)); } })
  });
  /** Pasiva genérica (por si una habilidad nueva aún no tiene efecto): +8 % con los movimientos de su tipo principal. */
  function generic(mon) {
    const t = mon.types[0];
    return { generic: true, d: '+8 % de daño con movimientos de tipo ' + TN(t) + '.', out: (pl, m) => (m.type === t ? 1.08 : 1) };
  }

  /** Efecto de la habilidad `id` para el Pokémon `mon` (nunca null). */
  function of(id, mon) {
    return (id && FX[id]) || generic(mon);
  }

  /**
   * Al empezar la partida: pone en pl lo que hace la habilidad fx (player.js setAbility y
   * tools/balance.cjs). Lo que va con la fase (mon) se vuelve a poner al evolucionar (stage):
   * antes, Potencia y Energía Pura se perdían en la primera evolución.
   */
  function begin(pl, fx) {
    if (fx.cdMul) pl.cdMul *= fx.cdMul;
    pl.regenK = fx.regenK || 0;
    pl.abS = {}; pl.abShield = 0;
    if (fx.hpMul) { pl.maxHp = Math.round(pl.maxHp * fx.hpMul); pl.hp = pl.maxHp; }
    if (fx.mon) { fx.mon(pl.mon); pl.baseAtk = pl.mon.atk; }
    if (fx.start) fx.start(pl);
  }
  /** Al evolucionar: lo de la fase, sobre la nueva (m: copia de G.Mons.formFor, aún sin poner). */
  function stage(fx, m) { if (fx && fx.mon) fx.mon(m); }

  return { FX, of, begin, stage, pow, foeOf };
})();
