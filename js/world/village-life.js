/* ============ village-life.js — el ambiente de la aldea: luciérnagas, viento, lluvia y agua (bloque H de la 1.0) ============
 * Pedido del dueño (24-11-2026, «Vida de la aldea»): Pokémon que pasean y hacen cosas, cambios con la hora (luces, Pokémon
 * de día y de noche) y ambiente (luciérnagas, agua, viento, clima). Lo de los Pokémon va en village.js (npcTick); aquí, el
 * ambiente, dibujado en 2D encima de la aldea 3D (village.js overlay), con la misma cámara (G.Village3D.toScreen):
 *   - luciérnagas que vagan entre las setas: salen de noche y se esconden con la bruma del amanecer y con la lluvia;
 *   - viento: de vez en cuando una ráfaga cruza la aldea con hojas y pétalos que brillan (no con «Menos sacudidas»);
 *   - clima: despejado, llovizna o lluvia, cambia cada WX_SLOT s (el mismo para todos a la misma hora: sale del reloj);
 *     con lluvia la luz baja un poco y la niebla sube (light), cae la lluvia y salpica;
 *   - agua: ondas en la charca (más con lluvia) y, al entrar y volver por el portal, un remolino de luz (portal).
 *
 * Coste: puñados fijos de objetos que se reutilizan (nada se crea en cada fotograma), sólo rectángulos, círculos, elipses
 * y un halo ya pintado (drawImage con «lighter»): todo va por la GPU con el motor WebGL2 (core/gl2d.js). En calidad baja
 * (Settings.fx 0) no hay luciérnagas ni hojas y la lluvia es la mitad. Nada de esto choca ni se guarda.
 */
