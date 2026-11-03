/* ============ registro.js — lo que pasa en cada partida (03-11-2026) ============
 * Pedido del dueño: guardar todo lo que se pueda de cada partida para estudiarlas
 * luego y hacer cambios con partidas de verdad. Empieza con Game.startRun (solo o en
 * grupo; grietas, Sentencia, biomas y clima salen como sucesos) y se cierra en endRun.
 *
 * Lo que se apunta (ver build() para el formato):
 *   - versión (huella de app.min.js), modo, semilla, aparato (sólo general: táctil o no,
 *     tamaño de pantalla, calidad gráfica, idioma), Pokémon, habilidad, naturaleza, mejoras
 *   - por ataque: daño (total y contra jefes), golpes, derrotados, s activo, nivel,
 *     cuándo lo aprendiste, evolucionó y se fusionó
 *   - daño recibido por fuente («h:19|toque», «l:150|Psicoataque», «x:lava|lava»:
 *     h horda, b jefe, l legendario, a Arceus, x el terreno; luego el ataque o cómo)
 *   - curación por fuente, caídas (quién, cómo, cuánto), cartas ofrecidas y elegidas,
 *     pasivas, objetos, cofres, altares, jefes vistos y vencidos, sucesos
 *   - una línea cada TL_EVERY s: vida, nivel, DPS, curación/s, daño recibido/s,
 *     enemigos vivos, FPS y derrotados (TL_KEYS)
 *
 * Rendimiento: lo de cada golpe son sumas en objetos que ya existen (hit, taken);
 * nada crea objetos por golpe. Lo demás se mira una vez por segundo.
 *
 * Guardado: IndexedDB (ps-partidas), las MAX últimas. Cada SNAP_EVERY s de partida se
 * guarda cómo va y, al cerrar u ocultar la app, también en localStorage (síncrono):
 * al volver a abrir, la que se quedó a medias sale como «cerrada». A la nube sólo sube
 * un resumen anónimo al acabar (net/stats.js, con cuenta y si no lo has desactivado).
 */
