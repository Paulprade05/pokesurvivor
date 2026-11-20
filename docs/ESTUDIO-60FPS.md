# Estudio: 60 FPS estables como mínimo (20/21-11-2026, rama `estudio-60fps`, sólo estudio)

Pedido del dueño: «Estudia que es lo que podrías hacer para que este lo más optimizado posible y que siempre vaya bien a mínimo 60
fps estables». Parte de la rama `tirones` (PR #90, sin juntar). **No cambia el juego**: sólo `tools/perf.cjs` (escena `peor`,
`--movil`, `--lento`) y este documento. Los prototipos se hicieron en copias aparte (`../pokesurvivor-tmp/60fps/proto`) y se tiraron.
Sigue a `docs/RENDIMIENTO.md` y `docs/FPS-TECNOLOGIA.md` (motor WebGL2, banco Canvas 2D / WebGL2 / PixiJS).

## Cómo se ha medido
- **PC de referencia**: este portátil, AMD Ryzen 7 7735U con gráfica integrada Radeon 680M, 32 GB, Chrome del sistema a 60 Hz,
  1536×864 ×1,25. Calidades Máxima (la de serie del PC) y Alta, con Canvas 2D y con el motor WebGL2 (`?gl=1`, GPU medida con
  `glgpu=1`: tiempo real de la gráfica por fotograma).
- **Móvil flojo (aproximado)**: Chrome con perfil de móvil táctil (Pixel 7 en horizontal, 915×412 ×2,6, el juego entra en modo
  móvil y calidad Auto) y la **CPU 4 veces más lenta** (`--lento 4`: un Android de gama media-baja; ×6, uno muy flojo). La GPU sigue
  siendo la del PC: esta prueba mide la CPU, no la gráfica del móvil.
- **WebKit con perfil de iPhone 15**: en Windows pinta por software (ni Metal ni la GPU del iPhone): sirve para el JavaScript, no
  para la gráfica. Un iPhone de verdad no se ha podido probar.
- **Escenas** (`tools/perf.cjs`, semilla fija, inmortal, 6 s): `tranquila`; `hordamax` (minuto 19, 4 ataques evolucionados y
  fusionados, enemigos hasta el tope del juego: ~66-86); **`peor`** (nueva: `hordamax` y además una lluvia de ~470 disparos enemigos
  en el aire: el peor caso que pide el dueño); `lluvia` (120 enemigos y ~420 disparos); `multitud` (600 enemigos, 6 veces el tope del
  juego: prueba de estrés); `grieta` (viaje y llegada) y `arena`.
- Máquina tranquila salvo en los prototipos del móvil flojo (otras sesiones: la base bajó de 37 a 28 FPS entre tandas; por eso cada
  prototipo se compara con su base intercalada).
- Medidas en `../pokesurvivor-tmp/60fps/` (`medir.sh`, `proto.sh`, `presupuesto.cjs` saca las tablas).

## 1. El presupuesto de 16,6 ms
Un fotograma a 60 FPS tiene 16,6 ms para **todo**: el JavaScript del juego (simulación y órdenes de dibujo), la gráfica pintando y
las recogidas de basura. JS en ms de media por fotograma; GPU: en Canvas 2D, % del hilo de la gráfica de Chrome ocupado (99 % =
saturada); en WebGL2, ms reales de la gráfica (dibujo + 3D).

