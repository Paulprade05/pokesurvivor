/* ============ home-in.js — dentro de tu choza: andar, muebles e invitados ============
 * Pedido del dueño (17-11-2026): «quiero poder entrar dentro de ella y personalizarla e invitar pokémon a ella para que
 * vivan». Se entra por la puerta de tu choza en la aldea (village.js go('home')) y se ve su interior: una habitación de
 * Mundo Misterioso en pixel art (tools/pxl/choza.px.js → assets/pxl/chozain.png), con el suelo, la pared y los muebles que
 * elijas (data/home.js) y tus Pokémon invitados paseando, durmiendo en la cama o sentados en su cojín.
 *
 * Cómo encaja: village.js sigue llevando la pantalla (el menú, el desplegable, el botón de entrar y hablar, el sprint) y,
 * mientras estás dentro, le pasa cada fotograma a frame() en lugar de dibujar la aldea en 3D (dentro no se dibuja nada en
 * 3D: es más barato que fuera, también en el móvil). La tienda y el editor son el panel de tu choza (ui/home-ui.js), que
 * aquí se abre con «Decorar» y pide colocar (place), mover (pickItem) y quitar.
 *
 * Unidades: el arte va a 24 px por casilla y cada píxel de arte son 2 unidades (PX), como los sprites de los Pokémon. La
 * habitación: la pared arriba (WALL px de alto) y el suelo de ROOM.W × ROOM.H casillas; la puerta, abajo en medio.
 * Se dibuja a un número entero de píxeles de pantalla por píxel de arte (docs/ESTILO-ARTE.md, regla 3).
 */
