/* ============ build-ui.js — planear la build de un Pokémon ============
 * (21-11-2026, sesión builds-plan; los datos y lo que se marca en partida, en systems/build.js.)
 * Ventana encima de lo que la abre: la ficha de la Pokédex, Mejoras o la pausa de la partida.
 *  - A la izquierda (arriba en el móvil de pie), «Tu plan»: 4 huecos de ataque (con el interruptor de fusión y la
 *    pasiva que piden para evolucionar), 4 de pasiva y 2 de objeto. Tocar uno lleno lo quita.
 *  - A la derecha, pestañas Ataques / Pasivas / Objetos con todo lo que puede llevar; tocar uno lo pone o lo quita.
 * Ratón, toque, teclado (Tab, Intro, Esc) y mando (recuadro dorado, LB / RB cambian de pestaña, B cierra): son botones.
 * Sólo es ayuda visual: no cambia lo que sale en las cartas.
 */
G.BuildUI = (() => {
  const $ = id => document.getElementById(id);
  let dex = null, tab = 'm', q = '', onClose = null, host = null, ready = false;

  const typeCol = t => G.U.TYPE_COLOR[t] || '#9fb1c9';
  const pas = id => G.LevelUp.STATS.find(s => s.id === id);
  const esc = s => String(s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');

  function init() {
    if (ready) return;
    ready = true;
    const scr = $('scr-build');
    scr.querySelector('[data-back]').onclick = close;
    $('bld-clear').onclick = async () => {
      if (!G.Build.count(G.Build.get(dex))) return;
      if (!(await G.UI.ask('¿Vaciar la build de este Pokémon?', { yes: 'Vaciar', danger: true }))) return;
      G.Build.clear(dex);
      G.Audio.sfx('select');
      render();
    };
    scr.querySelectorAll('.bld-tabs [role="tab"]').forEach(t => {
      t.onclick = () => { if (tab === t.dataset.k) return; tab = t.dataset.k; q = ''; G.Audio.sfx('select'); render(); };
    });
    // Delegado: los botones se redibujan.
    scr.addEventListener('click', e => {
      const b = e.target.closest('[data-pick], [data-rm], [data-fuse]');
      if (!b || !scr.contains(b)) return;
      if (b.dataset.fuse) return fuse(b.dataset.fuse);
      const [k, id] = (b.dataset.pick || b.dataset.rm).split(':');
      pick(k, id, b);
    });
    // Si se cierra la pantalla de debajo (la pausa al seguir jugando...), ésta también.
    const watch = new MutationObserver(() => { if (host && isOpen() && $(host).classList.contains('hidden')) close(); });
    for (const id of ['scr-pause', 'scr-dex', 'scr-upgrades']) watch.observe($(id), { attributes: true, attributeFilter: ['class'] });
    // Esc cierra (si es la ventana de más arriba y no se está escribiendo en el buscador con texto).
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !isOpen() || !onTop()) return;
      const a = document.activeElement;
      if (a && a.id === 'bld-q' && a.value) return;
      e.stopPropagation(); e.preventDefault(); close();
    }, true);
  }

  const isOpen = () => !$('scr-build').classList.contains('hidden');
  function onTop() {
    const el = $('scr-build'), z = x => parseInt(getComputedStyle(x).zIndex, 10) || 0, mine = z(el);
    // (Con el mismo z-index manda la que va después: la pregunta de «Vaciar» se añade al final del documento.)
    for (const x of document.querySelectorAll('.scr:not(.hidden)')) {
      if (x !== el && (z(x) > mine || (z(x) === mine && (el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)))) return false;
    }
    return true;
  }

  /**
   * Abre el planificador de ese Pokémon. opts.host: la pantalla de debajo ('scr-pause', 'scr-dex', 'scr-upgrades'; si
   * se cierra, éste también); opts.onClose: al cerrarlo (la pausa se redibuja con lo nuevo). No cierra la de debajo.
   */
  function open(d, opts = {}) {
    if (d == null || !G.DEX_BY[d]) return;
    init();
    dex = +d; onClose = opts.onClose || null; host = opts.host || null; q = '';
    tab = opts.tab || 'm';
    $('scr-build').classList.remove('hidden');
    render();
    const body = $('scr-build').querySelector('.bld-body');
    if (body) body.scrollTop = 0;
  }
  function close() {
    if (!isOpen()) return;
    $('scr-build').classList.add('hidden');
    const cb = onClose;
    onClose = null; host = null;
    if (cb) cb();
  }

  // ---------------- poner y quitar ----------------

  const FULL = { m: 'Ya tienes 4 ataques: quita uno primero', p: 'Ya tienes 4 pasivas: quita una primero', i: 'Ya tienes 2 objetos: quita uno primero' };
  function pick(k, id, btn) {
    if (!G.Build.toggle(dex, k, id)) { G.UI.toast(G.T(FULL[k])); G.Audio.sfx('error'); return; }
    G.Audio.sfx('select');
    // En la lista sólo cambia ese botón (así la selección del mando no salta); el plan se redibuja entero.
    const on = G.Build.has(G.Build.get(dex), k, id);
    const opt = $('bld-grid').querySelector(`[data-pick="${k}:${id}"]`);
    if (opt) { opt.classList.toggle('on', on); opt.setAttribute('aria-pressed', on); }
    renderPlan();
    renderHints();
    if (btn && !btn.isConnected && btn.dataset.rm) {
      // Quitado desde el plan: la selección (teclado) pasa al hueco que queda en su sitio.
      const same = $('bld-plan').querySelector(`[data-slot="${k}"]`);
      if (same && document.activeElement === document.body) same.focus();
    }
  }
  function fuse(id) {
    const b = G.Build.get(dex);
    if (!G.Build.has(b, 'f', id) && b.f.length >= G.Build.MAX.f) return;
    G.Build.toggle(dex, 'f', id);
    G.Audio.sfx('select');
    renderPlan();
  }

  // ---------------- dibujar ----------------

  function render() {
    const mon = G.DEX_BY[dex];
    $('bld-title').innerHTML = G.I18n.f('Build de {x}', `<span translate="no">${esc(G.Mons && G.Mons.name ? G.Mons.name(mon.name) : mon.name)}</span>`);
    $('scr-build').querySelectorAll('.bld-tabs [role="tab"]').forEach(t => {
      const on = t.dataset.k === tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on);
    });
    renderPlan();
    renderList();
  }

  /** Lo que pide un ataque para evolucionar: el icono de su pasiva (✓ si va en tu plan). */
  function needHtml(id, b) {
    const n = G.Build.needs(id), s = n && pas(n);
    if (!s) return `<small class="bld-need none">${G.T('No evoluciona')}</small>`;
    const ok = G.Build.has(b, 'p', n);
    return `<small class="bld-need${ok ? ' ok' : ''}" title="${esc(G.I18n.f('Evoluciona con {x}', G.T(s.title)))}">`
      + `<span>${G.T('Evoluciona con')}</span> ${G.Icons.html(s.icon, 20)}<b>${G.T(s.title)}</b>${ok ? G.UI.svg('check', 12) : ''}</small>`;
  }

  /** «Tu plan»: los huecos, como en la pausa. */
  function renderPlan() {
    const b = G.Build.get(dex), M = G.Build.MAX;
    const slot = (k, i, inner, cls, title) => `<button class="bld-slot ${cls}" type="button" data-rm="${k}" data-slot="${k}" title="${esc(title)}">${inner}</button>`;
    const free = k => `<span class="bld-slot empty" data-slot="${k}"><span>${G.T('Libre')}</span></span>`;
    // Ataques: con el interruptor de fusión y lo que piden para evolucionar.
    const atk = [];
    for (let i = 0; i < M.m; i++) {
      const id = b.m[i];
      if (!id) { atk.push(`<div class="bld-mrow" data-nav-row>${free('m')}</div>`); continue; }
      const d = G.Moves.BY_ID[id], f = G.Build.has(b, 'f', id);
      const fuseFull = !f && b.f.length >= M.f;
      atk.push(`<div class="bld-mrow${f ? ' fused' : ''}" data-nav-row>`
        + slot('m:' + id, i, `<span class="ico-tile s tint" style="--tile-c:${typeCol(d.type)}">${G.Icons.html('move:' + id, 30)}</span>`
          + `<span class="bld-st"><b>${G.T(d.name)}</b>${needHtml(id, b)}</span><span class="bld-x" aria-hidden="true">${G.UI.svg('close', 14)}</span>`, 'mv', G.I18n.f('Quitar {x}', G.T(d.name)))
        + `<button class="bld-fuse${f ? ' on' : ''}" type="button" data-fuse="${id}" aria-pressed="${f}"${fuseFull ? ' disabled' : ''} title="${esc(G.T(f ? 'No fusionar' : 'Fusionar en un vínculo'))}">`
        + `${G.Icons.html('bond', 20)}<span>${G.T('Fusionar')}</span></button></div>`);
    }
    const pasT = [];
    for (let i = 0; i < M.p; i++) {
      const id = b.p[i];
      if (!id) { pasT.push(free('p')); continue; }
      const s = pas(id), who = b.m.filter(m => G.Build.needs(m) === id).length;
      pasT.push(slot('p:' + id, i, `<span class="ico-tile s ${['area', 'dur', 'amt', 'pspd', 'luck'].includes(id) ? 't-purple' : 't-blue'}">${G.Icons.html(s.icon, 30)}</span>`
        + `<span class="bld-st"><b>${G.T(s.title)}</b>${who ? `<small class="bld-need ok">${(who > 1 ? G.I18n.f('Evoluciona {x} de tus ataques', who) : G.T('Evoluciona 1 de tus ataques'))}</small>` : ''}</span>`
        + `<span class="bld-x" aria-hidden="true">${G.UI.svg('close', 14)}</span>`, 'ps', G.I18n.f('Quitar {x}', G.T(s.title))));
    }
    const itT = [];
    for (let i = 0; i < M.i; i++) {
      const id = b.i[i];
      if (!id) { itT.push(free('i')); continue; }
      const it = G.Items.BY[id];
      itT.push(slot('i:' + id, i, `<span class="ico-tile s">${G.Icons.html(id, 30)}</span><span class="bld-st"><b>${G.T(it.name)}</b></span>`
        + `<span class="bld-x" aria-hidden="true">${G.UI.svg('close', 14)}</span>`, 'it', G.I18n.f('Quitar {x}', G.T(it.name))));
    }
    // (1.0, bloque J) Orden del mando (ui/nav.js): cada ataque del plan, una fila (con su fusión); pasivas y objetos, otra.
    const sec = (lbl, n, max, tiles, cls) => `<section class="bld-sec ${cls}"><h3><span>${lbl}</span> <small>${n}/${max}</small></h3><div class="bld-slots"${cls === 'bs-m' ? '' : ' data-nav-row'}>${tiles.join('')}</div></section>`;
    const fuseNote = b.f.length === 1 ? `<p class="bld-note">${G.T('Marca al menos dos ataques para fusionarlos.')}</p>` : '';
    $('bld-plan').innerHTML = `<p class="bld-how">${G.Icons.html('build', 30)}<span>${G.T('En la partida, lo que sea de tu build lleva este sello en las cartas, los objetos y la pausa. Sólo es una ayuda: no cambia lo que sale.')}</span></p>`
      + sec(G.T('Ataques'), b.m.length, M.m, atk, 'bs-m') + fuseNote
      + sec(G.T('Pasivas'), b.p.length, M.p, pasT, 'bs-p')
      + sec(G.T('Objetos'), b.i.length, M.i, itT, 'bs-i');
    $('bld-clear').disabled = !G.Build.count(b);
  }

  /** La lista de lo que se puede poner en la pestaña abierta. */
  function renderList() {
    const b = G.Build.get(dex), o = G.Build.options(dex), mon = G.DEX_BY[dex];
    const tools = $('bld-tools');
    if (tab === 'm') {
      tools.innerHTML = `<label class="bld-q dx-q"><input id="bld-q" class="field" type="search" placeholder="${esc(G.T('Buscar ataque'))}" aria-label="${esc(G.T('Buscar ataque'))}" autocomplete="off" spellcheck="false"></label>`;
      tools.firstChild.insertAdjacentHTML('afterbegin', G.UI.svg('search', 18));
      const inp = $('bld-q');
      inp.value = q;
      inp.oninput = () => { q = inp.value; renderList.grid(); };
      inp.onkeydown = e => { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; q = ''; renderList.grid(); } };
    } else tools.innerHTML = '';
    renderList.grid = () => {
      let html = '';
      if (tab === 'm') {
        // Los de sus tipos primero, luego normal y el resto (MT); dentro, por nombre.
        const rank = id => { const t = G.Moves.BY_ID[id].type, i = mon.types.indexOf(t); return i >= 0 ? i : t === 'normal' ? 5 : 9; };
        const ql = q.trim().toLowerCase();
        const ids = o.moves.filter(id => !ql || G.T(G.Moves.BY_ID[id].name).toLowerCase().includes(ql) || G.Moves.BY_ID[id].name.toLowerCase().includes(ql))
          .sort((a, c) => rank(a) - rank(c) || G.T(G.Moves.BY_ID[a].name).localeCompare(G.T(G.Moves.BY_ID[c].name), G.I18n.locale));
        html = ids.map(id => {
          const d = G.Moves.BY_ID[id], on = G.Build.has(b, 'm', id), kind = G.RunUI.KIND_NAME[d.kind];
          return `<button class="bld-opt${on ? ' on' : ''}" type="button" data-pick="m:${id}" aria-pressed="${on}">`
            + `<span class="ico-tile s tint" style="--tile-c:${typeCol(d.type)}">${G.Icons.html('move:' + id, 30)}</span>`
            + `<span class="bld-ot"><b>${G.T(d.name)}</b><span class="bld-chips"><span class="tag-chip" style="background:${typeCol(d.type)}">${G.U.TYPE_NAME[d.type] || ''}</span>`
            + `${kind ? `<span class="fam-chip">${kind}</span>` : ''}</span>${needHtml(id, b)}</span>`
            + `<span class="bld-mark" aria-hidden="true">${G.Icons.html('build', 30)}</span></button>`;
        }).join('') || `<p class="muted bld-empty">${G.T('Ningún ataque con ese nombre')}</p>`;
      } else if (tab === 'p') {
        html = o.passives.map(id => {
          const s = pas(id), on = G.Build.has(b, 'p', id);
          return `<button class="bld-opt${on ? ' on' : ''}" type="button" data-pick="p:${id}" aria-pressed="${on}">`
            + `<span class="ico-tile s ${['area', 'dur', 'amt', 'pspd', 'luck'].includes(id) ? 't-purple' : 't-blue'}">${G.Icons.html(s.icon, 30)}</span>`
            + `<span class="bld-ot"><b>${G.T(s.title)}</b><small class="bld-desc">${G.T(s.desc)}</small><span class="bld-who" data-who="${id}"></span></span>`
            + `<span class="bld-mark" aria-hidden="true">${G.Icons.html('build', 30)}</span></button>`;
        }).join('');
      } else {
        html = o.items.map(id => {
          const it = G.Items.BY[id], on = G.Build.has(b, 'i', id), ln = G.Items.lines(id, 1);
          return `<button class="bld-opt${on ? ' on' : ''}" type="button" data-pick="i:${id}" aria-pressed="${on}">`
            + `<span class="ico-tile s">${G.Icons.html(id, 30)}</span>`
            + `<span class="bld-ot"><b>${G.T(it.name)}</b><small class="bld-desc">${ln.slice(0, 2).map(l => `<span>${l}</span>`).join(' ')}</small></span>`
            + `<span class="bld-mark" aria-hidden="true">${G.Icons.html('build', 30)}</span></button>`;
        }).join('');
      }
      $('bld-grid').innerHTML = html;
      $('bld-grid').scrollTop = 0;
      renderHints();
    };
    renderList.grid();
  }

  /** En la pestaña de pasivas: qué ataques de tu plan evoluciona cada una. */
  function renderHints() {
    if (tab !== 'p') return;
    const b = G.Build.get(dex);
    $('bld-grid').querySelectorAll('[data-who]').forEach(el => {
      const ms = b.m.filter(m => G.Build.needs(m) === el.dataset.who);
      el.innerHTML = ms.length ? `<small class="bld-need ok">${G.T('Evoluciona')}: ${ms.map(m => `<b>${G.T(G.Moves.BY_ID[m].name)}</b>`).join(', ')}</small>` : '';
    });
  }

  return { open, close, get isOpen() { return isOpen(); } };
})();
