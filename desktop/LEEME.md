# PokéSurvivor para Windows

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
npm run empaquetar          # dist/PokeSurvivor/PokeSurvivor.exe y dist/PokeSurvivor-Windows.zip
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
- **Avisa de versiones nuevas**: al abrir (como mucho una vez cada 20 h, sólo la app
  empaquetada) mira la última release de GitHub; si su etiqueta es más nueva que la
  versión de `package.json`, ofrece abrir la descarga. `--sin-avisos` lo apaga.

## `window.pokeEscritorio` (para el juego)

Sólo existe dentro de la app. Es **estable**: se puede añadir algo, pero no quitar ni
cambiar lo que hay, porque lo usan el juego (Ajustes no ofrece descargar la app dentro de
la app) y la calidad de gráficos (nivel máximo sólo en la app).

| Campo | Qué es | Ejemplo |
|---|---|---|
| `esEscritorio` | Siempre `true` | `true` |
| `plataforma` | Siempre `'windows'` | `'windows'` |
| `version` | Versión de la app (`desktop/package.json`) | `'0.2.0'` |
| `juego` | Huella del juego que lleva dentro (`version.json`) | `'0037b74f97'` |
| `electron`, `chromium` | Versiones del motor | `'45.3.1'`, `'156.0.8078.96'` |
| `gpu.dispositivos` | Gráficas que ve Chromium: `{fabricante, vendorId, deviceId, activa}` (sin el adaptador básico de Microsoft) | `[{fabricante: 'AMD', …}]` |
| `gpu.activa` | La que se usa (o la primera) | `{fabricante: 'AMD', …}` |
| `gpu.varias` | Hay más de una gráfica de verdad | `false` |
| `gpu.probableDedicada` | Pista: `true` NVIDIA o varias, `false` Intel, `null` no se sabe (AMD sola puede ser integrada) | `null` |
| `ajustes` | `{gpuDedicada, sinTope, pantallaCompleta}` al abrir la app | `{gpuDedicada: true, …}` |
| `pantallaCompleta()` | Entra o sale de pantalla completa | — |

El nombre real de la gráfica se lee en la página con WebGL (`WEBGL_debug_renderer_info`).

## Publicar una versión de Windows (sólo cuando el dueño lo pida)

La release la hace GitHub Actions (`.github/workflows/windows-release.yml`, gratis, con el
token del propio workflow): en un runner `windows-latest` hace `npm ci` aquí, copia la web
**ya compilada del commit** (no compila el juego ni publica la web), empaqueta y sube
`PokeSurvivor-Windows.zip` a una release normal (ni borrador ni prerelease, marcada como la
última) titulada «PokéSurvivor para Windows X.Y.Z», con una nota es/en sobre SmartScreen.

1. En la raíz: `node tools/build.js && node tools/export_data.js && py tools/make_seo_pages.py`,
   y que el resultado esté en `main` (lo que se empaqueta es lo del commit de la etiqueta).
2. Si es una versión nueva de la app, sube `version` en `desktop/package.json` (0.2.0 → 0.3.0).
3. Empuja la etiqueta **`win-v<versión>`** (por ejemplo `win-v0.2.0`) sobre ese commit de
   `main`; o en Actions › «Versión para Windows» › *Run workflow* con esa etiqueta (crea la
   etiqueta sobre el commit elegido). El workflow falla si la etiqueta no es `win-vX.Y.Z` o no
   coincide con `desktop/package.json`. Si la release ya existe, sustituye el .zip.
4. Con eso, en la web sale Ajustes › Acerca de › «Descargar para Windows» (sólo en PC con
   Windows; `js/ui/windows-dl.js` pregunta a la API de GitHub si existe) y las apps ya
   instaladas avisan de la versión nueva (comparan el número de la etiqueta, sin `win-v`).

A mano (sin Actions): `npm run empaquetar` y subir `dist/PokeSurvivor-Windows.zip` **con ese
nombre exacto** a una release con la misma etiqueta.

Sin release no sale la fila (no hay enlace roto). Para actualizar, el jugador descomprime el
.zip nuevo encima del viejo: la partida está en `%APPDATA%\PokeSurvivor\`, no en la carpeta.

## Archivos

| Archivo | Qué es |
|---|---|
| `main.cjs` | La app: ventana, GPU, FPS, servir el juego, guardado en disco, aviso de versión nueva |
| `preload.cjs` | Copia `localStorage` al disco y la recupera; `window.pokeEscritorio` |
| `copiar-web.cjs` | Copia la web compilada (archivos de git) a `www/` |
| `empaquetar.cjs` | Hace el `.exe` y `PokeSurvivor-Windows.zip` (nombres fijos) |
| `medir-fps.cjs` | Juega como invitado y mide FPS en la app y en los navegadores |
| `../.github/workflows/windows-release.yml` | Hace la release al empujar `win-vX.Y.Z` |
| `icono.ico` | Icono del `.exe` (de `assets/icons/icon-512.png`) |

`www/`, `dist/` y `node_modules/` no van a git.

## Falta

Instalador (por ahora .zip portable), actualización sin descomprimir a mano, login de Google
desde el navegador del sistema, ajustes de PC dentro del juego, Discord. Sin firma de código:
Windows avisa con SmartScreen («Más información» → «Ejecutar de todas formas»).
