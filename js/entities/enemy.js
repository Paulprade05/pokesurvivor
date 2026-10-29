/* ============ enemy.js — Pokémon salvajes y su gestor ============
 * (x, y) son los PIES. Animaciones de Mundo Misterioso:
 *   Walk al moverse · Idle parado · Charge apuntando una embestida ·
 *   Attack al embestir o al golpearte · Shoot al disparar · Hurt al recibir ·
 *   Faint al caer (se queda en el suelo y se desvanece).
 *
 * Los voladores, los fantasma y los jefes ignoran el terreno. El resto choca
 * con paredes y objetos, va más lento en el agua y se quema en la lava.
 *
 * El gestor mantiene una rejilla espacial (reconstruida cada frame) para la
 * separación entre enemigos y las colisiones de proyectiles.
 */
(() => {
  let nextId = 1;
  /** Los jefes se agrandan hasta ~110 de alto, según lo grande que ya sea su sprite. */
  function bossScale(dex) {
    const m = G.Sprites.animMeta(dex, 'Idle');
    const h = (m ? m.ay : 30) * G.Sprites.PX;
    // En múltiplos de 0,5: con la cámara a ×2 cada píxel de arte ocupa un
    // número entero de píxeles de pantalla (escalas como 1,37 lo deforman).
    return G.U.clamp(Math.round(110 / h * 2) / 2, 1, 2);
  }

  /*
   * Curas y escudos sobre un jefe (18-10-2026): van con el daño que le estás
   * haciendo, no con su vida (con 3 curanderos y escudos sobre un jefe de
   * 20.000 PV no había forma de tumbarlo). rd es el daño recibido con un
   * olvido de RD_TAU s, así que rd / RD_TAU ≈ daño por segundo de ahora.
   * Con 3 curanderos encima deshacen como mucho ~1/3 de lo que pegas, y los
   * escudos (uno cada 6 s) ~1/5: tarda más, pero siempre cae.
   */
  const RD_TAU = 6, BOSS_HEAL_S = 0.4, BOSS_SHIELD_S = 1.2;
  // s entre dos curas al mismo enemigo, de cualquier curandero (un poco menos que
  // la recarga de un curandero, 3,5 s: uno solo sigue curando como antes).
  const HEAL_LOCK = 3.4;
  const bossDps = e => e.rd / RD_TAU;

  /*
   * Veneno (18-10-2026): quita un % de la vida, pero con muchísima vida (los
   * legendarios de la Sentencia, que doblan cada 5 s) ese % se aplica a una
   * vida "efectiva" que crece con la raíz: hasta 60.000 PV igual que antes
   * (los enemigos y jefes normales no pasan de ahí), con 240.000 como si
   * tuviera 120.000, con 6 millones como si tuviera 600.000.
   * A los jefes y legendarios de las grietas (24-10-2026), la cuarta parte: las
   * acumulaciones no bajan mientras les sigas dando, así que cualquier ataque
   * venenoso llegaba a 8 (el 9,6 % de su vida cada 0,6 s) y un jefe del minuto 24
   * caía en unos 7 s sin llegar a enseñar sus ataques. Los de la Sentencia, igual que antes.
   */
  const PCT_REF = 60000, PSN_BOSS = 0.25;
  const pctHp = e => (e.maxHp <= PCT_REF ? e.maxHp : PCT_REF * Math.sqrt(e.maxHp / PCT_REF));

  /*
   * Ataques de lejos de los jefes según su tipo (ver «jefes» más abajo): los dos
   * primeros del primer tipo, uno del segundo (o el tercero del primero) y, en la
   * fase 2, otro más. Pensados para que cada tipo se reconozca: Fuego y Roca
   * lanzan meteoros, Eléctrico barre con rayos, Agua y Hada lanzan ondas...
   */
  const BOSS_KIT = {
    normal: ['volley', 'burst', 'summon'], fire: ['meteor', 'spiral', 'nova'], water: ['waves', 'burst', 'sweep'],
    grass: ['meteor', 'summon', 'volley'], electric: ['sweep', 'burst', 'beam'], ice: ['waves', 'beam', 'meteor'],
    fighting: ['cross', 'burst', 'volley'], poison: ['meteor', 'summon', 'nova'], ground: ['meteor', 'cross', 'waves'],
    flying: ['burst', 'waves', 'sweep'], psychic: ['spiral', 'sweep', 'nova'], bug: ['summon', 'volley', 'burst'],
    rock: ['meteor', 'cross', 'volley'], ghost: ['spiral', 'nova', 'summon'], dragon: ['sweep', 'meteor', 'spiral'],
    dark: ['burst', 'summon', 'spiral'], steel: ['cross', 'beam', 'burst'], fairy: ['spiral', 'waves', 'nova']
  };
  // Grupo de un ataque de varias marcas: golpea una sola vez aunque se solapen (ver hazards.js).
  let grpSeq = 0;

  class Enemy {
    constructor(def, x, y, sc, boss = false) {
      this.id = nextId++;
      this.def = def;
      this.dex = def.dex;
      this.name = (G.DEX_BY[def.dex] && G.DEX_BY[def.dex].name) || def.name;
      this.x = x; this.y = y;
      this.boss = boss;
      this.scale = boss ? bossScale(def.dex) : 1;
      this.anim = new G.Sprites.Animator(def.dex, this.scale);
      this.r = G.Sprites.bodyRadius(def.dex, this.scale);
      this.bodyH = G.Sprites.bodyHeight(def.dex, this.scale);

      this.maxHp = Math.round(def.hp * sc.hp);
      this.hp = this.maxHp;
      this.spd = def.spd * sc.spd;
      this.dmg = def.dmg * sc.dmg;
      this.xp = def.xp;
      this.behavior = def.behavior;

      const types = (G.DEX_BY[def.dex] && G.DEX_BY[def.dex].types) || [];
      this.types = types.length ? types : ['normal'];
      this.atkType = this.types[0];         // tipo de sus golpes (tabla de tipos)
      this.mon = G.DEX_BY[def.dex] || null;   // sus Defensas (G.Stats)
      this.cat = G.Stats.sideOf(this.mon);    // pega con su lado fuerte: físico o especial
      // Vuelan por encima de rocas y agua sólo los que FLOTAN en su sprite (un
      // Rowlet camina aunque sea Volador). Los jefes, por su tamaño, también.
      this.flying = boss || G.Sprites.hovers(def.dex);

      this.flash = 0;
      this.slow = 0; this.slowT = 0;
      this.burn = 0; this.burnT = 0; this.burnTick = 0;
      this.poison = 0; this.poisonT = 0; this.poisonTick = 0;
      this.lavaTick = 0;
      this.kx = 0; this.ky = 0;
      this.touchCd = 0;
      this.dead = false;
      this.fade = 0;             // tiempo de desvanecimiento tras caer

      // embestida
      this.phase = 'walk'; this.pt = 0; this.dx = 0; this.dy = 0;
      // distancia
      this.shotCd = def.shotCd ? G.U.rand(0.3, def.shotCd) : 0;
      // desatasco
      this.stuckT = 0; this.sideT = 0; this.side = 1;
      this.bob = Math.random() * 6.28;
      this.shiny = false;
      this.sparkT = 0;
      // personalidades
      this.sc = sc;                       // escala de la run (para sus invocaciones)
      this.shield = 0; this.shieldT = 0;  // escudo que absorbe daño
      this.rd = 0;                        // jefes: daño recibido hace poco (ver bossDps)
      this.skillCd = G.U.rand(1, 4);      // escudos / saltos
      this.minions = [];
      this.jump = null;                   // { sx, sy, tx, ty, t, dur }
      // Rezagados: si se quedan atrás, fuera de la vista, mientras huyes,
      // vuelven a salir por delante (ver EnemyMgr.update).
      this.lagT = 0;
    }

    cy() { return this.y; }

    /** Lo convierte en shiny: otro sprite, más aguante y mucha más XP. */
    makeShiny() {
      this.shiny = true;
      this.anim = new G.Sprites.Animator(this.dex, this.scale, true);
      this.maxHp *= 2; this.hp = this.maxHp;
      this.xp *= 5;
      G.Sprites.preload([this.dex], 4000, true);
    }

    /**
     * Campeón (spawner.js, desde el minuto 8): más grande, con aura y su barra de
     * vida siempre a la vista; ×3,5 de vida, ×1,35 de daño y ×4 de experiencia.
     * @param look  sólo el aspecto (la copia de un invitado: la vida llega del anfitrión)
     */
    makeChamp(look = false) {
      if (this.champ || this.boss) return;
      this.champ = true;
      this.scale = 1.5;
      this.anim = new G.Sprites.Animator(this.dex, this.scale, this.shiny);
      this.r = G.Sprites.bodyRadius(this.dex, this.scale);
      this.bodyH = G.Sprites.bodyHeight(this.dex, this.scale);
      if (look) return;
      this.maxHp = this.hp = Math.round(this.maxHp * 3.5);
      this.dmg *= 1.35; this.xp = Math.round(this.xp * 4);
      this.spd *= 0.92;
    }

    /** Hora dorada (events.js): doble de experiencia y a veces monedas. */
    makeGolden() {
      if (this.golden || this.boss || this.behavior === 'thief') return;
      this.golden = true;
      this.xp *= 2;
    }

    /** @param eff  'super' | 'weak' | null (tabla de tipos, sólo para enseñarlo) */
    hurt(amount, color = '#fff', dirX = 0, dirY = 0, knock = 0, eff = null) {
      if (this.dead) return;
      // Firma de jefe (G.BossSig, 26-10-2026): en el aire o bajo tierra no se le puede
      // dar; con su barrera recibe mucho menos (sigK) y dormido (Ausente), más.
      if (this.boss && (this.sigHide || G.BossSig.hidden(this))) return;
      if (this.boss && this.sigK != null && this.sigK !== 1 && !this.remote) amount *= this.sigK;
      // (Expuesto después de su firma, 28-10-2026: Asalto Espadón, Hiperrayo, Sofoco...)
      if (this.boss && this.sigVulnK > 1 && !this.remote) amount *= this.sigVulnK;
      const d = Math.max(1, Math.round(amount));
      // Copia de un enemigo del anfitrión: el golpe se le manda a él, que es
      // quien decide si cae. Aquí sólo se ve (número, destello y animación).
      if (this.remote) {
        G.Coop.hit(this, d, color, dirX, dirY, knock);
        this.hp = Math.max(1, this.hp - d);
        this.showHurt(d, color, dirX, dirY, eff);
        return;
      }
      if (this.boss) this.rd += d;
      // Escudo: absorbe primero.
      if (this.shield > 0) {
        const a = Math.min(this.shield, d);
        this.shield -= a;
        if (a >= d) { G.FX.dmgText(this.x, this.y - this.bodyH - 4, d, '#9fd8ff'); this.flash = 0.05; return; }
        amount = d - a;
      }
      this.hp -= Math.max(1, Math.round(amount));
      G.Judgment.noteDmg(amount, this);
      this.showHurt(d, color, dirX, dirY, eff);
      if (knock > 0 && !this.boss) {
        const [nx, ny] = G.U.norm(dirX, dirY);
        this.kx += nx * knock;
        this.ky += ny * knock;
      }
      if (G.Coop.isHost) G.Coop.hurtShown(this, d, color);
      if (this.hp <= 0) this.die();
    }

    /** Lo que se VE al recibir un golpe. */
    showHurt(d, color, dirX = 0, dirY = 0, eff = null) {
      this.flash = 0.09;
      // Muy eficaz: número amarillo y grande. Poco eficaz: gris. Crítico: naranja y grande.
      G.FX.dmgText(this.x, this.y - this.bodyH - 4, d, eff === 'crit' ? '#ff9a3c' : eff === 'super' ? '#ffe14d' : eff === 'weak' ? '#a3abb8' : color,
                   this.boss || eff === 'super' || eff === 'crit');
      G.FX.spark(this.x, this.y - this.bodyH * 0.5, color, dirX, dirY, 3);
      if (!this.anim.busy() && this.phase !== 'dash') this.anim.play('Hurt');
      G.Audio.sfx('hit');
    }

    /** Aturdido: se queda quieto y no ataca `dur` s (Onda Trueno, Tumba Rocas...). */
    applyStun(dur) {
      if (this.remote) { G.Coop.status(this, 't', dur); return; }
      this.stunT = Math.max(this.stunT || 0, dur);
    }

    applySlow(factor, dur = 1.2) {
      if (this.remote) { G.Coop.status(this, 's', factor); return; }
      this.slow = Math.max(this.slow, factor);
      this.slowT = Math.max(this.slowT, dur);
    }
    applyBurn(stacks = 1) {
      if (this.remote) { G.Coop.status(this, 'b', stacks); return; }
      this.burn = Math.min(8, this.burn + stacks); this.burnT = 3;
    }
    applyPoison(stacks = 1) {
      if (this.remote) { G.Coop.status(this, 'p', stacks); return; }
      this.poison = Math.min(8, this.poison + stacks); this.poisonT = 4;
    }

    die() {
      if (this.dead) return;
      this.dead = true;
      this.fade = 0.9;
      this.anim.play('Faint', { hold: true });
      const col = this.boss ? '#ffd95e' : '#ffffff';
      const cy = this.y - this.bodyH * 0.5;
      G.FX.burst(this.x, cy, col, this.boss ? 34 : 9, this.boss ? 260 : 120);
      G.FX.ring(this.x, this.y, this.r, this.r * (this.boss ? 6 : 2.6), col, this.boss ? 0.6 : 0.3, this.boss ? 6 : 3);
      // En una copia, el botín y los shinies los reparte el anfitrión.
      if (this.remote) {
        if (this.boss) G.Camera.kick(0.9);
        G.Audio.sfx(this.boss ? 'bossDown' : 'faint');
        if (this.shiny) { G.FX.burst(this.x, cy, '#ffe9a0', 30, 220); G.FX.ring(this.x, this.y, this.r, this.r * 7, '#9ae6ff', 0.7, 5); }
        return;
      }
      // (Los legendarios de la Sentencia de Arceus sólo dan experiencia.)
      if (this.boss && !this.judge) {
        G.Camera.kick(0.9);
        for (let i = 0; i < 10; i++) G.Pickups.drop('coin', this.x + G.U.rand(-40, 40), this.y + G.U.rand(-30, 30), 5);
        // Los jefes siempre sueltan un objeto equipable.
        G.Pickups.drop('item', this.x - 26, this.y - 10, G.Items.roll());
      }
      G.Pickups.dropXp(this.x, this.y, this.xp, this.boss, !!this.legend, !!this.judge);
      if (this.golden && Math.random() < 0.35) G.Pickups.drop('coin', this.x + 6, this.y - 4, 3);
      if (this.champ) for (let i = 0; i < 3; i++) G.Pickups.drop('coin', this.x + G.U.rand(-20, 20), this.y + G.U.rand(-14, 14), 3);
      // Duende del tesoro: Meowth suelta monedas; Gholdengo, un ticket ×10.
      if (this.behavior === 'thief') {
        const n = this.def.loot === 'ticket10' ? 6 : 20;
        for (let i = 0; i < n; i++) G.Pickups.drop('coin', this.x + G.U.rand(-36, 36), this.y + G.U.rand(-26, 26), 5);
        if (this.def.loot === 'ticket10') G.Pickups.drop('ticket10', this.x, this.y - 12, 1);
        G.FX.ring(this.x, this.y, this.r, this.r * 5, '#ffd23f', 0.6, 4);
      }
      if (this.legend) {
        // El legendario de la grieta: tickets sueltos y monedas (el ×10, como
        // la mitad de las veces; antes daba 2 siempre).
        for (let i = 0; i < 3; i++) G.Pickups.drop('ticket', this.x + G.U.rand(-30, 30), this.y + G.U.rand(-20, 20), 1);
        for (let i = 0; i < 10; i++) G.Pickups.drop('coin', this.x + G.U.rand(-50, 50), this.y + G.U.rand(-35, 35), 8);
      }
      G.Audio.sfx(this.boss ? 'bossDown' : 'faint');
      if (this.shiny) {
        G.FX.burst(this.x, cy, '#ffe9a0', 30, 220);
        G.FX.ring(this.x, this.y, this.r, this.r * 7, '#9ae6ff', 0.7, 5);
        if (G.onShinyCaught) G.onShinyCaught(this);
      }
    }

    /**
     * Copia de un enemigo del anfitrión: va hacia la última posición recibida
     * (más la velocidad estimada, para que no avance a saltos) y anima según
     * se mueva o según la animación que tenga en el anfitrión.
     */
    netUpdate(dt) {
      this.anim.update(dt);
      if (this.flash > 0) this.flash -= dt;
      if (this.dead) { this.fade -= dt; return; }
      if (this.touchCd > 0) this.touchCd -= dt;
      this.bob += dt * 6;
      if (this.shiny) {
        this.sparkT -= dt;
        if (this.sparkT <= 0) { this.sparkT = 0.22; G.FX.twinkle(this.x + G.U.rand(-this.r, this.r) * 1.2, this.y - G.U.rand(4, this.bodyH * 1.1)); }
      }
      const n = this.net;
      if (!n) return;
      // Se adelanta hasta 0,3 s (por si llegan pocas posiciones por segundo).
      const lead = Math.min(0.3, n.age);
      n.age += dt;
      const tx = n.x + n.vx * lead, ty = n.y + n.vy * lead;
      const ox = this.x, oy = this.y;
      if (G.U.dist2(this.x, this.y, tx, ty) > 160 * 160) { this.x = tx; this.y = ty; }
      else { this.x = G.U.damp(this.x, tx, 12, dt); this.y = G.U.damp(this.y, ty, 12, dt); }
      const vx = (this.x - ox) / (dt || 1), vy = (this.y - oy) / (dt || 1);
      const moving = Math.abs(vx) + Math.abs(vy) > 8;
      this.anim.dir = n.dir;
      // Animaciones de una vez (embestida, disparo...) que ha empezado el anfitrión.
      if (n.anim !== this.lastNetAnim) {
        this.lastNetAnim = n.anim;
        const a = G.Coop.ANIMS[n.anim];
        if (a && a !== 'Idle' && a !== 'Walk' && a !== 'Faint') this.anim.play(a, { speed: 1.4 });
      }
      this.anim.loop(moving ? 'Walk' : 'Idle');
    }

    update(dt, pl) {
      // Fuera de pantalla no hace falta animar (sí moverse y pensar).
      const seen = G.Camera.sees(this.x, this.y, 120);
      if (seen || this.dead) this.anim.update(dt);
      if (this.flash > 0) this.flash -= dt;
      if (this.dead) { this.fade -= dt; return; }
      if (this.shiny && seen) {
        this.sparkT -= dt;
        if (this.sparkT <= 0) {
          this.sparkT = 0.22;
          G.FX.twinkle(this.x + G.U.rand(-this.r, this.r) * 1.2, this.y - G.U.rand(4, this.bodyH * 1.1));
        }
      }
      if (this.touchCd > 0) this.touchCd -= dt;
      if (this.rd > 0) this.rd *= Math.exp(-dt / RD_TAU);
      this.bob += dt * 6;

      // --- estados ---
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
      if (this.burn > 0) {
        this.burnT -= dt; this.burnTick -= dt;
        if (this.burnTick <= 0) { this.burnTick = 0.5; this.hurt(1.6 * this.burn * (1 + pl.level * 0.06), '#ff9a4d'); }
        if (this.burnT <= 0) this.burn = 0;
      }
      if (this.poison > 0) {
        this.poisonT -= dt; this.poisonTick -= dt;
        if (this.poisonTick <= 0) { this.poisonTick = 0.6; this.hurt(pctHp(this) * 0.012 * (this.boss && !this.judge ? PSN_BOSS : 1) * this.poison + 1, '#d47cf0'); }
        if (this.poisonT <= 0) this.poison = 0;
      }
      if (this.dead) return;

      // --- terreno ---
      let terrainMul = 1;
      // (El legendario está en su casa: su arena no le afecta. Los de Arceus, tampoco.)
      if (!this.flying && !this.legend && !this.judge && G.World.isLiquid(this.x, this.y)) {
        const le = G.World.liquidEffect(this.types);
        if (le.dmg) {
          this.lavaTick -= dt;
          if (this.lavaTick <= 0) { this.lavaTick = le.every; this.hurt(6 + this.maxHp * 0.04, le.color); }
          if (this.dead) return;
        } else if (le.slow) terrainMul = le.slow < 0.5 ? 0.45 : 0.55;
      }

      if (this.stunT > 0) { this.stunT -= dt; this.anim.loop('Idle'); return; }

      const spd = this.spd * (1 - this.slow) * terrainMul * G.Weather.speedFor(this.types);
      let [dx, dy] = G.U.norm(pl.x - this.x, pl.y - this.y);
      const dist = G.U.dist(this.x, this.y, pl.x, pl.y);
      // Duende del tesoro: huye de ti (en zigzag) en cuanto te acercas.
      if (this.behavior === 'thief') {
        this.zig = (this.zig || 0) + dt;
        const near = dist < 300, a = Math.atan2(-dy, -dx) + Math.sin(this.zig * 2.2) * 0.7;
        const k = near ? 1 : 0.35;
        const vx0 = Math.cos(a) * spd * k, vy0 = Math.sin(a) * spd * k;
        const ox = this.x, oy = this.y;
        this.x += (vx0 + this.kx) * dt; this.y += (vy0 + this.ky) * dt;
        this.kx *= Math.pow(0.0015, dt); this.ky *= Math.pow(0.0015, dt);
        if (G.World.collide(this) && Math.hypot(this.x - ox, this.y - oy) < spd * k * dt * 0.3) this.zig += 1.4;
        if (Math.random() < dt * 6 && G.Camera.sees(this.x, this.y, 0)) G.FX.twinkle(this.x + G.U.rand(-this.r, this.r), this.y - G.U.rand(4, this.bodyH));
        this.anim.dir = G.Sprites.dirFromAngle(a);
        this.anim.loop('Walk', 1.4);
        return;
      }
      // Estampida (spawner.js): cruza en línea recta sin mirar a nadie. Si se
      // queda atascado contra algo, sigue como uno normal.
      if (this.behavior === 'stampede') {
        const s = (this.runSpd || spd) * (1 - this.slow * 0.5) * terrainMul;
        const vx0 = Math.cos(this.runA) * s, vy0 = Math.sin(this.runA) * s;
        const ox = this.x, oy = this.y;
        this.x += (vx0 + this.kx) * dt; this.y += (vy0 + this.ky) * dt;
        this.kx *= Math.pow(0.0015, dt); this.ky *= Math.pow(0.0015, dt);
        if (!this.flying && G.World.collide(this) && Math.hypot(this.x - ox, this.y - oy) < s * dt * 0.35) {
          if ((this.stuckT += dt) > 0.6) { this.behavior = 'chase'; this.stuckT = 0; }
        } else this.stuckT = 0;
        if (seen && Math.random() < dt * 8) G.FX.px(this.x - Math.cos(this.runA) * 10 + G.U.rand(-4, 4), this.y, '#e8dcc0', { vy: -14, life: 0.35 });
        this.anim.dir = G.Sprites.dirFromAngle(this.runA);
        this.anim.loop('Walk', 1.6);
        return;
      }
      // Corredor: va a donde VAS a estar (te corta el paso si sólo huyes).
      if (this.behavior === 'runner' && pl._vx != null) {
        const lead = G.U.clamp(dist / Math.max(60, spd), 0, 1.4);
        [dx, dy] = G.U.norm(pl.x + pl._vx * lead - this.x, pl.y + pl._vy * lead - this.y);
        if (G.Camera.sees(this.x, this.y, 0) && Math.random() < dt * 10) G.FX.px(this.x - dx * 8 + G.U.rand(-4, 4), this.y, '#e8dcc0', { vy: -12, life: 0.35 });
      }

      // --- personalidad (escudos, saltos, explosión) ---
      if (this.shieldT > 0 && (this.shieldT -= dt) <= 0) this.shield = 0;
      if (this.jump) { this.updateJump(dt); return; }
      if (this.behavior === 'bomber' && this.phase === 'fuse') {
        this.pt -= dt;
        this.flash = Math.floor(this.pt * 10) % 2 ? 0.05 : 0;
        if (this.pt <= 0) { this.hp = 0; this.die(); }
        this.anim.loop('Idle');
        return;
      }
      if (this.behavior === 'bomber' && dist < this.r + pl.r + 26) { this.startFuse(); return; }
      if (this.behavior === 'shielder' || this.behavior === 'jumper') {
        this.skillCd -= dt;
        if (this.skillCd <= 0) {
          if (this.behavior === 'shielder') { this.skillCd = 6; this.castShields(); }
          else if (dist < 250) { this.skillCd = G.U.rand(5, 7); this.startJump(pl); return; }
          else this.skillCd = 0.5;
        }
      }

      // Si lleva rato atascado contra algo, rodea por un lado.
      if (this.sideT > 0) {
        this.sideT -= dt;
        const a = Math.atan2(dy, dx) + this.side * 1.25;
        dx = Math.cos(a); dy = Math.sin(a);
      }

      // Camino alrededor de los obstáculos (los que no vuelan).
      if (!this.flying && this.phase !== 'dash' && this.sideT <= 0) {
        const pd = G.Path.dirFor(this, pl);
        if (pd && !(this.keepsDistance() && dist < (this.def.range || 200) * 0.82)) { dx = pd[0]; dy = pd[1]; }
      }

      let vx = dx * spd, vy = dy * spd;
      let animBase = 'Walk';

      if (this.boss) {
        [vx, vy, animBase] = this.bossMove(dt, pl, dist, dx, dy, spd);
      } else if (this.behavior === 'charger') {
        this.pt -= dt;
        if (this.phase === 'walk') {
          if (dist < 200 && this.pt <= 0) {
            this.phase = 'aim'; this.pt = 0.55;
            this.anim.play('Charge', { speed: 1.6 });
          }
        } else if (this.phase === 'aim') {
          vx = vy = 0; animBase = 'Idle';
          if (this.pt <= 0) {
            this.phase = 'dash'; this.pt = 0.42;
            this.dx = dx; this.dy = dy;
            this.anim.play('Attack', { speed: 1.4 });
            G.FX.ring(this.x, this.y, this.r, this.r * 2.4, '#ff6b6b', 0.25, 2);
          }
        } else if (this.phase === 'dash') {
          vx = this.dx * spd * 3.4; vy = this.dy * spd * 3.4;
          if (this.pt <= 0) { this.phase = 'walk'; this.pt = 1.1; }
        }
      } else if (this.keepsDistance()) {
        const range = this.def.range || 200;
        const keep = range * 0.82;
        // Recta hacia ti (no el camino) para alejarse.
        const [ddx, ddy] = G.U.norm(pl.x - this.x, pl.y - this.y);
        if (dist < keep * 0.75) { vx = -ddx * spd * 0.8; vy = -ddy * spd * 0.8; }
        else if (dist < keep) { vx *= 0.1; vy *= 0.1; animBase = 'Idle'; }
        this.shotCd -= dt;
        if (this.shotCd <= 0 && dist < range) {
          this.shotCd = this.def.shotCd || 2;
          this.special(pl, ddx, ddy);
        }
      }

      // --- integración ---
      const ox = this.x, oy = this.y;
      this.x += this.kx * dt; this.y += this.ky * dt;
      this.kx *= Math.pow(0.0015, dt); this.ky *= Math.pow(0.0015, dt);
      this.x += vx * dt; this.y += vy * dt;

      if (!this.flying && G.World.collide(this)) {
        // ¿Ha avanzado bastante menos de lo que quería?
        const want = Math.hypot(vx, vy) * dt;
        const got = Math.hypot(this.x - ox, this.y - oy);
        if (want > 0.5 && got < want * 0.35) {
          this.stuckT += dt;
          if (this.stuckT > 0.35 && this.sideT <= 0) {
            this.sideT = 0.7; this.stuckT = 0;
            this.side = Math.random() < 0.5 ? -1 : 1;
          }
        } else this.stuckT = 0;
      }

      // --- animación ---
      const moving = Math.abs(vx) + Math.abs(vy) > 2;
      const faceA = this.phase === 'dash' ? Math.atan2(this.dy, this.dx)
                  : moving ? Math.atan2(vy, vx) : Math.atan2(pl.y - this.y, pl.x - this.x);
      this.anim.dir = G.Sprites.dirFromAngle(faceA);
      this.anim.loop(moving ? animBase : 'Idle', moving ? Math.max(0.6, spd / 70) : 1);
    }

    // ---------------- jefes ----------------
    // Repertorio (23-10-2026). Cada jefe (y cada legendario de las grietas) lleva
    // 2 ataques de cerca (Pisotón siempre + Embestida o Salto) y 3 de lejos según
    // sus tipos (BOSS_KIT). Va alternando entre ir a por ti y pelear a distancia,
    // así que el que dispara también se te echa encima y el de cuerpo a cuerpo
    // también dispara. Todo avisa antes: en el suelo (zonas y rayos) o con un aro
    // de su color y la animación de cargar (los disparos).
    //
    //   slam    Pisotón: onda alrededor          dash    Embestida en línea recta
    //   leap    Salto que cae donde estabas      meteor  Lluvia de meteoros: marcas que caen en cascada
    //   beam    Rayos en abanico                 sweep   Rayo que barre un arco, franja a franja
    //   cross   Rayos en cruz (+ y, enfurecido, luego ×)
    //   nova    Anillo de disparos               volley  Abanico de disparos
    //   spiral  Espiral de disparos (2 brazos; 3 enfurecido)
    //   burst   Ráfagas apuntadas (se adelantan un poco a donde vas)
    //   waves   Ondas: anillos lentos con un hueco que va girando
    //   summon  Llama a esbirros del elenco de la run
    //
    // Fase 2, por debajo de la mitad de vida: se enfurece (aviso y aura roja), es
    // más rápido, espera menos, a veces encadena dos ataques, cada ataque es más
    // denso (más disparos, embestida triple, cruz doble...) y suma un ataque
    // nuevo, que estrena nada más enfurecerse. Con varios jefes vivos cada uno
    // ataca menos a menudo y con menos disparos (que no se junten tres espirales).
    // Los legendarios de la Sentencia de Arceus llevan el repertorio de antes
    // (salen muchos a la vez).

    bossInit() {
      const T = this.types, has = (...xs) => xs.some(x => T.includes(x));
      const melee = ['slam', G.U.hash(this.dex, 3, 7) < 0.5 ? 'dash' : 'leap'];
      let ranged, extra = null;
      if (this.judge) {
        const pref = has('fire', 'ground', 'poison', 'rock', 'grass') ? 'meteor'
                   : has('electric', 'psychic', 'dragon', 'ice', 'steel') ? 'beam'
                   : has('fairy', 'ghost', 'water', 'flying') ? 'nova' : 'volley';
        const others = ['meteor', 'beam', 'nova', 'volley'].filter(x => x !== pref);
        ranged = [pref, others[Math.floor(G.U.hash(this.dex, 5, 9) * 3) % 3]];
      } else {
        const k1 = BOSS_KIT[T[0]] || BOSS_KIT.normal, k2 = (T[1] && BOSS_KIT[T[1]]) || [];
        ranged = [k1[0], k1[1]];
        ranged.push(k2.find(x => !ranged.includes(x)) || k1[2]);
        extra = [k1[2], ...k2, 'spiral', 'nova'].find(x => !ranged.includes(x));
      }
      const far = this.behavior === 'ranged';
      this.ai = { melee, ranged, extra, farLike: far ? 0.65 : 0.35, mode: far ? 'far' : 'close', modeT: G.U.rand(6, 8),
                  cd: 1.6, cast: null, fury: false, side: Math.random() < 0.5 ? -1 : 1, last: null, next: null, sumT: 4 };
      // Su ataque firma (26-10-2026; los de la Sentencia no: salen a montones).
      if (!this.judge) G.BossSig.init(this);
    }

    /** Jefes vivos a la vez (fuera de la Sentencia), para repartir el ritmo entre ellos. */
    crowd() {
      if (this.judge) return 1;
      let n = 0;
      for (const e of G.EnemyMgr.bosses()) if (!e.judge) n++;
      return Math.max(1, n);
    }

    bossMove(dt, pl, dist, dx, dy, spd) {
      if (!this.ai) this.bossInit();
      const ai = this.ai;
      if (!ai.fury && this.hp < this.maxHp * 0.5) this.enrage();
      const k = ai.fury ? (this.judge ? 1.25 : 1.3) : 1;
      if (ai.sumT > 0) ai.sumT -= dt;
      if (this.sig) G.BossSig.tickBoss(this, dt);
      if (ai.cast) return this.bossCast(dt, pl);
      // Su firma (G.BossSig) cuando le toca, antes que los demás ataques.
      if (G.BossSig.due(this, dt, k, dist)) { G.BossSig.start(this, pl); return [0, 0, 'Idle']; }
      ai.modeT -= dt; ai.cd -= dt * k / (1 + 0.3 * (this.crowd() - 1));
      // Alterna siempre: en su distancia favorita está más rato (7-9 s) que en la otra (4-5 s).
      if (ai.modeT <= 0) {
        ai.mode = ai.mode === 'far' ? 'close' : 'far';
        ai.modeT = (ai.mode === 'far') === (ai.farLike > 0.5) ? G.U.rand(7, 9) : G.U.rand(4, 5);
        ai.side = -ai.side;
      }
      let vx = dx * spd * k * 1.1, vy = dy * spd * k * 1.1;
      const [ddx, ddy] = G.U.norm(pl.x - this.x, pl.y - this.y);
      if (this.landT > 0) this.landT -= dt;
      if (ai.mode === 'far') {
        // Retrocede más despacio, y nada justo después de caer de un salto (#255:
        // huía a toda velocidad, se escondía entre la horda y no había quien lo alcanzara).
        if (dist < 170 && !(this.landT > 0)) { vx = -ddx * spd * 0.6; vy = -ddy * spd * 0.6; }
        else if (dist < 300) { vx = -ddy * spd * 0.55 * ai.side; vy = ddx * spd * 0.55 * ai.side; }   // te rodea
      }
      if (ai.cd <= 0) {
        let id = null;
        if (ai.next && dist < 480) { id = ai.next; ai.next = null; }        // el ataque nuevo de la fase 2
        else if (ai.mode === 'close') {
          let ok = ai.melee.filter(m => m === 'slam' ? dist < 125 : dist < 320);
          if (ok.length > 1) ok = ok.filter(m => m !== ai.last);
          // También dispara aunque esté cerca (con el juicio, como antes: casi siempre cuerpo a cuerpo).
          id = ok.length && Math.random() < (this.judge ? 0.8 : 0.6) ? G.U.pick(ok) : this.pickRanged(dist);
        } else {
          id = dist < 115 ? 'slam' : dist < 430 ? this.pickRanged(dist) : null;
        }
        if (id) this.bossStart(id, pl, dist);
      }
      return [vx, vy, 'Walk'];
    }

    /** Uno de sus ataques de lejos, sin repetir el último si puede. */
    pickRanged(dist) {
      const ai = this.ai;
      if (dist > 480) return null;
      const ok = ai.ranged.filter(id => id !== 'summon' || this.canSummon());
      const fresh = ok.filter(id => id !== ai.last);
      const pool = fresh.length ? fresh : ok;
      return pool.length ? G.U.pick(pool) : null;
    }

    canSummon() {
      if (this.judge || this.ai.sumT > 0) return false;
      this.minions = this.minions.filter(m => !m.dead && G.EnemyMgr.get(m.id));
      return this.minions.length < 4;
    }

    enrage() {
      const ai = this.ai;
      ai.fury = true;
      this.spd *= 1.15;
      // Fase 2: suma un ataque y lo estrena enseguida.
      if (ai.extra) { ai.ranged.push(ai.extra); ai.next = ai.extra; ai.cd = Math.min(ai.cd, 0.8); }
      if (!this.judge) G.Spawner.say('¡' + this.name + ' se ha enfurecido!', 2.4);
      G.FX.ring(this.x, this.y, this.r, this.r * 5, '#ff4a4a', 0.6, 5);
      if (G.Coop.isHost && !this.judge) G.Coop.broadcast(['fxr', Math.round(this.x), Math.round(this.y), Math.round(this.r * 5), '#ff4a4a']);
      G.Camera.kick(0.5);
      G.Audio.sfx('boss');
    }

    /** Aviso de un ataque de disparos: aro de su color que se abre (también en los invitados). */
    tell(col, r, life) {
      G.FX.ring(this.x, this.y, this.r, r, col, life, 3);
      if (G.Coop.isHost) G.Coop.broadcast(['fxr', Math.round(this.x), Math.round(this.y), Math.round(r), col]);
    }

    dashHazard(c) {
      this.hazard({ kind: 'beam', x: this.x, y: this.y, angle: c.ang, len: c.len + this.r, w: this.r * 2 + 16,
                    delay: c.wind + c.dur, dmg: this.dmg * 1.2, type: this.atkType, color: c.col });
    }

    bossStart(id, pl, dist = 0) {
      const ai = this.ai, F = ai.fury, f = F ? 0.8 : 1, type = this.atkType, J = !!this.judge;
      const col = G.U.TYPE_COLOR[type] || '#ff7a9e';
      const ang = Math.atan2(pl.y - this.y, pl.x - this.x);
      // Con varios jefes a la vez, menos disparos cada uno.
      const less = [1, 1, 0.85, 0.7][Math.min(3, this.crowd())];
      const c = ai.cast = { id, t: 0, wind: 0.6 * f, after: 0.35, ang, col, less, next: 0 };
      const grp = ++grpSeq;
      ai.last = id;
      switch (id) {
        case 'slam':       // pisotón: onda alrededor
          c.wind = 0.85 * f;
          this.hazard({ kind: 'zone', x: this.x, y: this.y, r: 96 + this.r, delay: c.wind, dmg: this.dmg * 1.3, type, color: col });
          this.anim.play('Charge', { speed: 1.2 });
          break;
        case 'dash':       // embestida en línea recta (enfurecido, tres seguidas)
          c.wind = 0.75 * f; c.len = 330; c.dur = 0.32; c.reps = F && !J ? 3 : 1; c.end = Infinity;   // (acaba ella sola)
          this.dashHazard(c);
          this.anim.play('Charge', { speed: 1.3 });
          break;
        case 'leap':       // salto y caída sobre ti
          this.jump = { sx: this.x, sy: this.y, tx: pl.x, ty: pl.y, t: -0.5 * f, dur: 0.65 };
          this.hazard({ kind: 'zone', x: pl.x, y: pl.y, r: 82, delay: 0.5 * f + 0.65, dmg: this.dmg * 1.25, type, color: col });
          this.anim.play('Charge', { speed: 1.4 });
          ai.cast = null; ai.cd = G.U.rand(1.4, 2) + 0.6;
          break;
        case 'meteor': {   // lluvia de meteoros: marcas alrededor de ti que caen en cascada
          const n = J ? (F ? 6 : 4) : Math.round((F ? 10 : 7) * less);
          for (let i = 0; i < n; i++) {
            const a = i ? Math.random() * 6.2832 : 0, d = i ? (J ? G.U.rand(40, 120) : G.U.rand(45, 175)) : 0;
            this.hazard({ kind: 'zone', x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d * 0.8, r: J ? 50 : 46,
                          delay: (J ? 1.05 : 1.0) + i * (J ? 0.12 : 0.13), dmg: this.shotDmg() * (J ? 1.15 : 1.05), type, color: col, grp: J ? 0 : grp });
          }
          c.wind = 0.5; this.anim.play('Shoot');
          if (!J) this.tell(col, this.r * 2.6, 0.5);
          break;
        }
        case 'beam': {     // rayos en abanico
          const n = F ? 5 : 3, sp = F ? 0.42 : 0.5;
          for (let i = 0; i < n; i++) {
            this.hazard({ kind: 'beam', x: this.x, y: this.y, angle: ang + (i - (n - 1) / 2) * sp, len: 400, w: 26,
                          delay: 1.0, dmg: this.shotDmg() * 1.2, type, color: col, grp: J ? 0 : grp });
          }
          c.wind = 1.0; c.after = 0.25; this.anim.play('Charge', { speed: 1.1 });
          break;
        }
        case 'sweep':      // rayo que barre un arco, franja a franja (las marcas salen en orden)
          c.n = F ? 13 : 9; c.arc = F ? 2.4 : 1.7; c.dir = Math.random() < 0.5 ? -1 : 1; c.step = 0.09; c.i = 0;
          c.a0 = ang - c.dir * c.arc / 2; c.grp = grp; c.wind = 0; c.end = c.n * c.step + 0.85 + 0.2;
          this.anim.play('Charge', { speed: 1.1 });
          break;
        case 'cross': {    // rayos en cruz hacia ti; enfurecido, luego otra en aspa
          const sets = F ? 2 : 1;
          for (let s = 0; s < sets; s++) {
            const g = s ? ++grpSeq : grp;
            for (let k = 0; k < 4; k++) {
              this.hazard({ kind: 'beam', x: this.x, y: this.y, angle: ang + s * Math.PI / 4 + k * Math.PI / 2, len: 460, w: 34,
                            delay: 1.0 + s * 0.6, dmg: this.shotDmg() * 1.25, type, color: col, grp: g });
            }
          }
          c.wind = 1.0; c.after = sets > 1 ? 0.85 : 0.3; this.anim.play('Charge', { speed: 1.1 });
          break;
        }
        case 'volley':     // abanico de disparos
        case 'nova':       // anillo de disparos (enfurecido, dos)
        case 'spiral':     // espiral
        case 'burst':      // ráfagas apuntadas
        case 'waves':      // ondas con hueco
          c.wind = (id === 'nova' || id === 'waves' ? 0.7 : id === 'spiral' ? 0.6 : 0.5) * f;
          if (id === 'nova') { c.reps = F && !J ? 2 : 1; c.step = 0.32; c.n = Math.round((F ? (J ? 18 : 16) : 14) * (J ? 1 : less)); }
          if (id === 'spiral') { c.dur = F ? 2.0 : 1.6; c.step = (F ? 0.12 : 0.09) / less; c.arms = F ? 3 : 2; c.spin = (Math.random() < 0.5 ? -1 : 1) * (F ? 2.6 : 3.2); }
          if (id === 'burst') { c.reps = F ? 5 : 3; c.step = 0.3; }
          if (id === 'waves') { c.reps = F ? 4 : 3; c.step = 0.55; c.n = Math.round(16 * less); c.gap = Math.floor(Math.random() * c.n); }
          this.anim.play('Charge', { speed: 1.4 });
          this.tell(col, this.r * 2.6, c.wind);
          break;
        case 'summon':     // llama a sus esbirros
          c.wind = 0.9; c.after = 0.3; ai.sumT = 16;
          this.anim.play('Charge', { speed: 1.1 });
          this.tell('#c47bff', this.r * 3, 0.9);
          break;
      }
      // Cuándo acaba (los de varias tandas, al terminar la última).
      if (c.end == null) c.end = c.wind + (c.reps > 1 ? (c.reps - 1) * c.step + 0.3 : c.dur ? c.dur + 0.25 : c.after);
    }

    bossCast(dt, pl) {
      const ai = this.ai, c = ai.cast;
      if (c.id === 'sig') return G.BossSig.cast(this, dt, pl, c);
      c.t += dt;
      if (c.id === 'dash' && c.t >= c.wind) {
        if (!c.go) { c.go = true; this.anim.play('Attack', { speed: 1.6 }); }
        if (c.t >= c.wind + c.dur) {
          // Embestida triple: se para, vuelve a apuntarte (con su marca) y otra vez.
          if (--c.reps > 0) {
            c.t = 0; c.go = false; c.wind = 0.45;
            c.ang = Math.atan2(pl.y - this.y, pl.x - this.x);
            this.dashHazard(c);
            this.anim.play('Charge', { speed: 1.6 });
            return [0, 0, 'Idle'];
          }
          return this.bossEnd();
        }
        const sp = c.len / c.dur;
        return [Math.cos(c.ang) * sp, Math.sin(c.ang) * sp, 'Walk'];
      }
      if (c.id === 'sweep') {
        while (c.i < c.n && c.t >= c.i * c.step) {
          const a = c.a0 + c.dir * c.arc * c.i / (c.n - 1);
          this.hazard({ kind: 'beam', x: this.x, y: this.y, angle: a, len: 420, w: 28, delay: 0.85,
                        dmg: this.shotDmg() * 0.8, type: this.atkType, color: c.col, grp: c.grp });
          c.i++;
        }
      } else if (c.t >= c.wind) {
        const tt = c.t - c.wind;
        const aim = Math.atan2(pl.y - this.y, pl.x - this.x);
        switch (c.id) {
          case 'slam': if (!c.fired) this.anim.play('Attack', { speed: 1.4 }); break;
          case 'volley':
            if (!c.fired) {
              const n = Math.max(5, Math.round((ai.fury ? 9 : 7) * c.less));
              for (let i = 0; i < n; i++) this.fire(aim + (i / (n - 1) - 0.5) * 1.1, 190, 0.8);
              this.anim.play('Shoot');
            }
            break;
          case 'nova':
            while (c.reps > 0 && c.next <= tt) {
              const off = (c.reps % 2) * Math.PI / c.n;
              for (let i = 0; i < c.n; i++) this.fire(aim + off + i / c.n * 6.2832, 175, 0.7);
              c.reps--; c.next += c.step; this.anim.play('Shoot');
            }
            break;
          case 'spiral':
            while (c.next <= tt && c.next < c.dur) {
              for (let k = 0; k < c.arms; k++) this.fire(c.ang + c.next * c.spin + k * 6.2832 / c.arms, 150, 0.55, 8, 2.8);
              c.next += c.step;
            }
            if (!c.fired) this.anim.play('Shoot');
            break;
          case 'burst':
            while (c.reps > 0 && c.next <= tt) {
              // Se adelanta un poco a donde vas (no del todo: cambiando de rumbo se esquiva).
              const d = Math.hypot(pl.x - this.x, pl.y - this.y), lead = Math.min(0.5, d / 230) * 0.6;
              const a = Math.atan2(pl.y + (pl._vy || 0) * lead - this.y, pl.x + (pl._vx || 0) * lead - this.x);
              for (let i = -1; i <= 1; i++) this.fire(a + i * 0.2, 230, 0.6);
              c.reps--; c.next += c.step; this.anim.play('Shoot');
            }
            break;
          case 'waves':
            while (c.reps > 0 && c.next <= tt) {
              // Anillo lento con un hueco de 3 que gira en cada onda.
              for (let i = 0; i < c.n; i++) {
                if (((i - c.gap) % c.n + c.n) % c.n < 3) continue;
                this.fire(c.ang + i / c.n * 6.2832, 125, 0.65, 8, 3.4);
              }
              c.gap = (c.gap + 2) % c.n;
              c.reps--; c.next += c.step; this.anim.play('Shoot');
            }
            break;
          case 'summon':
            if (!c.fired) {
              const got = G.Spawner.minions(this.x, this.y, ai.fury ? 4 : 3);
              for (const m of got) { this.minions.push(m); G.FX.burst(m.x, m.y - 8, '#c47bff', 8, 90); }
              G.FX.ring(this.x, this.y, 8, 90, '#c47bff', 0.4, 3);
              this.anim.play('Attack', { speed: 1.2 });
            }
            break;
        }
        c.fired = true;
      }
      if (c.t >= c.end) return this.bossEnd();
      return [0, 0, 'Idle'];
    }

    bossEnd() {
      const ai = this.ai;
      ai.cast = null;
      ai.cd = G.U.rand(1.3, 2.0);
      if (ai.fury && Math.random() < (this.judge ? 0.35 : 0.4)) ai.cd = 0.3;    // encadena otro
      return [0, 0, 'Idle'];
    }

    /** Un disparo de jefe: más grande que el de un enemigo normal, para verlo bien en el móvil. */
    fire(a, sp, k, r = 8, life = 2.6) {
      if (G.Projectiles.count > 480) return;
      const type = this.atkType;
      const shot = G.Projectiles.spawn({
        x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        dmg: this.shotDmg() * k, r, life, friendly: false, color: '#ff7a9e', mtype: type, cat: this.cat,
        vis: G.VFX.forType(type)
      });
      if (G.Coop.isHost) G.Coop.enemyShot(shot, type);
    }

    keepsDistance() { return ['ranged', 'fan', 'beamer', 'zoner', 'healer', 'summoner'].includes(this.behavior); }

    shotDmg() { return (this.def.shotDmg || 10) * (this.dmg / this.def.dmg); }

    /** Disparo normal de enemigo (uno, o varios en abanico). */
    shoot(ax, ay, spread = 0, n = 1, k = 1) {
      const sp = 190, type = this.atkType;
      const base = Math.atan2(ay, ax);
      for (let i = 0; i < n; i++) {
        const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
        const shot = G.Projectiles.spawn({
          x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          dmg: this.shotDmg() * k, r: 7, life: 2.4, friendly: false, color: '#ff7a9e', mtype: type, cat: this.cat,
          vis: G.VFX.forType(type)
        });
        if (G.Coop.isHost) G.Coop.enemyShot(shot, type);
      }
      this.anim.play('Shoot');
      G.FX.ring(this.x, this.y - G.LIFT, 4, 14, '#ff7a9e', 0.2, 2);
    }

    /**
     * Zona o rayo con aviso, con la categoría de sus golpes (tu defensa que la para).
     * (26-10-2026) Los de los enemigos normales (explosiones, zonas, rayos, saltos) son
     * todos de un mismo grupo: como mucho un golpe cada 0,45 s aunque estallen cinco a
     * la vez (los avisos se saltan la invulnerabilidad de después de un golpe y, del
     * minuto 15 en adelante, varios juntos te quitaban la vida entera de una vez).
     */
    hazard(o) { G.Hazards.add(Object.assign({ cat: this.cat }, this.boss ? null : { grp: -1 }, o)); }

    /** Lo que hace cada personalidad cuando le toca (anfitrión / solitario). */
    special(pl, dx, dy) {
      const col = G.U.TYPE_COLOR[this.atkType] || '#ff7a9e';
      switch (this.behavior) {
        case 'fan': { const n = this.def.fanN || 5; this.shoot(dx, dy, n === 3 ? 0.6 : 0.9, n, 0.65); break; }
        case 'beamer':
          // Rayo con aviso: primero se ve la franja en el suelo.
          this.hazard({ kind: 'beam', x: this.x, y: this.y, angle: Math.atan2(dy, dx), len: 360, w: 22,
                          delay: 1.0, dmg: this.shotDmg() * 1.05, type: this.atkType, color: col });
          this.anim.play('Charge', { speed: 1.2 });
          break;
        case 'zoner': {
          const n = G.U.randInt(1, this.def.zones || 3);
          for (let i = 0; i < n; i++) {
            this.hazard({ kind: 'zone', x: pl.x + (i ? G.U.rand(-70, 70) : 0), y: pl.y + (i ? G.U.rand(-55, 55) : 0), r: 44,
                            delay: 1.2, dmg: this.shotDmg() * 0.95, type: this.atkType, color: col });
          }
          this.anim.play('Shoot');
          break;
        }
        case 'healer': this.healAround(); break;
        case 'summoner': this.summon(); break;
        default: this.shoot(dx, dy);
      }
    }

    healAround() {
      // 7 % de la vida (era 15 %: con varios curanderos curaban más de lo que
      // pegabas), y más cuanto más fuerte pegas, pero cada vez menos: con el
      // doble de ataque cura un 27 % más, con 10 veces más un 124 %, y como
      // mucho ×2,5. (Como los enemigos que tienen más vida si haces más daño.)
      const pow = Math.max(1, ...G.Game.everyone().map(p => (p.atk > 0 && p.baseAtk > 0 ? p.atk / p.baseAtk : 1)));
      const k = 0.07 * Math.min(2.5, Math.pow(pow, 0.35));
      const now = G.Game.st.time;
      let n = 0;
      for (const e of G.EnemyMgr.queryCircle(this.x, this.y, 150)) {
        // No se cura a sí mismo, y cada enemigo recibe como mucho una cura cada
        // HEAL_LOCK s aunque haya varios curanderos (21-10-2026, #140: 3 juntos
        // se sumaban y se curaban entre ellos sin parar).
        if (e === this || e.dead || e.hp >= e.maxHp || e.healLock > now) continue;
        e.healLock = now + HEAL_LOCK;
        // A un jefe, como mucho lo que le quitas en 0,4 s: así nunca se vuelve inmatable.
        const heal = e.maxHp * k;
        e.hp = Math.min(e.maxHp, e.hp + (e.boss ? Math.min(heal, bossDps(e) * BOSS_HEAL_S) : heal));
        G.FX.burst(e.x, e.y - e.bodyH * 0.6, '#7dffb0', 5, 60);
        n++;
      }
      this.anim.play('Charge');
      G.FX.ring(this.x, this.y, 8, 150, '#5fe08a', 0.5, 3);
      if (G.Coop.isHost) G.Coop.broadcast(['fxr', Math.round(this.x), Math.round(this.y), 150, '#5fe08a']);
      if (n && G.Camera.sees(this.x, this.y, 0)) G.Audio.sfx('heal');
    }

    castShields() {
      const near = G.EnemyMgr.queryCircle(this.x, this.y, 160).filter(e => !e.dead)
        .sort((a, b) => G.U.dist2(a.x, a.y, this.x, this.y) - G.U.dist2(b.x, b.y, this.x, this.y)).slice(0, 6);
      // A un jefe, el escudo es lo que le quitas en 1,2 s (no un 35 % de su vida
      // enorme), y uno cada 6 s aunque haya varios escuderos (shieldT empieza en 8).
      for (const e of near) {
        if (e.boss && e.shieldT > 2) continue;
        const s = e.boss ? Math.min(e.maxHp * 0.35, bossDps(e) * BOSS_SHIELD_S) : e.maxHp * 0.35;
        e.shield = Math.max(e.shield, s); e.shieldT = 8;
      }
      this.anim.play('Charge');
      G.FX.ring(this.x, this.y, 8, 160, '#7fc8ff', 0.5, 3);
      if (G.Coop.isHost) G.Coop.broadcast(['fxr', Math.round(this.x), Math.round(this.y), 160, '#7fc8ff']);
    }

    summon() {
      this.minions = this.minions.filter(m => !m.dead && G.EnemyMgr.get(m.id));
      // Con el tope general de enemigos (menos Pokémon en pantalla), con un pequeño margen.
      if (this.minions.length >= 4 || G.EnemyMgr.count > G.Spawner.capAt(G.Game.st.time) + 15) return;
      const dex = this.def.minion || this.dex;
      const mon = G.DEX_BY[dex];
      const def = { dex, name: mon ? mon.name : '', hp: Math.round(this.def.hp * 0.35), spd: Math.round(this.def.spd * 1.1),
                    dmg: Math.round(this.def.dmg * 0.6), xp: Math.max(1, Math.round(this.def.xp * 0.25)), behavior: 'chase' };
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * 6.2832;
        const m = new Enemy(def, this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 22, this.sc || { hp: 1, spd: 1, dmg: 1 });
        G.EnemyMgr.add(m);
        this.minions.push(m);
        G.FX.burst(m.x, m.y - 8, '#c47bff', 8, 90);
      }
      this.anim.play('Charge');
      G.FX.ring(this.x, this.y, 8, 50, '#c47bff', 0.4, 3);
    }

    startFuse() {
      this.phase = 'fuse'; this.pt = 1.0;
      this.hazard({ kind: 'zone', x: this.x, y: this.y, r: 62, delay: 1.0, dmg: this.dmg * 1.4, type: this.atkType, color: '#ff7b3d', boom: true });
    }

    startJump(pl) {
      const tx = pl.x, ty = pl.y;
      this.jump = { sx: this.x, sy: this.y, tx, ty, t: -0.45, dur: 0.6 };
      this.anim.play('Charge', { speed: 1.4 });
      this.hazard({ kind: 'zone', x: tx, y: ty, r: 50, delay: 1.05, dmg: this.dmg * 1.2, type: this.atkType,
                      color: G.U.TYPE_COLOR[this.atkType] || '#ff7a9e' });
    }

    /** Salto: se agacha, vuela en arco y cae donde estabas. */
    updateJump(dt) {
      const j = this.jump;
      j.t += dt;
      if (j.t < 0) { this.anim.loop('Idle'); return; }
      const k = Math.min(1, j.t / j.dur);
      this.x = j.sx + (j.tx - j.sx) * k;
      this.y = j.sy + (j.ty - j.sy) * k;
      this.jumpLift = Math.sin(k * Math.PI) * 46;
      this.anim.dir = G.Sprites.dirFromAngle(Math.atan2(j.ty - j.sy, j.tx - j.sx));
      if (k >= 1) {
        this.jump = null; this.jumpLift = 0;
        this.landT = 2;          // jefes: no huyen nada más caer (ver bossMove)
        if (!this.flying) G.World.collide(this);
        this.anim.play('Attack', { speed: 1.4 });
      }
    }

    /** Lo llama combat.js cuando te toca: anima el golpe. */
    strike(pl) {
      if (!this.anim.busy()) {
        this.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - this.y, pl.x - this.x));
        this.anim.play('Attack', { speed: 1.5 });
      }
    }

    /**
     * Animación según lo que le pasa (26-10-2026), aparte de la IA (que sigue pidiendo
     * Idle / Walk; aquí se cambian con anim.sub): aturdido se encoge a ratos (Hurt
     * despacio) y, si es para rato (dormir: Brecha Negra...), se duerme (Sleep); con la
     * mecha encendida, cargando; el saltador salta (Hop) en el aire. Lo de caer al morir
     * va en sprites.js. Lo llama el gestor tras cada update (también a las copias del
     * cooperativo, a las que casi nada de esto les llega: se ven como antes). Sólo se ve.
     */
    pickAnim() {
      const a = this.anim;
      if (this.dead) { a.sub = null; return; }
      // Su hoja de dormir (diminuta) desde el principio, para caer y dormirse ya la primera
      // vez; los saltadores, también la de saltar. (Sólo al empezar: en cada fotograma, no.)
      if (this.animAt !== a) {
        this.animAt = a;
        G.Sprites.ready(this.dex, 'Sleep', a.shiny);
        if (this.behavior === 'jumper') G.Sprites.ready(this.dex, 'Hop', a.shiny);
      }
      const S = Enemy.SUBS || (Enemy.SUBS = { sleep: { Idle: 'Sleep' }, daze: { Idle: 'Hurt' }, fuse: { Idle: 'Charge' } });
      let sub = null;
      if (this.stunT > 0) {
        // Al aturdirle (otra vez): si es para rato y tiene con qué, dormido; si no, encogido.
        if (this.stunT > (this.stunSeen || 0) + 0.05) this.stunNap = this.stunT >= 1.5 && G.Sprites.ready(this.dex, 'Sleep', a.shiny);
        sub = this.stunNap ? S.sleep : S.daze;
      } else if (this.phase === 'fuse') sub = S.fuse;
      this.stunSeen = this.stunT || 0;
      a.sub = sub;
      a.subK = sub === S.daze ? 0.5 : sub === S.fuse ? 1.6 : 1;
      // (Sólo los saltadores: los jefes son muy grandes y su hoja de saltar pesa mucho.)
      const j = this.behavior === 'jumper' && this.jump;
      if (!j) { this.hopped = false; return; }
      if (j.t >= 0 && !this.hopped) {
        this.hopped = true;
        const m = G.Sprites.ready(this.dex, 'Hop', a.shiny) && G.Sprites.animMeta(this.dex, 'Hop', a.shiny);
        if (m) a.play('Hop', { speed: Math.max(0.5, m.d.reduce((s, d) => s + d, 0) / 60 / j.dur) });
      }
    }

    draw(ctx) {
      const alpha = this.dead ? G.U.clamp(this.fade / 0.5, 0, 1) : 1;
      if (alpha <= 0) return;
      // Jefe en el aire o bajo tierra (su firma): se ve lo que dibuja G.BossSig.
      if (this.boss && !this.dead && G.BossSig.hidden(this)) return;

      const gold = this.golden || this.behavior === 'thief' || (this.remote && !this.boss && G.Events.golden);
      if ((this.boss || this.shiny || gold || this.champ) && !this.dead) {
        ctx.save();
        ctx.globalAlpha = (gold && !this.boss ? 0.32 : this.champ ? 0.3 : 0.22) + Math.sin(this.bob * 0.5) * 0.06;
        ctx.fillStyle = (this.ai && this.ai.fury) || (this.boss && this.net && this.net.st & 16) ? '#ff4a4a' : this.shiny ? '#9ae6ff' : gold ? '#ffd23f' : this.champ ? '#ff7a2e' : '#ffd95e';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.6, this.r * 0.6, 0, 0, 6.2832); ctx.fill();
        // Campeón: aro que late a sus pies (se distingue entre la horda).
        if (this.champ) {
          ctx.globalAlpha = 0.55 + Math.sin(this.bob * 0.8) * 0.25;
          ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.9, this.r * 0.75, 0, 0, 6.2832); ctx.stroke();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      G.Sprites.drawShadow(ctx, this.dex, this.x, this.y, this.scale);
      // Los que flotan ya van en el aire en su sprite: sólo se mecen un poco.
      // (Y los que saltan, en arco.)
      const lift = (this.flying && !this.boss ? 1 + Math.sin(this.bob) * 1.5 : 0) + (this.jumpLift || 0);
      this.anim.draw(ctx, this.x, this.y - lift, { flash: this.flash > 0, alpha });
      ctx.restore();

      if (this.dead) return;
      // Lo de su firma encima (barrera, carga, aura, forma de Deoxys, «Zzz»).
      if (this.boss) G.BossSig.drawOn(ctx, this);
      // Aturdido: estrellitas girando sobre la cabeza.
      if (this.stunT > 0) {
        const now = performance.now() / 1000;
        for (let i = 0; i < 3; i++) {
          const a = now * 5 + i * 2.094;
          G.VFX.draw(ctx, 'star', 'electric', this.x + Math.cos(a) * 9, this.y - lift - this.bodyH - 6 + Math.sin(a) * 3, { scale: 0.6 });
        }
      }

      // Escudo: burbuja azul.
      if (this.shield > 0 || (this.net && this.net.st & 4)) {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(this.bob) * 0.08;
        ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(127,200,255,.14)';
        ctx.beginPath(); ctx.ellipse(this.x, this.y - this.bodyH * 0.45, this.r * 1.5, this.bodyH * 0.65, 0, 0, 6.2832);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      if (this.burn > 0 || this.poison > 0 || (this.net && this.net.st & 3)) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = this.burn > 0 || (this.net && this.net.st & 1) ? '#ff8a3d' : '#c86bdc';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.2, this.r * 0.5, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      }

      // Apoyos: icono encima, para saber a quién ir primero.
      const SUP = { healer: 'heart', shielder: 'shield', summoner: 'friends' };
      if (SUP[this.behavior]) G.Icons.draw(ctx, SUP[this.behavior], Math.round(this.x - 6), Math.round(this.y - this.bodyH - (this.hp < this.maxHp ? 26 : 18)), 12);

      if (this.boss || this.champ || this.hp < this.maxHp) {
        const w = this.boss ? 90 : this.champ ? 50 : Math.max(22, this.r * 2);
        const y = this.y - this.bodyH - 10;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(this.x - w / 2, y, w, 3.4);
        ctx.fillStyle = this.boss ? '#ffcb3d' : this.champ ? '#ff9a3c' : '#ff5f6d';
        ctx.fillRect(this.x - w / 2, y, w * Math.max(0, this.hp / this.maxHp), 3.4);
      }
    }
  }

  // ---------------- gestor ----------------

  G.Enemy = Enemy;
  /** Tamaño de un jefe de esta especie (la llegada del legendario lo dibuja igual: systems/rift.js). */
  Enemy.bossScaleOf = bossScale;

  G.EnemyMgr = (() => {
    let list = [];            // vivos
    let corpses = [];         // cayendo / desvaneciéndose
    const CELL = 52;
    const grid = new Map();

    const byId = new Map();
    function clear() { list = []; corpses = []; grid.clear(); byId.clear(); G.BossSig.clear(); }
    function all() { return list; }
    function add(e) {
      list.push(e);
      byId.set(e.id, e);
      if (G.Coop.isHost) G.Coop.enemyAdded(e);
      return e;
    }
    function get(id) { return byId.get(id); }

    /** Copia local de un enemigo del anfitrión (cooperativo). */
    function addRemote(o) {
      if (byId.has(o.id)) return byId.get(o.id);
      const def = { dex: o.dex, hp: o.hp, spd: 0, dmg: o.dmg, xp: 0, behavior: o.beh || 'remote' };
      const e = new Enemy(def, o.x, o.y, { hp: 1, spd: 1, dmg: 1 }, o.boss);
      e.id = o.id;
      e.remote = true;
      if (o.champ) e.makeChamp(true);
      if (o.shiny) e.makeShiny();
      e.maxHp = o.hp; e.hp = o.hp;
      e.net = { x: o.x, y: o.y, vx: 0, vy: 0, age: 0, dir: 0, anim: 0, st: 0 };
      list.push(e);
      byId.set(e.id, e);
      return e;
    }

    // --- arena de la grieta ---
    let stashed = null;

    /** Guarda los enemigos del mapa mientras dura la arena. */
    function stash() {
      stashed = list.filter(e => !e.dead);
      for (const e of stashed) byId.delete(e.id);
      list = []; corpses = [];
      G.BossSig.clear();
    }

    /** Al volver: quita los de la arena y devuelve los del mapa (avisando a los demás). */
    function restore() {
      for (const e of list) { byId.delete(e.id); if (G.Coop.isHost) G.Coop.enemyGone(e, false); }
      list = []; corpses = [];
      G.BossSig.clear();
      for (const e of stashed || []) add(e);
      stashed = null;
    }

    /** Invitado: borra las copias (llegarán otra vez del anfitrión). */
    function clearRemote() {
      for (const e of list) if (e.remote) byId.delete(e.id);
      list = list.filter(e => !e.remote);
      corpses = corpses.filter(e => !e.remote);
    }

    /** Quita una copia (el anfitrión dice que ha caído o que se ha alejado). */
    function removeRemote(id, died) {
      const e = byId.get(id);
      if (!e) return;
      byId.delete(id);
      if (died) { e.die(); G.Progress.kill(e); killHook(G.Game.player, G.Game.everyone(), e); }
      const i = list.indexOf(e);
      if (i >= 0) list.splice(i, 1);
      if (died) corpses.push(e);
    }

    function key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }

    function rebuildGrid() {
      grid.clear();
      for (const e of list) {
        if (e.dead) continue;
        const k = key(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
        let b = grid.get(k);
        if (!b) grid.set(k, b = []);
        b.push(e);
      }
    }

    /** Enemigos vivos cuyo círculo toca este círculo. */
    function queryCircle(x, y, r) {
      const out = [];
      const c0x = Math.floor((x - r) / CELL) - 1, c1x = Math.floor((x + r) / CELL) + 1;
      const c0y = Math.floor((y - r) / CELL) - 1, c1y = Math.floor((y + r) / CELL) + 1;
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const b = grid.get(key(cx, cy));
          if (!b) continue;
          for (const e of b) {
            if (e.dead) continue;
            const rr = r + e.r;
            if (G.U.dist2(x, y, e.x, e.y) <= rr * rr) out.push(e);
          }
        }
      }
      return out;
    }

    function separate(dt) {
      for (const e of list) {
        if (e.dead) continue;
        const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
        let px = 0, py = 0, n = 0;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const b = grid.get(key(cx + i, cy + j));
            if (!b) continue;
            for (const o of b) {
              if (o === e || o.dead) continue;
              const min = (e.r + o.r) * 0.82;
              const dx = e.x - o.x, dy = e.y - o.y;
              const d2 = dx * dx + dy * dy;
              if (d2 > min * min || d2 < 1e-4) continue;
              const d = Math.sqrt(d2);
              const f = (min - d) / min;
              px += (dx / d) * f; py += (dy / d) * f;
              if (++n > 6) break;
            }
          }
        }
        if (n) {
          e.x += px * 42 * dt;
          e.y += py * 42 * dt;
          if (!e.flying) G.World.collide(e);
        }
      }
    }

    /**
     * Autoestima y parecidas (gancho kill de data/ability-fx.js), para el Pokémon
     * de este ordenador. En grupo no se sabe quién dio el último golpe (el de un
     * invitado llega por la red), así que cuenta para el más cercano a quien cae:
     * antes el anfitrión se llevaba las de todos y los invitados, ninguna.
     */
    function killHook(me, players, e) {
      if (!me || !me.abil || !me.abil.kill) return;
      if (players.length > 1 && nearestPlayer(players, e.x, e.y) !== me) return;
      me.abil.kill(me, e);
    }

    /** El jugador vivo más cercano (los caídos no atraen a nadie). */
    function nearestPlayer(players, x, y) {
      let best = null, bd = Infinity;
      for (const p of players) {
        if (p.dead) continue;
        const d = G.U.dist2(x, y, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    /**
     * @param players  [jugador local, ...compañeros]. Las estadísticas de la
     *                 run (derrotados, jefes) se apuntan en el primero.
     */
    // Segundos que un rezagado tiene que llevar fuera de la vista antes de volver por delante.
    const LAG_T = 2.5;
    const BOSS_FAR = 2500;    // jefe más lejos que esto de todos: se ha perdido (ver update)
    const BOSS_LOST = 15;     // s fuera de la vista de todos antes de volver a salir delante

    function update(dt, players) {
      if (!Array.isArray(players)) players = [players];
      const pl = players[0];
      // Velocidad suavizada de cada jugador (vale también para los compañeros).
      for (const p of players) {
        if (p._px != null && dt > 0) {
          const k = Math.min(1, dt * 5);
          p._vx += ((p.x - p._px) / dt - p._vx) * k; p._vy += ((p.y - p._py) / dt - p._vy) * k;
          if (Math.abs(p.x - p._px) > 200 || Math.abs(p.y - p._py) > 200) p._vx = p._vy = 0;    // teletransporte
        } else { p._vx = 0; p._vy = 0; }
        p._px = p.x; p._py = p.y;
      }
      rebuildGrid();
      for (const e of list) {
        if (e.remote) e.netUpdate(dt);
        else e.update(dt, nearestPlayer(players, e.x, e.y) || pl);
        e.pickAnim();
      }
      if (!G.Coop.active || G.Coop.isHost) separate(dt);
      G.BossSig.update(dt);                 // firmas de los jefes: campos y marcas (en todos)
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e.remote) continue;
        if (e.dead) {
          pl.kills++;                                          // (del equipo: el anfitrión lo manda a todos)
          killHook(pl, players, e);
          if (e.boss && !e.judge) pl.bosses++;
          G.Progress.kill(e);
          corpses.push(e);
          list.splice(i, 1);
          byId.delete(e.id);
          if (G.Coop.isHost) G.Coop.enemyGone(e, true);
          continue;
        }
        const near = nearestPlayer(players, e.x, e.y) || pl;
        // El duende del tesoro se escapa si no lo atrapas a tiempo.
        if (e.behavior === 'thief' && (e.life -= dt) <= 0) {
          G.FX.burst(e.x, e.y - 10, '#ffd23f', 16, 140);
          G.Spawner.say('¡' + e.name + ' se ha escapado!', 2.4);
          list.splice(i, 1); byId.delete(e.id);
          if (G.Coop.isHost) G.Coop.enemyGone(e, false);
          continue;
        }
        // Jefe lejísimos de todos (salió junto a un compañero que aún volvía de la
        // grieta, o se quedó atrás): a los 4 s vuelve a salir cerca, fuera de la vista.
        // Si no, no se le encontraba y, con un jefe vivo, no salen grietas.
        if (e.boss && !e.judge && !G.Rift.inArena) {
          const bd2 = G.U.dist2(e.x, e.y, near.x, near.y);
          e.lagT = bd2 > BOSS_FAR * BOSS_FAR ? e.lagT + dt : 0;
          if (e.lagT > 4) { e.lagT = 0; G.Spawner.ahead(e, near); }
          // Perdido más cerca (tras agua o paredes, o le dejas atrás corriendo):
          // si lleva BOSS_LOST s fuera de la vista de todos, sale delante del más
          // cercano (#86: con el jefe vivo no salen grietas).
          const R = G.Camera.outerRadius() + 200;
          e.lostT = !near.dead && bd2 > R * R ? (e.lostT || 0) + dt : 0;
          if (e.lostT > BOSS_LOST && G.Spawner.ahead(e, near)) e.lostT = 0;
        }
        // La estampida se va al terminar de cruzar, cuando ya no la ve nadie.
        if (e.behavior === 'stampede') {
          if ((e.life -= dt) <= 0) {
            const R = G.Camera.outerRadius() + 60;
            if (G.U.dist2(e.x, e.y, near.x, near.y) > R * R || e.life < -6) { list.splice(i, 1); byId.delete(e.id); if (G.Coop.isHost) G.Coop.enemyGone(e, false); }
          }
          continue;
        }
        if (e.boss || e.shiny || G.Rift.inArena) continue;
        // Rezagados: los que se quedan atrás mientras corres y llevan un rato
        // FUERA DE LA VISTA (de todos) vuelven a salir por delante de ti. Así
        // no se puede huir sin más, y nunca desaparece uno que estés viendo.
        const d2 = G.U.dist2(e.x, e.y, near.x, near.y);
        const R = G.Camera.outerRadius() + 40;
        const unseen = d2 > R * R && !G.Camera.sees(e.x, e.y, 60);
        const sp = Math.hypot(near._vx || 0, near._vy || 0);
        const behind = sp > 40 && ((e.x - near.x) * near._vx + (e.y - near.y) * near._vy) < -0.2 * Math.sqrt(d2) * sp;
        if (unseen && behind) e.lagT += dt;
        else if (!unseen) e.lagT = 0;
        if ((unseen && e.lagT > LAG_T) || d2 > 1400 * 1400) {
          e.lagT = 0;
          if (!G.Spawner.ahead(e, near)) { list.splice(i, 1); byId.delete(e.id); if (G.Coop.isHost) G.Coop.enemyGone(e, false); }
        }
      }
      for (let i = corpses.length - 1; i >= 0; i--) {
        if (corpses[i].remote) corpses[i].netUpdate(dt); else corpses[i].update(dt, pl);
        if (corpses[i].fade <= 0) corpses.splice(i, 1);
      }
      if (corpses.length > 120) corpses.splice(0, corpses.length - 120);
    }

    /** Lo que hay que dibujar ordenado por Y junto al resto de la escena. */
    function drawables(cam) {
      const out = [];
      for (const e of corpses) if (cam.sees(e.x, e.y, 80)) out.push(e);
      for (const e of list) if (cam.sees(e.x, e.y, 80)) out.push(e);
      G.BossSig.drawables(out);             // (lo del suelo y lo del aire de las firmas)
      return out;
    }

    function bossAlive() { return list.some(e => e.boss && !e.dead); }
    function shinies() { return list.filter(e => e.shiny && !e.dead); }
    /** Jefes vivos (también las copias del invitado). Reutiliza la lista: no guardarla. */
    const bossList = [];
    function bosses() {
      bossList.length = 0;
      for (const e of list) if (e.boss && !e.dead) bossList.push(e);
      return bossList;
    }

    return { clear, all, add, get, addRemote, removeRemote, stash, restore, clearRemote, update, drawables, queryCircle, rebuildGrid, bossAlive, shinies, bosses, nearestPlayer,
             get count() { return list.length; } };
  })();
})();

