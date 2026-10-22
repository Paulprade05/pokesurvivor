# Sistema de diseño de PokéSurvivor («Pokémon moderno», 22-10-2026)

Guía para quien rediseñe una pantalla. Todo está en `css/style.css` (secciones
0 a 16 = la base; de la 17 en adelante, las pantallas que aún no se han
rediseñado). Síguela al pie de la letra: así todas las pantallas parecen del
mismo juego.

**La idea.** La interfaz es lisa, redondeada y con mucho contraste (como los
menús de Escarlata/Púrpura, Leyendas Z-A, UNITE o GO). El **mundo** del juego
(mapa, Pokémon, ataques) sigue en pixel art y se ve vivo detrás de las
pantallas. Los **iconos de cosas del juego** son sprites de objetos reales de
Pokémon (pixel art) metidos en una baldosa redonda. **Nada de letra pixel ni de
cajas de borde doble estilo Mundo Misterioso en el DOM.**

---

## 1. Tokens (variables de `:root`)

Usa siempre la variable, nunca el valor suelto.

### Color

| Variable | Valor | Para qué |
|---|---|---|
| `--c-yellow` | `#ffcb05` | Acción principal (botón «Jugar», «Elegir», «Guardar»). Texto encima: `--c-on-yellow`. |
| `--c-yellow-hi` | `#ffd84a` | Parte de arriba del degradado amarillo, hover. |
| `--c-on-yellow` | `#14204a` | Texto sobre amarillo (10:1). |
| `--c-blue` / `--c-blue-hi` / `--c-blue-btn` | `#3d7dca` / `#4a8ad6` / `#2f6bb8` | Secundario. Fondo de botón azul = `--c-blue-btn` (blanco encima ≥ 4,5:1). |
| `--c-blue-deep` | `#1d3b78` | Azul profundo (contorno del logotipo, fondos). |
| `--c-red` / `--c-red-btn` | `#ee3b3b` / `#d62f3a` | Peligro, avisos, punto de «nuevo». Botón rojo = `--c-red-btn`. |
| `--c-green`, `--c-pink`, `--c-purple`, `--c-cyan` | | Acentos (éxito, apoyar, épico, shiny). |
| `--bg-0` / `--bg-1` / `--bg-2` | `#070e22` / `#0b1530` / `#14224a` | Fondos (de más oscuro a menos). |
| `--surface` | `rgba(17,30,68,.86)` | Panel de cristal (`.box`). Reserva sin desenfoque: `--surface-solid`. |
| `--surface-float` | `rgba(17,30,68,.96)` | Menús flotantes, avisos, tooltips. |
| `--card` / `--card-hi` / `--card-press` | blanco al 6 / 10 / 15 % | Tarjeta dentro de un panel; al pasar por encima; al pulsar. |
| `--sunk` | `rgba(3,8,24,.38)` | Hundido: campos, pistas de barras, segmentos. |
| `--chrome` | `rgba(11,21,48,.8)` | Pastillas de la barra de arriba. |
| `--line-1` / `--line-2` / `--line-3` | blanco al 8 / 14 / 26 % | Bordes de 1 px: suave, normal, marcado (hover). |
| `--ink` | `#f4f7ff` | Texto principal. |
| `--muted` | `#afc0e6` | Texto secundario (≥ 6:1 sobre panel). |
| `--faint` | `#8fa3d1` | Texto terciario (≥ 4,5:1). No más claro que esto para texto. |
| `--link` / `--err` / `--ok` | | Enlaces, errores, correcto. |
| `--r1`…`--r5`, `--bond`, `--shiny` | | Rarezas (común → legendaria), vínculo, shiny. Igual que siempre. |
| Tipos | `G.U.TYPE_COLOR[tipo]` | Llega en línea (`style="background:…"`). |

### Letra

- `--font` = **Nunito** (texto de lectura, etiquetas, descripciones).
- `--font-display` = **Fredoka** (títulos, botones, números, nombres de Pokémon, pestañas).
- En chino, ambas llevan detrás las fuentes del sistema (PingFang, Microsoft YaHei/JhengHei, Noto Sans CJK): no hay que hacer nada.
- Escala: `--fs-xs` 12 · `--fs-s` 13 · `--fs-m` 15 · `--fs-l` 18 · `--fs-xl` 22 · `--fs-2xl` 26 · `--fs-3xl` 34 px. **Nunca menos de 11 px.**
- Pesos: Fredoka 600 (títulos, botones) y 700 (logotipo, cifras gordas); Nunito 400 (texto), 600-700 (etiquetas), 800 (`<b>`).
- Cifras que cambian (monedas, tiempos): `font-variant-numeric: tabular-nums`.

### Espacio, radios, sombras, movimiento

