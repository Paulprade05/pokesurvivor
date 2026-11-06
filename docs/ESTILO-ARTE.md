# Estilo del arte del mundo

El mundo se ve como Mundo Misterioso: Exploradores del Cielo, y todo lo que se dibuje tiene que encajar ahí. Última revisión: 06-11-2026.

## Cómo se ve un mundo de Mundo Misterioso
Sacado de montar escenas con los tilesets originales, pieza a pieza, tal como los pinta el juego.
- **Suelo:** un solo material en todo el mapa, con textura fina. No hay manchas de otro material que empiecen de golpe.
- **Muros:** no son bloques. Son una masa orgánica: un borde irregular de árboles, cristales o rocas y dentro un color liso.
- **Transición:** junto a muros y agua hay una franja de plantitas, cristales o guijarros. Por eso nada cambia de golpe.
- **Agua y lava:** con orilla oscura y borde irregular, y animadas.
- **Paleta:** suelo, muro, franja y agua salen de la misma hoja. Todo casa porque todo es lo mismo.
- **Personajes:** con contorno casi negro y colores planos, sobre un terreno más suave y sin contorno negro.

## Reglas
1. **El terreno sale de las piezas de autotile del tileset** (`tileset.js`, 47 piezas por sección). No se dibujan suelos ni muros aparte.
2. **Cada mapa usa un tileset que case con su nombre** (`tools/fetch_tiles.py`) y de ahí sale su paleta (`G.Tileset.pal`). Rocas, hierba, cristales y adornos usan esa paleta, nunca colores propios del bioma.
3. **Un píxel de arte son 2 unidades de mundo y un número entero de píxeles de pantalla** (`camera.js`). Todo se dibuja en posiciones pares, sobre la misma rejilla (`sprites.js`, `world.js`, `vfx.js`). Por eso la vista va a saltos: en una pantalla de 1920×868, de 4 a 3 píxeles de pantalla.
4. **Lo que está de pie y no es del tileset** lleva contorno con el tono oscuro del tileset, trazo de 2 px como mínimo y tres tonos planos más un brillo. El negro casi puro es sólo de los Pokémon.
5. **Las sombras van a píxeles.** Nada de elipses lisas ni tramas por encima del suelo.
6. **Sin tapar el arte:** ni manchas de nubes ni viñetas fuertes.
7. **Pocos adornos:** la franja del tileset ya da vida. Lo demás, escaso y con causa.
8. **Las plantas nacen del suelo, no se posan encima.** La hierba lleva debajo una mancha horneada en el suelo que deja ver su textura y tiene el borde irregular, nunca el de la casilla (`tileset.js seatSheet`). Sus matas no llevan contorno, tienen la base del tono de esa mancha y son sueltas en la orilla (`tiles.js grass24`).
9. **Lo que apoya en el suelo lleva sombra de contacto** (`tileset.js grounded`) y un contorno que no sea más oscuro que el del mapa.
10. **En Ultra, muro y suelo son del mismo material:** la cara mezcla roca y suelo y se oscurece a escalones hacia el pie; sombras y contornos usan el tono oscuro del mapa, nunca negro; lo lejano se pierde en una bruma a franjas (`tileset.js haze`, `game.js`).

## Referencias
Capturas de Exploradores del Cielo en Mystery Dungeon Franchise Wiki. Se toma la técnica, no los mapas ni los dibujos.
- **Bosque de Manzanos (Apple Woods):** hojitas pálidas por todo el suelo y plantas planas, sin contorno.
- **Llanura Amperio (Amp Plains):** guijarros junto al muro y cara de roca con la paleta de la cima.
- **Cueva Cristal (Crystal Cave):** cristales pequeños como transición y fondo oscuro.
- **Cueva de Vapor (Steam Cave):** musgo sobre tierra oscura, hundido en el suelo, y luz con un tono propio del lugar.

## Cómo se comprueba
- `auditar.cjs` hace 4 capturas de cada mapa: junto a muro, junto a agua, muro y agua, y campo abierto.
- `medir_px.py` mide los tramos de color: tienen que ser múltiplos del tamaño del píxel. Antes, el 56 % no lo era; ahora, en torno al 6 %, que son rotaciones, efectos y texto.
- Están en `../pokesurvivor-tmp/animado/`.

## Dónde está
- Dibujos propios: `tools/pxl/*.px.js`, en `assets/pxl/`. Construir: `PXL=<carpeta de claude-pxl> node tools/pxl/build.cjs`.
- Tilesets: `assets/tiles-pmd/`, con `tools/fetch_tiles.py`.
- Hierba: `tiles.js grass24` y `tileset.js seatSheet`. Objetos del suelo: `icons.js chunky`.

## Lo que no cumple y por qué
- **Ultra:** la perspectiva cambia la escala con la altura, así que los píxeles no pueden ser iguales.
- **Pokémon a otra escala:** jefes y formas grandes se escalan y sus píxeles son mayores o menores que los del mapa.
- **Efectos que giran:** no pueden caer sobre la rejilla.