### PC de referencia, Canvas 2D (lo de hoy)
| Calidad | Escena | FPS | JS total | simulación (IA) | dibujo | 3D | GPU | recogidas grandes en 6 s (la peor) |
|---|---|---|---|---|---|---|---|---|
| Máxima | tranquila | 59,9 | 3,2 | 0,3 (0,1) | 0,8 | 0,8 | 91 % | 1 (4 ms) |
| Máxima | horda al tope | 44,8 | 10,8 | 1,4 (0,8) | 5,6 | 0,6 | **99,6 %** | 3 (7 ms) |
| Máxima | **peor** | **33,0** | 14,4 | 1,6 (0,9) | 8,3 | 0,5 | **99,5 %** | 3 (7 ms) |
| Máxima | lluvia | 28,4 | 17,2 | 2,0 (1,3) | 11,3 | 0,6 | 99,2 % | 4 (12 ms) |
| Máxima | multitud (600) | 19,2 | 30,0 | 5,9 (4,6) | 18,8 | 0,8 | 99,2 % | 3 (10 ms) |
| Máxima | grieta | 54,7 | 5,3 | 0,2 | 1,5 | 0,9 | 56 % | 1 (7 ms) |
| Alta | horda al tope | 53,1 | 6,5 | 1,3 (0,7) | 3,3 | 0,5 | 99,3 % | 3 (6 ms) |
| Alta | **peor** | **37,6** | 9,5 | 1,3 (0,7) | 4,9 | 0,5 | 99,4 % | 3 (7 ms) |

**Lo que sale**: en el PC con Canvas 2D el JavaScript cabe (10-14 ms en el peor caso), lo que no cabe es **la gráfica pintando el
Canvas 2D** (miles de órdenes sueltas; ya visto en `FPS-TECNOLOGIA.md`). Bajar la resolución casi no ayuda (peor caso en Máxima:
×1,25 → 39 FPS, ×1 → 43, ×0,75 → 43): no es cuestión de píxeles sino de órdenes.

Qué pesa en la gráfica (peor caso, Máxima, Canvas 2D, 33 FPS; apagando una capa cada vez, `--quitar`):

| Sin… | FPS |
|---|---|
| (nada) | 33 |
| el 3D de Ultra (rocas, árboles, muros) | **53** |
| los enemigos | **51** |
| los proyectiles | 46 |
| los efectos (partículas, impactos) | 39 |
| HUD, suelo, sombras de sprites, aire, clima | 32-36 (nada) |

### PC de referencia, motor WebGL2
| Calidad | Escena | FPS | p99 hueco | JS total | simulación | dibujo | GPU ms (dibujo + 3D) | recogidas grandes (peor) |
|---|---|---|---|---|---|---|---|---|
| Máxima | tranquila | 59,9 | 16,9 | 2,5 | 0,3 | 0,9 | 9,5 + 1,8 | 1 (4 ms) |
| Máxima | horda al tope | **59,9** | 16,8 | 5,8 | 1,4 | 2,9 | 10,3 + 2,4 | 3 (5 ms) |
| Máxima | **peor** | **59,9** | 16,8 | 7,7 | 1,5 | 4,6 | 10,7 + 2,0 | 2 (5 ms) |
| Máxima | lluvia | 60,1 | 16,9 | 8,2 | 1,9 | 4,7 | 10,7 + 1,6 | 2 (6 ms) |
| Máxima | multitud (600) | 47,1 | 33,6 | 18,8 | 6,3 | 9,6 | 16,3 + 1,7 | 3 (6 ms) |
| Máxima | grieta | 57,4 | 50 | 3,0 | 0,2 | 1,1 | 10,0 + 1,3 | 1 (6 ms) |
| Alta | **peor** | **60,1** | 16,8 | 5,9 | 1,2 | 3,4 | 8,4 + 2,9 | 2 (4 ms) |
| Alta | multitud (600) | 58,6 | 33,4 | 14,2 | 5,2 | 6,7 | 11,8 + 2,0 | 3 (5 ms) |

**Con WebGL2 el PC de referencia ya aguanta el peor caso a 60 FPS** en Máxima y en Alta (p99 16,8 ms, 0-1 huecos de más de 33 ms
en 6 s). En Máxima la gráfica gasta ~10 ms por fotograma incluso en una partida tranquila (resolución ×2, bloom, filtro de sprites
en la GPU): queda margen en este PC, pero una gráfica más floja que la Radeon 680M no lo tendría. Las llamadas de dibujo son 12-40
por fotograma (el motor ya agrupa por lotes de 8 imágenes): **atlas e instancing no ganarían casi nada**.

