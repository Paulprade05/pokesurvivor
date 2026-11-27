/* ============ encounters.js — encuentros del mapa (1.0, bloque E, 25-11-2026) ============
 * Lo decidió el dueño (nota del vault «Bloque E - Encuentros», «Decisiones del dueño», 1.0):
 *
 * Ritmo: 1-2 encuentros por tramo de 5 min, COLOCADOS EN EL MUNDO ESPERÁNDOTE: aparecen fuera de la vista, a 1-2
 *   pantallas, y se encuentran explorando. Sin avisos, sin flechas ni marcas en el borde. Sólo al tenerlos al alcance sale
 *   su botón, como el de los cofres (interact.js). Se quedan hasta que los usas (como mucho MAX_ALIVE sin usar: si sobran,
 *   se va el más viejo que no se ve).
 *
 *   shop       Kecleon, tendero ambulante. Gasta LAS MONEDAS QUE TE LLEVARÍAS A LA CUENTA (purse: tiempo, derrotados,
 *              jefes y recogidas, con tu Fortuna, menos lo gastado: endRun lo descuenta). Vende un objeto con rareza,
 *              curarte, una vitamina, suerte, un huevo (bloque G) y maldición (bloque F).
 *              No vende cambiar cartas. Una visita por Kecleon: al irte, se va.
 *   temple     Templo de vitaminas: quedarte en su círculo lo carga (salir lo descarga); lleno, eliges 1 de 3 vitaminas con
 *              rareza (G.Vitamins) y te da suerte. Una vez por jugador.
 *   smeargle   Smeargle: olvidas un ataque SUELTO (no fusionado). El olvidado puede volver a salir en las cartas.
 *   challenge  Santuario de reto: lo activas y salen enemigos de élite CHALLENGE_T s. Si aguantas en su círculo, objeto
 *              épico (70 %) o legendario (30 %) y suerte. Si te alejas más de AWAY_T s seguidos o caes, nada.
 *   machine    Porygon: sube un escalón la rareza de uno de tus objetos (conserva su evolución). Una vez por máquina.
 *   egg        Chansey (bloque G, systems/companion.js): una vez por partida, en el 2.º tramo después de la grieta; te da un
 *              huevo (eliges si te lo quedas). Kecleon también los vende. Una visita: al irte, se va.
 *   curse      Santuario maldito (bloque F, systems/curse.js): lo tocas y eliges si aceptas un nivel más de maldición (enemigos
 *              más duros el resto de la partida, a cambio de experiencia, monedas y suerte). Uno por tramo desde el minuto 5.
 *              Si dices que no, se apaga para ti. En grupo, la maldición es del grupo (la sube el anfitrión).
 *
 * Precios (dueño, 25-11-2026, «medios»): curar 80, vitamina 200, objeto 300, suerte 250, +5 % por minuto de partida,
 *   ×1,3 / ×1,7 / ×2,2 si es raro / épico / legendario y +25 % cada vez que compras lo mismo. Máquina: a raro 400, a épico
 *   800, a legendario 1.200 (+5 %/min). Suerte (dueño, «media»): templo +5 %, Kecleon +10 % (hasta 2 por tienda), reto +15 %.
 *
 * Cooperativo: el anfitrión los coloca y avisa ('enc', 'a': el invitado los pone en el mismo sitio). Lo demás es de cada
 *   uno (cada ordenador lo suyo, nada por la red): tu bolsa, tu templo, tu Smeargle, tu máquina. El reto es compartido: lo
 *   lleva el anfitrión (salen sus enemigos), y al acabar cada uno cobra si estaba en el círculo.
 *
 * El bot de tools/curve.cjs los juega por su contrato: tipos en G.World.specialsNear, used/done, p.r y p.charge del
 *   templo, y la pantalla #scr-encounter (ui/encounter-ui.js) con sus cartas data-kind / data-id / data-r / data-price.
 * Registro: G.Reg.v1.encounter (al verlo), .buy, .vitamin; la suerte, G.Fortune.add.
 */
