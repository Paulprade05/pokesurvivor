/* ============ goals-ui.js — misiones, logros y perfil ============
 * Una hoja con tres pestañas:
 *   Misiones  3 diarias + 2 semanales: icono, barra, premio y botón de recoger
 *   Logros    medallas por categoría en una rejilla; los legendarios, uno a uno
 *             con su sprite, y los movimientos que evolucionan
 *   Perfil    tus 3 favoritos y tu título; vista previa del perfil público
 * y la ventana del perfil público de cualquier jugador (G.ProfileUI.show).
 * Los iconos son objetos de verdad (G.Icons, a 30 o 60 px) en su baldosa.
 */
(() => {
  const $ = G.UI.$;
  /** ¿Es la ventana de más arriba? (con Ajustes o Novedades encima, Esc es para esa) */
  function onTop(el) {
    const z = x => parseInt(getComputedStyle(x).zIndex, 10) || 0, mine = z(el);
    for (const x of document.querySelectorAll('.scr:not(.hidden)')) if (x !== el && z(x) > mine) return false;
    return true;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = t => (t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t));
  const num = n => (n || 0).toLocaleString(G.I18n.locale);
  const ico = n => G.Icons.html(n, 30);

  /** Premio en fichas: icono del objeto (30 px) y la cantidad. */
  function rewardChips(r) {
    if (!r) return '';
    const p = [];
    if (r.t10) p.push(`<span class="rw-chip t10">${ico('ticket10')}<b>${r.t10}</b></span>`);
    if (r.t1) p.push(`<span class="rw-chip">${ico('ticket')}<b>${r.t1}</b></span>`);
    if (r.coins) p.push(`<span class="rw-chip">${ico('coin')}<b>${num(r.coins)}</b></span>`);
    return `<span class="rw-chips">${p.join('')}</span>`;
  }

  /** Ancho para cada uno de los n lienzos de una fila (como mucho max), medido en su caja
   *  (menos el relleno y el borde de la casilla, .fav-slot: 6 + 6 y 2 + 2). */
  function slotWidth(el, n, max, gap) {
    const w = el.clientWidth;
    return w ? Math.max(56, Math.min(max, Math.floor((w - gap * (n - 1)) / n) - 16)) : max;
  }
  /** Alto de esos lienzos: más bajo con el móvil tumbado (los Pokémon a ×2 caben igual). */
  const slotHeight = w => matchMedia('(max-height: 520px)').matches ? 80 : w >= 112 ? 104 : 88;

  // ======================= PANTALLA =======================

  G.GoalsUI = (() => {
    let tab = 'missions', cat = 'coleccion';
    let favW = 0;                 // ancho de la ventana con el que se midieron los favoritos

    // Icono de cada misión (por su plantilla, data/missions.js) y de cada categoría de logros.
    const MISSION_ICO = { kill: 'fist', wkill: 'fist', survive: 'clock', wsurvive: 'clock', level: 'exp', boss: 'crown',
      wboss: 'crown', chest: 'star', coins: 'coin', item: 'leftovers', evolve: 'tm', wevolve: 'tm', wrift: 'ball4', wdaily: 'medal3' };
    const CAT_ICO = { coleccion: 'book', supervivencia: 'revive', combate: 'choiceband', grietas: 'star', legendarios: 'ball4', otros: 'medal3' };

    function init() {
      document.querySelectorAll('#goals-tabs .tab').forEach(t => {
        t.onclick = () => { if (tab === t.dataset.tab && !$('fav-back')) return; tab = t.dataset.tab; render(); };
      });
      // «Volver» de la cabecera (menu.js le pone ir al menú): eligiendo favorito,
      // vuelve antes al perfil, como Esc. Así también el botón B del mando, que pulsa el primero.
      const head = document.querySelector('#scr-goals .sheet-head [data-back]'), toMenu = head.onclick;
      head.onclick = e => { if ($('fav-back')) $('fav-back').click(); else if (toMenu) toMenu.call(head, e); };
      // Esc en «Elige el favorito» vuelve al perfil (y no al menú).
      addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !G.UI.isOpen('scr-goals') || G.UI.isOpen('scr-profile') || !$('fav-back') || !onTop($('scr-goals'))) return;
        e.stopPropagation(); e.preventDefault();
        $('fav-back').click();
      }, true);
      // Al girar el móvil, los favoritos vuelven a medir su hueco.
      let q = 0;
      addEventListener('resize', () => {
        if (q) return;
        q = requestAnimationFrame(() => { q = 0; if (G.UI.isOpen('scr-goals') && tab === 'profile' && !$('fav-back') && innerWidth !== favW) render(); });
      });
    }

    function open(t) {
      if (t) tab = t;
      G.UI.show('scr-goals', true);
      G.Progress.ensure(G.DB.save);
      G.Progress.checkAch();
      render();
    }

    function render() {
      document.querySelectorAll('#goals-tabs .tab').forEach(t => {
        const on = t.dataset.tab === tab;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const box = $('goals-body');
      box.innerHTML = '';
      box.scrollTop = 0;
      box.dataset.tab = tab;
      if (tab === 'missions') missions(box);
      else if (tab === 'ach') achievements(box);
      else profile(box);
    }

    // ---------------- misiones ----------------

    function untilText(kind) {
      const now = new Date();
      // Medianoche (diarias) o lunes (semanales), hora de España aproximada por la del navegador.
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      if (kind === 'w') { const add = (8 - (now.getDay() || 7)) % 7; end.setDate(end.getDate() + add); }
      const mins = Math.max(1, Math.round((end - now) / 60000));
      return mins >= 1440 ? Math.floor(mins / 1440) + ' d ' + Math.floor(mins % 1440 / 60) + ' h'
                          : Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min';
    }

    function missions(box) {
      const M = G.DB.save.missions;
      const section = (title, list, weekly) => {
        box.insertAdjacentHTML('beforeend', `<div class="goals-sec${weekly ? ' weekly' : ''}"><h3>${title}</h3>
          <span class="goals-left">${G.UI.svg('refresh', 16)}<span>Se renuevan en ${untilText(weekly ? 'w' : 'd')}</span></span></div>`);
        const wrap = document.createElement('div');
        wrap.className = 'mission-list';
        list.forEach((m, i) => {
          const d = G.MissionDefs.BY[m.id];
          const done = G.Progress.done(m);
          const el = document.createElement('div');
          el.className = 'mission-row' + (weekly ? ' weekly' : '') + (m.claimed ? ' claimed' : done ? ' ready' : '');
          const pct = Math.min(100, m.prog / m.goal * 100);
          const icon = m.param && G.U.TYPE_NAME[m.param] ? G.Icons.html('type:' + m.param, 32) : ico(MISSION_ICO[m.id] || 'medal2');
          const tint = m.claimed ? '' : done ? ' t-gold' : weekly ? ' t-purple' : ' t-blue';
          el.innerHTML = `
            <span class="ico-tile m-ico${tint}">${icon}</span>
            <div class="m-txt"><b>${esc(G.Progress.text(m))}</b>
              <div class="m-prog"><div class="meter${done ? ' green' : ''}"><i style="width:${pct}%"></i></div>
              <small>${num(Math.min(m.prog, m.goal))} / ${num(m.goal)}</small></div></div>
            <div class="m-rw">${rewardChips(d.reward)}</div>`;
          const btn = document.createElement('button');
          btn.type = 'button';
          if (m.claimed) {
            btn.className = 'btn small ghost ic m-btn'; btn.disabled = true;
            btn.innerHTML = G.UI.svg('check', 18) + '<span>Recogido</span>';
          } else if (done) {
            btn.className = 'btn small gold m-btn'; btn.textContent = 'Recoger'; btn.dataset.sfx = 'none';
            btn.onclick = () => { if (G.Progress.claim(m, weekly)) { G.Audio.sfx('buy'); G.UI.toast('¡Premio recogido!'); render(); } };
          } else if (!weekly && !M.rerolled) {
            btn.className = 'btn small ghost ic m-btn';
            btn.innerHTML = G.UI.svg('refresh', 18) + '<span>Cambiar</span>';
            btn.title = 'Cambia esta misión por otra (una vez al día)';
            btn.onclick = () => { if (G.Progress.reroll(i)) render(); };
          } else { btn.className = 'btn small ghost m-btn'; btn.disabled = true; btn.textContent = 'En curso'; }
          el.appendChild(btn);
          wrap.appendChild(el);
        });
        box.appendChild(wrap);
      };
      section('Diarias', M.daily, false);
      section('Semanales', M.weekly, true);
    }

    // ---------------- logros ----------------

    function achievements(box) {
      const s = G.DB.save;
      const all = G.AchDefs.LIST;
      const got = all.filter(a => s.ach && s.ach[a.id]).length;
      box.insertAdjacentHTML('beforeend', `<div class="panel ach-sum">
        <span class="ico-tile l round t-gold">${G.Icons.html('medal3', 60)}</span>
        <div class="grow"><b class="ach-count">${got} / ${all.length}</b>
          <p class="sub">${got} de ${all.length} logros · títulos: ${G.Progress.titles().length}</p>
          <div class="meter"><i style="width:${all.length ? got / all.length * 100 : 0}%"></i></div></div></div>`);

      // Categorías: píldoras que se deslizan de lado en el móvil.
      const chips = document.createElement('div');
      chips.className = 'chips goals-cats';
      for (const [k, label] of G.AchDefs.CATS) {
        const list = all.filter(a => a.cat === k);
        const n = list.filter(a => s.ach && s.ach[a.id]).length;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (k === cat ? ' on' : '') + (list.length && n >= list.length ? ' full' : '');
        b.innerHTML = `${ico(CAT_ICO[k] || 'medal2')}<span>${label}</span><small>${n}/${list.length}</small>`;
        b.onclick = () => { if (cat === k) return; cat = k; render(); };
        chips.appendChild(b);
      }
      box.appendChild(chips);

      const list = all.filter(a => a.cat === cat && !a.dex);
      if (list.length) {
        const grid = document.createElement('div');
        grid.className = 'ach-grid';
        for (const a of list) grid.appendChild(achCard(a, s));
        box.appendChild(grid);
      }

      // Legendarios: uno a uno, con su sprite (en sombra si aún no le has vencido).
      if (cat === 'legendarios') {
        const legs = all.filter(a => a.dex);
        const beaten = legs.filter(a => s.legends && s.legends[a.dex]).length;
        box.insertAdjacentHTML('beforeend', `<div class="goals-sec"><h3>Legendarios vencidos ${beaten} / ${legs.length}</h3></div>
          <div class="meter goals-meter"><i style="width:${legs.length ? beaten / legs.length * 100 : 0}%"></i></div>`);
        const lg = document.createElement('div');
        lg.className = 'leg-grid';
        for (const a of legs) {
          const ok = !!(s.legends && s.legends[a.dex]);
          const c = document.createElement('div');
          c.className = 'leg-cell' + (ok ? ' ok' : '');
          c.title = ok ? a.name : '???';
          c.appendChild(G.UI.spriteCanvas(a.dex, 64, 56, { scale: 1, silhouette: !ok, shadow: ok }));
          c.insertAdjacentHTML('beforeend', `<small>${ok ? esc(G.DEX_BY[a.dex].name) : '???'}</small>` +
            (ok ? `<span class="leg-ok">${G.UI.svg('check', 14)}</span>` : ''));
          lg.appendChild(c);
        }
        box.appendChild(lg);
      }

      // Combate: todos los movimientos que evolucionan y cuáles has evolucionado ya
      // (el logro «Maestro de movimientos» cuenta lo mismo: save.evoMoves).
      if (cat === 'combate') {
        const EVO = G.Moves.EVO, BY = G.Moves.BY_ID, types = Object.keys(G.U.TYPE_NAME);
        const all = Object.keys(EVO), ok = id => !!(s.evoMoves && s.evoMoves[id]);
        const ids = all.filter(id => BY[id]).sort((a, b) => types.indexOf(BY[a].type) - types.indexOf(BY[b].type)
          || G.T(BY[a].name, 'move').localeCompare(G.T(BY[b].name, 'move'), G.I18n.locale));
        const nOk = all.filter(ok).length;
        box.insertAdjacentHTML('beforeend', `<div class="goals-sec"><h3>Movimientos evolucionados ${nOk} / ${all.length}</h3></div>
          <p class="sub goals-hint">Un movimiento al nivel máximo evoluciona si en esa partida coges la carta que pide.</p>
          <div class="meter goals-meter"><i style="width:${all.length ? nOk / all.length * 100 : 0}%"></i></div>`);
        // Cada una con sus iconos, como en Vampire Survivors: ataque + carta = evolución
        // (la evolución, el mismo dibujo en baldosa dorada; con ✓ si ya la tienes).
        const eg = document.createElement('div');
        eg.className = 'evo-grid evo-eqs';
        eg.innerHTML = ids.map(id => {
          const need = G.LevelUp.STATS.find(x => x.id === EVO[id][1]);
          const needName = need ? need.title : G.Moves.NEED_NAME[EVO[id][1]] || '';
          const col = G.U.TYPE_COLOR[BY[id].type] || '#9fb1c9';
          return `<div class="evo-tile${ok(id) ? ' ok' : ''}">
            <div class="evo-eq"><span class="ico-tile s tint" style="--tile-c:${col}">${ico('move:' + id)}</span><i>+</i>`
            + `<span class="ico-tile s" title="${esc(needName)}">${need ? ico(need.icon) : ''}</span><i>=</i>`
            + `<span class="ico-tile s t-gold evo-to">${ico('move:' + id)}${ok(id) ? `<span class="evo-got" title="¡Conseguido!">${G.UI.svg('check', 12)}</span>` : ''}</span></div>
            <div class="evo-txt"><b>${G.T(BY[id].name, 'move')}</b><small class="gold">→ ${G.T(EVO[id][0], 'move')}</small>
            <small><span>${needName}</span> · <span>Nv.</span> ${BY[id].maxLvl}</small></div></div>`;
        }).join('');
        box.appendChild(eg);
      }
    }

    function achCard(a, s) {
      const ok = !!(s.ach && s.ach[a.id]);
      const v = Math.min(a.goal, a.value(s));
      const el = document.createElement('div');
      el.className = 'ach-tile tier' + a.tier + (ok ? ' ok' : '');
      el.innerHTML = `<span class="ico-tile round ach-medal">${G.Icons.html(ok ? 'medal' + a.tier : 'medalOff', 60)}
          ${ok ? '' : `<span class="ach-lock">${G.UI.svg('lock', 14)}</span>`}</span>
        <b class="ach-name">${esc(a.name)}</b>
        <small class="ach-desc">${esc(a.desc)}</small>
        ${ok ? `<span class="ach-done">${G.UI.svg('check', 16)}<span>¡Conseguido!</span></span>`
             : `<div class="ach-prog"><div class="meter"><i style="width:${v / a.goal * 100}%"></i></div><small>${num(v)} / ${num(a.goal)}</small></div>`}
        ${rewardChips(a.reward)}
        ${a.title ? `<span class="ach-title">Título: ${esc(a.title)}</span>` : ''}`;
      return el;
    }

    // ---------------- perfil (editar) ----------------

    function profile(box) {
      const s = G.DB.save;
      s.profile = s.profile || { favs: [], title: '' };
      const P = s.profile;
      box.insertAdjacentHTML('beforeend', `<p class="sub goals-hint">${G.DB.online ? 'Así te ven los demás jugadores (desde el ranking y la lista de amigos).'
        : 'Tu perfil se publica cuando juegas con una cuenta online.'}</p>
        <div class="goals-sec"><h3>Tus 3 Pokémon favoritos</h3></div>`);
      const favs = document.createElement('div');
      favs.className = 'fav-slots';
      box.appendChild(favs);
      favW = innerWidth;
      const w = slotWidth(favs, 3, 128, 10), h = slotHeight(w);
      for (let i = 0; i < 3; i++) {
        const f = P.favs[i];
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = 'fav-slot';
        if (f && G.DEX_BY[f.dex]) {
          slot.classList.add('has');
          if (f.shiny) slot.classList.add('shiny');
          slot.appendChild(G.UI.spriteCanvas(f.dex, w, h, { scale: 2, lively: true, shiny: !!f.shiny }));
          slot.insertAdjacentHTML('beforeend', `<b>${f.shiny ? G.Icons.html('shiny', 16) : ''}<span>${esc(G.DEX_BY[f.dex].name)}</span></b>`);
        } else slot.innerHTML = `<span class="fav-plus">${G.UI.svg('plus', 26)}</span><b>Elegir</b>`;
        slot.onclick = () => pickFav(i);
        favs.appendChild(slot);
      }

      const titles = G.Progress.titles();
      box.insertAdjacentHTML('beforeend', `<div class="goals-sec"><h3>Título</h3></div>`);
      const row = document.createElement('div');
      row.className = 'panel prof-title-row';
      row.innerHTML = `<span class="ico-tile round t-gold">${ico('crown')}</span>`;
      const sel = document.createElement('select');
      sel.className = 'field';
      sel.setAttribute('aria-label', 'Título');
      sel.innerHTML = `<option value="">(sin título)</option>` + titles.map(t => `<option value="${esc(t)}" ${t === P.title ? 'selected' : ''}>${esc(t)}</option>`).join('');
      sel.onchange = () => { P.title = sel.value; save(); };
      row.appendChild(sel);
      box.appendChild(row);
      if (!titles.length) box.insertAdjacentHTML('beforeend', '<p class="note">Consigue logros para desbloquear títulos.</p>');

      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn gold ic prof-preview';
      prev.innerHTML = G.UI.svg('user', 20) + '<span>Ver mi perfil público</span>';
      prev.onclick = () => G.ProfileUI.showData(G.Social.profileData());
      box.appendChild(prev);
    }

    function pickFav(i) {
      const s = G.DB.save;
      const box = $('goals-body');
      box.scrollTop = 0;
      box.innerHTML = `<div class="fav-pick-head">
          <button class="icon-btn" type="button" id="fav-back" aria-label="Volver" title="Volver">${G.UI.svg('back')}</button>
          <h3>Elige el favorito ${i + 1}</h3></div>
        <input class="field fav-q" id="fav-q" type="search" placeholder="Buscar por nombre" autocomplete="off" spellcheck="false">
        <div class="grid fav-grid" id="fav-grid"></div>`;
      $('fav-back').onclick = () => { tab = 'profile'; render(); };
      const fill = q => {
        const g = $('fav-grid');
        g.innerHTML = '';
        const mons = Object.keys(s.owned).map(Number).filter(d => G.DEX_BY[d] && (!q || (G.DEX_BY[d].name.toLowerCase().includes(q) || G.T(G.DEX_BY[d].name).toLowerCase().includes(q))));
        for (const d of mons.slice(0, 120)) {
          for (const shiny of G.DB.ownsShiny(d) ? [false, true] : [false]) {
            const c = document.createElement('button');
            c.type = 'button';
            c.className = 'cell' + (shiny ? ' shiny' : '');
            c.appendChild(G.UI.spriteCanvas(d, 92, 80, { scale: 2, shiny }));
            c.insertAdjacentHTML('beforeend', `<b>${shiny ? G.Icons.html('shiny', 12) + ' ' : ''}${esc(G.DEX_BY[d].name)}</b>`);
            c.onclick = () => {
              s.profile.favs = (s.profile.favs || []).slice();
              s.profile.favs[i] = { dex: d, shiny };
              s.profile.favs = s.profile.favs.filter(Boolean).slice(0, 3);
              save(); tab = 'profile'; render();
            };
            g.appendChild(c);
          }
        }
      };
      $('fav-q').oninput = () => fill($('fav-q').value.trim().toLowerCase());
      fill('');
    }

    function save() {
      G.DB.commit();
      if (G.Social.me) G.Social.publishProfile(true);
      G.Audio.sfx('confirm');
    }

    return { init, open, render };
  })();

  // ======================= PERFIL PÚBLICO =======================

  G.ProfileUI = (() => {
    let last = null, lastW = 0;   // lo último enseñado y con qué ancho (para volver a medirlo al girar el móvil)

    function init() {
      $('prof-close').onclick = close;
      $('scr-profile').onclick = e => { if (e.target.id === 'scr-profile') close(); };
      // Esc cierra la ventana (y no hace nada más debajo).
      addEventListener('keydown', e => {
        if (e.key !== 'Escape' || $('scr-profile').classList.contains('hidden')) return;
        e.stopPropagation(); e.preventDefault();
        close();
      }, true);
      let q = 0;
      addEventListener('resize', () => {
        if (q) return;
        q = requestAnimationFrame(() => { q = 0; if (last && innerWidth !== lastW && !$('scr-profile').classList.contains('hidden')) showData(last); });
      });
    }
    function close() { $('scr-profile').classList.add('hidden'); last = null; $('prof-body').innerHTML = ''; }

    function state(text) {
      $('prof-body').innerHTML = `<div class="empty-state"><span class="ico-tile l round">${G.Icons.html('crown', 60)}</span><b>${text}</b></div>`;
    }

    /** Abre el perfil de otro jugador por su uid. */
    async function show(uid) {
      if (!uid) return;
      if (uid === G.Social.uid) { showData(G.Social.profileData()); return; }
      last = null;
      state('Cargando…');
      $('scr-profile').classList.remove('hidden');
      const d = await G.Social.getProfile(uid);
      if ($('scr-profile').classList.contains('hidden')) return;        // la cerró mientras cargaba
      if (!d) { state('Este jugador aún no tiene perfil.'); return; }
      showData(d);
    }

    function showData(d) {
      last = d; lastW = innerWidth;
      const b = d.best || {};
      const body = $('prof-body');
      $('scr-profile').classList.remove('hidden');
      body.innerHTML = `
        <div class="prof-hero">
          <div class="prof-id">
            <span class="ico-tile l round t-gold">${G.Icons.html('crown', 60)}</span>
            <div class="grow"><h3 class="prof-name" translate="no">${esc(d.name || '???')}</h3>
              ${d.title ? `<span class="prof-title">${esc(d.title)}</span>` : ''}</div>
          </div>
          <div class="fav-slots view" id="prof-favs"></div>
        </div>
        <div class="prof-stats">
          ${mark('clock', fmt(b.solo || 0), 'Mejor tiempo')}
          ${mark('friends', fmt(b.group || 0), 'En grupo')}
          ${mark('exp', b.level || 0, 'Nivel máximo')}
          ${mark('crown', num(b.bosses), 'Jefes')}
          ${mark('ball4', b.legends || 0, 'Legendarios')}
          ${mark('fist', num(b.kills), 'Derrotados')}
        </div>
        <div class="goals-sec"><h3>Medallas</h3><span class="badge gold">${b.medals || 0}</span></div>
        <div class="prof-medals" id="prof-medals"></div>`;
      const favs = $('prof-favs');
      const list = (d.favs || []).slice(0, 3).filter(f => G.DEX_BY[f.dex]);
      const w = slotWidth(favs, 3, 128, 10), h = slotHeight(w);
      for (const f of list) {
        const slot = document.createElement('div');
        slot.className = 'fav-slot has' + (f.shiny ? ' shiny' : '');
        slot.appendChild(G.UI.spriteCanvas(f.dex, w, h, { scale: 2, lively: true, shiny: !!f.shiny }));
        slot.insertAdjacentHTML('beforeend', `<b>${f.shiny ? G.Icons.html('shiny', 16) : ''}<span>${esc(G.DEX_BY[f.dex].name)}</span></b>`);
        favs.appendChild(slot);
      }
      if (!list.length) favs.outerHTML = '<p class="sub prof-empty">Sin favoritos todavía.</p>';
      const med = $('prof-medals');
      for (const id of d.medals || []) {
        const a = G.AchDefs.BY[id];
        if (!a) continue;
        const m = document.createElement('div');
        m.className = 'pm tier' + a.tier;
        m.title = a.name;
        if (a.dex) m.appendChild(G.UI.spriteCanvas(a.dex, 48, 40, { scale: 1 }));
        else m.innerHTML = `<span class="ico-tile round">${ico('medal' + a.tier)}</span>`;
        m.insertAdjacentHTML('beforeend', `<small>${esc(a.name)}</small>`);
        med.appendChild(m);
      }
      if (!med.children.length) med.outerHTML = '<p class="sub prof-empty">Aún sin medallas.</p>';
    }

    /** Una marca del perfil: icono del objeto, la cifra y lo que es. */
    function mark(icon, value, label) {
      return `<div class="pmk"><span class="ico-tile s">${ico(icon)}</span><b>${value}</b><span class="pmk-l">${label}</span></div>`;
    }

    return { init, show, showData };
  })();
})();
