/* ============ gamepad.js — jugar con mando (Xbox, PlayStation, Switch...) ============
 * Gamepad API con la distribución "standard" (la de casi todos los mandos).
 * Se activa o quita en Ajustes > Controles ('gamepad'; vibración: 'padRumble').
 *
 * (mando, 21-11-2026) Los botones se eligen en Ajustes > Controles > Con mando (ajuste 'padMap' = { acción: botón | null },
 * como las teclas en 'keys'). De serie:
 *   En la partida y paseando por la aldea:
 *                   stick izquierdo o cruceta   moverse (no se cambia)
 *                   LB / RB (o LT / RT)         ataque anterior / siguiente          prev / next
 *                   Start (o Back)              pausa · «Ir a…» en la aldea y en tu choza   pause
 *                   A                           abrir cofres (mantenido, el de candado) · entrar y hablar en la aldea ·
 *                                               saltar la animación de Arceus        open
 *                   B                           correr en la aldea                   run
 *                   X                           movimiento Z o mega                  zmove
 *                   (sin botón)                 ataque 1-4                           m1..m4
 *                   stick derecho               apuntar (con "Apuntar a mano" en Accesibilidad; no se cambia)
 *   En menús, cartas y pausa:
 *                   stick o cruceta             mover la selección (recuadro dorado); en una barra (volumen),
 *                                               izquierda / derecha la mueven; colocando un mueble, lo mueven
 *                   A                           pulsar                               ok
 *                   B (o Back)                  atrás / cerrar (como Esc)            back
 *                   LB / RB (o LT / RT)         pestaña anterior / siguiente         tabPrev / tabNext
 *                   Y                           cambiar las cartas (como R) · girar el mueble   reroll
 *                   X                           descartar (como X) · elegir un mueble de tu choza   discard
 *                   stick derecho               desplazar las listas
 * Dos acciones que se usan a la vez (las de la partida, o las de los menús) no comparten botón: al elegir uno ocupado se
 * intercambian. Aceptar, Atrás y Pausa nunca se quedan sin botón.
 *
 * Al usar el mando, el cuerpo lleva la clase 'pad' (vuelve a teclado o táctil al tocarlos): las pistas de teclas
 * (.kbd-hint) se cambian por las del mando (.pad-hint, con el botón elegido) y, en una ventana, ya sale algo seleccionado.
 *
 * Los botones se traducen a las teclas o acciones que ya entiende el juego (G.Input.virtual / virtualAct): así no hay que
 * tocar cada pantalla. En los menús se puede pulsar todo lo que se pulsa con el ratón (lo que tiene cursor de mano).
 *
 * Con varios mandos (Steam, la app de Flydigi... añaden mandos virtuales) se
 * lee el último en el que se ha pulsado o movido algo. Los que no tienen la
 * distribución "standard" (DirectInput, algunos en Firefox) se mueven con el
 * stick (ejes 0 y 1) y con la cruceta, venga como botones o como eje "hat".
 */
