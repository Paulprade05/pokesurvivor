/* ============ compendium-ui.js — Compendio: ataques, pasivas, objetos y Pokémon ============
 * (26-10-2026) Una hoja (#scr-compendium en dev.html; estilos en el bloque «compendio» del
 * final de style.css) con cuatro pestañas:
 *   Ataques   cada ataque (y los movimientos Z): icono, tipo, categoría, familia, qué hace,
 *             cómo sube por niveles (lo que da cada nivel y sus números), en qué evoluciona y
 *             con qué carta, qué pasivas le afectan y qué Pokémon lo pueden llevar.
 *   Pasivas   las cartas de mejora y las pasivas de la partida (G.LevelUp.STATS): qué hacen,
 *             cuántas veces se pueden coger, qué ataques hacen evolucionar y a qué familias afectan.
 *   Objetos   los objetos equipables (G.Items).
 *   Pokémon   qué ataques puede llevar cada Pokémon (los de sus tipos, los Normal y los de MT),
 *             su ataque inicial y su habilidad.
 * Todo se lee EN VIVO de los datos del juego (G.Moves, G.LevelUp, G.Items, G.DEX, G.Mons...):
 * si cambian los ataques, sus niveles o sus evoluciones, el compendio cambia solo. Aquí sólo
 * hay textos de la interfaz y una frase por familia (FAM_DESC).
 * A la izquierda, la lista con su buscador y sus filtros; a la derecha, la ficha. En una
 * ventana estrecha y alta (de pie) la ficha tapa la lista y «Volver» la cierra.
 * Se inicia sola la primera vez que se abre (menú principal: G.CompendiumUI.open()).
 */
