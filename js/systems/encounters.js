/* ============ encounters.js — encuentros del mapa (1.0, bloque E, 25-11-2026) ============
 * Lo decidió el dueño (nota del vault «Bloque E - Encuentros», «Decisiones del dueño», 1.0):
 *
 * Ritmo: 1-2 encuentros por tramo de 5 min, COLOCADOS EN EL MUNDO ESPERÁNDOTE: aparecen fuera de la vista y se
 *   encuentran andando. Sin avisos, sin flechas ni marcas en el borde. Sólo al tenerlos al alcance sale
 *   su botón, como el de los cofres (interact.js). Se quedan hasta que los usas (como mucho MAX_ALIVE sin usar: si sobran,
 *   se va el más viejo que no se ve).
 *   (28-11-2026, el dueño: «no me han salido nunca, parece que no existen») Antes salían a 760-1300 px en cualquier
 *   dirección: una persona, que sólo ve su pantalla, casi nunca daba con ellos (el bot sí: los ve a 620 px + su radio).
 *   Ahora salen DELANTE de por donde vas, justo fuera de la vista (spotFor), y si en MOVE_T s nadie los ha tenido en la
 *   pantalla (found) se recolocan otra vez delante (relocate; en grupo, 'enc' 'm').
 *
 *   shop       Kecleon, tendero ambulante. Gasta LAS MONEDAS QUE TE LLEVARÍAS A LA CUENTA (purse: tiempo, derrotados,
 *              jefes y recogidas, con tu Fortuna, menos lo gastado: endRun lo descuenta). Vende un objeto con rareza,
 *              curarte, una vitamina, suerte, un huevo (bloque G) y maldición (bloque F).
 *              No vende cambiar cartas. Una visita por Kecleon: al irte, se va.
 *   temple     Templo de vitaminas: quedarte en su círculo lo carga (salir lo vuelve a 0) mientras salen oleadas de enemigos
 *              que te presionan; lleno, eliges 1 de 3 vitaminas con rareza (G.Vitamins) y te da suerte. Una vez por jugador.
 *   smeargle   Smeargle: olvidas un ataque SUELTO (no fusionado). El olvidado puede volver a salir en las cartas.
 *   challenge  Santuario de reto: lo activas y salen enemigos de élite CHALLENGE_T s. Si aguantas en su círculo, objeto
 *              épico (70 %) o legendario (30 %) y suerte. Si te alejas más de AWAY_T s seguidos o caes, nada.
 *   machine    Porygon: sube un escalón la rareza de uno de tus objetos (conserva su evolución). Una vez por máquina.
 *   egg        Chansey (bloque G, systems/companion.js): una vez por partida, en el 2.º tramo después de la grieta; te da un
 *              huevo (eliges si te lo quedas). Kecleon también los vende. Una visita: al irte, se va.
 *   curse      Santuario maldito (bloque F, systems/curse.js): lo tocas (dentro de su círculo) y eliges si aceptas un nivel más de maldición (enemigos
 *              más duros el resto de la partida, a cambio de experiencia, monedas y suerte). Uno por tramo desde el minuto 5.
 *              Si dices que no, se apaga para ti. En grupo, la maldición es del grupo (la sube el anfitrión).
 *
 * Precios (dueño, 25-11-2026, «medios»): curar 80, vitamina 200, objeto 300, suerte 250, +5 % por minuto de partida,
 *   ×1,3 / ×1,7 / ×2,2 si es raro / épico / legendario y +25 % cada vez que compras lo mismo. Máquina: a raro 400, a épico
 *   800, a legendario 1.200 (+5 %/min). Suerte (dueño, «media»): templo +5 %, Kecleon +10 % (hasta 2 por tienda), reto +15 %.
 *
 * (Templos 3D, 27-11-2026, el dueño: «los templos y santuarios quiero que sean en 3d y abarquen una zona más grande para
 *  tener que quedarme en ellos o interactuar con ellos»; lo eligió entre propuestas) Templo, santuario de reto y santuario
 *  maldito tienen una zona grande (ZONE_R, media pantalla) marcada en el suelo y con piedras de runa en el borde. Templo:
 *  quedarse TEMPLE_T s; si sales, vuelve a empezar; mientras, oleadas (TEMPLE_WAVE). Reto y maldito: su botón sale en
 *  cualquier sitio de la zona (interact.js). Se ven en 3D en PC (world/props3d.js, ultra3d.js) y en pixel art grande con
 *  volumen en móvil (tools/pxl/encuentros.px.js, maldicion.px.js).
 *
 * Cooperativo: el anfitrión los coloca y avisa ('enc', 'a': el invitado los pone en el mismo sitio). Lo demás es de cada
 *   uno (cada ordenador lo suyo, nada por la red): tu bolsa, tu templo, tu Smeargle, tu máquina. El reto es compartido: lo
 *   lleva el anfitrión (salen sus enemigos), y al acabar cada uno cobra si estaba en el círculo. Las oleadas del templo
 *   también las crea el anfitrión (el invitado que lo carga se las pide: 'enc', 'tw').
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
  // (28-11-2026) Dónde aparecen: delante de por donde vas (±AHEAD rad), entre el borde de la vista (+ su zona) y GAP px más;
  // si en MOVE_T s nadie lo ha encontrado (visto en la pantalla), se recolocan delante otra vez.
  const AHEAD = 0.6, GAP = [40, 220], MOVE_T = 25, FOUND_R = 260;   // FOUND_R: un compañero (su pantalla no se sabe)
  const SEEN_R = 420;                    // a esta distancia cuenta como «encontrado» (registro)
  // (Templos 3D) Zona grande para los tres (antes, templo 88 y reto 170), templo más largo (antes 8 s) y sus oleadas.
  const ZONE_R = 220, TEMPLE_R = ZONE_R, TEMPLE_T = 12, CHALLENGE_R = ZONE_R, CHALLENGE_T = 30, AWAY_T = 6;
  const TEMPLE_WAVE = 3, RING_N = 12;     // cada cuánto sale una oleada mientras cargas; piedras del borde de la zona
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
    temple:    { art: 'temple', name: 'Templo de vitaminas', zone: TEMPLE_R, col: '#ffd23f', stone: 'zst_t' },
    smeargle:  { dex: 235, name: 'Smeargle', act: 'Hablar' },
    challenge: { art: 'shrine', name: 'Santuario de reto', act: 'Retar', zone: CHALLENGE_R, col: '#ff6b6b', stone: 'zst_c' },
    machine:   { dex: 137, name: 'Porygon', act: 'Hablar' },
    curse:     { art: 'curse', name: 'Santuario maldito', act: 'Tocar', zone: ZONE_R, col: '#b56cff', stone: 'zst_k' },   // bloque F (systems/curse.js)
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
  /**
   * Un sitio libre delante de pl (por donde anda: moveAngle), justo fuera de la vista (también su zona) y lejos de los
   * demás encuentros. Si delante no hay sitio (paredes, agua), en cualquier dirección. self: el que se recoloca.
   */
  function spotFor(pl, rnd = Math.random, zone = 0, self = null) {
    const view = G.Camera.outerRadius ? G.Camera.outerRadius() : 600, ang = pl.moveAngle || 0;
    for (let i = 0; i < 60; i++) {
      const a = i < 40 ? ang + (rnd() * 2 - 1) * AHEAD * (1 + i / 20) : rnd() * 6.2832;
      const d = view + zone + GAP[0] + rnd() * (GAP[1] - GAP[0]);
      const x = Math.round(pl.x + Math.cos(a) * d), y = Math.round(pl.y + Math.sin(a) * d);
      if (!G.World.isFree(x, y, 40) || !G.World.isFree(x + 30, y, 20) || !G.World.isFree(x - 30, y, 20)) continue;
      if (G.World.isLiquid && G.World.isLiquid(x, y)) continue;
      if (list.some(e => e !== self && G.U.dist2(e.x, e.y, x, y) < Math.max(500, (e.zone || 0) + zone + 100) ** 2)) continue;
      if (G.Rift.rift && G.U.dist2(G.Rift.rift.x, G.Rift.rift.y, x, y) < (400 + zone * 0.5) ** 2) continue;
      // (Templos 3D) Con zona: casi toda por donde se puede andar (6 de 8 puntos a 0,6 del radio, sin pared ni agua).
      if (zone && !zoneOk(x, y, zone)) continue;
      return [x, y];
    }
    return null;
  }

  function zoneOk(x, y, R) {
    let ok = 0;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.2832, px = x + Math.cos(a) * R * 0.6, py = y + Math.sin(a) * R * 0.6;
      if (G.World.isFree(px, py, 16) && !(G.World.isLiquid && G.World.isLiquid(px, py))) ok++;
    }
    return ok >= 6;
  }

  /** (Templos 3D) Las piedras del borde de la zona (sólo dibujo): RING_N, sin las que caen en pared o agua. */
  function ringOf(e) {
    const out = [], W = G.World, R = e.zone;
    for (let i = 0; i < RING_N; i++) {
      const j = ((e.x * 7 + e.y * 13 + i * 31) % 17 + 17) % 17 / 17 - 0.5;
      const a = (i + j * 0.3) / RING_N * 6.2832, x = Math.round(e.x + Math.cos(a) * R), y = Math.round(e.y + Math.sin(a) * R);
      if (W && W.isFree && (!W.isFree(x, y, 10) || (W.isLiquid && W.isLiquid(x, y)))) continue;
      out.push({ x, y, i });
    }
    return out;
  }

  function make(o) {
    const T = TYPES[o.type];
    const e = Object.assign({ id: nextId++, r: 18, used: false, done: false, charge: 0, seen: false, fade: 0, t0: now() }, o);
    e.enc = true;
    // (El bot lee p.r como el radio del círculo; interact.js saca el botón de reto y maldito en toda la zona.)
    if (T.zone) { e.zone = T.zone; e.r = T.zone; e.ring = ringOf(e); e.wt = 0; }
    if (T.dex) { e.dex = T.dex; e.anim = new G.Sprites.Animator(T.dex, 1); e.anim.dir = 0; }
    list.push(e);
    // Sin sitio para todos: se va el más viejo sin usar que no se ve; antes uno que ya encontraste (28-11-2026: antes se
    // iba alguno que nadie había visto).
    const idle = list.filter(x => !x.used && !x.done && x !== e && !onScreen(x));
    if (list.filter(x => !x.used && !x.done).length > MAX_ALIVE && idle.length) list.splice(list.indexOf(idle.find(x => x.found) || idle[0]), 1);
    return e;
  }

  function place(type, pl) {
    const at = spotFor(pl, Math.random, TYPES[type].zone || 0);
    if (!at) return null;
    const e = make({ type, x: at[0], y: at[1] });
    if (G.Coop.isHost) G.Coop.broadcast(['enc', 'a', e.id, type, e.x, e.y]);
    return e;
  }

  /**
   * (28-11-2026) El que nadie ha encontrado en MOVE_T s (found) y no está cerca de nadie: otra vez delante de alguien.
   * Lo hace quien manda (el anfitrión en grupo) y lo dice ('enc' 'm').
   */
  function relocate(e, who) {
    const t = now();
    if (e.found || e.used || e.done || t - e.t0 < MOVE_T) return;
    const view = G.Camera.outerRadius ? G.Camera.outerRadius() : 600, R = view + (e.zone || 0) + 60;
    if (who.some(p => G.U.dist2(p.x, p.y, e.x, e.y) < R * R)) return;
    e.t0 = t;                                                  // (sin sitio: se vuelve a probar dentro de MOVE_T s)
    const at = spotFor(G.U.pick(who), Math.random, e.zone || 0, e);
    if (!at) return;
    moveTo(e, at[0], at[1]);
    if (G.Coop.isHost) G.Coop.broadcast(['enc', 'm', e.id, e.x, e.y]);
  }
  function moveTo(e, x, y) { e.x = x; e.y = y; if (e.zone) e.ring = ringOf(e); }

  function onScreen(e) {
    const p = G.Camera.toScreen(e.x, e.y), w = innerWidth, h = innerHeight;
    return p.x > -60 && p.x < w + 60 && p.y > -80 && p.y < h + 60;
  }

  // ---------------- cada fotograma ----------------
  function update(dt, pl) {
    if (!pl) return;
    const t = now();
    if (authority() && !G.Rift.inArena && !G.Rift.rift && !(G.Judgment && G.Judgment.active)) {
      let who = G.Game.everyone().filter(p => !p.dead);
      if (!who.length) who = [pl];
      while (plan.length && plan[0].t <= t) {
        if (!place(plan[0].type, G.U.pick(who))) break;   // sin sitio: se vuelve a mirar en un momento
        plan.shift();
      }
      // (28-11-2026) Encontrado: lo has tenido en la pantalla (de su zona, la mitad) o un compañero lo ha tenido cerca.
      // Si nadie lo encuentra, se recoloca (relocate).
      for (const e of list) {
        const z = (e.zone || 0) * 0.5, R = FOUND_R + z;
        if (!e.found && ((G.Camera.sees && G.Camera.sees(e.x, e.y, z)) || who.some(p => p !== pl && G.U.dist2(p.x, p.y, e.x, e.y) < R * R))) e.found = true;
        relocate(e, who);
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
    // (Templos 3D, el dueño: «se reinicia») Si sales a medias, vuelve a empezar.
    if (!inside) {
      if (e.charge > 0.12) G.Spawner.say(G.T('Has salido del templo: vuelve a empezar'), 2.2, true, { col: '#ffd23f' });
      e.charge = 0; e.wt = 0;
      return;
    }
    e.charge = Math.min(1, e.charge + dt / TEMPLE_T);
    // Mientras cargas, oleadas que te presionan (la primera nada más entrar).
    if ((e.wt -= dt) <= 0 && e.charge < 1) { e.wt = TEMPLE_WAVE; templeWave(e); }
    if (Math.random() < dt * 10) G.FX.px(e.x + G.U.rand(-30, 30), e.y - G.U.rand(10, 60), '#ffe9a8', { vy: -40, life: 0.6 });
    if (e.charge < 1) return;
    e.used = true; e.charge = 1;
    G.Audio.sfx('legend');
    G.FX.ring(e.x, e.y - 20, 10, TEMPLE_R, '#ffd23f', 0.6, 5);
    G.Fortune.add(pl, LUCK.temple);
    const opts = G.Vitamins.offer(pl, 3);
    if (!opts.length) { G.Spawner.say(G.I18n.f('Ya tienes todas las vitaminas al tope · +{x} % de suerte', Math.round(LUCK.temple * 100)), 3, true); return; }
    open(e, { kind: 'temple', vit: opts });
  }

  /** Una oleada del templo: enemigos normales del elenco de ahora, desde fuera de la zona. La crea el anfitrión. */
  function templeWave(e) {
    if (!authority()) { G.Coop.toHost(['enc', 'tw', e.id]); return; }
    const t = now();
    if (e.lastWave && t - e.lastWave < TEMPLE_WAVE * 0.6) return;   // (dos cargándolo a la vez: una oleada, no dos)
    e.lastWave = t;
    G.Spawner.challenge(e.x, e.y, 3 + Math.floor(minute() / 5), undefined, { plain: true, d: [ZONE_R + 30, ZONE_R + 110] });
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
      case 'm': { const e = byId(ev[2]); if (e && !e.used && !e.done) moveTo(e, ev[3], ev[4]); break; }   // (recolocado: relocate)
      case 'c': { const e = byId(ev[2]); if (e && G.Coop.isHost) startChallenge(e); break; }            // (de un invitado)
      case 'cs': { const e = byId(ev[2]); if (e && !ch) { e.used = true; ch = { e, t: 0, away: 0, wave: 0 }; G.Spawner.say(G.I18n.f('¡Reto! Aguanta {x} s en el círculo', CHALLENGE_T), 3, true, { col: '#ff6b6b' }); } break; }
      case 'ce': { const e = byId(ev[2]); if (e) { ch = null; e.done = true; reward(e, !!ev[3]); } break; }
      // (Bloque F) La maldición: un invitado la acepta (k, al anfitrión) y el anfitrión dice el nivel nuevo a todos (ku).
      case 'k': if (G.Coop.isHost && G.Curse.level < G.Curse.MAX) { const e = byId(ev[2]); if (e) e.used = true; G.Curse.setLevel(G.Curse.level + 1); G.Coop.broadcast(['enc', 'ku', G.Curse.level, ev[2] | 0]); } break;
      case 'ku': { const e = byId(ev[3]); if (e) e.used = true; G.Curse.setLevel(ev[2]); break; }
      // (Templos 3D) Un invitado carga su templo: la oleada la crea el anfitrión.
      case 'tw': { const e = byId(ev[2]); if (e && e.type === 'temple' && G.Coop.isHost) templeWave(e); break; }
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
  const live = e => !!ch && ch.e === e;                       // el reto en marcha
  const dead = e => (e.used || e.done) && !live(e);           // ya usado: apagado
  const sees = (x, y, p) => !G.Camera.sees || G.Camera.sees(x, y, p);

  /*
   * (Templos 3D) La zona, en el suelo (game.js: después de los avisos del suelo y antes de lo que está de pie). Un círculo de
   * verdad (el mismo que cuenta para jugar), con su color, el borde a trazos y, encima, lo que llevas: la carga del templo o
   * lo que queda del reto.
   */
  function drawGround(ctx) {
    const t = performance.now() / 1000;
    for (const e of list) {
      if (!e.zone || dead(e) || !sees(e.x, e.y, e.zone + 40)) continue;
      const R = e.zone, col = live(e) ? '#ff6b6b' : TYPES[e.type].col;
      const k = live(e) ? 1 - ch.t / CHALLENGE_T : e.type === 'temple' ? e.charge : 0;
      ctx.save();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.09 + 0.03 * Math.sin(t * 2.4) + 0.12 * k;
      ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.1;
      ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.42, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.75; ctx.setLineDash([14, 10]);
      ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 2; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(e.x, e.y, R - 10, 0, 6.2832); ctx.stroke();
      if (k > 0) {
        ctx.lineWidth = 8; ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.arc(e.x, e.y, R, -Math.PI / 2, -Math.PI / 2 + k * 6.2832); ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Para ordenarlos por Y con el resto (game.js drawScene y D3): el encuentro y las piedras de su zona. */
  function drawables() {
    const out = [], u3 = !!(G.Ultra3D && G.Ultra3D.floraOn);
    for (const e of list) {
      const T = TYPES[e.type];
      if (e.ring) for (const s of e.ring) {
        if (!sees(s.x, s.y - 40, 60) || (u3 && G.Ultra3D.owns({ id: 'e' + e.id + 's' + s.i }))) continue;
        out.push({ x: s.x, y: s.y, draw: ctx => drawStone(ctx, e, s) });
      }
      const own = u3 && !T.dex && G.Ultra3D.owns({ id: 'e' + e.id });     // (en 3D: aquí sólo su texto)
      out.push({ x: e.x, y: e.y, draw: ctx => drawOne(ctx, e, own) });
    }
    return out;
  }

  function drawStone(ctx, e, s) {
    const im = img(dead(e) ? 'zst_u' : TYPES[e.type].stone);
    if (!im) return;
    const w = im.width * 2, h = im.height * 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, Math.round((s.x - w / 2) / 2) * 2, Math.round((s.y - h + 4) / 2) * 2, w, h);
  }

  function label(ctx, txt, x, y, col) {
    ctx.font = '700 18px Grenze,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,4,4,.9)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
  }

  function drawOne(ctx, e, own) {
    const T = TYPES[e.type];
    ctx.save();
    if (e.fade && !own) ctx.globalAlpha = T.dex ? 1 - e.fade : 0.55;
    if (T.dex) {
      G.Sprites.drawShadow(ctx, e.dex, e.x, e.y, 1);
      e.anim.draw(ctx, e.x, e.y, {});
    } else {
      const im = !own && img(T.art);
      if (im) {
        const w = im.width * 2, h = im.height * 2;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(im, Math.round((e.x - w / 2) / 2) * 2, Math.round((e.y - h + 6) / 2) * 2, w, h);
      }
      // Lo que queda: del reto, y del templo mientras lo cargas.
      if (live(e)) label(ctx, Math.max(0, Math.ceil(CHALLENGE_T - ch.t)) + ' s', e.x, e.y - 146, '#ff8b8b');
      else if (e.type === 'temple' && !dead(e) && e.charge > 0) label(ctx, Math.max(1, Math.ceil(TEMPLE_T * (1 - e.charge))) + ' s', e.x, e.y - 152, '#ffd23f');
    }
    ctx.restore();
  }

  /*
   * (Templos 3D) Lo que va en 3D en PC (ultra3d.js collect): el modelo de cada templo y santuario (props3d.js; U: apagado) y
   * las piedras de su zona, con su luz en el suelo. y: donde va el centro del modelo (sus pies, un poco al norte de e.y).
   */
  const OFF = { temple: 18, challenge: 6, curse: 7 };
  // (El halo va detrás del modelo: en lo alto, alrededor de lo que brilla arriba.)
  const GLOW = { temple: [104, '#ff8ab4', 70], challenge: [95, '#ffa020', 90], curse: [92, '#b56cff', 96] };
  function models() {
    const out = [];
    for (const e of list) {
      const T = TYPES[e.type];
      if (T.dex || !e.zone) continue;
      const off = dead(e);
      out.push({ id: 'e' + e.id, key: T.art + (off ? 'U' : ''), x: e.x, y: e.y - OFF[e.type], glow: off ? null : GLOW[e.type] });
      for (const s of e.ring) out.push({ id: 'e' + e.id + 's' + s.i, key: off ? 'zst_u' : T.stone, x: s.x, y: s.y - 2 });
    }
    return out;
  }
  /** Los modelos que pueden hacer falta pronto (ultra3d.js los prepara de uno en uno antes de verse: sin tirones). */
  function keys3d() {
    const out = [];
    for (const e of list) {
      const T = TYPES[e.type];
      if (T.dex || !e.zone) continue;
      for (const k of [T.art, T.art + 'U', T.stone, 'zst_u']) if (!out.includes(k)) out.push(k);
    }
    return out;
  }

  return {
    TYPES, CATALOG, PRICE, RAR_K, MACHINE, LUCK, LUCK_PER_SHOP, ZONE_R, TEMPLE_R, TEMPLE_T, TEMPLE_WAVE, CHALLENGE_R, CHALLENGE_T, TRAMO, MAX_ALIVE, AFTER_RIFT, MOVE_T, SEEN_R,
    reset, update, makePlan, press, pressable, purse, price, machinePrice, shopOffers, canBuy, buy, forgettable, forget, upgradeItem,
    near, drawables, drawGround, models, keys3d, onNet,
    get list() { return list; }, get plan() { return plan; }, get challenge() { return ch; },
    /** Para pruebas: pone uno ya, cerca de ti (d px). */
    /** Para pruebas: dónde saldría uno de este tipo ahora (spotFor, sin ponerlo). */
    debugSpot(type) { return spotFor(G.Game.player, Math.random, TYPES[type].zone || 0); },
    debugPlace(type, d = 160) { const pl = G.Game.player; return make({ type, x: Math.round(pl.x + d), y: Math.round(pl.y) }); }
  };
})();