/* ============ firmas de los jefes (26-10-2026; cada una única, 28-10-2026) ============
 * «Quiero que cada boss tenga algo único que lo diferencie de los demás.»
 * Cada jefe (los del calendario y los legendarios de las grietas; no los de la
 * Sentencia, que salen a montones) tiene un ataque FIRMA fiel a su especie, distinto
 * del de todos los demás: Zapdos trae nubes de tormenta que te persiguen, Suicune
 * manda una ola que cruza la arena, Celebi hace estallar los sitios por donde pasaste,
 * Manaphy se cambia de sitio contigo, Gengar se desdobla en copias, Kyurem te congela,
 * Mesprit te confunde (vas al revés), Articuno deja hielo en el que resbalas...
 * Lo usa a los ~5 s de salir y luego cada ~14 s (enfurecido, cada ~10), con su nombre
 * encima (la primera vez, también en el aviso).
 *
 * La tabla especie → firma es SIG (todos los legendarios y los jefes del calendario
 * más vistos) y, para el resto, BY_TYPE (según su tipo; con dos tipos, a veces el
 * segundo) con un toque según sus estadísticas (FLAVOR: rápido, fuerte, de ataque
 * especial o duro). Ver docs/JEFES.md.
 *
 * Piezas:
 *   peligros  G.Hazards (zonas y rayos con aviso; ya van por la red con 'hz')
 *   campos    (fields) charcos que queman, frenan, duermen, resbalan o atraen, ondas que
 *             crecen con un hueco (o van y vuelven), anillos que estallan, jaulas redondas
 *             y cuadradas que se cierran, olas que cruzan la arena, brazos de orbes que
 *             giran, viento que empuja o atrae, oscuridad, orbes que te siguen, el tiempo
 *             que va lento y «zap» (lo que te deja un golpe: dormido, congelado,
 *             confuso, quemado, con sueño o lanzado por los aires)... Cada ordenador los
 *             dibuja y mira sólo SU Pokémon (como los peligros).
 *   marcas    (marks) sólo se ven: el nombre, lo que cae del cielo, la sombra del que
 *             se lanza en picado, nubes de tormenta, copias de Gengar, la estela de
 *             Rayquaza, la burbuja de la barrera, la jaula de Braille... (y 'swap', que
 *             cambia de sitio al Pokémon de quien toca).
 *   trabajos  (jobs, sólo quien manda) lo que pasa después del ataque (rayos de las
 *             nubes, campos con descargas, curas, fin de un potenciador...).
 * El jefe puede quedarse sin que se le pueda dar (en el aire, bajo tierra: sigHide),
 * recibir menos o más daño (sigK: barrera 0,15; dormido 1,5) o quedar expuesto un rato
 * después (sigVulnK: Asalto Espadón, Hiperrayo, Sofoco...). Ver Enemy.hurt.
 *
 * Tu Pokémon (sólo el de este ordenador): ps lleva lo que le han hecho las firmas
 * (dormido o congelado: no se mueve; confuso: va al revés; quemado; con sueño; sobre
 * hielo: resbala; lanzado). Se aplica después de que se mueva (EnemyMgr.update va
 * después de pl.update), sin tocar player.js.
 *
 * Cooperativo: lo decide el anfitrión y lo manda con ['bsg', {...}] (campos y marcas).
 * Una versión anterior no conoce 'bsg': no ve ni sufre los campos (sí los peligros,
 * los disparos y el clima, que ya iban por la red) y el resto del jefe sigue igual.
 */
