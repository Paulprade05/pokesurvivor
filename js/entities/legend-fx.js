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
        ctx.fillStyle = '#5a5a68'; ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x, y - h); ctx.lineTo(x + 12, y); ctx.closePath(); ctx.fill();
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

  // ================= tanda 4 (25-11-2026): quinta generación =================

  /** Nube en la que van montados (cinco bolas; dark: más oscura por debajo). */
  function cloud(ctx, x, y, s, col, dark) {
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(x, y + 4 * s, 30 * s, 9 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + (i - 2) * 12 * s, y - (i % 2 ? 4 : 0) * s, 13 * s, 9 * s, 0, 0, TAU); ctx.fill(); }
  }
  /** Hoja de luz (espada): rombo largo de punta fina, con el filo claro. */
  function blade(ctx, x, y, len, w, ang, col, edge) {
    const c = Math.cos(ang), s = Math.sin(ang), nx = -s, ny = c;
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + c * len * 0.3 + nx * w, y + s * len * 0.3 + ny * w); ctx.lineTo(x + c * len, y + s * len); ctx.lineTo(x + c * len * 0.3 - nx * w, y + s * len * 0.3 - ny * w);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = edge; ctx.beginPath();
    ctx.moveTo(x + c * len * 0.1, y + s * len * 0.1); ctx.lineTo(x + c * len * 0.3 + nx * w * 0.3, y + s * len * 0.3 + ny * w * 0.3); ctx.lineTo(x + c * len * 0.95, y + s * len * 0.95);
    ctx.closePath(); ctx.fill();
  }

  /* ---------- Victini (494): dos llamas suben en V, estalla una lluvia de chispas de colores y sale de un salto ---------- */
  add(494, {
    title: 'Estrella de la victoria', dur: 1.9, short: 0.8, cue: 0.62,
    sprite(l, k) { const h = cl((k - 0.5) / 0.3); return { a: cl((k - 0.5) / 0.06), rise: 0, lift: 34 * Math.sin(Math.PI * h), flash: k > 0.62 && k < 0.68 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // La V: dos llamas que suben en diagonal desde sus pies.
      const v = ease(cl((k - 0.08) / 0.3)) * (1 - cl((k - 0.66) / 0.14));
      if (v > 0) {
        for (const d of [-1, 1]) {
          for (let i = 0; i < 9; i++) {
            const t = i / 8 * v, x = l.x + d * 70 * t, y = l.y - 120 * t, r = (9 - i * 0.6) * (0.8 + 0.2 * Math.sin(now * 14 + i));
            glow(ctx, x, y, r * 2.2, r * 2.2, '#ff8a2a', 0.5 * v);
            ctx.globalAlpha = v; ctx.fillStyle = i % 2 ? '#ffb040' : '#ff6a1a'; ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, TAU); ctx.fill();
            ctx.fillStyle = '#ffe890'; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r * 0.4), 0, TAU); ctx.fill();
          }
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Chispas de colores que caen desde arriba de la V.
      const c = cl((k - 0.4) / 0.5);
      if (c > 0 && c < 1) {
        const cols = ['#ff6a1a', '#ffd840', '#ffffff', '#ff4a6a'];
        for (let i = 0; i < 22; i++) {
          const t = cl(c * 1.4 - H(l.seed, i, 211) * 0.4), x = l.x + (H(l.seed, i, 212) - 0.5) * 220 * t, y = l.y - 120 - 60 * Math.sin(t * Math.PI * 0.6) + 150 * t * t;
          if (t <= 0 || t >= 1) continue;
          ctx.globalAlpha = 1 - t; ctx.fillStyle = cols[i % 4];
          ctx.fillRect(Math.round(x), Math.round(y), 3, i % 2 ? 3 : 2);
        }
      }
      if (k > 0.62) glow(ctx, l.x, l.y - 30, 40, 44, '#ffb040', 0.3 * (1 - cl((k - 0.88) / 0.12) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#ffd840', 22, 220);
      G.FX.ring(l.x, l.y, 8, 120, '#ff8a2a', 0.45, 5);
      shake(l, 0.5);
    }
  });

  /* ---------- Cobalion (638): una espada de luz de acero cae del cielo, se clava y de ella sale él ---------- */
  add(638, {
    title: 'Espada de acero', dur: 2.1, short: 0.85, cue: 0.5,
    sprite(l, k) { return { a: cl((k - 0.56) / 0.18), rise: 0, lift: 0, flash: k > 0.5 && k < 0.56, scan: k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const g = cl((k - 0.48) / 0.04) * (1 - cl((k - 0.86) / 0.14));
      if (g > 0) {
        ctx.strokeStyle = '#2a3040'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8 * g; ctx.beginPath();
        for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + H(l.seed, i, 221); jag(ctx, l.x, l.y, l.x + Math.cos(an) * 70, l.y + Math.sin(an) * 26, 4, 4, l.seed + i); }
        ctx.stroke();
        glow(ctx, l.x, l.y, 80, 28, '#7ab8e8', 0.4 * g);
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // La espada: baja de punta, se clava al llegar y se deshace en luz mientras él aparece.
      const f = cl((k - 0.12) / 0.38), out = cl((k - 0.58) / 0.18);
      if (f > 0 && out < 1) {
        const tip = l.y - 300 + 300 * f * f, len = 150;
        glow(ctx, l.x, tip - len / 2, 22, len / 2 + 10, '#9ad0ff', 0.6 * (1 - out));
        ctx.globalAlpha = 1 - out;
        blade(ctx, l.x, tip, len, 14, -Math.PI / 2, '#8aa8c8', '#eaf4ff');
        ctx.fillStyle = '#3a4a6a'; ctx.fillRect(Math.round(l.x - 20), Math.round(tip - len - 5), 40, 7);
        ctx.fillStyle = '#5a6a8a'; ctx.fillRect(Math.round(l.x - 3), Math.round(tip - len - 20), 6, 16);
      }
      if (k > 0.5) glow(ctx, l.x, l.y - 40, 50, 56, '#7ab8e8', 0.28 * (1 - cl((k - 0.88) / 0.12) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 6, '#eaf4ff', 24, 240);
      G.FX.ring(l.x, l.y, 10, 150, '#7ab8e8', 0.5, 5);
      shake(l, 1.0);
    }
  });

  /* ---------- Terrakion (639): un muro de rocas se levanta; llega a la carga levantando polvo y lo revienta ---------- */
  add(639, {
    title: 'Espada de roca', dur: 2.0, short: 0.8, cue: 0.64,
    sprite(l, k) { const e = cl((k - 0.36) / 0.28); return { a: cl((k - 0.36) / 0.06), rise: 0, lift: 0, ox: -240 * (1 - e), flash: k > 0.64 && k < 0.7 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.36 && k < 0.64 && Math.random() < dt * 40) { const e = cl((k - 0.36) / 0.28); G.FX.px(l.x - 240 * (1 - e) - 10, l.y - 2, '#b89a70', { vx: -40 - Math.random() * 40, vy: -20 - Math.random() * 30, life: 0.5, drag: 0.9 }); }
    },
    back(ctx, l, k, now) { ctx.save(); dropShadow(ctx, l, cl((k - 0.36) / 0.1) * (1 - cl((k - 0.64) / 0.1)), -240 * (1 - cl((k - 0.36) / 0.28)), 0.3); ctx.restore(); },
    front(ctx, l, k, now) {
      ctx.save();
      // El muro: rocas que salen del suelo delante de él (a su izquierda, por donde llega).
      for (let i = 0; i < 9; i++) {
        const row = i < 4 ? 0 : i < 7 ? 1 : 2, col = row === 0 ? i : row === 1 ? i - 4 : i - 7, n = row === 0 ? 4 : row === 1 ? 3 : 2;
        const bx = l.x - 34, by = l.y + (col - (n - 1) / 2) * 0, x = bx + (col - (n - 1) / 2) * 6, y0 = l.y + 10 - (col - (n - 1) / 2) * 26, s = 15 + 4 * H(l.seed, i, 231);
        const up = ease(cl((k - 0.06 - i * 0.02) / 0.14)), b = cl((k - 0.64) / 0.28);
        if (up <= 0 || b >= 1) continue;
        const yy = y0 - row * 22 * up, xx = x - 4 * row;
        if (b > 0) {
          const d = 40 + 160 * ease(b) * (0.6 + 0.4 * H(l.seed, i, 232));
          ctx.globalAlpha = 1 - b; rock(ctx, xx + d, yy - 70 * Math.sin(b * Math.PI) * H(l.seed, i, 233) + 40 * b, s * (1 - 0.4 * b));
        } else { ctx.globalAlpha = 1; rock(ctx, xx, yy + (1 - up) * 20, s * up); }
      }
      if (k > 0.64) glow(ctx, l.x, l.y - 30, 46, 50, '#d8a050', 0.25 * (1 - cl((k - 0.88) / 0.12) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x - 30, l.y - 20, '#a08868', 30, 260);
      G.FX.ring(l.x, l.y, 10, 150, '#d8a050', 0.5, 5);
      shake(l, 1.2);
    }
  });

  /* ---------- Virizion (640): un corro de hojas como espadas gira; salta desde lo alto por en medio y las hojas se van ---------- */
  add(640, {
    title: 'Espada de hierba', dur: 2.0, short: 0.8, cue: 0.68,
    sprite(l, k) { const e = cl((k - 0.4) / 0.28); return { a: cl((k - 0.4) / 0.06), rise: 0, lift: 140 * (1 - e) + 50 * Math.sin(Math.PI * e), ox: 120 * (1 - ease(e)), flash: k > 0.68 && k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const g = cl((k - 0.06) / 0.2) * (1 - cl((k - 0.86) / 0.14));
      if (g > 0) { ctx.globalAlpha = 0.45 * g; ctx.fillStyle = '#4a9a3a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 80 * g, 28 * g, 0, 0, TAU); ctx.fill(); }
      dropShadow(ctx, l, cl((k - 0.4) / 0.28), 120 * (1 - ease(cl((k - 0.4) / 0.28))), 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const on = cl((k - 0.08) / 0.14), sc = cl((k - 0.68) / 0.3);
      if (on > 0 && sc < 1) {
        for (let i = 0; i < 8; i++) {
          const an = i / 8 * TAU + now * 2.4 + sc * 3, d = (70 + 120 * ease(sc)) * on, x = l.x + Math.cos(an) * d, y = l.y - 30 + Math.sin(an) * d * 0.38;
          glow(ctx, x, y, 16, 12, '#8ae06a', 0.5 * (1 - sc));
          ctx.globalAlpha = 1 - sc; blade(ctx, x - Math.cos(an + 1.6) * 14, y - Math.sin(an + 1.6) * 6, 30, 5, an + 1.6, '#4ab83a', '#c8f0a0');
        }
      }
      if (k > 0.68) glow(ctx, l.x, l.y - 34, 44, 48, '#8ae06a', 0.28 * (1 - cl((k - 0.88) / 0.12) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#8ae06a', 24, 220);
      G.FX.ring(l.x, l.y, 10, 140, '#c8f0a0', 0.5, 5);
      shake(l, 0.7);
    }
  });

  /* ---------- Tornadus (641): se forma un tornado, las hojas giran en él y baja de lo alto mientras se deshace ---------- */
  add(641, {
    title: 'Señor del viento', dur: 2.2, short: 0.9, cue: 0.74,
    sprite(l, k) { const e = cl((k - 0.5) / 0.24); return { a: cl((k - 0.48) / 0.08), rise: 0, lift: 150 * (1 - ease(e)), flash: k > 0.74 && k < 0.8 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.15 && k < 0.7 && Math.random() < dt * 26) G.FX.px(l.x + (Math.random() - 0.5) * 100, l.y - Math.random() * 10, '#d8e8c8', { vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 60, life: 0.5, drag: 0.9 });
    },
    back(ctx, l, k, now) {
      ctx.save();
      const f = ease(cl((k - 0.08) / 0.26)) * (1 - ease(cl((k - 0.7) / 0.2)));
      if (f > 0) {
        // El embudo: anillos que se ensanchan hacia arriba y giran.
        for (let i = 0; i < 9; i++) {
          const t = i / 8, y = l.y - 170 * t * f, rx = (16 + 70 * t * t) * f, wob = Math.sin(now * 6 + i * 0.9) * 10 * t;
          ctx.globalAlpha = 0.5 + 0.3 * f; ctx.fillStyle = i % 2 ? '#8a9aaa' : '#6a7a8c';
          ctx.beginPath(); ctx.ellipse(l.x + wob, y, rx, rx * 0.28 + 2, 0, 0, TAU); ctx.fill();
        }
        glow(ctx, l.x, l.y - 80, 80 * f, 100 * f, '#c8f0e0', 0.3 * f);
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const f = cl((k - 0.14) / 0.14) * (1 - cl((k - 0.7) / 0.2));
      if (f > 0) {
        for (let i = 0; i < 12; i++) {
          const t = H(l.seed, i, 241), an = now * (5 + t * 3) + i, y = l.y - 160 * t, rx = 16 + 70 * t * t;
          if (Math.sin(an) < 0) continue;            // (sólo las de delante; las de detrás las tapa el embudo)
          ctx.globalAlpha = f; ctx.fillStyle = i % 3 ? '#6ab84a' : '#c8a060';
          ctx.beginPath(); ctx.ellipse(l.x + Math.cos(an) * rx, y + Math.sin(an) * rx * 0.28, 4, 2, an, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 50, 56, '#8ad8a0', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#d8e8c8', 24, 240);
      G.FX.ring(l.x, l.y, 10, 170, '#8ad8a0', 0.5, 5);
      shake(l, 0.9);
    }
  });

  /* ---------- Thundurus (642): un corro de rayos cae uno tras otro alrededor y él baja montado en su nube ---------- */
  add(642, {
    title: 'Nube de tormenta', dur: 2.2, short: 0.9, cue: 0.74,
    sprite(l, k) { const e = cl((k - 0.36) / 0.38); return { a: cl((k - 0.36) / 0.06), rise: 0, lift: 160 * (1 - ease(e)), flash: k > 0.74 && k < 0.8 }; },
    tick(l, k) {
      for (let i = 0; i < 6; i++) {
        const t = 0.14 + i * 0.07, bit = 1 << i;
        if (k > t && !((l.bolts || 0) & bit)) { l.bolts = (l.bolts || 0) | bit; const an = i / 6 * TAU; if (G.FX) G.FX.burst(l.x + Math.cos(an) * 110, l.y + Math.sin(an) * 40, '#fff27a', 8, 140); shake(l, 0.3); }
      }
    },
    back(ctx, l, k, now) {
      ctx.save();
      // Marcas en el suelo donde ha caído cada rayo.
      for (let i = 0; i < 6; i++) {
        const t = 0.14 + i * 0.07, m = cl((k - t) / 0.02) * (1 - cl((k - 0.86) / 0.14));
        if (m <= 0) continue;
        const an = i / 6 * TAU, x = l.x + Math.cos(an) * 110, y = l.y + Math.sin(an) * 40;
        ctx.globalAlpha = 0.6 * m; ctx.fillStyle = '#2a2a3a'; ctx.beginPath(); ctx.ellipse(x, y, 14, 5, 0, 0, TAU); ctx.fill();
        glow(ctx, x, y, 22, 9, '#fff27a', 0.5 * m * (0.6 + 0.4 * Math.sin(now * 20 + i)));
      }
      dropShadow(ctx, l, cl((k - 0.36) / 0.38), 0, 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Cada rayo: un instante, del cielo a su marca.
      for (let i = 0; i < 6; i++) {
        const t = 0.14 + i * 0.07, b = cl((k - t) / 0.04);
        if (b <= 0 || b >= 1) continue;
        const an = i / 6 * TAU, x = l.x + Math.cos(an) * 110, y = l.y + Math.sin(an) * 40;
        glow(ctx, x, y - 90, 26, 110, '#fff27a', 0.7 * (1 - b));
        ctx.globalAlpha = 1 - b; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); jag(ctx, x + 10, y - 200, x, y, 6, 10, l.seed + i); ctx.stroke();
        ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // Su nube, debajo de él mientras baja.
      const e = cl((k - 0.36) / 0.38), cv = cl((k - 0.36) / 0.06) * (1 - cl((k - 0.74) / 0.16));
      if (cv > 0) { ctx.globalAlpha = 0.9 * cv; cloud(ctx, l.x, l.y - 160 * (1 - ease(e)) + 4, 1.1, '#7a8aa8', '#4a5478'); }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 50, 56, '#fff27a', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#fff27a', 24, 240);
      G.FX.ring(l.x, l.y, 10, 170, '#8a9ad8', 0.5, 5);
      shake(l, 1.0);
    }
  });

  /* ---------- Reshiram (643): un aro de llamas blancas gira cada vez más deprisa y una ola de fuego blanco lo descubre ---------- */
  add(643, {
    title: 'Llama de la verdad', dur: 2.3, short: 0.9, cue: 0.66,
    sprite(l, k) { return { a: k > 0.6 ? 1 : 0, rise: 0, lift: 0, flash: k > 0.66 && k < 0.72 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const g = cl((k - 0.6) / 0.08) * (1 - cl((k - 0.86) / 0.14));
      if (g > 0) { glow(ctx, l.x, l.y, 110, 40, '#bfe6ff', 0.5 * g); ctx.globalAlpha = 0.5 * g; ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 80, 28, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El aro: llamas blancas que giran en el aire y se aceleran.
      const r = cl((k - 0.06) / 0.14) * (1 - cl((k - 0.58) / 0.06)), sp = 2 + 12 * cl((k - 0.1) / 0.45);
      if (r > 0) {
        const cy = l.y - 70;
        glow(ctx, l.x, cy, 70, 40, '#bfe6ff', 0.6 * r);
        for (let i = 0; i < 12; i++) {
          const an = i / 12 * TAU + k * sp * 3, x = l.x + Math.cos(an) * 56, y = cy + Math.sin(an) * 20, fr = 7 + 2 * Math.sin(now * 12 + i);
          ctx.globalAlpha = r; ctx.fillStyle = '#9ad0ff'; ctx.beginPath(); ctx.ellipse(x, y - fr * 0.4, fr * 0.7, fr, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, y - fr * 0.2, fr * 0.4, fr * 0.6, 0, 0, TAU); ctx.fill();
        }
      }
      // La ola: una pared de fuego blanco que cruza de izquierda a derecha justo cuando aparece.
      const w = cl((k - 0.54) / 0.24);
      if (w > 0 && w < 1) {
        const x0 = l.x - 220 + 440 * ease(w);
        glow(ctx, x0, l.y - 40, 40, 80, '#ffffff', 0.7 * (1 - w));
        for (let i = 0; i < 10; i++) {
          const y = l.y + 30 - i * 12, h = 14 + 6 * Math.sin(now * 16 + i);
          ctx.globalAlpha = (1 - w) * (1 - i / 12); ctx.fillStyle = i % 2 ? '#bfe6ff' : '#ffffff';
          ctx.beginPath(); ctx.ellipse(x0 + Math.sin(i * 1.7 + now * 8) * 6, y, 12, h * 0.6, 0, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.66) glow(ctx, l.x, l.y - 40, 54, 60, '#bfe6ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#ffffff', 26, 250);
      G.FX.ring(l.x, l.y, 10, 170, '#9ad0ff', 0.55, 6);
      shake(l, 1.1);
    }
  });

  /* ---------- Zekrom (644): un aro de rayos azules gira en el aire, echa chispas al suelo y él cae de golpe por un rayo ---------- */
  add(644, {
    title: 'Rayo del ideal', dur: 2.3, short: 0.9, cue: 0.7,
    sprite(l, k) { const e = cl((k - 0.56) / 0.14); return { a: cl((k - 0.56) / 0.04), rise: 0, lift: 240 * (1 - e * e), flash: k > 0.7 && k < 0.76 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const g = cl((k - 0.7) / 0.03) * (1 - cl((k - 0.86) / 0.14));
      if (g > 0) {
        ctx.strokeStyle = '#4ab0ff'; ctx.lineWidth = 2; ctx.globalAlpha = g; ctx.beginPath();
        for (let i = 0; i < 7; i++) { const an = i / 7 * TAU + H(l.seed, i, 251); jag(ctx, l.x, l.y, l.x + Math.cos(an) * 90, l.y + Math.sin(an) * 32, 5, 6, l.seed + i); }
        ctx.stroke();
        glow(ctx, l.x, l.y, 100, 36, '#4ab0ff', 0.5 * g);
      }
      dropShadow(ctx, l, cl((k - 0.56) / 0.14), 0, 0.35);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const r = cl((k - 0.06) / 0.14) * (1 - cl((k - 0.56) / 0.06)), cy = l.y - 120;
      if (r > 0) {
        glow(ctx, l.x, cy, 70, 34, '#4ab0ff', 0.6 * r);
        ctx.globalAlpha = r; ctx.strokeStyle = '#2a6ad8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(l.x, cy, 54, 18, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#bfe6ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(l.x, cy, 54, 18, 0, 0, TAU); ctx.stroke();
        // Chispas que bajan del aro al suelo, cada vez más seguidas.
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#bfe6ff';
        for (let i = 0; i < 4; i++) {
          const ph = Math.floor(now * (6 + 10 * k) + i * 7), an = H(l.seed, ph, 252) * TAU, gx = l.x + (H(l.seed, ph, 253) - 0.5) * 200, gy = l.y + (H(l.seed, ph, 254) - 0.5) * 60;
          if (H(l.seed, ph, 255) > 0.4 + k) continue;
          ctx.globalAlpha = 0.9 * r; ctx.beginPath(); jag(ctx, l.x + Math.cos(an) * 54, cy + Math.sin(an) * 18, gx, gy, 5, 8, ph); ctx.stroke();
        }
      }
      // El rayo por el que cae.
      const b = cl((k - 0.56) / 0.18);
      if (b > 0 && b < 1) {
        glow(ctx, l.x, l.y - 120, 30, 140, '#4ab0ff', 0.8 * (1 - b));
        ctx.globalAlpha = 0.8 * (1 - b); ctx.fillStyle = '#bfe6ff'; ctx.fillRect(Math.round(l.x - 5), Math.round(l.y - 260), 10, 260);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(l.x - 2), Math.round(l.y - 260), 4, 260);
      }
      if (k > 0.7) glow(ctx, l.x, l.y - 40, 54, 60, '#4ab0ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 10, '#bfe6ff', 26, 260);
      G.FX.ring(l.x, l.y, 10, 180, '#4ab0ff', 0.55, 6);
      shake(l, 1.4);
    }
  });

  /* ---------- Landorus (645): la tierra se abomba, brotan espigas en corro y baja montado en su nube ---------- */
  add(645, {
    title: 'Señor de la tierra fértil', dur: 2.2, short: 0.9, cue: 0.74,
    sprite(l, k) { const e = cl((k - 0.34) / 0.4); return { a: cl((k - 0.34) / 0.06), rise: 0, lift: 160 * (1 - ease(e)), flash: k > 0.74 && k < 0.8 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const m = ease(cl((k - 0.06) / 0.24)) * (1 - cl((k - 0.88) / 0.12) * 0.7);
      if (m > 0) {
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#7a5a34'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 90 * m, 32 * m, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9a7444'; ctx.beginPath(); ctx.ellipse(l.x, l.y - 3 * m, 70 * m, 22 * m, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b8905a'; ctx.beginPath(); ctx.ellipse(l.x - 10 * m, l.y - 6 * m, 34 * m, 9 * m, 0, 0, TAU); ctx.fill();
      }
      dropShadow(ctx, l, cl((k - 0.34) / 0.4), 0, 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Espigas que crecen en corro y se mecen.
      for (let i = 0; i < 14; i++) {
        const an = i / 14 * TAU, gr = ease(cl((k - 0.16 - i * 0.012) / 0.2)) * (1 - cl((k - 0.9) / 0.1));
        if (gr <= 0) continue;
        const x = l.x + Math.cos(an) * 96, y = l.y + Math.sin(an) * 34, h = (26 + 10 * H(l.seed, i, 261)) * gr, sw = Math.sin(now * 3 + i) * 3 * gr;
        ctx.globalAlpha = 1; ctx.fillStyle = '#6a7a2a'; ctx.fillRect(Math.round(x - 1), Math.round(y - h), 2, Math.round(h));
        ctx.fillStyle = '#8a6a1a'; ctx.beginPath(); ctx.ellipse(x + sw, y - h, 4.5, 9 * gr + 2, sw * 0.08, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f0c850'; ctx.beginPath(); ctx.ellipse(x + sw - 0.5, y - h - 0.5, 3, 7 * gr + 1, sw * 0.08, 0, TAU); ctx.fill();
      }
      const e = cl((k - 0.34) / 0.4), cv = cl((k - 0.34) / 0.06) * (1 - cl((k - 0.74) / 0.16));
      if (cv > 0) { ctx.globalAlpha = 0.9 * cv; cloud(ctx, l.x, l.y - 160 * (1 - ease(e)) + 4, 1.1, '#e8a860', '#b87838'); }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 50, 56, '#e8c050', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 10, '#b8905a', 26, 220);
      G.FX.burst(l.x, l.y - 20, '#e8c050', 10, 180);
      G.FX.ring(l.x, l.y, 10, 160, '#e8a860', 0.5, 5);
      shake(l, 1.0);
    }
  });

  /* ---------- Kyurem (646): el suelo se hiela desde el centro, salen púas de hielo en corro y él aparece de la niebla ---------- */
  add(646, {
    title: 'Frío del vacío', dur: 2.3, short: 0.9, cue: 0.74,
    sprite(l, k) { return { a: cl((k - 0.5) / 0.24), rise: 0, lift: 0, flash: k > 0.74 && k < 0.8, scan: k < 0.74 }; },
    tick(l, k, dt) {
      if (G.FX && k > 0.3 && k < 0.8 && Math.random() < dt * 20) G.FX.px(l.x + (Math.random() - 0.5) * 160, l.y - Math.random() * 30, '#e6f6ff', { vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 10, life: 1, drag: 0.96 });
    },
    back(ctx, l, k, now) {
      ctx.save();
      const f = ease(cl((k - 0.06) / 0.34)) * (1 - cl((k - 0.88) / 0.12) * 0.6);
      if (f > 0) {
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#a8d8f0'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 130 * f, 46 * f, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#e6f6ff'; ctx.beginPath(); ctx.ellipse(l.x - 20 * f, l.y - 6 * f, 60 * f, 14 * f, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8 * f; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + H(l.seed, i, 271) * 0.4; jag(ctx, l.x, l.y, l.x + Math.cos(an) * 120 * f, l.y + Math.sin(an) * 42 * f, 4, 4, l.seed + i); }
        ctx.stroke();
      }
      // Niebla fría donde aparece.
      const m = cl((k - 0.3) / 0.2) * (1 - cl((k - 0.76) / 0.16));
      if (m > 0) { glow(ctx, l.x, l.y - 40, 70, 60, '#d8f0ff', 0.6 * m); ctx.globalAlpha = 0.35 * m; ctx.fillStyle = '#e6f6ff'; ctx.beginPath(); ctx.ellipse(l.x, l.y - 30, 56, 40, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Púas de hielo en corro, de dentro afuera.
      for (let i = 0; i < 12; i++) {
        const an = i / 12 * TAU + 0.13, up = ease(cl((k - 0.2 - (i % 3) * 0.04) / 0.14)), b = cl((k - 0.76) / 0.2);
        if (up <= 0 || b >= 1) continue;
        const d = 90 + (i % 2) * 22, x = l.x + Math.cos(an) * d, y = l.y + Math.sin(an) * d * 0.36, h = (26 + 16 * H(l.seed, i, 272)) * up;
        ctx.globalAlpha = 0.9 * (1 - b); ctx.fillStyle = '#7ac8f0'; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 1, y - h); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 1, y - h); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 56, 60, '#9ad8ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#e6f6ff', 28, 240);
      G.FX.ring(l.x, l.y, 10, 170, '#7ac8f0', 0.55, 6);
      shake(l, 1.1);
    }
  });

  /* ---------- Keldeo (647): llega al galope por encima de un agua que salpica a cada paso y su cuerno de agua brilla ---------- */
  add(647, {
    title: 'Espada de la resolución', dur: 2.0, short: 0.8, cue: 0.66,
    sprite(l, k) { const e = cl((k - 0.2) / 0.46); return { a: cl((k - 0.2) / 0.06), rise: 0, lift: 8 * Math.abs(Math.sin(e * Math.PI * 6)) * (1 - e), ox: 230 * (1 - ease(e)), flash: k > 0.66 && k < 0.72 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Una franja de agua por donde corre.
      const w = cl((k - 0.04) / 0.16) * (1 - cl((k - 0.86) / 0.14));
      if (w > 0) {
        ctx.globalAlpha = 0.55 * w; ctx.fillStyle = '#3a8ad0'; ctx.beginPath(); ctx.ellipse(l.x + 115, l.y, 150 * w, 18, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9ad8ff'; ctx.globalAlpha = 0.5 * w;
        for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(l.x + 115 + (H(l.seed, i, 281) - 0.5) * 240), Math.round(l.y + (H(l.seed, i, 282) - 0.5) * 20), 8, 1);
      }
      // Salpicadura de cada paso: un aro que se abre donde ha pisado.
      for (let i = 0; i < 6; i++) {
        const t = 0.2 + (i + 1) / 6 * 0.46 * 0.95, s = cl((k - t) / 0.12);
        if (s <= 0 || s >= 1) continue;
        const e = cl((t - 0.2) / 0.46), x = l.x + 230 * (1 - ease(e));
        ctx.globalAlpha = 0.8 * (1 - s); ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, l.y, 6 + 24 * s, 2 + 8 * s, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const e = cl((k - 0.2) / 0.46);
      if (e > 0 && e < 1) {
        const x = l.x + 230 * (1 - ease(e));
        for (let i = 0; i < 6; i++) {
          const t = (now * 3 + i / 6) % 1;
          ctx.globalAlpha = 1 - t; ctx.fillStyle = '#9ad8ff'; ctx.fillRect(Math.round(x + 10 + t * 30), Math.round(l.y - 4 - 20 * Math.sin(t * Math.PI) - i), 2, 2);
        }
      }
      // El cuerno de agua: una hoja de luz azul sobre su cabeza al llegar.
      const h = cl((k - 0.62) / 0.08) * (1 - cl((k - 0.9) / 0.1));
      if (h > 0) {
        const hy = l.y - (G.Sprites && G.Sprites.bodyHeight ? G.Sprites.bodyHeight(l.dex, l.sc) : 60) - 6;
        glow(ctx, l.x, hy - 16, 18, 26, '#9ad8ff', 0.7 * h);
        ctx.globalAlpha = h; blade(ctx, l.x, hy, 34 * h + 1, 4, -Math.PI / 2 - 0.3, '#6ac8ff', '#ffffff');
      }
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 10, '#9ad8ff', 22, 220);
      G.FX.ring(l.x, l.y, 10, 130, '#6ac8ff', 0.5, 5);
      shake(l, 0.6);
    }
  });

  /* ---------- Meloetta (648): unas líneas de pentagrama ondean en el aire, las notas giran y ella baja dando vueltas ---------- */
  add(648, {
    title: 'Canción del alba', dur: 2.2, short: 0.9, cue: 0.74,
    sprite(l, k) { const e = cl((k - 0.4) / 0.34); return { a: cl((k - 0.4) / 0.08), rise: 0, lift: 110 * (1 - ease(e)), ox: Math.sin(e * TAU * 1.5) * 20 * (1 - e), flash: k > 0.74 && k < 0.8 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // El pentagrama: cinco líneas que se dibujan de izquierda a derecha y ondean.
      const d = ease(cl((k - 0.04) / 0.26)), out = cl((k - 0.78) / 0.16);
      if (d > 0 && out < 1) {
        for (let j = 0; j < 5; j++) {
          for (let i = 0; i < 24; i++) {
            const t = i / 23; if (t > d) break;
            const x = l.x - 150 + 300 * t, y = l.y - 120 + j * 7 + Math.sin(now * 2.5 + t * 6) * 12;
            ctx.globalAlpha = 0.85 * (1 - out) * (1 - Math.abs(t - 0.5) * 0.8);
            ctx.fillStyle = '#1a4a3a'; ctx.fillRect(Math.round(x), Math.round(y) + 1, 13, 1);
            ctx.fillStyle = '#e8fff4'; ctx.fillRect(Math.round(x), Math.round(y), 13, 1);
          }
        }
        glow(ctx, l.x, l.y - 106, 160, 30, '#7ad8b0', 0.25 * d * (1 - out));
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Notas que salen del pentagrama y bajan en corro hacia ella.
      const n = cl((k - 0.16) / 0.1) * (1 - cl((k - 0.8) / 0.14));
      if (n > 0) {
        for (let i = 0; i < 8; i++) {
          const an = i / 8 * TAU + now * 1.6, r = 50 + 30 * Math.sin(now + i), x = l.x + Math.cos(an) * r, y = l.y - 70 + Math.sin(an) * r * 0.4 + Math.sin(now * 3 + i) * 6;
          glow(ctx, x, y, 12, 12, '#7ad8b0', 0.5 * n);
          ctx.globalAlpha = n; ctx.fillStyle = i % 2 ? '#ffffff' : '#7ad8b0';
          ctx.beginPath(); ctx.ellipse(x, y, 4, 3, -0.4, 0, TAU); ctx.fill();
          ctx.fillRect(Math.round(x + 3), Math.round(y - 12), 1, 12);
          if (i % 3 === 0) ctx.fillRect(Math.round(x + 3), Math.round(y - 12), 5, 2);
        }
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 34, 44, 48, '#7ad8b0', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#7ad8b0', 22, 200);
      G.FX.ring(l.x, l.y, 10, 140, '#ffffff', 0.5, 4);
      shake(l, 0.4);
    }
  });

  /* ---------- Genesect (649): una mira roja barre la arena y se fija; baja del cielo como un reactor y aterriza ---------- */
  add(649, {
    title: 'Insecto de otra era', dur: 2.2, short: 0.9, cue: 0.74,
    sprite(l, k) { const e = cl((k - 0.5) / 0.24); return { a: cl((k - 0.5) / 0.04), rise: 0, lift: 260 * (1 - ease(e)), ox: -80 * (1 - ease(e)), flash: k > 0.74 && k < 0.8 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // La mira: un aro rojo que va de un sitio a otro y se fija en el suyo, encogiéndose.
      const on = cl((k - 0.06) / 0.08) * (1 - cl((k - 0.76) / 0.08));
      if (on > 0) {
        const s = cl((k - 0.06) / 0.34), hop = Math.min(3, Math.floor(s * 4)), q = s * 4 - hop;
        const P = i => (i >= 3 ? [l.x, l.y] : [l.x + (H(l.seed, i, 291) - 0.5) * 220, l.y + (H(l.seed, i, 292) - 0.5) * 70]);
        const a = P(hop - 1 < 0 ? 0 : hop - 1), b = P(hop), mv = hop === 0 ? 1 : ease(cl(q * 2));
        const x = a[0] + (b[0] - a[0]) * mv, y = a[1] + (b[1] - a[1]) * mv, lock = cl((k - 0.4) / 0.3), r = 46 - 22 * lock;
        ctx.globalAlpha = on; ctx.strokeStyle = '#ff3a3a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.38, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ff3a3a';
        ctx.fillRect(Math.round(x - r - 8), Math.round(y), 12, 2); ctx.fillRect(Math.round(x + r - 4), Math.round(y), 12, 2);
        ctx.fillRect(Math.round(x), Math.round(y - r * 0.38 - 6), 2, 9); ctx.fillRect(Math.round(x), Math.round(y + r * 0.38 - 3), 2, 9);
        glow(ctx, x, y, r, r * 0.5, '#ff3a3a', 0.3 * on * (0.6 + 0.4 * Math.sin(now * 10)));
      }
      dropShadow(ctx, l, cl((k - 0.5) / 0.24), -80 * (1 - ease(cl((k - 0.5) / 0.24))), 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Estela de reactor morada mientras baja.
      const e = cl((k - 0.5) / 0.24);
      if (e > 0 && e < 1) {
        const x = l.x - 80 * (1 - ease(e)), y = l.y - 260 * (1 - ease(e));
        for (let i = 1; i <= 8; i++) {
          const q = cl(e - i * 0.03), px = l.x - 80 * (1 - ease(q)), py = l.y - 260 * (1 - ease(q)) - 10;
          ctx.globalAlpha = (1 - i / 9) * 0.8; ctx.fillStyle = i < 3 ? '#ffffff' : '#b06aff';
          ctx.beginPath(); ctx.ellipse(px, py, 6 - i * 0.4, 4, 0, 0, TAU); ctx.fill();
        }
        glow(ctx, x, y - 10, 30, 24, '#b06aff', 0.6);
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 50, 56, '#b06aff', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 10, '#c8c8d8', 24, 240);
      G.FX.burst(l.x, l.y - 20, '#b06aff', 10, 180);
      G.FX.ring(l.x, l.y, 10, 160, '#ff3a3a', 0.5, 5);
      shake(l, 1.1);
    }
  });

  // ================= tanda 5 (25-11-2026): sexta generación y los primeros de la séptima =================

  /* ---------- Xerneas (716): una semilla de luz brota en un árbol de luz de colores que se deshace en chispas y deja al ciervo ---------- */
  const XER = ['#7ac8ff', '#ffd860', '#ff8ac8', '#8ae06a', '#c89aff'];
  add(716, {
    title: 'Ciervo de la vida', dur: 2.4, short: 0.95, cue: 0.72,
    sprite(l, k) { return { a: cl((k - 0.6) / 0.14), rise: 0, lift: 0, flash: k > 0.72 && k < 0.78, scan: k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const g = cl((k - 0.04) / 0.12) * (1 - cl((k - 0.86) / 0.14));
      if (g > 0) { glow(ctx, l.x, l.y, 90, 32, '#bfe6ff', 0.4 * g); ctx.globalAlpha = 0.35 * g; ctx.fillStyle = '#6ab84a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 70, 24, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El árbol: tronco y ramas que crecen hacia arriba (de dos en dos), con una luz de color en cada punta.
      const gr = ease(cl((k - 0.1) / 0.4)), out = cl((k - 0.62) / 0.14);
      if (gr > 0 && out < 1) {
        const tops = [];
        ctx.globalAlpha = 1 - out; ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 4;
        const br = (x, y, ang, len, d, i) => {
          const f = cl(gr * 4 - d), ex = x + Math.cos(ang) * len * f, ey = y + Math.sin(ang) * len * f;
          if (f <= 0) return;
          ctx.lineWidth = Math.max(1, 4 - d); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
          if (d < 3 && f >= 1) { br(ex, ey, ang - 0.45 - 0.1 * H(l.seed, i, 301), len * 0.68, d + 1, i * 2); br(ex, ey, ang + 0.45 + 0.1 * H(l.seed, i, 302), len * 0.68, d + 1, i * 2 + 1); }
          else if (d === 3) tops.push([ex, ey, i]);
        };
        br(l.x, l.y, -Math.PI / 2, 50, 0, 1);
        for (const [x, y, i] of tops) {
          const c = XER[i % 5], p = 0.8 + 0.2 * Math.sin(now * 5 + i);
          glow(ctx, x, y, 12, 12, c, 0.8 * (1 - out));
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3.5 * p, 0, TAU); ctx.fill();
        }
      }
      // Al deshacerse: chispas de colores que suben.
      if (out > 0 && out < 1) {
        for (let i = 0; i < 16; i++) {
          const x = l.x + (H(l.seed, i, 303) - 0.5) * 120, y = l.y - 40 - H(l.seed, i, 304) * 100 - 60 * out;
          ctx.globalAlpha = 1 - out; ctx.fillStyle = XER[i % 5]; star4(ctx, x, y, 2);
        }
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 54, 60, '#bfe6ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#ffd860', 14, 200);
      G.FX.burst(l.x, l.y - 40, '#7ac8ff', 14, 200);
      G.FX.ring(l.x, l.y, 10, 160, '#ff8ac8', 0.55, 5);
      shake(l, 0.8);
    }
  });

  /* ---------- Yveltal (717): el suelo se marchita, su sombra en Y cruza la arena, caen plumas rojas y baja en espiral ---------- */
  add(717, {
    title: 'Alas del ocaso', dur: 2.4, short: 0.95, cue: 0.76,
    sprite(l, k) { const e = cl((k - 0.46) / 0.3), an = (1 - e) * 4; return { a: cl((k - 0.46) / 0.08), rise: 0, lift: 180 * (1 - ease(e)), ox: Math.cos(an) * 80 * (1 - e), flash: k > 0.76 && k < 0.82 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Ceniza: un corro gris que se extiende y hierba seca.
      const w = ease(cl((k - 0.04) / 0.36)) * (1 - cl((k - 0.88) / 0.12) * 0.6);
      if (w > 0) {
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#4a4248'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 120 * w, 42 * w, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#8a7a6a';
        for (let i = 0; i < 12; i++) { const an = H(l.seed, i, 311) * TAU, d = H(l.seed, i, 312) * 100 * w; ctx.globalAlpha = 0.8 * w; ctx.fillRect(Math.round(l.x + Math.cos(an) * d), Math.round(l.y + Math.sin(an) * d * 0.36 - 5), 1, 5); }
      }
      // La sombra en Y que cruza.
      const s = cl((k - 0.12) / 0.3);
      if (s > 0 && s < 1) {
        const x = l.x + 260 - 520 * s, y = l.y + 10;
        ctx.globalAlpha = 0.45 * Math.sin(s * Math.PI); ctx.fillStyle = '#100810';
        ctx.beginPath(); ctx.ellipse(x, y, 16, 8, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x - 30, y - 18, 40, 9, 0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x - 30, y + 18, 40, 9, -0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 30, y, 26, 5, 0, 0, TAU); ctx.fill();
      }
      dropShadow(ctx, l, cl((k - 0.46) / 0.3), 0, 0.35);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const f = cl((k - 0.3) / 0.1) * (1 - cl((k - 0.86) / 0.14));
      if (f > 0) {
        for (let i = 0; i < 12; i++) {
          const ph = (now * 0.4 + H(l.seed, i, 313)) % 1, x = l.x + (H(l.seed, i, 314) - 0.5) * 240 + Math.sin(now * 2 + i) * 12, y = l.y - 220 + ph * 230;
          ctx.globalAlpha = f * Math.sin(ph * Math.PI); ctx.fillStyle = i % 3 ? '#c02838' : '#2a1a2a';
          ctx.beginPath(); ctx.ellipse(x, y, 5, 2, Math.sin(now * 3 + i), 0, TAU); ctx.fill();
        }
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 40, 56, 60, '#c02838', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#2a1a2a', 22, 240);
      G.FX.burst(l.x, l.y - 30, '#c02838', 12, 200);
      G.FX.ring(l.x, l.y, 10, 170, '#c02838', 0.55, 6);
      shake(l, 1.2);
    }
  });

  /* ---------- Zygarde (718): células verdes llegan reptando de todos lados, se juntan en un mosaico y se encienden ---------- */
  add(718, {
    title: 'Guardián del orden', dur: 2.4, short: 0.95, cue: 0.74,
    sprite(l, k) { return { a: cl((k - 0.58) / 0.16), rise: 0, lift: 0, flash: k > 0.74 && k < 0.8, scan: k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // El mosaico de casillas de seis lados en el suelo, que se va llenando.
      const m = cl((k - 0.3) / 0.3) * (1 - cl((k - 0.86) / 0.14));
      if (m > 0) {
        for (let i = 0; i < 19; i++) {
          const q = i === 0 ? [0, 0] : i < 7 ? [Math.cos(i / 6 * TAU), Math.sin(i / 6 * TAU)] : [2 * Math.cos((i - 7) / 12 * TAU), 2 * Math.sin((i - 7) / 12 * TAU)];
          const on = cl(m * 3 - (i === 0 ? 0 : i < 7 ? 1 : 2));
          if (on <= 0) continue;
          const x = l.x + q[0] * 26, y = l.y + q[1] * 10;
          ctx.globalAlpha = 0.8 * on; ctx.fillStyle = i % 4 ? '#2a5a2a' : '#4ac85a';
          ctx.beginPath(); for (let j = 0; j < 6; j++) { const a = j / 6 * TAU; ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 5); } ctx.closePath(); ctx.fill();
        }
        glow(ctx, l.x, l.y, 80, 30, '#4ac85a', 0.4 * m);
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Las células: puntos verdes con un núcleo que llegan reptando (en zigzag) al centro.
      for (let i = 0; i < 18; i++) {
        const t0 = 0.04 + H(l.seed, i, 321) * 0.16, f = cl((k - t0) / 0.36);
        if (f <= 0 || f >= 1) continue;
        const an = i / 18 * TAU, d = 240 * (1 - ease(f)), zz = Math.sin(f * 18 + i) * 8 * (1 - f);
        const x = l.x + Math.cos(an) * d - Math.sin(an) * zz, y = l.y + Math.sin(an) * d * 0.4 + Math.cos(an) * zz * 0.4;
        glow(ctx, x, y, 10, 8, '#4ac85a', 0.6);
        ctx.globalAlpha = 1; ctx.fillStyle = '#3a8a3a'; ctx.beginPath(); ctx.ellipse(x, y, 5, 3.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8ff8a'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 56, 60, '#4ac85a', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#4ac85a', 26, 240);
      G.FX.ring(l.x, l.y, 10, 170, '#c8ff8a', 0.55, 6);
      shake(l, 1.1);
    }
  });

  /* ---------- Diancie (719): brotan cristales rosas, brillan, estallan en purpurina y ella baja flotando ---------- */
  function gem(ctx, x, y, w, h, c1, c2) {
    ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y - h * 0.35); ctx.lineTo(x, y); ctx.lineTo(x - w, y - h * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w * 0.4, y - h * 0.4); ctx.lineTo(x, y - h * 0.1); ctx.closePath(); ctx.fill();
  }
  add(719, {
    title: 'Princesa de diamante', dur: 2.2, short: 0.9, cue: 0.68,
    sprite(l, k) { const e = cl((k - 0.6) / 0.3); return { a: cl((k - 0.6) / 0.06), rise: 0, lift: 30 * (1 - ease(e)), flash: k > 0.68 && k < 0.74 }; },
    back(ctx, l, k, now) { ctx.save(); const g = cl((k - 0.1) / 0.2) * (1 - cl((k - 0.86) / 0.14)); if (g > 0) glow(ctx, l.x, l.y, 90, 32, '#ff9ad8', 0.45 * g); ctx.restore(); },
    front(ctx, l, k, now) {
      ctx.save();
      const b = cl((k - 0.62) / 0.3);
      for (let i = 0; i < 9; i++) {
        const up = ease(cl((k - 0.08 - i * 0.03) / 0.16));
        if (up <= 0 || b >= 1) continue;
        const an = H(l.seed, i, 331) * TAU, d = i === 0 ? 0 : 24 + 40 * H(l.seed, i, 332), x = l.x + Math.cos(an) * d, y = l.y + Math.sin(an) * d * 0.36;
        const w = (i === 0 ? 16 : 8 + 4 * H(l.seed, i, 333)) * up, h = (i === 0 ? 64 : 22 + 16 * H(l.seed, i, 334)) * up;
        if (b > 0) {
          // Estallan: trocitos que salen hacia fuera.
          ctx.globalAlpha = 1 - b;
          for (let j = 0; j < 3; j++) { const a2 = an + j * 2, dd = 20 + 90 * ease(b); gem(ctx, x + Math.cos(a2) * dd, y - h / 2 + Math.sin(a2) * dd * 0.6 - 30 * b, 4, 9, '#ff9ad8', '#ffffff'); }
        } else {
          ctx.globalAlpha = 0.95; gem(ctx, x, y, w, h, i % 2 ? '#ff8ac8' : '#ffb8e0', '#ffffff');
          const tw = 0.5 + 0.5 * Math.sin(now * 6 + i * 1.7);
          ctx.globalAlpha = tw; ctx.fillStyle = '#ffffff'; star4(ctx, x + w * 0.3, y - h * 0.7, 3);
        }
      }
      if (k > 0.68) glow(ctx, l.x, l.y - 34, 46, 50, '#ff9ad8', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 30, '#ff9ad8', 24, 240);
      G.FX.burst(l.x, l.y - 30, '#ffffff', 12, 200);
      G.FX.ring(l.x, l.y, 10, 150, '#ff9ad8', 0.5, 5);
      shake(l, 0.6);
    }
  });

  /* ---------- Hoopa (720): aros dorados se abren en el aire, escupen piedras y él sale del último, en el suelo ---------- */
  function portal(ctx, x, y, r, a) {
    if (r <= 0) return;
    glow(ctx, x, y, r * 1.4, r * 1.4, '#ffd860', 0.5 * a);
    ctx.globalAlpha = a; ctx.fillStyle = '#c89a2a'; ctx.beginPath(); ctx.ellipse(x, y, r + 3, r * 0.9 + 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd860'; ctx.beginPath(); ctx.ellipse(x, y, r + 1.5, r * 0.9 + 1.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a103a'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a4ac8'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.5, r * 0.45, 0, 0, TAU); ctx.fill();
  }
  const HOOP = [[-90, -120, 0.08], [80, -150, 0.18], [-40, -170, 0.28]];
  add(720, {
    title: 'Travieso de los anillos', dur: 2.3, short: 0.9, cue: 0.7,
    sprite(l, k) { return { a: k > 0.52 ? 1 : 0, rise: 1 - ease(cl((k - 0.54) / 0.18)), lift: 0, flash: k > 0.7 && k < 0.76 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // El aro grande, tumbado en el suelo: de ahí sale él.
      const g = ease(cl((k - 0.4) / 0.12)) * (1 - ease(cl((k - 0.76) / 0.16)));
      if (g > 0) {
        glow(ctx, l.x, l.y, 70 * g, 26 * g, '#ffd860', 0.6 * g);
        ctx.globalAlpha = 1; ctx.fillStyle = '#ffd860'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 52 * g + 3, 18 * g + 2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a103a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 52 * g, 18 * g, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Tres aros en el aire, uno tras otro: se abren, escupen una piedra y se cierran.
      for (let i = 0; i < 3; i++) {
        const [dx, dy, t] = HOOP[i], o = ease(cl((k - t) / 0.08)) * (1 - ease(cl((k - t - 0.22) / 0.08)));
        portal(ctx, l.x + dx, l.y + dy, 18 * o, o);
        const s = cl((k - t - 0.06) / 0.2);
        if (s > 0 && s < 1) {
          const sx = l.x + dx + (dx > 0 ? -1 : 1) * 70 * s, sy = l.y + dy + 40 * s + 120 * s * s;
          ctx.globalAlpha = 1 - s * 0.5; rock(ctx, sx, Math.min(l.y + 10, sy), 8);
        }
      }
      if (k > 0.7) glow(ctx, l.x, l.y - 30, 44, 48, '#ffd860', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 20, '#ffd860', 22, 220);
      G.FX.burst(l.x, l.y - 20, '#8a4ac8', 10, 180);
      G.FX.ring(l.x, l.y, 10, 140, '#ffd860', 0.5, 5);
      shake(l, 0.6);
    }
  });

  /* ---------- Volcanion (721): un chorro de fuego y otro de agua se juntan en una nube de vapor de la que sale ---------- */
  add(721, {
    title: 'Vapor del volcán', dur: 2.3, short: 0.9, cue: 0.72,
    sprite(l, k) { return { a: cl((k - 0.56) / 0.14), rise: 0, lift: 0, flash: k > 0.72 && k < 0.78 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Los dos chorros, a los lados, que se inclinan hacia él.
      const j = ease(cl((k - 0.06) / 0.16)) * (1 - cl((k - 0.5) / 0.12));
      if (j > 0) {
        for (const d of [-1, 1]) {
          const bx = l.x + d * 90, c1 = d < 0 ? '#ff6a1a' : '#3a8ad0', c2 = d < 0 ? '#ffd060' : '#bfe6ff';
          for (let i = 0; i < 10; i++) {
            const t = i / 9, x = bx - d * 80 * t * t, y = l.y - 150 * t * j, r = (12 - 5 * t) * (0.85 + 0.15 * Math.sin(now * 14 + i));
            glow(ctx, x, y, r * 2, r * 2, c1, 0.35 * j);
            ctx.globalAlpha = j; ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, TAU); ctx.fill();
            ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r * 0.45), 0, TAU); ctx.fill();
          }
        }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El vapor: bolas blancas que crecen donde se juntan y lo tapan; se aclaran cuando sale.
      const v = cl((k - 0.36) / 0.16) * (1 - cl((k - 0.7) / 0.22));
      if (v > 0) {
        for (let i = 0; i < 12; i++) {
          const an = H(l.seed, i, 341) * TAU, d = 10 + 50 * H(l.seed, i, 342) + 30 * cl((k - 0.6) / 0.3), r = (16 + 10 * H(l.seed, i, 343)) * (0.6 + 0.4 * v);
          const x = l.x + Math.cos(an) * d, y = l.y - 50 + Math.sin(an) * d * 0.6 - 20 * cl((k - 0.6) / 0.3);
          ctx.globalAlpha = 0.75 * v; ctx.fillStyle = i % 3 ? '#e8eef4' : '#c8d0d8'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 56, 60, '#ff8a4a', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#e8eef4', 26, 260);
      G.FX.burst(l.x - 20, l.y - 30, '#ff6a1a', 10, 180);
      G.FX.burst(l.x + 20, l.y - 30, '#3a8ad0', 10, 180);
      G.FX.ring(l.x, l.y, 10, 160, '#e8eef4', 0.55, 6);
      shake(l, 1.1);
    }
  });

  /* ---------- Código Cero (772): cae una cápsula de metal, saltan los cerrojos con chispas y se abre ---------- */
  add(772, {
    title: 'Quimera sellada', dur: 2.2, short: 0.9, cue: 0.34,
    sprite(l, k) { return { a: k > 0.62 ? 1 : 0, rise: 0, lift: 0, flash: k > 0.62 && k < 0.68 }; },
    tick(l, k) {
      for (let i = 0; i < 4; i++) {
        const t = 0.42 + i * 0.05, bit = 1 << i;
        if (k > t && !((l.bolts || 0) & bit)) { l.bolts = (l.bolts || 0) | bit; if (G.FX) G.FX.burst(l.x + (i % 2 ? 22 : -22), l.y - 20 - (i > 1 ? 40 : 0), '#ffd060', 8, 160); }
      }
    },
    back(ctx, l, k, now) { ctx.save(); dropShadow(ctx, l, cl((k - 0.1) / 0.24), 0, 0.4); ctx.restore(); },
    front(ctx, l, k, now) {
      ctx.save();
      const f = cl((k - 0.1) / 0.24), y = l.y - 260 * (1 - f * f), op = ease(cl((k - 0.62) / 0.14)), gone = cl((k - 0.78) / 0.16);
      if (f > 0 && gone < 1) {
        // Dos mitades que se separan al abrir.
        for (const d of [-1, 1]) {
          const x = l.x + d * (14 + 36 * op);
          ctx.globalAlpha = 1 - gone; ctx.fillStyle = '#5a6070'; ctx.fillRect(Math.round(x - 14), Math.round(y - 74), 28, 74);
          ctx.fillStyle = '#7a8090'; ctx.fillRect(Math.round(x - 14), Math.round(y - 74), 28, 6); ctx.fillRect(Math.round(x - 14), Math.round(y - 40), 28, 3);
          ctx.fillStyle = '#3a404c'; ctx.fillRect(Math.round(x + d * -14 - (d < 0 ? 0 : 2)), Math.round(y - 74), 2, 74);
          // Cerrojos: hasta que saltan.
          for (let i = 0; i < 2; i++) {
            const t = 0.42 + (i * 2 + (d > 0 ? 1 : 0)) * 0.05;
            if (k < t) { ctx.fillStyle = '#c8a040'; ctx.fillRect(Math.round(x - d * 10 - 3), Math.round(y - 20 - i * 40 - 3), 6, 6); }
          }
        }
        // Luz roja de aviso que parpadea mientras está cerrada.
        if (op < 0.5) { const bl = Math.sin(now * 12) > 0 ? 1 : 0.3; glow(ctx, l.x, y - 80, 10, 10, '#ff3a3a', bl * (1 - gone)); ctx.globalAlpha = bl * (1 - gone); ctx.fillStyle = '#ff3a3a'; ctx.fillRect(Math.round(l.x - 3), Math.round(y - 82), 6, 4); }
      }
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 6, '#8a8a98', 24, 240);
      G.FX.ring(l.x, l.y, 10, 150, '#c8c8d8', 0.5, 5);
      shake(l, 1.2);
    }
  });

  /* ---------- Silvally (773): su casco salta en pedazos y un disco gira cambiando de color hasta encajar en él ---------- */
  add(773, {
    title: 'Quimera liberada', dur: 2.2, short: 0.9, cue: 0.72,
    sprite(l, k) { return { a: cl((k - 0.06) / 0.1), rise: 0, lift: 0, flash: (k > 0.16 && k < 0.22) || (k > 0.72 && k < 0.78) }; },
    back() {},   // (sin la columna de la genérica)
    tick(l, k) { if (k > 0.18 && !l.helm) { l.helm = 1; if (G.FX) G.FX.burst(l.x, l.y - 50, '#8a8a98', 18, 220); shake(l, 0.5); } },
    front(ctx, l, k, now) {
      ctx.save();
      // Trozos del casco que salen volando.
      const h = cl((k - 0.18) / 0.3);
      if (h > 0 && h < 1) {
        for (let i = 0; i < 6; i++) {
          const an = -Math.PI / 2 + (i - 2.5) * 0.5, d = 20 + 120 * ease(h);
          ctx.globalAlpha = 1 - h; ctx.fillStyle = i % 2 ? '#6a7080' : '#8a90a0';
          ctx.save(); ctx.translate(l.x + Math.cos(an) * d, l.y - 50 + Math.sin(an) * d * 0.6 + 140 * h * h); ctx.rotate(h * 8 + i);
          ctx.fillRect(-6, -4, 12, 8); ctx.restore();
        }
      }
      // El disco: gira sobre él cambiando de color cada vez más deprisa y baja a encajar.
      const d = cl((k - 0.28) / 0.08) * (1 - cl((k - 0.72) / 0.04));
      if (d > 0) {
        const sp = 4 + 30 * cl((k - 0.3) / 0.4), ci = Math.floor(now * sp) % ARC_COLS.length, y = l.y - 110 + 60 * ease(cl((k - 0.5) / 0.22));
        const sq = Math.abs(Math.cos(now * sp * 0.5));
        glow(ctx, l.x, y, 26, 26, ARC_COLS[ci], 0.7 * d);
        ctx.globalAlpha = d; ctx.fillStyle = '#d8d8e0'; ctx.beginPath(); ctx.ellipse(l.x, y, 14 * sq + 2, 14, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = ARC_COLS[ci]; ctx.beginPath(); ctx.ellipse(l.x, y, 9 * sq + 1, 9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a2a3a'; ctx.beginPath(); ctx.ellipse(l.x, y, 3 * sq + 0.5, 3, 0, 0, TAU); ctx.fill();
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 50, 56, '#d8d8e0', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) {
      if (!G.FX) return;
      G.FX.burst(l.x, l.y - 40, '#ffffff', 22, 220);
      G.FX.ring(l.x, l.y, 10, 150, '#d8d8e0', 0.5, 5);
      shake(l, 0.8);
    }
  });

  /*
   * Los cuatro guardianes de las islas llegan cerrados en su concha (dos mitades) y se abren. Cada uno a su manera:
   * Koko cruza como un rayo, Lele baja entre polvo de luz, Bulu cae de golpe entre lianas y Fini sube de la niebla.
   */
  function tapuShell(ctx, x, y, open, c1, c2, eye) {
    const o = 32 * ease(open);
    for (const d of [-1, 1]) {
      const cx = x + d * o;
      ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(cx, y, 28, 40, 0, d < 0 ? Math.PI / 2 : -Math.PI / 2, d < 0 ? Math.PI * 1.5 : Math.PI / 2); ctx.fill();
      ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(cx - d * 1, y, 23, 35, 0, d < 0 ? Math.PI / 2 : -Math.PI / 2, d < 0 ? Math.PI * 1.5 : Math.PI / 2); ctx.fill();
      ctx.fillStyle = c2; ctx.fillRect(Math.round(cx + d * 5 - (d < 0 ? 15 : 0)), Math.round(y - 5), 15, 4);
    }
    if (open < 0.2) { ctx.fillStyle = eye; ctx.fillRect(Math.round(x - 9), Math.round(y - 15), 5, 4); ctx.fillRect(Math.round(x + 4), Math.round(y - 15), 5, 4); }
  }
  const tapuSprite = (l, k) => ({ a: cl((k - 0.66) / 0.06), rise: 0, lift: 0, flash: k > 0.7 && k < 0.76 });
  function tapuOpen(ctx, l, k, sx, sy, c1, c2, eye, col) {
    const op = cl((k - 0.62) / 0.12), gone = cl((k - 0.74) / 0.14);
    if (gone >= 1) return;
    glow(ctx, sx, sy, 50, 56, col, 0.5 * (1 - gone));
    ctx.globalAlpha = 1 - gone; tapuShell(ctx, sx, sy, op, c1, c2, eye);
  }

  /* ---------- Tapu Koko (785): la concha cruza la arena como un rayo, frena echando chispas y se abre ---------- */
  add(785, {
    title: 'Guardián de la tormenta', dur: 2.1, short: 0.85, cue: 0.72,
    sprite: tapuSprite,
    back(ctx, l, k, now) {
      ctx.save();
      const e = cl((k - 0.1) / 0.36);
      if (e > 0 && k < 0.7) {
        const x = l.x - 260 + 260 * ease(e);
        for (let i = 1; i < 8; i++) { const q = cl(e - i * 0.04), px = l.x - 260 + 260 * ease(q); ctx.globalAlpha = 0.6 * (1 - i / 8); ctx.fillStyle = '#ffd840'; ctx.fillRect(Math.round(px - 10), Math.round(l.y - 40 + Math.sin(i * 2.3) * 8), 20, 3); }
        glow(ctx, x, l.y - 40, 40, 30, '#ffd840', 0.5);
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const e = cl((k - 0.1) / 0.36);
      if (e > 0) {
        const x = l.x - 260 + 260 * ease(e);
        tapuOpen(ctx, l, k, x, l.y - 40, '#ffb020', '#2a2a3a', '#ff8a2a', '#ffd840');
        // Chispas mientras frena y espera.
        if (e > 0.6 && k < 0.7) {
          ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9; ctx.beginPath();
          for (let i = 0; i < 3; i++) { const s = Math.floor(now * 14) + i * 5, an = H(l.seed, s, 351) * TAU; jag(ctx, x + Math.cos(an) * 24, l.y - 40 + Math.sin(an) * 30, x + Math.cos(an) * 46, l.y - 40 + Math.sin(an) * 46, 3, 5, s); }
          ctx.stroke();
        }
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 50, 56, '#ffd840', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 40, '#fff27a', 24, 240); G.FX.ring(l.x, l.y, 10, 150, '#ffb020', 0.5, 5); shake(l, 0.8); }
  });

  /* ---------- Tapu Lele (786): la concha baja despacio entre polvo de luz rosa y se abre ---------- */
  add(786, {
    title: 'Guardiana del polvo mágico', dur: 2.1, short: 0.85, cue: 0.72,
    sprite: tapuSprite,
    back(ctx, l, k, now) {
      ctx.save();
      const d = cl((k - 0.04) / 0.12) * (1 - cl((k - 0.86) / 0.14));
      for (let i = 0; i < 16 && d > 0; i++) {
        const ph = (now * 0.3 + H(l.seed, i, 361)) % 1, x = l.x + (H(l.seed, i, 362) - 0.5) * 200 + Math.sin(now * 2 + i) * 10, y = l.y - 200 + ph * 210;
        ctx.globalAlpha = d * Math.sin(ph * Math.PI); ctx.fillStyle = i % 2 ? '#ff9ad8' : '#ffe0f4'; star4(ctx, x, y, i % 3 ? 1 : 2);
      }
      const g = cl((k - 0.4) / 0.2) * (1 - cl((k - 0.86) / 0.14));
      if (g > 0) { glow(ctx, l.x, l.y, 70, 24, '#ff9ad8', 0.5 * g); ctx.globalAlpha = 0.35 * g; ctx.fillStyle = '#ffb8e0'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 50, 17, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const e = cl((k - 0.06) / 0.5);
      if (e > 0) tapuOpen(ctx, l, k, l.x + Math.sin(e * 5) * 14 * (1 - e), l.y - 40 - 150 * (1 - ease(e)), '#ff8ac8', '#2a2a3a', '#4ad8ff', '#ff9ad8');
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 50, 56, '#ff9ad8', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 40, '#ff9ad8', 24, 220); G.FX.ring(l.x, l.y, 10, 150, '#ffe0f4', 0.5, 5); shake(l, 0.5); }
  });

  /* ---------- Tapu Bulu (787): la concha cae de golpe, brotan lianas alrededor y se abre con fuerza ---------- */
  add(787, {
    title: 'Guardián de la selva', dur: 2.1, short: 0.85, cue: 0.72,
    sprite: tapuSprite,
    tick(l, k) { if (k > 0.3 && !l.slam) { l.slam = 1; if (G.FX) { G.FX.burst(l.x, l.y, '#8a6a3a', 22, 220); G.FX.ring(l.x, l.y, 8, 120, '#6ab84a', 0.4, 5); } shake(l, 1.1); } },
    back(ctx, l, k, now) {
      ctx.save();
      // Lianas que crecen del suelo alrededor después del golpe.
      for (let i = 0; i < 8; i++) {
        const an = i / 8 * TAU + 0.2, gr = ease(cl((k - 0.32 - i * 0.02) / 0.2)) * (1 - cl((k - 0.88) / 0.12));
        if (gr <= 0) continue;
        const x0 = l.x + Math.cos(an) * 70, y0 = l.y + Math.sin(an) * 26, h = (40 + 20 * H(l.seed, i, 371)) * gr;
        ctx.globalAlpha = 1; ctx.fillStyle = '#3a7a2a';
        for (let j = 0; j < 8; j++) { const t = j / 7, x = x0 + Math.sin(t * 5 + i + now * 2) * 6 * t, y = y0 - h * t; ctx.beginPath(); ctx.arc(x, y, Math.max(1, 4 - t * 2), 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#6ac84a'; ctx.beginPath(); ctx.ellipse(x0 + Math.sin(5 + i + now * 2) * 6, y0 - h, 5, 3, 0.5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const f = cl((k - 0.12) / 0.18);
      if (f > 0) tapuOpen(ctx, l, k, l.x, l.y - 40 - 260 * (1 - f * f), '#d83a3a', '#2a2a3a', '#ffd840', '#ff6a4a');
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 50, 56, '#ff6a4a', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 40, '#6ac84a', 24, 240); G.FX.ring(l.x, l.y, 10, 160, '#d83a3a', 0.5, 5); shake(l, 1.0); }
  });

  /* ---------- Tapu Fini (788): sube una niebla con ondas de agua y la concha sale de ella y se abre ---------- */
  add(788, {
    title: 'Guardiana de la niebla', dur: 2.1, short: 0.85, cue: 0.72,
    sprite: tapuSprite,
    back(ctx, l, k, now) {
      ctx.save();
      const w = cl((k - 0.04) / 0.16) * (1 - cl((k - 0.86) / 0.14));
      if (w > 0) {
        ctx.globalAlpha = 0.5 * w; ctx.fillStyle = '#3a6ab8'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 70, 24, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#bfe6ff'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) { const ph = (now * 0.7 + i / 3) % 1; ctx.globalAlpha = 0.6 * (1 - ph) * w; ctx.beginPath(); ctx.ellipse(l.x, l.y, 10 + 70 * ph, 4 + 24 * ph, 0, 0, TAU); ctx.stroke(); }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const e = cl((k - 0.2) / 0.36);
      if (e > 0) tapuOpen(ctx, l, k, l.x, l.y - 40 + 50 * (1 - ease(e)), '#8a6ad8', '#2a2a3a', '#7ae8ff', '#9ab8ff');
      // Niebla por encima, que tapa la concha al principio.
      const m = cl((k - 0.06) / 0.16) * (1 - cl((k - 0.56) / 0.24));
      if (m > 0) {
        for (let i = 0; i < 10; i++) {
          const x = l.x + (H(l.seed, i, 381) - 0.5) * 180 + Math.sin(now * 0.8 + i) * 12, y = l.y - 10 - H(l.seed, i, 382) * 50;
          ctx.globalAlpha = 0.45 * m; ctx.fillStyle = i % 2 ? '#d8e8f8' : '#c0d4ec'; ctx.beginPath(); ctx.ellipse(x, y, 30, 14, 0, 0, TAU); ctx.fill();
        }
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 50, 56, '#9ab8ff', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 40, '#bfe6ff', 24, 220); G.FX.ring(l.x, l.y, 10, 150, '#9ab8ff', 0.5, 5); shake(l, 0.6); }
  });

  // ================= tanda 6 (26-11-2026): el resto de la séptima generación =================

  /** Tuerca de seis lados (Meltan, Melmetal). */
  function nut(ctx, x, y, s, rot, c1, c2) {
    ctx.fillStyle = c1; ctx.beginPath();
    for (let j = 0; j < 6; j++) { const a = rot + j / 6 * TAU; ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, TAU); ctx.fill();
  }

  /* ---------- Cosmog (789): una nubecita de estrellas baja flotando, da vueltas y se condensa en él ---------- */
  add(789, {
    title: 'Niño de las estrellas', dur: 2.0, short: 0.8, cue: 0.7,
    sprite(l, k) { return { a: cl((k - 0.56) / 0.14), rise: 0, lift: 10 * Math.sin(Math.PI * cl((k - 0.56) / 0.44)), flash: k > 0.7 && k < 0.76 }; },
    back() {},   // (sin la columna de la genérica)
    front(ctx, l, k, now) {
      ctx.save();
      const d = ease(cl((k - 0.04) / 0.4)), c = cl((k - 0.46) / 0.24), out = cl((k - 0.7) / 0.1);
      if (d > 0 && out < 1) {
        const cx = l.x + Math.sin(k * 9) * 30 * (1 - d), cy = l.y - 40 - 140 * (1 - d), r = 40 * (1 - c * 0.75);
        for (let i = 0; i < 8; i++) {
          const an = i / 8 * TAU + now * (1 + 3 * c), dd = r * (0.4 + 0.6 * H(l.seed, i, 401));
          ctx.globalAlpha = 0.55 * (1 - out); ctx.fillStyle = i % 2 ? '#3a2a7a' : '#5a4ab8';
          ctx.beginPath(); ctx.arc(cx + Math.cos(an) * dd, cy + Math.sin(an) * dd * 0.6, 14 * (1 - c * 0.5), 0, TAU); ctx.fill();
        }
        glow(ctx, cx, cy, r + 20, r + 10, '#8a7aff', 0.5 * (1 - out));
        for (let i = 0; i < 10; i++) {
          const an = H(l.seed, i, 402) * TAU + now * 2, dd = r * H(l.seed, i, 403);
          ctx.globalAlpha = (0.5 + 0.5 * Math.sin(now * 7 + i)) * (1 - out); ctx.fillStyle = i % 3 ? '#ffffff' : '#ffe08a';
          star4(ctx, cx + Math.cos(an) * dd, cy + Math.sin(an) * dd * 0.6, i % 4 ? 1 : 2);
        }
      }
      if (k > 0.7) glow(ctx, l.x, l.y - 30, 40, 44, '#8a7aff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#c8b8ff', 20, 180); G.FX.ring(l.x, l.y, 8, 110, '#8a7aff', 0.45, 4); shake(l, 0.3); }
  });

  /* ---------- Cosmoem (790): polvo dorado gira y se pega a una esfera oscura que se endurece y late por dentro ---------- */
  add(790, {
    title: 'Capullo de estrellas', dur: 2.1, short: 0.85, cue: 0.72,
    sprite(l, k) { return { a: cl((k - 0.6) / 0.12), rise: 0, lift: 20 * (1 - ease(cl((k - 0.6) / 0.4))), flash: k > 0.72 && k < 0.78 }; },
    back() {},   // (sin la columna de la genérica)
    front(ctx, l, k, now) {
      ctx.save();
      const cy = l.y - 50, s = ease(cl((k - 0.1) / 0.3)), out = cl((k - 0.62) / 0.12);
      if (s > 0 && out < 1) {
        const pu = 0.5 + 0.5 * Math.sin(k * (20 + 50 * k));
        glow(ctx, l.x, cy, 40, 40, '#ffd860', (0.3 + 0.4 * pu) * (1 - out));
        ctx.globalAlpha = 1 - out; ctx.fillStyle = '#1a1438'; ctx.beginPath(); ctx.arc(l.x, cy, 20 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#d8b040'; ctx.beginPath(); ctx.ellipse(l.x, cy, 22 * s + 1, 5 * s + 1, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1438'; ctx.beginPath(); ctx.ellipse(l.x, cy - 1, 18 * s, 3 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe890'; ctx.globalAlpha = (0.4 + 0.6 * pu) * (1 - out); ctx.beginPath(); ctx.arc(l.x, cy - 8 * s, 3 * s, 0, TAU); ctx.fill();
      }
      // El polvo dorado: gira en espiral hacia la esfera.
      const p = cl((k - 0.04) / 0.5);
      if (p > 0 && p < 1) {
        for (let i = 0; i < 16; i++) {
          const t = cl(p * 1.4 - H(l.seed, i, 411) * 0.4), an = i / 16 * TAU + t * 6, d = 120 * (1 - t) + 20;
          if (t <= 0 || t >= 1) continue;
          ctx.globalAlpha = 1 - t * 0.5; ctx.fillStyle = i % 2 ? '#ffd860' : '#fff2b0';
          ctx.fillRect(Math.round(l.x + Math.cos(an) * d), Math.round(cy + Math.sin(an) * d * 0.45), 2, 2);
        }
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 30, 40, 44, '#ffd860', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 40, '#ffd860', 20, 180); G.FX.ring(l.x, l.y, 8, 120, '#8a7aff', 0.45, 4); shake(l, 0.4); }
  });

  /* ---------- Solgaleo (791): sale un sol con rayos que giran y él aparece en un círculo de luz de sol en el suelo ---------- */
  add(791, {
    title: 'Sol radiante', dur: 2.3, short: 0.9, cue: 0.74,
    sprite(l, k) { return { a: cl((k - 0.56) / 0.18), rise: 0, lift: 0, flash: k > 0.74 && k < 0.8, scan: k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // El sol, alto, detrás.
      const s = ease(cl((k - 0.04) / 0.26)) * (1 - cl((k - 0.84) / 0.16)), sy = l.y - 150;
      if (s > 0) {
        glow(ctx, l.x, sy, 90, 90, '#ffb040', 0.6 * s);
        ctx.fillStyle = '#ffd060';
        for (let i = 0; i < 12; i++) { const an = i / 12 * TAU + now * 0.6; ctx.globalAlpha = 0.8 * s; ctx.beginPath(); ctx.moveTo(l.x + Math.cos(an - 0.1) * 34 * s, sy + Math.sin(an - 0.1) * 34 * s); ctx.lineTo(l.x + Math.cos(an) * 58 * s, sy + Math.sin(an) * 58 * s); ctx.lineTo(l.x + Math.cos(an + 0.1) * 34 * s, sy + Math.sin(an + 0.1) * 34 * s); ctx.closePath(); ctx.fill(); }
        ctx.globalAlpha = s; ctx.fillStyle = '#ff9a2a'; ctx.beginPath(); ctx.arc(l.x, sy, 32 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(l.x, sy, 22 * s, 0, TAU); ctx.fill();
      }
      // El círculo de luz de sol en el suelo.
      const c = cl((k - 0.3) / 0.2) * (1 - cl((k - 0.86) / 0.14));
      if (c > 0) {
        glow(ctx, l.x, l.y, 90, 32, '#ffd060', 0.6 * c);
        ctx.globalAlpha = 0.5 * c; ctx.fillStyle = '#ffe890'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 70, 25, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9 * c; ctx.strokeStyle = '#ff9a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(l.x, l.y, 70, 25, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Un haz del sol al círculo.
      const b = cl((k - 0.36) / 0.1) * (1 - cl((k - 0.74) / 0.08));
      if (b > 0) { ctx.globalAlpha = 0.3 * b; ctx.fillStyle = '#fff2b0'; ctx.fillRect(Math.round(l.x - 26), Math.round(l.y - 150), 52, 150); glow(ctx, l.x, l.y - 75, 40, 80, '#ffd060', 0.4 * b); }
      if (k > 0.74) glow(ctx, l.x, l.y - 40, 56, 60, '#ffd060', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#ffd060', 26, 250); G.FX.ring(l.x, l.y, 10, 170, '#ff9a2a', 0.55, 6); shake(l, 1.1); }
  });

  /* ---------- Lunala (792): sale una luna llena, la tapa un eclipse y ella baja del círculo oscuro ---------- */
  add(792, {
    title: 'Ala de la luna llena', dur: 2.3, short: 0.9, cue: 0.76,
    sprite(l, k) { const e = cl((k - 0.44) / 0.32); return { a: cl((k - 0.44) / 0.1), rise: 0, lift: 170 * (1 - ease(e)), flash: k > 0.76 && k < 0.82 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const m = ease(cl((k - 0.04) / 0.2)) * (1 - cl((k - 0.84) / 0.16)), my = l.y - 170, ec = ease(cl((k - 0.22) / 0.22));
      if (m > 0) {
        glow(ctx, l.x, my, 70, 70, ec > 0.5 ? '#8a4aff' : '#e8e8ff', 0.6 * m);
        ctx.globalAlpha = m; ctx.fillStyle = '#e8e8f8'; ctx.beginPath(); ctx.arc(l.x, my, 34, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8c8e0'; ctx.beginPath(); ctx.arc(l.x - 10, my - 6, 7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(l.x + 9, my + 9, 5, 0, TAU); ctx.fill();
        // El eclipse: un disco oscuro que entra de lado y la tapa, con borde morado.
        if (ec > 0) {
          ctx.fillStyle = '#8a4aff'; ctx.beginPath(); ctx.arc(l.x + 70 * (1 - ec), my, 36, 0, TAU); ctx.fill();
          ctx.fillStyle = '#140a2a'; ctx.beginPath(); ctx.arc(l.x + 70 * (1 - ec), my, 33, 0, TAU); ctx.fill();
        }
      }
      dropShadow(ctx, l, cl((k - 0.44) / 0.32), 0, 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Polvo de estrellas que cae del eclipse.
      const d = cl((k - 0.3) / 0.1) * (1 - cl((k - 0.86) / 0.14));
      for (let i = 0; i < 12 && d > 0; i++) {
        const ph = (now * 0.4 + H(l.seed, i, 421)) % 1, x = l.x + (H(l.seed, i, 422) - 0.5) * 140 * ph, y = l.y - 160 + ph * 170;
        ctx.globalAlpha = d * (1 - ph); ctx.fillStyle = i % 2 ? '#c8a0ff' : '#ffffff'; star4(ctx, x, y, i % 3 ? 1 : 2);
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 40, 56, 60, '#8a4aff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#c8a0ff', 26, 240); G.FX.ring(l.x, l.y, 10, 170, '#8a4aff', 0.55, 6); shake(l, 1.0); }
  });

  /* ---------- Necrozma (800): cristales negros llegan volando y se juntan; rayos de luz salen de él y se apagan ---------- */
  add(800, {
    title: 'Prisma de luz', dur: 2.3, short: 0.9, cue: 0.72,
    sprite(l, k) { return { a: cl((k - 0.5) / 0.1), rise: 0, lift: 0, flash: k > 0.72 && k < 0.78 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Rayos de luz de colores que salen del centro y giran, y se apagan cuando llega.
      const r = cl((k - 0.48) / 0.06) * (1 - cl((k - 0.7) / 0.08));
      if (r > 0) {
        const cols = ['#ff6a6a', '#ffd860', '#8ae06a', '#6ac8ff', '#c89aff'];
        for (let i = 0; i < 10; i++) {
          const an = i / 10 * TAU + now * 1.5, x2 = l.x + Math.cos(an) * 200, y2 = l.y - 40 + Math.sin(an) * 90;
          ctx.globalAlpha = 0.5 * r; ctx.fillStyle = cols[i % 5];
          ctx.beginPath(); ctx.moveTo(l.x, l.y - 40); ctx.lineTo(x2 + Math.sin(an) * 10, y2 - Math.cos(an) * 10); ctx.lineTo(x2 - Math.sin(an) * 10, y2 + Math.cos(an) * 10); ctx.closePath(); ctx.fill();
        }
        glow(ctx, l.x, l.y - 40, 60, 60, '#ffffff', 0.6 * r);
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      for (let i = 0; i < 10; i++) {
        const t0 = 0.06 + i * 0.03, f = cl((k - t0) / 0.24);
        if (f <= 0 || k > 0.52) continue;
        const an = H(l.seed, i, 431) * TAU, e = ease(f), d = 220 * (1 - e) + 8, x = l.x + Math.cos(an) * d, y = l.y - 40 + Math.sin(an) * d * 0.5, s = 17 + 8 * H(l.seed, i, 432), rot = an + f * 6;
        ctx.globalAlpha = 1; ctx.fillStyle = '#1a1a2a'; ctx.beginPath();
        ctx.moveTo(x + Math.cos(rot) * s, y + Math.sin(rot) * s); ctx.lineTo(x + Math.cos(rot + 2.3) * s * 0.6, y + Math.sin(rot + 2.3) * s * 0.6); ctx.lineTo(x + Math.cos(rot + 4) * s * 0.6, y + Math.sin(rot + 4) * s * 0.6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#6ae8ff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 3, 3);
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 40, 56, 60, '#6ae8ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 40, '#ffffff', 22, 240); G.FX.burst(l.x, l.y - 40, '#1a1a2a', 14, 200); G.FX.ring(l.x, l.y, 10, 170, '#6ae8ff', 0.55, 6); shake(l, 1.1); }
  });

  /* ---------- Magearna (801): engranajes giran a su alrededor y un núcleo rosa entra en ella ---------- */
  function gear(ctx, x, y, r, rot, col) {
    ctx.fillStyle = col;
    for (let j = 0; j < 8; j++) { const a = rot + j / 8 * TAU; ctx.save(); ctx.translate(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.rotate(a); ctx.fillRect(-3, -3.5, 7, 7); ctx.restore(); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a3040'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill();
  }
  add(801, {
    title: 'Corazón de máquina', dur: 2.2, short: 0.9, cue: 0.72,
    sprite(l, k) { return { a: cl((k - 0.5) / 0.12), rise: 0, lift: 0, flash: k > 0.72 && k < 0.78, scan: k < 0.72 }; },
    back() {},   // (sin la columna de la genérica)
    front(ctx, l, k, now) {
      ctx.save();
      const g = ease(cl((k - 0.06) / 0.2)) * (1 - cl((k - 0.8) / 0.14));
      if (g > 0) {
        const P = [[-60, -60, 14, 1], [56, -78, 11, -1.4], [-40, -110, 9, 1.8], [44, -30, 12, -1.1], [0, -130, 8, 2]];
        for (let i = 0; i < 5; i++) {
          const [dx, dy, r0, sp] = P[i], r = r0 * 1.5;
          ctx.globalAlpha = g; gear(ctx, l.x + dx * (1.4 - 0.4 * g), l.y + dy, r, now * sp * 2, i % 2 ? '#c8a060' : '#a8a8b8');
        }
      }
      // El núcleo rosa: brilla en lo alto, baja y entra en ella al llegar.
      const c = cl((k - 0.2) / 0.1) * (1 - cl((k - 0.72) / 0.04)), y = l.y - 130 + 90 * ease(cl((k - 0.44) / 0.28));
      if (c > 0) {
        const pu = 0.8 + 0.2 * Math.sin(now * 8);
        glow(ctx, l.x, y, 26, 26, '#ff6aa8', 0.8 * c);
        ctx.globalAlpha = c; ctx.fillStyle = '#ff6aa8'; ctx.beginPath(); ctx.arc(l.x, y, 8 * pu, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe0ee'; ctx.beginPath(); ctx.arc(l.x - 2, y - 2, 3, 0, TAU); ctx.fill();
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 34, 46, 50, '#ff6aa8', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 34, '#ff6aa8', 20, 200); G.FX.burst(l.x, l.y - 34, '#c8a060', 10, 180); G.FX.ring(l.x, l.y, 8, 130, '#ff6aa8', 0.5, 5); shake(l, 0.5); }
  });

  /* ---------- Marshadow (802): una sombra se mueve por el suelo a saltos, se para y él sale de ella entre llamas verdes ---------- */
  const MSH = [[-150, 30], [110, -20], [-60, -30], [0, 0]];
  const mshPos = k => { const s = cl((k - 0.06) / 0.48) * 3, i = Math.min(2, Math.floor(s)), q = ease(cl((s - i) * 1.6)); const a = MSH[i], b = MSH[i + 1]; return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q]; };
  add(802, {
    title: 'Sombra del luchador', dur: 2.1, short: 0.85, cue: 0.68,
    sprite(l, k) { return { a: k > 0.56 ? 1 : 0, rise: 1 - ease(cl((k - 0.56) / 0.14)), lift: 0, flash: k > 0.68 && k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const on = cl((k - 0.04) / 0.06) * (1 - cl((k - 0.76) / 0.14));
      if (on > 0) {
        const [dx, dy] = mshPos(k);
        ctx.globalAlpha = 0.75 * on; ctx.fillStyle = '#0e0a14';
        ctx.beginPath(); ctx.ellipse(l.x + dx, l.y + dy, 40, 15, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(l.x + dx - 18, l.y + dy - 3, 12, 6, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(l.x + dx + 16, l.y + dy + 2, 10, 5, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Llamas verdes que suben de la sombra al salir.
      const f = cl((k - 0.54) / 0.06) * (1 - cl((k - 0.82) / 0.14));
      if (f > 0) {
        for (let i = 0; i < 9; i++) {
          const ph = (now * 1.6 + H(l.seed, i, 441)) % 1, x = l.x + (H(l.seed, i, 442) - 0.5) * 50, y = l.y - ph * 70;
          ctx.globalAlpha = f * (1 - ph); ctx.fillStyle = i % 2 ? '#4ae86a' : '#a8ffb0';
          ctx.beginPath(); ctx.ellipse(x, y, 5 * (1 - ph) + 1, 9 * (1 - ph) + 1, 0, 0, TAU); ctx.fill();
        }
        glow(ctx, l.x, l.y - 30, 40, 40, '#4ae86a', 0.5 * f);
      }
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#4ae86a', 22, 220); G.FX.ring(l.x, l.y, 8, 130, '#2a1a3a', 0.5, 5); shake(l, 0.7); }
  });

  /* ---------- Zeraora (807): cruza a saltos de rayo dejando imágenes, frena y deja tres zarpazos de luz ---------- */
  const ZER = [[-200, -20], [-90, 40], [-140, -40], [0, 0]];
  const zerPos = k => { const s = cl((k - 0.12) / 0.42) * 3, i = Math.min(2, Math.floor(s)), q = cl((s - i) * 3); const a = ZER[i], b = ZER[i + 1]; return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q]; };
  add(807, {
    title: 'Zarpa del trueno', dur: 2.0, short: 0.8, cue: 0.6,
    sprite(l, k) { const [dx, dy] = zerPos(k); return { a: cl((k - 0.12) / 0.04), rise: 0, lift: -dy, ox: dx, flash: k > 0.6 && k < 0.66 }; },
    back(ctx, l, k, now) {
      ctx.save();
      // Imágenes que deja en cada salto.
      for (let j = 0; j < 3; j++) {
        const t = 0.12 + (j + 1) / 3 * 0.42 - 0.02, f = cl((k - t) / 0.2);
        if (f <= 0 || f >= 1 || !l.an) continue;
        const [dx, dy] = ZER[j];
        l.an.draw(ctx, l.x + dx, l.y + dy, { alpha: 0.4 * (1 - f), flash: true });
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Rayo entre salto y salto.
      for (let j = 0; j < 3; j++) {
        const t = 0.12 + (j + 1) / 3 * 0.42, f = cl((k - t + 0.1) / 0.12);
        if (f <= 0 || f >= 1) continue;
        const a = ZER[j], b = ZER[j + 1];
        ctx.globalAlpha = 1 - f; ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 2; ctx.beginPath();
        jag(ctx, l.x + a[0], l.y + a[1] - 30, l.x + b[0], l.y + b[1] - 30, 6, 8, l.seed + j); ctx.stroke();
        glow(ctx, l.x + (a[0] + b[0]) / 2, l.y + (a[1] + b[1]) / 2 - 30, 60, 30, '#fff27a', 0.5 * (1 - f));
      }
      // Tres zarpazos de luz delante de él.
      const z = cl((k - 0.58) / 0.06) * (1 - cl((k - 0.8) / 0.14));
      if (z > 0) {
        ctx.strokeStyle = '#6ad8ff'; ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = z; ctx.beginPath(); ctx.ellipse(l.x + 40, l.y - 40 + (i - 1) * 12, 26, 12, -0.4, -1.2, -1.2 + 1.8 * z); ctx.stroke();
        }
        glow(ctx, l.x + 44, l.y - 40, 30, 30, '#6ad8ff', 0.6 * z);
      }
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#fff27a', 24, 240); G.FX.ring(l.x, l.y, 8, 140, '#6ad8ff', 0.5, 5); shake(l, 0.8); }
  });

  /* ---------- Meltan (808): tuercas sueltas llegan rodando, se funden en un charco de metal y él sale de él ---------- */
  add(808, {
    title: 'Tuerca errante', dur: 1.9, short: 0.8, cue: 0.68,
    sprite(l, k) { return { a: k > 0.5 ? 1 : 0, rise: 1 - ease(cl((k - 0.5) / 0.18)), lift: 0, flash: k > 0.68 && k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const p = ease(cl((k - 0.3) / 0.2)) * (1 - cl((k - 0.86) / 0.14));
      if (p > 0) {
        ctx.globalAlpha = 0.95; ctx.fillStyle = '#7a8090'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 40 * p, 14 * p, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8ccd8'; ctx.beginPath(); ctx.ellipse(l.x - 8 * p, l.y - 3 * p, 16 * p, 4 * p, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      for (let i = 0; i < 8; i++) {
        const t0 = 0.04 + H(l.seed, i, 451) * 0.1, f = cl((k - t0) / 0.3);
        if (f <= 0 || f >= 1) continue;
        const an = i / 8 * TAU, d = 170 * (1 - ease(f)), x = l.x + Math.cos(an) * d, y = l.y + Math.sin(an) * d * 0.4 - 6;
        ctx.globalAlpha = 1 - cl((f - 0.85) / 0.15); nut(ctx, x, y + 1, 10, f * 10 + i, '#3a3e4a', '#3a3e4a'); nut(ctx, x, y, 9, f * 10 + i, '#b8bcc8', '#3a3e4a');
      }
      if (k > 0.68) glow(ctx, l.x, l.y - 20, 30, 30, '#ffd860', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 10, '#c8ccd8', 18, 180); G.FX.ring(l.x, l.y, 8, 100, '#9aa0b0', 0.45, 4); shake(l, 0.3); }
  });

  /* ---------- Melmetal (809): un remolino de tuercas sube en columna, se funde en metal brillante y cae él, pesado ---------- */
  add(809, {
    title: 'Gigante de metal fundido', dur: 2.4, short: 0.95, cue: 0.76,
    sprite(l, k) { const e = cl((k - 0.64) / 0.12); return { a: cl((k - 0.64) / 0.04), rise: 0, lift: 60 * (1 - e * e), flash: k > 0.76 && k < 0.82 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const g = cl((k - 0.76) / 0.03) * (1 - cl((k - 0.9) / 0.1));
      if (g > 0) {
        ctx.strokeStyle = '#3a3e4a'; ctx.lineWidth = 2; ctx.globalAlpha = g; ctx.beginPath();
        for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + 0.4; jag(ctx, l.x, l.y, l.x + Math.cos(an) * 80, l.y + Math.sin(an) * 28, 4, 5, l.seed + i); }
        ctx.stroke();
      }
      dropShadow(ctx, l, cl((k - 0.5) / 0.26), 0, 0.4);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // El remolino de tuercas que sube.
      const w = cl((k - 0.06) / 0.1) * (1 - cl((k - 0.52) / 0.08));
      if (w > 0) {
        for (let i = 0; i < 18; i++) {
          const t = (H(l.seed, i, 461) + k * 1.2) % 1, an = i * 1.7 + now * 5, r = 70 - 40 * t;
          ctx.globalAlpha = w; nut(ctx, l.x + Math.cos(an) * r, l.y - 10 - t * 120 + Math.sin(an) * r * 0.3, 8, an, i % 3 ? '#9aa0b0' : '#d8b040', '#3a3e4a');
        }
      }
      // La columna de metal fundido que crece y se recoge en él.
      const c = ease(cl((k - 0.3) / 0.24)) * (1 - ease(cl((k - 0.62) / 0.12)));
      if (c > 0) {
        const h = 140 * c, top = l.y - h;
        glow(ctx, l.x, l.y - h / 2, 40, h / 2 + 10, '#e8ecf4', 0.5 * c);
        ctx.globalAlpha = 0.95; ctx.fillStyle = '#8a90a0'; ctx.fillRect(Math.round(l.x - 22), Math.round(top), 44, Math.round(h));
        ctx.fillStyle = '#d8dce8'; ctx.fillRect(Math.round(l.x - 14), Math.round(top), 8, Math.round(h));
        ctx.fillStyle = '#5a6070'; ctx.fillRect(Math.round(l.x + 12), Math.round(top), 6, Math.round(h));
        ctx.fillStyle = '#8a90a0'; ctx.beginPath(); ctx.ellipse(l.x, top, 22, 8, 0, 0, TAU); ctx.fill();
      }
      if (k > 0.76) glow(ctx, l.x, l.y - 40, 56, 60, '#d8b040', 0.28 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 10, '#9aa0b0', 28, 260); G.FX.ring(l.x, l.y, 10, 180, '#d8b040', 0.55, 6); shake(l, 1.4); }
  });

  // ================= tanda 7 (26-11-2026): octava generación =================

  /* ---------- Zacian (888): dos tajos de luz cruzan el suelo en X; de la cruz suben pétalos de luz y aparece ---------- */
  const zacCut = (l, j) => { const sg = j ? -1 : 1; return [l.x - 120, l.y - 42 * sg, l.x + 120, l.y + 42 * sg]; };
  add(888, {
    title: 'Espada del héroe', dur: 2.1, short: 0.85, cue: 0.66,
    sprite(l, k) { return { a: cl((k - 0.54) / 0.12), rise: 0, lift: 0, flash: k > 0.66 && k < 0.72 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const o = 1 - cl((k - 0.82) / 0.16);
      for (let j = 0; j < 2; j++) {
        const f = cl((k - 0.12 - j * 0.16) / 0.1);
        if (f <= 0 || o <= 0) continue;
        const [x0, y0, x1, y1] = zacCut(l, j), xe = x0 + (x1 - x0) * f, ye = y0 + (y1 - y0) * f;
        glow(ctx, (x0 + xe) / 2, (y0 + ye) / 2, 70 * f + 10, 22, '#6ac8ff', 0.5 * o);
        ctx.globalAlpha = 0.9 * o; ctx.strokeStyle = '#ff7ac0'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(xe, ye); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(xe, ye); ctx.stroke();
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // La hoja que corta: una media luna de luz en la punta de cada tajo.
      for (let j = 0; j < 2; j++) {
        const f = cl((k - 0.12 - j * 0.16) / 0.1);
        if (f <= 0 || f >= 1) continue;
        const [x0, y0, x1, y1] = zacCut(l, j), x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f - 30, an = Math.atan2(y1 - y0, x1 - x0);
        glow(ctx, x, y, 40, 40, '#6ac8ff', 0.7);
        ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(x, y, 30, an - 1.9, an - 0.3); ctx.stroke();
        ctx.strokeStyle = '#ff7ac0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 35, an - 1.8, an - 0.4); ctx.stroke();
      }
      // Pétalos de luz que suben de la cruz.
      const p = cl((k - 0.42) / 0.06) * (1 - cl((k - 0.8) / 0.16));
      for (let i = 0; i < 14 && p > 0; i++) {
        const ph = (now * 0.7 + H(l.seed, i, 471)) % 1, x = l.x + (H(l.seed, i, 472) - 0.5) * 130 + Math.sin(now * 3 + i) * 6, y = l.y - ph * 130;
        ctx.globalAlpha = p * (1 - ph); ctx.fillStyle = i % 2 ? '#ff9ad0' : '#a8e0ff';
        ctx.beginPath(); ctx.ellipse(x, y, 4, 2, now * 2 + i, 0, TAU); ctx.fill();
      }
      if (k > 0.66) glow(ctx, l.x, l.y - 34, 50, 54, '#6ac8ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#ff9ad0', 22, 230); G.FX.burst(l.x, l.y - 30, '#a8e0ff', 14, 200); G.FX.ring(l.x, l.y, 10, 160, '#6ac8ff', 0.5, 5); shake(l, 0.9); }
  });

  /* ---------- Zamazenta (889): sube un escudo de luz, aguanta tres golpes y se rompe en pedazos; detrás está él ---------- */
  function shield(ctx, x, y, r) {
    ctx.fillStyle = '#d8a040'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    for (let j = 0; j < 4; j++) {
      const a = j / 4 * TAU + Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.3) * r, y + Math.sin(a - 0.3) * r); ctx.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35); ctx.lineTo(x + Math.cos(a + 0.3) * r, y + Math.sin(a + 0.3) * r); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#b8283a'; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd860'; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e84a5a'; ctx.fillRect(Math.round(x - r * 0.6), Math.round(y - r * 0.5), Math.round(r * 0.2), Math.round(r));
  }
  add(889, {
    title: 'Escudo del héroe', dur: 2.2, short: 0.9, cue: 0.6,
    sprite(l, k) { return { a: k > 0.56 ? 1 : 0, rise: 0, lift: 0, flash: k > 0.6 && k < 0.66 }; },
    back() {},   // (sin la columna de la genérica)
    front(ctx, l, k, now) {
      ctx.save();
      const u = ease(cl((k - 0.06) / 0.18)), cy = l.y - 50 * u;
      if (u > 0 && k < 0.56) {
        let hit = 0;
        for (let j = 0; j < 3; j++) { const f = cl((k - 0.3 - j * 0.08) / 0.07); if (f > 0 && f < 1) hit = Math.max(hit, 1 - f); }
        glow(ctx, l.x, cy, 70, 70, '#ffd860', 0.4 + 0.4 * hit);
        ctx.globalAlpha = 1; shield(ctx, l.x + (hit ? (H(l.seed, Math.floor(k * 200), 481) - 0.5) * 6 : 0), cy, 54 * u + 1);
        for (let j = 0; j < 3; j++) {
          const f = cl((k - 0.3 - j * 0.08) / 0.07);
          if (f <= 0 || f >= 1) continue;
          ctx.globalAlpha = 1 - f; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(l.x, cy, 60 + 40 * f, 0, TAU); ctx.stroke();
        }
        // Grietas que crecen con cada golpe.
        const cr = cl((k - 0.32) / 0.22);
        if (cr > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = '#2a0a10'; ctx.lineWidth = 2; ctx.beginPath(); for (let j = 0; j < 4; j++) { const a = j * 1.7 + 0.5; jag(ctx, l.x, cy, l.x + Math.cos(a) * 40 * cr, cy + Math.sin(a) * 52 * cr, 4, 4, l.seed + j); } ctx.stroke(); }
      }
      // Pedazos del escudo que saltan.
      const s = cl((k - 0.56) / 0.3);
      if (s > 0 && s < 1) {
        for (let i = 0; i < 12; i++) {
          const an = i / 12 * TAU + H(l.seed, i, 482), d = 30 + 140 * s, x = l.x + Math.cos(an) * d, y = l.y - 50 + Math.sin(an) * d * 0.6 + 120 * s * s, sz = 7 + 4 * H(l.seed, i, 483);
          ctx.globalAlpha = 1 - s; ctx.fillStyle = i % 3 ? '#b8283a' : '#d8a040';
          ctx.save(); ctx.translate(x, y); ctx.rotate(s * 8 + i); ctx.fillRect(-sz / 2, -sz / 3, sz, sz * 0.66); ctx.restore();
        }
      }
      if (k > 0.6) glow(ctx, l.x, l.y - 34, 50, 54, '#e84a5a', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    tick(l, k) {
      for (let j = 0; j < 3; j++) { const key = 'zh' + j; if (k > 0.3 + j * 0.08 && !l[key]) { l[key] = 1; shake(l, 0.35); } }
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 40, '#ffd860', 24, 240); G.FX.ring(l.x, l.y, 10, 160, '#e84a5a', 0.5, 5); shake(l, 1.0); }
  });

  /* ---------- Eternatus (890): el cielo se vuelve rojo, sube una columna de energía entre pinchos rojos y él sale del suelo ---------- */
  add(890, {
    title: 'Noche sin fin', dur: 2.5, short: 1.0, cue: 0.74,
    sprite(l, k) { return { a: k > 0.5 ? 1 : 0, rise: 1 - ease(cl((k - 0.5) / 0.22)), lift: 0, flash: k > 0.74 && k < 0.8 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const t = cl((k - 0.02) / 0.2) * (1 - cl((k - 0.82) / 0.18));
      if (t > 0) { ctx.globalAlpha = 0.38 * t; ctx.fillStyle = '#3a0618'; ctx.fillRect(Math.round(l.x - 900), Math.round(l.y - 600), 1800, 1000); }
      // Corro de pinchos rojos que salen del suelo.
      const s = ease(cl((k - 0.16) / 0.2)) * (1 - cl((k - 0.86) / 0.14));
      if (s > 0) {
        for (let i = 0; i < 8; i++) {
          const an = i / 8 * TAU, x = l.x + Math.cos(an) * 95, y = l.y + Math.sin(an) * 34, h = (42 + 18 * H(l.seed, i, 491)) * s;
          ctx.globalAlpha = 1; ctx.fillStyle = '#6a0a2a'; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x, y - h); ctx.lineTo(x + 9, y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ff3a5a'; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x, y - h * 0.8); ctx.lineTo(x + 3, y); ctx.closePath(); ctx.fill();
        }
        glow(ctx, l.x, l.y, 110, 40, '#ff3a5a', 0.5 * s);
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // La columna de energía.
      const c = ease(cl((k - 0.26) / 0.16)) * (1 - cl((k - 0.7) / 0.1));
      if (c > 0) {
        const h = 280 * c, w = 52 + 8 * Math.sin(now * 20);
        glow(ctx, l.x, l.y - h / 2, w + 20, h / 2 + 10, '#ff3a5a', 0.6 * c);
        ctx.globalAlpha = 0.55 * c; ctx.fillStyle = '#ff3a5a'; ctx.fillRect(Math.round(l.x - w / 2), Math.round(l.y - h), Math.round(w), Math.round(h));
        ctx.globalAlpha = 0.85 * c; ctx.fillStyle = '#ffc0d0'; ctx.fillRect(Math.round(l.x - 9), Math.round(l.y - h), 18, Math.round(h));
        for (let i = 0; i < 8; i++) {
          const ph = (now * 1.2 + i / 8) % 1, y = l.y - ph * h;
          ctx.globalAlpha = c * (1 - ph); ctx.strokeStyle = '#ff8aa0'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(l.x, y, w * 0.9 + 4, 6, 0, 0, TAU); ctx.stroke();
        }
      }
      if (k > 0.74) glow(ctx, l.x, l.y - 60, 80, 80, '#ff3a5a', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 50, '#ff3a5a', 30, 280); G.FX.burst(l.x, l.y - 50, '#a03ad0', 14, 220); G.FX.ring(l.x, l.y, 12, 200, '#ff3a5a', 0.6, 7); shake(l, 1.5); }
  });

  /* ---------- Kubfu (891): llega dando tres saltitos que levantan polvo y suelta un puñetazo al aire ---------- */
  const KUB = [-170, -110, -55, 0];
  const kubHop = k => { const s = cl((k - 0.1) / 0.48) * 3, i = Math.min(2, Math.floor(s)), q = s - i; return { ox: KUB[i] + (KUB[i + 1] - KUB[i]) * q, lift: 36 * Math.sin(Math.PI * q) }; };
  add(891, {
    title: 'Pequeño aprendiz', dur: 1.9, short: 0.8, cue: 0.68,
    sprite(l, k) { const h = kubHop(k); return { a: k > 0.1 ? 1 : 0, rise: 0, lift: h.lift, ox: h.ox, flash: k > 0.68 && k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const h = kubHop(k);
      if (k > 0.1 && k < 0.6) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#0b0f1a'; ctx.beginPath(); ctx.ellipse(l.x + h.ox, l.y, 16, 6, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Polvo al caer de cada salto.
      for (let j = 0; j < 3; j++) {
        const f = cl((k - 0.1 - (j + 1) / 3 * 0.48) / 0.16);
        if (f <= 0 || f >= 1) continue;
        for (let i = 0; i < 4; i++) {
          const sx = i < 2 ? -1 : 1, x = l.x + KUB[j + 1] + sx * (8 + 22 * f) * (1 + (i % 2) * 0.5), y = l.y - 4 - 8 * f * (i % 2);
          ctx.globalAlpha = 0.7 * (1 - f); ctx.fillStyle = '#d8c8a8'; ctx.beginPath(); ctx.arc(x, y, 4 + 5 * f, 0, TAU); ctx.fill();
        }
      }
      // El puñetazo: líneas de golpe delante de él.
      const p = cl((k - 0.66) / 0.04) * (1 - cl((k - 0.8) / 0.1));
      if (p > 0) {
        ctx.globalAlpha = p; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36, r0 = 12, r1 = 22 + 10 * (i % 2); ctx.moveTo(l.x + 34 + Math.cos(a) * r0, l.y - 26 + Math.sin(a) * r0); ctx.lineTo(l.x + 34 + Math.cos(a) * r1, l.y - 26 + Math.sin(a) * r1); }
        ctx.stroke(); glow(ctx, l.x + 34, l.y - 26, 22, 22, '#ffb060', 0.6 * p);
      }
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x + 30, l.y - 26, '#ffb060', 16, 180); G.FX.ring(l.x, l.y, 8, 100, '#d8c8a8', 0.4, 4); shake(l, 0.4); }
  });

  /* ---------- Urshifu (892): un pergamino se desenrolla en el aire, arde en llamas negras y él cae de un golpe ---------- */
  add(892, {
    title: 'Maestro del puño oscuro', dur: 2.2, short: 0.9, cue: 0.66,
    sprite(l, k) { const e = cl((k - 0.5) / 0.16); return { a: k > 0.5 ? 1 : 0, rise: 0, lift: 120 * (1 - e * e), flash: k > 0.66 && k < 0.72 }; },
    back(ctx, l, k, now) { ctx.save(); dropShadow(ctx, l, cl((k - 0.5) / 0.16), 0, 0.4); ctx.restore(); },
    front(ctx, l, k, now) {
      ctx.save();
      const sy = l.y - 130, w = 160 * ease(cl((k - 0.06) / 0.18)), burn = cl((k - 0.36) / 0.18);
      if (w > 1 && burn < 1) {
        const hw = w / 2 * (1 - burn * 0.3), top = sy - 26 + burn * 10, hh = 64 * (1 - burn);
        ctx.globalAlpha = 1 - burn;
        ctx.fillStyle = '#f0e0c0'; ctx.fillRect(Math.round(l.x - hw), Math.round(top), Math.round(hw * 2), Math.round(hh));
        ctx.fillStyle = '#8a5a2a'; ctx.fillRect(Math.round(l.x - hw - 4), Math.round(top - 3), 5, Math.round(hh + 6)); ctx.fillRect(Math.round(l.x + hw - 1), Math.round(top - 3), 5, Math.round(hh + 6));
        // Trazos de tinta (sin letras de verdad).
        const ink = cl((k - 0.2) / 0.14);
        ctx.fillStyle = '#1a1018';
        for (let i = 0; i < 4; i++) { const x = l.x - 42 + i * 26; if (Math.abs(x - l.x) + 6 > hw) continue; ctx.fillRect(Math.round(x), Math.round(top + 8), 5, Math.round((hh - 16) * ink * (0.6 + 0.4 * H(l.seed, i, 501)))); ctx.fillRect(Math.round(x - 5), Math.round(top + 14 + 8 * (i % 2)), Math.round(14 * ink), 4); }
      }
      // Llamas negras con borde morado que se comen el pergamino.
      const f = cl((k - 0.32) / 0.06) * (1 - cl((k - 0.62) / 0.1));
      for (let i = 0; i < 10 && f > 0; i++) {
        const ph = (now * 1.8 + H(l.seed, i, 502)) % 1, x = l.x + (H(l.seed, i, 503) - 0.5) * 130, y = sy + 20 - ph * 70;
        ctx.globalAlpha = f * (1 - ph); ctx.fillStyle = '#8a3ad0'; ctx.beginPath(); ctx.ellipse(x, y, 9 * (1 - ph) + 2, 14 * (1 - ph) + 2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a0a20'; ctx.beginPath(); ctx.ellipse(x, y + 2, 6 * (1 - ph) + 1, 10 * (1 - ph) + 1, 0, 0, TAU); ctx.fill();
      }
      if (k > 0.66) glow(ctx, l.x, l.y - 40, 50, 54, '#8a3ad0', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 10, '#1a0a20', 22, 240); G.FX.burst(l.x, l.y - 10, '#8a3ad0', 12, 200); G.FX.ring(l.x, l.y, 10, 170, '#8a3ad0', 0.55, 6); shake(l, 1.2); }
  });

  /* ---------- Regieleki (894): líneas de corriente recorren el suelo como un circuito y se juntan en él ---------- */
  const elePath = (l, i) => { const an = i / 6 * TAU + 0.3, c = Math.cos(an), s = Math.sin(an); return [[l.x + c * 250, l.y + s * 95], [l.x + c * 70, l.y + s * 95], [l.x + c * 70, l.y], [l.x, l.y]]; };
  add(894, {
    title: 'Rey de la electricidad', dur: 2.0, short: 0.8, cue: 0.62,
    sprite(l, k) { return { a: cl((k - 0.52) / 0.1), rise: 0, lift: 0, flash: k > 0.62 && k < 0.68 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const f = cl((k - 0.08) / 0.42), o = 1 - cl((k - 0.8) / 0.16);
      if (f > 0 && o > 0) {
        for (let i = 0; i < 6; i++) {
          const P = elePath(l, i), L = [0]; for (let j = 1; j < 4; j++) L.push(L[j - 1] + Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]));
          const want = L[3] * f; let hx = P[0][0], hy = P[0][1];
          ctx.globalAlpha = 0.9 * o; ctx.strokeStyle = '#ffe23a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
          for (let j = 1; j < 4; j++) {
            if (want <= L[j - 1]) break;
            const q = Math.min(1, (want - L[j - 1]) / (L[j] - L[j - 1] || 1));
            hx = P[j - 1][0] + (P[j][0] - P[j - 1][0]) * q; hy = P[j - 1][1] + (P[j][1] - P[j - 1][1]) * q; ctx.lineTo(hx, hy);
          }
          ctx.stroke();
          ctx.fillStyle = '#ffe23a'; ctx.fillRect(Math.round(P[0][0] - 4), Math.round(P[0][1] - 4), 8, 8);
          if (f < 1) { glow(ctx, hx, hy, 18, 18, '#fff7a0', 0.9); ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(hx - 3), Math.round(hy - 3), 6, 6); }
        }
      }
      const c = cl((k - 0.46) / 0.06) * o;
      if (c > 0) { glow(ctx, l.x, l.y, 60, 24, '#ffe23a', 0.7 * c); ctx.globalAlpha = c; ctx.strokeStyle = '#fff7a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(l.x, l.y, 40, 15, 0, 0, TAU); ctx.stroke(); }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const z = cl((k - 0.48) / 0.04) * (1 - cl((k - 0.66) / 0.06));
      if (z > 0) { ctx.globalAlpha = z; ctx.strokeStyle = '#fff7a0'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 3; i++) jag(ctx, l.x, l.y - 160, l.x + (i - 1) * 16, l.y - 20, 6, 10, l.seed + i + Math.floor(now * 20)); ctx.stroke(); }
      if (k > 0.62) glow(ctx, l.x, l.y - 34, 50, 54, '#ffe23a', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#ffe23a', 26, 260); G.FX.ring(l.x, l.y, 10, 160, '#fff7a0', 0.5, 5); shake(l, 0.9); }
  });

  /* ---------- Regidrago (895): una cinta de energía de dragón da vueltas en espiral y se cierra en él ---------- */
  const draPos = (l, t) => { const an = t * 9, r = 170 * (1 - t) + 6; return [l.x + Math.cos(an) * r, l.y - 40 - 30 * (1 - t) + Math.sin(an) * r * 0.42]; };
  add(895, {
    title: 'Rey del dragón', dur: 2.2, short: 0.9, cue: 0.68,
    sprite(l, k) { return { a: cl((k - 0.56) / 0.1), rise: 0, lift: 0, flash: k > 0.68 && k < 0.74 }; },
    back() {},   // (sin la columna de la genérica)
    front(ctx, l, k, now) {
      ctx.save();
      const T = cl((k - 0.06) / 0.52);
      if (T > 0 && T < 1) {
        for (let j = 16; j >= 0; j--) {
          const t = T - j * 0.022;
          if (t <= 0) continue;
          const [x, y] = draPos(l, t), r = (j ? 13 - j * 0.5 : 17);
          ctx.globalAlpha = 1; ctx.fillStyle = j % 2 ? '#6a2ab8' : '#3ac88a';
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
          if (!j) {
            const [px, py] = draPos(l, Math.max(0, t - 0.01)), an = Math.atan2(y - py, x - px);
            ctx.fillStyle = '#3ac88a';
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + Math.cos(an + s * 0.5) * 8, y + Math.sin(an + s * 0.5) * 8); ctx.lineTo(x + Math.cos(an + s * 0.35) * 32, y + Math.sin(an + s * 0.35) * 32); ctx.lineTo(x + Math.cos(an) * 10, y + Math.sin(an) * 10); ctx.closePath(); ctx.fill(); }
            ctx.fillStyle = '#ffe860'; ctx.fillRect(Math.round(x - 2), Math.round(y - 4), 3, 3);
            glow(ctx, x, y, 30, 30, '#3ac88a', 0.6);
          }
        }
      }
      const c = cl((k - 0.52) / 0.06) * (1 - cl((k - 0.72) / 0.06));
      if (c > 0) glow(ctx, l.x, l.y - 40, 60, 60, '#a06aff', 0.7 * c);
      if (k > 0.68) glow(ctx, l.x, l.y - 40, 56, 60, '#3ac88a', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 40, '#3ac88a', 22, 240); G.FX.burst(l.x, l.y - 40, '#6a2ab8', 14, 200); G.FX.ring(l.x, l.y, 10, 170, '#3ac88a', 0.5, 5); shake(l, 1.0); }
  });

  /* ---------- Glastrier (896): tres pisadas de hielo se acercan haciendo brotar carámbanos y cae él de un salto ---------- */
  const GLA = [[-170, 14], [-100, -18], [-40, 10]];
  function icicle(ctx, x, y, h, w) {
    ctx.fillStyle = '#a8e0ff'; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x - w * 0.3, y); ctx.lineTo(x, y - h * 0.8); ctx.lineTo(x + w * 0.1, y); ctx.closePath(); ctx.fill();
  }
  add(896, {
    title: 'Corcel del hielo', dur: 2.2, short: 0.9, cue: 0.64,
    sprite(l, k) { const e = cl((k - 0.5) / 0.14); return { a: k > 0.5 ? 1 : 0, rise: 0, lift: 110 * (1 - e * e), ox: -30 * (1 - e), flash: k > 0.64 && k < 0.7 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const o = 1 - cl((k - 0.84) / 0.16);
      for (let j = 0; j < 3; j++) {
        const f = cl((k - 0.1 - j * 0.12) / 0.06);
        if (f <= 0 || o <= 0) continue;
        const x = l.x + GLA[j][0], y = l.y + GLA[j][1];
        ctx.globalAlpha = 0.8 * o; ctx.fillStyle = '#d8f0ff'; ctx.beginPath(); ctx.ellipse(x, y, 22 * f, 8 * f, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#6ab8e8'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; jag(ctx, x, y, x + Math.cos(a) * 34 * f, y + Math.sin(a) * 12 * f, 3, 3, l.seed + j * 7 + i); } ctx.stroke();
      }
      const g = cl((k - 0.64) / 0.04) * o;
      if (g > 0) { ctx.globalAlpha = 0.6 * g; ctx.fillStyle = '#d8f0ff'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 80, 28, 0, 0, TAU); ctx.fill(); }
      dropShadow(ctx, l, cl((k - 0.5) / 0.14), -30 * (1 - cl((k - 0.5) / 0.14)), 0.35);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      // Carámbanos en cada pisada.
      for (let j = 0; j < 3; j++) {
        const f = cl((k - 0.1 - j * 0.12) / 0.06), d = 1 - cl((k - 0.3 - j * 0.12) / 0.2);
        if (f <= 0 || d <= 0) continue;
        ctx.globalAlpha = d;
        for (let i = 0; i < 3; i++) icicle(ctx, l.x + GLA[j][0] + (i - 1) * 14, l.y + GLA[j][1] + 2 - (i % 2) * 4, (22 + 10 * (i % 2)) * f * d, 6);
      }
      // Corro de carámbanos grandes al caer.
      const g = cl((k - 0.64) / 0.05) * (1 - cl((k - 0.84) / 0.14));
      if (g > 0) { ctx.globalAlpha = 1; for (let i = 0; i < 7; i++) { const an = i / 7 * TAU + 0.2; icicle(ctx, l.x + Math.cos(an) * 70, l.y + Math.sin(an) * 25, (30 + 12 * H(l.seed, i, 511)) * g, 8); } }
      if (k > 0.64) glow(ctx, l.x, l.y - 40, 56, 60, '#a8e0ff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    tick(l, k) { for (let j = 0; j < 3; j++) { const key = 'gp' + j; if (k > 0.1 + j * 0.12 && !l[key]) { l[key] = 1; shake(l, 0.3); } } },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 10, '#d8f0ff', 26, 250); G.FX.ring(l.x, l.y, 10, 170, '#6ab8e8', 0.55, 6); shake(l, 1.3); }
  });

  /* ---------- Spectrier (897): fuegos fatuos y su silueta de fantasma galopan en corro cerrándose, y toma cuerpo ---------- */
  const speAt = (l, k) => { const e = ease(cl((k - 0.08) / 0.48)), an = k * 16, r = 160 * (1 - e); return [l.x + Math.cos(an) * r, l.y + Math.sin(an) * r * 0.4]; };
  add(897, {
    title: 'Corcel de las sombras', dur: 2.2, short: 0.9, cue: 0.68,
    sprite(l, k) { return { a: cl((k - 0.52) / 0.16), rise: 0, lift: 0, flash: k > 0.68 && k < 0.74 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const on = cl((k - 0.06) / 0.06) * (1 - cl((k - 0.56) / 0.08));
      if (on > 0 && l.an) {
        for (let j = 3; j >= 0; j--) { const [x, y] = speAt(l, k - j * 0.025); l.an.draw(ctx, x, y, { alpha: on * (j ? 0.22 - j * 0.04 : 0.45), flash: true }); }
      }
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const w = cl((k - 0.04) / 0.08) * (1 - cl((k - 0.7) / 0.14));
      for (let i = 0; i < 7 && w > 0; i++) {
        const e = ease(cl((k - 0.08) / 0.5)), an = i / 7 * TAU - now * 2.5, r = 150 * (1 - e * 0.7), x = l.x + Math.cos(an) * r, y = l.y - 30 + Math.sin(an) * r * 0.4 + Math.sin(now * 5 + i) * 6, fl = 0.8 + 0.2 * Math.sin(now * 11 + i);
        glow(ctx, x, y, 18, 18, '#6a5aff', 0.6 * w);
        ctx.globalAlpha = w; ctx.fillStyle = '#4a3ad0'; ctx.beginPath(); ctx.ellipse(x, y, 7 * fl, 11 * fl, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8c0ff'; ctx.beginPath(); ctx.ellipse(x, y + 2, 3, 5, 0, 0, TAU); ctx.fill();
      }
      if (k > 0.68) glow(ctx, l.x, l.y - 40, 56, 60, '#6a5aff', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#6a5aff', 24, 230); G.FX.burst(l.x, l.y - 30, '#1a1030', 12, 200); G.FX.ring(l.x, l.y, 10, 160, '#4a3ad0', 0.5, 5); shake(l, 0.9); }
  });

  /* ---------- Calyrex (898): brota un corro de plantas que florecen y él baja despacio entre tres luces ---------- */
  add(898, {
    title: 'Rey de la abundancia', dur: 2.3, short: 0.9, cue: 0.72,
    sprite(l, k) { const e = cl((k - 0.4) / 0.32); return { a: cl((k - 0.4) / 0.12), rise: 0, lift: 100 * (1 - ease(e)), flash: k > 0.72 && k < 0.78 }; },
    back(ctx, l, k, now) {
      ctx.save();
      const o = 1 - cl((k - 0.86) / 0.14);
      glow(ctx, l.x, l.y, 100, 36, '#8ae06a', 0.4 * cl((k - 0.1) / 0.2) * o);
      for (let i = 0; i < 12; i++) {
        const an = i / 12 * TAU, x = l.x + Math.cos(an) * 85, y = l.y + Math.sin(an) * 30, g = ease(cl((k - 0.08 - i * 0.015) / 0.2)), h = 22 * g;
        if (g <= 0 || o <= 0) continue;
        ctx.globalAlpha = o; ctx.fillStyle = '#3a8a3a'; ctx.fillRect(Math.round(x - 1), Math.round(y - h), 3, Math.round(h));
        ctx.fillStyle = '#6ac84a'; ctx.beginPath(); ctx.ellipse(x - 5, y - h * 0.5, 5 * g, 2.5 * g, -0.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 5, y - h * 0.7, 5 * g, 2.5 * g, 0.5, 0, TAU); ctx.fill();
        const b = cl((k - 0.3 - i * 0.01) / 0.12);
        if (b > 0) { ctx.fillStyle = i % 3 ? '#ffffff' : '#ffd860'; for (let p = 0; p < 4; p++) { const pa = p / 4 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(pa) * 3 * b, y - h + Math.sin(pa) * 3 * b, 2.5 * b, 0, TAU); ctx.fill(); } ctx.fillStyle = '#ffb040'; ctx.fillRect(Math.round(x - 1), Math.round(y - h - 1), 2, 2); }
      }
      dropShadow(ctx, l, cl((k - 0.4) / 0.32), 0, 0.3);
      ctx.restore();
    },
    front(ctx, l, k, now) {
      ctx.save();
      const s = cl((k - 0.2) / 0.1) * (1 - cl((k - 0.72) / 0.06)), e = ease(cl((k - 0.4) / 0.32)), cy = l.y - 140 + 100 * e;
      for (let i = 0; i < 3 && s > 0; i++) {
        const an = i / 3 * TAU + now * 2.4, x = l.x + Math.cos(an) * 34, y = cy + Math.sin(an) * 12;
        glow(ctx, x, y, 18, 18, i ? '#8ae06a' : '#ff8ad8', 0.8 * s);
        ctx.globalAlpha = s; ctx.fillStyle = i ? '#c8ffb0' : '#ffc8f0'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      }
      if (k > 0.72) glow(ctx, l.x, l.y - 34, 50, 54, '#8ae06a', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#8ae06a', 20, 200); G.FX.burst(l.x, l.y - 30, '#ff8ad8', 12, 180); G.FX.ring(l.x, l.y, 8, 140, '#8ae06a', 0.5, 5); shake(l, 0.5); }
  });

  /* ---------- Enamorus (905): un viento de primavera trae pétalos rosas y ella baja en picado desde un lado ---------- */
  const enaPath = k => { const e = ease(cl((k - 0.36) / 0.32)); return { e, ox: -220 * (1 - e), lift: 170 * (1 - e) * (1 - e) + 30 * Math.sin(Math.PI * e) }; };
  add(905, {
    title: 'Viento de la primavera', dur: 2.2, short: 0.9, cue: 0.7,
    sprite(l, k) { const p = enaPath(k); return { a: cl((k - 0.36) / 0.06), rise: 0, lift: p.lift, ox: p.ox, flash: k > 0.7 && k < 0.76 }; },
    back(ctx, l, k, now) { ctx.save(); const p = enaPath(k); dropShadow(ctx, l, p.e, p.ox, 0.3); ctx.restore(); },
    front(ctx, l, k, now) {
      ctx.save();
      const w = cl((k - 0.04) / 0.1) * (1 - cl((k - 0.8) / 0.16));
      // Ráfagas de viento: curvas blancas que cruzan.
      for (let i = 0; i < 4 && w > 0; i++) {
        const ph = (now * 0.9 + i / 4) % 1, x = l.x - 260 + ph * 520, y = l.y - 150 + i * 40;
        ctx.globalAlpha = 0.6 * w * Math.sin(Math.PI * ph); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 60, y); ctx.quadraticCurveTo(x - 20, y - 14, x + 10, y - 2); ctx.arc(x + 10, y - 12, 10, Math.PI / 2, -Math.PI / 2, true); ctx.stroke();
      }
      // Pétalos rosas en el viento.
      for (let i = 0; i < 24 && w > 0; i++) {
        const ph = (now * 0.5 + H(l.seed, i, 521)) % 1, x = l.x - 260 + ph * 520, y = l.y - 170 + H(l.seed, i, 522) * 180 + Math.sin(now * 4 + i) * 10 + ph * 30;
        ctx.globalAlpha = w; ctx.fillStyle = i % 3 ? '#ff9ac8' : '#ffd0e8';
        ctx.beginPath(); ctx.ellipse(x, y, 6, 3, now * 3 + i, 0, TAU); ctx.fill();
      }
      if (k > 0.7) glow(ctx, l.x, l.y - 40, 56, 60, '#ff9ac8', 0.3 * (1 - cl((k - 0.9) / 0.1) * 0.5));
      ctx.restore();
    },
    onCue(l) { if (!G.FX) return; G.FX.burst(l.x, l.y - 30, '#ff9ac8', 26, 230); G.FX.ring(l.x, l.y, 10, 160, '#ffd0e8', 0.5, 5); shake(l, 0.8); }
  });

  return {
    add, def, GENERIC,
    /** dex que ya tienen animación propia. */
    get own() { return Object.keys(ANIMS).map(Number); },
    /** Título de la presentación (el propio o el de siempre), ya traducido. */
    title(dex) { const t = (ANIMS[dex] && ANIMS[dex].title) || 'Guardián de la grieta'; return G.T ? G.T(t) : t; }
  };
})();
