/* ============ pixfilter.js — filtro opcional «Pokémon más nítidos» (escalador de pixel art) ============
 * Pedido del dueño (12-11-2026): «mete algún filtro para que los píxeles de los Pokémon se vean mejor, que se vea más
 * nítido, que se pueda activar y desactivar en gráficos, para que pasen a verse menos pixelados pero sin cambiar su
 * esencia mucho». Apagado, los sprites se dibujan como siempre: pixel art crudo. De serie (pixSmooth null) va encendido
 * sólo con la calidad Máxima (la app de Windows la elige sola; decisión del dueño, 13-11-2026) y apagado con las demás;
 * si lo tocas en Ajustes, manda lo que elijas.
 *
 * Encendido, cada fotograma de un sprite se amplía con un escalador hecho para pixel art (sin desenfocar): redondea las
 * diagonales y las curvas mirando a los vecinos de cada píxel y copiando colores que ya están, nunca inventa tonos.
 * Se probaron tres (capturas en docs/2.0-ESTADO.md, «Pokémon más nítidos»):
 *   - Scale2x / EPX (×2): el más fiel; cambia poco, se nota en las diagonales del contorno.
 *   - Scale3x / AdvMAME3x (×3): redondea algo más y respeta las líneas de 1 px. ← el elegido.
 *   - Scale4x (Scale2x dos veces): lo más redondo, pero las caras y los ojos empiezan a cambiar (pierde esencia).
 * El resultado se dibuja suavizado a su tamaño (ya no son cuadrados de 1 px de arte, así que no hay dientes).
 *
 * Coste: sólo los fotogramas que se dibujan, uno a uno y la primera vez (unos 0,05-0,2 ms cada uno), con tope por
 * fotograma (los que no caben, ese fotograma salen sin filtro) y una caché con tope de memoria que suelta lo más viejo
 * (PC 48 MB; móvil 12 MB y ×2 en vez de ×3). Sin memoria de lienzos (iPhone), se suelta todo y sigue sin filtro.
 * En móvil (variante barata): sólo tu Pokémon, los compañeros, los jefes y los menús, no la horda (enemy.js noPix):
 * medido en WebKit con una oleada, filtrar a todos costaba ~6 ms por fotograma (~3 ms por fotograma nuevo).
 * La aldea (WebGL) usa lo mismo en su shader (village3d.js EPX_GLSL), sin memoria de más.
 *
 *   G.PixFilter.on            ¿encendido? (Ajustes › Gráficos «Pokémon más nítidos», 'pixSmooth')
 *   G.PixFilter.frame(img, sx, sy, w, h) → { c: lienzo, k: escala } o null (aún no / apagado)
 *   G.PixFilter.purge() · stats()
 */
