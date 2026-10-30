# PokéSurvivor 2.0: dificultad, IA, jefes, economía y mundo estilo Mundo Misterioso

> Prompt para un chat nuevo de Claude Code abierto en este repositorio
> (`C:\Users\Practicas\Documents\paul\cosas\survivor`, rama `main`, versión publicada 4bbf8e10).
> Lo ha preparado el dueño a partir de sus pruebas, ampliado con un análisis del código actual.
> Las referencias `archivo:línea` son de 4bbf8e10: compruébalas antes de tocar, pueden haberse movido.
>
> **Cómo usarlo**: es demasiado trabajo para un solo chat (cada bloque necesita tandas de medida de ~1 h).
> Lo normal es **un chat por bloque** (o por pareja de bloques). En cada chat nuevo basta con escribir:
> «Lee docs/PROMPT-2.0.md y docs/2.0-ESTADO.md y haz el bloque N».
> `docs/2.0-ESTADO.md` lo crea el primer chat y lo actualiza cada uno al acabar: cifras de la línea base,
> decisiones tomadas, lo hecho, lo que falta y las cifras de después.

---

## 0. Decisiones del dueño (rellenar antes de pegar; si se deja así, se usa lo marcado)

- **Tilesets del mundo**:
  - [x] **A (recomendada).** Pintados en código con la «gramática visual» de Mundo Misterioso, sin copiar píxeles de Nintendo, y motor preparado para el formato DTEF por si algún día se cambia.
  - [ ] **B.** Usar los tilesets extraídos de Exploradores del Cielo (PMDCollab/RawAsset `TileDtef`) en una carpeta aparte, con interruptor y el pintor en código como respaldo. Riesgo de DMCA: ver §11.2.
- **Tamaño de casilla del mundo**:
  - [x] **24 px de arte (`TS = 48`)**, como en PMD: los Pokémon dejan de verse 1,5 veces más grandes que el suelo. Rompe el cooperativo con la versión anterior (se resuelve con `wv`, §11.9) y obliga a medir la dificultad otra vez.
  - [ ] Seguir con 16 px y cambiar sólo el dibujo (más fácil, pero la escala de los Pokémon sigue sin casar).
- **Que los enemigos «escalen con mi nivel»**:
  - [x] Escalar con la **fuerza real medida** (lo rápido que matas y tu DPS), que incluye nivel, fusiones y pasivas. Recomendado.
  - [ ] Además, un término pequeño por número de nivel. No se recomienda: castiga coger Aprendizaje o el Huevo Suerte, y tras el bloque 1 el nivel ya no significa lo mismo (§7.1).
- **Protección del principiante** (cuentas o Pokémon sin mejoras, que hoy caen pronto; §7.3):
  - [x] Sí.
  - [ ] No.
- **Tickets** (§10.1):
  - [x] **A.** Sólo reloj y jefes.
  - [ ] **B.** También +1 por grieta ganada (como mucho 5 por partida).
- **Ranking**:
  - [x] Tablas nuevas desde la 2.0 (los tiempos de antes no son comparables).
  - [ ] Las mismas tablas.
- **Al publicar el mundo nuevo** (§11.9):
  - [x] Sólo bloquear las salas con versiones distintas (`wv`).
  - [ ] Además, `build.js --forzar` (recarga también a quien está en partida; va contra la norma de CLAUDE.md «en partida no se toca»).
- **Vínculos/fusiones**:
  - [x] Se quedan como están (los ataques no se tocan); se compensa con los enemigos.
  - [ ] Sólo un grupo de fusión por partida.
- **Tickets que ya tienen guardados los jugadores**:
  - [x] Se respetan.
  - [ ] Se recortan una vez por cuenta.
- **Misiones semanales** (hoy 2 tickets ×10 = 20 tiradas por semana):
  - [x] Bajar a 5 tickets cada una.
  - [ ] Dejarlas como están.
- **three.js**:
  - [x] No por ahora. El problema es de dirección de arte, no de 3D; ver §11.8.
  - [ ] Sí, sólo para el suelo.

---

## 1. Qué quiere el dueño (en sus palabras, ordenado)

Después de jugar un día entero y hacer pruebas:

1. **La dificultad está muy desajustada**:
   - es muy fácil hacer tu build;
   - con todo evolucionado y los ataques fusionados, los enemigos mueren al instante;
   - al principio se llega muy rápido a tenerlo todo al máximo (antes del minuto 10), y cuando debería ponerse difícil ya eres inmortal;
   - los enemigos aguantan poco y son «tontos»;
   - los legendarios de las grietas mueren al instante;
   - se sube de nivel muy rápido y casi siempre salen los mismos ataques y pasivas.

   **No quiere tocar los ataques**: hay que ajustar a los enemigos.
2. **Mejor IA**:
   - que no se atasquen en puntos muertos del mapa;
   - que usen mejor sus ataques;
   - que aprovechen el terreno: los de Agua van por el agua para cazarte antes; los de Tierra y Roca se esconden bajo tierra para esquivar ataques, etc.
3. **Enemigos que escalan con tu progreso** (ataque y defensa): cuanto más avanzada la partida y más fuerte eres, mejores estadísticas.
4. **Que cueste más subir de nivel.**
5. **Topes a las pasivas acumulables**: hoy puede coger 20 «Proteínas» y su daño se dispara, o muchas «Vitaminas» y tener vida infinita.
6. **Legendarios y jefes mucho más amenazantes**:
   - mucha más vida y aguante;
   - que ataquen antes de morir;
   - que escalen con su nivel;
   - que no salgan siempre en el mismo sitio: aleatorio entre varias posiciones.
7. **Economía de tickets**:
   - hoy en 15 minutos saca para ~150 tiradas;
   - quiere entre **3 y 8 tiradas por cada 5 minutos** de partida, y **como mucho 30 al llegar a Arceus**;
   - más costoso, pero no tedioso.
8. **Mundo**:
   - que se vea como **Pokémon Mundo Misterioso: Exploradores del Cielo**;
   - que sea homogéneo: hoy suelo, hierba y árboles no tienen nada que ver entre sí;
   - quitar lo que se ve mal, como los «bosques frondosos» que no dejan pasar.

   Se pueden investigar tilesets de internet y usar librerías (three.js) si de verdad mejoran el resultado.

---

## 2. Reglas del proyecto que no se pueden saltar

(Están en `CLAUDE.md`; aquí lo que más afecta a este trabajo.)

- **Archivos**: se edita `dev.html` y los `js/` y `css/`. **Nunca** `index.html`, `en/`, `js/app.min.js`, `version.json` ni `js/lang/*`: los genera el build.
- **Compilar**: `node tools/build.js && node tools/export_data.js && py tools/make_seo_pages.py` (Python se llama `py`).
  - Los comandos con `&&`, en la herramienta Bash; en PowerShell 5.1 `&&` da error y hay que separar con `;`.
  - **Tests**: `node --test tests/` (Node 24; no hay package.json).
- **Commits**: **sin «Co-Authored-By» ni ninguna firma de IA**. `git push origin main` **sólo cuando el dueño lo pida**.
- **Actualización automática**: no tocar `js/core/updater.js` ni la escritura de `version.json` en `tools/build.js`.
- **Novedades**: cada cambio de juego va en `js/data/changelog.js`, en español e inglés (`new` / `chg` / `fix`), con sus filas para fr, it, pt-BR, zh-Hans y zh-Hant en `js/data/lang-updates.js`.
  - Hay un ayudante: `node tools/changelog-add.cjs <items.json> <repo> <fecha> <titulo.json>`. El formato de los dos JSON está en su cabecera (cada línea con `tipo` y los 7 idiomas: `es`, `en`, `fr`, `it`, `ptBR`, `zhHans`, `zhHant`).
  - Todo texto nuevo visible va en los 7 idiomas (`js/data/lang-en.js` + `lang-updates.js`); `node tools/build_langs.js --faltan --todo` dice lo que falta y `tests/i18n.test.cjs` falla si falta algo.
  - Añadir también la novedad a `NEWS` en `tools/make_seo_pages.py`.
- **Servidores**: nada de pago.
  - Firebase en plan Spark; **nunca** activar Identity Platform ni nada que lo active.
  - Sin TURN ni Worker.
  - No hace falta tocar `firestore.rules`, y **no añadir claves a `best` del perfil** (`firestore.rules:93` sólo deja `solo`, `group`, `level`, `bosses`, `legends`, `kills` y `medals`).
- **Cooperativo** (P2P, `js/net/coop.js`):
  - **el anfitrión simula a todos los enemigos**, jefes, grietas y avisos;
  - los invitados interpolan copias y mandan sus golpes con `'h'`.
  - Todo lo nuevo tiene que **funcionar con un compañero de la versión anterior** durante los minutos que tarda el actualizador. Reglas:
    - sólo **añadir**, nunca cambiar el orden ni el significado de lo que ya viaja;
    - `enemyList` tiene 7 campos (`[id, x, y, hp, anim, dir, bits]`) y los tests (`tests/net-fixtures.cjs`) lo dan por hecho: **no añadir un 8.º campo**. Lo nuevo va como **bits nuevos del 7.º campo** (los clientes viejos los leen con máscara y los ignoran) o como un **evento aparte** que se manda sólo cuando cambia;
    - bits actuales: 1 quemado, 2 envenenado, 4 escudo, 8 frenado, 16 enfurecido. Este documento reserva 32 bajo tierra, 64 nadando, 128 dentro de una pared y 256 guardia de jefe;
    - animaciones nuevas, al final de `ANIMS`; marcas nuevas de jefe, al final de `MARK` y saneadas en `onNet`;
    - **todo cambio de red se documenta en `docs/MULTIPLAYER_PROTOCOL.md`**.
- **Rendimiento**: se juega mucho en móvil horizontal, donde todo cuesta entre 3 y 5 veces más que en PC. Nada de tirones de más de 16 ms (sólo al cambiar de bioma se tolera hasta 25 ms).
- **Tests y herramientas que cargan el juego a trozos**: `tests/jefes.test.cjs` (`loadEnemy`/`loadRift`) y `tools/balance.cjs` cargan `enemy.js`, `rift.js` y `combat.js` con un `G` de juguete. Los módulos nuevos se usan con guarda (`G.Director ? G.Director.hp() : 1`, y lo mismo con `G.EnemyAI` y `G.Tickets`) para no romperlos.
- **Modo Ultra (2,5D, `G.Settings.ultra`)**: todo lo que se dibuje en el suelo o en el aire tiene que verse bien en Normal y en Ultra (`game.js`, bloque `D3`).

---

## 3. Diagnóstico: por qué pasa lo que dice el dueño

### 3.1 El poder del jugador se multiplica; el de los enemigos, mucho menos
- **Daño del jugador** = `m.dmg × pl.atkFor(m)` × tipo × crítico… (`player.js:167-175`, `combat.js:1934-1953`). Se multiplican:
  - evolución del ataque: ×8,7 (mediana de `tools/balance.cjs`);
  - **fusiones** (vínculos): hasta 4 ataques lanzados a la vez, sin penalización (`combat.js:43-44`; `BOND_MAX = 4` en `player.js:270`);
  - **Potencia** ×1,10 compuesto, hasta 40 veces = **×45**;
  - Reflejos ×0,92 de recarga (10 veces, ×0,43);
  - críticos, Fuerza ×1,4 y tipo ×1,6.
  - En total, el DPS sube entre 10³ y 10⁴ veces respecto a un ataque de nivel 1.
- **Vida de un enemigo normal** (`spawner.js:169`): `def.hp × scale(t).hp × hpK(t) × lateHp(t) × earlyHp(t)`. Sólo depende del reloj, a través del tiempo «efectivo» `EFF` (`enemies.js:243`). Crece unas 700 veces entre el minuto 0 y el 30:

  | min | 0 | 5 | 10 | 15 | 20 | 30 |
  |---|---|---|---|---|---|---|
  | Vida | 39 | 268 | 786 | 1.950 | 9.414 | 27.829 |
  | Daño por golpe | 6,5 | 16,8 | 33,6 | 60 | 167 | 372 |

- **Nada depende del jugador** salvo `Coop.scaleHp` (número de jugadores). La «élite» (×1,6 de vida) sale cuando la pantalla está llena, es decir, castiga al que va **flojo**.
- La curva se ha calibrado siempre por **cuándo te caes**, nunca por **cuánto tardas en matar**. `tools/curve.cjs` no mide el tiempo para tumbar a un enemigo ni a un jefe.

