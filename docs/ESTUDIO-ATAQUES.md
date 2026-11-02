# Estudio de los ataques (2026-11-02)

Hecho con `tools/estudio.cjs` a partir de `tools/balance.cjs --pasivos` (combate de verdad, semilla fija: sale siempre
lo mismo). Cómo se mide cada columna, en la cabecera de `tools/estudio.cjs`. Para repetirlo:

```
node tools/balance.cjs --pasivos --json bal.json
node tools/estudio.cjs bal.json > docs/ESTUDIO-ATAQUES.md
```

## Lo que afecta a todos los ataques por igual

Multiplican el daño o la recarga de **todos** los ataques igual, así que no cambian cuál es mejor (no salen en las tablas):

- **Cartas de la partida**: Potencia +10 % de daño por carta (hasta 10); Reflejos −8 % de recarga por carta (hasta 6; un
  aura golpea más a menudo); Puntería +5 % de crítico y +10 % de daño crítico por carta (hasta 5; los que tienen crítico
  propio, como Golpe Kárate, Hoja Afilada o Tajo Aéreo, ganan algo más: columna «Puntería»). Vigor, Carrera, Coraza,
  Síntesis, Imán y Aprendizaje no tocan el daño: sólo deciden **qué ataques evolucionan** (y pocos ataques leen tu vida o
  tu velocidad: Tambor, Rueda Fuego, Giro Bola, Agilidad...).
- **Objetos de la partida** (uno a la vez): Restos (Recuperas un 1,5% de tu vida por segundo); Cinta Elección (+40% de daño, pero no puedes cambiar de movimiento); Garra Rápida (-20% de recarga en todos tus movimientos); Banda Focus (Un golpe que te dejaría KO te deja con 1 de vida (cada 60 s)); Cascabel Concha (Recuperas vida con el daño que haces); Moneda Amuleto (+50% de Pokémonedas al acabar la run); Huevo Suerte (+30% de experiencia); Vidasfera (+30% de daño, pero cada ataque te quita un poco de vida); Pañuelo Elección (+35% de velocidad); Casco Dentado (Los que te golpean cuerpo a cuerpo reciben daño); Chaleco Asalto (+20% de reducción de daño recibido).
- **Mejoras de la torre**: Fuerza +4% daño (hasta 10); Reflejos -3% recarga (hasta 8); Golpe Crítico +3% de críticos (x1,5 de daño) (hasta 10); Persistencia +4% duración de los efectos (hasta 8); Propulsión +3% velocidad de proyectiles (hasta 8); Réplica +1 proyectil en todos los ataques (hasta 1). Persistencia, Propulsión y Réplica de la torre suman a las cartas del mismo nombre (abajo, columnas «pasivas»).
- **El jugador**: cada ataque sin evolucionar ×1,08 y evolucionado ×0,74 (`Player.MOVE_K` / `EVO_K`): ya va en «evo/máx».

## Cuánto vale cada pasiva

Lo que gana el DPS con todas las cartas de esa pasiva (media de todos los ataques que pegan, al máximo y evolucionados):

| Pasiva | Cartas | En total | Por carta |
|---|---|---|---|
| Amplitud | 5 | +18 % | +3 % |
| Persistencia | 5 | +3 % | +1 % |
| Réplica | 3 | +28 % | +9 % |
| Propulsión | 5 | +4 % | +1 % |
| Puntería | 5 | +25 % | +5 % |
| Potencia (para comparar) | 10 | +100 % | +10 % |

Amplitud, Persistencia y Propulsión dan además cosas que no son daño (más área para tocar enemigos, efectos que duran
más, disparos que llegan antes): por eso a algunos ataques no les suben el DPS.

## Números: nivel máximo y evolucionado

Ordenada por el valor evolucionado. Los potenciadores, escudos y barridos (no pegan o casi) van al final, sin valor.

