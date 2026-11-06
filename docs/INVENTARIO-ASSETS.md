# Inventario de assets (arte animado, 05-11-2026)

Revisión de todo lo que se ve en partida y en el menú, mirando cada cosa en su sitio con el juego abierto (bosque, cueva,
volcán, una grieta, Ultra y móvil). «Antes» es cómo estaba en `origin/main` al empezar. Calidad: buena, regular o pobre.
Criterios sacados de `crsolver/claude-pxl` (ver nota al final): 2-4 tonos por material, luz de arriba a la izquierda, nada de
puntos de relleno sin causa, repetir con variantes y mover sólo lo que se movería de verdad.

| Asset | Dónde está | Formato | Antes: se veía | Se animaba | Calidad antes | Qué se ha hecho |
|---|---|---|---|---|---|---|
| Suelo, paredes, agua de 22 biomas | `assets/tiles-pmd/` | PNG de PMD (47 piezas) | Limpio, con dibujo repetido; tramado propio del juego original | Sólo el líquido (ciclo de color) | Buena | Sin tocar. Encima, sombras de nubes y ondas (`ambient.js`) |
| Cara de roca de las paredes | `assets/objects-px/cliff.png` | PNG PixelLab, recoloreado | Bien | No | Buena | Sin tocar |
| Hierba alta | `js/world/tiles.js` (`grass`) | Por código | Filas iguales con contorno: parecían setos de pinos. Lo que más se ve del mundo | 1 fotograma de viento | **Pobre** | Rediseñada (`grass24`): matas de hojas sueltas en 3 capas, 3 aspectos, flor en uno. 8 fotogramas de viento y uno pisada |
| Árboles | Pieza de pared suelta (`tileset.js`) | PNG PMD | Cuadrado pegado al suelo; en cueva y volcán se veía el borde | No | Regular | **Mismo dibujo** (lo prefirió el dueño el 01-11): recortado del suelo, con sombra, 8 fotogramas de viento; cristales y rocas con brillo que recorre o late |
| Rocas | `tiles.js` (`rock`) y 3D en Ultra | Por código | Claras, con grietas al romperse | No (no se mueven) | Buena | Sin tocar |
| Cofre y cofre grande | `assets/objects-px/`, 3D en Ultra | PNG + 3D | Bien | Sólo el aro de abrir | Buena | Centelleos de vez en cuando (también en Ultra 3D) |
| Trampas | `assets/objects-px/trap0-2.png` | PNG PixelLab | Bien | No (se perdió al pasar a PNG) | Regular | Burbujas, motas o esporas que suben |
| Torres de poder | `tiles.js` (`altar`) | Por código | Bien, con un círculo liso encima que no casaba | Halo que late | Regular | Halo a píxeles que late y chispas de su color |
| Manantial | `tiles.js` (`spring`) | Por código | Bien | Centelleo | Regular | Y ondas en el agua |
| Grieta (portal) | `tiles.js` (`rift`) | Por código | Bien | 4 fotogramas | Buena | Sin tocar |
| Ambiente | (no existía) | — | Mundo sin nada vivo aparte de los Pokémon | — | **Pobre** | Nuevo `ambient.js`: mariposas, pájaros con sombra, hojas, polen, murciélagos, luciérnagas, ascuas, ceniza, nieve, pétalos, según bioma y tipo de grieta |
| Clima | `js/systems/weather.js` | Por código | Partículas y tinte | Sí | Regular | Con lluvia, gotas en el suelo; con lluvia, arena y nieve, el viento sopla más |
| Proyectiles (68 formas) | `js/entities/vfx.js` | Por código, con paleta de tipo | Bien, algunas parecidas | 1-3 fotogramas | Buena | Sin cambiar. Halo tramado debajo que late |
| Proyectiles de PixelLab (14) | `assets/vfx/` | PNG, 1 fotograma | Bien | Giran o apuntan | Buena | Sin tocar |
| Golpes | `vfx.js` (`impact`) + chispas | Por código | 2 fotogramas, igual para todos los tipos | Poco | **Pobre** | `hit` de 5 fotogramas y adornos por tipo: humo y ascuas, salpicadura, hojas, chispas, esquirlas, piedras con polvo, burbujas, estrellas, llamitas |
| Explosiones | Aros de puntos (`fx.js`) | Por código | Sólo un aro de puntos | Sí | Regular | `blast` de 6 fotogramas en el centro de los estallidos grandes de color |
| Debilitarse | Ráfaga y aro | Por código | Puntos | Sí | Regular | Humo que se deshace |
| Estelas | `fx.js` (`trail`) | Partículas | Puntos | Sí | Regular | Y de vez en cuando humo, burbuja, chispa o llamita |
| Rayos y tajos | `fx.js` | Bloques | Bien | Sí | Buena | Golpe nuevo al final del rayo; el tajo, igual |
| Orbes y objetos del suelo | `pickup.js` + `assets/items/` | PNG de PokeAPI | Sprites bien; brillo con círculos lisos, uno por objeto | Saltito | Regular | Brillo y sombra ya hechos y a píxeles (más baratos que antes), moneda que gira, destello al coger |
| Pokémon (966) | `assets/pokemon/` | Hojas PMDCollab | Muy buenos | Sí | Buena | Sin tocar |
| Interfaz (menú, cartas, HUD) | `css/style.css`, `js/ui/` | HTML y lienzo | Cuidada, ya con entradas animadas | Sí | Buena | Brillo en Jugar, logo que flota, iconos de las cartas que respiran |
| Iconos de objetos (110) | `assets/items/` | PNG | Buenos | No | Buena | Sin tocar |

