/* ============ legend-fx.js — la aparición de cada legendario de grieta (bloque H de la 1.0) ============
 * Pedido del dueño (24-11-2026): «cuando aparecen los legendarios de las grietas, que cada uno tenga una animación
 * personal; cuando haya dos se verá primero una animación y luego otra». Decidido: uno detrás de otro, con cámara y
 * presentación con su nombre; se puede saltar; más corta la segunda vez que ves a ese legendario. Las 88 animaciones
 * propias las hace otra sesión poco a poco: aquí está el SISTEMA y tres de ejemplo.
 *
 * Quién hace qué:
 *   - rift.js lleva la cola (uno detrás de otro), la cámara, la presentación con el nombre, el salto y el «ya visto».
 *   - Aquí, lo que se ve en el mundo mientras sale cada uno: def(dex) da su animación (la propia si la tiene; si no, la
 *     genérica, que ya es distinta para cada uno: su estilo y su toque de rift.js APPEAR, sus colores de tipo y su aura).
 *
 * Cómo se añade la animación propia de un legendario (guía completa en docs/ANIMACIONES-LEGENDARIOS.md):
 *   G.LegendFX.add(dex, {
 *     title:  'Su título',            // presentación, debajo del nombre (español; el inglés, en lang-en.js)
 *     dur:    2.2,                    // segundos la primera vez que lo ves (1,6-2,6)
 *     short:  0.9,                    // segundos las siguientes (0,7-1,1)
 *     cue:    0.8,                    // en qué punto (0..1) «llega»: temblor, sonido y destello (una vez)
 *     sprite(l, k)          → { a, rise, lift, ox, flash }   cómo se ve su sprite en k (ver BossFX.appearSprite)
 *     back(ctx, l, k, now)  lo de debajo del sprite (suelo, sombras), en coordenadas del mundo
 *     front(ctx, l, k, now) lo de encima (partículas, luces)
 *     tick(l, k, dt)        opcional: partículas con G.FX, temblores con shake(l, fuerza)
 *     onCue(l)              opcional: el golpe de llegada (si no, el de siempre: anillo, chispas y temblor)
 *   });
 *   Lo que no se ponga sale de la genérica. `l` trae: dex, x, y (los pies), col y col2 (sus colores), seed, sc (escala),
 *   st y acc (su estilo y su toque), short (true si ya lo habías visto), an (su Animator).
 *
 * Reglas: nada de esto cambia el juego (sólo se dibuja); nada aleatorio que no salga de l.seed (en grupo se ve igual);
 * con «Menos sacudidas y destellos» (calm) no hay temblores (Camera.kick ya los baja) ni destellos de pantalla; coste:
 * formas lisas (arc, ellipse, fillRect, drawImage) y G.FX para partículas; pocas líneas sueltas (van al respaldo de gl2d).
 */
