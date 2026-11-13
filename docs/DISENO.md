# Sistema de diseño de PokéSurvivor («Raíces vivas», 13-11-2026)

Guía para quien rediseñe una pantalla. Todo está en `css/style.css` (secciones
0 a 16 = la base; de la 17 en adelante, cada pantalla). Síguela al pie de la
letra: así todas las pantallas parecen del mismo juego.

**La idea.** Pedido del dueño (13-11-2026): que la interfaz no se vea como una web
moderna hecha con IA, sino como un juego de verdad con un toque propio. Se
eligió entre seis maquetas la **«Raíces vivas»**: un juego ilustrado (la
sensación de Hades, sin copiarlo) hecho del bosque bioluminiscente del juego.
- **Paneles** de musgo oscuro con **marco de corteza**: un trazo casi negro, la
  corteza y su luz. Las esquinas de las ventanas llevan **raíces, hojas y setas
  que brillan** (rosa y turquesa).
- **Luz de hoja** (verde claro) para lo principal, lo elegido y el foco;
  **ámbar** para lo que vale monedas; **oro** para las evoluciones.
- **Letras con carácter**: Grenze (títulos, botones, cifras) y Alegreya Sans (texto).
- El **mundo** (mapa, Pokémon, ataques) sigue en pixel art. La interfaz **no**
  es pixel art: es vector, como un juego ilustrado. Los **iconos de cosas del
  juego** siguen siendo sprites de objetos reales en un medallón redondo.
- Sin cristal (`backdrop-filter`), sin degradados azules, sin emojis como iconos.

**Arte de la interfaz.** Sale todo de `tools/ui-art.cjs` → `assets/ui/` (no se
editan los SVG a mano): `marco.svg` (ventanas), `marco-s.svg` (tarjetas, avisos,
menús), `marco-liso.svg`, `boton*.svg` (normal, principal, ámbar, peligro),
`medalla.svg` (botones redondos), `separador.svg` (raíz bajo un título) y
`musgo.png` (textura del fondo, se repite). Pesa ~25 KB en total.

---

## 1. Tokens (variables de `:root`)

Usa siempre la variable, nunca el valor suelto. **Ojo con dos nombres viejos**:
`--c-yellow` ya no es amarillo, es la luz de hoja; `--c-blue` es el turquesa de
las setas. Se quedaron para no romper miles de reglas.

### Color

| Variable | Valor | Para qué |
|---|---|---|
| `--c-yellow` | `#b9f07a` | **Luz de hoja.** Lo principal, lo elegido, el foco. Texto encima: `--c-on-yellow` (`#10200b`). Con alfa: `rgba(var(--hl-rgb), .2)`. |
| `--leaf-bg` | degradado verde | Fondo de lo encendido (pestaña, segmento, interruptor, botón principal). |
| `--amber` / `--amber-bg` / `--amber-rgb` | `#f2c35a` | Monedas, precios, lo que se paga (`.btn.amber`, `.shop-buy`, `.upg-buy`), `.gold` (texto). |
| `--c-blue` / `--c-blue-btn` | `#5ff2d6` / `#1d6b5e` | Turquesa de seta: secundario, barras de estadísticas. |
| `--c-red` / `--c-red-btn` | `#ff5a6e` / `#c8362e` | Peligro, avisos, punto de «nuevo». |
| `--c-pink`, `--c-green`, `--c-purple`, `--c-cyan` | | Acentos (la otra seta, éxito, épico, shiny). |
| `--bark` / `--bark-hi` / `--bark-lo` / `--bark-ink` | `#4e331d` … `#1a0f07` | Corteza: bordes de tarjeta, marcos. |
| `--bark-edge` | sombra | Borde de corteza en CSS para lo que se repite (casillas, filas, pastillas): `box-shadow: var(--bark-edge)`. |
| `--bg-0` / `--bg-1` / `--bg-2` | `#040a06` / `#07110a` / `#12241a` | Fondos. |
| `--panel-bg` | textura + degradado | Fondo de un panel (`.box`, avisos, menús). Con `background-clip: padding-box`. |
| `--card-bg` | degradado musgo | Tarjeta con cuerpo (casilla, fila, carta). |
| `--card` / `--card-hi` / `--card-press` | luz de hoja al 5 / 10 / 15 % | Velo de tarjeta; al pasar por encima; al pulsar. |
| `--sunk` | `rgba(1,6,3,.55)` | Hundido: campos, pistas de barras, segmentos. |
| `--line-1` / `--line-2` / `--line-3` | corteza al 16 / 30 / 50 % | Bordes finos. |
| `--fr-l` / `--fr-s` / `--fr-flat` | marcos | `border-image` de ventana, tarjeta y liso (ver §3). |
| `--ink` | `#eef3df` | Texto principal. |
| `--muted` | `#b6c8a6` | Texto secundario. |
| `--faint` | `#93a886` | Terciario. No más claro que esto para texto. |
| `--title-ink` / `--title-ts` | | Color y sombra de los títulos (`h1`–`h4` ya los llevan). |
| `--link` / `--err` / `--ok` | | Enlaces, errores, correcto. |
| `--r1`…`--r5`, `--bond`, `--shiny` | | Rarezas (común → legendaria), vínculo, shiny. |
| Tipos | `G.U.TYPE_COLOR[tipo]` | Llega en línea (`style="background:…"`). |

