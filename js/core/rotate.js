/* ============ rotate.js — el juego tumbado aunque el móvil esté de pie (26-10-2026) ============
 * En el móvil PokéSurvivor es sólo horizontal. Donde el navegador deja bloquear la
 * orientación (Android con la app instalada o a pantalla completa) lo bloquea
 * mobile.js; en el iPhone (Safari y app de la pantalla de inicio) una web no puede,
 * así que con el móvil de pie TODO (menús y partida) se pinta girado 90°: la página
 * (<body>) mide lo que mediría tumbada y se gira con transform. Quien lo tenga de
 * pie ve el juego de lado y lo coge tumbado, como cualquier juego de móvil.
 *
 * Sentido del giro (lo decide mobile.js, ver noteSide):
 *    90  el de serie: lo de arriba del juego, al borde derecho del móvil de pie. Se
 *        juega girándolo a la izquierda (la isla o la muesca a la izquierda y la
 *        barra de inicio a la derecha), el horizontal de serie de los juegos de iPhone.
 *   -90  al revés (girándolo a la derecha). Se usa si la última vez que el navegador
 *        estuvo tumbado lo estaba hacia ese lado: así, con el giro desbloqueado, al
 *        poner el móvil de pie la imagen no se mueve respecto al móvil.
 *
 * Para que el resto del juego no tenga que saber nada, con el giro puesto la
 * página "ve" una ventana tumbada (la vista):
 *   - innerWidth / innerHeight, las coordenadas de los toques, clics y punteros
 *     (clientX / clientY / pageX / pageY / x / y), getBoundingClientRect() y
 *     document.elementFromPoint() hablan en píxeles de la vista;
 *   - matchMedia() y las @media de las hojas de estilo cambian ancho por alto y
 *     vertical por horizontal (las reglas se reescriben al girar y se devuelven
 *     al quitarlo), igual que vw / vh / dvh... y las zonas seguras (env(safe-area-inset-*));
 *   - al girar o quitar el giro llega un 'resize', como al girar el móvil de verdad.
 * Sólo se instala en el móvil (mobile.js: install()); en tableta y ordenador no
 * toca nada. G.Rotate.raw guarda lo de verdad (del aparato) para mobile.js.
 */