### 3.2 «Proteína» y «Vitamina» no son objetos: son cartas de subida de nivel
- Llevan dibujo de objeto (`js/ui/icons.js:24`):
  - Proteína = **Potencia** (`atk`);
  - Vitamina/Más PS = **Vigor** (`hp`);
  - Hierro = **Coraza** (`def`);
  - Carburante = **Carrera** (`spd`);
  - Metrónomo = **Reflejos** (`cd`);
  - Raíz Grande = **Síntesis** (`rgn`);
  - Caramelo Exp. = **Aprendizaje** (`xp`).
- `js/systems/levelup.js:9-51`:
  - Potencia, tope 40 (×45 compuesto);
  - **Vigor (+20 PS) y Síntesis (+0,9 PS/s) no tienen tope**;
  - Coraza llega al techo de 0,7 de reducción.
- `MAX_PASSIVES = 4` limita cuántas pasivas **distintas** llevas, no cuántas veces coges cada una.
- Potencia es además **la llave de evolución de 41 de los 140 ataques** (`moves.js:1167-1246`), así que sale en el 93-99 % de las partidas: de ahí que «siempre sean las mismas builds».

### 3.3 Se sube de nivel demasiado rápido
- `Player.xpFor` (`player.js:160`): `floor((8 + 6·Nv + 1,6·Nv^1,75) · 4)`.
- La experiencia por enemigo va con el **reloj real**, pero su vida va con el tiempo «efectivo», que va más lento. `xpLag` (`enemies.js:274-280`) llega a ×3,76. Por enemigo: 20 XP en el minuto 0, 63 en el 5, 168 en el 10 y 213 en el 20.
- Se suman élite ×1,6, ×2,5 mientras hay un jefe (`FIGHT_XP`) y hasta ×5,2 de multiplicadores propios (Sabiduría, Aprendizaje ×2,48, Huevo Suerte, habilidades).
- **Medido** (`tools/curve.cjs`, todas las mejoras):
  - Nv 27 en el minuto 5, **66 en el 10**, ~97 en el 15 y ~161 en el 29;
  - **los 4 ataques al nivel 5 hacia el minuto 6** y los 4 evolucionados hacia el 7,5.
- Todos los ataques tienen `maxLvl = 5`: una build de 4 ataques son ~23 cartas. A partir de ahí todo son pasivas, y por eso hay ×43 de Potencia hacia el Nv 100-150.

### 3.4 Jefes y legendarios: poca vida, ningún tope y casi no les da tiempo a atacar
- **Jefes del calendario** (`BOSS_SLOTS`, `enemies.js:57-68`): minutos 3, 6, 9, 12, 15, 18 y 21, y dos a la vez en el 24 y el 27.
  - Vida: 1.139 (min 3), 12.686 (12), 27.349 (15), 58.014 (21) y 83.700 (27).
  - **No llevan `hpK` ni `lateHp`**: al final aguantan lo mismo que un campeón normal.
- **Legendarios de grieta** (`rift.js:440-481`): `hp = (3200 + 9·eff) × soft × …`, que es lineal.
  - En el minuto 20 cada uno tiene **5.548 PV, menos que un enemigo normal (9.414)**.
  - Su daño `36 + eff/20` es menos de la mitad que el de un jefe.
- **Medido**: las grietas con todas las mejoras duran una **mediana de 5-6 s**. **Sólo 2 de 37 legendarios llegaron a usar su firma**: su primera firma tarda 4,5-11 s (`BossSig.init`, `enemy.js:1655-1659`), aparecen tras 2 s de intro y `crowd` los frena cuando hay varios.
- **No hay fases, ni tope de daño, ni inmunidad**: se les puede quitar el 100 % de golpe. El enfurecimiento al 50 % llega en menos de 1 s.
- **Sitio**:
  - Los jefes del mapa **ya** salen en un ángulo al azar, pero siempre «entrando por el borde de la pantalla» (`spawner.js:108-111, 334-335`).
  - Los legendarios de la grieta salen **siempre en las mismas posiciones** (`SPOTS_IN`, `rift.js:56`; jugadores en `PLAYERS_IN`, `rift.js:250`).
- **Arceus** es la **Sentencia del minuto 30** (`judgment.js`, `AT = 1800`): invencible.
  - Ya existe un medidor de DPS del jugador: `noteDmg`, `sampleDps` y `singleDps` (`judgment.js:66-91`), con la media de los 6 mejores segundos a un solo objetivo (el máximo por enemigo y segundo, no la suma). Desde fuera sólo se lee con `G.Judgment.debug.single`, y dentro lo usa `fight()` (`judgment.js:180-183`) para la vida del primer legendario de la Sentencia.

### 3.5 IA: ya hay pathfinding, pero no sabe el tamaño de cada Pokémon ni el terreno
- Hay un campo de distancias por jugador: `G.Path`, BFS de 8 vecinos en una ventana de 57×57 casillas, recalculado cada 0,35 s (`js/systems/pathing.js`). Sólo lo calcula el anfitrión.
- **Por qué se atascan** (simulado con el código real):
  - Llegan a tocarte el 93 % de los de radio 12, pero sólo el **75 % de los de radio 21**.
  - Se quedan atascados el 4,7 % y el **10-12 %**, respectivamente.
  - Causas:
    - **El 32 % de las especies tiene radio >16 y no cabe por pasillos de una casilla**, pero el campo los manda por ahí (y `clearLine` tiene un tope de 14,4 px).
    - El rodeo de atasco es **al azar** (72°, lado aleatorio, sin memoria) y oscila en huecos cóncavos.
    - Sin camino van en recta contra la pared.
    - Los de distancia huyen en recta hacia atrás contra las paredes y **disparan sin línea de vista**.
- **El agua cuesta lo mismo que el suelo** en el campo. Un Pokémon de Agua en el agua no va más rápido, sólo no se frena.
- **Ataques «tontos»**:
  - apuntan a tu posición actual, sin adelantarse;
  - las balas van a 190 px/s y tú a 91-133;
  - la embestida y el salto no miran paredes;
  - todos siguen el mismo campo, en fila india, sin flanquear.
- Velocidad mediana de los enemigos: 66 px/s; la tuya: 105.
- **Coste**: construir un campo cuesta ~3 ms por jugador. El 93 % es `World.walkable()`, que crea claves de texto (`cx+','+cy`). Con 4 jugadores se hacen los 4 en el mismo fotograma: **35-60 ms en móvil cada 0,35 s**, un tirón que ya existe hoy.
- **Tope de enemigos** (`capAt`, `spawner.js:36-45`): 28 → 50 → 64 → 78, más hasta 20 en oleadas. **No hay cientos** (`GDD.md:179` dice 280 y está desactualizado).
- La cabecera de `enemy.js` y `world.js` dice que «los fantasma ignoran el terreno»: **es falso**.

### 3.6 Tickets: todo es botín del suelo, y las grietas son el 55-65 %
| Fuente | Cantidad |
|---|---|
| Cualquier baja | 1/400 de soltar 1 ticket (`pickup.js:29, 89`) |
| Jefe | 1/3 de soltar 1 ticket ×10 (`pickup.js:27, 85`) |
| Legendario | 3 tickets + 1/2 de un ×10: **~8 tiradas por legendario** |
| Cofre con candado | 3,5 tiradas de media |
| Gholdengo | 1 ×10 |
| Pokémon perdido | 1 |

- Modelo con las constantes reales: **≈90-100 tiradas en 15 minutos y ≈300-360 en 30**. Con los logros que se cumplen por primera vez sale el ~150 del dueño.
- **En cooperativo cada jugador cobra el botín de todo el equipo** (`syncTeam`, `game.js:315-322`; `tk` en `coop.js:222, 440`): unas 160 en 15 minutos con 3 jugadores.
- Fuera de partida:
  - diarias, ~7 tiradas al día;
  - semanales, 20 a la semana;
  - logros, ~700 tiradas por cuenta, cobradas una sola vez.
- Precio: la tirada ×1 = 1 ticket y la ×10 = 10 tickets o 1 ticket ×10 (`gacha.js:24-28`). Legendaria de media cada 43,5 tiradas, con pity a 70.

### 3.7 Mundo: dos estilos mezclados y una escala que no es la de PMD
- **Dibujo**: todo es **Canvas 2D** (no hay WebGL) y se pinta **píxel a píxel en código** (`js/world/tiles.js`, horneado por chunk).
  - Casilla de 16 px de arte ×2 = 32 de mundo; chunks de 16×16.
  - Ya hay autotiling por fórmula con los 8 vecinos.
  - La cabecera dice que el estilo es «Pokémon Platino» desde el 27-10.
- **Por qué no casa nada**:
  1. **Suelo estilo Platino** (hierba en «w», pinos de Sinnoh, caminos) **con Pokémon estilo Mundo Misterioso**.
  2. **Escala de los Pokémon**: los sprites de SpriteCollab están dibujados para casillas de **24 px** y aquí la casilla es de 16, así que los Pokémon se ven 1,5 veces más grandes que el suelo.
  3. **Paletas**: suelo, hierba alta, árboles y paredes de bosque usan rampas de color distintas (`floor`, `grass`, `leaf`). En 19 de las 22 paletas los colores salen de `shade()` sobre 1-3 colores, sin diseño por bioma.
  4. **El terreno es el mismo toda la partida.** Cada 4 minutos sólo cambia la paleta: el bosque del minuto 0 es acantilado en el 4 y los lagos son lava en el 8.
  5. **Los «bosques frondosos»**:
     - Son paredes `WALL` pintadas como coníferas (`paintBush`, `tiles.js:709-746`), iguales que los árboles sueltos que sí rodeas.
     - Además, las arboledas de árboles sueltos forman bloques macizos. Entre dos troncos pegados quedan 6 unidades y el jugador necesita 28 (`WALL_R = 14`), así que se ve suelo entre los troncos y no se puede pasar.
  6. **El pixel art tiembla**: un píxel de arte ocupa `2·scale·dpr` píxeles reales, que casi nunca es entero (2,57-5,63).
- **Sprites**:
  - SpriteCollab, licencia CC BY-NC 4.0, con los originales acreditados a CHUNSOFT en `CREDITS.md`;
  - 967 carpetas en `assets/pokemon/<dex>/`;
  - 8 direcciones, con ancla en los pies.

---

## 4. Plan de trabajo: orden y por qué

Los bloques dependen unos de otros. **Hay que seguir este orden y medir entre uno y otro**:

0. **Medir** (ampliar `tools/curve.cjs`). Sin esto no se puede calibrar nada.
1. **Topes de cartas y curva de experiencia.** Quitan el ×15-45 del jugador. Después de este bloque el jugador será **mucho más flojo** de lo que es hoy en los minutos 15-30.
2. **Director de enemigos** (escalado adaptativo) y protección del principiante. Se calibra **después** del bloque 1, con la fuerza nueva del jugador.
3. **Jefes y legendarios**: vida según el DPS, fases, tope de DPS, más amenaza y sitios al azar.
4. **IA de enemigos**: primero el rendimiento, luego los campos por clase y tamaño, el desatasco, la puntería y el terreno por tipo.
5. **Economía de tickets.** Va después del bloque 3, porque arenas más largas significan menos grietas por partida.
6. **Mundo estilo Mundo Misterioso.** Es independiente de 1-5, pero **el cambio de tamaño de casilla rompe el cooperativo entre versiones** (§11.9) y cambia la dificultad: medir otra vez al acabar.

**Dos ajustes de orden**:
- **El bloque 5 va después del 3** porque el momento en que muere cada jefe decide en qué tramo de 5 minutos cae su ticket (y, con la variante B, cuántas grietas hay).
- **Decidir la casilla (§0) antes del bloque 4.** Si es de 48, hacer el cambio de `TS` (§11.3 y §11.9) **después del bloque 3 y antes de la IA**, porque los umbrales de la IA (variante «big», `clearLine`, radios de los tests) dependen del tamaño de casilla. Escribirlos en función de `TS` (por ejemplo, «big» si `r > 0,47·TS`). El resto del mundo (tileset, decoración, Ultra) puede ir al final.

**Los bloques se mueven unos a otros.** El director (2) sube la vida y, como la experiencia sale del reloj, quien mata más rápido mata menos enemigos por minuto. Las arenas largas (3) quitan minutos sin enemigos normales (el reloj corre en la arena pero no sale nadie, `spawner.js:319`). La IA (4) hace que te toquen más enemigos. Por eso:
- **tras los bloques 2, 3 y 4, repetir la tanda completa y volver a cumplir TODOS los objetivos anteriores** (§6.2, §7.3-7.4, §8.6);
- palancas de cada cosa:

  | Si se descuadra… | Se ajusta con… |
  |---|---|
  | El nivel por minuto | `XP_AT` y los factores de `xpFor` |
  | La primera caída | `TTK_T`, `HP_MAX` y `rookieK` |
  | Los jefes y legendarios | `BOSS_TTK` y `LEG_TTK` |

  No recortar otra vez las cartas del bloque 1 para compensar el 3.

