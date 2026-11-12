# PokéSurvivor para Windows (prototipo)

App de Windows hecha con [Electron](https://www.electronjs.org/). Envuelve la misma
versión compilada que se publica en GitHub Pages: el juego no cambia y la web no se toca.
Por qué Electron y no otra cosa: nota «Versión para Windows» del vault
(`04 Técnico/Windows y escritorio/`).

## Usar

Desde esta carpeta (`desktop/`), con Node instalado:

```bash
npm install                 # Electron 45, empaquetador y playwright-core (sólo aquí, nada global)
npm start                   # copia la web compilada a www/ y abre la app
npm run sin-tope            # igual, sin vsync ni tope de FPS
npm run empaquetar          # dist/PokeSurvivor-win32-x64/PokeSurvivor.exe y un .zip
npm run medir               # FPS en la app, Edge y Chrome (deja capturas en dist/medidas/)
```

Antes hay que haber compilado la web en la raíz (`node tools/build.js`), porque se copia
`index.html` y `js/app.min.js` tal cual.

Si `npm install` no baja Electron (`node_modules/electron/dist` vacío):
`node node_modules/electron/install.js`.

## Qué hace además de la web

- Pide la **GPU dedicada** en portátiles con dos gráficas (`--gpu-integrada` lo quita).
- **FPS sin tope** con `--sin-tope` o `{"sinTope": true}` en `%APPDATA%\PokeSurvivor\escritorio.json`.
- **Pantalla completa** con F11 o Alt+Intro (`--pantalla-completa` para abrir así).
- **Copia de la partida en disco**: `%APPDATA%\PokeSurvivor\guardado\partida.json`, cada 20 s
  y al cerrar. Si el almacenamiento del navegador aparece vacío, la recupera sola.
- Sirve el juego desde dentro de la app en `http://127.0.0.1:39017` (no abre ningún puerto):
  la nube y el cooperativo funcionan como en la web.
- Sin service worker y sin menú de Electron (no recarga con Ctrl+R por error).

## Archivos

| Archivo | Qué es |
|---|---|
| `main.cjs` | La app: ventana, GPU, FPS, servir el juego, guardado en disco |
| `preload.cjs` | Copia `localStorage` al disco y la recupera; `window.pokeEscritorio` |
| `copiar-web.cjs` | Copia la web compilada (archivos de git) a `www/` |
| `empaquetar.cjs` | Hace el `.exe` y el `.zip` |
| `medir-fps.cjs` | Juega como invitado y mide FPS en la app y en los navegadores |
| `icono.ico` | Icono del `.exe` (de `assets/icons/icon-512.png`) |

`www/`, `dist/` y `node_modules/` no van a git.

## Falta (no es parte del prototipo)

Instalador, actualizaciones automáticas, login de Google desde el navegador del sistema,
ajustes de PC dentro del juego, Discord. Sin firma de código: Windows avisa con SmartScreen.
