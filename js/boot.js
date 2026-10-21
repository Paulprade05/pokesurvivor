/* ============ boot.js — lo primero que corre (antes estaba dentro del HTML) ============
 * Fuera del HTML para que la política de seguridad (CSP, en dev.html) pueda
 * prohibir todo el código metido en la página: así, aunque algún día se
 * colara texto con código en algo que se pinta, el navegador no lo ejecuta.
 *   - PS_PAGES: hay guía y Pokédex (no con --sin-seo, ver tools/build.js).
 *   - El idioma de la pantalla de carga, antes de que cargue el juego.
 */
window.PS_PAGES = !!document.querySelector('meta[name="ps-pages"]');
(function () {
  // El idioma lo elige locales.js (en el <head>).
  var copy = {
    es: ['Juego de supervivencia con Pokémon, gratis en el navegador y en el móvil.', 'Cargando…'],
    en: ['A Pokémon survival game, free in your browser and on mobile.', 'Loading…'],
    fr: ['Un jeu de survie Pokémon gratuit sur navigateur et mobile.', 'Chargement…'],
    it: ['Un gioco di sopravvivenza Pokémon gratuito su browser e cellulare.', 'Caricamento…'],
    'pt-BR': ['Um jogo de sobrevivência Pokémon grátis no navegador e no celular.', 'Carregando…'],
    'zh-Hans': ['免费的宝可梦生存游戏，可在浏览器和手机上游玩。', '加载中…'],
    'zh-Hant': ['免費的寶可夢生存遊戲，可在瀏覽器與手機上遊玩。', '載入中…']
  }[window.PS_LOCALES && window.PS_LOCALES.lang];
  if (!copy) return;
  var p = document.querySelectorAll('#boot p');
  p[0].textContent = copy[0]; p[1].textContent = copy[1];
})();

/*
 * Plazo de seguridad: si a los 25 s sigue «Cargando…» (no ha llegado el código,
 * ha fallado al arrancar o la nube no responde), se ofrece recargar. main.js lo
 * llama también si el arranque falla. Si main.js ya ha puesto su aviso
 * (mantenimiento, faltan archivos) o el juego ha arrancado, no hace nada.
 */
(function () {
  var copy = {
    es: ['No se ha podido cargar el juego', 'Recargar'],
    en: ['The game could not be loaded', 'Reload'],
    fr: ['Impossible de charger le jeu', 'Recharger'],
    it: ['Impossibile caricare il gioco', 'Ricarica'],
    'pt-BR': ['Não foi possível carregar o jogo', 'Recarregar'],
    'zh-Hans': ['无法加载游戏', '重新加载'],
    'zh-Hant': ['無法載入遊戲', '重新載入']
  };
  window.PS_BOOT_FAIL = function () {
    var el = document.getElementById('boot'), ld = el && el.querySelector('.boot-ld');
    if (!ld || window.PS_FRAMED || el.classList.contains('hidden') || ld.querySelector('button')) return;
    var c = copy[(window.PS_LOCALES && window.PS_LOCALES.lang) || document.documentElement.lang] || copy.es;
    var b = document.createElement('button');
    b.className = 'btn gold';
    b.style.marginTop = '12px';
    b.textContent = c[1];
    b.addEventListener('click', function () { location.reload(); });
    ld.setAttribute('translate', 'no');           // ya va en su idioma
    ld.textContent = c[0];
    ld.appendChild(document.createElement('br'));
    ld.appendChild(b);
  };
  // (En las pruebas con node no hay temporizadores.)
  if (typeof setTimeout === 'function') setTimeout(window.PS_BOOT_FAIL, 25000);
})();

