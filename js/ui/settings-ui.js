/* ============ settings-ui.js — pantalla de Ajustes (PC y móvil) ============
 * Se abre por encima de lo que haya (menú o pausa) y al cerrar vuelve ahí.
 * Pestañas (#set-nav, cada una con el icono de un objeto): Sonido · Gráficos ·
 * Controles · Accesibilidad · Cuenta · Acerca de.
 * Los ajustes son de este dispositivo (G.Settings / G.Audio en el navegador).
 * Cada ajuste es una fila (.list-row): los de sí/no son interruptores (toda la
 * fila es un botón role="switch" con data-k) y los de varias opciones, un
 * segmento (botones role="radio" con data-k y data-v). Al tocarlos se cambia la
 * fila en su sitio, sin redibujar (así la lista no vuelve arriba).
 */
G.SettingsUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VERSION = '1.2 · 2026-10-09';
  const REPO = 'https://github.com/JPTER78/pokesurvivor';
  let tab = 'sound';

  function init() {
    document.querySelectorAll('#set-nav .set-tab').forEach(b => {
      b.id = 'set-tab-' + b.dataset.t;
      b.setAttribute('aria-controls', 'set-body');
      // El icono de cada pestaña: un objeto de la Mochila (data-tico).
      const ic = b.querySelector('.ico-tile');
      if (ic && !ic.firstChild) ic.innerHTML = G.Icons.html(b.dataset.tico, 30);
      b.onclick = () => { if (tab === b.dataset.t) return; G.Audio.sfx('click'); tab = b.dataset.t; render(); };
    });
    // Al conectar o quitar un mando con Controles abierto, se ve al momento.
    for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { if (isOpen() && tab === 'ctl') keep(); });
    // Pantalla completa: el interruptor sigue al estado real (también si se sale con Esc).
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, syncFull);
    $('set-close').onclick = close;
    // Cuenta abierta: el estado de la partida se ve al momento (Guardar, subiendo...).
    G.DB.onSync(() => { if (isOpen() && tab === 'acc') keep(); });
    // Los iconos de la barra de arriba los pone ui.js (barIcons): aquí sólo el clic.
    $('btn-settings').onclick = () => open();
    $('btn-pause-settings').onclick = () => open('sound');
    // Pantalla completa (si el navegador la permite; en iPhone, cómo conseguirla).
    if (canFull() || iosTip()) {
      $('btn-full').classList.remove('hidden');
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
    // iPhone: la pantalla completa se consigue instalando el juego: se enseña cómo.
    if (!canFull()) { if (iosTip()) { if (G.InstallUI && G.InstallUI.can()) G.InstallUI.open(); else G.UI.toast(IOS_TIP, 9000); } return; }
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const el = document.documentElement;
      const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      // Ya no se fija en horizontal: el juego se puede jugar también en vertical.
      if (p && p.catch) p.catch(() => {});
    }
  }
  function syncFull() { const b = $('set-full'); if (b) b.setAttribute('aria-checked', String(isFull())); }

  // ---------------- piezas ----------------
  /** Título de un apartado (y, si hay, una frase debajo; puede llevar <b>). */
  function section(title, sub) { return `<h3 class="set-h">${esc(title)}</h3>${sub ? `<p class="set-sub">${sub}</p>` : ''}`; }
  /** Filas en una lista. */
  const list = (...rows) => `<div class="list set-list">${rows.join('')}</div>`;
  /** Texto de una fila: nombre y, debajo, la explicación (desc puede llevar <b>). */
  const label = (name, desc) => `<span class="grow"><b>${esc(name)}</b>${desc ? `<small>${desc}</small>` : ''}</span>`;
  /** Interruptor: toda la fila es el botón. */
  function toggle(key, name, desc) {
    const on = !!G.Settings.get(key);
    return `<button type="button" class="list-row set-row set-switch" role="switch" aria-checked="${on}" data-k="${key}">`
      + label(name, esc(desc)) + '<span class="sw" aria-hidden="true"></span></button>';
  }
  /** Segmento de opciones [[valor, texto]...]; con nombre, en su propia fila. */
  function choice(key, opts, name, desc) {
    const cur = G.Settings.get(key);
    const seg = `<div class="set-seg" role="radiogroup"${name ? ` aria-label="${esc(name)}"` : ''}>${opts.map(([v, l]) =>
      `<button type="button" role="radio" class="${v === cur ? 'on' : ''}" aria-checked="${v === cur}" data-k="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
    return `<div class="list-row set-row set-col">${name ? label(name, desc && esc(desc)) : ''}${seg}</div>`;
  }
  /** Fila con un botón a la derecha. */
  const action = (name, desc, btn) => `<div class="list-row set-row">${label(name, esc(desc))}${btn}</div>`;

  // ---------------- sonido ----------------
  // Volumen de la música y de los efectos con su cifra, y «Silenciar todo».
  function volRow(k, name, ico) {
    const v = Math.round(G.Audio.settings[k] * 100);
    return `<div class="list-row set-vol"><span class="ico-tile s">${G.Icons.html(ico, 30)}</span><b>${esc(name)}</b>`
      + `<output id="set-vol-${k}-v" for="set-vol-${k}">${v} %</output>`
      + `<input id="set-vol-${k}" type="range" min="0" max="100" value="${v}" data-vol="${k}" aria-label="${esc(name)}" style="--v:${v}%"></div>`;
  }
  function soundTab() {
    const muted = !!G.Audio.settings.muted;
    return section('Sonido')
      + `<div class="list set-list${muted ? ' set-mute' : ''}" id="set-sound">`
      + volRow('music', 'Música', 'metronome') + volRow('sfx', 'Efectos', 'shell-bell')
      + `<button type="button" class="list-row set-row set-switch" role="switch" aria-checked="${muted}" id="set-mute">`
      + `<span class="ico-tile s">${G.Icons.html('mute', 22)}</span>${label('Silenciar todo')}<span class="sw" aria-hidden="true"></span></button>`
      + '</div>';
  }
  /** Silencia o quita el silencio por el camino de siempre (G.UI.soundControls), que
   *  también cambia el icono del sonido de la barra de arriba. */
  function toggleMute() {
    const tmp = document.createElement('div');
    G.UI.soundControls(tmp);
    const b = tmp.querySelector('[data-mute]');
    if (b) b.click(); else G.Audio.toggleMute();
    const m = !!G.Audio.settings.muted;
    G.Audio.sfx('click');                      // (callado si se acaba de silenciar)
    $('set-mute').setAttribute('aria-checked', String(m));
    $('set-sound').classList.toggle('set-mute', m);
  }

  // ---------------- teclas (En PC) ----------------
  let binding = null, keyMsg = '';       // la acción que espera su tecla nueva · último aviso
  const DIRS = { up: ['↑', 'Arriba'], down: ['↓', 'Abajo'], left: ['←', 'Izquierda'], right: ['→', 'Derecha'] };
  function keyBtn(a) {
    const d = DIRS[a], on = binding === a;
    return `<button type="button" class="btn small keybind${on ? ' gold' : ''}" data-bind="${a}"${d ? ` title="${d[1]}"` : ''}>`
      + (d ? `<small>${d[0]}</small> ` : '') + (on ? '…' : esc(G.Input.keyLabel(a))) + '</button>';
  }
  /** Una acción y sus teclas (o botones del mando) en una fila. */
  const keyRow = (keys, what) => `<div class="key-row"><span class="key-lbl">${what}</span><span class="key-keys">${keys}</span></div>`;
  function pcKeys() {
    const mv = ['keyw', 'keya', 'keys', 'keyd'].map(c => `<kbd>${esc(G.Input.codeLabel(c))}</kbd>`).join('');
    return '<div class="set-card keys">'
      + keyRow(`${mv} o flechas`, 'moverse')
      + keyRow(`${['m1', 'm2', 'm3', 'm4'].map(a => keyBtn(a)).join('')} o clic en el icono`, 'elegir ataque')
      + keyRow(`${keyBtn('prev')} / ${keyBtn('next')}`, 'ataque anterior / siguiente')
      + keyRow(`<kbd>Esc</kbd> / ${keyBtn('pause')}`, 'pausa')
      + keyRow('<kbd>1</kbd>–<kbd>3</kbd>', 'elegir carta al subir de nivel')
      + keyRow(['up', 'down', 'left', 'right'].map(a => keyBtn(a)).join(''), 'teclas de más para moverte (las de siempre siguen valiendo)')
      + '</div>'
      + `<p class="note set-note" aria-live="polite">${binding ? 'Pulsa la tecla nueva (Esc cancela)' : keyMsg ? esc(keyMsg) : ''}</p>`
      + '<div class="set-acts"><button type="button" class="btn small ghost" id="set-keys-reset">Restablecer teclas</button></div>';
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

  const PAD = s => `<span class="padkey">${s}</span>`;
  function ctlTab() {
    const pn = G.Pad.name;
    const pad = section('Con mando', pn
        ? 'Mando conectado: <b translate="no">' + esc(pn.replace(/\s*\(.*$/, '')) + '</b>'
        : 'Xbox, PlayStation, Switch y la mayoría de mandos USB o Bluetooth. Conéctalo y pulsa cualquier botón.')
      + list(toggle('gamepad', 'Usar mando', 'Moverte, cambiar de ataque y manejar los menús con el mando.'),
        toggle('padRumble', 'Vibración', 'El mando vibra al recibir daño (si el mando y el navegador lo permiten).'))
      + '<div class="set-card keys">'
      + keyRow(`${PAD('Stick izq.')} o ${PAD('Cruceta')}`, 'moverse · elegir en los menús')
      + keyRow(`${PAD('LB')} / ${PAD('RB')}`, 'ataque anterior / siguiente')
      + keyRow(PAD('Start'), 'pausa')
      + keyRow(PAD('A'), 'pulsar (en los menús) · saltar la animación de Arceus')
      + keyRow(PAD('B'), 'atrás / cerrar')
      + keyRow(PAD('Y'), 'cambiar las cartas al subir de nivel')
      + keyRow(PAD('Stick der.'), 'desplazar las listas · apuntar (si activas Apuntar a mano en Accesibilidad)')
      + '</div>';
    const mobile = section('En móvil o tablet', 'Arrastra el joystick para moverte. Toca un ataque de abajo para cambiarlo y el botón de arriba a la derecha para pausar.')
      + list(choice('stickMode', [['fixed', 'Fijo'], ['float', 'Flotante']], 'Joystick', 'Fijo: siempre en el mismo sitio. Flotante: aparece donde pones el dedo.'),
        choice('stick', [[0.8, 'Pequeño'], [1, 'Normal'], [1.25, 'Grande']], 'Tamaño del joystick', 'Cuánto hay que arrastrar el dedo.'),
        action('Colocar los botones', 'Pon los ataques, la pausa y el joystick (fijo, si quieres) donde quieras de la pantalla.',
          '<button type="button" class="btn small" id="set-layout">Colocar</button>'));
    // Con el dedo: primero lo del móvil y sin las teclas de PC (vuelven al usar ratón o teclado).
    return G.Touch.active ? mobile + pad
      : pad + mobile + section('En PC', 'Haz clic en una tecla y pulsa la nueva. Si ya la usaba otra acción, se intercambian.') + pcKeys();
  }

  function gfxTab() {
    const auto = ['baja', 'media', 'alta'][G.Settings.autoLevel];
    return section('Idioma', 'El juego se recarga al cambiarlo.')
      + `<div class="list-row set-row set-col"><div class="chips" translate="no">${G.I18n.choices.map(([v, l]) =>
           `<button type="button" class="chip ${G.I18n.lang === v ? 'on' : ''}" data-lang="${v}" aria-pressed="${G.I18n.lang === v}">${l}</button>`).join('')}</div></div>`
      + section('Calidad', 'Cuántos efectos y partículas se dibujan. <b>Auto</b> la baja sola si el juego va a tirones (ahora: ' + auto + ').')
      + list(choice('quality', [['auto', 'Auto'], ['high', 'Alta'], ['mid', 'Media'], ['low', 'Baja']]))
      + section('Pantalla')
      + list(toggle('dmgNumbers', 'Números de daño', 'Los números que salen al golpear y al recibir daño.'),
        toggle('calm', 'Menos sacudidas y destellos', 'La cámara tiembla menos y los fogonazos son suaves.'),
        toggle('fps', 'Mostrar FPS', 'Fotogramas por segundo, en la esquina de abajo.'),
        toggle('hpUnder', 'Vida bajo tu Pokémon', 'Una barra pequeña bajo tu Pokémon (y bajo tus compañeros) con la vida que le queda.'),
        toggle('lowHpWarn', 'Aviso de poca vida', 'Con menos del 30 % de vida, los bordes de la pantalla laten en rojo.'),
        toggle('eco', 'Ahorro de energía', 'Dibuja a resolución normal (1×): un poco menos nítido, pero se calienta menos y gasta menos batería.'),
        choice('hudScale', [[1, 'Normal'], [1.25, 'Grande'], [1.5, 'Muy grande']], 'Tamaño del HUD',
          'Vida, nivel, reloj y ataques de la partida. En pantallas grandes ya sale algo más grande.'),
        canFull() ? `<button type="button" class="list-row set-row set-switch" role="switch" aria-checked="${isFull()}" id="set-full">`
            + label('Pantalla completa', 'Sin barras del navegador.') + '<span class="sw" aria-hidden="true"></span></button>'
          : iosTip() ? `<div class="list-row set-row">${label('Pantalla completa', esc(IOS_TIP))}</div>` : '');
  }

  function a11yTab() {
    // En el móvil no hay apuntado a mano (siempre apunta solo).
    return (G.Settings.touch ? '' : section('Apuntado')
      + list(toggle('aimManual', 'Apuntar a mano', 'Tus ataques van hacia el ratón (o hacia donde empujes el stick derecho del mando) en vez de al enemigo más cercano. Si sueltas el stick y no mueves el ratón, vuelve a apuntar solo. La cadena y los meteoros siguen buscando a los enemigos solos.')))
      + section('Ver mejor el combate')
      + list(choice('ownFx', [[1, 'Normal'], [0.6, 'Suaves'], [0.35, 'Muy suaves']], 'Transparencia de tus ataques',
          'Tus ataques se ven más transparentes para que veas mejor los disparos y avisos de los enemigos.'),
        toggle('hazardHi', 'Avisos de alto contraste', 'Los avisos de ataques enemigos en el suelo salen en blanco y negro con rayas en vez del color del tipo, y los disparos enemigos llevan un aro amarillo. Para daltónicos.'));
  }

  function aboutTab() {
    const ext = G.UI.svg('external', 18);
    const link = (href, txt, attrs) => `<a class="btn small ghost ic" href="${href}" target="_blank"${attrs || ''}><span>${txt}</span>${ext}</a>`;
    return `<div class="about-hero"><img src="assets/icons/icon-192.png" width="64" height="64" alt="">`
      + `<div class="wordmark" translate="no">PokéSurvivor</div><span class="badge ghost">Versión ${esc(VERSION)}</span>`
      + `<p>Juego de fans <b>gratuito y sin ánimo de lucro</b>: sin anuncios ni compras. Pokémon y sus personajes son propiedad de Nintendo, Creatures y GAME FREAK; este proyecto no está afiliado a ellos.</p></div>`
      // Instalar como app (install-ui.js abre los pasos; abierto ya como app no sale).
      + (G.InstallUI && G.InstallUI.can() ? list(action('Instalar como app', 'Pantalla completa y sin las barras del navegador, abriéndolo desde su icono.',
            '<button class="btn small gold" type="button" data-install>Instalar</button>')) : '')
      + section('Créditos')
      + `<ul class="credits">
           <li><b>Sprites:</b> PMD SpriteCollab y sus artistas (CC BY-NC 4.0).</li>
           <li><b>Datos de los Pokémon:</b> PokéAPI.</li>
           <li><b>Iconos de objetos:</b> Pokémon (Nintendo, Creatures, GAME FREAK), vía PokeAPI/sprites.</li>
           <li><b>Música y sonidos:</b> originales, generados por el propio juego.</li>
           <li><b>Fuentes:</b> Fredoka, Nunito y Pixelify Sans (OFL).</li>
         </ul>`
      + section('Enlaces')
      + `<div class="about-links">
           ${window.PS_PAGES ? link(G.I18n.lang === 'en' ? 'en/guide/' : 'guia/', 'Guía y preguntas')
             + link(G.I18n.lang === 'en' ? 'en/pokedex/' : 'pokedex/', 'Pokédex') : ''}
           <button class="btn small ghost ic" type="button" data-legal><span>Aviso legal y privacidad</span>${G.UI.svg('chevron', 18)}</button>
           ${link('contacto/', 'Contacto', ' rel="noopener"')}
           ${link(REPO, 'Código (GitHub)', ' rel="noopener"')}
         </div>`;
  }

  function render() {
    if (tab !== 'ctl') { stopBind(); keyMsg = ''; }
    document.querySelectorAll('#set-nav .set-tab').forEach(b => {
      const on = b.dataset.t === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      // En el móvil de pie las pestañas se deslizan: la elegida, a la vista.
      if (on && b.parentElement.scrollWidth > b.parentElement.clientWidth) {
        try { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* nada */ }
      }
    });
    const box = $('set-body');
    box.setAttribute('aria-labelledby', 'set-tab-' + tab);
    box.scrollTop = 0;
    if (tab === 'sound') box.innerHTML = soundTab();
    else if (tab === 'gfx') box.innerHTML = gfxTab();
    else if (tab === 'ctl') box.innerHTML = ctlTab();
    else if (tab === 'a11y') box.innerHTML = a11yTab();
    else if (tab === 'acc') renderAccount(box);
    else box.innerHTML = aboutTab();
    wire(box);
  }

  function renderAccount(box) {
    const st = G.DB.guest ? 'guest' : G.DB.syncState;
    // Lo mismo que el punto de la barra de arriba (ui.js): a la nube sólo se sube con Guardar.
    const SYNC = { ok: 'Guardado en la nube', syncing: 'Guardando…', pending: 'Sin guardar en la nube: pulsa Guardar',
                   offline: 'Sin conexión: pulsa Guardar cuando vuelva', local: 'Guardado sólo en este navegador', guest: 'Invitado: no se guarda' };
    if (G.DB.guest) {
      box.innerHTML = section('Cuenta')
        + `<div class="acc-hero"><span class="ico-tile l round">${G.Icons.html('user', 34)}</span>`
        + '<div class="grow"><p>Estás jugando como <b>invitado</b>: tu progreso no se guarda al salir.</p></div></div>'
        + '<div class="set-acts"><button type="button" class="btn gold" id="set-login">Crear cuenta o entrar</button></div>';
      return;
    }
    const nick = G.Social.me ? G.Social.me.name : (G.DB.user || '');
    const cloud = G.DB.mode === 'cloud', named = cloud && G.DB.nameAccount, mail = cloud ? G.DB.email : '';
    const MAIL = s => `<span class="set-val" translate="no">${esc(s)}</span>`;
    // Con qué cuenta has entrado: con otro Gmail sería otra partida (#139).
    const who = !cloud ? `<span class="set-val">${esc('Cuenta de este navegador')}</span>`
      : named ? `<span class="set-val">${esc('Cuenta con nombre y contraseña')}</span>` : MAIL(mail || 'Google');
    const row = (name, desc, val) => `<div class="list-row set-row set-kv">${label(name, desc && esc(desc))}${val}</div>`;
    box.innerHTML = section('Cuenta')
      // El apodo, en grande (es único y no se puede cambiar).
      + `<div class="acc-hero"><span class="ico-tile l round t-gold">${G.Icons.html('crown', 60)}</span>`
      + `<div class="grow"><p class="eyebrow">Apodo</p><b class="acc-nick" translate="no">${esc(nick)}</b><small>Es único y no se puede cambiar.</small></div></div>`
      + list(row('Has entrado con', cloud && !named ? 'Cuenta de Google. Con otro Gmail tendrías otra partida.' : '', who),
        named ? row('Gmail vinculado', G.DB.hasGoogle ? 'Si olvidas la contraseña, entra con Google.' : 'Vincúlalo para entrar con Google si olvidas la contraseña.',
          G.DB.hasGoogle ? MAIL(mail || 'Google') : '<button type="button" class="btn small" id="set-link">Vincular Gmail</button>') : '',
        row('Partida', cloud ? 'La nube se actualiza al pulsar Guardar, antes de una actualización automática y al cerrar sesión. Pulsa Guardar antes de cambiar de aparato.' : '',
          `<span class="set-val acc-sync"><i class="sync ${st}"></i><span>${esc(SYNC[st] || st)}</span></span>`))
      + `<div class="set-acts">${cloud && st !== 'ok' && st !== 'syncing' ? '<button type="button" class="btn gold" id="set-save">Guardar</button>' : ''}
           <button type="button" class="btn" id="set-logout">Cerrar sesión</button></div>`
      + '<div class="acc-danger"><button type="button" class="btn danger" id="set-delete">Borrar cuenta</button></div>'
      + '<p class="note set-note" id="set-msg" role="alert"></p>';
  }

  function wire(box) {
    // Interruptores: se cambia el ajuste y la fila en su sitio.
    box.querySelectorAll('.set-switch[data-k]').forEach(b => {
      b.onclick = () => {
        const v = !G.Settings.get(b.dataset.k);
        G.Settings.set(b.dataset.k, v);
        b.setAttribute('aria-checked', String(v));
        G.Audio.sfx('click');
      };
    });
    // Segmentos: el valor (número si lo es) y la opción encendida.
    box.querySelectorAll('.set-seg [data-k]').forEach(b => {
      b.onclick = () => {
        const v = b.dataset.v;
        G.Settings.set(b.dataset.k, isNaN(+v) ? v : +v);
        for (const o of b.parentElement.children) { o.classList.toggle('on', o === b); o.setAttribute('aria-checked', String(o === b)); }
        G.Audio.sfx('click');
      };
    });
    // Volumen: la cifra y el relleno de la barra siguen al valor.
    box.querySelectorAll('input[data-vol]').forEach(r => {
      r.oninput = () => {
        G.Audio.setVolume(r.dataset.vol, r.value / 100);
        r.style.setProperty('--v', r.value + '%');
        const o = $(r.id + '-v'); if (o) o.textContent = r.value + ' %';
      };
      r.onchange = () => G.Audio.sfx('click');
    });
    const mute = $('set-mute'); if (mute) mute.onclick = toggleMute;
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
      if (isOpen() && tab === 'acc') keep();
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
