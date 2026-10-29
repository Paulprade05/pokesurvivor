/* ============ camera.js — vista y transformación mundo<->pantalla ============
 * El ancho visible del mundo es constante (VIEW_W) sea cual sea el tamaño de
 * ventana, así el juego se siente igual en cualquier pantalla.
 */
G.Camera = {
  x: 0, y: 0,
  scale: 1,
  VIEW_W: 768,              // un 20% más de vista que al principio (640)
  shake: 0,
  _sx: 0, _sy: 0,

  /** Recalcula la escala para el tamaño actual del canvas. */
  dpr: 1,

  // En pantallas más anchas que 16:9 (móviles en horizontal) se asegura
  // también un alto mínimo de mundo, para no ver una franja estrecha.
  MIN_VIEW_H: 420,

  resize(cssW, cssH, dpr = 1) {
    this.dpr = dpr;
    // Con el lado largo y el corto: en vertical (móvil de pie) se ve lo mismo
    // que en horizontal, girado, y los Pokémon salen del mismo tamaño.
    this.scale = Math.min(Math.max(cssW, cssH) / this.VIEW_W, Math.min(cssW, cssH) / this.MIN_VIEW_H);
    this.w = cssW / this.scale;
    this.h = cssH / this.scale;
  },

  follow(tx, ty, dt) {
    this.x = G.U.damp(this.x, tx, 9, dt);
    this.y = G.U.damp(this.y, ty, 9, dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.4);
      const a = this.shake * 7;
      this._sx = G.U.rand(-a, a);
      this._sy = G.U.rand(-a, a);
    } else { this._sx = this._sy = 0; }
  },

  kick(amount) {
    if (G.Settings.get('calm')) amount *= 0.25;      // "menos sacudidas"
    this.shake = Math.min(1.2, this.shake + amount);
  },

  /** Aplica la transformación de cámara al contexto. */
  apply(ctx) {
    // Redondea a píxeles físicos de pantalla: sin esto aparecen juntas de
    // 1 px entre chunks y los sprites "tiemblan" al moverse.
    const k = this.scale * this.dpr;
    ctx.translate(Math.round((-this.left() + this._sx) * k) / k,
                  Math.round((-this.top() + this._sy) * k) / k);
  },

  left() { return this.x - this.w / 2; },
  top() { return this.y - this.h / 2; },

  /*
   * ==== Ultra (2,5D como los juegos de DS): cámara inclinada con perspectiva ====
   * persp = K (0: sin perspectiva). La escala en pantalla depende de la altura en
   * la pantalla: s = 1 + a·Y (Y desde el centro, en unidades de mundo; a = K / (h/2)).
   * Arriba (lejos) todo es un K más pequeño y abajo (cerca), un K más grande; en el
   * centro (tu Pokémon) no cambia. Es una homografía del suelo:
   *   q = 1 − a·dv,  X = du / q,  Y = dv / q   (du, dv: del centro de la cámara al punto)
   * game.js dibuja el mundo así (D3); toScreen / toWorld son la misma cuenta para
   * la puntería, los toques y las marcas de pantalla. Con persp = 0, lo de siempre.
   */
  persp: 0,
  _pa() { return this.persp ? this.persp / (this.h / 2) : 0; },
  /** Escala en pantalla de lo que tiene los pies en y (1 sin perspectiva). */
  scaleAt(y) { const a = this._pa(); return a ? 1 / (1 - a * (y - this.y)) : 1; },
  /** Mundo → pantalla (px CSS). */
  toScreen(x, y) {
    let du = x - this.x, dv = y - this.y;
    const a = this._pa();
    // (Muy por debajo de la vista q llegaría a 0 o menos y la flecha saldría al revés:
    // con el tope sigue lejos y por abajo, que es lo que importa.)
    if (a) { const q = Math.max(0.08, 1 - a * dv); du /= q; dv /= q; }
    return { x: (du + this.w / 2 + this._sx) * this.scale, y: (dv + this.h / 2 + this._sy) * this.scale };
  },
  /** Pantalla (px CSS) → mundo (el punto del suelo que se ve ahí). */
  toWorld(sx, sy) {
    let X = sx / this.scale - this.w / 2 - this._sx, Y = sy / this.scale - this.h / 2 - this._sy;
    const a = this._pa();
    if (a) { const dv = Y / (1 + a * Y); X *= 1 - a * dv; Y = dv; }
    return { x: this.x + X, y: this.y + Y };
  },
  /** Lo que se ve de más por los lados y por arriba con la perspectiva (unidades de mundo). */
  _ext() {
    const K = this.persp;
    if (!K) return null;
    const f = K / (1 - K);
    return { x: this.w / 2 * f, top: this.h / 2 * f };
  },

  /**
   * Rectángulo del mundo que cubre todo lo que se ve (con margen): con Ultra, más
   * ancho y más alto por arriba. Para lo que tapa la vista entera (velos, oscuridad,
   * viento): con cam.left/top y w/h, en Ultra quedaban sin cubrir las esquinas de arriba.
   */
  viewRect(pad = 0) {
    const e = this.persp ? this._ext() : null;
    const ex = (e ? e.x : 0) + pad, et = (e ? e.top : 0) + pad;
    return { x: this.left() - ex, y: this.top() - et, w: this.w + ex * 2, h: this.h + et + pad };
  },

  /** ¿Está el punto dentro de la vista (con margen)? */
  sees(x, y, pad = 60) {
    const e = this.persp ? this._ext() : null;
    const ex = e ? e.x : 0, et = e ? e.top : 0;
    return x > this.left() - pad - ex && x < this.left() + this.w + pad + ex &&
           y > this.top() - pad - et && y < this.top() + this.h + pad;
  },

  /**
   * Radio del círculo que envuelve la vista: usado para spawnear fuera.
   * Los enemigos salen en un anillo aplastado (alto × 0,9, spawner.js): en
   * vertical, con la vista alta, se alarga para que no aparezcan a la vista
   * por arriba o por abajo. En horizontal sale siempre lo de antes.
   */
  /** Radio que cubre la vista (la de este aparato, o la de un compañero si se pasa su ancho y alto). */
  // (Ultra: con la perspectiva, las esquinas de arriba quedan más lejos. persp: la de quien mira;
  // de un compañero no se sabe si juega en Ultra y spawner.js pasa ULTRA, por si acaso.)
  ULTRA: 0.12,
  outerRadius(w = this.w, h = this.h, persp = this.persp) {
    const k = persp ? 1 / (1 - persp) : 1;
    return Math.max(Math.hypot(w, h) / 2 * k + 40, h / 1.8 * k + 90);
  }
};
