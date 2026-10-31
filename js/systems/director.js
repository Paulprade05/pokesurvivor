/* ============ director.js — enemigos que escalan con tu fuerza real (2.0, bloque 2) ============
 * Antes la fuerza de los enemigos sólo dependía del reloj. Ahora un «director» mira lo
 * rápido que matas de verdad (que ya incluye nivel, evoluciones, fusiones y pasivas) y
 * cómo vas de vida, y lo traduce en dos multiplicadores que se aplican AL CREAR cada
 * enemigo (spawner.js; los invitados reciben maxHp y dmg con 'ne', no viaja nada nuevo):
 *
 *   hp()   vida de los enemigos normales: maxHp × hp^0,6 y el resto como «defensa»
 *          (e.defK = hp^-0,4, un factor del daño que reciben en el anfitrión). Nada de
 *          defensa plana: rompería los ataques de muchos golpes pequeños.
 *   dmg()  daño de todos (también jefes y legendarios; su vida va aparte, bloque 3).
 *
 * Medida (independiente de cuántos salgan): de cada enemigo normal que cae, el tiempo
 * desde su primer golpe (ttk) y el daño recibido; Te = maxHp / (daño / max(0,25, ttk)) es
 * lo que tardarías en tumbarlo a ese ritmo (con un golpe enorme sale muy pequeño). `geo`
 * es la media geométrica móvil de Te (τ = 20 s de partida). Cada 2 s:
 *   - si matas más rápido que el objetivo TTK_T(t) y nadie va apurado, la vida sube (como
 *     mucho ×1,03 cada vez y hasta HP_MAX(t)); si vas más lento que 1,3 × el objetivo o
 *     alguien va apurado, baja (×0,92). Con menos de 8 bajas en la ventana no se toca;
 *   - el daño sube ×1,02 (unos 40 s hasta arriba) si el jugador más apurado sigue por encima
 *     del 80 % de vida (media móvil, τ 20 s) desde el minuto 3, hasta DMG_MAX(t) (×1,1 en el 10,
 *     ×1,5 en el 30); y baja ×0,9 con
 *     peligro (alguien por debajo del 30 % o caído en los últimos 25 s).
 * Sólo se compensa una parte (exponente 0,4): con el doble de fuerza se sigue matando más
 * rápido, para que se note la build. Los multiplicadores nunca bajan de 1: el que va flojo
 * se encuentra la curva base de siempre (más suave desde la 2.0: ver hpBase en enemies.js).
 *
 * Sólo corre en el anfitrión o en solitario (como Spawner.update). tools/curve.cjs sustituye
 * hpFrac (su bot es inmortal y lleva una vida «virtual») y avisa de las caídas con noteFall.
 */