### Letra

- `--font` = **Alegreya Sans** (texto de lectura, etiquetas, descripciones). 400, 500 y 700.
- `--font-display` = **Grenze** (títulos, botones, cifras, nombres de Pokémon, pestañas). Variable, 600-800.
- `body` a 17 px (16 en el móvil): Alegreya se ve más pequeña que Nunito a igual tamaño.
- Escala: `--fs-xs` 13 · `--fs-s` 14 · `--fs-m` 16 · `--fs-l` 19 · `--fs-xl` 23 · `--fs-2xl` 28 · `--fs-3xl` 36 px. **Nunca menos de 12 px.**
  En el móvil (§16) baja sola: 12 · 13 · 15 · 17 · 20 · 23 · 29 px.
- Títulos grandes con brillo: `.title-glow` (o como `#over-title`). Raíz bajo un título: `<hr class="vine-sep">`.
- En el lienzo (HUD, números de daño, avisos) se usan las mismas: `Grenze` y `"Alegreya Sans"` (`hud.js font()`).
- `Fredoka` y `Nunito` siguen declaradas como **alias** de las nuevas (para la aldea, `js/world/village.js`, y para lo que llegue de otras ramas). Código nuevo: no las pidas.
- Cifras que cambian (monedas, tiempos): `font-variant-numeric: tabular-nums`.

### Espacio, radios, sombras, movimiento

- Espacio: `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 24 · `--sp-6` 32 px.
- Radios: `--rad-xs` 6 · `--rad-s` 8 · `--rad-m` 12 (campos) · `--rad-l` 14 (tarjetas) · `--rad-xl` 18 (paneles) · `--rad-pill` (chips, pastillas). Lo redondo (botones de icono, baldosas de icono, huecos de ataque) es un círculo.
- Sombras: `--sh-1` (casi nada) · `--sh-2` (algo que flota: tarjetas, pastillas) · `--sh-3` (paneles) · `--sh-pop` (menús, avisos) · `--glow` (halo de la luz de hoja).
- **Sin cristal** desde el 13-11-2026 (`--glass: none`): los paneles son opacos (musgo con textura). Además de verse más de juego, no cuesta en cada fotograma con el mundo moviéndose detrás. `html.no-glass` y «reducir transparencia» siguen funcionando (ya no cambian nada).
- Movimiento: `--t-fast` .15 s, `--t-med` .22 s, `--ease`, `--ease-pop`. `prefers-reduced-motion` ya las apaga todas.

### Capas (`z-index`)

`--z-screen` 20 (pantallas) < `--z-chrome` 25 (barra de arriba, créditos) <
`--z-panel` 30 (panel de sonido) < `--z-modal` 35 (ventanas que tapan la barra)
< `--z-fx` 40 (tirada del gacha) < `--z-sheet` 60 (Ajustes) <
`--z-legal` 65 < `--z-editor` 66 (colocar botones, instalar) < `--z-boot` 70
(carga, invitación) < `--z-tap` 80 (pulsa para empezar, logro) < `--z-noscript`
90 < `--z-toast` 95 < `--z-block` 150 (otra pestaña) < `--z-fly` 1000.

`gamepad.js` decide qué pantalla manda por su z-index: una ventana nueva que
deba ir encima necesita un z-index mayor, no sólo ir después en el HTML.

### Zonas seguras y barra

- `--sa-t`, `--sa-r`, `--sa-b`, `--sa-l`: `env(safe-area-inset-*)` (muesca, isla, barra de inicio). Úsalas con `max()`: `padding-bottom: max(12px, var(--sa-b))`.
- `--tap` 44 px (40 en el móvil): tamaño mínimo de lo que se toca con el dedo. Úsalo en vez de escribir 44.
- `--ctl`: alto de los botones de la barra (40 con ratón, 44 táctil; 40 en el móvil).
- `--bar-h`: hueco que dejan las pantallas que enseñan la barra (se suma a `--sa-t`; 52 en el móvil). Lo calcula la base; no lo cambies.

---

## 2. Pantallas: `.scr`, velo y capas

```html
<section id="scr-x" class="scr dim under-bar hidden">  …  </section>
```

- `.scr`: capa fija a pantalla completa, contenido centrado, relleno con las zonas seguras. En el móvil, su panel la ocupa entera (§16).
- `.dim`: velo verde muy oscuro (el mundo se sigue viendo). Todas las pantallas de menú lo llevan; el menú principal no.
- `.under-bar`: la pantalla deja ver la barra de arriba (monedas, tickets): se abre con `G.UI.show(id, true)` y empieza debajo de la barra. Hoy además van por id: `#scr-goals, #scr-dex, #scr-upgrades, #scr-shop, #scr-bag, #scr-gacha, #scr-friends, #scr-rank, #scr-lobby, #scr-mod`.
- `.modal`: ventana que va por delante de la barra y la **esconde** (`z 35`). Hoy por id: `#scr-news, #scr-recover, #scr-savenote, #scr-profile, #scr-nick` (y Ajustes, Aviso legal, Instalar, Colocar botones con su propio z-index). Una ventana nueva de este tipo: `class="scr dim modal"`.
- `.hidden` (con `!important`) apaga cualquier cosa.

