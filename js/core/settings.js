/* ============ settings.js — ajustes de este dispositivo ============
 * Se guardan en el navegador (no en la cuenta): cada PC o móvil tiene los
 * suyos. El volumen lo guarda audio.js aparte.
 *
 *   quality     'auto' | 'max' | 'ultra' | 'high' | 'mid' | 'low'   efectos y partículas; 'ultra' es 'high' y
 *               además el mapa en 2,5D como los juegos de DS (world.js). Auto nunca lo elige.
 *               'max' (Máxima, 12-11-2026) es Ultra con todo: más resolución, antialias, sombras finas, brillo de verdad
 *               (bloom), más partículas y, en la aldea, más árboles y niebla más lejos. Se elige sola en la app de
 *               Windows (window.pokeEscritorio) la primera vez; en la web de PC, a mano. En móvil no se ofrece.
 *   dmgNumbers  true/false                        números de daño
 *   calm        true/false                        menos sacudidas y destellos
 *   fps         true/false                        contador de FPS
 *   stick       0.8 | 1 | 1.25                    tamaño del joystick táctil
 *   stickMode   'fixed' | 'float'                 joystick siempre en su sitio (de serie desde el 23-10-2026),
 *                                                 o donde pones el dedo
 *   pad         { bar, pause, stick } | null      dónde van los botones en móvil (centro, en
 *                                                 proporción a la pantalla); lo pone layout-ui.js
 *   gamepad     true/false                        jugar con mando (gamepad.js)
 *   padRumble   true/false                        que el mando vibre al recibir daño
 *   aimManual   true/false                        apuntar a mano (ratón o stick derecho) en vez de solo
 *   hpUnder     true/false                        barrita de vida bajo tu Pokémon (y los compañeros)
 *   hudScale    1 | 1.25 | 1.5                    tamaño del HUD de la partida
 *   lowHpWarn   true/false                        bordes rojos que laten con menos del 30 % de vida
 *   eco         true/false                        ahorro de energía: resolución 1× y fondo del menú más lento
 *   ownFx       1 | 0.6 | 0.35                    opacidad de tus propios ataques
 *   hazardHi    true/false                        avisos enemigos en blanco y negro con rayas (daltónicos)
 *   keys        null | { acción: código }         teclas cambiadas en Ajustes > Controles (input.js)
 *   padP        { bar, pause, stick } | null      como pad, pero en vertical (cada orientación guarda la suya)
 *   tipVert     true/false                        ya se ha enseñado el consejo de jugar en horizontal
 *   pmdTiles    true/false                        el suelo con las casillas de Mundo Misterioso (world/tileset.js);
 *                                                 apagado, el pintor propio (tiles.js)
 *   ultra3d     true/false                        con Ultra: paredes, rocas y cofres en 3D (world/ultra3d.js, WebGL); en PC con
 *                                                 calidad Alta o más, también lo que sobresale del mapa y los muros
 *                                                 (montones de rocas; props3d.js)
 *   maxPick     'ask' | 'heal' | 'coin'           al subir de nivel con todo al máximo: sacar las dos cartas
 *                                                 (curarte un poco o monedas) o elegir siempre una sola (levelup.js)
 *
 *   anim        true/false                        animaciones decorativas del mundo (world/anim.js): árboles, hierba, bichos,
 *                                                 agua, recogidas... Apagado, quieto y sin coste; los ataques se siguen viendo
 *
 *   shareStats  true | false                     subir el resumen anónimo de cada partida (net/stats.js)
 *   zoom        0.85 .. 1.25                      zoom de la cámara en la partida (la rueda del ratón; camera.js); 1 de serie
 *   glDraw      true | false                     (fps-tecnologia, 14-11-2026) dibujar el lienzo del juego con WebGL2 (core/gl2d.js) en vez
 *                                                 del Canvas 2D; en pruebas, apagado de serie; se aplica al recargar (también ?gl=1 / ?gl=0)
 *   fpsCap      60 | 30 | 0                       tope de fotogramas por segundo (game.js loop, 13-11-2026): 60 de serie, para que
 *                                                 las pantallas de 120 Hz o más no calienten el doble; 0 = sin tope
 *   pixSmooth   true/false                        «Pokémon más nítidos»: los sprites con un escalador de pixel art
 *                                                 (core/pixfilter.js; en la aldea, en su shader). null (de serie):
 *                                                 encendido sólo con la calidad Máxima (lo eligió el dueño, 13-11-2026)
 *
 *   G.Settings.get('quality')  ·  G.Settings.set('fps', true)  ·  G.Settings.on(fn)
 *   G.Settings.fx   nivel efectivo 0 (bajo) .. 2 (alto), ya resuelto el 'auto'
 */
