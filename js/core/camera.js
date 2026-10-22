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

  /** ¿Está el punto dentro de la vista (con margen)? */
  sees(x, y, pad = 60) {
    return x > this.left() - pad && x < this.left() + this.w + pad &&
           y > this.top() - pad && y < this.top() + this.h + pad;
  },

  /**
   * Radio del círculo que envuelve la vista: usado para spawnear fuera.
   * Los enemigos salen en un anillo aplastado (alto × 0,9, spawner.js): en
   * vertical, con la vista alta, se alarga para que no aparezcan a la vista
   * por arriba o por abajo. En horizontal sale siempre lo de antes.
   */
  /** Radio que cubre la vista (la de este aparato, o la de un compañero si se pasa su ancho y alto). */
  outerRadius(w = this.w, h = this.h) { return Math.max(Math.hypot(w, h) / 2 + 40, h / 1.8 + 90); }
};