G.LegendFX = (() => {
  const TAU = Math.PI * 2;
  const cl = k => (k < 0 ? 0 : k > 1 ? 1 : k);
  const ease = k => k * k * (3 - 2 * k);
  const H = (a, b, c) => G.U.hash(a, b, c);
  const calm = () => !!(G.Settings && G.Settings.get && G.Settings.get('calm')) ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);   // (o «reducir movimiento» del sistema)
  const shake = (l, a) => { if (G.Camera && G.Camera.kick && !calm()) G.Camera.kick(a); };
  const glow = (ctx, x, y, rx, ry, col, a) => { if (G.FX && G.FX.glowAt) G.FX.glowAt(ctx, x, y, rx, ry, col, a); };
  const B = () => G.BossFX;

  /** Rayas quebradas (grietas, rayos) deterministas con seed. */
  function jag(ctx, x0, y0, x1, y1, seg, amp, seed) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    ctx.moveTo(x0, y0);
    for (let i = 1; i < seg; i++) { const k = i / seg, o = (H(seed, i, 5) - 0.5) * 2 * amp; ctx.lineTo(x0 + dx * k + nx * o, y0 + dy * k + ny * o); }
    ctx.lineTo(x1, y1);
  }

  // ---------------- la genérica: lo que ya es suyo (estilo, toque, colores) + una columna de luz de su tipo ----------------
  const GENERIC = {
    dur: 1.8, short: 0.8, cue: 0.8,
    sprite(l, k) { return B() ? B().appearSprite(l.st, k) : { a: cl((k - 0.5) / 0.4), rise: 0, lift: 0 }; },
    back(ctx, l, k, now) {
      // Columna de luz de su tipo que baja al sitio y se apaga al llegar (encima de lo de su estilo).
      const on = cl((k - 0.15) / 0.3) * (1 - cl((k - 0.82) / 0.18));
      if (on > 0) { glow(ctx, l.x, l.y - 60, 34 + 16 * on, 150, l.col, 0.45 * on); glow(ctx, l.x, l.y, 70, 26, l.col2, 0.5 * on); }
      if (B()) B().appear(ctx, l.st, l.x, l.y, k, l.col, l.col2, now, l.seed, true);
    },
    front(ctx, l, k, now) {
      if (!B()) return;
      B().appear(ctx, l.st, l.x, l.y, k, l.col, l.col2, now, l.seed, false);
      if (B().accent) B().accent(ctx, l.acc, l.x, l.y, k, l.col, l.col2, now, l.seed);
    }
  };

  const ANIMS = {};
  /** Registra la animación propia de un legendario (ver arriba). */
  function add(dex, def) { ANIMS[dex] = def; }
  /** La animación de un legendario: la propia (con lo que le falte de la genérica) o la genérica. */
  function def(dex) { return ANIMS[dex] ? Object.assign({}, GENERIC, ANIMS[dex], { own: true }) : Object.assign({}, GENERIC, { own: false }); }

  // ================= animaciones propias =================

  /* ---------- Mewtwo (150): una esfera psíquica se forma, se rompe y él baja flotando ---------- */
  add(150, {
    title: 'Mente sin cadenas', dur: 2.2, short: 0.9, cue: 0.74,
    sprite(l, k) {
      const d = cl((k - 0.8) / 0.2);
      return { a: cl((k - 0.42) / 0.18), rise: 0, lift: 30 * (1 - ease(d)), flash: k < 0.74 };
    },
    back(ctx, l, k, now) {
      // Círculo de runas en el suelo que gira.
      const a = cl(k / 0.15) * (1 - cl((k - 0.9) / 0.1)), r = 40 + 14 * ease(cl(k / 0.45));
      if (a <= 0) return;
      glow(ctx, l.x, l.y, r * 1.5, r * 0.62, '#9a5cff', 0.55 * a);
      ctx.save();
      ctx.globalAlpha = 0.75 * a; ctx.strokeStyle = '#d9b8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(l.x, l.y, r, r * 0.42, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.45 * a;
      ctx.beginPath(); ctx.ellipse(l.x, l.y, r * 0.64, r * 0.27, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#f2e4ff'; ctx.globalAlpha = 0.9 * a;
      for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + now * 1.3; ctx.fillRect(Math.round(l.x + Math.cos(an) * r * 0.82) - 2, Math.round(l.y + Math.sin(an) * r * 0.35) - 2, 4, 4); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      const cy = l.y - 44;
      ctx.save();
      // 1) Seis luces que giran hacia dentro.
      if (k < 0.5) {
        const p = cl(k / 0.5);
        for (let i = 0; i < 6; i++) {
          const an = i / 6 * TAU + p * 5, d = 120 * (1 - ease(p)) + 6, x = l.x + Math.cos(an) * d, y = cy + Math.sin(an) * d * 0.6;
          glow(ctx, x, y, 14, 14, '#c890ff', 0.9);
          ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
        }
      }
      // 2) La esfera crece (oscura, con borde de luz) y se agrieta.
      const s = cl((k - 0.3) / 0.44), R = 8 + 34 * ease(s);
      if (s > 0 && k < 0.74) {
        glow(ctx, l.x, cy, R * 1.9, R * 1.9, '#9a5cff', 0.8);
        ctx.globalAlpha = 0.78; ctx.fillStyle = '#26103f'; ctx.beginPath(); ctx.arc(l.x, cy, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.95; ctx.strokeStyle = '#e6d0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(l.x, cy, R, 0, TAU); ctx.stroke();
        if (s > 0.6) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = (s - 0.6) / 0.4;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) { const an = H(l.seed, i, 7) * TAU; jag(ctx, l.x, cy, l.x + Math.cos(an) * R, cy + Math.sin(an) * R, 3, 4, l.seed + i); }
          ctx.stroke();
        }
      }
      // 3) Se rompe: esquirlas hacia fuera.
      const b = cl((k - 0.74) / 0.26);
      if (b > 0 && b < 1) {
        for (let i = 0; i < 16; i++) {
          const an = H(l.seed, i, 11) * TAU, d = 30 + b * (90 + H(l.seed, i, 12) * 80), sz = 3 + (i % 3) * 2;
          ctx.globalAlpha = 1 - b; ctx.fillStyle = i % 2 ? '#d9b8ff' : '#8a4cff';
          ctx.fillRect(Math.round(l.x + Math.cos(an) * d - sz / 2), Math.round(cy + Math.sin(an) * d * 0.7 - sz / 2), sz, sz);
        }
      }
      // 4) Ya fuera: aura que parpadea a su alrededor.
      if (k > 0.78) glow(ctx, l.x, l.y - 40, 46, 62, '#b07cff', 0.35 * (0.7 + 0.3 * Math.sin(now * 9)));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.ring(l.x, l.y - 40, 10, 150, '#c890ff', 0.55, 5);
      G.FX.burst(l.x, l.y - 44, '#e6d0ff', 22, 220);
      shake(l, 0.6);
    }
  });

  /* ---------- Groudon (383): la tierra se agrieta, sube la lava, columnas de fuego y sale de ella ---------- */
  add(383, {
    title: 'Señor de la tierra ardiente', dur: 2.4, short: 1.0, cue: 0.84,
    sprite(l, k) { return { a: k > 0.5 ? 1 : 0, rise: 1 - ease(cl((k - 0.5) / 0.32)), lift: 0, flash: k > 0.82 && k < 0.9 }; },
    tick(l, k, dt) {
      if (k > 0.04 && k < 0.84 && Math.random() < dt * 5) shake(l, 0.1);
      if (G.FX && k > 0.25 && k < 1 && Math.random() < dt * 26) {
        const an = Math.random() * TAU, d = Math.random() * 60;
        G.FX.px(l.x + Math.cos(an) * d, l.y + Math.sin(an) * d * 0.4, Math.random() < 0.5 ? '#ffb03a' : '#ff5a10', { vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 60, life: 0.6, drag: 0.6 });
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // Grietas que se abren desde el centro, con luz de lava.
      const g = ease(cl(k / 0.4)), cool = cl((k - 0.9) / 0.1);
      ctx.lineCap = 'round';
      for (const [w, c, a] of [[5, '#ff5a10', 0.85], [2, '#ffe08a', 1]]) {
        ctx.lineWidth = w; ctx.strokeStyle = c; ctx.globalAlpha = a * (1 - cool * 0.7);
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const an = H(l.seed, i, 3) * TAU, L = (70 + H(l.seed, i, 4) * 50) * g; jag(ctx, l.x, l.y, l.x + Math.cos(an) * L, l.y + Math.sin(an) * L * 0.5, 5, 6, l.seed + i * 3); }
        ctx.stroke();
      }
      // El charco de lava crece y, al final, se enfría.
      const p = ease(cl((k - 0.28) / 0.3)), rx = 76 * p, ry = 30 * p;
      if (p > 0) {
        glow(ctx, l.x, l.y, rx * 1.8, ry * 2.2, '#ff6a1f', 0.8 * (1 - cool * 0.6));
        ctx.globalAlpha = 0.95; ctx.fillStyle = cool > 0 ? '#7a2208' : '#ff5a10';
        ctx.beginPath(); ctx.ellipse(l.x, l.y, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9 * (1 - cool); ctx.fillStyle = '#ffc24a';
        ctx.beginPath(); ctx.ellipse(l.x, l.y + 2, rx * 0.62, ry * 0.55, 0, 0, TAU); ctx.fill();
        // Burbujas.
        ctx.fillStyle = '#fff0a8';
        for (let i = 0; i < 6; i++) {
          const ph = (now * 1.6 + H(l.seed, i, 9)) % 1, an = H(l.seed, i, 8) * TAU;
          ctx.globalAlpha = (1 - ph) * (1 - cool);
          ctx.beginPath(); ctx.arc(l.x + Math.cos(an) * rx * 0.55, l.y + Math.sin(an) * ry * 0.5, 2 + ph * 3, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      // Tres columnas de fuego alrededor, una tras otra.
      for (let i = 0; i < 3; i++) {
        const t0 = 0.36 + i * 0.1, e = cl((k - t0) / 0.18) * (1 - cl((k - t0 - 0.3) / 0.15));
        if (e <= 0) continue;
        const an = (i / 3) * TAU + 0.6, x = l.x + Math.cos(an) * 86, y = l.y + Math.sin(an) * 34, hgt = 120 * e;
        glow(ctx, x, y - hgt / 2, 16 + 10 * e, hgt / 2 + 10, '#ff7a1a', 0.9 * e);
        glow(ctx, x, y - hgt / 2, 7, hgt / 2, '#fff0a8', 0.8 * e);
      }
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#ffb03a', 30, 260);
      G.FX.ring(l.x, l.y, 10, 160, '#ff6a1f', 0.6, 6);
      shake(l, 1.1);
    }
  });

  /* ---------- Rayquaza (384): baja del cielo en espiral con su estela verde y aterriza con una ráfaga de viento ---------- */
  const rayPath = k => { const e = cl((k - 0.2) / 0.56); return { e, lift: (1 - ease(e)) * 380, ox: Math.cos(e * TAU * 2) * 110 * (1 - e) }; };
  add(384, {
    title: 'Guardián del cielo', dur: 2.4, short: 1.0, cue: 0.76,
    sprite(l, k) { const p = rayPath(k); return { a: k > 0.2 ? 1 : 0, rise: 0, lift: p.lift, ox: p.ox, flash: k > 0.74 && k < 0.82 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Su sombra crece en el suelo mientras baja.
      const p = rayPath(k);
      if (k > 0.2) { ctx.globalAlpha = 0.35 * p.e; ctx.fillStyle = '#0b1a12'; ctx.beginPath(); ctx.ellipse(l.x + p.ox * 0.3, l.y, 20 + 40 * p.e, 8 + 12 * p.e, 0, 0, TAU); ctx.fill(); }
      // Anillos de viento al aterrizar.
      const w = cl((k - 0.76) / 0.24);
      if (w > 0 && w < 1) {
        ctx.lineWidth = 3; ctx.strokeStyle = '#b8ffd6';
        for (let i = 0; i < 3; i++) { const q = cl(w - i * 0.15); if (q <= 0) continue; ctx.globalAlpha = (1 - q) * 0.8; ctx.beginPath(); ctx.ellipse(l.x, l.y, 30 + 150 * q, 12 + 56 * q, 0, 0, TAU); ctx.stroke(); }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Nubes oscuras arriba, con relámpagos verdes, antes de que baje.
      const c = cl(k / 0.15) * (1 - cl((k - 0.45) / 0.2));
      if (c > 0) {
        const cy = l.y - 380;
        ctx.globalAlpha = 0.7 * c; ctx.fillStyle = '#1d2a33';
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(l.x + (i - 2) * 44, cy + (i % 2) * 10, 52, 22, 0, 0, TAU); ctx.fill(); }
        if (Math.sin(now * 23 + l.seed) > 0.85) glow(ctx, l.x + Math.sin(now * 7) * 60, cy, 90, 40, '#7dffb0', 0.8 * c);
      }
      // Su estela: una cinta verde con anillas amarillas que sigue su camino.
      if (k > 0.2) {
        for (let j = 24; j >= 1; j--) {
          const kk = k - j * 0.012;
          if (kk < 0.2) continue;
          const p = rayPath(kk);
          if (p.e >= 1) continue;
          const f = 1 - j / 24;
          ctx.globalAlpha = 0.85 * f; ctx.fillStyle = j % 4 === 0 ? '#ffd84a' : '#2fbf6a';
          ctx.beginPath(); ctx.arc(l.x + p.ox, l.y - p.lift - 26, 4 + 7 * f, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.8) glow(ctx, l.x, l.y - 40, 54, 70, '#7dffb0', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 10, '#b8ffd6', 26, 280);
      G.FX.ring(l.x, l.y, 12, 170, '#7dffb0', 0.55, 5);
      shake(l, 0.9);
    }
  });

  // ================= tanda 1 (25-11-2026): primera y segunda generación =================

  /** Su sombra en el suelo mientras baja del cielo (e: 0 arriba .. 1 en el suelo). */
  function dropShadow(ctx, l, e, ox, a) {
    if (e <= 0) return;
    ctx.globalAlpha = (a || 0.35) * e; ctx.fillStyle = '#0b0f1a';
    ctx.beginPath(); ctx.ellipse(l.x + (ox || 0), l.y, 16 + 34 * e, 6 + 10 * e, 0, 0, TAU); ctx.fill();
  }
  /** Copo/estrella de 4 puntas con rectángulos (barato). */
  function star4(ctx, x, y, s) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillRect(x - s, y, s * 2 + 1, 1); ctx.fillRect(x, y - s, 1, s * 2 + 1);
  }

  /* ---------- Articuno (144): ventisca que gira, el suelo se hiela y baja planeando; brotan cristales de hielo ---------- */
  const artPath = k => { const e = cl((k - 0.3) / 0.48); return { e, lift: (1 - ease(e)) * 300, ox: -170 * (1 - ease(e)) }; };
  add(144, {
    title: 'Ave de la ventisca', dur: 2.2, short: 0.9, cue: 0.78,
    sprite(l, k) { const p = artPath(k); return { a: k > 0.3 ? 1 : 0, rise: 0, lift: p.lift, ox: p.ox, flash: k > 0.76 && k < 0.84 }; },
    tick(l, k, dt) {
      if (G.FX && k < 0.85 && Math.random() < dt * 30) {
        const an = Math.random() * TAU, d = 60 + Math.random() * 120;
        G.FX.px(l.x + Math.cos(an) * d, l.y - 20 + Math.sin(an) * d * 0.5, Math.random() < 0.6 ? '#ffffff' : '#bfe9ff',
          { vx: -Math.sin(an) * 90, vy: Math.cos(an) * 40, life: 0.7, drag: 0.8 });
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // El suelo se hiela desde el centro: placa pálida con borde y vetas.
      const f = ease(cl((k - 0.1) / 0.5)), rx = 84 * f, ry = 34 * f;
      if (f > 0) {
        glow(ctx, l.x, l.y, rx * 1.5, ry * 1.8, '#9ad8ff', 0.45 * f);
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#d8f2ff'; ctx.beginPath(); ctx.ellipse(l.x, l.y, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(l.x, l.y, rx, ry, 0, 0, TAU);
        for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + H(l.seed, i, 2) * 0.4; jag(ctx, l.x, l.y, l.x + Math.cos(an) * rx * 0.9, l.y + Math.sin(an) * ry * 0.9, 3, 3, l.seed + i); }
        ctx.stroke();
      }
      const p = artPath(k);
      if (k > 0.3) dropShadow(ctx, l, p.e, p.ox * 0.4);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Ventisca: copos que giran en remolino alrededor del sitio y se cierran hacia él.
      const w = cl(k / 0.15) * (1 - cl((k - 0.8) / 0.2));
      if (w > 0) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 28; i++) {
          const an = H(l.seed, i, 21) * TAU + now * (1.6 + H(l.seed, i, 22)), d = (50 + H(l.seed, i, 23) * 140) * (1 - 0.5 * ease(cl(k / 0.78)));
          ctx.globalAlpha = w * (0.5 + 0.5 * H(l.seed, i, 24));
          star4(ctx, l.x + Math.cos(an) * d, l.y - 30 + Math.sin(an) * d * 0.45 - H(l.seed, i, 25) * 60, i % 3 ? 1 : 2);
        }
      }
      // Al llegar, brotan cristales de hielo a su alrededor y se deshacen.
      const c = cl((k - 0.78) / 0.12) * (1 - cl((k - 0.9) / 0.1));
      if (c > 0) {
        for (let i = 0; i < 7; i++) {
          const an = i / 7 * TAU + 0.3, x = l.x + Math.cos(an) * 70, y = l.y + Math.sin(an) * 28, h = (22 + H(l.seed, i, 26) * 26) * c, wd = 6;
          ctx.globalAlpha = 0.9 * c; ctx.fillStyle = '#bfe9ff';
          ctx.beginPath(); ctx.moveTo(x - wd, y); ctx.lineTo(x, y - h); ctx.lineTo(x + wd, y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - 1), Math.round(y - h * 0.8), 2, Math.round(h * 0.6));
        }
      }
      if (k > 0.8) glow(ctx, l.x, l.y - 40, 50, 64, '#bfe9ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.ring(l.x, l.y, 10, 150, '#bfe9ff', 0.55, 5);
      G.FX.burst(l.x, l.y - 30, '#ffffff', 24, 220);
      shake(l, 0.6);
    }
  });

  /* ---------- Zapdos (145): nube de tormenta encima, tres rayos de aviso y un rayo enorme del que sale él ---------- */
  const ZAP = [0.18, 0.34, 0.5];
  add(145, {
    title: 'Señor del trueno', dur: 2.2, short: 0.9, cue: 0.72,
    sprite(l, k) { return { a: k > 0.72 ? 1 : 0, rise: 0, lift: 0, flash: k > 0.72 && k < 0.84 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.74 && Math.random() < dt * 20) {
        const an = Math.random() * TAU;
        G.FX.px(l.x + Math.cos(an) * 30, l.y - 30 + Math.sin(an) * 30, '#fff27a', { vx: Math.cos(an) * 120, vy: Math.sin(an) * 120, life: 0.25 });
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // Marcas quemadas donde caen los rayos de aviso.
      for (let i = 0; i < 3; i++) {
        const t = cl((k - ZAP[i]) / 0.06);
        if (t <= 0) continue;
        const an = H(l.seed, i, 31) * TAU, x = l.x + Math.cos(an) * (70 + 40 * H(l.seed, i, 32)), y = l.y + Math.sin(an) * 36;
        ctx.globalAlpha = 0.45 * (1 - cl((k - 0.9) / 0.1)); ctx.fillStyle = '#1b1a14';
        ctx.beginPath(); ctx.ellipse(x, y, 16, 6, 0, 0, TAU); ctx.fill();
      }
      // El suelo se carga: anillo amarillo que crece hasta el rayo grande.
      const ch = cl((k - 0.45) / 0.27);
      if (ch > 0 && k < 0.76) {
        glow(ctx, l.x, l.y, 30 + 60 * ch, 12 + 22 * ch, '#ffe23a', 0.6 * ch);
        ctx.globalAlpha = 0.8 * ch; ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(l.x, l.y, 20 + 50 * ch * (0.85 + 0.15 * Math.sin(now * 30)), 8 + 18 * ch, 0, 0, TAU); ctx.stroke();
      }
      if (k >= 0.72) { ctx.globalAlpha = 0.5 * (1 - cl((k - 0.9) / 0.1)); ctx.fillStyle = '#1b1a14'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 40, 14, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const cy = l.y - 200, cloud = cl(k / 0.12) * (1 - cl((k - 0.8) / 0.2));
      // Nube de tormenta.
      if (cloud > 0) {
        ctx.globalAlpha = 0.75 * cloud; ctx.fillStyle = '#2a2a33';
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(l.x + (i - 2.5) * 38, cy + (i % 2) * 12, 46, 20, 0, 0, TAU); ctx.fill(); }
        glow(ctx, l.x, cy, 140, 40, '#ffe23a', 0.15 * cloud * (0.6 + 0.4 * Math.sin(now * 11)));
      }
      // Rayos: tres de aviso y el grande.
      const bolt = (x1, y1, t, seed, wide) => {
        glow(ctx, (l.x + x1) / 2, (cy + y1) / 2, wide ? 40 : 18, (y1 - cy) / 2 + 10, '#ffe23a', (wide ? 0.9 : 0.6) * t);
        ctx.lineCap = 'round';
        for (const [lw, c] of [[wide ? 7 : 4, '#ffe23a'], [wide ? 3 : 1.5, '#ffffff']]) {
          ctx.globalAlpha = t; ctx.strokeStyle = c; ctx.lineWidth = lw;
          ctx.beginPath(); jag(ctx, l.x + (H(seed, 1, 33) - 0.5) * 40, cy + 10, x1, y1, 7, wide ? 16 : 10, seed); ctx.stroke();
        }
      };
      for (let i = 0; i < 3; i++) {
        const t = 1 - cl((k - ZAP[i]) / 0.06);
        if (k < ZAP[i] || t <= 0) continue;
        const an = H(l.seed, i, 31) * TAU;
        bolt(l.x + Math.cos(an) * (70 + 40 * H(l.seed, i, 32)), l.y + Math.sin(an) * 36, t, l.seed + i * 5, false);
      }
      if (k >= 0.7 && k < 0.82) bolt(l.x, l.y - 10, 1 - cl((k - 0.74) / 0.08), l.seed + 99, true);
      // Ya fuera: chispas que saltan a su alrededor.
      if (k > 0.74) {
        ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85 * (1 - cl((k - 0.9) / 0.1));
        ctx.beginPath();
        const f = Math.floor(now * 14);
        for (let i = 0; i < 3; i++) { const an = H(l.seed + f, i, 34) * TAU, r0 = 26, r1 = 50; jag(ctx, l.x + Math.cos(an) * r0, l.y - 34 + Math.sin(an) * r0, l.x + Math.cos(an) * r1, l.y - 34 + Math.sin(an) * r1, 3, 5, l.seed + f + i); }
        ctx.stroke();
        glow(ctx, l.x, l.y - 40, 50, 64, '#ffe23a', 0.3);
      }
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#fff27a', 28, 280);
      G.FX.ring(l.x, l.y, 10, 160, '#ffe23a', 0.5, 5);
      shake(l, 0.9);
    }
  });

  /* ---------- Moltres (146): bola de fuego que cae del cielo, se para, crece y se abre en alas de llama ---------- */
  const molY = k => { const e = cl((k - 0.12) / 0.5); return 440 * (1 - e * e) + 40; };
  add(146, {
    title: 'Ave de la llama eterna', dur: 2.3, short: 0.9, cue: 0.76,
    sprite(l, k) { return { a: k > 0.76 ? 1 : 0, rise: 0, lift: 14 * (1 - ease(cl((k - 0.76) / 0.24))), flash: k > 0.76 && k < 0.86 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.4 && Math.random() < dt * 22) {
        const an = Math.random() * TAU;
        G.FX.px(l.x + Math.cos(an) * 64, l.y + Math.sin(an) * 26, Math.random() < 0.5 ? '#ffb03a' : '#ff5a10', { vx: 0, vy: -50 - Math.random() * 50, life: 0.7, drag: 0.7 });
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // Corro de llamas en el suelo.
      const r = cl((k - 0.35) / 0.2) * (1 - cl((k - 0.9) / 0.1));
      if (r > 0) {
        glow(ctx, l.x, l.y, 100, 40, '#ff6a1f', 0.45 * r);
        for (let i = 0; i < 12; i++) {
          const an = i / 12 * TAU, x = l.x + Math.cos(an) * 70, y = l.y + Math.sin(an) * 28, fl = 0.7 + 0.3 * Math.sin(now * 13 + i * 1.7);
          ctx.globalAlpha = 0.9 * r; ctx.fillStyle = '#ff7a1a';
          ctx.beginPath(); ctx.ellipse(x, y - 8 * fl * r, 5, 10 * fl * r, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(x, y - 5 * fl * r, 2.5, 5 * fl * r, 0, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.12 && k < 0.8) dropShadow(ctx, l, cl((k - 0.12) / 0.5), 0, 0.25);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // La bola de fuego cae con su cola y se queda flotando, creciendo.
      if (k > 0.12 && k < 0.78) {
        const y = l.y - molY(k), grow = cl((k - 0.62) / 0.14), R = 12 + 26 * ease(grow) + 2 * Math.sin(now * 20);
        for (let j = 8; j >= 1; j--) {
          const kk = k - j * 0.018; if (kk < 0.12) continue;
          ctx.globalAlpha = 0.7 * (1 - j / 9); ctx.fillStyle = j % 2 ? '#ff5a10' : '#ffb03a';
          ctx.beginPath(); ctx.arc(l.x, l.y - molY(kk), R * (1 - j / 12), 0, TAU); ctx.fill();
        }
        glow(ctx, l.x, y, R * 2.6, R * 2.6, '#ff6a1f', 0.9);
        ctx.globalAlpha = 1; ctx.fillStyle = '#ffb03a'; ctx.beginPath(); ctx.arc(l.x, y, R, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff0a8'; ctx.beginPath(); ctx.arc(l.x, y, R * 0.55, 0, TAU); ctx.fill();
      }
      // Se abre: dos alas de llama que se despliegan y se apagan.
      const wg = cl((k - 0.76) / 0.12) * (1 - cl((k - 0.88) / 0.12));
      if (wg > 0) {
        for (const s of [-1, 1]) {
          for (let i = 0; i < 6; i++) {
            const q = i / 5, x = l.x + s * (20 + 110 * q * wg), y = l.y - 50 - 40 * Math.sin(q * Math.PI * 0.9) * wg;
            glow(ctx, x, y, 22 - 8 * q, 30 - 10 * q, i % 2 ? '#ffb03a' : '#ff5a10', 0.9 * wg);
            ctx.globalAlpha = 0.85 * wg; ctx.fillStyle = i % 2 ? '#ffb03a' : '#ff5a10';
            ctx.beginPath(); ctx.ellipse(x, y, 11 - 5 * q, 16 - 6 * q, s * (0.4 + q), 0, TAU); ctx.fill();
          }
        }
      }
      if (k > 0.8) glow(ctx, l.x, l.y - 40, 50, 66, '#ff8a2a', 0.32);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 50, '#ffb03a', 30, 260);
      G.FX.ring(l.x, l.y - 30, 10, 150, '#ff6a1f', 0.5, 5);
      shake(l, 0.8);
    }
  });

  /* ---------- Mew (151): una burbuja rosa juguetona rebota por la arena, se para, estalla y sale él flotando ---------- */
  const mewB = k => { const e = cl(k / 0.68); return { x: Math.sin(e * TAU * 1.25) * 110 * (1 - e), y: 40 + Math.abs(Math.sin(e * Math.PI * 4)) * 56 * (1 - e) }; };
  add(151, {
    title: 'El origen de todo', dur: 2.0, short: 0.8, cue: 0.7,
    sprite(l, k) { const d = cl((k - 0.7) / 0.3); return { a: cl((k - 0.68) / 0.06), rise: 0, lift: 24 * (1 - ease(d)) + 4 * Math.sin(d * Math.PI * 3) * (1 - d), flash: k > 0.7 && k < 0.8 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const b = mewB(k);
      if (k < 0.72) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#3a1830'; ctx.beginPath(); ctx.ellipse(l.x + b.x, l.y, 14, 5, 0, 0, TAU); ctx.fill(); }
      const g = cl((k - 0.6) / 0.15) * (1 - cl((k - 0.9) / 0.1));
      if (g > 0) glow(ctx, l.x, l.y, 70, 28, '#ff9ad6', 0.5 * g);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Estela de chispitas detrás de la burbuja.
      ctx.fillStyle = '#ffd6f0';
      for (let j = 1; j <= 10; j++) {
        const kk = k - j * 0.025; if (kk < 0 || kk > 0.7) continue;
        const b = mewB(kk); ctx.globalAlpha = 0.8 * (1 - j / 11);
        star4(ctx, l.x + b.x + (H(l.seed, j, 41) - 0.5) * 10, l.y - b.y + (H(l.seed, j, 42) - 0.5) * 10, j % 3 ? 1 : 2);
      }
      // La burbuja: rosa clara, con brillo; crece un poco antes de estallar.
      if (k < 0.7) {
        const b = mewB(k), R = 14 + 12 * ease(cl((k - 0.5) / 0.2)), x = l.x + b.x, y = l.y - b.y;
        glow(ctx, x, y, R * 2, R * 2, '#ff9ad6', 0.6);
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#ffb8e4'; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - R * 0.35, y - R * 0.35, R * 0.2, 0, TAU); ctx.fill();
      }
      // Estalla en gotitas rosas.
      const p = cl((k - 0.7) / 0.22);
      if (p > 0 && p < 1) {
        for (let i = 0; i < 12; i++) {
          const an = i / 12 * TAU + H(l.seed, i, 43), d = 18 + 70 * ease(p);
          ctx.globalAlpha = 1 - p; ctx.fillStyle = i % 2 ? '#ffb8e4' : '#ffffff';
          ctx.beginPath(); ctx.arc(l.x + Math.cos(an) * d, l.y - 40 + Math.sin(an) * d * 0.8, 3 - 2 * p, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 44, 42, 52, '#ffb8e4', 0.3 * (0.75 + 0.25 * Math.sin(now * 6)));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#ffb8e4', 18, 170);
      G.FX.ring(l.x, l.y - 30, 8, 110, '#ff9ad6', 0.45, 4);
      shake(l, 0.3);
    }
  });

  /* ---------- Raikou (243): un rayo cae lejos y él cruza la arena corriendo como una centella, frena y ruge ---------- */
  const RAI = 300;
  const raiX = k => -RAI * (1 - (1 - Math.pow(1 - cl((k - 0.3) / 0.32), 3)));
  add(243, {
    title: 'El trueno que corre', dur: 2.0, short: 0.8, cue: 0.66,
    sprite(l, k) { return { a: k > 0.3 ? 1 : 0, rise: 0, lift: 0, ox: raiX(k), flash: (k > 0.3 && k < 0.36) || (k > 0.66 && k < 0.74) }; },
    tick(l, k, dt) {
      if (!G.FX) return;
      // Polvo al frenar.
      if (k > 0.52 && k < 0.68 && Math.random() < dt * 40) G.FX.px(l.x + raiX(k) - 10, l.y - 2, '#c8b890', { vx: -40 - Math.random() * 80, vy: -20 - Math.random() * 30, life: 0.45, drag: 0.85 });
      if (k > 0.3 && k < 0.62 && Math.random() < dt * 30) G.FX.px(l.x + raiX(k), l.y - 20 - Math.random() * 30, '#fff27a', { vx: -60, vy: (Math.random() - 0.5) * 60, life: 0.3 });
    },
    back(ctx, l, k, now) {
      ctx.save();
      // Rastro eléctrico en el suelo por donde ha corrido.
      if (k > 0.3) {
        const x0 = l.x - RAI, x1 = l.x + raiX(k), a = 1 - cl((k - 0.8) / 0.2);
        if (x1 > x0 + 4) {
          glow(ctx, (x0 + x1) / 2, l.y - 4, (x1 - x0) / 2 + 10, 10, '#ffe23a', 0.55 * a);
          ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 2; ctx.globalAlpha = 0.9 * a;
          ctx.beginPath(); jag(ctx, x0, l.y - 4, x1, l.y - 4, Math.max(2, Math.round((x1 - x0) / 30)), 6, l.seed + Math.floor(now * 12)); ctx.stroke();
        }
      }
      // Marca del rayo donde empieza.
      const s = cl((k - 0.18) / 0.06) * (1 - cl((k - 0.85) / 0.15));
      if (s > 0) { ctx.globalAlpha = 0.45 * s; ctx.fillStyle = '#1b1a14'; ctx.beginPath(); ctx.ellipse(l.x - RAI, l.y, 22, 8, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El rayo que cae lejos, donde sale corriendo.
      const b = cl((k - 0.18) / 0.04) * (1 - cl((k - 0.3) / 0.06));
      if (b > 0) {
        const x = l.x - RAI;
        glow(ctx, x, l.y - 160, 30, 170, '#ffe23a', 0.9 * b);
        ctx.lineCap = 'round';
        for (const [lw, c] of [[6, '#ffe23a'], [2.5, '#ffffff']]) { ctx.globalAlpha = b; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); jag(ctx, x + 10, l.y - 340, x, l.y - 6, 7, 14, l.seed + 7); ctx.stroke(); }
      }
      // Estela de imágenes suyas mientras corre.
      if (l.an && k > 0.3 && k < 0.66) {
        for (let j = 3; j >= 1; j--) {
          const kk = k - j * 0.035; if (kk < 0.3) continue;
          l.an.draw(ctx, l.x + raiX(kk), l.y, { alpha: 0.35 * (1 - j / 4), flash: true });
        }
      }
      // Ruge: un rayo corto sobre él y luz.
      const r = cl((k - 0.66) / 0.04) * (1 - cl((k - 0.74) / 0.08));
      if (r > 0) glow(ctx, l.x, l.y - 120, 26, 110, '#ffe23a', 0.8 * r);
      if (k > 0.68) glow(ctx, l.x, l.y - 34, 52, 50, '#ffe23a', 0.3);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.ring(l.x, l.y, 10, 170, '#ffe23a', 0.5, 6);
      G.FX.burst(l.x, l.y - 30, '#fff27a', 26, 260);
      shake(l, 0.8);
    }
  });

  /* ---------- Entei (244): humo de las grietas, un géiser de fuego sube del suelo, él se ve dentro y lo rompe con un rugido ---------- */
  add(244, {
    title: 'Llama de los volcanes', dur: 2.3, short: 0.9, cue: 0.74,
    sprite(l, k) { return { a: cl((k - 0.52) / 0.22), rise: 0, lift: 0, flash: k > 0.52 && k < 0.84, dark: k < 0.74 ? 1 : 0 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.35 && Math.random() < dt * 36) {
        const x = l.x + (Math.random() - 0.5) * 50;
        G.FX.px(x, l.y - Math.random() * 20, Math.random() < 0.5 ? '#ffb03a' : '#ff5a10', { vx: (Math.random() - 0.5) * 40, vy: -120 - Math.random() * 100, life: 0.7, drag: 0.7 });
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // Humo que sale de cuatro grietas.
      const sm = cl(k / 0.1) * (1 - cl((k - 0.75) / 0.25));
      for (let i = 0; i < 4 && sm > 0; i++) {
        const an = i / 4 * TAU + 0.8, x = l.x + Math.cos(an) * 56, y = l.y + Math.sin(an) * 22;
        ctx.globalAlpha = 0.9 * sm; ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = 3;
        ctx.beginPath(); jag(ctx, x - 10, y, x + 10, y + 2, 3, 3, l.seed + i); ctx.stroke();
        for (let j = 0; j < 3; j++) {
          const ph = (now * 0.8 + j / 3 + H(l.seed, i, 51)) % 1;
          ctx.globalAlpha = 0.45 * sm * (1 - ph); ctx.fillStyle = '#4a4040';
          ctx.beginPath(); ctx.arc(x + Math.sin(ph * 5 + i) * 8, y - ph * 90, 8 + ph * 14, 0, TAU); ctx.fill();
        }
      }
      // Al romperlo: anillo de fuego que corre por el suelo.
      const rg = cl((k - 0.74) / 0.24);
      if (rg > 0 && rg < 1) {
        ctx.globalAlpha = 0.9 * (1 - rg); ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 6 * (1 - rg) + 2;
        ctx.beginPath(); ctx.ellipse(l.x, l.y, 30 + 140 * rg, 12 + 52 * rg, 0, 0, TAU); ctx.stroke();
      }
      const base = cl((k - 0.3) / 0.1) * (1 - cl((k - 0.85) / 0.15));
      if (base > 0) glow(ctx, l.x, l.y, 80, 30, '#ff6a1f', 0.7 * base);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El géiser: columna de fuego alta con centro blanco y lenguas a los lados.
      const up = ease(cl((k - 0.32) / 0.16)), out = cl((k - 0.74) / 0.1), e = up * (1 - out);
      if (e > 0) {
        const hgt = 260 * up, wob = Math.sin(now * 17) * 3;
        glow(ctx, l.x, l.y - hgt / 2, 34 + 12 * e + wob, hgt / 2 + 14, '#ff6a1f', 0.95 * e);
        glow(ctx, l.x, l.y - hgt / 2, 16 + wob, hgt / 2, '#ffd25e', 0.9 * e);
        glow(ctx, l.x, l.y - hgt / 2, 6, hgt / 2 - 10, '#fff6d0', 0.8 * e);
        // (También en calidad baja, sin luces: la columna con formas.)
        ctx.globalAlpha = 0.75 * e; ctx.fillStyle = '#ff6a1f'; ctx.beginPath(); ctx.ellipse(l.x, l.y - hgt / 2, 22 + wob, hgt / 2, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.85 * e; ctx.fillStyle = '#ffc24a'; ctx.beginPath(); ctx.ellipse(l.x, l.y - hgt / 2, 11 + wob * 0.5, Math.max(0, hgt / 2 - 8), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff6d0'; ctx.fillRect(Math.round(l.x - 2), Math.round(l.y - hgt + 14), 4, Math.round(Math.max(0, hgt - 28)));
        for (let i = 0; i < 6; i++) {
          const y = l.y - (i + 0.5) / 6 * hgt, s = i % 2 ? 1 : -1, fl = 0.6 + 0.4 * Math.sin(now * 15 + i * 2.1);
          ctx.globalAlpha = 0.85 * e; ctx.fillStyle = '#ff9a2a';
          ctx.beginPath(); ctx.ellipse(l.x + s * (22 + 6 * fl), y, 8 * fl, 14 * fl, s * 0.5, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 36, 54, 54, '#ff8a2a', 0.32);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#ffb03a', 32, 280);
      G.FX.burst(l.x, l.y - 20, '#5a4a4a', 14, 140);
      shake(l, 1);
    }
  });

  /* ---------- Suicune (245): aurora en el cielo, el suelo se vuelve agua clara y él llega deslizándose por encima ---------- */
  const suiX = k => 280 * (1 - ease(cl((k - 0.34) / 0.44)));
  const AURORA = ['#7dffd8', '#8ab8ff', '#c890ff'];
  add(245, {
    title: 'Viento del norte', dur: 2.4, short: 1.0, cue: 0.78,
    sprite(l, k) { return { a: cl((k - 0.34) / 0.1), rise: 0, lift: 2, ox: suiX(k), flash: k > 0.78 && k < 0.86 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // El agua clara se extiende (también por donde llega) y hace ondas.
      const w = ease(cl(k / 0.35)) * (1 - cl((k - 0.92) / 0.08) * 0.6);
      if (w > 0) {
        const rx = 150 * w, ry = 46 * w;
        glow(ctx, l.x + 60, l.y, rx * 1.6, ry * 1.8, '#5ac8ff', 0.35 * w);
        ctx.globalAlpha = 0.5 * w; ctx.fillStyle = '#3a9ad9'; ctx.beginPath(); ctx.ellipse(l.x + 60, l.y, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.35 * w; ctx.fillStyle = '#9ae8ff'; ctx.beginPath(); ctx.ellipse(l.x + 60, l.y - 3, rx * 0.7, ry * 0.5, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#d8f6ff'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const ph = (now * 0.6 + i / 3) % 1, x = l.x + suiX(k);
          ctx.globalAlpha = 0.6 * w * (1 - ph);
          ctx.beginPath(); ctx.ellipse(x, l.y, 14 + 70 * ph, 5 + 24 * ph, 0, 0, TAU); ctx.stroke();
        }
      }
      // Estela en el agua detrás de él mientras se desliza.
      if (k > 0.34 && k < 0.85) {
        ctx.fillStyle = '#ffffff';
        for (let j = 1; j <= 6; j++) { const kk = k - j * 0.03; if (kk < 0.34) continue; ctx.globalAlpha = 0.5 * (1 - j / 7); ctx.beginPath(); ctx.ellipse(l.x + suiX(kk), l.y + 1, 12 + j * 2, 3, 0, 0, TAU); ctx.fill(); }
      }
      // Al llegar: el agua se purifica, un anillo de luz con chispas.
      const pu = cl((k - 0.78) / 0.22);
      if (pu > 0 && pu < 1) {
        ctx.globalAlpha = 0.8 * (1 - pu); ctx.strokeStyle = '#e6fbff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(l.x, l.y, 20 + 140 * pu, 8 + 46 * pu, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 10; i++) { const an = H(l.seed, i, 61) * TAU, d = 20 + 140 * pu * H(l.seed, i, 62); star4(ctx, l.x + Math.cos(an) * d, l.y + Math.sin(an) * d * 0.33 - 6, 2); }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      // Aurora: tres cintas de luz que ondulan en el cielo.
      const a = cl(k / 0.2) * (1 - cl((k - 0.82) / 0.18));
      if (a <= 0) return;
      for (let b = 0; b < 3; b++) {
        for (let i = 0; i < 7; i++) {
          const x = l.x + (i - 3) * 46, y = l.y - 195 + b * 20 + Math.sin(now * 1.4 + i * 0.9 + b * 1.3) * 14;
          glow(ctx, x, y, 34, 16 + 6 * Math.sin(now * 2 + i + b), AURORA[b], 0.42 * a);
          ctx.globalAlpha = 0.22 * a; ctx.fillStyle = AURORA[b]; ctx.beginPath(); ctx.ellipse(x, y, 26, 5 + 2 * Math.sin(now * 2 + i + b), 0, 0, TAU); ctx.fill();
        }
      }
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.ring(l.x, l.y, 10, 140, '#9ae8ff', 0.6, 4);
      G.FX.burst(l.x, l.y - 30, '#e6fbff', 20, 200);
      shake(l, 0.4);
    }
  });

  /* ---------- Lugia (249): tormenta con lluvia, un remolino en el suelo, baja batiendo las alas y levanta una tromba de agua ---------- */
  const lugE = k => cl((k - 0.25) / 0.55);
  add(249, {
    title: 'Guardián de los mares', dur: 2.6, short: 1.0, cue: 0.8,
    sprite(l, k) { const e = lugE(k); return { a: cl((k - 0.25) / 0.12), rise: 0, lift: (1 - ease(e)) * 260 + Math.sin(k * 34) * 8 * (1 - e), flash: k > 0.8 && k < 0.88 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.8 && k < 0.95 && Math.random() < dt * 70) {
        const an = Math.random() * TAU, d = 40 + Math.random() * 40;
        G.FX.px(l.x + Math.cos(an) * d, l.y + Math.sin(an) * d * 0.4, Math.random() < 0.5 ? '#9ad8ff' : '#ffffff', { vx: Math.cos(an) * 40, vy: -160 - Math.random() * 120, life: 0.7, grav: 380, drag: 1 });
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // Remolino en el suelo: agua oscura, tres anillos y espuma que gira.
      const w = ease(cl((k - 0.05) / 0.3)) * (1 - cl((k - 0.82) / 0.18));
      if (w > 0) {
        glow(ctx, l.x, l.y, 130 * w, 50 * w, '#3a6aff', 0.4 * w);
        ctx.globalAlpha = 0.55 * w; ctx.fillStyle = '#16305a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 100 * w, 38 * w, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#7ab8ff'; ctx.lineWidth = 2;
        for (let i = 1; i <= 3; i++) { ctx.globalAlpha = 0.55 * w; ctx.beginPath(); ctx.ellipse(l.x, l.y, 100 * w * i / 3.4, 38 * w * i / 3.4, 0, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = '#e6f4ff';
        for (let i = 0; i < 14; i++) {
          const an = i / 14 * TAU + now * (2.6 - (i % 3) * 0.5), r = (0.35 + (i % 3) * 0.25) * w;
          ctx.globalAlpha = 0.85 * w; ctx.fillRect(Math.round(l.x + Math.cos(an) * 100 * r) - 2, Math.round(l.y + Math.sin(an) * 38 * r) - 1, 4, 2);
        }
      }
      if (k > 0.25) dropShadow(ctx, l, lugE(k), 0, 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Lluvia en diagonal.
      const r = cl(k / 0.12) * (1 - cl((k - 0.85) / 0.15));
      if (r > 0) {
        ctx.fillStyle = '#b8d8ff';
        for (let i = 0; i < 40; i++) {
          const ph = (now * (1.6 + H(l.seed, i, 71) * 0.6) + H(l.seed, i, 72)) % 1;
          const x = l.x - 240 + H(l.seed, i, 73) * 480 - ph * 60, y = l.y - 340 + ph * 360;
          ctx.globalAlpha = 0.55 * r; ctx.fillRect(Math.round(x), Math.round(y), 1, 9);
        }
      }
      // Ráfagas de viento de sus alas mientras baja.
      const g = cl((k - 0.3) / 0.1) * (1 - cl((k - 0.8) / 0.1));
      if (g > 0) {
        const lift = (1 - ease(lugE(k))) * 260, beat = Math.sin(k * 34);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const s = i % 2 ? 1 : -1, ph = (now * 2 + i / 6) % 1;
          ctx.globalAlpha = 0.5 * g * (1 - ph);
          ctx.fillRect(Math.round(l.x + s * (40 + ph * 120)), Math.round(l.y - lift - 30 + (i - 3) * 8 + beat * 6), Math.round(26 * (1 - ph) + 6), 2);
        }
      }
      // Tromba de agua al tocar el suelo.
      const sp = cl((k - 0.8) / 0.08) * (1 - cl((k - 0.88) / 0.12));
      if (sp > 0) {
        glow(ctx, l.x, l.y - 70, 46, 90 * sp, '#9ad8ff', 0.8 * sp);
        glow(ctx, l.x, l.y - 60, 20, 70 * sp, '#ffffff', 0.6 * sp);
        ctx.globalAlpha = 0.55 * sp; ctx.fillStyle = '#9ad8ff'; ctx.beginPath(); ctx.ellipse(l.x, l.y - 55 * sp, 26, 55 * sp, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.7 * sp; ctx.fillStyle = '#e6f4ff'; ctx.beginPath(); ctx.ellipse(l.x, l.y - 50 * sp, 10, 48 * sp, 0, 0, TAU); ctx.fill();
      }
      if (k > 0.84) glow(ctx, l.x, l.y - 40, 56, 70, '#c8dcff', 0.3);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.ring(l.x, l.y, 12, 180, '#c8dcff', 0.6, 6);
      G.FX.burst(l.x, l.y - 20, '#9ad8ff', 28, 260);
      shake(l, 1);
    }
  });

  /* ---------- Ho-Oh (250): se dibuja un arcoíris, caen plumas doradas, él baja por el centro y se enciende un corro sagrado ---------- */
  const RAINBOW = ['#ff4a4a', '#ff9a2a', '#ffe23a', '#5ad85a', '#4aa8ff', '#5a5aff', '#b060ff'];
  const hoE = k => cl((k - 0.35) / 0.45);
  add(250, {
    title: 'Ave del arcoíris', dur: 2.6, short: 1.0, cue: 0.8,
    sprite(l, k) { const e = hoE(k); return { a: cl((k - 0.35) / 0.12), rise: 0, lift: (1 - ease(e)) * 300, flash: k > 0.8 && k < 0.88 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Corro de fuego sagrado en el suelo, de colores.
      const f = cl((k - 0.55) / 0.2) * (1 - cl((k - 0.92) / 0.08));
      if (f > 0) {
        for (let i = 0; i < 14; i++) {
          const an = i / 14 * TAU + now * 0.6, x = l.x + Math.cos(an) * 80, y = l.y + Math.sin(an) * 30, fl = 0.7 + 0.3 * Math.sin(now * 12 + i);
          glow(ctx, x, y - 8, 9, 16 * fl, RAINBOW[i % 7], 0.85 * f);
          ctx.globalAlpha = 0.9 * f; ctx.fillStyle = RAINBOW[i % 7]; ctx.beginPath(); ctx.ellipse(x, y - 7 * fl * f, 4, 9 * fl * f, 0, 0, TAU); ctx.fill();
        }
        glow(ctx, l.x, l.y, 100, 38, '#ffd25e', 0.35 * f);
      }
      if (k > 0.35) dropShadow(ctx, l, hoE(k), 0, 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El arcoíris se dibuja de izquierda a derecha y luego se desvanece.
      const p = ease(cl((k - 0.05) / 0.3)), fade = 1 - cl((k - 0.82) / 0.18);
      if (p > 0 && fade > 0) {
        ctx.lineWidth = 6;
        for (let i = 0; i < 7; i++) {
          ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = RAINBOW[i];
          ctx.beginPath(); ctx.arc(l.x, l.y - 50, 165 - i * 6, Math.PI, Math.PI + Math.PI * p); ctx.stroke();
        }
      }
      // Plumas doradas que caen balanceándose.
      const fe = cl((k - 0.2) / 0.1) * fade;
      if (fe > 0) {
        for (let i = 0; i < 14; i++) {
          const ph = (now * 0.35 + H(l.seed, i, 81)) % 1, x = l.x + (H(l.seed, i, 82) - 0.5) * 320 + Math.sin(now * 2 + i) * 14, y = l.y - 300 + ph * 300;
          ctx.globalAlpha = fe * (1 - ph * 0.6); ctx.fillStyle = i % 3 ? '#ffd25e' : '#ff6a3a';
          ctx.beginPath(); ctx.ellipse(x, y, 2, 6, Math.sin(now * 3 + i) * 0.8, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.82) glow(ctx, l.x, l.y - 44, 58, 72, '#ffd25e', 0.34);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.ring(l.x, l.y, 10, 170, '#ff6a3a', 0.5, 5);
      G.FX.ring(l.x, l.y, 10, 130, '#ffe23a', 0.55, 4);
      G.FX.ring(l.x, l.y, 10, 90, '#5ad85a', 0.6, 3);
      G.FX.burst(l.x, l.y - 40, '#ffd25e', 28, 250);
      shake(l, 0.8);
    }
  });

  /* ---------- Celebi (251): un reloj de luz gira hacia atrás, brota la hierba con flores, hojas en remolino y sale de una luz verde ---------- */
  add(251, {
    title: 'Voz del bosque', dur: 2.2, short: 0.9, cue: 0.72,
    sprite(l, k) { const d = cl((k - 0.72) / 0.28); return { a: cl((k - 0.7) / 0.08), rise: 0, lift: 18 * (1 - ease(d)), flash: k > 0.72 && k < 0.82 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Reloj en el suelo: dos anillos y doce marcas que giran hacia atrás.
      const c = cl(k / 0.15) * (1 - cl((k - 0.8) / 0.2));
      if (c > 0) {
        glow(ctx, l.x, l.y, 110, 42, '#7ad85a', 0.4 * c);
        ctx.strokeStyle = '#c8ffb0'; ctx.lineWidth = 2; ctx.globalAlpha = 0.7 * c;
        ctx.beginPath(); ctx.ellipse(l.x, l.y, 80, 30, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.45 * c; ctx.beginPath(); ctx.ellipse(l.x, l.y, 56, 21, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#eaffd8'; ctx.globalAlpha = 0.9 * c;
        for (let i = 0; i < 12; i++) { const an = i / 12 * TAU - now * 2.2; ctx.fillRect(Math.round(l.x + Math.cos(an) * 68) - 2, Math.round(l.y + Math.sin(an) * 25.5) - 1, 4, 3); }
      }
      // La hierba brota alrededor; algunas con flor.
      const g = ease(cl((k - 0.2) / 0.5));
      if (g > 0) {
        for (let i = 0; i < 18; i++) {
          const an = H(l.seed, i, 91) * TAU, d = 30 + H(l.seed, i, 92) * 80, x = Math.round(l.x + Math.cos(an) * d), y = Math.round(l.y + Math.sin(an) * d * 0.38), h = Math.round((6 + 8 * H(l.seed, i, 93)) * g);
          ctx.globalAlpha = 1; ctx.fillStyle = '#3a9a3a'; ctx.fillRect(x - 2, y - h, 2, h); ctx.fillStyle = '#5ad85a'; ctx.fillRect(x + 1, y - Math.round(h * 0.7), 2, Math.round(h * 0.7));
          if (i % 3 === 0 && k > 0.6) { ctx.fillStyle = i % 2 ? '#ff9ad6' : '#ffe23a'; ctx.fillRect(x - 2, y - h - 3, 4, 3); }
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const cy = l.y - 44;
      // Hojas que giran hacia el centro.
      const lf = cl(k / 0.1) * (1 - cl((k - 0.74) / 0.12));
      if (lf > 0) {
        for (let i = 0; i < 12; i++) {
          const an = i / 12 * TAU + now * 3, d = 30 + 110 * (1 - ease(cl(k / 0.72))) * (0.6 + 0.4 * H(l.seed, i, 94));
          ctx.globalAlpha = 0.9 * lf; ctx.fillStyle = i % 2 ? '#5ad85a' : '#a8f07a';
          ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * d, cy + Math.sin(an) * d * 0.55, 5, 2.5, an + now * 4, 0, TAU); ctx.fill();
        }
      }
      // La luz verde que crece en el centro y se abre.
      const o = cl((k - 0.3) / 0.42);
      if (o > 0 && k < 0.8) {
        const R = 6 + 18 * ease(o), a = 1 - cl((k - 0.72) / 0.08);
        glow(ctx, l.x, cy, R * 3, R * 3, '#7ad85a', 0.8 * a);
        ctx.globalAlpha = 0.9 * a; ctx.fillStyle = '#eaffd8'; ctx.beginPath(); ctx.arc(l.x, cy, R * 0.6, 0, TAU); ctx.fill();
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 40, 50, '#a8f07a', 0.3 * (0.75 + 0.25 * Math.sin(now * 7)));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#a8f07a', 20, 190);
      G.FX.burst(l.x, l.y - 40, '#ff9ad6', 8, 150);
      G.FX.ring(l.x, l.y, 8, 120, '#7ad85a', 0.5, 4);
      shake(l, 0.3);
    }
  });

  // ================= tanda 2 (25-11-2026): tercera generación =================

  /** Estrella de 5 puntas rellena. */
  function star5(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  /** Lluvia en diagonal (n gotas en una franja de ancho w). */
  function rain(ctx, l, now, a, n, w, col) {
    if (a <= 0) return;
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const ph = (now * (1.8 + H(l.seed, i, 171) * 0.7) + H(l.seed, i, 172)) % 1;
      ctx.globalAlpha = 0.55 * a; ctx.fillRect(Math.round(l.x - w / 2 + H(l.seed, i, 173) * w - ph * 70), Math.round(l.y - 300 + ph * 330), 1, 10);
    }
  }
  /*
   * Los puntos de los Regi: se encienden uno a uno en el suelo delante de él y se apagan al llegar. Cada uno con su dibujo
   * (fila, columna o cuadro), en baldosas de 20 × 9 desde (x, y + 34).
   */
  const BRAILLE = {
    377: [[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0]],
    378: [[0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-2, 0], [2, 0]],
    379: [[-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, 0]]
  };
  function braille(ctx, l, k, col, now) {
    const P = BRAILLE[l.dex] || BRAILLE[377], off = cl((k - 0.82) / 0.18);
    for (let i = 0; i < P.length; i++) {
      const on = cl((k - 0.04 - i * 0.035) / 0.05) * (1 - off);
      if (on <= 0) continue;
      const x = l.x + P[i][0] * 20, y = l.y + 34 + P[i][1] * 9, pu = 0.8 + 0.2 * Math.sin(now * 8 + i);
      glow(ctx, x, y, 16, 9, col, 0.8 * on * pu);
      ctx.globalAlpha = on; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, 5, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, y - 1, 2, 1.2, 0, 0, TAU); ctx.fill();
    }
  }

  /* ---------- Regirock (377): sus puntos se encienden, las rocas vuelan y se amontonan, sale del montón y lo revienta ---------- */
  const ROCKS = 10;
  const rockAt = (l, i) => ({ t: 0.26 + i * 0.03, an: H(l.seed, i, 101) * TAU, px: (H(l.seed, i, 102) - 0.5) * 60, py: -8 - H(l.seed, i, 103) * 44, s: 13 + H(l.seed, i, 104) * 9 });
  function rock(ctx, x, y, s) {
    ctx.fillStyle = '#5a4430'; ctx.beginPath(); ctx.ellipse(x, y + s * 0.15, s, s * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a6a48'; ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.05, s * 0.85, s * 0.65, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b89a70'; ctx.fillRect(Math.round(x - s * 0.45), Math.round(y - s * 0.4), Math.max(1, Math.round(s * 0.35)), 2);
  }
  add(377, {
    title: 'Coloso de roca', dur: 2.3, short: 0.9, cue: 0.72,
    sprite(l, k) { return { a: k > 0.6 ? 1 : 0, rise: 1 - ease(cl((k - 0.6) / 0.16)), lift: 0, flash: k > 0.72 && k < 0.8 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.3 && k < 0.62 && Math.random() < dt * 24) G.FX.px(l.x + (Math.random() - 0.5) * 70, l.y - Math.random() * 10, '#a08868', { vx: (Math.random() - 0.5) * 80, vy: -30 - Math.random() * 40, life: 0.5, drag: 0.85 });
    },
    back(ctx, l, k, now) {
      ctx.save();
      braille(ctx, l, k, '#ff9a3a', now);
      // El suelo se agrieta bajo el montón.
      const g = ease(cl((k - 0.3) / 0.3)) * (1 - cl((k - 0.9) / 0.1) * 0.7);
      if (g > 0) {
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8 * g; ctx.beginPath();
        for (let i = 0; i < 5; i++) { const an = H(l.seed, i, 105) * TAU; jag(ctx, l.x, l.y, l.x + Math.cos(an) * 80 * g, l.y + Math.sin(an) * 32 * g, 4, 5, l.seed + i); }
        ctx.stroke();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      ctx.globalAlpha = 1;
      for (let i = 0; i < ROCKS; i++) {
        const r = rockAt(l, i), f = cl((k - r.t) / 0.14);
        if (f <= 0) continue;
        if (k < 0.72) {
          // Vuela en arco desde fuera hasta su sitio en el montón.
          const e = ease(f), sx = l.x + Math.cos(r.an) * 220, sy = l.y + Math.sin(r.an) * 90;
          const x = sx + (l.x + r.px - sx) * e, y = sy + (l.y + r.py - sy) * e - Math.sin(e * Math.PI) * 90;
          rock(ctx, x, y, r.s);
        } else {
          // Revienta: sale despedida y se apaga.
          const b = cl((k - 0.72) / 0.22), d = 30 + 150 * ease(b);
          if (b >= 1) continue;
          ctx.globalAlpha = 1 - b;
          rock(ctx, l.x + r.px + (r.px >= 0 ? 1 : -1) * d, l.y + r.py - 40 * Math.sin(b * Math.PI) + d * 0.2, r.s * (1 - 0.4 * b));
        }
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 54, 60, '#ff9a3a', 0.25 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#a08868', 30, 260);
      G.FX.ring(l.x, l.y, 10, 160, '#ff9a3a', 0.5, 6);
      shake(l, 1.1);
    }
  });

  /* ---------- Regice (378): sus puntos se encienden, sube un bloque de hielo con su silueta dentro, se agrieta y estalla ---------- */
  add(378, {
    title: 'Coloso de hielo', dur: 2.3, short: 0.9, cue: 0.74,
    sprite(l, k) { return { a: k > 0.42 ? 1 : 0, rise: 0, lift: 0, flash: k > 0.74 && k < 0.82, dark: k < 0.74 ? 1 : 0 }; },
    tick(l, k, dt) {
      if (G.FX && k < 0.8 && Math.random() < dt * 14) G.FX.px(l.x + (Math.random() - 0.5) * 120, l.y - Math.random() * 16, '#e6f6ff', { vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 15, life: 0.9, drag: 0.95 });
    },
    back(ctx, l, k, now) {
      ctx.save();
      braille(ctx, l, k, '#7ad8ff', now);
      const f = ease(cl((k - 0.15) / 0.3)) * (1 - cl((k - 0.9) / 0.1) * 0.6);
      if (f > 0) { ctx.globalAlpha = 0.5 * f; ctx.fillStyle = '#d8f2ff'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 70 * f, 28 * f, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El bloque crece del suelo hacia arriba.
      const up = ease(cl((k - 0.28) / 0.24));
      if (up > 0 && k < 0.74) {
        const w = 40, h = 120 * up, top = l.y - h;
        glow(ctx, l.x, l.y - h / 2, w * 1.6, h / 2 + 16, '#9ad8ff', 0.4);
        ctx.globalAlpha = 0.45; ctx.fillStyle = '#bfe9ff'; ctx.fillRect(Math.round(l.x - w), Math.round(top), w * 2, Math.round(h));
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#e6f6ff'; ctx.fillRect(Math.round(l.x - w), Math.round(top - 10), w * 2, 10);
        ctx.globalAlpha = 0.8; ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(l.x - w), Math.round(top), 2, Math.round(h)); ctx.fillRect(Math.round(l.x + w - 2), Math.round(top), 2, Math.round(h));
        ctx.fillRect(Math.round(l.x - w), Math.round(top - 10), w * 2, 2);
        ctx.globalAlpha = 0.5; ctx.fillRect(Math.round(l.x - w + 8), Math.round(top + 6), 4, Math.round(Math.max(0, h * 0.6)));
        // Grietas.
        const cr = cl((k - 0.58) / 0.16);
        if (cr > 0) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = cr; ctx.beginPath();
          for (let i = 0; i < 5; i++) { const x0 = l.x + (H(l.seed, i, 111) - 0.5) * w * 1.6, y0 = top + H(l.seed, i, 112) * h; jag(ctx, x0, y0, x0 + (H(l.seed, i, 113) - 0.5) * 50 * cr, y0 + (H(l.seed, i, 114) - 0.5) * 60 * cr, 3, 4, l.seed + i); }
          ctx.stroke();
        }
      }
      // Estalla en esquirlas.
      const b = cl((k - 0.74) / 0.24);
      if (b > 0 && b < 1) {
        for (let i = 0; i < 14; i++) {
          const an = H(l.seed, i, 115) * TAU, d = 20 + 150 * ease(b) * (0.5 + 0.5 * H(l.seed, i, 116)), x = l.x + Math.cos(an) * d, y = l.y - 60 + Math.sin(an) * d * 0.6 + 60 * b * b, s = 4 + (i % 3) * 3;
          ctx.globalAlpha = 1 - b; ctx.fillStyle = i % 2 ? '#bfe9ff' : '#ffffff';
          ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.6, y + s * 0.5); ctx.lineTo(x - s * 0.6, y + s * 0.5); ctx.closePath(); ctx.fill();
        }
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 40, 52, 60, '#9ad8ff', 0.28);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 50, '#e6f6ff', 30, 260);
      G.FX.ring(l.x, l.y, 10, 150, '#7ad8ff', 0.5, 5);
      shake(l, 0.9);
    }
  });

  /* ---------- Registeel (379): sus puntos se encienden, caen cuatro planchas de acero con chispas y él cae de golpe ---------- */
  const PLATES = [0.2, 0.3, 0.4, 0.5];
  const steelDrop = k => { const e = cl((k - 0.55) / 0.15); return 240 * (1 - e * e); };
  add(379, {
    title: 'Coloso de acero', dur: 2.2, short: 0.9, cue: 0.7,
    sprite(l, k) { return { a: k > 0.55 ? 1 : 0, rise: 0, lift: steelDrop(k), flash: k > 0.7 && k < 0.78 }; },
    tick(l, k, dt) {
      if (!G.FX) return;
      l.plates = l.plates || 0;
      for (let i = 0; i < 4; i++) {
        if (k >= PLATES[i] + 0.08 && !(l.plates & (1 << i))) {
          l.plates |= 1 << i;
          const an = i / 4 * TAU + TAU / 8;
          G.FX.burst(l.x + Math.cos(an) * 74, l.y + Math.sin(an) * 30, '#fff2a8', 10, 160);
          shake(l, 0.25);
        }
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      braille(ctx, l, k, '#c8d0e0', now);
      // Las planchas caen del cielo y se clavan alrededor.
      for (let i = 0; i < 4; i++) {
        const f = cl((k - PLATES[i]) / 0.08);
        if (f <= 0) continue;
        const an = i / 4 * TAU + TAU / 8, x = l.x + Math.cos(an) * 74, y = l.y + Math.sin(an) * 30, dy = 220 * (1 - f * f), out = 1 - cl((k - 0.88) / 0.12);
        ctx.globalAlpha = 0.3 * f * out; ctx.fillStyle = '#10141c'; ctx.beginPath(); ctx.ellipse(x, y, 20, 7, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = out;
        ctx.fillStyle = '#5a6478'; ctx.fillRect(Math.round(x - 18), Math.round(y - dy - 26), 36, 26);
        ctx.fillStyle = '#9aa4b8'; ctx.fillRect(Math.round(x - 18), Math.round(y - dy - 26), 36, 6);
        ctx.fillStyle = '#d8dee8'; for (const ox of [-12, 10]) ctx.fillRect(Math.round(x + ox), Math.round(y - dy - 17), 3, 3);
      }
      // Al caer él: hoyo en el suelo y ondas magnéticas.
      if (k >= 0.7) {
        const o = 1 - cl((k - 0.9) / 0.1);
        ctx.globalAlpha = 0.45 * o; ctx.fillStyle = '#1a1c22'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 46, 16, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#c8d0e0'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { const ph = (now * 1.2 + i / 3) % 1; ctx.globalAlpha = 0.6 * o * (1 - ph); ctx.beginPath(); ctx.ellipse(l.x, l.y, 30 + 70 * ph, 11 + 26 * ph, 0, 0, TAU); ctx.stroke(); }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 52, 60, '#c8d0e0', 0.25);
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 10, '#c8d0e0', 30, 280);
      G.FX.ring(l.x, l.y, 12, 170, '#9aa4b8', 0.5, 7);
      shake(l, 1.3);
    }
  });

  /* ---------- Latias (380): tres espejismos suyos aparecen y se deshacen alrededor; la de verdad se hace visible en medio ---------- */
  const MIRAGE = [0.08, 0.24, 0.4];
  add(380, {
    title: 'Espejismo carmesí', dur: 2.2, short: 0.9, cue: 0.74,
    sprite(l, k) { const d = cl((k - 0.6) / 0.4); return { a: cl((k - 0.6) / 0.14), rise: 0, lift: 22 * (1 - ease(d)), flash: k > 0.74 && k < 0.8, scan: k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const m = cl((k - MIRAGE[i]) / 0.08) * (1 - cl((k - MIRAGE[i] - 0.18) / 0.08));
        if (m <= 0) continue;
        const x = l.x + (i === 1 ? 1 : -1) * (90 + 40 * H(l.seed, i, 121)), y = l.y - 10 + (H(l.seed, i, 122) - 0.5) * 40;
        ctx.globalAlpha = 0.5 * m; ctx.strokeStyle = '#ffd6e0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y, 24 + 12 * (1 - m), 9 + 4 * (1 - m), 0, 0, TAU); ctx.stroke();
      }
      const g = cl((k - 0.55) / 0.2) * (1 - cl((k - 0.9) / 0.1));
      if (g > 0) { glow(ctx, l.x, l.y, 80, 30, '#ff6a8a', 0.45 * g); ctx.globalAlpha = 0.3 * g; ctx.fillStyle = '#ff8aa0'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 46, 16, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Los espejismos: ella misma, medio transparente, que se deshace.
      for (let i = 0; i < 3; i++) {
        const m = cl((k - MIRAGE[i]) / 0.08) * (1 - cl((k - MIRAGE[i] - 0.18) / 0.08));
        if (m <= 0) continue;
        const x = l.x + (i === 1 ? 1 : -1) * (90 + 40 * H(l.seed, i, 121)), y = l.y - 10 + (H(l.seed, i, 122) - 0.5) * 40;
        if (l.an) l.an.draw(ctx, x, y - 16 - 6 * Math.sin(now * 3 + i), { alpha: 0.45 * m });
        glow(ctx, x, y - 36, 34, 40, '#ff8aa0', 0.35 * m);
        ctx.fillStyle = '#ffffff';
        for (let j = 0; j < 4; j++) { ctx.globalAlpha = m * (0.5 + 0.5 * Math.sin(now * 9 + j * 2 + i)); star4(ctx, x + (H(l.seed, i * 4 + j, 123) - 0.5) * 50, y - 20 - H(l.seed, i * 4 + j, 124) * 50, 2); }
      }
      // Antes de verse: plumas de luz roja que giran hacia el centro.
      const sw = cl((k - 0.35) / 0.1) * (1 - cl((k - 0.72) / 0.08));
      if (sw > 0) {
        for (let i = 0; i < 10; i++) {
          const an = i / 10 * TAU + now * 4, d = 20 + 70 * (1 - ease(cl((k - 0.35) / 0.4)));
          ctx.globalAlpha = 0.85 * sw; ctx.fillStyle = i % 2 ? '#ff6a8a' : '#ffffff';
          ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * d, l.y - 40 + Math.sin(an) * d * 0.5, 5, 2, an, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 40, 48, 56, '#ff8aa0', 0.28);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#ff8aa0', 22, 200);
      G.FX.ring(l.x, l.y - 20, 8, 130, '#ffd6e0', 0.5, 4);
      shake(l, 0.4);
    }
  });

  /* ---------- Latios (381): cruza el cielo como un avión con estela, rompe la barrera del sonido, da la vuelta y aterriza ---------- */
  const latP = k => {
    if (k < 0.45) { const e = cl((k - 0.15) / 0.3); return { ox: 420 - 840 * e, lift: 130 }; }
    const e = ease(cl((k - 0.45) / 0.31));
    return { ox: -420 * (1 - e), lift: 130 * (1 - e) + 50 * Math.sin(e * Math.PI) };
  };
  add(381, {
    title: 'Estela azul', dur: 2.2, short: 0.9, cue: 0.76,
    sprite(l, k) { const p = latP(k); return { a: k > 0.15 ? 1 : 0, rise: 0, lift: p.lift, ox: p.ox, flash: k > 0.76 && k < 0.82 }; },
    back(ctx, l, k, now) {
      ctx.save();
      if (k > 0.15 && k < 0.9) { const p = latP(k), e = 1 - p.lift / 180; ctx.globalAlpha = 0.25 * cl(e); ctx.fillStyle = '#0b1020'; ctx.beginPath(); ctx.ellipse(l.x + p.ox, l.y, 30, 9, 0, 0, TAU); ctx.fill(); }
      const w = cl((k - 0.76) / 0.24);
      if (w > 0 && w < 1) { ctx.lineWidth = 3; ctx.strokeStyle = '#b8d8ff'; ctx.globalAlpha = 0.8 * (1 - w); ctx.beginPath(); ctx.ellipse(l.x, l.y, 30 + 140 * w, 12 + 52 * w, 0, 0, TAU); ctx.stroke(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Estela: dos cintas (azul y blanca) por donde ha pasado.
      if (k > 0.15) {
        for (let j = 30; j >= 1; j--) {
          const kk = k - j * 0.01;
          if (kk < 0.15 || kk > 0.78) continue;
          const p = latP(kk), f = 1 - j / 30;
          ctx.globalAlpha = 0.7 * f; ctx.fillStyle = j % 3 ? '#6aa8ff' : '#ffffff';
          ctx.beginPath(); ctx.arc(l.x + p.ox, l.y - p.lift - 30, 2 + 5 * f, 0, TAU); ctx.fill();
        }
      }
      // La barrera del sonido, al pasar por encima del sitio.
      const sb = cl((k - 0.3) / 0.12);
      if (sb > 0 && sb < 1) {
        const p = latP(0.3);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * (1 - sb) + 1; ctx.globalAlpha = 0.9 * (1 - sb);
        ctx.beginPath(); ctx.ellipse(l.x + p.ox, l.y - p.lift - 30, 10 + 40 * sb, 26 + 70 * sb, 0, 0, TAU); ctx.stroke();
        glow(ctx, l.x + p.ox, l.y - p.lift - 30, 50, 70, '#b8d8ff', 0.6 * (1 - sb));
      }
      if (k > 0.78) glow(ctx, l.x, l.y - 40, 50, 56, '#6aa8ff', 0.28);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#b8d8ff', 24, 260);
      G.FX.ring(l.x, l.y, 10, 160, '#6aa8ff', 0.5, 5);
      shake(l, 0.7);
    }
  });

  /* ---------- Kyogre (382): llueve, el mar cubre el suelo, una ola gigante cruza y rompe, y él sale del agua ---------- */
  const kyoW = k => -280 * (1 - ease(cl((k - 0.28) / 0.36)));
  add(382, {
    title: 'Rey de las profundidades', dur: 2.5, short: 1.0, cue: 0.8,
    sprite(l, k) { return { a: k > 0.6 ? 1 : 0, rise: 1 - ease(cl((k - 0.6) / 0.24)), lift: 0, flash: k > 0.8 && k < 0.88 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.6 && k < 0.9 && Math.random() < dt * 40) {
        const an = Math.random() * TAU;
        G.FX.px(l.x + Math.cos(an) * 50, l.y + Math.sin(an) * 18, Math.random() < 0.5 ? '#9ad8ff' : '#ffffff', { vx: Math.cos(an) * 50, vy: -140 - Math.random() * 120, life: 0.7, grav: 380, drag: 1 });
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // El mar sube y cubre el suelo; luego se retira un poco.
      const s = ease(cl(k / 0.3)) * (1 - cl((k - 0.88) / 0.12) * 0.7);
      if (s > 0) {
        glow(ctx, l.x, l.y, 200 * s, 70 * s, '#2a6ad9', 0.4 * s);
        ctx.globalAlpha = 0.6 * s; ctx.fillStyle = '#1a4aa8'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 170 * s, 60 * s, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.35 * s; ctx.fillStyle = '#5aa8ff'; ctx.beginPath(); ctx.ellipse(l.x, l.y - 4, 120 * s, 36 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e6f4ff';
        for (let i = 0; i < 10; i++) { const ph = (now * 0.5 + H(l.seed, i, 131)) % 1, an = H(l.seed, i, 132) * TAU, r = 0.3 + 0.6 * ph; ctx.globalAlpha = 0.6 * s * (1 - ph); ctx.fillRect(Math.round(l.x + Math.cos(an) * 160 * r * s) - 3, Math.round(l.y + Math.sin(an) * 56 * r * s), 6, 1); }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      rain(ctx, l, now, cl(k / 0.1) * (1 - cl((k - 0.86) / 0.14)), 46, 520, '#a8c8ff');
      // La ola: una pared de agua que llega de la izquierda y rompe sobre el sitio.
      const on = cl((k - 0.28) / 0.06), brk = cl((k - 0.64) / 0.1);
      if (on > 0 && brk < 1) {
        const wx = l.x + kyoW(k), hgt = 110 * on * (1 - brk);
        if (hgt > 1) {
          ctx.globalAlpha = 0.85; ctx.fillStyle = '#2a6ad9';
          ctx.beginPath(); ctx.moveTo(wx - 120, l.y + 20);
          for (let i = 0; i <= 12; i++) { const q = i / 12, x = wx - 120 + q * 170, h = hgt * Math.sin(q * Math.PI * 0.85) * (0.9 + 0.1 * Math.sin(now * 6 + i)); ctx.lineTo(x, l.y + 10 - h); }
          ctx.lineTo(wx + 50, l.y + 20); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.5; ctx.fillStyle = '#5aa8ff'; ctx.fillRect(Math.round(wx - 100), Math.round(l.y - hgt * 0.4), 110, Math.max(1, Math.round(hgt * 0.15)));
          // Espuma en la cresta.
          ctx.globalAlpha = 0.95; ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 9; i++) { const q = 0.35 + i / 16, x = wx - 120 + q * 170, h = hgt * Math.sin(q * Math.PI * 0.85); ctx.beginPath(); ctx.arc(x, l.y + 10 - h, 3 + (i % 3), 0, TAU); ctx.fill(); }
        }
      }
      // Rompe: espuma que salta.
      if (brk > 0 && brk < 1) {
        for (let i = 0; i < 14; i++) {
          const an = -Math.PI * (0.1 + 0.8 * H(l.seed, i, 133)), d = 20 + 90 * ease(brk);
          ctx.globalAlpha = 1 - brk; ctx.fillStyle = i % 2 ? '#ffffff' : '#9ad8ff';
          ctx.beginPath(); ctx.arc(l.x + Math.cos(an) * d, l.y - 20 + Math.sin(an) * d + 70 * brk * brk, 4 - 2 * brk, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.82) glow(ctx, l.x, l.y - 40, 60, 60, '#5aa8ff', 0.3);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.ring(l.x, l.y, 12, 190, '#9ad8ff', 0.6, 6);
      G.FX.burst(l.x, l.y - 20, '#ffffff', 26, 260);
      shake(l, 1.1);
    }
  });

  /* ---------- Jirachi (385): se hace de noche, pasa una estrella fugaz, una estrella baja despacio, gira y se abre en él ---------- */
  const jiY = k => 200 - 160 * ease(cl((k - 0.28) / 0.4));
  add(385, {
    title: 'El que concede deseos', dur: 2.3, short: 0.9, cue: 0.76,
    sprite(l, k) { const d = cl((k - 0.74) / 0.26); return { a: cl((k - 0.72) / 0.08), rise: 0, lift: 26 * (1 - ease(d)), flash: k > 0.74 && k < 0.82 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Noche: un velo oscuro alrededor (no toda la pantalla).
      const n = cl(k / 0.15) * (1 - cl((k - 0.85) / 0.15));
      if (n > 0) { ctx.globalAlpha = 0.4 * n; ctx.fillStyle = '#0a0e2a'; ctx.beginPath(); ctx.ellipse(l.x, l.y - 60, 300, 200, 0, 0, TAU); ctx.fill(); }
      const g = cl((k - 0.6) / 0.15) * (1 - cl((k - 0.9) / 0.1));
      if (g > 0) { glow(ctx, l.x, l.y, 80, 30, '#ffe23a', 0.45 * g); ctx.globalAlpha = 0.3 * g; ctx.fillStyle = '#fff2a8'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 40, 14, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const n = cl(k / 0.15) * (1 - cl((k - 0.85) / 0.15));
      // Estrellas que titilan.
      if (n > 0) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 18; i++) { ctx.globalAlpha = n * (0.4 + 0.6 * Math.abs(Math.sin(now * (2 + H(l.seed, i, 141) * 3) + i))); star4(ctx, l.x + (H(l.seed, i, 142) - 0.5) * 520, l.y - 60 - H(l.seed, i, 143) * 150, i % 4 ? 1 : 2); }
      }
      // Estrella fugaz.
      const sh = cl((k - 0.08) / 0.18);
      if (sh > 0 && sh < 1) {
        for (let j = 0; j < 8; j++) { const q = Math.max(0, sh - j * 0.03); ctx.globalAlpha = (1 - j / 8) * (1 - sh * 0.5); ctx.fillStyle = j ? '#fff2a8' : '#ffffff'; ctx.beginPath(); ctx.arc(l.x + 240 - 480 * q, l.y - 190 + 60 * q, 3 - j * 0.3, 0, TAU); ctx.fill(); }
      }
      // La estrella del deseo baja, gira y se abre.
      const sw = cl((k - 0.28) / 0.06);
      if (sw > 0 && k < 0.78) {
        const y = l.y - jiY(k), spin = cl((k - 0.64) / 0.12), r = 16 * (1 - 0.8 * spin) + 2 * Math.sin(now * 8), rot = now * 0.8 + spin * spin * 12;
        glow(ctx, l.x, y, 50, 50, '#ffe23a', 0.8 * sw);
        // Rayos al abrirse.
        if (spin > 0) {
          ctx.fillStyle = '#fff6c8';
          for (let i = 0; i < 5; i++) { const a = rot + i / 5 * TAU; ctx.globalAlpha = spin * 0.8; ctx.save(); ctx.translate(l.x, y); ctx.rotate(a); ctx.fillRect(0, -1.5, 20 + 60 * spin, 3); ctx.restore(); }
        }
        ctx.globalAlpha = sw; ctx.fillStyle = '#ffe23a'; star5(ctx, l.x, y, r, rot);
        ctx.fillStyle = '#ffffff'; star5(ctx, l.x, y, r * 0.5, rot);
        // Su estela de chispitas.
        ctx.fillStyle = '#fff2a8';
        for (let j = 1; j < 7; j++) { const kk = k - j * 0.03; if (kk < 0.28) continue; ctx.globalAlpha = 0.7 * (1 - j / 7); star4(ctx, l.x + Math.sin(j * 1.7 + now) * 6, l.y - jiY(kk) - 6, 1); }
      }
      if (k > 0.78) glow(ctx, l.x, l.y - 44, 44, 52, '#fff2a8', 0.3 * (0.75 + 0.25 * Math.sin(now * 5)));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#fff2a8', 24, 220);
      G.FX.ring(l.x, l.y - 30, 8, 130, '#ffe23a', 0.5, 4);
      shake(l, 0.35);
    }
  });

  /* ---------- Deoxys (386): un meteorito cae y abre un cráter; del cráter sube su núcleo de cristal y él se forma alrededor ---------- */
  const deoM = k => cl((k - 0.1) / 0.3);
  add(386, {
    title: 'Visitante del espacio', dur: 2.4, short: 1.0, cue: 0.78,
    sprite(l, k) { return { a: cl((k - 0.58) / 0.2), rise: 0, lift: 0, flash: k > 0.78 && k < 0.86, scan: k < 0.8 }; },
    tick(l, k, dt) {
      if (G.FX && k >= 0.4 && !l.hit) {
        l.hit = true;
        G.FX.burst(l.x, l.y - 10, '#c89a6a', 28, 260);
        G.FX.ring(l.x, l.y, 10, 150, '#ff9a3a', 0.4, 6);
        shake(l, 1);
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // El cráter: borde de tierra, hoyo oscuro y, luego, luz morada dentro.
      const c = cl((k - 0.4) / 0.05) * (1 - cl((k - 0.9) / 0.1) * 0.6);
      if (c > 0) {
        ctx.globalAlpha = 0.9 * c; ctx.fillStyle = '#6a4a30'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 64, 24, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1018'; ctx.beginPath(); ctx.ellipse(l.x, l.y + 2, 48, 16, 0, 0, TAU); ctx.fill();
        const p = cl((k - 0.45) / 0.2);
        if (p > 0) { glow(ctx, l.x, l.y, 70, 26, '#b060ff', 0.7 * p); ctx.globalAlpha = 0.6 * p * c; ctx.fillStyle = '#7a3ad8'; ctx.beginPath(); ctx.ellipse(l.x, l.y + 2, 34, 11, 0, 0, TAU); ctx.fill(); }
        // Onda del golpe.
        const w = cl((k - 0.4) / 0.2);
        if (w < 1) { ctx.globalAlpha = 0.8 * (1 - w); ctx.strokeStyle = '#ffb06a'; ctx.lineWidth = 4 * (1 - w) + 1; ctx.beginPath(); ctx.ellipse(l.x, l.y, 40 + 150 * w, 15 + 56 * w, 0, 0, TAU); ctx.stroke(); }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El meteorito cae en diagonal con su cola de fuego.
      const m = deoM(k);
      if (k > 0.1 && m < 1) {
        const pos = q => ({ x: l.x + 260 * (1 - q), y: l.y - 10 - 250 * (1 - q) });
        for (let j = 10; j >= 1; j--) { const q = Math.max(0, m - j * 0.025), p = pos(q * q); ctx.globalAlpha = 0.8 * (1 - j / 11); ctx.fillStyle = j % 2 ? '#ff6a1f' : '#ffb03a'; ctx.beginPath(); ctx.arc(p.x, p.y, 9 * (1 - j / 12), 0, TAU); ctx.fill(); }
        const p = pos(m * m);
        glow(ctx, p.x, p.y, 40, 40, '#ff9a3a', 0.9);
        ctx.globalAlpha = 1; ctx.fillStyle = '#5a3a2a'; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff0a8'; ctx.beginPath(); ctx.arc(p.x - 3, p.y + 3, 4, 0, TAU); ctx.fill();
      }
      // El núcleo: un cristal morado que sube del cráter, con anillos cian que giran; se esconde dentro de él al llegar.
      const co = cl((k - 0.45) / 0.15) * (1 - cl((k - 0.78) / 0.06));
      if (co > 0) {
        const y = l.y - 8 - 38 * ease(cl((k - 0.45) / 0.25)), pu = 1 + 0.15 * Math.sin(now * 10);
        glow(ctx, l.x, y, 30 * pu, 30 * pu, '#b060ff', 0.9 * co);
        ctx.globalAlpha = co; ctx.fillStyle = '#7a3ad8'; ctx.beginPath(); ctx.arc(l.x, y, 8 * pu, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7dffd8'; ctx.beginPath(); ctx.arc(l.x, y, 3.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#7dffd8'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) { ctx.globalAlpha = 0.8 * co; ctx.beginPath(); ctx.ellipse(l.x, y, 22, 7, (i ? -1 : 1) * (0.5 + now * 2), 0, TAU); ctx.stroke(); }
      }
      if (k > 0.8) glow(ctx, l.x, l.y - 40, 50, 60, '#b060ff', 0.28);
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.ring(l.x, l.y - 30, 8, 150, '#7dffd8', 0.5, 4);
      G.FX.burst(l.x, l.y - 40, '#b060ff', 24, 230);
      shake(l, 0.6);
    }
  });

  // ================= tanda 3 (25-11-2026): cuarta generación =================

  /** Lago quieto del trío de los lagos: crece, brilla con reflejos y ondas de su color y se seca al final. Da cuánto hay. */
  function lake(ctx, l, k, now, col) {
    const f = ease(cl((k - 0.04) / 0.26)) * (1 - ease(cl((k - 0.86) / 0.14)));
    if (f <= 0) return 0;
    const rx = 78 * f, ry = 26 * f;
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#1d4f7a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#3d86b8'; ctx.beginPath(); ctx.ellipse(l.x, l.y - 2, rx * 0.82, ry * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8f0ff';
    for (let i = 0; i < 6; i++) {
      const ph = (now * 0.6 + H(l.seed, i, 131)) % 1;
      ctx.globalAlpha = 0.6 * Math.sin(ph * Math.PI) * f;
      ctx.fillRect(Math.round(l.x + (H(l.seed, i, 132) - 0.5) * rx * 1.3), Math.round(l.y + (H(l.seed, i, 133) - 0.5) * ry * 1.1), 6 + Math.round(H(l.seed, i, 134) * 8), 1);
    }
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const ph = (now * 0.8 + i / 3) % 1;
      ctx.globalAlpha = 0.6 * (1 - ph) * f; ctx.beginPath(); ctx.ellipse(l.x, l.y, 8 + rx * 0.8 * ph, 3 + ry * 0.8 * ph, 0, 0, TAU); ctx.stroke();
    }
    glow(ctx, l.x, l.y, rx * 1.1, ry * 1.4, col, 0.35 * f);
    return f;
  }
  /** Los tres del lago: suben del agua y quedan flotando un poco (a 0 al acabar, donde sale el de verdad). */
  const lakeSprite = (k, r0, r1) => ({ a: k > r0 - 0.02 ? 1 : 0, rise: 1 - ease(cl((k - r0) / (r1 - r0))), lift: 16 * Math.sin(Math.PI * cl((k - r1) / (1 - r1))), flash: k > 0.76 && k < 0.82 });
  function lakeCue(l, col) {
    if (!G.FX) return;
    G.FX.burst(l.x, l.y, '#d8f0ff', 24, 200);
    G.FX.ring(l.x, l.y, 10, 130, col, 0.5, 5);
    shake(l, 0.5);
  }

  /* ---------- Uxie (480): un lago quieto; letras de luz giran a su alrededor y se recogen en él al salir ---------- */
  add(480, {
    title: 'Ser del saber', dur: 2.1, short: 0.85, cue: 0.76,
    sprite(l, k) { return lakeSprite(k, 0.46, 0.72); },
    back(ctx, l, k, now) { ctx.save(); lake(ctx, l, k, now, '#ffd84a'); ctx.restore(); },
    front(ctx, l, k, now) {
      ctx.save();
      // Ocho signos de luz que se encienden uno a uno y giran en corro; al llegar se recogen en él.
      const back = ease(cl((k - 0.62) / 0.14));
      for (let i = 0; i < 8; i++) {
        const on = cl((k - 0.2 - i * 0.03) / 0.06) * (1 - cl((k - 0.78) / 0.06));
        if (on <= 0) continue;
        const an = i / 8 * TAU + now * 0.9, d = 64 * (1 - back) + 6;
        const x = l.x + Math.cos(an) * d, y = l.y - 46 + Math.sin(an) * d * 0.4;
        glow(ctx, x, y, 12, 12, '#ffd84a', 0.6 * on);
        ctx.globalAlpha = on; ctx.fillStyle = '#ffe680';
        // Cada signo, un dibujo distinto de dos o tres trazos.
        const p = Math.floor(H(l.seed, i, 135) * 4), X = Math.round(x), Y = Math.round(y);
        ctx.fillRect(X - 3, Y - 4, 2, 8);
        if (p === 0) ctx.fillRect(X - 3, Y - 4, 7, 2);
        else if (p === 1) { ctx.fillRect(X - 3, Y, 7, 2); ctx.fillRect(X + 2, Y - 4, 2, 8); }
        else if (p === 2) ctx.fillRect(X - 3, Y + 2, 7, 2);
        else { ctx.fillRect(X + 1, Y - 4, 2, 4); ctx.fillRect(X - 3, Y + 2, 7, 2); }
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 40, 40, 46, '#ffd84a', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { lakeCue(l, '#ffd84a'); }
  });

  /* ---------- Mesprit (481): un lago quieto; chispas rosas suben del agua en parejas que se enlazan y laten al salir ---------- */
  add(481, {
    title: 'Ser de la emoción', dur: 2.1, short: 0.85, cue: 0.76,
    sprite(l, k) { return lakeSprite(k, 0.46, 0.72); },
    back(ctx, l, k, now) { ctx.save(); lake(ctx, l, k, now, '#ff7ab8'); ctx.restore(); },
    front(ctx, l, k, now) {
      ctx.save();
      const on = cl((k - 0.18) / 0.1) * (1 - cl((k - 0.86) / 0.12));
      if (on > 0) {
        for (let i = 0; i < 5; i++) {
          const ph = (now * 0.5 + H(l.seed, i, 136)) % 1, bx = l.x + (H(l.seed, i, 137) - 0.5) * 110, by = l.y - ph * 130;
          for (let j = 0; j < 2; j++) {
            const x = bx + Math.sin(now * 4 + j * Math.PI + i) * 8;
            ctx.globalAlpha = on * Math.sin(ph * Math.PI); ctx.fillStyle = j ? '#ffffff' : '#ff7ab8';
            ctx.beginPath(); ctx.arc(x, by, j ? 2 : 3, 0, TAU); ctx.fill();
          }
          glow(ctx, bx, by, 10, 10, '#ff7ab8', 0.5 * on * Math.sin(ph * Math.PI));
        }
      }
      // Al salir: tres latidos de luz rosa.
      const b = cl((k - 0.72) / 0.28);
      if (b > 0 && b < 1) {
        ctx.strokeStyle = '#ff9ac8'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const r = cl(b * 1.6 - i * 0.3);
          if (r <= 0 || r >= 1) continue;
          ctx.globalAlpha = 0.8 * (1 - r); ctx.beginPath(); ctx.ellipse(l.x, l.y - 36, 14 + 70 * r, 10 + 44 * r, 0, 0, TAU); ctx.stroke();
        }
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 40, 40, 46, '#ff7ab8', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { lakeCue(l, '#ff7ab8'); }
  });

  /* ---------- Azelf (482): un lago quieto; tres estelas azules lo cruzan rápido y él sale del agua de un salto ---------- */
  add(482, {
    title: 'Ser de la voluntad', dur: 2.0, short: 0.8, cue: 0.72,
    sprite(l, k) { return lakeSprite(k, 0.6, 0.7); },
    back(ctx, l, k, now) { ctx.save(); lake(ctx, l, k, now, '#4aa8ff'); ctx.restore(); },
    front(ctx, l, k, now) {
      ctx.save();
      // Tres pasadas en distintas direcciones, cada una una raya con la punta blanca.
      for (let i = 0; i < 3; i++) {
        const t0 = 0.24 + i * 0.1, f = cl((k - t0) / 0.09);
        if (f <= 0 || f >= 1) continue;
        const an = i * 2.1 + H(l.seed, i, 138) * 0.5, dx = Math.cos(an), dy = Math.sin(an) * 0.35;
        const hx = l.x + dx * (-130 + 260 * f), hy = l.y - 30 + dy * (-130 + 260 * f);
        for (let j = 0; j < 6; j++) {
          ctx.globalAlpha = (1 - j / 6) * 0.9; ctx.fillStyle = j ? '#4aa8ff' : '#ffffff';
          ctx.beginPath(); ctx.ellipse(hx - dx * j * 12, hy - dy * j * 12, 6 - j * 0.6, 3, an, 0, TAU); ctx.fill();
        }
        glow(ctx, hx, hy, 22, 14, '#4aa8ff', 0.6);
      }
      // Remolino rápido en el agua justo antes de saltar.
      const sw = cl((k - 0.5) / 0.08) * (1 - cl((k - 0.7) / 0.06));
      if (sw > 0) {
        ctx.fillStyle = '#d8f0ff';
        for (let i = 0; i < 10; i++) {
          const an = i / 10 * TAU + now * 9, d = 14 + 30 * (1 - sw * 0.5);
          ctx.globalAlpha = 0.8 * sw; ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * d, l.y + Math.sin(an) * d * 0.35, 4, 1.5, an + 1.6, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 40, 46, '#4aa8ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { lakeCue(l, '#4aa8ff'); if (G.FX) G.FX.burst(l.x, l.y - 30, '#4aa8ff', 14, 260); }
  });

  /* ---------- Dialga (483): un diamante late cada vez más despacio, el tiempo se para (ondas y piedras quietas) y vuelve ---------- */
  // «Tiempo» que pasa en la animación: normal, se frena hasta pararse, quieto y, al llegar él, corre deprisa.
  const dialT = k => (k < 0.3 ? k : k < 0.55 ? 0.3 + (k - 0.3) - (k - 0.3) * (k - 0.3) / 0.5 : k < 0.74 ? 0.425 : 0.425 + 3 * (k - 0.74));
  add(483, {
    title: 'Señor del tiempo', dur: 2.4, short: 0.95, cue: 0.74,
    sprite(l, k) { return { a: cl((k - 0.6) / 0.14), rise: 0, lift: 0, flash: k > 0.74 && k < 0.8, scan: k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const T = dialT(k), frz = cl((k - 0.45) / 0.1) * (1 - cl((k - 0.74) / 0.06));
      // Mientras está parado, el suelo se apaga en un azul gris.
      if (frz > 0) { ctx.globalAlpha = 0.3 * frz; ctx.fillStyle = '#2a3a5a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 150, 56, 0, 0, TAU); ctx.fill(); }
      // Ondas que salen y se quedan quietas.
      ctx.strokeStyle = '#7ac8ff'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const r = cl((T - 0.05 - i * 0.1) / 0.3);
        if (r <= 0 || r >= 1) continue;
        ctx.globalAlpha = 0.7 * (1 - r * 0.7) * (1 - cl((k - 0.9) / 0.1)); ctx.beginPath(); ctx.ellipse(l.x, l.y, 20 + 130 * r, 8 + 48 * r, 0, 0, TAU); ctx.stroke();
      }
      dropShadow(ctx, l, cl((k - 0.5) / 0.24), 0, 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const T = dialT(k), frz = cl((k - 0.45) / 0.1) * (1 - cl((k - 0.74) / 0.06));
      // Piedras que saltan del suelo, se paran en el aire y caen cuando el tiempo vuelve.
      for (let i = 0; i < 8; i++) {
        const t = T - 0.12 - H(l.seed, i, 141) * 0.08;
        if (t <= 0) continue;
        const h = 667 * t - 1111 * t * t;         // (sube y baja; parado cuando T no avanza)
        if (h < 0 && t > 0.2) continue;
        const x = l.x + (H(l.seed, i, 142) - 0.5) * 200 + (H(l.seed, i, 143) - 0.5) * 60 * t, y = l.y + (H(l.seed, i, 144) - 0.5) * 50 - Math.max(0, h);
        glow(ctx, x, y, 12, 10, '#7ac8ff', 0.5 * frz);
        ctx.globalAlpha = 1; ctx.fillStyle = '#4a5068'; ctx.fillRect(Math.round(x - 6), Math.round(y - 5), 12, 10);
        ctx.fillStyle = '#8a92b0'; ctx.fillRect(Math.round(x - 6), Math.round(y - 5), 12, 4);
        ctx.fillStyle = '#c8d4ee'; ctx.fillRect(Math.round(x - 5), Math.round(y - 5), 5, 2);
      }
      // El diamante: late, cada vez más despacio; parado, brilla quieto; al llegar se rompe en luz.
      const on = cl((k - 0.04) / 0.12) * (1 - cl((k - 0.74) / 0.04));
      if (on > 0) {
        const pu = 0.75 + 0.25 * Math.cos(T * 60), s = (9 + 3 * pu) * on, x = l.x, y = l.y - 64;
        glow(ctx, x, y, 30 * pu, 30 * pu, '#5ab0ff', 0.7 * on);
        ctx.globalAlpha = on; ctx.fillStyle = '#5ab0ff';
        ctx.beginPath(); ctx.moveTo(x, y - s * 1.4); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s * 1.4); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e6f4ff'; ctx.beginPath(); ctx.moveTo(x, y - s * 0.9); ctx.lineTo(x + s * 0.4, y); ctx.lineTo(x, y + s * 0.3); ctx.lineTo(x - s * 0.4, y); ctx.closePath(); ctx.fill();
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 56, 60, '#5ab0ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 60, '#c8e4ff', 26, 240);
      G.FX.ring(l.x, l.y, 10, 170, '#5ab0ff', 0.55, 6);
      shake(l, 1.2);
    }
  });

  /* ---------- Palkia (484): el aire se rasga en una grieta con estrellas; baja por ella y la grieta se cierra ---------- */
  add(484, {
    title: 'Señor del espacio', dur: 2.3, short: 0.9, cue: 0.75,
    sprite(l, k) { const e = cl((k - 0.45) / 0.3); return { a: cl((k - 0.45) / 0.1), rise: 0, lift: 80 * (1 - ease(e)), flash: k > 0.75 && k < 0.81 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.15 && k < 0.72 && Math.random() < dt * 20) {
        const an = Math.random() * TAU, d = 90 + Math.random() * 40;
        G.FX.px(l.x + Math.cos(an) * d, l.y - 80 + Math.sin(an) * d * 0.6, '#ffb0e0', { vx: -Math.cos(an) * 120, vy: -Math.sin(an) * 70, life: 0.6, drag: 0.95 });
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // El suelo se dobla: elipses que se estiran y encogen.
      const w = cl((k - 0.1) / 0.2) * (1 - cl((k - 0.85) / 0.15));
      if (w > 0) {
        ctx.strokeStyle = '#d888c8'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const r = 30 + i * 28, wv = 1 + 0.18 * Math.sin(now * 3 + i * 1.3);
          ctx.globalAlpha = 0.5 * w * (1 - i * 0.18); ctx.beginPath(); ctx.ellipse(l.x, l.y, r * wv, r * 0.38 / wv, 0, 0, TAU); ctx.stroke();
        }
      }
      // La grieta en el aire: se abre de arriba abajo, se ensancha y se cierra al llegar.
      const op = ease(cl((k - 0.1) / 0.22)) * (1 - ease(cl((k - 0.78) / 0.14)));
      if (op > 0) {
        const wd = ease(cl((k - 0.28) / 0.2)), cx = l.x, cy = l.y - 90, hh = 100 * op, ww = 3 + 34 * wd * op;
        glow(ctx, cx, cy, ww + 30, hh + 20, '#ff7ad0', 0.55 * op);
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#ff9ad8'; ctx.beginPath(); ctx.ellipse(cx, cy, ww + 3, hh + 3, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = '#160a2e'; ctx.beginPath(); ctx.ellipse(cx, cy, ww, hh, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 12; i++) {
          const v = H(l.seed, i, 145) * 2 - 1, y = cy + v * hh * 0.9, half = ww * Math.sqrt(Math.max(0, 1 - v * v)) * 0.85;
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now * 5 + i); star4(ctx, cx + (H(l.seed, i, 146) * 2 - 1) * half, y, i % 4 ? 1 : 2);
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      if (k > 0.75) glow(ctx, l.x, l.y - 40, 56, 60, '#ff9ad8', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#ffffff', 22, 240);
      G.FX.ring(l.x, l.y, 10, 170, '#ff9ad8', 0.55, 6);
      shake(l, 1.1);
    }
  });

  /* ---------- Heatran (485): un corro de púas de acero sale del suelo, se llena de magma y él trepa de dentro ---------- */
  add(485, {
    title: 'Corazón del volcán', dur: 2.3, short: 0.9, cue: 0.76,
    sprite(l, k) { return { a: k > 0.44 ? 1 : 0, rise: 1 - ease(cl((k - 0.46) / 0.3)), lift: 0, flash: k > 0.76 && k < 0.82 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.3 && k < 0.8 && Math.random() < dt * 22) G.FX.px(l.x + (Math.random() - 0.5) * 80, l.y - Math.random() * 8, Math.random() < 0.5 ? '#ffb040' : '#ff6a1a', { vx: (Math.random() - 0.5) * 50, vy: -60 - Math.random() * 60, life: 0.6, drag: 0.92 });
    },
    back(ctx, l, k, now) {
      ctx.save();
      const m = ease(cl((k - 0.22) / 0.22)), cool = cl((k - 0.82) / 0.18);
      // El magma de dentro.
      if (m > 0) {
        glow(ctx, l.x, l.y, 90 * m, 34 * m, '#ff7a1a', 0.6 * m * (1 - cool * 0.7));
        ctx.globalAlpha = 0.95 * (1 - cool * 0.6); ctx.fillStyle = cool > 0.5 ? '#7a2a10' : '#d8501a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 66 * m, 24 * m, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffb040'; ctx.beginPath(); ctx.ellipse(l.x, l.y - 1, 44 * m, 14 * m, 0, 0, TAU); ctx.fill();
        // Burbujas que crecen y revientan.
        ctx.fillStyle = '#ffe08a';
        for (let i = 0; i < 6; i++) {
          const ph = (now * 1.3 + H(l.seed, i, 151)) % 1;
          ctx.globalAlpha = (1 - ph) * (1 - cool); ctx.beginPath();
          ctx.arc(l.x + (H(l.seed, i, 152) - 0.5) * 90 * m, l.y + (H(l.seed, i, 153) - 0.5) * 28 * m, 1 + 4 * ph, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Las púas: salen del suelo una a una en corro; la punta se pone al rojo; al final se hunden.
      for (let i = 0; i < 10; i++) {
        const up = ease(cl((k - 0.06 - i * 0.015) / 0.12)) * (1 - ease(cl((k - 0.86) / 0.12)));
        if (up <= 0) continue;
        const an = i / 10 * TAU, x = l.x + Math.cos(an) * 80, y = l.y + Math.sin(an) * 30, h = (32 + 14 * H(l.seed, i, 154)) * up;
        if (Math.sin(an) < -0.2 && k > 0.4) ctx.globalAlpha = 0.75; else ctx.globalAlpha = 1;
        ctx.fillStyle = '#5a5a68'; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x, y - h); ctx.lineTo(x + 9, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9a9aac'; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x, y - h); ctx.lineTo(x + 3, y); ctx.closePath(); ctx.fill();
        const hot = cl((k - 0.3) / 0.2) * (1 - cl((k - 0.86) / 0.1));
        if (hot > 0) { ctx.globalAlpha = hot; ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(x - 3.5, y - h * 0.65); ctx.lineTo(x, y - h); ctx.lineTo(x + 3.5, y - h * 0.65); ctx.closePath(); ctx.fill(); }
      }
      // Gotas de magma que salpican mientras trepa.
      const sp = cl((k - 0.48) / 0.3);
      if (sp > 0 && sp < 1) {
        for (let i = 0; i < 8; i++) {
          const t = (sp * 2 + H(l.seed, i, 155)) % 1, dir = H(l.seed, i, 156) < 0.5 ? -1 : 1, v = 40 + 50 * H(l.seed, i, 157);
          ctx.globalAlpha = 1 - t; ctx.fillStyle = i % 2 ? '#ffb040' : '#ff6a1a';
          ctx.fillRect(Math.round(l.x + dir * v * t), Math.round(l.y - 20 - 90 * t + 120 * t * t), 3, 3);
        }
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 40, 54, 58, '#ff8a2a', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#ff7a1a', 26, 240);
      G.FX.burst(l.x, l.y - 30, '#c8c8d8', 12, 200);
      G.FX.ring(l.x, l.y, 10, 160, '#ffb040', 0.55, 6);
      shake(l, 1.2);
    }
  });

  /* ---------- Regigigas (486): tres luces (roca, hielo y acero) llegan y se funden; despierta despacio y pisa dos veces ---------- */
  BRAILLE[486] = [[-3, 0], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, 0], [-2, 1], [2, 1]];
  const GIGAS = ['#ff9a3a', '#7ad8ff', '#c8d0dc'];
  add(486, {
    title: 'Rey de los colosos', dur: 2.6, short: 1.0, cue: 0.8,
    sprite(l, k) { return { a: cl((k - 0.48) / 0.08), rise: 0, lift: 0, flash: (k > 0.48 && k < 0.52) || (k > 0.8 && k < 0.85), dark: k < 0.8 ? 1 : 0 }; },
    tick(l, k) {
      if (k > 0.87 && !l.g2) { l.g2 = 1; if (G.FX) G.FX.ring(l.x, l.y, 10, 200, '#ffe08a', 0.4, 6); shake(l, 1.3); }
    },
    back(ctx, l, k, now) {
      ctx.save();
      braille(ctx, l, k, '#ffe08a', now);
      dropShadow(ctx, l, cl((k - 0.4) / 0.2), 0, 0.4);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Las tres luces: llegan en espiral desde tres lados y se juntan en él.
      for (let i = 0; i < 3; i++) {
        const f = cl((k - 0.08 - i * 0.05) / 0.36);
        if (f <= 0 || k > 0.5) continue;
        const e = ease(f), an = Math.PI / 2 + i * TAU / 3 + e * 4, d = 200 * (1 - e) + 4;
        const x = l.x + Math.cos(an) * d, y = l.y - 44 + Math.sin(an) * d * 0.4;
        glow(ctx, x, y, 22, 22, GIGAS[i], 0.8);
        ctx.globalAlpha = 1; ctx.fillStyle = GIGAS[i]; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 2.5, 0, TAU); ctx.fill();
      }
      // Despierta: una fila de luces en su pecho se enciende una a una, despacio.
      const wake = cl((k - 0.52) / 0.06) * (1 - cl((k - 0.86) / 0.1));
      if (wake > 0) {
        for (let i = 0; i < 7; i++) {
          const on = cl((k - 0.55 - i * 0.03) / 0.04) * wake, x = l.x + (i - 3) * 7, y = l.y - 44 + Math.abs(i - 3) * 2;
          if (on <= 0) continue;
          glow(ctx, x, y, 8, 8, '#ffe08a', 0.8 * on);
          ctx.globalAlpha = on; ctx.fillStyle = i === 3 ? '#ff6a4a' : '#ffe08a'; ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
        }
      }
      if (k > 0.8) glow(ctx, l.x, l.y - 40, 60, 64, '#ffe08a', 0.28 * (1 - cl((k - 0.92) / 0.08) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y, '#c8c0a8', 26, 220);
      G.FX.ring(l.x, l.y, 10, 170, '#ffe08a', 0.55, 6);
      shake(l, 1.3);
    }
  });

  /* ---------- Giratina (487): se abre en el suelo un pozo oscuro, todo cae hacia arriba y él sale de dentro ---------- */
  add(487, {
    title: 'Sombra del mundo inverso', dur: 2.4, short: 0.95, cue: 0.78,
    sprite(l, k) { return { a: k > 0.38 ? 1 : 0, rise: 1 - ease(cl((k - 0.4) / 0.36)), lift: 0, flash: k > 0.78 && k < 0.84 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const p = ease(cl((k - 0.06) / 0.26)) * (1 - ease(cl((k - 0.8) / 0.18)));
      if (p > 0) {
        glow(ctx, l.x, l.y, 100 * p, 36 * p, '#c0303a', 0.5 * p);
        ctx.globalAlpha = 1; ctx.fillStyle = '#e0b040'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 86 * p + 4, 30 * p + 2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#a02030'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 86 * p + 2, 30 * p + 1, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0a0610'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 86 * p, 30 * p, 0, 0, TAU); ctx.fill();
        // Remolino dentro del pozo.
        ctx.fillStyle = '#3a1a4a';
        for (let i = 0; i < 8; i++) {
          const an = i / 8 * TAU - now * 1.6, d = (20 + 50 * ((i % 3) / 2)) * p;
          ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * d, l.y + Math.sin(an) * d * 0.35, 9 * p + 1, 2.5, an + 1.6, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const p = cl((k - 0.12) / 0.16) * (1 - cl((k - 0.82) / 0.16));
      if (p > 0) {
        // Brazos de sombra que suben del borde y se mecen.
        for (let i = 0; i < 6; i++) {
          const an = i / 6 * TAU + 0.3, x = l.x + Math.cos(an) * 70, y = l.y + Math.sin(an) * 24, h = (40 + 50 * H(l.seed, i, 161)) * p;
          const sw = Math.sin(now * 2.5 + i) * 8;
          ctx.globalAlpha = 0.75 * p; ctx.fillStyle = '#24102e';
          ctx.beginPath(); ctx.ellipse(x + sw * 0.5, y - h / 2, 6, h / 2, sw * 0.02, 0, TAU); ctx.fill();
          ctx.fillStyle = '#c0303a'; ctx.beginPath(); ctx.arc(x + sw, y - h, 2.5, 0, TAU); ctx.fill();
        }
        // Lo de alrededor «cae» hacia arriba.
        for (let i = 0; i < 14; i++) {
          const ph = (now * 0.7 + H(l.seed, i, 162)) % 1, x = l.x + (H(l.seed, i, 163) - 0.5) * 220, y = l.y + 20 - ph * ph * 220;
          ctx.globalAlpha = p * (1 - ph); ctx.fillStyle = i % 3 ? '#5a3a6a' : '#e0b040';
          ctx.fillRect(Math.round(x), Math.round(y), i % 3 ? 3 : 2, i % 3 ? 3 : 2);
        }
      }
      if (k > 0.78) glow(ctx, l.x, l.y - 40, 60, 64, '#c0303a', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#3a1a4a', 26, 240);
      G.FX.burst(l.x, l.y - 30, '#e0b040', 10, 200);
      G.FX.ring(l.x, l.y, 10, 170, '#c0303a', 0.55, 6);
      shake(l, 1.2);
    }
  });

  /* ---------- Cresselia (488): sale una luna creciente; baja de ella en curva dejando una cinta de luz rosa ---------- */
  const cresP = k => { const e = ease(cl((k - 0.24) / 0.5)); return { e, ox: (70 + 30 * Math.sin(e * TAU)) * (1 - e), lift: 170 * (1 - e) }; };
  add(488, {
    title: 'Luz de la luna creciente', dur: 2.3, short: 0.9, cue: 0.76,
    sprite(l, k) { const p = cresP(k); return { a: cl((k - 0.24) / 0.12), rise: 0, lift: p.lift, ox: p.ox, flash: k > 0.76 && k < 0.82 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // La luna: una media luna en el cielo que se enciende y se apaga al final.
      const m = cl((k - 0.02) / 0.18) * (1 - cl((k - 0.84) / 0.14));
      if (m > 0) {
        const cx = l.x + 70, cy = l.y - 180, r = 28;
        glow(ctx, cx, cy, 60, 60, '#ffe6b0', 0.6 * m);
        ctx.globalAlpha = m; ctx.fillStyle = '#fff2c8'; ctx.beginPath();
        for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 + i / 16 * Math.PI; ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); }
        for (let i = 16; i >= 0; i--) { const t = -Math.PI / 2 + i / 16 * Math.PI; ctx.lineTo(cx + Math.cos(t) * r * 0.3, cy + Math.sin(t) * r * 0.9); }
        ctx.closePath(); ctx.fill();
      }
      // Polvo de luna que cae.
      const d = cl((k - 0.1) / 0.15) * (1 - cl((k - 0.86) / 0.14));
      if (d > 0) {
        for (let i = 0; i < 12; i++) {
          const ph = (now * 0.35 + H(l.seed, i, 171)) % 1;
          ctx.globalAlpha = d * Math.sin(ph * Math.PI); ctx.fillStyle = i % 2 ? '#ffb0e0' : '#fff2c8';
          star4(ctx, l.x + (H(l.seed, i, 172) - 0.5) * 240, l.y - 200 + ph * 220, i % 3 ? 1 : 2);
        }
      }
      // Al llegar, una media luna de luz en el suelo.
      const g = cl((k - 0.7) / 0.1) * (1 - cl((k - 0.9) / 0.1));
      if (g > 0) {
        glow(ctx, l.x, l.y, 70, 24, '#ffb0e0', 0.5 * g);
        ctx.globalAlpha = 0.6 * g; ctx.fillStyle = '#ffb0e0'; ctx.beginPath();
        for (let i = 0; i <= 16; i++) { const t = i / 16 * Math.PI; ctx.lineTo(l.x + Math.cos(t) * 60, l.y + Math.sin(t) * 22); }
        for (let i = 16; i >= 0; i--) { const t = i / 16 * Math.PI; ctx.lineTo(l.x + Math.cos(t) * 60, l.y + Math.sin(t) * 10); }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // La cinta: por donde ha pasado, puntos rosas que se apagan.
      const p = cresP(k);
      if (p.e > 0 && k < 0.92) {
        for (let j = 1; j <= 10; j++) {
          const q = cresP(k - j * 0.018), a = (1 - j / 11) * (1 - cl((k - 0.8) / 0.12));
          if (q.e <= 0 || a <= 0) continue;
          ctx.globalAlpha = 0.8 * a; ctx.fillStyle = j % 2 ? '#ff9ae0' : '#fff2c8';
          ctx.beginPath(); ctx.ellipse(l.x + q.ox, l.y - q.lift - 40, 7 - j * 0.5, 3, 0, 0, TAU); ctx.fill();
        }
        glow(ctx, l.x + p.ox, l.y - p.lift - 40, 40, 30, '#ff9ae0', 0.4 * (1 - cl((k - 0.8) / 0.12)));
      }
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#ffb0e0', 22, 200);
      G.FX.ring(l.x, l.y, 10, 150, '#fff2c8', 0.5, 5);
      shake(l, 0.6);
    }
  });

  /* ---------- Phione (489): cae una gota grande, salpica en corona, se hace un charco y sale de él entre burbujas ---------- */
  add(489, {
    title: 'Gota del mar', dur: 1.9, short: 0.8, cue: 0.7,
    sprite(l, k) { return { a: k > 0.48 ? 1 : 0, rise: 1 - ease(cl((k - 0.5) / 0.2)), lift: 0, flash: k > 0.7 && k < 0.76 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const p = ease(cl((k - 0.3) / 0.18)) * (1 - ease(cl((k - 0.86) / 0.14)));
      if (p > 0) {
        glow(ctx, l.x, l.y, 60 * p, 22 * p, '#6ac8ff', 0.4 * p);
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#3a8ad0'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 48 * p, 17 * p, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#8ad8ff'; ctx.beginPath(); ctx.ellipse(l.x - 6 * p, l.y - 3 * p, 26 * p, 7 * p, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // La gota que cae.
      const f = cl((k - 0.04) / 0.26);
      if (f > 0 && f < 1) {
        const y = l.y - 220 + 220 * f * f;
        glow(ctx, l.x, y, 18, 22, '#6ac8ff', 0.5);
        ctx.globalAlpha = 1; ctx.fillStyle = '#6ac8ff';
        ctx.beginPath(); ctx.arc(l.x, y, 7, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(l.x - 6, y - 3); ctx.lineTo(l.x, y - 17); ctx.lineTo(l.x + 6, y - 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(l.x - 3), Math.round(y - 3), 2, 3);
      }
      // La corona de la salpicadura.
      const s = cl((k - 0.3) / 0.2);
      if (s > 0 && s < 1) {
        for (let i = 0; i < 10; i++) {
          const an = i / 10 * TAU, d = 10 + 40 * s, x = l.x + Math.cos(an) * d, y = l.y + Math.sin(an) * d * 0.35 - 50 * s + 60 * s * s;
          ctx.globalAlpha = 1 - s; ctx.fillStyle = i % 2 ? '#8ad8ff' : '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
        }
      }
      // Burbujas que suben del charco.
      const b = cl((k - 0.36) / 0.1) * (1 - cl((k - 0.84) / 0.14));
      if (b > 0) {
        ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const ph = (now * 0.9 + H(l.seed, i, 181)) % 1;
          ctx.globalAlpha = b * (1 - ph); ctx.beginPath();
          ctx.arc(l.x + (H(l.seed, i, 182) - 0.5) * 70 + Math.sin(now * 4 + i) * 3, l.y - ph * 80, 2 + 3 * H(l.seed, i, 183), 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 10, '#8ad8ff', 16, 160);
      G.FX.ring(l.x, l.y, 8, 110, '#6ac8ff', 0.45, 4);
      shake(l, 0.4);
    }
  });

  /* ---------- Manaphy (490): baja un huevo azul con el corazón rojo, late, se agrieta y se abre ---------- */
  add(490, {
    title: 'Príncipe del mar', dur: 2.2, short: 0.9, cue: 0.72,
    sprite(l, k) { return { a: k > 0.72 ? 1 : 0, rise: 0, lift: 40 * (1 - ease(cl((k - 0.72) / 0.22))), flash: k > 0.72 && k < 0.78 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const g = cl((k - 0.1) / 0.2) * (1 - cl((k - 0.88) / 0.12));
      if (g > 0) { glow(ctx, l.x, l.y, 80, 28, '#4ab0ff', 0.45 * g); ctx.globalAlpha = 0.35 * g; ctx.fillStyle = '#2a80c8'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 60, 20, 0, 0, TAU); ctx.fill(); }
      dropShadow(ctx, l, cl((k - 0.2) / 0.3) * (1 - cl((k - 0.75) / 0.1)), 0, 0.25);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El huevo: baja meciéndose y se queda flotando; late cada vez más deprisa.
      const d = ease(cl((k - 0.04) / 0.36)), y = l.y - 150 + 110 * d + Math.sin(now * 2) * 3 * d, x = l.x + Math.sin(k * 14) * 10 * (1 - d);
      if (k < 0.72) {
        const wob = k > 0.45 ? Math.sin(now * 30) * 0.12 * cl((k - 0.45) / 0.2) : 0, pu = 0.5 + 0.5 * Math.sin(k * (30 + 60 * k));
        glow(ctx, x, y, 26, 30, '#6ac8ff', 0.6);
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#4aa0e8'; ctx.beginPath(); ctx.ellipse(x, y, 15, 18, wob, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9ad8ff'; ctx.beginPath(); ctx.ellipse(x - 4, y - 6, 6, 7, wob, 0, TAU); ctx.fill();
        glow(ctx, x, y + 2, 12, 12, '#ff3a3a', 0.5 + 0.4 * pu);
        ctx.globalAlpha = 1; ctx.fillStyle = '#e8303a'; ctx.beginPath(); ctx.arc(x, y + 2, 4 + 1.5 * pu, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe060';
        for (let i = 0; i < 4; i++) { const an = i / 4 * TAU + 0.8; ctx.fillRect(Math.round(x + Math.cos(an) * 10), Math.round(y + Math.sin(an) * 12), 2, 2); }
        const cr = cl((k - 0.55) / 0.15);
        if (cr > 0) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.globalAlpha = cr; ctx.beginPath();
          jag(ctx, x - 12, y - 4, x + 12 * cr - 6, y - 8 + 8 * cr, 4, 3, l.seed); ctx.stroke();
        }
      } else {
        // Se abre: los trozos salen a los lados.
        const b = cl((k - 0.72) / 0.22);
        if (b < 1) {
          for (let i = 0; i < 4; i++) {
            const an = -Math.PI / 4 - i * Math.PI / 6 * (i % 2 ? -1 : 1) + (i > 1 ? Math.PI : 0), dd = 10 + 60 * ease(b);
            ctx.globalAlpha = 1 - b; ctx.fillStyle = '#4aa0e8';
            ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * dd, l.y - 40 + Math.sin(an) * dd + 50 * b * b, 8, 5, an, 0, TAU); ctx.fill();
          }
        }
        // Burbujas en corro.
        const bb = cl((k - 0.72) / 0.28);
        if (bb < 1) {
          ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 1;
          for (let i = 0; i < 10; i++) {
            const an = i / 10 * TAU, dd = 20 + 50 * ease(bb);
            ctx.globalAlpha = 1 - bb; ctx.beginPath(); ctx.arc(l.x + Math.cos(an) * dd, l.y - 30 + Math.sin(an) * dd * 0.5 - 20 * bb, 3, 0, TAU); ctx.stroke();
          }
        }
        glow(ctx, l.x, l.y - 36, 44, 48, '#6ac8ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      }
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#9ad8ff', 22, 200);
      G.FX.ring(l.x, l.y, 10, 130, '#4ab0ff', 0.5, 5);
      shake(l, 0.5);
    }
  });

  /* ---------- Darkrai (491): la oscuridad se extiende, una sombra con ojos asoma aquí y allá y sale del humo negro ---------- */
  const SHADOW = [0.2, 0.32, 0.44];
  add(491, {
    title: 'Señor de las pesadillas', dur: 2.3, short: 0.9, cue: 0.76,
    sprite(l, k) { return { a: cl((k - 0.62) / 0.14), rise: 0, lift: 0, flash: k > 0.76 && k < 0.8 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const f = ease(cl((k - 0.04) / 0.3)) * (1 - ease(cl((k - 0.84) / 0.16)));
      if (f > 0) {
        glow(ctx, l.x, l.y, 150 * f, 56 * f, '#3a1a5a', 0.5 * f);
        ctx.globalAlpha = 0.6 * f; ctx.fillStyle = '#0e0818'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 140 * f, 52 * f, 0, 0, TAU); ctx.fill();
        // Borde que se mueve como niebla.
        for (let i = 0; i < 10; i++) {
          const an = i / 10 * TAU + Math.sin(now + i) * 0.1, w = 1 + 0.15 * Math.sin(now * 2 + i * 2);
          ctx.globalAlpha = 0.5 * f; ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * 140 * f * w, l.y + Math.sin(an) * 52 * f, 22 * f, 9 * f, 0, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Sombras que asoman un momento: una figura oscura con un ojo azul.
      for (let i = 0; i < 3; i++) {
        const m = cl((k - SHADOW[i]) / 0.03) * (1 - cl((k - SHADOW[i] - 0.08) / 0.03));
        if (m <= 0) continue;
        const x = l.x + (i === 1 ? 1 : -1) * (70 + 50 * H(l.seed, i, 191)), y = l.y - 4 + (H(l.seed, i, 192) - 0.5) * 30;
        ctx.globalAlpha = 0.85 * m; ctx.fillStyle = '#120a1c';
        ctx.beginPath(); ctx.ellipse(x, y - 30, 14, 30, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y - 62, 10, 8, 0, 0, TAU); ctx.fill();
        glow(ctx, x + 3, y - 62, 8, 6, '#5ae0ff', m);
        ctx.globalAlpha = m; ctx.fillStyle = '#5ae0ff'; ctx.fillRect(Math.round(x + 1), Math.round(y - 63), 4, 2);
      }
      // Humo negro que se arremolina hacia el centro y se deshace al salir.
      const s = cl((k - 0.48) / 0.08) * (1 - cl((k - 0.78) / 0.12));
      if (s > 0) {
        for (let i = 0; i < 12; i++) {
          const an = i / 12 * TAU + now * 2.2, d = 16 + 60 * (1 - ease(cl((k - 0.48) / 0.3))) + 10 * (i % 2);
          ctx.globalAlpha = 0.75 * s; ctx.fillStyle = i % 3 ? '#1a1024' : '#3a1a5a';
          ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * d, l.y - 40 + Math.sin(an) * d * 0.7, 12, 9, 0, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#1a1024', 26, 220);
      G.FX.burst(l.x, l.y - 50, '#5ae0ff', 8, 160);
      G.FX.ring(l.x, l.y, 10, 160, '#6a3aa0', 0.55, 6);
      shake(l, 0.9);
    }
  });

  /* ---------- Shaymin (492): brotan flores en corro, crece un capullo que se abre y él está dentro; el viento se lleva los pétalos ---------- */
  add(492, {
    title: 'Flor de la gratitud', dur: 2.0, short: 0.8, cue: 0.66,
    sprite(l, k) { return { a: cl((k - 0.52) / 0.08), rise: 0, lift: 0, flash: k > 0.66 && k < 0.72 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const g = ease(cl((k - 0.04) / 0.2)) * (1 - cl((k - 0.88) / 0.12) * 0.6);
      if (g > 0) { ctx.globalAlpha = 0.55 * g; ctx.fillStyle = '#5aa83a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 100 * g, 36 * g, 0, 0, TAU); ctx.fill(); }
      // Flores que brotan del centro hacia fuera.
      for (let i = 0; i < 14; i++) {
        const an = H(l.seed, i, 201) * TAU, d = 30 + 70 * H(l.seed, i, 202), on = ease(cl((k - 0.08 - d / 100 * 0.3) / 0.08)) * (1 - cl((k - 0.9) / 0.1));
        if (on <= 0) continue;
        const x = l.x + Math.cos(an) * d, y = l.y + Math.sin(an) * d * 0.36, s = 3 * on;
        ctx.globalAlpha = 1; ctx.fillStyle = i % 3 ? '#ff9ac8' : '#ffffff';
        for (let j = 0; j < 5; j++) { const b = j / 5 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(b) * s, y + Math.sin(b) * s * 0.7, s * 0.8, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#ffe060'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
      }
      // El capullo abierto: cinco pétalos grandes alrededor de él.
      const o = ease(cl((k - 0.48) / 0.14)) * (1 - cl((k - 0.66) / 0.04));
      if (o > 0) {
        for (let i = 0; i < 5; i++) {
          const an = -Math.PI / 2 + i / 5 * TAU, d = 8 + 22 * o;
          ctx.globalAlpha = 1; ctx.fillStyle = i % 2 ? '#ff9ac8' : '#ffb8d8';
          ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * d, l.y - 20 + Math.sin(an) * d * 0.7, 9 + 5 * o, 15, an + Math.PI / 2, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El capullo cerrado crece del suelo.
      const c = ease(cl((k - 0.16) / 0.26)), op = cl((k - 0.48) / 0.08);
      if (c > 0 && op < 1) {
        const y = l.y - 4 - 18 * c;
        ctx.globalAlpha = 1 - op; ctx.fillStyle = '#3a8a2a'; ctx.fillRect(Math.round(l.x - 1), Math.round(y), 3, Math.round(l.y - y));
        ctx.fillStyle = '#5ab83a'; ctx.beginPath(); ctx.ellipse(l.x, y, 6 + 8 * c, 10 + 12 * c, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff9ac8'; ctx.beginPath(); ctx.ellipse(l.x, y - 6 - 8 * c, 3 + 4 * c, 4 + 5 * c, 0, 0, TAU); ctx.fill();
        glow(ctx, l.x, y, 24, 28, '#ff9ac8', 0.4 * c * (1 - op));
      }
      // El viento se lleva los pétalos y semillas hacia un lado.
      const w = cl((k - 0.66) / 0.32);
      if (w > 0 && w < 1) {
        for (let i = 0; i < 12; i++) {
          const t = cl(w * 1.3 - H(l.seed, i, 203) * 0.3), x = l.x + (H(l.seed, i, 204) - 0.5) * 50 + 200 * t, y = l.y - 20 - H(l.seed, i, 205) * 40 - 60 * t + Math.sin(t * 12 + i) * 8;
          ctx.globalAlpha = 1 - t; ctx.fillStyle = i % 3 ? '#ff9ac8' : '#ffffff';
          ctx.beginPath(); ctx.ellipse(x, y, 4, 2, t * 8 + i, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#ff9ac8', 22, 200);
      G.FX.ring(l.x, l.y, 10, 130, '#8ae06a', 0.5, 5);
      shake(l, 0.4);
    }
  });

  /* ---------- Arceus (493): un aro de oro en el cielo suelta luces de todos los tipos en corro y él baja por un haz ---------- */
  const ARC_COLS = ['#a8a878', '#f08030', '#6890f0', '#f8d030', '#78c850', '#98d8d8', '#c03028', '#a040a0', '#e0c068',
    '#a890f0', '#f85888', '#a8b820', '#b8a038', '#705898', '#7038f8', '#705848', '#b8b8d0', '#ee99ac'];
  add(493, {
    title: 'El que dio forma al mundo', dur: 2.6, short: 1.0, cue: 0.78,
    sprite(l, k) { const e = cl((k - 0.5) / 0.28); return { a: cl((k - 0.5) / 0.1), rise: 0, lift: 150 * (1 - ease(e)), flash: k > 0.78 && k < 0.84 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Las luces de los tipos, en corro en el suelo (llegan desde el aro).
      const fl = cl((k - 0.78) / 0.04) * (1 - cl((k - 0.82) / 0.14));
      for (let i = 0; i < 18; i++) {
        const t0 = 0.16 + i * 0.018, f = cl((k - t0) / 0.14), out = cl((k - 0.86) / 0.12);
        if (f < 1 || out >= 1) continue;
        const an = i / 18 * TAU, r = 1 + 0.35 * ease(cl((k - 0.78) / 0.14)), x = l.x + Math.cos(an) * 90 * r, y = l.y + Math.sin(an) * 32 * r;
        glow(ctx, x, y, 12 + 10 * fl, 8 + 6 * fl, ARC_COLS[i], 0.7 * (1 - out));
        ctx.globalAlpha = 1 - out; ctx.fillStyle = ARC_COLS[i]; ctx.beginPath(); ctx.ellipse(x, y, 5, 3, 0, 0, TAU); ctx.fill();
      }
      // Corro de oro en el suelo, después.
      const g = cl((k - 0.76) / 0.08) * (1 - cl((k - 0.88) / 0.12));
      if (g > 0) { ctx.globalAlpha = 0.8 * g; ctx.strokeStyle = '#ffd860'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(l.x, l.y, 70, 25, 0, 0, TAU); ctx.stroke(); }
      dropShadow(ctx, l, cl((k - 0.5) / 0.28), 0, 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El aro de oro en lo alto.
      const ar = cl((k - 0.04) / 0.14) * (1 - cl((k - 0.82) / 0.14)), ay = l.y - 180;
      if (ar > 0) {
        glow(ctx, l.x, ay, 80, 30, '#ffd860', 0.6 * ar);
        ctx.globalAlpha = ar; ctx.strokeStyle = '#ffd860'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(l.x, ay, 60, 16, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#fff2b0';
        for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + now * 1.2; ctx.fillRect(Math.round(l.x + Math.cos(an) * 60 - 1), Math.round(ay + Math.sin(an) * 16 - 1), 3, 3); }
      }
      // Las luces caen en arco desde el aro hasta su sitio en el corro.
      for (let i = 0; i < 18; i++) {
        const t0 = 0.16 + i * 0.018, f = cl((k - t0) / 0.14);
        if (f <= 0 || f >= 1) continue;
        const an = i / 18 * TAU, e = ease(f), sx = l.x + Math.cos(an) * 60, sy = ay + Math.sin(an) * 16, ex = l.x + Math.cos(an) * 90, ey = l.y + Math.sin(an) * 32;
        const x = sx + (ex - sx) * e, y = sy + (ey - sy) * e - Math.sin(e * Math.PI) * 40;
        glow(ctx, x, y, 12, 12, ARC_COLS[i], 0.7);
        ctx.globalAlpha = 1; ctx.fillStyle = ARC_COLS[i]; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
      }
      // El haz de oro por el que baja.
      const bm = cl((k - 0.46) / 0.08) * (1 - cl((k - 0.8) / 0.1));
      if (bm > 0) {
        glow(ctx, l.x, l.y - 90, 40, 100, '#ffd860', 0.5 * bm);
        ctx.globalAlpha = 0.25 * bm; ctx.fillStyle = '#ffe890'; ctx.fillRect(Math.round(l.x - 18), Math.round(ay), 36, Math.round(l.y - ay));
        ctx.globalAlpha = 0.4 * bm; ctx.fillStyle = '#fff6d0'; ctx.fillRect(Math.round(l.x - 6), Math.round(ay), 12, Math.round(l.y - ay));
      }
      if (k > 0.78) glow(ctx, l.x, l.y - 40, 60, 64, '#ffd860', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#ffd860', 28, 260);
      G.FX.ring(l.x, l.y, 10, 190, '#ffd860', 0.6, 6);
      shake(l, 1.3);
    }
  });

  return {
    add, def, GENERIC,
    /** dex que ya tienen animación propia. */
    get own() { return Object.keys(ANIMS).map(Number); },
    /** Título de la presentación (el propio o el de siempre), ya traducido. */
    title(dex) { const t = (ANIMS[dex] && ANIMS[dex].title) || 'Guardián de la grieta'; return G.T ? G.T(t) : t; }
  };
})();
