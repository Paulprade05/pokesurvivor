/* ============ mobile.js — el juego como app en el móvil (sobre todo iPhone) ============
 *   - Sin zoom sin querer: el pellizco de Safari se corta aquí (iOS no hace caso
 *     de user-scalable=no) y el doble toque, con touch-action en style.css.
 *   - iOS antiguo (antes del 16, sin overscroll-behavior): la página no rebota
 *     al arrastrar; las listas se siguen desplazando con el dedo.
 *   - Pulsación larga en el móvil: sin el menú del sistema (descargar imagen,
 *     abrir en otra pestaña...), salvo en campos de texto y enlaces.
 *   - Pantalla encendida durante la partida (Screen Wake Lock). En los menús,
 *     en la pausa o con las cartas abiertas 3 min sin tocar nada, se suelta.
 *   - Al girar, al volver a la app o al cerrar el teclado, la página vuelve a
 *     su sitio y, si el tamaño cambió sin avisar, se vuelve a medir (issue #91).
 *   - <html class="standalone"> si se abre desde la pantalla de inicio (o a
 *     pantalla completa) e "ios" en iPhone y iPad, por si el CSS lo necesita.
 *   - Sólo horizontal en el móvil (26-10-2026, bloqueado): de pie, el juego entero
 *     se pinta girado 90° (rotate.js), así que siempre se juega tumbado aunque el
 *     giro de la pantalla esté desbloqueado; en la app instalada o a pantalla
 *     completa, además, la orientación se bloquea en horizontal donde el navegador
 *     lo deja (Android). Al girar el móvil en plena partida, pausa. Si el navegador
 *     no deja girar la página, el aviso «Gira el móvil» de antes. Tableta y
 *     ordenador, como siempre.
 * En PC sólo hace lo de la pantalla encendida (útil jugando con mando).
 */
