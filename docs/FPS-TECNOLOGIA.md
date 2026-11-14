# FPS estables: dónde se va el tiempo y qué tecnología usar (14-11-2026, rama `fps-tecnologia`)

Pedido del dueño: «haz lo que sea necesario para que el juego vaya lo mejor posible de fps, si hace falta migra todo el código
a otra tecnología [...] que se vea lo más parecido a lo actual pero con fps estables a 60 o 120».

Fase 1: medir y proponer (este documento). Nada del juego cambia todavía.

## Cómo se ha medido
`tools/perf.cjs` (ver [RENDIMIENTO.md](RENDIMIENTO.md)), con cuatro cosas nuevas:

| opción | qué hace |
|---|---|
| `--desglose` | ms propios de cada parte por fotograma: simulación (`sim`, `sim:ia`, `sim:combate`, `sim:proyectiles`...), dibujo (`dib:suelo`, `dib:enemigos`, `dib:fx`...), `3d`, `dom`; `otros` es lo que queda (bloom, capas aparte, ordenar...) |
| `--traza` | Chrome: % del tiempo ocupado de cada hilo. `CrRendererMain` es el JavaScript de la página; **`CrGpuMain` es el proceso de la GPU, que pinta el lienzo 2D** y que el JavaScript no ve |
| `--hz N` / `--quitar G.fn,...` | pantalla de N Hz (sin vsync, tope del juego a N; en Chrome sin ventana sale ~50 FPS y no vale) · apagar una capa para ver lo que cuesta |
| escena `hordamax` | minuto 19, 4 ataques evolucionados y fusionados, oleadas hasta el tope (65-66 enemigos, 60-80 proyectiles, ~1000 partículas) |

Y un banco aparte, `tools/bench-dibujo/` (`run.cjs` + `bench.html`): la mezcla de dibujo de la horda (sprites de 30 Pokémon,
partículas, suelo en trozos, niebla, viñeta, números) pintada en Canvas 2D (como hoy), en WebGL2 por lotes (atlas y una
llamada por textura) y en PixiJS 8.21 (opcional, `--pixi`).

PC del dueño: Ryzen 7 7735U con Radeon integrada, 1536×864 a ×1,25 (1920×1080), Chrome del sistema. Móvil: WebKit de Playwright
con el perfil de iPhone 15 en horizontal; en Windows **pinta por software**: sirve para comparar, no para saber cómo va un iPhone.
Ruido: había otras sesiones y el Chrome del dueño abiertos; se compara siempre dentro de la misma tanda.

## Lo que sale
### 1. La simulación no es el problema
Horda al tope (`hordamax`), ms por fotograma:

| | simulación (IA, choques, combate, proyectiles) | dibujo (JS) | 3D | interfaz/DOM | otros | total JS |
|---|---|---|---|---|---|---|
| Chrome Alta | 1,05 | 2,8 | 0,46 | 0,03 | 1,46 | 5,8 |
| Chrome Ultra | 1,35 | 2,9 | 0,51 | 0,02 | 1,59 | 6,4 |
| Chrome Máxima | 1,28 | 4,9 | 0,45 | 0,03 | 2,81 | 9,5 |
| WebKit Auto | 1,82 | 8,2 | – | 0,06 | 0,84 | 10,9 |
| WebKit Alta | 1,65 | 16,7 | – | 0,04 | 1,64 | 20,1 |

La IA de los enemigos es ~0,7 ms; proyectiles y combate, <0,2 ms. Pasar la simulación a otro hilo o a WASM ahorraría como
mucho ~1-1,5 ms. Basura: 23-40 MB/s con ~8 recogidas pequeñas por segundo (no sale en los fotogramas lentos).

### 2. El cuello es pintar el Canvas 2D en la GPU
`CrGpuMain` ocupado, a 60 Hz (Chrome, PC):

| calidad | aldea | tranquila | jefe | horda al tope | grieta | arena |
|---|---|---|---|---|---|---|
| Auto | 19 % | 54 % | 52 % | **98 %** | 37 % | 42 % |
| Alta | 18 % | 52 % | 50 % | **99 %** | 35 % | 38 % |
| Ultra | – | 50 % | 41 % | 64 % (48 FPS) | 36 % | 61 % |
| Máxima | 20 % | 45 % | 62 % | **97 %** | 43 % | 56 % |