### Móvil flojo (Chrome perfil Pixel 7, CPU ×4, calidad Auto)
| Motor | Escena | FPS | JS total | simulación (IA) | dibujo (enemigos / proyectiles / efectos) | otros | recogidas grandes (peor) |
|---|---|---|---|---|---|---|---|
| Canvas 2D | horda al tope | 27,3 | 26,6 | 7,4 (5,1) | 15,8 (5,3 / 1,7 / 3,4) | 3,2 | 2 (17 ms) |
| Canvas 2D | **peor** | **19,4** | 38,3 | 6,8 (4,4) | 26,7 (10,6 / 8,7 / 2,4) | 4,6 | 2 (18 ms) |
| Canvas 2D | grieta | 51,8 | 7,6 | 0,9 | 4,6 | 2,0 | 1 (23 ms) |
| WebGL2 | horda al tope | 38,3 | 22,1 | 6,0 (4,0) | 13,1 (3,1 / 0,7 / 3,1) | 2,9 | 1 (13 ms) |
| WebGL2 | **peor** | **36,6** | 24,0 | 5,1 (3,5) | 15,9 (3,4 / 4,7 / 3,2) | 2,7 | 0 |
| WebGL2 | grieta | 58,4 | 8,1 | 0,9 | 4,4 | 2,7 | 1 (22 ms) |
| WebGL2, CPU ×6 | peor | 18,3 | 48,2 | 11,1 (7,5) | 29,6 | 7,0 | – |

En el móvil flojo **manda la CPU**: la gráfica (la del PC) va sobrada (1,3-3 ms), pero sólo el JavaScript ya pasa de 16,6 ms en
cualquier horda. Las recogidas grandes llegan a 13-24 ms: ellas solas se comen un fotograma.

### WebKit con perfil de iPhone 15 (dibujo por software: sólo vale el JS)
Auto: peor caso 23 FPS con JS 12,8 ms (dibujo de enemigos 8,3); Alta: 15 FPS con JS 23 ms. Hasta la escena tranquila va a 35 FPS:
es el pintor por software de Windows, no el iPhone. La simulación cuesta lo mismo que en el PC (1,3 ms): la CPU de un iPhone
reciente se parece a la del PC; su gráfica (Metal) no se ha medido.

## 2. Opciones, de la más rentable a la menos

