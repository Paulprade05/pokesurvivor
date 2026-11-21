# PokéSurvivor para Windows, en Rust

Host nativo en Rust con [wry](https://github.com/tauri-apps/wry) y
[tao](https://github.com/tauri-apps/tao) (las piezas de Tauri, sin el marco) sobre
**WebView2**, el Chromium de Edge que ya trae Windows. Hace lo mismo que la app Electron
(`../desktop/`), que se queda de respaldo (sólo en .zip) hasta probar la gráfica potente en un
portátil con dos gráficas. **Desde la 0.7.0 es la principal**: va en el instalador
`PokeSurvivor-Windows-Setup.exe` (abajo). Por qué y medidas: nota «Versión para Windows» del
vault (`04 Técnico/Windows y escritorio/`).

| | Electron (`desktop/`) | Rust (`desktop-rust/`) |
|---|---|---|
| Descarga | .zip ~255 MB | **instalador 76 MB** (o .zip ~105 MB) |
| Programa | Chromium propio (~350 MB) | `PokeSurvivor.exe` de 0,7 MB + WebView2 de Windows |
| FPS en el juego | = Edge | = Edge (mismo motor) |
| Gráfica potente | segura (Chromium propio) | se pide, pero la usa `msedgewebview2.exe`: sin probar en un PC con dos gráficas |

## Usar

Hace falta Rust (`rustup`, de rustup.rs) y las herramientas de C++ de Visual Studio
(componente «MSVC x64/x86» y el SDK de Windows 11). Desde esta carpeta:

```bash
cargo test                          # pruebas de Rust (rutas, versiones, ventanas emergentes)
cargo build                         # target/debug/PokeSurvivor.exe
node ../desktop/copiar-web.cjs      # la web compilada a ../desktop/www
target/debug/PokeSurvivor.exe --www=../desktop/www
node empaquetar.cjs                 # dist/PokeSurvivor/ y dist/PokeSurvivor-Windows-Rust.zip
node instalador.cjs                 # dist/PokeSurvivor-Windows-Setup.exe (Inno Setup 6, ver abajo)
node probar.cjs                     # prueba el .exe empaquetado y lo compara con Electron
node medir-perf.cjs                 # tools/perf.cjs en Rust, Electron, Edge y Chrome
```

Antes hay que haber compilado la web en la raíz (`node tools/build.js`): se copia tal cual.
El .zip lleva la carpeta `PokeSurvivor/` con `PokeSurvivor.exe` y `www/` (el juego).

## Instalador (`instalador.iss`, desde el 21-11-2026)

Pedido del dueño: «un instalador como cualquier juego, más compacto, que diga dónde se va a
instalar». Hecho con **Inno Setup 6** (gratis, también para uso comercial, sin cuentas;
https://jrsoftware.org/isinfo.php). Por qué Inno Setup y no otro:
- Trae de serie lo pedido: asistente en español e inglés, carpeta a elegir, «sólo para mí / para
  todos», casillas de accesos directos, abrir al acabar, desinstalador en «Aplicaciones instaladas»
  y LZMA2 sólida. NSIS haría lo mismo con más script; `electron-builder` sólo vale para Electron;
  MSI (WiX) es más rígido y no comprime mejor.
- Ya viene instalado en los runners `windows-latest` de GitHub (si faltara, el workflow lo pone con
  Chocolatey). En local: instalador oficial de jrsoftware.org (`ISCC.exe` en
  `%LOCALAPPDATA%\Programs\Inno Setup 6` si se instala sólo para el usuario).

Cómo es para el jugador (Windows 10/11 de 64 bits):
1. Si el navegador avisa de que el archivo no se descarga a menudo: «Conservar». Al abrirlo,
   SmartScreen («Windows protegió su PC»): «Más información» › «Ejecutar de todas formas» (no va
   firmado: no hay firma gratis para este juego).
2. «Instalar para mí solamente (recomendado)» o «para todos los usuarios» (pide administrador).
3. Bienvenida (dice que la partida se queda), carpeta (por defecto
   `%LOCALAPPDATA%\Programs\PokeSurvivor`; para todos, `Archivos de programa\PokeSurvivor`),
   casillas «menú Inicio» y «Escritorio», resumen, instalar, «Ejecutar PokéSurvivor».
4. Queda en Configuración › Aplicaciones › Aplicaciones instaladas como «PokéSurvivor» con icono,
   versión y editor.

- **Actualizar**: abrir el instalador nuevo. Mismo `AppId` → misma carpeta, sin volver a preguntar
  carpeta ni modo; antes de copiar borra `www/` (el juego viejo) para que no quede nada de más. Si
  el juego está abierto, pide cerrarlo (`AppMutex` = el mutex de una sola copia de la app).
- **La partida no se toca nunca**: el instalador sólo escribe en la carpeta del programa. La
  partida y el perfil de WebView2 están en `%APPDATA%\PokeSurvivor\` (ni `[UninstallDelete]` ni
  rutas de datos en el `.iss`; lo comprueba `tests/windows-instalador.test.cjs`).
- **No cambiar el `AppId`** del `.iss`: si cambia, el instalador nuevo no reconoce el viejo.
- Tamaño (0.7.0, juego 9a30922413): **instalador 76,1 MB**; .zip de Rust 105,5 MB; .zip de
  Electron 255 MB. Instalado ocupa 133 MB (19.105 archivos: los sprites). Instalar tarda ~45-50 s
  en el PC del dueño (casi todo es crear los archivos pequeños); desinstalar ~8 s.

Probado en el PC del dueño (21-11-2026), con un instalador 0.6.9 de prueba y el 0.7.0, en una
carpeta de prueba: instalar, entrada en «Aplicaciones instaladas», accesos directos, abrir el
juego, guardar al cerrar, instalar encima (actualiza la misma entrada, borra lo sobrante, la
partida igual), desinstalar (fuera carpeta, entrada y accesos; la partida sigue), reinstalar (la
partida vuelve). Asistente en español e inglés revisado con capturas.

## Qué hace

Lo mismo que la app Electron, con los mismos archivos de `%APPDATA%\PokeSurvivor\`, así que
se puede pasar de una a otra sin perder la partida:

- Sirve el juego desde dentro de la app en `http://127.0.0.1:39017` sin abrir ningún puerto:
  WebView2 pide los archivos a la app (`WebResourceRequested`). Firebase y `db.js` ya
  aceptan esa dirección, así que la nube y el cooperativo funcionan como en la web.
- **Copia de la partida en disco**: `%APPDATA%\PokeSurvivor\guardado\partida.json` (la misma
  que Electron), cada 20 s y al cerrar la ventana. Si el navegador aparece vacío, la recupera.
- **Gráfica potente**: `--force_high_performance_gpu` a WebView2 y los símbolos
  `NvOptimusEnablement`/`AmdPowerXpressRequestHighPerformance` en el .exe (`--gpu-integrada` quita
  lo primero). El dibujo lo hace el proceso de WebView2 (`msedgewebview2.exe`), así que no está
  garantizado como en Electron. Si un portátil se queda en la integrada, el jugador puede elegir
  la gráfica para `msedgewebview2.exe` en Configuración › Sistema › Pantalla › Gráficos.
- **FPS sin tope** con `--sin-tope` o `{"sinTope": true}` en `%APPDATA%\PokeSurvivor\escritorio.json`.
- **Pantalla completa** con F11 o Alt+Intro (`--pantalla-completa` para abrir así), y la del
  botón del juego (la API de pantalla completa de HTML pone la ventana entera).
- Una sola ventana: abrir otra vez el juego trae la que ya hay.
- Los enlaces se abren en el navegador normal; sólo las ventanas de inicio de sesión de Google
  y Firebase se abren dentro (Google no deja entrar desde ventanas dentro de apps: igual que en
  Electron).
- Sin service worker, sin menú contextual ni atajos del navegador (Ctrl+R, F5...).
- **Avisa de versiones nuevas**: al abrir (como mucho una vez cada 20 h) mira la última release
  de GitHub; si la etiqueta `win-vX.Y.Z` es más nueva que la versión de `Cargo.toml`, ofrece
  abrir la descarga: el instalador `PokeSurvivor-Windows-Setup.exe` si la release lo trae; si
  no, `PokeSurvivor-Windows-Rust.zip` y luego `PokeSurvivor-Windows.zip` (el texto cambia: abrir
  el instalador o descomprimir encima).
  `--sin-avisos` lo apaga.
- Si falta WebView2 (Windows 10 muy antiguo), avisa y ofrece la página de Microsoft.

Para probar: `--perfil=<carpeta>` usa otra carpeta en vez de `%APPDATA%\PokeSurvivor`,
`--www=<carpeta>` otra copia del juego y `--depuracion=<puerto>` abre la depuración remota de
WebView2 en 127.0.0.1 (para Playwright y `tools/perf.cjs --cdp`).

## `window.pokeEscritorio`

El mismo objeto que la app Electron (lista en `../desktop/LEEME.md`), con estas diferencias:

| Campo | En la app de Rust |
|---|---|
| `electron` | `''` (no es Electron) |
| `chromium` | Versión de WebView2 (es Chromium), p. ej. `'157.0.4341.46'` |
| `gpu` | De DXGI: las gráficas de verdad, la primera es la que Windows da para la preferencia pedida |
| `contenedor` | **Nuevo**: `'rust'` |
| `webview2` | **Nuevo**: versión de WebView2 |

## Archivos

| Archivo | Qué es |
|---|---|
| `src/main.rs` | La app: ventana, WebView2, servir el juego, guardado, pantalla completa, aviso de versión |
| `src/puente.js` | Lo que corre en la página antes que el juego: copia de la partida y `window.pokeEscritorio` |
| `build.rs`, `pokesurvivor.rc`, `pokesurvivor.manifest` | Icono, datos de versión y manifiesto del .exe |
| `empaquetar.cjs` | Compila y hace el .zip |
| `instalador.iss`, `instalador.cjs` | El instalador (Inno Setup 6) y quien lo compila con la versión de `Cargo.toml` |
| `probar.cjs` | Prueba el .exe como un jugador y lo compara con Electron |
| `medir-perf.cjs` | Mide con `tools/perf.cjs` en Rust, Electron, Edge y Chrome |

`target/` y `dist/` no van a git. `Cargo.lock` sí (el workflow compila con `--locked`).

## Publicar

Lo hace `.github/workflows/windows-release.yml` con la etiqueta `win-vX.Y.Z`, igual que la app
Electron (pasos en `../desktop/LEEME.md`). La versión de `Cargo.toml` tiene que ser la misma que
la de `../desktop/package.json`. Sube siempre `PokeSurvivor-Windows-Setup.exe` (esta app; el
que enlazan Ajustes y los avisos de las apps 0.7.0+) y los dos .zip portátiles. Mientras
`PRINCIPAL: electron`, esta sale como `PokeSurvivor-Windows-Rust.zip` y Electron como
`PokeSurvivor-Windows.zip` (el que buscan las apps 0.6.0 y anteriores); con `PRINCIPAL: rust` se
cambian y Electron queda como `PokeSurvivor-Windows-Electron.zip`.