**Paradas con el dueño** (la dificultad divertida no la mide el bot):
- tras los bloques 1 y 2, que juegue 2-3 partidas antes de seguir;
- en el bloque 6, tras el motor de tileset, capturas de 3 biomas (bosque, cueva y volcán) antes de hacer los 22.

Un commit por bloque como mínimo, cada uno compilado, con los tests en verde y su entrada de novedades. **No publicar a medias**: el dueño decide cuándo se sube.

---

## 5. Bloque 0: medir primero

Ampliar `tools/curve.cjs`:
- **Preparar una vez** (el repositorio no trae puppeteer): `npm i --prefix <scratchpad>/pp puppeteer-core@23.11.1`.
- **Tanda**: `node tools/curve.cjs --pp <scratchpad>/pp/node_modules --par 3 --speed 3 --out <scratchpad>/curva-base 6:max:3 445:max:3 225:zero:2 …`.
  - `--chrome <exe>` sólo si Chrome no está en `C:/Program Files/Google/Chrome/Application/chrome.exe`.
  - Pokémon de referencia: 225 Delibird (flojo), 6 Charizard (empieza como Charmander), 445 Garchomp (empieza como Gible) y 150 Mewtwo (fuerte).
  - Mejoras `max` o `zero` (las de ese Pokémon).
  - **No lanzar más de 3 partidas a la vez**: la máquina se satura y falsea las cifras.
  - Una tanda de ~18 partidas tarda ~1 h: lanzarla en segundo plano.
- **Informe**: `node tools/curve.cjs --report <carpeta> [<carpeta2>…]`. `report()` lee las líneas con la forma `[mm:ss] Nv.N … caídas=N`: los campos nuevos van **después de `caídas=N` o al final**, para no romperlo.
- **Añadir en cada línea de minuto**:
  - bajas;
  - `pl.dmgDealt` del minuto;
  - **tiempo mediano para tumbar** a un enemigo normal (`ttk`, desde su primer golpe hasta que muere);
  - `pl.statsTaken` (cartas cogidas);
  - nivel;
  - `G.Judgment.singleDps()` (exportarlo: hoy sólo está en `debug`);
  - multiplicadores del director (bloque 2);
  - `t1`/`t10` (tickets).
- **Añadir en `RESULT`**, por cada jefe y legendario: `{nombre, legendario, minuto, ttk, ataques usados, firmas usadas, daño que hizo}`. Hay que envolver `G.EnemyMgr.add`, `Enemy.prototype.bossStart` y `G.BossSig.start`.
- **Añadir en `report()`**:
  - nivel en los minutos 5, 10, 15, 20 y 29;
  - minuto con «4 ataques al 5» y «4 evolucionados»;
  - TTK mediano de jefes por tramos (3-12, 15-21, 24-27) y de legendarios según cuántos salen;
  - % de grietas ganadas;
  - % de jefes que usan 1 y 2 firmas.
- **Ojo**:
  - **el bot es inmortal**: su envoltorio de `pl.hurt` vuelve a poner `pl.hp = hp0` y lleva una vida «virtual» aparte (`window.V`, `curve.cjs:~234-248`). Si no se hace nada, el director del bloque 2 verá siempre al jugador cómodo y subirá el daño al máximo en todas las mediciones. **Arreglo**: el director lee la vida con `G.Director.hpFrac(pl)` (por defecto `pl.hp/pl.maxHp`) y se entera de las caídas con `G.Director.noteFall(pl)`. En curve.cjs, dentro del envoltorio: `G.Director.hpFrac = () => V.hp / pl.maxHp` y `G.Director.noteFall(pl)` cuando `V.hp <= 0`. Comprobar que con la vida virtual al 20 % `danger` sale verdadero;
  - el bot elige cartas por su nombre en español (`curve.cjs:75-76`): si cambian los títulos, actualizarlo;
  - `--speed` llama a `debugSpeed`, que marca la partida como `tampered` (`game.js:1358`): lo que dependa de eso (los tickets del bloque 5) se mide de otra forma (§10.3);
  - el bucle se corta en cuanto empieza la Sentencia (`G.Judgment.active`, `curve.cjs:270`): para medir lo que pasa al llegar a ella, esperar 2 s antes de cortar.
- **Antes de tocar nada, guardar una «línea base»** con 4bbf8e10. Por ejemplo, `6:max:3 445:max:3 225:max:2 150:max:2 6:zero:3 445:zero:3 225:zero:2`.

---

## 6. Bloque 1: cartas con tope y subida de nivel más lenta

### 6.1 Topes de cartas (`levelup.js:9-28`, sin cambiar ningún texto)
Pasar de multiplicativo a **aditivo**, dentro de `apply`, para no tocar cómo se usa `atkMul`. `statsTaken` se incrementa **después** de `apply`, así que ahí `n` = cartas que ya llevabas:
```js
apply: pl => { const n = pl.statsTaken.atk || 0; pl.atkMul *= (1 + 0.10 * (n + 1)) / (1 + 0.10 * n); }, max: 10
```

| Carta («objeto») | Hoy | Propuesta |
|---|---|---|
| Potencia (Proteína) | ×1,1ⁿ, tope 40 (×45) | +10 % aditivo, **tope 10 (×2,0)** |
| Vigor (Vitamina) | +20 PS, sin tope | +20 PS, **tope 8 (+160)** |
| Síntesis | +0,9 PS/s, sin tope | **tope 5** |
| Coraza (Hierro) | +6 %, tope 12, techo 0,7 | **tope 5**, techo de cartas y mejoras **0,6** (el `get reduction` de `player.js:187` sigue en 0,8 para buffs) |
| Reflejos | ×0,92, tope 10 | **tope 6 (×0,61)** |
| Carrera (Carburante) | ×1,07, tope 8 | +7 % aditivo, **tope 5** |
| Imán | ×1,3, tope 6 | +30 % aditivo, **tope 4** |
| Aprendizaje | ×1,12, tope 8 | +12 % aditivo, **tope 4** |

- **No subir** los topes de Amplitud, Persistencia ni Propulsión: `netPass` (`combat.js:1863-1869`) rechaza Amplitud >1,5 en cooperativo.
- **Con todo al tope**: hoy `offer` sólo devolvería la Baya Zidra, que cura el 45 % en cada subida: hacia el minuto 22-25 volvería a hacerte casi inmortal. Que salga una **Baya Zidra que cura el 20 %** (texto nuevo, 7 idiomas) y monedas **sólo en solitario** (en cooperativo el anfitrión pisa las monedas y los tickets del invitado, `game.js:319-321`).
- En la pausa, enseñar «n/tope» o «MÁX» (`run-ui.js:110-111`). Texto nuevo: 7 idiomas.
- El Compendio ya muestra «Se puede coger hasta {x} veces» (`compendium-ui.js:441`).
- Tras los topes, el antitrampas `clean()` (`game.js:526`, `atkMul > 2000`) se puede bajar a ~200.

### 6.2 Curva de experiencia
- **Experiencia por enemigo**: sacarla de una **tabla por reloj** en vez de `xpLag`, para que al tocar la vida de los enemigos (`EFF`, tramos) no cambie la subida de nivel sin querer:
  ```js
  const XP_AT = [[0,20],[300,37],[600,71],[900,100],[1200,150],[1800,213]];
  // en make (spawner.js:172), en vez de tier.xp × XP_K × xpLag:
  e.xp = Math.max(1, Math.round(lerp(XP_AT, t) * (def.behavior === 'tank' ? 1.3 : 1) * (o.xp || 1)));
  // y después la élite ×1,6, el campeón, el shiny y la hora dorada, como hoy
  ```
  Hasta el minuto 15 equivale a bajar el exponente de `xpLag` de 0,85 a 0,3. El punto `[1200,150]` es una rebaja intencionada: hoy da 213.
- **`Player.xpFor`** (`player.js:160`):
  ```js
  const base = Math.floor((8 + level * 6 + Math.pow(level, 1.75) * 1.6) * 4);
  return Math.floor(base * (1 + 2 * Math.min(1, (level - 1) / 9) + 0.3 * Math.max(0, level - 10)));
  ```
  Nv 1 = 62 (igual que hoy), 10 = 1.893, 20 = 10.332 y 30 = 28.917. Los números para afinar son el «2», el «0,3» y la tabla.
- `FIGHT_XP` se queda en 2,5: compensa que durante los jefes salen 4 veces menos enemigos.
- **Objetivos** (medidos con curve.cjs):

  | | Todas las mejoras | Sin mejoras |
  |---|---|---|
  | Nivel en el minuto 5 | 13-16 | — |
  | Nivel en el minuto 10 | 24-28 | 16-20 |
  | Nivel en el minuto 15 | 33-37 | — |
  | Nivel en el minuto 20 | 42-46 | 33-38 |
  | Nivel en el minuto 29 | 55-62 | — |
  | «4 ataques al nivel 5» | Mediana en el minuto ≥12, ninguna partida antes del 9 | — |
  | «4 evolucionados» | Mediana en el minuto ≥14 | — |

### 6.3 Más variedad de builds (sin tocar los ataques)
- **Repertorio sorteado por partida**: `pl.runPool` = el 70 % del repertorio, con un mínimo de 10 ataques.
  - Entran siempre los ataques iniciales, los que hacen evolucionar al Pokémon (`G.Evo.wantedMoves`) y las MT compradas (`G.Mons.taught`).
  - Se filtra en `candidates` (`levelup.js:169-170`) y en `evolvesWith` (`:117`). Todo en local: ni red ni guardado.
- **Descartar en partida**: 2 por partida.
  - Un ataque descartado va a `pl.banned`, que ya se respeta.
  - Una pasiva descartada va a un `pl.bannedStats` nuevo, que se mira en `room`.
  - Botón en `run-ui.js` y mando en `gamepad.js`; textos en 7 idiomas.
- **No bajar** el máximo de las mejoras «Cambio de cartas» ni «Veto»: `perks()` recorta al máximo nuevo (`upgrades.js:59`) y se perdería lo que el jugador pagó.

### 6.4 Lo que se debilita al subir menos de nivel (revisar, no romper)
- Cosas que dependen del nivel:
  - quemaduras `1 + 0,06·Nv` (`enemy.js:338`);
  - movimientos Z, que llegan al máximo en el Nv 45 (`moves.js:1736`);
  - Tinieblas (`combat.js:7507`);
  - bomba (`game.js:712`);
  - Casco Dentado (`combat.js:2118`);
  - habilidades de contacto y de explosión (`ability-fx.js:86` y `393`);
  - trampas (`interact.js:123-127`);
  - evolución del Pokémon en partida (`mons.js:198, 254-266`; tiene red de seguridad por tiempo).
- Misiones de nivel 8/12/15 y logros de nivel 15/30: siguen siendo alcanzables.
- `node tools/balance.cjs --z` (su `REF.level` es 45 en el minuto 15) y los tests.
- Test nuevo `tests/levelup.test.cjs`: 50 partidas de 300 subidas; `statsTaken[id] ≤ max`; Potencia ≤ ×2,0; Vigor ≤ +160; `offer()` nunca vacío.

---

## 7. Bloque 2: enemigos que escalan con la fuerza real del jugador

### 7.1 Por qué no usar sólo el número de nivel
- Escalar con el nivel castiga subir de nivel y las mejoras de experiencia.
- Además, el bloque 1 cambia el significado del nivel: Nv 58 en el minuto 29 en vez de 160.
- Lo que el dueño quiere decir es «cuanto más fuerte soy, más fuertes ellos». Eso se mide directamente: **lo rápido que matas**, que ya incluye nivel, evoluciones, fusiones y pasivas.
- Si el dueño marca en §0 el término por nivel: `hpMul *= 1 + 0,015·max(0, Nv − LV_REF(t))`, y lo mismo en `dmgMul`. `LV_REF` es una tabla en `director.js` con la mediana del nivel **sin mejoras** en los minutos 0, 5, 10, 15, 20 y 29, sacada de la tanda que se haga al acabar el bloque 1.
- **Que se siga notando la build.** Si el director y la vida de los jefes compensan del todo tu fuerza, una build el doble de fuerte tarda lo mismo que una floja: una «goma elástica» que quita la gracia de que los ataques sean rotos (y el dueño no quiere tocarlos). Por eso **sólo se compensa una parte**: aquí con el exponente 0,4 de abajo, y en los jefes con el 0,75 de §8.1. Así, con el doble de fuerza se sigue matando ~1,2-1,5 veces más rápido.

### 7.2 Director adaptativo: archivo nuevo `js/systems/director.js` (`G.Director`)
Se añade en `dev.html`, en el bloque `<!-- scripts:begin -->`, después de `spawner.js`; `build.js` lo recoge solo. **Sólo corre en el anfitrión o en solitario** (como `Spawner.update`, `game.js:936`).