| Ataque | Familia | Máx: DPS jefe / horda | valor | Evo: DPS jefe / horda | valor | evo/máx jefe · horda (antes) | control | frenado | cura · bloqueos | Amplitud | Persistencia | Réplica | Propulsión | Puntería |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hoja Afilada → Lluevehojas | Bumerán | 141,3 / 300,0 | 1,04 | 249,1 / 1988,1 | 1,19 | 1,21 · 4,54 (0,46 · 8,88) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | 0 % | +0 % | +73 % | -1 % | +33 % |
| Ascuas → Llamarada | Proyectil | 119,5 / 451,5 | 1,17 | 272,5 / 1755,8 | 1,17 | 1,56 · 2,66 (1,56 · 2,66) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +11 % | +0 % | +71 % | -1 % | +28 % |
| Psicocorte → Psicocolmillo | Bumerán | 60,7 / 876,5 | 1,16 | 172,4 / 2764,2 | 1,17 | 1,95 · 2,16 (1,95 · 2,16) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +20 % | +0 % | +86 % | +0 % | +34 % |
| Onda Ígnea → Erupción | Estallido | 39,6 / 1066,6 | 1,04 | 158,7 / 3002,8 | 1,17 | 2,75 · 1,93 (2,55 · 1,34) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +3 % | +0 % | +10 % | +3 % | +24 % |
| Giro Bola → Cuerpo Pesado | Giro | 57,7 / 903,0 | 1,15 | 153,4 / 3089,9 | 1,17 | 1,82 · 2,34 (1,82 · 2,34) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +64 % | +0 % | +67 % | +0 % | +19 % |
| Púas → Fisura | Minas | 147,2 / 202,4 | 0,87 | 322,4 / 1469,4 | 1,17 | 1,50 · 4,97 (0,75 · 4,97) | 0,0 → 0,0 | 2,8 → 6,3 | 0,0 · 0,00 | -12 % | +0 % | +36 % | +0 % | +19 % |
| Golpe Bajo → Juego Sucio | Teledirigido | 108,3 / 322,1 | 0,94 | 486,4 / 969,0 | 1,16 | 3,08 · 2,06 (3,08 · 2,06) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +41 % | +0 % | +28 % |
| Energibola → Gigadrenado | Teledirigido | 232,2 / 232,2 | 1,17 | 592,2 / 795,8 | 1,16 | 1,75 · 2,35 (1,75 · 2,35) | 0,0 → 0,0 | 0,0 → 0,0 | 25,4 · 0,00 | +0 % | +0 % | +100 % | +0 % | +24 % |
| Magnitud → Taladradora | Temblor | 75,1 / 394,0 | 0,87 | 186,1 / 2514,9 | 1,16 | 1,70 · 4,37 (1,70 · 4,37) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +61 % | +0 % | +0 % | +2 % | +23 % |
| Lanzallamas → Sofoco | Abanico | 53,1 / 556,8 | 0,87 | 159,2 / 2934,1 | 1,16 | 2,05 · 3,61 (1,68 · 2,86) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +4 % | +0 % | +1 % | +0 % | +23 % |
| Látigo Cepa → Latigazo | Golpe | 97,7 / 534,8 | 1,15 | 496,8 / 928,8 | 1,15 | 3,48 · 1,19 (2,45 · 0,84) | 1,3 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +2 % | +0 % | +0 % | +0 % | +26 % |
| Ciclón → Dracoenergía | Aspas | 41,6 / 799,5 | 0,92 | 142,7 / 3228,5 | 1,15 | 2,35 · 2,77 (2,35 · 2,77) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +20 % | +0 % | +59 % | +101 % | +30 % |
| Liofilización → Frío Polar | Aturdimiento | 41,7 / 722,8 | 0,87 | 293,9 / 1563,3 | 1,15 | 4,83 · 1,48 (4,83 · 1,48) | 8,1 → 10,8 | 0,0 → 0,0 | 0,0 · 0,00 | +36 % | +7 % | +79 % | +0 % | +17 % |
| Ciclón Primavera → Furia Natural | Chaparrón | 39,9 / 853,3 | 0,93 | 155,3 / 2944,2 | 1,15 | 2,67 · 2,36 (2,79 · 2,48) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +23 % | +0 % | +16 % | +17 % | +23 % |
| Confusión → Psicocarga | Proyectil | 135,5 / 402,2 | 1,18 | 337,6 / 1353,6 | 1,15 | 1,71 · 2,31 (1,71 · 2,31) | 3,1 → 5,4 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +96 % | -3 % | +25 % |
| Rayo Solar → Cuchilla Solar | Carga | 69,7 / 517,4 | 0,96 | 160,3 / 2839,6 | 1,14 | 1,58 · 3,76 (1,30 · 4,73) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +23 % | +0 % | +0 % | +16 % | +21 % |
| Cañón Floral → Luz Aniquiladora | Aguja | 30,4 / 1763,4 | 1,17 | 100,5 / 4518,3 | 1,14 | 2,27 · 1,76 (2,27 · 1,76) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | -1 % | +50 % | +142 % | +51 % | +15 % |
| Bomba Germen → Mazazo | Rebote | 100,2 / 544,8 | 1,18 | 271,8 / 1670,6 | 1,14 | 1,86 · 2,10 (1,86 · 2,10) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +54 % | +0 % | +105 % | +0 % | +24 % |
| Fiebre Dorada → Deseo Oculto | Chaparrón | 38,9 / 1110,9 | 1,05 | 148,6 / 3046,3 | 1,14 | 2,62 · 1,88 (2,62 · 1,88) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +34 % | +0 % | +28 % | +96 % | +23 % |
| Granizo → Alud | Meteoro | 96,2 / 396,5 | 0,98 | 301,9 / 1497,8 | 1,14 | 2,15 · 2,59 (2,15 · 2,59) | 0,0 → 1,2 | 9,1 → 14,2 | 0,0 · 0,00 | +10 % | +0 % | +41 % | +2 % | +26 % |
| Psicorrayo → Premonición | Haz | 60,0 / 447,5 | 0,83 | 259,1 / 1743,9 | 1,14 | 2,96 · 2,67 (2,96 · 2,67) | 1,7 → 1,6 | 0,0 → 0,0 | 0,0 · 0,00 | +22 % | +0 % | +0 % | +0 % | +23 % |
| Pistola Agua → Escaldar | Proyectil | 128,0 / 417,6 | 1,16 | 400,8 / 1126,8 | 1,14 | 2,15 · 1,85 (2,15 · 1,85) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +4 % | +0 % | +77 % | +1 % | +22 % |
| Gancho Alto → Puño Certero | Columna | 43,6 / 1149,7 | 1,13 | 163,1 / 2758,4 | 1,14 | 2,56 · 1,64 (2,83 · 1,05) | 2,9 → 2,3 | 0,0 → 0,0 | 0,0 · 0,00 | +22 % | +33 % | +36 % | +0 % | +31 % |
| Puño Meteoro → Bomba Imán | Meteoro | 55,5 / 973,0 | 1,17 | 170,1 / 2637,9 | 1,13 | 2,10 · 1,86 (2,10 · 1,86) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +42 % | +0 % | +61 % | +5 % | +23 % |
| Giro Rápido → Triataque | Giro | 58,4 / 756,0 | 1,06 | 193,1 / 2319,5 | 1,13 | 2,27 · 2,10 (2,27 · 2,10) | 0,0 → 2,9 | 0,0 → 1,4 | 0,0 · 0,00 | +74 % | +0 % | +69 % | +0 % | +21 % |
| Bomba Ácida → Onda Tóxica | Rebote | 75,6 / 431,8 | 0,91 | 138,3 / 3232,6 | 1,13 | 1,25 · 5,13 (1,25 · 5,13) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | 0 % | +0 % | +135 % | 0 % | +32 % |
| Rueda Aural → Ataque Fulgor | Carambola | 75,8 / 710,3 | 1,17 | 236,3 / 1891,1 | 1,13 | 2,14 · 1,82 (2,14 · 1,82) | 3,4 → 3,6 | 0,0 → 0,0 | 0,0 · 0,00 | +10 % | +0 % | +99 % | -9 % | +21 % |
| Ráfaga Escamas → Fragor Escamas | Ráfaga | 118,8 / 448,2 | 1,16 | 291,2 / 1533,7 | 1,13 | 1,68 · 2,34 (1,68 · 2,34) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +2 % | +0 % | +70 % | -1 % | +31 % |
| Furia Dragón → Cometa Draco | Haz | 112,0 / 497,2 | 1,19 | 257,3 / 1734,2 | 1,13 | 1,57 · 2,39 (1,57 · 2,39) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +8 % | +0 % | +0 % | +0 % | +22 % |
| Impactrueno → Trueno | Proyectil | 81,0 / 464,1 | 0,98 | 222,0 / 2009,1 | 1,13 | 1,88 · 2,97 (1,62 · 2,52) | 1,5 → 7,4 | 0,0 → 0,0 | 0,0 · 0,00 | +5 % | +0 % | +97 % | +10 % | +29 % |
| Tumba Rocas → Testarazo | Aturdimiento | 60,8 / 402,8 | 0,79 | 178,0 / 2504,1 | 1,13 | 2,01 · 4,26 (2,01 · 4,26) | 3,7 → 8,3 | 1,7 → 4,4 | 0,0 · 0,00 | +53 % | +0 % | +124 % | +0 % | +29 % |
| Remolino → Huracán | Empujón | 56,4 / 350,2 | 0,71 | 232,7 / 1910,6 | 1,13 | 2,83 · 3,74 (2,83 · 3,74) | 6,0 → 4,4 | 0,0 → 0,0 | 0,0 · 0,00 | +35 % | +0 % | +0 % | +0 % | +26 % |
| Burbuja → Surf | Estallido | 63,7 / 662,9 | 1,04 | 143,0 / 3107,5 | 1,13 | 1,54 · 3,21 (0,95 · 3,65) | 7,2 → 6,8 | 0,0 → 13,9 | 0,0 · 0,00 | +9 % | +0 % | +17 % | -7 % | +29 % |
| Residuos → Bomba Lodo | Proyectil | 122,1 / 387,2 | 1,10 | 347,9 / 1276,5 | 1,13 | 1,95 · 2,26 (1,95 · 2,26) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +1 % | +0 % | +66 % | -1 % | +28 % |
| Zumbido → Enjambre | Aura | 44,7 / 1171,2 | 1,15 | 108,4 / 4084,8 | 1,13 | 1,66 · 2,39 (1,66 · 2,39) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +36 % | +0 % | +0 % | +0 % | +21 % |
| Esfera Aural → Onda Certera | Proyectil | 168,4 / 314,5 | 1,16 | 298,2 / 1477,1 | 1,12 | 1,21 · 3,22 (1,00 · 4,01) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +1 % | +0 % | +97 % | +4 % | +26 % |
| Rayo Hielo → Ventisca | Haz | 75,6 / 334,3 | 0,80 | 182,4 / 2413,0 | 1,12 | 1,65 · 4,95 (1,24 · 5,14) | 0,7 → 4,7 | 2,9 → 5,3 | 0,0 · 0,00 | +4 % | +0 % | +0 % | +0 % | +32 % |
| Tormenta Floral → Danza Pétalo | Órbita | 51,6 / 1038,0 | 1,17 | 139,2 / 3160,9 | 1,12 | 1,85 · 2,09 (1,85 · 2,09) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +1 % | +0 % | +44 % | +30 % | +26 % |
| Disparo Espejo → Metaláser | Rebote | 61,6 / 462,0 | 0,85 | 202,9 / 2168,3 | 1,12 | 2,26 · 3,22 (2,26 · 3,22) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +158 % | +0 % | +29 % |
| Disparo Lodo → Tierra Viva | Estallido | 65,7 / 610,2 | 1,01 | 144,8 / 3034,6 | 1,12 | 1,51 · 3,41 (1,51 · 3,41) | 4,3 → 1,3 | 6,4 → 9,8 | 0,0 · 0,00 | +9 % | +0 % | +18 % | -3 % | +30 % |
| Rayo → Electrocañón | Cadena | 82,6 / 400,4 | 0,92 | 315,1 / 1391,0 | 1,12 | 2,61 · 2,38 (2,51 · 2,20) | 0,0 → 6,8 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +7 % | +0 % | +26 % |
| Hidrobomba → Hidrocañón | Haz | 89,7 / 586,2 | 1,16 | 294,6 / 1485,2 | 1,12 | 2,25 · 1,74 (2,31 · 1,19) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +13 % | +0 % | +0 % | +0 % | +20 % |
| Golpe Cuerpo → Gigaimpacto | Golpe | 50,0 / 1063,8 | 1,16 | 87,8 / 4958,2 | 1,12 | 1,20 · 3,19 (0,78 · 3,08) | 11,2 → 12,1 | 0,1 → 0,0 | 0,0 · 0,00 | +33 % | +0 % | +0 % | +0 % | +29 % |
| Tajo Umbrío → Lariat Oscuro | Giro | 54,8 / 945,0 | 1,15 | 137,6 / 3163,7 | 1,12 | 1,72 · 2,29 (1,72 · 2,29) | 30,4 → 28,7 | 0,0 → 0,0 | 0,0 · 0,00 | +80 % | +0 % | +69 % | +0 % | +28 % |
| Beso Drenaje → Luz Lunar | Teledirigido | 227,7 / 232,7 | 1,16 | 655,5 / 664,1 | 1,12 | 1,97 · 1,96 (1,97 · 1,96) | 1,0 → 1,7 | 0,0 → 0,0 | 139,8 · 0,00 | +0 % | +0 % | +100 % | +0 % | +18 % |
| Dragoaliento → Pulso Dragón | Abanico | 94,4 / 565,8 | 1,16 | 256,6 / 1693,9 | 1,12 | 1,86 · 2,05 (1,27 · 1,72) | 11,2 → 11,0 | 0,1 → 0,1 | 0,0 · 0,00 | +11 % | +0 % | +24 % | +4 % | +26 % |
| Sombra Vil → Garra Umbría | Teledirigido | 101,8 / 305,3 | 0,89 | 200,5 / 2166,5 | 1,12 | 1,35 · 4,86 (1,01 · 6,84) | 2,9 → 3,8 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +41 % | +0 % | +19 % |
| Ataque Ala → Pájaro Osado | Golpe | 55,0 / 940,0 | 1,15 | 174,0 / 2487,0 | 1,11 | 2,17 · 1,81 (2,17 · 1,81) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +53 % | +0 % | +0 % | +0 % | +28 % |
| Mordisco → Triturar | Golpe | 45,0 / 1198,3 | 1,17 | 172,1 / 2504,7 | 1,11 | 2,62 · 1,43 (2,62 · 1,43) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +85 % | +0 % | +0 % | +0 % | +21 % |
| Placaje → Derribo | Golpe | 46,5 / 1131,0 | 1,16 | 140,0 / 3078,3 | 1,11 | 2,06 · 1,86 (2,06 · 1,86) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +77 % | +0 % | +0 % | +0 % | +23 % |
| Joya de Luz → Rayo Meteórico | Rebote | 100,0 / 478,6 | 1,10 | 251,2 / 1712,3 | 1,11 | 1,72 · 2,45 (1,72 · 2,45) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +11 % | +0 % | +131 % | -3 % | +22 % |
| Picadura → Tijera X | Golpe | 41,9 / 1053,0 | 1,06 | 142,4 / 3016,0 | 1,11 | 2,33 · 1,96 (2,33 · 1,96) | 0,0 → 0,0 | 0,0 → 0,0 | 10,2 · 0,00 | +89 % | +0 % | +0 % | +0 % | +26 % |
| Ala de Acero → Meteoimpacto | Aves | 67,6 / 804,4 | 1,17 | 169,9 / 2526,2 | 1,11 | 1,72 · 2,15 (1,72 · 2,15) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +16 % | -1 % | +91 % | +0 % | +24 % |
| Nieve Polvo → Viento Hielo | Aura | 40,0 / 1280,8 | 1,14 | 95,6 / 4484,1 | 1,11 | 1,64 · 2,40 (1,64 · 2,40) | 4,4 → 7,2 | 7,9 → 13,2 | 0,0 · 0,00 | +29 % | +0 % | +0 % | +0 % | +27 % |
| Golpe Aéreo → Acróbata | Embestida | 104,4 / 332,0 | 0,94 | 317,0 / 1351,4 | 1,11 | 2,08 · 2,79 (0,97 · 5,08) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +0 % | +0 % | +21 % |
| Veneno X → Garra Nociva | Aspas | 112,0 / 496,0 | 1,19 | 248,8 / 1711,7 | 1,11 | 1,52 · 2,36 (1,52 · 2,36) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +1 % | +0 % | +60 % | +3 % | +24 % |
| Picotazo Veneno → Puya Nociva | Proyectil | 135,0 / 261,9 | 0,95 | 262,5 / 1619,9 | 1,10 | 1,33 · 4,24 (1,55 · 2,09) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +1 % | +0 % | +62 % | +0 % | +24 % |
| Poder Pasado → Tormenta de Diamantes | Órbita | 70,3 / 741,9 | 1,15 | 224,2 / 1894,1 | 1,10 | 2,19 · 1,75 (2,19 · 1,75) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +17 % | +0 % | +64 % | +29 % | +25 % |
| Paliza → Cerco Dimensión | Aliados | 217,1 / 248,0 | 1,17 | 486,8 / 870,4 | 1,10 | 1,54 · 2,40 (1,54 · 2,40) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +13 % | +0 % | +75 % | +3 % | +24 % |
| Cascada → Pulso Primigenio | Columna | 34,9 / 1048,9 | 0,96 | 123,2 / 3417,3 | 1,10 | 2,42 · 2,23 (2,42 · 2,23) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +15 % | +52 % | +38 % | +0 % | +27 % |
| Psíquico → Vasta Fuerza | Estallido | 76,0 / 446,5 | 0,93 | 156,0 / 2698,0 | 1,10 | 1,41 · 4,14 (1,41 · 4,14) | 1,9 → 2,5 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +27 % | +0 % | +22 % |
| Brillo Mágico → Campo de Niebla | Aura | 44,0 / 1188,0 | 1,15 | 93,5 / 4488,0 | 1,10 | 1,46 · 2,59 (1,46 · 2,59) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +36 % | +0 % | +0 % | +0 % | +25 % |
| Bola Voltio → Chispa | Rebote | 97,6 / 585,6 | 1,20 | 209,8 / 1994,4 | 1,10 | 1,47 · 2,33 (1,47 · 2,33) | 0,0 → 0,5 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +133 % | +0 % | +28 % |
| Enfado → Dracoflecha | Giro | 31,2 / 1219,4 | 0,98 | 91,9 / 4500,0 | 1,09 | 2,02 · 2,53 (2,02 · 2,53) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +37 % | +0 % | +10 % | +0 % | +30 % |
| Rayo Señal → Megacuerno | Rebote | 73,1 / 438,6 | 0,90 | 248,8 / 1662,0 | 1,09 | 2,33 · 2,60 (1,93 · 1,39) | 3,3 → 7,9 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +131 % | +0 % | +27 % |
| Balón Ígneo → V de Fuego | Carambola | 134,4 / 389,3 | 1,15 | 323,0 / 1280,0 | 1,09 | 1,65 · 2,25 (1,65 · 2,25) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +34 % | +0 % | +106 % | +36 % | +25 % |
| Rayo Aurora → Mundo Gélido | Aguja | 32,1 / 1682,7 | 1,17 | 89,7 / 4604,9 | 1,09 | 1,91 · 1,88 (1,91 · 1,88) | 13,1 → 17,4 | 0,0 → 15,1 | 0,0 · 0,00 | +0 % | +23 % | +131 % | +48 % | +25 % |
| Danza Pluma → Aerochorro | Chaparrón | 39,0 / 813,8 | 0,90 | 156,8 / 2630,6 | 1,09 | 2,75 · 2,21 (2,75 · 2,21) | 0,0 → 0,0 | 11,4 → 12,4 | 0,0 · 0,00 | +20 % | +0 % | +9 % | +20 % | +17 % |
| Voto Fuego → Lluvia Ígnea | Charcos | 69,7 / 797,0 | 1,19 | 212,8 / 1936,5 | 1,09 | 2,09 · 1,66 (2,09 · 1,66) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +55 % | +28 % | +75 % | +7 % | +10 % |
| Bola Neblina → Resplandor | Teledirigido | 227,7 / 232,7 | 1,16 | 515,0 / 798,9 | 1,09 | 1,55 · 2,35 (1,55 · 2,35) | 0,0 → 0,0 | 0,3 → 5,5 | 0,0 · 0,00 | +0 % | +0 % | +100 % | +0 % | +22 % |
| Tinieblas → Pesadilla | Aura | 38,5 / 1347,5 | 1,15 | 79,8 / 5147,4 | 1,09 | 1,42 · 2,62 (1,42 · 2,62) | 0,0 → 21,2 | 0,0 → 0,0 | 0,0 · 0,00 | +20 % | +0 % | +0 % | +0 % | +0 % |
| Viento Aciago → Golpe Umbrío | Vórtice | 33,0 / 821,0 | 0,83 | 114,0 / 3597,0 | 1,08 | 2,37 · 3,00 (2,37 · 3,00) | 8,4 → 12,5 | 0,0 → 0,0 | 0,0 · 0,00 | +57 % | +25 % | +0 % | +0 % | +20 % |
| Vozarrón → Alboroto | Estallido | 31,2 / 1606,8 | 1,13 | 87,4 / 4687,3 | 1,08 | 1,92 · 2,00 (1,92 · 2,00) | 0,0 → 39,4 | 0,0 → 0,0 | 0,0 · 0,00 | +1 % | +0 % | +23 % | -1 % | +27 % |
| Giro Fuego → Fuego Sagrado | Órbita | 83,0 / 661,3 | 1,18 | 212,3 / 1873,5 | 1,07 | 1,75 · 1,94 (1,75 · 1,94) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +42 % | +0 % | +56 % | +0 % | +23 % |
| Lengüetazo → Puño Sombra | Golpe | 60,8 / 882,9 | 1,17 | 183,6 / 2112,0 | 1,05 | 2,07 · 1,64 (2,07 · 1,64) | 12,4 → 2,9 | 0,0 → 0,0 | 0,0 · 0,00 | +19 % | +0 % | +0 % | +0 % | +27 % |
| Viento Feérico → Fuerza Lunar | Estallido | 59,3 / 656,3 | 0,99 | 183,0 / 2112,9 | 1,05 | 2,11 · 2,21 (2,11 · 2,21) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +12 % | +0 % | +20 % | -2 % | +29 % |
| Tornado → Vendaval | Órbita | 49,3 / 1061,4 | 1,15 | 119,0 / 3221,5 | 1,05 | 1,65 · 2,08 (1,65 · 2,08) | 0,0 → 6,9 | 0,0 → 0,0 | 0,0 · 0,00 | +5 % | +0 % | +60 % | +42 % | +28 % |
| Semilladora → Fulgor Semilla | Ráfaga | 121,8 / 426,6 | 1,15 | 343,0 / 1096,0 | 1,04 | 1,93 · 1,76 (1,93 · 1,76) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +4 % | +0 % | +60 % | +1 % | +25 % |
| Tajo Aéreo → Ataque Aéreo | Teledirigido | 112,5 / 476,3 | 1,17 | 213,4 / 1755,9 | 1,04 | 1,30 · 2,53 (1,30 · 2,53) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +14 % | +0 % | +48 % | -12 % | +26 % |
| Patada Giro → Patada Salto Alta | Giro | 47,6 / 1078,0 | 1,14 | 198,2 / 1880,9 | 1,03 | 2,85 · 1,20 (2,54 · 0,72) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +80 % | +0 % | +69 % | +0 % | +22 % |
| Pulso Umbrío → Alarido | Estallido | 52,4 / 860,4 | 1,07 | 113,4 / 3151,5 | 1,01 | 1,48 · 2,51 (1,48 · 2,51) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +12 % | +0 % | +13 % | -2 % | +24 % |
| Rodar → Romperrocas | Carambola | 31,0 / 1695,9 | 1,16 | 57,8 / 6180,3 | 1,01 | 1,28 · 2,50 (1,28 · 2,50) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +16 % | +0 % | +103 % | +69 % | +19 % |
| Campo Psíquico → Onda Mental | Charcos | 46,8 / 1219,4 | 1,20 | 109,9 / 3240,0 | 1,01 | 1,61 · 1,82 (1,61 · 1,82) | 0,0 → 0,0 | 7,8 → 9,3 | 0,0 · 0,00 | +65 % | +58 % | +141 % | +3 % | +37 % |
| Hueso Palo → Hueso Sombrío | Parábola | 88,5 / 591,2 | 1,15 | 225,4 / 1562,0 | 1,01 | 1,75 · 1,81 (1,75 · 1,81) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +23 % | +0 % | +57 % | +43 % | +23 % |
| Avalancha → Trampa Rocas | Meteoro | 53,8 / 852,2 | 1,08 | 145,3 / 2369,7 | 0,99 | 1,85 · 1,91 (1,85 · 1,91) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +45 % | +0 % | +29 % | +1 % | +12 % |
| Lanzarrocas → Roca Afilada | Proyectil | 158,4 / 360,0 | 1,20 | 386,5 / 882,1 | 0,99 | 1,67 · 1,68 (1,67 · 1,68) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +5 % | +0 % | +79 % | +0 % | +30 % |
| Pedrada → Hachazo Pétreo | Parábola | 67,2 / 464,8 | 0,89 | 222,2 / 1516,9 | 0,98 | 2,27 · 2,24 (2,27 · 2,24) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +19 % | +0 % | +44 % | +1 % | +22 % |
| Géiser Fotónico → Psicoataque | Columna | 57,0 / 1008,8 | 1,21 | 169,2 / 1978,2 | 0,98 | 2,03 · 1,34 (2,03 · 1,34) | 14,3 → 13,2 | 0,0 → 0,0 | 0,0 · 0,00 | +24 % | +39 % | +36 % | +0 % | +28 % |
| Garra Metal → Cabeza de Hierro | Golpe | 64,4 / 810,0 | 1,15 | 115,0 / 2907,2 | 0,98 | 1,22 · 2,46 (1,14 · 2,30) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +101 % | +0 % | +0 % | +0 % | +32 % |
| Onda Trueno → Voltio Cruel | Aturdimiento | 49,3 / 611,9 | 0,88 | 255,3 / 1292,3 | 0,97 | 3,55 · 1,45 (3,66 · 1,29) | 15,1 → 17,6 | 0,0 → 0,1 | 0,0 · 0,00 | +41 % | +0 % | +97 % | +0 % | +29 % |
| Orbes Espectro → Rayo Umbrío | Chaparrón | 81,9 / 638,6 | 1,15 | 298,1 / 1087,5 | 0,96 | 2,49 · 1,17 (2,29 · 1,07) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +13 % | +0 % | +18 % | +30 % | +20 % |
| Rayo Carga → Rayo Fusión | Aguja | 32,4 / 1760,4 | 1,20 | 77,9 / 4157,2 | 0,96 | 1,65 · 1,62 (1,65 · 1,62) | 10,2 → 11,7 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +23 % | +149 % | +49 % | +27 % |
| Meteoros → Teraclúster | Aspas | 126,0 / 386,1 | 1,11 | 217,6 / 1484,6 | 0,96 | 1,18 · 2,63 (1,11 · 2,57) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +1 % | +0 % | +34 % | -17 % | +29 % |
| Chuzos → Lanza Glacial | Columna | 39,9 / 1058,4 | 1,04 | 154,5 / 1891,2 | 0,92 | 2,65 · 1,22 (2,30 · 1,06) | 0,0 → 3,8 | 11,8 → 9,2 | 0,0 · 0,00 | +16 % | +57 % | +24 % | +0 % | +23 % |
| Shuriken de Agua → Azote Torrencial | Ráfaga | 128,0 / 365,0 | 1,09 | 236,6 / 1214,1 | 0,91 | 1,27 · 2,28 (1,27 · 2,28) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +2 % | +0 % | +62 % | -1 % | +26 % |
| Carantoña → Choque Anímico | Golpe | 223,6 / 249,0 | 1,19 | 427,0 / 670,3 | 0,91 | 1,31 · 1,84 (1,31 · 1,84) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +6 % | +0 % | +0 % | +0 % | +23 % |
| Foco Resplandor → Rayo Metálico | Haz | 65,0 / 387,4 | 0,80 | 213,8 / 1336,7 | 0,91 | 2,25 · 2,36 (2,25 · 2,36) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +13 % | +0 % | +0 % | +0 % | +20 % |
| Fuego Fatuo → Infierno | Torreta | 159,2 / 167,9 | 0,82 | 521,7 / 547,4 | 0,91 | 2,25 · 2,23 (2,25 · 2,23) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | -1 % | +0 % | +123 % | 0 % | +23 % |
| Hiperrayo → Rayo Prisma | Carga | 73,2 / 516,4 | 0,98 | 168,6 / 1645,9 | 0,89 | 1,58 · 2,18 (1,58 · 2,18) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +28 % | +0 % | +0 % | -1 % | +26 % |
| Golpe Kárate → A Bocajarro | Golpe | 94,6 / 405,4 | 0,99 | 264,4 / 1038,4 | 0,89 | 1,92 · 1,76 (1,92 · 1,76) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +21 % | +0 % | +0 % | +0 % | +58 % |
| Canto Helado → Carámbano | Teledirigido | 97,5 / 292,5 | 0,85 | 520,6 / 520,6 | 0,88 | 3,66 · 1,22 (3,42 · 1,14) | 0,0 → 0,2 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +41 % | +0 % | +32 % |
| Torbellino → Salmuera | Vórtice | 50,4 / 949,1 | 1,10 | 116,9 / 2253,0 | 0,87 | 1,59 · 1,63 (1,59 · 1,63) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +35 % | +44 % | +0 % | +0 % | +22 % |
| Garra Dragón → Carga Dragón | Golpe | 57,2 / 969,6 | 1,19 | 155,0 / 1698,8 | 0,87 | 1,86 · 1,20 (1,68 · 1,08) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +49 % | +0 % | +0 % | +0 % | +24 % |
| Rayo Burbuja → Acua Cola | Abanico | 144,8 / 308,0 | 1,06 | 337,0 / 777,8 | 0,87 | 1,59 · 1,73 (1,59 · 1,73) | 0,0 → 0,0 | 1,8 → 1,6 | 0,0 · 0,00 | +2 % | +0 % | +23 % | +3 % | +27 % |
| Al Ataque → Escaramuza | Aliados | 165,6 / 243,7 | 1,01 | 369,9 / 707,8 | 0,87 | 1,53 · 1,99 (1,53 · 1,99) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +11 % | +0 % | +59 % | -12 % | +29 % |
| Pin Misil → Aguijón Letal | Ráfaga | 117,3 / 470,9 | 1,18 | 227,9 / 1144,5 | 0,87 | 1,33 · 1,67 (1,33 · 1,67) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +4 % | +0 % | +92 % | +0 % | +25 % |
| Rueda Fuego → Envite Ígneo | Estela | 70,3 / 760,0 | 1,16 | 120,4 / 2126,5 | 0,86 | 1,17 · 1,92 (1,17 · 1,92) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +23 % | +18 % | +0 % | +0 % | +17 % |
| Ataque Rápido → Velocidad Extrema | Embestida | 117,0 / 325,0 | 0,98 | 379,6 / 670,0 | 0,85 | 2,22 · 1,41 (2,22 · 1,41) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +29 % | +0 % | +0 % | +0 % | +28 % |
| Bola Sombra → Golpe Fantasma | Proyectil | 105,1 / 502,2 | 1,16 | 224,0 / 1064,0 | 0,83 | 1,46 · 1,45 (1,46 · 1,45) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +7 % | +0 % | +89 % | +1 % | +34 % |
| Sustituto → Doble Equipo | Torreta | 35,0 / 769,3 | 0,83 | 120,8 / 1963,0 | 0,82 | 2,36 · 1,75 (2,36 · 1,75) | 36,2 → 30,0 | 0,0 → 0,0 | 0,0 · 0,10 | +52 % | +0 % | +10 % | +0 % | +34 % |
| Homenaje Póstumo → Marcha Espectral | Aliados | 168,6 / 230,8 | 0,99 | 427,2 / 546,5 | 0,82 | 1,74 · 1,62 (1,74 · 1,62) | 0,0 → 0,0 | 1,2 → 1,1 | 0,0 · 0,00 | +6 % | +0 % | +60 % | 0 % | +27 % |
| Chispazo → Campo Eléctrico | Aura | 41,8 / 938,6 | 1,00 | 88,5 / 2622,4 | 0,82 | 1,45 · 1,91 (1,45 · 1,91) | 10,8 → 26,8 | 0,1 → 0,0 | 0,0 · 0,00 | +23 % | +0 % | +0 % | +0 % | +25 % |
| Huesomerang → Ataque Óseo | Bumerán | 51,2 / 910,4 | 1,09 | 136,3 / 1673,4 | 0,81 | 1,82 · 1,26 (1,82 · 1,26) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +13 % | +0 % | +117 % | +38 % | +27 % |
| Voz Cautivadora → Encanto | Empujón | 34,8 / 765,6 | 0,82 | 70,8 / 3186,0 | 0,80 | 1,39 · 2,85 (1,39 · 2,85) | 19,8 → 40,6 | 0,0 → 0,0 | 0,0 · 0,00 | +51 % | +0 % | +0 % | +0 % | +23 % |
| Hierba Lazo → Planta Feroz | Aura | 120,0 / 300,0 | 0,96 | 208,3 / 1082,7 | 0,80 | 1,19 · 2,47 (1,16 · 2,39) | 1,2 → 18,7 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +0 % | +0 % | +18 % |
| Puño Dinámico → Megapuño | Aturdimiento | 43,7 / 562,4 | 0,79 | 128,0 / 1752,0 | 0,80 | 2,01 · 2,13 (2,01 · 2,13) | 11,4 → 22,5 | 0,0 → 0,0 | 0,0 · 0,00 | +21 % | +14 % | +0 % | +0 % | +29 % |
| Bucle Arena → Fuerza Equina | Vórtice | 35,1 / 1286,9 | 1,07 | 82,8 / 2647,9 | 0,79 | 1,62 · 1,41 (1,62 · 1,41) | 0,0 → 0,0 | 7,9 → 9,9 | 0,0 · 0,00 | +78 % | +32 % | +0 % | +0 % | +36 % |
| Púas Tóxicas → Lanza Mugre | Minas | 47,7 / 1192,7 | 1,20 | 89,3 / 2411,8 | 0,79 | 1,28 · 1,39 (1,09 · 1,19) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +5 % | +1 % | +9 % | +0 % | +12 % |
| Ala Bis → Ala Mortífera | Aves | 118,6 / 304,3 | 0,96 | 282,1 / 760,7 | 0,78 | 1,63 · 1,71 (1,63 · 1,71) | 0,0 → 0,0 | 0,0 → 0,0 | 16,9 · 0,00 | -4 % | +2 % | -4 % | -4 % | +25 % |
| Nitrocarga → Golpe Calor | Embestida | 76,6 / 474,3 | 0,96 | 243,1 / 871,3 | 0,78 | 2,17 · 1,26 (2,17 · 1,26) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +15 % | +0 % | +0 % | +0 % | +20 % |
| Paranormal → Psicoonda | Empujón | 34,1 / 1159,4 | 1,00 | 92,5 / 2280,0 | 0,78 | 1,86 · 1,35 (1,86 · 1,35) | 12,0 → 12,8 | 0,0 → 0,0 | 0,0 · 0,00 | +20 % | +0 % | +0 % | +0 % | +24 % |
| Onda Vacío → Puño Incremento | Empujón | 56,4 / 904,8 | 1,14 | 112,8 / 1837,7 | 0,77 | 1,37 · 1,39 (1,37 · 1,39) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +42 % | +0 % | +0 % | +0 % | +25 % |
| Ida y Vuelta → Sanguijuela | Embestida | 87,4 / 357,2 | 0,89 | 184,0 / 1100,0 | 0,76 | 1,44 · 2,11 (1,44 · 2,11) | 0,0 → 0,0 | 0,0 → 0,0 | 100,4 · 0,00 | +14 % | +0 % | +0 % | +0 % | +27 % |
| Terratemblor → Terremoto | Aura | 34,0 / 1707,7 | 1,21 | 65,9 / 2988,8 | 0,75 | 1,33 · 1,20 (1,25 · 1,12) | 0,0 → 0,0 | 16,6 → 14,1 | 0,0 · 0,00 | +0 % | +0 % | +0 % | +0 % | +29 % |
| Bomba Fango → Arenas Ardientes | Charcos | 49,0 / 619,5 | 0,88 | 121,2 / 1616,6 | 0,75 | 1,69 · 1,79 (1,69 · 1,79) | 0,0 → 0,0 | 7,9 → 10,6 | 0,0 · 0,00 | +86 % | +35 % | +125 % | +8 % | +63 % |
| Tóxico → Gas Venenoso | Estela | 42,6 / 525,3 | 0,75 | 74,2 / 2434,4 | 0,72 | 1,19 · 3,18 (1,09 · 2,89) | 0,0 → 0,0 | 0,0 → 7,0 | 0,0 · 0,00 | +12 % | +24 % | +0 % | +0 % | +21 % |
| Infortunio → Poltergeist | Cadena | 113,0 / 219,7 | 0,79 | 286,1 / 582,8 | 0,69 | 1,73 · 1,82 (1,73 · 1,82) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +0 % | +0 % | +0 % | +0 % | +28 % |
| Tajo Cruzado → Espada Santa | Aspas | 49,4 / 707,2 | 0,94 | 108,7 / 1519,1 | 0,69 | 1,51 · 1,47 (1,51 · 1,47) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | +17 % | +0 % | +35 % | -1 % | +25 % |
| Disparo Demora → Red Viscosa | Minas | 69,6 / 348,0 | 0,78 | 132,3 / 1220,8 | 0,68 | 1,30 · 2,40 (1,30 · 2,40) | 0,0 → 26,8 | 2,7 → 1,9 | 0,0 · 0,00 | +0 % | +0 % | +27 % | +0 % | +26 % |
| Danza Espada → Tambor | Potenciador | 0,0 / 0,0 | — | — | — | — | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | — | — | — | — | — |
| Maquinación → Geocontrol | Potenciador | 0,0 / 0,0 | — | — | — | — | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | — | — | — | — | — |
| Agilidad → Cambio de Marcha | Potenciador | 0,0 / 0,0 | — | — | — | — | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | — | — | — | — | — |
| Fortaleza → Defensa Férrea | Potenciador | 0,0 / 0,0 | — | — | — | — | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | — | — | — | — | — |
| Acua Aro → Gota Vital | Potenciador | 0,0 / 0,0 | — | — | — | — | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | — | — | — | — | — |
| Danza Dragón → Estruendo Escama | Potenciador | 0,0 / 0,0 | — | — | — | — | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,00 | — | — | — | — | — |
| Canto Mortal → Estruendo | Barrido | 1,4 / 68,2 | — | 3,2 / 159,9 | — | 1,57 · 1,61 (1,57 · 1,61) | 0,0 → 2,3 | 0,0 → 0,0 | 0,0 · 0,00 | — | — | — | — | — |
| Brecha Negra → Calamidad | Barrido | 1,4 / 1894,2 | — | 8,3 / 3576,8 | — | 4,06 · 1,29 (4,06 · 1,29) | 4,0 → 4,9 | 0,0 → 0,0 | 0,0 · 0,00 | — | — | — | — | — |
| Barrera Espinosa → Cura Selvática | Escudo | 23,3 / 395,3 | — | 41,5 / 830,7 | — | 1,22 · 1,44 (1,22 · 1,44) | 0,0 → 0,0 | 0,0 → 0,0 | 5,7 · 0,20 | — | — | — | — | — |
| Búnker → Armadura Ácida | Escudo | 41,9 / 704,7 | — | 109,5 / 1841,9 | — | 1,79 · 1,79 (1,79 · 1,79) | 0,0 → 0,0 | 0,0 → 0,0 | 0,0 · 0,20 | — | — | — | — | — |
| Escudo Real → Embate Supremo | Escudo | 6,8 / 101,9 | — | 16,4 / 458,8 | — | 1,65 · 3,09 (1,65 · 3,09) | 1,6 → 2,4 | 0,0 → 0,0 | 2,3 · 0,10 | — | — | — | — | — |

