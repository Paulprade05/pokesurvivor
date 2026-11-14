/* ============ i18n.js — traducción desde textos españoles ============
 * El juego está escrito en español. El inglés traduce el texto con su
 * diccionario js/data/lang-en.js, sin tener que tocar cada pantalla:
 *   - el DOM (menús, cartas, avisos...) con un MutationObserver,
 *   - el canvas (HUD, avisos, números) envolviendo fillText/strokeText,
 *   - confirm()/alert().
 *
 * El diccionario usa el texto español como clave. Tres niveles:
 *   1. frase exacta                    'Volver' -> 'Back'
 *   2. patrón con huecos {x}           '¡Has conseguido a {x} shiny!' -> 'You got a shiny {x}!'
 *                                      (lo que cae en el hueco también se traduce)
 *   3. trozos dentro de un texto más largo, sólo palabras enteras
 * Lo que escriben los jugadores (apodos) va marcado con translate="no".
 *
 * Idioma: el elegido en Ajustes; si no, /en/ en la dirección o el del navegador
 * La selección compartida con la pantalla de carga está en locales.js.
 * add(dict, idioma) sólo carga el idioma activo. Los IDs no se traducen.
 * {name} conserva el apodo del jugador sin traducirlo; {x} traduce su contenido.
 */
G.I18n = (() => {
  const KEY = 'ps.lang';
  const { choices, lang, locale } = window.PS_LOCALES;
  const supported = choices.map(([id]) => id);

  const main = { exact: new Map(), exactLow: new Map(), patterns: [] };
  let frag = null, fragDirty = false;
  const fragMap = new Map();
  const cache = new Map();
  const nameTemplates = new Set([
    'Faltan por elegir: {x}', 'Esperando a {x}…', '{x} ha dejado la partida',
    '¡{x} necesita ayuda! · {x} m', 'Tu apodo es {x}', '¿Quitar a {x} de tus amigos?',
    'Solicitud enviada a {x}', 'Ahora eres amigo de {x}',
    'Estás en la sala de {x}. El anfitrión empezará la partida.', 'Invitación enviada a {x}',
    '{x} te invita a jugar en su sala', 'Pausa: {x} está eligiendo…',
    'Pausa: {x} están eligiendo…', 'Pausa: esperando a {x} (anfitrión)…',
    '¿Reportar la marca de {x} como trampa?'
  ]);
  const L = '\\p{L}\\p{N}';
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Añade traducciones { 'texto en español': 'traducción' } de un idioma. */
  function add(dict, language = 'en') {
    if (language !== lang) return;
    let sort = false;
    for (const [es, en] of Object.entries(dict)) {
      if (!en) continue;
      if (/\{(?:x|name)\}/.test(es)) {
        const slots = es.match(/\{(?:x|name)\}/g);
        const key = es.replace(/\{name\}/g, '{x}');
        if (nameTemplates.has(key)) slots[0] = '{name}';
        const parts = es.split(/\{(?:x|name)\}/).map(reEsc);
        const i = main.patterns.findIndex(p => p.key === key);
        if (i >= 0) main.patterns.splice(i, 1);
        main.patterns.push({ key, weight: parts.join('').length, re: new RegExp('^' + parts.join('(.+?)') + '$', 'u'), reI: new RegExp('^' + parts.join('(.+?)') + '$', 'iu'), en, slots });
        sort = true;
      } else {
        main.exact.set(es, en);
        main.exactLow.set(es.toLowerCase(), en);
        if (es.length >= 4 || /\s/.test(es)) {
          fragMap.set(es.toLowerCase(), en);
          fragDirty = true;
        }
      }
    }
    // Specific templates must precede catch-alls such as "{x}).".
    if (sort) main.patterns.sort((a, b) => b.weight - a.weight);
    cache.clear();
  }

  // Una sola expresión con todos los trozos (los más largos primero), sólo palabras enteras.
  // Se monta al usarla, no en cada add.
  function fragRe() {
    if (fragDirty) {
      fragDirty = false;
      const all = [...fragMap.keys()].sort((a, b) => b.length - a.length).map(reEsc).join('|');
      frag = all ? new RegExp(`(?<![${L}])(${all})(?![${L}])`, 'giu') : null;
    }
    return frag;
  }

  function keepCase(src, en) {
    if (src === src.toUpperCase() && /\p{L}/u.test(src)) return en.toUpperCase();
    return en;
  }

  /** Traduce un texto (sin espacios de los lados) al idioma actual. */
  function t(s) {
    if (lang === 'es' || !s || typeof s !== 'string') return s;
    if (!/\p{L}/u.test(s)) return s;
    const c = cache.get(s);
    if (c !== undefined) return c;
    let r = core(s);
    if (cache.size > 4000) cache.clear();
    cache.set(s, r);
    return r;
  }

  function core(s) {
    // Respeta los espacios de alrededor (nodos de texto del DOM).
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    // Los textos del HTML pueden ocupar varias líneas: se comparan con los espacios juntos.
    const lead = m[1], tail = m[3], body = m[2].replace(/\s+/g, ' ');
    if (!body) return s;
    const upper = body === body.toUpperCase() && /\p{L}/u.test(body);
    let r = whole(body, upper);
    if (r === undefined && fragRe()) {
      r = body.replace(frag, w => keepCase(w, fragMap.get(w.toLowerCase()) || w));
    }
    return lead + (r === undefined ? body : r) + tail;
  }

  /** Frase exacta o patrón con huecos (undefined si no está). */
  function whole(body, upper) {
    let r = main.exact.get(body);
    if (r === undefined && upper) { const e = main.exactLow.get(body.toLowerCase()); if (e !== undefined) r = keepCase(body, e); }
    if (r !== undefined) return r;
    for (const p of main.patterns) {
      const mm = (upper ? p.reI : p.re).exec(body);
      if (!mm) continue;
      let i = 1;
      r = p.en.replace(/\{(?:x|name)\}/g, () => {
        const slot = p.slots[i - 1], g = mm[i++];
        return g === undefined ? '' : slot === '{name}' ? g : core(g);
      });
      return keepCase(body, r);
    }
    return undefined;
  }

  /** Texto con huecos para el código: T('Nivel {x}', 5). */
  function f(es, ...vals) { let i = 0; return t(es).replace(/\{(?:x|name)\}/g, () => vals[i++]); }

  // ---------------- DOM ----------------
  const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
  const skipEl = el => !!(el && el.closest && el.closest('[translate="no"], script, style, code'));

  function doText(n) {
    const p = n.parentElement;
    if (!p || skipEl(p)) return;
    const v = n.nodeValue;
    if (n.__tr === v) return;
    const r = t(v);
    n.__tr = r;
    if (r !== v) n.nodeValue = r;
  }
  function doEl(el) {
    if (skipEl(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) { const r = t(v); if (r !== v) el.setAttribute(a, r); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skipEl(root)) return;
    doEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }

  function startDom() {
    document.title = t('PokéSurvivor – Juego Pokémon gratis online estilo Survivor.io');
    if (lang === 'es') return;
    // Los enlaces a las páginas de la web, a su versión en inglés.
    const EN_LINKS = { 'guia/': 'en/guide/', 'pokedex/': 'en/pokedex/' };
    document.querySelectorAll('a[href]').forEach(a => { const h = a.getAttribute('href'); if (lang === 'en' && EN_LINKS[h]) a.setAttribute('href', EN_LINKS[h]); });
    walk(document.body);
    new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doEl(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // ---------------- canvas y ventanas del navegador ----------------
  const P = CanvasRenderingContext2D.prototype;
  const canvasText = Object.fromEntries(['fillText', 'strokeText', 'measureText'].map(k => [k, P[k]]));
  function rawCanvas(ctx, method, text, ...args) {
    if (ctx && ctx.__gl2d) return ctx.raw(method, text, ...args);      // (motor WebGL2, core/gl2d.js: lo pinta su lienzo 2D de respaldo)
    return canvasText[method].call(ctx, text, ...args);
  }
  if (lang !== 'es') {
    for (const k of ['fillText', 'strokeText', 'measureText']) {
      const orig = P[k];
      P[k] = function (s, ...a) { return orig.call(this, typeof s === 'string' ? t(s) : s, ...a); };
    }
    const oc = window.confirm, oa = window.alert;
    window.confirm = s => oc.call(window, t(s));
    window.alert = s => oa.call(window, t(s));
  }

  function set(l) {
    if (!supported.includes(l)) return;
    // Cambiar de idioma recarga la página: en plena partida (Ajustes desde la
    // pausa) se perdía la run entera. Se cambia al acabarla.
    const game = G.Game, s = game && game.state;
    if (s && s !== 'ui' && s !== 'over') { if (G.UI) G.UI.toast('Cambia el idioma al acabar la partida', 3000); return; }
    try { localStorage.setItem(KEY, l); } catch (e) { /* nada */ }
    if (game && game.allowLeave) game.allowLeave();
    location.reload();
  }

  return { choices, lang, locale, add, t, f, set, startDom, walk, rawCanvas };
})();
G.T = G.I18n.t;
