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

  return {
    add, def, GENERIC,
    /** dex que ya tienen animación propia. */
    get own() { return Object.keys(ANIMS).map(Number); },
    /** Título de la presentación (el propio o el de siempre), ya traducido. */
    title(dex) { const t = (ANIMS[dex] && ANIMS[dex].title) || 'Guardián de la grieta'; return G.T ? G.T(t) : t; }
  };
})();
