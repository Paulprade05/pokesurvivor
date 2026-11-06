# Megaevoluciones en PokéSurvivor

> **Estado:** diseño revisado el 06-11-2026, con las decisiones del dueño ya tomadas (sección 10).
> Sustituye a la propuesta del 26-10-2026, que sigue en el historial de git. Datos: PokeAPI y
> `tracker.json` de SpriteCollab, consultados el 06-11-2026; lo del juego, sacado del código de `main`.

## Resumen en un minuto

- **Qué es:** tu Pokémon, ya en su forma final, se transforma durante **75 s**: otro sprite, más
  daño, más aguante y, a veces, otro tipo y otra habilidad. Luego vuelve a la normalidad.
- **Cómo se activa:** con el mismo botón y la misma tecla que el movimiento Z. Tu Pokémon lleva
  **Pulsera Z o megapiedra**, nunca las dos a la vez, como en los juegos.
- **Cuándo:** la **Energía Mega** se llena **derrotando enemigos**. Cuesta al principio, cuando caen
  pocos, y luego va mucho más rápido, con un mínimo de 75 s entre megas. Con la forma final y la barra llena, ya puedes.
- **Qué hace falta:** el **Mega-Aro** (se gana con la primera grieta) y la **megapiedra** de ese
  Pokémon, comprada en sus Mejoras. Las dos son para siempre.
- **Cuántas:** **43 megas** con sprite de Mundo Misterioso. Las demás entrarán con la herramienta
  de datos cuando SpriteCollab las dibuje.

## 1. Qué ha cambiado respecto a la propuesta de octubre, y por qué

La propuesta del 26-10 era correcta en la idea, pero se escribió antes de medir partidas reales y
antes de varios cambios del juego. Tenía 838 líneas, 5 fases y 6 condiciones para activarse. Esta
versión hace menos cosas.

| Tema | Antes | Ahora | Por qué |
|---|---|---|---|
| **Cuándo llega** | Desde el minuto 10 y con la forma final, normalmente en el 13 | Sin minuto: una Energía que se llena desde el principio | Las partidas reales medidas han acabado hacia el minuto 18 como mucho. Con la regla vieja casi no se vería |
| **Cómo se recarga** | Por tiempo (150 s) y por jefes | **Por enemigos derrotados**, con un mínimo de 75 s | Lo pidió el dueño: que cueste al principio y sea más fácil después. La propuesta vieja lo descartó porque se llenaría en segundos; el mínimo lo evita |
| **Con el Z** | Dos botones; cada uno bloquea al otro mientras dura | **Uno u otro por Pokémon**, en el mismo botón | Con los dos, un Pokémon con mega iría potenciado la mitad del tiempo y los demás un 20 %. También evita el candado y una tecla nueva |
| **Barra del móvil** | Un hueco más, con candados | **Igual que hoy**: el hueco del Z enseña la piedra | Menos botones, menos toques fallados. «Colocar los botones» no cambia |
| **Tecla y mando** | Tecla X y botón Y nuevos | Los del Z | Nada que aprender ni que configurar |
| **Conseguir la piedra** | Pestaña nueva con 3 piedras al día, grietas, gacha y logros | **Se compra en las Mejoras de ese Pokémon**, como la Pulsera Z | Con una rotación diaria podías esperar días la piedra que querías |
| **Cartas de nivel** | Salían ataques del tipo de la mega, con chapa | **No cambian** | Invitaba a guardar las subidas de nivel para la mega, y confunde |
| **Daño** | Fórmula × 1,2, entre +30 % y +60 % | **Entre +25 % y +40 %**, fijado en los datos | Más bajo, y la cuenta queda hecha en los datos y no en la partida |
| **Duración** | 90 s | **75 s**, afinado con medidas | La mega no debe tapar la dificultad de la segunda mitad |
| **Red** | Dato 20.º nuevo | **El dato de la fase de siempre** | Una versión anterior ya descarta los números que no conoce y ve al Pokémon normal |
| **Cuántas** | 38, y primigenias y Rayquaza en una fase aparte | **43 de una vez**: añade Kyogre, Groudon, Rayquaza, Sceptile y Chimecho con la misma regla | Tienen sprite. Un nombre de objeto distinto no pide un sistema distinto |
| **Idiomas** | 6 | **Español e inglés** | Norma del juego desde el 05-11 |

