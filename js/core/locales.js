/* ============ locales.js — idioma del jugador (antes que nada) ============
 * Lo usan la pantalla de carga (boot.js) y el juego (i18n.js). No guarda nada del jugador.
 * Idioma: el elegido en Ajustes; si no, /en/ en la dirección o el del navegador.
 *
 * Sólo español e inglés, los dos dentro del juego (app.min.js). Lo que no sea
 * español sale en inglés. Quien tenía guardado un idioma que ya no está (francés,
 * italiano, portugués o chino, quitados el 05-11-2026) vuelve a la detección
 * automática: su ajuste se borra y lo demás de su partida no se toca.
 */
window.PS_LOCALES = (() => {
  const choices = [['es', 'Español', 'es-ES'], ['en', 'English', 'en-GB']];
  function normalize(value) {
    const s = String(value || '').toLowerCase().replace(/_/g, '-');
    return choices.find(([id]) => s === id || s.startsWith(id + '-'))?.[0] || null;
  }
  let saved;
  try {
    saved = localStorage.getItem('ps.lang');
    if (saved && !normalize(saved)) localStorage.removeItem('ps.lang');
  } catch (e) { /* storage can be blocked */ }
  const lang = normalize(saved) || (/\/en(\/|$)/.test(location.pathname) ? 'en' : null)
    || normalize((navigator.languages && navigator.languages[0]) || navigator.language || 'es') || 'en';
  document.documentElement.lang = lang;
  return { choices, normalize, lang, locale: choices.find(([id]) => id === lang)[2] };
})();
