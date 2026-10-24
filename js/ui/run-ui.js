/* ============ run-ui.js — cartas de nivel, pausa y fin de run ============
 * Subir de nivel, objeto y vínculo usan la misma carta (cardEl: baldosa con el
 * icono a 60 px, insignia, nombre, chips de tipo / categoría / familia y
 * descripción). La pausa y el resumen comparten la lista de ataques
 * (movesTable). Los estilos, en «pantallas: partida» de css/style.css.
 */
G.RunUI = (() => {
  const $ = G.UI.$;
  let offers = null, offerCb = null, coopMode = false;

  /*
   * Al aparecer unas cartas (nivel, vínculo, objeto) no se pueden elegir
   * durante GUARD s y se ven apagadas: en plena pelea se pulsa 1-4 (o se toca
   * la pantalla) para cambiar de ataque y se elegía una carta sin querer.
   * Cambiar las cartas o el 2.º paso del vínculo no lo vuelven a poner: ahí ya
   * estás eligiendo a propósito.
   */
  const GUARD = 0.6;
  let guardUntil = 0, guardT = 0;
  function guard(box) {
    guardUntil = performance.now() + GUARD * 1000;
    box.classList.add('guard');
    clearTimeout(guardT);
    guardT = setTimeout(() => document.querySelectorAll('.cards.guard').forEach(b => b.classList.remove('guard')), GUARD * 1000);
  }
  const guarded = () => performance.now() < guardUntil;

  // ---------------- piezas comunes de las cartas ----------------

  /*
   * Nombre de cada familia de movimiento (kind de data/moves.js), para la chip
   * de las cartas, la pausa y el resumen. Las 23 de siempre y las 12 nuevas.
   * («Chaparrón» y no «Lluvia», que ya es el clima en los diccionarios.)
   */
  const KIND_NAME = {
    projectile: 'Proyectil', melee: 'Golpe', beam: 'Haz', orbit: 'Órbita', nova: 'Estallido', aura: 'Aura',
    buff: 'Potenciador', boomerang: 'Bumerán', chain: 'Cadena', mine: 'Minas', meteor: 'Meteoro',
    turret: 'Torreta', dash: 'Embestida', trail: 'Estela', cone: 'Abanico', homing: 'Teledirigido',
    bounce: 'Rebote', charge: 'Carga', spin: 'Giro', quake: 'Temblor', vortex: 'Vórtice', shove: 'Empujón',
    stun: 'Aturdimiento',
    // al estilo de Vampire Survivors (22-10-2026)
    lob: 'Parábola', knife: 'Ráfaga', cross: 'Aspas', column: 'Columna', sweep: 'Aguja', ricochet: 'Carambola',
    wipe: 'Barrido', ward: 'Escudo', ally: 'Aliados', wings: 'Aves', puddle: 'Charcos', dusting: 'Chaparrón'
  };
  // Las cartas de pasivo (afectan a todos los ataques) llevan «Pasivo» en vez de «Mejora».
  const PASSIVE = new Set(['area', 'dur', 'amt', 'pspd', 'luck']);

  /** Físico o Especial (los potenciadores, el lado que suben; si no, ''). */
  const catOf = m => G.Stats.NAME[m.cat || (m.stat === 'patk' ? 'physical' : m.stat === 'satk' ? 'special' : '')] || '';
  const typeCol = m => G.U.TYPE_COLOR[m.type] || '#9fb1c9';

  /** Chips de un movimiento: tipo, categoría (si withCat) y familia. */
  function moveChips(m, withCat = true) {
    const cat = withCat ? catOf(m) : '';
    return `<span class="tag-chip" style="background:${typeCol(m)}">${G.U.TYPE_NAME[m.type] || ''}</span>`
      + (cat ? `<span class="tag-chip cat">${cat}</span>` : '')
      + (KIND_NAME[m.kind] ? `<span class="fam-chip">${KIND_NAME[m.kind]}</span>` : '');
  }

  // ---------------- evoluciones a la vista (23-10-2026) ----------------

  /**
   * «Evoluciona con [icono] Potencia · Nv. 5»: lo que pide un ataque para
   * evolucionar (ev: G.LevelUp.evoNeed). Con esa carta ya cogida, su nombre
   * lleva ✓; con el ataque al nivel máximo, el nivel también; con las dos, la
   * línea es dorada: lista para evolucionar (sale su carta dorada al subir; en
   * la píldora de la pausa y el resumen lo dice, más corto para que quepa).
   * m.evolved: nada. Sin evolución (potenciadores): «No evoluciona».
   */
  function evoHtml(m, ev, cls) {
    if (!m || m.evolved) return '';
    if (!ev) return `<span class="${cls} evo-none"><span class="evo-k">No evoluciona</span></span>`;
    const ok = `<span class="evo-ok">${G.UI.svg('check', 12)}</span>`;
    if (ev.ready && cls === 'mv-evo') {
      return `<span class="${cls} ready"><span class="evo-k">¡Lista para evolucionar!</span><span class="evo-need">${G.Icons.html(ev.icon, 18)}${ok}</span></span>`;
    }
    // Te falta esa pasiva y tus 4 huecos de pasiva ya están llenos: así no evolucionará.
    const blocked = ev.blocked && !ev.has;
    return `<span class="${cls}${ev.ready ? ' ready' : ev.has ? ' has' : blocked ? ' blocked' : ''}">`
      + `<span class="evo-k">Evoluciona con</span>`
      + `<span class="evo-need">${G.Icons.html(ev.icon, 18)}<b>${ev.title}</b>${ev.has ? ok : ''}</span>`
      + (blocked ? '<span class="evo-no">Sin hueco de pasiva</span></span>'
                 : `<span class="evo-lv">· <span>Nv.</span> ${ev.lvl}${ev.max ? ok : ''}</span></span>`);
  }

  // ---------------- huecos de ataque y de pasiva (24-10-2026) ----------------

  /**
   * Como en Vampire Survivors: tus 4 huecos de ataque y tus 4 de pasiva (G.LevelUp.MAX_PASSIVES),
   * cada uno con su icono y su nivel (las pasivas, las veces que la has cogido); los
   * vacíos, «Libre». Lo enseñan la pausa (arriba del todo) y, en pequeño y sin niveles
   * (mini), la cabecera de las cartas de nivel.
   */
  function slotsHtml(pl, mini = false) {
    const SZ = mini ? 20 : 30;
    const free = mini ? '<span class="sl sl-free"></span>' : '<span class="sl sl-free"><span>Libre</span></span>';
    const atk = [], pas = [];
    for (let i = 0; i < Math.max(pl.maxMoves, pl.slots.length); i++) {
      const g = pl.slots[i];
      if (!g || !g[0]) { atk.push(free); continue; }
      const m = g[0];
      atk.push(`<span class="sl ico-tile tint${m.evolved ? ' evo' : ''}${g.length > 1 ? ' bond' : ''}" style="--tile-c:${typeCol(m)}" title="${g.map(x => G.T(x.name, 'move')).join(' + ')}">`
        + G.Icons.html('move:' + m.id, SZ) + (mini ? '' : `<i class="sl-lv">${m.lvl}</i>`)
        + (g.length > 1 ? `<i class="sl-plus">+${g.length - 1}</i>` : '') + '</span>');
    }
    const mine = G.LevelUp.passivesOf(pl), MAX = G.LevelUp.MAX_PASSIVES;
    for (let i = 0; i < Math.max(MAX, mine.length); i++) {
      const p = mine[i];
      if (!p) { pas.push(free); continue; }
      pas.push(`<span class="sl ico-tile ${PASSIVE.has(p.id) ? 't-purple' : 't-blue'}" title="${p.def.title}">`
        + G.Icons.html(p.def.icon, SZ) + (mini ? '' : `<i class="sl-lv">${p.n}</i>`) + '</span>');
    }
    const group = (lbl, used, max, tiles, cls) => `<div class="sl-group ${cls}${used >= max ? ' full' : ''}">`
      + `<span class="sl-lbl"><b>${lbl}</b><span class="sl-n">${used}/${max}</span></span><span class="sl-row">${tiles.join('')}</span></div>`;
    return group('Ataques', pl.slots.length, pl.maxMoves, atk, 'sl-atk') + group('Pasivas', mine.length, MAX, pas, 'sl-pas');
  }

  /** Carta nueva (ataque o pasiva): qué hueco ocupa, «Hueco de ataque 3/4», o si es el último. */
  function slotNote(kind, used, max) {
    const last = used + 1 >= max, atk = kind === 'atk';
    const txt = last ? (atk ? 'Último hueco de ataque' : 'Último hueco de pasiva')
                     : (atk ? 'Hueco de ataque ' : 'Hueco de pasiva ') + (used + 1) + '/' + max;
    return `<span class="pc-slot${last ? ' last' : ''}">${txt}</span>`;
  }

  /**
   * Carta de mejora o pasivo: los ataques que hace evolucionar (e: G.LevelUp.evolvesWith).
   * Los tuyos, con su nombre y destacados (dorados si ya están al máximo: la
   * evolución sale al cogerla); los que aún puedes aprender, sólo el icono.
   */
  const MORE = 5;
  function evolvesHtml(e) {
    if (!e || (!e.mine.length && !e.more.length)) return '';
    const mine = e.mine.map(m => `<span class="evo-mv mine${m.ready ? ' ready' : ''}">${G.Icons.html('move:' + m.id, 24)}<b>${G.T(m.name, 'move')}</b></span>`).join('');
    const more = e.more.slice(0, MORE).map(id => `<span class="evo-mv">${G.Icons.html('move:' + id, 24)}</span>`).join('')
      + (e.more.length > MORE ? `<span class="evo-more">+${e.more.length - MORE}</span>` : '');
    return `<span class="pc-evo evo-for${e.mine.some(m => m.ready) ? ' ready' : e.mine.length ? ' has' : ''}">`
      + `<span class="evo-k">Hace evolucionar</span>${mine}${more}</span>`;
  }

  const badge = (txt, cls = '') => `<span class="badge pc-badge${cls ? ' ' + cls : ''}">${txt}</span>`;
  /** «Nv. 2 → 3» (o «Nv. 2»): «Nv.» en su propio nodo para que se traduzca. */
  const lvBadge = (lvl, up, cls = 'blue') => badge(`<span>Nv.</span> ${lvl}${up ? ' → ' + (lvl + 1) : ''}`, cls);

  /**
   * Una carta. o: { cls, icon, tile (clase de la baldosa), tileC (color para .tint),
   * badge, eyebrow, title, chips, desc, evo (línea de evolución, abajo) }. i: su número (tecla 1-4).
   */
  function cardEl(o, i, onPick, ownSfx = true) {
    const el = document.createElement('div');
    el.className = 'card pick-card' + (o.cls ? ' ' + o.cls : '');
    el.style.setProperty('--i', i);
    if (o.tileC) el.style.setProperty('--pc', o.tileC);
    el.innerHTML = `<span class="key">${i + 1}</span>
      <span class="pc-art"><span class="ico-tile pc-ico${o.tile ? ' ' + o.tile : ''}"${o.tileC ? ` style="--tile-c:${o.tileC}"` : ''}>${G.Icons.html(o.icon, 60)}</span>${o.badge || ''}</span>
      <span class="pc-txt">${o.eyebrow ? `<span class="pc-eyebrow">${o.eyebrow}</span>` : ''}<span class="nm">${o.title}</span>`
      + `${o.chips ? `<span class="pc-chips">${o.chips}</span>` : ''}<span class="ds">${o.desc || ''}</span>${o.evo || ''}</span>`;
    if (ownSfx) el.dataset.sfx = 'none';             // el juego pone su propio sonido al elegir
    el.onclick = onPick;
    return el;
  }

  /** Iconos de la cabecera (data-item-ico), la primera vez que se abre. */
  function headIcons(id) {
    $(id).querySelectorAll('[data-item-ico]').forEach(el => { if (!el.firstChild) el.innerHTML = G.Icons.html(el.dataset.itemIco, 30); });
  }

  // ---------------- subir de nivel ----------------

  /** @param coop  en grupo: tras elegir, se queda esperando a los demás */
  function showLevelUp(level, list, cb, coop = false) {
    offerCb = cb; coopMode = coop;
    headIcons('scr-levelup');
    $('lvl-num').textContent = level;
    $('lvl-wait').textContent = '';
    $('lvl-wait').classList.toggle('hidden', !coop);
    $('cards').classList.remove('done');
    levelSlots();
    renderCards(list);
    $('lvl-reroll').onclick = reroll;
    G.UI.show('scr-levelup');
    fitCards($('cards'));
    guard($('cards'));
  }

  /*
   * Carta con todo (hueco, chip Z, texto largo, nota de «rinde un N %» y línea de evolución)
   * en un móvil tumbado bajo (667x375): si no cabe, más apretada (.crowded), luego sin la nota
   * de «rinde» (.crowded2) y, si aun así no cabe, lo de dentro se desplaza (.crowded3): nunca se
   * corta. Se mira una vez al sacarlas (con la pantalla ya a la vista), no en cada fotograma.
   */
  const CROWD = ['crowded', 'crowded2', 'crowded3'];
  function fitCards(box) {
    for (const c of box.children) {
      for (let i = 0; i < CROWD.length && c.scrollHeight > c.clientHeight + 1; i++) c.classList.add(CROWD[i]);
    }
  }

  /** Cabecera de las cartas: cuántos huecos de ataque y de pasiva llevas (la tira la pone run-ui.js). */
  function levelSlots() {
    const pl = G.Game.player, head = document.querySelector('#scr-levelup .pick-head');
    if (!head) return;
    let el = $('lvl-slots');
    if (!el) { el = document.createElement('div'); el.id = 'lvl-slots'; el.className = 'lvl-slots'; head.appendChild(el); }
    el.innerHTML = pl ? slotsHtml(pl, true) : '';
  }

  /**
   * Cambiar las cartas: 1 vez gratis por partida y 1 más por cada jefe
   * derrotado (en grupo cuentan los jefes del equipo; cada uno tiene los suyos).
   */
  function rerollsLeft() {
    const p = G.Game.player;
    // 1 gratis + los comprados en Mejoras (antes, 1 más por cada jefe).
    return p ? Math.max(0, 1 + (p.rerollBonus || 0) - (p.rerolls || 0)) : 0;
  }

  function reroll() {
    if (!offers || rerollsLeft() <= 0) return;
    const p = G.Game.player;
    p.rerolls = (p.rerolls || 0) + 1;
    G.Audio.sfx('select');
    renderCards(G.LevelUp.offer(p));
    fitCards($('cards'));
  }

  /** El movimiento de una carta de nivel (definición o el tuyo), o null. */
  function moveOf(c) {
    const id = String(c.key || '').split(':')[1] || '';
    const pl = G.Game.player;
    if (c.type === 'new') return G.Moves.BY_ID[id] || null;
    if (c.type === 'up' || c.type === 'evo') return (pl && pl.moves.find(m => m.id === id)) || G.Moves.BY_ID[id] || null;
    return null;
  }

  /** Lo que lleva cada carta de nivel según su clase (ver systems/levelup.js). */
  function levelCard(c) {
    const m = moveOf(c);
    const chips = m ? moveChips(m) : '';
    // Con qué evoluciona (las cartas de antes de esta versión no lo traen: se calcula aquí).
    let ev = m && (c.evo !== undefined ? c.evo : G.LevelUp.evoNeed(m, G.Game.player));
    // La mejora que lo deja al máximo con la carta ya cogida: al elegirla, queda listo.
    if (ev && c.type === 'up' && ev.has && m.lvl + 1 >= ev.lvl) ev = Object.assign({}, ev, { max: true, ready: true });
    const evo = m ? evoHtml(m, ev, 'pc-evo') : '';
    const pl = G.Game.player;
    if (c.type === 'evo') return { cls: 'evo', icon: c.icon, tile: 't-gold', badge: badge('EVOLUCIÓN', 'gold'), title: c.title, chips, desc: c.desc, evo };
    // (El que hace evolucionar a tu Pokémon —Tangela con Poder Pasado—, dorado y lo dice arriba.)
    if (c.type === 'new') return { cls: 'is-new' + (c.evoTo ? ' unlocks' : ''), icon: c.icon, tile: 'tint', tileC: c.color, badge: badge('¡Nuevo!'), title: c.title, chips: chips + zChip(m), desc: c.desc, evo,
                                   eyebrow: c.evoTo && G.DEX_BY[c.evoTo] ? `<span class="pc-slot evo-mon">${G.I18n.f('¡Evoluciona a {x}!', G.T(G.DEX_BY[c.evoTo].name))}</span>`
                                     : pl ? slotNote('atk', pl.slots.length, pl.maxMoves) : '' };
    if (c.type === 'up') return { cls: 'is-up', icon: c.icon, tile: 'tint', tileC: c.color, badge: lvBadge(m ? m.lvl : 1, true), title: c.title, chips, desc: c.desc, evo };
    // Mejora de la run (stat o pasivo): los ataques que hace evolucionar. Si
    // desbloquea ya una evolución (el ataque está al máximo), dorada. Una pasiva que
    // ya llevas sube de nivel («Nv. 2 → 3»); una nueva dice qué hueco de pasiva ocupa.
    const id = String(c.key || '').slice(5), unlocks = !!c.tag && c.tag !== 'Mejora', passive = PASSIVE.has(id);
    const n = (pl && pl.statsTaken && pl.statsTaken[id]) || 0, slot = pl && G.LevelUp.isPassive(id);
    // Pasiva nueva que llena el último hueco mientras un ataque tuyo pide otra: lo avisa (en rojo).
    const lost = slot && !n ? G.LevelUp.wouldBlock(pl, id) : [];
    const warn = lost.length ? `<span class="pc-warn">${G.I18n.f('Te quedarás sin la evolución de {x}',
      lost.slice(0, 2).map(m => G.T(m.name, 'move')).join(', ') + (lost.length > 2 ? '…' : ''))}</span>` : '';
    return {
      cls: 'is-stat' + (unlocks ? ' unlocks' : ''), icon: c.icon, tile: unlocks ? 't-gold' : passive ? 't-purple' : 't-blue',
      badge: slot && n > 0 ? lvBadge(n, true, passive ? 'purple' : 'ghost') : passive ? badge('Pasivo', 'purple') : badge('Mejora', 'ghost'),
      eyebrow: slot && !n ? slotNote('pas', G.LevelUp.passivesOf(pl).length, G.LevelUp.MAX_PASSIVES) : '',
      title: c.title, chips: '', desc: c.desc,
      evo: (c.evolves ? evolvesHtml(c.evolves) : unlocks ? `<span class="evo-hint">${c.tag}</span>` : '') + warn
    };
  }

  function renderCards(list) {
    offers = list;
    const left = rerollsLeft();
    $('lvl-rr-n').textContent = left;
    $('lvl-reroll').classList.toggle('hidden', left <= 0);
    const rr = $('lvl-reroll').querySelector('.rr-ico');
    if (rr && !rr.firstChild) rr.innerHTML = G.Icons.html('reroll', 30);
    const box = $('cards');
    box.innerHTML = '';
    list.forEach((c, i) => box.appendChild(cardEl(levelCard(c), i, () => pick(i))));
  }

  function pick(i) {
    if (!offers || !offers[i] || guarded()) return;
    const c = offers[i], cb = offerCb;
    offers = null; offerCb = null;
    $('lvl-reroll').classList.add('hidden');
    if (coopMode) {
      // Se queda la carta elegida a la vista mientras eligen los demás.
      $('cards').querySelectorAll('.card').forEach((el, j) => el.classList.toggle('picked', j === i));
      $('cards').classList.add('done');
    } else G.UI.hide('scr-levelup');
    cb(c);
  }

  /** Cooperativo: quién falta por elegir. */
  function setWaiting(names) {
    const me = G.Social.me ? G.Social.me.name : '';
    const others = names.filter(n => n !== me);
    const list = a => new Intl.ListFormat(G.I18n.locale, { style: 'long', type: 'conjunction' }).format(a);
    $('lvl-wait').setAttribute('translate', 'no');
    $('lvl-wait').textContent = !names.length ? ''
      : !others.length ? G.T('Elige tu carta')
      : names.includes(me) ? G.I18n.f('Faltan por elegir: {x}', list([...others, G.T('tú')]))
      : G.I18n.f('Esperando a {x}…', list(others));
  }

  function closeLevelUp() {
    offers = null; offerCb = null;
    $('cards').classList.remove('done');
    G.UI.hide('scr-levelup');
  }

  // ---------------- resumen final ----------------

  /**
   * Mensaje de apoyo (Ko-fi) al acabar: tras un récord o cada 10 partidas,
   * nunca en la primera y como mucho una vez al día. Se cierra con la X.
   */
  function askSupport(r) {
    if (!G.Funding || !G.Funding.url) return false;
    const runs = (G.DB.save && G.DB.save.stats && G.DB.save.stats.runs) || 0;
    if (runs < 2 || !(r.record || runs % 10 === 0)) return false;
    const today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem('ps.ask') === today) return false; localStorage.setItem('ps.ask', today); } catch (e) { return false; }
    return true;
  }

  /** Baldosa de una cifra del resumen: icono, número y qué es (full: la cifra entera, si se ha acortado). */
  const ovTile = (icon, label, value, full = '') =>
    `<div class="ov-tile"${full ? ` title="${full}"` : ''}><span class="ico-tile s">${G.Icons.html(icon, 30)}</span><b>${value}</b><span>${label}</span></div>`;

  function showOver(r, onBack) {
    $('over-title').textContent = r.dead ? 'Has caído…' : 'Run terminada';
    $('scr-over').classList.toggle('is-dead', !!r.dead);
    $('over-ico').innerHTML = G.Icons.html(r.dead ? 'revive' : 'star', 60);
    $('over-record').classList.toggle('hidden', !r.record);
    const n = v => Math.round(v || 0).toLocaleString(G.I18n.locale);
    // Daño de millones: abreviado («1,2 M») para que quepa en su baldosa (la cifra entera, al pasar el ratón).
    const big = v => {
      if ((v || 0) < 1e6) return n(v);
      try { return new Intl.NumberFormat(G.I18n.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v); } catch (e) { return n(v); }
    };
    const dmg = (icon, label, v) => ovTile(icon, label, big(v), (v || 0) >= 1e6 ? n(v) : '');
    // Con cuenta en la nube, lo de esta partida aún no está subido: se ofrece Guardar aquí mismo.
    const unsaved = G.DB.mode === 'cloud' && !G.DB.guest && G.DB.syncState === 'pending';
    const tickets = r.t1 || r.t10 ? `<div class="ov-tickets"><span class="ov-lbl">Tickets del gacha</span>
        ${r.t1 ? `<span class="ov-tk"><span class="ico-tile s">${G.Icons.html('ticket', 30)}</span><b>+${r.t1}</b></span>` : ''}
        ${r.t10 ? `<span class="ov-tk"><span class="ico-tile s t-purple">${G.Icons.html('ticket10', 30)}</span><b>+${r.t10}</b></span>` : ''}</div>` : '';
    $('over-stats').innerHTML = `
      <div class="ov-tiles">${ovTile('clock', 'Tiempo', G.U.mmss(r.time))}${ovTile('up', 'Nivel', r.level)}${ovTile('ball', 'Derrotados', n(r.kills))}${ovTile('crown', 'Jefes', r.bosses)}</div>
      ${r.judge ? `<div class="ov-judge"><span class="ico-tile s t-gold">${G.Icons.html('ball4', 30)}</span>
        <div class="grow"><span class="ov-lbl">Ante Arceus</span><b>${G.U.mmss(r.judge.time)} · ${r.judge.bosses} ${r.judge.bosses === 1 ? 'legendario' : 'legendarios'}</b></div></div>` : ''}
      <div class="ov-tiles ov-dmg">${dmg('choiceband', 'Daño total', r.dealt)}${dmg('rockyhelmet', 'Daño recibido', r.taken)}${dmg('berry', 'Curación', r.healed)}</div>
      <div class="ov-coins">
        <span class="ico-tile l round t-gold">${G.Icons.html('coin', 60)}</span>
        <div class="ov-coins-txt"><span class="ov-lbl">Pokémonedas ganadas</span><b class="ov-big">+${n(r.coins)}</b><small>${r.breakdown}</small></div>
        ${tickets}
      </div>
      <section class="ov-sec"><h3>Movimientos</h3>
        ${r.moves.length ? movesTable(r.moves, r.time, false) : '<p class="muted">—</p>'}</section>
      ${r.caught && r.caught.length ? `<section class="ov-sec caught"><h3>${G.Icons.html('shiny', 18)}<span>${r.caught.length} Shinies conseguidos</span></h3>
        <div class="caught-row" id="over-caught"></div></section>` : ''}
      ${unsaved ? '<div class="over-save" id="over-save"></div>' : ''}
      ${askSupport(r) ? `<div class="support-ask" id="over-ask">
        <button class="icon-btn plain x" type="button" aria-label="Cerrar" title="Cerrar">${G.UI.svg('close', 20)}</button>
        <span class="ico-tile s t-red">${G.Icons.html('heart', 22)}</span>
        <p>¿Te está gustando PokéSurvivor? Lo hago yo solo y los servidores cuestan dinero. Si quieres, puedes ayudarme a mantenerlo en línea.</p>
        <a class="btn small ic kofi" href="${G.Funding.url}" target="_blank" rel="noopener">${G.Icons.html('heart', 18)}<span>Apoyar en Ko-fi</span></a>
      </div>` : ''}`;
    const ask = $('over-ask');
    if (ask) ask.querySelector('.x').onclick = () => ask.remove();
    const sv = $('over-save');
    if (sv) { saveNote(sv, G.DB.syncState); watchSave(); }
    $('btn-again').onclick = onBack;
    if (r.caught && r.caught.length) {
      const row = $('over-caught');
      for (const c of r.caught) {
        const w = document.createElement('div');
        w.appendChild(G.UI.spriteCanvas(c.dex, 90, 72, { shiny: true, lively: true, scale: 2 }));
        w.insertAdjacentHTML('beforeend', `<small><b>${G.DEX_BY[c.dex].name}</b>${c.isNew ? '<span class="gold"> · ¡nuevo!</span>' : ''}</small>`);
        row.appendChild(w);
      }
    }
    G.UI.show('scr-over');
    const body = $('scr-over').querySelector('.over-body');
    if (body) body.scrollTop = 0;
  }

  /**
   * Aviso del resumen final: «sin guardar» con un botón que pulsa el Guardar de
   * la barra de arriba (oculta en partida; así son los mismos avisos y esperas), o «guardado».
   * (Azul y no amarillo: la acción principal de la pantalla es «Volver al menú».)
   */
  function saveNote(el, st) {
    el.classList.toggle('ok', st === 'ok');
    el.innerHTML = st === 'ok'
      ? `<span class="ico-tile s round t-green">${G.UI.svg('check', 20)}</span><p>Guardado en la nube</p>`
      : `<span class="ico-tile s round t-gold">${G.UI.svg('save', 20)}</span><p>Tu progreso aún no está en la nube</p>`
        + `<button class="btn small ic" type="button" data-sfx="none"${st === 'syncing' ? ' disabled' : ''}>${G.UI.svg('save', 18)}<span>Guardar</span></button>`;
    const b = el.querySelector('button');
    if (b) b.onclick = () => $('btn-save').click();
  }
  // Sigue al estado de la nube mientras se ve (se apunta una sola vez).
  let saveWatch = false;
  function watchSave() {
    if (saveWatch) return;
    saveWatch = true;
    G.DB.onSync(st => { const el = $('over-save'); if (el && G.UI.isOpen('scr-over')) saveNote(el, st); });
  }

  // ---------------- objeto ----------------

  /** Has encontrado un objeto llevando ya otro: ¿con cuál te quedas? */
  function showItemChoice(cur, next, cb) {
    headIcons('scr-item');
    const box = $('item-cards');
    box.innerHTML = '';
    [[cur, 'Quedarme con'], [next, 'Cambiar a']].forEach(([id, verb], i) => {
      const it = G.Items.BY[id];
      box.appendChild(cardEl({ cls: i ? 'is-next' : 'is-cur', icon: id, tile: i ? 't-gold' : 't-blue', eyebrow: verb, title: it.name, desc: it.desc },
        i, () => { if (guarded()) return; G.UI.hide('scr-item'); cb(id); }, false));
    });
    G.UI.show('scr-item');
    guard(box);
  }

  // ---------------- vínculo: qué movimientos se fusionan ----------------

  let bond = null;          // { opt, cb, first, list }

  /**
   * @param opt  pl.bondOptions(): 'add' (uno suelto al grupo) o 'pair' (dos sueltos, en dos pasos)
   * @param cb   recibe la lista de movimientos que se juntan
   */
  function showBond(opt, cb) {
    bond = { opt, cb, first: null, list: [] };
    headIcons('scr-bond');
    $('bond-back').onclick = bondBack;
    renderBond();
    G.UI.show('scr-bond');
    guard($('bond-cards'));
  }

  function renderBond() {
    const { opt, first } = bond;
    const names = ms => ms.map(m => G.T(m.name, 'move')).join(' + ');
    const step2 = opt.mode === 'pair' && first;
    $('bond-sub').textContent = opt.mode === 'add' ? 'Elige qué movimiento se une a ' + names(opt.group)
      : step2 ? '¿Con cuál unes ' + G.T(first.name, 'move') + '?' : 'Elige el primer movimiento que vas a unir';
    $('bond-back').classList.toggle('hidden', !step2);
    bond.list = step2 ? opt.loose.filter(m => m !== first) : opt.loose;
    const box = $('bond-cards');
    box.innerHTML = '';
    bond.list.forEach((m, i) => {
      const desc = opt.mode === 'add' ? 'Se lanzará a la vez que ' + names(opt.group) + '.'
        : step2 ? 'Se lanzará a la vez que ' + G.T(first.name, 'move') + '. Queda un hueco libre.'
        : m.desc || '';
      box.appendChild(cardEl({ cls: opt.mode === 'add' || step2 ? 'bond' : '', icon: 'move:' + m.id, tile: 'tint', tileC: typeCol(m),
        badge: lvBadge(m.lvl, false, 'ghost'), title: G.T(m.name, 'move'), chips: moveChips(m, false), desc,
        evo: evoHtml(m, G.LevelUp.evoNeed(m, G.Game.player), 'pc-evo') }, i, () => pickBond(i)));
    });
  }

  function pickBond(i) {
    if (!bond || !bond.list[i] || guarded()) return;
    const m = bond.list[i];
    if (bond.opt.mode === 'pair' && !bond.first) {
      bond.first = m;
      G.Audio.sfx('select');
      renderBond();
      return;
    }
    const picked = bond.opt.mode === 'add' ? [m] : [bond.first, m];
    const cb = bond.cb;
    bond = null;
    G.UI.hide('scr-bond');
    cb(picked);
  }

  function bondBack() {
    if (!bond) return;
    bond.first = null;
    renderBond();
  }

  // ---------------- pausa ----------------

  /*
   * Tus ataques, del que más daño ha hecho al que menos: icono, nivel, tipo,
   * familia, daño, parte del total (con su barra) y daño por segundo (desde que
   * lo aprendiste). La usan la pausa y el resumen final. withCat: con la
   * categoría (físico o especial). Los que no hacen daño (potenciadores...), al final.
   */
  function movesTable(moves, t, withCat = true) {
    const n = v => Math.round(v).toLocaleString(G.I18n.locale), pl = G.Game.player;
    const dealt = m => (m.cat ? m.dealt || 0 : -1);
    const total = moves.reduce((a, m) => a + Math.max(0, dealt(m)), 0);
    const rows = moves.slice().sort((a, b) => dealt(b) - dealt(a)).map(m => {
      const secs = Math.max(5, t - (m.since || 0)), col = typeCol(m), d = m.dealt || 0;
      const pct = m.cat && total ? Math.round(d / total * 100) : 0;
      const nums = m.cat ? `<b>${n(d)}</b><small>${total ? pct + ' %' : '—'} · ${n(d / secs)}/s</small>` : '<b>—</b>';
      return `<div class="mv-row${m.evolved ? ' evolved' : ''}">
        <span class="ico-tile s tint" style="--tile-c:${col}">${G.Icons.html('move:' + m.id, 30)}</span>
        <div class="mv-main"><div class="mv-name"><b>${G.T(m.name, 'move')}</b><span class="badge ghost"><span>Nv.</span> ${m.lvl}</span></div>
          <div class="mv-tags">${moveChips(m, withCat)}${evoHtml(m, G.LevelUp.evoNeed(m, pl), 'mv-evo')}</div></div>
        <div class="mv-num">${nums}</div>
        ${m.cat ? `<i class="mv-bar"><i style="width:${pct}%;background:${col}"></i></i>` : ''}</div>`;
    }).join('');
    return `<div class="mv-legend"><span>Daño</span><small><span>%</span> · <span>Por segundo</span></small></div><div class="mv-list">${rows}</div>`;
  }

  /**
   * El movimiento Z en la pausa (24-10-2026). Se activa con la Pulsera Z de tu
   * Pokémon, el Cristal Z de un tipo y 2 ataques de ese tipo en tus huecos
   * (G.Shop.zState). Listo, activo o recargando: el cristal, su nombre, cómo está,
   * tipo, categoría y familia, qué hace y el daño que lleva hecho (× las veces
   * usado). Apagado: qué le falta. Debajo, tus cristales con los ataques que llevas
   * de su tipo (el que va, resaltado). Sin Pulsera Z pero con cristales: dónde se
   * compra. Sin nada de esto, no sale.
   */
  function zCard(pl) {
    const z = G.Combat.zOf(pl), owned = G.Shop.zOwned(), NEED = G.Shop.Z_NEED;
    const name = G.DEX_BY[pl.mon.dex] ? G.DEX_BY[pl.mon.dex].name : '';
    const ring = `<span class="ico-tile s t-gold">${G.Icons.html('zring', 30)}</span>`;
    if (!z) {
      if (!owned.length) return '';
      return `<section class="ps-card ps-z"><h3>Movimiento Z</h3>
        <div class="z-off">${ring}<div><b>${G.I18n.f('{x} no lleva la Pulsera Z', name)}</b>
          <small>Cómprala en la Tienda Kecleon o en sus Mejoras para usar tus Cristales Z.</small></div></div></section>`;
    }
    // Tus cristales: cuántos ataques de su tipo llevas (de los 2 que hacen falta).
    const have = z.have.length ? `<div class="z-have">${z.have.map(h => `<span class="z-cr${h.t === z.type ? ' on' : h.n >= NEED ? ' ok' : !z.type && h.t === z.need ? ' near' : ''}" style="--z-c:${G.U.TYPE_COLOR[h.t]}" title="${G.T(G.Shop.Z_NAME[h.t])}">`
      + `${G.Icons.html('z:' + h.t, 30)}<b>${h.n >= NEED ? h.n + G.UI.svg('check', 12) : h.n + '/' + NEED}</b></span>`).join('')}</div>` : '';
    const rule = `<small class="z-rule">${G.T('Se activa con el Cristal Z de un tipo y 2 ataques de ese tipo en tus huecos. Si cumplen varios, va el del tipo con más ataques.')}</small>`;
    if (!z.type) {
      const what = !z.need ? G.T('Tienes la Pulsera Z, pero ningún Cristal Z: cómpralos en la Tienda Kecleon.')
        : z.needN >= NEED - 1 ? G.I18n.f('Apagado: te falta 1 ataque {x}.', G.T(G.U.TYPE_NAME[z.need]))
        : G.I18n.f('Apagado: te faltan 2 ataques {x}.', G.T(G.U.TYPE_NAME[z.need]));
      return `<section class="ps-card ps-z"><h3>Movimiento Z</h3>
        <div class="z-off">${ring}<div><b>${what}</b>${rule}</div></div>${have}</section>`;
    }
    const d = z.def, n = v => Math.round(v).toLocaleString(G.I18n.locale);
    const m = z.m || Object.assign({}, d, { cat: G.Stats.sideOf(pl.mon) });
    const state = z.t > 0 ? `<span class="z-state on">${G.I18n.f('Activo: {x}', G.U.mmss(z.t))}</span>`
      : z.cd > 0 ? `<span class="z-state">${G.I18n.f('Se recarga: {x}', G.U.mmss(z.cd))}</span>`
      : `<span class="z-state ready">${G.Touch.active ? G.T('Listo: toca el botón Z') : G.I18n.f('Listo: pulsa {x}', G.Input.keyLabel('zmove'))}</span>`;
    return `<section class="ps-card ps-z"><h3>Movimiento Z</h3>
      <div class="mv-row z-mv${z.t > 0 ? ' on' : ''}" style="--z-c:${typeCol(d)}">
        <span class="ico-tile s tint" style="--tile-c:${typeCol(d)}">${G.Icons.html('z:' + z.type, 30)}</span>
        <div class="mv-main"><div class="mv-name"><b>${G.T(d.name)}</b>${state}</div>
          <div class="mv-tags">${moveChips(m)}</div><small class="z-desc">${G.T(d.desc)}</small></div>
        <div class="mv-num"><b>${n(z.dealt + (z.m ? z.m.dealt || 0 : 0))}</b><small>×${z.uses}</small></div>
      </div>${owned.length > 1 ? have : ''}</section>`;
  }

  /**
   * Carta de un ataque nuevo de un tipo con Cristal Z (y tu Pokémon con la Pulsera Z,
   * sin el Z de ese tipo ya listo): «Z 1/2» o, si con él llegas, «Z 2/2» en dorado.
   */
  function zChip(m) {
    const pl = G.Game.player, z = pl && G.Combat.zOf(pl);
    if (!z || !m || !G.Shop.zHas(m.type) || z.type === m.type) return '';
    const h = z.have.find(x => x.t === m.type), k = Math.min(G.Shop.Z_NEED, (h ? h.n : 0) + 1);
    return `<span class="z-chip${k >= G.Shop.Z_NEED && !z.type ? ' go' : ''}" style="--z-c:${G.U.TYPE_COLOR[m.type]}">${G.Icons.html('z:' + m.type, 30)}<b>Z ${k}/${G.Shop.Z_NEED}</b></span>`;
  }

  /*
   * Resumen de la partida en la pausa, en tarjetas: arriba tus huecos de ataque y
   * de pasiva y el objeto (slotsHtml); debajo tus ataques con su daño, el movimiento Z,
   * tus estadísticas con todo lo subido (cada una con el objeto de su carta) y el objeto.
   */
  function pauseSummary() {
    const pl = G.Game.player;
    if (!pl) return '';
    const t = G.Game.st.time, n = v => Math.round(v).toLocaleString(G.I18n.locale);
    const k2 = v => '×' + v.toFixed(2).replace('.', ',');
    const pct = v => Math.round(v * 100) + ' %';
    const mon = pl.mon, fis = 1 - G.Stats.taken(mon, 'physical'), esp = 1 - G.Stats.taken(mon, 'special');
    const guard = v => (v >= 0 ? '−' : '+') + Math.round(Math.abs(v) * 100) + ' %';
    const P = pl.pass || G.Moves.NO_PASS;
    const st = [
      ['hpup', 'Vida', n(pl.hp) + ' / ' + n(pl.maxHp)],
      ['fist', 'Ataque', k2(pl.atkFor({ cat: 'physical' }))],
      ['lifeorb', 'At. Esp.', k2(pl.atkFor({ cat: 'special' }))],
      // (Redondeadas: con la naturaleza salía «85.80000000000001».)
      ['rockyhelmet', 'Defensa', n(mon.df) + ' <small>' + guard(fis) + ' físico</small>'],
      ['assaultvest', 'Def. Esp.', n(mon.sd) + ' <small>' + guard(esp) + ' especial</small>'],
      ['boot', 'Velocidad', n(pl.spd)],
      ['scope-lens', 'Crítico', pct(pl.critChance || 0)],
      ['shield', 'Reducción de daño', pct(pl.reduction)],
      ['clock', 'Recarga', pl.cdMul < 0.995 ? '−' + pct(1 - pl.cdMul) : '0 %'],
      ['sprout', 'Regeneración', pl.regen.toFixed(1).replace('.', ',') + ' /s'],
      // Pasivos de la run (Amplitud, Persistencia, Réplica, Propulsión).
      ['area', 'Área', '+' + pct(P.area - 1)],
      ['duration', 'Duración', '+' + pct(P.dur - 1)],
      ['loaded-dice', 'Cantidad', '+' + (P.amt | 0)],
      ['zoom-lens', 'Vel. de proyectiles', '+' + pct(P.pspd - 1)]
    ].map(([ico, a, b]) => `<div class="st-tile"><span class="ico-tile s">${G.Icons.html(ico, 30)}</span><div><span>${a}</span><b>${b}</b></div></div>`).join('');
    const it = pl.item && G.Items.BY[pl.item];
    // Arriba, como en Vampire Survivors: tus huecos de ataque y de pasiva (y el objeto), con
    // los libres a la vista. Las pasivas ya salen ahí con su nivel: sin la lista de cartas de antes.
    const itemTile = it ? `<span class="sl ico-tile t-gold" title="${it.name}">${G.Icons.html(pl.item, 30)}</span>`
                        : '<span class="sl sl-free"><span>Libre</span></span>';
    return `<section class="ps-card ps-slots"><div class="sl-wrap">${slotsHtml(pl)}
        <div class="sl-group sl-item"><span class="sl-lbl"><b>Objeto</b></span><span class="sl-row">${itemTile}</span></div></div></section>
      <section class="ps-card ps-moves"><h3>Tus ataques</h3>${movesTable(pl.moves, t)}</section>${zCard(pl)}
      <section class="ps-card ps-stats"><h3>Tus estadísticas</h3><div class="st-grid">${st}</div></section>
      ${it ? `<section class="ps-card ps-gear"><h3>Objeto</h3>
        <div class="ps-item"><span class="ico-tile t-gold">${G.Icons.html(pl.item, 30)}</span><div><b>${it.name}</b><small>${it.desc}</small></div></div>
      </section>` : ''}`;
  }

  /** Pista de teclas de la pausa, con las que haya elegido el jugador (Ajustes > Controles). */
  function keyHint() {
    const I = G.Input, k = s => '<kbd>' + String(s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';') + '</kbd>';
    const sl = ['m1', 'm2', 'm3', 'm4'].map(a => I.keyLabel(a));
    const pl = G.Game.player, z = pl && G.Combat.zOf(pl);
    return k(I.moveLabel()) + ' moverse · ' + (sl.join() === '1,2,3,4' ? k(1) + '–' + k(4) : sl.map(k).join(' '))
      + ' movimiento · ' + k(I.keyLabel('prev')) + '/' + k(I.keyLabel('next')) + ' ciclar · '
      + (z ? k(I.keyLabel('zmove')) + ' movimiento Z · ' : '') + k('Esc') + ' pausa';
  }

  function showPause(coop = false) {
    const kh = document.querySelector('#scr-pause .kbd-hint');
    if (kh) kh.innerHTML = keyHint();
    $('pause-sum').innerHTML = pauseSummary();
    G.UI.soundControls($('pause-sound'));
    $('pause-coop').classList.toggle('hidden', !coop);
    $('btn-quit').querySelector('.quit-t').textContent = coop ? 'Salir de la partida' : 'Abandonar run';
    G.UI.show('scr-pause');
    const body = $('scr-pause').querySelector('.pause-body');
    if (body) body.scrollTop = 0;
  }

  function wirePause(onResume, onQuit) {
    $('btn-resume').onclick = onResume;
    $('btn-quit').onclick = onQuit;
  }

  return { showLevelUp, reroll, showItemChoice, showBond, pickBond, bondBack, pick, setWaiting, closeLevelUp, showOver, wirePause, showPause, KIND_NAME };
})();
