# Estudio de los Pokémon en evolución final (2026-11-05)

Hecho con `tools/medir-pokemon.cjs` sobre `tools/balance.cjs --todas` (combate de verdad, semilla fija). 537 Pokémon sin evolución posterior. Para repetirlo:

```
node tools/balance.cjs --pasivos --todas --json bal.json
node tools/medir-pokemon.cjs bal.json --antes bal-main.json > docs/ESTUDIO-POKEMON.md
```

## Conclusiones (a mano: al regenerar la tabla, consérvalas)

**Cañón Floral era el único caso fuera de escala.** Con la medida nueva (marea, todas las pasivas) daba 5.077 frente a 2.985 del siguiente. Ahora da 2.428, en el grupo de Rayo Carga y Rayo Aurora (2.600). Hada era el mejor tipo por él (valor mediano 1,48) y pasa a 1,01.

**Ajuste terminado** (ataques compartidos: lo notan todos los Pokémon que los usan):

| Ataque | Cambio | Marea, todas las pasivas: `main` → rama | Valor real: `main` → rama |
|---|---|---|---|
| Cañón Floral | Réplica reparte el daño; `DMG_K` [1; 0,79] → [0,75; 0,45] | 5.077 → 2.428 (×0,48) | 3,68 → 1,73 |
| Homenaje Póstumo | el golpe salpica (radio 64, ×0,8); `DMG_K` [1,1; 1,35] | 947 → 1.348 | ver la tabla de ataques |
| Tajo Cruzado | `DMG_K` [1; 1] → [1,2; 2,5] | 850 → 1.956 | 0,78 → 1,81 |
| Puño Dinámico | `DMG_K` [1; 1,16] → [1,2; 2,4]; cráter ×1,5 | 1.031 → 1.815 | ver la tabla de ataques |

**Objetivos, con el bot jugando la partida de verdad** (mismo equipo, 16 min, mejoras al máximo):

| Objetivo | `main` | Rama | Partidas reales (cálculo) |
|---|---|---|---|
| Cañón Floral: 3.500-4.000 de daño/s activo | 2.470-2.767 (real ~8.000) | 1.148-1.848 | ×0,48 (modelo) a ×0,57 (bot): **3.800-4.600** |
| Marshadow: 3.500-4.000 de daño/s total | 2.127-2.148 (real ~1.700-1.900) | 3.297-3.849 con sus 4 ataques (una partida con 3: 1.500) | ×1,55-1,8: **2.700-3.100: puede quedarse corto** |

El bot de Cañón Floral lleva menos cartas que la partida real y cartas distintas en cada una: el ×0,57 es orientativo.

**El grupo que se temía no se confirma.** La cuenta de multiplicar columnas salía altísima porque la horda de 50 inmóviles premia los ataques de área:

| Ataque | Horda, todas las pasivas | Marea | Bot en `main` |
|---|---|---|---|
| Rodar → Romperrocas | 26.204 | 1.296 | 1.395/s (Regirock, sólo ese ataque) |
| Rayo Aurora → Mundo Gélido | 16.301 | 2.603 | sin dato útil (el bot no llegó a evolucionarlo) |
| Rayo Carga → Rayo Fusión | 15.843 | 2.615 | sin dato útil (ídem) |
| Bomba Fango → Arenas Ardientes | 5.785 | 1.166 | 809/s sin evolucionar |
| Campo Psíquico → Onda Mental | 4.630 | 1.180 | 1.588/s (Mewtwo) |

Rodar, Campo Psíquico y Bomba Fango están en lo normal. Rayo Aurora y Rayo Carga son los segundos más fuertes de la marea, sin llegar a lo de Cañón Floral.

**Los Pokémon.** De 537 finales, la mediana es 0,98; 17 pasan de 1,4 y 18 no llegan a 0,75.
- Arriba: Xurkitree (1,72: ataque 1,65 y monotipo) y los de Fuego y Volador (Moltres 1,56, Magmortar 1,50), por Fuego Fatuo y Tajo Aéreo. Los eléctricos, por Rayo Carga.
- Abajo: Smeargle (0,61), Shuckle (0,63), Wishiwashi (0,67), Diggersby (0,68), Yungoos (0,69): estadísticas bajas, y los de tipo Normal además sólo tienen 14 ataques.
- Tipo Normal es el peor grupo (0,82), con Tierra (0,91) y Planta (0,92) detrás.
- Efecto del ajuste: Marshadow 0,86 → 1,06, Tapu Lele 1,70 → 1,15, Machamp 0,91 → 1,22, Conkeldurr 0,92 → 1,25. **Lucha pasa de 0,89 a 1,06.** Regieleki no cambia (1,31).

**Contraste con lo real.** El modelo da el mismo orden que las partidas: en `main`, Tapu Lele 1,70, Regieleki 1,32, Marshadow 0,86; en lo real, 7.500, 5.100 y 1.800 de daño/s. Lo real está más separado. Tres diferencias con su explicación:
- Horda de 50: exageraba el área ×2-3 frente a una partida. Corregido con la marea (`tools/balance.cjs`): enemigos que caen y vienen andando. Sus números (20 a la vez, vida 300, tú a 125 px/s) salen de ajustarlos al reparto de daño del bot.
- Marshadow no llevaba su mejor equipo: su lista permite Viento Aciago y Vozarrón, que en marea dan más que Homenaje, Tajo y Puño en `main`. Parte de los 1.700 era elección de ataques.
- Regieleki real saca ×2,3-2,6 lo del modelo: partida larga, con Potencia y Vínculos que el modelo no suma. La media real / modelo es 1,70 en lo real y 0,85 en el bot, que lleva menos cartas.

Lo que sigue exagerando el modelo: auras y Puño Dinámico (×2-3 frente al bot, que se aleja de los enemigos). Fuego Fatuo es dudoso: la cadena de Infierno da 2.642 en marea, pero el bot sacó 728/s; evolucionó tarde y sólo hay 2 partidas.

**Bot normal, `main` contra rama** (24 partidas, 2 por grupo; 11 cortadas entre el minuto 25 y el 29: se usa lo jugado). Primera caída mediana con mejoras: 7,4 → 9,7 min; muro 20 → 23. Caídas de Tapu Lele del minuto 20 en adelante: 21 → 103. Charizard, Garchomp y Delibird cambian lo que da el azar de cartas, sin dirección clara. Marshadow con cartas al azar va peor o mejor según salgan ataques buenos (`karate-chop` lo hunde): 2 partidas no bastan. Con estos datos no se vuelve ni mucho más fácil ni imposible, pero son pocas partidas.

**Sin tocar: propuestas para el dueño**
1. Rayo Aurora y Rayo Carga: darles la misma regla de Réplica que a Cañón Floral (ganan ×3,2-3,6 con las pasivas). Probarlo antes con bot.
2. Tajo Aéreo: el más alto tras el ajuste (2.986). Bajarlo un 15 % bajaría a todos los voladores.
3. Tajo Cruzado queda ▲ (1,81): si los Lucha se notan fuertes, bajar el 2,5 de `DMG_K` a 2,2.
4. Fuego Fatuo: medirlo con más partidas antes de tocarlo.
5. Tipo Normal: subir un poco Hiperrayo y Golpe Cuerpo si se quiere reflotar a los del fondo.

## Supuestos

- **Ataques**: nivel máximo y evolucionados (los que no evolucionan, a nivel máximo), con **todas** las pasivas de daño a la vez: Amplitud, Persistencia, Réplica, Propulsión y Puntería con todas sus cartas.
- **Pokémon**: su ataque, su lado físico o especial (`G.Stats.fit`), +20 % de monotipo en su tipo, `EVO_K` / `MOVE_K`, y la efectividad media del ataque (tipo y defensa) contra todos los enemigos normales. Los potenciadores, escudos y barridos no cuentan.
- **Equipo**: 4 huecos. En cada partida sólo salen en cartas el ~70 % de sus ataques: es la media de 300 sorteos, cogiendo los 4 mejores. Sólo pega el hueco activo: 50 %, 25 %, 15 %, 10 % del tiempo (en lo real, el mejor ~55 %). «Grupo» = los 4 fusionados con Vínculos, que suman.
- **Jefe y marea**: jefe, un objetivo. Marea: enemigos que caen y vienen andando hacia ti (20 a la vez), sin rodearte. Los números van «con 1 de ataque por punto del Pokémon», sin Potencia ni Mejoras (multiplican igual a todos).
- **Valor**: media geométrica de marea (80 %) y jefe (20 %) frente a la mediana de los finales: 1 = lo normal. Los jefes reciben entre un 5 y un 30 % del daño en las partidas.
- **Fuera a propósito**: habilidad, naturaleza, objeto, MT, megaevoluciones, clima, danzas y aguante (vida, defensa, velocidad). Mide sólo cuánto pega.

Mediana de los finales: jefe 383 · marea 1.706.

## Los más fuertes y los más débiles

«Stats» = lo que aportan ataque, lado y monotipo; «Lista» = lo que aporta su lista de ataques (Stats × Lista = Valor).

### Los 25 más fuertes

| # | Pokémon | Tipo | Valor (main) | Jefe | Marea | Grupo marea | Ataque | Stats | Lista | Ataques | Mejores 4 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Xurkitree | Eléctrico | 1,72 (1,74) | 497 | 3.149 | 11.339 | 1,65 | 1,54 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 2 | Moltres | Fuego/Volador | 1,56 (1,58) | 642 | 2.611 | 8.857 | 1,39 | 1,13 | 1,37 | 24 | Tajo Aéreo, Fuego Fatuo, Vozarrón, Voto Fuego |
| 3 | Magmortar | Fuego | 1,50 (1,52) | 834 | 2.340 | 8.158 | 1,39 | 1,32 | 1,14 | 17 | Fuego Fatuo, Voto Fuego, Onda Ígnea, Balón Ígneo |
| 4 | Zapdos | Eléctrico/Volador | 1,49 (1,51) | 464 | 2.686 | 9.458 | 1,39 | 1,13 | 1,32 | 22 | Tajo Aéreo, Rayo Carga, Bola Voltio, Onda Trueno |
| 5 | Thundurus | Eléctrico/Volador | 1,49 (1,51) | 458 | 2.684 | 9.482 | 1,39 | 1,13 | 1,32 | 22 | Tajo Aéreo, Rayo Carga, Bola Voltio, Onda Trueno |
| 6 | Ho-Oh | Fuego/Volador | 1,47 (1,48) | 673 | 2.391 | 8.241 | 1,42 | 1,09 | 1,35 | 24 | Tajo Aéreo, Fuego Fatuo, Balón Ígneo, Vozarrón |
| 7 | Tornadus | Volador | 1,45 (1,47) | 458 | 2.606 | 8.230 | 1,39 | 1,29 | 1,13 | 15 | Tajo Aéreo, Vozarrón, Danza Pluma, Remolino |
| 8 | Blacephalon | Fuego/Fantasma | 1,45 (1,46) | 678 | 2.356 | 8.353 | 1,53 | 1,19 | 1,22 | 24 | Fuego Fatuo, Viento Aciago, Vozarrón, Voto Fuego |
| 9 | Reshiram | Dragón/Fuego | 1,45 (1,46) | 683 | 2.347 | 8.053 | 1,52 | 1,19 | 1,22 | 23 | Fuego Fatuo, Vozarrón, Voto Fuego, Onda Ígnea |
| 10 | Charizard | Fuego/Volador | 1,45 (1,46) | 602 | 2.419 | 8.197 | 1,30 | 1,06 | 1,37 | 24 | Tajo Aéreo, Fuego Fatuo, Vozarrón, Voto Fuego |
| 11 | Ferropolilla | Fuego/Veneno | 1,43 (1,45) | 750 | 2.262 | 8.006 | 1,47 | 1,15 | 1,25 | 23 | Fuego Fatuo, Bomba Ácida, Vozarrón, Voto Fuego |
| 12 | Typhlosion | Fuego | 1,43 (1,45) | 799 | 2.223 | 7.711 | 1,30 | 1,23 | 1,16 | 17 | Fuego Fatuo, Voto Fuego, Onda Ígnea, Balón Ígneo |
| 13 | Enamorus | Hada/Volador | 1,43 (1,87) | 430 | 2.588 | 8.487 | 1,44 | 1,16 | 1,23 | 22 | Tajo Aéreo, Cañón Floral, Vozarrón, Meteoros |
| 14 | Heatmor | Fuego | 1,42 (1,44) | 824 | 2.186 | 7.726 | 1,28 | 1,22 | 1,16 | 17 | Fuego Fatuo, Voto Fuego, Balón Ígneo, Onda Ígnea |
| 15 | Rampardos | Roca | 1,42 (1,44) | 515 | 2.458 | 8.403 | 1,61 | 1,66 | 0,86 | 15 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 16 | Volcarona | Bicho/Fuego | 1,42 (1,43) | 712 | 2.260 | 7.968 | 1,44 | 1,12 | 1,27 | 24 | Fuego Fatuo, Rayo Señal, Vozarrón, Voto Fuego |
| 17 | Chandelure | Fantasma/Fuego | 1,41 (1,43) | 640 | 2.316 | 8.206 | 1,50 | 1,17 | 1,21 | 24 | Fuego Fatuo, Viento Aciago, Vozarrón, Voto Fuego |
| 18 | Flareon | Fuego | 1,40 (1,41) | 845 | 2.130 | 7.477 | 1,42 | 1,22 | 1,15 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 19 | Heatran | Fuego/Acero | 1,40 (1,41) | 684 | 2.244 | 7.926 | 1,42 | 1,10 | 1,27 | 24 | Fuego Fatuo, Disparo Espejo, Vozarrón, Voto Fuego |
| 20 | Raikou | Eléctrico | 1,40 (1,41) | 403 | 2.559 | 9.183 | 1,33 | 1,24 | 1,13 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 21 | Arcanine | Fuego | 1,39 (1,41) | 835 | 2.125 | 7.565 | 1,31 | 1,22 | 1,15 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 22 | Ampharos | Eléctrico | 1,39 (1,40) | 398 | 2.544 | 9.153 | 1,33 | 1,24 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 23 | Volcanion | Fuego/Agua | 1,38 (1,40) | 647 | 2.244 | 7.845 | 1,42 | 1,12 | 1,24 | 24 | Fuego Fatuo, Torbellino, Vozarrón, Voto Fuego |
| 24 | Archeops | Roca/Volador | 1,38 (1,39) | 439 | 2.465 | 8.420 | 1,47 | 1,19 | 1,16 | 22 | Tajo Aéreo, Tumba Rocas, Rodar, Vozarrón |
| 25 | Chi-Yu | Siniestro/Fuego | 1,38 (1,39) | 639 | 2.243 | 7.721 | 1,44 | 1,12 | 1,23 | 23 | Fuego Fatuo, Vozarrón, Voto Fuego, Onda Ígnea |

### Los 25 más débiles

| # | Pokémon | Tipo | Valor (main) | Jefe | Marea | Grupo marea | Ataque | Stats | Lista | Ataques | Mejores 4 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 513 | Raticate | Normal | 0,76 (0,77) | 142 | 1.561 | 5.242 | 1,15 | 0,88 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 514 | Lopunny | Normal | 0,76 (0,77) | 131 | 1.580 | 5.468 | 1,12 | 0,87 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 515 | Shedinja | Bicho/Fantasma | 0,76 (0,70) | 437 | 1.168 | 4.667 | 1,20 | 0,81 | 0,94 | 22 | Homenaje Póstumo, Rayo Señal, Sombra Vil, Lengüetazo |
| 516 | Tauros | Normal | 0,76 (0,77) | 144 | 1.541 | 5.273 | 1,25 | 0,89 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 517 | Delcatty | Normal | 0,75 (0,76) | 131 | 1.569 | 5.392 | 1,06 | 0,86 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 518 | Foongus | Planta/Veneno | 0,75 (0,76) | 420 | 1.169 | 4.541 | 1,00 | 0,74 | 1,02 | 22 | Bomba Ácida, Veneno X, Vozarrón, Energibola |
| 519 | Kangaskhan | Normal | 0,75 (0,76) | 142 | 1.530 | 5.216 | 1,22 | 0,88 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 520 | Alomomola | Agua | 0,75 (0,76) | 199 | 1.403 | 5.057 | 1,11 | 0,85 | 0,88 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 521 | Furret | Normal | 0,75 (0,75) | 139 | 1.526 | 5.122 | 1,12 | 0,86 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 522 | Druddigon | Dragón | 0,74 (0,75) | 223 | 1.344 | 5.022 | 1,36 | 0,98 | 0,76 | 14 | Vozarrón, Ráfaga Escamas, Enfado, Golpe Cuerpo |
| 523 | Aegislash | Acero/Fantasma | 0,74 (0,73) | 282 | 1.262 | 4.772 | 0,97 | 0,72 | 1,03 | 22 | Disparo Espejo, Viento Aciago, Vozarrón, Homenaje Póstumo |
| 524 | Luvdisc | Agua | 0,73 (0,74) | 213 | 1.345 | 4.647 | 0,92 | 0,79 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 525 | Miltank | Normal | 0,73 (0,74) | 138 | 1.499 | 5.065 | 1,14 | 0,85 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 526 | Rellor | Bicho | 0,73 (0,74) | 348 | 1.184 | 4.132 | 0,97 | 0,75 | 0,97 | 15 | Rayo Señal, Vozarrón, Al Ataque, Pin Misil |
| 527 | Wobbuffet | Psíquico | 0,73 (0,74) | 336 | 1.191 | 4.228 | 0,88 | 0,77 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 528 | Bramblin | Planta/Fantasma | 0,72 (0,70) | 415 | 1.119 | 4.404 | 1,06 | 0,75 | 0,97 | 23 | Homenaje Póstumo, Viento Aciago, Vozarrón, Energibola |
| 529 | Ditto | Normal | 0,72 (0,73) | 125 | 1.495 | 5.102 | 0,96 | 0,82 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 530 | Cyclizar | Dragón/Normal | 0,72 (0,73) | 177 | 1.370 | 4.631 | 1,22 | 0,86 | 0,84 | 14 | Vozarrón, Meteoros, Golpe Cuerpo, Ráfaga Escamas |
| 531 | Bibarel | Normal/Agua | 0,72 (0,72) | 174 | 1.368 | 4.936 | 1,17 | 0,78 | 0,91 | 15 | Torbellino, Vozarrón, Cascada, Pistola Agua |
| 532 | Pyukumuku | Agua | 0,71 (0,71) | 184 | 1.328 | 4.783 | 1,03 | 0,80 | 0,89 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 533 | Yungoos | Normal | 0,69 (0,70) | 129 | 1.407 | 4.761 | 1,08 | 0,80 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 534 | Diggersby | Normal/Tierra | 0,68 (0,68) | 219 | 1.203 | 4.463 | 1,01 | 0,78 | 0,87 | 16 | Bucle Arena, Vozarrón, Huesomerang, Hueso Palo |
| 535 | Wishiwashi | Agua | 0,67 (0,68) | 189 | 1.240 | 4.301 | 0,84 | 0,72 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 536 | Shuckle | Bicho/Roca | 0,63 (0,64) | 203 | 1.131 | 4.057 | 0,76 | 0,62 | 1,02 | 22 | Tumba Rocas, Rayo Señal, Vozarrón, Rodar |
| 537 | Smeargle | Normal | 0,61 (0,61) | 105 | 1.261 | 4.305 | 0,81 | 0,69 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |

## Causa de los extremos

| Pokémon | Valor | Causa | Ataques que lo sostienen (veces en el equipo) |
|---|---|---|---|
| Xurkitree | 1,72 | estadísticas (buena: ataque 1,65) | Bola Voltio 75 %, Rayo Carga 75 %, Impactrueno 73 %, Onda Trueno 72 % |
| Moltres | 1,56 | lista (buena) | Voto Fuego 76 %, Tajo Aéreo 75 %, Fuego Fatuo 72 %, Vozarrón 67 % |
| Magmortar | 1,50 | estadísticas (buena: ataque 1,39) | Voto Fuego 74 %, Onda Ígnea 71 %, Balón Ígneo 71 %, Fuego Fatuo 68 % |
| Zapdos | 1,49 | lista (buena) | Tajo Aéreo 77 %, Bola Voltio 76 %, Onda Trueno 72 %, Rayo Carga 69 % |
| Thundurus | 1,49 | lista (buena) | Bola Voltio 76 %, Rayo Carga 75 %, Tajo Aéreo 74 %, Onda Trueno 72 % |
| Ho-Oh | 1,47 | lista (buena) | Balón Ígneo 70 %, Vozarrón 69 %, Fuego Fatuo 69 %, Tajo Aéreo 68 % |
| Tornadus | 1,45 | estadísticas (buena: ataque 1,39) | Remolino 77 %, Vozarrón 76 %, Danza Pluma 75 %, Tajo Aéreo 74 % |
| Blacephalon | 1,45 | las dos (buena / buena) | Viento Aciago 71 %, Voto Fuego 71 %, Vozarrón 70 %, Fuego Fatuo 68 % |
| Reshiram | 1,45 | las dos (buena / buena) | Vozarrón 74 %, Onda Ígnea 72 %, Voto Fuego 72 %, Fuego Fatuo 70 % |
| Charizard | 1,45 | lista (buena) | Fuego Fatuo 73 %, Voto Fuego 72 %, Vozarrón 69 %, Tajo Aéreo 68 % |
| Ferropolilla | 1,43 | lista (buena) | Fuego Fatuo 74 %, Bomba Ácida 74 %, Voto Fuego 74 %, Vozarrón 71 % |
| Typhlosion | 1,43 | las dos (buena / buena) | Fuego Fatuo 73 %, Balón Ígneo 72 %, Voto Fuego 69 %, Onda Ígnea 68 % |
| Enamorus | 1,43 | las dos (buena / buena) | Tajo Aéreo 74 %, Vozarrón 72 %, Meteoros 71 %, Cañón Floral 70 % |
| Heatmor | 1,42 | las dos (buena / buena) | Fuego Fatuo 73 %, Balón Ígneo 72 %, Onda Ígnea 72 %, Voto Fuego 68 % |
| Rampardos | 1,42 | estadísticas (buena: ataque 1,61) | Tumba Rocas 77 %, Lanzarrocas 75 %, Rodar 75 %, Avalancha 68 % |
| Aegislash | 0,74 | estadísticas (mala: ataque 0,97) | Viento Aciago 75 %, Disparo Espejo 74 %, Vozarrón 74 %, Homenaje Póstumo 70 % |
| Luvdisc | 0,73 | estadísticas (mala: ataque 0,92) | Pistola Agua 75 %, Torbellino 75 %, Vozarrón 72 %, Cascada 68 % |
| Miltank | 0,73 | las dos (mala / mala) | Vozarrón 100 %, Golpe Cuerpo 100 %, Meteoros 100 %, Ataque Rápido 100 % |
| Rellor | 0,73 | estadísticas (mala: ataque 0,97) | Rayo Señal 77 %, Al Ataque 76 %, Vozarrón 75 %, Pin Misil 70 % |
| Wobbuffet | 0,73 | estadísticas (mala: ataque 0,88) | Vozarrón 77 %, Bola Neblina 74 %, Géiser Fotónico 73 %, Confusión 72 % |
| Bramblin | 0,72 | estadísticas (mala: ataque 1,06) | Vozarrón 79 %, Energibola 77 %, Viento Aciago 74 %, Homenaje Póstumo 73 % |
| Ditto | 0,72 | las dos (mala / mala) | Vozarrón 100 %, Meteoros 100 %, Golpe Cuerpo 100 %, Hiperrayo 100 % |
| Cyclizar | 0,72 | las dos (mala / mala) | Vozarrón 73 %, Ráfaga Escamas 73 %, Golpe Cuerpo 72 %, Meteoros 70 % |
| Bibarel | 0,72 | estadísticas (mala: ataque 1,17) | Cascada 77 %, Vozarrón 74 %, Pistola Agua 73 %, Torbellino 72 % |
| Pyukumuku | 0,71 | estadísticas (mala: ataque 1,03) | Torbellino 77 %, Cascada 75 %, Pistola Agua 75 %, Vozarrón 74 % |
| Yungoos | 0,69 | las dos (mala / mala) | Vozarrón 100 %, Golpe Cuerpo 100 %, Meteoros 100 %, Ataque Rápido 100 % |
| Diggersby | 0,68 | estadísticas (mala: ataque 1,01) | Huesomerang 76 %, Bucle Arena 74 %, Vozarrón 72 %, Hueso Palo 70 % |
| Wishiwashi | 0,67 | estadísticas (mala: ataque 0,84) | Torbellino 76 %, Cascada 75 %, Vozarrón 73 %, Pistola Agua 69 % |
| Shuckle | 0,63 | estadísticas (mala: ataque 0,76) | Vozarrón 78 %, Rodar 76 %, Tumba Rocas 75 %, Rayo Señal 75 % |
| Smeargle | 0,61 | estadísticas (mala: ataque 0,81) | Vozarrón 100 %, Meteoros 100 %, Golpe Cuerpo 100 %, Hiperrayo 100 % |

## Por tipo

| Tipo | Pokémon finales | Valor mediano | Lista mediana | Mejor ataque del tipo (real) |
|---|---|---|---|---|
| Fuego | 42 | 1,31 | 1,23 | Fuego Fatuo → Infierno |
| Eléctrico | 40 | 1,21 | 1,12 | Rayo Carga → Rayo Fusión |
| Volador | 64 | 1,14 | 1,22 | Tajo Aéreo → Ataque Aéreo |
| Hielo | 29 | 1,07 | 1,06 | Rayo Aurora → Mundo Gélido |
| Lucha | 45 | 1,06 | 1,00 | Tajo Cruzado → Espada Santa |
| Roca | 38 | 1,04 | 0,94 | Tumba Rocas → Testarazo |
| Psíquico | 63 | 1,01 | 0,99 | Géiser Fotónico → Psicoataque |
| Hada | 39 | 1,01 | 1,02 | Cañón Floral → Luz Aniquiladora |
| Fantasma | 39 | 0,96 | 0,97 | Viento Aciago → Golpe Umbrío |
| Dragón | 43 | 0,95 | 0,96 | Enfado → Dracoflecha |
| Veneno | 39 | 0,95 | 1,01 | Bomba Ácida → Onda Tóxica |
| Agua | 80 | 0,94 | 0,93 | Torbellino → Salmuera |
| Bicho | 48 | 0,93 | 1,04 | Rayo Señal → Megacuerno |
| Siniestro | 39 | 0,93 | 0,95 | Golpe Bajo → Juego Sucio |
| Planta | 60 | 0,92 | 0,97 | Rayo Solar → Cuchilla Solar |
| Acero | 41 | 0,92 | 1,01 | Disparo Espejo → Metaláser |
| Tierra | 37 | 0,91 | 0,89 | Bucle Arena → Fuerza Equina |
| Normal | 65 | 0,82 | 0,87 | Vozarrón → Alboroto |

## Contraste con las partidas

| Partida (código de `main`) | Ataque | Real: daño/s activo | Modelo (marea × Pokémon) | real / modelo |
|---|---|---|---|---|
| Tapu Lele máximo (18:14, nv 56) | Cañón Floral → Luz Aniquiladora | 8.425 | 4.467 | 1,89 |
| Tapu Lele pocas (17:42, nv 48) | Cañón Floral → Luz Aniquiladora | 7.734 | 4.467 | 1,73 |
| Marshadow máximo (16:20, nv 40) | Homenaje Póstumo → Marcha Espectral | 720 | 873 | 0,82 |
| Marshadow máximo (16:20, nv 40) | Tajo Cruzado → Espada Santa | 1.210 | 727 | 1,66 |
| Marshadow máximo (16:20, nv 40) | Puño Dinámico → Megapuño | 732 | 873 | 0,84 |
| Marshadow máximo (16:20, nv 40) | Orbes Espectro → Rayo Umbrío | 609 | 519 | 1,17 |
| Regieleki casi máximo (15:05, nv 45) | Impactrueno → Trueno | 3.855 | 1.509 | 2,56 |
| Regieleki casi máximo (15:05, nv 45) | Rayo → Electrocañón | 2.995 | 1.322 | 2,27 |

Real / modelo: mediana 1,70, de 0,82 a 2,56.

| Bot (código de `main`) | Ataque | Real: daño/s activo | Modelo (marea × Pokémon) | real / modelo |
|---|---|---|---|---|
| bot Marshadow 0 (nv 40) | Homenaje Póstumo → Marcha Espectral | 627 | 873 | 0,72 |
| bot Marshadow 0 (nv 40) | Tajo Cruzado → Espada Santa | 1.066 | 727 | 1,47 |
| bot Marshadow 0 (nv 40) | Puño Dinámico → Megapuño | 466 | 873 | 0,53 |
| bot Marshadow 0 (nv 40) | Orbes Espectro → Rayo Umbrío | 1.395 | 519 | 2,69 |
| bot Marshadow 1 (nv 39) | Homenaje Póstumo → Marcha Espectral | 658 | 873 | 0,75 |
| bot Marshadow 1 (nv 39) | Tajo Cruzado → Espada Santa | 1.011 | 727 | 1,39 |
| bot Marshadow 1 (nv 39) | Orbes Espectro → Rayo Umbrío | 1.587 | 519 | 3,06 |
| bot Marshadow 1 (nv 39) | Puño Dinámico → Megapuño | 509 | 873 | 0,58 |
| bot Regieleki 0 (nv 43) | Impactrueno → Trueno | 1.397 | 1.509 | 0,93 |
| bot Regieleki 0 (nv 43) | Chispazo → Campo Eléctrico | 371 | 1.335 | 0,28 |
| bot Regieleki 0 (nv 43) | Bola Voltio → Chispa | 2.188 | 1.928 | 1,13 |
| bot Regieleki 0 (nv 43) | Rayo → Electrocañón | 1.292 | 1.322 | 0,98 |
| bot Regieleki 1 (nv 43) | Impactrueno → Trueno | 1.242 | 1.509 | 0,82 |
| bot Regieleki 1 (nv 43) | Chispazo → Campo Eléctrico | 485 | 1.335 | 0,36 |
| bot Regieleki 1 (nv 43) | Bola Voltio → Chispa | 2.124 | 1.928 | 1,10 |
| bot Regieleki 1 (nv 43) | Rayo → Electrocañón | 924 | 1.322 | 0,70 |
| bot Tapu Lele 0 (nv 43) | Cañón Floral → Luz Aniquiladora | 2.470 | 4.467 | 0,55 |
| bot Tapu Lele 1 (nv 45) | Cañón Floral → Luz Aniquiladora | 2.767 | 4.467 | 0,62 |
| bot Regirock 0 (nv 36) | Rodar → Romperrocas | 1.395 | 1.361 | 1,02 |
| bot Mewtwo 0 (nv 41) | Campo Psíquico → Onda Mental | 1.588 | 1.335 | 1,19 |
| bot Mewtwo 0 (nv 41) | Psicorrayo → Premonición | 867 | 1.127 | 0,77 |

Real / modelo: mediana 0,82, de 0,28 a 3,06.

| Bot (esta rama) | Ataque | Real: daño/s activo | Modelo (marea × Pokémon) | real / modelo |
|---|---|---|---|---|
| bot Marshadow 0 (nv 43) | Homenaje Póstumo → Marcha Espectral | 900 | 1.234 | 0,73 |
| bot Marshadow 0 (nv 43) | Orbes Espectro → Rayo Umbrío | 916 | 519 | 1,76 |
| bot Marshadow 0 (nv 43) | Tajo Cruzado → Espada Santa | 3.356 | 1.680 | 2,00 |
| bot Marshadow 0 (nv 43) | Puño Dinámico → Megapuño | 1.715 | 1.548 | 1,11 |
| bot Marshadow 1 (nv 42) | Homenaje Póstumo → Marcha Espectral | 600 | 1.234 | 0,49 |
| bot Marshadow 1 (nv 42) | Orbes Espectro → Rayo Umbrío | 1.358 | 519 | 2,62 |
| bot Marshadow 1 (nv 42) | Puño Dinámico → Megapuño | 1.245 | 1.548 | 0,80 |
| bot Marshadow 1 (nv 42) | Tajo Cruzado → Espada Santa | 3.926 | 1.680 | 2,34 |
| bot Marshadow 2 (nv 36) | Homenaje Póstumo → Marcha Espectral | 917 | 1.234 | 0,74 |
| bot Marshadow 2 (nv 36) | Puño Dinámico → Megapuño | 357 | 1.548 | 0,23 |
| bot Marshadow 2 (nv 36) | Tajo Cruzado → Espada Santa | 3.003 | 1.680 | 1,79 |
| bot Marshadow 3 (nv 43) | Homenaje Póstumo → Marcha Espectral | 1.096 | 1.234 | 0,89 |
| bot Marshadow 3 (nv 43) | Tajo Cruzado → Espada Santa | 2.335 | 1.680 | 1,39 |
| bot Marshadow 3 (nv 43) | Puño Dinámico → Megapuño | 1.001 | 1.548 | 0,65 |
| bot Marshadow 3 (nv 43) | Orbes Espectro → Rayo Umbrío | 1.196 | 519 | 2,30 |
| bot Tapu Lele 0 (nv 41) | Cañón Floral → Luz Aniquiladora | 1.848 | 2.133 | 0,87 |
| bot Tapu Lele 1 (nv 37) | Cañón Floral → Luz Aniquiladora | 1.148 | 2.133 | 0,54 |

Real / modelo: mediana 0,89, de 0,23 a 2,62.

## Ranking completo