- Espacio: `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 24 · `--sp-6` 32 px.
- Radios: `--rad-xs` 6 · `--rad-s` 8 · `--rad-m` 12 (botones, campos) · `--rad-l` 16 (tarjetas) · `--rad-xl` 22 (paneles) · `--rad-pill` (chips, pastillas).
- Sombras: `--sh-1` (casi nada) · `--sh-2` (algo que flota: tarjetas, pastillas) · `--sh-3` (paneles) · `--sh-pop` (menús, avisos).
- Cristal: `--glass` (`backdrop-filter`); úsalo sólo en paneles (`.box`) y pastillas de la barra, siempre con color de reserva. **No** en elementos que se repiten (casillas, baldosas, filas): cada uno desenfocado encima del mundo animado cuesta en cada fotograma. La base ya lo quita en las hojas a pantalla completa del móvil y en las ventanas de la partida (subir de nivel, objeto, vínculo, pausa, fin), que en cooperativo tienen el mundo moviéndose detrás. Con `class="no-glass"` en `<html>` (o «reducir transparencia» en el sistema) todo queda opaco y sin desenfoque.
- Movimiento: `--t-fast` .15 s, `--t-med` .22 s, `--ease`, `--ease-pop`. `prefers-reduced-motion` ya las apaga todas.

### Capas (`z-index`)

`--z-screen` 20 (pantallas) < `--z-chrome` 25 (barra de arriba, créditos) <
`--z-panel` 30 (panel de sonido) < `--z-modal` 35 (ventanas que tapan la barra)
< `--z-fx` 40 (tirada del gacha) < `--z-sheet` 60 (Ajustes, Apoyar) <
`--z-legal` 65 < `--z-editor` 66 (colocar botones, instalar) < `--z-boot` 70
(carga, invitación) < `--z-tap` 80 (pulsa para empezar, logro) < `--z-noscript`
90 < `--z-toast` 95 < `--z-block` 150 (otra pestaña) < `--z-fly` 1000.

`gamepad.js` decide qué pantalla manda por su z-index: una ventana nueva que
deba ir encima necesita un z-index mayor, no sólo ir después en el HTML.

### Zonas seguras y barra

- `--sa-t`, `--sa-r`, `--sa-b`, `--sa-l`: `env(safe-area-inset-*)` (muesca, isla, barra de inicio). Úsalas con `max()`: `padding-bottom: max(12px, var(--sa-b))`.
- `--tap` 44 px: tamaño mínimo de lo que se toca con el dedo.
- `--ctl`: alto de los botones de la barra (40 con ratón, 44 táctil).
- `--bar-h`: hueco que dejan las pantallas que enseñan la barra (se suma a `--sa-t`). Lo calcula la base; no lo cambies.

---

## 2. Pantallas: `.scr`, velo y capas

```html
<section id="scr-x" class="scr dim under-bar hidden">  …  </section>
```

- `.scr`: capa fija a pantalla completa, contenido centrado, relleno con las zonas seguras.
- `.dim`: velo azul noche (el mundo se sigue viendo). Todas las pantallas de menú lo llevan; el menú principal no.
- `.under-bar`: la pantalla deja ver la barra de arriba (monedas, tickets): se abre con `G.UI.show(id, true)` y empieza debajo de la barra. Hoy además van por id: `#scr-goals, #scr-dex, #scr-upgrades, #scr-shop, #scr-bag, #scr-gacha, #scr-friends, #scr-rank, #scr-lobby, #scr-mod`.
- `.modal`: ventana que va por delante de la barra y la **esconde** (`z 35`). Hoy por id: `#scr-news, #scr-recover, #scr-savenote, #scr-profile, #scr-nick` (y Ajustes, Apoyar, Aviso legal, Instalar, Colocar botones con su propio z-index). Una ventana nueva de este tipo: `class="scr dim modal"`.
- `.hidden` (con `!important`) apaga cualquier cosa.

---

## 3. Panel: `.box`

Superficie de cristal azul noche, borde de 1 px claro, radio 22, sombra suave,
animación `pop` al aparecer. Se desplaza por dentro si no cabe.

```html
<div class="box" style="width:min(440px,100%)">
  <h2>Título</h2>
  <p class="sub">Frase de explicación en gris claro.</p>
  …
</div>
```