- **Medida** (independiente de cuántos enemigos salgan):
  - En `Enemy.hurt`, rama del anfitrión (después del bloque `if (this.remote)`, `enemy.js:177-182`): `hitT0` (primer golpe) y `dmgIn` (daño recibido, antes del escudo).
  - En el bucle de muertes de `EnemyMgr.update` (`enemy.js:~1297`): `G.Director.kill(e)`.
  - Se descartan jefes, legendarios, los de la Sentencia, enjambres y esbirros (marcar `e.weak`), estampidas y `bomber` que explota solo.
  - Por cada muerte: `ttk = now − hitT0` y `Te = maxHp / (dmgIn / max(0.25, ttk))`. `geo` = media geométrica móvil de `Te` (τ = 20 s de partida); no se actúa con menos de 8 muertes en la ventana.
- **Control cada 2 s**:
  ```
  tgt = TTK_T(t)   // por tramos: [0,0.45],[300,0.7],[600,0.9],[1200,1.3],[1800,1.6] s (calibrar con el bloque 0)
  if (geo < tgt && !danger) hpMul = min(HP_MAX(t), hpMul * min(1.06, (tgt/geo)**0.4))
  else if (geo > 1.3*tgt || danger) hpMul = max(1, hpMul * 0.92)
  HP_MAX(t): [0,1],[120,1.25],[600,2.2],[1200,3.2],[1800,4]
  ```
- **Daño (`dmgMul`)**:
  - `comfort` = media móvil (τ 20 s) de la vida del jugador **más apurado**, leída con `G.Director.hpFrac(pl)` (por defecto `pl.hp/pl.maxHp`; curve.cjs la sustituye, §5); para los compañeros, `m.pl.net.hp / net.maxHp`.
  - `danger` = alguno ha bajado del 30 % o ha caído en los últimos 25 s (avisado con `G.Director.noteFall(pl)`).
  - Si `comfort > 0.8 && !danger && t > 180`: `dmgMul = min(1.5, dmgMul·1.03)`.
  - Con `danger`: `max(1, dmgMul·0.9)`.
- **Dónde se aplica** (siempre **al crear** el enemigo; los invitados no se enteran de un cambio de `dmg` a mitad de vida):
  - `spawner.js:169`: vida `× G.Director.hp()`. `e.sc` lo hereda, así que también las invocaciones.
  - `spawner.js:172`: `e.dmg × G.Director.dmg()`. Disparos y zonas salen de `this.dmg` y escalan solos.
  - `spawnBoss` (`spawner.js:207`) y `rift.spawnLegends`: **sólo** `e.dmg *= G.Director.dmg()`, nunca `hp()` (su vida sale de §8.1).
  - **«Defensa»** (lo que pide el dueño): repartir `hpMul` en `maxHp × hpMul^0.6` y `e.defK = hpMul^-0.4`, que es un factor de daño en `Enemy.hurt` del anfitrión.
    - **Nada de defensa plana**: rompería los ataques de muchos golpes pequeños (órbitas, rastros, ráfagas), y el dueño no quiere tocar los ataques.
  - Opcional: `rateMul` hasta ×1,5 si `count < 0.4·capAt` durante más de 10 s.
  - Opcional: que la élite salga cuando `hpMul > 1.3` y no por pantalla llena.
- **Opcional, recomendado por diseño: variedad antes que vida.** Si el director sólo convierte el margen en vida, los enemigos acaban siendo «esponjas». Mejor gastar el margen en este orden:
  1. **Densidad**: `rateMul` hasta ×1,5 y +10 en `capAt`, sin pasar del límite de rendimiento de §9.7.
  2. **Composición**: más élites, cada una con un modificador visible y su aura (rápida, con escudo, que se divide al morir, que dispara).
  3. **Sólo después**, `hpMul` y `defK`.

  Así se siguen arrasando hordas, y la amenaza viene de la variedad y se lee de un vistazo.
- **Para no castigar al que va flojo**:
  - los multiplicadores nunca bajan de 1;
  - sólo suben si matas más rápido que el objetivo;
  - con `danger` se congelan y bajan;
  - las protecciones actuales (`earlyK`, `earlyHp`, `youngK`, `soft`, `capAt`) siguen debajo.
- **Opcional, para registrar y calibrar**: un «poder de build».
  - `BP = atkMul × (1 + critChance·(critMul−1)) × Σ (m.evolved ? 8.7 : 1 + 0.55·(m.lvl−1))` sobre los ataques del hueco activo.
  - Si se quiere que reaccione al momento de fusionar o evolucionar, usarlo como suelo: `hpMul ≥ clamp((BP/BP_REF(t))^0.5, 1, 2)`.

### 7.3 Protección del principiante (pendiente de la versión anterior)
- Hoy, con un Pokémon **sin mejoras compradas**, se cae pronto. En la última revisión (29-10, 4 partidas) la primera caída fue hacia el **minuto 3** de mediana (Charmander 1,6-4,7 y Gible 2,2-3,9). La cabecera de `enemies.js` da cifras más optimistas (5,1-12,2): hay mucha varianza, así que se toma como referencia la línea base del bloque 0. El objetivo del dueño es aguantar hasta el 8-15.
- Añadir `G.Enemies.rookieK(pl, t)` según la fracción de mejoras compradas **del Pokémon elegido** (las mejoras son por Pokémon: `G.DB.upgradesOf(dex)` frente a `G.Upgrades.LIST[].max`, `db.js:1354-1357`; mirar la cuenta dejaría sin protección a un veterano con un Pokémon nuevo):
  - ~0,6 del daño recibido con menos del 25 % de las mejoras, interpolando hasta 1 al subir las mejoras;
  - vuelve a 1 hacia el minuto 10-12;
  - se aplica en `player.hurt` junto a `youngK`;
  - **continuo** (sin saltos al comprar una mejora) y **cada jugador con sus propias mejoras** (el daño a cada jugador lo resuelve su aparato).
- Medir con `6:zero:3 445:zero:3 225:zero:2` (y `max` para que no cambie): mediana sin mejoras ≥ minuto 8 y ninguna caída antes del 5.

### 7.4 Objetivos y tests del bloque 2
- **Con todas las mejoras**:
  - primera caída: mediana todavía ≥ minuto 15;
  - más caídas en los minutos 20-30 que ahora;
  - `geo` ≈ `TTK_T`.
- **Sin mejoras**: `hpMul` mediano ≤ 1,1; primera caída y muro, como en §7.3.
- **Test nuevo `tests/director.test.cjs`**, con un G de juguete como `tests/jefes.test.cjs`:
  - nunca < 1;
  - respeta `HP_MAX`;
  - se frena con `danger`;
  - no hace nada con pocas muertes.
- **Cooperativo**: no viaja nada nuevo, porque `'ne'` ya lleva `maxHp` y `dmg`. Un invitado de la versión anterior funciona igual.
- **Ranking**: el tiempo aguantado deja de ser comparable. Si el dueño lo marca en §0, tablas nuevas desde la 2.0, como se hizo con `best2` (`ranking.js:135-137`; ids nuevos que `firestore.rules` ya acepta).
- **Opcional, recomendado por diseño: riesgo a cambio de premio.** Hoy toda la dificultad es automática: el jugador bueno no puede pedir más peligro a cambio de algo (como la Maldición de Vampire Survivors o el Calor de Hades).
  - Un **Altar del Desafío** en el mapa. Al tocarlo, el director no baja de `hpMul ≥ 1,3` ni de `dmgMul ≥ 1,2` el resto de la partida.
  - A cambio, +50 % de monedas y una elección de vínculo más, o un objeto. **Nunca tickets por encima del tope de 30.**
  - Bandera `pl.heat`; no viaja nada nuevo porque decide el anfitrión. Textos en 7 idiomas.

---

## 8. Bloque 3: jefes y legendarios que dan miedo

### 8.1 Vida según el DPS medido, con un mínimo por tiempo
- **Medidor**: exportar `G.Judgment.singleDps()`, que hoy está sólo en `debug`.
  - Pasarle el daño **en bruto**, el `amount` de la entrada de `Enemy.hurt` antes de `sigK`, del tope y del escudo (`enemy.js:192`). Si no, el tope se mediría a sí mismo.
  - Alargar la memoria a ~120 s (media de los 8 mejores segundos), para que no se pueda «dejar de pegar» antes de entrar en una grieta.
  - **La Sentencia también lo usa** (`fight()`, `judgment.js:180-183`) y el plan es no tocarla: mantener para ella el cálculo antiguo (30 s, los 6 mejores) en una función aparte, o volver a medirla con curve.cjs.
  - **En grupo**, el medidor guarda el **máximo** por enemigo y segundo, no la suma (`judgment.js:79-86`): si cada jugador pega a un blanco distinto, mide de menos. Usar como mínimo la suma de los mejores de cada jugador (contando por quién manda cada `'h'`), o dejar `scaleHp` también sobre la parte de DPS.
  - Contra enemigos que mueren en menos de 1 s, la muestra se queda en su vida: antes del primer jefe o grieta mide de menos. Comprobar en curve.cjs que el `singleDps` de antes de una grieta se parece al medido contra el jefe.
- **Función común en `enemies.js`**, usada por `spawner.spawnBoss` (`spawner.js:207-216`) y `rift.spawnLegends` (`rift.js:454`).
  - **`maxHp`/`hp` se ajustan entre el `new` y `G.EnemyMgr.add(e)`** (`spawner.js:209-211`; en rift.js, antes de la línea ~473). `add` manda `'ne'` con `Math.ceil(e.maxHp)` y el invitado recorta la vida a ese máximo (`coop.js:457`): si se cambia después, su barra queda mal para siempre. Nada cambia el `maxHp` de un enemigo ya añadido.
  ```js
  const BOSS_TTK = [[180,15],[540,22],[900,32],[1260,42],[1620,45]];   // s, jefe del mapa
  const LEG_TTK  = [[240,20],[600,28],[1200,34]];                       // s, cada legendario
  // vida = max(suelo, min(suelo·6, suelo·(singleDps·0.65·TTK(t)/suelo)^0.75))   (compensa sólo una parte, §7.1)
  // legendarios: además × HP_EACH[k]
  ```
- **«Que escalen con su nivel»**: los jefes no tienen nivel (el HUD sólo enseña el del jugador). Se entiende como «según el minuto y según tu fuerza» (mínimo por tiempo + vida por DPS). Opcional: enseñar en la barra del jefe un «Nv.» calculado del minuto (por ejemplo `10 + 2·min`) para que se note.
- **Mínimos nuevos** (que nunca sean más flojos que un enemigo normal):
  - legendario: `(4000 + 22·eff)·soft·HP_EACH[k]` (~7.500 PV en el minuto 10, 10.900 en el 20 y 14.500 en el 25);
  - jefe del mapa: multiplicar también por `lateHp(t)`;
  - jefes de los minutos 3-12: no tocar su mínimo (`docs/JEFES.md` explica que ya fueron un muro sin mejoras).
- **Cooperativo**: `scaleHp(n)·1,4` sólo sobre el mínimo. El DPS medido ya incluye a todo el equipo, porque los golpes de los invitados llegan con `'h'` y se aplican con `e.hurt` en el anfitrión.
- **No escalar dos veces con el director** del bloque 2: los jefes usan esta fórmula y el director sólo toca su daño.

### 8.2 Fases: que les dé tiempo a atacar
- **Umbrales**: legendarios, 66 % y 33 %. Jefes del mapa: 50 % hasta el minuto 12, y 66 % y 33 % desde el 12.
- **En `Enemy.hurt`** (sólo si es jefe, no `remote` y no `judge`): si un golpe cruza el umbral, la vida **se queda en el umbral** y empieza una transición:
  - **2-2,2 s sin recibir daño**, con un campo propio `e.bossPhaseT` (no `e.phase`, que ya existe para la embestida: `e.phase === 'dash'`). No usar `sigK`: `BossSig.cast` lo pone a 1 al acabar.
  - Burbuja (marca `'bubble'`, ya existe) y empujón (`'push'`, r 300, f 380; el de Mewtwo es f 420, que `onNet` recorta a 400; `enemy.js:1826`).
  - **Firma obligatoria**: `ai.sigT = 0; ai.cd = 0`.
