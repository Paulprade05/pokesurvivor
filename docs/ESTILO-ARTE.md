# Estilo del arte del mundo

El mundo se ve como Mundo Misterioso: Exploradores del Cielo, y todo lo que se dibuje tiene que encajar ahí. Última revisión: 13-11-2026 (interfaz «Raíces vivas»).

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
5. **Las sombras de los sprites van a píxeles.** Nada de elipses lisas ni tramas por encima del suelo. (La niebla, las manchas de luz del suelo y las sombras de los modelos 3D sí son suaves: ver «El mundo pulido».)
6. **Sin tapar lo que importa:** la niebla y las sombras que se mueven van pegadas al suelo, debajo de avisos, recompensas, Pokémon y disparos (`atmos.js`, `game.js drawScene`). Por encima de la escena sólo va la viñeta, que no toca el centro.
7. **Pocos adornos:** la franja del tileset ya da vida. Lo demás, escaso y con causa: lo que crece, junto a la hierba (`tileset.js decor`). Colores apagados hacia el suelo (`grounded`) y contorno del tono del suelo oscurecido (`inkOf`), no de la pared.
8. **Las plantas nacen del suelo, no se posan encima.** La hierba lleva debajo una mancha horneada en el suelo que deja ver su textura y tiene el borde irregular, nunca el de la casilla (`tileset.js seatSheet`). Sus matas no llevan contorno, tienen la base del tono de esa mancha y son sueltas en la orilla (`tiles.js grass24`).
9. **Lo que apoya en el suelo lleva sombra de contacto** (`tileset.js grounded`) y un contorno que no sea más oscuro que el del mapa.
10. **Cada mapa tiene un tono** (`atmos.js MOODS`): se multiplica sobre chunks, árboles, rocas y líquido, y de ahí salen niebla, sombra y viñeta. Un color que no pase por ahí se despega.
11. **El líquido lleva el color de su mapa** (`BIOMES[bi].liq`), no el del tileset, si no se parecen (`tileset.js toneLiq`).
12. **En Ultra, muro y suelo son del mismo material:** la cara mezcla roca y suelo y se oscurece a escalones hacia el pie; sombras y contornos usan el tono oscuro del mapa, nunca negro; lo lejano se pierde en una bruma a franjas (`tileset.js haze`, `game.js`).

## Cómo se da profundidad
Sin dibujar nada encima con otro estilo (`js/world/atmos.js`):
- **Horneado en el chunk:** tono del mapa, manchas grandes de luz y sombra, interior de los muros en penumbra.
- **Por fotograma, sobre el suelo:** dos bancos de niebla y uno de sombra, suaves (desde el 12-11-2026: antes a escalones), más anchos que altos. Sale de un solo mapa de ruido que se repite sin costuras. En PC se amplía suavizado al dibujar; en móvil se suaviza una vez al pintarlo (×3) y se dibuja al píxel más cercano, que cuesta lo mismo que antes.
- **Según avanza la partida:** cae la noche sólo sobre el suelo. Los Pokémon no se oscurecen y resaltan más.

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
- Iconos de ataques (133 de 140): `tools/pxl/ataques/*.px.js`, en `js/data/move-art.js`. Construir: `PXL=<carpeta de claude-pxl> node tools/pxl/ataques.cjs`. Se dibujan a 28×28 con los colores de su tipo (`base.px.js`) y el contorno los lleva a 30×30. Tienen que leerse a 30 px, el tamaño del Compendio, y enseñar lo que hace el ataque, no la forma de su familia.
- Tilesets: `assets/tiles-pmd/`, con `tools/fetch_tiles.py`.
- Hierba: `tiles.js grass24` y `tileset.js seatSheet`. Objetos del suelo: `icons.js chunky`.

## La aldea del menú (3D)
Desde el 12-11-2026 (pedido del dueño: «que no esté todo tan pixelado, los modelados 3D principalmente»):
- **Los modelos son 3D liso**: texturas suaves con mipmaps, formas redondas, antialias y halos de luz. No llevan píxeles.
- **El pixel art sigue siendo pixel art**: el suelo del tileset, los Pokémon, los letreros, las pantallas y la hierba se ven nítidos a cualquier escala (`village3d.js crispTex`): ni borrosos ni con píxeles de distinto ancho.
- **Contorno**: los modelos llevan el casco oscuro del tono del mapa (`edge` del tileset), nunca negro puro.
- **El borde es un bosque** (12-11-2026): pinos, árboles de copa redonda con vainas que brillan, setas gigantes y matas, con instancing (`village3d.js forestPlan` / `buildForest`). Nace en las casillas de bosque, que son las que chocan; abajo del todo, sólo plantas bajas.
- **Efectos**: niebla, halos, esporas y portal, suaves (no a escalones).

