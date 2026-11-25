// Puente entre el juego (la página) y la app de Windows en Rust. Hace lo mismo
// que hacía desktop/preload.cjs de la antigua app Electron: corre antes que el juego, no le
// cambia nada, copia en disco lo que el juego guarda en el navegador
// (localStorage), lo recupera si un día aparece vacío y presenta la app con
// window.pokeEscritorio. main.rs cambia __INFO__ y __DISCO__ por los datos.
// (1.0, bloque I) Además: modo mando al abrir, «Salir del juego» y el aviso de versión nueva con
// actualizar con un clic (lo hace la app: src/actualizar.rs; aquí sólo se pregunta y se enseña).
(function () {
  'use strict';
  if (window.top !== window || location.origin !== 'http://127.0.0.1:39017') return;
  var INFO = __INFO__;
  var DISCO = __DISCO__;
  var juego = null;   // { libre, preguntar, T, subir }: lo da el juego al cargar (pokeEscritorio.conectar)
  var mandar = function (o) { try { window.ipc.postMessage(JSON.stringify(o)); } catch (e) { /* sin puente */ } };

  // 1. Recuperar del disco si el navegador no tiene nada.
  try {
    if (localStorage.length === 0 && DISCO && DISCO.datos) {
      for (var k in DISCO.datos) localStorage.setItem(k, DISCO.datos[k]);
      console.info('[escritorio] Partida recuperada del disco (' + DISCO.guardadoEl + ')');
    }
  } catch (e) { console.warn('[escritorio] No se pudo leer la copia del disco:', e && e.message); }

  // 2. Copiar al disco cada 20 s si ha cambiado. Al cerrar la ventana la pide
  //    la app (window.__psFoto) y la escribe antes de salir.
  function foto() {
    var o = {};
    for (var i = 0; i < localStorage.length; i++) { var c = localStorage.key(i); o[c] = localStorage.getItem(c); }
    return JSON.stringify({ guardadoEl: new Date().toISOString(), datos: o });
  }
  var ultima = '';
  function copiar() {
    try {
      var t = foto(), cuerpo = t.slice(t.indexOf('"datos"'));   // sin la fecha, para comparar
      if (cuerpo === ultima) return;
      ultima = cuerpo;
      mandar({ t: 'guardar', texto: t });
    } catch (e) { /* lo intentará en la siguiente */ }
  }
  setInterval(copiar, 20000);
  addEventListener('pagehide', copiar);
  Object.defineProperty(window, '__psFoto', { value: function () { try { return foto(); } catch (e) { return null; } } });

  // 3. La app va siempre a pantalla completa (21-11-2026): F11 y Alt+Intro no hacen nada.
  addEventListener('keydown', function (e) {
    if (e.key === 'F11' || (e.altKey && e.key === 'Enter')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // 3b. Mando primero (1.0): jugando con mando no se ve el cursor (vuelve al mover el ratón, que quita la
  //     clase .pad del cuerpo: js/core/gamepad.js).
  function estilo() {
    var st = document.createElement('style');
    st.textContent = 'body.pad, body.pad * { cursor: none !important; }';
    (document.head || document.documentElement).appendChild(st);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', estilo); else estilo();
  }

  // 4. Lo que el juego puede usar si quiere saber que va en la app de Windows.
  //    Es estable: se puede AÑADIR algo, pero no quitar ni cambiar lo que hay
  //    (lo usan el juego y la calidad de gráficos). Lista en desktop-rust/LEEME.md.
  var gpu = INFO.gpu || { dispositivos: [], activa: null, varias: false, probableDedicada: null };
  Object.defineProperty(window, 'pokeEscritorio', {
    enumerable: true,
    value: Object.freeze({
      esEscritorio: true,
      plataforma: 'windows',
      version: INFO.version || '',      // versión de la app (desktop-rust/Cargo.toml)
      juego: INFO.juego || '',          // huella del juego que lleva dentro (version.json)
      electron: '',                     // vacío: esta app no es Electron
      chromium: INFO.webview2 || '',    // WebView2 es Chromium (de Edge): su versión
      gpu: gpu,                         // { dispositivos, activa, varias, probableDedicada }
      ajustes: INFO.ajustes || {},      // { gpuDedicada, sinTope, pantallaCompleta } al abrir la app (pantallaCompleta: siempre true)
      pantallaCompleta: function () { /* ya lo está siempre: se queda por compatibilidad */ },
      // Nuevo en la app de Rust (sólo se añade):
      contenedor: 'rust',               // 'rust' (wry/tao + WebView2); en Electron no existe
      webview2: INFO.webview2 || '',
      // (1.0) Había un mando conectado al abrir la app: el juego empieza en modo mando (js/core/gamepad.js).
      mandoAlAbrir: !!INFO.mando,
      // (1.0) Cierra la app guardando la partida, como cerrar la ventana («Salir del juego» en «Ir a…»).
      salir: function () { mandar({ t: 'salir' }); },
      // (1.0) El juego (js/core/updater.js) da aquí lo que el aviso de versión nueva usa de su interfaz.
      conectar: function (o) { if (o && typeof o.libre === 'function') juego = o; },
    }),
  });

  // 5. Versión nueva (la mira la app al abrir, como mucho una vez cada 20 h: src/actualizar.rs).
  //    Se pregunta fuera de partida, con la ventana del juego (se maneja con mando). Con un clic la app la
  //    baja de la release oficial, comprueba su SHA-256, sube a la nube lo pendiente, cierra guardando,
  //    instala encima y el juego vuelve a abrirse.
  //    Los textos van en español, como en el juego: G.UI.ask y T() los traducen (js/data/lang-en.js).
  var T = function (s) { try { return juego ? juego.T(s) : s; } catch (e) { return s; } };
  // Fuera de partida y sin nada a medias (ni tienda, ni gacha, ni otra pregunta): lo mismo que para recargar la web.
  function cuandoSePueda(fn) {
    var t = setInterval(function () {
      try { if (!juego || !juego.libre()) return; } catch (e) { return; }
      clearInterval(t);
      fn(juego);
    }, 2000);
  }
  var caja = null;
  function barra(texto, pct) {
    if (!caja) {
      caja = document.createElement('div');
      caja.setAttribute('role', 'status');
      caja.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483000;min-width:320px;'
        + 'padding:12px 20px 14px;border-radius:14px;background:rgba(18,22,34,.95);color:#fff;font-weight:600;font-size:15px;'
        + 'text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.5);pointer-events:none';
      caja.innerHTML = '<div></div><div style="margin-top:9px;height:8px;border-radius:4px;background:rgba(255,255,255,.18);overflow:hidden">'
        + '<i style="display:block;height:100%;width:0;background:#f2c35a;transition:width .25s"></i></div>';
      document.body.appendChild(caja);
    }
    caja.firstChild.textContent = texto;
    caja.querySelector('i').style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function quitarBarra() { if (caja) { caja.remove(); caja = null; } }
  function abrirDescarga(texto) {
    cuandoSePueda(function (j) {
      j.preguntar(texto, { yes: 'Abrir la descarga', no: 'Más tarde' })
        .then(function (si) { if (si) mandar({ t: 'abrir-descarga' }); });
    });
  }
  Object.defineProperty(window, '__psNueva', { value: function (d) {
    if (!d.clic) {
      abrirDescarga('Hay una versión nueva de PokéSurvivor para PC (' + d.version + '). Descárgala de la página del juego e instálala encima: tu partida se queda.');
      return;
    }
    cuandoSePueda(function (j) {
      j.preguntar('Hay una versión nueva de PokéSurvivor para PC: la ' + d.version + ' (tienes la ' + d.actual + '). Se descarga (' + d.mb + ' MB), se instala sola y el juego vuelve a abrirse. Tu partida se queda.',
        { yes: 'Actualizar ahora', no: 'Más tarde' })
        .then(function (si) {
          if (!si) return;
          barra(T('Preparando la descarga…'), 0);
          mandar({ t: 'actualizar' });
        });
    });
  } });
  Object.defineProperty(window, '__psProgreso', { value: function (p) {
    var pct = p[1] > 0 ? Math.floor(p[0] * 100 / p[1]) : 0;
    barra(T('Descargando la actualización…') + ' ' + pct + ' % · ' + (p[0] / 1048576).toFixed(0) + ' / ' + (p[1] / 1048576).toFixed(0) + ' MB', pct);
  } });
  Object.defineProperty(window, '__psInstalar', { value: function () {
    barra(T('Guardando tu partida e instalando… El juego se cierra y vuelve a abrirse.'), 100);
    var hecho = false, listo = function () { if (!hecho) { hecho = true; mandar({ t: 'instalar' }); } };
    // Lo pendiente, a la nube antes de cerrar (como antes de recargar por una versión nueva de la web).
    try {
      if (juego) { juego.subir().then(function () { setTimeout(listo, 300); }, listo); setTimeout(listo, 30000); return; }
    } catch (e) { /* queda en la copia del disco */ }
    setTimeout(listo, 800);
  } });
  Object.defineProperty(window, '__psFallo', { value: function (msg) {
    quitarBarra();
    abrirDescarga('No se pudo actualizar (' + msg + '). Puedes bajar el instalador de la página del juego.');
  } });
})();
