/* ============ sprites.js — sprites estilo Mundo Misterioso (locales) ============
 * Hojas de SpriteCollab en assets/pokemon/{dex}/{Anim}.png, geometría en
 * G.SPRITE_META (js/data/sprites-meta.js, generado por tools/fetch_sprites.py).
 *
 *   columnas = fotogramas · filas = 8 direcciones
 *   0 Down · 1 DownRight · 2 Right · 3 UpRight · 4 Up · 5 UpLeft · 6 Left · 7 DownLeft
 *
 * Cada animación tiene su propio tamaño de fotograma, así que se alinean por el
 * ancla al suelo (ax, ay): ese píxel cae siempre en los pies de la entidad y
 * el sprite no "salta" al pasar de Walk a Attack.
 *
 * Animaciones extra (26-10-2026): además de las 7 de siempre, las que tenga cada
 * Pokémon en atlas (varias animaciones por PNG, cada una en su x, y):
 *   Sleep.png  Sleep                       dormir; caer, los que no tienen Faint propio
 *   Ext.png    Hop, Rotate                 saltar, girar (casi todos)
 *   More.png   Pose, Eat, Nod, LookUp...   sólo ~220 (los de Mundo Misterioso original)
 * Se cargan cuando hacen falta (warm, o al pedirlas): ready() dice si ya se pueden
 * enseñar; si no, se usa una de las de siempre (choose).
 */
