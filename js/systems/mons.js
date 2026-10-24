/* ============ mons.js — naturaleza, habilidad y MT de cada Pokémon ============
 * (20-10-2026, de la Tienda Kecleon del PR #236 de TheAdro7, adaptado.)
 *
 * Cada Pokémon de tu colección tiene:
 *   - NATURALEZA (data/natures.js): +10 % a un stat y −10 % a otro, como en los
 *     juegos (5 son neutras). Se cambia con una Menta.
 *   - HABILIDAD (data/abilities.js, efecto en data/ability-fx.js): una de las
 *     suyas; la oculta sale 1 de cada 20. Se cambia con una Cápsula Habilidad
 *     (la oculta, con la Cápsula Habilidad Oculta).
 *   - MT aprendidas: ataques que no son de sus tipos pero sí los aprende en los
 *     juegos (Mewtwo, Bola Sombra; Psyduck, Lanzallamas no). Salen en sus cartas
 *     de nivel y se pueden elegir de movimiento inicial (G.Moves.poolFor).
 *
 * Lo que le TOCÓ (naturaleza y habilidad) no se guarda: sale "al azar" pero fijo
 * para cada cuenta y Pokémon (semilla: fecha de creación de la partida + nº de la
 * Pokédex), así todos los aparatos de la misma cuenta ven lo mismo y también los
 * Pokémon que ya tenías antes de esto tienen la suya. Lo cambiado con Menta o
 * Cápsula sí se guarda (save.pnat / save.pabil, con la fecha para fusionar).
 */