| # | Pokémon | Tipo | Valor (main) | Jefe | Marea | Grupo marea | Ataque | Stats | Lista | Ataques | Mejores 4 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Xurkitree | Eléctrico | 1,72 (1,74) | 497 | 3.149 | 11.339 | 1,65 | 1,54 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 2 | Moltres | Fuego/Volador | 1,56 (1,58) | 642 | 2.611 | 8.857 | 1,39 | 1,13 | 1,37 | 24 | Tajo Aéreo, Fuego Fatuo, Vozarrón, Voto Fuego |
| 3 | Magmortar | Fuego | 1,50 (1,52) | 834 | 2.340 | 8.158 | 1,39 | 1,32 | 1,14 | 17 | Fuego Fatuo, Voto Fuego, Onda Ígnea, Balón Ígneo |
| 4 | Zapdos | Eléctrico/Volador | 1,49 (1,51) | 464 | 2.686 | 9.458 | 1,39 | 1,13 | 1,32 | 22 | Tajo Aéreo, Rayo Carga, Bola Voltio, Onda Trueno |
| 5 | Thundurus | Eléctrico/Volador | 1,49 (1,51) | 458 | 2.684 | 9.482 | 1,39 | 1,13 | 1,32 | 22 | Tajo Aéreo, Rayo Carga, Bola Voltio, Onda Trueno |
| 6 | Ho-Oh | Fuego/Volador | 1,47 (1,48) | 673 | 2.391 | 8.241 | 1,42 | 1,09 | 1,35 | 24 | Tajo Aéreo, Fuego Fatuo, Balón Ígneo, Vozarrón |
| 7 | Tornadus | Volador | 1,45 (1,47) | 458 | 2.606 | 8.230 | 1,39 | 1,29 | 1,13 | 15 | Tajo Aéreo, Vozarrón, Danza Pluma, Remolino |
| 8 | Blacephalon | Fuego/Fantasma | 1,45 (1,46) | 678 | 2.356 | 8.353 | 1,53 | 1,19 | 1,22 | 24 | Fuego Fatuo, Viento Aciago, Vozarrón, Voto Fuego |
| 9 | Reshiram | Dragón/Fuego | 1,45 (1,46) | 683 | 2.347 | 8.053 | 1,52 | 1,19 | 1,22 | 23 | Fuego Fatuo, Vozarrón, Voto Fuego, Onda Ígnea |
| 10 | Charizard | Fuego/Volador | 1,45 (1,46) | 602 | 2.419 | 8.197 | 1,30 | 1,06 | 1,37 | 24 | Tajo Aéreo, Fuego Fatuo, Vozarrón, Voto Fuego |
| 11 | Ferropolilla | Fuego/Veneno | 1,43 (1,45) | 750 | 2.262 | 8.006 | 1,47 | 1,15 | 1,25 | 23 | Fuego Fatuo, Bomba Ácida, Vozarrón, Voto Fuego |
| 12 | Typhlosion | Fuego | 1,43 (1,45) | 799 | 2.223 | 7.711 | 1,30 | 1,23 | 1,16 | 17 | Fuego Fatuo, Voto Fuego, Onda Ígnea, Balón Ígneo |
| 13 | Enamorus | Hada/Volador | 1,43 (1,87) | 430 | 2.588 | 8.487 | 1,44 | 1,16 | 1,23 | 22 | Tajo Aéreo, Cañón Floral, Vozarrón, Meteoros |
| 14 | Heatmor | Fuego | 1,42 (1,44) | 824 | 2.186 | 7.726 | 1,28 | 1,22 | 1,16 | 17 | Fuego Fatuo, Voto Fuego, Balón Ígneo, Onda Ígnea |
| 15 | Rampardos | Roca | 1,42 (1,44) | 515 | 2.458 | 8.403 | 1,61 | 1,66 | 0,86 | 15 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 16 | Volcarona | Bicho/Fuego | 1,42 (1,43) | 712 | 2.260 | 7.968 | 1,44 | 1,12 | 1,27 | 24 | Fuego Fatuo, Rayo Señal, Vozarrón, Voto Fuego |
| 17 | Chandelure | Fantasma/Fuego | 1,41 (1,43) | 640 | 2.316 | 8.206 | 1,50 | 1,17 | 1,21 | 24 | Fuego Fatuo, Viento Aciago, Vozarrón, Voto Fuego |
| 18 | Flareon | Fuego | 1,40 (1,41) | 845 | 2.130 | 7.477 | 1,42 | 1,22 | 1,15 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 19 | Heatran | Fuego/Acero | 1,40 (1,41) | 684 | 2.244 | 7.926 | 1,42 | 1,10 | 1,27 | 24 | Fuego Fatuo, Disparo Espejo, Vozarrón, Voto Fuego |
| 20 | Raikou | Eléctrico | 1,40 (1,41) | 403 | 2.559 | 9.183 | 1,33 | 1,24 | 1,13 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 21 | Arcanine | Fuego | 1,39 (1,41) | 835 | 2.125 | 7.565 | 1,31 | 1,22 | 1,15 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 22 | Ampharos | Eléctrico | 1,39 (1,40) | 398 | 2.544 | 9.153 | 1,33 | 1,24 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 23 | Volcanion | Fuego/Agua | 1,38 (1,40) | 647 | 2.244 | 7.845 | 1,42 | 1,12 | 1,24 | 24 | Fuego Fatuo, Torbellino, Vozarrón, Voto Fuego |
| 24 | Archeops | Roca/Volador | 1,38 (1,39) | 439 | 2.465 | 8.420 | 1,47 | 1,19 | 1,16 | 22 | Tajo Aéreo, Tumba Rocas, Rodar, Vozarrón |
| 25 | Chi-Yu | Siniestro/Fuego | 1,38 (1,39) | 639 | 2.243 | 7.721 | 1,44 | 1,12 | 1,23 | 23 | Fuego Fatuo, Vozarrón, Voto Fuego, Onda Ígnea |
| 26 | Kilowattrel | Eléctrico/Volador | 1,38 (1,39) | 424 | 2.480 | 8.751 | 1,28 | 1,04 | 1,33 | 22 | Tajo Aéreo, Rayo Carga, Bola Voltio, Onda Trueno |
| 27 | Armarouge | Fuego/Psíquico | 1,37 (1,39) | 686 | 2.189 | 7.743 | 1,39 | 1,10 | 1,25 | 25 | Fuego Fatuo, Géiser Fotónico, Vozarrón, Voto Fuego |
| 28 | Vikavolt | Bicho/Eléctrico | 1,37 (1,38) | 447 | 2.432 | 9.084 | 1,50 | 1,16 | 1,18 | 22 | Rayo Carga, Rayo Señal, Bola Voltio, Onda Trueno |
| 29 | Oricorio | Fuego/Volador | 1,37 (1,38) | 561 | 2.297 | 7.753 | 1,24 | 1,01 | 1,36 | 24 | Tajo Aéreo, Fuego Fatuo, Vozarrón, Voto Fuego |
| 30 | Glaceon | Hielo | 1,36 (1,37) | 379 | 2.507 | 8.460 | 1,42 | 1,36 | 1,00 | 15 | Rayo Aurora, Liofilización, Vozarrón, Rayo Hielo |
| 31 | Jolteon | Eléctrico | 1,35 (1,37) | 397 | 2.470 | 8.906 | 1,31 | 1,22 | 1,11 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 32 | Entei | Fuego | 1,34 (1,36) | 814 | 2.046 | 7.291 | 1,33 | 1,18 | 1,14 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 33 | Eelektross | Eléctrico | 1,34 (1,36) | 412 | 2.425 | 8.662 | 1,33 | 1,20 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 34 | Togekiss | Hada/Volador | 1,34 (1,76) | 395 | 2.443 | 8.077 | 1,36 | 1,09 | 1,23 | 22 | Tajo Aéreo, Cañón Floral, Vozarrón, Meteoros |
| 35 | Rayquaza | Dragón/Volador | 1,34 (1,36) | 390 | 2.450 | 7.961 | 1,52 | 1,21 | 1,11 | 21 | Tajo Aéreo, Vozarrón, Meteoros, Danza Pluma |
| 36 | Yveltal | Siniestro/Volador | 1,34 (1,35) | 528 | 2.267 | 7.524 | 1,42 | 1,13 | 1,18 | 21 | Tajo Aéreo, Golpe Bajo, Vozarrón, Paliza |
| 37 | Manectric | Eléctrico | 1,33 (1,35) | 393 | 2.425 | 8.696 | 1,28 | 1,19 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 38 | Blaziken | Fuego/Lucha | 1,32 (1,27) | 696 | 2.081 | 7.503 | 1,36 | 1,06 | 1,25 | 24 | Fuego Fatuo, Tajo Cruzado, Puño Dinámico, Balón Ígneo |
| 39 | Bellibolt | Eléctrico | 1,32 (1,34) | 382 | 2.419 | 8.706 | 1,27 | 1,18 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 40 | Delphox | Fuego/Psíquico | 1,32 (1,33) | 669 | 2.098 | 7.408 | 1,33 | 1,04 | 1,26 | 25 | Fuego Fatuo, Géiser Fotónico, Vozarrón, Voto Fuego |
| 41 | Yanmega | Bicho/Volador | 1,31 (1,33) | 462 | 2.290 | 7.616 | 1,34 | 1,06 | 1,24 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Meteoros |
| 42 | Zeraora | Eléctrico | 1,31 (1,33) | 409 | 2.358 | 8.437 | 1,32 | 1,18 | 1,11 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 43 | Regieleki | Eléctrico | 1,31 (1,32) | 401 | 2.358 | 8.411 | 1,25 | 1,17 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 44 | Emboar | Fuego/Lucha | 1,31 (1,24) | 685 | 2.059 | 7.436 | 1,38 | 1,04 | 1,26 | 24 | Fuego Fatuo, Tajo Cruzado, Puño Dinámico, Balón Ígneo |
| 45 | Mewtwo | Psíquico | 1,29 (1,31) | 601 | 2.103 | 7.467 | 1,55 | 1,35 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 46 | Electivire | Eléctrico | 1,29 (1,31) | 393 | 2.338 | 8.385 | 1,38 | 1,15 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 47 | Torkoal | Fuego | 1,29 (1,31) | 772 | 1.972 | 6.947 | 1,17 | 1,12 | 1,15 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 48 | Rapidash | Fuego | 1,28 (1,30) | 765 | 1.959 | 6.938 | 1,25 | 1,12 | 1,15 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 49 | Landorus | Tierra/Volador | 1,28 (1,30) | 420 | 2.273 | 7.671 | 1,39 | 1,10 | 1,17 | 23 | Tajo Aéreo, Bucle Arena, Vozarrón, Huesomerang |
| 50 | Luxray | Eléctrico | 1,28 (1,29) | 398 | 2.300 | 8.242 | 1,36 | 1,15 | 1,11 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 51 | Salazzle | Veneno/Fuego | 1,27 (1,29) | 659 | 2.013 | 7.173 | 1,31 | 1,01 | 1,25 | 23 | Fuego Fatuo, Bomba Ácida, Vozarrón, Voto Fuego |
| 52 | Houndoom | Siniestro/Fuego | 1,27 (1,29) | 625 | 2.037 | 7.022 | 1,31 | 1,02 | 1,25 | 23 | Fuego Fatuo, Vozarrón, Voto Fuego, Golpe Bajo |
| 53 | Gigalith | Roca | 1,27 (1,28) | 459 | 2.195 | 7.550 | 1,44 | 1,48 | 0,86 | 15 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 54 | Skeledirge | Fuego/Fantasma | 1,27 (1,28) | 597 | 2.050 | 7.233 | 1,31 | 1,02 | 1,24 | 24 | Fuego Fatuo, Viento Aciago, Vozarrón, Voto Fuego |
| 55 | Magnezone | Eléctrico/Acero | 1,26 (1,28) | 378 | 2.296 | 8.511 | 1,42 | 1,10 | 1,15 | 22 | Rayo Carga, Bola Voltio, Disparo Espejo, Onda Trueno |
| 56 | Ninetales | Fuego | 1,26 (1,28) | 734 | 1.943 | 6.861 | 1,15 | 1,10 | 1,15 | 17 | Fuego Fatuo, Voto Fuego, Balón Ígneo, Onda Ígnea |
| 57 | Pincurchin | Eléctrico | 1,26 (1,27) | 385 | 2.273 | 8.113 | 1,26 | 1,13 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 58 | Infernape | Fuego/Lucha | 1,26 (1,22) | 653 | 1.987 | 7.165 | 1,27 | 1,00 | 1,25 | 24 | Fuego Fatuo, Tajo Cruzado, Puño Dinámico, Balón Ígneo |
| 59 | Deoxys | Psíquico | 1,26 (1,27) | 590 | 2.038 | 7.243 | 1,52 | 1,33 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 60 | Boltund | Eléctrico | 1,26 (1,27) | 383 | 2.268 | 8.073 | 1,20 | 1,12 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 61 | Articuno | Hielo/Volador | 1,25 (1,27) | 376 | 2.270 | 7.766 | 1,22 | 1,01 | 1,24 | 22 | Tajo Aéreo, Rayo Aurora, Liofilización, Vozarrón |
| 62 | Raichu | Eléctrico | 1,25 (1,26) | 385 | 2.254 | 8.054 | 1,20 | 1,12 | 1,11 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 63 | Vanilluxe | Hielo | 1,25 (1,26) | 353 | 2.303 | 7.793 | 1,31 | 1,26 | 0,99 | 15 | Rayo Aurora, Liofilización, Vozarrón, Rayo Hielo |
| 64 | Talonflame | Fuego/Volador | 1,25 (1,26) | 563 | 2.044 | 7.020 | 1,15 | 0,91 | 1,36 | 24 | Tajo Aéreo, Fuego Fatuo, Balón Ígneo, Vozarrón |
| 65 | Celesteela | Acero/Volador | 1,25 (1,26) | 424 | 2.193 | 7.384 | 1,29 | 1,01 | 1,24 | 22 | Tajo Aéreo, Disparo Espejo, Vozarrón, Ala de Acero |
| 66 | Frosmoth | Hielo/Bicho | 1,25 (1,26) | 403 | 2.219 | 7.865 | 1,39 | 1,11 | 1,12 | 22 | Rayo Aurora, Rayo Señal, Liofilización, Vozarrón |
| 67 | Scovillain | Planta/Fuego | 1,25 (1,26) | 736 | 1.908 | 6.730 | 1,29 | 1,02 | 1,22 | 25 | Fuego Fatuo, Balón Ígneo, Vozarrón, Voto Fuego |
| 68 | Conkeldurr | Lucha | 1,25 (0,92) | 510 | 2.090 | 7.444 | 1,47 | 1,30 | 0,96 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 69 | Camerupt | Fuego/Tierra | 1,24 (1,25) | 612 | 1.988 | 6.919 | 1,28 | 1,01 | 1,23 | 25 | Fuego Fatuo, Vozarrón, Voto Fuego, Balón Ígneo |
| 70 | Honchkrow | Siniestro/Volador | 1,24 (1,25) | 508 | 2.072 | 6.909 | 1,39 | 1,06 | 1,17 | 21 | Tajo Aéreo, Golpe Bajo, Vozarrón, Paliza |
| 71 | Sigilyph | Psíquico/Volador | 1,23 (1,25) | 450 | 2.129 | 7.060 | 1,27 | 1,01 | 1,23 | 23 | Tajo Aéreo, Géiser Fotónico, Vozarrón, Meteoros |
| 72 | Victini | Psíquico/Fuego | 1,23 (1,24) | 676 | 1.913 | 6.904 | 1,25 | 0,99 | 1,24 | 25 | Fuego Fatuo, Géiser Fotónico, Balón Ígneo, Vozarrón |
| 73 | Masquerain | Bicho/Volador | 1,22 (1,24) | 432 | 2.133 | 7.088 | 1,25 | 0,99 | 1,24 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Meteoros |
| 74 | Plusle | Eléctrico | 1,22 (1,24) | 351 | 2.244 | 8.085 | 1,17 | 1,09 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 75 | Cinderace | Fuego | 1,22 (1,23) | 733 | 1.863 | 6.637 | 1,34 | 1,10 | 1,11 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 76 | Regice | Hielo | 1,22 (1,23) | 338 | 2.259 | 7.592 | 1,25 | 1,19 | 1,02 | 15 | Rayo Aurora, Liofilización, Vozarrón, Rayo Hielo |
| 77 | Machamp | Lucha | 1,22 (0,91) | 497 | 2.042 | 7.333 | 1,42 | 1,25 | 0,97 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 78 | Beautifly | Bicho/Volador | 1,22 (1,23) | 427 | 2.119 | 7.038 | 1,25 | 0,99 | 1,23 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Meteoros |
| 79 | Stonjourner | Roca | 1,21 (1,23) | 449 | 2.088 | 7.169 | 1,39 | 1,43 | 0,85 | 15 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 80 | Xerneas | Hada | 1,21 (1,84) | 347 | 2.218 | 7.328 | 1,42 | 1,24 | 0,98 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Meteoros |
| 81 | Mienshao | Lucha | 1,21 (0,93) | 481 | 2.040 | 7.424 | 1,39 | 1,22 | 0,99 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Vozarrón |
| 82 | Mothim | Bicho/Volador | 1,21 (1,22) | 426 | 2.100 | 6.991 | 1,22 | 0,97 | 1,24 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Meteoros |
| 83 | Xatu | Psíquico/Volador | 1,20 (1,22) | 440 | 2.076 | 6.858 | 1,22 | 0,97 | 1,24 | 23 | Tajo Aéreo, Géiser Fotónico, Vozarrón, Meteoros |
| 84 | Kyogre | Agua | 1,20 (1,21) | 355 | 2.185 | 7.449 | 1,52 | 1,29 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 85 | Alakazam | Psíquico | 1,20 (1,21) | 554 | 1.952 | 6.921 | 1,44 | 1,25 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 86 | Pelarena | Eléctrico/Tierra | 1,20 (1,21) | 338 | 2.206 | 8.130 | 1,37 | 1,06 | 1,13 | 23 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 87 | Zekrom | Dragón/Eléctrico | 1,19 (1,21) | 361 | 2.165 | 7.901 | 1,52 | 1,07 | 1,12 | 21 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 88 | Ferrosaco | Hielo/Agua | 1,19 (1,21) | 321 | 2.224 | 7.847 | 1,38 | 1,11 | 1,07 | 22 | Rayo Aurora, Torbellino, Liofilización, Vozarrón |
| 89 | Pheromosa | Bicho/Lucha | 1,19 (1,11) | 518 | 1.974 | 7.608 | 1,45 | 1,09 | 1,10 | 22 | Rayo Señal, Tajo Cruzado, Puño Dinámico, Vozarrón |
| 90 | Electrode | Eléctrico | 1,19 (1,21) | 349 | 2.176 | 7.787 | 1,14 | 1,06 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 91 | Emolga | Eléctrico/Volador | 1,19 (1,20) | 368 | 2.144 | 7.564 | 1,11 | 0,90 | 1,32 | 22 | Tajo Aéreo, Rayo Carga, Bola Voltio, Onda Trueno |
| 92 | Centiskorch | Fuego/Bicho | 1,18 (1,20) | 659 | 1.840 | 6.695 | 1,33 | 0,96 | 1,23 | 24 | Fuego Fatuo, Rayo Señal, Balón Ígneo, Vozarrón |
| 93 | Espeon | Psíquico | 1,18 (1,19) | 551 | 1.920 | 6.810 | 1,42 | 1,24 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 94 | Lugia | Psíquico/Volador | 1,18 (1,19) | 425 | 2.044 | 6.774 | 1,20 | 0,95 | 1,24 | 23 | Tajo Aéreo, Géiser Fotónico, Vozarrón, Meteoros |
| 95 | Cryogonal | Hielo | 1,18 (1,19) | 328 | 2.174 | 7.315 | 1,22 | 1,17 | 1,01 | 15 | Rayo Aurora, Liofilización, Vozarrón, Rayo Hielo |
| 96 | Jynx | Hielo/Psíquico | 1,17 (1,19) | 377 | 2.093 | 7.442 | 1,33 | 1,06 | 1,10 | 23 | Rayo Aurora, Géiser Fotónico, Liofilización, Vozarrón |
| 97 | Toxtricity | Eléctrico/Veneno | 1,17 (1,19) | 366 | 2.107 | 7.709 | 1,33 | 1,03 | 1,14 | 21 | Rayo Carga, Bola Voltio, Onda Trueno, Bomba Ácida |
| 98 | Hatterene | Psíquico/Hada | 1,17 (1,70) | 377 | 2.092 | 7.270 | 1,45 | 1,12 | 1,05 | 23 | Cañón Floral, Géiser Fotónico, Vozarrón, Meteoros |
| 99 | Sawk | Lucha | 1,17 (0,86) | 487 | 1.960 | 6.928 | 1,39 | 1,23 | 0,95 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 100 | Zamazenta | Lucha | 1,17 (0,89) | 478 | 1.970 | 7.146 | 1,36 | 1,21 | 0,97 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 101 | Salamence | Dragón/Volador | 1,17 (1,18) | 346 | 2.134 | 6.944 | 1,44 | 1,05 | 1,12 | 21 | Tajo Aéreo, Vozarrón, Meteoros, Danza Pluma |
| 102 | Vivillon | Bicho/Volador | 1,17 (1,18) | 414 | 2.030 | 6.754 | 1,20 | 0,95 | 1,23 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Meteoros |
| 103 | Necrozma | Psíquico | 1,17 (1,18) | 543 | 1.897 | 6.713 | 1,40 | 1,22 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 104 | Lycanroc | Roca | 1,17 (1,18) | 429 | 2.010 | 6.952 | 1,33 | 1,37 | 0,85 | 15 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 105 | Magcargo | Fuego/Roca | 1,16 (1,18) | 523 | 1.911 | 6.728 | 1,20 | 0,92 | 1,26 | 24 | Fuego Fatuo, Tumba Rocas, Vozarrón, Voto Fuego |
| 106 | Pelipper | Agua/Volador | 1,16 (1,18) | 361 | 2.095 | 6.932 | 1,22 | 0,97 | 1,20 | 22 | Tajo Aéreo, Torbellino, Vozarrón, Pistola Agua |
| 107 | Butterfree | Bicho/Volador | 1,16 (1,17) | 410 | 2.022 | 6.727 | 1,20 | 0,95 | 1,23 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Meteoros |
| 108 | Arctozolt | Eléctrico/Hielo | 1,16 (1,17) | 316 | 2.155 | 7.843 | 1,25 | 0,97 | 1,20 | 22 | Rayo Aurora, Rayo Carga, Bola Voltio, Onda Trueno |
| 109 | Beheeyem | Psíquico | 1,16 (1,17) | 533 | 1.885 | 6.670 | 1,39 | 1,21 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 110 | Turtonator | Fuego/Dragón | 1,16 (1,17) | 579 | 1.846 | 6.357 | 1,20 | 0,94 | 1,23 | 23 | Fuego Fatuo, Vozarrón, Voto Fuego, Balón Ígneo |
| 111 | Azelf | Psíquico | 1,16 (1,17) | 542 | 1.875 | 6.677 | 1,39 | 1,22 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 112 | Tapu Lele | Psíquico/Hada | 1,15 (1,70) | 352 | 2.085 | 7.280 | 1,42 | 1,10 | 1,05 | 23 | Cañón Floral, Géiser Fotónico, Vozarrón, Meteoros |
| 113 | Kyurem | Dragón/Hielo | 1,15 (1,17) | 311 | 2.149 | 7.443 | 1,42 | 1,15 | 1,00 | 21 | Rayo Aurora, Liofilización, Vozarrón, Meteoros |
| 114 | Minun | Eléctrico | 1,15 (1,16) | 330 | 2.113 | 7.629 | 1,11 | 1,03 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 115 | Hariyama | Lucha | 1,15 (0,85) | 474 | 1.930 | 6.869 | 1,36 | 1,21 | 0,95 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 116 | Swanna | Agua/Volador | 1,15 (1,16) | 357 | 2.067 | 6.862 | 1,18 | 0,94 | 1,22 | 22 | Tajo Aéreo, Torbellino, Vozarrón, Pistola Agua |
| 117 | Hawlucha | Lucha/Volador | 1,15 (1,06) | 400 | 2.005 | 6.947 | 1,21 | 0,92 | 1,25 | 22 | Tajo Aéreo, Tajo Cruzado, Puño Dinámico, Vozarrón |
| 118 | Grapploct | Lucha | 1,15 (0,87) | 468 | 1.926 | 6.965 | 1,35 | 1,19 | 0,96 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 119 | Groudon | Tierra | 1,14 (1,16) | 480 | 1.906 | 7.046 | 1,52 | 1,42 | 0,81 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Púas |
| 120 | Terrakion | Roca/Lucha | 1,14 (1,05) | 392 | 2.004 | 7.067 | 1,41 | 1,16 | 0,98 | 22 | Tumba Rocas, Tajo Cruzado, Puño Dinámico, Rodar |
| 121 | Reuniclus | Psíquico | 1,14 (1,15) | 526 | 1.862 | 6.608 | 1,39 | 1,21 | 0,94 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 122 | Passimian | Lucha | 1,14 (0,84) | 468 | 1.915 | 6.818 | 1,36 | 1,20 | 0,95 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 123 | Ferropaladín | Hada/Lucha | 1,14 (1,54) | 365 | 2.035 | 7.627 | 1,42 | 1,07 | 1,06 | 22 | Tajo Cruzado, Cañón Floral, Puño Dinámico, Vozarrón |
| 124 | Drifblim | Fantasma/Volador | 1,14 (1,12) | 382 | 2.009 | 6.728 | 1,20 | 0,94 | 1,22 | 22 | Tajo Aéreo, Viento Aciago, Vozarrón, Homenaje Póstumo |
| 125 | Hitmonlee | Lucha | 1,14 (0,84) | 467 | 1.908 | 6.789 | 1,36 | 1,20 | 0,95 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 126 | Incineroar | Fuego/Siniestro | 1,14 (1,15) | 686 | 1.733 | 6.263 | 1,33 | 0,97 | 1,17 | 23 | Fuego Fatuo, Golpe Bajo, Balón Ígneo, Vozarrón |
| 127 | Magearna | Acero/Hada | 1,14 (1,64) | 328 | 2.079 | 7.264 | 1,42 | 1,08 | 1,05 | 22 | Cañón Floral, Disparo Espejo, Vozarrón, Meteoros |
| 128 | Heliolisk | Eléctrico/Normal | 1,13 (1,15) | 320 | 2.087 | 7.719 | 1,30 | 1,01 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 129 | Hoopa | Psíquico/Fantasma | 1,13 (1,13) | 462 | 1.900 | 7.111 | 1,52 | 1,13 | 1,00 | 23 | Géiser Fotónico, Viento Aciago, Vozarrón, Homenaje Póstumo |
| 130 | Gardevoir | Psíquico/Hada | 1,13 (1,68) | 337 | 2.050 | 7.122 | 1,39 | 1,07 | 1,05 | 23 | Cañón Floral, Géiser Fotónico, Vozarrón, Meteoros |
| 131 | Alcremie | Hada | 1,13 (1,72) | 339 | 2.043 | 6.723 | 1,31 | 1,15 | 0,98 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Meteoros |
| 132 | Florges | Hada | 1,13 (1,70) | 347 | 2.030 | 6.711 | 1,32 | 1,16 | 0,97 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Meteoros |
| 133 | Cursola | Fantasma | 1,12 (1,07) | 362 | 1.999 | 7.125 | 1,50 | 1,19 | 0,94 | 15 | Viento Aciago, Vozarrón, Homenaje Póstumo, Meteoros |
| 134 | Pansear | Fuego | 1,12 (1,13) | 668 | 1.712 | 6.021 | 0,99 | 0,95 | 1,18 | 17 | Fuego Fatuo, Balón Ígneo, Voto Fuego, Onda Ígnea |
| 135 | Dragonite | Dragón/Volador | 1,12 (1,13) | 320 | 2.057 | 6.784 | 1,44 | 1,00 | 1,12 | 21 | Tajo Aéreo, Vozarrón, Meteoros, Golpe Cuerpo |
| 136 | Aerodactyl | Roca/Volador | 1,12 (1,13) | 390 | 1.955 | 6.711 | 1,28 | 1,02 | 1,10 | 22 | Tajo Aéreo, Tumba Rocas, Rodar, Lanzarrocas |
| 137 | Galvantula | Bicho/Eléctrico | 1,12 (1,13) | 367 | 1.983 | 7.404 | 1,23 | 0,95 | 1,18 | 22 | Rayo Carga, Rayo Señal, Bola Voltio, Onda Trueno |
| 138 | Rhyperior | Tierra/Roca | 1,12 (1,13) | 344 | 2.013 | 7.050 | 1,47 | 1,25 | 0,90 | 23 | Tumba Rocas, Bucle Arena, Huesomerang, Rodar |
| 139 | Sylveon | Hada | 1,12 (1,67) | 341 | 2.014 | 6.668 | 1,31 | 1,15 | 0,97 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Meteoros |
| 140 | Vespiquen | Bicho/Volador | 1,12 (1,13) | 395 | 1.941 | 6.478 | 1,14 | 0,90 | 1,24 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Meteoros |
| 141 | Ferropúas | Roca/Eléctrico | 1,11 (1,12) | 318 | 2.027 | 7.211 | 1,44 | 1,06 | 1,04 | 22 | Tumba Rocas, Rayo Carga, Bola Voltio, Rueda Aural |
| 142 | Garganacl | Roca | 1,10 (1,12) | 397 | 1.911 | 6.599 | 1,25 | 1,28 | 0,86 | 15 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 143 | Cramorant | Volador/Agua | 1,10 (1,11) | 340 | 1.983 | 6.600 | 1,17 | 0,93 | 1,18 | 22 | Tajo Aéreo, Torbellino, Vozarrón, Pistola Agua |
| 144 | Mantine | Agua/Volador | 1,10 (1,11) | 346 | 1.974 | 6.514 | 1,14 | 0,91 | 1,21 | 22 | Tajo Aéreo, Torbellino, Vozarrón, Pistola Agua |
| 145 | Noivern | Volador/Dragón | 1,10 (1,11) | 332 | 1.991 | 6.358 | 1,23 | 0,98 | 1,12 | 21 | Tajo Aéreo, Vozarrón, Meteoros, Danza Pluma |
| 146 | Melenaleteo | Fantasma/Hada | 1,10 (1,63) | 276 | 2.081 | 7.224 | 1,44 | 1,09 | 1,01 | 22 | Cañón Floral, Viento Aciago, Vozarrón, Meteoros |
| 147 | Ferropalmas | Lucha/Eléctrico | 1,10 (0,94) | 445 | 1.846 | 6.812 | 1,47 | 1,05 | 1,04 | 22 | Tajo Cruzado, Puño Dinámico, Rayo Carga, Rueda Aural |
| 148 | Tapu Koko | Eléctrico/Hada | 1,10 (1,53) | 278 | 2.077 | 7.796 | 1,33 | 0,96 | 1,15 | 22 | Rayo Carga, Bola Voltio, Cañón Floral, Onda Trueno |
| 149 | Inteleon | Agua | 1,10 (1,11) | 322 | 1.999 | 6.859 | 1,39 | 1,18 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 150 | Ceruledge | Fuego/Fantasma | 1,10 (1,08) | 693 | 1.649 | 6.061 | 1,39 | 0,95 | 1,16 | 24 | Fuego Fatuo, Balón Ígneo, Homenaje Póstumo, Sombra Vil |
| 151 | Regirock | Roca | 1,10 (1,11) | 397 | 1.894 | 6.550 | 1,25 | 1,28 | 0,85 | 15 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 152 | Crabominable | Lucha/Hielo | 1,09 (0,95) | 409 | 1.878 | 6.881 | 1,43 | 1,04 | 1,06 | 22 | Tajo Cruzado, Rayo Aurora, Puño Dinámico, Patada Giro |
| 153 | Primarina | Agua/Hada | 1,09 (1,59) | 262 | 2.099 | 7.292 | 1,39 | 1,07 | 1,02 | 22 | Cañón Floral, Torbellino, Vozarrón, Pistola Agua |
| 154 | Tyranitar | Roca/Siniestro | 1,09 (1,10) | 423 | 1.860 | 6.717 | 1,44 | 1,19 | 0,91 | 21 | Tumba Rocas, Golpe Bajo, Rodar, Lanzarrocas |
| 155 | Sudowoodo | Roca | 1,09 (1,10) | 404 | 1.879 | 6.451 | 1,25 | 1,29 | 0,85 | 15 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 156 | Lunala | Psíquico/Fantasma | 1,09 (1,09) | 451 | 1.828 | 6.853 | 1,45 | 1,08 | 1,01 | 23 | Géiser Fotónico, Viento Aciago, Vozarrón, Homenaje Póstumo |
| 157 | Darmanitan | Fuego | 1,09 (1,10) | 688 | 1.644 | 5.896 | 1,47 | 1,12 | 0,98 | 17 | Fuego Fatuo, Balón Ígneo, Nitrocarga, Voto Fuego |
| 158 | Glalie | Hielo | 1,09 (1,10) | 298 | 2.027 | 6.897 | 1,14 | 1,09 | 1,00 | 15 | Rayo Aurora, Liofilización, Vozarrón, Rayo Hielo |
| 159 | Chatot | Normal/Volador | 1,09 (1,10) | 326 | 1.975 | 6.316 | 1,21 | 0,96 | 1,13 | 15 | Tajo Aéreo, Vozarrón, Meteoros, Danza Pluma |
| 160 | Delibird | Hielo/Volador | 1,09 (1,10) | 325 | 1.976 | 6.750 | 1,06 | 0,88 | 1,24 | 22 | Tajo Aéreo, Rayo Aurora, Liofilización, Vozarrón |
| 161 | Crobat | Veneno/Volador | 1,09 (1,10) | 495 | 1.779 | 6.047 | 1,20 | 0,87 | 1,24 | 21 | Tajo Aéreo, Veneno X, Bomba Ácida, Vozarrón |
| 162 | Swoobat | Psíquico/Volador | 1,09 (1,10) | 396 | 1.880 | 6.207 | 1,12 | 0,89 | 1,23 | 23 | Tajo Aéreo, Géiser Fotónico, Vozarrón, Meteoros |
| 163 | Reptalada | Bicho/Lucha | 1,09 (0,93) | 454 | 1.812 | 6.771 | 1,44 | 1,05 | 1,04 | 22 | Tajo Cruzado, Puño Dinámico, Rayo Señal, Patada Giro |
| 164 | Spectrier | Fantasma | 1,09 (1,05) | 352 | 1.931 | 6.751 | 1,50 | 1,16 | 0,94 | 15 | Viento Aciago, Vozarrón, Homenaje Póstumo, Meteoros |
| 165 | Dialga | Acero/Dragón | 1,08 (1,09) | 364 | 1.909 | 6.856 | 1,52 | 1,11 | 0,98 | 21 | Disparo Espejo, Vozarrón, Meteoros, Fiebre Dorada |
| 166 | Glastrier | Hielo | 1,08 (1,09) | 310 | 1.986 | 6.995 | 1,50 | 1,15 | 0,94 | 15 | Rayo Aurora, Chuzos, Liofilización, Vozarrón |
| 167 | Genesect | Bicho/Acero | 1,08 (1,09) | 452 | 1.807 | 6.781 | 1,36 | 1,00 | 1,08 | 22 | Rayo Señal, Disparo Espejo, Vozarrón, Ala de Acero |
| 168 | Hitmonchan | Lucha | 1,08 (0,80) | 442 | 1.811 | 6.485 | 1,28 | 1,12 | 0,96 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 169 | Munkidori | Veneno/Psíquico | 1,08 (1,09) | 505 | 1.751 | 6.557 | 1,42 | 1,04 | 1,03 | 22 | Géiser Fotónico, Bomba Ácida, Vozarrón, Veneno X |
| 170 | Musharna | Psíquico | 1,08 (1,09) | 498 | 1.754 | 6.216 | 1,29 | 1,12 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 171 | Clawitzer | Agua | 1,07 (1,09) | 325 | 1.944 | 6.614 | 1,36 | 1,16 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 172 | Urshifu | Lucha/Siniestro | 1,07 (0,91) | 506 | 1.728 | 6.293 | 1,42 | 1,08 | 0,99 | 21 | Tajo Cruzado, Puño Dinámico, Golpe Bajo, Patada Giro |
| 173 | Walrein | Hielo/Agua | 1,07 (1,08) | 287 | 1.988 | 6.999 | 1,22 | 0,98 | 1,08 | 22 | Rayo Aurora, Torbellino, Liofilización, Vozarrón |
| 174 | Seviper | Veneno | 1,07 (1,08) | 659 | 1.613 | 5.949 | 1,25 | 1,08 | 0,99 | 14 | Bomba Ácida, Veneno X, Vozarrón, Picotazo Veneno |
| 175 | Sneasler | Lucha/Veneno | 1,06 (0,90) | 547 | 1.689 | 6.022 | 1,42 | 1,07 | 0,99 | 21 | Tajo Cruzado, Puño Dinámico, Veneno X, Patada Giro |
| 176 | Palkia | Agua/Dragón | 1,06 (1,08) | 299 | 1.961 | 6.837 | 1,52 | 1,14 | 0,93 | 21 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 177 | Rotom | Eléctrico/Fantasma | 1,06 (1,08) | 303 | 1.955 | 7.190 | 1,22 | 0,95 | 1,12 | 22 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 178 | Gorebyss | Agua | 1,06 (1,08) | 305 | 1.951 | 6.691 | 1,33 | 1,14 | 0,94 | 15 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 179 | Aurorus | Roca/Hielo | 1,06 (1,08) | 270 | 2.011 | 7.153 | 1,24 | 1,00 | 1,06 | 22 | Rayo Aurora, Tumba Rocas, Liofilización, Vozarrón |
| 180 | Colmilargo | Tierra/Lucha | 1,06 (0,91) | 434 | 1.783 | 6.581 | 1,42 | 1,11 | 0,96 | 23 | Tajo Cruzado, Puño Dinámico, Bucle Arena, Huesomerang |
| 181 | Mesprit | Psíquico | 1,06 (1,07) | 481 | 1.737 | 6.159 | 1,28 | 1,11 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 182 | Marshadow | Lucha/Fantasma | 1,06 (0,86) | 467 | 1.748 | 6.644 | 1,39 | 1,03 | 1,03 | 22 | Tajo Cruzado, Puño Dinámico, Homenaje Póstumo, Viento Aciago |
| 183 | Tropius | Planta/Volador | 1,06 (1,07) | 389 | 1.827 | 5.986 | 1,10 | 0,86 | 1,23 | 23 | Tajo Aéreo, Vozarrón, Energibola, Rayo Solar |
| 184 | Porygon-Z | Normal | 1,06 (1,07) | 193 | 2.175 | 7.269 | 1,44 | 1,21 | 0,88 | 8 | Vozarrón, Meteoros, Hiperrayo, Golpe Cuerpo |
| 185 | Eternatus | Veneno/Dragón | 1,06 (1,07) | 514 | 1.701 | 6.094 | 1,50 | 1,07 | 0,99 | 20 | Bomba Ácida, Vozarrón, Veneno X, Meteoros |
| 186 | Litleo | Fuego/Normal | 1,06 (1,07) | 502 | 1.708 | 5.841 | 1,10 | 0,86 | 1,23 | 17 | Fuego Fatuo, Vozarrón, Voto Fuego, Onda Ígnea |
| 187 | Armaldo | Roca/Bicho | 1,06 (1,07) | 396 | 1.811 | 6.327 | 1,39 | 1,11 | 0,95 | 22 | Tumba Rocas, Rayo Señal, Rodar, Lanzarrocas |
| 188 | Beartic | Hielo | 1,05 (1,07) | 291 | 1.951 | 6.911 | 1,42 | 1,10 | 0,96 | 15 | Rayo Aurora, Liofilización, Chuzos, Vozarrón |
| 189 | Buzzwole | Bicho/Lucha | 1,05 (0,84) | 453 | 1.744 | 6.332 | 1,46 | 1,05 | 1,01 | 22 | Tajo Cruzado, Puño Dinámico, Rayo Señal, Patada Giro |
| 190 | Polteageist | Fantasma | 1,05 (1,01) | 351 | 1.858 | 6.523 | 1,44 | 1,12 | 0,94 | 15 | Viento Aciago, Vozarrón, Homenaje Póstumo, Meteoros |
| 191 | Pawmot | Eléctrico/Lucha | 1,05 (0,98) | 366 | 1.839 | 6.982 | 1,33 | 0,94 | 1,11 | 22 | Tajo Cruzado, Rayo Carga, Puño Dinámico, Bola Voltio |
| 192 | Exeggutor | Planta/Psíquico | 1,05 (1,06) | 489 | 1.705 | 6.259 | 1,39 | 1,04 | 1,01 | 24 | Géiser Fotónico, Vozarrón, Energibola, Rayo Solar |
| 193 | Kleavor | Bicho/Roca | 1,05 (1,06) | 408 | 1.783 | 6.233 | 1,44 | 1,19 | 0,88 | 22 | Tumba Rocas, Rodar, Lanzarrocas, Rayo Señal |
| 194 | Lucario | Lucha/Acero | 1,05 (0,98) | 405 | 1.786 | 6.870 | 1,33 | 0,99 | 1,06 | 22 | Tajo Cruzado, Disparo Espejo, Puño Dinámico, Vozarrón |
| 195 | Hitmontop | Lucha | 1,05 (0,77) | 430 | 1.758 | 6.292 | 1,22 | 1,08 | 0,97 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Gancho Alto |
| 196 | Stakataka | Roca/Acero | 1,05 (1,06) | 372 | 1.823 | 6.336 | 1,42 | 1,19 | 0,88 | 22 | Tumba Rocas, Rodar, Ala de Acero, Lanzarrocas |
| 197 | Koraidon | Lucha/Dragón | 1,05 (0,84) | 410 | 1.778 | 6.588 | 1,44 | 1,07 | 0,98 | 21 | Tajo Cruzado, Puño Dinámico, Patada Giro, Vozarrón |
| 198 | Mew | Psíquico | 1,05 (1,06) | 487 | 1.701 | 6.036 | 1,25 | 1,09 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 199 | Abomasnow | Planta/Hielo | 1,05 (1,06) | 345 | 1.853 | 6.468 | 1,21 | 0,97 | 1,08 | 23 | Rayo Aurora, Liofilización, Vozarrón, Energibola |
| 200 | Noctowl | Normal/Volador | 1,04 (1,06) | 309 | 1.900 | 6.078 | 1,17 | 0,93 | 1,13 | 15 | Tajo Aéreo, Vozarrón, Meteoros, Danza Pluma |
| 201 | Minior | Roca/Volador | 1,04 (1,05) | 318 | 1.882 | 6.283 | 1,03 | 0,87 | 1,20 | 22 | Tajo Aéreo, Tumba Rocas, Vozarrón, Rodar |
| 202 | Gholdengo | Acero/Fantasma | 1,04 (1,05) | 352 | 1.830 | 6.784 | 1,43 | 1,05 | 0,99 | 22 | Disparo Espejo, Viento Aciago, Vozarrón, Meteoros |
| 203 | Pangoro | Lucha/Siniestro | 1,04 (0,89) | 495 | 1.679 | 6.128 | 1,38 | 1,05 | 0,99 | 21 | Tajo Cruzado, Puño Dinámico, Golpe Bajo, Patada Giro |
| 204 | Vaporeon | Agua | 1,04 (1,05) | 311 | 1.884 | 6.419 | 1,31 | 1,12 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 205 | Clefable | Hada | 1,04 (1,57) | 304 | 1.894 | 6.245 | 1,22 | 1,07 | 0,97 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Meteoros |
| 206 | Breloom | Planta/Lucha | 1,04 (0,83) | 505 | 1.668 | 5.936 | 1,42 | 1,07 | 0,97 | 23 | Tajo Cruzado, Puño Dinámico, Patada Giro, Hoja Afilada |
| 207 | Mudsdale | Tierra | 1,03 (1,05) | 439 | 1.720 | 6.329 | 1,39 | 1,29 | 0,80 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Púas |
| 208 | Dedenne | Eléctrico/Hada | 1,03 (1,45) | 262 | 1.954 | 7.301 | 1,15 | 0,90 | 1,15 | 22 | Rayo Carga, Bola Voltio, Cañón Floral, Onda Trueno |
| 209 | Glimmora | Roca/Veneno | 1,03 (1,04) | 423 | 1.734 | 6.383 | 1,42 | 1,01 | 1,03 | 21 | Bomba Ácida, Vozarrón, Tumba Rocas, Meteoros |
| 210 | Solgaleo | Psíquico/Acero | 1,03 (1,04) | 405 | 1.750 | 6.658 | 1,45 | 1,00 | 1,03 | 23 | Disparo Espejo, Géiser Fotónico, Vozarrón, Ala de Acero |
| 211 | Latios | Dragón/Psíquico | 1,03 (1,04) | 432 | 1.717 | 6.107 | 1,42 | 1,07 | 0,96 | 22 | Géiser Fotónico, Vozarrón, Meteoros, Confusión |
| 212 | Absol | Siniestro | 1,03 (1,04) | 596 | 1.581 | 6.098 | 1,42 | 1,24 | 0,83 | 14 | Golpe Bajo, Paliza, Tajo Umbrío, Vozarrón |
| 213 | Samurott | Agua | 1,03 (1,04) | 301 | 1.875 | 6.521 | 1,29 | 1,11 | 0,92 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 214 | Gallade | Psíquico/Lucha | 1,03 (0,84) | 430 | 1.715 | 6.338 | 1,39 | 1,01 | 1,02 | 23 | Tajo Cruzado, Puño Dinámico, Géiser Fotónico, Patada Giro |
| 215 | Quaquaval | Agua/Lucha | 1,03 (0,87) | 361 | 1.790 | 6.776 | 1,36 | 1,00 | 1,03 | 22 | Tajo Cruzado, Puño Dinámico, Torbellino, Vozarrón |
| 216 | Roserade | Planta/Veneno | 1,02 (1,04) | 515 | 1.633 | 6.070 | 1,39 | 1,01 | 1,02 | 22 | Bomba Ácida, Vozarrón, Energibola, Rayo Solar |
| 217 | Melmetal | Acero | 1,02 (1,04) | 397 | 1.743 | 6.669 | 1,49 | 1,12 | 0,91 | 15 | Disparo Espejo, Ala de Acero, Puño Meteoro, Vozarrón |
| 218 | Octillery | Agua | 1,02 (1,04) | 295 | 1.876 | 6.535 | 1,28 | 1,11 | 0,92 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 219 | Banette | Fantasma | 1,02 (0,92) | 528 | 1.618 | 6.444 | 1,33 | 1,11 | 0,92 | 15 | Homenaje Póstumo, Viento Aciago, Sombra Vil, Vozarrón |
| 220 | Gengar | Fantasma/Veneno | 1,02 (1,03) | 450 | 1.683 | 6.355 | 1,42 | 1,03 | 1,00 | 21 | Bomba Ácida, Viento Aciago, Vozarrón, Meteoros |
| 221 | Mamoswine | Hielo/Tierra | 1,02 (1,03) | 346 | 1.795 | 6.466 | 1,42 | 1,03 | 0,99 | 23 | Rayo Aurora, Bucle Arena, Huesomerang, Hueso Palo |
| 222 | Golem | Roca/Tierra | 1,02 (1,03) | 320 | 1.831 | 6.455 | 1,36 | 1,15 | 0,89 | 23 | Tumba Rocas, Bucle Arena, Huesomerang, Rodar |
| 223 | Keldeo | Agua/Lucha | 1,02 (1,00) | 271 | 1.908 | 6.775 | 1,41 | 1,00 | 1,02 | 22 | Torbellino, Vozarrón, Tajo Cruzado, Puño Dinámico |
| 224 | Eiscue | Hielo | 1,02 (1,03) | 282 | 1.888 | 6.448 | 1,14 | 1,03 | 0,99 | 15 | Rayo Aurora, Liofilización, Vozarrón, Chuzos |
| 225 | Cloyster | Agua/Hielo | 1,02 (1,03) | 275 | 1.897 | 6.676 | 1,22 | 0,94 | 1,08 | 22 | Rayo Aurora, Torbellino, Liofilización, Vozarrón |
| 226 | Arceus | Normal | 1,02 (1,03) | 177 | 2.118 | 7.228 | 1,36 | 1,16 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 227 | Diancie | Roca/Hada | 1,02 (1,48) | 237 | 1.967 | 6.937 | 1,25 | 1,04 | 0,98 | 22 | Tumba Rocas, Cañón Floral, Vozarrón, Rodar |
| 228 | Swellow | Normal/Volador | 1,02 (1,03) | 301 | 1.851 | 6.002 | 1,17 | 0,89 | 1,15 | 15 | Tajo Aéreo, Vozarrón, Meteoros, Danza Pluma |
| 229 | Tangrowth | Planta | 1,02 (1,03) | 696 | 1.500 | 5.879 | 1,31 | 1,11 | 0,91 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 230 | Chimecho | Psíquico | 1,02 (1,03) | 470 | 1.654 | 5.855 | 1,22 | 1,06 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 231 | Donphan | Tierra | 1,02 (1,03) | 432 | 1.687 | 6.192 | 1,36 | 1,26 | 0,80 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Púas |
| 232 | Gothitelle | Psíquico | 1,01 (1,03) | 468 | 1.651 | 5.850 | 1,22 | 1,06 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 233 | Nihilego | Roca/Veneno | 1,01 (1,02) | 428 | 1.686 | 6.191 | 1,40 | 0,99 | 1,02 | 21 | Bomba Ácida, Vozarrón, Tumba Rocas, Meteoros |
| 234 | Meloetta | Normal/Psíquico | 1,01 (1,02) | 421 | 1.692 | 6.020 | 1,40 | 1,05 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Meteoros, Confusión |
| 235 | Gyarados | Agua/Volador | 1,01 (1,02) | 289 | 1.854 | 6.501 | 1,39 | 0,90 | 1,13 | 22 | Tajo Aéreo, Torbellino, Cascada, Vozarrón |
| 236 | Mr. Mime | Psíquico/Hada | 1,01 (1,49) | 308 | 1.826 | 6.362 | 1,25 | 0,96 | 1,05 | 23 | Cañón Floral, Géiser Fotónico, Vozarrón, Meteoros |
| 237 | Tyrantrum | Roca/Dragón | 1,01 (1,02) | 364 | 1.751 | 6.140 | 1,37 | 1,18 | 0,86 | 21 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 238 | Slurpuff | Hada | 1,01 (1,55) | 297 | 1.834 | 6.021 | 1,17 | 1,03 | 0,98 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Meteoros |
| 239 | Zacian | Hada | 1,01 (1,54) | 298 | 1.831 | 6.117 | 1,36 | 1,01 | 1,00 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Golpe Cuerpo |
| 240 | Manaphy | Agua | 1,01 (1,02) | 287 | 1.848 | 6.432 | 1,25 | 1,08 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 241 | Weezing | Veneno | 1,01 (1,02) | 641 | 1.511 | 5.617 | 1,20 | 1,02 | 0,99 | 14 | Veneno X, Bomba Ácida, Vozarrón, Picotazo Veneno |
| 242 | Bewear | Normal/Lucha | 1,00 (0,78) | 394 | 1.702 | 6.250 | 1,39 | 1,02 | 0,99 | 15 | Tajo Cruzado, Puño Dinámico, Patada Giro, Vozarrón |
| 243 | Empoleon | Agua/Acero | 1,00 (1,01) | 349 | 1.750 | 6.476 | 1,31 | 0,98 | 1,02 | 22 | Disparo Espejo, Torbellino, Vozarrón, Pistola Agua |
| 244 | Lapras | Agua/Hielo | 1,00 (1,01) | 269 | 1.867 | 6.589 | 1,17 | 0,94 | 1,07 | 22 | Rayo Aurora, Torbellino, Liofilización, Vozarrón |
| 245 | Annihilape | Lucha/Fantasma | 1,00 (0,78) | 472 | 1.621 | 5.932 | 1,33 | 1,00 | 1,00 | 22 | Tajo Cruzado, Puño Dinámico, Homenaje Póstumo, Patada Giro |
| 246 | Heracross | Bicho/Lucha | 1,00 (0,80) | 434 | 1.654 | 5.998 | 1,39 | 1,02 | 0,98 | 22 | Tajo Cruzado, Puño Dinámico, Patada Giro, Rayo Señal |
| 247 | Toxicroak | Veneno/Lucha | 1,00 (0,91) | 461 | 1.625 | 6.173 | 1,28 | 0,95 | 1,05 | 21 | Tajo Cruzado, Puño Dinámico, Veneno X, Bomba Ácida |
| 248 | Ribombee | Bicho/Hada | 1,00 (1,44) | 360 | 1.728 | 6.241 | 1,22 | 0,92 | 1,08 | 22 | Rayo Señal, Cañón Floral, Vozarrón, Meteoros |
| 249 | Dracozolt | Eléctrico/Dragón | 1,00 (1,01) | 299 | 1.810 | 6.633 | 1,25 | 0,89 | 1,11 | 21 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 250 | Accelgor | Bicho | 1,00 (1,01) | 426 | 1.655 | 5.492 | 1,25 | 0,99 | 1,01 | 15 | Rayo Señal, Vozarrón, Meteoros, Al Ataque |
| 251 | Zoroark | Siniestro | 1,00 (1,01) | 463 | 1.619 | 6.060 | 1,36 | 1,13 | 0,88 | 14 | Golpe Bajo, Vozarrón, Paliza, Tajo Umbrío |
| 252 | Pidgeot | Normal/Volador | 1,00 (1,01) | 296 | 1.810 | 5.855 | 1,14 | 0,87 | 1,15 | 15 | Tajo Aéreo, Vozarrón, Meteoros, Danza Pluma |
| 253 | Grumpig | Psíquico | 0,99 (1,01) | 467 | 1.613 | 5.729 | 1,20 | 1,05 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 254 | Lilligant | Planta | 0,99 (1,01) | 618 | 1.503 | 5.832 | 1,31 | 1,08 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Meteoros |
| 255 | Pachirisu | Eléctrico | 0,99 (1,00) | 304 | 1.793 | 6.388 | 0,95 | 0,89 | 1,12 | 15 | Rayo Carga, Bola Voltio, Onda Trueno, Impactrueno |
| 256 | Comfey | Hada | 0,99 (1,53) | 286 | 1.819 | 5.986 | 1,15 | 1,01 | 0,98 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Meteoros |
| 257 | Sceptile | Planta | 0,99 (1,00) | 663 | 1.471 | 5.775 | 1,28 | 1,08 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 258 | Arctovish | Agua/Hielo | 0,99 (1,00) | 267 | 1.847 | 6.531 | 1,20 | 0,92 | 1,07 | 22 | Rayo Aurora, Torbellino, Liofilización, Vozarrón |
| 259 | Grimmsnarl | Siniestro/Hada | 0,99 (1,44) | 346 | 1.730 | 6.116 | 1,36 | 0,99 | 1,00 | 21 | Cañón Floral, Golpe Bajo, Vozarrón, Paliza |
| 260 | Muk | Veneno | 0,99 (1,00) | 674 | 1.463 | 5.510 | 1,28 | 1,02 | 0,97 | 14 | Veneno X, Bomba Ácida, Picotazo Veneno, Vozarrón |
| 261 | Corviknight | Volador/Acero | 0,99 (1,00) | 345 | 1.727 | 6.028 | 1,18 | 0,81 | 1,22 | 22 | Tajo Aéreo, Disparo Espejo, Ala de Acero, Vozarrón |
| 262 | Milotic | Agua | 0,99 (1,00) | 289 | 1.805 | 6.158 | 1,25 | 1,06 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 263 | Slaking | Normal | 0,99 (1,00) | 186 | 2.014 | 6.845 | 1,58 | 1,15 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 264 | Lanturn | Agua/Eléctrico | 0,99 (1,00) | 268 | 1.838 | 6.874 | 1,12 | 0,87 | 1,13 | 22 | Rayo Carga, Bola Voltio, Onda Trueno, Torbellino |
| 265 | Altaria | Dragón/Volador | 0,99 (1,00) | 297 | 1.789 | 5.760 | 1,08 | 0,86 | 1,14 | 21 | Tajo Aéreo, Vozarrón, Meteoros, Danza Pluma |
| 266 | Maractus | Planta | 0,99 (1,00) | 669 | 1.461 | 5.733 | 1,28 | 1,07 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 267 | Hippowdon | Tierra | 0,99 (1,00) | 424 | 1.636 | 6.066 | 1,32 | 1,23 | 0,80 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Púas |
| 268 | Huntail | Agua | 0,98 (1,00) | 287 | 1.798 | 6.280 | 1,27 | 1,07 | 0,92 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 269 | Darkrai | Siniestro | 0,98 (0,99) | 460 | 1.597 | 5.985 | 1,44 | 1,10 | 0,90 | 14 | Golpe Bajo, Vozarrón, Paliza, Meteoros |
| 270 | Archaludon | Acero/Dragón | 0,98 (0,99) | 332 | 1.731 | 6.261 | 1,39 | 1,01 | 0,98 | 21 | Disparo Espejo, Vozarrón, Ala de Acero, Meteoros |
| 271 | Drednaw | Agua/Roca | 0,98 (0,99) | 343 | 1.716 | 6.011 | 1,33 | 1,13 | 0,87 | 22 | Tumba Rocas, Rodar, Lanzarrocas, Avalancha |
| 272 | Naganadel | Veneno/Dragón | 0,98 (0,99) | 483 | 1.574 | 5.656 | 1,40 | 0,99 | 0,99 | 20 | Bomba Ácida, Vozarrón, Veneno X, Meteoros |
| 273 | Ledian | Bicho/Volador | 0,98 (0,99) | 341 | 1.712 | 5.709 | 1,00 | 0,79 | 1,24 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Meteoros |
| 274 | Froslass | Hielo/Fantasma | 0,98 (0,97) | 293 | 1.777 | 6.377 | 1,14 | 0,92 | 1,07 | 22 | Rayo Aurora, Liofilización, Viento Aciago, Vozarrón |
| 275 | Shaymin | Planta | 0,98 (0,99) | 642 | 1.460 | 5.723 | 1,25 | 1,07 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 276 | Kommo-o | Dragón/Lucha | 0,98 (0,83) | 359 | 1.687 | 6.204 | 1,31 | 0,98 | 1,00 | 21 | Tajo Cruzado, Puño Dinámico, Vozarrón, Patada Giro |
| 277 | Aggron | Acero/Roca | 0,97 (0,99) | 341 | 1.701 | 5.969 | 1,31 | 1,03 | 0,94 | 22 | Tumba Rocas, Disparo Espejo, Rodar, Ala de Acero |
| 278 | Sinistcha | Planta/Fantasma | 0,97 (0,98) | 354 | 1.683 | 6.176 | 1,37 | 1,00 | 0,98 | 23 | Viento Aciago, Vozarrón, Energibola, Rayo Solar |
| 279 | Gliscor | Tierra/Volador | 0,97 (0,98) | 361 | 1.675 | 5.822 | 1,22 | 0,90 | 1,08 | 23 | Tajo Aéreo, Bucle Arena, Huesomerang, Hueso Palo |
| 280 | Kartana | Planta/Acero | 0,97 (0,98) | 598 | 1.475 | 5.730 | 1,70 | 1,22 | 0,80 | 23 | Ala de Acero, Hoja Afilada, Látigo Cepa, Puño Meteoro |
| 281 | Sunflora | Planta | 0,97 (0,98) | 607 | 1.466 | 5.684 | 1,28 | 1,06 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 282 | Golduck | Agua | 0,97 (0,98) | 275 | 1.786 | 6.183 | 1,22 | 1,04 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 283 | Kabutops | Roca/Agua | 0,97 (0,98) | 299 | 1.748 | 6.287 | 1,33 | 1,08 | 0,90 | 22 | Tumba Rocas, Rodar, Torbellino, Lanzarrocas |
| 284 | Vileplume | Planta/Veneno | 0,97 (0,98) | 497 | 1.539 | 5.737 | 1,31 | 0,95 | 1,02 | 22 | Bomba Ácida, Vozarrón, Veneno X, Energibola |
| 285 | Chesnaught | Planta/Lucha | 0,97 (0,84) | 418 | 1.606 | 5.771 | 1,29 | 0,94 | 1,03 | 23 | Tajo Cruzado, Puño Dinámico, Vozarrón, Patada Giro |
| 286 | Simisage | Planta | 0,97 (0,98) | 649 | 1.435 | 5.651 | 1,24 | 1,06 | 0,91 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 287 | Jirachi | Acero/Psíquico | 0,97 (0,98) | 394 | 1.625 | 6.111 | 1,25 | 0,93 | 1,03 | 23 | Disparo Espejo, Géiser Fotónico, Vozarrón, Ala de Acero |
| 288 | Slowking | Agua/Psíquico | 0,97 (0,98) | 366 | 1.654 | 6.147 | 1,25 | 0,96 | 1,01 | 23 | Géiser Fotónico, Torbellino, Vozarrón, Pistola Agua |
| 289 | Wailord | Agua | 0,97 (0,98) | 277 | 1.772 | 6.177 | 1,20 | 1,04 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 290 | Arboliva | Planta/Normal | 0,97 (0,98) | 388 | 1.629 | 5.655 | 1,39 | 0,99 | 0,98 | 16 | Vozarrón, Energibola, Rayo Solar, Meteoros |
| 291 | Sandaconda | Tierra | 0,97 (0,98) | 414 | 1.601 | 5.961 | 1,29 | 1,20 | 0,80 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Púas |
| 292 | Metagross | Acero/Psíquico | 0,96 (0,98) | 394 | 1.620 | 6.388 | 1,44 | 0,95 | 1,01 | 23 | Disparo Espejo, Géiser Fotónico, Ala de Acero, Vozarrón |
| 293 | Ondulagua | Agua/Dragón | 0,96 (0,98) | 283 | 1.758 | 6.075 | 1,39 | 1,04 | 0,93 | 21 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 294 | Dodrio | Normal/Volador | 0,96 (0,98) | 282 | 1.760 | 5.764 | 1,31 | 0,87 | 1,10 | 15 | Tajo Aéreo, Vozarrón, Golpe Cuerpo, Golpe Aéreo |
| 295 | Gogoat | Planta | 0,96 (0,98) | 649 | 1.429 | 5.639 | 1,25 | 1,06 | 0,91 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 296 | Meowstic | Psíquico | 0,96 (0,97) | 450 | 1.565 | 5.568 | 1,16 | 1,01 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 297 | Tapu Bulu | Planta/Hada | 0,96 (1,42) | 338 | 1.681 | 5.716 | 1,42 | 0,94 | 1,03 | 23 | Cañón Floral, Vozarrón, Hoja Afilada, Látigo Cepa |
| 298 | Ninjask | Bicho/Volador | 0,96 (0,97) | 334 | 1.684 | 5.708 | 1,20 | 0,78 | 1,23 | 22 | Tajo Aéreo, Rayo Señal, Vozarrón, Golpe Cuerpo |
| 299 | Slowbro | Agua/Psíquico | 0,96 (0,97) | 368 | 1.642 | 6.086 | 1,25 | 0,95 | 1,01 | 23 | Géiser Fotónico, Torbellino, Vozarrón, Pistola Agua |
| 300 | Mismagius | Fantasma | 0,96 (0,92) | 316 | 1.706 | 6.060 | 1,28 | 1,02 | 0,94 | 15 | Viento Aciago, Vozarrón, Homenaje Póstumo, Meteoros |
| 301 | Braviary | Normal/Volador | 0,96 (0,97) | 285 | 1.750 | 5.771 | 1,38 | 0,88 | 1,10 | 15 | Tajo Aéreo, Vozarrón, Golpe Cuerpo, Golpe Aéreo |
| 302 | Morpeko | Eléctrico/Siniestro | 0,96 (0,97) | 311 | 1.712 | 6.222 | 1,22 | 0,86 | 1,12 | 21 | Rayo Carga, Bola Voltio, Onda Trueno, Golpe Bajo |
| 303 | Starmie | Agua/Psíquico | 0,96 (0,97) | 361 | 1.649 | 6.093 | 1,25 | 0,95 | 1,01 | 23 | Géiser Fotónico, Torbellino, Vozarrón, Pistola Agua |
| 304 | Jumpluff | Planta/Volador | 0,96 (0,97) | 363 | 1.644 | 5.381 | 1,00 | 0,78 | 1,23 | 23 | Tajo Aéreo, Vozarrón, Energibola, Rayo Solar |
| 305 | Politoed | Agua | 0,96 (0,97) | 276 | 1.759 | 6.078 | 1,20 | 1,03 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 306 | Cacturne | Planta/Siniestro | 0,96 (0,97) | 494 | 1.520 | 5.751 | 1,33 | 1,00 | 0,96 | 22 | Golpe Bajo, Vozarrón, Energibola, Rayo Solar |
| 307 | Tapu Fini | Agua/Hada | 0,96 (1,40) | 234 | 1.831 | 6.353 | 1,22 | 0,94 | 1,02 | 22 | Cañón Floral, Torbellino, Vozarrón, Pistola Agua |
| 308 | Unfezant | Normal/Volador | 0,96 (0,97) | 269 | 1.769 | 5.836 | 1,33 | 0,88 | 1,09 | 15 | Tajo Aéreo, Vozarrón, Golpe Cuerpo, Meteoros |
| 309 | Garbodor | Veneno | 0,96 (0,97) | 652 | 1.416 | 5.339 | 1,22 | 0,99 | 0,97 | 14 | Veneno X, Bomba Ácida, Picotazo Veneno, Vozarrón |
| 310 | Mandibuzz | Siniestro/Volador | 0,96 (0,97) | 381 | 1.618 | 5.394 | 1,06 | 0,81 | 1,18 | 21 | Tajo Aéreo, Golpe Bajo, Vozarrón, Paliza |
| 311 | Cobalion | Acero/Lucha | 0,96 (0,89) | 371 | 1.628 | 6.259 | 1,20 | 0,90 | 1,06 | 22 | Tajo Cruzado, Disparo Espejo, Puño Dinámico, Vozarrón |
| 312 | Avalugg | Hielo | 0,96 (0,97) | 278 | 1.749 | 6.171 | 1,34 | 1,03 | 0,93 | 15 | Rayo Aurora, Chuzos, Liofilización, Vozarrón |
| 313 | Omastar | Roca/Agua | 0,96 (0,97) | 244 | 1.806 | 6.520 | 1,33 | 0,98 | 0,98 | 22 | Torbellino, Tumba Rocas, Vozarrón, Pistola Agua |
| 314 | Hydrapple | Planta/Dragón | 0,96 (0,97) | 405 | 1.589 | 5.577 | 1,36 | 0,98 | 0,98 | 22 | Vozarrón, Energibola, Rayo Solar, Meteoros |
| 315 | Fearow | Normal/Volador | 0,95 (0,96) | 269 | 1.756 | 5.779 | 1,20 | 0,83 | 1,14 | 15 | Tajo Aéreo, Vozarrón, Meteoros, Golpe Cuerpo |
| 316 | Suicune | Agua | 0,95 (0,96) | 272 | 1.748 | 6.053 | 1,20 | 1,02 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 317 | Latias | Dragón/Psíquico | 0,95 (0,96) | 382 | 1.604 | 5.707 | 1,31 | 0,99 | 0,97 | 22 | Géiser Fotónico, Vozarrón, Meteoros, Confusión |
| 318 | Arbok | Veneno | 0,95 (0,96) | 657 | 1.401 | 5.273 | 1,22 | 0,99 | 0,96 | 14 | Veneno X, Bomba Ácida, Picotazo Veneno, Vozarrón |
| 319 | Venomoth | Bicho/Veneno | 0,95 (0,96) | 484 | 1.511 | 5.584 | 1,20 | 0,87 | 1,09 | 21 | Rayo Señal, Bomba Ácida, Vozarrón, Veneno X |
| 320 | Baxcalibur | Dragón/Hielo | 0,95 (0,96) | 262 | 1.761 | 6.410 | 1,50 | 0,99 | 0,96 | 21 | Rayo Aurora, Liofilización, Chuzos, Vozarrón |
| 321 | Farigiraf | Normal/Psíquico | 0,95 (0,96) | 390 | 1.589 | 5.664 | 1,31 | 0,99 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Meteoros, Confusión |
| 322 | Carnivine | Planta | 0,95 (0,96) | 634 | 1.405 | 5.565 | 1,25 | 1,04 | 0,91 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 323 | Cetitan | Hielo | 0,95 (0,96) | 261 | 1.752 | 6.228 | 1,32 | 1,02 | 0,93 | 15 | Rayo Aurora, Chuzos, Liofilización, Vozarrón |
| 324 | Regigigas | Normal | 0,95 (0,96) | 180 | 1.922 | 6.593 | 1,58 | 1,11 | 0,85 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 325 | Barbaracle | Roca/Agua | 0,94 (0,96) | 305 | 1.683 | 5.915 | 1,28 | 1,06 | 0,89 | 22 | Tumba Rocas, Rodar, Torbellino, Lanzarrocas |
| 326 | Tatsugiri | Dragón/Agua | 0,94 (0,96) | 282 | 1.715 | 5.905 | 1,36 | 1,03 | 0,92 | 21 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 327 | Farfetch’d | Normal/Volador | 0,94 (0,95) | 257 | 1.754 | 5.756 | 1,20 | 0,82 | 1,15 | 15 | Tajo Aéreo, Vozarrón, Golpe Cuerpo, Meteoros |
| 328 | Virizion | Planta/Lucha | 0,94 (0,87) | 403 | 1.568 | 5.828 | 1,20 | 0,91 | 1,04 | 23 | Tajo Cruzado, Puño Dinámico, Vozarrón, Energibola |
| 329 | Sharpedo | Agua/Siniestro | 0,94 (0,95) | 407 | 1.563 | 5.942 | 1,36 | 1,00 | 0,95 | 21 | Golpe Bajo, Torbellino, Vozarrón, Paliza |
| 330 | Victreebel | Planta/Veneno | 0,94 (0,95) | 562 | 1.442 | 5.603 | 1,28 | 0,94 | 1,01 | 22 | Veneno X, Bomba Ácida, Vozarrón, Energibola |
| 331 | Dewgong | Agua/Hielo | 0,94 (0,95) | 252 | 1.761 | 6.188 | 1,08 | 0,87 | 1,08 | 22 | Rayo Aurora, Torbellino, Liofilización, Vozarrón |
| 332 | Dusknoir | Fantasma | 0,94 (0,85) | 476 | 1.498 | 5.957 | 1,25 | 1,04 | 0,90 | 15 | Homenaje Póstumo, Viento Aciago, Sombra Vil, Lengüetazo |
| 333 | Wyrdeer | Normal/Psíquico | 0,94 (0,95) | 376 | 1.588 | 5.700 | 1,28 | 0,96 | 0,98 | 16 | Géiser Fotónico, Vozarrón, Meteoros, Confusión |
| 334 | Celebi | Psíquico/Planta | 0,94 (0,95) | 429 | 1.536 | 5.641 | 1,25 | 0,93 | 1,01 | 24 | Géiser Fotónico, Vozarrón, Energibola, Rayo Solar |
| 335 | Venusaur | Planta/Veneno | 0,94 (0,95) | 474 | 1.498 | 5.599 | 1,25 | 0,91 | 1,03 | 22 | Bomba Ácida, Vozarrón, Veneno X, Energibola |
| 336 | Indeedee | Psíquico/Normal | 0,94 (0,95) | 391 | 1.568 | 5.597 | 1,28 | 0,96 | 0,97 | 16 | Géiser Fotónico, Vozarrón, Meteoros, Confusión |
| 337 | Staraptor | Normal/Volador | 0,94 (0,95) | 281 | 1.702 | 5.620 | 1,36 | 0,85 | 1,10 | 15 | Tajo Aéreo, Vozarrón, Golpe Cuerpo, Golpe Aéreo |
| 338 | Crawdaunt | Agua/Siniestro | 0,94 (0,95) | 405 | 1.552 | 5.917 | 1,36 | 1,00 | 0,94 | 21 | Golpe Bajo, Torbellino, Vozarrón, Paliza |
| 339 | Swalot | Veneno | 0,93 (0,94) | 582 | 1.412 | 5.192 | 1,10 | 0,95 | 0,99 | 14 | Bomba Ácida, Veneno X, Vozarrón, Picotazo Veneno |
| 340 | Dugtrio | Tierra | 0,93 (0,94) | 396 | 1.554 | 5.752 | 1,25 | 1,16 | 0,81 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Púas |
| 341 | Blastoise | Agua | 0,93 (0,94) | 269 | 1.711 | 5.967 | 1,17 | 1,01 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 342 | Weavile | Siniestro/Hielo | 0,93 (0,94) | 421 | 1.529 | 5.529 | 1,36 | 0,96 | 0,97 | 21 | Rayo Aurora, Golpe Bajo, Paliza, Chuzos |
| 343 | Greninja | Agua/Siniestro | 0,93 (0,94) | 295 | 1.670 | 5.890 | 1,27 | 0,96 | 0,98 | 21 | Torbellino, Vozarrón, Golpe Bajo, Pistola Agua |
| 344 | Floatzel | Agua | 0,93 (0,94) | 263 | 1.717 | 6.097 | 1,28 | 1,05 | 0,88 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 345 | Sandslash | Tierra | 0,93 (0,94) | 398 | 1.548 | 5.689 | 1,25 | 1,16 | 0,80 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Púas |
| 346 | Bellossom | Planta | 0,93 (0,94) | 618 | 1.386 | 5.433 | 1,20 | 1,01 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 347 | Poliwrath | Agua/Lucha | 0,93 (0,81) | 333 | 1.616 | 6.112 | 1,22 | 0,90 | 1,03 | 22 | Tajo Cruzado, Puño Dinámico, Torbellino, Vozarrón |
| 348 | Houndstone | Fantasma | 0,93 (0,83) | 491 | 1.463 | 5.775 | 1,26 | 1,05 | 0,89 | 15 | Homenaje Póstumo, Sombra Vil, Viento Aciago, Lengüetazo |
| 349 | Cradily | Roca/Planta | 0,93 (0,94) | 316 | 1.632 | 5.694 | 1,15 | 0,93 | 1,00 | 23 | Tumba Rocas, Vozarrón, Energibola, Rodar |
| 350 | Hydreigon | Siniestro/Dragón | 0,93 (0,94) | 330 | 1.613 | 5.551 | 1,39 | 1,00 | 0,93 | 20 | Vozarrón, Golpe Bajo, Meteoros, Paliza |
| 351 | Granbull | Hada | 0,93 (1,40) | 302 | 1.648 | 5.547 | 1,36 | 0,95 | 0,98 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Golpe Cuerpo |
| 352 | Klinklang | Acero | 0,93 (0,94) | 367 | 1.570 | 5.954 | 1,25 | 1,00 | 0,93 | 15 | Disparo Espejo, Ala de Acero, Puño Meteoro, Vozarrón |
| 353 | Cresselia | Psíquico | 0,92 (0,93) | 423 | 1.508 | 5.343 | 1,11 | 0,97 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 354 | Lunatone | Roca/Psíquico | 0,92 (0,93) | 339 | 1.592 | 5.933 | 1,22 | 0,91 | 1,02 | 23 | Géiser Fotónico, Tumba Rocas, Vozarrón, Meteoros |
| 355 | Uxie | Psíquico | 0,92 (0,93) | 436 | 1.495 | 5.313 | 1,11 | 0,97 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 356 | Golurk | Tierra/Fantasma | 0,92 (0,88) | 539 | 1.416 | 5.609 | 1,38 | 1,06 | 0,87 | 23 | Homenaje Póstumo, Bucle Arena, Huesomerang, Hueso Palo |
| 357 | Ursaluna | Tierra/Normal | 0,92 (0,93) | 389 | 1.534 | 5.733 | 1,47 | 1,16 | 0,80 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Púas |
| 358 | Excadrill | Tierra/Acero | 0,92 (0,93) | 385 | 1.537 | 5.756 | 1,44 | 1,11 | 0,83 | 23 | Bucle Arena, Huesomerang, Ala de Acero, Hueso Palo |
| 359 | Decidueye | Planta/Fantasma | 0,92 (0,90) | 516 | 1.427 | 5.710 | 1,29 | 0,94 | 0,98 | 23 | Homenaje Póstumo, Viento Aciago, Vozarrón, Energibola |
| 360 | Unown | Psíquico | 0,92 (0,93) | 430 | 1.493 | 5.285 | 1,10 | 0,96 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 361 | Dhelmise | Fantasma/Planta | 0,92 (0,86) | 509 | 1.429 | 5.703 | 1,42 | 1,00 | 0,92 | 23 | Homenaje Póstumo, Sombra Vil, Viento Aciago, Vozarrón |
| 362 | Solrock | Roca/Psíquico | 0,92 (0,93) | 334 | 1.588 | 5.645 | 1,22 | 0,98 | 0,94 | 23 | Tumba Rocas, Géiser Fotónico, Rodar, Lanzarrocas |
| 363 | Dragapult | Dragón/Fantasma | 0,92 (0,84) | 428 | 1.489 | 5.919 | 1,36 | 0,97 | 0,94 | 21 | Homenaje Póstumo, Viento Aciago, Vozarrón, Sombra Vil |
| 364 | Klefki | Acero/Hada | 0,92 (1,35) | 249 | 1.704 | 6.029 | 1,14 | 0,87 | 1,05 | 22 | Cañón Floral, Disparo Espejo, Vozarrón, Ala de Acero |
| 365 | Hypno | Psíquico | 0,91 (0,93) | 422 | 1.490 | 5.290 | 1,10 | 0,96 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 366 | Kingambit | Siniestro/Acero | 0,91 (0,92) | 514 | 1.417 | 5.484 | 1,44 | 1,05 | 0,87 | 21 | Golpe Bajo, Ala de Acero, Disparo Espejo, Paliza |
| 367 | Silvally | Normal | 0,91 (0,92) | 159 | 1.900 | 6.484 | 1,22 | 1,04 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 368 | Skarmory | Acero/Volador | 0,91 (0,92) | 320 | 1.593 | 5.623 | 1,14 | 0,76 | 1,20 | 22 | Tajo Aéreo, Disparo Espejo, Ala de Acero, Vozarrón |
| 369 | Basculegion | Agua/Fantasma | 0,91 (0,84) | 418 | 1.488 | 6.068 | 1,32 | 0,93 | 0,99 | 22 | Homenaje Póstumo, Torbellino, Viento Aciago, Vozarrón |
| 370 | Phione | Agua | 0,91 (0,92) | 264 | 1.666 | 5.791 | 1,14 | 0,99 | 0,92 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 371 | Registeel | Acero | 0,91 (0,92) | 351 | 1.551 | 5.803 | 1,11 | 0,96 | 0,95 | 15 | Disparo Espejo, Ala de Acero, Vozarrón, Fiebre Dorada |
| 372 | Spritzee | Hada | 0,91 (1,41) | 267 | 1.659 | 5.441 | 1,05 | 0,93 | 0,98 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Meteoros |
| 373 | Nidoking | Veneno/Tierra | 0,91 (0,92) | 479 | 1.433 | 5.785 | 1,26 | 0,94 | 0,97 | 22 | Veneno X, Bomba Ácida, Bucle Arena, Vozarrón |
| 374 | Fezandipiti | Veneno/Hada | 0,91 (1,28) | 373 | 1.525 | 5.547 | 1,20 | 0,85 | 1,07 | 21 | Cañón Floral, Veneno X, Bomba Ácida, Vozarrón |
| 375 | Feraligatr | Agua | 0,91 (0,92) | 242 | 1.697 | 6.077 | 1,28 | 1,02 | 0,89 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 376 | Liepard | Siniestro | 0,91 (0,92) | 434 | 1.464 | 5.439 | 1,18 | 1,02 | 0,89 | 14 | Golpe Bajo, Vozarrón, Paliza, Tajo Umbrío |
| 377 | Ludicolo | Agua/Planta | 0,91 (0,92) | 324 | 1.575 | 5.610 | 1,20 | 0,90 | 1,01 | 23 | Torbellino, Vozarrón, Energibola, Rayo Solar |
| 378 | Orbeetle | Bicho/Psíquico | 0,91 (0,92) | 411 | 1.483 | 5.477 | 1,14 | 0,85 | 1,06 | 23 | Rayo Señal, Géiser Fotónico, Vozarrón, Meteoros |
| 379 | Cherrim | Planta | 0,91 (0,92) | 566 | 1.369 | 5.375 | 1,18 | 0,98 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 380 | Cofagrigus | Fantasma | 0,91 (0,87) | 299 | 1.605 | 5.676 | 1,22 | 0,97 | 0,94 | 15 | Viento Aciago, Vozarrón, Homenaje Póstumo, Meteoros |
| 381 | Meganium | Planta | 0,91 (0,92) | 590 | 1.354 | 5.310 | 1,16 | 0,99 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 382 | Garchomp | Dragón/Tierra | 0,91 (0,92) | 354 | 1.538 | 5.876 | 1,42 | 1,09 | 0,83 | 22 | Bucle Arena, Huesomerang, Hueso Palo, Vozarrón |
| 383 | Krookodile | Tierra/Siniestro | 0,90 (0,91) | 473 | 1.422 | 5.455 | 1,34 | 1,05 | 0,86 | 22 | Golpe Bajo, Bucle Arena, Huesomerang, Hueso Palo |
| 384 | Scrafty | Siniestro/Lucha | 0,90 (0,77) | 426 | 1.457 | 5.334 | 1,20 | 0,92 | 0,98 | 21 | Tajo Cruzado, Puño Dinámico, Golpe Bajo, Patada Giro |
| 385 | Overqwil | Siniestro/Veneno | 0,90 (0,91) | 631 | 1.321 | 5.042 | 1,33 | 0,97 | 0,93 | 20 | Veneno X, Golpe Bajo, Bomba Ácida, Paliza |
| 386 | Exploud | Normal | 0,90 (0,91) | 156 | 1.869 | 6.378 | 1,20 | 1,03 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 387 | Bramaluna | Dragón/Siniestro | 0,89 (0,90) | 517 | 1.377 | 5.423 | 1,46 | 1,10 | 0,82 | 20 | Golpe Bajo, Paliza, Tajo Umbrío, Golpe Cuerpo |
| 388 | Relicanth | Agua/Roca | 0,89 (0,90) | 285 | 1.593 | 5.583 | 1,20 | 1,00 | 0,89 | 22 | Tumba Rocas, Rodar, Torbellino, Lanzarrocas |
| 389 | Perrserker | Acero | 0,89 (0,90) | 357 | 1.500 | 5.756 | 1,31 | 1,01 | 0,88 | 15 | Ala de Acero, Disparo Espejo, Puño Meteoro, Vozarrón |
| 390 | Appletun | Planta/Dragón | 0,89 (0,90) | 371 | 1.485 | 5.211 | 1,25 | 0,90 | 0,99 | 22 | Vozarrón, Energibola, Rayo Solar, Meteoros |
| 391 | Swampert | Agua/Tierra | 0,89 (0,90) | 261 | 1.621 | 6.144 | 1,31 | 0,97 | 0,91 | 23 | Torbellino, Bucle Arena, Huesomerang, Vozarrón |
| 392 | Whimsicott | Planta/Hada | 0,89 (1,27) | 292 | 1.573 | 5.431 | 1,12 | 0,85 | 1,05 | 23 | Cañón Floral, Vozarrón, Energibola, Rayo Solar |
| 393 | Revavroom | Acero/Veneno | 0,89 (0,90) | 547 | 1.344 | 5.157 | 1,35 | 0,93 | 0,95 | 21 | Veneno X, Ala de Acero, Disparo Espejo, Bomba Ácida |
| 394 | Dragalge | Veneno/Dragón | 0,89 (0,90) | 460 | 1.403 | 5.063 | 1,23 | 0,89 | 1,00 | 20 | Bomba Ácida, Vozarrón, Veneno X, Meteoros |
| 395 | Pinsir | Bicho | 0,89 (0,90) | 496 | 1.374 | 5.315 | 1,39 | 1,03 | 0,86 | 15 | Rayo Señal, Al Ataque, Pin Misil, Vozarrón |
| 396 | Lurantis | Planta | 0,88 (0,89) | 738 | 1.243 | 5.254 | 1,28 | 1,05 | 0,84 | 16 | Energibola, Hoja Afilada, Látigo Cepa, Rayo Solar |
| 397 | Dudunsparce | Normal | 0,88 (0,89) | 153 | 1.838 | 6.321 | 1,25 | 1,01 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 398 | Rillaboom | Planta | 0,88 (0,89) | 709 | 1.250 | 4.894 | 1,39 | 1,16 | 0,76 | 16 | Hoja Afilada, Látigo Cepa, Bomba Germen, Energibola |
| 399 | Illumise | Bicho | 0,88 (0,89) | 385 | 1.456 | 4.833 | 1,10 | 0,87 | 1,01 | 15 | Rayo Señal, Vozarrón, Meteoros, Al Ataque |
| 400 | Meowscarada | Planta/Siniestro | 0,88 (0,89) | 539 | 1.336 | 4.905 | 1,31 | 0,95 | 0,93 | 22 | Golpe Bajo, Vozarrón, Paliza, Energibola |
| 401 | Orthworm | Acero | 0,88 (0,89) | 348 | 1.489 | 5.635 | 1,17 | 0,94 | 0,93 | 15 | Disparo Espejo, Ala de Acero, Puño Meteoro, Vozarrón |
| 402 | Wormadam | Bicho/Planta | 0,88 (0,89) | 418 | 1.422 | 5.147 | 1,13 | 0,82 | 1,07 | 23 | Rayo Señal, Vozarrón, Energibola, Rayo Solar |
| 403 | Bronzong | Acero/Psíquico | 0,88 (0,89) | 347 | 1.489 | 5.621 | 1,19 | 0,85 | 1,04 | 23 | Disparo Espejo, Géiser Fotónico, Vozarrón, Ala de Acero |
| 404 | Shiftry | Planta/Siniestro | 0,88 (0,89) | 493 | 1.362 | 5.099 | 1,25 | 0,92 | 0,95 | 22 | Golpe Bajo, Vozarrón, Energibola, Paliza |
| 405 | Flapple | Planta/Dragón | 0,88 (0,89) | 434 | 1.405 | 5.042 | 1,31 | 0,91 | 0,97 | 22 | Vozarrón, Energibola, Hoja Afilada, Rayo Solar |
| 406 | Gastrodon | Agua/Tierra | 0,88 (0,89) | 221 | 1.662 | 5.954 | 1,21 | 0,92 | 0,95 | 23 | Torbellino, Vozarrón, Bucle Arena, Huesomerang |
| 407 | Wigglytuff | Normal/Hada | 0,88 (1,32) | 217 | 1.669 | 5.600 | 1,17 | 0,88 | 0,99 | 15 | Cañón Floral, Vozarrón, Meteoros, Beso Drenaje |
| 408 | Komala | Normal | 0,88 (0,89) | 163 | 1.792 | 6.025 | 1,33 | 1,02 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 409 | Tentacruel | Agua/Veneno | 0,87 (0,88) | 349 | 1.478 | 5.505 | 1,14 | 0,86 | 1,02 | 21 | Torbellino, Bomba Ácida, Veneno X, Vozarrón |
| 410 | Mightyena | Siniestro | 0,87 (0,88) | 502 | 1.348 | 5.261 | 1,20 | 1,04 | 0,84 | 14 | Golpe Bajo, Paliza, Tajo Umbrío, Vozarrón |
| 411 | Veluza | Agua/Psíquico | 0,87 (0,88) | 309 | 1.519 | 5.733 | 1,26 | 0,88 | 1,00 | 23 | Géiser Fotónico, Torbellino, Vozarrón, Cascada |
| 412 | Escavalier | Bicho/Acero | 0,87 (0,88) | 389 | 1.433 | 5.742 | 1,44 | 0,88 | 0,99 | 22 | Rayo Señal, Ala de Acero, Disparo Espejo, Puño Meteoro |
| 413 | Ogerpon | Planta | 0,87 (0,88) | 690 | 1.239 | 4.945 | 1,36 | 1,13 | 0,77 | 16 | Hoja Afilada, Látigo Cepa, Bomba Germen, Energibola |
| 414 | Giratina | Fantasma/Dragón | 0,87 (0,82) | 289 | 1.538 | 5.700 | 1,25 | 0,92 | 0,94 | 21 | Viento Aciago, Vozarrón, Homenaje Póstumo, Sombra Vil |
| 415 | Serperior | Planta | 0,87 (0,88) | 583 | 1.287 | 5.076 | 1,11 | 0,95 | 0,91 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 416 | Barraskewda | Agua | 0,87 (0,88) | 230 | 1.622 | 5.893 | 1,38 | 0,99 | 0,87 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 417 | Spiritomb | Fantasma/Siniestro | 0,87 (0,86) | 394 | 1.418 | 5.547 | 1,21 | 0,92 | 0,95 | 21 | Golpe Bajo, Viento Aciago, Vozarrón, Homenaje Póstumo |
| 418 | Eldegoss | Planta | 0,87 (0,88) | 563 | 1.296 | 5.068 | 1,14 | 0,94 | 0,92 | 16 | Energibola, Rayo Solar, Vozarrón, Hoja Afilada |
| 419 | Tinkaton | Hada/Acero | 0,87 (1,28) | 239 | 1.606 | 5.669 | 1,11 | 0,83 | 1,05 | 22 | Cañón Floral, Disparo Espejo, Vozarrón, Ala de Acero |
| 420 | Lumineon | Agua | 0,87 (0,88) | 246 | 1.592 | 5.544 | 1,08 | 0,93 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 421 | Seismitoad | Agua/Tierra | 0,87 (0,88) | 251 | 1.584 | 5.850 | 1,22 | 0,93 | 0,93 | 23 | Torbellino, Bucle Arena, Vozarrón, Huesomerang |
| 422 | Palossand | Fantasma/Tierra | 0,87 (0,84) | 279 | 1.542 | 5.744 | 1,25 | 0,90 | 0,96 | 23 | Viento Aciago, Vozarrón, Homenaje Póstumo, Bucle Arena |
| 423 | Dondozo | Agua | 0,86 (0,87) | 228 | 1.620 | 5.842 | 1,25 | 0,98 | 0,88 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 424 | Ariados | Bicho/Veneno | 0,86 (0,87) | 485 | 1.340 | 5.168 | 1,20 | 0,80 | 1,07 | 21 | Rayo Señal, Veneno X, Bomba Ácida, Vozarrón |
| 425 | Nidoqueen | Veneno/Tierra | 0,86 (0,87) | 468 | 1.349 | 5.443 | 1,21 | 0,90 | 0,96 | 22 | Veneno X, Bomba Ácida, Bucle Arena, Huesomerang |
| 426 | Marowak | Tierra | 0,86 (0,87) | 349 | 1.450 | 5.426 | 1,14 | 1,05 | 0,82 | 16 | Bucle Arena, Huesomerang, Hueso Palo, Vozarrón |
| 427 | Scolipede | Bicho/Veneno | 0,86 (0,87) | 508 | 1.320 | 5.146 | 1,25 | 0,83 | 1,04 | 21 | Veneno X, Rayo Señal, Bomba Ácida, Vozarrón |
| 428 | Calyrex | Psíquico/Planta | 0,86 (0,87) | 398 | 1.401 | 5.163 | 1,14 | 0,85 | 1,01 | 24 | Géiser Fotónico, Vozarrón, Energibola, Rayo Solar |
| 429 | Skuntank | Veneno/Siniestro | 0,86 (0,87) | 536 | 1.300 | 5.112 | 1,21 | 0,89 | 0,97 | 20 | Veneno X, Golpe Bajo, Bomba Ácida, Vozarrón |
| 430 | Kingdra | Agua/Dragón | 0,86 (0,87) | 236 | 1.589 | 5.658 | 1,22 | 0,92 | 0,93 | 21 | Torbellino, Vozarrón, Pistola Agua, Meteoros |
| 431 | Leavanny | Bicho/Planta | 0,86 (0,87) | 451 | 1.351 | 4.864 | 1,27 | 0,83 | 1,04 | 23 | Rayo Señal, Vozarrón, Hoja Afilada, Energibola |
| 432 | Seaking | Agua | 0,86 (0,87) | 233 | 1.594 | 5.713 | 1,21 | 0,96 | 0,89 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 433 | Lickilicky | Normal | 0,86 (0,87) | 149 | 1.781 | 6.097 | 1,17 | 0,98 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 434 | Colagrito | Hada/Psíquico | 0,86 (1,25) | 258 | 1.552 | 5.431 | 1,06 | 0,82 | 1,05 | 23 | Cañón Floral, Géiser Fotónico, Vozarrón, Meteoros |
| 435 | Kricketune | Bicho | 0,86 (0,86) | 407 | 1.383 | 4.889 | 1,17 | 0,90 | 0,95 | 15 | Rayo Señal, Vozarrón, Al Ataque, Pin Misil |
| 436 | Guzzlord | Siniestro/Dragón | 0,85 (0,86) | 391 | 1.395 | 5.218 | 1,26 | 0,94 | 0,91 | 20 | Golpe Bajo, Vozarrón, Paliza, Meteoros |
| 437 | Torterra | Planta/Tierra | 0,85 (0,86) | 350 | 1.431 | 5.302 | 1,30 | 0,99 | 0,86 | 24 | Bucle Arena, Huesomerang, Vozarrón, Hueso Palo |
| 438 | Tsareena | Planta | 0,85 (0,86) | 718 | 1.195 | 4.619 | 1,36 | 1,13 | 0,75 | 16 | Hoja Afilada, Látigo Cepa, Bomba Germen, Energibola |
| 439 | Scizor | Bicho/Acero | 0,85 (0,86) | 380 | 1.398 | 5.601 | 1,42 | 0,87 | 0,98 | 22 | Rayo Señal, Ala de Acero, Disparo Espejo, Puño Meteoro |
| 440 | Drampa | Normal/Dragón | 0,85 (0,86) | 226 | 1.587 | 5.295 | 1,44 | 1,04 | 0,81 | 14 | Vozarrón, Meteoros, Dragoaliento, Ciclón |
| 441 | Dachsbun | Hada | 0,85 (1,27) | 256 | 1.535 | 5.148 | 1,14 | 0,85 | 1,00 | 15 | Cañón Floral, Vozarrón, Beso Drenaje, Golpe Cuerpo |
| 442 | Leafeon | Planta | 0,85 (0,86) | 679 | 1.202 | 4.862 | 1,31 | 1,08 | 0,79 | 16 | Hoja Afilada, Látigo Cepa, Energibola, Bomba Germen |
| 443 | Probopass | Roca/Acero | 0,85 (0,86) | 267 | 1.518 | 5.653 | 1,11 | 0,84 | 1,01 | 22 | Disparo Espejo, Tumba Rocas, Vozarrón, Rodar |
| 444 | Snorlax | Normal | 0,85 (0,86) | 158 | 1.726 | 5.829 | 1,31 | 0,98 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 445 | Morelull | Planta/Hada | 0,85 (1,25) | 265 | 1.516 | 5.200 | 1,06 | 0,80 | 1,05 | 23 | Cañón Floral, Vozarrón, Energibola, Rayo Solar |
| 446 | Trevenant | Fantasma/Planta | 0,84 (0,79) | 465 | 1.317 | 5.276 | 1,31 | 0,92 | 0,92 | 23 | Homenaje Póstumo, Sombra Vil, Viento Aciago, Vozarrón |
| 447 | Togedemaru | Eléctrico/Acero | 0,84 (0,85) | 292 | 1.477 | 5.478 | 1,24 | 0,77 | 1,10 | 22 | Rayo Carga, Bola Voltio, Rueda Aural, Disparo Espejo |
| 448 | Ferroverdor | Planta/Psíquico | 0,84 (0,85) | 505 | 1.286 | 5.037 | 1,42 | 0,92 | 0,91 | 24 | Géiser Fotónico, Hoja Afilada, Látigo Cepa, Vozarrón |
| 449 | Golisopod | Bicho/Agua | 0,84 (0,85) | 300 | 1.461 | 5.707 | 1,39 | 0,85 | 0,99 | 22 | Rayo Señal, Torbellino, Cascada, Vozarrón |
| 450 | Drapion | Veneno/Siniestro | 0,84 (0,85) | 531 | 1.267 | 4.958 | 1,20 | 0,87 | 0,96 | 20 | Veneno X, Golpe Bajo, Bomba Ácida, Vozarrón |
| 451 | Flittle | Psíquico | 0,84 (0,85) | 394 | 1.357 | 4.813 | 1,00 | 0,88 | 0,96 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 452 | Bruxish | Agua/Psíquico | 0,84 (0,85) | 282 | 1.475 | 5.646 | 1,28 | 0,85 | 0,99 | 23 | Géiser Fotónico, Torbellino, Vozarrón, Cascada |
| 453 | Lokix | Bicho/Siniestro | 0,83 (0,84) | 474 | 1.289 | 5.053 | 1,26 | 0,89 | 0,94 | 21 | Golpe Bajo, Rayo Señal, Paliza, Vozarrón |
| 454 | Zangoose | Normal | 0,83 (0,84) | 157 | 1.699 | 5.772 | 1,33 | 0,97 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 455 | Kingler | Agua | 0,83 (0,84) | 210 | 1.579 | 5.818 | 1,42 | 1,04 | 0,80 | 15 | Cascada, Torbellino, Golpe Cuerpo, Vozarrón |
| 456 | Malamar | Siniestro/Psíquico | 0,83 (0,84) | 419 | 1.326 | 5.005 | 1,21 | 0,87 | 0,96 | 22 | Géiser Fotónico, Golpe Bajo, Vozarrón, Paliza |
| 457 | Spidops | Bicho | 0,83 (0,84) | 390 | 1.348 | 4.719 | 1,13 | 0,87 | 0,95 | 15 | Rayo Señal, Vozarrón, Al Ataque, Pin Misil |
| 458 | Goodra | Dragón | 0,83 (0,84) | 251 | 1.503 | 5.178 | 1,31 | 1,04 | 0,80 | 14 | Vozarrón, Meteoros, Dragoaliento, Ciclón |
| 459 | Forretress | Bicho/Acero | 0,83 (0,84) | 361 | 1.369 | 5.326 | 1,20 | 0,79 | 1,04 | 22 | Rayo Señal, Disparo Espejo, Ala de Acero, Vozarrón |
| 460 | Whiscash | Agua/Tierra | 0,83 (0,84) | 221 | 1.543 | 5.544 | 1,13 | 0,87 | 0,95 | 23 | Torbellino, Vozarrón, Bucle Arena, Huesomerang |
| 461 | Zygarde | Dragón/Tierra | 0,83 (0,84) | 269 | 1.469 | 5.436 | 1,25 | 0,95 | 0,87 | 22 | Bucle Arena, Vozarrón, Huesomerang, Hueso Palo |
| 462 | Thievul | Siniestro | 0,83 (0,83) | 377 | 1.348 | 5.032 | 1,18 | 0,92 | 0,90 | 14 | Golpe Bajo, Vozarrón, Paliza, Meteoros |
| 463 | Medicham | Lucha/Psíquico | 0,82 (0,77) | 336 | 1.384 | 5.323 | 1,03 | 0,79 | 1,05 | 23 | Tajo Cruzado, Géiser Fotónico, Puño Dinámico, Vozarrón |
| 464 | Runerigus | Tierra/Fantasma | 0,82 (0,79) | 471 | 1.268 | 5.047 | 1,22 | 0,94 | 0,87 | 23 | Homenaje Póstumo, Bucle Arena, Huesomerang, Hueso Palo |
| 465 | Dwebble | Bicho/Roca | 0,82 (0,83) | 302 | 1.413 | 5.005 | 1,06 | 0,86 | 0,96 | 22 | Tumba Rocas, Rayo Señal, Rodar, Lanzarrocas |
| 466 | Parasect | Bicho/Planta | 0,82 (0,83) | 441 | 1.283 | 4.624 | 1,22 | 0,79 | 1,03 | 23 | Rayo Señal, Vozarrón, Hoja Afilada, Energibola |
| 467 | Mimikyu | Fantasma/Hada | 0,82 (1,08) | 356 | 1.351 | 5.396 | 1,20 | 0,83 | 0,98 | 22 | Homenaje Póstumo, Cañón Floral, Sombra Vil, Viento Aciago |
| 468 | Flygon | Tierra/Dragón | 0,82 (0,83) | 283 | 1.429 | 5.426 | 1,25 | 0,96 | 0,85 | 22 | Bucle Arena, Huesomerang, Vozarrón, Hueso Palo |
| 469 | Ambipom | Normal | 0,82 (0,83) | 152 | 1.668 | 5.620 | 1,25 | 0,95 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 470 | Beedrill | Bicho/Veneno | 0,82 (0,83) | 517 | 1.228 | 4.773 | 1,20 | 0,81 | 1,01 | 21 | Veneno X, Rayo Señal, Bomba Ácida, Picotazo Veneno |
| 471 | Oinkologne | Normal | 0,81 (0,82) | 152 | 1.657 | 5.589 | 1,25 | 0,94 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 472 | Claydol | Tierra/Psíquico | 0,81 (0,82) | 303 | 1.389 | 5.131 | 1,08 | 0,83 | 0,97 | 24 | Géiser Fotónico, Vozarrón, Bucle Arena, Huesomerang |
| 473 | Wugtrio | Agua | 0,81 (0,82) | 211 | 1.519 | 5.502 | 1,25 | 0,92 | 0,88 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 474 | Blissey | Normal | 0,81 (0,82) | 148 | 1.661 | 5.451 | 1,11 | 0,92 | 0,88 | 8 | Vozarrón, Meteoros, Hiperrayo, Golpe Cuerpo |
| 475 | Castform | Normal | 0,81 (0,82) | 140 | 1.682 | 5.740 | 1,08 | 0,92 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 476 | Azumarill | Agua/Hada | 0,81 (1,18) | 195 | 1.550 | 5.400 | 1,03 | 0,79 | 1,02 | 22 | Cañón Floral, Torbellino, Vozarrón, Pistola Agua |
| 477 | Kecleon | Normal | 0,81 (0,82) | 162 | 1.620 | 5.526 | 1,20 | 0,92 | 0,88 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Ataque Rápido |
| 478 | Cinccino | Normal | 0,81 (0,82) | 140 | 1.682 | 5.838 | 1,22 | 0,93 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 479 | Mawile | Acero/Hada | 0,81 (1,17) | 219 | 1.500 | 5.552 | 1,17 | 0,79 | 1,02 | 22 | Cañón Floral, Disparo Espejo, Ala de Acero, Vozarrón |
| 480 | Regidrago | Dragón | 0,81 (0,81) | 245 | 1.457 | 5.006 | 1,25 | 0,99 | 0,81 | 14 | Vozarrón, Meteoros, Dragoaliento, Ráfaga Escamas |
| 481 | Volbeat | Bicho | 0,81 (0,81) | 382 | 1.303 | 4.574 | 1,10 | 0,85 | 0,95 | 15 | Rayo Señal, Vozarrón, Al Ataque, Pin Misil |
| 482 | Pikipek | Normal/Volador | 0,80 (0,81) | 234 | 1.467 | 4.818 | 1,11 | 0,73 | 1,10 | 15 | Tajo Aéreo, Vozarrón, Golpe Cuerpo, Golpe Aéreo |
| 483 | Durant | Bicho/Acero | 0,80 (0,81) | 361 | 1.316 | 5.246 | 1,30 | 0,81 | 0,99 | 22 | Rayo Señal, Ala de Acero, Disparo Espejo, Puño Meteoro |
| 484 | Umbreon | Siniestro | 0,80 (0,81) | 442 | 1.250 | 4.861 | 1,06 | 0,93 | 0,87 | 14 | Golpe Bajo, Paliza, Vozarrón, Tajo Umbrío |
| 485 | Quagsire | Agua/Tierra | 0,80 (0,81) | 232 | 1.467 | 5.553 | 1,17 | 0,87 | 0,92 | 23 | Torbellino, Bucle Arena, Huesomerang, Vozarrón |
| 486 | Furfrou | Normal | 0,80 (0,81) | 139 | 1.666 | 5.736 | 1,14 | 0,92 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 487 | Maushold | Normal | 0,80 (0,81) | 138 | 1.660 | 5.698 | 1,11 | 0,91 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 488 | Persian | Normal | 0,80 (0,80) | 138 | 1.655 | 5.659 | 1,08 | 0,91 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 489 | Gourgeist | Fantasma/Planta | 0,80 (0,75) | 423 | 1.250 | 4.921 | 1,20 | 0,83 | 0,96 | 23 | Homenaje Póstumo, Viento Aciago, Vozarrón, Sombra Vil |
| 490 | Purugly | Normal | 0,80 (0,80) | 138 | 1.654 | 5.709 | 1,15 | 0,91 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 491 | Bastiodon | Roca/Acero | 0,79 (0,80) | 234 | 1.448 | 5.189 | 0,99 | 0,79 | 1,00 | 22 | Tumba Rocas, Disparo Espejo, Vozarrón, Rodar |
| 492 | Greedent | Normal | 0,79 (0,80) | 148 | 1.622 | 5.469 | 1,22 | 0,92 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 493 | Panpour | Agua | 0,79 (0,80) | 233 | 1.449 | 5.044 | 0,99 | 0,86 | 0,92 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 494 | Terapagos | Normal | 0,79 (0,80) | 138 | 1.651 | 5.634 | 1,06 | 0,91 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 495 | Carbink | Roca/Hada | 0,79 (1,15) | 182 | 1.535 | 5.446 | 0,97 | 0,81 | 0,98 | 22 | Tumba Rocas, Cañón Floral, Vozarrón, Rodar |
| 496 | Steelix | Acero/Tierra | 0,79 (0,80) | 305 | 1.348 | 5.302 | 1,17 | 0,84 | 0,94 | 23 | Disparo Espejo, Bucle Arena, Huesomerang, Ala de Acero |
| 497 | Haxorus | Dragón | 0,79 (0,80) | 324 | 1.321 | 5.292 | 1,51 | 1,22 | 0,65 | 14 | Ráfaga Escamas, Enfado, Golpe Cuerpo, Vozarrón |
| 498 | Palafin | Agua | 0,79 (0,80) | 219 | 1.457 | 5.184 | 1,08 | 0,89 | 0,89 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 499 | Stoutland | Normal | 0,79 (0,80) | 150 | 1.599 | 5.481 | 1,31 | 0,92 | 0,85 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 500 | Ferrothorn | Planta/Acero | 0,79 (0,79) | 370 | 1.274 | 4.769 | 1,22 | 0,81 | 0,97 | 23 | Disparo Espejo, Ala de Acero, Vozarrón, Hoja Afilada |
| 501 | Watchog | Normal | 0,78 (0,79) | 136 | 1.631 | 5.653 | 1,17 | 0,90 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 502 | Dubwool | Normal | 0,78 (0,79) | 135 | 1.625 | 5.615 | 1,14 | 0,90 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 503 | Sableye | Siniestro/Fantasma | 0,78 (0,77) | 417 | 1.226 | 4.984 | 1,11 | 0,83 | 0,94 | 21 | Golpe Bajo, Homenaje Póstumo, Viento Aciago, Vozarrón |
| 504 | Clodsire | Veneno/Tierra | 0,78 (0,79) | 411 | 1.230 | 4.914 | 1,11 | 0,83 | 0,94 | 22 | Veneno X, Bucle Arena, Bomba Ácida, Huesomerang |
| 505 | Toxapex | Veneno/Agua | 0,78 (0,79) | 391 | 1.245 | 4.841 | 1,05 | 0,77 | 1,02 | 21 | Veneno X, Torbellino, Bomba Ácida, Vozarrón |
| 506 | Obstagoon | Siniestro/Normal | 0,78 (0,78) | 358 | 1.264 | 4.765 | 1,20 | 0,87 | 0,89 | 14 | Golpe Bajo, Vozarrón, Paliza, Tajo Umbrío |
| 507 | Dustox | Bicho/Veneno | 0,77 (0,78) | 418 | 1.211 | 4.622 | 0,97 | 0,72 | 1,08 | 21 | Rayo Señal, Bomba Ácida, Veneno X, Vozarrón |
| 508 | Araquanid | Agua/Bicho | 0,77 (0,78) | 284 | 1.332 | 5.009 | 1,08 | 0,74 | 1,04 | 22 | Rayo Señal, Torbellino, Vozarrón, Cascada |
| 509 | Spinda | Normal | 0,77 (0,78) | 134 | 1.604 | 5.474 | 1,03 | 0,88 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 510 | Audino | Normal | 0,77 (0,78) | 134 | 1.604 | 5.474 | 1,03 | 0,88 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 511 | Sawsbuck | Normal/Planta | 0,77 (0,77) | 393 | 1.215 | 4.355 | 1,25 | 0,82 | 0,93 | 16 | Vozarrón, Hoja Afilada, Látigo Cepa, Energibola |
| 512 | Dracovish | Agua/Dragón | 0,76 (0,77) | 192 | 1.451 | 5.183 | 1,20 | 0,83 | 0,92 | 21 | Torbellino, Vozarrón, Cascada, Pistola Agua |
| 513 | Raticate | Normal | 0,76 (0,77) | 142 | 1.561 | 5.242 | 1,15 | 0,88 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 514 | Lopunny | Normal | 0,76 (0,77) | 131 | 1.580 | 5.468 | 1,12 | 0,87 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 515 | Shedinja | Bicho/Fantasma | 0,76 (0,70) | 437 | 1.168 | 4.667 | 1,20 | 0,81 | 0,94 | 22 | Homenaje Póstumo, Rayo Señal, Sombra Vil, Lengüetazo |
| 516 | Tauros | Normal | 0,76 (0,77) | 144 | 1.541 | 5.273 | 1,25 | 0,89 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 517 | Delcatty | Normal | 0,75 (0,76) | 131 | 1.569 | 5.392 | 1,06 | 0,86 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 518 | Foongus | Planta/Veneno | 0,75 (0,76) | 420 | 1.169 | 4.541 | 1,00 | 0,74 | 1,02 | 22 | Bomba Ácida, Veneno X, Vozarrón, Energibola |
| 519 | Kangaskhan | Normal | 0,75 (0,76) | 142 | 1.530 | 5.216 | 1,22 | 0,88 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 520 | Alomomola | Agua | 0,75 (0,76) | 199 | 1.403 | 5.057 | 1,11 | 0,85 | 0,88 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 521 | Furret | Normal | 0,75 (0,75) | 139 | 1.526 | 5.122 | 1,12 | 0,86 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 522 | Druddigon | Dragón | 0,74 (0,75) | 223 | 1.344 | 5.022 | 1,36 | 0,98 | 0,76 | 14 | Vozarrón, Ráfaga Escamas, Enfado, Golpe Cuerpo |
| 523 | Aegislash | Acero/Fantasma | 0,74 (0,73) | 282 | 1.262 | 4.772 | 0,97 | 0,72 | 1,03 | 22 | Disparo Espejo, Viento Aciago, Vozarrón, Homenaje Póstumo |
| 524 | Luvdisc | Agua | 0,73 (0,74) | 213 | 1.345 | 4.647 | 0,92 | 0,79 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 525 | Miltank | Normal | 0,73 (0,74) | 138 | 1.499 | 5.065 | 1,14 | 0,85 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 526 | Rellor | Bicho | 0,73 (0,74) | 348 | 1.184 | 4.132 | 0,97 | 0,75 | 0,97 | 15 | Rayo Señal, Vozarrón, Al Ataque, Pin Misil |
| 527 | Wobbuffet | Psíquico | 0,73 (0,74) | 336 | 1.191 | 4.228 | 0,88 | 0,77 | 0,95 | 16 | Géiser Fotónico, Vozarrón, Confusión, Bola Neblina |
| 528 | Bramblin | Planta/Fantasma | 0,72 (0,70) | 415 | 1.119 | 4.404 | 1,06 | 0,75 | 0,97 | 23 | Homenaje Póstumo, Viento Aciago, Vozarrón, Energibola |
| 529 | Ditto | Normal | 0,72 (0,73) | 125 | 1.495 | 5.102 | 0,96 | 0,82 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |
| 530 | Cyclizar | Dragón/Normal | 0,72 (0,73) | 177 | 1.370 | 4.631 | 1,22 | 0,86 | 0,84 | 14 | Vozarrón, Meteoros, Golpe Cuerpo, Ráfaga Escamas |
| 531 | Bibarel | Normal/Agua | 0,72 (0,72) | 174 | 1.368 | 4.936 | 1,17 | 0,78 | 0,91 | 15 | Torbellino, Vozarrón, Cascada, Pistola Agua |
| 532 | Pyukumuku | Agua | 0,71 (0,71) | 184 | 1.328 | 4.783 | 1,03 | 0,80 | 0,89 | 15 | Torbellino, Cascada, Vozarrón, Pistola Agua |
| 533 | Yungoos | Normal | 0,69 (0,70) | 129 | 1.407 | 4.761 | 1,08 | 0,80 | 0,86 | 8 | Vozarrón, Golpe Cuerpo, Meteoros, Ataque Rápido |
| 534 | Diggersby | Normal/Tierra | 0,68 (0,68) | 219 | 1.203 | 4.463 | 1,01 | 0,78 | 0,87 | 16 | Bucle Arena, Vozarrón, Huesomerang, Hueso Palo |
| 535 | Wishiwashi | Agua | 0,67 (0,68) | 189 | 1.240 | 4.301 | 0,84 | 0,72 | 0,93 | 15 | Torbellino, Vozarrón, Pistola Agua, Cascada |
| 536 | Shuckle | Bicho/Roca | 0,63 (0,64) | 203 | 1.131 | 4.057 | 0,76 | 0,62 | 1,02 | 22 | Tumba Rocas, Rayo Señal, Vozarrón, Rodar |
| 537 | Smeargle | Normal | 0,61 (0,61) | 105 | 1.261 | 4.305 | 0,81 | 0,69 | 0,87 | 8 | Vozarrón, Meteoros, Golpe Cuerpo, Hiperrayo |

