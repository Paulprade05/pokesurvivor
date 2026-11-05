/* ============ ambient.js — la vida del mundo: bichos, motas, nubes y ondas ============
 * (Arte animado, 05-11-2026) Puro adorno: nada de esto choca, hace daño ni se manda por la red; cada jugador ve los suyos.
 * Con «Animaciones» apagado (G.Anim.on) no se actualiza ni se dibuja nada.
 *
 * Coste fijo: un puñado de objetos reutilizados (como mucho MAX, menos en calidad baja y en pantallas pequeñas) que nunca
 * se crean ni se borran: al salir de la vista o acabar, reaparecen. No mira a los enemigos ni depende de cuántos haya.
 * Todo se dibuja con drawImage de un atlas pequeño (hecho una vez, en píxeles de arte) o con fillRect de un punto.
 *
 * Qué sale en cada bioma: RECIPE, según su suelo; en las grietas, según el tipo. Cada capa:
 *   ground(ctx, view)  encima del agua y debajo de todo: sombras de nubes, ondas del agua, burbujas de lava, gotas de lluvia
 *   air(ctx, cam)      encima de todo menos de los ataques: mariposas, pájaros, hojas, ascuas, luciérnagas, nieve...
 *   tree(p)            world.js avisa de los árboles que se ven: de ahí caen las hojas
 */
