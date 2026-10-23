/* ============ hud.js — interfaz dentro del canvas ============
 * Se dibuja en coordenadas de PANTALLA (sin la transformación de cámara).
 *
 * En vertical (móvil de pie) va en filas: tarjeta a la izquierda y pausa y
 * reloj a la derecha; debajo, la línea del bioma, el clima, los compañeros y
 * las barras de los jefes; los ataques abajo, en su sitio de siempre.
 * En el móvil (de pie y tumbado) todo va en su versión pequeña (ver hudK y
 * PADS_S): tarjeta, reloj, jefes, avisos, flechas, ataques y pausa.
 * Con un Cristal Z de su tipo, el botón Z va a la derecha de los ataques (drawZ).
 *
 * Estilo (lavado de imagen): paneles azul noche translúcidos con borde claro
 * de 1 px, esquinas redondeadas y sombra suave; letra Fredoka (números,
 * nombres, avisos) y Nunito (etiquetas pequeñas), nunca menos de 11 px.
 * El mundo sigue en pixel art; la interfaz, no.
 */
G.HUD = (() => {
  // Letras: las cadenas se guardan (no se crea una nueva en cada fotograma).
  const fonts = new Map();
  function font(fam, w, s) {
    const key = fam * 1e7 + w * 1e4 + Math.round(s * 10);
    let f = fonts.get(key);
    if (f === undefined) {
      if (fonts.size > 400) fonts.clear();
      f = w + ' ' + Math.round(s * 10) / 10 + 'px ' + (fam === 1 ? 'Fredoka' : 'Nunito') + ',"Segoe UI",system-ui,sans-serif';
      fonts.set(key, f);
    }
    return f;
  }
  /** Fredoka (pesos 600–700): números, nombres, títulos y avisos. */
  const F = (w, s) => font(1, w, s);
  /** Nunito (pesos 700–900): etiquetas pequeñas. */
  const N = (w, s) => font(2, w, s);
  const noop = () => {};
  const NONE = [];                   // hueco sin movimiento (sin crear una lista en cada fotograma)

  // Colores de la interfaz (los de la marca).
  const C = {
    panel: 'rgba(11,21,48,.8)', panel2: 'rgba(20,34,74,.9)', edge: 'rgba(255,255,255,.16)', shadow: 'rgba(0,0,0,.24)',
    track: 'rgba(3,8,22,.62)', gloss: 'rgba(255,255,255,.28)', line: 'rgba(6,12,30,.82)',
    ink: '#F4F7FF', ink2: '#AFC0E6', yellow: '#FFCB05', yellowInk: '#1B1F3B', red: '#EE3B3B', green: '#55E07F'
  };
  const BOND = '#FF8AD8';
  const BUFF_COL = { atk: '#FF7A5C', patk: '#FF7A5C', satk: '#C98BFF', spd: '#7FE0FF', def: '#C3CCDB', regen: '#55E07F' };
  const BUFF_LBL = { atk: 'ATK', patk: 'ATK', satk: 'AT.E', spd: 'VEL', def: 'DEF', regen: 'REG' };

  /**
   * Lo que deja libre el HUD en este fotograma, para las flechas del borde y las
   * cuentas atrás (también events.js y judgment.js). tall: en vertical; below:
   * dónde acaba lo de arriba (con los jefes); lo / hi: franja de alto para las
   * flechas en vertical; l / r: márgenes de los lados (la muesca del iPhone);
   * cardR / cardB: borde derecho y de abajo de la tarjeta.
   */
  const lay = { tall: false, below: 0, lo: 0, hi: 0, l: 0, r: 0, cardR: 0, cardB: 0 };
  /** Alto de una flecha del borde: en vertical, sin pisar lo de arriba ni la barra de ataques. */
  function edgeY(sy, lo, hi) { return lay.tall ? G.U.clamp(sy, Math.max(lo, lay.lo), Math.min(hi, lay.hi)) : G.U.clamp(sy, lo, hi); }
  /** Ancho de una flecha del borde: lejos de la muesca. */
  function edgeX(sx, M, w) { return G.U.clamp(sx, M + lay.l, w - M - lay.r); }
  /** Centro de algo de ancho pw arriba en medio: en horizontal, sin pisar la tarjeta. */
  function midX(w, pw, top) {
    if (lay.tall || top > lay.cardB + 2) return w / 2;
    return Math.min(Math.max(w / 2, lay.cardR + 10 + pw / 2), w - 8 - lay.r - pw / 2);
  }

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
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Panel de la interfaz: azul noche translúcido, borde claro y sombra suave
   * (un rectángulo oscuro un poco más abajo: el desenfoque cuesta en el móvil).
   * px: un píxel de pantalla en estas coordenadas (1 / escala); ew: grosor del borde.
   */
  function panel(ctx, x, y, w, h, r, px = 1, fill = C.panel, edge = C.edge, ew = px) {
    roundRect(ctx, x, y + 2 * px, w, h, r); ctx.fillStyle = C.shadow; ctx.fill();
    roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    if (edge) { ctx.lineWidth = ew; ctx.strokeStyle = edge; ctx.stroke(); }
  }

  /** Barra redondeada (también el relleno) con un brillo arriba. */
  function bar(ctx, x, y, w, h, frac, col, bg = C.track) {
    const r = h / 2;
    roundRect(ctx, x, y, w, h, r); ctx.fillStyle = bg; ctx.fill();
    const f = frac > 0 ? Math.min(1, frac) : 0;
    if (f > 0) {
      const fw = Math.max(Math.min(h * 0.6, w), w * f), rr = Math.min(r, fw / 2);
      roundRect(ctx, x, y, fw, h, rr); ctx.fillStyle = col; ctx.fill();
      if (h >= 6 && fw - rr > 3) {
        roundRect(ctx, x + rr * 0.6, y + h * 0.14, fw - rr * 1.2, h * 0.3, h * 0.15);
        ctx.fillStyle = C.gloss; ctx.fill();
      }
    }
  }

  // Vida: de verde a amarillo y a rojo sin saltos (33 tonos hechos de antemano).
  const HP_COLS = (() => {
    const g = [85, 224, 127], y = [255, 203, 5], r = [238, 59, 59], out = [];
    const mix = (a, b, t) => 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
    for (let i = 0; i <= 32; i++) {
      const f = i / 32;
      out.push(f >= 0.6 ? mix(g, g, 0) : f >= 0.45 ? mix(y, g, (f - 0.45) / 0.15)
        : f >= 0.27 ? mix(y, y, 0) : f >= 0.15 ? mix(r, y, (f - 0.15) / 0.12) : mix(r, r, 0));
    }
    return out;
  })();
  /** Color de la vida: verde, amarillo por debajo de la mitad y rojo por debajo de un quinto. */
  const hpColor = f => HP_COLS[Math.round(Math.max(0, Math.min(1, f || 0)) * 32)];

  /** Texto con borde oscuro redondeado (se lee sobre el mapa). raw: ya traducido. */
  function outlined(ctx, s, x, y, col, lw = 3, maxW = 0, raw = false) {
    ctx.lineWidth = lw; ctx.strokeStyle = C.line;
    if (raw) {
      if (maxW) { G.I18n.rawCanvas(ctx, 'strokeText', s, x, y, maxW); ctx.fillStyle = col; G.I18n.rawCanvas(ctx, 'fillText', s, x, y, maxW); }
      else { G.I18n.rawCanvas(ctx, 'strokeText', s, x, y); ctx.fillStyle = col; G.I18n.rawCanvas(ctx, 'fillText', s, x, y); }
    } else if (maxW) { ctx.strokeText(s, x, y, maxW); ctx.fillStyle = col; ctx.fillText(s, x, y, maxW); }
    else { ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
  }

  /**
   * Chapa redonda con un texto, arriba en medio (cuentas atrás, grieta,
   * Sentencia): y es la línea base del texto; col, el color del borde y del
   * punto (el texto va en claro: se lee con cualquier tipo, también Siniestro).
   * En horizontal se aparta de la tarjeta. → ancho de la chapa.
   */
  function pill(ctx, s, w, y, col, size = 12) {
    // (En el móvil, más baja y con la letra a 11.)
    if (cmp) size = Math.max(11, size - 1);
    ctx.font = F(600, size);
    const tw = Math.min(ctx.measureText(s).width, w - 56), ph = size + (cmp ? 7 : 10), pw = tw + size * 1.7 + (cmp ? 8 : 12);
    const top = y - size * 0.35 - ph / 2, cx = midX(w, pw, top);
    panel(ctx, cx - pw / 2, top, pw, ph, ph / 2, 1, C.panel2, col, 1.5);
    ctx.beginPath(); ctx.arc(cx - pw / 2 + size * 0.85 + 3, top + ph / 2, size * 0.28, 0, 6.2832);
    ctx.fillStyle = col; ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.ink;
    ctx.fillText(s, cx + 6, y, w - 56);
    return pw;
  }

  /**
   * Flecha del borde hacia algo que no se ve: chapa redonda azul noche con el
   * borde de color y una punta hacia a. Se dibuja en (0, 0) (ya trasladado);
   * tipA: opacidad de la punta (late). Encima va el icono o la inicial.
   */
  function arrow(ctx, a, col, r = 15, tipA = 1) {
    const ca = Math.cos(a), sa = Math.sin(a), tip = cmp ? 10 : 13;
    if (cmp) r *= 0.8;               // (en el móvil, más pequeña: el icono de dentro sigue cabiendo)
    ctx.lineJoin = 'round';
    ctx.globalAlpha = tipA;
    ctx.beginPath();
    ctx.moveTo(ca * (r + tip), sa * (r + tip));
    ctx.lineTo(Math.cos(a + 0.8) * r, Math.sin(a + 0.8) * r);
    ctx.lineTo(Math.cos(a - 0.8) * r, Math.sin(a - 0.8) * r);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0, 2, r, 0, 6.2832); ctx.fillStyle = C.shadow; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fillStyle = C.panel2; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
  }

  /**
   * Tamaño de base (tableta y ordenador). Crece con la pantalla (en monitores
   * grandes se veía diminuto) y se multiplica por el ajuste «Tamaño del HUD»; en
   * pantallas pequeñas no pasa de lo que cabe. (También lo usan los números de
   * daño, fx.js: en el móvil se quedan como estaban.)
   */
  function scaleFor(w, h) {
    const base = G.Touch.active ? 1 : G.U.clamp(Math.min(w / 1280, h / 800), 1, 1.5);
    const cap = Math.max(1, Math.min(w / 560, h / 320));
    return Math.min(base * (+G.Settings.get('hudScale') || 1), cap);
  }

  /*
   * Móvil (23-10-2026): el HUD de siempre, pensado para pantallas de 560 px o
   * más, tapaba mucho el juego en un iPhone. En el móvil (como el modo compacto
   * de style.css: de pie con menos de 600 px de ancho, o tumbado con 520 de alto
   * o menos) va en su versión pequeña: tarjeta de 164 × 47 (antes 228 × 68),
   * reloj de 20 px, barras de jefes más finas, huecos de ataque de 44 px y la
   * pausa de 36 (lo que se toca sigue midiendo 40 o más), joystick de 46 de
   * radio (touch.js). La letra no baja de 11 px. El ajuste «Tamaño del HUD» la
   * agranda (×1,25 o ×1,5, lo que quepa). Tableta y ordenador, como antes.
   */
  const small = (w, h) => w < 600 || h <= 520;
  /** Tamaño de lo de arriba (tarjeta, reloj, jefes...): en el móvil, la versión pequeña × el ajuste. */
  function hudK(w, h) {
    if (!small(w, h)) return scaleFor(w, h);
    return Math.min(+G.Settings.get('hudScale') || 1, Math.max(1, Math.min(w / 300, h / 250)));
  }
  /*
   * Medidas de lo que se toca (también para «Colocar los botones», layout-ui.js):
   * S lado de un hueco de ataque, GAP entre huecos, IG entre el objeto y el
   * primero, BOT margen de abajo; la pausa: P lado de lo que se toca, PR radio
   * del círculo y PM margen del borde.
   */
  const PADS = { S: 54, GAP: 9, IG: 18, BOT: 18, P: 40, PR: 20, PM: 12 };
  const PADS_S = { S: 44, GAP: 7, IG: 12, BOT: 10, P: 40, PR: 18, PM: 8 };
  const pads = (w, h) => small(w, h) ? PADS_S : PADS;
  let cmp = false;                   // este fotograma, ¿HUD de móvil? (lo miran también pill y arrow)

  // Degradados guardados (crearlos en cada fotograma cuesta); se rehacen si cambia el tamaño.
  let xpTop = null, xpTopW = 0, xpCard = null, cardG = null, lowG = null, lowW = 0, lowH = 0, xpCardS = null, cardGS = null;
  const bosses = [];                 // jefes vivos (la lista se reutiliza)

  /** Poca vida: los bordes de la pantalla laten en rojo (lento y suave con «Menos destellos»). */
  function lowHp(ctx, w, h, f, calm, now) {
    if (!lowG || lowW !== w || lowH !== h) {
      lowG = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      lowG.addColorStop(0, 'rgba(238,59,59,0)');
      lowG.addColorStop(1, 'rgba(238,59,59,.8)');
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
  function itemTip(ctx, it, ix, iy, S, W, a, px) {
    ctx.save();
    ctx.globalAlpha = a;
    if (tipIt !== it) {
      // Se traduce y se parte en líneas una vez por objeto.
      tipIt = it; tipName = G.T(it.name);
      ctx.font = N(700, 12);
      tipLines = wrap(ctx, G.T(it.desc), 240);
      tipW = 0;
      for (const l of tipLines) tipW = Math.max(tipW, G.I18n.rawCanvas(ctx, 'measureText', l).width);
      ctx.font = F(600, 13);
      tipW = Math.max(tipW, G.I18n.rawCanvas(ctx, 'measureText', tipName).width);
    }
    const bw = tipW + 24, bh = 32 + tipLines.length * 15;
    const bx = G.U.clamp(ix, 6, Math.max(6, W - bw - 6));
    let by = iy - 20 - bh;
    if (by < 6) by = iy + S + 8;                     // barra arriba (móvil): debajo
    panel(ctx, bx, by, bw, bh, 12, px, 'rgba(11,21,48,.95)', 'rgba(255,203,5,.7)', 1.5 * px);
    ctx.textAlign = 'left';
    ctx.font = F(600, 13); ctx.fillStyle = C.yellow;
    G.I18n.rawCanvas(ctx, 'fillText', tipName, bx + 12, by + 20);
    ctx.font = N(700, 12); ctx.fillStyle = C.ink;
    for (let i = 0; i < tipLines.length; i++) G.I18n.rawCanvas(ctx, 'fillText', tipLines[i], bx + 12, by + 37 + i * 15);
    ctx.restore();
  }

  /** Tarjeta de siempre (tableta y ordenador), en sus coordenadas (ya escalada). */
  function cardBig(ctx, pl, hpF, xpF, CW, CH, u, calm, now) {
    const BX = 34, BW = 186;
    if (!cardG) {
      cardG = ctx.createLinearGradient(0, 0, 0, CH);
      cardG.addColorStop(0, 'rgba(26,44,92,.86)'); cardG.addColorStop(1, 'rgba(11,21,48,.86)');
    }
    panel(ctx, 0, 0, CW, CH, 16, u, cardG);

    // Nivel en una chapa amarilla («Nv.» va aparte para que se traduzca).
    ctx.textAlign = 'left';
    ctx.font = N(900, 11);
    const nvW = ctx.measureText('Nv.').width;
    ctx.font = F(700, 14);
    const lv = String(pl.level), lw = nvW + ctx.measureText(lv).width + 15;
    roundRect(ctx, 8, 8, lw, 20, 10);
    ctx.fillStyle = C.yellow; ctx.fill();
    ctx.fillStyle = C.yellowInk;
    ctx.fillText(lv, 17 + nvW, 23);
    ctx.font = N(900, 11);
    ctx.fillText('Nv.', 14, 22);
    ctx.font = F(600, 15);
    ctx.fillStyle = C.ink;
    ctx.fillText(pl.mon.name, 16 + lw, 23.5, CW - 26 - lw);

    // Vida: barra gruesa con los números dentro; el color baja de verde a rojo.
    ctx.font = N(900, 11);
    ctx.fillStyle = C.yellow;
    ctx.fillText('PS', 8, 46);
    bar(ctx, BX, 34, BW, 16, hpF, hpColor(hpF));
    if (hpF < 0.3 && !pl.dead) {
      roundRect(ctx, BX - 1, 33, BW + 2, 18, 9);
      ctx.lineWidth = 2;
      ctx.globalAlpha = calm ? 0.8 : 0.5 + 0.4 * Math.sin(now / 120);
      ctx.strokeStyle = C.red; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const hpTxt = Math.max(0, Math.ceil(pl.hp)) + ' / ' + Math.round(pl.maxHp);
    ctx.font = F(700, 12.5);
    ctx.textAlign = 'center';
    outlined(ctx, hpTxt, BX + BW / 2, 46.5, '#fff', 3);

    // Experiencia hasta el siguiente nivel, debajo de la vida.
    ctx.textAlign = 'left';
    ctx.font = N(900, 11);
    ctx.fillStyle = '#8FC8FF';
    ctx.fillText('EXP', 8, 63);
    if (!xpCard) {
      xpCard = ctx.createLinearGradient(BX, 0, BX + BW, 0);
      xpCard.addColorStop(0, '#4FA8FF'); xpCard.addColorStop(1, '#9B6BFF');
    }
    bar(ctx, BX, 56, BW, 6, xpF, xpCard);
  }

  /**
   * Tarjeta del móvil: más baja y estrecha. Arriba, el nivel y el nombre; debajo,
   * la vida con los números dentro y una raya con la experiencia (sin las
   * etiquetas PS / EXP: se entiende por los colores). Letra de 11 a 13 px.
   */
  function cardSmall(ctx, pl, hpF, xpF, CW, CH, u, calm, now) {
    if (!cardGS) {
      cardGS = ctx.createLinearGradient(0, 0, 0, CH);
      cardGS.addColorStop(0, 'rgba(26,44,92,.86)'); cardGS.addColorStop(1, 'rgba(11,21,48,.86)');
    }
    panel(ctx, 0, 0, CW, CH, 12, u, cardGS);
    ctx.textAlign = 'left';
    ctx.font = N(900, 11);
    const nvW = ctx.measureText('Nv.').width;
    ctx.font = F(700, 12.5);
    const lv = String(pl.level), lw = nvW + ctx.measureText(lv).width + 12;
    roundRect(ctx, 5, 5, lw, 16, 8);
    ctx.fillStyle = C.yellow; ctx.fill();
    ctx.fillStyle = C.yellowInk;
    ctx.fillText(lv, 12 + nvW, 17.5);
    ctx.font = N(900, 11);
    ctx.fillText('Nv.', 9.5, 17);
    ctx.font = F(600, 13);
    ctx.fillStyle = C.ink;
    ctx.fillText(pl.mon.name, 11 + lw, 17.5, CW - 16 - lw);

    const BX = 5, BW = CW - 10;
    bar(ctx, BX, 24, BW, 13, hpF, hpColor(hpF));
    if (hpF < 0.3 && !pl.dead) {
      roundRect(ctx, BX - 1, 23, BW + 2, 15, 7.5);
      ctx.lineWidth = 2;
      ctx.globalAlpha = calm ? 0.8 : 0.5 + 0.4 * Math.sin(now / 120);
      ctx.strokeStyle = C.red; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.font = F(700, 11);
    ctx.textAlign = 'center';
    outlined(ctx, Math.max(0, Math.ceil(pl.hp)) + ' / ' + Math.round(pl.maxHp), BX + BW / 2, 34.5, '#fff', 2.5);
    if (!xpCardS) {
      xpCardS = ctx.createLinearGradient(BX, 0, BX + BW, 0);
      xpCardS.addColorStop(0, '#4FA8FF'); xpCardS.addColorStop(1, '#9B6BFF');
    }
    bar(ctx, BX, 40, BW, 3, xpF, xpCardS);
    ctx.textAlign = 'left';
  }

  function draw(ctx, w, h, pl, st) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    G.Touch.clearButtons();
    const touch = G.Touch.active;
    const now = performance.now(), calm = G.Settings.get('calm');
    cmp = small(w, h);
    const k = hudK(w, h), D = cmp ? PADS_S : PADS;
    const hpF = G.U.clamp(pl.hp / pl.maxHp, 0, 1);
    const tall = h > w;                            // vertical (móvil de pie)
    const sa = G.Touch.safeArea();
    lay.tall = tall; lay.l = sa.left; lay.r = sa.right;
    const pp = touch ? G.Touch.spot('pause', w, h) : null;   // la pausa, si la ha movido el jugador

    if (hpF < 0.3 && !pl.dead && G.Settings.get('lowHpWarn') !== false) lowHp(ctx, w, h, hpF, calm, now);

    // ---------- barra de experiencia (borde superior) ----------
    // (En vertical, debajo de la barra de estado del iPhone.)
    const xpF = G.U.clamp(pl.xp / pl.xpNext, 0, 1), xy = tall ? sa.top : 0, xh = cmp ? 5 : 7;
    ctx.fillStyle = C.track;
    ctx.fillRect(0, xy, w, xh);
    if (!xpTop || xpTopW !== w) {
      xpTop = ctx.createLinearGradient(0, 0, w, 0);
      xpTop.addColorStop(0, '#4FA8FF'); xpTop.addColorStop(1, '#9B6BFF');
      xpTopW = w;
    }
    if (xpF > 0) {
      // (Empieza fuera de la pantalla: sólo se ve redondeada la punta.)
      roundRect(ctx, -4, xy, w * xpF + 4, xh, xh / 2);
      ctx.fillStyle = xpTop; ctx.fill();
      ctx.fillStyle = C.gloss;
      ctx.fillRect(0, xy + 1, Math.max(0, w * xpF - 4), cmp ? 1.5 : 2);
    }

    // ---------- tarjeta: nivel, nombre, vida y experiencia (crece con k) ----------
    const px = (cmp ? 10 : 16) + sa.left, py = (cmp ? 8 : 14) + sa.top;     // lejos de la muesca del iPhone
    const CW = cmp ? 164 : 228, CH = cmp ? 47 : 68, u = 1 / k;   // u: un píxel de pantalla
    ctx.save();
    ctx.translate(px, py); ctx.scale(k, k);
    if (cmp) cardSmall(ctx, pl, hpF, xpF, CW, CH, u, calm, now);
    else cardBig(ctx, pl, hpF, xpF, CW, CH, u, calm, now);

    // buffs activos (y el poder de altar), debajo de la tarjeta
    let bx = 0;
    const by = CH + (cmp ? 4 : 5);
    ctx.font = N(900, 11);
    for (const key in pl.buffs) {
      const b = pl.buffs[key];
      if (b.n <= 0) continue;
      const txt = BUFF_LBL[key] + ' ×' + b.n;
      const tw = ctx.measureText(txt).width + 14;
      panel(ctx, bx, by, tw, 16, 8, u);
      ctx.fillStyle = BUFF_COL[key];
      ctx.fillText(txt, bx + 7, by + 12);
      bx += tw + 5;
    }
    // Poder de altar activo.
    if (pl.power) {
      const pw = pl.power, txt = pw.def.name.toUpperCase() + ' ' + Math.ceil(pw.t) + 's';
      const tw = ctx.measureText(txt).width + 14;
      panel(ctx, bx, by, tw, 16, 8, u, C.panel2, pw.def.color);
      ctx.fillStyle = pw.def.color;
      ctx.fillText(txt, bx + 7, by + 12);
      bx += tw + 5;
    }
    ctx.restore();
    const cardR = px + CW * k, cardB = py + (bx > 0 ? by + 16 : CH) * k;
    lay.cardR = cardR; lay.cardB = cardB;

    // ---------- reloj / bioma / kills ----------
    // En vertical: el reloj a la derecha, debajo de la pausa, y la línea del
    // bioma de lado a lado, bajo la tarjeta (con sitio para los potenciadores).
    // Móvil: de pie, el reloj a la izquierda de la pausa (a su altura) y la línea
    // del bioma justo bajo la tarjeta; tumbado, como siempre pero más pequeño.
    const clockY = cmp ? (tall ? py + D.P / 2 + 7 * k : py + 18 * k) : tall ? py + (touch ? 44 : 0) + 19 * k : 16 + 26 * k;
    const infoY = cmp ? (tall ? cardB + 14 * k : clockY + 15 * k) : tall ? py + (CH + 33) * k : clockY + 17 * k;
    ctx.textAlign = tall ? 'right' : 'center';
    ctx.font = F(600, (cmp ? 20 : tall ? 24 : 26) * k);
    const clock = G.U.mmss(st.time);
    // (En horizontal, en medio; en un móvil estrecho con el HUD grande, a la derecha de la tarjeta.)
    const clockR = w - (cmp ? 10 : 12) - sa.right - (cmp && touch && !pp ? D.P + D.PM - 4 : 0);
    outlined(ctx, clock, tall ? clockR : Math.max(w / 2, cardR + 12 + ctx.measureText(clock).width / 2), clockY, '#fff', (cmp ? 4 : 4.5) * k);
    ctx.textAlign = 'center';
    ctx.font = N(800, 11 * k);
    const info = G.World.biomeName().toUpperCase() + '  ·  ' + pl.kills + ' DERROTADOS  ·  ' + pl.coins + ' MONEDAS';
    if (tall) {
      // (Si no cabe, se estrecha un poco: la letra no baja de 11 px.)
      outlined(ctx, info, w / 2, infoY, C.ink2, 3, w - 24 - sa.left - sa.right);
    } else {
      // En pantallas estrechas se aparta de la tarjeta en vez de pisarla (y de la pausa).
      const room = w - 12 - sa.right - (touch ? 44 : 0) - cardR - 10;
      const tw = Math.min(ctx.measureText(info).width, room);
      outlined(ctx, info, Math.max(w / 2, cardR + 10 + tw / 2), infoY, C.ink2, 3, Math.max(60, room));
    }
    let ty = infoY + 9 * k;          // vertical: dónde sigue lo de arriba

    // ---------- clima (arriba a la derecha; en vertical, centrado bajo el bioma) ----------
    const wx = G.Weather.current;
    if (wx) {
      // (En el móvil, una chapa más baja: 22 px y el icono a 16.)
      const ch = cmp ? 22 : 26, ic = cmp ? 16 : 20;
      ctx.save();
      if (tall) ctx.translate(w / 2, ty - 2 * k);
      else ctx.translate(w - (cmp ? 10 : 16) - sa.right - (touch ? (cmp ? 52 : 56) : 0), py);
      ctx.scale(k, k);
      ctx.font = N(800, 11);
      ctx.textAlign = 'left';
      const txt = wx.name.toUpperCase() + ' · ' + Math.ceil(wx.left) + 's';
      const tw = ctx.measureText(txt).width + ic + 22, x0 = tall ? -tw / 2 : -tw;
      panel(ctx, x0, 0, tw, ch, ch / 2, 1 / k);
      G.Icons.draw(ctx, wx.icon, x0 + (cmp ? 5 : 6), (ch - ic) / 2, ic);
      ctx.fillStyle = wx.color;
      ctx.fillText(txt, x0 + ic + 11, ch / 2 + 4);
      ctx.restore();
      if (tall) ty += (ch + 4) * k;
    }

    // Sitio para la lista de compañeros (se pinta en drawCoop).
    const coopTop = tall ? ty : cardB + 6 * k;
    if (G.Coop.active) {
      let mates = 0;
      for (const m of G.Coop.mates) if (m.connected) mates++;
      if (mates && tall) ty += (mates * 15 + 8) * k;      // (su panel y un respiro)
      // En horizontal va bajo la tarjeta: las chapas de arriba en medio (midX) tampoco la pisan.
      else if (mates) lay.cardB = coopTop + (mates * 15 + 6) * k;
    }

    // ---------- barras de los jefes (una por jefe vivo, apiladas) ----------
    bosses.length = 0;
    for (const e of G.EnemyMgr.all()) if (e.boss && !e.dead) bosses.push(e);
    let bossB = 0;                   // dónde acaban (lo de la grieta va debajo)
    if (bosses.length) {
      // (En el móvil, más finas y menos anchas: 13 px de alto y hasta 280.)
      const nb = Math.min(3, bosses.length), bh = (cmp ? 13 : 15) * k, left = cardR + 12, bmax = (cmp ? 280 : 420) * k;
      let bw = Math.min(bmax, w - 80), bx0 = (w - bw) / 2;
      // Vertical: de lado a lado (con sitio para el «+N»), debajo de todo lo de arriba.
      if (tall) { bw = Math.min(bmax, w - 64 - sa.left - sa.right); bx0 = (w - bw) / 2; }
      else if (bx0 < left) { bx0 = left; bw = Math.min(bw, w - 16 - sa.right - left); }
      let y = tall ? ty : infoY + (cmp ? 8 : 11) * k;
      ctx.textAlign = 'center';
      ctx.font = F(600, 11 * k);
      for (let i = 0; i < nb; i++) {
        const b = bosses[i], name = b.name.toUpperCase();
        roundRect(ctx, bx0, y + 2, bw, bh, bh / 2); ctx.fillStyle = C.shadow; ctx.fill();
        bar(ctx, bx0, y, bw, bh, b.hp / b.maxHp, C.red);
        roundRect(ctx, bx0, y, bw, bh, bh / 2);
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.stroke();
        // Nombre en claro con borde: se lee aunque la barra esté medio vacía.
        outlined(ctx, name, bx0 + bw / 2, y + bh / 2 + 3.9 * k, '#FFF6E0', (cmp ? 2.2 : 2.5) * k, bw - 12);
        y += bh + 3 * k;
      }
      if (bosses.length > nb) {
        ctx.textAlign = 'left';
        ctx.font = F(700, 12 * k);
        outlined(ctx, '+' + (bosses.length - nb), bx0 + bw + 6, y - 6 * k, C.yellow, 3);
      }
      bossB = y;
    }
    lay.below = bossB || ty;

    // ---------- dónde va la ranura de movimientos (se pinta más abajo) ----------
    // En PC crece con el HUD (kb); en móvil no, para que case con «Colocar los
    // botones» (layout-ui.js). Se dibuja en una pantalla de W×H y los botones
    // táctiles se registran en píxeles de verdad (× kb). En el móvil, huecos de
    // 44 px (antes 54; se siguen acertando con el dedo) y más juntos.
    const kb = touch ? 1 : k, W = w / kb, H = h / kb;
    const S = D.S, GAP = D.GAP, IG = D.IG;
    const n = Math.max(1, pl.slots.length), nAll = Math.max(n, pl.maxMoves);
    // Movimiento Z (24-10-2026): su botón, del tamaño de un hueco, a la derecha de los huecos
    // (separado como el objeto a la izquierda). Sólo con el Cristal Z de un tipo de tu compañero.
    const z = G.Combat.zOf(pl), ZW = z ? IG + S : 0;
    const totalW = n * S + (n - 1) * GAP;
    let sx = (W - totalW) / 2;
    // Por encima de la barra de inicio del iPhone (allí los toques a veces no llegan).
    let sy = H - S - D.BOT - (touch ? Math.min(28, sa.bottom) : 0);
    // En móvil, donde la haya puesto el jugador: el bloque objeto + todos los
    // huecos (aunque aún no estén llenos), por su centro, como en el editor
    // (layout-ui.js); los ataques nuevos van saliendo hacia la derecha.
    // En vertical, igual pero centrado abajo (y se ven los huecos vacíos).
    const pb = touch && G.Touch.spot('bar', w, h);
    if (pb || tall) {
      const bw = S + IG + nAll * S + (nAll - 1) * GAP + ZW;
      sx = G.U.clamp((pb ? pb[0] * W : W / 2) - bw / 2, 6, Math.max(6, W - bw - 6)) + S + IG;
      sy = G.U.clamp(pb ? pb[1] * H - S / 2 : sy, Math.max(24, sa.top + 6), H - S - 6);   // (no bajo la barra de estado)
    }
    // Vínculo guardado: a la derecha de los huecos o, en vertical si no cabe, encima del último.
    // (Medidas del móvil: el activo sube 5 px y su nombre va en una chapa de 16; el vínculo, a 20.)
    const RISE = cmp ? 5 : 6, NAME_H = cmp ? 16 : 18, BOND_S = cmp ? 20 : 24, BOND_UP = cmp ? 52 : 62;
    const nDraw = tall ? nAll : n, barEnd = sx + nDraw * (S + GAP) - GAP, bondW = pl.bonds > 1 ? BOND_S + 23 : BOND_S;   // (icono y «×N»)
    const zx = barEnd + IG, tailEnd = barEnd + ZW;   // (el botón Z y dónde acaba todo: el vínculo va detrás)
    const bondUp = tall && pl.bonds > 0 && tailEnd + 12 + bondW > W - 4;
    // Vertical: las flechas del borde, entre lo de arriba (y su cuenta atrás) y
    // la barra con el nombre del ataque (si está abajo).
    if (tall) {
      lay.lo = lay.below + 14 * k + (cmp ? 30 : 36);
      lay.hi = sy * kb > h / 2 ? (sy - (bondUp ? BOND_UP : RISE + NAME_H + 7)) * kb - (cmp ? 30 : 36) : h - 60 - sa.bottom;
    }

    // ---------- shinies fuera de pantalla: flecha en el borde ----------
    const cam = G.Camera, pulse = 0.6 + Math.sin(now / 160) * 0.4;
    for (const e of G.EnemyMgr.shinies()) {
      const sx = (e.x - cam.left()) * cam.scale, sy = (e.y - cam.top()) * cam.scale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 34;
      // (Por debajo de las barras de los jefes, como sus flechas.)
      const ex = edgeX(sx, M, w), ey = edgeY(sy, Math.max(M + 60, bossB + 30), h - M - 70);
      ctx.save();
      ctx.translate(ex, ey);
      arrow(ctx, Math.atan2(sy - ey, sx - ex), '#9AE6FF', 15, pulse);
      if (cmp) G.Icons.draw(ctx, 'shiny', -8, -8, 16); else G.Icons.draw(ctx, 'shiny', -10, -10, 20);
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
      arrow(ctx, a, C.yellow, 16, pulse);
      if (cmp) G.Icons.draw(ctx, 'crown', -8, -8, 16); else G.Icons.draw(ctx, 'crown', -10, -10, 20);
      const label = Math.round(G.U.dist(pl.x, pl.y, b.x, b.y) / 32) + ' m';
      ctx.font = F(600, 12);
      ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
      outlined(ctx, label, -ca * 28, -sn * 26 + 4, C.yellow, 3.5);
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
      const col = beat > 0.5 ? '#E2D0FF' : '#A57BFF';
      ctx.save();
      if (off) {
        const M = 52, ex = edgeX(sx, M, w), ey = edgeY(sy, M + 70, h - M - 80);
        const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sa = Math.sin(a);
        ctx.translate(ex, ey);
        // Halo que late.
        ctx.globalAlpha = 0.18 + beat * 0.22;
        ctx.fillStyle = '#B48AFF';
        ctx.beginPath(); ctx.arc(0, 0, (30 + beat * 8) * (cmp ? 0.8 : 1), 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        arrow(ctx, a, col, 18);
        // Dentro, un remolino: dos aros morados.
        ctx.beginPath(); ctx.arc(0, 0, cmp ? 6.5 : 8, 0, 6.2832); ctx.lineWidth = cmp ? 2.5 : 3; ctx.strokeStyle = '#A57BFF'; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, cmp ? 2.5 : 3, 0, 6.2832); ctx.fillStyle = '#E2D0FF'; ctx.fill();
        ctx.font = F(600, 12);
        ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        outlined(ctx, label, -ca * 34, -sa * 30 + 4, '#E2D0FF', 3.5);
      } else {
        // Encima de la grieta: flecha hacia abajo que bota.
        const by = sy - 46 - Math.abs(Math.sin(now * 4)) * 10;
        ctx.translate(sx, by);
        ctx.beginPath(); ctx.moveTo(-14, -11); ctx.lineTo(14, -11); ctx.lineTo(0, 8); ctx.closePath();
        ctx.lineWidth = 6; ctx.strokeStyle = C.line; ctx.stroke();
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
        ctx.font = F(600, 12); ctx.textAlign = 'center';
        outlined(ctx, 'GRIETA · ' + Math.ceil(rift.ttl) + ' s', 0, -19, '#E2D0FF', 3.5);
      }
      ctx.restore();
    }
    if (G.Rift.inArena) {
      pill(ctx, 'GRIETA · ' + G.U.mmss(G.Rift.timeLeft), w, tall ? lay.below + 14 * k : bossB ? bossB + 12 * k : infoY + 18 * k, '#D9C2FF', 12 * k);
    }

    // Eventos: cuenta atrás, flecha al Pokémon perdido / a la marca y a los duendes.
    // La cuenta atrás va en y = 112 (events.js): si las barras de los jefes llegan ahí, se baja.
    // (En vertical, debajo de todo lo de arriba. En el móvil tumbado, también: en 112 caía
    // justo sobre el aviso grande, que sale a la vez al empezar el evento.)
    const evDy = tall || cmp ? lay.below + 14 * k - 112 : G.Events.current && G.Events.current !== 'lost' ? Math.max(0, bossB - 98) : 0;
    G.Events.drawHud(ctx, w, h, pl, F, evDy);   // sólo baja la cuenta atrás, no las flechas del borde

    // Aviso propio al abrirse una grieta (no lo tapan los otros avisos).
    let popB = 0;                    // dónde acaba (en vertical, el aviso grande va debajo)
    if (rift && rift.t < 4.5) {
      const a = Math.min(1, rift.t * 4, (4.5 - rift.t) * 2), pop = 1 + Math.max(0, 0.25 - rift.t) * 1.6;
      // (En vertical, con un respiro bajo la chapa de la cuenta atrás, que acaba unos 9 px bajo su línea.)
      // (En el móvil, más pequeño: 16 y 11 px en una caja de 46 de alto.)
      const f1 = cmp ? 16 : 20, f2 = cmp ? 11 : 12, ph = cmp ? 46 : 56;
      const y0 = tall ? Math.max(h * 0.2, lay.below + 14 * k + (cmp ? 37 : 44)) : h * 0.2;
      popB = y0 + ph / 2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w / 2, y0); ctx.scale(pop, pop);
      ctx.font = F(700, f1);
      const t1 = '¡SE HA ABIERTO UNA GRIETA!', t2 = 'Sigue la flecha morada: dentro te espera un legendario';
      const bw = Math.min(w - 24, Math.max(ctx.measureText(t1).width, (ctx.font = N(700, f2), ctx.measureText(t2).width)) + (cmp ? 28 : 40));
      panel(ctx, -bw / 2, -ph / 2, bw, ph, cmp ? 14 : 18, 1, 'rgba(34,18,72,.92)', 'rgba(200,170,255,.6)', 1.5);
      ctx.textAlign = 'center';
      // (Si la caja no da para más, el texto se estrecha en vez de salirse.)
      ctx.font = F(700, f1); ctx.fillStyle = '#EFE4FF'; ctx.fillText(t1, 0, cmp ? -2 : -3, bw - 20);
      ctx.font = N(700, f2); ctx.fillStyle = '#CDB6FF'; ctx.fillText(t2, 0, cmp ? 13 : 16, bw - 20);
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
      // (En el móvil, de 17 px, hasta 13.)
      const mw = w - 24 - sa.left - sa.right, by = tall ? Math.max(h * 0.3, lay.below + 14 * k + 30, popB + 26) : h * 0.3;
      fitFont(ctx, ban.text, 700, cmp ? 17 : 22, mw, cmp ? 13 : 16);
      ctx.fillStyle = C.yellow;
      ctx.strokeStyle = C.line; ctx.lineWidth = cmp ? 4 : 5;
      if (ctx.measureText(ban.text).width <= mw) {
        ctx.strokeText(ban.text, w / 2, by, mw);
        ctx.fillText(ban.text, w / 2, by, mw);
      } else {
        if (banSrc !== ban.text || banMw !== mw) { banSrc = ban.text; banMw = mw; banLines = wrap(ctx, G.T(ban.text), mw); }
        const lh = cmp ? 17 : 21;
        for (let i = 0; i < banLines.length; i++) {
          G.I18n.rawCanvas(ctx, 'strokeText', banLines[i], w / 2, by + i * lh, mw);
          G.I18n.rawCanvas(ctx, 'fillText', banLines[i], w / 2, by + i * lh, mw);
        }
      }
      ctx.restore();
    }

    // ---------- ranura de movimientos (dónde va: más arriba) ----------
    ctx.save();
    ctx.scale(kb, kb);
    const ip = 1 / kb;               // un píxel de pantalla
    // La recarga real (G.Combat.cooldown cuenta los mínimos de cada familia: barridos, escudos...).
    const cdOf = m => m.kind === 'orbit' ? 0 : G.U.clamp(m.t / G.Combat.cooldown(pl, m), 0, 1);
    // Toda la barra (también entre los huecos y en los vacíos) es zona de botones:
    // ahí no sale el joystick flotante. Los huecos, registrados después, mandan.
    G.Touch.addButton((sx - S - IG) * kb, (sy - RISE) * kb, (S + IG + nDraw * (S + GAP) - GAP + ZW) * kb, (S + RISE) * kb, noop, 4);
    // (En el móvil: radio 12, icono a 28 y el halo del activo de 4 px.)
    const TR = cmp ? 12 : 14, ICO = cmp ? 28 : 32, HALO = cmp ? 4 : 5;

    for (let i = 0; i < nDraw; i++) {
      const x = sx + i * (S + GAP);
      if (i >= n) {
        // Vertical: hueco aún vacío (los ataques nuevos los van llenando).
        roundRect(ctx, x, sy, S, S, TR);
        ctx.fillStyle = 'rgba(11,21,48,.42)'; ctx.fill();
        ctx.lineWidth = ip; ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.stroke();
        continue;
      }
      const g = pl.slots[i] || NONE;
      const m = g[0];
      const fused = g.length > 1;
      const on = i === pl.active;
      const y = on ? sy - RISE : sy;
      // Tocar (o hacer clic en) un icono activa ese movimiento.
      if (m) G.Touch.addButton(x * kb, y * kb, S * kb, S * kb, () => { if (G.Game.state === 'playing' && pl.active !== i) { pl.setActive(i); G.Audio.sfx('click'); } }, (GAP / 2 + 3) * kb);
      const col = m ? G.U.TYPE_COLOR[m.type] : '#4a5468';

      // Activo: halo amarillo alrededor (rosa con un vínculo), para ver de un vistazo cuál dispara.
      if (on && m) {
        roundRect(ctx, x - HALO, y - HALO, S + HALO * 2, S + HALO * 2, TR + HALO);
        ctx.fillStyle = fused ? 'rgba(255,138,216,.26)' : 'rgba(255,203,5,.26)'; ctx.fill();
      }

      // Fondo: baldosa redondeada.
      panel(ctx, x, y, S, S, TR, ip, on ? C.panel2 : C.panel, null);
      roundRect(ctx, x, y, S, S, TR);
      ctx.lineWidth = on ? 2.5 : fused || (m && m.evolved) ? 2 : ip;
      // Activo: amarillo. Vínculo: rosa. Evolucionado: dorado claro.
      ctx.strokeStyle = fused ? BOND : on ? C.yellow : m && m.evolved ? '#FFD86B' : C.edge;
      ctx.stroke();

      if (!m) continue;

      if (fused) {
        // Vínculo: los movimientos en una cuadrícula de 2×2, cada uno con su recarga.
        const CC = cmp ? 18 : 22, P = (S - CC * 2) / 3;
        for (let j = 0; j < g.length; j++) {
          const gm = g[j];
          const cx = x + P + (j % 2) * (CC + P), cy = y + P + Math.floor(j / 2) * (CC + P);
          G.Icons.draw(ctx, 'move:' + gm.id, cx, cy, CC);
          const f = cdOf(gm);
          if (f > 0) { ctx.fillStyle = 'rgba(4,9,24,.6)'; ctx.fillRect(cx, cy, CC, CC * f); }
          if (gm.evolved) { ctx.strokeStyle = '#FFD86B'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, CC - 1, CC - 1); }
          // Destello al lanzarse.
          const fl = 1 - (now - (gm.castAt || 0)) / 180;
          if (fl > 0) { ctx.globalAlpha = fl * 0.55; ctx.fillStyle = '#fff'; ctx.fillRect(cx, cy, CC, CC); ctx.globalAlpha = 1; }
        }
      } else {
        // recarga: barrido de reloj (lo oscuro es lo que falta) y, si falta mucho, los segundos
        const cdFrac = cdOf(m);
        if (cdFrac > 0) {
          ctx.save();
          roundRect(ctx, x, y, S, S, TR); ctx.clip();
          ctx.fillStyle = 'rgba(4,9,24,.62)';
          ctx.beginPath();
          ctx.moveTo(x + S / 2, y + S / 2);
          ctx.arc(x + S / 2, y + S / 2, S, -Math.PI / 2 + (1 - cdFrac) * 6.2832, Math.PI * 1.5);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }

        // icono del movimiento
        G.Icons.draw(ctx, 'move:' + m.id, x + (S - ICO) / 2, y + (S - ICO) / 2 - (cmp ? 2 : 3), ICO);

        if (cdFrac > 0 && m.t > 1.5) {
          ctx.font = F(700, cmp ? 15 : 17);
          ctx.textAlign = 'center';
          outlined(ctx, String(Math.ceil(m.t)), x + S / 2, y + S / 2 + 4, '#fff', cmp ? 3 : 3.5);
        }

        // nivel del movimiento (rayitas redondeadas del color del tipo)
        const dots = m.def.maxLvl, dgap = cmp ? 2 : 2.5;
        const dw = Math.min(cmp ? 4 : 5, (S - (cmp ? 10 : 12) - (dots - 1) * dgap) / dots);
        const tw = dots * dw + (dots - 1) * dgap;
        for (let d = 0; d < dots; d++) {
          roundRect(ctx, x + (S - tw) / 2 + d * (dw + dgap), y + S - (cmp ? 7 : 8), dw, cmp ? 2.5 : 3, cmp ? 1.25 : 1.5);
          ctx.fillStyle = d < m.lvl ? col : 'rgba(255,255,255,.2)';
          ctx.fill();
        }
      }

      // tecla: en PC, la que tenga asignada, en una chapita en la esquina
      ctx.font = N(900, 11);
      if (touch) {
        ctx.fillStyle = fused ? BOND : on ? C.yellow : C.ink2;
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1), x + (cmp ? 4 : 5), y + (cmp ? 12 : 13));
      } else {
        const key = String((G.Input.keyLabel && G.Input.keyLabel('m' + (i + 1))) || i + 1);
        const kw = Math.min(S + 6, Math.max(16, ctx.measureText(key).width + 10));
        panel(ctx, x - 5, y - 5, kw, 16, 8, ip, on ? C.yellow : 'rgba(8,14,32,.94)', fused ? BOND : on ? null : 'rgba(255,255,255,.3)');
        ctx.fillStyle = on ? C.yellowInk : fused ? BOND : C.ink;
        ctx.textAlign = 'center';
        ctx.fillText(key, x - 5 + kw / 2, y + 7, kw - 6);
      }

      // nombre encima del activo, en una chapa (con un vínculo: "Ascuas +2")
      if (on) {
        const nm = fused ? G.T(m.name, 'move') + ' +' + (g.length - 1) : G.T(m.name, 'move');
        ctx.font = F(600, cmp ? 11 : 12);
        ctx.textAlign = 'center';
        // (Sin salirse por los lados: con el móvil de pie, el del último hueco se cortaba.
        // Con objeto, sin pisar su nombre: la chapa no pasa a la izquierda del primer hueco.)
        const pw = Math.min(ctx.measureText(nm).width, W - 26) + (cmp ? 14 : 18);
        const nx = G.U.clamp(Math.max(x + S / 2, pl.item ? sx - 2 + pw / 2 : 0), pw / 2 + 4, Math.max(pw / 2 + 4, W - pw / 2 - 4));
        // (Encima de la chapita de la tecla, sin taparla.)
        panel(ctx, nx - pw / 2, y - NAME_H - 5, pw, NAME_H, NAME_H / 2, ip, C.panel2, fused ? BOND : col, 1.5 * ip);
        ctx.fillStyle = C.ink;
        ctx.fillText(nm, nx, y - (cmp ? 9 : 9.8), W - 26);
      }
    }

    // ---------- movimiento Z: listo (late en su color), activo (cuenta atrás) o recargando ----------
    if (z) drawZ(ctx, pl, z, zx, sy, S, TR, HALO, ip, kb, touch, now);

    // ---------- vínculo guardado (aún no hay dos movimientos sueltos) ----------
    if (pl.bonds > 0) {
      const bx = bondUp ? tailEnd - bondW : tailEnd + (cmp ? 8 : 12), by = bondUp ? sy - BOND_UP : sy + S / 2 - BOND_S / 2;
      G.Icons.draw(ctx, 'bond', bx, by, BOND_S);
      if (pl.bonds > 1) {
        ctx.font = F(700, 12);
        ctx.textAlign = 'left';
        outlined(ctx, '×' + pl.bonds, bx + BOND_S + 1, by + BOND_S - 4, BOND, 3);
      }
    }

    // ---------- objeto equipado (a la izquierda de los movimientos) ----------
    {
      const ix = sx - S - IG, iy = sy, IS = cmp ? 30 : 36;
      panel(ctx, ix, iy, S, S, TR, ip, pl.item ? 'rgba(46,38,12,.9)' : 'rgba(11,21,48,.5)',
            pl.item ? 'rgba(255,203,5,.85)' : 'rgba(255,255,255,.1)', pl.item ? 1.5 : ip);
      if (pl.item) {
        const it = G.Items.BY[pl.item];
        G.Icons.draw(ctx, pl.item, ix + (S - IS) / 2, iy + (S - IS) / 2, IS);
        ctx.font = N(800, 11);
        ctx.textAlign = 'center';
        outlined(ctx, it.name, ix + S / 2, iy - (cmp ? 5 : 7), C.yellow, 3, S + (cmp ? 20 : 30));
        // Qué hace: al pasar el ratón por encima o 3 s al tocarlo (o hacer clic).
        G.Touch.addButton(ix * kb, iy * kb, S * kb, S * kb, () => { tipUntil = performance.now() + 3000; }, 4);
        const ms = G.Input.mouse();
        const hover = !touch && G.Game.state === 'playing' &&
          ms.x >= ix * kb && ms.x <= (ix + S) * kb && ms.y >= iy * kb && ms.y <= (iy + S) * kb;
        if (hover || now < tipUntil) itemTip(ctx, it, ix, iy, S, W, hover ? 1 : Math.min(1, (tipUntil - now) / 300), ip);
      }
    }
    ctx.restore();

    // ---------- botón de pausa (táctil): círculo azul noche con dos barras ----------
    if (touch) {
      // (De serie arriba a la derecha; en vertical, justo debajo de la barra de estado.
      // En el móvil, el círculo mide 36 y lo que se toca sigue siendo de 40 + 8 alrededor.)
      const bs = D.P, r = D.PR, h2 = cmp ? 14 : 16, bw2 = cmp ? 4 : 4.5;
      const bx = pp ? G.U.clamp(pp[0] * w - bs / 2, 4, w - bs - 4) : w - bs - D.PM - (tall ? sa.right : Math.min(44, sa.right));
      const by = pp ? G.U.clamp(pp[1] * h - bs / 2, Math.max(10, sa.top + 4), h - bs - 4) : tall ? py : (cmp ? 8 : 12) + Math.min(20, sa.top);
      const cx = bx + bs / 2, cy = by + bs / 2;
      ctx.beginPath(); ctx.arc(cx, cy + 2, r, 0, 6.2832); ctx.fillStyle = C.shadow; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fillStyle = 'rgba(11,21,48,.78)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.stroke();
      ctx.fillStyle = C.ink;
      roundRect(ctx, cx - 2 - bw2, cy - h2 / 2, bw2, h2, bw2 / 2); ctx.fill();
      roundRect(ctx, cx + 2, cy - h2 / 2, bw2, h2, bw2 / 2); ctx.fill();
      G.Touch.addButton(bx, by, bs, bs, () => G.Game.togglePause(), 8);
    }

    // pista de controles
    if (st.time < 14) {
      ctx.font = N(700, tall ? 12 : 11);
      ctx.textAlign = 'center';
      const hint = touch ? 'Arrastra el dedo para moverte  ·  toca un ataque para cambiarlo' : G.Input.hint();
      ctx.globalAlpha = 0.8;
      if (touch && cmp) {
        // Móvil (24-10-2026): bajo lo de arriba (abajo pisaba la barra de ataques, que ahora va
        // más baja). De pie, centrada; tumbado, a la derecha de la tarjeta, como la línea del bioma.
        const hy = lay.below + 14 * k;
        if (tall) outlined(ctx, hint, w / 2, hy, C.ink2, 3, w - 16);
        else {
          const room = w - 12 - sa.right - cardR - 10, tw = Math.min(ctx.measureText(hint).width, room);
          outlined(ctx, hint, Math.max(w / 2, cardR + 10 + tw / 2), hy, C.ink2, 3, Math.max(60, room));
        }
      } else {
        // (Encima de la barra de inicio del iPhone; en vertical, estrechada si no cabe.)
        const hy = h - 5 - (touch ? Math.min(28, sa.bottom) : 0);
        if (tall) outlined(ctx, hint, w / 2, hy, C.ink2, 3, w - 16);
        else outlined(ctx, hint, w / 2, hy, C.ink2, 3);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ---------------- movimiento Z (24-10-2026) ----------------

  /** «3:59» (recarga) o «45» (activo): lo que falta, sin crear cadenas nuevas si no cambia. */
  let zTxtV = -1, zTxt = '';
  function zLeft(s) {
    const v = Math.ceil(s);
    if (v !== zTxtV) { zTxtV = v; zTxt = v >= 60 ? G.U.mmss(v) : String(v); }
    return zTxt;
  }

  /**
   * El botón Z, como un hueco de ataque (coordenadas de la barra: × kb en pantalla):
   * el Cristal Z dentro y su color alrededor.
   *   listo      halo que late y borde de su color (tócalo o pulsa su tecla)
   *   activo     halo fijo, borde grueso y una barra abajo que se vacía con los segundos que le quedan
   *   recarga    barrido de reloj oscuro, como los ataques, y lo que falta (m:ss)
   * En PC lleva su tecla en la chapita de la esquina; en táctil, una «Z».
   */
  function drawZ(ctx, pl, z, x, y, S, TR, HALO, ip, kb, touch, now) {
    const col = G.U.TYPE_COLOR[z.type], act = z.t > 0, cdF = !act && z.cd > 0 ? G.U.clamp(z.cd / G.Moves.Z_CD, 0, 1) : 0, ready = !act && !cdF;
    const calm = G.Settings.get('calm');
    if (ready || act) {
      ctx.globalAlpha = act ? 0.42 : calm ? 0.28 : 0.2 + 0.16 * Math.sin(now / 200);
      roundRect(ctx, x - HALO, y - HALO, S + HALO * 2, S + HALO * 2, TR + HALO);
      ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = 1;
    }
    panel(ctx, x, y, S, S, TR, ip, act ? C.panel2 : C.panel, null);
    // (El cristal es ancho y bajo, 24 × 13: va más grande que el dibujo de un ataque.)
    const zi = S - 10;
    G.Icons.draw(ctx, 'z:' + z.type, x + 5, y + (S - zi) / 2 - (act ? 5 : cdF > 0 ? 7 : 3), zi);
    if (cdF > 0) {
      ctx.save();
      roundRect(ctx, x, y, S, S, TR); ctx.clip();
      ctx.fillStyle = 'rgba(4,9,24,.66)';
      ctx.beginPath();
      ctx.moveTo(x + S / 2, y + S / 2);
      ctx.arc(x + S / 2, y + S / 2, S, -Math.PI / 2 + (1 - cdF) * 6.2832, Math.PI * 1.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    roundRect(ctx, x, y, S, S, TR);
    ctx.lineWidth = act ? 3 : ready ? 2 : ip;
    ctx.strokeStyle = act || ready ? col : C.edge;
    ctx.stroke();
    // Lo que le queda: activo, abajo con su barra; recargando, en medio.
    ctx.textAlign = 'center';
    if (act) {
      bar(ctx, x + 6, y + S - (cmp ? 8 : 9), S - 12, cmp ? 4 : 5, z.t / G.Moves.Z_DUR, col);
      ctx.font = F(700, cmp ? 13 : 14);
      outlined(ctx, zLeft(z.t), x + S / 2, y + S - (cmp ? 12 : 13), '#fff', 3);
    } else if (cdF > 0) {
      ctx.font = F(700, cmp ? 13 : 15);
      outlined(ctx, zLeft(z.cd), x + S / 2, y + S / 2 + 5, '#fff', cmp ? 3 : 3.5);
    }
    // La «Z» (táctil) o su tecla (PC), en la esquina como los ataques.
    ctx.font = N(900, 11);
    if (touch) {
      ctx.textAlign = 'left';
      outlined(ctx, 'Z', x + (cmp ? 4 : 5), y + (cmp ? 12 : 13), ready ? C.yellow : act ? '#fff' : C.ink2, 2.5);
    } else {
      const key = String(G.Input.keyLabel('zmove'));
      const kw = Math.min(S + 6, Math.max(16, ctx.measureText(key).width + 10));
      panel(ctx, x - 5, y - 5, kw, 16, 8, ip, ready ? C.yellow : 'rgba(8,14,32,.94)', ready ? null : 'rgba(255,255,255,.3)');
      ctx.fillStyle = ready ? C.yellowInk : C.ink;
      ctx.textAlign = 'center';
      ctx.fillText(key, x - 5 + kw / 2, y + 7, kw - 6);
    }
    G.Touch.addButton(x * kb, y * kb, S * kb, S * kb, () => { if (G.Game.state === 'playing') G.Combat.zUse(pl); }, 4 * kb);
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
    // La lista crece con el HUD, como tu tarjeta (en un panel del mismo estilo).
    let rows = 0;
    for (const m of G.Coop.mates) if (m.connected) rows++;
    if (rows) {
      ctx.save();
      ctx.translate(px, top); ctx.scale(k, k);
      // (En el móvil, tan ancha como la tarjeta pequeña: 164.)
      const pw = cmp ? 164 : 228, nw = cmp ? 56 : 68, lx = cmp ? 66 : 82, lw = cmp ? 58 : 100;
      panel(ctx, 0, 0, pw, rows * 15 + 4, 9, 1 / k);
      let y = 2;
      ctx.textAlign = 'left';
      for (const m of G.Coop.mates) {
        if (!m.connected) continue;
        const o = m.pl;
        ctx.font = N(800, 11);
        ctx.fillStyle = m.color;
        G.I18n.rawCanvas(ctx, 'fillText', m.name, 8, y + 11, nw);
        const f = o.dead ? 0 : G.U.clamp(o.hp / o.maxHp, 0, 1);
        bar(ctx, lx, y + 3.5, lw, 8, f, o.dead ? C.red : hpColor(f));
        if (o.dead) {
          ctx.font = N(900, 11);
          ctx.fillStyle = Math.sin(t * 8) > 0 ? '#FF8A96' : '#FFD0D5';
          ctx.fillText('CAÍDO', lx + lw + 6, y + 11, pw - lx - lw - 10);
        }
        y += 15;
      }
      ctx.restore();
    }

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
      const col = o.dead ? (Math.sin(t * 8) > 0 ? '#FF5F6D' : '#FFD0D5') : m.color;
      ctx.save();
      ctx.translate(ex, ey);
      arrow(ctx, a, col, 17);
      // Inicial del compañero dentro del círculo
      ctx.font = F(700, 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      G.I18n.rawCanvas(ctx, 'fillText', m.name.charAt(0).toUpperCase(), 0, 5);
      // Nombre y distancia: al lado contrario de la flecha, para que no se salga
      const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 28 + 4;
      ctx.font = F(600, 12);
      const label = o.dead ? G.I18n.f('¡{x} necesita ayuda! · {x} m', m.name, metres) : m.name + ' · ' + metres + ' m';
      ctx.textAlign = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
      outlined(ctx, label, lx, ly, col, 3.5, 0, true);
      ctx.restore();
    }

    // Tú, caído.
    if (pl.dead) {
      ctx.save();
      ctx.textAlign = 'center';
      const msg = G.Coop.players().every(p => p.dead) ? 'Habéis caído todos…' : 'Has caído: un compañero puede levantarte';
      // (En el móvil de pie no cabía: la letra baja lo que haga falta.)
      const mw = w - 24 - lay.l - lay.r;
      fitFont(ctx, msg, 700, 20, mw, 13);
      outlined(ctx, msg, w / 2, h * 0.62, '#FFB0B8', 5, mw);
      const f = (pl.reviveT || 0) / G.Player.REVIVE_TIME;
      if (f > 0) bar(ctx, w / 2 - 110, h * 0.62 + 12, 220, 10, f, C.green);
      // Mirar a un compañero vivo mientras tanto (botón, Q / E o LB / RB).
      const w0 = G.Game.watching;
      if (w0 || G.Coop.puppets().some(p => !p.dead)) {
        const m = w0 && G.Coop.mates.find(x => x.pl === w0);
        const label = (m ? G.I18n.f('Viendo a {x}', m.name) + ' · ' + G.I18n.t('cambiar') : G.I18n.t('Ver a un compañero'))
          + (G.Touch.active ? '' : '  (' + G.T(G.Input.keyLabel('next')) + ')');
        // (Ya va traducido: se mide tal cual, y si no cabe, la letra baja hasta 11 px.)
        fitFont(ctx, label, 600, 13, mw - 32, 11, true);
        const bw = Math.min(mw, G.I18n.rawCanvas(ctx, 'measureText', label).width + 32), bh = 32, bx = w / 2 - bw / 2, by = h * 0.62 + 32;
        panel(ctx, bx, by, bw, bh, bh / 2, 1, C.panel2, m ? m.color : 'rgba(255,255,255,.5)', 1.5);
        ctx.fillStyle = C.ink;
        G.I18n.rawCanvas(ctx, 'fillText', label, w / 2, by + 20.5, bw - 22);
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
    const sa = G.Touch.safeArea(), tall = h > w, D = pads(w, h), top = small(w, h) ? 8 : tall ? 14 : 12;
    if (k === 'bar') return [tall ? w / 2 : w / 2 - (D.S + D.IG) / 2, h - D.S / 2 - D.BOT - Math.min(28, sa.bottom)];
    const x = w - D.P / 2 - D.PM;
    return tall ? [x - sa.right, top + D.P / 2 + sa.top] : [x - Math.min(44, sa.right), top + D.P / 2 + Math.min(20, sa.top)];
  }

  return { draw, roundRect, bar, hpColor, scale: scaleFor, lay, edgeX, edgeY, fit: fitFont, padDefault, pads,
           F, N, C, panel, pill, arrow, outlined, midX };
})();