**Quitado por ahora**, se puede volver a pensar tras verlo jugado: Sintonía Mega, misión semanal,
4 de los 6 logros, títulos, chapa en el perfil, onda que aparta, elección X/Y (ninguna pareja tiene
los dos sprites), piedras en grietas y gacha, clima de los invitados en grupo y detalles de firma.

## 2. Cómo encaja con lo que ya hay

| | Evolución | Movimiento Z | **Megaevolución** |
|---|---|---|---|
| Qué hace | Pasa a la fase siguiente | Añade un ataque muy fuerte | Transforma a tu Pokémon |
| Hace falta | Nada | Pulsera Z + Cristal Z + 2 ataques del tipo | Mega-Aro + megapiedra + forma final |
| Se activa | Sola | Botón | Botón (el mismo) |
| Dura | Para siempre | 60 s, recarga 240 s | 75 s; se recarga con 300 derrotados, 75 s como mínimo |
| Papel | Crecer | Pico corto y explosivo | Poder largo y más aguante |

- **Evolución:** va antes y no se toca. La mega sólo existe en la forma final; en las ramas, en la que tenga mega.
- **Evolución de ataques:** no cambia. Las cartas y sus reglas (nivel 5 en casi todas) no miran la mega.
- **Pasivas a nivel 10 y Réplica:** no cambian. La mega multiplica por igual el daño de todos tus
  ataques, así que la norma de evolución (evo/máx × 0,74/1,08 ≥ 1,2) debe seguir igual. Se comprueba con `tools/equilibrio.cjs`.
- **Tipo Z:** sigue en Mejoras y sólo cuenta si llevas la Pulsera.
- **Vínculos, objeto y mejoras permanentes:** siguen todos. La piedra no ocupa el hueco de objeto.
- **Sentencia de Arceus y grietas:** se puede megaevolucionar, y lo que derrotes allí también carga la energía.

## 3. En la partida

### 3.1 Condiciones

1. Tu Pokémon lleva la megapiedra (sección 4).
2. Estás en la forma final de la línea.
3. La Energía Mega está llena.
4. Estás vivo y jugando. El botón no para la partida ni a tus compañeros.

### 3.2 Energía Mega

- Empieza a 0 y se llena con **300 enemigos derrotados**. Un jefe o un legendario cuenta como 30.
- En grupo cuentan los derrotados de todo el equipo, y la meta sube como los enemigos que salen (×1,75 por jugador de más).
- Mientras dura la mega no se carga. Al acabar vuelve a 0 y empieza un **mínimo de 75 s** antes de poder repetir.
- Si se llena antes de la forma final, espera llena.

Lo que da con los ritmos medidos con el bot (derrotados por minuto):

| Jugador | Minutos 0-10 | Después | Primera barra llena | Megas en 18 min |
|---|---|---|---|---|
| Con mejoras | 60-100 | 200-600 | Minuto 4-5, y la mega al llegar a la forma final | 5 o 6 |
| Sin mejoras | 30-40 | 30-40 | Minuto 8-10 | 1 |

Sin el mínimo, al final de la partida se recargaría en menos de un minuto y la mega estaría casi
siempre puesta. Con él, nunca pasa de la mitad del tiempo. Es el número a vigilar al medir.

### 3.3 Activar y acabar

- Animación de **1,25 s** con invulnerabilidad: la de evolución, con colores Mega. Cartel: «¡Charizard
  megaevoluciona en Mega-Charizard X!».
- Al acabar, destello corto y vuelta a la forma normal, con la vida en el punto en que estuviera.
- Si caes, la mega acaba y la energía queda a 0.

