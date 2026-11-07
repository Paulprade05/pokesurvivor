# Auditoría de ataques y evoluciones (07-11-2026)

Pedido: comprobar que **cada mejora de nivel y cada evolución de los 140 ataques hace lo que dice su carta** (español e
inglés), medido en el motor de verdad, y arreglar lo que no.

## Cómo se ha comprobado

- **Sandbox** (`tools/sandbox.cjs`, sólo para desarrollo, el juego no lo carga): el combate de verdad (`moves.js`,
  `levelup.js`, `projectile.js`, `combat.js`) sin ventana, con un Pokémon estándar inmortal (vida infinita, 1 de ataque,
  sin habilidad, crítico ni pasivas). Se le da cualquier ataque a cualquier nivel, evolucionado o no, y enemigos a voluntad.
  Los estados que mueven enemigos (lanzado, en el aire, confuso, encantado...) los aplica la misma envoltura de
  `Enemy.update` que en el juego. Tres escenarios:
  - **solo:** un enemigo delante (a 60 px; con `dist` a la distancia que se quiera, y quieto con `still`).
  - **masa:** ~390 enemigos inmortales en rejilla hasta 380 px, con vidas variadas; los atraídos andan hacia quien los atrae.
  - **horda:** enemigos que llegan sin parar, te rodean, te tocan de verdad (por `Combat.resolve`, cada 0,55 s) y caen.
  ```
  node tools/sandbox.cjs --ataque ember --nivel 3 [--evo] [--escenario masa] [--seg 8] [--una]
  ```
- **Auditoría** (`tools/auditoria-ataques.cjs`): cada ataque a cada nivel y evolucionado, en los tres escenarios, con dos
  pruebas por escenario (8 s seguidos y un solo lanzamiento). Para cada carta:
  1. lee lo que promete (`+45% daño`, `-25% recarga`, `+1 proyectil`, `+30% radio`, `un 35% más rápido`...);
  2. comprueba que esos son los números que cambia (y que el inglés promete los mismos);
  3. comprueba en el motor que cada número se nota: más proyectiles salen, más radio toca a más en la masa (o llega más
     lejos a un enemigo solo), más daño sube cada golpe y cuánto, menos recarga se lanza antes y cuánto, más empuje los
     aleja más, más duración dura más, más aturdimiento aturde más, más escudos paran más golpes...;
  4. avisa si el daño baja sin decirlo.

  En las evoluciones, lo mismo con su primera frase (`×1,6 daño, +2 proyectiles...`), que pegue más que al nivel máximo, y
  que se vea lo que promete con palabras (cura, aturde, frena, quema, envenena, atrae, empuja, crítico, duerme, confunde).
  ```
  node tools/auditoria-ataques.cjs [--solo ember,hex] [--md f.md] [--json f.json] [--tabla]
  ```
  La tabla completa (700 filas, ataque × paso × escenario) está en `docs/AUDITORIA-ATAQUES-tabla.md` y la que fijan los
  tests en `tests/auditoria-ataques.tabla.json`.

## Lo que se ha encontrado y arreglado

| Ataque | Nivel | Prometía | Hacía | Cambio |
|---|---|---|---|---|
| 68 ataques con `DMG_K` (Ascuas, Pistola Agua, Confusión, Tornado, Bola Sombra, Puño Meteoro...) | todos | `+45% daño`, `-25% recarga`, `+1 proyectil`... | el ajuste de equilibrio entre el nivel 1 y el máximo se repartía a escondidas por todas las cartas: «+45% daño» daba +34 % y las cartas sin daño lo bajaban un 3-9 % sin decirlo (83 cartas) | el ajuste va entero en las cartas de daño de ese ataque, con su número de verdad (Ascuas «+6% daño», Onda Ígnea «+109% daño»...). Nivel 1 igual y máximo igual (±0,8 %). `moves.js` `honestUps`; inglés con patrones en `lang-en.js` |
| Sustituto | 4→5 | +50% duración y +40% daño | **menos daño que al 4** (1.941 → 1.111 de daño/s en la masa): el muñeco que se quita para dejar sitio al nuevo se iba sin estallar y, con más duración, ninguno llegaba a su final | el que se quita también estalla (`combat.js`, `doll`) |
| Púas | 3→4 | +30% radio de explosión | nada: no explota, son abrojos de 8 px fijos | el radio es el tamaño del abrojo (60 = 8 px; Amplitud también) y la carta dice «Abrojos un 30% más grandes» |
| Golpe Aéreo | 4→5 | +60% daño y más ancho | el ancho no se usaba: tajo en X de 40 px fijo | el tajo mide su ancho (Amplitud también) |
| Onda Vacío | 4→5 | +50% empuje y +40% daño | el empuje era fijo (60) | sale de su número (330 = 60) |
| Fuego Fatuo | 4→5 | +50% duración y +40% daño | la duración nunca contaba: se relanza (3,5 s) antes de acabar (6 s) | la carta queda en su daño (sin cambiar lo que hace) |
| Bucle Arena | 4→5 | Atrae más fuerte y +40% daño | no atrae: los de dentro no salen | la carta queda en su daño (sin cambiar lo que hace) |
| Magnitud → Taladradora | evo | «hace más críticos» | ningún crítico de más | +15 % de crítico |

Revisado y bien (no era un fallo, era el escenario):
- **Ataque Rápido, Hoja Afilada, Hierba Lazo, Rayo Burbuja** (más alcance): rodeado no se nota porque eligen a los más
  cercanos; con un enemigo solo, llegan más lejos (prueba de alcance de la auditoría).
- **Giro Fuego** («+1 llama»): cada llama suma un tercio del daño de la jaula; se nota en el daño por golpe.
- **Enfado** (recarga): baja lo prometido; en la masa su propio empujón aleja a todos y espera a tener a alguien a tiro.
- **Escudo Real, Barrera Espinosa, Búnker** (recarga de los escudos): baja lo prometido; Escudo Real añade 3 s fijos de
  Forma Filo tras cada escudo gastado.
- **Canto Mortal, Brecha Negra** (umbral, vida quitada, recarga): se ven con ventanas largas y enemigos ya tocados.
- **Giro Bola → Cuerpo Pesado** («los que te tocan rebotan aturdidos»): sólo quieto y cuando un enemigo te toca; el giro
  los aparta antes en el sandbox. Leído en `combat.js` (`touch3`); sin medida.
- Avisos (hace **más** de lo prometido, se deja): Giro Fuego 4→5 y Rueda Aura 4→5 (la llama o el proyectil de más suben el
  daño por golpe), Puño Dinámico 4→5, Ataque Rápido y Semilladora evolucionados (recarga algo más corta).

## Lo que no se ha mirado

- Las **pasivas** (Amplitud, Persistencia, Réplica, Propulsión) sobre cada ataque. Visto de paso: Persistencia no hace
  nada a Fuego Fatuo (su duración nunca cuenta) ni a Sustituto más allá de que el muñeco viva más.
- Las evoluciones de **Pokémon**: no prometen números de combate, sólo cuándo evolucionan (lo fijan `tests/evo-mitad.test.cjs`
  y `tests/families.test.cjs`).
- Ataques Z, habilidades y cooperativo (el sandbox va en solitario).

## Equilibrio

Medido con `/medir-equilibrio` (`tools/balance.cjs --pasivos --todas`, antes en `origin/main` y después): ver
`docs/2.0-ESTADO.md`, sección «Auditoría de ataques».
