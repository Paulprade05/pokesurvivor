/* ============ spawner.js — oleadas, jefes y shinies ============
 * Los enemigos aparecen en un anillo justo fuera de la vista, así que nunca
 * se materializan en pantalla. Cada ~45 s (desde el minuto 18, cada ~30 s)
 * hay una oleada para romper el ritmo (como en Vampire Survivors):
 *
 *   marea      una avalancha concentrada desde un lado
 *   cerco      un anillo de Pokémon todo alrededor que se va cerrando (desde el minuto 6)
 *   estampida  una columna que cruza en línea recta a toda velocidad, con un hueco
 *   enjambre   muchos voladores débiles y rápidos desde un lado
 *
 * Tramo final (23-10-2026, «más difícil sobre todo de los minutos 20 a 30»):
 * del minuto 12 al 30 los enemigos ganan poco a poco hasta +45 % de vida y
 * +30 % de daño, del 18 al 28 caben más a la vez (de 64 a 80), salen más
 * campeones (élite grande y con aura, desde el minuto 8) y siguen llegando
 * jefes del calendario (antes el último era el del minuto 15), dos a la vez
 * en los minutos 24 y 27. Los primeros minutos no cambian.
 *
 * Curva revisada el 26-10-2026 (medida con un bot en partidas reales): la fuerza de
 * los enemigos va con el tiempo «efectivo» de G.Enemies.eff (más suave al principio,
 * más dura al final), el tramo final empieza en el 15 y llega a +60 % de vida y +40 %
 * de daño, al principio caben menos a la vez (capAt) y, hasta el 20, un jefe espera
 * más a que caiga el anterior (bossLate).
 *
 * Cada enemigo tiene 1/4096 de salir shiny (como en los juegos clásicos).
 * Una run mata 1.500–4.000, así que sale uno cada 1–3 partidas.
 *
 * Cooperativo (sólo en el anfitrión): aparecen alrededor de un jugador vivo
 * al azar, fuera de la vista de TODOS, y hay más y más fuertes según cuántos
 * jugáis (ver G.Coop.scaleRate / scaleHp).
 */