G.Mobile = (() => {
  const root = document.documentElement;
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const TOUCH = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const now = () => performance.now();
  const isField = el => !!el && el.nodeType === 1 && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  const media = q => (window.matchMedia ? matchMedia(q) : null);
  const onMedia = (m, fn) => { if (!m) return; if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn); };
  // Con el juego girado (rotate.js), innerWidth y compañía son los de la vista tumbada;
  // aquí hace falta la ventana de verdad.
  const R = G.Rotate;
  const rawW = () => (R.installed ? R.raw.w() : innerWidth), rawH = () => (R.installed ? R.raw.h() : innerHeight);

  // ---------------- app de la pantalla de inicio ----------------
  const appMode = media('(display-mode: standalone), (display-mode: fullscreen)');
  const standalone = () => !!navigator.standalone || !!(appMode && appMode.matches);
  function marks() {
    root.classList.toggle('standalone', standalone());
    root.classList.toggle('ios', IOS);
  }
  marks();
  onMedia(appMode, marks);

  // ---------------- iPhone como app: tamaño de la ventana ----------------
  // Abierto desde la pantalla de inicio, al girarlo a horizontal iOS a veces deja la
  // página con el alto de antes (una franja abajo hasta volver a girarlo dos veces).
  // En la app la ventana es siempre la pantalla entera: se fija con sus medidas
  // (--app-w / --app-h, ver style.css) y el juego mide su lienzo con ellas.
  const IPHONE = /iPhone|iPod/.test(navigator.userAgent);
  function appSize() {
    const on = IPHONE && standalone() && screen.width > 0;
    root.classList.toggle('ios-app', on);
    if (!on) return;
    const a = Math.min(screen.width, screen.height), b = Math.max(screen.width, screen.height);
    const o = typeof window.orientation === 'number' ? window.orientation : null;
    const land = o !== null ? Math.abs(o) === 90 : rawW() > rawH();
    root.style.setProperty('--app-w', (land ? b : a) + 'px');
    root.style.setProperty('--app-h', (land ? a : b) + 'px');
  }
  appSize();
  onMedia(appMode, appSize);

  // ---------------- sólo horizontal en el móvil (26-10-2026: bloqueado de verdad) ----------------
  // Móvil = táctil y con el lado corto de la pantalla de menos de 600 px (la
  // pantalla, no la ventana: el iPad en Slide Over o en pantalla dividida no cuenta).
  // De pie, el juego se pinta girado 90° (rotate.js): sigue tumbado aunque el giro
  // de la pantalla esté desbloqueado. Si el navegador no deja girarlo (muy viejo),
  // queda el aviso «Gira el móvil» de antes (#rotate, html.need-rotate).
  const shortSide = () => {
    const a = Math.min(screen.width || 0, screen.height || 0);
    return a > 0 ? a : Math.min(rawW(), rawH());
  };
  const phone = () => TOUCH && shortSide() < 600;
  if (phone()) R.install();
  const portraitMq = R.installed ? R.raw.matchMedia('(orientation: portrait)') : media('(orientation: portrait)');
  const isPortrait = () => (portraitMq ? portraitMq.matches : rawH() > rawW());
  // El giro de la pantalla, cuando el navegador está tumbado: 90 (girado a la izquierda) o -90 (a la derecha).
  function landAngle() {
    const o = typeof window.orientation === 'number' ? window.orientation : null;
    if (o === 90 || o === -90) return o;
    const so = screen.orientation;
    if (so && typeof so.angle === 'number') return so.angle === 270 ? -90 : so.angle === 90 ? 90 : 0;
    return 0;
  }
  // Hacia dónde se gira la página de pie: hacia el último lado en que estuvo tumbado
  // (así, al ponerlo de pie, la imagen no se mueve respecto al móvil); de serie, 90.
  const SIDE_KEY = 'ps.rotSide';
  let side = 90;
  try { if (localStorage.getItem(SIDE_KEY) === '-90') side = -90; } catch (e) { /* sin almacenamiento */ }
  function noteSide() {
    const a = landAngle();
    if (!a || a === side) return;
    side = a;
    try { localStorage.setItem(SIDE_KEY, String(a)); } catch (e) { /* nada */ }
  }
  /** La ventana de verdad, de pie: [ancho, alto]. En la app del iPhone, la pantalla (ver appSize). */
  function physSize() {
    if (root.classList.contains('ios-app')) {
      const a = Math.min(screen.width, screen.height), b = Math.max(screen.width, screen.height);
      return [a, b];
    }
    return [rawW(), rawH()];
  }
  let rotOn = false;        // ¿de pie en el móvil?
  /** De pie en el móvil: el juego, girado. Al girar el móvil en plena partida (en solitario), pausa. */
  function rotateCheck() {
    root.classList.add('rot-ready');                           // (ya no hace falta el giro de la carga, style.css)
    const ph = phone(), on = ph && isPortrait(), changed = on !== rotOn;
    if (ph && !on) noteSide();
    rotOn = on;                                                // (antes de girar: set() avisa con un 'resize' que vuelve a entrar aquí)
    if (R.installed) {
      const [w, h] = physSize();
      R.set(on ? side : 0, w, h);
    }
    if (!changed) return;
    // La partida se pausa (las manos se están recolocando); en grupo sigue: la llevan los demás.
    const g = G.Game, run = !!g && g.state !== 'ui' && g.state !== 'over' && g.state !== undefined;
    const coop = !!(G.Coop && G.Coop.active);
    if (G.Touch) G.Touch.reset();
    if (run && !coop && g.state === 'playing') g.togglePause();
    // Fuera el teclado (si escribía algo) y el foco.
    const a = document.activeElement;
    if (on && a && a !== document.body && a.blur) a.blur();
    if (R.installed) return;
    // Sin giro: el aviso de antes.
    root.classList.toggle('need-rotate', on);
    const el = document.getElementById('rotate');
    if (el) el.setAttribute('aria-hidden', on ? 'false' : 'true');
    root.classList.toggle('rotate-run', on && run && !coop);
    root.classList.toggle('rotate-coop', on && run && coop);
  }
  rotateCheck();
  onMedia(portraitMq, rotateCheck);
  addEventListener('resize', rotateCheck);
  addEventListener('orientationchange', () => setTimeout(rotateCheck, 50));

  // Bloquear en horizontal: sólo se puede con la app instalada o a pantalla completa
  // (Android); en el resto (iPhone, Safari...) no existe o falla, y no pasa nada.
  function lockLandscape() {
    const so = screen.orientation;
    if (!phone() || !so || typeof so.lock !== 'function') return;
    if (!standalone() && !(document.fullscreenElement || document.webkitFullscreenElement)) return;
    try { const p = so.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* nada */ }
  }
  lockLandscape();
  onMedia(appMode, lockLandscape);
  document.addEventListener('fullscreenchange', lockLandscape);
  document.addEventListener('webkitfullscreenchange', lockLandscape);

  // ---------------- zoom, rebote y pulsación larga ----------------
  let touchAt = -1e9, lastInput = 0;
  addEventListener('pointerdown', e => { lastInput = now(); if (e.pointerType !== 'mouse') touchAt = lastInput; }, { capture: true, passive: true });
  addEventListener('touchstart', () => { lastInput = touchAt = now(); }, { capture: true, passive: true });
  addEventListener('keydown', () => { lastInput = now(); }, { capture: true, passive: true });

  if (TOUCH) {
    // Pellizcar para ampliar (Safari, también abierto desde la pantalla de inicio).
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
    // Pulsación larga (Android): el lienzo ya lo corta touch.js; aquí, el resto de la interfaz.
    document.addEventListener('contextmenu', e => {
      if (now() - touchAt > 2000) return;                                  // clic derecho con ratón: como siempre
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable], a[href]')) return;
      e.preventDefault();
    });
  }

  // iOS 15 y anteriores: arrastrar donde no hay nada que desplazar movía la página entera.
  if (IOS && !(window.CSS && CSS.supports && CSS.supports('overscroll-behavior', 'none'))) {
    let scroller = null;
    document.addEventListener('touchstart', e => { scroller = scrollerOf(e.target); }, { capture: true, passive: true });
    document.addEventListener('touchmove', e => { if (!scroller && e.cancelable) e.preventDefault(); }, { passive: false });
  }
  /** La lista (o el campo) que puede desplazarse bajo el dedo, o null. */
  function scrollerOf(el) {
    if (el && el.nodeType !== 1) el = el.parentElement;
    for (; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
      if (isField(el)) return el;                                          // deslizadores y campos van solos
      const cs = getComputedStyle(el);
      if ((el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(cs.overflowY)) ||
          (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(cs.overflowX))) return el;
    }
    return null;
  }

  // ---------------- pantalla encendida en partida ----------------
  // 1: siempre (la partida sigue: jugando, o en grupo esperando a otro).
  // 2: mientras toque algo (cartas de nivel o de objeto): si deja el móvil, se apaga sola.
  const RUN = { playing: 1, held: 1, levelup: 2, choice: 2 };
  const IDLE = 3 * 60 * 1000;
  let lock = null, asking = false, failAt = -1e9, lastK = 0, cardsAt = 0;
  function wanted() {
    const k = (G.Game && RUN[G.Game.state]) || 0;
    // Los 3 min cuentan desde que salen las cartas (con el joystick pegado o con mando no hay toques nuevos).
    if (k === 2 && lastK !== 2) cardsAt = now();
    lastK = k;
    return !!k && !document.hidden && (k === 1 || now() - Math.max(lastInput, cardsAt) < IDLE);
  }
  /** @param gesture  llamado justo tras un toque o una tecla (algunos navegadores lo piden) */
  function keepAwake(gesture) {
    if (!navigator.wakeLock) return;
    const want = wanted();
    if (!want) { if (lock) free(); return; }
    if (lock || asking || now() - failAt < (gesture ? 2000 : 15000)) return;
    asking = true;
    let p;
    try { p = navigator.wakeLock.request('screen'); } catch (e) { p = Promise.reject(e); }
    p.then(l => {
      asking = false; lock = l;
      // El navegador la suelta solo al cambiar de app o apagar la pantalla.
      l.addEventListener('release', () => { if (lock === l) lock = null; });
      if (!wanted()) free();
    }, () => { asking = false; failAt = now(); });
  }
  function free() {
    const l = lock; lock = null;
    if (l) l.release().catch(() => {});
  }
  setInterval(keepAwake, 1000);
  for (const ev of ['pointerup', 'keydown']) addEventListener(ev, () => { if (!lock && !asking) keepAwake(true); }, { capture: true, passive: true });

  // ---------------- girar, volver a la app y teclado ----------------
  let seenW = innerWidth, seenH = innerHeight;
  addEventListener('resize', () => { seenW = innerWidth; seenH = innerHeight; });

  /** iPhone: tras cerrar el teclado o girarlo, la página a veces se quedaba movida (o ampliada). */
  const vpMeta = document.querySelector('meta[name=viewport]');
  const VP = vpMeta && vpMeta.getAttribute('content');                    // la original: dos llamadas seguidas no la van alargando
  function settle() {
    if (isField(document.activeElement)) return;                          // con el teclado abierto iOS la mueve a propósito
    if (scrollX || scrollY) scrollTo(0, 0);
    const vv = window.visualViewport;
    if (VP && vv && vv.scale > 1.01) {
      // Cambiar la etiqueta hace que iOS vuelva a aplicarla y quite la ampliación.
      vpMeta.setAttribute('content', VP + ',minimum-scale=1');
      setTimeout(() => vpMeta.setAttribute('content', VP), 50);
    }
  }
  // El tamaño cambió sin que llegara el aviso (iOS al volver a la app o tras girar
  // con ella en segundo plano): se avisa al juego (game.js, touch.js) como si
  // hubiera llegado. Sólo si cambió: el editor de botones recarga lo colocado con cada aviso.
  function remeasure() {
    appSize();
    rotateCheck();                                                        // (con el giro, la vista a la nueva medida)
    settle();
    if (innerWidth !== seenW || innerHeight !== seenH) dispatchEvent(new Event('resize'));
  }
  let laterT = [];
  function remeasureSoon() {
    remeasure();
    laterT.forEach(clearTimeout);
    laterT = [300, 1000].map(ms => setTimeout(remeasure, ms));
  }
  onMedia(portraitMq, remeasureSoon);                                     // (la de verdad, no la de la vista)
  addEventListener('orientationchange', remeasureSoon);
  addEventListener('pageshow', remeasureSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) remeasureSoon(); keepAwake(); });
  // Al cerrar el teclado (salir del campo sin entrar en otro), la página a su sitio.
  document.addEventListener('focusout', e => { if (isField(e.target)) setTimeout(settle, 120); });

  return { standalone, ios: IOS, get awake() { return !!lock; },
    /** ¿De pie en el móvil? (el juego va girado o, si el navegador no deja, con el aviso «Gira el móvil») */ get mustRotate() { return rotOn; } };
})();