FPS a 60 Hz: todas las escenas 57-60 menos la horda al tope (48-57; en otra tanda, 50-51 en Máxima). **Sin tope** (lo que da de
sí): partida tranquila 83-96 FPS y horda 40-90 FPS con p99 de 70-110 ms y 20-30 tirones en 5 s. **A 120 Hz no llega ni sin
enemigos**: con la GPU a la mitad ya a 60 FPS, el doble no cabe.

Por qué: cada `drawImage`, `fillRect`, trazado y texto es una orden aparte para la GPU (Skia). En la horda son ~1000 `drawImage`
de ~40 hojas de sprites distintas, ~1100 `fillRect`, ~100 trazados, ~100 textos y varias capas de pantalla completa, por fotograma.
Skia casi no puede agruparlas porque cambian de imagen y de estado a cada paso.

### 3. Qué capa cuesta (apagándolas una a una, Alta, 60 Hz)
- **El camino «3D sin Ultra»** (`Ultra3D.flat`: en PC con Alta, rocas y cofres en 3D obligan a pintar el suelo y el aire en
  lienzos aparte y a volcarlos): quitarlo baja la GPU de 64 a 40 % en tranquila, de 55 a 36 % en jefe y de 99,6 a 68 % en la
  horda, que pasa de 51 a 60 FPS. Es la capa más cara.
- El resto (suelo, agua, niebla, tiempo, viñeta, HUD, enemigos, efectos, proyectiles): ninguna sola baja la horda de la
  saturación; el coste está repartido entre miles de órdenes pequeñas.
- `three.js` (render del 3D) casi no cuenta: 0,45-0,5 ms de JS y apagarlo no cambia la GPU.
- Máxima suma el filtro «más nítidos» (un lienzo por fotograma de cada sprite: en el banco, de 102 a 89 FPS y de 0,9 a 5,3 ms
  de JS) y el bloom con `filter: blur` (pantalla entera).

### 4. Banco: Canvas 2D contra WebGL2 por lotes (sin tope, misma mezcla, mismo PC)

| carga | Canvas 2D | WebGL2 propio | PixiJS 8.21 |
|---|---|---|---|
| tranquila (150 sprites, 100 partículas) | 194 FPS, p99 72 ms | **2010 FPS** | 1575 FPS |
| horda (700 sprites, 1100 partículas, 90 textos) | 102 FPS, p99 37 ms | **1154 FPS**, p99 1,8 ms | 666 FPS |
| 3000 sprites, 4000 partículas | 43 FPS | **512 FPS** | 243 FPS |
| WebKit por software, horda | 23 FPS | 30 FPS (tope del software) | 29 FPS |
| WebKit por software, 3000 sprites | 9 FPS | 25 FPS | 22 FPS |

WebGL2 por lotes hace lo mismo ~11 veces más rápido en la GPU; PixiJS, ~6,5 veces (y su JS cuesta 3-4 veces más que el propio).
Los textos siguen en un lienzo 2D encima (híbrido) y aun así no pesan.

## Opciones

