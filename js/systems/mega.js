/* ============ mega.js — megaevolución en la partida (06-11-2026) ============
 * Diseño: docs/MEGAEVOLUCIONES.md. Tu Pokémon lleva la megapiedra (G.Shop.wears) y usa
 * el botón, la tecla y el hueco del movimiento Z: llevan una cosa u otra, nunca las dos.
 *
 * pl.mg = { id, def, k0: lo contado cuando empezó a cargar, t: lo que le queda activo,
 *           uses, dealt, d0, base, own, r, wr,
 *           said: ya avisó de que está lista, hintAt: cuándo enseñar la pista }
 * o null si tu Pokémon no lleva la piedra.
 *
 * La Energía Mega se llena con enemigos derrotados (pl.kills + pl.bosses × BOSS): cuesta
 * al principio y luego va rápido, sin mínimo entre megas (lo quitó el dueño). En grupo, kills y bosses son del equipo (coop.js): la meta sube con
 * los enemigos que salen (spawner: ×1,75 por jugador de más).
 *
 * Por la red viaja la mega en el dato de la fase (coop.js): una versión anterior no la
 * conoce, la descarta y ve al Pokémon normal. Los relojes corren con la partida.
 */
G.Mega = (() => {
  const DUR = 75, NEED = 300, BOSS = 30, IN_K = 0.85;     // ver el documento, sección 8
  const COL = '#ff8ad8', COL2 = '#8ad8ff';

  /** Lo que cuenta para la energía, el equipo entero en grupo. */
  const score = pl => (pl.kills || 0) + (pl.bosses || 0) * BOSS;
  /** Enemigos que hay que derrotar para llenarla. */
  function need() {
    const n = G.Coop && G.Coop.active && G.Game.everyone ? Math.max(1, G.Game.everyone().length) : 1;
    return NEED * (1 + 0.75 * (n - 1));
  }

  /** El estado de tu Pokémon (lo pone la primera vez, sólo a tu jugador). */
  function of(pl) {
    if (!pl || pl.remote) return null;
    if (pl.mg === undefined) {
      const id = G.Shop && G.Shop.wears && G.Shop.wears(pl.dex) === 'mega' ? G.Shop.megaId(pl.dex) : 0;
      pl.mg = id ? { id, def: G.MEGA[id], k0: 0, t: 0, uses: 0, dealt: 0, d0: 0, base: null, own: '', r: 0, wr: 0, said: false, hintAt: 0 } : null;
    }
    return pl.mg;
  }

  const active = pl => !!(pl && pl.mg && pl.mg.t > 0);
  /** Energía: de 0 a 1. Mientras dura no se carga. */
  const energy = (pl, g) => (g.t > 0 ? 0 : G.U.clamp((score(pl) - g.k0) / need(), 0, 1));
  /** ¿Ya está en su forma final? (el elegido siempre es la forma final de su línea) */
  const final = pl => pl.form === pl.dex || active(pl);
  const ready = (pl, g) => !g.t && final(pl) && energy(pl, g) >= 1;

  /** La pista del botón apagado, en español (el lienzo la traduce). */
  function hint(pl, g) {
    if (!final(pl)) return G.I18n.f('Mega: al llegar a {x}', G.DEX_BY[pl.dex].name);
    return 'Mega: derrota enemigos';
  }

  function swap(pl, mon, fx) {
    const r = pl.r, wr = pl.wr;
    pl.evolve(mon, fx, false);
    pl.r = r; pl.wr = wr;                // se ve más grande, pero choca igual que antes
  }

  /** Pulsar el botón. → true si ha megaevolucionado. */
  function use(pl) {
    const g = of(pl);
    if (!g || pl.dead) return false;
    if (!ready(pl, g)) { g.hintAt = performance.now(); G.Audio.sfx('error'); return false; }
    const mon = G.Mons.formFor(pl.dex, g.id);
    mon.name = G.Mons.name(g.def.name);
    g.base = pl.mon; g.own = pl.abilId;
    if (g.def.abil) pl.abilId = g.def.abil;
    swap(pl, mon, true);
    pl.evoFx.mega = true;
    pl.sumT = 0;                         // Mega-Tyranitar: su clima, al momento
    g.t = DUR; g.uses++; g.d0 = pl.dmgDealt || 0;
    G.FX.ring(pl.x, pl.y, pl.r, 260, COL, 0.7, 7);
    G.FX.ring(pl.x, pl.y - G.LIFT * 0.5, pl.r * 5, 4, COL2, 0.45, 4);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, COL, 24, 220);
    if (G.Game.flash) G.Game.flash(COL, 0.35);
    G.Camera.kick(0.45);
    G.Spawner.say(G.I18n.f('¡{x} megaevoluciona en {x}!', G.DEX_BY[pl.dex].name, mon.name), 3, true, { prio: 2, col: COL });
    G.Audio.sfx('legend');
    G.Pad.rumble(0.6, 260);
    if (G.Progress && G.Progress.event) G.Progress.event('mega', {});
    return true;
  }

  /** Vuelve a la forma normal (se acaba el tiempo, o cae). */
  function end(pl, g) {
    g.dealt += (pl.dmgDealt || 0) - g.d0;
    g.t = 0; g.k0 = score(pl); g.said = false;
    pl.abilId = g.own;
    swap(pl, G.Mons.formFor(pl.dex, pl.dex), false);
    G.FX.ring(pl.x, pl.y, pl.r * 4, pl.r, COL, 0.4, 3);
  }

  /** Ha caído: se acaba, y la energía vuelve a 0. */
  function down(pl) { const g = pl.mg; if (g && g.t > 0) end(pl, g); }

  /** Cada fotograma (combat.js, junto al del Z). */
  function tick(dt, pl) {
    const g = of(pl);
    if (!g) return;
    if (!g.pre && pl.form === pl.dex) { g.pre = true; G.Sprites.preload([g.id], 8000, pl.shinyWant); }
    if (g.t > 0) {
      g.t -= dt;
      if (g.t <= 0) end(pl, g);
      return;
    }
    if (!g.said && ready(pl, g)) {
      g.said = true;
      G.Spawner.say('¡Megaevolución lista!', 3, true, { prio: 2, col: COL });
      G.Audio.sfx('confirm');
    }
  }

  /** Lo hecho en mega hasta ahora, también si sigue activa (la pausa y el resumen). */
  const dealt = (pl, g) => g.dealt + (g.t > 0 ? (pl.dmgDealt || 0) - g.d0 : 0);
  /** El Pokémon para las cartas de nivel: con la mega puesta siguen siendo las de tu forma normal. */
  const cardMon = pl => (active(pl) ? pl.mg.base : pl.mon);

  return { DUR, NEED, BOSS, IN_K, COL, COL2, of, use, tick, down, active, energy, final, ready, hint, need, score, dealt, cardMon };
})();
