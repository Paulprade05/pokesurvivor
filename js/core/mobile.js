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
    const land = o !== null ? Math.abs(o) === 90 : innerWidth > innerHeight;
    root.style.setProperty('--app-w', (land ? b : a) + 'px');
    root.style.setProperty('--app-h', (land ? a : b) + 'px');
  }
  appSize();
  onMedia(appMode, appSize);

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
    settle();
    if (innerWidth !== seenW || innerHeight !== seenH) dispatchEvent(new Event('resize'));
  }
  let laterT = [];
  function remeasureSoon() {
    remeasure();
    laterT.forEach(clearTimeout);
    laterT = [300, 1000].map(ms => setTimeout(remeasure, ms));
  }
  onMedia(media('(orientation: portrait)'), remeasureSoon);
  addEventListener('orientationchange', remeasureSoon);
  addEventListener('pageshow', remeasureSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) remeasureSoon(); keepAwake(); });
  // Al cerrar el teclado (salir del campo sin entrar en otro), la página a su sitio.
  document.addEventListener('focusout', e => { if (isField(e.target)) setTimeout(settle, 120); });

  return { standalone, ios: IOS, get awake() { return !!lock; } };
})();
