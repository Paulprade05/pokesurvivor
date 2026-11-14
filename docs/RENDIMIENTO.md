# Rendimiento: tirones y calor (14-11-2026, rama `rendimiento`)

Pedido del dueño («Fallos de esta versión»): «Quiero mejor optimizacion del codigo para que no de tirones, por ejemplo al entrar
a grietas o cuando hay muchos proyectiles los fps bajan y los dispositivos se sobrecalientan».

## Cómo se mide: `tools/perf.cjs`
Juega solo seis escenas con semilla fija (4242), como invitado y en local, y mide cada fotograma:

| Escena | Qué hace |
|---|---|
| `aldea` | el menú con la aldea 3D |
| `tranquila` | partida al principio, sin oleadas |
| `jefe` | el 5.º jefe del calendario delante |
| `horda` | minuto 14, 4 ataques evolucionados y fusionados en un grupo (Semilladora, Lanzallamas, Canto Helado, Meteoros) y 5 oleadas seguidas |
| `grieta` | se abre una grieta y entras: viaje por el túnel y llegada (aquí se ven los tirones) |
| `arena` | la arena de los legendarios, ya dentro |

```bash
# Chrome del sistema, 60 Hz, las tres calidades; playwright-core de la caché de npx (o npm i --prefix <tmp>/pw playwright-core@1.64)
node tools/perf.cjs --pw <node_modules> --calidad auto,high,max --seg 6 --out <carpeta>
# WebKit con el perfil de iPhone 15 en horizontal (no es Safari de verdad)
node tools/perf.cjs --pw <node_modules> --nav webkit --calidad auto,high --out <carpeta>
# otra versión del juego (p. ej. un worktree de origin/main) con la misma herramienta
node tools/perf.cjs --pw <node_modules> --raiz ../ps-perf-base ...
# perfil de CPU por escena (.cpuprofile, se abre en DevTools) y qué funciones gastan en los fotogramas de más de 50 ms
node tools/perf.cjs ... --perfil
# tabla antes → después
node tools/perf.cjs --comparar <antes> <despues>
```

Mide FPS, ms de CPU del fotograma (media, p95, p99), tirones (huecos de más de 50 ms entre fotogramas), el peor hueco, basura
(lo que crece el montón por segundo y cuántas veces se recoge; sólo Chrome), y por fotograma: `drawImage`, `fillRect`, `save`,
textos medidos, cambios de `filter` y `shadowBlur`, llamadas de WebGL, shaders compilados, lienzos creados y cambios del DOM.
`--sin-contar` quita los contadores (cuestan un poco por llamada); `--sin-tope` quita vsync y el tope de FPS (lo que da de sí; ojo:
la cola de la GPU crece y las lecturas del lienzo esperan mucho más que de verdad).

**Ruido:** las medidas del 13 y 14-11 se hicieron en el portátil del dueño (Ryzen 7 7735U, Radeon integrada) con otras sesiones
de Claude usando CPU y GPU a la vez: la misma versión daba 60 FPS y, diez minutos después, 19. Por eso se comparan antes y después
intercalados y con varias repeticiones (medianas), y se cuenta sobre todo lo que no depende del ruido: qué hay en los fotogramas lentos.

## Lo que se encontró y se arregló
1. **Testigo de lienzos cada 1,5 s** (`game.js` gfxCheck → `G.U.canvasAlive`). Para Safari en iOS (vacía lienzos sin avisar), pero
   corría en todos: lee dos lienzos de la GPU y eso obliga a esperar a que la GPU acabe todo lo pendiente. En los perfiles de Chrome
   sin tope era lo que más tiempo se llevaba en los fotogramas lentos (del 72 al 98 %: fotogramas de 0,1 a 3 s); a 60 Hz, menos, pero cada 1,5 s. Ahora sólo en iOS; en los
   demás, una vez al volver a la pestaña.
2. **Horneados que leen píxeles** (`getImageData`) sobre lienzos de la GPU, a mitad de partida: tono del mapa, bordes, flora y agua
   de cada bioma (`tileset.js`), brillo de cristales y ascuas (`anim.js` sheen), la altura de cada animación de un Pokémon nuevo
   (`sprites.js` frameTops). Ahora van en lienzos de la memoria normal (`willReadFrequently`), como ya iban los árboles. Medido aparte:
   leer un lienzo de la GPU recién pintado, 140 ms; uno de la memoria normal, 0,1 ms; dibujarlos luego cada fotograma cuesta lo mismo.
