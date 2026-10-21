/* ============ settings-ui.js — pantalla de Ajustes (PC y móvil) ============
 * Se abre por encima de lo que haya (menú o pausa) y al cerrar vuelve ahí.
 * Pestañas: Sonido · Gráficos · Controles · Accesibilidad · Cuenta · Acerca de.
 * Los ajustes son de este dispositivo (G.Settings / G.Audio en el navegador).
 */
G.SettingsUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VERSION = '1.2 · 2026-10-09';
  const REPO = 'https://github.com/JPTER78/pokesurvivor';
  let tab = 'sound';

  function init() {
    document.querySelectorAll('#set-tabs .gen-tab').forEach(b => { b.onclick = () => { tab = b.dataset.t; render(); }; });
    // Al conectar o quitar un mando con Controles abierto, se ve al momento.
    for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { if (isOpen() && tab === 'ctl') render(); });
    $('set-close').onclick = close;
    // Cuenta abierta: el estado de la partida se ve al momento (Guardar, subiendo...).
    G.DB.onSync(() => { if (isOpen() && tab === 'acc') render(); });
    $('btn-settings').innerHTML = G.Icons.html('gear', 20);
    $('btn-settings').onclick = () => open();
    $('btn-pause-settings').onclick = () => open('sound');
    // Pantalla completa (si el navegador la permite; en iPhone, cómo conseguirla).
    if (canFull() || iosTip()) {
      $('btn-full').classList.remove('hidden');
      $('btn-full').innerHTML = G.Icons.html('full', 20);
      $('btn-full').onclick = toggleFull;
    }
  }

  function open(t) {
    if (t) tab = t;
    $('scr-settings').classList.remove('hidden');
    render();
  }
  function close() { stopBind(); keyMsg = ''; $('scr-settings').classList.add('hidden'); }
  const isOpen = () => !$('scr-settings').classList.contains('hidden');

  // ---------------- pantalla completa ----------------
  function canFull() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  // iPhone: Safari no deja poner una web a pantalla completa (por eso a veces
  // no salía la opción). Sí se puede abriéndola desde la pantalla de inicio.
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => !!navigator.standalone || (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
  function iosTip() { return IOS && !canFull() && !standalone(); }
  const IOS_TIP = 'En iPhone, Safari no deja poner las webs a pantalla completa. Pulsa Compartir y luego "Añadir a pantalla de inicio": abriendo el juego desde ese icono se juega a pantalla completa.';
  function toggleFull() {
    if (!canFull()) { if (iosTip()) G.UI.toast(IOS_TIP, 9000); return; }
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const el = document.documentElement;
      const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      // En móvil, además se intenta fijar la pantalla en horizontal.
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* nada */ } }).catch(() => {});
    }
    setTimeout(() => { if (isOpen()) render(); }, 300);
  }

  // ---------------- piezas ----------------
  function section(title, sub) { return `<h3 class="set-h">${esc(title)}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}`; }
  function toggle(key, label, desc) {
    const on = !!G.Settings.get(key);
    return `<div class="set-row"><div class="grow"><b>${esc(label)}</b><small>${esc(desc)}</small></div>
      <button class="btn small switch ${on ? 'gold' : ''}" data-k="${key}">${on ? 'Sí' : 'No'}</button></div>`;
  }
  function choice(key, opts) {
    const cur = G.Settings.get(key);
    return `<div class="chips set-chips">${opts.map(([v, l]) => `<button class="chip ${v === cur ? 'on' : ''}" data-k="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
  }

  // ---------------- teclas (En PC) ----------------
  let binding = null, keyMsg = '';       // la acción que espera su tecla nueva · último aviso
  const DIRS = { up: ['↑', 'Arriba'], down: ['↓', 'Abajo'], left: ['←', 'Izquierda'], right: ['→', 'Derecha'] };
  function keyBtn(a) {
    const d = DIRS[a], on = binding === a;
    return `<button class="btn small keybind${on ? ' gold' : ''}" data-bind="${a}"${d ? ` title="${d[1]}"` : ''}>`
      + (d ? `<small>${d[0]}</small> ` : '') + (on ? '…' : esc(G.Input.keyLabel(a))) + '</button>';
  }
  function pcKeys() {
    const mv = ['keyw', 'keya', 'keys', 'keyd'].map(c => `<kbd>${esc(G.Input.codeLabel(c))}</kbd>`).join('');
    return `<div class="keys">
             <div>${mv} o flechas</div><span>moverse</span>
             <div>${['m1', 'm2', 'm3', 'm4'].map(a => keyBtn(a)).join('')} o clic en el icono</div><span>elegir ataque</span>
             <div>${keyBtn('prev')} / ${keyBtn('next')}</div><span>ataque anterior / siguiente</span>
             <div><kbd>Esc</kbd> / ${keyBtn('pause')}</div><span>pausa</span>
             <div><kbd>1</kbd>–<kbd>3</kbd></div><span>elegir carta al subir de nivel</span>
             <div>${['up', 'down', 'left', 'right'].map(a => keyBtn(a)).join('')}</div><span>teclas de más para moverte (las de siempre siguen valiendo)</span>
           </div>`
      + (binding ? '<p class="note">Pulsa la tecla nueva (Esc cancela)</p>' : keyMsg ? `<p class="note">${esc(keyMsg)}</p>` : '')
      + '<div class="row" style="margin-top:10px"><button class="btn small" id="set-keys-reset">Restablecer teclas</button></div>';
  }
  /** Espera la siguiente tecla para la acción `a` (pulsar otra vez el mismo botón cancela). */
  function bindKey(a) {
    if (binding === a) { stopBind(); keep(); return; }
    binding = a; keyMsg = '';
    G.Input.grab(c => {
      binding = null;
      keyMsg = c === 'escape' ? '' : G.Input.bind(a, c);
      if (isOpen() && tab === 'ctl') keep();
    });
    keep();
  }
  function stopBind() { if (binding) { binding = null; G.Input.grab(null); } }
  /** Redibuja sin volver arriba (las teclas están al final de la pestaña). */
  function keep() { const y = $('set-body').scrollTop; render(); $('set-body').scrollTop = y; }

  function render() {
    if (tab !== 'ctl') { stopBind(); keyMsg = ''; }
    document.querySelectorAll('#set-tabs .gen-tab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const box = $('set-body');
    box.scrollTop = 0;
    if (tab === 'sound') {
      box.innerHTML = section('Sonido') + '<div id="set-sound" class="sound-inline"></div>';
      G.UI.soundControls($('set-sound'));
    } else if (tab === 'gfx') {
      const auto = ['baja', 'media', 'alta'][G.Settings.autoLevel];
      box.innerHTML = section('Idioma', 'El juego se recarga al cambiarlo.')
        + `<div class="chips set-chips" translate="no">${G.I18n.choices.map(([v, l]) =>
             `<button class="chip ${G.I18n.lang === v ? 'on' : ''}" data-lang="${v}">${l}</button>`).join('')}</div>`
        + section('Calidad', 'Cuántos efectos y partículas se dibujan. <b>Auto</b> la baja sola si el juego va a tirones (ahora: ' + auto + ').')
        + choice('quality', [['auto', 'Auto'], ['high', 'Alta'], ['mid', 'Media'], ['low', 'Baja']])
        + section('Pantalla')
        + toggle('dmgNumbers', 'Números de daño', 'Los números que salen al golpear y al recibir daño.')
        + toggle('calm', 'Menos sacudidas y destellos', 'La cámara tiembla menos y los fogonazos son suaves.')
        + toggle('fps', 'Mostrar FPS', 'Fotogramas por segundo, en la esquina de abajo.')
        + toggle('hpUnder', 'Vida bajo tu Pokémon', 'Una barra pequeña bajo tu Pokémon (y bajo tus compañeros) con la vida que le queda.')
        + toggle('lowHpWarn', 'Aviso de poca vida', 'Con menos del 30 % de vida, los bordes de la pantalla laten en rojo.')
        + toggle('eco', 'Ahorro de energía', 'Dibuja a resolución normal (1×): un poco menos nítido, pero se calienta menos y gasta menos batería.')
        + `<div class="set-row"><div class="grow"><b>Tamaño del HUD</b><small>Vida, nivel, reloj y ataques de la partida. En pantallas grandes ya sale algo más grande.</small></div></div>`
        + choice('hudScale', [[1, 'Normal'], [1.25, 'Grande'], [1.5, 'Muy grande']])
        + (canFull() ? `<div class="set-row"><div class="grow"><b>Pantalla completa</b><small>Sin barras del navegador.</small></div>
             <button class="btn small" id="set-full">${isFull() ? 'Salir' : 'Activar'}</button></div>`
           : iosTip() ? `<div class="set-row"><div class="grow"><b>Pantalla completa</b><small>${esc(IOS_TIP)}</small></div></div>` : '');
    } else if (tab === 'ctl') {
      const pn = G.Pad.name;
      box.innerHTML = section('Con mando', pn
          ? 'Mando conectado: <b translate="no">' + esc(pn.replace(/\s*\(.*$/, '')) + '</b>'
          : 'Xbox, PlayStation, Switch y la mayoría de mandos USB o Bluetooth. Conéctalo y pulsa cualquier botón.')
        + toggle('gamepad', 'Usar mando', 'Moverte, cambiar de ataque y manejar los menús con el mando.')
        + toggle('padRumble', 'Vibración', 'El mando vibra al recibir daño (si el mando y el navegador lo permiten).')
        + `<div class="keys">
             <div><span class="padkey">Stick izq.</span> o <span class="padkey">Cruceta</span></div><span>moverse · elegir en los menús</span>
             <div><span class="padkey">LB</span> / <span class="padkey">RB</span></div><span>ataque anterior / siguiente</span>
             <div><span class="padkey">Start</span></div><span>pausa</span>
             <div><span class="padkey">A</span></div><span>pulsar (en los menús) · saltar la animación de Arceus</span>
             <div><span class="padkey">B</span></div><span>atrás / cerrar</span>
             <div><span class="padkey">Y</span></div><span>cambiar las cartas al subir de nivel</span>
             <div><span class="padkey">Stick der.</span></div><span>desplazar las listas · apuntar (si activas Apuntar a mano en Accesibilidad)</span>
           </div>`
        + section('En móvil o tablet')
        + `<p class="sub">Pon el dedo en cualquier parte y arrastra para moverte: el joystick aparece donde tocas. Toca un ataque de abajo para cambiarlo y el botón de arriba a la derecha para pausar. Se juega en horizontal.</p>`
        + `<div class="set-row"><div class="grow"><b>Tamaño del joystick</b><small>Cuánto hay que arrastrar el dedo.</small></div></div>`
        + choice('stick', [[0.8, 'Pequeño'], [1, 'Normal'], [1.25, 'Grande']])
        + `<div class="set-row"><div class="grow"><b>Colocar los botones</b><small>Pon los ataques, la pausa y el joystick (fijo, si quieres) donde quieras de la pantalla.</small></div>
             <button class="btn small" id="set-layout">Colocar</button></div>`
        + section('En PC', 'Haz clic en una tecla y pulsa la nueva. Si ya la usaba otra acción, se intercambian.')
        + pcKeys();
    } else if (tab === 'a11y') {
      // En el móvil no hay apuntado a mano (siempre apunta solo).
      box.innerHTML = (G.Settings.touch ? '' : section('Apuntado')
        + toggle('aimManual', 'Apuntar a mano', 'Tus ataques van hacia el ratón (o hacia donde empujes el stick derecho del mando) en vez de al enemigo más cercano. Si sueltas el stick y no mueves el ratón, vuelve a apuntar solo. La cadena y los meteoros siguen buscando a los enemigos solos.'))
        + section('Ver mejor el combate')
        + `<div class="set-row"><div class="grow"><b>Transparencia de tus ataques</b><small>Tus ataques se ven más transparentes para que veas mejor los disparos y avisos de los enemigos.</small></div></div>`
        + choice('ownFx', [[1, 'Normal'], [0.6, 'Suaves'], [0.35, 'Muy suaves']])
        + toggle('hazardHi', 'Avisos de alto contraste', 'Los avisos de ataques enemigos en el suelo salen en blanco y negro con rayas en vez del color del tipo, y los disparos enemigos llevan un aro amarillo. Para daltónicos.');
    } else if (tab === 'acc') {
      renderAccount(box);
    } else {
      box.innerHTML = `<div class="about-logo">PokéSurvivor</div><p class="sub center">Versión ${esc(VERSION)}</p>`
        + `<p class="sub">Juego de fans <b>gratuito y sin ánimo de lucro</b>: sin anuncios ni compras. Pokémon y sus personajes son propiedad de Nintendo, Creatures y GAME FREAK; este proyecto no está afiliado a ellos.</p>`
        + section('Créditos')
        + `<ul class="credits">
             <li><b>Sprites:</b> PMD SpriteCollab y sus artistas (CC BY-NC 4.0).</li>
             <li><b>Datos de los Pokémon:</b> PokéAPI.</li>
             <li><b>Música y sonidos:</b> originales, generados por el propio juego.</li>
             <li><b>Fuente:</b> Pixelify Sans (OFL).</li>
           </ul>`
        + `<div class="row wrap" style="justify-content:center;gap:8px">
             ${window.PS_PAGES ? `<a class="btn small" href="${G.I18n.lang === 'en' ? 'en/guide/' : 'guia/'}" target="_blank">Guía y preguntas</a>
             <a class="btn small" href="${G.I18n.lang === 'en' ? 'en/pokedex/' : 'pokedex/'}" target="_blank">Pokédex</a>` : ''}
             <button class="btn small" data-legal>Aviso legal y privacidad</button>
             <a class="btn small" href="contacto/" target="_blank" rel="noopener">Contacto</a>
             <a class="btn small" href="${REPO}" target="_blank" rel="noopener">Código (GitHub)</a>
           </div>`;
    }
    wire(box);
  }

  function renderAccount(box) {
    const st = G.DB.guest ? 'guest' : G.DB.syncState;
    // Lo mismo que el punto de la barra de arriba (ui.js): a la nube sólo se sube con Guardar.
    const SYNC = { ok: 'Guardado en la nube', syncing: 'Guardando…', pending: 'Sin guardar en la nube: pulsa Guardar',
                   offline: 'Sin conexión: pulsa Guardar cuando vuelva', local: 'Guardado sólo en este navegador', guest: 'Invitado: no se guarda' };
    if (G.DB.guest) {
      box.innerHTML = section('Cuenta', 'Estás jugando como <b>invitado</b>: tu progreso no se guarda al salir.')
        + `<button class="btn gold" id="set-login">Crear cuenta o entrar</button>`;
      return;
    }
    const nick = G.Social.me ? G.Social.me.name : (G.DB.user || '');
    const cloud = G.DB.mode === 'cloud', named = cloud && G.DB.nameAccount, mail = cloud ? G.DB.email : '';
    const MAIL = s => `<span translate="no" style="overflow-wrap:anywhere">${esc(s)}</span>`;
    // Con qué cuenta has entrado: con otro Gmail sería otra partida (#139).
    const who = !cloud ? `<span>${esc('Cuenta de este navegador')}</span>`
      : named ? `<span>${esc('Cuenta con nombre y contraseña')}</span>` : MAIL(mail || 'Google');
    box.innerHTML = section('Cuenta')
      + `<div class="set-row"><div class="grow"><b>Apodo</b><small>Es único y no se puede cambiar.</small></div><span class="gold" translate="no">${esc(nick)}</span></div>`
      + `<div class="set-row"><div class="grow"><b>Has entrado con</b>${cloud && !named ? '<small>Cuenta de Google. Con otro Gmail tendrías otra partida.</small>' : ''}</div>${who}</div>`
      + (named ? `<div class="set-row"><div class="grow"><b>Gmail vinculado</b><small>${G.DB.hasGoogle
            ? 'Si olvidas la contraseña, entra con Google.' : 'Vincúlalo para entrar con Google si olvidas la contraseña.'}</small></div>`
          + (G.DB.hasGoogle ? MAIL(mail || 'Google') : '<button class="btn small gold" id="set-link">Vincular Gmail</button>') + '</div>' : '')
      + `<div class="set-row"><div class="grow"><b>Partida</b>${cloud
          ? '<small>La nube se actualiza al pulsar Guardar, antes de una actualización automática y al cerrar sesión. Pulsa Guardar antes de cambiar de aparato.</small>' : ''}</div><span>${esc(SYNC[st] || st)}</span></div>`
      + `<div class="row wrap" style="gap:8px;margin-top:12px">${cloud && st !== 'ok' && st !== 'syncing' ? '<button class="btn gold" id="set-save">Guardar</button>' : ''}
           <button class="btn" id="set-logout">Cerrar sesión</button>
           <button class="btn danger" id="set-delete">Borrar cuenta</button>
         </div><p class="note" id="set-msg"></p>`;
  }

  function wire(box) {
    box.querySelectorAll('.switch[data-k]').forEach(b => { b.onclick = () => { G.Settings.set(b.dataset.k, !G.Settings.get(b.dataset.k)); render(); }; });
    box.querySelectorAll('.chip[data-k]').forEach(b => {
      b.onclick = () => { const v = b.dataset.v; G.Settings.set(b.dataset.k, isNaN(+v) ? v : +v); render(); };
    });
    const full = $('set-full'); if (full) full.onclick = toggleFull;
    const lay = $('set-layout'); if (lay) lay.onclick = () => G.LayoutUI.open();
    box.querySelectorAll('[data-bind]').forEach(b => { b.onclick = () => bindKey(b.dataset.bind); });
    const kr = $('set-keys-reset'); if (kr) kr.onclick = () => { stopBind(); keyMsg = ''; G.Input.resetKeys(); keep(); };
    box.querySelectorAll('[data-lang]').forEach(b => { b.onclick = () => { if (b.dataset.lang !== G.I18n.lang) G.I18n.set(b.dataset.lang); }; });
    const lo = $('set-login'); if (lo) lo.onclick = () => { close(); leave(); };
    const out = $('set-logout'); if (out) out.onclick = () => { close(); leave(); };
    // Cuenta: Guardar (lo mismo que el botón de arriba) y vincular Gmail.
    const sv = $('set-save'); if (sv) sv.onclick = () => $('btn-save').click();
    const lk = $('set-link');
    if (lk) lk.onclick = async () => {
      lk.disabled = true;
      const r = await G.DB.linkGoogle();
      if (!r.ok) { lk.disabled = false; $('set-msg').textContent = r.error; return; }
      G.UI.toast('¡Gmail vinculado! Si olvidas la contraseña, entra con Google.', 4500);
      if (isOpen() && tab === 'acc') render();
    };
    const del = $('set-delete');
    if (del) del.onclick = async () => {
      const ok = await G.UI.confirmDelete();
      if (!ok) return;
      del.disabled = true;
      const r = await G.DB.deleteAccount(ok.pass);
      if (!r.ok) { $('set-msg').textContent = r.error; del.disabled = false; return; }
      close();
      G.UI.toast('Cuenta borrada');
      G.Audio.music(null);
      G.Flow.toLogin();
    };
  }

  /** Cerrar sesión (si estás en una partida, se abandona). */
  function leave() {
    if (G.DB.guest && !confirm('Eres invitado: se perderá todo el progreso. ¿Salir?')) return;
    if (G.Game.state !== 'ui') G.Game.quit && G.Game.quit();
    G.Audio.music(null);
    G.DB.logout().then(() => G.Flow.toLogin());
  }

  return { init, open, close, get isOpen() { return isOpen(); } };
})();
