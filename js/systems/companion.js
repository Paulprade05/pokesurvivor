/* ============ companion.js — huevo y compañero de la partida (1.0, bloque G, 27-11-2026) ============
 * Lo decidió el dueño (nota del vault «Bloque G - Huevo y compañero», «Decisiones del dueño», 1.0):
 *
 *   Huevo     te lo da Chansey (un encuentro, una vez por partida, en el 2.º tramo después de la grieta) o te lo vende
 *             Kecleon (uno por tienda). Lleva una PRIMERA FASE al azar de una línea que evoluciona (no legendaria); la
 *             rareza del huevo (con tu suerte, G.Rarity.roll) da líneas más fuertes. La carta enseña qué Pokémon lleva.
 *             Eclosiona AL ANDAR: HATCH_D unidades (unos 3 min a velocidad normal; quieto no avanza).
 *   Compañero te sigue y ataca con UN SOLO ATAQUE: el de su tipo principal y su lado (físico si pa ≥ sa): MOVE, 18 × 2,
 *             de los que ya existen (sólo su nombre y su aspecto; la mecánica es la suya, lenta y sin lluvias de disparos:
 *             físico, un zarpazo en arco junto al enemigo; especial, un disparo o un rayo).
 *             Si cae (los enemigos que lo tocan le hacen daño), SE LEVANTA A LOS 20 s. Sólo para la partida: no va a la
 *             colección. EVOLUCIONA por tiempo con él: a los 4 min de nacer y 5 min después (si su línea sigue).
 *   Un compañero (o su huevo) por jugador: si coges otro huevo, eliges cuál se queda (pantalla del encuentro).
 *
 * Daño: UN TROZO FIJO DEL DAÑO (G.PowerBudget.COMPANION.SHARE, 10-15 %). Su objetivo va del 10 % (+1 % por rareza) al 15 %
 *   con su última evolución; cada golpe se calcula con tu daño de los últimos WIN s y, además, NUNCA pasa del tope: ni en esa
 *   ventana ni en toda la partida (strike recorta lo que sobre). No usa tus objetos, habilidades, críticos ni pasivas: no
 *   cuenta en el tope de 4 ataques ni en la Sobrefusión (no está en pl.moves ni en pl.slots). Lo que hace suma a
 *   pl.dmgDealt (es daño del equipo) y aparte en pl.companion.dealt y pl.compDealt.
 *
 * Cooperativo: cada jugador el suyo. Cada ordenador mueve y hace atacar al suyo (sus golpes a enemigos del anfitrión le
 *   llegan como los tuyos: Enemy.hurt → G.Coop.hit) y lo manda en su estado (coop.js myState, campo 19: netState); los de
 *   los demás se ven aquí (remote), sin daño.
 * Rendimiento: un compañero por jugador, un ataque cada 1,4-1,6 s, un disparo como mucho.
 * Bot (tools/curve.cjs): pl.companion { dex, evolved, dead, dealt } (también mientras es huevo: egg).
 */