G.HomeIn = (() => {
  const $ = id => document.getElementById(id);
  const PX = 2, C = 24, WALL = 48, SIDE = 6;
  const SPEED = 120;
  /** Dónde está cada pieza en el atlas [x, y, ancho, alto] (px de arte; los de pie llevan 1 px de contorno por lado). */
  const FLOOR = { wood: 0, moss: 24, weave: 48, stone: 72, crystal: 96 };
  const WALLS = { wood: 0, roots: 24, leaf: 48, stone: 72, metal: 96 };
  const ART = {
    bed: [0, 72, 48, 52], table: [48, 72, 48, 30], shelf: [96, 72, 48, 56], sofa: [144, 72, 48, 34], stove: [192, 72, 48, 48], tank: [240, 72, 48, 40],
    rug: [0, 128, 72, 48], lamp: [72, 128, 24, 40], plant: [96, 128, 24, 34], crystal: [120, 128, 24, 34], chest: [144, 128, 24, 24], stool: [168, 128, 24, 20],
    cushion: [192, 128, 22, 16], window: [216, 128, 24, 24], painting: [240, 128, 24, 20], garland: [264, 128, 46, 14], mat: [0, 176, 46, 12]
  };
  /** Frases de tus invitados (en inglés, lang-en.js). */
  const LINES = ['¡Qué bien se vive aquí!', '(Se estira, muy a gusto.)', '¡Gracias por invitarme!', '(Mira los muebles con curiosidad.)', '¿Jugamos luego?'];

  let img = null, on = false, t = 0, pl = null, guests = [], near = null, shown = '';
  let lay = { s: 1, ox: 0, oy: 0, k: 2, dpr: 1 };      // dibujo: unidades de mundo → px del lienzo
  let ghost = null;          // colocando: { id, x, y, ok, move: índice si se está moviendo }
  let sel = -1;              // el mueble elegido (en el editor)
  let preview = null;        // { floor, wall } que se prueba en la tienda
  let walkPrev = false, haloCache = new Map(), btnsHid = false;

  const H = () => G.Home;
  const R = () => H().ROOM;
  const RW = () => R().W * C, RH = () => WALL + R().H * C;
  /** Centro (mundo) de una casilla del suelo. */
  const cellC = (cx, cy) => [(cx + 0.5) * C * PX, (WALL + (cy + 0.5) * C) * PX];
  /** Casilla del suelo de un punto (mundo). */
  const cellAt = (x, y) => [Math.floor(x / PX / C), Math.floor((y / PX - WALL) / C)];

  function load() {
    if (img) return img;
    img = new Image();
    img.src = 'assets/pxl/chozain.png';
    return img;
  }

  // ---------------- entrar y salir ----------------
  /** Entra (desde village.js). */
  function enter() {
    load();
    on = true; t = 0; ghost = null; sel = -1; preview = null; walkPrev = false;
    const s = G.DB.save, dex = s && G.DEX_BY[s.partner] ? s.partner : 25, shiny = !!(s && s.partnerShiny && G.DB.ownsShiny(dex));
    pl = mon(dex, shiny, G.Sprites.playerScale(dex));
    pl.r = 10;
    const [dx] = cellC(5.5, 0);
    pl.x = dx; pl.y = (WALL + R().H * C - 10) * PX; pl.anim.dir = 4;
    G.Sprites.warm(dex, shiny);
    syncGuests(true);
    btnsHid = false;
    hud(true);
    G.Audio.sfx('click');
  }
  /** Sale (a la aldea, delante de tu choza). silent: sin sonido (al empezar una partida). */
  function leave(silent) {
    if (!on) return;
    on = false;
    ghost = null; sel = -1; preview = null;
    pl = null; guests = [];
    near = null; shown = ''; hud(false);
    if (G.HomeUI && G.HomeUI.isOpen) G.HomeUI.close(!!silent);
    else if (!silent) G.Audio.sfx('click');
  }
  function hud(v) {
    const b = $('vil-in');
    if (b) b.classList.toggle('hidden', !v);
    const a = $('vil-act');
    if (a && !v) { a.classList.add('hidden'); }
  }

  function mon(dex, shiny, scale = 1) {
    const anim = new G.Sprites.Animator(dex, scale, shiny);
    return { anim, x: 0, y: 0, r: 8, dex };
  }
  /** Los invitados de lo guardado (sin tu compañero: ese eres tú). */
  function syncGuests(force) {
    const s = G.DB.save, room = H().room(s), want = room.guests.filter(d => G.DEX_BY[d] && !(pl && d === pl.dex));
    const have = guests.map(g => g.dex);
    if (!force && want.length === have.length && want.every((d, i) => d === have[i])) return;
    const old = new Map(guests.map(g => [g.dex, g]));
    guests = want.map((d, i) => {
      const g = old.get(d);
      if (g) return g;
      const n = mon(d, false);
      const spot = freeCells()[(i * 5 + 3) % Math.max(1, freeCells().length)] || [2 + i, 4];
      [n.x, n.y] = cellC(spot[0], spot[1]);
      Object.assign(n, { mode: 'idle', tt: 0.5 + i * 0.7, li: i, anim: n.anim });
      G.Sprites.warm(d);
      if (G.Sprites.can(d, 'Sleep')) G.Sprites.sheet(d, 'Sleep');
      return n;
    });
  }

  // ---------------- choques dentro ----------------
  function solidSet(items) {
    const set = new Set();
    for (const o of items) { const f = H().furn(o.id); if (f && !f.flat && !f.wall) for (const [x, y] of H().cells(o.id, o.x, o.y)) set.add(x + ',' + y); }
    return set;
  }
  let solidKey = '', solid = new Set();
  function solids() {
    const items = H().room().items, k = JSON.stringify(items);
    if (k !== solidKey) { solidKey = k; solid = solidSet(items); }
    return solid;
  }
  function freeCells() {
    const S = solids(), out = [];
    for (let y = 0; y < R().H; y++) for (let x = 0; x < R().W; x++) if (!S.has(x + ',' + y)) out.push([x, y]);
    return out;
  }
  /** ¿Choca el círculo (x, y, r) (mundo) con la pared, los lados o un mueble? */
  function blocked(x, y, r) {
    const x0 = 0, x1 = RW() * PX, y0 = (WALL + 4) * PX, y1 = RH() * PX;
    if (x - r < x0 || x + r > x1 || y - r * 0.5 < y0 || y > y1) return true;
    const S = solids(), cw = C * PX;
    const cx0 = Math.floor((x - r) / cw), cx1 = Math.floor((x + r) / cw), cy0 = Math.floor((y - r * 0.6 - WALL * PX) / cw), cy1 = Math.floor((y - WALL * PX) / cw);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (!S.has(cx + ',' + cy)) continue;
      const bx = cx * cw, by = WALL * PX + cy * cw;
      const nx = Math.max(bx, Math.min(x, bx + cw)), ny = Math.max(by, Math.min(y, by + cw));
      if (Math.hypot(nx - x, (ny - y) * 1.6) < r) return true;
    }
    return false;
  }
  function move(e, dx, dy) {
    const x0 = e.x, y0 = e.y;
    if (!blocked(e.x + dx, e.y + dy, e.r)) { e.x += dx; e.y += dy; }
    else if (!blocked(e.x + dx, e.y, e.r)) e.x += dx;
    else if (!blocked(e.x, e.y + dy, e.r)) e.y += dy;
    return Math.hypot(e.x - x0, e.y - y0);
  }
  /** ¿Está en el felpudo de la puerta? */
  function atDoor(e) {
    const D = H().DOOR;
    return e.y > (RH() - 12) * PX && e.x > D[0] * C * PX && e.x < (D[D.length - 1] + 1) * C * PX;
  }

  // ---------------- cada fotograma ----------------
  /**
   * village.js frame, mientras estás dentro. walk: se puede andar (sin nada encima); keysOk: no es el fotograma en que se
   * ha vuelto (el Esc de cerrar algo no te saca). → nada (siempre dibuja).
   */
  function frame(ctx, w, h, dpr, dt, walk, keysOk, run) {
    t += dt;
    if (!pl) return;
    layout(w, h, dpr);
    const editing = !!(G.HomeUI && G.HomeUI.isOpen);
    // Con el editor abierto, «Decorar» y «Salir» se esconden (no tapan la habitación).
    if (editing !== btnsHid) { btnsHid = editing; const b = $('vil-in'); if (b) b.classList.toggle('hidden', editing); }
    if (walk && !editing) update(dt, keysOk, run);
    else { pl.anim.loop('Idle'); pl.anim.update(dt); if (near) { near = null; prompt(); } }
    if (editing && keysOk) editKeys();
    // Con el ratón: el mueble que se coloca sigue al ratón.
    if (ghost && !(G.Touch && G.Touch.active) && performance.now() - G.Input.mouseMovedAt < 250) { const m = G.Input.mouse(); hover(m.x, m.y); }
    syncGuests(false);
    guestTick(dt);
    draw(ctx, w, h, dpr);
  }

  function update(dt, keysOk, run) {
    const ax = G.Input.axis();
    let mx = ax[0], my = ax[1];
    if (mx || my) target = null;
    else if (target) {
      const dx = target.x - pl.x, dy = target.y - pl.y, d = Math.hypot(dx, dy);
      if (d < 6) { const then = target.then; target = null; if (then) then(); }
      else { mx = dx / d; my = dy / d; }
    }
    const m = Math.hypot(mx, my), sp = SPEED * (run ? 1.7 : 1) * Math.min(1, m);
    let moved = 0;
    if (sp > 1) {
      moved = move(pl, mx / m * sp * dt, my / m * sp * dt);
      pl.anim.dir = G.Sprites.dirFromAngle(Math.atan2(my, mx));
      if (target && moved < sp * dt * 0.2 && (target.stuck = (target.stuck || 0) + dt) > 0.4) target = null;
      // Salir: andando hacia abajo por el felpudo.
      if (my > 0.3 && atDoor(pl)) { G.Village.exitHome(); return; }
    }
    pl.anim.loop(moved > 0.2 ? 'Walk' : 'Idle', run && moved > 0.2 ? 1.5 : 1);
    pl.anim.update(dt);
    // Lo que tienes cerca: un invitado o la puerta.
    let best = null, bd = 1e9;
    for (const g of guests) { const d = Math.hypot(g.x - pl.x, g.y - pl.y); if (d < 56 && d < bd) { bd = d; best = { guest: g }; } }
    if (!best && pl.y > (RH() - 40) * PX && Math.abs(pl.x - cellC(5.5, 0)[0]) < 70) best = { door: true };
    near = best;
    prompt();
    if (keysOk) {
      if (G.Input.tap('keye') || G.Input.tap('enter') || G.Input.tap('space') || G.Input.act('open')) act();
    }
  }
  let target = null;

  function prompt() {
    const b = $('vil-act');
    if (!b) return;
    const k = !near ? '' : near.door ? 'door' : 'g' + near.guest.dex;
    if (k === shown) return;
    shown = k;
    b.classList.toggle('hidden', !near);
    b.classList.remove('play');
    if (!near) return;
    $('vil-act-t').textContent = G.T(near.door ? 'Salir' : 'Hablar');
    $('vil-act-s').textContent = near.door ? G.T('A la aldea') : (G.DEX_BY[near.guest.dex] || {}).name || '';
    $('vil-act-ico').innerHTML = near.door ? G.Icons.html('sprout', 24) : G.UI.svg('heart', 20);
  }
  function act() {
    if (!near) return;
    if (near.door) { G.Village.exitHome(); return; }
    const g = near.guest;
    g.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - g.y, pl.x - g.x));
    pl.anim.dir = G.Sprites.dirFromAngle(Math.atan2(g.y - pl.y, g.x - pl.x));
    if (g.mode === 'sleep') { g.bubble = { text: 'Zzz...', t: 2.4 }; g.emote = { sym: 'z', t: 1.6 }; G.Audio.sfx('click'); return; }
    g.bubble = { text: G.T(LINES[g.li++ % LINES.length]), t: 3.2 };
    g.emote = { sym: '♥', t: 1.6 };
    g.anim.play(G.Sprites.choose(g.dex, false, ['Hop', 'Nod', 'Pose', 'Attack']) || 'Attack');
    g.mode = 'idle'; g.tt = Math.max(g.tt, 3);
    G.Audio.sfx('click');
  }

  // ---------------- los invitados ----------------
  function guestTick(dt) {
    const items = H().room().items;
    for (const g of guests) {
      g.tt -= dt;
      if (g.bubble && (g.bubble.t -= dt) <= 0) g.bubble = null;
      if (g.emote && (g.emote.t -= dt) <= 0) g.emote = null;
      let moving = false;
      if (g.mode === 'walk' || g.mode === 'bed') {
        const dx = g.goal[0] - g.x, dy = g.goal[1] - g.y, d = Math.hypot(dx, dy);
        if (d < 5 || g.tt < -8) {
          if (g.mode === 'bed' && g.rest) { g.x = g.rest[0]; g.y = g.rest[1]; g.mode = 'sleep'; g.tt = 7 + Math.random() * 8; g.emote = { sym: 'z', t: 1.6 }; }
          else { g.mode = 'idle'; g.tt = 1.2 + Math.random() * 3; }
        } else {
          const m = move(g, dx / d * 55 * dt, dy / d * 55 * dt);
          moving = m > 0.15;
          if (moving) g.anim.dir = G.Sprites.dirFromAngle(Math.atan2(dy, dx));
          else if (g.mode === 'bed' && d < 46 && g.rest) { g.x = g.rest[0]; g.y = g.rest[1]; g.mode = 'sleep'; g.tt = 7 + Math.random() * 8; }
          else { g.mode = 'idle'; g.tt = 0.6 + Math.random(); }
        }
      } else if (g.mode === 'sleep') {
        if (g.tt <= 0) {
          // Se levanta: a la casilla libre más cercana.
          const fc = freeCells();
          let best = null, bd = 1e9;
          for (const [cx, cy] of fc) { const [x, y] = cellC(cx, cy), d = Math.hypot(x - g.x, y - g.y); if (d < bd) { bd = d; best = [x, y]; } }
          if (best) { g.x = best[0]; g.y = best[1]; }
          g.mode = 'idle'; g.tt = 2; g.restFoot = 0;
        }
      } else if (g.tt <= 0) {
        g.tt = 1.5 + Math.random() * 3.5;
        const r = Math.random();
        const rests = items.filter(o => o.id === 'bed' || o.id === 'cushion' || o.id === 'sofa');
        if (r < 0.22 && rests.length) {
          // A descansar: a la cama, al sofá o a su cojín.
          const o = rests[(Math.random() * rests.length) | 0], f = H().furn(o.id);
          const rx = (o.x + f.w / 2) * C * PX, ry = (WALL + (o.y + f.h / 2) * C) * PX + (o.id === 'bed' ? 6 : 0);
          const taken = guests.some(q => q !== g && q.mode === 'sleep' && Math.hypot(q.x - rx, q.y - ry) < 30);
          if (!taken) {
            const below = f.flat ? [rx, ry] : [rx, (WALL + (o.y + f.h) * C) * PX + 14];
            g.goal = below; g.rest = [rx, ry]; g.restFoot = f.flat ? 0 : (WALL + (o.y + f.h) * C) * PX + 1; g.mode = 'bed'; g.tt = 0;
          }
        } else if (r < 0.75) {
          const fc = freeCells(), c = fc[(Math.random() * fc.length) | 0];
          if (c) { g.goal = cellC(c[0] + Math.random() - 0.5, c[1] + Math.random() * 0.4 - 0.2); g.goal[0] = Math.min(RW() * PX - 12, Math.max(12, g.goal[0])); g.mode = 'walk'; g.tt = 0; g.rest = null; }
        } else if (r < 0.88) g.anim.play(G.U.pick(['Attack', 'Charge']));
        else if (Math.hypot(pl.x - g.x, pl.y - g.y) < 140) { g.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - g.y, pl.x - g.x)); g.emote = { sym: '♥', t: 1.6 }; }
      }
      const sleeping = g.mode === 'sleep' && G.Sprites.ready(g.dex, 'Sleep');
      g.anim.loop(sleeping ? 'Sleep' : moving ? 'Walk' : 'Idle');
      g.anim.update(dt);
    }
  }

  // ---------------- dibujo ----------------
  /** Dónde va la habitación: centrada en lo libre (con el panel del editor abierto, a su izquierda). */
  function layout(w, h, dpr) {
    let right = 0, left = 0, top = 64, bottom = 16;
    const panel = $('vil-home'), btns = $('vil-in');
    if (panel && !panel.classList.contains('hidden')) right = panel.offsetWidth + 16;
    // (Sin el panel) los botones de la izquierda («Ir a…», «Decorar», «Salir») no tapan la habitación si cabe al lado.
    else if (btns && !btns.classList.contains('hidden')) { const r = btns.getBoundingClientRect(); if (r.width && w - r.right - 24 > 420) left = r.right + 8; }
    if (innerHeight < 500) top = 56;
    const aw = Math.max(100, w - right - left - 16) * dpr, ah = Math.max(100, h - top - bottom) * dpr;
    const fw = RW() + SIDE * 2, fh = RH() + 14;
    let k = Math.max(1, Math.floor(Math.min(aw / fw, ah / fh)));
    // (Móvil tumbado, con el lienzo a ×1,5) A escala 1 se ve diminuta: si a la siguiente cabe usando casi todo el alto
    // (la barra de arriba sólo tapa un poco la pared por las esquinas), se usa esa.
    if (k < 3 && (k + 1) * fh <= (h - 12) * dpr && (k + 1) * fw <= (w - right - 16) * dpr) { k++; top = Math.max(6, (h - fh * k / dpr) / 2 - 4); }
    const ahk = (h - top - bottom) * dpr;
    const s = k / PX;
    const lw = (w - right - left) * dpr >= fw * k ? left : 0;
    const ox = Math.round(lw * dpr + ((w - right - lw) * dpr - RW() * k) / 2), oy = Math.round(top * dpr + Math.max(4 * k, (ahk - (RH() + 8) * k) / 2));
    lay = { s, ox, oy, k, dpr };
  }
  /** Mundo → px de pantalla (css). */
  const toScreen = (x, y) => ({ x: (lay.ox + x * lay.s) / lay.dpr, y: (lay.oy + y * lay.s) / lay.dpr });
  /** Pantalla (css) → mundo. */
  const toWorld = (sx, sy) => ({ x: (sx * lay.dpr - lay.ox) / lay.s, y: (sy * lay.dpr - lay.oy) / lay.s });

  function art(ctx, key, ax, ay, flip, alpha) {
    const a = ART[key];
    if (!a) return;
    const x = ax * PX, y = ay * PX, w = a[2] * PX, h = a[3] * PX;
    if (alpha != null) ctx.globalAlpha = alpha;
    if (flip) { ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, a[0], a[1], a[2], a[3], 0, 0, w, h); ctx.restore(); }
    else ctx.drawImage(img, a[0], a[1], a[2], a[3], x, y, w, h);
    if (alpha != null) ctx.globalAlpha = 1;
  }
  /** Dónde va el dibujo de un mueble (px de arte, arriba a la izquierda) y su pie (para ordenar). */
  function spot(o) {
    const f = H().furn(o.id), a = ART[o.id];
    if (!f || !a) return null;
    if (f.wall) return { x: o.x * C + (f.w * C - a[2]) / 2, y: o.id === 'garland' ? 6 : 12, foot: -1, f };
    const bx = o.x * C, by = WALL + (o.y + f.h) * C;
    // Lo de pie apoya en el borde de abajo de sus casillas; lo plano, centrado en ellas.
    const y = f.flat ? WALL + o.y * C + (f.h * C - a[3]) / 2 : by - a[3] + (o.id === 'bed' ? 2 : 0);
    return { x: bx + (f.w * C - a[2]) / 2, y, foot: by, f };
  }
  function halo(col) {
    let c = haloCache.get(col);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (g) { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, col + 'aa'); gr.addColorStop(0.45, col + '33'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
    haloCache.set(col, c);
    return c;
  }

  function draw(ctx, w, h, dpr) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(0, 0, w * dpr, h * dpr);
    if (!img || !img.complete || !img.naturalWidth) return;
    ctx.setTransform(lay.s, 0, 0, lay.s, lay.ox, lay.oy);
    const room = H().room(), floor = (preview && preview.floor) || room.floor, wall = (preview && preview.wall) || room.wall;
    const items = room.items;
    // Pared y suelo (a 24 px), con los lados y el zócalo de madera oscura.
    const wx = WALLS[wall] != null ? WALLS[wall] : 0, fx = FLOOR[floor] != null ? FLOOR[floor] : 0;
    for (let i = 0; i < R().W; i++) ctx.drawImage(img, wx, 24, 24, 48, i * C * PX, 0, C * PX, WALL * PX);
    for (let j = 0; j < R().H; j++) for (let i = 0; i < R().W; i++) ctx.drawImage(img, fx, 0, 24, 24, i * C * PX, (WALL + j * C) * PX, C * PX, C * PX);
    // Sombra de la pared sobre el suelo (a escalones, como el arte).
    ctx.fillStyle = 'rgba(8,4,12,.35)'; ctx.fillRect(0, WALL * PX, RW() * PX, 4 * PX);
    ctx.fillStyle = 'rgba(8,4,12,.18)'; ctx.fillRect(0, (WALL + 4) * PX, RW() * PX, 4 * PX);
    // Lo de la pared.
    const wallIt = [], flatIt = [], stand = [];
    items.forEach((o, i) => { const p = spot(o); if (!p) return; (p.f.wall ? wallIt : p.f.flat ? flatIt : stand).push([o, p, i]); });
    for (const [o, p, i] of wallIt) art(ctx, o.id, p.x, p.y, o.f, ghost && ghost.move === i ? 0.35 : null);
    for (const [o, p, i] of flatIt) art(ctx, o.id, p.x, p.y, o.f, ghost && ghost.move === i ? 0.35 : null);
    // El felpudo de la puerta.
    const D = H().DOOR;
    art(ctx, 'mat', D[0] * C + 1, RH() - 8);
    // Lo de pie y los Pokémon, de atrás adelante.
    const list = [];
    for (const [o, p, i] of stand) list.push({ y: p.foot * PX - 1, fn: () => art(ctx, o.id, p.x, p.y, o.f, ghost && ghost.move === i ? 0.35 : null) });
    for (const g of guests) list.push({ y: g.mode === 'sleep' && g.restFoot ? g.restFoot : g.y, fn: () => { G.Sprites.drawShadow(ctx, g.dex, g.x, g.y); g.anim.draw(ctx, g.x, g.y); } });
    list.push({ y: pl.y, fn: () => { G.Sprites.drawShadow(ctx, pl.dex, pl.x, pl.y, pl.anim.scale); pl.anim.draw(ctx, pl.x, pl.y); } });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) e.fn();
    // Marco: los lados y el borde de abajo (con el hueco de la puerta).
    ctx.fillStyle = '#2a1a12';
    ctx.fillRect(-SIDE * PX, -4 * PX, SIDE * PX, (RH() + 8) * PX); ctx.fillRect(RW() * PX, -4 * PX, SIDE * PX, (RH() + 8) * PX);
    ctx.fillRect(-SIDE * PX, -4 * PX, (RW() + SIDE * 2) * PX, 4 * PX);
    ctx.fillRect(-SIDE * PX, RH() * PX, (D[0] * C + SIDE) * PX, 6 * PX);
    ctx.fillRect((D[D.length - 1] + 1) * C * PX, RH() * PX, (RW() - (D[D.length - 1] + 1) * C + SIDE) * PX, 6 * PX);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(-SIDE * PX, RH() * PX, (D[0] * C + SIDE) * PX, 2 * PX);
    ctx.fillRect((D[D.length - 1] + 1) * C * PX, RH() * PX, (RW() - (D[D.length - 1] + 1) * C + SIDE) * PX, 2 * PX);
    // Luces: lo que brilla deja su halo (se suma).
    ctx.globalCompositeOperation = 'lighter';
    for (const o of items) {
      const f = H().furn(o.id), p = spot(o);
      if (!f || !f.glow || !p) continue;
      const a = ART[o.id], cx = (p.x + a[2] / 2) * PX, cy = (p.y + a[3] * (o.id === 'lamp' ? 0.25 : 0.45)) * PX, R0 = (40 + Math.sin(t * 2 + o.x) * 3) * PX;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(halo(f.glow), cx - R0, cy - R0, R0 * 2, R0 * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Editor: la casilla donde va (verde si cabe, rojo si no) y el mueble elegido.
    if (ghost) drawGhost(ctx);
    else if (sel >= 0 && items[sel]) {
      const o = items[sel], f = H().furn(o.id);
      if (f) { const x = o.x * C * PX, y = (f.wall ? 4 : WALL + o.y * C) * PX, ww = f.w * C * PX, hh = (f.wall ? 40 : f.h * C) * PX; outlineBox(ctx, x, y, ww, hh, '#ffcb05'); }
    }
    // Encima, en píxeles de pantalla: bocadillos y emoticonos.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const V = G.Village.paint;
    for (const g of guests) {
      const top = G.Sprites.bodyHeight(g.dex) + 8, s = toScreen(g.x, g.y - top);
      if (g.bubble) V.bubble(ctx, s.x, s.y, g.bubble.text, w);
      else if (g.emote) V.emo(ctx, s.x, s.y, g.emote.sym, g.emote.t);
    }
    if (G.Touch && G.Touch.active && !(G.HomeUI && G.HomeUI.isOpen)) G.Touch.draw(ctx);
  }
  function outlineBox(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    const b = PX * 1;
    ctx.fillRect(x, y, w, b); ctx.fillRect(x, y + h - b, w, b); ctx.fillRect(x, y, b, h); ctx.fillRect(x + w - b, y, b, h);
  }
  function drawGhost(ctx) {
    const f = H().furn(ghost.id);
    if (!f) return;
    const x = ghost.x * C * PX, y = (f.wall ? 4 : WALL + ghost.y * C) * PX, ww = f.w * C * PX, hh = (f.wall ? 40 : f.h * C) * PX;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = ghost.ok ? '#7cff7a' : '#ff5a5a';
    ctx.fillRect(x, y, ww, hh);
    ctx.globalAlpha = 1;
    const p = spot({ id: ghost.id, x: ghost.x, y: ghost.y });
    if (p) art(ctx, ghost.id, p.x, p.y, ghost.f, 0.8);
    outlineBox(ctx, x, y, ww, hh, ghost.ok ? '#7cff7a' : '#ff5a5a');
  }

  // ---------------- el editor (ui/home-ui.js) ----------------
  /** Empieza a colocar un mueble (o a mover el i). */
  function startPlace(id, moveI) {
    const f = H().furn(id);
    if (!f) return;
    const r = H().room();
    let x = Math.max(0, Math.min(R().W - f.w, 5)), y = f.wall ? -1 : Math.max(0, Math.min(R().H - (f.h || 1), 3));
    if (moveI != null && r.items[moveI]) { x = r.items[moveI].x; y = r.items[moveI].y; }
    ghost = { id, x, y, f: moveI != null && r.items[moveI] ? r.items[moveI].f : 0, move: moveI != null ? moveI : null, ok: false };
    // La primera casilla libre cerca del centro.
    if (moveI == null && !H().fits(r.items, id, x, y)) {
      let best = null, bd = 1e9;
      for (let yy = f.wall ? -1 : 0; yy <= (f.wall ? -1 : R().H - f.h); yy++) for (let xx = 0; xx <= R().W - f.w; xx++) {
        if (!H().fits(r.items, id, xx, yy)) continue;
        const d = Math.abs(xx - 5) + Math.abs(yy - 3);
        if (d < bd) { bd = d; best = [xx, yy]; }
      }
      if (best) { ghost.x = best[0]; ghost.y = best[1]; }
    }
    sel = -1;
    checkGhost();
  }
  function checkGhost() {
    if (!ghost) return;
    ghost.ok = H().fits(H().room().items, ghost.id, ghost.x, ghost.y, ghost.move == null ? -1 : ghost.move);
  }
  function moveGhost(cx, cy) {
    if (!ghost) return;
    const f = H().furn(ghost.id);
    ghost.x = Math.max(0, Math.min(R().W - f.w, cx));
    ghost.y = f.wall ? -1 : Math.max(0, Math.min(R().H - f.h, cy));
    const was = ghost.ok;
    checkGhost();
    if (was !== ghost.ok && G.HomeUI) G.HomeUI.ghostMoved();
  }
  function flipGhost() { if (ghost) ghost.f = ghost.f ? 0 : 1; }
  /** Deja el mueble donde está el fantasma. → { ok, error? } */
  function commitPlace() {
    if (!ghost) return { ok: false };
    const g = ghost;
    let r;
    if (g.move != null) r = H().move(g.move, g.x, g.y) ? { ok: true } : { ok: false, error: 'Ahí no cabe.' };
    else r = H().place(g.id, g.x, g.y, g.f);
    if (r.ok) { ghost = null; G.Audio.sfx('click'); unstick(); }
    return r;
  }
  function cancelPlace() { ghost = null; }
  /** Si un mueble nuevo te ha caído encima, sales a la casilla libre más cercana. */
  function unstick() {
    for (const e of [pl, ...guests]) {
      if (!e || !blocked(e.x, e.y, e.r)) continue;
      let best = null, bd = 1e9;
      for (const [cx, cy] of freeCells()) { const [x, y] = cellC(cx, cy), d = Math.hypot(x - e.x, y - e.y); if (d < bd && !blocked(x, y, e.r)) { bd = d; best = [x, y]; } }
      if (best) { e.x = best[0]; e.y = best[1]; }
      if (e.mode === 'sleep' || e.mode === 'bed') { e.mode = 'idle'; e.tt = 1; }
    }
  }
  /** Qué mueble hay bajo un punto de la pantalla (css) → índice o -1 (los de pie primero, luego lo plano y la pared). */
  function pickItem(sx, sy) {
    const w = toWorld(sx, sy), ax = w.x / PX, ay = w.y / PX, items = H().room().items;
    const order = items.map((o, i) => [o, i, spot(o)]).filter(e => e[2]).sort((a, b) => (b[2].f.flat || b[2].f.wall ? -1 : b[2].foot) - (a[2].f.flat || a[2].f.wall ? -1 : a[2].foot));
    for (const [o, i, p] of order) { const a = ART[o.id]; if (ax >= p.x && ax < p.x + a[2] && ay >= p.y && ay < p.y + a[3]) return i; }
    return -1;
  }
  /** Teclas del editor: flechas o WASD mueven el fantasma; E o Intro lo dejan; Esc lo cancela. */
  function editKeys() {
    if (!ghost) return;
    const I = G.Input;
    let dx = 0, dy = 0;
    if (I.tap('arrowleft') || I.tap('keya')) dx = -1; if (I.tap('arrowright') || I.tap('keyd')) dx = 1;
    if (I.tap('arrowup') || I.tap('keyw')) dy = -1; if (I.tap('arrowdown') || I.tap('keys')) dy = 1;
    if (dx || dy) moveGhost(ghost.x + dx, ghost.y + dy);
    if (I.tap('enter') || I.tap('keye') || I.tap('space')) { const r = commitPlace(); if (G.HomeUI) G.HomeUI.placed(r); }
  }

  // ---------------- tocar o hacer clic ----------------
  /** village.js pointer, mientras estás dentro. → true si lo ha usado. */
  function pointer(e, walk) {
    if (!on || !pl) return false;
    const editing = !!(G.HomeUI && G.HomeUI.isOpen);
    if (editing) {
      if (ghost) {
        const w = toWorld(e.clientX, e.clientY), [cx, cy] = cellAt(w.x, w.y), f = H().furn(ghost.id);
        const nx = cx - Math.floor((f.w - 1) / 2), ny = f.wall ? -1 : cy - Math.floor(((f.h || 1) - 1) / 2);
        // Un toque donde ya está (o el clic del ratón): se deja; si no, se mueve allí.
        if (nx === ghost.x && ny === ghost.y) { const r = commitPlace(); if (G.HomeUI) G.HomeUI.placed(r); }
        else moveGhost(nx, ny);
        if (e.pointerType === 'mouse' && ghost && ghost.ok) { const r = commitPlace(); if (G.HomeUI) G.HomeUI.placed(r); }
        return true;
      }
      sel = pickItem(e.clientX, e.clientY);
      if (G.HomeUI) G.HomeUI.selected(sel);
      return true;
    }
    if (!walk) return false;
    if (e.pointerType !== 'mouse' && G.Touch && G.Touch.stick && G.Touch.stick.id === e.pointerId) return true;
    const w = toWorld(e.clientX, e.clientY);
    const g = guests.find(q => Math.abs(q.x - w.x) < 22 && w.y < q.y + 6 && w.y > q.y - G.Sprites.bodyHeight(q.dex) - 6);
    if (g) { target = { x: g.x + (pl.x < g.x ? -28 : 28), y: g.y + 4, then: () => { near = { guest: g }; act(); } }; return true; }
    target = { x: w.x, y: w.y };
    return true;
  }
  /** Con el ratón encima mientras se coloca: el fantasma sigue al ratón. */
  function hover(sx, sy) {
    if (!ghost) return;
    const w = toWorld(sx, sy), [cx, cy] = cellAt(w.x, w.y), f = H().furn(ghost.id);
    moveGhost(cx - Math.floor((f.w - 1) / 2), f.wall ? -1 : cy - Math.floor(((f.h || 1) - 1) / 2));
  }

  return { enter, leave, frame, pointer, hover, act, flipGhost, startPlace, commitPlace, cancelPlace, unstick, pickItem, ART,
    get on() { return on; }, get placing() { return ghost ? Object.assign({}, ghost) : null; },
    get selected() { return sel; }, set selected(v) { sel = v; },
    set preview(v) { preview = v || null; }, syncGuests: () => syncGuests(true),
    get image() { return load(); },
    /** Para pruebas: tu Pokémon e invitados, y llevarte a un sitio. */
    debug: { get player() { return pl; }, get guests() { return guests; }, at: (cx, cy) => { if (pl) [pl.x, pl.y] = cellC(cx, cy); }, blocked, cellC, layout: () => lay } };
})();
