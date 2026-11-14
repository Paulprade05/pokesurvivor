// Puente entre el juego (la página) y la app de Windows en Rust. Hace lo mismo
// que desktop/preload.cjs de la app Electron: corre antes que el juego, no le
// cambia nada, copia en disco lo que el juego guarda en el navegador
// (localStorage), lo recupera si un día aparece vacío y presenta la app con
// window.pokeEscritorio. main.rs cambia __INFO__ y __DISCO__ por los datos.
(function () {
  'use strict';
  if (window.top !== window || location.origin !== 'http://127.0.0.1:39017') return;
  var INFO = __INFO__;
  var DISCO = __DISCO__;
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

  // 3. Pantalla completa con F11 o Alt+Intro (como en la app Electron).
  addEventListener('keydown', function (e) {
    if (e.key === 'F11' || (e.altKey && e.key === 'Enter')) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) mandar({ t: 'pantalla-completa' });
    }
  }, true);

  // 4. Lo que el juego puede usar si quiere saber que va en la app de Windows.
  //    Es estable: se puede AÑADIR algo, pero no quitar ni cambiar lo que hay
  //    (lo usan el juego y la calidad de gráficos). Lista en desktop/LEEME.md.
  var gpu = INFO.gpu || { dispositivos: [], activa: null, varias: false, probableDedicada: null };
  Object.defineProperty(window, 'pokeEscritorio', {
    enumerable: true,
    value: Object.freeze({
      esEscritorio: true,
      plataforma: 'windows',
      version: INFO.version || '',      // versión de la app (desktop-rust/Cargo.toml = desktop/package.json)
      juego: INFO.juego || '',          // huella del juego que lleva dentro (version.json)
      electron: '',                     // vacío: esta app no es Electron
      chromium: INFO.webview2 || '',    // WebView2 es Chromium (de Edge): su versión
      gpu: gpu,                         // { dispositivos, activa, varias, probableDedicada }
      ajustes: INFO.ajustes || {},      // { gpuDedicada, sinTope, pantallaCompleta } al abrir la app
      pantallaCompleta: function () { mandar({ t: 'pantalla-completa' }); },
      // Nuevo en la app de Rust (sólo se añade):
      contenedor: 'rust',               // 'rust' (wry/tao + WebView2); en Electron no existe
      webview2: INFO.webview2 || '',
    }),
  });

  // 5. ¿Hay versión nueva? Sólo si la app lo pide (como mucho una vez cada 20 h).
  if (INFO.comprobar) {
    addEventListener('load', function () {
      setTimeout(function () {
        fetch('https://api.github.com/repos/Paulprade05/pokesurvivor/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (rel) {
            if (!rel) { mandar({ t: 'version', ok: false }); return; }
            mandar({ t: 'version', ok: true, tag: rel.tag_name || '', draft: !!rel.draft, prerelease: !!rel.prerelease,
              assets: (rel.assets || []).map(function (a) { return { name: a.name, url: a.browser_download_url }; }) });
          })
          .catch(function () { /* sin red: otra vez será */ });
      }, 8000);
    });
  }
})();
