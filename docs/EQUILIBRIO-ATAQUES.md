# Equilibrio de ataques (2026-11-02)

Pedido del dueño: «baja los que están muy fuertes para que todos estén a la par». Resumen y cifras del bot en
`docs/2.0-ESTADO.md` («Equilibrio de ataques»). Aquí, la tabla entera.

**Cómo se mide.** `node tools/balance.cjs --json x.json` lanza cada ataque de verdad (el código de combate del juego)
contra un jefe que te persigue y contra una horda de 50, 20 s cada uno, y da su daño por segundo (con recarga, duración,
área, número de golpes y quemaduras; el veneno va aparte). El **valor** es la media geométrica de los dos, respecto a la
mediana de todos los ataques en esa etapa (1 = lo normal). Aquí siempre con las medianas de **antes**, para comparar.
`node tools/equilibrio.cjs antes.json despues.json` hace esta tabla; `--propone` da los factores.

**Regla.** Nivel máximo y evolucionado: lo que pasaba de 1,15 baja a 1,1; lo que no llegaba a 0,65 (sin contar los
venenosos) sube a 0,75. Nivel 1: sólo baja lo que pasaba de 1,25 (a 1,15). Los factores están en `DMG_K` de
`js/data/moves.js` (nivel 1 y nivel máximo; entre medias, en proporción) y en `mods.dmg` de cada evolución (con su texto
en todos los idiomas).

Ordenada por el valor evolucionado de antes. ↓ / ↑ = baja / sube más de 0,04.