## Ficha de cada ataque

Qué hace, qué pasiva lo hace evolucionar, en qué se convierte y qué gana, y qué número cambia cada pasiva de ataque.
(Potencia, Reflejos y Puntería les afectan a todos: arriba.)

### Normal

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Placaje | Golpe | Embistes de frente: los enemigos salen rodando como bolos y tiran a los que pillan. | **Derribo** con Vigor | ×1,25 daño y más alcance. Embistes 40 px hacia delante y los bolos estallan al chocar con otro enemigo (los jefes, que no ruedan, reciben ×1,5). | radio | — | — | — |
| Ataque Rápido | Embestida | Cruzas como un rayo: el primer golpe a un enemigo intacto hace mucho más. | **Velocidad Extrema** con Carrera | ×2,4 daño y −15% de recarga. Si un enemigo o un disparo va a tocarte, cruzas solo a través de él con ×1,5 de daño (una vez cada 1,2 s). | grosor | — | — | — |
| Danza Espada | Potenciador | No hace daño: acumula ATAQUE. Con el máximo, dos espadas giran a tu alrededor. | **Tambor** con Vigor | +3 pilas máximas. Con más de la mitad de vida las pilas saltan al máximo de golpe; al máximo, cuatro espadas giran a tu alrededor. | — | duración | — | — |
| Maquinación | Potenciador | No hace daño: acumula AT. ESP. Al llegar al máximo, el siguiente golpe especial es crítico. | **Geocontrol** con Amplitud | Quieto 1,5 s, las runas del suelo te dan de golpe 3 pilas de at. esp., 2 de velocidad y 2 de defensa (moverte corta la carga). | — | duración | — | — |
| Agilidad | Potenciador | No hace daño: acumula VELOCIDAD. Con el máximo, a veces esquivas los golpes. | **Cambio de Marcha** con Potencia | Mientras dure, cada 2% de velocidad de más te da un 1% más de daño (hasta +40%). | — | duración | — | — |
| Fortaleza | Potenciador | No hace daño: acumula DEFENSA. Con el máximo, los que te tocan rebotan. | **Defensa Férrea** con Coraza | +2 pilas máximas y dos por uso. No caducan mientras no te golpeen y, con más de 3, el que te toca recibe un 25% de su golpe. | — | duración | — | — |
| Golpe Cuerpo | Golpe | Saltas sobre los enemigos y caes con todo tu peso: puede paralizar. | **Gigaimpacto** con Vigor | ×1,75 daño. Un salto enorme hasta el grupo: la onda es más grande y lanza a todos al aire (al caer dañan a los de al lado). | radio | — | — | — |
| Vozarrón | Estallido | Un grito que se expande en anillo: atraviesa paredes y frena en seco a los que están pegados a ti. | **Alboroto** con Amplitud | ×1,6 daño. Gritas 2,4 s sin parar: un anillo cada 0,4 s desde donde estés, y al tercer anillo el enemigo queda confuso. | tamaño | — | +1 cantidad | velocidad |
| Sustituto | Torreta | Un muñeco con tu cara que atrae a los enemigos y estalla al romperse. | **Doble Equipo** con Coraza | ×2 daño. Dos copias de ti corren a tu alrededor atrayendo a los enemigos; al tocarlas estallan en un destello que aturde y vuelven 1 s después. Mientras haya alguna, esquivas el 15%. | alcance de disparo, tamaño | duración | +1 cantidad | velocidad |
| Hiperrayo | Carga | Rayo enorme que barre y empuja; después te quedas agotado un momento. | **Rayo Prisma** con Aprendizaje | ×2,3 daño, más ancho y carga antes. El rayo toma el tipo que más daño hace a su blanco y le pone el estado de ese tipo; ya no te quedas agotado. | grosor, largo (la mitad) | — | — | carga más rápida |
| Giro Rápido | Giro | Giras como una peonza: vas más rápido, te limpias y desarmas las trampas que pisas. | **Triataque** con Carrera | ×1,3 daño y +1 vuelta. En cada vuelta salen tres bolas en espiral: fuego que quema, hielo que enfría y electricidad que puede paralizar. | radio | — | +1 cantidad | — |
| Meteoros | Aspas | Estrellas que no fallan nunca: cada una elige a un enemigo distinto. | **Teraclúster** con Puntería | ×1,6 daño y +1 estrella. Son estelares (nunca hacen menos de ×1) y cada una se parte al golpear en 3 estrellitas que buscan a otros 3. | tamaño | — | +1 cantidad | velocidad, espiral |
| Canto Mortal | Barrido | Un canto que oye toda la pantalla: a los 3 s debilita a los que estén muy tocados y daña al resto. Los jefes lo aguantan. | **Estruendo** con Aprendizaje | ×2 daño, +20% de efecto y −15% de recarga. Al acabar el canto, un anillo dorado hasta el borde de la pantalla aparta y confunde a todos. | — | aturdimiento | — | — |

