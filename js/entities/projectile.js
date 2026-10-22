/* ============ projectile.js — proyectiles y orbes ============
 * Una sola lista para todo lo que vuela: disparos del jugador, disparos
 * enemigos y los orbes que giran alrededor del Pokémon (los orbes son
 * proyectiles con `orb`, anclados al jugador y que vuelven a golpear cada
 * `rehit` segundos).
 *
 * Viven en el plano del SUELO (como los pies de las entidades) y se dibujan
 * elevados G.LIFT unidades con su sombra debajo. Las paredes y los objetos
 * sólidos los paran (ver combat.js).
 *
 * Familias del 22-10-2026: `grav` (parábola, van por el aire: `air`, sin
 * sombra), `curl` (aspas en espiral), `ricochet` (rebota en una caja
 * alrededor de su dueño y vuelve a golpear cada `rehit` s) y `sway` (la
 * lluvia, que cae con vaivén). `alpha`: algo transparentes (la lluvia).
 */
G.Projectiles = (() => {
  let list = [];
  let nextId = 1;

  function clear() { list = []; }
  function all() { return list; }

  /** Proyectil del jugador. */
  function spawn(o) {
    const p = Object.assign({
      id: nextId++, x: 0, y: 0, vx: 0, vy: 0,
      dmg: 10, r: 6, life: 1.4, t: 0,
      pierce: 0, hits: null, friendly: true,
      color: '#fff', homing: 0, slow: 0, burn: 0, poison: 0, knock: 0,
      orb: false, rehit: 0.34, hitLog: null, phits: null
    }, o);
    if (p.friendly && !p.orb && !p.phits) p.phits = new Set();
    list.push(p);
    return p;
  }

  /** Orbe anclado a un jugador (`owner`): vive mientras el movimiento esté activo. */
  function spawnOrb(o) {
    return spawn(Object.assign({
      orb: true, life: Infinity, pierce: Infinity, hitLog: new Map()
    }, o));
  }

  /** Borra los orbes de un jugador (o todos) al cambiar de movimiento activo. */
  function clearOrbs(owner) { list = list.filter(p => !p.orb || (owner && p.owner !== owner)); }

  function update(dt, player, enemies) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;

      if (p.orb) {
        // Gira alrededor de su jugador.
        const o = p.owner || player;
        p.oa += p.ospeed * dt;
        p.x = o.x + Math.cos(p.oa) * p.orad;
        p.y = o.y + Math.sin(p.oa) * p.orad * 0.7;
        continue;
      }

      if (p.t >= p.life) { list.splice(i, 1); continue; }

      // Bumerán: a los `boom` segundos se da la vuelta (y puede volver a
      // golpear a los mismos) y vuelve a su dueño; al llegar, desaparece.
      if (p.boom) {
        const o = p.owner || player;
        if (!p.back && p.t >= p.boom) { p.back = true; p.hits = new Set(); }
        if (p.back) {
          const [dx, dy] = G.U.norm(o.x - p.x, o.y - p.y);
          p.vx = G.U.damp(p.vx, dx * p.bsp, 7, dt);
          p.vy = G.U.damp(p.vy, dy * p.bsp, 7, dt);
          if (G.U.dist2(p.x, p.y, o.x, o.y) < (o.r + 8) ** 2) { list.splice(i, 1); continue; }
        }
      }

      // Parábola (lob): cae con gravedad (en pantalla, +y).
      if (p.grav) p.vy += p.grav * dt;
      // Lluvia (dusting): vaivén a los lados mientras cae (los que persiguen, no).
      if (p.sway != null && !p.homing) p.vx = 30 * Math.sin(4 * p.t + p.sway);
      // Aspas (cross): la velocidad gira curl rad/s (espiral en sentido horario).
      if (p.curl) {
        const c = Math.cos(p.curl * dt), s = Math.sin(p.curl * dt), vx = p.vx;
        p.vx = vx * c - p.vy * s; p.vy = vx * s + p.vy * c;
      }

      // Teledirigido: curva la velocidad hacia el enemigo más cercano.
      // (La carambola, sólo a los de cerca: si no, se pegaba al borde de su caja.)
      if (p.homing > 0 && p.friendly) {
        const tg = nearest(enemies, p.x, p.y, p.ricochet ? 150 : 340);
        if (tg) {
          const [dx, dy] = G.U.norm(tg.x - p.x, tg.cy() - p.y);
          const sp = Math.hypot(p.vx, p.vy);
          p.vx = G.U.damp(p.vx, dx * sp, p.homing, dt);
          p.vy = G.U.damp(p.vy, dy * sp, p.homing, dt);
        }
        // La carambola no se frena al girar (si no, a los 3 s apenas se movía).
        if (p.ricochet && p.spd) {
          const s = Math.hypot(p.vx, p.vy);
          if (s > 1) { p.vx *= p.spd / s; p.vy *= p.spd / s; }
        }
      }

      p.px = p.x; p.py = p.y;          // para la colisión barrida (ver combat.js)
      if (p.vis && p.vis.trail && G.Camera.sees(p.x, p.y, 20)) {
        p.trailT = (p.trailT || 0) - dt;
        if (p.trailT <= 0) { p.trailT = 0.04; G.FX.trail(p.vis.trail, p.vis.pal, p.x, p.y - G.LIFT, p.vx, p.vy); }
      }
      if (p.ricochet) ricochet(p, dt, player);
      else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // Fuera de la vista con margen generoso -> se descarta.
      if (!G.Camera.sees(p.x, p.y, 260)) { list.splice(i, 1); continue; }
    }
  }

  /** ¿Para a una carambola? Las paredes y los objetos sólidos que no se rompen. */
  function hard(x, y, r) {
    const b = G.World.projectileBlock(x, y, r);
    return b === 'wall' || (!!b && !b.destructible);
  }

  /**
   * Carambola (ricochet): avanza rebotando en las paredes y en los bordes de una
   * caja fija de ±box alrededor de su dueño (no depende de la cámara: es igual en
   * todos los aparatos). En cada rebote deja p.bounced para combat.js (chispa,
   * sonido y la explosión de la evolución).
   */
  function ricochet(p, dt, player) {
    const o = p.owner || player, B = p.box || 200;
    let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, hit = false;
    // Paredes: primero x y luego y. Si ya está dentro de una (la caja se movió), sale sin rebotar.
    if (!hard(p.x, p.y, p.r)) {
      if (hard(nx, p.y, p.r)) { p.vx = -p.vx; nx = p.x; hit = true; }
      if (hard(nx, ny, p.r)) { p.vy = -p.vy; ny = p.y; hit = true; }
    }
    // Bordes de la caja: se devuelve dentro y, si iba hacia fuera, rebota.
    if (nx > o.x + B) { nx = o.x + B; if (p.vx > 0) { p.vx = -p.vx; hit = true; } }
    else if (nx < o.x - B) { nx = o.x - B; if (p.vx < 0) { p.vx = -p.vx; hit = true; } }
    if (ny > o.y + B) { ny = o.y + B; if (p.vy > 0) { p.vy = -p.vy; hit = true; } }
    else if (ny < o.y - B) { ny = o.y - B; if (p.vy < 0) { p.vy = -p.vy; hit = true; } }
    p.x = nx; p.y = ny;
    // Un rebote «cuenta» como mucho cada 0,1 s (en una esquina rebota dos veces seguidas).
    if (hit && p.t - (p.bt || -1) >= 0.1) { p.bt = p.t; p.bounced = true; p.bx = nx; p.by = ny; }
  }

  function nearest(enemies, x, y, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = G.U.dist2(x, y, e.x, e.cy());
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function remove(p) {
    const i = list.indexOf(p);
    if (i >= 0) list.splice(i, 1);
  }

  function draw(ctx) {
    const L = G.LIFT;
    // «Transparencia de tus ataques»: los tuyos (y su sombra), más suaves; los enemigos, igual.
    const own = G.FX.ownAlpha();
    // Sombras primero, todas juntas.
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (const p of list) {
      if (p.noShadow) continue;                 // va por el aire (parábola): sin sombra
      ctx.globalAlpha = p.friendly ? own : 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.9, p.r * 0.38, 0, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Los disparos enemigos llevan un aro rojo en el suelo: "esto te hace daño".
    // Con «Avisos de alto contraste», amarillo con borde negro (el rojo sobre la
    // hierba es lo que peor ven los daltónicos).
    const hi = G.Settings.get('hazardHi');
    ctx.fillStyle = hi ? 'rgba(255,225,77,.6)' : 'rgba(255,60,80,.35)';
    if (hi) { ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 1.5; }
    for (const p of list) {
      if (p.friendly) continue;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.5, p.r * 0.6, 0, 0, 6.2832); ctx.fill();
      if (hi) ctx.stroke();
    }
    for (const p of list) {
      const v = p.vis || G.VFX.forType('normal');
      const shape = v.proj;
      // (La lluvia aparece poco a poco: en vertical nace ya dentro de la pantalla.)
      const a = p.orb ? 1 : Math.min(1, (p.life - p.t) * 4, p.sway != null ? p.t * 8 : 1);
      let angle = 0;
      if (G.VFX.isDir(shape)) angle = p.orb ? p.oa + Math.PI / 2 : Math.atan2(p.vy, p.vx);
      else if (G.VFX.spins(shape)) angle = p.t * 9;
      G.VFX.draw(ctx, shape, v.pal, p.x, p.y - L, {
        angle, alpha: (p.friendly ? a * own : a) * (p.alpha || 1), scale: p.r >= 8 ? 1.5 : 1,
        frame: Math.floor(p.t * 12)
      });
    }
  }

  return { clear, all, spawn, spawnOrb, clearOrbs, update, remove, draw, nearest,
           get count() { return list.length; } };
})();