- `h2` 26 px Fredoka 600; `h3` 18 px. `.sub` (gris, 15 px), `.note` (13 px), `.err` (rojo claro), `.gold` (texto amarillo), `.muted`, `.center`.
- `.eyebrow`: antetítulo en mayúsculas pequeñas («PREGUNTA 1 DE 8»).
- `.divider`: línea de separación (`<hr class="divider">`).
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
| Móvil de pie (≤ 599 px de ancho) | A **pantalla completa**: sin bordes ni márgenes; si la pantalla es `.under-bar`, empieza debajo de la barra con las esquinas de arriba redondeadas; si no, la cabecera baja hasta la zona segura. El pie respeta la barra de inicio. Los botones del pie se reparten el ancho. Entra deslizándose desde abajo. |
| Móvil tumbado (≤ 520 px de alto) | Ocupa todo el alto, cabecera compacta (48 px, título 18 px, sin `.sub`). |

Reglas:
- El botón de volver va **el primero** de la cabecera, como `icon-btn` con `data-ico="back"` y `aria-label="Volver"` (el mando lo encuentra solo: `data-back` o un id que acabe en `-back` / `-close`). Para cerrar una ventana, `data-ico="close"` y `aria-label="Cerrar"`.
- Nada de alturas fijas en `vh` dentro de la hoja: el cuerpo ya se lleva el alto que sobra (`flex: 1; min-height: 0; overflow-y: auto`). Una rejilla dentro del cuerpo lleva `max-height: none; overflow: visible`.
- Si conviertes una pantalla vieja en hoja, quita su id de la lista «Cajas con menos margen» de la sección «móvil en vertical» y de sus reglas viejas (`#scr-x > .box …`), o déjalas: la base ya las anula con `:not(:has(> .sheet-box))` para el relleno.
- Ejemplo real: `#scr-starters` en `dev.html`.

---

## 5. Botones

| Clase | Aspecto | Uso |
|---|---|---|
| `.btn` | Azul, texto blanco | Acción secundaria. |
| `.btn.gold` | Amarillo, texto azul oscuro | **La** acción principal de la pantalla (una sola). El mando empieza en ella. |
| `.btn.ghost` | Transparente con borde | Terciaria: Volver, Cancelar, Ahora no. |
| `.btn.danger` | Rojo | Borrar, abandonar. |
| `.btn.google` | Blanco | Entrar con Google. |
| `.small` | 34 px (44 en táctil) | Botones de fila (precio, «Usar»). |
| `.big` | 58 px, 20 px de letra | Acción principal grande (login, resultado). |
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

Redondo de 40 px (44 en táctil). Siempre con `aria-label` y `title` (se traducen solos).

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

- Teclado: anillo amarillo de 3 px (`:focus-visible`) en botones, chips, pestañas, tarjetas, casillas, enlaces y selects. No lo quites.
- Mando: `gamepad.js` pone `.pad-focus` a lo seleccionado: anillo amarillo + halo. Cualquier cosa pulsable debe ser `<button>`/`<a>` o tener `cursor: pointer` (o `data-pad`) para que el mando la encuentre.
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

- `.chip` 32 px (44 táctil), `.on` = amarillo. `.tab.on` = azul relleno. `.gen-tab.on` = borde y texto amarillos. `.seg button.on` = azul (la opción `data-v="1"` en shiny: degradado cian).
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
- `input[type=range]`: pista hundida y botón amarillo redondo (en táctil, zona de 44 px).
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

- `.card` (radio 16) sube 2 px al pasar el ratón. `.cell.on` y `.list-row.on`: borde amarillo. `.cell.locked`: apagada, sin clic.
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
<span class="ico-tile">${G.Icons.html('mint', 30)}</span>            <!-- 44 px, la normal -->
<span class="ico-tile s">${G.Icons.html('coin', 30)}</span>          <!-- 36 px, en filas -->
<span class="ico-tile l">${G.Icons.html('capsule', 60)}</span>       <!-- 76 px, fichas -->
<span class="ico-tile round t-gold">…</span>                         <!-- redonda y teñida -->
```

Tintes: `t-gold`, `t-red`, `t-blue`, `t-green`, `t-purple`. No pintes iconos a
mano ni con emojis; si falta uno, se pide al módulo de iconos por su nombre.
No escales la imagen con CSS a tamaños que no sean 30/60.

**Progreso**: `<div class="meter"><i style="width:40%"></i></div>` (amarillo;
`.meter.blue`, `.meter.green`). La del test es `.progress`.

**Vacío**: `<div class="empty-state"><span class="ico-tile l">…</span><b>Aún no tienes amigos</b><span>Añade a alguien por su apodo.</span></div>`
(no uses `.empty`, que es de la sala).

**Tooltip** (sólo ratón): `class="has-tip" aria-label="Texto"` en el elemento.

**Aviso corto**: `G.UI.toast('Texto', ms)` (abajo en el centro, encima de todo).

---

## 11. La barra de arriba (`#topbar`)

Es de `ui.js` (`chrome`, `refreshCoins`) y de la base. No pongas iconos ni
texto a sus botones desde otros módulos: pon sólo su `onclick`.

