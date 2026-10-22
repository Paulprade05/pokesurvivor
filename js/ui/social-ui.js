/* ============ social-ui.js — apodo, amigos, sala e invitaciones ============
 * Pantallas en hoja (docs/DISENO.md §4): Amigos y Sala; el Apodo es una tarjeta
 * centrada y la invitación, un aviso arriba. Los estilos, en style.css
 * («pantallas: social»).
 */
(() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Iconos: objetos (G.Icons) y controles (G.UI.svg). Con guarda: los tests cargan
  // este archivo con una interfaz de juguete, sin ellos.
  const ico = (n, s, cls) => (G.Icons ? G.Icons.html(n, s, cls) : '');
  const svg = (n, s) => (G.UI.svg ? G.UI.svg(n, s) : '');

  /** Avatar redondo con la inicial del apodo (los amigos no tienen foto); el color sale del nombre. */
  function avatar(name) {
    const s = String(name || '?');
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    // translate="no": es una letra del apodo (en chino, la «O» sola se traducía por «或»).
    return `<span class="fr-av av-${h % 6}" aria-hidden="true" translate="no">${esc([...s][0].toUpperCase())}</span>`;
  }

  /** ¿Se puede usar lo online? Si no, explica por qué. */
  function needOnline() {
    if (G.DB.online) return true;
    G.UI.toast(G.DB.guest ? 'Crea una cuenta para jugar con amigos y salir en el ranking.'
      : 'Esto necesita la versión online del juego (con la nube).', 3200);
    return false;
  }

  // ======================= APODO =======================

  G.NickUI = (() => {
    let then = null, skipped = false;
    let chars = null;          // las letras que valen (G.Social.VALID sin el largo)

    function init() {
      $('nick-ico').innerHTML = ico('friends', 60);
      $('nick-in').oninput = rules;
      $('nick-form').onsubmit = async e => {
        e.preventDefault();
        $('nick-err').textContent = '';
        $('nick-ok').disabled = true;
        const r = await G.Social.claimNick($('nick-in').value);
        $('nick-ok').disabled = false;
        if (!r.ok) { $('nick-err').textContent = r.error; G.Audio.sfx('error'); return; }
        G.Audio.sfx('confirm');
        G.UI.toast('Tu apodo es ' + G.Social.me.name);
        const cb = then; then = null;
        if (cb) cb(); else G.MenuUI.open();
      };
      $('nick-later').onclick = () => { skipped = true; then = null; G.MenuUI.open(); };
    }

    /** Las normas, a la vista mientras escribes: el largo y las letras (lo de «nadie más» lo dice el servidor al guardar). */
    function rules() {
      const v = $('nick-in').value.trim(), n = [...v].length;
      if (!chars && G.Social.VALID) chars = new RegExp(G.Social.VALID.source.replace(/\{\d+,\d+\}/, '*'));
      $('nick-count').textContent = n + '/16';
      const mark = (id, ok) => { const li = $(id); li.classList.toggle('ok', n > 0 && ok); li.classList.toggle('bad', n > 0 && !ok); };
      mark('nick-r-len', n >= 3 && n <= 16);
      mark('nick-r-chr', !chars || chars.test(v));
    }

    /** @param next  qué abrir después de elegirlo */
    function open(next) {
      then = next || null;
      G.UI.show('scr-nick');
      $('nick-err').textContent = '';
      $('nick-in').value = '';
      rules();
      if (!G.Touch.active) setTimeout(() => $('nick-in').focus(), 50);   // en el móvil, sin abrir el teclado solo
    }

    return { init, open, get skipped() { return skipped; } };
  })();

  /** Abre `fn` si tienes apodo; si no, pide el apodo primero. */
  function withNick(fn) {
    if (!needOnline()) return;
    if (G.Social.me) { fn(); return; }
    G.Social.start().then(r => { if (r === 'ok') fn(); else G.NickUI.open(fn); });
  }

  // ======================= AMIGOS =======================

  /** Copia un texto: con el portapapeles del navegador o, si no deja, a la antigua. */
  function copyText(text, okMsg) {
    const done = ok => G.UI.toast(ok ? okMsg : 'No se pudo copiar: cópialo a mano', 2400);
    const old = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* nada */ }
      ta.remove();
      done(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), old);
    else old();
  }

  /** Botón para una fila (icono SVG y, si lleva, texto en <span>). label: su aria-label y title. */
  function actBtn(html, cls, label, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.innerHTML = html; b.onclick = fn;
    if (label) { b.title = label; b.setAttribute('aria-label', label); }
    return b;
  }

  G.FriendsUI = (() => {
    let meKey = '';

    function init() {
      // Con hueco para lo que se pega con el apodo (una @, espacios o caracteres
      // invisibles): Social.request lo limpia antes de buscarlo.
      $('fr-name').maxLength = 40;
      $('fr-add').onsubmit = async e => {
        e.preventDefault();
        const name = $('fr-name').value;
        msg('');
        const r = await G.Social.request(name);
        msg(r.ok ? r.msg : r.error, !r.ok);
        if (r.ok) $('fr-name').value = '';
      };
      $('fr-room').onclick = () => G.LobbyUI.open();
      G.Social.on(() => { if (G.UI.isOpen('scr-friends')) render(); });
    }

    function msg(t, bad) {
      $('fr-msg').textContent = t || '';
      $('fr-msg').classList.toggle('bad', !!bad);
      if (t) G.Audio.sfx(bad ? 'error' : 'confirm');
    }

    function open() {
      withNick(() => {
        G.UI.show('scr-friends', true); msg(''); meKey = ''; render();
        G.Social.ensureFriends().then(() => { if (G.UI.isOpen('scr-friends')) render(); });
        G.Social.repairNick();              // una vez por sesión: que te puedan encontrar
      });
    }

    /** Tu tarjeta: tu compañero, tu apodo bien grande y «Copiar» (es lo que tus amigos tienen que escribir). */
    function renderMe() {
      const nick = G.Social.me ? G.Social.me.name : '';
      const s = G.DB.save || {}, dex = s.partner;
      const shiny = !!s.partnerShiny && !!G.DB.ownsShiny && G.DB.ownsShiny(dex);
      const key = nick + '|' + dex + '|' + shiny;
      if (key === meKey) return;            // (si no cambia, el sprite no se rehace)
      meKey = key;
      const box = $('fr-me');
      box.innerHTML = '<span class="fr-me-av" aria-hidden="true"></span><span class="eyebrow">Tu apodo</span>' +
        `<b class="fr-me-name" translate="no">${esc(nick)}</b>` +
        '<button type="button" id="fr-copy" class="btn small ghost">Copiar</button>' +
        '<small>Dáselo a tus amigos para que te añadan.</small>';
      // A ×2 como en la Sala; los grandes salen centrados y recortados por el círculo.
      if (G.DEX_BY[dex]) box.firstChild.appendChild(G.UI.spriteCanvas(dex, 64, 64, { scale: 2, shiny }));
      $('fr-copy').onclick = () => copyText(nick, 'Apodo copiado');
    }

    // (Sin "en línea" desde el 20-10-2026: costaba 1/4 de las escrituras de Firestore.)
    function row(f, room) {
      const el = document.createElement('div');
      el.className = 'list-row fr-item ' + f.status;
      const inRoom = !!room && room.members.some(m => m.uid === f.uid);
      const sub = f.status === 'in' ? 'Quiere ser tu amigo' : f.status === 'out' ? 'Solicitud enviada' : inRoom ? 'En tu sala' : '';
      const who = avatar(f.name) + `<span class="grow"><b translate="no">${esc(f.name)}</b>` +
        (sub ? `<small${inRoom ? ' class="ok"' : ''}>${sub}</small>` : '') + '</span>';
      // Con un amigo de verdad, tocar su nombre abre su perfil.
      el.innerHTML = f.status === 'ok' ? `<button type="button" class="fr-who" title="Ver su perfil">${who}</button>` : `<span class="fr-who">${who}</span>`;
      if (f.status === 'ok') el.firstChild.onclick = () => G.ProfileUI.show(f.uid);
      const acts = document.createElement('span');
      acts.className = 'fr-acts';
      const add = (...a) => acts.appendChild(actBtn(...a));
      if (f.status === 'in') {
        add(svg('check'), 'icon-btn gold', 'Aceptar', async () => { const r = await G.Social.accept(f.uid); msg(r.ok ? r.msg : r.error, !r.ok); });
        add(svg('close'), 'icon-btn', 'Rechazar', () => G.Social.remove(f.uid));
      } else if (f.status === 'out') {
        add(svg('close'), 'icon-btn plain', 'Cancelar', () => G.Social.remove(f.uid));
      } else {
        if (!inRoom && (!room || room.isHost)) {
          add(svg('plus', 18) + '<span>Invitar</span>', 'btn small ic', '', async () => {
            const r = await G.Social.invite(f.uid);
            msg(r.ok ? r.msg : r.error, !r.ok);
            if (r.ok) G.LobbyUI.open();
          });
        }
        add(svg('close'), 'icon-btn plain', 'Quitar', () => { if (confirm('¿Quitar a ' + f.name + ' de tus amigos?')) G.Social.remove(f.uid); });
      }
      el.appendChild(acts);
      return el;
    }

    function render() {
      const room = G.Social.room;
      renderMe();
      $('fr-room').classList.toggle('hidden', !room);
      const all = G.Social.friends;
      const box = $('fr-list');
      box.innerHTML = '';
      if (!all.length) {
        box.innerHTML = `<div class="empty-state"><span class="ico-tile l round t-blue">${ico('friends', 60)}</span>` +
          '<b>Aún no tienes amigos añadidos.</b><span>Añade a alguien por su apodo.</span></div>';
        return;
      }
      // Primero lo que espera respuesta (solicitudes), luego tus amigos y lo que has enviado.
      const group = (title, st, hot) => {
        const list = all.filter(f => f.status === st).sort((a, b) => a.name.localeCompare(b.name));
        if (!list.length) return;
        const sec = document.createElement('section');
        sec.className = 'fr-sec';
        sec.innerHTML = `<h3 class="fr-h"><span>${title}</span><span class="badge${hot ? '' : ' ghost'}">${list.length}</span></h3><div class="list"></div>`;
        for (const f of list) sec.lastChild.appendChild(row(f, room));
        box.appendChild(sec);
      };
      group('Solicitudes', 'in', true);
      group('Tus amigos', 'ok');
      group('Solicitudes enviadas', 'out');
    }

    return { init, open, render };
  })();

  // ======================= SALA =======================

  G.LobbyUI = (() => {
    let membersKey = '';
    // "¡Estoy listo!" (#97): va sólo por la conexión directa, sin escribir nada en la
    // base de datos. Invitado: lo suyo (se repite al conectar con el anfitrión y se
    // quita al irse al menú o al empezar). Anfitrión: lo de cada invitado; las
    // versiones viejas no lo mandan y no cuentan.
    let ready = false, readyRoom = '';
    const readyBy = new Map();

    function sendReady() {
      const room = G.Social.room;
      if (!room || room.isHost) return;
      if (room.id !== readyRoom) { readyRoom = room.id; ready = false; }     // en otra sala, otra vez sin listo
      G.Net.toHost({ k: 'rdy', on: ready ? 1 : 0 });
    }
    function setReady(on) {
      readyRoom = G.Social.room ? G.Social.room.id : '';
      ready = on; sendReady();
      if (G.UI.isOpen('scr-lobby')) render();
    }

    function init() {
      $('lobby-leave').onclick = async () => {
        ready = false;
        await G.Social.leaveRoom();
        G.Net.close();
        G.MenuUI.open();
      };
      $('lobby-menu').onclick = () => { if (ready) setReady(false); G.MenuUI.open(); };
      $('lobby-start').onclick = start;
      $('lobby-start').dataset.sfx = 'confirm';
      // El botón del invitado, junto al de empezar (que sólo ve el anfitrión), en el pie de la hoja.
      const rb = document.createElement('button');
      rb.id = 'lobby-ready'; rb.type = 'button'; rb.className = 'btn gold hidden'; rb.dataset.sfx = 'confirm';
      rb.onclick = () => setReady(!ready);
      $('lobby-start').after(rb);
      G.Net.on((from, msg) => {
        if (!msg || msg.k !== 'rdy') return;               // (llega cada envío de la partida: lo primero)
        const room = G.Social.room;
        if (!room || !room.isHost) return;
        readyBy.set(from, !!msg.on);
        if (G.UI.isOpen('scr-lobby')) render();
      });
      // Conecta / desconecta la red al entrar o salir de una sala.
      G.Social.on(what => {
        const room = G.Social.room;
        // En plena partida, un corte breve con la base de datos puede borrar la sala o
        // una plaza aunque la conexión directa siga bien (#253): no se suelta a nadie
        // ni se cierra la red; se hace al acabar la partida (G.Flow.afterRun / LobbyUI.open).
        const playing = G.Coop.active;
        if (room) {
          G.Net.open(room.id, room.isHost, room.host);
          G.Net.syncMembers(room.members.map(m => m.uid), playing);
        } else if (G.Net.open_) {
          // (Sin sala no hay señalización: se sigue con los que están conectados y no
          // se reintenta a nadie, que sólo gastaría huecos del TURN.)
          if (playing) G.Net.syncMembers([], true); else G.Net.close();
        }
        if (what === 'room-closed' && !playing) {
          G.UI.toast('La sala se ha cerrado', 2600);
          if (G.UI.isOpen('scr-lobby')) G.MenuUI.open();
        }
        if (G.UI.isOpen('scr-lobby')) render();
      });
      G.Net.onPeer((u, mode) => {
        const room = G.Social.room;
        if (room && !room.isHost && u === room.host && mode === 'direct') sendReady();
        if (G.UI.isOpen('scr-lobby')) render();
      });
    }

    function open() {
      if (!G.Social.room) { G.MenuUI.open(); return; }
      // Tras una partida: se suelta a quien ya no está en la sala (en partida se le mantenía).
      G.Net.syncMembers(G.Social.room.members.map(m => m.uid));
      G.Social.refreshMember();
      G.Social.ensureFriends().then(() => { if (G.UI.isOpen('scr-lobby')) { membersKey = ''; render(); } });
      G.UI.show('scr-lobby', true);
      membersKey = '';
      sendReady();
      render();
    }

    /** Empieza la partida: nadie sigue "listo" para la siguiente. */
    function close() { ready = false; readyBy.clear(); G.UI.hide('scr-lobby'); }

    /** Estado de la conexión de un jugador: [texto, clase de color de su chip]. */
    function connState(m, room) {
      if (m.uid === room.host) return ['Anfitrión', 'host'];
      if (!room.isHost) return m.uid === G.Social.uid ? ['Tú', 'me'] : ['En la sala', ''];
      const mode = G.Net.mode(m.uid);
      // (Sin WebRTC en este navegador no se reintenta: no serviría.)
      if (mode === 'direct') return [G.Net.viaTurn(m.uid) ? 'Conectado (por servidor)' : 'Conectado', 'ok'];
      if (mode === 'relay') return ['Conectado (por servidor)', 'ok'];
      if (mode === 'failed') return [G.Net.noRtc ? 'No se pudo conectar' : 'No se pudo conectar (reintentando…)', 'bad'];
      return ['Conectando…', 'wait'];
    }

    function render() {
      const room = G.Social.room;
      if (!room) return;
      const ms = room.members;
      $('lobby-sub').textContent = room.isHost
        ? 'Eres el anfitrión. Invita a tus amigos (hasta ' + G.Social.MAX_PLAYERS + ') y empezad cuando estéis.'
        : 'Estás en la sala de ' + ((ms.find(m => m.uid === room.host) || {}).name || '…') + '. El anfitrión empezará la partida.';

      // Las tarjetas sólo se rehacen si cambian los miembros (los sprites no parpadean).
      const key = ms.map(m => m.uid + ':' + m.dex + ':' + (m.shiny ? 1 : 0)).join('|');
      const box = $('lobby-members');
      if (key !== membersKey) {
        membersKey = key;
        box.innerHTML = '';
        for (let i = 0; i < G.Social.MAX_PLAYERS; i++) {
          const m = ms[i];
          const c = document.createElement('div');
          c.className = 'lob-slot' + (m ? '' : ' empty');
          if (m) {
            // El color de cada jugador es el de su aro en la partida.
            if (G.Coop.COLORS[i]) c.style.setProperty('--pc', G.Coop.COLORS[i]);
            if (m.uid === room.host) c.insertAdjacentHTML('beforeend', `<span class="lob-crown ico-tile s round t-gold" title="Anfitrión">${ico('crown', 30)}</span>`);
            c.appendChild(G.UI.spriteCanvas(m.dex, 112, 84, { scale: 2, lively: true, shiny: !!m.shiny }));
            c.insertAdjacentHTML('beforeend', `<b translate="no">${esc(m.name)}</b><small class="lob-mon">${esc((G.DEX_BY[m.dex] || {}).name || '')}</small>` +
              `<span class="lob-chips"><span class="conn" data-u="${esc(m.uid)}"></span>` +
              (m.uid !== room.host ? `<span class="conn rdy" data-r="${esc(m.uid)}"></span>` : '') + '</span>');
          } else c.innerHTML = `<span class="ico-tile round">${ico('ball', 30, 'ico-off')}</span><span>Libre</span>`;
          box.appendChild(c);
        }
      }
      box.querySelectorAll('.conn[data-u]').forEach(el => {
        const m = ms.find(x => x.uid === el.dataset.u);
        if (!m) return;
        const [t, st] = connState(m, room);
        el.textContent = t;
        el.className = 'conn' + (st ? ' ' + st : '');
      });
      // Listo o no: el anfitrión lo sabe de cada invitado (vacío si su versión no lo dice);
      // cada invitado ve el suyo en su tarjeta.
      if (room.isHost) for (const u of [...readyBy.keys()]) if (!ms.some(m => m.uid === u)) readyBy.delete(u);
      const on = ready && readyRoom === room.id;
      box.querySelectorAll('.rdy').forEach(el => {
        const u = el.dataset.r;
        const r = room.isHost ? readyBy.get(u) : u === G.Social.uid && on ? true : undefined;
        el.textContent = r === undefined ? '' : r ? 'Listo' : 'No está listo';
        el.className = 'conn rdy' + (r === undefined ? '' : r ? ' ok' : ' wait');
        const card = el.closest && el.closest('.lob-slot');
        if (card) card.classList.toggle('ready', r === true);
      });
      const rb = $('lobby-ready');
      rb.classList.toggle('hidden', room.isHost);
      rb.classList.toggle('gold', !on); rb.classList.toggle('ghost', on);
      rb.textContent = on ? 'No estoy listo' : '¡Estoy listo!';

      // Invitar (sólo el anfitrión y si queda sitio).
      const canInvite = room.isHost && ms.length < G.Social.MAX_PLAYERS;
      $('lobby-inv').classList.toggle('hidden', !canInvite);
      const inv = $('lobby-invite');
      if (canInvite) {
        inv.innerHTML = '';
        const free = G.Social.friends.filter(f => f.status === 'ok' && !ms.some(m => m.uid === f.uid));
        if (!free.length) inv.innerHTML = '<p class="lob-none">Aún no tienes amigos añadidos.</p>';
        for (const f of free) {
          const el = document.createElement('div');
          el.className = 'list-row fr-item';
          el.innerHTML = `<span class="fr-who">${avatar(f.name)}<span class="grow"><b translate="no">${esc(f.name)}</b></span></span>`;
          el.appendChild(actBtn(svg('plus', 18) + '<span>Invitar</span>', 'btn small ic', '', async () => {
            const r = await G.Social.invite(f.uid); G.UI.toast(r.ok ? r.msg : r.error);
          }));
          inv.appendChild(el);
        }
      }

      const btn = $('lobby-start');
      btn.classList.toggle('hidden', !room.isHost);
      const connecting = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'connecting');
      const failed = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'failed');
      btn.disabled = !room.isHost || ms.length < 2 || connecting || failed;
      btn.textContent = 'Empezar partida (' + ms.length + '/' + G.Social.MAX_PLAYERS + ')';
      const note = $('lobby-note');
      note.textContent = G.Net.noRtc ? 'Este navegador no permite jugar en grupo (WebRTC está desactivado o bloqueado). Prueba con otro navegador.'
        : !room.isHost ? 'Cuando el anfitrión empiece, entraréis todos a la vez.'
        : ms.length < 2 ? 'Necesitas al menos un amigo en la sala.'
        : failed ? 'No se puede conectar con algún amigo: su red (o la tuya) no deja jugar en grupo. Probad con otra wifi o datos móviles; se reintenta solo.'
        : connecting ? 'Conectando con tus amigos…' : 'La partida empieza para todos a la vez.';
      note.classList.toggle('warn', !!G.Net.noRtc || (room.isHost && failed));
    }

    function start() {
      const room = G.Social.room;
      if (!room || !room.isHost || room.members.length < 2) return;
      // Alguien no ha dicho que está listo: se pregunta (el botón no se bloquea).
      const notReady = room.members.filter(m => m.uid !== room.host && readyBy.get(m.uid) === false).map(m => m.name);
      if (notReady.length && !confirm('Sin pulsar «¡Estoy listo!»: ' + notReady.join(', ') + '. ¿Empezar igualmente?')) return;
      const cfg = {
        k: 'start', seed: Math.floor(Math.random() * 1e6), host: room.host,
        members: room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny }))
      };
      G.Social.setOpen(false);
      G.Net.broadcast(cfg);
      G.Flow.startCoop(cfg);
    }

    return { init, open, close, render };
  })();

  // ======================= INVITACIONES =======================

  G.InvitePop = (() => {
    let cur = null;

    function init() {
      $('inv-ico').innerHTML = ico('friends', 30);
      $('inv-yes').onclick = async () => {
        if (!cur) return;
        const from = cur.from;
        hide();
        const r = await G.Social.acceptInvite(from);
        if (!r.ok) { G.UI.toast(r.error, 3000); return; }
        G.LobbyUI.open();
      };
      $('inv-no').onclick = () => { if (cur) G.Social.declineInvite(cur.from); hide(); };
      G.Social.on(what => { if (what === 'invites' || what === 'room') refresh(); });
    }

    function hide() { cur = null; $('invite-pop').classList.add('hidden'); }

    /** Enseña la invitación más antigua si estás en los menús (no en plena partida). */
    function refresh() {
      const room = G.Social.room;
      const list = G.Social.invites.filter(i => !room || i.room !== room.id).sort((a, b) => a.at - b.at);
      if (!list.length || G.Game.state !== 'ui' || !G.DB.loggedIn) { hide(); return; }
      if (cur && cur.from === list[0].from) return;
      cur = list[0];
      $('inv-text').innerHTML = `<b translate="no">${esc(cur.name)}</b> te invita a jugar en su sala`;
      $('invite-pop').classList.remove('hidden');
      G.Audio.sfx('shiny');
    }

    return { init, refresh };
  })();

  // ======================= ESC =======================

  /** La pantalla que se ve por encima (como en gamepad.js): la de mayor z-index y, si empatan, la última. */
  function topScreen() {
    let top = null, tz = -Infinity;
    for (const s of document.querySelectorAll('.scr:not(.hidden)')) {
      const z = parseInt(getComputedStyle(s).zIndex, 10) || 0;
      if (z >= tz) { tz = z; top = s; }
    }
    return top;
  }

  /**
   * Esc en el Apodo, la Sala o Moderación pulsa su botón de volver (de Amigos y
   * Ranking ya se encarga game.js). Se para aquí: si llegara a input.js, game.js
   * haría además lo suyo con la pantalla a la que se vuelve.
   */
  function wireEsc() {
    if (typeof addEventListener !== 'function' || typeof document.querySelectorAll !== 'function') return;
    const BACK = { 'scr-nick': 'nick-later', 'scr-lobby': 'lobby-menu', 'scr-mod': 'mod-back' };
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.repeat || e.isComposing || !G.Game || G.Game.state !== 'ui' || G.UI.tabBlocked()) return;
      // Ese Esc ya lo ha usado otro (ui.js cierra el menú «Más» antes que esto y lo para).
      if (e.cancelBubble) return;
      const bar = $('topbar');
      if (bar && bar.classList.contains('more-open')) return;          // (ese Esc cierra el menú «Más»: ui.js)
      const top = topScreen(), id = top && BACK[top.id];
      if (!id) return;
      e.stopPropagation(); e.preventDefault();
      $(id).click();
    }, true);
  }

  G.SocialUI = {
    init() { G.NickUI.init(); G.FriendsUI.init(); G.LobbyUI.init(); G.InvitePop.init(); wireEsc(); },
    withNick, needOnline
  };
})();