| Ataque | Familia | Nv 1 antes → después | Nv máx antes → después | Evolución antes → después |
|---|---|---|---|---|
| Ciclón Primavera / Furia Natural | dusting | 0,93 → 0,93 | 0,88 → 0,88 | 1,56 → 1,17 ↓ |
| Fiebre Dorada / Deseo Oculto | dusting | 0,77 → 0,77 | 0,99 → 0,99 | 1,40 → 1,12 ↓ |
| Tajo Umbrío / Lariat Oscuro | spin | 1,00 → 1,00 | 1,45 → 1,09 ↓ | 1,36 → 1,09 ↓ |
| Granizo / Alud | meteor | 1,19 → 1,19 | 0,93 → 0,93 | 1,34 → 1,12 ↓ |
| Placaje / Derribo | melee | 1,42 → 1,12 ↓ | 1,24 → 1,10 ↓ | 1,33 → 1,09 ↓ |
| Disparo Espejo / Metaláser | bounce | 0,88 → 0,88 | 0,81 → 0,81 | 1,32 → 1,10 ↓ |
| Puño Meteoro / Bomba Imán | meteor | 1,13 → 1,13 | 1,49 → 1,11 ↓ | 1,32 → 1,11 ↓ |
| Tormenta Floral / Danza Pétalo | orbit | 1,23 → 1,23 | 1,43 → 1,11 ↓ | 1,31 → 1,10 ↓ |
| Rueda Aural / Ataque Fulgor | ricochet | 0,66 → 0,66 | 1,42 → 1,11 ↓ | 1,30 → 1,11 ↓ |
| Ráfaga Escamas / Fragor Escamas | knife | 0,74 → 0,74 | 1,10 → 1,10 | 1,29 → 1,11 ↓ |
| Ciclón / Dracoenergía | cross | 1,02 → 1,02 | 0,87 → 0,87 | 1,29 → 1,13 ↓ |
| Tumba Rocas / Testarazo | stun | 1,29 → 1,14 ↓ | 0,75 → 0,75 | 1,29 → 1,11 ↓ |
| Esfera Aural / Onda Certera | projectile | 0,68 → 0,68 | 1,44 → 1,10 ↓ | 1,29 → 1,11 ↓ |
| Ascuas / Llamarada | projectile | 0,75 → 0,75 | 1,47 → 1,11 ↓ | 1,28 → 1,15 ↓ |
| Enfado / Dracoflecha | spin | 1,12 → 1,12 | 1,40 → 0,93 ↓ | 1,28 → 1,07 ↓ |
| Bola Neblina / Resplandor | homing | 0,70 → 0,70 | 1,37 → 1,10 ↓ | 1,27 → 1,06 ↓ |
| Ataque Ala / Pájaro Osado | melee | 0,85 → 0,85 | 1,39 → 1,09 ↓ | 1,27 → 1,09 ↓ |
| Beso Drenaje / Luz Lunar | homing | 0,63 → 0,63 | 1,23 → 1,10 ↓ | 1,27 → 1,09 ↓ |
| Liofilización / Frío Polar | stun | 1,00 → 1,00 | 0,83 → 0,83 | 1,27 → 1,12 ↓ |
| Joya de Luz / Rayo Meteórico | bounce | 0,82 → 0,82 | 1,05 → 1,05 | 1,26 → 1,09 ↓ |
| Sombra Vil / Garra Umbría | homing | 0,75 → 0,75 | 0,84 → 0,84 | 1,25 → 1,12 ↓ |
| Psicorrayo / Premonición | beam | 1,06 → 1,06 | 0,78 → 0,78 | 1,24 → 1,12 ↓ |
| Cañón Floral / Luz Aniquiladora | sweep | 1,17 → 1,17 | 1,40 → 1,11 ↓ | 1,23 → 1,12 ↓ |
| Confusión / Psicocarga | projectile | 0,84 → 0,84 | 1,38 → 1,12 ↓ | 1,23 → 1,12 ↓ |
| Remolino / Huracán | shove | 0,69 → 0,69 | 0,67 → 0,67 | 1,22 → 1,11 ↓ |
| Bomba Germen / Mazazo | bounce | 0,83 → 0,83 | 1,31 → 1,12 ↓ | 1,22 → 1,12 ↓ |
| Poder Pasado / Tormenta de Diamantes | orbit | 0,83 → 0,83 | 1,49 → 1,09 ↓ | 1,21 → 1,08 ↓ |
| Ala de Acero / Meteoimpacto | wings | 0,78 → 0,78 | 1,45 → 1,11 ↓ | 1,21 → 1,09 ↓ |
| Energibola / Gigadrenado | homing | 0,65 → 0,65 | 1,33 → 1,11 ↓ | 1,21 → 1,14 ↓ |
| Giro Rápido / Triataque | spin | 0,90 → 0,90 | 1,00 → 1,00 | 1,20 → 1,11 ↓ |
| Brillo Mágico / Campo de Niebla | aura | 1,01 → 1,01 | 1,44 → 1,09 ↓ | 1,20 → 1,07 ↓ |
| Bomba Ácida / Onda Tóxica | bounce | 0,72 → 0,72 | 0,86 → 0,86 | 1,19 → 1,11 ↓ |
| Disparo Lodo / Tierra Viva | nova | 0,66 → 0,66 | 0,96 → 0,96 | 1,18 → 1,10 ↓ |
| Furia Dragón / Cometa Draco | beam | 1,15 → 1,15 | 1,13 → 1,13 | 1,18 → 1,11 ↓ |
| Zumbido / Enjambre | aura | 0,72 → 0,72 | 1,31 → 1,09 ↓ | 1,17 → 1,10 ↓ |
| Cascada / Pulso Primigenio | column | 0,71 → 0,71 | 0,91 → 0,91 | 1,17 → 1,08 ↓ |
| Psicocorte / Psicocolmillo | boomerang | 0,97 → 0,97 | 1,24 → 1,10 ↓ | 1,16 → 1,15 |
| Tinieblas / Pesadilla | aura | 0,71 → 0,71 | 1,40 → 1,09 ↓ | 1,16 → 1,06 ↓ |
| Mordisco / Triturar | melee | 0,82 → 0,82 | 1,11 → 1,11 | 1,16 → 1,09 ↓ |
| Rayo Aurora / Mundo Gélido | sweep | 1,17 → 1,17 | 1,46 → 1,11 ↓ | 1,15 → 1,07 ↓ |
| Residuos / Bomba Lodo | projectile | 0,83 → 0,83 | 1,21 → 1,04 ↓ | 1,15 → 1,11 ↓ |
| Giro Bola / Cuerpo Pesado | spin | 0,96 → 0,96 | 1,09 → 1,09 | 1,14 → 1,14 |
| Rayo Solar / Cuchilla Solar | charge | 1,05 → 1,05 | 0,91 → 0,91 | 1,14 → 1,14 |
| Golpe Bajo / Juego Sucio | homing | 0,76 → 0,76 | 0,89 → 0,89 | 1,14 → 1,14 |
| Magnitud / Taladradora | quake | 1,13 → 1,13 | 0,82 → 0,82 | 1,14 → 1,14 |
| Nieve Polvo / Viento Hielo | aura | 0,73 → 0,73 | 1,35 → 1,08 ↓ | 1,12 → 1,09 |
| Pistola Agua / Escaldar | projectile | 0,83 → 0,83 | 1,38 → 1,11 ↓ | 1,12 → 1,12 |
| Picadura / Tijera X | melee | 0,74 → 0,74 | 1,00 → 1,00 | 1,09 → 1,09 |
| Veneno X / Garra Nociva | cross | 1,04 → 1,04 | 1,21 → 1,13 ↓ | 1,08 → 1,08 |
| Paliza / Cerco Dimensión | ally | 1,13 → 1,13 | 1,11 → 1,11 | 1,08 → 1,08 |
| Psíquico / Vasta Fuerza | nova | 1,18 → 1,18 | 0,88 → 0,88 | 1,08 → 1,08 |
| Bola Voltio / Chispa | bounce | 0,98 → 0,98 | 1,14 → 1,14 | 1,07 → 1,07 |
| Balón Ígneo / V de Fuego | ricochet | 0,95 → 0,95 | 1,19 → 1,09 ↓ | 1,07 → 1,07 |
| Danza Pluma / Aerochorro | dusting | 0,75 → 0,75 | 0,85 → 0,85 | 1,07 → 1,07 |
| Voto Fuego / Lluvia Ígnea | puddle | 1,29 → 1,18 ↓ | 1,21 → 1,13 ↓ | 1,07 → 1,07 |
| Viento Aciago / Golpe Umbrío | vortex | 1,12 → 1,12 | 0,79 → 0,79 | 1,06 → 1,06 |
| Vozarrón / Alboroto | nova | 1,32 → 1,20 ↓ | 1,07 → 1,07 | 1,06 → 1,06 |
| Giro Fuego / Fuego Sagrado | orbit | 0,99 → 0,99 | 1,35 → 1,12 ↓ | 1,04 → 1,05 |
| Tornado / Vendaval | orbit | 0,97 → 0,97 | 1,17 → 1,09 ↓ | 1,04 → 1,03 |
| Rayo / Electrocañón | chain | 1,06 → 1,06 | 0,87 → 0,87 | 1,03 → 1,03 |
| Lengüetazo / Puño Sombra | melee | 0,83 → 0,83 | 1,19 → 1,11 ↓ | 1,03 → 1,03 |
| Viento Feérico / Fuerza Lunar | nova | 0,90 → 0,90 | 0,94 → 0,94 | 1,03 → 1,03 |
| Semilladora / Fulgor Semilla | knife | 0,87 → 0,87 | 1,18 → 1,09 ↓ | 1,02 → 1,02 |
| Tajo Aéreo / Ataque Aéreo | homing | 1,39 → 1,08 ↓ | 1,25 → 1,11 ↓ | 1,01 → 1,02 |
| Hoja Afilada / Lluevehojas | boomerang | 0,96 → 0,96 | 0,98 → 0,98 | 1,00 → 1,00 |
| Rodar / Romperrocas | ricochet | 0,73 → 0,73 | 1,32 → 1,10 ↓ | 1,00 → 0,99 |
| Golpe Aéreo / Acróbata | dash | 1,32 → 1,17 ↓ | 0,89 → 0,89 | 1,00 → 1,00 |
| Pulso Umbrío / Alarido | nova | 1,28 → 1,18 ↓ | 1,02 → 1,02 | 0,99 → 0,99 |
| Campo Psíquico / Onda Mental | puddle | 0,71 → 0,71 | 1,41 → 1,14 ↓ | 0,99 → 0,99 |
| Hueso Palo / Hueso Sombrío | lob | 0,94 → 0,94 | 1,26 → 1,09 ↓ | 0,98 → 0,98 |
| Avalancha / Trampa Rocas | meteor | 1,04 → 1,04 | 1,02 → 1,02 | 0,97 → 0,97 |
| Rayo Hielo / Ventisca | beam | 1,02 → 1,02 | 0,76 → 0,76 | 0,97 → 0,97 |
| Lanzarrocas / Roca Afilada | projectile | 0,73 → 0,73 | 1,39 → 1,14 ↓ | 0,97 → 0,97 |
| Pedrada / Hachazo Pétreo | lob | 1,07 → 1,07 | 0,84 → 0,84 | 0,96 → 0,96 |
| Géiser Fotónico / Psicoataque | column | 1,13 → 1,13 | 1,15 → 1,15 | 0,96 → 0,96 |
| Gancho Alto / Puño Certero | column | 0,72 → 0,72 | 1,15 → 1,07 ↓ | 0,95 → 0,94 |
| Impactrueno / Trueno | projectile | 0,80 → 0,80 | 0,93 → 0,93 | 0,95 → 0,95 |
| Rayo Carga / Rayo Fusión | sweep | 1,07 → 1,07 | 1,14 → 1,14 | 0,94 → 0,94 |
| Burbuja / Surf | nova | 1,11 → 1,11 | 0,98 → 0,98 | 0,93 → 0,93 |
| Hidrobomba / Hidrocañón | beam | 1,24 → 1,24 | 1,26 → 1,10 ↓ | 0,92 → 0,92 |
| Onda Ígnea / Erupción | nova | 1,55 → 1,20 ↓ | 0,98 → 0,98 | 0,92 → 0,92 |
| Garra Metal / Cabeza de Hierro | melee | 0,86 → 0,86 | 1,27 → 1,09 ↓ | 0,92 → 0,90 |
| Lanzallamas / Sofoco | cone | 1,56 → 1,07 ↓ | 0,82 → 0,82 | 0,91 → 0,91 |
| Onda Trueno / Voltio Cruel | stun | 1,13 → 1,13 | 0,83 → 0,83 | 0,91 → 0,91 |
| Meteoros / Teraclúster | cross | 1,13 → 1,13 | 1,05 → 1,05 | 0,90 → 0,90 |
| Shuriken de Agua / Azote Torrencial | knife | 0,82 → 0,82 | 1,03 → 1,03 | 0,89 → 0,89 |
| Carantoña / Choque Anímico | melee | 1,11 → 1,11 | 1,39 → 1,13 ↓ | 0,89 → 0,89 |
| Foco Resplandor / Rayo Metálico | beam | 1,22 → 1,22 | 0,76 → 0,76 | 0,89 → 0,89 |
| Fuego Fatuo / Infierno | turret | 0,76 → 0,76 | 0,78 → 0,78 | 0,89 → 0,89 |
| Hiperrayo / Rayo Prisma | charge | 1,47 → 1,15 ↓ | 0,93 → 0,93 | 0,87 → 0,87 |
| Golpe Kárate / A Bocajarro | melee | 1,10 → 1,10 | 0,94 → 0,94 | 0,87 → 0,87 |
| Orbes Espectro / Rayo Umbrío | dusting | 1,21 → 1,21 | 1,21 → 1,09 ↓ | 0,87 → 0,87 |
| Golpe Cuerpo / Gigaimpacto | melee | 1,25 → 1,25 | 1,43 → 1,10 ↓ | 0,86 → 0,86 |
| Torbellino / Salmuera | vortex | 1,43 → 1,15 ↓ | 1,05 → 1,05 | 0,85 → 0,85 |
| Rayo Burbuja / Acua Cola | cone | 1,20 → 1,20 | 1,01 → 1,01 | 0,85 → 0,85 |
| Al Ataque / Escaramuza | ally | 1,23 → 1,23 | 0,96 → 0,96 | 0,85 → 0,85 |
| Pin Misil / Aguijón Letal | knife | 0,90 → 0,90 | 1,20 → 1,12 ↓ | 0,85 → 0,85 |
| Rueda Fuego / Envite Ígneo | trail | 1,58 → 1,14 ↓ | 1,11 → 1,11 | 0,84 → 0,84 |
| Ataque Rápido / Velocidad Extrema | dash | 1,33 → 1,14 ↓ | 0,93 → 0,93 | 0,84 → 0,84 |
| Dragoaliento / Pulso Dragón | cone | 1,21 → 1,21 | 1,41 → 1,10 ↓ | 0,83 → 0,83 |
| Picotazo Veneno / Puya Nociva | projectile | 0,64 → 0,64 | 0,90 → 0,90 | 0,82 → 0,82 |
| Bola Sombra / Golpe Fantasma | projectile | 0,76 → 0,76 | 1,36 → 1,10 ↓ | 0,81 → 0,81 |
| Sustituto / Doble Equipo | turret | 0,84 → 0,84 | 0,78 → 0,78 | 0,81 → 0,81 |
| Púas / Fisura | mine | 1,26 → 1,17 ↓ | 0,83 → 0,83 | 0,81 → 0,81 |
| Canto Helado / Carámbano | homing | 0,76 → 0,76 | 0,81 → 0,81 | 0,81 → 0,81 |
| Homenaje Póstumo / Marcha Espectral | ally | 1,07 → 1,07 | 0,94 → 0,94 | 0,80 → 0,80 |
| Chispazo / Campo Eléctrico | aura | 0,95 → 0,95 | 0,95 → 0,95 | 0,80 → 0,80 |
| Huesomerang / Ataque Óseo | boomerang | 0,98 → 0,98 | 1,03 → 1,03 | 0,79 → 0,79 |
| Voz Cautivadora / Encanto | shove | 1,11 → 1,11 | 0,78 → 0,78 | 0,79 → 0,79 |
| Látigo Cepa / Latigazo | melee | 0,85 → 0,85 | 1,20 → 1,09 ↓ | 0,78 → 0,79 |
| Bucle Arena / Fuerza Equina | vortex | 1,30 → 1,14 ↓ | 1,02 → 1,02 | 0,78 → 0,78 |
| Chuzos / Lanza Glacial | column | 1,02 → 1,02 | 0,98 → 0,98 | 0,78 → 0,78 |
| Puño Dinámico / Megapuño | stun | 0,74 → 0,74 | 0,65 → 0,75 ↑ | 0,77 → 0,79 |
| Ala Bis / Ala Mortífera | wings | 1,32 → 1,15 ↓ | 0,91 → 0,91 | 0,77 → 0,77 |
| Hierba Lazo / Planta Feroz | aura | 0,87 → 0,87 | 0,91 → 0,91 | 0,76 → 0,76 |
| Nitrocarga / Golpe Calor | dash | 1,28 → 1,24 ↓ | 0,91 → 0,91 | 0,76 → 0,76 |
| Paranormal / Psicoonda | shove | 1,18 → 1,18 | 0,95 → 0,95 | 0,76 → 0,76 |
| Onda Vacío / Puño Incremento | shove | 1,19 → 1,19 | 1,08 → 1,08 | 0,76 → 0,76 |
| Garra Dragón / Carga Dragón | melee | 0,94 → 0,94 | 1,29 → 1,13 ↓ | 0,76 → 0,77 |
| Patada Giro / Patada Salto Alta | spin | 0,98 → 0,98 | 1,39 → 1,08 ↓ | 0,74 → 0,74 |
| Bomba Fango / Arenas Ardientes | puddle | 0,76 → 0,76 | 0,83 → 0,83 | 0,73 → 0,73 |
| Rayo Señal / Megacuerno | bounce | 0,75 → 0,75 | 0,86 → 0,86 | 0,71 → 0,71 |
| Terratemblor / Terremoto | aura | 1,11 → 1,11 | 1,15 → 1,15 | 0,69 → 0,69 |
| Infortunio / Poltergeist | chain | 1,06 → 1,06 | 0,75 → 0,75 | 0,68 → 0,68 |
| Tajo Cruzado / Espada Santa | cross | 1,06 → 1,06 | 0,89 → 0,89 | 0,67 → 0,67 |
| Disparo Demora / Red Viscosa | mine | 1,36 → 1,08 ↓ | 0,74 → 0,74 | 0,67 → 0,67 |
| Púas Tóxicas / Lanza Mugre | mine | 1,06 → 1,06 | 1,19 → 1,14 ↓ | 0,65 → 0,66 |
| Tóxico / Gas Venenoso | trail | 1,09 → 1,09 | 0,72 → 0,72 | 0,64 → 0,64 |
| Ida y Vuelta / Sanguijuela | dash | 1,15 → 1,15 | 0,84 → 0,84 | 0,61 → 0,75 ↑ |

- n1: mediana 1,00 → 1,00 · 10-90 % 0,72–1,30 → 0,72–1,19 · más de 1.15: 34 → 23 · menos de 0.65: 2 → 2
- max: mediana 1,05 → 1,03 · 10-90 % 0,79–1,41 → 0,79–1,12 · más de 1.15: 51 → 1 · menos de 0.65: 1 → 0
- evo: mediana 1,00 → 1,00 · 10-90 % 0,76–1,29 → 0,76–1,12 · más de 1.15: 41 → 1 · menos de 0.65: 2 → 1