- **Última fase** = `enrage()`. Hoy `bossMove` enfurece al bajar del 50 % (`enemy.js:561`: `if (!ai.fury && this.hp < this.maxHp*0.5) this.enrage()`): **sustituir esa condición** por la entrada en la última fase, para que no salte a mitad de la fase 2 y el bit 16 siga llegando a los invitados. Los legendarios llaman además 3-4 esbirros con `G.Spawner.minions`, que ya respeta el tope.
- Así **los legendarios y los jefes desde el minuto 12 usan al menos 2 firmas aunque el DPS sea infinito**; los jefes de los minutos 3-12, al menos 1.
- **Opcional, recomendado por diseño: ventanas de castigo.** Tras cada firma y en cada cambio de fase, el jefe queda «agotado» 1,5-2 s, con estrellas sobre la cabeza (marca nueva al final de `MARK`, saneada en `onNet`): no ataca y su depósito del tope (§8.3) se rellena al doble. Así la pelea alterna esquivar y castigar, y se premia al que esquiva bien.

### 8.3 Tope blando de daño por segundo
- **Sólo lo tiene quien lo trae**: `spawnBoss` y `spawnLegends` ponen `e.dmgCap = { rate, max, pool }`. Así no se rompe el test `'a hidden or shielded boss…'` (`tests/jefes.test.cjs:225-238`), que espera exactamente 985 y 835.
- **Funcionamiento**:
  - un depósito se rellena a `rate·maxHp` por segundo y guarda como mucho el 10 % de la vida;
  - lo que se pase del depósito cuenta sólo ×0,15;
  - `rate = 1/(0,6·TTK)`. Ojo: eso sólo garantiza el 60 % del tiempo objetivo si el exceso es pequeño. Con un DPS k veces el tope tarda `0,6·TTK/(1 + 0,15·(k−1))` (con k = 10, el 26 %). Con más DPS mandan la vida por DPS de §8.1 y las fases de §8.2. Si hace falta más freno, un segundo umbral: ×0,15 hasta 2 veces el tope y ×0 por encima.
  - **En la arena**, un solo depósito compartido por todos los legendarios, con `rate` calculado para que la arena entera no baje del 60 % del objetivo de §8.6 según cuántos haya (con ataques en área los 2-3 bajan a la vez).
- **Orden dentro de `hurt`**: `sigK`/`sigVulnK` → tope → bloqueo de fase → escudo. También se aplica a quemaduras, veneno y lava.
- **`this.rd` sigue siendo el daño aplicado**: lo usan las curas y escudos de los apoyos (`enemy.js:907, 924`).
- **Cómo se ve**: números en gris (`'weak'`) y destello en la barra (`hud.js:637-639`).
- **No poner tope por golpe**: castiga los ataques lentos y fuertes.

### 8.4 Más amenaza
- **Firma antes**: en los legendarios, `sigT = rand(2.5, 3.5) + i·1.2` (`BossSig.init`, `enemy.js:1658`).
- **`crowd` más suave en la arena**: `×(1 + 0,2·(crowd−1))` (`enemy.js:568, 1662`).
- **Golpes con mínimo según tu vida**, usando `pct` de `G.Hazards`, que ya existe y ya viaja con `'hz'`:
  - pisotón 0,10;
  - embestida y salto 0,12;
  - firmas 0,15-0,2 en los jefes del mapa y 0,18-0,22 en los legendarios.

  Así, con muchísima vida, se siguen notando.
- **Daño base de los legendarios**: `(40 + eff/10)·soft` (116 en el minuto 25, frente a 74 hoy).
- **Opcional, segunda vuelta: barra de aguante.** Campo nuevo `e.guard`/`e.guardMax`, **no** `e.shield` (ese ya es el escudo de los apoyos: absorbe el golpe entero, caduca a los 8 s, viaja como el bit 4 y lo comprueba `jefes.test.cjs:225-238`).
  - 20 % de la vida al salir y en cada fase; mientras dura, el daño a la vida cuenta ×0,35.
  - Al romperla, aturdido 2 s y `expose(e, 1.5, 4)`.
  - En la red: bit 256 del 7.º campo («guardia activa») y el porcentaje en un evento `'gd'` sólo cuando cambia. Sin 8.º campo.

### 8.5 Sitios al azar
- **Grieta** (`rift.js`): sustituir `SPOTS_IN` en `startIntro` (`rift.js:300`) por `pickSpots(k)`, calculado sólo por el anfitrión.
  - **Candidatos**: 12 ángulos × radios de 4,5, 5,5 y 6,5 casillas alrededor del punto de llegada.
  - **Filtros**:
    - dentro de `ARENA_R − 2`;
    - `G.World.isFree`;
    - a más de `r + 110` px de los jugadores;
    - a más de 2,5 casillas entre legendarios;
    - **dentro de la franja visible en el móvil tumbado y en Ultra** (como mucho 3,5 casillas hacia arriba y 4 hacia abajo).
  - **Respaldo**: si no hay candidato válido, se usa `SPOTS_IN`.
  - Ya viaja con `'lgi'`.
  - **Arreglar el fallo** de `introAt` (`rift.js:334-341`): si `'lgi'` llega antes que `startIntro`, hoy se pierde. Hay que guardarlo en `pendingLgi`.
  - **No mover** el punto de llegada de los jugadores: cambiaría `arenaSafe` y un invitado viejo vería otro terreno.
- **Jefes del mapa**: `bossSpot(pl, b)`.
  - **Dónde**:
    - 50 %: fuera de la vista, como hoy;
    - 30 %: junto a un sitio especial (torre, manantial…), a 350-900 px;
    - 20 %: según su tipo. Agua sale del agua (`isLiquid`); Tierra, Roca y Acero salen del suelo dentro de la vista.
  - **Aviso**: si sale a la vista, primero un aviso de 1,8 s con la aparición de su tipo (`Rift.appearOf`, `G.BossFX.appear`). Es una marca nueva `'arrive'` en `MARK` (`enemy.js:2774`), saneada en `onNet`.
- **Sentencia**: ya sale al azar, no tocar.

### 8.6 Objetivos y tests del bloque 3
- **Con todas las mejoras**:
  - jefe del mapa: TTK mediano de 25-45 s desde el minuto 15, con ≥2 firmas en el 80 % de los casos;
  - legendarios: arena de 25-40 s con 1, 40-70 s con 2 y 55-90 s con 3; ≥90 % usa su firma. El objetivo más largo tiene que caber con holgura en `TIME_FOR` (120/170/215 s, `rift.js:47`);
  - grietas perdidas: 10-25 %;
  - **tiempo total en arenas ≤4-5 min por partida** (mediana): en la arena no salen enemigos normales y no se gana experiencia. Si pasa, subir `CHECK` (`rift.js:40`) de 30 a 45 s;
  - **la build sigue contando**: Mewtwo tumba a los jefes de los minutos 15-21 al menos un 20 % antes que Delibird.
- **Sin mejoras**: grietas perdidas ≤50 %.
- **Lo que ve un invitado**: hoy predice el golpe en local (`this.hp = max(1, hp−d)` y `showHurt(d)`, `enemy.js:177-182`). No sabe nada del tope, de `defK` ni de los 2 s de fase: ve números más grandes y la barra que baja y vuelve a subir. Invitado v2: con la marca de fase (o el bit 256), no restar vida en local ni enseñar números mientras dure, y con el tope enseñar `d` en gris. Para v1 se acepta. Test en `jefes.test.cjs`.
- **Tests en `tests/jefes.test.cjs`**:
  - tope: con el depósito lleno, un golpe de 5.000 a un jefe de 10.000 PV le quita 1.000 + 0,15·4.000 = 1.600;
  - fases: un golpe enorme se queda en el 66 %, empieza la transición y se fuerza la firma;
  - vida por DPS: con `singleDps = 5000`, la vida es al menos `5000·0,65·TTK`;
  - `pickSpots`: con 200 semillas, todos los sitios dentro, libres y lejos de los jugadores, con ≥6 posiciones distintas;
  - un `'lgi'` que llega antes de tiempo se aplica igual;
  - un invitado de la versión anterior ignora `'arrive'` y los bits nuevos (ampliar el test de `jefes.test.cjs:310`).
- **Herramientas**: subir `REF.bossHp` en `tools/balance.cjs:56` (hoy 40.000). Actualizar `docs/JEFES.md`.
- **Cosas para el dueño en la consola**: `G.Judgment.debug.single` (su DPS), `G.Rift.debugArena('fire', 3)` y `G.Spawner.debugBossesFrom(1260)`.
- **Textos nuevos**: «¡{x} cambia de fase!», «¡{x} resiste!», «¡Guardia rota!», «Algo se acerca…», en 7 idiomas.
- **Se vuelven más difíciles**: las misiones `boss`, `wboss` y `wrift` y los logros `boss100`, `rift10` y `legAll`. Revisar que sigan siendo razonables.

---

## 9. Bloque 4: enemigos más listos

Todo corre en el anfitrión o en solitario, como hoy. La IA **nunca** depende de la calidad gráfica: sólo las partículas. Módulo nuevo **`js/systems/enemy-ai.js` (`G.EnemyAI`)**, junto a `pathing.js` en `dev.html`; `enemy.js` sólo llama a sus ganchos.

**Ojo con los envoltorios**:
- `combat.js` envuelve `Enemy.prototype.update` (`:2970`) para los estados que se llevan la IA (`LEADS`, `combat.js:2574`). Ahí `update` recibe un objetivo falso (`fakeAt`, `combat.js:2726`) sin campo de pathing y con `_vx = _vy = 0`, y los ganchos tienen que aceptarlo.
- `combat.js` usa `e.flying` para los ataques (×1,5 contra voladores, ataques de suelo que no les dan): **no reutilizarlo para el movimiento**. Usar un campo nuevo, `e.mv`.

**«Listeza» que crece con la partida**: `iq(t) = clamp((G.Enemies.eff(t) − 80) / 440, 0, 1)`. Vale 0 hasta el minuto 2, 0,38 en el 10 y 1 en el 20. Así el principio no cambia. Si el director del bloque 2 ya endurece, `iq` cuelga del mismo reloj, sin contar dos veces.

### 9.1 Primero el rendimiento
- Guardar en `chunkData` (`world.js:107`) un `c.solid = Uint8Array(256)` junto a `c.terr`, actualizado en `destroyProp` y `breakAt` (`world.js:521-529`). **Sólo paredes y objetos sólidos**: el líquido que hace daño depende del bioma (`liquidKind()`; el agua pasa a lava cada 4 minutos y `setBiome` no rehace `data`), así que se mira aparte con `c.terr` y la clase del campo.
- Que `walkable` y `collide` usen el último chunk cacheado, **sin claves de texto**.
  - Objetivo: un campo ≤0,5 ms (hoy 3 ms) y `collide` ≤3 µs (hoy 7).
- Repartir la construcción de campos en `G.Path.update`: **uno por fotograma, por turnos**. Hoy se hacen todos en el mismo fotograma y dan un tirón de 35-60 ms en móvil con 4 jugadores.

### 9.2 Campos por clase y por tamaño
- **Dijkstra con cola por cubos** (costes enteros pequeños), con `Uint16Array` y la misma ventana. Coste: 5 en ortogonal y 7 en diagonal.

  | Clase | Para quién | Suelo | Agua/pantano | Lava, veneno, descarga |
  |---|---|---|---|---|
  | walk | Todos por defecto | ×1 | ×2 (evita los lagos salvo que el rodeo sea de más del doble) | Bloqueado |
  | swim | Tipo Agua | ×1 | **×0,6** | Bloqueado |
  | lava | Inmunes al líquido del bioma, y los legendarios | ×1 | ×1 | Igual que el suelo |

- **Variante «big» para radio >15** (con casillas de 32; escrito en función de `TS`: `r > 0,47·TS`): sólo casillas con holgura (ella y sus 4 vecinas libres), con una transformada de distancia de 2 pasadas sobre la ventana. Si con ella no hay camino, se usa el campo normal.
- Sólo se construyen las clases con enemigos vivos a menos de 900 px de ese jugador.
- `clearLine` con el radio real (`r·0.9`, sin el tope de 14,4).
- Opcional: ampliar la ventana, o un campo grueso de 4×4 casillas para los lejanos, y muestrear la dirección con interpolación bilineal para un movimiento más suave.

### 9.3 Desatasco determinista
Sustituye `enemy.js:423-428` y `479-490`.
- **Atascado** = el valor del campo en su casilla no baja en 1,2 s, y no te está tocando ni guardando distancia.
- **Con camino**: seguir el campo estrictamente durante 1,5 s, sin atajo de línea de vista y yendo al centro de las casillas.
- **Sin camino**: seguir la pared por un lado fijo (el de menor ángulo con la dirección deseada) durante hasta 2 s.
- **Más de 4 s atascado**:
  - si nadie lo ve, `G.Spawner.ahead`;
  - si se ve, un saltito (reutilizar `startJump`/`updateJump` sin zona de daño) a una casilla libre 2-3 casillas más adelante en el campo.
- **Los de distancia** se alejan subiendo por el campo, no en recta hacia atrás.
- **Al aparecer**: que enemigos, jefes y legendarios sólo salgan en casillas con distancia finita al jugador, nunca en bolsas cerradas.