---

## 3. Panel: `.box`

Musgo oscuro con textura (`--panel-bg`) y **marco de corteza** (`marco.svg`, con
raíces, hojas y setas en las esquinas), radio 18, sombra honda, animación `pop`
al aparecer. Se desplaza por dentro si no cabe. En el móvil, a pantalla completa,
va sin marco (§4b).

```html
<div class="box" style="width:min(440px,100%)">
  <h2>Título</h2>
  <p class="sub">Frase de explicación.</p>
  …
</div>
```

- Cómo va el marco: `border: 7px solid transparent` (sólo la franja de la corteza) +
  `border-image: var(--fr-l)` (40 px, se monta sobre el relleno) + el fondo con
  `background-clip: padding-box` y `border-radius` (recorta el musgo a la curva).
  Los marcos son **transparentes por dentro**: el musgo lo pone el fondo, así no
  hay franja de otro tono. Cualquier panel nuevo, igual (`--fr-s` con 5 px para
  tarjetas, avisos y menús; ver `.toast`, `.tb-menu`, `.card.pick-card`).
- Lo que se repite mucho (casillas, filas, pastillas) no lleva `border-image`: un
  borde de corteza en CSS, `box-shadow: var(--bark-edge)`, y `--card-bg`.
- `h2` 28 px Grenze 700 en `--title-ink`; `h3` 19 px. `.sub`, `.note`, `.err`, `.gold` (texto ámbar), `.muted`, `.center`.
- `.eyebrow`: antetítulo en mayúsculas pequeñas, espaciadas («PREGUNTA 1 DE 8»).
- `.divider`: línea de corteza (`<hr class="divider">`); `.vine-sep`: la raíz con hojas, bajo un título centrado.
- Anchos: `.wide` (980 px). Para hojas, ver §4.

---

## 4. La HOJA (patrón de pantalla para el móvil)

**Toda pantalla nueva o rediseñada usa este patrón.** Cabecera fija, cuerpo que
se desplaza y pie opcional con la acción principal.

```html
<section id="scr-x" class="scr dim under-bar hidden">
  <div class="box sheet-box wide">
    <header class="sheet-head">
      <button class="icon-btn" data-back data-ico="back" aria-label="Volver" title="Volver"></button>
      <h2>Mochila</h2>
      <div class="sheet-acts">
        <button class="icon-btn" data-ico="search" aria-label="Buscar" title="Buscar"></button>
      </div>
      <!-- opcional: segunda línea a todo el ancho (pestañas, buscador) -->
      <div class="sheet-row"><div class="gen-tabs">…</div></div>
    </header>
    <div class="sheet-body">
      … lo que se desplaza (rejilla, lista, ficha) …
    </div>
    <footer class="sheet-foot">           <!-- opcional -->
      <span class="grow muted">Seleccionado: Pikachu</span>
      <button class="btn gold">Elegir</button>
    </footer>
  </div>
</section>
```