### Fuego

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Ascuas | Proyectil | Una brasa que quema; sobre un enemigo ya quemado, la quemadura estalla y se contagia. | **Llamarada** con Propulsión | ×1,5 daño, +1 brasa y quema más. Donde impacta queda fuego en forma de 大 1,5 s; sobre un quemado, la quemadura sigue estallando y contagiándose. | tamaño | — | +1 cantidad | velocidad |
| Lanzallamas | Abanico | Un chorro de llamas que sigue hacia donde apuntas y deja fuego en el suelo. | **Sofoco** con Reflejos | ×2,65 daño y un chorro de llama blanca más ancho y largo. A la 3.ª seguida se sobrecalienta y explota a tu alrededor. | tamaño | — | +1 cantidad | velocidad |
| Giro Fuego | Órbita | Encierras a un enemigo en un remolino de fuego del que no puede salir. | **Fuego Sagrado** con Síntesis | ×2,1 daño y +1 llama. La jaula es dorada: cada quemado que cae dentro te cura un 1% y, al acabar, estalla en un pilar de fuego sagrado. | radio, tamaño | — | +1 cantidad | velocidad |
| Onda Ígnea | Estallido | Un frente de aire ardiente avanza delante de ti quemando todo; con sol, mucho más. | **Erupción** con Vigor | ×1,4 daño. El frente de calor sale igual y, además, la tierra erupciona: caen rocas de lava sobre los enemigos cercanos y dejan lava (con la vida llena, 8 y más fuertes; con poca, 3). | tamaño | — | +1 cantidad | velocidad |
| Fuego Fatuo | Torreta | Llamas fantasmales que se pegan a los enemigos: los queman y les quitan fuerza. | **Infierno** con Persistencia | ×2 daño, +1 llama y salen más seguidas. Son rojas: si muere el que la lleva pegada, se parte y salta a los 2 más cercanos. | alcance de disparo, tamaño | duración | +1 cantidad | velocidad |
| Rueda Fuego | Estela | Corres envuelto en una rueda de fuego que pega más cuanto más rato corres. | **Envite Ígneo** con Carrera | ×2 daño y rastro más grande. Tras 2 s corriendo, la rueda a tope te convierte en un cometa: al chocar estalla (×3) y lanza al enemigo. | radio | duración | — | — |
| Nitrocarga | Embestida | Te lanzas en llamas: cada golpe te hace más rápido y llegas más lejos. | **Golpe Calor** con Carrera | ×2,3 daño, llegas más lejos y −15% de recarga. Arrastras a los pequeños delante de ti como un quitanieves y al final estallan; a los grandes, ×1,5. | grosor | — | — | — |
| Balón Ígneo | Carambola | Chutas un balón de fuego que vuelve a tus pies y cada pase pega más fuerte. | **V de Fuego** con Propulsión | ×1,85 daño y balón más grande. Al cuarto chut, dos rayos de fuego en V cruzan la pantalla y dejan el suelo ardiendo. | tamaño, explosión | duración | +1 cantidad | velocidad |
| Voto Fuego | Charcos | Mares de fuego que se combinan: con Planta arden más y con Agua sale un arcoíris que te ayuda. | **Lluvia Ígnea** con Imán | ×1,65 daño y +1 mar. Cada mar de fuego es un volcancito que escupe lava al enemigo más cercano cada 0,6 s (y sigue reaccionando con Planta y Agua). | radio | duración | +1 cantidad | llega antes |

