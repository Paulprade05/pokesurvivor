# Estilo del arte del mundo

Reglas sacadas de medir los sprites de los Pokémon (06-11-2026). Todo lo que se dibuje para el mundo las sigue, para que nada parezca de otro juego.

## Lo que se midió
Mediana de 16 Pokémon comparada con lo que había entonces. El tamaño del píxel ya era igual en todo (2 unidades de mundo). Lo que no casaba era el estilo.

| | Borde con contorno oscuro | Trazo | Suelto (píxeles de 1) |
|---|---|---|---|
| Pokémon | **100 %** | manchas planas, 7 colores principales | 28 % |
| Rocas y cofres de entonces | 99-100 % | | 2-12 % |
| Hierba de 1 px | **0 %** | 1 px | |
| Flores y helechos | **0-5 %** | 1 px | 46-60 % |
| Suelo de PMD | | ruido fino de manchas de 3-4 px, 10 colores | 12-17 % |
| Objetos del suelo | **0 %** | a **medio píxel** (el único caso de escala distinta), 49 colores | 28 % |

## Reglas
1. **Un píxel de arte son 2 unidades de mundo**, como los Pokémon. Sin medios píxeles ni estirar dibujos.
2. **Lo que está de pie lleva contorno oscuro** de 1 px en todo el borde: hierba, árboles, flores, rocas, objetos.
3. **Trazo de 2 px como mínimo**. Un píxel suelto sólo para un brillo.
4. **Tres tonos planos más un brillo** por material, luz arriba a la izquierda. Sin tramas, ruido ni degradados.
5. **El suelo es lo único sin contorno**: formas grandes y tonos cercanos, para que lo de pie resalte.
6. **Ninguna marca sin causa**: matas, grietas, ondas, juntas. Nada de puntos sueltos para rellenar.
7. **Cada color sale de la paleta del bioma** (`G.Tiles.BIOMES`). Se dibuja en tonos neutros y `tileset.js` los cambia: un dibujo sirve para todos los mapas.

## Dónde está
- Fuentes: `tools/pxl/*.px.js`. Imágenes: `assets/pxl/`. Construir: `PXL=<carpeta de claude-pxl> node tools/pxl/build.cjs`.
- Hierba: `tiles.js grass24`, por código, porque se recolorea y tiene viento.
- Suelo: 16 piezas por esquinas × 3 variantes (`suelos.px.js`). `tileset.js cornerB` elige cada esquina con ruido de baja frecuencia: salen manchas de varias casillas que nunca se repiten.
- Objetos del suelo: `icons.js chunky` los reduce a la mitad y les pone contorno.