G.Pad = (() => {
  const DEAD = 0.25;
  const BT = { UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  // [data-pad]: se puede pulsar aunque no tenga cursor de mano (los Pokémon que aún no tienes).
  const NATIVE = 'button, a[href], input, select, textarea, label[for], [data-pad]';
  let vec = [0, 0], aimVec = [0, 0], aimAt = 0;
  let focus = null, focusScope = null, showing = false, lastPos = null;
  let navDir = null, navT = 0, autoT = 0;
  // Por índice de mando: qué tenía pulsado, cuándo se usó, su eje "hat" y cuánto lleva cada eje en el centro.
  const sigs = [], used = [], hats = [], still = [];
  const prevs = [];   // botones del fotograma anterior, de cada mando (para saber qué se acaba de pulsar)
  let act = -1;       // índice del mando activo

  const enabled = () => G.Settings.get('gamepad') !== false;

  // ---------------- botones elegidos ----------------

  /** Acciones que se pueden cambiar. ctx: 'game' (partida y aldea) o 'ui' (menús); def: botones de serie. */
  const ACTS = {
    prev: { ctx: 'game', def: [4, 6], name: 'Ataque anterior' },
    next: { ctx: 'game', def: [5, 7], name: 'Ataque siguiente' },
    open: { ctx: 'game', def: [0], name: 'Abrir cofres · entrar y hablar en la aldea', s: 'Abrir cofres' },
    zmove: { ctx: 'game', def: [2], name: 'Movimiento Z o mega' },
    pause: { ctx: 'game', def: [9, 8], name: 'Pausa · «Ir a…» en la aldea', s: 'Pausa', need: true },
    run: { ctx: 'game', def: [1], name: 'Correr en la aldea' },
    m1: { ctx: 'game', def: [], name: 'Ataque 1' }, m2: { ctx: 'game', def: [], name: 'Ataque 2' },
    m3: { ctx: 'game', def: [], name: 'Ataque 3' }, m4: { ctx: 'game', def: [], name: 'Ataque 4' },
    ok: { ctx: 'ui', def: [0], name: 'Aceptar', need: true },
    back: { ctx: 'ui', def: [1, 8], name: 'Atrás / cerrar', s: 'Atrás', need: true },
    tabPrev: { ctx: 'ui', def: [4, 6], name: 'Pestaña anterior' },
    tabNext: { ctx: 'ui', def: [5, 7], name: 'Pestaña siguiente' },
    reroll: { ctx: 'ui', def: [3], name: 'Cambiar las cartas · girar el mueble', s: 'Cambiar las cartas' },
    discard: { ctx: 'ui', def: [2], name: 'Descartar cartas · elegir un mueble de tu choza', s: 'Descartar cartas' }
  };
  const LIST = Object.keys(ACTS);
  const NB = 17;                                   // botones de la distribución "standard"
  const DPAD = new Set([12, 13, 14, 15]);          // la cruceta mueve y elige: no se cambia
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const okBtn = b => Number.isInteger(b) && b >= 0 && b < 32 && !DPAD.has(b);

  /** Los botones de cada acción con lo elegido `m` ({ acción: botón | null }): lo elegido manda; lo de serie vale si
   *  nadie del mismo ctx lo ha cogido. → { acción: [botones] } */
  function resolve(m) {
    const out = {}, taken = { game: new Set(), ui: new Set() };
    for (const a of LIST) {
      if (!has(m, a)) continue;
      const b = m[a], t = taken[ACTS[a].ctx];
      if (b === null) out[a] = [];
      else if (okBtn(b) && !t.has(b)) { out[a] = [b]; t.add(b); }
    }
    for (const a of LIST) {
      if (out[a]) continue;
      const t = taken[ACTS[a].ctx];
      out[a] = ACTS[a].def.filter(b => !t.has(b));
      out[a].forEach(b => t.add(b));
    }
    return out;
  }

  /**
   * Pone el botón `b` a la acción `a` sobre lo elegido `m` (no lo cambia).
   * → { map: lo elegido nuevo (null si todo es de serie), other, gave, lost, err }
   *   other: la acción del mismo ctx que lo tenía · gave: el botón que pasa a tener (si era el suyo único) ·
   *   lost: true si se queda sin botón · err: por qué no se puede ('dpad' | 'need' con other).
   */
  function assign(m, a, b) {
    if (!ACTS[a]) return { map: m || null, err: 'act' };
    if (DPAD.has(b)) return { map: m || null, err: 'dpad' };
    if (!okBtn(b)) return { map: m || null, err: 'btn' };
    const eff = resolve(m), k = Object.assign({}, m || {}), c = ACTS[a].ctx, old = eff[a][0];
    let other = null, gave = null, lost = false;
    if (eff[a][0] === b && eff[a].length === 1) return { map: m || null };
    for (const o of LIST) {
      if (o === a || ACTS[o].ctx !== c || !eff[o].includes(b)) continue;
      other = o;
      const rest = eff[o].filter(x => x !== b);
      if (rest.length) { k[o] = rest[0]; break; }
      // Era su único botón: se queda con el que tenía ésta (o sin ninguno, si no es imprescindible).
      if (old === undefined) {
        if (ACTS[o].need) return { map: m || null, err: 'need', other: o };
        k[o] = null; lost = true;
      } else { k[o] = old; gave = old; }
      break;
    }
    k[a] = b;
    // Lo que vuelve a ser como de serie (con sus botones de más) deja de estar elegido.
    for (const o of LIST) if (has(k, o) && k[o] === ACTS[o].def[0]) {
      const t = Object.assign({}, k); delete t[o];
      if (resolve(t)[o][0] === k[o]) delete k[o];
    }
    return { map: Object.keys(k).length ? k : null, other, gave, lost };
  }

  let mapC = null;
  function savedMap() { const m = G.Settings.get('padMap'); return m && typeof m === 'object' && !Array.isArray(m) ? m : null; }
  function map() { return mapC || (mapC = resolve(savedMap())); }
  G.Settings.on(k => { if (k === 'padMap') { mapC = null; paint(); } });

  // ---------------- nombres de los botones ----------------

  /** Cómo se llama cada botón, según el mando (por su nombre: PlayStation, Nintendo o el resto, como Xbox). */
  const NAMES = {
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', '↑', '↓', '←', '→', 'Home'],
    ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS'],
    nin: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', '↑', '↓', '←', '→', 'Home']
  };
  function familyOf(id) {
    id = String(id || '');
    // (El de Xbox también se llama «Wireless Controller»: primero él.)
    if (/xbox|xinput|045e/i.test(id)) return 'xbox';
    if (/054c|playstation|dualsense|dualshock|wireless controller/i.test(id)) return 'ps';
    if (/057e|nintendo|pro controller|joy-?con/i.test(id)) return 'nin';
    return 'xbox';
  }
  let fam = 'xbox', std = true;
  /** Nombre corto de un botón ('A', 'LB', '✕'...); en un mando sin distribución "standard", su número. */
  function btnLabel(b) {
    if (!std) return G.I18n && G.I18n.f ? G.I18n.f('Botón {x}', b + 1) : 'Botón ' + (b + 1);
    return NAMES[fam][b] || 'B' + (b + 1);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
  /** El botón dibujado como en el mando: los cuatro de la derecha redondos y de su color; el resto, una pastilla. */
  function btnGlyph(b) {
    const face = std && b >= 0 && b <= 3 && fam !== 'nin';
    return `<span class="pbtn ${face ? 'pb-' + fam + b : 'pb-sh'}" translate="no">${esc(btnLabel(b))}</span>`;
  }
  /** El nombre del (primer) botón de una acción, o '' si no tiene. */
  function label(a) { const b = (map()[a] || [])[0]; return b === undefined ? '' : btnLabel(b); }
  /** Todos los botones de una acción, dibujados ('' si no tiene). */
  function glyph(a, all) { const l = map()[a] || []; return (all ? l : l.slice(0, 1)).map(btnGlyph).join('<i class="pb-or">/</i>'); }
  /** Pista para poner junto a una .kbd-hint: sólo se ve jugando con mando. */
  function hintHtml(a) { return `<span class="pad-hint" data-pad-act="${a}">${glyph(a)}</span>`; }
  /** La pista de controles del HUD (lienzo), con los botones elegidos. */
  function hint() {
    return G.I18n.f('{x} moverse · {x} / {x} cambiar de ataque · {x} pausa', 'Stick', label('prev') || '—', label('next') || '—', label('pause') || '—');
  }

  // ---------------- con qué se juega: mando, o teclado / ratón / táctil ----------------

  let otherAt = 0, isActive = false;
  const fns = new Set();
  /** ¿Lo último que se ha tocado es el mando? */
  const padNow = () => act >= 0 && (used[act] || -1) > otherAt;
  for (const ev of ['keydown', 'mousemove', 'pointerdown', 'wheel']) {
    addEventListener(ev, e => {
      if (!e.isTrusted || (ev === 'mousemove' && !(e.movementX || e.movementY))) return;
      otherAt = performance.now();
      // Si vuelves al ratón, al teclado o a la pantalla táctil, se quita el recuadro.
      hideFocus();
      sync();
    }, true);
  }
  function sync() {
    const on = enabled() && padNow();
    if (on === isActive) return;
    isActive = on;
    if (document.body) document.body.classList.toggle('pad', on);
    // En el móvil o la tableta, con mando: la interfaz de PC (sin joystick ni botones táctiles; tocar la pantalla la devuelve).
    if (on && G.Touch && G.Touch.active && G.Touch.toPad) G.Touch.toPad();
    paint();
  }
  /** Pone los botones elegidos en las pistas de la página ([data-pad-act]) y avisa a quien quiera saberlo. */
  function paint() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    for (const el of document.querySelectorAll('[data-pad-act]')) el.innerHTML = glyph(el.dataset.padAct);
    fns.forEach(fn => { try { fn(isActive); } catch (e) { /* nada */ } });
  }

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
  addEventListener('gamepaddisconnected', e => { forget(e.gamepad.index); if (!pad()) { hideFocus(); act = -1; sync(); } });

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
    // (11-11-2026) Paseando por la aldea del menú, el mando mueve a tu Pokémon (A: entrar o hablar; Start: «Ir a…»).
    if (G.Village && G.Village.walking()) return false;
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
  const rect = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };

  function setFocus(el) {
    if (focus) focus.classList.remove('pad-focus');
    focus = el;
    focusScope = topScreen();
    if (!el) return;
    el.classList.add('pad-focus');
    showing = true;
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* nada */ }
    lastPos = { scr: focusScope, at: center(el) };
  }
  function hideFocus() {
    if (focus) focus.classList.remove('pad-focus');
    focus = null; showing = false; lastPos = null;
  }

  /** La primera selección de una pantalla: el botón principal, si lo hay (nunca "Volver" o "Cerrar" si hay otra cosa),
   *  y antes lo de la ventana que la barra de arriba. */
  const isBack = el => /(-close|-back)$/.test(el.id) || el.hasAttribute('data-back') || el.getAttribute('data-act') === 'close'
    || /^(Cerrar|Volver|Close|Back)$/i.test(el.textContent.trim() || el.getAttribute('aria-label') || '');
  /** Una ventanita abierta dentro de la pantalla («Ir a…», el editor de tu choza): lo suyo va antes. */
  function innerDialog() {
    const top = topScreen();
    if (!top) return null;
    const d = [...top.querySelectorAll('[role="dialog"]:not(.hidden)')].filter(e => e.getClientRects().length);
    return d[d.length - 1] || null;
  }
  function firstOf(list) {
    const bar = document.getElementById('topbar'), dlg = innerDialog();
    const inDlg = dlg ? list.filter(el => dlg.contains(el)) : [];
    if (inDlg.length) list = inDlg;
    const inWin = list.filter(el => !(bar && bar.contains(el)));
    const rest = (inWin.length ? inWin : list).filter(el => !isBack(el));
    const pool = rest.length ? rest : inWin.length ? inWin : list;
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

  /**
   * El siguiente en una dirección: de los recuadros `rs` ([izq, arriba, der, abajo]), el más cercano a `from` hacia
   * (dx, dy). Antes los que están en línea (se solapan de lado: la fila o la columna), aunque haya otro más cerca en
   * diagonal; si no hay, el más cercano castigando lo que se desvía a los lados. → índice, o -1 si no hay nada por ese lado.
   */
  function pick(from, rs, dx, dy) {
    const fc = [(from[0] + from[2]) / 2, (from[1] + from[3]) / 2];
    let best = -1, bs = Infinity;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i], ax = (r[0] + r[2]) / 2 - fc[0], ay = (r[1] + r[3]) / 2 - fc[1];
      const main = ax * dx + ay * dy;              // avance en la dirección pedida
      if (main <= 4) continue;
      const side = Math.abs(ax * dy - ay * dx);    // desvío hacia los lados
      // En línea: se solapan en el otro eje (más de 2 px).
      const lap = dx ? Math.min(r[3], from[3]) - Math.max(r[1], from[1]) : Math.min(r[2], from[2]) - Math.max(r[0], from[0]);
      const s = (lap > 2 ? 0 : 1e6) + main + side * 2.5;
      if (s < bs) { bs = s; best = i; }
    }
    return best;
  }
  /** El que se desliza (lista con su barra) por encima de `el` y aún puede ir hacia (dx, dy). */
  function scrollerFor(el, dx, dy) {
    for (let s = el && el.parentElement; s && s !== document.body; s = s.parentElement) {
      const cs = getComputedStyle(s);
      if (dy && /(auto|scroll)/.test(cs.overflowY) && (dy > 0 ? s.scrollTop + s.clientHeight < s.scrollHeight - 1 : s.scrollTop > 0)) return s;
      if (dx && /(auto|scroll)/.test(cs.overflowX) && (dx > 0 ? s.scrollLeft + s.clientWidth < s.scrollWidth - 1 : s.scrollLeft > 0)) return s;
    }
    return null;
  }

  function move(dx, dy) {
    let list = candidates();
    if (!list.length) { hideFocus(); return; }
    if (!valid()) { setFocus(firstOf(list)); return; }
    // Si no hay nada más por ese lado pero la lista sigue (lo de debajo, recortado, no cuenta), se desliza y se mira otra vez.
    for (let tries = 0; tries < 4; tries++) {
      const others = list.filter(el => el !== focus);
      const i = pick(rect(focus), others.map(rect), dx, dy);
      if (i >= 0) { setFocus(others[i]); return; }
      const sc = scrollerFor(focus, dx, dy);
      if (!sc) return;
      const by = Math.max(60, (dy ? sc.clientHeight : sc.clientWidth) * 0.5);
      try { sc.scrollTo({ top: sc.scrollTop + dy * by, left: sc.scrollLeft + dx * by, behavior: 'instant' }); }
      catch (e) { sc.scrollTop += dy * by; sc.scrollLeft += dx * by; }
      list = candidates();
    }
  }

  /** Con el mando en la mano y nada seleccionado (se acaba de abrir una ventana o se ha redibujado), elige algo:
   *  lo que haya en el mismo sitio, si sigue la misma pantalla; si no, lo principal. */
  function autoFocus(dt) {
    if ((autoT -= dt) > 0) return;
    autoT = 0.15;
    if (valid()) return;
    const list = candidates();
    if (!list.length) { if (focus) hideFocus(); return; }
    let best = null;
    if (lastPos && lastPos.scr === topScreen()) {
      const [ox, oy] = lastPos.at;
      let bd = Infinity;
      for (const c of list) { const [x, y] = center(c); const d = (x - ox) ** 2 + (y - oy) ** 2; if (d < bd) { bd = d; best = c; } }
      // (Si se acaba de abrir una ventanita, mejor empezar en ella.)
      const dlg = innerDialog();
      if (dlg && !dlg.contains(best) && list.some(el => dlg.contains(el))) best = null;
    }
    setFocus(best || firstOf(list));
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
    lastPos = { scr: topScreen(), at: center(el) };
    el.click();
    // Si al pulsar se redibuja la misma pantalla (un Sí/No de Ajustes), sigue en lo que haya en el mismo sitio; si cambia
    // de pantalla, empieza en la nueva (autoFocus).
    autoT = 0.1;
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

  /** Atrás: colocando un mueble, lo cancela; si no, el botón de cerrar o volver de la ventana, si lo tiene; si no, Esc. */
  function back() {
    if (G.HomeIn && G.HomeIn.placing && G.HomeUI && G.HomeUI.isOpen) { G.HomeIn.cancelPlace(); G.HomeUI.selected(-1); return; }
    const top = topScreen();
    if (top) {
      const btns = [...top.querySelectorAll('button, a')].filter(b => b.getBoundingClientRect().width > 0);
      const close = btns.find(isBack);
      if (close) { close.click(); return; }
    }
    G.Input.virtual('escape');
  }

  /** LB / RB en un menú: la pestaña de al lado (de la fila de pestañas donde está la selección, o la primera que se vea). */
  function tab(d) {
    const top = topScreen();
    if (!top) return;
    const tabs = [...top.querySelectorAll('[role="tab"], .vh-tab')].filter(t => t.getClientRects().length && !t.disabled);
    if (!tabs.length) return;
    const row = (focus && tabs.find(t => t.parentElement.contains(focus))) || tabs[0];
    const mine = tabs.filter(t => t.parentElement === row.parentElement);
    let i = mine.findIndex(t => t.getAttribute('aria-selected') === 'true' || t.classList.contains('on'));
    if (i < 0) i = 0;
    const next = mine[(i + d + mine.length) % mine.length];
    if (next === mine[i]) return;
    const inRow = focus && mine.includes(focus);
    next.click();
    if (inRow && next.isConnected) setFocus(next);
    else { lastPos = null; autoT = 0.1; }
  }

  /** En el editor de tu choza (sin colocar nada): elige el mueble siguiente de la habitación. */
  function cycleFurniture() {
    if (!(G.HomeIn && G.HomeIn.on && G.HomeUI && G.HomeUI.isOpen && G.HomeUI.mode === 'in' && G.Home)) return false;
    const n = (G.Home.room().items || []).length;
    if (!n) return true;
    G.HomeIn.selected = (G.HomeIn.selected + 1 + n) % n;
    G.HomeUI.selected(G.HomeIn.selected);
    return true;
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

  // ---------------- elegir un botón (Ajustes) ----------------

  let grabFn = null, grabFree = false, grabT = 0;
  /** El siguiente botón que se pulse va a fn(índice) y no al juego; fn(null) si pasan 6 s. grab(null) deja de esperar. */
  function grab(fn) { grabFn = fn || null; grabFree = false; grabT = 6; }

  // ---------------- cada fotograma ----------------

  const pressed = b => !!(b && (b.pressed || b.value > 0.5));
  /** Lo llama el bucle del juego antes de mirar las teclas. */
  function poll(dt) {
    const p = enabled() ? pad() : null;
    if (!p) { vec = [0, 0]; aimVec = [0, 0]; prevs.length = 0; if (isActive) sync(); return; }
    const now = p.buttons.map(pressed);
    const was = prevs[p.index] || [];
    const hit = i => now[i] && !was[i];
    // Se apunta lo de todos los mandos: al cambiar de uno a otro no salen pulsaciones de más ni de menos.
    for (const q of navigator.getGamepads()) if (q && q.connected) prevs[q.index] = q === p ? now : q.buttons.map(pressed);
    const f = familyOf(p.id), s = p.mapping === 'standard';
    if (f !== fam || s !== std) { fam = f; std = s; paint(); }
    sync();

    // Eligiendo un botón en Ajustes: primero se sueltan todos (el A que lo ha pedido) y luego vale el siguiente.
    if (grabFn) {
      vec = [0, 0];
      if ((grabT -= dt) <= 0) { const fn = grabFn; grabFn = null; fn(null); return; }
      if (!grabFree) { grabFree = !now.some(Boolean); return; }
      const b = now.findIndex((v, i) => v && !was[i]);
      if (b >= 0) { const fn = grabFn; grabFn = null; fn(b); }
      return;
    }

    let x = p.axes[0] || 0, y = p.axes[1] || 0;
    const m = Math.hypot(x, y);
    if (m < DEAD) x = y = 0;
    else { const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; x *= k; y *= k; }
    if (now[BT.LEFT]) x = -1; else if (now[BT.RIGHT]) x = 1;
    if (now[BT.UP]) y = -1; else if (now[BT.DOWN]) y = 1;
    if (p.mapping !== 'standard') { const h = hatDir(p); if (h >= 0) { x = HAT_X[h]; y = HAT_Y[h]; } }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }

    const M = map();
    const on = a => M[a].some(hit), held = a => M[a].some(i => now[i]);
    if (uiMode()) {
      vec = [0, 0];
      // Colocando un mueble en tu choza: la cruceta lo mueve, A lo deja, Y lo gira y B lo cancela.
      const placing = !!(G.HomeIn && G.HomeIn.placing && G.HomeUI && G.HomeUI.isOpen);
      // Mover la selección: al empujar, y repitiendo si se mantiene.
      const dir = Math.hypot(x, y) < 0.5 ? null : Math.abs(x) > Math.abs(y) ? (x > 0 ? 'r' : 'l') : (y > 0 ? 'd' : 'u');
      const go = placing ? d => G.Input.virtual({ r: 'arrowright', l: 'arrowleft', d: 'arrowdown', u: 'arrowup' }[d]) : step;
      if (dir !== navDir) { navDir = dir; navT = 0.38; if (dir) go(dir); }
      else if (dir && (navT -= dt) <= 0) { navT = 0.14; go(dir); }
      if (isActive && !placing) autoFocus(dt);
      if (on('ok')) { if (placing) G.Input.virtual('enter'); else press(); }
      if (on('back')) back();
      // La pausa (Start) también cierra, si ningún botón de los menús lo usa.
      else if (M.pause.some(i => hit(i) && !LIST.some(a => ACTS[a].ctx === 'ui' && M[a].includes(i)))) G.Input.virtual('escape');
      if (on('tabPrev')) tab(-1);
      if (on('tabNext')) tab(1);
      if (on('reroll')) { if (placing) G.HomeIn.flipGhost(); else G.Input.virtual('keyr'); }
      if (on('discard') && !placing && !cycleFurniture()) G.Input.virtual('keyx');
      const ry = axisR(p, 3);
      if (Math.abs(ry) > DEAD) scrollLists(ry, dt);
    } else {
      if (showing) hideFocus();
      navDir = null;
      vec = [x, y];
      const ax = axisR(p, 2), ay = axisR(p, 3);
      if (Math.hypot(ax, ay) > 0.35) { aimVec = [ax, ay]; aimAt = performance.now(); } else aimVec = [0, 0];
      // Acciones, no teclas: así no depende de las teclas que haya elegido el jugador.
      for (const a of ['prev', 'next', 'zmove', 'm1', 'm2', 'm3', 'm4']) if (on(a)) G.Input.virtualAct(a);
      // Pausa; en tu choza (como en la aldea), «Ir a…» (su botón; con Esc se sale de la choza).
      const go = G.HomeIn && G.HomeIn.on && G.Village && G.Village.walking() && document.getElementById('vil-go');
      if (on('pause')) { if (go) go.click(); else G.Input.virtual('escape'); }
      if (on('open')) { G.Input.virtual('space'); G.Input.virtualAct('open'); }
      if (held('open')) G.Input.virtualHold('open');
      if (held('run')) G.Input.virtualHold('run');            // (17-11-2026) correr en la aldea (village.js running)
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
    poll, rumble, grab, label, glyph, hint, hintHtml, btnLabel, btnGlyph,
    ACTS, LIST, resolve, assign, pick, familyOf,
    /** Los botones de cada acción, ya resueltos ({ acción: [botones] }). */
    map,
    /** Pone el botón b a la acción a y lo guarda. → lo mismo que assign() (sin map). */
    bind(a, b) { const r = assign(savedMap(), a, b); if (!r.err) G.Settings.set('padMap', r.map); return r; },
    reset() { G.Settings.set('padMap', null); },
    /** ¿Se ha elegido algún botón distinto de los de serie? */
    get custom() { return !!savedMap(); },
    /** fn(activo) al pasar del mando al teclado o al revés, y al cambiar los botones. */
    on(fn) { fns.add(fn); },
    /** Vector de movimiento del stick (sólo en la partida). */
    vector() { return vec; },
    /** Stick derecho, si se está empujando: [x, y] o null; y cuándo se usó por última vez. */
    aim() { return aimVec[0] || aimVec[1] ? aimVec : null; },
    get aimAt() { return aimAt; },
    /** ¿Se juega con el mando? (lo último que se ha tocado es el mando, no el teclado, el ratón o la pantalla) */
    get active() { return isActive; },
    /** Lo mismo (nombre de antes). */
    get recent() { return isActive; },
    /** El tipo de mando: 'xbox' (y el resto), 'ps' o 'nin'. */
    get family() { return fam; },
    /** ¿Esperando el botón nuevo en Ajustes? */
    get grabbing() { return !!grabFn; },
    /** Nombre del mando conectado ('' si no hay). */
    get name() { const p = pad(); return p ? p.id || 'Mando' : ''; }
  };
})();