3. **Llegar a la arena de la grieta**: el mapa nuevo se horneaba entero (6-12 chunks) en un fotograma, en mitad del túnel. Ahora,
   mientras el túnel lo tapa todo (`G.Rift.traveling`), 2 ms de horneado por fotograma (como el fundido de bioma); quedan 1,5 s de
   túnel. Y el tileset de la arena se pide al empezar el viaje (`rift.js` begin), no al llegar.
4. **Tope de FPS** (Ajustes › Gráficos › Límite de FPS, `fpsCap`): 60 de serie, 30 o sin límite. En pantallas de 120-144 Hz el
   bucle iba a 120-144 FPS: el doble de calor y batería. Si un aviso de la pantalla llega antes de tiempo (margen de 3 ms), se salta.
5. **Resolución dinámica con Auto** (`game.js` Dyn): si la partida va por debajo del 80 % de su ritmo 3 s seguidos y Auto ya bajó
   los efectos, la resolución interna baja ×0,85 y luego ×0,7 (nunca por debajo de ×1) hasta la siguiente partida.
6. **Menos trabajo al dibujar**: `G.VFX.draw` sin `save`/`restore` ni `translate` cuando el sprite no gira ni se voltea (casi todos);
   la aldea consulta el DOM una vez por fotograma (`covered`), no tres.
7. **Lienzo sin tamaño al empezar** (pestaña o panel oculto, 14-11-2026; también pasaba en `main`): `drawEdge` dividía entre `w = 0`,
   el degradado salía con NaN y fallaba cada fotograma; a los 180 seguidos se cerraba la partida. Ahora `drawEdge` no hace nada sin
   tamaño y `game.js` no dibuja la partida hasta que el lienzo lo tiene. Test en `tests/rendimiento.test.cjs`.
8. La pestaña oculta ya pausaba la partida (y `requestAnimationFrame` no corre): sin cambios.

## Lo que no se tocó (y por qué)
- **Partículas**: ~1000 `fillRect` por fotograma en la horda. Probado aparte: agruparlas por color no gana nada y pintarlas con un
  solo trazado es 8 veces peor (la GPU con trazados). Ya tienen tope por calidad.
- **Colisiones**: ya hay rejilla espacial (`EnemyMgr` grid de 52 px, `queryCircle`); no aparece en los fotogramas lentos.
- **Números de daño**: ya con tope, se juntan, y la fuente se pone una vez por tanda. `measureText` sale 7 veces por fotograma.
- **`ctx.filter` / `shadowBlur`**: sólo el bloom de Máxima (2 filtros por fotograma), medido en su día en ~0,3 ms.
- **Música**: se sintetiza con nodos de WebAudio por nota (`audio.js`): 2-5 % del hilo principal en las arenas. Pasarla a búferes
  pregrabados ahorraría algo, pero cambia cómo suena: queda para otra vez.
- **3D de la partida y la aldea** (`props3d.js`, `ultra3d.js`, `village3d.js`): en PC Alta/Máxima, el 3D de la partida es el 10-15 %
  de cada fotograma, y al llegar a la arena construye geometría y atlas en un fotograma (0,2-0,35 s). En la aldea, three.js es el
  75 % (≈196 llamadas de WebGL por fotograma). Se pasaron las medidas a la sesión del 3D (no se tocan sus archivos aquí).

## Medidas (14-11-2026)
Antes y después con la misma herramienta, intercalados (antes, después, antes...), 6 s por escena, sin contadores (`--sin-contar`),
mediana de las repeticiones. Dos tandas: con la máquina tranquila sobre el `main` de hoy, y con la máquina cargada sobre el de ayer.

### Máquina tranquila, sobre `main` 7d9213cf (con la pausa, el agua y los muros 3D del PR #66)
**Chrome** (del sistema, Radeon integrada del Ryzen 7 7735U, 1536×864 a ×1,25 = 1920×1080, 60 Hz), 4 repeticiones por lado:

