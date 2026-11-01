/* ============ enemy-ai.js — enemigos más listos (2.0, bloque 4) ============
 * Lo que piensan los enemigos normales; enemy.js sólo llama a estos ganchos (y los
 * campos de distancias son de pathing.js). Sólo corre en el anfitrión o en solitario
 * y nunca depende de la calidad gráfica.
 *
 * «Listeza» que crece con la partida: iq(t) = clamp((eff(t) − 80) / 440, 0, 1): 0 hasta
 * el minuto 2, ~0,38 en el 10 y 1 en el 20 (cuelga del mismo reloj que el director).
 * Los avisos no cambian (1,0 / 1,05 / 1,2 s): más listos, pero igual de justos.
 *
 *   - Desatasco determinista (antes: rodeo al azar de 72° que oscilaba en los huecos):
 *     atascado = lo que le falta por el camino no baja en 1,2 s, casi no se ha movido y
 *     ha chocado con el terreno (detrás de otros enemigos, esperando, no cuenta).
 *     Con camino, sigue el campo por los centros de las casillas 1,5 s; sin camino,
 *     sigue la pared por un lado fijo hasta 2 s; con más de 4 s, si nadie lo ve sale
 *     por delante (Spawner.ahead) y si se ve, da un saltito 2-3 casillas más allá.
 *   - Los de distancia se alejan por el campo (no en recta contra la pared), no
 *     disparan sin línea de vista, rodean en vez de quedarse quietos y apuntan a
 *     donde vas a estar. Los de cuerpo a cuerpo se adelantan y llegan por los lados.
 *   - Terreno según el tipo (e.mv, en el constructor; nunca jefes, ladrón, estampida
 *     ni apoyos):
 *       swim   Agua que no flota: campo swim, ×1,5 en el agua, se ve medio hundido.
 *       dig    Tierra/Roca (chase, charger, tank, jumper): excava, va bajo tierra
 *              hacia donde vas a estar y sale con una zona con aviso (ver dig()).
 *       hop    Volador que no flota: salta el obstáculo si el rodeo es largo.
 *       ghost  Fantasma que no flota: atraviesa paredes y árboles (como mucho 1,5 s
 *              dentro; mientras, medio transparente y tus balas se paran en la pared).
 *       lava   (inmunes al líquido del bioma, y los legendarios: rift.js) campo lava y
 *              ×1,3 dentro de su líquido. Es automático según el bioma (pathing.js clsOf).
 *   - Por la red sólo van bits nuevos del 7.º campo de enemyList (coop.js): 32 bajo
 *     tierra, 64 nadando, 128 dentro de una pared. Los peligros, de los de siempre
 *     (zone): una versión vieja los ve.
 */
