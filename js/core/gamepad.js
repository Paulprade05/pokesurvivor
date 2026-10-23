/* ============ gamepad.js — jugar con mando (Xbox, PlayStation, Switch...) ============
 * Gamepad API con la distribución "standard" (la de casi todos los mandos).
 * Se activa o quita en Ajustes > Controles ('gamepad'; vibración: 'padRumble').
 *
 *   En la partida:  stick izquierdo o cruceta   moverse
 *                   LB / RB (o LT / RT)         ataque anterior / siguiente
 *                   Start                       pausa
 *                   A                           saltar la animación de Arceus
 *                   X                           movimiento Z (con su Cristal Z)
 *                   stick derecho               apuntar (con "Apuntar a mano" en Accesibilidad)
 *   En menús, cartas y pausa:
 *                   stick o cruceta             mover la selección (recuadro dorado);
 *                                               en una barra (volumen), izquierda / derecha la mueven
 *                   A                           pulsar
 *                   B                           atrás / cerrar (como Esc)
 *                   Y                           cambiar las cartas (como R)
 *                   stick derecho               desplazar las listas
 *
 * Los botones se traducen a las teclas que ya entiende el juego
 * (G.Input.virtual): así no hay que tocar cada pantalla. En los menús se
 * puede pulsar todo lo que se pulsa con el ratón (lo que tiene cursor de mano).
 *
 * Con varios mandos (Steam, la app de Flydigi... añaden mandos virtuales) se
 * lee el último en el que se ha pulsado o movido algo. Los que no tienen la
 * distribución "standard" (DirectInput, algunos en Firefox) se mueven con el
 * stick (ejes 0 y 1) y con la cruceta, venga como botones o como eje "hat".
 */
