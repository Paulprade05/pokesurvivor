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
7. La pestaña oculta ya pausaba la partida (y `requestAnimationFrame` no corre): sin cambios.

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
`origin/main` (c66c725c, worktree `ps-perf-base`) → esta rama, con la misma herramienta, intercalados (antes, después, antes...),
6 s por escena, sin contadores (`--sin-contar`). Mediana de las repeticiones. Peor fotograma y tirones: lo que más se nota.

**Chrome** (del sistema, con GPU: Radeon integrada del Ryzen 7 7735U, 1536×864 a ×1,25 como una pantalla de 1920×1080, 60 Hz),
4 repeticiones por lado:

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

**WebKit** con el perfil de iPhone 15 en horizontal (852×393 ×3), 3 repeticiones por lado. En Windows, WebKit dibuja por software
y va a 20-30 FPS haga lo que haga: vale para comparar el trabajo de cada fotograma (ms), no para saber cómo va un iPhone de verdad.
A esos FPS, «tirones de más de 50 ms» casi no dice nada (un fotograma normal ya dura 40-60 ms). El testigo de lienzos sigue en iOS.

| calidad | escena | FPS | ms media | p95 | p99 | tirones >50 ms (6 s) | peor fotograma ms |
|---|---|---|---|---|---|---|---|
| Auto | aldea | 24.4 → 25.8 | 2.83 → 2.31 | 4 → 3 | 6 → 5 | 14 → 2 | 62 → 58 |
| Auto | tranquila | 29.1 → 35.4 | 2.01 → 1.53 | 6 → 3 | 11 → 6 | 0 → 0 | 47 → 41 |
| Auto | jefe | 23 → 30.8 | 4.26 → 3.4 | 14 → 7 | 16 → 10 | 33 → 2 | 81 → 51 |
| Auto | horda | 20.3 → 30 | 9.67 → 6.64 | 19 → 12 | 22 → 14 | 37 → 1 | 83 → 51 |
| Auto | grieta | 23.7 → 34.1 | 3.48 → 2.13 | 15 → 7 | 28 → 9 | 13 → 1 | 104 → 69 |
| Auto | arena | 24.6 → 32.7 | 3.75 → 2.48 | 12 → 5 | 18 → 10 | 3 → 0 | 67 → 46 |
| Alta | aldea | 24.7 → 25.7 | 2.58 → 2.46 | 4 → 4 | 7 → 7 | 8 → 7 | 63 → 63 |
| Alta | tranquila | 25.5 → 23.4 | 2.69 → 2.85 | 14 → 13 | 19 → 20 | 1 → 14 | 53 → 64 |
| Alta | jefe | 21.9 → 17.7 | 6.25 → 7.15 | 18 → 25 | 23 → 40 | 20 → 70 | 65 → 94 |
| Alta | horda | 16.2 → 16.5 | 17.18 → 20.75 | 31 → 35 | 43 → 46 | 94 → 82 | 86 → 112 |
| Alta | grieta | 23.7 → 22.1 | 5.56 → 5.9 | 24 → 27 | 58 → 32 | 6 → 17 | 99 → 92 |
| Alta | arena | 20.7 → 17.4 | 6.15 → 6.98 | 19 → 26 | 31 → 36 | 20 → 99 | 68 → 73 |
| Máxima | aldea | 20.9 → 20.8 | 3.15 → 2.84 | 4 → 4 | 7 → 7 | 25 → 28 | 72 → 73 |
| Máxima | tranquila | 10.7 → 12.6 | 46.6 → 37.46 | 59 → 41 | 71 → 58 | 62 → 73 | 110 → 93 |
| Máxima | jefe | 8 → 8.8 | 68 → 61.39 | 89 → 85 | 109 → 88 | 45 → 50 | 149 → 130 |
| Máxima | horda | 8.6 → 7.4 | 62.9 → 76.67 | 84 → 117 | 96 → 123 | 49 → 41 | 133 → 206 |
| Máxima | grieta | 8.9 → 9.1 | 57.98 → 58.98 | 89 → 105 | 294 → 202 | 50 → 50 | 337 → 232 |
| Máxima | arena | 11.2 → 10.7 | 48.58 → 53.55 | 61 → 65 | 79 → 79 | 64 → 61 | 110 → 129 |

**Cómo leerlo.** Con la máquina compartida, los FPS medios bailan mucho entre pasadas (la misma versión dio 60 y, diez minutos
después, 19), así que diferencias de ±10 FPS en una escena no significan nada. Lo que se repite en todas las pasadas:
- Chrome, horda: p99 de 73 a 15 ms en Alta y de 60 a 16 ms en Máxima; los tirones, de 6-7 a 1 en 6 s.
- Chrome, grieta: p99 de 22 a 13 ms (Alta) y de 35 a 12 ms (Máxima). Al llegar a la arena sigue habiendo un fotograma de 150-180 ms:
  en Alta casi no es JavaScript (12 ms de 107 en los fotogramas lentos: es la GPU) y en Máxima es sobre todo el 3D de las paredes
  (`ultra3d` buildChunk), que la sesión del 3D ya ha quitado en su PR #66.
- WebKit con Auto: todo mejor (la horda, de 20 a 30 FPS y de 9,7 a 6,6 ms), por la resolución dinámica. Alta y Máxima, igual.
- En Chrome sin tope, antes de arreglarlo, el testigo se llevaba del 72 al 98 % del tiempo de los fotogramas lentos.

**Equilibrio**: `node tools/balance.cjs --pasivos --todas --json` da el mismo archivo byte a byte antes y después (sólo cambia el
dibujo, el bucle y los ajustes; el combate no). `tools/equilibrio.cjs --norma`: todo igual.

**Sin probar**: iPhone y Android reales (calor y batería de verdad), pantallas de 120-144 Hz reales (el tope se ha comprobado con
el cálculo del bucle en `tests/rendimiento.test.cjs`), la app de Windows.
