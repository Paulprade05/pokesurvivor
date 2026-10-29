/* ============ ui.js — utilidades comunes de la interfaz ============
 * - Mostrar / ocultar pantallas.
 * - Sprites animados de PMD dentro de <canvas> del DOM (menú, colección,
 *   gacha...). Se registran aquí y el bucle principal los anima con tick().
 * - Sonidos de interfaz (por delegación: cualquier botón suena solo).
 * - Panel de sonido, avisos (toast), monedas, chips de tipo, estrellas.
 */
G.UI = (() => {
  const $ = id => document.getElementById(id);
  const SCREENS = ['scr-login', 'scr-test', 'scr-result', 'scr-starters', 'scr-menu',
                   'scr-dex', 'scr-upgrades', 'scr-shop', 'scr-bag', 'scr-gacha', 'scr-levelup', 'scr-pause', 'scr-over',
                   'scr-nick', 'scr-friends', 'scr-lobby', 'scr-rank', 'scr-item', 'scr-goals', 'scr-bond', 'scr-mod', 'scr-compendium'];

  function show(id, keepMenu = false) {
    for (const s of SCREENS) if (s !== id && !(keepMenu && s === 'scr-menu')) $(s).classList.add('hidden');
    $(id).classList.remove('hidden');
  }
  function hide(id) { $(id).classList.add('hidden'); }
  function hideAll() { for (const s of SCREENS) $(s).classList.add('hidden'); }
  function isOpen(id) { return !$(id).classList.contains('hidden'); }

  // ---------------- iconos de interfaz (SVG) ----------------
  // Para los controles puros (atrás, cerrar, más, ajustes, sonido...): vectoriales,
  // con trazo redondeado y del color del texto. Lo que es una cosa del juego
  // (monedas, objetos, movimientos, tipos) va con G.Icons (sprites de objetos).
  const SVG = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    more: '<circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    sort: '<path d="M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5V9H15"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 17v.1"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    external: '<path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    // Engranaje: la corona dentada es un trazo grueso a trozos.
    gear: '<circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="12" r="8.4" stroke-width="3.2" stroke-dasharray="3.3 3.3" stroke-dashoffset="1.65" stroke-linecap="butt"/>',
    sound: '<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.6a7.8 7.8 0 0 1 0 10.8"/>',
    mute: '<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    full: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
    news: '<path d="M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    logout: '<path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"/><path d="M14.5 8l4 4-4 4M18.5 12h-9"/>',
    save: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6.2 6.2 0 0 0 6.3 9.6 4.5 4.5 0 0 0 7 18.5z"/><path d="M12 16v-5.5M9.5 13l2.5-2.5 2.5 2.5"/>'
  };
  /** Icono SVG de interfaz como HTML: svg('back'), svg('close', 18). */
  function svg(name, size = 22, cls = '') {
    return `<svg class="ui-svg${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SVG[name] || ''}</svg>`;
  }
  /** Pone su icono a los [data-ico="nombre"] de root que aún no lo tienen (data-ico-size: tamaño). */
  function icons(root = document) {
    root.querySelectorAll('[data-ico]').forEach(el => {
      if (!el.querySelector(':scope > .ui-svg')) el.insertAdjacentHTML('afterbegin', svg(el.dataset.ico, +el.dataset.icoSize || 22));
    });
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- barra de arriba ----------------
  // Botones que inician otros módulos (news-ui, settings-ui y menu.js les ponen
  // su onclick): el icono y el texto (éste sólo se ve en el menú «Más») los pone
  // aquí la barra, una vez y con todos ya iniciados.
  const BAR = [['btn-news', 'news', 'Novedades'], ['btn-full', 'full', 'Pantalla completa'],
               ['btn-settings', 'gear', 'Ajustes'], ['btn-logout', 'logout', 'Salir']];
  let barDone = false;
  function barIcons() {
    if (barDone) return;
    barDone = true;
    for (const [id, ico, txt] of BAR) {
      $(id).innerHTML = svg(ico) + `<span class="lbl">${txt}</span>` + (id === 'btn-news' ? '<i class="dot"></i>' : '');
    }
  }
  /** Menú «Más» (pantallas de menos de 900 px): abre o cierra. */
  function more(on) {
    $('topbar').classList.toggle('more-open', on);
    $('btn-more').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  const moreOpen = () => $('topbar').classList.contains('more-open');

  /** Barra superior (monedas, usuario, sonido) sólo fuera de las runs. */
  function chrome(on) {
    $('topbar').classList.toggle('hidden', !on);
    $('credits-line').classList.toggle('hidden', !on);
    more(false);
    if (!on) $('sound-panel').classList.add('hidden');
    if (on) { barIcons(); refreshCoins(); }
  }

  // Punto de sincronización: verde = guardado en la nube, amarillo = hay cambios
  // sin subir (se suben solos al poco, db.js), rojo = sin conexión. (Desde el
  // 26-10-2026 no hay botón Guardar en la barra: sólo en Ajustes → Cuenta.)
  const TIP = { ok: 'Guardado en la nube', syncing: 'Guardando…', pending: 'Pendiente de subir: se guarda solo en unos segundos',
                offline: 'Sin conexión: se guardará en cuanto vuelva.', local: 'Guardado sólo en este navegador', guest: 'Invitado: no se guarda' };

  function refreshCoins() {
    const s = G.DB.save;
    $('coins').textContent = s ? s.coins.toLocaleString(G.I18n.locale) : '0';
    const ci = $('coins-ico');
    if (!ci.firstChild) ci.innerHTML = G.Icons.html('coin', 20);
    const t = (s && s.tickets) || { t1: 0, t10: 0 };
    $('tickets-pill').innerHTML = `<span class="cur"><span class="cur-ico">${G.Icons.html('ticket', 20)}</span>${t.t1}</span>` +
      `<span class="cur"><span class="cur-ico">${G.Icons.html('ticket10', 20)}</span>${t.t10}</span>`;
    const st = G.DB.guest ? 'guest' : G.DB.syncState;
    const name = esc(G.DB.guest ? G.T('Invitado') : (G.DB.user || ''));
    $('user-pill').innerHTML = G.Icons.html(G.DB.guest ? 'user' : 'crown', 20) + '<span translate="no">' + name + '</span>' +
      `<i class="sync ${st}" title="${TIP[st] || ''}"></i>`;
    $('user-pill').title = TIP[st] || '';
    // En el móvil de pie, el perfil va dentro del menú «Más», con su estado escrito.
    $('tb-profile').innerHTML = svg('user') + `<span class="tbp-txt"><b translate="no">${name}</b>` +
      `<small><i class="sync ${st}"></i>${TIP[st] || ''}</small></span>`;
  }

  /**
   * Sube ya lo pendiente a la nube y lo dice en un aviso (Ajustes → Cuenta: el único
   * botón Guardar desde el 26-10-2026; lo demás se sube solo, ver db.js).
   */
  async function saveNow() {
    const r = await G.DB.saveNow();
    const MSG = { local: 'Tu partida se guarda en este navegador.', guest: 'Como invitado la partida no se guarda.',
                  done: 'Ya está todo guardado en la nube.', offline: 'Sin conexión: se guardará en cuanto vuelva.',
                  fail: 'No se pudo guardar. Vuelve a probar en un momento.' };
    toast(r.why === 'wait' ? G.I18n.f('Se guarda en la nube en {x} s.', r.secs) : r.why ? MSG[r.why] : '¡Partida guardada en la nube!', 3000);
    return r;
  }

  /**
   * Pregunta de sí o no en una ventana del juego (29-10-2026; antes confirm() del sistema, que con el móvil de pie
   * y la vista girada de rotate.js salía de lado). → Promise<boolean>
   * @param text  la pregunta (en español; se traduce aquí, también con nombres: «¿Quitar a {x} de tus amigos?»)
   * @param o     { yes: texto del botón de sí ('Aceptar'), no: el de no ('Cancelar'), danger: el de sí en rojo }
   */
  function ask(text, o = {}) {
    return new Promise(done => {
      const el = document.createElement('section');
      el.className = 'scr dim modal ask-scr';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-modal', 'true');
      el.innerHTML = `<div class="box mcard">
        <p class="mcard-txt"></p>
        <div class="mcard-acts">
          <button class="btn ${o.danger ? 'danger' : 'gold'} big block" type="button" data-a="yes"></button>
          <button class="btn ghost block" type="button" data-a="no" data-back></button>
        </div></div>`;
      el.querySelector('.mcard-txt').textContent = G.T(text);
      el.querySelector('[data-a=yes]').textContent = G.T(o.yes || 'Aceptar');
      el.querySelector('[data-a=no]').textContent = G.T(o.no || 'Cancelar');
      document.body.appendChild(el);
      const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); end(false); } };
      const end = v => { removeEventListener('keydown', onKey, true); el.remove(); done(v); };
      addEventListener('keydown', onKey, true);
      el.querySelector('[data-a=no]').onclick = () => end(false);
      el.querySelector('[data-a=yes]').onclick = () => end(true);
      el.addEventListener('click', e => { if (e.target === el) end(false); });
      // (Si lo de sí no se puede deshacer, el foco va a «Cancelar».)
      setTimeout(() => { const b = el.querySelector(o.danger ? '[data-a=no]' : '[data-a=yes]'); if (b) b.focus({ preventScroll: true }); }, 50);
    });
  }

  let toastEl = null, toastT = 0;
  function toast(msg, ms = 2200) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }

  function typeChips(types) {
    return types.map(t => `<span class="type" style="background:${G.U.TYPE_COLOR[t]}">${G.U.TYPE_NAME[t]}</span>`).join('');
  }

  /** Rareza: la Poké Ball que le corresponde (ver G.Icons.rarity). */
  function stars(n, size = 12) { return G.Icons.rarity(n, size > 16 ? 24 : 12); }

  // ---------------- sonido de la interfaz ----------------

  const CLICKABLE = '.btn, .icon-btn, .tb-btn, .menu-item, .tab, .chip, .card, .cell:not(.locked), .answer, .gen-tab';
  let lastHover = null;

  function wireSounds() {
    document.addEventListener('pointerover', e => {
      const el = e.target.closest(CLICKABLE);
      if (el && el !== lastHover && !el.disabled) G.Audio.sfx('hover');
      lastHover = el;
    });
    document.addEventListener('click', e => {
      const el = e.target.closest(CLICKABLE);
      if (!el) return;
      if (el.disabled) { G.Audio.sfx('error'); return; }
      // Los botones con su propio sonido (comprar, tirar, elegir...) lo ponen ellos.
      if (el.dataset.sfx === 'none') return;
      G.Audio.sfx(el.matches('[data-back]') ? 'back' : el.dataset.sfx || 'click');
    }, true);
  }

  /** Controles de volumen (se usan en la barra superior y en la pausa). */
  function soundControls(box) {
    const st = G.Audio.settings;
    box.innerHTML = `
      <div class="snd-row">${G.Icons.html('sound', 18)}<span>Música</span>
        <input type="range" min="0" max="100" value="${Math.round(st.music * 100)}" data-k="music"></div>
      <div class="snd-row">${G.Icons.html('sound', 18)}<span>Efectos</span>
        <input type="range" min="0" max="100" value="${Math.round(st.sfx * 100)}" data-k="sfx"></div>
      <button class="btn small ${st.muted ? 'gold' : ''}" data-mute>${st.muted ? 'Activar sonido' : 'Silenciar todo'}</button>`;
    box.querySelectorAll('input[type=range]').forEach(r => {
      r.oninput = () => G.Audio.setVolume(r.dataset.k, r.value / 100);
      r.onchange = () => G.Audio.sfx('click');
    });
    box.querySelector('[data-mute]').onclick = () => { G.Audio.toggleMute(); soundControls(box); refreshSoundIcon(); };
  }

  function refreshSoundIcon() {
    $('btn-sound').innerHTML = svg(G.Audio.settings.muted ? 'mute' : 'sound') + '<span class="lbl">Sonido</span>';
  }

  // ---------------- aviso legal ----------------

  const CONTACT = 'jpieratorregrosa@gmail.com';
  const REPO = 'https://github.com/Paulprade05/pokesurvivor';
  let legalBack = null;

  function openLegal() {
    legalBack = SCREENS.find(s => isOpen(s)) || null;
    const ico = $('legal-ico');
    if (ico && !ico.firstChild) ico.innerHTML = G.Icons.html('cleanse-tag', 30);
    $('legal-mail').textContent = CONTACT;
    $('legal-mail').href = 'mailto:' + CONTACT + '?subject=Pok%C3%A9Survivor';
    $('legal-repo').textContent = REPO.replace('https://', '');
    $('legal-repo').href = REPO;
    const canDelete = G.DB.loggedIn && !G.DB.guest;
    $('legal-delete').disabled = !canDelete;
    $('legal-del-msg').textContent = canDelete ? '' : 'Inicia sesión para poder borrar tu cuenta.';
    $('legal-body').scrollTop = 0;
    $('scr-legal').classList.remove('hidden');
  }

  /** ¿Es la ventana de más arriba? (con otra encima, Esc es para esa) */
  function onTop(el) {
    const z = s => parseInt(getComputedStyle(s).zIndex, 10) || 0, mine = z(el);
    for (const s of document.querySelectorAll('.scr:not(.hidden)')) if (s !== el && z(s) > mine) return false;
    return true;
  }

  /**
   * "¿Seguro que quieres borrar la cuenta?" en una ventana pequeña (.mcard, por
   * encima de Ajustes, el aviso legal e Instalar). Las cuentas de nombre y
   * contraseña escriben su contraseña (Firebase pide confirmar quién eres);
   * las de Google la confirman en la ventana de Google al seguir.
   * Esc, «Cancelar» (botón B del mando) o tocar fuera cancelan.
   * Devuelve { pass } o null si se cancela.
   */
  function confirmDelete() {
    const pw = !!G.DB.nameAccount;
    return new Promise(done => {
      const el = document.createElement('section');
      el.id = 'scr-delacc';
      el.className = 'scr dim';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-labelledby', 'delacc-title');
      el.innerHTML = `<div class="box mcard">
        <span class="ico-tile l round t-red mcard-ico" aria-hidden="true">${G.Icons.html('ban', 60)}</span>
        <h2 id="delacc-title">Borrar cuenta</h2>
        <p class="mcard-txt">${pw ? 'Se borrarán tu cuenta y toda tu partida, para siempre. Para confirmarlo, escribe tu contraseña.'
          : 'Se borrarán tu cuenta y toda tu partida, para siempre. ¿Seguro?'}</p>
        ${pw ? '<input class="field" type="password" maxlength="64" autocomplete="current-password" aria-label="Contraseña" placeholder="Contraseña">' : ''}
        <div class="mcard-acts">
          <button class="btn danger big block" type="button" data-a="yes">Borrar para siempre</button>
          <button class="btn ghost block" type="button" data-a="no" data-back>Cancelar</button>
        </div></div>`;
      document.body.appendChild(el);
      const inp = el.querySelector('input');
      const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); end(null); } };
      const end = v => { removeEventListener('keydown', onKey, true); el.remove(); done(v); };
      addEventListener('keydown', onKey, true);
      el.querySelector('[data-a=no]').onclick = () => end(null);
      el.querySelector('[data-a=yes]').onclick = () => { if (!inp || inp.value) end({ pass: inp ? inp.value : '' }); else inp.focus(); };
      el.addEventListener('click', e => { if (e.target === el) end(null); });
      if (inp) inp.onkeydown = e => { if (e.key === 'Enter' && inp.value) end({ pass: inp.value }); };
      // Con contraseña, al campo; si no, a «Cancelar» (Intro no borra nada sin querer).
      setTimeout(() => (inp || el.querySelector('[data-a=no]')).focus(), 50);
    });
  }

  function closeLegal() { $('scr-legal').classList.add('hidden'); }

  function wireLegal() {
    document.addEventListener('click', e => {
      if (e.target.closest('[data-legal]')) { e.preventDefault(); openLegal(); }
    });
    $('legal-close').onclick = closeLegal;
    // Esc cierra el aviso legal (no Ajustes, que puede estar debajo).
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !isOpen('scr-legal') || !onTop($('scr-legal'))) return;
      e.stopPropagation(); e.preventDefault(); closeLegal();
    }, true);
    $('legal-delete').onclick = async () => {
      const ok = await confirmDelete();
      if (!ok) return;
      $('legal-delete').disabled = true;
      const r = await G.DB.deleteAccount(ok.pass);
      if (!r.ok) { $('legal-del-msg').textContent = r.error; $('legal-delete').disabled = false; return; }
      closeLegal();
      toast('Cuenta borrada');
      G.Audio.music(null);
      G.Flow.toLogin();
    };
  }

  function initChrome() {
    G.Icons.installCss();
    wireLegal();
    icons();
    G.DB.onSync(() => { if (!$('topbar').classList.contains('hidden')) refreshCoins(); });
    // Menú «Más»: se abre con ⋯ y se cierra al elegir algo, al tocar fuera o con Esc.
    $('btn-more').innerHTML = svg('more');
    $('btn-more').onclick = () => more(!moreOpen());
    $('tb-menu').addEventListener('click', e => { if (e.target.closest('button')) more(false); });
    $('tb-profile').onclick = () => $('user-pill').click();
    // Tocar fuera cierra el menú «Más» y el panel de sonido (en la captura: antes
    // de que el panel se redibuje y el toque deje de estar «dentro»).
    document.addEventListener('click', e => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (moreOpen() && !t.closest('#tb-menu, #btn-more')) more(false);
      const p = $('sound-panel');
      if (!p.classList.contains('hidden') && !t.closest('#sound-panel, #btn-sound')) p.classList.add('hidden');
    }, true);
    // Esc con el menú abierto sólo lo cierra (no vuelve atrás en la pantalla de debajo).
    addEventListener('keydown', e => { if (e.key === 'Escape' && moreOpen()) { e.stopPropagation(); more(false); } }, true);
    // Móvil tumbado: las monedas y los tickets van en la misma franja que la cabecera de
    // cada hoja, a su derecha (style.css, 4c); la cabecera les deja su ancho (--tb-w).
    const wal = document.querySelector('#topbar .tb-wallet');
    if (wal && window.ResizeObserver) {
      new ResizeObserver(() => document.documentElement.style.setProperty('--tb-w', Math.ceil(wal.getBoundingClientRect().width) + 'px')).observe(wal);
    }
    wireSounds();
    refreshSoundIcon();
    $('btn-sound').onclick = () => {
      const p = $('sound-panel');
      p.classList.toggle('hidden');
      if (!p.classList.contains('hidden')) soundControls(p);
    };
  }

  /*
   * La misma cuenta abierta en otra pestaña (db.js, VARIAS PESTAÑAS): aviso por
   * encima de todo (#scr-othertab, z 150) hasta que se pulse «Jugar aquí».
   */
  let tabEl = null;
  function otherTab(on) {
    if (!on) { if (tabEl) tabEl.classList.add('hidden'); return; }
    if (!tabEl) {
      tabEl = document.createElement('section');
      tabEl.id = 'scr-othertab';
      tabEl.className = 'scr dim';
      tabEl.setAttribute('role', 'alertdialog');
      tabEl.setAttribute('aria-labelledby', 'othertab-title');
      tabEl.innerHTML = `<div class="box mcard">
        <img class="mcard-app" src="assets/icons/icon-192.png" width="64" height="64" alt="">
        <h2 id="othertab-title">El juego está abierto en otra pestaña</h2>
        <p class="mcard-txt">Sólo se puede jugar en una pestaña a la vez, para no mezclar tu partida. No se pierde nada.</p>
        <div class="mcard-acts"><button class="btn gold big block" type="button">Jugar aquí</button></div></div>`;
      tabEl.querySelector('button').onclick = () => G.DB.takeOver();
      document.body.appendChild(tabEl);
    }
    tabEl.classList.remove('hidden');
    // En solitario, la partida se pausa (en grupo los demás siguen).
    if (G.Game && G.Game.state === 'playing' && !(G.Coop && G.Coop.active)) G.Game.togglePause();
  }

  // ---------------- sprites en canvas del DOM ----------------

  const live = new Set();
  const byCanvas = new WeakMap();      // canvas -> su animación (para no recorrer todas)
  // Sólo se animan los canvas que están a la vista (la colección tiene cientos).
  const seen = new WeakMap();
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => seen.set(e.target, e.isIntersecting)), { rootMargin: '80px' })
    : null;

  /**
   * Anima un Pokémon dentro de un <canvas>.
   * opts: { anim='Idle', dir=0, shiny, silhouette, lively (ataca de vez en
   *         cuando), spin (va girando), shadow=true,
   *         scale=2   tamaño de píxel FIJO (×2 como en el juego): todos los
   *                   Pokémon de una vista salen con el mismo píxel, aunque
   *                   los gigantes no quepan enteros
   *         hero      vista de un solo Pokémon: puede reducir la escala para
   *                   que quepa, porque ahí no se compara con nada }
   */
  function sprite(cv, dex, opts = {}) {
    const prev = byCanvas.get(cv);
    if (prev) live.delete(prev);
    const a = new G.Sprites.Animator(dex, 1, !!opts.shiny);
    a.dir = opts.dir || 0;
    a.loop(opts.anim || 'Idle');
    const s = { cv, ctx: cv.getContext('2d'), a, dex, opts, t: Math.random() * 3, spinT: 0, sparkT: 0 };
    live.add(s);
    byCanvas.set(cv, s);
    if (io) io.observe(cv);
    return s;
  }

  function tick(dt) {
    for (const s of live) {
      if (!s.cv.isConnected) { live.delete(s); if (io) io.unobserve(s.cv); continue; }
      if (s.cv.offsetParent === null) continue;            // pantalla oculta
      if (io && seen.get(s.cv) === false) continue;         // fuera de la vista
      s.a.update(dt);

      if (s.opts.lively) {
        s.t -= dt;
        if (s.t <= 0) { s.t = G.U.rand(2.5, 4.5); s.a.play(G.U.pick(['Attack', 'Shoot', 'Charge'])); }
      }
      if (s.opts.spin) {
        s.spinT += dt;
        if (s.spinT > 1.4) { s.spinT = 0; s.a.dir = (s.a.dir + 7) % 8; }
      }

      const { cv, ctx } = s;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingEnabled = false;

      // Escala entera para que los píxeles queden nítidos.
      const m = G.Sprites.animMeta(s.dex, 'Idle');
      const ay = m ? m.ay : 24;
      let k = s.opts.scale || 2;
      if (s.opts.hero) k = Math.max(1, Math.min(k, Math.floor(cv.height * 0.8 / ay)));
      s.a.scale = k / G.Sprites.PX;
      // Si no cabe de pie, se centra el cuerpo en el recuadro.
      const big = ay * k > cv.height * 0.8;
      const fx = cv.width / 2, fy = big ? cv.height / 2 + ay * k * 0.45 : cv.height * 0.88;

      if (s.opts.shadow !== false && !s.opts.silhouette) {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.ellipse(fx, fy, 9 * k, 3.4 * k, 0, 0, 6.2832); ctx.fill();
      }
      if (s.opts.silhouette) {
        ctx.save();
        ctx.filter = 'brightness(0)';
        ctx.globalAlpha = 0.55;
        s.a.draw(ctx, fx, fy);
        ctx.restore();
      } else {
        s.a.draw(ctx, fx, fy);
      }

      // Recolor (opts.hueSwap = [de, a, nuevo tono]): los píxeles con un tono entre
      // `de` y `a` pasan a `nuevo` (el Kecleon morado de la tienda: sin sprite shiny quieto).
      if (s.opts.hueSwap) hueSwap(ctx, cv, s.opts.hueSwap);

      // Centelleos alrededor de los shiny: cada uno nace en un sitio al azar.
      if (s.opts.shiny && !s.opts.silhouette && s.opts.twinkle !== false) {
        s.tw = s.tw || [];
        s.sparkT -= dt;
        if (s.sparkT <= 0 && s.tw.length < 4) {
          s.sparkT = G.U.rand(0.18, 0.45);
          s.tw.push({ x: fx + G.U.rand(-0.32, 0.32) * cv.width, y: G.U.rand(0.12, 0.7) * cv.height, t: 0, life: G.U.rand(0.5, 0.8) });
        }
        for (let i = s.tw.length - 1; i >= 0; i--) {
          const w = s.tw[i];
          w.t += dt;
          if (w.t >= w.life) { s.tw.splice(i, 1); continue; }
          G.Icons.twinkle(ctx, w.x, w.y, w.t / w.life, Math.max(2, k));
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Cambia el tono de los píxeles entre h0 y h1 (grados) por h2, con su luz y saturación. */
  function hueSwap(ctx, cv, [h0, h1, h2]) {
    const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
      if (c < 0.12) continue;                                   // grises: igual
      let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
      h = (h * 60 + 360) % 360;
      if (h < h0 || h > h1) continue;
      const l = (mx + mn) / 2, sat = c / (1 - Math.abs(2 * l - 1));
      // HSL -> RGB con el tono nuevo.
      const C = (1 - Math.abs(2 * l - 1)) * sat, X = C * (1 - Math.abs((h2 / 60) % 2 - 1)), m = l - C / 2;
      const [R, G2, B] = h2 < 60 ? [C, X, 0] : h2 < 120 ? [X, C, 0] : h2 < 180 ? [0, C, X] : h2 < 240 ? [0, X, C] : h2 < 300 ? [X, 0, C] : [C, 0, X];
      d[i] = (R + m) * 255; d[i + 1] = (G2 + m) * 255; d[i + 2] = (B + m) * 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Crea un <canvas> con un sprite animado (para rejillas). */
  function spriteCanvas(dex, w, h, opts) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    sprite(cv, dex, opts);
    return cv;
  }

  return { $, show, hide, hideAll, isOpen, chrome, refreshCoins, toast, ask, typeChips, stars, confirmDelete, saveNow, REPO,
           sprite, spriteCanvas, tick, initChrome, soundControls, hueSwap, otherTab, svg, icons,
           /** ¿Está puesto el aviso de «abierto en otra pestaña»? (bloquea teclado y mando) */
           tabBlocked: () => !!tabEl && !tabEl.classList.contains('hidden') };
})();
