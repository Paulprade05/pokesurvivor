/* ============ settings.js — ajustes de este dispositivo ============
 * Se guardan en el navegador (no en la cuenta): cada PC o móvil tiene los
 * suyos. El volumen lo guarda audio.js aparte.
 *
 *   quality     'auto' | 'ultra' | 'high' | 'mid' | 'low'   efectos y partículas; 'ultra' es 'high' y
 *               además el mapa en 2,5D como los juegos de DS (world.js). Auto nunca lo elige.
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
 *
 *   G.Settings.get('quality')  ·  G.Settings.set('fps', true)  ·  G.Settings.on(fn)
 *   G.Settings.fx   nivel efectivo 0 (bajo) .. 2 (alto), ya resuelto el 'auto'
 */
G.Settings = (() => {
  const KEY = 'ps.settings';
  const DEF = { quality: 'auto', dmgNumbers: true, calm: false, fps: false, stick: 1, stickMode: 'fixed', stickV: 2, pad: null, gamepad: true, padRumble: true, aimManual: false,
    hpUnder: true, hudScale: 1, lowHpWarn: true, eco: false, ownFx: 1, hazardHi: false, keys: null,
    padP: null, tipVert: false };
  let s = Object.assign({}, DEF);
  try {
    const old = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Hasta el 23-10-2026 el joystick era flotante de serie (y se guardaba con los demás
    // ajustes aunque nadie lo eligiera): pasa a fijo una vez; quien quiera, vuelve a cambiarlo.
    if (!old.stickV) { old.stickMode = 'fixed'; old.stickV = 2; }
    Object.assign(s, old);
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
    get fx() { return s.quality === 'auto' ? autoLevel : s.quality === 'high' || s.quality === 'ultra' ? 2 : s.quality === 'mid' ? 1 : 0; },
    /** Mapa en 2,5D (calidad Ultra). */
    get ultra() { return s.quality === 'ultra'; },
    get autoLevel() { return autoLevel; },
    get touch() { return touchy; }
  };
})();
