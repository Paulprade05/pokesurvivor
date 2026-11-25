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

  return {
    add, def, GENERIC,
    /** dex que ya tienen animación propia. */
    get own() { return Object.keys(ANIMS).map(Number); },
    /** Título de la presentación (el propio o el de siempre), ya traducido. */
    title(dex) { const t = (ANIMS[dex] && ANIMS[dex].title) || 'Guardián de la grieta'; return G.T ? G.T(t) : t; }
  };
})();
