/* ============ pad-ui.js — jugar con mando: atajos de cada pantalla y barra de pistas (mando-menus, 22-11-2026) ============
 * gamepad.js mueve la selección, pulsa y cambia de pestaña en cualquier pantalla. Aquí va lo que es de cada una:
 *   first   dónde empieza la selección al abrirla (selectores separados por «;», el primero que haya; también vale
 *           un contenedor: su primer botón)
 *   noBack  B no hace nada ahí (cartas, objeto, resumen final): la barra no lo enseña
 *   x / y   el atajo de X y de Y: { sel: lo que se pulsa, label: lo que dice la barra, key: tecla en vez de pulsar }.
 *           Un desplegable se abre; un campo coge el foco.
 * Y la barra de pistas: con mando, abajo y en pequeño, qué hace cada botón en esa pantalla, con los botones del
 * mando que se usa (Xbox, PlayStation o Switch; los elegidos en Ajustes). Al tocar ratón, teclado o pantalla se va
 * (body.pad, gamepad.js), así que en el móvil sin mando no sale nunca.
 *
 * Atajos de serie (todos se cambian en Ajustes › Controles › Con mando):
 *   A aceptar · B atrás (lo abierto desde «Ir a…» vuelve a «Ir a…») · LB / RB pestaña · LT / RT página de la lista
 *   Start pausa / «Ir a…» · Back (View) «Ir a…» en la aldea, atrás en los menús · stick derecho desplaza
 *   X / Y lo de cada pantalla (abajo).
 */