| opción | FPS esperados (PC) | riesgo | aspecto | iPhone / Safari | trabajo |
|---|---|---|---|---|---|
| **(a) WebGL2 propio con capa compatible con Canvas 2D** (`GL2D`: el juego sigue llamando a `drawImage`, `fillRect`, `arc`, `fillText`...; por debajo, atlas y lotes) | horda al tope 60 clavados y **120 en Alta/Ultra/Máxima** (GPU de ~99 % a ~15-25 %; JS de dibujo de 3-5 a ~1,5-2,5 ms) | medio: trazados con suavizado, degradados, recortes; pérdida de contexto en iOS | sprites, suelo y textos **idénticos al píxel** (se hornean con el mismo Canvas 2D); trazados (círculos, arcos, líneas) casi iguales (±1 px de borde) | WebGL2 desde iOS 15; Safari reparte bien los lotes en Metal. Se mantiene Canvas 2D como respaldo | 4-5 PR por pasos (núcleo, trazados, capas/bloom/Ultra, comparación y por defecto) |
| (b) PixiJS (u otra librería) | ~la mitad de la ganancia de (a) | medio-alto: es de modo «escena» (objetos que viven) y el juego dibuja al momento: hay que traducir igual; su texto y sus formas se ven distinto | cambia más (texto y formas de Pixi) | sí (WebGL2/WebGPU) | como (a) o más, +234 KB comprimidos |
| (c) Simulación en un Web Worker o en WASM (Rust/AssemblyScript) | +1 a +1,5 ms como mucho; la GPU sigue al 99 % | alto: el estado del juego son objetos ricos (combate 10 500 líneas, IA 3 400); el cooperativo y el equilibrio se tocan | igual | sí | muy alto para casi nada |
| (d) OffscreenCanvas | ~0: mueve el JS de dibujo a otro hilo, pero la GPU pinta lo mismo | medio: la interfaz es DOM y va mezclada | igual | Safari 17+ | alto |
| (e) Reescribir en Rust + wgpu (web y Windows) | como (a) en dibujo, +1 ms en simulación | muy alto: 67 000 líneas de JS, interfaz HTML/CSS «Raíces vivas», cooperativo, Firebase; el equilibrio cambiaría | la interfaz cambiaría (no hay HTML/CSS en wgpu) | WebGPU sólo desde iOS 26; en la web caería a WebGL2 igual | 6-12 meses de trabajo continuo |

### Recomendación: (a), por pasos y detrás de un interruptor
1. **Núcleo `GL2D`** (interruptor oculto, `?gl=1` y Ajustes › Gráficos «Motor de dibujo: WebGL2 (pruebas)»): estado y
   transformaciones (`save`/`restore`, `setTransform`...), `drawImage` con atlas dinámico (las imágenes se suben una vez; los
   lienzos horneados, cuando cambian), `fillRect`, `globalAlpha`, `lighter`, suavizado por dibujo, textos horneados con Canvas 2D
   en caché. Lo que aún no sepa hacer, ese fotograma va en Canvas 2D (como hoy con Ultra sin memoria).
2. **Trazados**: `arc`, `ellipse`, `lineTo`, `rect`, `fill`/`stroke` con su suavizado, discontinuas, degradados y `clip`.
3. **Capas aparte** (suelo y aire de Ultra con sus franjas de perspectiva, bloom en un shader, el 3D compartiendo la GPU).
4. **Comparación píxel a píxel** con semilla fija en las escenas clave, iPhone (pérdida de contexto), y por defecto encendido.

En cada paso: `tools/balance.cjs` y `/medir-equilibrio` idénticos (sólo cambia el dibujo), cooperativo, mando, táctil, es/en,
PWA y actualización automática. Objetivo: p99 < 16,6 ms a 60 Hz y < 8,3 ms a 120 Hz con horda al tope y grieta en este PC.

Arreglo rápido posible antes de todo (bajo riesgo, se queda corto para 120 Hz): en Alta sin Ultra, no pintar el suelo y el aire
en lienzos aparte cuando no hace falta (horda de 51 a 60 FPS en la prueba de capas).

## Sin probar
iPhone y Android de verdad (WebKit de Windows pinta por software), pantallas de 120-144 Hz de verdad (Chrome sin ventana no las
imita bien), la app de Windows (es Chromium: debería ir como Chrome).

---

# Fase 2, paso 1: el motor WebGL2 (`js/core/gl2d.js`), detrás de un interruptor
El dueño eligió **(a) WebGL2 propio**. Primer paso: el motor entero, apagado de serie. Se enciende con `?gl=1` o con Ajustes › Gráficos
«Motor WebGL2 (pruebas)» (ajuste `glDraw`, se aplica al recargar). Sin WebGL2, o si no arranca, sigue el Canvas 2D.