- Izquierda: monedas y tickets (`.tb-wallet`). Derecha (`.tb-acts`): perfil, Guardar (amarillo, con punto rojo si hay cambios sin subir) y `.tb-menu`.
- ≥ 900 px de ancho (y más de 520 de alto): todos los botones a la vista, sólo icono (con `title`).
- < 900 px, o móvil tumbado (≤ 520 px de alto): Novedades, Apoyar, Sonido, Pantalla completa, Ajustes y Salir pasan al menú «Más» (⋯), con su texto.
- < 600 px de ancho (móvil de pie): el perfil también va al menú «Más» (primera fila, con su estado de guardado) y Guardar queda en icono.
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
| `(max-width: 599px) and (min-height: 521px)` | Móvil de pie: hojas a pantalla completa, rejillas de 3 columnas. |
| `(orientation: portrait) and (min-height: 521px)` | Cualquier cosa de pie (móvil, tableta de pie, ventana estrecha): una columna. |
| `(max-height: 520px)` | Móvil tumbado: todo compacto, cabeceras en una línea, dos columnas. |
| `(max-height: 400px)` | Móviles muy bajos tumbados (iPhone SE). |
| `(max-width: 899px), (max-height: 520px)` | Barra de arriba con menú «Más». |
| `(min-width: 900px)` | Escritorio y tableta tumbada. |
| `body.touch` | Se está usando el dedo (no depende del tamaño): 44 px mínimos. |

Reglas:
- Móvil primero: escribe la versión de 375 px y amplía con `min-width`, o usa las de arriba.
- Flex y grid; `min-width: 0` en los hijos que llevan texto largo; `minmax(0, 1fr)` en las columnas.
- Nada de alturas fijas en `vh` (en el iPhone no cuadran): `height: 100%` dentro de la pantalla, `dvh` sólo con respaldo.
- Zonas seguras con `max(Npx, var(--sa-…))`.
- Lo que se pulsa abajo, a mano del pulgar; la acción principal en el pie de la hoja.

---

## 13. Texto e idiomas

- Todo el texto visible se escribe en **español** en el HTML o en el JS; `i18n.js` lo traduce solo (por frase exacta). Cada frase nueva hay que darla con sus traducciones (en, fr, it, pt-BR, zh-Hans, zh-Hant).
- Un texto = un nodo: no partas una frase en trozos con etiquetas en medio si puedes evitarlo (se traduce peor). Las cifras, aparte: `<b>12</b><span>Mejor nivel</span>`.
- Lo que escribe el jugador (apodos) va con `translate="no"`.
- `title`, `aria-label`, `placeholder` y `alt` también se traducen: úsalos.
- En chino el texto ocupa menos ancho pero más alto: deja respirar las líneas.

---

## 14. Sí / No

**Sí**
- Paneles `.box` con la hoja (§4); una sola acción `.btn.gold` por pantalla.
- Iconos de objetos con `G.Icons.html(n, 30|60)` en `.ico-tile`; controles con `G.UI.svg` / `data-ico`.
- Fredoka para títulos, botones y cifras; Nunito para leer.
- Tokens para color, radio, espacio y capas.
- Probar en los 9 tamaños con ratón y con táctil.

**No**
- Letra pixel (Pixelify) en el DOM, bordes dobles, sombras de texto duras (`2px 2px 0`).
- Emojis como iconos; iconos dibujados a mano en CSS.
- `min-height` en `.btn`; `vh` fijos; anchos fijos sin `min()`.
- Colores sueltos en el código (`#3d67c0`…) en vez de tokens.
- Escalar sprites con CSS a tamaños no enteros.
- Tocar `index.html`, `js/app.min.js` o `js/lang/*` (se generan).

---

## 15. Piezas ya hechas (para copiar)

- **Pantalla de carga** (`#boot`, `#tap-start`): logotipo `.wordmark` + Poké Ball que gira (`.boot-ld::before`).
- **Inicio de sesión** (`#scr-login`): panel con dos columnas en pantallas bajas.
- **Test** (`#scr-test`): `.answer` con letra A/B/C/D por contador CSS.
- **Resultado** (`#scr-result`): escenario 240×180 a tamaño real y `.res-acts`.
- **Iniciales** (`#scr-starters`): la hoja completa.
- **Menú principal** (`#scr-menu`): `.menu-item.play` (el botón «Jugar»), `.menu-list` de `.menu-item.tile` (baldosa: `.mi-ico` + `.mi-t` + `<small>`; con `small.gold` sale un punto rojo), `.menu-stats` (`.ms` con `<b>` y `<span>`), `.partner-stage` (canvas medido con `fitPartner`). `install-ui.js` pone su tarjeta la primera dentro de `.menu-right`.
