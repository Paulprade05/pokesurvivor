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
 *
 * Ataques únicos (26-10-2026): cada movimiento puede tener su propia mecánica y
 * evolución (MECH[id]), con estados de los enemigos, zonas que reaccionan,
 * enemigos lanzados... Ver «motor de ataques únicos» al final del módulo.
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
    // (Ataques únicos: lo que corre aunque el ataque no esté en el hueco activo, ver motor.)
    mxIdle(dt, pl, act);
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
    // Ataques únicos (motor común, abajo): su gancho de cada fotograma; los «manual» se lanzan desde él.
    const M = MECH[m.id];
    if (M && M.tick) M.tick(pl, m, dt);
    if (M && M.manual) return;
    // Órbita: la suya (M.orbit, true = no hace falta la de la familia) o la de siempre (y después M.orb).
    // Una órbita con cast propio (la jaula de Giro Fuego) se lanza con su recarga como los demás.
    if (m.kind === 'orbit' && !(M && M.cast)) { if (!(M && M.orbit && M.orbit(pl, m, dt, now))) orbit(pl, m, dt, now); return; }
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
    if (M && M.ready && !M.ready(pl, m)) {
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
    // Ataques únicos: su mecánica manda sobre la de la familia (evo si está evolucionado; false: además, la de la familia).
    const M = MECH[m.id];
    if (M) {
      const c = (m.evolved && M.evo) || M.cast;
      if (c && c(pl, m) !== false) return;
    }
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
  // (Ataques únicos: MECH[id].need 'target' | 'near' | 'none' manda sobre la familia.)
  const needOf = m => { const M = MECH[m.id]; return M && M.need; };
  const targeted = m => { const n = needOf(m); return n ? n === 'target' : TARGETED.includes(m.kind) || (m.kind === 'column' && m.anchor === 'target'); };
  const ambient = m => { const n = needOf(m); return n ? n === 'near' : AMBIENT.includes(m.kind) || (m.kind === 'column' && m.anchor !== 'target'); };
  function needsTarget(m, pl) { return targeted(m) && !(pl && pl.manualAim && FREE_AIM.includes(m.kind)); }
  function needsNear(m, pl) { return ambient(m) && !(pl && pl.manualAim && FREE_AIM.includes(m.kind)); }
  function reach(m) {
    const M = MECH[m.id];
    if (M && M.reach) return M.reach(m);
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
    const o = { burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.castType || m.type, mcat: m.cat, src: m,
                bounce: m.bounce | 0, drain: m.drain || 0 };
    // Ataques únicos: lo de sus proyectiles (trayectoria, al chocar, al acabar...), MECH[id].pp.
    const M = MECH[m.id];
    if (M && M.pp) Object.assign(o, M.pp(m));
    return o;
  }

  /** Tabla de tipos × clima para un ataque de tipo `type` contra `e`. */
  function typeK(type, e) { return G.Types.mult(type, e.types) * G.Weather.mult(type); }
  /** (Ataques únicos: m.stellar —Teraclúster— nunca hace menos de ×1: ni resistencias ni inmunidades.) */
  const typeKm = (type, e, m) => (m && m.stellar ? Math.max(1, typeK(type, e)) : typeK(type, e));

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
    // (!last.gone: tras clearFields —grieta, juicio— el anterior ya no está y no hay que esperarlo.)
    if (last && !last.gone && G.U.dist2(last.x, last.y, pl.x, pl.y) < (m.radius * 0.9) ** 2 && last.t < 1) return;
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
        // Empuja hacia fuera del eje; Gancho Alto, hacia arriba; Cascada (f.flow), corriente abajo.
        if (f.flow) hit(pl, e, f.dmg, f.col, f.flow[0], f.flow[1], m.knock || 0, m);
        else hit(pl, e, f.dmg, f.col, m.knockUp ? 0 : e.x >= cx ? 1 : -1, m.knockUp ? -1 : 0, m.knock || 0, m);
      }
      for (const p of G.World.propsInCircle(cx, cy, R)) {
        if (Math.abs(p.x - cx) <= hw + p.r && Math.abs(p.y - cy) <= hh) G.World.damageProp(p, f.dmg, f.col);
      }
    }
    if (!f.ghost && sees) G.Camera.kick(0.05);
    if (f.onStrike) f.onStrike(f);                    // (ataques únicos: Cascada, Chuzos)
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
    if (p.onBounce) p.onBounce(p);                    // (ataques únicos: Rueda Aural)
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
        if (!e.dead) stAdd(e, 'sleep', m.stun || 1);
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
    // (Ataques únicos: esquivas de Agilidad y Doble Equipo; el escudo de Luz Lunar; lo que pasa al recibir un golpe.)
    if (mxDodge(pl)) return true;
    if (pl.u3 && pl.u3.shield > 0) shield3(pl);
    let m = null;
    for (const x of pl.moves) if (x.kind === 'ward' && (x.charges | 0) > 0 && (!m || x.dmg > m.dmg)) m = x;
    if (!m) { mxHurt(pl); return false; }
    if ((m.charges | 0) >= wardMax(m)) m.t = cooldown(pl, m);   // estaba lleno: empieza a recargar
    m.charges--;
    pl.invuln = Math.max(pl.invuln || 0, 0.5);
    if (m.heal > 0) pl.heal(pl.maxHp * m.heal);                   // evolucionado: cura un poco
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 12, '¡Protegido!', '#9fe0ff', true);
    G.Audio.sfx('shake'); G.Audio.sfx('break');
    G.Camera.kick(0.15);
    wardBurst(pl, m);
    m.castAt = performance.now();
    if (G.Coop.active) G.Coop.cast(pl, m, 1);
    // Ataques únicos: lo que hace al parar (Escudo Real: forma Filo; Búnker te encierra; Barrera Espinosa...).
    const M = MECH[m.id];
    if (M && M.block) M.block(pl, m, false);
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
    const X = MECH[f.m.id], own = X && X.allyTarget && X.allyTarget(f, pl);
    if (own) return own;
    let best = null, bd = 170 * 170;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const d = G.U.dist2(f.x, f.y, e.x, e.y) * (e.sts && e.sts.mark ? 0.2 : 1);
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
    const pf = { kind: 'puddle', owner: f.owner, ghost: f.ghost, m, col: f.col, vis: f.vis, x: f.tx, y: f.ty, r, r0: r,
                 t: 0, life: m.dur || 3, tick: 0, follow: !!m.follow, dmg: f.dmg, pad: r * 1.5 };
    fields.push(pf);
    const M = MECH[m.id];
    if (M && M.puddle) M.puddle(pf);                  // (ataques únicos: Voto Fuego)
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
    // Ataques únicos: lo que añaden a los campos de su familia (MECH[id].field).
    // (Mientras, «ghost» es el del campo: el de un compañero no daña aquí.)
    const X = m && MECH[m.id];
    if (X && X.field) {
      const g = ghost;
      ghost = !!f.ghost;
      try { X.field(f, dt); } finally { ghost = g; }
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
      const M = MECH[m.id];
      if (M && M.zone) M.zone(pl, m, f);              // (ataques únicos: Onda Trueno, Liofilización: lo que pasa al caer)
      else if (!f.ghost) {
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
      if (f.tickFn) f.tickFn(f, dt);                  // (ataques únicos: Voto Fuego)
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
                              'wipe', 'ally', 'wings', 'flask', 'puddle', 'shower']);
  function updateFields(dt) {
    mxTick(dt);                                       // (ataques únicos: estados de los enemigos, lanzados...)
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      f.t += dt;
      if (f.gone || !f.owner || (f.life && f.t >= f.life && f.kind !== 'mine')) {
        if (f.end && !f.gone && f.owner && f.kind === 'mx') mxEnd(f);   // (campos de los ataques únicos: lo que pasa al acabar)
        fields.splice(i, 1); continue;
      }
      // Campos de los ataques únicos (motor común): su upd devuelve true para quitarlo.
      if (f.kind === 'mx') { if (mxUpd(f, dt)) fields.splice(i, 1); continue; }
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
      if (f.kind === 'mx') { if (f.dg) { ctx.save(); ctx.globalAlpha = own; f.dg(ctx, f, own, now); ctx.restore(); } continue; }
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
      }
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
      if (f.kind === 'mx') { if (f.da) { ctx.save(); f.da(ctx, f, own, now); ctx.restore(); ctx.globalAlpha = own; } continue; }
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
    mxDrawTop(ctx, own, now);                         // (ataques únicos: iconos de estado y lo tuyo)
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
    const cam = G.Camera, vr = cam.viewRect(30), L = vr.x, T = vr.y, W = vr.w, H = vr.h;     // (con Ultra, también las esquinas de arriba)
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
        if (e.dead || (!e.remote && !(e.stunT > 0)) || stHas(e, 'sleep') || !cam.sees(e.x, e.y, 20)) continue;
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
    // (Los que se van quedan como «gone»: quien guarde uno —el último rastro, el Campo Eléctrico— ya no lo usa.)
    for (const f of fields) if (!owner || f.owner === owner) f.gone = true;
    fields = owner ? fields.filter(f => f.owner !== owner) : [];
    if (owner) ghostWards.delete(owner); else ghostWards.clear();
    if (!owner) mxReset();                            // (ataques únicos: estados, lanzados, historial de tipos...)
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
    const M = MECH[m.id];
    if (M && M.orb) M.orb(pl, m, dt, live, isGhost);   // (ataques únicos: Poder Pasado salen disparadas, Tormenta Floral se abre...)

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
    // (Una órbita con mecánica propia, como la jaula de Giro Fuego, sí se lanza: ver motor.)
    if (!def || (def.kind === 'orbit' && !(MECH[id] && MECH[id].cast))) return;
    const m = G.Moves.instance(id, lvl);
    if (evolved) G.Moves.evolve(m);
    G.Moves.applyPassives(m, netPass(pas));
    if (typeof aim === 'number' && Number.isFinite(aim)) pl.aim = aim;
    mxSeen(pl, m);                                    // (historial de tipos del grupo: Rayo Fusión, Voto Fuego)
    // Escudo que para un golpe: sólo el estallido (y un escudo menos a la vista).
    if (variant === 1) {
      if (m.kind !== 'ward') return;
      const w = pl.wardN;
      if (w && w[id] > 0) w[id]--;
      wardBurst(pl, m);
      const M = MECH[id];
      if (M && M.block) M.block(pl, m, true);         // (g = true: el de un compañero, sólo lo que se ve o le toca a tu Pokémon)
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
    const M = m && MECH[m.id];
    if (m && m.kind === 'orbit' && !(M && M.cast) && !pl.dead) orbit(pl, m, dt, now, true);
    else if (G.Projectiles.all().some(p => p.orb && p.owner === pl)) G.Projectiles.clearOrbs(pl);
  }

  // Golpe crítico (Mejoras → Golpe Crítico): x1,5 de daño, número naranja y grande.
  const CRIT_MUL = 1.5;
  // (Ataques únicos: críticos seguros y probabilidad de más, ver critOf en el motor común.)

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

  /**
   * Golpe de un ataque tuyo a e. o (opcional, ataques únicos): { type, cat, burn, poison, slow, raw }
   * cambia el tipo / la categoría / los estados de este golpe (zonas, espadas, choques...); raw: sin
   * los ganchos k / crit / after de su MECH (el daño de una zona no vuelve a detonar Ascuas).
   */
  function hit(pl, e, dmg, col, dx, dy, knock, m, o) {
    const type = (o && o.type) || m.castType || m.type, cat = (o && o.cat) || m.cat;
    const M = o && o.raw ? null : MECH[m.id];
    let k = typeKm(type, e, m) * G.Stats.taken(e.mon, cat) * abilOut(pl, m, e);
    k *= hitPre(pl, e, m, null, dmg * k, type, M);   // estados (vulnerable, empapado, congelado...) y M.k
    const crit = critOf(pl, e, m, null, M), sk = statusK(pl);
    dmg *= k * (crit ? critMul(pl) : 1);
    e.hurt(dmg, col, dx, dy, sk ? knock : 0, crit ? 'crit' : G.Types.label(G.Types.mult(type, e.types)));
    if (!ghost) pl.uqLast = e;
    if (!ghost) pl.onDealt(dmg);
    pl.dmgDealt += dmg;
    m.dealt = (m.dealt || 0) + dmg;               // por ataque, para el resumen de la pausa
    const burn = o ? o.burn || 0 : m.burn, poison = o ? o.poison || 0 : m.poison, slow = o ? o.slow || 0 : m.slow;
    if (burn && sk) e.applyBurn(burn * sk);
    if (poison && sk) e.applyPoison(poison * sk);
    if (slow && sk) e.applySlow(Math.min(0.8, slow * sk));
    hitPost(pl, e, m, null, type);                 // (historial de tipos, hielo sobre empapado, Voto Fuego)
    afterHit(pl, e, m);
    if (M && M.after && !ghost) M.after(pl, e, m, dmg, crit);
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
          // (Ataques únicos: lo que pasa al chocar con la pared; true = sigue vivo, lo ha resuelto él.)
          if (p.onWall && p.onWall(p) === true) continue;
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
          projectiles.splice(i, 1);
          continue;
        }
      }
      if (p.noHit) continue;                          // (de paso: vuelve a ti, cae... no golpea)

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
      const M = p.src ? MECH[p.src.id] : null;        // (ataques únicos, motor común)
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
          G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
          if (p.onHit && p.onHit(p, e, 0, false) === true) break;
          if (M && M.ghostP) M.ghostP(p, e);
          if (rebound(p, e)) break;
          if (p.pierce > 0) { p.pierce--; continue; }
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
          projectiles.splice(i, 1);
          break;
        }

        // (Ataques únicos: estados del enemigo y M.k, ver hitPre; críticos de más, critOf; p.hitK, el × del proyectil.)
        const type = p.mtype, pk = p.src ? hitPre(pl, e, p.src, p, p.dmg, type, M) : 1;
        const crit = critOf(pl, e, p.src, p, M), sk = statusK(pl);
        const k = (type ? typeKm(type, e, p.src) : 1) * G.Stats.taken(e.mon, p.mcat) * (crit ? critMul(pl) : 1) * abilOut(pl, p.src, e) *
                  (p.hitK ? p.hitK(p, e) : 1) * pk;
        e.hurt(p.dmg * k, p.color, p.vx || (e.x - pl.x), p.vy || (e.y - pl.y), sk ? p.knock : 0,
               crit ? 'crit' : p.mtype ? G.Types.label(G.Types.mult(p.mtype, e.types)) : null);
        pl.uqLast = e;
        if (Math.random() < 0.5) G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
        pl.dmgDealt += p.dmg * k;
        if (p.src) p.src.dealt = (p.src.dealt || 0) + p.dmg * k;
        pl.onDealt(p.dmg * k);
        if (p.burn && sk) e.applyBurn(p.burn * sk);
        if (p.poison && sk) e.applyPoison(p.poison * sk);
        if (p.slow && sk) e.applySlow(Math.min(0.8, p.slow * sk));
        if (p.drain) pl.heal(p.drain);                    // Beso Drenaje
        if (p.src) hitPost(pl, e, p.src, p, type);
        afterHit(pl, e, p.src);
        if (M && M.afterP) M.afterP(pl, e, p.src, p, p.dmg * k);
        if (p.onHit && p.onHit(p, e, p.dmg * k, crit) === true) break;   // (true: sigue vivo, lo ha resuelto él)

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
      if (e.touchCd > 0 || e.behavior === 'thief' || e.stunT > 0) continue;
      // (Ataques únicos: enamorados, encandilados, en el aire, confusos... no te tocan; ver noTouch.)
      if (e.sts && noTouch(e)) { e.touchCd = 0.3; continue; }
      e.touchCd = 0.55;
      e.strike(pl);
      // (touchHit: las habilidades saben que este golpe es cuerpo a cuerpo, ver data/ability-fx.js.)
      pl.touchHit = true;
      incoming3 = e.dmg;
      try { pl.hurt(e.dmg * (pl.u3 ? mistK3(pl, e.x, e.y, e.types && e.types.includes('dragon')) : 1), e.atkType, false, e.cat); } finally { pl.touchHit = false; incoming3 = 0; }
      if (pl.u3 && pl.u3.anchor > 0) touch3(pl, e);                // (Cuerpo Pesado)
      mxTouched(pl, e);                               // (Barrera Espinosa, Fortaleza, Defensa Férrea...)
      if (pl.hasItem('rockyhelmet')) e.hurt(15 + pl.level * 4, '#9aa6b5', e.x - pl.x, e.y - pl.y, 80);
      if (pl.abil && pl.abil.contact && !pl.dead && !e.dead) pl.abil.contact(pl, e);     // Elec. Estática, Cuerpo Llama...
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.kx += nx * 150; e.ky += ny * 150;
    }
  }

  /* =====================================================================================
   * -- motor común de ataques únicos (26-10-2026, unificado el 28-10-2026) --
   * Lo que comparten los ataques únicos de los 18 tipos (diseño: ataques-diseno.md, E1-E16).
   * Todo es opcional: un movimiento sin entrada en MECH funciona como antes, con la función
   * de su familia (kind). La familia sigue mandando en lo común: escalera de mejoras,
   * pasivos (Amplitud, Persistencia, Réplica, Propulsión), animación, sonido base e icono.
   * Un solo registro (MECH), un solo sistema de estados (e.sts), de campos y zonas (kind
   * 'mx'), de evolución por ataque (data/moves.js, EVO[id][2] = { t, mods }) y de utilidades.
   *
   * ---- MECH[id]: la mecánica de cada ataque (los ganchos que falten no hacen nada) ----
   *   cast(pl, m)              lo lanza EN LUGAR de su familia (devuelve false: además, la familia).
   *                            También para los compañeros (ghostCast, ghost = true: sólo se ve; lo
   *                            que mueve enemigos lo hace quien los tiene de verdad, real(e)).
   *   evo(pl, m)               igual, si m.evolved (si falta, cast con m.evolved).
   *   ready(pl, m)             ¿puede lanzarse ya? (Terratemblor: si andas)
   *   need                     'target' | 'near' | 'none': qué espera para lanzarse (si no, su familia).
   *   reach(m)                 alcance para esperar blanco (si no, el de su familia).
   *   manual / tick(pl, m, dt) la recarga no lo lanza: lo lanza su tick con fire(pl, m) / cada
   *                            fotograma mientras esté en el hueco activo (sólo tu jugador).
   *   idle(pl, m, dt, act)     cada fotograma esté donde esté (act: en el hueco activo).
   *   pp(m)                    lo que llevan sus proyectiles (ver «proyectiles» abajo).
   *   k(pl, e, m, d, p)        × al daño de un golpe suyo (hit() o su proyectil p).
   *   crit(pl, e, m, p)        crítico de más: true (o ≥ 1) seguro; un número, probabilidad que suma.
   *   after(pl, e, m, d, crit) tras un golpe directo tuyo (hit(); no los raw).
   *   afterP(pl, e, m, p, d)   tras el golpe de un proyectil tuyo.
   *   ghostP(p, e)             el proyectil de un compañero choca (sin daño).
   *   orbit(pl, m, dt, now)    familia órbita: su propia órbita (true = no hace falta la de siempre).
   *   orb(pl, m, dt, orbs, g)  familia órbita: después de mover los orbes (g: los de un compañero).
   *   field(f, dt)             lo que añade a los campos de su familia.
   *   zone(pl, m, f)           familia aturdir: lo que hace la zona al caer (en vez de aturdir).
   *   puddle(f)                familia charcos: al caer el charco.
   *   block(pl, m, g)          familia escudo: al parar un golpe (g: el de un compañero, sólo se ve).
   *   allyTarget(f, pl)        familia aliados: el blanco de sus aliados.
   *   touch(pl, m, e)          un enemigo te ha tocado (con este ataque en cualquier hueco).
   *   hurt(pl, m)              te han golpeado (un enemigo; ya sin escudo que lo pare).
   * Estado propio de la instancia: m.st (stOf) o m.st3 (ST3); rebake los conserva.
   * m.castType: el tipo de este lanzamiento (Rayo Prisma); m.stellar: sin resistencias (Teraclúster).
   * Golpes de segunda (esquirlas, pulsos...): hit(..., m, RAW) o sub3(m) no vuelven a llamar a
   * los ganchos; asType(m, tipo) cambia el tipo y sí los llama.
   *
   * ---- estados de los enemigos (e.sts) ----
   *   stAdd(e, tipo, dur, v, o) → la entrada { t, n, ... } o null si no le afecta (la única
   *   entrada). stStack(e, tipo, n, max, dur, o) suma pilas. stHas / stGet / stN / stEnd,
   *   stCount (con quemadura, veneno y frenado), stExtend (Infortunio), isWet. inflict(pl, ...)
   *   es stAdd con las habilidades de quien lo pone (Potencia Bruta: ninguno; Dicha: +50 %).
   *   Tipos (v / o):
   *     control: os                  freeze (congelado: el siguiente golpe ×1,5 y lo rompe)
   *     sleep (un golpe de > 15 % de su vida lo despierta ×1,25)       para (o.spread: contagia)
   *     root (anclado: ataca sin moverse)  air (en el aire: o.h, o.glow, o.cx/cy/cr gira, o.tx/ty
   *       lo lleva, o.bub burbuja, o.fall { pl, m, dmg, r, ghost } daño al caer)   slide (lanzado)
   *     confuse (camina al azar; sus choques dañan a otros; la mitad no te toca)   control
   *     (marioneta: a por el enemigo más cercano)   charm (v [x, y] u o.goal: va allí)   infat
   *     (enamorado: no dispara ni te toca)   fear (v [x, y] u o.from: huye de allí; si no, de ti)
   *     lost (te ha perdido: o.px/py)   daze (de espaldas: no dispara ni embiste)   sink (en su
   *     arena: o.f)   wet (empapado: Eléctrico ×1,4, Fuego ×0,6 y lo seca, Hielo lo congela)
   *     slip (suelo helado)   mark / markX (o.by: señalado / siguiente golpe crítico)   curse
   *     vuln (v pilas, máx. 5, +8 % de daño)   sacred (+30 % de daño)   atkdown (v: −v de su
   *     ataque; jefes la mitad)   chill (v puntos; a 5 se congela)   mud (pilas, −12 % de
   *     velocidad cada una)   pins (agujas clavadas)   bpoison (veneno grave: crece ×1 → ×4 en
   *     6 s; v: daño base, si no un % de su vida)
   *   Jefes y legendarios: el control dura ×0,35 y air, control, fear y slide no les afectan;
   *   nadie vuelve a quedar inmóvil (freeze, sleep, root, air) hasta 1,2 s después (e.stFree).
   *   Lo que mueve o para la IA lo hace quien tiene los enemigos de verdad (Enemy.update,
   *   envuelto abajo). Cooperativo: en una copia de invitado se manda lo que ya entiende la red
   *   (inmovilizar y asustar → aturdir 't'; parálisis, frío, barro y confusión → frenar 's');
   *   empapado, vulnerable y señalados los nota quien los pone. Nada nuevo en la red.
   *
   * ---- campos y zonas ----
   *   addField({ owner, ghost, m, x, y, life, pad, tag, upd(f, dt) → true lo quita, dg(ctx, f,
   *   own, now) en el suelo, da(...) por encima, end(f) al acabar su vida }) (kind 'mx';
   *   mientras corre su upd, ghost = f.ghost). add3(pl, tag, o) lo mismo desde tu Pokémon.
   *   mxFind / mxLast / mxTrim(pl, tag, keep, id), later(...) (golpe diferido).
   *   zone(pl, m, o): zonas elementales (fire, lava, water, steam, ice, elec, grass, rainbow,
   *   sacred, whitehot) en círculo, línea o brazos, que reaccionan entre sí (fuego + hierba =
   *   incendio, fuego + agua = vapor, eléctrico + agua = agua electrificada...). Tope 24 por jugador.
   *
   * ---- proyectiles (projectile.js / resolve) ----
   *   upd3(p, dt) antes de moverse y upd(p, dt) después (true = se acaba), end(p) al acabar su
   *   vida, onHit(p, e, d, crit) al golpear (también el de un compañero, con d = 0; true = sigue
   *   vivo, lo ha resuelto él), onWall(p) (true = sigue), hitK(p, e) × al daño, noHit, still,
   *   drawFn(ctx, p, alpha), ds (escala del dibujo). Familias: f.flow y f.onStrike (columna),
   *   p.onBounce (carambola), f.tickFn (charco).
   *
   * ---- tu Pokémon (pl.u3) ----
   *   Escudo de Luz Lunar, monedas de Fiebre Dorada, forma Filo, niebla, Cuerpo Pesado, KO
   *   recientes, el siguiente golpe crítico de Maquinación (next), esquivas (dodgeK/dodgeT,
   *   teamT), Cambio de Marcha (gear), críticos del arcoíris (critK/critT)... P3(pl) lo crea.
   * ===================================================================================== */
  const MECH = Object.create(null);
  const TAU = 6.2832;
  const now = () => G.Game.st.time, T3 = now;
  const TCOL = t => G.U.TYPE_COLOR[t] || '#ffffff';
  const colOf = m => G.U.TYPE_COLOR[m.type];
  /** Enemigo de verdad (el anfitrión o tú solo): a éste sí se le mueve y se le cambia la IA. */
  const real = e => !!e && !e.dead && !e.remote;
  const big = e => !!(e && (e.boss || e.judge || e.legend));
  const free3 = e => real(e) && !big(e) && e.behavior !== 'thief';
  const wx = () => { const c = G.Weather && G.Weather.current; return c ? c.kind : null; };
  const stOf = m => m.st || (m.st = {});
  const ST3 = m => m.st3 || (m.st3 = {});
  const atk = (pl, m) => (m.dmg || 0) * pl.atkFor(m);
  const areaK = m => pkOf(m).area || 1;
  const RAW = Object.freeze({ raw: true });
  const inWater = e => !e.flying && G.World.isLiquid(e.x, e.y) && (!G.World.liquidKind || /water|swamp/.test(G.World.liquidKind()));
  const sees = (x, y, pad = 40) => G.Camera.sees(x, y, pad);
  const snd = (name, x, y, o) => { if (sees(x, y, 80)) G.Audio.sfx(name, o); };
  const trT = (s, x) => (G.I18n && G.I18n.f ? G.I18n.f(s, x) : s.replace('{x}', x));
  /** Tirada que sale igual en todos los ordenadores (del apuntado que viaja en 'c'); solo, al azar. */
  const roll = (pl, m, salt) => (G.Coop && G.Coop.active ? G.U.hash(Math.round(pl.aim * 100), (m.lvl | 0) * 31 + salt, 913) : Math.random());
  const PAL2 = k => G.VFX.PAL[k] || G.VFX.PAL.normal;

  // ---------------- campos (kind 'mx') ----------------
  function addField(o) {
    const f = Object.assign({ kind: 'mx', t: 0, ghost, pad: 80, x: 0, y: 0 }, o);
    fields.push(f);
    return f;
  }
  /** Un campo desde tu Pokémon (en su sitio, con su clase). */
  const add3 = (pl, tag, o) => addField(Object.assign({ owner: pl, tag, x: pl.x, y: pl.y }, o));
  const isMx = (f, pl, tag, id) => f.kind === 'mx' && f.tag === tag && f.owner === pl && !f.gone && (!id || (f.m && f.m.id === id));
  function mxFind(pl, tag, id) {
    for (const f of fields) if (isMx(f, pl, tag, id)) return f;
    return null;
  }
  /** El más nuevo de esa clase. */
  function mxLast(pl, tag, id) {
    for (let i = fields.length - 1; i >= 0; i--) if (isMx(fields[i], pl, tag, id)) return fields[i];
    return null;
  }
  /** Deja como mucho `keep` de esa clase y dueño (y movimiento, si id): se van los más viejos. */
  function mxTrim(pl, tag, keep, id) {
    let k = 0;
    for (let i = fields.length - 1; i >= 0; i--) if (isMx(fields[i], pl, tag, id) && ++k > keep) fields[i].gone = true;
  }
  /** Cada fotograma de un campo (con «ghost» el suyo: el de un compañero no daña). → true: se quita. */
  function mxUpd(f, dt) {
    if (!f.upd) return false;
    const g = ghost;
    ghost = !!f.ghost;
    try { return f.upd(f, dt) === true; } finally { ghost = g; }
  }
  function mxEnd(f) {
    const g = ghost;
    ghost = !!f.ghost;
    try { f.end(f); } finally { ghost = g; }
  }
  /** Golpe diferido: fn(f) a los t s. */
  function later(pl, m, t, x, y, fn, o) {
    return addField(Object.assign({ owner: pl, m, x, y, life: t + 0.5, tag: 'later',
      upd(f) { if (f.t >= t) { fn(f); return true; } return false; } }, o));
  }

  // ---------------- enemigos cerca ----------------
  /** ¿Se salta? skip: un Set de ids o un enemigo. */
  const skips = (skip, e) => !!skip && (skip.has ? skip.has(e.id) : skip === e);
  function nearestE(x, y, r, skip) {
    let best = null, bd = r * r;
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) {
      if (e.dead || skips(skip, e)) continue;
      const d = G.U.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** Los n más cercanos a (x, y) a menos de r (skip: un Set de ids o un enemigo). */
  function nearestN(x, y, r, n, skip) {
    const out = [];
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) if (!e.dead && !skips(skip, e)) out.push(e);
    out.sort((a, b) => G.U.dist2(x, y, a.x, a.y) - G.U.dist2(x, y, b.x, b.y));
    if (out.length > n) out.length = n;
    return out;
  }
  /** Enemigos de un círculo (sin crear golpes). */
  const inCircle = (x, y, r) => G.EnemyMgr.queryCircle(x, y, r).filter(e => !e.dead);
  /** Un enemigo al azar a menos de r de (x, y), sin crear listas. */
  function randomNear(x, y, r) {
    let pick = null, n = 0;
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) if (!e.dead && Math.random() * ++n < 1) pick = e;
    return pick;
  }
  /** Centro del grupo más denso a menos de r (muestrea como mucho 12): { x, y, n } o null. */
  function crowd(x, y, r) {
    const near = G.EnemyMgr.queryCircle(x, y, r);
    if (!near.length) return null;
    let best = near[0], bn = -1;
    const step = Math.max(1, Math.floor(near.length / 12));
    for (let i = 0; i < near.length; i += step) {
      const e = near[i];
      let n = 0;
      for (const o of near) if (G.U.dist2(e.x, e.y, o.x, o.y) < 3600) n++;
      if (n > bn) { bn = n; best = e; }
    }
    let sx = 0, sy = 0, c = 0;
    for (const o of near) if (G.U.dist2(best.x, best.y, o.x, o.y) < 3600) { sx += o.x; sy += o.y; c++; }
    return { x: sx / c, y: sy / c, n: c };
  }
  /** Un enemigo del grupo más grande cerca de ti (lo mira entre unos pocos al azar). */
  function group3(pl, R = 300) {
    let best = null, bn = -1, k = 0;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || Math.abs(e.x - pl.x) > R || Math.abs(e.y - pl.y) > R * 0.8) continue;
      if (++k > 24 && Math.random() < 0.6) continue;
      const n = G.EnemyMgr.queryCircle(e.x, e.y, 80).length + (e.boss || e.judge ? 3 : 0);
      if (n > bn) { bn = n; best = e; }
    }
    return best;
  }
  /** El blanco de pl a menos de r: el suyo si llega; si no, el más cercano a donde apunta. */
  function aimTarget(pl, r) {
    const t = pl.target;
    if (!ghost && t && !t.dead && t.hurt && G.U.dist2(pl.x, pl.y, t.x, t.y) <= r * r) return t;
    return nearestE(pl.x + Math.cos(pl.aim) * 40, pl.y + Math.sin(pl.aim) * 40, r);
  }
  /** ¿Mira hacia pl? 1 de cara, -1 de espaldas, 0 de lado o no se sabe. */
  function facing3(e, pl) {
    const a = e.anim;
    if (!a || a.dir == null) return 0;
    const fa = Math.PI / 2 - a.dir * Math.PI / 4, ta = Math.atan2(pl.y - e.y, pl.x - e.x);
    const d = Math.abs((((ta - fa) % 6.2832) + 9.4248) % 6.2832 - 3.1416);
    return d < 1.2 ? 1 : d > 1.95 ? -1 : 0;
  }

  // ---------------- golpes ----------------
  /**
   * Golpe en un círculo (y a los objetos). → cuántos. o (opcional): { col, knock, ho (opciones
   * de hit: type, raw...), ghost (no daña), skip (Set de ids: los ya golpeados se saltan y se
   * apuntan), filter(e) (falso: se salta), pre(e) (antes; false: se salta), each(e) (después) }.
   */
  function areaHit(pl, m, x, y, r, dmg, o) {
    if (ghost || (o && o.ghost) || !pl || pl.dead) return 0;
    const col = (o && o.col) || TCOL((o && o.ho && o.ho.type) || m.type), kn = (o && o.knock) || 0;
    const skip = o && o.skip, filter = o && o.filter, pre = o && o.pre, each = o && o.each, ho = o && o.ho;
    let n = 0;
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) {
      if (e.dead || (skip && skip.has(e.id)) || (filter && !filter(e)) || (pre && pre(e) === false)) continue;
      if (skip) skip.add(e.id);
      hit(pl, e, dmg, col, e.x - x, e.y - y, kn, m, ho);
      n++;
      if (each && !e.dead) each(e);
    }
    for (const p of G.World.propsInCircle(x, y, r)) G.World.damageProp(p, dmg, col);
    return n;
  }
  /** Enemigos en el tramo (x0, y0)-(x1, y1) de ancho w, ordenados del principio al final. */
  function onSeg(x0, y0, x1, y1, w) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0);
    const out = [];
    for (const e of G.EnemyMgr.queryCircle(mx, my, L / 2 + w)) {
      if (!e.dead && segDist2(x0, y0, x1, y1, e.x, e.y) <= (w / 2 + e.r) ** 2) out.push(e);
    }
    if (out.length > 1) out.sort((a, b) => G.U.dist2(x0, y0, a.x, a.y) - G.U.dist2(x0, y0, b.x, b.y));
    return out;
  }
  /** fn(e) a cada enemigo del tramo. */
  function segEach(x0, y0, x1, y1, w, fn) { for (const e of onSeg(x0, y0, x1, y1, w)) if (!e.dead) fn(e); }
  /** Daño a los objetos del tramo. */
  function segProps(x0, y0, x1, y1, w, dmg, col) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0);
    for (const p of G.World.propsInCircle(mx, my, L / 2 + w)) if (segDist2(x0, y0, x1, y1, p.x, p.y) <= (w / 2 + p.r) ** 2) G.World.damageProp(p, dmg, col);
  }
  /** Golpea a lo que hay en un tramo de ancho w (skip: Set de ids; kOf(e): × al daño; on(e): después). → cuántos */
  function hitSeg(pl, m, x0, y0, x1, y1, w, dmg, col, knock = 0, skip = null, kOf = null, on = null) {
    if (ghost || pl.dead) return 0;
    let n = 0;
    for (const e of onSeg(x0, y0, x1, y1, w)) {
      if (e.dead || (skip && skip.has(e.id))) continue;
      if (skip) skip.add(e.id);
      hit(pl, e, dmg * (kOf ? kOf(e) : 1), col, x1 - x0, y1 - y0, knock, m);
      if (on && !e.dead) on(e);
      n++;
    }
    segProps(x0, y0, x1, y1, w, dmg, col);
    return n;
  }
  /** Hasta dónde llega un rayo desde (x, y) en la dirección (ca, sa) antes de una pared. */
  function rayLen(x, y, ca, sa, max) {
    for (let d = 8; d < max; d += 8) if (G.World.isWall(x + ca * d, y + sa * d)) return d;
    return max;
  }
  /** Rayo recto (como beam) desde pl con ángulo a: se corta en la pared. → largo. */
  function ray3(pl, m, a, R, w, dmg, vis, each) {
    const col = TCOL(m.type), ca = Math.cos(a), sa = Math.sin(a), len = rayLen(pl.x, pl.y, ca, sa, R);
    G.FX.beam(pl.x, pl.y - G.LIFT, a, len, w, col, vis || G.VFX.forMove(m));
    if (ghost) return len;
    G.Camera.kick(0.08);
    segEach(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, w, e => { hit(pl, e, dmg, col, ca, sa, 0, m); if (each && !e.dead) each(e); });
    segProps(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, w, dmg, col);
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
  /** Daño tal cual (sin tipos, defensas ni crítico): cuenta como un golpe tuyo. */
  function pure3(pl, e, d, m, col) {
    if (!(d > 0) || e.dead) return;
    e.hurt(d, col, e.x - pl.x, e.y - pl.y, 0, null);
    pl.dmgDealt += d; m.dealt = (m.dealt || 0) + d;
    if (!ghost) pl.onDealt(d);
  }
  /** Un estado tuyo (con las habilidades: Potencia Bruta no pone ninguno; Dicha, más rato). */
  function inflict(pl, e, kind, dur, v, o) {
    const sk = statusK(pl);
    if (!sk || !e || e.dead) return null;
    return stAdd(e, kind, dur * (sk > 1 ? 1.5 : 1), v, o);
  }
  const chance = (pl, p) => { const sk = statusK(pl); return sk > 0 && Math.random() < p * sk; };
  /** Empujón sin daño (el de un invitado lo hace el anfitrión: un golpe de 1 con empuje). */
  function shoveE(pl, e, nx, ny, k, g) {
    if (big(e)) return;
    if (real(e)) { e.kx += nx * k; e.ky += ny * k; }
    else if (!g && e.remote && G.Coop.hit) G.Coop.hit(e, 1, '#ffffff', nx, ny, k);
  }
  /** Lleva a un enemigo de verdad a (x, y) si cabe (si no, cerca). */
  function tpEnemy(e, x, y) {
    if (!real(e)) return;
    for (let i = 0; i < 6; i++) {
      const tx = x + (i ? G.U.rand(-30, 30) : 0), ty = y + (i ? G.U.rand(-24, 24) : 0);
      if (e.flying || G.World.isFree(tx, ty, Math.min(12, e.r * 0.8), false)) { e.x = tx; e.y = ty; return; }
    }
  }
  /** Copia de m con otro tipo (Hueso Sombrío: fantasma); su daño se suma al del movimiento. */
  function asType(m, type) {
    const c = m._as || (m._as = Object.create(null));
    return c[type] || (c[type] = Object.create(m, { type: { value: type, writable: true } }));
  }
  function flushAs(m) { if (!m._as) return; for (const k in m._as) { const x = m._as[k]; if (x.dealt) { m.dealt = (m.dealt || 0) + x.dealt; x.dealt = 0; } } }
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

  // ---------------- proyectiles ----------------
  /** Un disparo de m hacia el ángulo a (null: quieto) con el aspecto y los efectos del ataque; o lo cambia. */
  function shoot(pl, m, a, o) {
    const sp = (o && o.speed) || m.speed || 300, ca = a == null ? 0 : Math.cos(a), sa = a == null ? 0 : Math.sin(a);
    return G.Projectiles.spawn(Object.assign({
      x: pl.x + ca * 3, y: pl.y + sa * 3, vx: ca * sp, vy: sa * sp,
      dmg: atk(pl, m), r: m.size || 6, life: m.life || 1.4, pierce: m.pierce | 0, color: TCOL(m.type), homing: 0,
      hits: new Set(), vis: G.VFX.forMove(m), ghost, owner: pl
    }, payload(m), o));
  }
  /** Un disparo quieto desde ti (lo que no diga o: 1 s, sin perforar, del tamaño del ataque). */
  const shot3 = (pl, m, o) => shoot(pl, m, null, Object.assign({ x: pl.x, y: pl.y, r: m.size || 7, life: 1, pierce: 0 }, o));
  /** Lanza con fn y marca con tag los proyectiles nuevos (ids crecientes: lo que fn quite no importa). */
  function tagged3(fn, tag) {
    const list = G.Projectiles.all(), last = list.length ? list[list.length - 1].id : 0;
    fn();
    for (let i = list.length - 1; i >= 0 && list[i].id > last; i--) tag(list[i]);
  }
  /** Gira la velocidad de p hacia (tx, ty) sin cambiar su rapidez. */
  function steerTo(p, tx, ty, rate, dt) {
    const sp = Math.hypot(p.vx, p.vy) || 1, [nx, ny] = G.U.norm(tx - p.x, ty - p.y);
    p.vx = G.U.damp(p.vx, nx * sp, rate, dt); p.vy = G.U.damp(p.vy, ny * sp, rate, dt);
    const s2 = Math.hypot(p.vx, p.vy) || 1;
    p.vx *= sp / s2; p.vy *= sp / s2;
  }
  const vis3 = Object.create(null);
  /** El aspecto de m con otra paleta (y otra forma): cacheado. */
  function visAs(m, pal, extra) {
    const k = m.id + '|' + pal + '|' + (extra ? (extra.proj || '') + (extra.beam || '') + (extra.trail || '') : '');
    return vis3[k] || (vis3[k] = Object.assign({}, G.VFX.forMove(m), extra || {}, { pal }));
  }

  // ---------------- tu Pokémon se mueve ----------------
  /** Invulnerable t s, con el tope de la embestida (60 % del tiempo desde la anterior). */
  function invul(pl, t) {
    const at = now(), gap = pl.dashAt == null ? 1 : at - pl.dashAt;
    pl.dashAt = at;
    pl.invuln = Math.max(pl.invuln || 0, Math.min(t, gap * 0.6));
  }
  /** Lo que puedes avanzar en (ca, sa) hasta max sin chocar. */
  function pathLen(pl, ca, sa, max) {
    let len = 0;
    for (let d = 8; d <= max; d += 8) {
      if (!G.World.isFree(pl.x + ca * d, pl.y + sa * d, (pl.wr || pl.r) * 0.8, true)) break;
      len = d;
    }
    return len;
  }
  /** Mueve al jugador hasta (x, y) a pasos, chocando con las paredes. */
  function movePl(pl, x, y) {
    const dx = x - pl.x, dy = y - pl.y, n = Math.min(40, Math.ceil(Math.hypot(dx, dy) / Math.max(3, (pl.wr || pl.r) * 0.5))) || 1;
    for (let k = 0; k < n; k++) { pl.x += dx / n; pl.y += dy / n; G.World.collide(pl); }
  }
  /** Copias de tu Pokémon que se apagan (imágenes residuales) en los puntos pts. */
  function afterimages(pl, pts, life, color) {
    if (!pl.anim || !pts.length) return;
    addField({ owner: pl, x: pts[0].x, y: pts[0].y, life, pad: 200, tag: 'ghostimg', pts, ghost: true,
      da(ctx, f, own) {
        const k = 1 - f.t / f.life;
        for (let i = 0; i < f.pts.length; i++) {
          const p = f.pts[i];
          pl.anim.draw(ctx, p.x, p.y, { alpha: own * k * (0.25 + 0.35 * i / f.pts.length), flash: true, softFlash: true, color });
        }
      } });
  }
  /** Lanza un ataque «manual» (Chispazo, Rayo Solar): animación, sonido, red e icono. */
  function fire(pl, m) {
    pl.cast(m);
    if (G.Coop.active) G.Coop.cast(pl, m);
    m.castAt = performance.now();
  }
  /** Lo de los buffs (pilas de un origen): { n, t } o null. */
  function buffSrc(pl, stat, id) {
    const b = pl.buffs && pl.buffs[stat];
    if (!b || !b.src) return null;
    for (const s of b.src) if (s.id === id) return s;
    return null;
  }
  const stacksOf = (pl, stat, id) => { const s = buffSrc(pl, stat, id); return s ? s.n : 0; };
  /** ¿Se ha movido pl desde el fotograma anterior? (lo guarda en st.px / st.py) */
  function moved(pl, st, min = 0.5) {
    const d = st.px == null ? 0 : Math.hypot(pl.x - st.px, pl.y - st.py);
    st.px = pl.x; st.py = pl.y;
    return d > min;
  }

  // ---------------- estados de los enemigos (e.sts) ----------------
  const ST_SET = new Set();
  const IMMO = { freeze: 1, sleep: 1, root: 1, air: 1 };
  const CTRL = { freeze: 1, sleep: 1, root: 1, air: 1, slide: 1, sink: 1, confuse: 1, charm: 1, infat: 1, fear: 1, control: 1, lost: 1, daze: 1 };
  const NO_BIG = { air: 1, control: 1, fear: 1, slide: 1 };
  /** Los que se llevan la IA (va a donde diga el estado, no a por ti). */
  const LEADS = ['air', 'slide', 'control', 'confuse', 'fear', 'charm', 'lost'];
  const STACK_MAX = { vuln: 5, mud: 4, pins: 9, chill: 5 };
  const WIND = new Set(['volley', 'nova', 'spiral', 'burst', 'waves', 'summon']);
  /** Pone (o alarga) un estado. → su entrada, o null si no le afecta. */
  function stAdd(e, kind, dur, v, o) {
    if (!e || e.dead || !(dur > 0)) return null;
    const isBig = big(e);
    if (CTRL[kind]) {
      if (e.behavior === 'thief' || e.behavior === 'stampede') return null;
      if (isBig) { if (NO_BIG[kind]) return null; dur *= 0.35; }
    }
    let s = e.sts;
    const had = s && s[kind];
    // Nadie vuelve a quedar inmóvil hasta 1,2 s después de soltarse.
    if (IMMO[kind] && !had && e.stFree > now()) return null;
    if (kind === 'freeze' && wx() === 'snow') dur *= 1.5;
    // Copias de un invitado: lo que entiende el anfitrión (y la entrada, para verlo y para quien pega).
    if (e.remote) {
      if (kind === 'freeze' || kind === 'sleep' || kind === 'air') e.applyStun(Math.min(dur, 1.2));
      else if (kind === 'root') e.applySlow(isBig ? 0.5 : 1, dur);
      else if (kind === 'confuse' || kind === 'para' || kind === 'chill' || kind === 'mud') e.applySlow(kind === 'para' ? (isBig ? 0.2 : 0.4) : 0.5, Math.min(dur, 2));
      else if ((kind === 'fear' || kind === 'charm' || kind === 'control') && !isBig) e.applyStun(Math.min(0.6, dur * 0.35));
      // (Veneno grave en una copia: sólo se ve; el daño lo pone el anfitrión al repetir el ataque del invitado.)
    }
    if (!s) s = e.sts = {};
    if (!ST_SET.has(e)) { ST_SET.add(e); e.stLx = e.x; e.stLy = e.y; }
    let x = s[kind];
    if (!x) x = s[kind] = { t: 0, n: 0 };
    switch (kind) {
      case 'vuln': case 'mud': case 'pins':
        x.n = Math.min((o && o.max) || STACK_MAX[kind], x.n + (v || 1));
        if (kind === 'mud') dur = Math.max(dur, 3);
        break;
      case 'chill':
        dur = Math.max(dur, 3);
        x.n += v || 1;
        if (x.n >= 5) {
          delete s.chill;
          if (isBig) e.applySlow(0.5, 1.2); else stAdd(e, 'freeze', 1.2);
          return null;
        }
        e.applySlow(Math.min(0.5, 0.1 * x.n), 1.6);
        break;
      case 'atkdown': {
        if (typeof e.dmg !== 'number') break;
        const k = Math.min(0.8, (v || 0.3) * (isBig ? 0.5 : 1));
        if (x.dmg0 == null) x.dmg0 = e.dmg;
        x.v = Math.max(x.t > 0 ? x.v || 0 : 0, k);
        e.dmg = x.dmg0 * (1 - x.v);
        break;
      }
      case 'para':
        if (!e.remote) e.applySlow(isBig ? 0.2 : 0.4, Math.min(1.2, dur));
        if (!(x.pt > 0)) x.pt = 0.5;
        if (o && o.spread) x.spread = 1;
        break;
      case 'freeze': case 'sleep':
        if (!e.remote) e.applyStun(dur);
        x.age = 0;
        break;
      case 'confuse':
        if (x.nt == null) x.nt = Math.random() < 0.5;          // la mitad de los confusos no te tocan
        break;
      case 'charm':
        if (Array.isArray(v)) x.goal = { x: v[0], y: v[1] };
        break;
      case 'fear':
        if (Array.isArray(v)) x.from = { x: v[0], y: v[1] };
        break;
      case 'control': x.o = null; break;
      case 'bpoison':
        if (!x.t) { x.age = 0; x.tick = 0.6; }
        if (v) x.v = Math.max(x.v || 0, v);
        break;
    }
    if (dur > x.t) x.t = dur;
    if (o) Object.assign(x, o);
    return x;
  }
  /** Suma pilas (vulnerable, barro, agujas...) hasta max. */
  function stStack(e, kind, add, max, dur, o) { return stAdd(e, kind, dur, add, Object.assign({ max }, o)); }
  const stGet = (e, k) => (e && e.sts && e.sts[k]) || null;
  const stHas = (e, k) => !!(e && e.sts && e.sts[k]);
  const stN = (e, k) => (e && e.sts && e.sts[k] ? e.sts[k].n | 0 : 0);
  function stEnd(e, k) { const s = e && e.sts; if (s && s[k]) { s[k].t = 0; stOver(e, s, k, s[k]); delete s[k]; } }
  /** Cuántos estados tiene (los de siempre y los nuevos; en una copia, los que manda el anfitrión). */
  function stCount(e) {
    const st = e.net ? e.net.st | 0 : 0;
    let n = (e.burn > 0 || st & 1 ? 1 : 0) + (e.poison > 0 || st & 2 ? 1 : 0) + (e.slow > 0 || st & 8 ? 1 : 0) + (e.stunT > 0 ? 1 : 0);
    const s = e.sts;
    if (s) for (const k in s) if (k !== 'freeze' && k !== 'sleep' && k !== 'mark' && k !== 'markX') n++;
    return n;
  }
  /** Alarga k s los estados que tenga (Infortunio). */
  function stExtend(e, k) {
    if (!e.remote) { if (e.burn > 0) e.burnT += k; if (e.poison > 0) e.poisonT += k; if (e.slowT > 0) e.slowT += k; }
    const s = e.sts;
    if (s) for (const key in s) s[key].t += k;
  }
  const isWet = e => stHas(e, 'wet') || inWater(e);
  /** ¿No te toca? (enamorado, encandilado, con miedo, marioneta, en el aire; confuso, la mitad) */
  function noTouch(e) {
    const s = e.sts;
    return !!(s.infat || s.charm || s.fear || s.control || s.air || (s.confuse && s.confuse.nt));
  }
  /** Lo que pasa al acabar un estado. */
  function stOver(e, s, k, x) {
    if (k === 'air') {
      e.jumpLift = 0; e.stFree = now() + 1.2;
      if (real(e) && !e.flying) G.World.collide(e);
      if (x.fall) stFall(e, x.fall);
    } else if (IMMO[k]) e.stFree = now() + 1.2;
    else if (k === 'atkdown' && x.dmg0 != null && typeof e.dmg === 'number') e.dmg = x.dmg0;
  }
  /** Cae de «en el aire»: daño alrededor (lo pone quien lo lanzó). */
  function stFall(e, f) {
    if (!f.pl) return;
    if (sees(e.x, e.y)) { G.FX.ring(e.x, e.y, 4, f.r, '#d9d2c4', 0.3, 3); G.FX.burst(e.x, e.y - 4, '#d9d2c4', 6, 100); }
    const g = ghost;
    ghost = !!f.ghost;
    try { areaHit(f.pl, f.m, e.x, e.y, f.r, f.dmg, { ho: RAW }); } finally { ghost = g; }
  }
  /** ¿Prepara un ataque? (apunta para embestir, mecha encendida, un jefe cargando disparos, a punto de disparar) */
  function prepping(e) {
    if (!e || e.dead || e.remote) return false;
    if (e.behavior === 'charger' && e.phase === 'aim') return true;
    if (e.behavior === 'bomber' && e.phase === 'fuse') return true;
    const c = e.ai && e.ai.cast;
    if (c && WIND.has(c.id) && c.t < c.wind) return true;
    return !e.boss && e.shotCd != null && e.shotCd < 0.4 && typeof e.keepsDistance === 'function' && e.keepsDistance();
  }
  /** Le corta lo que prepara (en una copia, un momento quieto). Un jefe, como mucho cada 4 s. */
  function interrupt(e) {
    if (!e || e.dead) return;
    if (e.remote) { e.applyStun(0.3); return; }
    if (e.behavior === 'charger' && (e.phase === 'aim' || e.phase === 'dash')) { e.phase = 'walk'; e.pt = 1.1; }
    if (e.behavior === 'bomber' && e.phase === 'fuse') { e.phase = 'walk'; e.pt = 1.2; e.flash = 0; }
    const c = e.ai && e.ai.cast;
    if (c && WIND.has(c.id) && c.t < c.wind) {
      if (!(e.intAt > now())) { e.intAt = now() + 4; e.ai.cast = null; e.ai.cd = Math.max(e.ai.cd || 0, 1.2); }
    } else if (e.ai && !e.ai.cast && e.ai.cd != null) e.ai.cd += 0.3;
    if (e.shotCd != null && !e.boss) e.shotCd = Math.max(e.shotCd, e.def && e.def.shotCd ? e.def.shotCd * 0.6 : 0.9);
    if (sees(e.x, e.y, 10)) G.FX.sp('impact', 'dark', e.x, e.y - (e.bodyH || 20) - 6, { life: 0.2, scale: 1 });
  }
  /** × al daño que recibe (vulnerable, Espada Santa): lo suma Enemy.hurt en los de verdad. */
  function stHurtK(e) {
    const s = e.sts;
    if (!s) return 1;
    return (s.vuln ? 1 + 0.08 * Math.min(5, s.vuln.n) : 1) * (s.sacred ? 1.3 : 1);
  }
  /** Un punto de mentira al que va la IA en vez de a ti (con lo que el enemigo lee del jugador). */
  function fakeAt(e, x, y, pl) {
    const f = e.uqFt || (e.uqFt = { x: 0, y: 0, r: 8, _vx: 0, _vy: 0, level: 1, dead: false });
    f.x = x; f.y = y; f.level = (pl && pl.level) || 1;
    return f;
  }
  /** Un enemigo le pega a otro (confusos y marionetas): con su fuerza, no la tuya. */
  function bump(e, o, k) {
    const d = (4 + e.dmg * 0.5 + e.maxHp * 0.04) * k * (big(o) ? 0.5 : 1);
    o.hurt(d, '#ff9fcf', o.x - e.x, o.y - e.y, 60, null);
    if (sees(o.x, o.y, 20)) G.FX.sp('impact', 'psychic', o.x, o.y - o.bodyH * 0.5, { life: 0.15, scale: 1 });
  }
  /** Cada fotograma: relojes, lo que hace cada estado mientras dura (parálisis, veneno grave...). */
  function stTick(dt) {
    if (!ST_SET.size) return;
    for (const e of ST_SET) {
      const s = e.sts;
      if (!s || e.dead) { if (s) stClear(e); ST_SET.delete(e); continue; }
      let any = false;
      for (const k in s) {
        const x = s[k];
        if ((x.t -= dt) > 0) { any = true; continue; }
        delete s[k];
        stOver(e, s, k, x);
      }
      if (!any) { e.sts = null; ST_SET.delete(e); continue; }
      const mine = !e.remote, isBig = big(e);
      if (s.para && (s.para.pt -= dt) <= 0) {
        s.para.pt = 1;
        if (mine) { e.applySlow(isBig ? 0.2 : 0.4, Math.min(1.1, s.para.t + 0.1)); if (!isBig && Math.random() < 0.3) e.applyStun(0.35); }
      }
      if (s.freeze) s.freeze.age += dt;
      if (s.bpoison && mine) {
        const b = s.bpoison;
        b.age += dt;
        if ((b.tick -= dt) <= 0) {
          b.tick = 0.6;
          const k = 1 + 3 * Math.min(1, b.age / 6);
          e.hurt(b.v ? b.v * k * (isBig ? 0.5 : 1) : e.maxHp * 0.006 * k * (isBig ? 0.25 : 1) + 1, '#9b3cc8');
          if (e.dead) continue;
        }
      }
      if (s.mud && mine) { e.slow = Math.max(e.slow, Math.min(0.6, 0.12 * s.mud.n)); e.slowT = Math.max(e.slowT, 0.15); }
      if (s.infat && mine) { if (e.shotCd != null && e.shotCd < 0.3) e.shotCd = 0.3; if (e.ai && !e.ai.cast && e.ai.cd < 0.3) e.ai.cd = 0.3; }
      if (s.para && s.para.spread && mine && (s.para.st = (s.para.st || 0) - dt) <= 0) {
        // Parálisis que se contagia una vez al primero que toque.
        s.para.st = 0.2;
        for (const o of G.EnemyMgr.queryCircle(e.x, e.y, e.r + 4)) {
          if (o === e || o.dead || stHas(o, 'para')) continue;
          stAdd(o, 'para', 2); s.para.spread = 0;
          if (sees(o.x, o.y)) G.FX.spark(o.x, o.y - o.bodyH * 0.5, '#ffe14d', e.x - o.x, e.y - o.y, 4);
          break;
        }
      }
      if (s.slip && mine && dt > 0 && !s.root && !LEADS.some(k => s[k])) {
        // Suelo helado: le cuesta girar y frenar (sigue con la velocidad que llevaba).
        const vx = (e.x - e.stLx) / dt, vy = (e.y - e.stLy) / dt, x = s.slip;
        x.vx = G.U.damp(x.vx == null ? vx : x.vx, vx, 2.2, dt); x.vy = G.U.damp(x.vy == null ? vy : x.vy, vy, 2.2, dt);
        const nx = e.stLx + x.vx * dt, ny = e.stLy + x.vy * dt;
        if (G.World.isFree(nx, ny, e.r * 0.7)) { e.x = nx; e.y = ny; }
      }
      e.stLx = e.x; e.stLy = e.y;
      if (sees(e.x, e.y)) {
        if (s.wet && Math.random() < dt * 5) G.FX.px(e.x + G.U.rand(-e.r, e.r) * 0.8, e.y - e.bodyH * G.U.rand(0.3, 0.9), '#8ccaff', { vy: 50, life: 0.3 });
        if (s.para && Math.random() < dt * 4) G.FX.px(e.x + G.U.rand(-e.r, e.r), e.y - e.bodyH * G.U.rand(0.2, 1), '#fff36a', { vx: G.U.rand(-40, 40), vy: G.U.rand(-40, 40), life: 0.12 });
        if (s.bpoison && Math.random() < dt * 9) G.FX.px(e.x + G.U.rand(-e.r, e.r), e.y - G.U.rand(2, e.bodyH), '#7a2aa8', { vy: -30, life: 0.4, size: 2 });
      }
    }
  }
  /** Quita sus estados (devuelve el ataque que le bajaron). */
  function stClear(e) {
    const s = e.sts;
    if (s && s.atkdown && s.atkdown.dmg0 != null && typeof e.dmg === 'number') e.dmg = s.atkdown.dmg0;
    e.sts = null;
  }

  /** Cada fotograma de un enemigo de verdad con estados que se llevan la IA (envuelve Enemy.update). */
  function stUpdate(e, dt, pl, U) {
    const s = e.sts;
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
    if (!(e.stunT > 0)) {
      if (s.control) {
        // Marioneta: a por el enemigo más cercano y le pega con lo suyo.
        const c = s.control;
        if (!c.o || c.o.dead || (c.look = (c.look || 0) - dt) <= 0) { c.o = nearestE(e.x, e.y, 320, e); c.look = 0.4; }
        if (c.o) {
          tg = fakeAt(e, c.o.x, c.o.y, pl);
          if ((c.cd = (c.cd || 0) - dt) <= 0 && G.U.dist2(e.x, e.y, c.o.x, c.o.y) < (e.r + c.o.r + 6) ** 2) { c.cd = 0.6; bump(e, c.o, 1.6); }
        } else tg = fakeAt(e, e.x + Math.cos(e.bob) * 60, e.y + Math.sin(e.bob) * 40, pl);
        e.touchCd = Math.max(e.touchCd, 0.1);
      } else if (s.confuse) {
        const c = s.confuse;
        if ((c.wt = (c.wt || 0) - dt) <= 0) { c.wt = 0.6; c.wa = Math.random() * TAU; }
        tg = fakeAt(e, e.x + Math.cos(c.wa) * 200, e.y + Math.sin(c.wa) * 200, pl);
        if ((c.cd = (c.cd || 0) - dt) <= 0) {
          c.cd = 0.5;
          const o = nearestE(e.x, e.y, e.r + 16, e);
          if (o && G.U.dist2(e.x, e.y, o.x, o.y) < (e.r + o.r + 4) ** 2) bump(e, o, 1);
        }
        if (c.nt) e.touchCd = Math.max(e.touchCd, 0.1);
      } else if (s.fear) {
        const f = s.fear.from || pl, [nx, ny] = G.U.norm(e.x - f.x, e.y - f.y);
        tg = fakeAt(e, e.x + nx * 300, e.y + ny * 300, pl);
      } else if (s.charm && s.charm.goal) {
        const g = s.charm.goal;
        tg = fakeAt(e, g.x, g.y, pl);
      } else if (s.lost) tg = fakeAt(e, s.lost.px, s.lost.py, pl);
    }
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

  /** Lo que se ve en el cuerpo (bloque de hielo, burbuja, raíces, hilos...): lo pinta Enemy.draw. */
  function stBody(ctx, e, s, t) {
    if (!G.Camera.sees(e.x, e.y, 30)) return;
    const lift = e.jumpLift || 0, top = e.y - lift - e.bodyH;
    ctx.save();
    if (s.freeze) {
      const w = e.r * 2.2, h = e.bodyH + 4;
      ctx.globalAlpha = 0.38; ctx.fillStyle = '#bff3ff';
      ctx.fillRect(Math.round(e.x - w / 2), Math.round(top - 2), Math.round(w), Math.round(h));
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.round(e.x - w / 2), Math.round(top - 2), Math.round(w), Math.round(h));
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(e.x - w / 2 + 3), Math.round(top + 1), 2, 6);
    } else if (s.chill) {
      ctx.globalAlpha = 0.07 * s.chill.n; ctx.fillStyle = '#bff3ff';
      ctx.beginPath(); ctx.ellipse(e.x, e.y - lift - e.bodyH * 0.5, e.r * 1.1, e.bodyH * 0.55, 0, 0, TAU); ctx.fill();
    }
    if (s.air) {
      if (s.air.bub) {
        const R = Math.max(e.r, e.bodyH * 0.55) + 5, cy = e.y - lift - e.bodyH * 0.5 + Math.sin(t * 6 + e.id) * 2;
        ctx.globalAlpha = 0.25; ctx.fillStyle = '#8ccaff';
        ctx.beginPath(); ctx.arc(e.x, cy, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.8; ctx.strokeStyle = '#eaf7ff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(e.x - R * 0.5), Math.round(cy - R * 0.55), 3, 3);
      } else if (s.air.glow) {
        // Levantado con la mente: contorno que tiembla alrededor del cuerpo.
        const cy = e.y - lift - e.bodyH * 0.5, j = Math.sin(t * 40 + e.id) * 1.2;
        ctx.globalAlpha = 0.75; ctx.strokeStyle = s.air.glow; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(e.x + j, cy, e.r * 1.25, e.bodyH * 0.65, 0, 0, TAU); ctx.stroke();
      }
    }
    if (s.control) {
      // Hilos de marioneta.
      ctx.globalAlpha = 0.7; ctx.fillStyle = '#ff9fcf';
      for (let i = -1; i <= 1; i++) ctx.fillRect(Math.round(e.x + i * 6), Math.round(top - 34), 1, 22 + Math.sin(t * 6 + i) * 2);
    }
    if (s.root) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#3d7a24'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + 0.4, x0 = e.x + Math.cos(a) * e.r, y0 = e.y + Math.sin(a) * e.r * 0.5;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(e.x + Math.cos(a) * e.r * 0.3, e.y - 8, e.x + Math.cos(a + 0.6) * 3, e.y - e.bodyH * 0.35); ctx.stroke();
      }
    }
    if (s.sink) {
      ctx.globalAlpha = 0.75; ctx.fillStyle = '#c9a45c';
      for (let i = -2; i <= 2; i++) ctx.fillRect(Math.round(e.x + i * e.r * 0.4), Math.round(e.y - 4 - Math.abs(i)), 2, 6);
    }
    if (s.mud) {
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#5a3a18';
      for (let i = 0; i < Math.min(4, s.mud.n); i++) ctx.fillRect(Math.round(e.x - e.r * 0.8 + i * e.r * 0.5), Math.round(e.y - 3 - (i % 2) * e.bodyH * 0.3), 3, 3);
    }
    ctx.restore();
    if (s.pins) {
      // Agujas clavadas (Pin Misil).
      for (let i = 0; i < Math.min(5, s.pins.n); i++) {
        const a = i * 1.26 + 0.4;
        G.VFX.draw(ctx, 'needle', 'bug', e.x + Math.cos(a) * e.r * 0.8, e.y - lift - e.bodyH * 0.5 + Math.sin(a) * e.bodyH * 0.35, { angle: a + Math.PI, scale: 0.7 });
      }
    }
  }
  // Iconos encima de la cabeza, por orden (como mucho 2; con muchos enemigos tocados, 1).
  const ST_ICON = [
    ['sleep', null, null], ['control', 'heart', 'psychic'], ['confuse', 'st-spiral', 'psychic'], ['charm', 'heart', 'fairy'],
    ['infat', 'heart', 'fighting'], ['fear', 'drop', 'water'], ['para', 'bolt', 'electric'], ['markX', 'st-x', 'bug'], ['mark', 'st-diamond', 'grass'],
    ['vuln', 'shield', 'steel'], ['atkdown', 'arrow', 'fighting'], ['curse', 'shadow', 'umbra'], ['lost', 'puff', 'mist'], ['daze', 'wind', 'flying'],
    ['bpoison', 'bubble', 'poison'], ['wet', 'drop', 'water']
  ];
  const ST_FONT = '700 8px Fredoka,"Segoe UI",system-ui,sans-serif';
  function stIcons(ctx, own, t) {
    if (!ST_SET.size) return;
    const maxN = ST_SET.size > 12 ? 1 : 2;
    ctx.save();
    ctx.globalAlpha = own * (maxN > 1 ? 1 : 0.8);
    for (const e of ST_SET) {
      const s = e.sts;
      if (!s || e.dead || !G.Camera.sees(e.x, e.y, 30)) continue;
      const top = e.y - (e.jumpLift || 0) - e.bodyH;
      let n = 0;
      for (const [k, shape, pal] of ST_ICON) {
        if (n >= maxN) break;
        const v = s[k];
        if (!v) continue;
        const x = e.x - 6 + n * 12, y = top - 8 + Math.sin(t * 5 + e.id + n) * 1.5;
        if (k === 'sleep') {
          ctx.font = ST_FONT; ctx.textAlign = 'center'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(10,8,24,.85)'; ctx.fillStyle = '#d4c4ff';
          const yy = y - ((t * 10 + e.id) % 6);
          G.I18n.rawCanvas(ctx, 'strokeText', 'Zz', x, yy); G.I18n.rawCanvas(ctx, 'fillText', 'Zz', x, yy);
        } else {
          G.VFX.draw(ctx, shape, pal, x, y, { scale: k === 'curse' ? 0.6 : 1, angle: k === 'atkdown' ? Math.PI : k === 'fear' ? -Math.PI / 2 : k === 'daze' ? t * 6 : 0,
                                             frame: Math.floor(t * 8) });
          if ((k === 'vuln' || k === 'pins') && v.n > 1) {
            ctx.font = ST_FONT; ctx.textAlign = 'center'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(10,8,24,.85)'; ctx.fillStyle = '#ffffff';
            G.I18n.rawCanvas(ctx, 'strokeText', String(v.n), x + 5, y + 5); G.I18n.rawCanvas(ctx, 'fillText', String(v.n), x + 5, y + 5);
          }
        }
        n++;
      }
    }
    ctx.restore();
  }

  // Envolturas de Enemy (sólo en el juego: la herramienta de equilibrio no tiene G.Enemy ni G.Player).
  if (G.Enemy && G.Enemy.prototype && !G.Enemy.prototype.stWrapped) {
    const P = G.Enemy.prototype, U0 = P.update, N0 = P.netUpdate, H0 = P.hurt, D0 = P.draw;
    P.stWrapped = true;
    P.update = function (dt, pl) {
      const s = this.sts;
      if (!s || this.dead) return U0.call(this, dt, pl);
      return stUpdate(this, dt, pl, U0);
    };
    P.netUpdate = function (dt) {
      N0.call(this, dt);
      const a = this.sts && this.sts.air;
      if (a) { a.k = (a.k || 0) + dt; this.jumpLift = (a.h || 26) * Math.min(1, a.k / 0.15); }
    };
    P.hurt = function (amount, color, dirX, dirY, knock, eff) {
      if (this.sts && !this.remote) amount *= stHurtK(this);
      return H0.call(this, amount, color, dirX, dirY, knock, eff);
    };
    P.draw = function (ctx) {
      const s = this.sts;
      if (!s || this.dead) return D0.call(this, ctx);
      if (s.sink && s.sink.d > 0) {
        // Hundiéndose: se recorta lo que queda bajo la arena.
        ctx.save(); ctx.beginPath(); ctx.rect(this.x - 200, this.y - 400, 400, 400 - s.sink.d + 2); ctx.clip();
        ctx.translate(0, s.sink.d * 0.8);
        D0.call(this, ctx);
        ctx.restore();
      } else D0.call(this, ctx);
      stBody(ctx, this, s, performance.now() / 1000);
    };
  }

  // ---------------- tu Pokémon (pl.u3) ----------------
  function P3(pl) {
    return pl.u3 || (pl.u3 = { shield: 0, crit: [], filo: 0, hide: 0, kos: [], koT: 0, gems: 0, px: pl.x, py: pl.y, v: 0, still: 0,
                               shade: 0, shadeR: 0, mist: 0, mx: 0, my: 0, mr: 0, anchor: 0, gyro: null });
  }
  const pxOf = P3;
  let crit3f = false;          // crítico seguro en el golpe que se está dando (vuelta de Garra Metal, Garra Umbría)
  let incoming3 = 0;           // golpe que te va a llegar (lo gasta el escudo de Luz Lunar)
  let walls3 = [];             // piedras, rocas de las tumbas y portales: paran (o se tragan) los disparos enemigos
  let tw3 = [];                // tornados de Dracoenergía vivos (se cruzan y estallan)
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
      if (sees(p.x, p.y, 10)) G.FX.sp('shadow', 'umbra', p.x, p.y - G.LIFT, { life: 0.25 });
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
    e.applyStun(0.3 * (e.boss || e.judge ? 0.35 : 1));
    hit(pl, e, m.dmg * pl.atkFor(m), G.U.TYPE_COLOR.steel, e.x - pl.x, e.y - pl.y, e.boss || e.judge ? 0 : 260, m);
    if (sees(pl.x, pl.y)) { G.FX.ring(pl.x, pl.y, pl.r, pl.r * 2.4, '#cad6e2', 0.25, 3); G.Audio.sfx('shake'); }
  }
  /** Lo tuyo que se dibuja encima: el escudo de Luz Lunar, las grietas de Cuerpo Pesado, Maquinación lista... */
  function drawPl3(ctx, now) {
    const me = G.Game.player, u = me && me.u3;
    if (!u || me.dead || G.Game.state === 'ui') return;
    if (u.shield > 0.5) {
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.min(0.25, u.shield / (me.maxHp || 100)) + Math.sin(now * 4) * 0.05;
      ctx.strokeStyle = '#efe6ff'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(232,220,255,.12)';
      ctx.beginPath(); ctx.ellipse(me.x, me.y - me.bodyH * 0.45, me.r * 1.5, me.bodyH * 0.7, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (u.anchor > 0) {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + 0.5;
        G.VFX.draw(ctx, 'crack', 'steel', me.x + Math.cos(a) * me.r * 1.3, me.y + Math.sin(a) * me.r * 0.5, { angle: a, alpha: 0.8 });
      }
    }
    if (u.filo > 0 && Math.random() < 0.3) G.FX.px(me.x + G.U.rand(-me.r, me.r), me.y - G.U.rand(0, me.bodyH), '#9e8aea', { vy: -40, life: 0.4 });
    if (u.next) G.VFX.draw(ctx, 'st-diamond', 'psychic', me.x, me.y - me.bodyH - 12 + Math.sin(now * 5) * 1.5, { scale: 1 });
  }

  /**
   * Jugador (Psíquico, Veneno...): encerrado en el Búnker (quieto), licuado (Armadura Ácida: el doble
   * de rápido), en el aire (saltos: se le ve subido, pl.uqLift) y el blanco a los señalados (Rayo Señal).
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
      if (e.dead || !stHas(e, 'mark')) { MARKED.delete(e); continue; }
      const d = G.U.dist2(pl.x, pl.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { pl.target = best; pl.aim = Math.atan2(best.y - pl.y, best.x - pl.x); }
  }

  // ---------------- historial de tipos y apoyo al grupo ----------------
  let TYPE_AT = Object.create(null);
  /** ¿Ha golpeado (o lanzado un compañero) un ataque de ese tipo hace menos de s segundos? */
  const recentType = (type, s) => (TYPE_AT[type] || -99) > now() - s;
  function mxSeen(pl, m) {
    TYPE_AT[m.type] = now();
    if (PLEDGES.length && (m.type === 'grass' || m.type === 'water')) pledgeNear(pl.x, pl.y, 150, m.type);
  }

  // ---------------- zonas elementales ----------------
  const ZCAP = 24;
  const ELEM_PAL = { fire: 'fire', lava: 'lava', water: 'water', steam: 'steam', ice: 'ice', elec: 'electric', elecwater: 'electric',
                     grass: 'grass', rainbow: 'rainbow', sacred: 'sacred', whitehot: 'whitehot' };
  const ELEM_TYPE = { fire: 'fire', lava: 'fire', sacred: 'fire', whitehot: 'fire', water: 'water', steam: 'water', ice: 'ice',
                      elec: 'electric', elecwater: 'electric', grass: 'grass', rainbow: 'normal' };
  const HOT = { fire: 1, lava: 1, sacred: 1, whitehot: 1 };
  function zone(pl, m, o) {
    const f = addField(Object.assign({ owner: pl, m, tag: 'zone', zone: true, elem: 'fire', r: 30, life: 2, every: 0.33, tk: 0.02, dmg: 0 }, o));
    if (f.shape === 'line') { f.x = (f.x1 + f.x2) / 2; f.y = (f.y1 + f.y2) / 2; f.w = f.w || 20; }
    zoneSet(f, f.elem);
    f.pad = zoneR(f) + 30;
    f.upd = zoneUpd; if (!f.dg) f.dg = zoneDraw;
    f.seed = Math.random() * 100;
    let n = 0;
    for (let i = fields.length - 1; i >= 0; i--) { const z = fields[i]; if (z.zone && z.owner === pl && !z.gone && ++n > ZCAP) z.gone = true; }
    zoneReact(f);
    if (!f.ghost && HOT[f.elem]) burnGrass(f);
    return f;
  }
  function zoneSet(f, elem) {
    f.elem = elem;
    f.type = ELEM_TYPE[elem] || f.m.type;
    f.pal = ELEM_PAL[elem] || f.m.type;
    f.col = TCOL(f.type);
    f.ho = null;
  }
  function zoneR(f) {
    if (f.shape === 'line') return Math.hypot(f.x2 - f.x1, f.y2 - f.y1) / 2 + f.w;
    if (f.shape === 'arms') return f.len + f.w;
    return f.r;
  }
  function zoneHas(f, x, y, rr) {
    if (f.shape === 'line') return segDist2(f.x1, f.y1, f.x2, f.y2, x, y) <= (f.w / 2 + rr) ** 2;
    if (f.shape === 'arms') {
      for (const a of f.arms) if (segDist2(f.x, f.y, f.x + Math.cos(a) * f.len, f.y + Math.sin(a) * f.len * 0.8, x, y) <= (f.w / 2 + rr) ** 2) return true;
      return false;
    }
    return G.U.dist2(f.x, f.y, x, y) <= (f.r + rr) ** 2;
  }
  function zoneUpd(f, dt) {
    const pl = f.owner;
    if (f.follow) { if (f.follow.dead) return true; f.x = f.follow.x; f.y = f.follow.y; }
    if (f.grow) f.r = f.grow[0] + (f.grow[1] - f.grow[0]) * Math.min(1, f.t / f.grow[2]);
    if ((f.tk -= dt) <= 0) {
      f.tk += f.every;
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, zoneR(f))) {
        if (e.dead || !zoneHas(f, e.x, e.y, e.r)) continue;
        if (f.each && f.each(f, e) === false) continue;
        if (f.ghost) continue;                        // (el daño y los estados, el dueño)
        if (f.dmg > 0) hit(pl, e, f.dmg, f.col, e.x - f.x, e.y - f.y, 0, f.m, f.ho || (f.ho = { raw: true, type: f.type, burn: f.burn || 0, slow: f.slow || 0 }));
        else { if (f.slow) e.applySlow(f.slow, f.every + 0.3); if (f.burn) e.applyBurn(f.burn); }
        if (f.st && !e.dead) stAdd(e, f.st[0], f.st[1], f.st[2]);
      }
    }
    if (f.tickFn && f.tickFn(f, dt) === true) return true;
    if (Math.random() < dt * (f.fx || 6) && sees(f.x, f.y, f.pad)) zoneSpark(f);
    return false;
  }
  /** Un punto al azar dentro de la zona. */
  function zonePoint(f) {
    if (f.shape === 'line') { const k = Math.random(); return [f.x1 + (f.x2 - f.x1) * k + G.U.rand(-f.w, f.w) * 0.3, f.y1 + (f.y2 - f.y1) * k]; }
    if (f.shape === 'arms') { const a = f.arms[Math.floor(Math.random() * f.arms.length)], d = Math.random() * f.len; return [f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.8]; }
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * f.r;
    return [f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.62];
  }
  const ZONE_SP = { fire: 'fire', lava: 'fire', sacred: 'fire', whitehot: 'fire', water: 'drop', steam: 'vapor', ice: 'star', elec: 'bolt',
                    elecwater: 'bolt', grass: 'leaf', rainbow: 'star' };
  function zoneSpark(f) {
    const [x, y] = zonePoint(f), shape = ZONE_SP[f.elem] || 'star';
    const up = shape === 'fire' ? -Math.PI / 2 : 0;
    G.FX.sp(shape, f.pal, x, y - 3, { vy: shape === 'drop' ? 20 : -30, life: 0.45, angle: up, scale: shape === 'vapor' ? 1 : 0.9 });
  }
  function zoneDraw(ctx, f, own, t) {
    const a = Math.min(1, (f.life - f.t) * 3, f.t * 8) * own * (f.alpha || 1);
    if (a <= 0) return;
    const P = G.VFX.PAL[f.pal] || G.VFX.PAL.normal;
    const pulse = 0.85 + 0.15 * Math.sin(t * 7 + f.seed);
    ctx.globalAlpha = (f.elem === 'steam' ? 0.22 : 0.3) * a * pulse;
    ctx.fillStyle = P[2]; ctx.strokeStyle = P[2];
    if (f.shape === 'line' || f.shape === 'arms') {
      ctx.lineCap = 'round'; ctx.lineWidth = f.w;
      ctx.beginPath();
      if (f.shape === 'line') { ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); }
      else for (const ang of f.arms) { ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(ang) * f.len, f.y + Math.sin(ang) * f.len * 0.8); }
      ctx.stroke();
      ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = P[3]; ctx.lineWidth = Math.max(2, f.w * 0.3);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = P[3]; ctx.lineWidth = 1.5;
      if (f.elem === 'rainbow') {
        const R = G.VFX.PAL, cols = ['fire', 'electric', 'grass', 'water', 'psychic'];
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = R[cols[(i + Math.floor(t * 4)) % 5]][3];
          const rr = f.r * (0.45 + i * 0.12);
          ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.62, 0, Math.PI, TAU); ctx.stroke();
        }
      } else {
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, TAU); ctx.stroke();
      }
      if (f.elem === 'elecwater' || f.elem === 'elec') {
        ctx.strokeStyle = P[4]; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7 * a;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a0 = G.U.hash(i, Math.floor(t * 12), f.seed | 0) * TAU;
          let x = f.x, y = f.y; ctx.moveTo(x, y);
          for (let k = 1; k <= 3; k++) { x = f.x + Math.cos(a0 + k * 0.3) * f.r * k / 3; y = f.y + Math.sin(a0 - k * 0.3) * f.r * 0.62 * k / 3; ctx.lineTo(x, y); }
        }
        ctx.stroke();
      }
    }
  }
  /** Reacciones al crear una zona encima de otra. */
  function zoneReact(f) {
    const hot = !!HOT[f.elem];
    for (const z of fields) {
      if (!z.zone || z === f || z.gone || (z.life && z.t >= z.life)) continue;
      const R = zoneR(z) + zoneR(f);
      if (G.U.dist2(z.x, z.y, f.x, f.y) > R * R) continue;
      const b = z.elem;
      if (hot && b === 'grass') {
        // Incendio: la hierba pasa a fuego, crece y quema más.
        zoneSet(z, 'fire'); z.r *= 1.2; z.dmg = Math.max(z.dmg, f.dmg) * 1.5; z.burn = 1; z.life = z.t + 2.2; z.fx = 14;
        if (sees(z.x, z.y)) { G.FX.burst(z.x, z.y - 6, '#ff9a3c', 10, 140); G.Audio.sfx('break'); }
      } else if (hot && (b === 'water' || b === 'steam')) {
        // Vapor: se apagan las dos y queda una nube que confunde un momento.
        z.gone = true; f.gone = true;
        zone(z.owner, z.m, { elem: 'steam', x: z.x, y: z.y, r: Math.max(z.r || 30, 30), life: 2, every: 0.5, st: ['confuse', 0.8], ghost: z.ghost });
        return;
      } else if (hot && b === 'ice') {
        zoneSet(z, 'water'); z.st = ['wet', 3]; z.slow = 0; z.life = z.t + 2;
      } else if (f.elem === 'elec' && (b === 'water' || b === 'steam')) {
        zoneSet(z, 'elecwater'); z.st = ['para', 1.5]; z.dmg = Math.max(z.dmg, f.dmg * 0.5); z.life = z.t + 2;
      } else if (f.elem === 'ice' && b === 'water') {
        zoneSet(z, 'ice'); z.st = ['chill', 0.1, 1]; z.life = z.t + 2.5;
      } else if (f.elem === 'water' && (b === 'fire' || b === 'lava')) {
        z.gone = true;
        zone(z.owner, z.m, { elem: 'steam', x: z.x, y: z.y, r: Math.max(z.r || 30, 30), life: 2, every: 0.5, st: ['confuse', 0.8], ghost: z.ghost });
      }
    }
  }
  /** El fuego quema la hierba alta del mapa: se rompe y deja una llama. */
  function burnGrass(f) {
    let n = 0;
    for (const p of G.World.propsInCircle(f.x, f.y, zoneR(f))) {
      if (p.type !== 'grass' || n++ > 3) continue;
      G.World.damageProp(p, 9999, '#ff7a2e');
      zone(f.owner, f.m, { elem: 'fire', x: p.x, y: p.y, r: 14, life: 1.4, every: 0.4, dmg: f.dmg * 0.5 || atk(f.owner, f.m) * 0.2, burn: 1, ghost: f.ghost });
    }
  }
  // Voto Fuego: sus mares reaccionan con los ataques de Planta y Agua que caen encima (ver Fuego).
  const PLEDGES = [];
  function pledgeNear(x, y, r, type) {
    for (let i = PLEDGES.length - 1; i >= 0; i--) {
      const f = PLEDGES[i];
      if (f.gone || f.t >= f.life) { PLEDGES.splice(i, 1); continue; }
      if (f.react || G.U.dist2(f.x, f.y, x, y) > (f.r + r) ** 2) continue;
      pledgeReact(f, type);
    }
  }
  const pledgeAt = (x, y, type) => pledgeNear(x, y, 0, type);

  // ---------------- enemigos lanzados (bolos) ----------------
  const TOSSED = [];
  function toss(e, vx, vy, t, o) {
    if (!real(e) || big(e)) return false;
    for (const q of TOSSED) if (q.e === e) { q.vx = vx; q.vy = vy; q.t = Math.max(q.t, t); return true; }
    if (TOSSED.length >= 12) return false;
    TOSSED.push(Object.assign({ e, vx, vy, t, t0: t, k: 0.5, chain: 0, hit: new Set([e.id]) }, o));
    return true;
  }
  function tossTick(dt) {
    for (let i = TOSSED.length - 1; i >= 0; i--) {
      const q = TOSSED[i], e = q.e;
      if (e.dead || (q.t -= dt) <= 0) { TOSSED.splice(i, 1); continue; }
      const nx = e.x + q.vx * dt, ny = e.y + q.vy * dt;
      if (!e.flying && !G.World.isFree(nx, ny, e.r * 0.7)) {
        if (q.boom) tossBoom(q, e.x, e.y);
        TOSSED.splice(i, 1); continue;
      }
      e.x = nx; e.y = ny; e.kx = 0; e.ky = 0;
      const k = Math.pow(0.12, dt); q.vx *= k; q.vy *= k;
      if (sees(e.x, e.y, 10) && Math.random() < dt * 25) {
        G.FX.sp('streak', 'normal', e.x - q.vx * 0.04, e.y - e.bodyH * 0.5, { life: 0.16, angle: Math.atan2(q.vy, q.vx) });
      }
      let done = false;
      for (const b of G.EnemyMgr.queryCircle(e.x, e.y, e.r + 2)) {
        if (b === e || b.dead || q.hit.has(b.id)) continue;
        q.hit.add(b.id);
        tossDeal(q, b);
        if (q.boom) { tossBoom(q, b.x, b.y); done = true; break; }
        if (q.chain > 0) toss(b, q.vx * 0.85, q.vy * 0.85, q.t0 * 0.85, { pl: q.pl, m: q.m, dmg: q.dmg, k: q.k, chain: q.chain - 1, ghost: q.ghost, hit: new Set([b.id, e.id]) });
      }
      if (done) TOSSED.splice(i, 1);
    }
  }
  function tossDeal(q, b) {
    const d = q.dmg * q.k, col = TCOL(q.m.type);
    if (!q.ghost) hit(q.pl, b, d, col, q.vx, q.vy, 40, q.m, RAW);
    else b.hurt(d * typeK(q.m.type, b), col, q.vx, q.vy, 40);
    if (sees(b.x, b.y)) { G.FX.sp('impact', 'normal', b.x, b.y - b.bodyH * 0.5, { life: 0.15, scale: 1 }); G.Audio.sfx('hit'); }
  }
  function tossBoom(q, x, y) {
    const r = q.boom.r * areaK(q.m);
    if (sees(x, y)) { G.FX.ring(x, y, 4, r, '#c9a26a', 0.3, 3); G.FX.burst(x, y - 4, '#a07a4a', 10, 140); G.Audio.sfx('thud'); }
    if (!q.ghost) areaHit(q.pl, q.m, x, y, r, q.dmg * q.boom.k, { knock: 60, ho: RAW });
    else for (const b of G.EnemyMgr.queryCircle(x, y, r)) if (real(b)) b.hurt(q.dmg * q.boom.k * typeK(q.m.type, b), '#c9a26a', b.x - x, b.y - y, 60);
  }

  // ---------------- lo que lee el combate de siempre (hit, resolve, wardBlock) ----------------
  const HIT = { burned: false, burnN: 0, wet: false };
  /**
   * × al daño de un golpe de m (o de su proyectil p) a e: estados del enemigo, tus ventajas y M.k
   * (M = null: sin ganchos, los raw). base: el daño ya con los tipos (para despertar al dormido).
   */
  function hitPre(pl, e, m, p, base, type, M) {
    let k = 1;
    const s = e.sts;
    HIT.burned = e.burn > 0 || !!(e.net && e.net.st & 1);
    HIT.burnN = e.burn || (HIT.burned ? 2 : 0);
    HIT.wet = false;
    if (s) {
      // (Vulnerable y Espada Santa: en los de verdad los suma Enemy.hurt; aquí, en las copias.)
      if (e.remote) k *= stHurtK(e);
      if (s.wet) {
        HIT.wet = true;
        if (type === 'electric') k *= 1.4;
        else if (type === 'fire') { k *= 0.6; delete s.wet; }
      }
      if (s.freeze && s.freeze.age > 0.25) {
        k *= 1.5; stEnd(e, 'freeze');
        if (real(e)) e.stunT = 0;
        if (sees(e.x, e.y)) { G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#d8f6ff', 8, 130); G.Audio.sfx('shake'); }
      }
      if (s.sleep && base * k > 0.15 * (e.maxHp || 1e12)) {
        k *= 1.25; stEnd(e, 'sleep');
        if (real(e) && e.stunT > 0) e.stunT = 0;
        if (sees(e.x, e.y, 10)) G.FX.dmgText(e.x, e.y - (e.bodyH || 20) - 16, '¡Despierta!', '#d4c4ff');
      }
    }
    if (!HIT.wet && type === 'electric' && inWater(e)) { k *= 1.3; HIT.wet = true; }   // metido en el agua del mapa
    const u = pl.u3;
    if (u) {
      if (u.gear > now()) k *= gearK(pl);
      const ef = u.efield;
      if (ef && type === 'electric' && !ef.gone && ef.t < ef.life && G.U.dist2(e.x, e.y, ef.x, ef.y) < ef.r * ef.r) k *= 1.3;
    }
    if (M && M.k) k *= M.k(pl, e, m, base * k, p) || 1;
    return k;
  }
  /** Después de un golpe: historial de tipos, Hielo sobre empapado, Voto Fuego. */
  function hitPost(pl, e, m, p, type) {
    type = type || m.castType || m.type;
    TYPE_AT[type] = now();
    if (type === 'ice' && HIT.wet && stHas(e, 'wet') && !e.dead && statusK(pl)) stAdd(e, 'freeze', 0.9);
    if (PLEDGES.length && (type === 'grass' || type === 'water')) pledgeAt(e.x, e.y, type);
  }
  /**
   * ¿Golpe crítico? La Mejora y las cartas (pl.critChance), las monedas de Fiebre Dorada, el
   * arcoíris, crit2 del ataque o del proyectil y M.crit; seguro: crit3f, Maquinación (u3.next), la
   * Marca X de quien pega, el cruce de Veneno X.
   */
  function critOf(pl, e, m, p, M) {
    if (ghost) return false;
    if (crit3f) return true;
    const u = pl.u3;
    if (u && u.next && m && m.cat === u.next) {
      u.next = null;
      if (sees(pl.x, pl.y)) G.FX.ring(pl.x, pl.y - pl.bodyH, 2, 18, '#c47bff', 0.3, 2);
      return true;
    }
    const mx = e.sts && e.sts.markX;
    if (mx && (!mx.by || mx.by === pl)) {
      delete e.sts.markX;
      G.FX.ring(e.x, e.y - e.bodyH * 0.5, 4, e.r * 2.4, '#b8ff5a', 0.25, 3);
      return true;
    }
    if (p && p.cx != null && G.U.dist2(e.x, e.y, p.cx, p.cy) < (24 + e.r) ** 2) return true;
    let c = (pl.critChance || 0) + ((m && m.crit2) || 0) + ((p && p.crit2) || 0);
    if (u) c += u.crit.length * 0.02 + (u.critT > now() ? u.critK || 0 : 0);
    if (M && M.crit) { const x = M.crit(pl, e, m, p); if (x === true || x >= 1) return true; c += x || 0; }
    return c > 0 && Math.random() < c;
  }
  /** Cambio de Marcha: +1 % de daño por cada 2 % de velocidad de más (hasta +40 %). */
  function gearK(pl) {
    const b = pl.baseSpd || 0;
    if (!b) return 1;
    return 1 + Math.min(0.4, Math.max(0, pl.spd / b - 1) / 2);
  }
  /** Agilidad al máximo y Doble Equipo: a veces esquivas (Player.hurt → wardBlock). */
  function mxDodge(pl) {
    const u = pl.u3;
    if (!u) return false;
    const T = now();
    let k = 0;
    if (u.dodgeT > T) k = u.dodgeK || 0;
    if (u.teamT > T) k = Math.max(k, 0.15);
    if (!(k > 0) || Math.random() >= k) return false;
    pl.invuln = Math.max(pl.invuln || 0, 0.3);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 4, '¡Esquiva!', '#bfe8ff');
    afterimages(pl, [{ x: pl.x - 10, y: pl.y }, { x: pl.x - 5, y: pl.y }], 0.3, '#bfe8ff');
    G.Audio.sfx('select');
    return true;
  }
  function mxHurt(pl) {
    P3(pl).hurtAt = now();
    for (const m of pl.moves) { const M = MECH[m.id]; if (M && M.hurt) M.hurt(pl, m); }
  }
  function mxTouched(pl, e) {
    if (pl.dead) return;
    for (const m of pl.moves) { const M = MECH[m.id]; if (M && M.touch && !e.dead) M.touch(pl, m, e); }
  }
  function mxIdle(dt, pl, act) {
    if (!pl.moves) return;
    for (const m of pl.moves) { const M = MECH[m.id]; if (M && M.idle) M.idle(pl, m, dt, act.includes(m)); }
  }
  // Lo de cada fotograma que añaden los tipos (fuegos fatuos pegados...), lo que dibujan y lo que se olvida al acabar.
  const MX_TICK = [], MX_DRAW = [], MX_RESET = [];
  /** Cada fotograma, antes de los campos: estados, lanzados, lo que para disparos enemigos (lo rellenan los campos). */
  function mxTick(dt) {
    walls3.length = 0;
    if (tw3.length) tw3 = tw3.filter(p => !p.boom3 && p.t < p.life);
    stTick(dt);
    if (TOSSED.length) tossTick(dt);
    for (const fn of MX_TICK) fn(dt);
  }
  function mxReset() {
    for (const e of ST_SET) stClear(e);
    ST_SET.clear(); TOSSED.length = 0; PLEDGES.length = 0; TYPE_AT = Object.create(null);
    walls3 = []; tw3 = []; MARKED.clear();
    for (const fn of MX_RESET) fn();
  }
  /** Lo que va encima de todo: iconos de estado, lo de los tipos y lo tuyo. */
  function mxDrawTop(ctx, own, t) {
    for (const fn of MX_DRAW) fn(ctx, own, t);
    stIcons(ctx, own, t);
    drawPl3(ctx, t);
  }

  // ---------------- dibujo ----------------
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
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU); ctx.fill();
  }
  /** Liana de (x0, y0) a (x1, y1) a bloques, con hojitas (paleta P). */
  function drawVine(ctx, x0, y0, x1, y1, P, t, thick = 3) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L / 2.5)), nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
    // Primero el borde oscuro de todo el tallo y luego el color encima (sin huecos entre tramos).
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i <= n; i++) {
        const k = i / n, w = Math.sin(k * 9 + t * 8) * 2.5 * Math.sin(Math.PI * k);
        const x = x0 + (x1 - x0) * k + nx * w, y = y0 + (y1 - y0) * k + ny * w;
        if (!pass) { ctx.fillStyle = P[0]; ctx.fillRect(Math.round(x - thick / 2) - 1, Math.round(y - thick / 2) - 1, thick + 2, thick + 2); continue; }
        ctx.fillStyle = (i >> 2) % 3 ? P[2] : P[3]; ctx.fillRect(Math.round(x - thick / 2), Math.round(y - thick / 2), thick, thick);
        if (i % 10 === 5) {
          // Hojitas a los lados.
          const s = (i / 10) % 2 ? 1 : -1;
          ctx.fillStyle = P[1]; ctx.fillRect(Math.round(x + nx * 4 * s) - 2, Math.round(y + ny * 4 * s) - 2, 5, 4);
          ctx.fillStyle = P[3]; ctx.fillRect(Math.round(x + nx * 4 * s) - 1, Math.round(y + ny * 4 * s) - 1, 3, 2);
        }
      }
    }
  }
  /** Rayo en zigzag de (x0, y0) a (x1, y1). */
  function drawBolt(ctx, x0, y0, x1, y1, P, seed, w = 2) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L / 10)), nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
    ctx.lineCap = 'square';
    for (const [col, lw] of [[P[3], w + 2], [P[4], w]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let i = 1; i < n; i++) {
        const k = i / n, o = (G.U.hash(i, seed | 0, 3) - 0.5) * 12;
        ctx.lineTo(x0 + (x1 - x0) * k + nx * o, y0 + (y1 - y0) * k + ny * o);
      }
      ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  /** Rayo que dura un instante entre dos puntos (cadenas, arcos, rayos del cielo). */
  function zap(pl, x0, y0, x1, y1, pal, life = 0.16, w = 2) {
    addField({ owner: pl, x: (x0 + x1) / 2, y: (y0 + y1) / 2, life, pad: Math.hypot(x1 - x0, y1 - y0) / 2 + 40, tag: 'zap', ghost: true, seed: Math.random() * 99,
      da(ctx, f, own, t) {
        ctx.globalAlpha = own * Math.min(1, (f.life - f.t) / f.life * 2);
        drawBolt(ctx, x0, y0, x1, y1, G.VFX.PAL[pal] || G.VFX.PAL.electric, f.seed + Math.floor(t * 30), w);
      } });
  }

  /** Para tools/balance.cjs (sus muñecos no son G.Enemy): lo que suben vulnerable y Espada Santa. */
  const MXT = { MECH, stAdd, stStack, stHurtK, real };
  /* ---------------- fin del motor común de ataques únicos ---------------- */

  // ==================================================================================================
  // -- ataques únicos: Lucha, Veneno, Tierra, Volador, Psíquico, Bicho (26-10-2026) --
  // ==================================================================================================
  /*
   * Cada uno de estos 44 ataques tiene su mecánica propia (MECH[id], ver el motor común arriba).
   * Cooperativo: el daño lo hace quien lanza (también sobre las copias de un invitado, por 'h');
   * lo que MUEVE o cambia la IA de los enemigos (confusión, levantar, teletransportar,
   * encerrar...) lo hace quien tiene los enemigos de verdad (el anfitrión, o tú solo), también
   * desde el fantasma de un invitado (como el remolino). En una copia sólo se ve. Las tiradas
   * (Puño Dinámico, Magnitud) salen del apuntado que llega por la red: todos ven lo mismo.
   */
  // ---- (cada tipo, en su bloque) ----

  // ======== Psíquico ========
  /** Confusión (o marioneta, evolucionada) al tocar. En la copia de un invitado, sólo se ve. */
  function confuseOn(e, m, p0, t0) {
    const c = m.conf || [p0, t0];
    if (Math.random() < c[0]) stAdd(e, 'confuse', c[1]);
  }

  // Confusión: onda que ondula y confunde; Psicocarga: los confusos que toca, marionetas.
  MECH['confusion'] = {
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
    if (m.evolved && stHas(e, 'confuse')) {
      if (stAdd(e, 'control', 2.5) && G.Camera.sees(e.x, e.y, 20)) G.FX.ring(e.x, e.y - e.bodyH * 0.5, 4, e.r * 2.5, '#ff9fcf', 0.3, 3);
    } else confuseOn(e, m, 0.25, 1.5);
  }

  // Psicorrayo: se tuerce a mitad de camino (dos tramos) y confunde; Premonición: pilar 2 s después.
  MECH['psybeam'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), w = m.width;
      const a1 = pl.aim, L1 = rayLen(pl.x, pl.y, Math.cos(a1), Math.sin(a1), m.radius * 0.5);
      const bx = pl.x + Math.cos(a1) * L1, by = pl.y + Math.sin(a1) * L1;
      const a2 = a1 + (roll(pl, m, 1) * 2 - 1) * (m.refr || 0.6);
      const L2 = L1 < m.radius * 0.5 - 4 ? 0 : rayLen(bx, by, Math.cos(a2), Math.sin(a2), m.radius - L1);
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
        addField({ tag: 'eye', owner: pl, ghost, m, x: pl.x, y: pl.y, life: 2.4, pad: 400, list: list.slice(0, 16), dmg: m.dmg * pl.atkFor(m) * 2.5, fired: false,
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
          da(ctx, f) {
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
  MECH['psychic'] = {
    cast(pl, m) {
      const col = colOf(m), all = m.evolved, range = 260 * (m.size / 7), list = [], bigs = [];
      const near = all ? G.EnemyMgr.all().filter(e => !e.dead && inWipeBox(pl, e))
                       : inCircle(pl.x, pl.y, range).sort((a, b) => G.U.dist2(pl.x, pl.y, a.x, a.y) - G.U.dist2(pl.x, pl.y, b.x, b.y));
      const n = all ? 40 : Math.max(1, m.count | 0);
      for (const e of near) {
        if (big(e) || e.behavior === 'thief' || e.behavior === 'stampede') { if (bigs.length < 3) bigs.push(e); continue; }
        if (list.length >= n) continue;
        list.push(e);
      }
      if (!list.length && !bigs.length) return true;
      const up = all ? 1 : m.lift || 0.6;
      for (const e of list) stAdd(e, 'air', up + 0.3, 0, { h: all ? 34 : 26, k: 0, glow: '#ff4f9a' });
      G.FX.ring(pl.x, pl.y, pl.r, all ? WIPE_W * 0.7 : range * 0.6, col, 0.4, all ? 5 : 3);
      if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('shot', { kind: 'aura', type: 'psychic' });
      // Los grandes: daño y quietos un instante.
      for (const e of bigs) {
        if (!ghost) hit(pl, e, m.dmg * pl.atkFor(m) * (all ? 2.2 : 1.6), col, 0, -1, 0, m);
        if (real(e)) e.applyStun(0.2 * 0.35);
      }
      addField({ tag: 'tk', owner: pl, ghost, m, x: pl.x, y: pl.y, life: up + 0.6, pad: 500, list, up, all, thrown: null, dmg: m.dmg * pl.atkFor(m),
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
              const a = stGet(e, 'air');
              if (a && o) { a.tx = o.x; a.ty = o.y; a.t = 0.22; }
            }
          }
          if (f.thrown && !f.hitDone && f.t >= f.up + (f.all ? 0.05 : 0.22)) {
            f.hitDone = true;
            for (const { e, o } of f.thrown) {
              if (e.dead) continue;
              const k = f.all && inTerrain(e) ? 2 : 1;
              if (G.Camera.sees(e.x, e.y, 30)) { G.FX.ring(e.x, e.y, 4, e.r * 2.2, '#ff4f9a', 0.3, 3); G.FX.burst(e.x, e.y - 6, '#ff9fcf', 6, 110); }
              const a = stGet(e, 'air');
              if (a) a.t = 0.01;                                         // cae ya
              if (!f.ghost && !pl2.dead) {
                hit(pl2, e, f.dmg * k * (o || f.all ? 1 : 1.2), '#ff4f9a', 0, 1, 0, f.m);
                if (o && !o.dead) hit(pl2, o, f.dmg, '#ff4f9a', o.x - e.x, o.y - e.y, 80, f.m);
              }
            }
            if (G.Camera.sees(f.x, f.y, 200)) { G.Audio.sfx('thud'); if (!f.ghost) G.Camera.kick(f.all ? 0.3 : 0.12); }
          }
          return false;
        },
        dg(ctx, f, own) {
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
  MECH['psycho-cut'] = {
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
  MECH['extrasensory'] = {
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
        const L = rayLen(pl.x, pl.y, Math.cos(pl.aim), Math.sin(pl.aim), 150);
        px = pl.x + Math.cos(pl.aim) * L; py = pl.y + Math.sin(pl.aim) * L;
      }
      for (const e of inCircle(pl.x, pl.y, m.radius)) {
        if (!ghost) hit(pl, e, dmg, col, e.x - pl.x, e.y - pl.y, 0, m);
        if (e.dead) continue;
        if (real(e) && !big(e) && e.behavior !== 'thief') {
          if (G.Camera.sees(e.x, e.y, 20)) G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ffe8f3', 6, 90);
          if (m.evolved) tpEnemy(e, px + G.U.rand(-18, 18), py + G.U.rand(-14, 14));
          else { const a = Math.random() * TAU, d = G.U.rand(160, 220) * far; tpEnemy(e, pl.x + Math.cos(a) * d, pl.y + Math.sin(a) * d * 0.8); }
          if (G.Camera.sees(e.x, e.y, 20)) G.FX.ring(e.x, e.y, 2, e.r * 2, '#ff9fcf', 0.25, 3);
        }
        if (real(e)) e.applyStun((m.stun || 0.3) * (big(e) ? 0.35 : 1));
      }
      if (!ghost) { G.Camera.kick(0.1); for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, dmg, col); }
      if (G.Camera.sees(pl.x, pl.y, 40)) G.Audio.sfx('shot', { kind: 'orbit', type: 'psychic' });
      if (m.evolved) {
        addField({ tag: 'wave', owner: pl, ghost, m, x: px, y: py, life: 0.6, pad: 90, dmg, boom: false,
          upd(f) {
            if (!f.boom && f.t >= 0.25) {
              f.boom = true;
              if (G.Camera.sees(f.x, f.y, 40)) { G.FX.ring(f.x, f.y, 6, 70, '#ff4f9a', 0.35, 5); G.FX.burst(f.x, f.y - 8, '#ff9fcf', 16, 200); G.Audio.sfx('break'); }
              areaHit(f.owner, f.m, f.x, f.y, 70, f.dmg, { col: '#ff4f9a', knock: 120 });
            }
            return false;
          },
          dg(ctx, f, own) {
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
  MECH['mist-ball'] = {
    pp: m => ({ onHit: (p, e) => mistAt(p.owner, m, p.ghost, e.x, e.y) })
  };
  function mistAt(pl, m, gh, x, y) {
    const mm = m.mist || [60, 3];
    // Encima de una que ya hay: la alarga (no se apilan).
    for (const f of fields) {
      if (f.kind === 'mx' && f.tag === 'mist' && f.owner === pl && !f.gone && G.U.dist2(f.x, f.y, x, y) < (f.r * 0.6) ** 2) { f.life = Math.max(f.life, f.t + mm[1] * pkOf(m).dur); return; }
    }
    const r = mm[0] * pkOf(m).area;
    addField({ tag: 'mist', owner: pl, ghost: gh, m, x, y, r, life: mm[1] * pkOf(m).dur, pad: r + 30, tick: 0, flash: 0.5, seed: Math.random() * 99,
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
          areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg, { col: '#7fc8ff' });
        }
        return false;
      },
      da(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 5), now = performance.now() / 1000;
        ctx.globalAlpha = 0.45 * a * own;
        for (let i = 0; i < 7; i++) {
          const k = i / 7 * TAU + f.seed + now * 0.4, rr = f.r * (0.25 + 0.55 * G.U.hash(i, f.seed | 0, 3));
          G.VFX.draw(ctx, 'puff', f.m.evolved && f.flash > 0.4 ? 'water' : 'mist', f.x + Math.cos(k) * rr, f.y + Math.sin(k) * rr * 0.55 - 10,
                     { scale: 1.5 + (i % 3) * 0.4, frame: (i + Math.floor(now * 2)) % 2, alpha: 0.85 });
        }
      } });
    mxTrim(pl, 'mist', 4, m.id);
  }

  // Géiser Fotónico: un pilar que se ensancha en cada golpe y al final deslumbra; Psicoataque: persigue.
  MECH['photon-geyser'] = {
    cast(pl, m) {
      if (pl.mon && G.Stats.sideOf) m.cat = G.Stats.sideOf(pl.mon);         // tu lado más fuerte
      const tg = ghost ? null : spotFor(pl, m);
      const x = tg ? tg.x : pl.x + Math.cos(pl.aim) * 140, y = tg ? tg.y : pl.y + Math.sin(pl.aim) * 140;
      const n = Math.max(1, m.count | 0), list = [];
      for (let i = 0; i < n; i++) list.push({ x: x + colOff(i, m.width), y });
      addField({ tag: 'gey', owner: pl, ghost, m, x, y, list, life: m.life + 0.15, hl: m.life, k: 0, pad: m.height,
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
              for (const e of inCircle(c.x, c.y, 70)) stAdd(e, 'confuse', 1);
            }
          }
          return false;
        },
        da(ctx, f, own) {
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
  MECH['psychic-terrain'] = {
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
    // (En la copia de un invitado sólo se ve: el daño lo pone el anfitrión al repetir el ataque.)
    stAdd(e, 'bpoison', t, v);
  }
  /** Charco tóxico pequeño (gotas de Residuos, botes de Bomba Lodo): veneno y algo de daño cada 0,4 s. */
  /** @param bp  si se da, también veneno grave (con este tic) a los que pisan el charco (Armadura Ácida) */
  function toxPool(pl, m, gh, x, y, r, life, dmg, bp) {
    addField({ tag: 'pool', owner: pl, ghost: gh, m, x, y, r, life, pad: r + 20, tick: 0.1, dmg, bp,
      upd(f, dt) {
        if ((f.tick -= dt) <= 0) {
          f.tick = 0.4;
          if (f.bp && !f.ghost) for (const e of inCircle(f.x, f.y, f.r)) badPoison(e, f.bp);
          areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg, { col: '#b45ec4' });
        }
        return false;
      },
      dg(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 8);
        ctx.globalAlpha = 0.4 * a * own; ctx.fillStyle = '#7a2aa8';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.6 * a * own; ctx.fillStyle = '#d995f2';
        ctx.fillRect(Math.round(f.x - f.r * 0.3), Math.round(f.y - 2), 2, 2); ctx.fillRect(Math.round(f.x + f.r * 0.25), Math.round(f.y + 1), 2, 2);
      } });
    mxTrim(pl, 'pool', 16, m.id);
  }

  // Residuos: el tocado queda pringado y va dejando gotas tóxicas; Bomba Lodo: bota 3 veces dejando charcos.
  MECH['sludge'] = {
    pp: m => ({ onHit: (p, e) => { if (!p.ghost && !e.dead) slimeOn(p.owner, m, e); } }),
    cast(pl, m) {
      if (!m.evolved) return false;
      const n = Math.max(1, m.count | 0), near = inCircle(pl.x, pl.y, 300), dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const e = i === 0 ? (aimTarget(pl, 300) || near[0]) : near[(i * 7) % Math.max(1, near.length)];
        const tx = e ? e.x : pl.x + Math.cos(pl.aim) * 200, ty = e ? e.y : pl.y + Math.sin(pl.aim) * 200;
        addField({ tag: 'bomb', owner: pl, ghost, m, x: pl.x, y: pl.y, x0: pl.x, y0: pl.y, tx, ty, hop: 0, h: 0, life: 1.2, pad: 260, dmg,
          upd(f) {
            const k = Math.min(3, f.t / 0.24), i = Math.floor(k), u = k - i;
            if (i > f.hop) {
              // Toca el suelo: golpe y charco tóxico.
              f.hop = i;
              const x = f.x0 + (f.tx - f.x0) * i / 3, y = f.y0 + (f.ty - f.y0) * i / 3;
              if (G.Camera.sees(x, y, 30)) { G.FX.burst(x, y - 4, '#a043d0', 8, 120); G.Audio.sfx('thud'); }
              areaHit(f.owner, f.m, x, y, 30, f.dmg, { col: '#a043d0' });
              toxPool(f.owner, f.m, f.ghost, x, y, 30, 2, f.dmg * 0.15);
              if (i >= 3) return true;
            }
            f.x = f.x0 + (f.tx - f.x0) * k / 3; f.y = f.y0 + (f.ty - f.y0) * k / 3; f.h = Math.sin(u * Math.PI) * (i === 0 ? 46 : 30);
            return false;
          },
          da(ctx, f) {
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
    for (const o of fields) if (o.kind === 'mx' && o.tag === 'slime' && o.owner === pl && o.e === e && !o.gone) { f = o; break; }
    if (f) { f.left = 3; return; }
    addField({ tag: 'slime', owner: pl, ghost: false, m, e, x: e.x, y: e.y, left: 3, next: 0, drips: [], pad: 200, tick: 0,
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
      dg(ctx, f, own) {
        ctx.fillStyle = '#8a3cbf';
        for (const d of f.drips) { ctx.globalAlpha = 0.65 * own * Math.max(0, 1 - d.t / 1.5); ctx.beginPath(); ctx.ellipse(d.x, d.y, 7, 3.5, 0, 0, TAU); ctx.fill(); }
      },
      da(ctx, f) {
        if (f.left > 0 && !f.e.dead && Math.random() < 0.25) G.FX.px(f.e.x + G.U.rand(-f.e.r, f.e.r) * 0.6, f.e.y - G.U.rand(2, f.e.bodyH * 0.6), '#a043d0', { vy: 40, grav: 200, life: 0.3, size: 2 });
      } });
    mxTrim(pl, 'slime', 6, m.id);
  }

  // Picotazo Veneno: dos aguijones paralelos (si los dos dan al mismo, veneno doble); Puya Nociva: tres estocadas.
  MECH['poison-sting'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), dmg = m.dmg * pl.atkFor(m);
      if (m.evolved) {
        addField({ tag: 'stab', owner: pl, ghost, m, x: pl.x, y: pl.y, a: pl.aim, k: 0, life: 0.4, pad: 120, dmg,
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
  MECH['toxic'] = {
    cast(pl, m) {
      const dmg = m.dmg * pl.atkFor(m);
      if (m.evolved) {
        let f = mxFind(pl, 'gas', m.id);
        if (f) { f.life = f.t + 1.2; f.dmg = dmg; return true; }
        const r = m.radius * 2.7;
        addField({ tag: 'gas', owner: pl, ghost, m, x: pl.x, y: pl.y, r, life: 1.2, pad: r + 30, tick: 0.1, dmg, seed: Math.random() * 50,
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
              areaHit(pl2, f.m, f.x, f.y, f.r, f.dmg * 1.3, { col: '#a043d0' });
            }
            return false;
          },
          da(ctx, f, own) {
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
      const last = mxLast(pl, 'patch', m.id);
      if (last && G.U.dist2(last.x, last.y, pl.x, pl.y) < (m.radius * 0.9) ** 2 && last.t < 1) return true;
      addField({ tag: 'patch', owner: pl, ghost, m, x: pl.x, y: pl.y, r: m.radius, life: m.dur || 3, pad: 40, tick: 0, dmg,
        upd(f, dt) {
          if ((f.tick -= dt) <= 0) {
            f.tick = 0.5;
            for (const e of inCircle(f.x, f.y, f.r)) badPoison(e, f.dmg * 0.25);
            areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg, { col: '#7a2aa8' });
          }
          return false;
        },
        dg(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 2, f.t * 6);
          ctx.globalAlpha = 0.42 * a * own; ctx.fillStyle = '#4a1466';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.6 * a * own; ctx.strokeStyle = '#a043d0'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.8, f.r * 0.5, 0, 0, TAU); ctx.stroke();
          if (Math.random() < 0.05) G.FX.sp('bubble', 'poison', f.x + G.U.rand(-f.r, f.r) * 0.6, f.y - 4, { vy: -40, life: 0.45 });
        } });
      mxTrim(pl, 'patch', 18, m.id);
      return true;
    }
  };

  // Púas Tóxicas: capas (la 2.ª, veneno grave); Lanza Mugre: los que mueren encima salpican capas nuevas.
  MECH['toxic-spikes'] = {
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
      if (f.kind !== 'mx' || f.tag !== 'tsp' || f.owner !== pl || f.gone || f.small || G.U.dist2(f.x, f.y, x, y) > (f.r * 0.6) ** 2) continue;
      // Otra capa encima (como mucho 2): veneno grave.
      if (f.layers < 2 && G.Camera.sees(f.x, f.y, 30)) G.FX.ring(f.x, f.y, 4, f.r, '#7cff8a', 0.35, 3);
      f.layers = Math.min(2, f.layers + 1); f.life = f.t + life; f.dmg = dmg;
      return;
    }
    addField({ tag: 'tsp', owner: pl, ghost: gh, m, x, y, r, life, layers: 1, small: !layer, pad: r + 20, tick: 0.2, dmg, inside: new Set(), seed: Math.random() * 999,
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
      dg(ctx, f, own) {
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
    mxTrim(pl, 'tsp', 12, m.id);
  }

  // Bomba Ácida: cada golpe baja 2 pilas la defensa (vulnerable) y envenena; Onda Tóxica: anillo en cada rebote.
  MECH['acid-spray'] = {
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
  MECH['cross-poison'] = {
    cast(pl, m) {
      const col = colOf(m), vis = G.VFX.forMove(m), dmg = m.dmg * pl.atkFor(m), pairs = Math.max(1, Math.ceil((m.count | 0) / 2));
      const used = new Set(), R = m.speed * m.life;
      for (let j = 0; j < pairs; j++) {
        let e = j === 0 ? aimTarget(pl, R) : null;
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
    addField({ tag: 'xz', owner: pl, ghost: gh, m, x, y, a, life: 2 * pkOf(m).dur, pad: 60, tick: 0.1, dmg: dmg * 0.4, L: 44 * pkOf(m).area,
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
      dg(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 2, f.t * 8);
        for (const b of [f.a + 0.785, f.a - 0.785]) {
          const dx = Math.cos(b) * f.L, dy = Math.sin(b) * f.L * 0.7;
          ctx.globalAlpha = 0.5 * a * own; pxLine(ctx, f.x - dx, f.y - dy, f.x + dx, f.y + dy, 8, '#5e1f7e');
          ctx.globalAlpha = 0.85 * a * own; pxLine(ctx, f.x - dx, f.y - dy, f.x + dx, f.y + dy, 3, '#ff7ae0');
        }
      } });
    mxTrim(pl, 'xz', 6, m.id);
  }

  // Búnker: al parar te encierras (quieto e invulnerable) y sueltas gas que envenena grave;
  // Armadura Ácida: te licúas y te deslizas al doble de rápido dejando ácido.
  MECH['baneful-bunker'] = {
    block(pl, m, g) {
      if (g) return;
      const dmg = m.dmg * pl.atkFor(m);
      if (!m.evolved) {
        pl.uqLock = { k: 'bunker', t: 1.2 };
        pl.invuln = Math.max(pl.invuln || 0, 1.25);
        addField({ tag: 'bunker', owner: pl, ghost: false, m, x: pl.x, y: pl.y, life: 1.2, pad: 120, tick: 0, dmg,
          upd(f, dt) {
            if ((f.tick -= dt) <= 0) {
              f.tick = 0.3;
              for (const e of inCircle(f.x, f.y, 80)) badPoison(e, f.dmg * 0.35);
              areaHit(f.owner, f.m, f.x, f.y, 80, f.dmg * 0.15, { col: '#a043d0' });
              if (G.Camera.sees(f.x, f.y, 80)) for (let i = 0; i < 3; i++) { const a = Math.random() * TAU; G.FX.sp('puff', 'poison', f.x + Math.cos(a) * 30, f.y + Math.sin(a) * 20 - 6, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 60, life: 0.5 }); }
            }
            return false;
          },
          da(ctx, f, own) {
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
      // Licuado: 0,6 s al doble de rápido, sin que te toquen, dejando charcos de ácido que envenenan grave.
      // (29-10-2026: antes eran charquitos de 22 px sin veneno grave y la evolución pegaba menos que el
      //  Búnker al máximo. Ahora te sigue el gas del Búnker, más ancho, y los charcos son de 40 px.)
      if (!pl.uqLock) { pl.uqLock = { k: 'slide', t: 0.6 }; pl.spdMul *= 2; }
      pl.invuln = Math.max(pl.invuln || 0, 0.65);
      addField({ tag: 'acid', owner: pl, ghost: false, m, x: pl.x, y: pl.y, life: 1.3, pad: 120, next: 0, tick: 0, dmg,
        upd(f, dt) {
          f.x = f.owner.x; f.y = f.owner.y;
          if (f.t < 0.65 && (f.next -= dt) <= 0) { f.next = 0.12; toxPool(f.owner, f.m, false, f.x, f.y, 40, 3, f.dmg * 0.15, f.dmg * 0.3); }
          if ((f.tick -= dt) <= 0) {
            f.tick = 0.3;
            for (const e of inCircle(f.x, f.y, 95)) badPoison(e, f.dmg * 0.35);
            areaHit(f.owner, f.m, f.x, f.y, 95, f.dmg * 0.15, { col: '#a043d0' });
            if (G.Camera.sees(f.x, f.y, 95)) for (let i = 0; i < 3; i++) { const a = Math.random() * TAU; G.FX.sp('puff', 'poison', f.x + Math.cos(a) * 34, f.y + Math.sin(a) * 22 - 6, { vx: Math.cos(a) * 100, vy: Math.sin(a) * 66, life: 0.5 }); }
          }
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
  MECH['mud-shot'] = {
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
        stGet(e, 'mud').n = 0;
        addField({ tag: 'erupt', owner: pl, ghost, m, x: e.x, y: e.y, e, n, life: 0.55, pad: 80, done: false, dmg: dmg * (0.8 + 0.6 * n),
          upd(f) {
            if (!f.done && f.t >= 0.25) {
              f.done = true;
              if (!f.e.dead) { f.x = f.e.x; f.y = f.e.y; }
              if (G.Camera.sees(f.x, f.y, 40)) { G.FX.burst(f.x, f.y - 10, '#f08a24', 10, 160); G.FX.ring(f.x, f.y, 4, 30, '#ffc75a', 0.3, 3); G.Audio.sfx('thud'); }
              areaHit(f.owner, f.m, f.x, f.y, 30, f.dmg, { col: '#f08a24', knock: 40 });
            }
            return false;
          },
          da(ctx, f, own) {
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
  MECH['bulldoze'] = {
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
        addField({ tag: 'eq', owner: pl, ghost, m, x: pl.x, y: pl.y, cracks, life: 0.7, pad: 600,
          upd() { return false; },
          dg(ctx, f, own) {
            ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 3);
            for (const [x, y, a, L] of f.cracks) crackLine(ctx, x - Math.cos(a) * L, y - Math.sin(a) * L * 0.6, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.6, x | 0, 2);
            if (f.t < 0.3 && Math.random() < 0.5) { const c = f.cracks[(Math.random() * f.cracks.length) | 0]; G.FX.burst(c[0], c[1] - 4, '#c6b08a', 3, 70); }
          } });
        return true;
      }
      // Pisotón: un anillo que sale despacio por el suelo.
      const R1 = m.radius * 1.375;
      if (G.Camera.sees(pl.x, pl.y, 40)) { G.Audio.sfx('thud'); G.FX.burst(pl.x, pl.y - 2, '#aa7c3c', 6, 80); G.FX.ring(pl.x, pl.y, 6, R1, '#8a6a3a', 0.42, 4); }
      addField({ tag: 'stomp', owner: pl, ghost, m, x: pl.x, y: pl.y, life: 0.42, pad: R1 + 20, R1, done: new Set(), dmg, seed: Math.random() * 99,
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
        dg(ctx, f, own) {
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
  MECH['bonemerang'] = {
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
        if (!p.ghost && !o.dead) areaHit(o, m, p.x, p.y, 30 + p.r, p.dmg * 0.55, { col: p.color, knock: 20 });
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
  MECH['spikes'] = {
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
        addField({ tag: 'fis', owner: pl, ghost, m, x: pl.x, y: pl.y, pts, life: 3 * pkOf(m).dur, pad: 160, swallowed: 0, done: new Map(), dmg,
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
                if (!e.dead && !big(e) && !e.champ && e.behavior !== 'thief' && f.swallowed < 6 && e.hp < e.maxHp * 0.4) {
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
          dg(ctx, f, own) {
            const a = Math.min(1, (f.life - f.t) * 3, f.t * 8), P = f.pts;
            ctx.globalAlpha = own * a;
            for (let i = 0; i < P.length - 1; i++) crackLine(ctx, P[i].x, P[i].y, P[i + 1].x, P[i + 1].y, i * 13 + (P[0].x | 0), 4);
          } });
        return true;
      }
      addField({ tag: 'cal', owner: pl, ghost, m, x: pl.x, y: pl.y, pts, life: m.dur || 8, pad: 120, dmg,
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
        dg(ctx, f, own) {
          ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 2, f.t * 8);
          for (const c of f.pts) if (c.live) G.VFX.draw(ctx, 'caltrop', 'steel', c.x, c.y - 2, { scale: 0.9 });
        } });
      mxTrim(pl, 'cal', 4, m.id);
      return true;
    }
  };

  // Bucle Arena: arenas movedizas en el blanco (no se sale y se hunden; con tormenta de arena, dos);
  // Fuerza Equina: cada 0,5 s una línea de pisotones sale de la arena.
  MECH['sand-tomb'] = {
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
        addField({ tag: 'qs', owner: pl, ghost, m, x, y, r: m.radius, life: m.dur || 3, pad: m.radius + 40, tick: 0.2, n: 0, hoof: 0.5, dmg,
          upd(f, dt) {
            // Los de dentro no salen (lo hace quien tiene los enemigos de verdad).
            for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
              if (!real(e) || e.flying) continue;
              const x = stAdd(e, 'sink', 0.25);
              if (x) { x.f = f; e.slow = Math.max(e.slow, 0.4); e.slowT = Math.max(e.slowT, 0.3); }
            }
            if ((f.tick -= dt) <= 0) {
              f.tick = 0.4; f.n++;
              areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg * (1 + 0.2 * (f.n - 1)), { col: '#dcb66c', filter: ground });
            }
            if (f.m.evolved && (f.hoof -= dt) <= 0) {
              f.hoof = 0.5;
              const a = Math.random() * TAU;
              addField({ tag: 'hoof', owner: f.owner, ghost: f.ghost, m: f.m, x: f.x, y: f.y, ca: Math.cos(a), sa: Math.sin(a), i: 0, next: 0, life: 0.5, pad: 200, dmg: f.dmg * 0.8,
                upd(h, dt2) {
                  h.next -= dt2;
                  while (h.next <= 0 && h.i < 5) {
                    h.next += 0.07; h.i++;
                    const x = h.x + h.ca * h.i * 32, y = h.y + h.sa * h.i * 32;
                    if (G.World.isWall(x, y)) { h.i = 5; break; }
                    if (G.Camera.sees(x, y, 30)) { G.FX.burst(x, y - 3, '#dcb66c', 5, 90); G.FX.sp('rock', 'ground', x, y - 4, { vy: -70, grav: 320, life: 0.3, scale: 0.6 }); }
                    areaHit(h.owner, h.m, x, y, 26, h.dmg, { col: '#aa7c3c', knock: 60, filter: ground });
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
          dg(ctx, f, own) {
            const a = Math.min(1, (f.life - f.t) * 2, f.t * 6), now = performance.now() / 1000;
            ctx.globalAlpha = 0.35 * a * own; ctx.fillStyle = '#c9a45c';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, TAU); ctx.fill();
            ctx.globalAlpha = 0.5 * a * own; ctx.fillStyle = '#5a3a0c';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 0.22, f.r * 0.13, 0, 0, TAU); ctx.fill();
            ctx.globalAlpha = 0.7 * a * own; ctx.strokeStyle = '#f4d890'; ctx.lineWidth = 2;
            for (let k = 0; k < 3; k++) { const rr = f.r * (0.35 + k * 0.25), a0 = -now * (2.6 - k * 0.5) + k * 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.6, 0, a0, a0 + 2.6); ctx.stroke(); }
          } });
      }
      mxTrim(pl, 'qs', 2 * spots.length, m.id);
      return true;
    }
  };

  // Magnitud: sale una magnitud de 4 a 10 (de ×0,6 a ×2, ondas más grandes); no toca a los que vuelan.
  // Taladradora: un taladro que perfora en línea, escupe piedras a los lados y hace críticos.
  const MAG_K = { 4: 0.6, 5: 0.8, 6: 1, 7: 1.2, 8: 1.45, 9: 1.7, 10: 2 };
  const MAG_P = [[4, 0.05], [5, 0.15], [6, 0.35], [7, 0.65], [8, 0.85], [9, 0.95], [10, 1]];
  MECH['magnitude'] = {
    cast(pl, m) {
      const dmg = m.dmg * pl.atkFor(m), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), S = pkOf(m).pspd;
      if (m.evolved) {
        const L = ((m.count | 0) + 3) * QSTEP;
        addField({ tag: 'drill', owner: pl, ghost, m, x: pl.x, y: pl.y, x0: pl.x, y0: pl.y, ca, sa, L, d: 0, tick: 0, spit: 0.1, life: L / (220 * S) + 0.2, pad: 80, dmg,
          upd(f, dt) {
            f.d = Math.min(f.L, f.d + 220 * S * dt);
            f.x = f.x0 + f.ca * f.d; f.y = f.y0 + f.sa * f.d;
            if (G.World.isWall(f.x, f.y)) return true;
            if ((f.tick -= dt) <= 0) {
              f.tick = 0.1;
              areaHit(f.owner, f.m, f.x, f.y, f.m.radius * 1.3, f.dmg * 0.8, { col: '#8e7a5a', knock: 20, filter: ground });
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
          da(ctx, f, own) {
            ctx.globalAlpha = own;
            G.VFX.draw(ctx, 'drill', 'steel', f.x, f.y - 8, { angle: Math.atan2(f.sa, f.ca), scale: 2, frame: Math.floor(f.t * 20) });
          },
          dg(ctx, f, own) {
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
      addField({ tag: 'mag', owner: pl, ghost, m, x: pl.x, y: pl.y, ca, sa, i: 0, n, next: 0, rr, step: QSTEP * (0.8 + (mag - 4) * 0.06), pad: n * QSTEP + 60, dmg: dmg * K, mag,
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
            areaHit(f.owner, f.m, x, y, f.rr, f.dmg, { col: '#aa7c3c', knock: f.m.knock || 0, filter: ground });
          }
          return f.i >= f.n;
        } });
      if (G.Camera.sees(pl.x, pl.y, 60)) { G.Audio.sfx('thud'); if (mag >= 8) G.Audio.sfx('break'); }
      return true;
    }
  };

  // Hueso Palo: el hueso se clava de pie y golpea a los que pasan (corta lo que preparan);
  // Hueso Sombrío: además, un círculo de fuego fantasma que maldice.
  MECH['bone-club'] = {
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
    addField({ tag: 'post', owner: o, ghost: p.ghost, m, x: p.x, y: p.ty, r, life: m.dur || 3, pad: 90, log: new Map(), dmg: p.dmg * 0.55, curse: 0.5,
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
            if (!f.ghost && !f.owner.dead) areaHit(f.owner, mg, f.x, f.y, 70, f.dmg * 0.7, { col: '#27c873' });
            flushAs(f.m);
            f.ck = !f.ck;
            if (f.ck) for (const e of inCircle(f.x, f.y, 70)) { const v = stN(e, 'vuln'); if (v < 3) stStack(e, 'vuln', 1, 5, 3); }
          }
          if (Math.random() < dt * 18 && G.Camera.sees(f.x, f.y, 70)) { const a = Math.random() * TAU, rr = G.U.rand(20, 70); G.FX.sp('fire', 'ghostfire', f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.6 - 4, { vy: -50, life: 0.45, angle: -Math.PI / 2 }); }
        }
        return false;
      },
      dg(ctx, f, own) {
        if (!f.m.evolved) return;
        const a = Math.min(1, (f.life - f.t) * 3, f.t * 6);
        ctx.globalAlpha = 0.22 * a * own; ctx.fillStyle = '#27c873';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 70, 42, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.6 * a * own; ctx.strokeStyle = '#98ffba'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 70, 42, 0, 0, TAU); ctx.stroke();
      },
      da(ctx, f, own) {
        const a = Math.min(1, (f.life - f.t) * 3);
        ctx.globalAlpha = own * a;
        // De pie y girando (como una hélice vista de lado).
        G.VFX.draw(ctx, 'bone', f.m.evolved ? 'ghostfire' : 'ground', f.x, f.y - 14, { angle: f.t * 14, scale: 1.5 });
      } });
    mxTrim(o, 'post', 4, m.id);
    return true;
  }

  // Bomba Fango: dentro de los charcos, los disparos enemigos salen desviados; Arenas Ardientes: queman y,
  // con sol o en el volcán, duran el doble.
  MECH['mud-bomb'] = {
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
  MECH['gust'] = {
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
  function gustConf(p, e) { if (!e.dead && Math.random() < 0.3) stAdd(e, 'confuse', 1.5); }

  // Ataque Ala: golpea y te aparta hacia atrás; Pájaro Osado: al momento vuelves en picado a través de ellos.
  MECH['wing-attack'] = {
    cast(pl, m) {
      melee(pl, m);
      if (ghost) return true;
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), back = m.back || 40, dmg = m.dmg * pl.atkFor(m);
      addField({ tag: 'recoil', owner: pl, ghost: false, m, x: pl.x, y: pl.y, ca, sa, back, moved: 0, dived: false, life: m.evolved ? 0.62 : 0.14, pad: 200, dmg,
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
            invul(pl2, 0.3);
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
    areaHit(pl, m, e.x, e.y, 40, dmg * 0.7, { col: colOf(m), skip });
    if (real(e)) stAdd(e, 'daze', 0.5);
    G.Audio.sfx('shot', { kind: 'melee', type: 'flying' });
  }
  MECH['aerial-ace'] = {
    cast(pl, m) {
      if (ghost) { G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#d2e2ff', 8, 120); return true; }
      const e = aimTarget(pl, m.radius + 60);
      if (!e) return true;
      const dmg = m.dmg * pl.atkFor(m);
      blinkBehind(pl, e); xSlash(pl, m, e, dmg); invul(pl, 0.3); G.Camera.kick(0.1);
      if (m.evolved) {
        addField({ tag: 'acro', owner: pl, ghost: false, m, x: pl.x, y: pl.y, last: e, done: new Set([e.id]), hops: 1, next: 0.13, life: 0.6, pad: 200, dmg,
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
            blinkBehind(pl2, best); xSlash(pl2, f.m, best, f.dmg); invul(pl2, 0.2);
            for (let d = 0; d < 1; d += 0.2) G.FX.sp('feather', 'flying', sx + (pl2.x - sx) * d, sy + (pl2.y - sy) * d - G.LIFT * 0.5, { life: 0.3, angle: Math.atan2(pl2.y - sy, pl2.x - sx) });
            return false;
          } });
      }
      return true;
    }
  };

  // Remolino: cono de viento que manda lejos y da miedo; Huracán: un tornado que levanta y dispersa.
  MECH['whirlwind'] = {
    cast(pl, m) {
      const col = colOf(m), dmg = m.dmg * pl.atkFor(m);
      if (m.evolved) {
        addField({ tag: 'tor', owner: pl, ghost, m, x: pl.x, y: pl.y, r: 56 * Math.sqrt(pkOf(m).area), life: 3 * pkOf(m).dur, pad: 140, up: [], seen: new Set(), dmg,
          upd(f, dt) {
            for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r * 1.8)) {
              if (e.dead) continue;
              const d = G.U.dist(f.x, f.y, e.x, e.y);
              if (real(e) && !big(e) && !stHas(e, 'air')) {
                if (d > f.r * 0.6) { const k = Math.min(d, 160 * dt); e.x += (f.x - e.x) / d * k; e.y += (f.y - e.y) / d * k; }   // atrae
                else if (!f.seen.has(e.id)) {
                  // Dentro: gira en el aire y sale lanzado a un sitio al azar.
                  const a = Math.random() * TAU, R = G.U.rand(120, 220), x = stAdd(e, 'air', 0.8, 0, { h: 36, k: 0, cx: f.x, cy: f.y, cr: 16, ang: a });
                  if (x) { x.dest = [f.x + Math.cos(a) * R, f.y + Math.sin(a) * R * 0.8]; f.up.push({ e, t: 0, x }); }
                }
              }
              if (d <= f.r * 0.6 && !f.seen.has(e.id)) {
                f.seen.add(e.id);
                if (!real(e) || big(e)) f.up.push({ e, t: 0, x: null });
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
            if ((f.core = (f.core || 0) - dt) <= 0) { f.core = 0.4; areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg * 0.5, { col }); }
            if (f.seen.size > 200) f.seen.clear();
            return false;
          },
          da(ctx, f, own) {
            const a = Math.min(1, (f.life - f.t) * 3, f.t * 6);
            ctx.globalAlpha = own * a * 0.85;
            G.VFX.draw(ctx, 'tornado', 'flying', f.x, f.y - 30, { scale: 3, frame: Math.floor(f.t * 14) });
          },
          dg(ctx, f, own) {
            ctx.globalAlpha = 0.2 * own; ctx.fillStyle = '#93b2ff';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.5, 0, 0, TAU); ctx.fill();
          } });
        mxTrim(pl, 'tor', 2, m.id);
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
        if (!real(e) || big(e)) continue;
        const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y), d = Math.max(0, far - G.U.dist(pl.x, pl.y, e.x, e.y));
        stAdd(e, 'slide', 0.45, 0, { tx: e.x + nx * d, ty: e.y + ny * d * 0.85, t: 0.45 });
        stAdd(e, 'fear', m.fear || 1.5);
      }
      if (!ghost) G.Camera.kick(0.1);
      if (G.Camera.sees(pl.x, pl.y, 40)) G.Audio.sfx('surge');
      return true;
    }
  };

  // Tajo Aéreo: atraviesan a todos en fila y cortan lo que preparan; Ataque Aéreo: una enorme que no falla.
  MECH['air-slash'] = {
    pp: () => ({ onHit: (p, e) => { interrupt(e); p.homing = 0; } }),
    cast(pl, m) {
      if (!m.evolved) return false;
      const n = Math.max(1, m.count | 0), dmg = m.dmg * pl.atkFor(m) * Math.max(2, n) * 0.85;
      G.FX.ring(pl.x, pl.y - G.LIFT * 0.5, pl.r * 3, pl.r, '#ffe172', 0.5, 3);
      addField({ tag: 'aa', owner: pl, ghost, m, x: pl.x, y: pl.y, life: 0.5, pad: 60, dmg,
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
  MECH['dual-wingbeat'] = {
    cast(pl, m) {
      const n = Math.max(1, m.count | 0), dmg = m.dmg * pl.atkFor(m);
      let f = mxFind(pl, 'birds', m.id);
      if (f) { f.t = 0; f.life = m.dur || 8; f.dmg = dmg; f.m = m; }
      else f = addField({ tag: 'birds', owner: pl, ghost, m, x: pl.x, y: pl.y, life: m.dur || 8, birds: [], next: 0.4, pad: 260, dmg,
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
                  areaHit(pl2, mm, tx, ty, 26, f.dmg * 0.6, { col: colOf(mm), skip: sk });
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
        dg(ctx, f, own) {
          ctx.globalAlpha = 0.22 * own; ctx.fillStyle = '#000';
          for (const b of f.birds) { ctx.beginPath(); ctx.ellipse(b.x || f.x, (b.y || f.y) + (b.st === 'ring' || b.st === 'wait' ? 0 : 0), 7, 3, 0, 0, TAU); ctx.fill(); }
        },
        da(ctx, f, own) {
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
  MECH['feather-dance'] = {
    pp: m => ({ onHit: (p, e) => {
      if (!real(e) || e.dead) { if (e.remote && !e.dead) stAdd(e, 'atkdown', 3); return; }     // (en una copia, sólo se ve)
      // Ataque bajo: el mismo estado que el de Hada y Siniestro ('atkdown'), para que no se pisen al
      // volver a su daño (inflict ya lo deja a la mitad en los jefes; aquí, también en los legendarios).
      stAdd(e, 'atkdown', 3, 0, (m.weak || 0.4) * (e.legend && !big(e) ? 0.5 : 1));
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
    const L = rayLen(pl.x, pl.y, Math.cos(best), Math.sin(best), 300), ex = pl.x + Math.cos(best) * L, ey = pl.y + Math.sin(best) * L;
    G.FX.beam(pl.x, pl.y - G.LIFT, best, L, 30, '#d2e2ff', { pal: 'flying', beam: 'wind' });
    for (let d = 20; d < L; d += 30) G.FX.sp('wind', 'flying', pl.x + Math.cos(best) * d, pl.y + Math.sin(best) * d - G.LIFT, { life: 0.3, spin: 12, scale: 1.5 });
    if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('shot', { kind: 'beam', type: 'flying' });
    if (!gh) { const g = ghost; ghost = false; try { hitSeg(pl, m, pl.x, pl.y, ex, ey, 36, m.dmg * pl.atkFor(m) * 4, '#d2e2ff', 60); } finally { ghost = g; } G.Camera.kick(0.12); }
  }

  // ======== Bicho ========

  // Picadura: cada mordisco cura (máx. 3 % por s) y a veces sueltan una baya; Tijera X: marca para un crítico seguro.
  MECH['bug-bite'] = {
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
    after(pl, e, m) {
      // Cura: 1 % de la vida máxima por mordisco, como mucho un 3 % por segundo.
      const now = G.Game.st.time, b = pl.uqBite || (pl.uqBite = { t: 0, n: 0 });
      if (now - b.t > 1) { b.t = now; b.n = 0; }
      if (b.n < 0.03) { b.n += 0.01; pl.heal(pl.maxHp * 0.01); }
      if (m.evolved && !e.dead) stAdd(e, 'markX', 6, 0, { by: pl });
      if (e.dead && !e.remote && Math.random() < 0.08 && G.Pickups) G.Pickups.drop('heal', e.x, e.y);
    }
  };

  // Disparo Demora: ata a varios enemigos entre sí (no se separan más de 60 px) y los frena;
  // Red Viscosa: además, una red en el suelo que atrapa al que la pisa.
  MECH['string-shot'] = {
    cast(pl, m) {
      const n = Math.max(2, (m.count | 0) + 1), list = [], dmg = m.dmg * pl.atkFor(m), R = 240;
      const first = ghost ? G.Projectiles.nearest(G.EnemyMgr.all(), pl.x + Math.cos(pl.aim) * 80, pl.y + Math.sin(pl.aim) * 80, R) : aimTarget(pl, R);
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
      addField({ tag: 'tie', owner: pl, ghost, m, x: first.x, y: first.y, list: anchor ? [anchor, first] : list, life: m.dur || 4, pad: 300, slowT: 0, L: 60, dmg,
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
            const ex = (d - f.L) / d, ma = real(a) && !big(a) && !a.fixed, mb = real(b) && !big(b);
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
        da(ctx, f, own) {
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
      mxTrim(pl, 'tie', 3, m.id);
      if (m.evolved) {
        const cx = list.reduce((s, e) => s + e.x, 0) / list.length, cy = list.reduce((s, e) => s + e.y, 0) / list.length;
        addField({ tag: 'web', owner: pl, ghost, m, x: cx, y: cy, r: 110 * Math.sqrt(pkOf(m).area), life: 6 * pkOf(m).dur, pad: 140, seen: new Set(), tick: 0, dmg,
          upd(f, dt) {
            if ((f.tick -= dt) > 0) return false;
            f.tick = 0.3;
            for (const e of inCircle(f.x, f.y, f.r)) {
              if (!f.seen.has(e.id)) { f.seen.add(e.id); if (real(e)) stAdd(e, 'root', 1); }      // el primer paso: atrapado 1 s
              if (!f.ghost) e.applySlow(0.6, 0.4);
            }
            areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg * 0.12, { col: '#e2e2ea' });
            return false;
          },
          dg(ctx, f, own) {
            // (La red se pinta una vez en su lienzo y luego sólo se copia.)
            const a = Math.min(1, (f.life - f.t) * 2, f.t * 5), R = Math.round(f.r);
            const cv = webCanvas(R);
            ctx.globalAlpha = 0.6 * a * own;
            ctx.drawImage(cv, Math.round(f.x - R - 2), Math.round(f.y - R * 0.6 - 2));
          } });
        mxTrim(pl, 'web', 2, m.id);
      }
      if (G.Camera.sees(pl.x, pl.y, 60)) G.Audio.sfx('grass');
      return true;
    }
  };

  // Zumbido: cada pulso baja la defensa (vulnerable +1, hasta 3); con 3, además los aparta;
  // Enjambre: pica el doble a los que ya están al mínimo.
  MECH['bug-buzz'] = {
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
        else if (!e.dead) { const v2 = stGet(e, 'vuln'); if (v2) v2.t = Math.max(v2.t, 5); }
      }
      if (!ghost) for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) G.World.damageProp(p, dmg, col);
      return true;
    }
  };

  // Rayo Señal: rebota, confunde y señala (tu puntería y tus aliados van a por ellos);
  // Megacuerno: una embestida con el cuerno, más larga por cada señalado en la línea.
  MECH['signal-beam'] = {
    pp: m => ({ onHit: (p, e) => {
      if (e.dead) return;
      confuseOn(e, m, 0.15, 1.5);
      if (!p.ghost && p.owner === G.Game.player) { stAdd(e, 'mark', 5, 0, { by: p.owner }); MARKED.add(e); }
    } }),
    cast(pl, m) {
      if (!m.evolved) return false;
      if (ghost) { G.FX.sp('horn', 'gold', pl.x + Math.cos(pl.aim) * 20, pl.y + Math.sin(pl.aim) * 20 - G.LIFT * 0.5, { life: 0.25, angle: pl.aim, scale: 2 }); return true; }
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
      let n = 0;
      for (const e of G.EnemyMgr.queryCircle(pl.x + ca * 160, pl.y + sa * 160, 180)) if (!e.dead && stHas(e, 'mark') && segDist2(pl.x, pl.y, pl.x + ca * 320, pl.y + sa * 320, e.x, e.y) < (30 + e.r) ** 2) n++;
      const L = Math.min(320, 120 + 40 * n), sx = pl.x, sy = pl.y;
      let len = 0;
      for (let d = 8; d <= L; d += 8) { if (!G.World.isFree(sx + ca * d, sy + sa * d, (pl.wr || pl.r) * 0.8, true)) break; len = d; }
      pl.x = sx + ca * len; pl.y = sy + sa * len;
      G.World.collide(pl);
      invul(pl, 0.3);
      for (let d = 0; d <= len; d += 20) G.FX.sp('streak', 'bug', sx + ca * d, sy + sa * d - G.LIFT * 0.6, { life: 0.22, angle: pl.aim });
      G.FX.sp('horn', 'gold', pl.x + ca * 16, pl.y + sa * 16 - G.LIFT * 0.5, { life: 0.3, angle: pl.aim, scale: 2.5 });
      hitSeg(pl, m, sx, sy, pl.x, pl.y, 40, m.dmg * pl.atkFor(m), '#cbe86c', 80, null, e => (stHas(e, 'mark') ? 1.5 : 1));
      G.Camera.kick(0.14);
      return true;
    }
  };

  // Ida y Vuelta: cruzas y vuelves (dos pasadas); al volver, el siguiente ataque de tu vínculo sale al momento.
  // Sanguijuela: te cura un 2 % por enemigo atravesado (hasta un 10 % por pasada).
  MECH['u-turn'] = {
    cast(pl, m) {
      if (ghost) { dash(pl, m); return true; }
      const sx = pl.x, sy = pl.y;
      m.uqPass = 0;
      dash(pl, m);
      leech(pl, m);
      addField({ tag: 'back', owner: pl, ghost: false, m, x: pl.x, y: pl.y, sx, sy, life: 0.4, pad: 200, done: false,
        upd(f) {
          const pl2 = f.owner;
          if (pl2.dead) return true;
          if (f.t < 0.16) return false;
          // De vuelta a donde estabas, golpeando otra vez el camino.
          const x0 = pl2.x, y0 = pl2.y;
          movePl(pl2, f.sx, f.sy);
          invul(pl2, 0.25);
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
    after(pl, e, m) { m.uqPass = (m.uqPass | 0) + 1; }
  };
  /** Sanguijuela: lo que cura la pasada (2 % por enemigo, hasta 5). */
  function leech(pl, m) {
    if (!m.evolved || !(m.uqPass > 0)) return;
    pl.heal(pl.maxHp * 0.02 * Math.min(5, m.uqPass));
    for (let i = 0; i < Math.min(5, m.uqPass); i++) G.FX.px(pl.x + G.U.rand(-30, 30), pl.y - G.U.rand(0, 30), '#ff4b5c', { vx: G.U.rand(-20, 20), vy: -40, life: 0.4, size: 2 });
  }

  // Pin Misil: las agujas se clavan; con cinco, estallan; Aguijón Letal: rematar con ellas sube tu ataque para toda la partida.
  MECH['pin-missile'] = {
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
  MECH['attack-order'] = {
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
      if (m.evolved && !mxFind(pl, 'hive', m.id)) {
        addField({ tag: 'hive', owner: pl, ghost, m, x: pl.x + G.U.rand(-20, 20), y: pl.y + G.U.rand(10, 20), life: 6 * pkOf(m).dur, pad: 40, next: 1,
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
          da(ctx, f, own) {
            ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 3, f.t * 6);
            G.VFX.draw(ctx, 'hive', 'gold', f.x, f.y - 10, { scale: 1.5 });
          },
          dg(ctx, f, own) { ctx.globalAlpha = 0.3 * own; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 10, 4, 0, 0, TAU); ctx.fill(); } });
      }
      return true;
    }
  };

  // ======== Lucha ========
  /** Baja tu defensa un rato (A Bocajarro): se devuelve sola. */
  function guardDown(pl, k, t) {
    if (pl.remote) return;
    pl.dmgReduce -= k;
    addField({ tag: 'guard', owner: pl, ghost: false, m: null, x: pl.x, y: pl.y, life: t, pad: 0, k,
      upd(f) { if (f.t >= f.life - 0.02 || f.owner.dead) { f.owner.dmgReduce += f.k; return true; } return false; } });
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, '−DEF', '#b0b8c8');
  }

  // Golpe Kárate: tajo seco en línea con mucho crítico (cada crítico, otro golpe ya);
  // A Bocajarro: 6 golpes rapidísimos al frente y después bajas la guardia.
  MECH['karate-chop'] = {
    cast(pl, m) {
      const col = colOf(m), L = m.radius * 1.12, dmg = m.dmg * pl.atkFor(m);
      if (m.evolved) {
        addField({ tag: 'cc', owner: pl, ghost, m, x: pl.x, y: pl.y, k: 0, life: 0.45, pad: 120, dmg,
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
    after(pl, e, m, d, crit) { if (crit) m.uqCrit = true; }
  };

  // Esfera Aural: atraviesa paredes y pega más cuanto más lejos va (hasta ×2,5);
  // Onda Certera: una esfera enorme y lenta que atrae a su paso y estalla en el blanco.
  MECH['aura-sphere'] = {
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
      if (!real(e) || big(e)) continue;
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
    if (!p.ghost && !p.owner.dead) { areaHit(p.owner, p.src, p.x, p.y, 70, p.dmg, { col: '#ff8a2e', knock: 120 }); G.Camera.kick(0.15); }
  }

  // Patada Giro: avanzas girando hacia el blanco (y cortas lo que prepara);
  // Patada Salto Alta: saltas al más grande y caes con un golpe ×4 (si no hay nadie, te haces daño).
  MECH['rolling-kick'] = {
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
    after(pl, e) { interrupt(e); },
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
      invul(pl, 0.5);
      addField({ tag: 'hjk', owner: pl, ghost: false, m, x: sx, y: sy, sx, sy, e: best, tx: best.x, ty: best.y, life: 0.5, pad: 360, done: false, dmg,
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
          const n = areaHit(pl2, f.m, pl2.x, pl2.y, 70, f.dmg * 1.5, { col: '#e04a2e', knock: 80, skip });
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
  MECH['vacuum-wave'] = {
    cast(pl, m) {
      const t = aimTarget(pl, 130), k = m.radius / 88;
      const d = t ? Math.min(70, G.U.dist(pl.x, pl.y, t.x, t.y)) : 70, L = rayLen(pl.x, pl.y, Math.cos(pl.aim), Math.sin(pl.aim), d);
      const px = pl.x + Math.cos(pl.aim) * L, py = pl.y + Math.sin(pl.aim) * L, R = 110 * k, dmg = m.dmg * pl.atkFor(m);
      G.FX.ring(px, py, R, 6, '#3a7cff', 0.22, 4);
      G.FX.sp('fistd', 'aura', pl.x + Math.cos(pl.aim) * 18, pl.y + Math.sin(pl.aim) * 18 - G.LIFT * 0.5, { life: 0.18, angle: pl.aim, scale: 1.5 });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; G.FX.sp('ring', 'aura', px + Math.cos(a) * R, py + Math.sin(a) * R * 0.6 - G.LIFT * 0.5, { vx: -Math.cos(a) * R * 4.5, vy: -Math.sin(a) * R * 2.7, life: 0.2 }); }
      for (const e of inCircle(px, py, R)) if (real(e) && !big(e)) stAdd(e, 'slide', 0.2, 0, { tx: px + G.U.rand(-10, 10), ty: py + G.U.rand(-8, 8), t: 0.2 });
      addField({ tag: 'vac', owner: pl, ghost, m, x: px, y: py, life: 0.3, pad: R + 20, done: false, dmg, r: 60 * k,
        upd(f) {
          if (f.done || f.t < 0.2) return false;
          f.done = true;
          if (G.Camera.sees(f.x, f.y, 40)) { G.FX.ring(f.x, f.y, 4, f.r, '#90d2ff', 0.25, 4); G.FX.burst(f.x, f.y - 8, '#90d2ff', 12, 170); G.Audio.sfx('thud'); }
          const n = areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg, { col: '#3a7cff', knock: 60 });
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
  MECH['dynamic-punch'] = {
    cast(pl, m) {
      const tg = ghost ? G.Projectiles.nearest(G.EnemyMgr.all(), pl.x + Math.cos(pl.aim) * 120, pl.y + Math.sin(pl.aim) * 120, 260) : spotFor(pl, m);
      if (!tg) return true;
      const ok = m.evolved || roll(pl, m, 3) < 0.6, r = m.radius, dmg = m.dmg * pl.atkFor(m);
      addField({ tag: 'dp', owner: pl, ghost, m, x: tg.x, y: tg.y, r, ok, life: 0.5, pad: r + 30, done: false, dmg,
        upd(f) {
          if (f.done || f.t < 0.45) return false;
          f.done = true;
          const mm = f.m;
          if (!f.ok) {
            G.FX.ring(f.x, f.y, 4, f.r * 0.5, '#e04a2e', 0.25, 2);
            G.FX.dmgText(f.x, f.y - 20, '¡Falló!', '#c9a0a8');
            areaHit(f.owner, mm, f.x, f.y, f.r * 0.5, f.dmg * 0.25, { col: '#e04a2e' });
            return false;
          }
          if (G.Camera.sees(f.x, f.y, 40)) { G.FX.ring(f.x, f.y, 4, f.r, '#e04a2e', 0.35, 5); G.FX.burst(f.x, f.y - 6, '#ff9c6c', 16, 190); G.Audio.sfx('break'); }
          if (!f.ghost) G.Camera.kick(0.2);
          areaHit(f.owner, mm, f.x, f.y, f.r, f.dmg, { col: '#e04a2e', knock: 60 });
          for (const e of inCircle(f.x, f.y, f.r)) stAdd(e, 'confuse', mm.stun || 2);
          if (mm.evolved) {
            addField({ tag: 'crater', owner: f.owner, ghost: f.ghost, m: mm, x: f.x, y: f.y, r: f.r, life: 2 * pkOf(mm).dur, pad: f.r + 20, tick: 0,
              upd(c, dt) { if ((c.tick -= dt) <= 0) { c.tick = 0.3; for (const e of inCircle(c.x, c.y, c.r)) stAdd(e, 'confuse', 1); } return false; },
              dg(ctx, c, own) {
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
        dg(ctx, f, own) {
          if (f.done) return;
          const k = G.U.clamp(f.t / 0.45, 0, 1);
          ctx.globalAlpha = (0.15 + 0.25 * k) * own; ctx.fillStyle = '#e04a2e';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * k, f.r * k * 0.6, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.8 * own; ctx.strokeStyle = '#e04a2e'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, TAU); ctx.stroke();
        },
        da(ctx, f, own) {
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
  MECH['cross-chop'] = {
    pp: m => ({ end: p => {
      const r = 22 * (p.r / 9);
      addField({ tag: 'mill', owner: p.owner, ghost: p.ghost, m, x: p.x, y: p.y, r, life: 0.4, pad: 40, log: new Map(), dmg: p.dmg * 0.45, a0: Math.atan2(p.vy, p.vx),
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
        da(ctx, f, own) {
          ctx.globalAlpha = own * Math.min(1, (f.life - f.t) * 8);
          for (let i = 0; i < 4; i++) { const a = f.a0 + f.t * 22 + i * Math.PI / 2; G.VFX.draw(ctx, 'crescent', 'fighting', f.x + Math.cos(a) * f.r * 0.5, f.y + Math.sin(a) * f.r * 0.5 - G.LIFT, { angle: a + Math.PI / 2 }); }
        } });
    } }),
    cast(pl, m) {
      cross(pl, m);
      if (!m.evolved || mxFind(pl, 'holy', m.id)) return true;
      if ((m.uqHoly = (m.uqHoly || 0) - (m.cd || 0.9)) > 0) return true;
      m.uqHoly = 4;
      const dmg = m.dmg * pl.atkFor(m), R = 80 * Math.sqrt(pkOf(m).area), swords = [];
      for (let i = 0; i < 4; i++) { const a = pl.aim + i * Math.PI / 2 + 0.785; swords.push({ x: pl.x + Math.cos(a) * R, y: pl.y + Math.sin(a) * R * 0.7 }); }
      addField({ tag: 'holy', owner: pl, ghost, m, x: pl.x, y: pl.y, R, swords, life: 4 * pkOf(m).dur, pad: R + 40, tick: 0, landed: false, dmg,
        upd(f, dt) {
          if (!f.landed && f.t >= 0.2) {
            f.landed = true;
            for (const s of f.swords) {
              if (G.Camera.sees(s.x, s.y, 30)) { G.FX.burst(s.x, s.y - 4, '#ffe172', 8, 120); G.FX.ring(s.x, s.y, 3, 22, '#ffe172', 0.25, 3); }
              areaHit(f.owner, f.m, s.x, s.y, 28, f.dmg, { col: '#ffe172', knock: 40 });
            }
            if (G.Camera.sees(f.x, f.y, 80)) G.Audio.sfx('break');
          }
          if ((f.tick -= dt) <= 0) { f.tick = 0.25; for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.R)) if (real(e)) stAdd(e, 'sacred', 0.35); }
          return false;
        },
        dg(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 2, f.t * 4), now = performance.now() / 1000;
          ctx.globalAlpha = 0.12 * a * own; ctx.fillStyle = '#ffe172';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.R, f.R * 0.7, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.6 * a * own; ctx.strokeStyle = '#ffe172'; ctx.lineWidth = 2; ctx.setLineDash(DASH); ctx.lineDashOffset = -now * 20;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.R, f.R * 0.7, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        },
        da(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 2);
          ctx.globalAlpha = own * a;
          for (const s of f.swords) { const k = Math.min(1, f.t / 0.2); G.VFX.draw(ctx, 'swordv', 'gold', s.x, s.y - 14 - (1 - k) * 120, { scale: 1.5 }); }
        } });
      return true;
    }
  };

  // Gancho Alto: la columna mantiene en el aire a los de dentro y al acabar caen con daño;
  // Puño Certero: cargas 0,7 s; si no te golpean fuerte, un puñetazo devastador en línea; si te golpean, recuperas la mitad de la recarga.
  MECH['sky-uppercut'] = {
    field(f, dt) {
      if (f.kind !== 'column') return;
      const hw = f.w / 2, hh = f.h / 2;
      if (!f.jug) f.jug = new Map();
      if (f.t < f.hl) {
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, Math.hypot(hw, hh))) {
          if (e.dead || Math.abs(e.x - f.x) > hw + e.r || Math.abs(e.y - f.y) > hh || big(e)) continue;
          if (stAdd(e, 'air', Math.max(0.05, f.hl - f.t + 0.05), 0, { h: 30 }) && !f.jug.has(e.id)) f.jug.set(e.id, e);
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
      addField({ tag: 'focus', owner: pl, ghost, m, x: pl.x, y: pl.y, life: 0.85, pad: 200, big0: pl.bigHits || 0, done: false, dmg,
        upd(f) {
          const pl2 = f.owner;
          f.x = pl2.x; f.y = pl2.y;
          if (pl2.dead) return true;
          if (f.done) return false;
          if (!f.ghost && (pl2.bigHits || 0) > f.big0) {
            // Te han golpeado fuerte (un golpe de un 20 % de tu vida o más; 29-10-2026: antes bastaba con perder un 8 %
            // en total, y en plena horda, con los toques, casi nunca salía): se cancela y recuperas la mitad de la recarga.
            f.done = true;
            f.m.t = Math.min(f.m.t, cd * 0.5);
            G.FX.dmgText(pl2.x, pl2.y - pl2.bodyH - 10, '¡Cancelado!', '#c9a0a8');
            return true;
          }
          if (Math.random() < 0.7) { const a = Math.random() * TAU; G.FX.px(pl2.x + Math.cos(a) * 34, pl2.y + Math.sin(a) * 24 - G.LIFT * 0.6, '#ffffff', { vx: -Math.cos(a) * 110, vy: -Math.sin(a) * 80, life: 0.3, size: 2 }); }
          if (f.t < 0.7) return false;
          f.done = true;
          const a = pl2.aim, L = rayLen(pl2.x, pl2.y, Math.cos(a), Math.sin(a), 140), ex = pl2.x + Math.cos(a) * L, ey = pl2.y + Math.sin(a) * L;
          G.FX.beam(pl2.x, pl2.y - G.LIFT, a, L, 30, '#ffffff', { pal: 'fighting', beam: 'fistd' });
          G.FX.sp('fistd', 'fighting', ex, ey - G.LIFT, { life: 0.25, angle: a, scale: 3 });
          G.FX.ring(ex, ey, 4, 40, '#ffffff', 0.3, 4);
          if (!f.ghost) { hitSeg(pl2, f.m, pl2.x, pl2.y, ex, ey, 44, f.dmg * 5, '#ffffff', 160); G.Camera.kick(0.3); }
          G.Audio.sfx('break');
          return false;
        },
        dg(ctx, f, own) {
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
  /* ---- fin de los ataques únicos de Lucha, Veneno, Tierra, Volador, Psíquico, Bicho ---- */

  /* ===================================================================================
   * -- ataques únicos: Roca, Fantasma, Dragón, Siniestro, Acero, Hada (26-10-2026) --
   * Cada ataque de estos seis tipos hace algo suyo (y su evolución lo cambia de verdad):
   * MECH[id], con el motor común. Topes: piedras 6, trampas 10, flores 30... por jugador;
   * enemigos arrastrados 3 por tornado.
   * =================================================================================== */
  // ==== mech: roca ====
  // Lanzarrocas → Roca Afilada: la piedra se queda de barricada; evolucionada, estalla en esquirlas.
  MECH['rock-throw'] = {
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
                        pad: 40, upd: stoneTk3, dg: stoneDg3, da: stoneDa3 });
    mxTrim(pl, 'stone', 6);
    if (sees(x, y)) G.Audio.sfx('thud');
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
        if (sees(f.x, f.y)) { G.FX.burst(f.x, f.y - 6, '#c6b08a', 10, 160); G.Audio.sfx('break'); }
      } else if (sees(f.x, f.y)) G.FX.burst(f.x, f.y - 4, '#8e7a5a', 6, 70);
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
  MECH['rock-slide'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], n = Math.max(1, m.count | 0);
      const near = G.EnemyMgr.queryCircle(pl.x, pl.y, reach(m)).filter(e => !e.dead);
      for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = near[i]; near[i] = near[j]; near[j] = t; }
      const fall = 0.5 / pkOf(m).pspd, dmg = m.dmg * pl.atkFor(m);
      for (let i = 0; i < n; i++) {
        const e = near[i];
        add3(pl, 'slide', { m, col, vis: G.VFX.forMove(m), t: -i * 0.09, fall, r: m.radius, dmg, pad: 200,
                            x: e ? e.x + G.U.rand(-8, 8) : pl.x + G.U.rand(-140, 140), y: e ? e.y + G.U.rand(-6, 6) : pl.y + G.U.rand(-110, 110),
                            upd: slideTk3, dg: slideDg3, da: slideDa3 });
      }
    },
    afterP(pl, e, m, p) { if (p.roll3) interrupt(e); }
  };
  function slideTk3(f) {
    if (f.t < f.fall) return false;
    const m = f.m, pl = f.owner;
    if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4); G.FX.burst(f.x, f.y - 6, f.col, 12, 170); G.Audio.sfx('break'); if (!f.ghost) G.Camera.kick(0.1); }
    areaHit(pl, m, f.x, f.y, f.r, f.dmg, { ghost: f.ghost, knock: m.knock || 0, each: interrupt });
    if (m.trap) {
      add3(pl, 'srock', { ghost: f.ghost, m, x: f.x, y: f.y, r: f.r * 0.8, dur: m.trap, tick: 0.1, log: new Map(), dmg: f.dmg * 0.45, pad: 40,
                          upd: srockTk3, dg: srockDg3 });
      mxTrim(pl, 'srock', 10);
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
      if (sees(e.x, e.y, 10)) G.FX.sp('spike', 'rock', e.x, e.y - 6, { vy: -60, life: 0.25 });
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
  MECH['rock-tomb'] = {
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
                       inside: null, head: m.head ? 1 : 0, pad: R + 40, upd: tombTk3, dg: tombDg3, da: tombDa3 });
    mxTrim(pl, 'tomb', 4);
  }
  function tombTk3(f) {
    if (f.t < f.delay) return false;
    const m = f.m, pl = f.owner;
    if (!f.inside) {
      f.inside = new Set();
      if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.R, f.col, 0.35, 4); G.FX.burst(f.x, f.y - 6, f.col, 14, 170); G.Audio.sfx('break'); }
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.R)) {
        if (e.dead) continue;
        f.inside.add(e.id);
        if (f.ghost) continue;
        hit(pl, e, f.dmg, f.col, e.x - f.x, e.y - f.y, 0, m);
        if (!e.dead) { e.applyStun((m.stun || 0.5) * (big(e) ? 0.35 : 1)); e.applySlow(m.slow || 0.4, m.wall || 3); }
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
        invul(pl, 0.4);
      }
      areaHit(pl, s, f.x, f.y, f.R, f.dmg * 0.8, { knock: 140 });
      G.Camera.kick(0.25);
    }
    for (const w of f.rocks) for (const o of [-0.25, 0.25]) {
      const a = w.a + o;
      shot3(pl, s, { x: w.x, y: w.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, dmg: f.dmg * 0.35, r: 7, life: 0.4, pierce: 1, vis: v, ghost: f.ghost, knock: 40 });
    }
    if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, f.R * 0.5, f.R * 2, f.col, 0.4, 5); G.FX.burst(f.x, f.y - 8, f.col, 18, 220); G.Audio.sfx('break'); }
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
  MECH['ancient-power'] = {
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
      if (any && sees(pl.x, pl.y)) G.Audio.sfx('shake');
    },
    afterP(pl, e, m, p) {
      if (!p.launched3 || !m.gems) return;
      areaHit(pl, sub3(m), e.x, e.y, 36, p.dmg * 0.4);
      pl.addBuff('def', 0.04, 5, 5, 'ancient-power');
      if (sees(e.x, e.y)) for (let i = 0; i < 5; i++) {
        const a = i * 1.2566;
        G.FX.sp('gem', 'diamond', e.x, e.y - e.bodyH * 0.5, { vx: Math.cos(a) * 120, vy: Math.sin(a) * 90, life: 0.3, scale: 0.6 });
      }
    }
  };

  // Joya de Luz → Rayo Meteórico: la gema se parte en dos al golpear; evolucionada, las ramas que fallan vuelven y cargan un rayo.
  MECH['power-gem'] = {
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
    if (sees(e.x, e.y, 10)) G.FX.spark(e.x, e.y - G.LIFT, '#ff9ab8', Math.cos(a), Math.sin(a), 4);
  }
  function gemEnd3(p) {
    const m = p.src;
    if (!m || !m.meteor || p.hit3 || !p.owner) return;
    add3(p.owner, 'gemback', { ghost: p.ghost, m, x: p.x, y: p.y, pad: 30, upd: gemBackTk3, da: gemBackDa3 });
    mxTrim(p.owner, 'gemback', 8);
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
  MECH['rock-blast'] = {
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
    if (sees(p.x, p.y, 20)) G.FX.burst(p.x, p.y - 2, '#aa7c3c', 4, 60);
    if (p.b3) return true;
    p.b3 = 1; p.vy = -Math.abs(p.vy) * 0.32; p.vx *= 0.55; p.y = p.land3 - 1;
    if (sees(p.x, p.y, 20)) G.Audio.sfx('thud');
    const m = p.src;
    if (m && m.axes) {
      const s = sub3(m), v = visAs(m, 'rock', { proj: 'axe' });
      for (const dir of [-1, 1]) G.Projectiles.spawn({ x: p.x, y: p.land3, vx: dir * 220, vy: 0, dmg: p.dmg * 0.6, r: 8, life: 0.4, pierce: 3,
                                                       color: p.color, hits: new Set(), vis: v, ghost: p.ghost, owner: p.owner, src: s, mtype: p.mtype, mcat: p.mcat, knock: 50 });
    }
    return false;
  }

  // Rodar → Romperrocas: cada golpe seguido dobla el daño (hasta ×8); evolucionada, a ×8 estalla y rompe rocas.
  MECH['rollout'] = {
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
    if (sees(p.x, p.y, 20) && p.combo3 >= 4) G.FX.dmgText(p.x, p.y - G.LIFT - 14, '×' + p.combo3, p.combo3 >= 8 ? '#ff7a3d' : '#ffb070');
  }
  function rollUpd3(p) {
    if (p.combo3 > p.c0 && p.t - p.last3 > 1) { p.combo3 = p.c0; p.vis = rollVis3(p.src, p.c0); p.ds = 0; }
    return false;
  }
  /** Romperrocas: estalla, rompe las rocas del mapa cercanas y sueltan metralla. */
  function crush3(p, m, g) {
    const pl = p.owner, s = sub3(m), R = m.crush || 80, v = visAs(m, 'rock', { proj: 'rock' });
    if (sees(p.x, p.y)) { G.FX.ring(p.x, p.y, 6, R, '#aa7c3c', 0.4, 5); G.FX.burst(p.x, p.y - 8, '#d85a24', 20, 220); G.Audio.sfx('break'); }
    if (g) return;
    areaHit(pl, s, p.x, p.y, R, p.dmg * 2, { knock: 140 });
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
  MECH['lick'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], dmg = m.dmg * pl.atkFor(m);
      if (m.count > 0) { shadowFists3(pl, m, dmg, col); return; }
      const vis = G.VFX.forMove(m), len = m.radius * 1.7, dirs = m.arc > 6 ? 4 : 1;
      for (let i = 0; i < dirs; i++) {
        const a = pl.aim + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
        G.FX.beam(pl.x + ca * 6, pl.y - G.LIFT * 0.6 + sa * 6, a, len, 9, col, vis);
        if (ghost) continue;
        segEach(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, 18, e => { hit(pl, e, dmg, col, ca, sa, 0, m); if (!e.dead) stAdd(e, 'para', m.para || 2); });
        segProps(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, 18, dmg, col);
      }
      if (!ghost) G.Camera.kick(0.05);
    }
  };
  function shadowFists3(pl, m, dmg, col) {
    const list = nearestN(pl.x, pl.y, 240, Math.max(1, m.count | 0)), R = 40 * Math.max(1, m.radius / 72);
    for (const e of list) {
      if (sees(e.x, e.y)) {
        G.FX.sp('fist', 'umbra', e.x, e.y + 4, { vy: -170, life: 0.3, scale: 1.5, fade: false });
        G.FX.ring(e.x, e.y, 4, R + e.r, '#3c2468', 0.25, 3);
      }
      if (ghost) continue;
      // El puño sale bajo él y la sombra salpica a los de al lado.
      hit(pl, e, dmg, col, 0, -1, 0, m);
      if (!e.dead) stAdd(e, 'para', 1);
      for (const o of G.EnemyMgr.queryCircle(e.x, e.y, R)) if (o !== e && !o.dead) hit(pl, o, dmg * 0.7, col, o.x - e.x, o.y - e.y, 0, sub3(m));
    }
    if (list.length && sees(pl.x, pl.y)) G.FX.ring(pl.x, pl.y, pl.r * 0.5, pl.r * 2, '#3c2468', 0.25, 2);
  }

  // Bola Sombra → Golpe Fantasma: crece con cada enemigo que atraviesa; evolucionada, salta dentro del blanco y estalla.
  MECH['shadow-ball'] = {
    // (Evolucionada no golpea por el camino: sólo el estallido dentro del blanco.)
    cast(pl, m) { tagged3(() => fireProjectiles(pl, m), p => { p.r0 = p.r; if (m.phase) { p.sx3 = p.x; p.sy3 = p.y; p.upd3 = phaseUpd3; p.only3 = -1; p.alpha = 0.8; } }); },
    afterP(pl, e, m, p) { grow3(p); if (Math.random() < 0.15) stAdd(e, 'vuln', 5, 1); },
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
    if (sees(p.x, p.y)) G.FX.ring(p.x, p.y - G.LIFT, p.r, 2, '#9e8aea', 0.2, 2);
    if (sees(tg.x, tg.y)) {
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
  MECH['hex'] = {
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
          const cursed = stCount(cur) > 0;
          hit(pl, cur, m.dmg * pl.atkFor(m) * k * (cursed ? m.hex || 1.7 : 1), col, tx - fx, ty - fy, 0, m);
          if (!cur.dead) { stExtend(cur, 1); stAdd(cur, 'curse', 3); got.push(cur); }
        }
        k *= 0.88; fx = tx; fy = ty;
        // El primer salto contagia a cualquiera; después, sólo a los que ya sufren algo.
        let best = null, bd = m.radius * m.radius;
        for (const e of G.EnemyMgr.queryCircle(cur.x, cur.y, m.radius)) {
          if (done.has(e.id) || e.dead || (i > 0 && !stCount(e))) continue;
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
    const n = Math.min(3, stCount(e), left), s = sub3(m), v = visAs(m, 'umbra', { proj: 'gobj' });
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
  MECH['shadow-sneak'] = {
    reach: m => (m.range || 200) + 20,
    cast(pl, m) {
      const R = (m.range || 200) + 20, col = G.U.TYPE_COLOR[m.type], dmg = m.dmg * pl.atkFor(m);
      const t = pl.target;
      const first = t && !t.dead && (t.x - pl.x) ** 2 + (t.y - pl.y) ** 2 <= R * R ? t : G.Projectiles.nearest(G.EnemyMgr.all(), pl.x, pl.y, R);
      if (!first) return;
      const list = [first].concat(nearestN(pl.x, pl.y, R, Math.max(1, m.count | 0) - 1, first));
      for (const e of list) {
        add3(pl, 'sneak', { x: pl.x, y: pl.y, x1: e.x, y1: e.y, dur: 0.35, pad: R, upd: f => f.t >= f.dur, dg: sneakDg3 });
        if (m.claws) { claws3(pl, m, e, dmg, col); continue; }
        if (!ghost) { hit(pl, e, dmg, col, e.x - pl.x, e.y - pl.y, 0, m); if (!e.dead) stAdd(e, 'root', 0.6); }
        else if (real(e)) stAdd(e, 'root', 0.6);
      }
      if (sees(pl.x, pl.y)) G.Audio.sfx('grass');
    }
  };
  function claws3(pl, m, e, dmg, col) {
    if (sees(e.x, e.y)) for (let i = 0; i < 3; i++) {
      G.FX.sp('claw', 'umbra', e.x + (i - 1) * 9, e.y - e.bodyH * 0.5 + (i - 1) * 3, { life: 0.25, scale: 1.5, angle: -0.6 + i * 0.25 });
    }
    if (ghost) { if (real(e)) stAdd(e, 'root', 0.6); return; }
    for (const o of G.EnemyMgr.queryCircle(e.x, e.y, 50)) {
      if (o.dead) continue;
      crit3f = Math.random() < 0.3;
      try { hit(pl, o, dmg, col, o.x - pl.x, o.y - pl.y, 0, m); } finally { crit3f = false; }
    }
    if (!e.dead) stAdd(e, 'root', 0.6);
  }
  function sneakDg3(ctx, f, own) {
    const a = Math.min(1, (f.dur - f.t) * 5) * own;
    ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = '#120a20'; ctx.lineCap = 'round'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x1, f.y1); ctx.stroke();
    ctx.lineCap = 'butt';
    ell3(ctx, f.x1, f.y1, 14, 6, '#1e1030', 0.6 * a);
  }

  // Viento Aciago → Golpe Umbrío: hace girar a los enemigos (no los atrae) y los marea; evolucionado, sales de él golpeando.
  MECH['ominous-wind'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], tg = spotFor(pl, m);
      const x = tg ? tg.x : pl.x + Math.cos(pl.aim) * 120, y = tg ? tg.y : pl.y + Math.sin(pl.aim) * 100;
      const f = add3(pl, 'owind', { m, col, vis: G.VFX.forMove(m), x, y, r: m.radius, dur: m.dur || 2.6, tick: 0.15, dmg: m.dmg * pl.atkFor(m),
                                    spin: m.pull || 160, sneak: m.sneak ? 1 : 0, pad: m.radius + 30, upd: owindTk3, dg: owindDg3 });
      mxTrim(pl, 'owind', 2);
      G.FX.ring(x, y, m.radius, 6, col, 0.4, 3);
      if (f.sneak && !ghost && !pl.dead) {
        if ((x - pl.x) ** 2 + (y - pl.y) ** 2 > 340 * 340) f.sneak = 0;
        else { P3(pl).hide = 1; invul(pl, 1); G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#33256a', 12, 120); }
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
      areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg, { ghost: f.ghost, each: e => { if (Math.random() < 0.2) stAdd(e, 'confuse', 1.5); } });
    }
    if (Math.random() < dt * 14 && sees(f.x, f.y)) {
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
    if (sees(f.x, f.y)) {
      G.FX.ring(f.x, f.y, 6, R, '#7a52c0', 0.4, 5); G.FX.burst(f.x, f.y - 10, '#33256a', 20, 220);
      G.FX.sp('shadow', 'umbra', f.x, f.y - 14, { life: 0.35, scale: 3 });
      G.Audio.sfx('break');
    }
    if (f.ghost || pl.dead) return;
    if (G.World.isFree(f.x, f.y, (pl.wr || pl.r) * 0.8, true)) { pl.x = f.x; pl.y = f.y; G.World.collide(pl); }
    areaHit(pl, sub3(f.m), f.x, f.y, R, f.dmg * 2, { knock: 360 });
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
  MECH['last-respects'] = {
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
    if (sees(e.x, e.y)) { G.FX.ring(e.x, e.y, 4, 26, '#9e8aea', 0.35, 3); G.FX.burst(e.x, e.y - 10, '#5c48aa', 10, 120); }
  }

  // Orbes Espectro → Rayo Umbrío: caen en corona sobre el que más vida tiene; evolucionados, dejan grietas que disparan.
  MECH['astral-barrage'] = {
    cast(pl, m) {
      let tg = null, best = -1;
      for (const e of G.EnemyMgr.all()) {
        if (e.dead || Math.abs(e.x - pl.x) > RAIN_W || Math.abs(e.y - pl.y) > RAIN_H) continue;
        if (e.hp > best) { best = e.hp; tg = e; }
      }
      if (!tg) { shower(pl, m); return; }
      add3(pl, 'corona', { m, vis: G.VFX.forMove(m), e: tg, x: tg.x, y: tg.y, n: Math.max(1, m.count | 0), i: 0, next: 0, a0: Math.random() * 6.2832,
                           dmg: m.dmg * pl.atkFor(m), pad: 300, upd: coronaTk3 });
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
    add3(pl, 'crack', { ghost: g, m, x, y, dur: 0.8, at: 0.5, done: false, dmg: dmg * 0.8, pad: 40, upd: crackTk3, dg: crackDg3 });
    mxTrim(pl, 'crack', 16);
  }
  function crackTk3(f) {
    if (!f.done && f.t >= f.at) {
      f.done = true;
      if (sees(f.x, f.y)) { G.FX.beam(f.x, f.y - 2, -Math.PI / 2, 74, 10, '#3c2468', { pal: 'umbra' }); G.FX.burst(f.x, f.y - 6, '#5a6aff', 6, 90); }
      if (!f.ghost) areaHit(f.owner, sub3(f.m), f.x, f.y, 24, f.dmg);
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
  MECH['dragon-rage'] = {
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
                            r: 42, dmg, pad: 200, upd: cometTk3, dg: slideDg3, da: cometDa3 });
      }
      if (!ghost) pl.addBuff('satk', -0.3, 3, 1, 'draco-meteor');        // y luego te cansas
    }
  };
  function cometTk3(f) {
    if (f.t < f.fall) return false;
    if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4); G.FX.burst(f.x, f.y - 6, f.col, 12, 170); G.Audio.sfx('break'); }
    areaHit(f.owner, sub3(f.m), f.x, f.y, f.r, f.dmg, { ghost: f.ghost, knock: 60 });
    return true;
  }
  function cometDa3(ctx, f) {
    if (f.t <= 0) return;
    const k = G.U.clamp(f.t / f.fall, 0, 1), x = f.x + (1 - k) * 60, y = f.y - (1 - k) * 200 - 6;
    G.VFX.draw(ctx, 'fire', 'dragonhot', x, y, { scale: 2, angle: Math.atan2(200, -60), frame: Math.floor(f.t * 12) });
    if (Math.random() < 0.5) G.FX.px(x + G.U.rand(-3, 3), y, '#e0c8ff', { vx: 40, vy: -60, life: 0.3 });
  }

  // Danza Dragón → Estruendo Escama: ataque y velocidad a la vez; evolucionada, todo y un rugido que asusta.
  MECH['dragon-dance'] = {
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
    for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 150)) if (!e.dead) stAdd(e, 'fear', 1.2, [pl.x, pl.y]);
  }

  // Dragoaliento → Pulso Dragón: abanico que atraviesa y pega más de cerca (×1,3 → ×0,6), a veces paraliza;
  // evolucionado, una cabeza de dragón que avanza y muerde.
  MECH['dragon-breath'] = {
    cast(pl, m) {
      if (m.pulse) { dragonPulse3(pl, m); return; }
      tagged3(() => cone(pl, m), p => { p.sx3 = p.x; p.sy3 = p.y; p.rng3 = m.speed * m.life; });
    },
    k(pl, e, m, d, p) {
      if (!p || !p.rng3) return 1;
      return 1.3 - 0.7 * Math.min(1, Math.hypot(p.x - p.sx3, p.y - p.sy3) / p.rng3);
    },
    afterP(pl, e) { if (Math.random() < 0.3) stAdd(e, 'para', 1.5); }
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
    if (sees(p.x, p.y)) {
      G.FX.sp('jaws', 'dragon', p.x, p.y - G.LIFT, { life: 0.3, scale: 2.5, frameRate: 7, fade: false });
      G.FX.ring(p.x, p.y, 4, 60, '#6b58ff', 0.3, 4);
      G.Audio.sfx('break');
    }
    if (!p.ghost && p.src) areaHit(p.owner, sub3(p.src), p.x, p.y, 60, p.bite3 || p.dmg, { knock: 80, each: e => { if (Math.random() < 0.3) stAdd(e, 'para', 1.5); } });
  }

  // Garra Dragón → Carga Dragón: el zarpazo lanza tres cortes; evolucionada, embestida en semicírculo hasta detrás del blanco.
  MECH['dragon-claw'] = {
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
      segEach(px, py, nx, ny, 44, e => {
        if (done.has(e.id)) return;
        done.add(e.id);
        hit(pl, e, dmg, col, e.x - t.x, e.y - t.y, m.knock || 0, m);
      });
      segProps(px, py, nx, ny, 44, dmg, col);
      G.FX.sp('claw', 'dragon', nx, ny - G.LIFT * 0.5, { life: 0.25, angle: a + side * Math.PI / 2 });
      px = nx; py = ny;
    }
    pl.x = px; pl.y = py;
    G.World.collide(pl);
    invul(pl, 0.35);
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
  MECH['outrage'] = {
    cast(pl, m) {
      const dur = 1.5 + 0.25 * (m.count | 0);
      // Si sigue en el frenesí, se alarga (sin volver a empezar pequeño).
      for (const f of fields) if (f.tag === 'frenzy' && f.owner === pl && !f.gone && f.t < f.dur) { f.dur = f.t + dur; f.m = m; f.dmg = m.dmg * pl.atkFor(m); return; }
      add3(pl, 'frenzy', { m, col: G.U.TYPE_COLOR[m.type], vis: G.VFX.forMove(m), dur, next: 0, a: pl.aim,
                           dmg: m.dmg * pl.atkFor(m), R: 50, pad: 140, upd: frenzyTk3, dg: frenzyDg3 });
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
    const list = nearestN(pl.x, pl.y, 300, m.darts | 0), v = visAs(m, 'dreepy', { proj: 'dreepy' }), sp = 400;
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
  MECH['scale-shot'] = {
    cast(pl, m) {
      const st = ST3(m);
      st.hits = new Set();
      knife(pl, m);
      const b = fields[fields.length - 1];
      add3(pl, 'sclend', { m, set: st.hits, dur: (b && b.kind === 'burst' ? b.every * b.n : 0.1) + 0.25, pad: 40, upd: sclEndTk3 });
    },
    afterP(pl, e, m) { const st = ST3(m); if (st.hits && st.hits.size < 24) st.hits.add(e); }
  };
  function sclEndTk3(f) {
    if (f.t < f.dur) return false;
    const pl = f.owner, m = f.m;
    if (f.ghost || pl.dead) return true;
    pl.addBuff('spd', 0.06, 3, 5, 'scale-shot');
    pl.addBuff('def', -0.05, 3, 5, 'scale-shot-def');
    if (sees(pl.x, pl.y)) for (let i = 0; i < 2; i++) G.FX.sp('scale', 'dragon', pl.x + G.U.rand(-8, 8), pl.y - pl.bodyH * 0.6, { vy: 40, vx: G.U.rand(-30, 30), life: 0.5, grav: 200 });
    if (m.ring3) {
      const s = sub3(m), dmg = m.dmg * pl.atkFor(m) * 0.4;
      for (const e of f.set) {
        if (e.dead) continue;
        if (sees(e.x, e.y)) G.FX.ring(e.x, e.y, 4, m.ring3, '#ffe070', 0.3, 3);
        areaHit(pl, s, e.x, e.y, m.ring3, dmg);
      }
      if (f.set.size && sees(pl.x, pl.y)) G.Audio.sfx('coin');
    }
    return true;
  }

  // Ciclón → Dracoenergía: los tornados se llevan a los pequeños (×1,5 a los voladores); evolucionados, rastro y choque.
  MECH['twister'] = {
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
                                upd: dtrailTk3, dg: dtrailDg3 });
      mxTrim(p.owner, 'dtrail', 24);
    }
    if (p.t < 0.25 || p.boom3) return false;
    for (const q of tw3) {
      if (q === p || q.boom3 || q.owner !== p.owner || q.t < 0.25 || q.t >= q.life) continue;
      if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 > (p.r + q.r + 4) ** 2) continue;
      p.boom3 = q.boom3 = 1; q.t = q.life;
      const x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
      if (sees(x, y)) { G.FX.ring(x, y, 6, 70, '#c8e85a', 0.4, 5); G.FX.burst(x, y - 8, '#a490ff', 16, 200); G.Audio.sfx('break'); }
      if (!p.ghost) areaHit(p.owner, sub3(m), x, y, 70, p.dmg, { knock: 120 });
      return true;
    }
    return false;
  }
  function dtrailTk3(f, dt) {
    if ((f.tick -= dt) <= 0) { f.tick = 0.33; if (!f.ghost) areaHit(f.owner, sub3(f.m), f.x, f.y, f.r, f.dmg); }
    return f.t >= f.dur;
  }
  function dtrailDg3(ctx, f, own) { ell3(ctx, f.x, f.y, f.r, f.r * 0.55, '#c8e85a', 0.22 * Math.min(1, (f.dur - f.t) * 2) * own); }

  // ==== mech: hada ====
  // Viento Feérico → Fuerza Lunar: aparta y te trae la experiencia; evolucionado, una luna dispara a los fuertes.
  MECH['fairy-wind'] = {
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
    for (const o of fields) if (o.tag === 'moon' && o.owner === pl && !o.gone) { f = o; break; }
    if (!f) f = add3(pl, 'moon', { fire: 0.3, pad: 320, upd: moonTk3, da: moonDa3 });
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
    if (!f.ghost) { hit(pl, tg, f.dmg, '#fff0fa', tx - mx, ty - my, 0, sub3(f.m)); if (!tg.dead) stAdd(tg, 'atkdown', 4, 0.3); }
    return false;
  }
  function moonDa3(ctx, f, own, now) {
    const pl = f.owner, a = Math.min(1, (f.dur - f.t) * 3, f.t * 4);
    G.VFX.draw(ctx, 'moon', 'lunar', pl.x, pl.y - pl.bodyH - 34 + Math.sin(now * 2) * 2, { scale: 1.5, alpha: a, frame: (now * 3) | 0 });
  }

  // Brillo Mágico → Campo de Niebla: ×1,6 a los que te miran, ×0,7 a los que te dan la espalda; evolucionado, niebla que protege.
  MECH['dazzling-gleam'] = {
    cast(pl, m) {
      aura(pl, m);
      if (sees(pl.x, pl.y)) for (let i = 0; i < 4; i++) {
        const a = i * 1.5708 + 0.78;
        G.FX.sp('star', 'fairy', pl.x + Math.cos(a) * m.radius * 0.5, pl.y + Math.sin(a) * m.radius * 0.4 - G.LIFT * 0.5, { life: 0.2, scale: 1.5 });
      }
      if (m.mist) mist3(pl, m);
    },
    k(pl, e) { const f = facing3(e, pl); return f > 0 ? 1.6 : f < 0 ? 0.7 : 1; }
  };
  function mist3(pl, m) {
    let f = null;
    for (const o of fields) if (o.tag === 'mist' && o.owner === pl && !o.gone) { f = o; break; }
    if (!f) f = add3(pl, 'mist', { upd: mistTk3, dg: mistDg3 });
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
    if (Math.random() < 0.15 && sees(f.x, f.y)) {
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
  MECH['draining-kiss'] = {
    afterP(pl, e, m, p, d) {
      if (!e.dead) stAdd(e, 'infat', 1.5);
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
  MECH['play-rough'] = {
    cast(pl, m) {
      const t = pl.target, near = t && !t.dead && (t.x - pl.x) ** 2 + (t.y - pl.y) ** 2 <= (m.radius + 60) ** 2;
      const d = near ? Math.min(G.U.dist(pl.x, pl.y, t.x, t.y), m.radius) : m.radius * 0.8, n = Math.max(1, m.count | 0);
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), v = m.roll ? m.roll / 0.8 : 0;
      add3(pl, 'brawl', { m, col: G.U.TYPE_COLOR[m.type], x: pl.x + ca * d, y: pl.y + sa * d, r: m.radius * 0.9, dur: 0.8, n, every: 0.8 / n, next: 0.04,
                          dmg: m.dmg * pl.atkFor(m) * 0.4, vx: ca * v, vy: sa * v, vis: m.roll ? visAs(m, 'fairy', { proj: 'cloud' }) : visAs(m, 'normal', { proj: 'cloud' }),
                          pad: 80, upd: brawlTk3, da: brawlDa3 });
      mxTrim(pl, 'brawl', 3);
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
      if (sees(f.x, f.y)) {
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
  MECH['disarming-voice'] = {
    cast(pl, m) {
      const st = ST3(m); st.cx = pl.x; st.cy = pl.y;
      shove(pl, m);
      if (sees(pl.x, pl.y)) for (let i = 0; i < 6; i++) {
        const a = i * 1.0472;
        G.FX.sp('heart', 'fairy', pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.8 - G.LIFT * 0.5,
                { vx: Math.cos(a) * m.radius * 2.2, vy: Math.sin(a) * m.radius * 1.8, life: 0.35 });
      }
      // (El de un compañero: en el anfitrión, los de verdad también se embelesan.)
      if (ghost) for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) if (real(e)) charm3(e, m, pl.x, pl.y);
    },
    after(pl, e, m) { if (!e.dead) { const st = ST3(m); charm3(e, m, st.cx, st.cy); } }
  };
  function charm3(e, m, x, y) {
    stAdd(e, 'charm', 1.5, [x, y]);
    if (m.disarm) stAdd(e, 'atkdown', 3, m.disarm);
  }

  // Cañón Floral → Luz Aniquiladora: la aguja planta flores que estallan al segundo; evolucionado, disparan un rayo hacia ti.
  MECH['fleur-cannon'] = {
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
                                  r: 26 * (pkOf(m).area || 1), dmg: f.dmg * 0.7, pad: 40, upd: flowerTk3, dg: flowerDg3 });
      }
      mxTrim(f.owner, 'flower', 30);
    }
  }
  function flowerTk3(f) {
    if (!f.done && f.t >= f.at) {
      f.done = true;
      const pl = f.owner, m = f.m;
      if (sees(f.x, f.y)) {
        G.FX.ring(f.x, f.y, 4, f.r, '#ff6a9a', 0.3, 3);
        for (let i = 0; i < 5; i++) { const a = i * 1.2566; G.FX.sp('petal', 'rose', f.x, f.y - 6, { vx: Math.cos(a) * 110, vy: Math.sin(a) * 80 - 30, life: 0.35, spin: 8 }); }
        G.Audio.sfx('thud');
      }
      if (!f.ghost) areaHit(pl, sub3(m), f.x, f.y, f.r, f.dmg);
      if (m.annihil && !pl.dead) {
        const a = Math.atan2(pl.y - f.y, pl.x - f.x), L = Math.hypot(pl.x - f.x, pl.y - f.y);
        G.FX.beam(f.x, f.y - G.LIFT, a, L, 8, '#ffffff', { pal: 'lunar', beam: 'star' });
        if (!f.ghost) {
          const s = sub3(m), col = G.U.TYPE_COLOR.fairy, d = f.dmg * 0.6;
          segEach(f.x, f.y, pl.x, pl.y, 14, e => hit(pl, e, d, col, Math.cos(a), Math.sin(a), 0, s));
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
  MECH['springtide-storm'] = {
    cast(pl, m) {
      shower(pl, m);
      const f = fields[fields.length - 1], low = pl.maxHp ? pl.hp / pl.maxHp < 0.5 : false;
      if (f && f.kind === 'shower') f.vis = m.gnaw ? visAs(m, 'verdant', { proj: 'petal' }) : low ? visAs(m, 'therian', { proj: 'petal' }) : G.VFX.forMove(m);
    },
    afterP(pl, e, m) {
      if (pl.maxHp && pl.hp / pl.maxHp < 0.5) pl.addBuff('atk', 0.06, 5, 5, 'springtide-storm');
      else stAdd(e, 'atkdown', 3, 0.3);
      if (m.gnaw && !e.dead) pure3(pl, e, (e.hp || 0) * (big(e) ? m.gnaw * 0.25 : m.gnaw), m, '#5ac86a');
    }
  };

  // ==== mech: acero ====
  // Garra Metal → Cabeza de Hierro: zarpazo de ida y vuelta (la vuelta, crítica si la ida acertó); evolucionada, cabezazo que interrumpe.
  MECH['metal-claw'] = {
    cast(pl, m) {
      if (m.head) { ironHead3(pl, m); return; }
      const st = ST3(m);
      st.ok = false; st.on = 1;
      try { melee(pl, m); } finally { st.on = 0; }
      add3(pl, 'claw2', { m, a: pl.aim, at: 0.15, ok: st.ok, pad: 60, upd: claw2Tk3 });
    },
    after(pl, e, m) { const st = ST3(m); if (st.on) st.ok = true; if (m.head) interrupt(e); }
  };
  function claw2Tk3(f) {
    if (f.t < f.at) return false;
    const pl = f.owner, m = f.m;
    if (pl.dead) return true;
    const col = G.U.TYPE_COLOR[m.type], half = Math.min(m.arc, 6.2832) / 2;
    G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, f.a + 0.3, m.radius * 0.95, m.arc, col, G.VFX.forMove(m));
    if (sees(pl.x, pl.y)) G.Audio.sfx('shake');
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
      invul(pl, 0.25);
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
  MECH['flash-cannon'] = {
    cast(pl, m) {
      if (m.laser) { laser3(pl, m); return; }
      const segs = trace3(pl.x, pl.y, pl.aim, m.radius, m.reflect | 0), vis = G.VFX.forMove(m), col = G.U.TYPE_COLOR[m.type];
      const dmg = m.dmg * pl.atkFor(m), w = m.width, done = new Set();
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], a = Math.atan2(s[3] - s[1], s[2] - s[0]), L = Math.hypot(s[2] - s[0], s[3] - s[1]);
        if (L < 2) continue;
        G.FX.beam(s[0], s[1] - G.LIFT, a, L, w, col, vis);
        if (i && sees(s[0], s[1])) G.FX.sp('star', 'steel', s[0], s[1] - G.LIFT, { life: 0.25, scale: 1.5 });
        if (ghost) continue;
        segEach(s[0], s[1], s[2], s[3], w, e => { if (done.has(e.id)) return; done.add(e.id); hit(pl, e, dmg, col, Math.cos(a), Math.sin(a), 0, m); });
        segProps(s[0], s[1], s[2], s[3], w, dmg, col);
      }
      if (!ghost) G.Camera.kick(0.08);
    }
  };
  function laser3(pl, m) {
    for (const f of fields) if (f.tag === 'laser' && f.owner === pl) f.gone = true;
    add3(pl, 'laser', { m, a: pl.aim, dur: m.laser || 1.2, tick: 0, log: new Map(), segs: [], dmg: m.dmg * pl.atkFor(m), w: m.width,
                        pad: m.radius + 60, upd: laserTk3, da: laserDa3 });
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
      segEach(s[0], s[1], s[2], s[3], f.w, e => {
        const last = f.log.get(e.id);
        if (last !== undefined && f.t - last < 0.2) return;
        f.log.set(e.id, f.t);
        hit(pl, e, f.dmg, col, ca, sa, 0, m);
      });
      segProps(s[0], s[1], s[2], s[3], f.w, f.dmg * 0.5, col);
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
  MECH['meteor-mash'] = {
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
                           pad: 200, upd: mashTk3, dg: mashDg3, da: mashDa3 });
      }
    }
  };
  function mashTk3(f) {
    if (f.t < f.fall) return false;
    const m = f.m;
    if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, f.col, 0.35, 4); G.FX.burst(f.x, f.y - 6, '#cad6e2', 10, 170); G.Audio.sfx('break'); if (!f.ghost) G.Camera.kick(0.1); }
    areaHit(f.owner, f.hop ? sub3(m) : m, f.x, f.y, f.r, f.dmg, { ghost: f.ghost, knock: m.knock || 0 });
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
                           upd: magTk3, dg: magDg3, da: magDa3 });
    }
    mxTrim(pl, 'magnet', 12);
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
    if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, '#e03a3a', 0.35, 4); G.FX.burst(f.x, f.y - 8, '#cad6e2', 14, 200); G.Audio.sfx('break'); }
    areaHit(f.owner, f.m, f.x, f.y, f.r, f.dmg, { ghost: f.ghost, knock: 60 });
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
  MECH['mirror-shot'] = {
    cast(pl, m) {
      for (const f of fields) if (f.tag === 'mirror' && f.owner === pl) f.gone = true;
      const a = pl.aim, spots = m.laser ? [[a - 0.75, 80], [a + 0.75, 80]] : [[a, 70]];
      const ms = spots.map(([b, r]) => ({ x: pl.x + Math.cos(b) * r, y: pl.y + Math.sin(b) * r }));
      add3(pl, 'mirror', { m, ms, x: ms[0].x, y: ms[0].y, dur: 3, flash: 0.15, lz: 0, log: new Map(), dmg: m.dmg * pl.atkFor(m), pad: 220,
                           upd: mirrorTk3, dg: mirrorDg3, da: mirrorDa3 });
      if (sees(pl.x, pl.y)) G.Audio.sfx('shake');
    }
  };
  function mirrorTk3(f, dt) {
    const pl = f.owner, m = f.m;
    if (pl.dead || f.t >= f.dur) return true;
    // Destello: reflejos que rebotan entre los enemigos y deslumbra (tardan más en disparar).
    if ((f.flash -= dt) <= 0) {
      f.flash = 0.6;
      for (const mm of f.ms) {
        if (sees(mm.x, mm.y)) { G.FX.ring(mm.x, mm.y - 14, 4, 26, '#ffffff', 0.2, 2); G.FX.sp('star', 'steel', mm.x, mm.y - 18, { life: 0.25, scale: 2 }); }
        for (const e of G.EnemyMgr.queryCircle(mm.x, mm.y, 90)) if (real(e) && e.shotCd != null && !e.boss) e.shotCd += 0.5;
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
        segEach(a.x, a.y, b.x, b.y, 10, e => {
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
    if (sees(mm.x, mm.y, 10)) G.FX.spark(mm.x, mm.y - G.LIFT, '#ffffff', Math.cos(a), Math.sin(a), 3);
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
  MECH['gyro-ball'] = {
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
  MECH['kings-shield'] = {
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
    for (const f of fields) if (f.tag === 'blade' && f.owner === pl) f.gone = true;
    add3(pl, 'blade', { m, ghost: g, dur: m.blade || 3, a: pl.aim, log: new Map(), dmg: m.dmg * pl.atkFor(m) * 0.35, pad: 90, upd: bladeTk3, da: bladeDa3 });
  }
  function bladeTk3(f, dt) {
    const pl = f.owner;
    if (pl.dead || f.t >= f.dur) return true;
    f.x = pl.x; f.y = pl.y;
    f.a += 7 * dt;
    if (f.ghost) return false;
    const ca = Math.cos(f.a), sa = Math.sin(f.a), s = sub3(f.m), col = '#9e8aea';
    segEach(pl.x + ca * 18, pl.y + sa * 18, pl.x + ca * 66, pl.y + sa * 66, 20, e => {
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
  MECH['steel-wing'] = {
    cast(pl, m) {
      let f = null;
      for (const o of fields) if (o.tag === 'swing' && o.owner === pl && !o.gone) { f = o; break; }
      const n = Math.max(1, m.count | 0), rate = m.rate || 1.5;
      if (!f) f = add3(pl, 'swing', { birds: [], pad: 400, upd: swingTk3, da: swingDa3, dg: swingDg3 });
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
          segEach(x0, y0, x1, y1, w, e => { if (ps.hit.has(e.id)) return; ps.hit.add(e.id); hit(pl, e, f.dmg, col, x1 - x0, y1 - y0, 60, m); });
          segProps(x0, y0, x1, y1, w, f.dmg, col);
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
      if (sees(b.pass.x1, b.pass.y1, 200)) G.Audio.sfx('shot', { kind: 'orbit', type: 'steel' });
    }
    return false;
  }
  /** Meteoimpacto: el ave se estrella en el grupo y deja un cráter de chatarra (+defensa para ti dentro). */
  function crash3(f, ps) {
    const pl = f.owner, m = f.m, R = m.crash || 80;
    if (sees(ps.x1, ps.y1)) { G.FX.ring(ps.x1, ps.y1, 6, R, '#cad6e2', 0.4, 5); G.FX.burst(ps.x1, ps.y1 - 8, '#ffd25a', 18, 220); G.Audio.sfx('break'); }
    if (!f.ghost) { areaHit(pl, m, ps.x1, ps.y1, R, f.dmg * 1.2, { knock: 120 }); G.Camera.kick(0.25); }
    for (const o of fields) if (o.tag === 'crater' && o.owner === pl) o.gone = true;
    add3(pl, 'crater', { ghost: f.ghost, x: ps.x1, y: ps.y1, r: 70, dur: 4, buffT: 0, pad: 80, upd: craterTk3, dg: craterDg3 });
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
  MECH['make-it-rain'] = {
    cast(pl, m) {
      const n = Math.max(1, m.count | 0);
      add3(pl, 'coinrain', { m, left: n, every: 0.8 / n, next: 0, k: 0, vis: G.VFX.forMove(m), dmg: m.dmg * pl.atkFor(m), pad: 300, upd: coinRainTk3 });
      if (sees(pl.x, pl.y, 100)) G.Audio.sfx('coin');
      if (!ghost) pl.addBuff('satk', -0.1, 2, 1, 'make-it-rain');
      if (m.wish) add3(pl, 'wish', { m, at: 2, dmg: m.dmg * pl.atkFor(m) * 2.4, tx: null, ty: null, pad: 300, upd: wishTk3, dg: wishDg3, da: wishDa3 });
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
    add3(p.owner, 'gcoin', { ghost: p.ghost, x: p.x, y: p.land3, dur: 3, pad: 20, upd: gcoinTk3, dg: gcoinDg3 });
    mxTrim(p.owner, 'gcoin', 24);
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
      if (sees(f.tx, f.ty)) { G.FX.ring(f.tx, f.ty, 6, 100, '#ffe46a', 0.45, 5); G.FX.burst(f.tx, f.ty - 8, '#fff2a0', 22, 240); G.Audio.sfx('judge'); }
      if (!f.ghost) { areaHit(pl, sub3(f.m), f.tx, f.ty, 100, f.dmg, { knock: 80 }); G.Camera.kick(0.3); }
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
  MECH['bite'] = {
    cast(pl, m) {
      const half = Math.min(m.arc, 6.2832) / 2;
      let g = null, bd = Infinity;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
        if (e.dead || big(e) || e.behavior === 'thief' || !inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
        const d = (e.x - pl.x) ** 2 + (e.y - pl.y) ** 2;
        if (d < bd) { bd = d; g = e; }
      }
      melee(pl, m);
      if (g && (!ghost || real(g))) add3(pl, 'grab', { m, e: g, dur: 0.5, n: 2, every: 0.17, next: 0.17, dmg: m.dmg * pl.atkFor(m) * 0.5, pad: 60, upd: grabTk3 });
    },
    after(pl, e, m) { interrupt(e); if (m.crunch) stAdd(e, 'vuln', 5, 1); }
  };
  function grabTk3(f, dt) {
    const pl = f.owner, e = f.e, m = f.m;
    if (pl.dead || !e || e.dead) return true;
    const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
    f.x = e.x; f.y = e.y;
    if (real(e)) {
      const tx = pl.x + ca * (pl.r + e.r + 2), ty = pl.y + sa * (pl.r + e.r + 2);
      e.x = G.U.damp(e.x, tx, 18, dt); e.y = G.U.damp(e.y, ty, 18, dt); e.kx = e.ky = 0;
    }
    if ((f.next -= dt) <= 0 && f.n > 0) {
      f.next += f.every; f.n--;
      if (sees(e.x, e.y)) { G.FX.sp('jaws', 'dark', e.x, e.y - e.bodyH * 0.5, { life: 0.16, scale: 1.5, fade: false }); G.Audio.sfx('hit'); }
      if (!f.ghost) hit(pl, e, f.dmg, G.U.TYPE_COLOR.dark, ca, sa, !f.n && m.crunch ? 420 : 0, m);
    }
    return f.t >= f.dur;
  }

  // Pulso Umbrío → Alarido: cada alcanzado suelta su propio pulso (se contagia, hasta 30); evolucionado, llega el doble y baja el ataque.
  MECH['dark-pulse'] = {
    cast(pl, m) { const w = { set: new Set(), n: 0 }; tagged3(() => nova(pl, m), p => { p.wave3 = w; }); },
    afterP(pl, e, m, p) {
      if (Math.random() < 0.2) interrupt(e);
      if (m.shriek) stAdd(e, 'atkdown', 4, 0.4);
      if (p.wave3) pulse3(pl, m, p.wave3, e, p.dmg * 0.15, false);
    },
    ghostP(p, e) { if (p.wave3 && p.src) pulse3(p.owner, p.src, p.wave3, e, p.dmg * 0.15, true); }
  };
  function pulse3(pl, m, w, e, dmg, g) {
    if (w.set.has(e.id) || w.n >= 20) return;
    w.set.add(e.id); w.n++;
    add3(pl, 'dpulse', { m, ghost: g, w, x: e.x, y: e.y, at: 0.12, r: m.shriek ? 80 : 40, dmg, pad: 90, upd: dpulseTk3 });
  }
  function dpulseTk3(f) {
    if (f.t < f.at) return false;
    const m = f.m, col = m.shriek ? '#d05a8a' : '#7a52c0';
    if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r, col, 0.28, 3); G.FX.ring(f.x, f.y, 2, f.r * 0.6, '#0e0a0c', 0.2, 2); }
    if (f.ghost) { for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) pulse3(f.owner, m, f.w, e, f.dmg * 0.8, true); return true; }
    areaHit(f.owner, sub3(m), f.x, f.y, f.r, f.dmg, { each: e => {
      if (m.shriek) stAdd(e, 'atkdown', 4, 0.4);
      pulse3(f.owner, m, f.w, e, f.dmg * 0.75, false);
    } });
    return true;
  }

  // Tinieblas → Pesadilla: daño fijo según tu nivel e ilusiones (disparos hacia atrás); evolucionada, duerme y consume.
  MECH['night-shade'] = {
    cast(pl, m) {
      const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
      G.FX.ring(pl.x, pl.y, m.radius * 0.5, m.radius, '#0e0a0c', 0.28, 2);
      if (sees(pl.x, pl.y)) for (let i = 0; i < 4; i++) {
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
    const dt = e.dreamAt ? Math.min(0.7, now - e.dreamAt) : 0;
    e.dreamT = e.dreamAt && now - e.dreamAt < 1 ? (e.dreamT || 0) + dt : 0;
    e.dreamAt = now;
    if (stHas(e, 'sleep')) { pure3(pl, e, (e.maxHp || 0) * 0.03 * Math.max(dt, 0.3), m, '#d05a8a'); return; }
    if (e.dreamT >= 2 && !big(e)) { e.dreamT = 0; stAdd(e, 'sleep', 2); }
  }

  // Golpe Bajo → Juego Sucio: va al que prepara un ataque (×2 y se lo corta) o al más cercano (×1,5 de espaldas);
  // evolucionado, duele según la fuerza del enemigo (jefes ×2,5).
  MECH['sucker-punch'] = {
    cast(pl, m) {
      const n = Math.max(1, m.count | 0), R = 360, list = [];
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) if (prepping(e)) list.push(e);
      list.sort((a, b) => ((a.x - pl.x) ** 2 + (a.y - pl.y) ** 2) - ((b.x - pl.x) ** 2 + (b.y - pl.y) ** 2));
      if (list.length > n) list.length = n;
      if (list.length < n) {
        const t = pl.target && !pl.target.dead && !list.includes(pl.target) ? pl.target : null;
        if (t) list.push(t);
        for (const e of nearestN(pl.x, pl.y, R, n * 2)) if (list.length < n && !list.includes(e)) list.push(e);
      }
      if (!list.length) return;
      const sp = m.speed || 420, v = G.VFX.forMove(m);
      list.forEach((e, i) => {
        const a = Math.atan2(e.y - pl.y, e.x - pl.x) + (i ? G.U.rand(-0.25, 0.25) : 0);
        shot3(pl, m, { x: pl.x + Math.cos(a) * 4, y: pl.y + Math.sin(a) * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: m.life || 1.6, vis: v,
                       lock3: e, only3: e.id, upd3: lockUpd3 });
        if (prepping(e) && sees(e.x, e.y)) G.FX.ring(e.x, e.y, e.r, e.r * 2, '#6b5c52', 0.25, 2);
      });
    },
    k(pl, e, m) {
      let k = prepping(e) ? 2 : facing3(e, pl) < 0 ? 1.5 : 1;
      if (m.foul) k *= big(e) ? 2.5 : G.U.clamp(((e.def && e.def.dmg) || 11) / 11 * (e.champ ? 1.35 : 1), 0.8, 2);
      return k;
    },
    afterP(pl, e) { if (prepping(e)) { interrupt(e); G.FX.dmgText(e.x, e.y - e.bodyH - 18, '¡Cortado!', '#d4c4cc'); } }
  };

  // Tajo Umbrío → Lariat Oscuro: te desvaneces 0,5 s girando (te pierden de vista, tajos críticos a los que no te miran);
  // evolucionado, giro enorme que atrae y no mira escudos ni resistencias.
  MECH['night-slash'] = {
    cast(pl, m) {
      if (!ghost && !pl.dead) {
        P3(pl).hide = 0.5; invul(pl, 0.5);
        // Te pierden de vista: los de cerca dan vueltas sin saber dónde estás.
        for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 170)) if (free3(e)) stAdd(e, 'confuse', 0.5);
      }
      if (sees(pl.x, pl.y)) { G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#0e0a0c', 12, 140); G.FX.sp('shadow', m.lariat ? 'nightmare' : 'dark', pl.x, pl.y - pl.bodyH * 0.5, { life: 0.4, scale: 2.5 }); }
      spin(pl, m);
      const f = fields[fields.length - 1];
      if (f && f.kind === 'spin') f.vis = m.lariat ? visAs(m, 'nightmare', { melee: 'claw' }) : G.VFX.forMove(m);
      if (m.lariat) add3(pl, 'lariat', { m, dur: Math.max(1, m.count | 0) * 0.13 + 0.1, pad: 40, upd: lariatTk3 });
    },
    crit(pl, e) { const u = pl.u3; return !!(u && u.hide > 0 && !big(e) && facing3(e, pl) <= 0); },
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
    if (!f.ghost) for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) if (real(e) && e.shield > 0) e.shield = 0;
    return false;
  }

  // Brecha Negra → Calamidad: (el barrido de siempre, ahora con Dormido de verdad); evolucionada, agujero negro que se traga a los dormidos.
  MECH['dark-void'] = {
    cast(pl, m) {
      wipe(pl, m);
      if (m.hole) add3(pl, 'bhole', { m, at: (m.delay || 1.2) + 0.25, dur: (m.delay || 1.2) + 0.25 + m.hole, on: false, tick: 0,
                                      dmg: m.dmg * pl.atkFor(m) * 0.3, r: 60, pad: 280, upd: holeTk3, dg: holeDg3, da: holeDa3 });
    }
  };
  function holeTk3(f, dt) {
    const pl = f.owner;
    if (f.t < f.at) { if (pl.dead) return true; f.x = pl.x; f.y = pl.y; return false; }
    if (f.t >= f.dur) return true;
    if (!f.on) { f.on = true; if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, f.r * 3, 4, '#3c2468', 0.5, 5); G.Audio.sfx('surge'); } }
    // Se traga a los dormidos (y a los aturdidos) de alrededor.
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, 260)) {
      if (!free3(e) || !(stHas(e, 'sleep') || e.stunT > 0)) continue;
      const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy);
      if (d < 6) continue;
      const k = Math.min(d, 200 * dt) / d;
      e.x += dx * k; e.y += dy * k;
    }
    if ((f.tick -= dt) <= 0) { f.tick = 0.3; areaHit(pl, sub3(f.m), f.x, f.y, f.r, f.dmg, { ghost: f.ghost }); }
    if (Math.random() < dt * 20 && sees(f.x, f.y)) {
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
  MECH['beat-up'] = {
    cast(pl, m) {
      const types = [];
      for (const x of pl.moves || []) if (x && x.type && x.kind !== 'buff' && !types.includes(x.type)) types.push(x.type);
      if (!types.length) types.push(m.type);
      // (Como mínimo 2, como antes: con un solo tipo, dos copias de ese tipo.)
      const n = Math.max(2, Math.min(4, types.length)) + Math.max(0, (m.count | 0) - 2), dmg = m.dmg * pl.atkFor(m), copy = m.sprite === 'owner';
      const near = m.portal ? nearestN(pl.x, pl.y, 300, n) : [];
      for (let i = 0; i < n; i++) {
        const t = types[i % types.length], mm = beatAs3(m, t), a = pl.aim + i * 6.2832 / n;
        let x = pl.x + Math.cos(a) * 18, y = pl.y + Math.sin(a) * 14;
        const e = near[i % Math.max(1, near.length)];
        if (e) {
          // Cerco Dimensión: sale de un portal por la espalda del enemigo (y el portal se traga sus disparos).
          const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
          x = e.x + nx * (e.r + 16); y = e.y + ny * (e.r + 16);
          add3(pl, 'portal', { x, y, r: 18, dur: 2.2, pad: 30, upd: portalTk3, dg: portalDg3 });
        }
        fields.push({ kind: 'ally', owner: pl, ghost, m: mm, col: G.U.TYPE_COLOR[t], vis: G.VFX.forMove(m), x, y, aura3: G.U.TYPE_COLOR[t],
                      vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed, t: 0, life: m.dur || 6, r: m.size || 9, tgt: e || null, look: 0, wa: a,
                      hitLog: new Map(), ph: Math.random() * 6.2832, pad: 40, dmg,
                      anim: copy && G.Sprites.Animator ? new G.Sprites.Animator(pl.form || pl.dex, (pl.scale || 1) * 0.55, pl.shiny) : null });
      }
      trimOld('ally', pl, m.id, n);
      mxTrim(pl, 'portal', 8);
      G.FX.ring(pl.x, pl.y, 4, pl.r * 3, G.U.TYPE_COLOR[m.type], 0.3, 2);
    },
    after(pl, e, m) {
      // Cada copia, con el estado de su tipo (quemar, envenenar y frenar ya los lleva su movimiento).
      switch (m.type) {
        case 'electric': stAdd(e, 'para', 1.2); break;
        case 'ghost': stAdd(e, 'curse', 2); break;
        case 'fairy': stAdd(e, 'atkdown', 2, 0.2); break;
        case 'dark': stAdd(e, 'vuln', 4, 1); break;
        case 'psychic': stAdd(e, 'confuse', 1); break;
        case 'fighting': interrupt(e); break;
        case 'dragon': if (Math.random() < 0.25) stAdd(e, 'fear', 1, [e.x - (e.kx || 0), e.y - (e.ky || 0)]); break;
        case 'grass': stAdd(e, 'root', 0.4); break;
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
  /* ---- fin de los ataques únicos de Roca, Fantasma, Dragón, Siniestro, Acero, Hada ---- */

  /* =====================================================================================
   * -- ataques únicos: Normal, Fuego, Agua, Planta, Eléctrico, Hielo (26-10-2026) --
   * Cada uno con su mecánica (MECH[id], ver el motor arriba) y su evolución. Los números
   * de base siguen en data/moves.js; la evolución, también allí (EVO_NFAPEH → EVO[id][2]).
   * ===================================================================================== */
  // (Golpes de más de un ataque: con raw no vuelven a llamar a sus ganchos —un gancho after que golpea
  //  con raw nunca se repite a sí mismo—.)
  const FIRE_O = Object.freeze({ type: 'fire' }), FIRE_B1 = Object.freeze({ type: 'fire', burn: 1 }), FIRE_RAW = Object.freeze({ raw: true, type: 'fire' });
  const ELEC_RAW = Object.freeze({ raw: true, type: 'electric' }), ICE_RAW = Object.freeze({ raw: true, type: 'ice' });
  const WATER_RAW = Object.freeze({ raw: true, type: 'water' }), GRASS_RAW = Object.freeze({ raw: true, type: 'grass' });
  /** Varios disparos en abanico hacia pl.aim (como la familia proyectil) con lo de extra. */
  function shootN(pl, m, extra) {
    const n = Math.max(1, m.count | 0), spread = m.spread || 0, out = [];
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * n;
      out.push(shoot(pl, m, pl.aim + off + G.U.rand(-0.03, 0.03), extra));
    }
    G.FX.spark(pl.x + Math.cos(pl.aim) * pl.r, pl.y - G.LIFT + Math.sin(pl.aim) * pl.r, TCOL(m.type), Math.cos(pl.aim), Math.sin(pl.aim), 3);
    return out;
  }
  /** Aguja (familia sweep) de m: llama a onTurn() en cada vuelta completa (s: stOf(m)). → el campo o null. */
  function sweepTurn(pl, m, s, onTurn) {
    let f = null;
    for (const o of fields) if (o.kind === 'sweep' && o.owner === pl && o.m === m && !o.gone) { f = o; break; }
    if (!f) { s.sf = null; return null; }
    if (s.sf !== f) { s.sf = f; s.a0 = f.a; s.hitTurn = false; }
    if (f.a - s.a0 >= 6.2832) { s.a0 += 6.2832; onTurn(f); s.hitTurn = false; }
    return f;
  }

  /* ==== mech: normal ==== */

  // ---- Placaje → Derribo: bolos ----
  MECH['tackle'] = {
    cast(pl, m) {
      const g = ghost, col = TCOL(m.type), vis = G.VFX.forMove(m), evo = m.evolved;
      if (evo && !g) {
        // Derribo: la embestida te lleva 40 px hacia delante.
        const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), len = pathLen(pl, ca, sa, 40);
        if (len > 0) { afterimages(pl, [{ x: pl.x, y: pl.y }], 0.22, '#e8dcc0'); pl.x += ca * len; pl.y += sa * len; G.World.collide(pl); }
      }
      const half = Math.min(m.arc, 6.2832) / 2;
      G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim, m.radius, m.arc, col, vis);
      if (sees(pl.x, pl.y)) {
        for (let i = 0; i < 6; i++) {
          const a = pl.aim + G.U.rand(-half, half);
          G.FX.px(pl.x + Math.cos(a) * m.radius * 0.5, pl.y + Math.sin(a) * m.radius * 0.4, evo ? '#a07a4a' : '#e8dcc0',
                  { vx: Math.cos(a) * 90, vy: Math.sin(a) * 70 - 20, life: 0.35, size: 2 });
        }
        if (evo) G.FX.ring(pl.x, pl.y, pl.r, m.radius, '#a07a4a', 0.3, 3);
        G.Audio.sfx('thud');
      }
      const dmg = atk(pl, m), sp = 380 * (pkOf(m).pspd || 1), chain = m.lvl >= 5 ? 2 : 1;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) {
        if (!inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
        const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y), boss = big(e);
        // Los jefes no ruedan (Derribo: les hace ×1,5); los demás salen rodando como bolos.
        if (!g) hit(pl, e, dmg * (evo && boss ? 1.5 : 1), col, nx, ny, boss || e.remote ? m.knock || 0 : 0, m);
        if (!boss && !e.dead) toss(e, nx * sp, ny * sp, 0.3, { pl, m, dmg, k: 0.5, chain, ghost: g, boom: evo ? { r: 36, k: 0.6 } : null });
      }
      if (!g) for (const p of G.World.propsInCircle(pl.x, pl.y, m.radius)) if (inArc(pl.x, pl.y, p.x, p.y, pl.aim, half)) G.World.damageProp(p, dmg, col);
    }
  };

  // ---- Ataque Rápido → Velocidad Extrema: prioridad ----
  function quickDash(pl, m, k, inv) {
    const g = ghost, col = TCOL(m.type), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
    const t = pl.target && !pl.target.dead ? pl.target : null;
    // Cruza a través del blanco (un poco más allá), no se queda delante.
    const want = t ? Math.min(m.radius * 1.3, G.U.dist(pl.x, pl.y, t.x, t.y) + (t.r || 10) + 26) : m.radius;
    const sx = pl.x, sy = pl.y, len = g ? want * 0.7 : pathLen(pl, ca, sa, want);
    const gold = m.evolved ? '#ffd23f' : '#ffffff';
    // Sin viaje visible: tres imágenes residuales y una raya fina. (El compañero ya llega movido: por detrás de él.)
    const P = q => (g ? { x: sx - ca * len * (1 - q), y: sy - sa * len * (1 - q) } : { x: sx + ca * len * q, y: sy + sa * len * q });
    afterimages(pl, [0.25, 0.55, 0.85].map(P), 0.28, gold);
    for (let d = 0; d <= len; d += 26) { const q = P(d / (len || 1)); G.FX.sp('streak', m.evolved ? 'electric' : 'normal', q.x, q.y - G.LIFT * 0.6, { life: 0.16, angle: pl.aim }); }
    if (g) return;
    pl.x = sx + ca * len; pl.y = sy + sa * len;
    G.World.collide(pl);
    invul(pl, inv || 0.3);
    const w = m.width || 34, dmg = atk(pl, m) * k;
    for (const e of onSeg(sx, sy, pl.x, pl.y, w)) {
      hit(pl, e, dmg, col, ca, sa, m.knock || 0, m);
      if (!e.dead && sees(e.x, e.y)) G.FX.sp('impact', m.evolved ? 'electric' : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.14, scale: 1.5 });
    }
    segProps(sx, sy, pl.x, pl.y, w, dmg, col);
    G.Camera.kick(0.1);
    if (sees(pl.x, pl.y)) G.Audio.sfx('select');
  }
  MECH['quick-attack'] = {
    cast(pl, m) { quickDash(pl, m, 1); },
    // «Golpea primero»: ×1,6 a los que aún tienen la vida llena.
    k(pl, e) { return e.hp >= e.maxHp * 0.98 ? 1.6 : 1; },
    tick(pl, m) {
      if (!m.evolved) return;
      const s = stOf(m);
      if (s.auto > now() || pl.dead) return;
      // Velocidad Extrema: se lanza sola si algo va a tocarte (una vez cada 1,2 s).
      let ang = null;
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, pl.r + 24)) {
        if (e.dead || e.stunT > 0) continue;
        pl.target = e; ang = Math.atan2(e.y - pl.y, e.x - pl.x); break;
      }
      if (ang === null) {
        for (const p of G.Projectiles.all()) {
          if (p.friendly || G.U.dist2(p.x, p.y, pl.x, pl.y) > 900) continue;
          ang = Math.atan2(-p.vy, -p.vx); break;            // hacia quien lo disparó
        }
      }
      if (ang === null) return;
      s.auto = now() + 1.2;
      const a0 = pl.aim;
      pl.aim = ang;
      fire(pl, m);
      quickDash(pl, m, 1.5, 0.35);
      pl.aim = a0;
    }
  };

  // ---- Danza Espada → Tambor ----
  const SWD = Object.freeze({ cat: 'physical', type: 'normal' }), SWD_O = Object.freeze({ raw: true, type: 'normal', cat: 'physical' });
  function swords(pl, m, n) {
    const life = 3 * (pkOf(m).dur || 1);
    const f = mxFind(pl, 'swords', m.id);
    if (f) { f.t = 0; f.life = life; f.n = n; return; }
    addField({ owner: pl, m, tag: 'swords', x: pl.x, y: pl.y, life, n, ang: 0, log: new Map(), pad: 90,
      upd(f, dt) {
        if (pl.dead) return true;
        f.x = pl.x; f.y = pl.y; f.ang += dt * 5;
        if (f.ghost) return false;
        const dmg = 6 * pl.atkFor(SWD);
        for (let i = 0; i < f.n; i++) {
          const a = f.ang + i * 6.2832 / f.n, x = pl.x + Math.cos(a) * 40, y = pl.y + Math.sin(a) * 28;
          for (const e of G.EnemyMgr.queryCircle(x, y, 10)) {
            const last = f.log.get(e.id);
            if (last !== undefined && f.t - last < 0.4) continue;
            f.log.set(e.id, f.t);
            hit(pl, e, dmg, '#cad6e2', e.x - pl.x, e.y - pl.y, 30, m, SWD_O);
          }
        }
        if (f.log.size > 200) f.log.clear();
        return false;
      },
      da(ctx, f, own) {
        const fade = Math.min(1, (f.life - f.t) * 3, f.t * 6);
        for (let i = 0; i < f.n; i++) {
          const a = f.ang + i * 6.2832 / f.n;
          G.VFX.draw(ctx, 'dsword', 'steel', pl.x + Math.cos(a) * 40, pl.y + Math.sin(a) * 28 - pl.bodyH * 0.5, { angle: a + Math.PI / 2, scale: 1.5, alpha: fade });
        }
      } });
  }
  MECH['swords-dance'] = {
    cast(pl, m) {
      const g = ghost, max = m.stacks | 0;
      // Tambor: con más de la mitad de vida pagas el 15 % y las pilas saltan al máximo.
      if (m.evolved && !g && pl.buffs && pl.hp > pl.maxHp * 0.5 && stacksOf(pl, m.stat, m.id) < max - 1) {
        pl.hp = Math.max(1, pl.hp - pl.hp * 0.15);
        for (let i = 0; i < max; i++) pl.addBuff(m.stat, m.amount, m.dur, max, m.id);
        if (sees(pl.x, pl.y)) {
          G.FX.ring(pl.x, pl.y - pl.bodyH * 0.5, pl.r, pl.r * 4, '#ff6b4d', 0.35, 4);
          G.FX.ring(pl.x, pl.y - pl.bodyH * 0.5, pl.r, pl.r * 3, '#ff6b4d', 0.5, 3);
          G.Audio.sfx('thud');
          later(pl, m, 0.14, pl.x, pl.y, () => G.Audio.sfx('ball'), { ghost: true });
        }
      }
      buff(pl, m);
      if (sees(pl.x, pl.y)) G.FX.sp('dsword', 'steel', pl.x, pl.y - pl.bodyH - 6, { vy: -50, life: 0.45, angle: -Math.PI / 2 });
      if ((pl.buffs ? stacksOf(pl, m.stat, m.id) : 0) >= max) swords(pl, m, m.evolved ? 4 : 2);
    }
  };

  // ---- Maquinación → Geocontrol ----
  MECH['nasty-plot'] = {
    cast(pl, m) {
      buff(pl, m);
      if (ghost || !pl.buffs) return;
      const s = stOf(m), px = P3(pl);
      // Al máximo (y cada 4 s mientras dure): el siguiente golpe especial, crítico seguro.
      if (stacksOf(pl, m.stat, m.id) >= (m.stacks | 0) && !px.next && !(s.planAt > now())) {
        px.next = 'special'; s.planAt = now() + 4;
        if (sees(pl.x, pl.y)) { G.FX.ring(pl.x, pl.y - pl.bodyH, 2, 22, '#c47bff', 0.35, 2); G.Audio.sfx('select'); }
      }
    },
    tick(pl, m, dt) {
      if (!m.evolved) return;
      // Geocontrol: quieto 1,5 s, runas en el suelo y tres stats de golpe (moverte cancela la carga).
      const s = stOf(m), still = !moved(pl, s, 0.4);
      s.geo = still ? (s.geo || 0) + dt : 0;
      if (s.geo > 0.08 && !mxFind(pl, 'geo', m.id)) {
        addField({ owner: pl, m, tag: 'geo', x: pl.x, y: pl.y, pad: 80, ghost: false,
          upd(f) { f.x = pl.x; f.y = pl.y; return pl.dead || !(s.geo > 0.05); },
          dg(ctx, f, own, t) {
            const k = Math.min(1, s.geo / 1.5), R = pl.r * 2.6;
            ctx.globalAlpha = 0.5 * own; ctx.strokeStyle = '#7fe08a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(f.x, f.y, R, R * 0.42, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * k); ctx.stroke();
            ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.ellipse(f.x, f.y, R * 0.7, R * 0.3, 0, 0, 6.2832); ctx.stroke();
            for (let i = 0; i < 6; i++) {
              const a = t * 1.5 + i * 1.047;
              G.VFX.draw(ctx, 'st-diamond', i % 2 ? 'grass' : 'sacred', f.x + Math.cos(a) * R * 0.85, f.y + Math.sin(a) * R * 0.36, { alpha: own * (0.4 + 0.6 * k) });
            }
          } });
      }
      if (s.geo >= 1.5) {
        s.geo = 0;
        for (let i = 0; i < 3; i++) pl.addBuff('satk', m.amount, 8, 3, 'geomancy');
        for (let i = 0; i < 2; i++) pl.addBuff('spd', 0.1, 8, 2, 'geomancy');
        for (let i = 0; i < 2; i++) pl.addBuff('def', 0.07, 8, 2, 'geomancy');
        if (sees(pl.x, pl.y)) {
          G.FX.ring(pl.x, pl.y, pl.r, pl.r * 5, '#7fe08a', 0.5, 4);
          for (let i = 0; i < 10; i++) G.FX.sp('star', i % 2 ? 'sacred' : 'grass', pl.x + G.U.rand(-pl.r * 2, pl.r * 2), pl.y - G.U.rand(0, 10), { vy: -G.U.rand(80, 140), life: 0.7 });
          G.Audio.sfx('heal');
        }
      }
    }
  };

  // ---- Agilidad → Cambio de Marcha ----
  MECH['agility'] = {
    cast(pl, m) {
      buff(pl, m);
      if (ghost || !pl.buffs) return;
      const px = P3(pl), T = now();
      // Al máximo: a veces esquivas (Player.hurt → wardBlock → mxDodge).
      if (stacksOf(pl, m.stat, m.id) >= (m.stacks | 0)) { px.dodgeK = 0.2; px.dodgeT = T + m.dur; }
      if (m.evolved) {
        // Cambio de Marcha: la velocidad de más se vuelve daño (gearK) mientras dure.
        px.gear = T + m.dur;
        if (!mxFind(pl, 'gear', m.id)) {
          addField({ owner: pl, m, tag: 'gear', x: pl.x, y: pl.y, pad: 60, ghost: false,
            upd(f) { f.x = pl.x; f.y = pl.y; return pl.dead || !(px.gear > now()); },
            dg(ctx, f, own, t) {
              G.VFX.draw(ctx, 'gear', 'steel', f.x - 9, f.y + 2, { angle: t * 6, alpha: own * 0.9 });
              G.VFX.draw(ctx, 'gear', 'steel', f.x + 9, f.y + 2, { angle: -t * 6 + 0.4, alpha: own * 0.9 });
            } });
        }
      }
      if (sees(pl.x, pl.y)) for (let i = 0; i < 3; i++) G.FX.sp('streak', 'flying', pl.x - Math.cos(pl.moveAngle) * G.U.rand(8, 20), pl.y - pl.bodyH * G.U.rand(0.2, 0.8), { life: 0.25, angle: pl.moveAngle });
    }
  };

  // ---- Fortaleza → Defensa Férrea ----
  MECH['harden'] = {
    cast(pl, m) {
      buff(pl, m);
      if (m.evolved && !ghost && pl.buffs) pl.addBuff(m.stat, m.amount, m.dur, m.stacks | 0, m.id);   // dos pilas por uso
      // Brillo que recorre el sprite de arriba abajo (como en los juegos).
      addField({ owner: pl, m, tag: 'shine', x: pl.x, y: pl.y, life: 0.3, pad: 40,
        da(ctx, f, own) {
          const k = f.t / f.life, y = pl.y - pl.bodyH + pl.bodyH * k;
          ctx.globalAlpha = own * (1 - k) * 0.9; ctx.fillStyle = m.evolved ? '#cad6e2' : '#ffffff';
          ctx.fillRect(Math.round(pl.x - pl.r), Math.round(y), Math.round(pl.r * 2), 2);
        } });
    },
    idle(pl, m) {
      // Defensa Férrea: las pilas no caducan mientras no te golpeen.
      if (!m.evolved) return;
      const s = buffSrc(pl, m.stat, m.id);
      if (!s || !(s.n > 0)) return;
      const px = P3(pl);
      if (!(px.hurtAt > now() - (m.dur || 7))) s.t = Math.max(s.t, m.dur || 7);
    },
    touch(pl, m, e) {
      const n = stacksOf(pl, m.stat, m.id);
      if (!n) return;
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      // Al máximo, firme: el que te toca rebota aturdido; con Defensa Férrea y más de 3 pilas, le devuelves el 25 %.
      if (n >= (m.stacks | 0)) {
        e.applyStun(0.2 * (big(e) ? 0.35 : 1));
        shoveE(pl, e, nx, ny, 220, false);
        pl.slowT = 0;
        if (sees(e.x, e.y)) G.FX.ring(e.x, e.y, 2, e.r * 2, '#cad6e2', 0.2, 2);
      }
      if (m.evolved && n > 3) {
        const d = Math.max(1, (e.dmg || 0) * 0.25);
        e.hurt(d, '#b0b8c8', nx, ny, 0);
        pl.dmgDealt += d; m.dealt = (m.dealt || 0) + d;
      }
    }
  };

  // ---- Golpe Cuerpo → Gigaimpacto: salto aplastante ----
  function slamLand(pl, m, x, y, g) {
    const evo = m.evolved, R = m.radius * (evo ? 1.65 : 1.05), col = TCOL(m.type);
    if (sees(x, y, R)) {
      G.FX.ring(x, y, 6, R, evo ? '#7a4ad0' : '#d9d2c4', 0.35, 4);
      G.FX.burst(x, y - 4, '#a8957a', 14, 180);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + 0.3;
        G.FX.sp('rock', 'ground', x + Math.cos(a) * R * 0.4, y + Math.sin(a) * R * 0.25, { vx: Math.cos(a) * 90, vy: -60, grav: 300, life: 0.4, scale: 0.6 });
      }
      G.Audio.sfx(evo ? 'break' : 'thud');
    }
    G.Camera.kick(g ? 0.05 : evo ? 0.3 : 0.15);
    const dmg = atk(pl, m);
    for (const e of G.EnemyMgr.queryCircle(x, y, R)) {
      if (!g) hit(pl, e, dmg, col, e.x - x, e.y - y, evo ? 0 : m.knock || 0, m);
      if (e.dead) continue;
      // Gigaimpacto: los lanza al aire 0,6 s y al caer dañan a su alrededor.
      if (evo && (!g || real(e))) stAdd(e, 'air', 0.6, 0, { fall: { pl, m, dmg: dmg * 0.4, r: 24, ghost: g } });
      else if (!evo && !g && chance(pl, 0.3)) inflict(pl, e, 'para', 2);
    }
    if (!g) for (const p of G.World.propsInCircle(x, y, R)) G.World.damageProp(p, dmg, col);
    if (evo && !g) m.t = Math.max(m.t, cooldown(pl, m) + 1);       // recarga: 1 s sin lanzarse
  }
  MECH['body-slam'] = {
    cast(pl, m) {
      const g = ghost, evo = m.evolved, H = evo ? 80 : 40, T = evo ? 0.5 : 0.35;
      // Al centro del grupo cercano (como mucho 90 px; Gigaimpacto, 110).
      let tx = pl.x, ty = pl.y;
      const c = crowd(pl.x, pl.y, 150);
      if (c) {
        const dx = c.x - pl.x, dy = c.y - pl.y, d = Math.hypot(dx, dy);
        if (d > 1) {
          const L = g ? Math.min(d, evo ? 110 : 90) : pathLen(pl, dx / d, dy / d, Math.min(d, evo ? 110 : 90));
          tx = pl.x + dx / d * L; ty = pl.y + dy / d * L;
        }
      }
      if (!g) invul(pl, T + 0.05);
      addField({ owner: pl, m, tag: 'slam', x: tx, y: ty, life: T + 0.4, pad: 160, sx: pl.x, sy: pl.y, tx, ty, T, H, done: false,
        upd(f) {
          if (pl.dead) return true;
          const k = Math.min(1, f.t / f.T);
          if (!f.ghost) {
            // Tu Pokémon sube y cae (el sprite va con pl.y; la sombra de verdad la pinta este campo).
            pl.x = f.sx + (f.tx - f.sx) * k; pl.y = f.sy + (f.ty - f.sy) * k - Math.sin(Math.PI * k) * f.H;
          }
          if (k >= 1 && !f.done) {
            f.done = true;
            if (!f.ghost) { pl.x = f.tx; pl.y = f.ty; G.World.collide(pl); }
            slamLand(pl, f.m, f.ghost ? pl.x : f.tx, f.ghost ? pl.y : f.ty, f.ghost);
          }
          return f.done;
        },
        dg(ctx, f, own) {
          if (f.done) return;
          const k = Math.min(1, f.t / f.T), x = f.ghost ? pl.x : f.sx + (f.tx - f.sx) * k, y = f.ghost ? pl.y : f.sy + (f.ty - f.sy) * k;
          ctx.globalAlpha = 0.35 * own; ctx.fillStyle = '#000';
          const s = 0.6 + 0.7 * k;
          ctx.beginPath(); ctx.ellipse(x, y, pl.r * s, pl.r * 0.38 * s, 0, 0, 6.2832); ctx.fill();
          // Aviso de donde cae (Gigaimpacto: la onda grande).
          ctx.globalAlpha = 0.5 * own; ctx.strokeStyle = evo ? '#7a4ad0' : '#e8dcc0'; ctx.lineWidth = 1.5;
          const R = f.m.radius * (evo ? 1.65 : 1.05) * k;
          ctx.beginPath(); ctx.ellipse(f.tx, f.ty, R, R * 0.6, 0, 0, 6.2832); ctx.stroke();
        },
        da(ctx, f, own, t) {
          if (f.done || !evo) return;
          // Gigaimpacto: aura morada y negra en el salto.
          ctx.globalAlpha = 0.5 * own; ctx.strokeStyle = '#3a2058'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(pl.x, pl.y - pl.bodyH * 0.5, pl.r * 1.3, pl.bodyH * 0.7, 0, 0, 6.2832); ctx.stroke();
          ctx.strokeStyle = '#a070ff'; ctx.lineWidth = 1.5; ctx.stroke();
        } });
    }
  };

  // ---- Vozarrón → Alboroto: anillo sonoro ----
  function voiceRing(pl, m, g, k, cnt) {
    const r1 = 170 * ((m.size || 7) / 7), T = 0.5 / ((m.speed || 260) / 260);
    const dmg = atk(pl, m) * k * Math.pow(Math.max(1, m.count | 0) / 9, 0.7), col = TCOL(m.type);
    addField({ owner: pl, m, tag: 'voice', x: pl.x, y: pl.y, life: T + 0.15, r: 20, r1, T, dmg, hits: new Set(), ghost: g, cnt, pad: r1 + 30, evo: m.evolved,
      upd(f) {
        f.r = 20 + (f.r1 - 20) * Math.min(1, f.t / f.T);
        if (f.t > f.T) return false;
        // Atraviesa paredes (es sonido): a cada uno, una vez, cuando le llega el anillo.
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r + 6)) {
          if (f.hits.has(e.id)) continue;
          f.hits.add(e.id);
          const d = Math.hypot(e.x - f.x, e.y - f.y);
          if (!f.ghost) hit(pl, e, f.dmg, col, e.x - f.x, e.y - f.y, 40, m);
          if (d < 50 + e.r && (!f.ghost || real(e))) interrupt(e);
          if (f.cnt) {
            const c = (f.cnt.get(e.id) || 0) + 1;
            f.cnt.set(e.id, c);
            if (c >= 3) { f.cnt.set(e.id, 0); if (!f.ghost) inflict(pl, e, 'confuse', 2); else if (real(e)) stAdd(e, 'confuse', 2); }
          }
        }
        if (f.cnt && f.cnt.size > 300) f.cnt.clear();
        return false;
      },
      da(ctx, f, own) {
        const k = Math.min(1, f.t / f.T), a = (1 - k * 0.7) * own * Math.min(1, (f.life - f.t) * 6);
        const P = G.VFX.PAL[f.evo ? 'fire' : 'normal'], n = Math.max(16, Math.ceil(f.r / 4));
        ctx.globalAlpha = a; ctx.fillStyle = P[4];
        for (let i = 0; i < n; i++) {
          const ang = i / n * 6.2832;
          ctx.fillRect(Math.round(f.x + Math.cos(ang) * f.r) - 1, Math.round(f.y + Math.sin(ang) * f.r * 0.7 - G.LIFT * 0.4) - 1, f.evo ? 3 : 2, f.evo ? 3 : 2);
        }
        ctx.fillStyle = P[3];
        for (let i = 0; i < n; i += 2) {
          const ang = (i + 0.5) / n * 6.2832;
          ctx.fillRect(Math.round(f.x + Math.cos(ang) * (f.r - 5)), Math.round(f.y + Math.sin(ang) * (f.r - 5) * 0.7 - G.LIFT * 0.4), 2, 2);
        }
        for (let i = 0; i < 8; i++) {
          const ang = i * 0.785 + 0.39;
          G.VFX.draw(ctx, 'note', f.evo ? 'fire' : 'normal', f.x + Math.cos(ang) * f.r, f.y + Math.sin(ang) * f.r * 0.7 - G.LIFT * 0.4 - (f.evo ? Math.abs(Math.sin(f.t * 14 + i)) * 4 : 0), { angle: ang, alpha: a });
        }
      } });
  }
  MECH['hyper-voice'] = {
    cast(pl, m) {
      if (!m.evolved) { voiceRing(pl, m, ghost, 0.95, null); return; }
      // Alboroto: 2,4 s de anillos (uno cada 0,4 s) desde donde estés; con 3, confusos.
      const f = mxFind(pl, 'uproar', m.id);
      if (f) { f.t = 0; return; }
      addField({ owner: pl, m, tag: 'uproar', x: pl.x, y: pl.y, life: 2.4, next: 0, cnt: new Map(), pad: 60,
        upd(f, dt) {
          if (pl.dead) return true;
          f.x = pl.x; f.y = pl.y;
          if ((f.next -= dt) <= 0) { f.next = 0.4; voiceRing(pl, f.m, f.ghost, 0.75, f.cnt); if (sees(pl.x, pl.y)) G.Audio.sfx('shot', { kind: 'nova', type: 'fire' }); }
          return false;
        },
        dg(ctx, f, own, t) {
          ctx.globalAlpha = own * (0.4 + 0.2 * Math.sin(t * 20)); ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, pl.r * 1.6, pl.r * 0.6, 0, 0, 6.2832); ctx.stroke();
        } });
    }
  };

  // ---- Sustituto → Doble Equipo: señuelos ----
  function dollBoom(f) {
    if (f.boomed) return;
    f.boomed = true;
    const r = 70 * areaK(f.m);
    if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, r, '#d9b98a', 0.35, 4); G.FX.burst(f.x, f.y - 8, '#e8d2a8', 14, 170); G.Audio.sfx('break'); }
    areaHit(f.owner, f.m, f.x, f.y, r, f.dmg * 2.5, { knock: 120, ho: RAW, ghost: f.ghost });
  }
  function doll(pl, m) {
    const g = ghost, a = pl.aim + Math.PI + G.U.rand(-0.5, 0.5);
    const x = pl.x + Math.cos(a) * 26, y = pl.y + Math.sin(a) * 20;
    mxTrim(pl, 'doll', Math.max(1, m.count | 0) - 1);
    const hp = g ? Infinity : pl.maxHp * 0.25;
    addField({ owner: pl, m, tag: 'doll', x, y, life: m.dur || 6, hp, hp0: hp, lure: 0, spike: 0.4, touch: new Map(), pad: 70,
      R: 160 * ((m.range || 280) / 280), dmg: atk(pl, m), hitT: 0,
      upd(f, dt) {
        // Atrae a los enemigos de alrededor: van a por él, no a por ti (quien tiene los enemigos).
        if ((f.lure -= dt) <= 0) {
          f.lure = 0.25;
          for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.R)) if (real(e)) stAdd(e, 'charm', 0.45, 0, { goal: f });
        }
        if (f.hitT > 0) f.hitT -= dt;
        // Los que lo tocan le pegan; él pincha.
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, 12)) {
          const last = f.touch.get(e.id);
          if (last !== undefined && f.t - last < 0.55) continue;
          f.touch.set(e.id, f.t);
          f.hp -= e.dmg || 6; f.hitT = 0.12;
        }
        // Pincha a los que tiene alrededor (los que ha atraído).
        if ((f.spike -= dt) <= 0) {
          f.spike = (m.rate || 0.4) * 1.4;
          const sr = 48 * areaK(m);
          if (sees(f.x, f.y)) G.FX.ring(f.x, f.y, 4, sr, '#e8d2a8', 0.2, 2);
          areaHit(pl, m, f.x, f.y, sr, f.dmg * 0.7, { knock: 30, ho: RAW, ghost: f.ghost });
        }
        if (f.hp <= 0) { dollBoom(f); return true; }
        return false;
      },
      end(f) { dollBoom(f); },
      dg(ctx, f, own) {
        ctx.globalAlpha = 0.3 * own; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 9, 3.5, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.18 * own; ctx.strokeStyle = '#ff9ed8'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.R, f.R * 0.6, 0, 0, 6.2832); ctx.stroke();
      },
      da(ctx, f, own, t) {
        const fade = Math.min(1, (f.life - f.t) * 3, f.t * 8), bob = Math.sin(t * 4 + f.x) * 1.5;
        const cracked = f.hp0 < Infinity && f.hp < f.hp0 * 0.5;
        G.VFX.draw(ctx, 'doll', cracked ? 'rock' : 'normal', f.x + (f.hitT > 0 ? G.U.rand(-1, 1) : 0), f.y - 12 + bob, { scale: 1.5, alpha: fade * own, frame: cracked ? 1 : 0 });
      } });
    snd('ball', x, y);
  }
  function doubleTeam(pl, m) {
    mxTrim(pl, 'team', 0);
    const life = m.dur || 6, g = ghost;
    const copies = [0, 1].map(i => ({ a: i * Math.PI, alive: true, x: pl.x, y: pl.y,
      anim: G.Sprites.Animator ? new G.Sprites.Animator(pl.form || pl.dex, pl.scale || 1, pl.shiny) : null }));
    if (!g) P3(pl).teamT = now() + life;
    addField({ owner: pl, m, tag: 'team', x: pl.x, y: pl.y, life, copies, lure: 0, pad: 140, dmg: atk(pl, m),
      upd(f, dt) {
        if (pl.dead) return true;
        f.x = pl.x; f.y = pl.y;
        const lure = (f.lure -= dt) <= 0;
        if (lure) f.lure = 0.25;
        let alive = 0;
        for (const c of f.copies) {
          c.a += dt * 3.2;
          if (!c.alive) {
            // Vuelve a salir 1 s después (con un destello), mientras dure.
            if (f.t < c.back) continue;
            c.alive = true;
            if (sees(pl.x, pl.y)) G.FX.ring(pl.x + Math.cos(c.a) * 60, pl.y + Math.sin(c.a) * 42, 2, 20, '#ffffff', 0.2, 2);
          }
          alive++;
          c.x = pl.x + Math.cos(c.a) * 60; c.y = pl.y + Math.sin(c.a) * 42;
          if (c.anim) { c.anim.dir = G.Sprites.dirFromAngle(c.a + Math.PI / 2); c.anim.loop('Walk', 1.6); c.anim.update(dt); }
          if (lure) for (const e of G.EnemyMgr.queryCircle(c.x, c.y, 120 * areaK(m))) if (real(e)) stAdd(e, 'charm', 0.45, 0, { goal: c });
          // Al tocarla desaparece con un destello que aturde alrededor.
          let toucher = null;
          for (const e of G.EnemyMgr.queryCircle(c.x, c.y, 8)) if (!e.dead) { toucher = e; break; }
          if (toucher) {
            c.alive = false; c.back = f.t + 1;
            if (sees(c.x, c.y)) { G.FX.burst(c.x, c.y - 12, '#ffffff', 16, 200); G.FX.ring(c.x, c.y, 4, 60, '#ffffff', 0.3, 3); G.Audio.sfx('shake'); }
            for (const e of G.EnemyMgr.queryCircle(c.x, c.y, 60)) {
              if (!f.ghost) hit(pl, e, f.dmg * 3, '#ffffff', e.x - c.x, e.y - c.y, 80, m, RAW);
              if (!e.dead && (!f.ghost || real(e))) e.applyStun(0.4 * (big(e) ? 0.35 : 1));
            }
          }
        }
        // (Mientras quede alguna, esquivas el 15 %.)
        if (!f.ghost) P3(pl).teamT = alive ? now() + 0.1 : 0;
        return false;
      },
      end(f) { if (!f.ghost) P3(pl).teamT = 0; },
      da(ctx, f, own, t) {
        for (const c of f.copies) {
          if (!c.alive) continue;
          const a = own * (0.4 + 0.15 * Math.sin(t * 22 + c.a));
          if (c.anim) c.anim.draw(ctx, c.x, c.y, { alpha: a });
          else G.VFX.draw(ctx, 'doll', 'normal', c.x, c.y - 12, { scale: 1.5, alpha: a });
        }
      } });
    snd('ball', pl.x, pl.y);
  }
  MECH['substitute'] = {
    cast(pl, m) { doll(pl, m); },
    evo(pl, m) { doubleTeam(pl, m); }
  };

  // ---- Hiperrayo → Rayo Prisma ----
  const PRISM = ['fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  function bestType(e) {
    let best = 'normal', bk = 1;
    if (e && e.types) for (const t of PRISM) { const k = G.Types.mult(t, e.types); if (k > bk) { bk = k; best = t; } }
    return best;
  }
  /** El estado de cada tipo (Rayo Prisma). */
  const PRISM_ST = {
    fire: (pl, e) => e.applyBurn(2), water: (pl, e) => inflict(pl, e, 'wet', 4), ice: (pl, e) => inflict(pl, e, 'freeze', 0.8),
    electric: (pl, e) => inflict(pl, e, 'para', 2), poison: (pl, e) => e.applyPoison(2), grass: (pl, e) => inflict(pl, e, 'root', 1),
    ground: (pl, e) => inflict(pl, e, 'mud', 3, 2), rock: (pl, e) => e.applyStun(big(e) ? 0.15 : 0.4), psychic: (pl, e) => inflict(pl, e, 'confuse', 1.5),
    ghost: (pl, e) => inflict(pl, e, 'fear', 1.2, 0, { from: { x: pl.x, y: pl.y } }), dark: (pl, e) => inflict(pl, e, 'atkdown', 3, 0.3),
    fairy: (pl, e) => inflict(pl, e, 'infat', 1.2), dragon: (pl, e) => inflict(pl, e, 'vuln', 4, 2), steel: (pl, e) => inflict(pl, e, 'vuln', 4, 1),
    fighting: (pl, e) => inflict(pl, e, 'vuln', 4, 1), bug: (pl, e) => inflict(pl, e, 'atkdown', 3, 0.2),
    flying: (pl, e) => { const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y); shoveE(pl, e, nx, ny, 260, false); }
  };
  const RAINBOW = ['fire', 'electric', 'grass', 'water', 'psychic'];
  MECH['hyper-beam'] = {
    cast(pl, m) {
      const at = m.charge || 0.75, col = TCOL(m.type), vis = G.VFX.forMove(m);
      G.FX.ring(pl.x, pl.y - G.LIFT * 0.5, pl.r * 3.2, pl.r * 0.8, col, at, 2);
      addField({ owner: pl, m, tag: 'hbeam', x: pl.x, y: pl.y, life: at + 0.6, at, fired: false, pad: 360,
        upd(f, dt) {
          if (pl.dead) return true;
          if (!f.fired) {
            f.x = pl.x; f.y = pl.y;
            if (Math.random() < dt * 30 && sees(f.x, f.y)) {
              const a = Math.random() * 6.2832, r = G.U.rand(30, 60);
              G.FX.sp(vis.proj, f.m.evolved ? RAINBOW[Math.floor(f.t * 12) % 5] : vis.pal, f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.8 - G.LIFT,
                      { vx: -Math.cos(a) * r * 3, vy: -Math.sin(a) * r * 2.4, life: 0.3 });
            }
            if (f.t < f.at) return false;
            f.fired = true; f.ft = f.t;
            f.ang = pl.aim; f.ca = Math.cos(f.ang); f.sa = Math.sin(f.ang);
            f.type = 'normal';
            if (f.m.evolved) {
              // Rayo Prisma: el tipo que más daño hace a su blanco.
              const tg = pl.target && !pl.target.dead ? pl.target : nearestE(pl.x + f.ca * 120, pl.y + f.sa * 120, 200);
              f.type = bestType(tg);
            }
            f.x0 = pl.x; f.y0 = pl.y; f.len = rayLen(pl.x, pl.y, f.ca, f.sa, f.m.radius);
            f.x = f.x0 + f.ca * f.len / 2; f.y = f.y0 + f.sa * f.len / 2;
            f.tk = 0; f.n = 0;
            // Recarga: después vas más lento un momento (Rayo Prisma, no).
            if (!f.ghost) { G.Camera.kick(0.25); if (!f.m.evolved) pl.slowT = Math.max(pl.slowT || 0, 0.9); }
            snd('surge', f.x0, f.y0);
          }
          if (f.t - f.ft > 0.4) return true;
          if ((f.tk -= dt) <= 0) {
            f.tk = 0.1;
            const first = f.n++ === 0, w = f.m.width, x1 = f.x0 + f.ca * f.len, y1 = f.y0 + f.sa * f.len;
            const pal = f.type === 'normal' ? 'normal' : first ? f.type : RAINBOW[f.n % 5];
            G.FX.beam(f.x0, f.y0 - G.LIFT, f.ang, f.len, w * (first ? 1 : 0.8), TCOL(f.type), { pal, beam: 'star' });
            const d = atk(pl, f.m);
            for (const e of onSeg(f.x0, f.y0, x1, y1, w)) {
              if (!f.ghost) {
                hit(pl, e, d * (first ? 1 : 0.08), TCOL(f.type), f.ca, f.sa, 0, f.m, first ? { type: f.type } : { type: f.type, raw: true });
                if (first && f.m.evolved && PRISM_ST[f.type] && !e.dead) PRISM_ST[f.type](pl, e);
              }
              // Empuja a lo largo del rayo mientras dura (quien tiene los enemigos).
              if (!e.dead && !big(e) && real(e)) { e.kx += f.ca * 130; e.ky += f.sa * 130; }
              else if (first && !f.ghost && e.remote) shoveE(pl, e, f.ca, f.sa, 220, false);
            }
            if (first && !f.ghost) segProps(f.x0, f.y0, x1, y1, w, d, TCOL(f.type));
          }
          return false;
        } });
    }
  };

  // ---- Giro Rápido → Triataque ----
  const TRI = ['fire', 'ice', 'electric'];
  function triOrbs(pl, m, a0, g) {
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * 2.0944, type = TRI[i];
      G.Projectiles.spawn({
        x: pl.x + Math.cos(a) * 8, y: pl.y + Math.sin(a) * 6, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, curl: 3,
        dmg: atk(pl, m) * 0.8, r: 6, life: 0.5, pierce: 1, color: TCOL(type), hits: new Set(), ghost: g, owner: pl,
        vis: { proj: 'ball', pal: type, trail: type === 'fire' ? 'ember' : type === 'electric' ? 'spark' : 'drip' },
        mtype: type, mcat: m.cat, src: m, burn: type === 'fire' ? 1 : 0, poison: 0, slow: 0, knock: 0,
        onHit: type === 'ice' ? (p, e, _d, _c, gg = p.ghost) => { if (!gg) inflict(pl, e, 'chill', 3, 2); }
             : type === 'electric' ? (p, e, _d, _c, gg = p.ghost) => { if (!gg && chance(pl, 0.2)) inflict(pl, e, 'para', 2); } : null
      });
    }
  }
  MECH['rapid-spin'] = {
    cast(pl, m) {
      const g = ghost, n = Math.max(1, m.count | 0), col = TCOL(m.type), vis = G.VFX.forMove(m);
      if (!g && pl.buffs) pl.addBuff('spd', 0.4, n * 0.13 + 0.35, 1, m.id);       // mientras gira, un 40 % más rápido
      addField({ owner: pl, m, tag: 'rspin', x: pl.x, y: pl.y, n, next: 0, ang: pl.aim, pad: 90, life: n * 0.13 + 0.5,
        upd(f, dt) {
          if (pl.dead) return true;
          f.x = pl.x; f.y = pl.y;
          if (f.n <= 0) return false;
          if ((f.next -= dt) > 0) return false;
          f.next = 0.13; f.n--;
          G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, f.ang, m.radius, 3.6, col, vis);
          if (sees(pl.x, pl.y)) for (let i = 0; i < 4; i++) {
            const a = f.ang + i * 1.57;
            G.FX.px(pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.5, '#ffffff', { vx: -Math.sin(a) * 120, vy: Math.cos(a) * 60, life: 0.25 });
          }
          f.ang += 2.2;
          if (!f.ghost) {
            areaHit(pl, m, pl.x, pl.y, m.radius, atk(pl, m), { knock: 40 });
            pl.slowT = 0;                                              // te limpias
            // Desarma los avisos de suelo enemigos que pisas (cada uno los suyos).
            const H = G.Hazards && G.Hazards.all;
            if (H) for (let i = H.length - 1; i >= 0; i--) {
              const h = H[i];
              if (h.kind !== 'zone' || h.hit || h.pure || G.U.dist2(h.x, h.y, pl.x, pl.y) > (h.r || 0) ** 2) continue;
              H.splice(i, 1);
              G.FX.ring(h.x, h.y, h.r, 4, '#ffffff', 0.3, 2);
            }
          }
          if (f.m.evolved) triOrbs(pl, f.m, f.ang, f.ghost);
          return false;
        } });
    }
  };

  // ---- Meteoros → Teraclúster: cada estrella, un enemigo distinto ----
  function swiftUpd(p, dt) {
    if (p.still) {
      const o = p.owner;
      p.x = o.x + p.ox; p.y = o.y + p.oy;
      if (p.t < 0.15) return false;
      p.still = false;
      // Sale hacia su blanco por un lado (en curva).
      if (!p.tg || p.tg.dead) p.tg = nearestE(p.x, p.y, 320);
      const a = p.tg ? Math.atan2(p.tg.y - p.y, p.tg.x - p.x) : Math.atan2(p.oy, p.ox), b = a + p.side * 1.1;
      p.vx = Math.cos(b) * p.sp; p.vy = Math.sin(b) * p.sp;
      return false;
    }
    if (!p.tg || p.tg.dead) p.tg = nearestE(p.x, p.y, 320, p.hits);
    if (p.tg) steerTo(p, p.tg.x, p.tg.y, p.child ? 9 : 7, dt);
    return false;
  }
  function swiftSplit(p, e, _d, _c, gg = p.ghost, pl = p.owner) {
    if (p.child) return;
    // Teraclúster: se divide en 3 estrellitas que buscan a otros 3.
    const skip = new Set([e.id]);
    for (const t of nearestN(e.x, e.y, 260, 3, skip)) {
      const a = Math.atan2(t.y - e.y, t.x - e.x);
      G.Projectiles.spawn({ x: e.x, y: e.y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, dmg: p.dmg * 0.4, r: 4, life: 0.9, pierce: 0,
        color: p.color, hits: new Set([e.id]), vis: p.vis, ghost: gg, owner: p.owner, burn: 0, poison: 0, slow: 0, knock: 0,
        mtype: p.mtype, mcat: p.mcat, src: p.src, child: true, tg: t, upd3: swiftUpd });
    }
  }
  MECH['swift'] = {
    cast(pl, m) {
      const g = ghost, n = Math.max(1, m.count | 0);
      const tg = g ? [] : nearestN(pl.x, pl.y, Math.max(260, reach(m)), n);
      for (let i = 0; i < n; i++) {
        const a = pl.aim + i * 6.2832 / n, ox = Math.cos(a) * 22, oy = Math.sin(a) * 16;
        shoot(pl, m, a, { x: pl.x + ox, y: pl.y + oy, ox, oy, vx: 0, vy: 0, still: true, life: 1.8, curl: 0, homing: 0,
          tg: tg.length ? tg[i % tg.length] : null, side: i % 2 ? 1 : -1, sp: (m.speed || 300) * 1.1,
          upd3: swiftUpd, onHit: m.evolved ? swiftSplit : null });
      }
      G.FX.ring(pl.x, pl.y, pl.r, pl.r * 2.5, m.evolved ? '#ff9ed8' : '#ffe9a0', 0.25, 2);
      if (sees(pl.x, pl.y)) G.Audio.sfx('shot', { kind: 'buff', type: 'fairy' });
    }
  };

  // ---- Canto Mortal → Estruendo ----
  MECH['perish-song'] = {
    cast(pl, m) {
      if (!m.evolved) return false;
      const g = ghost, delay = m.delay || 3;
      // Estruendo: al acabar, un anillo hasta el borde de la caja que aparta y confunde.
      later(pl, m, delay + 0.05, pl.x, pl.y, () => {
        if (pl.dead) return;
        if (sees(pl.x, pl.y, 200)) { G.FX.ring(pl.x, pl.y, pl.r, WIPE_W, '#ffd23f', 0.6, 6); G.FX.ring(pl.x, pl.y, pl.r, WIPE_W * 0.7, '#ffe9a0', 0.45, 4); G.Audio.sfx('surge'); }
        for (const e of G.EnemyMgr.all()) {
          if (e.dead || !inWipeBox(pl, e)) continue;
          const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
          shoveE(pl, e, nx, ny, 320, g);
          if (!g) inflict(pl, e, 'confuse', 1.5); else if (real(e)) stAdd(e, 'confuse', 1.5);
        }
      }, { ghost: g, pad: 600 });
      return false;
    }
  };
  /* ==== mech: fuego ==== */

  // ---- Ascuas → Llamarada ----
  /** La brasa sobre un quemado: la quemadura estalla y pasa una pila a los de alrededor. */
  function emberBlast(pl, m, e, n) {
    const r = 40 * ((m.size || 7) / 7), d = atk(pl, m) * 0.05 * Math.min(8, Math.max(1, n));
    if (real(e)) { e.burn = 0; e.burnT = 0; }
    if (sees(e.x, e.y)) {
      G.FX.ring(e.x, e.y, 4, r, '#fff2a0', 0.25, 3);
      G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ffd23f', 10, 160);
      for (let i = 0; i < 3; i++) G.FX.px(e.x + G.U.rand(-8, 8), e.y - e.bodyH * 0.6, '#8a8278', { vy: -40, life: 0.6, size: 2 });
      G.Audio.sfx('break');
    }
    // (raw: el estallido no vuelve a detonar a nadie.)
    areaHit(pl, m, e.x, e.y, r, d, { knock: 40, ho: FIRE_RAW, pre: o => { if (o !== e) o.applyBurn(1); } });
  }
  /** Llamarada: fuego en forma de 大 que se queda ardiendo. */
  function flare(pl, m, x, y, g) {
    const L = 46 * ((m.size || 7) / 7);
    zone(pl, m, { elem: 'fire', shape: 'arms', x, y, arms: [-Math.PI / 2, 0, Math.PI, Math.PI * 0.75, Math.PI * 0.25], len: L, w: 14,
                  life: 1.5, every: 0.3, dmg: atk(pl, m) * 0.08, burn: 1, ghost: g, fx: 14 });
    if (sees(x, y)) for (const a of [-Math.PI / 2, 0, Math.PI, Math.PI * 0.75, Math.PI * 0.25]) {
      G.FX.sp('fire', 'whitehot', x + Math.cos(a) * L * 0.6, y + Math.sin(a) * L * 0.5 - 4, { vx: Math.cos(a) * 80, vy: Math.sin(a) * 60, life: 0.3, angle: a });
    }
  }
  MECH['ember'] = {
    cast(pl, m) {
      // (El del compañero también ve la llamarada al caer.)
      shootN(pl, m, m.evolved && ghost ? { onHit: (p, e, _d, _c, gg = p.ghost) => { if (gg) flare(pl, m, e.x, e.y, true); } } : null);
    },
    // (Ascuas es un disparo: lo suyo va con el golpe del proyectil.)
    afterP(pl, e, m) {
      if (HIT.burned) emberBlast(pl, m, e, HIT.burnN);
      if (m.evolved) {
        const s = stOf(m);
        if (!(s.flareAt > now())) { s.flareAt = now() + 0.2; flare(pl, m, e.x, e.y, false); }
      }
    }
  };

  // ---- Lanzallamas → Sofoco: chorro canalizado ----
  MECH['flamethrower'] = {
    cast(pl, m) {
      const g = ghost, evo = m.evolved, s = stOf(m), T = now(), col = TCOL(m.type);
      mxTrim(pl, 'flame', 0);
      if (!g) s.combo = T - (s.endAt || -9) < 0.35 ? (s.combo || 0) + 1 : 1;
      const len = 140 * ((m.life || 0.42) / 0.42), half = (evo ? 0.42 : 0.21) * Math.sqrt(Math.max(1, m.count | 0) / 7);
      addField({ owner: pl, m, tag: 'flame', x: pl.x, y: pl.y, life: 0.9, ang: pl.aim, len, half, tk: 0, ptk: 0.3, n: 0, pad: len + 40, combo: s.combo || 1,
        upd(f, dt) {
          if (pl.dead) return true;
          f.x = pl.x; f.y = pl.y;
          if (!f.ghost) f.ang = pl.aim;                                // sigue hacia donde apuntas
          const ca = Math.cos(f.ang), sa = Math.sin(f.ang);
          if (sees(f.x, f.y, f.len)) for (let i = 0; i < 3; i++) {
            const a = f.ang + G.U.rand(-f.half, f.half), d = G.U.rand(8, f.len);
            G.FX.sp('fire', evo ? 'whitehot' : 'fire', f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - G.LIFT * 0.6,
                    { vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 0.16, angle: a, scale: 0.6 + 0.9 * d / f.len });
          }
          if ((f.tk -= dt) <= 0) {
            f.tk += 0.1; f.n++;
            if (!f.ghost) {
              const d = atk(pl, m) * 0.28, o = f.n % 3 === 1 ? FIRE_B1 : FIRE_O;
              for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.len)) {
                if (G.U.dist2(f.x, f.y, e.x, e.y) > (f.len + e.r) ** 2 || !inArc(f.x, f.y, e.x, e.y, f.ang, f.half + e.r / Math.max(20, Math.hypot(e.x - f.x, e.y - f.y)))) continue;
                hit(pl, e, d, col, ca, sa, 20, m, o);
              }
              for (const p of G.World.propsInCircle(f.x + ca * f.len / 2, f.y + sa * f.len / 2, f.len / 2)) G.World.damageProp(p, d, col);
            }
          }
          if ((f.ptk -= dt) <= 0) {
            // Al final del chorro caen charquitos de fuego.
            f.ptk = 0.3;
            zone(pl, m, { elem: evo ? 'whitehot' : 'fire', x: f.x + ca * f.len * 0.85, y: f.y + sa * f.len * 0.85, r: 18 * areaK(m), life: 1.2,
                          every: 0.4, dmg: atk(pl, m) * 0.3, ghost: f.ghost });
          }
          return false;
        },
        end(f) {
          if (f.ghost) return;
          s.endAt = now();
          if (evo && f.combo % 3 === 0) {
            // Sofoco: a la 3.ª seguida se sobrecalienta y explota; luego 2 s enfriándose.
            const r = 110 * areaK(m);
            if (sees(pl.x, pl.y, r)) {
              G.FX.ring(pl.x, pl.y, pl.r, r, '#eaf7ff', 0.4, 5); G.FX.burst(pl.x, pl.y - 8, '#bfe8ff', 24, 260);
              for (let i = 0; i < 8; i++) G.FX.sp('vapor', 'steam', pl.x + G.U.rand(-r, r) * 0.4, pl.y - G.U.rand(0, 20), { vy: -30, life: 1.2, scale: 1.5 });
              G.Audio.sfx('break'); G.Camera.kick(0.3);
            }
            areaHit(pl, m, pl.x, pl.y, r, atk(pl, m) * 2, { knock: 140, ho: FIRE_B1 });
            m.t = Math.max(m.t, 2);
            s.combo = 0;
            addField({ owner: pl, m, tag: 'steam', x: pl.x, y: pl.y, life: 2, pad: 40,
              upd(o) { o.x = pl.x; o.y = pl.y; if (Math.random() < 0.15 && sees(o.x, o.y)) G.FX.sp('vapor', 'steam', pl.x + G.U.rand(-8, 8), pl.y - pl.bodyH, { vy: -40, life: 0.8 }); return false; } });
          }
        } });
      if (sees(pl.x, pl.y)) G.Audio.sfx('surge');
    }
  };

  // ---- Giro Fuego → Fuego Sagrado: jaula ----
  MECH['fire-spin'] = {
    need: 'target', reach: () => 260,
    cast(pl, m) {
      const g = ghost, col = TCOL(m.type);
      const tg = g ? nearestE(pl.x + Math.cos(pl.aim) * 120, pl.y + Math.sin(pl.aim) * 120, 220) : aimTarget(pl, 260);
      if (!tg) return;
      mxTrim(pl, 'cage', 1);
      const r = m.radius, inside = new Set();
      for (const e of G.EnemyMgr.queryCircle(tg.x, tg.y, r)) inside.add(e);
      const sacred = m.evolved;
      addField({ owner: pl, m, tag: 'cage', tg, x: tg.x, y: tg.y, r, life: 4, n: Math.max(1, m.count | 0), rot: 0, tk: 0.05, k: 0, inside, pad: r + 40,
                 heal: 0, healT: 0,
        upd(f, dt) {
          if (f.tg && !f.tg.dead) { f.x = f.tg.x; f.y = f.tg.y; }
          f.rot += dt * (m.speed || 2.4) * 1.6;
          // Los de dentro no pueden salir (lo hace quien tiene los enemigos de verdad).
          for (const e of f.inside) {
            if (e.dead) {
              // Fuego Sagrado: cada quemado que cae dentro te cura un 1 % (como mucho un 5 % por segundo).
              if (sacred && !f.ghost && (e.burn > 0 || (e.net && e.net.st & 1))) {
                if (f.t - f.healT > 1) { f.healT = f.t; f.heal = 0; }
                if (f.heal < 0.05) { f.heal += 0.01; pl.heal(pl.maxHp * 0.01); }
              }
              f.inside.delete(e); continue;
            }
            if (!real(e) || e === f.tg) continue;
            const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy), lim = Math.max(4, f.r - e.r * 0.5);
            if (d > lim && d > 0) { e.x = f.x + dx / d * lim; e.y = f.y + dy / d * lim; }
          }
          if ((f.tk -= dt) <= 0) {
            f.tk = 0.35; f.k++;
            for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
              if (f.inside.size < 40) f.inside.add(e);
              if (!f.ghost) hit(pl, e, atk(pl, m) * f.n / 3, sacred ? '#ffd23f' : col, 0, 0, 0, m, f.k % 2 ? FIRE_B1 : FIRE_O);
            }
            if (sees(f.x, f.y)) G.Audio.sfx('grass');
          }
          return false;
        },
        end(f) {
          if (!sacred) return;
          // Pilar de fuego sagrado al acabar.
          const r = 50 * areaK(m);
          if (sees(f.x, f.y, r)) {
            G.FX.ring(f.x, f.y, 4, r, '#ffd23f', 0.4, 4);
            for (let i = 0; i < 14; i++) G.FX.sp('fire', 'sacred', f.x + G.U.rand(-r, r) * 0.4, f.y - G.U.rand(0, 40), { vy: -G.U.rand(160, 260), life: 0.5, angle: -Math.PI / 2, scale: 1.5 });
            G.Audio.sfx('break'); G.Camera.kick(0.15);
          }
          areaHit(pl, m, f.x, f.y, r, atk(pl, m) * 3, { knock: 80, ho: { type: 'fire', burn: 2 }, ghost: f.ghost });
        },
        dg(ctx, f, own, t) {
          const a = Math.min(1, (f.life - f.t) * 3, f.t * 8) * own;
          ctx.globalAlpha = 0.25 * a; ctx.fillStyle = sacred ? '#ffd23f' : '#ff6a1f';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 0.85 * a;
          const P = G.VFX.PAL[sacred ? 'sacred' : 'fire'], n = 18;
          for (let i = 0; i < n; i++) {
            const ang = i / n * 6.2832 + f.rot * 0.3;
            ctx.fillStyle = P[i % 2 ? 3 : 2];
            ctx.fillRect(Math.round(f.x + Math.cos(ang) * f.r) - 1, Math.round(f.y + Math.sin(ang) * f.r * 0.55) - 1, 3, 3);
          }
        },
        da(ctx, f, own) {
          const a = Math.min(1, (f.life - f.t) * 3, f.t * 8) * own;
          for (let i = 0; i < f.n; i++) {
            const ang = f.rot + i * 6.2832 / f.n, s = Math.sin(ang);
            G.VFX.draw(ctx, 'fire', sacred ? 'sacred' : 'fire', f.x + Math.cos(ang) * f.r, f.y + s * f.r * 0.55 - 10 - (s < 0 ? 4 : 0),
                       { angle: -Math.PI / 2, scale: 1.5, alpha: a, frame: Math.floor(f.t * 12 + i) });
          }
        } });
      snd('shot', tg.x, tg.y, { kind: 'orbit', type: 'fire' });
    }
  };

  // ---- Onda Ígnea → Erupción ----
  function eruption(pl, m) {
    const g = ghost, frac = G.U.clamp(pl.maxHp ? pl.hp / pl.maxHp : 1, 0, 1);
    // Rocas de lava según tu vida: 8 con la vida llena, 3 con un 30 % (el daño también).
    const n = Math.round(3 + 5 * G.U.clamp((frac - 0.3) / 0.7, 0, 1)), k = 0.6 + 0.8 * frac, sz = (m.size || 7) / 7;
    const near = g ? [] : nearestN(pl.x, pl.y, 180 * sz, n);
    if (sees(pl.x, pl.y)) {
      for (let i = 0; i < 6; i++) G.FX.sp('vapor', 'lava', pl.x + G.U.rand(-10, 10), pl.y - G.U.rand(0, 16), { vy: -G.U.rand(60, 110), life: 0.9, scale: 1.2 });
      G.FX.ring(pl.x, pl.y, pl.r, pl.r * 3, '#ff4a1f', 0.3, 3);
      G.Audio.sfx('break');
    }
    for (let i = 0; i < n; i++) {
      const e = near[i], a = Math.random() * 6.2832, d = G.U.rand(30, 160) * sz;
      const x = e ? e.x + G.U.rand(-8, 8) : pl.x + Math.cos(a) * d, y = e ? e.y + G.U.rand(-6, 6) : pl.y + Math.sin(a) * d * 0.8;
      const t = 0.45 + i * 0.07;
      later(pl, m, t, x, y, f => {
        const r = 30 * sz;
        if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, r, '#ff6a1f', 0.3, 3); G.FX.burst(f.x, f.y - 4, '#ff8a3d', 8, 140); G.Audio.sfx('thud'); }
        areaHit(pl, m, f.x, f.y, r, atk(pl, m) * k, { knock: 60, ho: FIRE_B1, ghost: f.ghost });
        zone(pl, m, { elem: 'lava', x: f.x, y: f.y, r: 22 * sz, life: 1, every: 0.3, dmg: atk(pl, m) * 0.25, burn: 1, ghost: f.ghost });
      }, { ghost: g, pad: 200, fall: t,
        dg(ctx, f, own) {
          const q = Math.min(1, f.t / f.fall);
          ctx.globalAlpha = (0.15 + 0.3 * q) * own; ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.ellipse(f.x, f.y, 14 * q + 4, (14 * q + 4) * 0.5, 0, 0, 6.2832); ctx.fill();
        },
        da(ctx, f, own) {
          const q = Math.min(1, f.t / f.fall);
          G.VFX.draw(ctx, 'rock', 'lava', f.x + (1 - q) * 30, f.y - (1 - q) * 170 - 6, { scale: 1.5, alpha: own, frame: Math.floor(f.t * 10) });
        } });
    }
  }
  MECH['heat-wave'] = {
    cast(pl, m) {
      if (m.evolved) { eruption(pl, m); return; }
      const g = ghost, sun = wx() === 'sun', col = TCOL(m.type);
      // Ola de calor: un frente en arco que avanza despacio; con sol, llega el doble y quema el doble.
      const arc = Math.min(6.2832, 2.8 * Math.sqrt(Math.max(1, m.count | 0) / 10)), reach = 200 * ((m.size || 7) / 7) * (sun ? 2 : 1);
      const sp = 120 * ((m.speed || 250) / 250);
      // (Más llamas = un frente más ancho y que pega más.)
      const dk = 1.2 * Math.sqrt(Math.max(1, m.count | 0) / 10);
      addField({ owner: pl, m, tag: 'hwave', x: pl.x, y: pl.y, ang: pl.aim, arc, reach, sp, r: 8, hits: new Set(), life: reach / sp + 0.2,
                 pad: reach + 30, ho: { burn: sun ? 2 : 1 }, dk,
        upd(f) {
          f.r = Math.min(f.reach, 8 + f.sp * f.t);
          for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r + 10)) {
            if (f.hits.has(e.id)) continue;
            const d = Math.hypot(e.x - f.x, e.y - f.y);
            if (d < f.r - 18 - e.r || !inArc(f.x, f.y, e.x, e.y, f.ang, f.arc / 2)) continue;
            f.hits.add(e.id);
            if (!f.ghost) hit(pl, e, atk(pl, m) * f.dk, col, e.x - f.x, e.y - f.y, 60, m, f.ho);
          }
          return false;
        },
        da(ctx, f, own, t) {
          const a = own * Math.min(1, (f.life - f.t) * 4) * 0.8, P = G.VFX.PAL.fire, n = Math.max(10, Math.ceil(f.r * f.arc / 5));
          for (let i = 0; i <= n; i++) {
            const ang = f.ang - f.arc / 2 + f.arc * i / n, wob = Math.sin(i * 1.3 + t * 18) * 3;
            const x = f.x + Math.cos(ang) * (f.r + wob), y = f.y + Math.sin(ang) * (f.r + wob) * 0.75 - G.LIFT * 0.4;
            ctx.globalAlpha = a; ctx.fillStyle = P[i % 3 ? 2 : 3];
            ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 3, 4);
            ctx.globalAlpha = a * 0.5; ctx.fillStyle = P[4];
            ctx.fillRect(Math.round(f.x + Math.cos(ang) * (f.r - 7)), Math.round(f.y + Math.sin(ang) * (f.r - 7) * 0.75 - G.LIFT * 0.4 + wob), 2, 2);
          }
        } });
      if (sees(pl.x, pl.y)) G.Audio.sfx('surge');
    }
  };

  // ---- Fuego Fatuo → Infierno: llamas que se pegan ----
  const STUCK = [];
  function stick(pl, m, e, g) {
    const dur = 5 * (pkOf(m).dur || 1);
    if (!g) inflict(pl, e, 'atkdown', dur, 0.5);
    for (const s of STUCK) if (s.e === e && s.pl === pl) { s.t = now() + dur; return; }
    let n = 0, first = -1;
    for (let i = 0; i < STUCK.length; i++) if (STUCK[i].pl === pl) { if (first < 0) first = i; n++; }
    if (n >= 6) STUCK.splice(first, 1);
    STUCK.push({ e, pl, m, t: now() + dur, g });
  }
  function wispShot(pl, m, x, y, tg, g) {
    G.Projectiles.spawn(Object.assign({
      x, y, vx: 0, vy: -70, dmg: atk(pl, m), r: m.size || 7, life: 2.4, pierce: 0, color: TCOL('fire'), hits: new Set(),
      vis: G.VFX.forMove(m), ghost: g, owner: pl, tg, sp: m.speed || 300,
      upd3(p, dt) {
        if (!p.tg || p.tg.dead) p.tg = nearestE(p.x, p.y, 280);
        if (p.tg) {
          const sp = Math.min(p.sp, 80 + p.t * 700), [nx, ny] = G.U.norm(p.tg.x - p.x, p.tg.y - p.tg.bodyH * 0.3 - p.y);
          p.vx = G.U.damp(p.vx, nx * sp, 7, dt); p.vy = G.U.damp(p.vy, ny * sp, 7, dt);
        }
        return false;
      },
      onHit(p, e, _d, _c, gg = p.ghost) { stick(pl, m, e, gg); }
    }, payload(m), { burn: 3, slow: 0 }));
  }
  MX_TICK.push(dt => {
    if (!STUCK.length) return;
    const T = now();
    for (let i = STUCK.length - 1; i >= 0; i--) {
      const s = STUCK[i];
      if (s.e.dead) {
        STUCK.splice(i, 1);
        // Infierno: si cae el que la lleva, la llama se parte y salta a los 2 más cercanos.
        if (s.m.evolved && !s.pl.dead) {
          for (const t of nearestN(s.e.x, s.e.y, 160, 2, new Set([s.e.id]))) wispShot(s.pl, s.m, s.e.x, s.e.y - s.e.bodyH, t, s.g);
          if (sees(s.e.x, s.e.y)) G.FX.burst(s.e.x, s.e.y - s.e.bodyH, '#ff3a5a', 10, 140);
        }
      } else if (T > s.t) STUCK.splice(i, 1);
    }
  });
  MX_DRAW.push((ctx, own, t) => {
    for (const s of STUCK) {
      const e = s.e;
      if (e.dead || !G.Camera.sees(e.x, e.y, 20)) continue;
      G.VFX.draw(ctx, 'wisp', s.m.evolved ? 'crimson' : 'wisp', e.x + 6, e.y - e.bodyH - 6 + Math.sin(t * 6 + e.id) * 1.5,
                 { alpha: own * 0.9, frame: Math.floor(t * 10 + e.id), scale: s.m.evolved ? 1.5 : 1 });
    }
  });
  MX_RESET.push(() => { STUCK.length = 0; });
  MECH['will-o-wisp'] = {
    cast(pl, m) {
      const n = 2 + Math.max(1, m.count | 0), life = m.dur || 6;
      const f = mxFind(pl, 'wisps', m.id);
      if (f) { f.t = 0; f.life = life; f.n = n; f.m = m; return; }
      addField({ owner: pl, m, tag: 'wisps', x: pl.x, y: pl.y, life, n, rel: 0.4, ang: 0, k: 0, pad: 90,
        upd(f, dt) {
          if (pl.dead) return true;
          f.x = pl.x; f.y = pl.y; f.ang += dt * 1.3;
          if ((f.rel -= dt) <= 0) {
            const R = f.m.range || 300;
            // Prefiere a los que aún no arden.
            let tg = null, bd = R * R;
            for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) {
              if (e.dead) continue;
              const d = G.U.dist2(pl.x, pl.y, e.x, e.y) * (e.burn > 0 || (e.net && e.net.st & 1) ? 4 : 1);
              if (d < bd) { bd = d; tg = e; }
            }
            // Uno cada 1,2 s (más fuegos, más seguidos).
            f.rel = tg ? (f.m.rate || 0.55) * 2.2 / Math.max(1, f.m.count | 0) : 0.2;
            if (tg) {
              const i = f.k = (f.k + 1) % f.n, a = f.ang + i * 6.2832 / f.n;
              wispShot(pl, f.m, pl.x + Math.cos(a) * 26, pl.y + Math.sin(a) * 18 - 14, tg, f.ghost);
              f.gone1 = i; f.back = 0.6;
            }
          }
          if (f.back > 0) f.back -= dt;
          return false;
        },
        da(ctx, f, own, t) {
          const fade = Math.min(1, (f.life - f.t) * 2, f.t * 5);
          for (let i = 0; i < f.n; i++) {
            if (f.back > 0 && i === f.gone1) continue;                // ésa acaba de salir
            const a = f.ang + i * 6.2832 / f.n;
            G.VFX.draw(ctx, 'wisp', f.m.evolved ? 'crimson' : 'wisp', pl.x + Math.cos(a) * 26, pl.y + Math.sin(a) * 18 - 16 + Math.sin(t * 4 + i) * 2,
                       { alpha: own * fade * 0.85, frame: Math.floor(t * 9 + i) });
          }
        } });
    }
  };

  // ---- Rueda Fuego → Envite Ígneo ----
  MECH['flame-wheel'] = {
    tick(pl, m, dt) {
      const s = stOf(m), mv = moved(pl, s, 0.6);
      s.still = mv ? 0 : (s.still || 0) + dt;
      if (mv) s.run = (s.run || 0) + dt; else if (s.still > 0.2) s.run = 0;
      if (!mxFind(pl, 'wheel', m.id)) {
        addField({ owner: pl, m, tag: 'wheel', x: pl.x, y: pl.y, pad: 60, ghost: false, rot: 0,
          upd(f, dt2) { f.x = pl.x; f.y = pl.y; f.rot += dt2 * 14; return pl.dead || !pl.activeGroup().includes(m); },
          dg(ctx, f, own) {
            if (!(s.run > 0)) return;
            const ramp = 1 + Math.min(1, s.run / 2), a = pl.moveAngle;
            G.VFX.draw(ctx, 'wheel', ramp >= 2 ? (m.evolved ? 'whitehot' : 'electric') : 'fire', pl.x + Math.cos(a) * 14, pl.y + Math.sin(a) * 9 - 4,
                       { angle: f.rot, scale: 1 + (ramp - 1) * 0.6, alpha: own });
          } });
      }
    },
    cast(pl, m) {
      const g = ghost, s = stOf(m), col = TCOL(m.type);
      trailPatch(pl, m);                                            // el rastro de siempre
      if (g) { if (sees(pl.x, pl.y)) G.FX.sp('wheel', 'fire', pl.x, pl.y - 4, { life: 0.2, spin: 14 }); return; }
      if (!(s.run > 0)) return;
      // La rueda pega más cuanto más rato llevas corriendo (×1 → ×2 en 2 s).
      const ramp = 1 + Math.min(1, s.run / 2), a = pl.moveAngle, ca = Math.cos(a), sa = Math.sin(a);
      const x = pl.x + ca * 16, y = pl.y + sa * 12, r = (m.radius || 28) * 0.95;
      for (const e of G.EnemyMgr.queryCircle(x, y, r)) {
        if (e.dead) continue;
        if (m.evolved && ramp >= 2) {
          // Envite Ígneo: a tope, cometa que estalla; retroceso del 3 % de tu vida y la rueda vuelve a ×1.
          const R = 80 * areaK(m);
          if (sees(e.x, e.y, R)) { G.FX.ring(e.x, e.y, 4, R, '#fff2a0', 0.35, 5); G.FX.burst(e.x, e.y - 8, '#ffb22e', 20, 240); G.Audio.sfx('break'); G.Camera.kick(0.25); }
          areaHit(pl, m, e.x, e.y, R, atk(pl, m) * 3, { knock: 260, ho: { type: 'fire', burn: 2 } });
          toss(e, ca * 520, sa * 520, 0.35, { pl, m, dmg: atk(pl, m), k: 0.5, ghost: false });
          pl.hp = Math.max(1, pl.hp - pl.hp * 0.03);
          s.run = 0;
          return;
        }
        hit(pl, e, atk(pl, m) * ramp, col, ca, sa, 60, m);
      }
    }
  };

  // ---- Nitrocarga → Golpe Calor ----
  MECH['flame-charge'] = {
    cast(pl, m) {
      const g = ghost, col = TCOL(m.type), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
      const stacks = g ? 0 : stacksOf(pl, 'spd', m.id);
      const want = m.radius * (1 + 0.15 * stacks);                 // llega un 15 % más lejos por pila
      const sx = pl.x, sy = pl.y, len = g ? want * 0.8 : pathLen(pl, ca, sa, want);
      const ex = sx + ca * len, ey = sy + sa * len;
      afterimages(pl, [0.3, 0.6].map(q => (g ? { x: sx - ca * len * (1 - q), y: sy - sa * len * (1 - q) } : { x: sx + ca * len * q, y: sy + sa * len * q })), 0.25, m.evolved ? '#ff4a1f' : '#ff9a3c');
      zone(pl, m, { elem: 'fire', shape: 'line', x1: g ? sx - ca * len : sx, y1: g ? sy - sa * len : sy, x2: g ? sx : ex, y2: g ? sy : ey, w: 18,
                    life: 1, every: 0.3, dmg: atk(pl, m) * 0.12, burn: 1, ghost: g });
      if (g) return;
      pl.x = ex; pl.y = ey; G.World.collide(pl);
      invul(pl, 0.3);
      const carried = [];
      let n = 0;
      for (const e of onSeg(sx, sy, ex, ey, m.width || 36)) {
        const small = !big(e) && !e.champ && e.r < 16;
        if (m.evolved && small && real(e)) carried.push(e);
        hit(pl, e, atk(pl, m) * (m.evolved && !small ? 1.5 : 1), col, ca, sa, m.evolved ? 0 : m.knock || 0, m);
        n++;
      }
      segProps(sx, sy, ex, ey, m.width || 36, atk(pl, m), col);
      // +1 pila de velocidad por enemigo golpeado (máx 5, 4 s).
      if (pl.buffs) for (let i = 0; i < Math.min(5, n); i++) pl.addBuff('spd', 0.08, 4, 5, m.id);
      if (m.evolved && carried.length) {
        // Golpe Calor: los pequeños van empujados delante de ti y estallan al final.
        const bx = ex + ca * (pl.r + 14), by = ey + sa * (pl.r + 14);
        for (const e of carried) if (!e.dead) { e.x = bx + G.U.rand(-6, 6); e.y = by + G.U.rand(-5, 5); G.World.collide(e); }
        later(pl, m, 0.06, bx, by, f => {
          const r = 40 * areaK(m);
          if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, r, '#ff6a1f', 0.3, 4); G.FX.burst(f.x, f.y - 6, '#ffb22e', 14, 180); G.Audio.sfx('break'); }
          areaHit(pl, m, f.x, f.y, r, atk(pl, m), { knock: 160, ho: FIRE_B1 });
        }, { ghost: false });
      }
      G.Camera.kick(0.12);
    }
  };

  // ---- Balón Ígneo → V de Fuego: pase y chut ----
  function pyroKickFx(o, evo) {
    if (!sees(o.x, o.y)) return;
    G.FX.sp('impact', evo ? 'whitehot' : 'normal', o.x + Math.cos(o.aim) * 6, o.y - 4, { life: 0.12, scale: 1 });
    G.Audio.sfx('thud');
  }
  /** V de Fuego: dos rayos de fuego en V (±20°) hasta el borde de la caja que dejan líneas de fuego. */
  function vCreate(pl, m, a, g) {
    for (const s of [-0.35, 0.35]) {
      const b = a + s, ca = Math.cos(b), sa = Math.sin(b), len = rayLen(pl.x, pl.y, ca, sa, 400);
      G.FX.beam(pl.x, pl.y - G.LIFT, b, len, 16, '#ff3a1f', { pal: 'fire', beam: 'fire' });
      zone(pl, m, { elem: 'fire', shape: 'line', x1: pl.x, y1: pl.y, x2: pl.x + ca * len, y2: pl.y + sa * len, w: 16, life: 1.5, every: 0.35,
                    dmg: atk(pl, m) * 0.3, burn: 1, ghost: g });
      if (!g) for (const e of onSeg(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, 18)) hit(pl, e, atk(pl, m) * 1.2, '#ff3a1f', ca, sa, 60, m, FIRE_B1);
    }
    if (sees(pl.x, pl.y)) { G.Audio.sfx('surge'); G.Camera.kick(0.2); }
  }
  function pyroUpd(p, dt) {
    const o = p.owner, m = p.src;
    if (p.mode === 'go') {
      if (!p.tg || p.tg.dead) p.tg = nearestE(p.x, p.y, 300);
      if (p.tg) steerTo(p, p.tg.x, p.tg.y, 9, dt);
      if (p.t > 2.2 || !p.tg) { p.mode = 'ret'; p.hits.clear(); }
    } else {
      steerTo(p, o.x, o.y, 12, dt);
      if (G.U.dist2(p.x, p.y, o.x, o.y) < (o.r + 10) ** 2) {
        // Vuelve a tus pies y lo vuelves a chutar (hasta 4): +25 % de daño y +15 % de velocidad.
        if (p.kick >= 4 || o.dead) return true;
        p.kick++; p.dmg *= 1.25; p.sp *= 1.15; p.mode = 'go'; p.t = 0; p.hits.clear();
        p.tg = nearestE(o.x, o.y, 400);
        const a = p.tg ? Math.atan2(p.tg.y - o.y, p.tg.x - o.x) : o.aim;
        p.x = o.x; p.y = o.y; p.vx = Math.cos(a) * p.sp; p.vy = Math.sin(a) * p.sp;
        pyroKickFx(o, m.evolved);
        if (p.kick === 4 && m.evolved) vCreate(o, m, a, p.ghost);
      }
    }
    const s = Math.hypot(p.vx, p.vy) || 1;
    p.vx *= p.sp / s; p.vy *= p.sp / s;
    return false;
  }
  function pyroHit(p, e, _d, _c, gg = p.ghost, pl = p.owner) {
    if (p.mode !== 'go') return true;                            // de vuelta: atraviesa
    if (p.kick >= 4) {
      // El 4.º estalla.
      const r = 50 * ((p.r || 8) / 8);
      if (sees(e.x, e.y)) { G.FX.ring(e.x, e.y, 4, r, '#ffb22e', 0.3, 4); G.FX.burst(e.x, e.y - 6, '#ff6a1f', 16, 200); G.Audio.sfx('break'); }
      if (!gg) areaHit(p.owner, p.src, e.x, e.y, r, p.dmg * 0.8, { knock: 120, ho: FIRE_B1 });
      p.t = p.life; p.noHit = true;
      return true;
    }
    p.mode = 'ret'; p.hits.clear(); p.hits.add(e.id);
    return true;
  }
  MECH['pyro-ball'] = {
    cast(pl, m) {
      const g = ghost, list = G.Projectiles.all();
      for (let i = list.length - 1; i >= 0; i--) if (list[i].pyro && list[i].owner === pl) list.splice(i, 1);
      const n = Math.max(1, m.count | 0), tgs = g ? [] : nearestN(pl.x, pl.y, 400, n);
      for (let i = 0; i < n; i++) {
        const tg = tgs[i] || tgs[0] || null, a = tg ? Math.atan2(tg.y - pl.y, tg.x - pl.x) : pl.aim + (i - (n - 1) / 2) * 0.4;
        shoot(pl, m, a, { pyro: true, kick: 1, tg, life: 9, pierce: Infinity, mode: 'go', sp: m.speed || 320, homing: 0,
                          upd3: pyroUpd, onHit: pyroHit, onWall: p => { p.mode = 'ret'; p.hits.clear(); return true; } });
      }
      pyroKickFx(pl, m.evolved);
    }
  };

  // ---- Voto Fuego → Lluvia Ígnea ----
  function pledgeReact(f, type) {
    if (f.react) return;
    f.react = type;
    if (type === 'grass') {
      // Con Planta: mar de llamas (×1,5 de radio y de daño, 2 s más).
      f.r *= 1.5; f.r0 = f.r; f.dmg *= 1.5; f.life += 2; f.col = '#ff4a1f'; f.pad = f.r * 1.5;
      if (sees(f.x, f.y)) { G.FX.burst(f.x, f.y - 6, '#ff9a3c', 16, 200); G.FX.ring(f.x, f.y, 4, f.r, '#ff4a1f', 0.4, 4); G.Audio.sfx('break'); }
    } else {
      // Con Agua: arcoíris 4 s (a los jugadores de dentro, +15 % de crítico y regeneración).
      f.gone = true;
      zone(f.owner, f.m, { elem: 'rainbow', x: f.x, y: f.y, r: Math.max(44, f.r * 1.3), life: 4, every: 1, dmg: 0, ghost: f.ghost, fx: 10, tickFn: rainbowTick });
      if (sees(f.x, f.y)) G.Audio.sfx('confirm');
    }
  }
  function rainbowTick(z, dt) {
    const me = G.Game.player;
    if (!me || me.dead || !me.maxHp || G.U.dist2(me.x, me.y, z.x, z.y) > z.r * z.r) return;
    const px = P3(me);
    px.critK = 0.15; px.critT = now() + 0.3;
    const h = Math.min(me.maxHp - me.hp, me.maxHp * 0.01 * dt);
    if (h > 0) { me.hp += h; if (me.healed != null) me.healed += h; }
  }
  function lavaBall(f, e) {
    const pl = f.owner, sx = f.x, sy = f.y, tx = e.x, ty = e.y;
    later(pl, f.m, 0.5, tx, ty, o => {
      if (sees(o.x, o.y)) { G.FX.ring(o.x, o.y, 4, 24, '#ff6a1f', 0.25, 3); G.FX.burst(o.x, o.y - 4, '#ff8a3d', 6, 110); G.Audio.sfx('thud'); }
      areaHit(pl, f.m, o.x, o.y, 24, f.dmg * 1.5, { knock: 40, ho: FIRE_B1, ghost: o.ghost });
    }, { ghost: f.ghost, pad: 200,
      da(ctx, o, own) {
        const q = Math.min(1, o.t / 0.5), h = 70 * 4 * q * (1 - q);
        G.VFX.draw(ctx, 'rock', 'lava', sx + (tx - sx) * q, sy + (ty - sy) * q - h - 6, { alpha: own, frame: Math.floor(o.t * 12) });
      } });
  }
  function pledgeTick(f, dt) {
    // Proyectiles de Planta o Agua (tuyos o de un compañero) que pasan por encima.
    if (!f.react && (f.scan -= dt) <= 0) {
      f.scan = 0.25;
      for (const p of G.Projectiles.all()) {
        if (!p.friendly || p.orb || (p.mtype !== 'grass' && p.mtype !== 'water')) continue;
        if (G.U.dist2(p.x, p.y, f.x, f.y) < f.r * f.r) { pledgeReact(f, p.mtype); break; }
      }
    }
    // Lluvia Ígnea: cada mar es un volcancito que escupe lava al más cercano (cada 0,6 s).
    if (f.m.evolved && (f.volc -= dt) <= 0) {
      f.volc = 0.6;
      const e = nearestE(f.x, f.y, 140);
      if (e) lavaBall(f, e);
    }
  }
  MECH['fire-pledge'] = {
    puddle(f) {
      f.pledge = true; f.scan = 0.25; f.volc = 0.3; f.tickFn = pledgeTick;
      for (let i = PLEDGES.length - 1; i >= 0; i--) if (PLEDGES[i].gone || PLEDGES[i].t >= PLEDGES[i].life) PLEDGES.splice(i, 1);
      PLEDGES.push(f);
      // Al caer brotan columnas de fuego (el Voto de los juegos).
      if (sees(f.x, f.y)) for (let i = 0; i < 5; i++) G.FX.sp('fire', 'fire', f.x + G.U.rand(-f.r, f.r) * 0.7, f.y - 4, { vy: -G.U.rand(90, 150), life: 0.4, angle: -Math.PI / 2, scale: 1.5 });
    }
  };
  /* ==== mech: agua ==== */

  // ---- Pistola Agua → Escaldar ----
  MECH['water-gun'] = {
    cast(pl, m) {
      shootN(pl, m, m.evolved && ghost ? { onHit: (p, e, _d, _c, gg = p.ghost) => { if (gg) zone(pl, m, { elem: 'steam', x: e.x, y: e.y, r: 30, life: 1, every: 0.25, ghost: true }); } } : null);
    },
    afterP(pl, e, m) {
      inflict(pl, e, 'wet', 4);
      // Escaldar: agua hirviendo; deja una nube de vapor que daña.
      if (m.evolved) {
        const s = stOf(m);
        if (!(s.steamAt > now())) {
          s.steamAt = now() + 0.15;
          zone(pl, m, { elem: 'steam', x: e.x, y: e.y, r: 30 * ((m.size || 6) / 6) * 0.85, life: 1, every: 0.25, dmg: atk(pl, m) * 0.18, ghost: false, fx: 10 });
        }
      }
    }
  };

  // ---- Burbuja → Surf ----
  function bubbleUpd(p, dt) {
    // A la deriva: se frenan y se balancean.
    const k = Math.pow(0.4, dt);
    p.vx *= k; p.vy *= k;
    p.x += Math.cos(p.t * 3 + p.ph) * 18 * dt; p.y -= 6 * dt;
    return false;
  }
  function bubbleHit(p, e, _d, _c, gg = p.ghost, pl = p.owner) {
    const m = p.src;
    if (big(e)) { if (!gg) e.applySlow(0.45, 1.2); return; }       // a los jefes sólo los frena
    if (gg && !real(e)) return;
    // Queda DENTRO: flota 1,2 s sin moverse ni tocarte y la burbuja revienta empapándolo.
    const ok = gg ? stAdd(e, 'air', 1.2, 0, { bub: true }) : inflict(pl, e, 'air', 1.2, 0, { bub: true });
    if (!ok || gg) return;
    const d = p.dmg * 1.5;
    later(pl, m, 1.2, e.x, e.y, () => {
      if (e.dead) return;
      if (sees(e.x, e.y)) { G.FX.burst(e.x, e.y - e.bodyH * 0.6, '#bfe8ff', 10, 140); G.FX.sp('bubble', 'water', e.x, e.y - e.bodyH * 0.6, { life: 0.15, scale: 2 }); G.Audio.sfx('select'); }
      hit(pl, e, d, '#8ccaff', 0, 0, 0, m, WATER_RAW);
      inflict(pl, e, 'wet', 4);
    }, { ghost: false });
  }
  function surf(pl, m) {
    const g = ghost, ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
    // Una ola sale de detrás de ti y avanza 320 px hacia donde apuntas arrastrando a los enemigos.
    const W = 130 * ((m.size || 8) / 8), sp = 300 * ((m.speed || 140) / 140), x0 = pl.x - ca * 60, y0 = pl.y - sa * 60, D = 380;
    addField({ owner: pl, m, tag: 'surf', x: x0, y: y0, x0, y0, ca, sa, W, sp, D, life: D / sp + 0.25, hits: new Set(), pad: W + 80, dmg: atk(pl, m) * 2.2,
      upd(f, dt) {
        const d = Math.min(f.D, f.sp * f.t);
        f.x = f.x0 + f.ca * d; f.y = f.y0 + f.sa * d;
        if (f.t > f.D / f.sp) return false;
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.W + 30)) {
          const px = e.x - f.x, py = e.y - f.y, along = px * f.ca + py * f.sa, lat = -px * f.sa + py * f.ca;
          if (Math.abs(lat) > f.W + e.r || along < -26 - e.r || along > 16 + e.r) continue;
          if (!f.hits.has(e.id)) {
            f.hits.add(e.id);
            if (!f.ghost) { hit(pl, e, f.dmg, '#3d8bff', f.ca, f.sa, 0, m); inflict(pl, e, 'wet', 4); }
            else if (real(e)) stAdd(e, 'wet', 4);
            if (!f.ghost && e.remote && !big(e)) shoveE(pl, e, f.ca, f.sa, 340, false);
          }
          // Arrastra a los de delante (quien tiene los enemigos de verdad).
          if (real(e) && !big(e)) {
            const nx = e.x + f.ca * f.sp * dt, ny = e.y + f.sa * f.sp * dt;
            if (e.flying || G.World.isFree(nx, ny, e.r * 0.7)) { e.x = nx; e.y = ny; }
          }
        }
        if (Math.random() < dt * 30 && sees(f.x, f.y, f.W)) {
          const l = G.U.rand(-f.W, f.W);
          G.FX.px(f.x - f.sa * l, f.y + f.ca * l - 10, '#eaf7ff', { vx: f.ca * 60, vy: -60, life: 0.35, size: 2 });
        }
        return false;
      },
      dg(ctx, f, own) {
        const a = own * Math.min(1, (f.life - f.t) * 4, f.t * 8);
        ctx.globalAlpha = 0.3 * a; ctx.fillStyle = '#3d8bff';
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(f.sa, f.ca));
        ctx.fillRect(-34, -f.W, 34, f.W * 2);
        ctx.restore();
      },
      da(ctx, f, own, t) {
        const a = own * Math.min(1, (f.life - f.t) * 4, f.t * 8), n = Math.max(4, Math.round(f.W / 13));
        const ang = Math.atan2(f.sa, f.ca);
        for (let i = 0; i <= n; i++) {
          const l = -f.W + 2 * f.W * i / n, bob = Math.sin(t * 10 + i) * 2;
          G.VFX.draw(ctx, 'wave', 'water', f.x - f.sa * l, f.y + f.ca * l - 12 + bob, { angle: ang, scale: 1.5, alpha: a, frame: (i + Math.floor(t * 8)) % 2 });
        }
      } });
    if (sees(pl.x, pl.y)) G.Audio.sfx('surge');
  }
  MECH['bubble'] = {
    cast(pl, m) {
      const n = Math.max(3, m.count | 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.2832 + G.U.rand(-0.06, 0.06);
        shoot(pl, m, a, { x: pl.x + Math.cos(a) * 6, y: pl.y + Math.sin(a) * 6, life: (m.life || 1.3) * 1.6, slow: 0, pierce: 0, ph: Math.random() * 6.2832,
                          upd3: bubbleUpd, onHit: bubbleHit });
      }
      G.FX.ring(pl.x, pl.y, pl.r, pl.r * 3, '#8ccaff', 0.3, 2);
    },
    evo(pl, m) { surf(pl, m); }
  };

  // ---- Hidrobomba → Hidrocañón ----
  function cannonBurst(p, gg) {
    if (p.burst) return;
    p.burst = true;
    const pl = p.owner, m = p.src, R = 90 * Math.sqrt((m.width || 30) / 30);
    if (sees(p.x, p.y, R)) {
      G.FX.ring(p.x, p.y, 6, R, '#3d8bff', 0.4, 5); G.FX.ring(p.x, p.y, 6, R * 0.7, '#eaf7ff', 0.3, 3);
      G.FX.burst(p.x, p.y - 8, '#8ccaff', 18, 220); G.Audio.sfx('break'); G.Camera.kick(0.2);
    }
    for (const e of G.EnemyMgr.queryCircle(p.x, p.y, R)) {
      const [nx, ny] = G.U.norm(e.x - p.x, e.y - p.y);
      if (!gg) { hit(pl, e, p.dmg * 0.8, '#3d8bff', nx, ny, 300, m, WATER_RAW); inflict(pl, e, 'wet', 4); }
      else if (real(e)) { shoveE(pl, e, nx, ny, 300, true); stAdd(e, 'wet', 4); }
    }
  }
  function cannon(pl, m) {
    const g = ghost;
    // Bala de agua gigante que atraviesa; al chocar con pared, jefe o al final, estalla en ola.
    shoot(pl, m, pl.aim, { speed: 300, r: 18, ds: 3, life: (m.radius || 250) / 300 * 1.2, pierce: Infinity, knock: 80,
      vis: { proj: 'ball', pal: 'water', trail: 'drip' },
      onHit(p, e, _d, _c, gg = p.ghost) { if (big(e)) { cannonBurst(p, gg); p.t = p.life; p.noHit = true; } return true; },
      onWall(p) { cannonBurst(p, p.ghost); return false; },
      end(p) { cannonBurst(p, p.ghost); } });
    if (!g) m.t = Math.max(m.t, cooldown(pl, m) + 0.5);         // luego 0,5 s de recarga
    if (sees(pl.x, pl.y)) G.Audio.sfx('thud');
  }
  MECH['hydro-pump'] = {
    cast(pl, m) {
      const g = ghost, col = TCOL(m.type), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
      const len = rayLen(pl.x, pl.y, ca, sa, m.radius), w = m.width, x0 = pl.x, y0 = pl.y;
      G.FX.beam(x0, y0 - G.LIFT, pl.aim, len, w, col, G.VFX.forMove(m));
      // El chorro dura 0,35 s empujando (y se ven los anillos de presión).
      addField({ owner: pl, m, tag: 'jet', x: x0 + ca * len / 2, y: y0 + sa * len / 2, life: 0.35, pad: len / 2 + 40,
        upd(f, dt) {
          for (const e of onSeg(x0, y0, x0 + ca * len, y0 + sa * len, w)) if (real(e) && !big(e)) { e.x += ca * 160 * dt; e.y += sa * 160 * dt; }
          return false;
        },
        da(ctx, f, own) {
          const P = G.VFX.PAL.water;
          ctx.globalAlpha = own * (1 - f.t / f.life);
          for (let k = 0; k < 4; k++) {
            const d = ((f.t * 900 + k * len / 4) % len), x = x0 + ca * d, y = y0 + sa * d - G.LIFT;
            ctx.strokeStyle = P[4]; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(x, y, 3, w * 0.55, Math.atan2(sa, ca), 0, 6.2832); ctx.stroke();
          }
        } });
      if (g) return;
      G.Camera.kick(0.12);
      for (const e of onSeg(x0, y0, x0 + ca * len, y0 + sa * len, w)) {
        // Presión: ×1,8 pegado a ti, hasta ×0,6 al final.
        const d = Math.hypot(e.x - x0, e.y - y0), k = 1.8 - 1.2 * G.U.clamp(d / Math.max(1, m.radius), 0, 1);
        hit(pl, e, atk(pl, m) * k, col, ca, sa, 260, m);
        inflict(pl, e, 'wet', 4);
      }
      segProps(x0, y0, x0 + ca * len, y0 + sa * len, w, atk(pl, m), col);
    },
    evo(pl, m) { cannon(pl, m); }
  };

  // ---- Acua Aro → Gota Vital ----
  MECH['aqua-ring'] = {
    cast(pl, m) {
      const g = ghost, before = g || !pl.buffs ? 0 : stacksOf(pl, m.stat, m.id);
      buff(pl, m);
      if (!g && pl.buffs && stacksOf(pl, m.stat, m.id) > before) pl.slowT = 0;     // cada pila nueva te quita los frenazos
      const life = m.dur || 8, f0 = mxFind(pl, 'aring', m.id);
      if (f0) { f0.t = 0; f0.life = life; f0.m = m; return; }
      addField({ owner: pl, m, tag: 'aring', x: pl.x, y: pl.y, life, wt: 0, pulse: 2, pad: 160, rot: 0,
        upd(f, dt) {
          if (pl.dead) return true;
          f.x = pl.x; f.y = pl.y; f.rot += dt * 3;
          // Los aros empapan a los que los tocan.
          if ((f.wt -= dt) <= 0) {
            f.wt = 0.4;
            for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 38)) if (!e.dead && (!f.ghost || real(e))) stAdd(e, 'wet', 3);
          }
          // Gota Vital: cada 2 s, un pulso de gotas que cura un 3 % a ti y a los compañeros a 140 px (cada uno el suyo).
          if (f.m.evolved && (f.pulse -= dt) <= 0) {
            f.pulse = 2;
            if (sees(pl.x, pl.y, 140)) {
              G.FX.ring(pl.x, pl.y, pl.r, 140, '#5fe0c0', 0.5, 3);
              for (let i = 0; i < 10; i++) G.FX.sp('drop', 'grass', pl.x + G.U.rand(-120, 120), pl.y - 80 + G.U.rand(-20, 20), { vy: 160, life: 0.5, angle: Math.PI / 2 });
            }
            const me = G.Game.player;
            if (!f.ghost) pl.heal(pl.maxHp * 0.03);
            else if (me && !me.dead && me !== pl && G.U.dist2(me.x, me.y, pl.x, pl.y) < 140 * 140) me.heal(me.maxHp * 0.03);
          }
          return false;
        },
        dg(ctx, f, own) {
          const a = own * Math.min(1, (f.life - f.t) * 2, f.t * 6), P = G.VFX.PAL.water;
          for (let r = 0; r < 2; r++) {
            const R = 26 + r * 9, n = 16;
            for (let i = 0; i < n; i++) {
              const ang = i / n * 6.2832 + f.rot * (r ? -1 : 1);
              ctx.globalAlpha = a * (i % 4 ? 0.55 : 0.9); ctx.fillStyle = P[i % 4 ? 3 : 4];
              ctx.fillRect(Math.round(pl.x + Math.cos(ang) * R) - 1, Math.round(pl.y + Math.sin(ang) * R * 0.45 - pl.bodyH * 0.35 * r) - 1, 2, 2);
            }
          }
        } });
    }
  };

  // ---- Rayo Burbuja → Acua Cola ----
  function bubbleWaveUpd(p, dt) {
    if (p.bx == null) { p.bx = p.x; p.by = p.y; const s = Math.hypot(p.vx, p.vy) || 1; p.ux = p.vx / s; p.uy = p.vy / s; }
    p.bx += p.vx * dt; p.by += p.vy * dt;
    const off = p.lat + Math.sin(p.t * 9 + p.ph) * p.amp;
    // (projectile.js le suma luego vx·dt: se deja justo antes.)
    p.x = p.bx - p.uy * off - p.vx * dt; p.y = p.by + p.ux * off - p.vy * dt;
    return false;
  }
  function floatBubble(p) {
    // Al final de su recorrido se queda flotando 2 s y revienta (frena) si un enemigo la toca.
    const pl = p.owner, m = p.src;
    mxTrim(pl, 'fbub', 19);
    addField({ owner: pl, m, tag: 'fbub', x: p.x, y: p.y, life: 2, dmg: p.dmg, ghost: p.ghost, pad: 30, ph: Math.random() * 6,
      upd(f) {
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, 10)) if (!e.dead) { popBubble(f); return true; }
        return false;
      },
      da(ctx, f, own, t) {
        G.VFX.draw(ctx, 'bubble', 'water', f.x, f.y - G.LIFT * 0.6 + Math.sin(t * 4 + f.ph) * 2, { alpha: own * Math.min(1, (f.life - f.t) * 3), frame: Math.floor(t * 3 + f.ph) });
      } });
  }
  function popBubble(f) {
    if (f.popped) return;
    f.popped = true; f.gone = true;
    if (sees(f.x, f.y)) { G.FX.burst(f.x, f.y - 6, '#bfe8ff', 6, 100); G.Audio.sfx('select'); }
    areaHit(f.owner, f.m, f.x, f.y, 30, f.dmg, { ho: { raw: true, type: 'water', slow: 0.3 }, ghost: f.ghost });
  }
  function aquaTail(pl, m, g) {
    // Acua Cola: un coletazo de agua en arco de 220° que empuja y revienta todas tus burbujas.
    const R = 90 * areaK(m), half = 1.92;
    G.FX.slash(pl.x, pl.y - G.LIFT * 0.5, pl.aim, R, half * 2, '#3d8bff', { pal: 'water', melee: 'impact' });
    if (sees(pl.x, pl.y)) { G.FX.ring(pl.x, pl.y, pl.r, R, '#8ccaff', 0.3, 3); G.Audio.sfx('surge'); }
    if (!g) for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) {
      if (!inArc(pl.x, pl.y, e.x, e.y, pl.aim, half)) continue;
      hit(pl, e, atk(pl, m) * 1.3, '#3d8bff', e.x - pl.x, e.y - pl.y, 200, m, WATER_RAW);
    }
    for (const f of fields) if (f.kind === 'mx' && f.tag === 'fbub' && f.owner === pl && !f.gone) popBubble(f);
  }
  MECH['bubble-beam'] = {
    cast(pl, m) {
      const g = ghost, n = Math.max(2, m.count | 0), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
      // Cortina de burbujas en ondas que frenan.
      for (let i = 0; i < n; i++) {
        const lat = (i / (n - 1) - 0.5) * 34, back = (i % 3) * 7;
        shoot(pl, m, pl.aim, { x: pl.x - ca * back, y: pl.y - sa * back, lat, amp: 14, ph: i * 0.9, life: (m.life || 0.45) * 1.8,
                               upd3: bubbleWaveUpd, end: floatBubble });
      }
      if (m.evolved) later(pl, m, 0.45, pl.x, pl.y, f => aquaTail(pl, m, f.ghost), { ghost: g });
    }
  };

  // ---- Torbellino → Salmuera ----
  MECH['whirlpool'] = {
    cast(pl, m) {
      const g = ghost, tg = g ? null : spotFor(pl, m), col = TCOL(m.type);
      const x = tg ? tg.x : pl.x + Math.cos(pl.aim) * 120, y = tg ? tg.y : pl.y + Math.sin(pl.aim) * 100;
      mxTrim(pl, 'wpool', 1);
      const brine = m.evolved;
      addField({ owner: pl, m, tag: 'wpool', x, y, gx: x, gy: y, life: m.dur || 2.6, r0: m.radius, r: m.radius, pull: m.pull || 150, tk: 0.15, look: 0,
                 water: false, pad: m.radius * 2.2,
        upd(f, dt) {
          if ((f.look -= dt) <= 0) {
            f.look = 0.5;
            const c = crowd(f.x, f.y, 220);
            if (c) { f.gx = c.x; f.gy = c.y; }
            // En el agua del mapa es 1,5 veces más grande y atrae más.
            f.water = G.World.isLiquid(f.x, f.y) && (!G.World.liquidKind || /water|swamp/.test(G.World.liquidKind()));
            f.r = f.r0 * (f.water ? 1.5 : 1);
          }
          // Viaja despacio (40 px/s) hacia el grupo más denso llevándose a los atrapados.
          const dx = f.gx - f.x, dy = f.gy - f.y, d = Math.hypot(dx, dy);
          if (d > 4) { const k = Math.min(d, 40 * dt) / d; f.x += dx * k; f.y += dy * k; }
          const pull = f.pull * (f.water ? 1.5 : 1);
          for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r * 1.4)) {
            if (!real(e)) continue;
            const ex = f.x - e.x, ey = f.y - e.y, de = Math.hypot(ex, ey);
            if (de < 4) continue;
            const k = Math.min(de, pull * dt * (big(e) ? 0.25 : 1));
            e.x += ex / de * k; e.y += ey / de * k;
          }
          if ((f.tk -= dt) <= 0) { f.tk = 0.4; areaHit(pl, m, f.x, f.y, f.r, atk(pl, m), { ghost: f.ghost }); }
          if (Math.random() < dt * 16 && sees(f.x, f.y)) {
            const a = Math.random() * 6.2832, rr = f.r * G.U.rand(0.5, 1);
            G.FX.sp(brine ? 'shard' : 'drop', brine ? 'brine' : 'water', f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.6 - 4,
                    { vx: -Math.sin(a) * 110 - Math.cos(a) * 60, vy: Math.cos(a) * 66 - Math.sin(a) * 36, life: 0.45, angle: a + 1.6 });
          }
          return false;
        },
        end(f) {
          if (!brine) return;
          // Salmuera: al acabar escupe a los atrapados hacia fuera, empapados.
          if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, f.r * 1.4, '#bfe8ff', 0.35, 4); G.FX.burst(f.x, f.y - 6, '#ffffff', 14, 200); G.Audio.sfx('surge'); }
          for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
            const [nx, ny] = G.U.norm(e.x - f.x, e.y - f.y);
            shoveE(pl, e, nx, ny, 320, f.ghost);
            if (!f.ghost) inflict(pl, e, 'wet', 4); else if (real(e)) stAdd(e, 'wet', 4);
          }
        },
        dg(ctx, f, own, t) {
          const a = Math.min(1, (f.life - f.t) * 2, f.t * 6) * own, c1 = brine ? '#7fc8a8' : col;
          ctx.globalAlpha = 0.22 * a; ctx.fillStyle = c1;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 0.65 * a; ctx.strokeStyle = brine ? '#e8fff4' : '#eaf7ff'; ctx.lineWidth = 2;
          for (let k = 0; k < 3; k++) {
            const rr = f.r * (0.3 + k * 0.28), a0 = t * (4 - k * 0.8) + k * 2;
            ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr * 0.6, 0, a0, a0 + 3.6); ctx.stroke();
          }
          if (brine) {
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 6; i++) { const b = t * 2 + i; ctx.fillRect(Math.round(f.x + Math.cos(b) * f.r * 0.6), Math.round(f.y + Math.sin(b) * f.r * 0.36), 2, 2); }
          }
        } });
      if (sees(x, y)) G.Audio.sfx('surge');
    },
    // Salmuera: ×2 a los que tienen menos de la mitad de vida.
    k(pl, e, m) { return m.evolved && e.hp < e.maxHp * 0.5 ? 2 : 1; }
  };

  // ---- Shuriken de Agua → Azote Torrencial ----
  function waterSplit(p) {
    if (p.split) return false;
    p.split = true;
    // Al chocar con una pared se parte en 4 gotas.
    for (let i = 0; i < 4; i++) {
      const a = Math.atan2(-p.vy, -p.vx) + (i - 1.5) * 0.6;
      G.Projectiles.spawn({ x: p.x - p.vx * 0.02, y: p.y - p.vy * 0.02, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: p.dmg * 0.35, r: 4, life: 0.45,
        pierce: 0, color: p.color, hits: new Set(), vis: { proj: 'drop', pal: 'water' }, ghost: p.ghost, owner: p.owner, burn: 0, poison: 0, slow: 0, knock: 0,
        mtype: 'water', mcat: p.mcat, src: p.src, split: true });
    }
    return false;
  }
  MECH['water-shuriken'] = {
    cast(pl, m) {
      const g = ghost, evo = m.evolved, n = evo ? 3 : Math.max(1, m.count | 0), a0 = pl.aim;
      const burst = { n, tgt: null, same: true, hits: 0 }, every = Math.min(0.05, cooldown(pl, m) * 0.8 / n), sp = m.spread || 0;
      const fireOne = i => shoot(pl, m, a0 + G.U.rand(-sp, sp), Object.assign({ burst, idx: i, ghost: g },
        evo ? { r: (m.size || 5) * 2.2, ds: 2, pierce: 2, speed: (m.speed || 460) * 0.8, onWall: waterSplit } : null));
      fireOne(0);                                                   // prioridad: la primera sale al instante
      if (n > 1) {
        addField({ owner: pl, m, tag: 'wburst', x: pl.x, y: pl.y, i: 1, next: every, every, pad: 40,
          upd(f, dt) {
            if (pl.dead) return true;
            f.x = pl.x; f.y = pl.y; f.next -= dt;
            while (f.next <= 0 && f.i < n) { f.next += f.every; fireOne(f.i++); }
            return f.i >= n;
          } });
      }
    },
    k(pl, e, m, d, p) {
      const b = p && p.burst;
      if (!b || m.evolved || b.n < 2) return 1;
      // Remate: si todos los de la ráfaga dan al mismo, el último ×2.
      return p.idx === b.n - 1 && b.same && b.hits === b.n - 1 && e.id === b.tgt ? 2 : 1;
    },
    afterP(pl, e, m, p) {
      const b = p && p.burst;
      if (!b) return;
      if (b.tgt == null) b.tgt = e.id; else if (b.tgt !== e.id) b.same = false;
      b.hits++;
    },
    crit(pl, e, m) { return m.evolved ? 1 : 0; }                    // Azote Torrencial: siempre críticas
  };

  // ---- Cascada → Pulso Primigenio ----
  function primal(pl, m, x, y, g, rot) {
    for (let i = 0; i < 8; i++) {
      const a = rot + i * 0.785, ca = Math.cos(a), sa = Math.sin(a), L = 140 * areaK(m);
      G.FX.beam(x, y - G.LIFT, a, L, 6, '#3a7cff', { pal: 'aura', beam: 'shard' });
      if (!g) for (const e of onSeg(x, y, x + ca * L, y + sa * L, 12)) hit(pl, e, atk(pl, m) * 0.45, '#3a7cff', ca, sa, 20, m, WATER_RAW);
    }
  }
  function waterfallStrike(f) {
    const m = f.m, hw = f.w / 2, hh = f.h / 2;
    // Arrastra corriente abajo (quien tiene los enemigos) e interrumpe en el primer golpe.
    for (const e of G.EnemyMgr.queryCircle(f.x, f.y, Math.hypot(hw, hh))) {
      if (Math.abs(e.x - f.x) > hw + e.r || Math.abs(e.y - f.y) > hh) continue;
      if (real(e) && !big(e)) { e.kx += f.flow[0] * 140; e.ky += f.flow[1] * 140; }
      if (f.first && (!f.ghost || real(e))) interrupt(e);
    }
    f.first = false;
    if (m.evolved) { f.rot = (f.rot || 0) + 0.39; primal(f.owner, m, f.x, f.y, f.ghost, f.rot); }
  }
  MECH['waterfall'] = {
    cast(pl, m) {
      const g = ghost, ca = Math.cos(pl.aim), sa = Math.sin(pl.aim);
      column(pl, m);
      const f = fields[fields.length - 1];
      if (f && f.kind === 'column') { f.flow = [ca, sa]; f.onStrike = waterfallStrike; f.first = true; }
      // Te impulsa 80 px corriente abajo.
      if (!g) addField({ owner: pl, m, tag: 'wfall', x: pl.x, y: pl.y, life: 0.3, left: 80, ca, sa, pad: 40,
        upd(o, dt) {
          const step = Math.min(o.left, 420 * dt);
          o.left -= step;
          const nx = pl.x + o.ca * step, ny = pl.y + o.sa * step;
          if (G.World.isFree(nx, ny, (pl.wr || pl.r) * 0.8, true)) { pl.x = nx; pl.y = ny; }
          return o.left <= 0;
        } });
      if (sees(pl.x, pl.y)) G.Audio.sfx('surge');
    }
  };
  /* ==== mech: planta ==== */

  // ---- Látigo Cepa → Latigazo ----
  /** Trae al enemigo hasta tus pies (quien tiene los enemigos de verdad). */
  function pullTo(pl, e, tx, ty, t) {
    if (!real(e) || big(e)) return;
    const sx = e.x, sy = e.y;
    addField({ owner: pl, x: sx, y: sy, life: t + 0.05, ghost: true, pad: 120, tag: 'pull',
      upd(f) {
        if (e.dead) return true;
        const k = Math.min(1, f.t / t);
        e.x = sx + (tx - sx) * k; e.y = sy + (ty - sy) * k;
        return k >= 1;
      } });
  }
  function sentinels(pl, m) {
    const col = TCOL(m.type), f0 = mxFind(pl, 'vines', m.id);
    if (f0) { f0.t = 0; f0.m = m; return; }
    // Latigazo: 4 lianas brotan a 60 px de ti 4 s; azotan al que entra y lo atraen hacia ti.
    addField({ owner: pl, m, tag: 'vines', x: pl.x, y: pl.y, life: 4, pad: 170, cd: [0, 0.12, 0.24, 0.36], whip: [null, null, null, null],
      upd(f, dt) {
        if (pl.dead) return true;
        f.x = pl.x; f.y = pl.y;
        for (let i = 0; i < 4; i++) {
          const w = f.whip[i];
          if (w && (w.t -= dt) <= 0) f.whip[i] = null;
          if ((f.cd[i] -= dt) > 0) continue;
          const a = 0.785 + i * 1.5708, bx = pl.x + Math.cos(a) * 60, by = pl.y + Math.sin(a) * 42;
          const e = nearestE(bx, by, 90 * areaK(m));
          if (!e) continue;
          f.cd[i] = 0.45;
          f.whip[i] = { x: e.x, y: e.y, t: 0.22 };
          if (!f.ghost) hit(pl, e, atk(pl, f.m) * 1.4, col, e.x - bx, e.y - by, 0, f.m);
          const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y), D = Math.max(pl.r + e.r + 4, G.U.dist(pl.x, pl.y, e.x, e.y) * 0.45);
          pullTo(pl, e, pl.x + nx * D, pl.y + ny * D, 0.12);
          if (sees(bx, by)) G.Audio.sfx('grass');
        }
        return false;
      },
      dg(ctx, f, own, t) {
        const P = G.VFX.PAL.grass, fade = Math.min(1, (f.life - f.t) * 3, f.t * 6);
        ctx.globalAlpha = own * fade;
        for (let i = 0; i < 4; i++) {
          const a = 0.785 + i * 1.5708, bx = pl.x + Math.cos(a) * 60, by = pl.y + Math.sin(a) * 42, w = f.whip[i];
          const sway = Math.sin(t * 3 + i) * 6;
          drawVine(ctx, bx, by, w ? w.x : bx + sway, w ? w.y - 6 : by - 22, P, t + i, 4);
          ctx.fillStyle = P[1]; ctx.fillRect(Math.round(bx) - 4, Math.round(by) - 1, 8, 3);
        }
      } });
  }
  MECH['vine-whip'] = {
    cast(pl, m) {
      if (m.evolved) { sentinels(pl, m); return; }
      const g = ghost, col = TCOL(m.type), len = m.radius * 1.3, d = atk(pl, m);
      // Al máximo (la mejora de 360°), tres lianas en vez de una: delante y a los lados.
      const dirs = m.arc >= 6 ? [0, -0.6, 0.6] : [0];
      for (const off of dirs) {
        const a = pl.aim + off, ca = Math.cos(a), sa = Math.sin(a), x1 = pl.x + ca * len, y1 = pl.y + sa * len;
        const list = onSeg(pl.x, pl.y, x1, y1, 20);
        // Dos lianas que se estiran, agarran al primero y vuelven.
        addField({ owner: pl, m, tag: 'whip', x: pl.x, y: pl.y, life: 0.28, pad: len + 30, ca, sa, len,
          da(ctx, f, own, t) {
            const k = Math.sin(Math.PI * Math.min(1, f.t / f.life)), P = G.VFX.PAL.grass;
            ctx.globalAlpha = own;
            for (const s of [-5, 5]) {
              const ox = -f.sa * s, oy = f.ca * s * 0.6;
              drawVine(ctx, pl.x + ox, pl.y + oy - G.LIFT * 0.5, pl.x + ox + f.ca * f.len * k, pl.y + oy + f.sa * f.len * k - G.LIFT * 0.5, P, t * 2 + s, 3);
            }
          } });
        list.forEach((e, i) => {
          if (!g) hit(pl, e, d, col, ca, sa, 0, m);
          // TIRAN del primero hasta tus pies (aturdido 0,25 s); el resto sólo recibe daño.
          if (i === 0 && !e.dead && (!g || real(e))) {
            pullTo(pl, e, pl.x + ca * (pl.r + e.r + 2), pl.y + sa * (pl.r + e.r + 2), 0.12);
            if (!g) e.applyStun(0.25 * (big(e) ? 0.35 : 1));
          }
        });
        if (!g) segProps(pl.x, pl.y, x1, y1, 20, d, col);
      }
      if (sees(pl.x, pl.y)) G.Audio.sfx('grass');
    }
  };

  // ---- Hoja Afilada → Lluevehojas ----
  function leafUpd(p, dt) {
    if (!p.tg || p.tg.dead) p.tg = nearestE(p.x, p.y, 300, p.hits);
    if (p.tg) {
      // Gira hacia el blanco a ritmo fijo: vuela en arco.
      const want = Math.atan2(p.tg.y - p.y, p.tg.x - p.x), cur = Math.atan2(p.vy, p.vx);
      let d = want - cur;
      while (d > Math.PI) d -= 6.2832;
      while (d < -Math.PI) d += 6.2832;
      const na = cur + Math.max(-p.rate * dt, Math.min(p.rate * dt, d)), sp = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
    }
    return false;
  }
  function leafSpiral(pl, m) {
    const g = ghost, tg = g ? null : aimTarget(pl, 360), col = TCOL(m.type);
    const cx = tg ? tg.x : pl.x + Math.cos(pl.aim) * 140, cy = tg ? tg.y : pl.y + Math.sin(pl.aim) * 140;
    const R = 120 * ((m.size || 6) / 6), n = 12 + Math.max(0, (m.count | 0) - 2) * 2;
    // 12 hojas en espiral alrededor del blanco que se cierran en 0,8 s cortando todo lo de dentro.
    addField({ owner: pl, m, tag: 'lspiral', x: cx, y: cy, life: 0.9, R, r: R, n, log: new Map(), tk: 0, pad: R + 40, rot: Math.random() * 6, tg,
      upd(f, dt) {
        if (f.tg && !f.tg.dead) { f.x += (f.tg.x - f.x) * Math.min(1, dt * 6); f.y += (f.tg.y - f.y) * Math.min(1, dt * 6); }
        f.rot += dt * 5;
        f.r = f.R * Math.max(0, 1 - f.t / 0.8);
        if ((f.tk -= dt) <= 0 && !f.ghost) {
          f.tk = 0.08;
          for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r + 12)) {
            if (G.U.dist(e.x, e.y, f.x, f.y) < f.r - 18 - e.r) continue;
            const last = f.log.get(e.id);
            if (last !== undefined && f.t - last < 0.3) continue;
            f.log.set(e.id, f.t);
            hit(pl, e, atk(pl, m) * 1.2, col, f.x - e.x, f.y - e.y, 0, m);
          }
        }
        return false;
      },
      da(ctx, f, own) {
        const a = own * Math.min(1, (f.life - f.t) * 6);
        for (let i = 0; i < f.n; i++) {
          const ang = f.rot + i * 6.2832 / f.n, rr = f.r * (0.85 + 0.15 * Math.sin(i * 2.3));
          G.VFX.draw(ctx, 'leaf', i % 3 ? 'grass' : 'bug', f.x + Math.cos(ang) * rr, f.y + Math.sin(ang) * rr * 0.7 - G.LIFT * 0.5, { angle: ang + 1.6, alpha: a });
        }
      } });
    if (sees(cx, cy)) G.Audio.sfx('grass');
  }
  MECH['razor-leaf'] = {
    cast(pl, m) {
      if (m.evolved) { leafSpiral(pl, m); return; }
      const g = ghost, n = Math.max(1, m.count | 0), tg = g ? null : aimTarget(pl, 360);
      // Salen hacia los lados y curvan hacia el blanco, sin volver.
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, k = 1 + Math.floor(i / 2) * 0.35;
        shoot(pl, m, pl.aim + side * 0.95 * k, { tg, life: 1.4 * ((m.radius || 210) / 210), pierce: 1, homing: 0, rate: 4.5, upd3: leafUpd });
      }
      if (sees(pl.x, pl.y)) G.Audio.sfx('grass');
    },
    crit: () => 0.25                                                // suelen hacer crítico
  };

  // ---- Tormenta Floral → Danza Pétalo ----
  function petalDance(pl, m, g) {
    addField({ owner: pl, m, tag: 'petals', x: pl.x, y: pl.y, pad: 200, ghost: g, log: new Map(), c: [{}, {}, {}],
      upd(f, dt) {
        const act = g ? pl.activeMove() : null;
        if (pl.dead || (g ? !(act && act.id === m.id) : !pl.activeGroup().includes(m))) return true;
        f.x = pl.x; f.y = pl.y;
        const T = now(), R = 30 * areaK(m);
        for (let i = 0; i < 3; i++) {
          // Cada remolino gira sobre un punto que se mueve (hasta 120 px de ti).
          const c = f.c[i];
          c.x = pl.x + Math.cos(T * 0.9 + i * 2.1) * 95 + Math.cos(T * 2.3 + i) * 25;
          c.y = pl.y + Math.sin(T * 1.3 + i * 2.1) * 64 + Math.sin(T * 2.9 + i) * 16;
          if (f.ghost) continue;
          for (const e of G.EnemyMgr.queryCircle(c.x, c.y, R)) {
            const k = e.id * 4 + i, last = f.log.get(k);
            if (last !== undefined && T - last < 0.4) continue;
            f.log.set(k, T);
            hit(pl, e, atk(pl, m) * 0.6, '#ff8acb', e.x - c.x, e.y - c.y, 30, m, GRASS_RAW);
          }
        }
        if (f.log.size > 300) f.log.clear();
        return false;
      },
      da(ctx, f, own, t) {
        const R = 30 * areaK(m);
        for (const c of f.c) {
          if (c.x == null) continue;
          for (let k = 0; k < 6; k++) {
            const a = t * 7 + k * 1.047, rr = R * (0.4 + 0.6 * ((k % 3) / 2));
            G.VFX.draw(ctx, 'petal', 'fairy', c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr * 0.6 - 10, { angle: a, alpha: own * 0.9 });
          }
        }
      } });
  }
  MECH['leaf-storm'] = {
    orb(pl, m, dt, orbs, g) {
      // La órbita respira: se abre y se cierra (40 ↔ 110 px cada 2 s).
      const k = 0.5 + 0.5 * Math.sin(now() * Math.PI), R = (m.radius || 74) * (0.54 + 0.95 * k);
      for (const p of orbs) p.orad = R;
      if (m.evolved && !mxFind(pl, 'petals', m.id)) petalDance(pl, m, g);
    }
  };

  // ---- Hierba Lazo → Planta Feroz ----
  /** Más daño cuanto más grande: pequeños ×0,7, grandes ×1,5, jefes ×2. */
  const sizeK = e => (big(e) ? 2 : e.champ || e.r >= 20 ? 1.5 : e.r <= 11 ? 0.7 : 1);
  function rootRing(pl, m, g) {
    const col = TCOL(m.type);
    addField({ owner: pl, m, tag: 'roots', x: pl.x, y: pl.y, life: 0.7, r: 40, r1: (m.radius || 76) * 2, hits: new Set(), pad: 220,
      upd(f) {
        f.r = 40 + (f.r1 - 40) * Math.min(1, f.t / 0.5);
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
          if (f.hits.has(e.id)) continue;
          f.hits.add(e.id);
          if (!f.ghost) hit(pl, e, atk(pl, m) * 0.6, col, e.x - f.x, e.y - f.y, 0, m, GRASS_RAW);
          if (!e.dead && (!f.ghost || real(e))) stAdd(e, 'root', 1);
        }
        return false;
      },
      dg(ctx, f, own) {
        const P = G.VFX.PAL.grass, n = Math.max(12, Math.round(f.r / 5)), a = own * Math.min(1, (f.life - f.t) * 4);
        for (let i = 0; i < n; i++) {
          const ang = i / n * 6.2832, x = f.x + Math.cos(ang) * f.r, y = f.y + Math.sin(ang) * f.r * 0.6, h = 6 + (i % 3) * 3;
          ctx.globalAlpha = a; ctx.fillStyle = i % 2 ? '#6e4c1e' : P[1];
          ctx.fillRect(Math.round(x) - 2, Math.round(y) - h, 4, h);
          ctx.fillStyle = P[3]; ctx.fillRect(Math.round(x) - 1, Math.round(y) - h, 2, 2);
        }
      } });
    if (sees(pl.x, pl.y)) { G.Audio.sfx('thud'); G.Camera.kick(0.1); }
  }
  MECH['giga-drain'] = {
    cast(pl, m) {
      const g = ghost, R = m.radius, col = TCOL(m.type), n = 4 + (m.lvl >= 5 ? 1 : 0);
      G.FX.ring(pl.x, pl.y, R * 0.5, R, col, 0.28, 2);
      const T = now();
      // Un lazo brota bajo los pies de hasta 4 enemigos cercanos y los hace tropezar.
      for (const e of nearestN(pl.x, pl.y, R, n)) {
        if (sees(e.x, e.y)) {
          for (let i = 0; i < 3; i++) { const a = i * 2.1; G.FX.sp('leaf', 'grass', e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 4, { vx: -Math.cos(a) * 40, vy: -30, life: 0.3, spin: 6 }); }
        }
        if (!g) hit(pl, e, atk(pl, m) * sizeK(e), col, 0, 0, 0, m);
        if (!e.dead && (!g || real(e)) && !(e.tripT > T)) { e.tripT = T + 1.2; e.applyStun(0.3 * (big(e) ? 0.35 : 1)); }
      }
      if (!g) for (const p of G.World.propsInCircle(pl.x, pl.y, R)) G.World.damageProp(p, atk(pl, m), col);
      // Planta Feroz: cada 2 s, un anillo de raíces gigantes que deja anclados 1 s.
      if (m.evolved) { const s = stOf(m); if (!(s.ringAt > T) || g) { if (!g) s.ringAt = T + 2; rootRing(pl, m, g); } }
    }
  };

  // ---- Bomba Germen → Mazazo ----
  function sproutBoom(f) {
    const pl = f.owner, m = f.m, col = TCOL(m.type);
    if (sees(f.x, f.y)) {
      G.FX.ring(f.x, f.y, 4, f.r, col, 0.3, 4);
      for (let i = 0; i < 8; i++) { const a = i * 0.785; G.FX.sp('leaf', 'grass', f.x, f.y - 8, { vx: Math.cos(a) * 140, vy: Math.sin(a) * 100 - 40, life: 0.4, spin: 9 }); }
      G.Audio.sfx('thud');
    }
    areaHit(pl, m, f.x, f.y, f.r, atk(pl, m) * 0.9, { knock: 60, ghost: f.ghost });
    if (!m.evolved) return;
    // Mazazo: del brote crece un tronco que cae hacia el grupo más cercano.
    const c = crowd(f.x, f.y, 140), a = c && (c.x !== f.x || c.y !== f.y) ? Math.atan2(c.y - f.y, c.x - f.x) : Math.random() * 6.2832;
    const L = 120 * ((m.size || 7) / 7), x1 = f.x + Math.cos(a) * L, y1 = f.y + Math.sin(a) * L * 0.8;
    later(pl, m, 0.25, f.x, f.y, o => {
      if (sees(o.x, o.y)) { G.FX.burst((o.x + x1) / 2, (o.y + y1) / 2, '#8e6a3a', 14, 160); G.Audio.sfx('break'); G.Camera.kick(0.15); }
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const e of onSeg(o.x, o.y, x1, y1, 30)) {
        if (!o.ghost) hit(pl, e, atk(pl, m) * 0.8, '#8e6a3a', ca, sa, 320, m, GRASS_RAW);
        else if (real(e)) shoveE(pl, e, ca, sa, 320, true);
      }
    }, { ghost: f.ghost, pad: L + 40,
      da(ctx, o, own) {
        // El tronco cae girando de pie a tumbado.
        const q = Math.min(1, o.t / 0.25), len = L * (0.3 + 0.7 * q);
        ctx.save(); ctx.globalAlpha = own;
        ctx.translate(o.x, o.y - 6); ctx.rotate(-Math.PI / 2 + (a + Math.PI / 2) * q);
        ctx.fillStyle = '#5a3c1c'; ctx.fillRect(0, -6, len, 12);
        ctx.fillStyle = '#8e6a3a'; ctx.fillRect(0, -4, len, 8);
        ctx.fillStyle = '#c8a070'; ctx.fillRect(len - 4, -4, 4, 8);
        ctx.restore();
      } });
  }
  function sprout(pl, m, x, y, e, g) {
    const r = (m.radius || 50) * ((m.size || 7) / 7);
    addField({ owner: pl, m, tag: 'sprout', x, y, e, life: 0.85, pad: r + 40, r, ghost: g,
      upd(f) { if (f.e && !f.e.dead) { f.x = f.e.x; f.y = f.e.y; } if (f.t >= 0.8) { sproutBoom(f); return true; } return false; },
      da(ctx, f, own) {
        // Brote que crece (aviso) y explota en hojas.
        const k = Math.min(1, f.t / 0.8), P = G.VFX.PAL.grass, h = 4 + 10 * k;
        ctx.globalAlpha = own; ctx.fillStyle = P[1]; ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y - h), 3, Math.round(h));
        G.VFX.draw(ctx, 'leaf', 'grass', f.x - 4, f.y - h, { angle: -0.6, alpha: own, scale: 0.6 + k * 0.6 });
        G.VFX.draw(ctx, 'leaf', 'grass', f.x + 4, f.y - h, { angle: 0.6 + Math.PI, alpha: own, scale: 0.6 + k * 0.6 });
        ctx.globalAlpha = 0.3 * own * k; ctx.strokeStyle = P[3]; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * k, f.r * k * 0.6, 0, 0, 6.2832); ctx.stroke();
      } });
  }
  MECH['seed-bomb'] = {
    cast(pl, m) {
      const g = ghost, n = Math.max(1, m.count | 0), tgs = g ? [] : nearestN(pl.x, pl.y, 360, n);
      // Semilla que se clava en el enemigo o en el suelo y a los 0,8 s brota en una planta que estalla.
      for (let i = 0; i < n; i++) {
        const tg = tgs[i] || null, a = tg ? Math.atan2(tg.y - pl.y, tg.x - pl.x) : pl.aim + (i - (n - 1) / 2) * 0.3;
        shoot(pl, m, a, { tg, homing: 3, bounce: 0, pierce: 0, dmg: atk(pl, m) * 0.4, life: 1.1,
          onHit: (p, e, _d, _c, gg = p.ghost) => sprout(pl, m, e.x, e.y, e, gg),
          end: p => sprout(pl, m, p.x, p.y, null, p.ghost) });
      }
    }
  };

  // ---- Energibola → Gigadrenado ----
  function eballUpd(p, dt) {
    if (p.child) { if (p.tg && !p.tg.dead) steerTo(p, p.tg.x, p.tg.y, 10, dt); return false; }
    p.d0 += Math.hypot(p.vx, p.vy) * dt;
    if (p.d0 < p.split) return false;
    // A los 120 px se divide en 3 que persiguen a 3 enemigos distintos.
    const tgs = nearestN(p.x, p.y, 320, 3, p.hits), sp = Math.hypot(p.vx, p.vy) || 280;
    for (let i = 0; i < 3; i++) {
      const tg = tgs[i] || tgs[0] || null, a = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : Math.atan2(p.vy, p.vx) + (i - 1) * 0.6;
      G.Projectiles.spawn({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: p.dmg * 0.42, r: (p.r || 8) * 0.7, life: 1.4, pierce: 0,
        color: p.color, homing: tg ? 0 : 4, hits: new Set(), vis: p.vis, ghost: p.ghost, owner: p.owner, burn: 0, poison: 0, slow: 0, knock: 0,
        mtype: p.mtype, mcat: p.mcat, src: p.src, child: true, tg, upd3: eballUpd, onHit: p.onHit });
    }
    if (sees(p.x, p.y)) G.FX.burst(p.x, p.y - G.LIFT, '#97e36c', 6, 90);
    return true;
  }
  function drainHit(p, e, _d, _c, gg = p.ghost, pl = p.owner) {
    const m = p.src, s = stOf(m);
    if (s.drainAt > now() - 0.3) return;
    s.drainAt = now();
    mxTrim(pl, 'drain', 1);
    // Gigadrenado: hilos verdes a hasta 5 enemigos a 120 px; les quitan vida y te curan el 20 %.
    const tgs = nearestN(e.x, e.y, 120, 5);
    addField({ owner: pl, m, tag: 'drain', x: e.x, y: e.y, life: 1.5, tgs, tk: 0.25, acc: 0, ghost: gg, pad: 240,
      upd(f, dt) {
        if ((f.tk -= dt) <= 0) {
          f.tk = 0.25;
          if (!f.ghost && !pl.dead) {
            const d = atk(pl, m) * 0.12;
            for (const t of f.tgs) if (!t.dead) { hit(pl, t, d, '#45b23c', 0, 0, 0, m, GRASS_RAW); f.acc += d * 0.2; }
            if (f.acc >= 1) { pl.heal(Math.min(f.acc, pl.maxHp * 0.01)); f.acc = 0; }
          }
        }
        if (Math.random() < dt * 20 && f.tgs.length) {
          const t = f.tgs[Math.floor(Math.random() * f.tgs.length)];
          if (!t.dead && sees(t.x, t.y)) G.FX.px(t.x, t.y - t.bodyH * 0.5, '#97e36c', { vx: (pl.x - t.x) * 2, vy: (pl.y - t.y) * 2, life: 0.45 });
        }
        return false;
      },
      da(ctx, f, own, t) {
        const a = own * Math.min(1, (f.life - f.t) * 3);
        ctx.strokeStyle = '#97e36c'; ctx.lineWidth = 1.5;
        for (const tg of f.tgs) {
          if (tg.dead) continue;
          ctx.globalAlpha = a * (0.5 + 0.3 * Math.sin(t * 20 + tg.id));
          ctx.beginPath(); ctx.moveTo(tg.x, tg.y - tg.bodyH * 0.5); ctx.lineTo(pl.x, pl.y - pl.bodyH * 0.5); ctx.stroke();
        }
      } });
  }
  MECH['energy-ball'] = {
    cast(pl, m) {
      const n = Math.max(1, m.count | 0);
      for (let i = 0; i < n; i++) {
        const a = pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * (m.spread || 0.12) * n);
        shoot(pl, m, a, { homing: m.homing || 5, d0: 0, split: 120 * ((m.speed || 280) / 280), upd3: eballUpd, onHit: m.evolved ? drainHit : null });
      }
    },
    k() { return wx() === 'sun' ? 1.3 : 1; }                        // con sol, ×1,3
  };

  // ---- Rayo Solar → Cuchilla Solar: carga quieto ----
  const isCave = () => !!(G.World.biomeName && /cueva|cave/i.test(G.World.biomeName()));
  function solarRelease(pl, m, k, g) {
    const col = TCOL(m.type);
    if (m.evolved) { solarBlade(pl, m, k, g); return; }
    const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), len = rayLen(pl.x, pl.y, ca, sa, m.radius);
    const w = m.width * (0.75 + 0.35 * (k - 0.8) / 1.4);
    G.FX.beam(pl.x, pl.y - G.LIFT, pl.aim, len, w, col, { pal: 'sacred', beam: 'leaf' });
    if (sees(pl.x, pl.y)) G.Audio.sfx('surge');
    if (g) return;
    G.Camera.kick(0.15 + 0.1 * k);
    const d = atk(pl, m) * k;
    for (const e of onSeg(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, w)) hit(pl, e, d, col, ca, sa, 0, m);
    segProps(pl.x, pl.y, pl.x + ca * len, pl.y + sa * len, w, d, col);
  }
  function solarBlade(pl, m, k, g) {
    // Cuchilla Solar: una espada de luz gigante barre 180° por delante en una sola pasada.
    const R = (m.radius || 290) * 0.55, a0 = pl.aim - Math.PI / 2, col = TCOL(m.type);
    addField({ owner: pl, m, tag: 'sblade', x: pl.x, y: pl.y, life: 0.42, a0, R, k, hits: new Set(), prev: a0, ghost: g, pad: R + 40,
      upd(f) {
        f.x = pl.x; f.y = pl.y;
        const cur = f.a0 + Math.PI * Math.min(1, f.t / 0.3);
        if (!f.ghost) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.R)) {
          if (f.hits.has(e.id)) continue;
          const d = Math.max(1, Math.hypot(e.x - f.x, e.y - f.y)), tol = e.r / d;
          let th = Math.atan2(e.y - f.y, e.x - f.x) - f.a0;
          while (th < -Math.PI) th += 6.2832;
          while (th > Math.PI) th -= 6.2832;
          if (th < f.prev - f.a0 - tol || th > cur - f.a0 + tol) continue;
          f.hits.add(e.id);
          hit(pl, e, atk(pl, m) * f.k, col, e.x - f.x, e.y - f.y, 120, m);
        }
        f.prev = cur;
        return false;
      },
      da(ctx, f, own) {
        const cur = f.a0 + Math.PI * Math.min(1, f.t / 0.3), a = own * Math.min(1, (f.life - f.t) * 6), P = G.VFX.PAL.sacred;
        ctx.save(); ctx.translate(pl.x, pl.y - G.LIFT * 0.6);
        // Estela del barrido.
        ctx.globalAlpha = a * 0.25; ctx.fillStyle = P[3];
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, f.R, f.a0, cur); ctx.closePath(); ctx.fill();
        ctx.rotate(cur); ctx.globalAlpha = a;
        ctx.fillStyle = P[1]; ctx.fillRect(10, -7, f.R - 10, 14);
        ctx.fillStyle = P[3]; ctx.fillRect(10, -5, f.R - 14, 10);
        ctx.fillStyle = P[4]; ctx.fillRect(12, -2, f.R - 18, 4);
        ctx.restore();
      } });
    if (sees(pl.x, pl.y)) { G.Audio.sfx('surge'); G.Camera.kick(0.2); }
  }
  MECH['solar-beam'] = {
    manual: true,
    reach: m => (m.radius || 290) + 20,
    tick(pl, m, dt) {
      const s = stOf(m), mv = moved(pl, s, 0.5);
      if (m.t > 0) { m.t -= dt; if (s.f) { s.f.gone = true; s.f = null; } return; }
      if (s.f && s.f.over) s.f = null;                             // (su dibujo se fue al cambiar de hueco: otro)
      if (!s.f) {
        if (!nearestE(pl.x, pl.y, reach(m))) return;
        s.c = 0; s.wasStill = false;
        s.f = addField({ owner: pl, m, tag: 'solar', x: pl.x, y: pl.y, pad: 80, ghost: false, c: 0,
          upd(f) { f.x = pl.x; f.y = pl.y; return (f.over = pl.dead || f.gone || !pl.activeGroup().includes(m)); },
          da(ctx, f, own, t) {
            // Absorbe luz: partículas que se juntan y flores a tus pies (más con más carga).
            const k = Math.min(1, (s.c || 0) / 2), R = 14 + 26 * k;
            ctx.globalAlpha = own * (0.25 + 0.5 * k); ctx.fillStyle = '#fff36a';
            for (let i = 0; i < 6 + 6 * k; i++) {
              const a = t * 3 + i * 1.3, r = R * (1 - ((t * 2 + i * 0.37) % 1));
              ctx.fillRect(Math.round(pl.x + Math.cos(a) * r), Math.round(pl.y - pl.bodyH * 0.6 + Math.sin(a) * r * 0.7), 2, 2);
            }
            if (k > 0.3) G.VFX.draw(ctx, 'petal', 'electric', pl.x + Math.cos(t * 2) * 12, pl.y + 2, { alpha: own * k, angle: t });
          } });
      }
      const w = wx(), rate = (0.85 / (m.charge || 0.85)) * (w === 'rain' || w === 'fog' || isCave() ? 0.5 : 1);
      if (w === 'sun') s.c = 2;                                    // con sol, carga al instante
      else s.c += dt * rate * (mv ? 0.5 : 1);                      // quieto carga el doble de rápido
      if (!mv && s.c >= 0.3) s.wasStill = true;
      if (s.c >= 2 || (mv && s.wasStill && s.c >= 0.3) || (mv && s.c >= 0.8)) {
        const t = aimTarget(pl, reach(m));
        if (!t) return;                                            // cargado: espera a tenerlo a tiro
        if (!pl.manualAim) pl.aim = Math.atan2(t.y - pl.y, t.x - pl.x);
        const k = 0.8 + 1.4 * G.U.clamp((Math.min(2, s.c) - 0.3) / 1.7, 0, 1);
        fire(pl, m);
        solarRelease(pl, m, k, false);
        if (s.f) { s.f.gone = true; s.f = null; }
        s.c = 0;
        m.t = cooldown(pl, m);
      }
    },
    cast(pl, m) { solarRelease(pl, m, 1.3, true); }               // (el de un compañero: ya soltado)
  };

  // ---- Semilladora → Fulgor Semilla ----
  function seedDrop(p) {
    // La semilla que falla se queda 4 s en el suelo y brota hierba (que arde con el fuego).
    if (p.hit1) return;
    zone(p.owner, p.src, { elem: 'grass', tag: 'seed', x: p.x, y: p.y, r: 14, life: 4, every: 1, dmg: 0, ghost: p.ghost, fx: 0.5 });
  }
  function seedFlash(pl, m) {
    // Fulgor Semilla: todas tus semillas del suelo estallan a la vez y bajan la defensa especial.
    let n = 0;
    for (const f of fields) {
      if (f.kind !== 'mx' || f.tag !== 'seed' || f.owner !== pl || f.gone) continue;
      f.gone = true; n++;
      if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 2, 30, '#eaffd0', 0.25, 3); G.FX.burst(f.x, f.y - 4, '#ffffff', 6, 120); }
      areaHit(pl, m, f.x, f.y, 30, atk(pl, m) * 1.5, { ho: GRASS_RAW, ghost: f.ghost, pre: e => { if (!f.ghost) inflict(pl, e, 'vuln', 5, 1); } });
    }
    if (n && sees(pl.x, pl.y)) G.Audio.sfx('shot', { kind: 'buff', type: 'grass' });
  }
  MECH['bullet-seed'] = {
    cast(pl, m) {
      const g = ghost, s = stOf(m), T = now();
      // Se calienta: disparando seguido la cadencia sube ×1 → ×2 en 2 s.
      if (!g) {
        s.held = T - (s.last || -9) < 0.9 ? (s.held || 0) + (T - s.last) : 0;
        s.last = T;
        const heat = 1 + Math.min(1, s.held / 2);
        m.t = Math.max(0.15, cooldown(pl, m) / heat);
      }
      const n = Math.max(1, m.count | 0), a0 = pl.aim, sp = m.spread || 0, every = Math.min(0.05, Math.max(0.15, m.t) * 0.8 / n);
      const fireOne = i => {
        const side = i % 2 ? 4 : -4, ca = Math.cos(a0), sa = Math.sin(a0);
        shoot(pl, m, a0 + G.U.rand(-sp, sp), { x: pl.x + ca * 4 - sa * side, y: pl.y + sa * 4 + ca * side, ghost: g, end: seedDrop,
                                              onHit: p2 => { p2.hit1 = true; } });
      };
      fireOne(0);
      if (n > 1) addField({ owner: pl, m, tag: 'sburst', x: pl.x, y: pl.y, i: 1, next: every, every, pad: 40,
        upd(f, dt) { if (pl.dead) return true; f.x = pl.x; f.y = pl.y; f.next -= dt; while (f.next <= 0 && f.i < n) { f.next += f.every; fireOne(f.i++); } return f.i >= n; } });
      if (sees(pl.x, pl.y)) G.Audio.sfx('shake');
      if (m.evolved && !g && !mxFind(pl, 'fulgor', m.id)) {
        addField({ owner: pl, m, tag: 'fulgor', x: pl.x, y: pl.y, pad: 40, ghost: false, next: 4,
          upd(f, dt) { f.x = pl.x; f.y = pl.y; if ((f.next -= dt) <= 0) { f.next = 4; seedFlash(pl, f.m); } return pl.dead; } });
      }
    }
  };

  // ---- Barrera Espinosa → Cura Selvática ----
  function spikeCrown(pl, m, g) {
    for (let i = 0; i < 12; i++) {
      const a = i * 0.5236;
      G.Projectiles.spawn({ x: pl.x, y: pl.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, dmg: atk(pl, m) * 0.25, r: 4, life: 0.4, pierce: 1,
        color: TCOL('grass'), hits: new Set(), vis: { proj: 'needle', pal: 'grass' }, ghost: g, owner: pl, burn: 0, poison: 0, slow: 0, knock: 30,
        mtype: 'grass', mcat: m.cat, src: m });
    }
  }
  function jungleFx(pl) {
    if (!sees(pl.x, pl.y)) return;
    for (let i = 0; i < 10; i++) G.FX.sp(i % 2 ? 'leaf' : 'petal', i % 2 ? 'grass' : 'fairy', pl.x + G.U.rand(-20, 20), pl.y - G.U.rand(0, 10), { vy: -G.U.rand(60, 110), life: 0.7, spin: 4 });
    G.FX.ring(pl.x, pl.y, pl.r, 140, '#5fe08a', 0.45, 3);
  }
  MECH['spiky-shield'] = {
    touch(pl, m, e) {
      // Mientras tengas escudos, quien te toque recibe daño de espinas (sin gastar escudo).
      if (!((m.charges | 0) > 0) || e.dead) return;
      hit(pl, e, atk(pl, m) * 0.18, TCOL('grass'), e.x - pl.x, e.y - pl.y, 60, m, GRASS_RAW);
      if (sees(e.x, e.y)) G.FX.sp('needle', 'grass', (e.x + pl.x) / 2, (e.y + pl.y) / 2 - 8, { life: 0.2, angle: Math.atan2(e.y - pl.y, e.x - pl.x), scale: 1.5 });
    },
    block(pl, m, g) {
      if (!g) {
        spikeCrown(pl, m, false);                                   // al parar un golpe: corona de 12 púas
        // Cura Selvática: además cura (heal de la evolución) y te quita frenazos.
        if (m.evolved) { pl.slowT = 0; jungleFx(pl); }
        return;
      }
      spikeCrown(pl, m, true);
      if (!m.evolved) return;
      jungleFx(pl);
      // Cura Selvática: cura un 6 % a los compañeros a 140 px (cada uno el suyo).
      const me = G.Game.player;
      if (me && !me.dead && me !== pl && G.U.dist2(me.x, me.y, pl.x, pl.y) < 140 * 140) { me.heal(me.maxHp * 0.06); me.slowT = 0; }
    }
  };
  /* ==== mech: eléctrico ==== */

  // ---- Impactrueno → Trueno ----
  function zigUpd(p, dt) {
    if (p.ba == null) { p.ba = Math.atan2(p.vy, p.vx); p.sp = Math.hypot(p.vx, p.vy); p.zs = 1; p.zt = 0; p.arcs = 0; }
    if ((p.zt -= dt) > 0) return false;
    // Cambia de dirección cada 0,05 s (zigzag alrededor de su rumbo).
    p.zt = 0.05; p.zs = -p.zs;
    const a = p.ba + p.zs * 0.6;
    p.vx = Math.cos(a) * p.sp; p.vy = Math.sin(a) * p.sp;
    // Al pasar a menos de 40 px de otro enemigo le salta un arco (50 % del daño; como mucho 2).
    if (p.arcs < 2) {
      for (const e of G.EnemyMgr.queryCircle(p.x, p.y, 40)) {
        if (e.dead || p.hits.has(e.id) || (p.arc && p.arc.has(e.id))) continue;
        // (El que recibe el arco ya no recibe el disparo: un blanco solo no se lleva los dos.)
        (p.arc || (p.arc = new Set())).add(e.id); p.arcs++; p.hits.add(e.id);
        zap(p.owner, p.x, p.y - G.LIFT, e.x, e.y - e.bodyH * 0.5, 'electric', 0.12, 1);
        if (!p.ghost) hit(p.owner, e, p.dmg * 0.5, p.color, e.x - p.x, e.y - p.y, 0, p.src, ELEC_RAW);
        break;
      }
    }
    return false;
  }
  function skyBolt(pl, m, e, g) {
    // Trueno: un rayo cae del cielo sobre el blanco al instante.
    zap(pl, e.x + G.U.rand(-12, 12), e.y - 230, e.x, e.y - e.bodyH * 0.5, 'electric', 0.24, 4);
    if (sees(e.x, e.y)) { G.FX.ring(e.x, e.y, 4, 26, '#fff36a', 0.25, 3); G.FX.burst(e.x, e.y - 6, '#fff36a', 8, 140); G.Audio.sfx('break'); }
    if (g) return;
    hit(pl, e, atk(pl, m), TCOL('electric'), 0, 1, 0, m);
    // Donde cae, la descarga salpica un poco alrededor.
    areaHit(pl, m, e.x, e.y, 26, atk(pl, m) * 0.4, { ho: ELEC_RAW, pre: o => o !== e });
    // A los empapados ×1,4 (ver hitPre) y salta a los empapados a 80 px.
    if (!isWet(e)) return;
    const done = new Set([e.id]);
    let cur = e;
    for (let i = 0; i < 6; i++) {
      let nx = null, bd = 80 * 80;
      for (const o of G.EnemyMgr.queryCircle(cur.x, cur.y, 80)) {
        if (o.dead || done.has(o.id) || !isWet(o)) continue;
        const d = G.U.dist2(cur.x, cur.y, o.x, o.y);
        if (d < bd) { bd = d; nx = o; }
      }
      if (!nx) break;
      done.add(nx.id);
      zap(pl, cur.x, cur.y - cur.bodyH * 0.5, nx.x, nx.y - nx.bodyH * 0.5, 'aura', 0.18, 2);
      hit(pl, nx, atk(pl, m) * 0.7, TCOL('electric'), 0, 0, 0, m, ELEC_RAW);
      cur = nx;
    }
  }
  MECH['thunder-shock'] = {
    cast(pl, m) { shootN(pl, m, { upd3: zigUpd }); },
    evo(pl, m) {
      const g = ghost, rain = wx() === 'rain', n = Math.max(1, m.count | 0) + 1 + (rain ? 2 : 0);
      // Con lluvia caen más (sobre enemigos distintos).
      const first = g ? nearestE(pl.x + Math.cos(pl.aim) * 150, pl.y + Math.sin(pl.aim) * 150, 260) : aimTarget(pl, 380);
      if (!first) return;
      const list = [first].concat(nearestN(pl.x, pl.y, 380, n - 1, new Set([first.id])));
      for (const e of list) skyBolt(pl, m, e, g);
    },
    afterP(pl, e, m) { if (chance(pl, m.evolved ? 0.3 : 0.1)) inflict(pl, e, 'para', 2); },
    after(pl, e, m) { if (chance(pl, m.evolved ? 0.3 : 0.1)) inflict(pl, e, 'para', 2); }
  };

  // ---- Chispazo → Campo Eléctrico ----
  function dischargeAt(pl, m, c, g) {
    const R = (60 + 15 * c) * Math.sqrt((m.radius || 70) / 70), col = TCOL(m.type);
    if (sees(pl.x, pl.y, R)) {
      G.FX.ring(pl.x, pl.y, pl.r, R, '#fff36a', 0.3, 4);
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + Math.random() * 0.4;
        zap(pl, pl.x + Math.cos(a) * pl.r, pl.y + Math.sin(a) * pl.r * 0.7 - pl.bodyH * 0.4, pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R * 0.7, 'electric', 0.16, 1);
      }
      G.Audio.sfx('break'); G.Audio.sfx('shake');
    }
    if (!g) {
      const d = atk(pl, m) * c;                                    // daño × cargas
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) {
        hit(pl, e, d, col, e.x - pl.x, e.y - pl.y, 80, m);
        if (!e.dead && chance(pl, 0.3)) inflict(pl, e, 'para', 2);
      }
      for (const p of G.World.propsInCircle(pl.x, pl.y, R)) G.World.damageProp(p, d, col);
      G.Camera.kick(0.08 + 0.02 * c);
    }
    if (m.evolved) {
      // Campo Eléctrico: un campo de 120 px te sigue 6 s (paraliza a los que entran; tus eléctricos +30 % dentro).
      mxTrim(pl, 'efield', 0);
      const f = zone(pl, m, { elem: 'elec', tag: 'efield', x: pl.x, y: pl.y, r: 120 * areaK(m), life: 6, every: 0.5, dmg: 0, follow: pl,
                              st: ['para', 1.2], ghost: g, fx: 3, alpha: 0.45,
                              each: (z, e) => { if (z.ghost && real(e)) stAdd(e, 'para', 1.2); },
                              tickFn: z => { if (!z.ghost) pl.slowT = 0; } });                 // y a ti no te pueden frenar
      if (!g) P3(pl).efield = f;
    }
  }
  MECH['discharge'] = {
    manual: true,
    tick(pl, m, dt) {
      const s = stOf(m);
      // Cada 60 px que andas, una carga (máx 6).
      if (s.px != null) s.dist = (s.dist || 0) + Math.min(40, Math.hypot(pl.x - s.px, pl.y - s.py));
      s.px = pl.x; s.py = pl.y;
      const per = 60 * (cooldown(pl, m) / 0.45);
      while (s.dist >= per && (s.c || 0) < 6) { s.dist -= per; s.c = (s.c || 0) + 1; }
      if ((s.c || 0) >= 6) s.dist = 0;
      if (!s.c) return;
      if (Math.random() < dt * s.c * 3 && sees(pl.x, pl.y)) G.FX.px(pl.x + G.U.rand(-pl.r, pl.r), pl.y - pl.bodyH * G.U.rand(0.2, 1), '#fff36a', { vx: G.U.rand(-60, 60), vy: G.U.rand(-60, 20), life: 0.15 });
      // Descarga todo cuando uno llega a 40 px (o, con 6, si hay alguno a 120).
      const k = Math.sqrt((m.radius || 70) / 70);
      const close = nearestE(pl.x, pl.y, 40 * k + pl.r), far = !close && s.c >= 6 ? nearestE(pl.x, pl.y, 120 * k) : null;
      if (!close && !far) return;
      fire(pl, m);
      dischargeAt(pl, m, s.c, false);
      s.c = 0;
    },
    cast(pl, m) { dischargeAt(pl, m, 3, true); }                    // (el de un compañero: sólo se ve)
  };

  // ---- Rayo → Electrocañón ----
  function zapCannon(pl, m) {
    // Una bola de electricidad lenta y grande que paraliza y lanza rayos a los 2 más cercanos.
    shoot(pl, m, pl.aim, { speed: 120, r: 14, ds: 2.5, life: (m.radius || 140) * 2.2 / 120, pierce: Infinity, zt: 0.3, homing: 0,
      vis: { proj: 'ball', pal: 'electric', trail: 'spark' },
      upd3(p, dt) {
        if ((p.zt -= dt) <= 0) {
          p.zt = 0.3;
          for (const e of nearestN(p.x, p.y, 120, 2)) {
            zap(p.owner, p.x, p.y - G.LIFT, e.x, e.y - e.bodyH * 0.5, 'electric', 0.14, 2);
            if (!p.ghost) hit(p.owner, e, p.dmg * 0.35, p.color, e.x - p.x, e.y - p.y, 0, p.src, ELEC_RAW);
          }
        }
        return false;
      },
      onHit(p, e, _d, _c, gg = p.ghost) { if (!gg) inflict(p.owner, e, 'para', 2); else if (real(e)) stAdd(e, 'para', 2); return true; } });
    if (sees(pl.x, pl.y)) G.Audio.sfx('shake');
  }
  MECH['thunderbolt'] = {
    cast(pl, m) {
      const g = ghost, col = TCOL(m.type);
      const start = pl.target && !pl.target.dead && pl.target.hurt ? pl.target : nearestE(pl.x, pl.y, reach(m));
      if (!start) return;
      // Conductor: por los empapados (o metidos en agua) salta sin límite (160 px); a los secos, los saltos de siempre.
      let cur = start, fx = pl.x, fy = pl.y - G.LIFT, k = 1, dry = Math.max(1, m.count | 0), total = 0;
      const done = new Set();
      while (cur && total < 30) {
        done.add(cur.id); total++;
        const wet = isWet(cur), ty = cur.y - cur.bodyH * 0.5;
        zap(pl, fx, fy, cur.x, ty, wet ? 'aura' : 'electric', 0.18, wet ? 3 : 2);
        if (!g) hit(pl, cur, atk(pl, m) * k, col, cur.x - fx, ty - fy, 0, m);
        if (!wet) { dry--; k *= 0.85; }
        fx = cur.x; fy = ty;
        let next = null;
        if (wet) {
          let bd = 160 * 160;
          for (const o of G.EnemyMgr.queryCircle(cur.x, cur.y, 160)) {
            if (o.dead || done.has(o.id) || !isWet(o)) continue;
            const d = G.U.dist2(cur.x, cur.y, o.x, o.y);
            if (d < bd) { bd = d; next = o; }
          }
        }
        if (!next && dry > 0) next = nearestE(cur.x, cur.y, m.radius, done);
        cur = next;
      }
      if (!g) G.Camera.kick(0.05);
      if (sees(pl.x, pl.y)) G.Audio.sfx('shake');
    },
    evo(pl, m) { zapCannon(pl, m); }
  };

  // ---- Onda Trueno → Voltio Cruel ----
  function voltTackle(pl, m) {
    const g = ghost, col = TCOL(m.type), ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), want = 300;
    const sx = pl.x, sy = pl.y, len = g ? want * 0.6 : pathLen(pl, ca, sa, want);
    const x0 = g ? sx - ca * len : sx, y0 = g ? sy - sa * len : sy, x1 = g ? sx : sx + ca * len, y1 = g ? sy : sy + sa * len;
    // Te lanzas como un rayo en línea recta (invulnerable) y dejas una estela que paraliza.
    zap(pl, x0, y0 - G.LIFT * 0.5, x1, y1 - G.LIFT * 0.5, 'electric', 0.3, 4);
    afterimages(pl, [0.2, 0.45, 0.7].map(q => ({ x: x0 + (x1 - x0) * q, y: y0 + (y1 - y0) * q })), 0.3, '#fff36a');
    zone(pl, m, { elem: 'elec', shape: 'line', x1: x0, y1: y0, x2: x1, y2: y1, w: 22, life: 2, every: 0.4, dmg: atk(pl, m) * 0.25, st: ['para', 2], ghost: g,
                  each: (z, e) => { if (z.ghost && real(e)) stAdd(e, 'para', 2); } });
    if (sees(sx, sy)) G.Audio.sfx('surge');
    if (g) return;
    pl.x = x1; pl.y = y1; G.World.collide(pl);
    invul(pl, 0.4);
    for (const e of onSeg(x0, y0, x1, y1, 36)) hit(pl, e, atk(pl, m), col, ca, sa, 80, m);
    segProps(x0, y0, x1, y1, 36, atk(pl, m), col);
    G.Camera.kick(0.15);
  }
  MECH['thunder-wave'] = {
    cast() { return false; },                                       // la zona de siempre (familia aturdir)…
    evo(pl, m) { voltTackle(pl, m); },
    zone(pl, m, f) {
      // …pero no aturde: PARALIZA a todos los de dentro, y la parálisis se contagia una vez.
      if (sees(f.x, f.y)) for (let i = -2; i <= 2; i++) {
        zap(pl, f.x + i * f.r * 0.4, f.y - f.r * 0.6 - 30, f.x + i * f.r * 0.4, f.y + f.r * 0.3, 'electric', 0.18, 1);
        zap(pl, f.x - f.r, f.y + i * f.r * 0.25, f.x + f.r, f.y + i * f.r * 0.25, 'electric', 0.18, 1);
      }
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
        if (!f.ghost) hit(pl, e, f.dmg, f.col, e.x - f.x, e.y - f.y, 0, m);
        if (!e.dead && (!f.ghost || real(e))) stAdd(e, 'para', 2.5 * (m.stun || 1), 0, { spread: 1 });
      }
      if (!f.ghost) for (const p of G.World.propsInCircle(f.x, f.y, f.r)) G.World.damageProp(p, f.dmg, f.col);
    }
  };

  // ---- Bola Voltio → Chispa ----
  function backUpd(p, dt) {
    const o = p.owner;
    steerTo(p, o.x, o.y, 14, dt);
    if (G.U.dist2(p.x, p.y, o.x, o.y) < (o.r + 10) ** 2) {
      // Chispa: la bola vuelve y te carga 2 s.
      if (!p.ghost) P3(o).sparkT = now() + 2;
      if (sees(o.x, o.y)) { G.FX.ring(o.x, o.y, o.r, o.r * 2.5, '#fff36a', 0.3, 3); G.Audio.sfx('shake'); }
      return true;
    }
    return false;
  }
  function sparkReturn(p) {
    if (p.bounce > 0) return;                                       // rebota como siempre
    p.noHit = true; p.upd3 = backUpd; p.life = p.t + 3; p.pierce = Infinity;
    return true;
  }
  MECH['electro-ball'] = {
    tick(pl, m) {
      const s = stOf(m);
      s.mv = moved(pl, s, 0.5);
      // Chispa: cargado, tu contacto daña y paraliza a quien toques.
      const px = P3(pl);
      if (!(px.sparkT > now())) return;
      if (Math.random() < 0.3 && sees(pl.x, pl.y)) G.FX.px(pl.x + G.U.rand(-pl.r, pl.r), pl.y - pl.bodyH * G.U.rand(0, 1), '#fff36a', { vx: G.U.rand(-80, 80), vy: G.U.rand(-80, 80), life: 0.12 });
      const log = s.log || (s.log = new Map()), T = now();
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, pl.r + 6)) {
        const last = log.get(e.id);
        if (last !== undefined && T - last < 0.4) continue;
        log.set(e.id, T);
        hit(pl, e, atk(pl, m) * 0.8, TCOL('electric'), e.x - pl.x, e.y - pl.y, 80, m, ELEC_RAW);
        if (!e.dead && chance(pl, 0.3)) inflict(pl, e, 'para', 2);
      }
      if (log.size > 100) log.clear();
    },
    cast(pl, m) {
      const g = ghost, s = stOf(m), base = pl.baseSpd || 0;
      // Su daño y su tamaño van con TU velocidad al lanzarla (quieto ×0,6, corriendo ×1,3, con pilas hasta ×2).
      const run = g || s.mv !== false, k = run ? Math.min(2, 1.3 * (base ? Math.max(1, pl.spd / base) : 1)) : 0.6;
      shootN(pl, m, { dmg: atk(pl, m) * k, r: (m.size || 7) * (0.7 + 0.4 * k), ds: k >= 1.3 ? 1.5 + (k - 1.3) * 0.8 : 1,
                      onHit: m.evolved ? sparkReturn : null });
    }
  };

  // ---- Rayo Carga → Rayo Fusión ----
  MECH['charge-beam'] = {
    tick(pl, m, dt) {
      const s = stOf(m);
      // Cada vuelta completa en la que golpea a alguien: +1 pila de at. esp. (máx 3, 6 s).
      const f = sweepTurn(pl, m, s, () => {
        if (!s.hitTurn || !pl.buffs) return;
        pl.addBuff('satk', 0.1, 6, 3, m.id);
        if (sees(pl.x, pl.y)) { G.FX.ring(pl.x, pl.y, pl.r, pl.r * 3, '#c47bff', 0.3, 2); G.Audio.sfx('select'); }
      });
      // Rayo Fusión: con Fuego reciente, estalla en las puntas.
      if (f && m.evolved && recentType('fire', 3) && (s.ft = (s.ft || 0) - dt) <= 0) {
        s.ft = 0.25;
        for (let i = 0; i < f.n; i++) {
          const a = f.a + i * 6.2832 / f.n, x = pl.x + Math.cos(a) * m.radius, y = pl.y + Math.sin(a) * m.radius;
          if (sees(x, y)) { G.FX.ring(x, y, 2, 30, '#bfe8ff', 0.2, 3); G.FX.burst(x, y - G.LIFT, '#ffb22e', 5, 90); }
          areaHit(pl, m, x, y, 30 * areaK(m), atk(pl, m) * 0.5, { knock: 40, ho: ELEC_RAW });
        }
      }
    },
    after(pl, e, m) { stOf(m).hitTurn = true; },
    k(pl, e, m) { return m.evolved && recentType('fire', 3) ? 2 : 1; }
  };

  // ---- Rueda Aural → Ataque Fulgor ----
  const AW_ELEC = Object.freeze({ proj: 'wheel', pal: 'electric', trail: 'spark' }), AW_DARK = Object.freeze({ proj: 'wheel', pal: 'dark', trail: 'wisp' });
  function auraFlip(p) {
    // Cambia de forma en cada rebote: Saciada (Eléctrico) ↔ Hambrienta (Siniestro). El tipo cambia de verdad.
    p.form ^= 1; p.nb++;
    p.mtype = p.form ? 'dark' : 'electric'; p.color = TCOL(p.mtype); p.vis = p.form ? AW_DARK : AW_ELEC;
    if (sees(p.x, p.y)) G.FX.ring(p.x, p.y, 2, 16, p.color, 0.2, 2);
    // Ataque Fulgor: cada 3 rebotes, un rayo a cada enemigo de su caja (máx 8).
    if (p.src.evolved && p.nb % 3 === 0) {
      const o = p.owner;
      let n = 0;
      for (const e of G.EnemyMgr.all()) {
        if (e.dead || Math.abs(e.x - o.x) > 200 || Math.abs(e.y - o.y) > 200) continue;
        zap(o, p.x, p.y - G.LIFT, e.x, e.y - e.bodyH * 0.5, p.form ? 'dark' : 'electric', 0.16, 2);
        if (!p.ghost) hit(o, e, p.dmg * 0.6, p.color, 0, 0, 0, p.src, { raw: true, type: p.mtype });
        if (++n >= 8) break;
      }
      if (n && sees(p.x, p.y)) G.Audio.sfx('break');
    }
  }
  MECH['aura-wheel'] = {
    cast(pl, m) {
      carom(pl, m);
      for (const p of G.Projectiles.all()) if (p.ricochet && p.owner === pl && p.mid === m.id && p.form == null) {
        p.form = 0; p.nb = 0; p.mtype = 'electric'; p.vis = AW_ELEC; p.onBounce = auraFlip;
      }
    },
    k(pl, e, m, d, p) { return p && p.form === 1 ? 1.3 : 1; },   // Hambrienta: ×1,3
    afterP(pl, e, m, p) {
      if (p.form === 1) inflict(pl, e, 'vuln', 5, 1);               // y vulnerable +1
      else if (chance(pl, 0.2)) inflict(pl, e, 'para', 2);          // Saciada: 20 % de parálisis
    }
  };

  /* ==== mech: hielo ==== */

  // ---- Rayo Hielo → Ventisca ----
  function blizzard(pl, m) {
    const g = ghost, col = TCOL(m.type), half = 0.873, R = (m.radius || 220) * 0.68;
    // Ventisca: el rayo se abre en un cono de ventisca que avanza.
    addField({ owner: pl, m, tag: 'bliz', x: pl.x, y: pl.y, ang: pl.aim, half, R, r: 10, hits: new Set(), life: 0.75, pad: R + 40,
      upd(f) {
        f.r = Math.min(f.R, 10 + f.R * f.t / 0.6);
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
          if (f.hits.has(e.id) || !inArc(f.x, f.y, e.x, e.y, f.ang, f.half)) continue;
          f.hits.add(e.id);
          if (!f.ghost) { hit(pl, e, atk(pl, m), col, Math.cos(f.ang), Math.sin(f.ang), 60, m); if (!e.dead) inflict(pl, e, 'chill', 3, 1); }
        }
        if (sees(f.x, f.y, f.r)) for (let i = 0; i < 3; i++) {
          const a = f.ang + G.U.rand(-f.half, f.half), d = G.U.rand(0.3, 1) * f.r;
          G.FX.sp('star', 'ice', f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.8 - G.LIFT * 0.5, { vx: Math.cos(a) * 140, vy: Math.sin(a) * 110, life: 0.3, spin: 8 });
        }
        return false;
      },
      dg(ctx, f, own) {
        ctx.globalAlpha = 0.2 * own * Math.min(1, (f.life - f.t) * 4); ctx.fillStyle = '#d8f6ff';
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.r, f.ang - f.half, f.ang + f.half); ctx.closePath(); ctx.fill();
      } });
    if (sees(pl.x, pl.y)) G.Audio.sfx('surge');
  }
  MECH['ice-beam'] = {
    cast(pl, m) {
      beam(pl, m);
      // Deja una franja de hielo 3 s: los enemigos resbalan (les cuesta girar y frenar) y cogen frío.
      const ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), len = rayLen(pl.x, pl.y, ca, sa, m.radius);
      zone(pl, m, { elem: 'ice', shape: 'line', x1: pl.x + ca * 12, y1: pl.y + sa * 12, x2: pl.x + ca * len, y2: pl.y + sa * len, w: m.width * 0.9,
                    life: 3, every: 0.5, dmg: 0, slow: 0.2, ghost, k: 0,
                    each: (z, e) => {
                      if (z.ghost) { if (real(e)) stAdd(e, 'slip', 0.7); return; }
                      stAdd(e, 'slip', 0.7);
                      if ((z.k = (z.k + 1) % 2) === 0) stAdd(e, 'chill', 3, 1);
                    } });
    },
    evo(pl, m) { blizzard(pl, m); },
    after(pl, e, m) {
      const snow = m.evolved && wx() === 'snow';
      if (snow || chance(pl, m.evolved ? 0.3 : 0.15)) inflict(pl, e, 'freeze', 1);     // con nieve, congela siempre
    },
    k(pl, e, m) { return m.evolved && wx() === 'snow' ? 1.5 : 1; }
  };

  // ---- Nieve Polvo → Viento Hielo ----
  MECH['powder-snow'] = {
    // La nevada de siempre (familia aura); cada tic dentro suma 1 de frío (con 5, congelado).
    after(pl, e) { inflict(pl, e, 'chill', 3, 1); },
    tick(pl, m, dt) {
      if (!m.evolved) return;
      const s = stOf(m);
      if ((s.gust = (s.gust == null ? 0.8 : s.gust) - dt) > 0) return;
      s.gust = 0.8;
      // Viento Hielo: cada 0,8 s, una ráfaga helada en cono hacia donde te mueves.
      const a = pl.moveAngle, ca = Math.cos(a), sa = Math.sin(a), R = m.radius * 1.7, half = 0.6;
      if (sees(pl.x, pl.y, R)) {
        for (let i = 0; i < 7; i++) {
          const b = a + G.U.rand(-half, half);
          G.FX.sp('wind', 'ice', pl.x + Math.cos(b) * 14, pl.y + Math.sin(b) * 10 - G.LIFT * 0.5, { vx: Math.cos(b) * R * 2.2, vy: Math.sin(b) * R * 1.7, life: 0.35, spin: 6 });
        }
        G.Audio.sfx('shot', { kind: 'aura', type: 'ice' });
      }
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, R)) {
        if (!inArc(pl.x, pl.y, e.x, e.y, a, half)) continue;
        hit(pl, e, atk(pl, m) * 0.8, TCOL('ice'), ca, sa, 160, m, ICE_RAW);
        if (!e.dead) inflict(pl, e, 'chill', 3, 2);
      }
    }
  };

  // ---- Granizo → Alud ----
  function hailStone(pl, m, g, aimed, rage) {
    const R = 4.5 * (m.radius || 40);
    let x, y;
    const e = aimed && !g ? randomNear(pl.x, pl.y, R) : null;
    if (e) { x = e.x + G.U.rand(-5, 5); y = e.y + G.U.rand(-4, 4); }
    else { const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * R; x = pl.x + Math.cos(a) * d; y = pl.y + Math.sin(a) * d * 0.8; }
    const fall = 0.35 / (pkOf(m).pspd || 1);
    later(pl, m, fall, x, y, f => {
      if (sees(f.x, f.y)) { G.FX.burst(f.x, f.y - 4, '#d8f6ff', 4, 80); if (Math.random() < 0.3) G.Audio.sfx('hover'); }
      areaHit(pl, m, f.x, f.y, (m.radius || 40) * 0.5, atk(pl, m) * rage, { ghost: f.ghost });
    }, { ghost: g, pad: 40, fall,
      da(ctx, f, own) { const k = Math.min(1, f.t / f.fall); G.VFX.draw(ctx, 'shard', 'ice', f.x + (1 - k) * 18, f.y - (1 - k) * 140 - 4, { angle: 1.45, alpha: own }); } });
  }
  function avalanche(pl, m) {
    // Alud: caen 6 bloques de hielo en anillo a tu alrededor.
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + Math.random() * 0.3, x = pl.x + Math.cos(a) * 60, y = pl.y + Math.sin(a) * 42;
      later(pl, m, 0.35 + i * 0.04, x, y, f => {
        if (sees(f.x, f.y)) { G.FX.ring(f.x, f.y, 4, 30, '#bff3ff', 0.3, 3); G.FX.burst(f.x, f.y - 6, '#ffffff', 8, 140); G.Audio.sfx('break'); }
        areaHit(pl, m, f.x, f.y, 30 * areaK(m), atk(pl, m) * 1.5, { knock: 80, ho: ICE_RAW, pre: e => { inflict(pl, e, 'chill', 3, 2); } });
      }, { ghost: false, pad: 60,
        da(ctx, f, own) { const k = Math.min(1, f.t / 0.35); G.VFX.draw(ctx, 'rock', 'ice', f.x, f.y - (1 - k) * 160 - 6, { scale: 2, alpha: own }); } });
    }
  }
  MECH['hail'] = {
    cast(pl, m) {
      const life = m.dur || 4, f0 = mxFind(pl, 'hail', m.id);
      if (f0) { f0.t = 0; f0.life = life; f0.m = m; return; }
      // Una nube te sigue y suelta granizo al azar a tu alrededor (8 por segundo; con nieve, el doble).
      addField({ owner: pl, m, tag: 'hail', x: pl.x, y: pl.y, life, acc: 0, k: 0, pad: 240,
        upd(f, dt) {
          if (pl.dead) return true;
          f.x = pl.x; f.y = pl.y;
          const rage = pl.u3 && pl.u3.hailRage > now() ? 1.5 : 1;
          f.acc += 8 * (Math.max(1, f.m.count | 0) / 4) * (wx() === 'snow' ? 2 : 1) * rage * dt;
          let n = 0;
          while (f.acc >= 1 && n++ < 4) { f.acc -= 1; hailStone(pl, f.m, f.ghost, (f.k++ % 2) === 0, rage); }
          return false;
        },
        da(ctx, f, own, t) {
          const fade = own * Math.min(1, (f.life - f.t) * 2, f.t * 4), rage = pl.u3 && pl.u3.hailRage > now();
          for (let i = -1; i <= 1; i++) {
            G.VFX.draw(ctx, 'vapor', rage ? 'ice' : 'steel', f.x + i * 16, f.y - pl.bodyH - 46 + Math.sin(t * 2 + i) * 2 + (i ? 3 : 0), { scale: 1.5, alpha: fade * 0.85 });
          }
        } });
    },
    hurt(pl, m) {
      // Alud: cada vez que recibes daño, el granizo va ×1,5 3 s y caen 6 bloques de hielo.
      if (!m.evolved || !mxFind(pl, 'hail', m.id)) return;
      P3(pl).hailRage = now() + 3;
      const s = stOf(m);
      if (!(s.ringAt > now())) { s.ringAt = now() + 1; avalanche(pl, m); }
    }
  };

  // ---- Canto Helado → Carámbano ----
  const shardR = m => 160 * ((m.size || 6) / 6);
  function iceShot(pl, m, e, g) {
    // Esquirla instantánea (sin viaje): sólo se dibuja la línea.
    const a = Math.atan2(e.y - pl.y, e.x - pl.x), d = Math.hypot(e.x - pl.x, e.y - pl.y);
    G.FX.beam(pl.x, pl.y - G.LIFT, a, d, 4, TCOL('ice'), { pal: 'ice', beam: 'shard' });
    if (sees(e.x, e.y)) { G.FX.sp('shard', 'ice', e.x, e.y - e.bodyH * 0.5, { life: 0.15, angle: a, scale: 1.5 }); G.Audio.sfx('hover'); }
    if (g) { if (real(e)) interrupt(e); return; }
    hit(pl, e, atk(pl, m), TCOL('ice'), Math.cos(a), Math.sin(a), 30, m);
    interrupt(e);                                                   // le interrumpe
  }
  MECH['ice-shard'] = {
    reach: m => shardR(m) + 10,
    cast(pl, m) {
      const g = ghost, R = shardR(m);
      // Al enemigo más cercano a ti (el que está a punto de tocarte); con más, a los siguientes.
      const list = nearestN(pl.x, pl.y, R, Math.max(1, m.count | 0));
      if (!list.length) return;
      if (!m.evolved) { for (const e of list) iceShot(pl, m, e, g); return; }
      // Carámbano: 3 seguidos al mismo blanco; si aciertan los 3, se congela 1 s.
      const e = list[0], st = { ok: 0 };
      for (let i = 0; i < 3; i++) {
        later(pl, m, i * 0.09, pl.x, pl.y, f => {
          if (e.dead || G.U.dist2(pl.x, pl.y, e.x, e.y) > (R + 40) ** 2) return;
          iceShot(pl, m, e, f.ghost);
          if (++st.ok === 3 && !e.dead) { if (!f.ghost) inflict(pl, e, 'freeze', 1); else if (real(e)) stAdd(e, 'freeze', 1); }
        }, { ghost: g });
      }
    }
  };

  // ---- Liofilización → Frío Polar ----
  MECH['freeze-dry'] = {
    zone(pl, m, f) {
      if (sees(f.x, f.y)) for (let i = 0; i < 8; i++) {
        const a = i * 0.785;
        G.FX.sp('shard', 'ice', f.x + Math.cos(a) * f.r * 0.5, f.y + Math.sin(a) * f.r * 0.3 - 4, { vx: Math.cos(a) * 60, vy: -40, life: 0.4, angle: -Math.PI / 2 });
      }
      for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
        const wet = isWet(e), water = !!(e.types && e.types.includes('water'));
        if (!f.ghost) {
          // ×2 contra empapados y contra el tipo Agua (súper eficaz aunque el Hielo no lo sea).
          let k = wet ? 2 : 1;
          if (water) k *= 4;
          hit(pl, e, f.dmg * k, f.col, e.x - f.x, e.y - f.y, 0, m);
        }
        if (e.dead) continue;
        if (!f.ghost || real(e)) stAdd(e, 'freeze', (wet ? 1.5 : 0.6) * (m.stun || 1));
        if (wet && !f.ghost) stEnd(e, 'wet');
      }
      if (!f.ghost) for (const p of G.World.propsInCircle(f.x, f.y, f.r)) G.World.damageProp(p, f.dmg, f.col);
    },
    idle(pl, m, dt) {
      // Frío Polar: los congelados (por lo que sea) con menos del 25 % de vida se hacen añicos; a los jefes, un 5 %.
      if (!m.evolved || !ST_SET.size) return;
      const s = stOf(m);
      if ((s.pt = (s.pt || 0) - dt) > 0) return;
      s.pt = 0.1;
      for (const e of ST_SET) {
        const fz = stGet(e, 'freeze');
        if (e.dead || !fz) continue;
        let d = 0;
        if (big(e)) { if (!fz.polar) { fz.polar = 1; d = e.maxHp * 0.05; } }
        else if (e.hp < e.maxHp * 0.25) d = e.hp + 10;
        if (!d) continue;
        if (sees(e.x, e.y)) { G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#d8f6ff', 14, 200); for (let i = 0; i < 5; i++) G.FX.sp('shard', 'ice', e.x, e.y - e.bodyH * 0.5, { vx: G.U.rand(-120, 120), vy: G.U.rand(-140, 20), grav: 300, life: 0.5, spin: 8 }); G.Audio.sfx('break'); }
        e.hurt(d, '#bff3ff', 0, 0, 0);
        pl.dmgDealt += d; m.dealt = (m.dealt || 0) + d; pl.onDealt(d);
      }
    }
  };

  // ---- Chuzos → Lanza Glacial ----
  function icicleStrike(f) {
    // Los carámbanos que no golpean se quedan clavados 3 s como pinchos de hielo que frenan.
    const m = f.m, pl = f.owner;
    for (let i = 0; i < f.n; i++) {
      const cx = f.x + colOff(i, f.w), x = cx + G.U.rand(-f.w / 2 + 4, f.w / 2 - 4), y = f.y + G.U.rand(-f.h / 2, f.h / 2);
      if (G.EnemyMgr.queryCircle(x, y, 14).length) continue;
      mxTrim(pl, 'spike', 9);
      zone(pl, m, { elem: 'ice', tag: 'spike', x, y, r: 12 * areaK(m), life: 3 * (pkOf(m).dur || 1), every: 0.4, dmg: 0, slow: 0.4, st: ['chill', 3, 1], ghost: f.ghost, fx: 0.5,
        dg(ctx, z, own) {
          ctx.globalAlpha = 0.25 * own; ctx.fillStyle = '#bff3ff';
          ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.5, 0, 0, 6.2832); ctx.fill();
          G.VFX.draw(ctx, 'shard', 'ice', z.x, z.y - 6, { angle: -Math.PI / 2, alpha: own * Math.min(1, (z.life - z.t) * 3) });
        } });
    }
  }
  function glacialLance(pl, m) {
    const g = ghost, c = g ? null : crowd(pl.x, pl.y, 300), tg = c || (g ? null : spotFor(pl, m));
    const x = tg ? tg.x : pl.x + Math.cos(pl.aim) * 140, y = tg ? tg.y : pl.y + Math.sin(pl.aim) * 140;
    // Una lanza de hielo gigante cae en el centro del grupo y congela un círculo que crece (0 → 120 px en 2 s).
    later(pl, m, 0.35, x, y, f => {
      const R = 120 * areaK(m);
      if (sees(f.x, f.y, R)) { G.FX.ring(f.x, f.y, 4, 50, '#ffffff', 0.35, 5); G.FX.burst(f.x, f.y - 10, '#bff3ff', 18, 220); G.Audio.sfx('break'); G.Camera.kick(0.25); }
      areaHit(pl, m, f.x, f.y, 50 * areaK(m), atk(pl, m) * 3, { knock: 80, ghost: f.ghost });
      zone(pl, m, { elem: 'ice', x: f.x, y: f.y, r: 4, grow: [4, R, 2], life: 2.6, every: 0.25, dmg: atk(pl, m) * 0.3, slow: 0.5, ghost: f.ghost, frozen: new Set(), fx: 10,
                    each: (z, e) => {
                      if (z.frozen.has(e.id) || G.U.dist(e.x, e.y, z.x, z.y) < z.r - 14) return;
                      z.frozen.add(e.id);
                      if (!z.ghost || real(e)) stAdd(e, 'freeze', 1);
                    } });
    }, { ghost: g, pad: 200,
      dg(ctx, f, own) {
        const k = Math.min(1, f.t / 0.35);
        ctx.globalAlpha = 0.5 * own; ctx.strokeStyle = '#bff3ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 50 * k, 30 * k, 0, 0, 6.2832); ctx.stroke();
      },
      da(ctx, f, own) {
        const k = Math.min(1, f.t / 0.35);
        G.VFX.draw(ctx, 'shard', 'ice', f.x, f.y - (1 - k) * 220 - 30, { angle: Math.PI / 2, scale: 4, alpha: own });
      } });
  }
  MECH['icicle-crash'] = {
    cast(pl, m) {
      column(pl, m);
      const f = fields[fields.length - 1];
      if (f && f.kind === 'column') f.onStrike = icicleStrike;
    },
    evo(pl, m) { glacialLance(pl, m); }
  };

  // ---- Rayo Aurora → Mundo Gélido ----
  const AUR = [];
  MX_TICK.push(() => {
    if (!AUR.length) return;
    const T = now();
    for (let i = AUR.length - 1; i >= 0; i--) {
      const a = AUR[i];
      if (T < a.t) continue;
      AUR.splice(i, 1);
      // La cinta de aurora vuelve a golpear al que cruza.
      if (a.e.dead || a.pl.dead || G.U.dist2(a.e.x, a.e.y, a.pl.x, a.pl.y) > (a.m.radius + 30) ** 2) continue;
      if (sees(a.e.x, a.e.y)) G.FX.sp('star', 'aurora', a.e.x, a.e.y - a.e.bodyH * 0.6, { life: 0.25, spin: 6 });
      hit(a.pl, a.e, a.d, '#bfe8ff', 0, 0, 0, a.m, ICE_RAW);
    }
  });
  MX_RESET.push(() => { AUR.length = 0; });
  MECH['aurora-beam'] = {
    after(pl, e, m) {
      inflict(pl, e, 'atkdown', 3, 0.3);                            // baja el ataque (−30 %)
      if (!e.dead && AUR.length < 40) AUR.push({ e, pl, m, t: now() + 0.35, d: atk(pl, m) * 0.25 });
    },
    tick(pl, m) {
      const s = stOf(m);
      const f = sweepTurn(pl, m, s, () => {
        if (!m.evolved) return;
        // Mundo Gélido: tras cada vuelta, el círculo barrido se hiela 2 s.
        zone(pl, m, { elem: 'ice', x: pl.x, y: pl.y, r: m.radius, life: 2 * (pkOf(m).dur || 1), every: 0.4, dmg: 0, slow: 0.5, ghost: false, seen: new Set(), fx: 12,
                      each: (z, e) => { if (!z.seen.has(e.id)) { z.seen.add(e.id); stAdd(e, 'chill', 3, 2); } } });
        if (sees(pl.x, pl.y)) G.Audio.sfx('shot', { kind: 'aura', type: 'ice' });
      });
      // La aguja cambia de color como una aurora.
      if (f) f.vis = AURORA_VIS[Math.floor(now() * 6) % AURORA_VIS.length];
    }
  };
  const AURORA_VIS = ['aurora', 'ice', 'fairy', 'aurora2'].map(pal => Object.freeze({ beam: 'shard', proj: 'shard', pal }));
  /* ---------------- fin de los ataques únicos: Normal, Fuego, Agua, Planta, Eléctrico, Hielo ---------------- */

  return { tick, resolve, ghostCast, ghostOrbit, updateFields, drawGroundFields, drawAirFields, clearFields,
           reach, cooldown, wardBlock, zOf, zUse, mx: MXT,
           get fieldCount() { return fields.length; } };
})();
