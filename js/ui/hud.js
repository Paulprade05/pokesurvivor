/* ============ hud.js — interfaz dentro del canvas ============
 * Se dibuja en coordenadas de PANTALLA (sin la transformación de cámara).
 *
 * En vertical (móvil de pie) va en filas: tarjeta a la izquierda y pausa y
 * reloj a la derecha; debajo, la línea del bioma, el clima, los compañeros y
 * las barras de los jefes; los ataques abajo, en su sitio de siempre.
 */
G.HUD = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const noop = () => {};
  const NONE = [];                   // hueco sin movimiento (sin crear una lista en cada fotograma)

  /**
   * Lo que deja libre el HUD en este fotograma, para las flechas del borde y las
   * cuentas atrás (también events.js y judgment.js). tall: en vertical; below:
   * dónde acaba lo de arriba (con los jefes); lo / hi: franja de alto para las
   * flechas en vertical; l / r: márgenes de los lados (la muesca del iPhone).
   */
  const lay = { tall: false, below: 0, lo: 0, hi: 0, l: 0, r: 0 };
  /** Alto de una flecha del borde: en vertical, sin pisar lo de arriba ni la barra de ataques. */
  function edgeY(sy, lo, hi) { return lay.tall ? G.U.clamp(sy, Math.max(lo, lay.lo), Math.min(hi, lay.hi)) : G.U.clamp(sy, lo, hi); }
  /** Ancho de una flecha del borde: lejos de la muesca. */
  function edgeX(sx, M, w) { return G.U.clamp(sx, M + lay.l, w - M - lay.r); }

  /**
   * Pone la letra más grande (hasta size) con la que s cabe en maxW; si ni con
   * min cabe, al pintarla con maxW el navegador la estrecha. raw: s ya traducido.
   */
  function fitFont(ctx, s, wt, size, maxW, min = 11, raw = false) {
    ctx.font = F(wt, size);
    const tw = raw ? G.I18n.rawCanvas(ctx, 'measureText', s).width : ctx.measureText(s).width;
    if (tw > maxW) ctx.font = F(wt, Math.max(min, Math.floor(size * maxW / tw)));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bar(ctx, x, y, w, h, frac, col, bg = 'rgba(0,0,0,.55)') {
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    if (frac > 0) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w * G.U.clamp(frac, 0, 1), h);
      ctx.restore();
    }
  }

  /** Color de la vida: verde, amarillo por debajo de la mitad y rojo por debajo de un cuarto. */
  const hpColor = f => f > 0.5 ? '#5fe08a' : f > 0.25 ? '#ffd23f' : '#ff5f6d';

  /**
   * Tamaño del HUD. De base crece con la pantalla (en monitores grandes se veía
   * diminuto) y se multiplica por el ajuste «Tamaño del HUD»; en pantallas
   * pequeñas (móvil) no pasa de lo que cabe.
   */
  function scaleFor(w, h) {
    const base = G.Touch.active ? 1 : G.U.clamp(Math.min(w / 1280, h / 800), 1, 1.5);
    const cap = Math.max(1, Math.min(w / 560, h / 320));
    return Math.min(base * (+G.Settings.get('hudScale') || 1), cap);
  }

  // Degradados guardados (crearlos en cada fotograma cuesta); se rehacen si cambia el tamaño.
  let xpTop = null, xpTopW = 0, xpCard = null, lowG = null, lowW = 0, lowH = 0;
  const bosses = [];                 // jefes vivos (la lista se reutiliza)

  /** Poca vida: los bordes de la pantalla laten en rojo (lento y suave con «Menos destellos»). */
  function lowHp(ctx, w, h, f, calm, now) {
    if (!lowG || lowW !== w || lowH !== h) {
      lowG = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      lowG.addColorStop(0, 'rgba(255,30,50,0)');
      lowG.addColorStop(1, 'rgba(255,30,50,.8)');
      lowW = w; lowH = h;
    }
    const deep = 1 - f / 0.3, t = now / 1000;        // 0 al 30 % de vida, 1 sin vida
    ctx.globalAlpha = calm ? (0.14 + 0.12 * deep) * (0.8 + 0.2 * Math.sin(t * 1.6))
                           : (0.28 + 0.32 * deep) * (0.65 + 0.35 * Math.sin(t * 5));
    ctx.fillStyle = lowG;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  /** Parte un texto ya traducido en líneas (en chino, por letras). */
  function wrap(ctx, text, maxW) {
    const out = [];
    let line = '';
    for (const tok of text.match(/[\u3000-\u9fff\uff00-\uffef]|[^\s\u3000-\u9fff\uff00-\uffef]+|\s+/g) || []) {
      const next = line + tok;
      if (line.trim() && tok.trim() && G.I18n.rawCanvas(ctx, 'measureText', next.trim()).width > maxW) { out.push(line.trim()); line = tok; }
      else line = next;
    }
    if (line.trim()) out.push(line.trim());
    return out;
  }

  // Aviso grande partido en líneas (se rehace sólo si cambia el texto o el ancho).
  let banSrc = '', banMw = 0, banLines = NONE;

  // Ficha del objeto: al pasar el ratón por encima (PC) o 3 s al tocarlo.
  let tipUntil = 0, tipIt = null, tipName = '', tipLines = [], tipW = 0;
  function itemTip(ctx, it, ix, iy, S, W, a) {
    ctx.save();
    ctx.globalAlpha = a;
    if (tipIt !== it) {
      // Se traduce y se parte en líneas una vez por objeto.
      tipIt = it; tipName = G.T(it.name);
      ctx.font = F(600, 11);
      tipLines = wrap(ctx, G.T(it.desc), 230);
      tipW = 0;
      for (const l of tipLines) tipW = Math.max(tipW, G.I18n.rawCanvas(ctx, 'measureText', l).width);
      ctx.font = F(800, 12);
      tipW = Math.max(tipW, G.I18n.rawCanvas(ctx, 'measureText', tipName).width);
    }
    const bw = tipW + 20, bh = 28 + tipLines.length * 14;
    const bx = G.U.clamp(ix, 6, Math.max(6, W - bw - 6));
    let by = iy - 20 - bh;
    if (by < 6) by = iy + S + 8;                     // barra arriba (móvil): debajo
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fillStyle = 'rgba(10,16,32,.94)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = F(800, 12); ctx.fillStyle = '#ffd23f';
    G.I18n.rawCanvas(ctx, 'fillText', tipName, bx + 10, by + 18);
    ctx.font = F(600, 11); ctx.fillStyle = '#e8f0ff';
    for (let i = 0; i < tipLines.length; i++) G.I18n.rawCanvas(ctx, 'fillText', tipLines[i], bx + 10, by + 34 + i * 14);
    ctx.restore();
  }

  function draw(ctx, w, h, pl, st) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    G.Touch.clearButtons();
    const touch = G.Touch.active;
    const now = performance.now(), calm = G.Settings.get('calm');
    const k = scaleFor(w, h);
    const hpF = G.U.clamp(pl.hp / pl.maxHp, 0, 1);
    const tall = h > w;                            // vertical (móvil de pie)
    const sa = G.Touch.safeArea();
    lay.tall = tall; lay.l = sa.left; lay.r = sa.right;

    if (hpF < 0.3 && !pl.dead && G.Settings.get('lowHpWarn') !== false) lowHp(ctx, w, h, hpF, calm, now);

    // ---------- barra de experiencia (borde superior) ----------
    // (En vertical, debajo de la barra de estado del iPhone.)
    const xpF = G.U.clamp(pl.xp / pl.xpNext, 0, 1), xy = tall ? sa.top : 0;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, xy, w, 7);
    if (!xpTop || xpTopW !== w) {
      xpTop = ctx.createLinearGradient(0, 0, w, 0);
      xpTop.addColorStop(0, '#4fd1ff'); xpTop.addColorStop(1, '#a98bff');
      xpTopW = w;
    }
    ctx.fillStyle = xpTop;
    ctx.fillRect(0, xy, w * xpF, 7);

    // ---------- tarjeta: nivel, nombre, vida y experiencia (crece con k) ----------
    const px = 16 + sa.left, py = 14 + sa.top;     // lejos de la muesca del iPhone
    const CW = 228, CH = 64;
    ctx.save();
    ctx.translate(px, py); ctx.scale(k, k);
    roundRect(ctx, 0, 0, CW, CH, 9);
    ctx.fillStyle = 'rgba(10,16,32,.72)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(190,210,245,.35)'; ctx.stroke();

    // Nivel en una chapa dorada («Nv.» va aparte para que se traduzca).
    ctx.textAlign = 'left';
    ctx.font = F(800, 9);
    const nvW = ctx.measureText('Nv.').width;
    ctx.font = F(800, 13);
    const lv = String(pl.level), lw = nvW + ctx.measureText(lv).width + 13;
    roundRect(ctx, 8, 7, lw, 18, 6);
    ctx.fillStyle = '#ffcb3d'; ctx.fill();
    ctx.fillStyle = '#2a1a04';
    ctx.fillText(lv, 16 + nvW, 21);
    ctx.font = F(800, 9);
    ctx.fillText('Nv.', 13, 20);
    ctx.font = F(800, 13);
    ctx.fillStyle = '#eaf2ff';
    ctx.fillText(pl.mon.name, 15 + lw, 21);

    // Vida: barra gruesa con los números dentro; el color baja de verde a rojo.
    ctx.font = F(800, 10);
    ctx.fillStyle = '#ffcb3d';
    ctx.fillText('PS', 8, 43);
    bar(ctx, 28, 31, 192, 16, hpF, hpColor(hpF));
    if (hpF < 0.3 && !pl.dead) {
      roundRect(ctx, 28, 31, 192, 16, 8);
      ctx.lineWidth = 2;
      ctx.strokeStyle = calm ? 'rgba(255,95,109,.8)' : 'rgba(255,95,109,' + (0.5 + 0.4 * Math.sin(now / 120)).toFixed(2) + ')';
      ctx.stroke();
    }
    const hpTxt = Math.max(0, Math.ceil(pl.hp)) + ' / ' + Math.round(pl.maxHp);
    ctx.font = F(800, 12);
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.strokeText(hpTxt, 124, 43);
    ctx.fillStyle = '#fff';
    ctx.fillText(hpTxt, 124, 43);

    // Experiencia hasta el siguiente nivel, debajo de la vida.
    ctx.textAlign = 'left';
    ctx.font = F(800, 8);
    ctx.fillStyle = '#9ad8ff';
    ctx.fillText('EXP', 8, 57);
    if (!xpCard) {
      xpCard = ctx.createLinearGradient(28, 0, 220, 0);
      xpCard.addColorStop(0, '#4fd1ff'); xpCard.addColorStop(1, '#a98bff');
    }
    bar(ctx, 28, 51, 192, 6, xpF, xpCard);

    // buffs activos (y el poder de altar), debajo de la tarjeta
    const COL = { atk: '#ff6b4d', patk: '#ff6b4d', satk: '#c47bff', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
    const LBL = { atk: 'ATK', patk: 'ATK', satk: 'AT.E', spd: 'VEL', def: 'DEF', regen: 'REG' };
    let bx = 0;
    const by = CH + 5;
    ctx.font = F(800, 9);
    for (const key in pl.buffs) {
      const b = pl.buffs[key];
      if (b.n <= 0) continue;
      const txt = LBL[key] + ' ×' + b.n;
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, by, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
      ctx.fillStyle = COL[key];
      ctx.fillText(txt, bx + 6, by + 11);
      bx += tw + 5;
    }
    // Poder de altar activo.
    if (pl.power) {
      const pw = pl.power, txt = pw.def.name.toUpperCase() + ' ' + Math.ceil(pw.t) + 's';
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, by, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = pw.def.color;
      ctx.fillText(txt, bx + 6, by + 11);
      bx += tw + 5;
    }
    ctx.restore();
    const cardR = px + CW * k, cardB = py + (bx > 0 ? by + 15 : CH) * k;

    // ---------- reloj / bioma / kills ----------
    // En vertical: el reloj a la derecha, debajo de la pausa, y la línea del
    // bioma de lado a lado, bajo la tarjeta (con sitio para los potenciadores).
    const clockY = tall ? py + (touch ? 44 : 0) + 19 * k : 16 + 26 * k;
    const infoY = tall ? py + (CH + 33) * k : clockY + 17 * k;
    ctx.textAlign = tall ? 'right' : 'center';
    ctx.font = F(800, (tall ? 24 : 26) * k);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillText(G.U.mmss(st.time), tall ? w - 12 - sa.right : w / 2, clockY);
    ctx.textAlign = 'center';
    ctx.font = F(600, 11 * k);
    const info = G.World.biomeName().toUpperCase() + '  ·  ' + pl.kills + ' DERROTADOS  ·  ' + pl.coins + ' MONEDAS';
    // En pantallas estrechas se aparta de la tarjeta en vez de pisarla.
    const ix0 = tall ? w / 2 : Math.max(w / 2, cardR + 10 + ctx.measureText(info).width / 2);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.5)';
    if (tall) {
      // (Si no cabe, se estrecha un poco: la letra no baja de 11 px.)
      const mw = w - 24 - sa.left - sa.right;
      ctx.strokeText(info, ix0, infoY, mw);
      ctx.fillStyle = '#a9bad6';
      ctx.fillText(info, ix0, infoY, mw);
    } else {
      ctx.strokeText(info, ix0, infoY);
      ctx.fillStyle = '#a9bad6';
      ctx.fillText(info, ix0, infoY);
    }
    let ty = infoY + 9 * k;          // vertical: dónde sigue lo de arriba

    // ---------- clima (arriba a la derecha; en vertical, centrado bajo el bioma) ----------
    const wx = G.Weather.current;
    if (wx) {
      ctx.save();
      if (tall) ctx.translate(w / 2, ty - 2 * k);
      else ctx.translate(w - 16 - sa.right - (touch ? 56 : 0), 14 + sa.top);
      ctx.scale(k, k);
      ctx.font = F(800, 11);
      ctx.textAlign = 'left';
      const txt = wx.name.toUpperCase() + ' · ' + Math.ceil(wx.left) + 's';
      const tw = ctx.measureText(txt).width + 40, x0 = tall ? -tw / 2 : -tw;
      roundRect(ctx, x0, 0, tw, 26, 9);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
      G.Icons.draw(ctx, wx.icon, x0 + 6, 3, 20);
      ctx.fillStyle = wx.color;
      ctx.fillText(txt, x0 + 32, 17);
      ctx.restore();
      if (tall) ty += 30 * k;
    }

    // Vertical: sitio para la lista de compañeros (se pinta en drawCoop).
    const coopTop = tall ? ty : cardB + 6 * k;
    if (tall && G.Coop.active) {
      let mates = 0;
      for (const m of G.Coop.mates) if (m.connected) mates++;
      if (mates) ty += (mates * 15 + 4) * k;
    }

    // ---------- barras de los jefes (una por jefe vivo, apiladas) ----------
    bosses.length = 0;
    for (const e of G.EnemyMgr.all()) if (e.boss && !e.dead) bosses.push(e);
    let bossB = 0;                   // dónde acaban (lo de la grieta va debajo)
    if (bosses.length) {
      const nb = Math.min(3, bosses.length), bh = 13 * k, left = cardR + 12;
      let bw = Math.min(420 * k, w - 80), bx0 = (w - bw) / 2;
      // Vertical: de lado a lado (con sitio para el «+N»), debajo de todo lo de arriba.
      if (tall) { bw = Math.min(420 * k, w - 64 - sa.left - sa.right); bx0 = (w - bw) / 2; }
      else if (bx0 < left) { bx0 = left; bw = Math.min(bw, w - 16 - sa.right - left); }
      let y = tall ? ty : infoY + 11 * k;
      ctx.textAlign = 'center';
      ctx.font = F(800, 10 * k);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      for (let i = 0; i < nb; i++) {
        const b = bosses[i], name = b.name.toUpperCase();
        bar(ctx, bx0, y, bw, bh, b.hp / b.maxHp, '#ffcb3d');
        // Nombre en claro con borde: se lee aunque la barra esté medio vacía.
        ctx.strokeText(name, bx0 + bw / 2, y + bh - 3 * k);
        ctx.fillStyle = '#fff8e0';
        ctx.fillText(name, bx0 + bw / 2, y + bh - 3 * k);
        y += bh + 3 * k;
      }
      if (bosses.length > nb) {
        ctx.textAlign = 'left'; ctx.fillStyle = '#ffcb3d';
        ctx.fillText('+' + (bosses.length - nb), bx0 + bw + 6, y - 6 * k);
      }
      bossB = y;
    }
    lay.below = bossB || ty;

    // ---------- dónde va la ranura de movimientos (se pinta más abajo) ----------
    // En PC crece con el HUD (kb); en móvil no, para que case con «Colocar los
    // botones» (layout-ui.js). Se dibuja en una pantalla de W×H y los botones
    // táctiles se registran en píxeles de verdad (× kb).
    const kb = touch ? 1 : k, W = w / kb, H = h / kb;
    const S = 54, GAP = 9;
    const n = Math.max(1, pl.slots.length), nAll = Math.max(n, pl.maxMoves);
    const totalW = n * S + (n - 1) * GAP;
    let sx = (W - totalW) / 2;
    // Por encima de la barra de inicio del iPhone (allí los toques a veces no llegan).
    let sy = H - S - 18 - (touch ? Math.min(28, sa.bottom) : 0);
    // En móvil, donde la haya puesto el jugador: el bloque objeto + todos los
    // huecos (aunque aún no estén llenos), por su centro, como en el editor
    // (layout-ui.js); los ataques nuevos van saliendo hacia la derecha.
    // En vertical, igual pero centrado abajo (y se ven los huecos vacíos).
    const pb = touch && G.Touch.spot('bar', w, h);
    if (pb || tall) {
      const bw = S + 18 + nAll * S + (nAll - 1) * GAP;
      sx = G.U.clamp((pb ? pb[0] * W : W / 2) - bw / 2, 6, Math.max(6, W - bw - 6)) + S + 18;
      sy = G.U.clamp(pb ? pb[1] * H - S / 2 : sy, Math.max(24, sa.top + 6), H - S - 6);   // (no bajo la barra de estado)
    }
    // Vínculo guardado: a la derecha de los huecos o, en vertical si no cabe, encima del último.
    const nDraw = tall ? nAll : n, barEnd = sx + nDraw * (S + GAP) - GAP, bondW = pl.bonds > 1 ? 47 : 24;   // (icono y «×N»)
    const bondUp = tall && pl.bonds > 0 && barEnd + 12 + bondW > W - 4;
    // Vertical: las flechas del borde, entre lo de arriba (y su cuenta atrás) y
    // la barra con el nombre del ataque (si está abajo).
    if (tall) {
      lay.lo = lay.below + 14 * k + 36;
      lay.hi = sy * kb > h / 2 ? (sy - (bondUp ? 62 : 31)) * kb - 36 : h - 60 - sa.bottom;
    }

    // ---------- aviso ----------
    // ---------- shinies fuera de pantalla: destello en el borde ----------
    const cam = G.Camera, pulse = 0.6 + Math.sin(now / 160) * 0.4;
    for (const e of G.EnemyMgr.shinies()) {
      const sx = (e.x - cam.left()) * cam.scale, sy = (e.y - cam.top()) * cam.scale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 34;
      const ex = edgeX(sx, M, w), ey = edgeY(sy, M + 60, h - M - 70);
      const a = Math.atan2(sy - ey, sx - ex);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.translate(ex, ey);
      ctx.fillStyle = '#9ae6ff';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      ctx.lineTo(Math.cos(a + 2.5) * 12, Math.sin(a + 2.5) * 12);
      ctx.lineTo(Math.cos(a - 2.5) * 12, Math.sin(a - 2.5) * 12);
      ctx.fill();
      ctx.globalAlpha = 1;
      G.Icons.draw(ctx, 'shiny', -12, -12, 24);
      ctx.restore();
    }

    // ---------- jefes fuera de la vista: flecha dorada en el borde y a cuántos metros ----------
    // (También en el invitado: EnemyMgr.all() lleva los enemigos que manda el anfitrión.)
    for (const b of bosses) {
      const sx = (b.x - cam.left()) * cam.scale, sy = (b.y - (b.bodyH || 0) * 0.5 - cam.top()) * cam.scale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 40;
      // (Por debajo de las barras de los jefes, que con el HUD grande bajan más.)
      const ex = edgeX(sx, M, w), ey = edgeY(sy, Math.max(M + 70, bossB + 34), h - M - 80);
      const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sn = Math.sin(a);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.moveTo(ca * 30, sn * 30);
      ctx.lineTo(Math.cos(a + 2.45) * 15, Math.sin(a + 2.45) * 15);
      ctx.lineTo(Math.cos(a - 2.45) * 15, Math.sin(a - 2.45) * 15);
      ctx.closePath();
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.fillStyle = '#ffcb3d'; ctx.fill();
      ctx.globalAlpha = 1;
      G.Icons.draw(ctx, 'crown', -10, -10, 20);
      const label = Math.round(G.U.dist(pl.x, pl.y, b.x, b.y) / 32) + ' m';
      ctx.font = F(800, 11);
      ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(label, -ca * 26, -sn * 24 + 4);
      ctx.fillStyle = '#ffcb3d';
      ctx.fillText(label, -ca * 26, -sn * 24 + 4);
      ctx.restore();
    }

    if (G.Coop.active) drawCoop(ctx, w, h, pl, px, coopTop, k);

    // Grieta: flecha grande que late en el borde si no se ve, y si se ve, una
    // flecha que bota encima; en la arena, cuenta atrás.
    const rift = G.Rift.rift;
    if (rift) {
      const sx = (rift.x - cam.left()) * cam.scale, sy = (rift.y - 40 - cam.top()) * cam.scale;
      const now = performance.now() / 1000, beat = 0.5 + Math.sin(now * 7) * 0.5;
      const label = 'GRIETA · ' + Math.round(G.U.dist(pl.x, pl.y, rift.x, rift.y) / 32) + ' m · ' + Math.ceil(rift.ttl) + ' s';
      const off = sx < 0 || sx > w || sy < 0 || sy > h;
      ctx.save();
      if (off) {
        const M = 52, ex = edgeX(sx, M, w), ey = edgeY(sy, M + 70, h - M - 80);
        const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sa = Math.sin(a);
        ctx.translate(ex, ey);
        // Halo que late.
        ctx.globalAlpha = 0.18 + beat * 0.22;
        ctx.fillStyle = '#b48aff';
        ctx.beginPath(); ctx.arc(0, 0, 30 + beat * 8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        const tri = (k) => {
          ctx.beginPath();
          ctx.moveTo(ca * 40 * k, sa * 40 * k);
          ctx.lineTo(Math.cos(a + 2.45) * 20 * k, Math.sin(a + 2.45) * 20 * k);
          ctx.lineTo(Math.cos(a - 2.45) * 20 * k, Math.sin(a - 2.45) * 20 * k);
          ctx.closePath();
        };
        tri(1.12); ctx.fillStyle = '#1a0b33'; ctx.fill();
        tri(1); ctx.fillStyle = beat > 0.5 ? '#e2d0ff' : '#a06bff'; ctx.fill();
        ctx.font = F(800, 12);
        ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        const lx = -ca * 34, ly = -sa * 30 + 4;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = '#e2d0ff';
        ctx.fillText(label, lx, ly);
      } else {
        // Encima de la grieta: flecha hacia abajo que bota.
        const by = sy - 46 - Math.abs(Math.sin(now * 4)) * 10;
        ctx.translate(sx, by);
        ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(15, -12); ctx.lineTo(0, 8); ctx.closePath();
        ctx.lineWidth = 4; ctx.strokeStyle = '#1a0b33'; ctx.stroke();
        ctx.fillStyle = beat > 0.5 ? '#e2d0ff' : '#a06bff'; ctx.fill();
        ctx.font = F(800, 11); ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        const l2 = 'GRIETA · ' + Math.ceil(rift.ttl) + ' s';
        ctx.strokeText(l2, 0, -18); ctx.fillStyle = '#e2d0ff'; ctx.fillText(l2, 0, -18);
      }
      ctx.restore();
    }
    if (G.Rift.inArena) {
      ctx.textAlign = 'center';
      ctx.font = F(800, 12 * k);
      ctx.fillStyle = '#d9c2ff';
      ctx.fillText('GRIETA · ' + G.U.mmss(G.Rift.timeLeft), w / 2, tall ? lay.below + 14 * k : bossB ? bossB + 12 * k : infoY + 18 * k);
    }

    // Eventos: cuenta atrás, flecha al Pokémon perdido / a la marca y a los duendes.
    // La cuenta atrás va en y = 112 (events.js): si las barras de los jefes llegan ahí, se baja.
    // (En vertical, debajo de todo lo de arriba.)
    const evDy = tall ? lay.below + 14 * k - 112 : G.Events.current && G.Events.current !== 'lost' ? Math.max(0, bossB - 98) : 0;
    G.Events.drawHud(ctx, w, h, pl, F, evDy);   // sólo baja la cuenta atrás, no las flechas del borde

    // Aviso propio al abrirse una grieta (no lo tapan los otros avisos).
    let popB = 0;                    // dónde acaba (en vertical, el aviso grande va debajo)
    if (rift && rift.t < 4.5) {
      const a = Math.min(1, rift.t * 4, (4.5 - rift.t) * 2), pop = 1 + Math.max(0, 0.25 - rift.t) * 1.6;
      const y0 = tall ? Math.max(h * 0.2, lay.below + 50) : h * 0.2;
      popB = y0 + 26;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w / 2, y0); ctx.scale(pop, pop);
      ctx.font = F(800, 20);
      const t1 = '¡SE HA ABIERTO UNA GRIETA!', t2 = 'Sigue la flecha morada: dentro te espera un legendario';
      const bw = Math.min(w - 24, Math.max(ctx.measureText(t1).width, (ctx.font = F(700, 11), ctx.measureText(t2).width)) + 36);
      roundRect(ctx, -bw / 2, -26, bw, 52, 10);
      ctx.fillStyle = 'rgba(26,11,51,.88)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#b48aff'; ctx.stroke();
      ctx.textAlign = 'center';
      // (Si la caja no da para más, el texto se estrecha en vez de salirse.)
      ctx.font = F(800, 20); ctx.fillStyle = '#e2d0ff'; ctx.fillText(t1, 0, -2, bw - 16);
      ctx.font = F(700, 11); ctx.fillStyle = '#c9b0ff'; ctx.fillText(t2, 0, 16, bw - 16);
      ctx.restore();
    }

    const ban = G.Spawner.banner();
    if (ban) {
      const a = Math.min(1, ban.t * 1.6);
      ctx.save();
      ctx.globalAlpha = a;
      // Siempre centrado (antes heredaba la alineación de lo último dibujado, p.
      // ej. la flecha de un duende del tesoro, y salía descolocado).
      ctx.textAlign = 'center';
      // Que quepa a lo ancho (móvil de pie, frases largas): la letra baja hasta 16 px
      // y, si ni así, va en varias líneas. En vertical, debajo de lo de arriba y
      // del aviso de la grieta.
      const mw = w - 24 - sa.left - sa.right, by = tall ? Math.max(h * 0.3, lay.below + 14 * k + 22, popB + 26) : h * 0.3;
      fitFont(ctx, ban.text, 800, 22, mw, 16);
      ctx.fillStyle = '#ffcb3d';
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
      if (ctx.measureText(ban.text).width <= mw) {
        ctx.strokeText(ban.text, w / 2, by, mw);
        ctx.fillText(ban.text, w / 2, by, mw);
      } else {
        if (banSrc !== ban.text || banMw !== mw) { banSrc = ban.text; banMw = mw; banLines = wrap(ctx, G.T(ban.text), mw); }
        for (let i = 0; i < banLines.length; i++) {
          G.I18n.rawCanvas(ctx, 'strokeText', banLines[i], w / 2, by + i * 20, mw);
          G.I18n.rawCanvas(ctx, 'fillText', banLines[i], w / 2, by + i * 20, mw);
        }
      }
      ctx.restore();
    }

    // ---------- ranura de movimientos (dónde va: más arriba) ----------
    ctx.save();
    ctx.scale(kb, kb);
    const BOND = '#ff8ad8';
    const cdOf = m => m.kind === 'orbit' ? 0 : G.U.clamp(m.t / (m.cd * pl.cdMul), 0, 1);
    // Toda la barra (también entre los huecos y en los vacíos) es zona de botones:
    // ahí no sale el joystick flotante. Los huecos, registrados después, mandan.
    G.Touch.addButton((sx - S - 18) * kb, (sy - 6) * kb, (S + 18 + nDraw * (S + GAP) - GAP) * kb, (S + 6) * kb, noop, 4);

    for (let i = 0; i < nDraw; i++) {
      const x = sx + i * (S + GAP);
      if (i >= n) {
        // Vertical: hueco aún vacío (los ataques nuevos los van llenando).
        roundRect(ctx, x, sy, S, S, 12);
        ctx.fillStyle = 'rgba(10,16,28,.45)'; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(140,170,210,.18)'; ctx.stroke();
        continue;
      }
      const g = pl.slots[i] || NONE;
      const m = g[0];
      const fused = g.length > 1;
      const on = i === pl.active;
      const y = on ? sy - 6 : sy;
      // Tocar (o hacer clic en) un icono activa ese movimiento.
      if (m) G.Touch.addButton(x * kb, y * kb, S * kb, S * kb, () => { if (G.Game.state === 'playing' && pl.active !== i) { pl.setActive(i); G.Audio.sfx('click'); } }, (GAP / 2 + 3) * kb);
      const col = m ? G.U.TYPE_COLOR[m.type] : '#4a5468';

      // Activo: halo de su color alrededor, para ver de un vistazo cuál dispara.
      if (on && m) {
        roundRect(ctx, x - 3, y - 3, S + 6, S + 6, 14);
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 4; ctx.strokeStyle = fused ? BOND : col;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // fondo
      roundRect(ctx, x, y, S, S, 12);
      ctx.fillStyle = on ? 'rgba(20,30,50,.95)' : 'rgba(10,16,28,.8)';
      ctx.fill();
      ctx.lineWidth = on ? 2.5 : fused || (m && m.evolved) ? 2 : 1.2;
      // Vínculo: borde rosa. Evolucionado: dorado.
      ctx.strokeStyle = fused ? BOND : m && m.evolved ? '#ffd23f' : on ? col : 'rgba(140,170,210,.22)';
      ctx.stroke();

      if (!m) continue;

      if (fused) {
        // Vínculo: los movimientos en una cuadrícula de 2×2, cada uno con su recarga.
        const C = 22, P = (S - C * 2) / 3;
        g.forEach((gm, k) => {
          const cx = x + P + (k % 2) * (C + P), cy = y + P + Math.floor(k / 2) * (C + P);
          G.Icons.draw(ctx, 'move:' + gm.id, cx, cy, C);
          const f = cdOf(gm);
          if (f > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx, cy, C, C * f); }
          if (gm.evolved) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, C - 1, C - 1); }
          // Destello al lanzarse.
          const fl = 1 - (performance.now() - (gm.castAt || 0)) / 180;
          if (fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (fl * 0.55).toFixed(2) + ')'; ctx.fillRect(cx, cy, C, C); }
        });
      } else {
        // recarga: barrido de reloj (lo oscuro es lo que falta) y, si falta mucho, los segundos
        const cdFrac = cdOf(m);
        if (cdFrac > 0) {
          ctx.save();
          roundRect(ctx, x, y, S, S, 12); ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,.6)';
          ctx.beginPath();
          ctx.moveTo(x + S / 2, y + S / 2);
          ctx.arc(x + S / 2, y + S / 2, S, -Math.PI / 2 + (1 - cdFrac) * 6.2832, Math.PI * 1.5);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }

        // emblema del tipo + insignia de la familia
        G.Icons.draw(ctx, 'move:' + m.id, x + (S - 32) / 2, y + (S - 32) / 2 - 2, 32);

        if (cdFrac > 0 && m.t > 1.5) {
          const secs = String(Math.ceil(m.t));
          ctx.font = F(800, 15);
          ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
          ctx.strokeText(secs, x + S / 2, y + S / 2 + 4);
          ctx.fillStyle = '#fff';
          ctx.fillText(secs, x + S / 2, y + S / 2 + 4);
        }

        // nivel del movimiento (puntitos)
        const dots = m.def.maxLvl;
        const dw = 4, dgap = 2;
        const tw = dots * dw + (dots - 1) * dgap;
        for (let d = 0; d < dots; d++) {
          ctx.fillStyle = d < m.lvl ? col : 'rgba(255,255,255,.18)';
          ctx.fillRect(x + (S - tw) / 2 + d * (dw + dgap), y + S - 9, dw, 3);
        }
      }

      // tecla: en PC, la que tenga asignada, en una chapita en la esquina
      ctx.font = F(800, touch ? 9 : 10);
      if (touch) {
        ctx.fillStyle = fused ? BOND : on ? col : 'rgba(180,200,230,.6)';
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1), x + 3, y + 10);
      } else {
        const key = String((G.Input.keyLabel && G.Input.keyLabel('m' + (i + 1))) || i + 1);
        const kw = Math.min(S + 6, Math.max(14, ctx.measureText(key).width + 8));
        roundRect(ctx, x - 4, y - 4, kw, 15, 4);
        ctx.fillStyle = 'rgba(6,10,20,.85)'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = fused ? BOND : on ? col : 'rgba(180,200,230,.5)';
        ctx.stroke();
        ctx.fillStyle = fused ? BOND : on ? col : '#dfe8f7';
        ctx.textAlign = 'center';
        ctx.fillText(key, x - 4 + kw / 2, y + 7, kw - 6);
      }

      // nombre encima del activo (con un vínculo: "Ascuas +2")
      if (on) {
        const nm = fused ? G.T(m.name, 'move') + ' +' + (g.length - 1) : G.T(m.name, 'move');
        ctx.font = F(700, 11);
        ctx.textAlign = 'center';
        // (Sin salirse por los lados: con el móvil de pie, el del último hueco se cortaba.)
        const nw = ctx.measureText(nm).width / 2, nx = G.U.clamp(x + S / 2, nw + 4, Math.max(nw + 4, W - nw - 4));
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(nm, nx, y - 8);
        ctx.fillStyle = fused ? BOND : col;
        ctx.fillText(nm, nx, y - 8);
      }
    }

    // ---------- vínculo guardado (aún no hay dos movimientos sueltos) ----------
    if (pl.bonds > 0) {
      const bx = bondUp ? barEnd - bondW : barEnd + 12, by = bondUp ? sy - 62 : sy + S / 2 - 12;
      G.Icons.draw(ctx, 'bond', bx, by, 24);
      if (pl.bonds > 1) {
        ctx.font = F(800, 10);
        ctx.textAlign = 'left';
        ctx.fillStyle = BOND;
        ctx.fillText('×' + pl.bonds, bx + 25, by + 20);
      }
    }

    // ---------- objeto equipado (a la izquierda de los movimientos) ----------
    {
      const ix = sx - S - 18, iy = sy;
      roundRect(ctx, ix, iy, S, S, 12);
      ctx.fillStyle = pl.item ? 'rgba(40,30,10,.9)' : 'rgba(10,16,28,.55)';
      ctx.fill();
      ctx.lineWidth = pl.item ? 2 : 1;
      ctx.strokeStyle = pl.item ? '#ffd23f' : 'rgba(140,170,210,.18)';
      ctx.stroke();
      if (pl.item) {
        const it = G.Items.BY[pl.item];
        G.Icons.draw(ctx, pl.item, ix + (S - 36) / 2, iy + (S - 36) / 2, 36);
        ctx.font = F(700, 9);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(it.name, ix + S / 2, iy - 6);
        // Qué hace: al pasar el ratón por encima o 3 s al tocarlo (o hacer clic).
        G.Touch.addButton(ix * kb, iy * kb, S * kb, S * kb, () => { tipUntil = performance.now() + 3000; }, 4);
        const ms = G.Input.mouse();
        const hover = !touch && G.Game.state === 'playing' &&
          ms.x >= ix * kb && ms.x <= (ix + S) * kb && ms.y >= iy * kb && ms.y <= (iy + S) * kb;
        if (hover || now < tipUntil) itemTip(ctx, it, ix, iy, S, W, hover ? 1 : Math.min(1, (tipUntil - now) / 300));
      }
    }
    ctx.restore();

    // ---------- botón de pausa (táctil) ----------
    if (touch) {
      // (De serie arriba a la derecha; en vertical, justo debajo de la barra de estado.)
      const pp = G.Touch.spot('pause', w, h);
      const bx = pp ? G.U.clamp(pp[0] * w - 20, 4, w - 44) : w - 52 - (tall ? sa.right : Math.min(44, sa.right));
      const by = pp ? G.U.clamp(pp[1] * h - 20, Math.max(10, sa.top + 4), h - 44) : tall ? py : 12 + Math.min(20, sa.top), bs = 40;
      roundRect(ctx, bx, by, bs, bs, 10);
      ctx.fillStyle = 'rgba(10,16,28,.7)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,255,.8)'; ctx.stroke();
      ctx.fillStyle = '#f4f8ff';
      ctx.fillRect(bx + 13, by + 11, 5, 18); ctx.fillRect(bx + 22, by + 11, 5, 18);
      G.Touch.addButton(bx, by, bs, bs, () => G.Game.togglePause(), 8);
    }

    // pista de controles
    if (st.time < 14) {
      ctx.font = F(600, tall ? 11 : 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180,200,230,.55)';
      const hint = touch ? 'Arrastra el dedo para moverte  ·  toca un ataque para cambiarlo' : G.Input.hint();
      // (En vertical, encima de la barra de inicio del iPhone y estrechada si no cabe.)
      if (tall) ctx.fillText(hint, w / 2, h - 4 - (touch ? Math.min(28, sa.bottom) : 0), w - 16);
      else ctx.fillText(hint, w / 2, h - 4);
    }

    ctx.restore();
  }

  // ---------------- cooperativo ----------------

  /**
   * - Vida de cada compañero debajo de la tuya.
   * - Flecha en el borde de la pantalla hacia los que no se ven, con su nombre
   *   y a cuántos metros están (roja y parpadeando si está caído).
   * - Si has caído tú: aviso y barra de "te están levantando".
   */
  function drawCoop(ctx, w, h, pl, px, top, k = 1) {
    const cam = G.Camera;
    const t = performance.now() / 1000;
    // La lista crece con el HUD, como tu tarjeta.
    ctx.save();
    ctx.translate(px, top); ctx.scale(k, k);
    let y = 0;
    ctx.textAlign = 'left';
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      ctx.font = F(800, 10);
      ctx.fillStyle = m.color;
      G.I18n.rawCanvas(ctx, 'fillText', m.name, 0, y + 9);
      const lx = 78, f = o.dead ? 0 : G.U.clamp(o.hp / o.maxHp, 0, 1);
      bar(ctx, lx, y + 1, 110, 8, f, o.dead ? '#ff5f6d' : hpColor(f));
      if (o.dead) {
        ctx.font = F(800, 9);
        ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff8a96' : '#ffd0d5';
        ctx.fillText('CAÍDO', lx + 116, y + 9);
      }
      y += 15;
    }
    ctx.restore();

    // Flechas hacia los compañeros fuera de la vista.
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      const sx = (o.x - cam.left()) * cam.scale, sy = (o.y - o.bodyH * 0.5 - cam.top()) * cam.scale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 42;
      const ex = edgeX(sx, M, w), ey = edgeY(sy, M + 70, h - M - 80);
      const a = Math.atan2(sy - ey, sx - ex);
      const metres = Math.round(G.U.dist(pl.x, pl.y, o.x, o.y) / 32);
      const col = o.dead ? (Math.sin(t * 8) > 0 ? '#ff5f6d' : '#ffd0d5') : m.color;
      ctx.save();
      ctx.translate(ex, ey);
      // Flecha
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, 6.2832); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.lineTo(Math.cos(a + 2.4) * 14, Math.sin(a + 2.4) * 14);
      ctx.lineTo(Math.cos(a - 2.4) * 14, Math.sin(a - 2.4) * 14);
      ctx.closePath(); ctx.fill();
      // Inicial del compañero dentro del círculo
      ctx.font = F(800, 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      G.I18n.rawCanvas(ctx, 'fillText', m.name.charAt(0).toUpperCase(), 0, 5);
      // Nombre y distancia: al lado contrario de la flecha, para que no se salga
      const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 26 + 4;
      ctx.font = F(800, 12);
      const label = o.dead ? G.I18n.f('¡{x} necesita ayuda! · {x} m', m.name, metres) : m.name + ' · ' + metres + ' m';
      ctx.textAlign = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      G.I18n.rawCanvas(ctx, 'strokeText', label, lx, ly);
      ctx.fillStyle = col;
      G.I18n.rawCanvas(ctx, 'fillText', label, lx, ly);
      ctx.restore();
    }

    // Tú, caído.
    if (pl.dead) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const msg = G.Coop.players().every(p => p.dead) ? 'Habéis caído todos…' : 'Has caído: un compañero puede levantarte';
      // (En el móvil de pie no cabía: la letra baja lo que haga falta.)
      const mw = w - 24 - lay.l - lay.r;
      fitFont(ctx, msg, 800, 20, mw, 13);
      ctx.strokeText(msg, w / 2, h * 0.62, mw);
      ctx.fillStyle = '#ffb0b8';
      ctx.fillText(msg, w / 2, h * 0.62, mw);
      const f = (pl.reviveT || 0) / G.Player.REVIVE_TIME;
      if (f > 0) bar(ctx, w / 2 - 110, h * 0.62 + 12, 220, 10, f, '#5fe08a');
      // Mirar a un compañero vivo mientras tanto (botón, Q / E o LB / RB).
      const w0 = G.Game.watching;
      if (w0 || G.Coop.puppets().some(p => !p.dead)) {
        const m = w0 && G.Coop.mates.find(x => x.pl === w0);
        const label = (m ? G.I18n.f('Viendo a {x}', m.name) + ' · ' + G.I18n.t('cambiar') : G.I18n.t('Ver a un compañero'))
          + (G.Touch.active ? '' : '  (' + G.T(G.Input.keyLabel('next')) + ')');
        // (Ya va traducido: se mide tal cual, y si no cabe, la letra baja hasta 11 px.)
        fitFont(ctx, label, 800, 13, mw - 28, 11, true);
        const bw = Math.min(mw, G.I18n.rawCanvas(ctx, 'measureText', label).width + 28), bh = 28, bx = w / 2 - bw / 2, by = h * 0.62 + 32;
        roundRect(ctx, bx, by, bw, bh, 8);
        ctx.fillStyle = 'rgba(10,16,28,.75)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = m ? m.color : 'rgba(244,248,255,.8)'; ctx.stroke();
        ctx.fillStyle = '#f4f8ff';
        G.I18n.rawCanvas(ctx, 'fillText', label, w / 2, by + 19, bw - 20);
        G.Touch.addButton(bx, by, bw, bh, () => G.Game.cycleWatch(1), 8);
      }
      ctx.restore();
    }
  }

  /**
   * Dónde van de serie (sin colocarlos el jugador) la barra de ataques, por el
   * centro del bloque objeto + 4 huecos, y la pausa, por su centro; en px de
   * pantalla. Para «Colocar los botones» (layout-ui.js): lo mismo que hace draw.
   */
  function padDefault(k, w, h) {
    const sa = G.Touch.safeArea(), tall = h > w;
    if (k === 'bar') return [tall ? w / 2 : w / 2 - 36, h - 54 / 2 - 18 - Math.min(28, sa.bottom)];
    return tall ? [w - 32 - sa.right, 34 + sa.top] : [w - 32 - Math.min(44, sa.right), 32 + Math.min(20, sa.top)];
  }

  return { draw, roundRect, bar, hpColor, scale: scaleFor, lay, edgeX, edgeY, fit: fitFont, padDefault };
})();