G.Vitamins = (() => {
  const B = G.PowerBudget.VIT;
  /** Lo que suma cada toma según su rareza y el tope de cada vitamina (del presupuesto de poder). */
  const VIT = {};
  for (const id in B) VIT[id] = { stat: B[id].stat, step: B[id].step.slice(), cap: B[id].cap };
  const NAME = { hpup: 'Más PS', protein: 'Proteína', calcium: 'Calcio', iron: 'Hierro', zinc: 'Zinc', carbos: 'Carburante', ppup: 'Más PP' };
  const IDS = Object.keys(VIT);
  const r3 = v => Math.round(v * 1000) / 1000;
  const taken = (pl, id) => (pl && pl.vit && pl.vit[id]) || 0;
  const left = (pl, id) => Math.max(0, r3(VIT[id].cap - taken(pl, id)));
  /** Lo que sumaría una toma de rareza r (ya con el tope). */
  const gain = (pl, id, r) => Math.min(left(pl, id), VIT[id].step[Math.max(0, Math.min(3, r | 0))]);
  const full = pl => IDS.every(id => left(pl, id) <= 1e-9 || (id === 'ppup' && !ppTarget(pl)));

  /** Más PP: el ataque al que va (el que más daño ha hecho de los que lanzan varios). */
  function ppTarget(pl) {
    if (!pl || !pl.moves) return null;
    let best = null;
    for (const m of pl.moves) {
      if (!G.Moves.passiveKeys(m.kind, 'amt').includes('count') || typeof m.count !== 'number' || G.Moves.nonAttacking(m.kind)) continue;
      if (!best || (m.dealt || 0) > (best.dealt || 0)) best = m;
    }
    return best;
  }

  const fmt = (t, ...x) => G.I18n.f(t, ...x);
  const pc = v => Math.round(v * 100);
  /** Qué hace (con lo que sumaría de verdad). */
  function desc(pl, id, r, m) {
    const g = gain(pl, id, r);
    if (id === 'ppup') return m ? fmt('+1 de cantidad a {x}', G.T(m.name)) : G.T('+1 de cantidad a un ataque');
    if (g <= 0) return G.T('Ya la tienes al tope');
    switch (id) {
      case 'hpup': return fmt('+{x} % de vida máxima', pc(g));
      case 'protein': return fmt('+{x} % de daño de tus ataques físicos', pc(g));
      case 'calcium': return fmt('+{x} % de daño de tus ataques especiales', pc(g));
      case 'iron': return fmt('−{x} % de daño de los golpes físicos', pc(g));
      case 'zinc': return fmt('−{x} % de daño de los golpes especiales', pc(g));
      case 'carbos': return fmt('+{x} % de velocidad', pc(g));
    }
    return '';
  }
  /** Lo que llevas y su tope: «8 / 15 %», «1 / 2». */
  const progress = (pl, id) => id === 'ppup' ? taken(pl, id) + ' / ' + VIT[id].cap : pc(taken(pl, id)) + ' / ' + pc(VIT[id].cap) + ' %';

  /** Te tomas una vitamina. Devuelve lo sumado (0 si ya estaba al tope). */
  function apply(pl, id, r, m) {
    const g = gain(pl, id, r);
    if (!(g > 0)) return 0;
    pl.vit = pl.vit || {};
    const before = taken(pl, id);
    pl.vit[id] = r3(before + g);
    if (id === 'hpup') {
      // Vida ×(1 + lo sumado) sobre la que tendrías sin Más PS (a la vez que la cura de lo ganado).
      const add = Math.round(pl.maxHp * ((1 + pl.vit.hpup) / (1 + before) - 1));
      if (add > 0) pl.addMaxHp(add);
    } else if (id === 'ppup') {
      m = m || ppTarget(pl);
      if (!m) { pl.vit[id] = before; return 0; }
      m.pp = (m.pp | 0) + 1;
      G.Moves.rebake(m, pl.pass);
    }
    if (G.Reg && G.Reg.v1 && G.Game && pl === G.Game.player) G.Reg.v1.vitamin(id, r, g);
    return g;
  }

  /**
   * n vitaminas para elegir, distintas y sin las que están al tope, con su rareza (con tu suerte). Sobre todo las que te
   * sirven: Proteína si tus ataques son físicos, Calcio si son especiales. [{ id, r, m (Más PP: su ataque) }]
   */
  function offer(pl, n = 3, rnd = Math.random) {
    const atks = (pl.moves || []).filter(m => !G.Moves.nonAttacking(m.kind));
    const phys = atks.length ? atks.filter(m => m.cat === 'physical').length / atks.length : 0.5;
    const W = { hpup: 1.5, protein: 0.4 + 2 * phys, calcium: 0.4 + 2 * (1 - phys), iron: 1, zinc: 1, carbos: 0.8, ppup: 1.4 };
    const pp = ppTarget(pl);
    const pool = IDS.filter(id => left(pl, id) > 1e-9 && (id !== 'ppup' || pp));
    const out = [];
    while (out.length < n && pool.length) {
      const tot = pool.reduce((a, id) => a + W[id], 0);
      let u = rnd() * tot, i = 0;
      for (; i < pool.length - 1; i++) { u -= W[pool[i]]; if (u <= 0) break; }
      const id = pool.splice(i, 1)[0];
      out.push({ id, r: G.Rarity.roll(G.Fortune.of(pl), rnd), m: id === 'ppup' ? pp : null });
    }
    return out;
  }

  // ---- lo que usan player.js (daño, golpes recibidos y velocidad) ----
  /** Daño de un ataque de ese lado (Proteína / Calcio). */
  const atkK = (pl, cat) => { const v = pl && pl.vit; return v ? 1 + ((cat === 'physical' ? v.protein : cat === 'special' ? v.calcium : 0) || 0) : 1; };
  /** Golpes recibidos de ese lado (Hierro / Zinc). */
  const inK = (pl, cat) => { const v = pl && pl.vit; return v ? 1 - ((cat === 'physical' ? v.iron : cat === 'special' ? v.zinc : 0) || 0) : 1; };
  const spdK = pl => 1 + ((pl && pl.vit && pl.vit.carbos) || 0);

  return { VIT, NAME, IDS, taken, left, gain, full, ppTarget, desc, progress, apply, offer, atkK, inK, spdK };
})();