G.EnemyAI = (() => {
  const TAU = Math.PI * 2;
  const STUCK_W = 1.2, STRICT = 1.5, WALL_T = 2, STUCK_MAX = 4;
  const DIG_MAX = 2, DIG_SINK = 0.45, DIG_UNDER = 2.2, DIG_RISE = 0.6;
  const MELEE_OUT = new Set(['ranged', 'fan', 'beamer', 'zoner', 'healer', 'summoner', 'thief', 'stampede']);
  const SUPPORT = new Set(['healer', 'shielder', 'summoner']);
  const DIGGERS = new Set(['chase', 'charger', 'tank', 'jumper']);
  const LOS_NEED = new Set(['ranged', 'fan', 'beamer']);

  const time = () => (G.Game && G.Game.st ? G.Game.st.time : 0);
  /** Listeza de los enemigos en el segundo t (0 al principio, 1 desde el minuto 20). */
  function iq(t = time()) { return G.U.clamp(((G.Enemies && G.Enemies.eff ? G.Enemies.eff(t) : 0) - 80) / 440, 0, 1); }
  // Número fijo por enemigo en [0, 1) (lado de rodear, ángulo de flanqueo).
  const hashOf = (e, k) => G.U.hash(e.id | 0, k, 4111);
  const clock = () => G.Path.clock;

  /** Cómo usa el terreno (constructor de Enemy). */
  function mvFor(e) {
    if (e.boss || e.flying || SUPPORT.has(e.behavior) || e.behavior === 'thief' || e.behavior === 'stampede') return null;
    for (const t of e.types) {
      if (t === 'ghost') return 'ghost';
      if (t === 'water') return 'swim';
      if ((t === 'ground' || t === 'rock') && DIGGERS.has(e.behavior) && G.Enemies && G.Enemies.eff && G.Enemies.eff(time()) >= 70) return 'dig';
      if (t === 'flying') return 'hop';
    }
    return null;
  }

  /** ¿No se le ve ni se le puede tocar? (bajo tierra; en un invitado, con el bit 32 del anfitrión) */
  const hidden = e => !!(e.under || (e.remote && e.net && e.net.st & 32));

  /** Multiplicador de velocidad por el terreno (enemy.js: el agua y la lava). */
  function terrainK(e, le) {
    e.swimming = false;
    if (e.mv === 'swim' && !le.dmg && /water|swamp/.test(G.World.liquidKind())) { e.swimming = true; return 1.5; }
    if (!le.dmg && !le.slow && G.World.liquidEffect([]).dmg) return 1.3;     // inmune a su lava, veneno o descarga
    return null;
  }

  // ---------------- moverse ----------------

  /** Punto al que va uno de cuerpo a cuerpo: adelantado y, a media distancia, por un lado (no en fila india). */
  function meleeGoal(e, pl, dist, spd, q) {
    let gx = pl.x, gy = pl.y;
    if (q <= 0 || pl._vx == null || e.boss || MELEE_OUT.has(e.behavior) || e.behavior === 'runner') return null;
    if (dist > 120) {
      const lead = q * G.U.clamp(dist / Math.max(60, spd), 0, 1.2) * (0.6 + 0.4 * hashOf(e, 3));
      gx += pl._vx * lead; gy += pl._vy * lead;
    }
    if (dist > 120 && dist < 350) {
      const a = (hashOf(e, 1) < 0.5 ? -1 : 1) * (20 + 50 * hashOf(e, 2)) * Math.PI / 180 * q;
      const b = Math.atan2(e.y - gy, e.x - gx) + a, r = Math.min(dist * 0.5, 120);
      gx += Math.cos(b) * r; gy += Math.sin(b) * r;
    }
    return [gx, gy];
  }

  /**
   * Hacia dónde va (lo de antes: recta hacia ti o el camino del campo), con el desatasco, el flanqueo y los fantasma.
   * Devuelve [dx, dy] normalizado. (Para los de distancia que guardan distancia, enemy.js no pide el camino.)
   */
  function steer(e, dt, pl, dist, dx, dy, spd, keep) {
    if (e.aiStrict > 0) e.aiStrict -= dt;
    if (e.ghostOut > 0) e.ghostOut -= dt;
    e.noClip = e.mv === 'ghost' && !(e.ghostOut > 0) && e.phase !== 'dash';
    if (e.flying) return [dx, dy];
    const q = iq();
    // Pared por un lado fijo (sin camino y chocando).
    if (e.aiWall && (e.aiWall.t -= dt) > 0) {
      const w = e.aiWall;
      if (!e.aiN) return [dx, dy];
      const tx = -e.aiN[1] * w.side, ty = e.aiN[0] * w.side;
      return G.U.norm(tx + dx * 0.25, ty + dy * 0.25);
    } else e.aiWall = null;
    const goal = meleeGoal(e, pl, dist, spd, q);
    if (e.noClip) return goal ? G.U.norm(goal[0] - e.x, goal[1] - e.y) : [dx, dy];
    if (keep) return [dx, dy];
    const pd = G.Path.dirFor(e, pl);
    if (pd) return pd;
    if (goal && !e.pathNo) {
      // Vista despejada: al punto de flanqueo si cabe en recta (se mira cada 0,25 s).
      const c = clock();
      if (e.goalAt == null || c - e.goalAt > 0.25 || c < e.goalAt) { e.goalAt = c; e.goalOk = G.Path.clearTo(e, goal[0], goal[1], pl) !== false; }
      if (e.goalOk) return G.U.norm(goal[0] - e.x, goal[1] - e.y);
    }
    return [dx, dy];
  }

  /**
   * Tras moverse (enemy.js, con lo que ha chocado): mira si está atascado y lo resuelve.
   * n: normal del choque ([nx, ny]) o null.
   */
  function after(e, dt, pl, dist, spd, n, holding) {
    if (e.flying || e.under || e.jump || e.behavior === 'thief' || e.behavior === 'stampede') return;
    // (Confuso, con miedo, marioneta...: va a un punto de mentira (combat.js fakeAt), no a ti: no se le desatasca hacia él.)
    if (pl === e.uqFt) { e.aiW = null; e.aiStuckT = 0; return; }
    if (n) e.aiN = n;
    else if (e.aiN && !e.aiWall) e.aiN = null;
    // Rodeando a un tirador contra una pared: al otro lado.
    if (e.aiSideT > 0) e.aiSideT -= dt;
    else if (n && e.aiOrbit) { e.aiSide = -e.aiSide; e.aiSideT = 0.6; }
    // Fantasma dentro de una pared: como mucho 1,5 s; luego sale como uno normal (y 2 s sin atravesar nada).
    if (e.mv === 'ghost') {
      const inside = e.noClip && !G.World.isFree(e.x, e.y, e.r * 0.5, true);
      e.inWall = inside;
      e.wallT = inside ? (e.wallT || 0) + dt : 0;
      if (e.wallT > 1.5) { e.ghostOut = 2; e.noClip = false; e.inWall = false; e.wallT = 0; G.World.collide(e); }
    }
    const touching = dist < e.r + pl.r + 10;
    const TS = G.World.TS;
    const m = e.pathV != null ? e.pathV / 5 * TS : dist;
    let w = e.aiW;
    if (!w || touching || holding || e.noClip) { e.aiW = { t: 0, m, x: e.x, y: e.y, hit: false }; e.aiStuckT = 0; return; }
    w.t += dt;
    if (n) w.hit = true;
    if (m < w.m - TS * 0.3) { w.t = 0; w.m = m; w.x = e.x; w.y = e.y; e.aiStuckT = 0; return; }
    if (w.m < m) w.m = Math.max(m - TS, w.m);           // (si te alejas, no es culpa suya)
    if (w.t < STUCK_W) return;
    const moved = Math.hypot(e.x - w.x, e.y - w.y), hit = w.hit;
    w.t = 0; w.x = e.x; w.y = e.y; w.m = m; w.hit = false;
    if (moved > spd * STUCK_W * 0.45) { e.aiStuckT = 0; return; }
    // (Sin chocar con el terreno, para las cuentas no está atascado: espera detrás de otros. Pero se le ayuda igual.)
    e.aiTerr = hit;
    e.aiStuckT = (e.aiStuckT || 0) + STUCK_W;
    if (e.aiStuckT >= STUCK_MAX) { unstick(e, pl); return; }
    if (e.pathV != null && !e.pathNo) e.aiStrict = STRICT;
    else if (e.aiN) {
      // Sin camino: sigue la pared por el lado que menos se aparta de donde quería ir.
      const [dx, dy] = G.U.norm(pl.x - e.x, pl.y - e.y), nx = e.aiN[0], ny = e.aiN[1];
      e.aiWall = { t: WALL_T, side: (-ny * dx + nx * dy) >= (ny * dx - nx * dy) ? 1 : -1 };
    }
  }

  /** Más de 4 s atascado: si nadie lo ve, sale por delante; si se ve, saltito por el camino. */
  function unstick(e, pl) {
    e.aiStuckT = 0; e.aiW = null; e.aiWall = null;
    const seen = G.Camera.sees(e.x, e.y, 60) || (G.Coop.active && G.Game.everyone().some(o => o && o !== pl && !o.dead && G.U.dist2(o.x, o.y, e.x, e.y) < 700 * 700));
    if (!seen && !e.boss && !(G.Rift && G.Rift.inArena) && G.Spawner.ahead(e, pl)) return;
    const to = G.Path.ahead(e, pl, 2 + (hashOf(e, 5) < 0.5 ? 0 : 1));
    if (to && G.World.isFree(to[0], to[1], Math.min(e.r * 0.8, G.World.TS * 0.45))) leap(e, to[0], to[1], 0.25, 0.5);
    else e.aiStrict = STRICT;
  }

  /** Salto (reutiliza el de los saltadores, enemy.js updateJump). wait: s agachado antes de saltar. */
  function leap(e, x, y, wait, dur) {
    e.jump = { sx: e.x, sy: e.y, tx: x, ty: y, t: -wait, dur };
    e.anim.play('Charge', { speed: 1.4 });
  }

  // ---------------- volador que no flota: salta el obstáculo ----------------

  function hop(e, dt, pl, dist) {
    if (e.mv !== 'hop' || e.jump) return false;
    if ((e.hopCd = (e.hopCd == null ? G.U.rand(1, 3) : e.hopCd) - dt) > 0) return false;
    if (dist > 300 || dist < 70) return false;
    const len = G.Path.pathLen(e, pl);
    if (len == null || len < dist * 1.8) { e.hopCd = 0.5; return false; }
    const [ux, uy] = G.U.norm(pl.x - e.x, pl.y - e.y);
    for (const k of [0.85, 0.65, 0.45]) {
      const d = Math.min(dist - 30, 260) * k / 0.85, x = e.x + ux * d, y = e.y + uy * d;
      if (d < 40 || !G.World.isFree(x, y, Math.min(e.r * 0.8, G.World.TS * 0.45)) || G.Path.reachable(x, y, pl) === false) continue;
      e.hopCd = 6;
      leap(e, x, y, 0.3, 0.6);
      e.hazard({ kind: 'zone', x, y, r: 40, delay: 0.9, dmg: e.dmg, type: e.atkType, color: G.U.TYPE_COLOR[e.atkType] || '#ff7a9e' });
      return true;
    }
    e.hopCd = 1;
    return false;
  }

  // ---------------- excavar ----------------
  /*
   * 1. Se hunde (0,45 s): animación de cargar, recorte y polvo; todavía se le puede dar.
   * 2. Bajo tierra (hasta 2,2 s, e.under): fuera de la rejilla (nada lo encuentra ni toca a nadie), no recibe daño
   *    ni estados ni empujones, no vale de blanco; va ×1,5 hacia donde vas a estar dejando un montículo.
   * 3. Sale (a menos de 60 px o al acabarse el tiempo): una zona con aviso de 0,6 s (r 46, daño ×1,1) y aparece
   *    al estallar. Como mucho 2 bajo tierra a la vez (+1 por jugador más). Recarga de 8-12 s.
   * Empieza a la vista y a 140-420 px, o si recibe el 25 % de su vida en 1 s; con probabilidad iq.
   */
  const diggers = new Set();
  // (Fuera también los que ya no están en la lista: un rezagado sin sitio que se quita, o los guardados durante la grieta.)
  function digCount() { for (const e of diggers) if (e.dead || !e.dig || G.EnemyMgr.get(e.id) !== e) diggers.delete(e); return diggers.size; }

  /** true si se ha encargado del fotograma (enemy.js no lo mueve). */
  function dig(e, dt, pl, dist, spd) {
    if (e.mv !== 'dig') return false;
    const d = e.dig;
    if (e.aiHit > 0) e.aiHit *= Math.exp(-dt);
    if (!d) {
      if (e.jump || e.phase === 'dash' || e.phase === 'aim') return false;
      if ((e.digCd = (e.digCd == null ? G.U.rand(2, 5) : e.digCd) - dt) > 0) return false;
      const q = iq();
      const hurt = e.aiHit > e.maxHp * 0.25;
      if (!hurt && (dist < 140 || dist > 420)) { e.digCd = 0.4; return false; }
      if (!hurt && G.Path.shotLine(e.x, e.y, pl.x, pl.y, pl) === false) { e.digCd = 0.6; return false; }
      const players = G.Game && G.Game.everyone ? G.Game.everyone().filter(p => p && !p.dead).length : 1;
      if (q <= 0 || digCount() >= DIG_MAX + Math.max(0, players - 1) || Math.random() >= q) { e.digCd = 1.5; return false; }
      e.dig = { st: 'sink', t: DIG_SINK };
      diggers.add(e);
      e.anim.play('Charge', { speed: 1.4 });
      dust(e, 6);
      return true;
    }
    d.t -= dt;
    if (d.st === 'sink') {
      e.digSink = 1 - Math.max(0, d.t) / DIG_SINK;
      e.anim.loop('Idle');
      if (d.t <= 0) { d.st = 'under'; d.t = DIG_UNDER; d.xt = 0; goUnder(e, true); }
      return true;
    }
    // Bajo tierra (también durante el aviso de la salida): hacia donde vas a estar, sin paredes.
    e.kx = e.ky = 0;
    if (d.st === 'under') {
      const lead = 0.6;
      const tx = pl.x + (pl._vx || 0) * lead, ty = pl.y + (pl._vy || 0) * lead;
      const dd = Math.hypot(tx - e.x, ty - e.y);
      if (dd > 1) { const s = Math.min(dd, spd * 1.5 * dt); e.x += (tx - e.x) / dd * s; e.y += (ty - e.y) / dd * s; }
      if (Math.random() < dt * 14) dust(e, 1);
      if (dd < 60 || d.t <= 0) {
        // Sólo sale donde quepa (si no, sigue un poco más: hasta 1 s).
        const r = Math.min(e.r * 0.8, G.World.TS * 0.45);
        let spot = G.World.isFree(e.x, e.y, r) ? [e.x, e.y] : null;
        for (let i = 0; !spot && i < 8; i++) {
          const a = i / 8 * TAU, x = e.x + Math.cos(a) * 40, y = e.y + Math.sin(a) * 40;
          if (G.World.isFree(x, y, r)) spot = [x, y];
        }
        if (spot || d.xt > 1) {
          if (spot) { e.x = spot[0]; e.y = spot[1]; }
          d.st = 'rise'; d.t = DIG_RISE;
          e.hazard({ kind: 'zone', x: e.x, y: e.y, r: 46, delay: DIG_RISE, dmg: e.dmg * 1.1, type: e.atkType, color: '#c8a060' });
        } else d.xt += dt;
      }
      return true;
    }
    if (d.st === 'rise' && d.t <= 0) {
      e.dig = null; e.digSink = 0; goUnder(e, false);
      e.digCd = G.U.rand(8, 12); e.aiW = null; e.aiStuckT = 0;
      if (!e.flying) G.World.collide(e);
      e.anim.play('Attack', { speed: 1.4 });
      dust(e, 10);
    }
    return true;
  }
  function goUnder(e, on) {
    e.under = on;
    if (on) { e.kx = e.ky = 0; e.slow = 0; e.slowT = 0; }
  }
  function dust(e, n) {
    if (G.Camera.sees(e.x, e.y, 40)) G.FX.burst(e.x, e.y - 2, '#b89a6a', n, 50);
  }

  // ---------------- los de distancia ----------------

  /** Punto al que apunta (adelantado a donde vas): τ = iq·clamp(dist/190, 0, 1,2)·U(0,6, 1). */
  function aimAt(e, pl, dist, k = null) {
    const q = iq();
    const tau = k != null ? k : q * G.U.clamp(dist / 190, 0, 1.2) * G.U.rand(0.6, 1);
    return [pl.x + (pl._vx || 0) * tau, pl.y + (pl._vy || 0) * tau];
  }

  /**
   * Los que guardan distancia (enemy.js, en vez de lo de antes): v = [vx, vy] (hacia ti o por el camino).
   * Devuelve [vx, vy, anim].
   */
  function ranged(e, dt, pl, dist, spd, vx, vy) {
    const range = e.def.range || 200, keep = range * 0.82;
    const q = iq();
    let anim = 'Walk';
    const [ddx, ddy] = G.U.norm(pl.x - e.x, pl.y - e.y);
    // Línea de vista (los que disparan): cada 0,2 s. Sin ella no disparan y se acercan por el camino.
    let los = true;
    if (LOS_NEED.has(e.behavior)) {
      const c = clock();
      if (e.shotAt == null || c - e.shotAt > 0.2 || c < e.shotAt) { e.shotAt = c; e.shotLos = G.Path.shotLine(e.x, e.y, pl.x, pl.y, pl) !== false; }
      los = e.shotLos;
    }
    e.aiOrbit = false;
    if (!los && dist < range * 1.4) {
      const pd = G.Path.dirFor(e, pl);
      if (pd) { vx = pd[0] * spd; vy = pd[1] * spd; }
      if (e.shotCd < 0.4) e.shotCd = 0.4;
    } else if (dist < keep * 0.75) {
      const a = G.Path.away(e, pl) || [-ddx, -ddy];
      vx = a[0] * spd * 0.8; vy = a[1] * spd * 0.8;
    } else if (dist < keep) {
      if (q > 0.05) {
        // Rodea a 0,82·rango (el lado sale de su id; si choca, cambia).
        if (e.aiSide == null) e.aiSide = hashOf(e, 7) < 0.5 ? -1 : 1;
        const s = spd * 0.55 * q;
        vx = -ddy * e.aiSide * s; vy = ddx * e.aiSide * s;
        e.aiOrbit = true;
      } else { vx *= 0.1; vy *= 0.1; anim = 'Idle'; }
    }
    e.shotCd -= dt;
    if (e.shotCd <= 0 && dist < range && los) {
      e.shotCd = e.def.shotCd || 2;
      const tau = e.behavior === 'beamer' ? q * 0.6 : e.behavior === 'zoner' ? (q > 0.5 ? 1.2 : 0) : null;
      const [ax, ay] = e.behavior === 'healer' || e.behavior === 'summoner' ? [pl.x, pl.y] : aimAt(e, pl, dist, tau);
      e.aiAim = [ax, ay];
      const [sx, sy] = G.U.norm(ax - e.x, ay - e.y);
      e.special(pl, sx, sy);
      e.aiAim = null;
    }
    return [vx, vy, anim];
  }

  /** Embestida: ¿puede empezar a apuntar? (no si la recta hasta ti choca). */
  function canCharge(e, pl) { return G.Path.clearTo(e, pl.x, pl.y, pl) !== false; }
  /** Dirección de la embestida: a donde estarás en iq·0,35 s. */
  function chargeDir(e, pl) {
    const t = iq() * 0.35;
    return G.U.norm(pl.x + (pl._vx || 0) * t - e.x, pl.y + (pl._vy || 0) * t - e.y);
  }
  /** Dónde cae un saltador: donde vas a estar en iq·0,5 s, si allí cabe. */
  function jumpTo(e, pl) {
    const t = iq() * 0.5;
    const x = pl.x + (pl._vx || 0) * t, y = pl.y + (pl._vy || 0) * t;
    return t > 0 && G.World.isFree(x, y, Math.min(e.r * 0.7, G.World.TS * 0.45)) ? [x, y] : [pl.x, pl.y];
  }

  // ---------------- dibujo (capa del suelo, en Normal y en Ultra) ----------------

  function drawGround(ctx) {
    const t = performance.now() / 1000;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || !hidden(e) || !G.Camera.sees(e.x, e.y, 40)) continue;
      const r = Math.max(10, e.r * 0.9);
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#6b5434';
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r, r * 0.45, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a08458';
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 2 - Math.sin(t * 9 + e.id) * 1.2, r * 0.65, r * 0.3, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  /** Para G.EnemyMgr.debugStats y los tests. */
  function stats(list) {
    let vivos = 0, atascados = 0, bajoTierra = 0, nadando = 0;
    for (const e of list) {
      if (e.dead || e.remote) continue;
      vivos++;
      if (e.aiStuckT >= STUCK_W && e.aiTerr) atascados++;
      if (e.under) bajoTierra++;
      if (e.swimming) nadando++;
    }
    return { vivos, atascados, bajoTierra, nadando };
  }

  function clear() { diggers.clear(); }

  return { iq, mvFor, hidden, terrainK, steer, after, hop, dig, ranged, canCharge, chargeDir, jumpTo, drawGround, stats, clear, leap };
})();