### 3.4 Estadísticas

Los stats de la mega salen de las fórmulas de `tools/fetch_pokedex.py` y se ajustan **al generar los
datos**, una vez. En la partida se aplica la naturaleza, como en cualquier fase.

| Qué | Regla |
|---|---|
| Daño | Entre **+25 % y +40 %**: rarezas 1-3 hasta +40 %, rareza 4 hasta +35 %, rareza 5 y legendarios hasta +30 % |
| Daño recibido | **−15 %**, además de sus defensas |
| Velocidad | La de la fórmula, nunca más de un 10 % más lenta |
| Vida | No cambia y no cura |
| Tamaño | Se ve más grande; el choque sigue siendo el de la forma normal |

### 3.5 Tipo

Mientras dura, cuenta su tipo para la tabla de tipos, el +20 % de monotipo, el clima, los líquidos
y las habilidades. Las **cartas de nivel siguen con la forma normal**.

### 3.6 Habilidad

Mientras dura, la de la mega sustituye a la tuya en todo lo que funciona en vivo (daño, defensa,
velocidad, cada fotograma). Lo que tu habilidad dio al empezar la partida se queda. Lo que la de la
mega sólo haría al empezar la partida no se aplica, y así no hay nada que deshacer.

- **Faltan 3 efectos:** Amor Filial (+20 % de daño, sin segundo golpe), Turbotaladro (+12 % de daño
  y atraviesa escudos) y Eelevate (flota y +0,5 % de daño por derrotado, hasta +15 %).
- **Mantienen tu habilidad:** Darkrai, Zygarde, Zeraora y Tatsugiri, porque PokeAPI no da la suya, y
  Rayquaza, Kyogre y Groudon, porque las suyas cambian el clima de todos. La herramienta avisa si llega el dato.
- **Clima:** Mega-Tyranitar pone tormenta de arena con el gancho que ya existe. En grupo sólo la pone el anfitrión, como hoy.

### 3.7 Cooperativo

- Cada uno megaevoluciona el suyo; el daño va al anfitrión como siempre y el recibido lo calcula cada uno.
- Los demás lo ven porque el número de la mega viaja en el dato de la fase. Una versión anterior lo
  descarta y ve al Pokémon normal. Sólo se aceptan megas que existan.
- La vida de los enemigos ya crece con el número de jugadores (`G.Coop.scale`).
- La energía de los jefes usa el contador `bosses`, que a los invitados les llega del anfitrión. Hay que probarlo con dos jugadores.

### 3.8 Rendimiento y móvil

- Activar es un cambio de hojas, como evolucionar. Mientras dura sólo se añade un aura de dos elipses.
- Las hojas de la mega se cargan al llegar a la forma final y sólo si llevas la piedra. Cada Pokémon
  pesa de media unos 100 KB.
- Se comprueba a 667×375, 844×390 y 932×430, y con «Colocar los botones».

## 4. Fuera de la partida

- **Mega-Aro:** premio del logro «Al otro lado» (`rift1`, primera grieta ganada). Quien ya lo tenga
  lo recibe al actualizar, como el regalo de las Pulseras Z.
- **Megapiedra:** se compra en las Mejoras del Pokémon y en la Tienda Kecleon, junto a las Pulseras.
  Hace falta tener el Pokémon. **5.000** rarezas 1-3, **7.500** rareza 4, **10.000** rareza 5 y legendarios.
- **Elegir:** con Pulsera y piedra, en Mejoras eliges cuál lleva. Sin elegir, la última comprada.
- **Guardado:** `save.mring` (fecha), `save.mst[mega]` (fecha) y `save.pmg[dex]` (qué lleva, con fecha).
  Como Cristales y Pulseras: al fusionar aparatos se unen y nunca se pierden.