### 9.4 Usar mejor sus ataques (todo escalado por `iq`)
Los avisos se quedan como están (1,0 / 1,05 / 1,2 s): **más listos, pero igual de justos**.
- **Apuntar adelantado**: `pl + pl._vx·τ`, con `τ = iq·clamp(dist/190, 0, 1.2)·U(0.6, 1)`. `_vx/_vy` ya se calcula en `enemy.js:1278-1285`, y el azar evita que sea imposible esquivar.
- **Línea de vista antes de disparar** (ranged, fan, beamer): si no la hay, no disparan (`shotCd = 0.4`) y avanzan por el campo.
- **Rodear en vez de quedarse quietos** a 0,82·rango: el lado sale de `hash(id)`, a 0,55·spd.
- **Por personalidad**:
  - charger: se adelanta `iq·0,35 s` y no embiste si la recta choca;
  - jumper: cae donde vas a estar (`iq·0,5 s`), sólo en un sitio libre;
  - zoner: con `iq > 0,5`, una zona va donde estarás en 1,2 s;
  - beamer: apunta a donde estarás en `iq·0,6 s`.
- **Cuerpo a cuerpo: interceptar y flanquear**.
  - A más de 120 px, van a tu posición adelantada.
  - Entre 120 y 350 px, desvían el objetivo un ángulo fijo por enemigo de ±(20°–70°)·iq, a `min(dist·0,5, 120)` px de ti. Así llegan por varios lados y no en fila india.

### 9.5 Terreno según el tipo (`e.mv`)
Se decide en el constructor (`enemy.js:70-127`). **Nunca** para jefes del calendario, ladrón, estampida ni apoyos. Los legendarios y los de la Sentencia se marcan **después** del `new` (`rift.js:462`, `judgment.js:389`): a los legendarios se les pone `e.mv = 'lava'` y la variante big en `spawnLegends`, después de `e.legend = true`; los de la Sentencia, sin `mv`.

| `mv` | Quién | Qué hace |
|---|---|---|
| swim | Agua que no flota | Campo swim. **×1,5 de velocidad en el agua** (hoy ×1). Se dibuja medio hundido con el recorte que ya hay (`s.sink`, `combat.js:2988-2994`). Puede aparecer en el agua |
| lava | Inmunes al líquido del bioma | Campo lava. ×1,3 dentro de su líquido |
| **dig** | Tierra o Roca que no flota (chase, charger, tank, jumper), desde el tramo 1 | **Excava** (ver abajo). Como mucho 2 bajo tierra a la vez (+1 por jugador extra); recarga de 8-12 s |
| hop | Volador que no flota | Si el rodeo es más de 1,8 veces la recta y estás a menos de 300 px, salta el obstáculo con aviso r40 de 0,9 s. Recarga de 6 s |
| ghost | Fantasma que no flota | Atraviesa paredes y árboles. Dentro de la pared, alfa 0,45 y como mucho 1,5 s. Tus balas se paran en la pared, así que «se esconde» |

**Excavar:**
1. **Hundirse** (0,45 s): animación Charge, recorte y polvo. Todavía se le puede dar.
2. **Bajo tierra** (hasta 2,2 s, `e.under = true`):
   - se le saca de `rebuildGrid` (`enemy.js:1183`), así que ningún `queryCircle` lo encuentra y no toca a nadie;
   - `hurt` sale al principio, como `sigHide`;
   - `stAdd` lo rechaza;
   - `applyBurn`/`applyPoison`/`applySlow`/`applyStun` y los empujones (`kx/ky`) salen si `e.under`: combat.js tiene unos 32 bucles sobre `G.EnemyMgr.all()` que los aplican sin pasar por `hurt`;
   - no vale como `pl.target`;
   - avanza a ×1,5 hacia donde vas a estar, dejando montículo y polvo.
3. **Salir** (a menos de 60 px o al acabarse el tiempo): `hazard({kind:'zone', r:46, delay:0.6, dmg: dmg·1.1})`, el tipo de peligro de siempre, que ya viaja con `'hz'`.

Se dispara cuando estás a 140-420 px y a la vista, o cuando recibe el 25 % de su vida en 1 s («esquivar»), con probabilidad ×iq.

**Legendarios de grieta**: clase lava + variante big + desatasco nuevo. No ponerlos a volar (`rift.js:462-465` explica por qué).

### 9.6 Red y dibujo
- **Por fotograma no viaja nada nuevo**, salvo bits nuevos en el 7.º campo de `enemyList`: 32 bajo tierra, 64 nadando, 128 dentro de una pared. **No cambiar el número ni el orden de los campos.**
  - Invitado v2: con el bit 32 no dibuja el sprite (sólo el montículo) y no mete al enemigo en su rejilla.
  - Invitado v1: lo ve andando por encima y puede recibir su contacto (lo decide su aparato, `combat.js:2104`). Es aceptable durante la actualización, como ya pasó con el bit 16.
- **Peligros**: usar sólo `zone` y `beam` (un tipo nuevo no lo ve una versión vieja).
- **Montículo y polvo en la capa del suelo, en los dos modos**: Normal (`game.js:983-984`) y Ultra (`game.js:1054-1062`). Comprobar el recorte de «hundido» en Ultra.
- **Interacciones con tus ataques** (que no se tocan): los que nadan cuentan como «mojados» (`inWater`, `combat.js:2228`), así que las cadenas eléctricas les dan más. Los que están bajo tierra quedan fuera de zonas y campos; por eso el tope de 2 a la vez.

### 9.7 Objetivos y tests del bloque 4
- **Test nuevo `tests/ai.test.cjs`** (node:test + vm, con `G.Path` y `World` reales): jugador junto a obstáculos, 60 enemigos a 490-550 px con radios 12, 21 y 26 (con casillas de 32; si se pasa a 48, radios proporcionales a `TS`), durante 25 s.

  | | Hoy | Objetivo |
  |---|---|---|
  | Llegan a tocarte | 93 / 75 / 73 % | ≥97 % con cualquier radio |
  | Se atascan | 4,7 / 10 / 12 % | ≤1 % |

  Además:
  - **swim**: con agua por medio, uno de Agua llega al menos un 20 % antes que uno normal, y uno normal no pisa agua si el rodeo es de menos del doble;
  - **dig**: bajo tierra no sale en `queryCircle` ni pierde vida; al salir hay una zona con aviso ≥0,5 s; nunca más de 2 bajo tierra;
  - **rendimiento**: un campo ≤0,5 ms; 100 enemigos (`dirFor` + `collide`) ≤1 ms por fotograma en Node.
- **En el juego**: `G.EnemyMgr.debugStats()` → `{vivos, atascados, bajoTierra, nadando}`, apuntado cada minuto en `curve.cjs`. Objetivo: ≤1 % atascados.
- **FPS**: Chrome con la CPU ×4, minuto 25 o más, ~95 enemigos: ≥55 FPS y ninguna tarea de más de 16 ms en `G.Path`.
- **Cooperativo**: un test como el de `jefes.test.cjs:310`, con los bits nuevos. Y a mano: anfitrión v2 con invitado v2, y anfitrión v2 con invitado v1.
- **De paso, corregir la documentación desactualizada**: las cabeceras de `enemy.js` y `world.js` («los fantasma ignoran el terreno») y `GDD.md:179` y `474` (tope de 280).

---

## 10. Bloque 5: tickets (3-8 tiradas cada 5 minutos, 30 al llegar a Arceus)

### 10.1 Fórmula nueva: un «reloj de tickets», sin tickets en el suelo
- **1 ticket cada 100 s** de partida, hasta el 30:00.
- **+1 por cada jefe del calendario vencido** (11 posibles). No cuentan legendarios de grieta ni los de la Sentencia.
- **+1 al llegar a la Sentencia de Arceus**.
- **Topes**: 30 por partida, y además `floor(1.6·min) + 1` (equivale a 8 cada 5 minutos).
- **Ningún ticket ×10 en partida.**

```
tickets(t, jefes, sentencia) = min(30, floor(1.6·t/60) + 1,
                                   floor(min(t,1800)/100) + jefes + (sentencia ? 1 : 0))
```

**Resultado**:
- con los jefes tardando lo que pide §8.6 (25-45 s; dúos en los minutos 24 y 27), por cada tramo de 5 minutos **4, 5, 4, 5, 4 y 8**. Si los jefes caen antes (a los 20 s), 4, 5, 4, 5, 6 y 6;
- sin vencer jefes, **3 por tramo**;
- **hasta 30** al llegar a Arceus (lo normal, 27-30, según cuántos jefes caigan).

Una partida corta no paga más por minuto que una larga, así que no compensa reiniciar. Con la variante A, ganar una grieta sigue mereciendo la pena: da el vínculo (fusión) y monedas.

**Variante B**, si el dueño quiere que las grietas también den algo:
- 1 cada 150 s;
- +1 por jefe;
- +1 por grieta ganada (como mucho 1 por tramo y 5 por partida);
- +2 al llegar a la Sentencia.

Con esta variante, un jugador flojo puede bajar a 2 por tramo.

### 10.2 Dónde tocar
1. **Archivo nuevo `js/systems/tickets.js`**: `G.Tickets = { CLOCK: 100, RUN_MAX: 30, PER_MIN: 1.6, forRun(time, cbosses, judged), cap(time) }`. Va en el bloque de scripts de `dev.html`, antes de `game.js`.
2. **Contador de jefes del calendario**:
   - `player.js:55`: `this.cboss = 0`;
   - `enemy.js:1301`: `if (e.boss && !e.judge && !e.legend) pl.cboss++`;
   - `pl.bosses` no sirve, porque también cuenta legendarios.
3. **`game.js`**:
   - una vez por segundo, en solitario o en el anfitrión, `want = G.Tickets.forRun(...)`. Si `want > pl.t1`: `pl.t1 = want`, `bankTickets()`, y el texto «+1 ticket» con su anillo (`game.js:689-695`, pasarlo a una función y añadirle un sonido, que hoy no tiene);
   - en `syncTeam` (invitado): `pl.t1 = min(t.t1, forRun(...))` y `pl.t10 = 0`. **Cada jugador cobra lo mismo que en solitario**, no el botín del equipo;
   - en `bankTickets` (`game.js:300`), el mismo tope como red de seguridad;
   - contar el reloj sólo si `!tampered`, o con `min(time, tiempo real + 10)` como `clean()`, para que `G.Game.debugTime` no regale tickets.
4. **Red** (el número de jefes vencidos tiene que llegar al invitado):
   - `teamState()` (`game.js:288-290`): añadir `cboss: pl.cboss` (hoy no lo devuelve);
   - `coop.js:222`: añadir `cb: st.cboss` al final del fotograma;
   - `coop.js:440`: pasar `cb: msg.cb` a `syncTeam`;
   - `syncTeam`: `pl.cboss = t.cb | 0` antes de llamar a `forRun`. Si no llega `cb` (anfitrión viejo), usar `t.bosses`, que es algo más alto pero sigue limitado a 30;
   - `tk` se sigue enviando.
5. **Quitar tickets del botín y darlos en monedas** (regla de partida: 1 ticket quitado = 25 monedas, en montones de 5; calibrarlo con los precios de `upgrades.js`):
   - `pickup.js:85` (×10 de jefes y legendarios) y `pickup.js:89` (`TICKET_RATE = 0`);
   - `enemy.js:264`, Gholdengo: monedas, como el Meowth;
   - `enemy.js:270`, los 3 tickets del legendario;
   - `world.js:573-575`, cofre con candado: más monedas;
   - `events.js:214`, Pokémon perdido.

   **Mantener `KIND`/`SPRITE` de `ticket` y `ticket10` y la rama de `onCollect`**: un anfitrión viejo todavía puede mandar esos objetos.
6. **Misiones y logros**:
   - diarias: igual;
   - semanales: bajar a `{ t1: 5 }` (`missions.js:40-50`) si el dueño lo marca;
   - logros: **nunca cambiar sus ids** (se volverían a pagar).

   Nada de esto cuenta para el tope de 30, porque se cobra fuera de partida.
7. **Saldo ya guardado**: respetarlo. Si el dueño quiere recortar:
   - hacerlo **una sola vez por cuenta**, con una marca como `pzDone` (`db.js:96, 116`) y una clave fija en la libreta (por ejemplo `led.v2`);
   - **nunca** con `fold` ni por aparato, porque al fusionar aparatos se restaría dos veces.
   - `firestore.rules` no se toca.
8. **Textos**:
   - reglas del gacha (`gacha-ui.js:235-236`);
   - aviso del Gholdengo (`events.js:128`);
   - «/30» opcional en el resumen (`run-ui.js:334`);
   - novedades avisando del cambio («los tickets ahora se ganan por tiempo y jefes…»).

