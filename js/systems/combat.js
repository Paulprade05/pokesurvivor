/* ============ combat.js — ejecución de movimientos y colisiones ============
 * Sólo se ejecuta el movimiento ACTIVO del jugador. Cada `kind` tiene aquí su
 * implementación. Todos los ataques dañan también los objetos destructibles
 * del escenario (rocas, cofres, hierba alta).
 *
 * Todo ocurre en el plano del suelo: (x, y) son pies / sombra.
 *
 * Cooperativo: cada ordenador ejecuta los ataques de SU jugador. Los de los
 * compañeros llegan por la red y se repiten como "fantasma" (ghostCast): se
 * ven igual, pero no hacen daño aquí (ya lo hizo su dueño).
 *
 * Lo que se queda en el mapa un rato (minas, meteoros que caen, torretas,
 * charcos del rastro, ráfagas, columnas, agujas, barridos de pantalla,
 * aliados, aves, frascos y charcos, lluvias) vive en `fields` y se
 * actualiza/dibuja aquí. Los escudos (ward) se guardan en el movimiento
 * (m.charges) y los gasta Player.hurt con wardBlock.
 *
 * Pasivos de la run (Amplitud, Persistencia, Réplica, Propulsión): ya vienen
 * en los números de cada instancia (G.Moves.rebake); los pocos que se leen
 * aquí, con pkOf(m).
 */
G.Combat = (() => {
  let ghost = false;
  let fields = [];

  // ---------------- ejecutar el movimiento activo ----------------

  function tick(dt, pl, now) {
    if (pl.u3) tickPl3(dt, pl);                      // (ataques únicos de Roca, Fantasma... al final)
    zTick(dt, pl, now);
    if (pl.dead) return;
    const act = pl.activeGroup();
    // Las recargas de los otros huecos también corren (#174: antes se congelaban y
    // al volver se cortaban al 35 %; cambiando de hueco se disparaba casi el triple).
    for (const g of pl.slots) if (g !== act) for (const m of g) if (m.t > 0) m.t -= dt;
    if (pl.swapLock > 0) pl.swapLock -= dt;          // espera que arrastra el cambio de hueco (player.js setActive)
    // Vínculos: todos los movimientos del hueco activo, cada uno con su recarga.
    for (const m of act) tickMove(dt, pl, m, now);
  }

  /**
   * Recarga de m para este jugador (Bromista: los potenciadores y los escudos se recargan antes, ver data/ability-fx.js).
   * cdMin: tope propio de algunas familias (la ráfaga tiene que acabar antes de la siguiente).
   */
  function cooldown(pl, m) {
    return Math.max(m.cdMin || 0.05, m.cd * pl.cdMul * ((m.kind === 'buff' || m.kind === 'ward') && pl.abil && pl.abil.statusCd || 1));
  }

  /** Pasivos con los que se hizo la instancia (Amplitud, Persistencia...): ver G.Moves.applyPassives. */
  const pkOf = m => m.pk || G.Moves.NO_PASS;

  // ---------------- movimiento Z (24-10-2026, ver data/moves.js y data/shop.js) ----------------
  /*
   * pl.z = { type: el cristal que va (o null: apagado), def, n: ataques de ese tipo,
   * need / needN: el cristal más cercano y los que llevas de él (la pista del botón apagado),
   * have: tus cristales con sus ataques, t: lo que le queda activo, cd: lo que le queda
   * de recarga, m: el movimiento mientras dura, dealt: su daño de las veces anteriores,
   * uses, hintAt: cuándo enseñar la pista } o null si tu Pokémon no lleva la Pulsera Z.
   * Lo pone zOf la primera vez (sólo a tu jugador) y lo revisa cuando aprendes un
   * ataque (data/shop.js, zState: Pulsera Z + Cristal Z del tipo T + 2 ataques de T).
   * Mientras está activo no cambia de tipo; la recarga es una sola para todos.
   * Activo, se lanza con tickMove como los demás, a la vez que tu hueco: en grupo va
   * por la red como un ataque más ('c', coop.js) y los compañeros lo ven con
   * ghostCast (una versión anterior del juego no lo conoce y no lo pinta; el daño
   * le llega igual al anfitrión). Todo es local: la red no cambia.
   * Los relojes corren con la partida: se paran en la pausa y con las cartas.
   */
  function zOf(pl) {
    if (!pl || pl.remote) return null;
    let z = pl.z;
    if (z === undefined) {
      z = pl.z = G.Shop && G.Shop.ringHas && G.Shop.ringHas(pl.mon && pl.mon.dex)
        ? { type: null, def: null, n: 0, need: null, needN: 0, have: [], nm: -1, t: 0, cd: 0, m: null, dealt: 0, uses: 0, hintAt: 0 } : null;
    }
    // (Sólo cuando cambian tus ataques: aprender uno es lo único que lo mueve.)
    if (z && z.nm !== pl.moves.length && !(z.t > 0)) zPick(pl, z);
    return z;
  }

  /** Qué cristal va con los ataques que llevas (y, si ninguno, la pista). */
  function zPick(pl, z) {
    const first = z.nm < 0, was = z.type, wasN = z.needN, wasNeed = z.need, s = G.Shop.zState(pl.mon.dex, pl.moves, pl.mon.types);
    z.nm = pl.moves.length;
    z.type = s.type && G.Moves.Z[s.type] ? s.type : null;
    z.def = z.type ? G.Moves.Z[z.type] : null;
    z.n = s.n; z.need = s.need; z.needN = s.needN; z.have = s.have;
    const now = performance.now();
    if (z.type && z.type !== was) {
      // ¡Listo! (al empezar ya listo, sin aviso: el botón late y basta)
      if (!first) {
        G.Spawner.say(G.I18n.f('¡Movimiento Z listo: {x}!', G.T(z.def.name)), 3, true, { prio: 2, col: G.U.TYPE_COLOR[z.type] });
        G.Audio.sfx('confirm');
      }
    } else if (!z.type && (first || z.needN !== wasN || z.need !== wasNeed)) z.hintAt = now;   // la pista, un rato
  }

  /** Pulsar el Z (tecla, botón del HUD o del mando). → true si se ha activado. */
  function zUse(pl) {
    const z = zOf(pl);
    if (!z || pl.dead) return false;
    // Apagado (falta el cristal o los 2 ataques de su tipo): la pista otra vez.
    if (!z.type) { z.hintAt = performance.now(); G.Audio.sfx('error'); return false; }
    if (z.t > 0 || z.cd > 0) { G.Audio.sfx('error'); return false; }
    const m = G.Moves.zInstance(z.type, pl.level, pl.pass, G.Stats.sideOf(pl.mon));
    if (!m) return false;
    m.since = G.Game.st.time;
    z.m = m; z.t = G.Moves.Z_DUR; z.uses++;
    // ¡Movimiento Z!: destello de su color, dos ondas, el nombre en grande y su fanfarria.
    const col = G.U.TYPE_COLOR[z.type];
    G.FX.ring(pl.x, pl.y, pl.r, 260, col, 0.7, 7);
    G.FX.ring(pl.x, pl.y - G.LIFT * 0.5, pl.r * 5, 4, '#ffffff', 0.45, 4);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col, 24, 220);
    if (G.Game.flash) G.Game.flash(col, 0.35);
    G.Camera.kick(0.45);
    G.Spawner.say(z.def.name, 2.4, true);
    G.Audio.sfx('legend');
    G.Pad.rumble(0.6, 260);
    return true;
  }

  /** Cada fotograma: lo lanza mientras dura y luego corre su recarga. */
  function zTick(dt, pl, now) {
    const z = zOf(pl);
    if (!z || (!z.type && !(z.cd > 0))) return;
    if (z.t > 0) {
      z.t -= dt;
      if (z.m && !pl.dead) tickMove(dt, pl, z.m, now);
      if (z.t <= 0) {
        z.t = 0; z.cd = G.Moves.Z_CD;
        if (z.m) z.dealt += z.m.dealt || 0;
        z.m = null;
        G.FX.ring(pl.x, pl.y, pl.r * 4, pl.r, G.U.TYPE_COLOR[z.type], 0.4, 3);
      }
    } else if (z.cd > 0 && (z.cd -= dt) <= 0) {
      z.cd = 0;
      // Otra vez listo: un aviso suave (el botón también late).
      G.FX.ring(pl.x, pl.y, pl.r, pl.r * 4, G.U.TYPE_COLOR[z.type], 0.4, 3);
      G.Audio.sfx('confirm');
    }
  }

  function tickMove(dt, pl, m, now) {
    // (Ataques únicos: una órbita puede llevar la suya, UQ[id].orbit.)
    if (m.kind === 'orbit') { if (!uqOrbit(pl, m, dt, now)) orbit(pl, m, dt, now); return; }
    // Escudos llenos: el reloj no corre (empieza otra vez al gastar uno, ver wardBlock).
    if (m.kind === 'ward' && (m.charges | 0) >= wardMax(m)) { m.t = 0; return; }

    m.t -= dt;
    if (m.t > 0) return;
    // Barrido de pantalla: sólo si merece la pena (4 enemigos o un jefe en la caja).
    if (m.kind === 'wipe' && !wipeWorth(pl)) { m.t = 0.5; return; }
    // Los ataques que necesitan blanco esperan a tenerlo (no gastes animación al aire).
    let swap = false, t0 = null, a0 = 0;
    if (needsTarget(m, pl)) {
      const t = pl.target, r = reach(m);
      if (!(t && !t.dead && G.U.dist(pl.x, pl.y, t.x, t.y) <= r)) {
        // Si el blanco no está a tiro (un jefe lejos con un ataque cuerpo a cuerpo, o
        // el segundo ataque de un vínculo, que llega menos), el más cercano que sí lo esté.
        // Sólo para este ataque: los demás del vínculo siguen con el blanco de siempre.
        const e = G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, r);
        if (!e) { m.t = 0.05; return; }
        swap = true; t0 = t; a0 = pl.aim;
        pl.target = e;
        if (!pl.manualAim) pl.aim = Math.atan2(e.y - pl.y, e.x - pl.x);
      }
    } else if (needsNear(m, pl) && !G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, reach(m))) {
      // Los que no apuntan a nadie (ráfaga, aguja...) esperan a que haya algún enemigo cerca.
      m.t = 0.05; return;
    }
    // Ataques únicos que esperan a algo suyo (Terratemblor: a que andes).
    if (UQ[m.id] && UQ[m.id].ready && !UQ[m.id].ready(pl, m)) {
      if (swap) { pl.target = t0; pl.aim = a0; }
      m.t = 0.05; return;
    }
    // Ráfaga: hacia donde miras (o apuntas), no al enemigo. El apuntado se cambia
    // sólo para lanzarla (así el compañero la ve en esa dirección) y se devuelve.
    if (m.kind === 'knife') {
      if (!swap) { swap = true; t0 = pl.target; a0 = pl.aim; }
      if (!pl.manualAim) pl.aim = pl.moveAngle;
    }
    m.t = cooldown(pl, m);
    // Una sola vez: esta recarga × cdK (ataques únicos: Huesomerang atrapado...).
    if (m.cdK != null) { m.t *= m.cdK; m.cdK = null; }
    pl.cast(m);
    if (G.Coop.active) G.Coop.cast(pl, m);
    // Vínculo: su icono destella en el HUD al lanzarse (uno que explota pegado al
    // enemigo, como Ascuas tras Ataque Rápido, casi no se ve).
    m.castAt = performance.now();

    run(pl, m);
    if (swap) { pl.target = t0; pl.aim = a0; }
  }

  function run(pl, m) {
    // Ataques únicos: si el movimiento tiene mecánica propia (UQ[id].cast o MECH3[id].cast), manda ella.
    if (uqRun(pl, m)) return;
    switch (m.kind) {
      case 'projectile': fireProjectiles(pl, m); break;
      case 'melee':      melee(pl, m); break;
      case 'beam':       beam(pl, m); break;
      case 'nova':       nova(pl, m); break;
      case 'aura':       aura(pl, m); break;
      case 'buff':       buff(pl, m); break;
      case 'boomerang':  boomerang(pl, m); break;
      case 'chain':      chain(pl, m); break;
      case 'mine':       mines(pl, m); break;
      case 'meteor':     meteors(pl, m); break;
      case 'turret':     turret(pl, m); break;
      case 'dash':       dash(pl, m); break;
      case 'trail':      trailPatch(pl, m); break;
      case 'cone':       cone(pl, m); break;
      case 'homing':     fireProjectiles(pl, m); break;      // persiguen: m.homing
      case 'bounce':     fireProjectiles(pl, m); break;      // rebotan: m.bounce (ver rebound)
      case 'charge':     chargeUp(pl, m); break;
      case 'spin':       spin(pl, m); break;
      case 'quake':      quake(pl, m); break;
      case 'vortex':     vortex(pl, m); break;
      case 'shove':      shove(pl, m); break;
      case 'stun':       stunZone(pl, m); break;
      // familias del 22-10-2026
      case 'lob':        lob(pl, m); break;
      case 'knife':      knife(pl, m); break;
      case 'cross':      cross(pl, m); break;
      case 'column':     column(pl, m); break;
      case 'sweep':      sweep(pl, m); break;
      case 'ricochet':   carom(pl, m); break;
      case 'wipe':       wipe(pl, m); break;
      case 'ward':       ward(pl, m); break;
      case 'ally':       allies(pl, m); break;
      case 'wings':      wings(pl, m); break;
      case 'puddle':     flasks(pl, m); break;
      case 'dusting':    shower(pl, m); break;
    }
  }

  const TARGETED = ['melee', 'beam', 'projectile', 'boomerang', 'chain', 'meteor', 'dash', 'cone',
                    'homing', 'bounce', 'charge', 'spin', 'quake', 'vortex', 'shove', 'stun',
                    'lob', 'cross', 'ricochet'];
  // Con "Apuntar a mano" éstos se lanzan hacia donde apuntas aunque no haya
  // nadie (los decide el jugador); la cadena y los meteoros siguen esperando blanco.
  const FREE_AIM = ['melee', 'beam', 'projectile', 'boomerang', 'dash', 'cone', 'homing', 'bounce', 'charge', 'spin', 'quake', 'shove',
                    'lob', 'knife', 'cross', 'ricochet', 'column'];
  // No buscan blanco, pero esperan a que haya algún enemigo a `reach` (sin cambiar el blanco).
  // (Escudos y barridos de pantalla miran lo suyo en tickMove.)
  const AMBIENT = ['knife', 'sweep', 'ally', 'wings', 'puddle', 'dusting'];
  // La columna en el enemigo busca blanco; la que va sobre ti sólo espera a tener alguno cerca.
  const targeted = m => TARGETED.includes(m.kind) || (m.kind === 'column' && m.anchor === 'target');
  const ambient = m => AMBIENT.includes(m.kind) || (m.kind === 'column' && m.anchor !== 'target');
  function needsTarget(m, pl) { return targeted(m) && !(pl && pl.manualAim && FREE_AIM.includes(m.kind)); }
  function needsNear(m, pl) { return ambient(m) && !(pl && pl.manualAim && FREE_AIM.includes(m.kind)); }
  function reach(m) {
    if (MECH3[m.id] && MECH3[m.id].reach) return MECH3[m.id].reach(m);
    if (m.kind === 'melee') return m.radius + 30;
    if (m.kind === 'beam') return m.radius + 20;
    if (m.kind === 'boomerang') return m.radius + 40;
    if (m.kind === 'chain') return 280;
    if (m.kind === 'meteor') return 340;
    if (m.kind === 'dash') return m.radius + 60;
    if (m.kind === 'cone') return m.speed * m.life + 30;
    if (m.kind === 'spin' || m.kind === 'shove' || m.kind === 'charge') return m.radius + 20;
    if (m.kind === 'quake') return (m.count | 0) * QSTEP + m.radius;
    if (m.kind === 'vortex' || m.kind === 'stun') return 300;
    if (m.kind === 'lob') return 360;
    if (m.kind === 'knife' || m.kind === 'cross') return m.speed * m.life + 30;
    if (m.kind === 'column') return m.anchor === 'target' ? 300 : m.height / 2 + 40;
    if (m.kind === 'sweep') return m.radius + 30;
    if (m.kind === 'ricochet') return 400;
    if (m.kind === 'ally') return 320;
    if (m.kind === 'wings') return (m.ring || 150) + 120;
    if (m.kind === 'puddle') return m.range || 260;
    if (m.kind === 'dusting') return 420;
    if (m.kind === 'wipe') return WIPE_W;
    if (m.kind === 'ward') return Infinity;
    return 520;
  }

  function payload(m) {
    const o = { burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.type, mcat: m.cat, src: m,
                bounce: m.bounce | 0, drain: m.drain || 0 };
    // Ataques únicos: lo de sus proyectiles (trayectoria, al chocar, al acabar...), UQ[id].pp.
    const X = UQ[m.id];
    if (X && X.pp) Object.assign(o, X.pp(m));
    return o;
  }

  /** Tabla de tipos × clima para un ataque de tipo `type` contra `e`. */
  function typeK(type, e) { return G.Types.mult(type, e.types) * G.Weather.mult(type); }

  function fireProjectiles(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    const vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0);
    const spread = m.spread || 0;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * n;
      const a = pl.aim + off + G.U.rand(-0.03, 0.03);
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 3, y: pl.y + Math.sin(a) * 3,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg: m.dmg * pl.atkFor(m), r: m.size, life: m.life,
        pierce: m.pierce | 0, color: col, homing: m.homing || 0,
        hits: new Set(), vis, ghost, owner: pl
      }, payload(m)));
    }
    G.FX.spark(pl.x + Math.cos(pl.aim) * pl.r, pl.y - G.LIFT + Math.sin(pl.aim) * pl.r,
               col, Math.cos(pl.aim), Math.sin(pl.aim), 3);
  }

  function nova(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    const vis = G.VFX.forMove(m);
    const n = Math.max(3, m.count | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + G.U.rand(-0.06, 0.06);
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 3, y: pl.y + Math.sin(a) * 3,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg: m.dmg * pl.atkFor(m), r: m.size, life: m.life,
        pierce: m.pierce | 0, color: col, homing: m.homing || 0,
        hits: new Set(), vis, ghost, owner: pl
      }, payload(m)));
    }
    G.FX.ring(pl.x, pl.y, pl.r, pl.r * 4, col, 0.3, 3);
  }

  function inArc(px, py, x, y, aim, half) {
    const a = Math.atan2(y - py, x - px);
    return Math.abs(((a - aim + Math.PI * 3) % 6.2832) - Math.PI) <= half;
  }

  function melee(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    const half = Math.min(m.arc, 6.2832) / 2;
    G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim, m.radius, m.arc, col, G.VFX.forMove(m));
    if (ghost) return;

    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
      if (!inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
      hit(pl, e, m.dmg * pl.atkFor(m), col, e.x - pl.x, e.y - pl.y, m.knock || 0, m);
    }
    for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) {
      if (inArc(pl.x, pl.y, p.x, p.y, pl.aim, half)) G.World.damageProp(p, m.dmg * pl.atkFor(m), col);
    }
  }

  function beam(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    const w = m.width;
    const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);

    // El rayo se corta en la primera pared.
    let len = m.radius;
    for (let d = 8; d < m.radius; d += 8) {
      if (G.World.isWall(pl.x + ca * d, pl.y + sa * d)) { len = d; break; }
    }
    G.FX.beam(pl.x, pl.y - G.LIFT, pl.aim, len, w, col, G.VFX.forMove(m));
    if (ghost) return;
    G.Camera.kick(0.08);

    const mx = pl.x + ca * len / 2, my = pl.y + sa * len / 2;
    const onBeam = (x, y, r) => {
      const px = x - pl.x, py = y - pl.y;
      const along = px * ca + py * sa;
      if (along < -r || along > len + r) return false;
      return Math.abs(-px * sa + py * ca) <= w / 2 + r;
    };
    for (const e of G.EnemyMgr.queryCircle(mx, my, len / 2 + w)) {
      if (onBeam(e.x, e.y, e.r)) hit(pl, e, m.dmg * pl.atkFor(m), col, ca, sa, 0, m);
    }
    for (const p of G.World.propsInCircle(mx, my, len / 2 + w)) {
      if (onBeam(p.x, p.y, p.r)) G.World.damageProp(p, m.dmg * pl.atkFor(m), col);
    }
  }

  function aura(pl, m) {
    const col = G.U.TYPE_COLOR[m.type];
    G.FX.ring(pl.x, pl.y, m.radius * 0.5, m.radius, col, 0.28, 2);
    const vis = G.VFX.forMove(m);
    if (vis.aura) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * 6.2832, r = m.radius * G.U.rand(0.45, 1);
        const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r * 0.8 - G.LIFT * 0.5;
        // Hierba Lazo tira hacia ti; veneno y sombras suben; el resto gira.
        const v = vis.inward ? [-Math.cos(a) * r * 2.2, -Math.sin(a) * r * 1.8]
                : vis.rise ? [G.U.rand(-10, 10), -55]
                : [-Math.sin(a) * 70, Math.cos(a) * 55];
        G.FX.sp(vis.aura, vis.pal, x, y, { vx: v[0], vy: v[1], life: 0.42,
          spin: G.VFX.spins(vis.aura) ? G.U.rand(-6, 6) : 0 });
      }
    }
    if (ghost) return;
    let healed = 0;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
      hit(pl, e, m.dmg * pl.atkFor(m), col, e.x - pl.x, e.y - pl.y, 0, m);
      if (m.drain) healed += m.drain;
    }
    for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, m.dmg * pl.atkFor(m), col);
    if (healed > 0) pl.heal(Math.min(healed, 6));
  }

  function buff(pl, m) {
    pl.addBuff(m.stat, m.amount, m.dur, m.stacks | 0, m.id);
    const col = G.U.TYPE_COLOR[m.type];
    G.FX.ring(pl.x, pl.y, pl.r * 2.4, pl.r * 1.1, col, 0.35, 2.5);
    const vis = G.VFX.forMove(m);
    for (let i = 0; i < 3; i++) {
      G.FX.sp(vis.buff || 'arrow', vis.pal, pl.x + G.U.rand(-pl.r * 1.4, pl.r * 1.4),
              pl.y - G.U.rand(0, pl.bodyH * 0.8), { vy: -70, life: 0.6 });
    }
  }

  // ---------------- familias nuevas (2026-10-10) ----------------

  /** Bumerán: sale hacia el enemigo, se para y vuelve a ti golpeando a la ida y a la vuelta. */
  function boomerang(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0), spread = m.spread || 0.5;
    const out = m.radius / m.speed;                       // segundos de ida
    for (let i = 0; i < n; i++) {
      const a = pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * Math.min(n, 3));
      G.Projectiles.spawn(Object.assign({
        x: pl.x, y: pl.y, vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg: m.dmg * pl.atkFor(m), r: m.size, life: out * 4 + 1.5, pierce: 999, color: col,
        hits: new Set(), vis, ghost, owner: pl, boom: out, bsp: m.speed * 1.1
      }, payload(m)));
    }
  }

  /** Cadena: golpea a un enemigo y salta a los siguientes más cercanos (cada salto, algo menos). */
  function chain(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    let cur = pl.target && !pl.target.dead && pl.target.hurt ? pl.target : G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, reach(m));
    if (!cur) return;
    let fx = pl.x, fy = pl.y - G.LIFT, k = 1;
    const done = new Set();
    const n = Math.max(1, m.count | 0);
    for (let i = 0; i < n && cur; i++) {
      done.add(cur.id);
      const tx = cur.x, ty = cur.y - cur.bodyH * 0.5;
      G.FX.beam(fx, fy, Math.atan2(ty - fy, tx - fx), Math.hypot(tx - fx, ty - fy), 10, col, vis);
      if (!ghost) {
        // Infortunio: más daño a quien ya sufre un estado.
        // (Una copia del anfitrión no lleva los estados: vienen en net.st.)
        const hex = m.hex && (cur.burn > 0 || cur.poison > 0 || cur.slow > 0 || (cur.net && cur.net.st & 11)) ? m.hex : 1;
        hit(pl, cur, m.dmg * pl.atkFor(m) * k * hex, col, tx - fx, ty - fy, 0, m);
      }
      k *= 0.85;
      fx = tx; fy = ty;
      let best = null, bd = m.radius * m.radius;
      for (const e of G.EnemyMgr.queryCircle(cur.x, cur.y, m.radius)) {
        if (done.has(e.id)) continue;
        const d = G.U.dist2(cur.x, cur.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      cur = best;
    }
    if (!ghost) G.Camera.kick(0.05);
  }

  /** Minas: se quedan en el suelo y estallan cuando un enemigo las pisa. */
  function mines(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, d = n === 1 ? 0 : G.U.rand(18, 46);
      fields.push({ kind: 'mine', owner: pl, ghost, m, col, vis, x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d * 0.8,
                    t: 0, arm: 0.35, life: m.dur || 7, r: m.radius, dmg: m.dmg * pl.atkFor(m) });
    }
    // Como mucho unas pocas por jugador: las más viejas se van.
    const mine = fields.filter(f => f.kind === 'mine' && f.owner === pl);
    for (const f of mine.slice(0, Math.max(0, mine.length - (4 + n * 2)))) f.gone = true;
  }

  /** Meteoros: caen del cielo sobre enemigos cercanos (la sombra avisa dónde). */
  function meteors(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0);
    const near = G.EnemyMgr.queryCircle(pl.x, pl.y, reach(m)).filter(e => !e.dead);
    G.U.shuffle ? G.U.shuffle(near) : near.sort(() => Math.random() - 0.5);
    const fall = 0.5 / pkOf(m).pspd;                      // Propulsión: caen antes
    for (let i = 0; i < n; i++) {
      const e = near[i];
      const x = e ? e.x + G.U.rand(-8, 8) : pl.x + G.U.rand(-140, 140);
      const y = e ? e.y + G.U.rand(-6, 6) : pl.y + G.U.rand(-110, 110);
      fields.push({ kind: 'meteor', owner: pl, ghost, m, col, vis, x, y, t: -i * 0.09, fall, r: m.radius, dmg: m.dmg * pl.atkFor(m) });
    }
  }

  /** Torreta: deja algo en el suelo que dispara solo un rato. */
  function turret(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const a = pl.aim + Math.PI + G.U.rand(-0.6, 0.6);
    fields.push({ kind: 'turret', owner: pl, ghost, m, col, vis, x: pl.x + Math.cos(a) * 26, y: pl.y + Math.sin(a) * 20,
                  t: 0, life: m.dur || 6, shotT: 0.3, dmg: m.dmg * pl.atkFor(m) });
    const mine = fields.filter(f => f.kind === 'turret' && f.owner === pl && !f.gone);
    for (const f of mine.slice(0, Math.max(0, mine.length - Math.max(1, m.count | 0)))) f.gone = true;
    G.FX.ring(pl.x, pl.y, 4, 30, col, 0.3, 2);
  }

  /** Embestida: cruzas como un rayo hacia el enemigo y golpeas a todo lo del camino. */
  function dash(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
    const sx = pl.x, sy = pl.y;
    let len = 0;
    for (let d = 8; d <= m.radius; d += 8) {
      if (!G.World.isFree(sx + ca * d, sy + sa * d, (pl.wr || pl.r) * 0.8, true)) break;
      len = d;
    }
    // Estela: varias copias del golpe a lo largo del recorrido.
    for (let d = 0; d <= len; d += 22) G.FX.sp(vis.proj || 'streak', vis.pal, sx + ca * d, sy + sa * d - G.LIFT * 0.6, { life: 0.22, angle: pl.aim });
    G.FX.slash(sx + ca * len, sy + sa * len - G.LIFT * 0.5, pl.aim, 34, 2.2, col, vis);
    if (ghost) return;
    pl.x = sx + ca * len; pl.y = sy + sa * len;
    G.World.collide(pl);
    // Invulnerable un momento al cruzar (0,3 s), pero como mucho el 60 % del tiempo
    // desde la embestida anterior: con la recarga por debajo de 0,3 s (Ataque Rápido
    // evolucionado y Reflejos) o varias en un vínculo no te tocaba nada nunca.
    const at = G.Game.st.time, gap = pl.dashAt == null ? 1 : at - pl.dashAt;
    pl.dashAt = at;
    pl.invuln = Math.max(pl.invuln || 0, Math.min(0.3, gap * 0.6));
    const w = m.width || 34;
    const mx = sx + ca * len / 2, my = sy + sa * len / 2;
    for (const e of G.EnemyMgr.queryCircle(mx, my, len / 2 + w)) {
      if (segDist2(sx, sy, pl.x, pl.y, e.x, e.y) <= (w / 2 + e.r) ** 2) hit(pl, e, m.dmg * pl.atkFor(m), col, ca, sa, m.knock || 0, m);
    }
    for (const p of G.World.propsInCircle(mx, my, len / 2 + w)) {
      if (segDist2(sx, sy, pl.x, pl.y, p.x, p.y) <= (w / 2 + p.r) ** 2) G.World.damageProp(p, m.dmg * pl.atkFor(m), col);
    }
    G.Camera.kick(0.12);
  }

  /** Rastro: vas dejando charcos que dañan a lo que pasa por encima. */
  function trailPatch(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    // Parado no deja uno nuevo encima del anterior (sólo de vez en cuando).
    // Cada rastro mira el suyo (#104: con Tóxico y Rueda Fuego en un vínculo, el
    // charco de uno tapaba al otro y casi sólo salía fuego). Por id: el compañero
    // (ghostCast) crea una instancia nueva en cada lanzamiento.
    const lp = pl.lastPatch || (pl.lastPatch = {});
    const last = lp[m.id];
    if (last && G.U.dist2(last.x, last.y, pl.x, pl.y) < (m.radius * 0.9) ** 2 && last.t < 1) return;
    const f = { kind: 'patch', owner: pl, ghost, m, col, vis, x: pl.x, y: pl.y, t: 0, life: m.dur || 3, r: m.radius,
                tick: 0, dmg: m.dmg * pl.atkFor(m) };
    fields.push(f);
    lp[m.id] = f;
    const mine = fields.filter(o => o.kind === 'patch' && o.owner === pl && o.m.id === m.id && !o.gone);
    for (const o of mine.slice(0, Math.max(0, mine.length - 18))) o.gone = true;
  }

  /** Abanico corto: muchos disparos rápidos que no llegan lejos (aliento, chorro...). */
  function cone(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(2, m.count | 0), arc = m.arc || 0.9;
    for (let i = 0; i < n; i++) {
      const a = pl.aim + (i / (n - 1) - 0.5) * arc + G.U.rand(-0.05, 0.05);
      const sp = m.speed * G.U.rand(0.85, 1.1);
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 4, y: pl.y + Math.sin(a) * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        dmg: m.dmg * pl.atkFor(m), r: m.size, life: m.life * G.U.rand(0.85, 1.05), pierce: m.pierce | 0, color: col,
        hits: new Set(), vis, ghost, owner: pl
      }, payload(m)));
    }
    G.FX.spark(pl.x + Math.cos(pl.aim) * pl.r, pl.y - G.LIFT + Math.sin(pl.aim) * pl.r, col, Math.cos(pl.aim), Math.sin(pl.aim), 5);
  }

  // ---------------- familias nuevas (2026-10-19) ----------------

  const QSTEP = 34;             // distancia entre ondas de un terremoto

  /** El blanco de un ataque que va a un sitio (remolino, zona): el de siempre si llega; si no, el más cercano. */
  function spotFor(pl, m) {
    const t = pl.target;
    if (t && !t.dead && t.hurt && G.U.dist(pl.x, pl.y, t.x, t.y) <= reach(m)) return t;
    return G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, reach(m));
  }

  /** Carga: brilla un momento y sale un rayo enorme (el de beam, con su grosor). */
  function chargeUp(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m), at = m.charge || 0.75;
    fields.push({ kind: 'charge', owner: pl, ghost, m, col, vis, x: pl.x, y: pl.y, t: 0, at });
    G.FX.ring(pl.x, pl.y - G.LIFT * 0.5, pl.r * 3.2, pl.r * 0.8, col, at, 2);
  }

  /** Giro: golpea todo alrededor `count` veces seguidas (lo hace updateFields). */
  function spin(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    fields.push({ kind: 'spin', owner: pl, ghost, m, col, vis, x: pl.x, y: pl.y, t: 0, n: Math.max(1, m.count | 0), next: 0, a: pl.aim });
  }

  /** Terremoto: una onda avanza en línea delante de ti, explosión tras explosión. */
  function quake(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    fields.push({ kind: 'quake', owner: pl, ghost, m, col, vis, x: pl.x, y: pl.y, t: 0, ca: Math.cos(pl.aim), sa: Math.sin(pl.aim),
                  i: 0, n: Math.max(1, m.count | 0), next: 0, dmg: m.dmg * pl.atkFor(m) });
    if (!ghost) G.Camera.kick(0.1);
  }

  /** Remolino: sale donde está el enemigo, los atrae al centro y les va dañando. */
  function vortex(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m), tg = spotFor(pl, m);
    const x = tg ? tg.x : pl.x + Math.cos(pl.aim) * 120, y = tg ? tg.y : pl.y + Math.sin(pl.aim) * 100;
    fields.push({ kind: 'vortex', owner: pl, ghost, m, col, vis, x, y, t: 0, life: m.dur || 2.6, r: m.radius,
                  tick: 0.15, dmg: m.dmg * pl.atkFor(m), pull: m.pull || 140 });
    G.FX.ring(x, y, m.radius, 6, col, 0.4, 3);
    // Como mucho dos a la vez por jugador.
    const mine = fields.filter(f => f.kind === 'vortex' && f.owner === pl && !f.gone);
    for (const f of mine.slice(0, Math.max(0, mine.length - 2))) f.gone = true;
  }

  /** Empujón: onda alrededor que daña y aparta a los enemigos (no a los jefes). */
  function shove(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    G.FX.ring(pl.x, pl.y, pl.r, m.radius, col, 0.35, 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.2832;
      G.FX.sp(vis.proj, vis.pal, pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.8 - G.LIFT * 0.5,
              { vx: Math.cos(a) * m.radius * 3, vy: Math.sin(a) * m.radius * 2.4, life: 0.3, angle: a });
    }
    if (ghost) return;
    G.Camera.kick(0.1);
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) hit(pl, e, m.dmg * pl.atkFor(m), col, e.x - pl.x, e.y - pl.y, m.knock || 300, m);
    for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, m.dmg * pl.atkFor(m), col);
  }

  /** Aturdir: una zona avisa en el suelo y al momento daña y deja quietos a los que pilla. */
  function stunZone(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m), tg = spotFor(pl, m);
    if (!tg) return;
    const dmg = m.dmg * pl.atkFor(m);
    fields.push({ kind: 'stunzone', owner: pl, ghost, m, col, vis, x: tg.x, y: tg.y, t: 0, delay: 0.45, r: m.radius, dmg });
    // Réplica: una zona más por carta, sobre otros enemigos distintos (con el tope de cantidad).
    // (Y las que traiga de serie: zones, la Presa Espectral.)
    let extra = Math.min(G.Moves.EXTRA_MAX, pkOf(m).amt | 0) + (m.zones | 0);
    if (extra <= 0) return;
    const near = G.EnemyMgr.queryCircle(pl.x, pl.y, reach(m));
    for (let k = 0, i = Math.floor(Math.random() * near.length); k < near.length && extra > 0; k++, i = (i + 1) % near.length) {
      const e = near[i];
      if (e === tg || e.dead) continue;
      fields.push({ kind: 'stunzone', owner: pl, ghost, m, col, vis, x: e.x, y: e.y, t: 0, delay: 0.45, r: m.radius, dmg });
      extra--;
    }
  }

  /** Rebote: el proyectil sale hacia el enemigo más cercano que aún no ha tocado. → true si rebota. */
  function rebound(p, from) {
    if (!(p.bounce > 0)) return false;
    let best = null, bd = 220 * 220;
    for (const e of G.EnemyMgr.queryCircle(from.x, from.y, 220)) {
      if (e.dead || p.hits.has(e.id)) continue;
      const d = G.U.dist2(from.x, from.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return false;
    p.bounce--;
    const sp = Math.hypot(p.vx, p.vy) || 300, [nx, ny] = G.U.norm(best.x - from.x, best.y - from.y);
    p.vx = nx * sp; p.vy = ny * sp; p.x = from.x; p.y = from.y;
    p.t = Math.max(0, p.t - 0.5);                   // un poco más de vida para llegar
    if (Math.random() < 0.6) G.FX.spark(from.x, from.y - G.LIFT, p.color, nx, ny, 3);
    return true;
  }

  // ---------------- familias nuevas (2026-10-22, inspiradas en Vampire Survivors) ----------------

  /**
   * Parábola (Axe): suben en pantalla y caen con gravedad sobre el blanco,
   * atravesando lo que pillan. Van por el aire: ni paredes ni sombra.
   * Sin blanco (apuntar a mano, o el compañero) caen donde se apunta.
   */
  function lob(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m), S = pkOf(m).pspd;
    const t = !ghost && pl.target && !pl.target.dead ? pl.target : null;
    let tx, ty;
    if (t && !pl.manualAim) { tx = t.x; ty = t.y; }
    else {
      // A mano: hacia donde apuntas, a la distancia del blanco si lo hay.
      const d = ghost ? 200 : t ? G.U.clamp(G.U.dist(pl.x, pl.y, t.x, t.y), 60, 360) : 220;
      tx = pl.x + Math.cos(pl.aim) * d; ty = pl.y + Math.sin(pl.aim) * d;
    }
    // Sale hacia arriba a `speed` y cae con `grav`. Si el blanco está más alto que
    // donde llega (unos 80 px), sube lo justo para pasarle por encima y caerle.
    const g = m.grav || 700, up = pl.y - ty;
    let v0 = m.speed;
    if (v0 * v0 < 2 * g * (up + 24)) v0 = Math.sqrt(2 * g * (up + 24));
    // Tiempo hasta bajar otra vez a la altura del blanco.
    const tt = (v0 + Math.sqrt(Math.max(0, v0 * v0 - 2 * g * up))) / g;
    const lim = 420 * S, vx0 = G.U.clamp((tx - pl.x) / tt, -lim, lim);
    const n = Math.max(1, m.count | 0), dmg = m.dmg * pl.atkFor(m);
    for (let i = 0; i < n; i++) {
      // El 1.º al blanco; los demás, abiertos a izquierda y derecha.
      const vx = vx0 + (i ? (i % 2 ? -1 : 1) * (m.spread || 0) * Math.ceil(i / 2) : 0);
      G.Projectiles.spawn(Object.assign({
        x: pl.x, y: pl.y, vx, vy: -v0, grav: g, air: true, noShadow: true,
        dmg, r: m.size, life: m.life, pierce: m.pierce | 0, color: col,
        hits: new Set(), vis, ghost, owner: pl
      }, payload(m)));
    }
  }

  /** Ráfaga (Knife): `count` disparos seguidos hacia pl.aim (en tickMove, donde miras). Los suelta el campo «burst». */
  function knife(pl, m) {
    const n = Math.max(1, m.count | 0);
    fields.push({ kind: 'burst', owner: pl, ghost, m, col: G.U.TYPE_COLOR[m.type], vis: G.VFX.forMove(m),
                  x: pl.x, y: pl.y, a: pl.aim, n, i: 0, next: 0, t: 0,
                  // Uno cada 0,05 s, o más seguidos si no le da tiempo antes de la siguiente ráfaga.
                  every: Math.min(0.05, cooldown(pl, m) * 0.8 / n), dmg: m.dmg * pl.atkFor(m) });
  }

  /**
   * Aspas (Phiera / Eight the Sparrow): `count` repartidas a tu alrededor; con
   * curl, las demás giran en espiral. La que va hacia el blanco va recta (si no,
   * con un solo enemigo no le daba nunca).
   */
  function cross(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0), dmg = m.dmg * pl.atkFor(m);
    for (let i = 0; i < n; i++) {
      const a = pl.aim + i * 6.2832 / n;
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 3, y: pl.y + Math.sin(a) * 3,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed, curl: i ? m.curl || 0 : 0,
        dmg, r: m.size, life: m.life, pierce: m.pierce | 0, color: col, homing: m.homing || 0,
        hits: new Set(), vis, ghost, owner: pl
      }, payload(m)));
    }
    G.FX.ring(pl.x, pl.y, pl.r, pl.r * 3, col, 0.25, 2);
  }

  /** Separación de la columna i (0 en el centro, luego a un lado y a otro). */
  const colOff = (i, w) => (i ? (i % 2 ? 1 : -1) * (w + 12) * Math.ceil(i / 2) : 0);

  /**
   * Columna (Song of Mana): rectángulos de arriba abajo que golpean a todo lo de
   * dentro cada 0,25 s mientras duran. anchor self: sobre ti y te siguen;
   * target: en el enemigo, fijas. Las paredes no las paran.
   */
  function column(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m), self = m.anchor !== 'target';
    let x = pl.x, y = pl.y;
    if (!self) {
      const tg = ghost ? null : spotFor(pl, m);
      if (tg) { x = tg.x; y = tg.y; }
      else { x = pl.x + Math.cos(pl.aim) * 140; y = pl.y + Math.sin(pl.aim) * 140; }
    }
    const n = Math.max(1, m.count | 0);
    fields.push({ kind: 'column', owner: pl, ghost, m, col, vis, self, x, y, n, w: m.width, h: m.height,
                  t: 0, hl: m.life, life: m.life + 0.08, k: 0, pad: m.height / 2 + (m.width + 12) * n,
                  dmg: m.dmg * pl.atkFor(m) });
  }

  /** Un golpe de las columnas de f (y sus partículas). */
  function columnStrike(f) {
    const pl = f.owner, m = f.m, hw = f.w / 2, hh = f.h / 2, R = Math.hypot(hw, hh);
    const sees = G.Camera.sees(f.x, f.y, f.pad), v = f.vis, up = !!v.rise;
    const ang = G.VFX.isDir(v.proj) ? (up ? -Math.PI / 2 : Math.PI / 2) : 0, spin = G.VFX.spins(v.proj);
    for (let i = 0; i < f.n; i++) {
      const cx = f.x + colOff(i, f.w), cy = f.y;
      if (sees) {
        // Lo que cae (agua, carámbanos) o sube (luz, el gancho) por la columna.
        for (let j = 0; j < 7; j++) {
          G.FX.sp(v.proj, v.pal, cx + G.U.rand(-hw + 3, hw - 3), cy + G.U.rand(-hh, hh) - G.LIFT * 0.5,
                  { vy: (up ? -1 : 1) * G.U.rand(300, 460), life: 0.22, angle: ang, spin: spin ? G.U.rand(-6, 6) : 0 });
        }
        if (m.knockUp) for (let j = 0; j < 3; j++) {
          G.FX.sp('streak', v.pal, cx + G.U.rand(-hw, hw), cy + G.U.rand(-hh * 0.5, hh), { vy: -520, life: 0.18, angle: -Math.PI / 2 });
        }
      }
      if (f.ghost || pl.dead) continue;
      for (const e of G.EnemyMgr.queryCircle(cx, cy, R)) {
        if (Math.abs(e.x - cx) > hw + e.r || Math.abs(e.y - cy) > hh) continue;
        // Empuja hacia fuera del eje; Gancho Alto, hacia arriba.
        hit(pl, e, f.dmg, f.col, m.knockUp ? 0 : e.x >= cx ? 1 : -1, m.knockUp ? -1 : 0, m.knock || 0, m);
      }
      for (const p of G.World.propsInCircle(cx, cy, R)) {
        if (Math.abs(p.x - cx) <= hw + p.r && Math.abs(p.y - cy) <= hh) G.World.damageProp(p, f.dmg, f.col);
      }
    }
    if (!f.ghost && sees) G.Camera.kick(0.05);
  }

  /**
   * Aguja (Clock Lancet): `count` rayos anclados en ti que giran en sentido
   * horario `dur` s. Uno por movimiento y dueño (el nuevo quita al anterior).
   */
  function sweep(pl, m) {
    for (const f of fields) if (f.kind === 'sweep' && f.owner === pl && f.m.id === m.id) f.gone = true;
    // stuns (id → cuándo se le puede volver a aturdir, en tiempo de partida): uno para
    // todos los rayos y todas las agujas del jugador, guardado para la siguiente. Con uno
    // por rayo o por lanzamiento, 4-5 rayos o la recarga corta lo dejaban aturdido siempre;
    // con uno por movimiento, dos agujas en un vínculo se turnaban para lo mismo.
    const stuns = pl.sweepStun || (pl.sweepStun = new Map());
    if (stuns.size > 200) { const now = G.Game.st.time; for (const [k, v] of stuns) if (v <= now) stuns.delete(k); }
    const n = Math.max(1, m.count | 0), logs = [];
    for (let i = 0; i < n; i++) logs.push(new Map());
    fields.push({ kind: 'sweep', owner: pl, ghost, m, col: G.U.TYPE_COLOR[m.type], vis: G.VFX.forMove(m),
                  x: pl.x, y: pl.y, a: pl.aim, ppa: pl.aim, n, t: 0, life: m.dur || 2,
                  logs, stuns, pt: 0, fx: 0, pad: m.radius + 30, dmg: m.dmg * pl.atkFor(m) });
  }

  /**
   * ¿Ha pasado alguno de los n rayos de f (de los ángulos from+i·paso a
   * from+span+i·paso) por el punto a distancia d y ángulo th, con margen r?
   * → 1 + el rayo que le ha dado, o 0.
   */
  function swept(f, from, span, th, d, r) {
    const tol = r / Math.max(d, 1);
    if (tol >= Math.PI) return 1;                    // pegado al centro: el primero
    const step = 6.2832 / f.n;
    for (let i = 0; i < f.n; i++) {
      let k = (th - (from + i * step) + tol) % 6.2832;
      if (k < 0) k += 6.2832;
      if (k <= span + 2 * tol) return i + 1;
    }
    return 0;
  }

  /** Carambola (Runetracer): bolas que rebotan en una caja fija alrededor de ti `dur` s y vuelven a golpear. */
  function carom(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    // Como mucho `count` vivas por movimiento y dueño: las de antes se van.
    const list = G.Projectiles.all();
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.ricochet && p.owner === pl && p.mid === m.id) list.splice(i, 1);
    }
    const n = Math.max(1, m.count | 0), dmg = m.dmg * pl.atkFor(m);
    for (let i = 0; i < n; i++) {
      const a = pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.5);
      G.Projectiles.spawn(Object.assign({
        x: pl.x + Math.cos(a) * 4, y: pl.y + Math.sin(a) * 4, vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg, r: m.size, life: m.dur || 3, pierce: Infinity, color: col, homing: m.homing || 0,
        ricochet: true, box: 200, rehit: 0.5, hitLog: new Map(), blast: m.blast || 0, mid: m.id, spd: m.speed,
        vis, ghost, owner: pl
      }, payload(m)));
    }
  }

  /** Rebote de una carambola: chispa y sonido; evolucionada, además explota. */
  function caromBounce(p) {
    if (G.Camera.sees(p.bx, p.by, 40)) {
      G.FX.spark(p.bx, p.by - G.LIFT, p.color, p.vx, p.vy, 3);
      G.Audio.sfx('shake');
      if (p.blast > 0) {
        G.FX.ring(p.bx, p.by, 4, p.blast, p.color, 0.3, 3);
        G.FX.burst(p.bx, p.by - 6, p.color, 8, 140);
      }
    }
    if (p.blast > 0 && p.src) blast({ ghost: p.ghost, owner: p.owner, m: p.src, col: p.color, dmg: p.dmg, x: p.bx, y: p.by }, p.blast, 0.6);
  }

  /** Quita los más viejos de `kind` de este dueño y movimiento hasta dejar `keep` (los nuevos van al final). */
  function trimOld(kind, pl, id, keep) {
    let k = 0;
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      if (f.kind !== kind || f.owner !== pl || f.gone || f.m.id !== id) continue;
      if (++k > keep) f.gone = true;
    }
  }

  // ---- Barrido de pantalla (wipe): Pentagram / Gorgeous Moon ----
  // Caja fija de «una pantalla» alrededor del dueño: igual en todos los aparatos
  // (con la cámara, una pantalla más grande alcanzaría a más).
  const WIPE_W = 400, WIPE_H = 260;
  const inWipeBox = (pl, e) => Math.abs(e.x - pl.x) <= WIPE_W && Math.abs(e.y - pl.y) <= WIPE_H;
  // Jefes, legendarios y ladrones: sin efecto por porcentaje.
  const hardy = e => e.boss || e.judge || e.behavior === 'thief';

  /** ¿Merece la pena? 4 enemigos o un jefe en la caja (sin crear listas). */
  function wipeWorth(pl) {
    let n = 0;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || !inWipeBox(pl, e)) continue;
      if (e.boss || e.judge || ++n >= 4) return true;
    }
    return false;
  }

  /**
   * Canto Mortal (exec): apunta ya a los de la caja y, tras el aviso, debilita a
   * los que tengan poca vida. Brecha Negra (cut): tras el aviso, a los que estén
   * en la caja les quita parte de la vida, los duerme y les daña.
   */
  function wipe(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m), exec = m.mode !== 'cut';
    const delay = m.delay || 2, marked = [];
    if (exec) for (const e of G.EnemyMgr.all()) if (!e.dead && inWipeBox(pl, e) && marked.length < 80) marked.push(e);
    fields.push({ kind: 'wipe', owner: pl, ghost, m, col, vis, exec, x: pl.x, y: pl.y, t: 0, delay,
                  life: delay + (exec ? 0.5 : (m.stun || 1) + 0.3), marked, hit: null, ring: 0,
                  pad: 600, dmg: m.dmg * pl.atkFor(m) });
    if (G.Camera.sees(pl.x, pl.y, 200)) G.Audio.sfx(exec ? 'toll' : 'surge');
    if (!ghost) G.Camera.kick(0.1);
  }

  /** El golpe del barrido, al acabar el aviso. */
  function wipeStrike(f) {
    const pl = f.owner, m = f.m, cut = !f.exec;
    // Topes: el umbral nunca pasa de 0,65 ni la vida quitada de 0,55.
    const pct = Math.min(cut ? 0.55 : 0.65, m.pct || 0);
    const list = cut ? [] : f.marked;
    if (cut) for (const e of G.EnemyMgr.all()) if (!e.dead && inWipeBox(pl, e) && list.length < 120) list.push(e);
    f.hit = list;
    if (G.Camera.sees(pl.x, pl.y, 200)) {
      G.Audio.sfx(cut ? 'break' : 'judge');
      G.FX.ring(pl.x, pl.y, pl.r, WIPE_W, f.col, 0.5, 5);
      G.FX.burst(pl.x, pl.y - G.LIFT, f.col, 16, 220);
    }
    for (const e of list) {
      if (e.dead) continue;
      G.FX.sp(f.vis.proj, f.vis.pal, e.x, e.y - e.bodyH * 0.6, { vy: -50, life: 0.5, scale: 1.5 });
    }
    if (f.ghost) return;
    G.Camera.kick(0.35);
    const pure = (e, d) => {
      // Daño tal cual (sin tipos ni crítico): cuenta como un golpe tuyo.
      e.hurt(d, f.col, e.x - pl.x, e.y - pl.y, 0, null);
      pl.dmgDealt += d; m.dealt = (m.dealt || 0) + d; pl.onDealt(d);
    };
    for (const e of list) {
      if (e.dead) continue;
      const big = hardy(e);
      if (cut) {
        if (!big) pure(e, pct * e.hp);
        if (!e.dead) hit(pl, e, f.dmg, f.col, e.x - pl.x, e.y - pl.y, 0, m);
        // Dormido de verdad (26-10-2026): un golpe fuerte lo despierta (ver inflict, al final).
        if (!e.dead) inflict(e, 'sleep', m.stun || 1);
      } else if (!big && e.hp <= pct * e.maxHp) {
        // (Una copia del invitado puede ir atrasada: se manda lo justo para el umbral, que el anfitrión decida.)
        pure(e, (e.remote ? pct * e.maxHp : e.hp) + 10);
      } else hit(pl, e, f.dmg, f.col, e.x - pl.x, e.y - pl.y, 0, m);
    }
  }

  // ---- Escudo (ward): Laurel / Crimson Shroud ----
  const wardMax = m => Math.max(1, m.count | 0);
  // Compañeros con escudos a la vista (cuántos, en pl.wardN[id]: lo cuentan sus 'c').
  const ghostWards = new Set();

  /** Gana un escudo (tickMove sólo lo lanza si falta alguno). */
  function ward(pl, m) {
    const max = wardMax(m), vis = G.VFX.forMove(m);
    if (ghost) {
      const w = pl.wardN || (pl.wardN = Object.create(null));
      w[m.id] = Math.min(max, (w[m.id] | 0) + 1);
      ghostWards.add(pl);
    } else m.charges = Math.min(max, (m.charges | 0) + 1);
    G.FX.ring(pl.x, pl.y, pl.r * 3, pl.r * 1.2, G.U.TYPE_COLOR[m.type], 0.35, 2);
    G.FX.sp(vis.proj, vis.pal, pl.x, pl.y - pl.bodyH - 8, { vy: -26, life: 0.55, scale: 1.5 });
  }

  /** Lo que se ve al parar un golpe: anillo, estallido y partículas del escudo. */
  function wardBurst(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    G.FX.ring(pl.x, pl.y, pl.r, m.radius, col, 0.35, 4);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col, 14, 180);
    if (vis.aura) for (let i = 0; i < 8; i++) {
      const a = i * 0.785 + 0.2;
      G.FX.sp(vis.aura, vis.pal, pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.8 - G.LIFT * 0.5,
              { vx: Math.cos(a) * m.radius * 2.6, vy: Math.sin(a) * m.radius * 2, life: 0.32, spin: G.VFX.spins(vis.aura) ? 8 : 0 });
    }
  }

  /**
   * Lo llama Player.hurt con el golpe de un enemigo: si algún escudo lo para,
   * se gasta, contraataca alrededor y devuelve true (no recibe daño).
   */
  function wardBlock(pl) {
    if (!pl || pl.remote || !pl.moves) return false;
    if (pl.u3 && pl.u3.shield > 0) shield3(pl);      // escudo de Luz Lunar (ataques únicos, al final)
    let m = null;
    for (const x of pl.moves) if (x.kind === 'ward' && (x.charges | 0) > 0 && (!m || x.dmg > m.dmg)) m = x;
    if (!m) return false;
    if ((m.charges | 0) >= wardMax(m)) m.t = cooldown(pl, m);   // estaba lleno: empieza a recargar
    m.charges--;
    if (MECH3[m.id] && MECH3[m.id].block) MECH3[m.id].block(pl, m, false);    // (Escudo Real: forma Filo)
    pl.invuln = Math.max(pl.invuln || 0, 0.5);
    if (m.heal > 0) pl.heal(pl.maxHp * m.heal);                   // evolucionado: cura un poco
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, '¡Protegido!', '#9fe0ff', true);
    G.Audio.sfx('shake'); G.Audio.sfx('break');
    G.Camera.kick(0.15);
    wardBurst(pl, m);
    m.castAt = performance.now();
    if (G.Coop.active) G.Coop.cast(pl, m, 1);
    // Ataques únicos: lo que hace al parar (Búnker te encierra, Armadura Ácida te licúa...).
    if (UQ[m.id] && UQ[m.id].block) UQ[m.id].block(pl, m);
    // Contraataque: todo lo que hay en el círculo.
    const col = G.U.TYPE_COLOR[m.type], dmg = m.dmg * pl.atkFor(m), r = m.radius;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, r)) {
      hit(pl, e, dmg, col, e.x - pl.x, e.y - pl.y, m.knock || 0, m);
      if (m.stun > 0 && !e.dead) e.applyStun(m.stun * (e.boss || e.judge ? 0.35 : 1));
    }
    for (const p of G.World.propsInCircle(pl.x, pl.y, r)) G.World.damageProp(p, dmg, col);
    return true;
  }

  /** Escudos alrededor de los pies de pl (front: los de delante, si no los de detrás). */
  function drawWardRing(ctx, pl, n, pal, k0, total, front, now) {
    const R = pl.r * 1.9;
    for (let i = 0; i < n; i++) {
      const a = now * 0.9 + (k0 + i) * 6.2832 / total, s = Math.sin(a);
      if ((s >= 0) !== front) continue;
      G.VFX.draw(ctx, 'shield', pal, pl.x + Math.cos(a) * R, pl.y + s * R * 0.5 - 5, { scale: 1 });
    }
  }

  /** Los escudos guardados: los tuyos (de tus movimientos) y los de los compañeros (pl.wardN). */
  function drawWards(ctx, front, now) {
    if (G.Game.state === 'ui') return;                 // el fondo del menú no lleva jugador
    const me = G.Game.player;
    if (me && !me.dead && me.moves) {
      let total = 0, k = 0;
      for (const m of me.moves) if (m.kind === 'ward') total += m.charges | 0;
      if (total > 0) for (const m of me.moves) {
        if (m.kind !== 'ward' || !(m.charges > 0)) continue;
        drawWardRing(ctx, me, m.charges | 0, m.type, k, total, front, now);
        k += m.charges | 0;
      }
    }
    for (const pl of ghostWards) {
      let total = 0, k = 0;
      for (const id in pl.wardN) total += pl.wardN[id] | 0;
      if (total <= 0) { ghostWards.delete(pl); continue; }
      if (pl.dead || !G.Camera.sees(pl.x, pl.y, 40)) continue;
      for (const id in pl.wardN) {
        const n = pl.wardN[id] | 0, d = G.Moves.BY_ID[id];
        if (n <= 0 || !d) continue;
        drawWardRing(ctx, pl, n, d.type, k, total, front, now);
        k += n;
      }
    }
  }

  // ---- Aliados (ally): Gatti Amari / Vicious Hunger ----
  /** Invoca `count` aliados alrededor de ti (como mucho `count` vivos por movimiento). */
  function allies(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m), n = Math.max(1, m.count | 0);
    const dmg = m.dmg * pl.atkFor(m), copy = m.sprite === 'owner';
    for (let i = 0; i < n; i++) {
      const a = pl.aim + i * 6.2832 / n;
      fields.push({ kind: 'ally', owner: pl, ghost, m, col, vis, x: pl.x + Math.cos(a) * 18, y: pl.y + Math.sin(a) * 14,
                    vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed, t: 0, life: m.dur || 6, r: m.size || 7,
                    tgt: null, look: 0, wa: a, hitLog: new Map(), ph: Math.random() * 6.2832, pad: 40, dmg,
                    // Paliza: copias pequeñas de tu Pokémon (su propia animación).
                    anim: copy ? new G.Sprites.Animator(pl.form || pl.dex, (pl.scale || 1) * 0.55, pl.shiny) : null });
    }
    trimOld('ally', pl, m.id, n);
    G.FX.ring(pl.x, pl.y, 4, pl.r * 3, col, 0.3, 2);
  }

  /** El enemigo más cercano al aliado a menos de 170, sin alejarse más de 260 de su dueño. */
  function allyTarget(f, pl) {
    // (Ataques únicos: el blanco que les dé su movimiento —Al Ataque: el tuyo— y antes los señalados.)
    const X = UQ[f.m.id], own = X && X.allyTarget && X.allyTarget(f, pl);
    if (own) return own;
    let best = null, bd = 170 * 170;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const d = G.U.dist2(f.x, f.y, e.x, e.y) * (e.x2 && e.x2.mark ? 0.2 : 1);
      if (d < bd && G.U.dist2(pl.x, pl.y, e.x, e.y) < 260 * 260) { bd = d; best = e; }
    }
    return best;
  }

  // ---- Aves (wings): Peachone + Ebony Wings ----
  /** Un campo por movimiento y dueño: relanzar renueva la vida y conserva los ángulos. */
  function wings(pl, m) {
    const n = Math.max(1, m.count | 0), dmg = m.dmg * pl.atkFor(m);
    let f = null;
    for (const o of fields) if (o.kind === 'wings' && o.owner === pl && !o.gone && o.m.id === m.id) { f = o; break; }
    if (!f) {
      f = { kind: 'wings', owner: pl, ghost, m, col: G.U.TYPE_COLOR[m.type], vis: G.VFX.forMove(m), x: pl.x, y: pl.y,
            t: 0, life: m.dur || 8, birds: [], bombs: [], bo: { ghost, owner: pl, m, col: G.U.TYPE_COLOR[m.type], dmg, x: 0, y: 0 } };
      fields.push(f);
    } else { f.t = 0; f.life = m.dur || 8; f.m = m; f.bo.m = m; f.bo.dmg = dmg; }
    f.pad = (m.ring || 150) + 60;
    while (f.birds.length > n) f.birds.pop();
    const rate = m.rate || 0.6;
    for (let i = f.birds.length; i < n; i++) f.birds.push({ a: pl.aim + i * 6.2832 / n, dir: i % 2 ? -1 : 1, next: rate * (i + 1) / n });
  }

  // ---- Charcos (puddle): Santa Water / La Borra ----
  /** Lanza `count` frascos a enemigos al azar de los cercanos (o cerca de ti). */
  function flasks(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m), n = Math.max(1, m.count | 0);
    const near = G.EnemyMgr.queryCircle(pl.x, pl.y, m.range || 260);
    for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = near[i]; near[i] = near[j]; near[j] = t; }
    const fall = 0.45 / pkOf(m).pspd, dmg = m.dmg * pl.atkFor(m);
    for (let i = 0; i < n; i++) {
      const e = near[i];
      let tx, ty;
      if (e) { tx = e.x + G.U.rand(-8, 8); ty = e.y + G.U.rand(-8, 8); }
      else { const a = Math.random() * 6.2832, d = G.U.rand(30, 120); tx = pl.x + Math.cos(a) * d; ty = pl.y + Math.sin(a) * d * 0.8; }
      fields.push({ kind: 'flask', owner: pl, ghost, m, col, vis, x0: pl.x, y0: pl.y - G.LIFT * 0.5, tx, ty, x: pl.x, y: pl.y,
                    t: -i * 0.06, fall, dmg, pad: 80 });
    }
  }

  /** El frasco cae: deja el charco (como mucho 12 por movimiento y dueño). */
  function puddleAt(f) {
    const m = f.m, r = m.radius || 36;
    fields.push({ kind: 'puddle', owner: f.owner, ghost: f.ghost, m, col: f.col, vis: f.vis, x: f.tx, y: f.ty, r, r0: r,
                  t: 0, life: m.dur || 3, tick: 0, follow: !!m.follow, dmg: f.dmg, pad: r * 1.5 });
    trimOld('puddle', f.owner, m.id, 12);
    if (G.Camera.sees(f.tx, f.ty, 40)) {
      G.Audio.sfx('thud');
      G.FX.burst(f.tx, f.ty - 4, f.col, 8, 110);
    }
  }

  // ---- Lluvia (dusting): Celestial Dusting ----
  // Caja de la lluvia alrededor del dueño (también fija).
  const RAIN_W = 300, RAIN_H = 260;

  /** Una lluvia de `count` caídas repartidas en 0,8 s (las suelta el campo «shower»). */
  function shower(pl, m) {
    const n = Math.max(1, m.count | 0);
    fields.push({ kind: 'shower', owner: pl, ghost, m, col: G.U.TYPE_COLOR[m.type], vis: G.VFX.forMove(m),
                  x: pl.x, y: pl.y, t: 0, left: n, k: 0, every: 0.8 / n, next: 0, dmg: m.dmg * pl.atkFor(m), pad: 300 });
    if (m.id === 'make-it-rain' && G.Camera.sees(pl.x, pl.y, 100)) G.Audio.sfx('coin');
  }

  /** Un enemigo al azar de la caja de la lluvia (sin crear listas), o null. */
  function rainTarget(pl) {
    let pick = null, n = 0;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || Math.abs(e.x - pl.x) > RAIN_W || Math.abs(e.y - pl.y) > RAIN_H) continue;
      if (Math.random() * ++n < 1) pick = e;
    }
    return pick;
  }

  /** Cada fotograma de los campos nuevos (los llama updateFields). → true si hay que quitarlo. */
  function tickNewField(f, dt) {
    const pl = f.owner, m = f.m;
    // Ataques únicos: sus campos propios (kind 'uq', con su upd) y lo que añaden a los de su familia (UQ[id].field).
    // (Mientras, «ghost» es el del campo: el de un compañero no daña aquí.)
    const X = m && UQ[m.id];
    if (f.kind === 'uq' || (X && X.field)) {
      const g = ghost;
      ghost = !!f.ghost;
      try { if (f.kind === 'uq') return f.upd(f, dt); X.field(f, dt); } finally { ghost = g; }
    }
    if (f.kind === 'charge') {
      f.x = pl.x; f.y = pl.y;
      // La energía se junta en ti mientras carga.
      if (Math.random() < dt * 30 && G.Camera.sees(f.x, f.y, 40)) {
        const a = Math.random() * 6.2832, r = G.U.rand(30, 60);
        G.FX.sp(f.vis.proj, f.vis.pal, f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.8 - G.LIFT,
                { vx: -Math.cos(a) * r * 3, vy: -Math.sin(a) * r * 2.4, life: 0.3 });
      }
      if (f.t < f.at) return false;
      if (pl.dead) return true;
      const g = ghost; ghost = f.ghost;
      try { beam(pl, m); } finally { ghost = g; }
      if (!f.ghost) G.Camera.kick(0.25);
      return true;
    }
    if (f.kind === 'spin') {
      f.next -= dt;
      if (f.next > 0) return false;
      f.next = 0.13;
      G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, f.a, m.radius, 3.6, f.col, f.vis);
      f.a += 2.2;
      if (!f.ghost && !pl.dead) {
        const d = m.dmg * pl.atkFor(m);
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) hit(pl, e, d, f.col, e.x - pl.x, e.y - pl.y, 40, m);
        for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, d, f.col);
      }
      return --f.n <= 0;
    }
    if (f.kind === 'quake') {
      f.next -= dt;
      while (f.next <= 0 && f.i < f.n) {
        f.next += 0.07 / pkOf(m).pspd; f.i++;             // Propulsión: ondas más seguidas
        const x = f.x + f.ca * f.i * QSTEP, y = f.y + f.sa * f.i * QSTEP, r = m.radius;
        if (G.World.isWall(x, y)) { f.i = f.n; break; }
        if (G.Camera.sees(x, y, 40)) {
          G.FX.ring(x, y, 4, r, f.col, 0.3, 3);
          G.FX.burst(x, y - 4, f.col, 6, 120);
          for (let k = 0; k < 2; k++) G.FX.sp(f.vis.proj, f.vis.pal, x + G.U.rand(-r, r) * 0.5, y - 4, { vy: -G.U.rand(50, 90), vx: G.U.rand(-30, 30), life: 0.35 });
        }
        blast({ ghost: f.ghost, owner: pl, m, col: f.col, dmg: f.dmg, x, y }, r);
      }
      return f.i >= f.n;
    }
    if (f.kind === 'vortex') {
      // Atrae quien tiene los enemigos de verdad: el anfitrión, también con el
      // remolino (fantasma) de un invitado. En el invitado son copias y no se tocan.
      // Antes el fantasma no atraía y en grupo el remolino de un invitado no hacía nada.
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r * 1.4)) {
        if (e.dead || e.remote) continue;
        const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy);
        if (d < 4) continue;
        const k = Math.min(d, f.pull * dt * (e.boss || e.judge ? 0.25 : 1));
        e.x += dx / d * k; e.y += dy / d * k;
      }
      f.tick -= dt;
      if (f.tick <= 0) { f.tick = 0.4; blast(f, f.r); }
      if (Math.random() < dt * 16 && G.Camera.sees(f.x, f.y, 40)) {
        const a = Math.random() * 6.2832, rr = f.r * G.U.rand(0.5, 1);
        G.FX.sp(f.vis.proj, f.vis.pal, f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.6 - 4,
                { vx: -Math.sin(a) * 110 - Math.cos(a) * 60, vy: Math.cos(a) * 66 - Math.sin(a) * 36, life: 0.45,
                  spin: G.VFX.spins(f.vis.proj) ? 8 : 0 });
      }
      return false;
    }
    if (f.kind === 'stunzone') {
      if (f.t < f.delay) return false;
      G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4);
      G.FX.burst(f.x, f.y - 6, f.col, 12, 160);
      if (G.Camera.sees(f.x, f.y, 40)) G.Audio.sfx('break');
      if (!f.ghost) {
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
          hit(pl, e, f.dmg, f.col, e.x - f.x, e.y - f.y, 0, m);
          if (!e.dead) e.applyStun((m.stun || 1) * (e.boss || e.judge ? 0.35 : 1));
        }
        for (const p of G.World.propsInCircle(f.x, f.y, f.r)) G.World.damageProp(p, f.dmg, f.col);
      }
      return true;
    }
    // ---- familias del 22-10-2026 ----
    if (f.kind === 'burst') {
      // Ráfaga: suelta los disparos uno a uno desde donde esté su dueño, a los lados alternando.
      if (pl.dead) return true;
      f.x = pl.x; f.y = pl.y;
      f.next -= dt;
      const ca = Math.cos(f.a), sa = Math.sin(f.a), sp = m.spread || 0;
      while (f.next <= 0 && f.i < f.n) {
        f.next += f.every;
        const side = (f.i % 2 ? 4 : -4), a = f.a + G.U.rand(-sp, sp);
        G.Projectiles.spawn(Object.assign({
          x: pl.x + ca * 4 - sa * side, y: pl.y + sa * 4 + ca * side,
          vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
          dmg: f.dmg, r: m.size, life: m.life, pierce: m.pierce | 0, color: f.col,
          hits: new Set(), vis: f.vis, ghost: f.ghost, owner: pl
        }, payload(m)));
        if (!f.i && G.Camera.sees(pl.x, pl.y, 20)) G.FX.spark(pl.x + ca * pl.r, pl.y - G.LIFT + sa * pl.r, f.col, ca, sa, 3);
        f.i++;
      }
      return f.i >= f.n;
    }
    if (f.kind === 'column') {
      if (pl.dead) return true;
      if (f.self) { f.x = pl.x; f.y = pl.y; }
      // Un golpe en t = 0; 0,25; 0,5... mientras dure (hl).
      while (f.k * 0.25 < f.hl && f.t >= f.k * 0.25) { f.k++; columnStrike(f); }
      return false;
    }
    if (f.kind === 'sweep') {
      if (pl.dead) return true;
      f.x = pl.x; f.y = pl.y;
      const prev = f.a, L = m.radius, hw = m.width / 2;
      f.a += (m.turn || 4) * dt;
      if (f.on3) f.on3(f, prev);                     // (Cañón Floral: va plantando flores)
      // Lo que va soltando la punta de cada rayo.
      if ((f.fx -= dt) <= 0 && G.Camera.sees(f.x, f.y, f.pad)) {
        f.fx = 0.07;
        for (let i = 0; i < f.n; i++) {
          const a = f.a + i * 6.2832 / f.n;
          G.FX.sp(f.vis.proj, f.vis.pal, f.x + Math.cos(a) * L, f.y + Math.sin(a) * L - G.LIFT,
                  { vx: -Math.sin(a) * 50, vy: Math.cos(a) * 50, life: 0.25, angle: a + Math.PI / 2,
                    spin: G.VFX.spins(f.vis.proj) ? 8 : 0 });
        }
      }
      if (f.ghost) return false;
      // Enemigos por los que ha pasado algún rayo en este fotograma (aunque vaya muy
      // rápido): como mucho un golpe cada 0,45 s por rayo, y el aturdir no se encadena.
      const now = f.t, stun = m.stun || 0, gt = G.Game.st.time;
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, L)) {
        const ray = swept(f, prev, f.a - prev, Math.atan2(e.y - f.y, e.x - f.x), Math.hypot(e.x - f.x, e.y - f.y), hw + e.r);
        if (!ray) continue;
        const log = f.logs[ray - 1], last = log.get(e.id);
        if (last !== undefined && now - last < 0.45) continue;
        log.set(e.id, now);
        hit(pl, e, f.dmg, f.col, e.x - f.x, e.y - f.y, m.knock || 0, m);
        if (stun > 0 && !e.dead && !(f.stuns.get(e.id) > gt)) {
          // Sin congelar para siempre: la aguja no le vuelve a aturdir hasta 1,2 s después de que despierte.
          const s = stun * (e.boss || e.judge ? 0.35 : 1);
          e.applyStun(s);
          f.stuns.set(e.id, gt + s + 1.2);
        }
      }
      // Objetos del escenario: cada 0,1 s, con todo lo barrido desde la última vez.
      if ((f.pt -= dt) <= 0) {
        f.pt = 0.1;
        const from = f.ppa, span = f.a - f.ppa;
        f.ppa = f.a;
        for (const p of G.World.propsInCircle(f.x, f.y, L)) {
          if (swept(f, from, span, Math.atan2(p.y - f.y, p.x - f.x), Math.hypot(p.x - f.x, p.y - f.y), hw + p.r)) G.World.damageProp(p, f.dmg, f.col);
        }
      }
      return false;
    }
    if (f.kind === 'wipe') {
      f.x = pl.x; f.y = pl.y;
      if (f.t < f.delay) {
        if (pl.dead) return true;                       // caído antes de acabar el aviso: no pasa nada
        // Aviso: un anillo desde ti cada segundo (y sombras que se juntan en la Brecha Negra).
        if ((f.ring -= dt) <= 0 && G.Camera.sees(f.x, f.y, 200)) {
          f.ring = f.exec ? 1 : 0.4;
          G.FX.ring(f.x, f.y, pl.r, f.exec ? WIPE_W * 0.6 : pl.r * 6, f.col, 0.6, 3);
        }
        if (!f.exec && Math.random() < dt * 14 && G.Camera.sees(f.x, f.y, 200)) {
          const a = Math.random() * 6.2832, r = G.U.rand(80, 240);
          G.FX.sp('shadow', 'dark', f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.7 - 6,
                  { vx: -Math.cos(a) * r * 0.9, vy: -Math.sin(a) * r * 0.6, life: 0.6 });
        }
        return false;
      }
      if (!f.hit) wipeStrike(f);
      return false;
    }
    if (f.kind === 'ally') {
      if (pl.dead) return true;                         // se van si su dueño se debilita
      const sp = m.speed || 150, dxo = pl.x - f.x, dyo = pl.y - f.y, d2o = dxo * dxo + dyo * dyo;
      let tx, ty, s = sp;
      // Atascado muy lejos (detrás de una pared): vuelve a tu lado.
      if (d2o > 420 * 420) { f.x = pl.x + G.U.rand(-16, 16); f.y = pl.y + G.U.rand(-12, 12); f.tgt = null; }
      if (d2o > 260 * 260) { tx = pl.x; ty = pl.y; s = sp * 1.4; f.tgt = null; }
      else {
        if ((f.look -= dt) <= 0) { f.look = 0.15; f.tgt = allyTarget(f, pl); }
        const e = f.tgt;
        if (e && !e.dead) { tx = e.x + (f.ox || 0); ty = e.y + (f.oy || 0); }        // (ox/oy: en formación, Al Ataque)
        else {
          // Sin nadie cerca: vuela alrededor de ti.
          f.tgt = null; f.wa += dt * 1.2;
          tx = pl.x + Math.cos(f.wa) * 60; ty = pl.y + Math.sin(f.wa) * 42; s = sp * 0.7;
        }
      }
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 24);
      f.vx = G.U.damp(f.vx, dx / d * s * k, 8, dt);
      f.vy = G.U.damp(f.vy, dy / d * s * k, 8, dt);
      if (m.phase) { f.x += f.vx * dt; f.y += f.vy * dt; }       // Homenaje Póstumo: atraviesa paredes
      else {
        const nx = f.x + f.vx * dt, ny = f.y + f.vy * dt;
        if (G.World.isFree(nx, f.y, 4, true)) f.x = nx; else f.vx *= -0.3;
        if (G.World.isFree(f.x, ny, 4, true)) f.y = ny; else f.vy *= -0.3;
      }
      if (f.anim) {
        const moving = f.vx * f.vx + f.vy * f.vy > 400;
        if (moving) f.anim.dir = G.Sprites.dirFromAngle(Math.atan2(f.vy, f.vx));
        f.anim.loop(moving ? 'Walk' : 'Idle', moving ? 1.4 : 1);
        f.anim.update(dt);
      }
      if (f.ghost) return false;
      // Golpe al tocar: a cada enemigo, como mucho uno cada 0,45 s.
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
        const last = f.hitLog.get(e.id);
        if (last !== undefined && f.t - last < 0.45) continue;
        f.hitLog.set(e.id, f.t);
        hit(pl, e, f.dmg, f.col, f.vx, f.vy, m.knock || 0, m);
      }
      return false;
    }
    if (f.kind === 'wings') {
      if (pl.dead) return true;
      f.x = pl.x; f.y = pl.y;
      const ring = m.ring || 150, sp = m.speed || 1.6, rate = m.rate || 0.6, sees = G.Camera.sees(f.x, f.y, f.pad);
      for (const b of f.birds) {
        b.a += sp * b.dir * dt;
        const bx = pl.x + Math.cos(b.a) * ring, by = pl.y + Math.sin(b.a) * ring * 0.7;
        if (f.vis.trail && sees && Math.random() < dt * 20) G.FX.trail(f.vis.trail, f.vis.pal, bx, by - BIRD_H, -Math.sin(b.a) * b.dir, Math.cos(b.a) * b.dir);
        if ((b.next -= dt) > 0) continue;
        b.next += rate;
        // Al enemigo más cercano al suelo bajo el ave (o justo debajo).
        const e = G.Projectiles.nearest(G.EnemyMgr.all(), bx, by, 70);
        f.bombs.push({ x0: bx, y0: by, x: e ? e.x : bx, y: e ? e.y : by, t: 0 });
      }
      for (let i = f.bombs.length - 1; i >= 0; i--) {
        const b = f.bombs[i];
        if ((b.t += dt) < 0.25) continue;
        f.bombs.splice(i, 1);
        if (G.Camera.sees(b.x, b.y, 40)) {
          G.FX.ring(b.x, b.y, 4, m.radius, f.col, 0.3, 3);
          G.FX.burst(b.x, b.y - 6, f.col, 8, 140);
          G.Audio.sfx('thud');
        }
        f.bo.x = b.x; f.bo.y = b.y;
        blast(f.bo, m.radius);
      }
      return false;
    }
    if (f.kind === 'flask') {
      if (f.t < 0) return false;
      const k = Math.min(1, f.t / f.fall);
      f.x = f.x0 + (f.tx - f.x0) * k; f.y = f.y0 + (f.ty - f.y0) * k;
      if (k < 1) return false;
      puddleAt(f);
      return true;
    }
    if (f.kind === 'puddle') {
      if (f.follow && !pl.dead) {
        // Evolucionado: va hacia ti despacio y crece.
        const dx = pl.x - f.x, dy = pl.y - f.y, d = Math.hypot(dx, dy);
        if (d > 6) { f.x += dx / d * 45 * dt; f.y += dy / d * 45 * dt; }
        f.r = f.r0 * (1 + 0.3 * Math.min(1, f.t / f.life));
      }
      if ((f.tick -= dt) <= 0) { f.tick += 0.33; blast(f, f.r); }
      if (f.vis.aura && Math.random() < dt * 5 && G.Camera.sees(f.x, f.y, 20)) {
        const a = Math.random() * 6.2832, r = f.r * G.U.rand(0.1, 0.8);
        G.FX.sp(f.vis.aura, f.vis.pal, f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.6 - 4,
                { vy: -40, life: 0.45, angle: G.VFX.isDir(f.vis.aura) ? -Math.PI / 2 : 0, spin: G.VFX.spins(f.vis.aura) ? 4 : 0 });
      }
      return false;
    }
    if (f.kind === 'shower') {
      if (pl.dead) return true;
      f.x = pl.x; f.y = pl.y;
      f.next -= dt;
      while (f.next <= 0 && f.left > 0) {
        f.next += f.every; f.left--;
        // La mitad, sobre un enemigo al azar de la caja; la otra mitad, donde caiga.
        const e = ++f.k % 2 ? null : rainTarget(pl);
        const x = e ? e.x + G.U.rand(-6, 6) : pl.x + G.U.rand(-RAIN_W + 40, RAIN_W - 40), sp = m.speed || 220;
        G.Projectiles.spawn(Object.assign({
          x, y: pl.y - 250, vx: 0, vy: sp, sway: Math.random() * 6.2832, air: true, noShadow: true, alpha: 0.9,
          dmg: f.dmg, r: m.size, life: 500 / sp, pierce: Infinity, color: f.col, homing: m.homing || 0,
          hits: new Set(), vis: f.vis, ghost: f.ghost, owner: pl
        }, payload(m)));
      }
      return f.left <= 0;
    }
    return false;
  }

  const BIRD_H = 34;            // altura a la que vuelan las aves

  /** Daño de un campo (mina, meteoro, charco) a todo lo que hay en su círculo. */
  function blast(f, r, k = 1) {
    if (f.ghost) return;
    const pl = f.owner, m = f.m;
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, r)) hit(pl, e, f.dmg * k, f.col, e.x - f.x, e.y - f.y, m.knock || 0, m);
    for (const p of G.World.propsInCircle(f.x, f.y, r)) G.World.damageProp(p, f.dmg * k, f.col);
  }

  const NEW_FIELDS = new Set(['charge', 'spin', 'quake', 'vortex', 'stunzone', 'burst', 'column', 'sweep',
                              'wipe', 'ally', 'wings', 'flask', 'puddle', 'shower', 'uq']);
  function updateFields(dt) {
    frame3(dt);                                      // (ataques únicos: estados de los enemigos)
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      f.t += dt;
      if (f.gone || !f.owner || (f.life && f.t >= f.life && f.kind !== 'mine')) { fields.splice(i, 1); continue; }
      if (f.k3) { if (tick3(f, dt)) fields.splice(i, 1); continue; }
      if (NEW_FIELDS.has(f.kind)) { if (tickNewField(f, dt)) fields.splice(i, 1); continue; }
      if (f.kind === 'mine') {
        const armed = f.t >= f.arm;
        const trig = armed && G.EnemyMgr.queryCircle(f.x, f.y, 14).length > 0;
        if (trig || f.t >= f.life) {
          G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.3, 4);
          G.FX.burst(f.x, f.y - 6, f.col, 10, 150);
          if (G.Camera.sees(f.x, f.y, 40)) G.Audio.sfx('break');
          blast(f, f.r, trig ? 1 : 0.5);
          fields.splice(i, 1);
        }
      } else if (f.kind === 'meteor') {
        if (f.t >= f.fall) {
          G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4);
          G.FX.burst(f.x, f.y - 6, f.col, 12, 170);
          if (G.Camera.sees(f.x, f.y, 40)) { G.Audio.sfx('break'); G.Camera.kick(0.12); }
          blast(f, f.r);
          fields.splice(i, 1);
        }
      } else if (f.kind === 'turret') {
        f.shotT -= dt;
        if (f.shotT <= 0) {
          const m = f.m;
          const tg = G.Projectiles.nearest(G.EnemyMgr.all(), f.x, f.y, m.range || 300);
          f.shotT = tg ? m.rate || 0.6 : 0.15;
          if (tg) {
            const a = Math.atan2(tg.y - f.y, tg.x - f.x);
            G.Projectiles.spawn(Object.assign({
              x: f.x, y: f.y, vx: Math.cos(a) * (m.speed || 300), vy: Math.sin(a) * (m.speed || 300),
              dmg: f.dmg, r: m.size || 6, life: 1.4, pierce: m.pierce | 0, color: f.col,
              hits: new Set(), vis: f.vis, ghost: f.ghost, owner: f.owner
            }, payload(m)));
            f.kick = 0.12;
          }
        }
        if (f.kick > 0) f.kick -= dt;
      } else if (f.kind === 'patch') {
        f.tick -= dt;
        if (f.tick <= 0) { f.tick = 0.5; blast(f, f.r); }
        if (f.vis.aura && Math.random() < dt * 3 && G.Camera.sees(f.x, f.y, 20)) {
          G.FX.sp(f.vis.aura, f.vis.pal, f.x + G.U.rand(-f.r, f.r) * 0.6, f.y - 4, { vy: -40, life: 0.4 });
        }
      }
    }
  }

  /** Lo de los campos que va en el suelo (debajo de los Pokémon). */
  function drawGroundFields(ctx) {
    const now = performance.now() / 1000;
    // Todos los campos son de los jugadores: «Transparencia de tus ataques».
    const own = G.FX.ownAlpha();
    for (const f of fields) {
      if (f.kind === 'burst' || f.kind === 'shower' || f.kind === 'wipe' || !G.Camera.sees(f.x, f.y, f.pad || 60)) continue;
      if (f.k3) { if (f.dg) { ctx.save(); ctx.globalAlpha = own; f.dg(ctx, f, own, now); ctx.restore(); } continue; }
      ctx.save();
      if (f.kind === 'puddle') {
        // Charco: elipse del color del tipo; el Campo Psíquico, con el borde en guiones que gira.
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 6);
        ctx.globalAlpha = 0.3 * a * own;
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.65 * a * own;
        ctx.strokeStyle = f.col; ctx.lineWidth = 1.5;
        if (f.m.type === 'psychic') { ctx.setLineDash(DASH); ctx.lineDashOffset = -now * 24; ctx.lineWidth = 2; }
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'ally' || (f.kind === 'flask' && f.t >= 0)) {
        // Sombra pequeña (el frasco, la de donde va a caer).
        ctx.globalAlpha = 0.25 * own;
        ctx.fillStyle = '#000';
        const r = f.kind === 'ally' ? f.r : 5;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, r * 0.9, r * 0.38, 0, 0, 6.2832); ctx.fill();
        // Paliza: un aro del color de su tipo bajo cada copia.
        if (f.aura3 || f.risen) { ctx.globalAlpha = 0.5 * own; ctx.strokeStyle = f.aura3 || '#9e8aea'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, r * 1.3, r * 0.55, 0, 0, 6.2832); ctx.stroke(); }
      } else if (f.kind === 'wings') {
        // Sombras de las aves y aviso de dónde caen las bombas.
        const ring = f.m.ring || 150;
        ctx.globalAlpha = 0.22 * own;
        ctx.fillStyle = '#000';
        for (const b of f.birds) {
          ctx.beginPath(); ctx.ellipse(f.x + Math.cos(b.a) * ring, f.y + Math.sin(b.a) * ring * 0.7, 7, 3, 0, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 0.55 * own;
        ctx.strokeStyle = f.col; ctx.lineWidth = 1.5;
        for (const b of f.bombs) {
          const k = Math.min(1, b.t / 0.25), r = f.m.radius * (0.4 + 0.6 * k);
          ctx.beginPath(); ctx.ellipse(b.x, b.y, r, r * 0.6, 0, 0, 6.2832); ctx.stroke();
        }
      } else if (f.kind === 'column') {
        // Columnas: rectángulo del color del tipo que aparece y se va en 0,08 s.
        const a = Math.min(1, (f.life - f.t) / 0.08, f.t / 0.08), hw = f.w / 2, hh = f.h / 2;
        ctx.fillStyle = f.col; ctx.strokeStyle = f.col; ctx.lineWidth = 2;
        for (let i = 0; i < f.n; i++) {
          const x = f.x + colOff(i, f.w) - hw, y = f.y - hh;
          ctx.globalAlpha = 0.25 * a * own;
          ctx.fillRect(x, y, f.w, f.h);
          ctx.globalAlpha = 0.7 * a * own;
          ctx.strokeRect(x, y, f.w, f.h);
        }
      } else if (f.kind === 'vortex') {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 6);
        ctx.globalAlpha = 0.22 * a * own;
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.6 * a * own;
        ctx.strokeStyle = f.col; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const rr = f.r * (0.35 + k * 0.28), a0 = now * (3 - k * 0.6) + k * 2;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.6, 0, a0, a0 + 3.4); ctx.stroke();
        }
      } else if (f.kind === 'stunzone') {
        const k = G.U.clamp(f.t / f.delay, 0, 1);
        ctx.globalAlpha = (0.15 + 0.25 * k) * own;
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * k, f.r * k * 0.6, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.8 * own;
        ctx.strokeStyle = f.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'patch') {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 6);
        ctx.globalAlpha = 0.32 * a * own;
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.5 * a * own;
        ctx.strokeStyle = f.col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.8, f.r * 0.5, 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'mine') {
        const armed = f.t >= f.arm, blink = armed && Math.sin(now * 8 + f.x) > 0.3;
        ctx.globalAlpha = 0.18 * own;
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.45, f.r * 0.28, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = own;
        G.VFX.draw(ctx, f.vis.proj, f.vis.pal, f.x, f.y - 4, { scale: 1, alpha: blink ? 1 : 0.75, frame: 0 });
      } else if (f.kind === 'meteor') {
        const k = G.U.clamp(f.t / f.fall, 0, 1);
        ctx.globalAlpha = (0.2 + k * 0.3) * own;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.3 + k * 0.7), f.r * 0.6 * (0.3 + k * 0.7), 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.6 * own;
        ctx.strokeStyle = f.col; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.stroke();
      } else if (f.kind === 'turret') {
        ctx.globalAlpha = 0.3 * own;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 11, 4.5, 0, 0, 6.2832); ctx.fill();
      } else if (f.kind === 'uq' && f.drawG) f.drawG(ctx, f, own, now);       // ataques únicos
      ctx.restore();
    }
    // Escudos de detrás (los de delante, en drawAirFields).
    ctx.globalAlpha = own;
    drawWards(ctx, false, now);
    ctx.globalAlpha = 1;
  }
  const DASH = [6, 5];

  /** Lo de los campos que va por encima (meteoros cayendo, torretas). */
  function drawAirFields(ctx) {
    const now = performance.now() / 1000;
    const own = G.FX.ownAlpha();
    ctx.globalAlpha = own;                     // VFX.draw multiplica sobre esto
    for (const f of fields) {
      if (!G.Camera.sees(f.x, f.y, Math.max(200, f.pad || 0))) continue;
      if (f.k3) { if (f.da) { f.da(ctx, f, own, now); ctx.globalAlpha = own; } continue; }
      if (f.kind === 'sweep') { drawSweep(ctx, f, own, now); ctx.globalAlpha = own; }
      else if (f.kind === 'meteor' && f.t > 0) {
        const k = G.U.clamp(f.t / f.fall, 0, 1);
        G.VFX.draw(ctx, f.vis.proj, f.vis.pal, f.x + (1 - k) * 40, f.y - (1 - k) * 170 - 6,
                   { scale: 1.5, angle: Math.atan2(170, -40), frame: Math.floor(now * 12) });
      } else if (f.kind === 'turret') {
        const fade = Math.min(1, (f.life - f.t) * 2, f.t * 5);
        const bob = Math.sin(now * 4 + f.x) * 2 - (f.kick > 0 ? 2 : 0);
        G.VFX.draw(ctx, f.vis.proj, f.vis.pal, f.x, f.y - 16 + bob, { scale: 1.5, alpha: fade, frame: Math.floor(now * 8) });
      } else if (f.kind === 'ally') drawAlly(ctx, f, now);
      else if (f.kind === 'wings') drawWings(ctx, f, now);
      else if (f.kind === 'uq' && f.drawA) { ctx.save(); f.drawA(ctx, f, own, now); ctx.restore(); ctx.globalAlpha = own; }   // ataques únicos
      else if (f.kind === 'flask' && f.t >= 0) {
        // Frasco en parábola (40 px de alto), girando.
        const k = Math.min(1, f.t / f.fall), h = 160 * k * (1 - k), v = f.vis;
        G.VFX.draw(ctx, v.proj, v.pal, f.x, f.y - h - 6, { angle: G.VFX.spins(v.proj) ? f.t * 12 : 0, frame: Math.floor(f.t * 12) });
      }
    }
    drawWards(ctx, true, now);
    // Barridos de pantalla, encima de todo lo demás (menos las partículas y los números).
    for (const f of fields) if (f.kind === 'wipe' && G.Camera.sees(f.x, f.y, 300)) drawWipe(ctx, f, own, now);
    ctx.globalAlpha = 1;
    drawTop3(ctx);                                   // (ataques únicos: iconos de estado y lo tuyo)
  }

  /** Aliado: abeja o espíritu que flota, o tu Pokémon en pequeño (Paliza). Mira hacia donde va. */
  function drawAlly(ctx, f, now) {
    const fade = Math.min(1, (f.life - f.t) * 3, f.t * 8), sc = f.r >= 8 ? 1.5 : 1;
    // (Marcha Espectral: los enemigos levantados, translúcidos y blanquecinos.)
    if (f.anim) { f.anim.draw(ctx, f.x, f.y, f.risen ? { alpha: fade * 0.6, flash: true, softFlash: true } : { alpha: fade }); return; }
    const v = f.vis, bob = Math.sin(now * 8 + f.ph) * 3;
    G.VFX.draw(ctx, v.proj, v.pal, f.x, f.y - 12 + bob, { scale: sc, alpha: fade * (v.proj === 'wisp' ? 0.8 : 1),
                                                         frame: Math.floor(now * 14 + f.ph), flip: f.vx < 0 });
  }

  /** Aves en su círculo (de lado hacia donde vuelan) y sus bombas cayendo. */
  function drawWings(ctx, f, now) {
    const m = f.m, ring = m.ring || 150, v = f.vis, sc = m.id === 'steel-wing' ? 1.5 : 1;
    const fade = Math.min(1, (f.life - f.t) * 3, f.t * 6);
    for (const b of f.birds) {
      const bx = f.x + Math.cos(b.a) * ring, by = f.y + Math.sin(b.a) * ring * 0.7;
      const vx = -Math.sin(b.a) * b.dir, vy = Math.cos(b.a) * 0.7 * b.dir;
      // De cara hacia donde va: volteada si va a la izquierda (no boca abajo).
      const flip = vx < 0, ang = flip ? Math.atan2(-vy, -vx) : Math.atan2(vy, vx);
      G.VFX.draw(ctx, v.proj, v.pal, bx, by - BIRD_H, { angle: ang, flip, scale: sc, alpha: fade, frame: Math.floor(now * 9 + b.dir) });
    }
    for (const b of f.bombs) {
      const k = Math.min(1, b.t / 0.25);
      G.VFX.draw(ctx, 'ball', v.pal, b.x0 + (b.x - b.x0) * k, b.y0 - BIRD_H + (b.y - b.y0 + BIRD_H) * k * k, { frame: 0 });
    }
  }

  const NUM_FONT = '700 9px Fredoka,"Segoe UI",system-ui,sans-serif';

  /**
   * Barrido de pantalla: Canto Mortal, velo morado y notas con la cuenta atrás
   * sobre los que ha apuntado; Brecha Negra, viñeta negra que se cierra y «Zz»
   * sobre los dormidos. La «pantalla» es la de la cámara (sólo se ve).
   */
  function drawWipe(ctx, f, own, now) {
    const cam = G.Camera, L = cam.left() - 30, T = cam.top() - 30, W = cam.w + 60, H = cam.h + 60;
    const k = G.U.clamp(f.t / f.delay, 0, 1), after = f.t >= f.delay;
    const out = after ? Math.max(0, 1 - (f.t - f.delay) / 0.5) : 1;
    ctx.save();
    if (f.exec) {
      ctx.globalAlpha = 0.1 * out * Math.min(1, f.t * 4);
      ctx.fillStyle = '#7a4ad0';
      ctx.fillRect(L, T, W, H);
    } else if (out > 0) {
      // Cuatro marcos de grosor creciente: más oscuro en los bordes, a bloques.
      ctx.fillStyle = '#05030a';
      ctx.globalAlpha = 0.14 * k * out;
      const S = Math.min(W, H) * 0.42 * k;
      for (let i = 1; i <= 4; i++) {
        const b = S * i / 4;
        ctx.fillRect(L, T, W, b); ctx.fillRect(L, T + H - b, W, b);
        ctx.fillRect(L, T + b, b, H - 2 * b); ctx.fillRect(L + W - b, T + b, b, H - 2 * b);
      }
    }
    ctx.globalAlpha = own;
    ctx.font = NUM_FONT; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(10,8,24,.85)';
    if (f.exec && !after) {
      // Notas y cuenta atrás (3, 2, 1) sobre los apuntados.
      const n = Math.ceil(f.delay - f.t);
      ctx.fillStyle = '#e8deff';
      for (const e of f.marked) {
        if (e.dead || !cam.sees(e.x, e.y, 20)) continue;
        const y = e.y - e.bodyH - 10 + Math.sin(now * 6 + e.id) * 1.5;
        G.VFX.draw(ctx, f.vis.proj, f.vis.pal, e.x - 5, y, { frame: 0 });
        ctx.strokeText(n, e.x + 6, y + 3); ctx.fillText(n, e.x + 6, y + 3);
      }
    } else if (!f.exec && after && f.hit) {
      // Dormidos: «Zz» que sube y baja (en las copias del invitado no se sabe cuánto: mientras dure).
      ctx.fillStyle = '#d4c4ff';
      ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 3);
      for (const e of f.hit) {
        if (e.dead || (!e.remote && !(e.stunT > 0)) || (e.s3 && e.s3.sleep > 0) || !cam.sees(e.x, e.y, 20)) continue;
        const y = e.y - e.bodyH - 8 - ((now * 10 + e.id) % 8);
        G.I18n.rawCanvas(ctx, 'strokeText', 'Zz', e.x + 6, y);
        G.I18n.rawCanvas(ctx, 'fillText', 'Zz', e.x + 6, y);
      }
    }
    ctx.restore();
  }

  /**
   * Aguja: cada rayo con tres copias que se quedan atrás y se apagan (la estela
   * del barrido). A bloques, como los rayos de fx.js.
   */
  function drawSweep(ctx, f, own, now) {
    const m = f.m, P = G.VFX.PAL[f.vis.pal] || G.VFX.PAL.normal, L = m.radius;
    const hw = Math.max(2, Math.round(m.width / 4) * 2), fade = Math.min(1, (f.life - f.t) * 5, f.t * 10);
    const step = 6.2832 / f.n, lag = (m.turn || 4) * 0.03, x = Math.round(f.x / 2) * 2, y = Math.round((f.y - G.LIFT) / 2) * 2;
    for (let i = 0; i < f.n; i++) {
      for (let k = 3; k >= 0; k--) {
        const a = f.a + i * step - k * lag;
        ctx.globalAlpha = own * fade * (k ? 0.45 - k * 0.12 : 1);
        // (Las copias de atrás, lisas; las del rayo eléctrico, también en zigzag.)
        const shape = k && f.vis.beam !== 'lightning' ? null : f.vis.beam;
        sweepRay(ctx, x, y, a, L, k ? Math.max(2, hw - 2) : hw, P, shape, f.vis.pal, now);
      }
    }
  }

  /** Un rayo de la aguja desde (x, y) con ángulo a. shape: 'lightning' (zigzag) o forma que viaja por él. */
  function sweepRay(ctx, x, y, a, len, hw, P, shape, pal, now) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.round(a / (Math.PI / 32)) * (Math.PI / 32));
    if (shape === 'lightning') {
      let py = 0;
      for (let d = 0; d < len; d += 4) {
        const ny = d + 4 >= len ? 0 : Math.round((G.U.hash(d | 0, (now * 30) | 0, 7) - 0.5) * hw) * 2;
        const lo = Math.min(py, ny), hi = Math.max(py, ny);
        ctx.fillStyle = P[3]; ctx.fillRect(d - 2, lo - 4, 8, hi - lo + 8);
        ctx.fillStyle = P[4]; ctx.fillRect(d, lo - 2, 4, hi - lo + 4);
        py = ny;
      }
    } else {
      ctx.fillStyle = P[1]; ctx.fillRect(0, -hw - 2, len, hw * 2 + 4);
      ctx.fillStyle = P[2]; ctx.fillRect(0, -hw, len, hw * 2);
      const core = Math.max(1, Math.round(hw * 0.55));
      ctx.fillStyle = P[3]; ctx.fillRect(0, -core, len, core * 2);
      ctx.fillStyle = P[4]; ctx.fillRect(0, -1, len, 2);
      // Cristales, estrellas... que viajan hacia fuera por el rayo.
      if (shape) {
        const gap = 26, off = (now * 300) % gap;
        for (let d = off + 8; d < len - 6; d += gap) G.VFX.draw(ctx, shape, pal, d, 0, { angle: 0.0001, frame: (d / gap + now * 12) | 0 });
      }
    }
    ctx.restore();
  }

  function clearFields(owner) {
    fields = owner ? fields.filter(f => f.owner !== owner) : [];
    if (owner) ghostWards.delete(owner); else ghostWards.clear();
    if (!owner) { for (const e of aff3) endS3(e); aff3.clear(); walls3 = []; tw3 = []; }   // (ataques únicos)
  }

  function orbit(pl, m, dt, now, isGhost = false) {
    const col = G.U.TYPE_COLOR[m.type];
    const want = Math.max(1, m.count | 0);
    // Cada movimiento de órbita tiene sus orbes (puede haber dos en un vínculo).
    const mine = p => p.orb && p.owner === pl && p.mid === m.id;
    const orbs = G.Projectiles.all().filter(mine);
    // Si cambia el número de orbes (al mejorar el movimiento), se reparten
    // todos por igual a partir de donde va el primero, sin saltos.
    const relayout = orbs.length !== want;
    const base = orbs.length ? orbs[0].oa : now * m.speed;
    if (orbs.length > want) for (const p of orbs.slice(want)) G.Projectiles.remove(p);

    for (let i = orbs.length; i < want; i++) {
      G.Projectiles.spawnOrb({
        owner: pl, ghost: isGhost, mid: m.id,
        x: pl.x, y: pl.y, r: m.size, color: col, vis: G.VFX.forMove(m),
        dmg: m.dmg * pl.atkFor(m),
        oa: (i / want) * 6.2832, orad: m.radius, ospeed: m.speed,
        rehit: Math.max(0.12, m.cd),
        // Cada orbe recuerda a quién ha golpeado aunque se vuelva a crear al cambiar
        // de hueco: si no, cambiando y volviendo enseguida golpeaban a cada momento.
        hitLog: (m.orbLogs || (m.orbLogs = []))[i] || (m.orbLogs[i] = new Map()),
        knock: m.knock || 0, burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, mtype: m.type, mcat: m.cat, src: m
      });
    }
    const live = G.Projectiles.all().filter(mine);
    live.forEach((p, i) => {
      p.dmg = m.dmg * pl.atkFor(m);
      p.orad = m.radius;
      p.ospeed = m.speed;
      p.r = m.size;
      if (relayout) p.oa = base + (i / live.length) * 6.2832;
    });
    if (MECH3[m.id] && MECH3[m.id].orb) MECH3[m.id].orb(pl, m, dt, live, isGhost);   // (Poder Pasado: salen disparadas)

    // Animación de concentración de vez en cuando, para que se note vivo.
    pl.orbCastT = (pl.orbCastT || 0) - dt;
    if (pl.orbCastT <= 0) { pl.orbCastT = 1.6; pl.cast({ kind: 'orbit', cd: 1.6 }); }
  }

  /**
   * Pasivos que llegan por la red ([área·100, duración·100, cantidad, propulsión·100]):
   * sólo si están dentro de lo que dan las cartas; si no, ninguno. La cantidad, con
   * su tope (G.Moves.EXTRA_MAX: hasta 3 cartas de Réplica desde el 23-10-2026; las
   * versiones de antes mandan como mucho 2): una mayor se queda en el tope.
   * Topes (26-10-2026): lo que dan las cartas (5 de Persistencia, +60 %; 5 de Propulsión,
   * +50 %) más lo que dan las mejoras permanentes de los ataques (G.Upgrades.PASS_MAX).
   * Una versión de antes, con los topes viejos, no se los cree y repite el ataque sin
   * pasivos: sólo cambia cómo lo ve (el fantasma no hace daño).
   */
  let passCap = null;
  function netPassCap() {
    if (passCap) return passCap;
    const M = G.Upgrades && G.Upgrades.PASS_MAX;
    const cap = { dur: 1.6 + ((M && M.dur) || 0) + 0.005, pspd: 1.5 + ((M && M.pspd) || 0) + 0.005 };
    if (M) passCap = cap;
    return cap;
  }
  function netPass(a) {
    if (!Array.isArray(a) || a.length < 4) return null;
    for (let i = 0; i < 4; i++) if (!Number.isFinite(a[i])) return null;
    const area = a[0] / 100, dur = a[1] / 100, pspd = a[3] / 100, cap = netPassCap();
    if (area < 1 || area > 1.5 || dur < 1 || dur > cap.dur || !Number.isInteger(a[2]) || a[2] < 0 || pspd < 1 || pspd > cap.pspd) return null;
    return { area, dur, amt: Math.min(G.Moves.EXTRA_MAX, a[2]), pspd };
  }

  /**
   * Repite el ataque de un compañero sólo para verlo (sin daño), con sus pasivos
   * (pas, ver netPass). variant: 1 = un escudo que para un golpe (familia ward).
   */
  function ghostCast(pl, id, lvl, aim, evolved, pas, variant) {
    // Viene de la red: no se cree a ciegas (un id o un nivel raros colgaban a los demás).
    // (También los movimientos Z: G.Moves.get.)
    const def = G.Moves.get(id);
    if (!def || def.kind === 'orbit') return;
    const m = G.Moves.instance(id, lvl);
    if (evolved) G.Moves.evolve(m);
    G.Moves.applyPassives(m, netPass(pas));
    if (typeof aim === 'number' && Number.isFinite(aim)) pl.aim = aim;
    // Escudo que para un golpe: sólo el estallido (y un escudo menos a la vista).
    if (variant === 1) {
      if (m.kind !== 'ward') return;
      const w = pl.wardN;
      if (w && w[id] > 0) w[id]--;
      wardBurst(pl, m);
      if (MECH3[id] && MECH3[id].block) MECH3[id].block(pl, m, true);
      return;
    }
    ghost = true;
    try {
      pl.cast(m);
      run(pl, m);
    } finally { ghost = false; }
  }

  /** Orbes de un compañero que tiene activo un movimiento de órbita (sólo visual). */
  function ghostOrbit(pl, dt, now) {
    const m = pl.activeMove();
    if (m && m.kind === 'orbit' && !pl.dead) orbit(pl, m, dt, now, true);
    else if (G.Projectiles.all().some(p => p.orb && p.owner === pl)) G.Projectiles.clearOrbs(pl);
  }

  // Golpe crítico (Mejoras → Golpe Crítico): x1,5 de daño, número naranja y grande.
  const CRIT_MUL = 1.5;
  // (+2 % por cada moneda de Fiebre Dorada que lleves: pl.u3.crit, ataques únicos al final.)
  const isCrit = pl => { const c = pl.critChance + (pl.u3 ? pl.u3.crit.length * 0.02 : 0); return !ghost && c > 0 && Math.random() < c; };

  // Habilidad de quien pega (data/ability-fx.js): × al daño, crítico, estados y
  // lo que hace al golpear. (Los compañeros no la llevan aquí: pegan en su ordenador.)
  const abilOut = (pl, m, e) => (pl.abil && pl.abil.out && m ? pl.abil.out(pl, m, e) : 1);
  // (+ lo que suman las cartas de Puntería, pl.critDmg: +0,1 cada una.)
  const critMul = pl => ((pl.abil && pl.abil.critMul) || CRIT_MUL) + (pl.critDmg || 0);
  /** × a quemaduras, venenos, frenazos y empujones: Potencia Bruta los quita, Dicha los dobla. */
  const statusK = pl => (!pl.abil ? 1 : pl.abil.sheer ? 0 : pl.abil.serene ? 2 : 1);
  function afterHit(pl, e, m) {
    const a = pl.abil;
    if (!a || e.dead) return;
    if (a.hit) a.hit(pl, e, m);
    if (a.touchPoison && m && (m.kind === 'melee' || m.kind === 'dash')) e.applyPoison(1);
  }

  function hit(pl, e, dmg, col, dx, dy, knock, m) {
    // Ataques únicos (al final): su × al daño (UQ[id].k; MECH3: k3, con los estados de e.s3) y
    // críticos de más (uqCrit: crit2, Marca X...; MECH3[id].crit y crit3f: el crítico seguro).
    const X = UQ[m.id], x3 = MECH3[m.id];
    const k = typeK(m.type, e) * G.Stats.taken(e.mon, m.cat) * abilOut(pl, m, e) * (X && X.k ? X.k(pl, e, m) : 1);
    if (x3 || e.s3) dmg *= k3(pl, e, m, dmg, null);
    const crit = isCrit(pl) || uqCrit(pl, e, m) || (!ghost && (crit3f || !!(x3 && x3.crit && x3.crit(pl, e, m, null)))), sk = statusK(pl);
    dmg *= k * (crit ? critMul(pl) : 1);
    e.hurt(dmg, col, dx, dy, sk ? knock : 0, crit ? 'crit' : G.Types.label(G.Types.mult(m.type, e.types)));
    if (X && X.hit) X.hit(pl, e, m, dmg, crit);
    uqLast(pl, e);
    if (!ghost) pl.onDealt(dmg);
    pl.dmgDealt += dmg;
    m.dealt = (m.dealt || 0) + dmg;               // por ataque, para el resumen de la pausa
    if (m.burn && sk) e.applyBurn(m.burn * sk);
    if (m.poison && sk) e.applyPoison(m.poison * sk);
    if (m.slow && sk) e.applySlow(Math.min(0.8, m.slow * sk));
    afterHit(pl, e, m);
    if (x3 && x3.after && !ghost) x3.after(pl, e, m, dmg);
  }

  // ---------------- colisiones ----------------

  /** Distancia² del punto (cx, cy) al segmento (ax, ay)-(bx, by). */
  function segDist2(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - cx, qy = ay + dy * t - cy;
    return qx * qx + qy * qy;
  }

  function resolve(dt, pl, now) {
    const projectiles = G.Projectiles.all();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];

      // --- disparos enemigos: paredes y objetos sólidos dan cobertura ---
      if (!p.friendly) {
        if (G.World.projectileBlock(p.x, p.y, p.r)) {
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 70);
          projectiles.splice(i, 1);
          continue;
        }
        // (Ataques únicos: piedras, tumbas y portales los paran; la niebla de Campo de Niebla los suaviza.)
        if (walls3.length && foe3(p)) { projectiles.splice(i, 1); continue; }
        if (G.U.dist2(p.x, p.y, pl.x, pl.y) < (p.r + pl.r) * (p.r + pl.r)) {
          incoming3 = p.dmg;
          pl.hurt(p.dmg * (pl.u3 ? mistK3(pl, p.x, p.y, p.mtype === 'dragon') : 1), p.mtype, false, p.cat);
          incoming3 = 0;
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 7, 110);
          projectiles.splice(i, 1);
        }
        continue;
      }

      // --- disparos de jugadores ---
      // Orbes de un compañero: sólo se ven.
      if (p.orb && p.ghost) continue;
      if (p.regrow3 > 0) continue;                    // (Poder Pasado: la roca que vuelve a crecer)
      // Carambola que acaba de rebotar (projectile.js).
      if (p.bounced) { p.bounced = false; caromBounce(p); }
      // Lo que va por el aire (parábola) no lo paran las paredes; la carambola rebota en ellas.
      if (!p.orb && !p.air && !p.ricochet) {
        const block = G.World.projectileBlock(p.x, p.y, p.r);
        if (block === 'wall' || (block && !block.destructible)) {
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
          projectiles.splice(i, 1);
          continue;
        }
      }

      // Objetos del escenario (rocas, cofres, hierba).
      let consumed = false;
      for (const prop of G.World.propsInCircle(p.x, p.y, p.r)) {
        if (p.orb) {
          const k = 'p' + prop.id, last = p.hitLog.get(k) || -99;
          if (now - last < p.rehit) continue;
          p.hitLog.set(k, now);
          G.World.damageProp(prop, p.dmg, p.color);
          continue;
        }
        if (p.phits.has(prop.id)) continue;
        p.phits.add(prop.id);
        if (!p.ghost) G.World.damageProp(prop, p.dmg, p.color);
        // La hierba no frena; lo sólido sí gasta perforación (salvo a lo que va por el aire).
        if (prop.solid && !p.air) {
          if (p.pierce > 0) p.pierce--;
          else { consumed = true; break; }
        }
      }
      if (consumed) {
        G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
        projectiles.splice(i, 1);
        continue;
      }

      // Enemigos. Colisión BARRIDA: se comprueba todo el tramo recorrido en este
      // fotograma, no sólo el punto final. Un Impactrueno avanza 8 unidades por
      // fotograma: sin esto atravesaba a los enemigos pegados al jugador, que
      // eran inmunes a todos los movimientos de proyectil.
      const sx = p.orb || p.px == null ? p.x : p.px, sy = p.orb || p.py == null ? p.y : p.py;
      const half = Math.hypot(p.x - sx, p.y - sy) / 2;
      const x3 = p.src ? MECH3[p.src.id] : null;      // (ataques únicos, al final)
      for (const e of G.EnemyMgr.queryCircle((sx + p.x) / 2, (sy + p.y) / 2, half + p.r)) {
        if (p.only3 && e.id !== p.only3) continue;     // (los que van a por uno solo)
        if (segDist2(sx, sy, p.x, p.y, e.x, e.y) > (p.r + e.r) * (p.r + e.r)) continue;
        if (p.orb || p.ricochet) {
          // Órbitas y carambolas vuelven a golpear al mismo cada `rehit` s.
          const last = p.hitLog.get(e.id) || -99;
          if (now - last < p.rehit) continue;
          p.hitLog.set(e.id, now);
          // Las órbitas duran toda la partida: se olvidan los golpes viejos.
          if (p.hitLog.size > 300) for (const [k, t] of p.hitLog) if (now - t > p.rehit) p.hitLog.delete(k);
        } else {
          if (p.hits.has(e.id)) continue;
          p.hits.add(e.id);
        }

        // Disparo fantasma de un compañero: choca y se ve, pero no daña.
        // (Ataques únicos: lo que mueve o cambia a los enemigos lo hace aquí quien los tiene, p.onHit.)
        if (p.ghost) {
          if (p.onHit) p.onHit(p, e, 0, false);
          G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
          if (x3 && x3.ghostP) x3.ghostP(p, e);
          if (rebound(p, e)) break;
          if (p.pierce > 0) { p.pierce--; continue; }
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
          projectiles.splice(i, 1);
          break;
        }

        // (Ataques únicos: p.hitK y k3 —estados de e.s3 y MECH3[id].k—, su × al daño; críticos de más, uqCrit y MECH3[id].crit.)
        const kx3 = x3 || e.s3 ? k3(pl, e, p.src, p.dmg, p) : 1;
        const crit = isCrit(pl) || (!!p.src && uqCrit(pl, e, p.src, p)) || !!(x3 && x3.crit && x3.crit(pl, e, p.src, p)), sk = statusK(pl);
        const k = (p.mtype ? typeK(p.mtype, e) : 1) * G.Stats.taken(e.mon, p.mcat) * (crit ? critMul(pl) : 1) * abilOut(pl, p.src, e) *
                  (p.hitK ? p.hitK(p, e) : 1) * kx3;
        e.hurt(p.dmg * k, p.color, p.vx || (e.x - pl.x), p.vy || (e.y - pl.y), sk ? p.knock : 0,
               crit ? 'crit' : p.mtype ? G.Types.label(G.Types.mult(p.mtype, e.types)) : null);
        if (p.onHit) p.onHit(p, e, p.dmg * k, crit);
        uqLast(pl, e);
        if (Math.random() < 0.5) G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
        pl.dmgDealt += p.dmg * k;
        if (p.src) p.src.dealt = (p.src.dealt || 0) + p.dmg * k;
        pl.onDealt(p.dmg * k);
        if (p.burn && sk) e.applyBurn(p.burn * sk);
        if (p.poison && sk) e.applyPoison(p.poison * sk);
        if (p.slow && sk) e.applySlow(Math.min(0.8, p.slow * sk));
        if (p.drain) pl.heal(p.drain);                    // Beso Drenaje
        afterHit(pl, e, p.src);
        if (x3 && x3.afterP) x3.afterP(pl, e, p.src, p, p.dmg * k);

        if (!p.orb && rebound(p, e)) break;
        if (!p.orb) {
          if (p.pierce > 0) { p.pierce--; }
          else {
            G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
            projectiles.splice(i, 1);
            break;
          }
        }
      }
    }

    // --- contacto enemigo <-> jugador ---
    if (pl.dead) return;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, pl.r + 40)) {
      if (G.U.dist2(e.x, e.y, pl.x, pl.y) > (e.r + pl.r) * (e.r + pl.r)) continue;
      if (e.touchCd > 0 || e.behavior === 'thief' || e.stunT > 0 || (e.s3 && noTouch3(e))) continue;
      e.touchCd = 0.55;
      e.strike(pl);
      // (touchHit: las habilidades saben que este golpe es cuerpo a cuerpo, ver data/ability-fx.js.)
      pl.touchHit = true;
      incoming3 = e.dmg;
      try { pl.hurt(e.dmg * (pl.u3 ? mistK3(pl, e.x, e.y, e.types && e.types.includes('dragon')) : 1), e.atkType, false, e.cat); } finally { pl.touchHit = false; incoming3 = 0; }
      if (pl.u3 && pl.u3.anchor > 0) touch3(pl, e);                // (Cuerpo Pesado)
      if (pl.hasItem('rockyhelmet')) e.hurt(15 + pl.level * 4, '#9aa6b5', e.x - pl.x, e.y - pl.y, 80);
      if (pl.abil && pl.abil.contact && !pl.dead && !e.dead) pl.abil.contact(pl, e);     // Elec. Estática, Cuerpo Llama...
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.kx += nx * 150; e.ky += ny * 150;
    }
  }

  // ==================================================================================================
  // -- ataques únicos: Lucha, Veneno, Tierra, Volador, Psíquico, Bicho (26-10-2026) --
  // ==================================================================================================
  /*
   * Cada uno de estos 44 ataques tiene su mecánica propia (ver el diseño en docs y data/moves.js):
   * UQ[id] = { cast(pl, m) → true si lo ha lanzado él (si no, el de su familia), pp(m) → lo que
   * llevan sus proyectiles (upd: trayectoria, onHit, end, hitK...), k(pl, e, m) × al daño de hit(),
   * hit(pl, e, m, daño, crítico) tras cada golpe de hit(), field(f, dt) lo que añade a los campos de
   * su familia, orbit(...) su órbita, block(pl, m) al parar un golpe (escudos), ready(pl, m) si
   * puede lanzarse, allyTarget(f, pl) el blanco de sus aliados }. La evolución, con m.evolved.
   *
   * Campos propios: kind 'uq' con upd(f, dt) (true = se acaba), drawG (suelo) y drawA (aire).
   *
   * Cooperativo (lo de siempre): el daño lo hace quien lanza (también sobre las copias de un
   * invitado, por 'h'); lo que MUEVE o cambia la IA de los enemigos (confusión, levantar,
   * teletransportar, encerrar...) lo hace quien tiene los enemigos de verdad (el anfitrión, o
   * tú solo), también desde el fantasma de un invitado (como el remolino). En una copia sólo se
   * ve. Las tiradas (Puño Dinámico, Magnitud) salen del apuntado que llega por la red: todos
   * ven lo mismo. Nada nuevo en la red.
   */
  const UQ = Object.create(null);
  const TAU = 6.2832;
  /** Enemigo de verdad (el anfitrión o tú solo): a éste sí se le mueve y se le cambia la IA. */
  const real = e => !!e && !e.dead && !e.remote;
  const bigE = e => !!(e.boss || e.judge || e.legend);
  const colOf = m => G.U.TYPE_COLOR[m.type];
  const trT = (s, x) => (G.I18n && G.I18n.f ? G.I18n.f(s, x) : s.replace('{x}', x));
  /** Tirada que sale igual en todos los ordenadores (del apuntado que viaja en 'c'); solo, al azar. */
  const roll = (pl, m, salt) => (G.Coop && G.Coop.active ? G.U.hash(Math.round(pl.aim * 100), (m.lvl | 0) * 31 + salt, 913) : Math.random());
  /** run(): la mecánica propia del movimiento, si la tiene (UQ: estos seis tipos; MECH3: Roca, Fantasma... más abajo). */
  function uqRun(pl, m) {
    const X = UQ[m.id];
    if (X && X.cast && X.cast(pl, m) !== false) return true;
    const x3 = MECH3[m.id];
    if (x3 && x3.cast) { x3.cast(pl, m); return true; }
    return false;
  }
  function uqOrbit(pl, m, dt, now) { const X = UQ[m.id]; return !!(X && X.orbit && X.orbit(pl, m, dt, now)); }
  function uqLast(pl, e) { if (!ghost && pl) pl.uqLast = e; }

  /**
   * Críticos de más: la Marca X (Tijera X) de este jugador sobre el enemigo (se gasta), el cruce
   * de Veneno X (p.cx, p.cy) y el crítico propio del ataque (crit2) o del proyectil.
   */
  function uqCrit(pl, e, m, p) {
    if (ghost) return false;
    const s = e.x2;
    if (s && s.markX && s.markX.by === pl) {
      delete s.markX;
      G.FX.ring(e.x, e.y - e.bodyH * 0.5, 4, e.r * 2.4, '#b8ff5a', 0.25, 3);
      return true;
    }
    if (p && p.cx != null && G.U.dist2(e.x, e.y, p.cx, p.cy) < (24 + e.r) ** 2) return true;
    const c = ((m && m.crit2) || 0) + ((p && p.crit2) || 0);
    return c > 0 && Math.random() < c;
  }

  // ---------------- estados de los enemigos (los que usan estos tipos) ----------------
  /*
   * e.x2 = { estado: { t, ... } } sólo mientras tenga alguno (los demás no pagan nada).
   * Comportamiento (en el enemigo de verdad; en la copia de un invitado sólo se ven):
   *   conf  confuso: camina al azar; sus choques dañan a otros enemigos y, la mitad de las veces, no a ti
   *   ctrl  marioneta: va a por el enemigo más cercano y le pega · fear  huye de ti
   *   lost  te ha perdido (niebla): va a un punto cercano · daze  de espaldas: no dispara ni embiste
   *   air   en el aire: ni se mueve ni toca (y se le ve subido); puede ir de un sitio a otro
   *   root  anclado: no se mueve pero ataca · slide  lanzado (Remolino, Onda Vacío)
   *   sink  hundiéndose en su arena (Bucle Arena): no sale de ella
   * Daño recibido: vuln (pilas, +8 % cada una, máx. 5) y sacred (+30 %). Ataque bajo (Danza Pluma):
   * el 'atk' de e.s3 (inflict, más abajo), el mismo que usan Hada y Siniestro.
   * Venenos: bpo (grave: el tic crece de ×1 a ×4 en 6 s). Barro: mud (pilas, −12 % cada una; a 4, anclado).
   * Del que pega (en su ordenador): markX (siguiente golpe crítico), mark (señalado), pins (agujas).
   * Jefes y legendarios: el control dura ×0,35 y air, ctrl, fear y slide no les afectan; nadie
   * vuelve a quedar inmóvil (air, root) hasta 1,2 s después de soltarse (e.uqImm).
   *
   * Con los estados de e.s3 (Roca, Fantasma... más abajo), sin pisarse: las pilas de vulnerable
   * de los dos suman como mucho 5 (sK3); quedar inmóvil en uno (air, root / root, sleep) cuenta
   * para la espera de 1,2 s del otro; y si e.x2 ya le lleva (conf, ctrl, fear, lost, air, slide,
   * root, sink), el miedo, el mareo o el embeleso de e.s3 no le mueven además (tickS3).
   */
  const CTRL = { conf: 1, ctrl: 1, fear: 1, lost: 1, air: 1, root: 1, daze: 1, slide: 1, sink: 1 };
  const NOBIG = { air: 1, ctrl: 1, fear: 1, slide: 1 };
  const IMMO = { air: 1, root: 1 };
  /** Pone (o alarga) un estado. → su entrada, o null si no le afecta. */
  function stAdd(e, k, t, o) {
    if (!e || e.dead) return null;
    if (CTRL[k]) {
      if (e.behavior === 'thief' || e.behavior === 'stampede') return null;
      if (bigE(e)) { if (NOBIG[k]) return null; t *= 0.35; }
    }
    const s = e.x2 || (e.x2 = {});
    let x = s[k];
    // (Tampoco si acaba de soltarse de un anclado o dormido de e.s3: misma espera de 1,2 s.)
    if (IMMO[k] && !x && (e.uqImm > 0 || (e.s3 && e.s3.free > T3()))) return null;
    if (!x) x = s[k] = { t: 0, n: 0 };
    if (t > x.t) x.t = t;
    if (o) Object.assign(x, o);
    return x;
  }
  /** Suma pilas (vulnerable, barro, agujas...) hasta max. */
  function stStack(e, k, add, max, t, o) {
    if (!e || e.dead) return null;
    const s = e.x2 || (e.x2 = {});
    const x = s[k] || (s[k] = { t: 0, n: 0 });
    x.n = Math.min(max, x.n + add);
    if (t > x.t) x.t = t;
    if (o) Object.assign(x, o);
    return x;
  }
  const stN = (e, k) => (e.x2 && e.x2[k] ? e.x2[k].n | 0 : 0);

  /** Relojes de los estados (y lo que pasa al acabar). */
  function stTimers(e, dt) {
    const s = e.x2;
    let any = false;
    for (const k in s) {
      const x = s[k];
      if ((x.t -= dt) > 0) { any = true; continue; }
      delete s[k];
      if (k === 'air') { e.jumpLift = 0; e.uqImm = 1.2; if (real(e) && !e.flying) G.World.collide(e); }
      else if (k === 'root') e.uqImm = 1.2;
      else if (k === 'weak' && x.v) e.dmg /= 1 - x.v;
    }
    if (!any) e.x2 = null;
  }

  /** × al daño que recibe un enemigo (Vulnerable, Espada Santa). */
  function stHurtK(e) {
    const s = e.x2;
    if (!s) return 1;
    return (s.vuln ? 1 + 0.08 * Math.min(5, s.vuln.n) : 1) * (s.sacred ? 1.3 : 1);
  }

  /** Un punto de mentira al que va la IA en vez de a ti (con lo que el enemigo lee del jugador). */
  function fakeAt(e, x, y, pl) {
    const f = e.uqFt || (e.uqFt = { x: 0, y: 0, r: 8, _vx: 0, _vy: 0, level: 1, dead: false });
    f.x = x; f.y = y; f.level = (pl && pl.level) || 1;
    return f;
  }
  /** El enemigo más cercano a e (que no sea él), a menos de r. */
  function nearOther(e, r) {
    let best = null, bd = r * r;
    for (const o of G.EnemyMgr.queryCircle(e.x, e.y, r)) {
      if (o === e || o.dead) continue;
      const d = G.U.dist2(e.x, e.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  /** Un enemigo le pega a otro (confusos y marionetas): con su fuerza, no la tuya. */
  function bump(e, o, k) {
    const d = (4 + e.dmg * 0.5 + e.maxHp * 0.04) * k * (bigE(o) ? 0.5 : 1);
    o.hurt(d, '#ff9fcf', o.x - e.x, o.y - e.y, 60, null);
    if (G.Camera.sees(o.x, o.y, 20)) G.FX.sp('impact', 'psychic', o.x, o.y - o.bodyH * 0.5, { life: 0.15, scale: 1 });
  }

  /** Cada fotograma de un enemigo de verdad con estados (envuelve Enemy.update). */
  function stUpdate(e, dt, pl, U) {
    stTimers(e, dt);
    const s = e.x2;
    if (!s || e.dead) return U.call(e, dt, pl);
    if (s.bpo) {
      const b = s.bpo;
      b.age += dt;
      if ((b.tick -= dt) <= 0) {
        b.tick = 0.6;
        e.hurt(b.v * (1 + 3 * Math.min(1, b.age / 6)) * (bigE(e) ? 0.5 : 1), '#9b3cc8');
        if (e.dead) return;
      }
    }
    if (s.mud) { e.slow = Math.max(e.slow, Math.min(0.6, 0.12 * s.mud.n)); e.slowT = Math.max(e.slowT, 0.15); }
    if (s.air) {
      // En el aire: sube, se queda (girando si va en un tornado) y cae; si le llevan a otro sitio, vuela hasta allí.
      const a = s.air;
      a.k = (a.k || 0) + dt;
      e.anim.update(dt);
      if (e.flash > 0) e.flash -= dt;
      e.jumpLift = (a.h || 26) * Math.min(1, a.k / 0.15);
      if (a.cx != null) { a.ang = (a.ang || 0) + dt * 9; e.x = a.cx + Math.cos(a.ang) * (a.cr || 14); e.y = a.cy + Math.sin(a.ang) * (a.cr || 14) * 0.6; }
      else if (a.tx != null) { const k = Math.min(1, dt / Math.max(0.05, a.t)); e.x += (a.tx - e.x) * k; e.y += (a.ty - e.y) * k; }
      e.touchCd = Math.max(e.touchCd, 0.1);
      return;
    }
    if (s.slide) {
      // Lanzado: se desliza hasta su sitio (o con su velocidad) sin pensar.
      const sl = s.slide;
      if (sl.tx != null) { const k = Math.min(1, dt / Math.max(0.03, sl.t)); e.x += (sl.tx - e.x) * k; e.y += (sl.ty - e.y) * k; }
      else { e.x += sl.vx * dt; e.y += sl.vy * dt; const k = Math.pow(0.02, dt); sl.vx *= k; sl.vy *= k; }
      if (!e.flying) G.World.collide(e);
      e.anim.update(dt);
      if (e.flash > 0) e.flash -= dt;
      return;
    }
    let tg = pl;
    if (s.ctrl) {
      // Marioneta: a por el enemigo más cercano y le pega con lo suyo.
      const c = s.ctrl;
      if (!c.o || c.o.dead || (c.look -= dt) <= 0) { c.o = nearOther(e, 320); c.look = 0.4; }
      if (c.o) {
        tg = fakeAt(e, c.o.x, c.o.y, pl);
        if ((c.cd = (c.cd || 0) - dt) <= 0 && G.U.dist2(e.x, e.y, c.o.x, c.o.y) < (e.r + c.o.r + 6) ** 2) { c.cd = 0.6; bump(e, c.o, 1.6); }
      } else tg = fakeAt(e, e.x + Math.cos(e.bob) * 60, e.y + Math.sin(e.bob) * 40, pl);
      e.touchCd = Math.max(e.touchCd, 0.1);
    } else if (s.conf) {
      const c = s.conf;
      if ((c.wt = (c.wt || 0) - dt) <= 0) { c.wt = 0.6; c.wa = Math.random() * TAU; if (c.nt == null) c.nt = Math.random() < 0.5; }
      tg = fakeAt(e, e.x + Math.cos(c.wa) * 200, e.y + Math.sin(c.wa) * 200, pl);
      if ((c.cd = (c.cd || 0) - dt) <= 0) {
        c.cd = 0.5;
        const o = nearOther(e, e.r + 16);
        if (o && G.U.dist2(e.x, e.y, o.x, o.y) < (e.r + o.r + 4) ** 2) bump(e, o, 1);
      }
      if (c.nt) e.touchCd = Math.max(e.touchCd, 0.1);
    } else if (s.fear) {
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      tg = fakeAt(e, e.x + nx * 300, e.y + ny * 300, pl);
    } else if (s.lost) tg = fakeAt(e, s.lost.px, s.lost.py, pl);
    if (s.daze) {
      if (e.phase === 'aim') { e.phase = 'walk'; e.pt = 0.8; }
      if (e.shotCd != null) e.shotCd = Math.max(e.shotCd, 0.25);
    }
    const sp = e.spd;
    if (s.root) e.spd = 0;
    try { U.call(e, dt, tg); } finally { e.spd = sp; }
    if (s.sink && s.sink.f) {
      // No sale de su arena: si se va al borde, vuelve dentro.
      const f = s.sink.f, dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy), R = Math.max(8, f.r - 6);
      if (d > R) { e.x = f.x + dx / d * R; e.y = f.y + dy / d * R; }
      s.sink.d = Math.min(12, (s.sink.d || 0) + dt * 10);
    }
  }

  /** Copias (invitado): sólo los relojes y verse en el aire. */
  function stNet(e, dt) {
    stTimers(e, dt);
    const s = e.x2;
    if (s && s.air) { s.air.k = (s.air.k || 0) + dt; e.jumpLift = (s.air.h || 26) * Math.min(1, s.air.k / 0.15); }
  }

  /** Iconos de los estados (como mucho 2) y lo que se ve encima del enemigo. */
  function stDraw(ctx, e, s) {
    if (!G.Camera.sees(e.x, e.y, 30)) return;
    const now = performance.now() / 1000, top = e.y - (e.jumpLift || 0) - e.bodyH - 8, bx = e.x;
    let n = 0;
    const icon = (shape, pal, o) => { if (n >= 2) return; G.VFX.draw(ctx, shape, pal, bx + (n ? 9 : -2), top - n * 2, o); n++; };
    if (s.air && s.air.glow) {
      // Levantado con la mente: contorno que tiembla alrededor del cuerpo.
      const cy = e.y - (e.jumpLift || 0) - e.bodyH * 0.5, j = Math.sin(now * 40 + e.id) * 1.2;
      ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = s.air.glow; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x + j, cy, e.r * 1.25, e.bodyH * 0.65, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (s.ctrl) {
      // Hilos de marioneta.
      ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = '#ff9fcf';
      for (let i = -1; i <= 1; i++) ctx.fillRect(Math.round(bx + i * 6), Math.round(top - 26), 1, 22 + Math.sin(now * 6 + i) * 2);
      ctx.restore();
      icon('heart', 'psychic', { scale: 0.7 });
    } else if (s.conf) icon('spiral', 'psychic', { frame: Math.floor(now * 6), angle: now * 4 });
    if (s.fear) icon('drop', 'water', { angle: Math.PI / 2, scale: 0.8 });
    if (s.markX) icon('xmark', 'bug', {});
    if (s.mark) icon('diamond', 'grass', { frame: 0 });
    if (s.vuln) {
      if (n < 2) {
        icon('crackshield', 'steel', { scale: 0.8 });
        ctx.save(); ctx.font = NUM_FONT; ctx.textAlign = 'center'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(10,8,24,.85)'; ctx.fillStyle = '#ffd0a0';
        const tx = bx + (n > 1 ? 15 : 6), ty = top + 5, txt = String(s.vuln.n);
        if (G.I18n && G.I18n.rawCanvas) { G.I18n.rawCanvas(ctx, 'strokeText', txt, tx, ty); G.I18n.rawCanvas(ctx, 'fillText', txt, tx, ty); }
        ctx.restore();
      }
    }
    if (s.weak) icon('arrow', 'fighting', { angle: Math.PI, scale: 0.8 });
    if (s.lost) icon('puff', 'mist', { scale: 0.6, frame: Math.floor(now * 3) });
    if (s.daze) icon('wind', 'flying', { scale: 0.6, frame: Math.floor(now * 8), angle: now * 6 });
    if (s.bpo && Math.random() < 0.3) G.FX.px(e.x + G.U.rand(-e.r, e.r), e.y - G.U.rand(2, e.bodyH), '#7a2aa8', { vy: -30, life: 0.4, size: 2 });
    if (s.mud) {
      ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#5a3a18';
      for (let i = 0; i < Math.min(4, s.mud.n); i++) ctx.fillRect(Math.round(e.x - e.r * 0.8 + i * e.r * 0.5), Math.round(e.y - 3 - (i % 2) * e.bodyH * 0.3), 3, 3);
      ctx.restore();
    }
    if (s.root || s.sink) {
      ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = s.sink ? '#c9a45c' : '#6b4a1e';
      for (let i = -2; i <= 2; i++) ctx.fillRect(Math.round(e.x + i * e.r * 0.4), Math.round(e.y - 4 - Math.abs(i)), 2, 6);
      ctx.restore();
    }
    if (s.pins) {
      // Agujas clavadas (Pin Misil).
      for (let i = 0; i < Math.min(5, s.pins.n); i++) {
        const a = i * 1.26 + 0.4;
        G.VFX.draw(ctx, 'needle', 'bug', e.x + Math.cos(a) * e.r * 0.8, e.y - e.bodyH * 0.5 + Math.sin(a) * e.bodyH * 0.35, { angle: a + Math.PI, scale: 0.7 });
      }
    }
  }

  // Envolturas (sólo en el juego: la herramienta de equilibrio no tiene G.Enemy ni G.Player).
  if (G.Enemy && G.Enemy.prototype && !G.Enemy.prototype.uqWrapped) {
    const P = G.Enemy.prototype, U0 = P.update, N0 = P.netUpdate, H0 = P.hurt, D0 = P.draw;
    P.uqWrapped = true;
    P.update = function (dt, pl) {
      if (this.uqImm > 0) this.uqImm -= dt;
      if (!this.x2) return U0.call(this, dt, pl);
      return stUpdate(this, dt, pl, U0);
    };
    P.netUpdate = function (dt) { N0.call(this, dt); if (this.uqImm > 0) this.uqImm -= dt; if (this.x2) stNet(this, dt); };
    P.hurt = function (amount, color, dirX, dirY, knock, eff) {
      if (this.x2 && !this.remote) amount *= stHurtK(this);
      return H0.call(this, amount, color, dirX, dirY, knock, eff);
    };
    P.draw = function (ctx) {
      const s = this.x2;
      if (!s || this.dead) return D0.call(this, ctx);
      if (s.sink && s.sink.d > 0) {
        // Hundiéndose: se recorta lo que queda bajo la arena.
        ctx.save(); ctx.beginPath(); ctx.rect(this.x - 200, this.y - 400, 400, 400 - s.sink.d + 2); ctx.clip();
        ctx.translate(0, s.sink.d * 0.8);
        D0.call(this, ctx);
        ctx.restore();
      } else D0.call(this, ctx);
      stDraw(ctx, this, s);
    };
  }

  /**
   * Jugador: encerrado en el Búnker (quieto), licuado (Armadura Ácida: el doble de rápido),
   * en el aire (saltos: se le ve subido) y el blanco a los señalados (Rayo Señal).
   */
  if (G.Player && G.Player.prototype && !G.Player.prototype.uqWrapped) {
    const P = G.Player.prototype, U0 = P.update, D0 = P.draw;
    P.uqWrapped = true;
    P.update = function (dt) {
      const L = this.uqLock;
      if (L && !this.remote) {
        if ((L.t -= dt) <= 0) { this.uqLock = null; if (L.k === 'slide') this.spdMul /= 2; }
        else if (L.k === 'bunker') {
          const fz = this.frozen; this.frozen = true;
          try { U0.call(this, dt); } finally { this.frozen = fz; }
          this.invuln = Math.max(this.invuln, Math.min(0.2, L.t));
          return;
        }
      }
      U0.call(this, dt);
      if (L && L.k === 'slide' && !this.remote) this.invuln = Math.max(this.invuln, Math.min(0.15, L.t));
      if (MARKED.size && !this.remote && !this.manualAim && !this.dead) aimMarked(this);
    };
    P.draw = function (ctx) {
      const lift = this.uqLift || 0, L = this.uqLock;
      if (!lift && !(L && L.k === 'slide')) return D0.call(this, ctx);
      ctx.save();
      if (lift) {
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.1, this.r * 0.45, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.translate(0, -lift);
      } else {
        // Licuado: un charco morado y el sprite aplastado.
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#a043d0';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.7, this.r * 0.6, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.translate(this.x, this.y); ctx.scale(1.45, 0.32); ctx.translate(-this.x, -this.y);
      }
      D0.call(this, ctx);
      ctx.restore();
    };
  }

  // Señalados por este jugador (Rayo Señal): tu puntería va a por ellos primero.
  const MARKED = new Set();
  function aimMarked(pl) {
    let best = null, bd = 380 * 380;
    for (const e of MARKED) {
      if (e.dead || !e.x2 || !e.x2.mark) { MARKED.delete(e); continue; }
      const d = G.U.dist2(pl.x, pl.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { pl.target = best; pl.aim = Math.atan2(best.y - pl.y, best.x - pl.x); }
  }

  // ---------------- utilidades de los ataques ----------------
  /** Un campo propio (kind 'uq'). */
  function uqField(o) { o.kind = 'uq'; o.t = 0; if (o.pad == null) o.pad = 80; fields.push(o); return o; }
  /** Deja como mucho `keep` campos propios de ese dueño, movimiento y clase (los más nuevos). */
  function trimUq(pl, id, sub, keep) {
    let k = 0;
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      if (f.kind !== 'uq' || f.owner !== pl || f.gone || f.sub !== sub || !f.m || f.m.id !== id) continue;
      if (++k > keep) f.gone = true;
    }
  }
  function findUq(pl, id, sub) {
    for (const f of fields) if (f.kind === 'uq' && f.owner === pl && !f.gone && f.sub === sub && f.m && f.m.id === id) return f;
    return null;
  }
  /** El más nuevo de esa clase. */
  function lastUq(pl, id, sub) {
    for (let i = fields.length - 1; i >= 0; i--) { const f = fields[i]; if (f.kind === 'uq' && f.owner === pl && !f.gone && f.sub === sub && f.m && f.m.id === id) return f; }
    return null;
  }
  /** Golpea a todo lo de un círculo (y los objetos). skip: Set de ids ya golpeados (se apuntan). → cuántos */
  function hitCircle(pl, m, x, y, r, dmg, col, knock = 0, skip = null, filter = null) {
    if (ghost || pl.dead) return 0;
    let n = 0;
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) {
      if (e.dead || (skip && skip.has(e.id)) || (filter && !filter(e))) continue;
      if (skip) skip.add(e.id);
      hit(pl, e, dmg, col, e.x - x, e.y - y, knock, m);
      n++;
    }
    for (const p of G.World.propsInCircle(x, y, r)) G.World.damageProp(p, dmg, col);
    return n;
  }
  /** Lo mismo en un segmento de ancho w. → cuántos */
  function hitSeg(pl, m, x0, y0, x1, y1, w, dmg, col, knock = 0, skip = null, kOf = null, on = null) {
    if (ghost || pl.dead) return 0;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + w;
    let n = 0;
    for (const e of G.EnemyMgr.queryCircle(mx, my, R)) {
      if (e.dead || (skip && skip.has(e.id))) continue;
      if (segDist2(x0, y0, x1, y1, e.x, e.y) > (w / 2 + e.r) ** 2) continue;
      if (skip) skip.add(e.id);
      hit(pl, e, dmg * (kOf ? kOf(e) : 1), col, x1 - x0, y1 - y0, knock, m);
      if (on && !e.dead) on(e);
      n++;
    }
    for (const p of G.World.propsInCircle(mx, my, R)) if (segDist2(x0, y0, x1, y1, p.x, p.y) <= (w / 2 + p.r) ** 2) G.World.damageProp(p, dmg, col);
    return n;
  }
  /** Enemigos de un círculo (sin crear golpes). */
  const inCircle = (x, y, r) => G.EnemyMgr.queryCircle(x, y, r).filter(e => !e.dead);
  /** Mueve al jugador hasta (x, y) a pasos, chocando con las paredes. */
  function movePl(pl, x, y) {
    const dx = x - pl.x, dy = y - pl.y, n = Math.min(40, Math.ceil(Math.hypot(dx, dy) / Math.max(3, (pl.wr || pl.r) * 0.5))) || 1;
    for (let k = 0; k < n; k++) { pl.x += dx / n; pl.y += dy / n; G.World.collide(pl); }
  }
  /** Invulnerable un momento (como el dash: como mucho el 60 % del tiempo desde la anterior). */
  function iframes(pl, t) {
    const at = G.Game.st.time, gap = pl.dashAt == null ? 1 : at - pl.dashAt;
    pl.dashAt = at;
    pl.invuln = Math.max(pl.invuln || 0, Math.min(t, gap * 0.6));
  }
  /** Lleva a un enemigo de verdad a (x, y) si cabe (si no, cerca). */
  function tpEnemy(e, x, y) {
    if (!real(e)) return;
    for (let i = 0; i < 6; i++) {
      const tx = x + (i ? G.U.rand(-30, 30) : 0), ty = y + (i ? G.U.rand(-24, 24) : 0);
      if (e.flying || G.World.isFree(tx, ty, Math.min(12, e.r * 0.8), false)) { e.x = tx; e.y = ty; return; }
    }
  }
  /** Corta lo que prepara un enemigo de verdad (embestida, disparo; a un jefe, le retrasa). */
  function interrupt(e) {
    if (!real(e)) return;
    if (e.phase === 'aim') { e.phase = 'walk'; e.pt = 1.1; }
    if (typeof e.keepsDistance === 'function' && e.keepsDistance()) e.shotCd = Math.max(e.shotCd || 0, 0.9);
    if (e.ai && !e.ai.cast && e.ai.cd != null) e.ai.cd += 0.3;
  }
  /** El blanco de este ataque: el tuyo si llega; si no, el más cercano (o null). */
  function tgOf(pl, m, r) {
    const t = pl.target;
    if (!ghost && t && !t.dead && t.hurt && G.U.dist(pl.x, pl.y, t.x, t.y) <= r) return t;
    return G.Projectiles.nearest(G.EnemyMgr.all(), pl.x + Math.cos(pl.aim) * 40, pl.y + Math.sin(pl.aim) * 40, r);
  }
  /** Hasta dónde llega un rayo desde (x, y) en el ángulo a (corta en la primera pared). */
  function rayLen(x, y, a, len) {
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let d = 8; d < len; d += 8) if (G.World.isWall(x + ca * d, y + sa * d)) return d;
    return len;
  }
  /** Copia de m con otro tipo (Hueso Sombrío: fantasma); su daño se suma al del movimiento. */
  function asType(m, type) {
    const c = m._as || (m._as = Object.create(null));
    return c[type] || (c[type] = Object.create(m, { type: { value: type, writable: true } }));
  }
  function flushAs(m) { if (!m._as) return; for (const k in m._as) { const x = m._as[k]; if (x.dealt) { m.dealt = (m.dealt || 0) + x.dealt; x.dealt = 0; } } }
  /** Píxeles en línea (grietas, hilos): a bloques como los rayos. */
  function pxLine(ctx, x0, y0, x1, y1, w, col) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / Math.max(2, w * 0.8)));
    ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n - w / 2), Math.round(y0 + (y1 - y0) * i / n - w / 2), w, w);
  }
  /** Una grieta zigzagueante de (x0, y0) a (x1, y1) (semilla s: siempre la misma). */
  function crackLine(ctx, x0, y0, x1, y1, s, w = 2) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10));
    let px = x0, py = y0;
    for (let i = 1; i <= n; i++) {
      const k = i / n, j = i === n ? 0 : (G.U.hash(i, s | 0, 51) - 0.5) * 10;
      const nx = x0 + (x1 - x0) * k - (y1 - y0) / (n * 10) * j, ny = y0 + (y1 - y0) * k + (x1 - x0) / (n * 10) * j * 0.6;
      pxLine(ctx, px, py, nx, ny, w + 2, '#6e4c1e');
      pxLine(ctx, px, py, nx, ny, w, '#120a04');
      px = nx; py = ny;
    }
  }
  /** Columna de luz o tierra (a bloques) de ancho w y alto h sobre (x, y). */
  function pillar(ctx, x, y, w, h, P, a) {
    const hw = Math.max(2, Math.round(w / 2));
    ctx.globalAlpha *= a;
    ctx.fillStyle = P[1]; ctx.fillRect(Math.round(x - hw - 2), Math.round(y - h), hw * 2 + 4, h);
    ctx.fillStyle = P[2]; ctx.fillRect(Math.round(x - hw), Math.round(y - h), hw * 2, h);
    ctx.fillStyle = P[3]; ctx.fillRect(Math.round(x - hw * 0.5), Math.round(y - h), Math.max(2, Math.round(hw)), h);
    ctx.fillStyle = P[4]; ctx.fillRect(Math.round(x - 1), Math.round(y - h), 2, h);
  }
  const PAL2 = k => G.VFX.PAL[k] || G.VFX.PAL.normal;
  /** Telaraña de radio R (Red Viscosa), pintada una sola vez por tamaño. */
  const WEB = new Map();
  function webCanvas(R) {
    let cv = WEB.get(R);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = R * 2 + 4; cv.height = Math.ceil(R * 1.2) + 4;
    const c = cv.getContext('2d'), cx = R + 2, cy = R * 0.6 + 2;
    for (let k = 0; k < 8; k++) { const b = k * TAU / 8; pxLine(c, cx, cy, cx + Math.cos(b) * R, cy + Math.sin(b) * R * 0.6, 1.2, '#e2e2ea'); }
    for (const rr of [0.35, 0.65, 0.95]) for (let k = 0; k < 8; k++) {
      const b0 = k * TAU / 8, b1 = (k + 1) * TAU / 8;
      pxLine(c, cx + Math.cos(b0) * R * rr, cy + Math.sin(b0) * R * rr * 0.6, cx + Math.cos(b1) * R * rr, cy + Math.sin(b1) * R * rr * 0.6, 1.2, '#f8f8ff');
    }
    if (WEB.size > 8) WEB.clear();
    WEB.set(R, cv);
    return cv;
  }

  // ---- (cada tipo, en su bloque) ----

  // ======== Psíquico ========
  /** Confusión (o marioneta, evolucionada) al tocar. En la copia de un invitado, sólo se ve. */
  function confuseOn(e, m, p0, t0) {
    const c = m.conf || [p0, t0];
    if (Math.random() < c[0]) stAdd(e, 'conf', c[1]);
  }

  // Confusión: onda que ondula y confunde; Psicocarga: los confusos que toca, marionetas.
  UQ['confusion'] = {
    pp: m => ({ upd: waveUpd, wa: (m.wave || [24])[0], wf: (m.wave || [0, 7])[1], wo: 0, onHit: confusionHit })
  };
  /** Trayectoria en onda: se aparta de su línea amp·sin(f·t) (el desvío se cambia cada fotograma). */
  function waveUpd(p, dt) {
    const sp = Math.hypot(p.vx, p.vy) || 1, nx = -p.vy / sp, ny = p.vx / sp;
    const o = p.wa * Math.sin(p.wf * p.t * 1.3), d = o - p.wo;
    p.x += nx * d; p.y += ny * d; p.wo = o;
    return false;
  }
  function confusionHit(p, e) {
    const m = p.src;
    if (m.evolved && e.x2 && e.x2.conf) {
      if (stAdd(e, 'ctrl', 2.5) && G.Camera.sees(e.x, e.y, 20)) G.FX.ring(e.x, e.y - e.bodyH * 0.5, 4, e.r * 2.5, '#ff9fcf', 0.3, 3);
    } else confuseOn(e, m, 0.25, 1.5);
  }

  // Psicorrayo: se tuerce a mitad de camino (dos tramos) y confunde; Premonición: pilar 2 s después.
  UQ['psybeam'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), w = m.width;
      const a1 = pl.aim, L1 = rayLen(pl.x, pl.y, a1, m.radius * 0.5);
      const bx = pl.x + Math.cos(a1) * L1, by = pl.y + Math.sin(a1) * L1;
      const a2 = a1 + (roll(pl, m, 1) * 2 - 1) * (m.refr || 0.6);
      const L2 = L1 < m.radius * 0.5 - 4 ? 0 : rayLen(bx, by, a2, m.radius - L1);
      const ex = bx + Math.cos(a2) * L2, ey = by + Math.sin(a2) * L2;
      G.FX.beam(pl.x, pl.y - G.LIFT, a1, L1, w, col, vis);
      if (L2 > 0) G.FX.beam(bx, by - G.LIFT, a2, L2, w * 0.85, col, Object.assign({}, vis, { pal: 'psychic' }));
      if (G.Camera.sees(bx, by, 30)) G.FX.burst(bx, by - G.LIFT, '#ffe36a', 6, 120);
      const done = new Set(), list = [];
      for (const [x0, y0, x1, y1] of [[pl.x, pl.y, bx, by], [bx, by, ex, ey]]) {
        if (Math.hypot(x1 - x0, y1 - y0) < 2) continue;
        for (const e of inCircle((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 + w)) {
          if (done.has(e.id) || segDist2(x0, y0, x1, y1, e.x, e.y) > (w / 2 + e.r) ** 2) continue;
          done.add(e.id); list.push(e);
        }
      }
      for (const e of list) {
        if (!ghost) hit(pl, e, m.dmg * pl.atkFor(m), col, Math.cos(a1), Math.sin(a1), 0, m);
        if (!e.dead) confuseOn(e, m, 0.2, 1.5);
      }
      if (!ghost) {
        for (const p of G.World.propsInCircle(bx, by, Math.max(L1, L2) + w)) {
          if (segDist2(pl.x, pl.y, bx, by, p.x, p.y) <= (w / 2 + p.r) ** 2 || segDist2(bx, by, ex, ey, p.x, p.y) <= (w / 2 + p.r) ** 2) G.World.damageProp(p, m.dmg * pl.atkFor(m), col);
        }
        G.Camera.kick(0.08);
      }
      // Premonición: un ojo sobre cada tocado; a los 2 s, el pilar.
      if (m.evolved && list.length) {
        uqField({ sub: 'eye', owner: pl, ghost, m, x: pl.x, y: pl.y, life: 2.4, pad: 400, list: list.slice(0, 16), dmg: m.dmg * pl.atkFor(m) * 2.5, fired: false,
          upd(f, dt) {
            if (!f.fired && f.t >= 2) {
              f.fired = true;
              for (const e of f.list) {
                if (e.dead) continue;
                if (G.Camera.sees(e.x, e.y, 30)) { G.FX.ring(e.x, e.y, 4, 30, '#ffffff', 0.3, 4); G.FX.burst(e.x, e.y - 20, '#ffe8f3', 10, 160); G.Audio.sfx('break'); }
                if (!f.ghost && !f.owner.dead) hit(f.owner, e, f.dmg, '#ff9fcf', 0, -1, 0, f.m);
              }
            }
            return false;
          },
          drawA(ctx, f) {
            const now = performance.now() / 1000;
            for (const e of f.list) {
              if (e.dead || !G.Camera.sees(e.x, e.y, 30)) continue;
              const y = e.y - (e.jumpLift || 0) - e.bodyH - 16;
              if (f.t < 2) G.VFX.draw(ctx, 'eye', 'psychic', e.x, y + Math.sin(now * 5 + e.id) * 1.5, { frame: Math.floor(now * 3) % 2, alpha: Math.min(1, f.t * 6) });
              else pillar(ctx, e.x, e.y, 14 * (1 - (f.t - 2) / 0.4) + 4, 200, PAL2('psychic'), Math.max(0, 1 - (f.t - 2) / 0.4));
            }
          } });
      }
      return true;
    }
  };

  // Psíquico: levanta a los más cercanos y los lanza contra otros; Vasta Fuerza: toda la pantalla, al suelo.
  /** ¿Está e dentro de un Campo Psíquico? */
  const inTerrain = e => fields.some(f => f.kind === 'puddle' && f.m.id === 'psychic-terrain' && G.U.dist2(f.x, f.y, e.x, e.y) < f.r * f.r);
  UQ['psychic'] = {
    cast(pl, m) {
      const col = colOf(m), all = m.evolved, range = 260 * (m.size / 7), list = [], bigs = [];
      const near = all ? G.EnemyMgr.all().filter(e => !e.dead && inWipeBox(pl, e))
                       : inCircle(pl.x, pl.y, range).sort((a, b) => G.U.dist2(pl.x, pl.y, a.x, a.y) - G.U.dist2(pl.x, pl.y, b.x, b.y));
      const n = all ? 40 : Math.max(1, m.count | 0);
      for (const e of near) {
        if (bigE(e) || e.behavior === 'thief' || e.behavior === 'stampede') { if (bigs.length < 3) bigs.push(e); continue; }
        if (list.length >= n) continue;
        list.push(e);
      }
      if (!list.length && !bigs.length) return true;
      const up = all ? 1 : m.lift || 0.6;
      for (const e of list) stAdd(e, 'air', up + 0.3, { h: all ? 34 : 26, k: 0, glow: '#ff4f9a' });
      G.FX.ring(pl.x, pl.y, pl.r, all ? WIPE_W * 0.7 : range * 0.6, col, 0.4, all ? 5 : 3);
      if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('shot', { kind: 'aura', type: 'psychic' });
      // Los grandes: daño y quietos un instante.
      for (const e of bigs) {
        if (!ghost) hit(pl, e, m.dmg * pl.atkFor(m) * (all ? 2.2 : 1.6), col, 0, -1, 0, m);
        if (real(e)) e.applyStun(0.2 * 0.35);
      }
      uqField({ sub: 'tk', owner: pl, ghost, m, x: pl.x, y: pl.y, life: up + 0.6, pad: 500, list, up, all, thrown: null, dmg: m.dmg * pl.atkFor(m),
        upd(f, dt) {
          const pl2 = f.owner;
          if (!f.thrown && f.t >= f.up) {
            f.thrown = [];
            for (const e of f.list) {
              if (e.dead) continue;
              if (f.all) { f.thrown.push({ e, o: null }); continue; }
              // Contra el enemigo más cercano a él (que no esté también en el aire).
              let o = null, bd = 220 * 220;
              for (const c of G.EnemyMgr.queryCircle(e.x, e.y, 220)) {
                if (c === e || c.dead || f.list.includes(c)) continue;
                const d = G.U.dist2(e.x, e.y, c.x, c.y);
                if (d < bd) { bd = d; o = c; }
              }
              f.thrown.push({ e, o });
              const a = e.x2 && e.x2.air;
              if (a && o) { a.tx = o.x; a.ty = o.y; a.t = 0.22; }
            }
          }
          if (f.thrown && !f.hitDone && f.t >= f.up + (f.all ? 0.05 : 0.22)) {
            f.hitDone = true;
            for (const { e, o } of f.thrown) {
              if (e.dead) continue;
              const k = f.all && inTerrain(e) ? 2 : 1;
              if (G.Camera.sees(e.x, e.y, 30)) { G.FX.ring(e.x, e.y, 4, e.r * 2.2, '#ff4f9a', 0.3, 3); G.FX.burst(e.x, e.y - 6, '#ff9fcf', 6, 110); }
              if (e.x2 && e.x2.air) e.x2.air.t = 0.01;                 // cae ya
              if (!f.ghost && !pl2.dead) {
                hit(pl2, e, f.dmg * k * (o || f.all ? 1 : 1.2), '#ff4f9a', 0, 1, 0, f.m);
                if (o && !o.dead) hit(pl2, o, f.dmg, '#ff4f9a', o.x - e.x, o.y - e.y, 80, f.m);
              }
            }
            if (G.Camera.sees(f.x, f.y, 200)) { G.Audio.sfx('thud'); if (!f.ghost) G.Camera.kick(f.all ? 0.3 : 0.12); }
          }
          return false;
        },
        drawG(ctx, f, own) {
          // Contorno rosa bajo los levantados (Vasta Fuerza: ondas por el suelo).
          ctx.strokeStyle = '#ff4f9a'; ctx.lineWidth = 2;
          for (const e of f.list) {
            if (e.dead || !G.Camera.sees(e.x, e.y, 20)) continue;
            ctx.globalAlpha = 0.5 * own;
            ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.3, e.r * 0.5, 0, 0, TAU); ctx.stroke();
          }
          if (f.all && f.t < f.up) {
            ctx.globalAlpha = 0.35 * own * (1 - f.t / f.up);
            for (let k = 0; k < 3; k++) { const r = ((f.t * 260 + k * 90) % 300) + 30; ctx.beginPath(); ctx.ellipse(f.owner.x, f.owner.y, r, r * 0.6, 0, 0, TAU); ctx.stroke(); }
          }
        } });
      return true;
    }
  };

  // Psicocorte: péndulo (delante, a través de ti, detrás y vuelta); Psicocolmillo: rompe escudos y muerde.
  UQ['psycho-cut'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), n = Math.max(1, m.count | 0), sp = m.spread || 0.6;
      const per = 1.6 * (m.radius / 200) / pkOf(m).pspd, dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const a = pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * sp * Math.min(n, 3));
        G.Projectiles.spawn(Object.assign({
          x: pl.x, y: pl.y, vx: Math.cos(a), vy: Math.sin(a), dmg, r: m.size, life: per, pierce: 999, color: col, air: true,
          hits: new Set(), vis, ghost, owner: pl, pa: a, amp: m.radius, per, pc: 1, upd: pendUpd
        }, payload(m)));
      }
      G.Audio.sfx('shot', { kind: 'melee', type: 'psychic' });
      return true;
    },
    pp: m => ({ hitK: (p, e) => (m.evolved && e.shield > 0 ? 1.5 : 1),
                onHit: (p, e) => { if (m.evolved && real(e) && e.shield > 0) { e.shield = 0; e.shieldT = 0; G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#9fd8ff', 10, 150); } } })
  };
  /** Péndulo: una vuelta entera de seno alrededor del dueño; en cada extremo y al pasar por él, puede volver a golpear. */
  function pendUpd(p, dt) {
    const o = p.owner, w = TAU / p.per, s = p.amp * Math.sin(w * p.t), v = p.amp * w * Math.cos(w * p.t);
    p.x = o.x + Math.cos(p.pa) * s; p.y = o.y + Math.sin(p.pa) * s * 0.9;
    p.vx = Math.cos(p.pa) * v; p.vy = Math.sin(p.pa) * v * 0.9;
    const c = v >= 0 ? 1 : -1;
    if (c !== p.pc) {
      // Da la vuelta en un extremo: otra pasada (y, evolucionado, la mandíbula entre la cuchilla y tú).
      p.pc = c; p.hits = new Set();
      const m = p.src;
      if (m && m.evolved) {
        const mx = (p.x + o.x) / 2, my = (p.y + o.y) / 2;
        if (G.Camera.sees(mx, my, 30)) G.FX.sp('jaws', 'psychic', mx, my - G.LIFT * 0.5, { life: 0.24, scale: 1.5, frameRate: 9, fade: false });
        if (!p.ghost && !o.dead) hitSeg(o, m, o.x, o.y, p.x, p.y, 30, p.dmg * 0.8, p.color, 0);
      }
    }
    return false;
  }

  // Paranormal: teletransporta lejos a los tocados y los aturde; Psicoonda: los junta delante y estalla.
  UQ['extrasensory'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m);
      G.FX.ring(pl.x, pl.y, pl.r, m.radius, col, 0.35, 4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        G.FX.sp('ring', 'psychic', pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.8 - G.LIFT * 0.5,
                { vx: Math.cos(a) * m.radius * 3, vy: Math.sin(a) * m.radius * 2.4, life: 0.3 });
      }
      const dmg = m.dmg * pl.atkFor(m), far = (m.knock || 320) / 320;
      let px = 0, py = 0;
      if (m.evolved) {
        const L = rayLen(pl.x, pl.y, pl.aim, 150);
        px = pl.x + Math.cos(pl.aim) * L; py = pl.y + Math.sin(pl.aim) * L;
      }
      for (const e of inCircle(pl.x, pl.y, m.radius)) {
        if (!ghost) hit(pl, e, dmg, col, e.x - pl.x, e.y - pl.y, 0, m);
        if (e.dead) continue;
        if (real(e) && !bigE(e) && e.behavior !== 'thief') {
          if (G.Camera.sees(e.x, e.y, 20)) G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ffe8f3', 6, 90);
          if (m.evolved) tpEnemy(e, px + G.U.rand(-18, 18), py + G.U.rand(-14, 14));
          else { const a = Math.random() * TAU, d = G.U.rand(160, 220) * far; tpEnemy(e, pl.x + Math.cos(a) * d, pl.y + Math.sin(a) * d * 0.8); }
          if (G.Camera.sees(e.x, e.y, 20)) G.FX.ring(e.x, e.y, 2, e.r * 2, '#ff9fcf', 0.25, 3);
        }
        if (real(e)) e.applyStun((m.stun || 0.3) * (bigE(e) ? 0.35 : 1));
      }
      if (!ghost) { G.Camera.kick(0.1); for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, dmg, col); }
      if (G.Camera.sees(pl.x, pl.y, 40)) G.Audio.sfx('shot', { kind: 'orbit', type: 'psychic' });
      if (m.evolved) {
        uqField({ sub: 'wave', owner: pl, ghost, m, x: px, y: py, life: 0.6, pad: 90, dmg, boom: false,
          upd(f) {
            if (!f.boom && f.t >= 0.25) {
              f.boom = true;
              if (G.Camera.sees(f.x, f.y, 40)) { G.FX.ring(f.x, f.y, 6, 70, '#ff4f9a', 0.35, 5); G.FX.burst(f.x, f.y - 8, '#ff9fcf', 16, 200); G.Audio.sfx('break'); }
              hitCircle(f.owner, f.m, f.x, f.y, 70, f.dmg, '#ff4f9a', 120);
            }
            return false;
          },
          drawG(ctx, f, own) {
            if (f.boom) return;
            ctx.globalAlpha = 0.6 * own; ctx.strokeStyle = '#ff4f9a'; ctx.lineWidth = 2;
            const now = performance.now() / 1000;
            for (let k = 0; k < 3; k++) { const r = 70 * (1 - ((f.t * 3 + k / 3) % 1)); ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.6, now * 4, 0, 4.4); ctx.stroke(); }
          } });
      }
      return true;
    }
  };

  // Bola Neblina: deja niebla (te pierden y fallan sus disparos); Resplandor: la niebla destella y debilita.
  UQ['mist-ball'] = {
    pp: m => ({ onHit: (p, e) => mistAt(p.owner, m, p.ghost, e.x, e.y) })
  };
  function mistAt(pl, m, gh, x, y) {
    const mm = m.mist || [60, 3];
    // Encima de una que ya hay: la alarga (no se apilan).
    for (const f of fields) {
      if (f.kind === 'uq' && f.sub === 'mist' && f.owner === pl && !f.gone && G.U.dist2(f.x, f.y, x, y) < (f.r * 0.6) ** 2) { f.life = Math.max(f.life, f.t + mm[1] * pkOf(m).dur); return; }
    }
    const r = mm[0] * pkOf(m).area;
    uqField({ sub: 'mist', owner: pl, ghost: gh, m, x, y, r, life: mm[1] * pkOf(m).dur, pad: r + 30, tick: 0, flash: 0.5, seed: Math.random() * 99,
      dmg: m.dmg * pl.atkFor(m) * 0.15,
      upd(f, dt) {
        if ((f.tick -= dt) <= 0) {
          f.tick = 0.25;
          for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
            const x = real(e) && stAdd(e, 'lost', 0.6);
            if (x && x.px == null) { x.px = f.x + G.U.rand(-f.r, f.r); x.py = f.y + G.U.rand(-f.r, f.r) * 0.6; }
          }
          // Los disparos enemigos que salen de dentro, desviados (una vez cada uno; en cada ordenador, los suyos).
          for (const p of G.Projectiles.all()) {
            if (p.friendly || p.mistd || G.U.dist2(p.x, p.y, f.x, f.y) > f.r * f.r) continue;
            p.mistd = 1;
            const a = G.U.rand(-0.7, 0.7), c = Math.cos(a), s = Math.sin(a), vx = p.vx;
            p.vx = vx * c - p.vy * s; p.vy = vx * s + p.vy * c;
          }
        }
        if (f.m.evolved && (f.flash -= dt) <= 0) {
          f.flash = 0.5;
          if (G.Camera.sees(f.x, f.y, f.r)) { G.FX.ring(f.x, f.y, 4, f.r, '#7fc8ff', 0.25, 3); G.FX.burst(f.x, f.y - 10, '#bfe6ff', 6, 120); }
          for (const e of inCircle(f.x, f.y, f.r)) stStack(e, 'vuln', 1, 5, 4);
          hitCircle(f.owner, f.m, f.x, f.y, f.r, f.dmg, '#7fc8ff');
        }
        return false;
      },
      drawA(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 5), now = performance.now() / 1000;
        ctx.globalAlpha = 0.45 * a * own;
        for (let i = 0; i < 7; i++) {
          const k = i / 7 * TAU + f.seed + now * 0.4, rr = f.r * (0.25 + 0.55 * G.U.hash(i, f.seed | 0, 3));
          G.VFX.draw(ctx, 'puff', f.m.evolved && f.flash > 0.4 ? 'water' : 'mist', f.x + Math.cos(k) * rr, f.y + Math.sin(k) * rr * 0.55 - 10,
                     { scale: 1.5 + (i % 3) * 0.4, frame: (i + Math.floor(now * 2)) % 2, alpha: 0.85 });
        }
      } });
    trimUq(pl, m.id, 'mist', 4);
  }

  // Géiser Fotónico: un pilar que se ensancha en cada golpe y al final deslumbra; Psicoataque: persigue.
  UQ['photon-geyser'] = {
    cast(pl, m) {
      if (pl.mon && G.Stats.sideOf) m.cat = G.Stats.sideOf(pl.mon);         // tu lado más fuerte
      const tg = ghost ? null : spotFor(pl, m);
      const x = tg ? tg.x : pl.x + Math.cos(pl.aim) * 140, y = tg ? tg.y : pl.y + Math.sin(pl.aim) * 140;
      const n = Math.max(1, m.count | 0), list = [];
      for (let i = 0; i < n; i++) list.push({ x: x + colOff(i, m.width), y });
      uqField({ sub: 'gey', owner: pl, ghost, m, x, y, list, life: m.life + 0.15, hl: m.life, k: 0, pad: m.height,
        w0: m.width * 0.55, w1: m.width * 1.65, dmg: m.dmg * pl.atkFor(m), flashed: false,
        upd(f) {
          const pl2 = f.owner, mm = f.m;
          while (f.k * 0.25 < f.hl && f.t >= f.k * 0.25) {
            f.k++;
            const w = f.w0 + (f.w1 - f.w0) * Math.min(1, (f.k - 1) * 0.25 / Math.max(0.25, Math.min(f.hl, 0.6) - 0.25)), hh = mm.height / 2;
            for (const c of f.list) {
              // Psicoataque: el pilar va 40 px hacia el enemigo más cercano en cada golpe.
              if (mm.evolved && f.k > 1) {
                const e = G.Projectiles.nearest(G.EnemyMgr.all(), c.x, c.y, 260);
                if (e) { const d = Math.hypot(e.x - c.x, e.y - c.y), s = Math.min(40, d); if (d > 1) { c.x += (e.x - c.x) / d * s; c.y += (e.y - c.y) / d * s; } }
              }
              c.w = w;
              if (G.Camera.sees(c.x, c.y, f.pad)) for (let j = 0; j < 5; j++) {
                G.FX.sp('star', 'electric', c.x + G.U.rand(-w / 2, w / 2), c.y + G.U.rand(-hh, 0), { vy: -G.U.rand(260, 420), life: 0.25, spin: 6 });
              }
              if (!f.ghost && !pl2.dead) {
                for (const e of G.EnemyMgr.queryCircle(c.x, c.y, Math.hypot(w / 2, hh))) {
                  if (e.dead || Math.abs(e.x - c.x) > w / 2 + e.r || Math.abs(e.y - c.y) > hh) continue;
                  hit(pl2, e, f.dmg, '#ffe36a', 0, -1, 0, mm);
                }
                for (const p of G.World.propsInCircle(c.x, c.y, Math.hypot(w / 2, hh))) if (Math.abs(p.x - c.x) <= w / 2 + p.r && Math.abs(p.y - c.y) <= hh) G.World.damageProp(p, f.dmg, '#ffe36a');
              }
            }
          }
          if (!f.flashed && f.t >= f.hl) {
            // Destello final: confunde a los de alrededor.
            f.flashed = true;
            for (const c of f.list) {
              if (G.Camera.sees(c.x, c.y, 60)) { G.FX.ring(c.x, c.y, 6, 70, '#ffffff', 0.3, 5); G.FX.burst(c.x, c.y - 30, '#fff8c0', 14, 200); }
              for (const e of inCircle(c.x, c.y, 70)) stAdd(e, 'conf', 1);
            }
          }
          return false;
        },
        drawA(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) / 0.12, f.t / 0.06), h = f.m.height;
          for (const c of f.list) {
            // Luz: borde amarillo-rosa translúcido y el centro blanco (Necrozma).
            const w = c.w || f.w0, flick = 0.85 + 0.15 * Math.sin(f.t * 40);
            ctx.globalAlpha = own * 0.4 * flick;
            pillar(ctx, c.x, c.y + h / 2, w, h, ['#ffcf6a', '#ff9fcf', '#ffe9a0', '#fff6e0', '#ffffff'], a);
            ctx.globalAlpha = own * 0.85 * a; ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(c.x - w * 0.12), Math.round(c.y - h / 2), Math.max(2, Math.round(w * 0.24)), h);
            ctx.globalAlpha = own * 0.55 * a; ctx.fillStyle = '#ffe36a';
            ctx.beginPath(); ctx.ellipse(c.x, c.y + h / 2, w * 0.75, w * 0.26, 0, 0, TAU); ctx.fill();
          }
        } });
      if (G.Camera.sees(x, y, 60)) G.Audio.sfx('shot', { kind: 'beam', type: 'psychic' });
      return true;
    }
  };

  // Campo Psíquico: tus disparos lo cruzan más rápidos y fuertes; los enemigos y los suyos, lentos.
  // Onda Mental: dos campos que se tocan se funden y laten.
  UQ['psychic-terrain'] = {
    field(f, dt) {
      if (f.kind !== 'puddle') return;
      const r2 = f.r * f.r;
      for (const p of G.Projectiles.all()) {
        if (p.orb) continue;
        const dx = p.x - f.x, dy = (p.y - f.y) / 0.62;
        if (dx * dx + dy * dy > r2) continue;
        if (p.friendly) {
          if (p.owner === f.owner && !p.ptb && !p.ricochet) {
            p.ptb = 1; p.vx *= 1.2; p.vy *= 1.2; p.dmg *= 1.3;
            if (G.Camera.sees(p.x, p.y, 10)) G.FX.spark(p.x, p.y - G.LIFT, '#ff9fcf', p.vx, p.vy, 2);
          }
        } else if (!p.pts) { p.pts = 1; p.vx *= 0.65; p.vy *= 0.65; }
      }
      if (!f.m.evolved) return;
      // Se funden con los campos tuyos que tocan.
      if ((f.mt = (f.mt || 0) - dt) <= 0) {
        f.mt = 0.3;
        for (const o of fields) {
          if (o === f || o.gone || o.kind !== 'puddle' || o.owner !== f.owner || o.m.id !== f.m.id) continue;
          if (G.U.dist2(o.x, o.y, f.x, f.y) > (o.r + f.r) ** 2) continue;
          const r = Math.min(150, f.r + o.r * 0.7);
          f.x = (f.x * f.r + o.x * o.r) / (f.r + o.r); f.y = (f.y * f.r + o.y * o.r) / (f.r + o.r);
          f.r = f.r0 = r; f.pad = r * 1.5; f.life = Math.max(f.life - f.t, o.life - o.t) + f.t + 1;
          o.gone = true;
          if (G.Camera.sees(f.x, f.y, 40)) G.FX.ring(f.x, f.y, f.r * 0.5, f.r, '#ff4f9a', 0.4, 4);
        }
      }
      if ((f.pulse = (f.pulse == null ? 1 : f.pulse) - dt) <= 0) {
        f.pulse = 1;
        if (G.Camera.sees(f.x, f.y, f.r)) { G.FX.ring(f.x, f.y, 6, f.r * 1.3, '#ff4f9a', 0.45, 4); G.FX.ring(f.x, f.y, 4, f.r * 0.8, '#ffe8f3', 0.35, 3); }
        blast(f, f.r * 1.3, 1.6);
      }
    }
  };

  // ======== Veneno ========
  /** Veneno grave (Tóxico, Púas Tóxicas, Búnker): el tic crece mientras lo siga sufriendo. v = daño del tic base. */
  function badPoison(e, v, t = 4) {
    if (!real(e)) { if (e && !e.dead && e.remote) stAdd(e, 'bpo', t, { v: 0, age: 0, tick: 99 }); return; }
    const x = stAdd(e, 'bpo', t);
    if (!x) return;
    if (x.age == null) { x.age = 0; x.tick = 0.6; x.v = 0; }
    x.v = Math.max(x.v, v);
  }
  /** Charco tóxico pequeño (gotas de Residuos, botes de Bomba Lodo): veneno y algo de daño cada 0,4 s. */
  function toxPool(pl, m, gh, x, y, r, life, dmg) {
    uqField({ sub: 'pool', owner: pl, ghost: gh, m, x, y, r, life, pad: r + 20, tick: 0.1, dmg,
      upd(f, dt) { if ((f.tick -= dt) <= 0) { f.tick = 0.4; hitCircle(f.owner, f.m, f.x, f.y, f.r, f.dmg, '#b45ec4'); } return false; },
      drawG(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 8);
        ctx.globalAlpha = 0.4 * a * own; ctx.fillStyle = '#7a2aa8';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.6 * a * own; ctx.fillStyle = '#d995f2';
        ctx.fillRect(Math.round(f.x - f.r * 0.3), Math.round(f.y - 2), 2, 2); ctx.fillRect(Math.round(f.x + f.r * 0.25), Math.round(f.y + 1), 2, 2);
      } });
    trimUq(pl, m.id, 'pool', 16);
  }

  // Residuos: el tocado queda pringado y va dejando gotas tóxicas; Bomba Lodo: bota 3 veces dejando charcos.
  UQ['sludge'] = {
    pp: m => ({ onHit: (p, e) => { if (!p.ghost && !e.dead) slimeOn(p.owner, m, e); } }),
    cast(pl, m) {
      if (!m.evolved) return false;
      const n = Math.max(1, m.count | 0), near = inCircle(pl.x, pl.y, 300), dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const e = i === 0 ? (tgOf(pl, m, 300) || near[0]) : near[(i * 7) % Math.max(1, near.length)];
        const tx = e ? e.x : pl.x + Math.cos(pl.aim) * 200, ty = e ? e.y : pl.y + Math.sin(pl.aim) * 200;
        uqField({ sub: 'bomb', owner: pl, ghost, m, x: pl.x, y: pl.y, x0: pl.x, y0: pl.y, tx, ty, hop: 0, h: 0, life: 1.2, pad: 260, dmg,
          upd(f) {
            const k = Math.min(3, f.t / 0.24), i = Math.floor(k), u = k - i;
            if (i > f.hop) {
              // Toca el suelo: golpe y charco tóxico.
              f.hop = i;
              const x = f.x0 + (f.tx - f.x0) * i / 3, y = f.y0 + (f.ty - f.y0) * i / 3;
              if (G.Camera.sees(x, y, 30)) { G.FX.burst(x, y - 4, '#a043d0', 8, 120); G.Audio.sfx('thud'); }
              hitCircle(f.owner, f.m, x, y, 30, f.dmg, '#a043d0');
              toxPool(f.owner, f.m, f.ghost, x, y, 30, 2, f.dmg * 0.15);
              if (i >= 3) return true;
            }
            f.x = f.x0 + (f.tx - f.x0) * k / 3; f.y = f.y0 + (f.ty - f.y0) * k / 3; f.h = Math.sin(u * Math.PI) * (i === 0 ? 46 : 30);
            return false;
          },
          drawA(ctx, f) {
            ctx.globalAlpha *= 0.3; ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, 7, 3, 0, 0, TAU); ctx.fill();
            ctx.globalAlpha /= 0.3;
            G.VFX.draw(ctx, 'blob', 'poison', f.x, f.y - f.h - 6, { scale: 2, frame: Math.floor(f.t * 10) });
          } });
      }
      G.Audio.sfx('shot', { kind: 'projectile', type: 'poison' });
      return true;
    }
  };
  /** Pringado: gotas tóxicas por donde anda (unos 3 s). Lo lleva quien lanza (también sobre una copia). */
  function slimeOn(pl, m, e) {
    let f = null;
    for (const o of fields) if (o.kind === 'uq' && o.sub === 'slime' && o.owner === pl && o.e === e && !o.gone) { f = o; break; }
    if (f) { f.left = 3; return; }
    uqField({ sub: 'slime', owner: pl, ghost: false, m, e, x: e.x, y: e.y, left: 3, next: 0, drips: [], pad: 200, tick: 0,
      dmg: m.dmg * pl.atkFor(m) * 0.15,
      upd(f, dt) {
        f.left -= dt;
        if (f.left > 0 && !f.e.dead && (f.next -= dt) <= 0) {
          f.next = 0.3; f.x = f.e.x; f.y = f.e.y;
          f.drips.push({ x: f.e.x + G.U.rand(-4, 4), y: f.e.y + G.U.rand(-3, 3), t: 0 });
          if (f.drips.length > 10) f.drips.shift();
        }
        for (const d of f.drips) d.t += dt;
        while (f.drips.length && f.drips[0].t > 1.5) f.drips.shift();
        if ((f.tick -= dt) <= 0) {
          f.tick = 0.45;
          // Envenena a los demás que pisan las gotas (al pringado, no).
          for (const d of f.drips) for (const o of G.EnemyMgr.queryCircle(d.x, d.y, 14)) if (o !== f.e && !o.dead && !f.owner.dead) hit(f.owner, o, f.dmg, '#b45ec4', 0, 0, 0, f.m);
        }
        return f.left <= 0 && !f.drips.length;
      },
      drawG(ctx, f, own) {
        ctx.fillStyle = '#8a3cbf';
        for (const d of f.drips) { ctx.globalAlpha = 0.65 * own * Math.max(0, 1 - d.t / 1.5); ctx.beginPath(); ctx.ellipse(d.x, d.y, 7, 3.5, 0, 0, TAU); ctx.fill(); }
      },
      drawA(ctx, f) {
        if (f.left > 0 && !f.e.dead && Math.random() < 0.25) G.FX.px(f.e.x + G.U.rand(-f.e.r, f.e.r) * 0.6, f.e.y - G.U.rand(2, f.e.bodyH * 0.6), '#a043d0', { vy: 40, grav: 200, life: 0.3, size: 2 });
      } });
    trimUq(pl, m.id, 'slime', 6);
  }

  // Picotazo Veneno: dos aguijones paralelos (si los dos dan al mismo, veneno doble); Puya Nociva: tres estocadas.
  UQ['poison-sting'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), dmg = m.dmg * pl.atkFor(m);
      if (m.evolved) {
        uqField({ sub: 'stab', owner: pl, ghost, m, x: pl.x, y: pl.y, a: pl.aim, k: 0, life: 0.4, pad: 120, dmg,
          upd(f) {
            const pl2 = f.owner;
            f.x = pl2.x; f.y = pl2.y;
            while (f.k < 3 && f.t >= f.k * 0.1) {
              f.k++;
              const a = (f.ghost ? pl2.aim : f.a) + G.U.rand(-0.12, 0.12), L = 70 + (f.m.size || 4) * 2;
              const ex = pl2.x + Math.cos(a) * L, ey = pl2.y + Math.sin(a) * L;
              if (G.Camera.sees(pl2.x, pl2.y, 80)) {
                G.FX.sp('needle', 'poison', pl2.x + Math.cos(a) * L * 0.6, pl2.y + Math.sin(a) * L * 0.6 - G.LIFT * 0.5, { vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.12, angle: a, scale: 2.5 });
                G.FX.sp('streak', 'poison', pl2.x + Math.cos(a) * L * 0.5, pl2.y + Math.sin(a) * L * 0.5 - G.LIFT * 0.5, { life: 0.14, angle: a, scale: 1.5 });
                G.Audio.sfx('shot', { kind: 'melee', type: 'poison' });
              }
              // (+1 veneno a la del golpe: 2 por estocada.)
              if (!f.ghost && !pl2.dead) hitSeg(pl2, f.m, pl2.x, pl2.y, ex, ey, 22, f.dmg, '#b45ec4', 30, null, null, e => e.applyPoison(1));
            }
            return false;
          } });
        return true;
      }
      // Dos (o más) aguijones en paralelo; comparten la cuenta de a quién han dado.
      const n = Math.max(1, m.count | 0), pair = new Map(), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 7;
        G.Projectiles.spawn(Object.assign({
          x: pl.x - sa * off, y: pl.y + ca * off, vx: ca * m.speed, vy: sa * m.speed,
          dmg, r: m.size, life: m.life, pierce: m.pierce | 0, color: col, hits: new Set(), vis, ghost, owner: pl, pair
        }, payload(m)));
      }
      G.FX.spark(pl.x + ca * pl.r, pl.y - G.LIFT + sa * pl.r, col, ca, sa, 3);
      return true;
    },
    pp: () => ({ onHit: (p, e) => {
      if (p.ghost || !p.pair || e.dead) return;
      const c = (p.pair.get(e.id) || 0) + 1;
      p.pair.set(e.id, c);
      if (c === 2) {
        e.applyPoison(2);
        if (G.Camera.sees(e.x, e.y, 20)) { G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#d995f2', 10, 140); G.FX.dmgText(e.x + 10, e.y - e.bodyH - 10, '×2', '#d995f2'); }
      }
    } })
  };

  // Tóxico: rastro de veneno grave; Gas Venenoso: una nube grande que te sigue.
  UQ['toxic'] = {
    cast(pl, m) {
      const dmg = m.dmg * pl.atkFor(m);
      if (m.evolved) {
        let f = findUq(pl, m.id, 'gas');
        if (f) { f.life = f.t + 1.2; f.dmg = dmg; return true; }
        const r = m.radius * 2.7;
        uqField({ sub: 'gas', owner: pl, ghost, m, x: pl.x, y: pl.y, r, life: 1.2, pad: r + 30, tick: 0.1, dmg, seed: Math.random() * 50,
          upd(f, dt) {
            const pl2 = f.owner;
            if (pl2.dead) return true;
            // Por detrás de ti, despacio.
            const tx = pl2.x - Math.cos(pl2.moveAngle) * 40, ty = pl2.y - Math.sin(pl2.moveAngle) * 30;
            f.x = G.U.damp(f.x, tx, 2.2, dt); f.y = G.U.damp(f.y, ty, 2.2, dt);
            if ((f.tick -= dt) <= 0) {
              f.tick = 0.5;
              for (const e of inCircle(f.x, f.y, f.r)) {
                badPoison(e, f.dmg * 0.6);
                if (!f.ghost) e.applySlow(0.25, 0.6);
              }
              hitCircle(pl2, f.m, f.x, f.y, f.r, f.dmg * 1.3, '#a043d0');
            }
            return false;
          },
          drawA(ctx, f, own) {
            const a = Math.min(1, (f.life - f.t) * 3, f.t * 4), now = performance.now() / 1000;
            ctx.globalAlpha = 0.35 * a * own;
            for (let i = 0; i < 8; i++) {
              const k = i / 8 * TAU + now * 0.5 + f.seed, rr = f.r * (0.2 + 0.6 * G.U.hash(i, 7, f.seed | 0));
              G.VFX.draw(ctx, 'puff', 'poison', f.x + Math.cos(k) * rr, f.y + Math.sin(k) * rr * 0.55 - 12, { scale: 1.6 + (i % 3) * 0.5, frame: (i + Math.floor(now * 2)) % 2, alpha: 0.9 });
            }
            if (Math.random() < 0.4 && G.Camera.sees(f.x, f.y, f.r)) G.FX.sp('bubble', 'poison', f.x + G.U.rand(-f.r, f.r) * 0.7, f.y - G.U.rand(0, 20), { vy: -30, life: 0.6, scale: 1.5 });
          } });
        return true;
      }
      // Rastro: un charco nuevo cuando te has movido lo bastante (como mucho 18).
      const last = lastUq(pl, m.id, 'patch');
      if (last && G.U.dist2(last.x, last.y, pl.x, pl.y) < (m.radius * 0.9) ** 2 && last.t < 1) return true;
      uqField({ sub: 'patch', owner: pl, ghost, m, x: pl.x, y: pl.y, r: m.radius, life: m.dur || 3, pad: 40, tick: 0, dmg,
        upd(f, dt) {
          if ((f.tick -= dt) <= 0) {
            f.tick = 0.5;
            for (const e of inCircle(f.x, f.y, f.r)) badPoison(e, f.dmg * 0.25);
            hitCircle(f.owner, f.m, f.x, f.y, f.r, f.dmg, '#7a2aa8');
          }
          return false;
        },
        drawG(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 2, f.t * 6);
          ctx.globalAlpha = 0.42 * a * own; ctx.fillStyle = '#4a1466';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.6 * a * own; ctx.strokeStyle = '#a043d0'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.8, f.r * 0.5, 0, 0, TAU); ctx.stroke();
          if (Math.random() < 0.05) G.FX.sp('bubble', 'poison', f.x + G.U.rand(-f.r, f.r) * 0.6, f.y - 4, { vy: -40, life: 0.45 });
        } });
      trimUq(pl, m.id, 'patch', 18);
      return true;
    }
  };

  // Púas Tóxicas: capas (la 2.ª, veneno grave); Lanza Mugre: los que mueren encima salpican capas nuevas.
  UQ['toxic-spikes'] = {
    cast(pl, m) {
      const n = Math.max(1, (m.count | 0) - 1), dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, d = i ? G.U.rand(50, 90) : 0;
        tspikes(pl, m, ghost, pl.x + Math.cos(a) * d, pl.y + Math.sin(a) * d * 0.8, m.radius, m.dur || 10, dmg, true);
      }
      if (G.Camera.sees(pl.x, pl.y, 40)) G.Audio.sfx('shake');
      return true;
    }
  };
  function tspikes(pl, m, gh, x, y, r, life, dmg, layer) {
    if (layer) for (const f of fields) {
      if (f.kind !== 'uq' || f.sub !== 'tsp' || f.owner !== pl || f.gone || f.small || G.U.dist2(f.x, f.y, x, y) > (f.r * 0.6) ** 2) continue;
      // Otra capa encima (como mucho 2): veneno grave.
      if (f.layers < 2 && G.Camera.sees(f.x, f.y, 30)) G.FX.ring(f.x, f.y, 4, f.r, '#7cff8a', 0.35, 3);
      f.layers = Math.min(2, f.layers + 1); f.life = f.t + life; f.dmg = dmg;
      return;
    }
    uqField({ sub: 'tsp', owner: pl, ghost: gh, m, x, y, r, life, layers: 1, small: !layer, pad: r + 20, tick: 0.2, dmg, inside: new Set(), seed: Math.random() * 999,
      upd(f, dt) {
        if ((f.tick -= dt) > 0) return false;
        f.tick = 0.4;
        const now = new Set();
        for (const e of inCircle(f.x, f.y, f.r)) {
          if (e.flying) continue;                       // (las púas no tocan a los que vuelan)
          now.add(e);
          if (f.layers >= 2) badPoison(e, f.dmg * 0.3);
          if (!f.ghost && !f.owner.dead) hit(f.owner, e, f.dmg * 0.19, '#b45ec4', 0, 0, 0, f.m);
        }
        // Lanza Mugre: los que se debilitan encima revientan en capas nuevas.
        if (f.m.evolved && !f.small) {
          for (const e of f.inside) {
            if (!e.dead) continue;
            if (G.Camera.sees(e.x, e.y, 30)) { G.FX.burst(e.x, e.y - 8, '#a043d0', 14, 170); G.Audio.sfx('thud'); }
            for (let k = 0; k < 3; k++) {
              const a = k * 2.09 + Math.random(), d = G.U.rand(26, 44);
              tspikes(f.owner, f.m, f.ghost, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.8, 30, 4, f.dmg, false);
            }
          }
        }
        f.inside = now;
        return false;
      },
      drawG(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 6);
        ctx.globalAlpha = 0.18 * a * own; ctx.fillStyle = f.layers >= 2 ? '#4fe070' : '#a043d0';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = a * own;
        const n = f.small ? 3 : 7 + f.layers * 3;
        for (let i = 0; i < n; i++) {
          const k = G.U.hash(i, f.seed | 0, 11) * TAU, rr = f.r * Math.sqrt(G.U.hash(i, f.seed | 0, 12)) * 0.85;
          G.VFX.draw(ctx, 'caltrop', i % 2 && f.layers >= 2 ? 'grass' : 'poison', f.x + Math.cos(k) * rr, f.y + Math.sin(k) * rr * 0.6 - 2, { scale: 0.7 });
        }
      } });
    trimUq(pl, m.id, 'tsp', 12);
  }

  // Bomba Ácida: cada golpe baja 2 pilas la defensa (vulnerable) y envenena; Onda Tóxica: anillo en cada rebote.
  UQ['acid-spray'] = {
    pp: m => ({ onHit: (p, e) => {
      if (!e.dead) {
        stStack(e, 'vuln', m.vuln || 2, 5, 5);
        if (Math.random() < 0.6 && G.Camera.sees(e.x, e.y, 20)) G.FX.sp('puff', 'acid', e.x, e.y - e.bodyH, { vy: -30, life: 0.5, scale: 0.8 });
      }
      if (m.evolved) {
        if (G.Camera.sees(e.x, e.y, 40)) G.FX.ring(e.x, e.y, 4, 50, '#9ccc24', 0.3, 3);
        if (!p.ghost && !p.owner.dead) {
          for (const o of G.EnemyMgr.queryCircle(e.x, e.y, 50)) if (o !== e && !o.dead) { hit(p.owner, o, p.dmg * 0.4, '#9ccc24', o.x - e.x, o.y - e.y, 0, m); }
        }
      }
    } })
  };

  // Veneno X: dos cuchillas desde tus lados que se cruzan sobre el blanco (en el cruce, crítico seguro);
  // Garra Nociva: la X se queda en el suelo como zona venenosa.
  UQ['cross-poison'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), dmg = m.dmg * pl.atkFor(m), pairs = Math.max(1, Math.ceil((m.count | 0) / 2));
      const used = new Set(), R = m.speed * m.life;
      for (let j = 0; j < pairs; j++) {
        let e = j === 0 ? tgOf(pl, m, R) : null;
        if (j > 0) {
          let bd = R * R;
          for (const o of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) { if (o.dead || used.has(o.id)) continue; const d = G.U.dist2(pl.x, pl.y, o.x, o.y); if (d < bd) { bd = d; e = o; } }
        }
        if (e) used.add(e.id);
        const a0 = e ? Math.atan2(e.y - pl.y, e.x - pl.x) : pl.aim + (j ? G.U.rand(-1, 1) : 0);
        const dist = e ? G.U.clamp(G.U.dist(pl.x, pl.y, e.x, e.y), 50, R * 0.8) : 150;
        const cx = pl.x + Math.cos(a0) * dist, cy = pl.y + Math.sin(a0) * dist;
        for (const sd of [-1, 1]) {
          const sx = pl.x - Math.sin(a0) * 34 * sd - Math.cos(a0) * 6, sy = pl.y + Math.cos(a0) * 34 * sd - Math.sin(a0) * 6;
          const [nx, ny] = G.U.norm(cx - sx, cy - sy), L = Math.hypot(cx - sx, cy - sy);
          G.Projectiles.spawn(Object.assign({
            x: sx, y: sy, vx: nx * m.speed, vy: ny * m.speed, dmg, r: m.size, life: L / m.speed + 0.35, pierce: m.pierce | 0, color: col,
            hits: new Set(), vis, ghost, owner: pl, cx, cy, crossT: L / m.speed, lead: sd < 0
          }, payload(m)));
        }
      }
      G.FX.ring(pl.x, pl.y, pl.r, pl.r * 3, col, 0.25, 2);
      return true;
    },
    pp: m => ({ upd: (p) => {
      if (!p.crossed && p.t >= p.crossT) {
        p.crossed = true;
        if (p.lead) {
          if (G.Camera.sees(p.cx, p.cy, 30)) { G.FX.sp('xmark', 'poison', p.cx, p.cy - G.LIFT * 0.5, { life: 0.3, scale: 2.5 }); G.FX.burst(p.cx, p.cy - G.LIFT * 0.5, '#ff7ae0', 8, 140); }
          if (m.evolved) xZone(p.owner, m, p.ghost, p.cx, p.cy, Math.atan2(p.vy, p.vx), p.dmg);
        }
      }
      return false;
    } })
  };
  /** Garra Nociva: X venenosa en el suelo (dos tramos que se cruzan) 2 s. */
  function xZone(pl, m, gh, x, y, a, dmg) {
    uqField({ sub: 'xz', owner: pl, ghost: gh, m, x, y, a, life: 2 * pkOf(m).dur, pad: 60, tick: 0.1, dmg: dmg * 0.4, L: 44 * pkOf(m).area,
      upd(f, dt) {
        if ((f.tick -= dt) <= 0) {
          f.tick = 0.35;
          const skip = new Set();
          for (const b of [f.a + 0.785, f.a - 0.785]) {
            const dx = Math.cos(b) * f.L, dy = Math.sin(b) * f.L * 0.7;
            hitSeg(f.owner, f.m, f.x - dx, f.y - dy, f.x + dx, f.y + dy, 14, f.dmg, '#ff7ae0', 0, skip);
          }
        }
        return false;
      },
      drawG(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 8);
        for (const b of [f.a + 0.785, f.a - 0.785]) {
          const dx = Math.cos(b) * f.L, dy = Math.sin(b) * f.L * 0.7;
          ctx.globalAlpha = 0.5 * a * own; pxLine(ctx, f.x - dx, f.y - dy, f.x + dx, f.y + dy, 8, '#5e1f7e');
          ctx.globalAlpha = 0.85 * a * own; pxLine(ctx, f.x - dx, f.y - dy, f.x + dx, f.y + dy, 3, '#ff7ae0');
        }
      } });
    trimUq(pl, m.id, 'xz', 6);
  }

  // Búnker: al parar te encierras (quieto e invulnerable) y sueltas gas que envenena grave;
  // Armadura Ácida: te licúas y te deslizas al doble de rápido dejando ácido.
  UQ['baneful-bunker'] = {
    block(pl, m) {
      const dmg = m.dmg * pl.atkFor(m);
      if (!m.evolved) {
        pl.uqLock = { k: 'bunker', t: 1.2 };
        pl.invuln = Math.max(pl.invuln || 0, 1.25);
        uqField({ sub: 'bunker', owner: pl, ghost: false, m, x: pl.x, y: pl.y, life: 1.2, pad: 120, tick: 0, dmg,
          upd(f, dt) {
            if ((f.tick -= dt) <= 0) {
              f.tick = 0.3;
              for (const e of inCircle(f.x, f.y, 80)) badPoison(e, f.dmg * 0.35);
              hitCircle(f.owner, f.m, f.x, f.y, 80, f.dmg * 0.15, '#a043d0');
              if (G.Camera.sees(f.x, f.y, 80)) for (let i = 0; i < 3; i++) { const a = Math.random() * TAU; G.FX.sp('puff', 'poison', f.x + Math.cos(a) * 30, f.y + Math.sin(a) * 20 - 6, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 60, life: 0.5 }); }
            }
            return false;
          },
          drawA(ctx, f, own) {
            // Cúpula morada con púas sobre ti.
            const pl2 = f.owner, a = Math.min(1, (f.life - f.t) * 6, f.t * 10), r = pl2.r * 1.7;
            ctx.globalAlpha = 0.35 * a * own; ctx.fillStyle = '#5e1f7e';
            ctx.beginPath(); ctx.ellipse(pl2.x, pl2.y - pl2.bodyH * 0.4, r, pl2.bodyH * 0.75, 0, Math.PI, TAU); ctx.lineTo(pl2.x + r, pl2.y); ctx.ellipse(pl2.x, pl2.y, r, r * 0.4, 0, 0, Math.PI); ctx.fill();
            ctx.globalAlpha = 0.9 * a * own;
            for (let i = 0; i < 7; i++) { const k = Math.PI + (i + 0.5) / 7 * Math.PI; G.VFX.draw(ctx, 'needle', 'poison', pl2.x + Math.cos(k) * r, pl2.y - pl2.bodyH * 0.4 + Math.sin(k) * pl2.bodyH * 0.75, { angle: k, scale: 0.8 }); }
          } });
        G.Audio.sfx('ball');
        return;
      }
      // Licuado: 0,6 s al doble de rápido, sin que te toquen, dejando ácido.
      if (!pl.uqLock) { pl.uqLock = { k: 'slide', t: 0.6 }; pl.spdMul *= 2; }
      pl.invuln = Math.max(pl.invuln || 0, 0.65);
      uqField({ sub: 'acid', owner: pl, ghost: false, m, x: pl.x, y: pl.y, life: 0.65, pad: 60, next: 0, dmg,
        upd(f, dt) {
          f.x = f.owner.x; f.y = f.owner.y;
          if ((f.next -= dt) <= 0) { f.next = 0.1; toxPool(f.owner, f.m, false, f.x, f.y, 22, 2, f.dmg * 0.15); }
          return false;
        } });
      G.Audio.sfx('surge');
    }
  };

  // ======== Tierra ========
  const sunny = () => !!(G.Weather && G.Weather.current && G.Weather.current.kind === 'sun');
  const sandy = () => !!(G.Weather && G.Weather.current && G.Weather.current.kind === 'sand');
  const volcano = () => !!(G.World && G.World.liquidKind && G.World.liquidKind() === 'lava');
  const ground = e => !e.flying;

  // Disparo Lodo: pilas de barro (a 4, atascado); Tierra Viva: el suelo erupciona bajo los embarrados.
  UQ['mud-shot'] = {
    pp: () => ({ onHit: (p, e) => {
      if (e.dead) return;
      const x = stStack(e, 'mud', 1, 4, 3);
      if (x && x.n >= 4 && real(e)) {
        // Atascado: anclado 1 s y vuelve a 0.
        x.n = 0;
        if (stAdd(e, 'root', 1) && G.Camera.sees(e.x, e.y, 20)) G.FX.burst(e.x, e.y - 4, '#7a5222', 10, 90);
      }
    } }),
    cast(pl, m) {
      if (!m.evolved) return false;
      nova(pl, m);
      const dmg = m.dmg * pl.atkFor(m);
      for (const e of inCircle(pl.x, pl.y, 260)) {
        const n = stN(e, 'mud');
        if (n <= 0) continue;
        e.x2.mud.n = 0;
        uqField({ sub: 'erupt', owner: pl, ghost, m, x: e.x, y: e.y, e, n, life: 0.55, pad: 80, done: false, dmg: dmg * (0.8 + 0.6 * n),
          upd(f) {
            if (!f.done && f.t >= 0.25) {
              f.done = true;
              if (!f.e.dead) { f.x = f.e.x; f.y = f.e.y; }
              if (G.Camera.sees(f.x, f.y, 40)) { G.FX.burst(f.x, f.y - 10, '#f08a24', 10, 160); G.FX.ring(f.x, f.y, 4, 30, '#ffc75a', 0.3, 3); G.Audio.sfx('thud'); }
              hitCircle(f.owner, f.m, f.x, f.y, 30, f.dmg, '#f08a24', 40);
            }
            return false;
          },
          drawA(ctx, f, own) {
            if (!f.done) { ctx.globalAlpha = own * 0.7; ctx.fillStyle = '#f08a24'; ctx.fillRect(Math.round(f.x - 8), Math.round(f.y - 2), 16, 3); return; }
            const k = (f.t - 0.25) / 0.3;
            pillar(ctx, f.x, f.y, 20 + 4 * f.n, 60 + 20 * f.n, PAL2('hotsand'), Math.max(0, 1 - k));
          } });
      }
      return true;
    }
  };

  // Terratemblor: pisotones al andar, un anillo por el suelo (no toca a los que vuelan; rompe rocas);
  // Terremoto: cada 2 s tiembla toda la pantalla.
  UQ['bulldoze'] = {
    ready: (pl, m) => m.evolved || !!pl.walking,
    cast(pl, m) {
      const dmg = m.dmg * pl.atkFor(m), col = colOf(m);
      if (m.evolved) {
        if (G.Camera.sees(pl.x, pl.y, 200)) { G.Audio.sfx('break'); G.Audio.sfx('thud'); }
        if (!ghost) G.Camera.kick(0.35);
        const cracks = [];
        for (let i = 0; i < 10; i++) cracks.push([pl.x + G.U.rand(-WIPE_W, WIPE_W) * 0.9, pl.y + G.U.rand(-WIPE_H, WIPE_H) * 0.9, Math.random() * TAU, G.U.rand(14, 34)]);
        const maxD = Math.hypot(WIPE_W, WIPE_H);
        if (!ghost) for (const e of G.EnemyMgr.all()) {
          if (e.dead || e.flying || !inWipeBox(pl, e)) continue;
          const k = G.U.clamp(1.5 - G.U.dist(pl.x, pl.y, e.x, e.y) / maxD * 1.6, 0.5, 1.5);
          hit(pl, e, dmg * k, col, e.x - pl.x, e.y - pl.y, 0, m);
        }
        uqField({ sub: 'eq', owner: pl, ghost, m, x: pl.x, y: pl.y, cracks, life: 0.7, pad: 600,
          upd() { return false; },
          drawG(ctx, f, own) {
            ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 3);
            for (const [x, y, a, L] of f.cracks) crackLine(ctx, x - Math.cos(a) * L, y - Math.sin(a) * L * 0.6, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.6, x | 0, 2);
            if (f.t < 0.3 && Math.random() < 0.5) { const c = f.cracks[(Math.random() * f.cracks.length) | 0]; G.FX.burst(c[0], c[1] - 4, '#c6b08a', 3, 70); }
          } });
        return true;
      }
      // Pisotón: un anillo que sale despacio por el suelo.
      const R1 = m.radius * 1.375;
      if (G.Camera.sees(pl.x, pl.y, 40)) { G.Audio.sfx('thud'); G.FX.burst(pl.x, pl.y - 2, '#aa7c3c', 6, 80); G.FX.ring(pl.x, pl.y, 6, R1, '#8a6a3a', 0.42, 4); }
      uqField({ sub: 'stomp', owner: pl, ghost, m, x: pl.x, y: pl.y, life: 0.42, pad: R1 + 20, R1, done: new Set(), dmg, seed: Math.random() * 99,
        upd(f) {
          const r = f.R1 * Math.min(1, f.t / 0.4);
          if (!f.ghost && !f.owner.dead) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, r + 10)) {
            if (e.dead || e.flying || f.done.has(e.id)) continue;
            if (G.U.dist(f.x, f.y, e.x, e.y) < r - 14 - e.r && f.t > 0.05) { f.done.add(e.id); continue; }   // (ya estaba dentro al pasar)
            f.done.add(e.id);
            hit(f.owner, e, f.dmg, '#aa7c3c', e.x - f.x, e.y - f.y, 0, f.m);
          }
          if (!f.ghost) for (const p of G.World.propsInCircle(f.x, f.y, r)) if (!f.done.has('p' + p.id)) { f.done.add('p' + p.id); G.World.damageProp(p, f.dmg * (p.type === 'rock' ? 4 : 1), '#aa7c3c'); }
          return false;
        },
        drawG(ctx, f, own) {
          const r = f.R1 * Math.min(1, f.t / 0.4), a = Math.min(1, (f.life - f.t) * 8);
          ctx.globalAlpha = own * a;
          const n = 10;
          for (let i = 0; i < n; i++) {
            const b = i / n * TAU + f.seed, x = f.x + Math.cos(b) * r, y = f.y + Math.sin(b) * r * 0.6;
            crackLine(ctx, x - Math.sin(b) * 7, y + Math.cos(b) * 4, x + Math.sin(b) * 7, y - Math.cos(b) * 4, i + (f.seed | 0), 2);
          }
          if (Math.random() < 0.4) { const b = Math.random() * TAU; G.FX.sp('rock', 'ground', f.x + Math.cos(b) * r, f.y + Math.sin(b) * r * 0.6 - 4, { vy: -60, grav: 300, life: 0.3, scale: 0.6 }); }
        } });
      return true;
    }
  };

  // Huesomerang: vuelve al sitio desde donde lo lanzas (si lo atrapas ahí, el siguiente sale antes);
  // Ataque Óseo: en el punto más lejano se queda girando como una hélice.
  UQ['bonemerang'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), n = Math.max(1, m.count | 0), sp = m.spread || 0.5, dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const a = pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * sp * Math.min(n, 3));
        G.Projectiles.spawn(Object.assign({
          x: pl.x, y: pl.y, vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed, dmg, r: m.size, life: 6, pierce: 999, color: col,
          hits: new Set(), vis, ghost, owner: pl, ox: pl.x, oy: pl.y, R: m.radius, sp: m.speed, ph: 0, hold: 0, ht: 0, upd: boneUpd
        }, payload(m)));
      }
      return true;
    }
  };
  function boneUpd(p, dt) {
    const m = p.src, o = p.owner;
    if (p.ph === 0) {
      if (G.U.dist2(p.x, p.y, p.ox, p.oy) >= p.R * p.R) {
        p.hits = new Set();
        if (m && m.evolved) { p.ph = 1; p.hx = p.x; p.hy = p.y; p.vx = p.vy = 0.001; }
        else p.ph = 2;
      }
    } else if (p.ph === 1) {
      // Hélice: quieta 1 s golpeando alrededor cada 0,15 s.
      p.x = p.hx; p.y = p.hy; p.vx = Math.cos(p.t * 20) * 0.01; p.vy = Math.sin(p.t * 20) * 0.01;
      if ((p.ht -= dt) <= 0) {
        p.ht = 0.15;
        if (G.Camera.sees(p.x, p.y, 30)) G.FX.ring(p.x, p.y, 4, 30 + p.r, p.color, 0.15, 2);
        if (!p.ghost && !o.dead) hitCircle(o, m, p.x, p.y, 30 + p.r, p.dmg * 0.55, p.color, 20);
      }
      if ((p.hold += dt) >= 1) { p.ph = 2; p.hits = new Set(); }
    } else {
      // Vuelta al sitio desde donde salió; si estás ahí, lo atrapas.
      const [dx, dy] = G.U.norm(p.ox - p.x, p.oy - p.y), s = p.sp * 1.1;
      p.vx = G.U.damp(p.vx, dx * s, 9, dt); p.vy = G.U.damp(p.vy, dy * s, 9, dt);
      if (G.U.dist2(p.x, p.y, o.x, o.y) < (o.r + 30) ** 2) {
        if (!p.ghost && m) {
          m.cdK = 0.5;
          G.FX.ring(o.x, o.y - o.bodyH * 0.5, 4, o.r * 2.4, '#f6e6b8', 0.25, 3);
          G.FX.dmgText(o.x, o.y - o.bodyH - 10, '¡Atrapado!', '#f6e6b8');
          G.Audio.sfx('select');
        }
        return true;
      }
      if (G.U.dist2(p.x, p.y, p.ox, p.oy) < 14 * 14 || p.t > 5) {
        // No estabas: se queda en el suelo un instante.
        if (G.Camera.sees(p.x, p.y, 20)) G.FX.burst(p.x, p.y, '#dcb66c', 5, 60);
        return true;
      }
    }
    return false;
  }

  // Púas: abrojos en abanico delante de ti, de un solo uso (dañan y frenan mucho; no a los que vuelan);
  // Fisura: una grieta los une 3 s y se traga a los pequeños.
  UQ['spikes'] = {
    cast(pl, m) {
      const n = 4 + Math.max(0, m.count | 0), pts = [], dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const a = pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.2) + G.U.rand(-0.06, 0.06), d = G.U.rand(42, 74) * Math.sqrt(pkOf(m).area);
        const x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d;
        pts.push({ x, y, live: true, a: (i * 1.7) % TAU });
      }
      if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('shake');
      if (m.evolved) {
        if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('break');
        uqField({ sub: 'fis', owner: pl, ghost, m, x: pl.x, y: pl.y, pts, life: 3 * pkOf(m).dur, pad: 160, swallowed: 0, done: new Map(), dmg,
          upd(f) {
            if (f.ghost || f.owner.dead) return false;
            const P = f.pts;
            for (let i = 0; i < P.length - 1; i++) {
              const a = P[i], b = P[i + 1];
              for (const e of G.EnemyMgr.queryCircle((a.x + b.x) / 2, (a.y + b.y) / 2, Math.hypot(b.x - a.x, b.y - a.y) / 2 + 20)) {
                if (e.dead || e.flying || f.t - (f.done.get(e.id) ?? -9) < 0.8 || segDist2(a.x, a.y, b.x, b.y, e.x, e.y) > (8 + e.r * 0.5) ** 2) continue;
                f.done.set(e.id, f.t);
                hit(f.owner, e, f.dmg * 2.5, '#6e4c1e', 0, 1, 0, f.m);
                // Los pequeños que quedan tocados caen dentro (como mucho 6 por grieta).
                if (!e.dead && !bigE(e) && !e.champ && e.behavior !== 'thief' && f.swallowed < 6 && e.hp < e.maxHp * 0.4) {
                  f.swallowed++;
                  const d = (e.remote ? e.maxHp : e.hp) + 10;
                  e.hurt(d, '#6e4c1e', 0, 1, 0, null);
                  f.owner.dmgDealt += d; f.m.dealt = (f.m.dealt || 0) + d; f.owner.onDealt(d);
                  if (G.Camera.sees(e.x, e.y, 20)) { G.FX.burst(e.x, e.y, '#3a250c', 12, 90); G.FX.dmgText(e.x, e.y - e.bodyH - 8, '¡Fisura!', '#dcb66c'); }
                }
              }
            }
            return false;
          },
          drawG(ctx, f, own) {
            const a = Math.min(1, (f.life - f.t) * 3, f.t * 8), P = f.pts;
            ctx.globalAlpha = own * a;
            for (let i = 0; i < P.length - 1; i++) crackLine(ctx, P[i].x, P[i].y, P[i + 1].x, P[i + 1].y, i * 13 + (P[0].x | 0), 4);
          } });
        return true;
      }
      uqField({ sub: 'cal', owner: pl, ghost, m, x: pl.x, y: pl.y, pts, life: m.dur || 8, pad: 120, dmg,
        upd(f) {
          let alive = 0;
          for (const c of f.pts) {
            if (!c.live) continue;
            alive++;
            for (const e of G.EnemyMgr.queryCircle(c.x, c.y, 8)) {
              if (e.dead || e.flying) continue;
              c.live = false;
              if (G.Camera.sees(c.x, c.y, 20)) G.FX.burst(c.x, c.y - 2, '#cad6e2', 5, 70);
              if (!f.ghost && !f.owner.dead) { hit(f.owner, e, f.dmg, '#8c9caf', 0, 0, 0, f.m); if (!e.dead) e.applySlow(f.m.slow || 0.6, 1.5); }
              break;
            }
          }
          return alive === 0;
        },
        drawG(ctx, f, own) {
          ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 2, f.t * 8);
          for (const c of f.pts) if (c.live) G.VFX.draw(ctx, 'caltrop', 'steel', c.x, c.y - 2, { scale: 0.9 });
        } });
      trimUq(pl, m.id, 'cal', 4);
      return true;
    }
  };

  // Bucle Arena: arenas movedizas en el blanco (no se sale y se hunden; con tormenta de arena, dos);
  // Fuerza Equina: cada 0,5 s una línea de pisotones sale de la arena.
  UQ['sand-tomb'] = {
    cast(pl, m) {
      const tg = ghost ? G.Projectiles.nearest(G.EnemyMgr.all(), pl.x + Math.cos(pl.aim) * 100, pl.y + Math.sin(pl.aim) * 100, 200) : spotFor(pl, m);
      const spots = [tg ? [tg.x, tg.y] : [pl.x + Math.cos(pl.aim) * 120, pl.y + Math.sin(pl.aim) * 100]];
      if (sandy()) {
        const o = G.EnemyMgr.all().find(e => !e.dead && e !== tg && G.U.dist2(e.x, e.y, pl.x, pl.y) < 300 * 300 && (!tg || G.U.dist2(e.x, e.y, tg.x, tg.y) > 120 * 120));
        if (o) spots.push([o.x, o.y]);
      }
      const dmg = m.dmg * pl.atkFor(m);
      for (const [x, y] of spots) {
        if (G.Camera.sees(x, y, 40)) G.FX.ring(x, y, m.radius, 6, '#dcb66c', 0.4, 3);
        uqField({ sub: 'qs', owner: pl, ghost, m, x, y, r: m.radius, life: m.dur || 3, pad: m.radius + 40, tick: 0.2, n: 0, hoof: 0.5, dmg,
          upd(f, dt) {
            // Los de dentro no salen (lo hace quien tiene los enemigos de verdad).
            for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
              if (!real(e) || e.flying) continue;
              const x = stAdd(e, 'sink', 0.25);
              if (x) { x.f = f; e.slow = Math.max(e.slow, 0.4); e.slowT = Math.max(e.slowT, 0.3); }
            }
            if ((f.tick -= dt) <= 0) {
              f.tick = 0.4; f.n++;
              hitCircle(f.owner, f.m, f.x, f.y, f.r, f.dmg * (1 + 0.2 * (f.n - 1)), '#dcb66c', 0, null, ground);
            }
            if (f.m.evolved && (f.hoof -= dt) <= 0) {
              f.hoof = 0.5;
              const a = Math.random() * TAU;
              uqField({ sub: 'hoof', owner: f.owner, ghost: f.ghost, m: f.m, x: f.x, y: f.y, ca: Math.cos(a), sa: Math.sin(a), i: 0, next: 0, life: 0.5, pad: 200, dmg: f.dmg * 0.8,
                upd(h, dt2) {
                  h.next -= dt2;
                  while (h.next <= 0 && h.i < 5) {
                    h.next += 0.07; h.i++;
                    const x = h.x + h.ca * h.i * 32, y = h.y + h.sa * h.i * 32;
                    if (G.World.isWall(x, y)) { h.i = 5; break; }
                    if (G.Camera.sees(x, y, 30)) { G.FX.burst(x, y - 3, '#dcb66c', 5, 90); G.FX.sp('rock', 'ground', x, y - 4, { vy: -70, grav: 320, life: 0.3, scale: 0.6 }); }
                    hitCircle(h.owner, h.m, x, y, 26, h.dmg, '#aa7c3c', 60, null, ground);
                  }
                  return h.i >= 5;
                } });
            }
            if (Math.random() < dt * 14 && G.Camera.sees(f.x, f.y, 40)) {
              const a = Math.random() * TAU, rr = f.r * G.U.rand(0.4, 1);
              G.FX.px(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.6, '#e8cf8f', { vx: -Math.sin(a) * 70 - Math.cos(a) * 40, vy: Math.cos(a) * 40 - Math.sin(a) * 25, life: 0.45, size: 2 });
            }
            return false;
          },
          drawG(ctx, f, own) {
            const a = Math.min(1, (f.life - f.t) * 2, f.t * 6), now = performance.now() / 1000;
            ctx.globalAlpha = 0.35 * a * own; ctx.fillStyle = '#c9a45c';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, TAU); ctx.fill();
            ctx.globalAlpha = 0.5 * a * own; ctx.fillStyle = '#5a3a0c';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.22, f.r * 0.13, 0, 0, TAU); ctx.fill();
            ctx.globalAlpha = 0.7 * a * own; ctx.strokeStyle = '#f4d890'; ctx.lineWidth = 2;
            for (let k = 0; k < 3; k++) { const rr = f.r * (0.35 + k * 0.25), a0 = -now * (2.6 - k * 0.5) + k * 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.6, 0, a0, a0 + 2.6); ctx.stroke(); }
          } });
      }
      trimUq(pl, m.id, 'qs', 2 * spots.length);
      return true;
    }
  };

  // Magnitud: sale una magnitud de 4 a 10 (de ×0,6 a ×2, ondas más grandes); no toca a los que vuelan.
  // Taladradora: un taladro que perfora en línea, escupe piedras a los lados y hace críticos.
  const MAG_K = { 4: 0.6, 5: 0.8, 6: 1, 7: 1.2, 8: 1.45, 9: 1.7, 10: 2 };
  const MAG_P = [[4, 0.05], [5, 0.15], [6, 0.35], [7, 0.65], [8, 0.85], [9, 0.95], [10, 1]];
  UQ['magnitude'] = {
    cast(pl, m) {
      const dmg = m.dmg * pl.atkFor(m), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), S = pkOf(m).pspd;
      if (m.evolved) {
        const L = ((m.count | 0) + 3) * QSTEP;
        uqField({ sub: 'drill', owner: pl, ghost, m, x: pl.x, y: pl.y, x0: pl.x, y0: pl.y, ca, sa, L, d: 0, tick: 0, spit: 0.1, life: L / (220 * S) + 0.2, pad: 80, dmg,
          upd(f, dt) {
            f.d = Math.min(f.L, f.d + 220 * S * dt);
            f.x = f.x0 + f.ca * f.d; f.y = f.y0 + f.sa * f.d;
            if (G.World.isWall(f.x, f.y)) return true;
            if ((f.tick -= dt) <= 0) {
              f.tick = 0.1;
              hitCircle(f.owner, f.m, f.x, f.y, f.m.radius * 1.3, f.dmg * 0.8, '#8e7a5a', 20, null, ground);
              if (G.Camera.sees(f.x, f.y, 30)) G.FX.burst(f.x, f.y - 3, '#aa7c3c', 3, 80);
            }
            if ((f.spit -= dt) <= 0) {
              // Piedras a los lados.
              f.spit = 0.2;
              for (const sd of [-1, 1]) {
                const a = Math.atan2(f.sa, f.ca) + sd * Math.PI / 2 + G.U.rand(-0.3, 0.3);
                G.Projectiles.spawn(Object.assign({ x: f.x, y: f.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: f.dmg * 0.4, r: 5, life: 0.4, pierce: 0,
                  color: '#8e7a5a', hits: new Set(), vis: { proj: 'rock', pal: 'rock' }, ghost: f.ghost, owner: f.owner }, payload(f.m)));
              }
            }
            return f.d >= f.L;
          },
          drawA(ctx, f, own) {
            ctx.globalAlpha = own;
            G.VFX.draw(ctx, 'drill', 'steel', f.x, f.y - 8, { angle: Math.atan2(f.sa, f.ca), scale: 2, frame: Math.floor(f.t * 20) });
          },
          drawG(ctx, f, own) {
            ctx.globalAlpha = 0.6 * own;
            crackLine(ctx, f.x0 + f.ca * 10, f.y0 + f.sa * 10, f.x, f.y, f.x0 | 0, 3);
          } });
        if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('shot', { kind: 'beam', type: 'ground' });
        return true;
      }
      const r0 = roll(pl, m, 7);
      let mag = 10;
      for (const [k, c] of MAG_P) if (r0 < c) { mag = k; break; }
      const K = MAG_K[mag], n = Math.max(3, (m.count | 0) + mag - 7), rr = m.radius * (0.75 + (mag - 4) * 0.09);
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, trT('Magnitud {x}', mag), mag >= 9 ? '#ff9a3c' : mag >= 7 ? '#ffd23f' : '#dcb66c', mag >= 8);
      if (!ghost) G.Camera.kick(0.04 * mag);
      uqField({ sub: 'mag', owner: pl, ghost, m, x: pl.x, y: pl.y, ca, sa, i: 0, n, next: 0, rr, step: QSTEP * (0.8 + (mag - 4) * 0.06), pad: n * QSTEP + 60, dmg: dmg * K, mag,
        upd(f, dt) {
          f.next -= dt;
          while (f.next <= 0 && f.i < f.n) {
            f.next += 0.07 / pkOf(f.m).pspd; f.i++;
            const x = f.x + f.ca * f.i * f.step, y = f.y + f.sa * f.i * f.step;
            if (G.World.isWall(x, y)) { f.i = f.n; break; }
            if (G.Camera.sees(x, y, 40)) {
              G.FX.ring(x, y, 4, f.rr, '#aa7c3c', 0.3, f.mag >= 8 ? 5 : 3);
              G.FX.burst(x, y - 4, '#aa7c3c', 4 + f.mag, 100 + f.mag * 10);
              if (f.mag >= 8) G.FX.sp('rock', 'ground', x, y - 6, { vy: -120, grav: 380, life: 0.35 });
            }
            hitCircle(f.owner, f.m, x, y, f.rr, f.dmg, '#aa7c3c', f.m.knock || 0, null, ground);
          }
          return f.i >= f.n;
        } });
      if (G.Camera.sees(pl.x, pl.y, 60)) { G.Audio.sfx('thud'); if (mag >= 8) G.Audio.sfx('break'); }
      return true;
    }
  };

  // Hueso Palo: el hueso se clava de pie y golpea a los que pasan (corta lo que preparan);
  // Hueso Sombrío: además, un círculo de fuego fantasma que maldice.
  UQ['bone-club'] = {
    cast(pl, m) {
      const n0 = G.Projectiles.count;
      lob(pl, m);
      const t = !ghost && pl.target && !pl.target.dead ? pl.target : null;
      const ty = t && !pl.manualAim ? t.y : pl.y + Math.sin(pl.aim) * (ghost ? 200 : t ? G.U.clamp(G.U.dist(pl.x, pl.y, t.x, t.y), 60, 360) : 220);
      const list = G.Projectiles.all();
      for (let i = n0; i < list.length; i++) { list[i].ty = ty; list[i].upd = plantUpd; }
      return true;
    }
  };
  function plantUpd(p) {
    if (!(p.vy > 0 && p.y >= p.ty)) return false;
    const m = p.src, o = p.owner;
    if (G.Camera.sees(p.x, p.ty, 30)) { G.FX.burst(p.x, p.ty - 4, '#dcb66c', 8, 110); G.Audio.sfx('thud'); }
    const r = 26 * (p.r / 9);
    uqField({ sub: 'post', owner: o, ghost: p.ghost, m, x: p.x, y: p.ty, r, life: m.dur || 3, pad: 90, log: new Map(), dmg: p.dmg * 0.55, curse: 0.5,
      upd(f, dt) {
        if (!f.ghost && !f.owner.dead) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
          if (e.dead) continue;
          const last = f.log.get(e.id);
          if (last !== undefined && f.t - last < 0.4) continue;
          f.log.set(e.id, f.t);
          hit(f.owner, e, f.dmg, '#dcb66c', e.x - f.x, e.y - f.y, 50, f.m);
        }
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r + 6)) interrupt(e);
        if (f.m.evolved) {
          // Fuego fantasma: daña (de tipo Fantasma) y maldice cada segundo.
          if ((f.curse -= dt) <= 0) {
            f.curse = 0.5;
            const mg = asType(f.m, 'ghost');
            if (!f.ghost && !f.owner.dead) hitCircle(f.owner, mg, f.x, f.y, 70, f.dmg * 0.7, '#27c873');
            flushAs(f.m);
            f.ck = !f.ck;
            if (f.ck) for (const e of inCircle(f.x, f.y, 70)) { const v = stN(e, 'vuln'); if (v < 3) stStack(e, 'vuln', 1, 5, 3); }
          }
          if (Math.random() < dt * 18 && G.Camera.sees(f.x, f.y, 70)) { const a = Math.random() * TAU, rr = G.U.rand(20, 70); G.FX.sp('fire', 'ghostfire', f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.6 - 4, { vy: -50, life: 0.45, angle: -Math.PI / 2 }); }
        }
        return false;
      },
      drawG(ctx, f, own) {
        if (!f.m.evolved) return;
        const a = Math.min(1, (f.life - f.t) * 3, f.t * 6);
        ctx.globalAlpha = 0.22 * a * own; ctx.fillStyle = '#27c873';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 70, 42, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.6 * a * own; ctx.strokeStyle = '#98ffba'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 70, 42, 0, 0, TAU); ctx.stroke();
      },
      drawA(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 3);
        ctx.globalAlpha = own * a;
        // De pie y girando (como una hélice vista de lado).
        G.VFX.draw(ctx, 'bone', f.m.evolved ? 'ghostfire' : 'ground', f.x, f.y - 14, { angle: f.t * 14, scale: 1.5 });
      } });
    trimUq(o, m.id, 'post', 4);
    return true;
  }

  // Bomba Fango: dentro de los charcos, los disparos enemigos salen desviados; Arenas Ardientes: queman y,
  // con sol o en el volcán, duran el doble.
  UQ['mud-bomb'] = {
    field(f, dt) {
      if (f.kind !== 'puddle') return;
      if (!f.uqInit) {
        f.uqInit = true;
        f.col = f.m.evolved ? '#f08a24' : '#7a5222';
        if (f.m.evolved && (sunny() || volcano())) f.life *= 2;
      }
      if ((f.dfl = (f.dfl || 0) - dt) <= 0) {
        f.dfl = 0.2;
        for (const p of G.Projectiles.all()) {
          if (p.friendly || p.mudd) continue;
          const dx = p.x - f.x, dy = (p.y - f.y) / 0.62;
          if (dx * dx + dy * dy > f.r * f.r) continue;
          p.mudd = 1;
          const a = G.U.rand(-0.7, 0.7), c = Math.cos(a), s = Math.sin(a), vx = p.vx;
          p.vx = vx * c - p.vy * s; p.vy = vx * s + p.vy * c;
        }
      }
      if (f.m.evolved && Math.random() < dt * 6 && G.Camera.sees(f.x, f.y, 20)) G.FX.px(f.x + G.U.rand(-f.r, f.r) * 0.7, f.y - 2, '#ffc75a', { vy: -50, life: 0.4 });
    }
  };

  // ======== Volador ========
  const rainy = () => !!(G.Weather && G.Weather.current && G.Weather.current.kind === 'rain');

  // Tornado: los remolinos devuelven los disparos enemigos; Vendaval: un huracán grande que confunde.
  UQ['gust'] = {
    orbit(pl, m, dt, now) {
      let mm = m;
      if (m.evolved) {
        mm = m._gp || (m._gp = Object.create(m));
        mm.count = 1; mm.radius = 100; mm.size = m.size * (rainy() ? 4.4 : 2.4); mm.knock = 60; mm.speed = m.speed * 1.3;
      }
      orbit(pl, mm, dt, now);
      if (mm !== m && mm.dealt) { m.dealt = (m.dealt || 0) + mm.dealt; mm.dealt = 0; }
      const orbs = G.Projectiles.all().filter(p => p.orb && p.owner === pl && p.mid === m.id);
      for (const o of orbs) { o.ds = m.evolved ? (rainy() ? 4 : 3) : 0; if (m.evolved) o.onHit = gustConf; }
      // Disparos enemigos que tocan un remolino: cambian de bando y salen contra ellos.
      if (pl.remote || pl.dead) return true;
      for (const p of G.Projectiles.all()) {
        if (p.friendly) continue;
        for (const o of orbs) {
          if (G.U.dist2(p.x, p.y, o.x, o.y) > (o.r + p.r + 6) ** 2) continue;
          const tg = G.Projectiles.nearest(G.EnemyMgr.all(), p.x, p.y, 400), sp = Math.hypot(p.vx, p.vy) * 1.3 || 300;
          const [nx, ny] = tg ? G.U.norm(tg.x - p.x, tg.y - p.y) : G.U.norm(-p.vx, -p.vy);
          Object.assign(p, { friendly: true, owner: pl, ghost: false, vx: nx * sp, vy: ny * sp, dmg: m.dmg * pl.atkFor(m) * 1.2, hits: new Set(), phits: new Set(),
            pierce: 0, homing: 2, mtype: 'flying', mcat: m.cat, src: m, color: G.U.TYPE_COLOR.flying, vis: { proj: 'wind', pal: 'flying', trail: 'spark' },
            life: p.t + 1.4, knock: 40, burn: 0, poison: 0, slow: 0 });
          G.FX.ring(p.x, p.y - G.LIFT, 3, 16, '#ffffff', 0.2, 2);
          break;
        }
      }
      return true;
    }
  };
  function gustConf(p, e) { if (!e.dead && Math.random() < 0.3) stAdd(e, 'conf', 1.5); }

  // Ataque Ala: golpea y te aparta hacia atrás; Pájaro Osado: al momento vuelves en picado a través de ellos.
  UQ['wing-attack'] = {
    cast(pl, m) {
      melee(pl, m);
      if (ghost) return true;
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), back = m.back || 40, dmg = m.dmg * pl.atkFor(m);
      uqField({ sub: 'recoil', owner: pl, ghost: false, m, x: pl.x, y: pl.y, ca, sa, back, moved: 0, dived: false, life: m.evolved ? 0.62 : 0.14, pad: 200, dmg,
        upd(f, dt) {
          const pl2 = f.owner;
          if (pl2.dead) return true;
          if (f.moved < f.back) {
            const s = Math.min(f.back - f.moved, f.back * dt / 0.12);
            f.moved += s; movePl(pl2, pl2.x - f.ca * s, pl2.y - f.sa * s);
            if (Math.random() < 0.5) G.FX.sp('feather', 'flying', pl2.x, pl2.y - pl2.bodyH * 0.5, { vx: G.U.rand(-60, 60), vy: -40, life: 0.4, spin: 6 });
          }
          if (f.m.evolved && !f.dived && f.t >= 0.3) {
            // Picado en línea a través del blanco (×1,5).
            f.dived = true;
            const t = pl2.target && !pl2.target.dead ? pl2.target : null;
            const a = t ? Math.atan2(t.y - pl2.y, t.x - pl2.x) : Math.atan2(f.sa, f.ca);
            const L = Math.max(120, t ? G.U.dist(pl2.x, pl2.y, t.x, t.y) + 50 : 140), sx = pl2.x, sy = pl2.y;
            movePl(pl2, sx + Math.cos(a) * L, sy + Math.sin(a) * L);
            iframes(pl2, 0.3);
            for (let d = 0; d <= Math.hypot(pl2.x - sx, pl2.y - sy); d += 18) G.FX.sp('fire', 'water', sx + Math.cos(a) * d, sy + Math.sin(a) * d - G.LIFT * 0.6, { life: 0.3, angle: a + Math.PI });
            hitSeg(pl2, f.m, sx, sy, pl2.x, pl2.y, 40, f.dmg * 1.5, '#7fb8ff', 80);
            G.Camera.kick(0.15); G.Audio.sfx('shot', { kind: 'melee', type: 'flying' });
          }
          return false;
        } });
      return true;
    }
  };

  // Golpe Aéreo: apareces detrás del blanco y le cortas en X (queda de espaldas: no dispara);
  // Acróbata: hasta 4 saltos entre enemigos cercanos.
  /** Aparece detrás de e, mirándole. */
  function blinkBehind(pl, e) {
    const [dx, dy] = G.U.norm(e.x - pl.x, e.y - pl.y), d = e.r + pl.r * 0.8 + 8;
    let x = e.x + dx * d, y = e.y + dy * d;
    if (!G.World.isFree(x, y, pl.wr || 12, true)) { x = e.x - dx * d; y = e.y - dy * d; }
    for (let i = 0; i < 4; i++) G.FX.sp('feather', 'flying', pl.x + G.U.rand(-8, 8), pl.y - G.U.rand(4, pl.bodyH), { vx: G.U.rand(-80, 80), vy: G.U.rand(-90, -20), life: 0.45, spin: 8 });
    pl.x = x; pl.y = y;
    G.World.collide(pl);
    pl.aim = Math.atan2(e.y - pl.y, e.x - pl.x);
  }
  function xSlash(pl, m, e, dmg) {
    G.FX.slash(e.x, e.y - G.LIFT * 0.5, pl.aim + 0.785, 26, 1.4, colOf(m), { pal: 'flying' });
    G.FX.slash(e.x, e.y - G.LIFT * 0.5, pl.aim - 0.785, 26, 1.4, colOf(m), { pal: 'flying' });
    G.FX.sp('xmark', 'flying', e.x, e.y - e.bodyH * 0.5, { life: 0.25, scale: 2 });
    const skip = new Set();
    hit(pl, e, dmg, colOf(m), Math.cos(pl.aim), Math.sin(pl.aim), m.knock || 0, m);
    skip.add(e.id);
    hitCircle(pl, m, e.x, e.y, 40, dmg * 0.7, colOf(m), 0, skip);
    if (real(e)) stAdd(e, 'daze', 0.5);
    G.Audio.sfx('shot', { kind: 'melee', type: 'flying' });
  }
  UQ['aerial-ace'] = {
    cast(pl, m) {
      if (ghost) { G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#d2e2ff', 8, 120); return true; }
      const e = tgOf(pl, m, m.radius + 60);
      if (!e) return true;
      const dmg = m.dmg * pl.atkFor(m);
      blinkBehind(pl, e); xSlash(pl, m, e, dmg); iframes(pl, 0.3); G.Camera.kick(0.1);
      if (m.evolved) {
        uqField({ sub: 'acro', owner: pl, ghost: false, m, x: pl.x, y: pl.y, last: e, done: new Set([e.id]), hops: 1, next: 0.13, life: 0.6, pad: 200, dmg,
          upd(f, dt) {
            const pl2 = f.owner;
            if (pl2.dead || f.hops >= 4) return true;
            if ((f.next -= dt) > 0) return false;
            f.next = 0.13;
            let best = null, bd = 170 * 170;
            for (const o of G.EnemyMgr.queryCircle(pl2.x, pl2.y, 170)) { if (o.dead || f.done.has(o.id)) continue; const d = G.U.dist2(pl2.x, pl2.y, o.x, o.y); if (d < bd) { bd = d; best = o; } }
            if (!best) return true;
            f.done.add(best.id); f.hops++;
            const sx = pl2.x, sy = pl2.y;
            blinkBehind(pl2, best); xSlash(pl2, f.m, best, f.dmg); iframes(pl2, 0.2);
            for (let d = 0; d < 1; d += 0.2) G.FX.sp('feather', 'flying', sx + (pl2.x - sx) * d, sy + (pl2.y - sy) * d - G.LIFT * 0.5, { life: 0.3, angle: Math.atan2(pl2.y - sy, pl2.x - sx) });
            return false;
          } });
      }
      return true;
    }
  };

  // Remolino: cono de viento que manda lejos y da miedo; Huracán: un tornado que levanta y dispersa.
  UQ['whirlwind'] = {
    cast(pl, m) {
      const col = colOf(m), dmg = m.dmg * pl.atkFor(m);
      if (m.evolved) {
        uqField({ sub: 'tor', owner: pl, ghost, m, x: pl.x, y: pl.y, r: 56 * Math.sqrt(pkOf(m).area), life: 3 * pkOf(m).dur, pad: 140, up: [], seen: new Set(), dmg,
          upd(f, dt) {
            for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r * 1.8)) {
              if (e.dead) continue;
              const d = G.U.dist(f.x, f.y, e.x, e.y);
              if (real(e) && !bigE(e) && !(e.x2 && e.x2.air)) {
                if (d > f.r * 0.6) { const k = Math.min(d, 160 * dt); e.x += (f.x - e.x) / d * k; e.y += (f.y - e.y) / d * k; }   // atrae
                else if (!f.seen.has(e.id)) {
                  // Dentro: gira en el aire y sale lanzado a un sitio al azar.
                  const a = Math.random() * TAU, R = G.U.rand(120, 220), x = stAdd(e, 'air', 0.8, { h: 36, k: 0, cx: f.x, cy: f.y, cr: 16, ang: a });
                  if (x) { x.dest = [f.x + Math.cos(a) * R, f.y + Math.sin(a) * R * 0.8]; f.up.push({ e, t: 0, x }); }
                }
              }
              if (d <= f.r * 0.6 && !f.seen.has(e.id)) {
                f.seen.add(e.id);
                if (!real(e) || bigE(e)) f.up.push({ e, t: 0, x: null });
              }
            }
            for (let i = f.up.length - 1; i >= 0; i--) {
              const u = f.up[i];
              u.t += dt;
              if (u.x && u.t >= 0.6 && u.x.cx != null) { u.x.cx = null; u.x.tx = u.x.dest[0]; u.x.ty = u.x.dest[1]; u.x.t = 0.22; }
              if (u.t >= 0.82) {
                f.up.splice(i, 1);
                if (!u.e.dead && G.Camera.sees(u.e.x, u.e.y, 30)) G.FX.burst(u.e.x, u.e.y, '#d2e2ff', 6, 90);
                if (!f.ghost && !f.owner.dead && !u.e.dead) hit(f.owner, u.e, f.dmg, col, 0, 1, 0, f.m);
              }
            }
            if ((f.core = (f.core || 0) - dt) <= 0) { f.core = 0.4; hitCircle(f.owner, f.m, f.x, f.y, f.r, f.dmg * 0.5, col); }
            if (f.seen.size > 200) f.seen.clear();
            return false;
          },
          drawA(ctx, f, own) {
            const a = Math.min(1, (f.life - f.t) * 3, f.t * 6);
            ctx.globalAlpha = own * a * 0.85;
            G.VFX.draw(ctx, 'tornado', 'flying', f.x, f.y - 30, { scale: 3, frame: Math.floor(f.t * 14) });
          },
          drawG(ctx, f, own) {
            ctx.globalAlpha = 0.2 * own; ctx.fillStyle = '#93b2ff';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.5, 0, 0, TAU); ctx.fill();
          } });
        trimUq(pl, m.id, 'tor', 2);
        if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('surge');
        return true;
      }
      // Cono de 90° (hacia donde apuntas).
      const half = 0.785, far = 260 * ((m.knock || 360) / 360);
      G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim, m.radius, half * 2, col, { pal: 'flying' });
      for (let i = 0; i < 9; i++) {
        const a = pl.aim + (i / 8 - 0.5) * half * 2;
        G.FX.sp(i % 3 ? 'wind' : 'leaf', i % 3 ? 'flying' : 'grass', pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.8 - G.LIFT * 0.5,
                { vx: Math.cos(a) * m.radius * 3.4, vy: Math.sin(a) * m.radius * 2.6, life: 0.32, spin: 8 });
      }
      for (const e of inCircle(pl.x, pl.y, m.radius)) {
        if (!inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
        if (!ghost) hit(pl, e, dmg, col, e.x - pl.x, e.y - pl.y, 0, m);
        if (!real(e) || bigE(e)) continue;
        const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y), d = Math.max(0, far - G.U.dist(pl.x, pl.y, e.x, e.y));
        stAdd(e, 'slide', 0.45, { tx: e.x + nx * d, ty: e.y + ny * d * 0.85, t: 0.45 });
        stAdd(e, 'fear', m.fear || 1.5);
      }
      if (!ghost) G.Camera.kick(0.1);
      if (G.Camera.sees(pl.x, pl.y, 40)) G.Audio.sfx('surge');
      return true;
    }
  };

  // Tajo Aéreo: atraviesan a todos en fila y cortan lo que preparan; Ataque Aéreo: una enorme que no falla.
  UQ['air-slash'] = {
    pp: () => ({ onHit: (p, e) => { interrupt(e); p.homing = 0; } }),
    cast(pl, m) {
      if (!m.evolved) return false;
      const n = Math.max(1, m.count | 0), dmg = m.dmg * pl.atkFor(m) * Math.max(2, n) * 0.85;
      G.FX.ring(pl.x, pl.y - G.LIFT * 0.5, pl.r * 3, pl.r, '#ffe172', 0.5, 3);
      uqField({ sub: 'aa', owner: pl, ghost, m, x: pl.x, y: pl.y, life: 0.5, pad: 60, dmg,
        upd(f) {
          const pl2 = f.owner;
          f.x = pl2.x; f.y = pl2.y;
          if (Math.random() < 0.5) G.FX.px(pl2.x + G.U.rand(-20, 20), pl2.y - G.U.rand(0, pl2.bodyH), '#ffe172', { vx: 0, vy: -50, life: 0.3, size: 2 });
          if (f.t < 0.48) return false;
          const a = pl2.aim;
          G.Projectiles.spawn(Object.assign({
            x: pl2.x, y: pl2.y, vx: Math.cos(a) * f.m.speed * 1.2, vy: Math.sin(a) * f.m.speed * 1.2, dmg: f.dmg, r: f.m.size * 2.5, ds: 3.5, life: 2.4,
            pierce: 99, color: '#ffe172', homing: 0, hits: new Set(), vis: { proj: 'crescent', pal: 'gold', trail: 'spark' }, ghost: f.ghost, owner: pl2,
            crit2: 0.4, upd: seekNew
          }, payload(f.m), { onHit: (p, e) => interrupt(e) }));
          G.Audio.sfx('shot', { kind: 'beam', type: 'flying' });
          return true;
        } });
      return true;
    }
  };
  /** Persigue al enemigo más cercano que aún no ha tocado (no da vueltas alrededor del que ya cortó). */
  function seekNew(p, dt) {
    let best = null, bd = 420 * 420;
    for (const e of G.EnemyMgr.queryCircle(p.x, p.y, 420)) {
      if (e.dead || p.hits.has(e.id)) continue;
      const d = G.U.dist2(p.x, p.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const sp = Math.hypot(p.vx, p.vy), [nx, ny] = G.U.norm(best.x - p.x, best.y - p.y);
      p.vx = G.U.damp(p.vx, nx * sp, 10, dt); p.vy = G.U.damp(p.vy, ny * sp, 10, dt);
    }
    return false;
  }

  // Ala Bis: las aves bajan en picado de dos en dos sobre el mismo blanco; Ala Mortífera: cada picado cura.
  UQ['dual-wingbeat'] = {
    cast(pl, m) {
      const n = Math.max(1, m.count | 0), dmg = m.dmg * pl.atkFor(m);
      let f = findUq(pl, m.id, 'birds');
      if (f) { f.t = 0; f.life = m.dur || 8; f.dmg = dmg; f.m = m; }
      else f = uqField({ sub: 'birds', owner: pl, ghost, m, x: pl.x, y: pl.y, life: m.dur || 8, birds: [], next: 0.4, pad: 260, dmg,
        upd(f, dt) {
          const pl2 = f.owner, mm = f.m, ring = mm.ring || 150, sp = mm.speed || 1.7;
          if (pl2.dead) return true;
          f.x = pl2.x; f.y = pl2.y;
          for (const b of f.birds) {
            const rx = pl2.x + Math.cos(b.a) * ring, ry = pl2.y + Math.sin(b.a) * ring * 0.7;
            if (b.st === 'ring') { b.a += sp * b.dir * dt; b.x = rx; b.y = ry; continue; }
            b.k += dt;
            if (b.st === 'wait') { b.a += sp * b.dir * dt; b.x = rx; b.y = ry; if (b.k >= b.delay) { b.st = 'dive'; b.k = 0; b.x0 = b.x; b.y0 = b.y; } continue; }
            if (b.st === 'dive') {
              const e = b.e, tx = e && !e.dead ? e.x : b.tx, ty = e && !e.dead ? e.y : b.ty, k = Math.min(1, b.k / 0.22);
              b.tx = tx; b.ty = ty;
              b.x = b.x0 + (tx - b.x0) * k; b.y = b.y0 + (ty - BIRD_H * 0.3 - b.y0) * k * k;
              if (k >= 1) {
                b.st = 'back'; b.k = 0; b.x0 = b.x; b.y0 = b.y;
                if (G.Camera.sees(tx, ty, 30)) { G.FX.burst(tx, ty - 8, mm.evolved ? '#ff4b5c' : '#d2e2ff', 8, 130); G.Audio.sfx('thud'); }
                if (!f.ghost && e && !e.dead) {
                  const hp0 = e.hp;
                  hit(pl2, e, f.dmg, mm.evolved ? '#a3162e' : colOf(mm), 0, 1, 30, mm);
                  const sk = new Set([e.id]);
                  hitCircle(pl2, mm, tx, ty, 26, f.dmg * 0.6, colOf(mm), 0, sk);
                  if (mm.evolved) pl2.heal(Math.max(1, (hp0 - Math.max(0, e.hp)) || f.dmg) * 0.06);
                }
              }
              continue;
            }
            if (b.st === 'back') {
              const k = Math.min(1, b.k / 0.3);
              b.x = b.x0 + (rx - b.x0) * k; b.y = b.y0 + (ry - b.y0) * k;
              b.a += sp * b.dir * dt;
              if (k >= 1) b.st = 'ring';
            }
          }
          // Cada rate·1,4 s una pareja (las que estén en su círculo) baja sobre el enemigo más cercano a ellas.
          if ((f.next -= dt) <= 0) {
            f.next = (mm.rate || 0.6) * 1.1;
            const free = f.birds.filter(b => b.st === 'ring').slice(0, 2);
            if (free.length) {
              const mx = free.reduce((s, b) => s + b.x, 0) / free.length, my = free.reduce((s, b) => s + b.y, 0) / free.length;
              const e = G.Projectiles.nearest(G.EnemyMgr.all(), mx, my, 240) || G.Projectiles.nearest(G.EnemyMgr.all(), pl2.x, pl2.y, ring + 120);
              if (e) free.forEach((b, i) => { b.st = 'wait'; b.k = 0; b.delay = i * 0.08; b.e = e; b.tx = e.x; b.ty = e.y; });
            }
          }
          return false;
        },
        drawG(ctx, f, own) {
          ctx.globalAlpha = 0.22 * own; ctx.fillStyle = '#000';
          for (const b of f.birds) { ctx.beginPath(); ctx.ellipse(b.x || f.x, (b.y || f.y) + (b.st === 'ring' || b.st === 'wait' ? 0 : 0), 7, 3, 0, 0, TAU); ctx.fill(); }
        },
        drawA(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 3, f.t * 6), now = performance.now() / 1000, pal = f.m.evolved ? 'yveltal' : 'flying';
          ctx.globalAlpha = own * a;
          for (const b of f.birds) {
            if (b.x == null) continue;
            const diving = b.st === 'dive', h = diving || b.st === 'back' ? BIRD_H * (b.st === 'dive' ? 1 - Math.min(1, b.k / 0.22) : Math.min(1, b.k / 0.3)) : BIRD_H;
            const vx = diving ? (b.tx - b.x0) : -Math.sin(b.a) * b.dir, vy = diving ? (b.ty - b.y0) : Math.cos(b.a) * 0.7 * b.dir;
            const flip = vx < 0, ang = flip ? Math.atan2(-vy, -vx) : Math.atan2(vy, vx);
            G.VFX.draw(ctx, 'bird', pal, b.x, b.y - h, { angle: ang, flip, scale: f.m.evolved ? 1.5 : 1, frame: Math.floor(now * 9 + b.dir) });
            if (diving && Math.random() < 0.6) G.FX.trail('spark', pal, b.x, b.y - h, vx, vy);
          }
        } });
      while (f.birds.length > n) f.birds.pop();
      for (let i = f.birds.length; i < n; i++) f.birds.push({ a: pl.aim + i * TAU / n, dir: i % 2 ? -1 : 1, st: 'ring', k: 0 });
      return true;
    }
  };

  // Danza Pluma: las plumas dejan emplumados (−40 % de ataque y frenados); Aerochorro: cada 8 plumas, un rayo de aire.
  UQ['feather-dance'] = {
    pp: m => ({ onHit: (p, e) => {
      if (!real(e) || e.dead) { if (e.remote && !e.dead) stAdd(e, 'weak', 3); return; }     // (en una copia, sólo se ve)
      // Ataque bajo: el mismo estado que el de Hada y Siniestro ('atk' de e.s3), para que no se pisen al
      // volver a su daño (inflict ya lo deja a la mitad en los jefes; aquí, también en los legendarios).
      inflict(e, 'atk', 3, (m.weak || 0.4) * (e.legend && !big3(e) ? 0.5 : 1));
    }, end: p => {
      const m = p.src;
      if (!m || !m.evolved) return;
      m.fd = (m.fd || 0) + 1;
      if (m.fd % 8 === 0) aeroblast(p.owner, m, p.ghost);
    } })
  };
  /** Aerochorro: un rayo de aire en espiral desde ti hacia donde hay más enemigos. */
  function aeroblast(pl, m, gh) {
    if (pl.dead) return;
    let best = pl.aim, bn = -1;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, ca = Math.cos(a), sa = Math.sin(a);
      let n = 0;
      for (const e of G.EnemyMgr.queryCircle(pl.x + ca * 150, pl.y + sa * 150, 170)) if (!e.dead && segDist2(pl.x, pl.y, pl.x + ca * 300, pl.y + sa * 300, e.x, e.y) < (22 + e.r) ** 2) n++;
      if (n > bn) { bn = n; best = a; }
    }
    const L = rayLen(pl.x, pl.y, best, 300), ex = pl.x + Math.cos(best) * L, ey = pl.y + Math.sin(best) * L;
    G.FX.beam(pl.x, pl.y - G.LIFT, best, L, 30, '#d2e2ff', { pal: 'flying', beam: 'wind' });
    for (let d = 20; d < L; d += 30) G.FX.sp('wind', 'flying', pl.x + Math.cos(best) * d, pl.y + Math.sin(best) * d - G.LIFT, { life: 0.3, spin: 12, scale: 1.5 });
    if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('shot', { kind: 'beam', type: 'flying' });
    if (!gh) { const g = ghost; ghost = false; try { hitSeg(pl, m, pl.x, pl.y, ex, ey, 36, m.dmg * pl.atkFor(m) * 4, '#d2e2ff', 60); } finally { ghost = g; } G.Camera.kick(0.12); }
  }

  // ======== Bicho ========

  // Picadura: cada mordisco cura (máx. 3 % por s) y a veces sueltan una baya; Tijera X: marca para un crítico seguro.
  UQ['bug-bite'] = {
    cast(pl, m) {
      melee(pl, m);
      if (m.evolved) {
        const x = pl.x + Math.cos(pl.aim) * m.radius * 0.6, y = pl.y + Math.sin(pl.aim) * m.radius * 0.6 - G.LIFT * 0.5;
        G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim + 0.6, m.radius * 0.8, 1.2, colOf(m), { pal: 'bug' });
        G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim - 0.6, m.radius * 0.8, 1.2, colOf(m), { pal: 'bug' });
        G.FX.sp('xmark', 'bug', x, y, { life: 0.3, scale: 2.5 });
      }
      return true;
    },
    hit(pl, e, m) {
      // Cura: 1 % de la vida máxima por mordisco, como mucho un 3 % por segundo.
      const now = G.Game.st.time, b = pl.uqBite || (pl.uqBite = { t: 0, n: 0 });
      if (now - b.t > 1) { b.t = now; b.n = 0; }
      if (b.n < 0.03) { b.n += 0.01; pl.heal(pl.maxHp * 0.01); }
      if (m.evolved && !e.dead) stAdd(e, 'markX', 6, { by: pl });
      if (e.dead && !e.remote && Math.random() < 0.08 && G.Pickups) G.Pickups.drop('heal', e.x, e.y);
    }
  };

  // Disparo Demora: ata a varios enemigos entre sí (no se separan más de 60 px) y los frena;
  // Red Viscosa: además, una red en el suelo que atrapa al que la pisa.
  UQ['string-shot'] = {
    cast(pl, m) {
      const n = Math.max(2, (m.count | 0) + 1), list = [], dmg = m.dmg * pl.atkFor(m), R = 240;
      const first = ghost ? G.Projectiles.nearest(G.EnemyMgr.all(), pl.x + Math.cos(pl.aim) * 80, pl.y + Math.sin(pl.aim) * 80, R) : tgOf(pl, m, R);
      if (!first) return true;
      list.push(first);
      while (list.length < n) {
        const last = list[list.length - 1];
        let best = null, bd = 200 * 200;
        for (const o of G.EnemyMgr.queryCircle(last.x, last.y, 200)) { if (o.dead || list.includes(o)) continue; const d = G.U.dist2(last.x, last.y, o.x, o.y); if (d < bd) { bd = d; best = o; } }
        if (!best) break;
        list.push(best);
      }
      // Los hilos salen de ti hacia cada uno.
      for (const e of list) {
        const a = Math.atan2(e.y - pl.y, e.x - pl.x), d = G.U.dist(pl.x, pl.y, e.x, e.y);
        G.FX.sp('web', 'silk', e.x, e.y - e.bodyH * 0.5, { life: 0.35, scale: 1.5, spin: 4 });
        for (let k = 10; k < d; k += 22) G.FX.px(pl.x + Math.cos(a) * k, pl.y + Math.sin(a) * k - G.LIFT, '#ffffff', { life: 0.2 });
        if (!ghost) { hit(pl, e, dmg, '#e2e2ea', 0, 0, 0, m); if (!e.dead) e.applySlow(m.slow || 0.5, 0.6); }
      }
      // (Uno solo: queda atado al suelo donde está.)
      const anchor = list.length === 1 ? { x: first.x, y: first.y, r: 1, dead: false, fixed: true } : null;
      uqField({ sub: 'tie', owner: pl, ghost, m, x: first.x, y: first.y, list: anchor ? [anchor, first] : list, life: m.dur || 4, pad: 300, slowT: 0, L: 60, dmg,
        upd(f, dt) {
          const L = f.list;
          let alive = 0;
          for (let i = 0; i < L.length - 1; i++) {
            const a = L[i], b = L[i + 1];
            if (a.dead || b.dead) continue;
            alive++;
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d <= f.L || d < 1) continue;
            // Se arrastran: los dos se acercan (un jefe o el suelo no se mueven).
            const ex = (d - f.L) / d, ma = real(a) && !bigE(a) && !a.fixed, mb = real(b) && !bigE(b);
            const ka = ma && mb ? 0.5 : ma ? 1 : 0, kb = ma && mb ? 0.5 : mb ? 1 : 0;
            a.x += dx * ex * ka; a.y += dy * ex * ka; b.x -= dx * ex * kb; b.y -= dy * ex * kb;
          }
          if (!f.ghost && (f.slowT -= dt) <= 0) {
            f.slowT = 0.5;
            for (const e of L) if (!e.fixed && !e.dead) { e.applySlow(f.m.slow || 0.5, 0.6); if (!f.owner.dead) hit(f.owner, e, f.dmg * 0.2, '#e2e2ea', 0, 0, 0, f.m); }
          }
          f.x = L[0].x; f.y = L[0].y;
          return alive === 0;
        },
        drawA(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 3);
          ctx.globalAlpha = 0.85 * a * own;
          for (let i = 0; i < f.list.length - 1; i++) {
            const p = f.list[i], q = f.list[i + 1];
            if (p.dead || q.dead) continue;
            const y0 = p.y - (p.fixed ? 0 : (p.bodyH || 0) * 0.5 + (p.jumpLift || 0)), y1 = q.y - (q.bodyH || 0) * 0.5 - (q.jumpLift || 0);
            pxLine(ctx, p.x, y0, (p.x + q.x) / 2, (y0 + y1) / 2 + 6, 1.5, '#f8f8ff');
            pxLine(ctx, (p.x + q.x) / 2, (y0 + y1) / 2 + 6, q.x, y1, 1.5, '#f8f8ff');
          }
        } });
      trimUq(pl, m.id, 'tie', 3);
      if (m.evolved) {
        const cx = list.reduce((s, e) => s + e.x, 0) / list.length, cy = list.reduce((s, e) => s + e.y, 0) / list.length;
        uqField({ sub: 'web', owner: pl, ghost, m, x: cx, y: cy, r: 110 * Math.sqrt(pkOf(m).area), life: 6 * pkOf(m).dur, pad: 140, seen: new Set(), tick: 0, dmg,
          upd(f, dt) {
            if ((f.tick -= dt) > 0) return false;
            f.tick = 0.3;
            for (const e of inCircle(f.x, f.y, f.r)) {
              if (!f.seen.has(e.id)) { f.seen.add(e.id); if (real(e)) stAdd(e, 'root', 1); }      // el primer paso: atrapado 1 s
              if (!f.ghost) e.applySlow(0.6, 0.4);
            }
            hitCircle(f.owner, f.m, f.x, f.y, f.r, f.dmg * 0.12, '#e2e2ea');
            return false;
          },
          drawG(ctx, f, own) {
            // (La red se pinta una vez en su lienzo y luego sólo se copia.)
            const a = Math.min(1, (f.life - f.t) * 2, f.t * 5), R = Math.round(f.r);
            const cv = webCanvas(R);
            ctx.globalAlpha = 0.6 * a * own;
            ctx.drawImage(cv, Math.round(f.x - R - 2), Math.round(f.y - R * 0.6 - 2));
          } });
        trimUq(pl, m.id, 'web', 2);
      }
      if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('grass');
      return true;
    }
  };

  // Zumbido: cada pulso baja la defensa (vulnerable +1, hasta 3); con 3, además los aparta;
  // Enjambre: pica el doble a los que ya están al mínimo.
  UQ['bug-buzz'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), dmg = m.dmg * pl.atkFor(m);
      G.FX.ring(pl.x, pl.y, m.radius * 0.5, m.radius, col, 0.28, 2);
      for (let i = 0; i < (m.evolved ? 9 : 5); i++) {
        const a = Math.random() * TAU, r = m.radius * G.U.rand(0.4, 1);
        if (m.evolved) G.FX.px(pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r * 0.8 - G.LIFT * 0.5, '#1a1a10', { vx: -Math.sin(a) * 120, vy: Math.cos(a) * 90, life: 0.4, size: 2 });
        else G.FX.sp(vis.aura, vis.pal, pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r * 0.8 - G.LIFT * 0.5, { vx: -Math.sin(a) * 70, vy: Math.cos(a) * 55, life: 0.42 });
      }
      for (const e of inCircle(pl.x, pl.y, m.radius)) {
        const v = stN(e, 'vuln'), full = v >= 3;
        if (!ghost) hit(pl, e, dmg * (m.evolved && full ? 1.6 : 1), col, e.x - pl.x, e.y - pl.y, full ? 120 : 0, m);
        if (!e.dead && !full) stStack(e, 'vuln', 1, 5, 5);
        else if (!e.dead) e.x2.vuln.t = Math.max(e.x2.vuln.t, 5);
      }
      if (!ghost) for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, dmg, col);
      return true;
    }
  };

  // Rayo Señal: rebota, confunde y señala (tu puntería y tus aliados van a por ellos);
  // Megacuerno: una embestida con el cuerno, más larga por cada señalado en la línea.
  UQ['signal-beam'] = {
    pp: m => ({ onHit: (p, e) => {
      if (e.dead) return;
      confuseOn(e, m, 0.15, 1.5);
      if (!p.ghost && p.owner === G.Game.player) { stAdd(e, 'mark', 5, { by: p.owner }); MARKED.add(e); }
    } }),
    cast(pl, m) {
      if (!m.evolved) return false;
      if (ghost) { G.FX.sp('horn', 'gold', pl.x + Math.cos(pl.aim) * 20, pl.y + Math.sin(pl.aim) * 20 - G.LIFT * 0.5, { life: 0.25, angle: pl.aim, scale: 2 }); return true; }
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
      let n = 0;
      for (const e of G.EnemyMgr.queryCircle(pl.x + ca * 160, pl.y + sa * 160, 180)) if (!e.dead && e.x2 && e.x2.mark && segDist2(pl.x, pl.y, pl.x + ca * 320, pl.y + sa * 320, e.x, e.y) < (30 + e.r) ** 2) n++;
      const L = Math.min(320, 120 + 40 * n), sx = pl.x, sy = pl.y;
      let len = 0;
      for (let d = 8; d <= L; d += 8) { if (!G.World.isFree(sx + ca * d, sy + sa * d, (pl.wr || pl.r) * 0.8, true)) break; len = d; }
      pl.x = sx + ca * len; pl.y = sy + sa * len;
      G.World.collide(pl);
      iframes(pl, 0.3);
      for (let d = 0; d <= len; d += 20) G.FX.sp('streak', 'bug', sx + ca * d, sy + sa * d - G.LIFT * 0.6, { life: 0.22, angle: pl.aim });
      G.FX.sp('horn', 'gold', pl.x + ca * 16, pl.y + sa * 16 - G.LIFT * 0.5, { life: 0.3, angle: pl.aim, scale: 2.5 });
      hitSeg(pl, m, sx, sy, pl.x, pl.y, 40, m.dmg * pl.atkFor(m), '#cbe86c', 80, null, e => (e.x2 && e.x2.mark ? 1.5 : 1));
      G.Camera.kick(0.14);
      return true;
    }
  };

  // Ida y Vuelta: cruzas y vuelves (dos pasadas); al volver, el siguiente ataque de tu vínculo sale al momento.
  // Sanguijuela: te cura un 2 % por enemigo atravesado (hasta un 10 % por pasada).
  UQ['u-turn'] = {
    cast(pl, m) {
      if (ghost) { dash(pl, m); return true; }
      const sx = pl.x, sy = pl.y;
      m.uqPass = 0;
      dash(pl, m);
      leech(pl, m);
      uqField({ sub: 'back', owner: pl, ghost: false, m, x: pl.x, y: pl.y, sx, sy, life: 0.4, pad: 200, done: false,
        upd(f) {
          const pl2 = f.owner;
          if (pl2.dead) return true;
          if (f.t < 0.16) return false;
          // De vuelta a donde estabas, golpeando otra vez el camino.
          const x0 = pl2.x, y0 = pl2.y;
          movePl(pl2, f.sx, f.sy);
          iframes(pl2, 0.25);
          const a = Math.atan2(pl2.y - y0, pl2.x - x0), L = Math.hypot(pl2.x - x0, pl2.y - y0);
          for (let d = 0; d <= L; d += 22) G.FX.sp('streak', 'bug', x0 + Math.cos(a) * d, y0 + Math.sin(a) * d - G.LIFT * 0.6, { life: 0.22, angle: a });
          f.m.uqPass = 0;
          hitSeg(pl2, f.m, x0, y0, pl2.x, pl2.y, f.m.width || 34, f.m.dmg * pl2.atkFor(f.m), colOf(f.m), f.m.knock || 0);
          leech(pl2, f.m);
          // El siguiente de tu vínculo, ya.
          for (const o of pl2.activeGroup()) if (o !== f.m && o.kind !== 'orbit' && o.t > 0.05) { o.t = 0.05; o.castAt = performance.now(); }
          G.Audio.sfx('shot', { kind: 'melee', type: 'bug' });
          return true;
        } });
      return true;
    },
    hit(pl, e, m) { m.uqPass = (m.uqPass | 0) + 1; }
  };
  /** Sanguijuela: lo que cura la pasada (2 % por enemigo, hasta 5). */
  function leech(pl, m) {
    if (!m.evolved || !(m.uqPass > 0)) return;
    pl.heal(pl.maxHp * 0.02 * Math.min(5, m.uqPass));
    for (let i = 0; i < Math.min(5, m.uqPass); i++) G.FX.px(pl.x + G.U.rand(-30, 30), pl.y - G.U.rand(0, 30), '#ff4b5c', { vx: G.U.rand(-20, 20), vy: -40, life: 0.4, size: 2 });
  }

  // Pin Misil: las agujas se clavan; con cinco, estallan; Aguijón Letal: rematar con ellas sube tu ataque para toda la partida.
  UQ['pin-missile'] = {
    pp: m => ({ onHit: (p, e, d) => {
      if (p.ghost) return;
      const o = p.owner;
      if (pinKO(o, m, e)) return;
      const x = stStack(e, 'pins', 1, 9, 4, { by: o, d: p.dmg });
      if (x && x.n >= 5) {
        const n = x.n; x.n = 0;
        if (G.Camera.sees(e.x, e.y, 30)) { G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#cbe86c', 14, 180); G.FX.ring(e.x, e.y, 4, 30, '#90b82a', 0.25, 3); G.Audio.sfx('break'); }
        hit(o, e, p.dmg * 0.6 * n, '#90b82a', 0, 0, 0, m);
        for (const q of G.EnemyMgr.queryCircle(e.x, e.y, 26)) if (q !== e && !q.dead) hit(o, q, p.dmg * 0.6 * n * 0.4, '#90b82a', q.x - e.x, q.y - e.y, 30, m);
        pinKO(o, m, e);
      }
    } })
  };
  /** Aguijón Letal: si ha caído, +1 pila de ataque físico para toda la partida (hasta 10). → true si ha caído. */
  function pinKO(pl, m, e) {
    const ko = e.dead || (e.remote && e.hp <= 1);
    if (!ko || !m.evolved || pl.remote || !pl.addBuff) return ko;
    const b = pl.buffs && pl.buffs.patk, s = b && b.src && b.src.find(o => o.id === 'pin-missile*');
    if (s && s.n >= 10) return ko;
    pl.addBuff('patk', 0.03, 1e6, 10, 'pin-missile*');
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 14, '+ATQ', '#ffd23f', true);
    G.FX.ring(pl.x, pl.y, 4, pl.r * 3, '#ffd23f', 0.35, 3);
    return ko;
  }

  // Al Ataque: las abejas van juntas a tu blanco, en formación, con mucho crítico; Escaramuza: una colmena que suelta abejas.
  UQ['attack-order'] = {
    allyTarget(f, pl) {
      const t = f.ghost ? null : pl.uqLast;
      return t && !t.dead && G.U.dist2(pl.x, pl.y, t.x, t.y) < 320 * 320 ? t : null;
    },
    cast(pl, m) {
      const n0 = fields.length;
      allies(pl, m);
      let i = 0;
      for (let k = n0; k < fields.length; k++) {
        const f = fields[k];
        if (f.kind !== 'ally') continue;
        const a = i++ * TAU / Math.max(1, m.count | 0);
        f.ox = Math.cos(a) * 14; f.oy = Math.sin(a) * 9;
      }
      if (m.evolved && !findUq(pl, m.id, 'hive')) {
        uqField({ sub: 'hive', owner: pl, ghost, m, x: pl.x + G.U.rand(-20, 20), y: pl.y + G.U.rand(10, 20), life: 6 * pkOf(m).dur, pad: 40, next: 1,
          upd(f, dt) {
            if (f.owner.dead) return true;
            if ((f.next -= dt) <= 0) {
              f.next = 1;
              const pl2 = f.owner, mm = f.m, a = Math.random() * TAU;
              fields.push({ kind: 'ally', owner: pl2, ghost: f.ghost, m: mm, col: colOf(mm), vis: G.VFX.forMove(mm), x: f.x, y: f.y - 8,
                vx: Math.cos(a) * mm.speed, vy: Math.sin(a) * mm.speed, t: 0, life: 3, r: mm.size || 7, tgt: null, look: 0, wa: a, hitLog: new Map(),
                ph: Math.random() * TAU, pad: 40, dmg: mm.dmg * pl2.atkFor(mm), anim: null, ox: Math.cos(a) * 14, oy: Math.sin(a) * 9 });
              trimOld('ally', pl2, mm.id, (mm.count | 0) + 4);
              if (G.Camera.sees(f.x, f.y, 30)) G.FX.burst(f.x, f.y - 10, '#ffe172', 4, 60);
            }
            return false;
          },
          drawA(ctx, f, own) {
            ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 3, f.t * 6);
            G.VFX.draw(ctx, 'hive', 'gold', f.x, f.y - 10, { scale: 1.5 });
          },
          drawG(ctx, f, own) { ctx.globalAlpha = 0.3 * own; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 10, 4, 0, 0, TAU); ctx.fill(); } });
      }
      return true;
    }
  };

  // ======== Lucha ========
  /** Baja tu defensa un rato (A Bocajarro): se devuelve sola. */
  function guardDown(pl, k, t) {
    if (pl.remote) return;
    pl.dmgReduce -= k;
    uqField({ sub: 'guard', owner: pl, ghost: false, m: null, x: pl.x, y: pl.y, life: t, pad: 0, k,
      upd(f) { if (f.t >= f.life - 0.02 || f.owner.dead) { f.owner.dmgReduce += f.k; return true; } return false; } });
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, '−DEF', '#b0b8c8');
  }

  // Golpe Kárate: tajo seco en línea con mucho crítico (cada crítico, otro golpe ya);
  // A Bocajarro: 6 golpes rapidísimos al frente y después bajas la guardia.
  UQ['karate-chop'] = {
    cast(pl, m) {
      const col = colOf(m), L = m.radius * 1.12, dmg = m.dmg * pl.atkFor(m);
      if (m.evolved) {
        uqField({ sub: 'cc', owner: pl, ghost, m, x: pl.x, y: pl.y, k: 0, life: 0.45, pad: 120, dmg,
          upd(f) {
            const pl2 = f.owner;
            if (pl2.dead) return true;
            while (f.k < 6 && f.t >= f.k * 0.067) {
              f.k++;
              const a = pl2.aim + G.U.rand(-0.25, 0.25), d = G.U.rand(0.4, 1) * L;
              if (G.Camera.sees(pl2.x, pl2.y, 80)) {
                G.FX.sp('fistd', 'fighting', pl2.x + Math.cos(a) * d, pl2.y + Math.sin(a) * d - G.LIFT * 0.6, { life: 0.12, angle: a, scale: 1.5 });
                G.FX.sp('impact', 'fighting', pl2.x + Math.cos(a) * d, pl2.y + Math.sin(a) * d - G.LIFT * 0.6, { life: 0.1, scale: 1 });
                if (f.k % 2) G.Audio.sfx('shot', { kind: 'melee', type: 'fighting' });
              }
              if (!f.ghost) hitSeg(pl2, f.m, pl2.x, pl2.y, pl2.x + Math.cos(pl2.aim) * L, pl2.y + Math.sin(pl2.aim) * L, 34, f.dmg, col, 30);
            }
            if (f.k >= 6 && !f.down) { f.down = true; if (!f.ghost) guardDown(pl2, 0.2, 2); }
            return false;
          } });
        return true;
      }
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), ex = pl.x + ca * L, ey = pl.y + sa * L;
      G.FX.slash(pl.x + ca * L * 0.5, pl.y + sa * L * 0.5 - G.LIFT * 0.5, pl.aim + Math.PI / 2, 16, 1.2, col, { pal: 'fighting' });
      G.FX.sp('streak', 'fighting', pl.x + ca * L * 0.55, pl.y + sa * L * 0.55 - G.LIFT * 0.6, { life: 0.16, angle: pl.aim, scale: 2 });
      G.FX.sp('impact', 'fighting', ex, ey - G.LIFT * 0.5, { life: 0.18, scale: 1.5, frameRate: 12, fade: false });
      if (!ghost) {
        m.uqCrit = false;
        hitSeg(pl, m, pl.x, pl.y, ex, ey, 26, dmg, col, m.knock || 0);
        // Un crítico: otro golpe ya (como mucho 3 seguidos).
        if (m.uqCrit && (m.uqChain = (m.uqChain | 0) + 1) <= 3) m.t = Math.min(m.t, 0.08);
        else if (!m.uqCrit) m.uqChain = 0;
      }
      return true;
    },
    hit(pl, e, m, d, crit) { if (crit) m.uqCrit = true; }
  };

  // Esfera Aural: atraviesa paredes y pega más cuanto más lejos va (hasta ×2,5);
  // Onda Certera: una esfera enorme y lenta que atrae a su paso y estalla en el blanco.
  UQ['aura-sphere'] = {
    pp: m => (m.evolved ? {} : { air: true, trav: 0, upd: travUpd, hitK: p => Math.min(2.5, 1 + 0.5 * p.trav / 100) }),
    cast(pl, m) {
      if (!m.evolved) return false;
      const a = pl.aim, sp = m.speed * 0.45, dmg = m.dmg * pl.atkFor(m);
      G.Projectiles.spawn(Object.assign({
        x: pl.x, y: pl.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, r: m.size * 3, ds: 3.5, life: 2.8, pierce: 0, color: '#ff8a2e',
        homing: 3, air: true, hits: new Set(), vis: { proj: 'ball', pal: 'focus', trail: 'spark' }, ghost, owner: pl,
        upd: focusUpd, end: focusBoom, onHit: focusBoom
      }, payload(m)));
      G.Audio.sfx('shot', { kind: 'beam', type: 'fighting' });
      return true;
    }
  };
  function travUpd(p, dt) { p.trav += Math.hypot(p.vx, p.vy) * dt; if (p.trav > 100 && !p.big) { p.big = 1; p.ds = 1.5; } return false; }
  /** Onda Certera: arrastra hacia su camino a los de alrededor (lo hace quien tiene los enemigos). */
  function focusUpd(p, dt) {
    for (const e of G.EnemyMgr.queryCircle(p.x, p.y, 90)) {
      if (!real(e) || bigE(e)) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
      if (d > 6) { const k = Math.min(d, 150 * dt); e.x += dx / d * k; e.y += dy / d * k; }
    }
    if (Math.random() < 0.5 && G.Camera.sees(p.x, p.y, 40)) { const a = Math.random() * TAU; G.FX.px(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 40 - G.LIFT, '#90d2ff', { vx: -Math.cos(a) * 200, vy: -Math.sin(a) * 140, life: 0.3, size: 2 }); }
    return false;
  }
  function focusBoom(p) {
    if (p.boomed) return;
    p.boomed = true; p.life = p.t;             // (se acaba ya)
    if (G.Camera.sees(p.x, p.y, 70)) { G.FX.ring(p.x, p.y, 6, 70, '#ff8a2e', 0.35, 5); G.FX.burst(p.x, p.y - G.LIFT, '#ffd28a', 18, 220); G.Audio.sfx('break'); }
    if (!p.ghost && !p.owner.dead) { hitCircle(p.owner, p.src, p.x, p.y, 70, p.dmg, '#ff8a2e', 120); G.Camera.kick(0.15); }
  }

  // Patada Giro: avanzas girando hacia el blanco (y cortas lo que prepara);
  // Patada Salto Alta: saltas al más grande y caes con un golpe ×4 (si no hay nadie, te haces daño).
  UQ['rolling-kick'] = {
    field(f, dt) {
      if (f.kind !== 'spin' || f.ghost || f.m.evolved) return;
      const pl = f.owner;
      if (!f.adv) {
        const t = pl.target && !pl.target.dead ? pl.target : null, a = t ? Math.atan2(t.y - pl.y, t.x - pl.x) : pl.aim;
        f.adv = { ca: Math.cos(a), sa: Math.sin(a), left: 80, rate: 80 / (Math.max(1, f.n) * 0.13) };
      }
      if (f.adv.left > 0 && !pl.dead) {
        const s = Math.min(f.adv.left, f.adv.rate * dt);
        f.adv.left -= s;
        movePl(pl, pl.x + f.adv.ca * s, pl.y + f.adv.sa * s);
        if (Math.random() < 0.5) G.FX.sp('streak', 'fighting', pl.x, pl.y - G.LIFT * 0.5, { life: 0.2, angle: Math.atan2(f.adv.sa, f.adv.ca) + Math.PI });
      }
    },
    hit(pl, e) { interrupt(e); },
    cast(pl, m) {
      if (!m.evolved) return false;
      if (ghost) { G.FX.ring(pl.x, pl.y, 4, 40, '#ff9c6c', 0.3, 3); return true; }
      // Al más grande a tiro: jefe, campeón o el de más vida.
      let best = null, bs = -1;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 320)) {
        if (e.dead) continue;
        const s = (e.boss || e.judge ? 1e9 : 0) + (e.champ ? 1e8 : 0) + e.maxHp;
        if (s > bs) { bs = s; best = e; }
      }
      if (!best) return true;
      const sx = pl.x, sy = pl.y, dmg = m.dmg * pl.atkFor(m);
      iframes(pl, 0.5);
      uqField({ sub: 'hjk', owner: pl, ghost: false, m, x: sx, y: sy, sx, sy, e: best, tx: best.x, ty: best.y, life: 0.5, pad: 360, done: false, dmg,
        upd(f) {
          const pl2 = f.owner;
          if (pl2.dead) { pl2.uqLift = 0; return true; }
          if (f.e && !f.e.dead) { f.tx = f.e.x; f.ty = f.e.y; }
          const k = Math.min(1, f.t / 0.42);
          movePl(pl2, f.sx + (f.tx - f.sx) * k, f.sy + (f.ty - f.sy) * k);
          pl2.uqLift = Math.sin(k * Math.PI) * 48;
          if (Math.random() < 0.6) G.FX.px(pl2.x + G.U.rand(-6, 6), pl2.y - pl2.uqLift - pl2.bodyH * 0.4, '#ffe2cc', { vy: 30, life: 0.25, size: 2 });
          if (k < 1 || f.done) return k >= 1 && f.t >= 0.48;
          f.done = true; pl2.uqLift = 0;
          G.FX.ring(pl2.x, pl2.y, 4, 50, '#e04a2e', 0.3, 4); G.FX.burst(pl2.x, pl2.y - 6, '#ff9c6c', 14, 180);
          G.Camera.kick(0.25); G.Audio.sfx('break');
          const t = f.e && !f.e.dead && G.U.dist2(pl2.x, pl2.y, f.e.x, f.e.y) < (f.e.r + 44) ** 2 ? f.e : null;
          const skip = new Set();
          if (t) { hit(pl2, t, f.dmg * 5, '#e04a2e', 0, 1, 120, f.m); skip.add(t.id); }
          const n = hitCircle(pl2, f.m, pl2.x, pl2.y, 70, f.dmg * 1.5, '#e04a2e', 80, skip);
          if (!t && !n) {
            // Nadie donde caes: te haces daño (sin bajar de 1).
            pl2.hp = Math.max(1, pl2.hp - pl2.maxHp * 0.05);
            pl2.flash = 0.14;
            G.FX.dmgText(pl2.x, pl2.y - pl2.bodyH - 6, '¡Fallaste!', '#ff6b7a');
          }
          return false;
        } });
      return true;
    }
  };

  // Onda Vacío: un vacío delante de ti atrae a un punto a los de alrededor y los golpea;
  // Puño Incremento: cada enemigo golpeado te sube el ataque físico un rato.
  UQ['vacuum-wave'] = {
    cast(pl, m) {
      const t = tgOf(pl, m, 130), k = m.radius / 88;
      const d = t ? Math.min(70, G.U.dist(pl.x, pl.y, t.x, t.y)) : 70, L = rayLen(pl.x, pl.y, pl.aim, d);
      const px = pl.x + Math.cos(pl.aim) * L, py = pl.y + Math.sin(pl.aim) * L, R = 110 * k, dmg = m.dmg * pl.atkFor(m);
      G.FX.ring(px, py, R, 6, '#3a7cff', 0.22, 4);
      G.FX.sp('fistd', 'aura', pl.x + Math.cos(pl.aim) * 18, pl.y + Math.sin(pl.aim) * 18 - G.LIFT * 0.5, { life: 0.18, angle: pl.aim, scale: 1.5 });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; G.FX.sp('ring', 'aura', px + Math.cos(a) * R, py + Math.sin(a) * R * 0.6 - G.LIFT * 0.5, { vx: -Math.cos(a) * R * 4.5, vy: -Math.sin(a) * R * 2.7, life: 0.2 }); }
      for (const e of inCircle(px, py, R)) if (real(e) && !bigE(e)) stAdd(e, 'slide', 0.2, { tx: px + G.U.rand(-10, 10), ty: py + G.U.rand(-8, 8), t: 0.2 });
      uqField({ sub: 'vac', owner: pl, ghost, m, x: px, y: py, life: 0.3, pad: R + 20, done: false, dmg, r: 60 * k,
        upd(f) {
          if (f.done || f.t < 0.2) return false;
          f.done = true;
          if (G.Camera.sees(f.x, f.y, 40)) { G.FX.ring(f.x, f.y, 4, f.r, '#90d2ff', 0.25, 4); G.FX.burst(f.x, f.y - 8, '#90d2ff', 12, 170); G.Audio.sfx('thud'); }
          const n = hitCircle(f.owner, f.m, f.x, f.y, f.r, f.dmg, '#3a7cff', 60);
          if (f.m.evolved && n > 0 && !f.ghost) {
            for (let i = 0; i < n; i++) f.owner.addBuff('patk', 0.06, 5 * pkOf(f.m).dur, 6, 'vacuum-wave');
            G.FX.ring(f.owner.x, f.owner.y, f.owner.r * 2.6, f.owner.r, '#ff9c6c', 0.3, 3);
          }
          return false;
        } });
      if (!ghost) G.Camera.kick(0.08);
      G.Audio.sfx('shot', { kind: 'nova', type: 'fighting' });
      return true;
    }
  };

  // Puño Dinámico: acierta el 60 % (si falla, sólo una onda pequeña); si acierta, confunde siempre;
  // Megapuño: no falla y deja un cráter 2 s que confunde.
  UQ['dynamic-punch'] = {
    cast(pl, m) {
      const tg = ghost ? G.Projectiles.nearest(G.EnemyMgr.all(), pl.x + Math.cos(pl.aim) * 120, pl.y + Math.sin(pl.aim) * 120, 260) : spotFor(pl, m);
      if (!tg) return true;
      const ok = m.evolved || roll(pl, m, 3) < 0.6, r = m.radius, dmg = m.dmg * pl.atkFor(m);
      uqField({ sub: 'dp', owner: pl, ghost, m, x: tg.x, y: tg.y, r, ok, life: 0.5, pad: r + 30, done: false, dmg,
        upd(f) {
          if (f.done || f.t < 0.45) return false;
          f.done = true;
          const mm = f.m;
          if (!f.ok) {
            G.FX.ring(f.x, f.y, 4, f.r * 0.5, '#e04a2e', 0.25, 2);
            G.FX.dmgText(f.x, f.y - 20, '¡Falló!', '#c9a0a8');
            hitCircle(f.owner, mm, f.x, f.y, f.r * 0.5, f.dmg * 0.25, '#e04a2e');
            return false;
          }
          if (G.Camera.sees(f.x, f.y, 40)) { G.FX.ring(f.x, f.y, 4, f.r, '#e04a2e', 0.35, 5); G.FX.burst(f.x, f.y - 6, '#ff9c6c', 16, 190); G.Audio.sfx('break'); }
          if (!f.ghost) G.Camera.kick(0.2);
          hitCircle(f.owner, mm, f.x, f.y, f.r, f.dmg, '#e04a2e', 60);
          for (const e of inCircle(f.x, f.y, f.r)) stAdd(e, 'conf', mm.stun || 2);
          if (mm.evolved) {
            uqField({ sub: 'crater', owner: f.owner, ghost: f.ghost, m: mm, x: f.x, y: f.y, r: f.r, life: 2 * pkOf(mm).dur, pad: f.r + 20, tick: 0,
              upd(c, dt) { if ((c.tick -= dt) <= 0) { c.tick = 0.3; for (const e of inCircle(c.x, c.y, c.r)) stAdd(e, 'conf', 1); } return false; },
              drawG(ctx, c, own) {
                const a = Math.min(1, (c.life - c.t) * 2), now = performance.now() / 1000;
                ctx.globalAlpha = 0.45 * a * own; ctx.fillStyle = '#3a250c';
                ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r * 0.8, c.r * 0.45, 0, 0, TAU); ctx.fill();
                ctx.globalAlpha = 0.7 * a * own; ctx.strokeStyle = '#8e7a5a'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r * 0.85, c.r * 0.5, 0, 0, TAU); ctx.stroke();
                for (let i = 0; i < 3; i++) { const b = now * 3 + i * 2.1; G.VFX.draw(ctx, 'star', 'electric', c.x + Math.cos(b) * c.r * 0.5, c.y + Math.sin(b) * c.r * 0.25 - 8, { scale: 0.7 }); }
              } });
          }
          return false;
        },
        drawG(ctx, f, own) {
          if (f.done) return;
          const k = G.U.clamp(f.t / 0.45, 0, 1);
          ctx.globalAlpha = (0.15 + 0.25 * k) * own; ctx.fillStyle = '#e04a2e';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * k, f.r * k * 0.6, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.8 * own; ctx.strokeStyle = '#e04a2e'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, TAU); ctx.stroke();
        },
        drawA(ctx, f, own) {
          if (f.done) return;
          // El puño gigante cae (y, si va a fallar, se desvía al final).
          const k = G.U.clamp(f.t / 0.45, 0, 1), off = f.ok ? 0 : k * k * 26;
          ctx.globalAlpha = own;
          G.VFX.draw(ctx, 'fistd', 'fighting', f.x + off, f.y - 140 * (1 - k) - 10, { angle: Math.PI / 2, scale: 2.5 });
        } });
      return true;
    }
  };

  // Tajo Cruzado: tajos en cruz que al acabar se quedan girando como aspas;
  // Espada Santa: además, cada 4 s cuatro espadas se clavan a tu alrededor (los de dentro reciben +30 %).
  UQ['cross-chop'] = {
    pp: m => ({ end: p => {
      const r = 22 * (p.r / 9);
      uqField({ sub: 'mill', owner: p.owner, ghost: p.ghost, m, x: p.x, y: p.y, r, life: 0.4, pad: 40, log: new Map(), dmg: p.dmg * 0.45, a0: Math.atan2(p.vy, p.vx),
        upd(f) {
          if (!f.ghost && !f.owner.dead) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
            if (e.dead) continue;
            const last = f.log.get(e.id);
            if (last !== undefined && f.t - last < 0.15) continue;
            f.log.set(e.id, f.t);
            hit(f.owner, e, f.dmg, colOf(f.m), e.x - f.x, e.y - f.y, 20, f.m);
          }
          return false;
        },
        drawA(ctx, f, own) {
          ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 8);
          for (let i = 0; i < 4; i++) { const a = f.a0 + f.t * 22 + i * Math.PI / 2; G.VFX.draw(ctx, 'crescent', 'fighting', f.x + Math.cos(a) * f.r * 0.5, f.y + Math.sin(a) * f.r * 0.5 - G.LIFT, { angle: a + Math.PI / 2 }); }
        } });
    } }),
    cast(pl, m) {
      cross(pl, m);
      if (!m.evolved || findUq(pl, m.id, 'holy')) return true;
      if ((m.uqHoly = (m.uqHoly || 0) - (m.cd || 0.9)) > 0) return true;
      m.uqHoly = 4;
      const dmg = m.dmg * pl.atkFor(m), R = 80 * Math.sqrt(pkOf(m).area), swords = [];
      for (let i = 0; i < 4; i++) { const a = pl.aim + i * Math.PI / 2 + 0.785; swords.push({ x: pl.x + Math.cos(a) * R, y: pl.y + Math.sin(a) * R * 0.7 }); }
      uqField({ sub: 'holy', owner: pl, ghost, m, x: pl.x, y: pl.y, R, swords, life: 4 * pkOf(m).dur, pad: R + 40, tick: 0, landed: false, dmg,
        upd(f, dt) {
          if (!f.landed && f.t >= 0.2) {
            f.landed = true;
            for (const s of f.swords) {
              if (G.Camera.sees(s.x, s.y, 30)) { G.FX.burst(s.x, s.y - 4, '#ffe172', 8, 120); G.FX.ring(s.x, s.y, 3, 22, '#ffe172', 0.25, 3); }
              hitCircle(f.owner, f.m, s.x, s.y, 28, f.dmg, '#ffe172', 40);
            }
            if (G.Camera.sees(f.x, f.y, 80)) G.Audio.sfx('break');
          }
          if ((f.tick -= dt) <= 0) { f.tick = 0.25; for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.R)) if (real(e)) stAdd(e, 'sacred', 0.35); }
          return false;
        },
        drawG(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 2, f.t * 4), now = performance.now() / 1000;
          ctx.globalAlpha = 0.12 * a * own; ctx.fillStyle = '#ffe172';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.R, f.R * 0.7, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.6 * a * own; ctx.strokeStyle = '#ffe172'; ctx.lineWidth = 2; ctx.setLineDash(DASH); ctx.lineDashOffset = -now * 20;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.R, f.R * 0.7, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        },
        drawA(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 2);
          ctx.globalAlpha = own * a;
          for (const s of f.swords) { const k = Math.min(1, f.t / 0.2); G.VFX.draw(ctx, 'swordv', 'gold', s.x, s.y - 14 - (1 - k) * 120, { scale: 1.5 }); }
        } });
      return true;
    }
  };

  // Gancho Alto: la columna mantiene en el aire a los de dentro y al acabar caen con daño;
  // Puño Certero: cargas 1 s; si no te golpean, un puñetazo devastador en línea; si te golpean, recuperas la mitad de la recarga.
  UQ['sky-uppercut'] = {
    field(f, dt) {
      if (f.kind !== 'column') return;
      const hw = f.w / 2, hh = f.h / 2;
      if (!f.jug) f.jug = new Map();
      if (f.t < f.hl) {
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, Math.hypot(hw, hh))) {
          if (e.dead || Math.abs(e.x - f.x) > hw + e.r || Math.abs(e.y - f.y) > hh || bigE(e)) continue;
          if (stAdd(e, 'air', Math.max(0.05, f.hl - f.t + 0.05), { h: 30 }) && !f.jug.has(e.id)) f.jug.set(e.id, e);
        }
      } else if (!f.fell) {
        // Caen todos a la vez, con daño.
        f.fell = true;
        for (const e of f.jug.values()) {
          if (e.dead) continue;
          if (G.Camera.sees(e.x, e.y, 30)) G.FX.burst(e.x, e.y - 4, '#ffe2cc', 6, 100);
          if (!f.ghost && !f.owner.dead) hit(f.owner, e, f.dmg * 0.4, '#e04a2e', 0, 1, 0, f.m);
        }
        if (f.jug.size && G.Camera.sees(f.x, f.y, 60)) G.Audio.sfx('thud');
      }
    },
    cast(pl, m) {
      if (!m.evolved) return false;
      const dmg = m.dmg * pl.atkFor(m), cd = cooldown(pl, m);
      uqField({ sub: 'focus', owner: pl, ghost, m, x: pl.x, y: pl.y, life: 0.85, pad: 200, hurt0: pl.dmgTaken || 0, done: false, dmg,
        upd(f) {
          const pl2 = f.owner;
          f.x = pl2.x; f.y = pl2.y;
          if (pl2.dead) return true;
          if (f.done) return false;
          if (!f.ghost && (pl2.dmgTaken || 0) - f.hurt0 > pl2.maxHp * 0.08) {
            // Te han golpeado: se cancela y recuperas la mitad de la recarga.
            f.done = true;
            f.m.t = Math.min(f.m.t, cd * 0.5);
            G.FX.dmgText(pl2.x, pl2.y - pl2.bodyH - 10, '¡Cancelado!', '#c9a0a8');
            return true;
          }
          if (Math.random() < 0.7) { const a = Math.random() * TAU; G.FX.px(pl2.x + Math.cos(a) * 34, pl2.y + Math.sin(a) * 24 - G.LIFT * 0.6, '#ffffff', { vx: -Math.cos(a) * 110, vy: -Math.sin(a) * 80, life: 0.3, size: 2 }); }
          if (f.t < 0.7) return false;
          f.done = true;
          const a = pl2.aim, L = rayLen(pl2.x, pl2.y, a, 140), ex = pl2.x + Math.cos(a) * L, ey = pl2.y + Math.sin(a) * L;
          G.FX.beam(pl2.x, pl2.y - G.LIFT, a, L, 30, '#ffffff', { pal: 'fighting', beam: 'fistd' });
          G.FX.sp('fistd', 'fighting', ex, ey - G.LIFT, { life: 0.25, angle: a, scale: 3 });
          G.FX.ring(ex, ey, 4, 40, '#ffffff', 0.3, 4);
          if (!f.ghost) { hitSeg(pl2, f.m, pl2.x, pl2.y, ex, ey, 44, f.dmg * 5, '#ffffff', 160); G.Camera.kick(0.3); }
          G.Audio.sfx('break');
          return false;
        },
        drawG(ctx, f, own) {
          if (f.done) return;
          const k = Math.min(1, f.t / 0.7);
          ctx.globalAlpha = (0.2 + 0.4 * k) * own; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          const r = f.owner.r * (3 - 1.8 * k);
          ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.45, 0, 0, TAU); ctx.stroke();
        } });
      G.Audio.sfx('shot', { kind: 'buff', type: 'fighting' });
      return true;
    }
  };

  const UQX = { UQ, stAdd, stStack, stHurtK, stTimers, real,
                /** Para tools/balance.cjs: relojes y veneno grave de un muñeco. */
                tickDummy(e, dt) { if (!e.x2) return; const s = e.x2; if (s.bpo) { const b = s.bpo; b.age += dt; if ((b.tick -= dt) <= 0) { b.tick = 0.6; e.hurt(b.v * (1 + 3 * Math.min(1, b.age / 6))); } } stTimers(e, dt); } };

  /* ===================================================================================
   * -- ataques únicos: Roca, Fantasma, Dragón, Siniestro, Acero, Hada (26-10-2026) --
   *
   * Cada ataque de estos seis tipos hace algo suyo (y su evolución lo cambia de verdad):
   * MECH3[id]. Los que no están aquí funcionan como su familia. Ganchos (sólo si existen):
   *   cast(pl, m)              en lugar de la familia (run)
   *   reach(m)                 alcance propio (tickMove espera blanco a esa distancia)
   *   k(pl, e, m, d, p)        × al daño de un golpe (p: el proyectil, si lo es)
   *   crit(pl, e, m, p)        crítico seguro
   *   after(pl, e, m, d)       tras un golpe directo tuyo (hit)
   *   afterP(pl, e, m, p, d)   tras el golpe de un proyectil tuyo
   *   ghostP(p, e)             el proyectil de un compañero choca (sin daño: en el anfitrión,
   *                            lo que mueve enemigos; en todos, lo que se ve)
   *   orb(pl, m, dt, orbs, g)  cada fotograma de una órbita
   *   block(pl, m, g)          un escudo para un golpe (g: el de un compañero, sólo se ve)
   * Lo que se queda un rato va en `fields` con kind 'u3' y k3 = su clase; f.tk (cada
   * fotograma; true = se acaba), f.dg (suelo) y f.da (encima). Usan `dur`, no `life`.
   *
   * Estados de los enemigos (e.s3, sólo en los que tienen alguno; aff3 los recorre): para,
   * root, sleep, infat, charm, fear, confuse, vuln (pilas), atk (ataque bajo), curse. Lo que
   * mueve o para la IA lo hace quien tiene los enemigos de verdad (en grupo, el anfitrión;
   * también con los ataques fantasma de los invitados, como el remolino). En una copia de
   * invitado sólo viaja lo de siempre (aturdir, frenar, el golpe con su empujón); lo demás
   * (vulnerable, no tocarte...) lo nota quien lo puso. Jefes: control ×0,35 y no se mueven;
   * inmovilizar (root, sleep) no se repite hasta 1,2 s después de soltarlo.
   * Tu Pokémon: pl.u3 (escudo de Luz Lunar, críticos de las monedas, forma Filo, esconderse...).
   * Topes: piedras 6, trampas 10, flores 30... por jugador; enemigos arrastrados 3 por tornado.
   * =================================================================================== */
  const MECH3 = Object.create(null);
  const T3 = () => G.Game.st.time;
  const big3 = e => !!(e.boss || e.judge);
  const real3 = e => !!e && !e.remote && !e.dead;
  const free3 = e => real3(e) && !big3(e) && e.behavior !== 'thief';
  const ST3 = m => m.st3 || (m.st3 = {});
  const sees3 = (x, y, pad = 40) => G.Camera.sees(x, y, pad);
  function P3(pl) {
    return pl.u3 || (pl.u3 = { shield: 0, crit: [], filo: 0, hide: 0, kos: [], koT: 0, gems: 0, px: pl.x, py: pl.y, v: 0, still: 0,
                               shade: 0, shadeR: 0, mist: 0, mx: 0, my: 0, mr: 0, anchor: 0, gyro: null });
  }
  let crit3f = false;          // crítico seguro en el golpe que se está dando (vuelta de Garra Metal, Garra Umbría)
  let incoming3 = 0;           // golpe que te va a llegar (lo gasta el escudo de Luz Lunar)
  let walls3 = [];             // piedras, rocas de las tumbas y portales: paran (o se tragan) los disparos enemigos
  let tw3 = [];                // tornados de Dracoenergía vivos (se cruzan y estallan)
  const vis3 = Object.create(null);
  /** El aspecto de m con otra paleta (y otra forma): cacheado. */
  function visAs(m, pal, extra) {
    const k = m.id + '|' + pal + '|' + (extra ? (extra.proj || '') + (extra.beam || '') + (extra.trail || '') : '');
    return vis3[k] || (vis3[k] = Object.assign({}, G.VFX.forMove(m), extra || {}, { pal }));
  }
  // El mismo movimiento sin sus ganchos (golpes de segunda: esquirlas, pulsos...). Suma su daño al de m.
  const subs3 = new WeakMap();
  function sub3(m) {
    let s = subs3.get(m);
    if (!s) {
      s = Object.create(m, { id: { value: m.id + '~', writable: true },
                             dealt: { get() { return m.dealt || 0; }, set(v) { m.dealt = v; } } });
      subs3.set(m, s);
    }
    return s;
  }

  // ---------------- piezas comunes ----------------
  function add3(pl, k3, o) {
    const f = Object.assign({ kind: 'u3', k3, owner: pl, ghost, t: 0, pad: 80, x: pl.x, y: pl.y }, o);
    fields.push(f);
    return f;
  }
  /** Deja como mucho `keep` de esa clase y dueño (se van los más viejos). */
  function cap3(pl, k3, keep) {
    let k = 0;
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      if (f.k3 !== k3 || f.owner !== pl || f.gone) continue;
      if (++k > keep) f.gone = true;
    }
  }
  /** Lanza con fn y marca con tag los proyectiles nuevos (ids crecientes: lo que fn quite no importa). */
  function tagged3(fn, tag) {
    const list = G.Projectiles.all(), last = list.length ? list[list.length - 1].id : 0;
    fn();
    for (let i = list.length - 1; i >= 0 && list[i].id > last; i--) tag(list[i]);
  }
  function shot3(pl, m, o) {
    return G.Projectiles.spawn(Object.assign({
      x: pl.x, y: pl.y, vx: 0, vy: 0, dmg: m.dmg * pl.atkFor(m), r: m.size || 7, life: 1, pierce: 0,
      color: G.U.TYPE_COLOR[m.type], hits: new Set(), vis: G.VFX.forMove(m), ghost, owner: pl
    }, payload(m), o));
  }
  /** Golpe en un círculo (each: tras golpear a cada uno). → cuántos. */
  function blast3(pl, m, x, y, r, dmg, o) {
    if (o && o.ghost) return 0;
    const col = (o && o.col) || G.U.TYPE_COLOR[m.type], kn = o && o.knock ? o.knock : 0;
    let n = 0;
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) {
      if (e.dead) continue;
      hit(pl, e, dmg, col, e.x - x, e.y - y, kn, m); n++;
      if (o && o.each && !e.dead) o.each(e);
    }
    for (const p of G.World.propsInCircle(x, y, r)) G.World.damageProp(p, dmg, col);
    return n;
  }
  /** fn(e) a los enemigos que tocan el tramo (x0, y0)-(x1, y1) de ancho w. */
  function lineHit3(x0, y0, x1, y1, w, fn) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (const e of G.EnemyMgr.queryCircle((x0 + x1) / 2, (y0 + y1) / 2, L / 2 + w)) {
      if (!e.dead && segDist2(x0, y0, x1, y1, e.x, e.y) <= (w / 2 + e.r) ** 2) fn(e);
    }
  }
  function lineProps3(x0, y0, x1, y1, w, dmg, col) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (const p of G.World.propsInCircle((x0 + x1) / 2, (y0 + y1) / 2, L / 2 + w)) {
      if (segDist2(x0, y0, x1, y1, p.x, p.y) <= (w / 2 + p.r) ** 2) G.World.damageProp(p, dmg, col);
    }
  }
  /** Daño tal cual (sin tipos, defensas ni crítico): cuenta como un golpe tuyo. */
  function pure3(pl, e, d, m, col) {
    if (!(d > 0) || e.dead) return;
    e.hurt(d, col, e.x - pl.x, e.y - pl.y, 0, null);
    pl.dmgDealt += d; m.dealt = (m.dealt || 0) + d;
    if (!ghost) pl.onDealt(d);
  }
  /** Los n enemigos más cercanos a (x, y) a menos de r (sin `skip`). */
  function nearestN3(x, y, r, n, skip) {
    const out = [];
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) if (!e.dead && e !== skip) out.push(e);
    out.sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2));
    return out.length > n ? out.slice(0, n) : out;
  }
  /** Un enemigo del grupo más grande cerca de ti (lo mira entre unos pocos al azar). */
  function group3(pl, R = 300) {
    let best = null, bn = -1, k = 0;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || Math.abs(e.x - pl.x) > R || Math.abs(e.y - pl.y) > R * 0.8) continue;
      if (++k > 24 && Math.random() < 0.6) continue;
      const n = G.EnemyMgr.queryCircle(e.x, e.y, 80).length + (big3(e) ? 3 : 0);
      if (n > bn) { bn = n; best = e; }
    }
    return best;
  }
  /** Embestida tuya: invulnerable `t` s como mucho, con el tope del dash (60 % del tiempo desde la anterior). */
  function invuln3(pl, t) {
    const at = T3(), gap = pl.dashAt == null ? 1 : at - pl.dashAt;
    pl.dashAt = at;
    pl.invuln = Math.max(pl.invuln || 0, Math.min(t, gap * 0.6));
  }
  /** ¿Mira hacia pl? 1 de cara, -1 de espaldas, 0 de lado o no se sabe. */
  function facing3(e, pl) {
    const a = e.anim;
    if (!a || a.dir == null) return 0;
    const fa = Math.PI / 2 - a.dir * Math.PI / 4, ta = Math.atan2(pl.y - e.y, pl.x - e.x);
    const d = Math.abs((((ta - fa) % 6.2832) + 9.4248) % 6.2832 - 3.1416);
    return d < 1.2 ? 1 : d > 1.95 ? -1 : 0;
  }
  /** Rayo recto (como beam) desde pl con ángulo a: se corta en la pared. → largo. */
  function ray3(pl, m, a, R, w, dmg, vis, each) {
    const col = G.U.TYPE_COLOR[m.type], ca = Math.cos(a), sa = Math.sin(a);
    let len = R;
    for (let d = 8; d < R; d += 8) if (G.World.isWall(pl.x + ca * d, pl.y + sa * d)) { len = d; break; }
    G.FX.beam(pl.x, pl.y - G.LIFT, a, len, w, col, vis || G.VFX.forMove(m));
    if (ghost) return len;
    G.Camera.kick(0.08);
    lineHit3(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, w, e => { hit(pl, e, dmg, col, ca, sa, 0, m); if (each && !e.dead) each(e); });
    lineProps3(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, w, dmg, col);
    return len;
  }
  /** Tramos de un rayo que se refleja en paredes y objetos sólidos (hasta `bounces` veces). */
  function trace3(x, y, a, len, bounces) {
    const segs = [], solid = (px, py) => G.World.isWall(px, py) || !!G.World.projectileBlock(px, py, 3);
    let ca = Math.cos(a), sa = Math.sin(a), sx = x, sy = y, left = len, b = 0;
    while (left > 8 && segs.length < 6) {
      let px = sx, py = sy, hitW = false;
      for (let d = 8; d <= left; d += 8) {
        const nx = sx + ca * d, ny = sy + sa * d;
        if (solid(nx, ny)) { hitW = true; break; }
        px = nx; py = ny;
      }
      if (!hitW) { segs.push([sx, sy, sx + ca * left, sy + sa * left]); break; }
      segs.push([sx, sy, px, py]);
      left -= Math.hypot(px - sx, py - sy) + 8;
      if (b++ >= bounces) break;
      const bx = solid(px + ca * 8, py), by = solid(px, py + sa * 8);
      if (bx || !by) ca = -ca;
      if (by || !bx) sa = -sa;
      sx = px; sy = py;
    }
    return segs;
  }
  /** Un rayo a bloques de (x0, y0) a (x1, y1) (láseres, el de los espejos, la luz lunar). */
  function drawRay3(ctx, x0, y0, x1, y1, hw, pal, alpha) {
    const P = G.VFX.PAL[pal] || G.VFX.PAL.normal, L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(Math.round(x0), Math.round(y0));
    ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    ctx.fillStyle = P[1]; ctx.fillRect(0, -hw - 2, L, hw * 2 + 4);
    ctx.fillStyle = P[2]; ctx.fillRect(0, -hw, L, hw * 2);
    const c = Math.max(1, Math.round(hw * 0.5));
    ctx.fillStyle = P[3]; ctx.fillRect(0, -c, L, c * 2);
    ctx.fillStyle = P[4]; ctx.fillRect(0, -1, L, 2);
    ctx.restore();
  }
  function ell3(ctx, x, y, rx, ry, col, a) {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, 6.2832); ctx.fill();
  }

  // ---------------- estados de los enemigos ----------------
  const aff3 = new Set();
  const EXT3 = ['para', 'root', 'sleep', 'infat', 'charm', 'fear', 'confuse', 'curse'];
  function sOf(e) { if (!e.s3) e.s3 = {}; aff3.add(e); return e.s3; }
  /** Pone un estado. v: vuln, pilas · atk, cuánto baja · charm, [x, y] a donde va · fear, [x, y] de dónde huye. */
  function inflict(e, kind, dur, v) {
    if (!e || e.dead || !(dur > 0)) return;
    const big = big3(e), s = sOf(e), now = T3();
    switch (kind) {
      case 'para':
        s.para = Math.max(s.para || 0, dur);
        if (!(s.paraT > 0)) s.paraT = 0.5;
        e.applySlow(big ? 0.2 : 0.4, Math.min(1.2, dur));
        break;
      case 'root': case 'sleep': {
        // (La espera de 1,2 s tras soltarse cuenta también la de e.x2 —en el aire, anclado—, e.uqImm.)
        if (s.free > now || (e.uqImm > 0 && !(s[kind] > 0))) return;
        const d = dur * (big ? 0.35 : 1);
        if (kind === 'root') e.applySlow(big ? 0.5 : 1, d); else e.applyStun(d);
        s[kind] = Math.max(s[kind] || 0, d);
        break;
      }
      case 'infat': case 'charm': case 'fear': case 'confuse':
        if (big && (kind === 'fear' || kind === 'confuse')) return;
        s[kind] = Math.max(s[kind] || 0, dur * (big ? 0.35 : 1));
        if (v && kind === 'charm') { s.gx = v[0]; s.gy = v[1]; }
        if (v && kind === 'fear') { s.fx = v[0]; s.fy = v[1]; }
        // (Una copia: al anfitrión sólo le llega que se quede un momento quieto.)
        if (e.remote && !big && kind !== 'infat') e.applyStun(Math.min(0.5, dur * 0.35));
        break;
      case 'vuln':
        s.vuln = Math.min(5, (s.vulnT > 0 ? s.vuln || 0 : 0) + (v || 1)); s.vulnT = dur;
        break;
      case 'atk': {
        if (typeof e.dmg !== 'number') break;
        const k = Math.min(0.8, (v || 0.3) * (big ? 0.5 : 1));
        if (s.dmg0 == null) s.dmg0 = e.dmg;
        s.atkV = Math.max(s.atkT > 0 ? s.atkV || 0 : 0, k); s.atkT = Math.max(s.atkT || 0, dur);
        e.dmg = s.dmg0 * (1 - s.atkV);
        break;
      }
      case 'curse': s.curse = Math.max(s.curse || 0, dur); break;
    }
  }
  /** Cuántos estados tiene (los de siempre y los nuevos; en una copia, los que manda el anfitrión). */
  function nStat3(e) {
    const st = e.net ? e.net.st | 0 : 0;
    let n = (e.burn > 0 || st & 1 ? 1 : 0) + (e.poison > 0 || st & 2 ? 1 : 0) + (e.slow > 0 || st & 8 ? 1 : 0) + (e.stunT > 0 ? 1 : 0);
    const s = e.s3;
    if (s) {
      for (const k of EXT3) if (s[k] > 0) n++;
      if (s.vuln > 0) n++;
      if (s.atkT > 0) n++;
    }
    return n;
  }
  /** Alarga k s los estados que tenga (Infortunio). */
  function extend3(e, k) {
    if (!e.remote) { if (e.burn > 0) e.burnT += k; if (e.poison > 0) e.poisonT += k; if (e.slowT > 0) e.slowT += k; }
    const s = e.s3;
    if (!s) return;
    for (const key of EXT3) if (s[key] > 0) s[key] += k;
    if (s.vulnT > 0) s.vulnT += k;
    if (s.atkT > 0) s.atkT += k;
  }
  /** ¿Prepara un ataque? (apunta para embestir, mecha encendida, un jefe cargando disparos, a punto de disparar) */
  const WIND3 = new Set(['volley', 'nova', 'spiral', 'burst', 'waves', 'summon']);
  function prepping3(e) {
    if (!e || e.dead || e.remote) return false;
    if (e.behavior === 'charger' && e.phase === 'aim') return true;
    if (e.behavior === 'bomber' && e.phase === 'fuse') return true;
    const c = e.ai && e.ai.cast;
    if (c && WIND3.has(c.id) && c.t < c.wind) return true;
    return !e.boss && e.shotCd != null && e.shotCd < 0.4 && typeof e.keepsDistance === 'function' && e.keepsDistance();
  }
  /** Le corta lo que prepara (en una copia, un momento quieto). Un jefe, como mucho cada 4 s. */
  function interrupt3(e) {
    if (!e || e.dead) return;
    if (e.remote) { e.applyStun(0.3); return; }
    if (e.behavior === 'charger' && e.phase === 'aim') { e.phase = 'walk'; e.pt = 1.1; }
    if (e.behavior === 'bomber' && e.phase === 'fuse') { e.phase = 'walk'; e.pt = 1.2; e.flash = 0; }
    const c = e.ai && e.ai.cast;
    if (c && WIND3.has(c.id) && c.t < c.wind) {
      const s = sOf(e), now = T3();
      if (!(s.intAt > now)) { s.intAt = now + 4; e.ai.cast = null; e.ai.cd = Math.max(e.ai.cd || 0, 1.2); }
    }
    if (e.shotCd != null && e.def && e.def.shotCd && !e.boss) e.shotCd = Math.max(e.shotCd, e.def.shotCd * 0.6);
    if (sees3(e.x, e.y, 10)) G.FX.sp('impact', 'dark', e.x, e.y - (e.bodyH || 20) - 6, { life: 0.2, scale: 1 });
  }
  /** Va a donde quiera el estado (miedo, encandilado, mareo): anula su paso hacia el jugador y pone otro. */
  let plrs3 = [];               // los jugadores de este fotograma (frame3)
  function steer3(e, s, mode, dt) {
    let pl = null, bd = Infinity;
    for (const p of plrs3) { if (!p || p.dead) continue; const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2; if (d < bd) { bd = d; pl = p; } }
    const spd = (e.spd || 60) * (1 - Math.min(0.9, e.slow || 0));
    let cx = 0, cy = 0, wx = 0, wy = 0;
    if (pl) { const d = Math.sqrt(bd) || 1; cx = (pl.x - e.x) / d; cy = (pl.y - e.y) / d; }
    if (mode === 1) {
      const dx = s.gx - e.x, dy = s.gy - e.y, d = Math.hypot(dx, dy);
      if (d > 12) { wx = dx / d; wy = dy / d; }
    } else if (mode === 2) {
      const dx = e.x - (s.fx != null ? s.fx : pl ? pl.x : e.x), dy = e.y - (s.fy != null ? s.fy : pl ? pl.y : e.y), d = Math.hypot(dx, dy) || 1;
      wx = dx / d * 1.25; wy = dy / d * 1.25;
    } else {
      if ((s.cT = (s.cT || 0) - dt) <= 0) { s.cT = 0.6; s.ca = Math.random() * 6.2832; }
      wx = Math.cos(s.ca) * 0.8; wy = Math.sin(s.ca) * 0.8;
    }
    e.kx = (wx - cx) * spd; e.ky = (wy - cy) * spd;
  }
  /** ¿Ya le lleva un estado de e.x2 (Psíquico, Volador...: confuso, marioneta, miedo, en el aire...)? Entonces no se le guía también aquí. */
  function led2(e) { const x = e.x2; return !!x && !!(x.conf || x.ctrl || x.fear || x.lost || x.air || x.slide || x.root || x.sink); }
  function atkBack3(e, s) { if (s.dmg0 != null) { e.dmg = s.dmg0; s.dmg0 = null; } s.atkV = 0; }
  function endS3(e) { if (e.s3) atkBack3(e, e.s3); e.s3 = null; aff3.delete(e); }
  function tickS3(dt) {
    if (!aff3.size) return;
    const now = T3();
    for (const e of aff3) {
      const s = e.s3;
      if (!s || e.dead) { endS3(e); continue; }
      let live = s.free > now || s.intAt > now;
      if (s.para > 0) {
        live = true; s.para -= dt;
        if ((s.paraT -= dt) <= 0 && s.para > 0) {
          s.paraT = 1;
          const big = big3(e);
          e.applySlow(big ? 0.2 : 0.4, Math.min(1.1, s.para + 0.1));
          if (!big && Math.random() < 0.3) e.applyStun(0.35);
        }
      }
      if (s.root > 0) { if ((s.root -= dt) <= 0) s.free = now + 1.2; live = true; }
      if (s.sleep > 0) { if ((s.sleep -= dt) <= 0) s.free = now + 1.2; live = true; }
      if (s.infat > 0) {
        s.infat -= dt; live = true;
        if (real3(e)) { if (e.shotCd != null && e.shotCd < 0.3) e.shotCd = 0.3; if (e.ai && !e.ai.cast && e.ai.cd < 0.3) e.ai.cd = 0.3; }
      }
      let steer = 0;
      if (s.confuse > 0) { s.confuse -= dt; live = true; steer = 3; }
      if (s.charm > 0) { s.charm -= dt; live = true; steer = 1; }
      if (s.fear > 0) { s.fear -= dt; live = true; steer = 2; }
      if (steer && free3(e) && !(e.stunT > 0) && !led2(e)) steer3(e, s, steer, dt);
      if (s.vulnT > 0) { if ((s.vulnT -= dt) <= 0) s.vuln = 0; else live = true; }
      if (s.atkT > 0) { if ((s.atkT -= dt) <= 0) atkBack3(e, s); else live = true; }
      if (s.curse > 0) { s.curse -= dt; live = true; }
      if (s.dreamAt && now - s.dreamAt < 1) live = true;
      if (!live) endS3(e);
    }
  }
  /** ¿No te toca? (enamorado, encandilado, con miedo; mareado, la mitad de las veces) */
  function noTouch3(e) {
    const s = e.s3;
    return s.infat > 0 || s.charm > 0 || s.fear > 0 || (s.confuse > 0 && Math.random() < 0.5);
  }
  /** × de los estados al golpe d: vulnerable y el que despierta al dormido. */
  function sK3(e, d) {
    const s = e.s3;
    let k = 1;
    if (s.vuln > 0) {
      // (Con las pilas de e.x2 —las suma Enemy.hurt en los de verdad, Lucha, Bicho...—, como mucho 5 entre las dos.)
      const n2 = !e.remote && e.x2 && e.x2.vuln ? Math.min(5, e.x2.vuln.n | 0) : 0;
      k = (1 + 0.08 * Math.min(5, s.vuln + n2)) / (1 + 0.08 * n2);
    }
    if (s.sleep > 0 && d * k > 0.15 * (e.maxHp || 1e12)) {
      k *= 1.25; s.sleep = 0; s.free = T3() + 1.2;
      if (!e.remote && e.stunT > 0) e.stunT = 0;
      if (sees3(e.x, e.y, 10)) G.FX.dmgText(e.x, e.y - (e.bodyH || 20) - 16, '¡Despierta!', '#d4c4ff');
    }
    return k;
  }
  /** × total de un golpe de m a e (estados y el gancho k del movimiento). */
  function k3(pl, e, m, d, p) {
    let k = e.s3 ? sK3(e, d) : 1;
    const x = m && MECH3[m.id];
    if (x && x.k) k *= x.k(pl, e, m, d * k, p);
    return k;
  }
  /** Iconos sobre los que tienen estado (como mucho 2) y raíces bajo los anclados. */
  function drawS3(ctx, now) {
    if (!aff3.size) return;
    ctx.save();
    for (const e of aff3) {
      const s = e.s3;
      if (!s || e.dead || !G.Camera.sees(e.x, e.y, 30)) continue;
      const y = e.y - (e.bodyH || 20) - 14 + Math.sin(now * 5 + e.id) * 1.2;
      // (Los iconos de e.x2 —Enemy.draw— van primero: entre los dos, como mucho 2, sin repetir miedo, mareo ni vulnerable.)
      const x2 = e.x2;
      let n = x2 ? Math.min(2, (x2.ctrl || x2.conf ? 1 : 0) + (x2.fear ? 1 : 0) + (x2.markX ? 1 : 0) + (x2.mark ? 1 : 0) + (x2.vuln ? 1 : 0) +
                              (x2.weak ? 1 : 0) + (x2.lost ? 1 : 0) + (x2.daze ? 1 : 0)) : 0;
      const at = () => e.x - 5 + (n++) * 10;
      if (s.root > 0) {
        ell3(ctx, e.x, e.y, e.r * 1.1, e.r * 0.42, '#1e1030', 0.45);
        ctx.globalAlpha = 1;
      }
      if (s.sleep > 0 && n < 2) {
        ctx.font = NUM_FONT; ctx.textAlign = 'center'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(10,8,24,.85)'; ctx.fillStyle = '#d4c4ff';
        const x = at(), yy = y - ((now * 10 + e.id) % 6);
        G.I18n.rawCanvas(ctx, 'strokeText', 'Zz', x, yy); G.I18n.rawCanvas(ctx, 'fillText', 'Zz', x, yy);
      }
      if (s.para > 0 && n < 2) G.VFX.draw(ctx, 'bolt', 'electric', at(), y, { scale: 0.6, angle: 0.0001, frame: (now * 8) | 0 });
      if ((s.infat > 0 || s.charm > 0) && n < 2) G.VFX.draw(ctx, 'heart', s.infat > 0 ? 'fairy' : 'psychic', at(), y, { scale: 0.7 });
      if (s.fear > 0 && n < 2 && !(x2 && x2.fear)) G.VFX.draw(ctx, 'drop', 'water', at(), y, { scale: 0.6, angle: Math.PI / 2 });
      if (s.confuse > 0 && n < 2 && !(x2 && x2.conf)) G.VFX.draw(ctx, 'ring', 'psychic', at(), y, { scale: 0.6, frame: (now * 6) | 0 });
      if (s.vuln > 0 && n < 2 && !(x2 && x2.vuln)) G.VFX.draw(ctx, 'shield', 'nightmare', at(), y, { scale: 0.6 });
      if (s.atkT > 0 && n < 2) G.VFX.draw(ctx, 'arrow', 'laser', at(), y, { scale: 0.6, angle: Math.PI });
      if (s.curse > 0 && n < 2) G.VFX.draw(ctx, 'shadow', 'umbra', at(), y, { scale: 0.5, frame: (now * 6) | 0 });
    }
    ctx.restore();
  }

  // ---------------- tu Pokémon (pl.u3) ----------------
  function tickPl3(dt, pl) {
    const u = pl.u3;
    u.v = Math.hypot(pl.x - u.px, pl.y - u.py) / (dt || 1); u.px = pl.x; u.py = pl.y;
    u.still = u.v < 12 ? u.still + dt : 0;
    if (u.shield > 0) u.shield = Math.max(0, u.shield - (pl.maxHp || 100) * 0.02 * dt);
    if (pl.maxHp && pl.hp > pl.maxHp) pl.hp = pl.maxHp;
    for (let i = u.crit.length - 1; i >= 0; i--) if ((u.crit[i] -= dt) <= 0) u.crit.splice(i, 1);
    if (u.filo > 0) u.filo -= dt;
    if (u.hide > 0) u.hide -= dt;
    if (u.shade > 0) { u.shade -= dt; illusion3(pl, u); }
    if (u.mist > 0) { u.mist -= dt; if (pl.slowT > 0) pl.slowT = 0; }
    // Cuerpo Pesado: quieto con Giro Bola evolucionado en el hueco activo, te anclas.
    u.gyro = null;
    if (u.still > 0.15 && pl.activeGroup) for (const m of pl.activeGroup()) if (m.id === 'gyro-ball' && m.anchor) u.gyro = m;
    u.anchor = u.gyro ? 0.1 : 0;
    if (u.anchor && pl.slowT > 0) pl.slowT = 0;
    if ((u.koT -= dt) <= 0) { u.koT = 1; u.kos.push(pl.kills || 0); if (u.kos.length > 21) u.kos.shift(); }
  }
  /** Enemigos debilitados en los últimos 20 s (Homenaje Póstumo). */
  const recentKO3 = pl => { const u = P3(pl); return u.kos.length ? Math.max(0, (pl.kills || 0) - u.kos[0]) : 0; };
  /** Tinieblas: el 30 % de los disparos que salen dentro de la sombra van hacia atrás. */
  function illusion3(pl, u) {
    const r2 = u.shadeR * u.shadeR, list = G.Projectiles.all();
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.friendly || p.rev3 || p.t > 0.12) continue;
      p.rev3 = true;
      if ((p.x - pl.x) ** 2 + (p.y - pl.y) ** 2 > r2 || Math.random() >= 0.3) continue;
      p.vx = -p.vx; p.vy = -p.vy;
      if (sees3(p.x, p.y, 10)) G.FX.sp('shadow', 'umbra', p.x, p.y - G.LIFT, { life: 0.25 });
    }
  }
  /** Escudo de Luz Lunar: antes del golpe se suma a la vida lo que para (wardBlock lo llama). */
  function shield3(pl) {
    const u = pl.u3, want = incoming3 > 0 ? incoming3 * (1 - (pl.reduction || 0)) : (pl.maxHp || 100) * 0.08;
    const a = Math.min(u.shield, want);
    incoming3 = 0;
    if (!(a > 0)) return;
    u.shield -= a; pl.hp += a;
    G.FX.ring(pl.x, pl.y - pl.bodyH * 0.5, pl.r, pl.r * 2.2, '#e8dcff', 0.25, 2);
  }
  /** Disparo enemigo contra tus piedras, tumbas y portales. → true si se para. */
  function foe3(p) {
    for (const w of walls3) {
      if ((p.x - w.x) ** 2 + (p.y - w.y) ** 2 >= (w.r + p.r) ** 2) continue;
      if (w.eat) { G.FX.ring(w.x, w.y, 2, w.r, '#ffd25a', 0.2, 2); return true; }
      G.FX.burst(p.x, p.y - G.LIFT, '#c6b08a', 5, 70);
      return true;
    }
    return false;
  }
  /** Campo de Niebla: × al daño de lo que te toca o te dispara desde dentro. */
  function mistK3(pl, x, y, dragon) {
    const u = pl.u3;
    if (!u || !(u.mist > 0) || (x - u.mx) ** 2 + (y - u.my) ** 2 > u.mr * u.mr) return 1;
    return dragon ? 0.5 : 0.7;
  }
  /** Lo que pasa cuando un enemigo te toca (Cuerpo Pesado: rebota aturdido y recibe el giro). */
  function touch3(pl, e) {
    const u = pl.u3, m = u.gyro;
    if (!u.anchor || !m || e.dead) return;
    e.applyStun(0.3 * (big3(e) ? 0.35 : 1));
    hit(pl, e, m.dmg * pl.atkFor(m), G.U.TYPE_COLOR.steel, e.x - pl.x, e.y - pl.y, big3(e) ? 0 : 260, m);
    if (sees3(pl.x, pl.y)) { G.FX.ring(pl.x, pl.y, pl.r, pl.r * 2.4, '#cad6e2', 0.25, 3); G.Audio.sfx('shake'); }
  }
  /** Lo tuyo que se dibuja encima: el escudo de Luz Lunar y las grietas de Cuerpo Pesado. */
  function drawPl3(ctx, now) {
    const me = G.Game.player, u = me && me.u3;
    if (!u || me.dead || G.Game.state === 'ui') return;
    if (u.shield > 0.5) {
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.min(0.25, u.shield / (me.maxHp || 100)) + Math.sin(now * 4) * 0.05;
      ctx.strokeStyle = '#efe6ff'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(232,220,255,.12)';
      ctx.beginPath(); ctx.ellipse(me.x, me.y - me.bodyH * 0.45, me.r * 1.5, me.bodyH * 0.7, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (u.anchor > 0) {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + 0.5;
        G.VFX.draw(ctx, 'crack', 'steel', me.x + Math.cos(a) * me.r * 1.3, me.y + Math.sin(a) * me.r * 0.5, { angle: a, alpha: 0.8 });
      }
    }
    if (u.filo > 0 && Math.random() < 0.3) G.FX.px(me.x + G.U.rand(-me.r, me.r), me.y - G.U.rand(0, me.bodyH), '#9e8aea', { vy: -40, life: 0.4 });
  }

  // ==== mech: roca ====
  // Lanzarrocas → Roca Afilada: la piedra se queda de barricada; evolucionada, estalla en esquirlas.
  MECH3['rock-throw'] = {
    cast(pl, m) { tagged3(() => fireProjectiles(pl, m), p => { p.end = stoneEnd3; }); },
    afterP(pl, e, m, p) { if (!p.stone3 && !(p.pierce > 0)) stoneAt3(p, e); },
    ghostP(p, e) { if (!p.stone3 && !(p.pierce > 0)) stoneAt3(p, e); }
  };
  function stoneAt3(p, e) {
    const [nx, ny] = G.U.norm(p.vx || 0, p.vy || 0), d = (e ? e.r : 0) + 6;
    stone3(p, (e ? e.x : p.x) - nx * d, (e ? e.y : p.y) - ny * d);
  }
  function stoneEnd3(p) { if (!p.stone3) stone3(p, p.x, p.y); }
  function stone3(p, x, y) {
    p.stone3 = 1;
    const m = p.src, pl = p.owner;
    if (!m || !pl || G.World.isWall(x, y)) return;
    add3(pl, 'stone', { ghost: p.ghost, m, x, y, r: 10 * Math.max(1, p.r / 9), dur: m.hold || 2.5, shards: m.shards | 0, dmg: p.dmg,
                        pad: 40, tk: stoneTk3, dg: stoneDg3, da: stoneDa3 });
    cap3(pl, 'stone', 6);
    if (sees3(x, y)) G.Audio.sfx('thud');
  }
  function push3(e, x, y, r) {
    if (!free3(e)) return;
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 0.01, min = r + e.r * 0.8;
    if (d < min) { e.x = x + dx / d * min; e.y = y + dy / d * min; }
  }
  function stoneTk3(f) {
    if (f.t >= f.dur) {
      if (f.shards) {
        const m = f.m, s = sub3(m), v = visAs(m, 'rock', { proj: 'spike' });
        for (let i = 0; i < f.shards; i++) {
          const a = i * 6.2832 / f.shards + 0.3;
          shot3(f.owner, s, { x: f.x, y: f.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, dmg: f.dmg * 0.55, r: 6, life: 0.36, pierce: 2, vis: v, ghost: f.ghost, knock: 30 });
        }
        if (sees3(f.x, f.y)) { G.FX.burst(f.x, f.y - 6, '#c6b08a', 10, 160); G.Audio.sfx('break'); }
      } else if (sees3(f.x, f.y)) G.FX.burst(f.x, f.y - 4, '#8e7a5a', 6, 70);
      return true;
    }
    walls3.push(f.w3 || (f.w3 = { x: f.x, y: f.y, r: f.r }));
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r + 4)) push3(e, f.x, f.y, f.r);
    return false;
  }
  function stoneDg3(ctx, f, own) { ell3(ctx, f.x, f.y, f.r * 1.1, f.r * 0.45, '#000', 0.25 * own); }
  function stoneDa3(ctx, f, own) {
    const k = Math.min(1, f.t / 0.12), a = Math.min(1, (f.dur - f.t) * 4);
    G.VFX.draw(ctx, f.shards ? 'spike' : 'rock', 'rock', f.x, f.y - 7 - (1 - k) * 14, { scale: 1.5 * f.r / 10, alpha: a, frame: 1 });
  }

  // Avalancha → Trampa Rocas: caen y ruedan pantalla abajo; evolucionadas, se quedan de trampa.
  MECH3['rock-slide'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], n = Math.max(1, m.count | 0);
      const near = G.EnemyMgr.queryCircle(pl.x, pl.y, reach(m)).filter(e => !e.dead);
      for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = near[i]; near[i] = near[j]; near[j] = t; }
      const fall = 0.5 / pkOf(m).pspd, dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const e = near[i];
        add3(pl, 'slide', { m, col, vis: G.VFX.forMove(m), t: -i * 0.09, fall, r: m.radius, dmg, pad: 200,
                            x: e ? e.x + G.U.rand(-8, 8) : pl.x + G.U.rand(-140, 140), y: e ? e.y + G.U.rand(-6, 6) : pl.y + G.U.rand(-110, 110),
                            tk: slideTk3, dg: slideDg3, da: slideDa3 });
      }
    },
    afterP(pl, e, m, p) { if (p.roll3) interrupt3(e); }
  };
  function slideTk3(f) {
    if (f.t < f.fall) return false;
    const m = f.m, pl = f.owner;
    if (sees3(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4); G.FX.burst(f.x, f.y - 6, f.col, 12, 170); G.Audio.sfx('break'); if (!f.ghost) G.Camera.kick(0.1); }
    blast3(pl, m, f.x, f.y, f.r, f.dmg, { ghost: f.ghost, knock: m.knock || 0, each: interrupt3 });
    if (m.trap) {
      add3(pl, 'srock', { ghost: f.ghost, m, x: f.x, y: f.y, r: f.r * 0.8, dur: m.trap, tick: 0.1, log: new Map(), dmg: f.dmg * 0.45, pad: 40,
                          tk: srockTk3, dg: srockDg3 });
      cap3(pl, 'srock', 10);
    } else {
      // Rueda pantalla abajo arrollando (y cortando lo que preparen) a los que pilla.
      const v = (m.roll || 100) / 0.5;
      shot3(pl, m, { x: f.x, y: f.y, vx: G.U.rand(-20, 20), vy: v, dmg: f.dmg * 0.5, r: 10, life: 0.5, pierce: 99, roll3: 1, ghost: f.ghost, vis: f.vis, knock: 40 });
    }
    return true;
  }
  function slideDg3(ctx, f, own) {
    const k = G.U.clamp(f.t / f.fall, 0, 1);
    ell3(ctx, f.x, f.y, f.r * (0.3 + k * 0.7), f.r * 0.6 * (0.3 + k * 0.7), '#000', (0.2 + k * 0.3) * own);
  }
  function slideDa3(ctx, f) {
    if (f.t <= 0) return;
    const k = G.U.clamp(f.t / f.fall, 0, 1);
    G.VFX.draw(ctx, 'rock', 'rock', f.x + (1 - k) * 30, f.y - (1 - k) * 180 - 6, { scale: 2, frame: Math.floor(f.t * 10) });
  }
  // Trampa Rocas: piedras puntiagudas que dañan a quien pasa (según la tabla de tipos de Roca: ×2 a Volador, Fuego...).
  function srockTk3(f, dt) {
    if (f.t >= f.dur) return true;
    if ((f.tick -= dt) > 0 || f.ghost) return false;
    f.tick = 0.25;
    const pl = f.owner, s = sub3(f.m), col = G.U.TYPE_COLOR.rock;
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
      const last = f.log.get(e.id);
      if (e.dead || (last !== undefined && f.t - last < 0.8)) continue;
      f.log.set(e.id, f.t);
      hit(pl, e, f.dmg, col, e.x - f.x, e.y - f.y, 0, s);
      if (sees3(e.x, e.y, 10)) G.FX.sp('spike', 'rock', e.x, e.y - 6, { vy: -60, life: 0.25 });
    }
    return false;
  }
  function srockDg3(ctx, f, own) {
    const a = Math.min(1, (f.dur - f.t) * 2, f.t * 6) * own;
    ell3(ctx, f.x, f.y, f.r, f.r * 0.5, '#5a4a34', 0.25 * a);
    ctx.globalAlpha = a;
    for (let i = 0; i < 3; i++) G.VFX.draw(ctx, 'spike', 'rock', f.x + (i - 1) * f.r * 0.5, f.y - 4 - (i === 1 ? 4 : 0), { scale: 1 });
  }

  // Tumba Rocas → Testarazo: seis rocas encierran al blanco; evolucionada, te lanzas de cabeza y estallan.
  MECH3['rock-tomb'] = {
    cast(pl, m) {
      const tg = spotFor(pl, m);
      if (!tg) return;
      tomb3(pl, m, tg);
      let extra = Math.min(G.Moves.EXTRA_MAX, pkOf(m).amt | 0);           // Réplica: una tumba más por carta
      if (extra <= 0) return;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, reach(m))) { if (e !== tg && !e.dead && extra-- > 0) tomb3(pl, m, e); }
    }
  };
  function tomb3(pl, m, tg) {
    const R = m.radius * 0.9, rocks = [];
    for (let i = 0; i < 6; i++) { const a = i * 1.0472 + 0.26; rocks.push({ x: tg.x + Math.cos(a) * R, y: tg.y + Math.sin(a) * R, r: 11, a }); }
    add3(pl, 'tomb', { m, col: G.U.TYPE_COLOR[m.type], x: tg.x, y: tg.y, R, rocks, delay: 0.45, dur: 0.45 + (m.wall || 3), dmg: m.dmg * pl.atkFor(m),
                       inside: null, head: m.head ? 1 : 0, pad: R + 40, tk: tombTk3, dg: tombDg3, da: tombDa3 });
    cap3(pl, 'tomb', 4);
  }
  function tombTk3(f) {
    if (f.t < f.delay) return false;
    const m = f.m, pl = f.owner;
    if (!f.inside) {
      f.inside = new Set();
      if (sees3(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.R, f.col, 0.35, 4); G.FX.burst(f.x, f.y - 6, f.col, 14, 170); G.Audio.sfx('break'); }
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.R)) {
        if (e.dead) continue;
        f.inside.add(e.id);
        if (f.ghost) continue;
        hit(pl, e, f.dmg, f.col, e.x - f.x, e.y - f.y, 0, m);
        if (!e.dead) { e.applyStun((m.stun || 0.5) * (big3(e) ? 0.35 : 1)); e.applySlow(m.slow || 0.4, m.wall || 3); }
      }
      if (!f.ghost) for (const p of G.World.propsInCircle(f.x, f.y, f.R)) G.World.damageProp(p, f.dmg, f.col);
    }
    for (const w of f.rocks) walls3.push(w);
    // Encierro: los de dentro no salen y los de fuera no entran (los de verdad; los jefes rompen el cerco).
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.R + 30)) {
      if (!free3(e)) continue;
      const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy) || 0.01;
      if (f.inside.has(e.id)) { const lim = Math.max(4, f.R - e.r * 0.6); if (d > lim) { e.x = f.x + dx / d * lim; e.y = f.y + dy / d * lim; } }
      else { const lim = f.R + e.r * 0.6; if (d < lim) { e.x = f.x + dx / d * lim; e.y = f.y + dy / d * lim; } }
    }
    if (f.head === 1 && f.t >= f.delay + 0.15) { f.head = 2; headTomb3(f); return true; }
    return f.t >= f.dur;
  }
  /** Testarazo: te lanzas a la tumba y los muros salen hacia fuera como metralla. */
  function headTomb3(f) {
    const pl = f.owner, m = f.m, s = sub3(m), v = visAs(m, 'rock', { proj: 'rock' });
    if (!f.ghost && !pl.dead) {
      const dx = f.x - pl.x, dy = f.y - pl.y, d = Math.hypot(dx, dy);
      if (d < 300 && d > 1) {
        const ca = dx / d, sa = dy / d, want = Math.max(0, d - f.R * 0.4);
        let len = 0;
        for (let k = 8; k <= want; k += 8) { if (!G.World.isFree(pl.x + ca * k, pl.y + sa * k, (pl.wr || pl.r) * 0.8, true)) break; len = k; }
        for (let k = 0; k <= len; k += 22) G.FX.sp('streak', 'rock', pl.x + ca * k, pl.y + sa * k - G.LIFT * 0.6, { life: 0.22, angle: Math.atan2(sa, ca) });
        pl.x += ca * len; pl.y += sa * len;
        G.World.collide(pl);
        invuln3(pl, 0.4);
      }
      blast3(pl, s, f.x, f.y, f.R, f.dmg * 0.8, { knock: 140 });
      G.Camera.kick(0.25);
    }
    for (const w of f.rocks) for (const o of [-0.25, 0.25]) {
      const a = w.a + o;
      shot3(pl, s, { x: w.x, y: w.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, dmg: f.dmg * 0.35, r: 7, life: 0.4, pierce: 1, vis: v, ghost: f.ghost, knock: 40 });
    }
    if (sees3(f.x, f.y)) { G.FX.ring(f.x, f.y, f.R * 0.5, f.R * 2, f.col, 0.4, 5); G.FX.burst(f.x, f.y - 8, f.col, 18, 220); G.Audio.sfx('break'); }
  }
  function tombDg3(ctx, f, own) {
    if (f.t < f.delay) {
      const k = G.U.clamp(f.t / f.delay, 0, 1);
      ell3(ctx, f.x, f.y, f.R * k, f.R * k * 0.62, f.col, (0.12 + 0.2 * k) * own);
      ctx.globalAlpha = 0.8 * own; ctx.strokeStyle = f.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, f.R, f.R * 0.62, 0, 0, 6.2832); ctx.stroke();
    } else ell3(ctx, f.x, f.y, f.R, f.R * 0.62, '#3a2a18', 0.16 * own);
    for (const w of f.rocks) ell3(ctx, w.x, w.y, 12, 5, '#000', 0.25 * own);
  }
  function tombDa3(ctx, f) {
    const k = G.U.clamp(f.t / f.delay, 0, 1), a = Math.min(1, (f.dur - f.t) * 3);
    for (const w of f.rocks) G.VFX.draw(ctx, 'rock', 'rock', w.x, w.y - 9 - (1 - k) * 90, { scale: 1.8, alpha: a, frame: (w.a * 3) | 0 });
  }

  // Poder Pasado → Tormenta de Diamantes: las rocas que orbitan salen disparadas cada 2 s y vuelven a crecer.
  MECH3['ancient-power'] = {
    orb(pl, m, dt, orbs, g) {
      const st = ST3(m);
      if (m.gems) { const v = visAs(m, 'diamond', { proj: 'gem' }); for (const p of orbs) p.vis = v; }
      for (const p of orbs) {
        if (!(p.regrow3 > 0)) continue;
        p.regrow3 -= dt;
        p.alpha = p.regrow3 > 0 ? 0.35 : 1;
        p.ds = p.regrow3 > 0 ? 0.3 + 1.2 * (1 - p.regrow3 / 0.6) : 0;
      }
      st.lt = (st.lt == null ? 1 : st.lt) - dt;
      if (st.lt > 0) return;
      st.lt = 2;
      let any = false;
      for (const p of orbs) {
        if (p.regrow3 > 0) continue;
        const e = G.Projectiles.nearest(G.EnemyMgr.all(), p.x, p.y, 320);
        if (!e) continue;
        const a = Math.atan2(e.y - p.y, e.x - p.x), sp = 380 * pkOf(m).pspd;
        G.Projectiles.spawn(Object.assign({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: m.dmg * pl.atkFor(m) * 0.8, r: m.size,
                                            life: 0.9, pierce: 0, color: G.U.TYPE_COLOR[m.type], hits: new Set(), vis: p.vis, ghost: g, owner: pl, launched3: 1 }, payload(m)));
        p.regrow3 = 0.6; any = true;
        // 10 %: +1 a todas tus stats 5 s (Poder Pasado de los juegos).
        if (!g && Math.random() < 0.1) {
          for (const [k, v] of [['patk', 0.08], ['satk', 0.08], ['spd', 0.06], ['def', 0.05]]) pl.addBuff(k, v, 5, 3, 'ancient-power+');
          G.FX.ring(pl.x, pl.y, pl.r, pl.r * 3, '#9af0ff', 0.4, 3);
          G.FX.dmgText(pl.x, pl.y - pl.bodyH - 20, '¡Todo sube!', '#9af0ff');
        }
      }
      if (any && sees3(pl.x, pl.y)) G.Audio.sfx('shake');
    },
    afterP(pl, e, m, p) {
      if (!p.launched3 || !m.gems) return;
      blast3(pl, sub3(m), e.x, e.y, 36, p.dmg * 0.4);
      pl.addBuff('def', 0.04, 5, 5, 'ancient-power');
      if (sees3(e.x, e.y)) for (let i = 0; i < 5; i++) {
        const a = i * 1.2566;
        G.FX.sp('gem', 'diamond', e.x, e.y - e.bodyH * 0.5, { vx: Math.cos(a) * 120, vy: Math.sin(a) * 90, life: 0.3, scale: 0.6 });
      }
    }
  };

  // Joya de Luz → Rayo Meteórico: la gema se parte en dos al golpear; evolucionada, las ramas que fallan vuelven y cargan un rayo.
  MECH3['power-gem'] = {
    cast(pl, m) { tagged3(() => fireProjectiles(pl, m), p => { p.bounce = 0; p.split3 = m.bounce | 0; p.end = gemEnd3; }); },
    afterP(pl, e, m, p) { gemSplit3(p, e); },
    ghostP(p, e) { gemSplit3(p, e); }
  };
  function gemSplit3(p, e) {
    p.hit3 = true;
    if (!(p.split3 > 0)) return;
    const a = Math.atan2(p.vy, p.vx), sp = Math.hypot(p.vx, p.vy) || 320;
    for (const s of [-0.52, 0.52]) {
      const b = a + s;
      G.Projectiles.spawn({ x: e.x, y: e.y, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp, dmg: p.dmg * 0.75, r: Math.max(5, p.r * 0.9), life: 0.55,
                            pierce: 0, color: p.color, hits: new Set([e.id]), vis: p.vis, ghost: p.ghost, owner: p.owner, src: p.src, mtype: p.mtype,
                            mcat: p.mcat, knock: p.knock, split3: p.split3 - 1, end: gemEnd3 });
    }
    if (sees3(e.x, e.y, 10)) G.FX.spark(e.x, e.y - G.LIFT, '#ff9ab8', Math.cos(a), Math.sin(a), 4);
  }
  function gemEnd3(p) {
    const m = p.src;
    if (!m || !m.meteor || p.hit3 || !p.owner) return;
    add3(p.owner, 'gemback', { ghost: p.ghost, m, x: p.x, y: p.y, pad: 30, tk: gemBackTk3, da: gemBackDa3 });
    cap3(p.owner, 'gemback', 8);
  }
  function gemBackTk3(f, dt) {
    const pl = f.owner, dx = pl.x - f.x, dy = pl.y - f.y, d = Math.hypot(dx, dy);
    if (pl.dead || f.t > 3) return true;
    if (d > pl.r + 6) { const k = Math.min(d, 430 * dt) / (d || 1); f.x += dx * k; f.y += dy * k; return false; }
    if (!f.ghost) {
      const u = P3(pl);
      u.gems++;
      pl.addBuff('satk', 0.05, 6, 5, 'power-gem');
      if (u.gems >= 3) { u.gems = 0; meteorBeam3(pl, f.m); }
      else G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, u.gems + '/3', '#ff9ab8');
    }
    G.FX.ring(pl.x, pl.y, pl.r, pl.r * 1.8, '#ff9ab8', 0.2, 2);
    return true;
  }
  function gemBackDa3(ctx, f) { G.VFX.draw(ctx, 'gem', 'gem', f.x, f.y - G.LIFT, { scale: 1, frame: (f.t * 12) | 0 }); }
  /** Rayo Meteórico: con 3 gemas guardadas, un rayo con meteoritos. */
  function meteorBeam3(pl, m) {
    const g = ghost; ghost = false;
    try { ray3(pl, m, pl.aim, 300, 46, m.dmg * pl.atkFor(m) * 2.2, visAs(m, 'gem', { beam: 'rock' })); } finally { ghost = g; }
    G.Camera.kick(0.3); G.Audio.sfx('judge');
  }

  // Pedrada → Hachazo Pétreo: de 2 a 5 rocas al azar que botan; evolucionadas, cada una se parte en dos hachas.
  MECH3['rock-blast'] = {
    cast(pl, m) {
      const c0 = m.count, rnd = m.rnd | 0, full = pl.abilId === 'skill-link';
      const t = !ghost && pl.target && !pl.target.dead ? pl.target : null;
      let ty;
      if (t && !pl.manualAim) ty = t.y;
      else { const d = ghost ? 200 : t ? G.U.clamp(G.U.dist(pl.x, pl.y, t.x, t.y), 60, 360) : 220; ty = pl.y + Math.sin(pl.aim) * d; }
      m.count = c0 + (full ? rnd : Math.floor(Math.random() * (rnd + 1)));
      try { tagged3(() => lob(pl, m), p => { p.land3 = ty + G.U.rand(-6, 6); p.upd3 = blastUpd3; }); } finally { m.count = c0; }
    }
  };
  function blastUpd3(p) {
    if (!(p.vy > 0) || p.y < p.land3) return false;
    if (sees3(p.x, p.y, 20)) G.FX.burst(p.x, p.y - 2, '#aa7c3c', 4, 60);
    if (p.b3) return true;
    p.b3 = 1; p.vy = -Math.abs(p.vy) * 0.32; p.vx *= 0.55; p.y = p.land3 - 1;
    if (sees3(p.x, p.y, 20)) G.Audio.sfx('thud');
    const m = p.src;
    if (m && m.axes) {
      const s = sub3(m), v = visAs(m, 'rock', { proj: 'axe' });
      for (const dir of [-1, 1]) G.Projectiles.spawn({ x: p.x, y: p.land3, vx: dir * 220, vy: 0, dmg: p.dmg * 0.6, r: 8, life: 0.4, pierce: 3,
                                                       color: p.color, hits: new Set(), vis: v, ghost: p.ghost, owner: p.owner, src: s, mtype: p.mtype, mcat: p.mcat, knock: 50 });
    }
    return false;
  }

  // Rodar → Romperrocas: cada golpe seguido dobla el daño (hasta ×8); evolucionada, a ×8 estalla y rompe rocas.
  MECH3['rollout'] = {
    cast(pl, m) {
      const b = pl.buffs && pl.buffs.def, c0 = b && b.src && b.src.some(s => s.id === 'harden' && s.n > 0) ? 2 : 1;   // con Fortaleza, desde ×2
      tagged3(() => carom(pl, m), p => { p.c0 = c0; p.combo3 = c0; p.last3 = 0; p.upd3 = rollUpd3; p.vis = rollVis3(m, c0); });
    },
    k(pl, e, m, d, p) { return p && p.combo3 ? p.combo3 : 1; },
    afterP(pl, e, m, p) { rollHit3(p, m, false); },
    ghostP(p) { if (p.src) rollHit3(p, p.src, true); }
  };
  function rollVis3(m, c) { return c >= 4 ? visAs(m, 'rockhot', { proj: 'rock', trail: c >= 8 ? 'ember' : 'dirt' }) : G.VFX.forMove(m); }
  function rollHit3(p, m, g) {
    if (!p.combo3) return;
    p.last3 = p.t;
    if (p.combo3 >= 8 && m.crush) { crush3(p, m, g); p.combo3 = p.c0; }
    else p.combo3 = Math.min(8, p.combo3 * 2);
    p.vis = rollVis3(m, p.combo3);
    p.ds = 1.5 + Math.log2(p.combo3) * 0.2;
    if (sees3(p.x, p.y, 20) && p.combo3 >= 4) G.FX.dmgText(p.x, p.y - G.LIFT - 14, '×' + p.combo3, p.combo3 >= 8 ? '#ff7a3d' : '#ffb070');
  }
  function rollUpd3(p) {
    if (p.combo3 > p.c0 && p.t - p.last3 > 1) { p.combo3 = p.c0; p.vis = rollVis3(p.src, p.c0); p.ds = 0; }
    return false;
  }
  /** Romperrocas: estalla, rompe las rocas del mapa cercanas y sueltan metralla. */
  function crush3(p, m, g) {
    const pl = p.owner, s = sub3(m), R = m.crush || 80, v = visAs(m, 'rock', { proj: 'rock' });
    if (sees3(p.x, p.y)) { G.FX.ring(p.x, p.y, 6, R, '#aa7c3c', 0.4, 5); G.FX.burst(p.x, p.y - 8, '#d85a24', 20, 220); G.Audio.sfx('break'); }
    if (g) return;
    blast3(pl, s, p.x, p.y, R, p.dmg * 2, { knock: 140 });
    G.Camera.kick(0.3);
    for (const pr of G.World.propsInCircle(p.x, p.y, R + 20)) {
      if (!pr.solid) continue;
      G.World.damageProp(pr, 1e6, '#aa7c3c');
      for (let i = 0; i < 4; i++) {
        const a = i * 1.5708 + 0.4;
        shot3(pl, s, { x: pr.x, y: pr.y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, dmg: p.dmg * 0.5, r: 6, life: 0.35, pierce: 1, vis: v, knock: 30 });
      }
    }
  }

  // ==== mech: fantasma ====
  // Lengüetazo → Puño Sombra: lametazo en línea que atraviesa paredes y paraliza; evolucionado, puños desde tu sombra.
  MECH3['lick'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], dmg = m.dmg * pl.atkFor(m);
      if (m.count > 0) { shadowFists3(pl, m, dmg, col); return; }
      const vis = G.VFX.forMove(m), len = m.radius * 1.7, dirs = m.arc > 6 ? 4 : 1;
      for (let i = 0; i < dirs; i++) {
        const a = pl.aim + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
        G.FX.beam(pl.x + ca * 6, pl.y - G.LIFT * 0.6 + sa * 6, a, len, 9, col, vis);
        if (ghost) continue;
        lineHit3(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, 18, e => { hit(pl, e, dmg, col, ca, sa, 0, m); if (!e.dead) inflict(e, 'para', m.para || 2); });
        lineProps3(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, 18, dmg, col);
      }
      if (!ghost) G.Camera.kick(0.05);
    }
  };
  function shadowFists3(pl, m, dmg, col) {
    const list = nearestN3(pl.x, pl.y, 240, Math.max(1, m.count | 0)), R = 40 * Math.max(1, m.radius / 72);
    for (const e of list) {
      if (sees3(e.x, e.y)) {
        G.FX.sp('fist', 'umbra', e.x, e.y + 4, { vy: -170, life: 0.3, scale: 1.5, fade: false });
        G.FX.ring(e.x, e.y, 4, R + e.r, '#3c2468', 0.25, 3);
      }
      if (ghost) continue;
      // El puño sale bajo él y la sombra salpica a los de al lado.
      hit(pl, e, dmg, col, 0, -1, 0, m);
      if (!e.dead) inflict(e, 'para', 1);
      for (const o of G.EnemyMgr.queryCircle(e.x, e.y, R)) if (o !== e && !o.dead) hit(pl, o, dmg * 0.7, col, o.x - e.x, o.y - e.y, 0, sub3(m));
    }
    if (list.length && sees3(pl.x, pl.y)) G.FX.ring(pl.x, pl.y, pl.r * 0.5, pl.r * 2, '#3c2468', 0.25, 2);
  }

  // Bola Sombra → Golpe Fantasma: crece con cada enemigo que atraviesa; evolucionada, salta dentro del blanco y estalla.
  MECH3['shadow-ball'] = {
    // (Evolucionada no golpea por el camino: sólo el estallido dentro del blanco.)
    cast(pl, m) { tagged3(() => fireProjectiles(pl, m), p => { p.r0 = p.r; if (m.phase) { p.sx3 = p.x; p.sy3 = p.y; p.upd3 = phaseUpd3; p.only3 = -1; p.alpha = 0.8; } }); },
    afterP(pl, e, m, p) { grow3(p); if (Math.random() < 0.15) inflict(e, 'vuln', 5, 1); },
    ghostP(p) { grow3(p); }
  };
  function grow3(p) {
    if (!p.r0 || p.r > p.r0 * 2) return;
    p.r *= 1.15; p.dmg *= 1.15; p.ds = 1.5 * p.r / Math.max(8, p.r0);
  }
  function phaseUpd3(p) {
    if (p.ph3 || (p.x - p.sx3) ** 2 + (p.y - p.sy3) ** 2 < (p.src.phase || 80) ** 2) return false;
    p.ph3 = 1;
    const pl = p.owner, t0 = pl.target;
    const tg = t0 && !t0.dead && (t0.x - p.x) ** 2 + (t0.y - p.y) ** 2 < 300 * 300 ? t0 : G.Projectiles.nearest(G.EnemyMgr.all(), p.x, p.y, 300);
    if (!tg) return false;
    if (sees3(p.x, p.y)) G.FX.ring(p.x, p.y - G.LIFT, p.r, 2, '#9e8aea', 0.2, 2);
    if (sees3(tg.x, tg.y)) {
      G.FX.ring(tg.x, tg.y, 4, 50, '#9e8aea', 0.3, 4);
      G.FX.burst(tg.x, tg.y - tg.bodyH * 0.5, '#7a52c0', 14, 170);
      G.FX.sp('shadow', 'umbra', tg.x, tg.y - tg.bodyH * 0.5, { life: 0.3, scale: 2.5 });
      G.Audio.sfx('break');
    }
    if (!p.ghost) {
      const m = p.src, col = G.U.TYPE_COLOR.ghost;
      for (const e of G.EnemyMgr.queryCircle(tg.x, tg.y, 50)) {
        if (e.dead) continue;
        const sh = !e.remote ? e.shield || 0 : 0;               // sin que lo paren los escudos
        if (sh > 0) e.shield = 0;
        hit(pl, e, p.dmg, col, e.x - tg.x, e.y - tg.y, 0, m);
        if (sh > 0 && !e.dead) e.shield = sh;
      }
    }
    return true;
  }

  // Infortunio → Poltergeist: salta sólo entre los que tienen algún estado y se los alarga; evolucionado, objetos fantasma.
  MECH3['hex'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
      let cur = pl.target && !pl.target.dead && pl.target.hurt ? pl.target : G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, reach(m));
      if (!cur) return;
      let fx = pl.x, fy = pl.y - G.LIFT, k = 1;
      const done = new Set(), got = [], n = Math.max(1, m.count | 0);
      for (let i = 0; i < n && cur; i++) {
        done.add(cur.id);
        const tx = cur.x, ty = cur.y - (cur.bodyH || 20) * 0.5;
        G.FX.beam(fx, fy, Math.atan2(ty - fy, tx - fx), Math.hypot(tx - fx, ty - fy), 10, col, vis);
        if (!ghost) {
          const cursed = nStat3(cur) > 0;
          hit(pl, cur, m.dmg * pl.atkFor(m) * k * (cursed ? m.hex || 1.7 : 1), col, tx - fx, ty - fy, 0, m);
          if (!cur.dead) { extend3(cur, 1); inflict(cur, 'curse', 3); got.push(cur); }
        }
        k *= 0.88; fx = tx; fy = ty;
        // El primer salto contagia a cualquiera; después, sólo a los que ya sufren algo.
        let best = null, bd = m.radius * m.radius;
        for (const e of G.EnemyMgr.queryCircle(cur.x, cur.y, m.radius)) {
          if (done.has(e.id) || e.dead || (i > 0 && !nStat3(e))) continue;
          const d = G.U.dist2(cur.x, cur.y, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        cur = best;
      }
      if (!ghost) G.Camera.kick(0.05);
      if (m.polter && !ghost) { let left = 12; for (const e of got) left -= polter3(pl, m, e, left); }
    }
  };
  /** Poltergeist: un objeto fantasma por cada estado del enemigo, desde el borde de la caja. → cuántos. */
  function polter3(pl, m, e, left) {
    const n = Math.min(3, nStat3(e), left), s = sub3(m), v = visAs(m, 'umbra', { proj: 'gobj' });
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1, x = pl.x + side * 330, y = e.y + G.U.rand(-140, 140);
      const a = Math.atan2(e.y - y, e.x - x);
      shot3(pl, s, { x, y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, dmg: m.dmg * pl.atkFor(m) * 0.45, r: 7, life: 1.6, pierce: 0, vis: v,
                     alpha: 0.85, lock3: e, only3: e.id, upd3: lockUpd3 });
    }
    return n;
  }
  /** Va a por su blanco (lock3); si cae, sigue recto y golpea a cualquiera. */
  function lockUpd3(p, dt) {
    const e = p.lock3;
    if (e && !e.dead) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, sp = Math.hypot(p.vx, p.vy) || 300;
      p.vx = G.U.damp(p.vx, dx / d * sp, 12, dt); p.vy = G.U.damp(p.vy, dy / d * sp, 12, dt);
    } else if (p.only3) { p.only3 = 0; p.lock3 = null; }
    return false;
  }

  // Sombra Vil → Garra Umbría: tu sombra llega al instante y lo clava; evolucionada, tres garras salen de ella.
  MECH3['shadow-sneak'] = {
    reach: m => (m.range || 200) + 20,
    cast(pl, m) {
      const R = (m.range || 200) + 20, col = G.U.TYPE_COLOR[m.type], dmg = m.dmg * pl.atkFor(m);
      const t = pl.target;
      const first = t && !t.dead && (t.x - pl.x) ** 2 + (t.y - pl.y) ** 2 <= R * R ? t : G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, R);
      if (!first) return;
      const list = [first].concat(nearestN3(pl.x, pl.y, R, Math.max(1, m.count | 0) - 1, first));
      for (const e of list) {
        add3(pl, 'sneak', { x: pl.x, y: pl.y, x1: e.x, y1: e.y, dur: 0.35, pad: R, tk: f => f.t >= f.dur, dg: sneakDg3 });
        if (m.claws) { claws3(pl, m, e, dmg, col); continue; }
        if (!ghost) { hit(pl, e, dmg, col, e.x - pl.x, e.y - pl.y, 0, m); if (!e.dead) inflict(e, 'root', 0.6); }
        else if (real3(e)) inflict(e, 'root', 0.6);
      }
      if (sees3(pl.x, pl.y)) G.Audio.sfx('grass');
    }
  };
  function claws3(pl, m, e, dmg, col) {
    if (sees3(e.x, e.y)) for (let i = 0; i < 3; i++) {
      G.FX.sp('claw', 'umbra', e.x + (i - 1) * 9, e.y - e.bodyH * 0.5 + (i - 1) * 3, { life: 0.25, scale: 1.5, angle: -0.6 + i * 0.25 });
    }
    if (ghost) { if (real3(e)) inflict(e, 'root', 0.6); return; }
    for (const o of G.EnemyMgr.queryCircle(e.x, e.y, 50)) {
      if (o.dead) continue;
      crit3f = Math.random() < 0.3;
      try { hit(pl, o, dmg, col, o.x - pl.x, o.y - pl.y, 0, m); } finally { crit3f = false; }
    }
    if (!e.dead) inflict(e, 'root', 0.6);
  }
  function sneakDg3(ctx, f, own) {
    const a = Math.min(1, (f.dur - f.t) * 5) * own;
    ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = '#120a20'; ctx.lineCap = 'round'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x1, f.y1); ctx.stroke();
    ctx.lineCap = 'butt';
    ell3(ctx, f.x1, f.y1, 14, 6, '#1e1030', 0.6 * a);
  }

  // Viento Aciago → Golpe Umbrío: hace girar a los enemigos (no los atrae) y los marea; evolucionado, sales de él golpeando.
  MECH3['ominous-wind'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], tg = spotFor(pl, m);
      const x = tg ? tg.x : pl.x + Math.cos(pl.aim) * 120, y = tg ? tg.y : pl.y + Math.sin(pl.aim) * 100;
      const f = add3(pl, 'owind', { m, col, vis: G.VFX.forMove(m), x, y, r: m.radius, dur: m.dur || 2.6, tick: 0.15, dmg: m.dmg * pl.atkFor(m),
                                    spin: m.pull || 160, sneak: m.sneak ? 1 : 0, pad: m.radius + 30, tk: owindTk3, dg: owindDg3 });
      cap3(pl, 'owind', 2);
      G.FX.ring(x, y, m.radius, 6, col, 0.4, 3);
      if (f.sneak && !ghost && !pl.dead) {
        if ((x - pl.x) ** 2 + (y - pl.y) ** 2 > 340 * 340) f.sneak = 0;
        else { P3(pl).hide = 1; invuln3(pl, 1); G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#33256a', 12, 120); }
      }
    }
  };
  function owindTk3(f, dt) {
    if (f.t >= f.dur) return true;
    // Centrifugadora: giran alrededor del centro (y se juntan un poco), los de verdad.
    const k = f.spin * dt;
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r * 1.2)) {
      if (!free3(e)) continue;
      const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy);
      if (d < 3) continue;
      e.x += (-dy / d) * k - dx / d * k * 0.12; e.y += (dx / d) * k - dy / d * k * 0.12;
    }
    if ((f.tick -= dt) <= 0) {
      f.tick = 0.4;
      blast3(f.owner, f.m, f.x, f.y, f.r, f.dmg, { ghost: f.ghost, each: e => { if (Math.random() < 0.2) inflict(e, 'confuse', 1.5); } });
    }
    if (Math.random() < dt * 14 && sees3(f.x, f.y)) {
      const a = Math.random() * 6.2832, rr = f.r * G.U.rand(0.4, 1);
      G.FX.sp('leaf', 'umbra', f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.6 - 6,
              { vx: -Math.sin(a) * 140, vy: Math.cos(a) * 80, life: 0.45, spin: 8 });
    }
    if (f.sneak === 1 && f.t >= 1) { f.sneak = 2; sneakOut3(f); }
    return false;
  }
  /** Golpe Umbrío: reapareces en el centro del remolino con un golpe que lanza fuera a todos. */
  function sneakOut3(f) {
    const pl = f.owner, R = f.r * 1.3;
    if (sees3(f.x, f.y)) {
      G.FX.ring(f.x, f.y, 6, R, '#7a52c0', 0.4, 5); G.FX.burst(f.x, f.y - 10, '#33256a', 20, 220);
      G.FX.sp('shadow', 'umbra', f.x, f.y - 14, { life: 0.35, scale: 3 });
      G.Audio.sfx('break');
    }
    if (f.ghost || pl.dead) return;
    if (G.World.isFree(f.x, f.y, (pl.wr || pl.r) * 0.8, true)) { pl.x = f.x; pl.y = f.y; G.World.collide(pl); }
    blast3(pl, sub3(f.m), f.x, f.y, R, f.dmg * 2, { knock: 360 });
    G.Camera.kick(0.3);
  }
  function owindDg3(ctx, f, own, now) {
    const a = Math.min(1, (f.dur - f.t) * 2, f.t * 6) * own;
    ell3(ctx, f.x, f.y, f.r, f.r * 0.6, '#33256a', 0.22 * a);
    ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = '#9e8aea'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const rr = f.r * (0.3 + k * 0.3), a0 = -now * (4 - k) + k * 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.6, 0, a0, a0 + 2.6); ctx.stroke();
    }
    // Ojos en el remolino.
    ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(now * 3));
    ctx.fillStyle = '#ff5a8a';
    ctx.fillRect(Math.round(f.x - 6), Math.round(f.y - 3), 3, 2); ctx.fillRect(Math.round(f.x + 3), Math.round(f.y - 3), 3, 2);
  }

  // Homenaje Póstumo → Marcha Espectral: más espíritus y más fuertes con tus KO recientes; evolucionado, los caídos se levantan.
  MECH3['last-respects'] = {
    cast(pl, m) {
      const ko = ghost ? 0 : recentKO3(pl), c0 = m.count, d0 = m.dmg;
      m.count = c0 + Math.min(4, Math.floor(ko / 15));
      m.dmg = d0 * (1 + Math.min(0.5, Math.floor(ko / 10) * 0.05));
      try { allies(pl, m); } finally { m.count = c0; m.dmg = d0; }
      if (ko >= 15 && !ghost) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, '+' + Math.min(4, Math.floor(ko / 15)), '#a8b4ff');
    },
    after(pl, e, m) { if (m.raise && e.dead && !e.remote) rise3(pl, m, e); }
  };
  function rise3(pl, m, e) {
    let n = 0;
    for (const f of fields) if (f.risen && f.owner === pl && !f.gone) n++;
    if (n >= (m.raise || 4) || !G.Sprites.Animator) return;
    fields.push({ kind: 'ally', owner: pl, ghost: false, m, col: '#7a52c0', vis: visAs(m, 'umbra'), x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 3,
                  r: 9, tgt: null, look: 0, wa: 0, hitLog: new Map(), ph: Math.random() * 6.2832, pad: 40, dmg: m.dmg * pl.atkFor(m) * 0.9, risen: true,
                  anim: new G.Sprites.Animator(e.dex, (e.scale || 1) * 0.85, false) });
    if (sees3(e.x, e.y)) { G.FX.ring(e.x, e.y, 4, 26, '#9e8aea', 0.35, 3); G.FX.burst(e.x, e.y - 10, '#5c48aa', 10, 120); }
  }

  // Orbes Espectro → Rayo Umbrío: caen en corona sobre el que más vida tiene; evolucionados, dejan grietas que disparan.
  MECH3['astral-barrage'] = {
    cast(pl, m) {
      let tg = null, best = -1;
      for (const e of G.EnemyMgr.all()) {
        if (e.dead || Math.abs(e.x - pl.x) > RAIN_W || Math.abs(e.y - pl.y) > RAIN_H) continue;
        if (e.hp > best) { best = e.hp; tg = e; }
      }
      if (!tg) { shower(pl, m); return; }
      add3(pl, 'corona', { m, vis: G.VFX.forMove(m), e: tg, x: tg.x, y: tg.y, n: Math.max(1, m.count | 0), i: 0, next: 0, a0: Math.random() * 6.2832,
                           dmg: m.dmg * pl.atkFor(m), pad: 300, tk: coronaTk3 });
    },
    afterP(pl, e, m, p) { if (m.cracks && !p.cr3) { p.cr3 = 1; crack3(pl, m, p.x, p.y, p.dmg, false); } },
    ghostP(p) { if (p.src && p.src.cracks && !p.cr3) { p.cr3 = 1; crack3(p.owner, p.src, p.x, p.y, p.dmg, true); } }
  };
  function coronaTk3(f, dt) {
    const pl = f.owner, m = f.m;
    if (pl.dead) return true;
    if (f.e && !f.e.dead) { f.x = f.e.x; f.y = f.e.y; }
    f.next -= dt;
    while (f.next <= 0 && f.i < f.n) {
      f.next += 0.05;
      const a = f.a0 + f.i * 6.2832 / f.n, sx = f.x + Math.cos(a) * 70, sy = f.y + Math.sin(a) * 42 - 240;
      const T = 240 / ((m.speed || 230) * pkOf(m).pspd);
      // (Se desvían hacia él si se mueve: lock3.)
      G.Projectiles.spawn(Object.assign({ x: sx, y: sy, vx: (f.x - sx) / T, vy: (f.y - sy) / T, air: true, noShadow: true, alpha: 0.9,
                                          dmg: f.dmg, r: m.size, life: T + 0.12, pierce: Infinity, color: G.U.TYPE_COLOR[m.type],
                                          hits: new Set(), vis: f.vis, ghost: f.ghost, owner: pl, lock3: f.e, upd3: lockUpd3 }, payload(m)));
      f.i++;
    }
    return f.i >= f.n;
  }
  function crack3(pl, m, x, y, dmg, g) {
    add3(pl, 'crack', { ghost: g, m, x, y, dur: 0.8, at: 0.5, done: false, dmg: dmg * 0.8, pad: 40, tk: crackTk3, dg: crackDg3 });
    cap3(pl, 'crack', 16);
  }
  function crackTk3(f) {
    if (!f.done && f.t >= f.at) {
      f.done = true;
      if (sees3(f.x, f.y)) { G.FX.beam(f.x, f.y - 2, -Math.PI / 2, 74, 10, '#3c2468', { pal: 'umbra' }); G.FX.burst(f.x, f.y - 6, '#5a6aff', 6, 90); }
      if (!f.ghost) blast3(f.owner, sub3(f.m), f.x, f.y, 24, f.dmg);
    }
    return f.t >= f.dur;
  }
  function crackDg3(ctx, f, own) {
    const a = Math.min(1, (f.dur - f.t) * 4, f.t * 8) * own;
    ctx.globalAlpha = a;
    G.VFX.draw(ctx, 'crack', 'umbra', f.x, f.y, { scale: 1.3 });
  }

  // ==== mech: dragón ====
  // Furia Dragón → Cometa Draco: +25% por lanzamiento seguido al mismo blanco (hasta ×2); evolucionada, cometas y cansancio.
  MECH3['dragon-rage'] = {
    cast(pl, m) {
      const st = ST3(m), tg = pl.target && !pl.target.dead ? pl.target : null;
      st.k = tg && st.tg === tg.id ? Math.min(2, (st.k || 1) + 0.25) : 1;
      st.tg = tg ? tg.id : 0;
      const vis = st.k >= 1.75 ? visAs(m, 'dragonhot', { beam: 'fire' }) : G.VFX.forMove(m);
      const len = ray3(pl, m, pl.aim, m.radius, m.width * (0.85 + 0.15 * st.k), m.dmg * pl.atkFor(m) * st.k, vis);
      if (st.k > 1 && !ghost) G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, '×' + st.k.toFixed(2).replace(/\.?0+$/, ''), st.k >= 2 ? '#e0c8ff' : '#a490ff');
      if (!m.comets) return;
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), n = m.comets | 0, dmg = m.dmg * pl.atkFor(m) * 0.4, cv = visAs(m, 'dragonhot', { proj: 'fire' });
      for (let i = 0; i < n; i++) {
        const d = len * (i + 0.7) / (n + 0.2);
        add3(pl, 'comet', { m, col: '#a45cff', vis: cv, x: pl.x + ca * d + G.U.rand(-10, 10), y: pl.y + sa * d + G.U.rand(-8, 8), fall: 0.3 + i * 0.08,
                            r: 42, dmg, pad: 200, tk: cometTk3, dg: slideDg3, da: cometDa3 });
      }
      if (!ghost) pl.addBuff('satk', -0.3, 3, 1, 'draco-meteor');        // y luego te cansas
    }
  };
  function cometTk3(f) {
    if (f.t < f.fall) return false;
    if (sees3(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4); G.FX.burst(f.x, f.y - 6, f.col, 12, 170); G.Audio.sfx('break'); }
    blast3(f.owner, sub3(f.m), f.x, f.y, f.r, f.dmg, { ghost: f.ghost, knock: 60 });
    return true;
  }
  function cometDa3(ctx, f) {
    if (f.t <= 0) return;
    const k = G.U.clamp(f.t / f.fall, 0, 1), x = f.x + (1 - k) * 60, y = f.y - (1 - k) * 200 - 6;
    G.VFX.draw(ctx, 'fire', 'dragonhot', x, y, { scale: 2, angle: Math.atan2(200, -60), frame: Math.floor(f.t * 12) });
    if (Math.random() < 0.5) G.FX.px(x + G.U.rand(-3, 3), y, '#e0c8ff', { vx: 40, vy: -60, life: 0.3 });
  }

  // Danza Dragón → Estruendo Escama: ataque y velocidad a la vez; evolucionada, todo y un rugido que asusta.
  MECH3['dragon-dance'] = {
    cast(pl, m) {
      buff(pl, m);
      const S = m.stacks | 0;
      pl.addBuff('spd', m.amount * 0.75, m.dur, S, m.id + '+spd');
      if (!m.all) return;
      pl.addBuff('satk', m.amount, m.dur, S, m.id + '+satk');
      pl.addBuff('def', m.amount * 0.5, m.dur, S, m.id + '+def');
      if (ghost) return;
      const b = pl.buffs && pl.buffs.patk, s = b && b.src && b.src.find(o => o.id === m.id), st = ST3(m), full = !!(s && s.n >= S);
      if (full && !st.full && T3() >= (st.roarAt || 0)) { st.roarAt = T3() + 5; roar3(pl); }
      st.full = full;
    }
  };
  function roar3(pl) {
    G.FX.ring(pl.x, pl.y, pl.r, 150, '#a490ff', 0.45, 5);
    G.FX.ring(pl.x, pl.y, pl.r, 110, '#ffd23f', 0.35, 3);
    for (let i = 0; i < 8; i++) {
      const a = i * 0.785;
      G.FX.sp('scale', 'dragon', pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.8 - G.LIFT * 0.5,
              { vx: Math.cos(a) * 260, vy: Math.sin(a) * 200, life: 0.35, angle: a });
    }
    G.Camera.kick(0.25); G.Audio.sfx('surge');
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 150)) if (!e.dead) inflict(e, 'fear', 1.2, [pl.x, pl.y]);
  }

  // Dragoaliento → Pulso Dragón: abanico que atraviesa y pega más de cerca (×1,3 → ×0,6), a veces paraliza;
  // evolucionado, una cabeza de dragón que avanza y muerde.
  MECH3['dragon-breath'] = {
    cast(pl, m) {
      if (m.pulse) { dragonPulse3(pl, m); return; }
      tagged3(() => cone(pl, m), p => { p.sx3 = p.x; p.sy3 = p.y; p.rng3 = m.speed * m.life; });
    },
    k(pl, e, m, d, p) {
      if (!p || !p.rng3) return 1;
      return 1.3 - 0.7 * Math.min(1, Math.hypot(p.x - p.sx3, p.y - p.sy3) / p.rng3);
    },
    afterP(pl, e) { if (Math.random() < 0.3) inflict(e, 'para', 1.5); }
  };
  function dragonPulse3(pl, m) {
    const n = G.U.clamp(Math.round((m.count | 0) / 5), 1, 3), sp = (m.speed || 330) * 1.2, v = visAs(m, 'dragon', { proj: 'dragonhead' });
    for (let i = 0; i < n; i++) {
      const a = pl.aim + (i - (n - 1) / 2) * 0.42;
      const d = m.dmg * pl.atkFor(m);
      shot3(pl, m, { x: pl.x + Math.cos(a) * 6, y: pl.y + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: d * 0.8,
                     r: 13, ds: 2, life: 200 / sp, pierce: Infinity, vis: v, end: bite3, bite3: d * 1.6 });
    }
    G.FX.spark(pl.x + Math.cos(pl.aim) * pl.r, pl.y - G.LIFT + Math.sin(pl.aim) * pl.r, '#a490ff', Math.cos(pl.aim), Math.sin(pl.aim), 6);
  }
  function bite3(p) {
    if (sees3(p.x, p.y)) {
      G.FX.sp('jaws', 'dragon', p.x, p.y - G.LIFT, { life: 0.3, scale: 2.5, frameRate: 7, fade: false });
      G.FX.ring(p.x, p.y, 4, 60, '#6b58ff', 0.3, 4);
      G.Audio.sfx('break');
    }
    if (!p.ghost && p.src) blast3(p.owner, sub3(p.src), p.x, p.y, 60, p.bite3 || p.dmg, { knock: 80, each: e => { if (Math.random() < 0.3) inflict(e, 'para', 1.5); } });
  }

  // Garra Dragón → Carga Dragón: el zarpazo lanza tres cortes; evolucionada, embestida en semicírculo hasta detrás del blanco.
  MECH3['dragon-claw'] = {
    cast(pl, m) {
      if (m.charge && !ghost && uCharge3(pl, m)) return;
      melee(pl, m);
      const v = visAs(m, 'dragon', { proj: 'crescent' }), s = sub3(m), sp = 320, dirs = m.arc > 6 ? 6 : 3, r0 = m.radius * 0.7;
      for (let i = 0; i < dirs; i++) {
        const a = dirs === 3 ? pl.aim + (i - 1) * 0.32 : pl.aim + i * 6.2832 / dirs;
        shot3(pl, s, { x: pl.x + Math.cos(a) * r0, y: pl.y + Math.sin(a) * r0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: m.dmg * pl.atkFor(m) * 0.4,
                       r: 8, life: 0.3, pierce: 2, vis: v });
      }
    }
  };
  /** Carga Dragón: rodeas al blanco en U cortando todo lo del arco y acabas detrás. → false si no hay blanco. */
  function uCharge3(pl, m) {
    const t = pl.target;
    if (!t || t.dead || (t.x - pl.x) ** 2 + (t.y - pl.y) ** 2 > (m.radius + 90) ** 2) return false;
    const col = G.U.TYPE_COLOR[m.type], R = 60 + (t.r || 12), a0 = Math.atan2(pl.y - t.y, pl.x - t.x), side = Math.random() < 0.5 ? -1 : 1;
    const dmg = m.dmg * pl.atkFor(m), done = new Set(), wr = (pl.wr || pl.r) * 0.8;
    let px = pl.x, py = pl.y;
    for (let k = 1; k <= 10; k++) {
      const a = a0 + side * k * Math.PI / 10, nx = t.x + Math.cos(a) * R, ny = t.y + Math.sin(a) * R;
      if (!G.World.isFree(nx, ny, wr, true)) break;
      lineHit3(px, py, nx, ny, 44, e => {
        if (done.has(e.id)) return;
        done.add(e.id);
        hit(pl, e, dmg, col, e.x - t.x, e.y - t.y, m.knock || 0, m);
      });
      lineProps3(px, py, nx, ny, 44, dmg, col);
      G.FX.sp('claw', 'dragon', nx, ny - G.LIFT * 0.5, { life: 0.25, angle: a + side * Math.PI / 2 });
      px = nx; py = ny;
    }
    pl.x = px; pl.y = py;
    G.World.collide(pl);
    invuln3(pl, 0.35);
    // Y desde detrás, el zarpazo al blanco (y a los de su lado).
    const a = Math.atan2(t.y - pl.y, t.x - pl.x);
    G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, a, m.radius, 2.4, col, G.VFX.forMove(m));
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
      if (!e.dead && !done.has(e.id) && inArc(pl.x, pl.y, e.x, e.y, a, 1.2)) hit(pl, e, dmg, col, e.x - pl.x, e.y - pl.y, m.knock || 0, m);
    }
    G.Camera.kick(0.15);
    return true;
  }

  // Enfado → Dracoflecha: frenesí de 2,5 s que se ensancha y acelera, y luego te mareas; evolucionado, dos Dreepy van y vuelven.
  MECH3['outrage'] = {
    cast(pl, m) {
      const dur = 1.5 + 0.25 * (m.count | 0);
      // Si sigue en el frenesí, se alarga (sin volver a empezar pequeño).
      for (const f of fields) if (f.k3 === 'frenzy' && f.owner === pl && !f.gone && f.t < f.dur) { f.dur = f.t + dur; f.m = m; f.dmg = m.dmg * pl.atkFor(m); return; }
      add3(pl, 'frenzy', { m, col: G.U.TYPE_COLOR[m.type], vis: G.VFX.forMove(m), dur, next: 0, a: pl.aim,
                           dmg: m.dmg * pl.atkFor(m), R: 50, pad: 140, tk: frenzyTk3, dg: frenzyDg3 });
    },
    afterP(pl, e, m, p) { if (p.dart3) { p.back3 = true; p.only3 = -1; } },
    ghostP(p) { if (p.dart3) { p.back3 = true; p.only3 = -1; } }
  };
  function frenzyTk3(f, dt) {
    const pl = f.owner, m = f.m;
    if (pl.dead) return true;
    f.x = pl.x; f.y = pl.y;
    const k = Math.min(1, f.t / 2.5);                // se abre en 2,5 s y, si se alarga, sigue abierto
    f.R = 50 + (m.radius * 1.72 - 50) * Math.pow(k, 1.5);
    if ((f.next -= dt) <= 0) {
      f.next = 0.16 - 0.07 * k;
      G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, f.a, f.R, 3.6, f.col, f.vis);
      f.a += 2.4;
      if (!f.ghost) {
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, f.R)) hit(pl, e, f.dmg, f.col, e.x - pl.x, e.y - pl.y, 40, m);
        for (const p of G.World.propsInCircle(pl.x, pl.y, f.R)) G.World.damageProp(p, f.dmg, f.col);
      }
    }
    if (f.t < f.dur) return false;
    if (!f.ghost) {
      pl.addBuff('spd', -0.3, 0.8, 1, 'outrage-dizzy');               // te mareas
      for (let i = 0; i < 3; i++) G.FX.sp('star', 'electric', pl.x + (i - 1) * 8, pl.y - pl.bodyH - 6, { vy: -10, life: 0.8, spin: 6, scale: 0.7 });
    }
    if (m.darts) darts3(pl, m, f.ghost);
    return true;
  }
  function frenzyDg3(ctx, f, own) { ell3(ctx, f.x, f.y, f.R, f.R * 0.6, '#ff4a4a', 0.1 * own); }
  /** Dracoflecha: dos Dreepy a dos enemigos distintos, que vuelven a ti y repiten. */
  function darts3(pl, m, g) {
    const list = nearestN3(pl.x, pl.y, 300, m.darts | 0), v = visAs(m, 'dreepy', { proj: 'dreepy' }), sp = 400;
    for (const e of list) {
      const a = Math.atan2(e.y - pl.y, e.x - pl.x);
      G.Projectiles.spawn(Object.assign({ x: pl.x, y: pl.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: m.dmg * pl.atkFor(m) * 3, r: 8,
                                          life: 6, pierce: Infinity, color: '#4aa0d8', hits: new Set(), vis: v, alpha: 0.85, ghost: g, owner: pl,
                                          dart3: 1, trips3: 2, lock3: e, only3: e.id, upd3: dartUpd3 }, payload(m)));
    }
  }
  function dartUpd3(p, dt) {
    const o = p.owner, sp = 400;
    let tx, ty;
    if (p.back3) {
      tx = o.x; ty = o.y;
      if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 < (o.r + 10) ** 2) {
        if (--p.trips3 <= 0 || o.dead) return true;
        const e = G.Projectiles.nearest(G.EnemyMgr.all(), o.x, o.y, 300);
        if (!e) return true;
        p.lock3 = e; p.only3 = e.id; p.back3 = false; p.hits = new Set();
        return false;
      }
    } else {
      const e = p.lock3;
      if (!e || e.dead) { p.back3 = true; p.only3 = -1; return false; }
      tx = e.x; ty = e.y;
    }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    p.vx = G.U.damp(p.vx, dx / d * sp, 10, dt); p.vy = G.U.damp(p.vy, dy / d * sp, 10, dt);
    return false;
  }

  // Ráfaga Escamas → Fragor Escamas: al acabar la ráfaga, +velocidad y −defensa; evolucionada, anillos en los tocados.
  MECH3['scale-shot'] = {
    cast(pl, m) {
      const st = ST3(m);
      st.hits = new Set();
      knife(pl, m);
      const b = fields[fields.length - 1];
      add3(pl, 'sclend', { m, set: st.hits, dur: (b && b.kind === 'burst' ? b.every * b.n : 0.1) + 0.25, pad: 40, tk: sclEndTk3 });
    },
    afterP(pl, e, m) { const st = ST3(m); if (st.hits && st.hits.size < 24) st.hits.add(e); }
  };
  function sclEndTk3(f) {
    if (f.t < f.dur) return false;
    const pl = f.owner, m = f.m;
    if (f.ghost || pl.dead) return true;
    pl.addBuff('spd', 0.06, 3, 5, 'scale-shot');
    pl.addBuff('def', -0.05, 3, 5, 'scale-shot-def');
    if (sees3(pl.x, pl.y)) for (let i = 0; i < 2; i++) G.FX.sp('scale', 'dragon', pl.x + G.U.rand(-8, 8), pl.y - pl.bodyH * 0.6, { vy: 40, vx: G.U.rand(-30, 30), life: 0.5, grav: 200 });
    if (m.ring3) {
      const s = sub3(m), dmg = m.dmg * pl.atkFor(m) * 0.4;
      for (const e of f.set) {
        if (e.dead) continue;
        if (sees3(e.x, e.y)) G.FX.ring(e.x, e.y, 4, m.ring3, '#ffe070', 0.3, 3);
        blast3(pl, s, e.x, e.y, m.ring3, dmg);
      }
      if (f.set.size && sees3(pl.x, pl.y)) G.Audio.sfx('coin');
    }
    return true;
  }

  // Ciclón → Dracoenergía: los tornados se llevan a los pequeños (×1,5 a los voladores); evolucionados, rastro y choque.
  MECH3['twister'] = {
    cast(pl, m) {
      tagged3(() => cross(pl, m), p => { p.tw3 = 1; p.upd3 = twUpd3; if (m.energy) tw3.push(p); });
    },
    k(pl, e) { return e.flying ? 1.5 : 1; },
    afterP(pl, e, m, p) { twGrab3(p, e); },
    ghostP(p, e) { twGrab3(p, e); }
  };
  function twGrab3(p, e) {
    if (!free3(e) || e.r > 14) return;
    const d = p.drag3 || (p.drag3 = []);
    if (d.length < 3 && !d.includes(e)) d.push(e);
  }
  function twUpd3(p, dt) {
    if (p.drag3) for (const e of p.drag3) if (!e.dead) { e.x = G.U.damp(e.x, p.x, 14, dt); e.y = G.U.damp(e.y, p.y, 14, dt); e.kx = e.ky = 0; }
    const m = p.src;
    if (!m || !m.energy) return false;
    if ((p.trT3 = (p.trT3 || 0) - dt) <= 0) {
      p.trT3 = 0.15;
      add3(p.owner, 'dtrail', { ghost: p.ghost, m, x: p.x, y: p.y, r: 16 * Math.max(1, p.r / 10), dur: 1, tick: 0.1, dmg: p.dmg * 0.2, pad: 30,
                                tk: dtrailTk3, dg: dtrailDg3 });
      cap3(p.owner, 'dtrail', 24);
    }
    if (p.t < 0.25 || p.boom3) return false;
    for (const q of tw3) {
      if (q === p || q.boom3 || q.owner !== p.owner || q.t < 0.25 || q.t >= q.life) continue;
      if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 > (p.r + q.r + 4) ** 2) continue;
      p.boom3 = q.boom3 = 1; q.t = q.life;
      const x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
      if (sees3(x, y)) { G.FX.ring(x, y, 6, 70, '#c8e85a', 0.4, 5); G.FX.burst(x, y - 8, '#a490ff', 16, 200); G.Audio.sfx('break'); }
      if (!p.ghost) blast3(p.owner, sub3(m), x, y, 70, p.dmg, { knock: 120 });
      return true;
    }
    return false;
  }
  function dtrailTk3(f, dt) {
    if ((f.tick -= dt) <= 0) { f.tick = 0.33; if (!f.ghost) blast3(f.owner, sub3(f.m), f.x, f.y, f.r, f.dmg); }
    return f.t >= f.dur;
  }
  function dtrailDg3(ctx, f, own) { ell3(ctx, f.x, f.y, f.r, f.r * 0.55, '#c8e85a', 0.22 * Math.min(1, (f.dur - f.t) * 2) * own); }

  // ==== mech: hada ====
  // Viento Feérico → Fuerza Lunar: aparta y te trae la experiencia; evolucionado, una luna dispara a los fuertes.
  MECH3['fairy-wind'] = {
    cast(pl, m) {
      tagged3(() => nova(pl, m), p => { if (!p.ghost) p.upd3 = windUpd3; });
      if (m.moon) moon3(pl, m);
    }
  };
  function windUpd3(p, dt) {
    if ((p.pk3 = (p.pk3 || 0) - dt) > 0 || !G.Pickups || !G.Pickups.all) return false;
    p.pk3 = 0.08;
    for (const o of G.Pickups.all()) if (!o.pulled && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < 26 * 26) o.pulled = true;
    return false;
  }
  function moon3(pl, m) {
    let f = null;
    for (const o of fields) if (o.k3 === 'moon' && o.owner === pl && !o.gone) { f = o; break; }
    if (!f) f = add3(pl, 'moon', { fire: 0.3, pad: 320, tk: moonTk3, da: moonDa3 });
    f.m = m; f.ghost = ghost; f.dur = f.t + 3; f.dmg = m.dmg * pl.atkFor(m) * 0.9;
  }
  function moonTk3(f, dt) {
    const pl = f.owner;
    if (pl.dead || f.t >= f.dur) return true;
    f.x = pl.x; f.y = pl.y;
    if ((f.fire -= dt) > 0) return false;
    f.fire = 0.5;
    let tg = null, best = -1;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 300)) if (!e.dead && e.hp > best) { best = e.hp; tg = e; }
    if (!tg) return false;
    const mx = pl.x, my = pl.y - pl.bodyH - 34, tx = tg.x, ty = tg.y - tg.bodyH * 0.5;
    G.FX.beam(mx, my, Math.atan2(ty - my, tx - mx), Math.hypot(tx - mx, ty - my), 6, '#fff0fa', { pal: 'lunar', beam: 'star' });
    if (!f.ghost) { hit(pl, tg, f.dmg, '#fff0fa', tx - mx, ty - my, 0, sub3(f.m)); if (!tg.dead) inflict(tg, 'atk', 4, 0.3); }
    return false;
  }
  function moonDa3(ctx, f, own, now) {
    const pl = f.owner, a = Math.min(1, (f.dur - f.t) * 3, f.t * 4);
    G.VFX.draw(ctx, 'moon', 'lunar', pl.x, pl.y - pl.bodyH - 34 + Math.sin(now * 2) * 2, { scale: 1.5, alpha: a, frame: (now * 3) | 0 });
  }

  // Brillo Mágico → Campo de Niebla: ×1,6 a los que te miran, ×0,7 a los que te dan la espalda; evolucionado, niebla que protege.
  MECH3['dazzling-gleam'] = {
    cast(pl, m) {
      aura(pl, m);
      if (sees3(pl.x, pl.y)) for (let i = 0; i < 4; i++) {
        const a = i * 1.5708 + 0.78;
        G.FX.sp('star', 'fairy', pl.x + Math.cos(a) * m.radius * 0.5, pl.y + Math.sin(a) * m.radius * 0.4 - G.LIFT * 0.5, { life: 0.2, scale: 1.5 });
      }
      if (m.mist) mist3(pl, m);
    },
    k(pl, e) { const f = facing3(e, pl); return f > 0 ? 1.6 : f < 0 ? 0.7 : 1; }
  };
  function mist3(pl, m) {
    let f = null;
    for (const o of fields) if (o.k3 === 'mist' && o.owner === pl && !o.gone) { f = o; break; }
    if (!f) f = add3(pl, 'mist', { tk: mistTk3, dg: mistDg3 });
    f.m = m; f.ghost = ghost; f.r = (m.mist || 140) * Math.sqrt(pkOf(m).area || 1); f.dur = f.t + 1.2; f.pad = f.r;
  }
  function mistTk3(f) {
    const pl = f.owner, me = G.Game.player;
    if (pl.dead || f.t >= f.dur) return true;
    f.x = pl.x; f.y = pl.y;
    // Tú (o el compañero) dentro: sin estados y te hacen menos daño (lo mira resolve con mistK3).
    if (me && !me.dead && (me.x - f.x) ** 2 + (me.y - f.y) ** 2 < f.r * f.r) {
      const u = P3(me); u.mist = 0.15; u.mx = f.x; u.my = f.y; u.mr = f.r;
    }
    if (Math.random() < 0.15 && sees3(f.x, f.y)) {
      const a = Math.random() * 6.2832, r = f.r * Math.sqrt(Math.random());
      G.FX.px(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.6, '#ffe6f4', { vy: -12, life: 0.8, size: 2 });
    }
    return false;
  }
  function mistDg3(ctx, f, own, now) {
    const a = Math.min(1, (f.dur - f.t) * 3, f.t * 4) * own;
    ell3(ctx, f.x, f.y, f.r, f.r * 0.6, '#ffc4e6', 0.13 * a);
    ell3(ctx, f.x, f.y, f.r * 0.7, f.r * 0.42, '#ffe6f4', 0.1 * a);
    ctx.globalAlpha = 0.35 * a; ctx.strokeStyle = '#ffc4e6'; ctx.lineWidth = 1.5; ctx.setLineDash(DASH); ctx.lineDashOffset = -now * 10;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
  }

  // Beso Drenaje → Luz Lunar: cura la mitad del daño y enamora 1,5 s; evolucionado, lo que sobra se vuelve escudo.
  MECH3['draining-kiss'] = {
    afterP(pl, e, m, p, d) {
      if (!e.dead) inflict(e, 'infat', 1.5);
      const h = Math.min(d * 0.5, (pl.maxHp || 100) * 0.03);
      if (!(h > 0)) return;
      if (m.lunar && pl.maxHp) {
        const room = pl.maxHp - pl.hp;
        if (h > room) { const u = P3(pl); u.shield = Math.min(pl.maxHp * m.lunar, u.shield + (h - room)); }
      }
      pl.heal(h);
    }
  };

  // Carantoña → Choque Anímico: nube de pelea donde caen golpes al azar; evolucionada, la nube rueda arrastrando.
  MECH3['play-rough'] = {
    cast(pl, m) {
      const t = pl.target, near = t && !t.dead && (t.x - pl.x) ** 2 + (t.y - pl.y) ** 2 <= (m.radius + 60) ** 2;
      const d = near ? Math.min(G.U.dist(pl.x, pl.y, t.x, t.y), m.radius) : m.radius * 0.8, n = Math.max(1, m.count | 0);
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), v = m.roll ? m.roll / 0.8 : 0;
      add3(pl, 'brawl', { m, col: G.U.TYPE_COLOR[m.type], x: pl.x + ca * d, y: pl.y + sa * d, r: m.radius * 0.9, dur: 0.8, n, every: 0.8 / n, next: 0.04,
                          dmg: m.dmg * pl.atkFor(m) * 0.4, vx: ca * v, vy: sa * v, vis: m.roll ? visAs(m, 'fairy', { proj: 'cloud' }) : visAs(m, 'normal', { proj: 'cloud' }),
                          pad: 80, tk: brawlTk3, da: brawlDa3 });
      cap3(pl, 'brawl', 3);
    }
  };
  function brawlTk3(f, dt) {
    if (f.t >= f.dur) return true;
    const pl = f.owner, m = f.m;
    if (f.vx || f.vy) {
      const nx = f.x + f.vx * dt, ny = f.y + f.vy * dt;
      if (G.World.isFree(nx, ny, 10, true)) {
        f.x = nx; f.y = ny;
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) if (free3(e)) { e.x += f.vx * dt; e.y += f.vy * dt; }
      } else f.vx = f.vy = 0;
    }
    f.next -= dt;
    while (f.next <= 0 && f.n > 0) {
      f.next += f.every; f.n--;
      const list = G.EnemyMgr.queryCircle(f.x, f.y, f.r), e = list.length ? list[Math.floor(Math.random() * list.length)] : null;
      const px = e ? e.x : f.x + G.U.rand(-f.r, f.r) * 0.6, py = e ? e.y - e.bodyH * 0.5 : f.y - G.U.rand(4, 20);
      if (sees3(f.x, f.y)) {
        G.FX.sp(Math.random() < 0.5 ? 'impact' : 'star', Math.random() < 0.5 ? 'fairy' : 'normal', px + G.U.rand(-6, 6), py, { life: 0.18, scale: 1.5 });
        G.Audio.sfx('hit');
      }
      if (e && !e.dead && !f.ghost) hit(pl, e, f.dmg, f.col, e.x - f.x, e.y - f.y, (m.knock || 0) * 0.3, m);
    }
    return false;
  }
  function brawlDa3(ctx, f, own, now) {
    const a = Math.min(1, (f.dur - f.t) * 5, f.t * 10), wob = Math.sin(now * 30) * 1.5;
    G.VFX.draw(ctx, 'cloud', f.vis.pal, f.x + wob, f.y - 14, { scale: 2.4 * f.r / 56, alpha: a, frame: (now * 14) | 0 });
  }

  // Voz Cautivadora → Encanto: los alcanzados van embelesados al punto donde la lanzaste; evolucionada, apenas hacen daño.
  MECH3['disarming-voice'] = {
    cast(pl, m) {
      const st = ST3(m); st.cx = pl.x; st.cy = pl.y;
      shove(pl, m);
      if (sees3(pl.x, pl.y)) for (let i = 0; i < 6; i++) {
        const a = i * 1.0472;
        G.FX.sp('heart', 'fairy', pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.8 - G.LIFT * 0.5,
                { vx: Math.cos(a) * m.radius * 2.2, vy: Math.sin(a) * m.radius * 1.8, life: 0.35 });
      }
      // (El de un compañero: en el anfitrión, los de verdad también se embelesan.)
      if (ghost) for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) if (real3(e)) charm3(e, m, pl.x, pl.y);
    },
    after(pl, e, m) { if (!e.dead) { const st = ST3(m); charm3(e, m, st.cx, st.cy); } }
  };
  function charm3(e, m, x, y) {
    inflict(e, 'charm', 1.5, [x, y]);
    if (m.disarm) inflict(e, 'atk', 3, m.disarm);
  }

  // Cañón Floral → Luz Aniquiladora: la aguja planta flores que estallan al segundo; evolucionado, disparan un rayo hacia ti.
  MECH3['fleur-cannon'] = {
    cast(pl, m) {
      sweep(pl, m);
      const f = fields[fields.length - 1];
      if (f && f.kind === 'sweep') { f.on3 = fleurOn3; f.acc3 = 0.3; }
    }
  };
  function fleurOn3(f, prev) {
    f.acc3 += Math.abs(f.a - prev);
    const m = f.m;
    while (f.acc3 >= 0.52) {
      f.acc3 -= 0.52;
      for (let i = 0; i < f.n; i++) {
        const a = f.a + i * 6.2832 / f.n, L = m.radius * G.U.rand(0.55, 0.95);
        add3(f.owner, 'flower', { ghost: f.ghost, m, x: f.x + Math.cos(a) * L, y: f.y + Math.sin(a) * L, at: 1, dur: 1.3, done: false,
                                  r: 26 * (pkOf(m).area || 1), dmg: f.dmg * 0.7, pad: 40, tk: flowerTk3, dg: flowerDg3 });
      }
      cap3(f.owner, 'flower', 30);
    }
  }
  function flowerTk3(f) {
    if (!f.done && f.t >= f.at) {
      f.done = true;
      const pl = f.owner, m = f.m;
      if (sees3(f.x, f.y)) {
        G.FX.ring(f.x, f.y, 4, f.r, '#ff6a9a', 0.3, 3);
        for (let i = 0; i < 5; i++) { const a = i * 1.2566; G.FX.sp('petal', 'rose', f.x, f.y - 6, { vx: Math.cos(a) * 110, vy: Math.sin(a) * 80 - 30, life: 0.35, spin: 8 }); }
        G.Audio.sfx('thud');
      }
      if (!f.ghost) blast3(pl, sub3(m), f.x, f.y, f.r, f.dmg);
      if (m.annihil && !pl.dead) {
        const a = Math.atan2(pl.y - f.y, pl.x - f.x), L = Math.hypot(pl.x - f.x, pl.y - f.y);
        G.FX.beam(f.x, f.y - G.LIFT, a, L, 8, '#ffffff', { pal: 'lunar', beam: 'star' });
        if (!f.ghost) {
          const s = sub3(m), col = G.U.TYPE_COLOR.fairy, d = f.dmg * 0.6;
          lineHit3(f.x, f.y, pl.x, pl.y, 14, e => hit(pl, e, d, col, Math.cos(a), Math.sin(a), 0, s));
        }
      }
    }
    return f.t >= f.dur;
  }
  function flowerDg3(ctx, f, own) {
    const k = Math.min(1, f.t / f.at), a = Math.min(1, (f.dur - f.t) * 5) * own;
    ctx.globalAlpha = a;
    G.VFX.draw(ctx, 'flower', 'rose', f.x, f.y - 4, { scale: 0.6 + 0.9 * k, frame: k > 0.7 ? 1 : 0 });
  }

  // Ciclón Primavera → Furia Natural: con más de media vida, los pétalos bajan el ataque; con menos, te lo suben;
  // evolucionado, cada pétalo quita además un % de la vida que le quede.
  MECH3['springtide-storm'] = {
    cast(pl, m) {
      shower(pl, m);
      const f = fields[fields.length - 1], low = pl.maxHp ? pl.hp / pl.maxHp < 0.5 : false;
      if (f && f.kind === 'shower') f.vis = m.gnaw ? visAs(m, 'verdant', { proj: 'petal' }) : low ? visAs(m, 'therian', { proj: 'petal' }) : G.VFX.forMove(m);
    },
    afterP(pl, e, m) {
      if (pl.maxHp && pl.hp / pl.maxHp < 0.5) pl.addBuff('atk', 0.06, 5, 5, 'springtide-storm');
      else inflict(e, 'atk', 3, 0.3);
      if (m.gnaw && !e.dead) pure3(pl, e, (e.hp || 0) * (big3(e) ? m.gnaw * 0.25 : m.gnaw), m, '#5ac86a');
    }
  };

  // ==== mech: acero ====
  // Garra Metal → Cabeza de Hierro: zarpazo de ida y vuelta (la vuelta, crítica si la ida acertó); evolucionada, cabezazo que interrumpe.
  MECH3['metal-claw'] = {
    cast(pl, m) {
      if (m.head) { ironHead3(pl, m); return; }
      const st = ST3(m);
      st.ok = false; st.on = 1;
      try { melee(pl, m); } finally { st.on = 0; }
      add3(pl, 'claw2', { m, a: pl.aim, at: 0.15, ok: st.ok, pad: 60, tk: claw2Tk3 });
    },
    after(pl, e, m) { const st = ST3(m); if (st.on) st.ok = true; if (m.head) interrupt3(e); }
  };
  function claw2Tk3(f) {
    if (f.t < f.at) return false;
    const pl = f.owner, m = f.m;
    if (pl.dead) return true;
    const col = G.U.TYPE_COLOR[m.type], half = Math.min(m.arc, 6.2832) / 2;
    G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, f.a + 0.3, m.radius * 0.95, m.arc, col, G.VFX.forMove(m));
    if (sees3(pl.x, pl.y)) G.Audio.sfx('shake');
    if (f.ghost) return true;
    crit3f = f.ok;
    try {
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
        if (inArc(pl.x, pl.y, e.x, e.y, f.a, half)) hit(pl, e, m.dmg * pl.atkFor(m), col, e.x - pl.x, e.y - pl.y, (m.knock || 0) * 0.5, m);
      }
    } finally { crit3f = false; }
    return true;
  }
  /** Cabeza de Hierro: embestida corta y cabezazo alrededor que corta lo que preparen. */
  function ironHead3(pl, m) {
    const col = G.U.TYPE_COLOR[m.type], ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
    if (!ghost) {
      let len = 0;
      for (let d = 8; d <= 56; d += 8) { if (!G.World.isFree(pl.x + ca * d, pl.y + sa * d, (pl.wr || pl.r) * 0.8, true)) break; len = d; }
      for (let d = 0; d <= len; d += 14) G.FX.sp('streak', 'steel', pl.x + ca * d, pl.y + sa * d - G.LIFT * 0.6, { life: 0.2, angle: pl.aim });
      pl.x += ca * len; pl.y += sa * len;
      G.World.collide(pl);
      invuln3(pl, 0.25);
    }
    G.FX.sp('impact', 'steel', pl.x + ca * pl.r, pl.y - G.LIFT * 0.6 + sa * pl.r, { life: 0.22, scale: 2, fade: false });
    G.FX.ring(pl.x, pl.y, pl.r, m.radius, '#cad6e2', 0.3, 3);
    if (ghost) return;
    G.Camera.kick(0.12);
    const half = Math.min(m.arc, 6.2832) / 2;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
      if (inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) hit(pl, e, m.dmg * pl.atkFor(m), col, e.x - pl.x, e.y - pl.y, m.knock || 0, m);
    }
    for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, m.dmg * pl.atkFor(m), col);
  }

  // Foco Resplandor → Rayo Metálico: el rayo se refleja en paredes y objetos (2 veces); evolucionado, láser que sigue tu apuntado.
  MECH3['flash-cannon'] = {
    cast(pl, m) {
      if (m.laser) { laser3(pl, m); return; }
      const segs = trace3(pl.x, pl.y, pl.aim, m.radius, m.reflect | 0), vis = G.VFX.forMove(m), col = G.U.TYPE_COLOR[m.type];
      const dmg = m.dmg * pl.atkFor(m), w = m.width, done = new Set();
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], a = Math.atan2(s[3] - s[1], s[2] - s[0]), L = Math.hypot(s[2] - s[0], s[3] - s[1]);
        if (L < 2) continue;
        G.FX.beam(s[0], s[1] - G.LIFT, a, L, w, col, vis);
        if (i && sees3(s[0], s[1])) G.FX.sp('star', 'steel', s[0], s[1] - G.LIFT, { life: 0.25, scale: 1.5 });
        if (ghost) continue;
        lineHit3(s[0], s[1], s[2], s[3], w, e => { if (done.has(e.id)) return; done.add(e.id); hit(pl, e, dmg, col, Math.cos(a), Math.sin(a), 0, m); });
        lineProps3(s[0], s[1], s[2], s[3], w, dmg, col);
      }
      if (!ghost) G.Camera.kick(0.08);
    }
  };
  function laser3(pl, m) {
    for (const f of fields) if (f.k3 === 'laser' && f.owner === pl) f.gone = true;
    add3(pl, 'laser', { m, a: pl.aim, dur: m.laser || 1.2, tick: 0, log: new Map(), segs: [], dmg: m.dmg * pl.atkFor(m), w: m.width,
                        pad: m.radius + 60, tk: laserTk3, da: laserDa3 });
  }
  function laserTk3(f, dt) {
    const pl = f.owner, m = f.m;
    if (pl.dead || f.t >= f.dur) return true;
    f.x = pl.x; f.y = pl.y;
    if ((f.tick -= dt) > 0) return false;
    f.tick = 0.1;
    f.segs = trace3(pl.x, pl.y, f.ghost ? f.a : pl.aim, m.radius, m.reflect | 0);
    if (f.ghost) return false;
    const col = G.U.TYPE_COLOR[m.type];
    for (const s of f.segs) {
      const ca = Math.cos(Math.atan2(s[3] - s[1], s[2] - s[0])), sa = Math.sin(Math.atan2(s[3] - s[1], s[2] - s[0]));
      lineHit3(s[0], s[1], s[2], s[3], f.w, e => {
        const last = f.log.get(e.id);
        if (last !== undefined && f.t - last < 0.2) return;
        f.log.set(e.id, f.t);
        hit(pl, e, f.dmg, col, ca, sa, 0, m);
      });
      lineProps3(s[0], s[1], s[2], s[3], f.w, f.dmg * 0.5, col);
    }
    return false;
  }
  function laserDa3(ctx, f, own, now) {
    const a = Math.min(1, (f.dur - f.t) * 6, f.t * 12) * (0.85 + 0.15 * Math.sin(now * 50)), hw = Math.max(3, Math.round(f.w / 6));
    for (const s of f.segs) {
      drawRay3(ctx, s[0], s[1] - G.LIFT, s[2], s[3] - G.LIFT, hw, 'steel', a);
      if (Math.random() < 0.3) G.FX.px(s[2], s[3] - G.LIFT, '#ffffff', { vx: G.U.rand(-60, 60), vy: G.U.rand(-60, 60), life: 0.15 });
    }
  }

  // Puño Meteoro → Bomba Imán: el meteoro rebota al siguiente (2 veces); evolucionado, bombas que se pegan, atraen y estallan.
  MECH3['meteor-mash'] = {
    cast(pl, m) {
      if (m.magnet) { magnets3(pl, m); return; }
      const col = G.U.TYPE_COLOR[m.type], n = Math.max(1, m.count | 0), vis = G.VFX.forMove(m);
      const near = G.EnemyMgr.queryCircle(pl.x, pl.y, reach(m)).filter(e => !e.dead);
      for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = near[i]; near[i] = near[j]; near[j] = t; }
      const fall = 0.5 / pkOf(m).pspd, dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const e = near[i];
        add3(pl, 'mash', { m, col, vis, t: -i * 0.09, fall, r: m.radius, dmg, hops: m.hops | 0, hop: 0, seen: new Set(e ? [e.id] : []),
                           x: e ? e.x : pl.x + G.U.rand(-140, 140), y: e ? e.y : pl.y + G.U.rand(-110, 110), x0: 0, y0: 0,
                           pad: 200, tk: mashTk3, dg: mashDg3, da: mashDa3 });
      }
    }
  };
  function mashTk3(f) {
    if (f.t < f.fall) return false;
    const m = f.m;
    if (sees3(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4); G.FX.burst(f.x, f.y - 6, '#cad6e2', 10, 170); G.Audio.sfx('break'); if (!f.ghost) G.Camera.kick(0.1); }
    blast3(f.owner, f.hop ? sub3(m) : m, f.x, f.y, f.r, f.dmg, { ghost: f.ghost, knock: m.knock || 0 });
    if (f.hops <= 0) return true;
    // Rebota hacia el siguiente más cercano que aún no ha pisado.
    let best = null, bd = 170 * 170;
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, 170)) {
      if (e.dead || f.seen.has(e.id)) continue;
      const d = (e.x - f.x) ** 2 + (e.y - f.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return true;
    f.seen.add(best.id);
    f.x0 = f.x; f.y0 = f.y; f.x = best.x; f.y = best.y; f.t = 0; f.fall = 0.32; f.dmg *= 0.8; f.hops--; f.hop = 1;
    return false;
  }
  function mashDg3(ctx, f, own) {
    const k = G.U.clamp(f.t / f.fall, 0, 1);
    if (f.hop) { ell3(ctx, f.x0 + (f.x - f.x0) * k, f.y0 + (f.y - f.y0) * k, 10, 4, '#000', 0.3 * own); return; }
    slideDg3(ctx, f, own);
  }
  function mashDa3(ctx, f) {
    if (f.t <= 0) return;
    const k = G.U.clamp(f.t / f.fall, 0, 1);
    if (f.hop) {
      const x = f.x0 + (f.x - f.x0) * k, y = f.y0 + (f.y - f.y0) * k - 200 * k * (1 - k) - 8;
      G.VFX.draw(ctx, 'fist', 'steel', x, y, { scale: 1.5, angle: k * 6 });
    } else G.VFX.draw(ctx, 'fist', 'steel', f.x + (1 - k) * 40, f.y - (1 - k) * 170 - 6, { scale: 1.8, angle: Math.PI / 2 });
  }
  function magnets3(pl, m) {
    const n = Math.max(1, m.count | 0), near = G.EnemyMgr.queryCircle(pl.x, pl.y, reach(m)).filter(e => !e.dead);
    for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = near[i]; near[i] = near[j]; near[j] = t; }
    for (let i = 0; i < n && near.length; i++) {
      const e = near[i % near.length];                                   // (con pocos enemigos, varias en el mismo)
      add3(pl, 'magnet', { m, e, x: e.x, y: e.y, at: 0.6, r: m.radius * 1.2, pullR: m.magnet || 80, dmg: m.dmg * pl.atkFor(m), pad: 120,
                           tk: magTk3, dg: magDg3, da: magDa3 });
    }
    cap3(pl, 'magnet', 12);
  }
  function magTk3(f, dt) {
    if (f.e && !f.e.dead) { f.x = f.e.x; f.y = f.e.y; }
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.pullR)) {
      if (e === f.e || !free3(e)) continue;
      const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy);
      if (d < 10) continue;
      const k = Math.min(d - 8, 170 * dt) / d;
      e.x += dx * k; e.y += dy * k;
    }
    if (f.t < f.at) return false;
    if (sees3(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, '#e03a3a', 0.35, 4); G.FX.burst(f.x, f.y - 8, '#cad6e2', 14, 200); G.Audio.sfx('break'); }
    blast3(f.owner, f.m, f.x, f.y, f.r, f.dmg, { ghost: f.ghost, knock: 60 });
    return true;
  }
  function magDg3(ctx, f, own, now) {
    const k = 0.6 + 0.4 * Math.sin(now * 20);
    ctx.globalAlpha = 0.35 * own * k; ctx.strokeStyle = '#e03a3a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, f.pullR * (1 - f.t / f.at * 0.6), f.pullR * 0.6 * (1 - f.t / f.at * 0.6), 0, 0, 6.2832); ctx.stroke();
  }
  function magDa3(ctx, f, own, now) {
    const h = f.e ? f.e.bodyH || 20 : 20;
    G.VFX.draw(ctx, 'magnet', 'magnet', f.x, f.y - h - 8 + Math.sin(now * 16) * 1.5, { scale: 1.5 });
  }

  // Disparo Espejo → Metaláser: un espejo que duplica tus disparos y destella lanzando reflejos; evolucionado, dos con un láser.
  MECH3['mirror-shot'] = {
    cast(pl, m) {
      for (const f of fields) if (f.k3 === 'mirror' && f.owner === pl) f.gone = true;
      const a = pl.aim, spots = m.laser ? [[a - 0.75, 80], [a + 0.75, 80]] : [[a, 70]];
      const ms = spots.map(([b, r]) => ({ x: pl.x + Math.cos(b) * r, y: pl.y + Math.sin(b) * r }));
      add3(pl, 'mirror', { m, ms, x: ms[0].x, y: ms[0].y, dur: 3, flash: 0.15, lz: 0, log: new Map(), dmg: m.dmg * pl.atkFor(m), pad: 220,
                           tk: mirrorTk3, dg: mirrorDg3, da: mirrorDa3 });
      if (sees3(pl.x, pl.y)) G.Audio.sfx('shake');
    }
  };
  function mirrorTk3(f, dt) {
    const pl = f.owner, m = f.m;
    if (pl.dead || f.t >= f.dur) return true;
    // Destello: reflejos que rebotan entre los enemigos y deslumbra (tardan más en disparar).
    if ((f.flash -= dt) <= 0) {
      f.flash = 0.6;
      for (const mm of f.ms) {
        if (sees3(mm.x, mm.y)) { G.FX.ring(mm.x, mm.y - 14, 4, 26, '#ffffff', 0.2, 2); G.FX.sp('star', 'steel', mm.x, mm.y - 18, { life: 0.25, scale: 2 }); }
        for (const e of G.EnemyMgr.queryCircle(mm.x, mm.y, 90)) if (real3(e) && e.shotCd != null && !e.boss) e.shotCd += 0.5;
        const tg = G.Projectiles.nearest(G.EnemyMgr.all(), mm.x, mm.y, 320);
        if (!tg) continue;
        const n = Math.max(1, m.count | 0), a0 = Math.atan2(tg.y - mm.y, tg.x - mm.x);
        for (let i = 0; i < n; i++) {
          const a = a0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.5);
          shot3(pl, m, { x: mm.x, y: mm.y, vx: Math.cos(a) * (m.speed || 340), vy: Math.sin(a) * (m.speed || 340), dmg: f.dmg, r: m.size, life: m.life || 1.6,
                         ghost: f.ghost, mir3: 1 });
        }
      }
    }
    // Lo tuyo que lo cruza sale duplicado (una copia hacia el enemigo más cercano).
    const list = G.Projectiles.all(), n0 = list.length;
    for (let i = 0; i < n0; i++) {
      const p = list[i];
      if (!p.friendly || p.orb || p.mir3 || p.ricochet || p.air || p.owner !== pl) continue;
      for (const mm of f.ms) {
        if ((p.x - mm.x) ** 2 + (p.y - mm.y) ** 2 > (14 + p.r) ** 2) continue;
        p.mir3 = 1; dup3(p, mm);
        break;
      }
    }
    // Metaláser: el láser entre los dos espejos.
    if (f.ms.length > 1 && (f.lz -= dt) <= 0) {
      f.lz = 0.12;
      if (!f.ghost) {
        const a = f.ms[0], b = f.ms[1], s = sub3(m), col = '#ff5a5a';
        lineHit3(a.x, a.y, b.x, b.y, 10, e => {
          const last = f.log.get(e.id);
          if (last !== undefined && f.t - last < 0.4) return;
          f.log.set(e.id, f.t);
          hit(pl, e, f.dmg * 0.5, col, 0, 0, 0, s);
        });
      }
    }
    return false;
  }
  function dup3(p, mm) {
    const c = Object.assign({}, p);
    delete c.id;
    const sp = Math.hypot(p.vx, p.vy) || 300, tg = G.Projectiles.nearest(G.EnemyMgr.all(), mm.x, mm.y, 300);
    const a = tg ? Math.atan2(tg.y - mm.y, tg.x - mm.x) : Math.atan2(-p.vy, -p.vx);
    Object.assign(c, { x: mm.x, y: mm.y, px: undefined, py: undefined, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: Math.min(p.t, p.life * 0.5),
                       hits: new Set(), phits: new Set(), mir3: 1, drag3: null, lock3: null, only3: 0 });
    G.Projectiles.spawn(c);
    if (sees3(mm.x, mm.y, 10)) G.FX.spark(mm.x, mm.y - G.LIFT, '#ffffff', Math.cos(a), Math.sin(a), 3);
  }
  function mirrorDg3(ctx, f, own) { for (const mm of f.ms) ell3(ctx, mm.x, mm.y, 9, 3.5, '#000', 0.25 * own); }
  function mirrorDa3(ctx, f, own, now) {
    const a = Math.min(1, (f.dur - f.t) * 4, f.t * 8);
    if (f.ms.length > 1) {
      const p = f.ms[0], q = f.ms[1];
      drawRay3(ctx, p.x, p.y - 14, q.x, q.y - 14, 2, 'laser', a * (0.75 + 0.25 * Math.sin(now * 40)));
    }
    for (const mm of f.ms) G.VFX.draw(ctx, 'mirror', 'steel', mm.x, mm.y - 14 + Math.sin(now * 3 + mm.x) * 1.5, { scale: 1.5, alpha: a, frame: (now * 8) | 0 });
  }

  // Giro Bola → Cuerpo Pesado: cuanto más lento vas, más daño (quieto ×2, corriendo ×0,6); evolucionado, quieto te anclas.
  MECH3['gyro-ball'] = {
    cast(pl, m) {
      if (!ghost) P3(pl);
      spin(pl, m);
      const f = fields[fields.length - 1];
      if (f && f.kind === 'spin') f.vis = visAs(m, 'steel', { melee: 'impact', proj: 'wheel' });
    },
    k(pl) {
      const u = pl.u3;
      if (!u) return 1;
      return 2 - 1.4 * G.U.clamp(u.v / (pl.spd || 90), 0, 1);
    }
  };

  // Escudo Real → Embate Supremo: al gastar un escudo pasas a forma Filo; evolucionado, una espada gira contigo.
  MECH3['kings-shield'] = {
    block(pl, m, g) {
      if (!g) {
        const u = P3(pl), t = m.blade || 3;
        u.filo = t;
        pl.addBuff('patk', 0.4, t, 1, 'kings-shield');
        m.t = Math.max(m.t || 0, 0) + t;                                 // sin escudos nuevos mientras
        G.FX.dmgText(pl.x, pl.y - pl.bodyH - 24, '¡Forma Filo!', '#c9a0ff', true);
      }
      G.FX.ring(pl.x, pl.y, pl.r, pl.r * 3, '#9e8aea', 0.4, 3);
      if (m.sword) blade3(pl, m, g);
    }
  };
  function blade3(pl, m, g) {
    for (const f of fields) if (f.k3 === 'blade' && f.owner === pl) f.gone = true;
    add3(pl, 'blade', { m, ghost: g, dur: m.blade || 3, a: pl.aim, log: new Map(), dmg: m.dmg * pl.atkFor(m) * 0.35, pad: 90, tk: bladeTk3, da: bladeDa3 });
  }
  function bladeTk3(f, dt) {
    const pl = f.owner;
    if (pl.dead || f.t >= f.dur) return true;
    f.x = pl.x; f.y = pl.y;
    f.a += 7 * dt;
    if (f.ghost) return false;
    const ca = Math.cos(f.a), sa = Math.sin(f.a), s = sub3(f.m), col = '#9e8aea';
    lineHit3(pl.x + ca * 18, pl.y + sa * 18, pl.x + ca * 66, pl.y + sa * 66, 20, e => {
      const last = f.log.get(e.id);
      if (last !== undefined && f.t - last < 0.3) return;
      f.log.set(e.id, f.t);
      hit(pl, e, f.dmg, col, ca, sa, 40, s);
    });
    return false;
  }
  function bladeDa3(ctx, f, own) {
    const pl = f.owner, a = Math.min(1, (f.dur - f.t) * 4, f.t * 8);
    for (let k = 2; k >= 0; k--) {
      const b = f.a - k * 0.28, x = pl.x + Math.cos(b) * 42, y = pl.y + Math.sin(b) * 42 * 0.8 - G.LIFT * 0.6;
      G.VFX.draw(ctx, 'sword', 'regal', x, y, { scale: 1.5, angle: b, alpha: a * (k ? 0.3 / k : 1) });
    }
  }

  // Ala de Acero → Meteoimpacto: pasadas rasantes que atraviesan; evolucionada, se estrella en el grupo y deja un cráter.
  MECH3['steel-wing'] = {
    cast(pl, m) {
      let f = null;
      for (const o of fields) if (o.k3 === 'swing' && o.owner === pl && !o.gone) { f = o; break; }
      const n = Math.max(1, m.count | 0), rate = m.rate || 1.5;
      if (!f) f = add3(pl, 'swing', { birds: [], pad: 400, tk: swingTk3, da: swingDa3, dg: swingDg3 });
      f.m = m; f.ghost = ghost; f.t = 0; f.dur = m.dur || 8; f.dmg = m.dmg * pl.atkFor(m);
      while (f.birds.length > n) f.birds.pop();
      for (let i = f.birds.length; i < n; i++) f.birds.push({ next: 0.2 + i * rate / n, pass: null });
    }
  };
  function swingTk3(f, dt) {
    const pl = f.owner, m = f.m;
    if (pl.dead || f.t >= f.dur) return true;
    f.x = pl.x; f.y = pl.y;
    for (const b of f.birds) {
      const ps = b.pass;
      if (ps) {
        const k0 = Math.min(1, ps.t / ps.dur);
        ps.t += dt;
        const k = Math.min(1, ps.t / ps.dur);
        if (!ps.crash && !f.ghost) {
          const x0 = ps.x0 + (ps.x1 - ps.x0) * k0, y0 = ps.y0 + (ps.y1 - ps.y0) * k0, x1 = ps.x0 + (ps.x1 - ps.x0) * k, y1 = ps.y0 + (ps.y1 - ps.y0) * k;
          const w = (m.radius || 42) * 0.75, col = G.U.TYPE_COLOR.steel;
          lineHit3(x0, y0, x1, y1, w, e => { if (ps.hit.has(e.id)) return; ps.hit.add(e.id); hit(pl, e, f.dmg, col, x1 - x0, y1 - y0, 60, m); });
          lineProps3(x0, y0, x1, y1, w, f.dmg, col);
        }
        if (ps.crash && Math.random() < 0.6) G.FX.px(ps.x0 + (ps.x1 - ps.x0) * k, ps.y0 + (ps.y1 - ps.y0) * k - 20, '#ffd25a', { vy: -30, life: 0.3 });
        if (k >= 1) { if (ps.crash) crash3(f, ps); b.pass = null; }
        continue;
      }
      if ((b.next -= dt) > 0) continue;
      b.next += m.rate || 1.5;
      if (m.crash) {
        const tg = group3(pl);
        if (!tg) { b.next = 0.3; continue; }
        b.pass = { crash: 1, x0: tg.x - 120, y0: tg.y - 40, x1: tg.x, y1: tg.y, t: 0, dur: 0.45 };
      } else {
        const tg = rainTarget(pl) || G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, 300);
        if (!tg) { b.next = 0.3; continue; }
        const a = (Math.random() < 0.5 ? 0 : Math.PI) + G.U.rand(-0.35, 0.35);
        b.pass = { x0: tg.x - Math.cos(a) * 300, y0: tg.y - Math.sin(a) * 300, x1: tg.x + Math.cos(a) * 300, y1: tg.y + Math.sin(a) * 300, t: 0, dur: 0.95, hit: new Set() };
        if (!f.ghost && Math.random() < 0.1) pl.addBuff('def', 0.05, 5, 3, 'steel-wing');
      }
      if (sees3(b.pass.x1, b.pass.y1, 200)) G.Audio.sfx('shot', { kind: 'orbit', type: 'steel' });
    }
    return false;
  }
  /** Meteoimpacto: el ave se estrella en el grupo y deja un cráter de chatarra (+defensa para ti dentro). */
  function crash3(f, ps) {
    const pl = f.owner, m = f.m, R = m.crash || 80;
    if (sees3(ps.x1, ps.y1)) { G.FX.ring(ps.x1, ps.y1, 6, R, '#cad6e2', 0.4, 5); G.FX.burst(ps.x1, ps.y1 - 8, '#ffd25a', 18, 220); G.Audio.sfx('break'); }
    if (!f.ghost) { blast3(pl, m, ps.x1, ps.y1, R, f.dmg * 1.2, { knock: 120 }); G.Camera.kick(0.25); }
    for (const o of fields) if (o.k3 === 'crater' && o.owner === pl) o.gone = true;
    add3(pl, 'crater', { ghost: f.ghost, x: ps.x1, y: ps.y1, r: 70, dur: 4, buffT: 0, pad: 80, tk: craterTk3, dg: craterDg3 });
  }
  function craterTk3(f, dt) {
    const pl = f.owner;
    if (f.t >= f.dur) return true;
    if (!f.ghost && !pl.dead && (pl.x - f.x) ** 2 + (pl.y - f.y) ** 2 < f.r * f.r && (f.buffT -= dt) <= 0) {
      f.buffT = 0.5;
      pl.addBuff('def', 0.12, 0.7, 1, 'meteor-crater');
    }
    return false;
  }
  function craterDg3(ctx, f, own) {
    const a = Math.min(1, (f.dur - f.t) * 2, f.t * 8) * own;
    ell3(ctx, f.x, f.y, f.r, f.r * 0.55, '#232d38', 0.3 * a);
    ell3(ctx, f.x, f.y, f.r * 0.7, f.r * 0.38, '#56667a', 0.25 * a);
    ctx.globalAlpha = a;
    for (let i = 0; i < 4; i++) { const b = i * 1.5708 + 0.4; G.VFX.draw(ctx, 'crack', 'steel', f.x + Math.cos(b) * f.r * 0.6, f.y + Math.sin(b) * f.r * 0.33, { angle: b }); }
    for (let i = 0; i < 3; i++) { const b = i * 2.094 + 1; G.VFX.draw(ctx, 'shard', 'steel', f.x + Math.cos(b) * f.r * 0.4, f.y + Math.sin(b) * f.r * 0.2 - 3, { angle: b }); }
  }
  function swingPos3(ps) { const k = Math.min(1, ps.t / ps.dur); return [ps.x0 + (ps.x1 - ps.x0) * k, ps.y0 + (ps.y1 - ps.y0) * k, k]; }
  function swingDg3(ctx, f, own) {
    for (const b of f.birds) if (b.pass) { const [x, y] = swingPos3(b.pass); ell3(ctx, x, y, 9, 3.5, '#000', 0.25 * own); }
  }
  function swingDa3(ctx, f, own, now) {
    for (const b of f.birds) {
      const ps = b.pass;
      if (!ps) continue;
      const [x, y, k] = swingPos3(ps);
      if (ps.crash) {
        G.VFX.draw(ctx, 'bird', 'steel', x, y - 70 * (1 - k) - 10, { scale: 1.5 + k, angle: Math.atan2(40 + 70, 120), frame: (now * 9) | 0 });
      } else {
        const vx = ps.x1 - ps.x0, flip = vx < 0;
        G.VFX.draw(ctx, 'bird', 'steel', x, y - 22, { scale: 1.5, flip, angle: flip ? Math.atan2(-(ps.y1 - ps.y0), -vx) : Math.atan2(ps.y1 - ps.y0, vx), frame: (now * 9) | 0 });
        if (Math.random() < 0.5) G.FX.px(x - vx * 0.02, y - 22, '#cad6e2', { life: 0.25 });
      }
    }
  }

  // Fiebre Dorada → Deseo Oculto: monedas que botan y se quedan (pisarlas da crítico); cada lluvia cansa;
  // evolucionada, una estrella cae después sobre el grupo más grande.
  MECH3['make-it-rain'] = {
    cast(pl, m) {
      const n = Math.max(1, m.count | 0);
      add3(pl, 'coinrain', { m, left: n, every: 0.8 / n, next: 0, k: 0, vis: G.VFX.forMove(m), dmg: m.dmg * pl.atkFor(m), pad: 300, tk: coinRainTk3 });
      if (sees3(pl.x, pl.y, 100)) G.Audio.sfx('coin');
      if (!ghost) pl.addBuff('satk', -0.1, 2, 1, 'make-it-rain');
      if (m.wish) add3(pl, 'wish', { m, at: 2, dmg: m.dmg * pl.atkFor(m) * 2.4, tx: null, ty: null, pad: 300, tk: wishTk3, dg: wishDg3, da: wishDa3 });
    }
  };
  function coinRainTk3(f, dt) {
    const pl = f.owner, m = f.m;
    if (pl.dead) return true;
    f.x = pl.x; f.y = pl.y;
    f.next -= dt;
    while (f.next <= 0 && f.left > 0) {
      f.next += f.every; f.left--;
      const e = ++f.k % 2 ? null : rainTarget(pl);
      const x = e ? e.x + G.U.rand(-6, 6) : pl.x + G.U.rand(-RAIN_W + 40, RAIN_W - 40);
      const ty = e ? e.y : pl.y + G.U.rand(-RAIN_H * 0.6, RAIN_H * 0.6), sp = (m.speed || 240) * pkOf(m).pspd;
      G.Projectiles.spawn(Object.assign({ x, y: ty - 250, vx: 0, vy: sp, air: true, noShadow: true, alpha: 0.95, dmg: f.dmg, r: m.size, life: 3,
                                          pierce: Infinity, color: '#f0b800', hits: new Set(), vis: f.vis, ghost: f.ghost, owner: pl,
                                          land3: ty, upd3: coinUpd3 }, payload(m)));
    }
    return f.left <= 0;
  }
  function coinUpd3(p) {
    if (!(p.vy > 0) || p.y < p.land3) return false;
    if (!p.b3) { p.b3 = 1; p.vy = -Math.abs(p.vy) * 0.28; p.vx = G.U.rand(-40, 40); p.y = p.land3 - 1; return false; }
    add3(p.owner, 'gcoin', { ghost: p.ghost, x: p.x, y: p.land3, dur: 3, pad: 20, tk: gcoinTk3, dg: gcoinDg3 });
    cap3(p.owner, 'gcoin', 24);
    return true;
  }
  /** Moneda en el suelo: si la pisas, +2 % de crítico 5 s (hasta 5 a la vez). */
  function gcoinTk3(f) {
    if (f.t >= f.dur) return true;
    if (f.ghost) return false;
    const me = f.owner;
    if (me.dead || (me.x - f.x) ** 2 + (me.y - f.y) ** 2 > (me.r + 10) ** 2) return false;
    const u = P3(me);
    if (u.crit.length >= 5) u.crit.shift();
    u.crit.push(5);
    G.Audio.sfx('coin');
    G.FX.dmgText(me.x, me.y - me.bodyH - 16, '+' + (u.crit.length * 2) + '%', '#ffe46a');
    return true;
  }
  function gcoinDg3(ctx, f, own, now) {
    const blink = f.dur - f.t < 0.8 && Math.sin(now * 30) > 0;
    if (blink) return;
    ctx.globalAlpha = own;
    G.VFX.draw(ctx, 'coin', 'gold', f.x, f.y - 3, { frame: ((now * 4 + f.x) | 0) % 2 });
  }
  function wishTk3(f) {
    const pl = f.owner;
    if (f.tx == null && f.t >= 1.3) {
      const g = pl.dead ? null : group3(pl);
      f.tx = g ? g.x : pl.x + Math.cos(pl.aim) * 120; f.ty = g ? g.y : pl.y + Math.sin(pl.aim) * 100; f.x = f.tx; f.y = f.ty;
    }
    if (f.t < f.at) return false;
    if (f.tx != null) {
      if (sees3(f.tx, f.ty)) { G.FX.ring(f.tx, f.ty, 6, 100, '#ffe46a', 0.45, 5); G.FX.burst(f.tx, f.ty - 8, '#fff2a0', 22, 240); G.Audio.sfx('judge'); }
      if (!f.ghost) { blast3(pl, sub3(f.m), f.tx, f.ty, 100, f.dmg, { knock: 80 }); G.Camera.kick(0.3); }
    }
    return true;
  }
  function wishDg3(ctx, f, own, now) {
    if (f.tx == null) return;
    const k = G.U.clamp((f.t - 1.3) / (f.at - 1.3), 0, 1);
    ctx.globalAlpha = (0.3 + 0.4 * k) * own; ctx.strokeStyle = '#ffe46a'; ctx.lineWidth = 2; ctx.setLineDash(DASH); ctx.lineDashOffset = -now * 30;
    ctx.beginPath(); ctx.ellipse(f.tx, f.ty, 100, 60, 0, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
  }
  function wishDa3(ctx, f, own, now) {
    if (f.tx == null) return;
    const k = G.U.clamp((f.t - 1.3) / (f.at - 1.3), 0, 1);
    G.VFX.draw(ctx, 'star', 'gold', f.tx + (1 - k) * 80, f.ty - (1 - k) * 260 - 10, { scale: 3, angle: now * 6, frame: 0 });
  }

  // ==== mech: siniestro ====
  // Mordisco → Triturar: muerde y arrastra al enemigo 0,5 s (tres mordiscos) cortándole lo que prepara;
  // evolucionado, cada mordisco le baja la defensa y al soltarlo lo lanzas lejos.
  MECH3['bite'] = {
    cast(pl, m) {
      const half = Math.min(m.arc, 6.2832) / 2;
      let g = null, bd = Infinity;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
        if (e.dead || big3(e) || e.behavior === 'thief' || !inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
        const d = (e.x - pl.x) ** 2 + (e.y - pl.y) ** 2;
        if (d < bd) { bd = d; g = e; }
      }
      melee(pl, m);
      if (g && (!ghost || real3(g))) add3(pl, 'grab', { m, e: g, dur: 0.5, n: 2, every: 0.17, next: 0.17, dmg: m.dmg * pl.atkFor(m) * 0.5, pad: 60, tk: grabTk3 });
    },
    after(pl, e, m) { interrupt3(e); if (m.crunch) inflict(e, 'vuln', 5, 1); }
  };
  function grabTk3(f, dt) {
    const pl = f.owner, e = f.e, m = f.m;
    if (pl.dead || !e || e.dead) return true;
    const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
    f.x = e.x; f.y = e.y;
    if (real3(e)) {
      const tx = pl.x + ca * (pl.r + e.r + 2), ty = pl.y + sa * (pl.r + e.r + 2);
      e.x = G.U.damp(e.x, tx, 18, dt); e.y = G.U.damp(e.y, ty, 18, dt); e.kx = e.ky = 0;
    }
    if ((f.next -= dt) <= 0 && f.n > 0) {
      f.next += f.every; f.n--;
      if (sees3(e.x, e.y)) { G.FX.sp('jaws', 'dark', e.x, e.y - e.bodyH * 0.5, { life: 0.16, scale: 1.5, fade: false }); G.Audio.sfx('hit'); }
      if (!f.ghost) hit(pl, e, f.dmg, G.U.TYPE_COLOR.dark, ca, sa, !f.n && m.crunch ? 420 : 0, m);
    }
    return f.t >= f.dur;
  }

  // Pulso Umbrío → Alarido: cada alcanzado suelta su propio pulso (se contagia, hasta 30); evolucionado, llega el doble y baja el ataque.
  MECH3['dark-pulse'] = {
    cast(pl, m) { const w = { set: new Set(), n: 0 }; tagged3(() => nova(pl, m), p => { p.wave3 = w; }); },
    afterP(pl, e, m, p) {
      if (Math.random() < 0.2) interrupt3(e);
      if (m.shriek) inflict(e, 'atk', 4, 0.4);
      if (p.wave3) pulse3(pl, m, p.wave3, e, p.dmg * 0.15, false);
    },
    ghostP(p, e) { if (p.wave3 && p.src) pulse3(p.owner, p.src, p.wave3, e, p.dmg * 0.15, true); }
  };
  function pulse3(pl, m, w, e, dmg, g) {
    if (w.set.has(e.id) || w.n >= 20) return;
    w.set.add(e.id); w.n++;
    add3(pl, 'dpulse', { m, ghost: g, w, x: e.x, y: e.y, at: 0.12, r: m.shriek ? 80 : 40, dmg, pad: 90, tk: dpulseTk3 });
  }
  function dpulseTk3(f) {
    if (f.t < f.at) return false;
    const m = f.m, col = m.shriek ? '#d05a8a' : '#7a52c0';
    if (sees3(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, col, 0.28, 3); G.FX.ring(f.x, f.y, 2, f.r * 0.6, '#0e0a0c', 0.2, 2); }
    if (f.ghost) { for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) pulse3(f.owner, m, f.w, e, f.dmg * 0.8, true); return true; }
    blast3(f.owner, sub3(m), f.x, f.y, f.r, f.dmg, { each: e => {
      if (m.shriek) inflict(e, 'atk', 4, 0.4);
      pulse3(f.owner, m, f.w, e, f.dmg * 0.75, false);
    } });
    return true;
  }

  // Tinieblas → Pesadilla: daño fijo según tu nivel e ilusiones (disparos hacia atrás); evolucionada, duerme y consume.
  MECH3['night-shade'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
      G.FX.ring(pl.x, pl.y, m.radius * 0.5, m.radius, '#0e0a0c', 0.28, 2);
      if (sees3(pl.x, pl.y)) for (let i = 0; i < 4; i++) {
        const a = Math.random() * 6.2832, r = m.radius * G.U.rand(0.45, 1);
        G.FX.sp(vis.aura || 'shadow', m.dream ? 'nightmare' : 'dark', pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r * 0.8 - G.LIFT * 0.5,
                { vx: G.U.rand(-10, 10), vy: -55, life: 0.42 });
      }
      if (ghost) return;
      const u = P3(pl); u.shade = 0.6; u.shadeR = m.radius;
      // Daño fijo: (4 + nivel) × lo que haya subido de nivel el ataque. (G.BAL_ATK: tools/balance.cjs lo mide en «ataque 1».)
      const d = (4 + (pl.level || 1)) * (m.def ? m.dmg / m.def.dmg : 1) / (G.BAL_ATK || 1), now = T3();
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
        if (e.dead) continue;
        pure3(pl, e, d, m, col);
        afterHit(pl, e, m);
        if (m.dream && !e.dead) dream3(pl, e, m, now);
      }
      for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, d, col);
    }
  };
  /** Pesadilla: a los 2 s dentro se duermen; dormidos, pierden un 3 % de su vida por segundo. */
  function dream3(pl, e, m, now) {
    const s = sOf(e), dt = s.dreamAt ? Math.min(0.7, now - s.dreamAt) : 0;
    s.dreamT = s.dreamAt && now - s.dreamAt < 1 ? (s.dreamT || 0) + dt : 0;
    s.dreamAt = now;
    if (s.sleep > 0) { pure3(pl, e, (e.maxHp || 0) * 0.03 * Math.max(dt, 0.3), m, '#d05a8a'); return; }
    if (s.dreamT >= 2 && !big3(e)) { s.dreamT = 0; inflict(e, 'sleep', 2); }
  }

  // Golpe Bajo → Juego Sucio: va al que prepara un ataque (×2 y se lo corta) o al más cercano (×1,5 de espaldas);
  // evolucionado, duele según la fuerza del enemigo (jefes ×2,5).
  MECH3['sucker-punch'] = {
    cast(pl, m) {
      const n = Math.max(1, m.count | 0), R = 360, list = [];
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) if (prepping3(e)) list.push(e);
      list.sort((a, b) => ((a.x - pl.x) ** 2 + (a.y - pl.y) ** 2) - ((b.x - pl.x) ** 2 + (b.y - pl.y) ** 2));
      if (list.length > n) list.length = n;
      if (list.length < n) {
        const t = pl.target && !pl.target.dead && !list.includes(pl.target) ? pl.target : null;
        if (t) list.push(t);
        for (const e of nearestN3(pl.x, pl.y, R, n * 2)) if (list.length < n && !list.includes(e)) list.push(e);
      }
      if (!list.length) return;
      const sp = m.speed || 420, v = G.VFX.forMove(m);
      list.forEach((e, i) => {
        const a = Math.atan2(e.y - pl.y, e.x - pl.x) + (i ? G.U.rand(-0.25, 0.25) : 0);
        shot3(pl, m, { x: pl.x + Math.cos(a) * 4, y: pl.y + Math.sin(a) * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: m.life || 1.6, vis: v,
                       lock3: e, only3: e.id, upd3: lockUpd3 });
        if (prepping3(e) && sees3(e.x, e.y)) G.FX.ring(e.x, e.y, e.r, e.r * 2, '#6b5c52', 0.25, 2);
      });
    },
    k(pl, e, m) {
      let k = prepping3(e) ? 2 : facing3(e, pl) < 0 ? 1.5 : 1;
      if (m.foul) k *= big3(e) ? 2.5 : G.U.clamp(((e.def && e.def.dmg) || 11) / 11 * (e.champ ? 1.35 : 1), 0.8, 2);
      return k;
    },
    afterP(pl, e) { if (prepping3(e)) { interrupt3(e); G.FX.dmgText(e.x, e.y - e.bodyH - 18, '¡Cortado!', '#d4c4cc'); } }
  };

  // Tajo Umbrío → Lariat Oscuro: te desvaneces 0,5 s girando (te pierden de vista, tajos críticos a los que no te miran);
  // evolucionado, giro enorme que atrae y no mira escudos ni resistencias.
  MECH3['night-slash'] = {
    cast(pl, m) {
      if (!ghost && !pl.dead) {
        P3(pl).hide = 0.5; invuln3(pl, 0.5);
        // Te pierden de vista: los de cerca dan vueltas sin saber dónde estás.
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 170)) if (free3(e)) inflict(e, 'confuse', 0.5);
      }
      if (sees3(pl.x, pl.y)) { G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#0e0a0c', 12, 140); G.FX.sp('shadow', m.lariat ? 'nightmare' : 'dark', pl.x, pl.y - pl.bodyH * 0.5, { life: 0.4, scale: 2.5 }); }
      spin(pl, m);
      const f = fields[fields.length - 1];
      if (f && f.kind === 'spin') f.vis = m.lariat ? visAs(m, 'nightmare', { melee: 'claw' }) : G.VFX.forMove(m);
      if (m.lariat) add3(pl, 'lariat', { m, dur: Math.max(1, m.count | 0) * 0.13 + 0.1, pad: 40, tk: lariatTk3 });
    },
    crit(pl, e) { const u = pl.u3; return !!(u && u.hide > 0 && !big3(e) && facing3(e, pl) <= 0); },
    k(pl, e, m) {
      if (!m.lariat) return 1;
      const t = G.Types.mult(m.type, e.types);
      return t > 0 && t < 1 ? 1 / t : 1;
    }
  };
  function lariatTk3(f, dt) {
    const pl = f.owner, R = f.m.radius;
    if (pl.dead || f.t >= f.dur) return true;
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R * 1.3)) {
      if (!free3(e)) continue;
      const dx = pl.x - e.x, dy = pl.y - e.y, d = Math.hypot(dx, dy);
      if (d < pl.r + e.r) continue;
      const k = Math.min(d - pl.r - e.r, 240 * dt) / d;
      e.x += dx * k; e.y += dy * k;
    }
    // Sin escudos: el giro se los quita (los de verdad).
    if (!f.ghost) for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) if (real3(e) && e.shield > 0) e.shield = 0;
    return false;
  }

  // Brecha Negra → Calamidad: (el barrido de siempre, ahora con Dormido de verdad); evolucionada, agujero negro que se traga a los dormidos.
  MECH3['dark-void'] = {
    cast(pl, m) {
      wipe(pl, m);
      if (m.hole) add3(pl, 'bhole', { m, at: (m.delay || 1.2) + 0.25, dur: (m.delay || 1.2) + 0.25 + m.hole, on: false, tick: 0,
                                      dmg: m.dmg * pl.atkFor(m) * 0.3, r: 60, pad: 280, tk: holeTk3, dg: holeDg3, da: holeDa3 });
    }
  };
  function holeTk3(f, dt) {
    const pl = f.owner;
    if (f.t < f.at) { if (pl.dead) return true; f.x = pl.x; f.y = pl.y; return false; }
    if (f.t >= f.dur) return true;
    if (!f.on) { f.on = true; if (sees3(f.x, f.y)) { G.FX.ring(f.x, f.y, f.r * 3, 4, '#3c2468', 0.5, 5); G.Audio.sfx('surge'); } }
    // Se traga a los dormidos (y a los aturdidos) de alrededor.
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, 260)) {
      if (!free3(e) || !((e.s3 && e.s3.sleep > 0) || e.stunT > 0)) continue;
      const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy);
      if (d < 6) continue;
      const k = Math.min(d, 200 * dt) / d;
      e.x += dx * k; e.y += dy * k;
    }
    if ((f.tick -= dt) <= 0) { f.tick = 0.3; blast3(pl, sub3(f.m), f.x, f.y, f.r, f.dmg, { ghost: f.ghost }); }
    if (Math.random() < dt * 20 && sees3(f.x, f.y)) {
      const a = Math.random() * 6.2832, r = G.U.rand(60, 160);
      G.FX.sp('shadow', 'umbra', f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.6 - 8, { vx: -Math.cos(a) * r * 2, vy: -Math.sin(a) * r * 1.2, life: 0.45 });
    }
    return false;
  }
  function holeDg3(ctx, f, own) { if (f.on) ell3(ctx, f.x, f.y, f.r * 1.4, f.r * 0.7, '#05030a', 0.35 * own); }
  function holeDa3(ctx, f, own, now) {
    if (!f.on) return;
    const a = Math.min(1, (f.dur - f.t) * 3, (f.t - f.at) * 6) * own, r = f.r * (0.55 + 0.05 * Math.sin(now * 8));
    ctx.save();
    ctx.globalAlpha = a; ctx.fillStyle = '#05030a';
    ctx.beginPath(); ctx.arc(f.x, f.y - 24, r * 0.6, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#7a52c0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x, f.y - 24, r * 0.6 + 2, now * 4, now * 4 + 4.5); ctx.stroke();
    ctx.restore();
  }

  // Paliza → Cerco Dimensión: una copia por cada tipo de tus ataques (con su estado); evolucionada, salen de portales.
  const BEAT3 = Object.create(null);
  MECH3['beat-up'] = {
    cast(pl, m) {
      const types = [];
      for (const x of pl.moves || []) if (x && x.type && x.kind !== 'buff' && !types.includes(x.type)) types.push(x.type);
      if (!types.length) types.push(m.type);
      // (Como mínimo 2, como antes: con un solo tipo, dos copias de ese tipo.)
      const n = Math.max(2, Math.min(4, types.length)) + Math.max(0, (m.count | 0) - 2), dmg = m.dmg * pl.atkFor(m), copy = m.sprite === 'owner';
      const near = m.portal ? nearestN3(pl.x, pl.y, 300, n) : [];
      for (let i = 0; i < n; i++) {
        const t = types[i % types.length], mm = beatAs3(m, t), a = pl.aim + i * 6.2832 / n;
        let x = pl.x + Math.cos(a) * 18, y = pl.y + Math.sin(a) * 14;
        const e = near[i % Math.max(1, near.length)];
        if (e) {
          // Cerco Dimensión: sale de un portal por la espalda del enemigo (y el portal se traga sus disparos).
          const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
          x = e.x + nx * (e.r + 16); y = e.y + ny * (e.r + 16);
          add3(pl, 'portal', { x, y, r: 18, dur: 2.2, pad: 30, tk: portalTk3, dg: portalDg3 });
        }
        fields.push({ kind: 'ally', owner: pl, ghost, m: mm, col: G.U.TYPE_COLOR[t], vis: G.VFX.forMove(m), x, y, aura3: G.U.TYPE_COLOR[t],
                      vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed, t: 0, life: m.dur || 6, r: m.size || 9, tgt: e || null, look: 0, wa: a,
                      hitLog: new Map(), ph: Math.random() * 6.2832, pad: 40, dmg,
                      anim: copy && G.Sprites.Animator ? new G.Sprites.Animator(pl.form || pl.dex, (pl.scale || 1) * 0.55, pl.shiny) : null });
      }
      trimOld('ally', pl, m.id, n);
      cap3(pl, 'portal', 8);
      G.FX.ring(pl.x, pl.y, 4, pl.r * 3, G.U.TYPE_COLOR[m.type], 0.3, 2);
    },
    after(pl, e, m) {
      // Cada copia, con el estado de su tipo (quemar, envenenar y frenar ya los lleva su movimiento).
      switch (m.type) {
        case 'electric': inflict(e, 'para', 1.2); break;
        case 'ghost': inflict(e, 'curse', 2); break;
        case 'fairy': inflict(e, 'atk', 2, 0.2); break;
        case 'dark': inflict(e, 'vuln', 4, 1); break;
        case 'psychic': inflict(e, 'confuse', 1); break;
        case 'fighting': interrupt3(e); break;
        case 'dragon': if (Math.random() < 0.25) inflict(e, 'fear', 1, [e.x - (e.kx || 0), e.y - (e.ky || 0)]); break;
        case 'grass': inflict(e, 'root', 0.4); break;
      }
    }
  };
  /** La Paliza con el tipo t (misma instancia; su daño cuenta en la del movimiento). */
  function beatAs3(m, t) {
    if (t === m.type) return m;
    const k = m.id + '|' + t;
    let c = BEAT3[k];
    if (!c || Object.getPrototypeOf(c) !== m) {
      c = BEAT3[k] = Object.create(m, {
        type: { value: t }, dealt: { get() { return m.dealt || 0; }, set(v) { m.dealt = v; } },
        burn: { value: t === 'fire' ? 1 : 0 }, poison: { value: t === 'poison' ? 1 : 0 },
        slow: { value: t === 'ice' || t === 'water' || t === 'ground' || t === 'bug' ? 0.3 : 0 },
        knock: { value: t === 'flying' || t === 'rock' || t === 'steel' || t === 'fighting' ? 80 : m.knock || 0 }
      });
    }
    return c;
  }
  function portalTk3(f) { walls3.push(f.w3 || (f.w3 = { x: f.x, y: f.y, r: f.r, eat: true })); return f.t >= f.dur; }
  function portalDg3(ctx, f, own, now) {
    const a = Math.min(1, (f.dur - f.t) * 3, f.t * 6) * own;
    ctx.globalAlpha = a; ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 10, f.r, f.r * 1.2, 0, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 0.35 * a; ctx.fillStyle = '#2a1e5a';
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 10, f.r - 2, f.r * 1.2 - 2, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = a; ctx.fillStyle = '#fffbe0';
    const b = now * 3;
    ctx.fillRect(Math.round(f.x + Math.cos(b) * f.r) - 1, Math.round(f.y - 10 + Math.sin(b) * f.r * 1.2) - 1, 3, 3);
  }

  // ---------------- cada fotograma y dibujo de lo de este bloque ----------------
  /** Antes de los campos: estados de los enemigos y la lista de lo que para disparos (la rellenan los campos). */
  function frame3(dt) {
    walls3.length = 0;
    if (tw3.length) tw3 = tw3.filter(p => !p.boom3 && p.t < p.life);
    if (aff3.size) { plrs3 = G.Game.everyone ? G.Game.everyone() : [G.Game.player]; tickS3(dt); }
  }
  /** Un campo de este bloque (los llama updateFields). → true si se acaba. */
  function tick3(f, dt) { return f.tk ? f.tk(f, dt) : true; }
  /** Lo que va encima de todo: iconos de estado y lo tuyo. */
  function drawTop3(ctx) {
    const now = performance.now() / 1000;
    drawS3(ctx, now);
    drawPl3(ctx, now);
  }
  /* ---- fin de los ataques únicos de Roca, Fantasma, Dragón, Siniestro, Acero, Hada ---- */

  return { tick, resolve, ghostCast, ghostOrbit, updateFields, drawGroundFields, drawAirFields, clearFields,
           reach, cooldown, wardBlock, zOf, zUse, uq: UQX,
           get fieldCount() { return fields.length; } };
})();