G.CompendiumUI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Para buscar: en minúsculas y sin tildes. */
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const TYPES = () => Object.keys(G.U.TYPE_NAME);
  const typeCol = t => G.U.TYPE_COLOR[t] || '#9fb1c9';
  const moveName = m => G.T(m.name, 'move');
  // Ventana estrecha y alta (de pie): la ficha, encima de la lista.
  const NARROW = window.matchMedia ? matchMedia('(max-width: 699px) and (min-height: 521px)') : { matches: false };

  // Nombre de cada familia: el de las cartas (run-ui.js); si una familia nueva aún no lo tiene, su clave.
  const famName = k => ((G.RunUI && G.RunUI.KIND_NAME) || {})[k] || k;
  // Qué hace cada familia (lo mismo que la cabecera de data/moves.js, para el jugador).
  const FAM_DESC = {
    projectile: 'Dispara proyectiles al enemigo más cercano.',
    melee: 'Golpea en arco a los enemigos que tienes cerca.',
    beam: 'Un rayo recto que atraviesa todo lo que pilla.',
    orbit: 'Orbes que giran a tu alrededor y dañan al tocar.',
    nova: 'Una ráfaga de proyectiles en todas las direcciones.',
    aura: 'Un círculo a tu alrededor que daña sin parar.',
    buff: 'No hace daño: te potencia mientras está activo (se acumula y caduca).',
    boomerang: 'Sale hacia el enemigo y vuelve a ti, golpeando a la ida y a la vuelta.',
    chain: 'Golpea a un enemigo y salta a los siguientes más cercanos.',
    mine: 'Deja minas en el suelo que estallan al pisarlas.',
    meteor: 'Caen meteoros sobre los enemigos cercanos (avisa la sombra).',
    turret: 'Deja algo que dispara solo durante un rato.',
    dash: 'Cruzas hacia el enemigo golpeando todo el camino, sin recibir daño.',
    trail: 'Vas dejando charcos que dañan a lo que los pisa.',
    cone: 'Muchos disparos cortos en abanico.',
    homing: 'Proyectiles que persiguen al enemigo.',
    bounce: 'Un proyectil que rebota de enemigo en enemigo.',
    charge: 'Se carga un momento y sale un rayo enorme.',
    spin: 'Giras golpeando todo lo que te rodea varias veces seguidas.',
    quake: 'Una onda avanza por el suelo en línea, con varias explosiones.',
    vortex: 'Un remolino atrae a los enemigos a su centro y los va dañando.',
    shove: 'Una onda a tu alrededor que daña y aparta a los enemigos.',
    stun: 'Una zona con aviso que daña y deja aturdidos a los enemigos.',
    lob: 'Proyectiles en parábola: suben, caen sobre el enemigo y lo atraviesan.',
    knife: 'Una ráfaga de disparos rápidos hacia donde miras.',
    cross: 'Aspas repartidas a tu alrededor; algunas giran en espiral.',
    column: 'Columnas de arriba abajo, sobre ti o sobre el enemigo.',
    sweep: 'Un rayo anclado en ti que gira como la aguja de un reloj.',
    ricochet: 'Una bola que rebota en los bordes de una caja a tu alrededor.',
    wipe: 'Un barrido de pantalla que alcanza a todos los enemigos de una zona.',
    ward: 'Escudos: cada uno para un golpe y contraataca.',
    ally: 'Aliados que persiguen y golpean a los enemigos cercanos.',
    wings: 'Aves que vuelan en círculo lejos de ti y bombardean.',
    puddle: 'Frascos que caen sobre los enemigos y dejan charcos que dañan.',
    dusting: 'Una lluvia de caídas desde lo alto de la pantalla.'
  };
  // Pasivas que cambian los ataques (G.Moves.passiveAffects): a qué familias afectan.
  const PASS4 = ['area', 'dur', 'amt', 'pspd'];

  // ---------------- estado ----------------
  let tab = 'moves', ready = false;
  const F = {                                  // filtros de cada pestaña
    moves: { q: '', type: '', fam: '' },
    passives: { q: '' },
    items: { q: '' },
    mons: { q: '', type: '', mine: false }
  };
  const SEL = { moves: null, passives: null, items: null, mons: null };   // lo elegido en cada una

  // ---------------- datos (en vivo) ----------------
  const ZLIST = () => Object.values((G.Moves && G.Moves.Z) || {});
  /** Un ataque o movimiento Z por su id. */
  const moveDef = id => (G.Moves.get ? G.Moves.get(id) : G.Moves.BY_ID[id]) || null;
  /** Todos los ataques (por tipo y nombre) y, al final, los Z. */
  function allMoves() {
    const T = TYPES(), byName = (a, b) => moveName(a).localeCompare(moveName(b), G.I18n.locale);
    const list = G.Moves.ALL.slice().sort((a, b) => T.indexOf(a.type) - T.indexOf(b.type) || byName(a, b));
    return list.concat(ZLIST().slice().sort((a, b) => T.indexOf(a.type) - T.indexOf(b.type)));
  }
  const STATS = () => (G.LevelUp && G.LevelUp.STATS) || [];
  const isPass = id => (G.LevelUp.isPassive ? G.LevelUp.isPassive(id) : id !== 'heal');
  /** Ataques que evolucionan con la carta `id` (ids). */
  const evolvesWith = id => Object.keys(G.Moves.EVO || {}).filter(k => G.Moves.EVO[k][1] === id && G.Moves.BY_ID[k]);
  /*
   * Familias (29-10-2026, como la Pokédex: data/families.js): cada familia sale una vez, por su forma final
   * (Charizard; Charmander y Charmeleon, en su ficha). Se encuentra también por el nombre o el número de sus
   * preevoluciones, y «lo tienes» mira la forma final.
   */
  const famOn = () => !!(G.Fam && G.Fam.ready && G.Fam.ready());
  const monList = () => (famOn() ? G.Fam.FINALS.map(d => G.DEX_BY[d]).filter(Boolean) : G.DEX);
  /** La entrada de dex en la lista (si es una preevolución, su forma final). */
  const entryOf = dex => (famOn() && G.DEX_BY[dex] && !G.Fam.isFinal(dex) ? G.Fam.finalsOf(dex)[0] : dex);
  const lineOf = dex => (famOn() ? G.Fam.lineOf(dex) : [+dex]);
  /** Los Pokémon con el tipo t (todos con t = normal: el grupo Normal lo tienen todos). */
  const monsOfType = t => (t === 'normal' ? monList() : monList().filter(p => p.types.includes(t)));
  const owned = d => !!(G.DB.save && (G.DB.owns ? G.DB.owns(d) : G.DB.save.owned && G.DB.save.owned[d]));

  // ---------------- piezas ----------------
  const typeChip = t => `<span class="tag-chip" style="background:${typeCol(t)}">${G.U.TYPE_NAME[t] || ''}</span>`;
  const famChip = k => `<span class="fam-chip">${famName(k)}</span>`;
  /** Botón con el icono y el nombre de un ataque (lleva a su ficha). */
  const moveBtn = (id, extra = '') => {
    const m = moveDef(id);
    if (!m) return '';
    return `<button type="button" class="cmp-mv${extra}" data-go="m:${esc(id)}" style="--c:${typeCol(m.type)}">`
      + `${G.Icons.html(m.z ? 'z:' + m.type : 'move:' + id, 30)}<span>${esc(moveName(m))}</span></button>`;
  };
  /** Número con la coma o el punto del idioma (como mucho 2 decimales). */
  const num = (v, d = 2) => (Math.round(v * 100) / 100).toLocaleString(G.I18n.locale, { maximumFractionDigits: d });

  // Números de la tabla «cómo sube»: [clave, nombre, formato]. Sólo salen los que tiene el ataque.
  const ROWS = [
    ['dmg', 'Daño', v => num(v, v < 10 ? 1 : 0)],
    ['cd', 'Recarga', v => num(v) + ' s'],
    ['count', 'Cantidad', v => num(v, 0)],
    ['pierce', 'Perforación', v => num(v, 0)],
    ['bounce', 'Rebotes', v => num(v, 0)],
    ['radius', 'Alcance', v => num(v, 0)],
    ['dur', 'Duración', v => num(v, 1) + ' s'],
    ['stun', 'Aturdimiento', v => num(v, 1) + ' s'],
    ['amount', 'Efecto', v => '+' + num(v * 100, 0) + ' %'],
    ['stacks', 'Acumulaciones', v => num(v, 0)],
    ['pct', 'Efecto', v => num(v * 100, 0) + ' %']
  ];

  // ---------------- arranque ----------------
  function init() {
    if (ready) return;
    ready = true;
    document.querySelectorAll('#cmp-tabs .tab').forEach(t => {
      t.onclick = () => { if (tab === t.dataset.tab) return; tab = t.dataset.tab; detail(false); render(); };
    });
    // «Volver»: con la ficha tapando la lista (ventana estrecha), la cierra; si no, al menú.
    const back = document.querySelector('#scr-compendium .sheet-head [data-back]');
    back.onclick = () => { if (detailOn()) detail(false); else G.MenuUI.open(); };
    // Esc hace lo mismo que «Volver» (si no hay otra ventana encima ni se está escribiendo).
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !isOpen() || !onTop()) return;
      const a = document.activeElement;
      if (a && a.matches && a.matches('#cmp-tools input') && a.value) return;   // (el campo lo borra él)
      e.stopPropagation(); e.preventDefault(); back.click();
    }, true);
    // Clics en la lista y en la ficha (delegados: se redibujan a menudo).
    $('cmp-rows').addEventListener('click', e => {
      const r = e.target.closest('.cmp-row');
      if (!r) return;
      SEL[tab] = r.dataset.id;
      markSel();
      renderDetail();
      detail(true);
    });
    $('cmp-detail').addEventListener('click', e => {
      const b = e.target.closest('[data-go]');
      if (b) go(b.dataset.go);
      if (e.target.closest('.cmp-close')) detail(false);
    });
    // Al girar el móvil o cambiar de tamaño, deja de tapar la lista si ya cabe al lado.
    const onNarrow = () => { if (!NARROW.matches) detail(false); };
    if (NARROW.addEventListener) NARROW.addEventListener('change', onNarrow); else if (NARROW.addListener) NARROW.addListener(onNarrow);
  }

  const isOpen = () => !$('scr-compendium').classList.contains('hidden');
  /** ¿Es la ventana de más arriba? (con Ajustes o el perfil encima, Esc es para esa) */
  function onTop() {
    const el = $('scr-compendium'), z = x => parseInt(getComputedStyle(x).zIndex, 10) || 0, mine = z(el);
    for (const x of document.querySelectorAll('.scr:not(.hidden)')) if (x !== el && z(x) > mine) return false;
    return true;
  }
  const detailOn = () => $('scr-compendium').classList.contains('detail-open');
  function detail(on) {
    const scr = $('scr-compendium');
    on = !!on && NARROW.matches;
    if (on === scr.classList.contains('detail-open')) return;
    scr.classList.toggle('detail-open', on);
    if (on) $('cmp-detail').scrollTop = 0;
    else markSel(true);
  }

  /** Abre el compendio (t: pestaña; id: lo que se enseña en ella). */
  function open(t, id) {
    init();
    if (t && F[t]) tab = t;
    G.UI.show('scr-compendium', true);
    detail(false);
    // Con algo concreto (p. ej. desde los logros): sin filtros, para que salga en la lista.
    if (id != null) go({ moves: 'm', passives: 'p', items: 'i', mons: 'd' }[tab] + ':' + id);
    else render();
  }

  /** De la ficha a otra: m:ataque, p:pasiva, i:objeto, d:Pokémon, t:tipo (Pokémon de ese tipo), f:familia. */
  function go(ref) {
    const i = ref.indexOf(':'), k = ref.slice(0, i), v = ref.slice(i + 1);
    if (k === 'm') { tab = 'moves'; SEL.moves = v; Object.assign(F.moves, { q: '', type: '', fam: '' }); }
    else if (k === 'p') { tab = 'passives'; SEL.passives = v; F.passives.q = ''; }
    else if (k === 'i') { tab = 'items'; SEL.items = v; F.items.q = ''; }
    else if (k === 'd') { tab = 'mons'; SEL.mons = String(entryOf(+v)); Object.assign(F.mons, { q: '', type: '', mine: false }); }
    else if (k === 't') { tab = 'mons'; Object.assign(F.mons, { q: '', type: v === 'normal' ? '' : v, mine: false }); SEL.mons = null; }
    else if (k === 'f') { tab = 'moves'; Object.assign(F.moves, { q: '', type: '', fam: v }); SEL.moves = null; }
    else return;
    G.Audio.sfx('click');
    render();
    // En la ventana estrecha: a una ficha, se queda en la ficha; a una lista filtrada, a la lista.
    detail(k === 'm' || k === 'p' || k === 'i' || k === 'd');
  }

  // ---------------- pintar ----------------
  function render() {
    document.querySelectorAll('#cmp-tabs .tab').forEach(t => {
      const on = t.dataset.tab === tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('scr-compendium').dataset.tab = tab;
    renderTools();
    renderList();
    renderDetail();
  }

  /** Buscador y filtros de la pestaña. */
  function renderTools() {
    const f = F[tab], box = $('cmp-tools');
    const ph = { moves: 'Buscar ataque', passives: 'Buscar pasiva', items: 'Buscar objeto', mons: 'Buscar por nombre o número' }[tab];
    const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    let picks = '';
    if (tab === 'moves' || tab === 'mons') {
      picks += `<label class="cmp-pick${f.type ? ' on' : ''}" data-ico="filter" data-ico-size="16"><select data-f="type" aria-label="Tipo">`
        + opt('', 'Tipo', f.type) + TYPES().map(t => opt(t, G.U.TYPE_NAME[t], f.type)).join('') + '</select></label>';
    }
    if (tab === 'moves') {
      const kinds = [...new Set(G.Moves.ALL.map(m => m.kind))].sort((a, b) => G.T(famName(a)).localeCompare(G.T(famName(b)), G.I18n.locale));
      picks += `<label class="cmp-pick${f.fam ? ' on' : ''}" data-ico="sort" data-ico-size="16"><select data-f="fam" aria-label="Familia">`
        + opt('', 'Familia', f.fam) + kinds.map(k => opt(k, famName(k), f.fam)).join('') + opt('z', 'Movimientos Z', f.fam) + '</select></label>';
    }
    if (tab === 'mons') picks += `<button type="button" class="chip${f.mine ? ' on' : ''}" data-f="mine" aria-pressed="${f.mine}">${G.Icons.html('ball', 30)}<span>Tus Pokémon</span></button>`;
    // (Cuántos salen: dentro del buscador, a la derecha, para no gastar otra línea.)
    box.innerHTML = `<label class="cmp-q" data-ico="search" data-ico-size="18"><input class="field" type="search" id="cmp-q" placeholder="${esc(ph)}" `
      + `aria-label="${esc(ph)}" autocomplete="off" spellcheck="false" value="${esc(f.q)}"><span class="cmp-count" id="cmp-count" aria-hidden="true"></span></label>`
      + (picks ? `<div class="cmp-picks">${picks}</div>` : '');
    G.UI.icons(box);
    const q = $('cmp-q');
    q.oninput = () => { f.q = q.value; renderList(); };
    q.onkeydown = e => { if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; f.q = ''; renderList(); } };
    box.querySelectorAll('select[data-f]').forEach(s => {
      s.onchange = () => { f[s.dataset.f] = s.value; s.parentElement.classList.toggle('on', !!s.value); renderList(); renderDetail(); };
    });
    const mine = box.querySelector('[data-f="mine"]');
    if (mine) mine.onclick = () => { f.mine = !f.mine; mine.classList.toggle('on', f.mine); mine.setAttribute('aria-pressed', String(f.mine)); renderList(); renderDetail(); };
  }

  /** Lo que sale en la lista con los filtros de ahora. */
  function items() {
    const f = F[tab], q = norm(f.q).trim();
    if (tab === 'moves') {
      return allMoves().filter(m => (!f.type || m.type === f.type) && (!f.fam || (f.fam === 'z' ? m.z : !m.z && m.kind === f.fam))
        && (!q || norm(moveName(m)).includes(q) || norm(m.name).includes(q) || norm(G.T(famName(m.kind))).includes(q)));
    }
    if (tab === 'passives') return STATS().filter(s => !q || norm(G.T(s.title)).includes(q) || norm(s.title).includes(q));
    if (tab === 'items') return G.Items.LIST.filter(it => !q || norm(G.T(it.name)).includes(q) || norm(it.name).includes(q));
    const n = q.replace(/^#/, '');
    const hit = d => { const m = G.DEX_BY[d]; return !!m && (norm(G.T(m.name)).includes(q) || norm(m.name).includes(q) || (/^\d+$/.test(n) && String(d).startsWith(String(+n)))); };
    return monList().filter(p => (!f.type || p.types.includes(f.type)) && (!f.mine || owned(p.dex)) && (!q || lineOf(p.dex).some(hit)));
  }
  const idOf = x => String(tab === 'mons' ? x.dex : x.id);

  function rowHtml(x) {
    const id = idOf(x), on = id === SEL[tab];
    const a = `type="button" class="cmp-row${on ? ' on' : ''}" data-id="${esc(id)}" role="option" aria-selected="${on}"`;
    if (tab === 'moves') {
      // Marca: Z, o ✓ dorada si ya lo has evolucionado alguna vez (el logro «Maestro de movimientos»).
      const ok = !x.z && G.DB.save && G.DB.save.evoMoves && G.DB.save.evoMoves[x.id];
      const flag = x.z ? '<span class="cmp-flag z">Z</span>'
        : ok ? `<span class="cmp-flag evo ok" title="${esc(G.T('¡Conseguido!'))}">${G.UI.svg('check', 12)}</span>` : '';
      return `<button ${a} style="--c:${typeCol(x.type)}"><span class="ico-tile s tint" style="--tile-c:${typeCol(x.type)}">${G.Icons.html(x.z ? 'z:' + x.type : 'move:' + x.id, 30)}</span>`
        + `<span class="cmp-rt"><b>${esc(x.z ? G.T(x.name) : moveName(x))}</b><small><i class="cmp-dot" style="background:${typeCol(x.type)}"></i>`
        + `<span>${G.U.TYPE_NAME[x.type] || ''}</span> · <span>${famName(x.kind)}</span></small></span>${flag}</button>`;
    }
    if (tab === 'passives') {
      const tile = x.id === 'heal' ? 't-green' : PASS4.includes(x.id) || x.id === 'luck' ? 't-purple' : 't-blue';
      return `<button ${a}><span class="ico-tile s ${tile}">${G.Icons.html(x.icon, 30)}</span>`
        + `<span class="cmp-rt"><b>${esc(x.title)}</b><small>${esc(x.desc)}</small></span></button>`;
    }
    if (tab === 'items') {
      return `<button ${a}><span class="ico-tile s t-gold">${G.Icons.html(x.id, 30)}</span>`
        + `<span class="cmp-rt"><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></span></button>`;
    }
    return `<button ${a} style="--c:${typeCol(x.types[0])}"><span class="cmp-num">#${String(x.dex).padStart(3, '0')}</span>`
      + `<span class="cmp-rt"><b>${esc(x.name)}</b></span><span class="cmp-tys">${x.types.map(t => `<i style="background:${typeCol(t)}" title="${esc(G.U.TYPE_NAME[t])}"></i>`).join('')}</span>`
      + (owned(x.dex) ? `<span class="cmp-own" title="Lo tienes">${G.Icons.html('ball', 30)}</span>` : '') + '</button>';
  }

  function renderList() {
    const list = items(), box = $('cmp-rows');
    // Si lo elegido ya no sale con estos filtros, el primero que salga.
    if (!list.some(x => idOf(x) === SEL[tab])) {
      const first = tab === 'mons' && !SEL.mons && G.DB.save && list.find(p => p.dex === G.DB.save.partner);
      SEL[tab] = first ? String(first.dex) : list.length ? idOf(list[0]) : null;
    }
    box.innerHTML = list.length ? list.map(rowHtml).join('')
      : `<div class="cmp-empty">${G.UI.svg('search', 28)}<b>Sin resultados</b></div>`;
    const c = $('cmp-count');
    if (c) c.textContent = list.length;
    markSel(true);
  }

  /** Marca lo elegido en la lista y (scroll) lo trae a la vista. */
  function markSel(scroll) {
    const box = $('cmp-rows');
    let cur = null;
    box.querySelectorAll('.cmp-row').forEach(r => {
      const on = r.dataset.id === SEL[tab];
      r.classList.toggle('on', on);
      r.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) cur = r;
    });
    if (scroll && cur && box.clientHeight) {
      const top = cur.offsetTop - box.offsetTop, bot = top + cur.offsetHeight;
      if (top < box.scrollTop || bot > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 3);
    }
  }

  function renderDetail() {
    const box = $('cmp-detail'), id = SEL[tab];
    box.scrollTop = 0;
    let html = '';
    if (id != null) {
      if (tab === 'moves') html = moveDetail(id);
      else if (tab === 'passives') html = passiveDetail(id);
      else if (tab === 'items') html = itemDetail(id);
      else html = monDetail(+id);
    }
    // (La X sólo se ve en la ventana estrecha, donde la ficha tapa la lista.)
    box.innerHTML = html ? `<button type="button" class="icon-btn cmp-close" aria-label="Cerrar" title="Cerrar">${G.UI.svg('close')}</button>${html}`
      : `<div class="cmp-empty">${G.Icons.html('cards', 60)}<b>Elige algo de la lista</b></div>`;
    if (tab === 'mons' && id != null) monSprite(+id);
  }

  // ---------------- fichas ----------------
  const sec = (title, body, cls = '') => `<section class="cmp-sec${cls ? ' ' + cls : ''}"><h4>${title}</h4>${body}</section>`;
  /** Cabecera de una ficha: icono grande, nombre y etiquetas. */
  const hero = (icon, tile, title, tags, style = '') => `<div class="cmp-hero"${style}><span class="ico-tile l ${tile}">${icon}</span>`
    + `<div class="cmp-hero-t"><h3>${title}</h3>${tags ? `<div class="cmp-tags">${tags}</div>` : ''}</div></div>`;

  function moveDetail(id) {
    const def = moveDef(id);
    if (!def) return '';
    const col = typeCol(def.type), cat = G.Stats && G.Stats.NAME[def.cat];
    const tags = typeChip(def.type) + (cat ? `<span class="tag-chip cat">${cat}</span>` : '') + famChip(def.kind)
      + (def.z ? '<span class="badge gold">Z</span>' : '');
    let h = hero(G.Icons.html(def.z ? 'z:' + def.type : 'move:' + id, 60), 'tint', esc(def.z ? G.T(def.name) : moveName(def)), tags, ` style="--c:${col}"`)
      .replace('class="ico-tile l tint"', `class="ico-tile l tint" style="--tile-c:${col}"`);
    h += `<p class="cmp-desc">${esc(def.z ? G.T(def.desc) : def.desc)}</p>`;
    if (FAM_DESC[def.kind]) h += `<p class="cmp-fam"><button type="button" class="fam-chip" data-go="f:${esc(def.kind)}">${famName(def.kind)}</button><span>${FAM_DESC[def.kind]}</span></p>`;
    if (def.z) return h + zInfo(def);

    // Cómo sube: lo que da cada nivel y, debajo, los números del nivel 1, del máximo y evolucionado.
    const max = def.maxLvl || 1, ups = def.ups || [];
    const ladder = ups.map((u, i) => `<li><span class="badge ghost"><span>Nv.</span> ${i + 2}</span><span>${esc(u.t)}</span></li>`).join('');
    const a = G.Moves.instance(id, 1), b = G.Moves.instance(id, max);
    let e = null;
    if (G.Moves.EVO[id] && G.Moves.evolve) { e = G.Moves.instance(id, max); if (!G.Moves.evolve(e)) e = null; }
    const rows = ROWS.filter(([k]) => typeof def[k] === 'number' || typeof (b && b[k]) === 'number').map(([k, label, f]) => {
      const v = s => (s && typeof s[k] === 'number' ? f(s[k]) : '—');
      return `<tr><th>${label}</th><td>${v(a)}</td><td>${v(b)}</td>${e ? `<td class="gold">${v(e)}</td>` : ''}</tr>`;
    }).join('');
    const table = rows ? `<table class="cmp-stats"><thead><tr><th></th><th><span>Nv.</span> 1</th><th><span>Nv.</span> ${max}</th>`
      + `${e ? `<th class="gold" title="${esc(G.T(e.name, 'move'))}">★</th>` : ''}</tr></thead><tbody>${rows}</tbody></table>` : '';
    h += sec('Cómo sube', (ladder ? `<ol class="cmp-ladder">${ladder}</ol>` : '') + table);

    // Evolución: en qué, con qué carta y a qué nivel, y lo que gana.
    const need = G.LevelUp.evoNeed ? G.LevelUp.evoNeed(def) : null;
    const info = G.Moves.evoInfo ? G.Moves.evoInfo(Object.assign({}, b || def, { def, lvl: max, evolved: false }), {}) : null;
    if (need || info) {
      const name = (need && need.name) || (info && info.name) || '';
      const done = G.DB.save && G.DB.save.evoMoves && G.DB.save.evoMoves[id];
      const st = need && STATS().find(s => s.id === need.needs);
      h += sec('Evolución', `<div class="cmp-evo">
          <div class="cmp-eq"><span class="ico-tile s tint" style="--tile-c:${col}">${G.Icons.html('move:' + id, 30)}</span><i>+</i>`
        + (st ? `<button type="button" class="ico-tile s t-purple" data-go="p:${esc(st.id)}" title="${esc(st.title)}">${G.Icons.html(st.icon, 30)}</button>` : '')
        + `<i>=</i><span class="ico-tile s t-gold">${G.Icons.html('move:' + id, 30)}${done ? `<span class="cmp-got">${G.UI.svg('check', 12)}</span>` : ''}</span></div>
          <div class="cmp-evo-t"><b class="gold">${esc(G.T(name, 'move'))}</b>`
        + (need ? `<small>${G.I18n.f('Con la carta {x} y el ataque al nivel {x}', `<button type="button" class="cmp-link" data-go="p:${esc(need.needs)}">${esc(need.title)}</button>`, need.lvl)}</small>` : '')
        + (info && info.text ? `<small class="cmp-gain">${esc(info.text)}</small>` : '')
        + (done ? `<small class="cmp-done">${G.UI.svg('check', 14)}<span>¡Conseguido!</span></small>` : '') + '</div></div>', 'evo');
    } else if (!G.Moves.EVO[id]) {
      h += sec('Evolución', '<p class="cmp-note">No evoluciona</p>');
    }

    // Pasivas que le afectan (Amplitud, Persistencia, Réplica, Propulsión).
    if (G.Moves.passiveAffects) {
      const ps = PASS4.filter(p => G.Moves.passiveAffects(def.kind, p)).map(p => STATS().find(s => s.id === p)).filter(Boolean);
      if (ps.length) h += sec('Le afectan', `<div class="cmp-chips">${ps.map(s => `<button type="button" class="chip" data-go="p:${esc(s.id)}">${G.Icons.html(s.icon, 30)}<span>${esc(s.title)}</span></button>`).join('')}</div>`);
    }
    return h + whoLearns(def);
  }

  /** Quién puede llevar un ataque: los de su tipo (los Normal, todos) y si es el inicial de su tipo. */
  function whoLearns(def) {
    const n = monsOfType(def.type).length;
    const start = def.type !== 'normal' && G.Moves.startFor && G.Moves.startFor({ types: [def.type] }) === def.id;
    const line = def.type === 'normal'
      ? `<p class="cmp-note">${G.I18n.f('Todos los Pokémon ({x}): los ataques Normal los pueden llevar todos.', n)}</p>`
      : `<button type="button" class="cmp-go" data-go="t:${esc(def.type)}">${G.Icons.html('type:' + def.type, 16)}<span>${G.I18n.f('Pokémon de tipo {x}', G.T(G.U.TYPE_NAME[def.type]))}</span><b>${n}</b>${G.UI.svg('chevron', 16)}</button>`;
    // Con MT (Tienda Kecleon): los que no son de su tipo y la pueden aprender (G.TM_MOVES).
    const tm = def.type === 'normal' ? 0 : ((G.TM_MOVES && G.TM_MOVES[def.id]) || []).filter(d => G.DEX_BY[d] && !G.DEX_BY[d].types.includes(def.type)).length;
    return sec('Lo pueden llevar', line + (start ? `<p class="cmp-note gold">${G.I18n.f('Es el ataque inicial de los Pokémon de tipo {x}.', G.T(G.U.TYPE_NAME[def.type]))}</p>` : '')
      + (tm ? `<p class="cmp-note">${G.I18n.f('Con MT, {x} Pokémon más (Tienda Kecleon).', tm)}</p>` : ''));
  }

  /** Movimiento Z: cómo se activa, cuánto dura y su recarga. */
  function zInfo(def) {
    const rows = ROWS.filter(([k]) => typeof def[k] === 'number').map(([k, label, f]) => `<tr><th>${label}</th><td>${f(def[k])}</td></tr>`).join('');
    return sec('Cómo se usa', `<p class="cmp-note">${G.T('Se activa con el Cristal Z de un tipo y 2 ataques de ese tipo en tus huecos. Si cumplen varios, va el del tipo con más ataques.')}</p>`
        + `<div class="cmp-chips"><span class="chip static">${G.Icons.html('zring', 30)}<span>${G.I18n.f('Activo: {x}', G.U.mmss(G.Moves.Z_DUR || 60))}</span></span>`
        + `<span class="chip static">${G.Icons.html('clock', 30)}<span>${G.I18n.f('Se recarga: {x}', G.U.mmss(G.Moves.Z_CD || 240))}</span></span></div>`)
      + (rows ? sec('Números', `<table class="cmp-stats one"><tbody>${rows}</tbody></table><p class="cmp-note">Su daño crece con tu nivel en la partida.</p>`) : '');
  }

  function passiveDetail(id) {
    const s = STATS().find(x => x.id === id);
    if (!s) return '';
    const pass = isPass(id), p4 = PASS4.includes(id) || id === 'luck';
    const tile = id === 'heal' ? 't-green' : p4 ? 't-purple' : 't-blue';
    const tag = id === 'heal' ? '<span class="badge green">Al momento</span>' : p4 ? '<span class="badge purple">Pasivo</span>' : '<span class="badge ghost">Mejora</span>';
    let h = hero(G.Icons.html(s.icon, 60), tile, esc(s.title), tag) + `<p class="cmp-desc">${esc(s.desc)}</p>`;
    const facts = [];
    facts.push(pass ? G.I18n.f('Ocupa uno de tus {x} huecos de pasiva en la partida.', G.LevelUp.MAX_PASSIVES || 4)
      : 'Se usa al momento: no ocupa ningún hueco.');
    if (s.max) facts.push(G.I18n.f('Se puede coger hasta {x} veces por partida.', s.max));
    h += `<ul class="cmp-facts">${facts.map(t => `<li>${G.UI.svg('check', 14)}<span>${esc(t)}</span></li>`).join('')}</ul>`;
    const evo = evolvesWith(id);
    if (evo.length) h += sec(G.I18n.f('Hace evolucionar ({x})', evo.length), `<p class="cmp-note">Al nivel máximo, estos ataques evolucionan si en esa partida has cogido esta carta.</p><div class="cmp-mvs">${evo.map(m => moveBtn(m)).join('')}</div>`);
    if (PASS4.includes(id) && G.Moves.passiveAffects) {
      const kinds = [...new Set(G.Moves.ALL.map(m => m.kind))].filter(k => G.Moves.passiveAffects(k, id));
      if (kinds.length) h += sec('Afecta a estas familias', `<div class="cmp-chips">${kinds.map(k => `<button type="button" class="fam-chip" data-go="f:${esc(k)}">${famName(k)}</button>`).join('')}</div>`);
    }
    return h;
  }

  function itemDetail(id) {
    const it = G.Items.BY[id];
    if (!it) return '';
    return hero(G.Icons.html(id, 60), 't-gold', esc(it.name), '<span class="badge gold">Objeto</span>')
      + `<p class="cmp-desc">${esc(it.desc)}</p>`
      + `<ul class="cmp-facts"><li>${G.UI.svg('check', 14)}<span>Sólo puedes llevar uno por partida: si encuentras otro, eliges con cuál te quedas.</span></li>`
      + `<li>${G.UI.svg('check', 14)}<span>Sale de los cofres (sobre todo de los de candado) y lo sueltan los jefes.</span></li></ul>`;
  }

  function monDetail(dex) {
    const p = G.DEX_BY[dex];
    if (!p) return '';
    const mine = owned(dex);
    const tags = p.types.map(typeChip).join('') + (mine ? `<span class="badge green">${G.UI.svg('check', 12)} <span>Lo tienes</span></span>` : '');
    let h = `<div class="cmp-hero mon"><div class="cmp-spr" id="cmp-spr"></div><div class="cmp-hero-t"><span class="cmp-num">#${String(dex).padStart(3, '0')}</span>`
      + `<h3>${esc(p.name)}</h3><div class="cmp-tags">${tags}</div></div></div>`;
    // Ataque inicial y habilidad (la suya si lo tienes; si no, la que le tocaría).
    const st = G.Moves.startFor ? G.Moves.startFor(p) : null;
    const ab = G.Mons && G.Mons.abilityOf ? G.Mons.abilityOf(dex) : null;
    const fx = ab && ab.id && G.AbilityFX ? G.AbilityFX.of(ab.id, p) : null;
    // Su línea evolutiva (las preevoluciones son con las que se empieza la partida).
    const line = lineOf(dex);
    if (line.length > 1) {
      h += sec('Evolución', `<p class="cmp-note cmp-line">${line.map(d => `<b class="${d === +dex ? 'gold' : ''}">${esc(G.DEX_BY[d].name)}</b>`).join('<i class="evo-arr" aria-hidden="true"> → </i>')}</p>`);
    }
    h += '<div class="cmp-kv">'
      + (st ? `<div><span class="cmp-k">Ataque inicial</span>${moveBtn(st)}</div>` : '')
      + (ab && ab.id ? `<div><span class="cmp-k">Habilidad</span><b translate="no">${esc(G.Mons.abilityName(ab.id))}</b>`
        + (fx && fx.d ? `<small><span>${esc(fx.d)}</span>${fx.d2 ? ` <span>${esc(fx.d2)}</span>` : ''}</small>` : '') + '</div>' : '')
      + '</div>';
    // Sus ataques: los de cada tipo suyo y los Normal (los lleva cualquiera), y los de MT.
    const pool = new Set(G.Moves.poolFor(p, true));
    const groups = [...p.types.filter(t => t !== 'normal'), 'normal'].map(t => {
      const ids = (G.Moves.POOL[t] || []).filter(m => pool.has(m) && G.Moves.BY_ID[m])
        .sort((x, y) => moveName(G.Moves.BY_ID[x]).localeCompare(moveName(G.Moves.BY_ID[y]), G.I18n.locale));
      return ids.length ? `<div class="cmp-grp"><div class="cmp-grp-h">${typeChip(t)}<small>${ids.length}</small></div><div class="cmp-mvs">${ids.map(m => moveBtn(m, m === st ? ' start' : '')).join('')}</div></div>` : '';
    }).join('');
    const tm = G.Mons && G.Mons.taught ? G.Mons.taught(dex) : [];
    const can = G.Mons && G.Mons.learnable ? G.Mons.learnable(dex) : [];
    const grp = (lbl, ids, cls = '') => ids.length ? `<div class="cmp-grp"><div class="cmp-grp-h"><span class="tag-chip cat">${lbl}</span><small>${ids.length}</small></div>`
      + `<div class="cmp-mvs">${ids.map(m => moveBtn(m, cls)).join('')}</div></div>` : '';
    h += sec(G.I18n.f('Puede llevar {x} ataques', pool.size + tm.filter(m => !pool.has(m)).length), groups + grp('Aprendidos con MT', tm));
    if (can.length) h += sec('Con MT (Tienda Kecleon)', grp('MT', can, ' tm'));
    return h;
  }
  /** El sprite de la ficha del Pokémon (lienzo a escala entera, animado por G.UI.tick). */
  function monSprite(dex) {
    const box = $('cmp-spr');
    if (!box || !G.DEX_BY[dex]) return;
    // Del tamaño de su caja (style.css: 112×96; tumbado, 96×80), para que no se recorte.
    const low = window.matchMedia && matchMedia('(max-height: 520px)').matches;
    box.appendChild(G.UI.spriteCanvas(dex, low ? 96 : 112, low ? 80 : 96, { scale: 2, hero: true, lively: true, shiny: G.DB.ownsShiny && G.DB.ownsShiny(dex) && !!(G.DB.save && G.DB.save.partnerShiny && G.DB.save.partner === dex) }));
  }

  return { open, go, get isOpen() { return isOpen(); } };
})();
