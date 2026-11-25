/* ============ nav.js — plantillas a pantalla completa con orden fijo para el mando (1.0, bloque B, 24-11-2026) ============
 * Pedido del dueño: «los menús que ocupen toda la pantalla… y la navegación con el mando no es clara: cuando debería
 * pasar una cosa pasa otra». La causa: gamepad.js adivinaba el vecino buscando el más cercano en la pantalla. En las
 * pantallas hechas con las plantillas no se adivina: hay UNA zona con cursor y se recorre en un orden fijo.
 *
 * Las plantillas (CSS en style.css, «Plantillas a pantalla completa»; maquetas en docs/DISENO.md):
 *   1 Menú      columna de botones grandes (↑ ↓; desde abajo vuelve arriba) y a la derecha algo para leer, con
 *               páginas en LB / RB. Pausa, fin de partida.
 *   2 Catálogo  rejilla (→ el siguiente, ↓ una fila; en el borde se para) y ficha para leer. Bloque J.
 *   3 Lista     una sola columna de filas y el detalle de la elegida. Bloque J.
 *   4 Elección  cartas grandes en fila (← →, A elige; X / Y lo de la pantalla). Nivel, objeto y vínculo.
 *
 * Marcado:
 *   <section class="scr fs-scr">            la pantalla (a pantalla completa, opaca: no se ve la partida)
 *   [data-nav]                              la zona con cursor (la primera que se vea). Lo de fuera no recibe el cursor:
 *                                           pestañas con LB / RB, acciones con A / B / X / Y y la barra de abajo.
 *   [data-nav-row]                          (dentro de la zona, opcional) cada fila; si no hay, la zona entera es una.
 *                                           (bloque J) Puede ser el propio botón: una fila de uno.
 *   data-nav-cols="N"                       columnas fijas de la fila o la zona; sin él, las que se vean en su primera línea.
 *   [data-nav-skip]                         no entra en el orden.
 *   .fs-bar                                 la barra de abajo: qué hace cada botón del mando ahí (sólo con mando).
 */
G.Nav = (() => {
  // Lo que se puede elegir dentro de una zona (como NATIVE de gamepad.js, más las cartas).
  const ITEM = 'button, a[href], input, select, textarea, label, [data-pad], .card, [data-nav-item]';

  /**
   * El paso de la cruceta en filas de largos `rows` (p. ej. [3, 2]: tres cartas y dos botones), desde la fila r,
   * columna c, hacia dir ('l' | 'r' | 'u' | 'd'). want: la columna que se quería al bajar o subir (para volver a
   * ella después de pasar por una fila más corta). → [fila, columna]
   *   - Una lista (todas las filas de uno): ↑ ↓ dan la vuelta; ← → no hacen nada.
   *   - Una sola fila: ← → dan la vuelta.
   *   - Una rejilla: en el borde se para. Nunca salta a otra zona.
   */
  function step(rows, r, c, dir, want) {
    const n = rows.length;
    if (!n || r < 0 || r >= n) return [r, c];
    if (dir === 'l' || dir === 'r') {
      const len = rows[r];
      let nc = c + (dir === 'r' ? 1 : -1);
      if (nc < 0 || nc >= len) {
        if (n > 1 || len < 2) return [r, c];
        nc = (nc + len) % len;
      }
      return [r, nc];
    }
    if (dir !== 'u' && dir !== 'd') return [r, c];
    let nr = r + (dir === 'd' ? 1 : -1);
    if (nr < 0 || nr >= n) {
      if (n < 2 || !rows.every(l => l === 1)) return [r, c];
      nr = (nr + n) % n;
    }
    const col = want === undefined || want === null ? c : want;
    return [nr, Math.max(0, Math.min(col, rows[nr] - 1))];
  }

  const shown = el => !!el.getClientRects().length && !el.closest('.hidden, [data-nav-skip]');
  function usable(el) {
    if (el.disabled || !shown(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 3 && r.height > 3;
  }

  /** La zona con cursor de `root` (la pantalla de arriba o su ventanita), o null si no es de las plantillas. */
  function zone(root) {
    if (!root || !root.querySelectorAll) return null;
    for (const z of root.querySelectorAll('[data-nav]')) if (shown(z)) return z;
    return null;
  }

  /** Columnas de una fila sin data-nav-cols: las que caben en su primera línea. */
  function autoCols(its) {
    const top = its[0].getBoundingClientRect().top;
    let n = 0;
    for (const el of its) { if (Math.abs(el.getBoundingClientRect().top - top) > 6) break; n++; }
    return Math.max(1, n);
  }

  /**
   * (1.0, bloque J) Una etiqueta cuenta como lo que manda: la que envuelve un desplegable o un campo, ese desplegable o
   * campo (A lo abre); la de un campo que está en otro sitio («Nombre» del inicio de sesión), nada (ya cuenta el campo).
   * Las de casillas (interruptores) se quedan: se pulsan ellas.
   */
  function pickable(el) {
    if (el.tagName !== 'LABEL') return el;
    const c = el.querySelector('select, textarea, input:not([type=checkbox]):not([type=radio])');
    if (c) return c;
    const t = el.htmlFor && typeof document !== 'undefined' ? document.getElementById(el.htmlFor) : null;
    return t && !/^(checkbox|radio)$/.test(t.type) ? null : el;
  }

  /** Lo elegible de la zona, en filas: [[el, el, el], [el, el]]. */
  function rows(z) {
    if (!z) return [];
    const groups = [...z.querySelectorAll('[data-nav-row]')].filter(shown);
    const out = [];
    for (const g of groups.length ? groups : [z]) {
      // (1.0, bloque J) Una fila puede ser el propio botón (Jugar en «Ir a…»).
      const its = g.matches && g.matches(ITEM) ? (usable(g) ? [g] : [])
        : [...g.querySelectorAll(ITEM)].filter(el => !(el.parentElement && g.contains(el.parentElement.closest(ITEM)))).map(pickable).filter(el => el && usable(el));
      if (!its.length) continue;
      const cols = +g.dataset.navCols || autoCols(its);
      for (let i = 0; i < its.length; i += cols) out.push(its.slice(i, i + cols));
    }
    return out;
  }

  /** Dónde está `el` en las filas: [fila, columna] o null. */
  function locate(rs, el) {
    for (let r = 0; r < rs.length; r++) { const c = rs[r].indexOf(el); if (c >= 0) return [r, c]; }
    return null;
  }

  return { step, zone, rows, locate, ITEM };
})();