### 10.3 Comprobar
- **Test nuevo `tests/tickets.test.cjs`**:
  - `forRun(1800, 11, true) === 30`;
  - cada tramo de 5 minutos da entre 3 y 8, con 0 o con todos los jefes;
  - el total nunca baja ni pasa de 30;
  - un `tk` de un anfitrión viejo como `[999, 50]` deja como mucho `forRun` y 0 tickets ×10.
- **`tests/net-fixtures.cjs`**: añadir `cb` al fotograma `f`.
- **`curve.cjs`**: como `--speed` marca la partida como `tampered`, el reloj de tickets no contaría. Así que cada minuto se comprueba que `pl.t1 === G.Tickets.forRun(st.time, pl.cboss, judged)` (`forRun` es pura), o se activa `G.Tickets.debugIgnoreTamper = true`, que sólo vale con `?dev`. Tras empezar la Sentencia, esperar 2 s antes de cortar y escribir `t1`/`t10` en la línea `RESULT`.
  - Objetivos en los minutos 5, 10, 15, 20, 25 y 30: **entre 3/6/9/12/15/18 y 4/9/13/18/24/30**, y 0 tickets ×10.
- **Efecto en el gacha**: con 30 tiradas por partida sale una legendaria cada ~1,5 partidas; `pulls100` pasa a costar 3-4 partidas.

---

## 11. Bloque 6: el mundo como Mundo Misterioso: Exploradores del Cielo

### 11.1 Qué hace que algo «parezca PMD»
(Es lo que hay que imitar, se usen o no tilesets de internet.)
- **Casillas de 24 px**, en las que un Pokémon ocupa una casilla. Hoy el Pokémon es 1,5 veces más grande que la casilla.
- **Tres terrenos por mazmorra**: pared, secundario (agua, lava o vacío) y suelo. Encaja con lo que ya hay: `WALL`, `LIQUID` y `FLOOR`.
- **Paredes**: masas compactas con contorno oscuro y una cara frontal corta. Un bosque **es pared**, una masa de árboles con borde claro, y se lee como obstáculo de un vistazo.
- **Suelo** de poco contraste, con textura sutil y pocos adornos. **Una paleta corta por bioma que comparten suelo, pared y adornos**: esto es lo que da la homogeneidad que pide el dueño.
- **Agua con ciclo de color** (en PMD es un ciclo de paleta).
- **Sin caminos de tierra** ni objetos de otro estilo.

### 11.2 Tilesets: de dónde y con qué riesgo
- **No existe ningún set libre (CC0/CC-BY) que se parezca de verdad a Exploradores del Cielo.**
  - Kenney Tiny Town/Dungeon y Dawngeon (CC0, 16 px) son de otro estilo.
  - Pixelliverse Plains (CC BY 4.0) tiene otro estilo.
  - Mochii Plains y DustDFG son CC BY-SA, y el «SA» choca con la licencia no comercial del proyecto.
