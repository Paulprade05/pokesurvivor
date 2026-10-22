/* ============ news-ui.js — "Novedades" ============
 * Botón en la barra de arriba que abre la lista de cambios del juego
 * (js/data/changelog.js). Lleva un punto mientras haya algo que no has visto.
 * La ventana es una hoja con una tarjeta por fecha: la más nueva arriba y
 * resaltada, y un punto rojo en las que aún no habías visto. Esc la cierra.
 */
G.NewsUI = (() => {
  const $ = G.UI.$;
  const KEY = 'ps.news.seen';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Clave de una nota: su fecha y cuántas hay ese día hasta ella ('2026-10-22.02'),
  // para que una segunda nota del mismo día también salga como nueva.
  function key(i) {
    const d = G.CHANGELOG[i].d; let n = 0;
    for (let j = i; j < G.CHANGELOG.length; j++) if (G.CHANGELOG[j].d === d) n++;
    return d + '.' + String(n).padStart(2, '0');
  }
  const latest = () => G.CHANGELOG.length ? key(0) : '';
  // Antes se guardaba sólo la fecha (hasta el 22-10-2026): había visto todas las notas
  // de ese día, y del 22-10-2026 sólo existía la primera.
  function seen() {
    let v = ''; try { v = localStorage.getItem(KEY) || ''; } catch (e) { /* nada */ }
    if (!/^\d{4}-\d\d-\d\d$/.test(v)) return v;
    return v + (v < '2026-10-22' ? '.99' : '.01');
  }

  function init() {
    // El icono y el texto del botón de la barra los pone ui.js (barIcons): aquí sólo el clic.
    $('btn-news').onclick = open;
    $('news-close').onclick = close;
    $('news-ico').innerHTML = G.Icons.html('book', 30);
    // Esc cierra la ventana (si no hay otra encima) y no llega al juego.
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !isOpen() || !onTop($('scr-news'))) return;
      e.stopPropagation(); e.preventDefault(); close();
    }, true);
    refresh();
  }
  function refresh() { $('btn-news').classList.toggle('new', seen() < latest()); }

  function fmt(d) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(G.I18n.locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function open() {
    // Historical notes without a complete translation use the existing English
    // version, never a sentence assembled from partially translated fragments.
    const text = pair => G.I18n.lang === 'es' ? pair[0]
      : G.I18n.lang === 'en' || !G.I18n.has(pair[0]) ? pair[1] : G.T(pair[0]);
    // Cada texto ya va en su idioma: translate="no" para que no lo toque i18n.
    const PARTS = [['new', ['Nuevo', 'New']], ['chg', ['Cambios', 'Changes']], ['fix', ['Arreglos', 'Fixes']]];
    // Punto rojo: lo que no habías visto (la primera vez, sólo la más nueva).
    const last = seen(), unseen = (v, i) => last ? key(i) > last : i === 0;
    $('news-body').innerHTML = G.CHANGELOG.map((v, i) =>
      `<article class="news-card${i === 0 ? ' latest' : ''}${unseen(v, i) ? ' unseen' : ''}" translate="no">` +
      `<time class="news-date" datetime="${esc(v.d)}">${esc(fmt(v.d))}</time>` +
      (v.title ? `<h3>${esc(text(v.title))}</h3>` : '') +
      PARTS.filter(([k]) => v[k] && v[k].length).map(([k, lbl]) =>
        `<section class="news-part ${k}"><span class="news-tag">${esc(text(lbl))}</span>` +
        `<ul>${v[k].map(t => `<li>${esc(text(t))}</li>`).join('')}</ul></section>`).join('') +
      '</article>').join('');
    $('news-body').scrollTop = 0;
    $('scr-news').classList.remove('hidden');
    try { localStorage.setItem(KEY, latest()); } catch (e) { /* nada */ }
    refresh();
  }
  function close() { $('scr-news').classList.add('hidden'); }
  const isOpen = () => !$('scr-news').classList.contains('hidden');
  /** ¿Es la ventana de más arriba? (con otra encima, Esc es para esa) */
  function onTop(el) {
    const z = s => parseInt(getComputedStyle(s).zIndex, 10) || 0, mine = z(el);
    for (const s of document.querySelectorAll('.scr:not(.hidden)')) if (s !== el && z(s) > mine) return false;
    return true;
  }

  return { init, open, close };
})();
