/* ============ touch.js — controles táctiles ============
 * Joystick flotante: pones el dedo en cualquier sitio de la pantalla de juego
 * y ahí aparece; arrastras para moverte y al soltar desaparece. Si el dedo se
 * aleja más que el radio, la base le sigue (nunca se queda "atascado").
 *
 * Botones del HUD (iconos de ataque, pausa): el HUD los registra en cada
 * fotograma con addButton(); un toque (o un clic con el ratón) sobre uno lo
 * pulsa en vez de abrir el joystick. Varios dedos a la vez funcionan.
 *
 * Joystick fijo (Ajustes > Controles > Colocar los botones): siempre en el
 * mismo sitio; sólo se coge tocando cerca de él.
 *
 * Portátil con pantalla táctil: un toque pasa el HUD a modo móvil y volver a
 * usar el ratón o el teclado lo devuelve al modo PC.
 */
G.Touch = (() => {
  let cv = null, stick = null;
  let active = G.Settings.touch;      // ¿se está usando táctil?
  let buttons = [];
  let touchAt = 0;                    // último toque (lo que simula el navegador después no es el ratón)
  let missed = null;                  // el último dedo que no cogió el joystick (estaba ocupado)

  const R = () => 56 * (G.Settings.get('stick') || 1);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** ¿Pantalla en vertical? Con el tamaño que se pase (w × h) o, si no, el del lienzo. */
  function tall(w, h) { return w === undefined ? (cv ? cv.clientHeight > cv.clientWidth : innerHeight > innerWidth) : h > w; }
  /**
   * Dónde ha colocado el jugador una cosa ('bar', 'pause', 'stick'): [x, y] en 0..1, o null.
   * Cada orientación tiene la suya: 'pad' en horizontal y 'padP' en vertical.
   */
  function spot(k, w, h) { const p = G.Settings.get(tall(w, h) ? 'padP' : 'pad'); return p && Array.isArray(p[k]) ? p[k] : null; }
  // Joystick fijo de serie: en horizontal a la izquierda; en vertical, en medio, a mano del pulgar.
  const STICK_DEF = [0.14, 0.72], STICK_DEF_P = [0.5, 0.72];
  const stickDef = (w, h) => tall(w, h) ? STICK_DEF_P : STICK_DEF;
  const fixed = () => G.Settings.get('stickMode') === 'fixed';
  /** Centro del joystick fijo, en px de pantalla. */
  function stickBase(w = cv.clientWidth, h = cv.clientHeight) {
    const p = spot('stick', w, h) || stickDef(w, h), r = R();
    return { x: clamp(p[0] * w, r + 4, w - r - 4), y: clamp(p[1] * h, r + 4, h - r - 4) };
  }

  function init(canvas) {
    cv = canvas;
    if (active) document.body.classList.add('touch');
    cv.addEventListener('pointerdown', down);
    // Mover y soltar se escuchan en toda la ventana (y antes que nadie): si el
    // dedo acababa encima de las cartas de nivel o fallaba la captura, el lienzo
    // no se enteraba y el Pokémon seguía andando solo.
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
    cv.addEventListener('lostpointercapture', up);
    for (const ev of ['pointerdown', 'pointermove', 'pointerup']) addEventListener(ev, usedPointer, true);
    addEventListener('keydown', e => { if (active && G.Input.gameKey(e)) toPc(e); }, true);
    // Sin ningún dedo en la pantalla no puede haber joystick.
    for (const ev of ['touchstart', 'touchend', 'touchcancel']) {
      document.addEventListener(ev, e => { touchAt = performance.now(); if (ev !== 'touchstart' && !e.touches.length && (!stick || stick.touch)) reset(); }, { capture: true, passive: true });
    }
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // iPhone: la pulsación larga sobre el juego abría la lupa y el menú de
    // "Copiar / Seleccionar todo". Cortar el toque aquí lo evita (los eventos
    // pointer, que son los que usa el joystick, siguen llegando).
    // Además, los botones (movimientos, pausa) se pulsan también desde aquí: en
    // iPhone (Safari y Chrome usan WebKit) a veces no llegaba el pointerdown de
    // un segundo dedo con el otro en el joystick y no se podía cambiar de movimiento.
    cv.addEventListener('touchstart', e => {
      if (e.cancelable) e.preventDefault();
      setActive(true);
      // Todos los dedos de la pantalla son nuevos y el joystick no es de este
      // mismo toque: su dedo se levantó sin avisar (notificaciones, la cortina
      // del sistema). Fuera, y lo coge el dedo nuevo.
      if (stick && stick.touch && performance.now() - stick.t > 100 && e.touches.length === e.changedTouches.length) {
        stick = null;
        const m = missed; missed = null;
        if (m && performance.now() - m.at < 500) take(m.id, m.x, m.y, true);
      }
      for (const t of e.changedTouches) { const b = hit(t.clientX, t.clientY); if (b) press(b); }
    }, { passive: false });
    document.addEventListener('selectstart', e => {
      if (!e.target.closest || !e.target.closest('input, textarea, [contenteditable]')) e.preventDefault();
    });
    addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
  }

  function hit(x, y) {
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (x >= b.x - b.pad && x <= b.x + b.w + b.pad && y >= b.y - b.pad && y <= b.y + b.h + b.pad) return b;
    }
    return null;
  }

  // Un mismo toque llega por touchstart y por pointerdown: se pulsa una sola vez.
  let lastKey = '', lastAt = 0;
  function press(b) {
    const k = Math.round(b.x) + ',' + Math.round(b.y), now = performance.now();
    if (k === lastKey && now - lastAt < 350) return;
    lastKey = k; lastAt = now;
    b.fn();
  }

  function down(e) {
    const touchy = e.pointerType !== 'mouse';
    if (touchy) setActive(true);
    const b = hit(e.clientX, e.clientY);
    if (b) { e.preventDefault(); press(b); return; }
    if (!touchy || !G.Game || G.Game.state !== 'playing') return;
    // Ocupado: se apunta por si el del joystick resulta que ya no está (ver touchstart).
    if (stick) { missed = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now() }; return; }
    if (take(e.pointerId, e.clientX, e.clientY, e.pointerType === 'touch')) e.preventDefault();
  }

  /** Coge el joystick con este dedo (el fijo, sólo si cae cerca). → true si lo ha cogido. */
  function take(id, x, y, touch) {
    const t = performance.now();
    if (fixed()) {
      // Fijo: sólo si el dedo cae cerca del joystick (si no, no hace nada).
      const b0 = stickBase();
      if (Math.hypot(x - b0.x, y - b0.y) > R() * 2.2) return false;
      stick = { id, fixed: true, ox: b0.x, oy: b0.y, x, y, touch, t };
    } else {
      stick = { id, ox: x, oy: y, x, y, touch, t };
    }
    try { cv.setPointerCapture(id); } catch (err) { /* nada */ }
    return true;
  }

  function move(e) {
    if (!stick || e.pointerId !== stick.id) return;
    stick.x = e.clientX; stick.y = e.clientY;
    if (stick.fixed) return;
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy), r = R();
    if (d > r) { stick.ox = stick.x - dx / d * r; stick.oy = stick.y - dy / d * r; }
  }

  function up(e) {
    if (missed && e.pointerId === missed.id) missed = null;
    if (stick && e.pointerId === stick.id) stick = null;
  }
  function reset() { stick = null; missed = null; }

  function setActive(v) {
    if (active === v) return;
    active = v;
    document.body.classList.toggle('touch', v);
  }
  /** Ratón de verdad (no lo que simula el navegador tras un toque) o teclado: modo PC. */
  function usedPointer(e) {
    if (e.pointerType !== 'mouse') { touchAt = performance.now(); return; }
    if (active && (e.type !== 'pointermove' || e.movementX || e.movementY)) toPc(e);
  }
  function toPc(e) {
    if (!active || stick || !e.isTrusted || performance.now() - touchAt < 1000) return;
    setActive(false);
  }

  /** Dirección del joystick (con fuerza 0..1), o null si no se usa. */
  function vector() {
    if (!stick) return null;
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy);
    if (d < 7) return [0, 0];
    // A partir de medio radio ya va a toda velocidad.
    const k = Math.min(1, (d - 7) / (R() * 0.5 - 7));
    return [dx / d * k, dy / d * k];
  }

  /** Márgenes del iPhone (barra de inicio abajo, muesca a los lados), en px. */
  let safe = null;
  function safeArea() {
    if (safe) return safe;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(d);
    const cs = getComputedStyle(d);
    safe = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
             bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    d.remove();
    return safe;
  }
  addEventListener('resize', () => { safe = null; });
  addEventListener('orientationchange', () => { safe = null; });
  function resetSafe() { safe = null; }

  /** El HUD vacía y vuelve a registrar sus botones cada fotograma. */
  function clearButtons() { buttons = []; }
  function addButton(x, y, w, h, fn, pad = 6) { buttons.push({ x, y, w, h, fn, pad }); }

  /** Dibuja el joystick (coordenadas de pantalla, CSS px). */
  function draw(ctx) {
    // El fijo se ve siempre (más tenue sin tocarlo), para saber dónde está.
    const base = !stick && fixed() && active ? stickBase() : null;
    if (!stick && !base) return;
    const s = stick || { ox: base.x, oy: base.y, x: base.x, y: base.y };
    drawStick(ctx, s, R(), base ? 0.55 : 1);
  }
  /**
   * Dibuja un joystick (también lo usa el editor de botones); k: opacidad.
   * Liso, como el resto de la interfaz: base azul noche translúcida con borde
   * claro y un aro interior; pomo amarillo con sombra y un brillo arriba.
   */
  function drawStick(ctx, stick, r, k = 1) {
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy);
    const kx = stick.ox + (d > r ? dx / d * r : dx), ky = stick.oy + (d > r ? dy / d * r : dy), kr = r * 0.42;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, r, 0, 6.2832);
    ctx.fillStyle = 'rgba(11,21,48,.38)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,247,255,.5)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, r * 0.64, 0, 6.2832);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(244,247,255,.16)'; ctx.stroke();
    ctx.globalAlpha = 0.92 * k;
    ctx.beginPath(); ctx.arc(kx, ky + 3, kr, 0, 6.2832);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
    ctx.beginPath(); ctx.arc(kx, ky, kr, 0, 6.2832);
    ctx.fillStyle = '#FFCB05'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,86,0,.6)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(kx - kr * 0.22, ky - kr * 0.3, kr * 0.42, 0, 6.2832);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    ctx.restore();
  }

  return { init, vector, draw, drawStick, clearButtons, addButton, reset, safeArea, resetSafe, spot, stickBase, stickDef, R, STICK_DEF,
           get active() { return active; }, get stick() { return stick; } };
})();