Cómo se comporta (ya lo hace la base, no hay que añadir CSS):

| Pantalla | Comportamiento |
|---|---|
| Escritorio / tableta | Panel centrado. Ancho: 720 px; `.wide` 1040; `.narrow` 480. Alto: lo que ocupe, como mucho 880 px (`.tall`: siempre 880). El cuerpo se desplaza. |
| Móvil de pie (≤ 599 px de ancho) | A **pantalla completa**, de borde a borde: sin radio, borde ni sombra y opaca. Si la pantalla es `.under-bar`, empieza debajo de la barra y la pantalla entera es opaca (barra + hoja = una página); si no, la cabecera baja hasta la zona segura. Cabecera de 48 px (título 19 px), relleno de 12 px. El pie respeta la barra de inicio y sus botones se reparten el ancho. Entra deslizándose desde abajo. |
| Móvil tumbado (≤ 520 px de alto) | Igual, a pantalla completa y de borde a borde (las zonas seguras de los lados van por dentro); la cabecera, sin `.sub`. |

Reglas:
- El botón de volver va **el primero** de la cabecera, como `icon-btn` con `data-ico="back"` y `aria-label="Volver"` (el mando lo encuentra solo: `data-back` o un id que acabe en `-back` / `-close`). Para cerrar una ventana, `data-ico="close"` y `aria-label="Cerrar"`.
- Nada de alturas fijas en `vh` dentro de la hoja: el cuerpo ya se lleva el alto que sobra (`flex: 1; min-height: 0; overflow-y: auto`). Una rejilla dentro del cuerpo lleva `max-height: none; overflow: visible`.
- Si conviertes una pantalla vieja en hoja, quita su id de la lista «Cajas con menos margen» de la sección «móvil en vertical» y de sus reglas viejas (`#scr-x > .box …`), o déjalas: la base ya las anula con `:not(:has(> .sheet-box))` para el relleno.
- Ejemplo real: `#scr-starters` en `dev.html`.

---

## 5. Botones

| Clase | Aspecto | Uso |
|---|---|---|
| `.btn` | Corteza con cara de musgo (`boton.svg`) | Acción secundaria. |
| `.btn.gold` | Hoja que brilla, texto oscuro (`boton-pri.svg`) | **La** acción principal de la pantalla (una sola). El mando empieza en ella. |
| `.btn.amber` | Ámbar (`boton-ambar.svg`) | Lo que se paga con monedas (los `.shop-buy` y `.upg-buy` dorados ya lo son). |
| `.btn.ghost` | Píldora transparente con borde de corteza | Terciaria: Volver, Cancelar, Ahora no. |
| `.btn.danger` | Rojo (`boton-peligro.svg`) | Borrar, abandonar. |
| `.btn.google` | Blanco | Entrar con Google. |
| `.small` | 32 px de imagen de borde (44 en táctil) | Botones de fila (precio, «Usar»). |
| `.big` | 52 px, 22 px de letra | Acción principal grande (login, resultado). |

Los `.btn` son `border-image` con relleno (`fill`): **no les pongas `background`**
ni `border` de color (se pierde el dibujo). Al pasar el ratón, brillan; al pulsar,
bajan 2 px y se oscurecen.
El `.btn` normal mide 44 px (40 en el móvil, con ratón y con dedo).
| `.block` | Todo el ancho | En columnas y pies. |
| `.ic` | Icono + texto en fila, con hueco | Sólo si el texto va dentro de un `<span>` (con `.ic`, los espacios sueltos se pierden). |

```html
<button class="btn gold big block">¡Vamos juntos!</button>
<button class="btn small ghost" data-back>Volver</button>
<button class="btn ic"><span class="ico-tile s">…</span><span>Usar</span></button>
```

