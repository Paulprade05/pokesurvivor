# Animaciones de llegada de los legendarios de grieta

Bloque H de la 1.0 (24-11-2026). Pedido del dueño: «cuando aparecen los legendarios de las grietas, que cada uno
tenga una animación personal; cuando haya dos se verá primero una animación y luego otra».

## Cómo funciona

1. **Absorción** (`rift.js`, `drawSuck`): al entrar, la grieta te traga (0,75 s; 0,25 s con calma) antes del túnel.
2. **Túnel** (lo de antes, `BossFX.tunnel`).
3. **Presentación, uno detrás de otro** (`rift.js`, `startIntro` / `timeline` / `camTick` / `drawPresent`):
   - la cámara va de ti al primero, sale su animación, aparece su tarjeta (nombre, título, tipos, «¡Nuevo!» si es la
     primera vez) y pasa al siguiente; al final vuelve a ti y empieza la pelea;
   - **saltar**: Espacio, Intro, Esc, el mando o tocar la pantalla. Sólo el anfitrión (o quien juega solo); en grupo
     manda `'lk'` y todos saltan a la vez;
   - **más corta la segunda vez**: `G.DB.save.lseen[dex]` guarda los ya vistos; entonces dura `short` en vez de `dur`;
   - en grupo, el anfitrión manda en `'lgi'` `[dex, x, y, corta?1:0]` para que todos vean lo mismo.
4. **Lo que se ve de cada uno** (`js/entities/legend-fx.js`, `G.LegendFX`): `def(dex)` da su animación propia, o la
   genérica (columna de luz de su tipo + su estilo y su toque de `APPEAR` en `rift.js`, que ya es distinta para cada
   uno).

Hoy tienen animación propia: **Mewtwo (150)**, **Groudon (383)** y **Rayquaza (384)**. Sirven de ejemplo.

## Cómo añadir la animación de un legendario

En `js/entities/legend-fx.js`, debajo de los ejemplos:

```js
/* ---------- Kyogre (382): una ola gigante rompe y él sale del agua ---------- */
add(382, {
  title: 'Señor de los mares',   // tarjeta, debajo del nombre (español)
  dur: 2.2,                       // segundos la primera vez (1,6-2,6)
  short: 0.9,                     // segundos las siguientes (0,7-1,1; menos que dur)
  cue: 0.8,                       // punto (0..1) en que «llega»: temblor, sonido y destello, una vez
  sprite(l, k) {                  // cómo se ve su sprite en el momento k (0..1)
    return { a: k > 0.5 ? 1 : 0, rise: 0, lift: 0, ox: 0, flash: false };
  },
  back(ctx, l, k, now) { /* debajo del sprite: suelo, charcos, sombras (coordenadas del mundo) */ },
  front(ctx, l, k, now) { /* encima: partículas, luces */ },
  tick(l, k, dt) { /* opcional: G.FX.px / burst, shake(l, 0.3) */ },
  onCue(l) { /* opcional: el golpe de llegada; si no, anillo + chispas + temblor */ }
});
```

Y el título en inglés en `js/data/lang-en.js` (bloque «1.0 · bloque H»): `'Señor de los mares': 'Lord of the seas',`.

Lo que no pongas sale de la genérica. `l` trae: `dex`, `x`, `y` (los pies), `col` y `col2` (sus colores de tipo),
`seed`, `sc` (escala del sprite), `st` y `acc` (su estilo y su toque), `short` (true si ya lo habías visto), `an`
(su Animator) y `lift` (media altura del cuerpo, para poner cosas a su altura).

### Reglas

- **Sólo dibujo**: nada de esto cambia el juego. El legendario de verdad nace al acabar la presentación.
- **Igual en todos los ordenadores**: nada aleatorio que no salga de `l.seed` (usa `H(l.seed, i, n)`).
- **Calma** («Menos sacudidas y destellos» o «reducir movimiento» del sistema): usa `shake(l, a)` (no tiembla con
  calma) y nada de destellos de pantalla entera.
- **Rendimiento**: formas lisas (`arc`, `ellipse`, `fillRect`, `drawImage`) y `glow(...)`/`G.FX` para luces y
  partículas. Pocas líneas sueltas y nada de degradados por fotograma (van por el respaldo lento de `gl2d`).
  Mide con `node tools/perf.cjs --escenas grieta,arena --gl` antes y después: no puede bajar de 60 fps en PC.
- **Arte nuevo** (si hace falta un dibujo): con pxl y `docs/ESTILO-ARTE.md`, nunca PixelLab.

### Probar

- `node --test tests/jefes.test.cjs`: la prueba «legend-fx (block H)» recorre todas las propias de principio a fin
  (duraciones válidas, sprite con `a` entre 0 y 1, sin errores) sin tocar nada más.
- En el juego (`dev.html?dev`): en una partida, `G.Rift.debugArena('water', 2, 382)` abre una grieta de agua con
  ese legendario el primero. `G.DB.save.lseen = {}` para volver a verlo como nuevo.