### Agua

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Pistola Agua | Proyectil | Un chorro que atraviesa, empuja y deja empapados a los enemigos. | **Escaldar** con Propulsión | ×2 daño, +1 chorro y atraviesa a uno más. Agua hirviendo: quema y deja una nube de vapor que daña (y sigue empapando). | tamaño | — | +1 cantidad | velocidad |
| Burbuja | Estallido | Burbujas que atrapan a los enemigos y los hacen flotar hasta que revientan. | **Surf** con Carrera | ×1,35 daño. Las burbujas salen igual y, detrás, una ola gigante barre 380 px hacia delante arrastrando y empapando a todos. | tamaño | — | +1 cantidad | velocidad |
| Hidrobomba | Haz | Un chorro brutal que pega más cuanto más cerca estén. | **Hidrocañón** con Potencia | ×1,5 daño. El chorro sale igual y, además, una bala de agua gigante lo atraviesa todo y estalla en una ola al chocar con una pared, con un jefe o al final. | grosor, largo (la mitad) | — | — | — |
| Acua Aro | Potenciador | No hace daño: acumula REGENERACIÓN. Sus aros empapan a los que te tocan. | **Gota Vital** con Síntesis | Cada 2 s, una lluvia de gotas te cura un 3% a ti y a los compañeros que tengas a menos de 140 px. | — | duración | — | — |
| Rayo Burbuja | Abanico | Una cortina ondulante de burbujas que se quedan flotando como trampas. | **Acua Cola** con Réplica | ×1,8 daño y +2 burbujas. Medio segundo después das un coletazo de agua en abanico que empuja y revienta todas tus burbujas flotantes. | tamaño | — | +1 cantidad | velocidad |
| Torbellino | Vórtice | Un remolino que va solo hacia los grupos y se los lleva; en el agua es mayor. | **Salmuera** con Persistencia | ×2,2 daño, más grande y atrae más. Hace ×2 a los que tienen menos de la mitad de vida y, al acabar, los escupe hacia fuera empapados. | radio | duración | — | — |
| Shuriken de Agua | Ráfaga | Ráfaga de estrellas de agua: la primera sale al instante y rematas si todas aciertan. | **Azote Torrencial** con Propulsión | ×1,9 daño. Tres estrellas grandes que atraviesan a dos, son siempre críticas y al chocar con una pared se parten en 4 gotas. | tamaño | — | +1 cantidad | velocidad |
| Cascada | Columna | Una cascada cae sobre ti: te impulsa hacia delante y arrastra a los enemigos. | **Pulso Primigenio** con Amplitud | ×1,5 daño, más ancha y dura más. Cada golpe de la cascada dispara 8 rayos de agua en estrella. | grosor, alto | duración | +1 cantidad | — |

### Planta

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Látigo Cepa | Golpe | Tus lianas agarran al primer enemigo y lo traen hasta ti. | **Latigazo** con Potencia | ×2,5 daño. Cuatro lianas centinela brotan a tu alrededor 4 s: azotan al que se acerca y lo atraen hacia ti. | radio | — | — | — |
| Hoja Afilada | Bumerán | Hojas que vuelan en curva hacia el enemigo y suelen hacer crítico. | **Lluevehojas** con Propulsión | ×1,5 daño. Las hojas salen igual y, además, doce hojas en espiral rodean al blanco y se cierran sobre él cortando todo lo de dentro. | tamaño | — | +1 cantidad | velocidad |
| Tormenta Floral | Órbita | Un ciclón de pétalos que se abre y se cierra a tu alrededor. | **Danza Pétalo** con Síntesis | ×1,75 daño y +2 pétalos. Además, tres remolinos de pétalos bailan por el campo a tu alrededor y golpean lo que pillan. | radio, tamaño | — | +1 cantidad | velocidad |
| Hierba Lazo | Aura | La hierba hace tropezar a los enemigos: cuanto más grandes, más daño. | **Planta Feroz** con Vigor | ×1,65 daño y más radio. Cada 2 s, un anillo de raíces gigantes se abre desde ti y deja anclados 1 s a los que toca. | radio | — | — | — |
| Bomba Germen | Rebote | Semillas que se clavan y al momento brotan en una explosión. | **Mazazo** con Réplica | ×1,3 daño y +1 semilla. Del brote crece un tronco que cae hacia el grupo más cercano y aplasta todo lo de la línea. | tamaño | — | +1 cantidad | velocidad |
| Energibola | Teledirigido | Una bola de energía que se divide en tres y persigue a tres enemigos. | **Gigadrenado** con Aprendizaje | ×1,75 daño y +1 bola. Al golpear, hilos verdes se enganchan a 5 enemigos cercanos 1,5 s: les quitan vida y te curan. | tamaño | — | +1 cantidad | velocidad |
| Rayo Solar | Carga | Cargas luz mientras estás quieto y la sueltas en un rayo; con sol, al instante. | **Cuchilla Solar** con Reflejos | ×1,15 daño. El rayo sale igual y, al soltarlo, una espada de luz gigante barre 180° por delante de ti. | grosor, largo (la mitad) | — | — | carga más rápida |
| Semilladora | Ráfaga | Una ametralladora de semillas que dispara cada vez más rápido y siembra hierba. | **Fulgor Semilla** con Réplica | ×1,7 daño, +1 semilla y −20% de recarga. Cada 4 s, todas tus semillas del suelo estallan en luz y les bajan la defensa a los de alrededor. | tamaño | — | +1 cantidad | velocidad |
| Barrera Espinosa | Escudo | Un escudo de pinchos: hiere a quien te toca y al parar un golpe dispara púas. | **Cura Selvática** con Síntesis | +1 escudo y ×1,8 daño. Cada escudo gastado te cura un 6%, te quita los frenazos y cura también a los compañeros cercanos. | radio | aturdimiento | +1 cantidad | — |