- El alto sale del relleno (44 px el normal): **no pongas `min-height` a `.btn`** (el texto se queda arriba). En táctil la base ya sube `.btn.small` a 44, y también `.btn` en el móvil tumbado (donde con ratón mide 36). Sólo en las pantallas de menú de la lista de la sección «táctil» de `style.css`: si añades una pantalla de menú nueva, añade su id ahí.
- Desactivado: `disabled` (se apaga solo). El sonido de clic lo pone `ui.js` a todo `.btn`, `.icon-btn`, `.tb-btn`, `.chip`, `.card`, `.cell`, `.tab`, `.gen-tab`, `.menu-item`, `.answer` (o `data-sfx="none"` / `data-sfx="confirm"`).

**Botón de icono** (controles puros: atrás, cerrar, más, buscar…):

```html
<button class="icon-btn" data-ico="close" aria-label="Cerrar" title="Cerrar"></button>
<button class="icon-btn gold" data-ico="check" aria-label="Aceptar"></button>
<button class="icon-btn plain" data-ico="info" aria-label="Más información"></button>
```

Medallón redondo de 40 px (44 en táctil), con `medalla.svg` de fondo. Siempre con `aria-label` y `title` (se traducen solos).

**Iconos SVG de interfaz** — `G.UI.svg(nombre, tamaño = 22)` devuelve el `<svg>`;
en el HTML basta `data-ico="nombre"` (y `data-ico-size`): `G.UI.icons(raíz)` los
rellena (al arrancar se hace con todo el documento; si creas HTML con JS, llama a
`G.UI.icons(tuElemento)` o usa `G.UI.svg()` directamente). Nombres: `back`,
`close`, `chevron`, `down`, `more`, `menu`, `check`, `plus`, `minus`, `search`,
`filter`, `sort`, `refresh`, `info`, `help`, `lock`, `external`, `play`, `user`,
`gear`, `sound`, `mute`, `full`, `news`, `heart`, `logout`, `save`. Toman el color
del texto (`currentColor`). Si necesitas otro, añádelo a `SVG` en `js/ui/ui.js`
(24×24, trazo 2, extremos redondeados).

---

## 6. Foco (teclado y mando)

- Teclado: anillo de luz de hoja de 3 px (`:focus-visible`) en botones, chips, pestañas, tarjetas, casillas, enlaces y selects. No lo quites.
- Mando: `gamepad.js` pone `.pad-focus` a lo seleccionado: anillo de luz de hoja + halo que brilla. Cualquier cosa pulsable debe ser `<button>`/`<a>` o tener `cursor: pointer` (o `data-pad`) para que el mando la encuentre.
- Para que el mando empiece en la acción principal, que sea `.btn.gold` (o `.play`, `.card`).

---

## 7. Chips, pestañas y segmentos

```html
<!-- Filtros / opciones: píldoras -->
<div class="chips">
  <button class="chip on">Todos</button>
  <button class="chip">Tengo</button>
  <button class="chip"><img …> Shiny</button>
</div>

<!-- Pestañas en segmento (2-4 opciones que cambian el contenido) -->
<div class="tabs">
  <div class="tab on" data-tab="a">Misiones</div>
  <div class="tab" data-tab="b">Logros</div>
</div>

<!-- Pestañas que se deslizan de lado (muchas: regiones) -->
<div class="gen-tabs">
  <button class="gen-tab on"><b>Kanto</b><small>12/151</small></button>
  …
</div>

<!-- Segmento pequeño (dos estados) -->
<div class="seg"><button class="on" data-v="0">Normal</button><button data-v="1">Shiny</button></div>
```

- `.chip` 32 px (44 táctil), `.on` = luz de hoja. `.tab.on` y `.seg button.on` = hoja encendida (`--leaf-bg`, texto oscuro; la opción `data-v="1"` en shiny: degradado cian). `.gen-tab.on` = aro de luz de hoja.
- En el móvil, una fila de chips que no cabe se desliza: `flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none`.

---

## 8. Formularios

```html
<label for="f-nick">Apodo</label>
<input id="f-nick" class="field" maxlength="16" placeholder="3-16 letras">
<select class="field">…</select>          <!-- lleva su flecha -->
<p class="err"></p>                       <!-- error debajo del campo -->
```

- `.field`: 44 px, hundido (`--sunk`), radio 12, borde que se ilumina al enfocar. En táctil la letra es de 16 px (si no, el iPhone amplía la página).
- `input[type=range]`: pista hundida con borde de corteza y pomo de madera con el centro de luz de hoja (en táctil, zona de 44 px).
- `.err` vacío no ocupa sitio si le pones `:empty { margin: 0 }` en tu pantalla.