| calidad | escena | FPS | ms media | p95 | p99 | tirones >50 ms (6 s) | peor fotograma ms |
|---|---|---|---|---|---|---|---|
| Auto | aldea | 55.5 → 54.6 | 2.45 → 2.26 | 3.1 → 2.9 | 5.8 → 3.5 | 0 → 0 | 17.3 → 17.4 |
| Auto | tranquila | 55 → 54.8 | 2.25 → 2.23 | 2.8 → 2.9 | 6.5 → 4 | 0 → 0 | 25.4 → 17.6 |
| Auto | jefe | 54.8 → 54.8 | 2.96 → 2.82 | 4.4 → 3.9 | 6.9 → 6 | 0 → 0 | 17.5 → 17.3 |
| Auto | horda | 54.8 → 55 | 5.32 → 5.44 | 7.1 → 7.4 | 9.7 → 8.2 | 0 → 0 | 25.7 → 17.5 |
| Auto | grieta | 53.2 → 54.3 | 2.83 → 2.6 | 4.4 → 3.9 | 8.9 → 6.1 | 3 → 2 | 116.7 → 75.3 |
| Auto | arena | 55 → 55.5 | 3.84 → 3.45 | 5.6 → 4.6 | 11.4 → 6.5 | 0 → 0 | 25.6 → 18 |
| Alta | aldea | 55.2 → 54.8 | 2.41 → 2.25 | 3.1 → 2.8 | 5.7 → 3.7 | 0 → 0 | 20.8 → 25.5 |
| Alta | tranquila | 54.8 → 55.1 | 2.28 → 2.13 | 2.9 → 2.7 | 6.6 → 3.4 | 0 → 0 | 19 → 17.5 |
| Alta | jefe | 54.8 → 55.1 | 2.98 → 2.9 | 4 → 4.4 | 5.4 → 5.9 | 0 → 0 | 17.3 → 18.1 |
| Alta | horda | 54.8 → 54.7 | 5.95 → 5.29 | 7.4 → 6.9 | 10.1 → 7.8 | 0 → 0 | 25.4 → 25.7 |
| Alta | grieta | 52.8 → 53.2 | 2.63 → 2.61 | 4.2 → 3.6 | 11.1 → 6.9 | 3 → 3 | 100.2 → 83.5 |
| Alta | arena | 55.2 → 54.7 | 3.78 → 3.59 | 5.5 → 5 | 9.8 → 6.5 | 0 → 0 | 25.5 → 25.6 |
| Máxima | aldea | 54.7 → 54.9 | 2.47 → 2.26 | 3.2 → 2.8 | 5.7 → 3.5 | 0 → 0 | 25.5 → 25.5 |
| Máxima | tranquila | 54.7 → 54.6 | 3.34 → 3.17 | 5.4 → 4.1 | 13.3 → 8 | 0 → 0 | 33.4 → 33.4 |
| Máxima | jefe | 55 → 54.9 | 4.42 → 4.44 | 6.6 → 6.6 | 8.7 → 8.9 | 0 → 0 | 25.7 → 25.6 |
| Máxima | horda | 51.2 → 53.6 | 9.08 → 8.55 | 12.3 → 11 | 18.9 → 12.5 | 1 → 0 | 50.1 → 33.4 |
| Máxima | grieta | 52.4 → 53.5 | 4.6 → 4.23 | 5.9 → 5.8 | 12.9 → 8 | 3 → 2 | 116.9 → 83.5 |
| Máxima | arena | 55.1 → 54.9 | 5.22 → 5.24 | 7.4 → 6.9 | 12.1 → 8.4 | 0 → 0 | 25.5 → 25.4 |

**WebKit** con el perfil de iPhone 15 en horizontal (852×393 ×3), 3 repeticiones. En Windows, WebKit dibuja por software y va a
12-38 FPS: vale para comparar los ms de cada fotograma, no para saber cómo va un iPhone de verdad. A menos de 25 FPS, «tirones de
más de 50 ms» casi no dice nada (un fotograma normal ya dura 40-80 ms). El testigo de lienzos sigue en iOS (también aquí).