### Eléctrico

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Impactrueno | Proyectil | Una chispa en zigzag que suelta arcos a los enemigos por los que pasa. | **Trueno** con Reflejos | ×1,55 daño. La chispa sale igual y, además, caen rayos del cielo sobre tu blanco y los más cercanos (con lluvia, 2 más); por los empapados saltan a otros. | tamaño | — | +1 cantidad | velocidad |
| Chispazo | Aura | Te cargas de electricidad al andar y la sueltas de golpe cuando se acercan. | **Campo Eléctrico** con Coraza | ×1,7 daño y más radio. Cada descarga deja un campo eléctrico que te sigue 6 s: paraliza a los que entran, tus ataques eléctricos dentro hacen un 30% más y nada te frena. | radio | — | — | — |
| Rayo | Cadena | Un rayo que salta de enemigo en enemigo; por los empapados no se para. | **Electrocañón** con Reflejos | ×1,25 daño. El rayo salta igual y, además, sale una bola de electricidad lenta y enorme que atraviesa, paraliza a los que toca y lanza rayos a los 2 más cercanos. | radio | — | +1 cantidad | — |
| Onda Trueno | Aturdimiento | Una red eléctrica que paraliza, y la parálisis se contagia entre enemigos. | **Voltio Cruel** con Persistencia | ×2 daño. Las zonas paralizan igual y de ti sale un rayo hasta cada una: daña lo que cruza y deja una estela que paraliza 2 s. | radio | aturdimiento | +1 zona | — |
| Bola Voltio | Rebote | Una bola eléctrica que pega más cuanto más rápido vayas. | **Chispa** con Imán | ×1,7 daño, +1 bola y +2 rebotes. Tras el último golpe vuelve a ti y te carga 2 s: lo que toques recibe daño y puede quedar paralizado. | tamaño | — | +1 cantidad | velocidad |
| Rayo Carga | Aguja | Un rayo que gira a tu alrededor y te carga de ataque especial. | **Rayo Fusión** con Reflejos | ×1,6 daño y +1 rayo. Si hace menos de 3 s que ha golpeado un ataque de Fuego (tuyo o de un compañero), ×2 y las puntas estallan. | radio, grosor | duración, aturdimiento | +1 cantidad | giro |
| Rueda Aural | Carambola | Una rueda que cambia de forma en cada rebote: eléctrica o siniestra. | **Ataque Fulgor** con Propulsión | ×1,85 daño y +1 rueda. Cada 3 rebotes descarga un rayo en todos los enemigos de su caja (hasta 8). | tamaño, explosión | duración | +1 cantidad | velocidad |

### Psíquico

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Confusión | Proyectil | Una onda psíquica ondulante que confunde: los confusos se chocan entre ellos. | **Psicocarga** con Aprendizaje | Los confusos que toca se vuelven marionetas: van a por otro enemigo y le pegan. | tamaño | — | +1 cantidad | velocidad |
| Psicorrayo | Haz | Un rayo psicodélico que se tuerce a mitad de camino y confunde. | **Premonición** con Aprendizaje | Cada enemigo tocado queda marcado: 2 s después le cae encima un pilar de energía. | grosor, largo (la mitad) | — | — | — |
| Psíquico | Estallido | Levantas a los enemigos con la mente y los lanzas contra otros. | **Vasta Fuerza** con Imán | Levanta a todos los de la pantalla y los estampa contra el suelo (el doble dentro del Campo Psíquico). | tamaño | — | +1 cantidad | velocidad |
| Psicocorte | Bumerán | Cuchillas que oscilan como un péndulo: delante, detrás y otra vez a ti. | **Psicocolmillo** con Reflejos | Rompe los escudos de los enemigos y, en cada pasada, se cierra como una mandíbula sobre los que hay entre la cuchilla y tú. | tamaño | — | +1 cantidad | velocidad |
| Paranormal | Empujón | Una onda mental que teletransporta lejos a los que tienes encima. | **Psicoonda** con Coraza | ×1,6 daño y más radio. Los que teletransportas reaparecen juntos en un punto delante de ti y allí estalla una onda psíquica. | radio | — | — | — |
| Bola Neblina | Teledirigido | Una bola de bruma que deja niebla: dentro, los enemigos no te ven y fallan. | **Resplandor** con Aprendizaje | La niebla destella cada 0,5 s: daña a todos los de dentro y les baja la defensa. | tamaño | — | +1 cantidad | velocidad |
| Géiser Fotónico | Columna | Un pilar de luz que se ensancha y al final deslumbra. Pega con tu lado más fuerte. | **Psicoataque** con Propulsión | El pilar dura 2 s y se desplaza solo hacia el enemigo más cercano. | grosor, alto | duración | +1 cantidad | — |
| Campo Psíquico | Charcos | Un campo psíquico que potencia tus disparos y frena a los enemigos y los suyos. | **Onda Mental** con Amplitud | Dos campos que se tocan se funden en uno más grande que lanza una onda psíquica cada segundo. | radio | duración | +1 cantidad | llega antes |

### Veneno

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Residuos | Proyectil | Un lodo que se pega: el enemigo va dejando un rastro tóxico. | **Bomba Lodo** con Propulsión | La bomba bota 3 veces por el suelo hacia el enemigo y deja un charco tóxico en cada bote. | tamaño | — | +1 cantidad | velocidad |
| Picotazo Veneno | Proyectil | Dos aguijones a la vez: si los dos aciertan al mismo, el veneno es doble. | **Puya Nociva** con Carrera | ×1,6 daño, +1 aguijón y atraviesan uno más. Si dos aciertan al mismo enemigo, la púa doble estalla en 6 agujas venenosas a su alrededor. | tamaño | — | +1 cantidad | velocidad |
| Tóxico | Estela | Dejas un rastro de veneno grave: cuanto más tiempo lo sufre, más daño hace. | **Gas Venenoso** con Síntesis | El rastro se vuelve una nube de gas grande que te sigue: dentro, frena y envenena gravemente. | radio | duración | — | — |
| Púas Tóxicas | Minas | Púas venenosas por capas: con dos capas en el mismo sitio, el veneno es grave. | **Lanza Mugre** con Síntesis | Los que caen sobre las púas revientan y salpican capas nuevas alrededor. | radio | duración | +1 cantidad | — |
| Bomba Ácida | Rebote | Un ácido que rebota y deja a los enemigos sin defensa. | **Onda Tóxica** con Síntesis | Cada rebote suelta un anillo de veneno que alcanza a los de alrededor. | tamaño | — | +1 cantidad | velocidad |
| Veneno X | Aspas | Dos cuchillas que se cruzan sobre el enemigo: donde se cruzan, crítico seguro. | **Garra Nociva** con Puntería | La X se queda grabada en el suelo 2 s: una zona venenosa en forma de X. | tamaño | — | +1 cantidad | velocidad, espiral |
| Búnker | Escudo | Al parar un golpe te encierras en un búnker: no te tocan y envenena gravemente a los de alrededor. | **Armadura Ácida** con Vigor | Al parar un golpe te vuelves líquido: te deslizas al doble de rápido, sin que te toquen, dejando ácido. | radio | aturdimiento | +1 cantidad | — |

### Tierra

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Disparo Lodo | Estallido | Bolas de barro que frenan cada vez más hasta dejar atascados a los enemigos. | **Tierra Viva** con Potencia | El suelo erupciona bajo los embarrados: más daño cuantas más pilas de barro llevan. | tamaño | — | +1 cantidad | velocidad |
| Terratemblor | Aura | Al andar das pisotones que hacen temblar el suelo: frenan a los que no vuelan y rompen rocas. | **Terremoto** con Amplitud | Cada 2 s tiembla toda la pantalla: más fuerte cerca de ti, sólo a los que no vuelan. | radio | — | — | — |
| Huesomerang | Bumerán | Un hueso que va y vuelve al sitio desde donde lo lanzas: si lo atrapas, el siguiente sale antes. | **Ataque Óseo** con Propulsión | En el punto más lejano, el hueso se queda girando como una hélice antes de volver. | tamaño | — | +1 cantidad | velocidad |
| Púas | Minas | Siembras abrojos delante de ti: cada uno daña y frena mucho al primero que lo pisa. | **Fisura** con Persistencia | ×2,2 daño y +2 abrojos. Una grieta une los abrojos: hace mucho daño a los que la cruzan (el doble a los grandes) y se traga a los pequeños que ya están tocados. | radio | duración | +1 cantidad | — |
| Bucle Arena | Vórtice | Arenas movedizas: los que caen dentro no pueden salir y se hunden cada vez más. | **Fuerza Equina** con Vigor | Una estampida: cada 0,5 s sale de la arena una línea de pisotones en una dirección al azar. | radio | duración | — | — |
| Magnitud | Temblor | Un temblor de magnitud al azar (de 4 a 10): a veces poco, a veces enorme. No toca a los que vuelan. | **Taladradora** con Amplitud | Un taladro que perfora en línea sin parar, escupe piedras a los lados y hace más críticos. | radio | — | +1 cantidad | llega antes |
| Hueso Palo | Parábola | Un hueso que cae y se queda clavado girando: golpea a todo el que pasa y corta lo que preparan. | **Hueso Sombrío** con Vigor | El hueso arde en fuego fantasma: al clavarse, un círculo que daña y maldice (más daño recibido). | tamaño | — | +1 cantidad | velocidad, caída |
| Bomba Fango | Charcos | Charcos de barro: frenan a los enemigos y les hacen fallar los disparos. | **Arenas Ardientes** con Persistencia | El barro se seca en arena ardiente que quema; con sol o en el volcán dura el doble. | radio | duración | +1 cantidad | llega antes |

### Volador

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Tornado | Órbita | Remolinos que te escoltan y devuelven los disparos enemigos contra ellos. | **Vendaval** con Carrera | Los remolinos se juntan en un huracán grande que confunde; con lluvia, el doble de grande. | radio, tamaño | — | +1 cantidad | velocidad |
| Ataque Ala | Golpe | Un aletazo que aparta a los enemigos y te aleja de ellos. | **Pájaro Osado** con Potencia | Reculas y al momento vuelves en picado, envuelto en llamas, a través de los enemigos. | radio | — | — | — |
| Golpe Aéreo | Embestida | Apareces a la espalda del enemigo y le cortas en X: nunca falla y no puede dispararte un momento. | **Acróbata** con Carrera | ×1,3 daño. Encadenas hasta 4 saltos entre enemigos cercanos, cada uno con su tajo; si no hay otro cerca, vuelves a por el mismo. | grosor | — | — | — |
| Remolino | Empujón | Un vendaval en cono que manda lejos a los enemigos y los hace huir. | **Huracán** con Imán | Un huracán se queda 3 s donde estás: levanta a los que entran y los lanza lejos, con daño al caer. | radio | — | — | — |
| Tajo Aéreo | Teledirigido | Cuchillas de aire que atraviesan en fila y cortan los ataques que preparan. | **Ataque Aéreo** con Puntería | Brillas un instante y todas las cuchillas se juntan en una enorme que no falla, lo atraviesa todo y hace críticos. | tamaño | — | +1 cantidad | velocidad |
| Ala Bis | Aves | Aves que bajan en picado de dos en dos sobre los enemigos. | **Ala Mortífera** con Propulsión | Aves de sombra roja y negra: cada picado te cura un poco. | radio, círculo (la mitad) | duración | +1 cantidad | velocidad |
| Danza Pluma | Chaparrón | Llueven plumas que quitan fuerza y frenan a los enemigos. | **Aerochorro** con Carrera | Cada 8 plumas que caen, sale de ti un aerochorro hacia el grupo más grande. | tamaño | — | +1 cantidad | velocidad |