---

## 9. Tarjetas, casillas, listas y paneles

```html
<!-- Tarjeta pulsable (cartas de nivel, objetos) -->
<button class="card">
  <span class="ico">…</span>
  <span class="txt"><span class="nm">Lanzallamas <span class="tag-chip" style="background:#ff9c54">Fuego</span></span>
  <span class="ds">Descripción en gris.</span></span>
</button>

<!-- Casilla de rejilla (Pokémon) -->
<div class="grid">
  <div class="cell on"><span class="no">25</span><canvas width="92" height="80"></canvas><b>Pikachu</b></div>
</div>

<!-- Fila de lista (amigos, mochila, mejoras) -->
<div class="list">
  <div class="list-row">
    <span class="ico-tile">…</span>
    <div class="grow"><b>Menta Modesta</b><small>Sube At. Esp., baja Ataque</small></div>
    <button class="btn small gold">Usar</button>
  </div>
  <button class="list-row on">… fila pulsable entera …</button>
</div>

<!-- Recuadro interior (ficha, tabla) -->
<div class="panel">…</div>
```

- `.card` (radio 14, borde de corteza) sube 2 px y brilla al pasar el ratón. `.cell.on` y `.list-row.on`: aro de luz de hoja. `.cell.locked`: apagada, sin clic.
- `.stage`: el `<canvas>` de un Pokémon con el fondo del color de su tipo (`style.setProperty('--stage-c', color)`) y `.shiny`.
- **Los Pokémon en `<canvas>` se pintan a escala entera** (`G.UI.sprite(cv, dex, { scale })`). No cambies su tamaño con CSS a un tamaño que no sea el del canvas (los píxeles saldrían desiguales). Si el hueco cambia con la pantalla, mide el contenedor y pon `cv.width/height` a esa medida (mira `fitPartner()` en `js/ui/menu.js`).

---

## 10. Insignias, iconos de objetos y estados

```html
<span class="type" style="background:#f8d030">Eléctrico</span>   <!-- G.UI.typeChips(tipos) -->
<span class="badge">¡Nuevo!</span>   <span class="badge gold">×10</span>   <span class="badge ghost">Nv. 3</span>
<span class="rarity-ball">…</span>                                     <!-- G.UI.stars(rareza) -->
<span class="coin"></span> 120                                          <!-- moneda dentro de un texto -->
```

**Iconos de cosas del juego** (monedas, objetos, mejoras, movimientos, tipos):
SIEMPRE `G.Icons.html(nombre, tamaño)` (o `G.Icons.draw` en el canvas). Son
sprites pixel art de objetos reales: pídelos a **30 o 60 px** (escala entera) y
mételos en una baldosa:

```html
<span class="ico-tile">${G.Icons.html('mint', 30)}</span>            <!-- 44 px, la normal (38 en el móvil) -->
<span class="ico-tile s">${G.Icons.html('coin', 30)}</span>          <!-- 36 px, en filas (32 en el móvil) -->
<span class="ico-tile l">${G.Icons.html('capsule', 60)}</span>       <!-- 76 px, fichas (64 en el móvil) -->
<span class="ico-tile round t-gold">…</span>                         <!-- redonda y teñida -->
```

Tintes: `t-gold`, `t-red`, `t-blue`, `t-green`, `t-purple`. No pintes iconos a
mano ni con emojis; si falta uno, se pide al módulo de iconos por su nombre.
No escales la imagen con CSS a tamaños que no sean 30/60.

**Progreso**: `<div class="meter"><i style="width:40%"></i></div>` (verde hoja;
`.meter.blue`, `.meter.green`). La del test es `.progress`.

**Vacío**: `<div class="empty-state"><span class="ico-tile l">…</span><b>Aún no tienes amigos</b><span>Añade a alguien por su apodo.</span></div>`
(no uses `.empty`, que es de la sala).

**Tooltip** (sólo ratón): `class="has-tip" aria-label="Texto"` en el elemento.

**Aviso corto**: `G.UI.toast('Texto', ms)` (abajo en el centro, encima de todo).

---

## 11. La barra de arriba (`#topbar`)

Es de `ui.js` (`chrome`, `refreshCoins`) y de la base. No pongas iconos ni
texto a sus botones desde otros módulos: pon sólo su `onclick`.