## Cómo funciona
`G.GL2D.create(lienzo)` da un objeto con la forma del contexto 2D: el resto del juego dibuja igual que siempre.
- **Nativo, por lotes** (una llamada de WebGL por cada 8 texturas distintas seguidas): `drawImage`, `fillRect`, `clearRect`, con
  transformaciones, `globalAlpha`, suavizado por dibujo y los modos de mezcla; las imágenes pequeñas (≤512 px) van a un atlas de
  páginas de 2048 (se vacía la página menos usada si se llenan). Un lienzo 2D se vuelve a subir sólo cuando cambia (se cuentan sus
  dibujos); una imagen, cuando cambia de dirección.
- **Formas sueltas** (círculo, elipse, rectángulo y el rectángulo redondeado del HUD, rellenos o con borde): en el shader, con la
  distancia al borde y 1 px de suavizado, como el Canvas 2D. Un `fillRect` en medio de un píxel, igual.
- **Textos** de color liso: se pintan una vez con el Canvas 2D (misma letra, mismo tamaño en píxeles) en un atlas, y luego se copian.
- **«lighter»** sobre la pantalla (opaca) va en el mismo lote que lo normal: alfa 0 con source-over premultiplicado = suma exacta.
- **Lo demás** (degradados, recortes, trazados de varias piezas, sombras, filtros): lo pinta un Canvas 2D de verdad (en la GPU) en
  un lienzo aparte y el trozo se pega en su sitio y en su orden. Se ve igual. En la horda son 1-2 trozos por fotograma.
- **Capas de game.js D3** (suelo y aire): lienzos de la GPU. Sin perspectiva, el aire va directo a la pantalla.
- **three.js** (rocas, cofres, árboles 3D) pinta en el **mismo contexto**, a una textura de media precisión; el motor la pasa a sRGB
  al pegarla (three.js sólo lo hace al pintar a la pantalla: sin eso, el 3D salía muy oscuro). Antes había que copiar su lienzo
  entero en cada fotograma. Sin MSAA: con MSAA, three.js resuelve la textura entera tras cada pasada y la GPU se saturaba.
- **Bloom de Máxima** en la GPU (mismo filtro de color, gaussiana y suma con 0,34), sin lienzos 2D ni subidas.
- Como el Canvas 2D: transformaciones y trazados con `NaN`/`Infinity` no hacen nada (si se aplicaban, la matriz quedaba con `NaN` y
  desaparecía lo de después: así se perdían las llegadas de los legendarios en la arena).

## Herramientas nuevas
- `perf.cjs --gl` (motor nuevo) y `QX='&glgpu=1'`: tiempo real de la GPU por partes con `EXT_disjoint_timer_query_webgl2`
  (`dibujo`, `3d`, `respaldo`). `GLDBG=1`: qué va al respaldo, qué se sube y por qué se corta cada lote.
- `tools/gl-compara.cjs`: reloj falso y un **espejo** (`G.GL2D.tee`): cada orden de dibujo va también a un Canvas 2D de verdad, en
  el mismo fotograma. Saca las dos capturas, la diferencia en rojo y cuántos píxeles cambian.

## Se ve igual
`tools/gl-compara.cjs`, píxeles con diferencia de más de 24 (de 255) en algún canal:

| escena | Alta | Ultra | Máxima |
|---|---|---|---|
| tranquila | 0,08 % | 0,09 % | 0,09 % |
| jefe | 0,8 %* | 0,11 % | 0,10 % |
| horda al tope | 0,28 % | 0,46 % | 0,35 % |
| túnel de la grieta | 0,02 % | 0,02 % | 0,02 % |
| arena (con la llegada del legendario) | 0,19 % | 0,17 % | 0,18 % |

Lo que cambia: medio píxel en los números de daño y el HUD (se colocan en píxeles enteros), bordes de barras finas. (*) En el jefe
de Alta, un árbol y una roca 3D que el espejo lee antes de tiempo: en la captura de WebGL2 están bien. Aparte, comparado con capturas:
el 3D sin MSAA tiene los bordes algo más escalonados.

## Rendimiento
PC del dueño (Ryzen 7 7735U, Radeon 680M), Chrome, 1920×1080, 60 Hz. **Máquina tranquila** (una tanda de cada):