| # | Opción | Ganancia medida o esperada | Coste | Riesgo | ¿Cambia cómo se ve? |
|---|---|---|---|---|---|
| 1 | **WebGL2 de serie** (empezando por PC y la app de Windows) | **Medida**: PC Máxima peor caso 33 → 60 FPS, horda al tope 45 → 60, lluvia 28 → 60; Alta peor caso 38 → 60. Móvil flojo peor caso 19 → 37 | Medio: pruebas en aparatos reales y cambiar el valor de serie | Medio | No (0,02-0,5 % de píxeles distintos, `gl-compara.cjs`) |
| 2 | **Calidad dinámica de verdad** (por FPS, en todas las calidades, que baje y vuelva a subir) | Según el escalón: 3D de Ultra fuera en Canvas 2D +20 FPS (33 → 53); calidad Baja en el móvil flojo con WebGL2 +3 FPS en el peor caso y horda al tope 56; resolución: en Canvas 2D +4 FPS, en WebGL2 sólo si la gráfica se satura | Medio | Bajo | Sí, pero sólo mientras hace falta |
| 3 | **Menos JS dibujando enemigos y proyectiles** (un paso por enemigo sin `save`/`restore`, sombra y barra juntas, proyectil en una sola imagen con su sombra y halo, nada para lo que no se ve) | Cota medida en el móvil flojo con WebGL2: sin dibujar enemigos −8 ms, sin proyectiles −7 ms, sin efectos −4 ms. Esperado: un 30-50 % de eso, **−5 a −9 ms** | Medio | Bajo | No |
| 4 | **Pools (menos basura)**: proyectiles (cada uno es un objeto nuevo con su `Set`), formas del motor WebGL2 (`_shape`, 14 MB/s), dibujo de `fx.js`, `enemy.update` | No sube la media: quita picos. Recogidas grandes de 5-7 ms en el PC y 13-24 ms en el móvil flojo, 2-4 cada 6 s | Bajo-medio | Bajo | No |
| 5 | **Límites de diseño**: tope de disparos enemigos vivos (p. ej. 150) y de enemigos dibujados en pantalla en móvil | Peor caso → horda al tope: en el móvil flojo con calidad Baja, 31 → 56 FPS (la lluvia es lo que sobra) | Bajo | Medio: cambia el juego | Sí (menos disparos a la vez) |
| 6 | **Llegada a la grieta en WebGL2**: subir a la gráfica las texturas de la arena en el túnel | Queda un fotograma de 83-133 ms al llegar (JS 15-25 ms: el resto es de la gráfica; lo más probable, subir las texturas y lienzos nuevos de la arena, sin confirmar) | Bajo | Bajo | No |
| 7 | **IA de los enemigos** más barata (ya va con rejilla; búsquedas y caminos) | 0,8-1,4 ms en el PC; 3,5-5 ms en el móvil flojo: como mucho −2 ms | Medio | Medio (la toca otra sesión) | No |
| 8 | Paso fijo de simulación separado del dibujo | **0 FPS**: hoy el paso es variable con tope de 1/30 s (por debajo de 30 FPS el juego va a cámara lenta). Un paso fijo da el mismo juego a cualquier FPS, no más FPS | Medio | Medio (equilibrio, cooperativo) | No |
| 9 | Simulación en un Web Worker / OffscreenCanvas | Como mucho lo que cuesta la simulación: 1,5 ms en el PC, 5-7 ms en el móvil flojo. OffscreenCanvas no baja el trabajo de la gráfica | **Muy alto** (el estado del juego son objetos ricos; combate 10 500 líneas; cooperativo) | Alto | No |
| 10 | Atlas de sprites e instancing | ~0: con WebGL2 ya son 12-40 llamadas por fotograma | Medio | Bajo | No |
| 11 | three.js / 3D de Ultra | Con WebGL2: 0,5-0,9 ms de JS y 1,2-3 ms de gráfica (ya barato). Con Canvas 2D, componer el 3D cuesta 20 FPS en el peor caso | – | – | – |
| ✗ | Proyectiles en lote dibujando sombra y aro como imagen | **Medido dos veces, 0**: Canvas 2D (PC y WebKit) y WebGL2 en el móvil flojo, dentro del ruido. Descartado | – | – | – |
| ✗ | Bajar la resolución con Canvas 2D | +4 FPS (39 → 43) en el peor caso: no es el cuello | – | – | Sí |

### Qué le falta al motor WebGL2 para dejar de ser «pruebas»
- **Probarlo en aparatos reales**: iPhone (Safari 15+, Metal), Android (Chrome, gráficas Mali/Adreno), la app de Windows, el
  cooperativo, el mando y táctil. Nada de eso se ha probado aún con el motor encendido.
- **Pérdida de contexto**: el motor se recupera (`webglcontextrestored`), pero el 3D de Ultra se apaga para el resto de la sesión
  (`ultra3d.js on()`: «este 3D se apaga y queda el 2D»). En iPhone pasa al volver de otra app: hay que rehacer el 3D en vez de
  apagarlo.
- **Dos decisiones del dueño pendientes desde el 14-11**: antialias del 3D (ahora sin él) y el truco de brillos «lighter» en la capa
  del aire (−1,7 ms de gráfica, llamas algo más claras).
- **Qué rompe**: nada conocido. Lo que no sabe pintar va por el respaldo en Canvas 2D (0,2-0,8 ms de gráfica); sin WebGL2 el juego
  sigue en Canvas 2D solo. Ojo: con WebGL2 sale más basura (35-46 MB/s en el peor caso, frente a 29) por las formas (`_shape`):
  con más recogidas pequeñas, aunque las grandes son igual o menos.
