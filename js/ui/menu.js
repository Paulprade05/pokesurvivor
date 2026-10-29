/* ============ menu.js — menú principal, Pokédex (antes «colección») y mejoras ============ */
G.MenuUI = (() => {
  const $ = G.UI.$;
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  let dexGen = 1, dexSel = null;
  // Filtros de la Pokédex (se combinan): tengo / me faltan, rarezas (varias),
  // shiny, favoritos, tipo y búsqueda; y el orden. Duran mientras no recargas.
  const DEX0 = () => ({ status: 'all', rar: new Set(), shiny: false, fav: false, type: '', q: '', sort: 'num' });
  let dexF = DEX0();
  const SORTS = [['num', 'Nº'], ['name', 'Nombre'], ['rar', 'Rareza'], ['new', 'Recién conseguidos'], ['used', 'Más usados']];

  function init() {
    const ICON = { play: 'ball', dex: 'book', upgrades: 'up', shop: 'shop', bag: 'bag', gacha: 'ball4', goals: 'medal3', friends: 'friends', rank: 'trophy', settings: 'gear',
                   compendium: 'cards' };
    // Tocar el compañero (su escenario o su nombre) abre su ficha en la Pokédex.
    for (const id of ['menu-stage', 'menu-partner-name']) {
      const el = $(id);
      el.classList.add('to-dex'); el.setAttribute('role', 'button'); el.tabIndex = 0;
      el.setAttribute('aria-label', G.T('Ver en la Pokédex'));
      el.onclick = () => { G.Audio.sfx('click'); openPartner(); };
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
    }
    document.querySelectorAll('#scr-menu [data-go]').forEach(b => {
      // Icono del objeto a 30 px (escala entera), dentro de su baldosa redonda (style.css).
      b.insertAdjacentHTML('afterbegin', `<span class="mi-ico" aria-hidden="true">${G.Icons.html(ICON[b.dataset.go], 30)}</span>`);
      b.dataset.sfx = b.dataset.go === 'play' ? 'confirm' : 'click';
      b.onclick = () => {
        const go = b.dataset.go;
        if (go === 'play') { if (G.Social.room) G.LobbyUI.open(); else G.Flow.play(); }
        else if (go === 'dex') openDex();
        else if (go === 'upgrades') openUpgrades();
        else if (go === 'shop') G.ShopUI.open();
        else if (go === 'bag') G.ShopUI.openBag();
        else if (go === 'gacha') G.GachaUI.open();
        else if (go === 'goals') G.GoalsUI.open();
        else if (go === 'friends') G.FriendsUI.open();
        else if (go === 'rank') G.RankingUI.open();
        else if (go === 'settings') G.SettingsUI.open();
        else if (go === 'compendium') G.CompendiumUI.open();     // (26-10-2026, compendium-ui.js)
      };
    });
    // Sólo los «Volver» de las cabeceras de hoja: otros data-back (p. ej. «Ahora no» de
    // recuperar la cuenta) son para Esc y el botón B, y ya tienen su propio clic.
    document.querySelectorAll('.sheet-head [data-back]').forEach(b => { b.onclick = open; });
    // Pokédex: «Volver» (y Esc) cierra primero el panel de filtros y, en el móvil, la ficha.
    $('scr-dex').querySelector('[data-back]').onclick = back;
    G.Social.on(() => { if (G.UI.isOpen('scr-menu')) socialLine(); });
    // Al girar el móvil o cambiar el tamaño de la ventana, los escenarios (compañero,
    // ficha de la colección, Mejoras) cambian de tamaño: sus lienzos se ajustan.
    let fitQ = 0;
    addEventListener('resize', () => {
      if (fitQ) return;
      fitQ = requestAnimationFrame(() => {
        fitQ = 0;
        if (G.UI.isOpen('scr-dex')) fitBig(false);
        else if (G.UI.isOpen('scr-upgrades')) fitUpg(false);
        else if (G.UI.isOpen('scr-menu')) { fitPartner(false); fitTiles(); }
      });
    });
    // (Y cuando acaba de cargar la letra: con la de reserva, más estrecha, todo cabía.)
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { if (G.UI.isOpen('scr-menu')) fitTiles(); });
    // Móvil tumbado ↔ de pie: las casillas de la Pokédex cambian de tamaño (lienzos enteros, no estirados).
    const onCompact = () => { if (G.UI.isOpen('scr-dex')) { renderGrid(true); showDetail.last = null; showDetail(dexSel); } };
    if (COMPACT.addEventListener) COMPACT.addEventListener('change', onCompact); else if (COMPACT.addListener) COMPACT.addListener(onCompact);
    $('btn-logout').onclick = async () => {
      if (G.DB.guest && !(await G.UI.ask('Eres invitado: se perderá todo el progreso. ¿Salir?', { yes: 'Salir', danger: true }))) return;
      G.Audio.music(null);
      G.DB.logout().then(() => G.Flow.toLogin());
    };
  }

  // ---------------- menú principal ----------------

  /*
   * Móvil tumbado (29-10-2026): si una palabra del nombre de una baldosa no cabe en su sitio («Compendio»,
   * «Leaderboard» a 667x375), su letra baja un poco (hasta 11 px) en vez de partirse a media palabra.
   */
  let fitProbe = null;
  function fitTiles() {
    const els = document.querySelectorAll('#scr-menu .menu-item.tile .mi-t'), on = matchMedia('(max-height: 520px)').matches;
    for (const el of els) {
      if (!el.clientWidth) continue;             // (sin dibujar, p. ej. tapado por otra pantalla: se queda como está)
      if (!on) { el.style.fontSize = ''; continue; }
      // Cada palabra, medida aparte en una copia invisible (en una línea y con la letra de la regla, no la de ahora).
      if (!fitProbe) { fitProbe = document.createElement('span'); fitProbe.className = 'mi-t'; fitProbe.setAttribute('aria-hidden', 'true'); }
      fitProbe.style.cssText = 'position:absolute;left:0;top:0;display:inline;white-space:nowrap;visibility:hidden;pointer-events:none';
      el.parentNode.appendChild(fitProbe);
      let big = 0;
      for (const word of el.textContent.trim().split(/\s+/)) { fitProbe.textContent = word; big = Math.max(big, fitProbe.getBoundingClientRect().width); }
      const px = parseFloat(getComputedStyle(fitProbe).fontSize), w = el.clientWidth;
      fitProbe.remove();
      el.style.fontSize = big > w + 0.5 ? Math.max(11, Math.floor(px * w / big * 10) / 10) + 'px' : '';
    }
  }

  let partner = null;            // compañero del menú: { dex, shiny }
  /**
   * El canvas del compañero mide lo mismo que su escenario (#menu-stage, que
   * cambia de tamaño con la pantalla): así cada píxel del sprite son píxeles
   * enteros de pantalla. force: volver a ponerlo aunque no haya cambiado.
   */
  function fitPartner(force) {
    if (!partner) return;
    const box = $('menu-stage'), cv = $('menu-partner');
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    if (!force && cv.width === w && cv.height === h) return;
    cv.width = w; cv.height = h;
    // (26-10-2026) Cada pocos segundos hace algo distinto al azar: atacar, saltar, girar,
    // posar, comer, echarse una siesta... con las animaciones que tenga (G.Sprites.reel).
    // Lo que cabe por encima de sus pies (en píxeles de arte; G.UI.sprite le pone los pies
    // al 88 % del alto): lo que suba más, como un salto alto, se baja para no cortarse.
    const s = G.UI.sprite(cv, partner.dex, { lively: false, scale: Math.max(2, Math.floor(h / 34)), hero: true, shiny: partner.shiny });
    G.Sprites.reel(s.a, () => h * 0.88 / (s.a.scale * G.Sprites.PX));
  }

  function open() {
    const s = G.DB.save;
    const mon = G.DEX_BY[s.partner];
    const shiny = !!s.partnerShiny && G.DB.ownsShiny(mon.dex);
    G.UI.chrome(true);
    G.UI.show('scr-menu');
    bagLine();
    partner = { dex: mon.dex, shiny };
    fitPartner(true);
    requestAnimationFrame(fitTiles);
    $('menu-stage').style.setProperty('--stage-c', shiny ? '#9ae6ff' : G.U.TYPE_COLOR[mon.types[0]]);
    $('menu-stage').classList.toggle('shiny', shiny);
    $('menu-partner-name').innerHTML = mon.name + (shiny ? ' ' + G.Icons.html('shiny', 24) : '');
    $('menu-partner-info').innerHTML = G.UI.typeChips(mon.types) + ' ' + G.UI.stars(mon.rarity);
    // Normal / shiny a mano, aquí mismo (en el móvil no se encontraba en la ficha).
    const seg = $('menu-shiny');
    seg.classList.toggle('hidden', !G.DB.ownsShiny(mon.dex));
    seg.lastChild.innerHTML = G.Icons.html('shiny', 12) + ' Shiny';
    seg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', (b.dataset.v === '1') === shiny);
      b.onclick = () => {
        if ((b.dataset.v === '1') === shiny) return;
        s.partnerShiny = b.dataset.v === '1';
        G.DB.commit();
        G.Audio.sfx('confirm');
        open();
      };
    });

    // Pokédex: una entrada por familia (su forma final, data/families.js).
    const owned = G.Fam.owned(s), shinies = G.Fam.shinies(s);
    $('menu-dex-count').textContent = `${owned} / ${G.Fam.total()}` + (shinies ? ` · ${shinies} shiny` : '');

    // Estadísticas: cuatro cifras grandes con su nombre debajo.
    const st = s.stats, cell = (v, label) => `<div class="ms"><b>${v}</b><span>${label}</span></div>`;
    $('menu-stats').innerHTML =
      cell(st.runs, 'Runs') + cell(G.U.mmss(st.bestTime), 'Mejor tiempo') + cell(st.bestLevel, 'Mejor nivel') +
      cell(st.totalKills.toLocaleString(G.I18n.locale), 'Derrotados') +
      (G.DB.guest ? '<p class="ms-guest">Modo invitado: no se guarda</p>' : '');

    socialLine();
    // Premios de misiones por recoger.
    G.Progress.checkAch();
    const pend = G.Progress.pending();
    $('menu-goals-sub').textContent = pend ? pend + (pend === 1 ? ' premio por recoger' : ' premios por recoger') : 'Misiones, logros y perfil';
    $('menu-goals-sub').classList.toggle('gold', pend > 0);
    // Con cuenta en la nube: amigos en línea, invitaciones y (una vez) el apodo.
    if (G.DB.online && !G.Social.started) {
      G.Social.start().then(r => {
        if (r === 'need-nick' && !G.NickUI.skipped && G.UI.isOpen('scr-menu')) G.NickUI.open();
        socialLine();
      });
    }
    G.InvitePop.refresh();
  }

  /** Texto bajo "Mochila": cuántos objetos y MT llevas. */
  function bagLine() {
    const s = G.DB.save, sum = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
    const items = sum(s.bag), tms = sum(s.tms);
    $('menu-bag-sub').textContent = items || tms ? G.I18n.f('Objetos: {x} · MT: {x}', items, tms) : G.T('Vacía');
  }

  /** Texto bajo "Amigos" y "Jugar": quién está en línea, solicitudes, sala. */
  function socialLine() {
    const room = G.Social.room;
    const play = document.querySelector('#scr-menu [data-go=play] small');
    if (play) play.textContent = room ? 'Volver a tu sala (' + room.members.length + '/' + G.Social.MAX_PLAYERS + ')' : 'Entra en la mazmorra';
    const fr = G.Social.friends;
    const req = fr.filter(f => f.status === 'in').length;
    const parts = [];
    if (req) parts.push(req + (req === 1 ? ' solicitud' : ' solicitudes'));
    $('menu-friends-sub').textContent = parts.length ? parts.join(' · ') : 'Juega en grupo, hasta 4';
    $('menu-friends-sub').classList.toggle('gold', req > 0);
  }

  // ---------------- Pokédex (antes «colección»; rehecha el 26-10-2026) ----------------
  // Hoja (dev.html, #scr-dex): cabecera (título, cuántos tienes y, en el ordenador, las
  // regiones en pestañas); la lista (una fila de herramientas, el panel de filtros que se
  // abre debajo y la rejilla) y la ficha (#dex-detail). Una entrada por familia: su forma
  // final (data/families.js); las preevoluciones y sus estadísticas, en la ficha.
  // Ficha: el Pokémon a la izquierda (o arriba) con su compañero, y cuatro pestañas:
  // Resumen, Evolución, Ataques y Récords. Diseño: style.css, «pantallas: coleccion».

  const mq = q => (window.matchMedia ? matchMedia(q) : { matches: false });
  // Móvil (tumbado o de pie): la ficha ocupa toda la hoja en vez de ir al lado de la lista.
  const NARROW = mq('(max-width: 760px) and (min-height: 521px), (max-height: 520px)');
  // Móvil (de pie y tumbado, modo compacto de style.css): casillas más pequeñas (su lienzo, no estirado con CSS).
  const COMPACT = mq('(max-width: 599px), (max-height: 520px)');
  const TABS = [['info', 'Resumen'], ['evo', 'Evolución'], ['moves', 'Ataques'], ['recs', 'Récords']];
  let dexTab = 'info', panelOn = false, listTop = 0;
  const sheetOn = () => NARROW.matches && $('scr-dex').classList.contains('detail-open');
  const pad3 = d => String(d).padStart(3, '0');
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fam = () => G.Fam && G.Fam.ready();
  /** Las entradas de la Pokédex: las formas finales. */
  const dexAll = () => (fam() ? G.Fam.FINALS.map(d => G.DEX_BY[d]) : G.DEX);
  /** La entrada de dex (si es una preevolución, su forma final). */
  const entryOf = dex => (fam() && G.DEX_BY[dex] && !G.Fam.isFinal(dex) ? G.Fam.finalsOf(dex)[0] : dex);

  /** Lo que se desplaza en la lista: la rejilla sola (pantallas altas) o la columna entera (bajas). */
  function listScroller() {
    const grid = $('dex-grid');
    return getComputedStyle(grid).overflowY === 'visible' ? $('dex-list') : grid;
  }
  /** Abre o cierra la ficha a pantalla completa (móvil); al cerrarla, la lista sigue donde estaba. */
  function sheet(on) {
    const scr = $('scr-dex');
    if ((on && !NARROW.matches) || on === scr.classList.contains('detail-open')) return;
    if (on) listTop = listScroller().scrollTop;
    scr.classList.toggle('detail-open', on);
    if (on) $('dex-detail').scrollTop = 0; else listScroller().scrollTop = listTop;
  }
  /** Desliza una fila de pestañas lo justo para que se vea el (sin mover nada más). */
  function keepInView(strip, el) {
    if (!el) return;
    const r = el.getBoundingClientRect(), s = strip.getBoundingClientRect();
    if (r.left < s.left) strip.scrollLeft -= s.left - r.left + 16;
    else if (r.right > s.right) strip.scrollLeft += r.right - s.right + 16;
  }

  /** «Volver» (y Esc): cierra el panel de filtros, luego la ficha (móvil) y luego la Pokédex. */
  function back() {
    if (panelOn) { panel(false); return; }
    if (sheetOn()) { sheet(false); return; }
    $('scr-dex').classList.remove('detail-open');
    open();
  }

  /** Ficha del compañero en la Pokédex (tocarlo en el menú principal). */
  function openPartner() {
    const s = G.DB.save;
    if (!s || !G.DEX_BY[s.partner]) return;
    dexSel = entryOf(s.partner); dexGen = G.DEX_BY[dexSel].gen; dexF = DEX0();
    openDex();
    sheet(true);            // en el móvil, la ficha a pantalla completa
    showDetail(dexSel);
  }

  function openDex() {
    const first = !G.UI.isOpen('scr-dex');
    if (first) { $('scr-dex').classList.remove('detail-open'); panelOn = false; }
    $('dex-panel').classList.toggle('hidden', !panelOn);
    G.UI.show('scr-dex', true);
    const s = G.DB.save;
    if (dexSel == null || !G.DEX_BY[dexSel]) { dexSel = s.partner; dexGen = G.DEX_BY[s.partner].gen; }
    dexSel = entryOf(dexSel);
    const total = fam() ? G.Fam.total() : G.DEX.length, have = fam() ? G.Fam.owned(s) : Object.keys(s.owned).length;
    $('dex-total').innerHTML = `${G.Icons.html('ball', 30)}<b>${have}</b><span>/ ${total}</span>`;
    $('dex-total').title = G.I18n.f('Tienes {x} de {x}', have, total);

    // Regiones: pestañas (ordenador y tableta) y desplegable (móvil), con cuántos tienes de cada una.
    const regions = ['Todas', ...GEN_NAMES].map((name, g) => ({ g, name,
      tot: fam() ? G.Fam.total(g) : (g ? G.DEX.filter(p => p.gen === g).length : G.DEX.length),
      have: fam() ? G.Fam.owned(s, g) : 0 }));
    const tabs = $('dex-gens'), tabsX = tabs.scrollLeft;
    tabs.innerHTML = '';
    for (const r of regions) {
      const b = document.createElement('button');
      const on = r.g === dexGen && !dexF.q;
      b.type = 'button';
      b.className = 'gen-tab' + (on ? ' on' : '') + (r.tot && r.have >= r.tot ? ' done' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.innerHTML = `<b>${r.name}</b><small>${r.have}/${r.tot}</small><span class="dx-gbar"><i style="width:${r.tot ? Math.round(r.have / r.tot * 100) : 0}%"></i></span>`;
      b.onclick = () => { dexGen = r.g; dexF.q = ''; openDex(); };
      tabs.appendChild(b);
    }
    tabs.scrollLeft = tabsX;
    if (first) keepInView(tabs, tabs.querySelector('.on'));
    const gs = $('dex-gen');
    gs.innerHTML = regions.map(r => `<option value="${r.g}">${esc(G.T(r.name))} · ${r.have}/${r.tot}</option>`).join('');
    gs.value = String(dexGen);
    gs.onchange = () => { dexGen = +gs.value; dexF.q = ''; openDex(); };
    gs.parentElement.classList.toggle('on', dexGen !== 0);

    // Orden y tipo: desplegables en píldora.
    const so = $('dex-sort');
    so.innerHTML = SORTS.map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
    so.value = dexF.sort;
    so.onchange = () => { dexF.sort = so.value; openDex(); };
    so.parentElement.classList.toggle('on', dexF.sort !== 'num');
    const ts = $('dex-type');
    ts.innerHTML = `<option value="">Todos los tipos</option>` +
      Object.keys(G.U.TYPE_NAME).map(t => `<option value="${t}">${G.U.TYPE_NAME[t]}</option>`).join('');
    ts.value = dexF.type;
    ts.onchange = () => { dexF.type = ts.value; openDex(); };
    ts.parentElement.classList.toggle('on', !!dexF.type);

    // «Filtros»: tengo / me faltan, shiny, favoritos y rarezas, en un panel debajo (con cuántos hay puestos).
    const n = (dexF.status !== 'all') + dexF.shiny + dexF.fav + dexF.rar.size;
    const more = $('dex-more');
    more.innerHTML = `${G.UI.svg('filter', 16)}<span>Filtros</span>${n ? `<b class="dx-badge">${n}</b>` : ''}`;
    more.classList.toggle('on', n > 0 || panelOn);
    more.setAttribute('aria-expanded', panelOn ? 'true' : 'false');
    more.onclick = () => { G.Audio.sfx('select'); panel(!panelOn); };

    // Búsqueda (mira en todas las regiones, también por el nombre de sus preevoluciones).
    const q = $('dex-q');
    if (q.value !== dexF.q) q.value = dexF.q;
    q.oninput = () => {
      clearTimeout(qT);
      qT = setTimeout(() => {
        dexF.q = q.value; renderGrid();
        $('dex-gens').querySelectorAll('.gen-tab').forEach((b, g) => b.classList.toggle('on', g === dexGen && !dexF.q));
      }, 150);
    };
    q.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); q.blur(); } };
    renderPanel();
    renderGrid();
    showDetail(dexSel);
  }

  /** Abre o cierra el panel de filtros. */
  function panel(on) {
    panelOn = !!on;
    $('dex-panel').classList.toggle('hidden', !panelOn);
    const more = $('dex-more');
    more.setAttribute('aria-expanded', panelOn ? 'true' : 'false');
    const n = (dexF.status !== 'all') + dexF.shiny + dexF.fav + dexF.rar.size;
    more.classList.toggle('on', n > 0 || panelOn);
    if (panelOn) renderPanel();
  }

  /** El panel de filtros: qué mostrar, marcas y rarezas; abajo, cuántos salen y «Limpiar». */
  function renderPanel() {
    const box = $('dex-panel');
    if (!panelOn) { box.innerHTML = ''; return; }
    const f = dexF;
    const chip = (key, html, on) => `<button class="chip${on ? ' on' : ''}" type="button" data-f="${key}" aria-pressed="${on}">${html}</button>`;
    box.innerHTML = `
      <div class="dx-pg"><span class="dx-pl">Mostrar</span><div class="dx-pc">
        ${[['all', 'Todos'], ['own', 'Tengo'], ['miss', 'Me faltan']].map(([k, l]) => chip('s:' + k, `<span>${l}</span>`, f.status === k)).join('')}</div></div>
      <div class="dx-pg"><span class="dx-pl">Marcas</span><div class="dx-pc">
        ${chip('shiny', G.Icons.html('shiny', 16) + '<span>Shiny</span>', f.shiny)}${chip('fav', G.Icons.html('star', 30) + '<span>Favoritos</span>', f.fav)}</div></div>
      <div class="dx-pg"><span class="dx-pl">Rareza</span><div class="dx-pc">
        ${[5, 4, 3, 2, 1].map(r => chip('r:' + r, G.Icons.html(G.Icons.RARITY_BALL[r], 30) + `<span>${G.Gacha.RARITY_NAME[r]}</span>`, f.rar.has(r))).join('')}</div></div>
      <div class="dx-pf"><span id="dex-count" class="dx-count"></span>
        <button class="btn small ghost" type="button" data-f="clear">Limpiar</button>
        <button class="btn small" type="button" data-f="close">Listo</button></div>`;
    box.querySelectorAll('[data-f]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.f;
        G.Audio.sfx('select');
        if (k === 'close') { panel(false); return; }
        if (k === 'clear') { const t = dexF.type, so = dexF.sort; dexF = DEX0(); dexF.type = t; dexF.sort = so; }
        else if (k.startsWith('s:')) dexF.status = k.slice(2);
        else if (k === 'shiny') dexF.shiny = !dexF.shiny;
        else if (k === 'fav') dexF.fav = !dexF.fav;
        else if (k.startsWith('r:')) { const r = +k.slice(2); dexF.rar.has(r) ? dexF.rar.delete(r) : dexF.rar.add(r); }
        openDex();
      };
    });
    countLine();
  }
  function countLine() {
    const c = $('dex-count');
    if (c) c.textContent = gridList.length === 1 ? '1 Pokémon' : gridList.length + ' Pokémon';
  }

  /** Lo que se ve con la región, los filtros y el orden de ahora. */
  const norm = v => String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function dexList() {
    const s = G.DB.save, f = dexF;
    const q = norm(f.q.trim());
    const num = /^#?\d+$/.test(q) ? +q.replace('#', '') : null;
    const line = d => (fam() ? G.Fam.lineOf(d) : [d]);
    const list = dexAll().filter(p => {
      const own = !!s.owned[p.dex];
      if (q) {
        // Por número o por nombre (sin tildes), también el de sus preevoluciones: «charmander» encuentra a
        // Charizard. De los que no tienes no se busca el nombre.
        if (num != null) { if (!line(p.dex).includes(num)) return false; }
        else if (!own || !line(p.dex).some(d => [G.DEX_BY[d].name, G.T(G.DEX_BY[d].name)].some(nm => norm(nm).includes(q)))) return false;
      } else if (dexGen && p.gen !== dexGen) return false;
      if (f.status === 'own' && !own) return false;
      if (f.status === 'miss' && own) return false;
      if (f.shiny && !(s.shiny && s.shiny[p.dex])) return false;
      if (f.fav && !G.DB.isFav(p.dex)) return false;
      if (f.rar.size && !f.rar.has(p.rarity)) return false;
      // Por tipo también los que te faltan (siguen en silueta y sin nombre): «Me faltan» + tipo.
      if (f.type && !p.types.includes(f.type)) return false;
      return true;
    });
    const at = p => (s.owned[p.dex] && s.owned[p.dex].at) || 0, used = p => +(s.pused || {})[p.dex] || 0;
    const by = { num: (a, b) => a.dex - b.dex, name: (a, b) => G.T(a.name).localeCompare(G.T(b.name), G.I18n.locale),
                 rar: (a, b) => b.rarity - a.rarity || a.dex - b.dex, new: (a, b) => at(b) - at(a) || a.dex - b.dex,
                 used: (a, b) => used(b) - used(a) || a.dex - b.dex }[f.sort] || ((a, b) => a.dex - b.dex);
    // Los que no tienes no tienen nombre a la vista: al ordenar por nombre van al final.
    if (f.sort === 'name') list.sort((a, b) => (!s.owned[a.dex]) - (!s.owned[b.dex]) || by(a, b)); else list.sort(by);
    return list;
  }

  /*
   * La rejilla se pinta por tandas de PAGE: con "Todas" son más de 500 Pokémon, cada
   * uno con su animación y su hoja de sprites, y pintarlos de golpe paraba el
   * juego (y la música) un segundo al borrar la búsqueda o cambiar el orden.
   * Al acercarse al final de la lista se pinta la siguiente tanda.
   * keep: volver a pintar los mismos que había y donde estaban (marcar un
   * favorito no te devuelve arriba); si no, la lista vuelve al principio.
   */
  const PAGE = 48;
  let qT = 0, gridList = [], gridShown = 0, gridIO = null;
  function renderGrid(keep = false) {
    const grid = $('dex-grid'), sc = listScroller();
    const want = keep ? Math.max(PAGE, gridShown) : PAGE;
    const top = sc.scrollTop;
    grid.innerHTML = '';
    gridList = dexList();
    gridShown = 0;
    const f = dexF, busy = f.q || f.status !== 'all' || f.shiny || f.fav || f.rar.size || f.type;
    countLine();
    if (!gridList.length) {
      grid.innerHTML = `<div class="empty-state dx-empty"><span class="ico-tile l">${G.Icons.html('book', 60)}</span>
        <b>Ninguno con estos filtros.</b>${busy ? '<button class="btn small ghost" type="button" data-clear>Limpiar</button>' : ''}</div>`;
      const c = grid.querySelector('[data-clear]');
      if (c) c.onclick = () => { dexF = DEX0(); openDex(); };
      return;
    }
    moreCells(want);
    sc.scrollTop = keep ? top : 0;
  }

  function moreCells(n = PAGE) {
    const grid = $('dex-grid');
    const old = grid.querySelector('.dex-more');
    if (old) { if (gridIO) gridIO.unobserve(old); old.remove(); }
    const end = Math.min(gridList.length, gridShown + n);
    for (let i = gridShown; i < end; i++) grid.appendChild(dexCell(gridList[i]));
    gridShown = end;
    if (gridShown >= gridList.length) return;
    // Marca al final: cuando se acerca a la vista, la siguiente tanda.
    const more = document.createElement('div');
    more.className = 'dex-more';
    grid.appendChild(more);
    if (!('IntersectionObserver' in window)) { moreCells(gridList.length); return; }
    gridIO = gridIO || new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) moreCells(); }, { rootMargin: '300px' });
    gridIO.observe(more);
  }

  /** Cuándo llegaste con él a la Sentencia de Arceus (save.pjudg, lo apunta progress.js), o 0. */
  const judged = dex => +(G.DB.save.pjudg || {})[dex] || 0;

  /**
   * Casilla de la rejilla: tarjeta teñida con el color de su rareza; arriba, el
   * número y la Poké Ball de la rareza; a la izquierda, las marcas (compañero o
   * shiny, favorito, Sentencia de Arceus); el Pokémon (en silueta si te falta) y su nombre.
   */
  function dexCell(p) {
    const s = G.DB.save;
    const own = !!s.owned[p.dex], sh = !!(s.shiny && s.shiny[p.dex]);
    const cell = document.createElement('div');
    cell.className = `cell dx-cell r${p.rarity}` + (own ? '' : ' miss') + (p.dex === dexSel ? ' on' : '');
    cell.dataset.pad = '1';
    cell.dataset.dex = p.dex;
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', own ? p.name : '#' + pad3(p.dex));
    const marks = [];
    if (p.dex === s.partner) marks.push(['Compañero', G.Icons.html('crown', 30)]);
    else if (sh) marks.push(['Tienes su shiny', G.Icons.html('shiny', 16)]);
    if (G.DB.isFav(p.dex)) marks.push(['Favorito', G.Icons.html('star', 30)]);
    if (judged(p.dex)) marks.push(['Llegó a la Sentencia de Arceus', G.Icons.html('trophy', 30)]);
    cell.innerHTML = `<span class="no">${pad3(p.dex)}</span><span class="dx-ball">${G.Icons.rarity(p.rarity, 30)}</span>` +
      (marks.length ? `<span class="dx-marks">${marks.map(([t, h]) => `<span title="${t}">${h}</span>`).join('')}</span>` : '');
    const useShiny = sh && p.dex === s.partner && s.partnerShiny;
    const [w, h] = COMPACT.matches ? [76, 60] : [92, 76];
    cell.appendChild(G.UI.spriteCanvas(p.dex, w, h, { scale: 2, silhouette: !own, shadow: own, shiny: useShiny }));
    cell.insertAdjacentHTML('beforeend', `<b>${own ? p.name : '???'}</b>`);
    cell.onclick = () => select(p.dex, true);
    // Con el teclado: Intro o espacio la abren, como un botón.
    cell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); } };
    return cell;
  }

  /** Enseña la ficha de dex (y la marca en la rejilla). open: en el móvil, a pantalla completa. */
  function select(dex, open) {
    dexSel = dex;
    const grid = $('dex-grid');
    grid.querySelectorAll('.cell.on').forEach(c => c.classList.remove('on'));
    const cell = grid.querySelector(`.cell[data-dex="${dex}"]`);
    if (cell) cell.classList.add('on');
    if (open) sheet(true);            // primero la hoja: así la ficha ya se ve y su escenario se puede medir
    showDetail(dex);
    if (cell && !sheetOn() && cell.scrollIntoView) cell.scrollIntoView({ block: 'nearest' });
  }

  // Variante que se está viendo en la ficha (normal o shiny) y lo que pinta su escenario.
  let viewShiny = false, big = null;

  /**
   * El lienzo grande de la ficha mide lo mismo que su escenario (cambia con la
   * pantalla): cada píxel del sprite son píxeles enteros. Si la ficha aún no se
   * ve (móvil, con la lista delante), se ajusta al abrirla.
   */
  function fitBig(force) {
    const cv = $('dex-big');
    if (!cv || !big) return;
    const box = cv.parentElement, w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    if (!force && cv.width === w && cv.height === h) return;
    cv.width = w; cv.height = h;
    G.UI.sprite(cv, big.dex, { lively: big.own, spin: big.own, silhouette: !big.own, hero: true, shiny: big.shiny,
      scale: Math.max(2, Math.min(5, Math.floor(h / 40))) });   // (120-150 px tumbado → ×3; 176-208 → ×4-5; «hero» lo baja si no cabe)
  }

  // Estadísticas: lo más alto que hay en el juego (las barras van de 0 a esto).
  const MAX = { hp: 183, pa: 1.55, sa: 1.55, df: 160, sd: 160, spd: 137 };
  const STATS = [['hp', 'Vida'], ['pa', 'Ataque'], ['sa', 'At. Esp.'], ['df', 'Defensa'], ['sd', 'Def. Esp.'], ['spd', 'Velocidad']];
  const statTxt = (k, v) => (k === 'pa' || k === 'sa' ? '×' + v.toFixed(2) : String(Math.round(v)));

  function showDetail(dex) {
    const s = G.DB.save;
    const p = G.DEX_BY[dex];
    if (!p) return;
    const own = !!s.owned[dex];
    const hasSh = !!(s.shiny && s.shiny[dex]);
    const isPartner = dex === s.partner;
    if (!hasSh) viewShiny = false;
    else if (isPartner && dex !== showDetail.last) viewShiny = !!s.partnerShiny;
    if (dex !== showDetail.last) extraOpen = '';
    // Al redibujar el mismo Pokémon (abrir el selector de Menta, enseñar una MT...)
    // no se vuelve arriba: se quedaba fuera de la vista lo que acababas de abrir.
    const box = $('dex-detail');
    const same = dex === showDetail.last, pane0 = box.querySelector('.dx-pane');
    const keep = same ? [box.scrollTop, pane0 ? pane0.scrollTop : 0] : [0, 0];
    showDetail.last = dex;

    const gen = GEN_NAMES[p.gen - 1];
    const fav = own && G.DB.isFav(dex), favTxt = fav ? 'Favorito' : 'Marcar como favorito';
    const usingThis = isPartner && (!hasSh || !!s.partnerShiny === viewShiny);
    const i = gridList.findIndex(x => x.dex === dex);
    const prev = i > 0 ? gridList[i - 1] : null, next = i >= 0 && i < gridList.length - 1 ? gridList[i + 1] : null;
    const nav = (m, cls, label, ico) => (m ? `<button class="icon-btn dx-nav ${cls}" type="button" data-nav="${m.dex}" aria-label="${label}" title="${label}">${G.UI.svg(ico, 18)}</button>` : '');

    const hero = `<div class="dx-hero">
        <div class="dx-stage${own && viewShiny ? ' shiny' : ''}" id="dex-stage">
          <canvas id="dex-big"></canvas>
          <span class="dx-no"><b>#${pad3(p.dex)}</b><span>${gen}</span></span>
          ${own ? `<button id="dex-fav" class="icon-btn dx-fav${fav ? ' on' : ''}" type="button" aria-pressed="${fav}" aria-label="${favTxt}" title="${favTxt}">${G.Icons.html(fav ? 'star' : 'starDim', 30)}</button>` : ''}
          ${nav(prev, 'prev', 'Anterior', 'back')}${nav(next, 'next', 'Siguiente', 'chevron')}
        </div>
        <div class="dx-id">
          <h3 class="dx-name">${own ? p.name : '???'}</h3>
          <span class="dx-rar" style="color:${G.Gacha.RARITY_COLOR[p.rarity]}">${G.Icons.rarity(p.rarity, 30)}<span>${G.Gacha.RARITY_NAME[p.rarity]}</span></span>
        </div>
        ${own ? `<div class="dx-types">${G.UI.typeChips(p.types)}</div>` : ''}
        ${own && hasSh ? `<div class="seg dx-seg">
            <button type="button" class="${viewShiny ? '' : 'on'}" data-v="0">Normal</button>
            <button type="button" class="${viewShiny ? 'on' : ''}" data-v="1">${G.Icons.html('shiny', 16)} Shiny</button></div>` : ''}
        ${own ? `<div class="dx-foot">${usingThis
          ? `<div class="dx-partner">${G.Icons.html('crown', 30)}<span>Es tu compañero</span></div>`
          : `<button id="dex-pick" class="btn gold block" type="button" data-sfx="confirm">Elegir de compañero${viewShiny ? ' (shiny)' : ''}</button>`}</div>` : ''}
      </div>`;

    let body;
    if (own) {
      if (!TABS.some(([k]) => k === dexTab)) dexTab = 'info';
      body = `<div class="dx-body">
        <div class="dx-tabs" role="tablist">${TABS.map(([k, label]) =>
          `<button class="dx-tab${k === dexTab ? ' on' : ''}" type="button" role="tab" data-tab="${k}" aria-selected="${k === dexTab}">${label}</button>`).join('')}</div>
        <div class="dx-pane" role="tabpanel">${({ info: paneInfo, evo: paneEvo, moves: paneMoves, recs: paneRecs })[dexTab](dex)}</div>
      </div>`;
    } else {
      body = `<div class="dx-body"><div class="dx-pane"><div class="dx-missing">
        <p><b>Aún no lo tienes.</b></p>
        <p>${G.I18n.f('Consíguelo en el banner de {x} del gacha o derrotando a un shiny de su familia.', G.T(gen))}</p>
        ${missLine(dex)}
      </div></div></div>`;
    }
    box.innerHTML = `<div class="dx-in${own ? '' : ' is-miss'}">${hero}${body}</div>`;
    box.scrollTop = keep[0];
    const pane = box.querySelector('.dx-pane');
    if (pane) pane.scrollTop = keep[1];
    $('dex-stage').style.setProperty('--stage-c', !own ? 'var(--c-blue)' : viewShiny ? 'var(--c-cyan)' : G.U.TYPE_COLOR[p.types[0]]);
    big = { dex, own, shiny: own && viewShiny };
    fitBig(true);
    wireDetail(dex, box, hasSh);
  }

  /** Lo que hacen los botones de la ficha. */
  function wireDetail(dex, box, hasSh) {
    const s = G.DB.save, p = G.DEX_BY[dex];
    box.querySelectorAll('.dx-seg button').forEach(b => {
      b.onclick = () => { viewShiny = b.dataset.v === '1'; showDetail(dex); };
    });
    box.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = () => { G.Audio.sfx('select'); select(+b.dataset.nav, false); };
    });
    box.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => {
        if (dexTab === b.dataset.tab) return;
        dexTab = b.dataset.tab; extraOpen = ''; G.Audio.sfx('select');
        showDetail.last = null; showDetail(dex);       // (pestaña nueva: arriba del todo)
      };
    });
    box.querySelectorAll('[data-go-tab]').forEach(b => {
      b.onclick = () => { dexTab = b.dataset.goTab; extraOpen = ''; G.Audio.sfx('select'); showDetail.last = null; showDetail(dex); };
    });
    // Otra forma final de la familia (ramas): a su ficha.
    box.querySelectorAll('[data-dex-go]').forEach(b => {
      b.onclick = () => {
        const d = +b.dataset.dexGo;
        if (!G.DEX_BY[d]) return;
        G.Audio.sfx('select');
        if (!gridList.some(x => x.dex === d)) { dexF = DEX0(); dexGen = G.DEX_BY[d].gen; openDex(); }
        select(d, false);
      };
    });
    const fv = $('dex-fav');
    if (fv) fv.onclick = () => { G.DB.setFav(dex, !G.DB.isFav(dex)); renderGrid(true); showDetail(dex); };
    const pick = $('dex-pick');
    if (pick) pick.onclick = () => {
      s.partner = dex;
      s.partnerShiny = hasSh && viewShiny;
      G.DB.commit();
      G.UI.toast(p.name + (s.partnerShiny ? ' shiny' : '') + ' es ahora tu compañero');
      renderGrid(true); showDetail(dex);
    };
    // Las pestañas pintan sus sprites pequeños (fases de la familia) después de ponerse.
    box.querySelectorAll('canvas[data-mini]').forEach(cv => {
      const sil = cv.dataset.sil === '1';
      G.UI.sprite(cv, +cv.dataset.mini, { scale: +cv.dataset.k || 2, silhouette: sil, shadow: !sil });
    });
    if (s.owned[dex]) wireExtras(dex, box);
  }

  // ---------------- pestañas de la ficha ----------------

  /** Resumen: su familia en una línea, las estadísticas, naturaleza y habilidad. */
  function paneInfo(dex) {
    const p = G.DEX_BY[dex];
    const nat = G.Mons.natureOf(dex), q = G.Mons.monFor(dex);
    const cls = k => (nat.up === k ? ' up' : nat.down === k ? ' down' : '');
    const bar = ([k, label]) =>
      `<div class="dx-stat${cls(k)}"><span>${label}</span><span class="dx-bar"><i style="width:${Math.min(100, q[k] / MAX[k] * 100).toFixed(1)}%"></i></span><b>${statTxt(k, q[k])}</b></div>`;
    return `${famStrip(dex)}
      <section class="dx-sec">
        <h4 class="dx-h">Estadísticas</h4>
        <div class="dx-stats">${STATS.map(bar).join('')}</div>
        <p class="dx-note">Pega mejor con ataques <b class="gold">${G.Stats.sideOf(q) === 'special' ? 'especiales' : 'físicos'}</b></p>
        ${p.types.length === 1 ? `<p class="dx-note">Monotipo: +20 % de daño con sus ataques de tipo ${G.U.TYPE_NAME[p.types[0]]}</p>` : ''}
      </section>
      ${monExtras(dex)}`;
  }

  /** «En partida: Charmander → Charmeleon → Charizard» (lleva a la pestaña Evolución). */
  function famStrip(dex) {
    const line = fam() ? G.Fam.lineOf(dex) : [dex];
    if (line.length < 2) return `<p class="dx-famline solo"><span class="dx-lbl">En partida</span><span>No evoluciona</span></p>`;
    const names = line.map(d => `<b class="${d === dex ? 'gold' : ''}">${esc(G.DEX_BY[d].name)}</b>`).join('<i class="evo-arr" aria-hidden="true">→</i>');
    return `<button class="dx-famline" type="button" data-go-tab="evo"><span class="dx-lbl">En partida</span>
      <span class="dx-fl-names">${names}</span>${G.UI.svg('chevron', 16)}</button>`;
  }

  /**
   * Lienzos pequeños de las fases de una línea (los pinta wireDetail), todos a la misma escala
   * (×2 si caben todos; si no, ×1): así se ve lo que crece al evolucionar.
   */
  function miniCvs(line, sil) {
    const [w, h] = COMPACT.matches ? [76, 80] : [84, 90];
    const ay = d => { const m = G.Sprites.animMeta(d, 'Idle'); return m ? m.ay : 24; };
    const k = Math.max(1, Math.min(2, ...line.map(d => Math.floor(h * 0.8 / ay(d)))));
    return line.map(d => `<canvas width="${w}" height="${h}" data-mini="${d}" data-k="${k}"${sil ? ' data-sil="1"' : ''}></canvas>`);
  }

  /** Evolución: cada fase (sprite, tipos y cómo se llega en partida), otras ramas y las estadísticas de cada fase. */
  function paneEvo(dex) {
    const line = fam() ? G.Fam.lineOf(dex) : [dex];
    const nat = G.Mons.natureOf(dex), cvs = miniCvs(line);
    const steps = line.map((d, i) => {
      const m = G.DEX_BY[d], r = i && G.Evo ? G.Evo.rule(d) : null;
      const how = i ? (r && G.EvoUI ? G.EvoUI.howHtml(r, d) : '') : `<span>${G.T('Al empezar')}</span>`;
      return (i ? '<i class="dx-st-arr" aria-hidden="true">→</i>' : '') + `<div class="dx-st${d === dex ? ' on' : ''}">
        ${cvs[i]}
        <b>${esc(m.name)}</b>
        <span class="dx-st-types">${G.UI.typeChips(m.types)}</span>
        <span class="dx-st-how">${how}</span>
      </div>`;
    }).join('');
    const intro = line.length > 1
      ? `<p class="dx-note">${G.I18n.f('Empiezas la partida como {x} y evoluciona durante la partida: al llegar a su nivel o, si no, en su minuto.', G.DEX_BY[line[0]].name)}</p>`
      : `<p class="dx-note">${G.T('No evoluciona: juegas con él desde el principio.')}</p>`;
    // Ramas: las otras formas finales de la familia.
    const fm = fam() ? G.Fam.familyOf(dex) : null, others = fm ? fm.finals.filter(d => d !== dex) : [];
    const s = G.DB.save;
    const sib = others.length ? `<section class="dx-sec"><h4 class="dx-h">${G.I18n.f('Otras evoluciones de {x}', G.DEX_BY[fm.base].name)}</h4>
        <div class="dx-sibs">${others.map(d => { const own = !!s.owned[d];
          return `<button class="chip dx-sib${own ? '' : ' miss'}" type="button" data-dex-go="${d}"><span class="dx-sn">#${pad3(d)}</span><span>${own ? esc(G.DEX_BY[d].name) : '???'}</span></button>`; }).join('')}</div>
        <p class="dx-note">${G.T('Cada una es una entrada de la Pokédex: al elegir una, la partida va hacia ella.')}</p></section>` : '';
    // Estadísticas de cada fase (con la naturaleza de tu Pokémon, como en partida).
    const rows = line.map(d => { const f = G.Mons.formFor(dex, d);
      return `<tr class="${d === dex ? 'on' : ''}"><th scope="row">${esc(G.DEX_BY[d].name)}</th>${STATS.map(([k]) =>
        `<td class="${nat.up === k ? 'up' : nat.down === k ? 'down' : ''}">${statTxt(k, f[k])}</td>`).join('')}</tr>`; }).join('');
    return `${intro}
      <div class="dx-evo-row">${steps}</div>
      ${sib}
      <section class="dx-sec">
        <h4 class="dx-h">Estadísticas de cada fase</h4>
        <div class="dx-cmp-wrap"><table class="dx-cmp"><thead><tr><th></th>${STATS.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody></table></div>
        <p class="dx-note">${G.I18n.f('Con la naturaleza de tu {x}: {x}.', esc(G.DEX_BY[dex].name), `${G.Mons.name(nat.n)} (${natLine(nat)})`)}</p>
      </section>`;
  }

  /** Ataques: con cuál empieza, los de sus tipos (por tipo, con lo que hacen) y las MT. */
  function paneMoves(dex) {
    const p = G.DEX_BY[dex], start = G.startMoveOf(dex);
    const line = fam() ? G.Fam.lineOf(dex) : [dex];
    // Normal y sus tipos; de los que llegan con una evolución, desde qué fase (Charizard: Volador).
    const from = { normal: null };
    for (const t of p.types) if (!(t in from)) { const d = line.find(x => G.DEX_BY[x].types.includes(t)); from[t] = d == null || d === line[0] ? null : d; }
    const KN = (G.RunUI && G.RunUI.KIND_NAME) || {};
    const row = id => { const m = G.Moves.BY_ID[id]; if (!m) return '';
      const cat = G.Stats.NAME[m.cat] || '';
      return `<div class="dx-mrow${id === start ? ' start' : ''}">${G.Icons.html('move:' + id, 30)}<span class="dx-mt">
        <b>${G.T(m.name, 'move')}</b>${cat ? `<span class="tag-chip cat">${cat}</span>` : ''}${KN[m.kind] ? `<span class="fam-chip">${KN[m.kind]}</span>` : ''}
        <small>${m.desc || ''}</small></span></div>`; };
    const groups = Object.keys(from).map(t => {
      const ids = (G.Moves.POOL[t] || []).filter(id => G.Moves.BY_ID[id]);
      if (!ids.length) return '';
      return `<div class="dx-mg"><h4 class="dx-h dx-mh">${G.UI.typeChips([t])}${from[t] != null ? `<span>${G.I18n.f('desde {x}', esc(G.DEX_BY[from[t]].name))}</span>` : ''}</h4>
        <div class="dx-mlist">${ids.map(row).join('')}</div></div>`;
    }).join('');
    const sm = G.Moves.BY_ID[start];
    return `<p class="dx-start">${G.Icons.html('move:' + start, 30)}<span>Empieza con <b class="gold">${sm ? G.T(sm.name, 'move') : ''}</b></span></p>
      <section class="dx-sec dx-moves-sec">
        <h4 class="dx-h">Ataques que puede llevar</h4>
        <p class="dx-note">${G.T('Salen en las cartas al subir de nivel: los de sus tipos y los normales. Los de un tipo que llega con una evolución, desde esa fase.')}</p>
        ${groups}
      </section>
      ${tmSection(dex)}`;
  }

  /** MT: las que ha aprendido (para siempre), las que puede aprender y enseñar una de la Mochila. */
  function tmSection(dex) {
    const taught = G.Mons.taught(dex).filter(id => !G.Mons.natural(dex, id));
    const can = G.Mons.learnable(dex), inBag = can.filter(id => G.Shop.tmCount(id) > 0);
    const chipOf = id => `<span class="dx-tm">${G.Icons.html('move:' + id, 30)}<span>${G.T(G.Moves.BY_ID[id].name, 'move')}</span></span>`;
    return `<section class="dx-sec dx-extra">
      <div class="dx-row">
        <div class="dx-rt"><span class="dx-lbl">MT</span>${taught.length ? '' : `<small>${G.T('Aún no ha aprendido ninguna')}</small>`}</div>
        ${inBag.length ? `<button class="btn small ic dx-use${extraOpen === 'tm' ? ' on' : ''}" type="button" data-extra="tm" aria-expanded="${extraOpen === 'tm'}">${G.Icons.html('tm', 30)}<span>Enseñar MT</span><span class="dx-x">×${inBag.length}</span></button>` : ''}
        ${taught.length ? `<div class="dx-tms">${taught.map(chipOf).join('')}</div>` : ''}
      </div>
      <div id="mx-picker"></div>
      ${can.length ? `<div class="dx-row"><div class="dx-rt"><span class="dx-lbl">${G.T('Puede aprender con MT')}</span><small>${G.T('En la Tienda Kecleon')}</small></div>
        <div class="dx-tms">${can.map(chipOf).join('')}</div></div>` : ''}
    </section>`;
  }

  /** Récords: partidas y mejores marcas con él, la Sentencia, cuándo y cómo lo conseguiste, mejoras y Pulsera Z. */
  function paneRecs(dex) {
    const s = G.DB.save, r = (fam() && G.Fam.rec(dex)) || null;
    const runs = +(s.pused || {})[dex] || 0, j = judged(dex), o = s.owned[dex] || {}, sh = s.shiny && s.shiny[dex];
    const date = t => (t ? new Date(+t).toLocaleDateString(G.I18n.locale) : '—');
    const tile = (ico, label, v) => `<div class="dx-rec">${ico}<b>${v}</b><span>${label}</span></div>`;
    const FROM = { starter: 'Test del inicial', gacha: 'Gacha', wild: 'Shiny salvaje', rescue: 'Rescate' };
    const levels = G.DB.upgradesOf(dex), list = (G.Upgrades && G.Upgrades.LIST) || [];
    const done = list.reduce((a, u) => a + Math.min(u.max, levels[u.id] || 0), 0), all = list.reduce((a, u) => a + u.max, 0);
    const ring = G.Shop && G.Shop.ringHas ? G.Shop.ringHas(dex) : false;
    const row = (label, v) => `<div class="dx-kv"><span>${label}</span><b>${v}</b></div>`;
    return `<div class="dx-recs">
        ${tile(G.Icons.html('ball', 30), 'Partidas', runs.toLocaleString(G.I18n.locale))}
        ${tile(G.Icons.html('trophy', 30), 'Mejor tiempo', r && r[0] ? G.U.mmss(r[0]) : '—')}
        ${tile(G.Icons.html('up', 30), 'Mejor nivel', r && r[1] ? r[1] : '—')}
        ${tile(G.Icons.html('choiceband', 30), 'Derrotados', r && r[2] ? r[2].toLocaleString(G.I18n.locale) : '—')}
        ${tile(G.Icons.html('medal3', 30), 'Jefes', r && r[3] ? r[3] : '—')}
        ${tile(G.Icons.html('star', 30), 'Sentencia de Arceus', j ? date(j) : G.T('Aún no'))}
      </div>
      ${!r ? `<p class="dx-note">${G.T('Tiempo, nivel, derrotados y jefes: los mejores de una partida con él, desde el 26-10-2026.')}</p>` : ''}
      <section class="dx-sec dx-kvs">
        ${row(G.T('Conseguido'), `${date(o.at)}${FROM[o.from] ? ' · ' + G.T(FROM[o.from]) : ''}`)}
        ${row('Shiny', sh ? date(sh.at) : G.T('No'))}
        ${row(G.T('Mejoras'), `${done}/${all}`)}
        ${row(G.T('Pulsera Z'), ring ? G.T('Sí') : G.T('No'))}
      </section>`;
  }

  /** Ficha de uno que te falta: su familia en siluetas (sin nombres). */
  function missLine(dex) {
    const line = fam() ? G.Fam.lineOf(dex) : [dex];
    if (line.length < 2) return '';
    const cvs = miniCvs(line, true);
    return `<div class="dx-evo-row miss">${line.map((d, i) => (i ? '<i class="dx-st-arr" aria-hidden="true">→</i>' : '') +
      `<div class="dx-st">${cvs[i]}<b>???</b></div>`).join('')}</div>`;
  }

  // ---------------- naturaleza, habilidad y MT (Tienda Kecleon, 20-10-2026) ----------------
  // Se ven en la ficha de cada Pokémon y aquí se usan la Menta, las Cápsulas y las MT de la Mochila.
  const STAT_NAME = { pa: 'Ataque', sa: 'At. Esp.', df: 'Defensa', sd: 'Def. Esp.', spd: 'Velocidad' };
  let extraOpen = '';          // 'nat' | 'cap' | 'caph' | 'tm' | '' (qué selector está abierto)
  const natLine = n => (n.up ? `+${G.T(STAT_NAME[n.up])} −${G.T(STAT_NAME[n.down])}` : G.T('neutra'));

  /** Naturaleza y habilidad en filas; a la derecha, el objeto de la Mochila que los cambia (si tienes). */
  function monExtras(dex) {
    const p = G.DEX_BY[dex], n = G.Mons.natureOf(dex), ab = G.Mons.abilityOf(dex);
    const fx = G.AbilityFX.of(ab.id, p);
    const btn = (key, icon, label, count) => count > 0
      ? `<button class="btn small ic dx-use${extraOpen === key ? ' on' : ''}" type="button" data-extra="${key}" aria-expanded="${extraOpen === key}">${G.Icons.html(icon, 30)}<span>${label}</span><span class="dx-x">×${count}</span></button>` : '';
    const capN = G.Mons.abilityChoices(dex, false).length ? G.Shop.count('cap') : 0;
    const caphN = G.Mons.abilityChoices(dex, true).length ? G.Shop.count('caph') : 0;
    return `<section class="dx-sec dx-extra">
      <div class="dx-row">
        <div class="dx-rt"><span class="dx-lbl">Naturaleza</span><b translate="no">${G.Mons.name(n.n)}</b><small>${natLine(n)}</small></div>
        ${btn('nat', 'mint', 'Menta', G.Shop.count('mint'))}
      </div>
      <div class="dx-row">
        <div class="dx-rt"><span class="dx-lbl">Habilidad</span><b translate="no">${G.Mons.abilityName(ab.id)}</b>${ab.slot === 2 ? `<small class="gold">${G.T('oculta')}</small>` : ''}</div>
        ${btn('cap', 'capsule', 'Cápsula', capN)}${btn('caph', 'capsuleh', 'Cápsula Oculta', caphN)}
        <p class="dx-desc"><span>${fx.d}</span>${fx.d2 ? ` <span>${fx.d2}</span>` : ''}</p>
      </div>
      <div id="mx-picker"></div>
    </section>`;
  }

  function wireExtras(dex, box) {
    box.querySelectorAll('[data-extra]').forEach(b => {
      b.onclick = () => { extraOpen = extraOpen === b.dataset.extra ? '' : b.dataset.extra; G.Audio.sfx('select'); showDetail(dex); };
    });
    const host = box.querySelector('#mx-picker');
    if (!host || !extraOpen) return;
    const mon = G.DEX_BY[dex];
    const chips = (list, onPick) => {
      host.innerHTML = `<div class="dx-picker"><div class="dx-chips">${list.map(x => `<button class="chip" type="button" data-v="${x.v}">${x.html}</button>`).join('')}</div></div>`;
      host.querySelectorAll('[data-v]').forEach(c => { c.onclick = () => onPick(c.dataset.v); });
      // Que se vea el selector recién abierto.
      const sc = box.querySelector('.dx-pane');
      const scroller = sc && sc.scrollHeight > sc.clientHeight ? sc : box;
      const r = host.getBoundingClientRect(), d = scroller.getBoundingClientRect();
      if (r.bottom > d.bottom - 16) scroller.scrollTop += Math.max(0, Math.min(r.top - d.top - 12, r.bottom - d.bottom + 16));
    };
    const done = msg => { extraOpen = ''; G.DB.commit(); G.Audio.sfx('buy'); G.UI.toast(msg, 2600); showDetail(dex); };
    if (extraOpen === 'nat' && G.Shop.count('mint')) {
      const cur = G.Mons.natureOf(dex).id;
      chips(G.NATURES.filter(n => n.id !== cur).map(n => ({ v: n.id, html: `<b translate="no">${G.Mons.name(n.n)}</b> <small>${natLine(n)}</small>` })), id => {
        if (!G.Shop.take('mint')) return;
        G.Mons.setNature(dex, id);
        done(G.I18n.f('{x} ahora tiene naturaleza {x}', mon.name, G.Mons.name(G.NATURE_BY[id].n)));
      });
    } else if ((extraOpen === 'cap' || extraOpen === 'caph') && G.Shop.count(extraOpen)) {
      const l = G.Mons.slots(dex);
      chips(G.Mons.abilityChoices(dex, extraOpen === 'caph').map(i => ({ v: i, html: `<b translate="no">${G.Mons.abilityName(l[i])}</b>${i === 2 ? ` <small class="gold">${G.T('oculta')}</small>` : ''}` })), v => {
        if (!G.Shop.take(extraOpen)) return;
        G.Mons.setAbility(dex, +v);
        done(G.I18n.f('{x} ahora tiene la habilidad {x}', mon.name, G.Mons.abilityName(l[+v])));
      });
    } else if (extraOpen === 'tm') {
      const list = G.Mons.learnable(dex).filter(id => G.Shop.tmCount(id) > 0);
      chips(list.map(id => ({ v: id, html: `${G.Icons.html('move:' + id, 30)}<span>${G.T(G.Moves.BY_ID[id].name, 'move')}</span><small>×${G.Shop.tmCount(id)}</small>` })), id => {
        if (!G.Mons.teach(dex, id)) return;
        done(G.I18n.f('¡{x} ha aprendido {x}!', mon.name, G.T(G.Moves.BY_ID[id].name, 'move')));
      });
    }
  }

  // ---------------- mejoras ----------------
  /*
   * Hoja (dev.html, #scr-upgrades), rehecha el 26-10-2026 para el móvil tumbado (filas
   * bajas y sin huecos). A la izquierda, el Pokémon: escenario, su nombre (un <select>
   * nativo, invisible, encima de una «cara» con el nombre y «Compañero»: en el iPhone abre
   * su rueda), tipos y progreso, cómo se compra (×1 o Máx.: todos los niveles que puedas
   * pagar), «Elegir de compañero» si no lo es y, a mano, tus Pokémon con mejoras (y los
   * favoritos) para cambiar de un toque. A la derecha, las mejoras por apartados
   * (G.Upgrades.GROUPS), una fila por mejora: icono · nombre, nivel, efecto y segmentos ·
   * UN botón con lo que cuesta (un nivel o, en Máx., «+N · total»). Las que tienen `desc`
   * la enseñan al tocar su nombre. Lo que no está en dev.html lo pone upgShell (una vez).
   */
  const UPG_QUICK = 6;            // Pokémon a mano, como mucho
  let upgDex = null, upgPartner = null, upgShiny = false, upgStageKey = '';
  let upgMode = 1;                // 1: de uno en uno · 0: al máximo (vuelve a ×1 al abrir)
  let upgQuickIds = [];           // los de la fila a mano (se fija al abrir: no bailan al comprar)
  let upgInfo = null;             // mejora con su explicación abierta
  let upgBump = null;             // la que se acaba de comprar (destello en su fila)
  const upgLv = d => { const u = (G.DB.save.pupg || {})[d] || {}; let t = 0; for (const k in u) if (G.Upgrades.BY[k]) t += +u[k] || 0; return t; };

  /** Lo que no está en dev.html: la cara del selector, cómo se compra, «Elegir de compañero» y la fila a mano. */
  function upgShell() {
    const who = document.querySelector('#scr-upgrades .upg-who');
    if (!who || $('upg-quick')) return;
    const sel = $('upg-mon');
    const face = document.createElement('div');
    face.className = 'upg-sel';
    face.innerHTML = `<span class="upg-face" aria-hidden="true"><span class="upg-fn"><b id="upg-name"></b><small id="upg-tag"></small></span>${G.UI.svg('down', 18)}</span>`;
    sel.parentNode.insertBefore(face, sel);
    face.appendChild(sel);
    who.insertAdjacentHTML('beforeend', `
      <div class="upg-mode"><span class="eyebrow" id="upg-mode-lbl">Comprar</span>
        <div class="seg" role="group" aria-labelledby="upg-mode-lbl">
          <button type="button" data-n="1" title="Un nivel cada vez">×1</button><button type="button" data-n="0" title="Todos los niveles que puedes pagar">Máx.</button></div></div>
      <button id="upg-partner" class="btn small gold block hidden" type="button" data-sfx="confirm">Elegir de compañero</button>`);
    who.parentNode.insertAdjacentHTML('beforeend', '<div class="upg-quick hidden" id="upg-quick"><span class="eyebrow">Tus Pokémon</span><div class="upg-qgrid" id="upg-qgrid"></div></div>');
    who.querySelectorAll('.upg-mode button').forEach(b => {
      b.onclick = () => { const n = +b.dataset.n; if (n === upgMode) return; upgMode = n; G.Audio.sfx('select'); renderUpgrades(); };
    });
    $('upg-partner').onclick = () => {
      const s = G.DB.save, mon = G.DEX_BY[upgDex];
      if (!mon || !s.owned[upgDex] || s.partner === upgDex) return;
      s.partner = upgDex; s.partnerShiny = false;
      upgPartner = upgDex;
      G.DB.commit();
      G.UI.toast(G.I18n.f('{x} es ahora tu compañero', mon.name));
      upgSelect();
      renderUpgrades();
    };
  }

  /** Las opciones del selector: el compañero primero, luego los que ya tienen mejoras. */
  function upgSelect() {
    const s = G.DB.save, sel = $('upg-mon');
    const mons = Object.keys(s.owned).map(Number).filter(d => G.DEX_BY[d])
      .sort((a, b) => (b === s.partner) - (a === s.partner) || upgLv(b) - upgLv(a) || a - b);
    sel.innerHTML = mons.map(d => `<option value="${d}">${G.DEX_BY[d].name}${d === s.partner ? ' (compañero)' : ''}${upgLv(d) ? ' · ' + upgLv(d) + ' niveles' : ''}</option>`).join('');
    sel.value = upgDex;
  }

  function openUpgrades() {
    G.UI.show('scr-upgrades', true);
    upgShell();
    const s = G.DB.save;
    // Se recuerda el último que miraste, salvo que hayas cambiado de compañero: entonces se abre en el nuevo.
    if (!upgDex || !s.owned[upgDex] || s.partner !== upgPartner) upgDex = s.partner;
    upgPartner = s.partner;
    upgMode = 1; upgInfo = null; upgBump = null; upgStageKey = '';
    upgSelect();
    const sel = $('upg-mon');
    sel.onchange = () => { upgDex = +sel.value; upgInfo = null; G.Audio.sfx('select'); renderUpgrades(); };
    // A mano: el compañero, los que más mejoras tienen y los favoritos.
    const ids = Object.keys(s.owned).map(Number).filter(d => G.DEX_BY[d] && (upgLv(d) > 0 || G.DB.isFav(d)))
      .sort((a, b) => upgLv(b) - upgLv(a) || G.DB.isFav(b) - G.DB.isFav(a) || a - b);
    upgQuickIds = [s.partner, ...ids].filter((d, i, a) => G.DEX_BY[d] && a.indexOf(d) === i).slice(0, UPG_QUICK);
    upgQuickBuild();
    renderUpgrades();
    const body = document.querySelector('#scr-upgrades .upg-body');
    if (body) body.scrollTop = 0;
  }

  /** La fila de Pokémon a mano (un sprite pequeño cada uno; se marca el que miras). */
  function upgQuickBuild() {
    const s = G.DB.save, wrap = $('upg-quick'), grid = $('upg-qgrid');
    grid.innerHTML = '';
    wrap.classList.toggle('hidden', upgQuickIds.length < 2);
    if (upgQuickIds.length < 2) return;
    for (const d of upgQuickIds) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'upg-q'; b.dataset.dex = d; b.dataset.sfx = 'none';
      b.title = G.DEX_BY[d].name;
      b.setAttribute('aria-label', G.DEX_BY[d].name);
      const shiny = d === s.partner && !!s.partnerShiny && G.DB.ownsShiny(d);
      b.appendChild(G.UI.spriteCanvas(d, 40, 36, { scale: 2, hero: true, shiny, twinkle: false }));
      b.insertAdjacentHTML('beforeend', '<small></small>');
      b.onclick = () => {
        if (upgDex === d) return;
        upgDex = d; upgInfo = null;
        $('upg-mon').value = d;
        G.Audio.sfx('select');
        renderUpgrades();
      };
      grid.appendChild(b);
    }
  }

  /** El lienzo del Pokémon de Mejoras mide lo mismo que su recuadro (cambia con la pantalla): píxeles enteros. */
  function fitUpg(force) {
    const cv = $('upg-stage'), box = $('upg-stage-box');
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h || upgDex == null) return false;
    if (!force && cv.width === w && cv.height === h) return true;
    cv.width = w; cv.height = h;
    G.UI.sprite(cv, upgDex, { lively: true, hero: true, shiny: upgShiny, scale: Math.max(2, Math.min(4, Math.floor(h / 44))) });
    return true;
  }

  function renderUpgrades() {
    const s = G.DB.save;
    const levels = G.DB.upgradesOf(upgDex);
    const mon = G.DEX_BY[upgDex];
    const isPartner = upgDex === s.partner;
    upgShiny = isPartner && !!s.partnerShiny && G.DB.ownsShiny(upgDex);
    const st = $('upg-stage-box');
    st.style.setProperty('--stage-c', upgShiny ? 'var(--c-cyan)' : G.U.TYPE_COLOR[mon.types[0]]);
    st.classList.toggle('shiny', upgShiny);
    // El sprite sólo se pone otra vez si cambia el Pokémon (al comprar no parpadea).
    const key = upgDex + (upgShiny ? 's' : '');
    if (key !== upgStageKey && fitUpg(true)) upgStageKey = key;
    $('upg-name').textContent = mon.name;
    $('upg-tag').textContent = isPartner ? 'Compañero' : '';
    $('upg-partner').classList.toggle('hidden', isPartner);
    document.querySelectorAll('#scr-upgrades .upg-mode button').forEach(b => {
      const on = +b.dataset.n === upgMode;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
    for (const b of $('upg-qgrid').children) {
      const d = +b.dataset.dex, n = upgLv(d);
      b.classList.toggle('on', d === upgDex);
      b.setAttribute('aria-pressed', d === upgDex);
      b.lastChild.textContent = n ? String(n) : '';
    }
    // Debajo del selector: sus tipos y cuántos niveles lleva de todos los que hay.
    const done = G.Upgrades.LIST.reduce((a, u) => a + Math.min(u.max, levels[u.id] || 0), 0);
    const all = G.Upgrades.LIST.reduce((a, u) => a + u.max, 0);
    $('upg-sum').innerHTML = `<span class="upg-types">${G.UI.typeChips(mon.types)}</span>
      <span class="upg-prog"><span class="meter green"><i style="width:${(done / all * 100).toFixed(1)}%"></i></span><b>${done}<small>/${all}</small></b></span>`;

    // La lista, por apartados (sin perder por dónde ibas: se rehace entera al comprar).
    const body = st.closest('.upg-body'), top = body ? body.scrollTop : 0;
    const box = $('upg-list');
    box.innerHTML = '';
    box.classList.toggle('mode-max', upgMode === 0);
    for (const g of G.Upgrades.GROUPS) {
      const list = G.Upgrades.LIST.filter(u => u.grp === g.id);
      if (!list.length) continue;
      const gd = list.reduce((a, u) => a + Math.min(u.max, levels[u.id] || 0), 0), ga = list.reduce((a, u) => a + u.max, 0);
      box.insertAdjacentHTML('beforeend', `<h3 class="upg-h"><span>${g.name}</span><small>${gd}/${ga}</small></h3>`);
      for (const u of list) {
        box.appendChild(upgRow(u, levels, mon));
        const lvl = levels[u.id] || 0;
        if (u.id === 'ban' && lvl > 0 && banOpen) box.appendChild(banPicker(lvl));
        if (u.id === 'start' && lvl > 0 && startOpen) box.appendChild(startPicker());
        if (u.id === 'start2' && lvl > 0 && start2Open) box.appendChild(start2Picker());
      }
      if (g.id === 'moves') box.appendChild(ringCard(mon));
    }
    box.appendChild(bindPanel());
    if (body) body.scrollTop = top;
    upgBump = null;
  }

  /** Segmentos del nivel (uno por nivel) y la cifra «3/10» que va junto al nombre. */
  const upgPips = (lvl, max) => `<span class="upg-pips" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;

  /** Una fila de Mejoras: icono · nombre, nivel, efecto y segmentos · el botón de comprar. */
  function upgRow(u, levels, mon) {
    const s = G.DB.save, lvl = levels[u.id] || 0, maxed = lvl >= u.max;
    const cost = maxed ? 0 : G.Upgrades.cost(u.id, lvl);
    // Mejoras que necesitan otra (Segundo movimiento inicial → Repertorio).
    const locked = !maxed && u.needs && !levels[u.needs];
    const pick2 = u.id === 'start2' && lvl > 0 ? G.startMove2Of(upgDex) : null;
    const nf = v => v.toLocaleString(G.I18n.locale);
    // Debajo (sólo si hace falta): elegir movimientos o vetos, «necesita…» y qué hace.
    const more = [];
    if (u.id === 'ban' && lvl > 0) more.push(`<button class="btn small upg-pick${banOpen ? ' on' : ''}" type="button" data-ban aria-expanded="${banOpen}">Elegir (${banList().length}/${lvl})</button>`);
    if (u.id === 'start' && lvl > 0) {
      const id = G.startMoveOf(upgDex);
      more.push(`<button class="btn small ic upg-pick${startOpen ? ' on' : ''}" type="button" data-start aria-expanded="${startOpen}">${G.Icons.html('move:' + id, 30)}<span>Elegir: ${G.Moves.BY_ID[id].name}</span></button>`);
    }
    if (u.id === 'start2' && lvl > 0) {
      more.push(`<button class="btn small ic upg-pick${start2Open ? ' on' : ''}" type="button" data-start2 aria-expanded="${start2Open}">${pick2 ? G.Icons.html('move:' + pick2, 30) : ''}<span>Elegir: ${pick2 ? G.Moves.BY_ID[pick2].name : G.T('Al azar')}</span></button>`);
    }
    if (locked) more.push(`<span class="upg-lock">${G.UI.svg('lock', 16)}<span>${G.T('Necesita Repertorio')}</span></span>`);
    const info = !!u.desc && upgInfo === u.id;
    if (info) more.push(`<p class="upg-desc">${u.desc}</p>`);
    // Un solo botón: un nivel (×1) o todos los que puedas pagar (Máx.: «+N · total»).
    let act;
    if (maxed) act = `<span class="badge gold upg-maxed">${G.UI.svg('check', 14)}<span>Máx.</span></span>`;
    else {
      const [many, total] = upgMode === 0 && !locked ? maxBuy(u, lvl, s.coins) : [0, 0];
      const k = many > 1 ? many : 1, price = many > 1 ? total : cost;
      act = `<button class="btn small gold ic upg-buy${many > 1 ? ' many' : ''}" type="button" data-buy data-sfx="none" ${locked || s.coins < cost ? 'disabled' : ''}${locked ? ` title="${G.T('Primero compra Repertorio')}"` : ''}>`
        + (upgMode === 0 ? `<b class="upg-k">+${k}</b>` : '') + `${G.Icons.html('coin', 30)}<span>${nf(price)}</span></button>`;
    }
    const el = document.createElement('div');
    el.className = 'upg-card' + (maxed ? ' is-max' : '') + (locked ? ' is-locked' : '') + (upgBump === u.id ? ' bump' : '');
    el.dataset.id = u.id;
    el.innerHTML = `
      <span class="ico-tile s${maxed ? ' t-gold' : lvl ? ' t-green' : ''}">${G.Icons.html(u.icon, 30)}</span>
      <div class="upg-info${u.desc ? ' has-desc' : ''}"${u.desc ? ` role="button" tabindex="0" aria-expanded="${info}" title="${u.desc}"` : ''}>
        <div class="upg-top"><b>${u.name}</b>${u.desc ? G.UI.svg('info', 15) : ''}<span class="upg-num"><b>${lvl}</b>/${u.max}</span></div>
        <small>${u.unit}</small>${upgPips(lvl, u.max)}
      </div>
      <div class="upg-acts">${act}</div>
      ${more.length ? `<div class="upg-more">${more.join('')}</div>` : ''}`;
    const q = sel => el.querySelector(sel);
    if (u.desc) {
      const inf = q('.upg-info');
      inf.onclick = () => { upgInfo = upgInfo === u.id ? null : u.id; G.Audio.sfx('click'); renderUpgrades(); };
      inf.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inf.click(); } };
    }
    if (q('[data-ban]')) q('[data-ban]').onclick = () => { banOpen = !banOpen; renderUpgrades(); };
    if (q('[data-start]')) q('[data-start]').onclick = () => { startOpen = !startOpen; renderUpgrades(); };
    if (q('[data-start2]')) q('[data-start2]').onclick = () => { start2Open = !start2Open; renderUpgrades(); };
    // Comprar: se vuelve a leer todo al pulsar (la partida puede haber cambiado desde que se dibujó).
    if (q('[data-buy]')) q('[data-buy]').onclick = () => {
      const [k] = upgMode === 0 ? maxBuy(u, G.DB.upgradesOf(upgDex)[u.id] || 0, G.DB.save.coins) : [1];
      let got = 0;
      for (let i = 0; i < Math.max(1, k); i++) { const lv = buyLevel(u); if (!lv) break; got = lv; }
      if (got) bought(mon, u, got); else { G.Audio.sfx('error'); renderUpgrades(); }
    };
    return el;
  }

  /**
   * Pulsera Z (24-10-2026): los movimientos Z son de cada Pokémon. Como una mejora
   * de un nivel (se compra una vez y es para siempre, data/shop.js); debajo, cuántos
   * Cristales Z tienes y el botón para ir a por ellos a la Tienda Kecleon. No cuenta
   * en el progreso de mejoras de arriba.
   */
  function ringCard(mon) {
    const s = G.DB.save, has = G.Shop.ringHas(upgDex), price = G.Shop.RING_PRICE, n = G.Shop.zOwned().length;
    const el = document.createElement('div');
    el.className = 'upg-card upg-ring' + (has ? ' is-max' : '');
    el.innerHTML = `
      <span class="ico-tile s${has ? ' t-gold' : ''}">${G.Icons.html('zring', 30)}</span>
      <div class="upg-info"><div class="upg-top"><b>${G.T('Pulsera Z')}</b><span class="upg-num"><b>${has ? 1 : 0}</b>/1</span></div>
        <small>${G.T('Puede usar movimientos Z: con un Cristal Z y 2 ataques de su tipo en sus huecos')}</small>${upgPips(has ? 1 : 0, 1)}</div>
      <div class="upg-acts">${has ? `<span class="badge gold upg-maxed">${G.UI.svg('check', 14)}<span>${G.T('Máx.')}</span></span>`
        : `<button class="btn small gold ic upg-buy" type="button" data-buy data-sfx="none" ${s.coins < price ? 'disabled' : ''}>${G.Icons.html('coin', 30)}<span>${price.toLocaleString(G.I18n.locale)}</span></button>`}</div>
      <div class="upg-more"><button class="btn small ghost ic upg-pick" type="button" data-zshop>${G.Icons.html('z:' + mon.types[0], 30)}<span>${G.I18n.f('Cristales Z: {x}', n + '/' + G.Shop.Z_TYPES.length)}</span></button></div>`;
    const b = el.querySelector('[data-buy]');
    if (b) b.onclick = () => {
      const r = G.Shop.buy('zr:' + upgDex);
      if (!r.ok) { if (r.error) G.UI.toast(r.error); G.Audio.sfx('error'); renderUpgrades(); return; }
      G.Audio.sfx('buy');
      G.UI.refreshCoins();
      G.UI.toast(`${mon.name} · ${G.T('Pulsera Z')}`);
      renderUpgrades();
    };
    el.querySelector('[data-zshop]').onclick = () => G.ShopUI.open('z');
    return el;
  }

  /** Compra un nivel de la mejora u del Pokémon que se ve (sin guardar). → nivel nuevo, o 0 si no se puede. */
  function buyLevel(u) {
    // Se vuelve a leer todo al pulsar (la partida puede haber cambiado desde que se dibujó).
    const sv = G.DB.save, lv = G.DB.upgradesOf(upgDex), now = lv[u.id] || 0;
    if (now >= u.max || (u.needs && !lv[u.needs])) return 0;
    const price = G.Upgrades.cost(u.id, now);
    if (sv.coins < price) return 0;
    sv.coins -= price;
    lv[u.id] = now + 1;
    return now + 1;
  }

  function bought(mon, u, lvl) {
    G.DB.commit(true);
    G.Audio.sfx('buy');
    G.UI.refreshCoins();
    G.UI.toast(`${mon.name} · ${u.name}: nivel ${lvl}`);
    upgBump = u.id;
    upgSelect();                 // «· N niveles» en el selector
    renderUpgrades();
  }

  /** Cuántos niveles seguidos de u se pueden pagar desde el nivel lvl → [niveles, coste total]. */
  function maxBuy(u, lvl, coins) {
    let k = 0, total = 0;
    while (lvl + k < u.max) {
      const c = G.Upgrades.cost(u.id, lvl + k);
      if (total + c > coins) break;
      total += c; k++;
    }
    return [k, total];
  }

  // ---------------- atajos: hueco fijo para cada movimiento ----------------
  // save.pbind[dex] = [movimiento del hueco 1, del 2, del 3, del 4] (o null).
  function bindPanel() {
    const s = G.DB.save;
    s.pbind = s.pbind || {};
    const list = s.pbind[upgDex] || [null, null, null, null];
    const mon = G.DEX_BY[upgDex];
    const ids = G.Moves.poolFor(mon).concat([G.startMoveOf(upgDex)]).filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => G.Moves.BY_ID[a].name.localeCompare(G.Moves.BY_ID[b].name, 'es'));
    const el = document.createElement('div');
    el.className = 'upg-panel upg-binds';
    el.innerHTML = `<div class="upg-ph"><span class="ico-tile s">${G.Icons.html('cards', 30)}</span><b>Atajos de movimientos</b></div>
      <p class="sub">Elige qué movimiento va siempre en cada hueco (teclas 1-4 o los iconos de abajo), para la memoria muscular. Si aún no tienes tantos movimientos, va al hueco más cercano.</p>
      <div class="upg-slots">${[0, 1, 2, 3].map(i => `<label class="upg-slot"><span class="upg-sn">${i + 1}</span>
        <select class="field" data-slot="${i}"><option value="">Libre</option>${ids.map(id =>
          `<option value="${id}" ${list[i] === id ? 'selected' : ''}>${G.T(G.Moves.BY_ID[id].name, 'move')}</option>`).join('')}</select></label>`).join('')}</div>`;
    el.querySelectorAll('select[data-slot]').forEach(sel => {
      sel.onchange = () => {
        const l = (s.pbind[upgDex] || [null, null, null, null]).slice(0, 4);
        while (l.length < 4) l.push(null);
        const i = +sel.dataset.slot, id = sel.value || null;
        // Un movimiento sólo puede estar en un hueco.
        for (let j = 0; j < 4; j++) if (id && l[j] === id) l[j] = null;
        l[i] = id;
        s.pbind[upgDex] = l;
        G.DB.commit();
        G.Audio.sfx('select');
        renderUpgrades();
      };
    });
    return el;
  }

  /** Panel desplegable debajo de una tarjeta de Mejoras: una frase y chips de movimientos (con su disco MT). */
  function movePanel(text, chipsHtml) {
    const el = document.createElement('div');
    el.className = 'upg-panel';
    el.innerHTML = `<p class="sub">${text}</p><div class="upg-chips">${chipsHtml}</div>`;
    return el;
  }

  // ---------------- movimiento inicial (Mejoras → Movimiento inicial) ----------------
  let startOpen = false;
  function startPicker() {
    const s = G.DB.save, cur = G.startMoveOf(upgDex), base = G.baseStartOf(upgDex);
    const ids = G.startChoices(upgDex).sort((a, b) => G.Moves.BY_ID[a].name.localeCompare(G.Moves.BY_ID[b].name, 'es'));
    const el = movePanel('Elige con qué ataque empieza. Lo puedes cambiar cuando quieras, gratis.', ids.map(id => { const d = G.Moves.BY_ID[id];
      return `<button class="chip mv-chip${id === cur ? ' on' : ''}" type="button" data-id="${id}" aria-pressed="${id === cur}">${G.Icons.html('move:' + id, 30)}<span>${d.name}</span>${id === base ? '<small>(de serie)</small>' : ''}</button>`; }).join(''));
    el.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        s.pstart = s.pstart || {};
        if (id === base) delete s.pstart[upgDex]; else s.pstart[upgDex] = id;
        // Si era el segundo inicial, el segundo vuelve a salir al azar.
        if (s.pstart2 && s.pstart2[upgDex] === id) delete s.pstart2[upgDex];
        // El inicial no puede estar vetado.
        const l = banList(), i = l.indexOf(id);
        if (i >= 0) l.splice(i, 1);
        G.DB.commit();
        G.Audio.sfx('select');
        G.UI.toast(G.DEX_BY[upgDex].name + ' empezará con ' + G.Moves.BY_ID[id].name);
        renderUpgrades();
      };
    });
    return el;
  }

  // ---------------- segundo movimiento inicial (con Repertorio) ----------------
  // save.pstart2[dex]; sin elegir (o "Al azar"), el segundo sale al azar como siempre.
  let start2Open = false;
  function start2Picker() {
    const s = G.DB.save, cur = G.startMove2Of(upgDex), first = G.startMoveOf(upgDex);
    const ids = G.startChoices(upgDex).filter(id => id !== first)
      .sort((a, b) => G.Moves.BY_ID[a].name.localeCompare(G.Moves.BY_ID[b].name, 'es'));
    const el = movePanel('Elige el segundo ataque con el que empieza. Lo puedes cambiar cuando quieras, gratis.',
      `<button class="chip${!cur ? ' on' : ''}" type="button" data-id="" aria-pressed="${!cur}">${G.T('Al azar')}</button>` + ids.map(id => { const d = G.Moves.BY_ID[id];
        return `<button class="chip mv-chip${id === cur ? ' on' : ''}" type="button" data-id="${id}" aria-pressed="${id === cur}">${G.Icons.html('move:' + id, 30)}<span>${d.name}</span></button>`; }).join(''));
    el.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        s.pstart2 = s.pstart2 || {};
        if (!id) delete s.pstart2[upgDex]; else s.pstart2[upgDex] = id;
        // El elegido no puede estar vetado.
        const l = banList(), i = id ? l.indexOf(id) : -1;
        if (i >= 0) l.splice(i, 1);
        G.DB.commit();
        G.Audio.sfx('select');
        G.UI.toast(id ? G.I18n.f('{x} empezará también con {x}', G.DEX_BY[upgDex].name, G.Moves.BY_ID[id].name)
                      : G.T('El segundo ataque saldrá al azar'));
        renderUpgrades();
      };
    });
    return el;
  }

  // ---------------- veto: movimientos bloqueados ----------------
  // Lista por Pokémon en save.pban[dex]; con N niveles de Veto, N movimientos.
  let banOpen = false;
  function banList() {
    const s = G.DB.save;
    s.pban = s.pban || {};
    return s.pban[upgDex] || (s.pban[upgDex] = []);
  }
  function banPicker(max) {
    const mon = G.DEX_BY[upgDex];
    const start = G.startMoveOf(upgDex), start2 = G.startMove2Of(upgDex);
    const ids = G.Moves.poolFor(mon).filter(id => id !== start && id !== start2)
      .sort((a, b) => G.Moves.BY_ID[a].name.localeCompare(G.Moves.BY_ID[b].name, 'es'));
    const list = banList();
    const el = movePanel(`Toca los movimientos que no quieres que te salgan en las cartas (${list.length}/${max}). El movimiento de inicio no se puede vetar.`,
      ids.map(id => { const d = G.Moves.BY_ID[id]; const on = list.includes(id);
        return `<button class="chip mv-chip${on ? ' on ban' : ''}" type="button" data-id="${id}" aria-pressed="${on}">${G.Icons.html('move:' + id, 30)}<span>${G.T(d.name, 'move')}</span>${on ? G.Icons.html('ban', 30) : ''}</button>`; }).join(''));
    el.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => {
        const l = banList(), id = b.dataset.id, i = l.indexOf(id);
        if (i >= 0) l.splice(i, 1);
        else if (l.length >= max) { G.UI.toast('Ya tienes ' + max + ' vetados: quita uno primero'); return; }
        else l.push(id);
        G.DB.commit();
        G.Audio.sfx('select');
        renderUpgrades();
      };
    });
    return el;
  }

  return { init, open, openDex, fitTiles, GEN_NAMES };
})();
