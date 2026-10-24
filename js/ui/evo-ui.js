/* ============ evo-ui.js — lo que se ve de la evolución en partida (24-10-2026) ============
 * La lógica (qué fase toca y cuándo) está en systems/mons.js (G.Evo); aquí:
 *   - el aviso al evolucionar: un cartel pequeño arriba, breve (tú y, en grupo, los demás)
 *   - la carta para elegir rama (Eevee, Tyrogue, Wurmple...), al estilo de las de nivel
 *   - la piedra u objeto que aparece en el suelo cerca de ti (se dibuja en el mundo)
 *   - la línea de la ficha de la colección: cómo empieza y cómo evoluciona en partida
 * Los textos van en español (el juego los traduce); los nombres de los objetos
 * salen de G.EVO_ITEM en el idioma del juego, sin traducir (translate="no").
 */
G.EvoUI = (() => {
  const $ = id => document.getElementById(id);
  const NAME = dex => (G.DEX_BY[dex] || {}).name || '?';
  const T = s => (G.T ? G.T(s) : s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const itemName = it => (G.EVO_ITEM && G.EVO_ITEM[it] ? G.Mons.name(G.EVO_ITEM[it]) : String(it || ''));
  const moveName = id => (G.Moves.BY_ID[id] ? G.Moves.BY_ID[id].name : '');
  const lvText = n => 'Nv. ' + n;

  // ---------------- cómo evoluciona (texto) ----------------

  /**
   * Lo que pide la regla r, en trozos de HTML. Cada texto en su elemento (el juego
   * traduce frases enteras); los nombres de objeto, tal cual (ya en su idioma).
   */
  function howHtml(r) {
    if (!r) return '';
    const L = G.Evo.levelOf(r), lv = `<span>${lvText(L)}</span>`;
    const it = r.it ? `<span class="evo-it" translate="no">${esc(itemName(r.it))}</span>` : '';
    const dot = '<i class="evo-dot">·</i>';
    if (r.q) return lv;
    switch (r.k) {
      case 'lv': return r.wx ? `<span>${G.I18n.f('Nv. {x} con lluvia', L)}</span>` : lv;
      case 'item': return it + dot + lv;
      case 'trade': return (it ? `<span>${T('Intercambio con')}</span> ${it}` : `<span>${T('Intercambio')}</span>`) + dot + lv;
      case 'friend': return `<span>${T('Amistad')}</span>${dot}${lv}`;
      case 'move':
        if (r.mv) return `<span>${G.I18n.f('Al aprender {x}', G.T(moveName(r.mv), 'move'))}</span>${dot}<span>${G.I18n.f('o Nv. {x}', L)}</span>`;
        if (r.mt) return `<span>${G.I18n.f('Al aprender un ataque de tipo {x}', T(G.U.TYPE_NAME[r.mt]))}</span>${dot}<span>${G.I18n.f('o Nv. {x}', L)}</span>`;
        return lv;
      case 'coins': return `<span>${G.I18n.f('Recoge {x} monedas', r.n)}</span>`;
      case 'steps': return `<span>${G.I18n.f('Camina {x} pasos', r.n)}</span>`;
      case 'bosses': return `<span>${r.n === 1 ? T('Derrota a un jefe') : G.I18n.f('Derrota a {x} jefes', r.n)}</span>`;
      case 'damage': return `<span>${G.I18n.f('Recibe {x} de daño', r.n)}</span>`;
      case 'kills': return `<span>${G.I18n.f('Derrota a {x} enemigos', r.n)}</span>`;
      default: return lv;
    }
  }

  // ---------------- ficha de la colección ----------------

  /** «En partida: Charmander → Charmeleon (Nv. 9) → Charizard (Nv. 18)», para showDetail. */
  function dexLine(dex) {
    if (!G.Evo || !G.DEX_BY[dex]) return '';
    const line = G.Evo.line(dex);
    const nm = d => `<b class="${d === dex ? 'gold' : ''}">${esc(NAME(d))}</b>`;
    const arrow = '<i class="evo-arr" aria-hidden="true">→</i>';
    let body;
    if (line.length === 1) body = `<span>${T('No evoluciona')}</span>`;
    else {
      body = line.map((s, i) => {
        if (s.branch) {
          const lv = Math.min(...s.branch.map(d => G.Evo.levelOf(G.Evo.rule(d))));
          return `${arrow}<span class="evo-step"><span class="evo-how"><span>${T('A elegir')}</span><i class="evo-dot">·</i><span>${lvText(lv)}</span></span>`
            + `<span class="evo-opts">${s.branch.map(nm).join('')}</span></span>`;
        }
        return (i ? arrow : '') + `<span class="evo-step">${nm(s.dex)}${s.r ? `<span class="evo-how">${howHtml(s.r)}</span>` : ''}</span>`;
      }).join('');
    }
    return `<p class="dx-evo"><span class="dx-lbl">${T('En partida')}</span><span class="evo-line">${body}</span></p>`;
  }

  // ---------------- aviso al evolucionar ----------------

  let toastEl = null, toastT = 0, pending = null;

  /**
   * Has evolucionado de `from` a `to` (pl ya es la nueva fase). El destello va en
   * el sprite (player.js); el cartel sale al terminar, con la siguiente evolución.
   * via 'mate': por intercambio con un compañero.
   */
  function evolved(pl, from, to, via) {
    G.Audio.sfx('levelup');
    G.FX.ring(pl.x, pl.y - pl.bodyH * 0.4, 6, 70, '#ffffff', 0.55, 4);
    pending = { pl, from, to, via, t: G.Player.EVO_TIME };
  }

  /** Un compañero ha evolucionado (lo dice su envío): destello en él y un aviso. */
  function mateEvolved(p) {
    G.FX.ring(p.x, p.y - p.bodyH * 0.4, 6, 70, '#ffffff', 0.55, 4);
    pending = pending || { pl: p, mate: true, to: p.form, t: G.Player.EVO_TIME };
  }

  /** Cada fotograma de partida (game.js): el cartel cuando acaba el destello. */
  function tick(dt) {
    if (toastT > 0 && (toastT -= dt) <= 0 && toastEl) toastEl.classList.remove('on');
    if (!pending || (pending.t -= dt) > 0) return;
    const p = pending; pending = null;
    const pl = p.pl;
    if (!pl || pl.dead) return;
    G.Audio.sfx('legend');
    G.FX.ring(pl.x, pl.y, 8, 120, '#ffd23f', 0.7, 6);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#fff6c0', 26, 200);
    if (!p.mate) { G.Camera.kick(0.35); G.Game.flash('#ffffff', 0.22); }
    show(p);
  }

  function show(p) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'evo-toast';
      toastEl.className = 'evo-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    const mon = G.DEX_BY[p.to] || {};
    let sub = '';
    if (p.mate) sub = `<span class="evo-t-sub" translate="no">${esc(p.pl.tag || '')}</span>`;
    else {
      const n = G.Evo.nextOf(p.pl);
      if (n && n.many) sub = `<span class="evo-t-sub"><span>${T('Siguiente: a elegir')}</span><i class="evo-dot">·</i><span>${lvText(n.lv)}</span></span>`;
      else if (n) sub = `<span class="evo-t-sub"><span>${G.I18n.f('Siguiente: {x}', T(NAME(n.dex)))}</span><i class="evo-dot">·</i>${howHtml(n.r)}</span>`;
      else if (p.via === 'mate') sub = `<span class="evo-t-sub"><span>${T('¡Intercambio con un compañero!')}</span></span>`;
    }
    toastEl.innerHTML = `<span class="evo-t-art"></span><span class="evo-t-txt">`
      + `<span class="evo-t-k">${T('¡Evolución!')}</span>`
      + `<span class="evo-t-nm">${p.from ? `<span>${esc(NAME(p.from))}</span><i class="evo-arr" aria-hidden="true">→</i>` : ''}<b>${esc(mon.name || '')}</b></span>`
      + `${sub}</span>`;
    toastEl.style.setProperty('--evo-c', G.U.TYPE_COLOR[(mon.types || ['normal'])[0]]);
    const art = toastEl.querySelector('.evo-t-art');
    art.appendChild(G.UI.spriteCanvas(p.to, 48, 48, { scale: 2, shiny: !!p.pl.shiny, shadow: false }));
    toastEl.classList.remove('on');
    void toastEl.offsetWidth;                 // la animación empieza otra vez
    toastEl.classList.add('on');
    toastT = 2.8;
  }

  // ---------------- carta de elección (ramas) ----------------

  let choiceCb = null, choiceOpts = null, openedAt = 0;

  /** Vida, ataque de su lado fuerte y velocidad de la fase (con la naturaleza del que elegiste). */
  function statsHtml(m) {
    if (!m) return '';
    const sp = G.Stats && G.Stats.sideOf(m) === 'special';
    const st = (k, v) => `<span class="evo-st"><span>${T(k)}</span> <b>${v}</b></span>`;
    return st('Vida', Math.round(m.hp)) + st(sp ? 'At. Esp.' : 'Ataque', '×' + (sp ? m.sa : m.pa).toFixed(2)) + st('Velocidad', Math.round(m.spd));
  }

  function screen() {
    let el = $('scr-evo');
    if (el) return el;
    el = document.createElement('section');
    el.id = 'scr-evo';
    el.className = 'scr dim hidden';
    el.innerHTML = `<div class="box pick-box evo-box">
      <header class="pick-head">
        <div class="pick-title"><span class="ico-tile pick-ico">${G.Icons.html('up', 30)}</span><h2 id="evo-title"></h2></div>
        <p class="sub"><span>${T('Elige su evolución')}</span><span class="kbd-hint"> · <kbd>1</kbd> <kbd>2</kbd>…</span></p>
      </header>
      <div id="evo-cards" class="cards pick-cards evo-cards"></div>
    </div>`;
    document.body.appendChild(el);
    return el;
  }

  /**
   * Las ramas a las que puede evolucionar (opts: dex). cb(dex) al elegir.
   * Cada carta: el sprite, sus tipos, cómo se llega y, si sigue, en qué acaba.
   */
  function showChoice(pl, opts, cb) {
    const el = screen();
    choiceCb = cb; choiceOpts = opts.slice();
    $('evo-title').textContent = G.I18n.f('¡{x} va a evolucionar!', T(NAME(pl.form)));
    const box = $('evo-cards');
    box.innerHTML = '';
    box.classList.toggle('many', opts.length > 3);
    box.classList.add('guard');
    opts.forEach((dex, i) => {
      const mon = G.DEX_BY[dex], col = G.U.TYPE_COLOR[mon.types[0]];
      // Si sigue evolucionando por una sola línea: en qué acaba.
      const tail = []; let d = dex;
      for (let n = 0; n < 3; n++) { const k = G.Evo.kids(d); if (k.length !== 1) break; d = k[0]; tail.push(d); }
      const c = document.createElement('div');
      c.className = 'card pick-card evo-card';
      c.style.setProperty('--i', i);
      c.style.setProperty('--pc', col);
      c.dataset.sfx = 'none';
      c.innerHTML = `<span class="key">${i + 1}</span>
        <span class="pc-art"><span class="ico-tile pc-ico tint" style="--tile-c:${col}"></span></span>
        <span class="pc-txt"><span class="nm">${esc(mon.name)}</span><span class="pc-chips">${G.UI.typeChips(mon.types)}</span>
        <span class="ds evo-how">${howHtml(G.Evo.rule(dex))}</span>
        <span class="evo-stats">${statsHtml(G.Mons.formFor(pl.dex, dex))}</span>
        ${tail.length ? `<span class="evo-hint">${tail.map(x => `<i class="evo-arr" aria-hidden="true">→</i><span>${esc(NAME(x))}</span>`).join('')}</span>` : ''}</span>`;
      c.querySelector('.pc-ico').appendChild(G.UI.spriteCanvas(dex, 80, 80, { scale: 2, lively: true, shiny: !!pl.shinyWant && G.Sprites.hasShiny(dex) }));
      c.onclick = () => pick(i);
      box.appendChild(c);
    });
    open(el);
  }

  // (No está en la lista de G.UI.show: se abre y se cierra aquí.)
  function open(el) {
    el.classList.remove('hidden');
    openedAt = performance.now();
    // Medio segundo sin poder elegir (como las de nivel): un toque para atacar no elige sin querer.
    setTimeout(() => { const b = $('evo-cards'); if (b) b.classList.remove('guard'); }, 450);
  }

  function pick(i) {
    if (!choiceOpts || !choiceOpts[i] || performance.now() - openedAt < 450) return;
    const dex = choiceOpts[i], cb = choiceCb;
    choiceOpts = null; choiceCb = null;
    G.Audio.sfx('confirm');
    closeChoice();
    if (cb) cb(dex);
  }

  function closeChoice() {
    choiceOpts = null;
    const el = $('scr-evo');
    if (el) el.classList.add('hidden');
  }
  const isOpen = () => { const el = $('scr-evo'); return !!el && !el.classList.contains('hidden'); };

  // ---------------- piedra u objeto en el suelo ----------------

  const GEM = { 'fire-stone': '#ff7a3d', 'water-stone': '#4fa8ff', 'thunder-stone': '#ffd23f', 'leaf-stone': '#5fd06a',
    'moon-stone': '#a9a3d9', 'sun-stone': '#ffb03d', 'shiny-stone': '#f4f0ff', 'dusk-stone': '#8a5fb8', 'dawn-stone': '#7fe0ff',
    'ice-stone': '#c6f0ff', 'oval-stone': '#f3ead2' };
  let item = null;

  /**
   * Aparece su objeto a unos pasos (a la vista): ve a por él para evolucionar.
   * Si no lo coges en 20 s, va solo hacia ti (nadie se queda sin evolucionar).
   */
  function dropItem(pl, dex, it) {
    let x = pl.x, y = pl.y;
    const a0 = Math.random() * 6.2832;
    for (let k = 0; k < 24; k++) {
      const a = a0 + k * 2.4, d = 105 + Math.random() * 55;
      const tx = pl.x + Math.cos(a) * d, ty = pl.y + Math.sin(a) * d * 0.55;
      if (G.World.isFree(tx, ty, 12) && !G.World.isLiquid(tx, ty)) { x = tx; y = ty; break; }
    }
    item = { dex, it, x, y, t: 0, color: GEM[it] || '#ffcb3d', pl,
             draw(ctx) { drawItem(ctx, this); } };
    pl.evo.item = item;
    G.Audio.sfx('shiny');
    G.FX.ring(x, y, 4, 40, item.color, 0.5, 3);
    G.Spawner.say(G.I18n.f('¡Algo brilla cerca: {x}!', itemName(it)), 3, true);
  }

  /** Cada fotograma: → el dex al que evoluciona si lo acabas de coger, si no 0. */
  function itemTick(dt, pl) {
    if (!item || item.pl !== pl) return 0;
    item.t += dt;
    const dx = pl.x - item.x, dy = pl.y - item.y, d = Math.hypot(dx, dy);
    if (d > 650) {                            // te has ido lejos (la grieta...): vuelve a tu lado
      item.x = pl.x + 90; item.y = pl.y; item.t = Math.max(item.t, 20);
    } else if (item.t > 20 && d > 1) {
      const v = Math.min(d, (180 + d * 2) * dt);
      item.x += dx / d * v; item.y += dy / d * v;
    }
    if (pl.dead || d > pl.r + 16) return 0;
    const got = item.dex;
    G.FX.burst(item.x, item.y - 10, item.color, 16, 140);
    item = null;
    return got;
  }

  function drawItem(ctx, o) {
    const t = performance.now() / 1000, bob = Math.sin(t * 3.2) * 2.5, x = Math.round(o.x), y = o.y, K = 1.5;
    // Haz de luz, halo en el suelo y la piedra flotando (un rombo con su brillo), sin imágenes.
    ctx.save();
    ctx.globalAlpha = 0.16 + Math.sin(t * 4) * 0.06;
    ctx.fillStyle = o.color;
    ctx.fillRect(x - 5, y - 70, 10, 70);
    ctx.globalAlpha = 0.3 + Math.sin(t * 5) * 0.1;
    ctx.beginPath(); ctx.ellipse(x, y, 17, 6.5, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(x, y, 8, 3, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    const cy = Math.round(y - 20 + bob);
    ctx.translate(x, cy); ctx.scale(K, K);
    ctx.fillStyle = 'rgba(10,16,34,.85)';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 0); ctx.lineTo(0, 10); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = o.color;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 8); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.moveTo(-1, -6); ctx.lineTo(2, -2); ctx.lineTo(-1, 1); ctx.lineTo(-4, -1); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (G.Icons.twinkle) G.Icons.twinkle(ctx, x + 10, cy - 13, (t * 0.9) % 1, 2);
  }

  /** Para ordenarlo con lo demás del mundo (game.js, drawScene). */
  function drawable() { return item; }
  function clear() { item = null; pending = null; toastT = 0; if (toastEl) toastEl.classList.remove('on'); closeChoice(); }

  // ---------------- al empezar ----------------

  /** Si eliges uno ya evolucionado: «Empiezas como Charmander: evoluciona en la partida». */
  function startHint(pl) {
    if (!pl || !pl.evo || pl.form === pl.dex) return;
    G.Spawner.say(G.I18n.f('Empiezas como {x}: evoluciona en la partida', T(NAME(pl.form))), 3.2, true);
  }

  return { howHtml, dexLine, evolved, mateEvolved, tick, showChoice, pick, closeChoice, isOpen,
           dropItem, itemTick, drawable, clear, startHint, itemName };
})();