G.Reg = (() => {
  const DB_NAME = 'ps-partidas', RUNS = 'runs', SUMS = 'sums', MAX = 500;
  const TL_EVERY = 10, SNAP_EVERY = 30;
  const TL_KEYS = ['t', 'hp', 'maxHp', 'lv', 'dps', 'hps', 'tps', 'enem', 'fps', 'kills', 'zona'];
  const LAST = 'ps.reg.last';
  const FMT = 1;

  let cur = null;          // partida en curso (lo que no cambia y los sucesos)
  let P = null;            // tu Pokémon (los demás no cuentan aquí)
  // Por ataque (clave: id del movimiento; '~' = el mismo, golpes de segunda): golpes, daño a jefes, derrotados, s activo.
  let H, B, K, A;
  let taken, healBy, sec = 0, tlAcc = 0, snapAcc = 0, frames = 0, realAcc = 0, realLast = 0, now = 0;
  let last = null;         // para la línea de tiempo: lo de la línea anterior
  let seen = null;         // lo que se mira cada segundo (para ver qué ha cambiado)
  let offer = null;        // cartas a la vista
  let lastHit = null;      // el último golpe que te dieron (la caída)

  // ---------------- claves ----------------
  /** Clave de quien te pega: «h:19» (horda), «b:6» (jefe), «l:150» (legendario), «a:493» (Arceus) o el texto tal cual. */
  function who(src) {
    if (!src) return '?';
    if (typeof src === 'string') return src;
    return src._rk || (src._rk = (src.judge ? 'a' : src.legend ? 'l' : src.boss ? 'b' : 'h') + ':' + src.dex);
  }
  /** El ataque que está lanzando un enemigo ahora (firma de jefe: su nombre), o ''. */
  function castOf(e) {
    const c = e && e.ai && e.ai.cast;
    return !c ? '' : c.id === 'sig' && c.s ? c.s.name || 'firma' : c.id || '';
  }

  // ---------------- empezar ----------------
  function version() {
    try {
      const tag = document.querySelector('script[src*="app.min.js?v="]');
      return tag ? (tag.getAttribute('src').match(/v=([0-9a-f]+)/) || [])[1] || 'dev' : 'dev';
    } catch (e) { return 'dev'; }
  }
  function device() {
    const d = {};
    try {
      d.touch = !!(G.Touch && G.Touch.active);
      d.mob = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)) ? 1 : 0;
      d.sw = screen.width; d.sh = screen.height; d.w = innerWidth; d.h = innerHeight;
      d.dpr = Math.round((devicePixelRatio || 1) * 100) / 100;
      d.q = G.Settings ? G.Settings.get('quality') : '';
      d.pwa = matchMedia('(display-mode: standalone)').matches ? 1 : 0;
      d.lang = G.I18n ? G.I18n.lang : '';
    } catch (e) { /* lo que se haya podido */ }
    return d;
  }

  /**
   * Empieza a apuntar. o: { chosen, coop (cfg o null), upg, perks, seed }.
   */
  function start(pl, o = {}) {
    if (cur) finish('salida', null);           // (no debería: la anterior no acabó)
    P = pl; H = {}; B = {}; K = {}; A = {}; taken = {}; healBy = {};
    sec = tlAcc = snapAcc = frames = realAcc = 0; realLast = 0; now = 0; offer = null; lastHit = null;
    const coop = o.coop || null, chosen = o.chosen != null ? o.chosen : pl.dex;
    let nat = null, abil = null;
    try { const n = G.Mons.natureOf(chosen); nat = n && (n.id || n.name || n); } catch (e) { /* sin naturaleza */ }
    try { abil = pl.abil ? pl.abil.id || null : null; if (!abil) abil = G.Mons.abilityOf(chosen).id; } catch (e) { /* sin habilidad */ }
    cur = {
      fmt: FMT, id: Date.now(), at: Date.now(), ver: version(), state: 'jugando',
      mode: coop ? 'grupo' : 'solo', host: coop ? !!(G.Coop && G.Coop.isHost) : true,
      players: coop && coop.members ? coop.members.length : 1,
      team: coop && coop.members ? coop.members.map(m => m && m.dex).filter(Boolean) : [],
      seed: o.seed != null ? o.seed : (G.World ? G.World.seed : 0),
      dev: device(),
      mon: { dex: chosen, start: pl.form, shiny: !!pl.shinyWant, nat, abil, types: (pl.mon && pl.mon.types) || [] },
      upg: Object.assign({}, o.upg || {}),
      startMoves: (pl.moves || []).map(m => m.id),
      cards: [], pass: [], items: [], ev: [], bosses: [], downs: [], lv: [], kinds: { h: 0, b: 0, l: 0, a: 0 },
      moves: {}, tl: []
    };
    seen = { item: pl.item || null, form: pl.form, arena: false, judge: false, biome: '', wx: '', lvl: pl.level, pass: {} };
    last = { dealt: 0, healed: 0, taken: 0, kills: 0 };
    for (const m of pl.moves || []) moveSeen(m);
    try { seen.biome = G.World.biomeName(); cur.ev.push([0, 'bioma', seen.biome]); } catch (e) { /* sin mundo */ }
  }
  const t1 = () => Math.round(now * 10) / 10;

  function moveSeen(m) {
    let r = cur.moves[m.id];
    if (!r) r = cur.moves[m.id] = { got: t1(), name: m.name || m.id, type: m.type || '', kind: m.kind || '', lv: [[t1(), m.lvl || 1]] };
    return r;
  }

  // ---------------- cada golpe ----------------
  /** Un golpe tuyo (combat.js, donde suma pl.dmgDealt): d ya con tipos, críticos... */
  function hit(pl, m, e, d) {
    if (pl !== P || !m) return;
    const id = m.id;
    H[id] = (H[id] || 0) + 1;
    if (e && e.boss) B[id] = (B[id] || 0) + d;
    if (e && e.dead && !e._rkd) { e._rkd = 1; K[id] = (K[id] || 0) + 1; }
  }

  /** Te han quitado d de vida (Player.hurt). src: quien (enemigo o texto); how: el ataque o cómo. */
  function hurt(pl, d, src, how, type) {
    if (pl !== P || !cur) return;
    const k = who(src) + '|' + (how || '');
    const o = taken[k] || (taken[k] = [0, 0]);
    o[0] += d; o[1]++;
    lastHit = { k, d: Math.round(d), type: type || '', t: t1() };
  }
  /** Te han tumbado (Player.hurt, vida a 0). */
  function down(pl) {
    if (pl !== P || !cur) return;
    const h = lastHit || { k: '?', d: 0, type: '' };
    cur.downs.push({ t: t1(), by: h.k, d: h.d, type: h.type, maxHp: Math.round(pl.maxHp), lv: pl.level,
                     zona: zona(), boss: !!(G.EnemyMgr && G.EnemyMgr.bossAlive && G.EnemyMgr.bossAlive()) });
  }
  /** Curación (Player.heal y lo que cura cada fotograma). */
  function heal(pl, got, src) {
    if (pl !== P || !cur || !(got > 0)) return;
    const k = src || '?';
    healBy[k] = (healBy[k] || 0) + got;
  }
  /** Un enemigo ha caído (EnemyMgr, sólo quien manda). */
  function kill(e) {
    if (!cur || !e) return;
    const c = e.judge ? 'a' : e.legend ? 'l' : e.boss ? 'b' : 'h';
    cur.kinds[c]++;
    if (!e._rkd) { e._rkd = 1; K['(otros)'] = (K['(otros)'] || 0) + 1; }
    if (e.boss) {
      const b = bossOf(e);
      b.kt = t1();
      if (e.fightT != null) b.fight = Math.round(e.fightT * 10) / 10;
    }
  }
  function bossOf(e) {
    for (const b of cur.bosses) if (b.id === e.id) return b;
    const b = { id: e.id, k: who(e), n: e.name || '', t: t1(), hp: Math.round(e.maxHp || 0), arena: !!(G.Rift && G.Rift.inArena) };
    cur.bosses.push(b);
    return b;
  }
  /** Un suceso suelto: cofre, altar, objeto recogido... */
  function ev(kind, data) {
    if (!cur) return;
    cur.ev.push(data === undefined ? [t1(), kind] : [t1(), kind, data]);
  }

  // ---------------- cartas ----------------
  const cardKey = c => c.key || (c.type + ':' + (c.id || c.title || ''));
  /** Cartas a la vista (run-ui.js, renderCards): si cambian sin elegir (cambio, descarte), se apuntan igual. */
  function offered(list, lvl) {
    if (!cur || !list) return;
    if (offer && offer.p === undefined) offer.p = null;
    offer = { t: t1(), lvl: lvl || (P ? P.level : 0), o: list.map(cardKey) };
    cur.cards.push(offer);
  }
  function picked(c) {
    if (!cur || !offer || !c) return;
    offer.p = cardKey(c);
    offer = null;
  }

  // ---------------- cada fotograma ----------------
  function zona() { return G.Judgment && G.Judgment.active ? 2 : G.Rift && G.Rift.inArena ? 1 : 0; }

  /** Desde Game.update (jugando). time: el reloj de la partida. */
  function tick(dt, time) {
    if (!cur || !P) return;
    now = time;
    frames++;
    const r = performance.now();
    if (realLast) realAcc += Math.min(0.25, (r - realLast) / 1000);
    realLast = r;
    if ((sec += dt) >= 1) { sec = 0; second(); }
    if ((tlAcc += dt) >= TL_EVERY) { line(tlAcc); tlAcc = 0; }
    if ((snapAcc += dt) >= SNAP_EVERY) { snapAcc = 0; save(build()).catch(() => {}); }
  }

  /** Una vez por segundo: lo que ha cambiado. */
  function second() {
    const pl = P, t = t1();
    for (const m of pl.activeGroup ? pl.activeGroup() : []) A[m.id] = (A[m.id] || 0) + 1;
    for (const s of pl.slots || []) for (const m of s) {
      const r = moveSeen(m);
      const lv = m.lvl || 1;
      if (r.lv[r.lv.length - 1][1] !== lv) r.lv.push([t, lv]);
      if (m.evolved && r.evo == null) r.evo = t;
      if (s.length > 1 && r.fuse == null) r.fuse = t;
    }
    if (pl.item !== seen.item) { seen.item = pl.item; cur.items.push([t, pl.item || null]); }
    if (pl.form !== seen.form) { cur.ev.push([t, 'evo', pl.form]); seen.form = pl.form; }
    if (pl.level !== seen.lvl) { seen.lvl = pl.level; cur.lv.push([t, pl.level]); }
    const st = pl.statsTaken || {};
    for (const k in st) if (st[k] !== seen.pass[k]) { seen.pass[k] = st[k]; cur.pass.push([t, k, st[k]]); }
    const arena = !!(G.Rift && G.Rift.inArena), judge = !!(G.Judgment && G.Judgment.active);
    if (arena !== seen.arena) { seen.arena = arena; cur.ev.push([t, arena ? 'grieta' : 'fin grieta']); }
    if (judge !== seen.judge) { seen.judge = judge; cur.ev.push([t, judge ? 'sentencia' : 'fin sentencia']); }
    try {
      const b = G.World.biomeName();
      if (b !== seen.biome) { seen.biome = b; cur.ev.push([t, 'bioma', b]); }
      const w = G.Weather.current, wk = w ? w.kind : '';
      if (wk !== seen.wx) { seen.wx = wk; cur.ev.push([t, 'clima', wk]); }
    } catch (e) { /* sin mundo o sin clima */ }
    if (G.EnemyMgr) for (const e of G.EnemyMgr.all()) if (e.boss && !e._rs && !e.dead) { e._rs = 1; bossOf(e); }
  }

  /** Una línea de la línea de tiempo (span: los s de partida que cubre). */
  function line(span) {
    const pl = P, s = Math.max(1, span);
    const dealt = pl.dmgDealt || 0, healed = pl.healed || 0, tk = pl.dmgTaken || 0, kills = pl.kills || 0;
    const fps = realAcc > 0 ? Math.round(frames / realAcc) : 0;
    cur.tl.push([Math.round(now), Math.round(pl.hp), Math.round(pl.maxHp), pl.level,
                 Math.round((dealt - last.dealt) / s), Math.round((healed - last.healed) / s * 10) / 10,
                 Math.round((tk - last.taken) / s * 10) / 10, G.EnemyMgr ? G.EnemyMgr.all().length : 0, fps,
                 kills, zona()]);
    last.dealt = dealt; last.healed = healed; last.taken = tk; last.kills = kills;
    frames = 0; realAcc = 0;
  }

  // ---------------- el registro ----------------
  const r1 = v => Math.round(v || 0);
  const base = id => String(id).replace(/~+$/, '');
  function dex(k) { const m = /^[hblax]:(\d+)/.exec(k); return m ? +m[1] : 0; }

  /** El registro tal como se guarda (se puede llamar a media partida). */
  function build() {
    const pl = P, out = Object.assign({}, cur);
    out.dur = Math.round(now);
    out.end = Date.now();
    out.lvl = pl.level; out.kills = pl.kills || 0; out.bossesN = pl.bosses || 0;
    out.coinsRun = pl.coins || 0; out.xp = Math.round(pl.xp || 0);
    out.form = pl.form; out.item = pl.item || null;
    out.dealt = r1(pl.dmgDealt); out.taken = r1(pl.dmgTaken); out.healed = r1(pl.healed);
    out.hp = r1(pl.hp); out.maxHp = r1(pl.maxHp);
    out.statsTaken = Object.assign({}, pl.statsTaken || {});
    // Por ataque: lo de cada uno (m.dealt ya junta sus golpes de segunda) y lo de aquí.
    const mv = {}, mine = new Set();
    for (const id in cur.moves) mv[id] = Object.assign({}, cur.moves[id], { lv: cur.moves[id].lv.slice() });
    for (const m of pl.moves || []) {
      mine.add(m.id);
      const r = mv[m.id] || (mv[m.id] = { got: 0, name: m.name || m.id, lv: [] });
      r.lvl = m.lvl || 1; r.evolved = !!m.evolved; r.dealt = r1(m.dealt);
      r.cat = m.cat || ''; r.kind = m.kind || r.kind || '';
      const grp = (pl.slots || []).find(s => s.includes(m));
      r.group = grp && grp.length > 1 ? grp.map(x => x.id) : null;
    }
    for (const [map, key] of [[H, 'hits'], [B, 'boss'], [K, 'kills'], [A, 'active']]) {
      for (const id in map) {
        const b = base(id), r = mv[b] || (mv[b] = { name: b, lv: [] });
        r[key] = r1((r[key] || 0) + map[id]);
      }
    }
    for (const id in mv) { const r = mv[id]; if (r.dealt != null) r.horde = Math.max(0, r.dealt - (r.boss || 0)); r.now = mine.has(id); }
    out.moves = mv;
    out.takenBy = {};
    for (const k in taken) out.takenBy[k] = [r1(taken[k][0]), taken[k][1]];
    out.healBy = {};
    let hsum = 0;
    for (const k in healBy) { out.healBy[k] = r1(healBy[k]); hsum += healBy[k]; }
    if ((pl.healed || 0) - hsum >= 1) out.healBy['(otros)'] = r1(pl.healed - hsum);
    // Nombres de los Pokémon que salen (para leerlo sin los datos del juego).
    const nm = {};
    const name = d => { if (d && !nm[d]) nm[d] = (G.DEX_BY && G.DEX_BY[d] && G.DEX_BY[d].name) || ''; };
    for (const k in out.takenBy) name(dex(k));
    for (const b of cur.bosses) name(dex(b.k));
    name(cur.mon.dex); name(pl.form);
    for (const d of cur.team) name(d);
    out.nm = nm;
    out.tlKeys = TL_KEYS;
    out.cards = cur.cards.map(c => Object.assign({}, c));
    out.bosses = cur.bosses.map(b => Object.assign({}, b));
    out.ev = cur.ev.slice(); out.pass = cur.pass.slice(); out.items = cur.items.slice(); out.lv = cur.lv.slice();
    out.downs = cur.downs.slice(); out.tl = cur.tl.slice(); out.kinds = Object.assign({}, cur.kinds);
    out.killer = out.downs.length ? out.downs[out.downs.length - 1].by : null;
    return out;
  }

  /** Lo corto de una partida (la lista del historial no carga las enteras). */
  function summary(r) {
    let top = null;
    for (const id in r.moves || {}) { const m = r.moves[id]; if (m.dealt != null && (!top || m.dealt > top.dealt)) top = { id, name: m.name, dealt: m.dealt }; }
    return { id: r.id, at: r.at, ver: r.ver, state: r.state, mode: r.mode, players: r.players, dur: r.dur || 0,
             dex: r.mon && r.mon.dex, form: r.form, lvl: r.lvl, kills: r.kills, bossesN: r.bossesN, coins: r.coins != null ? r.coins : null,
             dealt: r.dealt, taken: r.taken, healed: r.healed, downs: (r.downs || []).length, killer: r.killer || null,
             killerName: r.killer && r.nm ? r.nm[dex(r.killer)] || '' : '', top, mob: r.dev ? r.dev.mob : 0, cloud: r.cloud ? 1 : 0 };
  }

  /** Fin de la partida (Game.endRun). x: { coins, parts, judge, record }. */
  function finish(state, x) {
    if (!cur) return null;
    if (tlAcc >= 1) line(tlAcc);
    const r = build();
    r.state = state;
    if (x) { if (x.coins != null) r.coins = x.coins; if (x.parts) r.coinParts = x.parts; if (x.judge) r.judge = x.judge; if (x.record) r.record = 1; }
    cur = null; P = null; H = B = K = A = null; seen = null; offer = null;
    save(r).catch(e => console.warn('[Registro] no se pudo guardar la partida:', e));
    try { localStorage.removeItem(LAST); } catch (e) { /* sin almacenamiento */ }
    // Y su resumen anónimo a la nube, si se puede y se quiere (net/stats.js).
    try { if (G.RegCloud) G.RegCloud.finished(r); } catch (e) { console.warn('[Registro] resumen:', e); }
    return r;
  }
  const end = (dead, x) => finish(dead ? 'muerto' : 'salida', x);

  // ---------------- guardado ----------------
  /** IndexedDB: dos almacenes, la partida entera y su resumen (el historial sólo lee los resúmenes). */
  const IDB = (() => {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        if (typeof indexedDB === 'undefined') { rej(new Error('sin IndexedDB')); return; }
        const rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = () => {
          const db = rq.result;
          if (!db.objectStoreNames.contains(RUNS)) db.createObjectStore(RUNS, { keyPath: 'id' });
          if (!db.objectStoreNames.contains(SUMS)) db.createObjectStore(SUMS, { keyPath: 'id' });
        };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
        rq.onblocked = () => rej(new Error('IndexedDB bloqueada'));
      });
      dbp.catch(() => { dbp = null; });
      return dbp;
    }
    function tx(stores, mode, fn) {
      return open().then(db => new Promise((res, rej) => {
        const t = db.transaction(stores, mode);
        let out;
        const rq = fn(t);
        if (rq) rq.onsuccess = () => { out = rq.result; };
        t.oncomplete = () => res(out);
        t.onerror = t.onabort = () => rej(t.error);
      }));
    }
    return {
      put: (run, sum) => tx([RUNS, SUMS], 'readwrite', t => { t.objectStore(RUNS).put(run); t.objectStore(SUMS).put(sum); }),
      get: id => tx([RUNS], 'readonly', t => t.objectStore(RUNS).get(id)),
      runs: () => tx([RUNS], 'readonly', t => t.objectStore(RUNS).getAll()),
      sums: () => tx([SUMS], 'readonly', t => t.objectStore(SUMS).getAll()),
      del: ids => tx([RUNS, SUMS], 'readwrite', t => { for (const id of ids) { t.objectStore(RUNS).delete(id); t.objectStore(SUMS).delete(id); } }),
      clear: () => tx([RUNS, SUMS], 'readwrite', t => { t.objectStore(RUNS).clear(); t.objectStore(SUMS).clear(); })
    };
  })();
  let store = IDB;

  /** Guarda (o pone al día) una partida y deja sólo las MAX últimas. */
  function save(r) {
    return store.put(r, summary(r)).then(() => store.sums()).then(list => {
      if (list.length <= MAX) return;
      const old = list.map(s => s.id).sort((a, b) => a - b).slice(0, list.length - MAX);
      return store.del(old);
    });
  }

  /** Al abrir el juego: la partida que se quedó a medias (cerraste la app) pasa a «cerrada». */
  function init() {
    let backup = null;
    try { const s = localStorage.getItem(LAST); if (s) backup = JSON.parse(s); } catch (e) { /* nada */ }
    return store.sums().then(list => {
      const open = list.filter(s => s.state === 'jugando' && (!cur || s.id !== cur.id));
      const jobs = open.map(s => store.get(s.id).then(r => {
        if (!r) return;
        if (backup && backup.id === r.id && (backup.dur || 0) >= (r.dur || 0)) { r = backup; backup = null; }
        r.state = 'cerrada';
        return store.put(r, summary(r));
      }));
      // (La copia de localStorage es más nueva que lo último en IndexedDB o ni llegó a estar.)
      if (backup && backup.state === 'jugando' && (!cur || backup.id !== cur.id)) { backup.state = 'cerrada'; jobs.push(save(backup)); }
      return Promise.all(jobs);
    }).then(() => { try { localStorage.removeItem(LAST); } catch (e) { /* nada */ } })
      .catch(e => console.warn('[Registro] no se pudo repasar el historial:', e));
  }

  /** Al ocultar o cerrar la app a media partida: copia síncrona y a IndexedDB. */
  function stash() {
    if (!cur || !P) return;
    try {
      const r = build();
      try { localStorage.setItem(LAST, JSON.stringify(r)); } catch (e) { /* lleno: sólo IndexedDB */ }
      save(r).catch(() => {});
    } catch (e) { console.warn('[Registro] no se pudo guardar a medias:', e); }
  }
  if (typeof addEventListener === 'function') {
    addEventListener('pagehide', stash);
    addEventListener('visibilitychange', () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') stash(); });
  }

  // ---------------- exportar ----------------
  /** Todas las partidas en un objeto (lo que se descarga). */
  function exportData() {
    return store.runs().then(runs => ({
      app: 'PokéSurvivor', fmt: 'ps-partidas', v: FMT, exported: new Date().toISOString(),
      runs: (runs || []).sort((a, b) => a.id - b.id)
    }));
  }
  /** Descarga el archivo .json con todas. */
  function download() {
    return exportData().then(data => {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const name = 'pokesurvivor-partidas-' + new Date().toISOString().slice(0, 10) + '.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return data.runs.length;
    });
  }

  return {
    start, tick, hit, hurt, down, heal, kill, ev, offered, picked, end, finish, build, summary, init, stash,
    /** Vuelve a guardar una partida ya acabada (net/stats.js: marcada como subida). */
    resave: r => save(r).catch(() => {}),
    exportData, download, castOf, who, TL_KEYS, MAX,
    list: () => store.sums().then(l => (l || []).sort((a, b) => b.id - a.id)),
    get: id => store.get(id),
    clear: () => store.clear(),
    /** (Pruebas) otro almacén con put/get/runs/sums/del/clear. */
    useStore(s) { store = s || IDB; },
    actor: null,           // el enemigo que se está moviendo ahora (EnemyMgr.update): sus firmas saben de quién son
    hsrc: null,            // de dónde viene la curación sin fuente (las cartas: Game)
    get on() { return !!cur; },
    get current() { return cur; }
  };
})();
