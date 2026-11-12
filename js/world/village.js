/* ============ village.js — la aldea del menú: andar, hablar con los Pokémon y entrar en las carpas ============
 * Pedido del dueño (11-11-2026): al entrar al juego se ve a tu Pokémon y lo mueves por una aldea con los controles de la
 * partida (teclado, joystick táctil y mando). Cada carpa abre un apartado del menú de siempre (las mismas pantallas, con
 * los mismos botones: se pulsa el del menú clásico, que sigue en la página, oculto). Para jugar, el Árbol del Portal.
 * Pokémon que pasean, hablan, reaccionan y a veces te siguen un rato; ciclo de día corto (~10 min); un desplegable
 * («Ir a…») abre cualquier apartado sin andar.
 *
 * Cómo encaja:
 *   - Es la pantalla del menú (#scr-menu con la clase .village): menu.js la abre como siempre y aquí se decide si va la
 *     aldea o el menú clásico. El clásico sale sólo si falla el 3D (sin WebGL, three.js no carga, sin el tileset o se
 *     pierde el contexto): decisión del dueño. Con ?clasico en la dirección, también (para probar).
 *   - Dibuja en el lienzo del juego en lugar del fondo del menú (game.js frame: si esto devuelve true, no va Backdrop).
 *     El 3D lo hace village3d.js en un lienzo pequeño que aquí se pasa a la pantalla, y encima los nombres, los bocadillos
 *     y el joystick.
 *   - Sigue siendo «fuera de partida» (G.Game.state 'ui'): el actualizador avisa y recarga igual.
 *   - Al empezar una partida se suelta todo lo de la GPU (sleep) y al volver se rehace.
 * (12-11-2026, pedido del dueño) «Que siempre cargue directamente la aldea»: la pantalla del título no cambia hasta que la
 * aldea está lista (prepare, desde Flow.boot: three.js, el tileset, la escena y los sprites). Mientras se rehace (al
 * volver de una partida) se ve un velo como el del título, nunca el menú clásico ni una aldea a medio montar: el clásico
 * sólo sale si falla el 3D. Tu choza se personaliza con monedas (data/home.js, ui/home-ui.js) y se ve aquí.
 */
