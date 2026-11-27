# PokéSurvivor para Windows, en Rust

Host nativo en Rust con [wry](https://github.com/tauri-apps/wry) y
[tao](https://github.com/tauri-apps/tao) (las piezas de Tauri, sin el marco) sobre
**WebView2**, el Chromium de Edge que ya trae Windows. Va en el instalador
`PokeSurvivor-Windows-Setup.exe` (abajo). **Desde la 0.9.0 es la única app de escritorio**: la de
Electron (`desktop/`) se quitó (pedido del dueño, 21-11-2026); la partida sigue en la misma carpeta
(`%APPDATA%\PokeSurvivor\`), así que quien venía de Electron no pierde nada. Por qué y medidas:
notas «Versión para Windows» y «Rendimiento de la app de escritorio» del vault
(`04 Técnico/Windows y escritorio/`).

- Descarga: instalador ~76 MB (o .zip ~105 MB). Programa: `PokeSurvivor.exe` de 0,7 MB + WebView2.
- FPS en el juego: los mismos que Edge y Chrome en el mismo PC (mismo motor; medido el 21-11-2026).
- Gráfica potente: se pide, pero la usa `msedgewebview2.exe`: sin probar en un PC con dos gráficas.

## Usar

Hace falta Rust (`rustup`, de rustup.rs) y las herramientas de C++ de Visual Studio
(componente «MSVC x64/x86» y el SDK de Windows 11). Desde esta carpeta:

```bash
cargo test                          # pruebas de Rust (rutas, versiones, ventanas emergentes)
cargo build                         # target/debug/PokeSurvivor.exe
node copiar-web.cjs                 # la web compilada a www/
target/debug/PokeSurvivor.exe --www=www
node empaquetar.cjs                 # dist/PokeSurvivor/ y dist/PokeSurvivor-Windows-Rust.zip
node instalador.cjs                 # dist/PokeSurvivor-Windows-Setup.exe (Inno Setup 6, ver abajo)
node probar.cjs                     # prueba el .exe empaquetado como un jugador
node probar-1-0.cjs                 # sin red, mando primero y aviso de versión (servidor falso)
node prueba-instalador.cjs 0.10.0 A.exe   # instalador DE PRUEBA (otro AppId) para…
node probar-actualizar.cjs A.exe B.exe 0.10.1   # …actualizar con un clic de punta a punta
node medir-perf.cjs                 # tools/perf.cjs en Rust, Edge y Chrome
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
- Tamaño (0.7.0, juego 9a30922413): **instalador 76,1 MB**; .zip 105,5 MB. Instalado ocupa 133 MB (19.105 archivos: los sprites). Instalar tarda ~45-50 s
  en el PC del dueño (casi todo es crear los archivos pequeños); desinstalar ~8 s.

Probado en el PC del dueño (21-11-2026), con un instalador 0.6.9 de prueba y el 0.7.0, en una
carpeta de prueba: instalar, entrada en «Aplicaciones instaladas», accesos directos, abrir el
juego, guardar al cerrar, instalar encima (actualiza la misma entrada, borra lo sobrante, la
partida igual), desinstalar (fuera carpeta, entrada y accesos; la partida sigue), reinstalar (la
partida vuelve). Asistente en español e inglés revisado con capturas.

## Qué hace

Lo mismo que hacía la app Electron, con los mismos archivos de `%APPDATA%\PokeSurvivor\`:

- Sirve el juego desde dentro de la app en `http://127.0.0.1:39017` sin abrir ningún puerto:
  WebView2 pide los archivos a la app (`WebResourceRequested`). Firebase y `db.js` ya
  aceptan esa dirección, así que la nube y el cooperativo funcionan como en la web.
- **Sin conexión** (1.0, bloque I): el SDK de Firebase que carga el juego
  (`https://www.gstatic.com/firebasejs/13.0.0/…-compat.js`) va dentro de la app (`www/firebasejs/`,
  lo baja `copiar-web.cjs` de gstatic con su SHA-256 fijo) y la app lo sirve en esa misma dirección.
  Así, sin internet el juego abre en modo nube igual (invitado o la última sesión guardada por
  Firebase), se juega, y lo pendiente sube cuando vuelve la red (`db.js`, evento `online`). Ranking
  y Grupo avisan como siempre. Si `db.js` cambia de versión del SDK, `copiar-web.cjs` falla hasta
  poner la versión y las huellas nuevas.
- **Copia de la partida en disco**: `%APPDATA%\PokeSurvivor\guardado\partida.json` (la misma
  que usaba Electron), cada 20 s y al cerrar la ventana. Si el navegador aparece vacío, la recupera.
- **Gráfica potente**: `--force_high_performance_gpu` a WebView2 y los símbolos
  `NvOptimusEnablement`/`AmdPowerXpressRequestHighPerformance` en el .exe (`--gpu-integrada` quita
  lo primero). El dibujo lo hace el proceso de WebView2 (`msedgewebview2.exe`), así que no está
  garantizado. Si un portátil se queda en la integrada, el jugador puede elegir
  la gráfica para `msedgewebview2.exe` en Configuración › Sistema › Pantalla › Gráficos.
- **Todos los recursos** (21-11-2026): la app, el proceso de la página (el JavaScript del juego),
  el de la GPU y el principal de WebView2 van con prioridad «por encima de lo normal» y fuera del
  ahorro de energía de Windows 11 (EcoQoS), también los que WebView2 abra después. No «alta»: le
  quitaría tiempo al sonido y al ratón de Windows. Sin frenos en segundo plano (temporizadores,
  ventana tapada).
- **Sin tope de FPS**: el juego pasa su «Límite de FPS» a «Sin límite» la primera vez en la app
  (va al ritmo de la pantalla: 60, 120, 144 Hz); luego manda lo que elija el jugador. El vsync se
  deja: sin él la GPU dibuja fotogramas que no se ven y da tirones (medido el 12-11-2026). Sólo para
  medir: sin vsync con `--sin-tope` o `{"sinTope": true}` en `%APPDATA%\PokeSurvivor\escritorio.json`.
- **Siempre a pantalla completa** (21-11-2026, pedido del dueño): sin modo ventana, en la pantalla
  donde se abre. F11 y Alt+Intro no hacen nada y el juego no enseña su botón ni su interruptor de
  pantalla completa (`G.Settings.desk`).
- Una sola ventana: abrir otra vez el juego trae la que ya hay.
- Los enlaces se abren en el navegador normal; sólo las ventanas de inicio de sesión de Google
  y Firebase se abren dentro (Google no deja entrar desde ventanas dentro de apps).
- Sin service worker, sin menú contextual ni atajos del navegador (Ctrl+R, F5...).
- **Actualizar con un clic** (1.0, bloque I; `src/actualizar.rs`): al abrir (como mucho una vez
  cada 20 h; la hora sólo se apunta si GitHub contesta) mira la última release de
  `Paulprade05/pokesurvivor` (WinHTTP). Si la etiqueta `win-vX.Y.Z` es más nueva que `Cargo.toml` y
  trae `PokeSurvivor-Windows-Setup.exe`, el juego pregunta fuera de partida con su propia ventana
  (se maneja con mando). «Actualizar ahora»: baja el instalador **de la dirección de la release**
  (`github.com/<repo>/releases/download/<etiqueta>/…`, no la que dé el API), con barra; comprueba el
  tamaño y el **SHA-256** que publica GitHub (`digest` del API; BCrypt de Windows); sube a la nube lo
  pendiente, guarda la partida en disco, se cierra y abre el instalador en silencio
  (`/SILENT /SP- /SUPPRESSMSGBOXES /NORESTART /NOCANCEL /RELANZAR=1`, en la misma carpeta y modo).
  El instalador vuelve a abrir el juego (`[Run]` con `Check: Relanzar`). Si algo falla (red, huella,
  tamaño), no instala, borra lo bajado y lo dice. Sin huella en la release no se instala solo: se
  ofrece abrir la descarga en el navegador. `--sin-avisos` lo apaga (y las compilaciones de depuración).
  Las apps 0.10.0 o anteriores aún avisan a la antigua (abrir la descarga); el clic llega a partir
  de la primera release con esto.
- **Mando primero** (1.0, bloque I): si al abrir hay un mando (XInput o un mando HID), el juego
  empieza en modo mando sin tener que pulsar nada (selección a la vista) y sin cursor; mover el
  ratón lo devuelve. En «Ir a…» está **«Salir del juego»** (sólo en la app): pregunta, guarda y cierra.
- Si falta WebView2 (Windows 10 muy antiguo), avisa y ofrece la página de Microsoft.

Para probar: `--perfil=<carpeta>` usa otra carpeta en vez de `%APPDATA%\PokeSurvivor` (y su
propio candado de una sola copia: se puede abrir con el juego del jugador abierto),
`--www=<carpeta>` otra copia del juego y `--depuracion=<puerto>` abre la depuración remota de
WebView2 en 127.0.0.1 (para Playwright y `tools/perf.cjs --cdp`). `--actualizaciones=http://127.0.0.1:<puerto>`
mira las versiones en un servidor de prueba (sólo 127.0.0.1) y `--con-mando` hace como si hubiera un
mando al abrir.

## `window.pokeEscritorio`

Sólo existe dentro de la app (`src/puente.js`). Es **estable**: se puede añadir algo, pero no quitar
ni cambiar lo que hay, porque lo usan el juego (Ajustes no ofrece descargar la app ni la pantalla
completa dentro de la app) y la calidad de gráficos (Máxima la primera vez sólo en la app).

| Campo | Qué es | Ejemplo |
|---|---|---|
| `esEscritorio` | Siempre `true` | `true` |
| `plataforma` | Siempre `'windows'` | `'windows'` |
| `version` | Versión de la app (`Cargo.toml`) | `'0.9.0'` |
| `juego` | Huella del juego que lleva dentro (`version.json`) | `'0037b74f97'` |
| `electron` | `''` (era la versión de Electron; se deja vacío) | `''` |
| `chromium`, `webview2` | Versión de WebView2 (es Chromium) | `'157.0.4341.46'` |
| `gpu.dispositivos` | Gráficas de DXGI: `{fabricante, vendorId, deviceId, activa}` (sin el adaptador básico de Microsoft) | `[{fabricante: 'AMD', …}]` |
| `gpu.activa` | La que Windows da para la preferencia pedida (o la primera) | `{fabricante: 'AMD', …}` |
| `gpu.varias` | Hay más de una gráfica de verdad | `false` |
| `gpu.probableDedicada` | Pista: `true` NVIDIA o varias, `false` Intel, `null` no se sabe (AMD sola puede ser integrada) | `null` |
| `ajustes` | `{gpuDedicada, sinTope, pantallaCompleta}` al abrir la app (`pantallaCompleta` siempre `true`) | `{gpuDedicada: true, …}` |
| `pantallaCompleta()` | No hace nada (la app ya lo está siempre); se deja por compatibilidad | — |
| `contenedor` | `'rust'` | `'rust'` |
| `mandoAlAbrir` | Había un mando conectado al abrir la app (el juego empieza en modo mando) | `false` |
| `salir()` | Guarda y cierra la app («Salir del juego») | — |
| `conectar(o)` | El juego (`updater.js`) da `{libre, preguntar, T, subir}` para el aviso de versión nueva (`G` es privado al compilar) | — |

## Archivos

| Archivo | Qué es |
|---|---|
| `src/main.rs` | La app: ventana a pantalla completa, WebView2, servir el juego y el SDK de Firebase, guardado, prioridad, mando al abrir, aviso de versión |
| `src/actualizar.rs` | Versión nueva: release de GitHub, descarga con SHA-256 (WinHTTP, BCrypt) y parámetros del instalador |
| `src/puente.js` | Lo que corre en la página antes que el juego: copia de la partida y `window.pokeEscritorio` |
| `build.rs`, `pokesurvivor.rc`, `pokesurvivor.manifest` | Icono, datos de versión y manifiesto del .exe |
| `empaquetar.cjs`, `copiar-web.cjs` | Compila, copia la web compilada (sólo lo que está en git) y hace el .zip |
| `icono.ico` | Icono del .exe y del instalador |
| `instalador.iss`, `instalador.cjs` | El instalador (Inno Setup 6) y quien lo compila con la versión de `Cargo.toml` |
| `probar.cjs` | Prueba el .exe como un jugador |
| `probar-1-0.cjs` | Sin red, mando primero y aviso de versión contra un servidor falso |
| `prueba-instalador.cjs`, `probar-actualizar.cjs` | Instaladores de prueba (otro AppId) y actualizar con un clic de punta a punta |
| `medir-perf.cjs` | Mide con `tools/perf.cjs` en Rust, Edge y Chrome |

`target/` y `dist/` no van a git. `Cargo.lock` sí (el workflow compila con `--locked`).

## Publicar (sólo cuando el dueño lo pida)

La release la hace GitHub Actions (`.github/workflows/windows-release.yml`, gratis, con el token del
propio workflow): en un runner `windows-latest` compila y prueba esta app (`cargo test`,
`empaquetar.cjs`, que copia la web **ya compilada del commit**: no compila el juego ni publica la
web), hace el instalador (`instalador.cjs`, Inno Setup 6) y sube `PokeSurvivor-Windows-Setup.exe` y
`PokeSurvivor-Windows-Rust.zip` a una release normal (ni borrador ni prerelease, marcada como la
última) titulada «PokéSurvivor para Windows X.Y.Z», con una nota es/en.

1. En la raíz: `node tools/build.js && node tools/export_data.js && py tools/make_seo_pages.py`,
   y que el resultado esté en `main` (lo que se empaqueta es lo del commit de la etiqueta).
2. Sube `version` en `Cargo.toml` (p. ej. 0.8.0 → 0.9.0) y `cargo build` para que `Cargo.lock`
   la recoja.
3. Empuja la etiqueta **`win-v<versión>`** sobre ese commit de `main` (o Actions › «Versión para
   Windows» › *Run workflow*). El workflow falla si la etiqueta no es `win-vX.Y.Z` o no coincide
   con `Cargo.toml`. Si la release ya existe, sustituye los archivos.
4. Con eso, en la web sale Ajustes › Acerca de › «Descargar para Windows» (sólo en PC con Windows
   y si la release trae el instalador; `js/ui/windows-dl.js`) y las apps ya instaladas avisan de la
   versión nueva (y se actualizan con un clic si la release trae la huella SHA-256 del instalador,
   que GitHub pone sola a los archivos subidos).
5. El runner necesita red para `copiar-web.cjs`: baja el SDK de Firebase de www.gstatic.com y
   comprueba sus huellas.

Las apps Electron que aún tenga alguien (0.7.0-0.8.0) buscan primero el instalador: avisarán y
bajarán esta app, y la partida sigue. Las Electron 0.6.0 o anteriores sólo buscaban
`PokeSurvivor-Windows.zip`, que ya no se sube: no avisarán (hay que bajar el instalador a mano).