G.Encounters = (() => {
  const TRAMO = 300, MAX_ALIVE = 5, AFTER_RIFT = 190;
  const DIST = [760, 1300];              // a cuánto de ti aparecen (fuera de la vista, a 1-2 pantallas)
  const SEEN_R = 420;                    // a esta distancia cuenta como «encontrado» (registro)
  const TEMPLE_R = 88, TEMPLE_T = 8, CHALLENGE_R = 170, CHALLENGE_T = 30, AWAY_T = 6;
  const LUCK = { temple: 0.05, shop: 0.10, challenge: 0.15 }, LUCK_PER_SHOP = 2;
  const PRICE = { heal: 80, vitamin: 200, item: 300, luck: 250, egg: 250, curse: 250 };
  const RAR_K = [1, 1.3, 1.7, 2.2], MIN_K = 0.05, AGAIN_K = 1.25, MACHINE = [0, 400, 800, 1200];
  /** Qué vende Kecleon. egg: el hueco del bloque G (off: no sale hasta entonces). curse: un nivel de maldición (bloque F). */
  const CATALOG = [
    { kind: 'item' }, { kind: 'heal' }, { kind: 'vitamin' }, { kind: 'luck' },
    { kind: 'egg' }, { kind: 'curse' }
  ];
  /** Los encuentros. dex: el Pokémon que lo lleva (sprite de siempre); art: dibujo hecho con pxl (assets/pxl). */
  const TYPES = {
    shop:      { dex: 352, name: 'Kecleon', act: 'Hablar' },
    temple:    { art: 'temple', name: 'Templo de vitaminas', zone: TEMPLE_R },
    smeargle:  { dex: 235, name: 'Smeargle', act: 'Hablar' },
    challenge: { art: 'shrine', name: 'Santuario de reto', act: 'Retar', zone: CHALLENGE_R },
    machine:   { dex: 137, name: 'Porygon', act: 'Hablar' },
    curse:     { art: 'curse', name: 'Santuario maldito', act: 'Tocar' },   // bloque F (systems/curse.js)
    egg:       { dex: 113, name: 'Chansey', act: 'Hablar' }      // bloque G
  };
  const authority = () => !G.Coop.active || G.Coop.isHost;
  const now = () => (G.Game.st ? G.Game.st.time || 0 : 0);
  const minute = () => now() / 60;

  let list = [], plan = [], nextId = 1, ch = null;   // ch: el reto en marcha { e, t, away, wave }
  const imgs = {};

  // ---------------- el plan de la partida ----------------
  /**
   * Qué sale y cuándo: por cada tramo de 5 min, uno seguro y otro el 60 % de las veces. El 1.º del tramo: templo en los
   * pares, Kecleon en los impares (así hay tienda 3 veces). El 2.º: Smeargle o reto desde el 2.º tramo, la máquina desde
   * el 3.º (ya llevas objetos), o otro templo. Nunca dos iguales en un tramo.
   * (Dueño, 26-11-2026: que no coincidan con la grieta. Las grietas se abren a k·5 min ±22,5 s y, con sus 45 s abierta
   *  y hasta 2 min de arena, acaban como tarde a k·5 min + 187,5 s: el 1.º de cada tramo desde el 2.º sale después,
   *  AFTER_RIFT. Además, con una grieta abierta o en la arena no se coloca ninguno: esperan a que acabe.)
   */
  function makePlan(rnd = Math.random) {
    const out = [];
    for (let k = 0; k < 6; k++) {
      const first = k % 2 ? 'shop' : 'temple';
      out.push({ t: k * TRAMO + (k ? AFTER_RIFT : 35) + rnd() * 40, type: first });
      // (Bloque F, dueño 27-11-2026) Un santuario maldito en cada tramo desde el 2.º; el sorteo de siempre, el 35 % (antes 60 %).
      if (k) out.push({ t: k * TRAMO + 120 + rnd() * 150, type: 'curse' });
      // (Bloque G, dueño 27-11-2026) Chansey una vez por partida: el 2.º del 2.º tramo, después de la grieta y de Kecleon.
      if (k === 1) { out.push({ t: k * TRAMO + AFTER_RIFT + 60 + rnd() * 40, type: 'egg' }); continue; }
      if (k === 0 || rnd() >= 0.35) continue;
      const opts = [['smeargle', 1], ['challenge', 1], ['machine', k >= 2 ? 1 : 0], ['temple', 0.5]].filter(o => o[1] > 0 && o[0] !== first);
      let u = rnd() * opts.reduce((a, o) => a + o[1], 0), pick = opts[0][0];
      for (const o of opts) { u -= o[1]; if (u <= 0) { pick = o[0]; break; } }
      out.push({ t: k * TRAMO + 90 + rnd() * 120, type: pick });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  function reset() {
    list = []; nextId = 1; ch = null;
    plan = makePlan();
    for (const k in TYPES) if (TYPES[k].dex && !TYPES[k].off) G.Sprites.preload([TYPES[k].dex]);
  }

  // ---------------- colocarlos ----------------
  /** Un sitio libre a DIST de pl, fuera de la vista y lejos de los demás encuentros. */
  function spotFor(pl, rnd = Math.random) {
    const view = G.Camera.outerRadius ? G.Camera.outerRadius() : 600;
    for (let i = 0; i < 30; i++) {
      const a = rnd() * 6.2832, d = Math.max(view + 120, DIST[0]) + rnd() * (DIST[1] - DIST[0]);
      const x = Math.round(pl.x + Math.cos(a) * d), y = Math.round(pl.y + Math.sin(a) * d * 0.8);
      if (!G.World.isFree(x, y, 40) || !G.World.isFree(x + 30, y, 20) || !G.World.isFree(x - 30, y, 20)) continue;
      if (G.World.isLiquid && G.World.isLiquid(x, y)) continue;
      if (list.some(e => G.U.dist2(e.x, e.y, x, y) < 500 * 500)) continue;
      if (G.Rift.rift && G.U.dist2(G.Rift.rift.x, G.Rift.rift.y, x, y) < 400 * 400) continue;
      return [x, y];
    }
    return null;
  }

  function make(o) {
    const T = TYPES[o.type];
    const e = Object.assign({ id: nextId++, r: 18, used: false, done: false, charge: 0, seen: false, fade: 0, t0: now() }, o);
    e.enc = true;
    if (T.zone) e.zone = T.zone;
    if (o.type === 'temple') e.r = TEMPLE_R;       // (el bot lee p.r como el radio del círculo)
    if (T.dex) { e.dex = T.dex; e.anim = new G.Sprites.Animator(T.dex, 1); e.anim.dir = 0; }
    list.push(e);
    // Sin sitio para todos: se va el más viejo sin usar que no se ve.
    const idle = list.filter(x => !x.used && !x.done && x !== e && !onScreen(x));
    if (list.filter(x => !x.used && !x.done).length > MAX_ALIVE && idle.length) list.splice(list.indexOf(idle[0]), 1);
    return e;
  }

  function place(type, pl) {
    const at = spotFor(pl);
    if (!at) return null;
    const e = make({ type, x: at[0], y: at[1] });
    if (G.Coop.isHost) G.Coop.broadcast(['enc', 'a', e.id, type, e.x, e.y]);
    return e;
  }

  function onScreen(e) {
    const p = G.Camera.toScreen(e.x, e.y), w = innerWidth, h = innerHeight;
    return p.x > -60 && p.x < w + 60 && p.y > -80 && p.y < h + 60;
  }

  // ---------------- cada fotograma ----------------
  function update(dt, pl) {
    if (!pl) return;
    const t = now();
    if (authority() && !G.Rift.inArena && !G.Rift.rift && !(G.Judgment && G.Judgment.active)) {
      while (plan.length && plan[0].t <= t) {
        const who = G.Game.everyone().filter(p => !p.dead);
        if (!place(plan[0].type, G.U.pick(who.length ? who : [pl]))) break;   // sin sitio: se vuelve a mirar en un momento
        plan.shift();
      }
    }
    for (const e of list) {
      if (e.anim) { e.anim.update(dt); e.anim.loop('Idle'); }
      if (e.type === 'curse' && !e.used && G.Curse.level >= G.Curse.MAX) e.used = true;   // (al tope, los santuarios se apagan)
      if (e.done || e.used) { e.fade = Math.min(1, e.fade + dt); continue; }
      const d2 = G.U.dist2(pl.x, pl.y, e.x, e.y);
      if (!e.seen && d2 < SEEN_R * SEEN_R) { e.seen = true; G.Reg.v1.encounter(e.type); }
      if (e.dex && d2 < 200 * 200) e.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - e.y, pl.x - e.x));
      if (e.type === 'temple') temple(dt, pl, e, d2);
    }
    // Los que ya se han ido (Kecleon, Smeargle, Porygon) desaparecen; templo y santuario se quedan apagados.
    list = list.filter(e => !(e.fade >= 1 && e.dex));
    if (ch) challengeTick(dt);
  }

  // ---------------- templo ----------------
  function temple(dt, pl, e, d2) {
    const inside = !pl.dead && !pl.frozen && d2 < TEMPLE_R * TEMPLE_R;
    e.charge = G.U.clamp(e.charge + (inside ? dt / TEMPLE_T : -dt / (TEMPLE_T * 2)), 0, 1);
    if (inside && Math.random() < dt * 10) G.FX.px(e.x + G.U.rand(-30, 30), e.y - G.U.rand(10, 60), '#ffe9a8', { vy: -40, life: 0.6 });
    if (e.charge < 1) return;
    e.used = true; e.charge = 1;
    G.Audio.sfx('legend');
    G.FX.ring(e.x, e.y - 20, 10, TEMPLE_R, '#ffd23f', 0.6, 5);
    G.Fortune.add(pl, LUCK.temple);
    const opts = G.Vitamins.offer(pl, 3);
    if (!opts.length) { G.Spawner.say(G.I18n.f('Ya tienes todas las vitaminas al tope · +{x} % de suerte', Math.round(LUCK.temple * 100)), 3, true); return; }
    open(e, { kind: 'temple', vit: opts });
  }

  // ---------------- abrir uno (botón 'open', desde interact.js) ----------------
  /** ¿Se puede pulsar ahora? (para el botón de los cofres: interact.js) */
  const pressable = e => !e.used && !e.done && !!TYPES[e.type].act && !(e.type === 'challenge' && ch);

  function press(e) {
    const pl = G.Game.player;
    if (!pl || !pressable(e)) return;
    G.Audio.sfx('select');
    switch (e.type) {
      case 'shop': open(e, { kind: 'shop', offers: shopOffers(pl, e) }); break;
      case 'smeargle': open(e, { kind: 'forget', moves: forgettable(pl) }); break;
      case 'machine': open(e, { kind: 'machine' }); break;
      case 'egg': open(e, { kind: 'egg', egg: e.egg || (e.egg = G.Companion.rollEgg(pl)) }); break;
      case 'curse': open(e, { kind: 'curse' }); break;
      case 'challenge':
        if (authority()) startChallenge(e);
        else G.Coop.toHost(['enc', 'c', e.id]);
        break;
    }
  }

  function open(e, o) { G.EncounterUI.open(e, o); }

  // ---------------- Kecleon ----------------
  /** Las monedas que te llevarías a la cuenta ahora mismo (lo que gastas en Kecleon y en la máquina). */
  function purse(pl) {
    if (!pl) return 0;
    const parts = Math.floor(now() / 5) + Math.floor((pl.kills || 0) * 0.25) + (pl.bosses || 0) * 80 + (pl.coins || 0) + (pl.bonusCoins || 0);
    return Math.max(0, Math.round(parts * (pl.coinMul || 1)) - (pl.spent || 0));
  }
  const r5 = v => Math.max(5, Math.round(v / 5) * 5);
  /** Precio de lo que vende (sube con el minuto, la rareza y cada vez que compras lo mismo). */
  function price(pl, kind, r = 0) {
    const n = (pl && pl.encBuy && pl.encBuy[kind]) || 0;
    const rk = kind === 'item' || kind === 'vitamin' || kind === 'egg' ? RAR_K[r | 0] : 1;
    return r5(PRICE[kind] * (1 + MIN_K * minute()) * rk * Math.pow(AGAIN_K, n));
  }
  const machinePrice = r => r5(MACHINE[Math.min(3, (r | 0) + 1)] * (1 + MIN_K * minute()));

  /** Lo de esta visita: un objeto y una vitamina con su rareza (con tu suerte), curarte y suerte. */
  function shopOffers(pl, e) {
    if (e.offers) return e.offers;
    const out = [];
    for (const c of CATALOG) {
      if (c.off) continue;
      if (c.kind === 'item') {
        const ids = G.Items.LIST.map(i => i.id).filter(id => !pl.items.some(i => i.id === id));
        out.push({ kind: 'item', id: G.U.pick(ids.length ? ids : G.Items.LIST.map(i => i.id)), r: G.Rarity.roll(G.Fortune.of(pl)) });
      } else if (c.kind === 'vitamin') {
        const v = G.Vitamins.offer(pl, 1)[0];
        if (v) out.push({ kind: 'vitamin', id: v.id, r: v.r, m: v.m });
      } else if (c.kind === 'heal') out.push({ kind: 'heal', id: 'heal', r: 0 });
      else if (c.kind === 'luck') out.push({ kind: 'luck', id: 'luck', r: 0, left: LUCK_PER_SHOP });
      else if (c.kind === 'egg') { const g = G.Companion.rollEgg(pl); out.push({ kind: 'egg', id: g.dex, r: g.r }); }
      else if (c.kind === 'curse') out.push({ kind: 'curse', id: 'curse', r: 0 });
    }
    return (e.offers = out);
  }

  /** Compra o (false) no te llega. Los objetos se te dan al despedirte de Kecleon (G.EncounterUI.close). */
  /** ¿Se puede comprar ahora? (te llega, no está vendido y te sirve: con la vida llena no te curas). */
  function canBuy(pl, o) {
    if (o.sold || purse(pl) < price(pl, o.kind, o.r)) return false;
    if (o.kind === 'heal' && pl.hp >= pl.maxHp) return false;
    if (o.kind === 'luck' && G.Fortune.of(pl) >= G.Fortune.MAX) return false;
    if (o.kind === 'vitamin' && !(G.Vitamins.gain(pl, o.id, o.r) > 0)) return false;
    if (o.kind === 'curse' && G.Curse.level >= G.Curse.MAX) return false;
    return true;
  }
  function buy(pl, o, give) {
    if (!canBuy(pl, o)) return false;
    const p = price(pl, o.kind, o.r);
    pl.spent = (pl.spent || 0) + p;
    pl.encBuy = pl.encBuy || {};
    pl.encBuy[o.kind] = (pl.encBuy[o.kind] || 0) + 1;
    G.Reg.v1.buy(o.kind, o.id, o.r, p);
    switch (o.kind) {
      case 'item': o.sold = true; give(G.Items.key(o.id, o.r, true)); break;
      case 'heal': o.sold = true; pl.heal(pl.maxHp * 0.5, 'tienda'); break;
      case 'vitamin': o.sold = true; G.Vitamins.apply(pl, o.id, o.r, o.m); break;
      case 'luck': G.Fortune.add(pl, LUCK.shop); if (--o.left <= 0) o.sold = true; break;
      case 'egg': o.sold = true; G.Companion.give(pl, { dex: +o.id, r: o.r }); break;
      case 'curse': o.sold = true; G.Curse.accept(null); break;
    }
    G.Audio.sfx('coin');
    return true;
  }

  // ---------------- Smeargle ----------------
  /** Los ataques sueltos que puedes olvidar (si te queda alguno más). */
  function forgettable(pl) {
    if (!pl || pl.moves.length < 2) return [];
    return pl.slots.filter(s => s.length === 1).map(s => s[0]);
  }
  function forget(pl, m) {
    const i = pl.slots.findIndex(s => s.length === 1 && s[0] === m);
    if (i < 0 || pl.moves.length < 2) return false;
    const cur = pl.slots[pl.active];
    pl.slots.splice(i, 1);
    pl.moves.splice(pl.moves.indexOf(m), 1);
    const a = pl.slots.indexOf(cur);
    pl.active = a >= 0 ? a : 0;
    G.Projectiles.clearOrbs(pl);
    G.Spawner.say(G.I18n.f('Has olvidado {x}', G.T(m.name)), 2.6, true);
    return true;
  }

  // ---------------- máquina (Porygon) ----------------
  function upgradeItem(pl, it) {
    if (!it || it.r >= 3) return false;
    const p = machinePrice(it.r);
    if (purse(pl) < p) return false;
    pl.spent = (pl.spent || 0) + p;
    it.r++; it.v = null;
    G.Items.refresh(pl);
    G.Reg.v1.buy('rarity', it.id, it.r, p);
    G.Audio.sfx('levelup');
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.6, G.Rarity.color(it.r), 18, 150);
    return true;
  }

  // ---------------- santuario de reto ----------------
  function startChallenge(e) {
    if (ch || e.used) return;
    e.used = true;
    ch = { e, t: 0, away: 0, wave: 0 };
    G.Spawner.say(G.I18n.f('¡Reto! Aguanta {x} s en el círculo', CHALLENGE_T), 3, true, { col: '#ff6b6b' });
    G.Audio.sfx('boss');
    if (G.Coop.isHost) G.Coop.broadcast(['enc', 'cs', e.id]);
  }
  function challengeTick(dt) {
    ch.t += dt;
    const e = ch.e;
    if (!authority()) return;                 // el invitado sólo lo ve; manda el anfitrión
    const in2 = CHALLENGE_R * CHALLENGE_R, all = G.Game.everyone();
    const someone = all.some(p => !p.dead && G.U.dist2(p.x, p.y, e.x, e.y) < in2);
    ch.away = someone ? 0 : ch.away + dt;
    if (ch.wave * 6 <= ch.t && ch.wave < CHALLENGE_T / 6) { ch.wave++; G.Spawner.challenge(e.x, e.y, 4 + Math.floor(minute() / 4)); }
    if (ch.away > AWAY_T || all.every(p => p.dead)) return endChallenge(false);
    if (ch.t >= CHALLENGE_T) endChallenge(true);
  }
  function endChallenge(ok) {
    const e = ch.e;
    ch = null;
    e.done = true;
    if (G.Coop.isHost) G.Coop.broadcast(['enc', 'ce', e.id, ok ? 1 : 0]);
    reward(e, ok);
  }
  /** En cada ordenador: si estabas en el círculo, el premio es tuyo. */
  function reward(e, ok) {
    const pl = G.Game.player;
    if (!pl) return;
    const inside = !pl.dead && G.U.dist2(pl.x, pl.y, e.x, e.y) < (CHALLENGE_R + 40) ** 2;
    if (!ok || !inside) { G.Spawner.say(G.T(ok ? 'Reto superado, pero estabas fuera del círculo' : 'Reto fallido'), 2.6, true); return; }
    G.Audio.sfx('legend');
    G.FX.ring(e.x, e.y - 20, 10, CHALLENGE_R, '#ffd23f', 0.6, 5);
    G.Fortune.add(pl, LUCK.challenge);
    G.Spawner.say(G.I18n.f('¡Reto superado! +{x} % de suerte', Math.round(LUCK.challenge * 100)), 3, true, { col: '#ffd23f' });
    G.Game.giveItem(G.Items.key(G.U.pick(G.Items.LIST).id, Math.random() < 0.7 ? 2 : 3, true));
  }

  // ---------------- red ----------------
  function onNet(ev, from) {
    const byId = id => list.find(e => e.id === id);
    switch (ev[1]) {
      case 'a': if (!byId(ev[2])) { make({ id: ev[2], type: ev[3], x: ev[4], y: ev[5] }); nextId = Math.max(nextId, ev[2] + 1); } break;
      case 'c': { const e = byId(ev[2]); if (e && G.Coop.isHost) startChallenge(e); break; }            // (de un invitado)
      case 'cs': { const e = byId(ev[2]); if (e && !ch) { e.used = true; ch = { e, t: 0, away: 0, wave: 0 }; G.Spawner.say(G.I18n.f('¡Reto! Aguanta {x} s en el círculo', CHALLENGE_T), 3, true, { col: '#ff6b6b' }); } break; }
      case 'ce': { const e = byId(ev[2]); if (e) { ch = null; e.done = true; reward(e, !!ev[3]); } break; }
      // (Bloque F) La maldición: un invitado la acepta (k, al anfitrión) y el anfitrión dice el nivel nuevo a todos (ku).
      case 'k': if (G.Coop.isHost && G.Curse.level < G.Curse.MAX) { const e = byId(ev[2]); if (e) e.used = true; G.Curse.setLevel(G.Curse.level + 1); G.Coop.broadcast(['enc', 'ku', G.Curse.level, ev[2] | 0]); } break;
      case 'ku': { const e = byId(ev[3]); if (e) e.used = true; G.Curse.setLevel(ev[2]); break; }
    }
  }

  // ---------------- consultas ----------------
  /** Los que caen en el círculo (x, y, r): para G.World.specialsNear (el bot, interact.js). */
  function near(x, y, r) {
    const out = [];
    for (const e of list) if (!e.fade && G.U.dist2(x, y, e.x, e.y) <= (r + e.r) ** 2) out.push(e);
    return out;
  }

  // ---------------- dibujo ----------------
  function img(name) {
    let im = imgs[name];
    if (!im) { im = imgs[name] = new Image(); im.src = 'assets/pxl/' + name + '.png'; }
    return im.complete && im.naturalWidth ? im : null;
  }

  function drawZone(ctx, e, col, k) {
    const rx = e.zone, ry = e.zone * 0.72, t = performance.now() / 1000;
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 3);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(e.x, e.y, rx, ry, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.ellipse(e.x, e.y, rx, ry, 0, 0, 6.2832); ctx.stroke();
    if (k > 0) {
      ctx.setLineDash([]); ctx.lineWidth = 5; ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + k * 6.2832); ctx.stroke();
    }
    ctx.restore();
  }

  /** Para ordenarlos por Y con el resto (game.js drawScene). */
  function drawables() {
    const out = [];
    for (const e of list) {
      if (e.zone && !e.used && !e.done) out.push({ y: e.y - 4000, draw: ctx => drawZone(ctx, e, e.type === 'temple' ? '#ffd23f' : '#ff6b6b', e.type === 'temple' ? e.charge : 0) });
      if (e === (ch && ch.e)) out.push({ y: e.y - 4000, draw: ctx => drawZone(ctx, e, '#ff6b6b', 1 - ch.t / CHALLENGE_T) });
      out.push({ y: e.y, draw: ctx => drawOne(ctx, e) });
    }
    return out;
  }

  function drawOne(ctx, e) {
    const T = TYPES[e.type];
    ctx.save();
    if (e.fade) ctx.globalAlpha = T.dex ? 1 - e.fade : 0.55;
    if (T.dex) {
      G.Sprites.drawShadow(ctx, e.dex, e.x, e.y, 1);
      e.anim.draw(ctx, e.x, e.y, {});
    } else {
      const im = img(T.art);
      if (im) {
        const w = im.width * 2, h = im.height * 2;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(im, Math.round((e.x - w / 2) / 2) * 2, Math.round((e.y - h + 6) / 2) * 2, w, h);
      }
      if (e === (ch && ch.e)) {
        const left = Math.max(0, Math.ceil(CHALLENGE_T - ch.t));
        ctx.font = '700 18px Grenze,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,4,4,.9)'; ctx.strokeText(left + ' s', e.x, e.y - 86);
        ctx.fillStyle = '#ff8b8b'; ctx.fillText(left + ' s', e.x, e.y - 86);
      }
    }
    ctx.restore();
  }

  return {
    TYPES, CATALOG, PRICE, RAR_K, MACHINE, LUCK, LUCK_PER_SHOP, TEMPLE_R, TEMPLE_T, CHALLENGE_R, CHALLENGE_T, TRAMO, MAX_ALIVE, AFTER_RIFT,
    reset, update, makePlan, press, pressable, purse, price, machinePrice, shopOffers, canBuy, buy, forgettable, forget, upgradeItem,
    near, drawables, onNet,
    get list() { return list; }, get plan() { return plan; }, get challenge() { return ch; },
    /** Para pruebas: pone uno ya, cerca de ti (d px). */
    debugPlace(type, d = 160) { const pl = G.Game.player; return make({ type, x: Math.round(pl.x + d), y: Math.round(pl.y) }); }
  };
})();