G.VillageLife = (() => {
  const TAU = Math.PI * 2;
  const H = (a, b, c) => G.U.hash(a, b, c);
  const cl = k => (k < 0 ? 0 : k > 1 ? 1 : k);
  const fx = () => (G.Settings ? G.Settings.fx : 2);
  const calm = () => !!(G.Settings && G.Settings.get && G.Settings.get('calm')) ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);   // (o «reducir movimiento» del sistema)
  const touch = () => !!(G.Settings && G.Settings.touch);
  const WX_SLOT = 150;                     // s que dura cada tiempo (despejado, llovizna, lluvia)
  let rain = 0, rainTo = 0, wind = 0, windDir = 1, gustT = 12, gust = 0, t = 0, lastSlot = -1;
  const flies = [], leaves = [], drops = [], ripples = [];
  let halo = null;

  /** Halo pequeño (una vez): luz de luciérnaga, se pinta sumado. */
  function haloImg() {
    if (halo !== null) return halo;
    if (typeof document === 'undefined') return (halo = false);
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    if (!g) return (halo = false);
    const gd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gd.addColorStop(0, 'rgba(240,255,190,1)'); gd.addColorStop(0.25, 'rgba(190,255,120,.55)'); gd.addColorStop(1, 'rgba(120,255,140,0)');
    g.fillStyle = gd; g.fillRect(0, 0, 32, 32);
    return (halo = c);
  }

  /** El tiempo que toca ahora (0 despejado, 0,45 llovizna, 1 lluvia), igual en todos los aparatos a la misma hora. */
  function weatherNow() {
    const slot = Math.floor(Date.now() / 1000 / WX_SLOT), r = H(slot, 7, 4242);
    return { slot, to: r < 0.62 ? 0 : r < 0.84 ? 0.45 : 1 };
  }
  let forced = null;

  function reset() { flies.length = 0; leaves.length = 0; drops.length = 0; ripples.length = 0; gust = 0; gustT = 8; lastSlot = -1; }

  /**
   * Cada fotograma (village.js frame). view: la cámara de la aldea (cx, cy, w, h); night: 0..1 de light().
   * → lo que pasa de nuevo: { rainStart } (para que algún Pokémon lo comente).
   */
  function tick(dt, view, night) {
    t += dt;
    const ev = {};
    const w = forced != null ? { slot: -2, to: forced } : weatherNow();
    if (w.slot !== lastSlot) { if (lastSlot !== -1 && w.to > 0.4 && rainTo < 0.4) ev.rainStart = true; lastSlot = w.slot; }
    rainTo = w.to;
    rain += (rainTo - rain) * Math.min(1, dt / 6);
    // Viento: ráfagas cada 18-40 s, de 4 s; mientras, hojas que cruzan.
    gustT -= dt;
    if (gustT <= 0) { gust = 4; gustT = 18 + Math.random() * 22; windDir = Math.random() < 0.5 ? -1 : 1; }
    if (gust > 0) gust -= dt;
    const want = gust > 0 ? Math.sin(Math.PI * cl(1 - gust / 4)) : 0;
    wind += (want + rain * 0.3 - wind) * Math.min(1, dt * 2);
    const lo = fx() === 0, hw = view.w / 2 + 80, hh = view.h / 2 + 80;
    const out = o => Math.abs(o.x - view.cx) > hw || Math.abs(o.y - view.cy) > hh;
    // Luciérnagas: de noche, no con la bruma ni con la lluvia.
    const nF = lo ? 0 : touch() ? 10 : 18, slow = calm() ? 0.5 : 1;
    while (flies.length < nF) flies.push({ x: 0, y: 0, z: 0, ph: Math.random() * TAU, sp: 0.6 + Math.random() * 0.8, dead: true });
    flies.length = nF;
    for (const f of flies) {
      if (f.dead || out(f)) { f.x = view.cx + (Math.random() - 0.5) * view.w * 1.1; f.y = view.cy + (Math.random() - 0.5) * view.h * 1.1; f.z = 14 + Math.random() * 50; f.dead = false; }
      f.ph += dt * f.sp * slow;
      f.x += (Math.cos(f.ph * 0.9) * 14 + wind * windDir * 40) * dt * slow;
      f.y += Math.sin(f.ph * 0.7) * 9 * dt * slow;
      f.z = Math.max(8, f.z + Math.sin(f.ph * 1.3) * 10 * dt);
    }
    // Hojas y pétalos con las ráfagas (no con «Menos sacudidas y destellos»).
    const nL = lo || calm() ? 0 : touch() ? 10 : 18;
    for (let i = leaves.length; i < nL; i++) leaves.push({ x: 0, y: 0, z: 0, vz: 0, on: false, ph: 0, c: i % 3 });
    leaves.length = nL;
    for (const l of leaves) {
      if (!l.on) {
        if (gust > 0.6 && Math.random() < dt * 3) {
          l.on = true; l.x = view.cx - windDir * (view.w / 2 + 40); l.y = view.cy + (Math.random() - 0.5) * view.h; l.z = 30 + Math.random() * 90; l.ph = Math.random() * TAU;
        }
        continue;
      }
      l.ph += dt * 5;
      l.x += windDir * (160 + 120 * wind) * dt;
      l.y += Math.sin(l.ph * 0.5) * 30 * dt;
      l.z = Math.max(0, l.z - 12 * dt + Math.sin(l.ph) * 20 * dt);
      if (out(l)) l.on = false;
    }
    // Ondas en la charca (y más con la lluvia).
    const P = G.VILLAGE && G.VILLAGE.POND, TS = (G.VILLAGE && G.VILLAGE.TS) || 48;
    if (P && Math.random() < dt * (0.8 + rain * 9)) {
      const r = ripples.find(o => o.t >= o.life) || (ripples.length < 14 ? (ripples[ripples.length] = { t: 1, life: 1 }) : null);
      if (r) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 0.8; Object.assign(r, { x: (P.x + Math.cos(a) * P.rx * d) * TS, y: (P.y + Math.sin(a) * P.ry * d) * TS, t: 0, life: 0.9 + Math.random() * 0.5 }); }
    }
    for (const r of ripples) r.t += dt;
    return ev;
  }

  /** La luz del ciclo, con lo que quita la lluvia (algo más oscuro y con más niebla). */
  function light(l) {
    if (rain < 0.02) return l;
    return Object.assign({}, l, { ai: l.ai * (1 - 0.14 * rain), si: l.si * (1 - 0.3 * rain), mist: l.mist + 0.45 * rain });
  }

  /** Encima de la aldea (antes de los nombres y bocadillos). night: 0..1; dt: s desde el anterior (la lluvia cae con él). */
  function draw(ctx, w, h, view, night, dt = 1 / 60) {
    const S = G.Village3D, sc = view.scale || 1;
    if (!S || !S.toScreen) return;
    ctx.save();
    // Ondas de la charca (en el suelo).
    ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = Math.max(1, sc);
    for (const r of ripples) {
      if (r.t >= r.life) continue;
      const k = r.t / r.life, p = S.toScreen(view, r.x, r.y, 0);
      ctx.globalAlpha = 0.45 * (1 - k);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, (3 + 16 * k) * sc, (1.3 + 6 * k) * sc, 0, 0, TAU); ctx.stroke();
    }
    // Hojas y pétalos que brillan un poco (los del bosque bioluminiscente).
    const LC = ['#7dffb0', '#ff8ad8', '#9be06a'];
    for (const l of leaves) {
      if (!l.on) continue;
      const p = S.toScreen(view, l.x, l.y, l.z), fl = Math.sin(l.ph) > 0;
      ctx.globalAlpha = 0.85; ctx.fillStyle = LC[l.c];
      ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(2, Math.round((fl ? 3 : 2) * sc)), Math.max(1, Math.round((fl ? 1.5 : 2.5) * sc)));
    }
    // Luciérnagas: halo sumado y un punto claro; laten.
    const fv = cl((night - 0.6) / 0.3) * (1 - rain * 0.85), im = fv > 0.02 ? haloImg() : null;
    if (im) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      for (const f of flies) {
        if (f.dead) continue;
        const p = S.toScreen(view, f.x, f.y, f.z), b = fv * (0.45 + 0.55 * Math.max(0, Math.sin(f.ph * 2.3)));
        if (b < 0.03 || p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) continue;
        const R = 9 * sc;
        ctx.globalAlpha = b; ctx.drawImage(im, p.x - R, p.y - R, R * 2, R * 2);
        ctx.fillStyle = '#f4ffd0'; ctx.fillRect(Math.round(p.x - sc), Math.round(p.y - sc), Math.max(1, Math.round(sc * 2)), Math.max(1, Math.round(sc * 2)));
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = false;
    }
    // Lluvia: un velo azul, gotas en escalera (inclinadas por el viento) y salpicaduras.
    if (rain > 0.03) {
      ctx.globalAlpha = 0.13 * rain; ctx.fillStyle = '#14203c'; ctx.fillRect(0, 0, w, h);
      const n = Math.round(rain * (fx() === 0 ? 50 : touch() ? 70 : 140) * (calm() ? 0.6 : 1));
      while (drops.length < n) drops.push({ x: Math.random() * w, y: Math.random() * h, v: 0.8 + Math.random() * 0.4 });
      const fall = (calm() ? 380 : 760) * sc * Math.min(0.1, dt), slant = (wind * windDir * 0.35 + 0.08) * 6 * sc, L = Math.max(3, Math.round(4 * sc));
      ctx.fillStyle = '#b9d2ff';
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y += fall * d.v; d.x += slant * d.v * 0.5;
        if (d.y > h) { d.y = -10 - Math.random() * 40; d.x = Math.random() * (w + 40) - 20; }
        if (d.x > w + 20) d.x -= w + 40; else if (d.x < -20) d.x += w + 40;
        ctx.globalAlpha = 0.62 * rain;
        const x = Math.round(d.x), y = Math.round(d.y), q = Math.max(1, Math.round(sc * 0.75));
        ctx.fillRect(x, y, q, L); ctx.fillRect(x + Math.round(slant * 0.3), y + L, q, L); ctx.fillRect(x + Math.round(slant * 0.6), y + 2 * L, q, L);
        if (H(i, Math.floor(t * 9), 3) < 0.04) { ctx.globalAlpha = 0.8 * rain; ctx.fillRect(x - 2 * q, y + 3 * L, 5 * q, q); }
      }
    }
    ctx.restore();
  }

  /**
   * Remolino de luz del portal (entrar y volver): k 0..1; dir 1 hacia dentro (entras), -1 hacia fuera (vuelves).
   * ring: [x, y, z] del centro del portal (G.Village3D.altar().ring).
   */
  function portal(ctx, view, ring, k, dir) {
    const S = G.Village3D;
    if (!S || !S.toScreen || k <= 0 || k >= 1 || fx() === 0) return;
    const c = S.toScreen(view, ring[0], ring[1], ring[2]), sc = view.scale || 1, n = calm() ? 8 : 18;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const q = (H(i, 3, 9) + k * 1.3) % 1, p = dir > 0 ? 1 - q : q, an = H(i, 4, 9) * TAU + k * 6 * dir + p * 3;
      const r = (8 + 90 * p) * sc;
      ctx.globalAlpha = Math.sin(Math.PI * k) * (dir > 0 ? q : 1 - q) * 0.9;
      ctx.fillStyle = i % 3 ? '#f4c8ff' : '#7dffb0';
      const s = Math.max(2, Math.round((1.5 + 2 * (1 - p)) * sc));
      ctx.fillRect(Math.round(c.x + Math.cos(an) * r), Math.round(c.y + Math.sin(an) * r * 0.75), s, s);
    }
    ctx.restore();
  }

  return {
    reset, tick, draw, light, portal,
    get rain() { return rain; }, get wind() { return wind; },
    /** Para pruebas y capturas: forzar el tiempo (null: el del reloj; 0..1: lluvia) y una ráfaga ya. */
    debug: { weather(v) { forced = v == null ? null : +v; if (forced != null) rain = forced; }, gust() { gust = 4; gustT = 30; }, get flies() { return flies; }, get leaves() { return leaves; }, WX_SLOT }
  };
})();
