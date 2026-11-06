/* ============ pickup.js — orbes de experiencia y objetos ============
 * Los orbes se quedan quietos hasta que entras en el radio del imán; entonces
 * aceleran hacia ti. Para que no se acumulen miles, al pasar de MAX se fusionan
 * los más antiguos.
 *
 * Cooperativo: los objetos los crea el anfitrión (cada uno con su id) y los
 * demás reciben una copia. Todos vuelan hacia el jugador más cercano; quien
 * decide quién lo ha cogido es el anfitrión.
 */
G.Pickups = (() => {
  let list = [];
  const MAX = 420;
  let nextId = 1;

  const KIND = {
    xp:    { color: '#7fe0ff', glow: '#2a8fd0', r: 6 },        // (r: sólo el dibujo: sombra y brillo)
    xpBig: { color: '#ffd95e', glow: '#c08a10', r: 8 },
    heal:  { color: '#5fe08a', glow: '#1f8f4d', r: 6.5 },
    magnet:{ color: '#ff9ed8', glow: '#b03d84', r: 6.5 },
    bomb:  { color: '#ff7b3d', glow: '#b03d10', r: 6.5 },
    coin:  { color: '#ffd23f', glow: '#b8860b', r: 5.5 },
    ticket:   { color: '#ffd23f', glow: '#c08a10', r: 7 },
    ticket10: { color: '#c47bff', glow: '#8a3fd0', r: 8 },
    item:     { color: '#ffd23f', glow: '#c08a10', r: 9 }       // value = id del objeto
  };
  // (2.0, bloque 5) Los tickets ya no salen del suelo (systems/tickets.js): lo que daban los jefes (un ×10 1 de cada 3)
  //  se da en monedas (25 por ticket). Los tipos ticket/ticket10 siguen existiendo: un anfitrión viejo aún puede soltarlos.
  const BOSS_COINS = 17;                // montones de 5 monedas de un jefe del calendario (≈ 1/3 de ticket ×10)

  function clear() { list = []; }
  function all() { return list; }

  function push(o) {
    // En cooperativo sólo el anfitrión crea objetos (las copias llegan por la red).
    if (G.Coop.active && !G.Coop.isHost) return;
    o.id = nextId++;
    list.push(o);
    if (G.Coop.isHost) G.Coop.pickupAdded(o);
    if (list.length > MAX) {
      // Fusiona los dos más antiguos de XP para no crecer sin límite.
      const i = list.findIndex(p => p.kind === 'xp' || p.kind === 'xpBig');
      if (i >= 0) {
        const a = list.splice(i, 1)[0];
        const j = list.findIndex(p => p.kind === 'xp' || p.kind === 'xpBig');
        if (j >= 0) { list[j].value += a.value; list[j].kind = 'xpBig'; }
        if (G.Coop.isHost) G.Coop.pickupGone(a.id);
      } else {
        const a = list.shift();
        if (G.Coop.isHost) G.Coop.pickupGone(a.id);
      }
    }
  }

  /** Copia de un objeto del anfitrión. */
  function addRemote(id, kind, x, y, value) {
    if (list.some(p => p.id === id)) return;
    const o = orb(kind, x, y, value);
    o.id = id;
    list.push(o);
  }

  function removeId(id) {
    const i = list.findIndex(p => p.id === id);
    if (i < 0) return null;
    return list.splice(i, 1)[0];
  }

  /** Imán: todo vuela hacia el jugador más cercano. */
  function pullAll() { for (const o of list) o.pulled = true; }

  /** @param plain  sólo la experiencia (los legendarios de la Sentencia de Arceus) */
  function dropXp(x, y, value, boss = false, legend = false, plain = false) {
    if (boss) {
      // Los jefes revientan en un montón de orbes grandes + recompensas.
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * 6.2832, d = G.U.rand(10, 70);
        push(orb('xpBig', x + Math.cos(a) * d, y + Math.sin(a) * d, Math.ceil(value / 14)));
      }
      if (plain) return;
      push(orb('heal', x + 24, y, 0));
      push(orb('magnet', x - 24, y, 0));
      // (Los legendarios: sus monedas, en enemy.js die.)
      if (!legend) for (let i = 0; i < BOSS_COINS; i++) push(orb('coin', x + G.U.rand(-40, 40), y + G.U.rand(-28, 28), 5));
      return;
    }
    push(orb(value >= 20 ? 'xpBig' : 'xp', x, y, value));

    // Drops ocasionales.
    const r = Math.random();
    if (r < 0.012) push(orb('heal', x + G.U.rand(-8, 8), y, 0));
    else if (r < 0.020) push(orb('magnet', x, y, 0));
    else if (r < 0.026) push(orb('bomb', x, y, 0));
  }

  /** Suelta un objeto suelto: 'heal' | 'magnet' | 'bomb' | 'coin'. */
  function drop(kind, x, y, value = 0) {
    push(orb(kind, x, y, value));
  }

  function orb(kind, x, y, value) {
    const a = Math.random() * 6.2832;
    return {
      kind, x, y, value,
      vx: Math.cos(a) * G.U.rand(10, 46), vy: Math.sin(a) * G.U.rand(10, 46),
      t: Math.random() * 6.28, pulled: false
    };
  }

  /**
   * @param players  un jugador o la lista de jugadores (los caídos no recogen)
   * @param onCollect(pickup, jugador)
   */
  function update(dt, players, onCollect) {
    if (!Array.isArray(players)) players = [players];
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt * 4;

      // El jugador vivo más cercano (en solitario, siempre tú).
      let pl = null, d2 = Infinity;
      for (const o of players) {
        if (o.dead && players.length > 1) continue;
        const dd = G.U.dist2(o.x, o.y, p.x, p.y);
        if (dd < d2) { d2 = dd; pl = o; }
      }
      if (!pl) continue;
      const dx = pl.x - p.x, dy = pl.y - p.y;
      const mag2 = pl.magnet * pl.magnet;

      if (p.pulled || d2 < mag2) {
        p.pulled = true;
        p.pt = (p.pt || 0) + dt;
        const d = Math.sqrt(d2) || 1;
        // Siempre más rápido que quien lo atrae (#263: a 240 fijos, un Pokémon
        // veloz los dejaba atrás) y acelerando con el tiempo que lleva atraído.
        // (_vx, _vy: su velocidad suavizada, ver EnemyMgr.update.)
        const sp = Math.hypot(pl._vx || 0, pl._vy || 0);
        const pull = Math.max(240, sp * 1.4) + 1400 / d + Math.min(400, p.pt * 160);
        p.vx = G.U.damp(p.vx, (dx / d) * pull, 9, dt);
        p.vy = G.U.damp(p.vy, (dy / d) * pull, 9, dt);
      } else {
        p.vx *= Math.pow(0.02, dt);
        p.vy *= Math.pow(0.02, dt);
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // (Rápido, en un fotograma podía pasar de largo: también si este paso ya llega.)
      if (d2 < 15 * 15 || (p.pulled && d2 < (p.vx * p.vx + p.vy * p.vy) * dt * dt)) {
        list.splice(i, 1);
        // (Arte animado) Un destello donde lo has cogido.
        if (G.Anim.on) G.FX.sp('sparkle', p.kind === 'coin' || p.kind === 'item' ? 'electric' : p.kind === 'heal' ? 'grass' : 'ice', pl.x + G.U.rand(-8, 8), pl.y - pl.bodyH * 0.5 + G.U.rand(-8, 8), { life: 0.24, frameRate: 16, fade: false });
        onCollect(p, pl);
      }
    }
  }

  // Objeto de la Mochila que se pinta para cada cosa del suelo (G.Icons; los objetos equipables, su id).
  const SPRITE = { heal: 'berry', magnet: 'magnet', bomb: 'bomb', coin: 'coin', ticket: 'ticket', ticket10: 'ticket10' };
  // La experiencia, como Caramelos Exp.: más grandes cuanto más valen (los
  // primeros enemigos dan 22-28, los del final 130-220; los fusionados, más).
  const xpSprite = v => v < 30 ? 'xp1' : v < 60 ? 'xp2' : v < 120 ? 'xp3' : v < 300 ? 'xp4' : 'xp5';

  /*
   * (Arte animado, 05-11-2026) El brillo y la sombra, ya hechos y a píxeles (antes, arcos lisos que no casaban con el pixel
   * art y costaban uno por objeto: con 400 orbes se notaba). Dos fotogramas: el disco tramado cambia y parece que late.
   */
  const glowC = new Map();
  let shadowC = null;
  function glowImg(col, f, R = 10) {
    const k = col + f + '/' + R;
    let cv = glowC.get(k);
    if (cv) return cv;
    const S = R * 2 + 1;
    cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.fillStyle = col;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - R, y - R);
      if (d > R) continue;
      if (d < 6 ? ((x + y + f) & 1) === 0 : ((x + f) & 1) === 0 && (y & 1) === 0) g.fillRect(x, y, 1, 1);
    }
    glowC.set(k, cv);
    return cv;
  }
  function shadowImg() {
    if (shadowC) return shadowC;
    const cv = document.createElement('canvas');
    cv.width = 10; cv.height = 4;
    const g = cv.getContext('2d');
    if (!g) { G.U.freeCanvas(cv); return null; }
    g.fillStyle = '#000';
    g.fillRect(2, 0, 6, 4); g.fillRect(0, 1, 10, 2);
    shadowC = cv;
    return cv;
  }
  /** Suelta los brillos guardados (game.js purgeGfx). */
  function purge() { for (const c of glowC.values()) G.U.freeCanvas(c); glowC.clear(); if (shadowC) G.U.freeCanvas(shadowC); shadowC = null; G.Icons.purgeChunks(); }

  function draw(ctx) {
    const anim = G.Anim.on, sh = shadowImg();
    for (const p of list) {
      if (!G.Camera.sees(p.x, p.y, 30)) continue;
      const k = KIND[p.kind];
      // Con «Animaciones» apagado, quieto: sin saltitos ni latidos (el brillo se queda, que se vea desde lejos).
      const bounce = anim ? Math.abs(Math.sin(p.t * 0.8)) * 3 : 1;
      const r = k.r;
      const y = p.y - 6 - bounce;
      const xp = p.kind === 'xp' || p.kind === 'xpBig';
      const f = anim ? (p.t * 0.5) & 1 : 0;

      if (sh) {
        ctx.globalAlpha = 0.28;
        ctx.drawImage(sh, Math.round(p.x - r), Math.round(p.y - r * 0.35), r * 2, r * 0.7);
      }
      ctx.globalAlpha = 0.34;
      // (Siempre a 2 unidades por píxel, como los Pokémon: el tamaño cambia con el radio del dibujo, no estirándolo.)
      const gi = glowImg(p.kind === 'item' ? '#ffe14d' : k.glow, f, p.kind === 'item' ? 10 : Math.round(r));
      if (gi) { const D = gi.width * 2; ctx.drawImage(gi, Math.round(p.x - D / 2), Math.round(y - D / 2), D, D); }
      ctx.globalAlpha = 1;

      // La moneda gira: el mismo dibujo, cada vez más estrecho.
      const name = xp ? xpSprite(p.value) : p.kind === 'item' ? p.value : SPRITE[p.kind];
      if (p.kind === 'coin' && anim) {
        const w = [1, 0.75, 0.3, 0.75][(p.t * 2.2) & 3];
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(y));
        ctx.scale(w, 1);
        const ok = G.Icons.chunky(ctx, name, 0, 0);
        ctx.restore();
        if (ok) continue;
      } else if (G.Icons.chunky(ctx, name, p.x, y)) {
        // Un destello en los que valen algo: los caramelos grandes, los objetos.
        if (anim && (p.kind === 'item' || p.kind === 'xpBig') && ((p.t * 0.7 + p.id) & 7) === 0) G.Icons.twinkle(ctx, p.x + 6, y - 7, (p.t * 0.7 + p.id) % 1, 2);
        continue;
      }

      // Sin cargar aún: el dibujo de antes.
      ctx.fillStyle = k.color;
      if (xp) {
        ctx.beginPath();
        ctx.moveTo(p.x, y - r); ctx.lineTo(p.x + r * 0.78, y);
        ctx.lineTo(p.x, y + r); ctx.lineTo(p.x - r * 0.78, y);
        ctx.closePath(); ctx.fill();
      } else if (p.kind === 'coin') {
        // Moneda que gira: elipse que se estrecha.
        const sx = Math.max(0.25, Math.abs(Math.cos(p.t * 0.9)));
        ctx.beginPath(); ctx.ellipse(p.x, y, r * sx, r, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#b8860b';
        ctx.beginPath(); ctx.ellipse(p.x, y, r * sx * 0.5, r * 0.5, 0, 0, 6.2832); ctx.fill();
      } else {
        const sz = p.kind === 'ticket10' || p.kind === 'item' ? 24 : 18;
        G.Icons.draw(ctx, p.kind === 'item' ? p.value : SPRITE[p.kind], p.x - sz / 2, y - sz / 2 - 1, sz);
        continue;
      }
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.arc(p.x - r * 0.25, y - r * 0.3, r * 0.28, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { clear, all, dropXp, drop, update, draw, purge, glow: glowImg, addRemote, removeId, pullAll, KIND, get count() { return list.length; } };
})();