## El mundo pulido (12-11-2026)
Pedido del dueño: «que los muros, rocas y cofres tengan el mismo estilo de pulición que la aldea» y «mejoras gráficas en todo el juego».
- **Rocas y cofres, 3D liso** (`ultra3d.js`): rocas redondeadas (esfera deformada con ruido suave) con la textura suave del tono de roca del mapa, musgo de su verde y grietas suaves al romperse; cofres de tablas con las esquinas redondeadas, tapa abombada, flejes y cerradura de oro con brillo. Contorno del tono oscuro del mapa, como la aldea. En PC con calidad alta, también con la vista normal; en móvil, sólo con Ultra.
- **Paredes:** con la vista normal siguen siendo el tileset plano de Mundo Misterioso (regla 1). En Ultra son 3D: su pixel art arriba y en la cara, muestreado nítido (`crispTex`), con la cara más oscura hacia el pie y sombras de borde suave.
- **Luz:** lo que brilla deja un halo suave que se suma (`fx.js glowAt` / `light`): golpes, explosiones, tus disparos, el aura de los jefes y la luz de las grietas. Va alrededor y debajo, nunca tapa el sprite de un Pokémon.
- **Bloom** (sólo calidad Máxima): lo claro de la escena se difumina y se suma, antes del HUD.
- **Los Pokémon siguen en pixel art nítido**, a escala entera y sin suavizar; los números y el HUD, encima de todo y sin brillo.
- **Filtro opcional «Pokémon más nítidos»** (Ajustes › Gráficos, `pixSmooth`; de serie encendido sólo con la calidad Máxima): con él encendido, los sprites se amplían con **Scale3x / AdvMAME3x** (`core/pixfilter.js`; en móvil, Scale2x / EPX y sólo tu Pokémon, compañeros, jefes y menús) y se dibujan suavizados a su tamaño: diagonales y curvas redondas, sin desenfocar ni colores nuevos. En la aldea, Scale2x en el shader (`village3d.js EPX_GLSL`). Se compararon Scale2x, Scale3x y Scale4x: Scale4x ya cambia ojos y caras. Apagado, todo es como siempre (las reglas de arriba).

## La partida en 3D (13-11-2026)
Pedido del dueño: «haz que las rocas, las setas, los cofres, grietas y más elementos de la partida también sean en 3D nítido».
- **Qué va en 3D** (PC con calidad Alta o más; `world/props3d.js` + `ultra3d.js`): rocas y cofres (de antes), árboles (según el bioma: de hojas, cristales en las cuevas, agujas de basalto con lava al pie en el volcán, árboles secos en las arenas de fuego, veneno, tierra, roca, fantasma y siniestro), torres de poder con su orbe, manantiales, setas explosivas, la flora suelta que brilla (setas y cristales) y el portal de la grieta (remolino violeta con esquirlas).
- **Qué sigue en pixel art:** el suelo, las paredes (con la vista normal), la hierba alta y los helechos (el dueño: «no me gusta la hierba como se ve»; es del suelo), el charco de veneno y la telaraña (planos), los Pokémon, los ataques y el HUD.
- **Estilo:** el de la aldea: formas lisas, texturas suaves del bioma (corteza, hojas y piedra en un atlas por bioma, `G.Village3D.paint`), luz de cielo y suelo, sombras y contorno del tono oscuro del mapa. Lo redondo va aplastado de fondo (×0,62) para que, con la cámara del juego, no se vea alargado. Lo que brilla (cristales, orbes, agua, setas) lleva brillo propio y un halo suave en el suelo.
- **Viento:** los árboles se mecen en el shader (sin coste). Si tu Pokémon queda detrás de un árbol, ese árbol se transparenta.
- **Móvil:** sigue en 2D: medido en WebKit con perfil iPhone, el 3D costaba 27-31 ms por fotograma frente a 2 ms (ver `docs/2.0-ESTADO.md`).

## La interfaz (13-11-2026, «Raíces vivas»)
Pedido del dueño: que la interfaz no parezca una web moderna hecha con IA, sino un juego de verdad con un toque propio. Eligió, con Hades de referencia, la maqueta **«Raíces vivas»**. Guía completa: `docs/DISENO.md`.
- **La interfaz no es pixel art**: es un juego ilustrado en vector, hecho del mismo bosque bioluminiscente que la aldea. Las reglas de arriba (rejilla, píxel de arte, contorno de 2 px) son del mundo, no de los menús ni del HUD.
- **Materiales**: musgo oscuro (fondo, con `musgo.png`), corteza (marcos y bordes: trazo casi negro, corteza y su luz) y, en las esquinas de las ventanas, raíces, hojas y setas rosas y turquesas que brillan.
- **Colores**: luz de hoja para lo principal y el foco; ámbar para monedas; oro para evoluciones; los de cada tipo, como siempre. Nada de azul noche ni de cristal.
- **Letras**: Grenze (títulos, botones, cifras) y Alegreya Sans (texto), también en el lienzo.
- **Arte nuevo de interfaz**: en `tools/ui-art.cjs` (→ `assets/ui/`), con las mismas piezas (corteza, hoja, seta), nunca un SVG suelto ni PixelLab. Lo que sí es pixel art (iconos de objetos y ataques, Pokémon) sigue con pxl y va dentro de un medallón redondo de corteza.

## Lo que no cumple y por qué
- **Aldea del menú:** el 3D va liso a propósito (arriba); la regla 3 vale para su pixel art, no para los modelos.
- **Efectos que giran en la partida:** se dibujan desde una copia ampliada ×4 con suavizado (`vfx.js bigOf`): los píxeles se ven iguales y sin dientes, aunque no caigan en la rejilla.
- **Ultra:** la perspectiva cambia la escala con la altura, así que los píxeles no pueden ser iguales.
- **Pokémon con el filtro «más nítidos» encendido:** dejan de ser cuadrados de 1 px de arte a propósito (lo elige el jugador).
- **Rocas, cofres y paredes en 3D, niebla y luz:** suaves a propósito (arriba, «El mundo pulido»); la regla 3 vale para el pixel art, no para lo 3D ni para la luz.
- **Pokémon a otra escala:** jefes y formas grandes se escalan y sus píxeles son mayores o menores que los del mapa.
- **La interfaz (menús, HUD):** vector liso a propósito (arriba, «La interfaz»).
