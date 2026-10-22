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
   * Recarga de m para este jugador (Bromista: los potenciadores se recargan antes, ver data/ability-fx.js).
   * cdMin: tope propio de algunas familias (la ráfaga tiene que acabar antes de la siguiente).
   */
  function cooldown(pl, m) {
    return Math.max(m.cdMin || 0.05, m.cd * pl.cdMul * (m.kind === 'buff' && pl.abil && pl.abil.statusCd || 1));
  }

  /** Pasivos con los que se hizo la instancia (Amplitud, Persistencia...): ver G.Moves.applyPassives. */
  const pkOf = m => m.pk || G.Moves.NO_PASS;

  function tickMove(dt, pl, m, now) {
    if (m.kind === 'orbit') { orbit(pl, m, dt, now); return; }
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
    // Ráfaga: hacia donde miras (o apuntas), no al enemigo. El apuntado se cambia
    // sólo para lanzarla (así el compañero la ve en esa dirección) y se devuelve.
    if (m.kind === 'knife') {
      if (!swap) { swap = true; t0 = pl.target; a0 = pl.aim; }
      if (!pl.manualAim) pl.aim = pl.moveAngle;
    }
    m.t = cooldown(pl, m);
    pl.cast(m);
    if (G.Coop.active) G.Coop.cast(pl, m);
    // Vínculo: su icono destella en el HUD al lanzarse (uno que explota pegado al
    // enemigo, como Ascuas tras Ataque Rápido, casi no se ve).
    m.castAt = performance.now();

    run(pl, m);
    if (swap) { pl.target = t0; pl.aim = a0; }
  }

  function run(pl, m) {
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
    return { burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.type, mcat: m.cat, src: m,
             bounce: m.bounce | 0, drain: m.drain || 0 };
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
    // Réplica: una zona más por carta, sobre otros enemigos distintos.
    let extra = pkOf(m).amt | 0;
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
        if (!e.dead) e.applyStun((m.stun || 1) * (big ? 0.35 : 1));
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
    let m = null;
    for (const x of pl.moves) if (x.kind === 'ward' && (x.charges | 0) > 0 && (!m || x.dmg > m.dmg)) m = x;
    if (!m) return false;
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
                    anim: copy ? new G.Sprites.Animator(pl.dex, (pl.scale || 1) * 0.55, pl.shiny) : null });
    }
    trimOld('ally', pl, m.id, n);
    G.FX.ring(pl.x, pl.y, 4, pl.r * 3, col, 0.3, 2);
  }

  /** El enemigo más cercano al aliado a menos de 170, sin alejarse más de 260 de su dueño. */
  function allyTarget(f, pl) {
    let best = null, bd = 170 * 170;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const d = G.U.dist2(f.x, f.y, e.x, e.y);
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
        if (e && !e.dead) { tx = e.x; ty = e.y; }
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
                              'wipe', 'ally', 'wings', 'flask', 'puddle', 'shower']);
  function updateFields(dt) {
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      f.t += dt;
      if (f.gone || !f.owner || (f.life && f.t >= f.life && f.kind !== 'mine')) { fields.splice(i, 1); continue; }
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
  }

  /** Aliado: abeja o espíritu que flota, o tu Pokémon en pequeño (Paliza). Mira hacia donde va. */
  function drawAlly(ctx, f, now) {
    const fade = Math.min(1, (f.life - f.t) * 3, f.t * 8), sc = f.r >= 8 ? 1.5 : 1;
    if (f.anim) { f.anim.draw(ctx, f.x, f.y, { alpha: fade }); return; }
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
        if (e.dead || (!e.remote && !(e.stunT > 0)) || !cam.sees(e.x, e.y, 20)) continue;
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

    // Animación de concentración de vez en cuando, para que se note vivo.
    pl.orbCastT = (pl.orbCastT || 0) - dt;
    if (pl.orbCastT <= 0) { pl.orbCastT = 1.6; pl.cast({ kind: 'orbit', cd: 1.6 }); }
  }

  /**
   * Pasivos que llegan por la red ([área·100, duración·100, cantidad, propulsión·100]):
   * sólo si están dentro de lo que dan las cartas; si no, ninguno.
   */
  function netPass(a) {
    if (!Array.isArray(a) || a.length < 4) return null;
    for (let i = 0; i < 4; i++) if (!Number.isFinite(a[i])) return null;
    const area = a[0] / 100, dur = a[1] / 100, amt = a[2], pspd = a[3] / 100;
    if (area < 1 || area > 1.5 || dur < 1 || dur > 1.6 || !Number.isInteger(amt) || amt < 0 || amt > 2 || pspd < 1 || pspd > 1.5) return null;
    return { area, dur, amt, pspd };
  }

  /**
   * Repite el ataque de un compañero sólo para verlo (sin daño), con sus pasivos
   * (pas, ver netPass). variant: 1 = un escudo que para un golpe (familia ward).
   */
  function ghostCast(pl, id, lvl, aim, evolved, pas, variant) {
    // Viene de la red: no se cree a ciegas (un id o un nivel raros colgaban a los demás).
    const def = typeof id === 'string' ? G.Moves.BY_ID[id] : null;
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
  const isCrit = pl => !ghost && pl.critChance > 0 && Math.random() < pl.critChance;

  // Habilidad de quien pega (data/ability-fx.js): × al daño, crítico, estados y
  // lo que hace al golpear. (Los compañeros no la llevan aquí: pegan en su ordenador.)
  const abilOut = (pl, m, e) => (pl.abil && pl.abil.out && m ? pl.abil.out(pl, m, e) : 1);
  const critMul = pl => (pl.abil && pl.abil.critMul) || CRIT_MUL;
  /** × a quemaduras, venenos, frenazos y empujones: Potencia Bruta los quita, Dicha los dobla. */
  const statusK = pl => (!pl.abil ? 1 : pl.abil.sheer ? 0 : pl.abil.serene ? 2 : 1);
  function afterHit(pl, e, m) {
    const a = pl.abil;
    if (!a || e.dead) return;
    if (a.hit) a.hit(pl, e, m);
    if (a.touchPoison && m && (m.kind === 'melee' || m.kind === 'dash')) e.applyPoison(1);
  }

  function hit(pl, e, dmg, col, dx, dy, knock, m) {
    const k = typeK(m.type, e) * G.Stats.taken(e.mon, m.cat) * abilOut(pl, m, e);
    const crit = isCrit(pl), sk = statusK(pl);
    dmg *= k * (crit ? critMul(pl) : 1);
    e.hurt(dmg, col, dx, dy, sk ? knock : 0, crit ? 'crit' : G.Types.label(G.Types.mult(m.type, e.types)));
    if (!ghost) pl.onDealt(dmg);
    pl.dmgDealt += dmg;
    m.dealt = (m.dealt || 0) + dmg;               // por ataque, para el resumen de la pausa
    if (m.burn && sk) e.applyBurn(m.burn * sk);
    if (m.poison && sk) e.applyPoison(m.poison * sk);
    if (m.slow && sk) e.applySlow(Math.min(0.8, m.slow * sk));
    afterHit(pl, e, m);
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
        if (G.U.dist2(p.x, p.y, pl.x, pl.y) < (p.r + pl.r) * (p.r + pl.r)) {
          pl.hurt(p.dmg, p.mtype, false, p.cat);
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 7, 110);
          projectiles.splice(i, 1);
        }
        continue;
      }

      // --- disparos de jugadores ---
      // Orbes de un compañero: sólo se ven.
      if (p.orb && p.ghost) continue;
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
      for (const e of G.EnemyMgr.queryCircle((sx + p.x) / 2, (sy + p.y) / 2, half + p.r)) {
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
        if (p.ghost) {
          G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
          if (rebound(p, e)) break;
          if (p.pierce > 0) { p.pierce--; continue; }
          G.FX.burst(p.x, p.y - G.LIFT, p.color, 5, 80);
          projectiles.splice(i, 1);
          break;
        }

        const crit = isCrit(pl), sk = statusK(pl);
        const k = (p.mtype ? typeK(p.mtype, e) : 1) * G.Stats.taken(e.mon, p.mcat) * (crit ? critMul(pl) : 1) * abilOut(pl, p.src, e);
        e.hurt(p.dmg * k, p.color, p.vx || (e.x - pl.x), p.vy || (e.y - pl.y), sk ? p.knock : 0,
               crit ? 'crit' : p.mtype ? G.Types.label(G.Types.mult(p.mtype, e.types)) : null);
        if (Math.random() < 0.5) G.FX.sp('impact', p.vis ? p.vis.pal : 'normal', e.x, e.y - e.bodyH * 0.5, { life: 0.12, scale: 1 });
        pl.dmgDealt += p.dmg * k;
        if (p.src) p.src.dealt = (p.src.dealt || 0) + p.dmg * k;
        pl.onDealt(p.dmg * k);
        if (p.burn && sk) e.applyBurn(p.burn * sk);
        if (p.poison && sk) e.applyPoison(p.poison * sk);
        if (p.slow && sk) e.applySlow(Math.min(0.8, p.slow * sk));
        if (p.drain) pl.heal(p.drain);                    // Beso Drenaje
        afterHit(pl, e, p.src);

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
      e.touchCd = 0.55;
      e.strike(pl);
      pl.hurt(e.dmg, e.atkType, false, e.cat);
      if (pl.hasItem('rockyhelmet')) e.hurt(15 + pl.level * 4, '#9aa6b5', e.x - pl.x, e.y - pl.y, 80);
      if (pl.abil && pl.abil.contact && !pl.dead && !e.dead) pl.abil.contact(pl, e);     // Elec. Estática, Cuerpo Llama...
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.kx += nx * 150; e.ky += ny * 150;
    }
  }

  return { tick, resolve, ghostCast, ghostOrbit, updateFields, drawGroundFields, drawAirFields, clearFields,
           reach, cooldown, wardBlock,
           get fieldCount() { return fields.length; } };
})();