| calidad | escena | FPS | ms media | p95 | p99 | tirones >50 ms (6 s) | peor fotograma ms |
|---|---|---|---|---|---|---|---|
| Auto | aldea | 27.7 → 27.5 | 2.52 → 2.34 | 4 → 4 | 6 → 5 | 2 → 2 | 59 → 55 |
| Auto | tranquila | 32.5 → 38.2 | 1.81 → 1.48 | 5 → 4 | 10 → 5 | 0 → 0 | 45 → 38 |
| Auto | jefe | 28.3 → 34.3 | 4.07 → 2.77 | 10 → 6 | 12 → 8 | 2 → 0 | 52 → 45 |
| Auto | horda | 25 → 29.8 | 8.7 → 5.64 | 16 → 12 | 20 → 15 | 6 → 0 | 58 → 49 |
| Auto | grieta | 30.8 → 36.8 | 3.01 → 2.02 | 10 → 7 | 25 → 9 | 2 → 1 | 93 → 63 |
| Auto | arena | 28.7 → 35.7 | 3.46 → 2.54 | 10 → 6 | 15 → 9 | 0 → 0 | 49 → 47 |
| Alta | aldea | 27.8 → 27.6 | 2.47 → 2.28 | 4 → 3 | 6 → 5 | 2 → 3 | 57 → 55 |
| Alta | tranquila | 27.4 → 27.3 | 3.21 → 2.53 | 13 → 13 | 17 → 17 | 0 → 0 | 50 → 50 |
| Alta | jefe | 21.7 → 21.9 | 6.55 → 6.09 | 19 → 18 | 22 → 22 | 22 → 21 | 66 → 61 |
| Alta | horda | 17.2 → 17.7 | 16.78 → 18.66 | 32 → 31 | 38 → 38 | 99 → 98 | 73 → 74 |
| Alta | grieta | 23.9 → 24.1 | 5.82 → 5.71 | 26 → 24 | 42 → 30 | 5 → 4 | 94 → 82 |
| Alta | arena | 21 → 19.4 | 6.9 → 7.25 | 23 → 25 | 30 → 32 | 23 → 61 | 62 → 62 |
| Máxima | aldea | 25.1 → 25 | 2.62 → 2.44 | 4 → 4 | 5 → 5 | 5 → 6 | 62 → 62 |
| Máxima | tranquila | 14.6 → 14.6 | 32.44 → 32.43 | 34 → 34 | 49 → 49 | 84 → 85 | 80 → 81 |
| Máxima | jefe | 12 → 11.8 | 41.93 → 42.91 | 60 → 62 | 67 → 66 | 69 → 68 | 102 → 97 |
| Máxima | horda | 11.4 → 10.9 | 45.7 → 49.7 | 53 → 57 | 67 → 69 | 65 → 63 | 101 → 108 |
| Máxima | grieta | 12 → 12.1 | 42.63 → 42.69 | 68 → 66 | 140 → 169 | 69 → 69 | 182 → 199 |
| Máxima | arena | 11.7 → 11.8 | 46.56 → 48.9 | 54 → 58 | 66 → 71 | 68 → 68 | 109 → 100 |

### Máquina cargada (otras sesiones usando CPU y GPU), sobre `main` c66c725c (de ayer)
Chrome, 4 repeticiones. Aquí es donde más se notaba: esperar a la GPU cuesta más cuanto más cola tiene.