G.PixFilter = (() => {
  const mobile = () => !!(G.U.IOS || (G.Settings && G.Settings.touch));
  const MAXB = () => (mobile() ? 12 : 48) * 1048576;
  const ids = new WeakMap();
  let nextId = 1;
  const cache = new Map();                  // "id|sx|sy|w|h|algo" -> { c, k } (el último usado, al final)
  let bytes = 0, budget = 0, frameMark = -1, failUntil = 0, made = 0, ms = 0;
  let algo = null;                          // (para comparar en las pruebas: 'epx2' | 'adv3' | 'epx4'; null: el de serie)

  // Clave de color: transparente (alfa < 128) es un solo «color»; si no, el RGB.
  function keys(d, n) {
    const k = new Int32Array(n);
    for (let i = 0; i < n; i++) { const o = i * 4; k[i] = d[o + 3] < 128 ? -1 : (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]; }
    return k;
  }

  /** Scale2x / EPX. src: Uint8ClampedArray w×h → w2×h2. */
  function epx(src, w, h) {
    const K = keys(src, w * h), W = w * 2, out = new Uint8ClampedArray(W * h * 2 * 4);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? -1 : K[y * w + x];
    const put = (ox, oy, sx, sy) => { const s = (sy * w + sx) * 4, o = (oy * W + ox) * 4; out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3]; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      const ox = x * 2, oy = y * 2;
      // (Cada sub-píxel copia un vecino que ya existe, nunca un color nuevo: arriba, A; abajo, D.)
      const up = C === A && C !== D && A !== B, ur = A === B && A !== C && B !== D, dl = D === C && D !== B && C !== A, dr = B === D && B !== A && D !== C;
      put(ox, oy, x, up ? y - 1 : y);
      put(ox + 1, oy, x, ur ? y - 1 : y);
      put(ox, oy + 1, x, dl ? y + 1 : y);
      put(ox + 1, oy + 1, x, dr ? y + 1 : y);
    }
    return out;
  }

  /** Scale3x / AdvMAME3x. */
  function adv3(src, w, h) {
    const K = keys(src, w * h), W = w * 3, out = new Uint8ClampedArray(W * h * 3 * 4);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? -1 : K[y * w + x];
    const cp = (ox, oy, sx, sy) => {
      const o = (oy * W + ox) * 4;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) { out[o + 3] = 0; return; }
      const s = (sy * w + sx) * 4; out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = src[s + 3];
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const A = at(x - 1, y - 1), B = at(x, y - 1), C = at(x + 1, y - 1), D = at(x - 1, y), E = at(x, y), F = at(x + 1, y),
        G2 = at(x - 1, y + 1), H = at(x, y + 1), I = at(x + 1, y + 1), ox = x * 3, oy = y * 3;
      // [sub-píxel] → de qué vecino toma el color (dx, dy), o el centro.
      const dB = D === B && B !== F && D !== H, bF = B === F && B !== D && F !== H, dH = D === H && D !== B && H !== F, hF = H === F && D !== H && B !== F;
      cp(ox, oy, dB ? x - 1 : x, y);
      cp(ox + 1, oy, x, (dB && E !== C) || (bF && E !== A) ? y - 1 : y);
      cp(ox + 2, oy, bF ? x + 1 : x, y);
      cp(ox, oy + 1, (dB && E !== G2) || (dH && E !== A) ? x - 1 : x, y);
      cp(ox + 1, oy + 1, x, y);
      cp(ox + 2, oy + 1, (bF && E !== I) || (hF && E !== C) ? x + 1 : x, y);
      cp(ox, oy + 2, dH ? x - 1 : x, y);
      cp(ox + 1, oy + 2, x, (dH && E !== I) || (hF && E !== G2) ? y + 1 : y);
      cp(ox + 2, oy + 2, hF ? x + 1 : x, y);
    }
    return out;
  }

  const ALGO = () => algo || (mobile() ? 'epx2' : 'adv3');
  const SCALE = { epx2: 2, adv3: 3, epx4: 4 };

  function run(name, d, w, h) {
    if (name === 'epx2') return epx(d, w, h);
    if (name === 'adv3') return adv3(d, w, h);
    return epx(epx(d, w, h), w * 2, h * 2);
  }

  let tmp = null, tx = null;
  /** El fotograma (sx, sy, w, h) de img, ampliado. null: apagado, aún no (tope de este fotograma) o sin memoria. */
  function frame(img, sx, sy, w, h) {
    if (!on() || !img || w <= 0 || h <= 0) return null;
    let id = ids.get(img);
    if (!id) { id = nextId++; ids.set(img, id); }
    const name = ALGO(), key = id + '|' + sx + '|' + sy + '|' + w + '|' + h + '|' + name;
    let e = cache.get(key);
    if (e) { cache.delete(key); cache.set(key, e); return e; }
    // Tope por fotograma de la pantalla: los que no caben, sin filtro este fotograma (no hay tirones).
    // (Por tiempo y no por fotograma del juego: también vale en las cartas, la Pokédex o el gacha.)
    const f = performance.now();
    if (f - frameMark > 12) { frameMark = f; budget = mobile() ? 1 : 18; }
    if (budget <= 0 || Date.now() < failUntil) return null;
    budget--;
    const t0 = performance.now();
    try {
      if (!tmp) { tmp = document.createElement('canvas'); tx = tmp.getContext('2d', { willReadFrequently: true }); }
      if (!tx) throw Error('sin lienzo');
      if (tmp.width < w || tmp.height < h) { tmp.width = Math.max(tmp.width, w); tmp.height = Math.max(tmp.height, h); }
      tx.clearRect(0, 0, w, h);
      tx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
      const src = tx.getImageData(0, 0, w, h).data, k = SCALE[name], data = run(name, src, w, h);
      const c = document.createElement('canvas');
      c.width = w * k; c.height = h * k;
      const g = c.getContext('2d');
      if (!g) throw Error('sin lienzo');
      g.putImageData(new ImageData(data, w * k, h * k), 0, 0);
      e = { c, k };
    } catch (err) {
      // (iPhone: sin memoria de lienzos) Se suelta todo y un rato sin filtro.
      purge(); failUntil = Date.now() + 3000; return null;
    }
    cache.set(key, e); bytes += e.c.width * e.c.height * 4; made++; ms += performance.now() - t0;
    while (bytes > MAXB() && cache.size > 1) {
      const [ok, oe] = cache.entries().next().value;
      cache.delete(ok); bytes -= oe.c.width * oe.c.height * 4; G.U.freeCanvas(oe.c);
    }
    return e;
  }

  /**
   * Vista previa de Ajustes: el mismo Pokémon sin filtro (izquierda) y con él (derecha), en un lienzo pequeño. Se dibuja
   * una vez (cuando la hoja está cargada): no cuesta nada mientras no abras Ajustes.
   */
  function preview(cv, dex, tries = 0) {
    if (!cv || !cv.isConnected) return;
    const s = G.Sprites.sheet(dex, 'Idle'), m = G.Sprites.animMeta(dex, 'Idle');
    if (!s || !m || !s.ready) { if (tries < 20) setTimeout(() => preview(cv, dex, tries + 1), 150); return; }
    const g = cv.getContext('2d');
    if (!g) return;
    const sx = m.x || 0, sy = m.y || 0, W = cv.width / 2;
    try {
      const tc = document.createElement('canvas'); tc.width = m.w; tc.height = m.h;
      const tg = tc.getContext('2d', { willReadFrequently: true });
      tg.drawImage(s.img, sx, sy, m.w, m.h, 0, 0, m.w, m.h);
      const src = tg.getImageData(0, 0, m.w, m.h).data;
      // Lo que ocupa el dibujo (el fotograma lleva margen): así se ve grande.
      let x0 = m.w, y0 = m.h, x1 = 0, y1 = 0;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (src[(y * m.w + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
      if (x1 <= x0) return;
      const bw = x1 - x0, bh = y1 - y0, k = Math.max(1, Math.floor(Math.min((W - 8) / bw, (cv.height - 8) / bh)));
      const ox = (W - bw * k) / 2, oy = (cv.height - bh * k) / 2;
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(tc, x0, y0, bw, bh, ox, oy, bw * k, bh * k);
      const name = ALGO(), K = SCALE[name], data = run(name, src, m.w, m.h);
      const oc = document.createElement('canvas'); oc.width = m.w * K; oc.height = m.h * K;
      oc.getContext('2d').putImageData(new ImageData(data, m.w * K, m.h * K), 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(oc, x0 * K, y0 * K, bw * K, bh * K, W + ox, oy, bw * k, bh * k);
      G.U.freeCanvas(tc); G.U.freeCanvas(oc);
    } catch (e) { /* sin lienzo: sólo la de la izquierda */ }
  }

  function purge() { for (const e of cache.values()) G.U.freeCanvas(e.c); cache.clear(); bytes = 0; }
  const on = () => { if (!G.Settings) return false; const v = G.Settings.get('pixSmooth'); return v == null ? !!G.Settings.max : !!v; };
  if (G.Settings) G.Settings.on(k => { if ((k === 'pixSmooth' || k === 'quality') && !on()) purge(); });

  return { frame, purge, preview, epx, adv3, get on() { return on(); },
    /** Variante barata (móvil): la horda sin filtro. */
    get cheap() { return mobile(); },
    /** Para pruebas y capturas: elige el escalador ('epx2' | 'adv3' | 'epx4' | null). */
    set algo(v) { algo = v || null; purge(); }, get algo() { return ALGO(); },
    stats: () => ({ frames: cache.size, mb: +(bytes / 1048576).toFixed(1), made, msEach: made ? +(ms / made).toFixed(3) : 0, algo: ALGO() }) };
})();