G.BossSig = (() => {
  const TAU = Math.PI * 2;
  const auth = () => !G.Coop.active || G.Coop.isHost;

  // Colores de cada estilo: [principal, claro].
  const ST = {
    ice: ['#8fe4ff', '#ffffff'], elec: ['#ffd84a', '#fff8c0'], bolt: ['#ffe14d', '#ffffff'], fire: ['#ff7a2e', '#ffd25e'],
    rainbow: ['#ff6b4d', '#ffe9a0'], bluefire: ['#4fb8ff', '#d8f4ff'], vfire: ['#ff5a2e', '#ffe9a0'], geyser: ['#ff8a3d', '#ffd25e'],
    steam: ['#e8f0ff', '#9ec4ff'], time: ['#5fe08a', '#d8ffd8'], star: ['#ffe680', '#fffbe0'], pillar: ['#ffd25e', '#fff3c8'],
    rock: ['#b89a6a', '#efe0bc'], steel: ['#b8c6d8', '#ffffff'], normal: ['#e0d6c4', '#ffffff'], water: ['#4fa8ff', '#d4ecff'],
    mist: ['#f0d8ff', '#ffffff'], psy: ['#ff6fb8', '#ffd0ea'], dream: ['#c48aff', '#ffd0f0'], toxic: ['#b45cf0', '#ecc4ff'],
    grass: ['#6fd860', '#e0ffc8'], leaf: ['#5fc850', '#e0ffb8'], shadow: ['#8a5cff', '#e0d0ff'], dig: ['#b08850', '#ecd8a8'],
    dark: ['#d2384a', '#ffb0b8'], tear: ['#ff8ad8', '#ffffff'], blade: ['#d8ecff', '#ffffff'], drive: ['#ffffff', '#ffffff'],
    notes: ['#7dffb0', '#ffffff'], sound: ['#ffc890', '#ffffff'], sun: ['#ffcb3d', '#fff3b0'], dragon: ['#7a5cff', '#7dffb0'],
    meteor: ['#a68aff', '#ffd25e'], arrow: ['#5fe08a', '#e0ffe0'], spear: ['#bff3ff', '#ffffff'], moon: ['#f0e6ff', '#ff9fd8'],
    heart: ['#ff7ab8', '#ffd0e8'], diamond: ['#ffc8f0', '#ffffff'], ghost: ['#9e8aea', '#ece4ff'], aura: ['#4f9cff', '#d8ecff'],
    shuriken: ['#4fa8ff', '#ffffff'], dart: ['#7a5cff', '#c8bcff'], bug: ['#a8d040', '#f0ffb8'], fairy: ['#ff9fd8', '#ffffff'],
    pink: ['#ff8ad8', '#ffe4f6'], wind: ['#d8e8ff', '#ffffff'], prism: ['#ffffff', '#ff9fd8'], eternal: ['#ff3a5a', '#e0a0ff'],
    lava: ['#ff6a1f', '#ffd25e'], sand: ['#e0bf73', '#fff2cc'], fist: ['#ffb070', '#fff0e0'], seed: ['#7ad850', '#ffe9a0']
  };
  const colOf = (st, type) => (ST[st] ? ST[st] : [(G.U.TYPE_COLOR && G.U.TYPE_COLOR[type]) || '#ff7a9e', '#ffffff']);

  /*
   * Especie → [pieza, nombre oficial del movimiento, opciones]. Cada fila es distinta de
   * todas las demás (pieza u opción propia): lo comprueba tests/jefes.test.cjs.
   * Piezas (ver P más abajo): fissure, flood, barrier, skyfall, strikes, echo, storm, wave,
   * surf, timewarp, lines, whirl, shadow, gale, dark, beam, dashes, drive, outrage, orbs,
   * barrage, bubbles, yawn, swap, spin, decoy, volley, warp, pass, forms, metronome,
   * terrain, fists, quake, cage, box, bloom, pools, perfume, whirlpool, bomb, multitype,
   * splash, truant, slam.
   */
  const SIG = {
    // ----- legendarios y singulares (grietas) -----
    144: ['wave', 'Ventisca', { st: 'ice', w: 'snow', n: 3, slow: 1.2, ice: 1 }],                     // Articuno: deja hielo que resbala
    145: ['storm', 'Trueno', { st: 'bolt', w: 'rain', n: 3 }],                                      // Zapdos: nubes que te persiguen
    146: ['skyfall', 'Ataque Aéreo', { st: 'fire', n: 3, trail: 'fire', ring: 1 }],                  // Moltres: cada caída abre un anillo de fuego
    150: ['barrier', 'Barrera', { st: 'psy', armor: 0.85, dur: 3.6, burst: 3, name2: 'Onda Mental', blow: 1 }], // Mewtwo: y te lanza lejos
    151: ['metronome', 'Metrónomo', { st: 'pink' }],                                                // Mew
    243: ['wave', 'Chispazo', { st: 'elec', n: 3, gaps: 2, spd: 215, back: 1 }],                     // Raikou: ondas que van y vuelven
    244: ['strikes', 'Estallido', { st: 'geyser', n: 9, pat: 'ring', w: 'sun', r: 50, byHp: 1 }],    // Entei: más cuanta más vida le queda
    245: ['surf', 'Surf', { st: 'water', n: 2 }],                                                   // Suicune: una ola cruza la arena
    249: ['gale', 'Aerochorro', { st: 'wind', beam: 1 }],                                           // Lugia: viento y rayo
    250: ['strikes', 'Fuego Sagrado', { st: 'rainbow', n: 13, pat: 'spiral', w: 'sun', burn: 1, rebirth: 1 }], // Ho-Oh: quema y renace
    251: ['echo', 'Premonición', { st: 'time', n: 8 }],                                             // Celebi: estallan donde estuviste
    377: ['quake', 'Roca Afilada', { st: 'rock', braille: 1, rocks: 1, dir: 'out' }],               // Regirock
    378: ['quake', 'Rayo Hielo', { st: 'ice', braille: 1, dir: 'in', freeze: 1 }],                 // Regice: congelan
    379: ['quake', 'Defensa Férrea', { st: 'steel', braille: 1, armor: 0.6, dir: 'both' }],         // Registeel: hacia fuera y hacia dentro a la vez
    380: ['dashes', 'Bola Neblina', { st: 'mist', n: 3, trail: 'mist', ghost: 1 }],                 // Latias: invisible
    381: ['dashes', 'Resplandor', { st: 'psy', n: 2, beam: 1 }],                                    // Latios: y un rayo
    382: ['flood', 'Pulso Primigenio', { st: 'water', w: 'rain', r: 250, waves: 3 }],              // Kyogre
    383: ['fissure', 'Filo del Abismo', { st: 'lava', w: 'sun', n: 6 }],                            // Groudon
    384: ['pass', 'Ascenso Draco', { st: 'dragon', n: 3 }],                                         // Rayquaza: cruza la arena en picado
    385: ['strikes', 'Deseo Oculto', { st: 'star', pat: 'star', delay: 2.0, r: 44 }],               // Jirachi: estrella de cinco puntas
    386: ['forms', 'Psicoataque', { st: 'psy' }],                                                   // Deoxys
    480: ['yawn', 'Bostezo', { st: 'dream', n: 5 }],                                                // Uxie: te entra sueño
    481: ['orbs', 'Paranormal', { st: 'psy', n: 5, conf: 1 }],                                      // Mesprit: te confunde
    482: ['bomb', 'Explosión', { st: 'fire' }],                                                     // Azelf
    483: ['timewarp', 'Distorsión', { st: 'aura' }],                                                // Dialga
    484: ['lines', 'Corte Vacío', { st: 'tear', pat: 'star', n: 4, open: 1 }],                      // Palkia: los cortes se quedan abiertos
    485: ['cage', 'Lluvia Ígnea', { st: 'fire', lava: 1 }],                                         // Heatran
    486: ['quake', 'Agarrón', { st: 'normal', braille: 1, big: 1, grip: 1 }],                       // Regigigas: te arrastra hacia él
    487: ['shadow', 'Golpe Umbrío', { st: 'shadow', puddle: 1 }],                                   // Giratina: deja su sombra
    488: ['spin', 'Danza Lunar', { st: 'moon', arms: 3, heal: 0.06 }],                             // Cresselia: brazos de lunas y se cura
    489: ['bubbles', 'Danza Lluvia', { st: 'water', w: 'rain', n: 9 }],                             // Phione: burbujas y se cura con la lluvia
    490: ['swap', 'Cambiaalmas', { st: 'heart', n: 4 }],                                            // Manaphy: se cambia de sitio contigo
    491: ['dark', 'Brecha Negra', { st: 'dream', n: 4, sleep: 1 }],                                 // Darkrai: te duermes en sus charcos
    492: ['bloom', 'Fulgor Semilla', { st: 'grass', kind: 'flare' }],                               // Shaymin
    493: ['strikes', 'Sentencia', { st: 'pillar', n: 10, pat: 'around', big: 1, plate: 1 }],       // Arceus: cambia de tabla (tipo)
    494: ['lines', 'V de Fuego', { st: 'vfire', pat: 'v' }],                                        // Victini
    638: ['lines', 'Espada Santa', { st: 'blade', pat: 'grid' }],                                   // Cobalion: tajos en cuadrícula
    639: ['dashes', 'Espada Santa', { st: 'rock', n: 3, rocks: 1 }],                                // Terrakion: embestidas y rocas
    640: ['lines', 'Hoja Aguda', { st: 'leaf', pat: 'zigzag', n: 5 }],                             // Virizion: tajos en zigzag
    641: ['gale', 'Vendaval', { st: 'wind', tornado: 3, shift: 1 }],                                // Tornadus: el viento cambia
    642: ['strikes', 'Electormenta', { st: 'bolt', pat: 'rows', w: 'rain' }],                       // Thundurus: filas de rayos
    643: ['strikes', 'Llama Azul', { st: 'bluefire', n: 12, pat: 'spiral', embers: 1 }],           // Reshiram: deja fuego azul
    644: ['dashes', 'Ataque Fulgor', { st: 'elec', n: 2, trail: 'elec', big: 1 }],                 // Zekrom
    645: ['strikes', 'Fuerza Telúrica', { st: 'sand', pat: 'lanes', w: 'sand' }],                   // Landorus: tres filas que avanzan
    646: ['wave', 'Mundo Gélido', { st: 'ice', w: 'snow', n: 2, freeze: 1 }],                       // Kyurem: te congela
    647: ['whirl', 'Sable Místico', { st: 'water' }],                                              // Keldeo: tajo que da la vuelta
    648: ['wave', 'Canto Arcaico', { st: 'notes', n: 3, slow: 1.0, dance: 1 }],                     // Meloetta: y baila (embestidas)
    649: ['lines', 'Tecno Shock', { st: 'drive', pat: 'cross' }],                                   // Genesect
    716: ['bloom', 'Geocontrol', { st: 'fairy', kind: 'geo' }],                                     // Xerneas
    717: ['skyfall', 'Ala Mortífera', { st: 'dark', n: 3, trail: 'dark', drain: 1 }],              // Yveltal: se cura al caer
    718: ['strikes', 'Mil Flechas', { st: 'arrow', pat: 'grid' }],                                  // Zygarde
    719: ['strikes', 'Tormenta de Diamantes', { st: 'diamond', n: 6, pat: 'around', shards: 1 }],  // Diancie: estallan en esquirlas
    720: ['warp', 'Paso Dimensional', { st: 'psy', kind: 'portals' }],                              // Hoopa
    721: ['strikes', 'Chorro de Vapor', { st: 'steam', n: 8, pat: 'around', w: 'fog', blow: 1 }],  // Volcanion: te lanzan
    772: ['lines', 'Garra Brutal', { st: 'normal', pat: 'claw' }],                                  // Código Cero: zarpazos
    773: ['multitype', 'Multiataque', { st: 'normal' }],                                            // Silvally
    785: ['terrain', 'Campo Eléctrico', { st: 'elec' }],                                            // Tapu Koko
    786: ['terrain', 'Campo Psíquico', { st: 'psy', orbs: 1 }],                                     // Tapu Lele
    787: ['terrain', 'Campo de Hierba', { st: 'grass', heal: 1 }],                                  // Tapu Bulu
    788: ['terrain', 'Campo de Niebla', { st: 'mist', fog: 1 }],                                    // Tapu Fini
    789: ['splash', 'Salpicadura', { st: 'psy' }],                                                  // Cosmog
    790: ['barrier', 'Masa Cósmica', { st: 'psy', armor: 0.9, dur: 4.5, pull: 1 }],                // Cosmoem: te atrae
    791: ['dashes', 'Meteoimpacto', { st: 'sun', n: 1, big: 1, w: 'sun', charge: 1 }],             // Solgaleo: una sola, cargada
    792: ['dark', 'Rayo Umbrío', { st: 'shadow', n: 2, sweep: 1 }],                                // Lunala: rayo que barre
    800: ['beam', 'Láser Prisma', { st: 'prism', kind: 'prism' }],                                  // Necrozma
    801: ['beam', 'Cañón Floral', { st: 'fairy', kind: 'decay' }],                                  // Magearna: tres, cada uno más flojo
    802: ['shadow', 'Robasombra', { st: 'shadow', n: 3, steal: 1 }],                                // Marshadow: te roba la velocidad
    807: ['dashes', 'Puños Plasma', { st: 'elec', n: 4, trail: 'elec', short: 1, live: 1 }],       // Zeraora: su rastro estalla
    808: ['spin', 'Cañón Resplandor', { st: 'steel', around: 1, arms: 4 }],                         // Meltan: tuercas que se cierran
    809: ['fists', 'Ferropuño Doble', { st: 'fist', kind: 'giant' }],                               // Melmetal
    888: ['lines', 'Tajo Supremo', { st: 'blade', pat: 'star', n: 5 }],                             // Zacian
    889: ['barrier', 'Embate Supremo', { st: 'steel', armor: 0.7, dur: 2.4, rush: 1 }],            // Zamazenta: y embiste con su escudo
    890: ['beam', 'Rayo Infinito', { st: 'eternal', kind: 'single', pools: 1 }],                    // Eternatus
    891: ['fists', 'Demolición', { st: 'fist', n: 5 }],                                             // Kubfu
    892: ['fists', 'Golpe Oscuro', { st: 'fist', kind: 'combo' }],                                  // Urshifu: tres seguidos donde estás
    894: ['box', 'Electrojaula', { st: 'elec' }],                                                   // Regieleki: jaula cuadrada
    895: ['beam', 'Dracoenergía', { st: 'dragon', kind: 'cone' }],                                  // Regidrago
    896: ['strikes', 'Lanza Glacial', { st: 'spear', n: 10, pat: 'around', w: 'snow', spikes: 1 }], // Glastrier: quedan clavadas
    897: ['barrage', 'Orbes Espectro', { st: 'ghost', n: 10 }],                                     // Spectrier: desde los bordes
    898: ['bloom', 'Lluevehojas', { st: 'leaf', kind: 'leaf' }],                                    // Calyrex
    905: ['gale', 'Ciclón Primavera', { st: 'pink', tornado: 3, lure: 1 }],                         // Enamorus: tornados que atraen
    1004: ['strikes', 'Sofoco', { st: 'fire', n: 12, pat: 'spiral', spent: 1 }],                   // Chi-Yu: luego queda expuesta
    1007: ['drive', 'Nitrochoque', { st: 'sun', w: 'sun' }],                                        // Koraidon: da vueltas a tu alrededor
    1015: ['pools', 'Cadena Virulenta', { st: 'toxic', n: 5, chain: 1 }],                           // Munkidori
    1016: ['perfume', 'Atracción', { st: 'toxic' }],                                                // Fezandipiti: perfume que atrae
    1017: ['fists', 'Garrote Liana', { st: 'leaf', n: 6, vines: 1 }],                               // Ogerpon: deja lianas
    1024: ['barrier', 'Teraclúster', { st: 'prism', armor: 0.8, dur: 3, burst: 4, tera: 1 }],      // Terapagos: anillos de todos los tipos
    // ----- jefes del calendario más vistos -----
    3: ['beam', 'Rayo Solar', { st: 'sun', kind: 'single', w: 'sun', seeds: 1 }],                   // Venusaur: y Drenadoras
    6: ['strikes', 'Anillo Ígneo', { st: 'fire', n: 10, pat: 'ring', burst: 1 }],                   // Charizard: anillo y estallido
    9: ['lines', 'Hidrocañón', { st: 'water', pat: 'parallel', recoil: 1 }],                        // Blastoise: retrocede al disparar
    59: ['dashes', 'Velocidad Extrema', { st: 'fire', n: 4, blink: 1 }],                            // Arcanine: aparece a tu lado
    65: ['warp', 'Teletransporte', { st: 'psy' }],                                                  // Alakazam
    68: ['fists', 'Puño Dinámico', { st: 'fist', kind: 'four', conf: 1 }],                          // Machamp: cuatro puños, confunde
    94: ['decoy', 'Bola Sombra', { st: 'ghost', n: 3 }],                                            // Gengar: copias
    130: ['beam', 'Hiperrayo', { st: 'water', kind: 'sweep', recharge: 1 }],                        // Gyarados: y tiene que descansar
    131: ['wave', 'Canto', { st: 'notes', n: 2, spd: 120, sleep: 1 }],                              // Lapras: te duerme
    143: ['slam', 'Golpe Cuerpo', { st: 'normal', rest: 1 }],                                       // Snorlax: y Descanso
    149: ['outrage', 'Enfado', { st: 'dragon' }],                                                   // Dragonite
    212: ['dashes', 'Puño Bala', { st: 'steel', n: 5, short: 1, quick: 1 }],                        // Scizor: casi sin aviso
    214: ['dashes', 'Megacuerno', { st: 'bug', n: 1, big: 1, toss: 1 }],                            // Heracross: te lanza
    229: ['strikes', 'Infierno', { st: 'fire', n: 9, pat: 'around', burn: 1 }],                     // Houndoom: quema
    230: ['whirlpool', 'Hidrobomba', { st: 'water' }],                                              // Kingdra: remolino
    248: ['strikes', 'Roca Afilada', { st: 'rock', n: 10, pat: 'around', w: 'sand', rubble: 1 }],   // Tyranitar: quedan rocas
    282: ['strikes', 'Fuerza Lunar', { st: 'moon', pat: 'rings' }],                                 // Gardevoir: anillos que se cierran
    289: ['truant', 'Ausente', { st: 'normal', name2: 'Gigaimpacto' }],                             // Slaking
    350: ['wave', 'Hidropulso', { st: 'water', n: 3, heal: 0.08 }],                                 // Milotic: y se cura
    373: ['strikes', 'Cometa Draco', { st: 'meteor', n: 5, pat: 'around', r: 58, split: 1 }],       // Salamence: se parten
    376: ['fists', 'Puño Meteoro', { st: 'meteor', kind: 'square' }],                               // Metagross: en cuadrado
    392: ['dashes', 'Envite Ígneo', { st: 'fire', n: 3, trail: 'fire', recoil: 1 }],                // Infernape: se hace daño
    445: ['shadow', 'Excavar', { st: 'dig', w: 'sand', quake: 1 }],                                 // Garchomp: y terremoto
    448: ['orbs', 'Esfera Aural', { st: 'aura', n: 1, big: 1 }],                                    // Lucario: una que no te pierde
    475: ['lines', 'Psicocorte', { st: 'psy', pat: 'x' }],                                          // Gallade: en aspa
    635: ['beam', 'Pulso Dragón', { st: 'dragon', kind: 'triple' }],                                // Hydreigon
    637: ['strikes', 'Danza Llama', { st: 'fire', n: 12, pat: 'spiral', quiver: 1 }],               // Volcarona: y va más rápida
    658: ['volley', 'Shuriken de Agua', { st: 'shuriken' }],                                        // Greninja
    681: ['barrier', 'Escudo Real', { st: 'steel', armor: 0.9, dur: 2.5, blade: 1 }],              // Aegislash: y forma filo
    784: ['wave', 'Fragor Escamas', { st: 'sound', n: 3, gaps: 2, soft: 1 }],                       // Kommo-o: y baja su defensa
    887: ['orbs', 'Dracoflechas', { st: 'dart', n: 2, fast: 1, back: 1 }],                          // Dragapult: van y vuelven
    998: ['dashes', 'Asalto Espadón', { st: 'ice', n: 1, big: 1, exposed: 1 }]                      // Baxcalibur: y queda expuesto
  };

  // El resto de jefes del calendario: según su tipo (con dos tipos, a veces el segundo).
  const BY_TYPE = {
    normal: ['beam', 'Hiperrayo', { st: 'normal', kind: 'single' }],
    fire: ['strikes', 'Llamarada', { st: 'fire', n: 8, pat: 'star', r: 40 }],
    water: ['wave', 'Surf', { st: 'water', n: 2 }],
    grass: ['lines', 'Planta Feroz', { st: 'leaf', pat: 'radial', n: 6 }],
    electric: ['strikes', 'Trueno', { st: 'bolt', n: 9, pat: 'around' }],
    ice: ['wave', 'Ventisca', { st: 'ice', n: 2, slow: 1.2 }],
    fighting: ['fists', 'A Bocajarro', { st: 'fist', n: 6 }],
    poison: ['pools', 'Onda Tóxica', { st: 'toxic', n: 4 }],
    ground: ['quake', 'Terremoto', { st: 'sand', dir: 'out' }],
    flying: ['skyfall', 'Pájaro Osado', { st: 'wind', n: 2 }],
    psychic: ['orbs', 'Psicocarga', { st: 'psy', n: 4 }],
    bug: ['orbs', 'Al Ataque', { st: 'bug', n: 6 }],
    rock: ['strikes', 'Avalancha', { st: 'rock', n: 10, pat: 'line' }],
    ghost: ['shadow', 'Golpe Fantasma', { st: 'shadow' }],
    dragon: ['strikes', 'Cometa Draco', { st: 'meteor', n: 9, pat: 'around' }],
    dark: ['lines', 'Tajo Umbrío', { st: 'dark', pat: 'star', n: 4 }],
    steel: ['barrier', 'Defensa Férrea', { st: 'steel', armor: 0.75, dur: 3, burst: 2 }],
    fairy: ['wave', 'Brillo Mágico', { st: 'fairy', n: 2, gaps: 2 }]
  };
  /*
   * Su toque, según sus estadísticas (sólo los de BY_TYPE): rápido (después corre más
   * unos segundos), fuerte (al acabar, un pisotón donde está), de ataque especial (un
   * anillo de disparos) o duro (aguanta más mientras la usa).
   */
  function flavorOf(dex) {
    const p = G.DEX_BY && G.DEX_BY[dex];
    if (!p) return 'phys';
    if ((p.spd || 0) >= 125) return 'fast';
    if (((p.df || 0) + (p.sd || 0)) / 2 >= 95) return 'bulk';
    return (p.sa || 1) > (p.pa || 1) ? 'spec' : 'phys';
  }

  /** Firma de una especie (para la tabla de la documentación y las pruebas). */
  function forDex(dex, types) {
    const d = SIG[dex];
    if (d) return { p: d[0], name: d[1], o: Object.assign({}, d[2]) };
    const T = types && types.length ? types : ['normal'], h = G.U.hash(dex, 13, 5);
    const a = BY_TYPE[T[0]] || BY_TYPE.normal, b = T[1] && BY_TYPE[T[1]];
    const pick = b && b[0] !== a[0] && h < 0.4 ? b : a;
    const o = Object.assign({}, pick[2]);
    if (o.n) o.n = Math.max(2, o.n + (Math.floor(h * 1000) % 3) - 1);   // un poco distinto en cada especie
    o.fl = flavorOf(dex);
    return { p: pick[0], name: pick[1], o };
  }

  // ---------------- estado ----------------

  let fields = [], marks = [], jobs = [], clock = 0, grpN = 1000000;
  const hides = new Map();          // id del jefe -> marca 'hide' (no se dibuja ni se le puede dar)
  const nextGrp = () => ++grpN;
  // Bot de las pruebas (y quien quiera saberlo): campos que hacen daño ahora.
  const DMGF = new Set(['pool', 'band', 'wave', 'ring', 'cage', 'orb', 'sweep', 'box', 'spin']);
  // Tu Pokémon: lo que le han hecho las firmas (ver el comentario de arriba).
  const ps = { stun: 0, sk: 'zz', imm: 0, conf: 0, burn: 0, bd: 0, bt: 0, yawn: 0, kx: 0, ky: 0, kt: 0, lx: null, ly: null, vx: 0, vy: 0, ice: 0, nap: 0 };
  function resetPs() { Object.assign(ps, { stun: 0, imm: 0, conf: 0, burn: 0, bd: 0, bt: 0, yawn: 0, kt: 0, lx: null, ly: null, vx: 0, vy: 0, ice: 0, nap: 0 }); }

  function clear() { fields = []; marks = []; jobs = []; hides.clear(); resetPs(); }

  /** Jugadores vivos (en grupo, todos los que ve quien manda). */
  function living() { const ps2 = G.Game.everyone().filter(p => p && !p.dead); return ps2.length ? ps2 : [G.Game.player].filter(Boolean); }
  function nearest(x, y) { let b = null, bd = Infinity; for (const p of living()) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; b = p; } } return b; }
  const uidOf = p => (p && p.uid) || 'me';
  function playerBy(u) { const all = G.Game.everyone(); return all.find(p => p && uidOf(p) === u) || null; }

  // ---------------- inicio, ritmo y lanzamiento (sólo quien manda) ----------------

  /** Al crear la IA de un jefe (bossInit): su firma y cuándo la usa la primera vez. */
  function init(e) {
    e.sig = forDex(e.dex, e.types);
    e.sigK = 1;
    e.ai.sigT = G.U.rand(4.5, 6) + (e.legend ? (e.id % 3) * 2.5 : 0);
  }
  function interval(e) {
    const F = e.ai && e.ai.fury;
    return (F ? G.U.rand(9.5, 11.5) : G.U.rand(13, 16)) * (1 + 0.45 * (e.crowd() - 1));
  }
  /** ¿Le toca ya? (lo llama bossMove con su ritmo k). */
  function due(e, dt, k, dist) {
    const ai = e.ai;
    if (!e.sig || ai.sigT == null) return false;
    ai.sigT -= dt * k;
    return ai.sigT <= 0 && dist < 560 && ai.cd < 1.5;
  }

  function at(c, t, fn) {
    let i = c.q.length;
    while (i > 0 && c.q[i - 1][0] > t) i--;
    c.q.splice(i, 0, [t, fn]);
  }

  /** Empieza la firma (s: otra, para Metrónomo). */
  function start(e, pl, s = null) {
    const ai = e.ai, sig = s || e.sig;
    const [col, col2] = colOf(sig.o.st, e.atkType);
    const c = ai.cast = { id: 'sig', t: 0, end: 1.6, q: [], mv: null, s: sig, F: !!ai.fury, col, col2,
                          less: [1, 1, 0.85, 0.7][Math.min(3, e.crowd())] };
    ai.last = 'sig';
    label(e, sig.name, col);
    if (!s && !e.sigSaid) { e.sigSaid = true; G.Spawner.say('¡' + e.name + ' usó ' + sig.name + '!', 2.4, false, { col }); }
    if (sig.o.w) weather(sig.o.w);
    try { (P[sig.p] || P.strikes)(e, pl, c, sig.o); } catch (err) { console.warn('[BossSig]', sig.p, err); c.end = 0.5; }
    if (sig.o.fl) flavor(e, pl, c, sig.o.fl);
    G.Audio.sfx('boss');
  }

  /** Cada fotograma de la firma (lo llama bossCast). Devuelve [vx, vy, animación]. */
  function cast(e, dt, pl, c) {
    c.t += dt;
    while (c.q.length && c.q[0][0] <= c.t) {
      const fn = c.q.shift()[1];
      try { fn(); } catch (err) { console.warn('[BossSig]', err); }
      if (e.ai.cast !== c) return [0, 0, 'Idle'];          // (Metrónomo: ya empezó otra)
    }
    const mv = c.mv ? c.mv(dt, pl) : null;
    if (c.t >= c.end) {
      e.sigK = 1;
      if (e.sigHide) hide(e, false);
      if (c.onEnd) c.onEnd();
      e.ai.sigT = interval(e);
      return e.bossEnd();
    }
    if (mv) return mv;
    if (c.face !== false && pl) e.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - e.y, pl.x - e.x));
    return [0, 0, 'Idle'];
  }

  // ---------------- ayudas (quien manda) ----------------

  function hz(e, c, o) { e.hazard(Object.assign({ type: e.atkType, color: c.col }, o)); }
  function weather(kind) {
    const cur = G.Weather.current;
    if (cur && cur.kind === kind) return;
    if (auth() && G.Weather.KINDS[kind]) G.Weather.debugStart(kind, 22);
  }
  /** Campo o marca: aquí y, si mandas en un grupo, a los demás. Devuelve el de aquí. */
  function emit(o) {
    const m = add(o);
    if (G.Coop.isHost) G.Coop.broadcast(['bsg', o]);
    return m;
  }
  function label(e, txt, col) { emit({ k: 'label', id: e.id, x: Math.round(e.x), y: Math.round(e.y - e.bodyH), txt, col, dur: 1.9 }); }
  function hide(e, on) { e.sigHide = on; emit({ k: 'hide', id: e.id, dur: on ? 20 : 0 }); }
  function job(e, t, fn) { jobs.push({ e, at: clock + t, fn }); }
  function freeNear(e, x, y) {
    if (e.flying || G.World.isFree(x, y, Math.min(e.r, 22))) return [x, y];
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, d = 30 + i * 6, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (G.World.isFree(px, py, Math.min(e.r, 22))) return [px, py]; }
    return [e.x, e.y];
  }
  const ang = (e, p) => Math.atan2(p.y - e.y, p.x - e.x);
  const R = Math.round;
  /** Lo que te deja un golpe (dormido, congelado, confuso, quemado, con sueño, lanzado): ver zap. */
  function zap(o) { emit(Object.assign({ k: 'zap', dur: (o.delay || 0) + 0.2 }, o)); }
  /** Disparo de jefe desde otro sitio (esquirlas, copias de Gengar...). */
  function shotAt(e, x, y, a, sp, k, r = 8, life = 2.4) {
    if (G.Projectiles.count > 480) return;
    const type = e.atkType;
    const shot = G.Projectiles.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: e.shotDmg() * k, r, life, friendly: false, color: '#ff7a9e',
                                       mtype: type, cat: e.cat, vis: G.VFX.forType(type) });
    if (G.Coop.isHost) G.Coop.enemyShot(shot, type);
  }
  /** Se cura una parte de su vida (con su número verde). */
  function heal(e, frac) {
    if (e.dead || !auth()) return;
    const a = Math.round(e.maxHp * frac);
    e.hp = Math.min(e.maxHp, e.hp + a);
    G.FX.dmgText(e.x, e.y - e.bodyH - 6, '+' + a, '#7dffb0', true);
    G.FX.ring(e.x, e.y, 8, e.r * 4, '#7dffb0', 0.45, 3);
    if (G.Coop.isHost) G.Coop.broadcast(['fxr', R(e.x), R(e.y), R(e.r * 4), '#7dffb0']);
  }
  /** Queda expuesto t s (recibe k veces el daño): Asalto Espadón, Hiperrayo, Sofoco... */
  function expose(e, k, t) {
    e.sigVulnK = k;
    emit({ k: 'tired', id: e.id, dur: t });
    job(e, t, () => { e.sigVulnK = 1; });
  }
  /** Más rápido un rato (sin pasarse si ya lo estaba). */
  function haste(e, k, t) {
    if (e.sigSpdUp) return;
    e.sigSpdUp = k; e.spd *= k;
    job(e, t, () => { if (e.sigSpdUp) { e.spd /= e.sigSpdUp; e.sigSpdUp = 0; } });
  }

  // ---------------- las piezas ----------------
  // Cada una prepara su ataque en c (c.q: lo que pasa y cuándo; c.mv: cómo se mueve;
  // c.end: cuándo acaba). Daño a partir de shotDmg (como sus otros ataques de lejos).

  const P = {};

  /** Grietas desde el jefe (con una hacia ti) que dejan el suelo ardiendo (o seco: frena). */
  P.fissure = (e, pl, c, o) => {
    const n = (o.n || 5) + (c.F ? 2 : 0), a0 = ang(e, pl), len = 400, x = e.x, y = e.y, g = nextGrp();
    e.anim.play('Charge', { speed: 1.1 }); e.tell(c.col, e.r * 3, 0.9);
    const as = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + i * TAU / n; as.push(a);
      hz(e, c, { kind: 'beam', x, y, angle: a, len, w: 30, delay: 1.0 + i * 0.05, dmg: e.shotDmg() * 1.15, grp: g });
    }
    at(c, 1.1, () => {
      e.anim.play('Attack', { speed: 1.3 }); G.Camera.kick(0.5);
      const dry = o.st === 'sand';
      for (const a of as) emit({ k: 'band', x: R(x), y: R(y), x2: R(x + Math.cos(a) * len), y2: R(y + Math.sin(a) * len),
                                 w: 30, dur: 6, st: o.st, col: c.col, col2: c.col2, dot: dry ? 0 : R(e.shotDmg() * 0.22), slow: dry ? 1 : 0, type: e.atkType, cat: e.cat });
    });
    c.end = 1.7;
  };

  /** Inunda alrededor del jefe (frena) y lanza ondas con un hueco. */
  P.flood = (e, pl, c, o) => {
    const r = o.r || 240, n = (o.waves || 3) + (c.F ? 1 : 0);
    e.anim.play('Charge', { speed: 1.1 }); e.tell(c.col, e.r * 3, 0.8);
    emit({ k: 'pool', x: R(e.x), y: R(e.y), r, dur: 8, delay: 0.4, st: 'water', col: c.col, col2: c.col2, slow: 1 });
    let g = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const at0 = 0.8 + i * 0.6, gap = g;
      at(c, at0, () => {
        const m = R(16 * c.less);
        for (let j = 0; j < m; j++) { const a = gap + j / m * TAU; if (Math.abs(((a - gap) % TAU)) < 0.5) continue; e.fire(a, 130, 0.7, 9, 3.6); }
        e.anim.play('Shoot');
      });
      g += G.U.rand(1.2, 2.2);
    }
    c.end = 0.8 + n * 0.6 + 0.2;
  };

  /** Barrera: casi no recibe daño unos segundos y luego estalla en anillos (o atrae, o embiste, o tajos). */
  P.barrier = (e, pl, c, o) => {
    const D = (o.dur || 4) * (c.F ? 1.15 : 1);
    e.sigK = 1 - (o.armor || 0.85);
    emit({ k: 'bubble', id: e.id, dur: D, col: c.col });
    e.anim.play('Charge', { speed: 0.8 });
    let end = D + 0.3;
    // Masa Cósmica: mientras dura te atrae hacia él.
    if (o.pull) emit({ k: 'push', x: R(e.x), y: R(e.y), r: 520, rad: 1, f: -62, dur: D, delay: 0.4, st: 'psy', col: c.col });
    if (o.burst) {
      const rings = o.burst + (c.F ? 1 : 0), T0 = e.atkType;
      at(c, D, () => {
        e.sigK = 1; if (o.name2) label(e, o.name2, c.col); G.FX.ring(e.x, e.y, e.r, e.r * 5, c.col, 0.5, 5);
        // Mewtwo: la onda te aparta de golpe.
        if (o.blow) emit({ k: 'push', x: R(e.x), y: R(e.y), r: 300, rad: 1, f: 420, dur: 0.45, st: 'psy', col: c.col });
      });
      const TERA = ['fire', 'water', 'grass', 'electric', 'ice', 'dragon', 'fairy', 'psychic'];
      for (let r = 0; r < rings; r++) {
        at(c, D + 0.05 + r * 0.35, () => {
          if (o.tera) e.atkType = TERA[(r + (e.id | 0)) % TERA.length];        // Teraclúster: cada anillo de un tipo
          const n = R(18 * c.less), off = (r % 2) * Math.PI / n;
          for (let i = 0; i < n; i++) e.fire(off + i / n * TAU, 165, 0.75);
          if (o.tera) e.atkType = T0;
          e.anim.play('Shoot');
        });
      }
      end = D + rings * 0.35 + 0.3;
    }
    // Embate Supremo: al bajar la barrera, embiste con el escudo.
    if (o.rush) at(c, D, () => { e.sigK = 1; P.dashes(e, pl, c, { n: 1, big: 1, st: 'steel' }); c.end = c.t + 1.4; });
    // Escudo Real: al bajar la barrera, forma filo y tajos en estrella.
    if (o.blade) at(c, D, () => { e.sigK = 1; const s = c.t; P.lines(e, pl, c, { st: 'blade', pat: 'star', n: 3 }); c.end = s + 1.6; });
    c.end = end;
  };

  /** Se eleva (no se le puede dar) y cae en picado donde estás, varias veces. */
  P.skyfall = (e, pl, c, o) => {
    const n = (o.n || 3) + (c.F ? 1 : 0), r = o.r || 78;
    e.anim.play('Charge', { speed: 1.3 });
    at(c, 0.35, () => { hide(e, true); emit({ k: 'rise', x: R(e.x), y: R(e.y), dex: e.dex, sc: e.scale, sh: e.shiny ? 1 : 0, dur: 0.5, col: c.col }); });
    for (let i = 0; i < n; i++) {
      const t0 = 0.8 + i * 1.05;
      at(c, t0, () => {
        const p = nearest(e.x, e.y) || pl, x = R(p.x), y = R(p.y);
        hz(e, c, { kind: 'zone', x, y, r, delay: 0.85, dmg: e.shotDmg() * 1.35, grp: nextGrp() });
        emit({ k: 'dive', x, y, at: 0.85, dex: e.dex, sc: e.scale, sh: e.shiny ? 1 : 0, col: c.col, dur: 1.3 });
        at(c, t0 + 0.85, () => {
          [e.x, e.y] = freeNear(e, x, y);
          G.Camera.kick(0.35);
          if (o.trail) emit({ k: 'pool', x, y, r: R(r * 0.85), dur: 4.5, st: o.trail, col: c.col, col2: c.col2,
                              dot: o.trail === 'fire' ? R(e.shotDmg() * 0.2) : 0, slow: o.trail === 'dark' ? 1 : 0, type: e.atkType, cat: e.cat });
          // Moltres: de cada caída sale un anillo de fuego con un hueco.
          if (o.ring) emit({ k: 'wave', x, y, r0: R(r * 0.6), spd: 190, th: 18, gaps: [Math.round(Math.random() * 628) / 100], gw: 0.5, delay: 0.1,
                             dur: 2.2, dmg: R(e.shotDmg() * 0.8), st: 'fire', col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
          // Yveltal: se cura con cada caída.
          if (o.drain) heal(e, 0.025);
        });
      });
    }
    c.end = 0.8 + n * 1.05 + 0.25;
    c.face = false;
    c.onEnd = () => { e.landT = 1.5; };
  };

  /** Puntos de un patrón alrededor de los jugadores (lo que cae del cielo). [x, y, retraso] */
  function pattern(e, pl, o, n, d0) {
    const ps2 = living(), pts = [];
    switch (o.pat) {
      case 'ring':
        for (const p of ps2) {
          const k = Math.max(5, R(n / ps2.length)), a0 = Math.random() * TAU;
          for (let i = 0; i < k; i++) { const a = a0 + i / k * TAU; pts.push([p.x + Math.cos(a) * 96, p.y + Math.sin(a) * 96 * 0.8, d0 + i * 0.07]); }
          pts.push([p.x, p.y, d0 + k * 0.07 + 0.3]);
        }
        break;
      case 'spiral': {
        const p = pl, a0 = Math.random() * TAU, dir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < n; i++) { const k = i / n, Rr = 230 * (1 - k) + 14; pts.push([p.x + Math.cos(a0 + i * 0.85 * dir) * Rr, p.y + Math.sin(a0 + i * 0.85 * dir) * Rr * 0.8, 0.6 + i * 0.11]); }
        break;
      }
      case 'grid': {
        const p = pl, S = 62;
        for (let gx = -3; gx <= 3; gx++) for (let gy = -2; gy <= 2; gy++) pts.push([p.x + gx * S, p.y + gy * S * 0.85, d0 + (((gx + gy) & 1) ? 0.8 : 0)]);
        break;
      }
      case 'line': {
        const a = ang(e, pl), D = Math.max(80, Math.min(520, Math.hypot(pl.x - e.x, pl.y - e.y) + 60));
        for (let i = 0; i < n; i++) { const d = 40 + i * (D - 40) / Math.max(1, n - 1); pts.push([e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 0.5 + i * 0.12]); }
        break;
      }
      case 'lanes': {
        // Tres filas que avanzan desde el jefe hacia ti (Fuerza Telúrica).
        const a = ang(e, pl), D = Math.max(260, Math.min(540, Math.hypot(pl.x - e.x, pl.y - e.y) + 120));
        for (const s of [-0.36, 0, 0.36]) for (let i = 0; i < 8; i++) { const d = 50 + i * (D - 50) / 7; pts.push([e.x + Math.cos(a + s) * d, e.y + Math.sin(a + s) * d, 0.55 + i * 0.13 + Math.abs(s) * 0.4]); }
        break;
      }
      case 'rows': {
        // Filas de rayos que cruzan la vista de un lado a otro (Electormenta).
        const p = pl, dir = Math.random() < 0.5 ? -1 : 1;
        for (let r = -1; r <= 1; r++) for (let i = 0; i < 8; i++) { const k = dir > 0 ? i : 7 - i; pts.push([p.x + (k - 3.5) * 62, p.y + r * 64, 0.7 + i * 0.1 + (r + 1) * 0.35]); }
        break;
      }
      case 'star': {
        // Estrella de cinco puntas a tu alrededor (Deseo Oculto, Llamarada).
        const p = pl, a0 = -Math.PI / 2 + G.U.rand(-0.4, 0.4), V = [];
        for (let i = 0; i < 10; i++) { const rr = i % 2 ? 58 : 150, a = a0 + i * Math.PI / 5; V.push([p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.85]); }
        const m = Math.max(10, n);
        for (let i = 0; i < m; i++) { const u = i / m * 10, j = Math.floor(u), f = u - j, A = V[j], B = V[(j + 1) % 10]; pts.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, d0 + i * 0.05]); }
        pts.push([p.x, p.y, d0 + m * 0.05 + 0.35]);
        break;
      }
      case 'rings': {
        // Anillos que se cierran sobre ti (Fuerza Lunar de Gardevoir).
        const p = pl;
        [[170, 9, 0.9], [112, 7, 1.35], [56, 5, 1.8]].forEach(([rr, k, d], j) => { const a0 = j * 0.4; for (let i = 0; i < k; i++) { const a = a0 + i / k * TAU; pts.push([p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.85, d]); } });
        pts.push([p.x, p.y, 2.25]);
        break;
      }
      default:
        for (const p of ps2) {
          const k = Math.max(3, R(n / ps2.length));
          for (let i = 0; i < k; i++) { const a = Math.random() * TAU, d = i ? G.U.rand(30, 170) : 0; pts.push([p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.8, d0 + i * 0.11]); }
        }
    }
    return pts;
  }

  /** Cosas que caen del cielo (rayos, meteoros, estrellas, pilares...) en un patrón. */
  const PLATES = ['fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  P.strikes = (e, pl, c, o) => {
    const st = o.st || 'rock', r = o.r || 44, d0 = o.delay || 1.0, g = nextGrp();
    let n0 = o.n || 8;
    // Estallido: cuanta más vida le queda, más géiseres.
    if (o.byHp) n0 = R(5 + 9 * G.U.clamp(e.hp / e.maxHp, 0, 1));
    // Sentencia: cambia de tabla (tipo) y caen pilares de ese tipo.
    if (o.plate) { const t = G.U.pick(PLATES.filter(x => x !== e.atkType)); e.atkType = t; emit({ k: 'tswap', id: e.id, type: t, dur: 0.1 }); c.col = G.U.TYPE_COLOR[t] || c.col; }
    const n = Math.max(3, R(n0 * (c.F ? 1.3 : 1) * c.less)), pts = pattern(e, pl, o, n, d0);
    const Rr = pts.map(() => r);
    if (o.big) { pts.push([pl.x, pl.y, Math.max(...pts.map(q => q[2])) + 0.5]); Rr.push(r * 1.8); }
    const k = o.pat === 'rows' || o.pat === 'lanes' || o.pat === 'rings' ? 0.9 : 1.05;
    pts.forEach(([x, y, d], i) => hz(e, c, { kind: 'zone', x, y, r: Rr[i], delay: d, dmg: e.shotDmg() * (Rr[i] > r ? 1.6 : k), grp: g, vis: st === 'pillar' ? 'pillar' : undefined }));
    emit({ k: 'sky', st, col: c.col, col2: c.col2, pts: pts.slice(0, 48).map(([x, y, d]) => [R(x), R(y), R(d * 100) / 100]), dur: Math.max(...pts.map(q => q[2])) + 0.5 });
    // Lo que deja cada uno al caer.
    pts.forEach(([x, y, d], i) => {
      const X = R(x), Y = R(y);
      if (o.burn) zap({ x: X, y: Y, r: Rr[i], delay: d, eff: 'burn', p: R(e.shotDmg() * 0.12) });
      if (o.blow) zap({ x: X, y: Y, r: Rr[i] + 6, delay: d, eff: 'knock', p: 360 });
      if (o.embers && i % 2 === 0) job(e, d, () => emit({ k: 'pool', x: X, y: Y, r: 34, dur: 4, st: 'fire', col: c.col, col2: c.col2, dot: R(e.shotDmg() * 0.18), type: e.atkType, cat: e.cat }));
      if (o.spikes && i % 2 === 0) job(e, d, () => emit({ k: 'pool', x: X, y: Y, r: 30, dur: 5, st: 'ice', col: c.col, col2: c.col2, slow: 1, spk: 1 }));
      if (o.rubble && i % 2 === 0) job(e, d, () => emit({ k: 'pool', x: X, y: Y, r: 32, dur: 6, st: 'sand', col: '#b89a6a', col2: '#efe0bc', slow: 1, spk: 2 }));
      if (o.shards) job(e, d + 0.05, () => { for (let j = 0; j < 6; j++) shotAt(e, X, Y, j / 6 * TAU + i, 150, 0.55, 7, 1.6); });
      if (o.split) job(e, d, () => {
        const g2 = nextGrp(), sub = [];
        for (let j = 0; j < 4; j++) { const a = j / 4 * TAU + 0.6, sx = X + Math.cos(a) * 70, sy = Y + Math.sin(a) * 56; sub.push([R(sx), R(sy), 0.6]); hz(e, c, { kind: 'zone', x: sx, y: sy, r: 30, delay: 0.6, dmg: e.shotDmg() * 0.7, grp: g2 }); }
        emit({ k: 'sky', st: 'rock', col: c.col, col2: c.col2, pts: sub, dur: 1.1 });
      });
    });
    e.anim.play(o.pat === 'line' || o.pat === 'lanes' ? 'Attack' : 'Shoot'); e.tell(c.col, e.r * 2.6, 0.5);
    c.end = Math.min(2.4, 0.9 + n * 0.06);
    // Anillo Ígneo (Charizard): al cerrarse, un estallido de fuego desde él.
    if (o.burst) at(c, 1.4, () => { const m = R(14 * c.less); for (let i = 0; i < m; i++) e.fire(i / m * TAU, 170, 0.7); e.anim.play('Attack'); });
    // Sofoco: después queda expuesta.  Danza Llama: después, más rápida.
    if (o.spent) c.onEnd = () => expose(e, 1.35, 4);
    if (o.quiver) c.onEnd = () => { haste(e, 1.3, 7); emit({ k: 'aura', id: e.id, dur: 7, col: c.col }); };
  };

  /** Celebi: Premonición, relojes donde estuviste que estallan un poco después. */
  P.echo = (e, pl, c, o) => {
    const g = nextGrp(), n = (o.n || 8) + (c.F ? 2 : 0);
    e.anim.play('Charge', { speed: 1.2 }); e.tell(c.col, e.r * 2.6, 0.6);
    for (let i = 0; i < n; i++) at(c, 0.3 + i * 0.3, () => {
      for (const p of living()) {
        const x = R(p.x), y = R(p.y);
        hz(e, c, { kind: 'zone', x, y, r: 42, delay: 1.5, dmg: e.shotDmg() * 0.95, grp: g });
        emit({ k: 'sky', st: 'time', col: c.col, col2: c.col2, pts: [[x, y, 1.5]], dur: 1.9 });
      }
    });
    c.end = 0.5 + n * 0.3;
  };

  /** Zapdos: nubes de tormenta que te persiguen y descargan rayos debajo (sigue mientras ataca). */
  P.storm = (e, pl, c, o) => {
    const n = (o.n || 3) + (c.F ? 1 : 0), clouds = [], ps2 = living();
    e.anim.play('Charge', { speed: 1.1 }); e.tell(c.col, e.r * 3, 0.6);
    for (let i = 0; i < n; i++) {
      const tg = ps2[i % ps2.length], a = i / n * TAU + Math.random(), d = 170;
      clouds.push(emit({ k: 'cloud', x: R(tg.x + Math.cos(a) * d), y: R(tg.y + Math.sin(a) * d * 0.8), tg: uidOf(tg), spd: 62, dur: 6.2, col: c.col }));
    }
    for (let j = 0; j < 6; j++) job(e, 1.1 + j * 0.8, () => {
      const g = nextGrp();
      clouds.forEach((m, i) => {
        if (!m || (j + i) % 2 && j < 5) return;            // (de una en una, alternas; la última vez, todas)
        const x = R(m.x), y = R(m.y);
        hz(e, c, { kind: 'zone', x, y, r: 46, delay: 0.55, dmg: e.shotDmg() * 1.05, grp: g });
        emit({ k: 'sky', st: 'bolt', col: c.col, col2: c.col2, pts: [[x, y, 0.55]], dur: 1 });
      });
    });
    at(c, 0.6, () => e.anim.play('Shoot'));
    c.end = 1.2;
  };

  /** Ondas que crecen desde el jefe con uno o dos huecos por donde pasar (o que van y vuelven). */
  P.wave = (e, pl, c, o) => {
    const n = (o.n || 3) + (c.F ? 1 : 0), gaps = o.gaps || 1, spd = o.spd || 165;
    e.anim.play('Charge', { speed: 1.2 }); e.tell(c.col, e.r * 3, 0.7);
    let g0 = Math.random() * TAU;
    const eff = o.freeze ? 'freeze' : o.sleep ? 'sleep' : '';
    for (let i = 0; i < n; i++) {
      const gs = []; for (let j = 0; j < gaps; j++) gs.push(R((g0 + j * TAU / gaps) * 100) / 100);
      const life = o.back ? 2.8 : 560 / spd;
      emit({ k: 'wave', x: R(e.x), y: R(e.y), r0: R(e.r + 6), spd, th: 22, gaps: gs, gw: 0.36, delay: 0.7 + i * 0.8, back: o.back ? 1.4 : 0,
             dur: 0.7 + i * 0.8 + life, dmg: R(e.shotDmg() * 1.1), slow: o.slow || 0, eff, st: o.st, col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
      g0 += G.U.rand(1.4, 2.4) * (Math.random() < 0.5 ? -1 : 1);
    }
    at(c, 0.7, () => e.anim.play('Attack'));
    let end = 0.7 + (n - 1) * 0.8 + 0.4;
    // Ventisca (Articuno): placas de hielo alrededor de cada uno: resbalas.
    if (o.ice) at(c, 0.9, () => { for (const p of living()) for (let i = 0; i < 3; i++) { const a = Math.random() * TAU, d = i ? G.U.rand(70, 150) : G.U.rand(0, 30);
      emit({ k: 'pool', x: R(p.x + Math.cos(a) * d), y: R(p.y + Math.sin(a) * d * 0.8), r: 62, dur: 7, delay: 0.5, st: 'ice', col: '#bff3ff', col2: '#ffffff', slide: 1 }); } });
    // Hidropulso (Milotic): y se cura.  Fragor Escamas (Kommo-o): y baja su defensa.
    if (o.heal) at(c, end - 0.1, () => heal(e, o.heal));
    if (o.soft) c.onEnd = () => expose(e, 1.3, 4);
    // Canto Arcaico (Meloetta): cambia a forma Danza y embiste dos veces.
    if (o.dance) { at(c, end, () => { emit({ k: 'form', id: e.id, dur: 3, col: '#ffb070' }); P.dashes(e, pl, c, { n: 2, st: 'fist' }); }); end += 0.1; c.end = 99; return; }
    c.end = end;
  };

  /** Suicune: Surf, una ola que cruza la arena de lado a lado (con un hueco por donde pasar). */
  P.surf = (e, pl, c, o) => {
    const n = (o.n || 2) + (c.F ? 1 : 0), p = nearest(e.x, e.y) || pl;
    e.anim.play('Charge', { speed: 1.1 }); e.tell(c.col, e.r * 3, 0.7);
    let a = ang(e, p);
    for (let i = 0; i < n; i++) {
      const ax = Math.cos(a), ay = Math.sin(a), back = 300;
      // Empieza detrás de ti visto desde el jefe... no: detrás del jefe, y cruza hasta pasarte.
      const sx = p.x - ax * back, sy = p.y - ay * back, gap = R(G.U.rand(-150, 150));
      emit({ k: 'sweep', x: R(sx), y: R(sy), ax: R(ax * 100) / 100, ay: R(ay * 100) / 100, spd: 210, L: 560, th: 36, gap, gw: 52,
             delay: 0.8 + i * 1.3, dur: 0.8 + i * 1.3 + 3.1, dmg: R(e.shotDmg() * 1.25), slow: 1, st: 'water', col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
      a += Math.PI * (i % 2 ? 0.5 : 1) + G.U.rand(-0.3, 0.3);
    }
    at(c, 0.8, () => e.anim.play('Attack'));
    c.end = 1.2 + n * 0.4;
  };

  /** Dialga: el tiempo va lento para vosotros y dispara un rayo enorme. */
  P.timewarp = (e, pl, c, o) => {
    emit({ k: 'clock', id: e.id, x: R(e.x), y: R(e.y - e.bodyH * 0.5), dur: 3.4 });
    emit({ k: 'slowall', x: R(e.x), y: R(e.y), r: 1200, dur: 3.0, delay: 0.3 });
    e.anim.play('Charge', { speed: 0.8 });
    at(c, 0.6, () => {
      const a = ang(e, nearest(e.x, e.y) || pl), g = nextGrp();
      hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: a, len: 760, w: 64, delay: 1.4, dmg: e.shotDmg() * 1.9, grp: g });
      if (c.F) for (const s of [-0.6, 0.6]) hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: a + s, len: 760, w: 40, delay: 1.7, dmg: e.shotDmg() * 1.4, grp: g });
    });
    at(c, 2.0, () => { e.anim.play('Shoot'); G.Camera.kick(0.6); });
    c.end = 2.5;
  };

  /** Tajos o rayos en un patrón (estrella que pasa por ti, cruz que gira, cañones en paralelo, V, cuadrícula, zigzag...). */
  const DRIVE = [['fire', '#ff7a2e'], ['water', '#4fa8ff'], ['electric', '#ffd84a'], ['ice', '#8fe4ff']];
  P.lines = (e, pl, c, o) => {
    const n = (o.n || 3) + (c.F ? 1 : 0), g = nextGrp(), list = [], a = ang(e, pl), p = nearest(e.x, e.y) || pl;
    switch (o.pat) {
      case 'cross': for (let s = 0; s < 2; s++) for (let k = 0; k < 4; k++) list.push([e.x, e.y, a + s * Math.PI / 4 + k * Math.PI / 2, 460, 1.0 + s * 0.7, s * 4 + k]); break;
      case 'parallel': for (let i = -1; i <= 1; i++) list.push([e.x - Math.sin(a) * i * 52, e.y + Math.cos(a) * i * 52, a, 560, 0.9 + Math.abs(i) * 0.15]); break;
      case 'v': for (const [s, d] of [[0.22, 0.9], [-0.22, 0.9], [0.5, 1.4], [-0.5, 1.4]]) list.push([e.x, e.y, a + s, 520, d]); break;
      case 'radial': { const a0 = Math.random() * TAU; for (let i = 0; i < n + 2; i++) list.push([e.x, e.y, a0 + i * TAU / (n + 2), 420, 0.9 + i * 0.04]); break; }
      case 'grid': {
        // Cobalion: tres tajos de un lado y luego tres del otro, en cuadrícula sobre ti.
        const L = 520;
        for (let i = -1; i <= 1; i++) list.push([p.x - L / 2, p.y + i * 70, 0, L, 0.8]);
        for (let i = -1; i <= 1; i++) list.push([p.x + i * 80, p.y - L / 2 * 0.8, Math.PI / 2, L * 0.8, 1.45]);
        break;
      }
      case 'zigzag': {
        // Virizion: tajos uno tras otro, cada uno cruzado con el anterior, que te siguen.
        let b = a + Math.PI / 2;
        for (let i = 0; i < n; i++) { const L = 360; list.push([p.x - Math.cos(b) * L / 2 + (i - n / 2) * 10, p.y - Math.sin(b) * L / 2, b, L, 0.7 + i * 0.28]); b += (i % 2 ? -1 : 1) * 1.1; }
        break;
      }
      case 'claw': {
        // Código Cero: tres zarpazos anchos y cortos delante de él, tres veces.
        for (let k = 0; k < 3; k++) for (const s of [-0.45, 0, 0.45]) list.push([e.x, e.y, a + s + (k - 1) * 0.12, 210, 0.7 + k * 0.45, 0, 46]);
        break;
      }
      case 'x': {
        // Gallade: dos tajos en aspa sobre ti, dos veces.
        for (let k = 0; k < 2; k++) for (const s of [Math.PI / 4, -Math.PI / 4]) { const b = s + k * Math.PI / 4, L = 480; list.push([p.x - Math.cos(b) * L / 2, p.y - Math.sin(b) * L / 2, b, L, 0.8 + k * 0.6]); }
        break;
      }
      default: { const a0 = Math.random() * Math.PI; for (let i = 0; i < n; i++) { const b = a0 + i * Math.PI / n, L = 560; list.push([pl.x - Math.cos(b) * L / 2, pl.y - Math.sin(b) * L / 2, b, L, 0.75 + i * 0.2]); } }
    }
    for (const [x, y, an, L, d, ci, w] of list) {
      const dv = o.st === 'drive' ? DRIVE[(ci || 0) % 4] : null;
      hz(e, c, { kind: 'beam', x, y, angle: an, len: L, w: w || o.w || 26, delay: d, dmg: e.shotDmg() * 1.2, grp: g,
                 type: dv ? dv[0] : e.atkType, color: dv ? dv[1] : c.col });
      // Corte Vacío: los cortes se quedan abiertos (queman) unos segundos.
      if (o.open) job(e, d, () => emit({ k: 'band', x: R(x), y: R(y), x2: R(x + Math.cos(an) * L), y2: R(y + Math.sin(an) * L), w: 22, dur: 3.2, st: 'psy',
                                         col: '#ff8ad8', col2: '#ffffff', dot: R(e.shotDmg() * 0.2), type: e.atkType, cat: e.cat }));
    }
    emit({ k: 'slash', st: o.st, col: c.col, list: list.slice(0, 12).map(([x, y, an, L, d]) => [R(x), R(y), R(an * 100) / 100, L, d]),
           dur: Math.max(...list.map(q => q[4])) + 0.8 });
    e.anim.play('Charge', { speed: 1.3 }); at(c, 0.7, () => e.anim.play('Attack', { speed: 1.3 }));
    c.end = Math.min(2.2, Math.max(...list.map(q => q[4])) + 0.3);
    // Hidrocañón: el retroceso le echa hacia atrás.
    if (o.recoil) at(c, 0.95, () => { const b = a + Math.PI; [e.x, e.y] = freeNear(e, e.x + Math.cos(b) * 70, e.y + Math.sin(b) * 70); G.Camera.kick(0.4); });
  };

  /** Keldeo: Sable Místico, un tajo larguísimo que da la vuelta entera a su alrededor. */
  P.whirl = (e, pl, c, o) => {
    const a0 = ang(e, pl) + Math.PI * 0.6, dir = Math.random() < 0.5 ? -1 : 1, n = 18, g = nextGrp(), x = e.x, y = e.y;
    e.anim.play('Charge', { speed: 1.2 }); e.tell(c.col, e.r * 3, 0.7);
    for (let i = 0; i < n; i++) hz(e, c, { kind: 'beam', x, y, angle: a0 + dir * i / n * TAU, len: 330, w: 34, delay: 0.95 + i * 0.07, dmg: e.shotDmg() * 1.2, grp: g });
    at(c, 0.9, () => e.anim.play('Attack', { speed: 1.5 }));
    c.end = 0.95 + n * 0.07 + 0.2;
  };

  /** Se hunde en la sombra (o bajo tierra), te persigue por el suelo y sale debajo de ti. */
  P.shadow = (e, pl, c, o) => {
    const reps = o.n || 1, st = o.st || 'shadow', chase = reps > 1 ? 0.9 : 1.5;
    e.anim.play('Charge', { speed: 1.2 });
    let t = 0.4;
    for (let i = 0; i < reps; i++) {
      const t0 = t;
      at(c, t0, () => {
        hide(e, true);
        const tg = nearest(e.x, e.y) || pl;
        c.lx = e.x; c.ly = e.y; c.ltg = tg; c.lurk = true;
        emit({ k: 'lurk', x: R(e.x), y: R(e.y), tg: uidOf(tg), spd: 175, stop: chase, dur: chase + 0.55, st, col: c.col });
      });
      at(c, t0 + chase, () => {
        c.lurk = false;
        hz(e, c, { kind: 'zone', x: c.lx, y: c.ly, r: 84, delay: 0.5, dmg: e.shotDmg() * 1.45, grp: nextGrp() });
        emit({ k: 'stop', x: R(c.lx), y: R(c.ly), dur: 0.1 });
        // Robasombra (Marshadow): te roba la velocidad un rato.
        if (o.steal) zap({ x: R(c.lx), y: R(c.ly), r: 90, delay: 0.5, eff: 'slow', p: 2.2 });
      });
      at(c, t0 + chase + 0.5, () => {
        [e.x, e.y] = freeNear(e, c.lx, c.ly);
        hide(e, false);
        e.anim.play('Attack', { speed: 1.4 });
        G.Camera.kick(0.45);
        const m = R(10 * c.less);
        for (let j = 0; j < m; j++) e.fire(j / m * TAU, 150, 0.6);
        // Giratina: deja su sombra (frena).  Garchomp: el suelo tiembla en anillos.
        if (o.puddle) emit({ k: 'pool', x: R(e.x), y: R(e.y), r: 96, dur: 5, st: 'shadow', col: c.col, col2: c.col2, slow: 1 });
        if (o.quake) for (let k = 0; k < 2; k++) emit({ k: 'ring', x: R(e.x), y: R(e.y), r1: 90 + k * 90, r2: 180 + k * 90, delay: 0.7 + k * 0.5, dur: 1.4 + k * 0.5,
                                                        dmg: R(e.shotDmg() * 1.1), st: 'sand', col: '#e0bf73', col2: '#fff2cc', type: e.atkType, cat: e.cat });
      });
      t = t0 + chase + 0.8;
    }
    c.mv = dt => {
      if (c.lurk && c.ltg) { const dx = c.ltg.x - c.lx, dy = c.ltg.y - c.ly, d = Math.hypot(dx, dy); if (d > 2) { const s = Math.min(d, 175 * dt); c.lx += dx / d * s; c.ly += dy / d * s; } }
      return null;
    };
    c.end = t + (o.quake ? 1.2 : 0.1); c.face = false;
  };

  /** Viento que te empuja (y luego un rayo, o tornados; el de Tornadus cambia de dirección). */
  P.gale = (e, pl, c, o) => {
    const a = ang(e, pl);
    const blow = (an, t0, d) => emit({ k: 'push', x: R(e.x), y: R(e.y), r: 1200, ax: R(Math.cos(an) * 100) / 100, ay: R(Math.sin(an) * 100) / 100, f: 92, dur: t0 + d, delay: t0, st: o.st, col: c.col });
    if (o.shift) { let b = a; for (let i = 0; i < 3; i++) { blow(b, 0.3 + i * 1.1, 1.1); b += (Math.random() < 0.5 ? -1 : 1) * G.U.rand(1.6, 2.4); } }
    else blow(a, 0.3, 2.9);
    e.anim.play('Charge', { speed: 1.1 });
    for (let i = 0; i < (o.tornado || 0); i++) {
      const p = living()[i % living().length], aa = Math.random() * TAU, d = G.U.rand(60, 160);
      emit({ k: 'pool', x: R(p.x + Math.cos(aa) * d), y: R(p.y + Math.sin(aa) * d), r: 38, dur: 5.5, delay: 0.5, st: 'wind', col: c.col, col2: c.col2,
             dot: R(e.shotDmg() * 0.3), vx: R(G.U.rand(-45, 45)), vy: R(G.U.rand(-35, 35)), tw: 1, pull: o.lure ? 1 : 0, type: e.atkType, cat: e.cat });
    }
    if (o.beam) at(c, 1.0, () => { const p = nearest(e.x, e.y) || pl; hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: ang(e, p), len: 660, w: 46, delay: 1.0, dmg: e.shotDmg() * 1.6, grp: nextGrp() }); });
    at(c, 2.0, () => e.anim.play('Shoot'));
    c.end = 2.4;
  };

  /** Oscuridad: sólo ves cerca de ti, con charcos que te frenan (o te duermen); Lunala, un rayo que barre. */
  P.dark = (e, pl, c, o) => {
    emit({ k: 'dark', x: R(e.x), y: R(e.y), dur: 6.5 });
    for (const p of living()) for (let i = 0; i < (o.n || 4); i++) {
      const a = Math.random() * TAU, d = G.U.rand(50, 140);
      emit({ k: 'pool', x: R(p.x + Math.cos(a) * d), y: R(p.y + Math.sin(a) * d * 0.8), r: 50, dur: 6.5, delay: 0.8, st: o.st || 'dream', col: c.col, col2: c.col2,
             slow: o.sleep ? 0 : 1.2, sleep: o.sleep ? 1 : 0 });
    }
    if (o.sweep) at(c, 0.9, () => {
      const p = nearest(e.x, e.y) || pl, a = ang(e, p), dir = Math.random() < 0.5 ? -1 : 1, g = nextGrp();
      for (let i = 0; i < 12; i++) at(c, 0.9 + i * 0.1, () => hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: a - dir * 0.8 + dir * 1.6 * i / 11, len: 700, w: 48, delay: 0.9, dmg: e.shotDmg() * 1.25, grp: g }));
    });
    e.anim.play('Charge', { speed: 0.9 });
    c.end = o.sweep ? 2.6 : 1.4;
  };

  /** Carga y lanza un rayo enorme (prisma: se divide al final; abanico; triple; que barre; tres que se debilitan). */
  P.beam = (e, pl, c, o) => {
    emit({ k: 'charge', id: e.id, dur: 1.55, col: c.col });
    e.anim.play('Charge', { speed: 0.8 });
    let end = 2.0;
    at(c, 0.25, () => {
      const p = nearest(e.x, e.y) || pl, a = ang(e, p), D = 1.35, d = e.shotDmg(), g = nextGrp();
      const B = (an, len, w, delay, k, x = e.x, y = e.y) => hz(e, c, { kind: 'beam', x, y, angle: an, len, w, delay, dmg: d * k, grp: g });
      switch (o.kind) {
        case 'prism': {
          const L = 300, ex = e.x + Math.cos(a) * L, ey = e.y + Math.sin(a) * L;
          B(a, L, 48, D, 1.6);
          for (let i = -2; i <= 2; i++) B(a + i * 0.42, 340, 22, D + 0.35, 1.1, ex, ey);
          break;
        }
        case 'cone': for (let i = -2; i <= 2; i++) B(a + i * 0.22, 520, 40, D, 1.4); break;
        case 'triple': for (let i = -1; i <= 1; i++) B(a + i * 0.38, 560, 32, D, 1.4); break;
        case 'sweep': {
          const dir = Math.random() < 0.5 ? -1 : 1;
          for (let i = 0; i < 11; i++) at(c, 0.25 + i * 0.08, () => B(a - dir * 0.9 + dir * 1.8 * i / 10, 600, 46, 0.85, 0.9));
          break;
        }
        case 'decay': {
          // Cañón Floral: tres rayos seguidos hacia ti, cada uno más flojo y más estrecho.
          [[2.0, 72], [1.45, 56], [1.0, 40]].forEach(([k, w], i) => at(c, 0.25 + i * 0.75, () => { const q = nearest(e.x, e.y) || pl; hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: ang(e, q), len: 760, w, delay: D - i * 0.3, dmg: d * k, grp: nextGrp() }); }));
          end = 3.4;
          break;
        }
        default: B(a, 760, 72, D, 2.0);
      }
      if (o.pools) for (let i = 0; i < 3; i++) { const q = living()[i % living().length], aa = Math.random() * TAU, dd = G.U.rand(40, 150);
        emit({ k: 'pool', x: R(q.x + Math.cos(aa) * dd), y: R(q.y + Math.sin(aa) * dd), r: 46, dur: 6, delay: 0.6, st: 'toxic', col: '#b45cf0', col2: '#ecc4ff', dot: R(d * 0.22), type: 'poison', cat: e.cat }); }
      // Rayo Solar (Venusaur): mientras carga, Drenadoras: semillas a tu alrededor que te quitan vida y le curan.
      if (o.seeds) {
        for (const q of living()) for (let i = 0; i < 3; i++) { const aa = i / 3 * TAU + Math.random(), dd = G.U.rand(60, 120);
          emit({ k: 'pool', x: R(q.x + Math.cos(aa) * dd), y: R(q.y + Math.sin(aa) * dd * 0.8), r: 40, dur: 6, delay: 0.4, st: 'seed', col: '#7ad850', col2: '#ffe9a0', dot: R(d * 0.16), type: 'grass', cat: e.cat }); }
        for (let i = 1; i <= 4; i++) job(e, i * 1.4, () => heal(e, 0.01));
      }
    });
    if (o.kind === 'sweep') end = 2.3;
    at(c, 1.6, () => { e.anim.play('Shoot'); G.Camera.kick(0.6); });
    // Hiperrayo (Gyarados): luego tiene que descansar (recibe más daño).
    if (o.recharge) c.onEnd = () => expose(e, 1.5, 2.6);
    c.end = end;
  };

  /** Embestidas rapidísimas hacia ti (con su marca) que dejan un rastro. */
  P.dashes = (e, pl, c, o) => {
    const n = (o.n || 3) + (c.F ? 1 : 0), big = !!o.big, len = o.short ? 230 : big ? (o.charge ? 700 : 520) : 380, dur = o.short ? 0.18 : big ? 0.42 : 0.28;
    const w = R(e.r * 2 + (big ? 40 : 14)), wind = o.charge ? 1.4 : o.quick ? 0.26 : o.short ? 0.36 : 0.55;
    c.k = 0; c.ph = 'aim'; c.pt = wind; c.trails = [];
    if (o.ghost) hide(e, true);                                       // Bola Neblina: invisible (sólo se ve su brillo)
    if (o.charge) emit({ k: 'charge', id: e.id, dur: wind, col: c.col });
    const aim = () => {
      const tg = nearest(e.x, e.y) || pl;
      // Velocidad Extrema (Arcanine): aparece de golpe a tu lado y embiste desde ahí.
      if (o.blink) {
        const b = Math.random() * TAU;
        emit({ k: 'portal', x: R(e.x), y: R(e.y), dur: 0.3 });
        [e.x, e.y] = freeNear(e, tg.x + Math.cos(b) * 190, tg.y + Math.sin(b) * 150);
        G.FX.ring(e.x, e.y, 6, 60, c.col, 0.3, 3);
      }
      c.ang = ang(e, tg); c.sx = e.x; c.sy = e.y;
      hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: c.ang, len: len + e.r, w, delay: c.pt + dur, dmg: e.dmg * (big ? 1.6 : o.short ? 0.95 : 1.15), grp: nextGrp() });
      // Megacuerno (Heracross): te lanza por los aires.
      if (o.toss) zap({ x: R(e.x), y: R(e.y), ang: R(c.ang * 100) / 100, len: R(len + e.r), w, delay: c.pt + dur * 0.6, eff: 'knock', p: 520 });
      if (o.ghost) emit({ k: 'glint', id: e.id, x: R(e.x), y: R(e.y), dur: c.pt + dur + 0.1, col: c.col });
      e.anim.play('Charge', { speed: 1.5 });
      e.anim.dir = G.Sprites.dirFromAngle(c.ang);
    };
    aim();
    c.mv = dt => {
      c.pt -= dt;
      if (c.ph === 'aim') { if (c.pt <= 0) { c.ph = 'go'; c.pt = dur; e.anim.play('Attack', { speed: 1.6 }); } return [0, 0, 'Idle']; }
      if (c.ph === 'go') {
        if (c.pt <= 0) {
          if (o.trail) {
            const tr = { k: 'band', x: R(c.sx), y: R(c.sy), x2: R(e.x), y2: R(e.y), w: 30, dur: o.live ? 2.6 : 4, st: o.trail, col: c.col, col2: c.col2,
                         dot: o.trail === 'elec' || o.trail === 'fire' ? R(e.shotDmg() * 0.2) : 0, slow: o.trail === 'water' || o.trail === 'mist' ? 1 : 0, type: e.atkType, cat: e.cat };
            emit(tr); c.trails.push(tr);
          }
          if (o.rocks) P.strikes(e, pl, { col: c.col, col2: c.col2, F: false, less: c.less, q: c.q, t: c.t }, { st: 'rock', n: 3, pat: 'around', r: 40, delay: 0.8 });
          if (o.recoil) { e.hp = Math.max(1, e.hp - e.maxHp * 0.02); G.FX.dmgText(e.x, e.y - e.bodyH - 4, R(e.maxHp * 0.02), '#ff9a3c'); }
          if (++c.k >= n) {
            c.ph = 'done';
            if (o.beam) { const p = nearest(e.x, e.y) || pl; hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: ang(e, p), len: 620, w: 50, delay: 1.0, dmg: e.shotDmg() * 1.6, grp: nextGrp() }); e.anim.play('Charge'); }
            // Puños Plasma (Zeraora): su rastro eléctrico estalla.
            if (o.live) { const g = nextGrp(); for (const t of c.trails) hz(e, c, { kind: 'beam', x: t.x, y: t.y, angle: Math.atan2(t.y2 - t.y, t.x2 - t.x), len: Math.hypot(t.x2 - t.x, t.y2 - t.y) + 10, w: 34, delay: 0.8, dmg: e.shotDmg() * 1.1, grp: g }); }
            if (o.ghost) hide(e, false);
            // Asalto Espadón (Baxcalibur): queda expuesto.
            if (o.exposed) expose(e, 2, 2.6);
            c.end = c.t + (o.beam ? 1.2 : o.live ? 0.9 : 0.3);
            return [0, 0, 'Idle'];
          }
          c.ph = 'aim'; c.pt = o.quick ? 0.22 : o.short ? 0.3 : 0.4; aim();
          return [0, 0, 'Idle'];
        }
        const sp = len / dur;
        return [Math.cos(c.ang) * sp, Math.sin(c.ang) * sp, 'Walk'];
      }
      return [0, 0, 'Idle'];
    };
    c.end = 99; c.face = false;
  };

  /** Koraidon: Nitrochoque, da una vuelta a tu alrededor dejando fuego y luego te atraviesa. */
  P.drive = (e, pl, c, o) => {
    const p = nearest(e.x, e.y) || pl, cx = p.x, cy = p.y, Rr = 210, dir = Math.random() < 0.5 ? -1 : 1;
    let a = Math.atan2(e.y - cy, e.x - cx), last = [e.x, e.y], acc = 0, done = 0;
    e.anim.play('Charge', { speed: 1.4 }); e.tell(c.col, e.r * 3, 0.5);
    c.ph = 0;
    at(c, 0.5, () => { c.ph = 1; e.anim.play('Walk', { speed: 2 }); });
    c.mv = dt => {
      if (c.ph !== 1) return [0, 0, 'Idle'];
      const prev = a; a += dir * dt * 2.6; done += Math.abs(a - prev); acc += dt;
      const tx = cx + Math.cos(a) * Rr, ty = cy + Math.sin(a) * Rr * 0.8;
      if (acc >= 0.22) {
        acc = 0;
        emit({ k: 'band', x: R(last[0]), y: R(last[1]), x2: R(e.x), y2: R(e.y), w: 28, dur: 3.6, st: 'fire', col: c.col, col2: c.col2, dot: R(e.shotDmg() * 0.2), type: e.atkType, cat: e.cat });
        last = [e.x, e.y];
      }
      if (done >= TAU) {
        c.ph = 2;
        // Y te atraviesa por el centro.
        const q = nearest(e.x, e.y) || pl, b = ang(e, q);
        hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: b, len: Rr * 2.2, w: R(e.r * 2 + 30), delay: 0.5, dmg: e.dmg * 1.4, grp: nextGrp() });
        at(c, c.t + 0.5, () => { c.ph = 3; c.ang = b; c.go = 0.36; e.anim.play('Attack', { speed: 1.6 }); });
        return [0, 0, 'Idle'];
      }
      if (c.ph === 1) return [(tx - e.x) / Math.max(dt, 0.016), (ty - e.y) / Math.max(dt, 0.016), 'Walk'];
      return [0, 0, 'Idle'];
    };
    const mv = c.mv;
    c.mv = (dt, q) => {
      if (c.ph === 3) { if ((c.go -= dt) <= 0) { c.ph = 4; c.end = c.t + 0.3; return [0, 0, 'Idle']; } const sp = Rr * 2.2 / 0.36; return [Math.cos(c.ang) * sp, Math.sin(c.ang) * sp, 'Walk']; }
      return mv(dt, q);
    };
    c.end = 6; c.face = false;
  };

  /** Dragonite: Enfado, te persigue sin parar unos segundos y luego queda confuso (expuesto). */
  P.outrage = (e, pl, c, o) => {
    e.anim.play('Charge', { speed: 1.6 }); e.tell('#ff4a4a', e.r * 3, 0.6);
    emit({ k: 'aura', id: e.id, dur: 3.6, col: '#ff4a4a' });
    c.mv = (dt) => {
      if (c.t < 0.6) return [0, 0, 'Idle'];
      const q = nearest(e.x, e.y) || pl, a = ang(e, q), sp = Math.max(150, e.spd * 2.6);
      e.anim.dir = G.Sprites.dirFromAngle(a);
      if (Math.random() < dt * 3) hz(e, c, { kind: 'zone', x: e.x + Math.cos(a) * 40, y: e.y + Math.sin(a) * 40, r: 50, delay: 0.45, dmg: e.shotDmg() * 0.8, grp: nextGrp() });
      return [Math.cos(a) * sp, Math.sin(a) * sp, 'Walk'];
    };
    c.end = 3.6; c.face = false;
    c.onEnd = () => expose(e, 1.5, 2.4);
  };

  /** Orbes que te persiguen (y te confunden, o uno grande que no te pierde, o que vuelven). */
  P.orbs = (e, pl, c, o) => {
    const n = o.big ? 1 : Math.max(o.n < 3 ? o.n : 3, R(((o.n || 5) + (c.F ? 2 : 0)) * c.less));
    e.anim.play('Charge', { speed: 1.2 }); e.tell(c.col, e.r * 2.6, 0.6);
    at(c, 0.6, () => {
      e.anim.play('Shoot');
      const ps2 = living();
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + (o.big ? ang(e, pl) : 0), tg = ps2[i % ps2.length];
        emit({ k: 'orb', x: R(e.x + Math.cos(a) * e.r * 1.6), y: R(e.y - e.bodyH * 0.4 + Math.sin(a) * e.r), vx: R(Math.cos(a) * 120), vy: R(Math.sin(a) * 120),
               spd: o.big ? 128 : o.fast ? 150 : 100, turn: o.big ? 2.8 : o.fast ? 3 : 2.2, tg: uidOf(tg), dur: o.big ? 6.5 : 5.5, dmg: R(e.shotDmg() * (o.big ? 1.9 : 0.95)), r: o.big ? 16 : 9,
               eff: o.conf ? 'conf' : '', ret: o.back ? 1 : 0, st: o.st, col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
      }
    });
    c.end = 1.0;
  };

  /** Spectrier: Orbes Espectro, llegan desde los bordes y se cierran sobre ti. */
  P.barrage = (e, pl, c, o) => {
    const n = Math.max(6, R(((o.n || 10) + (c.F ? 2 : 0)) * c.less));
    e.anim.play('Charge', { speed: 1.2 }); e.tell(c.col, e.r * 3, 0.7);
    at(c, 0.7, () => {
      e.anim.play('Shoot');
      for (const p of living().slice(0, 2)) {
        const a0 = Math.random() * TAU;
        for (let i = 0; i < n; i++) {
          const a = a0 + i / n * TAU, x = p.x + Math.cos(a) * 430, y = p.y + Math.sin(a) * 300;
          emit({ k: 'orb', x: R(x), y: R(y), vx: R(-Math.cos(a) * 60), vy: R(-Math.sin(a) * 60), spd: 120 + (i % 3) * 18, turn: 0.7, tg: uidOf(p), dur: 5, dmg: R(e.shotDmg() * 0.85),
                 r: 9, st: 'ghost', col: c.col, col2: c.col2, type: e.atkType, cat: e.cat, wall: 1 });
        }
      }
    });
    c.end = 1.1;
  };

  /** Phione: Danza Lluvia, burbujas lentas que flotan hacia ti; con la lluvia se cura. */
  P.bubbles = (e, pl, c, o) => {
    const n = Math.max(5, R(((o.n || 9) + (c.F ? 3 : 0)) * c.less));
    e.anim.play('Charge', { speed: 1 });
    at(c, 0.5, () => {
      e.anim.play('Shoot');
      const ps2 = living();
      for (let i = 0; i < n; i++) { const a = i / n * TAU, tg = ps2[i % ps2.length];
        emit({ k: 'orb', x: R(e.x + Math.cos(a) * 30), y: R(e.y - 20 + Math.sin(a) * 20), vx: R(Math.cos(a) * 70), vy: R(Math.sin(a) * 70), spd: 52 + (i % 3) * 8, turn: 1.1,
               tg: uidOf(tg), dur: 8, dmg: R(e.shotDmg() * 0.8), r: 11, st: 'bubble', col: c.col, col2: c.col2, type: e.atkType, cat: e.cat }); }
    });
    for (let i = 1; i <= 5; i++) job(e, i * 1.2, () => { const w = G.Weather.current; if (w && w.kind === 'rain') heal(e, 0.012); });
    c.end = 1.0;
  };

  /** Uxie: Bostezo, burbujas de sueño; si te da una, a los 2 s te duermes un momento. */
  P.yawn = (e, pl, c, o) => {
    const n = Math.max(3, R(((o.n || 5) + (c.F ? 1 : 0)) * c.less));
    e.anim.play('Charge', { speed: 0.8 }); emit({ k: 'zzz', id: e.id, dur: 1.4 });
    at(c, 0.6, () => {
      const ps2 = living();
      for (let i = 0; i < n; i++) { const a = i / n * TAU, tg = ps2[i % ps2.length];
        emit({ k: 'orb', x: R(e.x + Math.cos(a) * e.r * 1.4), y: R(e.y - e.bodyH * 0.4), vx: R(Math.cos(a) * 90), vy: R(Math.sin(a) * 90), spd: 84, turn: 1.8, tg: uidOf(tg), dur: 6,
               dmg: R(e.shotDmg() * 0.6), r: 10, eff: 'yawn', st: 'dream', col: c.col, col2: c.col2, type: e.atkType, cat: e.cat }); }
      for (const p of living()) for (let i = 0; i < 2; i++) { const a = Math.random() * TAU, d = G.U.rand(80, 150);
        emit({ k: 'pool', x: R(p.x + Math.cos(a) * d), y: R(p.y + Math.sin(a) * d * 0.8), r: 48, dur: 6, delay: 0.6, st: 'dream', col: c.col, col2: c.col2, slow: 1 }); }
    });
    c.end = 1.1;
  };

  /** Manaphy: Cambiaalmas, corazones que te siguen y luego se cambia de sitio contigo. */
  P.swap = (e, pl, c, o) => {
    P.orbs(e, pl, c, { n: o.n || 4, st: 'heart' });
    at(c, 0.7, () => {
      const p = nearest(e.x, e.y) || pl, ox = R(e.x), oy = R(e.y), tx = R(p.x), ty = R(p.y);
      emit({ k: 'swap', tg: uidOf(p), x: ox, y: oy, x2: tx, y2: ty, at: 1.1, dur: 1.5, col: c.col });
      at(c, 1.8, () => {
        [e.x, e.y] = freeNear(e, tx, ty);
        hz(e, c, { kind: 'zone', x: tx, y: ty, r: 70, delay: 0.25, dmg: e.shotDmg() * 1.1, grp: nextGrp() });
        G.FX.ring(e.x, e.y, 6, 80, c.col, 0.4, 4);
      });
    });
    c.end = 2.3;
  };

  /** Brazos de orbes que giran: alrededor del jefe (Cresselia) o de ti, cerrándose (Meltan). */
  P.spin = (e, pl, c, o) => {
    const arms = (o.arms || 3) + (c.F ? 1 : 0), dir = Math.random() < 0.5 ? -1 : 1;
    e.anim.play('Charge', { speed: 1.1 }); e.tell(c.col, e.r * 3, 0.6);
    if (o.around) {
      for (const p of living().slice(0, 2)) emit({ k: 'spin', tg: uidOf(p), x: R(p.x), y: R(p.y), arms, per: 2, r0: 230, r1: 26, av: 1.5 * dir, a0: R(Math.random() * 628) / 100,
                                                    delay: 0.6, dur: 4.2, dmg: R(e.shotDmg() * 0.9), st: o.st, col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
    } else {
      emit({ k: 'spin', id: e.id, x: R(e.x), y: R(e.y), arms, per: 3, r0: 40, r1: 300, av: 1.2 * dir, a0: R(Math.random() * 628) / 100,
             delay: 0.5, dur: 4.8, dmg: R(e.shotDmg() * 0.9), st: o.st, col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
    }
    if (o.heal) at(c, 1.6, () => heal(e, o.heal));
    at(c, 0.5, () => e.anim.play('Shoot'));
    c.end = 1.8;
  };

  /** Gengar: copias de sí mismo que disparan Bolas Sombra; sólo una es de verdad. */
  P.decoy = (e, pl, c, o) => {
    const p = nearest(e.x, e.y) || pl, n = (o.n || 3), a0 = Math.random() * TAU, spots = [];
    for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU; spots.push(freeNear(e, p.x + Math.cos(a) * 200, p.y + Math.sin(a) * 160)); }
    const real = Math.floor(Math.random() * n);
    e.anim.play('Charge', { speed: 1.4 });
    at(c, 0.35, () => {
      emit({ k: 'portal', x: R(e.x), y: R(e.y), dur: 0.5 });
      [e.x, e.y] = spots[real];
      spots.forEach(([x, y], i) => { if (i !== real) emit({ k: 'decoy', dex: e.dex, sc: e.scale, sh: e.shiny ? 1 : 0, x: R(x), y: R(y), dur: 3.4 }); });
    });
    for (let k = 0; k < 3; k++) at(c, 0.9 + k * 0.75, () => {
      const q = nearest(e.x, e.y) || pl;
      spots.forEach(([x, y]) => emit({ k: 'orb', x: R(x), y: R(y - 30), vx: 0, vy: 0, spd: 105, turn: 1.6, tg: uidOf(q), dur: 4.5, dmg: R(e.shotDmg() * 0.75), r: 9,
                                       st: 'ghost', col: c.col, col2: c.col2, type: e.atkType, cat: e.cat }));
      e.anim.play('Shoot');
    });
    c.end = 3.4;
  };

  /** Greninja: Shuriken de Agua, tres tandas de estrellas rapidísimas (y se mueve entre tanda y tanda). */
  P.volley = (e, pl, c, o) => {
    e.anim.play('Charge', { speed: 1.5 });
    for (let k = 0; k < 3 + (c.F ? 1 : 0); k++) at(c, 0.45 + k * 0.6, () => {
      const q = nearest(e.x, e.y) || pl, a = ang(e, q);
      for (let i = -2; i <= 2; i++) e.fire(a + i * 0.16, 290, 0.65, 8, 1.8);
      e.anim.play('Shoot');
      const b = a + Math.PI / 2 * (k % 2 ? 1 : -1);
      [e.x, e.y] = freeNear(e, e.x + Math.cos(b) * 60, e.y + Math.sin(b) * 60);
    });
    c.end = 2.4;
  };

  /** Teletransporte (al otro lado de ti) o portales de Hoopa. */
  P.warp = (e, pl, c, o) => {
    if (o.kind === 'portals') {
      const tg = nearest(e.x, e.y) || pl, a0 = Math.random() * TAU, pts = [];
      for (let i = 0; i < 3; i++) { const a = a0 + i / 3 * TAU; pts.push([R(tg.x + Math.cos(a) * 140), R(tg.y + Math.sin(a) * 110)]); }
      for (const [x, y] of pts) emit({ k: 'portal', x, y, dur: 3.0 });
      e.anim.play('Charge');
      at(c, 0.5, () => hide(e, true));
      pts.forEach(([x, y], i) => at(c, 0.9 + i * 0.35, () => {
        const p = nearest(x, y) || pl;
        hz(e, c, { kind: 'zone', x: p.x, y: p.y, r: 70, delay: 0.6, dmg: e.shotDmg() * 1.2, grp: nextGrp() });
        emit({ k: 'sky', st: 'fist', col: c.col, col2: c.col2, pts: [[R(p.x), R(p.y), 0.6]], dur: 1 });
      }));
      at(c, 2.2, () => { const [x, y] = pts[Math.floor(Math.random() * 3)]; [e.x, e.y] = freeNear(e, x, y); hide(e, false); e.anim.play('Attack'); });
      c.end = 2.6;
      return;
    }
    emit({ k: 'portal', x: R(e.x), y: R(e.y), dur: 0.9 });
    e.anim.play('Charge', { speed: 1.4 });
    at(c, 0.35, () => {
      const tg = nearest(e.x, e.y) || pl, a = ang(e, tg);
      const [x, y] = freeNear(e, tg.x + Math.cos(a) * 150, tg.y + Math.sin(a) * 120);
      e.x = x; e.y = y;
      emit({ k: 'portal', x: R(x), y: R(y), dur: 0.9 });
      G.FX.ring(x, y, 6, 70, c.col, 0.4, 4);
    });
    at(c, 0.6, () => { const m = R(12 * c.less); for (let i = 0; i < m; i++) e.fire(i / m * TAU, 160, 0.7); e.anim.play('Shoot'); });
    at(c, 0.7, () => hz(e, c, { kind: 'zone', x: e.x, y: e.y, r: 80, delay: 0.7, dmg: e.shotDmg() * 1.2, grp: nextGrp() }));
    c.end = 1.6;
  };

  /** Rayquaza: Ascenso Draco, cruza la arena en picado en línea recta (tres veces). */
  P.pass = (e, pl, c, o) => {
    const n = (o.n || 3) + (c.F ? 1 : 0);
    e.anim.play('Charge', { speed: 1.3 });
    at(c, 0.35, () => { hide(e, true); emit({ k: 'rise', x: R(e.x), y: R(e.y), dex: e.dex, sc: e.scale, sh: e.shiny ? 1 : 0, dur: 0.5, col: c.col }); });
    let lx = e.x, ly = e.y;
    for (let i = 0; i < n; i++) at(c, 0.8 + i * 1.0, () => {
      const p = nearest(e.x, e.y) || pl, a = Math.random() * TAU, L = 560;
      const sx = p.x - Math.cos(a) * L, sy = p.y - Math.sin(a) * L * 0.8, ex = p.x + Math.cos(a) * L, ey = p.y + Math.sin(a) * L * 0.8;
      hz(e, c, { kind: 'beam', x: sx, y: sy, angle: Math.atan2(ey - sy, ex - sx), len: Math.hypot(ex - sx, ey - sy), w: R(e.r * 2 + 34), delay: 0.85, dmg: e.dmg * 1.35, grp: nextGrp() });
      emit({ k: 'streak', dex: e.dex, sc: e.scale, sh: e.shiny ? 1 : 0, x: R(sx), y: R(sy), x2: R(ex), y2: R(ey), at: 0.72, dur: 1.2, col: c.col });
      lx = p.x + Math.cos(a) * 160; ly = p.y + Math.sin(a) * 130;
    });
    at(c, 0.8 + n * 1.0 + 0.1, () => { [e.x, e.y] = freeNear(e, lx, ly); hide(e, false); G.Camera.kick(0.4); e.anim.play('Attack'); });
    c.end = 0.8 + n * 1.0 + 0.4; c.face = false;
    c.onEnd = () => { e.landT = 1.5; };
  };

  /** Deoxys: cambia de forma (ataque, defensa o velocidad) y lanza su Psicoataque. */
  const FORMS = [['attack', '#ff5a4a'], ['defense', '#ffa64a'], ['speed', '#4fd8ff']];
  P.forms = (e, pl, c, o) => {
    e.sigForm = ((e.sigForm || 0) + 1) % 3;
    const [f, col] = FORMS[e.sigForm];
    emit({ k: 'form', id: e.id, dur: 8, col });
    e.anim.play('Charge', { speed: 1.2 });
    if (e.sigSpdUp) { e.spd /= e.sigSpdUp; e.sigSpdUp = 0; }
    if (f === 'defense') { e.sigArmor = clock + 8; emit({ k: 'bubble', id: e.id, dur: 8, col }); }
    if (f === 'speed') haste(e, 1.7, 8);
    // Psicoataque: una zona enorme donde estás.
    at(c, 0.4, () => {
      const p = nearest(e.x, e.y) || pl;
      hz(e, c, { kind: 'zone', x: p.x, y: p.y, r: 112, delay: 1.2, dmg: e.shotDmg() * (f === 'attack' ? 2.2 : 1.6), grp: nextGrp() });
      emit({ k: 'sky', st: 'meteor', col: c.col, col2: c.col2, pts: [[R(p.x), R(p.y), 1.2]], dur: 1.7 });
    });
    c.end = 1.8;
  };

  /** Mew: Metrónomo, otra firma de legendario al azar. */
  const NO_METRO = new Set(['metronome', 'splash', 'forms', 'multitype', 'truant']);
  P.metronome = (e, pl, c, o) => {
    const keys = Object.keys(SIG).filter(d => +d > 140 && !NO_METRO.has(SIG[d][0]) && +d !== 151 && G.DEX_BY[d] && G.DEX_BY[d].leg);
    const d = SIG[G.U.pick(keys)];
    e.anim.play('Charge', { speed: 1.6 });
    at(c, 0.6, () => start(e, pl, { p: d[0], name: d[1], o: Object.assign({}, d[2]) }));
    c.end = 0.7;
  };

  /** Campo grande (eléctrico, psíquico, de hierba, de niebla) con algo propio dentro. */
  const TERR_SKY = { elec: 'bolt', psy: 'pillar', grass: 'leaf', mist: 'steam' };
  P.terrain = (e, pl, c, o) => {
    const Rr = 270, x = e.x, y = e.y;
    emit({ k: 'pool', x: R(x), y: R(y), r: Rr, dur: 9.5, st: o.st, col: c.col, col2: c.col2, terr: 1 });
    e.anim.play('Charge');
    const n = o.orbs || o.heal || o.fog ? 6 : 11;
    for (let i = 0; i < n; i++) job(e, 0.8 + i * (o.orbs || o.heal || o.fog ? 1.3 : 0.75), () => {
      const p = nearest(x, y);
      let px, py;
      if (p && (p.x - x) ** 2 + (p.y - y) ** 2 < Rr * Rr) { px = p.x + G.U.rand(-40, 40); py = p.y + G.U.rand(-30, 30); }
      else { const a = Math.random() * TAU, d = Math.random() * Rr; px = x + Math.cos(a) * d; py = y + Math.sin(a) * d * 0.8; }
      hz(e, c, { kind: 'zone', x: px, y: py, r: 46, delay: 0.85, dmg: e.shotDmg() });
      emit({ k: 'sky', st: TERR_SKY[o.st] || 'bolt', col: c.col, col2: c.col2, pts: [[R(px), R(py), 0.85]], dur: 1.3 });
      // Campo de Hierba (Tapu Bulu): se cura mientras está dentro de su campo.
      if (o.heal && (e.x - x) ** 2 + (e.y - y) ** 2 < Rr * Rr) heal(e, 0.012);
    });
    // Campo Psíquico (Tapu Lele): orbes que te persiguen dentro.
    if (o.orbs) at(c, 0.8, () => P.orbs(e, pl, { col: c.col, col2: c.col2, F: c.F, less: c.less, q: c.q, t: c.t }, { n: 4, st: 'psy' }));
    // Campo de Hierba: y Mazazo, una embestida.
    if (o.heal) at(c, 0.9, () => { P.dashes(e, pl, c, { n: 1, big: 1, st: 'grass' }); });
    // Campo de Niebla (Tapu Fini): no se ve lejos y hay charcos que frenan.
    if (o.fog) { emit({ k: 'dark', x: R(x), y: R(y), dur: 6, soft: 1 }); for (const p of living()) for (let i = 0; i < 3; i++) { const a = Math.random() * TAU, d = G.U.rand(40, 150);
      emit({ k: 'pool', x: R(p.x + Math.cos(a) * d), y: R(p.y + Math.sin(a) * d * 0.8), r: 54, dur: 6, delay: 0.7, st: 'water', col: '#4fa8ff', col2: '#d4ecff', slow: 1 }); } }
    c.end = o.heal ? 99 : 1.2;
  };

  /** Anillos que estallan uno tras otro desde el jefe (hacia fuera, hacia dentro o los dos); los Regi, con su Braille. */
  P.quake = (e, pl, c, o) => {
    if (o.braille) emit({ k: 'braille', id: e.id, dur: 2.4, col: c.col });
    if (o.armor) { e.sigArmor = clock + 3; emit({ k: 'bubble', id: e.id, dur: 3, col: c.col }); }
    const big = o.big ? 1.25 : 1, dir = o.dir || (Math.random() < 0.5 ? 'out' : 'in'), Rs = [0, 95, 190, 285, 380].map(r => R(r * big)), n = c.F ? 4 : 3;
    const t0 = o.grip ? 1.8 : 1.0;
    // Agarrón (Regigigas): primero te arrastra hacia él.
    if (o.grip) emit({ k: 'push', x: R(e.x), y: R(e.y), r: 640, rad: 1, f: -95, dur: 1.9, delay: 0.2, st: 'normal', col: c.col });
    e.anim.play('Charge', { speed: 1.1 });
    const ring = (j, i) => emit({ k: 'ring', x: R(e.x), y: R(e.y), r1: Rs[j], r2: Rs[j + 1], delay: t0 + i * 0.55, dur: t0 + i * 0.55 + 0.4, eff: o.freeze ? 'freeze' : '',
                                  dmg: R(e.shotDmg() * 1.25), slow: o.slow || 0, st: o.st, col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
    for (let i = 0; i < n; i++) {
      if (dir === 'both') { ring(i, i); if (n - 1 - i !== i) ring(n - 1 - i, i); }
      else ring(dir === 'out' ? i : n - 1 - i, i);
    }
    at(c, t0, () => { e.anim.play('Attack', { speed: 1.2 }); G.Camera.kick(0.4); });
    if (o.rocks) at(c, 0.4, () => P.strikes(e, pl, { col: c.col, col2: c.col2, F: false, less: c.less, q: c.q, t: c.t }, { st: 'rock', n: 4, pat: 'around', r: 40, delay: 1.2 }));
    c.end = t0 + (n - 1) * 0.55 + 0.4;
  };

  /** Jaula que se cierra a tu alrededor: cruzarla quema un poco; dentro al cerrarse, mucho. */
  P.cage = (e, pl, c, o) => {
    for (const p of living().slice(0, 2)) {
      emit({ k: 'cage', x: R(p.x), y: R(p.y), R0: 165, R1: 30, dur: 3.2, dmg: R(e.shotDmg()), st: o.st, col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
      if (o.lava) { const x = R(p.x), y = R(p.y); job(e, 3.2, () => emit({ k: 'pool', x, y, r: 60, dur: 4, st: 'lava', col: '#ff6a1f', col2: '#ffd25e', dot: R(e.shotDmg() * 0.22), type: e.atkType, cat: e.cat })); }
    }
    e.anim.play('Charge', { speed: 1.2 });
    at(c, 0.5, () => e.anim.play('Shoot'));
    c.end = 1.2;
  };

  /** Regieleki: Electrojaula, una jaula CUADRADA de electricidad que se cierra. */
  P.box = (e, pl, c, o) => {
    for (const p of living().slice(0, 2)) emit({ k: 'box', x: R(p.x), y: R(p.y), R0: 175, R1: 26, dur: 3.0, dmg: R(e.shotDmg()), st: 'elec', col: c.col, col2: c.col2, type: e.atkType, cat: e.cat });
    emit({ k: 'braille', id: e.id, dur: 2.4, col: c.col });
    e.anim.play('Charge', { speed: 1.4 });
    at(c, 0.4, () => e.anim.play('Shoot'));
    c.end = 1.1;
  };

  /** Fulgor Semilla (flores y estallido), Lluevehojas (ondas de hojas) o Geocontrol (se carga y va más rápido). */
  P.bloom = (e, pl, c, o) => {
    if (o.kind === 'geo') {
      emit({ k: 'charge', id: e.id, dur: 1.6, col: '#ff9fd8' });
      e.anim.play('Charge', { speed: 0.7 });
      at(c, 1.6, () => {
        emit({ k: 'aura', id: e.id, dur: 10, col: c.col, rb: 1 });
        e.sigHaste = clock + 10;
        haste(e, 1.3, 10);
        G.FX.ring(e.x, e.y, e.r, e.r * 6, '#ff9fd8', 0.6, 5);
      });
      c.end = 1.9;
      return;
    }
    if (o.kind === 'leaf') { P.wave(e, pl, c, { n: 2, gaps: 2, st: 'leaf', spd: 190 }); return; }
    emit({ k: 'pool', x: R(e.x), y: R(e.y), r: 215, dur: 1.5, st: 'grass', col: c.col, col2: c.col2 });
    hz(e, c, { kind: 'zone', x: e.x, y: e.y, r: 215, delay: 1.35, dmg: e.shotDmg() * 1.7, grp: nextGrp() });
    e.anim.play('Charge', { speed: 0.9 });
    at(c, 1.35, () => { e.anim.play('Attack'); G.Camera.kick(0.6); G.FX.ring(e.x, e.y, 10, 230, '#e0ffc8', 0.5, 6); });
    c.end = 1.8;
  };

  /** Charcos alrededor de ti (tóxicos o que frenan); Cadena Virulenta, con cadenas. */
  P.pools = (e, pl, c, o) => {
    const n = o.n || 4, tox = o.st === 'toxic';
    for (const p of living()) for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = i ? G.U.rand(40, 130) : 0;
      emit({ k: 'pool', x: R(p.x + Math.cos(a) * d), y: R(p.y + Math.sin(a) * d * 0.8), r: 52, dur: 6, delay: 0.9, st: o.st, col: c.col, col2: c.col2,
             dot: tox ? R(e.shotDmg() * 0.22) : 0, slow: tox ? 0 : 1.2, type: e.atkType, cat: e.cat });
    }
    if (o.chain) at(c, 0.3, () => { const a = ang(e, pl), g = nextGrp(); for (const s of [-0.3, 0, 0.3]) hz(e, c, { kind: 'beam', x: e.x, y: e.y, angle: a + s, len: 480, w: 22, delay: 1.0, dmg: e.shotDmg() * 1.1, grp: g }); });
    e.anim.play('Charge', { speed: 1.1 });
    c.end = 1.3;
  };

  /** Fezandipiti: su perfume te atrae hacia él, que está en medio de un charco tóxico. */
  P.perfume = (e, pl, c, o) => {
    e.anim.play('Charge', { speed: 0.9 }); e.tell('#ff9fd8', e.r * 3, 0.7);
    emit({ k: 'push', x: R(e.x), y: R(e.y), r: 460, rad: 1, f: -78, dur: 3.6, delay: 0.5, st: 'pink', col: '#ff9fd8' });
    emit({ k: 'pool', x: R(e.x), y: R(e.y), r: 92, dur: 4.4, delay: 0.5, st: 'toxic', col: c.col, col2: c.col2, dot: R(e.shotDmg() * 0.3), type: 'poison', cat: e.cat });
    at(c, 1.2, () => P.orbs(e, pl, { col: '#f0e6ff', col2: '#ff9fd8', F: false, less: c.less, q: c.q, t: c.t }, { n: 3, st: 'moon' }));
    c.end = 2.2;
  };

  /** Kingdra: Hidrobomba en medio de un remolino que te arrastra al centro. */
  P.whirlpool = (e, pl, c, o) => {
    const p = nearest(e.x, e.y) || pl, x = R(p.x), y = R(p.y);
    emit({ k: 'pool', x, y, r: 190, dur: 4.2, delay: 0.3, st: 'water', col: c.col, col2: c.col2, whirl: 1 });
    emit({ k: 'push', x, y, r: 200, rad: 1, f: -58, dur: 4.2, delay: 0.5, st: 'water', col: c.col });
    e.anim.play('Charge', { speed: 1 });
    at(c, 1.2, () => { const a = ang(e, { x, y }), g = nextGrp();
      for (let i = -1; i <= 1; i++) hz(e, c, { kind: 'beam', x: e.x - Math.sin(a) * i * 46, y: e.y + Math.cos(a) * i * 46, angle: a, len: 640, w: 30, delay: 1.0, dmg: e.shotDmg() * 1.2, grp: g }); });
    at(c, 2.2, () => e.anim.play('Shoot'));
    c.end = 2.6;
  };

  /** Azelf: se lanza a por ti y explota (no se hace daño). */
  P.bomb = (e, pl, c, o) => {
    emit({ k: 'charge', id: e.id, dur: 0.8, col: c.col });
    e.anim.play('Charge', { speed: 1.4 });
    c.ph = 0;
    at(c, 0.7, () => { const p = nearest(e.x, e.y) || pl; c.ang = ang(e, p); c.go = Math.min(0.45, Math.hypot(p.x - e.x, p.y - e.y) / 700); c.ph = 1; e.anim.play('Attack'); });
    c.mv = dt => {
      if (c.ph !== 1) return null;
      if ((c.go -= dt) <= 0) {
        c.ph = 2;
        hz(e, c, { kind: 'zone', x: e.x, y: e.y, r: 150, delay: 0.95, dmg: e.shotDmg() * 2.0, grp: nextGrp(), boom: true });
        at(c, c.t + 0.95, () => { G.Camera.kick(0.9); G.FX.burst(e.x, e.y - 20, '#ffd25e', 30, 260); });
        return [0, 0, 'Idle'];
      }
      return [Math.cos(c.ang) * 700, Math.sin(c.ang) * 700, 'Walk'];
    };
    c.end = 2.3; c.face = false;
  };

  /** Silvally: cambia de tipo (su color y sus disparos) y dispara dos anillos de ese tipo. */
  P.multitype = (e, pl, c, o) => {
    const T = Object.keys(G.U.TYPE_COLOR).filter(t => t !== e.atkType), t = G.U.pick(T);
    e.atkType = t;
    emit({ k: 'tswap', id: e.id, type: t, dur: 0.1 });
    c.col = G.U.TYPE_COLOR[t];
    e.anim.play('Charge', { speed: 1.2 }); e.tell(c.col, e.r * 3, 0.6);
    for (const [k, off] of [[0.6, 0], [0.95, 0.5]]) at(c, k, () => { const n = R(16 * c.less); for (let i = 0; i < n; i++) e.fire((i + off) / n * TAU, 170, 0.75); e.anim.play('Shoot'); });
    c.end = 1.4;
  };

  /** Cosmog: Salpicadura... y no pasa nada (luego se teletransporta lejos). */
  P.splash = (e, pl, c, o) => {
    emit({ k: 'hop', id: e.id, dur: 1.2 });
    at(c, 1.25, () => label(e, '¡Pero no ha pasado nada!', '#ffffff'));
    at(c, 2.0, () => {
      emit({ k: 'portal', x: R(e.x), y: R(e.y), dur: 0.9 });
      const p = nearest(e.x, e.y) || pl, a = Math.random() * TAU;
      [e.x, e.y] = freeNear(e, p.x + Math.cos(a) * 230, p.y + Math.sin(a) * 180);
      emit({ k: 'portal', x: R(e.x), y: R(e.y), dur: 0.9 });
    });
    c.end = 2.4;
  };

  /** Slaking: Ausente (se echa a dormir y recibe más daño) y luego un Gigaimpacto enorme. */
  P.truant = (e, pl, c, o) => {
    emit({ k: 'zzz', id: e.id, dur: 3.6 });
    e.sigK = 1.5;
    at(c, 3.6, () => {
      e.sigK = 1;
      label(e, o.name2 || 'Gigaimpacto', c.col);
      hz(e, c, { kind: 'zone', x: e.x, y: e.y, r: 160, delay: 1.0, dmg: e.shotDmg() * 2.4, grp: nextGrp() });
      e.anim.play('Charge', { speed: 0.9 });
    });
    at(c, 4.6, () => { e.anim.play('Attack', { speed: 1.2 }); G.Camera.kick(0.9); });
    c.end = 5.0;
  };

  /** Snorlax: tres Golpes Cuerpo (saltos que caen sobre ti) y luego Descanso (duerme y se cura). */
  P.slam = (e, pl, c, o) => {
    for (let i = 0; i < 3; i++) at(c, i * 1.25, () => {
      const p = nearest(e.x, e.y) || pl;
      e.jump = { sx: e.x, sy: e.y, tx: p.x, ty: p.y, t: -0.35, dur: 0.75 };
      emit({ k: 'hop', id: e.id, dur: 1.1, big: 1 });
      hz(e, c, { kind: 'zone', x: p.x, y: p.y, r: 105, delay: 1.1, dmg: e.shotDmg() * 1.5, grp: nextGrp() });
      e.anim.play('Charge', { speed: 1.4 });
    });
    if (o.rest) {
      at(c, 3.9, () => { emit({ k: 'zzz', id: e.id, dur: 2.2 }); e.sigK = 1.4; e.anim.play('Idle'); });
      at(c, 6.0, () => { e.sigK = 1; heal(e, 0.07); });
      c.end = 6.1;
      return;
    }
    c.end = 3.9;
  };

  /** El toque de los de BY_TYPE según sus estadísticas (ver flavorOf). */
  function flavor(e, pl, c, fl) {
    if (fl === 'bulk') { e.sigK = Math.min(e.sigK, 0.6); emit({ k: 'bubble', id: e.id, dur: Math.min(3, c.end), col: '#b8c6d8' }); }
    else if (fl === 'fast') c.onEnd = (f => () => { if (f) f(); haste(e, 1.25, 5); })(c.onEnd);
    else if (fl === 'spec') at(c, Math.min(c.end, 3) - 0.05, () => { const m = R(12 * c.less); for (let i = 0; i < m; i++) e.fire(i / m * TAU + 0.26, 150, 0.6); });
    else if (fl === 'phys') at(c, Math.min(c.end, 3) - 0.05, () => hz(e, c, { kind: 'zone', x: e.x, y: e.y, r: 92, delay: 0.7, dmg: e.shotDmg() * 1.1, grp: nextGrp() }));
  }

  // ---------------- campos y marcas (en cada ordenador) ----------------

  const FIELD = new Set(['pool', 'band', 'wave', 'ring', 'cage', 'push', 'dark', 'orb', 'slowall', 'zap', 'sweep', 'box', 'spin']);
  const MARK = new Set(['label', 'sky', 'dive', 'rise', 'hide', 'bubble', 'charge', 'aura', 'form', 'clock', 'braille', 'lurk', 'stop', 'portal', 'slash', 'zzz', 'hop', 'tswap',
                        'cloud', 'streak', 'decoy', 'swap', 'glint', 'tired']);

  /** Añade un campo o una marca (de aquí o del anfitrión). Devuelve el de aquí (o null). */
  function add(o) {
    const m = Object.assign({}, o, { t: 0 });
    if (m.k === 'hide') {
      if (m.dur > 0) hides.set(m.id, m); else hides.delete(m.id);
      return null;
    }
    if (m.k === 'stop') { for (const l of marks) if (l.k === 'lurk') { l.x = m.x; l.y = m.y; l.stop = Math.min(l.stop, l.t); } return null; }
    if (m.k === 'tswap') { const e = G.EnemyMgr.get(m.id); if (e && G.U.TYPE_COLOR[m.type]) e.atkType = m.type; return null; }
    if (m.k === 'orb' || m.k === 'pool' || m.k === 'band' || m.k === 'cloud' || m.k === 'spin') m.seed = (Math.random() * 1e6) | 0;
    if (m.k === 'orb') { m.x0 = m.x; m.y0 = m.y; }
    if (m.k === 'cage' || m.k === 'box' || m.k === 'spin') m.cd = 0;
    (FIELD.has(m.k) ? fields : marks).push(m);
    if (fields.length > 110) fields.splice(0, fields.length - 110);
    if (marks.length > 90) marks.splice(0, marks.length - 90);
    return m;
  }

  // Lo que llega del anfitrión no se cree a ciegas (como el resto de coop.js).
  const num = (v, d, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const NUMS = { id: [0, 0, 1e12], x: [0, -1e6, 1e6], y: [0, -1e6, 1e6], x2: [0, -1e6, 1e6], y2: [0, -1e6, 1e6], r: [20, 0, 2000], r0: [0, 0, 400], r1: [0, 0, 2000], r2: [0, 0, 2000],
    R0: [100, 0, 600], R1: [20, 0, 600], w: [20, 0, 300], dur: [1, 0, 30], delay: [0, 0, 10], dmg: [0, 0, 1e7], dot: [0, 0, 1e7], slow: [0, 0, 5], spd: [100, 0, 1200],
    th: [20, 1, 120], gw: [0.3, 0, 1.5], ax: [0, -1, 1], ay: [0, -1, 1], f: [0, -400, 400], vx: [0, -900, 900], vy: [0, -900, 900], turn: [2, 0, 10], at: [0.8, 0, 10],
    stop: [1, 0, 10], sc: [1, 0.5, 3], dex: [0, 0, 2000], sh: [0, 0, 1], rb: [0, 0, 1], big: [0, 0, 1], terr: [0, 0, 1], tw: [0, 0, 1],
    // (28-10-2026)
    p: [0, 0, 1e6], rad: [0, 0, 1], back: [0, 0, 5], slide: [0, 0, 1], sleep: [0, 0, 1], pull: [0, 0, 1], whirl: [0, 0, 1], spk: [0, 0, 2], ret: [0, 0, 1], wall: [0, 0, 1],
    soft: [0, 0, 1], ang: [0, -20, 20], len: [0, 0, 2000], L: [300, 0, 2000], gap: [0, -2000, 2000], arms: [3, 1, 8], per: [2, 1, 5], av: [1, -10, 10], a0: [0, -20, 20] };
  const EFFS = new Set(['stun', 'freeze', 'sleep', 'conf', 'burn', 'yawn', 'slow', 'knock']);
  function onNet(o) {
    if (!o || typeof o !== 'object' || (!FIELD.has(o.k) && !MARK.has(o.k))) return;
    const m = { k: o.k };
    for (const key in NUMS) if (key in o) m[key] = num(o[key], NUMS[key][0], NUMS[key][1], NUMS[key][2]);
    for (const key of ['st', 'col', 'col2', 'type', 'cat', 'tg']) if (key in o) m[key] = str(o[key], 24);
    if ('txt' in o) m.txt = str(o.txt, 48);
    if ('eff' in o) m.eff = EFFS.has(o.eff) ? o.eff : '';
    if (Array.isArray(o.gaps)) m.gaps = o.gaps.slice(0, 4).map(v => num(v, 0, -20, 20));
    if (Array.isArray(o.pts)) m.pts = o.pts.slice(0, 48).filter(Array.isArray).map(p => [num(p[0], 0, -1e6, 1e6), num(p[1], 0, -1e6, 1e6), num(p[2], 1, 0, 10)]);
    if (Array.isArray(o.list)) m.list = o.list.slice(0, 12).filter(Array.isArray).map(p => [num(p[0], 0, -1e6, 1e6), num(p[1], 0, -1e6, 1e6), num(p[2], 0, -20, 20), num(p[3], 400, 0, 2000), num(p[4], 1, 0, 10)]);
    if (m.col && !/^#[0-9a-f]{6}$/i.test(m.col)) m.col = '#ff7a9e';
    if (m.col2 && !/^#[0-9a-f]{6}$/i.test(m.col2)) m.col2 = '#ffffff';
    add(m);
  }

  // --- tu Pokémon: lo que le han hecho las firmas ---

  /** Le pasa algo a TU Pokémon (sólo en este ordenador). fx, fy: de dónde viene el golpe (para lanzarlo). */
  function inflict(me, eff, p, fx, fy) {
    switch (eff) {
      case 'freeze': case 'sleep': case 'stun':
        if (ps.imm > 0 || ps.stun > 0) return;
        ps.stun = Math.max(0.5, Math.min(1.6, p || (eff === 'freeze' ? 0.9 : 1.2))); ps.sk = eff === 'freeze' ? 'ice' : 'zz';
        break;
      case 'conf': ps.conf = Math.max(ps.conf, p || 3.2); break;
      case 'burn': ps.burn = 3; ps.bd = Math.max(ps.bd, p || 5); ps.bt = Math.min(ps.bt, 0.5); break;
      case 'yawn': if (!(ps.yawn > 0) && !(ps.stun > 0) && !(ps.imm > 0)) ps.yawn = 2; break;
      case 'slow': me.slowT = Math.max(me.slowT || 0, p || 1.5); break;
      case 'knock': {
        const [nx, ny] = G.U.norm(me.x - fx, me.y - fy);
        ps.kx = nx * (p || 360); ps.ky = ny * (p || 360) * 0.85; ps.kt = 0.32;
        break;
      }
    }
  }

  /** Cada fotograma, antes de los campos: lo que ya le han hecho a tu Pokémon. */
  function playerTick(me, dt) {
    if (!me || me.dead) { ps.lx = null; ps.stun = ps.conf = ps.burn = ps.yawn = ps.kt = 0; return; }
    if (ps.lx != null && dt > 0) {
      const dx = me.x - ps.lx, dy = me.y - ps.ly;
      if (dx * dx + dy * dy < 3600) {
        let mx = dx, my = dy, ch = false;
        if (ps.stun > 0) { mx = 0; my = 0; ch = true; }
        else {
          if (ps.conf > 0) { mx = -dx; my = -dy; ch = true; }
          // Sobre hielo resbalas: la velocidad cambia despacio.
          if (ps.ice > 0) { const k = Math.min(1, dt * 2.6); ps.vx += (mx / dt - ps.vx) * k; ps.vy += (my / dt - ps.vy) * k; mx = ps.vx * dt; my = ps.vy * dt; ch = true; }
        }
        if (ch) { me.x = ps.lx + mx; me.y = ps.ly + my; G.World.collide(me); }
        if (!(ps.ice > 0)) { ps.vx = (me.x - ps.lx) / dt; ps.vy = (me.y - ps.ly) / dt; }
      }
    }
    if (ps.kt > 0) {
      const s = Math.min(dt, ps.kt); ps.kt -= dt;
      const n = Math.max(1, Math.ceil(Math.hypot(ps.kx, ps.ky) * s / Math.max(2, me.wr || 6)));
      for (let i = 0; i < n; i++) { me.x += ps.kx * s / n; me.y += ps.ky * s / n; G.World.collide(me); }
    }
    if (ps.stun > 0 && (ps.stun -= dt) <= 0) ps.imm = 1.6;
    if (ps.imm > 0) ps.imm -= dt;
    if (ps.conf > 0) ps.conf -= dt;
    if (ps.ice > 0) ps.ice -= dt;
    if (ps.burn > 0) { ps.burn -= dt; ps.bt -= dt; if (ps.bt <= 0) { ps.bt = 0.5; me.hurt(ps.bd, 'fire', false, 'special'); } }
    if (ps.yawn > 0 && (ps.yawn -= dt) <= 0) inflict(me, 'sleep', 1.3);
  }

  // --- cada fotograma ---

  function inBand(f, x, y, r) {
    const dx = f.x2 - f.x, dy = f.y2 - f.y, L2 = dx * dx + dy * dy || 1;
    const k = G.U.clamp(((x - f.x) * dx + (y - f.y) * dy) / L2, 0, 1);
    return G.U.dist2(x, y, f.x + dx * k, f.y + dy * k) < (f.w / 2 + r) ** 2;
  }
  /** Radio de una onda (las de ida y vuelta, back s después de salir, vuelven). */
  function waveR(f, t = f.t) {
    if (t < f.delay) return -1;
    let u = t - f.delay;
    if (f.back && u > f.back) u = Math.max(0, 2 * f.back - u);
    return f.r0 + u * f.spd;
  }
  function inGap(f, x, y) {
    const a = Math.atan2(y - f.y, x - f.x);
    return (f.gaps || []).some(g => { let d = (a - g) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d) < f.gw; });
  }
  const cageR = (f, t = f.t) => f.R0 + (f.R1 - f.R0) * G.U.clamp(t / f.dur, 0, 1);
  /** Ola (Surf): dónde está la pared y si (x, y) está en ella (fuera del hueco). */
  function sweepAt(f, t) { const u = Math.max(0, t - f.delay) * f.spd; return [f.x + f.ax * u, f.y + f.ay * u]; }
  function inSweep(f, x, y, r, t = f.t) {
    if (t < f.delay) return false;
    const [cx, cy] = sweepAt(f, t), px = x - cx, py = y - cy;
    const along = px * f.ax + py * f.ay, lat = -px * f.ay + py * f.ax;
    return Math.abs(along) < f.th / 2 + r && Math.abs(lat) < f.L && Math.abs(lat - f.gap) > f.gw;
  }
  /** Brazos que giran: centro (el jefe, tú o fijo) y dónde está cada orbe. */
  function spinCenter(f) {
    if (f.id) { const e = G.EnemyMgr.get(f.id); if (e && !e.dead) { f.x = e.x; f.y = e.y; } }
    else if (f.tg && f.t < f.delay) { const p = playerBy(f.tg); if (p) { f.x = p.x; f.y = p.y; } }
    return [f.x, f.y];
  }
  function spinOrbs(f, t = f.t) {
    const out = [], k = G.U.clamp((t - f.delay) / Math.max(0.1, f.dur - f.delay), 0, 1), base = f.r0 + (f.r1 - f.r0) * k;
    for (let a = 0; a < f.arms; a++) for (let j = 0; j < f.per; j++) {
      const an = f.a0 + f.av * t + a / f.arms * TAU + j * 0.32 * Math.sign(f.av || 1), rr = base + j * (f.r1 > f.r0 ? -34 : 34);
      if (rr > 4) out.push([f.x + Math.cos(an) * rr, f.y + Math.sin(an) * rr * 0.82]);
    }
    return out;
  }
  function strike(me, f, k = 1) { me.invuln = 0; me.hurt(f.dmg * k, f.type || null, false, f.cat || null); }

  function tickField(f, dt, me) {
    f.t += dt;
    if (f.k === 'orb') {
      const tg = f.ret && f.t > f.dur * 0.45 ? { x: f.x0, y: f.y0 + G.LIFT * 0.5 } : playerBy(f.tg) || nearest(f.x, f.y);
      if (tg) {
        const want = Math.atan2(tg.y - G.LIFT * 0.5 - f.y, tg.x - f.x), cur = Math.atan2(f.vy, f.vx);
        let d = want - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        const na = cur + G.U.clamp(d, -f.turn * dt * (f.ret && f.t > f.dur * 0.45 ? 2.5 : 1), f.turn * dt), sp = f.spd * Math.min(1, 0.4 + f.t);
        f.vx = Math.cos(na) * sp; f.vy = Math.sin(na) * sp;
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.ret && f.t > f.dur * 0.45) f.hitR = 0;
      if (me && !me.dead && !f.hitR && G.U.dist2(f.x, f.y, me.x, me.y - G.LIFT * 0.5) < (f.r + me.r * 0.7) ** 2) {
        strike(me, f); if (f.eff) inflict(me, f.eff);
        G.FX.burst(f.x, f.y, f.col || '#fff', 8, 120);
        if (f.ret) f.hitR = 1; else f.t = f.dur;
      }
      return;
    }
    if (f.vx || f.vy) { f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt; }
    if (f.k === 'spin') spinCenter(f);
    if (!me || me.dead || f.t < (f.delay || 0)) return;
    const mr = me.r * 0.6;
    switch (f.k) {
      case 'pool': case 'band': {
        const inside = f.k === 'pool' ? G.U.dist2(me.x, me.y, f.x, f.y) < (f.r + mr) ** 2 : inBand(f, me.x, me.y, mr);
        // Tornados que atraen (Ciclón Primavera): tiran de ti desde algo más lejos.
        if (f.pull && !inside && G.U.dist2(me.x, me.y, f.x, f.y) < (f.r * 3.2) ** 2) { const [nx, ny] = G.U.norm(f.x - me.x, f.y - me.y); me.x += nx * 70 * dt; me.y += ny * 70 * dt; G.World.collide(me); }
        if (f.terr || !(f.dot || f.slow || f.slide || f.sleep)) return;
        if (!inside) { f.tick = Math.min(f.tick || 0, 0.15); f.in = 0; return; }
        if (f.slide) { ps.ice = 0.12; return; }
        // Charco de Brecha Negra: si te quedas dentro, te duermes.
        if (f.sleep) { me.slowT = Math.max(me.slowT || 0, 0.25); f.in = (f.in || 0) + dt; if (f.in > 0.7) { f.in = -2; inflict(me, 'sleep', 1.2); } return; }
        if (f.slow) me.slowT = Math.max(me.slowT || 0, f.slow > 1 ? f.slow : 0.25);
        if (f.dot) { f.tick = (f.tick || 0) - dt; if (f.tick <= 0) { f.tick = 0.5; me.hurt(f.dot, f.type || null, false, f.cat || null); } }
        break;
      }
      case 'wave': {
        const R2 = waveR(f);
        if (R2 <= 0) return;
        if (f.back && f.t - f.delay > f.back && f.hit === 1) f.hit = 2;     // (a la vuelta puede volver a dar)
        if (f.hit === true || f.hit === 1 || f.hit === 3) return;
        const d = Math.sqrt(G.U.dist2(me.x, me.y, f.x, f.y));
        if (Math.abs(d - R2) < f.th / 2 + mr && !inGap(f, me.x, me.y)) {
          f.hit = f.back ? (f.hit === 2 ? 3 : 1) : true;
          strike(me, f); if (f.slow) me.slowT = Math.max(me.slowT || 0, f.slow); if (f.eff) inflict(me, f.eff);
        }
        break;
      }
      case 'ring': {
        if (f.done || f.t < f.delay) return;
        f.done = true;
        if (G.Camera.sees(f.x, f.y, f.r2)) { G.FX.ring(f.x, f.y, Math.max(4, f.r1), f.r2, f.col || '#fff', 0.35, 6); G.Camera.kick(0.25); }
        const d = Math.sqrt(G.U.dist2(me.x, me.y, f.x, f.y));
        if (d >= f.r1 - mr && d <= f.r2 + mr) { strike(me, f); if (f.slow) me.slowT = Math.max(me.slowT || 0, f.slow); if (f.eff) inflict(me, f.eff); }
        break;
      }
      case 'cage': {
        const Rr = cageR(f), d = Math.sqrt(G.U.dist2(me.x, me.y, f.x, f.y));
        f.cd -= dt;
        if (Math.abs(d - Rr) < 7 + mr && f.cd <= 0 && f.t < f.dur) { f.cd = 0.8; strike(me, f, 0.5); }
        if (!f.done && f.t >= f.dur) { f.done = true; if (d < Rr + mr) strike(me, f, 1.7); }
        break;
      }
      case 'box': {
        const S = cageR(f), d = Math.max(Math.abs(me.x - f.x), Math.abs(me.y - f.y));
        f.cd -= dt;
        if (Math.abs(d - S) < 7 + mr && f.cd <= 0 && f.t < f.dur) { f.cd = 0.8; strike(me, f, 0.5); }
        if (!f.done && f.t >= f.dur) { f.done = true; if (d < S + mr) strike(me, f, 1.7); }
        break;
      }
      case 'sweep': {
        if (f.hit || !inSweep(f, me.x, me.y, mr)) return;
        f.hit = true; strike(me, f); if (f.slow) me.slowT = Math.max(me.slowT || 0, 1.2);
        // La ola te arrastra un poco.
        ps.kx = f.ax * 260; ps.ky = f.ay * 220; ps.kt = 0.3;
        break;
      }
      case 'spin': {
        f.cd -= dt;
        if (f.cd > 0) return;
        for (const [ox, oy] of spinOrbs(f)) if (G.U.dist2(me.x, me.y - G.LIFT * 0.5, ox, oy) < (10 + me.r * 0.7) ** 2) { f.cd = 0.7; strike(me, f); break; }
        break;
      }
      case 'zap': {
        if (f.done) return;
        f.done = true;
        const hit = f.len ? (() => { const ca = Math.cos(f.ang), sa = Math.sin(f.ang), px = me.x - f.x, py = me.y - f.y, al = px * ca + py * sa;
                                     return al > -mr && al < f.len + mr && Math.abs(-px * sa + py * ca) < f.w / 2 + mr; })()
                          : G.U.dist2(me.x, me.y, f.x, f.y) < (f.r + mr) ** 2;
        if (!hit) return;
        if (f.eff === 'knock' && f.len) { const ca = Math.cos(f.ang), sa = Math.sin(f.ang), px = me.x - f.x, py = me.y - f.y, s = (-px * sa + py * ca) >= 0 ? 1 : -1;
                                          inflict(me, 'knock', f.p, me.x + sa * s * 40 - ca * 30, me.y - ca * s * 40 - sa * 30); }
        else inflict(me, f.eff, f.p, f.x, f.y);
        break;
      }
      case 'push': {
        if (G.U.dist2(me.x, me.y, f.x, f.y) > f.r * f.r) return;
        const k = Math.min(1, (f.t - (f.delay || 0)) * 2, (f.dur - f.t) * 2);
        let ax = f.ax, ay = f.ay;
        if (f.rad) { [ax, ay] = G.U.norm(me.x - f.x, me.y - f.y); if (f.f < 0 && G.U.dist2(me.x, me.y, f.x, f.y) < 30 * 30) return; }
        const mx = ax * f.f * k * dt, my = ay * f.f * k * dt;
        const n = Math.max(1, Math.ceil(Math.hypot(mx, my) / Math.max(2, me.wr || 6)));
        for (let i = 0; i < n; i++) { me.x += mx / n; me.y += my / n; G.World.collide(me); }
        break;
      }
      case 'slowall':
        if (G.U.dist2(me.x, me.y, f.x, f.y) < f.r * f.r) me.slowT = Math.max(me.slowT || 0, 0.15);
        break;
    }
  }

  function tickMark(m, dt) {
    const p0 = m.t;
    m.t += dt;
    if (m.k === 'lurk' || m.k === 'cloud') {
      if (m.k === 'cloud' || m.t < m.stop) {
        const tg = playerBy(m.tg) || nearest(m.x, m.y);
        if (tg) { const dx = tg.x - m.x, dy = tg.y - m.y, d = Math.hypot(dx, dy); if (d > 2) { const s = Math.min(d, (m.spd || 170) * dt); m.x += dx / d * s; m.y += dy / d * s; } }
        if (m.k === 'lurk' && Math.random() < dt * 10 && G.Camera.sees(m.x, m.y, 40)) G.FX.px(m.x + G.U.rand(-18, 18), m.y, m.st === 'dig' ? '#c8a060' : m.col || '#8a5cff', { vy: -20, life: 0.4 });
      }
    } else if (m.k === 'dive' || m.k === 'rise' || m.k === 'streak' || m.k === 'decoy') {
      spriteOf(m.dex, m.sc || 1, m.sh).update(dt * 0.5);
      if (m.k === 'dive' && p0 < m.at && m.t >= m.at) { G.FX.ring(m.x, m.y, 8, 110, m.col || '#fff', 0.4, 6); G.FX.burst(m.x, m.y - 8, m.col || '#fff', 14, 180); }
    } else if (m.k === 'hop') {
      const e = G.EnemyMgr.get(m.id);
      if (e && !(e.jump && !e.remote)) e.jumpLift = m.t < m.dur ? Math.abs(Math.sin(m.t * (m.big ? 2.9 : 9))) * (m.big ? 40 : 12) : 0;
    } else if (m.k === 'charge' || m.k === 'bubble') {
      if (Math.random() < dt * 6) { const e = G.EnemyMgr.get(m.id); if (e && G.Camera.sees(e.x, e.y, 40)) G.FX.px(e.x + G.U.rand(-e.r, e.r), e.y - G.U.rand(4, e.bodyH), m.col || '#fff', { vy: -24, life: 0.5 }); }
    } else if (m.k === 'swap') {
      // Cambiaalmas: el Pokémon de quien toca pasa a donde estaba Manaphy.
      const me = G.Game.player;
      if (p0 < m.at && m.t >= m.at && me && !me.dead && uidOf(me) === m.tg) {
        const ox = me.x, oy = me.y;
        me.x = m.x; me.y = m.y;
        if (G.World.isFree && !G.World.isFree(me.x, me.y, Math.min(me.r || 12, 12))) { me.x = ox; me.y = oy; }
        G.World.collide(me);
        G.FX.ring(ox, oy, 6, 70, m.col || '#ff7ab8', 0.4, 4); G.FX.ring(me.x, me.y, 6, 70, m.col || '#ff7ab8', 0.4, 4);
        if (me === G.Game.player) { G.Camera.x = me.x; G.Camera.y = me.y; ps.lx = null; }
      }
    }
  }

  /** Cada fotograma (en todos los ordenadores, desde EnemyMgr.update). */
  function update(dt) {
    clock += dt;
    const me = G.Game.player;
    playerTick(me, dt);
    if (fields.length || marks.length || jobs.length || hides.size) {
      // Escondido: tampoco hace daño al tocarle (combat.js mira touchCd).
      for (const id of hides.keys()) { const e = G.EnemyMgr.get(id); if (e) e.touchCd = Math.max(e.touchCd || 0, 0.2); }
      for (let i = fields.length - 1; i >= 0; i--) { const f = fields[i]; tickField(f, dt, me); if (f.t >= f.dur) fields.splice(i, 1); }
      for (let i = marks.length - 1; i >= 0; i--) { const m = marks[i]; tickMark(m, dt); if (m.t >= m.dur) { if (m.k === 'hop') { const e = G.EnemyMgr.get(m.id); if (e && !e.jump) e.jumpLift = 0; } marks.splice(i, 1); } }
      for (const [id, h] of hides) { h.t += dt; if (h.t >= h.dur || !G.EnemyMgr.get(id)) hides.delete(id); }
      if (jobs.length) {
        for (let i = jobs.length - 1; i >= 0; i--) {
          const j = jobs[i];
          if (j.e.dead || !G.EnemyMgr.get(j.e.id)) { jobs.splice(i, 1); continue; }
          if (clock >= j.at) { jobs.splice(i, 1); try { j.fn(); } catch (err) { console.warn('[BossSig]', err); } }
        }
      }
    }
    if (me && !me.dead) { ps.lx = me.x; ps.ly = me.y; }
  }

  /** Quien manda, cada fotograma de un jefe (bossMove): potenciadores con tiempo y Ceniza Sagrada. */
  function tickBoss(e, dt) {
    if (e.sigHaste && clock < e.sigHaste && e.ai) e.ai.cd -= dt * 0.7;
    if (e.sigArmor) { if (clock < e.sigArmor) e.sigK = Math.min(e.sigK, 0.4); else { e.sigArmor = 0; e.sigK = 1; } }
    // Ho-Oh: renace una vez (se cura una buena parte) al quedarse con poca vida.
    if (e.sig && e.sig.o.rebirth && !e.sigReborn && e.hp < e.maxHp * 0.3) {
      e.sigReborn = true; heal(e, 0.25); label(e, 'Ceniza Sagrada', '#ffd25e');
      G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ffd25e', 24, 220);
    }
  }

  // ---------------- dibujo ----------------

  const now = () => performance.now() / 1000;
  const F = G.BossFX;

  function drawGround(ctx) {
    const T = now(), cam = G.Camera;
    for (const f of fields) {
      if ((f.k === 'pool' || f.k === 'cage' || f.k === 'ring' || f.k === 'box') && !cam.sees(f.x, f.y, (f.r || f.r2 || f.R0 || 200) + 60)) continue;
      const tin = G.U.clamp(f.t / Math.max(0.15, f.delay || 0.25), 0, 1), tout = G.U.clamp((f.dur - f.t) / 0.5, 0, 1), a = Math.min(tin, tout);
      const [c1, c2] = [f.col || '#ff7a9e', f.col2 || '#ffffff'];
      if (f.k === 'pool') {
        if (f.st === 'wind') { F.pool(ctx, f.x, f.y, f.r, 'mist', c1, c2, a, T, f.seed); F.cage(ctx, f.x, f.y - 6, f.r * 0.6, c1, c2, a * 0.8, T, f.seed); }
        else F.pool(ctx, f.x, f.y, f.r, f.slide ? 'ice' : f.whirl ? 'whirl' : f.spk ? (f.spk === 2 ? 'rubble' : 'spikes') : f.st, c1, c2, a * (f.t < (f.delay || 0) ? 0.55 : 1), T, f.seed);
      } else if (f.k === 'band') F.band(ctx, f.x, f.y, f.x2, f.y2, f.w, f.st, c1, c2, a, T, f.seed);
      else if (f.k === 'ring') { if (!f.done) F.annulus(ctx, f.x, f.y, f.r1, f.r2, f.t / f.delay, c1, 1, f.t / f.delay > 0.75 && Math.sin(T * 50) > 0); }
      else if (f.k === 'wave') {
        const R2 = waveR(f);
        if (R2 > 0) F.wave(ctx, f.x, f.y, R2, f.th, f.gaps || [], f.gw, c1, c2, Math.min(1, tout * 1.5), f.st);
        else { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + 6, 0, TAU); ctx.stroke(); ctx.restore(); }
      } else if (f.k === 'cage') F.cage(ctx, f.x, f.y, cageR(f), c1, c2, Math.min(1, f.t * 4), T, f.seed || 7);
      else if (f.k === 'box') F.box(ctx, f.x, f.y, cageR(f), c1, c2, Math.min(1, f.t * 4), T);
      else if (f.k === 'sweep') { if (f.t < f.delay) F.sweepWarn(ctx, f.x, f.y, f.ax, f.ay, f.L, f.gap, f.gw, c1, f.t / f.delay); else { const [cx, cy] = sweepAt(f, f.t); F.sweep(ctx, cx, cy, f.ax, f.ay, f.L, f.th, f.gap, f.gw, c1, c2, tout, T); } }
    }
    for (const m of marks) {
      if (m.k === 'lurk') F.lurk(ctx, m.x, m.y, m.st, m.col || '#8a5cff', T);
      else if (m.k === 'braille') { const e = G.EnemyMgr.get(m.id); if (e) F.braille(ctx, e.x, e.y + 16, m.col || '#ffd25e', G.U.clamp(m.t / 1.2, 0, 1)); }
      else if (m.k === 'clock') F.clock(ctx, m.x, m.y, 90, m.t / m.dur, Math.min(1, m.t * 3, (m.dur - m.t) * 3), T);
      else if (m.k === 'portal') F.portal(ctx, m.x, m.y, 34, Math.min(m.t * 4, (m.dur - m.t) * 4), T);
      else if (m.k === 'cloud') F.cloudShadow(ctx, m.x, m.y, Math.min(1, m.t * 2, (m.dur - m.t) * 2));
      else if (m.k === 'swap') { const me = G.Game.player, a = Math.min(1, m.t * 3, (m.dur - m.t) * 3); F.heart(ctx, m.x, m.y, m.col || '#ff7ab8', a, T); F.heart(ctx, m.x2, m.y2, m.col || '#ff7ab8', a, T); if (me && uidOf(me) === m.tg && m.t < m.at) F.tether(ctx, m.x, m.y - 20, me.x, me.y - 20, m.col || '#ff7ab8', a, T); }
    }
  }

  let anims = new Map();          // sprites de los que caen en picado, de las copias... (por dex)
  function spriteOf(dex, sc, sh) {
    const k = dex + '|' + sc + '|' + sh;
    let a = anims.get(k);
    if (!a) { if (anims.size > 12) anims.clear(); a = new G.Sprites.Animator(dex, sc, !!sh); anims.set(k, a); }
    return a;
  }

  function drawSky(ctx) {
    const T = now(), cam = G.Camera, me = G.Game.player;
    for (const m of marks) {
      if (m.k === 'sky') {
        for (let i = 0; i < m.pts.length; i++) { const [x, y, d] = m.pts[i]; if (cam.sees(x, y, 120)) F.sky(ctx, m.st, x, y, m.t / d, m.col || '#fff', m.col2 || '#fff', T, i * 7 + 3); }
      } else if (m.k === 'dive' || m.k === 'rise') {
        const an = spriteOf(m.dex, m.sc || 1, m.sh);
        an.dir = 0;
        const k = m.k === 'rise' ? G.U.clamp(m.t / 0.45, 0, 1) : G.U.clamp((m.t - (m.at - 0.42)) / 0.42, 0, 1);
        if (m.k === 'dive' && (m.t < m.at - 0.42 || m.t > m.at + 0.05)) {
          if (m.t < m.at) { ctx.save(); ctx.globalAlpha = 0.3 + 0.4 * (m.t / m.at); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(m.x, m.y, 14 + 26 * (m.t / m.at), 6 + 10 * (m.t / m.at), 0, 0, TAU); ctx.fill(); ctx.restore(); }
          continue;
        }
        const lift = m.k === 'rise' ? k * k * 420 : (1 - k) * (1 - k) * 340;
        ctx.save();
        ctx.globalAlpha = 0.6; ctx.strokeStyle = m.col || '#fff'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(m.x, m.y - lift - 30); ctx.lineTo(m.x, m.y - lift - 150); ctx.stroke();
        ctx.restore();
        an.loop('Walk');
        an.draw(ctx, m.x, m.y - lift);
      } else if (m.k === 'streak') {
        // Rayquaza cruzando la arena: estela y su sprite.
        const k = G.U.clamp((m.t - m.at) / 0.38, 0, 1);
        if (m.t < m.at - 0.5 || k >= 1) continue;
        const an = spriteOf(m.dex, m.sc || 1, m.sh), x = m.x + (m.x2 - m.x) * k, y = m.y + (m.y2 - m.y) * k - G.LIFT;
        F.streak(ctx, m.x, m.y - G.LIFT, x, y, m.col || '#7dffb0', m.t < m.at ? 0.35 : 1);
        if (m.t >= m.at) { an.dir = G.Sprites.dirFromAngle(Math.atan2(m.y2 - m.y, m.x2 - m.x)); an.loop('Walk'); an.draw(ctx, x, y + G.LIFT); }
      } else if (m.k === 'decoy') {
        // Copia de Gengar: igual que él, con un temblor que casi no se nota.
        const an = spriteOf(m.dex, m.sc || 1, m.sh), a = Math.min(1, m.t * 4, (m.dur - m.t) * 4);
        an.loop('Idle'); an.dir = me ? G.Sprites.dirFromAngle(Math.atan2(me.y - m.y, me.x - m.x)) : 0;
        if (G.Sprites.drawShadow) G.Sprites.drawShadow(ctx, m.dex, m.x, m.y, m.sc || 1);
        an.draw(ctx, m.x + Math.sin(T * 23 + m.x) * 0.6, m.y, { alpha: a });
      } else if (m.k === 'slash') {
        for (const [x, y, a, L, d] of m.list) {
          if (m.t < d || m.t > d + 0.75) continue;
          const k = (m.t - d) / 0.75;
          const cx = x + Math.cos(a) * L / 2, cy = y + Math.sin(a) * L / 2;
          if (m.st === 'tear') F.tear(ctx, cx, cy, a, L, 1 - k, (x | 0) + (y | 0));
          else { ctx.save(); ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.moveTo(x, y - G.LIFT); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L - G.LIFT); ctx.stroke(); ctx.restore(); }
        }
      } else if (m.k === 'cloud') {
        if (cam.sees(m.x, m.y, 120)) F.cloud(ctx, m.x, m.y - 105, Math.min(1, m.t * 2, (m.dur - m.t) * 2), T, m.seed || 3);
      } else if (m.k === 'glint') {
        const e = G.EnemyMgr.get(m.id);
        if (e) F.glint(ctx, e.x, e.y - e.bodyH * 0.5, m.col || '#f0d8ff', T);
      }
    }
    for (const f of fields) {
      if (f.k === 'orb') { if (cam.sees(f.x, f.y, 30)) F.orb(ctx, f.x, f.y, f.r, f.st, f.col || '#fff', f.col2 || '#fff', T); }
      else if (f.k === 'spin' && f.t > (f.delay || 0) * 0.5) { const a = Math.min(1, f.t * 3, (f.dur - f.t) * 3); ctx.save(); ctx.globalAlpha = a; for (const [ox, oy] of spinOrbs(f)) if (cam.sees(ox, oy, 20)) F.orb(ctx, ox, oy, 9, f.st, f.col || '#fff', f.col2 || '#fff', T); ctx.restore(); }
      else if (f.k === 'push' && f.t > (f.delay || 0) && me && G.U.dist2(me.x, me.y, f.x, f.y) < f.r * f.r) {
        let ax = f.ax, ay = f.ay;
        if (f.rad) [ax, ay] = G.U.norm((me.x - f.x) * Math.sign(f.f || 1), (me.y - f.y) * Math.sign(f.f || 1));
        F.wind(ctx, cam, ax, ay, Math.min(1, (f.t - f.delay) * 2, (f.dur - f.t) * 2), T, f.col || '#d8e8ff');
      }
      else if (f.k === 'slowall' && me && f.t > (f.delay || 0)) {
        ctx.save(); ctx.globalAlpha = 0.16 * Math.min(1, (f.t - f.delay) * 3, (f.dur - f.t) * 3); ctx.fillStyle = '#6ab0ff';
        ctx.fillRect(cam.left(), cam.top(), cam.w, cam.h); ctx.restore();
      }
    }
    // La oscuridad (una sola aunque haya varias), alrededor de tu Pokémon (la niebla, más suave).
    const dk = fields.reduce((a, f) => (f.k === 'dark' ? Math.max(a, Math.min(1, f.t * 1.5, (f.dur - f.t) * 1.5) * (f.soft ? 0.6 : 1)) : a), 0);
    if (dk > 0 && me) F.dark(ctx, cam, me.x, me.y, dk);
    // Lo que le pasa a tu Pokémon: dormido, congelado, confuso, quemado, con sueño.
    if (me && !me.dead && (ps.stun > 0 || ps.conf > 0 || ps.burn > 0 || ps.yawn > 0)) F.status(ctx, me.x, me.y - (me.bodyH || 40), ps.stun > 0 ? ps.sk : '', ps.conf > 0, ps.burn > 0, ps.yawn > 0, T);
    for (const m of marks) {
      if (m.k !== 'label') continue;
      const e = G.EnemyMgr.get(m.id), x = e && !hides.has(e.id) ? e.x : m.x, y = e && !hides.has(e.id) ? e.y - e.bodyH - (e.jumpLift || 0) : m.y;
      const a = Math.min(1, m.t * 6, (m.dur - m.t) * 3), pop = 1 + Math.max(0, 0.18 - m.t) * 2.5;
      // (Dentro de la vista: con un jefe grande arriba del todo, el nombre se salía.)
      const lx = G.U.clamp(x, cam.left() + 70, cam.left() + cam.w - 70), ly = G.U.clamp(y - 22 - m.t * 6, cam.top() + 34, cam.top() + cam.h - 20);
      F.label(ctx, lx, ly, m.txt, m.col || '#ffffff', a, pop);
    }
  }

  const ground = { y: -1e9, draw: drawGround }, sky = { y: 1e9, draw: drawSky };
  /** Para game.js (por EnemyMgr.drawables): lo del suelo, debajo de todo, y lo del aire, encima. */
  function drawables(out) { if (fields.length || marks.length || ps.stun > 0 || ps.conf > 0 || ps.burn > 0 || ps.yawn > 0) out.push(ground, sky); }

  /** ¿Está escondido? (en el aire, bajo tierra: no se dibuja). */
  function hidden(e) { return hides.has(e.id); }

  /** Lo que se ve encima del jefe (burbuja, carga, aura, forma, «Zzz», cansado). */
  function drawOn(ctx, e) {
    if (!marks.length) return;
    const T = now();
    for (const m of marks) {
      if (m.id !== e.id) continue;
      const a = Math.min(1, m.t * 4, (m.dur - m.t) * 3), lift = e.jumpLift || 0;
      if (m.k === 'bubble') F.bubble(ctx, e.x, e.y - e.bodyH * 0.45 - lift, e.r * 1.7, e.bodyH * 0.75, m.col || '#ff6fb8', a, T);
      else if (m.k === 'charge') F.charge(ctx, e.x, e.y - e.bodyH * 0.5 - lift, e.r * 1.4, m.col || '#fff', m.t / m.dur, T);
      else if (m.k === 'aura') F.aura(ctx, e.x, e.y, e.r * 1.8, m.col || '#fff', a, T, !!m.rb);
      else if (m.k === 'form') { F.aura(ctx, e.x, e.y, e.r * 1.7, m.col, a, T, false); if (m.t < 1.2) F.helix(ctx, e.x, e.y, e.bodyH * 1.2, m.col, T); }
      else if (m.k === 'zzz') F.zzz(ctx, e.x, e.y - e.bodyH, T);
      else if (m.k === 'tired') F.tired(ctx, e.x, e.y - e.bodyH - lift, a, T);
    }
  }

  /** Para el bot de las pruebas: campos que hacen daño, con hits(x, y, r, dentro de T s). */
  function botFields() {
    const out = [];
    for (const f of fields) {
      if (!DMGF.has(f.k) || f.terr) continue;
      if ((f.k === 'pool' || f.k === 'band') && !(f.dot || f.slow || f.sleep)) continue;
      out.push({ w: f.k === 'ring' || f.k === 'wave' || f.k === 'cage' || f.k === 'box' || f.k === 'sweep' ? 9 : 4, hits(x, y, r, T) {
        const t = f.t + T;
        if (f.k === 'pool') return t >= (f.delay || 0) && G.U.dist2(x, y, f.x, f.y) < (f.r + r) ** 2;
        if (f.k === 'band') return inBand(f, x, y, r);
        if (f.k === 'orb') return G.U.dist2(x, y, f.x + f.vx * T, f.y + f.vy * T) < (f.r + r + 6) ** 2;
        if (f.k === 'sweep') return !f.hit && inSweep(f, x, y, r + 6, t);
        if (f.k === 'spin') return t >= f.delay && spinOrbs(f, t).some(([ox, oy]) => G.U.dist2(x, y, ox, oy) < (r + 16) ** 2);
        const d = Math.sqrt(G.U.dist2(x, y, f.x, f.y));
        if (f.k === 'ring') return !f.done && f.delay - t < 0.45 && d >= f.r1 - r && d <= f.r2 + r;
        if (f.k === 'wave') { const R2 = waveR(f, t); return R2 > 0 && f.hit !== true && Math.abs(d - R2) < f.th / 2 + r + 6 && !inGap(f, x, y); }
        if (f.k === 'cage') return d < cageR(f, t) + r && t > f.dur - 0.9;
        if (f.k === 'box') return Math.max(Math.abs(x - f.x), Math.abs(y - f.y)) < cageR(f, t) + r && t > f.dur - 0.9;
        return false;
      } });
    }
    return out;
  }

  return { init, due, start, cast, tickBoss, update, clear, onNet, drawables, hidden, drawOn, botFields, forDex, flavorOf, SIG, BY_TYPE,
           /** Para las pruebas: lo que le pasa a tu Pokémon. */
           get status() { return ps; },
           get fields() { return fields; }, get marks() { return marks; } };
})();
