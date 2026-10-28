# Megaevoluciones en PokéSurvivor (propuesta para una versión futura)

> **Estado:** propuesta de diseño del 26-10-2026. **Nada de esto está en el juego todavía.**
> Los datos de las megaevoluciones salen de [PokeAPI](https://pokeapi.co) y los de los sprites
> del `tracker.json` de [SpriteCollab](https://github.com/PMDCollab/SpriteCollab), consultados ese
> mismo día. Lo que se dice del juego de hoy (movimientos Z, evoluciones en partida, tienda,
> mejoras...) está sacado del código de este repositorio en esa fecha.

## Resumen en un minuto

- **Qué es:** durante la partida, tu Pokémon (ya en su forma final) se **transforma en su
  megaevolución durante 90 segundos**: cambia de sprite, de estadísticas, a veces de tipo y de
  habilidad, y pega y aguanta bastante más. Luego vuelve a la normalidad y la **Energía Mega**
  se recarga combatiendo.
- **Qué hace falta:** el **Mega-Aro** (uno para toda la cuenta, se gana con un logro) y la
  **megapiedra** de ese Pokémon (Charizardita X, Gengarita...), que se compra en la Tienda Kecleon
  o cae en las grietas y en el gacha. Las dos son para siempre y no se gastan.
- **Cuándo:** desde el **minuto 10** y sólo con la **forma final** de la línea (si elegiste
  Charizard, empiezas como Charmander, como hoy; al llegar a Charizard ya puedes).
- **Con el movimiento Z:** se pueden tener los dos, pero **no activos a la vez**.
- **Cuántas:** existen **97 megaevoluciones** y **2 regresiones primigenias** (99 formas de 89
  especies, 92 megapiedras). **44 tienen sprite de Mundo Misterioso** en SpriteCollab (42
  completos y 2 a medias); el resto no tiene sprite todavía.
- **Plan:** fase 1 con las **38 megas** que tienen sprite completo y cuyo Pokémon está en el
  juego como forma final; el resto, cuando haya sprite.

## Índice

1. [Qué son en los juegos y qué tomamos](#1-qué-son-en-los-juegos-y-qué-tomamos)
2. [Cómo encaja con lo que ya hay](#2-cómo-encaja-con-lo-que-ya-hay)
3. [Dentro de la partida](#3-dentro-de-la-partida)
4. [Fuera de la partida](#4-fuera-de-la-partida)
5. [Interfaz](#5-interfaz)
6. [Lista de megaevoluciones](#6-lista-de-megaevoluciones)
7. [Sprites de Mundo Misterioso](#7-sprites-de-mundo-misterioso-spritecollab)
8. [Datos que habría que generar](#8-datos-que-habría-que-generar)
9. [Riesgos](#9-riesgos)
10. [Plan por fases](#10-plan-por-fases)
11. [Decisiones para el dueño](#11-decisiones-para-el-dueño)
12. [Fuentes y cómo se han sacado los datos](#12-fuentes-y-cómo-se-han-sacado-los-datos)

---

## 1. Qué son en los juegos y qué tomamos

En los juegos (Pokémon X e Y, Rubí Omega y Zafiro Alfa, y Leyendas Pokémon: Z-A con su
ampliación Megadimensión), un Pokémon que **lleva su megapiedra** puede megaevolucionar en
combate si su entrenador tiene la **Piedra Activadora** (en el Mega-Aro o la Megapulsera). Sólo
una vez por combate y dura hasta el final del combate. La megaevolución:

- sube 100 puntos sus estadísticas base **sin tocar los PS** (Zygarde es la excepción: su mega
  sale de la forma completa);
- a veces **cambia de tipo** (Mega-Charizard X pasa a Fuego/Dragón, Mega-Gyarados a
  Agua/Siniestro) y casi siempre **de habilidad** (Mega-Charizard Y trae Sequía, Mega-Mawile
  Potencia);
- tiene **otro aspecto**.

Parecidas, pero no megas: las **regresiones primigenias** de Kyogre y Groudon (con el Prisma Azul
y el Prisma Rojo) y Mega-Rayquaza, que no usa piedra sino saber **Ascenso Draco**.

**Qué tomamos tal cual:** el Mega-Aro, una megapiedra por megaevolución, la forma final como
requisito, las estadísticas, los tipos, la habilidad y el aspecto de cada mega, y que no gaste
nada.

**Qué cambia, y por qué:** una partida de PokéSurvivor dura 30 minutos, no un combate. Una mega
que durara toda la partida sería un salto de poder fijo desde el minuto 10 sin ninguna decisión
después, y la diferencia entre tener piedra o no sería enorme. Por eso aquí **dura 90 s y se
recarga** (sección 3.2), como un poder que se gestiona, igual que el movimiento Z.

---

## 2. Cómo encaja con lo que ya hay

El juego ya tiene dos «transformaciones» en partida. La mega tiene que ser distinta de las dos:

| | Evolución en partida (G.Evo) | Movimiento Z (combat.js) | **Megaevolución (propuesta)** |
|---|---|---|---|
| Qué es | Pasar a la siguiente fase de la línea (Charmander → Charmeleon) | Un ataque extra muy fuerte que se lanza solo, a la vez que los tuyos | **Transformarte**: otro sprite, otros stats, tipo y habilidad |
| Requisito fuera | Nada | Pulsera Z de ese Pokémon (3.000) + Cristal Z de un tipo (6.000) | **Mega-Aro** (logro, una vez) + **megapiedra** de esa mega |
| Requisito dentro | Nivel, piedra en el suelo, minuto... (evoluciona hacia el min 5-6 y el 13) | 2 ataques del tipo del cristal en tus huecos | **Forma final** + **minuto 10** + **Energía Mega** llena |
| Se activa | Sola | Tecla Z / botón Z / X del mando | **Tecla X / botón Mega / Y del mando** |
| Dura | Para siempre | 60 s, recarga 240 s | **90 s, recarga 150 s** (menos con jefes) |
| Cambia | Sprite, stats y tipos de la fase | Añade un ataque | Sprite, stats, tipos, habilidad; tus ataques pegan más |
| Es de | Cada partida | Cada Pokémon (Pulsera) y la cuenta (cristales) | La cuenta (Mega-Aro) y cada mega (piedra) |

Ideas de fondo para que encaje:

- **Mismo esquema de compra que el Z**: algo de la cuenta + algo de cada Pokémon, para siempre,
  sin gastarse, comprado con Pokémonedas o ganado jugando.
- **Mismo tipo de botón que el Z** en el HUD (un hueco más de la barra de ataques), con los mismos
  estados (apagado, cargando, listo, activo).
- **La mega llega cuando ya ha llegado la evolución**: la evolución en partida es el «crecer» de
  la primera mitad y la mega, el «pico» de la segunda.
- **Las dos grandes, de una en una**: Z o mega, nunca las dos a la vez (sección 3.9).

---

## 3. Dentro de la partida

### 3.1 Condiciones

Para que el botón Mega funcione hacen falta **todas** estas:

1. **El Mega-Aro** en la cuenta (sección 4.1).
2. **La megapiedra** de esa megaevolución (Gengarita para Mega-Gengar). Si el Pokémon tiene dos
   (Charizard X e Y, Mewtwo X e Y, Raichu X e Y, Absol y Absol Z, Garchomp y Garchomp Z, Lucario y
   Lucario Z) y tienes las dos, va la que hayas elegido en sus Mejoras (sección 4.3).
3. **Ser ya la especie de la mega**: la forma final de la línea, que es la que eliges (con la
   Pokédex por familias del 26-10-2026, siempre eliges la forma final). Mientras eres Charmander o Charmeleon, no.
   En las ramas cuenta la rama que tomes: con la Slowbronita, sólo si Slowpoke evoluciona a
   Slowbro (no a Slowking); Gardevoir y Gallade, igual desde Kirlia.
4. **Minuto 10 o más** de partida.
5. **Energía Mega llena** (3.2).
6. **El movimiento Z no está activo** (3.9).
7. Estar vivo y jugando (no en la pausa, ni con cartas abiertas, ni en el viaje a la grieta).

Con los tiempos de hoy (G.Evo: la primera evolución hacia el minuto 5-6 y la segunda hacia el 13,
entre el 11 y el 17), la primera mega llega:

| Línea | Ejemplo | Primera mega |
|---|---|---|
| No evoluciona | Absol, Mawile, Kangaskhan, legendarios | minuto 10 |
| Una evolución | Riolu → Lucario, Carvanha → Sharpedo | minuto 10 |
| Dos evoluciones | Charmander → Charmeleon → Charizard | al llegar a la forma final (min 11-17, normalmente 13) |

¿Por qué el minuto 10 y no antes? Los que no evolucionan ya tienen todo su poder desde el
minuto 0; si además megaevolucionaran pronto, la ventaja sería doble. Y es justo donde el dueño
nota que la partida se pone dura: la mega llega como ayuda para la segunda mitad. El número se
afina con `tools/balance.cjs` (3.13).

### 3.2 Energía Mega (el medidor)

- Cuando se cumplen por primera vez las condiciones 1-4, la Energía Mega **ya está llena**: se
  puede megaevolucionar en el momento («¡Ya puedes megaevolucionar!»).
- Al acabar una mega, la energía queda a 0 y se llena sola en **150 s** de partida.
- Cada **jefe** derrotado (por ti o por el grupo) añade un **20 %**; cada **legendario** de la
  grieta, un **30 %**.
- El reloj corre con la partida: se para en la pausa, con las cartas de nivel, al elegir objeto o
  vínculo y en el viaje a la grieta (como el del Z).
- Se descartó llenarla por enemigos derrotados: con muchos enemigos (minuto 20+) se llenaría en
  segundos y premiaría aún más a las partidas que ya van bien.

### 3.3 Activación

- **Tecla X** (configurable en Ajustes → Controles como «megaevolución»), **botón Mega** del HUD
  (táctil o ratón) o **Y** del mando (hoy libre en partida; la X del mando es el Z).
- No para la partida (no hay carta que elegir) y en grupo no para a nadie.
- La animación dura **1,25 s** (lo mismo que la de evolución, `Player.EVO_TIME`), con el Pokémon
  **invulnerable** mientras tanto, y acaba con una **onda** que aparta a los enemigos cercanos
  (sin apenas daño: es para respirar, no para matar). Detalle visual en la sección 5.2.

### 3.4 Duración y final

- **90 s** megaevolucionado. Al acabar, vuelve a su forma con una animación corta (0,6 s, sin
  invulnerabilidad larga) y empieza la recarga.
- **Si cae** (en cooperativo, cuando le pueden levantar): la mega se acaba y la energía queda a 0.
- Si la partida acaba (o llega el final de la Sentencia de Arceus) estando en mega, no pasa nada
  especial: el resumen cuenta el tiempo que estuvo megaevolucionado.
- Se puede megaevolucionar las veces que dé la energía: en una partida de 30 min, unas 5 veces.

### 3.5 Qué cambia: estadísticas

Las de la mega pasan por **las mismas fórmulas que el resto del juego** (`tools/fetch_pokedex.py`:
velocidad, ataque físico y especial, defensas) y **con la naturaleza de tu Pokémon** (igual que
`G.Mons.formFor` con las fases). La **vida máxima no cambia** (como en los juegos; también para
Mega-Zygarde, para no subirle la vida al doble de golpe).

Medido con los datos de PokeAPI (columna «Daño» de la tabla de la sección 6), sólo con las
fórmulas las megas pegan **entre un 4 % y un 51 % más (la mitad, un 14 % o más)**, corren entre
un 17 % menos y un 28 % más, y casi todas aguantan algo más. Es poco y muy desigual (Mega-Metagross
y Mega-Dragonite ganan un 4 % porque su subida va a otros stats). Por eso, encima, el **bono Mega**:

| Bono Mega (mientras dura) | Valor propuesto |
|---|---|
| Daño de tus ataques | fórmula × 1,2, con un **total entre +30 % y +60 %** (sube a las flojas y frena a Zygarde y Floette) |
| Daño recibido | **−15 %** además de lo que den sus defensas |
| Velocidad | la de la fórmula, pero **nunca más de un 10 % más lenta** que sin mega (Mega-Scolipede, Mega-Sableye, Mega-Darkrai) |
| Vida | no cambia (ni cura: la onda de la activación ya da un respiro) |

Tamaño: muchas megas son más grandes. El sprite se ve a su tamaño (`G.Sprites.playerScale` ya
encoge a los grandes), pero **el choque sigue siendo el de la forma normal**: si no, megaevolucionar
te haría recibir más golpes y podrías quedarte atascado en un hueco de un tile.

### 3.6 Tipo

Si la mega cambia de tipo (20 de las 99, marcadas con «⟵» en la tabla), mientras dura cuenta el
tipo nuevo para **todo lo que hoy mira el tipo de tu fase**:

- la **tabla de tipos** del daño que recibes (con la tabla suavizada del juego, la Roca le hace a
  Charizard ×2,4 y a Mega-Charizard X, Fuego/Dragón, sólo ×1,6);
- el **+20 % de monotipo** (`Player.MONO_K`): Mega-Aggron pasa a ser sólo Acero y lo gana con sus
  ataques de Acero;
- el **clima** (velocidad según tipos) y los **líquidos** (agua y lava);
- las **habilidades** que miran tus tipos (Adaptable, Acérrimo y la «genérica» de +8 % con tu tipo);
- las **cartas de nivel** (`G.Moves.poolFor` usa los tipos de tu fase): mientras estás en mega
  pueden salir ataques del tipo nuevo (Dragón para Mega-Charizard X) con una chapa «Mega»; lo que
  aprendas se queda. Es una forma natural de que la mega deje huella en tu partida. (Si el dueño
  prefiere que no, basta con usar los tipos de la forma normal para las cartas.)

El **movimiento Z no cambia** con el tipo: depende de tus ataques, no de tus tipos (como hoy).

### 3.7 Habilidad

Mientras dura, **la habilidad de la mega sustituye a la de tu Pokémon**, con su efecto del juego
(`js/data/ability-fx.js`). Al acabar vuelve la tuya. Reglas para que el cambio sea limpio:

- Lo que la habilidad de tu Pokémon puso **al empezar la partida** (críticos de Afortunado, monedas
  de Prestidigitador, imán...) **se queda**: es de tu Pokémon. Sólo se cambian los efectos «en vivo» (daño
  hecho, daño recibido, esquivar, velocidad, cada fotograma, al derrotar, al golpear...).
- Lo que la habilidad de la mega haga «al empezar» se aplica **al megaevolucionar y se deshace al
  acabar**: Fuerza Mental y Bromista (recarga), Insomnio (experiencia), Potencia y Energía Pura
  (sobre los stats de la mega, como hoy con las fases). Hoy esos efectos no tienen «deshacer»
  (`G.AbilityFX.begin` sólo suma): hay que añadirlo o convertirlos en efectos «mientras dura».
- Las de **clima** (Sequía de Mega-Charizard Y, Chorro Arena de Mega-Tyranitar, Nevada de
  Mega-Abomasnow y Mega-Froslass) **ponen su clima al megaevolucionar** si no hay otro. Es de lo más
  vistoso: la pantalla se llena de sol al instante. En grupo, ver 3.12.

**De las 63 habilidades distintas de las megas, 51 ya tienen efecto en el juego.** Faltan 12 (✳ en
la tabla), y PokeAPI aún no da la habilidad de 9 formas de Megadimensión (Mega-Zygarde,
Mega-Heatran, Mega-Darkrai, las dos Mega-Magearna, Mega-Zeraora y las tres Mega-Tatsugiri). Efecto
propuesto, al estilo de las demás (todas rondan los 13 «puntos» de `balance.cjs --habilidades`):

| Habilidad (PokeAPI) | Megas | Efecto propuesto en el juego |
|---|---|---|
| Amor Filial | Mega-Kangaskhan | +20 % de daño: «la cría golpea también». Como multiplicador, **no** como un segundo golpe (sería el doble de golpes y de números de daño en cada fotograma). |
| Piel Celeste | Mega-Pinsir, Mega-Salamence | +15 % de daño con movimientos Normal y Volador (como Piel Feérica con Normal y Hada). |
| Piel Dragontina | Mega-Feraligatr | +15 % de daño con movimientos Normal y Dragón. |
| Megasolar | Mega-Meganium | Sus ataques van como con sol aunque no lo haya (Fuego ×1,5, como el Sol abrasador de `weather.js`) y +15 % con los de Planta, sin cambiar el clima de los demás. |
| Turbotaladro | Mega-Excadrill | +12 % de daño; los cuerpo a cuerpo y embestidas rompen los escudos de los enemigos (como Puño Invisible). |
| Salpicante | Mega-Scovillain | Quien le golpea se quema (como Cuerpo Llama, pero siempre). |
| Aura Guard (sin nombre en español en PokeAPI) | Mega-Lucario Z | Recibe la mitad de daño de los golpes cuerpo a cuerpo. |
| Eelevate (sin nombre en español en PokeAPI) | Mega-Eelektross | Flota como con Levitación y cada enemigo derrotado le da +0,5 % de daño (hasta +15 %). |
| Fire Mane (sin nombre en español en PokeAPI) | Mega-Pyroar (no está en el juego) | +30 % de daño con Fuego. |
| Ráfaga Delta | Mega-Rayquaza | Viento fuerte mientras dura: los golpes muy eficaces contra él hacen daño normal y nadie cambia el clima. |
| Mar del Albor | Kyogre Primigenio | Lluvia fuerte mientras dura: el Fuego no le hace daño y sus ataques de Agua +20 %. |
| Tierra del Ocaso | Groudon Primigenio | Sol abrasador mientras dura: el Agua no le hace daño y sus ataques de Fuego y Tierra +20 %. |
| (sin dato en PokeAPI) | las 9 de arriba | Mantienen la habilidad de tu Pokémon hasta que PokeAPI la tenga (la herramienta de datos avisa). |

Los nombres de habilidad de los juegos van en `js/data/abilities.js` (`G.ABIL`, en los 6 idiomas
que tiene); los 3 sin nombre en español se dejan en inglés hasta que lo haya.

### 3.8 Ataques

**Tus ataques no cambian de familia ni de tipo: son tu build.** Lo que cambia es quién los lanza:

- pegan con los stats y el bono de la mega (3.5) y con su habilidad (Garra Dura, Megadisparador,
  Piel Feérica...);
- las cartas de nivel pueden traer ataques del tipo nuevo (3.6);
- se ven igual (mismos gráficos y mismo coste); la mega se nota en el Pokémon (sprite, aura bajo
  los pies) y en los números.

Se descartó darle a cada mega un ataque propio: serían 97 diseños y se pisaría con el movimiento Z
(que ya es «un ataque nuevo por un rato»). Queda como idea para la fase 4 un **detalle de firma**
barato para las más populares (por ejemplo, el fuego de Mega-Charizard X sale azul: un cambio de
paleta de la caché de sus proyectiles, hecho una vez).

### 3.9 Con el movimiento Z

**Una gran transformación a la vez:**

- Con la mega activa, el botón Z se ve bloqueado (candado con el símbolo Mega) y no se puede
  pulsar; con el Z activo, lo mismo con el botón Mega. Al intentarlo, una pista: «Ahora no: tienes
  el movimiento Z activo».
- Las recargas de los dos siguen corriendo: lo normal será encadenarlos (Z 60 s → mega 90 s → ...).
- La mega no cambia qué cristal va (eso depende de tus ataques).
- Un mismo Pokémon puede tener Pulsera Z y megapiedra (en los juegos no, porque los dos son el
  objeto que lleva; aquí ninguno de los dos ocupa el hueco de objeto de la partida).

Alternativas descartadas: **los dos a la vez** (Z más el +30-60 % de la mega es un pico enorme y
obliga a subir aún más la dificultad) y **uno u otro por partida** (otra elección en los menús antes
de jugar y la mitad de lo comprado sin usar).

### 3.10 Con la evolución en partida

- La mega sólo existe en la **forma final**: la evolución en partida va antes y no se toca.
- Cuando la forma final tiene mega y tienes su piedra, el juego **precarga las hojas de la mega**
  igual que hoy precarga las de la siguiente fase (`game.js`, `evoTick`).
- En la **carta de rama** (Slowpoke, Kirlia...), la rama cuya mega tienes lleva una chapa «Mega».
- La animación de megaevolución reutiliza la de evolución (la silueta blanca que alterna entre las
  dos formas, `Player.evolve`/`evoFx`) con los colores y el símbolo Mega.
- El aviso «Empiezas como Charmander: evoluciona en la partida» añade, si tienes su piedra, «y
  megaevoluciona desde el minuto 10».

### 3.11 Con el resto del juego

| Sistema | Qué pasa |
|---|---|
| Objeto de la partida (Restos, Cinta Elección...) | Nada: la megapiedra **no** ocupa el hueco de objeto (si lo ocupara, nadie elegiría objeto). |
| Vínculos (fusiones de los legendarios) | Nada: se lanzan igual. |
| Mejoras permanentes del Pokémon | Siguen todas (vida, fuerza, críticos...). |
| Grietas y legendarios | Se puede megaevolucionar en la arena; vencer a un legendario carga un 30 %. |
| Sentencia de Arceus (minuto 30) | Se puede; su tope de velocidad también vale para la mega. Logro propio (4.6). |
| Clima | Las megas con habilidad de clima lo ponen al megaevolucionar (en grupo, 3.12). |
| Caer y levantarse (grupo) | Al caer se acaba la mega; al levantarte vuelves normal. |
| Cartas de nivel, objeto, vínculo, pausa | Los relojes de la mega se paran, como los del Z. |
| Resumen final | «Megaevoluciones: 3 · En mega: 4:30 · Daño en mega: 120.000». |
| Ranking | Sin cambios: cuenta el Pokémon elegido. |

### 3.12 Cooperativo

Hoy cada jugador manda su estado unas 15 veces por segundo (`coop.js`, `myState`/`readState`): 19
datos, el último (desde el 24-10-2026) su fase de evolución. Cada uno calcula su propio Pokémon:
posición, vida, ataques **y lo que le golpea**, y manda sus golpes al anfitrión. Por eso:

- **Cada uno megaevoluciona el suyo**, en su ordenador. Sus stats, tipo y habilidad sólo cambian
  sus propios números (el daño que hace se manda al anfitrión como siempre; el que recibe lo calcula
  él). No hace falta ningún mensaje nuevo para que funcione.
- **Para que los demás lo vean**: un dato nuevo, el **20.º**, con la mega activa (su número de
  PokeAPI, por ejemplo 10034 para Mega-Charizard X) o 0. **Al final de la lista**, no en el de la
  fase: una versión anterior lee hasta el 19.º y simplemente no lo ve (le verá como Charizard, sin
  mega), y una nueva sólo acepta megas que existan y sean de la fase que manda ese jugador.
- Al ver que un compañero pasa de 0 a una mega, se precargan sus hojas y se ve la animación (como
  hoy con su evolución, `mateEvolved`); al volver a 0, la de vuelta.
- **Clima en grupo:** hoy sólo la habilidad del anfitrión pone clima (`player.js`). Propuesta para
  la fase 3: el invitado pide el clima con un evento nuevo y el anfitrión lo pone si no hay otro (una
  versión anterior ignora el evento: sin clima, como hoy). En la fase 1, igual que ahora.
- La energía es de cada uno; los jefes y legendarios que carguen energía cuentan para todos (lo
  dice el anfitrión, como los derrotados).
- Pruebas: en `tests/net.test.cjs`, que un estado con el dato 20.º lo lea bien una versión
  nueva, que una lectura antigua lo ignore y que una mega inventada se quede en 0.
- Logro de grupo: los 4 megaevolucionados a la vez (4.6).

### 3.13 Equilibrio

Números de partida para empezar a probar (todos en un mismo sitio de los datos, para afinarlos):

| Qué | Propuesta |
|---|---|
| Minuto desde el que se puede | 10 |
| Duración | 90 s |
| Recarga | 150 s; +20 % por jefe, +30 % por legendario |
| Bono de daño | fórmula × 1,2, total entre +30 % y +60 % |
| Daño recibido | −15 % (más lo de sus defensas) |
| Velocidad mínima | −10 % respecto a sin mega |
| Onda al activar | aparta (empuje como `shove`), daño casi nulo |

Cuentas rápidas: con 90 s de cada 240 s, una mega está activa un 35-40 % de la segunda mitad. El
Z, 60 s de cada 300 s (un 20 %), pero con mucho más pico (a nivel 45 rinde ~1,8 veces un ataque
evolucionado, según el comentario de `data/moves.js`). Como no se suman, la mega es el poder
**largo y defensivo** y el Z el **corto y explosivo**.

Cómo afinarlo: añadir a `tools/balance.cjs` un modo `--mega` (como el `--z`) que mida, para cada
una de las megas con sprite, el daño por segundo y el daño recibido en mega y sin mega a los
minutos 10, 15, 20 y 25. Objetivo: que ninguna pase de ×1,6 ni baje de ×1,3 en daño, que las de
Pokémon flojos (Mawile, Sableye, Banette...) suban más que las de legendarios, y que **una partida
sin megas siga pudiéndose ganar** (la mega ayuda, no es obligatoria). Ojo con el cooperativo: con 4
megas a la vez, el aguante sube mucho; si hace falta, la vida de los enemigos ya escala con el
número de jugadores.

### 3.14 Coste por fotograma y memoria

Pensado para móviles flojos (nada que suba el coste por fotograma):

- **Activar** es un cambio de hojas de sprite y unos números, una vez (como evolucionar). La
  animación usa lo que ya hay: silueta alternando, dos aros y unos pocos destellos (`G.FX.ring`,
  `G.FX.burst` con pocas partículas). Con «Menos sacudidas», sin sacudida ni destello.
- **Mientras dura**: el sprite es un `drawImage` como siempre; el aura son dos elipses en el suelo
  (lo mismo que hoy el aro del Z, `player.js`); la habilidad usa los mismos ganchos que cualquier
  otra; el medidor es una resta por fotograma. Amor Filial va como multiplicador, no como golpe extra.
- **HUD**: un hueco más en la barra de ataques, dibujado como el del Z (en el mismo lienzo, con el
  texto de segundos cacheado como `zLeft`).
- **Memoria**: las hojas de cada mega pesan como las de un Pokémon (de media ~100 KB normal y
  shiny; `assets/pokemon` son 103 MB para 966). Las 38 de la fase 1 añaden unos 4 MB **al
  repositorio**, pero cada jugador sólo descarga la de su Pokémon (y la de sus compañeros), cuando
  la va a usar; las que no se usan se sueltan como hoy.
- **Red**: un número más por envío (0 casi siempre): nada.

---

## 4. Fuera de la partida

### 4.1 Mega-Aro

- Uno por cuenta, para siempre. Se gana con el logro de grietas que ya existe **«Al otro lado»**
  (`rift1`: ganar tu primera pelea en una grieta, contra un legendario): llegar ahí ya pide saber
  jugar, y así la mega se descubre jugando.
  Quien ya tenga ese logro lo recibe al actualizar (en `core/db.js`, `migrate`, como el regalo de
  las Pulseras Z del 24-10-2026), con un aviso que explica qué es.
- No se vende (si el dueño prefiere, también en la tienda por ~2.000, para quien no llegue).
- Se ve en la Mochila, en «Objetos clave».

### 4.2 Megapiedras: cómo se consiguen

Una por megaevolución (92 en total; en la fase 1, las 38 de la sección 10). Para siempre, no se
gastan. Formas de conseguirlas:

| Dónde | Cómo | Para qué |
|---|---|---|
| **Tienda Kecleon**, pestaña nueva «Megapiedras» | **3 al día**, iguales para todos (semilla: la fecha en España, como las MT). Si ninguna es de un Pokémon tuyo, la última se cambia por una que sí (como con las MT y tu compañero). | La vía normal. |
| **Grietas** | El legendario vencido suelta **su** megapiedra 1 de cada 4 veces (Latiosita de Latios...), si aún no la tienes. | Las de legendarios **sólo** salen aquí y en el gacha (no en la tienda). |
| **Gacha** | Si te sale **repetido** un Pokémon que tiene mega y no tienes su piedra, 1 de cada 8 veces sale la piedra en vez de las monedas. | Que los repetidos sirvan. |
| **Logros** | «Mega ante el Creador» y «Megaequipo» dan, además de tickets, una megapiedra a elegir entre las que se venden (4.6). | Premio a lo difícil. |

Precios propuestos en la tienda (para comparar: Pulsera Z 3.000 y Cristal Z 6.000; al acabar una
partida se cobra por tiempo, derrotados, jefes y monedas recogidas, `game.js` `endRun`, y una buena
partida larga da del orden de unos miles): **5.000** si el Pokémon es de 1 a 3 estrellas, **7.500**
de 4 estrellas y **10.000** los pseudolegendarios de 5 estrellas (Tyranitar, Salamence, Metagross,
Garchomp, Dragonite, Baxcalibur). Las de **legendarios** (todos salen en las grietas: Mewtwo, Latias,
Latios, Kyogre, Groudon, Rayquaza, Heatran, Darkrai, Diancie, Zygarde, Magearna y Zeraora) no se
venden: grietas y gacha.

**No hace falta tener el Pokémon para comprar su piedra**, pero la tienda lo avisa («Aún no tienes a
Gengar») y prioriza las de tus Pokémon.

Primigenias y Mega-Rayquaza (fase 3): el **Prisma Azul** y el **Prisma Rojo** los sueltan Kyogre y
Groudon en las grietas (como las piedras de legendarios); Mega-Rayquaza no usa piedra: se desbloquea
con un logro (vencer a Rayquaza en una grieta 3 veces), que da el **Meteorito** como «piedra».

### 4.3 Elegir mega (X, Y y Z)

Charizard, Mewtwo y Raichu tienen X e Y; Absol, Garchomp y Lucario, normal y Z. Si tienes las dos
piedras, en las **Mejoras** de ese Pokémon eliges cuál lleva (se guarda por Pokémon; de serie, la
primera que consiguieras). En la fase 1 no pasa nunca: de cada pareja sólo una tiene sprite
(Mega-Charizard X, Mega-Mewtwo Y, Mega-Absol y Mega-Lucario).

### 4.4 Pokédex

Con la Pokédex por familias (una entrada por forma final), en la ficha:

- Una chapa **«Mega»** en la lista para los que tienen megaevolución (con sprite) y un filtro
  **«Con megaevolución»**. Contador **«Megapiedras: 3/38»** junto al de Pokémon.
- En la pestaña de **Evolución**, después de la forma final: su mega (o sus dos megas) con la
  megapiedra (tenida o no) y cómo se consigue.
- En el **Resumen**, un interruptor **Normal / Mega** que enseña el sprite de la mega (su animación
  de quieto), sus tipos, su habilidad (con lo que hace) y sus stats con barras **antes → después**
  (los del juego, no los de los juegos: vida, velocidad, ataque físico y especial, defensas).
- Las megas sin sprite **no salen** (fase 1). Si se decide enseñarlas, en silueta con «Sin sprite de
  Mundo Misterioso todavía».
- En el **Compendio** (qué hace cada ataque, pasiva y objeto), una sección de megapiedras y las
  habilidades de las megas.

### 4.5 Mejoras

En las Mejoras de cada Pokémon, debajo de la Pulsera Z, una tarjeta **«Megaevolución»** (sólo si
tiene mega con sprite):

- su megapiedra (o las dos, con el selector de 4.3), tenida o no, y un botón «Ir a la tienda»;
- si falta el Mega-Aro, cómo conseguirlo;
- una mejora de varios niveles, **«Sintonía Mega»** (3 niveles; por ejemplo 1.500, 3.000 y 6.000):
  cada nivel, **−15 s de recarga**. Es de ese Pokémon, sólo se compra si ya tienes su piedra y,
  como la Pulsera Z, no cuenta en el progreso de mejoras de arriba. Es un sumidero de monedas
  suave: sin ella la mega funciona igual.

### 4.6 Logros y misiones

Logros nuevos (en las categorías que ya hay):

| Logro | Categoría | Pide | Premio |
|---|---|---|---|
| Al otro lado (ya existe) | Grietas | Ganar tu primera pelea en una grieta | + **Mega-Aro** |
| ¡Megaevolución! | Combate | Megaevolucionar una vez | 3 tickets |
| Megacoleccionista | Colección | 5 / 15 / todas las megapiedras (con sprite) | ticket ×10 / 2 ×10 / título «Megaentrenador» |
| Lazo inquebrantable | Combate | Estar 5 min megaevolucionado en total en una partida | ticket ×10 |
| Mega ante el Creador | Supervivencia | Megaevolucionar en la Sentencia de Arceus | ticket ×10 y una megapiedra a elegir |
| Megaequipo | Misiones y más | En grupo, los 4 megaevolucionados a la vez | 2 ×10, una megapiedra a elegir y el título «Megaequipo» |

Misión semanal «Megaevoluciona 5 veces», **sólo** para quien tenga el Mega-Aro y alguna piedra
(al sortear las misiones, se salta si no). Ninguna misión diaria (si no, quien no tenga piedra
pierde una).

### 4.7 Guardado y nube

En la partida guardada (el `save` de `core/db.js`; las reglas de Firestore no limitan sus campos):

- **Mega-Aro**: la fecha en que se consiguió.
- **Megapiedras**: piedra → fecha. Como los Cristales Z y las Pulseras Z: **no van en la libreta de
  las monedas**; al fusionar dos aparatos, se juntan (unión), nunca se pierden ni salen dos veces.
  Las monedas gastadas, sí, como cualquier compra.
- **Mega elegida** por Pokémon (para los de dos): [mega, fecha]; al fusionar, la más reciente.
- **Sintonía Mega**: en las mejoras de cada Pokémon (al fusionar, el máximo, como las demás).
- Estadísticas para logros: veces y tiempo megaevolucionado.

---

## 5. Interfaz

Todo con el sistema de diseño de `docs/DISENO.md` (tokens, baldosas de icono, textos en español en
el código y traducidos con el resto).

### 5.1 Botón Mega del HUD

Un hueco más de la barra de ataques, **a la derecha del Z** (o en el sitio del Z si no hay Z), del
mismo tamaño. Comprobado con una captura de la partida a 667×375 (el móvil tumbado más pequeño de
los que se prueban): la barra (objeto, 4 ataques y Z) ocupa ~310 de los 667 px; cabe otro hueco
sin tocar el joystick ni la pausa. En el móvil la barra se puede mover con «Colocar los botones»
(`layout-ui.js`): su ancho tiene que contar el hueco nuevo como ya cuenta el del Z (`hud.js`), y el
vínculo guardado, que va a la derecha, se corre un hueco. Dentro, la **megapiedra** (icono propio,
5.6). Estados:

| Estado | Cómo se ve |
|---|---|
| Sin Mega-Aro o sin piedra | No sale (como el Z sin Pulsera). |
| Bloqueado | Piedra en gris con candado; abajo «min 10» o la silueta de la forma final. Al tocarlo, la pista: «Mega: al llegar a Charizard» / «Mega: desde el minuto 10». |
| Bloqueado por el Z | Candado con la «Z» encima. |
| Cargando | Arco de progreso alrededor con los colores Mega (degradado arcoíris suave) y el % en medio. |
| Lista | Halo que late (quieto con «Menos sacudidas») y borde dorado; una vez, «¡Megaevolución lista!». |
| Activa | Halo fijo, barra abajo que se vacía y los segundos que quedan. |

En ordenador, la chapita con su tecla (X) en la esquina, como los ataques y el Z; en táctil, una «M».
Con mando, la Y.

### 5.2 Animación

1,25 s, sin parar la partida: una esfera de luz de colores se cierra sobre el Pokémon, la silueta
blanca alterna entre las dos formas cada vez más deprisa (como la evolución), aparece el símbolo
Mega encima, estalla en la mega con la onda que aparta enemigos, una sacudida suave y el sonido de
los grandes momentos. Cartel: «¡Charizard megaevoluciona en Mega-Charizard X!». Al acabar: un
destello corto y vuelve a su forma. Mientras dura, un aura de dos aros bajo los pies (con los
colores Mega, distinta de los aros del tipo del Z).

### 5.3 Cartas de nivel

- Los ataques del tipo nuevo que salgan durante la mega llevan una chapa **«Mega»** (como la de «Z
  1/2» de los Cristales Z).
- En la carta de rama de evolución, la chapa «Mega» en la rama de tu piedra (3.10).

### 5.4 Pausa

Una tarjeta **«Megaevolución»** junto a la del movimiento Z:

- lista, activa (tiempo que queda) o recargando (%), con su nombre, sprite pequeño, tipos y
  habilidad (con lo que hace);
- tres barras: **Daño**, **Velocidad** y **Aguante**, antes → en mega;
- veces usada en esta partida y daño hecho en mega;
- bloqueada: qué falta («Llega a Charizard», «Desde el minuto 10», «Tienes el Z activo»);
- sin piedra pero con Mega-Aro: «Consigue la Charizardita X en la Tienda Kecleon».

### 5.5 Fuera de la partida

| Pantalla | Qué hay |
|---|---|
| Pokédex | Chapa, filtro, contador, mega en Evolución, interruptor Normal/Mega en Resumen (4.4). |
| Compendio | Megapiedras y habilidades de las megas. |
| Mochila | «Objetos clave»: Mega-Aro y megapiedras (con su Pokémon). |
| Tienda Kecleon | Pestaña «Megapiedras» (3 al día + la garantizada), frase de Kecleon («¡Piedras que brillan con una fuerza misteriosa!») y la piedra en sus estanterías. |
| Mejoras | Tarjeta «Megaevolución» con la piedra, el selector X/Y y «Sintonía Mega» (4.5). |
| Ajustes → Controles | Fila «megaevolución» (tecla X). |
| Resumen final / «Has caído…» | Megaevoluciones, tiempo y daño en mega (cabe en la tarjeta de estadísticas que ya hay). |
| Perfil | Una chapa «Mega» en los favoritos cuya piedra tienes. |
| Logros | Los de 4.6. |

### 5.6 Iconos

Las megapiedras se dibujan como los Cristales Z (pixel art en código, `ui/icons.js`): **una
plantilla** de esfera con la doble hélice dentro, coloreada con el color del primer tipo del Pokémon
(18 variantes, no 92), más el **Mega-Aro** y el **símbolo Mega**. Los nombres sí son los oficiales de
cada piedra.

---

## 6. Lista de megaevoluciones

Todas las formas mega y primigenias que da PokeAPI (99), en orden de la Pokédex. Leyenda:

- **Tipos en mega:** «nuevo ⟵ de antes» si cambia.
- **Habilidad en mega:** nombre del juego; ✳ = aún no tiene efecto en el juego (3.7); * = sin nombre
  en español en PokeAPI.
- **Daño / Velocidad / Aguante:** cuánto cambian con las fórmulas de hoy, **antes del bono Mega**
  (3.5). Daño: su mejor ataque (físico o especial). Aguante: cuánto menos daño recibe (media de
  físico y especial, `G.Stats`). Se compara con la forma que hay en el juego: Mega-Floette, con la
  Floette normal (la mega es de la Floette de flor eterna) y Mega-Zygarde, con Zygarde al 50 % (la
  mega sale de la forma completa).
- **Sprite PMD:** ✅ completo · ⚠️ a medias (le falta la animación de ataque o de andar) · ✨ también
  shiny · — no hay (sección 7).
- **Juego:** XY = Pokémon X e Y · ROZA = Rubí Omega y Zafiro Alfa · Z-A = Leyendas Pokémon: Z-A y su
  ampliación Megadimensión.

| Nº | Pokémon | Megaevolución | Megapiedra | Tipos en mega | Habilidad en mega | Daño | Velocidad | Aguante | Sprite PMD | Juego |
|---:|---|---|---|---|---|---:|---:|---:|:---:|:---:|
| 3 | Venusaur | Mega-Venusaur | Venusaurita | Planta/Veneno | Sebo | +10 % | ±0 % | +10 % | — | XY |
| 6 | Charizard | Mega-Charizard X | Charizardita X | Fuego/Dragón ⟵ Fuego/Volador | Garra Dura | +9 % | ±0 % | +6 % | ✅ ✨ | XY |
| 6 | Charizard | Mega-Charizard Y | Charizardita Y | Fuego/Volador | Sequía | +21 % | ±0 % | +5 % | — | XY |
| 9 | Blastoise | Mega-Blastoise | Blastoisita | Agua | Megadisparador | +23 % | ±0 % | +5 % | — | XY |
| 15 | Beedrill | Mega-Beedrill | Beedrillita | Bicho/Veneno | Adaptable | +27 % | +26 % | ±0 % | — | ROZA |
| 18 | Pidgeot | Mega-Pidgeot | Pidgeotita | Normal/Volador | Indefenso | +26 % | +7 % | +3 % | — | ROZA |
| 26 | Raichu | Mega-Raichu X | Raichunita X | Eléctrico | Electrogénesis | +20 % | ±0 % | +12 % | — | Z-A |
| 26 | Raichu | Mega-Raichu Y | Raichunita Y | Eléctrico | Indefenso | +32 % | +7 % | ±0 % | — | Z-A |
| 36 | Clefable | Mega-Clefable | Clefablita | Hada/Volador ⟵ Hada | Espejo Mágico | +18 % | +4 % | +7 % | — | Z-A |
| 65 | Alakazam | Mega-Alakazam | Alakazamita | Psíquico | Calco | +15 % | +10 % | +8 % | ✅ ✨ | XY |
| 71 | Victreebel | Mega-Victreebel | Victreebelita | Planta/Veneno | Revés | +13 % | ±0 % | +10 % | — | Z-A |
| 80 | Slowbro | Mega-Slowbro | Slowbronita | Agua/Psíquico | Caparazón | +14 % | ±0 % | +5 % | ✅ ✨ | ROZA |
| 94 | Gengar | Mega-Gengar | Gengarita | Fantasma/Veneno | Sombra Trampa | +15 % | +7 % | +9 % | ✅ ✨ | XY |
| 115 | Kangaskhan | Mega-Kangaskhan | Kangaskhanita | Normal | Amor Filial ✳ | +14 % | +3 % | +8 % | ✅ ✨ | XY |
| 121 | Starmie | Mega-Starmie | Starmita | Agua/Psíquico | Potencia | +14 % | +2 % | +7 % | — | Z-A |
| 127 | Pinsir | Mega-Pinsir | Pinsirita | Bicho/Volador ⟵ Bicho | Piel Celeste ✳ | +12 % | +7 % | +7 % | — | XY |
| 130 | Gyarados | Mega-Gyarados | Gyaradosita | Agua/Siniestro ⟵ Agua/Volador | Rompemoldes | +12 % | ±0 % | +10 % | — | XY |
| 142 | Aerodactyl | Mega-Aerodactyl | Aerodactylita | Roca/Volador | Garra Dura | +13 % | +6 % | +8 % | ✅ ✨ | XY |
| 149 | Dragonite | Mega-Dragonite | Dragonitita | Dragón/Volador | Multiescamas | +4 % | +7 % | +7 % | — | Z-A |
| 150 | Mewtwo | Mega-Mewtwo X | Mewtwoita X | Psíquico/Lucha ⟵ Psíquico | Impasible | +12 % | ±0 % | +4 % | — | XY |
| 150 | Mewtwo | Mega-Mewtwo Y | Mewtwoita Y | Psíquico | Insomnio | +14 % | +3 % | ±0 % | ✅ ✨ | XY |
| 154 | Meganium | Mega-Meganium | Meganiumita | Planta/Hada ⟵ Planta | Megasolar ✳ | +28 % | ±0 % | +5 % | — | Z-A |
| 160 | Feraligatr | Mega-Feraligatr | Feraligatrita | Agua/Dragón ⟵ Agua | Piel Dragontina ✳ | +23 % | ±0 % | +6 % | — | Z-A |
| 181 | Ampharos | Mega-Ampharos | Ampharosita | Eléctrico/Dragón ⟵ Eléctrico | Rompemoldes | +21 % | −4 % | +7 % | — | XY |
| 208 | Steelix | Mega-Steelix | Steelixita | Acero/Tierra | Poder Arena | +19 % | ±0 % | +7 % | ✅ ✨ | ROZA |
| 212 | Scizor | Mega-Scizor | Scizorita | Bicho/Acero | Experto | +7 % | +5 % | +9 % | — | XY |
| 214 | Heracross | Mega-Heracross | Heracrossita | Bicho/Lucha | Encadenado | +24 % | −4 % | +9 % | — | XY |
| 227 | Skarmory | Mega-Skarmory | Skarmorita | Acero/Volador | Acérrimo | +29 % | +16 % | +3 % | ✅ | Z-A |
| 229 | Houndoom | Mega-Houndoom | Houndoomita | Siniestro/Fuego | Poder Solar | +12 % | +7 % | +12 % | ✅ ✨ | XY |
| 248 | Tyranitar | Mega-Tyranitar | Tyranitarita | Roca/Siniestro | Chorro Arena | +11 % | +4 % | +8 % | ✅ | XY |
| 254 | Sceptile | Mega-Sceptile | Sceptilita | Planta/Dragón ⟵ Planta | Pararrayos | +17 % | +9 % | +3 % | ⚠️ ✨ | ROZA |
| 257 | Blaziken | Mega-Blaziken | Blazikenita | Fuego/Lucha | Impulso | +16 % | +7 % | +5 % | — | XY |
| 260 | Swampert | Mega-Swampert | Swampertita | Agua/Tierra | Nado Rápido | +16 % | +4 % | +7 % | — | ROZA |
| 282 | Gardevoir | Mega-Gardevoir | Gardevoirita | Psíquico/Hada | Piel Feérica | +16 % | +7 % | +2 % | ✅ ✨ | XY |
| 302 | Sableye | Mega-Sableye | Sableynita | Siniestro/Fantasma | Espejo Mágico | +5 % | −13 % | +17 % | ✅ ✨ | ROZA |
| 303 | Mawile | Mega-Mawile | Mawilita | Acero/Hada | Potencia | +9 % | ±0 % | +15 % | ✅ ✨ | XY |
| 306 | Aggron | Mega-Aggron | Aggronita | Acero ⟵ Acero/Roca | Filtro | +12 % | ±0 % | +6 % | — | XY |
| 308 | Medicham | Mega-Medicham | Medichamita | Lucha/Psíquico | Energía Pura | +21 % | +7 % | +4 % | ✅ | XY |
| 310 | Manectric | Mega-Manectric | Manectricita | Eléctrico | Intimidación | +13 % | +11 % | +10 % | ✅ ✨ | XY |
| 319 | Sharpedo | Mega-Sharpedo | Sharpedonita | Agua/Siniestro | Mandíbula Fuerte | +8 % | +3 % | +17 % | ✅ ✨ | ROZA |
| 323 | Camerupt | Mega-Camerupt | Cameruptita | Fuego/Tierra | Potencia Bruta | +17 % | −9 % | +11 % | ✅ ✨ | ROZA |
| 334 | Altaria | Mega-Altaria | Altarianita | Dragón/Hada ⟵ Dragón/Volador | Piel Feérica | +21 % | ±0 % | +3 % | ✅ ✨ | ROZA |
| 354 | Banette | Mega-Banette | Banettita | Fantasma | Bromista | +21 % | +5 % | +7 % | ✅ ✨ | XY |
| 358 | Chimecho | Mega-Chimecho | Chimechita | Psíquico/Acero ⟵ Psíquico | Levitación | +18 % | ±0 % | +10 % | ⚠️ ✨ | Z-A |
| 359 | Absol | Mega-Absol | Absolita | Siniestro | Espejo Mágico | +7 % | +15 % | ±0 % | ✅ ✨ | XY |
| 359 | Absol | Mega-Absol Z | Absolita Z | Siniestro/Fantasma ⟵ Siniestro | Cortante | +9 % | +28 % | ±0 % | — | Z-A |
| 362 | Glalie | Mega-Glalie | Glalita | Hielo | Piel Helada | +19 % | +7 % | ±0 % | ✅ ✨ | ROZA |
| 373 | Salamence | Mega-Salamence | Salamencita | Dragón/Volador | Piel Celeste ✳ | +4 % | +7 % | +10 % | — | ROZA |
| 376 | Metagross | Mega-Metagross | Metagrossita | Acero/Psíquico | Garra Dura | +4 % | +16 % | +6 % | — | ROZA |
| 380 | Latias | Mega-Latias | Latiasita | Dragón/Psíquico | Levitación | +12 % | ±0 % | +7 % | ✅ ✨ | XY |
| 381 | Latios | Mega-Latios | Latiosita | Dragón/Psíquico | Levitación | +11 % | ±0 % | +5 % | ✅ ✨ | XY |
| 382 | Kyogre | Kyogre Primigenio | Prisma Azul | Agua | Mar del Albor ✳ | +11 % | ±0 % | +1 % | ✅ ✨ | ROZA |
| 383 | Groudon | Groudon Primigenio | Prisma Rojo | Tierra/Fuego ⟵ Tierra | Tierra del Ocaso ✳ | +11 % | ±0 % | +1 % | ✅ ✨ | ROZA |
| 384 | Rayquaza | Mega-Rayquaza | — (Ascenso Draco) | Dragón/Volador | Ráfaga Delta ✳ | +11 % | +7 % | +4 % | ✅ ✨ | ROZA |
| 398 | Staraptor | Mega-Staraptor | Staraptorita | Lucha/Volador ⟵ Normal/Volador | Respondón | +8 % | +3 % | +13 % | — | Z-A |
| 428 | Lopunny | Mega-Lopunny | Lopunnita | Normal/Lucha ⟵ Normal | Intrépido | +29 % | +11 % | +2 % | ✅ ✨ | ROZA |
| 445 | Garchomp | Mega-Garchomp | Garchompita | Dragón/Tierra | Poder Arena | +15 % | −3 % | +5 % | — | XY |
| 445 | Garchomp | Mega-Garchomp Z | Garchompita Z | Dragón ⟵ Dragón/Tierra | Levitación | +4 % | +17 % | −2 % | — | Z-A |
| 448 | Lucario | Mega-Lucario | Lucarita | Lucha/Acero | Adaptable | +13 % | +8 % | +4 % | ✅ ✨ | XY |
| 448 | Lucario | Mega-Lucario Z | Lucarita Z | Lucha/Acero | Aura Guard* ✳ | +20 % | +22 % | ±0 % | — | Z-A |
| 460 | Abomasnow | Mega-Abomasnow | Abomasnowita | Planta/Hielo | Nevada | +18 % | −12 % | +9 % | — | XY |
| 475 | Gallade | Mega-Gallade | Galladita | Psíquico/Lucha | Fuerza Mental | +16 % | +11 % | +7 % | ✅ ✨ | ROZA |
| 478 | Froslass | Mega-Froslass | Froslassita | Hielo/Fantasma | Nevada | +29 % | +3 % | +6 % | — | Z-A |
| 485 | Heatran | Mega-Heatran | Heatranita | Fuego/Acero | ¿? (PokeAPI no la da) | +17 % | −4 % | +5 % | — | Z-A |
| 491 | Darkrai | Mega-Darkrai | Darkrainita | Siniestro | ¿? (PokeAPI no la da) | +12 % | −13 % | +12 % | ✅ | Z-A |
| 500 | Emboar | Mega-Emboar | Emboarita | Fuego/Lucha | Rompemoldes | +9 % | +5 % | +11 % | — | Z-A |
| 530 | Excadrill | Mega-Excadrill | Excadrillita | Tierra/Acero | Turbotaladro ✳ | +12 % | +5 % | +8 % | ✅ ✨ | Z-A |
| 531 | Audino | Mega-Audino | Audinita | Normal/Hada ⟵ Normal | Alma Cura | +11 % | ±0 % | +13 % | — | ROZA |
| 545 | Scolipede | Mega-Scolipede | Scolipedita | Bicho/Veneno | Caparazón | +18 % | −17 % | +14 % | — | Z-A |
| 560 | Scrafty | Mega-Scrafty | Scraftita | Siniestro/Lucha | Intimidación | +18 % | +5 % | +5 % | ✅ ✨ | Z-A |
| 604 | Eelektross | Mega-Eelektross | Eelektrossita | Eléctrico | Eelevate* ✳ | +13 % | +13 % | +2 % | ✅ ✨ | Z-A |
| 609 | Chandelure | Mega-Chandelure | Chandelurita | Fantasma/Fuego | Allanamiento | +11 % | +4 % | +7 % | — | Z-A |
| 623 | Golurk | Mega-Golurk | Golurkita | Tierra/Fantasma | Puño Invisible | +14 % | ±0 % | +9 % | — | Z-A |
| 652 | Chesnaught | Mega-Chesnaught | Chesnaughtita | Planta/Lucha | Antibalas | +12 % | −9 % | +11 % | — | Z-A |
| 655 | Delphox | Mega-Delphox | Delphoxita | Fuego/Psíquico | Levitación | +18 % | +10 % | +4 % | — | Z-A |
| 658 | Greninja | Mega-Greninja | Greninjanita | Agua/Siniestro | Mutatipo | +13 % | +7 % | +5 % | — | Z-A |
| 668 | Pyroar (no está en el juego) | Mega-Pyroar | Pyroarita | Fuego/Normal | Fire Mane* ✳ | +8 % | +7 % | +9 % | — | Z-A |
| 670 | Floette | Mega-Floette | Floettita | Hada | Aura Feérica | +40 % | +21 % | +17 % | ✅ ✨ | Z-A |
| 678 | Meowstic | Mega-Meowstic ♂ | Meowsticita | Psíquico | Calco | +28 % | +7 % | +4 % | — | Z-A |
| 678 | Meowstic | Mega-Meowstic ♀ | Meowsticita | Psíquico | Calco | +28 % | +7 % | +4 % | — | Z-A |
| 687 | Malamar | Mega-Malamar | Malamarita | Siniestro/Psíquico | Respondón | +4 % | +6 % | +8 % | — | Z-A |
| 689 | Barbaracle | Mega-Barbaracle | Barbaraclita | Roca/Lucha ⟵ Roca/Agua | Garra Dura | +15 % | +7 % | +6 % | — | Z-A |
| 691 | Dragalge | Mega-Dragalge | Dragalgita | Veneno/Dragón | Regeneración | +16 % | ±0 % | +6 % | ✅ ✨ | Z-A |
| 701 | Hawlucha | Mega-Hawlucha | Hawluchanita | Lucha/Volador | Indefenso | +20 % | ±0 % | +11 % | ✅ ✨ | Z-A |
| 718 | Zygarde | Mega-Zygarde | Zygardita | Dragón/Tierra | ¿? (PokeAPI no la da) | +51 % | +2 % | −7 % | ✅ ✨ | Z-A |
| 719 | Diancie | Mega-Diancie | Diancita | Roca/Hada | Espejo Mágico | +26 % | +25 % | −11 % | ✅ ✨ | ROZA |
| 740 | Crabominable | Mega-Crabominable | Crabominablita | Lucha/Hielo | Puño Férreo | +9 % | −4 % | +15 % | — | Z-A |
| 768 | Golisopod | Mega-Golisopod | Golisopodita | Bicho/Acero ⟵ Bicho/Agua | Garra Dura | +9 % | ±0 % | +7 % | — | Z-A |
| 780 | Drampa | Mega-Drampa | Drampanita | Normal/Dragón | Cólera | +10 % | ±0 % | +8 % | ✅ ✨ | Z-A |
| 801 | Magearna | Mega-Magearna | Magearnita | Acero/Hada | ¿? (PokeAPI no la da) | +15 % | +12 % | ±0 % | — | Z-A |
| 801 | Magearna | Mega-Magearna (Color Original) | Magearnita | Acero/Hada | ¿? (PokeAPI no la da) | +15 % | +12 % | ±0 % | — | Z-A |
| 807 | Zeraora | Mega-Zeraora | Zeraoranita | Eléctrico | ¿? (PokeAPI no la da) | +18 % | +3 % | ±0 % | ✅ ✨ | Z-A |
| 870 | Falinks (no está en el juego) | Mega-Falinks | Falinksita | Lucha | Competitivo | +15 % | +9 % | +6 % | — | Z-A |
| 952 | Scovillain | Mega-Scovillain | Scovillainita | Planta/Fuego | Salpicante ✳ | +13 % | ±0 % | +9 % | — | Z-A |
| 970 | Glimmora | Mega-Glimmora | Glimmoranita | Roca/Veneno | Adaptable | +7 % | +5 % | +6 % | — | Z-A |
| 978 | Tatsugiri | Mega-Tatsugiri (Curvada) | Tatsugirita | Dragón/Agua | ¿? (PokeAPI no la da) | +6 % | +4 % | +11 % | ✅ ✨ | Z-A |
| 978 | Tatsugiri | Mega-Tatsugiri (Lánguida) | Tatsugirita | Dragón/Agua | ¿? (PokeAPI no la da) | +6 % | +4 % | +11 % | — | Z-A |
| 978 | Tatsugiri | Mega-Tatsugiri (Recta) | Tatsugirita | Dragón/Agua | ¿? (PokeAPI no la da) | +6 % | +4 % | +11 % | — | Z-A |
| 998 | Baxcalibur | Mega-Baxcalibur | Baxcaliburita | Dragón/Hielo | Termoconversión | +11 % | ±0 % | +7 % | — | Z-A |

**Recuento:** 99 formas (97 megas y 2 primigenias) de 89 especies; 92 megapiedras (Meowstic ♂ y ♀,
las tres Tatsugiri y las dos Magearna comparten piedra; Mega-Rayquaza y las primigenias no usan
megapiedra). 97 de las 99 son de Pokémon que están en el juego (faltan **Pyroar** y **Falinks**, que
no tienen sprite PMD). Todas son de formas finales salvo **Floette** (evoluciona a Florges: con la
Pokédex por familias no se puede elegir; la mega es de la Floette de flor eterna, que no evoluciona),
así que Mega-Floette queda fuera mientras no haya una «Floette eterna» elegible.

Los nombres de las megas siguen el formato oficial en español («Mega-» + nombre). En los demás
idiomas: «Mega …» (inglés), «Méga-…» (francés, de PokeAPI), «Mega …» (italiano), «超级…/超級…»
(chino); el portugués usa el inglés, como los movimientos. Los de las megapiedras son los oficiales
de PokeAPI (español, inglés, francés, italiano y los dos chinos).

---

## 7. Sprites de Mundo Misterioso (SpriteCollab)

**Cómo se ha comprobado (26-10-2026):** en el `tracker.json` de SpriteCollab cada especie tiene
sus formas (`0006/0001` = «Mega_X», `0006/0002` = «Mega_Y», «Mega», «Primal»...). Para cada una de
las 99 formas se buscó su carpeta, se bajó su `AnimData.xml`, se miró qué animaciones tiene, se
aplicaron **las mismas reglas que `tools/fetch_sprites.py`** (las 7 del juego: Idle, Walk, Attack,
Shoot, Charge, Hurt y Faint, con sus sustitutas) y se comprobó que las imágenes de quieto, andar y
atacar existen de verdad (`sprite/{especie}/{forma}/{Anim}-Anim.png`; el shiny, en
`sprite/{especie}/{forma}/0001/`).

| Resultado | Cuántas | Cuáles |
|---|---:|---|
| Sprite completo | 42 | Mega-Charizard X, Alakazam, Gengar, Kangaskhan, Aerodactyl, Mewtwo Y, Houndoom, Tyranitar, Gardevoir, Mawile, Medicham, Manectric, Banette, Absol, Lucario, Latias, Latios, Sableye, Altaria, Gallade, Sharpedo, Slowbro, Steelix, Glalie, Diancie, Camerupt, Lopunny, Skarmory, Excadrill, Scrafty, Eelektross, Floette, Dragalge, Hawlucha, Zygarde, Drampa, Darkrai, Zeraora, Tatsugiri (Curvada); Kyogre y Groudon Primigenios; Mega-Rayquaza |
| A medias | 2 | Mega-Sceptile (sin ataque: usaría la de quieto) y Mega-Chimecho (sólo quieto) |
| Sin sprite | 55 | Todas las demás (entre ellas Mega-Charizard Y, Mega-Venusaur, Mega-Blastoise, Mega-Garchomp, Mega-Metagross, Mega-Salamence y casi todas las de Z-A) |
| Con shiny | 40 de las 44 | Sin shiny: Mega-Tyranitar, Mega-Medicham, Mega-Skarmory y Mega-Darkrai (con «shiny» se vería la normal, como hoy con los Pokémon que no lo tienen) |

Notas:

- Casi todas las completas sacan «Faint» de «Hurt» (igual que muchos Pokémon de hoy); Mega-Absol,
  Mega-Lucario, Mega-Sharpedo, Mega-Scrafty y Mega-Zeraora sacan «Shoot» de «Attack»; Mega-Hawlucha,
  «Attack» de «Swing»; Mega-Sharpedo y Mega-Scrafty, «Charge», «Hurt» y «Faint» de la de quieto.
  Todo eso el juego ya lo resuelve igual que con los Pokémon normales.
- SpriteCollab sigue creciendo (las de Z-A se añadieron hace poco): **la herramienta de datos tiene
  que poder volver a ejecutarse** y activar sola las megas que vayan teniendo sprite.
- Las megas sin sprite **no se activan** en la fase 1. Alternativa para más adelante (fase 4): el
  sprite normal con el aura Mega y un tinte. Se ve peor y confunde («¿ha megaevolucionado o no?»),
  así que sólo si el dueño lo quiere.
- Los sprites son CC BY-NC 4.0 como los demás: los créditos de cada forma tienen que entrar en
  `CREDITS.md` (`tools/fetch_credits.py` hoy mira sólo las especies).

---

## 8. Datos que habría que generar

Nada se escribe a mano: todo sale de PokeAPI y SpriteCollab con herramientas, como el resto de
datos del juego («GENERADO, no editar a mano»).

1. **`tools/fetch_megas.js`** (nuevo; o en Python como `fetch_pokedex.py`) → **`js/data/megas.js`**:
   - por cada forma, con su número de PokeAPI como clave (10033 a 10326: enteros, no chocan con la
    Pokédex nacional y viajan bien por la red): especie, variante (mega, X, Y, Z, primigenia),
    nombre en los 6 idiomas, tipos, habilidad, stats del juego con las mismas fórmulas (vida igual a
    la de la especie), megapiedra, juego de origen y si tiene sprite y shiny;
   - por especie, sus megas;
   - por megapiedra, su nombre en los 6 idiomas y su mega (o megas).
   - Avisos al ejecutarla: habilidad vacía en PokeAPI, especie que no está en el juego, forma que ya
    no es final, mega que ha ganado o perdido sprite.
   - Los datos crudos de esta propuesta (las 99 formas, las 92 piedras y el cruce con SpriteCollab)
    se sacaron con un script de prueba que hace justo esto.
2. **`tools/fetch_sprites.py`**: un modo «formas» que baje `sprite/{especie}/{forma}/` (y el shiny
   de `.../{forma}/0001/`) a `assets/pokemon/{clave}/` y meta sus datos en `G.SPRITE_META[clave]`.
   Las megas **no** entran en `G.DEX` (si entraran, contarían en el gacha, la Pokédex, el logro de
   tener los 966...). Después, `tools/hover_flags.py` para las que flotan (Mega-Latias, Mega-Latios...).
3. **Habilidades**: los nombres de las 12 que faltan en `js/data/abilities.js` y su efecto en
   `js/data/ability-fx.js` (3.7), medidas con `balance.cjs --habilidades`.
4. **Iconos** (`ui/icons.js`): plantilla de megapiedra (18 colores), Mega-Aro y símbolo Mega.
5. **Textos**: los de la interfaz en español en el código y traducidos con el resto (`lang-*.js`);
   los nombres de megas y piedras van en los datos (6 idiomas; portugués = inglés).
6. **Guardado** (`core/db.js`): campos de 4.7, su fusión y la migración del Mega-Aro.
7. **Pruebas**: `tests/mega.test.cjs` (condiciones, energía, elegir X/Y, comprar piedras, fusión de
   partidas, como `tests/z.test.cjs`) y el caso de red en `tests/net.test.cjs`.
8. **Equilibrio**: modo `--mega` en `tools/balance.cjs`.
9. **Créditos**: formas de SpriteCollab en `tools/fetch_credits.py` → `CREDITS.md`.
10. **Web (opcional)**: `tools/export_data.js` y `tools/make_seo_pages.py` podrían sacar las
    megapiedras en `/objetos` y la mega en la página de cada Pokémon.
11. **Novedades**: la entrada de `js/data/changelog.js` el día que se publique.

---

## 9. Riesgos

| Riesgo | Qué puede pasar | Cómo se evita |
|---|---|---|
| **Sprites** | Más de la mitad de las megas no tiene sprite; las que se pidan («¿y Mega-Charizard Y?») no estarán. | Fase 1 sólo con sprite; la herramienta vuelve a mirar SpriteCollab y activa las nuevas solas; decir en la Pokédex que «llegarán». |
| **Datos de Z-A incompletos** | PokeAPI aún no tiene la habilidad de 9 formas ni el nombre en español de 3 habilidades, y puede corregir stats o tipos. | Regenerar antes de publicar; la herramienta avisa; mientras, conservan su habilidad. |
| **Equilibrio** | Que la mega sea obligatoria para pasar del minuto 10-15, o que con 4 megas el grupo no tenga rival. | Bono con mínimo y máximo, `balance.cjs --mega`, partidas con el bot a los minutos 10-25 con y sin mega, y que el Z y la mega no se sumen. |
| **Cambiar de habilidad en mitad de la partida** | Efectos «al empezar» que se suman dos veces o no se deshacen (recarga, experiencia...). | Regla de 3.7: la de tu Pokémon se queda; la de la mega se aplica y se deshace; pruebas de entrar y salir de mega 10 veces con cada habilidad. |
| **Cooperativo** | Una versión anterior en el grupo; datos falsos por la red. | Dato nuevo al final (la anterior lo ignora); validar que la mega existe y es de su fase; prueba en `net.test.cjs`. |
| **Memoria en móviles** | Cargar hojas de mega de 4 jugadores. | Sólo se cargan las de quien pueda megaevolucionar, cuando llega a la forma final; se sueltan como las demás. |
| **Barra del HUD en el móvil** | Un botón más en la barra. | Cabe a 667×375 (comprobado con una captura); revisar a 844×390 y 932×430 y con 4 ataques y vínculos. |
| **Confusión Z / Mega** | Dos botones especiales parecidos. | Iconos y colores distintos (cristal vs. piedra con hélice), candado claro cuando uno bloquea al otro, tarjeta en la pausa. |
| **Formas raras** | Floette (no es forma final), Pyroar y Falinks (no están), Meowstic ♀, Tatsugiri Lánguida y Recta, Magearna Color Original (formas que el juego no tiene). | Sólo la forma que hay en el juego; las demás, fuera. |
| **Economía** | Rotación diaria frustrante si buscas una piedra concreta. | Hueco garantizado para tus Pokémon, piedras en grietas y gacha. |
| **Guardado** | Perder piedras al fusionar aparatos. | Unión como los Cristales Z, con prueba. |

---

## 10. Plan por fases

Cada fase se publica sola, con su entrada en Novedades, sus pruebas (`tests/` en verde) y capturas
a 932×430, 844×390, 667×375 y 1280×800, más partidas con el bot.

**Fase 0 — datos (sin nada visible).**
`fetch_megas` + `megas.js`, sprites de las formas con `fetch_sprites.py`, `hover_flags.py`,
créditos, nombres de habilidades, iconos. Prueba de que los datos cuadran con la tabla de la
sección 6.

**Fase 1 — la mega en partida (38 megas).**
Mega-Aro (logro + migración), megapiedras en la Tienda Kecleon (pestaña nueva, 3 al día + la
garantizada), Mochila, condiciones, Energía Mega, botón del HUD, tecla, mando, animación, stats,
tipo, habilidad (con el efecto nuevo de Amor Filial, Turbotaladro y Eelevate, que son de megas de
esta fase), exclusión con el Z, tarjeta de la pausa, resumen final, cooperativo (dato 20.º),
`tests/mega.test.cjs`, `balance.cjs --mega`.
Las 38: Mega-Charizard X, Mega-Alakazam, Mega-Gengar, Mega-Kangaskhan, Mega-Aerodactyl,
Mega-Mewtwo Y, Mega-Houndoom, Mega-Tyranitar, Mega-Gardevoir, Mega-Mawile, Mega-Medicham,
Mega-Manectric, Mega-Banette, Mega-Absol, Mega-Lucario, Mega-Latias, Mega-Latios, Mega-Sableye,
Mega-Altaria, Mega-Gallade, Mega-Sharpedo, Mega-Slowbro, Mega-Steelix, Mega-Glalie, Mega-Diancie,
Mega-Camerupt, Mega-Lopunny, Mega-Skarmory, Mega-Excadrill, Mega-Scrafty, Mega-Eelektross,
Mega-Dragalge, Mega-Hawlucha, Mega-Zygarde, Mega-Drampa, Mega-Darkrai, Mega-Zeraora y
Mega-Tatsugiri (la Curvada, que es la del juego).

**Fase 2 — alrededor.**
Pokédex (chapa, filtro, contador, Normal/Mega), Compendio, Mejoras (tarjeta y «Sintonía Mega»),
logros y misión semanal, piedras en grietas y gacha, chapa «Mega» en cartas y en la carta de rama.

**Fase 3 — especiales.**
Kyogre y Groudon Primigenios (Prismas en las grietas, Mar del Albor y Tierra del Ocaso),
Mega-Rayquaza (logro y Meteorito, Ráfaga Delta), clima de las megas en grupo (evento nuevo),
Mega-Sceptile y Mega-Chimecho si sus sprites se completan.

**Fase 4 — cuando haya sprites.**
Volver a ejecutar las herramientas y activar las nuevas; elección X/Y/Z en Mejoras cuando una pareja
tenga los dos sprites; detalles de firma (3.8); decidir si las que sigan sin sprite salen con aura.

---

## 11. Decisiones para el dueño

Lo que este documento propone y conviene confirmar antes de empezar:

1. **Duración:** 90 s con recarga (propuesto) o toda la partida como en los juegos.
2. **Mega y Z:** no a la vez (propuesto), los dos libres, o uno por partida.
3. **Mega-Aro:** con el logro de la primera grieta ganada (propuesto) o también en la tienda.
4. **Desde el minuto 10** (propuesto) o con la forma final sin más.
5. **Cartas del tipo nuevo** durante la mega: sí (propuesto) o no.
6. **Megas sin sprite:** esperar a SpriteCollab (propuesto) o sacarlas con aura.
7. **Precios:** 5.000 / 7.500 / 10.000 según estrellas, y las de legendarios sólo en grietas y gacha.

---

## 12. Fuentes y cómo se han sacado los datos

- PokeAPI (26-10-2026): `pokemon?limit=3000` (las formas con «-mega» y «-primal»), `pokemon/{id}`
  (tipos, stats, habilidad), `pokemon-species` (especie, legendario), `pokemon-form` (nombres),
  `item-category/44` (las 92 megapiedras) e `item/{piedra}` (nombres), `ability/{habilidad}`
  (nombres de las que faltan), `item/mega-ring`, `key-stone`, `blue-orb`, `red-orb`, `meteorite` y
  `move/dragon-ascent`.
- SpriteCollab: `tracker.json` y los `AnimData.xml` e imágenes de cada forma.
- Este repositorio: `js/data/shop.js` y `js/systems/combat.js` (movimiento Z), `js/systems/mons.js`
  (`G.Evo`, `G.Mons.formFor`), `js/entities/player.js` (evolución, aro del Z), `js/data/ability-fx.js`,
  `js/systems/stats.js`, `js/net/coop.js`, `js/systems/weather.js`, `js/systems/gacha.js`,
  `js/data/upgrades.js`, `js/data/achievements.js`, `js/data/missions.js`, `tools/fetch_pokedex.py`
  y `tools/fetch_sprites.py`.
- Los porcentajes de la tabla salen de aplicar a los stats base de PokeAPI las fórmulas de
  `tools/fetch_pokedex.py` y la de defensas de `js/systems/stats.js`.