G.PadUI = (() => {
  const SPEC = {
    // (1.0, bloque J) LB / RB apartado, LT / RT Pokémon, X ×1 / Máx., Y su build.
    'scr-upgrades': {
      first: '#upg-list .upg-buy:not([disabled]); #upg-list',
      x: { sel: '.upg-mode [data-n]:not(.on)', label: '×1 / Máx.' },
      y: { sel: '#upg-build', label: 'Planear build' },
      tabs: 'Apartado',
      lt: { fn: () => G.MenuUI.upgStep(-1), when: () => $n('#upg-mon option') > 1, label: 'Pokémon' },
      rt: { fn: () => G.MenuUI.upgStep(1), when: () => $n('#upg-mon option') > 1, label: 'Pokémon' }
    },
    // (1.0, bloque J) Lista: LB / RB región, X filtros, Y orden; A en un Pokémon entra en su ficha (LB / RB sus pestañas).
    'scr-dex': {
      first: '#dex-detail #dex-pick; #dex-detail .dx-tab.on; #dex-detail .dx-pane; #dex-grid .cell.on; #dex-grid',
      x: { sel: '#dex-more', label: 'Filtros', when: () => !G.MenuUI.dexIn },
      y: { sel: '#dex-sort', label: 'Orden', when: () => !G.MenuUI.dexIn },
      lb: { fn: () => G.MenuUI.dexRegion(-1), when: () => !G.MenuUI.dexIn, label: 'Región' },
      rb: { fn: () => G.MenuUI.dexRegion(1), when: () => !G.MenuUI.dexIn, label: 'Región' }
    },
    'scr-compendium': {
      first: '#cmp-rows .cmp-row.on; #cmp-rows',
      x: { sel: '#cmp-tools select[data-f="type"]', label: 'Tipo' },
      y: { sel: '#cmp-tools select[data-f="fam"]', label: 'Familia' }
    },
    'scr-gacha': {
      first: '#pull-1; #pull-10; #pull-10b',
      x: { sel: '#pull-10', label: 'Tirar ×10' }
    },
    'scr-shop': { first: '.shop-pane .shop-buy:not([disabled]); .shop-pane' },
    'scr-bag': { first: '#bag-foot [data-go-dex]', x: { sel: '#scr-bag .sheet-head [data-go-shop]', label: 'Tienda Kecleon' } },
    // La tirada: B salta la animación y luego cierra.
    'pull-fx': { first: '#pull-close; #pull-again; #pull-skip', back: 'Continuar' },
    'scr-build': { first: '#bld-grid; #bld-plan', y: { sel: '#bld-clear', label: 'Vaciar' } },
    'scr-starters': { first: '#starter-grid .on; #starter-grid', y: { sel: '#starter-ok', label: 'Elegir' } },
    'scr-levelup': {
      noBack: true,
      y: { sel: '#lvl-reroll', key: 'keyr', label: 'Cambiar cartas' },
      x: { sel: '#lvl-discard', key: 'keyx', label: 'Descartar' }
    },
    'scr-pause': {
      first: '#btn-resume',
      x: { sel: '#btn-pause-cmp', label: 'Compendio' },
      y: { sel: '#pause-build', label: 'Planear build' }
    },
    'scr-over': { first: '#btn-again', noBack: true },
    'scr-item': { noBack: true },
    'scr-bond': { noBack: true },
    'scr-lobby': { first: '#lobby-start; #lobby-invite' },
    // (1.0, bloque J) Las demás pantallas, en plantillas (ui/nav.js). ok / back: lo que dice la barra de A y de B;
    // lb / rb / lt / rt: atajos de los gatillos (si no, LB / RB pestañas y LT / RT página).
    'vil-quick': { first: '.vq-item.play', back: 'Cerrar' },
    'vil-home': {
      first: '.vh-item.on; .vh-list', back: 'Cerrar',
      x: { fn() {}, when: () => !!(G.HomeUI && G.HomeUI.isOpen && G.HomeUI.mode === 'in'), label: 'Elegir mueble' },
      y: { sel: '#vil-home [data-act="profile"]', label: 'Tu perfil' }
    },
    'scr-login': { first: '#btn-guest; #btn-auth' },
    'scr-test': { ok: 'Responder', noBack: true },
    'scr-result': { first: '#res-ok', noBack: true },
    'scr-evo': { noBack: true, ok: 'Elegir' }
  };

  /** Cuántos hay (para los «when» de los atajos). */
  function $n(sel) { return typeof document !== 'undefined' && document.querySelectorAll ? document.querySelectorAll(sel).length : 0; }

  // ---------------- barra de pistas ----------------
  let bar = null, last = '', timer = 0;
  const T = s => G.T(s);
  const item = (glyph, label) => (glyph ? `<span class="pb-i">${glyph}<b>${T(label)}</b></span>` : '');
  const g = a => G.Pad.glyph(a);
  const pair = (a, b) => { const x = g(a), y = g(b); return x && y ? x + '<i class="pb-or">/</i>' + y : x || y; };
  const stick = `<span class="pbtn pb-sh pb-dpad" translate="no">✥</span>`;

  /**
   * Lo que hace cada botón ahora, en orden: [[botón(es) dibujado(s), qué hace, a la derecha?], ...].
   * Lo comparten la barra general (#pad-bar) y la de las plantillas (.fs-bar[data-auto], 1.0 bloque J).
   */
  function items(c) {
    if (!c) return [];
    if (c.mode === 'walk') return [[stick, 'Moverse'], [g('open'), 'Entrar · hablar'], [g('run'), 'Correr'], [pair('pause', 'goto'), 'Ir a…']];
    if (c.mode === 'list') return [[stick, 'Mover'], [g('ok'), 'Elegir'], [g('back'), 'Cerrar'], [pair('pageUp', 'pageDown'), 'De 8 en 8']];
    if (c.placing) return [];      // (decorando la choza, la pista va en su ventana)
    const sp = SPEC[c.dialog] || SPEC[c.top];
    const ok = c.focus === 'select' ? 'Abrir' : c.focus === 'text' ? 'Escribir' : c.focus === 'range' ? '' : c.ok || (sp && sp.ok) || 'Aceptar';
    const out = [];
    if (c.focus === 'range') out.push([stick, '← → ajustar']);
    if (ok) out.push([g('ok'), ok]);
    if (!(sp && sp.noBack)) out.push([g('back'), (sp && sp.back) || (c.top === 'scr-pause' ? 'Continuar' : 'Atrás')]);
    if (c.x) out.push([g('discard'), c.x]);
    if (c.y) out.push([g('reroll'), c.y]);
    if (c.lb || c.rb) out.push([pair('tabPrev', 'tabNext'), c.lb || c.rb, true]);
    else if (c.tabs) out.push([pair('tabPrev', 'tabNext'), (sp && sp.tabs) || 'Pestaña', true]);
    if (c.lt || c.rt) out.push([pair('pageUp', 'pageDown'), c.lt || c.rt, true]);
    else if (c.page) out.push([pair('pageUp', 'pageDown'), 'Página', true]);
    return out;
  }
  /** La barra de las plantillas que manda ahora (la de la ventanita abierta o la de la pantalla), o null. */
  function fsBar(c) {
    if (!c || !c.top || typeof document === 'undefined' || !document.getElementById) return null;
    for (const id of [c.dialog, c.top]) {
      const el = id && document.getElementById(id);
      const b = el && el.querySelector && el.querySelector('.fs-bar');
      if (b && b.getClientRects().length) return b;
    }
    return null;
  }
  /** Lo que dice la barra general ahora ('' si no hay nada que decir). */
  function html() {
    const c = G.Pad.context();
    if (!c) return '';
    // (1.0) Las pantallas de las plantillas (ui/nav.js) llevan su propia barra abajo, con los botones del mando.
    const top = c.top && typeof document !== 'undefined' && document.getElementById && document.getElementById(c.top);
    if (c.mode === 'ui' && ((top && top.classList.contains('fs-scr')) || fsBar(c))) return '';
    return items(c).map(([gl, l]) => item(gl, l)).join('');
  }
  /** La barra de una plantilla con data-auto: los botones a la izquierda y las pestañas y páginas a la derecha. */
  function fsHtml(c) {
    const its = items(c), act = ([gl, l]) => (gl ? `<span class="fs-act">${gl}<span>${T(l)}</span></span>` : '');
    return its.filter(i => !i[2]).map(act).join('') + '<span class="fs-sp"></span>' + its.filter(i => i[2]).map(act).join('');
  }
  let lastFs = '', lastFsEl = null;
  function tick() {
    const on = document.body.classList.contains('pad');
    const c = on ? G.Pad.context() : null;
    const fb = c && c.mode === 'ui' ? fsBar(c) : null;
    if (fb && fb.hasAttribute('data-auto')) {
      const fh = fsHtml(c);
      if (fh !== lastFs || fb !== lastFsEl) { fb.innerHTML = fh; lastFs = fh; lastFsEl = fb; }
    }
    const h = on ? html() : '';
    if (h === last) return;
    last = h;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pad-bar';
      bar.className = 'pad-bar';
      bar.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bar);
    }
    bar.innerHTML = h;
    bar.classList.toggle('on', !!h);
  }
  function watch(active) {
    clearInterval(timer);
    if (active) { timer = setInterval(tick, 200); tick(); } else tick();
  }
  if (G.Pad) G.Pad.on(watch);

  return {
    /** Lo de la pantalla (o ventanita) `id`: { first, x, y } o null. */
    spec(id) { return SPEC[id] || null; },
    SPEC,
    /** (Para las pruebas) lo que pondría la barra ahora. */
    html, items, fsHtml
  };
})();