| calidad | escena | Canvas 2D | WebGL2 |
|---|---|---|---|
| Alta | tranquila | 60 FPS, JS 2,2 ms, GPU (hilo) 52 % | 60 FPS, JS 3,1 ms, GPU (hilo) 37 %, GPU real 3,7 ms |
| Alta | horda al tope | 51-57 FPS, JS 5,8-9,8 ms, GPU 97-99 % | **60 FPS**, JS 7,7 ms, GPU 59 %, GPU real 5,1 ms |
| Máxima | tranquila | 60 FPS, JS 3,3 ms, GPU 45 % | 59 FPS, JS 4,1 ms, GPU 41 %, GPU real 5,3 ms |
| Máxima | horda al tope | 50-58 FPS, JS 9,5 ms, GPU 97 % | **60 FPS**, JS 12 ms, GPU 82 %, GPU real 7,9 ms |

**Máquina cargada** (otras sesiones y Edge usando CPU y GPU), dos tandas intercaladas, medianas:

| calidad | escena | FPS 2D → GL | JS ms | p99 ms | GPU (hilo) | tirones (5 s) |
|---|---|---|---|---|---|---|
| Alta | tranquila | 46 → 55 | 3,9 → 4,2 | 13,8 → 11,5 | 52 → 49 % | 1 → 0 |
| Alta | horda al tope | 39 → 53 | 12,4 → 10,8 | 28,8 → 31,9 | 94 → 65 % | 6 → 1,5 |
| Alta | grieta | 45 → 51 | 5,5 → 6,0 | 45,6 → 21,9 | 53 → 62 % | 3 → 3 |
| Alta | arena | 45 → 49 | 8,3 → 9,2 | 20,2 → 24,4 | 76 → 70 % | 0,5 → 4 |
| Máxima | tranquila | 54 → 54 | 4,9 → 4,9 | 23,8 → 22,7 | 54 → 58 % | 1,5 → 2 |
| Máxima | horda al tope | 40 → 47 | 18,7 → 14,7 | 64 → 36 | 95 → 85 % | 6 → 6,5 |
| Máxima | grieta | 44 → 50 | 10,3 → 7,2 | 52 → 34 | 72 → 66 % | 11 → 5 |
| Máxima | arena | 45 → 51 | 12,1 → 8,8 | 34 → 26 | 76 → 76 % | 9 → 4,5 |

Cómo leerlo: «GPU (hilo)» es el proceso de la GPU de Chrome (traducir órdenes y esperar a la tarjeta); «GPU real» es lo que tarda la
tarjeta (consultas de tiempo). El motor nuevo quita el cuello de la GPU en la horda: a 60 Hz va holgado donde el Canvas 2D no llegaba.
**Lo que falta para 120 Hz** es el JavaScript: con la horda al tope, 8-12 ms por fotograma (con Canvas 2D, 6-10). Es el siguiente paso.

## Equilibrio y lo demás
- `node tools/balance.cjs --pasivos --todas --json`: el mismo archivo byte a byte con y sin estos cambios (sólo cambia el dibujo).
- Tests: `node --test "tests/*.test.cjs"` 318/319; la de tiempos «ai performance» falla con la máquina cargada y sola pasa.
  Nuevo `tests/gl2d.test.cjs`.
- La versión compilada (`index.html`) arranca y juega con `?gl=1` sin errores.
- WebKit con perfil de iPhone (por software en Windows): arranca y juega sin errores; más lento que su Canvas 2D por software, lo que
  no dice nada de un iPhone de verdad (Metal).

## Siguientes pasos
1. Bajar el JavaScript del dibujo (horda: 8-12 ms) para el p99 < 8,3 ms a 120 Hz.
2. Ultra y Máxima con perspectiva: la capa del aire alterna «lighter» y normal (~100 llamadas). Con el truco de alfa 0 también allí,
   1,7 ms menos de GPU y 1 ms menos de JS, pero los brillos de fuego salen algo más claros (0,8 % de píxeles): decide el dueño.
3. Probar en iPhone y Android de verdad, y con la app de Windows; luego encenderlo de serie.
