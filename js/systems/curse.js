/* ============ curse.js — la maldición (1.0, bloque F, 27-11-2026) ============
 * Lo decidió el dueño (nota del vault «Bloque F - Maldición», «Decisiones del dueño», 1.0):
 *
 * Un nivel de maldición de 0 a MAX (5) para el resto de la partida. Se sube en los santuarios malditos (un encuentro del
 *   mapa, systems/encounters.js, uno en cada tramo de 5 min desde el minuto 5) o comprándola a Kecleon. Nunca baja.
 *
 * Lo que hace, por nivel (se suma):
 *   enemigos normales  +8 % de vida, +6 % de daño, +10 % de aparición (el goteo; el tope de enemigos a la vez no sube:
 *                      está por el móvil, y al llegar a él los que sobran salen de élite como siempre)
 *   jefes              +6 % de daño (su vida ya va con tu fuerza: G.Enemies.bossCap)
 *   Al tope (5): +40 % de vida, +30 % de daño, +50 % de aparición.
 *
 * Premios, por nivel: +9 % de experiencia y +12 % de monedas de la partida (pl.xpMul, pl.coinMul: también las que te
 *   llevas a la cuenta y las que gastas en Kecleon), y +6 % de suerte al aceptarla (G.Fortune). Al tope: +45 % de
 *   experiencia, +60 % de monedas y +30 % de suerte.
 *
 * Va APARTE del director de dificultad (director.js): se aplica encima al crear cada enemigo (spawner.js) y el director
 *   no la descuenta: mide lo que tardas en tumbarlos como si no hubiera maldición (e.curseK), así que no baja su vida
 *   para compensarla. Sólo sigue bajando su propio daño si de verdad vas apurado (caer o < 30 % de vida), como siempre.
 *
 * Ranking: sin dato nuevo. Con la maldición salen más enemigos y se derrotan más: en un empate de tiempo, gana quien
 *   ha derrotado más (net/ranking.js).
 *
 * Cooperativo: es DEL GRUPO. La lleva el anfitrión: el invitado que la acepta se lo pide ('enc', 'k') y el anfitrión la
 *   sube y avisa a todos ('enc', 'ku', nivel, santuario). Los premios, cada uno los suyos en su ordenador. Los enemigos los
 *   crea el anfitrión y su vida y daño ya viajan como siempre ('ne'): no viaja nada más.
 *
 * El bot (tools/curve.cjs) la lee en pl.curse y G.Curse.MAX. Registro: G.Reg.v1.curse(nivel, aceptada).
 */
G.Curse = (() => {
  const MAX = 5;
  /** Enemigos, por nivel. */
  const STEP = { hp: 0.08, dmg: 0.06, rate: 0.10 };
  /** Premios, por nivel (luck: al aceptarla). */
  const GIFT = { xp: 0.09, coin: 0.12, luck: 0.06 };
  const COL = '#b56cff';

  let lv = 0;
  const authority = () => !G.Coop.active || G.Coop.isHost;

  function reset() { lv = 0; }

  const hp = () => 1 + STEP.hp * lv;
  const dmg = () => 1 + STEP.dmg * lv;
  const rate = () => 1 + STEP.rate * lv;
  /** Lo que hace el nivel n (para las cartas y la pausa): fracciones. */
  const at = n => ({ hp: STEP.hp * n, dmg: STEP.dmg * n, rate: STEP.rate * n, xp: GIFT.xp * n, coin: GIFT.coin * n });

  /** Tus premios al pasar de n-1 a n (en cada ordenador, a su jugador). */
  function gift(pl, n) {
    if (!pl) return;
    pl.xpMul = (pl.xpMul || 1) * (1 + GIFT.xp * n) / (1 + GIFT.xp * (n - 1));
    pl.coinMul = (pl.coinMul || 1) * (1 + GIFT.coin * n) / (1 + GIFT.coin * (n - 1));
    G.Fortune.add(pl, GIFT.luck);
    pl.curse = n;
  }

  /** El nivel pasa a n (sólo sube): premios a tu jugador por cada nivel nuevo, aviso y registro. */
  function setLevel(n) {
    n = Math.max(0, Math.min(MAX, n | 0));
    if (n <= lv) return false;
    const pl = G.Game.player;
    while (lv < n) { lv++; gift(pl, lv); G.Reg.v1.curse(lv, true); }
    G.Audio.sfx('boss');
    if (pl) {
      G.FX.ring(pl.x, pl.y - 10, 10, 150, COL, 0.7, 5);
      G.FX.burst(pl.x, pl.y - pl.bodyH * 0.6, COL, 22, 160);
    }
    G.Spawner.say(G.I18n.f('Maldición Nv. {x}: enemigos más duros · +{x} % de suerte', lv, Math.round(GIFT.luck * 100)), 3.2, true, { col: COL });
    return true;
  }

  /**
   * Aceptas la maldición (santuario e o Kecleon, e = null). Solitario y anfitrión: sube ya y avisa a los demás.
   * Invitado: se lo pide al anfitrión (si ya estaba al tope, no pasa nada).
   */
  function accept(e) {
    if (lv >= MAX) return false;
    if (e) e.used = true;
    if (authority()) {
      setLevel(lv + 1);
      if (G.Coop.isHost) G.Coop.broadcast(['enc', 'ku', lv, e ? e.id : 0]);
    } else G.Coop.toHost(['enc', 'k', e ? e.id : 0]);
    return true;
  }

  /** Dices que no: ese santuario se apaga para ti. */
  function decline(e) {
    if (e) e.used = true;
    G.Reg.v1.curse(lv + 1, false);
  }

  return {
    MAX, STEP, GIFT, COL, reset, hp, dmg, rate, at, accept, decline, setLevel,
    get level() { return lv; },
    /** Para pruebas: pone el nivel ya (con sus premios). */
    debugSet(n) { setLevel(n); }
  };
})();