G.Mons = (() => {
  const HIDDEN_RATE = 1 / 20;
  const save = () => G.DB && G.DB.save;

  /** Nombre en el idioma del juego: [es, en, fr, it, zh-Hans, zh-Hant] (pt-BR, el inglés). */
  const LANG_I = { es: 0, en: 1, fr: 2, it: 3, 'pt-BR': 1, 'zh-Hans': 4, 'zh-Hant': 5 };
  function name(n) {
    if (!Array.isArray(n)) return String(n || '');
    return n[LANG_I[G.I18n ? G.I18n.lang : 'es'] || 0] || n[1] || n[0];
  }

  // Número pseudoaleatorio fijo para (cuenta, Pokémon, sal), entre 0 y 1.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  const roll = (dex, salt) => hash(((save() && save().created) || 0) + ':' + dex + ':' + salt);

  // ---------------- naturaleza ----------------

  /** La que le tocó (sin Menta). */
  function rolledNature(dex) { return G.NATURES[Math.floor(roll(dex, 'nat') * G.NATURES.length)]; }
  /** La que tiene ahora: la de la Menta o la que le tocó. */
  function natureOf(dex) {
    const s = save(), p = s && s.pnat && s.pnat[dex];
    return (p && G.NATURE_BY[p[0]]) || rolledNature(dex);
  }
  function setNature(dex, id) {
    const s = save();
    if (!s || !G.NATURE_BY[id]) return;
    s.pnat = s.pnat || {};
    s.pnat[dex] = [id, Date.now()];
  }

  /**
   * El Pokémon con su naturaleza aplicada (una copia: G.DEX_BY no se toca).
   * pa/sa: daño de sus ataques físicos/especiales · df/sd: defensas · spd: velocidad.
   */
  function monFor(dex) { return formFor(dex, dex); }

  /**
   * Una fase de su línea con lo de TU Pokémon (24-10-2026, evoluciones en partida):
   * los stats y tipos de `form`, con la naturaleza de `dex` (el que elegiste).
   * dex sigue siendo el tuyo (MT, mejoras, récords); form, el sprite y el nombre.
   */
  function formFor(dex, form) {
    const base = G.DEX_BY[form] || G.DEX_BY[dex];
    if (!base) return base;
    const n = natureOf(dex), m = Object.assign({}, base);
    if (n.up) m[n.up] = base[n.up] * 1.1;
    if (n.down) m[n.down] = base[n.down] * 0.9;
    m.atk = Math.max(m.pa, m.sa);
    m.nature = n.id;
    m.dex = dex; m.form = base.dex;
    return m;
  }

  // ---------------- habilidad ----------------

  /** [habilidad 1, habilidad 2 o 0, oculta o 0] */
  const slots = dex => (G.DEX_ABIL && G.DEX_ABIL[dex]) || [0, 0, 0];
  /** Hueco que le tocó: 2 (oculta) 1 de cada 20 si tiene; si no, 0 o 1. */
  function rolledSlot(dex) {
    const l = slots(dex);
    if (l[2] && roll(dex, 'hid') < HIDDEN_RATE) return 2;
    return l[1] && roll(dex, 'abil') < 0.5 ? 1 : 0;
  }
  /** { id, slot }: la de la Cápsula o la que le tocó. */
  function abilityOf(dex) {
    const s = save(), p = s && s.pabil && s.pabil[dex], l = slots(dex);
    let slot = p && l[p[0]] ? p[0] : rolledSlot(dex);
    if (!l[slot]) slot = 0;
    return { id: l[slot] || '', slot };
  }
  /** Huecos a los que se puede cambiar (la oculta, sólo con la Cápsula Oculta). */
  function abilityChoices(dex, hidden) {
    const l = slots(dex), cur = abilityOf(dex).slot;
    return [0, 1, 2].filter(i => l[i] && i !== cur && (i < 2 || hidden) && !(i === 1 && l[1] === l[0]));
  }
  function setAbility(dex, slot) {
    const s = save();
    if (!s || !slots(dex)[slot]) return;
    s.pabil = s.pabil || {};
    s.pabil[dex] = [slot, Date.now()];
  }
  const abilityName = id => (id && G.ABIL[id] ? name(G.ABIL[id]) : '');

  // ---------------- MT ----------------

  /** Movimientos que ha aprendido con MT. */
  function taught(dex) {
    const s = save(), l = s && s.ptm && s.ptm[dex];
    return Array.isArray(l) ? l.filter(id => G.Moves.BY_ID[id]) : [];
  }
  /** ¿Ya lo sabe sin MT (es de sus tipos)? */
  const natural = (dex, id) => G.Moves.poolFor(G.DEX_BY[dex], true).includes(id);
  /** MT que puede aprender (las que no sabe ya). */
  function learnable(dex) { return G.TM_OF(dex).filter(id => G.Moves.BY_ID[id] && !natural(dex, id) && !taught(dex).includes(id)); }
  const canLearn = (dex, id) => learnable(dex).includes(id);
  /** Enseña una MT de la Mochila (se gasta). → true si se ha aprendido. */
  function teach(dex, id) {
    const s = save();
    if (!s || !canLearn(dex, id) || !G.Shop.takeTm(id)) return false;
    s.ptm = s.ptm || {};
    s.ptm[dex] = taught(dex).concat([id]);
    return true;
  }

  return { name, natureOf, setNature, rolledNature, monFor, formFor, abilityOf, abilityChoices, setAbility, abilityName,
           slots, taught, learnable, canLearn, teach, natural };
})();

/* ============ G.Evo — evoluciones en partida (24-10-2026) ============
 * Se empieza la partida con la PRIMERA fase de la línea de tu compañero (si eliges
 * Charizard, sales como Charmander) y evoluciona durante la partida según su
 * método de los juegos (data/evolutions.js, de PokeAPI):
 *   - por nivel: el de los juegos pasado al de la partida (runLevel);
 *   - piedra u objeto: aparece en el suelo cerca de ti al nivel equivalente;
 *   - intercambio: al nivel equivalente, o antes en grupo junto a un compañero;
 *   - amistad: al nivel equivalente; saber un movimiento: al aprenderlo (o al nivel);
 *   - los raros: monedas, pasos, jefes, daño recibido o enemigos derrotados;
 *   - bebés (Pichu, Igglybuff...): su primera evolución es rápida.
 * Ramas (Eevee, Tyrogue, Wurmple...): si elegiste una forma concreta, la línea va
 * hacia esa; si no, al llegar el momento se elige con una carta (ui/evo-ui.js).
 * Mejoras, naturaleza, habilidad y récords siguen siendo del que elegiste (pl.dex);
 * la fase de ahora es pl.form (sprite, stats y tipos: G.Mons.formFor).
 * Lo que se ve (aviso, carta, piedra, ficha de la colección) está en ui/evo-ui.js.
 */
