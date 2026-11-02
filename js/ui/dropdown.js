/* ============ dropdown.js — desplegables con el estilo del juego (02-11-2026) ============
 * Los <select> abrían la lista del navegador: en el iPhone, la rueda de iOS, que sale
 * de pie aunque el juego vaya girado (rotate.js) y con el aspecto de iOS. Aquí se
 * intercepta la apertura de TODOS los <select> de la página (también los que se pintan
 * después) y se abre en su lugar una lista propia dentro de <body>, que es lo que va
 * girado: sale tumbada como el resto del juego.
 *
 * El <select> sigue ahí (su aspecto cerrado, su valor, sus opciones y su 'change'), así
 * que el código de cada pantalla no cambia: al elegir se pone selectedIndex y se lanza
 * 'input' y 'change' como haría el navegador.
 *   - ratón: clic en el desplegable (o en su <label>) abre y cierra; fuera, cierra;
 *   - táctil: un toque abre (arrastrar no); la lista se desplaza con el dedo;
 *   - teclado: Intro, Espacio, F4 o Alt+flechas abren; flechas, Inicio, Fin, Re Pág /
 *     Av Pág y la primera letra mueven; Intro o Espacio eligen; Esc o Tab cierran.
 *     Cerrado, las flechas cambian de opción directamente (como el de Windows);
 *   - mando: gamepad.js sigue pasando a la siguiente opción con A.
 * Con giro, getBoundingClientRect() e innerWidth / innerHeight ya hablan en píxeles de
 * la vista (rotate.js) y position: fixed dentro del <body> girado va en esos mismos.
 */