### Bicho

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Picadura | Golpe | Mordiscos que te curan; a veces los enemigos sueltan una baya. | **Tijera X** con Potencia | Un tajo en X que marca a los enemigos: tu siguiente golpe sobre ellos es crítico seguro. | radio | — | — | — |
| Disparo Demora | Minas | Atas a varios enemigos con hilo de seda: se arrastran unos a otros y van lentos. | **Red Viscosa** con Persistencia | Además, una red pegajosa en el suelo que atrapa al que la pisa y frena mucho. | radio | duración | +1 cantidad | — |
| Zumbido | Aura | Un zumbido que ablanda a los enemigos y, al máximo, los aparta. | **Enjambre** con Síntesis | Un enjambre te rodea y pica más fuerte a los que ya tienen la defensa al mínimo. | radio | — | — | — |
| Rayo Señal | Rebote | Un destello que rebota y señala a los enemigos: tu puntería y tus aliados van a por ellos. | **Megacuerno** con Réplica | ×1,35 daño y +1 rebote. El destello rebota igual y bajo cada enemigo que toca brota un cuerno de luz que lo ensarta y lo lanza al aire (×1,5 a los ya señalados). | tamaño | — | +1 cantidad | velocidad |
| Ida y Vuelta | Embestida | Cruzas, golpeas y vuelves a tu sitio; al volver, el siguiente ataque de tu vínculo sale al momento. | **Sanguijuela** con Síntesis | Te cura un poco por cada enemigo que atraviesas. | grosor | — | — | — |
| Pin Misil | Ráfaga | Agujas que se clavan; con cinco clavadas, el enemigo revienta. | **Aguijón Letal** con Réplica | Si una aguja o su estallido debilita a un enemigo, tu ataque físico sube para toda la partida (hasta 10 veces). | tamaño | — | +1 cantidad | velocidad |
| Al Ataque | Aliados | Un enjambre que ataca a tu objetivo en formación, con mucho crítico. | **Escaramuza** con Réplica | Además, una colmena en el suelo que suelta una abeja cada segundo. | tamaño | duración | +1 cantidad | velocidad |

### Roca

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Lanzarrocas | Proyectil | Pedrusco pesado que empuja y se queda 2,5 s en el suelo como barricada: los enemigos lo rodean y para sus disparos. | **Roca Afilada** con Réplica | ×1,85 daño y +1 piedra. Son puntiagudas: al deshacerse estallan en 6 esquirlas que atraviesan. | tamaño | — | +1 cantidad | velocidad |
| Avalancha | Meteoro | Caen rocas del cielo sobre los enemigos y luego ruedan pantalla abajo arrollando e interrumpiendo a los que pillan. | **Trampa Rocas** con Reflejos | ×1,5 daño y +2 rocas. Se quedan 6 s como piedras puntiagudas: ×2 a Volador, Fuego, Hielo y Bicho; ×0,5 a Lucha, Tierra y Acero. | radio | — | +1 cantidad | llega antes |
| Tumba Rocas | Aturdimiento | Caen seis rocas en anillo alrededor del enemigo: lo encierran 3 s, lo frenan y no dejan entrar a nadie. Paran los disparos. | **Testarazo** con Vigor | ×1,55 daño y tumba más grande. Te lanzas de cabeza a la tumba y los muros estallan hacia fuera como metralla. | radio | aturdimiento | +1 zona | — |
| Poder Pasado | Órbita | Rocas antiguas giran a tu alrededor y cada 2 s salen disparadas al enemigo más cercano y vuelven a crecer. A veces te suben todas las stats. | **Tormenta de Diamantes** con Coraza | +2 rocas y ×1,7 daño. Son diamantes: estallan en esquirlas al impactar y cada impacto te da +1 de defensa (hasta 5). | radio, tamaño | — | +1 cantidad | velocidad |
| Joya de Luz | Rebote | Una gema que se parte en dos cada vez que golpea a un enemigo (hasta 4 ramas). | **Rayo Meteórico** con Réplica | ×1,2 daño y +1 gema. Las ramas que fallan vuelven a ti (+1 de at. esp.); con 3 guardadas disparas un rayo de meteoros. | tamaño | — | +1 cantidad | velocidad |
| Pedrada | Parábola | Lanza entre 2 y 5 rocas en parábola (siempre 5 con Encadenado): caen, atraviesan y botan una vez. | **Hachazo Pétreo** con Amplitud | ×2 daño. Cada roca, al caer, se parte en dos hachas de piedra que barren el suelo hacia los lados. | tamaño | — | +1 cantidad | velocidad, caída |
| Rodar | Carambola | Una roca rodando que rebota por la pantalla y dobla su daño con cada golpe seguido (hasta ×8); si pasa 1 s sin golpear, vuelve a ×1. Con Fortaleza activa empieza en ×2. | **Romperrocas** con Coraza | ×1,8 daño y más grande. Al llegar a ×8 estalla, rompe las rocas del mapa cercanas (sueltan metralla) y vuelve a empezar. | tamaño, explosión | duración | +1 cantidad | velocidad |

### Hielo

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Rayo Hielo | Haz | Un rayo helado que deja el suelo resbaladizo y puede congelar. | **Ventisca** con Potencia | ×1,2 daño. El rayo sale igual y, detrás, avanza un cono de ventisca que enfría a todos; con nieve congela siempre y hace ×1,5. | grosor, largo (la mitad) | — | — | — |
| Nieve Polvo | Aura | Una nevada a tu alrededor que congela a los que se quedan cerca. | **Viento Hielo** con Amplitud | ×2 daño y más radio. Cada 0,8 s sale una ráfaga helada en cono hacia donde andas que aparta y enfría mucho. | radio | — | — | — |
| Granizo | Meteoro | Una nube de granizo te sigue y lo apedrea todo a tu alrededor. | **Alud** con Reflejos | ×1 daño y más granizo. Cada vez que te golpean, el granizo pega ×1,5 durante 3 s y caen 6 bloques de hielo a tu alrededor. | radio | — | +1 cantidad | llega antes |
| Canto Helado | Teledirigido | Una esquirla instantánea al enemigo que está a punto de tocarte. | **Carámbano** con Reflejos | ×1,7 daño. Tres carámbanos seguidos al mismo enemigo: si aciertan los tres, se congela 1 s. | tamaño | — | +1 cantidad | velocidad |
| Liofilización | Aturdimiento | Un frío que seca: muy eficaz contra el Agua y congela a los empapados. | **Frío Polar** con Persistencia | ×1,65 daño y más grande. Los congelados (por lo que sea) con menos del 25% de vida se hacen añicos; a los jefes les quita un 5%. | radio | aturdimiento | +1 zona | — |
| Chuzos | Columna | Caen carámbanos y los que fallan se quedan clavados frenando. | **Lanza Glacial** con Persistencia | ×2,05 daño. Una lanza de hielo gigante cae en el centro del grupo y congela un círculo que crece hasta 120 px en 2 s. | grosor, alto | duración | +1 cantidad | — |
| Rayo Aurora | Aguja | Un rayo de aurora que gira y deja una estela que vuelve a golpear y quita fuerza. | **Mundo Gélido** con Persistencia | ×2 daño y +1 rayo. Tras cada vuelta, el círculo barrido se hiela 2 s: frena mucho y enfría a los que entran. | radio, grosor | duración, aturdimiento | +1 cantidad | giro |

### Lucha

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Golpe Kárate | Golpe | Un tajo seco en línea con mucho crítico: cada crítico te deja golpear otra vez. | **A Bocajarro** con Puntería | Una ráfaga de 6 golpes rapidísimos al frente, con mucho crítico. | radio | — | — | — |
| Esfera Aural | Proyectil | Una esfera de aura que nunca falla, atraviesa paredes y pega más cuanto más lejos va. | **Onda Certera** con Imán | ×2 daño. Una esfera enorme y lenta que atrae a los enemigos a su paso y estalla en el blanco, más fuerte cuanto más lejos ha ido. | tamaño | — | +1 cantidad | velocidad |
| Patada Giro | Giro | Avanzas girando hacia el enemigo a patadas y cortas lo que prepara. | **Patada Salto Alta** con Vigor | ×1,85 daño. Avanzas girando a patadas como siempre y, al acabar, saltas al enemigo más grande y caes sobre él con un rodillazo enorme. | radio | — | +1 cantidad | — |
| Onda Vacío | Empujón | Un puñetazo al aire que crea un vacío: atrae a los enemigos a un punto y los golpea. | **Puño Incremento** con Coraza | Cada enemigo golpeado te sube el ataque físico un rato (hasta 6 veces). | radio | — | — | — |
| Puño Dinámico | Aturdimiento | Un puñetazo tremendo que a veces falla, pero si acierta confunde siempre. | **Megapuño** con Puntería | Ya no falla y deja un cráter 2 s donde los enemigos quedan confusos. | radio | aturdimiento | +1 zona | — |
| Tajo Cruzado | Aspas | Tajos en cruz que, al acabar, se quedan girando como las aspas de un molino. | **Espada Santa** con Puntería | Cada 4 s, cuatro espadas se clavan a tu alrededor: los enemigos dentro reciben un 30% más de daño. | tamaño | — | +1 cantidad | velocidad, espiral |
| Gancho Alto | Columna | Un gancho al cielo que mantiene a los enemigos en el aire y luego caen. | **Puño Certero** con Aprendizaje | ×1,55 daño. El gancho levanta a los enemigos como siempre y, mientras están en el aire, sueltas un puñetazo devastador en línea. | grosor, alto | duración | +1 cantidad | — |

### Fantasma

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Lengüetazo | Golpe | Un lametazo largo en línea que atraviesa paredes y deja paralizado al enemigo 2 s. | **Puño Sombra** con Potencia | ×2,5 daño. Puños de sombra salen de tu sombra y golpean a la vez a los 3 enemigos más cercanos, sin fallar y a través de las paredes. | radio | — | — | — |
| Bola Sombra | Proyectil | Una esfera oscura que crece y pega un 15% más con cada enemigo que atraviesa; a veces les baja la defensa. | **Golpe Fantasma** con Propulsión | ×1,85 daño y +1 bola. A los 80 px desaparece y reaparece dentro del blanco estallando, sin que la paren los escudos. | tamaño | — | +1 cantidad | velocidad |
| Infortunio | Cadena | Una maldición que salta entre enemigos con algún estado (×1,7) y se los alarga 1 s; deja malditos a los que toca. | **Poltergeist** con Imán | ×2 daño y +2 saltos. Por cada estado que tenga un enemigo, un objeto fantasma vuela desde lejos y le golpea. | radio | — | +1 cantidad | — |
| Sombra Vil | Teledirigido | Tu sombra se estira al instante por el suelo hasta el enemigo y lo deja clavado 0,6 s (no se mueve, pero puede disparar). | **Garra Umbría** con Reflejos | ×1,25 daño y +1 sombra. Salen tres garras de la sombra: el blanco recibe las tres y los de alrededor, una, con un 30% de crítico. | tamaño | — | +1 cantidad | velocidad |
| Viento Aciago | Vórtice | Un viento maldito hace girar a los enemigos alrededor de su centro: chocan entre ellos y a veces se marean. | **Golpe Umbrío** con Imán | ×2,2 daño y más grande. Desapareces dentro del remolino (invulnerable 1 s) y reapareces en su centro con un golpe que lanza fuera a todos. | radio | duración | — | — |
| Homenaje Póstumo | Aliados | Espíritus que atraviesan paredes, persiguen y frenan a los enemigos; salen más y más fuertes cuantos más enemigos hayas debilitado en los últimos 20 s. | **Marcha Espectral** con Persistencia | ×1,8 daño y +2 espíritus. Los enemigos que debilitan se levantan 3 s como fantasmas aliados (hasta 4) que atacan a los demás. | tamaño | duración | +1 cantidad | velocidad |
| Orbes Espectro | Chaparrón | Orbes fantasma caen en corona alrededor del enemigo con más vida de la pantalla y se juntan sobre él. | **Rayo Umbrío** con Réplica | ×2,45 daño y +2 orbes. Cada orbe que impacta abre una grieta: medio segundo después sale de ella un rayo de sombra. | tamaño | — | +1 cantidad | velocidad |