- Izquierda: monedas y tickets (`.tb-wallet`). Derecha (`.tb-acts`): perfil, Ajustes (el engranaje, siempre a la vista) y `.tb-menu`. Sin Guardar desde el 26-10-2026: la partida se sube sola; el botón queda sólo en Ajustes → Cuenta.
- ≥ 900 px de ancho (y más de 520 de alto): todos los botones a la vista, sólo icono (con `title`).
- < 900 px, o móvil tumbado (≤ 520 px de alto): Novedades, Sonido, Pantalla completa y Salir pasan al menú «Más» (⋯), con su texto.
- < 600 px de ancho (móvil de pie): el perfil también va al menú «Más» (primera fila, con su estado de guardado).
- Si aun así no cabe, se acorta el nombre del perfil (…); las monedas no se encogen.
- Se esconde sola cuando hay una ventana `.modal` (o Ajustes, Novedades, Perfil…) abierta.

---

## 12. Responsive: tamaños de prueba y cortes

Prueba SIEMPRE en: **375×667, 390×844, 430×932** (de pie), **667×375, 844×390,
932×430** (tumbado), **1024×768 / 768×1024** (tableta) y **1280×800, 1920×1080**.
Nada debe salirse de lado (`scrollWidth` = ancho) y lo pulsable debe medir ≥ 44 px
en táctil.

| Media query | Qué es |
|---|---|
| `(max-width: 599px), (max-height: 520px)` | **Móvil** (de pie o tumbado): modo compacto y cada vista a pantalla completa (§16). |
| `(max-width: 599px) and (min-height: 521px)` | Móvil de pie: rejillas de 3 columnas, botones del pie repartidos. |
| `(orientation: portrait) and (min-height: 521px)` | Cualquier cosa de pie (móvil, tableta de pie, ventana estrecha): una columna. |
| `(max-height: 520px)` | Móvil tumbado: todo compacto, cabeceras en una línea, dos columnas. |
| `(max-height: 400px)` | Móviles muy bajos tumbados (iPhone SE). |
| `(max-width: 899px), (max-height: 520px)` | Barra de arriba con menú «Más». |
| `(min-width: 900px)` | Escritorio y tableta tumbada. |
| `body.touch` | Se está usando el dedo (no depende del tamaño): `--tap` mínimos (44 px; 40 en el móvil). |

Reglas:
- Móvil primero: escribe la versión de 375 px y amplía con `min-width`, o usa las de arriba.
- Flex y grid; `min-width: 0` en los hijos que llevan texto largo; `minmax(0, 1fr)` en las columnas.
- Nada de alturas fijas en `vh` (en el iPhone no cuadran): `height: 100%` dentro de la pantalla, `dvh` sólo con respaldo.
- Zonas seguras con `max(Npx, var(--sa-…))`.
- Lo que se pulsa abajo, a mano del pulgar; la acción principal en el pie de la hoja.

---

## 13. Texto e idiomas

- Todo el texto visible se escribe en **español** en el HTML o en el JS; `i18n.js` lo traduce solo (por frase exacta). Cada frase nueva hay que darla con su inglés (`js/data/lang-en.js`).
- Un texto = un nodo: no partas una frase en trozos con etiquetas en medio si puedes evitarlo (se traduce peor). Las cifras, aparte: `<b>12</b><span>Mejor nivel</span>`.
- Lo que escribe el jugador (apodos) va con `translate="no"`.
- `title`, `aria-label`, `placeholder` y `alt` también se traducen: úsalos.

---

## 14. Sí / No

**Sí**
- Paneles `.box` con la hoja (§4); una sola acción `.btn.gold` por pantalla.
- Iconos de objetos con `G.Icons.html(n, 30|60)` en `.ico-tile`; controles con `G.UI.svg` / `data-ico`.
- Grenze para títulos, botones y cifras; Alegreya Sans para leer.
- Marcos de `assets/ui` (salen de `tools/ui-art.cjs`) y el borde de corteza (`--bark-edge`).
- Luz de hoja para lo principal; ámbar para monedas; oro para evoluciones.
- Tokens para color, radio, espacio y capas.
- Probar en los 9 tamaños con ratón y con táctil.