G.Dropdown = (() => {
  let pop = null;              // la lista abierta (div.dd-pop) o null
  let sel = null;              // el <select> al que pertenece
  let opts = [];               // [{ el, i }] filas que se pueden elegir (i = índice en sel.options)
  let act = -1;                // fila resaltada (índice en opts)
  let watch = 0;               // comprobación periódica (el <select> desaparece al cambiar de pantalla)
  let tStart = null;           // toque en curso sobre un desplegable: { sel, x, y }
  let typed = '', typedAt = 0; // buscar tecleando

  /** El <select> que abre un toque o clic en `t` (el propio, o el de su <label>), o null. */
  function selectOf(t) {
    if (!t || !t.closest) return null;
    let s = t.closest('select');
    if (!s) { const l = t.closest('label'); s = l && l.control && l.control.tagName === 'SELECT' ? l.control : null; }
    return s && !s.disabled && !s.multiple && s.size <= 1 ? s : null;
  }
  const inPop = t => !!(pop && t && t.nodeType === 1 && pop.contains(t));

  function fire(s) {
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }
  /** Elige la opción `i` de `s` (avisa sólo si cambia). */
  function choose(s, i) {
    if (i < 0 || i === s.selectedIndex) return;
    s.selectedIndex = i;
    fire(s);
  }

  // ---------------- abrir y cerrar ----------------
  function open(s, byKey) {
    close(false);
    if (!s.options.length) return;               // (aún sin opciones: la pantalla se está pintando)
    sel = s;
    pop = document.createElement('div');
    pop.className = 'dd-pop';
    pop.setAttribute('role', 'listbox');
    pop.setAttribute('translate', 'no');         // los textos ya vienen traducidos del <select>
    const lbl = s.getAttribute('aria-label');
    if (lbl) pop.setAttribute('aria-label', lbl);
    opts = [];
    let group = null;
    for (let i = 0; i < s.options.length; i++) {
      const o = s.options[i];
      if (o.hidden) continue;
      const g = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement : null;
      if (g && g !== group) {
        const h = document.createElement('div');
        h.className = 'dd-group';
        h.textContent = g.label;
        pop.appendChild(h);
      }
      group = g;
      const el = document.createElement('div');
      el.className = 'dd-opt';
      el.setAttribute('role', 'option');
      el.textContent = o.text;
      const off = o.disabled || (g && g.disabled);
      if (off) el.setAttribute('aria-disabled', 'true');
      if (i === s.selectedIndex) { el.classList.add('on'); el.setAttribute('aria-selected', 'true'); }
      if (!off) { el.dataset.k = opts.length; opts.push({ el, i }); }
      pop.appendChild(el);
    }
    document.body.appendChild(pop);
    s.setAttribute('aria-expanded', 'true');
    place();
    const cur = opts.findIndex(o => o.i === s.selectedIndex);
    highlight(cur >= 0 ? cur : byKey ? 0 : -1, true);
    watch = setInterval(() => { if (!sel || !sel.isConnected || sel.disabled || !sel.getClientRects().length) close(false); }, 250);
  }

  /** Coloca la lista debajo del desplegable (o encima si cabe más) y la ajusta a la vista. */
  function place() {
    const r = sel.getBoundingClientRect(), W = innerWidth, H = innerHeight, M = 8, GAP = 4;
    const st = pop.style;
    st.minWidth = Math.round(Math.min(r.width, W - 2 * M)) + 'px';
    st.maxWidth = Math.round(Math.max(Math.min(420, W - 2 * M), r.width)) + 'px';
    st.maxHeight = 'none';
    const h = pop.scrollHeight + 2, w = pop.offsetWidth;
    const below = H - r.bottom - GAP - M, above = r.top - GAP - M;
    const down = h <= below || below >= above;
    const room = Math.max(96, down ? below : above);
    st.maxHeight = Math.floor(room) + 'px';
    st.top = Math.round(down ? r.bottom + GAP : r.top - GAP - Math.min(h, room)) + 'px';
    st.left = Math.round(Math.max(M, Math.min(r.left, W - M - w))) + 'px';
    pop.classList.toggle('up', !down);
  }

  function close(refocus) {
    if (!pop) return;
    const s = sel;
    clearInterval(watch);
    pop.remove();
    pop = null; sel = null; opts = []; act = -1;
    if (s) {
      s.removeAttribute('aria-expanded');
      if (refocus && s.isConnected) s.focus({ preventScroll: true });
    }
  }

  function highlight(k, center) {
    if (act >= 0 && opts[act]) opts[act].el.classList.remove('act');
    act = k;
    if (k < 0 || !opts[k]) return;
    const el = opts[k].el;
    el.classList.add('act');
    // A mano (no scrollIntoView): no debe mover nada más que la lista.
    const top = el.offsetTop, bot = top + el.offsetHeight;
    if (center) pop.scrollTop = top - (pop.clientHeight - el.offsetHeight) / 2;
    else if (top < pop.scrollTop) pop.scrollTop = top;
    else if (bot > pop.scrollTop + pop.clientHeight) pop.scrollTop = bot - pop.clientHeight;
  }
  function pick(k) {
    const s = sel, o = opts[k];
    close(true);
    if (s && o) choose(s, o.i);
  }

  // ---------------- ratón ----------------
  addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (inPop(e.target)) { e.preventDefault(); return; }    // que el <select> no pierda el foco
    const s = selectOf(e.target);
    if (!s) { close(false); return; }
    e.preventDefault();                                     // sin esto se abre la lista del navegador
    s.focus({ preventScroll: true });
    if (pop && sel === s) close(false); else open(s, false);
  }, true);
  // Tocar fuera cierra (y en táctil la lista no se queda encima de la pantalla siguiente).
  addEventListener('pointerdown', e => {
    if (!pop || inPop(e.target) || selectOf(e.target) === sel) return;
    close(false);
  }, true);

  // ---------------- táctil ----------------
  // El navegador abre su selector al soltar el dedo: se corta en touchend (y con él el
  // clic y el foco), salvo si el dedo se arrastró (para desplazar la pantalla).
  addEventListener('touchstart', e => {
    const s = e.touches.length === 1 ? selectOf(e.target) : null;
    tStart = s ? { sel: s, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { capture: true, passive: true });
  addEventListener('touchend', e => {
    const t = tStart; tStart = null;
    if (!t) return;
    const s = selectOf(e.target), c = e.changedTouches[0];
    if (s !== t.sel) return;
    if (e.cancelable) e.preventDefault();
    if (!c || Math.hypot(c.clientX - t.x, c.clientY - t.y) > 12) return;
    if (pop && sel === s) close(false); else open(s, false);
  }, { capture: true, passive: false });
  addEventListener('touchcancel', () => { tStart = null; }, true);

  // Elegir: clic (o toque sin arrastrar) en una fila.
  document.addEventListener('click', e => {
    if (!inPop(e.target)) return;
    const row = e.target.closest('.dd-opt');
    if (row && row.dataset.k != null) pick(+row.dataset.k);
  });
  document.addEventListener('mousemove', e => {
    if (!inPop(e.target)) return;
    const row = e.target.closest('.dd-opt');
    if (row && row.dataset.k != null && +row.dataset.k !== act) highlight(+row.dataset.k, false);
  });

  // ---------------- teclado ----------------
  function step(k, d) {                  // siguiente fila elegible desde k en dirección d (+1 / -1)
    const n = opts.length;
    if (!n) return -1;
    return Math.max(0, Math.min(n - 1, k + d));
  }
  function byLetter(ch) {
    const now = performance.now();
    typed = now - typedAt > 800 ? ch : typed + ch;
    typedAt = now;
    const q = typed.toLowerCase(), n = opts.length, from = typed.length > 1 ? Math.max(act, 0) : act + 1;
    for (let j = 0; j < n; j++) {
      const k = (from + j) % n, o = opts[k];
      if (o.el.textContent.trim().toLowerCase().startsWith(q)) return k;
    }
    return -1;
  }
  addEventListener('keydown', e => {
    const t = document.activeElement;
    if (pop) {
      if (t !== sel && !inPop(t)) { close(false); return; }
      const key = e.key, page = Math.max(1, Math.floor(pop.clientHeight / 40) - 1);
      let k = null;
      if (key === 'ArrowDown') k = act < 0 ? 0 : step(act, 1);
      else if (key === 'ArrowUp') k = act < 0 ? 0 : step(act, -1);
      else if (key === 'Home') k = 0;
      else if (key === 'End') k = opts.length - 1;
      else if (key === 'PageDown') k = step(Math.max(act, 0), page);
      else if (key === 'PageUp') k = step(Math.max(act, 0), -page);
      else if (key === 'Enter' || (key === ' ' && performance.now() - typedAt > 800)) {   // (el espacio, si no se está tecleando un nombre)
        if (act >= 0) pick(act); else close(true);
      } else if (key === 'Escape' || (e.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) || key === 'F4') close(true);
      else if (key === 'Tab') { close(false); return; }       // el foco sigue su camino
      else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const f = byLetter(key); if (f >= 0) k = f; }
      else return;
      e.preventDefault(); e.stopImmediatePropagation();   // (los Esc de cada pantalla también escuchan en window)
      if (k != null && k >= 0) highlight(k, false);
      return;
    }
    // Cerrado, con el foco en un desplegable.
    const s = t && t.tagName === 'SELECT' ? selectOf(t) : null;
    if (!s || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    if (key === 'Enter' || key === ' ' || key === 'F4' || (e.altKey && (key === 'ArrowDown' || key === 'ArrowUp'))) {
      e.preventDefault(); e.stopImmediatePropagation();
      typed = ''; open(s, true);
      return;
    }
    if (e.altKey) return;
    // Flechas y compañía: cambian de opción sin abrir (si no, en Mac se abriría la del navegador).
    const ok = [];
    for (let i = 0; i < s.options.length; i++) { const o = s.options[i]; if (!o.disabled && !o.hidden && !(o.parentElement.tagName === 'OPTGROUP' && o.parentElement.disabled)) ok.push(i); }
    if (!ok.length) return;
    let p = ok.indexOf(s.selectedIndex), q = null;
    if (key === 'ArrowDown' || key === 'ArrowRight') q = p < 0 ? 0 : Math.min(ok.length - 1, p + 1);
    else if (key === 'ArrowUp' || key === 'ArrowLeft') q = p < 0 ? 0 : Math.max(0, p - 1);
    else if (key === 'Home') q = 0;
    else if (key === 'End') q = ok.length - 1;
    else if (key.length === 1 && key !== ' ') {
      const now = performance.now();
      typed = now - typedAt > 800 ? key : typed + key;
      typedAt = now;
      const lq = typed.toLowerCase(), from = typed.length > 1 ? Math.max(p, 0) : p + 1;
      for (let j = 0; j < ok.length; j++) {
        const c = (from + j) % ok.length;
        if (s.options[ok[c]].text.trim().toLowerCase().startsWith(lq)) { q = c; break; }
      }
      if (q == null) return;
    } else return;
    e.preventDefault(); e.stopImmediatePropagation();
    choose(s, ok[q]);
  }, true);

  // Si se desplaza lo de debajo, la lista se cierra; si cambia la ventana (la barra de Safari,
  // girar el móvil), se recoloca.
  addEventListener('scroll', e => { if (pop && !inPop(e.target)) close(false); }, true);
  addEventListener('resize', () => { if (pop && sel.isConnected && sel.getClientRects().length) place(); else close(false); });
  addEventListener('blur', () => close(false));
  document.addEventListener('focusout', e => {
    // El foco se va del desplegable a otra cosa (con el ratón se queda en él).
    if (pop && e.target === sel && e.relatedTarget && !inPop(e.relatedTarget)) close(false);
  });

  return { close, get open() { return !!pop; } };
})();
