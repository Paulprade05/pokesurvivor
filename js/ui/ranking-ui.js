/* ============ ranking-ui.js — pantalla del ranking ============
 * Hoja con una barra de filtros: Solo / Grupo, Todos / Amigos y el periodo
 * (diario ... histórico); el filtro por Pokémon (sólo en el histórico) se abre
 * con la lupa. Los tres primeros llevan medalla (chapas de oro, plata y bronce)
 * y tu puesto va fijo abajo aunque no salgas en el top. Lo leído se guarda 2 h
 * (ver ranking.js). Estilos: style.css, «pantallas: social».
 */
G.RankingUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let mode = 's', period = 'w', scope = 'all', dex = null;
  let token = 0, findOn = false;
  // Medalla de los tres primeros: chapa dorada, plateada y de bronce (icons.js), en su baldosa.
  const MEDAL = { 1: ['medal3', 't-gold'], 2: ['medal2', 'rk-silver'], 3: ['medal1', 'rk-bronze'] };

  function init() {
    const dl = $('rk-dl');
    dl.innerHTML = G.DEX.map(p => `<option value="${esc(G.T(p.name))}">`).join('');
    $('rk-poke').onchange = () => {
      const v = $('rk-poke').value.trim().toLowerCase();
      const p = G.DEX.find(x => (x.name.toLowerCase() === v || G.T(x.name).toLowerCase() === v));
      if (!v) { setDex(null); return; }
      if (!p) { G.UI.toast('No hay ningún Pokémon con ese nombre'); return; }
      setDex(p.dex);
    };
    $('rk-clear').onclick = () => { $('rk-poke').value = ''; setDex(null); };
    $('rk-mod').onclick = () => G.ModUI.open();
    $('rk-find').onclick = () => setFind(!findOn, true);
    $('rk-me-ico').innerHTML = G.Icons.html('trophy', 30);
  }

  /** Abre o cierra la fila del filtro por Pokémon (con un Pokémon elegido se queda abierta). */
  function setFind(on, focus) {
    findOn = !!on || !!dex;
    $('scr-rank').classList.toggle('find-on', findOn);
    $('rk-find').classList.toggle('on', findOn);
    $('rk-find').setAttribute('aria-expanded', findOn ? 'true' : 'false');
    if (findOn && focus) setTimeout(() => $('rk-poke').focus(), 30);
  }

  /** El filtro por Pokémon sólo existe en el histórico: al elegir uno se pasa a esa pestaña. */
  function setDex(d) {
    dex = d;
    if (d && period !== 'a') period = 'a';
    $('rk-clear').classList.toggle('hidden', !d);
    setFind(findOn);
    tabs(); load();
  }

  function open() {
    if (!G.SocialUI.needOnline()) return;
    G.UI.show('scr-rank', true);
    if (!G.Social.started) G.Social.start();
    $('rk-mod').classList.toggle('hidden', !G.Ranking.isAdmin());
    setFind(false);
    tabs();
    load();
  }

  function tabs() {
    const mk = (box, items, cur, set, cls) => {
      box.innerHTML = '';
      for (const [k, label] of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = (cls + (k === cur ? ' on' : '')).trim();
        b.textContent = label;
        b.setAttribute('aria-pressed', k === cur ? 'true' : 'false');
        b.onclick = () => { if (k === cur) return; set(k); tabs(); load(); };
        box.appendChild(b);
      }
    };
    mk($('rk-mode'), [['s', 'Solo'], ['g', 'Grupo']], mode, k => { mode = k; }, '');
    mk($('rk-scope'), [['all', 'Todos'], ['friends', 'Amigos']], scope, k => { scope = k; }, '');
    mk($('rk-period'), G.Ranking.PERIODS, period, k => {
      period = k;
      if (k !== 'a' && dex) { dex = null; $('rk-poke').value = ''; $('rk-clear').classList.add('hidden'); setFind(findOn); }
    }, 'chip');
    // (26-10-2026) Tumbado, los filtros se deslizan de lado y el periodo elegido podía quedar
    // fuera (en 667 sólo se veía «Diario»): se desliza lo justo para que se vea.
    const on = $('rk-period').querySelector('.on'), bar = on && on.closest('.rk-bar');
    if (bar && bar.scrollWidth > bar.clientWidth + 1) {
      const r = on.getBoundingClientRect(), s = bar.getBoundingClientRect();
      if (r.right > s.right) bar.scrollLeft += r.right - s.right + 12;
      else if (r.left < s.left) bar.scrollLeft -= s.left - r.left + 12;
    }
  }

  const fmt = t => t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t);

  async function load() {
    const my = ++token;
    const list = $('rk-list');
    list.classList.toggle('grp', mode === 'g');           // en grupo, cada fila en dos líneas en el móvil
    list.innerHTML = '<p class="rk-msg">Cargando…</p>';
    $('rk-me').innerHTML = '';
    let rows = [], me = null;
    try {
      [rows, me] = await Promise.all([
        G.Ranking.top(mode, period, dex, scope === 'friends'),
        G.Social.me ? G.Ranking.myRank(mode, period, dex) : Promise.resolve(null)
      ]);
    } catch (e) {
      if (my !== token) return;
      list.innerHTML = '<p class="rk-msg err">No se pudo cargar el ranking (' + esc(e.code || e.message) + ').</p>';
      return;
    }
    if (my !== token) return;
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state"><span class="ico-tile l round t-gold">${G.Icons.html('medalOff', 60)}</span>` +
        '<b>Todavía no hay marcas aquí. ¡Sé el primero!</b></div>';
    }
    const uid = G.Social.uid;
    const b = G.Ranking.board(mode, period, dex), done = G.Ranking.reported();
    rows.forEach((r, i) => list.appendChild(rowEl(r, i + 1, r.uids.includes(uid), b, done)));

    // La frase se monta en cada idioma (traducirla por trozos sale rara).
    const lang = G.I18n.lang, en = lang === 'en', pos = '#' + (me && me.capped ? '1000+' : me && me.pos);
    if (lang !== 'es' && !en) {
      // Otros idiomas: frases enteras sin periodo ni Pokémon (ya se ven en los filtros).
      const rk = $('rk-me');
      rk.setAttribute('translate', 'no');
      rk.textContent = !G.Social.me ? G.T('Elige un apodo (en Amigos) para salir en el ranking.')
        : me && me.out ? G.T('Aún no estás en el top 50. Tu puesto está en Histórico.')
        : me ? G.I18n.f('Tu mejor puesto: {x}', pos) + ' · ' + fmt(me.t)
        : G.T('Aún no tienes marca.');
      return;
    }
    const pn = en ? { d: 'today', w: 'this week', m: 'this month', y: 'this year', a: 'of all time' }[period]
                  : { d: 'de hoy', w: 'de esta semana', m: 'de este mes', y: 'de este año', a: 'de siempre' }[period];
    const mon = dex ? G.DEX_BY[dex].name : '';
    const where = en ? (mode === 's' ? 'solo' : 'group') + (dex ? ' with ' + mon : '')
                     : (mode === 's' ? 'en solitario' : 'en grupo') + (dex ? ' con ' + mon : '');
    $('rk-me').removeAttribute('translate');
    $('rk-me').innerHTML = !G.Social.me ? 'Elige un apodo (en Amigos) para salir en el ranking.'
      : me && me.out ? (en ? `<span translate="no">You're not in the top 50 ${where} ${pn} yet. Your rank is in All-time.</span>`
                           : `Aún no estás en el top 50 ${pn} ${where}. Tu puesto está en Histórico.`)
      : me ? (en ? `<span translate="no">Your best ${where} rank ${pn}: <b class="gold">${pos}</b> · ${fmt(me.t)}</span>`
                 : `Tu mejor puesto ${pn} ${where}: <b class="gold">${pos}</b> · ${fmt(me.t)}`)
      : (en ? `<span translate="no">You don't have a ${where} record ${pn} yet.</span>` : `Aún no tienes marca ${pn} ${where}.`);
  }

  /** Una fila: puesto (medalla en los tres primeros), equipo, nombres, tiempo y la bandera de reportar. */
  function rowEl(r, pos, mine, b, done) {
    const el = document.createElement('div');
    el.className = 'rk-item' + (mine ? ' mine' : '') + (pos <= 3 ? ' top' + pos : '');
    const md = MEDAL[pos];
    el.insertAdjacentHTML('beforeend', md
      ? `<span class="rk-pos"><span class="rk-medal ico-tile s round ${md[1]}">${G.Icons.html(md[0], 30)}<i>${pos}</i></span></span>`
      : `<span class="rk-pos">${pos}</span>`);
    const mons = document.createElement('span');
    mons.className = 'rk-mons';
    r.dex.forEach((d, i) => { if (G.DEX_BY[d]) mons.appendChild(G.UI.spriteCanvas(d, 44, 40, { scale: 1, shiny: !!r.shiny[i] })); });
    el.appendChild(mons);
    el.insertAdjacentHTML('beforeend',
      `<span class="rk-who"><b translate="no">${r.names.map((n, i) => `<a href="#" class="rk-name" data-u="${esc(r.uids[i] || '')}">${esc(n)}</a>`).join(' · ')}</b>` +
      `<small>Nv. ${r.lv || 1} · ${(r.kills || 0).toLocaleString(G.I18n.locale)} derrotados</small></span>` +
      `<span class="rk-time">${fmt(r.t)}</span>`);
    el.querySelectorAll('.rk-name').forEach(a => { a.onclick = e => { e.preventDefault(); G.ProfileUI.show(a.dataset.u); }; });
    // Reportar una marca sospechosa (no la tuya). Lo revisa el admin (mod-ui.js).
    if (!mine && G.Social.me) {
      const rep = document.createElement('button');
      const sent = done.has(b + '__' + r.id);
      const tip = t => { rep.title = t; rep.setAttribute('aria-label', t); };
      rep.type = 'button';
      rep.className = 'icon-btn plain rk-flag' + (sent ? ' sent' : '');
      tip(sent ? 'Ya la has reportado' : 'Reportar marca sospechosa');
      rep.innerHTML = G.Icons.html('flag', 18);
      rep.onclick = async () => {
        if (rep.classList.contains('sent')) { G.UI.toast('Ya has reportado esta marca'); return; }
        if (!confirm('¿Reportar la marca de ' + r.names.join(', ') + ' como trampa?')) return;
        rep.classList.add('sent'); tip('Ya la has reportado');
        await G.Ranking.report(b, r);
        G.UI.toast('Gracias: la revisaremos');
      };
      el.appendChild(rep);
    }
    return el;
  }

  return { init, open };
})();