**No**
- Letra pixel (Pixelify) en el DOM; cristal (`backdrop-filter`); degradados azules o morados de web; bordes blancos finos.
- Dibujar a mano un marco nuevo en un SVG suelto: añádelo a `tools/ui-art.cjs` con las mismas piezas (corteza, hoja, seta).
- Emojis como iconos; iconos dibujados a mano en CSS.
- `min-height` en `.btn`; `vh` fijos; anchos fijos sin `min()`.
- Colores sueltos en el código (`#3d67c0`…) en vez de tokens.
- Escalar sprites con CSS a tamaños no enteros.
- Tocar `index.html` o `js/app.min.js` (se generan).

---

## 15. Piezas ya hechas (para copiar)

- **Pantalla de carga** (`#boot`, `#tap-start`): logotipo `.wordmark` + Poké Ball que gira (`.boot-ld::before`).
- **Inicio de sesión** (`#scr-login`): panel con dos columnas en pantallas bajas.
- **Test** (`#scr-test`): `.answer` con letra A/B/C/D por contador CSS.
- **Resultado** (`#scr-result`): escenario 240×180 a tamaño real y `.res-acts`.
- **Iniciales** (`#scr-starters`): la hoja completa.
- **Menú principal** (`#scr-menu`): `.menu-item.play` (el botón «Jugar»), `.menu-list` de `.menu-item.tile` (baldosa: `.mi-ico` + `.mi-t` + `<small>`; con `small.gold` sale un punto rojo), `.menu-stats` (`.ms` con `<b>` y `<span>`), `.partner-stage` (canvas medido con `fitPartner`). `install-ui.js` pone su tarjeta la primera dentro de `.menu-right`.

---

## 16. Modo móvil: compacto y cada vista a pantalla completa (23-10-2026)

**Qué es «móvil»**: `@media (max-width: 599px), (max-height: 520px)` (de pie con
menos de 600 px de ancho, o tumbado con 520 px de alto o menos). Tableta (≥ 600 de
ancho y > 520 de alto) y ordenador **no cambian**.

**Compacto** (`style.css`, secciones 0, 5, 8, 9, 10, 12): la base baja un 10-15 %
los tokens (`--fs-*`, ver §1), `--bar-h` a 52, `--ctl` y `--tap` a 40, `.btn` a 40 px
(`.big` 48, `.small` 32), `.field` 40, `.list-row` 48, `.ico-tile` 38 (`.s` 32, `.l`
64), `.card`, `.chip`, `.tab`, `.toast` y el menú «Más» algo más pequeños. Si tu
pantalla usa los tokens, encoge sola. Mínimos que no se rompen: lo que se toca,
40 px (`var(--tap)`); letra, 11 px (12 en párrafos).

**Pantalla completa** (sección 4b): en el móvil, el panel de **toda** pantalla
(`.scr > .box`, también las hojas `.sheet-box`) la ocupa entera, de borde a borde:
`width/height: 100%`, sin `border-radius`, borde ni sombra, opaco
(`--surface-solid`) y sin desenfoque. Las zonas seguras van por dentro: en el
relleno del panel (14 px o la zona segura) o en la cabecera / cuerpo / pie de la
hoja. Las pantallas que enseñan la barra (`.under-bar` y la lista por id de §2)
empiezan debajo de ella, y la pantalla entera es opaca: barra + hoja se leen como
una sola página.

- **Se quedan como tarjeta**: los diálogos cortos `.box.mcard` (confirmar, recuperar
  la cuenta, avisos, otra pestaña) y el panel del editor de botones (`.lay-panel`).
  Los toasts y el aviso de logro no son pantallas. Un diálogo corto nuevo → `.mcard`.
- **El contenido va arriba**, en su orden; si sobra sitio, que respire (más aire o
  letra un poco mayor en los móviles altos), no centrado con huecos enormes. La
  acción principal, abajo a mano del pulgar (pie de la hoja) si ya lo estaba.
- **Tu sección no debe deshacerlo**: una regla por id que ponga `width: min(…)`,
  `padding` a la `.scr` o `border-radius` al panel pesa más que la base y lo vuelve
  a hacer recuadro. En el móvil, deja que mande la base (o pon tus medidas dentro
  del panel, no en él).
- Ejemplos: inicio de sesión (columna con las notas abajo), test, resultado (el
  compañero en el centro y los botones abajo), iniciales (hoja) y el menú principal
  (cabe entero en 375×667, estadísticas incluidas).
