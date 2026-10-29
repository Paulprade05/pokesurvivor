/* ============ levelup.js — las tres cartas de subida de nivel ============
 * Tipos de carta:
 *   new   aprender un movimiento nuevo (sólo si quedan huecos de los 4; un vínculo libera huecos)
 *   up    mejorar un movimiento que ya tienes
 *   stat  mejora permanente de la run (pasiva: como mucho 4 distintas, ver MAX_PASSIVES)
 */
G.LevelUp = (() => {

  const STATS = [
    { id: 'hp',   icon: 'hpup', title: 'Vigor',        desc: '+20 de vida máxima (y la recupera).',
      apply: pl => pl.addMaxHp(20) },
    { id: 'atk',  icon: 'fist', title: 'Potencia',     desc: '+10% de daño con todos los movimientos.',
      apply: pl => pl.atkMul *= 1.10, max: 40 },
    { id: 'spd',  icon: 'boot', title: 'Carrera',      desc: '+7% de velocidad de movimiento.',
      apply: pl => pl.spdMul *= 1.07, max: 8 },
    { id: 'cd',   icon: 'clock', title: 'Reflejos',     desc: '-8% de recarga en todos los movimientos.',
      apply: pl => pl.cdMul *= 0.92, max: 10 },
    { id: 'def',  icon: 'shield', title: 'Coraza',       desc: '+6% de reducción de daño recibido.',
      apply: pl => pl.dmgReduce = Math.min(0.7, pl.dmgReduce + 0.06), max: 12 },
    { id: 'rgn',  icon: 'sprout', title: 'Síntesis',     desc: '+0.9 de vida regenerada por segundo.',
      apply: pl => pl.regenFlat += 0.9 },
    { id: 'mag',  icon: 'magnet', title: 'Imán',         desc: '+30% de radio de recogida de experiencia.',
      apply: pl => pl.magnet *= 1.30, max: 6 },
    { id: 'xp',   icon: 'exp', title: 'Aprendizaje',  desc: '+12% de experiencia ganada.',
      apply: pl => pl.xpMul *= 1.12, max: 8 },
    { id: 'heal', icon: 'berry', title: 'Baya Zidra',   desc: 'Recupera el 45% de tu vida ahora mismo.',
      apply: pl => pl.heal(pl.maxHp * 0.45) }
  ];

  // Pasivos al estilo de Vampire Survivors (22-10-2026): valen para TODOS los
  // ataques, los nuevos y los de siempre (ver G.Moves.applyPassives). Al
  // cogerlos se rehacen los movimientos (candidates, al final). Iconos: Lupa,
  // Refleluz, Dado Trucado, Telescopio y Periscopio (nombres de G.Icons).
  const r2 = v => Math.round(v * 100) / 100;
  const PASSIVES = [
    { id: 'area', icon: 'area', title: 'Amplitud', desc: '+10% de área en todos los ataques: radio, grosor y tamaño.',
      apply: pl => { pl.pass.area = r2(pl.pass.area + 0.10); }, max: 5 },
    { id: 'dur', icon: 'duration', title: 'Persistencia', desc: '+12% de duración: charcos, aliados, aves, rayos que giran, minas, torretas, potenciadores y aturdir.',
      apply: pl => { pl.pass.dur = r2(pl.pass.dur + 0.12); }, max: 5 },
    // Réplica (23-10-2026): +1 en todas las familias (antes +2 en las ráfagas radiales y
    // los abanicos y +3 en las lluvias) y hasta 3 cartas: como mucho 3 más de lo normal
    // de cada ataque, contando lo que suma su evolución (el tope, G.Moves.EXTRA_MAX).
    { id: 'amt', icon: 'loaded-dice', title: 'Réplica', desc: '+1 a la cantidad de todos los ataques: proyectiles, orbes, minas, aliados... Hasta +3 por ataque, con la evolución.',
      apply: pl => { pl.pass.amt += 1; }, max: 3 },
    { id: 'pspd', icon: 'zoom-lens', title: 'Propulsión', desc: '+10% de velocidad de los proyectiles y de todo lo que gira.',
      apply: pl => { pl.pass.pspd = r2(pl.pass.pspd + 0.10); }, max: 5 },
    // Puntería (23-10-2026): con +4 % de críticos daba un +2 % de daño por carta (Potencia, +10 %);
    // ahora +5 % de críticos y +10 % al daño de cada crítico (pl.critDmg): un +5 % por carta.
    { id: 'luck', icon: 'scope-lens', title: 'Puntería', desc: '+5% de probabilidad de golpe crítico y +10% de daño de los críticos.',
      apply: pl => { pl.critChance += 0.05; pl.critDmg = r2((pl.critDmg || 0) + 0.10); }, max: 5 }
  ];
  STATS.push(...PASSIVES);

  /*
   * Huecos de pasiva (24-10-2026, como en Vampire Survivors): como mucho 4 pasivas
   * distintas por partida. Cuenta como pasiva cada carta de mejora que se queda
   * (todas las de STATS menos la Baya Zidra, que sólo cura); el objeto va aparte
   * y los ataques siguen teniendo sus 4 huecos. Con las 4 cogidas sólo salen
   * subidas de las que ya llevas (y la Baya Zidra).
   */
  const MAX_PASSIVES = 4;
  const ONE_SHOT = new Set(['heal']);
  const isPassive = id => !ONE_SHOT.has(id) && STATS.some(s => s.id === id);
  /** Tus pasivas, en el orden en que las cogiste: [{ id, n (veces), def }]. */
  function passivesOf(pl) {
    const out = [];
    for (const id in (pl && pl.statsTaken) || {}) {
      if (!isPassive(id) || !(pl.statsTaken[id] > 0)) continue;
      out.push({ id, n: pl.statsTaken[id], def: STATS.find(s => s.id === id) });
    }
    return out;
  }
  /** ¿Puede coger esta carta de mejora? (una pasiva nueva necesita un hueco libre) */
  const canTake = (pl, id) => !isPassive(id) || (pl.statsTaken[id] || 0) > 0 || passivesOf(pl).length < MAX_PASSIVES;

  /** n elementos distintos de list, cada uno con probabilidad según weight(x). */
  function pickWeighted(list, n, weight) {
    const rest = list.map(x => [x, weight(x)]), out = [];
    while (out.length < n && rest.length) {
      let r = Math.random() * rest.reduce((a, [, w]) => a + w, 0), i = 0;
      while (i < rest.length - 1 && (r -= rest[i][1]) > 0) i++;
      out.push(rest.splice(i, 1)[0][0]);
    }
    return out;
  }

  // ---- con qué evoluciona cada ataque (23-10-2026): lo enseñan las cartas, la pausa y el resumen ----

  /**
   * Lo que pide un ataque (definición o el tuyo) para evolucionar:
   * { name, needs, icon, title, lvl (su nivel máximo), has (ya cogiste esa carta en
   * esta partida), max (el tuyo ya está al máximo), ready (las dos cosas) }, o null
   * si no evoluciona (potenciadores) o ya ha evolucionado.
   */
  function evoNeed(m, pl) {
    const def = m && (m.def || m);
    if (!def || m.evolved) return null;
    const taken = (pl && pl.statsTaken) || {};
    const ev = G.Moves.evoInfo({ id: def.id, def, kind: def.kind, lvl: def.maxLvl }, taken);
    if (!ev) return null;
    const s = STATS.find(x => x.id === ev.needs);
    const max = !!m.def && m.lvl >= def.maxLvl;
    // blocked: te falta esa pasiva y ya no te quedan huecos para cogerla.
    return { name: ev.name, needs: ev.needs, icon: s ? s.icon : 'tm', title: s ? s.title : ev.needName, lvl: def.maxLvl,
             has: ev.ready, max, ready: ev.ready && max, blocked: !ev.ready && !!pl && !canTake(pl, ev.needs) };
  }

  /**
   * Ataques que evolucionan con la carta `id`: los tuyos (sin evolucionar; ready si
   * ya están al máximo y esta carta es lo que les falta) y, si te quedan huecos,
   * los que aún puedes aprender.
   */
  function evolvesWith(id, pl) {
    const E = G.Moves.EVO, mine = [], more = [], first = !(pl.statsTaken && pl.statsTaken[id]);
    for (const m of pl.moves) if (!m.evolved && E[m.id] && E[m.id][1] === id) mine.push({ id: m.id, name: m.name, ready: first && m.lvl >= m.def.maxLvl });
    if (pl.slots.length < pl.maxMoves) {
      for (const mid of G.Moves.poolFor(pl.mon)) {
        if (E[mid] && E[mid][1] === id && !pl.hasMove(mid) && !(pl.banned && pl.banned.has(mid))) more.push(mid);
      }
    }
    return { mine, more };
  }

  /**
   * Pasivas que piden tus ataques para evolucionar (estén o no al máximo) y que aún no
   * llevas, si te queda hueco para cogerlas: { id de la pasiva: [tus ataques] }.
   */
  function neededPassives(pl) {
    const out = {};
    for (const m of pl.moves) {
      const ev = evoNeed(m, pl);
      if (!ev || ev.has || !canTake(pl, ev.needs)) continue;
      (out[ev.needs] = out[ev.needs] || []).push(m);
    }
    return out;
  }
  /**
   * Si coges la pasiva nueva `id` y con ella llenas el último hueco: tus ataques que se
   * quedarían sin evolucionar (piden otra pasiva que no llevas). → [ataques] (vacío si nada).
   */
  function wouldBlock(pl, id) {
    if (!isPassive(id) || (pl.statsTaken[id] || 0) > 0 || passivesOf(pl).length + 1 < MAX_PASSIVES) return [];
    const out = [];
    for (const m of pl.moves) {
      const ev = evoNeed(m, pl);
      if (ev && !ev.has && ev.needs !== id) out.push(m);
    }
    return out;
  }

  /** Construye el conjunto de cartas candidatas, con pesos. */
  function candidates(pl) {
    const out = [];

    // --- movimientos nuevos ---
    if (pl.slots.length < pl.maxMoves) {
      // Con 2 potenciadores ya no se ofrecen más: los buff no hacen daño y
      // llenar los 4 huecos con ellos deja la run sin salida. (Desde el 22-10-2026
      // cuentan juntos con los escudos y los barridos de pantalla: G.Moves.nonAttacking.)
      const buffs = pl.moves.filter(m => G.Moves.nonAttacking(m.kind)).length;
      // Si es de su lado flojo, cuánto rinde (Machamp con Bola Sombra...).
      const fitNote = (mon, cat) => {
        const f = G.Stats.fit(mon, cat);
        return f < 0.95 ? ` <span class="fit-low">Con ${mon.name} rinde un ${Math.round(f * 100)} %: pega mejor con ataques ${G.Stats.sideOf(mon) === 'special' ? 'especiales' : 'físicos'}.</span>` : '';
      };
      // Evolución por movimiento pendiente (Tangela → Poder Pasado...): ese movimiento entra
      // en las cartas aunque no sea de sus tipos, y sale mucho más (G.Evo.wantedMoves).
      const wm = G.Evo ? G.Evo.wantedMoves(pl) : null, want = wm ? wm.ids : [];
      const pool = [...new Set(G.Moves.poolFor(pl.mon).concat(want))].filter(id =>
        !pl.hasMove(id) && !(pl.banned && pl.banned.has(id)) && !(buffs >= 2 && G.Moves.nonAttacking(G.Moves.BY_ID[id].kind)));
      // Los de su lado bueno (y los empatados y mejoras) salen el doble; los que le hacen
      // evolucionar, entre todos como 4 de los de su lado bueno (uno solo: casi siempre entre los 6).
      const wantW = want.length ? Math.max(1, 8 / want.length) : 0;
      const weight = id => { const d = G.Moves.BY_ID[id]; return want.includes(id) ? wantW : G.Stats.fit(pl.mon, d.cat) >= 0.999 ? 2 : 1; };
      for (const id of pickWeighted(pool, 6, weight)) {
        const d = G.Moves.BY_ID[id], evoTo = want.includes(id) ? wm.to : 0;
        out.push({
          w: evoTo ? 16 : 10, type: 'new', key: 'new:' + id, evoTo,
          icon: 'move:' + id, color: G.U.TYPE_COLOR[d.type],
          // (Físico o especial va en su propia etiqueta, con borde: ver run-ui.js. Los
          // potenciadores no tienen categoría, pero Danza Espada y Danza Dragón suben el
          // ataque físico y Maquinación el especial: llevan la del lado que suben.)
          tag: G.U.TYPE_NAME[d.type],
          cat: G.Stats.NAME[d.cat || (d.stat === 'patk' ? 'physical' : d.stat === 'satk' ? 'special' : '')] || '',
          title: G.T(d.name, 'move'), desc: d.desc + fitNote(pl.mon, d.cat), evo: evoNeed(d, pl),
          apply: p => p.addMove(id)
        });
      }
    }

    // --- evoluciones: movimiento al máximo + su condición cumplida ---
    const waiting = {};                   // stat -> movimientos que la esperan para evolucionar
    for (const m of pl.moves) {
      const ev = G.Moves.evoInfo(m, pl.statsTaken);
      if (!ev) continue;
      if (!ev.ready) { (waiting[ev.needs] = waiting[ev.needs] || []).push(m); continue; }
      out.push({
        w: 40, type: 'evo', key: 'evo:' + m.id,
        icon: 'move:' + m.id, color: '#ffd23f', tag: 'EVOLUCIÓN',
        title: G.T(m.name, 'move') + ' → ' + G.T(ev.name, 'move'), desc: ev.text, evo: evoNeed(m, pl),
        apply: p => {
          G.Moves.evolve(m);
          G.FX.ring(p.x, p.y, 8, 120, '#ffd23f', 0.8, 6);
          G.FX.burst(p.x, p.y - p.bodyH * 0.5, '#ffe14d', 40, 240);
          G.Audio.sfx('legend');
          G.Progress.event('evolve', { move: m.id });
        }
      });
    }

    // --- mejoras de movimientos que ya tienes ---
    for (const m of pl.moves) {
      const txt = G.Moves.nextUpText(m);
      if (!txt) continue;
      out.push({
        w: 8, type: 'up', key: 'up:' + m.id,
        icon: 'move:' + m.id, color: G.U.TYPE_COLOR[m.type],
        tag: 'Nv.' + m.lvl + ' > ' + (m.lvl + 1),
        title: G.T(m.name, 'move'), desc: txt, evo: evoNeed(m, pl),
        apply: () => G.Moves.levelUp(m)
      });
    }

    // --- stats ---
    // Las que desbloquean una evolución salen siempre y con aviso.
    // Cada mejora tiene un tope de veces (`max`): en partidas muy largas se
    // acumulaban sin fin (velocidad, recarga y experiencia por las nubes) y el
    // juego acababa colgándose. Las que piden una evolución salen siempre.
    // Con los 4 huecos de pasiva llenos, sólo las que ya llevas (canTake).
    // (Réplica cuenta también la permanente de Mejoras, que ya va en pl.pass.amt: con ella, la 3.ª carta no sumaba nada.)
    const room = s => (s.id === 'amt' ? ((pl.pass && pl.pass.amt) || 0) < s.max : !s.max || (pl.statsTaken[s.id] || 0) < s.max) && canTake(pl, s.id);
    // Las pasivas que piden tus ataques para evolucionar (aunque aún no estén al máximo) y que
    // no llevas: mientras queden huecos de pasiva salen siempre y mucho más (24-10-2026: antes
    // los huecos se llenaban de pasivas al azar y luego no cabía la que hacía falta).
    const needed = neededPassives(pl);
    const must = s => waiting[s.id] || needed[s.id];
    const pickStats = G.U.pickN(STATS.filter(s => !must(s) && room(s)), 5).concat(STATS.filter(s => must(s) && room(s)));
    for (const s of pickStats) {
      const evoFor = waiting[s.id];
      // Un pasivo que no le sirve a ninguno de tus movimientos (Réplica con sólo
      // cuerpo a cuerpo...) sale la mitad. Con huecos libres no: aún puede servir.
      const idle = !evoFor && s.id !== 'luck' && PASSIVES.includes(s) && pl.slots.length >= pl.maxMoves &&
                   !pl.moves.some(m => G.Moves.passiveAffects(m.kind, s.id));
      out.push({
        w: evoFor ? 14 : needed[s.id] ? 11 : (pl.slots.length < pl.maxMoves ? 4 : 7) * (idle ? 0.5 : 1),
        type: 'stat', key: 'stat:' + s.id,
        icon: s.icon, color: evoFor ? '#ffd23f' : '#8fa3c4', tag: evoFor ? 'Evoluciona ' + evoFor.map(m => G.T(m.name, 'move')).join(', ') : 'Mejora',
        title: s.title, desc: s.desc, evolves: evolvesWith(s.id, pl),
        apply: p => { s.apply(p); p.statsTaken[s.id] = (p.statsTaken[s.id] || 0) + 1; }
      });
    }

    // Cualquier carta (aprender, mejorar, evolucionar o un pasivo) rehace los
    // movimientos con los pasivos de la run: así la pausa y el HUD ven los números de verdad.
    for (const c of out) { const f = c.apply; c.apply = p => { f(p); G.Moves.rebakeAll(p); }; }
    return out;
  }

  /** Devuelve 3 cartas distintas, elegidas por peso. */
  function offer(pl, n = 3) {
    const pool = candidates(pl);
    const picked = [];
    const used = new Set();
    // Si hay una evolución lista, su carta dorada sale siempre.
    const evo = pool.findIndex(c => c.type === 'evo');
    if (evo >= 0) { const c = pool.splice(evo, 1)[0]; used.add(c.key); picked.push(c); }

    while (picked.length < n && pool.length) {
      const total = pool.reduce((a, c) => a + c.w, 0);
      let r = Math.random() * total, idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { idx = i; break; } }
      const c = pool.splice(idx, 1)[0];
      if (used.has(c.key)) continue;
      used.add(c.key);
      picked.push(c);
    }
    return picked;
  }

  return { offer, STATS, evoNeed, evolvesWith, neededPassives, wouldBlock, MAX_PASSIVES, isPassive, passivesOf, canTake };
})();