- **Los de Exploradores**:
  - [PMDCollab/RawAsset → `TileDtef/`](https://github.com/PMDCollab/RawAsset/tree/master/TileDtef) tiene más de 100 mazmorras **ya en formato DTEF a 24 px**, con autotiling, variaciones y animación. No tienen licencia y son extracciones del juego.
  - [The Spriters Resource](https://www.spriters-resource.com/ds_dsi/pokemonmysterydungeonexplorersofsky/) sólo tiene hojas sueltas, no preparadas.
- **Riesgo**:
  - Nintendo ha retirado repositorios de fangames de GitHub: Pokémon Essentials en 2018, Relic Castle en 2024 y **Heaven Studio en 2024**, donde el aviso sólo señalaba las carpetas de sprites y **GitHub retiró el repositorio entero y sus 291 forks**.
  - Si GitHub desactiva el repositorio, **cae también la web de GitHub Pages**.
  - El juego ya usa sprites extraídos (SpriteCollab con originales de Chunsoft), así que el riesgo ya existe. Meter tilesets oficiales **lo aumenta**: más arte oficial copiado tal cual, y más parecido a un producto oficial.
- **Recomendación (opción A del §0)**:
  - hacer el **motor DTEF** (abajo), que sirve para cualquier arte;
  - pintar los tilesets **en código** con la gramática de §11.1. Con A, `G.Tileset` pinta la hoja DTEF de cada bioma **en un lienzo, al entrar en el bioma**: no hay PNG, ni `fetch_tiles`, ni nada en `sw.js`. El cargador de PNG y la herramienta de §11.4 sólo hacen falta con B;
  - el estilo no está protegido; los píxeles sí.
- **Si el dueño elige B**:
  - PNG en `assets/tiles-pmd/`, acreditados en `CREDITS.md`;
  - **interruptor** y pintor en código como respaldo, para que retirarlos sea un commit;
  - esto no lo hace legal, sólo limita el daño.
  - Propuesta de tileset por bioma, a comprobar a ojo (sobre todo que la capa secundaria sea el líquido correcto):

    | Bioma | Tileset |
    |---|---|
    | Bosque Umbrío | DuskForest1 / AppleWoods |
    | Cueva Cristal | CrystalCave1 |
    | Volcán | MtBlaze / MagmaCavern2 |
    | normal | LushPrairie |
    | fuego | MagmaCavern3 |
    | agua | BrineCave / BeachCave |
    | planta | MysteryJungle1 |
    | eléctrico | LightningField / MtThunder |
    | hielo | IceAegisCave / MtFreeze |
    | veneno | MurkyCave |
    | tierra | NorthernDesert1 |
    | volador | HiddenHighland |
    | psíquico | MystifyingForest |
    | bicho | ForestPath |
    | roca | DeepBoulderQuarry |
    | fantasma | DarkHill1 |
    | dragón | DarkCrater / MeteorCave |
    | siniestro | DarknightRelic |
    | acero | MtSteel1 |
    | hada | MoonlitCourtyard |
    | Juicio | HiddenLand |

    En RawAsset hay capas sueltas (ForestAreaFloor, ForestAreaWall…) que se pueden mezclar.
- **Código de referencia**: `skytemple-dtef` es GPL-3.0. **No copiar su código**: reimplementar la tabla 256→47→(columna, fila) a partir de la [especificación](https://github.com/SkyTemple/skytemple-dtef/blob/master/docs/format.rst) y su `template.png`.

### 11.3 Decisión de base: casillas de 24 px de arte (`TS = 48`)
- Con `PX = 2` se mantiene la densidad de píxel de los sprites, y un Pokémon ocupa una casilla como en PMD. Pintar arte de 24 px sobre casillas de 32 obligaría a escalar ×1,33 y deformaría el pixel art.
- `G.World.TS` (48) pasa a ser la referencia única; `G.Tiles.T = 16` queda sólo para el pintor de respaldo (`dirtMask` y `LAYOUT` asumen 16).
- **Constantes** (multiplicar por 2/3 lo que va en casillas, para mantener las distancias del mundo):

  | Lugar | Hoy | Propuesta |
  |---|---|---|
  | `world.js:31-34` `T` | `G.Tiles.T` | 24 |
  | `world.js:31-34` `N` | 16 | 16 (chunk de 768 de mundo, 384 px de arte) |
  | `world.js:45` `MAX_IMAGES` | 48 | ~24 (cada chunk pasa a 576 KB) |
  | `terrainBase`: ruido | `tx/13`, `tx/8` | `tx/8.7`, `tx/5.3` |
  | `terrainBase`: claro inicial | `d<9`, rampa `/8` | `d<6`, rampa `/5.3` |
  | `placeProps`: límites del inicio | 7, 12 | ×2/3 |
  | `placeProps`: hierba | `tx/5` | `tx/3.3` |
  | Interactivos: `BLK` / `START_CLEAR` | 20 / 14 | 13 / 9 (revisar `ROOM` y `CLEAR`) |
  | `drawLiquid` (`world.js:715-716`) | `*12+2` | usar `T` |
  | `pathing.js:17` `R` | 28 | 19 |
  | `rift.js:43` `ARENA_R` | 11 | 7-8 |
  | `rift.js:49-55` `SPOTS`, `SPOTS_IN`, `PLAYERS_IN` | En casillas | Pasarlos a unidades de mundo |
  | `rift.js:67`, `judgment.js:54` `TS()` | — | `G.World.TS` |
  | `judgment.js:33` `ARENA_R` | 24 | 16 |
  | `judgment.js:149, 152, 374` `ts*3`, `ts*5` | En casillas | Unidades de mundo |
  | `game.js:1087, 1103` (Ultra) `RAISE`, `CAP_H`, `T` | Leídos de `G.Tiles` | Exponerlos desde `G.World` o `G.Tileset` |

  **Faltan en la tabla otras constantes en casillas** que también hay que pasar (×2/3 o a unidades de mundo):
  - `world.js`: `arenaSafe` (`|lx|≤2`, `ly∈[-6,5]`, `hypot<2.5`, el claro de Arceus a 5 al norte; líneas 75-79), `arena_outer = r+7` (línea 132), las columnas (`tx>>1`, `r−2`), los charcos (`r−1.5`), los objetos (`r−1.2`), `PROP_DIP` y `makeProp` (`y = ty·TS+TS−4`);
  - `rift.js`: `keepInside` (`(r−1.4)·ts`), `zone` (`(r+10)·ts`), `place()` y `placeIntro` (96/112 px en pasos de 16) y la línea ~497 (`TS()*(2+n·1.6)`);
  - `game.js:1030`: `WS = 6` («CAP_H = 24, 4 tiras»).

  **Antes de cambiar `TS`**, buscar todas con `grep -n "arena.r\|ts \*\|TS()"` en `world.js`, `rift.js` y `judgment.js`.

  Los árboles salen por casilla (`h<0.006`): con casillas más grandes hay 2,25 veces menos por superficie, que probablemente es lo que quiere el dueño.
- **Si el dueño prefiere ir paso a paso**, se puede hacer primero 11.4-11.6 con casillas de 16 px y cambiar el tamaño al final, pero así no se arregla la escala de los Pokémon.

### 11.4 Fase A: motor de tileset (DTEF + autotiling de 47 piezas)
- **Formato DTEF** (el de PMDCollab, SkyTemple y PMDO):
  - `tileset_0.png` con 18×8 casillas en 3 secciones de 6×8 (pared, secundario y suelo); a 24 px son 432×192;
  - `tileset_1.png`, `tileset_2.png`… son variaciones;
  - la animación del agua es un ciclo de paleta en `tileset.dtef.xml`.
- **Autotiling «blob»**: cada vecino del mismo terreno pone un bit (N=1, NE=2, E=4, SE=8, S=16, SO=32, O=64, NO=128). Una diagonal sólo cuenta si sus dos cardinales están puestos, y así 256 → 47:
  ```js
  const BLOB = new Uint8Array(256);
  (() => { const id = new Map();
    for (let m = 0; m < 256; m++) {
      let r = m & 85;                                   // cardinales (1|4|16|64)
      if ((m & 2)   && (m & 1)  && (m & 4))  r |= 2;
      if ((m & 8)   && (m & 4)  && (m & 16)) r |= 8;
      if ((m & 32)  && (m & 16) && (m & 64)) r |= 32;
      if ((m & 128) && (m & 64) && (m & 1))  r |= 128;
      if (!id.has(r)) id.set(r, id.size);
      BLOB[m] = id.get(r);                              // 0..46; luego otra tabla 47 → (col, fila) DTEF
    }})();
  ```
  Referencias: [Boris the Brave](https://www.boristhebrave.com/2021/11/14/classification-of-tilesets/) y [Excalibur](https://excaliburjs.com/blog/Autotiling%20Technique).
- **Archivos nuevos**:
  - `js/world/tileset.js` (`G.Tileset`): carga el PNG de cada bioma, con estados *listo*/*fallido* como `sprites.js`. Tiene la tabla de reglas y `paintChunk(cx, cy, N, at, bi, seed, ultra)`, que hornea con ~256 `drawImage` de 24×24 en un lienzo de 384×384 (<1 ms, mucho menos que el pintado píxel a píxel actual). La variación se elige con un hash determinista `H(tx, ty, semilla)` (p. ej. 85 % base), para que en cooperativo todos vean lo mismo.
  - `js/data/tilesets.js`: datos generados por una herramienta, como `sprites-meta.js`. Bioma → carpeta, variaciones, fotogramas del agua, colores de muestra para restilar los objetos y créditos.
  - Los dos van en `dev.html` entre `tiles.js` y `world.js` (líneas ~974-975).
- **Herramienta `tools/fetch_tiles.py` (o `.js`), sólo con la opción B**:
  - genera o descarga las hojas;
  - **convierte el ciclo de paleta del agua en K fotogramas RGBA** (Canvas no puede cambiar la paleta en caliente);
  - extrae los colores de muestra;
  - escribe `assets/tiles/<bioma>/…` y `js/data/tilesets.js`.

  El juego **nunca lee píxeles**: `getImageData` falla con `file://`.
- **Enganche**: `world.chunkImage` (`world.js:606-619`). Si `G.Tileset.ready(bi)`, se usa el tileset; si no, `G.Tiles.paintChunk`. Al terminar de cargar, se vacía la caché de imágenes (como hace `syncMode`). Las vecinas fuera del chunk ya llegan por `at()`, así que no hay costuras.
- **Líquido animado**: hornear el chunk sin el agua y dibujar en `drawLiquid` las casillas de líquido visibles con `drawImage` desde el fotograma actual (~35 por fotograma). `drawLiquid` ya se llama en Normal y en Ultra (`game.js:982, 1055`).
- **Carga y horneado sin tirones**:
  - precargar los tilesets con el menú en reposo (~1 MB en total);
  - **hornear como mucho ~2 ms por fotograma**, y por adelantado en `requestIdleCallback`. Hoy, al cambiar de bioma se hornean 4-6 chunks de golpe: 40-120 ms en móvil cada 4 minutos y en cada grieta;
  - añadir `tiles` a la caché de arte de `sw.js:41-43`.

### 11.5 Fase B: terreno y decoración homogéneos
- **Limpieza del terreno** tras `terrainRaw`: 1-2 pasadas de autómata celular al crear `chunkData`, para quitar las paredes sin bloque 2×2 (hoy un 6,1 %), cerrar los bolsillos y no dejar pasillos de una casilla. Tiene que ser **determinista** y mirar más allá del borde del chunk (como `at()`), para que todos los jugadores vean lo mismo.
- **Bosques** (lo que el dueño ve mal):
  - en los biomas cuyas paredes son bosque, **quitar los árboles sueltos**;
  - convertir las arboledas en manchas de pared de 2×2 o 3×3, que el tileset dibuja como **bosque con borde claro** y que se lee como obstáculo;
  - donde sigan los árboles sueltos, que haya **al menos 28 unidades entre troncos**, para que lo que parece paso sea paso.
- **Hierba alta**: es jugabilidad (cura el 5 % y da monedas el 6 %, `world.js:540-545`), así que se queda, pero con los colores del tileset y en manchas.
- **Caminos de tierra** (`dirtField`, `dirtMask`): quitarlos. PMD no los tiene; las variaciones DTEF hacen de decoración.
- **Objetos** (rocas, cofres, torres, manantiales, trampas; `PAINT` en `tiles.js:880-1497`): restilarlos con los colores de muestra del tileset, o arte nuevo de 24 px.
- **Forma del terreno por bioma**: hoy es la misma toda la partida y sólo cambia la paleta.
  - Cambiar la forma a mitad de partida movería paredes bajo los jugadores.
  - Lo más sencillo es **dejar la forma fija y cambiar sólo el tileset**.
  - Opcional: semilla `seed + bioma` sólo para la decoración.

### 11.6 Fase C: Ultra (2,5D) con el tileset
- **«Se ve raro»**: la queja anterior del dueño sobre el 2,5D se atendió en la ronda del 28-10. Con el estilo PMD, la primera versión debe ser **paredes planas en el suelo**: `wallRows` devuelve `[]` con el tileset activo, y el paso del suelo de `D3` sigue funcionando porque sólo llama a `drawGround`, `drawLiquid` y `visibleProps`.
- **Después**: generar `caps` y `capSlot` desde el tileset (arriba la casilla de pared; la cara, estirando las últimas filas de la pared con el sur abierto) para recuperar los bloques levantados.
- **Cuidado**:
  - `drawWallRow` falla en silencio sin `img.caps` (`world.js:657`);
  - los márgenes en unidades de `update`/`visibleProps` (60, 70, 150) están pensados para casillas de 32.

### 11.7 Fase D (opcional): píxel nítido
- En `camera.resize`, ajustar `scale` para que `2·scale·dpr` sea entero. La vista cambia un ±10-15 %, y `spawner` ya usa `w`, `h` y `outerRadius`.
- O dibujar el mundo a un múltiplo entero en un lienzo aparte y escalarlo una vez.
- Cambia cuánto se ve, así que hay que medir la dificultad.

### 11.8 three.js: no por ahora
- **Por qué no**:
  - PMD es 2D cenital, y lo que pide el dueño (que suelo, hierba y árboles casen) es **dirección de arte**: three.js no lo arregla.
  - Todo el dibujo es Canvas 2D, y una capa three.js obligaría a cuadrar su cámara con la de `camera.js`, o golpes, choques y puntería se desalinean.
  - Suma ~195 KB y un segundo contexto de GPU en el móvil.
- **Única condición para usarlo**: si al medir en móvil el suelo por franjas de Ultra resulta ser el cuello de botella.
  - En ese caso, WebGL **sólo para el suelo** (canvas WebGL debajo y el 2D encima).
  - Con `three@0.186.1` copiado en `js/vendor/` (no CDN) o ~150 líneas de WebGL2 sin librería.

### 11.9 Cooperativo: el cambio de casilla rompe la compatibilidad entre versiones
- **Hoy**:
  - el mapa sale de una semilla compartida (`{k:'start', seed}`, `social-ui.js:425-428`, `game.js:144`);
  - cada jugador genera el terreno y resuelve sus choques;
  - el anfitrión mueve a los enemigos con su propio `pathing`;
  - por la red van **en casillas** los objetos rotos (`pb [tx,ty]`, `coop.js:389-391, 484, 548-551`) y la arena (`arena cfg {tx,ty,r,type}`, `rift.js:231`);
  - el bioma se calcula con el `time` del anfitrión.
- **Problema**: con `TS = 48` y un compañero de la versión anterior, cada uno vería otras paredes, aterrizaría en otro sitio de la arena, rompería otros objetos y vería enemigos dentro de las paredes. **Hoy no hay comprobación de versión del mundo** (`net.js` sólo negocia la versión del códec).
- **Solución**:
  - añadir `wv` (versión del generador del mundo) a los datos de cada miembro de la sala;
  - que el anfitrión **no empiece** si alguien no lo tiene o tiene otro, con un aviso en 7 idiomas tipo «Tu compañero tiene otra versión: que recargue»;
  - mandarlo también en `start`. Un invitado 2.0 que reciba un `start` sin `wv` o con otro distinto sale de la sala con el mismo aviso;
  - **publicar normal**. `node tools/build.js --forzar` (`build.js:84-86`, `updater.js:16-20`) recarga también a quien está en partida, y eso va contra la norma de CLAUDE.md «en partida no se toca». Sólo si el dueño lo marca en §0. Dos jugadores con la versión vieja en partida son coherentes entre sí, y `wv` ya impide mezclar.
- Lo que sólo cambia el dibujo (motor de tileset con la rejilla igual, y Ultra) no afecta a la red. **Suben `wv`**: la limpieza del terreno, el cambio de `TS` y el nuevo reparto de árboles y arboledas de §11.5 (los árboles son objetos sólidos que cada uno choca en local y que viajan por `pb [tx,ty]`).

### 11.10 Comprobar el mundo
- **Test nuevo `tests/world.test.cjs`** (`tiles.js` y `world.js` en `vm` con un lienzo falso):
  - la misma semilla da el mismo hash de terreno;
  - el claro inicial está libre;
  - la tabla 256→47 cubre las 256 combinaciones;
  - el anillo de la arena está cerrado;
  - menos del 2 % de paredes sin bloque 2×2;
  - ningún bolsillo cerrado al alcance.
- **`tests/jefes.test.cjs:323`** simula `G.Tiles = {T:16,…}`: actualizarlo si `rift` y `judgment` pasan a `G.World.TS`.
- **Dificultad**: `curve.cjs` antes y después del cambio de `TS`. La primera caída y el muro deben quedar dentro del ruido.
- **Rendimiento**:
  - `chunkImage` < 1 ms con tileset;
  - ningún fotograma > 25 ms al cambiar de bioma en móvil;
  - contador de FPS en Ajustes, en móvil horizontal, con calidad auto y Ultra.
- **A ojo**: `dev.html?dev` en los 22 biomas (`G.Game.debugTime`, `game.js:1356`), en una grieta de cada tipo y en el Juicio, en Alta y en Ultra. **Capturas de antes y después para el dueño.**
- **Créditos**: si se usa arte de terceros, en `CREDITS.md`. Los nombres de bioma son claves del diccionario: si se renombran, hay que tocarlos en los 7 idiomas.

---

## 12. Riesgos generales y cómo cubrirlos

| Riesgo | Cómo cubrirlo |
|---|---|
| Al quitar el ×45 de Potencia, el jugador queda flojo y la partida choca con un muro en el minuto 12-15 | Orden 1 → medir → 2. El director sólo sube si matas rápido; con `danger` baja |
| Escalar dos veces (director + vida por DPS en jefes + `scaleHp` en grupo) | Los jefes no usan `hpMul` del director; `scaleHp` sólo sobre los mínimos |
| Compañero con la versión anterior | Sólo bits y campos nuevos al final; `wv` para el mundo; un test «la versión anterior ignora lo nuevo» por bloque |
| Guardado | Nada de lo de partida se guarda. No añadir claves a `best`. No cambiar ids de logros. No bajar máximos de mejoras pagadas |
| Ranking | El tiempo aguantado y los niveles dejan de ser comparables: valorar tablas nuevas como `best2` |
| Móvil | Repartir el trabajo pesado entre fotogramas (campos, horneado). Medir con la CPU ×4 |
| Ultra | Todo lo nuevo del suelo y del aire, en las dos capas de `D3`; probar siempre en Normal y en Ultra |
| Idiomas | Cada texto nuevo en 7 idiomas; `build_langs.js --faltan --todo` y `tests/i18n.test.cjs` |
| Misiones y logros más difíciles (jefes, grietas, bajas, nivel) | Revisarlos en `missions.js` y `achievements.js` y ajustar los objetivos sin cambiar ids |
| Documentación desactualizada | Actualizar `docs/JEFES.md`, `GDD.md` (tope de enemigos, personalidades) y las cabeceras de `enemy.js`/`world.js` |

---

## 13. Cómo trabajar y qué entregar
- **Antes de cada bloque**: leer las funciones citadas y comprobar los números (pueden haber cambiado desde 4bbf8e10).
- **Por cada bloque**:
  - medición **antes y después** con `tools/curve.cjs` (como mucho 3 partidas a la vez), guardada en un resumen;
  - tests nuevos y todos los de `tests/` en verde (tras el de i18n, `git checkout -- js/lang` si lo cambia y volver a compilar);
  - `node --check` de lo tocado;
  - compilar y cargar `index.html` sin errores de consola;
  - **capturas** en móvil horizontal (667×375, 932×430) y en escritorio (1280×800), en Normal y en Ultra, cuando cambie algo visible;
  - entrada de novedades (una por fecha, con título corto; avisar en ella del cambio de tickets);
  - commit sin firma de IA.
- **Estado compartido**: actualizar `docs/2.0-ESTADO.md` al acabar cada bloque (cifras de antes y después, decisiones, lo que falta), y `docs/MULTIPLAYER_PROTOCOL.md` si cambia algo de red.
- **Revisión independiente**: al acabar todos los bloques, que otro agente revise sin fiarse (cooperativo con versión vieja, partidas de bot de 8 minutos en Normal y en Ultra, curva con y sin mejoras), y arreglar lo que encuentre.
- **No hacer push**: el dueño dice cuándo se publica.
- **Al terminar**, resumir en lenguaje sencillo, en español:
  - qué ha cambiado para el jugador;
  - las cifras de antes y después (nivel por minuto, tiempo para tumbar jefes y legendarios, tickets por tramo, primera caída con y sin mejoras);
  - qué decisiones se han tomado;
  - qué queda pendiente.

### Pendiente pequeño de la versión anterior (de paso)
- **Gacha en móvil tumbado**: el aviso de logro tapa unos 2,8 s la parte de abajo de las cartas de la segunda fila de una tirada (a 667×375 tapa el «¡NUEVO!»).
- **Arreglo**: con `#pull-fx` abierto, poner el aviso arriba en el centro. Va **al final** del bloque `@media (max-height: 520px)` de `css/style.css:~4968-4973`, después de la regla de `#scr-gacha` (tienen la misma especificidad: si va antes, pierde):
  ```css
  body:has(> #pull-fx:not(.hidden)) .ach-pop { top: calc(max(6px, var(--sa-t)) + 2px); bottom: auto; left: 50%; }
  ```
  Sin tapar el «Nuevos: N · Repetidos: N» ni los botones.