- **Compendio:** sección «Megaevoluciones» con sprite, tipos, habilidad, piedra y cómo se consigue.
- **Pokédex:** en la pestaña Evolución de su ficha, la mega después de la forma final.
- **Pausa:** la tarjeta del Z enseña la mega si es lo que llevas, con el tiempo o el %, y qué falta.
- **Resumen final:** cuántas megas y el daño hecho en mega.
- **Logros:** «¡Megaevolución!» (usar una) y «Megacoleccionista» (5, 15 y todas las piedras).
- **Iconos:** plantilla de piedra coloreada por tipo y Mega-Aro, con `pxl` y `docs/ESTILO-ARTE.md`.

## 5. Botón del HUD

Es el hueco del Z, con el mismo tamaño y la misma tecla.

| Estado | Cómo se ve |
|---|---|
| Sin piedra | No sale (o sale el Z si llevas la Pulsera) |
| Falta la forma final | Piedra en gris; al tocar, «Mega: al llegar a Charizard» |
| Cargando | Arco de progreso con el % |
| Lista | Halo que late (quieto con «Menos sacudidas») y aviso una vez |
| Activa | Barra que se vacía y segundos que quedan |

## 6. Las 43 megas

**Tipos:** «nuevo ⟵ de antes» si cambia. **Daño, velocidad, aguante:** cambio con las fórmulas, antes
de los ajustes de 3.4. **✳:** habilidad que falta programar. **Sprite:** ✅ completo · ⚠️ a medias, se
usa lo que hay · ✨ con shiny.