G.Ambient = (() => {
  const PX = G.Sprites.PX, MAX = 34;
  const FLY = 0, LEAF = 1, FLOAT = 2, FALL = 3, GLOW = 4, BAT = 5;
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;   // (el suyo: no toca el azar del juego)

  // ---------------- el atlas ----------------
  /*
   * Dibujos a mano, como cuadros de letras (k oscuro, c color, C claro). Un fotograma por dibujo; se mira de arriba, como
   * el resto del juego. Las mariposas se repiten en varios colores.
   */
  const ART = {
    fly: [['cc.cc', 'CckcC', '.ckc.', 'cckcc', '.c.c.'], ['.....', '.CkC.', '.ckc.', '.ckc.', '.....']],
    bird: [['k.........k', '.k.......k.', '..kk.k.kk..', '....kKk....', '.....k.....'],
           ['...........', 'kkk.....kkk', '...kk.kk...', '....kKk....', '.....k.....'],
           ['...........', '...........', '.kkkkKkkkk.', 'k...kKk...k', '.....k.....'],
           ['...........', 'kkk.....kkk', '...kk.kk...', '....kKk....', '.....k.....']],
    bat: [['k.....k', 'kk.k.kk', '.kkkkk.', '..k.k..'], ['.......', '.......', 'kkkkkkk', 'k.k.k.k']],
    leaf: [['.cc.', 'cCc.', '.c..'], ['..c.', '.Cc.', '.cc.'], ['....', 'cCcc', '....'], ['.c..', '.cC.', '.cc.']]
  };
  const FLY_COL = [['#ffd54a', '#fff2a8'], ['#ff8fb4', '#ffd2e0'], ['#8fd0ff', '#dff3ff'], ['#ffffff', '#e8e8ff']];
  let atlas = null;
  const SL = {};                                    // nombre -> { x, y, w, h, n }

  function buildAtlas() {
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 64;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return false; }
    let y = 0;
    const put = (name, frames, col) => {
      const h = frames[0].length, w = frames[0][0].length;
      SL[name] = { x: 0, y, w, h, n: frames.length };
      frames.forEach((rows, f) => rows.forEach((r, j) => {
        for (let i = 0; i < r.length; i++) {
          const c = col[r[i]];
          if (!c) continue;
          g.fillStyle = c;
          g.fillRect(f * (w + 1) + i, y + j, 1, 1);
        }
      }));
      y += h + 1;
    };
    FLY_COL.forEach((c, i) => put('fly' + i, ART.fly, { c: c[0], C: c[1], k: '#3a2a26' }));
    put('bird', ART.bird, { k: '#2a2e3e', K: '#555a70' });
    put('birdsh', ART.bird, { k: 'rgba(0,0,0,.5)', K: 'rgba(0,0,0,.5)' });
    put('bat', ART.bat, { k: '#241a34' });
    atlas = cv;
    return true;
  }

  // Hoja del bioma: se pinta aparte con su color (cambia con el bioma).
  let leafC = null, leafKey = '';
  function leafSheet(c0, c1) {
    const k = c0 + c1;
    if (leafC && leafKey === k) return leafC;
    if (leafC) G.U.freeCanvas(leafC);
    leafC = document.createElement('canvas');
    leafC.width = 20; leafC.height = 3;
    const g = leafC.getContext('2d');
    if (!g) { G.U.freeCanvas(leafC); leafC = null; return null; }
    ART.leaf.forEach((rows, f) => rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        if (r[i] === '.') continue;
        g.fillStyle = r[i] === 'C' ? c1 : c0;
        g.fillRect(f * 5 + i, j, 1, 1);
      }
    }));
    leafKey = k;
    return leafC;
  }

  // Halo de las luciérnagas: dos tonos a bloques, sin degradado; uno por color.
  const halos = new Map();
  function halo(col) {
    let cv = halos.get(col);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = 7;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.fillStyle = col;
    g.globalAlpha = 0.22; g.fillRect(1, 2, 5, 3); g.fillRect(2, 1, 3, 5);
    g.globalAlpha = 0.4; g.fillRect(2, 3, 3, 1); g.fillRect(3, 2, 1, 3);
    g.globalAlpha = 1; g.fillRect(3, 3, 1, 1);
    halos.set(col, cv);
    return cv;
  }

  // Sombra de nube: manchas redondas con el borde tramado, en píxeles de arte.
  let cloudC = [];
  function cloud(i) {
    if (cloudC[i]) return cloudC[i];
    const W = 112, H = 60, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    const blobs = i ? [[34, 32, 26, 16], [62, 26, 30, 18], [84, 36, 20, 13]] : [[28, 30, 22, 14], [54, 34, 32, 18], [80, 26, 18, 12]];
    const d = g.createImageData(W, H), a = d.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let m = 9;
      for (const [cx, cy, rx, ry] of blobs) m = Math.min(m, Math.hypot((x - cx) / rx, (y - cy) / ry));
      if (m > 1 || (m > 0.84 && (x + y) & 1)) continue;      // (el borde, a cuadros: se funde sin degradado)
      a[(y * W + x) * 4 + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    cloudC[i] = cv;
    return cv;
  }

  // Ondas: 4 fotogramas de un aro que se abre, en el color de la espuma del líquido.
  let ringC = null, ringKey = '';
  function ringSheet(col) {
    if (ringC && ringKey === col) return ringC;
    if (ringC) G.U.freeCanvas(ringC);
    ringC = document.createElement('canvas');
    ringC.width = 64; ringC.height = 9;
    const g = ringC.getContext('2d');
    if (!g) { G.U.freeCanvas(ringC); ringC = null; return null; }
    g.fillStyle = col;
    for (let f = 0; f < 4; f++) {
      const rx = 1.5 + f * 2, ry = rx * 0.5, cx = f * 16 + 7.5, cy = 4.5, n = 8 + f * 6;
      for (let i = 0; i < n; i++) {
        const an = i / n * 6.2832;
        if (f === 3 && i & 1) continue;                      // (el último, roto: se apaga)
        g.fillRect(Math.round(cx + Math.cos(an) * rx), Math.round(cy + Math.sin(an) * ry), 1, 1);
      }
    }
    ringKey = col;
    return ringC;
  }

  // ---------------- qué sale en cada sitio ----------------
  /*
   * fly: mariposas · leaf: hojas de los árboles · bird: bandadas · cloud: sombras de nubes · bat: murciélagos
   * up: { n, c: [colores], v } motas que suben (ascuas, burbujas, polen)  ·  down: lo mismo cayendo (ceniza, pétalos, nieve)
   * glow: { n, c } luces que van y vienen (luciérnagas, fuegos fatuos)
   */
  const R = {
    meadow: { fly: 3, leaf: 4, bird: 1, cloud: 1, up: { n: 6, c: ['#fff6c8', '#d8f0a0'], v: 9 } },
    cave: { bat: 2, glow: { n: 6, c: ['#8fe3ff', '#c9a6ff'] }, up: { n: 6, c: ['#c8f7ff', '#8fa0d8'], v: 7 } },
    ash: { up: { n: 11, c: ['#ffb040', '#ff7a2a', '#ffe08a'], v: 34 }, down: { n: 7, c: ['#8a7a70', '#b0a498'], v: 22 } },
    desert: { bird: 1, cloud: 1, down: { n: 6, c: ['#e8cf8f', '#d8b878'], v: 12 } },
    snow: { cloud: 1, down: { n: 14, c: ['#ffffff', '#dcefff'], v: 30 } },
    indoor: { up: { n: 6, c: ['#ffffff', '#ffe9b0'], v: 6 } },
    // Grietas (tipo de la arena)
    fire: { up: { n: 12, c: ['#ffb040', '#ff7a2a', '#ffe08a'], v: 38 }, down: { n: 4, c: ['#8a7a70'], v: 20 } },
    water: { up: { n: 9, c: ['#bfefff', '#ffffff'], v: 18 }, glow: { n: 3, c: ['#8fe3ff'] } },
    grass: { fly: 4, leaf: 4, bird: 1, up: { n: 7, c: ['#f0ffc0', '#c8f080'], v: 10 } },
    electric: { glow: { n: 7, c: ['#ffe86a', '#ffffff'] }, up: { n: 5, c: ['#ffe86a'], v: 22 } },
    ice: { down: { n: 14, c: ['#ffffff', '#cfefff'], v: 26 }, glow: { n: 3, c: ['#dff8ff'] } },
    fighting: { down: { n: 7, c: ['#ffb7c8', '#ffd6e0'], v: 16 }, cloud: 1 },
    poison: { up: { n: 11, c: ['#c070e8', '#8a4cc0', '#e0a0ff'], v: 16 }, glow: { n: 3, c: ['#d088ff'] } },
    ground: { down: { n: 8, c: ['#e0b878', '#c89a58'], v: 16 }, bird: 1, cloud: 1 },
    flying: { down: { n: 7, c: ['#ffffff', '#e0eaff'], v: 14 }, bird: 1, cloud: 1 },
    psychic: { up: { n: 9, c: ['#ff9fcf', '#e0b0ff', '#ffffff'], v: 12 }, glow: { n: 4, c: ['#ffb0e0'] } },
    bug: { fly: 3, glow: { n: 6, c: ['#d8ff70'] }, leaf: 3, up: { n: 4, c: ['#e8f0a0'], v: 8 } },
    rock: { down: { n: 7, c: ['#b0a088', '#8a7a64'], v: 18 }, cloud: 1 },
    ghost: { glow: { n: 7, c: ['#a890f0', '#70e0d0'] }, bat: 2, up: { n: 5, c: ['#8878b8'], v: 10 } },
    dragon: { up: { n: 11, c: ['#a490ff', '#7b5cff', '#e8e2ff'], v: 30 } },
    dark: { bat: 3, glow: { n: 3, c: ['#c84060'] }, up: { n: 6, c: ['#6a5a70'], v: 6 } },
    steel: { up: { n: 6, c: ['#ffffff', '#c8d6e2'], v: 8 }, glow: { n: 3, c: ['#ffd88a'] } },
    fairy: { fly: 3, glow: { n: 5, c: ['#ffc4e6', '#fff0a8'] }, up: { n: 9, c: ['#ffc4e6', '#ffffff'], v: 11 } },
    normal: { fly: 4, leaf: 3, bird: 1, cloud: 1, up: { n: 6, c: ['#fff6c8'], v: 9 } },
    judgment: { up: { n: 12, c: ['#ffd27a', '#ffffff', '#ff9a3a'], v: 26 } }
  };

  let recipeOf = -1, rec = R.meadow;
  function recipe(bi) {
    if (bi === recipeOf) return rec;
    recipeOf = bi;
    const T = G.Tiles, B = T.BIOMES[bi];
    const t = bi >= T.ARENA ? T.ARENA_TYPES[bi - T.ARENA] : null;
    rec = (t && R[t]) || { grass: R.meadow, stone: R.cave, ash: R.ash, sand: R.desert, snow: R.snow }[B.ground] || R.indoor;
    fill();
    return rec;
  }

  // ---------------- los objetos ----------------
  const P = [];
  let flock = null, flockT = 6, rings = [], ringT = 0, rainT = 0, tx = 0, ty = 0, hasTree = false, cx0 = 0, cy0 = 0;
  const clouds = [{ x: 0, y: 0, i: 0 }, { x: 900, y: 500, i: 1 }, { x: 400, y: 1000, i: 0 }];
  for (let i = 0; i < 12; i++) rings.push({ on: false, x: 0, y: 0, t: 0, k: 0 });

  /** Reparte los objetos: tantos de cada clase como pide el bioma, según la calidad y el tamaño de la pantalla. */
  function fill() {
    const cam = G.Camera, area = Math.min(1, Math.max(0.5, (cam.w * cam.h) / 300000));
    const d = [0.45, 0.75, 1][G.Settings.fx] * area, r = rec;
    P.length = 0;
    const add = (kind, n, o) => { n = Math.max(n ? 1 : 0, Math.round(n * d)); for (let i = 0; i < n && P.length < MAX; i++) P.push(Object.assign({ kind, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, seed: rnd() * 100, c: '#fff', s: 1, alive: false }, o && o(i))); };
    if (r.fly) add(FLY, r.fly, i => ({ look: i % FLY_COL.length }));
    if (r.leaf) add(LEAF, r.leaf);
    if (r.bat) add(BAT, r.bat);
    if (r.glow) add(GLOW, r.glow.n, i => ({ c: r.glow.c[i % r.glow.c.length] }));
    if (r.up) add(FLOAT, r.up.n, i => ({ c: r.up.c[i % r.up.c.length], v: r.up.v }));
    if (r.down) add(FALL, r.down.n, i => ({ c: r.down.c[i % r.down.c.length], v: r.down.v }));
  }

  function spawn(o, L, Tp, W, Hh, first) {
    o.alive = true; o.t = 0;
    o.x = L + rnd() * W; o.y = Tp + rnd() * Hh;
    o.life = 4 + rnd() * 5;
    o.s = rnd() < 0.25 ? 2 : 1;
    switch (o.kind) {
      case FLY: o.life = 12 + rnd() * 10; o.vx = 0; o.vy = 0; break;
      case LEAF:
        if (!hasTree) { o.alive = false; o.t = -1 - rnd() * 2; return; }
        o.x = tx + (rnd() - 0.5) * 34; o.y = ty - 34 - rnd() * 8; o.gy = ty + 2 + rnd() * 14;
        o.vx = 8 + rnd() * 10; o.vy = 12 + rnd() * 6; o.life = 9;
        hasTree = false;
        break;
      case BAT: o.life = 9 + rnd() * 8; { const an = rnd() * 6.2832, v = 70 + rnd() * 40; o.vx = Math.cos(an) * v; o.vy = Math.sin(an) * v; } break;
      case GLOW: o.life = 6 + rnd() * 6; o.s = 1; break;
      case FLOAT: o.vx = (rnd() - 0.5) * 8; o.vy = -o.v * (0.7 + rnd() * 0.6); break;
      case FALL: o.vx = -6 + rnd() * 10; o.vy = o.v * (0.7 + rnd() * 0.6); if (!first) o.y = Tp + rnd() * Hh * 0.5; break;
    }
    if (first) o.t = rnd() * o.life * 0.6;
  }

  function update(dt, cam) {
    const m = G.Camera.persp ? 180 : 50, L = cam.left() - m, Tp = cam.top() - m, W = cam.w + m * 2, Hh = cam.h + m * 2;
    const now = G.Anim.now;
    for (let i = 0; i < P.length; i++) {
      const o = P[i];
      if (o.t < 0) { o.t += dt; continue; }
      if (!o.alive) { spawn(o, L, Tp, W, Hh, true); continue; }
      o.t += dt;
      if (o.t >= o.life) { o.alive = false; o.t = -rnd() * 2; continue; }
      switch (o.kind) {
        case FLY: {
          // Vuela a tirones, como las mariposas: rumbo que cambia poco a poco y un sube y baja.
          const an = o.seed + now * 0.5 + Math.sin(now * 0.9 + o.seed) * 2.4;
          o.x += Math.cos(an) * 26 * dt; o.y += (Math.sin(an) * 22 + Math.sin(now * 7 + o.seed) * 24) * dt;
          break;
        }
        case LEAF:
          o.x += (o.vx + Math.sin(now * 2.4 + o.seed) * 22) * dt;
          if (o.y < o.gy) o.y += o.vy * dt; else o.vx = 0;     // (en el suelo se queda un momento)
          if (o.y >= o.gy && o.life > o.t + 1.6) o.life = o.t + 1.6;
          break;
        case BAT: o.x += o.vx * dt; o.y += (o.vy + Math.sin(now * 9 + o.seed) * 30) * dt; break;
        case GLOW: o.x += Math.cos(now * 0.7 + o.seed) * 16 * dt; o.y += Math.sin(now * 1.1 + o.seed * 2) * 12 * dt; break;
        case FLOAT: o.x += (o.vx + Math.sin(now * 1.7 + o.seed) * 7) * dt; o.y += o.vy * dt; break;
        case FALL: o.x += (o.vx + Math.sin(now * 1.3 + o.seed) * 10 - G.Anim.gust * 8) * dt; o.y += o.vy * dt; break;
      }
      // (Fuera de la vista no se dibuja ni se le da más vueltas: reaparece.)
      if (o.x < L - 40 || o.x > L + W + 40 || o.y < Tp - 40 || o.y > Tp + Hh + 40) { o.alive = false; o.t = -rnd(); }
    }
  }

  // ---------------- capas ----------------

  function ground(ctx, view) {
    if (!G.Anim.on) return;
    if (!atlas && !buildAtlas()) return;
    const dt = G.Anim.dt, bi = G.World.biome, r = recipe(bi), cam = G.Camera, B = G.Tiles.BIOMES[bi];
    update(dt, cam);
    if (G.Weather) G.Anim.setForce(G.Weather.windK);
    const L = view.left(), Tp = view.top(), W = view.w, Hh = view.h;
    // Sombras de nubes: tres manchas que cruzan el mapa despacio, en una rejilla que da la vuelta alrededor de la cámara.
    if (r.cloud && G.Settings.fx > 0) {
      ctx.globalAlpha = 0.13;
      const SP = 1500, CW = 112 * PX * 2, CH = 60 * PX * 2;
      for (const c of clouds) {
        c.x += (6 + G.Anim.gust * 8) * dt; c.y += 1.5 * dt;
        const x = L - CW + ((c.x - L) % SP + SP) % SP, y = Tp - CH + ((c.y - Tp) % SP + SP) % SP;
        if (x > L + W || y > Tp + Hh) continue;
        const im = cloud(c.i);
        if (im) ctx.drawImage(im, Math.round(x / PX) * PX, Math.round(y / PX) * PX, CW, CH);
      }
      ctx.globalAlpha = 1;
    }
    // Sombra de la bandada: lejos del pájaro, que va alto.
    if (flock) drawFlock(ctx, true);
    // Ondas: en el agua, de vez en cuando; en la lava, burbujas; con lluvia, gotas por todas partes.
    const rain = G.Weather && G.Weather.current && G.Weather.current.kind === 'rain';
    ringT -= dt;
    if (ringT <= 0) {
      ringT = 0.4 + rnd() * 0.5;
      for (let i = 0; i < 4; i++) {
        const x = L + rnd() * W, y = Tp + rnd() * Hh;
        if (G.World.isLiquid(x, y)) { addRing(x, y, 0); break; }
      }
    }
    if (rain) { rainT -= dt; while (rainT <= 0) { rainT += 0.05; addRing(cam.left() + rnd() * cam.w, cam.top() + rnd() * cam.h, 1); } }
    const sh = ringSheet(B.foam || '#eaf7ff');
    if (sh) {
      for (const o of rings) {
        if (!o.on) continue;
        o.t += dt;
        const f = (o.t * (o.k ? 14 : 5)) | 0;
        if (f > 3) { o.on = false; continue; }
        ctx.globalAlpha = o.k ? 0.45 : 0.7;
        ctx.drawImage(sh, f * 16, 0, 16, 9, Math.round(o.x / PX) * PX - 16, Math.round(o.y / PX) * PX - 9, 32, 18);
      }
      ctx.globalAlpha = 1;
    }
  }
  function addRing(x, y, k) { for (const o of rings) if (!o.on) { o.on = true; o.x = x; o.y = y; o.t = 0; o.k = k; return; } }

  function drawFlock(ctx, shadow) {
    const s = SL[shadow ? 'birdsh' : 'bird'], f = flock;
    if (!s) return;
    const fr = f.t * 8 | 0;
    ctx.globalAlpha = shadow ? 0.5 : 1;
    for (let i = 0; i < f.n; i++) {
      // En V, detrás del primero, con un poco de vaivén cada uno.
      const side = i & 1 ? 1 : -1, row = (i + 1) >> 1, bx = f.x - f.dx * row * 26 - f.dy * side * row * 18, by = f.y - f.dy * row * 26 + f.dx * side * row * 18;
      const x = bx + (shadow ? 26 : 0), y = by + (shadow ? 74 : 0) + Math.sin(f.t * 3 + i) * 3;
      ctx.drawImage(atlas, s.x + ((fr + i) % s.n) * (s.w + 1), s.y, s.w, s.h, Math.round(x / PX) * PX, Math.round(y / PX) * PX, s.w * PX, s.h * PX);
    }
    ctx.globalAlpha = 1;
  }

  function air(ctx, cam) {
    if (!G.Anim.on || !atlas) return;
    const now = G.Anim.now, r = rec, dt = G.Anim.dt;
    for (let i = 0; i < P.length; i++) {
      const o = P[i];
      if (!o.alive) continue;
      const x = Math.round(o.x / PX) * PX, y = Math.round(o.y / PX) * PX;
      // Entra y sale a escalones.
      const e = Math.min(o.t, o.life - o.t), a = e > 0.8 ? 1 : e > 0.4 ? 0.66 : 0.33;
      switch (o.kind) {
        case FLY: {
          const s = SL['fly' + o.look], f = (now * 11 + o.seed | 0) & 1;
          ctx.drawImage(atlas, s.x + f * (s.w + 1), s.y, s.w, s.h, x, y, s.w * PX, s.h * PX);
          break;
        }
        case BAT: {
          const s = SL.bat, f = (now * 13 + o.seed | 0) & 1;
          ctx.drawImage(atlas, s.x + f * (s.w + 1), s.y, s.w, s.h, x, y, s.w * PX, s.h * PX);
          break;
        }
        case LEAF: {
          const B = G.Tileset.pal(G.World.biome), g = B ? B.grass : G.Tiles.BIOMES[G.World.biome].leaf;
          const sh = leafSheet(g[2], g[3] || g[2]);
          if (!sh) break;
          ctx.globalAlpha = a;
          ctx.drawImage(sh, ((now * 5 + o.seed | 0) & 3) * 5, 0, 4, 3, x, y, 4 * PX, 3 * PX);
          ctx.globalAlpha = 1;
          break;
        }
        case GLOW: {
          const im = halo(o.c);
          if (!im) break;
          const k = Math.sin(now * 2.2 + o.seed);                // parpadea
          if (k < -0.5) break;
          ctx.globalAlpha = (k > 0.2 ? 1 : 0.6) * a;
          ctx.drawImage(im, x - 7, y - 7, 14, 14);
          ctx.globalAlpha = 1;
          break;
        }
        default:
          ctx.globalAlpha = a * 0.85;
          ctx.fillStyle = o.c;
          ctx.fillRect(x, y, o.s * PX, o.s * PX);
          ctx.globalAlpha = 1;
      }
    }
    // Bandada: de vez en cuando cruza la pantalla, alta. Sólo si no hay nada que ver en el aire (no tapa los ataques: arriba del todo).
    if (r.bird) {
      if (flock) {
        const f = flock;
        f.t += dt; f.x += f.dx * 150 * dt; f.y += f.dy * 150 * dt;
        drawFlock(ctx, false);
        if (f.t > f.life) { flock = null; flockT = 14 + rnd() * 18; }
      } else if ((flockT -= dt) <= 0 && G.Settings.fx > 0) {
        const right = rnd() < 0.5, an = (right ? 0 : Math.PI) + (rnd() - 0.5) * 0.7;
        const W = cam.w, H = cam.h;
        flock = { x: right ? cam.left() - 60 : cam.left() + W + 60, y: cam.top() + H * (0.1 + rnd() * 0.7), dx: Math.cos(an), dy: Math.sin(an), t: 0,
                  life: (W + 200) / 150 + 1, n: 3 + (rnd() * 3 | 0) };
      }
    }
  }

  /** world.js: un árbol que se ve (de aquí salen las hojas). */
  function tree(p) { if (!hasTree) { tx = p.x; ty = p.y; hasTree = rnd() < 0.2; } }

  return { ground, air, tree, ring: (x, y) => addRing(x, y, 0), reset() { recipeOf = -1; flock = null; flockT = 6; for (const o of rings) o.on = false; for (const o of P) { o.alive = false; o.t = 0; } } };
})();
