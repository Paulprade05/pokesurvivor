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
      if (ai.cast) return this.bossCast(dt, pl);
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

    /** Zona o rayo con aviso, con la categoría de sus golpes (tu defensa que la para). */
    hazard(o) { G.Hazards.add(Object.assign({ cat: this.cat }, o)); }

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

  G.EnemyMgr = (() => {
    let list = [];            // vivos
    let corpses = [];         // cayendo / desvaneciéndose
    const CELL = 52;
    const grid = new Map();

    const byId = new Map();
    function clear() { list = []; corpses = []; grid.clear(); byId.clear(); }
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
    }

    /** Al volver: quita los de la arena y devuelve los del mapa (avisando a los demás). */
    function restore() {
      for (const e of list) { byId.delete(e.id); if (G.Coop.isHost) G.Coop.enemyGone(e, false); }
      list = []; corpses = [];
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