- Encenderlo de serie: `glDraw` por defecto en `true` (o según el aparato), dejar el interruptor en Ajustes para volver al Canvas 2D.

## 3. Plan por fases

| Fase | Qué | PC de referencia (peor caso) | Móvil medio (iPhone 12+, Android de gama media: CPU ×2-3) | Móvil flojo (CPU ×4) |
|---|---|---|---|---|
| 0 | Hecho (PR #90, `tirones`): filtro de sprites, grieta preparada en el túnel, lienzo 3D que sólo crece | 33 (Máxima), 38 (Alta) | – | 19 |
| 1 | **WebGL2 de serie en PC y app de Windows** (y, en Canvas 2D, el 3D de Ultra como primer escalón de la calidad dinámica) | **60** medido | sin cambio | sin cambio |
| 2 | **Calidad dinámica real + pools + menos JS de dibujo** (opciones 2, 3, 4, 6) | 60, p99 < 16,7 ms | 50-60 esperado con WebGL2 | 30-45 esperado |
| 3 | **WebGL2 de serie en móvil**, tras probar en iPhone y Android reales (y el 3D tras perder el contexto) | 60 | **60** esperado en la horda al tope | 37 medido → ~45 con la fase 2 |
| 4 | **Límites de diseño** (sólo si el dueño quiere): tope de disparos enemigos vivos y de enemigos dibujados en móvil | 60 | 60 en el peor caso | ~55-60 esperado |

**¿Se pueden garantizar 60 FPS en el peor caso?**
- **PC de referencia (Ryzen 7 7735U / Radeon 680M)**: **sí, con WebGL2** (medido: 59,9-60,1 FPS, p99 16,8 ms en Máxima y Alta). Con
  Canvas 2D, no (33-38 FPS: la gráfica satura). Con una gráfica integrada más vieja, Máxima con WebGL2 puede no llegar (gasta
  ~10-13 ms de gráfica): ahí la calidad dinámica tendría que bajar a Alta (8-11 ms).
- **Móvil medio**: probable con WebGL2 y la fase 2, **sin medir en un aparato real**.
- **Móvil flojo (CPU ×4 o peor)**: **no, sin tocar el diseño**. Aun quitando todo el dibujo de enemigos y proyectiles el JavaScript
  se queda en ~13-20 ms, y la simulación sola ya gasta 5-7 ms (11 con CPU ×6). Con ~85 enemigos y ~470 disparos a la vez no cabe en
  16,6 ms: hace falta la fase 4 (menos disparos vivos) o aceptar 30-45 FPS en ese aparato.
- **Multitud de 600 enemigos** (6 veces el tope del juego): ni en el PC con WebGL2 en Máxima (47 FPS; 58,6 en Alta). No pasa en
  partida normal.

## Recomendación (por orden)
1. **WebGL2 de serie en PC y en la app de Windows** — peor caso en el PC de 33 a 60 FPS. Primero probarlo en la app y en cooperativo.
2. **Calidad dinámica de verdad** — que baje sola el 3D de Ultra, el filtro, el bloom y la resolución cuando no llega a 60, y vuelva a
   subir. En Canvas 2D, sólo el 3D: de 33 a 53 FPS en el peor caso.
3. **Menos JavaScript dibujando enemigos y proyectiles** — −5 a −9 ms por fotograma en el móvil flojo (cota medida −15 ms).
4. **Pools para quitar basura** — quita los picos de 5-24 ms de las recogidas grandes (no sube la media).
5. **WebGL2 de serie en móvil** tras probarlo en un iPhone y un Android reales; y decidir con el dueño un tope de disparos enemigos
   vivos si se quiere garantizar 60 en móviles flojos.

## Sin medir
iPhone y Android reales (WebKit en Windows pinta por software; el «móvil flojo» es Chrome con la CPU frenada y la gráfica del PC),
pantallas de 120 Hz, la app de Windows, cooperativo. La ganancia de las opciones 2, 3, 4 y 6 es estimada (cotas medidas quitando
capas); la de la 1 y la 5, medida.