G.Sprites = (() => {
  /** Unidades de mundo por píxel de arte. Tiles y sprites comparten escala. */
  const PX = 2;
  const sheets = new Map();          // "dex/Anim[/s]" -> {img, ready, failed}

  function meta(dex) { return G.SPRITE_META[dex] || null; }

  /** ¿Flota en su sprite? (tools/hover_flags.py) Pasa por encima de rocas y agua. */
  function hovers(dex) { const m = meta(dex); return !!(m && m.hv); }

  /**
   * Versión blanca de una imagen (para el destello al recibir un golpe).
   * Se hace una vez por hoja con composición "source-in": mucho más barato
   * que ctx.filter en cada dibujo, que era lo que más ralentizaba con muchos
   * enemigos a la vez.
   */
  const whites = new WeakMap();
  function white(img) {
    let c = whites.get(img);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    whites.set(img, c);
    return c;
  }

  /** ¿Tiene versión shiny? (assets/pokemon/{dex}/s/) */
  function hasShiny(dex) { const m = meta(dex); return !!(m && m.sh); }

  /** Animaciones disponibles para esa variante (las de siempre y las extra). */
  function has(m, anim, shiny) {
    if (m.a[anim]) return !(shiny && m.sm && m.sm.includes(anim));
    return !!(m.x && m.x[anim]) && !(shiny && m.xm && m.xm.includes(anim));
  }

  // ---------------- animaciones extra (atlas) ----------------
  // G.SPRITE_META[dex].x = { anim: [archivo, w, h, filas, ax, ay, x, y, ...duraciones] }
  // (compacto: son ~1000 Pokémon). Se convierten una vez al formato de las de siempre.
  // archivo: índice en G.SPRITE_EXT (los nombres de los atlas, también en sprites-meta.js).
  const xmetas = new Map();
  function extMeta(dex, anim) {
    const m = meta(dex), v = m && m.x && m.x[anim];
    if (!v) return null;
    const k = dex + '/' + anim;
    let o = xmetas.get(k);
    if (!o) {
      o = { w: v[1], h: v[2], r: v[3], ax: v[4], ay: v[5], x: v[6], y: v[7], d: v.slice(8), n: v.length - 8, f: (G.SPRITE_EXT || ['Ext', 'More', 'Sleep'])[v[0]] || 'Ext' };
      xmetas.set(k, o);
    }
    return o;
  }

  /** ¿Tiene esa animación de verdad (sin cambiarla por Idle)? */
  function can(dex, anim, shiny = false) {
    const m = meta(dex);
    return !!m && has(m, anim, shiny && !!m.sh);
  }

  /** ¿Tiene una animación de caer propia? (La mayoría no: su Faint es una copia de Hurt.) */
  function ownFaint(dex) { const m = meta(dex); return !!(m && m.fo); }

  /** ¿La tiene y ya está cargada? (Si no está, la empieza a cargar.) */
  function ready(dex, anim, shiny = false) {
    if (!can(dex, anim, shiny)) return false;
    const s = sheet(dex, anim, shiny);
    return !!(s && s.ready);
  }

  /**
   * La primera de `list` que se pueda enseñar ya; si ninguna, la última si es de
   * las de siempre (están precargadas) o null.
   */
  function choose(dex, shiny, list) {
    for (const a of list) if (ready(dex, a, shiny)) return a;
    const last = list[list.length - 1], m = meta(dex);
    return m && m.a[last] ? last : null;
  }

  /**
   * Cuánto sube de verdad cada fotograma (píxeles de arte por encima de los pies, mirando
   * abajo) de una animación ya cargada; null si aún no lo está. Se mira una vez en la
   * imagen: los marcos llevan mucho hueco (el de Hop, sitio para el salto).
   */
  const tops = new Map();
  function frameTops(dex, anim, shiny = false) {
    const key = dex + '/' + anim;
    if (tops.has(key)) return tops.get(key);
    const s = ready(dex, anim, shiny) && sheet(dex, anim, shiny), m = s && animMeta(dex, anim, shiny);
    if (!m) return null;
    const out = new Array(m.n).fill(m.ay);
    try {
      const c = document.createElement('canvas');
      c.width = m.n * m.w; c.height = m.h;
      const x = c.getContext('2d');
      x.drawImage(s.img, m.x || 0, m.y || 0, c.width, c.height, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      for (let f = 0; f < m.n; f++) {
        out[f] = 0;
        rows: for (let y = 0; y < m.h; y++) {
          for (let i = (y * c.width + f * m.w) * 4 + 3, e = i + m.w * 4; i < e; i += 4) if (d[i] > 40) { out[f] = m.ay - y; break rows; }
        }
      }
    } catch (e) { /* abierto con doble clic (file://): no deja mirar los píxeles; el marco entero */ }
    tops.set(key, out);
    return out;
  }
  /** Lo que más sube (su fotograma más alto); null si no está cargada. */
  function reach(dex, anim, shiny = false) {
    const t = frameTops(dex, anim, shiny);
    return t ? Math.max(...t) : null;
  }

  /** Empieza a cargar los atlas de animaciones extra de ese Pokémon (tu Pokémon, el del menú). */
  function warm(dex, shiny = false) {
    const m = meta(dex);
    if (!m || !m.x) return;
    const seen = new Set();
    for (const a in m.x) {
      const f = m.x[a][0];
      if (seen.has(f) || !can(dex, a, shiny)) continue;
      seen.add(f);
      sheet(dex, a, shiny);
    }
  }

  function animName(dex, anim, shiny = false) {
    const m = meta(dex);
    if (!m) return null;
    shiny = shiny && !!m.sh;
    if (has(m, anim, shiny)) return anim;
    return has(m, 'Idle', shiny) ? 'Idle' : 'Walk';
  }

  /** Geometría de una animación (la shiny sólo difiere en casos raros). */
  function animMeta(dex, anim, shiny = false) {
    const m = meta(dex);
    if (!m) return null;
    const name = animName(dex, anim, shiny);
    if (!m.a[name]) return extMeta(dex, name);     // extra: misma colocación en el shiny
    if (shiny && m.sh && m.sa && m.sa[name]) return m.sa[name];
    return m.a[name] || null;
  }

  // Hojas en memoria como mucho. Antes no se soltaba ninguna: en partidas de
  // más de una hora pasaban cientos de especies, se llenaba la memoria gráfica
  // y la pantalla se quedaba en negro hasta que el navegador recargaba la página.
  const MAX_SHEETS = 200, IDLE_MS = 20000;   // ~0,66 MB cada una ya dibujada: ~130 MB
  function evict(now) {
    const old = [...sheets].filter(([, s]) => now - s.at > IDLE_MS).sort((a, b) => a[1].at - b[1].at);
    const drop = old.slice(0, Math.max(sheets.size - Math.floor(MAX_SHEETS * 0.75), 0));
    for (const [k, s] of drop) {
      sheets.delete(k);
      s.img.onload = s.img.onerror = null;
      s.img.src = '';                 // suelta la imagen decodificada
    }
  }

  function sheet(dex, anim, shiny = false) {
    const m = meta(dex);
    shiny = shiny && !!(m && m.sh);
    let name = animName(dex, anim, shiny);
    if (!name) return null;
    // Las extra van en su atlas (Ext, More o Sleep): una hoja para varias animaciones.
    if (!m.a[name]) { const x = extMeta(dex, name); name = x ? x.f : 'Idle'; }
    const k = dex + '/' + name + (shiny ? '/s' : '');
    let s = sheets.get(k);
    const now = Date.now();
    if (s) {
      s.at = now;
      // Si la descarga se cortó (red mala, servidor saturado), reintenta más tarde.
      if (s.failed && performance.now() > s.retryAt) { s.failed = false; s.img.src = s.src + '?r=' + s.tries; }
      return s;
    }
    if (sheets.size >= MAX_SHEETS) evict(now);
    s = { ready: false, failed: false, img: new Image(), tries: 0, retryAt: 0, at: now,
          src: `assets/pokemon/${dex}/${shiny ? 's/' : ''}${name}.png` };
    s.img.onload = () => { s.ready = true; };
    s.img.onerror = () => { s.failed = true; s.retryAt = performance.now() + 1000 * Math.min(8, 2 ** s.tries++); };
    s.img.src = s.src;
    sheets.set(k, s);
    return s;
  }

  const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];

  /** Precarga todas las animaciones de esos Pokémon. */
  function preload(dexes, timeout = 8000, shiny = false) {
    const hs = [];
    for (const d of dexes) for (const a of ANIMS) { const s = sheet(d, a, shiny); if (s) hs.push(s); }
    return new Promise(res => {
      const t0 = performance.now();
      (function check() {
        if (hs.every(h => h.ready || h.failed) || performance.now() - t0 > timeout) return res();
        setTimeout(check, 50);
      })();
    });
  }

  /** Ángulo de pantalla (atan2(dy,dx)) -> fila de dirección 0..7. */
  function dirFromAngle(a) {
    return ((Math.round((Math.PI / 2 - a) / (Math.PI / 4)) % 8) + 8) % 8;
  }

  /** Radio de colisión aproximado a partir del tamaño del sprite. */
  function bodyRadius(dex, scale = 1) {
    const m = animMeta(dex, 'Idle');
    const w = m ? m.w : 32;
    return G.U.clamp(w * 0.22, 5, 26) * PX * scale;
  }

  /*
   * Tu Pokémon, si es de los grandes (18-10-2026: Onix, Gyarados, Eternatus...
   * chocaban con todo y casi no se podía jugar con ellos):
   *   - se dibuja más pequeño, pero sin pasarse: hasta 36 píxeles de alto (el
   *     90 % de los Pokémon) igual; lo que pase de ahí cuenta un 40 %. Gyarados
   *     queda al 75 % y sigue siendo de los más grandes. Los muy anchos y no
   *     tan altos (Cetitan, Regieleki) cuentan por su ancho (el del marco × 0,55).
   *   - choca como uno normal: como mucho PLAYER_R de radio (el de Pikachu; el
   *     85 % de los Pokémon no llega), así cabe por los pasillos y no recibe
   *     más golpes por ser grande.
   */
  const BIG_H = 36, BIG_K = 0.4, PLAYER_R = 18;
  function playerScale(dex) {
    const m = animMeta(dex, 'Idle');
    const h = m ? Math.max(m.ay, m.w * 0.55) : 24;
    if (h <= BIG_H) return 1;
    return Math.round((BIG_H + (h - BIG_H) * BIG_K) / h * 16) / 16;
  }
  function playerRadius(dex) { return Math.min(PLAYER_R, bodyRadius(dex, playerScale(dex))); }

  /** Alto visual aproximado (para barras de vida y números de daño). */
  function bodyHeight(dex, scale = 1) {
    const m = animMeta(dex, 'Idle');
    return (m ? m.ay : 24) * PX * scale;
  }

  /** Sombra elíptica bajo los pies, tamaño según el ShadowSize de PMD. */
  function drawShadow(ctx, dex, x, y, scale = 1) {
    const m = meta(dex);
    const s = m ? m.s : 1;
    const rx = [5, 8, 12][G.U.clamp(s, 0, 2)] * PX * scale;
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.42, 0, 0, 6.2832);
    ctx.fill();
  }

  // ---------------- Animator ----------------

  /**
   * Reproduce las animaciones de un Pokémon.
   *   loop(anim)        animación de fondo (Idle / Walk); no reinicia si ya suena
   *   play(anim, opts)  animación de una vez (Attack, Shoot, Hurt...) que tapa
   *                     a la de fondo hasta que termina
   *   sub               { Idle: 'Sleep' }: cambia la de fondo que pida el que lo
   *                     mueve (dormido, aturdido...) sin tocar su código; subK, su velocidad
   *   director(dt, a)   si lo hay, se llama en cada update (el compañero del menú, reel)
   */
  class Animator {
    constructor(dex, scale = 1, shiny = false) {
      this.dex = dex;
      this.shiny = shiny && hasShiny(dex);
      this.scale = scale;
      this.base = 'Idle';
      this.cur = 'Idle';
      this.frame = 0;
      this.t = 0;              // tiempo dentro del fotograma, en 1/60 s
      this.speed = 1;
      this.once = false;
      this.hold = false;       // se queda en el último fotograma (Faint)
      this.done = false;
      this.next = null;        // animación de una vez que va detrás de la que suena
      this.sub = null;
      this.subK = 1;
      this.director = null;
      this.ceil = null;        // techo (ver draw)
      this.dir = 0;
      // Las hojas se cargan al dibujarse por primera vez; la run las precarga
      // todas con preload() para que no parpadeen al primer ataque.
    }

    loop(anim, speed = 1) {
      const s = this.sub && this.sub[anim];
      if (s) { anim = s; speed = this.subK; }
      this.base = anim;
      // (cur es la que suena de verdad: si no la tiene, Idle; así no se reinicia en cada fotograma.)
      if (!this.once && this.cur !== anim && this.cur !== animName(this.dex, anim, this.shiny)) this._start(anim, false);
      if (!this.once) this.speed = speed;
    }

    /** opts: { speed, hold, then (otra de una vez detrás) } */
    play(anim, opts = {}) {
      // Caer (26-10-2026): los que no tienen animación propia (su Faint es una copia de
      // Hurt) se encogen y se quedan tumbados (Sleep), si ya está cargada; si no, como antes.
      if (anim === 'Faint' && opts.hold && !ownFaint(this.dex) && ready(this.dex, 'Sleep', this.shiny)) {
        anim = 'Hurt'; opts = { hold: true, then: 'Sleep' };
      }
      this._start(anim, true);
      this.next = opts.then || null;
      this.speed = opts.speed || 1;
      this.hold = !!opts.hold;
    }

    /** ¿Está sonando una animación de una vez sin terminar? */
    busy() { return this.once && !this.done; }

    /** Progreso 0..1 de la animación actual. */
    progress() {
      const m = animMeta(this.dex, this.cur, this.shiny);
      if (!m) return 1;
      let total = 0, before = 0;
      for (let i = 0; i < m.n; i++) { if (i < this.frame) before += m.d[i]; total += m.d[i]; }
      return total ? (before + this.t) / total : 1;
    }

    _start(anim, once) {
      this.cur = animName(this.dex, anim, this.shiny) || 'Idle';
      this.frame = 0; this.t = 0;
      this.once = once; this.done = false;
      if (!once) this.next = null;
    }

    update(dt) {
      if (this.director) this.director(dt, this);
      const m = animMeta(this.dex, this.cur, this.shiny);
      if (!m || this.done) return;
      this.t += dt * 60 * this.speed;
      while (this.t >= m.d[this.frame]) {
        this.t -= m.d[this.frame];
        this.frame++;
        if (this.frame >= m.n) {
          if (this.once) {
            if (this.next) { const n = this.next; this.next = null; this._start(n, true); return; }
            if (this.hold) { this.frame = m.n - 1; this.done = true; return; }
            // Vuelve a la animación de fondo.
            this._start(this.base, false);
            this.speed = 1;
            return;
          }
          this.frame = 0;
        }
      }
    }

    /** Dibuja con los pies en (x, y). opts: { flash, alpha } */
    draw(ctx, x, y, opts = {}) {
      let m = animMeta(this.dex, this.cur, this.shiny);
      let s = sheet(this.dex, this.cur, this.shiny);
      const k = PX * this.scale;
      if (s && !s.ready) {
        // Mientras carga esta animación, enseña Idle si ya está.
        const idle = sheet(this.dex, 'Idle', this.shiny);
        if (idle && idle.ready) { s = idle; m = animMeta(this.dex, 'Idle', this.shiny); }
      }
      const own = s === sheet(this.dex, this.cur, this.shiny), frame = own ? this.frame : 0;
      if (!m || !s || !s.ready) {
        // Respaldo: bolita, por si falta el fichero.
        ctx.fillStyle = opts.color || '#6b7a94';
        ctx.beginPath(); ctx.arc(x, y - 12 * k, 8 * k, 0, 6.2832); ctx.fill();
        return;
      }
      const row = Math.min(this.dir, m.r - 1);
      const alpha = opts.alpha == null ? 1 : opts.alpha;
      if (alpha <= 0) return;
      // (x, y: dónde empieza la animación dentro de su atlas; las de siempre, en 0, 0.)
      const sx = (m.x || 0) + Math.min(frame, m.n - 1) * m.w, sy = (m.y || 0) + row * m.h;
      const dx = Math.round(x - m.ax * k);
      let dy = Math.round(y - m.ay * k);
      // Techo (el compañero del menú, ceil en píxeles de arte sobre los pies): el fotograma
      // que suba más se baja lo que sobre (un salto más corto en vez de cortarse arriba).
      if (this.ceil != null && own) {
        const ft = tops.get(this.dex + '/' + this.cur);
        if (ft && ft[frame] > this.ceil) dy += Math.round((ft[frame] - this.ceil) * k);
      }
      const prev = ctx.globalAlpha;
      if (alpha < 1) ctx.globalAlpha = prev * alpha;
      // Destello: blanco entero (enemigos) o medio blanco encima (tu Pokémon).
      if (!opts.flash || opts.softFlash) ctx.drawImage(s.img, sx, sy, m.w, m.h, dx, dy, m.w * k, m.h * k);
      if (opts.flash) {
        if (opts.softFlash) ctx.globalAlpha = prev * alpha * 0.55;
        ctx.drawImage(white(s.img), sx, sy, m.w, m.h, dx, dy, m.w * k, m.h * k);
      }
      ctx.globalAlpha = prev;
    }
  }

  // ---------------- el compañero del menú ----------------
  /*
   * Repertorio del compañero de la pantalla de inicio (26-10-2026): un rato quieto y,
   * cada pocos segundos, algo al azar de lo que tenga: atacar, saltar, girar, posar,
   * comer, asentir, mirar a un lado, sentarse, echarse una siesta... Nunca lo mismo
   * dos veces seguidas y sólo lo que ya esté cargado. reel(animator, room) se lo pone
   * (animator.director); el que lo dibuja sólo tiene que llamar a update y draw.
   * room(): lo que se ve por encima de sus pies, en píxeles de arte. Lo que suba más (un
   * salto en un escenario justo) se baja para que no se corte (animator.ceil: un salto
   * más corto) y lo que ni quieto quepa no lo hace.
   */
  const REEL = [
    // [animación, peso, veces seguidas]
    ['Attack', 3, 1], ['Shoot', 2, 1], ['Charge', 2, 1], ['Hop', 4, 2], ['Rotate', 3, 1], ['Pose', 4, 1],
    ['Nod', 3, 2], ['LookUp', 2, 1], ['Eat', 3, 3], ['Twirl', 3, 1], ['DeepBreath', 2, 1]
  ];
  function reel(a, room = null) {
    const S = { mode: 'idle', base: 'Idle', t: G.U.rand(1.2, 2.4), last: '', act: '', reps: 0 };
    warm(a.dex, a.shiny);
    const ok = n => {
      if (!ready(a.dex, n, a.shiny)) return false;
      const t = room && frameTops(a.dex, n, a.shiny);
      return !t || Math.min(...t) <= room();
    };
    const rest = () => { S.mode = 'idle'; S.base = 'Idle'; S.t = G.U.rand(2.4, 4.8); a.dir = 0; };
    const act = (name, reps) => { S.mode = 'act'; S.act = S.last = name; S.reps = reps; a.play(name); };
    a.director = dt => {
      if (room) a.ceil = room();
      if (S.mode === 'act') {
        // Las repeticiones (comer tres veces...), encadenadas sin pasar por Idle.
        if (a.busy()) { if (S.reps > 1 && !a.next) { a.next = S.act; S.reps--; } } else rest();
      } else if ((S.t -= dt) <= 0) {
        if (S.mode === 'nap') {
          // Se despierta (con su animación, si la tiene).
          rest();
          if (ok('Wake')) act('Wake', 1);
        } else if (S.mode !== 'idle') rest();
        else {
          const r = Math.random();
          if (r < 0.13 && S.last !== 'nap' && ok('Sleep')) {
            S.mode = 'nap'; S.base = 'Sleep'; S.t = G.U.rand(5, 8); S.last = 'nap';
          } else if (r < 0.22 && S.last !== 'sit' && ok('Sit')) {
            S.mode = 'sit'; S.base = 'Sit'; S.t = G.U.rand(2.5, 4); S.last = 'sit';
          } else if (r < 0.34 && S.last !== 'look') {
            S.mode = 'look'; a.dir = G.U.pick([1, 7, 2, 6]); S.t = G.U.rand(1.2, 2.2); S.last = 'look';
          } else {
            const opts = REEL.filter(([n]) => n !== S.last && ok(n));
            let w = Math.random() * opts.reduce((s, o) => s + o[1], 0);
            const o = opts.find(x => (w -= x[1]) < 0) || opts[0];
            if (o) act(o[0], o[2]); else rest();
          }
        }
      }
      a.loop(S.base);
    };
    return a;
  }

  return { PX, meta, hasShiny, hovers, white, animMeta, sheet, preload, dirFromAngle, bodyRadius, bodyHeight, playerScale, playerRadius,
           drawShadow, Animator, ANIMS, get sheetCount() { return sheets.size; },
           // 26-10-2026: animaciones extra (ver arriba)
           can, ready, choose, warm, ownFaint, reach, reel };
})();
