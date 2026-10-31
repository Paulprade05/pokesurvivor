/* ============ game.js — flujo del juego y bucle principal ============
 *
 *   login ──> test de personalidad ──> menú ──> run ──> resumen ──> menú
 *                (sólo la 1ª vez)          │
 *                                          ├─ Pokémon (colección)
 *                                          ├─ Mejoras
 *                                          └─ Gacha
 *
 * Estados del bucle: 'ui' (menús, con el mundo de fondo), 'playing',
 * 'levelup', 'choice' (vínculo u objeto), 'held' (grupo: otro elige o el
 * anfitrión no responde), 'paused', 'over'.
 *
 * Cooperativo (G.Coop.active): el anfitrión lleva enemigos, objetos y
 * experiencia; cada uno su Pokémon. La pausa no para el juego, las cartas de
 * nivel esperan a que elijan todos y un compañero caído se levanta si otro
 * se queda a su lado. Ver net/coop.js.
 */
G.Game = (() => {
  let cv, ctx, dpr = 1, w = 0, h = 0;
  let state = 'ui';
  let time = 0, last = 0, pendingLevels = 0;
  let pl = null;
  let caught = [];          // shinies conseguidos en esta run
  let biome = -1;
  let leaving = false;      // recarga a propósito (allowLeave): el navegador no pregunta

  const st = { get time() { return time; } };

  // ---------------- arranque ----------------

  function init() {
    cv = document.getElementById('game');
    ctx = cv.getContext('2d');
    resize();
    addEventListener('resize', resizeSoon);
    G.Settings.on(k => { if (k === 'eco') resize(); });      // ahorro de energía: cambia la resolución
    // iPhone: al girarlo o al abrirlo desde la pantalla de inicio avisa del
    // cambio ANTES de recolocar la página, y con esas medidas viejas el juego
    // se quedaba estirado. Se vuelve a medir cuando el lienzo cambia de verdad
    // (ResizeObserver) y, por si acaso, un poco después de cada aviso.
    addEventListener('orientationchange', resizeSoon);
    if (window.visualViewport) visualViewport.addEventListener('resize', resizeSoon);
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv);
    G.Touch.init(cv);
    // En móvil: al cambiar de app o al girarlo, la partida se pausa (ver checkOrientation).
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
    // Continuar: en grupo la pausa no para nada, sólo se cierra (sin saltarse
    // la espera si otro está eligiendo o el anfitrión no responde).
    G.RunUI.wirePause(() => { if (state === 'paused') state = 'playing'; G.UI.hideAll(); }, quitRun);
    // Recargar o cerrar la pestaña en plena partida: el navegador pregunta antes.
    addEventListener('beforeunload', e => {
      if (leaving || !pl || state === 'ui' || state === 'over') return;
      e.preventDefault();
      e.returnValue = '';
    });
    Backdrop.init();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function resize() {
    // Resolución interna como mucho ×1,5: en pantallas ×2 dibujar el doble de
    // píxeles era de lo que más costaba, y con el pixel art no se nota.
    // Con «Ahorro de energía», ×1 (menos calor y batería en portátiles y móviles).
    const d = Math.min(G.Settings.get('eco') ? 1 : 1.5, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (!cw || !ch) return;
    G.Touch.resetSafe();
    if (cw === w && ch === h && d === dpr && cv.width === Math.round(cw * d) && cv.height === Math.round(ch * d)) { checkOrientation(); return; }
    dpr = d; w = cw; h = ch;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    G.Camera.resize(w, h, dpr);
    Backdrop.stale();                // el lienzo se ha borrado: el fondo del menú se repinta
    checkOrientation();
  }
  let seenW = 0, seenH = 0;   // tamaño de la ventana visto en el último fotograma (el primero lo apunta)
  let resizeTs = [];
  function resizeSoon() {
    resize();
    resizeTs.forEach(clearTimeout);
    resizeTs = [100, 350, 800].map(ms => setTimeout(resize, ms));
  }

  /**
   * Se juega de pie y tumbado. Si el móvil se gira en plena partida, el jugador
   * está recolocando las manos: se suelta el joystick y, en solitario, se pausa.
   */
  let tall = null;                   // ¿en vertical? (null: aún sin medir)
  function checkOrientation() {
    const now = h > w;
    if (tall !== null && now !== tall && G.Touch.active) autoPause();
    tall = now;
  }

  /** Pausa sola (sólo en solitario: en grupo los demás siguen). */
  function autoPause() {
    G.Touch.reset();
    if (state === 'playing' && !G.Coop.active) { state = 'paused'; G.RunUI.showPause(); }
  }

  /** Pausa/continúa (tecla Esc o P, o el botón de pausa del móvil). */
  let holdBy = [];                   // grupo: quién está eligiendo fusión (todo parado)

  function togglePause() {
    // En grupo la pausa no para el juego (los demás siguen jugando).
    if (G.Coop.active) {
      if (G.UI.isOpen('scr-pause')) { G.UI.hide('scr-pause'); return; }   // también en espera ('held')
      if (state !== 'playing') return;
      G.RunUI.showPause(true); G.Audio.sfx('pause');
      return;
    }
    if (state === 'playing') { state = 'paused'; G.RunUI.showPause(); G.Audio.sfx('pause'); }
    else if (state === 'paused') { state = 'playing'; G.UI.hideAll(); }
  }

  // ---------------- run ----------------

  /** @param coop  { seed, host, members } para una partida en grupo */
  function startRun(coop = null) {
    holdBy = []; awayBy = null;
    const save = G.DB.save;
    // Se empieza con la primera fase de su línea (24-10-2026: evoluciona en la
    // partida, ver G.Evo en systems/mons.js), con la naturaleza del que elegiste.
    // mon.dex sigue siendo el elegido: sus mejoras, MT, atajos y récords.
    const chosen = save.partner;
    const mon = G.Mons.formFor(chosen, G.Evo.base(chosen));
    const perks = G.Upgrades.perks(G.DB.upgradesOf(chosen));

    G.UI.hideAll();
    G.UI.chrome(false);
    G.FX.clear();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.EnemyMgr.clear();
    G.Pickups.clear();
    G.Spawner.reset();
    G.Rift.reset();
    G.Judgment.reset();
    G.Events.reset();
    G.Weather.reset();
    G.Path.clear();
    G.Hazards.clear();
    G.World.reset(coop ? coop.seed : Math.floor(Math.random() * 1e6));
    G.World.setBiome(0, true);
    biome = 0;
    time = 0; pendingLevels = 0;
    runReal = performance.now(); tampered = false;

    pl = new G.Player(mon, perks, !!save.partnerShiny && G.DB.ownsShiny(chosen));
    G.Evo.start(pl, chosen);
    G.EvoUI.clear();
    pl.setAbility(G.Mons.abilityOf(chosen).id);
    banked = { t1: 0, t10: 0 };
    caught = [];
    // Atajos: movimientos con hueco fijo (save.pbind[dex] = [id del 1, id del 2, ...]),
    // antes de aprender nada: addMove ya los coloca.
    (save.pbind && save.pbind[mon.dex] || []).forEach((id, i) => { if (id) pl.bind[id] = i; });
    pl.addMove(G.startMoveOf(mon.dex));
    // Mejora "Veto": movimientos que no quieres que te salgan.
    pl.banned = new Set((save.pban && save.pban[mon.dex] || []).slice(0, perks.bans));
    // Mejora "Repertorio": un segundo movimiento de ataque, el elegido con
    // "Segundo movimiento inicial" o, si no, al azar.
    if (perks.startMoves >= 2) {
      const pick2 = G.startMove2Of(mon.dex);
      const pool = G.Moves.poolFor(mon).filter(id => !pl.hasMove(id) && !pl.banned.has(id) && !G.Moves.nonAttacking(G.Moves.BY_ID[id].kind));
      if (pick2 && !pl.hasMove(pick2)) pl.addMove(pick2);
      else if (pool.length) pl.addMove(G.U.pick(pool));
      pl.setActive(0);
    }

    if (coop) {
      G.Coop.begin(coop, pl, coopApi);
      G.Social.setPlaying(true);
    }
    G.Camera.x = pl.x; G.Camera.y = pl.y; G.Camera.shake = 0;
    // Hojas de sprites locales: el compañero (las de su siguiente fase, en evoTick).
    G.Sprites.preload([pl.form], 8000, pl.shinyWant);
    evoT = 0;
    G.Audio.music(G.BIOME_MUSIC[0]);
    // Para el ranking: el servidor apunta cuándo empieza la partida (anti-trampas).
    if (!coop || G.Coop.isHost) G.Ranking.runStarted(coop ? 'g' : 's');
    deathT = 0;

    state = 'playing';
    // Primera partida con el móvil de pie: un consejo, sin parar nada (sólo aquí, no se manda).
    if (G.Touch.active && h > w && !G.Settings.get('tipVert')) {
      G.Settings.set('tipVert', true);
      G.Spawner.say('Consejo: también puedes jugar con el móvil en horizontal', 4, true);
    }
    // «Empiezas como Charmander…» (los avisos van en cola: si hay consejo, sale después).
    G.EvoUI.startHint(pl);
  }

  // ---------------- evoluciones en partida (24-10-2026) ----------------

  /*
   * G.Evo (systems/mons.js) dice qué toca: evolucionar ya, sacar su piedra al
   * suelo (la coges y evoluciona) o elegir rama con una carta (la partida se
   * para; en grupo, para todos, como con los vínculos). En grupo cada uno
   * evoluciona el suyo y los demás lo ven por su envío (coop.js, la fase).
   */
  let evoT = 0;
  function evoTick(dt) {
    if (!pl || !pl.evo) return;
    G.EvoUI.tick(dt);
    const got = G.EvoUI.itemTick(dt, pl);
    if (got) { evolveTo(got); return; }
    // Las hojas de la siguiente fase, a mano (las que no se usan en un rato se sueltan).
    // Con rama (Eevee: 8), sólo la de quieto (la carta); la que elijas, al evolucionar.
    if ((evoT -= dt) <= 0) {
      evoT = 10;
      const o = G.Evo.options(pl);
      if (o.length === 1) G.Sprites.preload(o, 8000, pl.shinyWant);
      else for (const d of o) G.Sprites.sheet(d, 'Idle', pl.shinyWant);
    }
    const r = G.Evo.tick(pl, dt);
    if (!r) return;
    if (r.choose) offerEvo(r.choose);
    else if (r.item) { G.Sprites.preload([r.item], 8000, pl.shinyWant); G.EvoUI.dropItem(pl, r.item, r.it); }
    else if (r.dex) evolveTo(r.dex, r.via);
  }

  function evolveTo(dex, via = '') {
    if (!pl || !G.DEX_BY[dex]) return;
    const from = pl.form;
    try {
      G.Sprites.preload([dex], 8000, pl.shinyWant);
      pl.evolve(G.Mons.formFor(pl.dex, dex));
      G.Evo.advance(pl, dex);
      G.EvoUI.evolved(pl, from, dex, via);
    } catch (e) {
      console.error('[Game] fallo al evolucionar:', e);
      G.Evo.advance(pl, dex);          // que no lo intente en cada fotograma
    }
  }

  /** Rama (Eevee...): se elige con una carta; mientras, todo parado. */
  function offerEvo(opts) {
    if (!pl || pl.dead || state !== 'playing') return;
    if (['scr-bond', 'scr-pause', 'scr-item', 'scr-levelup'].some(G.UI.isOpen)) return;   // se vuelve a mirar en un momento
    state = 'choice';
    pl.evo.wait = opts;
    if (G.Coop.active) G.Coop.holdStart();
    const end = () => {
      if (pl && pl.evo) pl.evo.wait = null;
      if (state === 'choice') state = holdBy.length ? 'held' : 'playing';
      if (G.Coop.active) G.Coop.holdEnd();
      afterLevelUp();
    };
    try {
      G.Audio.sfx('levelup');
      G.EvoUI.showChoice(pl, opts, dex => { try { evolveTo(dex); } finally { end(); } });
    } catch (e) {
      console.error('[Game] no se pudo abrir la elección de evolución:', e);
      G.EvoUI.closeChoice();
      evolveTo(opts[0]);
      end();
    }
  }
  /** Cierra la carta de rama sin elegir (vuelve a salir enseguida). */
  function cancelEvo() {
    if (!G.EvoUI.isOpen()) return;
    G.EvoUI.closeChoice();
    if (pl && pl.evo) pl.evo.wait = null;
    if (G.Coop.active) G.Coop.holdEnd();
  }

  function quitRun() {
    if (G.Coop.active) { try { G.Coop.leave(); } catch (e) { console.error('[Game] fallo al salir del grupo:', e); } }
    endRun(false);
  }

  /** Todos los jugadores de la partida (tú primero). */
  function everyone() { return G.Coop.active ? G.Coop.players() : [pl]; }

  /** Experiencia que hace falta para el siguiente nivel (cofres con candado). */
  function levelXp() {
    if (!pl) return 20;
    const k = (G.Coop.active ? G.Coop.xpFactor() : 1) * (pl.xpMul || 1);
    return Math.ceil((pl.xpNext - pl.xp + 1) / k);
  }

  // Destello de pantalla completa (viaje a la grieta).
  let flashT = 0, flashDur = 1, flashCol = '#fff';
  function flash(col, dur) { flashCol = col; flashDur = dur; flashT = dur; }

  function teamState() {
    return { time, level: pl.level, xp: pl.xp, xpNext: pl.xpNext, kills: pl.kills, bosses: pl.bosses, coins: pl.coins, t1: pl.t1, t10: pl.t10 };
  }
  function summary() { return { t: time, ki: pl.kills, bo: pl.bosses, co: pl.coins, lv: pl.level, t1: pl.t1, t10: pl.t10 }; }

  /** Lo que el cooperativo necesita del juego. */
  /**
   * Los tickets recogidos se guardan en cuanto los coges (como los shinies):
   * antes sólo al acabar, y si la pestaña se cerraba de golpe se perdían.
   * `banked` = los de esta partida que ya están en la partida guardada.
   */
  let banked = { t1: 0, t10: 0 };
  function bankTickets(save_ = true) {
    const sv = G.DB.save;
    if (!sv || !pl) return;
    sv.tickets = sv.tickets || { t1: 0, t10: 0 };
    const d1 = Math.max(0, pl.t1 - banked.t1), d10 = Math.max(0, pl.t10 - banked.t10);
    if (!d1 && !d10) return;
    sv.tickets.t1 += d1; sv.tickets.t10 += d10;
    banked = { t1: pl.t1, t10: pl.t10 };
    if (save_) G.DB.commit('run');
  }

  const coopApi = {
    team: teamState,
    summary,
    // Invitado: el anfitrión manda el reloj y lo del equipo.
    syncTeam(t) {
      if (Math.abs(t.time - time) > 0.4) time = t.time;
      if (t.level > pl.level) G.Audio.sfx('xp');
      pl.level = t.level; pl.xp = t.xp; pl.xpNext = t.xpNext;
      pl.kills = t.kills; pl.bosses = t.bosses; pl.coins = t.coins;
      if (t.t1 > pl.t1 || t.t10 > pl.t10) G.Audio.sfx('shiny');
      pl.t1 = t.t1 || 0; pl.t10 = t.t10 || 0;
      bankTickets();
    },
    levelStart(level) {
      // (Si tenías abierta la elección de objeto, vuelve al terminar: afterLevelUp.)
      if (state === 'choice' && openItem && G.Coop.active) G.Coop.holdEnd();
      cancelEvo();                       // (la carta de rama vuelve a salir al terminar)
      state = 'levelup';
      G.UI.hide('scr-pause');
      // Pase lo que pase al aplicar la carta, se avisa de que has elegido: si
      // no, los demás se quedaban esperándote para siempre.
      try {
        G.Audio.sfx('levelup');
        G.RunUI.showLevelUp(level, G.LevelUp.offer(pl), card => {
          try { G.Audio.sfx('confirm'); card.apply(pl); }
          catch (e) { console.error('[Game] fallo al aplicar la carta:', e); }
          finally { G.Coop.localPicked(); }
        }, true);
      } catch (e) {
        console.error('[Game] no se pudieron abrir las cartas:', e);
        G.Coop.localPicked();          // esta vez sin carta; la partida sigue al elegir los demás
        G.RunUI.closeLevelUp();
      }
    },
    waiting(names) { G.RunUI.setWaiting(names); },
    resume() {
      G.RunUI.closeLevelUp();
      if (state === 'levelup') { state = holdBy.length ? 'held' : 'playing'; afterLevelUp(); }
    },
    /** ¿Estás eligiendo algo que para la partida (objeto o vínculo)? */
    choosing() { return state === 'choice'; },
    /** A quién miras mientras estás caído (uid, o '' si a ti). */
    watching() { const w = watched(); return w ? w.uid : ''; },
    inLevelUp() { return state === 'levelup'; },
    shiny(dex) { G.onShinyCaught({ dex, name: (G.DEX_BY[dex] || {}).name || '' }); },
    over(d) {
      if (d) Object.assign(pl, { kills: d.ki, bosses: d.bo, coins: d.co, level: Math.max(pl.level, d.lv || 1), t1: d.t1 || pl.t1, t10: d.t10 || pl.t10 });
      if (d && d.t) time = d.t;
      if (d && d.why === 'host') G.UI.toast('El anfitrión ha terminado la partida', 3200);
      endRun(!(d && d.why === 'host'));
    },
    lost(msg) { G.UI.toast(msg, 3600); endRun(false); },
    item(id) { offerItem(id); },
    mateLeft() {},
    /** Grupo: quién está eligiendo fusión. Mientras haya alguien, todo parado. */
    hold(names) {
      holdBy = names || [];
      const mine = G.UI.isOpen('scr-bond');
      if (holdBy.length) {
        if (state === 'playing') state = 'held';
        if (pl && pl.bonds > 0) offerBond(true);      // si tú también tienes vínculo, eliges a la vez
        const others = holdBy.filter(n => n !== (G.Social.me && G.Social.me.name) && n !== 'Tú');
        if (!mine && others.length) G.Spawner.say('Pausa: ' + others.join(', ') + ' ' + (others.length > 1 ? 'están eligiendo…' : 'está eligiendo…'), 999, true);
        else if (!others.length) G.Spawner.say(awayBy ? awayText() : '', awayBy ? 999 : 0, true);   // sólo tú: sin aviso viejo
      } else {
        if (state === 'held' && !awayBy) state = 'playing';
        G.Spawner.say(awayBy ? awayText() : '', awayBy ? 999 : 0, true);
      }
    },
    /** Grupo (invitado): el anfitrión se ha ido de la pestaña o no responde: todo parado. */
    away(name) {
      awayBy = name || null;
      if (awayBy) {
        if (state === 'playing') state = 'held';
        G.Spawner.say(awayText(), 999, true);
      } else if (!holdBy.length) {
        if (state === 'held') state = 'playing';
        G.Spawner.say('', 0, true);
      }
    }
  };
  let awayBy = null;
  const awayText = () => 'Pausa: esperando a ' + awayBy + ' (anfitrión)…';

  /** Has llevado a casa a un Pokémon perdido y se une a ti (events.js). */
  G.onRescue = (dex, name) => {
    if (!G.DB.save || !pl) return;
    const isNew = !G.DB.owns(dex);
    // (Se guarda la forma final de su familia, ver G.Fam: el aviso dice esa.)
    if (isNew) { const fin = G.DB.grant(dex, 'rescue'); if (G.DEX_BY[fin]) name = G.DEX_BY[fin].name; G.DB.commit(true); }
    else pl.coins += 150;
    G.Spawner.say(isNew ? '¡' + name + ' se une a tu equipo!' : '¡' + name + ' te da las gracias! (+150 monedas, ya lo tenías)', 4);
    G.Audio.sfx('shinyGet');
  };

  /** Un shiny salvaje cae: te lo quedas (y la versión normal si no la tenías). */
  G.onShinyCaught = e => {
    if (!G.DB.save || !pl) return;
    if (G.Coop.isHost) G.Coop.shinyCaught(e);
    const got = {}, isNew = G.DB.grantShiny(e.dex, 'wild', got);
    G.DB.save.stats.shinies++;
    G.DB.commit(true);
    // (Se guarda en la forma final de su familia, ver G.Fam; en una rama, la que ha tocado: el aviso y el resumen
    //  la nombran a ella, no a la preevolución. Cada uno ve su aviso: en grupo, el de cada jugador puede ser otra rama.)
    const fd = G.DEX_BY[got.dex] ? got.dex : e.dex;
    caught.push({ dex: fd, isNew });
    const nm = (G.DEX_BY[fd] || {}).name || e.name;
    G.Spawner.say(isNew ? '¡Has conseguido a ' + nm + ' shiny!' : '¡Otro ' + nm + ' shiny! (+300 monedas)', 4, true);
    if (!isNew) pl.coins += 300;
    G.Audio.sfx('shinyGet');
  };

  /*
   * Al acabar, cada efecto en otro sistema va aparte: si uno falla, lo demás se
   * hace igual y siempre sale el resumen (antes la partida se quedaba
   * congelada en 'over', sin resumen ni botón para volver).
   */
  const guard = (what, fn) => { try { return fn(); } catch (e) { console.error('[Game] fin de partida (' + what + '):', e); } };
  let overArgs = null;      // [datos, volver] del último resumen, por si hay que enseñarlo otra vez

  function endRun(dead = true) {
    if (state === 'over' || !pl) return;
    const coop = !!pl.uid;                    // sólo las partidas en grupo le ponen uid
    const wasHost = !!pl.coopHost;
    const team = (coop && guard('Coop', () => G.Coop.members.slice())) || [];
    if (G.Coop.active) guard('Coop', () => G.Coop.end());
    if (coop) guard('Social', () => G.Social.setPlaying(false));
    state = 'over';
    guard('Evo', () => G.EvoUI.clear());       // cartel, carta de rama o piedra que quedaran
    guard('Audio', () => { G.Audio.music(null); G.Audio.sfx(dead ? 'gameover' : 'back'); });
    const save = G.DB.save;
    const mul = pl.coinMul;
    const parts = {
      tiempo: Math.floor(time / 5),
      derrotados: Math.floor(pl.kills * 0.25),
      jefes: pl.bosses * 80,
      recogidas: pl.coins
    };
    const coins = Math.round((parts.tiempo + parts.derrotados + parts.jefes + parts.recogidas) * mul);
    const PART_NAME = { tiempo: 'Tiempo', derrotados: 'Derrotados', jefes: 'Jefes', recogidas: 'Recogidas' };
    const record = !!guard('DB', () => time > save.stats.bestTime);

    guard('DB', () => {
      save.coins += coins;
      bankTickets(false);
      save.stats.runs++;
      save.pused = save.pused || {};
      save.pused[pl.dex] = (+save.pused[pl.dex] || 0) + 1;     // para "más usados" en la colección
      save.stats.totalKills += pl.kills;
      save.stats.bestTime = Math.max(save.stats.bestTime, Math.floor(time));
      if (coop) save.stats.bestGroupTime = Math.max(save.stats.bestGroupTime || 0, Math.floor(time));
      save.stats.bestLevel = Math.max(save.stats.bestLevel, pl.level);
      save.stats.coinsEarned += coins;
    });
    const judge = guard('Judgment', () => G.Judgment.summary()) || null;
    if (judge) guard('Progress', () => G.Progress.event('judgeEnd', judge));
    guard('Judgment', () => G.Judgment.reset());
    // Tipos: los del Pokémon que elegiste y los de la fase a la que ha llegado (misiones «con un
    // Pokémon de tipo X»: eligiendo Charizard, Volador cuenta aunque acabes como Charmander).
    guard('Progress', () => {
      const types = [...new Set(((G.DEX_BY[pl.dex] || {}).types || []).concat(pl.mon.types || []))];
      G.Progress.event('runEnd', { time, level: pl.level, coins: pl.coins, types, group: coop });
    });
    guard('Progress', () => G.Progress.checkAch());
    // A la nube al acabar la partida (como mucho cada hora); si la marca entra
    // en un top (hoy, semana o mes), enseguida (abajo, tras subirla al ranking).
    guard('DB', () => G.DB.commit('run'));
    guard('Social', () => { if (G.Social.me) G.Social.publishProfile(); });

    // Ranking: en solitario cada uno lo suyo; en grupo lo sube el anfitrión.
    guard('Ranking', () => {
      const mark = { t: Math.floor(time), lv: pl.level, kills: pl.kills };
      // Si la partida se ha tocado (ver clean()), no sube al ranking (sin avisar); lo demás, sí.
      const ok = clean();
      // (El Pokémon que elegiste, no la fase a la que ha llegado: shinyWant es su shiny.)
      const sent = ok && !coop ? G.Ranking.submitSolo(Object.assign(mark, { dex: pl.dex, shiny: !!pl.shinyWant }))
                 : ok && wasHost ? G.Ranking.submitGroup(Object.assign(mark, { members: team })) : null;
      if (sent) sent.then(b => { if (b && b.some(p => p !== 'a')) G.DB.commit(true); }).catch(() => {});
    });

    overArgs = [{
      dead, time, level: pl.level, kills: pl.kills, bosses: pl.bosses, coins, record, t1: pl.t1, t10: pl.t10, judge,
      moves: pl.moves, caught, dealt: pl.dmgDealt, taken: pl.dmgTaken, healed: pl.healed,
      // (Con los nombres traducidos, 29-10-2026: antes salían las claves, «recogidas» también en inglés o chino.)
      breakdown: Object.entries(parts).filter(([, v]) => v).map(([k, v]) => `${G.T(PART_NAME[k])} ${v}`).join(' · ') +
                 (mul > 1 ? ` · ×${mul.toFixed(2)} ${G.T('Fortuna')}` : '')
    }, () => { pl = null; G.Flow.afterRun(); }];
    showResults();
  }

  /** El resumen; si falla al montarlo, al menos su pantalla con el botón de volver. */
  function showResults() {
    try { G.RunUI.showOver(...overArgs); }
    catch (e) {
      console.error('[Game] no se pudo enseñar el resumen:', e);
      document.getElementById('btn-again').onclick = overArgs[1];
      G.UI.show('scr-over');
    }
  }

  /*
   * ¿Partida limpia? Sólo cosas que ningún jugador legal puede hacer, con
   * márgenes enormes (el sistema del 10-10 daba falsos positivos):
   *   - el reloj de la partida va más deprisa que el real (trucos de velocidad)
   *   - funciones de tu Pokémon sustituidas (así se hace uno invencible)
   *   - vida, ataque, velocidad o recarga muy por encima de lo posible
   *   - se han usado las funciones de pruebas (saltar el reloj...)
   * Si algo salta, esa partida no sube al ranking (sin avisar) y nada más.
   */
  let runReal = 0, tampered = false;
  function clean() {
    if (tampered) return false;
    if (time > (performance.now() - runReal) / 1000 + 10) return false;
    for (const k of ['hurt', 'update', 'heal', 'gainXp']) if (Object.prototype.hasOwnProperty.call(pl, k)) return false;
    if (!isFinite(pl.hp) || !isFinite(pl.maxHp) || pl.hp > pl.maxHp + 1 || pl.maxHp > 50000) return false;
    if (pl.atkMul > 200 || pl.spdMul > 25 || pl.cdMul < 0.03 || pl.level > 20 + time / 3) return false;
    return true;
  }

  // ---------------- subida de nivel ----------------

  function maybeLevelUp() {
    if (pendingLevels <= 0 || state !== 'playing') return;
    if (G.Coop.active) {
      // En grupo, las cartas salen a la vez para todos y se espera a que elijan.
      if (G.Coop.players().every(p => p.dead)) return;
      pendingLevels--;
      G.Coop.levelStart(pl.level);
      return;
    }
    // Nunca abras cartas con el Pokémon caído (morir y recoger XP en el mismo frame).
    if (pl.dead) return;
    pendingLevels--;
    state = 'levelup';
    // Si algo falla al abrir las cartas o al aplicar la elegida, se sigue
    // jugando (antes la partida se quedaba congelada sin cartas, #262).
    try {
      G.Audio.sfx('levelup');
      G.RunUI.showLevelUp(pl.level, G.LevelUp.offer(pl), card => {
        try { G.Audio.sfx('confirm'); card.apply(pl); }
        catch (e) { console.error('[Game] fallo al aplicar la carta:', e); }
        finally { if (state === 'levelup') state = 'playing'; }
      });
    } catch (e) {
      console.error('[Game] no se pudieron abrir las cartas:', e);
      if (state === 'levelup') state = 'playing';
      G.RunUI.closeLevelUp();
    }
  }

  // ---------------- vínculos ----------------

  /**
   * Vínculo de un legendario: eliges qué movimientos se fusionan.
   * Si ahora no se puede (no hay dos sueltos), se guarda hasta que aprendas
   * otro movimiento. Se mira en cada fotograma: si otra pantalla la tapa (cartas
   * de nivel en grupo, pausa), vuelve a salir al cerrarla.
   * @param quiet  no avisar si todavía no se puede
   */
  function offerBond(quiet = false) {
    if (!pl || pl.bonds <= 0 || pl.dead || (state !== 'playing' && state !== 'held') || G.Rift.inArena) return;
    if (['scr-bond', 'scr-pause', 'scr-item', 'scr-levelup'].some(G.UI.isOpen) || G.EvoUI.isOpen()) return;
    const opt = pl.bondOptions();
    if (!opt) {
      if (!quiet) G.Spawner.say('Guardas el vínculo: aprende otro movimiento para usarlo', 3, true);
      return;
    }
    // Se para el juego; en grupo, para todos hasta que cada uno elige (G.Coop.holdStart).
    state = 'choice';
    if (G.Coop.active) G.Coop.holdStart();
    // Pase lo que pase se sigue jugando y, en grupo, se avisa de que has
    // terminado. Si algo falla, el vínculo se gasta (si no, saldría sin parar).
    const had = pl.bonds;
    const fail = e => { console.error('[Game] fallo en el vínculo:', e); if (pl.bonds === had) pl.bonds = Math.max(0, had - 1); };
    const end = () => {
      if (state === 'choice') state = holdBy.length ? 'held' : 'playing';
      if (G.Coop.active) G.Coop.holdEnd();
    };
    try {
      G.Audio.sfx('levelup');
      G.RunUI.showBond(opt, picked => {
        try {
          const group = pl.fuse(picked, opt.group);
          G.Audio.sfx('legend');
          G.FX.ring(pl.x, pl.y, 8, 130, '#ff8ad8', 0.8, 6);
          G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffb3e6', 40, 240);
          G.Spawner.say('¡Vínculo! ' + group.length + ' movimientos a la vez', 2.6, true);
        } catch (e) { fail(e); }
        finally { end(); }
      });
    } catch (e) { fail(e); G.UI.hide('scr-bond'); end(); }
  }

  // ---------------- recogida ----------------

  const PICK_SFX = { xp: 'xp', xpBig: 'xp', coin: 'coin', heal: 'heal', bomb: 'break', magnet: 'confirm', ticket: 'shiny', ticket10: 'legend', item: 'legend' };

  /*
   * Cooperativo: la elección de objeto y las cartas de nivel no pueden taparse.
   * Si llega un objeto con las cartas abiertas, espera a que elijas carta; y si
   * las cartas llegan con la elección de objeto abierta, ésta vuelve a salir al
   * terminar. (Antes una cerraba la otra, nadie podía terminar de elegir y la
   * partida se quedaba parada para todos.)
   */
  let openItem = null;           // { cur, next, take } elección de objeto sin terminar
  const laterItems = [];         // objetos recogidos con las cartas de nivel abiertas
  function afterLevelUp() {
    if (state !== 'playing' && state !== 'held') return;
    if (openItem && !G.UI.isOpen('scr-item')) {
      const o = openItem;
      if (o.mine) { state = 'choice'; if (G.Coop.active) G.Coop.holdStart(); }
      try { G.RunUI.showItemChoice(o.cur, o.next, o.take); }
      catch (e) { console.error('[Game] no se pudo abrir la elección de objeto:', e); G.UI.hide('scr-item'); o.take(o.cur); }
      return;
    }
    if (laterItems.length) offerItem(laterItems.shift());
  }

  /** Has cogido un objeto: si no llevas ninguno te lo pones; si no, eliges. */
  function offerItem(id) {
    if (!pl || !G.Items.BY[id]) return;
    if (state === 'levelup' || G.UI.isOpen('scr-levelup') || G.EvoUI.isOpen()) { laterItems.push(id); return; }
    let mine = false;            // esta elección es la que ha parado el juego
    const take = got => {
      openItem = null;
      // Si falla al ponértelo, se sigue jugando igual (y en grupo, se avisa).
      try {
        if (got !== pl.item) {
          pl.equip(got);
          G.Spawner.say('¡Llevas ' + G.Items.BY[got].name + '!', 2.6, true);
          G.Progress.event('item', { id: got });
        }
      } catch (e) { console.error('[Game] fallo al cambiar de objeto:', e); }
      finally {
        if (mine) {
          if (state === 'choice') state = holdBy.length ? 'held' : 'playing';
          if (G.Coop.active) G.Coop.holdEnd();
        }
      }
      afterLevelUp();
    };
    if (!pl.item) { take(id); return; }
    if (pl.item === id) { G.Spawner.say('Ya llevas ' + G.Items.BY[id].name, 2, true); return; }
    // Se para el juego mientras eliges; en grupo, para todos (como con las
    // fusiones). Antes en grupo seguía y te pegaban mientras elegías.
    if (state === 'playing' || state === 'held') {
      mine = true;
      state = 'choice';
      if (G.Coop.active) G.Coop.holdStart();
    }
    openItem = { cur: pl.item, next: id, take, get mine() { return mine; } };
    try { G.RunUI.showItemChoice(pl.item, id, take); }
    catch (e) { console.error('[Game] no se pudo abrir la elección de objeto:', e); G.UI.hide('scr-item'); take(pl.item); }
  }

  /** @param who  quien lo ha cogido (en cooperativo puede ser un compañero) */
  function onCollect(p, who = pl) {
    const mine = who === pl;
    if (G.Coop.active && !G.Coop.isHost) {
      // Copia de un objeto del anfitrión: el efecto lo decide él.
      if (mine) G.Audio.sfx(PICK_SFX[p.kind]);
      return;
    }
    if (G.Coop.active) G.Coop.collected(p, who);
    if (mine || p.kind === 'bomb') G.Audio.sfx(PICK_SFX[p.kind]);
    if (p.kind === 'xp' || p.kind === 'xpBig') {
      pendingLevels += pl.gainXp(p.value * (G.Coop.active ? G.Coop.xpFactor() : 1));
      return;
    }
    if (p.kind === 'coin') {
      pl.coins += p.value;
      G.FX.dmgText(who.x, who.y - who.bodyH - 6, '+' + p.value, '#ffd23f');
      return;
    }
    if (p.kind === 'item') {
      if (mine) offerItem(p.value);
      return;
    }
    if (p.kind === 'ticket' || p.kind === 'ticket10') {
      if (p.kind === 'ticket') pl.t1++; else pl.t10++;
      bankTickets();
      G.FX.dmgText(who.x, who.y - who.bodyH - 8, p.kind === 'ticket' ? '+1 ticket' : '¡Ticket ×10!', p.kind === 'ticket' ? '#ffd23f' : '#d9a6ff', true);
      G.FX.ring(who.x, who.y, 6, 50, p.kind === 'ticket' ? '#ffd23f' : '#c47bff', 0.4, 3);
      return;
    }
    if (p.kind === 'heal') {
      if (mine) pl.heal(pl.maxHp * 0.3);
      G.FX.ring(who.x, who.y, 6, 60, '#5fe08a', 0.4, 3);
      return;
    }
    if (p.kind === 'magnet') {
      G.Pickups.pullAll();
      G.FX.ring(who.x, who.y, 10, 420, '#ff9ed8', 0.6, 4);
      return;
    }
    if (p.kind === 'bomb') {
      if (G.U.dist2(who.x, who.y, pl.x, pl.y) < 500 * 500) G.Camera.kick(0.8);
      const R = G.Camera.outerRadius();
      G.FX.ring(who.x, who.y, 20, R, '#ff7b3d', 0.5, 6);
      for (const e of G.EnemyMgr.all()) {
        if (mine ? !G.Camera.sees(e.x, e.y, 0) : G.U.dist2(e.x, e.y, who.x, who.y) > R * R) continue;
        e.hurt(60 + pl.level * 14, '#ff7b3d', e.x - who.x, e.y - who.y, 160);
      }
    }
  }

  // ---------------- teclado ----------------

  function handleKeys() {
    if (G.SettingsUI.isOpen) { if (G.Input.tap('escape')) G.SettingsUI.close(); return; }
    // Aviso de otra pestaña: en solitario sólo «Jugar aquí» devuelve el control.
    if (!G.Coop.active && G.UI.tabBlocked()) return;
    // La Sentencia de Arceus: Espacio, Intro o Esc saltan la animación (si se puede).
    if (G.Judgment.cinematic && state === 'playing') {
      if (['space', 'enter', 'escape'].some(k => G.Input.tap(k))) G.Judgment.skip();
      return;
    }
    if (state === 'levelup') {
      for (let i = 0; i < 3; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.RunUI.pick(i);
      }
      if (G.Input.tap('keyr')) G.RunUI.reroll();
      if (G.Input.tap('keyx')) G.RunUI.toggleDiscard();
      return;
    }
    if (G.UI.isOpen('scr-bond')) {
      for (let i = 0; i < 4; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.RunUI.pickBond(i);
      }
      return;
    }
    if (G.EvoUI.isOpen()) {
      for (let i = 0; i < 9; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.EvoUI.pick(i);
      }
      return;
    }
    if (G.UI.isOpen('scr-item')) {
      for (let i = 0; i < 2; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) document.querySelectorAll('#item-cards .card')[i].click();
      }
      return;
    }
    if (state === 'ui') {
      // Esc en una subpantalla del menú vuelve al menú.
      if (G.Input.tap('escape') && !G.UI.isOpen('scr-profile') && ['scr-dex', 'scr-upgrades', 'scr-shop', 'scr-bag', 'scr-gacha', 'scr-friends', 'scr-rank', 'scr-goals'].some(G.UI.isOpen)
          && document.getElementById('pull-fx').classList.contains('hidden')) {
        // En la colección, Esc hace lo mismo que «Volver»: con la ficha abierta, la cierra.
        const back = G.UI.isOpen('scr-dex') && document.querySelector('#scr-dex [data-back]');
        if (back) back.click(); else G.MenuUI.open();
      }
      return;
    }
    // Teclas de Ajustes > Controles (de serie: P, 1-4, Q y E o Tab). Esc pausa siempre.
    if (G.Input.tap('escape') || G.Input.act('pause')) { togglePause(); return; }
    if (state !== 'playing' || !pl) return;
    for (let i = 0; i < 4; i++) {
      if (G.Input.act('m' + (i + 1))) pl.setActive(i);
    }
    // Caído en grupo: Q / E cambian a quién miras.
    if (pl.dead) { if (G.Input.act('prev')) cycleWatch(-1); if (G.Input.act('next')) cycleWatch(1); return; }
    if (G.Input.act('prev')) pl.cycle(-1);
    if (G.Input.act('next')) pl.cycle(1);
  }

  // ---------------- bucle ----------------

  let deathT = 0;

  // Caído en grupo: puedes mirar a un compañero vivo. Sólo cambia a quién
  // sigue la cámara (y el anfitrión te manda los enemigos de allí).
  let watch = null;
  /** El compañero al que miras, o null si miras tu cuerpo. */
  function watched() {
    if (!pl || !pl.dead || !G.Coop.active) return (watch = null);
    if (watch && (watch.dead || !G.Coop.puppets().includes(watch))) watch = G.Coop.puppets().find(p => !p.dead) || null;
    return watch;
  }
  /** Cambia a quién miras: tú → cada compañero vivo → tú. */
  function cycleWatch(dir) {
    const list = [null, ...G.Coop.puppets().filter(p => !p.dead)];
    if (list.length < 2) return;
    watch = list[(list.indexOf(watched()) + dir + list.length) % list.length];
    G.Audio.sfx('click');
  }

  let frameDt = 0, speedK = 1, bdAcc = 0;
  let fpsShown = 60, fpsAcc = 0, fpsN = 0;
  // El siguiente fotograma se pide ANTES de nada: si algo falla a mitad, el
  // juego sigue (antes se quedaba congelado para siempre y había que recargar;
  // así se perdió una partida enorme al abrirse una grieta).
  // Si falla fotograma tras fotograma (el juego ya no avanza ni se ve), la
  // partida se da por terminada a los ~3 s y se guarda: tiempo, derrotados,
  // récords y ranking. Mejor eso que una pantalla negra y perderlo todo.
  let loopErrs = 0, errRun = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    try { frame(ts); errRun = 0; }
    catch (e) {
      if (loopErrs++ < 5) console.error('[Game] fallo en un fotograma:', e);
      G.Input.endFrame();
      if (++errRun === 180 && pl && state !== 'ui' && state !== 'over') {
        try {
          G.UI.hideAll();
          quitRun();
          G.UI.toast('El juego ha fallado: tu partida se ha guardado hasta aquí', 5000);
        } catch (e2) { console.error('[Game] no se pudo cerrar la partida:', e2); }
      }
    }
  }

  function frame(ts) {
    const real = (ts - last) / 1000 || 0;
    const dt = Math.min(1 / 30, real) * speedK;
    last = ts;
    if (state === 'playing') G.Settings.sample(real);
    fpsAcc += real; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    frameDt = state === 'playing' ? dt : 0;
    // El destello se apaga en cualquier estado: antes sólo jugando y, al volver
    // de una grieta con el vínculo abierto, la pantalla se quedaba morada (#114).
    if (flashT > 0) flashT -= dt;
    watchdog(real);
    // Red de seguridad: si la ventana ha cambiado de tamaño (girar el móvil) y no ha
    // llegado el aviso de resize (pasa en algunos iPhone), se reajusta igual.
    if (innerWidth !== seenW || innerHeight !== seenH) { seenW = innerWidth; seenH = innerHeight; resizeSoon(); }

    G.Pad.poll(real);
    handleKeys();
    // Ultra: cámara inclinada con perspectiva (D3). Antes de la lógica: la puntería con
    // el ratón, lo que se ve y dónde salen los enemigos ya cuentan con ella.
    G.Camera.persp = G.Settings.ultra ? D3.PERSP : 0;

    if (state === 'playing') update(dt);
    else if (pl && state !== 'ui') { G.FX.update(dt * 0.25); pl.anim.update(dt * 0.25); }
    // La red se atiende siempre (también con las cartas de nivel abiertas).
    if (G.Coop.active && pl && state !== 'ui' && state !== 'over') G.Coop.tick(dt);

    if (pl && state !== 'ui') render();
    else {
      // Fondo del menú: a 30 FPS como mucho, y quieto detrás de las pantallas
      // grandes (colección, tienda, mejoras): casi no se ve y calentaba portátiles.
      bdAcc += real;
      if (Backdrop.due(bdAcc)) { Backdrop.render(ctx, w, h, dpr, Math.min(1 / 15, Math.max(0, bdAcc)) * speedK); bdAcc = 0; }
    }
    G.UI.tick(dt);

    G.Input.endFrame();
  }

  /*
   * Vigilante (#262): en solitario, cartas de nivel o elección de vínculo u
   * objeto sin su pantalla (se ha cerrado o ha fallado al abrirse) dejaban la
   * partida congelada; a los 1,5 s se sigue jugando. Y si la partida ha
   * acabado sin que se vea el resumen ni otra pantalla, se enseña.
   */
  let lostT = 0;
  function watchdog(real) {
    const s = state;
    const lost = !pl ? false
      : s === 'over' ? !G.UI.isOpen('scr-over')
      : (s === 'levelup' || s === 'choice') && !G.Coop.active &&
        !(s === 'levelup' ? G.UI.isOpen('scr-levelup') : G.UI.isOpen('scr-item') || G.UI.isOpen('scr-bond') || G.EvoUI.isOpen());
    if (!lost) { lostT = 0; return; }
    lostT += Math.min(Math.max(real, 0), 0.1);
    if (lostT < 1.5) return;
    lostT = 0;
    if (s === 'over') {
      // Con otra pantalla encima, o cerrando sesión (db.js oculta todo mientras sube), se deja como está.
      if (!overArgs || G.DB.leaving || document.querySelector('.scr:not(.hidden)')) return;
      console.warn('[Game] partida acabada sin resumen: se enseña');
      showResults();
      return;
    }
    console.warn('[Game] estado ' + s + ' sin su pantalla: se sigue jugando');
    if (s === 'levelup') G.RunUI.closeLevelUp();
    else { openItem = null; G.UI.hide('scr-item'); G.UI.hide('scr-bond'); cancelEvo(); }
    state = 'playing';
  }

  function update(dt) {
    const coop = G.Coop.active;
    // La Sentencia de Arceus: mientras dura la animación, todo lo demás se para.
    if (G.Judgment.cinematic) {
      G.Judgment.cineTick(dt);
      pl.anim.update(dt);
      if (coop) for (const p of G.Coop.puppets()) p.netUpdate(dt);
      G.World.update(dt, G.Camera);
      G.FX.update(dt);
      G.Audio.music(G.Judgment.music);
      return;
    }
    // Tras caer, deja que se vea la animación de Faint antes del resumen.
    // (En la arena de la grieta no: allí caer sólo te echa de vuelta.)
    if (pl.dead && !coop && !G.Rift.inArena) {
      deathT += dt;
      pl.update(dt);
      G.EnemyMgr.update(dt * 0.3, pl);
      G.FX.update(dt);
      G.Camera.follow(pl.x, pl.y, dt);
      if (deathT > 1.3) { deathT = 0; endRun(true); }
      return;
    }
    time += dt;

    const b = Math.floor(time / 240);
    if (b !== biome && !G.Rift.inArena && !G.Judgment.active) {
      biome = b;
      G.World.setBiome(b);
      G.Audio.sfx('biome');
      G.Spawner.say('— ' + G.World.biomeName() + ' —', 3);
      G.FX.ring(pl.x, pl.y, 10, G.Camera.outerRadius(), '#ffffff', 0.7, 6);
    }

    pl.frozen = coop && (G.UI.isOpen('scr-pause') || G.UI.isOpen('scr-item'));
    pl.update(dt);
    evoTick(dt);
    if (coop) {
      for (const p of G.Coop.puppets()) { p.netUpdate(dt); G.Combat.ghostOrbit(p, dt, time); }
      if (pl.dead) reviveTick(dt);
    }
    const view = watched() || pl;
    G.Camera.follow(view.x, view.y, dt);
    G.World.update(dt, G.Camera);

    const all = everyone();
    if (!coop || G.Coop.isHost) { G.Path.update(dt, all); G.Spawner.update(dt, all, time); }
    else G.Spawner.tickBanner(dt);
    G.EnemyMgr.update(dt, all);
    G.EnemyMgr.rebuildGrid();
    G.Combat.tick(dt, pl, time);
    G.Projectiles.update(dt, pl, G.EnemyMgr.all());
    G.Combat.resolve(dt, pl, time);
    G.Combat.updateFields(dt);
    G.Pickups.update(dt, all, onCollect);
    G.Hazards.update(dt);
    G.Interact.update(dt, pl);
    G.Rift.update(dt, pl, time);
    G.Judgment.update(dt, pl, time);
    G.Events.update(dt, all, time);
    G.Weather.update(dt, time, pl);
    G.FX.update(dt);

    G.Audio.music(G.Judgment.active ? G.Judgment.music : G.Rift.inArena ? 'rift' : G.EnemyMgr.bossAlive() ? 'boss' : G.BIOME_MUSIC[biome % G.BIOME_MUSIC.length]);
    if (!coop || G.Coop.isHost) maybeLevelUp();
    if (pl.bonds > 0) offerBond(true);
    if (G.Coop.isHost) checkAllDown(dt);
  }

  /** Caído en grupo: un compañero a tu lado te va levantando. */
  function reviveTick(dt) {
    const helper = G.Coop.puppets().some(p => !p.dead && G.U.dist2(p.x, p.y, pl.x, pl.y) < 56 * 56);
    pl.reviveT = helper ? (pl.reviveT || 0) + dt : Math.max(0, (pl.reviveT || 0) - dt * 0.5);
    if (pl.reviveT >= G.Player.REVIVE_TIME) pl.revive(0.5);
  }

  /** Anfitrión: si caéis todos, se acaba (tras ver caer al último). */
  function checkAllDown(dt) {
    if (G.Rift.inArena || !G.Coop.players().every(p => p.dead)) { deathT = 0; return; }
    deathT += dt;
    if (deathT > 1.6) {
      deathT = 0;
      G.Coop.over(summary());
      endRun(true);
    }
  }

  // ---------------- dibujo ----------------

  function drawScene(cam, extra) {
    const t = performance.now() / 1000;
    G.World.drawGround(ctx, cam);
    G.World.drawLiquid(ctx, cam, t);
    G.Hazards.draw(ctx);
    G.Combat.drawGroundFields(ctx);
    G.Pickups.draw(ctx);

    // Todo lo que tiene "pies" se ordena por Y: objetos, enemigos, jugador.
    const items = [];
    // Los planos (manantiales, trampas) siempre debajo de todo lo demás.
    for (const p of G.World.visibleProps(cam)) items.push({ y: p.flat ? p.y - 4000 : p.y, prop: p });
    for (const e of G.EnemyMgr.drawables(cam)) items.push({ y: e.y, ent: e });
    for (const e of extra) items.push({ y: e.y, ent: e });
    const rift = G.Rift.drawable();
    if (rift) items.push({ y: rift.y, ent: rift });
    const arceus = pl && state !== 'ui' ? G.Judgment.drawable() : null;
    if (arceus) items.push({ y: arceus.y, ent: arceus });
    if (pl && state !== 'ui') for (const d of G.Events.drawables()) items.push({ y: d.y, ent: d });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.prop) G.World.drawProp(ctx, it.prop, t);
      else it.ent.draw(ctx);
    }
  }

  // ---------------- Ultra: el mundo en 2,5D (cámara inclinada de DS) ----------------
  /*
   * Con la calidad Ultra la cámara mira el suelo inclinada y con perspectiva
   * (G.Camera.persp, ver camera.js): arriba, lejos, todo un poco más pequeño; abajo,
   * cerca, un poco más grande; en el centro, tu Pokémon como siempre. Tres capas:
   *  1) SUELO: el mapa, el agua, trampas y manantiales, los avisos de ataques, los
   *     charcos y los objetos que se recogen, en un lienzo aparte a 1 px por unidad
   *     de mundo (el mapa, a ×2 justo: nítido). Pasa a la pantalla por franjas de dos
   *     filas de píxel de arte, cada una a su escala: la perspectiva, sin difuminar.
   *  2) DE PIE (Pokémon, árboles, rocas, paredes, la grieta...): en la pantalla, por
   *     orden de Y, cada uno de cara a la cámara y a la escala del sitio que pisa
   *     (como los sprites de los juegos de DS sobre su mapa 3D): nada se deforma. Las
   *     filas de pared, por tiras a la escala del suelo a su altura (bloques en
   *     perspectiva, con los lados siguiendo las líneas del suelo).
   *  3) AIRE (proyectiles, efectos, números): otro lienzo a la resolución de la
   *     pantalla que pasa igual, por franjas.
   * Todo usa la misma cuenta que G.Camera.toScreen: lo que se ve encaja con dónde
   * están las cosas (choques, golpes, puntería, toques). Coste: unos cientos de
   * drawImage y dos lienzos más (el del suelo, pequeño); nada se vuelve a pintar
   * píxel a píxel (medido el 28-10-2026: +1 a +3 ms por fotograma sobre Alta).
   */
  const D3 = (() => {
    const PERSP = G.Camera.ULTRA;     // 0,12: arriba de la pantalla, un 12 % más pequeño; abajo, un 12 % más grande
    const GB = 4;                     // franjas del suelo: 4 filas de mundo (2 de píxel de arte)
    const BAND = 8;                   // alto de las franjas de la capa de aire (px de pantalla)
    const WS = 6;                     // tiras de las filas de pared (px de arte; CAP_H = 24, 4 tiras)
    let gcv = null, gx = null, acv = null, ax = null;
    const fit = (c, W, H) => { if (c.width !== W) c.width = W; if (c.height !== H) c.height = H; };
    // La vista del lienzo del suelo (lo que necesitan World.drawGround / visibleProps).
    const view = { l: 0, t: 0, w: 0, h: 0, left() { return this.l; }, top() { return this.t; },
      sees(x, y, p = 60) { return x > this.l - p && x < this.l + this.w + p && y > this.t - p && y < this.t + this.h + p; } };

    function draw(cam, extra, air) {
      const Kd = cam.scale * dpr, K = cam.persp, hw = cam.w / 2, hh = cam.h / 2, a = K / hh;
      const shX = cam._sx, shY = cam._sy, cx = cam.x, cy = cam.y, Hd = cv.height;
      // Lo que se ve del mundo: más ancho arriba (lejos) que abajo.
      const ex = hw / (1 - K) + 12 + Math.abs(shX);
      const dvT = -hh / (1 - K) - 12 - Math.abs(shY), dvB = hh / (1 + K) + 12 + Math.abs(shY);
      const t = performance.now() / 1000;

      // 1) Suelo, a 1 px por unidad de mundo y alineado a los píxeles de arte (de 2 en 2).
      const ox = Math.floor((cx - ex) / 2) * 2, oy = Math.floor((cy + dvT) / 2) * 2;
      const GW = Math.ceil(cx + ex - ox) + 2, GH = (Math.ceil((cy + dvB - oy) / GB) + 1) * GB;
      if (!gcv) { gcv = document.createElement('canvas'); }
      fit(gcv, GW, GH);
      if (!gx) gx = gcv.getContext('2d', { alpha: false });
      view.l = ox; view.t = oy; view.w = GW; view.h = GH;
      gx.setTransform(1, 0, 0, 1, -ox, -oy);
      gx.imageSmoothingEnabled = false;
      G.World.drawGround(gx, view, true);
      G.World.drawLiquid(gx, view, t);
      const props = G.World.visibleProps(view);
      for (const p of props) if (p.flat) G.World.drawProp(gx, p, t);
      G.Hazards.draw(gx);
      G.Combat.drawGroundFields(gx);
      G.Pickups.draw(gx);
      // Lo de las firmas de los jefes (G.BossSig): lo del suelo (y = -1e9) va en este lienzo y
      // lo del aire (y = 1e9), en el de aire. Por orden de Y caían fuera de la vista y no se veían.
      const ens = G.EnemyMgr.drawables(cam);
      for (const e of ens) if (e.y <= -1e8) e.draw(gx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      for (let r = 0; r < GH; r += GB) {
        const v0 = oy + r - cy, v1 = v0 + GB;
        const y0 = Math.round((v0 / (1 - a * v0) + hh + shY) * Kd), y1 = Math.round((v1 / (1 - a * v1) + hh + shY) * Kd);
        if (y1 <= 0 || y1 <= y0) continue;
        if (y0 >= Hd) break;
        const s = 1 / (1 - a * (v0 + GB / 2));
        ctx.drawImage(gcv, 0, r, GW, GB, ((ox - cx) * s + hw + shX) * Kd, y0, GW * s * Kd, y1 - y0);
      }

      // 2) De pie, por orden de Y; cada uno a la escala del sitio que pisa.
      const items = [];
      for (const p of props) if (!p.flat) items.push({ y: p.y, prop: p });
      for (const e of ens) if (Math.abs(e.y) < 1e8) items.push({ y: e.y, ent: e });
      for (const e of extra) items.push({ y: e.y, ent: e });
      const rift = G.Rift.drawable();
      if (rift) items.push({ y: rift.y, ent: rift });
      const arceus = pl && state !== 'ui' ? G.Judgment.drawable() : null;
      if (arceus) items.push({ y: arceus.y, ent: arceus });
      if (pl && state !== 'ui') for (const d of G.Events.drawables()) items.push({ y: d.y, ent: d });
      items.sort((p, q) => p.y - q.y);
      const TS = G.World.TS, PX = G.Sprites.PX, RAISE_W = G.Tiles.RAISE * PX, CAP_H = G.Tiles.CAP_H;
      for (const it of items) {
        const o = it.prop || it.ent;
        // (Las filas de pared se apoyan en el borde de abajo de su fila y en vertical van
        // como el suelo, s²: así una fila empieza justo donde acaba la de detrás.)
        const fx = o.wallrow ? cx : o.x, fy = o.wallrow ? o.y - 1 + TS : o.y;
        const dv = fy - cy, s = 1 / (1 - a * dv), k = s * Kd, ky = o.wallrow ? k * s : k;
        // Dónde caen sus pies en la pantalla: lo que no se ve, ni se dibuja (lo alto
        // sube desde los pies: puede asomar aunque los pies queden por debajo).
        const sx = ((fx - cx) * s + hw + shX) * Kd, sy = (dv * s + hh + shY) * Kd;
        if (sy < -60 * k || sy > Hd + 260 * k || sx < -200 * k || sx > cv.width + 200 * k) continue;
        if (o.wallrow) {
          // Fila de pared por tiras de WS px de arte: cada tira, a la escala del suelo a su
          // altura en la pantalla, así los lados de las paredes siguen las líneas del suelo
          // (antes, toda la fila a una escala: escalones en los lados). En vertical, igual.
          // (Sin cara frontal, la tira sólo lleva la meseta: T filas de arte.)
          const w00 = fy - TS - RAISE_W, end = o.face ? CAP_H : G.Tiles.T;
          for (let a0 = 0; a0 < end; a0 += WS) {
            const w0 = w00 + a0 * PX, w1 = w0 + WS * PX;
            const y0 = Math.round(sy + ky * (w0 - fy)), y1 = Math.round(sy + ky * (w1 - fy));
            if (y1 <= y0 || y1 <= 0 || y0 >= Hd) continue;
            const ks = (1 + a * ((y0 + y1) / 2 / Kd - hh - shY)) * Kd, kys = (y1 - y0) / (w1 - w0);
            ctx.setTransform(ks, 0, 0, kys, (hw + shX) * Kd - ks * cx, y0 - kys * w0);
            G.World.drawProp(ctx, o, t, a0, a0 + WS);
          }
          continue;
        }
        ctx.setTransform(k, 0, 0, ky, sx - k * fx, sy - ky * fy);
        if (it.prop) G.World.drawProp(ctx, it.prop, t); else it.ent.draw(ctx);
      }

      // 3) Aire: proyectiles y efectos, en su lienzo, y a la pantalla por franjas.
      if (air) {
        const aox = cx - ex, aoy = cy + dvT;
        const AW = Math.ceil(2 * ex * Kd) + 2, AH = Math.ceil((dvB - dvT) * Kd) + 2;
        if (!acv) { acv = document.createElement('canvas'); }
        fit(acv, AW, AH);
        if (!ax) ax = acv.getContext('2d');
        ax.setTransform(1, 0, 0, 1, 0, 0);
        ax.clearRect(0, 0, AW, AH);
        ax.setTransform(Kd, 0, 0, Kd, -aox * Kd, -aoy * Kd);
        ax.imageSmoothingEnabled = false;
        G.Projectiles.draw(ax);
        G.Combat.drawAirFields(ax);
        G.FX.draw(ax);
        G.Judgment.drawAir(ax);
        for (const e of ens) if (e.y >= 1e8) e.draw(ax);
        // (Sin suavizar: nítido y bastante más barato que con suavizado.)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let y = 0; y < Hd; y += BAND) {
          const Y0 = y / Kd - hh - shY, Y1 = (y + BAND) / Kd - hh - shY;
          const sy0 = (cy + Y0 / (1 + a * Y0) - aoy) * Kd, sy1 = (cy + Y1 / (1 + a * Y1) - aoy) * Kd;
          if (sy1 <= 0 || sy0 >= AH) continue;
          const s = 1 + a * (Y0 + Y1) / 2;
          ctx.drawImage(acv, 0, sy0, AW, sy1 - sy0, ((aox - cx) * s + hw + shX) * Kd, y, AW * s, BAND);
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    return { PERSP, draw };
  })();

  /*
   * Apuntar a mano: una mira donde está el ratón (y el cursor en cruz), o
   * delante de tu Pokémon si apuntas con el stick derecho.
   */
  function drawAimMark() {
    const on = state === 'playing' && pl && pl.manualAim && !G.Judgment.cinematic;
    const cur = on && !G.Pad.aim() ? 'crosshair' : '';
    if (cv.style.cursor !== cur) cv.style.cursor = cur;
    if (!on) return;
    let x, y;
    if (G.Pad.aim()) {
      // (Con G.Camera.toScreen: en Ultra, con la perspectiva.)
      ({ x, y } = G.Camera.toScreen(pl.x + Math.cos(pl.aim) * 90, pl.y + Math.sin(pl.aim) * 90));
      y -= G.LIFT * 0.5 * G.Camera.scale * G.Camera.scaleAt(pl.y);
    } else ({ x, y } = G.Input.mouse());
    ctx.save();
    ctx.lineCap = 'round';
    for (const [col, lw] of [['rgba(0,0,0,.65)', 4], ['#ffe9a8', 1.6]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 5, y + dy * 5); ctx.lineTo(x + dx * 14, y + dy * 14); }
      ctx.stroke();
    }
    ctx.restore();
  }

  let fogG = null, fogW = 0, fogH = 0;
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!G.Camera.persp) ctx.clearRect(0, 0, w, h);     // (en Ultra el suelo ya tapa toda la pantalla)
    ctx.imageSmoothingEnabled = false;

    const ents = G.Coop.active ? [pl, ...G.Coop.puppets()] : [pl];
    const stone = G.EvoUI.drawable();     // la piedra de su evolución, en el suelo
    if (stone) ents.push(stone);
    if (G.Camera.persp) D3.draw(G.Camera, ents, true);
    else {
      ctx.save();
      ctx.scale(G.Camera.scale, G.Camera.scale);
      G.Camera.apply(ctx);
      drawScene(G.Camera, ents);
      G.Projectiles.draw(ctx);
      G.Combat.drawAirFields(ctx);
      G.FX.draw(ctx);
      G.Judgment.drawAir(ctx);
      ctx.restore();
    }

    G.Weather.draw(ctx, w, h, frameDt);
    G.World.drawVignette(ctx, w, h);
    // Niebla: la viñeta se cierra un poco (sin tapar el centro).
    // (El degradado se guarda y la intensidad va con globalAlpha: mismo resultado.)
    const fog = G.Weather.vignette;
    if (fog > 0) {
      if (!fogG || fogW !== w || fogH !== h) {
        fogG = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
        fogG.addColorStop(0, 'rgba(200,205,220,0)');
        fogG.addColorStop(1, 'rgba(200,205,220,.45)');
        fogW = w; fogH = h;
      }
      ctx.globalAlpha = Math.min(1, fog);
      ctx.fillStyle = fogG;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (!G.Judgment.cinematic) G.HUD.draw(ctx, w, h, pl, st);
    G.Judgment.drawOverlay(ctx, w, h);
    // (En el viaje por la grieta no hay HUD ni joystick: toda la pantalla es el botón de saltarlo.)
    if (!G.Rift.traveling) G.Touch.draw(ctx);
    drawAimMark();
    if (G.Settings.get('fps')) {
      ctx.save();
      ctx.font = '600 12px Fredoka,"Segoe UI",system-ui,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = fpsShown >= 50 ? '#5fe08a' : fpsShown >= 30 ? '#ffd23f' : '#ff5f6d';
      ctx.fillText(fpsShown + ' FPS', w - 10, h - 8);
      ctx.restore();
    }
    if (flashT > 0) {
      ctx.save();
      // "Menos destellos": el fogonazo de pantalla se queda en un tercio.
      ctx.globalAlpha = Math.min(1, flashT / flashDur * 1.4) * (G.Settings.get('calm') ? 0.3 : 1);
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // ---------------- fondo de los menús ----------------

  /**
   * El mundo de verdad, con Pokémon salvajes paseando y la cámara a la deriva.
   * Así el menú enseña desde el primer segundo cómo se ve el juego.
   */
  const Backdrop = (() => {
    let wanderers = [], t = 0, ready = false, biomeT = 0, bi = 0;
    const CAST = [1, 4, 7, 25, 133, 52, 39, 35, 16, 43, 60, 69, 74, 92, 129, 147, 113, 143, 54, 79];

    function init() {
      G.World.reset(4242);
      G.World.setBiome(0, true);
      G.Camera.x = 0; G.Camera.y = 0;
      wanderers = CAST.map(dex => spawn(dex, true));
      ready = true;
    }

    function spawn(dex, anywhere) {
      const a = new G.Sprites.Animator(dex, 1);
      const r = G.Sprites.bodyRadius(dex);
      let x = 0, y = 0;
      for (let i = 0; i < 20; i++) {
        x = G.Camera.x + G.U.rand(-1, 1) * (anywhere ? G.Camera.w * 0.6 : G.Camera.w * 0.7);
        y = G.Camera.y + G.U.rand(-1, 1) * (anywhere ? G.Camera.h * 0.6 : G.Camera.h * 0.7);
        if (G.World.isFree(x, y, r)) break;
      }
      return { dex, anim: a, x, y, r, vx: 0, vy: 0, t: 0, draw(ctx) {
        G.Sprites.drawShadow(ctx, this.dex, this.x, this.y);
        this.anim.draw(ctx, this.x, this.y);
      } };
    }

    function step(dt) {
      t += dt;
      G.World.update(dt, G.Camera);
      // Deriva lenta de la cámara.
      G.Camera.x += Math.cos(t * 0.05) * 14 * dt;
      G.Camera.y += Math.sin(t * 0.037) * 10 * dt;
      G.Camera.follow(G.Camera.x, G.Camera.y, dt);

      biomeT += dt;
      if (biomeT > 30) { biomeT = 0; bi = (bi + 1) % 3; G.World.setBiome(bi); }

      for (const wd of wanderers) {
        wd.t -= dt;
        if (wd.t <= 0) {
          // Pasea, se para o "ataca" al aire de vez en cuando.
          wd.t = G.U.rand(1, 3.5);
          const r = Math.random();
          if (r < 0.55) {
            const a = Math.random() * 6.2832, s = G.U.rand(25, 55);
            wd.vx = Math.cos(a) * s; wd.vy = Math.sin(a) * s;
          } else {
            wd.vx = wd.vy = 0;
            if (r > 0.85) wd.anim.play(G.U.pick(['Attack', 'Shoot', 'Charge']));
          }
        }
        wd.x += wd.vx * dt; wd.y += wd.vy * dt;
        G.World.collide(wd);
        const moving = Math.abs(wd.vx) + Math.abs(wd.vy) > 1;
        if (moving) wd.anim.dir = G.Sprites.dirFromAngle(Math.atan2(wd.vy, wd.vx));
        wd.anim.loop(moving ? 'Walk' : 'Idle');
        wd.anim.update(dt);
        // Si se queda fuera de cámara, reaparece dentro.
        if (!G.Camera.sees(wd.x, wd.y, 120)) Object.assign(wd, spawn(wd.dex, false));
      }
    }

    // Pantallas grandes con el fondo casi tapado: mientras están abiertas, el
    // fondo se queda quieto (no se repinta). shown: el lienzo tiene el fondo.
    const BIG = ['scr-dex', 'scr-upgrades', 'scr-shop', 'scr-bag'];
    let bigEls = null, shown = false;
    function covered() {
      if (!bigEls) bigEls = BIG.map(id => document.getElementById(id)).filter(Boolean);
      for (const el of bigEls) if (!el.classList.contains('hidden')) return true;
      return false;
    }
    /**
     * ¿Toca repintarlo? Si el lienzo no lo tiene (se acaba de borrar o venimos
     * de una partida), ya; si no, cada 1/30 s y sólo si no lo tapa una pantalla grande.
     */
    function due(acc) { return !shown || (acc >= 1 / 32 && !covered()); }

    function render(ctx, w, h, dpr, dt) {
      if (!ready) return;
      shown = true;
      step(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      G.Camera.persp = G.Settings.ultra ? D3.PERSP : 0;
      if (G.Camera.persp) D3.draw(G.Camera, wanderers, false);
      else {
        ctx.save();
        ctx.scale(G.Camera.scale, G.Camera.scale);
        G.Camera.apply(ctx);
        drawScene(G.Camera, wanderers);
        ctx.restore();
      }
      G.World.drawVignette(ctx, w, h);
    }

    /** Al volver de una run, recupera el mundo del menú. */
    function restore() {
      G.World.reset(4242);
      G.World.setBiome(bi, true);
      G.FX.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.clear(); G.Pickups.clear();
      wanderers = CAST.map(dex => spawn(dex, true));
      shown = false;
    }

    return { init, render, restore, due, stale() { shown = false; } };
  })();

  return {
    init, startRun, everyone, levelXp, flash, offerBond,
    /** Para pruebas: salta el reloj de la run. */
    debugTime(t) { tampered = true; time = t; },
    /** Para grabar vídeos: cámara lenta (0,5 = mitad de velocidad). */
    debugSpeed(k) { if (k > 1) tampered = true; speedK = k; },
    togglePause, cycleWatch,
    /** El compañero al que miras estando caído (o null). */
    get watching() { return watched(); },
    /** Abandona la partida en curso (p. ej. al cerrar sesión desde Ajustes). */
    quit() { if (state !== 'ui' && state !== 'over') quitRun(); },
    /** Llamar antes de recargar o salir a propósito: el navegador no pregunta. */
    allowLeave() { leaving = true; },
    /** Para grabar vídeos: abre las cartas de subir de nivel. */
    debugLevelUp() { tampered = true; pl.level++; pendingLevels++; },
    toUI() { state = 'ui'; if (cv) cv.style.cursor = ''; Backdrop.restore(); },
    get state() { return state; }, get player() { return pl; }, st
  };
})();

/* ============ Flow — transiciones entre pantallas ============ */
G.Flow = {
  boot() {
    G.UI.initChrome();
    G.LoginUI.init(); G.TestUI.init(); G.MenuUI.init(); G.GachaUI.init();
    G.SocialUI.init(); G.RankingUI.init(); G.ModUI.init(); G.GoalsUI.init(); G.ProfileUI.init(); G.SettingsUI.init(); G.NewsUI.init(); G.Updater.init();
    // Tu nombre arriba a la derecha abre tu perfil.
    document.getElementById('user-pill').onclick = () => G.GoalsUI.open('profile');
    G.Audio.music('village');     // suena tras el primer clic (lo exige el navegador)
    G.Game.init();
    // La base de datos (nube o local) recupera la sesión anterior.
    // (Devuelve la promesa: si falla, main.js ofrece recargar.)
    return G.DB.ready().then(restored => {
      document.getElementById('boot').classList.add('hidden');
      // En otra tarea: crear el sonido para comprobarlo cuesta ~60 ms y no debe bloquear la carga.
      setTimeout(() => this.tapToStart(() => { if (restored) this.afterLogin(); else this.toLogin(); }), 0);
    });
  },
  /**
   * "Pulsa para empezar": los navegadores no dejan que una web suene hasta
   * que se toca algo. Con esta pantalla la música empieza en cuanto entras.
   * (Si el navegador ya deja sonar, no sale.)
   */
  tapToStart(then) {
    G.Audio.unlock();
    if (G.Audio.canPlay()) { then(); return; }
    const el = document.getElementById('tap-start');
    el.classList.remove('hidden');
    const go = e => {
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      G.Audio.unlock();
      el.classList.add('hidden');
      el.removeEventListener('click', go); removeEventListener('keydown', go, true);
      then();
    };
    el.addEventListener('click', go);
    addEventListener('keydown', go, true);
  },
  toLogin() { G.Audio.music('village'); G.LoginUI.open(); },
  afterLogin() {
    G.Audio.music('village');
    if (!G.DB.save.partner) G.TestUI.start();
    else this.goMenu();
  },
  goMenu() {
    if (G.Game.state !== 'ui') G.Game.toUI();
    G.Audio.music('village');
    G.MenuUI.open();
    if (!G.LoginUI.updateNotices()) G.LoginUI.offerRecovery();
  },
  /** Al cerrar el resumen: a la sala si sigues en una, si no al menú. */
  afterRun() {
    if (G.Social.room) {
      if (G.Game.state !== 'ui') G.Game.toUI();
      G.Audio.music('village');
      if (G.Social.room.isHost) G.Social.setOpen(true);
      G.LobbyUI.open();
    } else {
      // La sala se cerró durante la partida (la red se mantuvo hasta acabarla).
      if (G.Net.open_) G.Net.close();
      this.goMenu();
    }
  },
  play() { G.Game.startRun(); },
  /**
   * Empieza la partida en grupo (el anfitrión la manda a todos; `from`: quién la
   * manda, si llega por la red). También desde el resumen de la partida
   * anterior: antes se ignoraba y el anfitrión te esperaba para siempre.
   */
  startCoop(cfg, from) {
    const room = G.Social.room, st = G.Game.state;
    if ((st !== 'ui' && st !== 'over') || !room) return;
    if (from !== undefined && (from !== room.host || cfg.host !== room.host)) return;
    if (!Array.isArray(cfg.members) || !cfg.members.some(m => m && m.uid === G.Social.uid)) return;
    G.LobbyUI.close();
    G.Game.startRun(cfg);
  }
};
