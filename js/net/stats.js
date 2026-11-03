/* ============ stats.js — resumen anónimo de cada partida en la nube (03-11-2026) ============
 * El dueño eligió (opción B) juntar en Firestore un resumen de las partidas de todos los
 * jugadores para estudiarlas. Al acabar una partida (core/registro.js, finish) se sube a
 * stats/{id al azar} un resumen de ~1-2 KB SIN nombre ni cuenta: versión, modo, aparato
 * general, Pokémon, duración, nivel, daño y lo de cada ataque, quién te pega y te derrota,
 * de dónde te curas, cartas, jefes y FPS (brief()).
 *
 * Cuándo: sólo con cuenta iniciada (las reglas lo piden), el ajuste «shareStats» activado
 * (Ajustes › Cuenta; de serie, sí), la versión publicada (no dev.html) y partidas de 30 s o más.
 * Una por partida; si no se pudo (sin conexión), la siguiente vez se sube la que quedó.
 * Tope en las reglas (firestore.rules, statsq/{uid}): una cada 25 s por cuenta, con la hora
 * en otro documento para que el resumen no lleve la cuenta. Spark: 2 escrituras y 1 lectura
 * por partida.
 *
 * El dueño (admin) las descarga todas desde el Historial de partidas (download): el archivo
 * lo lee tools/analizar-partidas.cjs igual que el de las partidas locales.
 */
