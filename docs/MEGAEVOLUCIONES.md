# Megaevoluciones en PokéSurvivor

> **Estado:** programado el 06-11-2026 (PR #23, #24 y el de la rama `megas`), con las decisiones del dueño (sección 10). Sin publicar.
> **Cambio del 07-11-2026:** para poder comprar la piedra hace falta antes la **versión con mega**, que sale en el gacha (sección 4).
> **Cambio del 07-11-2026 (2):** de 43 a **62 megas**: 19 con el sprite de seguimiento de pokeemerald-expansion, y Charizard y Mewtwo con dos (X e Y), que se eligen al megaevolucionar (sección 6.1).
> Sustituye a la propuesta del 26-10-2026, que sigue en el historial de git. Datos: PokeAPI y
> `tracker.json` de SpriteCollab, consultados el 06-11-2026; lo del juego, sacado del código de `main`.

## Resumen en un minuto

- **Qué es:** tu Pokémon, ya en su forma final, se transforma durante **75 s**: otro sprite, más
  daño, más aguante y, a veces, otro tipo y otra habilidad. Luego vuelve a la normalidad.
- **Cómo se activa:** con el mismo botón y la misma tecla que el movimiento Z. Tu Pokémon lleva
  **Pulsera Z o megapiedra**, nunca las dos a la vez, como en los juegos.
- **Cuándo:** la **Energía Mega** se llena **derrotando enemigos**. Cuesta al principio, cuando caen
  pocos, y luego va mucho más rápido. Con la forma final y la barra llena, ya puedes.
- **Qué hace falta:** el Pokémon, su **versión con mega** (sale en el gacha, más difícil que un
  legendario), el **Mega-Aro** (se gana con la primera grieta) y la **megapiedra** de ese Pokémon,
  comprada en sus Mejoras. Todo es para siempre.
- **Cuántas:** **62 megas**: 43 con sprite de Mundo Misterioso y 19 con el de seguimiento de
  pokeemerald-expansion (sólo andar y quieto). Si SpriteCollab dibuja una de esas 19, la herramienta
  pasa a la suya; las demás entrarán cuando haya sprite en alguna de las dos.
- **Dos megas:** Charizard y Mewtwo tienen X e Y, cada una con su versión con mega y su piedra. Con
  las dos piedras, al megaevolucionar sale una carta para elegir (sección 6.1).

## 1. Qué ha cambiado respecto a la propuesta de octubre, y por qué

La propuesta del 26-10 era correcta en la idea, pero se escribió antes de medir partidas reales y
antes de varios cambios del juego. Tenía 838 líneas, 5 fases y 6 condiciones para activarse. Esta
versión hace menos cosas.

| Tema | Antes | Ahora | Por qué |
|---|---|---|---|
| **Cuándo llega** | Desde el minuto 10 y con la forma final, normalmente en el 13 | Sin minuto: una Energía que se llena desde el principio | Las partidas reales medidas han acabado hacia el minuto 18 como mucho. Con la regla vieja casi no se vería |
| **Cómo se recarga** | Por tiempo (150 s) y por jefes | **Por enemigos derrotados** | Lo pidió el dueño: que cueste al principio y sea más fácil después. La propuesta vieja lo descartó porque se llenaría en segundos. Con 300 derrotados tarda de 30 a 90 s al final de la partida |
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
| Hace falta | Nada | Pulsera Z + Cristal Z + 2 ataques del tipo | Versión con mega + Mega-Aro + megapiedra + forma final |
| Se activa | Sola | Botón | Botón (el mismo) |
| Dura | Para siempre | 60 s, recarga 240 s | 75 s; se recarga con 300 derrotados |
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
- Mientras dura la mega no se carga. Al acabar vuelve a 0 y se puede repetir en cuanto se llene: **no hay espera mínima** (06-11-2026, lo pidió el dueño).
- Si se llena antes de la forma final, espera llena.

Medido con el bot en partidas de 20 minutos, usando la mega en cuanto puede y sin espera mínima:

| Partida | Primera mega | Megas en 20 min |
|---|---|---|
| Charizard con mejoras | Minuto 7 (la barra se llenó antes y esperó a la forma final) | 4 |
| Absol con mejoras | Minuto 13 | 3 |

Con 600 derrotados por minuto, lo más alto medido, la mega estaría puesta el 71 % del tiempo. Es el número a vigilar.

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
| Daño | **Según la rareza:** 1 y 2, +40 %; 3, +35 %; 4, +30 %; 5 y legendarios, +25 %. Glalie, Camerupt y Abomasnow, +25 %, porque ya están entre los mejores. La fórmula sólo reparte entre físico y especial |
| Daño recibido | **−15 %**, además de sus defensas |
| Velocidad | La de la fórmula, nunca más de un 10 % más lenta |
| Vida | No cambia y no cura |
| Tamaño | Se ve más grande; el choque sigue siendo el de la forma normal |

### 3.5 Tipo

Mientras dura, cuenta su tipo para la tabla de tipos, el clima, los líquidos y las habilidades. Las
**cartas de nivel y el +20 % de monotipo siguen con la forma normal**: si no, Groudon o Lopunny perderían ese +20 % al ganar un tipo.

### 3.6 Habilidad

Mientras dura, la de la mega sustituye a la tuya en todo lo que funciona en vivo (daño, defensa,
velocidad, cada fotograma). Lo que tu habilidad dio al empezar la partida se queda. Lo que la de la
mega sólo haría al empezar la partida no se aplica, y así no hay nada que deshacer.

- **Faltan 3 efectos:** Amor Filial (+20 % de daño, sin segundo golpe), Turbotaladro (+12 % de daño,
  +25 % cuerpo a cuerpo) y Eelevate (flota y +0,5 % de daño por derrotado, hasta +15 %).
- **Mantienen tu habilidad:** Darkrai, Zygarde, Zeraora y Tatsugiri, porque PokeAPI no da la suya;
  Pinsir y Salamence, porque su Piel Celeste (aerilate) aún no tiene efecto en el juego; y
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
- **Versión con mega:** se consigue en el gacha, y sin ella no se puede comprar la piedra (sección 4.1).
- **Megapiedra:** se compra en las Mejoras del Pokémon.
  Hace falta tener el Pokémon, su versión con mega y el Mega-Aro. **5.000** rarezas 1-3, **7.500** rareza 4, **10.000** rareza 5 y legendarios.
- **Elegir:** con Pulsera y piedra, en Mejoras eliges cuál lleva. Sin elegir, la última comprada.
- **Guardado:** el Mega-Aro es el logro `rift1`; `save.mop[mega]` (versión con mega, fecha), `save.mst[mega]` (piedra, fecha),
  `save.pityM[región]` (tiradas sin ninguna) y `save.pmg[dex]` (qué lleva, con fecha).
  Como Cristales y Pulseras: al fusionar aparatos se unen y nunca se pierden. `pityM` funciona como `pity`: manda la versión más reciente.
- **Mejoras:** la tarjeta de la piedra dice qué falta y su botón sigue apagado hasta tenerlo.
- **Compendio:** en la ficha del Pokémon, la mega con sus datos y la lista de pasos.
- **Pokédex:** en la pestaña Evolución de su ficha, la mega y la misma lista (`G.UI.megaSteps`): lo que tienes, con ✓; lo que falta, con candado y cómo se consigue.
- **Pausa:** la tarjeta del Z enseña la mega si es lo que llevas, con el tiempo o el %, y qué falta.
- **Resumen final:** cuántas megas y el daño hecho en mega.
- **Logros:** «¡Megaevolución!» (usar una) y «Megacoleccionista» (5 piedras).
- **Iconos:** los objetos oficiales de PokeAPI/sprites (`assets/items/`), como los Cristales Z. No hace falta dibujar nada.

### 4.1 Versión con mega (07-11-2026)

Lo pidió el dueño: «puedes desbloquear al pokemon normal pero también puedes desbloquear su versión con mega, eso solamente te permite tener la oportunidad de desbloquear la mega de ese pokemon como mejora en su apartado». Y más difícil que un legendario.

**Regla (`js/systems/gacha.js`):**

- Nueva rareza **Mega**, por encima de Legendaria, en el banner de la región de ese Pokémon y con los mismos tickets.
- **Entre todas tienen 0,5 %** en cada tirada de su banner, y **nunca menos de 0,1 % cada una** (`megaRate`). Con 5 posibles o menos son 0,5 %; con más, 0,1 % por cada una. Lo pidió el dueño el 07-11-2026 («sube la probabilidad de mega a un 0,5 %»), y eligió esta lectura para que ninguna región baje de lo que tenía: antes era 0,1 % cada una.
- **Sólo sale si ya tienes el Pokémon normal, y nunca se repite.** Si no hay ninguna posible, esa región no cambia en nada.
- **Garantía:** a las **1.500 tiradas sin ninguna** en ese banner, la siguiente lo es. El contador sólo avanza si hay alguna posible y vuelve a cero al salir una.
- **No da la mega:** deja comprar la piedra. No da monedas y no hay versión shiny.
- **No toca lo demás:** las tasas, la garantía de legendaria (la tirada Mega cuenta como tirada sin legendaria) ni el ×10, donde cuenta como Épica o mejor.
- **Las megas de legendarios siguen la misma regla.** Son 10: hay que tener antes al legendario.
- **Galar no tiene megas:** allí no cambia nada.

**Cuánto más difícil que un legendario.** Tiradas de media en el banner de su región, con 3.000 y 20.000 simulaciones por caso, y teniendo todos los Pokémon normales de esa región. El gacha de legendarios se midió con el código real; el de megas, con un modelo de la misma regla:

| Región | Megas | Tasa al empezar | Legendaria cualquiera | Primera mega cualquiera | Un legendario concreto | Una mega concreta | Veces más |
|---|---:|---:|---:|---:|---:|---:|---:|
| Kanto | 7 | 0,7 % | 43 | 144 | 253 | 718 | 2,8 |
| Johto | 4 | 0,5 % | 44 | 200 | 314 | 498 | 1,6 |
| Hoenn | 18 | 1,8 % | 44 | 56 | 565 | 895 | 1,6 |
| Sinnoh | 4 | 0,5 % | 43 | 199 | 644 | 502 | 0,8 |
| Teselia | 3 | 0,5 % | 43 | 200 | 587 | 399 | 0,7 |
| Kalos | 4 | 0,5 % | 44 | 202 | 312 | 500 | 1,6 |
| Alola | 2 | 0,5 % | 44 | 201 | 582 | 301 | 0,5 |
| Paldea | 1 | 0,5 % | 44 | 199 | 577 | 199 | 0,3 |

- Una mega concreta sale en **200-900 tiradas**, entre 7 y 30 partidas completas (30 tickets como mucho por partida). Antes eran 770-990.
- **Sinnoh, Teselia, Alola y Paldea ya no son más difíciles que su legendario.** El dueño lo vio antes de elegir y lo aceptó (07-11-2026): cambia lo que pidió antes de que la mega fuera más difícil. Con una sola mega, 0,5 % son siempre unas 200 tiradas.
- La garantía de 1.500 no cambia. A 0,5 % sólo llega una de cada 1.800 veces: queda como red, no como camino.
- La comparación justa es entre uno concreto y otro concreto. **La primera mega cualquiera puede salir antes que un legendario concreto**, y en Hoenn con todo desbloqueado la rareza suma 1,8 %, más que Legendaria (1,5 %). El gacha enseña la tasa de ahora entre todas, que baja de 1,8 % a 0,5 % según las consigues.
- Si tienes pocos Pokémon de esa región, salen menos megas: la primera tarda más.

**Quien ya compró la piedra:** la conserva, la puede usar igual y cuenta como versión con mega conseguida (`db.js`, `sanitize`; `mst` pasa a `mop`, también en la nube). Nunca sale en el gacha lo que ya tienes. El precio de la piedra y el Mega-Aro no cambian.

**Riesgo conocido:** una versión anterior del juego no sabe unir `mop` al fusionar. Si un aparato viejo, sin actualizar, escribe en la nube después de conseguir una versión con mega en otro, esa versión se puede perder, salvo que ya estuviera comprada la piedra, que siempre se recupera. Sólo puede pasar en los minutos que tarda en actualizarse ese aparato (`updater.js`).

**A vigilar:** el logro «Megacoleccionista» (5 piedras) es ahora mucho más difícil, unas 5 versiones con mega. No se ha tocado.

## 5. Botón del HUD

Es el hueco del Z, con el mismo tamaño y la misma tecla.

| Estado | Cómo se ve |
|---|---|
| Sin piedra | No sale (o sale el Z si llevas la Pulsera) |
| Falta la forma final | Piedra en gris; al tocar, «Mega: al llegar a Charizard» |
| Cargando | Arco de progreso con el % |
| Lista | Halo que late (quieto con «Menos sacudidas») y aviso una vez |
| Activa | Barra que se vacía y segundos que quedan |

## 6. Las 62 megas

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

Y las 19 del 07-11-2026, con el sprite de seguimiento de pokeemerald-expansion (columnas: el daño y la
velocidad **finales**, ya ajustados, frente a su Pokémon; sprite 32×32, 2 cuadros, con shiny):

| Nº | Megaevolución | Piedra | Tipos | Habilidad | Daño | Vel. |
|---:|---|---|---|---|---:|---:|
| 3 | Mega-Venusaur | Venusaurita | Planta/Veneno | Sebo | ×1,30 | ±0 % |
| 6 | Mega-Charizard Y | Charizardita Y | Fuego/Volador | Sequía | ×1,30 | ±0 % |
| 9 | Mega-Blastoise | Blastoisita | Agua | Megadisparador | ×1,30 | ±0 % |
| 15 | Mega-Beedrill | Beedrillita | Bicho/Veneno | Adaptable | ×1,40 | +26 % |
| 18 | Mega-Pidgeot | Pidgeotita | Normal/Volador | Indefenso | ×1,35 | +7 % |
| 127 | Mega-Pinsir | Pinsirita | Bicho/Volador ⟵ Bicho | Piel Celeste ✳ (se queda la tuya) | ×1,30 | +7 % |
| 130 | Mega-Gyarados | Gyaradosita | Agua/Siniestro ⟵ Agua/Volador | Rompemoldes | ×1,30 | ±0 % |
| 150 | Mega-Mewtwo X | Mewtwoita X | Psíquico/Lucha ⟵ Psíquico | Impasible | ×1,25 | ±0 % |
| 181 | Mega-Ampharos | Ampharosita | Eléctrico/Dragón ⟵ Eléctrico | Rompemoldes | ×1,30 | −4 % |
| 212 | Mega-Scizor | Scizorita | Bicho/Acero | Experto | ×1,30 | +5 % |
| 214 | Mega-Heracross | Heracrossita | Bicho/Lucha | Encadenado | ×1,30 | −4 % |
| 257 | Mega-Blaziken | Blazikenita | Fuego/Lucha | Impulso | ×1,30 | +7 % |
| 260 | Mega-Swampert | Swampertita | Agua/Tierra | Nado Rápido | ×1,30 | +4 % |
| 306 | Mega-Aggron | Aggronita | Acero ⟵ Acero/Roca | Filtro | ×1,30 | ±0 % |
| 373 | Mega-Salamence | Salamencita | Dragón/Volador | Piel Celeste ✳ (se queda la tuya) | ×1,25 | +7 % |
| 376 | Mega-Metagross | Metagrossita | Acero/Psíquico | Garra Dura | ×1,25 | +16 % |
| 445 | Mega-Garchomp | Garchompita | Dragón/Tierra | Poder Arena | ×1,25 | −3 % |
| 460 | Mega-Abomasnow | Abomasnowita | Planta/Hielo | Nevada | ×1,25 (frenada) | −10 % |
| 531 | Mega-Audino | Audinita | Normal/Hada ⟵ Normal | Alma Cura | ×1,35 | ±0 % |

**Fuera por ahora:** 35 formas sin sprite en ninguna de las dos fuentes (casi todas las de Z-A; en
pokeemerald-expansion no hay ninguna de esas), Mega-Floette (Floette no es forma final) y Dialga Primigenio (no es oficial).

### 6.1 Las 19 de pokeemerald-expansion y las dos megas (07-11-2026)

- **Sprite:** `graphics/pokemon/<especie>/<mega|mega_x|mega_y>/overworld.png` de
  [pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) (RHH), con sus paletas
  normal y shiny. Es de 192×32: frente ×2, espalda ×2 y lado ×2 mirando a la izquierda (se voltea para
  la derecha). Se monta en la hoja del juego (2 × 8 direcciones) **sin ampliar**: Mega-Charizard Y mide
  unos 30×27 px de dibujo y Mega-Charizard X (SpriteCollab) unos 39×26. Los más grandes (Gyarados,
  Abomasnow, Pidgeot, Metagross) llenan los 32×32. Ancla: el pie más bajo de los 6 cuadros, 1,5 px por encima.
- **Animaciones:** sólo Idle (2 cuadros, 0,5 s cada uno) y Walk (2 cuadros, 0,15 s). Atacar, cargar,
  recibir daño y caer usan Idle, como ya hacía el juego con lo que falta.
- **Herramientas:** `tools/fetch_megas.cjs` mira primero SpriteCollab; si una mega oficial de PokeAPI no
  tiene cuerpo allí, busca su carpeta en pokeemerald-expansion y la apunta en `tools/cache/megas.json`
  (`rhh`). `python tools/fetch_sprites.py --megas` baja el PNG y las paletas a `tools/cache/rhh/` y monta
  `Idle.png`, `Walk.png` y `s/` (shiny). Después, `python tools/hover_flags.py`, como siempre (si no, las
  megas que flotan pierden su marca). Volver a ejecutarlas deja lo mismo. `tools/fetch_credits.py` se
  salta estas 19: sus créditos van a mano en `CREDITS.md`. Iconos de piedra: `node tools/fetch_items.js`
  con la tabla `MG` de `js/ui/icons.js`.
- **Créditos:** princess-phoenix, larryturbo y kidkatt (DeviantArt), según el `CREDITS.md` de
  pokeemerald-expansion (PR #5874). No hay licencia escrita: el dueño aprobó usarlos con crédito el 07-11-2026.
- **Dos megas por Pokémon:** `G.MEGA_OF[dex]` tiene las dos. Cada una es aparte: su versión con mega en
  el gacha (pueden salir las dos, cada una una vez), su piedra y su precio. `G.Shop.megaIds(dex)` da
  todas; `G.Shop.megaWorn(dex)`, las de piedra comprada (con Mega-Aro), la última comprada primero.
  Mega o Pulsera Z sigue siendo una cosa u otra (`save.pmg`), sin datos nuevos en el guardado.
- **Elegir:** lo decidió el dueño, «al megaevolucionar». Con las dos piedras, al pulsar el botón sale
  la carta de las ramas (`G.EvoUI.showMega`, desde `G.Game.offerMega`) con las dos megas, sus tipos,
  habilidad y stats; la partida se para (en grupo, para todos, como con las ramas). Teclas 1 y 2 o
  clic/toque. Con una sola piedra no sale carta. El botón del HUD lleva la piedra de la última usada.
- **Pantallas:** Mejoras, una tarjeta por piedra; Pokédex (pestaña Evolución) y Compendio, las dos con
  su lista de pasos (`G.UI.megaSteps(dex, id)`); pausa, las dos mientras no está activa.
- **Cooperativo:** no cambia: la mega viaja por su número en el dato de la fase (`a[18]`).
- **Equilibrio (`tools/medir-mega.cjs`):** ninguna pasa al mejor sin mega (Glaceon, 2,57) al ritmo
  rápido. Mega-Abomasnow daba 2,50 (2,70 en el pico, la más alta) y está en el 5 % mejor, como Glalie y
  Camerupt: se frena a ×1,25 (2,36). En el pico quedan por encima Mega-Glalie (2,58, ya era así) y
  Mega-Blaziken (2,59). No cuenta habilidades: Impulso de Blaziken no está medido.

## 7. Datos que hay que generar

- `tools/fetch_megas.cjs` → `js/data/megas.js`: por mega, su número de PokeAPI (`10034`), especie,
  nombres en español e inglés, tipos, habilidad, stats ajustados y piedra. Se puede volver a ejecutar
  y avisa si PokeAPI o SpriteCollab cambian. Las megas no entran en `G.DEX`.
- `tools/fetch_sprites.py`: modo de formas que baja a `assets/pokemon/{número}/` y llena `G.SPRITE_META`
  (las de pokeemerald-expansion, como se cuenta en 6.1).
- `tools/fetch_credits.py`: créditos de las formas. Sprites CC BY-NC 4.0, como los demás.
- `tests/mega.test.cjs` y caso de red en `tests/net.test.cjs`.

## 8. Equilibrio: cómo se mide

- `tools/medir-mega.cjs` (con la salida de `medir-pokemon.cjs`): ninguna mega por encima del mejor Pokémon sin mega.
- `tools/equilibrio.cjs`: las filas de los ataques deben salir iguales.
- `tools/curve.cjs --mega`: partidas con el bot que megaevoluciona en cuanto puede.

## 9. Riesgos

| Riesgo | Cómo se evita |
|---|---|
| Faltan megas que la gente pedirá | La herramienta las añade cuando haya sprite |
| PokeAPI sin habilidad de Z-A | Conservan tu habilidad; la herramienta avisa |
| Cambiar de habilidad a media partida | Sólo ganchos en vivo; prueba de entrar y salir 10 veces |
| Versión anterior en el grupo | `wv` y el dato de fase; una mega desconocida se ve como el normal |
| Perder lo comprado al fusionar | Unión, con prueba, como los Cristales Z. También `mop` |
| Sprite de mega que no carga a tiempo | Se precarga al llegar a la forma final; sin hoja, se queda el sprite normal |

## 10. Decisiones del dueño (06-11-2026)

1. **Mega y Z:** uno u otro por Pokémon.
2. **Duración:** temporal, y se recarga con enemigos derrotados, de modo que al principio cueste y luego sea más fácil. Sin espera mínima entre megas.
3. **Quién:** las 43 con sprite, también legendarios.
4. **Las que no tienen sprite:** esperan a SpriteCollab.
5. **Pokémon que faltan:** entran los 8 con andar. Los otros 51 esperan a SpriteCollab.

Decisiones del 07-11-2026 (sección 4.1):

6. **Dónde:** en el mismo gacha, con rareza Mega.
7. **Dificultad:** 0,5 % entre todas y nunca menos de 0,1 % cada una, con garantía a las 1.500.
8. **Piedras ya compradas:** se respetan, sin compensación.
9. **Megas de legendarios:** la misma regla que las demás.

## 11. Orden de trabajo

Cada parte en su PR, sin juntar hasta que lo pida el dueño:

1. Este documento.
2. Los Pokémon que faltan.
3. Datos y sprites de las megas (sin nada visible).
4. La mega en partida, con HUD, Compendio, cooperativo, equilibrio y Novedades.
