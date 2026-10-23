/* ============ layout-ui.js — colocar los botones (móvil) ============
 * Ajustes > Controles > Colocar los botones: se ven los ataques (con el
 * objeto), la pausa y, si es fijo, el joystick, y se arrastran a donde se
 * quiera. Se guarda el centro de cada cosa en proporción a la pantalla
 * (G.Settings 'pad' en horizontal y 'padP' en vertical: cada orientación la
 * suya); lo que no se mueve se queda en su sitio de siempre.
 * El HUD (hud.js) y el joystick (touch.js) leen esas posiciones.
 * Las medidas salen del HUD (G.HUD.pads: huecos de 54 px, 44 en el móvil) y
 * del joystick (G.Touch.R); el dibujo de cada cosa, de «pantallas: partida»
 * en style.css (con las mismas medidas del móvil en su @media).
 */
G.LayoutUI = (() => {
  const N = 4;
  /** Medidas de la barra (objeto + 4 huecos) y de la pausa en esta pantalla, como en hud.js. */
  function dims(w, h) {
    const D = G.HUD.pads(w, h);
    return { S: D.S, BAR_W: D.S + D.IG + N * D.S + (N - 1) * D.GAP, P: D.P, PR: D.PR };
  }
  let el = null, pos = null, moved = null, mode = 'float';
  // Lo movido y aún sin guardar de cada orientación: al girar el móvil con el editor abierto
  // no se pierde, y «Guardar» guarda las dos. (pad en horizontal, padP en vertical)
  let draft = {}, dirty = false, lastW = 0, lastH = 0;
  const keyOf = (w, h) => h > w ? 'padP' : 'pad';
  /** Lo movido, en proporción a la pantalla (como se guarda en G.Settings). */
  function toPad(w, h) { const pad = {}; for (const k in pos) if (moved[k]) pad[k] = [+(pos[k][0] / w).toFixed(4), +(pos[k][1] / h).toFixed(4)]; return pad; }

  /** Dónde está cada cosa ahora mismo (centro en px), con lo guardado o lo de siempre (hud.js). */
  function current(k, w, h) {
    if (k === 'stick') { const b = G.Touch.stickBase(w, h); return [b.x, b.y]; }
    const p = G.Touch.spot(k, w, h);
    return p ? [p[0] * w, p[1] * h] : G.HUD.padDefault(k, w, h);
  }

  /** Lo mismo que hace el HUD para que no se salga de la pantalla (ni se meta bajo la barra de estado). */
  function fit(k, x, y, w, h) {
    const top = G.Touch.safeArea().top, { S, BAR_W, P } = dims(w, h);
    if (k === 'bar') return [G.U.clamp(x, 6 + BAR_W / 2, Math.max(6 + BAR_W / 2, w - BAR_W / 2 - 6)), G.U.clamp(y, Math.max(24, top + 6) + S / 2, h - S / 2 - 6)];
    if (k === 'pause') return [G.U.clamp(x, 4 + P / 2, w - 4 - P / 2), G.U.clamp(y, Math.max(10, top + 4) + P / 2, h - 4 - P / 2)];
    const r = G.Touch.R(w, h);
    return [G.U.clamp(x, r + 4, w - r - 4), G.U.clamp(y, r + 4, h - r - 4)];
  }

  // Discos MT de ejemplo en los huecos y Restos en el del objeto (sólo para verlos como en la partida).
  const SAMPLE = ['tm-fire', 'tm-water', 'tm-grass', 'tm-electric'];

  function build() {
    el = document.createElement('section');
    el.id = 'scr-layout';
    el.className = 'scr hidden';
    const slots = Array.from({ length: N }, (_, i) => `<div class="lay-slot${i === 0 ? ' on' : ''}">${G.Icons.html(SAMPLE[i], 30)}<i>${i + 1}</i></div>`).join('');
    el.innerHTML = `
      <div class="lay-thing lay-bar" data-k="bar"><div class="lay-slot item">${G.Icons.html('leftovers', 30)}</div>${slots}<span class="lay-tag">Ataques</span></div>
      <div class="lay-thing lay-pause" data-k="pause"><b></b><b></b></div>
      <div class="lay-thing lay-stick" data-k="stick"><div class="knob"></div><span class="lay-tag">Joystick</span></div>
      <div class="box lay-panel" role="dialog" aria-labelledby="lay-title">
        <h3 id="lay-title">Colocar los botones</h3>
        <p class="lay-sub">Arrastra los botones a donde quieras</p>
        <p class="lay-turn"><span class="lay-h">Esta colocación es para jugar en horizontal; la de vertical va aparte.</span><span class="lay-v">Esta colocación es para jugar en vertical; la de horizontal va aparte.</span></p>
        <div class="lay-row"><b>Joystick</b>
          <div class="seg" id="lay-mode"><button type="button" data-m="float">Flotante</button><button type="button" data-m="fixed">Fijo</button></div>
        </div>
        <small class="lay-help">Flotante: aparece donde pones el dedo. Fijo: siempre en el mismo sitio.</small>
        <div class="lay-btns">
          <button class="btn ghost" type="button" id="lay-cancel" data-back>Cancelar</button>
          <button class="btn ghost ic" type="button" id="lay-reset" data-ico="refresh" data-ico-size="18"><span>Restablecer</span></button>
          <button class="btn gold" type="button" id="lay-save">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    G.UI.icons(el);
    el.querySelectorAll('.lay-thing').forEach(drag);
    el.querySelectorAll('#lay-mode button').forEach(b => { b.onclick = () => { mode = b.dataset.m; paint(); }; });
    // Esc cierra el editor (sin guardar) y no llega al juego: si no, cerraba Ajustes, que está detrás.
    addEventListener('keydown', e => {
      if (!isOpen() || e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      close();
    }, true);
    el.querySelector('#lay-cancel').onclick = close;
    el.querySelector('#lay-reset').onclick = () => {
      moved = {}; mode = 'float';
      const w = innerWidth, h = innerHeight, d = G.Touch.stickDef(w, h);
      pos = { bar: G.HUD.padDefault('bar', w, h), pause: G.HUD.padDefault('pause', w, h), stick: [d[0] * w, d[1] * h] };
      for (const k in pos) pos[k] = fit(k, pos[k][0], pos[k][1], w, h);
      dirty = true;
      paint();
    };
    el.querySelector('#lay-save').onclick = save;
    addEventListener('resize', () => {
      if (!isOpen()) return;
      if (dirty) draft[keyOf(lastW, lastH)] = toPad(lastW, lastH);   // lo de la orientación que se deja
      load(); paint();
    });
  }

  function drag(node) {
    const k = node.dataset.k;
    let off = null;
    node.addEventListener('pointerdown', e => {
      e.preventDefault();
      off = [e.clientX - pos[k][0], e.clientY - pos[k][1]];
      node.classList.add('held');
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
    });
    node.addEventListener('pointermove', e => {
      if (!off) return;
      pos[k] = fit(k, e.clientX - off[0], e.clientY - off[1], innerWidth, innerHeight);
      moved[k] = true; dirty = true;
      paint();
    });
    const up = () => { off = null; node.classList.remove('held'); };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }

  function load() {
    const w = innerWidth, h = innerHeight;
    pos = {}; moved = {};
    for (const k of ['bar', 'pause', 'stick']) {
      const c = current(k, w, h);
      pos[k] = fit(k, c[0], c[1], w, h);
      moved[k] = !!G.Touch.spot(k, w, h);
    }
    lastW = w; lastH = h; dirty = false;
    // Si en esta orientación ya se había movido algo sin guardar, se recupera.
    const d = draft[keyOf(w, h)];
    if (d) {
      for (const k of ['bar', 'pause', 'stick']) {
        moved[k] = !!d[k];
        let c;
        if (d[k]) c = [d[k][0] * w, d[k][1] * h];
        else if (k === 'stick') { const s = G.Touch.stickDef(w, h); c = [s[0] * w, s[1] * h]; }
        else c = G.HUD.padDefault(k, w, h);
        pos[k] = fit(k, c[0], c[1], w, h);
      }
      dirty = true;
    }
  }

  function paint() {
    const w = innerWidth, h = innerHeight, r = G.Touch.R(w, h), { S, BAR_W, PR } = dims(w, h);
    const place = (k, ww, hh) => {
      const n = el.querySelector(`[data-k="${k}"]`);
      n.style.left = (pos[k][0] - ww / 2) + 'px'; n.style.top = (pos[k][1] - hh / 2) + 'px';
      n.style.width = ww + 'px'; n.style.height = hh + 'px';
      return n;
    };
    place('bar', BAR_W, S);
    place('pause', PR * 2, PR * 2);              // (el círculo; lo que se toca en la partida, 40 px)
    place('stick', r * 2, r * 2).classList.toggle('hidden', mode !== 'fixed');
    el.querySelectorAll('#lay-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    // Se juega de pie y tumbado: cada orientación tiene su colocación.
    const tall = innerHeight > innerWidth;
    el.querySelector('.lay-h').classList.toggle('hidden', tall);
    el.querySelector('.lay-v').classList.toggle('hidden', !tall);
  }

  function save() {
    const w = innerWidth, h = innerHeight;
    draft[keyOf(w, h)] = toPad(w, h);
    for (const key in draft) G.Settings.set(key, Object.keys(draft[key]).length ? draft[key] : null);
    G.Settings.set('stickMode', mode);
    G.UI.toast('Botones colocados');
    close();
  }

  function open() {
    if (!el) build();
    mode = G.Settings.get('stickMode') === 'fixed' ? 'fixed' : 'float';
    draft = {};
    load();
    el.classList.remove('hidden');
    paint();
  }
  function close() { if (el) el.classList.add('hidden'); }
  const isOpen = () => !!el && !el.classList.contains('hidden');

  return { open, close, get isOpen() { return isOpen(); } };
})();
