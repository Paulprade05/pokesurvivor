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

  /*
   * Marcas en el suelo (26-10-2026): parecen parte del campo de batalla, en el
   * mismo píxel que el mapa (1 px de arte = 2 de mundo): el suelo se oscurece y se
   * agrieta en el color del ataque, con un aro de runas; dentro crece el relleno
   * hasta el borde (cuando llega, golpea). El tamaño es el mismo que golpea
   * (area/inside). Se pintan una vez por color y tamaño y se guardan: por aviso,
   * una o dos imágenes y, al final, el borde blanco que parpadea.
   */
  const PX = 2;
  const decals = new Map();
  function rgbOf(hex) {
    const s = String(hex || '#ffffff').replace('#', '');
    const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s.slice(0, 6), 16) || 0xffffff;
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function decalCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    return { c, g, img, d: img.data };
  }
  function put(D, x, y, rgb, a) {
    if (x < 0 || y < 0 || x >= D.c.width || y >= D.c.height) return;
    const o = (y * D.c.width + x) * 4, d = D.d;
    // Encima de lo que haya (mezcla normal).
    const sa = a / 255, da = d[o + 3] / 255, oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    for (let i = 0; i < 3; i++) d[o + i] = Math.round((rgb[i] * sa + d[o + i] * da * (1 - sa)) / oa);
    d[o + 3] = Math.round(oa * 255);
  }
  function hash(a, b) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function remember(k, v) { if (decals.size > 64) decals.clear(); decals.set(k, v); return v; }

  /** Zona: suelo oscurecido y agrietado con un aro de runas. R = radio en mundo. */
  function zoneDecal(color, R) {
    const k = 'z' + color + R;
    const got = decals.get(k);
    if (got) return got;
    const r = Math.max(3, Math.round(R / PX)), S = r * 2 + 3, c0 = (S - 1) / 2;
    const D = decalCanvas(S, S);
    const col = rgbOf(color), dark = col.map(v => v * 0.35), black = [8, 6, 14], light = col.map(v => v + (255 - v) * 0.55);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - c0, dy = y - c0, d = Math.hypot(dx, dy);
      if (d > r + 1) continue;
      if (d > r) { put(D, x, y, black, 150); continue; }                  // contorno oscuro de fuera
      if (d > r - 1) { put(D, x, y, col, 235); continue; }                // aro del color
      put(D, x, y, black, 44); put(D, x, y, col, 30);                     // suelo oscurecido y teñido
      // Aro de runas por dentro: puntos y marcas cada pocos grados.
      if (r > 8 && Math.abs(d - (r - 3.5)) < 0.55) {
        const a = Math.atan2(dy, dx), seg = Math.floor((a + Math.PI) / (Math.PI * 2) * Math.max(12, r * 1.4));
        if (seg % 3 !== 1) put(D, x, y, col, 150);
      }
    }
    // Grietas desde el centro (en el color del ataque, más oscuro, con luz a un lado).
    const rays = Math.max(5, Math.min(9, Math.round(r / 4)));
    for (let i = 0; i < rays; i++) {
      const a = i / rays * Math.PI * 2 + hash(i, R) * 0.7;
      let x = c0, y = c0;
      const len = r * (0.55 + hash(R, i) * 0.3);
      for (let s = 0; s < len; s++) {
        x += Math.cos(a) + (hash(i * 31 + s, R) - 0.5) * 0.9;
        y += Math.sin(a) + (hash(s, i * 17 + R) - 0.5) * 0.9;
        put(D, Math.round(x), Math.round(y), dark, 170);
        if (s < len * 0.6) put(D, Math.round(x) - 1, Math.round(y) - 1, light, 60);
      }
    }
    D.g.putImageData(D.img, 0, 0);
    return remember(k, D.c);
  }

  /** Relleno que crece (se dibuja escalado k): el color con un frente claro. */
  function zoneFill(color, R) {
    const k = 'f' + color + R;
    const got = decals.get(k);
    if (got) return got;
    const r = Math.max(3, Math.round(R / PX)), S = r * 2 + 1, c0 = r;
    const D = decalCanvas(S, S);
    const col = rgbOf(color), light = col.map(v => v + (255 - v) * 0.6);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c0, y - c0);
      if (d > r) continue;
      put(D, x, y, col, d > r - 1 ? 0 : 74 + (((x + y) & 1) ? 10 : 0));
      if (d > r - 1) put(D, x, y, light, 200);
    }
    D.g.putImageData(D.img, 0, 0);
    return remember(k, D.c);
  }

  /** Rayo: franja de suelo marcada con flechas en su dirección (en espacio girado). */
  function beamDecal(color, len, hw) {
    const L = Math.max(4, Math.round(len / PX)), W = Math.max(2, Math.round(hw / PX));
    const k = 'b' + color + L + '/' + W;
    const got = decals.get(k);
    if (got) return got;
    const S = W * 2 + 3;
    const D = decalCanvas(L + 2, S);
    const col = rgbOf(color), black = [8, 6, 14];
    for (let y = 0; y < S; y++) for (let x = 0; x < L + 2; x++) {
      const e = Math.abs(y - (S - 1) / 2);
      if (e > W + 1) continue;
      if (e > W || x === 0 || x === L + 1) { put(D, x, y, black, 150); continue; }
      if (e > W - 1 || x === 1 || x === L) { put(D, x, y, col, 235); continue; }
      put(D, x, y, black, 44); put(D, x, y, col, 30);
      // Flechas («>») cada 9 px, apuntando hacia donde va el rayo.
      const cx = (x - 3) % 9;
      if (x > 3 && x < L - 3 && cx >= 0 && Math.abs(cx - (W - 1 - e) * 0.9) < 0.7 && e < W - 1.5) put(D, x, y, col, 160);
    }
    D.g.putImageData(D.img, 0, 0);
    return remember(k, D.c);
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
      if (!hi) {
        // Marca en el suelo (imágenes guardadas) y el relleno que crece.
        ctx.imageSmoothingEnabled = false;
        if (h.kind === 'zone') {
          // (Tamaños de 8 en 8 para guardar pocas imágenes; se estiran al radio exacto.)
          const R = h.r + r * 0.6, Rq = Math.max(8, Math.round(R / 8) * 8);
          const dec = zoneDecal(h.color, Rq), fill = zoneFill(h.color, Rq), q = R / Rq;
          const s = dec.width * PX * q, f = fill.width * PX * q * k;
          ctx.drawImage(dec, -s / 2, -s / 2, s, s);
          if (f >= 2) ctx.drawImage(fill, -f / 2, -f / 2, f, f);
        } else {
          const hw = h.w / 2 + r * 0.6, L = h.len + 2 * r;
          const dec = beamDecal(h.color, Math.max(16, Math.round(L / 16) * 16), Math.max(4, Math.round(hw / 4) * 4));
          const bw = L + 2 * PX, bh = (hw + PX) * 2;
          ctx.drawImage(dec, -r - PX, -bh / 2, bw, bh);
          ctx.globalAlpha = 0.3; ctx.fillStyle = h.color;
          ctx.fillRect(-r, -hw * k, h.len + 2 * r, hw * 2 * k);
          ctx.globalAlpha = 1;
        }
        // A punto de golpear: borde blanco por dentro que parpadea (fijo con «Menos destellos»).
        if (near) {
          area(ctx, h, r, 1, 3);
          ctx.globalAlpha = calm ? 0.7 : blink ? 0.9 : 0.25;
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      // Alto contraste: negro y blanco con rayas (como siempre).
      area(ctx, h, r, 1);
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.fill();
      area(ctx, h, r, k);
      ctx.globalAlpha = 0.6; ctx.fillStyle = stripePattern(ctx); ctx.fill();
      area(ctx, h, r, 1);
      ctx.globalAlpha = 0.9; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = near && (calm || blink) ? '#ffe14d' : '#fff'; ctx.stroke();
      ctx.restore();
    }
  }

  return { add, clear, update, draw, inside, get all() { return list; }, get count() { return list.length; } };
})();
