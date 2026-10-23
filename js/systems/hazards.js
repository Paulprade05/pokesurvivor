/* ============ hazards.js — ataques con aviso de los enemigos ============
 * Un peligro se dibuja primero en el suelo como AVISO (se va llenando) y, al
 * cumplirse el tiempo, golpea a quien esté dentro:
 *
 *   zone  círculo (zonas de Tierra/Fuego/Veneno, explosiones, caídas de salto)
 *   beam  rayo recto desde el enemigo (Eléctrico, Psíquico, Dragón, Hielo)
 *
 * Cada ordenador dibuja los peligros y comprueba sólo SU Pokémon. En
 * cooperativo los crea el anfitrión y los manda con 'hz'.
 *
 * Los de Arceus (systems/judgment.js) quitan un % de la vida (pct) sin mirar
 * tipos ni defensa (pure), y la Sentencia cae como un pilar de luz (vis).
 *
 * grp (23-10-2026): las marcas de un mismo ataque de jefe (meteoros, rayo que
 * barre, cruz...) son un grupo y te golpean como mucho una vez cada GRP_GAP s,
 * aunque estés donde se solapan varias (un peligro se salta la invulnerabilidad
 * de después de un golpe). Una versión vieja no lo lee y cuenta cada una.
 */
G.Hazards = (() => {
  const GRP_GAP = 0.45;
  let list = [];
  const grpHit = new Map();       // grupo -> cuándo te golpeó (reloj de los peligros)
  let clock = 0;

  /** h: { kind, x, y, r | angle, len, w, delay, dmg, type, color, pct?, pure?, vis?, grp? } */
  function add(h, fromNet = false) {
    const o = Object.assign({ t: 0, hit: false, end: 0.3 }, h);
    if (fromNet && typeof o.grp !== 'number') o.grp = 0;
    list.push(o);
    if (!fromNet && G.Coop.isHost) {
      G.Coop.broadcast(['hz', { kind: o.kind, x: Math.round(o.x), y: Math.round(o.y), r: o.r, angle: o.angle, len: o.len, w: o.w,
                                delay: o.delay, dmg: Math.round(o.dmg), type: o.type, color: o.color, pct: o.pct, pure: o.pure, vis: o.vis, cat: o.cat,
                                boom: o.boom ? 1 : 0, grp: o.grp || undefined }]);
    }
    return o;
  }

  function clear() { list = []; grpHit.clear(); }

  /** ¿Te puede golpear ya esta marca? (las de un grupo, una vez cada GRP_GAP s) */
  function grpReady(h) {
    if (!h.grp) return true;
    const at = grpHit.get(h.grp);
    if (at != null && clock - at < GRP_GAP) return false;
    grpHit.set(h.grp, clock);
    return true;
  }

  function inside(h, x, y, r) {
    if (h.kind === 'zone') return G.U.dist2(x, y, h.x, h.y) < (h.r + r * 0.6) ** 2;
    const ca = Math.cos(h.angle), sa = Math.sin(h.angle);
    const px = x - h.x, py = y - h.y;
    const along = px * ca + py * sa;
    if (along < -r || along > h.len + r) return false;
    return Math.abs(-px * sa + py * ca) <= h.w / 2 + r * 0.6;
  }

  function update(dt) {
    const pl = G.Game.player;
    clock += dt;
    // (Hacia delante en orden: en un grupo, la primera marca que cae es la que cuenta.)
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      h.t += dt;
      if (!h.hit && h.t >= h.delay) {
        h.hit = true;
        detonate(h);
        // (Humedad: la explosión de un kamikaze no le daña, ver data/ability-fx.js.)
        if (pl && !pl.dead && inside(h, pl.x, pl.y, pl.r) && !(h.boom && pl.abil && pl.abil.damp) && grpReady(h)) {
          pl.invuln = 0;
          pl.hurt(h.pct ? Math.max(h.dmg, pl.maxHp * h.pct) : h.dmg, h.type, !!h.pure, h.cat);
        }
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (h.hit && h.t >= h.delay + h.end) list.splice(i, 1);
    }
    if (!list.length && grpHit.size) grpHit.clear();
    else if (grpHit.size > 32) for (const [g, at] of grpHit) if (clock - at > GRP_GAP) grpHit.delete(g);
  }

  // Efecto de un enemigo: no se atenúa con «Transparencia de tus ataques» (ver fx.js).
  const foeFx = type => Object.assign(G.VFX.forType(type), { foe: true });

  function detonate(h) {
    const near = G.Camera.sees(h.x, h.y, 120);
    if (h.vis === 'pillar') {
      // Pilar de luz que cae del cielo.
      G.FX.beam(h.x, h.y, -Math.PI / 2, 420, h.r * 1.1, h.color, foeFx('electric'));
      G.FX.ring(h.x, h.y, 4, h.r * 1.3, '#fff3c8', 0.4, 5);
      G.FX.burst(h.x, h.y - 6, h.color, 10, 180);
      if (near) { G.Audio.sfx('judge'); G.Camera.kick(0.2); }
    } else if (h.kind === 'zone') {
      G.FX.ring(h.x, h.y, 4, h.r, h.color, 0.35, 5);
      G.FX.burst(h.x, h.y - 6, h.color, Math.round(h.r / 3), 160);
      if (near) { G.Audio.sfx('break'); if (h.r > 60) G.Camera.kick(0.35); }
    } else {
      G.FX.beam(h.x, h.y - G.LIFT, h.angle, h.len, h.w, h.color, foeFx(h.type || (h.pure ? 'electric' : 'normal')));
      if (near) G.Audio.sfx('shot', { kind: 'beam', type: h.type });
    }
  }

  /*
   * Camino del área que golpea de verdad a tu Pokémon (radio r), igual que
   * inside(): la zona es un círculo de h.r + 0,6·r y el rayo, un rectángulo
   * que sobra r por los extremos y 0,6·r por los lados. (Antes se dibujaba una
   * elipse de 0,75·h.r de alto y golpeaba fuera de lo que se veía.)
   * s: escala (la parte que se va llenando); inset: hacia dentro, en unidades.
   * Con el contexto ya movido al peligro (y girado, si es un rayo).
   */
  function area(ctx, h, r, s, inset = 0) {
    ctx.beginPath();
    if (h.kind === 'zone') ctx.arc(0, 0, Math.max(1, (h.r + r * 0.6) * s - inset), 0, 6.2832);
    else {
      const hw = Math.max(0.5, (h.w / 2 + r * 0.6) * s - inset);
      ctx.rect(-r + inset, -hw, h.len + 2 * (r - inset), hw * 2);
    }
  }

  // Rayas diagonales blancas para los avisos de alto contraste (se hacen una vez).
  let stripes = null;
  function stripePattern(ctx) {
    if (!stripes) {
      const c = document.createElement('canvas');
      c.width = c.height = 12;
      const g = c.getContext('2d');
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-3, 15); g.lineTo(15, -3);
      g.moveTo(-3, 3); g.lineTo(3, -3);
      g.moveTo(9, 15); g.lineTo(15, 9);
      g.stroke();
      stripes = ctx.createPattern(c, 'repeat');
    }
    return stripes;
  }

  /** Avisos en el suelo (debajo de los Pokémon). */
  function draw(ctx) {
    if (!list.length) return;
    const blink = Math.sin(performance.now() / 60) > 0;
    const pl = G.Game.player, r = pl ? pl.r : 12;
    // «Avisos de alto contraste» (daltónicos): negro y blanco con rayas, sin el color del tipo.
    const hi = !!G.Settings.get('hazardHi'), calm = G.Settings.get('calm');
    for (const h of list) {
      if (h.hit) continue;
      const k = Math.min(1, h.t / h.delay), near = k > 0.75;
      ctx.save();
      ctx.translate(h.x, h.y);
      if (h.kind !== 'zone') ctx.rotate(h.angle);
      if (hi) {
        area(ctx, h, r, 1);
        ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.fill();
        area(ctx, h, r, k);
        ctx.globalAlpha = 0.6; ctx.fillStyle = stripePattern(ctx); ctx.fill();
        area(ctx, h, r, 1);
        ctx.globalAlpha = 0.9; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.lineWidth = 2.5; ctx.strokeStyle = near && (calm || blink) ? '#ffe14d' : '#fff'; ctx.stroke();
      } else {
        area(ctx, h, r, 1);
        ctx.globalAlpha = h.kind === 'zone' ? 0.16 : 0.14;
        ctx.fillStyle = h.color; ctx.fill();
        area(ctx, h, r, k);
        ctx.globalAlpha = h.kind === 'zone' ? 0.32 : 0.34;
        ctx.fill();
        // Borde oscuro debajo del de color: se ve aunque el suelo se parezca
        // al color del ataque (el marrón de la arena de Tierra).
        area(ctx, h, r, 1);
        ctx.globalAlpha = 0.6; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
        ctx.stroke();
        ctx.globalAlpha = near && blink ? 0.95 : 0.6;
        ctx.strokeStyle = h.color; ctx.lineWidth = 2;
        ctx.setLineDash(h.kind === 'zone' ? [4, 4] : [6, 4]);
        ctx.stroke();
        // A punto de golpear: borde blanco por dentro que parpadea (fijo con «Menos destellos»).
        if (near) {
          ctx.setLineDash([]);
          area(ctx, h, r, 1, 3);
          ctx.globalAlpha = calm ? 0.7 : blink ? 0.9 : 0.25;
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  return { add, clear, update, draw, inside, get all() { return list; }, get count() { return list.length; } };
})();