G.Village = (() => {
  const $ = id => document.getElementById(id);
  const V = () => G.VILLAGE;
  const TS = 48, SPEED = 200, CYCLE = 600;
  let three = 'idle', threeErr = '', T = null;
  let active = false, failed = '', forceClassic = false, glOk = null;
  let pl = null, npcs = [], followers = [], trail = [];
  let view = { cx: 0, cy: 0, w: 960, h: 525, scale: 1, K: 0.18 };
  let t = 0, quick = false, walkPrev = false, saveT = 0, hover = null, near = null, renderAcc = 0, lastShot = null;
  let target = null;                     // andar hasta un sitio (toque o clic): { x, y, then }
  let solids = [];                       // { x0, y0, x1, y1 } o { x, y, r } (mundo)
  let tileWait = 0, lastPartner = '';
  let pet = null, holo = null, homeKey = '', homeOpen = false, homePreview = null, prepP = null;

  // ---------------- ¿aldea o menú clásico? ----------------
  function webgl() {
    if (glOk === null) glOk = !!(G.Village3D && G.Village3D.probe());
    return glOk;
  }
  /** ¿Se intenta la aldea? (si no, el menú clásico) */
  function wanted() {
    if (forceClassic || failed || typeof document === 'undefined' || !$('scr-menu')) return false;
    if (location.protocol === 'file:') return false;
    if (!G.Tileset || !G.Tileset.enabled() || !G.VILLAGE) return false;
    return webgl();
  }

  function loadThree() {
    if (three !== 'idle') return;
    three = 'loading';
    if (window.PS_THREE) { T = window.PS_THREE; three = 'ready'; return; }
    const done = () => { if (three !== 'loading' || !window.PS_THREE) return; T = window.PS_THREE; three = 'ready'; clearInterval(iv); clearTimeout(t0); if (G.UI.isOpen('scr-menu')) show(); };
    const t0 = setTimeout(() => { if (three === 'loading') { three = 'fail'; threeErr = 'three.js no carga'; clearInterval(iv); if (G.UI.isOpen('scr-menu')) show(); } }, 20000);
    // (Ultra 3D usa el mismo módulo: si ya lo ha pedido, el aviso llega una sola vez; por eso también se mira cada poco.)
    addEventListener('ps-three', done, { once: true });
    const iv = setInterval(done, 150);
    if (!document.querySelector('script[src="js/vendor/three/three-boot.js"]')) {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'js/vendor/three/three-boot.js';
      s.onerror = () => { three = 'fail'; threeErr = 'three.js no carga'; clearInterval(iv); clearTimeout(t0); if (G.UI.isOpen('scr-menu')) show(); };
      document.head.appendChild(s);
    }
  }

  /** La llama menu.js al abrir el menú (y aquí, cuando acaba de cargar algo). */
  function show() {
    const scr = $('scr-menu');
    if (!scr) return;
    if (!wanted()) { classic(false); return; }
    loadThree();
    if (three === 'fail') { fail(threeErr || 'three.js'); return; }
    if (three !== 'ready') { waiting(); return; }
    const BI = V().BI;
    if (!G.Tileset.ready(BI)) {
      G.Tileset.preload([BI]);
      waiting();
      if (!tileWait) {
        const t1 = performance.now();
        tileWait = setInterval(() => {
          if (G.Tileset.ready(BI) || performance.now() - t1 > 15000) {
            clearInterval(tileWait); tileWait = 0;
            if (!G.Tileset.ready(BI)) fail('sin tileset'); else if (G.UI.isOpen('scr-menu')) show();
          }
        }, 150);
      }
      return;
    }
    try {
      if (!G.Village3D.started) G.Village3D.start(T);
      if (!G.Village3D.ready) {
        const err = G.Village3D.build();
        if (err) { fail(err); return; }
        spawnAll();
      }
    } catch (e) { fail(String(e && e.message || e)); return; }
    enter();
  }

  function fail(why) {
    failed = why || 'error';
    console.warn('[Aldea] menú clásico:', failed);
    try { G.Village3D.free(); } catch (e) { /* nada */ }
    classic(false);
  }

  /** Menú clásico (sólo si falla el 3D). */
  function classic() {
    active = false;
    const scr = $('scr-menu');
    if (!scr) return;
    scr.classList.remove('village');
    setQuick(false);
    veil(false);
    if (G.MenuUI && G.MenuUI.fitTiles) requestAnimationFrame(() => G.MenuUI.fitTiles());
  }
  /** Mientras se prepara la aldea: el velo del título (nada del menú clásico por debajo). */
  function waiting() {
    active = false;
    const scr = $('scr-menu');
    if (!scr) return;
    scr.classList.add('village');
    setQuick(false);
    veil(true);
  }
  function veil(on) { const v = $('vil-loading'); if (v) v.classList.toggle('hidden', !on); }

  function enter() {
    const scr = $('scr-menu');
    const was = active;
    active = true;
    scr.classList.add('village');
    veil(false);
    // Tu Pokémon (si lo has cambiado en la Pokédex, el nuevo).
    const s = G.DB.save, dex = s && G.DEX_BY[s.partner] ? s.partner : 25, shiny = !!(s && s.partnerShiny && G.DB.ownsShiny(dex));
    if (dex + '/' + shiny !== lastPartner) {
      lastPartner = dex + '/' + shiny;
      const old = pl;
      pl = mon(dex, shiny, G.Sprites.playerScale(dex));
      pl.r = Math.min(16, G.Sprites.playerRadius(dex));
      if (old) { pl.x = old.x; pl.y = old.y; pl.anim.dir = old.anim.dir; G.Village3D.unsprite(old); }
      else { const p = savedPos(); pl.x = p[0]; pl.y = p[1]; pl.anim.dir = 0; }
      G.Sprites.warm(dex, shiny);
      snapCam();
    }
    if (!was) { snapCam(); renderAcc = 1; walkPrev = false; target = null; buildQuick(); }
    syncHome();
    refreshQuick();
  }

  // ---------------- tu choza (data/home.js) ----------------
  /** Pone la choza como la tienes (o como la estás probando en la tienda de la choza), su mascota y su holograma. */
  function syncHome() {
    if (!G.Home || !G.Village3D.ready) return;
    const cfg = Object.assign({}, G.Home.current(), homePreview || {});
    const s = G.DB.save, pd = s && G.DEX_BY[s.partner] ? s.partner : 25;
    const key = JSON.stringify(cfg) + pd;
    if (key === homeKey) return;
    homeKey = key;
    const info = G.Village3D.setHome(cfg) || {};
    const H0 = V().PLACES.find(p => p.id === 'home');
    // Lo que no se puede pisar: el tótem y el proyector del holograma.
    solids = solids.filter(o => !o.home);
    if (cfg.totem && cfg.totem !== 'none') solids.push({ x: tile(H0.x) - 82, y: tile(H0.y) + 44, r: 18, home: true });
    if (info.holo) solids.push({ x: info.holo[0], y: info.holo[1], r: 14, home: true });
    // Mascota: uno de tus Pokémon, quieto en su cojín.
    if (pet && pet.anim.dex !== cfg.pet) { G.Village3D.unsprite(pet); npcs = npcs.filter(n => n !== pet); pet = null; }
    if (cfg.pet && !pet) {
      pet = mon(cfg.pet, false);
      const still = G.Sprites.can(cfg.pet, 'Sleep') ? 'Sleep' : 'Idle';
      Object.assign(pet, { home: [tile(V().PET[0]), tile(V().PET[1])], wander: 0, mode: 'still', tt: 1, li: 0, isPet: true,
        lines: ['(Descansa feliz en su cojín.)', '(Se alegra de verte en casa.)', '(Vigila tu choza mientras estás fuera.)'],
        cast: { still, emote: '♥' } });
      pet.x = pet.home[0]; pet.y = pet.home[1]; pet.anim.dir = 0;
      if (still === 'Sleep') G.Sprites.sheet(cfg.pet, 'Sleep');
      npcs.push(pet);
    }
    // Holograma: tu Pokémon, de luz, girando sobre el proyector.
    if (holo && (!info.holo || holo.anim.dex !== pd)) { G.Village3D.unsprite(holo); holo = null; }
    if (info.holo && !holo) { holo = mon(pd, false); holo.holo = true; holo.x = info.holo[0]; holo.y = info.holo[1]; }
  }
  /** La tienda de la choza (ui/home-ui.js): abierta o cerrada (la cámara va a tu choza) y la pieza que se prueba. */
  function homePanel(on) {
    homeOpen = !!on && active;
    if (!homeOpen) homePreview = null;
    if (homeOpen) { target = null; setQuick(false); }
    syncHome();
  }
  function previewHome(cfg) { homePreview = cfg || null; syncHome(); }

  /*
   * Carga directa (pedido del dueño): Flow.boot espera a esto antes de quitar la pantalla del título.
   * → promesa: true si la aldea queda lista; false si no se usa (falla el 3D: menú clásico) o si tarda más de maxMs
   * (entonces se sigue cargando y, hasta que esté, se ve el velo del título).
   */
  function prepare(maxMs = 20000) {
    if (prepP) return prepP;
    prepP = new Promise(res => {
      if (!wanted()) { res(false); return; }
      const t0 = performance.now();
      let iv = 0;
      const end = v => { clearInterval(iv); res(v); };
      loadThree();
      G.Tileset.preload([V().BI]);
      const step = () => {
        const late = performance.now() - t0 > maxMs;
        if (three === 'fail') { fail(threeErr || 'three.js'); end(false); return; }
        if (failed) { end(false); return; }
        if (three !== 'ready' || !G.Tileset.ready(V().BI)) { if (late) end(false); return; }
        if (!G.Village3D.ready) {
          try {
            if (!G.Village3D.started) G.Village3D.start(T);
            const err = G.Village3D.build();
            if (err) { fail(err); end(false); return; }
            spawnAll();
            // Un dibujo de prueba (sin enseñarlo): sube las texturas y prepara los shaders mientras sigue el título.
            const VG = V();
            G.Village3D.render({ cx: VG.W * TS / 2, cy: VG.H * TS / 2, w: 960, h: 540, scale: 1, K: 0.18 }, 0, 0, light(phase()));
          } catch (e) { fail(String(e && e.message || e)); end(false); return; }
        }
        if (spritesReady() || late) end(true);
      };
      iv = setInterval(step, 100);
      step();
    });
    return prepP;
  }
  /** ¿Están cargados los sprites de tu Pokémon y de los de la aldea? (si no, empiezan a cargarse) */
  function spritesReady() {
    const s = G.DB && G.DB.save, dex = s && G.DEX_BY[s.partner] ? s.partner : 25, shiny = !!(s && s.partnerShiny && G.DB.ownsShiny(dex));
    let ok = G.Sprites.ready(dex, 'Idle', shiny) && G.Sprites.ready(dex, 'Walk', shiny);
    for (const n of npcs) if (!G.Sprites.ready(n.anim.dex, 'Idle')) ok = false;
    return ok;
  }

  // ---------------- entidades ----------------
  function mon(dex, shiny, scale = 1) {
    const anim = new G.Sprites.Animator(dex, scale, shiny);
    return { anim, x: 0, y: 0, z: 0, r: Math.min(14, G.Sprites.bodyRadius(dex, scale)), vx: 0, vy: 0 };
  }
  const tile = v => v * TS;

  function spawnAll() {
    for (const n of npcs) G.Village3D.unsprite(n);
    npcs = []; followers = []; trail = [];
    if (holo) G.Village3D.unsprite(holo);
    pet = null; holo = null; homeKey = '';
    if (pl) { G.Village3D.unsprite(pl); }
    lastPartner = '';
    pl = null;
    solids = [];
    for (const p of V().PLACES) solids.push({ x0: tile(p.x - p.w / 2), y0: tile(p.y - p.h / 2), x1: tile(p.x + p.w / 2), y1: tile(p.y + p.h / 2) });
    for (const d of V().DECOR) if (d.r) solids.push({ x: tile(d.x), y: tile(d.y), r: tile(d.r) });
    const low = G.Settings.fx === 0;
    // Tenderos: uno en cada sitio que lo tenga, quietos junto a la puerta (mirando al sur).
    for (const p of V().PLACES) {
      if (!p.npc) continue;
      const n = mon(p.npc.dex, false);
      Object.assign(n, { home: [tile(p.npc.at[0]), tile(p.npc.at[1])], wander: p.npc.counter ? 0 : 14, lines: p.npc.lines, place: p, keeper: true, li: 0, mode: 'idle', tt: rnd(1, 3) });
      n.x = n.home[0]; n.y = n.home[1];
      npcs.push(n);
    }
    for (const c of V().CAST) {
      if (low && !c.lowq) continue;
      const n = mon(c.dex, false);
      Object.assign(n, { home: [tile(c.at[0]), tile(c.at[1])], wander: c.still ? 0 : tile(c.r || 2), lines: c.lines, cast: c, li: 0, mode: c.still ? 'still' : 'idle', tt: rnd(0.5, 3), fly: !!c.fly, water: !!c.water });
      n.x = n.home[0]; n.y = n.home[1];
      if (c.dir != null) n.anim.dir = c.dir;
      if (c.still === 'Sleep') G.Sprites.sheet(c.dex, 'Sleep');
      npcs.push(n);
    }
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------------- choques ----------------
  function blocked(x, y, r, who) {
    const VG = V();
    const tx0 = Math.floor((x - r) / TS), tx1 = Math.floor((x + r) / TS), ty0 = Math.floor((y - r) / TS), ty1 = Math.floor((y + r) / TS);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const tr = VG.terrainAt(tx, ty);
      if (!tr || (tr === 2 && who && (who.fly || who.water))) continue;
      // círculo contra casilla
      const cx = Math.max(tx * TS, Math.min(x, tx * TS + TS)), cy = Math.max(ty * TS, Math.min(y, ty * TS + TS));
      if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return true;
    }
    if (who && who.water) return false;
    for (const s of solids) {
      if (s.r) { if ((s.x - x) ** 2 + (s.y - y) ** 2 < (s.r + r) ** 2) return true; continue; }
      const cx = Math.max(s.x0, Math.min(x, s.x1)), cy = Math.max(s.y0, Math.min(y, s.y1));
      if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return true;
    }
    return false;
  }
  /** Mueve con choques (resbala por las paredes). → lo que se ha movido. */
  function move(e, dx, dy) {
    const x0 = e.x, y0 = e.y;
    if (!blocked(e.x + dx, e.y + dy, e.r, e)) { e.x += dx; e.y += dy; }
    else if (!blocked(e.x + dx, e.y, e.r, e)) e.x += dx;
    else if (!blocked(e.x, e.y + dy, e.r, e)) e.y += dy;
    return Math.hypot(e.x - x0, e.y - y0);
  }

  // ---------------- cámara ----------------
  function camSize() {
    const C = G.Camera;
    view.scale = C.scale || 1;
    view.w = C.w || innerWidth / view.scale;
    view.h = C.h || innerHeight / view.scale;
    view.K = C.ULTRA || 0.18;
  }
  function camTarget() {
    const VG = V(), W = VG.W * TS, Hh = VG.H * TS;
    // Que no se salga del plano (con lo que se ve de más por arriba con la perspectiva).
    const hw = view.w / 2, hh = view.h / 2;
    // Con la tienda de la choza abierta, la cámara mira tu choza (a la izquierda: el panel va a la derecha).
    let fx0 = pl.x, fy0 = pl.y;
    if (homeOpen) { const h = V().PLACES.find(p => p.id === 'home'); fx0 = tile(h.x) + Math.min(view.w * 0.22, 300); fy0 = tile(h.y) + 40; }
    // Cerca de la Flor del Portal la cámara sube un poco: se ve la flor entera (tu Pokémon queda más abajo).
    const tree = V().PLACES[0], kx = Math.max(0, 1 - Math.abs(fx0 - tile(tree.x)) / tile(7)), ky = Math.max(0, 1 - Math.abs(fy0 - tile(tree.door[1] + 1)) / tile(5));
    const up = 120 * Math.min(1, kx * 1.4) * Math.min(1, ky * 1.4);
    const x = Math.max(hw, Math.min(W - hw, fx0)), y = Math.max(hh * 1.02, Math.min(Hh - hh * 0.9, fy0 - 20 - up));
    return [W < view.w ? W / 2 : x, Hh < view.h ? Hh / 2 : y];
  }
  function snapCam() { if (!pl) return; camSize(); const [x, y] = camTarget(); view.cx = x; view.cy = y; }

  function savedPos() {
    try {
      const p = JSON.parse(sessionStorage.getItem('ps.vil.pos') || 'null');
      if (Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) && !blocked(p[0], p[1], 14)) return p;
    } catch (e) { /* nada */ }
    return [tile(V().SPAWN[0]), tile(V().SPAWN[1])];
  }

  // ---------------- ciclo del día ----------------
  // (12-11-2026) Bosque bioluminiscente: casi siempre de noche (luz de luna azul y violeta). Un rato del ciclo amanece
  // con bruma verde (algo más de luz y más niebla) y vuelve la noche; lo que brilla, brilla siempre (más de noche).
  // [fase, luz ambiente rgb, su fuerza, luna rgb, su fuerza, altura, noche 0..1, bruma 0..1, niebla]
  const KEYS = [
    [0.00, [0.42, 0.48, 0.86], 0.62, [0.6, 0.7, 1], 0.26, 0.85, 1, 0, 1],
    [0.40, [0.42, 0.48, 0.86], 0.62, [0.6, 0.7, 1], 0.26, 0.85, 1, 0, 1],
    [0.52, [0.5, 0.66, 0.8], 0.66, [0.7, 0.95, 0.9], 0.3, 0.6, 0.65, 1, 1.5],
    [0.66, [0.56, 0.74, 0.78], 0.7, [0.85, 1, 0.9], 0.34, 0.7, 0.5, 0.6, 1.3],
    [0.78, [0.5, 0.5, 0.86], 0.64, [0.66, 0.66, 1], 0.28, 0.8, 0.85, 0.2, 1],
    [1.00, [0.42, 0.48, 0.86], 0.62, [0.6, 0.7, 1], 0.26, 0.85, 1, 0, 1]
  ];
  let phaseOverride = null;
  function phase() {
    if (phaseOverride != null) return phaseOverride;
    let t0 = 0;
    try { t0 = +localStorage.getItem('ps.vil.t0') || 0; } catch (e) { /* nada */ }
    const now = Date.now();
    if (!t0) { t0 = now - 0.12 * CYCLE * 1000; try { localStorage.setItem('ps.vil.t0', String(t0)); } catch (e) { /* nada */ } }
    return (((now - t0) / 1000) % CYCLE) / CYCLE;
  }
  function light(ph) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= ph) i++;
    const a = KEYS[i], b = KEYS[i + 1], k = Math.max(0, Math.min(1, (ph - a[0]) / Math.max(1e-6, b[0] - a[0])));
    const L = (u, v) => u + (v - u) * k, L3 = (u, v) => u.map((x, j) => L(x, v[j]));
    // La luna va despacio de un lado a otro (las sombras se rehacen sólo cuando cambia: ver village3d.js setLight).
    return { amb: L3(a[1], b[1]), ai: L(a[2], b[2]), sun: L3(a[3], b[3]), si: L(a[4], b[4]), el: L(a[5], b[5]), night: L(a[6], b[6]), dusk: L(a[7], b[7]),
      mist: L(a[8], b[8]), az: -1.1 - Math.round(ph * 12) / 12 * 1.2 };
  }

  // ---------------- cada fotograma ----------------
  const BIG = ['scr-dex', 'scr-upgrades', 'scr-shop', 'scr-bag', 'scr-gacha', 'scr-compendium', 'scr-goals', 'scr-rank', 'scr-friends', 'scr-lobby'];
  /** ¿Hay otra pantalla por encima de la aldea? → 0 no, 1 una ventana, 2 una grande (casi tapa la aldea). */
  function covered() {
    const other = document.querySelector('.scr:not(.hidden):not(#scr-menu)');
    if (!other) return document.querySelector('.ask-scr') ? 1 : 0;
    return BIG.some(id => G.UI.isOpen(id)) ? 2 : 1;
  }
  /** ¿Se está paseando? (la aldea a la vista, sin nada encima ni el desplegable abierto) */
  function walking() {
    if (!active || quick || homeOpen || !G.Game || G.Game.state !== 'ui' || !G.UI.isOpen('scr-menu')) return false;
    const tap = $('tap-start'), boot = $('boot');
    if ((tap && !tap.classList.contains('hidden')) || (boot && !boot.classList.contains('hidden'))) return false;
    return !covered();
  }

  /** game.js: el fondo del menú. → true si lo ha dibujado la aldea (y entonces no va Backdrop). */
  function frame(ctx, w, h, dpr, real) {
    if (!active || !G.UI.isOpen('scr-menu') || !pl) return false;
    if (G.Village3D.lost) { fail('contexto WebGL perdido'); return false; }
    const dt = Math.min(1 / 20, Math.max(0, real || 0));
    const cov = covered(), walk = walking();
    if (cov === 2) { walkPrev = false; return true; }          // tapada: se queda quieta (como el fondo del menú)
    t += dt;
    camSize();
    if (walk) update(dt, walkPrev); else idle(dt);
    walkPrev = walk;
    // Con una ventana encima, a 20 FPS (casi no se ve y calienta menos).
    renderAcc += dt;
    if (cov && renderAcc < 1 / 20 && lastShot) return true;
    renderAcc = 0;
    draw(ctx, w, h, dpr, dt);
    return true;
  }

  function update(dt, keysOk) {
    // --- tu Pokémon ---
    const ax = G.Input.axis();
    let mx = ax[0], my = ax[1];
    if (mx || my) target = null;
    else if (target) {
      const dx = target.x - pl.x, dy = target.y - pl.y, d = Math.hypot(dx, dy);
      if (d < 8) { const then = target.then; target = null; if (then) then(); }
      else { mx = dx / d; my = dy / d; }
    }
    const sp = SPEED * Math.min(1, Math.hypot(mx, my));
    let moved = 0;
    if (sp > 1) {
      moved = move(pl, mx / Math.hypot(mx, my) * sp * dt, my / Math.hypot(mx, my) * sp * dt);
      pl.anim.dir = G.Sprites.dirFromAngle(Math.atan2(my, mx));
      if (target && moved < sp * dt * 0.2) { target.stuck = (target.stuck || 0) + dt; if (target.stuck > 0.45) { const then = target.then; target = null; if (then && near && near.goal === then.goal) then(); } }
      const last = trail[0];
      if (!last || Math.hypot(last[0] - pl.x, last[1] - pl.y) > 10) { trail.unshift([pl.x, pl.y]); if (trail.length > 60) trail.pop(); }
    }
    pl.anim.loop(moved > 0.2 ? 'Walk' : 'Idle');
    pl.anim.update(dt);
    // --- cámara ---
    const [tx, ty] = camTarget();
    view.cx = G.U.damp(view.cx, tx, 8, dt); view.cy = G.U.damp(view.cy, ty, 8, dt);
    npcTick(dt);
    // --- qué hay cerca: una puerta o un Pokémon ---
    near = nearest();
    prompt();
    // --- teclas (no en el fotograma en que se vuelve a la aldea: el Esc de cerrar una pantalla no abre el desplegable) ---
    if (keysOk) {
      if (G.Input.tap('escape') || G.Input.tap('keym')) { setQuick(true); return; }
      if (G.Input.tap('keye') || G.Input.tap('enter') || G.Input.tap('space') || G.Input.act('open')) act();
    }
    saveT += dt;
    if (saveT > 1) { saveT = 0; try { sessionStorage.setItem('ps.vil.pos', JSON.stringify([Math.round(pl.x), Math.round(pl.y)])); } catch (e) { /* nada */ } }
  }
  /** Con algo encima: los demás siguen a lo suyo; tu Pokémon, quieto. */
  function idle(dt) {
    pl.anim.loop('Idle'); pl.anim.update(dt);
    if (homeOpen) { const [tx, ty] = camTarget(); view.cx = G.U.damp(view.cx, tx, 5, dt); view.cy = G.U.damp(view.cy, ty, 5, dt); }
    npcTick(dt);
    if (near) { near = null; prompt(); }
  }

  // ---------------- los Pokémon de la aldea ----------------
  function npcTick(dt) {
    for (const n of npcs) {
      n.tt -= dt;
      if (n.bubble && (n.bubble.t -= dt) <= 0) n.bubble = null;
      if (n.emote && (n.emote.t -= dt) <= 0) n.emote = null;
      const dP = Math.hypot(pl.x - n.x, pl.y - n.y);
      let moving = false;
      if (n.mode === 'still') {
        const c = n.cast;
        n.anim.loop(c.still === 'Sleep' && G.Sprites.ready(n.anim.dex, 'Sleep') ? 'Sleep' : 'Idle');
        // Magikarp salta de vez en cuando; Snorlax, dormido.
        if (n.water && n.tt <= 0) { n.tt = rnd(2.5, 6); n.anim.play('Hop'); }
      } else if (n.mode === 'follow') {
        const i = followers.indexOf(n), p = trail[Math.min(trail.length - 1, 4 + i * 5)] || [pl.x, pl.y];
        const dx = p[0] - n.x, dy = p[1] - n.y, d = Math.hypot(dx, dy);
        if (d > 14 && dP > 40) {
          const sp = Math.min(SPEED * 1.05, d * 4);
          moving = move(n, dx / d * sp * dt, dy / d * sp * dt) > 0.2;
          if (moving) n.anim.dir = G.Sprites.dirFromAngle(Math.atan2(dy, dx));
          // Si se queda atrás o atascado, aparece a tu lado.
          if (d > 360) { n.x = p[0]; n.y = p[1]; }
        } else if (dP < 60) n.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - n.y, pl.x - n.x));
        if (n.tt <= 0) { n.mode = 'home'; followers = followers.filter(f => f !== n); say(n, G.U.pick(V().BYE), 2.4); }
      } else if (n.mode === 'home' || n.mode === 'walk') {
        const [hx, hy] = n.mode === 'home' ? n.home : n.goal;
        const dx = hx - n.x, dy = hy - n.y, d = Math.hypot(dx, dy);
        if (d < 6 || n.tt < -6) { n.mode = 'idle'; n.tt = rnd(1.4, 4); }
        else {
          const sp = n.keeper ? 40 : n.mode === 'home' ? 110 : 55;
          const m = move(n, dx / d * sp * dt, dy / d * sp * dt);
          moving = m > 0.15;
          if (moving) n.anim.dir = G.Sprites.dirFromAngle(Math.atan2(dy, dx));
          else if (n.mode === 'walk') { n.mode = 'idle'; n.tt = rnd(0.8, 2); }
          else if (n.mode === 'home' && n.tt < -3) { n.x = n.home[0]; n.y = n.home[1]; }
        }
      } else if (n.mode === 'idle') {
        // Te mira si pasas cerca (y a veces se sorprende).
        if (dP < 96) {
          n.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - n.y, pl.x - n.x));
          if (!n.seen && n.cast && Math.random() < 0.35) { n.seen = true; emote(n, n.cast.emote || '!'); }
        } else { n.seen = false; if (n.keeper && n.tt <= 0) n.anim.dir = 0; }
        if (n.tt <= 0) {
          n.tt = rnd(1.5, 4.5);
          if (n.wander > 0 && dP > 70 && Math.random() < 0.7) {
            for (let k = 0; k < 6; k++) {
              const a = Math.random() * 6.2832, r = Math.random() * n.wander;
              const gx = n.home[0] + Math.cos(a) * r, gy = n.home[1] + Math.sin(a) * r;
              if (!blocked(gx, gy, n.r, n)) { n.goal = [gx, gy]; n.mode = 'walk'; n.tt = 0; break; }
            }
          } else if (Math.random() < 0.25) n.anim.play(G.U.pick(['Attack', 'Charge']));
        }
      }
      // Que no se te meta encima: se aparta.
      if (dP < pl.r + n.r && dP > 0.1 && n.mode !== 'still' && !n.place) move(n, (n.x - pl.x) / dP * 2, (n.y - pl.y) / dP * 2);
      n.anim.loop(n.mode === 'still' ? n.anim.base : moving ? 'Walk' : 'Idle');
      n.anim.update(dt);
    }
  }

  function say(n, text, secs = 3.6) { n.bubble = { text: G.T(text), t: secs, at: t }; }
  function emote(n, sym) { n.emote = { sym, t: 1.6 }; }

  function talk(n) {
    n.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - n.y, pl.x - n.x));
    pl.anim.dir = G.Sprites.dirFromAngle(Math.atan2(n.y - pl.y, n.x - pl.x));
    const line = n.lines[n.li % n.lines.length];
    n.li++;
    G.Audio.sfx('click');
    G.Sprites.warm(n.anim.dex);
    if (n.mode === 'still') {
      say(n, line);
      if (n.cast.still === 'Sleep') emote(n, 'z');
      else if (n.water) n.anim.play('Hop');
      return;
    }
    // Reacciona: salta, asiente o hace lo suyo (lo que tenga cargado; si no, su ataque).
    n.anim.play(G.Sprites.choose(n.anim.dex, false, ['Hop', 'Nod', 'Pose', 'Attack']) || 'Attack');
    emote(n, (n.cast && n.cast.emote) || '!');
    // Los que pueden, te siguen un rato (la segunda vez que les hablas, seguro).
    if (n.cast && n.cast.follow && n.mode !== 'follow' && followers.length < 3 && (n.li >= 2 || Math.random() < 0.4)) {
      n.mode = 'follow'; n.tt = 25; followers.push(n);
      say(n, G.U.pick(V().FOLLOW), 2.6);
      return;
    }
    say(n, line);
    if (n.mode !== 'follow') { n.mode = 'idle'; n.tt = Math.max(n.tt, 3); }
  }

  // ---------------- puertas y avisos ----------------
  function nearest() {
    let best = null, bd = 1e9;
    for (const p of V().PLACES) {
      const d = Math.hypot(pl.x - tile(p.door[0]), pl.y - tile(p.door[1]));
      if (d < 66 && d < bd) { best = { place: p, goal: 'p:' + p.id }; bd = d; }
    }
    for (const n of npcs) {
      const d = Math.hypot(pl.x - n.x, pl.y - n.y);
      if (d < 60 && d + 14 < bd) { best = { npc: n, goal: 'n:' + npcs.indexOf(n) }; bd = d; }
    }
    return best;
  }
  let shown = '';
  function prompt() {
    const b = $('vil-act');
    if (!b) return;
    const k = !near ? '' : near.place ? 'p' + near.place.id + (G.Social && G.Social.room ? 'r' : '') : 'n' + near.goal;
    if (k === shown) return;
    shown = k;
    b.classList.toggle('hidden', !near);
    if (!near) return;
    const p = near.place;
    const actTxt = p ? (p.go === 'play' && G.Social && G.Social.room ? 'A tu sala' : p.act) : 'Hablar';
    const name = p ? p.name : (G.DEX_BY[near.npc.anim.dex] || {}).name || '';
    $('vil-act-t').textContent = G.T(actTxt);
    $('vil-act-s').textContent = p ? G.T(p.name) : name;
    $('vil-act-ico').innerHTML = p ? G.Icons.html(p.icon, 24) : G.UI.svg('heart', 20);
    b.classList.toggle('play', !!(p && p.go === 'play'));
    keyHint();
  }
  function keyHint() {
    const k = $('vil-key');
    if (!k) return;
    const pad = G.Pad && G.Pad.recent, touch = G.Touch && G.Touch.active;
    k.textContent = pad ? 'A' : 'E';
    k.classList.toggle('hidden', !!touch && !pad);
  }

  function act() {
    if (!near) return;
    if (near.npc) { talk(near.npc); return; }
    go(near.place.go);
  }

  // Lo que abre cada sitio. Los del menú clásico pulsan su botón (oculto, pero en la página): así se abren igual que
  // siempre (Jugar: tu sala si estás en una; si no, la partida). Los demás, su pantalla con su pestaña.
  const CLASSIC = ['play', 'dex', 'upgrades', 'shop', 'bag', 'gacha', 'friends', 'rank', 'compendium'];
  /** Abre el apartado de un sitio (también desde el desplegable). → true si lo ha abierto. */
  function go(what) {
    if (CLASSIC.includes(what)) {
      const b = document.querySelector('#scr-menu .menu-right [data-go="' + what + '"]');
      if (!b) return false;
      b.click();
      return true;
    }
    G.Audio.sfx('click');
    if (what === 'goals') G.GoalsUI.open('missions');
    else if (what === 'ach') G.GoalsUI.open('ach');
    else if (what === 'profile') G.GoalsUI.open('profile');
    else if (what === 'home') { if (G.HomeUI) G.HomeUI.open(); else return false; }
    else if (what === 'settings') { const b = $('btn-settings'); if (b) b.click(); else return false; }
    else if (what === 'news') { const b = $('btn-news'); if (b) b.click(); else return false; }
    else if (what === 'partner') { const b = $('menu-stage'); if (b) b.click(); else return false; }
    else return false;
    return true;
  }

  // ---------------- tocar o hacer clic en la aldea ----------------
  function pointer(e) {
    if (!walking() || e.target !== document.getElementById('game')) return;
    if (e.pointerType !== 'mouse' && G.Touch && G.Touch.stick && G.Touch.stick.id === e.pointerId) return;   // ha cogido el joystick
    if (e.button && e.button !== 0) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit && hit.npc) {
      const n = hit.npc;
      target = { x: n.x + (pl.x < n.x ? -34 : 34), y: n.y + 10, goal: 'n:' + npcs.indexOf(n) };
      target.then = () => { if (Math.hypot(pl.x - n.x, pl.y - n.y) < 90) talk(n); };
      target.then.goal = target.goal;
    } else if (hit && hit.place) {
      const p = hit.place;
      target = { x: tile(p.door[0]), y: tile(p.door[1]), goal: 'p:' + p.id };
      target.then = () => { if (Math.hypot(pl.x - tile(p.door[0]), pl.y - tile(p.door[1])) < 70) go(p.go); };
      target.then.goal = target.goal;
    } else {
      const w = G.Village3D.toWorld(view, e.clientX, e.clientY);
      target = { x: w.x, y: w.y };
    }
  }
  /** Lo que hay bajo el punto de la pantalla: un Pokémon o un sitio (null: el suelo). */
  function pick(sx, sy) {
    let best = null, bd = 1e9;
    for (const n of npcs) {
      const hgt = G.Sprites.bodyHeight(n.anim.dex) + 6, s0 = G.Village3D.toScreen(view, n.x, n.y, 0), s1 = G.Village3D.toScreen(view, n.x, n.y, hgt);
      const half = Math.max(14, (n.r + 6) * view.scale);
      if (sx > s0.x - half && sx < s0.x + half && sy < s0.y + 6 && sy > s1.y) { const d = Math.abs(sx - s0.x); if (d < bd) { bd = d; best = { npc: n }; } }
    }
    if (best) return best;
    for (const p of V().PLACES) {
      const a = G.Village3D.toScreen(view, tile(p.x - p.w / 2), tile(p.y + p.h / 2), 0), b = G.Village3D.toScreen(view, tile(p.x + p.w / 2), tile(p.y - p.h / 2), labelZ(p));
      if (sx > a.x && sx < b.x && sy < a.y && sy > b.y) return { place: p };
    }
    return null;
  }

  // ---------------- dibujo ----------------
  /** Alto (mundo) de lo que hay encima de un sitio: ahí va su nombre. */
  function labelZ(p) {
    return (G.Village3D.top && G.Village3D.top(p.id)) || 110;
  }

  function draw(ctx, w, h, dpr, dt) {
    for (const n of npcs) G.Village3D.sprite(n);
    pl.z = 0;
    G.Village3D.sprite(pl);
    if (holo) { holo.z = 16 + Math.sin(t * 1.6) * 4; holo.anim.dir = Math.floor(t * 1.3) % 8; holo.anim.loop('Idle'); holo.anim.update(dt); G.Village3D.sprite(holo); }
    view.player = pl;
    view.mail = mailUnread();
    const r = G.Village3D.render(view, t, dt, light(phase()));
    if (!r) return;
    lastShot = r;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(r.cv, 0, 0, r.Wl, r.Hl, r.ox, r.oy, r.Wl * r.k, r.Hl * r.k);
    overlay(ctx, w, h);
  }
  function mailUnread() { const b = $('btn-news'); return !!(b && b.classList.contains('new')); }

  const FONT = '700 13px Nunito, "Segoe UI", system-ui, sans-serif';
  function overlay(ctx, w, h) {
    ctx.save();
    // Nombres de los sitios: el que tienes cerca, el de debajo del ratón y, a lo lejos, nada (sin llenar la pantalla).
    const m = G.Input.mouse(), mouseOn = !(G.Touch && G.Touch.active) && performance.now() - G.Input.mouseMovedAt < 4000;
    hover = mouseOn && walking() ? pick(m.x, m.y) : null;
    document.getElementById('game').style.cursor = hover ? 'pointer' : '';
    const named = new Set();
    if (near && near.place) named.add(near.place);
    if (hover && hover.place) named.add(hover.place);
    for (const p of V().PLACES) if (Math.hypot(pl.x - tile(p.x), pl.y - tile(p.y)) < tile(3.4)) named.add(p);
    for (const p of named) {
      const s = G.Village3D.toScreen(view, tile(p.x), tile(p.y), labelZ(p));
      pill(ctx, s.x, s.y, G.T(p.name), p === (near && near.place) || p === (hover && hover.place));
    }
    // Bocadillos y emoticonos de los Pokémon.
    for (const n of npcs) {
      const top = G.Sprites.bodyHeight(n.anim.dex) + 10;
      if (n.bubble) { const s = G.Village3D.toScreen(view, n.x, n.y, top); bubble(ctx, s.x, s.y, n.bubble.text, w); }
      else if (n.emote) { const s = G.Village3D.toScreen(view, n.x, n.y, top); emo(ctx, s.x, s.y, n.emote.sym, n.emote.t); }
      if (hover && hover.npc === n) { const s = G.Village3D.toScreen(view, n.x, n.y, 0); pill(ctx, s.x, s.y + 18, (G.DEX_BY[n.anim.dex] || {}).name || '', true); }
    }
    // Joystick (táctil), como en la partida.
    if (G.Touch && G.Touch.active && walking()) G.Touch.draw(ctx);
    ctx.restore();
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function pill(ctx, x, y, text, on) {
    ctx.font = FONT;
    const tw = ctx.measureText(text).width, W = Math.round(tw + 18), Hh = 22, X = Math.round(x - W / 2), Y = Math.round(y - Hh);
    rr(ctx, X, Y, W, Hh, 11);
    ctx.fillStyle = on ? 'rgba(255,203,5,.95)' : 'rgba(11,21,48,.78)';
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = on ? 'rgba(120,86,0,.8)' : 'rgba(244,247,255,.35)'; ctx.stroke();
    ctx.fillStyle = on ? '#2a1d00' : '#f4f7ff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, X + W / 2, Y + Hh / 2 + 0.5);
  }
  function wrap(ctx, text, max) {
    const out = [];
    let line = '';
    for (const wd of text.split(/\s+/)) {
      const tst = line ? line + ' ' + wd : wd;
      if (ctx.measureText(tst).width > max && line) { out.push(line); line = wd; } else line = tst;
    }
    if (line) out.push(line);
    return out.slice(0, 4);
  }
  function bubble(ctx, x, y, text, sw) {
    ctx.font = FONT;
    const max = Math.min(230, sw * 0.42), lines = wrap(ctx, text, max), lh = 17;
    const tw = Math.max(...lines.map(l => ctx.measureText(l).width)), W = Math.round(tw + 22), Hh = lines.length * lh + 14;
    let X = Math.round(x - W / 2);
    X = Math.max(8, Math.min(sw - W - 8, X));
    const Y = Math.round(y - Hh - 10);
    rr(ctx, X, Y, W, Hh, 10);
    ctx.fillStyle = '#fbfaf4'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1f2a3a'; ctx.stroke();
    // colita
    const tx = Math.max(X + 12, Math.min(X + W - 12, Math.round(x)));
    ctx.beginPath(); ctx.moveTo(tx - 7, Y + Hh - 1); ctx.lineTo(tx, Y + Hh + 9); ctx.lineTo(tx + 6, Y + Hh - 1); ctx.closePath();
    ctx.fillStyle = '#fbfaf4'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx - 7, Y + Hh); ctx.lineTo(tx, Y + Hh + 9); ctx.lineTo(tx + 6, Y + Hh); ctx.strokeStyle = '#1f2a3a'; ctx.stroke();
    ctx.fillStyle = '#1f2a3a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, X + 11, Y + 7 + lh / 2 + i * lh + 0.5));
  }
  function emo(ctx, x, y, sym, life) {
    const k = Math.min(1, (1.6 - life) * 6), bob = Math.sin(t * 8) * 2;
    ctx.globalAlpha = Math.min(1, life * 3);
    const R = 13 * k, X = Math.round(x), Y = Math.round(y - 14 + bob);
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 6.2832);
    ctx.fillStyle = '#fbfaf4'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1f2a3a'; ctx.stroke();
    ctx.fillStyle = sym === '♥' ? '#e0406a' : sym === '!' ? '#e05a20' : sym === 'z' ? '#3a6ad8' : '#1f2a3a';
    ctx.font = '800 ' + Math.round(15 * k) + 'px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sym === 'z' ? 'Zz' : sym, X, Y + 1);
    ctx.globalAlpha = 1;
  }

  // ---------------- desplegable «Ir a…» ----------------
  const ORDER = ['play', 'upgrades', 'gacha', 'dex', 'shop', 'bag', 'home', 'goals', 'ach', 'compendium', 'friends', 'rank', 'profile', 'news', 'settings'];
  /** Lo del desplegable que no es un sitio de la aldea. */
  const EXTRA = { profile: { name: 'Tu perfil', sub: 'Tu perfil y tus partidas', icon: 'crown' } };
  function buildQuick() {
    const box = $('vil-quick');
    if (!box || box.dataset.built) return;
    box.dataset.built = '1';
    const byGo = Object.assign(Object.fromEntries(V().PLACES.map(p => [p.go, p])), EXTRA);
    box.innerHTML = '<header class="vq-head"><span class="vq-title">' + G.T('Ir a') + '</span>' +
      '<button class="icon-btn" id="vil-quick-close" type="button" aria-label="' + G.T('Cerrar') + '" title="' + G.T('Cerrar') + '">' + G.UI.svg('close') + '</button></header>' +
      '<button class="vq-partner" id="vq-partner" type="button"></button>' +
      '<div class="vq-list">' + ORDER.map(go => {
        const p = byGo[go];
        return `<button class="vq-item${go === 'play' ? ' play' : ''}" type="button" data-vgo="${go}"><span class="vq-ico" aria-hidden="true">${G.Icons.html(p.icon, 24)}</span>` +
          `<span class="vq-t">${G.T(go === 'play' ? 'Jugar' : p.name)}</span><small class="vq-s" data-vsub="${go}">${G.T(p.sub)}</small></button>`;
      }).join('') + '</div><div class="vq-stats" id="vq-stats"></div>';
    box.querySelectorAll('[data-vgo]').forEach(b => { b.onclick = () => { setQuick(false); go(b.dataset.vgo); }; });
    $('vil-quick-close').onclick = () => { G.Audio.sfx('click'); setQuick(false); };
    $('vq-partner').onclick = () => { setQuick(false); go('partner'); };
    $('vil-go').onclick = () => { G.Audio.sfx('click'); setQuick(!quick); };
    $('vil-act').onclick = () => { if (walking()) act(); };
  }
  /** Los textos del desplegable, con lo mismo que dice el menú clásico (Pokédex, mochila, premios, amigos, sala). */
  function refreshQuick() {
    const box = $('vil-quick');
    if (!box || !box.dataset.built) return;
    const copy = { dex: 'menu-dex-count', bag: 'menu-bag-sub', goals: 'menu-goals-sub', friends: 'menu-friends-sub' };
    for (const go in copy) {
      const src = $(copy[go]), dst = box.querySelector('[data-vsub="' + go + '"]');
      if (src && dst) { dst.textContent = src.textContent; dst.classList.toggle('gold', src.classList.contains('gold')); }
    }
    const play = document.querySelector('#scr-menu [data-go=play] small'), dp = box.querySelector('[data-vsub="play"]');
    if (play && dp) dp.textContent = play.textContent;
    const s = G.DB.save, mon = s && G.DEX_BY[s.partner];
    if (mon) {
      const shiny = !!s.partnerShiny && G.DB.ownsShiny(mon.dex);
      $('vq-partner').innerHTML = `<span class="vq-pn">${mon.name}${shiny ? ' ' + G.Icons.html('shiny', 16) : ''}</span>` +
        `<span class="vq-pi">${G.UI.typeChips(mon.types)} ${G.UI.stars(mon.rarity)}</span><small>${G.T('Ver en la Pokédex')}</small>`;
    }
    const st = $('menu-stats');
    if (st) $('vq-stats').innerHTML = st.innerHTML;
  }
  function setQuick(on) {
    quick = !!on && active;
    const box = $('vil-quick'), b = $('vil-go');
    if (!box) return;
    box.classList.toggle('hidden', !quick);
    if (b) b.setAttribute('aria-expanded', quick ? 'true' : 'false');
    if (quick) { refreshQuick(); target = null; }
    else if (document.activeElement && box.contains(document.activeElement)) document.activeElement.blur();
  }

  // ---------------- arranque y fin ----------------
  function init() {
    forceClassic = /[?&]clasico\b/.test(location.search);
    addEventListener('pointerdown', pointer);
    // Fuera del desplegable, un clic lo cierra.
    addEventListener('pointerdown', e => { if (quick && !e.target.closest('#vil-quick, #vil-go')) setQuick(false); }, true);
    // Esc con el desplegable abierto lo cierra (y no llega a otra cosa).
    addEventListener('keydown', e => { if (quick && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuick(false); walkPrev = false; } }, true);
    addEventListener('resize', () => { if (active) snapCam(); });
    // En reposo, three.js a la caché (si va a hacer falta): así la aldea sale antes.
    if (wanted()) setTimeout(() => { if (three === 'idle') loadThree(); }, 1500);
  }
  /** Al empezar una partida: se suelta todo lo de la GPU (la aldea se rehace al volver). */
  function sleep() {
    if (!G.Village3D) return;
    for (const n of npcs) G.Village3D.unsprite(n);
    if (pl) G.Village3D.unsprite(pl);
    if (holo) G.Village3D.unsprite(holo);
    npcs = []; pl = null; followers = []; lastPartner = ''; pet = null; holo = null; homeKey = '';
    G.Village3D.free();
    active = false; quick = false; lastShot = null;
    if (homeOpen && G.HomeUI) G.HomeUI.close(true);
    homeOpen = false; homePreview = null;
  }

  return { init, show, frame, sleep, go, walking, wanted, prepare, homePanel, previewHome, syncHome, nearest: () => near,
    get homeOpen() { return homeOpen; },
    get active() { return active; }, get mode() { return active ? 'village' : failed ? 'classic' : three === 'loading' ? 'loading' : 'classic'; },
    get failed() { return failed; }, get quickOpen() { return quick; },
    places: () => V().PLACES.map(p => ({ id: p.id, go: p.go, name: p.name })), ORDER,
    /** Para pruebas y capturas. */
    debug: {
      phase(p) { phaseOverride = p == null ? null : p; }, get player() { return pl; }, get npcs() { return npcs; }, get view() { return view; },
      teleport(x, y) { if (pl) { pl.x = tile(x); pl.y = tile(y); snapCam(); } }, quick: setQuick, act, blocked: (x, y, r) => blocked(tile(x), tile(y), r || 14),
      fail, stats: () => G.Village3D.stats()
    } };
})();
