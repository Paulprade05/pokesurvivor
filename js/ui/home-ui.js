/* ============ home-ui.js — la tienda de tu choza (aldea del menú) ============
 * Pedido del dueño (12-11-2026): personalizar tu choza con monedas. Fuera (mode 'out'): un panel a la derecha y, a la
 * izquierda, tu choza en la aldea (la cámara va a ella). Al tocar una pieza se prueba en la choza; si no es tuya, se compra
 * (con pregunta: son caras) y se pone. Datos y precios: data/home.js.
 * (17-11-2026) Dentro (mode 'in', con «Decorar» en world/home-in.js): muebles (se ponen, se mueven, se voltean y se
 * quitan tocando la habitación), suelo, pared e invitados (tus Pokémon que viven en tu choza). «Fachada» sale y abre lo de
 * fuera.
 */
G.HomeUI = (() => {
  const $ = id => document.getElementById(id);
  let open_ = false, mode = 'out', cat = 'shape', icat = 'furn', sel = null, petMore = false, guestMore = false;

  const fmt = n => Math.round(n).toLocaleString(G.I18n && G.I18n.lang === 'en' ? 'en-US' : 'es-ES');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Abre el panel. m: 'in' (dentro de la choza) o 'out' (fuera, como siempre). */
  function open(m) {
    const box = $('vil-home');
    if (!box || !G.Home) return;
    mode = m === 'in' && G.HomeIn && G.HomeIn.on ? 'in' : 'out';
    open_ = true;
    cat = cat || 'shape'; icat = icat || 'furn'; sel = null; petMore = false; guestMore = false;
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
    if (G.HomeIn) { G.HomeIn.cancelPlace(); G.HomeIn.selected = -1; G.HomeIn.preview = null; }
    if (!silent) { G.Audio.sfx('click'); G.Village.homePanel(false); }
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    // Colocando un mueble: Esc lo cancela (el panel sigue abierto).
    if (mode === 'in' && G.HomeIn && G.HomeIn.placing) { G.HomeIn.cancelPlace(); render(); return; }
    close();
  }

  /** Lo que se ve en la choza: lo puesto con la pieza elegida encima (para probarla). */
  function preview() {
    if (!sel || cat === 'pet') { G.Village.previewHome(null); return; }
    G.Village.previewHome({ [cat]: sel });
  }

  function render() {
    const box = $('vil-home');
    if (!box) return;
    if (mode === 'in') { renderIn(box); return; }
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
    box.innerHTML = head('Tu choza') + `<nav class="vh-tabs">${tabs}</nav><div class="vh-list${cat === 'pet' && H.owns('pet', 'bed') ? ' vh-pets' : ''}">${list}</div><div class="vh-foot">${foot}</div>`;
    box.querySelectorAll('[data-cat]').forEach(b => { b.onclick = () => { G.Audio.sfx('click'); cat = b.dataset.cat; sel = null; petMore = false; preview(); render(); }; });
    box.querySelectorAll('[data-item]').forEach(b => { b.onclick = () => { G.Audio.sfx('click'); sel = b.dataset.item; preview(); render(); }; });
    box.querySelectorAll('[data-pet]').forEach(b => { b.onclick = () => pickPet(+b.dataset.pet); });
    box.querySelectorAll('canvas[data-pc]').forEach(cv => cv.replaceWith(G.UI.spriteCanvas(+cv.dataset.pc, 64, 54, { scale: 1, shadow: true })));
    headActs(box);
    const act = (a, fn) => { const b = box.querySelector(`[data-act="${a}"]`); if (b) b.onclick = fn; };
    act('wear', () => { G.Home.wear(cat, sel); G.Audio.sfx('click'); sel = null; preview(); render(); });
    act('buy', () => buy(cat, sel));
    act('buy-bed', () => buy('pet', 'bed'));
    act('more', () => { petMore = true; render(); });
  }
  function head(title) {
    const s = G.DB.save;
    return `<header class="vh-head"><span class="vh-title">${esc(G.T(title))}</span>` +
      `<span class="vh-coins">${G.Icons.html('coin', 18)} ${fmt(s.coins || 0)}</span>` +
      `<button class="icon-btn" type="button" data-act="profile" aria-label="${esc(G.T('Tu perfil'))}" title="${esc(G.T('Tu perfil'))}">${G.Icons.html('crown', 22)}</button>` +
      `<button class="icon-btn" type="button" data-act="close" aria-label="${esc(G.T('Cerrar'))}" title="${esc(G.T('Cerrar'))}">${G.UI.svg('close')}</button></header>`;
  }
  function headActs(box) {
    const act = (a, fn) => { const b = box.querySelector(`[data-act="${a}"]`); if (b) b.onclick = fn; };
    act('close', () => close());
    act('profile', () => { close(); G.GoalsUI.open('profile'); });
  }

  function card(c, it, cur) {
    const H = G.Home, own = H.owns(c, it.id), worn = c === 'pet' ? false : cur[c] === it.id;
    const st = worn ? `<span class="vh-st worn">${esc(G.T('Puesta'))}</span>` : own ? `<span class="vh-st own">${esc(G.T('Tuya'))}</span>`
      : `<span class="vh-st">${G.Icons.html('coin', 14)} ${fmt(it.price)}</span>`;
    const sw = it.look && it.look !== 'rainbow' ? `<i class="vh-sw" style="background:${it.look}"></i>` : it.look === 'rainbow' ? '<i class="vh-sw" style="background:conic-gradient(#ff5a5a,#ffd04a,#7cff7a,#5ff0ff,#b07aff,#ff5a5a)"></i>' : '';
    return `<button class="vh-item${sel === it.id ? ' on' : ''}" type="button" data-item="${it.id}"><b>${sw}${esc(G.T(it.name))}</b><small>${esc(G.T(it.desc))}</small>${st}</button>`;
  }

  /** Tus Pokémon, el compañero, los favoritos y los más usados primero (los demás, con «Ver más»). */
  function ownSorted() {
    const s = G.DB.save, own = Object.keys(s.owned || {}).map(Number).filter(d => G.DEX_BY[d]);
    const score = d => (d === s.partner ? 1e9 : 0) + (G.DB.isFav && G.DB.isFav(d) ? 1e6 : 0) + (+((s.pused || {})[d]) || 0);
    return own.sort((a, b) => score(b) - score(a) || a - b);
  }
  function petList(cur) {
    const own = ownSorted();
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

  function buy(c, id, then) {
    const it = G.Home.item(c, id);
    if (!it) return;
    const name = G.T(it.name);
    G.UI.ask(G.T('¿Comprar «{0}» por {1} Pokémonedas?').replace('{0}', name).replace('{1}', fmt(it.price)), { yes: 'Comprar' }).then(ok => {
      if (!ok || !open_) return;
      const r = G.Home.buy(c, id);
      if (!r.ok) { if (r.error) G.UI.toast(G.T(r.error)); return; }
      G.Audio.sfx('levelup');
      if (G.Home.BY[c] && c !== 'pet') G.Home.wear(c, id);
      G.UI.refreshCoins();
      G.UI.toast(G.T('¡Ya es tuya!'));
      sel = null;
      if (mode === 'out') G.Village.previewHome(null);
      if (then) then(); else render();
    });
  }

  // ---------------- dentro de la choza ----------------
  const IN_TABS = [['furn', 'Muebles'], ['floor', 'Suelo'], ['wallp', 'Pared'], ['guests', 'Invitados'], ['outside', 'Fachada']];
  /** Un dibujo del atlas del interior en un lienzo pequeño (a escala entera, centrado). */
  function artCanvas(rect, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h; cv.className = 'vh-art';
    const img = G.HomeIn.image, g = cv.getContext('2d');
    const paint = () => {
      if (!g) return;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, w, h);
      const k = Math.max(1, Math.floor(Math.min(w / rect[2], h / rect[3])));
      g.drawImage(img, rect[0], rect[1], rect[2], rect[3], Math.round((w - rect[2] * k) / 2), Math.round((h - rect[3] * k) / 2), rect[2] * k, rect[3] * k);
    };
    if (img.complete && img.naturalWidth) paint(); else img.addEventListener('load', paint, { once: true });
    return cv;
  }
  const SURF = { floor: { wood: 0, moss: 24, weave: 48, stone: 72, crystal: 96 }, wallp: { wood: 0, roots: 24, leaf: 48, stone: 72, metal: 96 } };

  function renderIn(box) {
    const H = G.Home, s = G.DB.save, room = H.room();
    const tabs = IN_TABS.map(([id, name]) => `<button class="vh-tab${id === icat ? ' on' : ''}" type="button" data-icat="${id}">${esc(G.T(name))}</button>`).join('');
    let list = '', foot = '', cls = '';
    const placing = G.HomeIn.placing, chosen = G.HomeIn.selected;
    if (icat === 'furn') {
      list = H.IN_BY.furn.items.map(it => {
        const own = H.owns('furn', it.id), n = H.placed(it.id);
        const st = own ? `<span class="vh-st own">${esc(G.T('Tuyo'))} <span class="vh-count">· ${n}/${H.MAX_COPIES}</span></span>` : `<span class="vh-st">${G.Icons.html('coin', 14)} ${fmt(it.price)}</span>`;
        return `<button class="vh-item vh-f${sel === it.id ? ' on' : ''}" type="button" data-fid="${it.id}"><canvas data-art="${it.id}"></canvas><b>${esc(G.T(it.name))}</b>${st}</button>`;
      }).join('');
      if (placing) {
        const f = H.furn(placing.id), touch = G.Touch && G.Touch.active;
        // (mando, 21-11-2026) Con mando: la cruceta lo mueve y sus botones (gamepad.js) lo dejan, voltean o cancelan.
        const P = G.Pad;
        foot = `<p class="vh-desc">${esc(G.T(f.name))} · ${P.active ? G.I18n.f('Cruceta: moverlo · {x} dejarlo · {x} voltearlo · {x} cancelar', P.glyph('ok'), P.glyph('reroll'), P.glyph('back'))
          : esc(G.T(touch ? 'Toca dónde ponerlo y toca otra vez para dejarlo.' : 'Haz clic donde ponerlo (o flechas y E).'))}</p>` +
          `<div class="vh-btns"><button class="btn" type="button" data-act="flip">${esc(G.T('Voltear'))}</button>` +
          (touch ? `<button class="btn gold" type="button" data-act="drop"${placing.ok ? '' : ' disabled'}>${esc(G.T('Dejarlo aquí'))}</button>` : '') +
          `<button class="btn" type="button" data-act="cancel">${esc(G.T('Cancelar'))}</button></div>`;
      } else if (chosen >= 0 && room.items[chosen]) {
        const f = H.furn(room.items[chosen].id);
        foot = `<p class="vh-desc"><b>${esc(G.T(f.name))}</b> · ${esc(G.T(f.desc))}</p><div class="vh-btns">` +
          `<button class="btn" type="button" data-act="move">${esc(G.T('Mover'))}</button><button class="btn" type="button" data-act="iflip">${esc(G.T('Voltear'))}</button>` +
          `<button class="btn" type="button" data-act="remove">${esc(G.T('Quitar'))}</button></div>`;
      } else if (sel && H.furn(sel) && !H.owns('furn', sel)) {
        const it = H.furn(sel);
        foot = `<p class="vh-desc">${esc(G.T(it.desc))}</p><button class="btn gold big block" type="button" data-act="buyf"${(s.coins || 0) < it.price ? ' disabled' : ''}>${G.Icons.html('coin', 18)} ${esc(G.T('Comprar'))} · ${fmt(it.price)}</button>`;
      } else foot = `<p class="vh-desc">${G.Pad.active ? G.I18n.f('Elige un mueble para ponerlo, o pulsa {x} para elegir uno de la habitación y moverlo o quitarlo.', G.Pad.glyph('discard'))
        : esc(G.T('Elige un mueble para ponerlo, o toca uno de la habitación para moverlo o quitarlo.'))} (${room.items.length}/${H.MAX_ITEMS})</p>`;
    } else if (icat === 'floor' || icat === 'wallp') {
      const key = icat === 'floor' ? 'floor' : 'wall';
      list = H.IN_BY[icat].items.map(it => {
        const own = H.owns(icat, it.id), worn = room[key] === it.id;
        const st = worn ? `<span class="vh-st worn">${esc(G.T('Puesto'))}</span>` : own ? `<span class="vh-st own">${esc(G.T('Tuyo'))}</span>` : `<span class="vh-st">${G.Icons.html('coin', 14)} ${fmt(it.price)}</span>`;
        return `<button class="vh-item${sel === it.id ? ' on' : ''}" type="button" data-sid="${it.id}"><b><canvas class="vh-sw sq" data-sw="${it.id}"></canvas> ${esc(G.T(it.name))}</b><small>${esc(G.T(it.desc))}</small>${st}</button>`;
      }).join('');
      const it = sel && H.item(icat, sel);
      if (it && !H.owns(icat, sel)) foot = `<p class="vh-desc">${esc(G.T(it.desc))}</p><button class="btn gold big block" type="button" data-act="buys"${(s.coins || 0) < it.price ? ' disabled' : ''}>${G.Icons.html('coin', 18)} ${esc(G.T('Comprar'))} · ${fmt(it.price)}</button>`;
      else foot = `<p class="vh-desc">${esc(G.T('Toca uno para probarlo en tu choza.'))}</p>`;
    } else if (icat === 'guests') {
      cls = ' vh-pets';
      const own = ownSorted().filter(d => d !== s.partner), N = guestMore ? own.length : 23;
      list = own.slice(0, N).map(d => `<button class="vh-item vh-pet${room.guests.includes(d) ? ' on' : ''}" type="button" data-guest="${d}"><canvas data-pc="${d}"></canvas><b>${esc(G.DEX_BY[d].name)}</b></button>`).join('');
      if (own.length > N) list += `<button class="vh-item vh-pet" type="button" data-act="gmore"><b>${esc(G.T('Ver más'))}</b><small>+${own.length - N}</small></button>`;
      if (!own.length) list = `<p class="vh-desc">${esc(G.T('Consigue más Pokémon en el Gacha para invitarlos.'))}</p>`;
      foot = `<p class="vh-desc">${esc(G.T('Toca un Pokémon para que viva en tu choza (o para que se vaya). Pasean dentro y por el barrio.'))} (${room.guests.length}/${H.MAX_GUESTS})</p>`;
    }
    box.innerHTML = head('Dentro de tu choza') + `<nav class="vh-tabs">${tabs}</nav><div class="vh-list${cls}">${list}</div><div class="vh-foot">${foot}</div>`;
    headActs(box);
    box.querySelectorAll('[data-icat]').forEach(b => { b.onclick = () => {
      G.Audio.sfx('click');
      if (b.dataset.icat === 'outside') { close(true); G.Village.exitHome(); open('out'); return; }
      icat = b.dataset.icat; sel = null; G.HomeIn.cancelPlace(); G.HomeIn.selected = -1; G.HomeIn.preview = null; render();
    }; });
    box.querySelectorAll('canvas[data-art]').forEach(cv => cv.replaceWith(artCanvas(G.HomeIn.ART[cv.dataset.art], 60, 45)));
    box.querySelectorAll('canvas[data-sw]').forEach(cv => {
      const x = SURF[icat][cv.dataset.sw], r = icat === 'floor' ? [x, 0, 24, 24] : [x, 30, 24, 24];
      const c = artCanvas(r, 24, 24); c.className = 'vh-sw sq'; cv.replaceWith(c);
    });
    box.querySelectorAll('canvas[data-pc]').forEach(cv => cv.replaceWith(G.UI.spriteCanvas(+cv.dataset.pc, 64, 54, { scale: 1, shadow: true })));
    box.querySelectorAll('[data-fid]').forEach(b => { b.onclick = () => pickFurn(b.dataset.fid); });
    box.querySelectorAll('[data-sid]').forEach(b => { b.onclick = () => pickSurface(b.dataset.sid); });
    box.querySelectorAll('[data-guest]').forEach(b => { b.onclick = () => toggleGuest(+b.dataset.guest); });
    const act = (a, fn) => { const b = box.querySelector(`[data-act="${a}"]`); if (b) b.onclick = () => { G.Audio.sfx('click'); fn(); }; };
    act('cancel', () => { G.HomeIn.cancelPlace(); render(); });
    act('drop', () => placed(G.HomeIn.commitPlace()));
    act('flip', () => { G.HomeIn.flipGhost(); });
    act('move', () => { const i = G.HomeIn.selected, o = G.Home.room().items[i]; if (o) { G.HomeIn.startPlace(o.id, i); render(); } });
    act('iflip', () => { G.Home.flip(G.HomeIn.selected); render(); });
    act('remove', () => { G.Home.remove(G.HomeIn.selected); G.HomeIn.selected = -1; render(); });
    act('buyf', () => buy('furn', sel, () => { const id = sel; pickFurn(id); }));
    act('buys', () => { const id = sel; buy(icat, id, () => { G.Home.setSurface(icat, id); G.HomeIn.preview = null; render(); }); });
    act('gmore', () => { guestMore = true; render(); });
  }
  function pickFurn(id) {
    const H = G.Home;
    G.Audio.sfx('click');
    G.HomeIn.selected = -1;
    if (!H.owns('furn', id)) { sel = id; G.HomeIn.cancelPlace(); render(); return; }
    if (H.placed(id) >= H.MAX_COPIES) { G.UI.toast(G.T('Ya tienes puestos todos los que caben de este.')); return; }
    if (H.room().items.length >= H.MAX_ITEMS) { G.UI.toast(G.T('No cabe nada más.')); return; }
    sel = id;
    G.HomeIn.startPlace(id);
    render();
  }
  function pickSurface(id) {
    G.Audio.sfx('click');
    sel = id;
    const key = icat === 'floor' ? 'floor' : 'wall';
    if (G.Home.owns(icat, id)) { G.Home.setSurface(icat, id); G.HomeIn.preview = null; }
    else G.HomeIn.preview = { [key]: id };
    render();
  }
  function toggleGuest(d) {
    G.Audio.sfx('click');
    const H = G.Home;
    if (H.room().guests.includes(d)) H.uninvite(d);
    else { const r = H.invite(d); if (!r.ok) { if (r.error) G.UI.toast(G.T(r.error)); return; } G.UI.toast(G.T('¡{0} vive ahora en tu choza!').replace('{0}', G.DEX_BY[d].name)); }
    G.HomeIn.syncGuests();
    render();
  }
  /** home-in.js: se ha dejado (o no) un mueble. */
  function placed(r) {
    if (!r) return;
    if (!r.ok) { if (r.error) G.UI.toast(G.T(r.error)); render(); return; }
    sel = null;
    render();
  }
  /** home-in.js: se ha tocado un mueble de la habitación (o el suelo: -1). */
  function selected(i) {
    if (!open_ || mode !== 'in') return;
    if (icat !== 'furn' && i >= 0) icat = 'furn';
    sel = null;
    render();
  }
  /** home-in.js: el fantasma ha cambiado (para el botón «Dejarlo aquí»). */
  function ghostMoved() { if (open_ && mode === 'in') { const b = $('vil-home').querySelector('[data-act="drop"]'); if (b) b.disabled = !(G.HomeIn.placing || {}).ok; } }

  return { open, close, placed, selected, ghostMoved, get isOpen() { return open_; }, get mode() { return mode; } };
})();