G.Companion = (() => {
  const SHARE = G.PowerBudget.COMPANION.SHARE;
  const HATCH_D = 180 * 110;             // unos 3 min andando a velocidad normal (mon.spd ~110)
  const EVO_AT = [240, 540];             // s desde que nace: 1.ª y 2.ª evolución
  const REVIVE_T = 20, HP_K = 0.7, WIN = 20;
  const GAIN_MAX = 4, IDLE_MAX = 3;      // perCast: corrección por lo que no llega (fallos, resistencias) y golpes «guardados» sin enemigo a tiro
  const CD = { physical: 1.4, special: 1.6 };
  const SIGHT = 300, LEASH = 280, MELEE_R = 72, MELEE_ARC = 2.4, SHOT_R = 300, TELE = 700;
  /** Su ataque: [físico, especial] por tipo (los que ya existen en data/moves.js). */
  const MOVE = {
    normal: ['tackle', 'swift'], fire: ['flame-charge', 'ember'], water: ['waterfall', 'water-gun'],
    electric: ['aura-wheel', 'thunder-shock'], grass: ['vine-whip', 'energy-ball'], ice: ['ice-shard', 'ice-beam'],
    fighting: ['karate-chop', 'aura-sphere'], poison: ['poison-sting', 'sludge'], ground: ['bone-club', 'mud-shot'],
    flying: ['wing-attack', 'air-slash'], psychic: ['psycho-cut', 'confusion'], bug: ['bug-bite', 'signal-beam'],
    rock: ['rock-throw', 'power-gem'], ghost: ['lick', 'shadow-ball'], dragon: ['dragon-claw', 'dragon-rage'],
    dark: ['bite', 'dark-pulse'], steel: ['metal-claw', 'flash-cannon'], fairy: ['play-rough', 'draining-kiss']
  };
  /** Rareza del huevo → líneas por la fuerza de su última fase (bst). */
  const TIER_BST = [470, 520, 580];
  const K_OF = s => s / (1 - s);

  // ---------------- qué Pokémon ----------------
  let POOL = null;
  /** Primeras fases no legendarias que evolucionan, por rareza [común, raro, épico, legendario]. */
  function pool() {
    if (POOL) return POOL;
    POOL = [[], [], [], []];
    for (const p of G.DEX) {
      if (p.leg || G.Evo.rule(p.dex) || !G.Evo.kids(p.dex).length) continue;
      if (G.SPRITE_META && !G.SPRITE_META[p.dex]) continue;
      const top = Math.max(...G.Evo.family(p.dex).map(d => (G.DEX_BY[d] || {}).bst || 0));
      POOL[top < TIER_BST[0] ? 0 : top < TIER_BST[1] ? 1 : top < TIER_BST[2] ? 2 : 3].push(p.dex);
    }
    return POOL;
  }
  /** Un huevo nuevo: { dex, r } (la rareza con tu suerte). */
  function rollEgg(pl, rnd = Math.random) {
    const P = pool();
    let r = G.Rarity.roll(G.Fortune.of(pl), rnd);
    while (r > 0 && !P[r].length) r--;
    const list = P[r].length ? P[r] : P.find(l => l.length);
    return { dex: list[Math.floor(rnd() * list.length)], r };
  }
  /** Cuántas evoluciones le quedan a su línea desde dex (0-2). */
  function stagesFrom(dex) {
    let n = 0;
    for (let d = dex; n < 2; n++) { const k = G.Evo.kids(d); if (!k.length) break; d = k[0]; }
    return n;
  }
  const sideOf = dex => { const m = G.DEX_BY[dex]; return m && (m.sa || 0) > (m.pa || 0) ? 'special' : 'physical'; };
  /** El ataque de ese Pokémon (id de data/moves.js). */
  const moveOf = dex => { const m = G.DEX_BY[dex], t = (m && m.types[0]) || 'normal'; return (MOVE[t] || MOVE.normal)[sideOf(dex) === 'physical' ? 0 : 1]; };

  // ---------------- el tuyo ----------------
  /** Coges un huevo (sustituye al que llevaras, huevo o compañero). */
  function give(pl, egg) {
    if (!pl || !egg) return null;
    const c = pl.companion = { dex: egg.dex, r: egg.r | 0, egg: true, walked: 0, need: HATCH_D, evolved: false, stage: 0,
      maxStage: stagesFrom(egg.dex), dead: false, dealt: 0, px: pl.x, py: pl.y };
    G.Sprites.preload(G.Evo.family(egg.dex));
    if (G.Spawner && pl === G.Game.player) G.Spawner.say(G.T('¡Tienes un huevo! Anda para que eclosione'), 3, true, { col: '#ffe9a8' });
    return c;
  }

  /** Objetivo de su trozo del daño: del 10 % (+1 % por rareza) al 15 % con su última evolución. */
  function share(c) {
    const b = Math.min(SHARE[1], SHARE[0] + 0.01 * (c.r | 0));
    return c.maxStage ? b + (SHARE[1] - b) * c.stage / c.maxStage : SHARE[1];
  }

  function form(c) {
    const m = G.DEX_BY[c.dex];
    c.name = m ? m.name : '';
    c.type = (m && m.types[0]) || 'normal';
    c.cat = sideOf(c.dex);
    c.mv = G.Moves.get(moveOf(c.dex)) || { id: moveOf(c.dex), name: moveOf(c.dex), type: c.type, cat: c.cat };
    c.vis = G.VFX ? G.VFX.forMove(c.mv) : {};
    c.col = G.U.TYPE_COLOR ? G.U.TYPE_COLOR[c.type] : '#fff';
    c.beam = c.cat === 'special' && c.mv.kind === 'beam';
    c.anim = new G.Sprites.Animator(c.dex, 1);
    c.r0 = G.Sprites.bodyRadius(c.dex);
  }

  function hatch(pl, c) {
    c.egg = false;
    c.t = 0; c.cd = 1; c.hitCd = 0; c.down = 0; c.hitsK = 1.5; c.gain = 1; c.since = 0; c.flash = 0; c.look = 0; c.tgt = null; c.seq = 0; c.stuck = 0;
    c.x = pl.x - 30; c.y = pl.y + 10;
    if (!G.World.isFree(c.x, c.y, 12)) { c.x = pl.x; c.y = pl.y; }
    c.win = { own: new Array(WIN).fill(0), comp: new Array(WIN).fill(0), plan: new Array(WIN).fill(0), hit: new Array(WIN).fill(0), i: 0, t: 0, n: 0 };
    pl.compDealt = pl.compDealt || 0;
    c.lastOwn = own(pl);
    c.own0 = c.lastOwn;
    form(c);
    c.maxHp = Math.round(pl.maxHp * HP_K); c.hp = c.maxHp;
    G.Audio.sfx('legend');
    G.FX.ring(c.x, c.y - 10, 6, 90, '#ffe9a8', 0.6, 4);
    G.FX.burst(c.x, c.y - 14, '#fff6d0', 20, 160);
    G.Spawner.say(G.I18n.f('¡Ha nacido {x}! Te sigue y ataca', c.name), 3.2, true, { col: '#ffe9a8' });
    G.Reg.v1.companion('hatch', c.dex);
  }

  function evolve(pl, c) {
    const kids = G.Evo.kids(c.dex).filter(d => !G.SPRITE_META || G.SPRITE_META[d]);
    if (!kids.length) { c.maxStage = c.stage; return; }
    const was = c.name, hp = c.hp / c.maxHp;
    c.dex = kids[Math.floor(Math.random() * kids.length)];
    c.stage++; c.evolved = true;
    form(c);
    c.hp = Math.round(c.maxHp * Math.max(hp, 0.5));
    G.Audio.sfx('levelup');
    G.FX.ring(c.x, c.y - 10, 6, 110, '#ffffff', 0.6, 5);
    G.FX.burst(c.x, c.y - 16, c.col, 22, 180);
    G.Spawner.say(G.I18n.f('¡{x} ha evolucionado en {x}!', was, c.name), 3, true, { col: '#ffe9a8' });
    G.Reg.v1.companion('evo', c.dex);
  }

  /** Tu daño de toda la partida sin el de los compañeros. */
  const own = pl => (pl.dmgDealt || 0) - (pl.compDealt || 0);
  const sum = a => { let s = 0; for (const v of a) s += v; return s; };

  /** Cada fotograma (game.js), el tuyo; y los de los demás jugadores, para verlos. */
  function update(dt, pl) {
    remoteTick(dt);
    const c = pl && pl.companion;
    if (!c) return;
    if (c.egg) return eggTick(dt, pl, c);
    // Ventana de daño (1 s por casilla): lo tuyo y lo suyo.
    const W = c.win, o = own(pl);
    W.own[W.i] += Math.max(0, o - c.lastOwn); c.lastOwn = o;
    if ((W.t += dt) >= 1) { W.t -= 1; W.i = (W.i + 1) % WIN; W.own[W.i] = 0; W.comp[W.i] = 0; W.plan[W.i] = 0; W.hit[W.i] = 0; W.n = Math.min(WIN, W.n + 1); }
    c.maxHp = Math.max(1, Math.round(pl.maxHp * HP_K)); if (c.hp > c.maxHp) c.hp = c.maxHp;
    c.t += dt;
    if (c.stage < c.maxStage && c.t >= EVO_AT[c.stage]) evolve(pl, c);
    c.anim.update(dt);
    if (c.flash > 0) c.flash -= dt;
    if (c.dead) {
      if ((c.down -= dt) <= 0) revive(pl, c);
      return;
    }
    c.since += dt;
    move(dt, pl, c);
    if (!pl.dead) attack(dt, pl, c);
    contact(dt, c);
  }

  function eggTick(dt, pl, c) {
    const d = Math.hypot(pl.x - c.px, pl.y - c.py);
    c.px = pl.x; c.py = pl.y;
    if (pl.dead || d > 200) return;            // (caído, o un salto: la grieta, la arena)
    const was = c.walked / c.need;
    c.walked += d;
    if (was < 0.8 && c.walked / c.need >= 0.8) G.Spawner.say(G.T('¡El huevo se mueve!'), 2.4, true, { col: '#ffe9a8' });
    if (c.walked >= c.need) hatch(pl, c);
  }

  function move(dt, pl, c) {
    const dp = G.U.dist(c.x, c.y, pl.x, pl.y);
    if (dp > TELE || c.stuck > 2) { teleport(pl, c); return; }
    if ((c.look -= dt) <= 0) {
      c.look = 0.2;
      const e = G.Projectiles.nearest(G.EnemyMgr.all(), c.x, c.y, SIGHT);
      c.tgt = e && G.U.dist(pl.x, pl.y, e.x, e.y) < LEASH + 60 ? e : null;
    }
    let gx, gy, keep;
    const t = c.tgt && !c.tgt.dead ? c.tgt : null;
    if (t && c.cat === 'physical' && G.U.dist(pl.x, pl.y, t.x, t.y) < LEASH) { gx = t.x; gy = t.y; keep = (t.r || 12) + c.r0 + 10; }
    else {
      const a = pl.moveAngle || 0;
      gx = pl.x - Math.cos(a) * 44 + Math.sin(a) * 18; gy = pl.y - Math.sin(a) * 34 - Math.cos(a) * 12; keep = 8;
    }
    const d = G.U.dist(c.x, c.y, gx, gy);
    c.moving = d > keep;
    if (c.moving) {
      const sp = Math.min(d - keep, Math.max(130, (pl.spd || 110) * 1.25) * (dp > 260 ? 1.6 : 1) * dt);
      const [nx, ny] = G.U.norm(gx - c.x, gy - c.y);
      const x0 = c.x, y0 = c.y;
      c.x += nx * sp; c.y += ny * sp;
      c.r = c.r0;
      G.World.collide(c);
      const got = Math.hypot(c.x - x0, c.y - y0);
      c.stuck = got < sp * 0.25 && dp > 160 ? c.stuck + dt : 0;
      c.anim.dir = G.Sprites.dirFromAngle(Math.atan2(ny, nx));
    }
    if (!c.anim.busy()) c.anim.loop(c.moving ? 'Walk' : 'Idle');
  }

  function teleport(pl, c) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.2832, x = pl.x + Math.cos(a) * 40, y = pl.y + Math.sin(a) * 30;
      if (G.World.isFree(x, y, 12)) { c.x = x; c.y = y; break; }
      c.x = pl.x; c.y = pl.y;
    }
    c.stuck = 0;
    G.FX.burst(c.x, c.y - 12, '#fff6d0', 8, 90);
  }

  // ---------------- su ataque ----------------
  function attack(dt, pl, c) {
    if ((c.cd -= dt) > 0) return;
    const t = c.tgt;
    if (!t || t.dead || (G.EnemyAI && G.EnemyAI.hidden(t))) return;
    const d = G.U.dist(c.x, c.y, t.x, t.y), reach = c.cat === 'physical' ? MELEE_R + (t.r || 12) : SHOT_R;
    if (d > reach) return;
    c.cd = CD[c.cat];
    c.aim = Math.atan2(t.y - c.y, t.x - c.x);
    c.anim.dir = G.Sprites.dirFromAngle(c.aim);
    const anim = c.cat === 'physical' ? 'Attack' : 'Shoot';
    if (G.Sprites.can(c.dex, anim)) c.anim.play(anim); else if (G.Sprites.can(c.dex, 'Attack')) c.anim.play('Attack');
    c.seq = (c.seq + 1) % 1000;
    const dmg = perCast(pl, c);
    if (c.cat === 'physical') c.hitsK += (Math.max(1, slash(pl, c, dmg)) - c.hitsK) * 0.2;
    else if (c.beam) c.hitsK += (Math.max(1, ray(pl, c, dmg)) - c.hitsK) * 0.2;
    else shot(pl, c, dmg);
  }

  /** Daño de cada golpe para llevar su trozo: lo tuyo de la ventana × s/(1−s), repartido en sus golpes. */
  //  En partida no todo llega (golpes que fallan, resistencias, la defensa del enemigo): W.plan es lo que se quiso hacer y W.hit
  //  lo que se habría hecho sin el recorte; c.gain = plan / hit (suavizado, 1..GAIN_MAX). Y lo que no pudo pegar por no tener
  //  enemigo a tiro lo guarda (c.since, hasta IDLE_MAX golpes). strike sigue recortando: nunca pasa de SHARE[1].
  function perCast(pl, c) {
    const W = c.win, ownDps = sum(W.own) / Math.max(3, W.n), cd = CD[c.cat];
    const sp = sum(W.plan), sh = sum(W.hit);
    if (W.n >= WIN && sp > 0) c.gain = Math.min(GAIN_MAX, Math.max(1, c.gain * 0.8 + 0.2 * (sh > 0 ? sp / sh : GAIN_MAX)));
    const total = K_OF(share(c)) * ownDps * Math.min(Math.max(c.since, cd), cd * IDLE_MAX) * c.gain;
    c.since = 0;
    W.plan[W.i] += total;
    const hits = c.beam || c.cat === 'physical' ? Math.max(1, c.hitsK) : 1;
    return total / hits;
  }

  /** Un golpe suyo: con tipos y su defensa, recortado para que nunca pase del tope (ventana y partida). */
  function strike(pl, c, e, dmg, dx, dy) {
    if (!e || e.dead || (G.EnemyAI && G.EnemyAI.hidden(e))) return 0;
    const m = G.Types.mult(c.type, e.types);
    const k = (e.legend && G.Types.legK ? G.Types.legK(m) : m) * (G.Weather ? G.Weather.mult(c.type) : 1) * (G.Stats ? G.Stats.taken(e.mon, c.cat) : 1);
    const K = K_OF(SHARE[1]), W = c.win;
    const room = Math.min(K * sum(W.own) - sum(W.comp), K * (own(pl) - c.own0) - c.dealt);
    W.hit[W.i] += dmg * k;
    const d = Math.min(dmg * k, room);
    if (!(d >= 1)) { G.FX.sp('impact', c.vis.pal || 'normal', e.x, e.y - (e.bodyH || 20) * 0.5, { life: 0.12, scale: 0.8 }); return 0; }
    e.hurt(d, c.col, dx, dy, 0, G.Types.label(m));
    c.dealt += d; W.comp[W.i] += d;
    pl.compDealt = (pl.compDealt || 0) + d;
    pl.dmgDealt += d;
    G.Reg.v1.compHit(d);
    return d;
  }

  function slash(pl, c, dmg) {
    const half = MELEE_ARC / 2;
    G.FX.slash(c.x, c.y - G.LIFT * 0.5, c.aim, MELEE_R, MELEE_ARC, c.col, c.vis);
    let n = 0;
    for (const e of G.EnemyMgr.queryCircle(c.x, c.y, MELEE_R + 16)) {
      if (n >= 6) break;
      const a = Math.atan2(e.y - c.y, e.x - c.x);
      if (Math.abs(((a - c.aim + Math.PI * 3) % 6.2832) - Math.PI) > half) continue;
      if (strike(pl, c, e, dmg, e.x - c.x, e.y - c.y) > 0) n++;
    }
    return n;
  }

  function ray(pl, c, dmg) {
    const len = SHOT_R, w = 18, ca = Math.cos(c.aim), sa = Math.sin(c.aim);
    G.FX.beam(c.x, c.y - G.LIFT, c.aim, len, w, c.col, c.vis);
    let n = 0;
    for (const e of G.EnemyMgr.queryCircle(c.x + ca * len / 2, c.y + sa * len / 2, len / 2 + w)) {
      if (n >= 6) break;
      const px = e.x - c.x, py = e.y - c.y, along = px * ca + py * sa;
      if (along < -e.r || along > len + e.r || Math.abs(-px * sa + py * ca) > w / 2 + e.r) continue;
      if (strike(pl, c, e, dmg, ca, sa) > 0) n++;
    }
    return n;
  }

  function shot(pl, c, dmg, ghostOnly = false) {
    const sp = 420, a = c.aim;
    G.Projectiles.spawn({ x: c.x + Math.cos(a) * 6, y: c.y + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      dmg: 0, r: 7, life: SHOT_R / sp + 0.25, pierce: 0, color: c.col, homing: 3, hits: new Set(), vis: c.vis, ghost: true, comp: true,
      onHit: ghostOnly ? null : (p, e) => { strike(pl, c, e, dmg, p.vx, p.vy); return false; } });
  }

  // ---------------- lo que le pasa ----------------
  function contact(dt, c) {
    if ((c.hitCd -= dt) > 0) return;
    let d = 0;
    for (const e of G.EnemyMgr.queryCircle(c.x, c.y, c.r0 + 4)) if (!e.dead && e.behavior !== 'thief') d += (e.dmg || 5) * 0.35;
    if (!d) return;
    c.hitCd = 0.5;
    c.hp -= Math.min(c.maxHp * 0.25, d);
    c.flash = 0.1;
    G.FX.burst(c.x, c.y - 10, '#ff5f6d', 4, 60);
    if (c.hp <= 0) down(c);
  }

  function down(c) {
    c.hp = 0; c.dead = true; c.down = REVIVE_T; c.tgt = null;
    c.anim.play('Faint', { hold: true });
    G.Spawner.say(G.I18n.f('{x} se ha debilitado: se levanta en {x} s', c.name, REVIVE_T), 2.6, true);
    G.Reg.v1.companion('down');
  }

  function revive(pl, c) {
    c.dead = false; c.hp = c.maxHp; c.cd = 0.8; c.since = 0;
    teleport(pl, c);
    c.anim = new G.Sprites.Animator(c.dex, 1);
    G.FX.ring(c.x, c.y - 10, 6, 70, '#5fe08a', 0.5, 3);
    G.Spawner.say(G.I18n.f('¡{x} vuelve a la carga!', c.name), 2.2, true, { col: '#7dffb0' });
  }

  // ---------------- red (cooperativo: cada uno el suyo) ----------------
  /** Lo que va en tu estado (coop.js myState, campo 19): [dex, x, y, dir, flags, seq, aim]. flags: 1 anda, 2 caído, 4 huevo. */
  function netState(pl) {
    const c = pl && pl.companion;
    if (!c) return 0;
    if (c.egg) return [c.dex, 0, 0, 0, 4, 0, 0];
    return [c.dex, Math.round(c.x), Math.round(c.y), c.anim.dir | 0, (c.moving ? 1 : 0) | (c.dead ? 2 : 0), c.seq | 0, Math.round((c.aim || 0) * 100) / 100];
  }
  /** Lo que llega de otro (coop.js readState): sólo un Pokémon que exista; si no, nada. */
  function readNet(a) {
    if (!Array.isArray(a) || !G.DEX_BY[a[0]]) return null;
    const n = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0;
    return { dex: a[0], x: n(a[1], -1e6, 1e6), y: n(a[2], -1e6, 1e6), dir: n(a[3], 0, 7) | 0, fl: n(a[4], 0, 7) | 0, seq: n(a[5], 0, 1e6) | 0, aim: n(a[6], -10, 10) };
  }

  let remote = new Map();      // uid → { dex, x, y, anim, seq, fl, mate }
  function remoteTick(dt) {
    if (!G.Coop.active || !G.Coop.mates) { if (remote.size) remote.clear(); return; }
    const seen = new Set();
    for (const m of G.Coop.mates) {
      const s = m.connected && m.pl && m.pl.net && m.pl.net.cp;
      if (!s) continue;
      seen.add(m.uid);
      let R = remote.get(m.uid);
      if (!R || R.dex !== s.dex) {
        G.Sprites.preload([s.dex]);
        const mon = G.DEX_BY[s.dex] || {};
        R = { dex: s.dex, x: s.x, y: s.y, seq: s.seq, anim: new G.Sprites.Animator(s.dex, 1), r0: G.Sprites.bodyRadius(s.dex),
              type: (mon.types || ['normal'])[0], cat: sideOf(s.dex) };
        R.mv = G.Moves.get(moveOf(s.dex)) || { id: moveOf(s.dex), type: R.type };
        R.vis = G.VFX ? G.VFX.forMove(R.mv) : {}; R.col = G.U.TYPE_COLOR[R.type];
        remote.set(m.uid, R);
      }
      R.mate = m.pl; R.fl = s.fl;
      if (!(s.fl & 4)) {
        const k = Math.min(1, dt * 12);
        if (Math.abs(s.x - R.x) > 300 || Math.abs(s.y - R.y) > 300) { R.x = s.x; R.y = s.y; }
        R.x += (s.x - R.x) * k; R.y += (s.y - R.y) * k;
        R.anim.dir = s.dir;
        if (s.seq !== R.seq) {
          R.seq = s.seq;
          if (!(s.fl & 2) && G.Camera.sees(R.x, R.y, 200)) {
            R.aim = s.aim;
            if (R.cat === 'physical') G.FX.slash(R.x, R.y - G.LIFT * 0.5, s.aim, MELEE_R, MELEE_ARC, R.col, R.vis);
            else if (R.mv.kind === 'beam') G.FX.beam(R.x, R.y - G.LIFT, s.aim, SHOT_R, 18, R.col, R.vis);
            else shot(null, Object.assign({ aim: s.aim }, R), 0, true);
            if (G.Sprites.can(R.dex, 'Attack')) R.anim.play('Attack');
          }
        }
        R.anim.update(dt);
        if (s.fl & 2) { if (R.anim.cur !== 'Faint' && !R.anim.busy()) R.anim.play('Faint', { hold: true }); }
        else if (!R.anim.busy()) R.anim.loop(s.fl & 1 ? 'Walk' : 'Idle');
      }
    }
    for (const k of remote.keys()) if (!seen.has(k)) remote.delete(k);
  }

  // ---------------- dibujo ----------------
  function drawEgg(ctx, x, y, frac) {
    const t = performance.now() / 1000, wob = frac >= 0.8 ? Math.sin(t * 14) * 2 : 0;
    G.Icons.draw(ctx, 'egg', Math.round(x - 10 + wob), Math.round(y - 20 - Math.abs(Math.sin(t * 2.4)) * 2), 20);
    if (frac == null) return;
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.arc(x, y - 10, 14, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 10, 14, -Math.PI / 2, -Math.PI / 2 + Math.min(1, frac) * 6.2832); ctx.stroke();
    ctx.restore();
  }

  function drawMon(ctx, o, c) {
    const dead = c ? c.dead : o.fl & 2;
    ctx.save();
    if (dead) ctx.globalAlpha = 0.6;
    G.Sprites.drawShadow(ctx, o.dex, o.x, o.y, 1);
    o.anim.draw(ctx, o.x, o.y, { flash: c && c.flash > 0 });
    ctx.restore();
    if (!c) return;
    const h = G.Sprites.bodyHeight(c.dex, 1), y = c.y - h - 6;
    if (c.dead) {
      const s = Math.ceil(c.down) + ' s';
      ctx.save();
      ctx.font = '700 13px Grenze,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,10,6,.9)'; ctx.strokeText(s, c.x, y);
      ctx.fillStyle = '#ffe9a8'; ctx.fillText(s, c.x, y);
      ctx.restore();
    } else if (c.hp < c.maxHp) {
      const w = 26;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(c.x - w / 2, y, w, 3);
      ctx.fillStyle = '#5fe08a'; ctx.fillRect(c.x - w / 2, y, w * Math.max(0, c.hp / c.maxHp), 3);
    }
  }

  /** Para ordenarlos por Y con el resto (game.js drawScene). */
  function drawables(pl) {
    const out = [], c = pl && pl.companion;
    if (c && c.egg && !pl.dead) out.push({ x: pl.x, y: pl.y + 1, draw: ctx => drawEgg(ctx, pl.x + (pl.r || 14) + 8, pl.y, c.walked / c.need) });
    else if (c && !c.egg && c.anim) out.push({ x: c.x, y: c.y, draw: ctx => drawMon(ctx, c, c) });
    for (const R of remote.values()) {
      if (R.fl & 4) { const m = R.mate; if (m && !m.dead) out.push({ x: m.x, y: m.y + 1, draw: ctx => drawEgg(ctx, m.x + (m.r || 14) + 8, m.y, null) }); }
      else out.push({ x: R.x, y: R.y, draw: ctx => drawMon(ctx, R, null) });
    }
    return out;
  }

  function reset() { remote = new Map(); }

  return {
    SHARE, HATCH_D, EVO_AT, REVIVE_T, MOVE, CD, WIN,
    pool, rollEgg, stagesFrom, sideOf, moveOf, give, share, update, drawables, netState, readNet, reset, strike, perCast,
    /** Para pruebas: el huevo que llevas eclosiona ya / tu compañero evoluciona ya. */
    debugHatch(pl = G.Game.player) { const c = pl && pl.companion; if (c && c.egg) { c.walked = c.need; hatch(pl, c); } return c; },
    debugEvolve(pl = G.Game.player) { const c = pl && pl.companion; if (c && !c.egg && c.stage < c.maxStage) evolve(pl, c); return c; }
  };
})();