G.Pad = (() => {
  const DEAD = 0.25;
  const BT = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  // [data-pad]: se puede pulsar aunque no tenga cursor de mano (los Pokémon que aún no tienes).
  const NATIVE = 'button, a[href], input, select, textarea, label[for], [data-pad]';
  let vec = [0, 0], aimVec = [0, 0], aimAt = 0;
  let focus = null, focusScope = null, showing = false;
  let navDir = null, navT = 0;
  // Por índice de mando: qué tenía pulsado, cuándo se usó, su eje "hat" y cuánto lleva cada eje en el centro.
  const sigs = [], used = [], hats = [], still = [];
  const prevs = [];   // botones del fotograma anterior, de cada mando (para saber qué se acaba de pulsar)
  let act = -1;       // índice del mando activo

  const enabled = () => G.Settings.get('gamepad') !== false;
  /** El mando que se está usando: el último que ha cambiado; si empatan, uno "standard"; si no, el primero. */
  function pad() {
    if (!navigator.getGamepads) return null;
    let best = null, bt = -1, cur = null;
    for (const p of navigator.getGamepads()) {
      if (!p || !p.connected) continue;
      const i = p.index, s = sig(p);
      // La primera vez sólo se apunta cómo está (los gatillos de algunos reposan en -1).
      if (s !== sigs[i]) { if (sigs[i] !== undefined) used[i] = performance.now(); sigs[i] = s; }
      const t = (used[i] || 0) + (p.mapping === 'standard' ? 0.5 : 0);
      if (t > bt) { bt = t; best = p; }
      if (i === act) cur = p;
    }
    // El activo se queda si se ha usado hace nada: un mando y su copia (Steam, apps) no se turnan.
    if (cur && performance.now() - (used[act] || 0) < 200) return cur;
    act = best ? best.index : -1;
    return best;
  }
  /** Lo que tiene pulsado un mando, en un número: botones y ejes (a grandes rasgos, sin el temblor del centro; > 1 es la cruceta "hat" suelta). */
  function sig(p) {
    let s = 0;
    for (let i = 0; i < 20 && i < p.buttons.length; i++) { const b = p.buttons[i]; if (b && (b.pressed || b.value > 0.5)) s += 2 ** i; }
    for (let i = 0; i < 10 && i < p.axes.length; i++) { const v = p.axes[i]; s = s * 5 + (v > 1.05 ? 4 : v < -1.05 ? 3 : v > 0.5 ? 2 : v < -0.5 ? 1 : 0); }
    // La cruceta "hat" se reconoce al verla suelta (fuera de -1..1), aunque aún no sea el mando elegido.
    if (hats[p.index] === undefined && p.mapping !== 'standard') {
      for (let i = 2; i < p.axes.length; i++) if (Math.abs(p.axes[i]) > 1.05) { hats[p.index] = i; break; }
    }
    return s;
  }
  function forget(i) { sigs[i] = used[i] = hats[i] = still[i] = prevs[i] = undefined; }

  addEventListener('gamepadconnected', e => {
    forget(e.gamepad.index);
    if (enabled() && G.UI && G.UI.toast) G.UI.toast('Mando conectado', 2200);
  });
  addEventListener('gamepaddisconnected', e => { forget(e.gamepad.index); if (!pad()) hideFocus(); });

  // ---------------- mandos sin distribución "standard" ----------------

  // Cruceta como eje "hat" (Chrome en Windows, Firefox): en reposo vale más de 1
  // y al pulsar va de -1 (arriba) a 1 en pasos de 2/7, girando como el reloj.
  const HAT_X = [0, 1, 1, 1, 0, -1, -1, -1], HAT_Y = [-1, -1, 0, 1, 1, 1, 0, -1];
  /** Dirección de la cruceta "hat" (0 arriba ... 7 arriba-izquierda), o -1. */
  function hatDir(p) {
    const h = hats[p.index];
    if (h === undefined) return -1;
    const v = p.axes[h];
    return Math.abs(v) <= 1.05 ? (Math.round((v + 1) * 3.5) % 8 + 8) % 8 : -1;
  }
  /**
   * Eje del stick derecho. En un mando no "standard" sólo cuenta si se le ha
   * visto un rato quieto en el centro: los gatillos reposan en -1 y dejaban el
   * apuntado o las listas clavados.
   */
  function axisR(p, i) {
    const v = p.axes[i] || 0;
    if (p.mapping === 'standard') return v;
    const c = still[p.index] || (still[p.index] = new Uint8Array(16));
    if (i < 16 && c[i] < 30) c[i] = Math.abs(v) < 0.15 ? c[i] + 1 : 0;
    return i < 16 && c[i] >= 30 && i !== hats[p.index] ? v : 0;
  }
  // Si vuelves al ratón o a la pantalla táctil, se quita el recuadro.
  for (const ev of ['mousemove', 'pointerdown']) addEventListener(ev, e => { if (e.isTrusted && (e.movementX || e.movementY || ev === 'pointerdown')) hideFocus(); });

  // ---------------- qué pantalla manda ----------------

  /** La pantalla que se ve por encima: la de mayor z-index (Ajustes va por delante de la pausa) y, si empatan, la última. */
  function topScreen() {
    let top = null, tz = -Infinity;
    for (const s of document.querySelectorAll('.scr:not(.hidden)')) {
      const z = parseInt(getComputedStyle(s).zIndex, 10) || 0;
      if (z >= tz) { tz = z; top = s; }
    }
    return top;
  }
  /** En un menú, cartas, pausa o ventana: el mando mueve la selección en vez de al Pokémon. */
  function uiMode() {
    return G.Game.state !== 'playing' || !!topScreen();
  }

  // ---------------- selección en los menús ----------------

  function scopes() {
    const top = topScreen(), out = [];
    const tap = document.getElementById('tap-start');
    if (tap && !tap.classList.contains('hidden')) return [tap];
    if (top) out.push(top);
    // La barra de arriba (Guardar, Ajustes...) cuenta si no hay una ventana encima.
    const bar = document.getElementById('topbar');
    if (bar && !bar.classList.contains('hidden') && (!top || !top.classList.contains('dim'))) out.push(bar);
    return out;
  }

  /** Lo que se puede pulsar ahora: botones, enlaces y lo que tiene cursor de mano. */
  function candidates() {
    const out = [];
    for (const sc of scopes()) {
      if (sc.id === 'tap-start') { out.push(sc); continue; }
      for (const el of sc.querySelectorAll('*')) if (!out.some(o => o.contains(el)) && pressable(el)) out.push(el);
    }
    return out;
  }
  /** ¿Se ve y se puede pulsar? (sin mirar si está dentro de otro que se pulsa) */
  function pressable(el) {
    const W = innerWidth, H = innerHeight;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) return false;
    if (el.disabled) return false;
    let ok = el.matches(NATIVE);
    if (!ok) {
      // El cursor se hereda: sólo cuenta el de más arriba con mano.
      const cs = getComputedStyle(el);
      ok = cs.cursor === 'pointer' && (!el.parentElement || getComputedStyle(el.parentElement).cursor !== 'pointer');
    }
    if (!ok) return false;
    // Que se vea de verdad (no tapado por otra cosa).
    const cx = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    return !(hit && !el.contains(hit) && !hit.contains(el));
  }

  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  function setFocus(el) {
    if (focus) focus.classList.remove('pad-focus');
    focus = el;
    focusScope = topScreen();
    if (!el) return;
    el.classList.add('pad-focus');
    showing = true;
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* nada */ }
  }
  function hideFocus() {
    if (focus) focus.classList.remove('pad-focus');
    focus = null; showing = false;
  }

  /** La primera selección de una pantalla: el botón principal, si lo hay (nunca "Volver" o "Cerrar" si hay otra cosa). */
  const isBack = el => /(-close|-back)$/.test(el.id) || el.hasAttribute('data-back') || /^(Cerrar|Volver|Close|Back)$/i.test(el.textContent.trim());
  function firstOf(list) {
    const rest = list.filter(el => !isBack(el));
    const pool = rest.length ? rest : list;
    const main = pool.find(el => el.matches('.play, .btn.gold, .card'));
    if (main) return main;
    return pool.slice().sort((a, b) => { const [ax, ay] = center(a), [bx, by] = center(b); return (ay - by) || (ax - bx); })[0] || null;
  }

  /** ¿La selección sigue entre lo que se puede pulsar? Igual que candidates().includes(focus), sin recorrer toda la pantalla. */
  function valid() {
    if (!focus || !focus.isConnected || focusScope !== topScreen()) return false;
    for (const sc of scopes()) {
      if (sc.id === 'tap-start') return focus === sc;
      if (focus === sc || !sc.contains(focus)) continue;
      if (!pressable(focus)) return false;
      for (let a = focus.parentElement; a && a !== sc; a = a.parentElement) if (pressable(a)) return false;
      return true;
    }
    return false;
  }

  function move(dx, dy) {
    const list = candidates();
    if (!list.length) { hideFocus(); return; }
    if (!valid()) { setFocus(firstOf(list)); return; }
    const [fx, fy] = center(focus);
    let best = null, bs = Infinity;
    for (const el of list) {
      if (el === focus) continue;
      const [x, y] = center(el);
      const ax = x - fx, ay = y - fy;
      const main = ax * dx + ay * dy;              // avance en la dirección pedida
      if (main <= 4) continue;
      const side = Math.abs(ax * dy - ay * dx);    // desvío hacia los lados
      const s = main + side * 2.5;
      if (s < bs) { bs = s; best = el; }
    }
    if (best) setFocus(best);
  }

  function press() {
    if (!valid()) { const list = candidates(); setFocus(firstOf(list)); return; }
    const el = focus;
    if (el.matches('input[type=range]')) return;          // se mueve con izquierda / derecha
    if (el.matches('select')) {                           // un desplegable no se abre: pasa a la siguiente opción
      el.selectedIndex = (el.selectedIndex + 1) % Math.max(1, el.options.length);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (el.matches('input, select, textarea')) { el.focus(); return; }
    const scr = topScreen(), [ox, oy] = center(el);
    el.click();
    // Si al pulsar se redibuja la misma pantalla (un Sí/No de Ajustes), sigue en
    // lo que haya en el mismo sitio; si cambia de pantalla, empieza en la nueva.
    setTimeout(() => {
      if (!showing || valid()) return;
      const list = candidates();
      if (!list.length) { hideFocus(); return; }
      if (topScreen() !== scr) { setFocus(firstOf(list)); return; }
      let best = null, bd = Infinity;
      for (const c of list) { const [x, y] = center(c); const d = (x - ox) ** 2 + (y - oy) ** 2; if (d < bd) { bd = d; best = c; } }
      setFocus(best);
    }, 120);
  }

  /** Barras (volumen): izquierda / derecha cambian el valor. → true si lo ha hecho. */
  function slide(dir) {
    if (!valid() || !focus.matches('input[type=range]') || (dir !== 'l' && dir !== 'r')) return false;
    const r = focus, min = +r.min || 0, max = r.max === '' ? 100 : +r.max;
    const st = (+r.step || 1) * Math.max(1, Math.round((max - min) / 20 / (+r.step || 1)));
    const v = Math.max(min, Math.min(max, +r.value + (dir === 'r' ? st : -st)));
    if (v === +r.value) return true;
    r.value = v;
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** B: el botón de cerrar o volver de la ventana, si lo tiene; si no, Esc. */
  function back() {
    const top = topScreen();
    if (top) {
      const btns = [...top.querySelectorAll('button, a')].filter(b => b.getBoundingClientRect().width > 0);
      const close = btns.find(isBack);
      if (close) { close.click(); return; }
    }
    G.Input.virtual('escape');
  }

  let scroller = null;
  function scrollLists(dy, dt) {
    let el = valid() ? focus : topScreen();
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) { el.scrollTop += dy * 900 * dt; return; }
      el = el.parentElement;
    }
    const top = topScreen();
    if (!top) return;
    // La lista de la pantalla se busca una vez (mirar todo en cada fotograma daba tirones en la Pokédex).
    if (!(scroller && top.contains(scroller) && scrolls(scroller))) {
      scroller = null;
      for (const s of top.querySelectorAll('*')) if (scrolls(s)) { scroller = s; break; }
    }
    if (scroller) scroller.scrollTop += dy * 900 * dt;
  }
  function scrolls(s) { return /(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight + 2; }

  // ---------------- cada fotograma ----------------

  /** Lo llama el bucle del juego antes de mirar las teclas. */
  function poll(dt) {
    const p = enabled() ? pad() : null;
    if (!p) { vec = [0, 0]; aimVec = [0, 0]; prevs.length = 0; return; }
    const now = p.buttons.map(b => !!(b && (b.pressed || b.value > 0.5)));
    const was = prevs[p.index] || [];
    const hit = i => now[i] && !was[i];
    // Se apunta lo de todos los mandos: al cambiar de uno a otro no salen pulsaciones de más ni de menos.
    for (const q of navigator.getGamepads()) if (q && q.connected) prevs[q.index] = q === p ? now : q.buttons.map(b => !!(b && (b.pressed || b.value > 0.5)));

    let x = p.axes[0] || 0, y = p.axes[1] || 0;
    const m = Math.hypot(x, y);
    if (m < DEAD) x = y = 0;
    else { const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; x *= k; y *= k; }
    if (now[BT.LEFT]) x = -1; else if (now[BT.RIGHT]) x = 1;
    if (now[BT.UP]) y = -1; else if (now[BT.DOWN]) y = 1;
    if (p.mapping !== 'standard') { const h = hatDir(p); if (h >= 0) { x = HAT_X[h]; y = HAT_Y[h]; } }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }

    if (uiMode()) {
      vec = [0, 0];
      // Mover la selección: al empujar, y repitiendo si se mantiene.
      const dir = Math.hypot(x, y) < 0.5 ? null : Math.abs(x) > Math.abs(y) ? (x > 0 ? 'r' : 'l') : (y > 0 ? 'd' : 'u');
      if (dir !== navDir) { navDir = dir; navT = 0.38; if (dir) step(dir); }
      else if (dir && (navT -= dt) <= 0) { navT = 0.14; step(dir); }
      if (hit(BT.A)) press();
      if (hit(BT.B) || hit(BT.BACK)) back();
      if (hit(BT.START)) G.Input.virtual('escape');
      if (hit(BT.Y)) G.Input.virtual('keyr');
      const ry = axisR(p, 3);
      if (Math.abs(ry) > DEAD) scrollLists(ry, dt);
    } else {
      if (showing) hideFocus();
      navDir = null;
      vec = [x, y];
      const ax = axisR(p, 2), ay = axisR(p, 3);
      if (Math.hypot(ax, ay) > 0.35) { aimVec = [ax, ay]; aimAt = performance.now(); } else aimVec = [0, 0];
      // Acciones, no teclas: así no depende de las teclas que haya elegido el jugador.
      if (hit(BT.LB) || hit(BT.LT)) G.Input.virtualAct('prev');
      if (hit(BT.RB) || hit(BT.RT)) G.Input.virtualAct('next');
      if (hit(BT.START) || hit(BT.BACK)) G.Input.virtual('escape');
      if (hit(BT.A)) G.Input.virtual('space');
      if (hit(BT.X)) G.Input.virtualAct('zmove');
    }
  }
  function step(dir) { if (!slide(dir)) move(...{ r: [1, 0], l: [-1, 0], d: [0, 1], u: [0, -1] }[dir]); }

  /** Vibración (0..1, en ms), si el mando y el ajuste lo permiten. */
  function rumble(k, ms = 120) {
    if (!enabled() || G.Settings.get('padRumble') === false) return;
    const p = pad();
    const a = p && p.vibrationActuator;
    if (!a || !a.playEffect) return;
    k = Math.max(0, Math.min(1, k));
    a.playEffect('dual-rumble', { duration: ms, strongMagnitude: k, weakMagnitude: Math.min(1, k * 1.3) }).catch(() => {});
  }

  return {
    poll, rumble,
    /** Vector de movimiento del stick (sólo en la partida). */
    vector() { return vec; },
    /** Stick derecho, si se está empujando: [x, y] o null; y cuándo se usó por última vez. */
    aim() { return aimVec[0] || aimVec[1] ? aimVec : null; },
    get aimAt() { return aimAt; },
    /** Nombre del mando conectado ('' si no hay). */
    get name() { const p = pad(); return p ? p.id || 'Mando' : ''; }
  };
})();
