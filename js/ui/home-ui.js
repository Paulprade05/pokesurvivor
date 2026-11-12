/* ============ home-ui.js — la tienda de tu choza (aldea del menú) ============
 * Pedido del dueño (12-11-2026): personalizar tu choza con monedas. Se abre al entrar en «Tu choza» (o desde «Ir a…»):
 * un panel a la derecha y, a la izquierda, tu choza en la aldea (la cámara va a ella). Al tocar una pieza se prueba en la
 * choza; si no es tuya, se compra (con pregunta: son caras) y se pone. Datos y precios: data/home.js.
 */
G.HomeUI = (() => {
  const $ = id => document.getElementById(id);
  let open_ = false, cat = 'shape', sel = null, petMore = false;

  const fmt = n => Math.round(n).toLocaleString(G.I18n && G.I18n.lang === 'en' ? 'en-US' : 'es-ES');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function open() {
    const box = $('vil-home');
    if (!box || !G.Home) return;
    open_ = true;
    cat = cat || 'shape'; sel = null; petMore = false;
    box.classList.remove('hidden');
    G.Village.homePanel(true);
    render();
    addEventListener('keydown', onKey, true);
    setTimeout(() => { const b = box.querySelector('.vh-tab.on'); if (b) b.focus({ preventScroll: true }); }, 30);
  }
  function close(silent) {
    if (!open_) return;
    open_ = false;
    removeEventListener('keydown', onKey, true);
    const box = $('vil-home');
    if (box) { box.classList.add('hidden'); if (box.contains(document.activeElement)) document.activeElement.blur(); }
    if (!silent) { G.Audio.sfx('click'); G.Village.homePanel(false); }
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }

  /** Lo que se ve en la choza: lo puesto con la pieza elegida encima (para probarla). */
  function preview() {
    if (!sel || cat === 'pet') { G.Village.previewHome(null); return; }
    G.Village.previewHome({ [cat]: sel });
  }

  function render() {
    const box = $('vil-home');
    if (!box) return;
    const H = G.Home, s = G.DB.save, cur = H.current(), C = H.BY[cat];
    const tabs = H.CATS.map(c => `<button class="vh-tab${c.id === cat ? ' on' : ''}" type="button" data-cat="${c.id}">${esc(G.T(c.name))}</button>`).join('');
    let list = '', foot = '';
    if (cat === 'pet') {
      if (!H.owns('pet', 'bed')) list = card('pet', H.item('pet', 'bed'), cur);
      else list = petList(cur);
    } else list = C.items.map(it => card(cat, it, cur)).join('');
    const it = sel && H.item(cat, sel);
    if (it && cat !== 'pet') {
      const own = H.owns(cat, sel), worn = cur[cat] === sel;
      foot = `<p class="vh-desc">${esc(G.T(it.desc))}</p>` + (worn
        ? `<button class="btn block" type="button" disabled>${esc(G.T('La llevas puesta'))}</button>`
        : own ? `<button class="btn gold big block" type="button" data-act="wear">${esc(G.T('Ponértela'))}</button>`
          : `<button class="btn gold big block" type="button" data-act="buy"${(s.coins || 0) < it.price ? ' disabled' : ''}>${G.Icons.html('coin', 18)} ${esc(G.T('Comprar'))} · ${fmt(it.price)}</button>`);
    } else if (cat === 'pet' && !H.owns('pet', 'bed')) {
      const b = H.item('pet', 'bed');
      foot = `<p class="vh-desc">${esc(G.T(b.desc))}</p><button class="btn gold big block" type="button" data-act="buy-bed"${(s.coins || 0) < b.price ? ' disabled' : ''}>${G.Icons.html('coin', 18)} ${esc(G.T('Comprar'))} · ${fmt(b.price)}</button>`;
    } else foot = `<p class="vh-desc">${esc(G.T(cat === 'pet' ? 'Elige qué Pokémon descansa en tu puerta. Cambiarlo es gratis.' : 'Toca una pieza para probarla en tu choza.'))}</p>`;
    box.innerHTML = `<header class="vh-head"><span class="vh-title">${esc(G.T('Tu choza'))}</span>` +
      `<span class="vh-coins">${G.Icons.html('coin', 18)} ${fmt(s.coins || 0)}</span>` +
      `<button class="icon-btn" type="button" data-act="profile" aria-label="${esc(G.T('Tu perfil'))}" title="${esc(G.T('Tu perfil'))}">${G.Icons.html('crown', 22)}</button>` +
      `<button class="icon-btn" type="button" data-act="close" aria-label="${esc(G.T('Cerrar'))}" title="${esc(G.T('Cerrar'))}">${G.UI.svg('close')}</button></header>` +
      `<nav class="vh-tabs">${tabs}</nav><div class="vh-list${cat === 'pet' && H.owns('pet', 'bed') ? ' vh-pets' : ''}">${list}</div><div class="vh-foot">${foot}</div>`;
    box.querySelectorAll('[data-cat]').forEach(b => { b.onclick = () => { G.Audio.sfx('click'); cat = b.dataset.cat; sel = null; petMore = false; preview(); render(); }; });
    box.querySelectorAll('[data-item]').forEach(b => { b.onclick = () => { G.Audio.sfx('click'); sel = b.dataset.item; preview(); render(); }; });
    box.querySelectorAll('[data-pet]').forEach(b => { b.onclick = () => pickPet(+b.dataset.pet); });
    box.querySelectorAll('canvas[data-pc]').forEach(cv => cv.replaceWith(G.UI.spriteCanvas(+cv.dataset.pc, 64, 54, { scale: 1, shadow: true })));
    const act = (a, fn) => { const b = box.querySelector(`[data-act="${a}"]`); if (b) b.onclick = fn; };
    act('close', () => close());
    act('profile', () => { close(); G.GoalsUI.open('profile'); });
    act('wear', () => { G.Home.wear(cat, sel); G.Audio.sfx('click'); sel = null; preview(); render(); });
    act('buy', () => buy(cat, sel));
    act('buy-bed', () => buy('pet', 'bed'));
    act('more', () => { petMore = true; render(); });
  }

  function card(c, it, cur) {
    const H = G.Home, own = H.owns(c, it.id), worn = c === 'pet' ? false : cur[c] === it.id;
    const st = worn ? `<span class="vh-st worn">${esc(G.T('Puesta'))}</span>` : own ? `<span class="vh-st own">${esc(G.T('Tuya'))}</span>`
      : `<span class="vh-st">${G.Icons.html('coin', 14)} ${fmt(it.price)}</span>`;
    const sw = it.look && it.look !== 'rainbow' ? `<i class="vh-sw" style="background:${it.look}"></i>` : it.look === 'rainbow' ? '<i class="vh-sw" style="background:conic-gradient(#ff5a5a,#ffd04a,#7cff7a,#5ff0ff,#b07aff,#ff5a5a)"></i>' : '';
    return `<button class="vh-item${sel === it.id ? ' on' : ''}" type="button" data-item="${it.id}"><b>${sw}${esc(G.T(it.name))}</b><small>${esc(G.T(it.desc))}</small>${st}</button>`;
  }

  /** Tus Pokémon para la puerta: el compañero, los favoritos y los más usados primero (los demás, con «Ver más»). */
  function petList(cur) {
    const s = G.DB.save, own = Object.keys(s.owned || {}).map(Number).filter(d => G.DEX_BY[d]);
    const score = d => (d === s.partner ? 1e9 : 0) + (G.DB.isFav && G.DB.isFav(d) ? 1e6 : 0) + (+((s.pused || {})[d]) || 0);
    own.sort((a, b) => score(b) - score(a) || a - b);
    const N = petMore ? own.length : 23;
    const cells = [`<button class="vh-item vh-pet${!cur.pet ? ' on' : ''}" type="button" data-pet="0"><b>${esc(G.T('Ninguno'))}</b></button>`]
      .concat(own.slice(0, N).map(d => `<button class="vh-item vh-pet${cur.pet === d ? ' on' : ''}" type="button" data-pet="${d}"><canvas data-pc="${d}"></canvas><b>${esc(G.DEX_BY[d].name)}</b></button>`));
    if (own.length > N) cells.push(`<button class="vh-item vh-pet" type="button" data-act="more"><b>${esc(G.T('Ver más'))}</b><small>+${own.length - N}</small></button>`);
    return cells.join('');
  }
  function pickPet(dex) {
    G.Audio.sfx('click');
    if (G.Home.wear('pet', dex)) G.Village.syncHome();
    render();
  }

  function buy(c, id) {
    const it = G.Home.item(c, id);
    if (!it) return;
    const name = G.T(it.name);
    G.UI.ask(G.T('¿Comprar «{0}» por {1} Pokémonedas?').replace('{0}', name).replace('{1}', fmt(it.price)), { yes: 'Comprar' }).then(ok => {
      if (!ok || !open_) return;
      const r = G.Home.buy(c, id);
      if (!r.ok) { if (r.error) G.UI.toast(G.T(r.error)); return; }
      G.Audio.sfx('levelup');
      if (c !== 'pet') G.Home.wear(c, id);
      G.UI.refreshCoins();
      G.UI.toast(G.T('¡Ya es tuya!'));
      sel = null;
      G.Village.previewHome(null);
      render();
    });
  }

  return { open, close, get isOpen() { return open_; } };
})();