| calidad | escena | FPS | ms media | p95 | p99 | tirones >50 ms (6 s) | peor fotograma ms |
|---|---|---|---|---|---|---|---|
| Auto | aldea | 35.9 → 43.4 | 4.66 → 3.54 | 6.7 → 5.5 | 8.6 → 6.2 | 0 → 1 | 33.4 → 50.1 |
| Auto | tranquila | 56.5 → 54.5 | 4.35 → 3 | 6 → 4.4 | 11.7 → 6.4 | 1 → 0 | 66.7 → 17.5 |
| Auto | jefe | 48.3 → 57.4 | 5.4 → 3.72 | 7.9 → 5.8 | 16.4 → 7.8 | 1 → 0 | 50.1 → 33.4 |
| Auto | horda | 43.5 → 46.8 | 6.54 → 7.31 | 13.1 → 11.1 | 22.6 → 14.1 | 5 → 1 | 86.2 → 50.1 |
| Auto | grieta | 51.9 → 56.8 | 3.49 → 2.34 | 9.1 → 4.4 | 27.1 → 8.1 | 5 → 3 | 133.4 → 133.6 |
| Auto | arena | 52.2 → 51.5 | 5.04 → 7.5 | 8 → 10.5 | 25.4 → 15.5 | 0 → 3 | 33.5 → 66.8 |
| Alta | aldea | 60.1 → 34.4 | 4.75 → 2.89 | 6.8 → 3.8 | 9.7 → 4.7 | 0 → 0 | 17.9 → 20 |
| Alta | tranquila | 59.7 → 47.1 | 3.26 → 2.67 | 4.5 → 4.3 | 10.7 → 5 | 0 → 0 | 17.5 → 18.4 |
| Alta | jefe | 56.7 → 47.2 | 4.97 → 3.3 | 8.7 → 5.8 | 13 → 8.6 | 1 → 0 | 50.1 → 17.3 |
| Alta | horda | 35.9 → 35.9 | 10.47 → 10.47 | 14.3 → 13 | 73.2 → 15.3 | 6 → 1 | 83.5 → 66.8 |
| Alta | grieta | 49.5 → 53.4 | 3.63 → 4.09 | 5.9 → 7.6 | 21.7 → 12.9 | 4 → 4 | 166.9 → 150.3 |
| Alta | arena | 47.6 → 59.6 | 5.6 → 5.83 | 9.4 → 8.1 | 22.4 → 9.3 | 0 → 0 | 33.5 → 18 |
| Máxima | aldea | 60.1 → 60 | 3.53 → 3.46 | 5.1 → 4.9 | 8.5 → 6.3 | 0 → 0 | 19.5 → 20.5 |
| Máxima | tranquila | 58.1 → 48.2 | 4.12 → 4.53 | 5.2 → 7.1 | 12.5 → 8.9 | 0 → 0 | 50 → 33.4 |
| Máxima | jefe | 57.7 → 54.6 | 5.2 → 7.17 | 11.7 → 10.5 | 14.7 → 14.2 | 0 → 0 | 50 → 33.5 |
| Máxima | horda | 34.3 → 37.4 | 14.68 → 9.55 | 21.4 → 12.4 | 59.5 → 16 | 7 → 1 | 83.5 → 50.1 |
| Máxima | grieta | 51.5 → 43.9 | 7.34 → 6.25 | 11 → 9.2 | 35.1 → 12.2 | 5 → 5 | 317.1 → 183.6 |
| Máxima | arena | 54 → 44.9 | 10.47 → 8.13 | 14.8 → 12.2 | 27.1 → 14.9 | 1 → 0 | 50.1 → 50 |

### Cómo leerlo
- Con la máquina tranquila, el juego ya iba casi siempre a 55-60 FPS en este PC: lo que cambia son los fotogramas lentos. El p99 baja
  un 20-40 % en casi todas las escenas (horda en Máxima, de 19 a 12,5 ms) y el peor fotograma de la grieta, de 100-117 a 75-84 ms.
- Con la máquina cargada (lo que más se parece a un portátil caliente o un móvil justo), la horda pasaba de un p99 de 73 a 15 ms en
  Alta y de 60 a 16 ms en Máxima, y los tirones de 6-7 a 1 en 6 s. Los FPS medios, con ese ruido, bailan demasiado (la misma versión
  dio 60 y, diez minutos después, 19).
- WebKit con Auto, en las dos tandas: la horda, de 20-25 a 30 FPS y de 8,7-9,7 a 5,6-6,6 ms (resolución dinámica). Alta y Máxima,
  igual (no tocan lo que más cuesta en WebKit por software: rellenar píxeles).
- En Chrome sin tope, antes de arreglarlo, el testigo se llevaba del 72 al 98 % del tiempo de los fotogramas lentos.
- Lo que queda al llegar a la arena (75-84 ms, una vez): en Alta casi no es JavaScript (12 ms de 107 en los fotogramas lentos: GPU).

**Equilibrio**: `node tools/balance.cjs --pasivos --todas --json` da el mismo archivo byte a byte antes y después, sobre las dos bases
(sólo cambia el dibujo, el bucle y los ajustes; el combate no). `tools/equilibrio.cjs --norma`: todo igual.

**Sin probar**: iPhone y Android reales (calor y batería de verdad), pantallas de 120-144 Hz reales (el tope se ha comprobado con
el cálculo del bucle en `tests/rendimiento.test.cjs`), la app de Windows.
