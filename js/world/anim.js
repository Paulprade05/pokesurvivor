/* ============ anim.js — el reloj de las animaciones del mundo ============
 * (Arte animado, 05-11-2026) Todo lo decorativo se mueve con este reloj compartido, así que animar mil cosas cuesta lo
 * mismo que animar una: cada objeto sólo elige un fotograma ya hecho (una cuenta de enteros) y lo dibuja con drawImage.
 * Nada calcula su propio seno ni repinta píxeles al dibujar.
 *
 *   G.Anim.on            interruptor «Animaciones» de Ajustes (settings.js, de serie encendido). Apagado: todo a su
 *                        fotograma 0, sin calcular ni repintar nada; lo que informa de un ataque no pasa por aquí
 *   G.Anim.frame(now)    una vez por fotograma dibujado (world.js, drawGround)
 *   G.Anim.wind(x, y)    fotograma 0..7 del viento en ese punto: una ola que cruza el campo, con rachas
 *   G.Anim.tick(n, fps, seed)  fotograma 0..n-1 de un ciclo fijo (n potencia de 2), con desfase por objeto
 *   G.Anim.take()        permiso para pintar un fotograma nuevo: como mucho dos por fotograma dibujado, así las hojas
 *                        se van llenando sin tirones (mientras, se ve el fotograma 0)
 *   G.Anim.sway(...) / G.Anim.sheen(...)  pintan fotogramas nuevos a partir de un dibujo quieto
 */
G.Anim = (() => {
  let on = G.Settings.get('anim') !== false;
  const mark = () => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('no-anim', !on); };   // (css/style.css)
  mark();
  G.Settings.on((k, v) => { if (k === 'anim') { on = v !== false; mark(); } });
  let ph = 0, last = 0, now = 0, dt = 0, budget = 2, gust = 0.5, force = 0;
  const TAU = Math.PI * 2;

  function frame(ms) {
    dt = Math.min(0.1, Math.max(0, (ms - last) / 1000));
    last = ms; now = ms / 1000;
    budget = 2;
    if (!on) return;
    // Viento flojo con rachas lentas; con lluvia, arena o nieve sopla más (force, ambient.js).
    gust = 0.5 + 0.5 * Math.sin(now * 0.31) * Math.sin(now * 0.127 + 1.3);
    ph += dt * (3 + gust * 5 + force * 6);
  }
  /** 0..1: lo que se suma al viento por el clima. */
  function setForce(k) { force = k; }

  // La ola entra por el oeste y un poco por el norte: casillas vecinas, fotogramas seguidos.
  const wind = (x, y) => on ? ((ph - x * 0.0125 - y * 0.0075) | 0) & 7 : 0;
  const tick = (n, fps, seed = 0) => on ? ((now * fps + seed) | 0) & (n - 1) : 0;
  const take = () => budget > 0 && (budget--, true);

  /**
   * Una hoja movida por el viento: cada píxel se desplaza según lo lejos que está del centro (cx, cy), así el centro se
   * queda y lo de fuera se mueve: las hojas, no el dibujo entero. f/n: fase del ciclo. shadow: lo que va debajo y no se
   * mueve (la sombra en el suelo). Devuelve un lienzo, o null sin memoria.
   */
  function sway(src, f, n, cx, cy, amp, shadow = null) {
    const w = src.width, h = src.height, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    if (shadow) g.drawImage(shadow, 0, 0);
    let a;
    try { a = src.getContext('2d').getImageData(0, 0, w, h); } catch (e) { g.drawImage(src, 0, 0); return cv; }   // (file://: quieto)
    const top = g.createImageData(w, h), s32 = new Uint32Array(a.data.buffer), d32 = new Uint32Array(top.data.buffer);
    const ph = f / n * TAU, R = Math.max(cx, cy, 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = Math.min(1, Math.hypot(x - cx, y - cy) / R), k = r * r * amp;
      const sx = x - Math.round(k * Math.sin(ph + y * 0.55 + x * 0.17));
      const sy = y - Math.round(k * 0.55 * Math.cos(ph * 2 + x * 0.6));
      if (sx >= 0 && sy >= 0 && sx < w && sy < h) d32[y * w + x] = s32[sy * w + sx];
    }
    // putImageData pisa lo de debajo: se pasa por otro lienzo para no borrar la sombra.
    const t = document.createElement('canvas');
    t.width = w; t.height = h;
    const c = t.getContext('2d');
    if (c) { c.putImageData(top, 0, 0); g.drawImage(t, 0, 0); }
    G.U.freeCanvas(t);
    return cv;
  }

  /** Un brillo que recorre lo claro del dibujo: en diagonal (cristales) o latiendo desde el centro (ascuas). */
  function sheen(src, f, n, radial = false, shadow = null) {
    const w = src.width, h = src.height, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    // (Rendimiento, 13-11-2026) Se lee: en la memoria normal, para no esperar a la GPU (ver tileset.js RD).
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) { G.U.freeCanvas(cv); return null; }
    if (shadow) g.drawImage(shadow, 0, 0);
    g.drawImage(src, 0, 0);
    let a;
    try { a = g.getImageData(0, 0, w, h); } catch (e) { return cv; }
    const b = a.data, u = f / n;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (b[i + 3] < 200) continue;
      const lum = b[i] * 0.3 + b[i + 1] * 0.59 + b[i + 2] * 0.11;
      if (lum < 70) continue;
      const q = radial ? Math.hypot(x - w / 2, y - h / 2) / (w * 0.6) : (x + y) / (w + h);
      let e = Math.abs(((q - u) % 1 + 1) % 1 - 0.5) * 2;       // 1 en la cresta de la onda
      e = e > 0.78 ? 2 : e > 0.6 ? 1 : 0;                      // a escalones: nada de degradados
      if (!e) continue;
      const k = e * 26;
      b[i] = Math.min(255, b[i] + k); b[i + 1] = Math.min(255, b[i + 1] + k); b[i + 2] = Math.min(255, b[i + 2] + k * 0.8);
    }
    g.putImageData(a, 0, 0);
    return cv;
  }

  return { frame, wind, tick, take, sway, sheen, setForce, get on() { return on; }, get now() { return now; }, get dt() { return dt; }, get gust() { return gust; } };
})();