G.RegCloud = (() => {
  const MIN_DUR = 30, FMT = 1, RETRY_MS = 30000;
  const ADMINS = ['rshaa5gKD3fXw6lE4PPXITbowaG2'];      // (el de firestore.rules, admin(), y ranking.js)
  const fbx = () => (G.DB && G.DB.online ? G.DB.fb : null);
  const isAdmin = () => !!fbx() && ADMINS.includes(fbx().uid);
  const n = v => Math.round(v || 0);

  /** ¿Se puede y se quiere subir esta partida? */
  function wants(r) {
    return !!r && r.ver && r.ver !== 'dev' && (r.dur || 0) >= MIN_DUR && r.state !== 'jugando' && !r.cloud &&
           !!fbx() && G.Settings.get('shareStats') !== false;
  }

  /** Lo que se sube: sin nombre, apodo ni cuenta. (Firestore no deja listas dentro de listas: mapas.) */
  function brief(r) {
    const fi = (r.tlKeys || []).indexOf('fps');
    const f = fi < 0 ? [] : (r.tl || []).map(x => x[fi]).filter(v => v > 0).sort((a, b) => a - b);
    const top = (o, k, val) => Object.fromEntries(Object.entries(o || {}).sort((a, b) => val(b[1]) - val(a[1])).slice(0, k).map(([key, v]) => [key, n(val(v))]));
    const moves = {};
    for (const [id, m] of Object.entries(r.moves || {}).filter(([, m]) => m.dealt != null).sort((a, b) => b[1].dealt - a[1].dealt).slice(0, 10)) {
      moves[id] = { d: n(m.dealt), b: n(m.boss), k: n(m.kills), h: n(m.hits), l: n(m.lvl), e: m.evolved ? 1 : 0, g: n(m.got),
                    a: n(m.active), ...(m.evo != null ? { et: n(m.evo) } : {}), ...(m.group ? { f: 1 } : {}) };
    }
    const cards = {};
    for (const c of r.cards || []) {
      for (const k of c.o || []) (cards[k] || (cards[k] = [0, 0]))[0]++;
      if (c.p) (cards[c.p] || (cards[c.p] = [0, 0]))[1]++;
    }
    const cardTop = Object.fromEntries(Object.entries(cards).sort((a, b) => b[1][0] - a[1][0]).slice(0, 40));
    const d = r.dev || {}, dn = r.downs || [], last = dn[dn.length - 1];
    return {
      v: FMT, ver: String(r.ver).slice(0, 16), mode: r.mode === 'grupo' ? 'grupo' : 'solo', pl: n(r.players) || 1, st: String(r.state || ''),
      dur: n(r.dur), dex: n(r.mon && r.mon.dex), form: n(r.form), abil: String((r.mon && r.mon.abil) || ''), nat: String((r.mon && r.mon.nat) || ''),
      lvl: n(r.lvl), kills: n(r.kills), coins: n(r.coins), dealt: n(r.dealt), taken: n(r.taken), healed: n(r.healed),
      downs: dn.length, killer: last ? String(last.by) : '', killT: last ? n(last.t) : -1,
      kinds: Object.assign({ h: 0, b: 0, l: 0, a: 0 }, r.kinds || {}),
      dev: { mob: d.mob ? 1 : 0, touch: d.touch ? 1 : 0, w: n(d.w), h: n(d.h), q: String(d.q || ''), lang: String(d.lang || ''), pwa: d.pwa ? 1 : 0 },
      fps: f.length ? { m: n(f.reduce((a, b) => a + b, 0) / f.length), p10: n(f[Math.floor(f.length * 0.1)]) } : { m: 0, p10: 0 },
      upg: Object.fromEntries(Object.entries(r.upg || {}).filter(([, v]) => typeof v === 'number').slice(0, 30)),
      moves, tk: top(Object.fromEntries(Object.entries(r.takenBy || {}).map(([k, v]) => [k, v[0]])), 8, v => v),
      hb: top(r.healBy, 6, v => v), cards: cardTop,
      bosses: (r.bosses || []).slice(0, 15).map(b => ({ k: String(b.k), t: n(b.t), kt: b.kt != null ? n(b.kt) : -1 }))
    };
  }

  /** Sube una partida (resumen). Devuelve true si ha subido. */
  async function upload(r) {
    if (!wants(r)) return false;
    const fb = fbx(), ts = firebase.firestore.FieldValue.serverTimestamp();
    const b = fb.fs.batch();
    b.set(fb.fs.collection('stats').doc(), Object.assign(brief(r), { at: ts }));
    b.set(fb.fs.collection('statsq').doc(fb.uid), { at: ts });
    await b.commit();
    return true;
  }

  let retryT = 0;
  /** Al acabar una partida (registro.js): la sube y, si ha ido bien, al rato otra que quedara sin subir. */
  function finished(r) {
    if (!wants(r)) return;
    upload(r).then(ok => {
      if (!ok) return;
      r.cloud = 1;
      G.Reg.resave(r);
      clearTimeout(retryT);
      retryT = setTimeout(pending, RETRY_MS);
    }).catch(e => console.warn('[Resumen] no se ha podido subir:', e && e.code || e));
  }
  /** La última que quedó sin subir (de los 3 últimos días), una sola. */
  async function pending() {
    if (!fbx() || G.Settings.get('shareStats') === false) return;
    try {
      const list = await G.Reg.list();
      const s = list.find(x => !x.cloud && x.ver && x.ver !== 'dev' && x.dur >= MIN_DUR && x.state !== 'jugando' && Date.now() - x.id < 3 * 864e5);
      if (!s) return;
      const r = await G.Reg.get(s.id);
      if (r && await upload(r)) { r.cloud = 1; G.Reg.resave(r); }
    } catch (e) { console.warn('[Resumen] pendiente sin subir:', e && e.code || e); }
  }

  /** (Dueño) Todas las de la nube, de la más nueva a la más vieja, en un .json. max: cuántas (1 lectura cada una). */
  async function download(max = 5000) {
    if (!isAdmin()) throw new Error('sólo el dueño');
    const fs = fbx().fs, out = [];
    let q = fs.collection('stats').orderBy('at', 'desc').limit(500), snap;
    while (out.length < max && !(snap = await q.get()).empty) {
      for (const d of snap.docs) { const x = d.data(); out.push(Object.assign(x, { id: d.id, at: x.at && x.at.toMillis ? x.at.toMillis() : 0 })); }
      if (snap.size < 500) break;
      q = fs.collection('stats').orderBy('at', 'desc').startAfter(snap.docs[snap.docs.length - 1]).limit(500);
    }
    const data = { app: 'PokéSurvivor', fmt: 'ps-resumenes', v: FMT, exported: new Date().toISOString(), runs: out.slice(0, max) };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'pokesurvivor-resumenes-' + new Date().toISOString().slice(0, 10) + '.json'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return data.runs.length;
  }

  return { brief, wants, upload, finished, pending, download, isAdmin, MIN_DUR };
})();
