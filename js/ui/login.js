/* ============ login.js — inicio: entrar, crear cuenta o invitado ============ */
G.LoginUI = (() => {
  const $ = G.UI.$;
  let mode = 'login';

  function init() {
    document.querySelectorAll('#scr-login .tab').forEach(t => {
      t.onclick = () => setMode(t.dataset.tab);
    });
    $('login-form').onsubmit = async e => {
      e.preventDefault();
      $('login-err').textContent = '';
      $('btn-auth').disabled = true;
      const fn = mode === 'login' ? G.DB.login : G.DB.register;
      const r = await fn($('f-user').value, $('f-pass').value);
      $('btn-auth').disabled = false;
      if (!r.ok) { $('login-err').textContent = r.error; return; }
      $('f-pass').value = '';
      G.Flow.afterLogin();
    };
    $('btn-guest').onclick = () => { G.DB.playAsGuest(); G.Flow.afterLogin(); };
    $('f-forgot').onclick = e => {
      e.preventDefault();
      $('login-err').textContent = '';
      $('forgot-note').classList.toggle('hidden');
    };
    // Vincular Gmail para poder recuperar la cuenta (ver offerRecovery).
    $('rec-link').onclick = async () => {
      $('rec-err').textContent = '';
      $('rec-link').disabled = true;
      const r = await G.DB.linkGoogle();
      $('rec-link').disabled = false;
      if (!r.ok) { $('rec-err').textContent = r.error; return; }
      $('scr-recover').classList.add('hidden');
      G.UI.toast('¡Gmail vinculado! Si olvidas la contraseña, entra con Google.', 4500);
    };
    $('rec-later').onclick = () => $('scr-recover').classList.add('hidden');
    $('rec-never').onclick = e => {
      e.preventDefault();
      try { localStorage.setItem('ps.recover.no.' + G.DB.fb.uid, '1'); } catch (err) { /* nada */ }
      $('scr-recover').classList.add('hidden');
    };
    // Icono de la ventana: la Banda Focus (la que te salva de quedarte sin nada).
    $('rec-ico').innerHTML = G.Icons.html('focussash', 60);
    // Esc: «Ahora no» en la de recuperar la cuenta y «Entendido» en los avisos.
    addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const btn = !$('scr-recover').classList.contains('hidden') ? $('rec-later')
        : !$('scr-savenote').classList.contains('hidden') ? $('savenote-ok') : null;
      if (!btn) return;
      e.stopPropagation(); e.preventDefault(); btn.click();
    }, true);
    $('btn-google').onclick = async () => {
      $('login-err').textContent = '';
      $('btn-google').disabled = true;
      const r = await G.DB.loginWithGoogle();
      $('btn-google').disabled = false;
      if (!r.ok) { $('login-err').textContent = r.error; return; }
      G.Flow.afterLogin();
    };
  }

  /**
   * Al entrar (o recién creada la cuenta) con nombre y contraseña, si aún no
   * hay Gmail vinculado: "¿te da miedo perder tu cuenta?". Una vez por sesión,
   * hasta que lo vincule o diga que no le vuelvan a preguntar.
   */
  let offered = false;
  function offerRecovery() {
    if (offered || G.DB.mode !== 'cloud' || !G.DB.fb || !G.DB.nameAccount || G.DB.hasGoogle) return;
    try { if (localStorage.getItem('ps.recover.no.' + G.DB.fb.uid)) return; } catch (e) { /* nada */ }
    offered = true;
    $('rec-err').textContent = '';
    $('scr-recover').classList.remove('hidden');
  }

  /*
   * Avisos de una actualización: cada uno sale una vez por navegador, la
   * primera vez que se entra al menú después de subirla; si hay varios,
   * uno tras otro. Para uno nuevo, se añade aquí con su propia clave.
   */
  const cloud = () => G.DB.mode === 'cloud' && !G.DB.guest;
  const NOTES = [
    // Guardado (26-10-2026): ya no hay botón Guardar arriba, la partida se sube sola (db.js,
    // guardado automático de esta copia). Los avisos .1 y .2 pedían pulsar Guardar: con otra
    // clave (.3) se cuenta a todos que ya no hace falta y dónde queda el botón, por si acaso.
    // ico: el icono de la ventana (G.Icons; los de objeto a 60 px, los SVG a 40).
    { key: 'ps.savenote.3', when: cloud, ico: 'save',
      title: ['Tu partida ya se guarda sola', 'Your game now saves itself'],
      body: ['<p>Ya no hace falta pulsar Guardar: lo que consigues se sube <b>solo a la nube</b> a los pocos segundos y al cerrar el juego.</p>' +
             '<p>Si quieres asegurarte antes de cambiar de aparato, tienes <b class="gold">Guardar</b> en <b>Ajustes → Cuenta</b>.</p>',
             '<p>You no longer need to press Save: your progress is uploaded <b>to the cloud automatically</b> after a few seconds and when you close the game.</p>' +
             '<p>If you want to be sure before switching devices, there is a <b class="gold">Save</b> button in <b>Settings → Account</b>.</p>'] },
    { key: 'ps.ranknote.1', when: () => cloud() && ((G.DB.save.stats || {}).runs || 0) > 0, ico: 'trophy',   // rankings desde cero (18-10-2026)
      title: ['Los rankings se han reiniciado', 'The leaderboards have been reset'],
      body: ['<p>Hemos ajustado la <b>Sentencia de Arceus</b>: huir corriendo con toda la velocidad subida y el veneno ya no sirven para aguantar para siempre.</p>' +
             '<p>Para que todos compitáis en igualdad, <b>todos los rankings empiezan de cero</b> (hoy, semana, mes, año e histórico). ¡A por el primer puesto!</p>',
             '<p>We have adjusted the <b>Judgment of Arceus</b>: running away with maxed-out speed and poison no longer let you last forever.</p>' +
             '<p>So everyone competes on equal terms, <b>all leaderboards start from scratch</b> (daily, weekly, monthly, yearly and all-time). Go for first place!</p>'] }
  ];
  /** → true si se ha enseñado alguno. */
  function updateNotices() {
    const queue = NOTES.filter(n => { try { return n.when() && !localStorage.getItem(n.key); } catch (e) { return false; } });
    if (!queue.length) return false;
    const en = G.I18n.lang === 'en' ? 1 : 0;
    // Otros idiomas: título, aviso y botón de su diccionario (el aviso entero: por trozos
    // sale raro); si falta, en inglés. La caja va con translate="no" (dev.html).
    const other = G.I18n.lang !== 'es' && !en;
    const pick = (es, eng) => (!other ? (en ? eng : es) : G.I18n.has(es) ? G.T(es) : eng);
    const next = () => {
      const n = queue.shift();
      if (!n) { $('scr-savenote').classList.add('hidden'); return; }
      try { localStorage.setItem(n.key, '1'); } catch (e) { /* nada */ }
      if (G.Icons && n.ico) $('savenote-ico').innerHTML = G.Icons.html(n.ico, n.ico === 'save' ? 40 : 60);
      $('savenote-title').textContent = pick(n.title[0], n.title[1]);
      const body = $('savenote-body');
      if (other) body.setAttribute('translate', 'no');
      body.innerHTML = pick(n.body[0], n.body[1]);
      $('savenote-ok').textContent = pick('Entendido', 'Got it');
    };
    $('savenote-ok').onclick = next;
    next();
    $('scr-savenote').classList.remove('hidden');
    return true;
  }

  /** Explica dónde se guarda la partida según el modo de la base de datos. */
  function modeNote() {
    if (G.DB.mode === 'cloud') return 'Tu partida se guarda en la nube: entra desde cualquier ordenador. Como invitado no se guarda.';
    const why = G.DB.localReason === 'file'
      ? 'Abierto desde un archivo: la partida sólo se guarda en este navegador. Para guardar en la nube, juega en la versión publicada.'
      : G.DB.localReason === 'host'
        ? 'Esta no es la web oficial: la partida sólo se guarda en este navegador. El juego oficial y gratis está en pokesurvivor.com.'
      : G.DB.localReason === 'config'
        ? 'Nube sin configurar: la partida sólo se guarda en este navegador.'
        : 'No se pudo conectar con la nube: la partida sólo se guarda en este navegador.';
    return why;
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#scr-login .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === m));
    $('btn-auth').textContent = m === 'login' ? 'Entrar' : 'Crear cuenta';
    $('f-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('login-err').textContent = '';
  }

  function open() {
    G.UI.chrome(false);
    G.UI.show('scr-login');
    if (!G.DB.storageOk) $('login-err').textContent = 'Este navegador no deja guardar datos: juega como invitado.';
    $('btn-google').classList.toggle('hidden', G.DB.mode !== 'cloud');
    $('login-mode').textContent = modeNote();
    if (!G.Touch.active) setTimeout(() => $('f-user').focus(), 50);   // en el móvil, sin abrir el teclado solo
  }

  return { init, open, offerRecovery, updateNotices };
})();
