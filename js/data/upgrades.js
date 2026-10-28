/* ============ upgrades.js — mejoras permanentes entre runs ============
 * Se compran con Pokémonedas en el menú. `per` es lo que da cada nivel.
 * grp: el apartado en que salen en Mejoras (GROUPS, en ese orden).
 */
G.Upgrades = (() => {
  // Apartados de la pantalla de Mejoras (26-10-2026), en el orden en que salen.
  const GROUPS = [
    { id: 'stats', name: 'Estadísticas' },
    { id: 'atk',   name: 'Ataques' },
    { id: 'run',   name: 'Botín y cartas' },   // («Partida» ya se traduce como la partida guardada)
    { id: 'moves', name: 'Movimientos' }
  ];
  const LIST = [
    { id: 'hp',     grp: 'stats', icon: 'hpup', name: 'Vitalidad',      unit: '+8 vida',            max: 10, base: 60,  grow: 1.35 },
    { id: 'atk',    grp: 'stats', icon: 'fist', name: 'Fuerza',         unit: '+4% daño',           max: 10, base: 80,  grow: 1.38 },
    { id: 'spd',    grp: 'stats', icon: 'boot', name: 'Zancada',        unit: '+3% velocidad',      max: 8,  base: 70,  grow: 1.4 },
    { id: 'cd',     grp: 'stats', icon: 'clock', name: 'Reflejos',       unit: '-3% recarga',        max: 8,  base: 90,  grow: 1.42 },
    { id: 'def',    grp: 'stats', icon: 'shield', name: 'Coraza',         unit: '+2% defensa',        max: 8,  base: 80,  grow: 1.4 },
    { id: 'regen',  grp: 'stats', icon: 'sprout', name: 'Síntesis',       unit: '+0.2 vida/s',        max: 5,  base: 120, grow: 1.5 },
    { id: 'crit',   grp: 'stats', icon: 'crit', name: 'Golpe Crítico',  unit: '+3% de críticos (x1,5 de daño)', max: 10, base: 90, grow: 1.4 },
    // ---- mejoras de los ataques (26-10-2026) ----
    // Empiezas la partida con los pasivos de las cartas Persistencia, Propulsión y Réplica
    // ya subidos (pl.pass, ver G.Player y G.Moves.applyPassives): las cartas suman encima.
    // La cantidad sigue con su tope (G.Moves.EXTRA_MAX: como mucho 3 más por ataque).
    { id: 'dur',    grp: 'atk',   icon: 'duration', name: 'Persistencia', unit: '+4% duración de los efectos', max: 8, base: 90, grow: 1.42,
      desc: 'Charcos, estelas, minas, torretas, aliados, aves, columnas, rayos que giran, potenciadores y aturdir' },
    { id: 'pspd',   grp: 'atk',   icon: 'zoom-lens', name: 'Propulsión',  unit: '+3% velocidad de proyectiles', max: 8, base: 70, grow: 1.4,
      desc: 'Proyectiles, bumeranes, orbes que giran, aves, aliados y todo lo que se mueve' },
    { id: 'amt',    grp: 'atk',   icon: 'loaded-dice', name: 'Réplica',   unit: '+1 proyectil en todos los ataques', max: 1, base: 2500, grow: 1,
      desc: 'Proyectiles, orbes, minas, aliados… Como mucho 3 más por ataque, con la evolución y las cartas' },
    { id: 'magnet', grp: 'run',   icon: 'magnet', name: 'Imán',           unit: '+12% recogida',      max: 6,  base: 50,  grow: 1.4 },
    { id: 'xp',     grp: 'run',   icon: 'exp', name: 'Sabiduría',      unit: '+5% experiencia',    max: 8,  base: 100, grow: 1.42 },
    { id: 'coins',  grp: 'run',   icon: 'coin', name: 'Fortuna',        unit: '+8% Pokémonedas',    max: 8,  base: 120, grow: 1.45 },
    { id: 'reroll', grp: 'run',   icon: 'reroll', name: 'Cambio de cartas', unit: '+1 cambio de cartas de nivel por run', max: 5, base: 150, grow: 1.6 },
    { id: 'ban',    grp: 'run',   icon: 'ban', name: 'Veto',           unit: 'Bloquea 1 movimiento: no te sale en las cartas', max: 3, base: 300, grow: 1.9 },
    { id: 'moves',  grp: 'moves', icon: 'cards', name: 'Repertorio',     unit: 'Empiezas con 2 movimientos', max: 1, base: 1500, grow: 1 },
    // 19-10-2026: se compra una vez y luego se elige gratis (save.pstart, ver G.startMoveOf).
    { id: 'start',  grp: 'moves', icon: 'start', name: 'Movimiento inicial', unit: 'Eliges con qué ataque empiezas la partida', max: 1, base: 400, grow: 1 },
    // 20-10-2026: igual, para el segundo de Repertorio (save.pstart2, ver G.startMove2Of). Sin Repertorio no se compra.
    { id: 'start2', grp: 'moves', icon: 'start', name: 'Segundo movimiento inicial', unit: 'Eliges el segundo ataque con el que empiezas (necesita Repertorio)', max: 1, base: 400, grow: 1, needs: 'moves' }
  ];
  const BY = {};
  for (const u of LIST) BY[u.id] = u;

  // Lo que da cada nivel de las mejoras de los ataques (perks) y lo más que pueden dar
  // (PASS_MAX): combat.js lo suma a lo que dan las cartas al validar a los compañeros.
  const PASS_PER = { dur: 0.04, pspd: 0.03, amt: 1 };
  const PASS_MAX = { dur: PASS_PER.dur * BY.dur.max, pspd: PASS_PER.pspd * BY.pspd.max, amt: PASS_PER.amt * BY.amt.max };
  const r2 = v => Math.round(v * 100) / 100;

  function cost(id, lvl) {
    const u = BY[id];
    return Math.round(u.base * Math.pow(u.grow, lvl) / 10) * 10;
  }

  /** Niveles comprados -> modificadores para G.Player. */
  function perks(levels = {}) {
    // Nunca por encima del máximo (una partida editada a mano no da más poder).
    const L = id => Math.max(0, Math.min(BY[id].max, Math.floor(+levels[id] || 0)));
    return {
      hp: L('hp') * 8,
      atkMul: 1 + L('atk') * 0.04,
      spdMul: 1 + L('spd') * 0.03,
      cdMul: 1 - L('cd') * 0.03,
      dmgReduce: L('def') * 0.02,
      regen: L('regen') * 0.2,
      magnetMul: 1 + L('magnet') * 0.12,
      xpMul: 1 + L('xp') * 0.05,
      coinMul: 1 + L('coins') * 0.08,
      startMoves: 1 + L('moves'),
      crit: L('crit') * 0.03,
      rerolls: L('reroll'),
      bans: L('ban'),
      // Pasivos con los que empiezas (pl.pass): duración, velocidad de proyectiles y cantidad.
      passDur: r2(1 + L('dur') * PASS_PER.dur),
      passSpd: r2(1 + L('pspd') * PASS_PER.pspd),
      passAmt: L('amt') * PASS_PER.amt
    };
  }

  return { LIST, BY, GROUPS, PASS_PER, PASS_MAX, cost, perks };
})();