G.Spawner = (() => {
  // Tope de enemigos a la vez (antes 420: con tantos se ralentizaba). Cuando
  // se llega al tope, los que siguen saliendo son "élite" (más vida, daño y
  // experiencia), así la dificultad no baja. Del minuto 18 al 28 el tope sube
  // poco a poco hasta CAP_LATE. Las oleadas se pueden pasar del tope en OVER.
  const CAP = 64, CAP_LATE = 78, OVER = 20, ELITE_FROM = 0.85;
  // (26-10-2026) Al principio caben menos (CAP_EARLY hasta el minuto 6, y sube hasta CAP en el 15): sin
  // mejoras te rodeaban ya hacia el minuto 5 y no había forma de salir. Del 15 en adelante, como antes.
  const CAP_EARLY = 50;
  // (29-10-2026) Y en los primeros 6 minutos, de CAP_START a CAP_EARLY: un Pokémon que empieza flojo (Gible, Charmander) y sin
  // mejoras se veía rodeado de 50 en el minuto 2 y caía ahí.
  const CAP_START = 28;
  const capAt = t => (t < 360 ? Math.round(CAP_START + (CAP_EARLY - CAP_START) * G.U.clamp(t / 360, 0, 1)) :
                      t < 1080 ? Math.round(CAP_EARLY + (CAP - CAP_EARLY) * G.U.clamp((t - 360) / 720, 0, 1))
                               : CAP + Math.round((CAP_LATE - CAP) * G.U.clamp((t - 1080) / 600, 0, 1)));
  // Menos Pokémon pero más fuertes (la pantalla no se satura): salen ~24% de
  // los de antes, cada uno con más vida, daño y experiencia.
  const DENSITY = 0.24, DMG_K = 2.4;
  // Tiempo «efectivo» de la fuerza de los enemigos (26-10-2026, ver G.Enemies.eff):
  // al principio corre más despacio que el reloj y al final, más deprisa.
  const eff = t => G.Enemies.eff(t);
  // La resistencia extra crece con la run: al principio ×3,3 y hasta ×5
  // hacia el minuto 6 (efectivo), cuando ya tienes ataques para tumbarlos.
  const hpK = t => 3.3 + Math.min(1.7, eff(t) / 210);
  // Tramo final (26-10-2026, con el reloj real): de 0 en el minuto 15 a 1 en el
  // 30, despacio al principio; hasta +60 % de vida y +40 % de daño. Así del 20 al
  // 30 sigue siendo lo más duro aunque lo de antes vaya más suave.
  const lateR = t => Math.pow(G.U.clamp((t - 900) / 900, 0, 1), 1.5);
  const lateHp = t => 1 + 0.8 * lateR(t), lateDmg = t => 1 + 0.55 * lateR(t);
  // Campeones: del 1 % en el minuto 8 (efectivo; el 16 del reloj) al 6 %; como
  // mucho 2 vivos (3 desde el 12 efectivo, 4 desde el 18).
  const CHAMP_FROM = 480;
  const champChance = t => { const e = eff(t); return e < CHAMP_FROM ? 0 : Math.min(0.065, 0.01 + (e - CHAMP_FROM) / 24000); };
  const champMax = t => { const e = eff(t); return e < 720 ? 2 : e < 1080 ? 3 : 4; };
  const SHINY_RATE = 1 / 4096;
  const BOSS_GAP = 45, BOSS_LATE = 60;
  // (26-10-2026) Hasta el minuto 20 el siguiente jefe espera más al anterior (90 s): se juntaban dos o
  // tres jefes que no se podían tumbar y ahí acababa la partida (sin mejoras hacia el 6; con todas, hacia el 15).
  const bossLate = t => (t < 1200 ? 90 : BOSS_LATE);
  // (29-10-2026) Con 2 jefes del mapa vivos, el siguiente del calendario espera a que caiga uno, aunque ya
  // lleve retraso: medido con tools/curve.cjs, se llegaban a juntar 4 (y con ellos, la partida se acababa).
  // (Revisión 2: el tope cuenta el grupo entero; con 1 vivo, un dúo del final salía igual y quedaban 3. Ahora el dúo
  //  espera a que no quede ninguno.)
  const MAP_BOSS_MAX = 2;
  // (Revisión 2) Mientras dura un jefe salen 4 veces menos enemigos; para que no se atasque el nivel (un Garchomp
  //  flojo seguía en el Nv. 23 en el minuto 10 y en el 31 en el 20), cada uno da FIGHT_XP veces su experiencia.
  const FIGHT_XP = { xp: 2.5 };
  const mapBosses = () => { let n = 0; for (const e of G.EnemyMgr.bosses()) if (!e.legend && !e.judge) n++; return n; };
  // Oleadas: desde cuándo hay de las nuevas y cuánto pesa cada una (antes y después del minuto 18).
  const WAVE_FROM = 360, LATE = 1080;
  const WAVES = {
    early: [['surge', 5.5], ['ring', 2], ['swarm', 1.5], ['stampede', 1]],
    late:  [['surge', 3], ['ring', 2.5], ['swarm', 2], ['stampede', 2.5]]
  };
  const surgeGap = t => (t >= LATE ? G.U.rand(26, 38) : G.U.rand(38, 56));
  let acc = 0, bossIdx = 0, surgeT = 32, announce = null, announceT = 0, preloadT = 0, lastWave = null;
  let lastBossT = -Infinity;    // cuándo salió el último jefe del calendario
  let forceShiny = 0;           // para pruebas: los N próximos salen shiny

  function reset() {
    acc = 0; bossIdx = 0; surgeT = 32; announce = null; announceT = 0; preloadT = 0; lastBossT = -Infinity; lastWave = null;
    queue.length = 0; annPrio = 1; annAge = 0; annCol = null;
    G.Enemies.rollRun();
    G.Sprites.preload(G.Enemies.upcomingDex(0, 80));
  }

  /** Enemigos por segundo según el minuto de la run (con el reloj real). */
  function rate(t) {
    return (1.6 + t * 0.028 + Math.pow(t / 60, 1.6) * 0.5) * DENSITY;
  }

  // Vista de cada jugador: la que manda (invitados de esta versión); la del anfitrión para él;
  // y para un invitado viejo, el lado largo de la del anfitrión en los dos ejes (por si juega de pie).
  const viewW = o => o.net && o.net.vw ? o.net.vw : !o.remote ? G.Camera.w : Math.max(G.Camera.w, G.Camera.h);
  const viewH = o => o.net && o.net.vh ? o.net.vh : !o.remote ? G.Camera.h : Math.max(G.Camera.w, G.Camera.h);

  /** @param extra  distancia de más fuera de la vista (al azar entre 10 y 70 si no se dice) */
  function ringPoint(pl, angle, extra) {
    const d = G.Camera.outerRadius(viewW(pl), viewH(pl), pl.remote ? G.Camera.ULTRA : undefined) + (extra == null ? G.U.rand(10, 70) : extra);
    return [pl.x + Math.cos(angle) * d, pl.y + Math.sin(angle) * d * 0.9];
  }

  let players = [];

  /** ¿Lo vería algún jugador? (para no aparecer delante de nadie): el rectángulo de su vista, con
   *  margen, y más por abajo porque el cuerpo se pinta hacia arriba de los pies. */
  function seenByAnyone(x, y) {
    return players.some(o => { const w = viewW(o), h = viewH(o);
      return Math.abs(x - o.x) < w / 2 + 40 && y > o.y - h / 2 - 40 && y < o.y + h / 2 + 90; });
  }

  /** Punto del anillo donde quepa: no dentro de paredes ni en el agua. */
  function freePoint(pl, angle, flying) {
    for (let i = 0; i < 8; i++) {
      const a = angle + (i === 0 ? 0 : G.U.rand(-0.9, 0.9));
      const [x, y] = ringPoint(pl, a);
      if (players.length > 1 && seenByAnyone(x, y)) continue;
      if (flying || G.World.isFree(x, y, 14)) return [x, y];
    }
    return null;
  }

  /** Jugador alrededor del que sale el siguiente enemigo (nunca uno que aún vuelve de la grieta). */
  function anchor() {
    const alive = players.filter(o => !o.dead && !G.Rift.leftBehind(o));
    return alive.length ? G.U.pick(alive) : players[0];
  }

  function scaled(sc, k) { return k === 1 ? sc : Object.assign({}, sc, { hp: sc.hp * k }); }

  function isFlyer(def) { return G.Sprites.hovers(def.dex); }

  function rollShiny(dex) {
    if (!G.Sprites.hasShiny(dex)) return false;
    if (forceShiny > 0) { forceShiny--; return true; }
    return Math.random() < SHINY_RATE;
  }

  // Como mucho 3 curanderos, 3 escuderos y 3 invocadores vivos a la vez
  // (18-10-2026: juntos dejaban a la horda, y a los jefes, casi inmortales).
  // Si ya hay 3 de uno, sale otro del elenco.
  const SUPPORT_MAX = 3, SUPPORT = new Set(['healer', 'shielder', 'summoner']);
  /** Tipos de apoyo que ya tienen 3 vivos. */
  function supportFull() {
    const n = {}, full = new Set();
    for (const e of G.EnemyMgr.all()) {
      if (!e.dead && SUPPORT.has(e.behavior) && (n[e.behavior] = (n[e.behavior] || 0) + 1) >= SUPPORT_MAX) full.add(e.behavior);
    }
    return full;
  }

  function champsAlive() { let n = 0; for (const e of G.EnemyMgr.all()) if (e.champ && !e.dead) n++; return n; }

  /**
   * Crea y añade un enemigo con la escala del minuto `t`.
   * o: { hp, dmg, xp } multiplicadores · weak (sin élite ni campeón) · noChamp
   */
  function make(def, x, y, t, o = {}) {
    const e = new G.Enemy(def, x, y, scaled(G.Enemies.scale(t), G.Coop.scaleHp(players.length) * hpK(t) * lateHp(t) * G.Enemies.earlyHp(t) * (o.hp || 1)));
    // (Experiencia: de la tabla por reloj G.Enemies.xpAt desde la 2.0; antes tramo × XP_K × xpLag.)
    e.dmg *= DMG_K * lateDmg(t) * G.Enemies.earlyK(t) * (o.dmg || 1);
    e.xp = Math.max(1, Math.round(G.Enemies.xpAt(t) * (def.behavior === 'tank' ? 1.3 : 1) * (o.xp || 1)));
    // (Con el tope más bajo de los primeros minutos, la élite sigue saliendo a partir de los mismos que antes.)
    e.elite = !o.weak && G.EnemyMgr.count >= Math.max(capAt(t), CAP_EARLY) * ELITE_FROM;
    if (e.elite) { e.maxHp = e.hp = Math.round(e.maxHp * 1.6); e.dmg *= 1.25; e.xp = Math.round(e.xp * 1.6); }
    if (!o.weak && !o.noChamp && !SUPPORT.has(def.behavior) && def.behavior !== 'bomber' && def.behavior !== 'runner' &&
        Math.random() < champChance(t) && champsAlive() < champMax(t)) e.makeChamp();
    const shiny = rollShiny(def.dex);
    if (shiny) e.makeShiny();
    if (G.Events.golden) e.makeGolden();
    G.EnemyMgr.add(e);
    if (shiny) {
      say('¡Un ' + e.name + ' shiny anda cerca!', 3.2, false, SHINY);
      G.Audio.sfx('shiny');
    }
    return e;
  }

  /** @param o  multiplicadores de make (FIGHT_XP durante un jefe) */
  function spawnOne(pl, t, angle, o) {
    const bag = G.Enemies.bagAt(t);
    let def = G.U.pick(bag);
    if (SUPPORT.has(def.behavior)) {
      const full = supportFull();
      if (full.has(def.behavior)) {
        const rest = bag.filter(d => !full.has(d.behavior));
        if (!rest.length) return null;
        def = G.U.pick(rest);
      }
    }
    const pt = freePoint(pl, angle == null ? Math.random() * 6.2832 : angle, isFlyer(def));
    if (!pt) return null;
    return make(def, pt[0], pt[1], t, o);
  }

  /** @param angle  por dónde sale (los de un mismo grupo, repartidos alrededor) */
  function spawnBoss(pl, t, b, angle = Math.random() * 6.2832) {
    const [x, y] = ringPoint(pl, angle);
    const e = new G.Enemy(b, x, y, scaled(G.Enemies.bossScale(t), G.Coop.scaleHp(players.length) * (players.length > 1 ? 1.4 : 1)), true);
    e.dmg *= G.Enemies.earlyK(t);           // (principio suave, 28-10-2026)
    if (rollShiny(b.dex)) e.makeShiny();
    G.EnemyMgr.add(e);
    G.Camera.kick(1.1);
    G.Audio.sfx('boss');
    return e;
  }

  // ---------------- oleadas ----------------

  /** Qué oleada toca (nunca dos iguales seguidas de las nuevas). */
  function pickWave(t) {
    if (t < WAVE_FROM) return 'surge';
    const opts = (t >= LATE ? WAVES.late : WAVES.early).filter(([k]) => k === 'surge' || k !== lastWave);
    let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
    for (const [k, w] of opts) if ((r -= w) <= 0) return k;
    return 'surge';
  }

  /** Un Pokémon del elenco de ahora que vaya a por ti (para el cerco y la estampida). */
  function plainPick(t, fast) {
    const NO = new Set(['healer', 'shielder', 'summoner', 'bomber', 'ranged', 'fan', 'beamer', 'zoner']);
    const bag = G.Enemies.bagAt(t), ok = bag.filter(d => !NO.has(d.behavior));
    const pool = ok.length ? ok : bag;
    if (!fast) return G.U.pick(pool);
    // Para la estampida, de los más rápidos.
    return pool.slice().sort((a, b) => b.spd - a.spd)[Math.floor(Math.random() * Math.min(3, pool.length))];
  }

  /** Cuántos caben aún en una oleada. */
  const room = t => Math.max(0, capAt(t) + OVER - G.EnemyMgr.count);
  /** Más gente en las oleadas en grupo (sin pasar del doble). */
  const groupK = () => Math.min(2, 0.55 + 0.45 * G.Coop.scaleRate(players.length));

  function surge(pl, t) {
    const base = Math.random() * 6.2832;
    const n = Math.min(room(t), Math.round((14 + Math.floor(t / 22)) * G.Coop.scaleRate(players.length) * 0.4));
    for (let i = 0; i < n; i++) spawnOne(pl, t, base + G.U.rand(-0.55, 0.55));
    say('¡Marea de Pokémon!', 2, false, LOW);
  }

  /** Cerco: un anillo entero alrededor, todos a la misma distancia, que se va cerrando (hasta el minuto 12, con un hueco). */
  function ring(pl, t) {
    const n = Math.min(room(t), Math.round(Math.min(28, 10 + t / 90) * groupK()));
    if (n < 6) return surge(pl, t);
    const def = plainPick(t), fly = isFlyer(def), a0 = Math.random() * 6.2832;
    // (28-10-2026) Medido con tools/curve.cjs: el primer cerco (minuto 6) era un muro incluso con todas las mejoras.
    const gap = t < 720 ? 2 : 0;
    for (let i = gap; i < n; i++) {
      const [x, y] = ringPoint(pl, a0 + i / n * 6.2832, 30);
      if (players.length > 1 && seenByAnyone(x, y)) continue;
      if (!fly && !G.World.isFree(x, y, 14)) continue;
      make(def, x, y, t, { noChamp: true });
    }
    say('¡Te están rodeando!', 2.2, false, LOW);
  }

  /** Estampida: una columna que cruza por donde estás en línea recta, con un hueco para colarse. */
  function stampede(pl, t) {
    const n = Math.min(room(t), Math.round(Math.min(20, 9 + t / 150) * Math.min(1.5, groupK())));
    if (n < 6) return surge(pl, t);
    const base = plainPick(t, true);
    const def = Object.assign({}, base, { behavior: 'stampede' });
    const a = Math.random() * 6.2832, ca = Math.cos(a), sa = Math.sin(a);
    const D = G.Camera.outerRadius(viewW(pl), viewH(pl), pl.remote ? G.Camera.ULTRA : undefined) + 40;
    const sx = pl.x - ca * D, sy = pl.y - sa * D * 0.9;
    const spd = G.U.clamp(base.spd * 2.4, 150, 200);
    const gap = G.U.randInt(1, n - 3);            // dos plazas libres seguidas
    for (let i = 0; i < n + 2; i++) {
      if (i === gap || i === gap + 1) continue;
      const off = (i - (n + 1) / 2) * 32 + G.U.rand(-5, 5), back = G.U.rand(0, 40) + (i % 2) * 20;
      const x = sx - sa * off - ca * back, y = sy + ca * off - sa * back;
      if (players.length > 1 && seenByAnyone(x, y)) continue;
      const e = make(def, x, y, t, { noChamp: true });
      e.runA = a; e.runSpd = spd; e.life = (2 * D + 260) / spd;
    }
    say('¡Estampida!', 2.2, false, LOW);
  }

  /** Enjambre: muchos voladores débiles y rápidos desde un lado (dan poca experiencia cada uno). */
  function swarm(pl, t) {
    const n = Math.min(room(t), Math.round(Math.min(30, 14 + t / 80) * groupK()));
    const def = G.Enemies.swarmDef(t);
    if (n < 8 || !def) return surge(pl, t);
    const base = Math.random() * 6.2832;
    for (let i = 0; i < n; i++) {
      const pt = freePoint(pl, base + G.U.rand(-0.5, 0.5), true);
      if (pt) make(def, pt[0], pt[1], t, { weak: true, hp: 0.3, dmg: 0.6, xp: 0.35 });
    }
    say('¡Enjambre!', 2.2, false, LOW);
  }

  function wave(kind, t, pl = anchor()) {
    lastWave = kind;
    if (kind === 'ring') ring(pl, t);
    else if (kind === 'stampede') stampede(pl, t);
    else if (kind === 'swarm') swarm(pl, t);
    else surge(pl, t);
    G.Audio.sfx('surge');
  }

  // ---------------- cada fotograma ----------------

  /** @param who  el jugador o la lista de jugadores (cooperativo) */
  function update(dt, who, t) {
    players = Array.isArray(who) ? who : [who];
    tickBanner(dt);
    // En la arena de la grieta no sale nada más (y el reloj de jefes espera).
    // En la Sentencia de Arceus, sólo sus legendarios (systems/judgment.js).
    if (G.Rift.inArena || G.Judgment.active) return;

    // Precarga lo que va a salir en el próximo minuto.
    preloadT -= dt;
    if (preloadT <= 0) { preloadT = 10; G.Sprites.preload(G.Enemies.upcomingDex(t, 60)); }

    // --- jefes ---
    // Uno a la vez (#255): si sigue vivo el anterior, el siguiente espera, salvo
    // que ya lleve BOSS_LATE s de retraso; y nunca dos con menos de BOSS_GAP s
    // (al volver de una grieta larga salían dos en fotogramas seguidos). Los de
    // un mismo minuto (los dúos del final) salen juntos, por lados opuestos.
    const b = G.Enemies.BOSSES[bossIdx];
    const group = b && t >= b.at && t - lastBossT >= BOSS_GAP && (t - b.at > bossLate(t) || !G.EnemyMgr.bossAlive()) ? [b] : null;
    if (group) while (G.Enemies.BOSSES[bossIdx + group.length] && G.Enemies.BOSSES[bossIdx + group.length].at === b.at) group.push(G.Enemies.BOSSES[bossIdx + group.length]);
    if (group && mapBosses() + group.length <= MAP_BOSS_MAX) {
      const pl = anchor(), a0 = Math.random() * 6.2832;
      const es = group.map((d, i) => spawnBoss(pl, t, d, a0 + i * 6.2832 / group.length));
      const nm = e => e.name + (e.shiny ? ' shiny' : '');
      if (es.length > 1) say('¡' + nm(es[0]) + ' y ' + nm(es[1]) + ' salvajes aparecieron!', 3.2, false, BOSS);
      else say('¡' + nm(es[0]) + ' salvaje apareció!', 3, false, BOSS);
      bossIdx += group.length; lastBossT = t;
    }

    // Combate de jefe: las oleadas bajan al 25% y no hay mareas, para que el
    // jefe sea un momento propio y se le pueda apuntar entre la multitud.
    const bossFight = G.EnemyMgr.bossAlive();

    // --- goteo normal ---
    const cap = capAt(t);
    if (G.EnemyMgr.count < cap) {
      acc += rate(t) * G.Coop.scaleRate(players.length) * (bossFight ? 0.25 : 1) * dt;
      let n = Math.floor(acc);
      acc -= n;
      while (n-- > 0 && G.EnemyMgr.count < cap) spawnOne(anchor(), t, null, bossFight ? FIGHT_XP : undefined);
    }

    // --- oleada ---
    if (!bossFight) surgeT -= dt;
    if (surgeT <= 0) {
      surgeT = surgeGap(t);
      wave(pickWave(t), t);
    }
  }

  /** Unos cuantos de golpe desde un lado (al empezar una horda). */
  function burst(n) {
    const base = Math.random() * 6.2832, target = anchor() || G.Game.player, t = G.Game.st.time;
    for (let i = 0; i < n && G.EnemyMgr.count < capAt(t) + 10; i++) spawnOne(target, t, base + G.U.rand(-0.6, 0.6));
  }

  /** Esbirros que llama un jefe (enemy.js): del elenco de ahora, alrededor de (x, y). */
  function minions(x, y, n, t = G.Game.st.time) {
    const out = [];
    if (G.EnemyMgr.count >= capAt(t) + OVER) return out;
    const def = plainPick(t), fly = isFlyer(def);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832 + G.U.rand(-0.3, 0.3), d = G.U.rand(60, 90);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8;
      if (!fly && !G.World.isFree(px, py, 14)) continue;
      out.push(make(def, px, py, t, { weak: true, hp: 0.6, xp: 0.5 }));
    }
    return out;
  }

  /**
   * Un rezagado vuelve a salir por delante del jugador (hacia donde corre),
   * fuera de la vista. Devuelve false si no hay sitio (entonces se quita).
   */
  function ahead(e, pl) {
    if (!players.length) players = [pl];
    const sp = Math.hypot(pl._vx || 0, pl._vy || 0);
    const a0 = sp > 20 ? Math.atan2(pl._vy, pl._vx) : Math.random() * 6.2832;
    const pt = freePoint(pl, a0 + G.U.rand(-0.9, 0.9), e.flying);
    if (!pt) return false;
    e.x = pt[0]; e.y = pt[1]; e.kx = e.ky = 0;
    e.phase = 'walk'; e.pt = 0; e.jump = null; e.jumpLift = 0;
    return true;
  }

  /*
   * Avisos en cola (24-10-2026). Antes cada aviso pisaba al anterior (y en los
   * momentos cargados, jefe + grieta + oleada + shiny, se perdían los importantes).
   * Ahora sale uno cada vez, en la pila de arriba del HUD (hud.js):
   *   - el que llega mientras se ve otro espera su turno; el de la pantalla se
   *     acorta (se ve al menos MIN_SHOW s) y los de la cola duran como mucho BUSY_SHOW s;
   *   - prio: 0 poco importante (el aviso de una oleada: la oleada ya se ve), que
   *     se descarta si hay otro; 1 normal (lo de siempre); 2 importante (jefes,
   *     shinies), que se adelanta en la cola. Como mucho QUEUE_MAX esperando;
   *   - el mismo texto no se repite; un texto vacío quita el de la pantalla; y uno
   *     de 999 s (la pausa del grupo) sale ya, hasta que se quite.
   * col: color del borde (y del punto) de la chapa; si no, amarillo.
   */
  const MIN_SHOW = 1.3, BUSY_SHOW = 2.4, QUEUE_MAX = 3;
  const LOW = { prio: 0 }, BOSS = { prio: 2, col: '#FF6B6B' }, SHINY = { prio: 2, col: '#9AE6FF' };
  let annPrio = 1, annAge = 0, annCol = null;
  const queue = [];

  /**
   * Aviso en pantalla (también lo usan el bioma y los shinies).
   * @param local  sólo en este ordenador (no se manda a los compañeros)
   * @param o      { prio: 0 | 1 | 2, col: color } (ver arriba)
   */
  function say(text, secs = 2.6, local = false, o = null) {
    if (G.Coop.isHost && !local) G.Coop.say(text, secs);
    const prio = o && o.prio != null ? o.prio : 1, col = (o && o.col) || null;
    if (!text) { announceT = 0; next(); return; }
    if (secs >= 999) { put(text, secs, 3, col); return; }
    if (announceT > 0 && announce === text) { announceT = Math.max(announceT, Math.min(secs, BUSY_SHOW)); return; }
    if (queue.some(q => q.text === text)) return;
    if (announceT <= 0) { put(text, secs, prio, col); return; }
    if (prio < 1) return;                                 // (poco importante y ya hay otro: fuera)
    queue.push({ text, secs, prio, col });
    queue.sort((a, b) => b.prio - a.prio);
    if (queue.length > QUEUE_MAX) queue.length = QUEUE_MAX;
    // El de la pantalla deja sitio (salvo la pausa del grupo, que espera a que la quiten).
    if (annPrio < 3) announceT = Math.min(announceT, Math.max(0.35, MIN_SHOW - annAge));
  }

  function put(text, secs, prio, col) {
    announce = text; announceT = secs; annPrio = prio; annCol = col; annAge = 0;
  }
  /** El siguiente de la cola (más corto si aún quedan más detrás). */
  function next() {
    const q = queue.shift();
    if (q) put(q.text, queue.length ? Math.min(q.secs, BUSY_SHOW) : q.secs, q.prio, q.col);
  }

  function banner() { return announceT > 0 ? { text: announce, t: announceT, age: annAge, col: annCol, prio: annPrio } : null; }

  /** El reloj de los avisos (también en el invitado, que no corre el resto del spawner). */
  function tickBanner(dt) {
    if (announceT > 0) { announceT -= dt; annAge += dt; if (announceT <= 0) next(); }
    else if (queue.length) next();
  }

  return { reset, update, ahead, burst, minions, tickBanner, banner, say, rate, capAt, SHINY_RATE, CAP,
           debugForceShiny(n = 1) { forceShiny = n; },
           /** Para pruebas: una oleada ya ('surge' | 'ring' | 'stampede' | 'swarm'). */
           debugWave(kind) { players = G.Game.everyone(); wave(kind || pickWave(G.Game.st.time), G.Game.st.time); },
           /** Para pruebas: el calendario de jefes salta al minuto `t` (los anteriores ya no salen). */
           debugBossesFrom(t) { bossIdx = 0; while (G.Enemies.BOSSES[bossIdx] && G.Enemies.BOSSES[bossIdx].at < t) bossIdx++; lastBossT = -Infinity; } };
})();