## Lo que queda sin tocar a propósito
- **Pokémon, objetos, iconos y suelos**: son buenos y de otros autores (créditos en `CREDITS.md`).
- **Daños y comportamiento**: nada. Los adornos se cuelgan de `Enemy.showHurt`, `die`, `FX.burst`, `FX.ring` y `FX.trail`.
- **Pintor de respaldo** (`tiles.js` con «Casillas de Mundo Misterioso» apagado): mantiene su hierba y sus árboles quietos, con
  su mecido de antes.

## `crsolver/claude-pxl`
Licencia MIT. Es una guía (`SKILL.md`) y una herramienta de Node sin dependencias que convierte archivos `.px.js` en PNG. No
envía datos fuera (sólo un visor local opcional). **No se ha ejecutado, instalado ni copiado al juego**: sólo se han aplicado sus
consejos. Si se quisiera usar de verdad, habría que instalarla como skill de Claude, y eso lo decide el dueño.

## Segunda tanda, con `pxl` (06-11-2026)
El dueño pidió usar el skill y dejar PixelLab. Fuentes en `tools/pxl/*.px.js`, PNG en `assets/pxl/`. Construir: `PXL=<carpeta de claude-pxl> node tools/pxl/build.cjs`. La herramienta no entra en el juego ni en el repositorio.

| Asset | Antes | Ahora |
|---|---|---|
| Muros | **Pobre**: bloque plano del color del suelo | Cima en relieve (8 variantes), pared en facetas, borde que cuelga, esquinas redondeadas; lianas, cristales o magma según el suelo. También en Ultra 3D |
| Portal de la grieta | Regular | 8 fotogramas, estrellas, rocas flotando, suelo roto |
| Suelo | Regular: sólo el dibujo repetido del tileset | Cosas horneadas en el mapa (`decor.png`) y flora animada (`flora.png`) |
| Árbol de cueva y volcán | **Pobre**: bola y concha | Cristales y agujas de basalto. El árbol del bosque no cambia (decisión del dueño) |
| Rocas | Regular: sombreado liso | Facetas como la pared; con musgo en los bosques. En Ultra 3D siguen siendo su modelo |
| Trampas de veneno y telaraña | Regular | Redibujadas. Las setas explosivas se quedan |
| Cofres, torres, manantiales | Buena | Sin cambiar: ya casan con el estilo |
