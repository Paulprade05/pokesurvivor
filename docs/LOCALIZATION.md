# Idiomas del juego

El juego está sólo en **español e inglés** (decisión del dueño, 05-11-2026).

## Cómo funciona

- El juego está escrito en español. El inglés sale de `js/data/lang-en.js`; los dos van dentro
  de `js/app.min.js`.
- `js/core/locales.js` elige el idioma antes que nada y lo usan la pantalla de carga (`js/boot.js`)
  y el juego (`js/core/i18n.js`): primero el elegido en Ajustes → Gráficos → Idioma (`ps.lang`,
  sólo en ese aparato, no va a la nube), luego `/en/` en la dirección y luego el idioma principal
  del navegador. Español si el navegador está en español; inglés en cualquier otro caso.
- **Idiomas quitados**: si `ps.lang` guarda algo que ya no existe (`fr`, `it`, `pt-BR`, `zh-Hans`,
  `zh-Hant`), `locales.js` lo borra y sigue con la detección de arriba. No toca nada más.
- `G.I18n.add(dict, idioma)` sólo carga el idioma activo. Las claves son el texto español. Niveles:
  frase exacta, patrón con `{x}` (traduce el contenido) o `{name}` (lo deja como está) y trozos con
  palabras enteras. Los patrones más específicos van antes, y lo último añadido manda.
- `translate="no"` en el DOM y `rawCanvas` protegen los apodos de los jugadores.
- Habilidades, naturalezas y objetos de evolución llevan el nombre en `[es, en]` en sus datos
  (`G.Mons.name`), porque «Potencia» o «Rara» ya significan otra cosa en el diccionario.

## Textos nuevos

En español en el código y, en inglés, en `js/data/lang-en.js`. Novedades: `js/data/changelog.js`
(cada línea `[es, en]`; ayudante `tools/changelog-add.cjs`).

## Idiomas quitados: dónde recuperarlos

Francés, italiano, portugués de Brasil, chino simplificado y chino tradicional se quitaron el
05-11-2026. El último estado con todos está en el commit `6e235bd1` (`js/data/lang-*.js`,
`tools/build_langs.js`, `js/lang/`). Eran contribuciones de estas personas al proyecto original:

| Language / component | Contributor | Original PR | Revision |
| --- | --- | --- | --- |
| French dictionary and names | KamelAkar | [#67](https://github.com/JPTER78/pokesurvivor/pull/67) | `4ea617c89c3d00eeef13c8914cfb39a2b82764a2` |
| Italian dictionary | Matteo Ruggiero | [#82](https://github.com/JPTER78/pokesurvivor/pull/82) | `ead8ea14c9e78af8c7383e0274d811d8b102b651` |
| Brazilian Portuguese dictionary | Ayablack | [#108](https://github.com/JPTER78/pokesurvivor/pull/108) | `007608505557a114331a9c28b5dc2e4a3beba0ec` |
| Simplified Chinese dictionary and names | Xiao Hou | [#88](https://github.com/JPTER78/pokesurvivor/pull/88) | `a23065deefa1dd4d23557c7b10f6d8d99af42dbc` |
| Traditional Chinese dictionary, names, contextual translation and UI adaptations | Zhe Xi Huang | [#74](https://github.com/JPTER78/pokesurvivor/pull/74) | `d52e25651bf47a9963f6af6a13001b173d25357a` |

