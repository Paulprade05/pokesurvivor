/* ============ fx.js — partículas, números de daño y efectos (pixel art) ============
 * Todo lo puramente visual vive aquí. Nada de esto afecta al gameplay.
 *
 * Todo se dibuja en la rejilla de píxeles del juego (G.Sprites.PX): las
 * partículas son cuadrados, los anillos son puntos y los golpes y rayos se
 * construyen con bloques y con los sprites de G.VFX, para que los efectos
 * casen con los sprites de Mundo Misterioso.
 */
G.FX = (() => {
  const PX = G.Sprites.PX;
  // Topes según la calidad (Ajustes → Gráficos): bajo, medio, alto.
  // (12-11-2026) En calidad Máxima (PC), un nivel más: más partículas y más golpes con adornos (q = 3).
  const CAP_PARTS = [350, 800, 1400, 2400], CAP_SPRITES = [110, 210, 320, 520], CAP_TEXTS = [25, 45, 70, 90], DENS = [0.35, 0.65, 1, 1.35];
  const q = () => G.Settings.fx === 2 && G.Settings.max ? 3 : G.Settings.fx;
  let parts = [], sprites = [], texts = [], rings = [], slashes = [], beams = [];
  /*
   * (Arte animado, 05-11-2026) Golpes con dibujo propio de cada tipo. Sólo aspecto: se cuelga de lo que ya se ve al golpear
   * (Enemy.showHurt, burst, ring) y no toca el daño. Coste con tope: como mucho HIT_MAX golpes con adornos por fotograma y
   * TRAIL_MAX estelas; los demás salen sólo con la chispa de siempre, así que mil enemigos cuestan lo mismo que diez.
   * Con «Animaciones» apagado no sale nada de esto: se sigue viendo la chispa, los números y los ataques.
   */
  const HIT_MAX = [2, 4, 7, 11], TRAIL_MAX = [1, 3, 6, 9];
  let hitLeft = 0, trailLeft = 0;
  const palCache = new Map();
  /** El tipo (paleta de G.VFX) más cercano a un color: los golpes llegan con su color, no con su tipo. */
  function palOf(hex) {
    let p = palCache.get(hex);
    if (p) return p;
    p = 'normal';
    const n = parseInt(String(hex).slice(1), 16);
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
      let best = 1e9;
      for (const k in G.VFX.PAL) {
        if (k === 'aura') continue;
        for (const i of [2, 3]) {
          const c = parseInt(G.VFX.PAL[k][i].slice(1), 16), d = (r - (c >> 16 & 255)) ** 2 + (g - (c >> 8 & 255)) ** 2 + (b - (c & 255)) ** 2;
          if (d < best) { best = d; p = k; }
        }
      }
    }
    palCache.set(hex, p);
    return p;
  }

  function debris(shape, pal, x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, s = G.U.rand(o.v * 0.5, o.v);
      sp(shape, pal, x + Math.cos(a) * 4, y + Math.sin(a) * 4, { vx: Math.cos(a) * s, vy: Math.sin(a) * s + (o.vy || 0), life: G.U.rand(o.life * 0.7, o.life), grav: o.grav || 0,
         spin: o.spin ? G.U.rand(-o.spin, o.spin) : 0, frameRate: o.fr || 10, scale: o.scale || 1 });
    }
  }

  /** Lo que sale al golpear, según el tipo. big: crítico, muy eficaz o jefe. */
  function hitFx(x, y, color, big = false) {
    if (hitLeft <= 0 || !G.Anim.on) return;
    hitLeft--;
    const pal = palOf(color), D = DENS[q()] >= 1 ? 1 : 0;
    sp('hit', pal, x, y, { life: 0.2, scale: big ? 1.5 : 1, frameRate: 25, fade: false });
    light(x, y, G.VFX.PAL[pal][3], big ? 46 : 28, big ? 0.3 : 0.2, big ? 0.75 : 0.55);
    switch (pal) {
      case 'fire': debris('smoke', 'fire', x, y, 1 + D, { v: 26, vy: -34, life: 0.32, fr: 12 }); for (let i = 0; i < 3; i++) px(x + G.U.rand(-6, 6), y, Math.random() < 0.5 ? '#ffb22e' : '#ff6a1f', { vy: -G.U.rand(40, 90), vx: G.U.rand(-20, 20), life: 0.4 }); break;
      case 'water': sp('splash', pal, x, y - 4, { life: 0.28, scale: 1.25, frameRate: 14, fade: false }); for (let i = 0; i < 3; i++) px(x, y, '#8ccaff', { vx: G.U.rand(-60, 60), vy: -G.U.rand(40, 90), grav: 380, life: 0.36 }); break;
      case 'grass': case 'bug': debris('leaf', pal, x, y, 2 + D, { v: 60, vy: -10, grav: 90, life: 0.5, spin: 9, scale: 0.75 }); break;
      case 'electric': sp('zap', pal, x, y, { life: 0.16, scale: 1.5, frameRate: 18, fade: false }); debris('zap', pal, x, y, D, { v: 50, life: 0.14, fr: 20 }); break;
      case 'ice': debris('chip', pal, x, y, 3 + D, { v: 90, life: 0.3, spin: 10 }); break;
      case 'rock': case 'ground': debris('chip', pal, x, y, 2 + D, { v: 70, vy: -50, grav: 420, life: 0.4, spin: 12 }); debris('smoke', pal, x, y + 6, 1, { v: 12, life: 0.3, fr: 13 }); break;
      case 'steel': debris('chip', pal, x, y, 2, { v: 110, life: 0.2, spin: 16 }); for (let i = 0; i < 3; i++) px(x, y, '#ffffff', { vx: G.U.rand(-130, 130), vy: G.U.rand(-130, 130), life: 0.16 }); break;
      case 'poison': debris('bub', pal, x, y, 2 + D, { v: 26, vy: -44, life: 0.45 }); break;
      case 'psychic': case 'fairy': debris('sparkle', pal, x, y, 2 + D, { v: 46, life: 0.34, fr: 12 }); break;
      case 'ghost': case 'dark': case 'dragon': debris('flamelet', pal, x, y, 1 + D, { v: 20, vy: -52, life: 0.42, fr: 9 }); break;
      case 'flying': debris('leaf', pal, x, y, 2, { v: 70, life: 0.4, spin: 8, scale: 0.75 }); break;
      default: for (let i = 0; i < 3; i++) px(x, y, '#ffffff', { vx: G.U.rand(-90, 90), vy: G.U.rand(-90, 90), life: 0.2 });
    }
  }

  /** Un enemigo se debilita: se deshace en humo. */
  function faintFx(x, y, boss) {
    if (hitLeft <= 0 || !G.Anim.on) return;
    hitLeft--;
    debris('smoke', 'normal', x, y, boss ? 6 : 2, { v: boss ? 70 : 34, vy: -14, life: 0.42, fr: 9, scale: boss ? 2 : 1 });
  }

  /*
   * (Pulido 12-11-2026, el dueño: «mejoras gráficas en todo el juego») Luz: un halo suave que se suma (lighter) donde algo
   * brilla: impactos, explosiones, disparos, jefes, la grieta. Es un degradado guardado por color (64 px) que se dibuja
   * ampliado y suavizado: un drawImage por luz, con tope por calidad. Los Pokémon siguen siendo pixel art: esto va
   * debajo y alrededor, nunca encima de ellos (los golpes van en la capa del aire, como siempre).
   */
  const LIGHT_MAX = [0, 18, 44, 90];
  let lights = [], lightLeft = 0;
  const glows = new Map();
  function glowImg(col) {
    let c = glows.get(col);
    if (c !== undefined) return c;
    if (glows.size > 48) { const k = glows.keys().next().value; G.U.freeCanvas(glows.get(k)); glows.delete(k); }
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    if (!g) { glows.set(col, null); return null; }
    const n = parseInt(String(col).slice(1), 16), r = n >> 16 & 255, gr = n >> 8 & 255, b = n & 255;
    const k = `${r},${gr},${b}`, gd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gd.addColorStop(0, `rgba(${Math.min(255, r + 90)},${Math.min(255, gr + 90)},${Math.min(255, b + 90)},1)`);
    gd.addColorStop(0.22, `rgba(${k},0.7)`); gd.addColorStop(0.55, `rgba(${k},0.22)`); gd.addColorStop(1, `rgba(${k},0)`);
    g.fillStyle = gd; g.fillRect(0, 0, 64, 64);
    glows.set(col, c);
    return c;
  }
  /** Un halo de luz ya (elipse de radios rx, ry en mundo), sumado. Para dibujar desde fuera (jefes, grieta, disparos). */
  function glowAt(ctx, x, y, rx, ry, col, a) {
    if (!q() || a <= 0.01 || !/^#[0-9a-f]{6}$/i.test(col)) return;
    const im = glowImg(col);
    if (!im) return;
    const op = ctx.globalCompositeOperation, sm = ctx.imageSmoothingEnabled, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(im, x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalCompositeOperation = op; ctx.imageSmoothingEnabled = sm; ctx.globalAlpha = ga;
  }
  /** Una luz que dura un poco (golpes, explosiones): crece un poco y se apaga. */
  function light(x, y, col, r = 30, life = 0.22, k = 0.6) {
    if (lightLeft <= 0 || lights.length >= LIGHT_MAX[q()]) return;
    lightLeft--;
    lights.push({ x, y, col, r, life, k, t: 0 });
  }

  function clear() { parts = []; sprites = []; texts = []; rings = []; slashes = []; beams = []; lights = []; }

  const snap = v => Math.round(v / PX) * PX;

  /*
   * «Transparencia de tus ataques» (Ajustes, ownFx: 1 · 0,6 · 0,35): lo que es
   * de tus ataques (own) se dibuja más transparente para que se vean los
   * disparos y avisos enemigos. Son tuyos los tajos, los rayos (menos los de
   * los peligros, que llevan fx.foe), los sprites sueltos y las estelas de los
   * proyectiles; las demás partículas, anillos y números de daño, no.
   */
  function ownAlpha() {
    const v = +G.Settings.get('ownFx');
    return v > 0 && v < 1 ? Math.max(0.2, v) : 1;
  }
  let mine = false, foe = false;     // lo que se está creando ahora es de tus ataques / de un enemigo

  // ---------------- partículas ----------------

  /** Partícula cuadrada. o: { vx, vy, life, size (en píxeles de arte), grav, drag } */
  function px(x, y, color, o = {}) {
    if (parts.length >= CAP_PARTS[q()]) return;
    parts.push({ x, y, vx: o.vx || 0, vy: o.vy || 0, t: 0, life: o.life || 0.4, color,
                 s: (o.size || 1) * PX, grav: o.grav || 0, drag: o.drag == null ? 0.9 : o.drag, own: mine });
  }

  function burst(x, y, color, n = 8, power = 110) {
    if (n > 8 && /^#[0-9a-f]{6}$/i.test(color)) light(x, y, color, Math.min(120, power * 0.45), 0.32, 0.7);     // (explosión: su luz)
    n = Math.max(1, Math.round(n * DENS[q()]));
    if (n <= 8) hitFx(x, y, color);                    // (un disparo que se acaba contra algo)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, s = G.U.rand(power * 0.35, power);
      px(x, y, color, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: G.U.rand(0.22, 0.5), size: Math.random() < 0.35 ? 2 : 1 });
    }
  }

  function spark(x, y, color, dirX, dirY, n = 4) {
    n = Math.max(1, Math.round(n * DENS[q()]));
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = base + G.U.rand(-0.9, 0.9), s = G.U.rand(60, 170);
      px(x, y, color, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: G.U.rand(0.14, 0.32) });
    }
  }

  /** Sprite de efecto suelto. o: { vx, vy, life, scale, angle, spin, grav, frameRate, fade } */
  function sp(shape, pal, x, y, o = {}) {
    if (sprites.length >= CAP_SPRITES[q()]) return;
    sprites.push({ shape, pal, x, y, vx: o.vx || 0, vy: o.vy || 0, t: 0, life: o.life || 0.4,
                   scale: o.scale || 1, angle: o.angle || 0, spin: o.spin || 0, grav: o.grav || 0,
                   fr: o.frameRate || 10, fade: o.fade !== false, own: !foe });
  }

  /** Centelleo de shiny (cruz de píxeles que nace y se apaga). */
  function twinkle(x, y) {
    if (sprites.length >= CAP_SPRITES[q()]) return;
    sprites.push({ twinkle: true, x, y, vx: 0, vy: -8, t: 0, life: G.U.rand(0.45, 0.7) });
  }

  /** Partículas de estela de los proyectiles, según el material. */
  function trail(kind, pal, x, y, vx, vy) {
    if (Math.random() > DENS[q()]) return;          // en calidad baja, menos estela
    const P = G.VFX.PAL[pal] || G.VFX.PAL.normal;
    const back = Math.atan2(-vy, -vx);
    const j = () => G.U.rand(-3, 3);
    mine = true;                     // (los disparos enemigos no dejan estela)
    switch (kind) {
      case 'ember':   px(x + j(), y + j(), P[Math.random() < 0.5 ? 3 : 2], { vx: Math.cos(back) * 30, vy: -40, life: 0.35 }); break;
      case 'drip':    px(x + j(), y + j(), P[3], { vx: Math.cos(back) * 20, vy: 10, grav: 260, life: 0.35 }); break;
      case 'spark':   px(x + j() * 2, y + j() * 2, Math.random() < 0.5 ? P[4] : P[3], { vx: G.U.rand(-60, 60), vy: G.U.rand(-60, 60), life: 0.16 }); break;
      case 'bubbles': px(x + j(), y + j(), P[3], { vy: -35, life: 0.45, size: Math.random() < 0.3 ? 2 : 1 }); break;
      case 'dirt':    px(x + j(), y + j(), P[Math.random() < 0.5 ? 2 : 1], { vx: Math.cos(back) * 25, vy: -20, grav: 300, life: 0.35 }); break;
      case 'wisp':    px(x + j() * 2, y + j() * 2, P[Math.random() < 0.5 ? 1 : 2], { vy: -30, life: 0.5, size: 2 }); break;
    }
    // (Arte animado) Y de vez en cuando, un dibujo: humo, burbuja, chispa o llamita (con tope por fotograma).
    if (trailLeft > 0 && G.Anim.on && Math.random() < 0.3) {
      trailLeft--;
      const sh = { ember: 'smoke', drip: 'bub', spark: 'zap', bubbles: 'bub', dirt: 'smoke', wisp: 'flamelet' }[kind];
      if (sh) sp(sh, pal, x + j(), y + j(), { vy: kind === 'dirt' ? 6 : -22, life: 0.3, frameRate: sh === 'smoke' ? 12 : 14, scale: sh === 'smoke' ? 0.75 : 1 });
    }
    mine = false;
  }

  /*
   * Números de daño (24-10-2026: en los momentos cargados la pantalla se llenaba de cifras):
   *  - Se agrupan: un golpe del mismo color al mismo sitio (el mismo enemigo) en menos
   *    de MERGE s se suma al número que ya está saliendo, que da un saltito, en vez de
   *    sacar otro encima.
   *  - Tope según la calidad y, en el móvil (pantalla pequeña), más bajo (CAP_SMALL).
   *    Los grandes (muy eficaz, críticos, jefes, avisos) siempre entran: echan al más viejo.
   */
  const CAP_SMALL = [12, 20, 28], MERGE = 0.32;
  let smallScr = false;
  function dmgText(x, y, value, color = '#ffffff', big = false) {
    // Ajustes → "Números de daño": los números se ocultan; los avisos de texto no.
    const num = typeof value === 'number';
    if ((num || /^-\d/.test(value)) && !G.Settings.get('dmgNumbers')) return;
    if (num) {
      for (let i = texts.length - 1; i >= 0; i--) {
        const o = texts[i];
        if (o.n === undefined || o.t > MERGE || o.color !== color || o.big !== big) continue;
        if (Math.abs(o.x0 - x) > 26 || Math.abs(o.y0 - y) > 30) continue;
        o.n += value; o.s = String(Math.round(o.n)); o.t = Math.min(o.t, 0.06); o.pop = 0.14;
        return;
      }
    }
    if (texts.length >= (smallScr ? CAP_SMALL : CAP_TEXTS)[q()]) { if (!big) return; texts.shift(); }
    const o = { x: x + G.U.rand(-6, 6), y, vy: -46, t: 0, life: big ? 0.95 : 0.62, s: num ? String(Math.round(value)) : value, color, big, pop: 0 };
    if (num) { o.n = value; o.x0 = x; o.y0 = y; }
    texts.push(o);
  }

  /** Anillo de onda (puntos de píxel). */
  function ring(x, y, r0, r1, color, life = 0.3, width = 3) {
    rings.push({ x, y, r0, r1, color, life, t: 0, width });
    // (Arte animado) Los estallidos grandes llevan su explosión en el centro.
    // (Las blancas son avisos y cambios de fase, no explosiones; y nunca encima de tu Pokémon, que lo taparía: tope ×2.)
    if (width >= 4 && r1 >= 70 && r1 < 600 && G.Anim.on) {
      const p = palOf(color), me = G.Game.player;
      if (p !== 'normal' && !(me && Math.abs(me.x - x) < 50 && Math.abs(me.y - y) < 50)) sp('blast', p, x, y - 8, { life: 0.36, scale: Math.min(2, r1 / 80), frameRate: 17, fade: false });
    }
  }

  /** Golpe cuerpo a cuerpo. fx: { pal, melee } (ver G.VFX.forMove). */
  function slash(x, y, angle, radius, arc, color, fx = {}) {
    const pal = fx.pal || 'normal';
    slashes.push({ x, y, angle, radius, arc, pal, t: 0, life: 0.22 });
    const mx = x + Math.cos(angle) * radius * 0.7, my = y + Math.sin(angle) * radius * 0.7;
    switch (fx.melee) {
      case 'impact': sp('impact', pal, mx, my, { life: 0.2, scale: 1.5, frameRate: 12, fade: false }); break;
      case 'jaws':   sp('jaws', pal, mx, my, { life: 0.24, scale: 1.5, frameRate: 9, fade: false }); break;
      case 'claw':   sp('claw', pal, mx, my, { life: 0.2, scale: 1.5, angle: angle - Math.PI / 4 }); break;
      case 'vine':
      case 'feather':
        for (let i = 0; i < 4; i++) {
          const a = angle + G.U.rand(-arc / 2, arc / 2), r = radius * G.U.rand(0.5, 1);
          sp('leaf', fx.melee === 'feather' ? 'flying' : pal, x + Math.cos(a) * r, y + Math.sin(a) * r,
             { vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 + 20, life: 0.45, spin: G.U.rand(-8, 8), grav: 60 });
        }
        break;
    }
  }

  /** Rayo recto. fx: { pal, beam } — beam = forma que viaja por él o 'lightning'. */
  function beam(x, y, angle, len, width, color, fx = {}) {
    beams.push({ x, y, angle, len, width, pal: fx.pal || 'normal', shape: fx.beam || null, t: 0, life: 0.2, seed: Math.random() * 100, own: !fx.foe });
    foe = !!fx.foe;
    sp('impact', fx.pal || 'normal', x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, { life: 0.12, scale: 1 });
    sp('hit', fx.pal || 'normal', x + Math.cos(angle) * len, y + Math.sin(angle) * len, { life: 0.2, scale: 1.5, frameRate: 25, fade: false });
    foe = false;
  }

  // ---------------- actualización ----------------

  function update(dt) {
    hitLeft = HIT_MAX[q()]; trailLeft = TRAIL_MAX[q()]; lightLeft = Math.ceil(LIGHT_MAX[q()] / 3);
    for (let i = lights.length - 1; i >= 0; i--) { const l = lights[i]; l.t += dt; if (l.t >= l.life) lights.splice(i, 1); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vy *= k;
    }
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      s.t += dt;
      if (s.t >= s.life) { sprites.splice(i, 1); continue; }
      s.vy += (s.grav || 0) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.spin) s.angle += s.spin * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      if (t.t >= t.life) { texts.splice(i, 1); continue; }
      t.y += t.vy * dt; t.vy *= 0.94;
      if (t.pop > 0) t.pop -= dt;
    }
    // Pantalla pequeña (móvil): menos números a la vez (ver dmgText).
    const cam = G.Camera, s = cam.scale || 1;
    smallScr = cam.w * s < 600 || cam.h * s <= 520;
    for (const arr of [rings, slashes, beams]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].t += dt;
        if (arr[i].t >= arr[i].life) arr.splice(i, 1);
      }
    }
  }

  // ---------------- dibujo ----------------

  // La transparencia va a escalones (1 · ,66 · ,33) para que no parezca vectorial.
  const step = k => k > 0.66 ? 1 : k > 0.33 ? 0.66 : 0.33;

  function drawBeam(ctx, b, own) {
    const k = 1 - b.t / b.life;
    const P = G.VFX.PAL[b.pal] || G.VFX.PAL.normal;
    const a = Math.round(b.angle / (Math.PI / 16)) * (Math.PI / 16);
    ctx.save();
    ctx.translate(snap(b.x), snap(b.y));
    ctx.rotate(a);
    ctx.globalAlpha = step(k) * (b.own ? own : 1);
    const seg = PX * 2, now = performance.now() / 1000;

    if (b.shape === 'lightning') {
      // Zigzag que se redibuja cada fotograma.
      let py = 0;
      for (let d = 0; d < b.len; d += seg) {
        const ny = d + seg >= b.len ? 0 : snap((G.U.hash(d | 0, (now * 30) | 0, b.seed | 0) - 0.5) * b.width);
        const lo = Math.min(py, ny), hi = Math.max(py, ny);
        ctx.fillStyle = P[3]; ctx.fillRect(d - PX, lo - PX * 2, seg + PX * 2, hi - lo + PX * 4);
        ctx.fillStyle = P[4]; ctx.fillRect(d, lo - PX, seg, hi - lo + PX * 2);
        py = ny;
      }
    } else {
      // Cuerpo del rayo a bloques, con el borde vibrando.
      for (let d = 0; d < b.len; d += seg) {
        const wob = 0.7 + 0.3 * Math.sin(d * 0.18 + now * 30 + b.seed);
        const hw = Math.max(PX, snap(b.width / 2 * wob * (0.6 + 0.4 * k)));
        ctx.fillStyle = P[1]; ctx.fillRect(d, -hw - PX, seg, hw * 2 + PX * 2);
        ctx.fillStyle = P[2]; ctx.fillRect(d, -hw, seg, hw * 2);
        ctx.fillStyle = P[3]; ctx.fillRect(d, -snap(hw * 0.55), seg, snap(hw * 0.55) * 2);
        ctx.fillStyle = P[4]; ctx.fillRect(d, -PX, seg, PX * 2);
      }
      // Sprites que viajan por el rayo (llamas, gotas, cristales, ondas).
      if (b.shape) {
        const gap = 26, off = (now * 420) % gap;
        for (let d = off; d < b.len - 6; d += gap) {
          const yo = Math.sin(d * 0.3 + b.seed) * b.width * 0.18;
          G.VFX.draw(ctx, b.shape, b.pal, d, yo, { angle: 0.0001, scale: 1.5, frame: (d / gap + now * 12) | 0 });
        }
      }
    }
    ctx.restore();
  }

  // (Los tajos son siempre de tus ataques: sólo los crea combat.js.)
  function drawSlash(ctx, s, own) {
    const k = 1 - s.t / s.life;
    const P = G.VFX.PAL[s.pal] || G.VFX.PAL.normal;
    const half = Math.min(s.arc, 6.2832) / 2;
    const r = s.radius * (0.72 + 0.28 * (1 - k));
    const n = Math.max(8, Math.ceil(r * half * 2 / PX));
    ctx.globalAlpha = step(k) * own;
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = s.angle - half + u * half * 2;
      const thick = Math.round(Math.sin(Math.PI * u) * 3 * k);      // grosor en píxeles de arte
      for (let j = -1; j <= thick; j++) {
        const rr = r - j * PX;
        ctx.fillStyle = j < 0 ? P[1] : j === thick ? P[4] : j > thick / 2 ? P[3] : P[2];
        ctx.fillRect(snap(s.x + Math.cos(a) * rr), snap(s.y + Math.sin(a) * rr), PX, PX);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRing(ctx, r) {
    const k = r.t / r.life;
    // Con tope: un radio enorme (o que no es número) colgaba la pestaña dibujando millones de puntos.
    const rad = Math.min(4000, G.U.lerp(r.r0, r.r1, k)) || 0;
    const n = Math.max(10, Math.ceil(rad * 6.2832 / (PX * 2)));
    const size = r.width >= 4 ? PX * 2 : PX;
    ctx.globalAlpha = step(1 - k);
    ctx.fillStyle = r.color;
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832;
      ctx.fillRect(snap(r.x + Math.cos(a) * rad), snap(r.y + Math.sin(a) * rad * 0.9), size, size);
    }
    ctx.globalAlpha = 1;
  }

  /*
   * Letra de los números de daño: Grenze gruesa con borde oscuro. En pantalla,
   * nunca menos de 15 px los normales y 22 los grandes (× G.HUD.scale): en el
   * móvil salían diminutos. En pantallas grandes siguen al mundo, como antes
   * (13 y 20 del mundo). Las cadenas sólo se rehacen si cambia ese tamaño.
   */
  const NUM = { k: 0, n: '', b: '', lw: 3 };
  function numFont() {
    const cam = G.Camera, s = cam.scale || 1;
    let k = G.HUD.scale(cam.w * s, cam.h * s) / s;   // px de pantalla → px del mundo
    if (!(k > 0)) k = 1 / s;
    if (k === NUM.k) return;
    NUM.k = k;
    const n = Math.max(15 * k, 13), b = Math.max(22 * k, 20);
    NUM.n = '700 ' + n.toFixed(2) + 'px Grenze,"Segoe UI",system-ui,sans-serif';
    NUM.b = '700 ' + b.toFixed(2) + 'px Grenze,"Segoe UI",system-ui,sans-serif';
    NUM.lw = n * 0.227;
  }

  function draw(ctx) {
    const own = ownAlpha();
    for (const l of lights) { const k = 1 - l.t / l.life; glowAt(ctx, l.x, l.y, l.r * (1.25 - 0.25 * k), l.r * (0.9 - 0.2 * k), l.col, l.k * k * k); }
    for (const b of beams) drawBeam(ctx, b, own);
    for (const s of slashes) drawSlash(ctx, s, own);
    for (const r of rings) drawRing(ctx, r);

    for (const p of parts) {
      ctx.globalAlpha = step(1 - p.t / p.life) * (p.own ? own : 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(snap(p.x), snap(p.y), p.s, p.s);
    }
    ctx.globalAlpha = 1;

    for (const s of sprites) {
      const k = 1 - s.t / s.life;
      if (s.twinkle) { G.Icons.twinkle(ctx, s.x, s.y, s.t / s.life, PX); continue; }
      G.VFX.draw(ctx, s.shape, s.pal, s.x, s.y, {
        angle: s.angle, scale: s.scale, alpha: (s.fade ? step(k) : 1) * (s.own ? own : 1),
        frame: Math.floor(s.t * s.fr)
      });
    }

    // Números de daño (siempre opacos). La fuente y el trazo se ponen una vez
    // por tanda, no por número: los normales y luego los grandes, encima.
    if (!texts.length) return;
    numFont();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,14,32,.88)';
    for (let big = 0; big < 2; big++) {
      let font = false;
      for (const t of texts) {
        if (!t.big === !!big) continue;
        if (!font) { ctx.font = big ? NUM.b : NUM.n; ctx.lineWidth = big ? NUM.lw * 1.3 : NUM.lw; font = true; }
        ctx.globalAlpha = Math.min(1, (1 - t.t / t.life) * 2.2);
        const y = t.pop > 0 ? t.y - t.pop * 28 : t.y;      // (saltito al sumarle otro golpe)
        ctx.strokeText(t.s, t.x, y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.s, t.x, y);
      }
    }
    ctx.restore();
  }

  return { clear, px, burst, spark, sp, twinkle, trail, dmgText, ring, slash, beam, update, draw, ownAlpha, hitFx, faintFx, glowAt, light,
           get count() { return parts.length + sprites.length + texts.length; } };
})();
