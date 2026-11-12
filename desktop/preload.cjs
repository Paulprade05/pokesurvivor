// Puente entre el juego (la página) y la app de Windows. Corre antes que el
// juego y no le cambia nada: sólo guarda en disco una copia de lo que el juego
// guarda en el navegador (localStorage) y la devuelve si un día ese
// almacenamiento aparece vacío (perfil borrado, otra versión de la app...).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const ORIGEN = 'http://127.0.0.1:39017';

function foto() {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    o[k] = localStorage.getItem(k);
  }
  return JSON.stringify({ guardadoEl: new Date().toISOString(), datos: o });
}

if (location.origin === ORIGEN) {
  // 1. Recuperar del disco si el navegador no tiene nada.
  try {
    if (localStorage.length === 0) {
      const disco = ipcRenderer.sendSync('ps:leer-guardado');
      if (disco && disco.datos) {
        for (const k of Object.keys(disco.datos)) localStorage.setItem(k, disco.datos[k]);
        console.info('[escritorio] Partida recuperada del disco (' + disco.guardadoEl + ')');
      }
    }
  } catch (e) { console.warn('[escritorio] No se pudo leer la copia del disco:', e.message); }

  // 2. Copiar al disco cada 20 s si ha cambiado, y al cerrar.
  let ultima = '';
  const copiar = (yaMismo) => {
    try {
      const t = foto();
      const cuerpo = t.slice(t.indexOf('"datos"'));   // sin la fecha, para comparar
      if (cuerpo === ultima) return;
      ultima = cuerpo;
      if (yaMismo) ipcRenderer.sendSync('ps:guardar-ya', t); else ipcRenderer.send('ps:guardar', t);
    } catch (e) { /* lo intentará en la siguiente */ }
  };
  setInterval(() => copiar(false), 20000);
  addEventListener('pagehide', () => copiar(true));
  addEventListener('beforeunload', () => copiar(true));
}

// Lo que el juego puede usar si quiere saber que va en la app de Windows.
contextBridge.exposeInMainWorld('pokeEscritorio', {
  esEscritorio: true,
  plataforma: 'windows',
  pantallaCompleta: () => ipcRenderer.send('ps:pantalla-completa'),
});
