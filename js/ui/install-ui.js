/* ============ install-ui.js — instalar el juego como app (PWA) ============
 * Abierto desde su icono de la pantalla de inicio se juega a pantalla completa,
 * sin las barras del navegador. Para que se sepa:
 *   - En el móvil, desde el navegador, una vez por aparato: al llegar al menú
 *     sale encima de la lista una tarjeta pequeña («Instálalo como app ·
 *     Pantalla completa y sin barras») con «Cómo» (o «Instalar») y «×». No tapa nada.
 *   - iPhone / iPad: «Cómo» abre los pasos (Compartir › Añadir a pantalla de
 *     inicio › Añadir). Dentro de Instagram, Facebook, TikTok... no se puede:
 *     avisa de abrirlo antes en Safari.
 *   - Android y PC con Chrome o Edge: el navegador avisa de que se puede
 *     instalar (beforeinstallprompt); se guarda ese aviso e «Instalar» abre su
 *     ventana. Sin él, los pasos con el menú del navegador.
 *   - Siempre: Ajustes › Acerca de › «Instalar como app» (botón data-install).
 * Abierto ya como app, o con doble clic (file://), no sale nada.
 */
G.InstallUI = (() => {
  const KEY = 'ps.install.card';                 // ya salió la tarjeta en este aparato
  const ua = navigator.userAgent || '';
  const IOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const ANDROID = /Android/i.test(ua);
  // Navegadores de dentro de otras apps: desde ahí no se puede instalar.
  const INAPP = /Instagram|FBAN|FBAV|FB_IAB|Line\/|WhatsApp|musical_ly|Bytedance|TikTok|Snapchat|GSA\//i.test(ua);
  // iPhone con Chrome, Firefox, Edge...: el botón Compartir está en otro sitio que en Safari.
  const IOS_OTHER = IOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const WEB = /^https?:$/.test(location.protocol);
  let deferred = null;                            // el aviso de instalar de Chrome / Edge
  let card = null, sheet = null;

  const seen = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } };
  const mark = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* nada */ } };

  /** ¿Abierto ya como app? (la pantalla completa del botón de arriba no cuenta) */
  function installed() {
    if (navigator.standalone) return true;
    if (!window.matchMedia) return false;
    if (matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches) return true;
    return matchMedia('(display-mode: fullscreen)').matches && !(document.fullscreenElement || document.webkitFullscreenElement);
  }
  /** ¿Se puede instalar desde aquí? (la fila de Ajustes › Acerca de) */
  function can() { return WEB && !installed() && (IOS || ANDROID || !!deferred); }
  /** ¿Sale la tarjeta del menú? Sólo en el móvil. Chrome y Edge de Android, sólo con su aviso (si no, ya está instalada o no se puede). */
  function wantCard() {
    if (!WEB || installed() || seen()) return false;
    if (IOS) return true;
    return ANDROID && (!!deferred || (!INAPP && !/Chrome\//.test(ua)));
  }

  // ---------------- dibujos (como los del iPhone) ----------------
  const SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  const PIC = {
    share: SVG + '<path d="M8.5 9.5H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1.5"/><path d="M12 2.5v12M8.5 6 12 2.5 15.5 6"/></svg>',
    add: SVG + '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    dots: SVG.replace('fill="none"', 'fill="currentColor"') + '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>'
  };

  // ---------------- tarjeta del menú ----------------
  function showCard() {
    if ((card && card.isConnected) || !wantCard()) return;
    const menu = document.getElementById('scr-menu');
    if (!menu) return;
    card = document.createElement('div');
    card.className = 'install-card';
    card.innerHTML = '<img src="assets/icons/icon-96.png" width="32" height="32" alt="">'
      + '<div class="grow"><b>Instálalo como app</b><small></small></div>'
      + '<button class="btn small install-go" type="button"></button>'
      + '<button class="btn small ghost install-x" type="button" aria-label="Cerrar">×</button>';
    card.querySelector('.install-go').onclick = () => { if (deferred) ask(); else open(); };
    card.querySelector('.install-x').onclick = removeCard;
    refreshCard();
    // Encima de la lista del menú (si el menú cambia de forma, al final de la pantalla).
    const host = menu.querySelector('.menu-right') || menu;
    host.insertBefore(card, host.firstChild);
    mark();
  }
  function refreshCard() {
    if (!card) return;
    card.querySelector('small').textContent = IOS && INAPP ? 'Ábrelo en Safari para instalarlo' : 'Pantalla completa y sin barras';
    card.querySelector('.install-go').textContent = deferred ? 'Instalar' : 'Cómo';
  }
  function removeCard() { if (card) card.remove(); card = null; }

  // ---------------- ventana con los pasos ----------------
  function steps(list) {
    return '<ol class="install-steps">' + list.map(([pic, title, sub]) =>
      `<li><span class="install-pic" aria-hidden="true">${pic}</span><div><b>${title}</b><small>${sub}</small></div></li>`).join('') + '</ol>';
  }
  const WARN = '<div class="install-warn"><b>Estás dentro de otra app: desde aquí no se puede instalar.</b>'
    + '<small>Toca el menú (··· o ⋮) y elige «Abrir en Safari» o «Abrir en el navegador». Después sigue estos pasos.</small></div>';

  function body() {
    if (IOS) {
      return (INAPP ? WARN : '') + steps([
        [PIC.share, 'Pulsa Compartir', IOS_OTHER
          ? 'Está en la barra de la dirección o en el menú «···» del navegador.'
          : 'Está en la barra de Safari, abajo (en el iPad, arriba). Si no lo ves, toca antes «···».'],
        [PIC.add, 'Elige «Añadir a pantalla de inicio»', 'Si no sale, desliza la lista hacia arriba.'],
        ['<span class="install-mock">Añadir</span>', 'Pulsa «Añadir»', 'Deja activado «Abrir como app web». Después abre el juego desde su icono.']
      ]) + (INAPP ? '' : '<p class="note">Ábrelo en Safari si estás dentro de otra app (Instagram, WhatsApp…).</p>')
        + '<p class="note">La app instalada guarda su propia partida: entra con tu cuenta de nombre y contraseña para tener la misma. Con Google sólo se puede entrar desde Safari.</p>';
    }
    if (deferred) {
      return '<p class="sub">Tu navegador puede instalarlo ahora mismo: pulsa Instalar y confírmalo.</p>'
        + '<button class="btn gold big block install-now" type="button">Instalar</button>';
    }
    return (INAPP ? WARN : '') + steps([
      [PIC.dots, 'Abre el menú del navegador', 'El botón ⋮ o ···, arriba o abajo de la pantalla.'],
      [PIC.add, 'Elige «Instalar aplicación» o «Añadir a pantalla de inicio»', 'Según el navegador, puede estar dentro de «Compartir» o de «Añadir página a».'],
      ['<span class="install-mock">Instalar</span>', 'Confirma con «Instalar» o «Añadir»', 'Después abre el juego desde su icono.']
    ]);
  }

  // Hoja estrecha (docs/DISENO.md §4): cabecera con «Cerrar», el icono del juego y el
  // título; debajo, los pasos. En el móvil (de pie y tumbado) ocupa toda la pantalla.
  function open() {
    if (!sheet) {
      const x = G.UI && G.UI.svg ? G.UI.svg('close') : '×';
      sheet = document.createElement('section');
      sheet.id = 'scr-install';
      sheet.className = 'scr dim hidden';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-labelledby', 'install-title');
      sheet.innerHTML = '<div class="box sheet-box narrow install-box">'
        + '<header class="sheet-head">'
        + `<button class="icon-btn" id="install-close" type="button" aria-label="Cerrar" title="Cerrar">${x}</button>`
        + '<img class="install-app" src="assets/icons/icon-96.png" width="48" height="48" alt="">'
        + '<div class="grow"><h2 id="install-title">Instalar como app</h2>'
        + '<p class="sub">Pantalla completa, sin las barras del navegador y con su icono en la pantalla de inicio.</p></div>'
        + '</header><div class="sheet-body install-body"></div></div>';
      sheet.querySelector('#install-close').onclick = close;
      // Tocar fuera de la caja también cierra.
      sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
      document.body.appendChild(sheet);
    }
    const b = sheet.querySelector('.install-body');
    b.innerHTML = body();
    const now = b.querySelector('.install-now');
    if (now) now.onclick = ask;
    b.scrollTop = 0;
    sheet.classList.remove('hidden');
  }
  function close() { if (sheet) sheet.classList.add('hidden'); }
  const isOpen = () => !!sheet && !sheet.classList.contains('hidden');

  /** La ventana de instalar de Chrome / Edge (sólo vale una vez por aviso). */
  async function ask() {
    const ev = deferred;
    if (!ev) { open(); return; }
    deferred = null;
    try {
      ev.prompt();
      const r = await ev.userChoice;
      if (r && r.outcome === 'accepted') { removeCard(); close(); }
    } catch (e) { open(); return; }
    refreshCard();
    if (isOpen()) open();                         // sin el aviso: los pasos a mano
  }

  // El aviso puede llegar en cualquier momento (también antes de entrar).
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();                           // sin la barra de Chrome: se ofrece desde aquí
    deferred = e;
    const menu = document.getElementById('scr-menu');
    if (menu && !menu.classList.contains('hidden')) showCard();
    refreshCard();
    if (isOpen()) open();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    mark();
    removeCard(); close();
    if (G.UI && G.UI.toast) G.UI.toast('¡Instalado! Abre PokéSurvivor desde su icono.', 5000);
  });

  function init() {
    if (!WEB) return;
    // La tarjeta, al llegar al menú (también si se llega más tarde).
    const menu = document.getElementById('scr-menu');
    if (menu) new MutationObserver(() => { if (!menu.classList.contains('hidden')) showCard(); })
      .observe(menu, { attributes: true, attributeFilter: ['class'] });
    // Ajustes › Acerca de › «Instalar como app».
    document.addEventListener('click', e => {
      if (e.target.closest && e.target.closest('[data-install]')) { e.preventDefault(); open(); }
    });
    // Esc cierra esta ventana (y no Ajustes, que está debajo). El botón B del mando pulsa «Cerrar».
    addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); e.preventDefault(); close(); }
    }, true);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();

  return { can, open, close, get isOpen() { return isOpen(); }, get ready() { return !!deferred; } };
})();