| Nº | Megaevolución | Piedra | Tipos | Habilidad | Daño | Vel. | Aguante | Sprite |
|---:|---|---|---|---|---:|---:|---:|:---:|
| 6 | Mega-Charizard X | Charizardita X | Fuego/Dragón ⟵ Fuego/Volador | Garra Dura | +9 % | ±0 % | +6 % | ✅ ✨ |
| 65 | Mega-Alakazam | Alakazamita | Psíquico | Calco | +15 % | +10 % | +8 % | ✅ ✨ |
| 80 | Mega-Slowbro | Slowbronita | Agua/Psíquico | Caparazón | +14 % | ±0 % | +5 % | ✅ ✨ |
| 94 | Mega-Gengar | Gengarita | Fantasma/Veneno | Sombra Trampa | +15 % | +7 % | +9 % | ✅ ✨ |
| 115 | Mega-Kangaskhan | Kangaskhanita | Normal | Amor Filial ✳ | +14 % | +3 % | +8 % | ✅ ✨ |
| 142 | Mega-Aerodactyl | Aerodactylita | Roca/Volador | Garra Dura | +13 % | +6 % | +8 % | ✅ ✨ |
| 150 | Mega-Mewtwo Y | Mewtwoita Y | Psíquico | Insomnio | +14 % | +3 % | ±0 % | ✅ ✨ |
| 208 | Mega-Steelix | Steelixita | Acero/Tierra | Poder Arena | +19 % | ±0 % | +7 % | ✅ ✨ |
| 227 | Mega-Skarmory | Skarmorita | Acero/Volador | Acérrimo | +29 % | +16 % | +3 % | ✅ |
| 229 | Mega-Houndoom | Houndoomita | Siniestro/Fuego | Poder Solar | +12 % | +7 % | +12 % | ✅ ✨ |
| 248 | Mega-Tyranitar | Tyranitarita | Roca/Siniestro | Chorro Arena | +11 % | +4 % | +8 % | ✅ |
| 254 | Mega-Sceptile | Sceptilita | Planta/Dragón ⟵ Planta | Pararrayos | +17 % | +9 % | +3 % | ⚠️ ✨ |
| 282 | Mega-Gardevoir | Gardevoirita | Psíquico/Hada | Piel Feérica | +16 % | +7 % | +2 % | ✅ ✨ |
| 302 | Mega-Sableye | Sableynita | Siniestro/Fantasma | Espejo Mágico | +5 % | −13 % | +17 % | ✅ ✨ |
| 303 | Mega-Mawile | Mawilita | Acero/Hada | Potencia | +9 % | ±0 % | +15 % | ✅ ✨ |
| 308 | Mega-Medicham | Medichamita | Lucha/Psíquico | Energía Pura | +21 % | +7 % | +4 % | ✅ |
| 310 | Mega-Manectric | Manectricita | Eléctrico | Intimidación | +13 % | +11 % | +10 % | ✅ ✨ |
| 319 | Mega-Sharpedo | Sharpedonita | Agua/Siniestro | Mandíbula Fuerte | +8 % | +3 % | +17 % | ✅ ✨ |
| 323 | Mega-Camerupt | Cameruptita | Fuego/Tierra | Potencia Bruta | +17 % | −9 % | +11 % | ✅ ✨ |
| 334 | Mega-Altaria | Altarianita | Dragón/Hada ⟵ Dragón/Volador | Piel Feérica | +21 % | ±0 % | +3 % | ✅ ✨ |
| 354 | Mega-Banette | Banettita | Fantasma | Bromista | +21 % | +5 % | +7 % | ✅ ✨ |
| 358 | Mega-Chimecho | Chimechita | Psíquico/Acero ⟵ Psíquico | Levitación | +18 % | ±0 % | +10 % | ⚠️ ✨ |
| 359 | Mega-Absol | Absolita | Siniestro | Espejo Mágico | +7 % | +15 % | ±0 % | ✅ ✨ |
| 362 | Mega-Glalie | Glalita | Hielo | Piel Helada | +19 % | +7 % | ±0 % | ✅ ✨ |
| 380 | Mega-Latias | Latiasita | Dragón/Psíquico | Levitación | +12 % | ±0 % | +7 % | ✅ ✨ |
| 381 | Mega-Latios | Latiosita | Dragón/Psíquico | Levitación | +11 % | ±0 % | +5 % | ✅ ✨ |
| 382 | Kyogre Primigenio | Prisma Azul | Agua | Mar del Albor ✳ | +11 % | ±0 % | +1 % | ✅ ✨ |
| 383 | Groudon Primigenio | Prisma Rojo | Tierra/Fuego ⟵ Tierra | Tierra del Ocaso ✳ | +11 % | ±0 % | +1 % | ✅ ✨ |
| 384 | Mega-Rayquaza | — (Ascenso Draco) | Dragón/Volador | Ráfaga Delta ✳ | +11 % | +7 % | +4 % | ✅ ✨ |
| 428 | Mega-Lopunny | Lopunnita | Normal/Lucha ⟵ Normal | Intrépido | +29 % | +11 % | +2 % | ✅ ✨ |
| 448 | Mega-Lucario | Lucarita | Lucha/Acero | Adaptable | +13 % | +8 % | +4 % | ✅ ✨ |
| 475 | Mega-Gallade | Galladita | Psíquico/Lucha | Fuerza Mental | +16 % | +11 % | +7 % | ✅ ✨ |
| 491 | Mega-Darkrai | Darkrainita | Siniestro | ¿? (PokeAPI no la da) | +12 % | −13 % | +12 % | ✅ |
| 530 | Mega-Excadrill | Excadrillita | Tierra/Acero | Turbotaladro ✳ | +12 % | +5 % | +8 % | ✅ ✨ |
| 560 | Mega-Scrafty | Scraftita | Siniestro/Lucha | Intimidación | +18 % | +5 % | +5 % | ✅ ✨ |
| 604 | Mega-Eelektross | Eelektrossita | Eléctrico | Eelevate* ✳ | +13 % | +13 % | +2 % | ✅ ✨ |
| 691 | Mega-Dragalge | Dragalgita | Veneno/Dragón | Regeneración | +16 % | ±0 % | +6 % | ✅ ✨ |
| 701 | Mega-Hawlucha | Hawluchanita | Lucha/Volador | Indefenso | +20 % | ±0 % | +11 % | ✅ ✨ |
| 718 | Mega-Zygarde | Zygardita | Dragón/Tierra | ¿? (PokeAPI no la da) | +51 % | +2 % | −7 % | ✅ ✨ |
| 719 | Mega-Diancie | Diancita | Roca/Hada | Espejo Mágico | +26 % | +25 % | −11 % | ✅ ✨ |
| 780 | Mega-Drampa | Drampanita | Normal/Dragón | Cólera | +10 % | ±0 % | +8 % | ✅ ✨ |
| 807 | Mega-Zeraora | Zeraoranita | Eléctrico | ¿? (PokeAPI no la da) | +18 % | +3 % | ±0 % | ✅ ✨ |
| 978 | Mega-Tatsugiri (Curvada) | Tatsugirita | Dragón/Agua | ¿? (PokeAPI no la da) | +6 % | +4 % | +11 % | ✅ ✨ |

