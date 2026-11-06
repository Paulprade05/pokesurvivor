/* ============ runs-ui.js — «Historial de partidas» (03-11-2026) ============
 * Hoja (como Novedades) con las partidas que guarda core/registro.js en este
 * aparato: una tarjeta por partida con lo principal y, al tocarla, el detalle
 * (ataques, quién te ha pegado, curación, caídas, cartas). Arriba, Exportar
 * baja un .json con todas (tools/analizar-partidas.cjs lo resume). Se abre
 * desde el perfil (Misiones › Perfil › Historial de partidas).
 */
G.RunsUI = (() => {
  const $ = G.UI.$;
  const PAGE = 40;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Math.round(n || 0).toLocaleString(G.I18n.locale);
  const mmss = t => (t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t || 0));
  let list = [], shown = 0;

  const STATE = { muerto: 'Caído', salida: 'Abandonada', cerrada: 'Sin terminar', jugando: 'En curso' };
  const HOW = { toque: 'Contacto', disparo: 'Disparo', zona: 'Zona', zone: 'Zona', line: 'Línea', 'explosión': 'Explosión',
                veneno: 'Veneno', explosiva: 'Explosiva', quemadura: 'Quemadura', lava: 'Lava', firma: 'Ataque firma' };
  const KIND = { b: 'Jefe', l: 'Legendario', a: 'Arceus' };
  const HEAL = { comida: 'Comida', carta: 'Cartas', 'regeneración': 'Regeneración', cascabel: 'Cascabel Concha', habilidad: 'Habilidad',
                 manantial: 'Manantial', 'evolución': 'Evolución', suceso: 'Suceso', grupo: 'Compañeros', 'compañero': 'Compañeros',
                 drenaje: 'Drenaje', '(otros)': 'Otros', '?': 'Otros' };

  const monName = (d, nm) => (G.DEX_BY[d] && G.DEX_BY[d].name) || (nm && nm[d]) || '#' + d;
  const moveName = (id, fallback) => { const m = G.Moves && G.Moves.BY_ID && G.Moves.BY_ID[id]; return G.T((m && m.name) || fallback || id); };
  /** «l:150|Psicoataque» → «Mewtwo (Legendario) · Psicoataque». */
  function source(k, nm) {
    const [who, how = ''] = String(k || '?').split('|');
    const h = HOW[how] ? G.T(HOW[how]) : how ? G.T(how) : '';
    if (who === '?') return G.T('Desconocido') + (h ? ' · ' + h : '');
    const m = /^([hblax]):(.*)$/.exec(who);
    if (!m) return who + (h ? ' · ' + h : '');
    if (m[1] === 'x') return h || G.T('Terreno');
    const name = monName(+m[2], nm);
    return name + (KIND[m[1]] ? ' (' + G.T(KIND[m[1]]) + ')' : '') + (h ? ' · ' + h : '');
  }
  const healName = k => (HEAL[k] ? G.T(HEAL[k]) : moveName(k));
  const date = id => new Date(id).toLocaleString(G.I18n.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function init() {
    $('runs-close').onclick = close;
    $('runs-export').onclick = exportAll;
    $('runs-cloud').onclick = cloudAll;
    $('runs-ico').innerHTML = G.Icons.html('clock', 30);
    $('runs-body').addEventListener('click', e => {
      const more = e.target.closest('.runs-more');
      if (more) { page(); return; }
      const card = e.target.closest('.run-card');
      if (card && !e.target.closest('.run-detail')) toggle(card);
    });
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !isOpen()) return;
      e.stopPropagation(); e.preventDefault(); close();
    }, true);
  }

  function open() {
    $('scr-runs').classList.remove('hidden');
    $('runs-cloud').classList.toggle('hidden', !(G.RegCloud && G.RegCloud.isAdmin()));
    $('runs-body').innerHTML = `<p class="runs-empty">${esc(G.T('Cargando…'))}</p>`;
    G.Reg.list().then(l => { list = l; render(); }).catch(e => {
      console.warn('[Historial]', e);
      $('runs-body').innerHTML = `<p class="runs-empty">${esc(G.T('No se puede leer el historial en este navegador.'))}</p>`;
    });
  }
  function close() { $('scr-runs').classList.add('hidden'); $('runs-body').innerHTML = ''; list = []; }
  const isOpen = () => !$('scr-runs').classList.contains('hidden');

  function render() {
    const box = $('runs-body');
    $('runs-export').disabled = !list.length;
    if (!list.length) {
      box.innerHTML = `<p class="runs-empty">${esc(G.T('Aún no hay partidas guardadas. Juega una y saldrá aquí.'))}</p>`;
      return;
    }
    const done = list.filter(s => s.dur > 0), n = done.length || 1;
    const avg = k => done.reduce((a, s) => a + (s[k] || 0), 0) / n;
    const best = done.reduce((a, s) => Math.max(a, s.dur || 0), 0);
    box.innerHTML = `<div class="runs-stats">
        ${stat(num(list.length), 'Partidas')}${stat(mmss(avg('dur')), 'Duración media')}${stat(mmss(best), 'La más larga')}
        ${stat(num(avg('lvl')), 'Nivel medio')}${stat(num(avg('dealt') / Math.max(1, avg('dur'))), 'Daño por segundo medio')}
      </div>
      <p class="runs-note">${esc(G.I18n.f('Se guardan las últimas {x} partidas sólo en este aparato.', G.Reg.MAX))}</p>
      <div class="runs-list" id="runs-list"></div>`;
    shown = 0;
    page();
  }
  const stat = (v, label) => `<div class="runs-stat"><b>${v}</b><span>${esc(G.T(label))}</span></div>`;

  function page() {
    const box = $('runs-list');
    if (!box) return;
    const old = box.querySelector('.runs-more');
    if (old) old.remove();
    box.insertAdjacentHTML('beforeend', list.slice(shown, shown + PAGE).map(card).join(''));
    shown += PAGE;
    if (shown < list.length) box.insertAdjacentHTML('beforeend', `<button type="button" class="btn small ghost runs-more">${esc(G.T('Ver más'))}</button>`);
  }

  function card(s) {
    const mon = monName(s.form || s.dex), st = STATE[s.state] || s.state;
    const kd = s.killer && /^[hblax]:(\d+)/.exec(s.killer);
    const killer = s.killer ? `<p class="run-killer">${esc(G.T('Te derrotó'))}: ${esc(source(s.killer, kd ? { [kd[1]]: s.killerName } : null))}</p>` : '';
    return `<article class="run-card" data-id="${s.id}" tabindex="0">
      <div class="run-top">
        <span class="run-date">${esc(date(s.at || s.id))}</span>
        <span class="run-chip ${s.mode === 'grupo' ? 'grp' : ''}">${esc(G.T(s.mode === 'grupo' ? 'En grupo' : 'Solo'))}</span>
        <span class="run-chip st-${esc(s.state)}">${esc(G.T(st))}</span>
      </div>
      <h3>${esc(mon)}</h3>
      <div class="run-nums">
        <span><b>${mmss(s.dur)}</b> ${esc(G.T('Tiempo'))}</span>
        <span><b>${num(s.lvl)}</b> ${esc(G.T('Nivel'))}</span>
        <span><b>${num(s.kills)}</b> ${esc(G.T('Derrotados'))}</span>
        <span><b>${num(s.dealt)}</b> ${esc(G.T('Daño total'))}</span>
        ${s.coins != null ? `<span><b>${num(s.coins)}</b> ${esc(G.T('Monedas'))}</span>` : ''}
      </div>
      ${s.top ? `<p class="run-line">${esc(G.T('Ataque que más pegó'))}: <b>${esc(moveName(s.top.id, s.top.name))}</b> (${num(s.top.dealt)})</p>` : ''}
      ${killer}
    </article>`;
  }

  function toggle(el) {
    const open = el.querySelector('.run-detail');
    if (open) { open.remove(); el.classList.remove('open'); return; }
    el.classList.add('open');
    el.insertAdjacentHTML('beforeend', `<div class="run-detail"><p class="runs-empty">${esc(G.T('Cargando…'))}</p></div>`);
    G.Reg.get(+el.dataset.id).then(r => {
      const d = el.querySelector('.run-detail');
      if (d) d.innerHTML = r ? detail(r) : esc(G.T('No se puede leer el historial en este navegador.'));
    }).catch(() => {});
  }

  /** El detalle de una partida: tablas cortas. */
  function detail(r) {
    const dur = Math.max(1, r.dur || 1), nm = r.nm || {};
    const moves = Object.entries(r.moves || {}).filter(([, m]) => m.dealt != null).sort((a, b) => (b[1].dealt || 0) - (a[1].dealt || 0));
    const tot = moves.reduce((a, [, m]) => a + (m.dealt || 0), 0) || 1;
    const rows = moves.map(([id, m]) => {
      const secs = Math.max(5, dur - (m.got || 0));
      return `<tr><td>${esc(id === '(otros)' ? G.T('Otros') : moveName(id, m.name))}${m.evolved ? ' <span class="run-tag">' + esc(G.T('Evo')) + '</span>' : ''}${m.group ? ' <span class="run-tag">' + esc(G.T('Vínculo')) + '</span>' : ''}</td>
        <td>${num(m.lvl)}</td><td><b>${num(m.dealt)}</b></td><td>${Math.round((m.dealt || 0) / tot * 100)}%</td>
        <td>${num(m.boss)}</td><td>${num(m.horde)}</td><td>${num(m.hits)}</td><td>${num(m.kills)}</td><td>${num((m.dealt || 0) / secs)}</td></tr>`;
    }).join('');
    const top = (o, n, name) => Object.entries(o || {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v, Array.isArray(v) ? v[1] : null])
      .sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([k, v, c]) => `<li><span>${esc(name(k))}</span><b>${num(v)}${c != null ? ' <small>×' + num(c) + '</small>' : ''}</b></li>`).join('');
    const downs = (r.downs || []).map(d => `<li><span>${mmss(d.t)} · ${esc(source(d.by, nm))}</span><b>-${num(d.d)}</b></li>`).join('');
    const bosses = (r.bosses || []).map(b => `<li><span>${mmss(b.t)} · ${esc(source(b.k, nm))}</span><b>${b.kt != null ? esc(G.T('Vencido')) + ' ' + mmss(b.kt) : '—'}</b></li>`).join('');
    const picks = (r.cards || []).filter(c => c.p).length;
    // (Pantalla negra, 06-11-2026) Lo que ha apuntado G.U.gfxLog en esta partida.
    const gfx = (r.ev || []).filter(e => e[1] === 'gfx').slice(0, 12).map(e => `<li>${mmss(e[0])} · ${esc(String(e[2]))}</li>`).join('');
    return `<div class="run-sec"><h4>${esc(G.T('Ataques'))}</h4><div class="run-table-wrap"><table class="run-table">
        <thead><tr><th>${esc(G.T('Ataque'))}</th><th>${esc(G.T('Nv.'))}</th><th>${esc(G.T('Daño'))}</th><th>%</th><th>${esc(G.T('A jefes'))}</th>
        <th>${esc(G.T('A la horda'))}</th><th>${esc(G.T('Golpes'))}</th><th>${esc(G.T('Derrotados'))}</th><th>${esc(G.T('Daño/s'))}</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>
      <div class="run-cols">
        <div class="run-sec"><h4>${esc(G.T('Daño recibido'))} · ${num(r.taken)}</h4><ul class="run-ul">${top(r.takenBy, 8, k => source(k, nm)) || '<li>—</li>'}</ul></div>
        <div class="run-sec"><h4>${esc(G.T('Curación'))} · ${num(r.healed)} (${num(r.healed / dur * 10) / 10}/s)</h4><ul class="run-ul">${top(r.healBy, 8, healName) || '<li>—</li>'}</ul></div>
        <div class="run-sec"><h4>${esc(G.T('Caídas'))}</h4><ul class="run-ul">${downs || '<li>—</li>'}</ul></div>
        <div class="run-sec"><h4>${esc(G.T('Jefes'))}</h4><ul class="run-ul">${bosses || '<li>—</li>'}</ul></div>
        ${gfx ? `<div class="run-sec"><h4>${esc(G.T('Fallos de dibujo'))}</h4><ul class="run-ul">${gfx}</ul></div>` : ''}
      </div>
      <p class="run-line">${esc(G.I18n.f('Cartas elegidas: {x}', picks))} · ${esc(G.T('Versión'))} <span translate="no">${esc(r.ver)}</span></p>`;
  }

  function exportAll() {
    const b = $('runs-export');
    b.disabled = true;
    G.Reg.download().then(n => G.UI.toast(G.I18n.f('{x} partidas exportadas', n), 2600))
      .catch(e => { console.warn('[Historial]', e); G.UI.toast(G.T('No se ha podido exportar'), 2600); })
      .finally(() => { b.disabled = !list.length; });
  }

  /** (Dueño) Los resúmenes de todos los jugadores (net/stats.js), en otro archivo. */
  function cloudAll() {
    const b = $('runs-cloud');
    b.disabled = true;
    G.UI.toast(G.T('Descargando…'), 2000);
    G.RegCloud.download().then(n => G.UI.toast(G.I18n.f('{x} partidas exportadas', n), 2600))
      .catch(e => { console.warn('[Historial]', e); G.UI.toast(G.T('No se ha podido exportar'), 2600); })
      .finally(() => { b.disabled = false; });
  }

  return { init, open, close };
})();