G.Evo = (() => {
  const E = () => G.EVO || {};
  let KIDS = null;

  /** Cómo se llega a dex (o null si no evoluciona de nada que esté en el juego). */
  function rule(dex) { const r = E()[dex]; return r && G.DEX_BY[dex] && G.DEX_BY[r.f] ? r : null; }
  /** En qué evoluciona dex (los del juego). */
  function kids(dex) {
    if (!KIDS) {
      KIDS = {};
      for (const k in E()) { const r = rule(+k); if (r) (KIDS[r.f] = KIDS[r.f] || []).push(+k); }
    }
    return KIDS[dex] || [];
  }
  /** De la primera fase al elegido: Charizard → [4, 5, 6]. */
  function path(dex) {
    const out = [dex];
    for (let n = 0; n < 6 && rule(out[0]); n++) out.unshift(rule(out[0]).f);
    return out;
  }
  const base = dex => path(dex)[0];
  /** Todos los de su línea desde la primera fase (para precargar los sprites). */
  function family(dex) {
    const out = [], todo = [base(dex)];
    while (todo.length && out.length < 20) { const d = todo.shift(); if (out.includes(d)) continue; out.push(d); todo.push(...kids(d)); }
    return out;
  }

  /*
   * Nivel de los juegos → nivel de la partida: la mitad hasta el 36 y, de ahí en
   * adelante, 0,4 por nivel. Una partida de 30 min acaba hacia el nivel 25-35 (los
   * logros piden 15 y 30; medido con partidas de prueba el 24-10-2026), así que un
   * inicial (16 y 36) evoluciona al 8 y llega a su forma final al 18, hacia la mitad
   * de la partida; los que van muy tarde en los juegos, más tarde (Dragonite, 55 →
   * 26; Hydreigon, 64 → 29), pero se llega en una partida buena.
   */
  function runLevel(lv) { return Math.max(2, Math.round(lv <= 36 ? lv / 2 : 18 + (lv - 36) * 0.4)); }
  const QUICK = 3;                     // bebés: su primera evolución
  /** Nivel de la partida al que le toca (o, si va por otra cosa, el de reserva). */
  function levelOf(r) { return r.q ? QUICK : runLevel(r.lv || 30); }
  // Los raros (monedas, pasos...): si no se cumple, evoluciona igual unos niveles después.
  const LATE = 8;
  const STEP = 32;                     // un paso: un tile

  /** ¿Sabe el movimiento que pide (o uno de su tipo)? */
  function knows(pl, r) {
    if (r.mv) return pl.hasMove(r.mv);
    if (r.mt) return pl.moves.some(m => m.type === r.mt);
    return false;
  }

  /**
   * ¿Se cumple ya lo que pide r? (ev: el estado de la partida, pl.evo)
   * mate: segundos que llevas junto a un compañero (intercambio en grupo).
   */
  function ready(pl, r) {
    const ev = pl.evo, L = levelOf(r), lv = pl.level;
    switch (r.k) {
      case 'lv': return lv >= L && (!r.wx || lv >= L + 4 || ((G.Weather.current || {}).kind === r.wx));
      case 'move': return lv >= L || knows(pl, r);
      case 'trade': return lv >= L || (ev.mate >= 1.5 && lv >= L - 4);
      case 'coins': return pl.coins >= r.n || lv >= L + LATE;
      case 'steps': return ev.steps >= r.n * STEP || lv >= L + LATE;
      case 'bosses': return pl.bosses >= r.n || lv >= L + LATE;
      case 'damage': return pl.dmgTaken >= r.n || lv >= L + LATE;
      case 'kills': return pl.kills >= r.n || lv >= L + LATE;
      default: return lv >= L;          // 'item' (sale la piedra), 'friend'
    }
  }

  // ---------------- en la partida ----------------

  /** Al empezar: la primera fase y lo que hay que llevar. Devuelve el dex de la primera fase. */
  function start(pl, chosen) {
    pl.evo = { plan: path(chosen), i: 0, steps: 0, mate: 0, lx: pl.x, ly: pl.y, item: null, t: 0, wait: null };
    return pl.evo.plan[0];
  }

  /** Las evoluciones a las que puede ir ahora (la del plan, o las de su rama). */
  function options(pl) {
    const ev = pl.evo;
    if (!ev) return [];
    if (ev.i + 1 < ev.plan.length) return [ev.plan[ev.i + 1]];
    return kids(ev.plan[ev.i]);
  }

  /**
   * Cada fotograma (game.js, sólo jugando). Devuelve lo que toca hacer:
   *   null · { dex } evolucionar ya · { choose: [dex...] } elegir rama ·
   *   { item: dex, it } aparece su objeto en el suelo.
   */
  function tick(pl, dt) {
    const ev = pl.evo;
    if (!ev || pl.dead) return null;
    // Pasos (sólo los tuyos, sin saltos de la grieta).
    const d = Math.hypot(pl.x - ev.lx, pl.y - ev.ly);
    if (d < 200) ev.steps += d;
    ev.lx = pl.x; ev.ly = pl.y;
    // Junto a un compañero (intercambio).
    let near = false;
    if (G.Coop.active) for (const p of G.Coop.puppets()) if (!p.dead && G.U.dist2(p.x, p.y, pl.x, pl.y) < 70 * 70) near = true;
    ev.mate = near ? ev.mate + dt : 0;
    if (ev.item || ev.wait) return null;            // ya hay un objeto en el suelo o una carta abierta
    if ((ev.t -= dt) > 0) return null;
    ev.t = 0.25;                                    // se mira 4 veces por segundo
    const opts = options(pl);
    if (!opts.length) return null;
    const ok = opts.filter(dex => ready(pl, rule(dex)));
    if (!ok.length) return null;
    if (opts.length > 1) return { choose: opts };
    const r = rule(opts[0]);
    if (r.k === 'item' && !r.q) return { item: opts[0], it: r.it };
    return { dex: opts[0], via: r.k === 'trade' && ev.mate >= 1.5 && pl.level < levelOf(r) ? 'mate' : '' };
  }

  /** Ya ha evolucionado a dex (o la has elegido): sigue la línea desde ahí. */
  function advance(pl, dex) {
    const ev = pl.evo;
    if (!ev) return;
    if (ev.plan[ev.i + 1] !== dex) { ev.plan = ev.plan.slice(0, ev.i + 1); ev.plan.push(dex); }
    ev.i++;
    ev.item = null; ev.wait = null; ev.t = 0.5;
  }

  /** La próxima evolución (si sólo hay una) y a qué nivel: para el aviso. → { dex, r, lv } | { many } | null */
  function nextOf(pl) {
    const o = options(pl);
    if (!o.length) return null;
    if (o.length > 1) return { many: o, lv: Math.min(...o.map(d => levelOf(rule(d)))) };
    const r = rule(o[0]);
    return { dex: o[0], r, lv: levelOf(r) };
  }

  /**
   * La línea que se verá en partida eligiendo `dex`, para la ficha de la colección:
   * [{ dex, r }] desde la primera fase (r: cómo se llega, null la primera), y
   * después, si sigue: { branch: [dex...] } (se elige) o más pasos.
   */
  function line(dex) {
    const out = path(dex).map((d, i) => ({ dex: d, r: i ? rule(d) : null }));
    for (let n = 0; n < 4; n++) {
      const k = kids(out[out.length - 1].dex);
      if (!k.length) break;
      if (k.length > 1) { out.push({ branch: k }); break; }
      out.push({ dex: k[0], r: rule(k[0]) });
    }
    return out;
  }

  return { rule, kids, path, base, family, runLevel, levelOf, ready, start, options, tick, advance, nextOf, line, knows, STEP, QUICK };
})();