### Dragón

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Furia Dragón | Haz | Una llamarada dracónica en línea que se enfurece si sigues atacando al mismo enemigo: +25% cada vez, hasta ×2. | **Cometa Draco** con Potencia | ×1,6 daño y más grueso. Caen 5 cometas a lo largo del rayo. | grosor, largo (la mitad) | — | — | — |
| Danza Dragón | Potenciador | No hace daño: cada pila sube a la vez tu ATAQUE (físico) y tu VELOCIDAD. | **Estruendo Escama** con Carrera | Cada uso sube 1 pila de TODO: ataque, at. esp., velocidad y defensa. Al llegar al máximo, un rugido asusta a los de alrededor. | — | duración | — | — |
| Dragoaliento | Abanico | Un aliento de dragón en abanico que atraviesa a todos: pega más de cerca que de lejos y a veces paraliza. | **Pulso Dragón** con Réplica | ×1,35 daño. El aliento sale igual y, además, una onda con forma de cabeza de dragón avanza 200 px atravesando a todos y al final muerde lo que pilla. | tamaño | — | +1 cantidad | velocidad |
| Garra Dragón | Golpe | Un zarpazo de dragón que además lanza tres cortes de energía hacia delante. | **Carga Dragón** con Potencia | ×3,1 daño. Embistes en semicírculo alrededor del blanco cortando todo lo del arco y acabas detrás de él. | radio | — | — | — |
| Enfado | Giro | Un frenesí de 2,5 s girando cada vez más rápido y más abierto; al acabar te mareas un momento. | **Dracoflecha** con Vigor | ×2,2 daño y más radio. Al acabar el frenesí, dos Dreepy van a por dos enemigos y vuelven a ti, dos veces. | radio | — | +1 cantidad | — |
| Ráfaga Escamas | Ráfaga | Escamas en ráfaga hacia donde miras. Al acabar cada ráfaga ganas velocidad, pero tu defensa baja un poco. | **Fragor Escamas** con Puntería | ×1,3 daño, +1 escama y −25% recarga. Al acabar la ráfaga, cada enemigo tocado suelta un anillo de sonido que daña a los de al lado. | tamaño | — | +1 cantidad | velocidad |
| Ciclón | Aspas | Tornados que salen girando en espiral y se llevan consigo a los enemigos pequeños; ×1,5 a los voladores. | **Dracoenergía** con Amplitud | ×1,3 daño y +2 tornados. Dejan un rastro de energía y, cuando dos se cruzan, estallan juntos. | tamaño | — | +1 cantidad | velocidad, espiral |

### Hada

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Viento Feérico | Estallido | Una brisa mágica en todas direcciones que aparta un poco a los enemigos y te trae la experiencia y los objetos que toca. | **Fuerza Lunar** con Amplitud | ×1,9 daño. Una luna se queda sobre ti y dispara rayos de luz lunar al enemigo con más vida, bajándole el ataque un 30%. | tamaño | — | +1 cantidad | velocidad |
| Brillo Mágico | Aura | Un destello a tu alrededor que deslumbra: ×1,6 a los que vienen hacia ti y ×0,7 a los que te dan la espalda. | **Campo de Niebla** con Aprendizaje | ×2,1 daño. Una niebla te sigue: tú y tus compañeros dentro no recibís estados y los enemigos dentro hacen un 30% menos de daño (los Dragón, un 50%). | radio | — | — | — |
| Beso Drenaje | Teledirigido | Un beso que persigue al enemigo, te cura la mitad del daño que hace y lo deja enamorado 1,5 s (ni te toca ni dispara). | **Luz Lunar** con Aprendizaje | ×1,75 daño y +2 besos. Lo que cures por encima de tu vida máxima se guarda como escudo (hasta un 15% de tu vida) que se va gastando. | tamaño | — | +1 cantidad | velocidad |
| Carantoña | Golpe | Una nube de polvo cómica sobre el enemigo: dentro caen golpes al azar sobre todos los que pilla. | **Choque Anímico** con Aprendizaje | ×2,8 daño. La nube rueda 120 px hacia delante arrastrando a los que pilla dentro. | radio | — | — | — |
| Voz Cautivadora | Empujón | Un grito encantador que daña y aparta a los que tienes cerca; luego caminan embelesados 1,5 s hacia donde lo lanzaste sin tocarte. | **Encanto** con Coraza | ×2 daño y más radio. Además, a los embelesados les baja el ataque un 60%. | radio | — | — | — |
| Cañón Floral | Aguja | Un rayo floral que gira a tu alrededor como una aguja de reloj y va plantando flores que estallan al segundo. | **Luz Aniquiladora** con Amplitud | ×1,7 daño y +1 rayo. Al estallar, cada flor dispara un rayo de luz hacia ti que atraviesa todo lo que hay entre medias. | radio, grosor | duración, aturdimiento | +1 cantidad | giro |
| Ciclón Primavera | Chaparrón | Caen pétalos de lo alto: con más de media vida bajan el ataque de los enemigos; con menos, cada pétalo que acierta te sube el ataque. | **Furia Natural** con Síntesis | ×1,45 daño y +2 pétalos. Además, cada pétalo quita un 1% de la vida que le quede al enemigo (a los jefes, la cuarta parte). | tamaño | — | +1 cantidad | velocidad |

### Acero

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Garra Metal | Golpe | Un zarpazo de ida y vuelta: el de vuelta llega justo después y es crítico si el de ida acertó. | **Cabeza de Hierro** con Imán | ×3,15 daño. Un cabezazo con embestida corta que interrumpe a todos los que golpea. | radio | — | — | — |
| Foco Resplandor | Haz | Un rayo de luz metálica que se refleja en las paredes y en los objetos sólidos hasta 2 veces. | **Rayo Metálico** con Imán | Un láser continuo de 1,2 s que sigue tu apuntado y se refleja hasta 4 veces. | grosor, largo (la mitad) | — | — | — |
| Puño Meteoro | Meteoro | Puños meteoro que caen sobre los enemigos y rebotan hacia el siguiente más cercano (2 rebotes). | **Bomba Imán** con Imán | ×2,5 daño y +2 bombas. Bombas imán que no fallan: se pegan al enemigo, atraen a los de alrededor y estallan a los 0,6 s. | radio | — | +1 cantidad | llega antes |
| Disparo Espejo | Rebote | Deja un espejo que gira 3 s: cada disparo tuyo que lo cruza sale duplicado y cada 0,6 s destella y lanza un reflejo que rebota entre los enemigos. | **Metaláser** con Réplica | ×1,15 daño. Dos espejos con un láser entre ellos que daña todo lo que cruza la línea. | tamaño | — | +1 cantidad | velocidad |
| Giro Bola | Giro | Giras como una bola de acero golpeando todo alrededor: cuanto más lento vas, más daño (quieto ×2, corriendo ×0,6). | **Cuerpo Pesado** con Coraza | ×1,5 daño y +1 vuelta. Quieto te anclas: no te frenan y los que te tocan rebotan aturdidos y reciben el giro. | radio | — | +1 cantidad | — |
| Escudo Real | Escudo | Un escudo regio que para un golpe y aturde a los que tienes cerca; al gastarlo pasas 3 s a forma Filo: +40% de ataque físico, pero sin escudos nuevos. | **Embate Supremo** con Coraza | +1 escudo y ×1,8 daño. En forma Filo, una espada fantasma gira a tu alrededor cortando. | radio | aturdimiento | +1 cantidad | — |
| Ala de Acero | Aves | Un ave de acero cruza la pantalla en pasadas rasantes cada 1,5 s atravesando a todos; a veces te sube la defensa. | **Meteoimpacto** con Coraza | ×1,75 daño. El ave se estrella como un meteoro en el grupo más grande y deja un cráter de chatarra 4 s: dentro, +defensa para ti. | radio, círculo (la mitad) | duración | +1 cantidad | velocidad |
| Fiebre Dorada | Chaparrón | Llueven monedas que botan y se quedan 3 s en el suelo: si las pisas, +2% de crítico 5 s (hasta 5). Cada lluvia te cansa un poco: −10% de at. esp. 2 s. | **Deseo Oculto** con Puntería | ×1,75 daño y +2 monedas. 2 s después de cada lluvia, una estrella cae sobre el grupo más grande. | tamaño | — | +1 cantidad | velocidad |

### Siniestro

| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |
|---|---|---|---|---|---|---|---|---|
| Mordisco | Golpe | Muerdes y no sueltas: arrastras al enemigo delante de ti 0,5 s con tres mordiscos y le interrumpes lo que preparaba. | **Triturar** con Potencia | ×1,6 daño. Cada mordisco le baja la defensa y al soltarlo lo lanzas lejos. | radio | — | — | — |
| Pulso Umbrío | Estallido | Una onda oscura en todas direcciones que se contagia: cada enemigo alcanzado suelta su propio pulso y a veces se le interrumpe el ataque. | **Alarido** con Carrera | ×1,9 daño. Los pulsos llegan el doble de lejos y bajan el ataque de los alcanzados un 40%. | tamaño | — | +1 cantidad | velocidad |
| Tinieblas | Aura | Una sombra te rodea: hace un daño fijo según tu nivel (sin tipos ni defensas) y engaña a los de dentro, que a veces disparan hacia atrás. | **Pesadilla** con Síntesis | ×2,1 daño. Los que pasan 2 s dentro se duermen y los dormidos pierden un 3% de su vida por segundo. | radio | — | — | — |
| Golpe Bajo | Teledirigido | Un golpe a traición al enemigo que está a punto de atacar: le hace el doble y le cancela el ataque. Si nadie prepara nada, al más cercano (más fuerte si está de espaldas). | **Juego Sucio** con Puntería | ×1,8 daño y +2 golpes. Duele más cuanto más fuerte es el enemigo: a los jefes, ×2,5. | tamaño | — | +1 cantidad | velocidad |
| Tajo Umbrío | Giro | Te desvaneces 0,5 s en la oscuridad mientras giras: te pierden de vista y tus tajos son críticos contra los que no te miran. | **Lariat Oscuro** con Puntería | ×1,4 daño y un 40% más de radio. Giras con los brazos abiertos atrayendo hacia dentro, sin que te paren los escudos ni la resistencia a tu tipo. | radio | — | +1 cantidad | — |
| Brecha Negra | Barrido | Una oscuridad cubre la pantalla: duerme a todos (se despiertan con un golpe fuerte), les quita parte de la vida y daña. Los jefes duermen menos. | **Calamidad** con Reflejos | ×2 daño, +20% de efecto y −15% recarga. Al acabar, un agujero negro se abre en ti 3 s y se traga a los dormidos. | — | aturdimiento | — | — |
| Paliza | Aliados | Copias pequeñas de tu Pokémon, una por cada tipo de tus ataques (hasta 4): cada una pega con su tipo y su estado (la de fuego quema, la de veneno envenena...). | **Cerco Dimensión** con Persistencia | ×1,8 daño y +1 copia. Salen de portales junto a los enemigos (les pegan por la espalda) y los portales se tragan los disparos enemigos. | tamaño | duración | +1 cantidad | velocidad |

