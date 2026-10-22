/* ============ support-ui.js — "Apoyar el proyecto" ============
 * Botón con un corazón en la barra del menú (sólo si hay cuenta de Ko-fi en
 * js/data/funding.js) y una hoja que explica, con números, a qué va el
 * dinero; «Donar en Ko-fi», en el pie. No se cobra nada dentro del juego: el
 * pago es en Ko-fi. Esc la cierra.
 */
G.SupportUI = (() => {
  const $ = G.UI.$;
  const F = G.Funding;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const val = v => typeof v === 'number'
    ? (Math.round(v * 100) / 100).toLocaleString(G.I18n.locale, { style: 'currency', currency: 'EUR' }) + ' / mes'
    : v;

  function init() {
    const b = $('btn-support');
    if (!F.url) return;                       // aún sin cuenta de Ko-fi: no sale
    b.classList.remove('hidden');
    // El icono y el texto del botón de la barra los pone ui.js (barIcons): aquí sólo el clic.
    b.onclick = open;
    $('sup-close').onclick = close;
    // Esc cierra la ventana (si no hay otra encima) y no llega al juego.
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !isOpen() || !onTop($('scr-support'))) return;
      e.stopPropagation(); e.preventDefault(); close();
    }, true);
  }

  function open() {
    const rows = F.costs.map(([c, v]) => `<div class="list-row"><span class="grow">${esc(c)}</span><b class="sup-val">${esc(val(v))}</b></div>`).join('');
    $('sup-body').innerHTML = `
      <div class="sup-hero">
        <span class="ico-tile l round t-red" aria-hidden="true">${G.Icons.html('heart', 40)}</span>
        <p>PokéSurvivor es y será <b>gratis</b>, sin anuncios ni compras. Si quieres ayudar a que siga en línea, puedes hacer una
        <b>donación voluntaria</b>: todo el dinero se usa para los <b>servidores y el dominio</b>, nada más.</p>
      </div>
      <p class="sup-free">${G.UI.svg('check', 20)}<span>Donar no da ninguna ventaja en el juego.</span></p>
      <h3 class="sup-h">Lo que cuesta mantenerlo</h3>
      <div class="list sup-costs">${rows}</div>
      <p class="note">Cuanta más gente juega, más cuestan los servidores. Lo que sobre se guarda para los gastos de los meses siguientes.</p>`;
    // Pie: «Más información» (si hay páginas) y la acción principal, «Donar en Ko-fi».
    $('sup-foot').innerHTML =
      (window.PS_PAGES ? `<a class="btn ghost" href="${G.I18n.lang === 'en' ? 'en/support/' : 'apoyar/'}" target="_blank">Más información</a>` : '')
      + `<a class="btn gold ic" href="${F.url}" target="_blank" rel="noopener">${G.Icons.html('heart', 20)}<span>Donar en Ko-fi</span></a>`;
    $('sup-body').scrollTop = 0;
    $('scr-support').classList.remove('hidden');
  }
  function close() { $('scr-support').classList.add('hidden'); }
  const isOpen = () => !$('scr-support').classList.contains('hidden');
  /** ¿Es la ventana de más arriba? (con otra encima, Esc es para esa) */
  function onTop(el) {
    const z = s => parseInt(getComputedStyle(s).zIndex, 10) || 0, mine = z(el);
    for (const s of document.querySelectorAll('.scr:not(.hidden)')) if (s !== el && z(s) > mine) return false;
    return true;
  }

  return { init, open, close };
})();
