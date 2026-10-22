/* ============ menu.js — menú principal, colección y mejoras ============ */
G.MenuUI = (() => {
  const $ = G.UI.$;
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  let dexGen = 1, dexSel = null;
  // Filtros de la colección (se combinan): tengo / me faltan, rarezas (varias),
  // shiny, favoritos, tipo y búsqueda; y el orden. Duran mientras no recargas.
  const DEX0 = () => ({ status: 'all', rar: new Set(), shiny: false, fav: false, type: '', q: '', sort: 'num' });
  let dexF = DEX0();
  const SORTS = [['num', 'Nº'], ['name', 'Nombre'], ['rar', 'Rareza'], ['new', 'Recién conseguidos'], ['used', 'Más usados']];

  function init() {
    const ICON = { play: 'ball', dex: 'book', upgrades: 'up', shop: 'shop', bag: 'bag', gacha: 'ball4', goals: 'medal3', friends: 'friends', rank: 'trophy', settings: 'gear' };
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
      };
    });
    // Sólo los «Volver» de las cabeceras de hoja: otros data-back (p. ej. «Ahora no» de
    // recuperar la cuenta) son para Esc y el botón B, y ya tienen su propio clic.
    document.querySelectorAll('.sheet-head [data-back]').forEach(b => { b.onclick = open; });
    // Colección en el móvil en vertical: con la ficha abierta, «Volver» la cierra primero.
    $('scr-dex').querySelector('[data-back]').onclick = () => {
      if (sheetOn()) sheet(false); else { $('scr-dex').classList.remove('detail-open'); open(); }
    };
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
        else if (G.UI.isOpen('scr-menu')) fitPartner(false);
      });
    });
    // Móvil tumbado ↔ de pie: las casillas de la colección cambian de tamaño (lienzos enteros, no estirados).
    const onCompact = () => { if (G.UI.isOpen('scr-dex')) renderGrid(true); };
    if (COMPACT.addEventListener) COMPACT.addEventListener('change', onCompact); else if (COMPACT.addListener) COMPACT.addListener(onCompact);
    $('btn-logout').onclick = () => {
      if (G.DB.guest && !confirm('Eres invitado: se perderá todo el progreso. ¿Salir?')) return;
      G.Audio.music(null);
      G.DB.logout().then(() => G.Flow.toLogin());
    };
  }

  // ---------------- menú principal ----------------

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
    G.UI.sprite(cv, partner.dex, { lively: true, scale: Math.max(2, Math.floor(h / 34)), hero: true, shiny: partner.shiny });
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

    const owned = Object.keys(s.owned).filter(d => G.DEX_BY[d]).length;
    const shinies = Object.keys(s.shiny || {}).length;
    $('menu-dex-count').textContent = `${owned} / ${G.DEX.length}` + (shinies ? ` · ${shinies} shiny` : '');

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

  // ---------------- colección ----------------
  // Hoja (dev.html, #scr-dex): cabecera con las regiones; debajo, la lista
  // (buscador, filtros y rejilla) y la ficha (#dex-detail). Diseño: style.css,
  // «pantallas: coleccion».

  const mq = q => (window.matchMedia ? matchMedia(q) : { matches: false });
  // Móvil de pie (estrecho y alto): la ficha ocupa toda la hoja en vez de ir al lado de la lista.
  const NARROW = mq('(max-width: 760px) and (min-height: 521px)');
  // Móvil tumbado: casillas más pequeñas (su lienzo, no estirado con CSS).
  const COMPACT = mq('(max-height: 520px)');
  let listTop = 0;
  const sheetOn = () => NARROW.matches && $('scr-dex').classList.contains('detail-open');
  /** Lo que se desplaza en la lista: la rejilla sola (pantallas altas) o la columna entera (bajas). */
  function listScroller() {
    const grid = $('dex-grid');
    return getComputedStyle(grid).overflowY === 'visible' ? $('dex-list') : grid;
  }
  /** Abre o cierra la ficha a pantalla completa; al cerrarla, la lista sigue donde estaba. */
  function sheet(on) {
    const scr = $('scr-dex');
    if ((on && !NARROW.matches) || on === scr.classList.contains('detail-open')) return;
    if (on) listTop = listScroller().scrollTop;
    scr.classList.toggle('detail-open', on);
    if (on) $('dex-detail').scrollTop = 0; else listScroller().scrollTop = listTop;
  }
  /** Desliza una fila de pestañas o chips lo justo para que se vea el (sin mover nada más). */
  function keepInView(strip, el) {
    if (!el) return;
    const r = el.getBoundingClientRect(), s = strip.getBoundingClientRect();
    if (r.left < s.left) strip.scrollLeft -= s.left - r.left + 16;
    else if (r.right > s.right) strip.scrollLeft += r.right - s.right + 16;
  }

  function openDex() {
    const first = !G.UI.isOpen('scr-dex');
    if (first) $('scr-dex').classList.remove('detail-open');   // se entra siempre a la lista
    G.UI.show('scr-dex', true);
    const s = G.DB.save;
    if (dexSel == null) { dexSel = s.partner; dexGen = G.DEX_BY[s.partner].gen; }
    const owned = Object.keys(s.owned).filter(d => G.DEX_BY[d]).length;
    $('dex-total').innerHTML = `${G.Icons.html('ball', 30)}<b>${owned}</b><span>/ ${G.DEX.length}</span>`;

    // Pestañas de región (y "Todas"), con cuántos tienes de cada una y una barrita de progreso.
    // Al repintar no vuelven al principio: la elegida sigue a la vista.
    const tabs = $('dex-gens'), tabsX = tabs.scrollLeft;
    tabs.innerHTML = '';
    ['Todas', ...GEN_NAMES].forEach((name, g) => {
      const list = g ? G.DEX.filter(p => p.gen === g) : G.DEX;
      const have = list.filter(p => s.owned[p.dex]).length;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gen-tab' + (g === dexGen && !dexF.q ? ' on' : '');
      b.innerHTML = `<b>${name}</b><small>${have}/${list.length}</small><span class="dx-gbar"><i style="width:${Math.round(have / list.length * 100)}%"></i></span>`;
      b.onclick = () => { dexGen = g; openDex(); };
      tabs.appendChild(b);
    });
    tabs.scrollLeft = tabsX;
    if (first) keepInView(tabs, tabs.querySelector('.on'));

    // Filtros en chips: tengo / me faltan (uno), shiny, favoritos y rarezas (las que quieras).
    const row = $('dex-row'), tools = $('dex-tools'), rowX = row.scrollLeft, toolsX = tools.scrollLeft;
    const fb = $('dex-filters');
    fb.innerHTML = '';
    const chip = (html, on, fn) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip' + (on ? ' on' : '');
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
      c.innerHTML = html;
      c.onclick = () => { fn(); openDex(); };
      fb.appendChild(c);
    };
    const sep = () => fb.insertAdjacentHTML('beforeend', '<span class="dx-sep" aria-hidden="true"></span>');
    for (const [k, label] of [['all', 'Todos'], ['own', 'Tengo'], ['miss', 'Me faltan']]) chip(label, dexF.status === k, () => { dexF.status = k; });
    sep();
    chip(G.Icons.html('shiny', 16) + '<span>Shiny</span>', dexF.shiny, () => { dexF.shiny = !dexF.shiny; });
    chip(G.Icons.html('star', 30) + '<span>Favoritos</span>', dexF.fav, () => { dexF.fav = !dexF.fav; });
    sep();
    for (const r of [5, 4, 3, 2, 1]) {
      chip(G.Icons.html(G.Icons.RARITY_BALL[r], 30) + `<span>${G.Gacha.RARITY_NAME[r]}</span>`, dexF.rar.has(r),
        () => { dexF.rar.has(r) ? dexF.rar.delete(r) : dexF.rar.add(r); });
    }
    row.scrollLeft = rowX; tools.scrollLeft = toolsX;

    // Orden y tipo: dos desplegables en píldora, al principio de la fila de filtros.
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

    // Búsqueda (mira en todas las generaciones).
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
    $('dex-clear').onclick = () => { dexF = DEX0(); openDex(); };
    renderGrid();
    showDetail(dexSel);
  }

  /** Lo que se ve con la generación, los filtros y el orden de ahora. */
  function dexList() {
    const s = G.DB.save, f = dexF;
    const q = f.q.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const num = /^#?\d+$/.test(q) ? +q.replace('#', '') : null;
    const list = G.DEX.filter(p => {
      const own = !!s.owned[p.dex];
      if (q) {
        // Por número, o por nombre (sin tildes); de los que no tienes no se busca el nombre.
        if (num != null ? p.dex !== num : !(own && [p.name, G.T(p.name)].some(name => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)))) return false;
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
                 used: (a, b) => used(b) - used(a) || a.dex - b.dex }[f.sort];
    // Los que no tienes no tienen nombre a la vista: al ordenar por nombre van al final.
    if (f.sort === 'name') list.sort((a, b) => (!s.owned[a.dex]) - (!s.owned[b.dex]) || by(a, b)); else list.sort(by);
    return list;
  }

  /*
   * La rejilla se pinta por tandas de PAGE: con "Todas" son 966 Pokémon, cada
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
    const f = dexF, busy = f.q || f.status !== 'all' || f.shiny || f.fav || f.rar.size || f.type || f.sort !== 'num';
    $('dex-count').textContent = gridList.length === 1 ? '1 Pokémon' : gridList.length + ' Pokémon';
    $('dex-clear').classList.toggle('hidden', !busy);
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
    cell.tabIndex = 0;
    const marks = [];
    if (p.dex === s.partner) marks.push(['Compañero', G.Icons.html('crown', 30)]);
    else if (sh) marks.push(['Tienes su shiny', G.Icons.html('shiny', 16)]);
    if (G.DB.isFav(p.dex)) marks.push(['Favorito', G.Icons.html('star', 30)]);
    if (judged(p.dex)) marks.push(['Llegó a la Sentencia de Arceus', G.Icons.html('trophy', 30)]);
    cell.innerHTML = `<span class="no">${String(p.dex).padStart(3, '0')}</span><span class="dx-ball">${G.Icons.rarity(p.rarity, 30)}</span>` +
      (marks.length ? `<span class="dx-marks">${marks.map(([t, h]) => `<span title="${t}">${h}</span>`).join('')}</span>` : '');
    const useShiny = sh && p.dex === s.partner && s.partnerShiny;
    const [w, h] = COMPACT.matches ? [76, 64] : [92, 80];
    cell.appendChild(G.UI.spriteCanvas(p.dex, w, h, { scale: 2, silhouette: !own, shadow: own, shiny: useShiny }));
    cell.insertAdjacentHTML('beforeend', `<b>${own ? p.name : '???'}</b>`);
    cell.onclick = () => {
      dexSel = p.dex;
      $('dex-grid').querySelectorAll('.cell').forEach(c => c.classList.remove('on'));
      cell.classList.add('on');
      sheet(true);            // primero la hoja: así la ficha ya se ve y su escenario se puede medir
      showDetail(p.dex);
    };
    // Con el teclado: Intro o espacio la abren, como un botón.
    cell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); } };
    return cell;
  }

  // Variante que se está viendo en la ficha (normal o shiny) y lo que pinta su escenario.
  let viewShiny = false, big = null;

  /**
   * El lienzo grande de la ficha mide lo mismo que su escenario (cambia con la
   * pantalla): cada píxel del sprite son píxeles enteros. Si la ficha aún no se
   * ve (móvil de pie, con la lista delante), se ajusta al abrirla.
   */
  function fitBig(force) {
    const cv = $('dex-big');
    if (!cv || !big) return;
    const box = cv.parentElement, w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    if (!force && cv.width === w && cv.height === h) return;
    cv.width = w; cv.height = h;
    G.UI.sprite(cv, big.dex, { lively: big.own, spin: big.own, silhouette: !big.own, hero: true, shiny: big.shiny,
      scale: Math.max(2, Math.min(5, Math.floor(h / 40))) });   // (128 px tumbado → ×3; 188-208 → ×4-5; «hero» lo baja si no cabe)
  }

  function showDetail(dex) {
    const s = G.DB.save;
    const p = G.DEX_BY[dex];
    const own = !!s.owned[dex];
    const hasSh = G.DB.ownsShiny(dex);
    const isPartner = dex === s.partner;
    if (!hasSh) viewShiny = false;
    else if (isPartner && dex !== showDetail.last) viewShiny = !!s.partnerShiny;
    if (dex !== showDetail.last) extraOpen = '';
    // Al redibujar el mismo Pokémon (abrir el selector de Menta, enseñar una MT...)
    // no se vuelve arriba: se quedaba fuera de la vista lo que acababas de abrir.
    const box = $('dex-detail');
    const keepTop = dex === showDetail.last ? box.scrollTop : 0;
    showDetail.last = dex;

    const max = { hp: 183, atk: 1.55, spd: 137, def: 160 };
    // Con su naturaleza (20-10-2026): el stat que sube, en verde; el que baja, en rojo.
    const nat = own ? G.Mons.natureOf(dex) : null, q = own ? G.Mons.monFor(dex) : p;
    const natCls = k => (!nat ? '' : nat.up === k ? ' up' : nat.down === k ? ' down' : '');
    const bar = (label, v, m, txt, k) =>
      `<div class="dx-stat${natCls(k)}"><span>${label}</span><span class="dx-bar"><i style="width:${Math.min(100, v / m * 100).toFixed(1)}%"></i></span><b>${txt}</b></div>`;
    const usingThis = isPartner && (!hasSh || !!s.partnerShiny === viewShiny);
    const gen = GEN_NAMES[p.gen - 1];
    const fav = own && G.DB.isFav(dex), favTxt = fav ? 'Favorito' : 'Marcar como favorito';
    const start = G.startMoveOf(dex);

    box.innerHTML = `<div class="dx-in">
      <div class="dx-stage${own && viewShiny ? ' shiny' : ''}" id="dex-stage">
        <canvas id="dex-big"></canvas>
        <span class="dx-no"><b>#${String(p.dex).padStart(3, '0')}</b><span>${gen}</span></span>
        ${own ? `<button id="dex-fav" class="icon-btn dx-fav${fav ? ' on' : ''}" type="button" aria-pressed="${fav}" aria-label="${favTxt}" title="${favTxt}">${G.Icons.html(fav ? 'star' : 'starDim', 30)}</button>` : ''}
      </div>
      ${hasSh ? `<div class="seg dx-seg">
          <button type="button" class="${viewShiny ? '' : 'on'}" data-v="0">Normal</button>
          <button type="button" class="${viewShiny ? 'on' : ''}" data-v="1">${G.Icons.html('shiny', 16)} Shiny</button></div>` : ''}
      <div class="dx-id">
        <h3 class="dx-name">${own ? p.name : '???'}</h3>
        <span class="dx-rar" style="color:${G.Gacha.RARITY_COLOR[p.rarity]}">${G.Icons.rarity(p.rarity, 30)}<span>${G.Gacha.RARITY_NAME[p.rarity]}</span></span>
      </div>
      ${own ? `<div class="dx-types">${G.UI.typeChips(p.types)}</div>` : ''}
      ${own && judged(dex) ? `<p class="dx-judged">${G.Icons.html('trophy', 30)}<span>Llegó a la Sentencia de Arceus</span>
        <small>${new Date(judged(dex)).toLocaleDateString(G.I18n.locale)}</small></p>` : ''}
      ${own ? `
        <section class="dx-sec">
          <h4 class="dx-h">Estadísticas</h4>
          <div class="dx-stats">
            ${bar('Vida', q.hp, max.hp, q.hp)}
            ${bar('Ataque', q.pa, max.atk, '×' + q.pa.toFixed(2), 'pa')}
            ${bar('At. Esp.', q.sa, max.atk, '×' + q.sa.toFixed(2), 'sa')}
            ${bar('Defensa', q.df, max.def, Math.round(q.df), 'df')}
            ${bar('Def. Esp.', q.sd, max.def, Math.round(q.sd), 'sd')}
            ${bar('Velocidad', q.spd, max.spd, Math.round(q.spd), 'spd')}
          </div>
          <p class="dx-note">Pega mejor con ataques <b class="gold">${G.Stats.sideOf(q) === 'special' ? 'especiales' : 'físicos'}</b></p>
          ${p.types.length === 1 ? `<p class="dx-note">Monotipo: +20 % de daño con sus ataques de tipo ${G.U.TYPE_NAME[p.types[0]]}</p>` : ''}
        </section>
        ${monExtras(dex)}
        <section class="dx-sec">
          <h4 class="dx-h">Movimientos que puede aprender</h4>
          <p class="dx-start">${G.Icons.html('move:' + start, 30)}<span>Empieza con <b class="gold">${G.T(G.Moves.BY_ID[start].name, 'move')}</b></span></p>
          <div class="dx-moves">${G.Moves.poolFor(p).map(id => { const nm = G.T(G.Moves.BY_ID[id].name, 'move');
            return `<button type="button" class="dx-mv" title="${nm}" aria-label="${nm}">${G.Icons.html('move:' + id, 30)}</button>`; }).join('')}</div>
        </section>
        <div class="dx-foot">${usingThis
          ? `<div class="dx-partner">${G.Icons.html('crown', 30)}<span>Es tu compañero</span></div>`
          : `<button id="dex-pick" class="btn gold block" type="button" data-sfx="confirm">Elegir de compañero${viewShiny ? ' (shiny)' : ''}</button>`}</div>
      ` : `<div class="dx-missing"><p>Aún no lo tienes.<br>Consíguelo en el banner de <b class="gold">${gen}</b>
            o derrotándolo cuando salga shiny.</p></div>`}
    </div>`;
    box.scrollTop = keepTop;
    $('dex-stage').style.setProperty('--stage-c', !own ? 'var(--c-blue)' : viewShiny ? 'var(--c-cyan)' : G.U.TYPE_COLOR[p.types[0]]);
    big = { dex, own, shiny: own && viewShiny };
    fitBig(true);
    box.querySelectorAll('.dx-seg button').forEach(b => {
      b.onclick = () => { viewShiny = b.dataset.v === '1'; showDetail(dex); };
    });
    // En el móvil no se ve el «title» de los iconos: al tocar uno sale el nombre del movimiento.
    box.querySelectorAll('.dx-mv').forEach(el => { el.onclick = () => G.UI.toast(el.title); });
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
    if (own) wireExtras(dex, box);
  }

  // ---------------- naturaleza, habilidad y MT (Tienda Kecleon, 20-10-2026) ----------------
  // Se ven en la ficha de cada Pokémon y aquí se usan la Menta, las Cápsulas y las MT de la Mochila.
  const STAT_NAME = { pa: 'Ataque', sa: 'At. Esp.', df: 'Defensa', sd: 'Def. Esp.', spd: 'Velocidad' };
  let extraOpen = '';          // 'nat' | 'cap' | 'caph' | 'tm' | '' (qué selector está abierto)
  const natLine = n => (n.up ? `+${G.T(STAT_NAME[n.up])} −${G.T(STAT_NAME[n.down])}` : G.T('neutra'));

  /** Naturaleza, habilidad y MT en filas; a la derecha, el objeto de la Mochila que los cambia (si tienes). */
  function monExtras(dex) {
    const p = G.DEX_BY[dex], n = G.Mons.natureOf(dex), ab = G.Mons.abilityOf(dex);
    const fx = G.AbilityFX.of(ab.id, p), taught = G.Mons.taught(dex);
    const tmsHere = G.Mons.learnable(dex).filter(id => G.Shop.tmCount(id) > 0);
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
      <div class="dx-row">
        <div class="dx-rt"><span class="dx-lbl">MT</span>${taught.length ? '' : `<small>${G.T('Aún no ha aprendido ninguna')}</small>`}</div>
        ${btn('tm', 'tm', 'Enseñar MT', tmsHere.length)}
        ${taught.length ? `<div class="dx-tms">${taught.map(id => `<span class="dx-tm">${G.Icons.html('move:' + id, 30)}<span>${G.T(G.Moves.BY_ID[id].name, 'move')}</span></span>`).join('')}</div>` : ''}
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
      // Que se vea el selector recién abierto (sin que lo tape el botón de abajo).
      const r = host.getBoundingClientRect(), d = box.getBoundingClientRect();
      if (r.bottom > d.bottom - 72) box.scrollTop += Math.max(0, Math.min(r.top - d.top - 12, r.bottom - d.bottom + 72));
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
  // Hoja (dev.html, #scr-upgrades): el Pokémon (escenario, selector y progreso)
  // y una tarjeta por mejora: icono, nombre, efecto, nivel en segmentos y precio.

  let upgDex = null, upgPartner = null, upgShiny = false;

  function openUpgrades() {
    G.UI.show('scr-upgrades', true);
    const s = G.DB.save;
    // Se recuerda el último que miraste, salvo que hayas cambiado de compañero: entonces se abre en el nuevo.
    if (!upgDex || !s.owned[upgDex] || s.partner !== upgPartner) upgDex = s.partner;
    upgPartner = s.partner;
    // Selector con tus Pokémon: el compañero primero, luego los que ya tienen mejoras.
    const sel = $('upg-mon');
    const lv = d => Object.values(s.pupg[d] || {}).reduce((a, b) => a + b, 0);
    const mons = Object.keys(s.owned).map(Number).filter(d => G.DEX_BY[d])
      .sort((a, b) => (b === s.partner) - (a === s.partner) || lv(b) - lv(a) || a - b);
    sel.innerHTML = mons.map(d => `<option value="${d}">${G.DEX_BY[d].name}${d === s.partner ? ' (compañero)' : ''}${lv(d) ? ' · ' + lv(d) + ' niveles' : ''}</option>`).join('');
    sel.value = upgDex;
    sel.onchange = () => { upgDex = +sel.value; G.Audio.sfx('select'); renderUpgrades(); };
    renderUpgrades();
  }

  /** El lienzo del Pokémon de Mejoras mide lo mismo que su recuadro (cambia con la pantalla): píxeles enteros. */
  function fitUpg(force) {
    const cv = $('upg-stage'), box = $('upg-stage-box');
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h || upgDex == null) return;
    if (!force && cv.width === w && cv.height === h) return;
    cv.width = w; cv.height = h;
    G.UI.sprite(cv, upgDex, { lively: true, hero: true, shiny: upgShiny, scale: Math.max(2, Math.min(4, Math.floor(h / 44))) });
  }

  function renderUpgrades() {
    const s = G.DB.save;
    const levels = G.DB.upgradesOf(upgDex);
    const mon = G.DEX_BY[upgDex];
    upgShiny = upgDex === s.partner && !!s.partnerShiny && G.DB.ownsShiny(upgDex);
    const st = $('upg-stage-box');
    st.style.setProperty('--stage-c', upgShiny ? 'var(--c-cyan)' : G.U.TYPE_COLOR[mon.types[0]]);
    st.classList.toggle('shiny', upgShiny);
    fitUpg(true);
    // Debajo del selector: sus tipos y cuántos niveles lleva de todos los que hay.
    const done = G.Upgrades.LIST.reduce((a, u) => a + Math.min(u.max, levels[u.id] || 0), 0);
    const all = G.Upgrades.LIST.reduce((a, u) => a + u.max, 0);
    $('upg-sum').innerHTML = `<span class="upg-types">${G.UI.typeChips(mon.types)}</span>
      <span class="upg-prog"><span class="meter green"><i style="width:${(done / all * 100).toFixed(1)}%"></i></span><b>${done}<small>/${all}</small></b></span>`;

    const box = $('upg-list');
    box.innerHTML = '';
    for (const u of G.Upgrades.LIST) {
      const lvl = levels[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : G.Upgrades.cost(u.id, lvl);
      // Mejoras que necesitan otra (Segundo movimiento inicial → Repertorio).
      const locked = !maxed && u.needs && !levels[u.needs];
      const pick2 = u.id === 'start2' && lvl > 0 ? G.startMove2Of(upgDex) : null;
      const [many] = maxBuy(u, lvl, s.coins);
      // Segunda línea (sólo si hace falta): elegir movimientos o vetos, «necesita…» y «Máx. +N».
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
      if (!locked && many > 1) more.push(`<button class="btn small ghost upg-many" type="button" data-max data-sfx="none" title="Compra todos los niveles que puedes pagar">Máx. +${many}</button>`);
      const buy = maxed
        ? '<span class="badge gold upg-maxed">Máx.</span>'
        : `<button class="btn small gold ic upg-buy" type="button" data-buy data-sfx="none" ${locked || s.coins < cost ? 'disabled' : ''}${locked ? ` title="${G.T('Primero compra Repertorio')}"` : ''}>${G.Icons.html('coin', 30)}<span>${cost.toLocaleString(G.I18n.locale)}</span></button>`;
      const el = document.createElement('div');
      el.className = 'upg-card' + (maxed ? ' is-max' : '') + (locked ? ' is-locked' : '');
      el.innerHTML = `
        <span class="ico-tile${maxed ? ' t-gold' : lvl ? ' t-green' : ''}">${G.Icons.html(u.icon, 30)}</span>
        <div class="upg-info"><b>${u.name}</b><small>${u.unit}</small></div>
        <div class="upg-price">${buy}</div>
        <div class="upg-lv"><span class="upg-pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span><span class="upg-num"><b>${lvl}</b>/${u.max}</span></div>
        ${more.length ? `<div class="upg-more">${more.join('')}</div>` : ''}`;
      const q = sel => el.querySelector(sel);
      if (q('[data-ban]')) q('[data-ban]').onclick = () => { banOpen = !banOpen; renderUpgrades(); };
      if (q('[data-start]')) q('[data-start]').onclick = () => { startOpen = !startOpen; renderUpgrades(); };
      if (q('[data-start2]')) q('[data-start2]').onclick = () => { start2Open = !start2Open; renderUpgrades(); };
      if (q('[data-buy]')) q('[data-buy]').onclick = () => {
        const got = buyLevel(u);
        if (got) bought(mon, u, got); else renderUpgrades();
      };
      // Máx.: los niveles que llegues a pagar, uno a uno como el botón de comprar, y se guarda una vez.
      const mx = q('[data-max]');
      if (mx) mx.onclick = () => {
        const [k, total] = maxBuy(u, G.DB.upgradesOf(upgDex)[u.id] || 0, G.DB.save.coins);
        if (k < 1) { renderUpgrades(); return; }
        if (!confirm(`¿Comprar ${k} niveles de ${u.name} por ${total.toLocaleString(G.I18n.locale)} monedas?`)) return;
        let got = 0;
        for (let i = 0; i < k; i++) { const lv = buyLevel(u); if (!lv) break; got = lv; }
        if (got) bought(mon, u, got); else renderUpgrades();
      };
      box.appendChild(el);
      if (u.id === 'ban' && lvl > 0 && banOpen) box.appendChild(banPicker(lvl));
      if (u.id === 'start' && lvl > 0 && startOpen) box.appendChild(startPicker());
      if (u.id === 'start2' && lvl > 0 && start2Open) box.appendChild(start2Picker());
    }
    box.appendChild(bindPanel());
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

  return { init, open, openDex, GEN_NAMES };
})();
