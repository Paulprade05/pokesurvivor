/* ============ tickets.js — tickets del gacha en partida (2.0, bloque 5) ============
 * Antes los tickets eran botín del suelo (1/400 por baja, ×10 de jefes y legendarios, cofres con
 * candado, Gholdengo, Pokémon perdido): ~100 tiradas en 15 minutos y 300 en 30, la mitad de las
 * grietas, y en cooperativo cada uno cobraba el botín de todo el equipo.
 *
 * Ahora es un «reloj de tickets» (variante A de docs/PROMPT-2.0.md §10, la que marcó el dueño):
 *   - 1 ticket cada CLOCK s de partida, hasta el minuto 30;
 *   - +1 por cada jefe del calendario vencido (no los legendarios de las grietas ni los de Arceus);
 *   - +1 al llegar a la Sentencia de Arceus;
 *   - como mucho RUN_MAX por partida y floor(PER_MIN·min) + 1 hasta cada momento (8 cada 5 minutos);
 *   - ningún ticket ×10 en partida.
 * Lo que daba el suelo se da ahora en monedas (enemy.js, world.js, events.js, pickup.js).
 * Misiones, logros y los tickets que ya tenía cada uno: igual que antes (se cobran fuera de partida).
 *
 * El reloj que cuenta es el de la partida, pero nunca más que el tiempo real + 10 s (como el
 * antitrampas del ranking): saltar el reloj o acelerar la partida no regala tickets. Para medir con el
 * bot (tools/curve.cjs, que acelera), debugIgnoreTamper, sólo con ?dev.
 */
G.Tickets = (() => {
  const CLOCK = 100, RUN_MAX = 30, PER_MIN = 1.6, END = 1800;
  const dev = typeof location !== 'undefined' && /[?&]dev\b/.test(location.search || '');
  let ignore = false;

  /** Tope hasta el segundo t: floor(1,6·min) + 1, y nunca más de 30. */
  function cap(t) { return Math.min(RUN_MAX, Math.floor(PER_MIN * Math.max(0, t) / 60) + 1); }

  /** Tickets que lleva una partida en el segundo t con `cboss` jefes del calendario vencidos y la Sentencia o no. */
  function forRun(t, cboss = 0, judged = false) {
    t = Math.max(0, +t || 0);
    return Math.min(cap(t), Math.floor(Math.min(t, END) / CLOCK) + Math.max(0, cboss | 0) + (judged ? 1 : 0));
  }

  /**
   * Invitado: lo que manda el anfitrión (t1), nunca más que el reloj de tickets con sus jefes. Un anfitrión viejo manda el
   * botín de todo el equipo (y tickets ×10): se queda en lo que daría en solitario, y ×10, ninguno.
   */
  function fromHost(t1, t, cboss = 0, judged = false) { return Math.max(0, Math.min(+t1 || 0, forRun(t, cboss, judged))); }

  return {
    CLOCK, RUN_MAX, PER_MIN, cap, forRun, fromHost,
    /** (Sólo con ?dev) que el reloj cuente aunque la partida vaya acelerada (tools/curve.cjs). */
    get debugIgnoreTamper() { return ignore; },
    set debugIgnoreTamper(v) { ignore = dev && !!v; }
  };
})();
