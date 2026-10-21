/* ============ input.js — teclado y ratón (el táctil está en touch.js y el mando en gamepad.js) ============
 * Las teclas son el código físico (e.code en minúsculas): en un teclado francés
 * la tecla de la W es la Z, y ZQSD funciona sin tocar nada.
 * Teclas que se pueden cambiar (Ajustes > Controles, ajuste 'keys' = { acción: código }):
 *   m1-m4 ataque 1-4 · prev / next ataque anterior / siguiente · pause pausa ·
 *   up / down / left / right teclas de más para moverse.
 * Esc siempre pausa y cierra, WASD y las flechas siempre mueven y las cartas
 * de nivel siempre van con 1-4 (y el clic).
 */
G.Input = (() => {
  const down = new Set();
  const pressed = new Set();   // se limpia cada frame
  const vacts = new Set();     // acciones pulsadas con el mando (se limpia cada frame)
  const vkeys = new Set();     // teclas que simula el mando (Esc, Espacio, R): valen para tap(), no para act()
  let mx = 0, my = 0, mdown = false;

  const MOVE_KEYS = {
    up: ['keyw', 'arrowup'], down: ['keys', 'arrowdown'],
    left: ['keya', 'arrowleft'], right: ['keyd', 'arrowright']
  };
  const MOVE_SET = new Set([].concat(...Object.values(MOVE_KEYS)));
  const ACTIONS = ['m1', 'm2', 'm3', 'm4', 'prev', 'next', 'pause', 'up', 'down', 'left', 'right'];
  const DEF_KEYS = { m1: ['digit1', 'numpad1'], m2: ['digit2', 'numpad2'], m3: ['digit3', 'numpad3'], m4: ['digit4', 'numpad4'],
    prev: ['keyq'], next: ['keye', 'tab'], pause: ['keyp'], up: [], down: [], left: [], right: [] };

  // (El autorrelleno de Chrome manda keydown sin code ni key.)
  function code(e) { return (e.code || e.key || '').toLowerCase(); }

  /** ¿Escribe en un campo (buscador, contraseña...) o usa una barra o un desplegable? Entonces las teclas son suyas. */
  function typing(e) {
    const t = e.target;
    if (!t || !t.closest) return false;
    const el = t.isContentEditable ? t : t.closest('input, textarea, select');
    // Uno escondido no cuenta (al cerrar la pausa con una barra de volumen elegida).
    if (!el || !el.getClientRects().length) return false;
    // Una barra (volumen) sólo se queda las flechas, Inicio, Fin y Re Pág / Av Pág.
    return el.type !== 'range' || /^(arrow|home$|end$|page)/.test(code(e));
  }

  // ---------------- teclas elegidas ----------------

  // Lo que pone en cada tecla según la distribución del teclado (sólo Chrome y Edge lo dicen).
  // Las letras que no son latinas (ruso, griego...) no: esas teclas llevan también la latina.
  let layout = {};
  try {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then(m => {
        const o = {};
        m.forEach((v, k) => { if (!/\p{L}/u.test(v) || /\p{Script=Latin}/u.test(v)) o[k.toLowerCase()] = v; });
        layout = o; eff = null;
      }).catch(() => {});
    }
  } catch (e) { /* nada */ }

  const NAMES = { space: 'Espacio', enter: 'Intro', numpadenter: 'Intro', tab: 'Tab', escape: 'Esc', backspace: '⌫',
    capslock: 'Bloq Mayús', shiftleft: 'Mayús', shiftright: 'Mayús', controlleft: 'Ctrl', controlright: 'Ctrl',
    altleft: 'Alt', altright: 'Alt Gr', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    insert: 'Ins', delete: 'Del', home: 'Home', end: 'End', pageup: 'PgUp', pagedown: 'PgDn',
    backquote: '`', minus: '-', equal: '=', bracketleft: '[', bracketright: ']', backslash: '\\', semicolon: ';',
    quote: "'", comma: ',', period: '.', slash: '/', intlbackslash: '<',
    numpadadd: 'Num +', numpadsubtract: 'Num -', numpadmultiply: 'Num *', numpaddivide: 'Num /', numpaddecimal: 'Num .' };
  const BY_LAYOUT = /^(key.|backquote|minus|equal|bracketleft|bracketright|backslash|semicolon|quote|comma|period|slash|intlbackslash)$/;

  /** Nombre corto de una tecla para enseñarlo ('keyz' -> 'Z', 'space' -> 'Espacio'); '—' si no hay. */
  function codeLabel(c) {
    if (!c) return '—';
    const l = BY_LAYOUT.test(c) && layout[c];
    if (l) { const u = l.toUpperCase(); return u.length === 1 ? u : l; }
    if (NAMES[c]) return NAMES[c];
    const m = /^(key|digit|numpad)(.)$/.exec(c);
    if (m) return (m[1] === 'numpad' ? 'Num ' : '') + m[2].toUpperCase();
    const b = c.replace(/(left|right)$/, '');
    return b.charAt(0).toUpperCase() + b.slice(1);
  }

  function saved() {
    const k = G.Settings.get('keys');
    return k && typeof k === 'object' && !Array.isArray(k) ? k : null;
  }
  const usable = c => typeof c === 'string' && c.length > 0 && c.length < 40 && c === c.toLowerCase() && c !== 'escape' && !MOVE_SET.has(c);

  // Lo calculado de las teclas (se rehace al cambiar el ajuste): códigos de cada
  // acción, su nombre, las pistas y todas las teclas que usa el juego.
  let eff = null, labels = {}, moveCodes = MOVE_KEYS, custom = new Set(), gameKeys = new Set(), hintText = '';
  G.Settings.on(k => { if (k === 'keys') eff = null; });

  function binds() {
    if (eff) return eff;
    const k = saved(), out = {}, taken = new Set();
    // Las elegidas a mano mandan; las de serie sólo si nadie más las ha cogido.
    for (const a of ACTIONS) {
      if (!k || !Object.prototype.hasOwnProperty.call(k, a)) continue;
      const c = k[a];
      if (c === null) out[a] = [];
      else if (usable(c) && !taken.has(c)) { out[a] = [c]; taken.add(c); }
    }
    custom = new Set(taken);
    for (const a of ACTIONS) if (!out[a]) out[a] = DEF_KEYS[a].filter(c => !taken.has(c));
    moveCodes = {};
    for (const d in MOVE_KEYS) moveCodes[d] = MOVE_KEYS[d].concat(out[d]);
    labels = {};
    for (const a of ACTIONS) labels[a] = codeLabel(out[a][0]);
    gameKeys = new Set(['escape', 'keyr', 'space', 'enter', 'digit1', 'digit2', 'digit3', 'digit4', 'numpad1', 'numpad2', 'numpad3', 'numpad4', ...MOVE_SET]);
    for (const a of ACTIONS) out[a].forEach(c => gameKeys.add(c));
    const sl = ['m1', 'm2', 'm3', 'm4'].map(a => labels[a]);
    hintText = moveLabel() + ' moverse  ·  ' + (sl.join() === '1,2,3,4' ? '1-4' : sl.join(' ')) + ' / ' + labels.prev + ' / ' + labels.next
      + ' o clic en un ataque para cambiarlo  ·  Esc pausa';
    return (eff = out);
  }
  /** WASD con lo que pone en esas teclas ('ZQSD' en un teclado francés). */
  function moveLabel() { return ['keyw', 'keya', 'keys', 'keyd'].map(codeLabel).join(''); }

  /**
   * Pone la tecla `c` a la acción `a`. Si otra acción la tenía, se intercambian.
   * Devuelve '' o el motivo por el que no se puede.
   */
  function bind(a, c) {
    if (!DEF_KEYS[a] || !c || c === 'escape') return '';
    if (MOVE_SET.has(c)) return 'Esa tecla ya sirve para moverte';
    const b = binds(), k = Object.assign({}, saved()), old = b[a][0] || null;
    for (const o of ACTIONS) {
      if (o === a || b[o][0] !== c) continue;
      // Si era la principal de otra acción, esa se queda con la que tenía ésta.
      if (old) k[o] = old;
      else if (Object.prototype.hasOwnProperty.call(k, o)) k[o] = null;
    }
    k[a] = c;
    // La de serie vuelve a ser "de serie" (con su gemela del teclado numérico, o Tab).
    for (const o of ACTIONS) if (k[o] === (DEF_KEYS[o][0] || null)) delete k[o];
    G.Settings.set('keys', Object.keys(k).length ? k : null);
    return '';
  }

  // Ajustes: la siguiente tecla que se pulse es para cambiar una acción (no llega al juego).
  let grabFn = null;

  addEventListener('keydown', e => {
    const c = code(e);
    if (grabFn) {
      e.preventDefault();
      if (e.repeat) return;
      const f = grabFn; grabFn = null; f(c);
      return;
    }
    // Escribiendo en un campo: ni moverse ni atajos (Esc sí, para cerrar).
    if (c !== 'escape' && typing(e)) return;
    if (!down.has(c)) pressed.add(c);
    down.add(c);
    // Evita que el navegador haga scroll con flechas/espacio durante el juego.
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space', 'tab'].includes(c)) e.preventDefault();
    // Y que haga lo suyo con una tecla elegida (la / abre la búsqueda en Firefox), salvo con Ctrl, Alt o Cmd.
    // Sólo jugando: en los menús Intro y compañía siguen como siempre.
    else if (!e.ctrlKey && !e.altKey && !e.metaKey && G.Game && G.Game.state === 'playing' && (binds(), custom.has(c))) e.preventDefault();
  });
  addEventListener('keyup', e => down.delete(code(e)));
  addEventListener('blur', () => { down.clear(); });
  let movedAt = 0;               // última vez que se movió el ratón (apuntado a mano)
  addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; movedAt = performance.now(); });
  addEventListener('mousedown', () => mdown = true);
  addEventListener('mouseup', () => mdown = false);

  function any(list, set) {
    for (let i = 0; i < list.length; i++) if (set.has(list[i])) return true;
    return false;
  }

  return {
    /** Vector de movimiento del jugador (teclado, joystick táctil o mando). */
    axis() {
      const t = G.Touch && G.Touch.vector();
      if (t && (t[0] || t[1])) return t;
      const g = G.Pad && G.Pad.vector();
      if (g && (g[0] || g[1])) return g;
      const mk = (binds(), moveCodes);
      let x = 0, y = 0;
      if (any(mk.left, down)) x -= 1;
      if (any(mk.right, down)) x += 1;
      if (any(mk.up, down)) y -= 1;
      if (any(mk.down, down)) y += 1;
      return G.U.norm(x, y);
    },
    held(c) { return down.has(c); },
    /** true sólo en el frame en que se pulsó. */
    tap(c) { return pressed.has(c) || vkeys.has(c); },
    /** true en el frame en que se pulsó la tecla de una acción ('m1'..'m4', 'prev', 'next', 'pause'), o desde el mando. */
    act(a) { return vacts.has(a) || any(binds()[a] || [], pressed); },
    /** Una pulsación que no viene del teclado (el mando): cuenta como tecla en este fotograma. */
    virtual(c) { vkeys.add(c); },
    /** Lo mismo con una acción: el mando no depende de las teclas elegidas. */
    virtualAct(a) { vacts.add(a); },
    /** Nombre de la tecla de una acción ('Q', '1', 'Espacio'...), o '—' si no tiene. */
    keyLabel(a) { binds(); return labels[a] || '—'; },
    codeLabel, moveLabel, bind,
    resetKeys() { G.Settings.set('keys', null); },
    /** La pista de teclas del HUD, con las teclas elegidas. */
    hint() { binds(); return hintText; },
    /** La siguiente tecla que se pulse va a fn(código) y no al juego (null: deja de esperar). */
    grab(fn) { grabFn = fn || null; },
    /** ¿Es una tecla del juego pulsada fuera de un campo de texto? (touch.js vuelve al modo PC) */
    gameKey(e) { return !typing(e) && (binds(), gameKeys.has(code(e))); },
    mouse() { return { x: mx, y: my, down: mdown }; },
    /** Cuándo se movió el ratón por última vez (performance.now). */
    get mouseMovedAt() { return movedAt; },
    /** Dónde apunta el ratón en el mundo (el lienzo ocupa toda la ventana). */
    mouseWorld() { return { x: G.Camera.left() + mx / G.Camera.scale, y: G.Camera.top() + my / G.Camera.scale }; },
    endFrame() { pressed.clear(); vkeys.clear(); vacts.clear(); }
  };
})();