G.Director = (() => {
  const lerp = (tab, t) => {
    if (t <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) {
      const [t1, v1] = tab[i];
      if (t <= t1) { const [t0, v0] = tab[i - 1]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
    }
    return tab[tab.length - 1][1];
  };
  // Tiempo objetivo para tumbar a un enemigo normal (s) y tope de la vida extra, por reloj.
  const TTK_T = [[0, 0.45], [300, 0.7], [600, 0.9], [1200, 1.3], [1800, 1.6]];
  // (Medido: con vida extra en los minutos 1-3 los que van sin mejoras caían antes; desde el 3. Y con ×2,2 en el 10
  //  se caía justo después, con todas las mejoras: más suave hasta el 20.)
  const HP_MAX = [[0, 1], [180, 1], [300, 1.15], [600, 1.5], [1200, 2.2], [1800, 3]];
  // Tope del daño extra, también por reloj: medido, con ×1,5 ya en el minuto 4 se caía antes con todas las mejoras.
  const DMG_MAX = [[180, 1], [600, 1.1], [1200, 1.3], [1800, 1.5]];
  // Lo que sube la vida en cada paso (medido: con ×1,06 pasaba de 1 a 2,2 en medio minuto y luego caías).
  const HP_UP = 1.03;
  const DMG_UP = 1.02, TAU = 20, STEP = 2, MIN_KILLS = 8, DANGER_HP = 0.3, FALL_T = 25, COMFY = 0.8, DMG_FROM = 180;

  let hpMul = 1, dmgMul = 1, lnSum = 0, wSum = 0, comfort = 1, stepT = STEP, now = 0, lastFall = -Infinity;
  const down = new Map();       // quién estaba caído en el último paso (para ver caídas nuevas)

  function reset() {
    hpMul = 1; dmgMul = 1; lnSum = 0; wSum = 0; comfort = 1; stepT = STEP; now = 0; lastFall = -Infinity; worst = 1;
    down.clear();
  }

  /** Vida del jugador (0-1). Los compañeros, con lo último que mandaron. curve.cjs la sustituye. */
  function hpFrac(p) {
    if (p.remote && p.net) return p.net.maxHp > 0 ? p.net.hp / p.net.maxHp : 1;
    return p.maxHp > 0 ? p.hp / p.maxHp : 1;
  }
  const isDown = p => !!(p.remote && p.net ? p.net.dead : p.dead);

  /** Alguien ha caído (lo detecta update; curve.cjs lo llama con su vida virtual). */
  function noteFall() { lastFall = now; }

  /** Golpe a un enemigo (anfitrión; d = daño ya con defK, antes del escudo). */
  function hit(e, d) {
    if (e.hitT0 == null) { e.hitT0 = now; e.dmgIn = 0; }
    e.dmgIn += d;
  }

  /** Un enemigo ha caído: cuenta sólo los normales tumbados por los jugadores. */
  function kill(e) {
    if (e.boss || e.legend || e.judge || e.weak || e.selfK || e.hitT0 == null || !(e.dmgIn > 0)) return;
    if (e.behavior === 'stampede' || e.behavior === 'thief') return;
    const ttk = now - e.hitT0;
    const te = e.maxHp / (e.dmgIn / Math.max(0.25, ttk));
    if (!(te > 0) || !isFinite(te)) return;
    lnSum += Math.log(te); wSum += 1;
  }

  let worst = 1;                // vida del más apurado ahora mismo
  const geo = () => (wSum > 0 ? Math.exp(lnSum / wSum) : 0);
  const danger = () => now - lastFall < FALL_T || worst < DANGER_HP;

  /** Cada fotograma (anfitrión o solitario). t: reloj de la partida. */
  function update(dt, players, t) {
    now = t;
    const list = Array.isArray(players) ? players : [players];
    worst = 1;
    for (const p of list) {
      if (!p) continue;
      const dn = isDown(p);
      if (dn && !down.get(p)) noteFall(p);
      down.set(p, dn);
      if (!dn) worst = Math.min(worst, G.U.clamp(G.Director.hpFrac(p), 0, 1));
    }
    const k = Math.exp(-dt / TAU);
    lnSum *= k; wSum *= k;
    comfort = comfort * k + worst * (1 - k);
    if ((stepT -= dt) > 0) return;
    stepT = STEP;
    step(t);
  }

  /** El control de cada 2 s (aparte para los tests). */
  function step(t) {
    const dg = danger();
    if (wSum >= MIN_KILLS) {
      const g = geo(), tgt = lerp(TTK_T, t);
      if (g < tgt && !dg) hpMul = Math.min(lerp(HP_MAX, t), hpMul * Math.min(HP_UP, Math.pow(tgt / g, 0.4)));
      else if (g > 1.3 * tgt || dg) hpMul = Math.max(1, hpMul * 0.92);
    } else if (dg) hpMul = Math.max(1, hpMul * 0.92);
    // (Si HP_MAX baja con el reloj, que no se quede por encima.)
    hpMul = Math.max(1, Math.min(hpMul, Math.max(1, lerp(HP_MAX, t))));
    if (dg) dmgMul = Math.max(1, dmgMul * 0.9);
    else if (comfort > COMFY && t > DMG_FROM) dmgMul = Math.min(lerp(DMG_MAX, t), dmgMul * DMG_UP);
    dmgMul = Math.max(1, Math.min(dmgMul, lerp(DMG_MAX, t)));
  }

  return {
    reset, update, step, hit, kill, noteFall, hpFrac, TTK_T, HP_MAX,
    hp: () => hpMul,
    dmg: () => dmgMul,
    /** Lo que se reparte en vida y «defensa» (spawner.js). */
    hpPart: () => Math.pow(hpMul, 0.6),
    defK: () => Math.pow(hpMul, -0.4),
    ttkAt: t => lerp(TTK_T, t),
    hpMaxAt: t => lerp(HP_MAX, t),
    dmgMaxAt: t => lerp(DMG_MAX, t),
    get geo() { return geo(); },
    get danger() { return danger(); },
    get comfort() { return comfort; },
    get kills() { return wSum; },
    /** Para pruebas: fija los multiplicadores. */
    debugSet(h, d) { if (h != null) hpMul = Math.max(1, h); if (d != null) dmgMul = Math.max(1, d); }
  };
})();