G.Rotate = (() => {
  const root = document.documentElement;
  let angle = 0;               // 0, 90 o -90
  let PW = 0, PH = 0;          // ventana de verdad (de pie): ancho y alto en px
  let installed = false, failed = false;
  let rules = null;            // lo de las hojas de estilo que cambia con el giro
  const live = new Set();      // matchMedia() con alguien escuchando
  const raw = {};

  /** El descriptor de una propiedad, buscándolo por la cadena de prototipos. → [dueño, descriptor] o null */
  function find(o, k) {
    for (let p = o; p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, k);
      if (d) return [p, d];
    }
    return null;
  }

  // ---------------- de la pantalla a la vista y al revés ----------------
  /** Punto de la pantalla (px de la ventana de verdad) → punto de la vista. */
  function toView(x, y) { return angle === 90 ? [y, PW - x] : angle === -90 ? [PH - y, x] : [x, y]; }
  /** Punto de la vista → punto de la pantalla. */
  function toScreen(x, y) { return angle === 90 ? [PW - y, x] : angle === -90 ? [y, PH - x] : [x, y]; }
  /** Zonas seguras de la pantalla { top, right, bottom, left } → las de la vista (muesca y barra de inicio, en su lado). */
  function insets(p) {
    if (angle === 90) return { top: p.right, right: p.bottom, bottom: p.left, left: p.top };
    if (angle === -90) return { top: p.left, right: p.top, bottom: p.right, left: p.bottom };
    return p;
  }

  // ---------------- hojas de estilo ----------------
  const DIM = /\b(width|height|orientation|aspect-ratio)\b/;
  const UNITS = /(\d|\.)(d|s|l)?v(w|h)\b|safe-area-inset-/;
  const SWAP = { width: 'height', height: 'width', portrait: 'landscape', landscape: 'portrait' };
  const SIDE = { 90: { top: 'right', right: 'bottom', bottom: 'left', left: 'top' },
                 '-90': { top: 'left', right: 'top', bottom: 'right', left: 'bottom' } };
  /** Una condición @media de la vista, dicha con la pantalla: ancho ↔ alto, vertical ↔ horizontal. */
  function swapMedia(t) {
    return t
      .replace(/\b(min-|max-)?(device-)?aspect-ratio\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g,
        (m, mm, dev, a, b) => (mm === 'min-' ? 'max-' : mm === 'max-' ? 'min-' : '') + (dev || '') + 'aspect-ratio: ' + b + '/' + a)
      .replace(/\b(width|height|portrait|landscape)\b/g, w => SWAP[w]);
  }
  /** Unas declaraciones CSS para la vista girada (ang): vw ↔ vh y cada zona segura, la de su lado. */
  function swapDecl(t, ang) {
    return t.replace(/(\d*\.?\d+)(d|s|l)?v(w|h)\b/g, (m, n, k, d) => n + (k || '') + 'v' + (d === 'w' ? 'h' : 'w'))
      .replace(/safe-area-inset-(top|right|bottom|left)/g, (m, s) => 'safe-area-inset-' + SIDE[ang][s]);
  }
  /** Busca (una vez, con todo aún sin girar) las @media y las declaraciones que cambian. */
  function scan() {
    rules = { media: [], decl: [] };
    const walk = list => {
      for (const r of list) {
        try {
          if (r.media && r.type === 4) {
            const a = r.media.mediaText;
            if (DIM.test(a)) rules.media.push({ r, a, b: swapMedia(a) });
          }
          if (r.style && r.style.cssText) {
            const a = r.style.cssText;
            if (UNITS.test(a)) rules.decl.push({ s: r.style, a, b90: swapDecl(a, 90), bm90: swapDecl(a, -90) });
          }
          if (r.cssRules) walk(r.cssRules);
        } catch (e) { /* una regla rara: se queda como está */ }
      }
    };
    for (const sh of document.styleSheets) {
      let list = null;
      try { list = sh.cssRules; } catch (e) { continue; }   // (de otro sitio: no se puede leer)
      if (list) walk(list);
    }
  }
  function restyle() {
    if (!rules) scan();
    for (const m of rules.media) { try { m.r.media.mediaText = angle ? m.b : m.a; } catch (e) { /* nada */ } }
    for (const d of rules.decl) { try { d.s.cssText = angle === 90 ? d.b90 : angle === -90 ? d.bm90 : d.a; } catch (e) { /* nada */ } }
  }

  // ---------------- matchMedia de la vista ----------------
  function onMq(m, fn) { if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn); }
  function vmql(q) {
    const a = raw.matchMedia(q), b = raw.matchMedia(swapMedia(q)), fns = new Set();
    let last = null, onchange = null;
    const o = {
      media: a.media,
      get matches() { return (angle ? b : a).matches; },
      get onchange() { return onchange; },
      set onchange(fn) { onchange = typeof fn === 'function' ? fn : null; watch(); },
      addEventListener(type, fn) { if (type === 'change' && fn) { fns.add(fn); watch(); } },
      removeEventListener(type, fn) { if (type === 'change') fns.delete(fn); },
      addListener(fn) { o.addEventListener('change', fn); },
      removeListener(fn) { o.removeEventListener('change', fn); },
      dispatchEvent() { return true; },
      check() {
        const m = o.matches;
        if (m === last) return;
        last = m;
        const ev = { type: 'change', matches: m, media: o.media };
        for (const fn of fns) { try { fn.call(o, ev); } catch (e) { setTimeout(() => { throw e; }); } }
        if (onchange) { try { onchange.call(o, ev); } catch (e) { setTimeout(() => { throw e; }); } }
      }
    };
    function watch() {
      if (last !== null) return;
      last = o.matches;
      live.add(o);
      onMq(a, o.check); onMq(b, o.check);
    }
    return o;
  }

  // ---------------- instalar ----------------
  /** Pone la vista (sin girar aún: así todo sigue igual hasta que haga falta). → ¿se ha podido? */
  function install() {
    if (installed || failed) return installed;
    try {
      // Ventana de verdad.
      const iw = find(window, 'innerWidth'), ih = find(window, 'innerHeight');
      if (!iw || !ih || !iw[1].get || !ih[1].get || !window.matchMedia || !Element.prototype.getBoundingClientRect) throw Error('sin API');
      raw.w = () => iw[1].get.call(window);
      raw.h = () => ih[1].get.call(window);
      raw.matchMedia = window.matchMedia.bind(window);
      Object.defineProperty(window, 'innerWidth', { configurable: true, enumerable: true, get() { return angle ? PH : raw.w(); } });
      Object.defineProperty(window, 'innerHeight', { configurable: true, enumerable: true, get() { return angle ? PW : raw.h(); } });
      if (innerWidth !== raw.w()) throw Error('innerWidth');

      window.matchMedia = function (q) { q = String(q); return DIM.test(q) ? vmql(q) : raw.matchMedia(q); };

      // Toques, clics y punteros: (x, y) de la vista.
      const pair = (proto, kx, ky) => {
        const fx = proto && find(proto, kx), fy = proto && find(proto, ky);
        if (!fx || !fy || !fx[1].get || !fy[1].get) return;
        const gx = fx[1].get, gy = fy[1].get;
        Object.defineProperty(fx[0], kx, { configurable: true, enumerable: fx[1].enumerable,
          get() { return angle === 90 ? gy.call(this) : angle === -90 ? PH - gy.call(this) : gx.call(this); } });
        Object.defineProperty(fy[0], ky, { configurable: true, enumerable: fy[1].enumerable,
          get() { return angle === 90 ? PW - gx.call(this) : angle === -90 ? gx.call(this) : gy.call(this); } });
      };
      const ME = window.MouseEvent && MouseEvent.prototype, TO = window.Touch && Touch.prototype;
      pair(ME, 'clientX', 'clientY'); pair(ME, 'pageX', 'pageY'); pair(ME, 'x', 'y');
      pair(TO, 'clientX', 'clientY'); pair(TO, 'pageX', 'pageY');

      // Dónde está algo: el recuadro en la vista.
      const rect = (l, t, w, h) => (typeof DOMRect === 'function' ? new DOMRect(l, t, w, h)
        : { x: l, y: t, left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, toJSON() { return this; } });
      const gbcr = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        const r = gbcr.call(this);
        if (!angle || this === root) return r;
        return angle === 90 ? rect(r.top, PW - r.right, r.height, r.width) : rect(PH - r.bottom, r.left, r.height, r.width);
      };
      for (const k of ['elementFromPoint', 'elementsFromPoint']) {
        const f = Document.prototype[k];
        if (typeof f !== 'function') continue;
        Document.prototype[k] = function (x, y) { if (angle) { const p = toScreen(x, y); x = p[0]; y = p[1]; } return f.call(this, x, y); };
      }
      installed = true;
    } catch (e) {
      failed = true;
      console.warn('rotate.js: sin giro (' + (e && e.message) + ')');
    }
    return installed;
  }

  /**
   * Pone (o quita, ang = 0) el giro. pw × ph: la ventana de verdad, de pie (en la app
   * del iPhone, la pantalla). Se puede llamar en cada 'resize': sólo cambia lo que cambie.
   */
  function set(ang, pw, ph) {
    if (!installed) return false;
    ang = ang === 90 || ang === -90 ? ang : 0;
    pw = Math.round(pw) || PW; ph = Math.round(ph) || PH;
    const turned = ang !== angle, sized = pw !== PW || ph !== PH;
    if (!turned && !sized) return true;
    PW = pw; PH = ph;
    // La página: tan ancha como alta es la pantalla, girada desde su esquina de arriba a la izquierda.
    const s = root.style;
    s.setProperty('--rot-w', PH + 'px');
    s.setProperty('--rot-h', PW + 'px');
    s.setProperty('--rot-tf', ang === -90 ? `translateY(${PH}px) rotate(-90deg)` : `translateX(${PW}px) rotate(90deg)`);
    if (turned) {
      angle = ang;
      root.classList.toggle('rot', !!ang);
      root.dataset.rot = String(ang);
      restyle();
      for (const o of live) o.check();
    }
    // Como al girar el móvil: que se recoloque todo (game.js, touch.js, el HUD...). (Si sólo
    // cambia el tamaño, ya llega el 'resize' de verdad, y mobile.js lo oye antes que nadie.)
    if (turned) dispatchEvent(new Event('resize'));
    return true;
  }

  return {
    install, set, toView, toScreen, insets, raw,
    /** 0 (sin girar), 90 o -90. */
    get angle() { return angle; },
    get installed() { return installed; }
  };
})();