G.Settings = (() => {
  const KEY = 'ps.settings';
  // La app de Windows (Electron, desktop/preload.cjs) se presenta con window.pokeEscritorio.
  const DESK = typeof window !== 'undefined' && !!window.pokeEscritorio && window.pokeEscritorio.esEscritorio !== false;
  const DEF = { quality: 'auto', dmgNumbers: true, calm: false, fps: false, stick: 1, stickMode: 'fixed', stickV: 2, pad: null, gamepad: true, padRumble: true, aimManual: false,
    hpUnder: true, hudScale: 1, lowHpWarn: true, eco: false, ownFx: 1, hazardHi: false, keys: null,
    padP: null, tipVert: false, pmdTiles: true, ultra3d: true, maxPick: 'ask', shareStats: true, anim: true, pixSmooth: null, zoom: 1, fpsCap: 60, glDraw: false };
  let s = Object.assign({}, DEF);
  try {
    const old = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Hasta el 23-10-2026 el joystick era flotante de serie (y se guardaba con los demás
    // ajustes aunque nadie lo eligiera): pasa a fijo una vez; quien quiera, vuelve a cambiarlo.
    if (!old.stickV) { old.stickMode = 'fixed'; old.stickV = 2; }
    // (12-11-2026) En la app de Windows, la primera vez, calidad Máxima (después manda lo que elijas en Ajustes).
    const first = DESK && !old.qDesk;
    if (first) { old.qDesk = 1; if (!old.quality || old.quality === 'auto') old.quality = 'max'; }
    Object.assign(s, old);
    if (first) localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* nada */ }
  const fns = new Set();

  // Calidad automática: empieza alta (media en móvil) y baja si va a tirones.
  const touchy = matchMedia('(pointer: coarse)').matches;
  let autoLevel = touchy ? 1 : 2;
  let acc = 0, frames = 0, slowT = 0, fastT = 0;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* nada */ } }
  function get(k) { return s[k]; }
  function set(k, v) { s[k] = v; save(); fns.forEach(fn => { try { fn(k, v); } catch (e) { /* nada */ } }); }

  /** Lo llama el bucle del juego en cada fotograma (sólo durante la partida). */
  function sample(dt) {
    if (s.quality !== 'auto' || dt <= 0) return;
    acc += dt; frames++;
    if (acc < 1) return;
    const fps = frames / acc;
    acc = 0; frames = 0;
    // 3 s seguidos por debajo de 45 FPS: baja un nivel; 8 s por encima de 57: sube.
    if (fps < 45) { slowT++; fastT = 0; } else if (fps > 57) { fastT++; slowT = 0; } else { slowT = fastT = 0; }
    if (slowT >= 3 && autoLevel > 0) { autoLevel--; slowT = 0; }
    if (fastT >= 8 && autoLevel < (touchy ? 1 : 2)) { autoLevel++; fastT = 0; }
  }

  return {
    get, set, sample, DEF,
    on(fn) { fns.add(fn); },
    get all() { return Object.assign({}, s); },
    get fx() { return s.quality === 'auto' ? autoLevel : s.quality === 'high' || s.quality === 'ultra' || s.quality === 'max' ? 2 : s.quality === 'mid' ? 1 : 0; },
    /** Mapa en 2,5D (calidad Ultra, y también Máxima). */
    get ultra() { return s.quality === 'ultra' || s.quality === 'max'; },
    /** Calidad Máxima (escritorio): más resolución, antialias, sombras finas, bloom y más partículas. */
    get max() { return s.quality === 'max'; },
    /** ¿Va en la app de Windows? */
    get desk() { return DESK; },
    get autoLevel() { return autoLevel; },
    get touch() { return touchy; }
  };
})();
