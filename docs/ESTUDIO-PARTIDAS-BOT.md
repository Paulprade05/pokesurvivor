# Estudio de partidas con bot: los 140 ataques (2026-11-05)

Partidas de verdad en local, sin cuenta: Chrome sin ventana, invitado, Mew con todas las mejoras, un solo ataque, 14 minutos y vida infinita. Todo lo medido es la rama de [PR #10](https://github.com/Paulprade05/pokesurvivor/pull/10), no lo publicado.

- **Herramienta:** `tools/laboratorio.cjs` (lanza las partidas y saca el informe) y `tools/curve.cjs` (el bot).
- **Partidas:** 358 jugadas, 280 válidas (dos por ataque). Las otras 78 se descartaron porque el bot aún jugaba mal esos ataques.
- **Datos en bruto:** `pokesurvivor-tmp/igualar`, carpetas `v1`, `v2`, `v3`, `lab4` y `lab5`.

## Qué aprendió a hacer el bot

Esquiva a enemigos, disparos y zonas de peligro. Recoge orbes, entra en grietas, abre cofres, usa altares y va al manantial si va mal de vida. En las 280 partidas: 1.117 cofres, 1.942 altares, 873 grietas y 2.075 jefes.

Hubo que corregirlo dos veces, porque cada error hacía parecer malos a ataques que no lo eran:

1. **Huía de todo.** Los ataques cortos no llegaban: Mordisco daba 19 de daño/s. Pegado a la horda da 977.
2. **Nunca cambiaba de hueco.** Con un apoyo activo, Placaje no llegaba a pegar. Ahora va y vuelve.

## Conclusiones

### 1. La carta Potencia pesa más que casi cualquier ajuste

Con el mismo ataque, una partida con Potencia hace **×1,58** de daño que una sin ella (gana 44 de 47 comparaciones). Sólo se pueden llevar 4 pasivas, y 90 de 258 partidas se quedaron sin ella. Vigor va al revés: quien lleva más hace ×0,79, porque ocupa ese sitio.

Por eso dos partidas iguales difieren ×1,34 de normal y ×2 en el peor 10 %. Descontando Potencia, la diferencia baja a ×1,21. Una sola partida por ataque no sirve para decidir nada.

### 2. Ataques firmes por arriba

En las dos partidas, por encima de ×1,3 de la mediana una vez descontada Potencia. El número es el daño/s descontado; `*` indica que al menos una partida no llevó Potencia y se corrigió.

Chispazo 4.075\*, Fiebre Dorada 3.633\*, Golpe Bajo 3.290, Rayo Carga 3.269\*, Tajo Cruzado 3.158, Tumba Rocas 3.012\*, Hiperrayo 2.996, Impactrueno 2.934\*, Onda Trueno 2.811\*, Torbellino 2.765\*, Fuego Fatuo 2.720\*, Golpe Cuerpo 2.552\*, Rayo Señal 2.534\*, Huesomerang 2.522\*, Rayo Solar 2.300\*, Bola Voltio 2.213, Rayo 2.096.

**Vigilar Tajo Cruzado:** lo subió el PR #10 y queda ×1,38 sobre lo que predecía la marea.

### 3. Ataques firmes por abajo

En las dos partidas, por debajo de ×0,7 de la mediana una vez descontada Potencia.

| Grupo | Ataques (daño/s descontado) | Lectura |
|---|---|---|
| Flojos de verdad | Sustituto 200, Bucle Arena 287, Gancho Alto 487, Lanzallamas 577, Ala Bis 603, Magnitud 739, Esfera Aural 849, Rayo Aurora 956 | Candidatos a subir |
| Dudosos por el bot | Semilladora 200, Pin Misil 385, Shuriken de Agua 396, Ráfaga Escamas 514 (ráfagas); Púas Tóxicas 191, Púas 347 (minas) | Probar a mano antes de tocar |
| Algo flojos | Picadura 821, Enfado 822, Voz Cautivadora 873, Tormenta Floral 881, Ciclón 903, Rueda Fuego 951, Al Ataque 953, Giro Rápido 994 | Sin prisa |

Las ráfagas salen hacia donde andas y el bot no usa el apuntado manual. Las minas piden atraer a la horda hacia ellas, y el bot no lo sabe hacer.

Sustituto y Bucle Arena además se hunden: pegan poco, suben poco de nivel y siguen pegando poco. Con 4 ataques, como juega una persona, eso se notaría menos.

### 4. Los sospechosos del estudio anterior

| Ataque | Marea | Partida (bruto) | Veredicto |
|---|---|---|---|
| Rayo Aurora | 2.603 | 778 | La marea lo exagera mucho: es flojo |
| Tajo Aéreo | 2.986 | 1.716 | La marea lo exagera: normal |
| Fuego Fatuo | 2.642 | 1.721 | Alto sólo una vez descontada Potencia |
| Rayo Carga | 2.615 | 2.069 | Alto, confirmado |
| Tajo Cruzado | 1.956 | 3.158 | Más alto de lo previsto |

La marea acierta sólo a medias: el orden de los ataques se parece al de las partidas en 0,54 (1 sería idéntico). Sirve para filtrar, no para cerrar un ajuste.

### 5. Daño hecho y recibido por fases

Mediana de los ataques que pegan:

| Minutos | Daño hecho/s | Daño recibido/s |
|---|---|---|
| 0-5 | 327 | 0,34 |
| 5-10 | 1.433 | 3,03 |
| 10-14 | 2.293 | 7,89 |

El daño recibido sube ×23 y el hecho ×7: el peligro crece mucho más rápido que la fuerza. 228 de 258 partidas habrían caído, la primera vez hacia el minuto 8,3 (con un solo ataque; con cuatro se aguanta más).

De dónde viene el daño recibido: 34 % toques de la horda, 28 % disparos de la horda, 23 % ataques especiales de legendarios, y el resto, poco a poco.

Quien más recibe: Patada Giro 17,66/s (29 caídas), Granizo 11,08, Golpe Aéreo 10,53, Bola Sombra 9,83, Ráfaga Escamas 9,70. Quien menos, entre los que no se hunden: Beso Drenaje 0,72, Vozarrón 0,78, Rayo Aurora 0,99.

### 6. Cofres, altares y grietas no cambian el daño

Por partida salen unos 4 cofres, 7 altares y 3 grietas. Comparando partidas del mismo ataque, tener más de uno de ellos no da más daño: ×1,00 cofres, ×1,01 altares, ×1,02 grietas.

Desde el minuto 5, en grieta se hace 811 de daño/s y fuera 2.272. Se pasa ahí el 26 % del tiempo. Ojo: el bot coge lo primero que le ofrecen, así que una persona que elija bien podría sacar más.

### 7. Apoyos

Medidos junto a Placaje, que solo hace 944 de daño/s:

| Apoyo | ×Placaje | Lectura |
|---|---|---|
| Danza Espada | 1,94 | Muy bueno |
| Agilidad | 1,60 | Bueno |
| Búnker | 1,54 | Bueno |
| Escudo Real | 1,46 | Bueno |
| Danza Dragón, Canto Mortal, Acua Aro | 1,0-1,1 | Sin efecto visible en daño |
| Brecha Negra, Barrera Espinosa | 0,91 | Sin efecto visible en daño |
| Fortaleza | 0,84 | Baja el daño recibido a 2,21/s, frente a 8,64/s de Placaje solo |
| Maquinación | 0,72 | No cuenta: sube el ataque especial y Placaje es físico |

Con dos partidas y Placaje dando 1.213 y 674, sólo los extremos son fiables.

## Límites de esta prueba

- **Un solo ataque:** nadie juega así. Esto compara ataques, no predice el daño de una partida normal.
- **Dos partidas por ataque:** sirve para extremos, no para distinguir un 10 %.
- **Daño bruto:** cuenta el exceso de muerte, así que Hiperrayo y otros golpes grandes salen algo inflados. Mirar también las bajas.
- **El veneno y la quemadura no cuentan como daño hecho:** Tóxico y Púas Tóxicas salen bajos en daño, pero con bajas normales. Tóxico no es flojo.
- **La columna Cura/s no vale:** con vida infinita la vida real no baja, así que casi no se apunta la cura.
- **Mew:** sus ataques Psíquicos llevan +20 %, ya descontado en las tablas.
- **Las 85 primeras partidas a distancia** usan el bot antes de las correcciones, que no cambian nada para esos ataques.

## Fallo encontrado en el juego

Hubo fallos de fotograma en 3 de las 358 partidas, sin pararlas: las dos de Sombra Vil y una de Brecha Negra. Sólo se capturó entero el de Brecha Negra: `drawImage` con un lienzo de tamaño 0 en `js/systems/hazards.js:283`, al pintar un aviso de peligro. No se sabe si los de Sombra Vil son el mismo fallo, y repetirse con ese ataque puede no ser casualidad.

## Ajuste aplicado después del estudio (2026-11-05)

El dueño pidió aplicarlo todo para que todos los ataques valgan la pena. Las tablas de abajo y `ESTUDIO-ATAQUES.md` y `ESTUDIO-POKEMON.md` son de **antes** de este ajuste.

Antes, el peor ataque no llegaba a ×0,2 de la mediana. Ahora los 129 que pegan llegan a ×0,7 en daño o en bajas: el peor da ×0,71 y el mejor ×2,56. Medido con 2 partidas por ataque tocado, sin errores.

| Ataque | `DMG_K` | Daño/s descontado: antes → después |
|---|---|---|
| Semilladora | [2,4; 2,2] + apunta | 200 → 1.403 |
| Pin Misil | [2; 1,8] + apunta | 385 → 1.310 |
| Shuriken de Agua | [2,1; 2,1] + apunta | 396 → 1.320 |
| Ráfaga Escamas | [1,5; 1,5] + apunta | 514 → 1.831 |
| Bucle Arena | [5,5; 4] | 287 → 1.261 |
| Púas | [3; 3] | 347 → 1.247 |
| Púas Tóxicas | [2,4; 2,1] | 191 → 612 (bajas 1.181 → 1.788) |
| Sustituto | [6; 6] | 200 → 2.109 (bajas sólo 673) |
| Gancho Alto | [2,2; 2,1] | 487 → 1.207 |
| Ala Bis | [1,7; 2] | 603 → 1.218 |
| Lanzallamas | [1,1; 1,5] | 577 → 830 (bajas 1.425 → 1.664) |
| Esfera Aural | [1,3; 1,1] | 849 → 1.344 |
| Rayo Aurora | [1,15; 0,9] | 956 → 1.767 |

- **Suben algo:** Picadura, Enfado, Voz Cautivadora, Tormenta Floral, Ciclón, Giro Rápido, Burbuja, Canto Helado, Infortunio, Disparo Lodo, Golpe Kárate, Remolino y Magnitud.
- **Bajan:** Tajo Cruzado [1,2; 2,2] (3.158 → 2.968) y Fuego Fatuo [1; 0,9].
- **Rayo Carga:** Réplica reparte el daño (3.269 → 2.724).
- **Ráfagas:** salen hacia donde andas, pero van al enemigo más cercano de ese lado (±46°). Es el cambio que más ha rendido.
- **No se tocó Tóxico:** no era flojo; su veneno no cuenta como daño.

**Vigilar en partidas reales:**

- **Bucle Arena:** en el modelo es el 2.º en marea (3.238) y el 3.º contra jefes (1.212). En partida da mucho menos porque no toca a los voladores, pero una persona que lo coloque bien puede sacar más.
- **Rayo Aurora:** primero en marea (3.473); en partida, ×1,12 de la mediana.
- **Tierra en el modelo:** Groudon pasa de 1,14 a 1,97 y es el más alto. Es por Bucle Arena y Púas, y el bot no lo confirma.
- **Sustituto:** su daño no se convierte en bajas ni en nivel (24). Sigue siendo el más raro de todos.

## Tablas completas

280 partidas de 140 ataques (129 que pegan, 11 de apoyo). Mediana de los que pegan: 1.314 de daño/s, 3,68 de daño recibido/s, 2.186 bajas, nivel 35.
Hecho en total: 1117 cofres, 1942 altares, 873 grietas, 2075 jefes.

### Ataques que pegan

| Ataque | Familia | Daño/s | Cada partida | ×mediana | 0-5 min | 5-10 | 10+ | Recibido/s | 0-5 | 5-10 | 10+ | Cura/s | Jefes % | Bajas | Nv | Evo | Caídas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Chispazo | aura | 3.328 | 2.576 / 4.080 | 2,53 | 1.131 | 4.430 | 4.506 | 2,24 | 0,23 | 1,78 | 4,84 | 0,03 | 8 | 2.508 | 35 | 2/2 | 3 |
| Golpe Bajo | homing | 3.290 | 3.598 / 2.981 | 2,50 | 507 | 3.372 | 6.602 | 3,10 | 1,00 | 2,93 | 6,00 | 0,11 | 19 | 2.631 | 38 | 2/2 | 5 |
| Tajo Cruzado | cross | 3.158 | 2.356 / 3.960 | 2,40 | 612 | 2.685 | 6.706 | 2,60 | 0,15 | 2,11 | 6,21 | 1,59 | 4 | 3.055 | 38 | 2/2 | 4 |
| Hiperrayo | charge | 2.996 | 3.310 / 2.683 | 2,28 | 973 | 3.329 | 5.016 | 3,52 | 0,17 | 2,05 | 9,24 | 0,05 | 5 | 2.231 | 38 | 2/2 | 7 |
| Fiebre Dorada | dusting | 2.856 | 3.033 / 2.679 | 2,17 | 376 | 2.981 | 5.711 | 5,05 | 0,20 | 2,46 | 14,04 | 0,00 | 3 | 3.615 | 39 | 2/2 | 11 |
| Tumba Rocas | stun | 2.390 | 2.637 / 2.143 | 1,82 | 582 | 2.251 | 4.745 | 2,41 | 0,14 | 1,48 | 6,46 | 0,17 | 5 | 2.739 | 38 | 2/2 | 2 |
| Liofilización | stun | 2.307 | 2.027 / 2.586 | 1,76 | 528 | 2.086 | 4.680 | 2,59 | 0,10 | 2,14 | 6,30 | 0,06 | 10 | 2.702 | 38 | 2/2 | 6 |
| Onda Trueno | stun | 2.286 | 2.761 / 1.811 | 1,74 | 413 | 2.564 | 4.294 | 3,07 | 0,21 | 1,90 | 8,06 | 0,16 | 10 | 2.737 | 39 | 2/2 | 6 |
| Bola Voltio | bounce | 2.213 | 2.313 / 2.113 | 1,68 | 388 | 1.951 | 4.747 | 2,47 | 0,14 | 1,16 | 6,20 | 0,05 | 7 | 3.008 | 37 | 2/2 | 2 |
| Lengüetazo | melee | 2.212 | 2.800 / 1.623 | 1,68 | 457 | 1.879 | 4.604 | 3,04 | 0,28 | 2,24 | 6,93 | 2,58 | 6 | 2.600 | 36 | 2/2 | 3 |
| Golpe Cuerpo | melee | 2.144 | 2.882 / 1.406 | 1,63 | 279 | 2.341 | 4.089 | 4,49 | 0,60 | 4,69 | 8,96 | 0,07 | 1 | 2.957 | 37 | 2/2 | 4 |
| Lanzarrocas | projectile | 2.099 | 1.665 / 2.534 | 1,60 | 508 | 2.298 | 3.745 | 1,78 | 0,24 | 2,21 | 3,03 | 0,00 | 8 | 2.331 | 35 | 2/2 | 1 |
| Rayo | chain | 2.096 | 2.138 / 2.054 | 1,60 | 396 | 2.024 | 4.221 | 3,39 | 0,12 | 1,38 | 9,59 | 0,00 | 14 | 2.863 | 37 | 2/2 | 3 |
| Chuzos | column | 2.081 | 1.971 / 2.191 | 1,58 | 617 | 1.985 | 3.985 | 4,58 | 0,14 | 4,32 | 9,96 | 0,98 | 10 | 2.649 | 35 | 2/2 | 10 |
| Rayo Carga | sweep | 2.069 | 2.196 / 1.943 | 1,57 | 381 | 2.215 | 3.877 | 1,72 | 0,03 | 2,03 | 3,49 | 0,08 | 6 | 2.913 | 39 | 2/2 | 1 |
| Huesomerang | boomerang | 2.033 | 2.383 / 1.684 | 1,55 | 433 | 1.984 | 4.091 | 6,63 | 0,19 | 6,13 | 14,36 | 0,01 | 8 | 2.836 | 36 | 2/2 | 9 |
| Onda Ígnea | nova | 2.015 | 2.480 / 1.549 | 1,53 | 298 | 2.106 | 3.964 | 2,48 | 0,18 | 1,83 | 6,11 | 1,78 | 4 | 3.122 | 38 | 2/2 | 3 |
| Energibola | homing | 1.958 | 1.708 / 2.208 | 1,49 | 340 | 2.511 | 3.236 | 5,12 | 0,28 | 1,36 | 14,16 | 0,08 | 14 | 2.355 | 40 | 2/2 | 8 |
| Beso Drenaje | homing | 1.956 | 2.121 / 1.791 | 1,49 | 425 | 2.531 | 3.105 | 0,72 | 0,06 | 0,39 | 1,90 | 0,00 | 11 | 2.210 | 38 | 2/2 | 0 |
| Joya de Luz | bounce | 1.914 | 2.046 / 1.782 | 1,46 | 419 | 2.236 | 3.358 | 3,81 | 0,11 | 3,06 | 9,09 | 2,59 | 11 | 2.862 | 36 | 2/2 | 6 |
| Cañón Floral | sweep | 1.909 | 1.839 / 1.979 | 1,45 | 295 | 2.085 | 3.419 | 3,13 | 0,25 | 2,37 | 6,63 | 0,07 | 5 | 3.089 | 38 | 2/2 | 4 |
| Impactrueno | projectile | 1.857 | 2.084 / 1.630 | 1,41 | 331 | 2.056 | 3.454 | 3,31 | 0,07 | 1,34 | 9,75 | 3,98 | 11 | 3.043 | 36 | 2/2 | 4 |
| Rayo Hielo | beam | 1.838 | 1.859 / 1.818 | 1,40 | 507 | 2.271 | 3.007 | 2,27 | 0,14 | 1,26 | 6,11 | 0,08 | 14 | 1.985 | 33 | 2/2 | 4 |
| Homenaje Póstumo | ally | 1.832 | 2.235 / 1.429 | 1,39 | 330 | 2.064 | 3.323 | 5,37 | 0,28 | 3,96 | 12,95 | 0,41 | 17 | 2.352 | 34 | 2/2 | 10 |
| Bomba Fango | puddle | 1.808 | 1.653 / 1.963 | 1,38 | 298 | 1.643 | 3.812 | 4,72 | 0,18 | 2,96 | 12,09 | 0,07 | 4 | 3.269 | 38 | 2/2 | 11 |
| Torbellino | vortex | 1.750 | 1.648 / 1.853 | 1,33 | 446 | 2.137 | 2.842 | 5,06 | 0,87 | 5,84 | 9,29 | 0,58 | 7 | 2.709 | 36 | 2/2 | 11 |
| Dragoaliento | cone | 1.737 | 1.672 / 1.801 | 1,32 | 374 | 1.654 | 3.455 | 2,18 | 0,08 | 2,98 | 3,63 | 0,04 | 8 | 2.275 | 36 | 2/2 | 3 |
| Fuego Fatuo | turret | 1.721 | 2.042 / 1.401 | 1,31 | 558 | 1.951 | 2.891 | 2,39 | 0,12 | 1,13 | 6,79 | 0,10 | 4 | 2.279 | 34 | 2/2 | 3 |
| Sombra Vil | homing | 1.720 | 1.099 / 2.340 | 1,31 | 373 | 1.433 | 3.589 | 3,35 | 0,12 | 3,62 | 6,34 | 0,20 | 9 | 2.238 | 35 | 2/2 | 5 |
| Danza Pluma | dusting | 1.718 | 1.768 / 1.668 | 1,31 | 378 | 1.768 | 3.232 | 2,79 | 0,17 | 2,69 | 5,67 | 0,10 | 4 | 2.770 | 37 | 2/2 | 4 |
| Tajo Aéreo | homing | 1.716 | 1.327 / 2.105 | 1,31 | 409 | 1.532 | 3.467 | 5,44 | 0,40 | 4,10 | 11,59 | 0,07 | 8 | 1.652 | 33 | 2/2 | 14 |
| Meteoros | cross | 1.716 | 2.292 / 1.139 | 1,31 | 315 | 1.522 | 3.693 | 2,92 | 0,16 | 0,48 | 9,33 | 0,07 | 12 | 3.200 | 37 | 2/2 | 6 |
| Ida y Vuelta | dash | 1.715 | 1.666 / 1.764 | 1,31 | 375 | 1.795 | 3.222 | 6,74 | 0,62 | 6,71 | 13,80 | 0,17 | 9 | 2.257 | 35 | 2/2 | 2 |
| Pedrada | lob | 1.667 | 1.478 / 1.856 | 1,27 | 430 | 1.800 | 3.018 | 3,79 | 0,34 | 2,24 | 9,28 | 0,07 | 6 | 2.175 | 35 | 2/2 | 5 |
| Rueda Aural | ricochet | 1.640 | 2.151 / 1.130 | 1,25 | 377 | 1.493 | 3.229 | 2,62 | 0,08 | 2,49 | 5,27 | 0,00 | 8 | 2.250 | 35 | 2/2 | 3 |
| Vozarrón | nova | 1.633 | 1.662 / 1.604 | 1,24 | 327 | 1.034 | 3.931 | 0,78 | 0,09 | 1,04 | 1,28 | 0,00 | 4 | 2.822 | 33 | 2/2 | 1 |
| Viento Feérico | nova | 1.624 | 2.197 / 1.051 | 1,24 | 292 | 1.328 | 3.610 | 1,78 | 0,28 | 1,81 | 3,69 | 0,00 | 7 | 2.439 | 35 | 2/2 | 1 |
| Rayo Señal | bounce | 1.603 | 1.601 / 1.606 | 1,22 | 339 | 1.404 | 3.237 | 2,27 | 0,14 | 2,16 | 5,10 | 0,06 | 7 | 3.109 | 39 | 2/2 | 3 |
| Tornado | orbit | 1.594 | 1.324 / 1.863 | 1,21 | 563 | 1.822 | 2.496 | 3,93 | 0,73 | 3,20 | 8,51 | 0,14 | 8 | 1.856 | 35 | 2/2 | 6 |
| Puño Dinámico | stun | 1.587 | 2.209 / 965 | 1,21 | 769 | 1.577 | 2.554 | 1,54 | 0,39 | 1,64 | 2,86 | 0,11 | 9 | 1.658 | 31 | 2/2 | 2 |
| Hidrobomba | beam | 1.572 | 1.580 / 1.564 | 1,20 | 484 | 1.975 | 2.253 | 3,37 | 0,23 | 2,53 | 7,89 | 0,07 | 11 | 2.090 | 33 | 2/2 | 5 |
| Ciclón Primavera | dusting | 1.570 | 1.569 / 1.571 | 1,19 | 277 | 1.578 | 3.159 | 4,95 | 0,24 | 4,12 | 11,27 | 0,14 | 7 | 2.931 | 37 | 2/2 | 6 |
| Furia Dragón | beam | 1.567 | 1.575 / 1.559 | 1,19 | 407 | 1.811 | 2.602 | 4,60 | 0,38 | 3,82 | 10,22 | 0,13 | 10 | 2.186 | 34 | 2/2 | 10 |
| Veneno X | cross | 1.549 | 1.053 / 2.044 | 1,18 | 314 | 1.980 | 2.522 | 4,39 | 0,20 | 2,20 | 12,12 | 0,07 | 8 | 2.808 | 36 | 2/2 | 8 |
| Avalancha | meteor | 1.544 | 1.620 / 1.468 | 1,17 | 311 | 1.631 | 2.841 | 4,44 | 1,33 | 3,03 | 9,39 | 0,06 | 7 | 2.558 | 39 | 2/2 | 11 |
| Ataque Ala | melee | 1.542 | 1.439 / 1.644 | 1,17 | 369 | 1.961 | 2.485 | 5,17 | 0,48 | 4,30 | 12,00 | 0,02 | 12 | 2.558 | 36 | 2/2 | 9 |
| Voto Fuego | puddle | 1.520 | 1.714 / 1.326 | 1,16 | 307 | 1.486 | 2.995 | 5,61 | 0,52 | 5,72 | 11,54 | 0,02 | 13 | 2.902 | 38 | 2/2 | 9 |
| Garra Dragón | melee | 1.520 | 1.518 / 1.521 | 1,16 | 309 | 1.408 | 3.132 | 2,83 | 0,20 | 2,46 | 6,46 | 0,13 | 7 | 2.165 | 34 | 2/2 | 2 |
| Tinieblas | aura | 1.509 | 1.613 / 1.405 | 1,15 | 281 | 1.650 | 2.629 | 5,37 | 0,54 | 6,49 | 9,50 | 0,07 | 7 | 2.303 | 35 | 2/2 | 5 |
| Disparo Espejo | bounce | 1.489 | 1.315 / 1.663 | 1,13 | 295 | 1.526 | 2.832 | 4,75 | 0,10 | 2,67 | 12,74 | 0,05 | 10 | 2.898 | 37 | 2/2 | 7 |
| Patada Giro | spin | 1.470 | 1.400 / 1.540 | 1,12 | 335 | 1.470 | 2.856 | 17,66 | 3,12 | 16,30 | 36,54 | 0,03 | 9 | 2.860 | 38 | 2/2 | 29 |
| Viento Aciago | vortex | 1.465 | 1.250 / 1.679 | 1,11 | 363 | 1.776 | 2.424 | 6,83 | 0,39 | 8,13 | 12,97 | 0,03 | 10 | 2.527 | 35 | 2/2 | 10 |
| Rayo Solar | charge | 1.456 | 1.552 / 1.359 | 1,11 | 665 | 1.246 | 2.672 | 3,88 | 0,89 | 3,54 | 7,44 | 0,43 | 4 | 1.861 | 33 | 2/2 | 7 |
| Hueso Palo | lob | 1.412 | 1.637 / 1.187 | 1,07 | 297 | 1.507 | 2.663 | 6,78 | 0,59 | 6,21 | 15,01 | 1,74 | 11 | 2.155 | 35 | 2/2 | 8 |
| Ala de Acero | wings | 1.400 | 1.766 / 1.035 | 1,07 | 331 | 1.412 | 2.659 | 4,50 | 0,46 | 3,43 | 10,20 | 0,03 | 7 | 2.083 | 35 | 2/2 | 6 |
| Cascada | column | 1.400 | 1.170 / 1.631 | 1,07 | 308 | 1.408 | 2.633 | 6,20 | 1,18 | 6,15 | 12,41 | 0,04 | 7 | 2.560 | 36 | 2/2 | 12 |
| Giro Fuego | orbit | 1.372 | 1.400 / 1.344 | 1,04 | 354 | 1.528 | 2.403 | 8,20 | 1,28 | 8,78 | 15,52 | 0,09 | 9 | 2.348 | 36 | 2/2 | 5 |
| Ataque Rápido | dash | 1.352 | 1.045 / 1.660 | 1,03 | 479 | 1.598 | 2.085 | 5,99 | 0,54 | 5,90 | 12,61 | 2,61 | 10 | 2.319 | 35 | 2/2 | 16 |
| Confusión | projectile | 1.344 | 1.485 / 1.202 | 1,02 | 297 | 1.759 | 2.073 | 2,50 | 0,12 | 2,29 | 5,57 | 0,09 | 15 | 2.529 | 41 | 2/2 | 3 |
| Bomba Germen | bounce | 1.335 | 1.170 / 1.500 | 1,02 | 317 | 1.509 | 2.326 | 4,77 | 0,03 | 3,21 | 11,95 | 2,49 | 16 | 2.428 | 35 | 2/2 | 10 |
| Garra Metal | melee | 1.333 | 1.087 / 1.578 | 1,01 | 312 | 1.531 | 2.297 | 4,41 | 0,23 | 4,24 | 9,60 | 0,04 | 5 | 2.301 | 37 | 2/2 | 9 |
| Orbes Espectro | dusting | 1.331 | 1.547 / 1.114 | 1,01 | 311 | 1.313 | 2.588 | 5,74 | 0,51 | 4,57 | 13,41 | 0,19 | 19 | 2.147 | 37 | 2/2 | 8 |
| Látigo Cepa | melee | 1.326 | 1.633 / 1.019 | 1,01 | 500 | 1.984 | 1.581 | 3,50 | 0,37 | 3,14 | 7,66 | 0,07 | 17 | 1.704 | 30 | 2/2 | 6 |
| Bola Sombra | projectile | 1.322 | 1.909 / 735 | 1,01 | 326 | 1.522 | 2.324 | 9,83 | 0,12 | 10,84 | 20,29 | 0,12 | 10 | 2.561 | 37 | 2/2 | 20 |
| Rodar | ricochet | 1.314 | 887 / 1.741 | 1,00 | 434 | 1.350 | 2.402 | 2,07 | 0,44 | 1,73 | 4,61 | 0,04 | 10 | 1.580 | 33 | 2/2 | 2 |
| Psíquico | nova | 1.313 | 981 / 1.646 | 1,00 | 328 | 1.215 | 2.504 | 2,25 | 0,18 | 2,10 | 4,35 | 0,00 | 7 | 2.387 | 36 | 2/2 | 3 |
| Rayo Burbuja | cone | 1.309 | 1.323 / 1.295 | 1,00 | 304 | 1.580 | 2.203 | 1,84 | 0,21 | 1,45 | 4,31 | 0,02 | 14 | 2.108 | 34 | 2/2 | 2 |
| Nieve Polvo | aura | 1.293 | 966 / 1.620 | 0,98 | 278 | 1.458 | 2.248 | 2,23 | 0,42 | 1,65 | 4,99 | 0,00 | 6 | 2.253 | 35 | 2/2 | 2 |
| Géiser Fotónico | column | 1.290 | 962 / 1.619 | 0,98 | 246 | 1.395 | 2.447 | 3,11 | 0,36 | 2,15 | 7,44 | 0,16 | 11 | 2.909 | 39 | 2/2 | 4 |
| Paranormal | shove | 1.275 | 1.285 / 1.265 | 0,97 | 299 | 1.439 | 2.293 | 3,63 | 0,36 | 3,59 | 7,45 | 0,07 | 6 | 2.101 | 33 | 2/2 | 6 |
| Tajo Umbrío | spin | 1.238 | 1.267 / 1.209 | 0,94 | 268 | 1.298 | 2.231 | 3,32 | 0,41 | 2,40 | 7,41 | 0,05 | 12 | 2.132 | 36 | 2/2 | 6 |
| Brillo Mágico | aura | 1.228 | 1.045 / 1.411 | 0,93 | 337 | 1.671 | 1.764 | 3,48 | 0,39 | 4,45 | 5,88 | 0,01 | 8 | 2.083 | 36 | 2/2 | 6 |
| Golpe Aéreo | dash | 1.203 | 1.274 / 1.131 | 0,92 | 361 | 1.322 | 2.026 | 10,53 | 0,95 | 9,12 | 22,80 | 0,05 | 6 | 2.689 | 37 | 2/2 | 19 |
| Disparo Demora | mine | 1.203 | 898 / 1.507 | 0,92 | 306 | 1.561 | 1.832 | 4,85 | 0,43 | 6,08 | 8,73 | 0,06 | 7 | 2.440 | 34 | 2/2 | 11 |
| Picotazo Veneno | projectile | 1.170 | 1.433 / 907 | 0,89 | 267 | 1.315 | 2.039 | 3,50 | 0,66 | 3,26 | 7,18 | 0,07 | 12 | 2.884 | 39 | 2/2 | 2 |
| Campo Psíquico | puddle | 1.147 | 741 / 1.553 | 0,87 | 309 | 1.322 | 1.887 | 4,87 | 0,15 | 2,46 | 11,93 | 0,07 | 5 | 2.451 | 36 | 2/2 | 6 |
| Foco Resplandor | beam | 1.131 | 1.039 / 1.223 | 0,86 | 394 | 1.251 | 1.876 | 3,27 | 0,56 | 3,74 | 5,83 | 1,49 | 6 | 2.187 | 34 | 2/2 | 3 |
| Carantoña | melee | 1.115 | 1.020 / 1.209 | 0,85 | 349 | 1.213 | 1.924 | 2,81 | 0,79 | 2,78 | 5,21 | 1,50 | 17 | 1.858 | 37 | 2/2 | 4 |
| Poder Pasado | orbit | 1.094 | 997 / 1.192 | 0,83 | 364 | 1.257 | 1.757 | 2,05 | 0,17 | 1,38 | 5,11 | 0,05 | 12 | 1.787 | 34 | 2/2 | 2 |
| Granizo | meteor | 1.090 | 887 / 1.293 | 0,83 | 296 | 1.018 | 2.075 | 11,08 | 0,31 | 6,11 | 29,18 | 0,02 | 5 | 2.378 | 36 | 2/2 | 19 |
| Nitrocarga | dash | 1.086 | 1.319 / 853 | 0,83 | 316 | 1.457 | 1.583 | 2,29 | 0,28 | 1,24 | 6,09 | 0,11 | 7 | 1.970 | 33 | 2/2 | 2 |
| Hoja Afilada | boomerang | 1.086 | 1.338 / 834 | 0,83 | 368 | 1.320 | 1.660 | 4,29 | 0,24 | 3,03 | 10,72 | 0,06 | 4 | 2.140 | 36 | 2/2 | 8 |
| Psicocorte | boomerang | 1.085 | 906 / 1.263 | 0,83 | 236 | 1.487 | 1.619 | 1,58 | 0,31 | 1,69 | 3,03 | 0,02 | 10 | 2.098 | 34 | 2/2 | 1 |
| Bomba Ácida | bounce | 1.084 | 849 / 1.318 | 0,82 | 225 | 1.070 | 2.155 | 3,94 | 0,19 | 1,90 | 10,10 | 0,06 | 5 | 3.528 | 40 | 2/2 | 5 |
| Hierba Lazo | aura | 1.074 | 960 / 1.188 | 0,82 | 290 | 1.265 | 1.779 | 5,67 | 0,68 | 6,85 | 10,28 | 0,16 | 16 | 2.143 | 36 | 2/2 | 6 |
| Canto Helado | homing | 1.059 | 809 / 1.308 | 0,81 | 377 | 1.223 | 1.682 | 2,15 | 0,69 | 1,31 | 4,18 | 0,03 | 28 | 1.393 | 34 | 2/2 | 5 |
| Onda Vacío | shove | 1.059 | 1.110 / 1.007 | 0,81 | 404 | 1.463 | 1.392 | 3,68 | 0,40 | 3,87 | 7,33 | 0,10 | 7 | 1.896 | 32 | 2/2 | 6 |
| Puño Meteoro | meteor | 1.058 | 961 / 1.155 | 0,81 | 285 | 1.227 | 1.710 | 7,98 | 0,50 | 6,45 | 18,21 | 0,09 | 4 | 2.572 | 36 | 2/2 | 9 |
| Balón Ígneo | ricochet | 1.055 | 625 / 1.486 | 0,80 | 327 | 1.117 | 1.735 | 2,84 | 0,21 | 2,72 | 5,79 | 0,10 | 9 | 2.071 | 36 | 2/2 | 2 |
| Psicorrayo | beam | 1.029 | 905 / 1.153 | 0,78 | 363 | 1.203 | 1.580 | 3,80 | 0,48 | 2,93 | 8,50 | 1,40 | 4 | 1.910 | 37 | 2/2 | 5 |
| Zumbido | aura | 1.007 | 1.451 / 563 | 0,77 | 291 | 1.071 | 1.716 | 4,27 | 0,85 | 4,37 | 7,97 | 0,09 | 6 | 1.913 | 33 | 2/2 | 2 |
| Ascuas | projectile | 999 | 1.185 / 813 | 0,76 | 295 | 1.227 | 1.572 | 4,70 | 0,19 | 5,70 | 7,72 | 0,06 | 13 | 2.171 | 36 | 2/2 | 11 |
| Giro Rápido | spin | 994 | 893 / 1.094 | 0,76 | 295 | 1.137 | 1.640 | 4,60 | 0,66 | 8,01 | 5,33 | 0,06 | 14 | 1.743 | 33 | 2/2 | 10 |
| Golpe Kárate | melee | 980 | 1.448 / 513 | 0,75 | 326 | 1.039 | 1.629 | 1,64 | 0,58 | 1,29 | 3,36 | 0,01 | 12 | 1.718 | 31 | 2/2 | 1 |
| Mordisco | melee | 977 | 722 / 1.233 | 0,74 | 365 | 1.135 | 1.521 | 3,48 | 0,40 | 3,08 | 7,70 | 2,63 | 9 | 1.782 | 32 | 2/2 | 4 |
| Pistola Agua | projectile | 960 | 728 / 1.192 | 0,73 | 326 | 1.146 | 1.490 | 2,30 | 0,12 | 1,30 | 6,08 | 2,69 | 15 | 2.343 | 34 | 2/2 | 3 |
| Disparo Lodo | nova | 958 | 1.194 / 722 | 0,73 | 264 | 881 | 1.877 | 2,49 | 0,19 | 3,16 | 4,40 | 0,14 | 9 | 1.636 | 30 | 2/2 | 5 |
| Al Ataque | ally | 953 | 998 / 907 | 0,72 | 263 | 1.106 | 1.586 | 5,64 | 0,63 | 5,39 | 11,00 | 0,37 | 13 | 1.927 | 34 | 2/2 | 12 |
| Residuos | projectile | 951 | 941 / 960 | 0,72 | 275 | 1.057 | 1.583 | 6,36 | 0,20 | 5,55 | 13,88 | 0,02 | 10 | 2.640 | 38 | 2/2 | 14 |
| Placaje | melee | 944 | 1.213 / 674 | 0,72 | 246 | 1.235 | 1.422 | 8,64 | 1,07 | 8,58 | 17,52 | 0,26 | 8 | 2.144 | 34 | 2/2 | 13 |
| Infortunio | chain | 923 | 695 / 1.151 | 0,70 | 410 | 1.082 | 1.339 | 3,99 | 0,17 | 6,16 | 5,89 | 0,17 | 10 | 1.547 | 32 | 2/2 | 7 |
| Ciclón | cross | 903 | 1.040 / 766 | 0,69 | 364 | 892 | 1.576 | 3,15 | 0,60 | 4,23 | 5,09 | 1,23 | 9 | 1.597 | 30 | 2/2 | 6 |
| Bola Neblina | homing | 898 | 835 / 960 | 0,68 | 329 | 1.160 | 1.256 | 2,47 | 0,06 | 1,31 | 6,67 | 0,06 | 15 | 1.854 | 36 | 2/2 | 3 |
| Tormenta Floral | orbit | 881 | 910 / 852 | 0,67 | 333 | 1.135 | 1.173 | 5,44 | 0,73 | 5,40 | 10,57 | 0,04 | 10 | 1.697 | 31 | 2/2 | 5 |
| Voz Cautivadora | shove | 873 | 848 / 898 | 0,66 | 350 | 1.246 | 1.057 | 1,82 | 0,45 | 1,51 | 3,86 | 0,00 | 6 | 1.574 | 29 | 2/2 | 2 |
| Paliza | ally | 866 | 790 / 941 | 0,66 | 295 | 1.016 | 1.370 | 6,10 | 0,42 | 4,21 | 15,31 | 0,04 | 5 | 2.147 | 34 | 2/2 | 11 |
| Giro Bola | spin | 863 | 763 / 962 | 0,66 | 246 | 996 | 1.437 | 2,43 | 0,60 | 2,53 | 4,55 | 0,01 | 13 | 1.745 | 32 | 2/2 | 2 |
| Pulso Umbrío | nova | 851 | 675 / 1.027 | 0,65 | 317 | 762 | 1.541 | 2,90 | 0,29 | 0,69 | 8,12 | 2,04 | 7 | 2.056 | 33 | 2/2 | 5 |
| Remolino | shove | 840 | 1.151 / 530 | 0,64 | 349 | 1.178 | 1.028 | 4,30 | 1,12 | 4,51 | 7,84 | 0,12 | 8 | 1.636 | 32 | 2/2 | 8 |
| Enfado | spin | 822 | 602 / 1.043 | 0,63 | 250 | 1.060 | 1.196 | 3,47 | 1,31 | 4,70 | 4,47 | 0,14 | 8 | 1.639 | 31 | 2/2 | 3 |
| Picadura | melee | 821 | 861 / 782 | 0,63 | 306 | 909 | 1.346 | 3,69 | 0,52 | 2,98 | 8,15 | 0,05 | 10 | 1.635 | 29 | 2/2 | 2 |
| Rueda Fuego | trail | 796 | 534 / 1.058 | 0,61 | 279 | 772 | 1.439 | 7,88 | 0,77 | 6,07 | 18,06 | 0,25 | 6 | 2.062 | 33 | 2/2 | 19 |
| Rayo Aurora | sweep | 778 | 940 / 615 | 0,59 | 292 | 811 | 1.345 | 0,99 | 0,06 | 1,28 | 1,61 | 0,12 | 12 | 1.480 | 32 | 2/2 | 0 |
| Magnitud | quake | 739 | 986 / 491 | 0,56 | 125 | 724 | 1.482 | 4,59 | 0,30 | 3,43 | 11,08 | 0,04 | 10 | 1.559 | 32 | 2/2 | 6 |
| Burbuja | nova | 700 | 720 / 680 | 0,53 | 257 | 717 | 1.164 | 1,81 | 0,09 | 2,23 | 3,34 | 0,04 | 7 | 1.534 | 31 | 2/2 | 2 |
| Terratemblor | aura | 666 | 761 / 571 | 0,51 | 162 | 607 | 1.328 | 7,70 | 0,11 | 3,37 | 20,81 | 0,04 | 0 | 1.805 | 36 | 2/2 | 21 |
| Lanzallamas | cone | 577 | 636 / 518 | 0,44 | 199 | 688 | 870 | 2,77 | 0,36 | 2,89 | 5,44 | 0,07 | 7 | 1.425 | 31 | 2/2 | 5 |
| Tóxico | trail | 552 | 569 / 535 | 0,42 | 204 | 562 | 958 | 6,89 | 1,49 | 5,80 | 14,18 | 0,04 | 4 | 1.975 | 34 | 2/2 | 8 |
| Esfera Aural | projectile | 537 | 499 / 575 | 0,41 | 363 | 622 | 651 | 3,32 | 0,64 | 3,59 | 6,29 | 0,12 | 18 | 1.246 | 29 | 2/2 | 5 |
| Ráfaga Escamas | knife | 514 | 557 / 470 | 0,39 | 249 | 532 | 788 | 9,70 | 3,09 | 9,19 | 17,95 | 0,11 | 11 | 1.443 | 30 | 2/2 | 27 |
| Ala Bis | wings | 487 | 573 / 401 | 0,37 | 261 | 569 | 651 | 4,66 | 0,47 | 3,98 | 8,96 | 0,01 | 14 | 1.013 | 28 | 2/2 | 6 |
| Gancho Alto | column | 426 | 642 / 210 | 0,32 | 208 | 376 | 742 | 1,85 | 0,22 | 2,66 | 2,94 | 0,03 | 13 | 927 | 27 | 2/2 | 4 |
| Shuriken de Agua | knife | 396 | 496 / 296 | 0,30 | 263 | 366 | 593 | 6,03 | 1,56 | 6,73 | 10,56 | 0,00 | 14 | 1.134 | 27 | 2/2 | 12 |
| Púas | mine | 347 | 61 / 632 | 0,26 | 128 | 331 | 635 | 4,22 | 2,34 | 3,66 | 6,99 | 0,04 | 7 | 926 | 25 | 2/2 | 11 |
| Pin Misil | knife | 297 | 306 / 288 | 0,23 | 135 | 340 | 437 | 4,93 | 1,55 | 4,68 | 9,11 | 0,09 | 16 | 844 | 28 | 2/2 | 7 |
| Bucle Arena | vortex | 193 | 325 / 61 | 0,15 | 99 | 192 | 301 | 1,41 | 0,35 | 0,98 | 2,95 | 0,88 | 0 | 522 | 21 | 2/2 | 1 |
| Sustituto | turret | 181 | 298 / 64 | 0,14 | 139 | 233 | 175 | 0,32 | 0,08 | 0,54 | 0,36 | 0,04 | 3 | 373 | 16 | 2/2 | 0 |
| Púas Tóxicas | mine | 176 | 302 / 51 | 0,13 | 56 | 198 | 294 | 6,42 | 1,88 | 7,44 | 10,51 | 0,15 | 4 | 1.181 | 30 | 2/2 | 7 |
| Semilladora | knife | 161 | 135 / 186 | 0,12 | 152 | 141 | 198 | 4,95 | 1,22 | 4,83 | 9,53 | 0,08 | 16 | 703 | 22 | 2/2 | 8 |

### Por familia

| Familia | Ataques | Daño/s mediano | Mínimo | Máximo | Recibido/s | Nivel |
|---|---|---|---|---|---|---|
| stun | 4 | 2.296 | 1.587 | 2.390 | 2,50 | 38 |
| charge | 2 | 2.226 | 1.456 | 2.996 | 3,70 | 35 |
| sweep | 3 | 1.909 | 778 | 2.069 | 1,72 | 38 |
| homing | 7 | 1.720 | 898 | 3.290 | 3,10 | 36 |
| dusting | 4 | 1.644 | 1.331 | 2.856 | 5,00 | 37 |
| cross | 4 | 1.632 | 903 | 3.158 | 3,04 | 36 |
| beam | 5 | 1.567 | 1.029 | 1.838 | 3,37 | 34 |
| bounce | 6 | 1.546 | 1.084 | 2.213 | 3,88 | 37 |
| lob | 2 | 1.540 | 1.412 | 1.667 | 5,28 | 35 |
| puddle | 3 | 1.520 | 1.147 | 1.808 | 4,87 | 38 |
| chain | 2 | 1.509 | 923 | 2.096 | 3,69 | 34 |
| vortex | 3 | 1.465 | 193 | 1.750 | 5,06 | 35 |
| column | 4 | 1.345 | 426 | 2.081 | 3,85 | 35 |
| melee | 11 | 1.326 | 821 | 2.212 | 3,50 | 34 |
| ricochet | 3 | 1.314 | 1.055 | 1.640 | 2,62 | 35 |
| nova | 7 | 1.313 | 700 | 2.015 | 2,25 | 33 |
| cone | 3 | 1.309 | 577 | 1.737 | 2,18 | 34 |
| dash | 4 | 1.277 | 1.086 | 1.715 | 6,36 | 35 |
| orbit | 4 | 1.233 | 881 | 1.594 | 4,68 | 34 |
| aura | 7 | 1.228 | 666 | 3.328 | 4,27 | 35 |
| projectile | 9 | 1.170 | 537 | 2.099 | 3,32 | 36 |
| meteor | 3 | 1.090 | 1.058 | 1.544 | 7,98 | 36 |
| boomerang | 3 | 1.086 | 1.085 | 2.033 | 4,29 | 36 |
| spin | 5 | 994 | 822 | 1.470 | 3,47 | 33 |
| shove | 4 | 966 | 840 | 1.275 | 3,65 | 32 |
| ally | 3 | 953 | 866 | 1.832 | 5,64 | 34 |
| turret | 2 | 951 | 181 | 1.721 | 1,35 | 25 |
| wings | 2 | 944 | 487 | 1.400 | 4,58 | 31 |
| quake | 1 | 739 | 739 | 739 | 4,59 | 32 |
| trail | 2 | 674 | 552 | 796 | 7,38 | 34 |
| mine | 3 | 347 | 176 | 1.203 | 4,85 | 30 |
| knife | 4 | 346 | 161 | 514 | 5,49 | 28 |

### Apoyo: lo que pega es Placaje

Comparar con la fila de Placaje: la diferencia es lo que aporta el apoyo. «Propio» es el daño del apoyo en sí.

| Ataque | Familia | Daño/s total | ×Placaje | Propio/s | Recibido/s | Cura/s | Bajas | Nv |
|---|---|---|---|---|---|---|---|---|
| Danza Espada | buff | 1.828 | 1,94 | 17 | 8,98 | 0,07 | 2.459 | 36 |
| Agilidad | buff | 1.510 | 1,60 | 0 | 8,04 | 3,70 | 2.175 | 37 |
| Búnker | ward | 1.452 | 1,54 | 188 | 6,36 | 0,08 | 2.811 | 37 |
| Escudo Real | ward | 1.377 | 1,46 | 113 | 5,66 | 0,05 | 2.331 | 35 |
| Danza Dragón | buff | 1.026 | 1,09 | 0 | 8,87 | 0,01 | 1.821 | 32 |
| Canto Mortal | wipe | 1.021 | 1,08 | 74 | 10,61 | 0,00 | 2.319 | 35 |
| Acua Aro | buff | 940 | 1,00 | 0 | 11,70 | 0,20 | 1.924 | 33 |
| Brecha Negra | wipe | 858 | 0,91 | 265 | 10,40 | 0,08 | 2.110 | 33 |
| Barrera Espinosa | ward | 854 | 0,91 | 132 | 5,51 | 0,01 | 1.863 | 33 |
| Fortaleza | buff | 794 | 0,84 | 3 | 2,21 | 0,00 | 1.551 | 31 |
| Maquinación | buff | 677 | 0,72 | 0 | 8,31 | 0,34 | 1.563 | 30 |