**Fuera por ahora:** 54 formas sin sprite (entre ellas Mega-Charizard Y, Venusaur, Blastoise, Garchomp,
Metagross y casi todas las de Z-A), Mega-Floette (Floette no es forma final) y Dialga Primigenio (no es oficial).

## 7. Datos que hay que generar

- `tools/fetch_megas.js` → `js/data/megas.js`: por mega, su número de PokeAPI (`10034`), especie,
  nombres en español e inglés, tipos, habilidad, stats ajustados y piedra. Se puede volver a ejecutar
  y avisa si PokeAPI o SpriteCollab cambian. Las megas no entran en `G.DEX`.
- `tools/fetch_sprites.py`: modo de formas que baja a `assets/pokemon/{número}/` y llena `G.SPRITE_META`.
- `tools/fetch_credits.py`: créditos de las formas. Sprites CC BY-NC 4.0, como los demás.
- `tests/mega.test.cjs`, caso de red en `tests/net.test.cjs` y modo `--mega` en `tools/balance.cjs`.

## 8. Equilibrio: cómo se mide

- `tools/balance.cjs --mega`: daño por segundo y aguante con y sin mega en los minutos 10, 15 y 20.
- `tools/equilibrio.cjs`: las filas de evolución deben salir iguales con y sin mega.
- `tools/medir-pokemon.cjs`: ninguna mega por encima de los mejores Pokémon sin mega contando el
  tiempo que dura, y las flojas (Mawile, Sableye, Banette) deben subir más que los legendarios.
- Partidas con `tools/curve.cjs` con y sin mega: sin mega se debe poder seguir ganando.

## 9. Riesgos

| Riesgo | Cómo se evita |
|---|---|
| Faltan megas que la gente pedirá | La herramienta las añade cuando haya sprite |
| PokeAPI sin habilidad de Z-A | Conservan tu habilidad; la herramienta avisa |
| Cambiar de habilidad a media partida | Sólo ganchos en vivo; prueba de entrar y salir 10 veces |
| Versión anterior en el grupo | `wv` y el dato de fase; una mega desconocida se ve como el normal |
| Perder lo comprado al fusionar | Unión, con prueba, como los Cristales Z |
| Sprite de mega que no carga a tiempo | Se precarga al llegar a la forma final; sin hoja, se queda el sprite normal |

## 10. Decisiones del dueño (06-11-2026)

1. **Mega y Z:** uno u otro por Pokémon.
2. **Duración:** temporal, y se recarga con enemigos derrotados, de modo que al principio cueste y luego sea más fácil.
3. **Quién:** las 43 con sprite, también legendarios.
4. **Las que no tienen sprite:** esperan a SpriteCollab.
5. **Pokémon que faltan:** entran los 8 con andar. Los otros 51 esperan a SpriteCollab.

## 11. Orden de trabajo

Cada parte en su PR, sin juntar hasta que lo pida el dueño:

1. Este documento.
2. Los Pokémon que faltan.
3. Datos y sprites de las megas (sin nada visible).
4. La mega en partida, con HUD, Compendio, cooperativo, equilibrio y Novedades.
