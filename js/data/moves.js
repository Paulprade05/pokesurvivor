/* ============ moves.js — catálogo de movimientos ============
 *
 * kind (comportamiento, implementado en systems/combat.js):
 *   projectile  dispara `count` proyectiles al enemigo más cercano
 *   melee       golpe en arco alrededor del Pokémon
 *   beam        rayo recto que atraviesa todo lo que pilla
 *   orbit       orbes que giran alrededor mientras el movimiento está activo
 *   nova        ráfaga radial en todas las direcciones
 *   aura        círculo de daño continuo alrededor
 *   buff        potencia al propio Pokémon (acumulable, caduca)
 *   ---- desde 2026-10-10 (mismos gráficos, otra forma de jugar) ----
 *   boomerang   sale hacia el enemigo y vuelve a ti, golpeando a la ida y a la vuelta
 *   chain       golpea a uno y salta a los `count` siguientes más cercanos
 *   mine        minas en el suelo que estallan al pisarlas
 *   meteor      caen `count` meteoros sobre enemigos cercanos (avisa la sombra)
 *   turret      deja algo que dispara solo durante `dur` segundos
 *   dash        cruzas hacia el enemigo golpeando todo el camino (sin recibir daño)
 *   trail       vas dejando charcos que dañan a lo que los pisa
 *   cone        muchos disparos cortos en abanico (aliento, chorro...)
 *   ---- desde 2026-10-19 (más ataques por tipo; mismos gráficos) ----
 *   homing      proyectiles que persiguen al enemigo
 *   bounce      un proyectil que rebota de enemigo en enemigo `bounce` veces
 *   charge      se carga `charge` s y sale un rayo enorme
 *   spin        giras golpeando todo alrededor `count` veces seguidas
 *   quake       una onda avanza por el suelo en línea: `count` explosiones
 *   vortex      un remolino atrae a los enemigos a su centro y les va dañando
 *   shove       onda alrededor que daña y aparta a los enemigos
 *   stun        zona con aviso que daña y deja aturdidos (quietos) `stun` s
 *   ---- desde 2026-10-22 (inspiradas en Vampire Survivors) ----
 *   lob         `count` proyectiles en parábola de pantalla: suben, caen sobre el enemigo y atraviesan
 *   knife       ráfaga de `count` disparos rápidos hacia donde MIRAS (no al enemigo)
 *   cross       `count` aspas repartidas a tu alrededor; con `curl` giran en espiral
 *   column      columnas de arriba abajo (`anchor` self: sobre ti; target: en el enemigo)
 *   sweep       rayo anclado en ti que gira como una aguja de reloj `dur` s
 *   ricochet    bola que rebota en los bordes de una caja fija alrededor de ti `dur` s
 *   wipe        barrido de pantalla: tras `delay` s alcanza a todos los de una caja fija
 *               (`mode` exec: debilita a los muy tocados · cut: quita `pct` de su vida y duerme)
 *   ward        escudos: gana uno cada `cd` s (hasta `count`); cada uno para un golpe y contraataca
 *   ally        `count` aliados que persiguen y golpean a los enemigos cercanos `dur` s
 *   wings       aves que vuelan en círculo lejos de ti y bombardean cada `rate` s
 *   puddle      frascos sobre enemigos: dejan charcos que dañan `dur` s
 *   dusting     lluvia de `count` caídas desde lo alto de la pantalla
 *
 * Pasivos de la run (cartas Amplitud, Persistencia, Réplica, Propulsión): ver
 * PASSIVE_RULES y applyPassives; cada instancia se rehace con rebake().
 *
 * Sólo el movimiento ACTIVO se ejecuta. Se cambia con 1-4 / Q / E.
 *
 * El icono no se guarda aquí: G.Icons lo compone (emblema del tipo +
 * insignia de la familia), ver ui/icons.js.
 *
 * Las mejoras (lvl 1 -> 5) salen de una escalera común por `kind` (o de la
 * propia del movimiento, LADDER_BY_ID: Canto Mortal y Brecha Negra):
 *   mods multiplicativos -> dmg, cd, speed, radius, dur, amount, arc
 *   mods aditivos        -> count, pierce, stacks
 */
(() => {
  const LADDERS = {
    projectile: [
      { t: '+1 proyectil',                  m: { count: 1, spread: 1.4 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+1 proyectil y +1 perforación',   m: { count: 1, pierce: 1, spread: 1.2 } }
    ],
    melee: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% alcance',                  m: { radius: 1.25 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: 'Golpea en 360° y +50% daño',    m: { arc: 9, dmg: 1.50 } }
    ],
    beam: [
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% alcance y grosor',         m: { radius: 1.30, width: 1.30 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } }
    ],
    orbit: [
      { t: '+1 orbe',                       m: { count: 1 } },
      { t: '+55% daño',                     m: { dmg: 1.55 } },
      { t: '+25% radio y gira más rápido',  m: { radius: 1.25, speed: 1.35 } },
      { t: '+1 orbe y +55% daño',           m: { count: 1, dmg: 1.55 } }
    ],
    nova: [
      { t: '+4 proyectiles',                m: { count: 4 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+4 proyectiles y +1 perforación', m: { count: 4, pierce: 1 } }
    ],
    aura: [
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: 'Golpea un 40% más a menudo',    m: { cd: 0.70 } },
      { t: '+30% radio y +50% daño',        m: { radius: 1.30, dmg: 1.50 } }
    ],
    boomerang: [
      { t: '+1 bumerán',                    m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% alcance',                  m: { radius: 1.30 } },
      { t: '+1 bumerán y +40% daño',        m: { count: 1, dmg: 1.40 } }
    ],
    chain: [
      { t: '+2 saltos',                     m: { count: 2 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+2 saltos y +40% daño',         m: { count: 2, dmg: 1.40 } }
    ],
    mine: [
      { t: '+1 mina',                       m: { count: 1 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '+30% radio de explosión',       m: { radius: 1.30 } },
      { t: '+1 mina y -25% recarga',        m: { count: 1, cd: 0.75 } }
    ],
    meteor: [
      { t: '+1 meteoro',                    m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+2 meteoros y -20% recarga',    m: { count: 2, cd: 0.80 } }
    ],
    turret: [
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: 'Dispara un 35% más rápido',     m: { rate: 0.74 } },
      { t: '+1 a la vez',                   m: { count: 1 } },
      { t: '+50% duración y +40% daño',     m: { dur: 1.50, dmg: 1.40 } }
    ],
    dash: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% distancia',                m: { radius: 1.30 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+60% daño y más ancho',         m: { dmg: 1.60, width: 1.40 } }
    ],
    trail: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+40% duración',                 m: { dur: 1.40 } },
      { t: 'Charcos un 30% más grandes',    m: { radius: 1.30 } },
      { t: '+50% daño y +30% radio',        m: { dmg: 1.50, radius: 1.30 } }
    ],
    cone: [
      { t: '+3 disparos',                   m: { count: 3 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% alcance',                  m: { life: 1.30 } },
      { t: '+3 disparos y +1 perforación',  m: { count: 3, pierce: 1 } }
    ],
    homing: [
      { t: '+1 proyectil',                  m: { count: 1, spread: 1.3 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+1 proyectil y +40% daño',      m: { count: 1, dmg: 1.40 } }
    ],
    bounce: [
      { t: '+1 rebote',                     m: { bounce: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+1 proyectil y +1 rebote',      m: { count: 1, bounce: 1, spread: 1.3 } }
    ],
    charge: [
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% alcance y grosor',         m: { radius: 1.30, width: 1.30 } },
      { t: 'Carga más rápido y -20% recarga', m: { charge: 0.7, cd: 0.8 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } }
    ],
    spin: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% radio',                    m: { radius: 1.25 } },
      { t: '+1 vuelta',                     m: { count: 1 } },
      { t: '-25% recarga y +30% daño',      m: { cd: 0.75, dmg: 1.30 } }
    ],
    quake: [
      { t: '+2 ondas',                      m: { count: 2 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+25% tamaño',                   m: { radius: 1.25 } },
      { t: '-25% recarga y +2 ondas',       m: { cd: 0.75, count: 2 } }
    ],
    vortex: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+50% duración',                 m: { dur: 1.50 } },
      { t: 'Atrae más fuerte y +40% daño',  m: { pull: 1.40, dmg: 1.40 } }
    ],
    shove: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% radio',                    m: { radius: 1.25 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+50% empuje y +40% daño',       m: { knock: 1.50, dmg: 1.40 } }
    ],
    stun: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% radio',                    m: { radius: 1.25 } },
      { t: '+50% aturdimiento',             m: { stun: 1.50 } },
      { t: '-25% recarga y +30% daño',      m: { cd: 0.75, dmg: 1.30 } }
    ],
    buff: [
      { t: '+1 acumulación máxima',         m: { stacks: 1 } },
      { t: '+40% potencia',                 m: { amount: 1.40 } },
      { t: '+50% duración',                 m: { dur: 1.50 } },
      { t: '+1 acumulación y +40% potencia', m: { stacks: 1, amount: 1.40 } }
    ],
    // ---- familias nuevas (22-10-2026) ----
    lob: [
      { t: '+1 proyectil',                  m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+1 perforación y más grandes',  m: { pierce: 1, size: 1.25 } },
      { t: '+1 proyectil y -20% recarga',   m: { count: 1, cd: 0.80 } }
    ],
    knife: [
      { t: '+1 disparo',                    m: { count: 1 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+1 disparo y +1 perforación',   m: { count: 1, pierce: 1 } },
      { t: '-25% recarga y +30% daño',      m: { cd: 0.75, dmg: 1.30 } }
    ],
    cross: [
      { t: '+2 aspas',                      m: { count: 2 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+1 perforación y +25% alcance', m: { pierce: 1, life: 1.25 } },
      { t: '+2 aspas y -20% recarga',       m: { count: 2, cd: 0.80 } }
    ],
    column: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+1 columna',                    m: { count: 1 } },
      { t: '+25% de alto y de ancho',       m: { height: 1.25, width: 1.25 } },
      { t: '+1 columna y -15% recarga',     m: { count: 1, cd: 0.85 } }
    ],
    sweep: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% de largo',                 m: { radius: 1.25 } },
      { t: '+1 rayo',                       m: { count: 1 } },
      { t: 'Gira un 30% más rápido y +40% daño', m: { turn: 1.30, dmg: 1.40 } }
    ],
    ricochet: [
      { t: '+1 proyectil',                  m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+40% duración y +20% velocidad', m: { dur: 1.40, speed: 1.20 } },
      { t: '+1 proyectil y +40% daño',      m: { count: 1, dmg: 1.40 } }
    ],
    // (Los barridos llevan cada uno la suya: LADDER_BY_ID.)
    wipe: [
      { t: '+10% de efecto',                m: { pct: 0.10 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '-15% recarga',                  m: { cd: 0.85 } },
      { t: '+10% de efecto y -15% recarga', m: { pct: 0.10, cd: 0.85 } }
    ],
    ward: [
      { t: '+1 escudo',                     m: { count: 1 } },
      { t: '+50% daño del contraataque',    m: { dmg: 1.50 } },
      { t: '-20% recarga de los escudos',   m: { cd: 0.80 } },
      { t: '+1 escudo y +30% radio del contraataque', m: { count: 1, radius: 1.30 } }
    ],
    ally: [
      { t: '+1 aliado',                     m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+40% duración y +20% velocidad', m: { dur: 1.40, speed: 1.20 } },
      { t: '+1 aliado y +40% daño',         m: { count: 1, dmg: 1.40 } }
    ],
    wings: [
      { t: '+1 ave',                        m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% explosión y bombardean un 15% más a menudo', m: { radius: 1.30, rate: 0.85 } },
      { t: '+1 ave y +40% daño',            m: { count: 1, dmg: 1.40 } }
    ],
    puddle: [
      { t: '+1 charco',                     m: { count: 1 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+50% duración y +40% daño',     m: { dur: 1.50, dmg: 1.40 } }
    ],
    dusting: [
      { t: '+4 caídas',                     m: { count: 4 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% tamaño y caen un 20% más rápido', m: { size: 1.30, speed: 1.20 } },
      { t: '+4 caídas y -20% recarga',      m: { count: 4, cd: 0.80 } }
    ]
  };

  // Escaleras propias de un movimiento (si no, la de su familia).
  const LADDER_BY_ID = {
    'perish-song': [
      { t: '+10% al umbral de KO',          m: { pct: 0.10 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '-15% recarga',                  m: { cd: 0.85 } },
      { t: '+10% al umbral de KO y -15% recarga', m: { pct: 0.10, cd: 0.85 } }
    ],
    'dark-void': [
      { t: '+10% de vida quitada',          m: { pct: 0.10 } },
      { t: '+40% de sueño',                 m: { stun: 1.40 } },
      { t: '-15% recarga',                  m: { cd: 0.85 } },
      { t: '+10% de vida quitada y +50% daño', m: { pct: 0.10, dmg: 1.50 } }
    ]
  };

  // (23-10-2026: daños retocados con tools/balance.cjs, que lanza cada ataque contra un jefe
  //  y contra una horda con el combate de verdad: ninguno muy por encima ni por debajo del
  //  resto a su nivel. Bajan Puño Meteoro, Enfado, Púas, Rueda Fuego, Cañón Floral, Látigo
  //  Cepa, Carantoña, Garra Dragón, Golpe Kárate, Tormenta Floral y Giro Bola; suben los
  //  rayos, cadenas, torretas, aturdir, aspas, rebotes, remolinos, ráfagas y lluvias.)
  const RAW = [
    // ---------------- NORMAL (pool común a todos) ----------------
    { id: 'tackle', name: 'Placaje', type: 'normal', kind: 'melee',
      desc: 'Embiste en arco a todo lo que tengas delante.',
      cd: 0.50, dmg: 13, radius: 48, arc: 1.7, knock: 90 },

    { id: 'quick-attack', name: 'Ataque Rápido', type: 'normal', kind: 'dash',
      desc: 'Cruzas como un rayo hacia el enemigo y golpeas todo el camino.',
      cd: 0.75, dmg: 22, radius: 110, width: 34, knock: 40 },

    { id: 'swords-dance', name: 'Danza Espada', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula ATAQUE (físico) mientras esté activo.',
      cd: 0.85, stat: 'patk', amount: 0.13, dur: 7, stacks: 5 },
    // Como Danza Espada, para los especiales (en los juegos es Siniestro; aquí
    // va en el grupo Normal para que la pueda aprender cualquiera).
    { id: 'nasty-plot', name: 'Maquinación', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula ATAQUE ESPECIAL mientras esté activo.',
      cd: 0.85, stat: 'satk', amount: 0.13, dur: 7, stacks: 5 },

    { id: 'agility', name: 'Agilidad', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula VELOCIDAD mientras esté activo.',
      cd: 0.85, stat: 'spd', amount: 0.10, dur: 7, stacks: 5 },

    { id: 'harden', name: 'Fortaleza', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula DEFENSA mientras esté activo.',
      cd: 0.85, stat: 'def', amount: 0.07, dur: 7, stacks: 5 },

    // ---------------- FUEGO ----------------
    { id: 'ember', name: 'Ascuas', type: 'fire', kind: 'projectile',
      desc: 'Bola de fuego al enemigo más cercano.',
      cd: 0.52, dmg: 18, speed: 310, count: 1, spread: 0.12, pierce: 0, life: 1.6, size: 7, burn: 1 },

    { id: 'flamethrower', name: 'Lanzallamas', type: 'fire', kind: 'cone',
      desc: 'Chorro de llamas en abanico corto que quema.',
      cd: 0.70, dmg: 7, count: 7, arc: 0.9, speed: 380, life: 0.42, size: 6, pierce: 1, burn: 1 },

    { id: 'fire-spin', name: 'Giro Fuego', type: 'fire', kind: 'orbit',
      desc: 'Llamas que giran a tu alrededor. Defensa constante.',
      cd: 0.30, dmg: 14, count: 3, radius: 62, speed: 2.4, size: 9, burn: 1 },

    { id: 'heat-wave', name: 'Onda Ígnea', type: 'fire', kind: 'nova',
      desc: 'Explota en llamas en todas las direcciones.',
      cd: 1.25, dmg: 13, speed: 250, count: 10, pierce: 1, life: 1.1, size: 7, burn: 1 },

    // ---------------- AGUA ----------------
    { id: 'water-gun', name: 'Pistola Agua', type: 'water', kind: 'projectile',
      desc: 'Chorro perforante. Fiable a cualquier distancia.',
      cd: 0.44, dmg: 14, speed: 350, count: 1, spread: 0.10, pierce: 1, life: 1.5, size: 6 },

    { id: 'bubble', name: 'Burbuja', type: 'water', kind: 'nova',
      desc: 'Burbujas en abanico que ralentizan a quien tocan.',
      cd: 1.00, dmg: 10, speed: 210, count: 8, pierce: 0, life: 1.3, size: 8, slow: 0.45 },

    { id: 'hydro-pump', name: 'Hidrobomba', type: 'water', kind: 'beam',
      desc: 'Cañonazo de agua lento pero devastador.',
      cd: 1.50, dmg: 35, radius: 250, width: 30 },

    { id: 'aqua-ring', name: 'Acua Aro', type: 'water', kind: 'buff',
      desc: 'No hace daño: acumula REGENERACIÓN de vida.',
      cd: 0.90, stat: 'regen', amount: 1.6, dur: 8, stacks: 4 },

    // ---------------- PLANTA ----------------
    { id: 'vine-whip', name: 'Látigo Cepa', type: 'grass', kind: 'melee',
      desc: 'Látigos de largo alcance en arco amplio.',
      cd: 0.62, dmg: 13, radius: 68, arc: 1.3, knock: 60 },

    { id: 'razor-leaf', name: 'Hoja Afilada', type: 'grass', kind: 'boomerang',
      desc: 'Dos hojas que van y vuelven cortando a la ida y a la vuelta.',
      cd: 0.90, dmg: 10, speed: 330, count: 2, spread: 0.5, radius: 210, size: 6 },

    { id: 'leaf-storm', name: 'Tormenta Floral', type: 'grass', kind: 'orbit',
      desc: 'Un ciclón de hojas gira amplio a tu alrededor.',
      cd: 0.26, dmg: 13, count: 4, radius: 74, speed: 2.6, size: 8 },

    // (Antes Gigadrenado: curaba con cada golpe y estaba roto. Mismo id para no romper partidas.)
    { id: 'giga-drain', name: 'Hierba Lazo', type: 'grass', kind: 'aura',
      desc: 'Raíces que atrapan y machacan todo lo que tienes cerca.',
      cd: 0.55, dmg: 9, radius: 76 },

    // ---------------- ELÉCTRICO ----------------
    { id: 'thunder-shock', name: 'Impactrueno', type: 'electric', kind: 'projectile',
      desc: 'Descarga rapidísima que atraviesa varios enemigos.',
      cd: 0.40, dmg: 13, speed: 480, count: 1, spread: 0.08, pierce: 2, life: 1.1, size: 5 },

    { id: 'discharge', name: 'Chispazo', type: 'electric', kind: 'aura',
      desc: 'Campo eléctrico permanente alrededor de ti.',
      cd: 0.45, dmg: 8, radius: 70 },

    { id: 'thunderbolt', name: 'Rayo', type: 'electric', kind: 'chain',
      desc: 'Un rayo que salta de un enemigo a otro.',
      cd: 0.95, dmg: 29, count: 4, radius: 140 },

    // ---------------- PSÍQUICO ----------------
    // (11-10-2026: -22/-30 % de daño y persiguen menos; llenaban el ranking.)
    { id: 'confusion', name: 'Confusión', type: 'psychic', kind: 'projectile',
      desc: 'Onda que persigue sola a su objetivo.',
      cd: 0.58, dmg: 13, speed: 280, count: 1, spread: 0.1, pierce: 0, life: 2.2, size: 8, homing: 2.0 },

    { id: 'psybeam', name: 'Psicorrayo', type: 'psychic', kind: 'beam',
      desc: 'Rayo psíquico ancho y contundente.',
      cd: 1.15, dmg: 23, radius: 215, width: 40 },

    { id: 'psychic', name: 'Psíquico', type: 'psychic', kind: 'nova',
      desc: 'Estallido mental radial que busca enemigos.',
      cd: 1.35, dmg: 11, speed: 230, count: 12, pierce: 1, life: 1.6, size: 7, homing: 1.0 },

    // ---------------- TIPOS SECUNDARIOS ----------------
    { id: 'sludge', name: 'Residuos', type: 'poison', kind: 'projectile',
      desc: 'Lodo tóxico que envenena al impactar.',
      cd: 0.60, dmg: 17, speed: 290, count: 1, spread: 0.12, pierce: 0, life: 1.5, size: 8, poison: 1 },

    { id: 'mud-shot', name: 'Disparo Lodo', type: 'ground', kind: 'nova',
      desc: 'Salpica lodo alrededor y ralentiza.',
      cd: 1.10, dmg: 12, speed: 200, count: 7, pierce: 0, life: 1.0, size: 9, slow: 0.4 },

    { id: 'gust', name: 'Tornado', type: 'flying', kind: 'orbit',
      desc: 'Remolinos de viento que te escoltan.',
      cd: 0.26, dmg: 13, count: 3, radius: 72, speed: 2.8, size: 8, knock: 40 },

    { id: 'wing-attack', name: 'Ataque Ala', type: 'flying', kind: 'melee',
      desc: 'Barrido de alas amplio que empuja.',
      cd: 0.55, dmg: 14, radius: 58, arc: 1.9, knock: 70 },

    // ---------------- NORMAL (extra) ----------------
    { id: 'body-slam', name: 'Golpe Cuerpo', type: 'normal', kind: 'melee',
      desc: 'Placaje con todo el peso: lento, corto y brutal.',
      cd: 0.95, dmg: 30, radius: 46, arc: 2.2, knock: 140 },

    { id: 'hyper-voice', name: 'Vozarrón', type: 'normal', kind: 'nova',
      desc: 'Onda sonora que sale en todas direcciones.',
      cd: 1.15, dmg: 12, speed: 260, count: 9, pierce: 1, life: 0.9, size: 7 },

    // ---------------- VENENO (extra) ----------------
    { id: 'poison-sting', name: 'Picotazo Veneno', type: 'poison', kind: 'projectile',
      desc: 'Aguijón rápido que envenena.',
      cd: 0.34, dmg: 8, speed: 420, count: 1, spread: 0.08, pierce: 0, life: 1.0, size: 4, poison: 1 },

    { id: 'toxic', name: 'Tóxico', type: 'poison', kind: 'trail',
      desc: 'Vas dejando charcos de veneno que intoxican a quien los pisa.',
      cd: 0.3, dmg: 6, radius: 26, dur: 3, poison: 1 },

    // ---------------- TIERRA (extra) ----------------
    { id: 'bulldoze', name: 'Terratemblor', type: 'ground', kind: 'aura',
      desc: 'Sacude el suelo: daña y frena a lo cercano.',
      cd: 0.7, dmg: 11, radius: 80, slow: 0.35 },

    // ---------------- BICHO ----------------
    { id: 'bug-bite', name: 'Picadura', type: 'bug', kind: 'melee',
      desc: 'Mordisco rápido en arco corto.',
      cd: 0.42, dmg: 11, radius: 44, arc: 1.6, knock: 40 },

    { id: 'string-shot', name: 'Disparo Demora', type: 'bug', kind: 'mine',
      desc: 'Deja telarañas en el suelo que atrapan y frenan mucho al que las pisa.',
      cd: 1.1, dmg: 14, count: 2, radius: 56, dur: 7, slow: 0.6 },

    { id: 'bug-buzz', name: 'Zumbido', type: 'bug', kind: 'aura',
      desc: 'Vibración constante que machaca lo cercano.',
      cd: 0.45, dmg: 8, radius: 66 },

    // ---------------- ROCA ----------------
    { id: 'rock-throw', name: 'Lanzarrocas', type: 'rock', kind: 'projectile',
      desc: 'Pedrusco pesado que empuja al enemigo.',
      cd: 0.7, dmg: 24, speed: 260, count: 1, spread: 0.12, pierce: 0, life: 1.4, size: 9, knock: 90 },

    { id: 'rock-slide', name: 'Avalancha', type: 'rock', kind: 'meteor',
      desc: 'Caen rocas del cielo sobre los enemigos cercanos.',
      cd: 1.3, dmg: 21, count: 3, radius: 46, knock: 50 },     // (12-10-2026: era 26; mataba el doble que la media)

    // ---------------- HIELO ----------------
    { id: 'ice-beam', name: 'Rayo Hielo', type: 'ice', kind: 'beam',
      desc: 'Rayo helado que congela casi del todo.',
      cd: 1.1, dmg: 26, radius: 220, width: 30, slow: 0.7 },

    { id: 'powder-snow', name: 'Nieve Polvo', type: 'ice', kind: 'aura',
      desc: 'Ventisca a tu alrededor que ralentiza.',
      cd: 0.55, dmg: 8, radius: 76, slow: 0.45 },

    // ---------------- LUCHA ----------------
    { id: 'karate-chop', name: 'Golpe Kárate', type: 'fighting', kind: 'melee',
      desc: 'Golpe seco y potente al frente.',
      cd: 0.5, dmg: 16, radius: 50, arc: 1.2, knock: 110 },

    { id: 'aura-sphere', name: 'Esfera Aural', type: 'fighting', kind: 'projectile',
      desc: 'Esfera de energía que nunca falla.',
      cd: 0.62, dmg: 17, speed: 300, count: 1, spread: 0.1, pierce: 0, life: 2.0, size: 8, homing: 4 },

    // ---------------- FANTASMA ----------------
    { id: 'lick', name: 'Lengüetazo', type: 'ghost', kind: 'melee',
      desc: 'Lametazo espectral que paraliza un poco.',
      cd: 0.48, dmg: 12, radius: 48, arc: 1.8, slow: 0.4 },

    { id: 'shadow-ball', name: 'Bola Sombra', type: 'ghost', kind: 'projectile',
      desc: 'Esfera oscura que atraviesa a varios.',
      cd: 0.66, dmg: 19, speed: 280, count: 1, spread: 0.1, pierce: 2, life: 1.6, size: 9 },

    // ---------------- DRAGÓN ----------------
    { id: 'dragon-rage', name: 'Furia Dragón', type: 'dragon', kind: 'beam',
      desc: 'Llamarada dracónica en línea recta.',
      cd: 1.0, dmg: 26, radius: 230, width: 34 },

    { id: 'dragon-dance', name: 'Danza Dragón', type: 'dragon', kind: 'buff',
      desc: 'No hace daño: acumula ATAQUE (físico) más rápido que Danza Espada.',
      cd: 0.7, stat: 'patk', amount: 0.11, dur: 7, stacks: 5 },

    // ---------------- HADA ----------------
    { id: 'fairy-wind', name: 'Viento Feérico', type: 'fairy', kind: 'nova',
      desc: 'Brisa mágica en todas direcciones.',
      cd: 1.0, dmg: 11, speed: 230, count: 10, pierce: 0, life: 1.2, size: 7 },

    { id: 'dazzling-gleam', name: 'Brillo Mágico', type: 'fairy', kind: 'aura',
      desc: 'Destello a tu alrededor.',
      cd: 0.5, dmg: 9, radius: 72 },

    // ---------------- ACERO ----------------
    { id: 'metal-claw', name: 'Garra Metal', type: 'steel', kind: 'melee',
      desc: 'Zarpazo de acero en arco.',
      cd: 0.5, dmg: 15, radius: 50, arc: 1.6, knock: 60 },

    { id: 'flash-cannon', name: 'Foco Resplandor', type: 'steel', kind: 'beam',
      desc: 'Rayo de luz metálica que perfora.',
      cd: 1.05, dmg: 27, radius: 220, width: 30 },

    // ---------------- SINIESTRO ----------------
    { id: 'bite', name: 'Mordisco', type: 'dark', kind: 'melee',
      desc: 'Dentellada rápida que hace retroceder.',
      cd: 0.45, dmg: 14, radius: 46, arc: 1.5, knock: 70 },

    { id: 'dark-pulse', name: 'Pulso Umbrío', type: 'dark', kind: 'nova',
      desc: 'Onda de energía oscura en todas direcciones.',
      cd: 1.15, dmg: 14, speed: 240, count: 10, pierce: 1, life: 1.1, size: 8 },

    { id: 'night-shade', name: 'Tinieblas', type: 'dark', kind: 'aura',
      desc: 'Una sombra te rodea y consume lo cercano.',
      cd: 0.5, dmg: 9, radius: 72 },

    // ---------------- NUEVOS (2026-10-10): mismas formas, otras mecánicas ----------------
    { id: 'bonemerang', name: 'Huesomerang', type: 'ground', kind: 'boomerang',
      desc: 'Un hueso que va y vuelve golpeando fuerte.',
      cd: 0.95, dmg: 16, speed: 300, count: 1, radius: 230, size: 8, knock: 40 },

    { id: 'psycho-cut', name: 'Psicocorte', type: 'psychic', kind: 'boomerang',
      desc: 'Cuchillas psíquicas que vuelven a ti.',
      cd: 0.8, dmg: 9, speed: 360, count: 2, spread: 0.6, radius: 200, size: 7 },

    { id: 'spikes', name: 'Púas', type: 'ground', kind: 'mine',
      desc: 'Siembra púas que estallan al pisarlas.',
      cd: 1.2, dmg: 15, count: 2, radius: 60, dur: 8 },

    { id: 'toxic-spikes', name: 'Púas Tóxicas', type: 'poison', kind: 'mine',
      desc: 'Púas venenosas que envenenan mucho al estallar.',
      cd: 1.1, dmg: 11, count: 2, radius: 56, dur: 8, poison: 2 },

    { id: 'hail', name: 'Granizo', type: 'ice', kind: 'meteor',
      desc: 'Bolas de hielo caen sobre los enemigos y los frenan.',
      cd: 1.2, dmg: 18, count: 4, radius: 40, slow: 0.4 },

    { id: 'meteor-mash', name: 'Puño Meteoro', type: 'steel', kind: 'meteor',
      desc: 'Dos meteoros de acero que aplastan donde caen.',
      cd: 1.4, dmg: 23, count: 2, radius: 54, knock: 80 },

    { id: 'will-o-wisp', name: 'Fuego Fatuo', type: 'fire', kind: 'turret',
      desc: 'Deja una llama flotante que dispara sola y quema.',
      cd: 3.5, dmg: 18, rate: 0.55, dur: 6, count: 1, range: 300, speed: 300, size: 7, burn: 1 },

    { id: 'substitute', name: 'Sustituto', type: 'normal', kind: 'turret',
      desc: 'Un muñeco que se queda disparando por ti.',
      cd: 4.0, dmg: 17, rate: 0.4, dur: 6, count: 1, range: 280, speed: 320, size: 6 },

    { id: 'aerial-ace', name: 'Golpe Aéreo', type: 'flying', kind: 'dash',
      desc: 'Te lanzas en picado y cortas todo lo que cruzas.',
      cd: 0.75, dmg: 18, radius: 120, width: 40, knock: 60 },

    { id: 'flame-wheel', name: 'Rueda Fuego', type: 'fire', kind: 'trail',
      desc: 'Corres envuelto en fuego y dejas un rastro de llamas.',
      cd: 0.28, dmg: 8, radius: 28, dur: 2.6, burn: 1 },

    { id: 'bubble-beam', name: 'Rayo Burbuja', type: 'water', kind: 'cone',
      desc: 'Chorro de burbujas en abanico corto que frena.',
      cd: 0.65, dmg: 6, count: 7, arc: 1.0, speed: 340, life: 0.45, size: 6, slow: 0.3 },

    { id: 'hex', name: 'Infortunio', type: 'ghost', kind: 'chain',
      desc: 'Maldición que salta entre enemigos. Mucho más daño si están quemados, envenenados o frenados.',
      cd: 0.9, dmg: 23, count: 4, radius: 150, hex: 1.7 },

    // ================= NUEVOS (19-10-2026): todos los tipos con 5 o más =================
    // Normal
    { id: 'hyper-beam', name: 'Hiperrayo', type: 'normal', kind: 'charge',
      desc: 'Se carga un momento y suelta un rayo enorme que lo atraviesa todo.',
      cd: 2.2, charge: 0.75, dmg: 58, radius: 300, width: 44 },
    { id: 'rapid-spin', name: 'Giro Rápido', type: 'normal', kind: 'spin',
      desc: 'Giras sobre ti mismo golpeando todo lo que te rodea varias veces.',
      cd: 1.0, dmg: 9, count: 3, radius: 62 },
    // Fuego
    { id: 'flame-charge', name: 'Nitrocarga', type: 'fire', kind: 'dash',
      desc: 'Te lanzas envuelto en llamas y quemas todo el camino.',
      cd: 0.8, dmg: 19, radius: 115, width: 36, burn: 1 },
    // Agua
    { id: 'whirlpool', name: 'Torbellino', type: 'water', kind: 'vortex',
      desc: 'Un remolino que arrastra a los enemigos a su centro y los va dañando.',
      cd: 3.0, dmg: 11, radius: 72, dur: 2.6, pull: 150 },
    // Planta
    { id: 'seed-bomb', name: 'Bomba Germen', type: 'grass', kind: 'bounce',
      desc: 'Una semilla que rebota de enemigo en enemigo.',
      cd: 0.6, dmg: 12, speed: 320, life: 1.6, size: 7, bounce: 3 },
    { id: 'energy-ball', name: 'Energibola', type: 'grass', kind: 'homing',
      desc: 'Una bola de energía que persigue al enemigo.',
      cd: 0.62, dmg: 19, speed: 280, life: 2.0, size: 8, homing: 5 },
    { id: 'solar-beam', name: 'Rayo Solar', type: 'grass', kind: 'charge',
      desc: 'Absorbe luz un momento y la suelta en un rayo enorme.',
      cd: 2.3, charge: 0.85, dmg: 62, radius: 290, width: 40 },
    // Eléctrico
    { id: 'thunder-wave', name: 'Onda Trueno', type: 'electric', kind: 'stun',
      desc: 'Una descarga que avisa en el suelo y deja paralizados a los que pilla.',
      cd: 1.6, dmg: 28, radius: 58, stun: 1.0 },
    { id: 'electro-ball', name: 'Bola Voltio', type: 'electric', kind: 'bounce',
      desc: 'Una bola eléctrica que salta de enemigo en enemigo.',
      cd: 0.62, dmg: 12, speed: 340, life: 1.6, size: 7, bounce: 3 },
    // Psíquico
    { id: 'extrasensory', name: 'Paranormal', type: 'psychic', kind: 'shove',
      desc: 'Una onda mental que daña y aparta a todos los que tienes cerca.',
      cd: 1.2, dmg: 16, radius: 92, knock: 320 },
    { id: 'mist-ball', name: 'Bola Neblina', type: 'psychic', kind: 'homing',
      desc: 'Una bola de bruma que persigue al enemigo y le frena.',
      cd: 0.55, dmg: 13, speed: 270, life: 2.0, size: 8, homing: 5, slow: 0.3 },
    // Veneno
    { id: 'acid-spray', name: 'Bomba Ácida', type: 'poison', kind: 'bounce',
      desc: 'Un chorro ácido que salta entre enemigos y los envenena.',
      cd: 0.66, dmg: 8, speed: 310, life: 1.6, size: 7, bounce: 3, poison: 1 },
    // Tierra
    { id: 'sand-tomb', name: 'Bucle Arena', type: 'ground', kind: 'vortex',
      desc: 'Un remolino de arena que atrapa y arrastra a los enemigos.',
      cd: 3.0, dmg: 11, radius: 70, dur: 2.6, pull: 140 },
    { id: 'magnitude', name: 'Magnitud', type: 'ground', kind: 'quake',
      desc: 'El suelo revienta en línea delante de ti, onda tras onda.',
      cd: 1.15, dmg: 18, count: 6, radius: 30 },
    // Volador
    { id: 'whirlwind', name: 'Remolino', type: 'flying', kind: 'shove',
      desc: 'Un golpe de viento que barre a todos los que tienes cerca.',
      cd: 1.1, dmg: 15, radius: 96, knock: 360 },
    { id: 'air-slash', name: 'Tajo Aéreo', type: 'flying', kind: 'homing',
      desc: 'Dos cuchillas de aire que buscan al enemigo.',
      cd: 0.55, dmg: 11, count: 2, spread: 0.35, speed: 330, life: 1.6, size: 7, homing: 4 },
    // Bicho
    { id: 'signal-beam', name: 'Rayo Señal', type: 'bug', kind: 'bounce',
      desc: 'Un destello que rebota entre los enemigos.',
      cd: 0.6, dmg: 12, speed: 340, life: 1.6, size: 7, bounce: 3 },
    { id: 'u-turn', name: 'Ida y Vuelta', type: 'bug', kind: 'dash',
      desc: 'Cruzas entre los enemigos golpeando a todos los del camino.',
      cd: 0.7, dmg: 17, radius: 120, width: 34 },
    // Roca
    { id: 'rock-tomb', name: 'Tumba Rocas', type: 'rock', kind: 'stun',
      desc: 'Caen rocas donde avisa el suelo y dejan atrapados a los que pilla.',
      cd: 1.7, dmg: 38, radius: 56, stun: 0.9 },
    { id: 'ancient-power', name: 'Poder Pasado', type: 'rock', kind: 'orbit',
      desc: 'Rocas antiguas que giran a tu alrededor.',
      cd: 0.28, dmg: 13, count: 3, radius: 70, speed: 2.6, size: 9 },
    { id: 'power-gem', name: 'Joya de Luz', type: 'rock', kind: 'bounce',
      desc: 'Un destello de gema que rebota de enemigo en enemigo.',
      cd: 0.66, dmg: 13, speed: 320, life: 1.6, size: 8, bounce: 3 },
    // Hielo
    { id: 'ice-shard', name: 'Canto Helado', type: 'ice', kind: 'homing',
      desc: 'Esquirlas rapidísimas que persiguen al enemigo.',
      cd: 0.32, dmg: 9, speed: 380, life: 1.5, size: 6, homing: 7 },
    { id: 'freeze-dry', name: 'Liofilización', type: 'ice', kind: 'stun',
      desc: 'Un frío repentino que avisa en el suelo y deja congelados a los que pilla.',
      cd: 1.6, dmg: 27, radius: 60, stun: 1.0 },
    // Lucha
    { id: 'rolling-kick', name: 'Patada Giro', type: 'fighting', kind: 'spin',
      desc: 'Patadas en giro que golpean todo lo que tienes alrededor.',
      cd: 0.95, dmg: 11, count: 3, radius: 60 },
    { id: 'vacuum-wave', name: 'Onda Vacío', type: 'fighting', kind: 'shove',
      desc: 'Un puñetazo al aire que lanza una onda y aparta a los enemigos.',
      cd: 1.1, dmg: 17, radius: 88, knock: 330 },
    { id: 'dynamic-punch', name: 'Puño Dinámico', type: 'fighting', kind: 'stun',
      desc: 'Un puñetazo tremendo donde avisa el suelo: deja aturdidos a los que pilla.',
      cd: 1.7, dmg: 36, radius: 54, stun: 0.9 },
    // Fantasma
    { id: 'shadow-sneak', name: 'Sombra Vil', type: 'ghost', kind: 'homing',
      desc: 'Una sombra que se escurre por el suelo hasta el enemigo.',
      cd: 0.45, dmg: 14, speed: 300, life: 1.8, size: 7, homing: 6 },
    { id: 'ominous-wind', name: 'Viento Aciago', type: 'ghost', kind: 'vortex',
      desc: 'Un viento maldito que arremolina a los enemigos y los va dañando.',
      cd: 3.0, dmg: 10, radius: 74, dur: 2.6, pull: 140 },
    // Dragón
    { id: 'dragon-breath', name: 'Dragoaliento', type: 'dragon', kind: 'cone',
      desc: 'Un aliento de dragón en abanico corto que frena.',
      cd: 0.7, dmg: 7, count: 7, arc: 0.95, speed: 330, life: 0.5, size: 7, slow: 0.25 },
    { id: 'dragon-claw', name: 'Garra Dragón', type: 'dragon', kind: 'melee',
      desc: 'Un zarpazo de dragón en arco.',
      cd: 0.52, dmg: 17, radius: 52, arc: 2.0, knock: 70 },
    { id: 'outrage', name: 'Enfado', type: 'dragon', kind: 'spin',
      desc: 'Una furia de golpes en giro que no deja a nadie en pie.',
      cd: 1.1, dmg: 9, count: 4, radius: 64 },
    // Hada
    { id: 'draining-kiss', name: 'Beso Drenaje', type: 'fairy', kind: 'homing',
      desc: 'Un beso que persigue al enemigo y te cura un poco al darle.',
      cd: 0.55, dmg: 13, speed: 280, life: 2.0, size: 7, homing: 5, drain: 1 },
    { id: 'play-rough', name: 'Carantoña', type: 'fairy', kind: 'melee',
      desc: 'Un ataque juguetón pero muy fuerte en arco.',
      cd: 0.6, dmg: 18, radius: 50, arc: 2.0, knock: 60 },
    { id: 'disarming-voice', name: 'Voz Cautivadora', type: 'fairy', kind: 'shove',
      desc: 'Un grito encantador que daña y aparta a los que tienes cerca.',
      cd: 1.15, dmg: 15, radius: 94, knock: 300 },
    // Acero
    { id: 'mirror-shot', name: 'Disparo Espejo', type: 'steel', kind: 'bounce',
      desc: 'Un destello metálico que rebota entre los enemigos.',
      cd: 0.64, dmg: 12, speed: 340, life: 1.6, size: 7, bounce: 3 },
    { id: 'gyro-ball', name: 'Giro Bola', type: 'steel', kind: 'spin',
      desc: 'Giras como una bola de acero golpeando todo alrededor.',
      cd: 1.05, dmg: 11, count: 3, radius: 60 },
    // Siniestro
    { id: 'sucker-punch', name: 'Golpe Bajo', type: 'dark', kind: 'homing',
      desc: 'Un golpe a traición que busca al enemigo.',
      cd: 0.7, dmg: 22, speed: 330, life: 1.6, size: 7, homing: 6 },
    { id: 'night-slash', name: 'Tajo Umbrío', type: 'dark', kind: 'spin',
      desc: 'Cortes en giro que alcanzan a todo lo que te rodea.',
      cd: 1.0, dmg: 11, count: 3, radius: 62 },

    // ================= NUEVOS (22-10-2026): familias de Vampire Survivors =================
    // Parábola (lob): spread en px/s entre proyectiles; grav en px/s².
    { id: 'bone-club', name: 'Hueso Palo', type: 'ground', kind: 'lob',
      desc: 'Lanza un hueso en parábola hacia el enemigo: sube, cae y atraviesa a varios.',
      cd: 1.15, dmg: 26, count: 1, speed: 340, life: 1.6, size: 9, pierce: 2, spread: 70, grav: 720, knock: 60 },
    { id: 'rock-blast', name: 'Pedrada', type: 'rock', kind: 'lob',
      desc: 'Lanza rocas en parábola hacia el enemigo: suben, caen y atraviesan a varios.',
      cd: 1.1, dmg: 20, count: 2, speed: 330, life: 1.6, size: 8, pierce: 1, spread: 70, grav: 700 },
    // Ráfaga (knife): hacia donde miras; cdMin para que la ráfaga acabe antes de la siguiente.
    { id: 'water-shuriken', name: 'Shuriken de Agua', type: 'water', kind: 'knife',
      desc: 'Ráfaga de estrellas de agua hacia donde miras. Muy rápida, pero hay que encarar al enemigo.',
      cd: 0.5, cdMin: 0.15, dmg: 11, count: 2, speed: 460, life: 0.75, size: 5, pierce: 0, spread: 0.08 },
    { id: 'bullet-seed', name: 'Semilladora', type: 'grass', kind: 'knife',
      desc: 'Una ametralladora de semillas hacia donde miras.',
      cd: 0.55, cdMin: 0.15, dmg: 9, count: 3, speed: 420, life: 0.7, size: 5, pierce: 0, spread: 0.16 },
    { id: 'pin-missile', name: 'Pin Misil', type: 'bug', kind: 'knife',
      desc: 'Agujas en ráfaga hacia donde miras que atraviesan a uno.',
      cd: 0.55, cdMin: 0.15, dmg: 10, count: 2, speed: 440, life: 0.75, size: 5, pierce: 1, spread: 0.1 },
    { id: 'scale-shot', name: 'Ráfaga Escamas', type: 'dragon', kind: 'knife',
      desc: 'Escamas afiladas en ráfaga hacia donde miras; empujan un poco.',
      cd: 0.55, cdMin: 0.15, dmg: 12, count: 2, speed: 480, life: 0.7, size: 6, pierce: 0, spread: 0.06, knock: 30 },
    // Aspas (cross): curl = giro de cada aspa en rad/s (espiral).
    { id: 'swift', name: 'Meteoros', type: 'normal', kind: 'cross',
      desc: 'Estrellas en todas direcciones que giran en espiral; una va siempre al enemigo.',
      cd: 0.95, dmg: 14, count: 5, speed: 300, life: 1.1, size: 7, pierce: 1, curl: 1, homing: 1.5 },
    { id: 'cross-poison', name: 'Veneno X', type: 'poison', kind: 'cross',
      desc: 'Cuchillas venenosas en aspa, una hacia el enemigo; atraviesan y envenenan.',
      cd: 0.85, dmg: 12, count: 4, speed: 340, life: 0.8, size: 8, pierce: 1, curl: 0, poison: 1 },
    { id: 'cross-chop', name: 'Tajo Cruzado', type: 'fighting', kind: 'cross',
      desc: 'Tajos en aspa a todos lados, uno hacia el enemigo; atraviesan y empujan.',
      cd: 0.9, dmg: 18, count: 4, speed: 340, life: 0.85, size: 9, pierce: 1, curl: 0, knock: 50 },
    { id: 'twister', name: 'Ciclón', type: 'dragon', kind: 'cross',
      desc: 'Tornados que salen girando en espiral y arrastran a los enemigos.',
      cd: 1.1, dmg: 16, count: 3, speed: 250, life: 1.3, size: 10, pierce: 3, curl: 2.6, knock: 30 },
    // Columna (column): life = lo que dura (un golpe cada 0,25 s).
    { id: 'waterfall', name: 'Cascada', type: 'water', kind: 'column',
      desc: 'Una columna de agua cae de arriba abajo sobre ti y arrastra a todo lo que pilla.',
      cd: 1.4, dmg: 12, count: 1, life: 0.45, width: 40, height: 240, anchor: 'self', knock: 40 },
    { id: 'photon-geyser', name: 'Géiser Fotónico', type: 'psychic', kind: 'column',
      desc: 'Un pilar de luz brota de arriba abajo en la columna del enemigo.',
      cd: 1.5, dmg: 16, count: 1, life: 0.45, width: 36, height: 220, anchor: 'target' },
    { id: 'icicle-crash', name: 'Chuzos', type: 'ice', kind: 'column',
      desc: 'Caen carámbanos en la columna del enemigo, de arriba abajo, y frenan.',
      cd: 1.5, dmg: 15, count: 1, life: 0.45, width: 34, height: 200, anchor: 'target', slow: 0.4 },
    { id: 'sky-uppercut', name: 'Gancho Alto', type: 'fighting', kind: 'column',
      desc: 'Un gancho al cielo: una columna de golpes sobre ti que lanza lejos a los enemigos.',
      cd: 1.3, dmg: 13, count: 1, life: 0.45, width: 44, height: 200, anchor: 'self', knock: 90, knockUp: 1 },
    // Aguja (sweep): turn en rad/s. (Cañón Floral lleva stun 0: la evolución lo multiplica.)
    { id: 'charge-beam', name: 'Rayo Carga', type: 'electric', kind: 'sweep',
      desc: 'Un rayo que gira a tu alrededor como una aguja de reloj y paraliza un instante.',
      cd: 3, dmg: 12, count: 1, width: 16, radius: 150, dur: 2.4, turn: 4.2, stun: 0.3 },
    { id: 'aurora-beam', name: 'Rayo Aurora', type: 'ice', kind: 'sweep',
      desc: 'Un rayo helado que gira a tu alrededor como una aguja de reloj y congela un momento.',
      cd: 3, dmg: 10, count: 1, width: 14, radius: 150, dur: 2.4, turn: 5.2, stun: 0.4 },
    { id: 'fleur-cannon', name: 'Cañón Floral', type: 'fairy', kind: 'sweep',
      desc: 'Un rayo floral ancho que gira a tu alrededor como una aguja de reloj.',
      cd: 3.2, dmg: 12, count: 1, width: 20, radius: 165, dur: 2, turn: 6.3, stun: 0 },
    // Carambola (ricochet): dur = lo que rebota.
    { id: 'pyro-ball', name: 'Balón Ígneo', type: 'fire', kind: 'ricochet',
      desc: 'Un balón en llamas que rebota por los bordes de la pantalla quemando a todo lo que toca.',
      cd: 3, dmg: 18, count: 1, speed: 320, size: 8, homing: 1.2, dur: 3, burn: 1 },
    { id: 'aura-wheel', name: 'Rueda Aural', type: 'electric', kind: 'ricochet',
      desc: 'Una rueda eléctrica rapidísima que rebota por los bordes de la pantalla y frena.',
      cd: 2.8, dmg: 17, count: 1, speed: 400, size: 8, homing: 1.2, dur: 3, slow: 0.3 },
    { id: 'rollout', name: 'Rodar', type: 'rock', kind: 'ricochet',
      desc: 'Una roca rodando que rebota por los bordes de la pantalla arrollando todo.',
      cd: 3, dmg: 24, count: 1, speed: 280, size: 10, homing: 1, dur: 3, knock: 60 },
    // Barrido (wipe): recarga larga con tope propio (cdMin); pct = umbral de KO (exec) o vida quitada (cut).
    { id: 'perish-song', name: 'Canto Mortal', type: 'normal', kind: 'wipe',
      desc: 'Un canto que oye toda la pantalla: a los 3 s debilita a los que estén muy tocados y daña al resto. Los jefes lo aguantan.',
      cd: 45, cdMin: 20, dmg: 30, pct: 0.25, delay: 3, mode: 'exec' },
    { id: 'dark-void', name: 'Brecha Negra', type: 'dark', kind: 'wipe',
      desc: 'Una oscuridad cubre la pantalla: duerme a todos, les quita parte de la vida y daña. Los jefes duermen menos.',
      cd: 30, cdMin: 15, dmg: 20, stun: 2, pct: 0.15, delay: 1.2, mode: 'cut' },
    // Escudo (ward): cd = lo que tarda en ganar un escudo; count = escudos máximos; radius = contraataque.
    { id: 'spiky-shield', name: 'Barrera Espinosa', type: 'grass', kind: 'ward',
      desc: 'Un escudo de pinchos que para un golpe y castiga a los que tienes cerca.',
      cd: 6, cdMin: 2.5, dmg: 45, count: 1, radius: 78, knock: 140 },
    { id: 'baneful-bunker', name: 'Búnker', type: 'poison', kind: 'ward',
      desc: 'Un búnker que para un golpe y envenena mucho a los que tienes cerca.',
      cd: 6, cdMin: 2.5, dmg: 24, count: 1, radius: 80, poison: 2 },
    { id: 'kings-shield', name: 'Escudo Real', type: 'steel', kind: 'ward',
      desc: 'Un escudo regio que para un golpe y deja aturdidos a los que tienes cerca.',
      cd: 6, cdMin: 2.5, dmg: 32, count: 1, radius: 76, stun: 0.8 },
    // Aliados (ally): size = radio de golpe; phase = atraviesan paredes; sprite owner = copias de tu Pokémon.
    { id: 'attack-order', name: 'Al Ataque', type: 'bug', kind: 'ally',
      desc: 'Llamas a un enjambre: las abejas revolotean cerca y pican a los enemigos.',
      cd: 6, dmg: 8, count: 3, speed: 160, size: 7, dur: 6 },
    { id: 'last-respects', name: 'Homenaje Póstumo', type: 'ghost', kind: 'ally',
      desc: 'Espíritus que atraviesan paredes, persiguen a los enemigos y los frenan.',
      cd: 6, dmg: 8, count: 3, speed: 140, size: 7, dur: 6, slow: 0.3, phase: 1 },
    { id: 'beat-up', name: 'Paliza', type: 'dark', kind: 'ally',
      desc: 'Copias pequeñas de tu Pokémon corren a pegar a los enemigos cercanos.',
      cd: 6, dmg: 12, count: 2, speed: 130, size: 9, dur: 6, knock: 40, sprite: 'owner' },
    // Aves (wings): speed = giro en rad/s; ring = radio del círculo; radius = explosión de cada bomba.
    { id: 'dual-wingbeat', name: 'Ala Bis', type: 'flying', kind: 'wings',
      desc: 'Dos aves vuelan en círculo lejos de ti y bombardean a los enemigos de abajo.',
      cd: 8, dmg: 15, count: 2, speed: 1.7, radius: 34, dur: 8, rate: 0.6, ring: 150 },
    { id: 'steel-wing', name: 'Ala de Acero', type: 'steel', kind: 'wings',
      desc: 'Un ave de acero vuela en círculo lejos de ti y suelta bombas pesadas.',
      cd: 8, dmg: 26, count: 1, speed: 1.5, radius: 42, dur: 8, rate: 0.65, ring: 160 },
    // Charcos (puddle): range = hasta dónde lanza los frascos.
    { id: 'fire-pledge', name: 'Voto Fuego', type: 'fire', kind: 'puddle',
      desc: 'Lanza frascos de fuego sobre los enemigos: dejan un mar de llamas que quema.',
      cd: 2.2, dmg: 6, count: 2, radius: 36, dur: 3, burn: 1, range: 260 },
    { id: 'psychic-terrain', name: 'Campo Psíquico', type: 'psychic', kind: 'puddle',
      desc: 'Lanza un campo psíquico amplio sobre los enemigos que los daña y frena.',
      cd: 2.6, dmg: 6, count: 1, radius: 54, dur: 4, slow: 0.25, range: 260 },
    { id: 'mud-bomb', name: 'Bomba Fango', type: 'ground', kind: 'puddle',
      desc: 'Bombas de barro sobre los enemigos: dejan charcos que dañan y frenan mucho.',
      cd: 2.2, dmg: 7, count: 2, radius: 36, dur: 3, slow: 0.4, range: 260 },
    // Lluvia (dusting): speed = lo rápido que caen.
    { id: 'feather-dance', name: 'Danza Pluma', type: 'flying', kind: 'dusting',
      desc: 'Caen plumas de lo alto de la pantalla que dañan y frenan a todos los que rozan.',
      cd: 1.6, dmg: 9, count: 8, speed: 200, size: 7, slow: 0.35 },
    { id: 'astral-barrage', name: 'Orbes Espectro', type: 'ghost', kind: 'dusting',
      desc: 'Caen orbes fantasma de lo alto de la pantalla y se desvían hacia los enemigos.',
      cd: 1.6, dmg: 8, count: 8, speed: 230, size: 7, homing: 0.6 },
    { id: 'springtide-storm', name: 'Ciclón Primavera', type: 'fairy', kind: 'dusting',
      desc: 'Caen pétalos de lo alto de la pantalla que dañan y apartan a los enemigos.',
      cd: 1.6, dmg: 10, count: 8, speed: 210, size: 7, knock: 40 },
    { id: 'make-it-rain', name: 'Fiebre Dorada', type: 'steel', kind: 'dusting',
      desc: 'Llueven monedas de lo alto de la pantalla que golpean a todo lo que pillan.',
      cd: 1.7, dmg: 10, count: 8, speed: 240, size: 6 }
  ];

  // Cuerpo a cuerpo (12-10-2026): +20 % de daño y +25 % de alcance y de arco
  // (y -25 % de daño recibido mientras sea tu ataque activo, en player.js).
  // Pegaban bien, pero había que arriesgar mucho más que con los de distancia.
  for (const m of RAW) {
    if (m.kind !== 'melee') continue;
    m.dmg = Math.round(m.dmg * 1.2);
    m.radius = Math.round(m.radius * 1.25);
    if (m.arc) m.arc = Math.min(3, +(m.arc * 1.25).toFixed(2));
  }

  // Pool de movimientos por tipo. El pool `normal` lo tienen todos.
  const POOL = {};
  for (const m of RAW) (POOL[m.type] = POOL[m.type] || []).push(m.id);

  /*
   * Físico o especial (G.Stats), como en los juegos. Los de estado que aquí sí
   * hacen daño van por lo que hacen: trampas y golpes, físicos (Púas, Disparo
   * Demora, Sustituto); efectos y energía, especiales (Tóxico, Granizo, Fuego
   * Fatuo). Los potenciadores (buff) no tienen: no hacen daño.
   */
  const PHYSICAL = new Set(['tackle', 'quick-attack', 'vine-whip', 'razor-leaf', 'wing-attack', 'body-slam', 'poison-sting',
    'bulldoze', 'bug-bite', 'string-shot', 'rock-throw', 'rock-slide', 'karate-chop', 'lick', 'metal-claw', 'bite',
    'bonemerang', 'psycho-cut', 'spikes', 'toxic-spikes', 'meteor-mash', 'substitute', 'aerial-ace', 'flame-wheel',
    // nuevos del 19-10-2026
    'rapid-spin', 'flame-charge', 'seed-bomb', 'sand-tomb', 'magnitude', 'u-turn', 'rock-tomb', 'ice-shard',
    'rolling-kick', 'dynamic-punch', 'shadow-sneak', 'dragon-claw', 'outrage', 'play-rough', 'gyro-ball',
    'sucker-punch', 'night-slash',
    // nuevos del 22-10-2026
    'bone-club', 'rock-blast', 'bullet-seed', 'pin-missile', 'scale-shot', 'cross-poison', 'cross-chop',
    'waterfall', 'icicle-crash', 'sky-uppercut', 'pyro-ball', 'aura-wheel', 'rollout',
    'spiky-shield', 'kings-shield', 'attack-order', 'last-respects', 'beat-up', 'dual-wingbeat', 'steel-wing']);

  // Los que disparan bolas necesitan count y spread de base: las mejoras los
  // multiplican y, sin ellos, "+1 proyectil" no sumaba ninguno y el abanico se
  // quedaba en 1,3 rad (Bomba Ácida evolucionada salía hacia los lados).
  for (const m of RAW) {
    if (m.kind !== 'projectile' && m.kind !== 'homing' && m.kind !== 'bounce') continue;
    if (m.count == null) m.count = 1;
    if (m.spread == null) m.spread = 0.12;
  }

  // Sin prototipo: un id que llega de la red o de una partida guardada como
  // 'toString' o 'constructor' no debe parecer un movimiento.
  const BY_ID = Object.create(null);
  for (const m of RAW) {
    m.cat = m.kind === 'buff' ? null : PHYSICAL.has(m.id) ? 'physical' : 'special';
    m.ups = LADDER_BY_ID[m.id] || LADDERS[m.kind];
    m.maxLvl = m.ups.length + 1;
    BY_ID[m.id] = m;
  }
  // Los movimientos Z van aparte (ver «movimientos Z» al final): ni en el catálogo ni en las cartas.
  const Z_BY_ID = Object.create(null);

  /**
   * Movimientos que este Pokémon puede aprender (sus tipos + normal) y, salvo
   * con `natural`, los que ha aprendido con MT (Tienda Kecleon, ver G.Mons).
   */
  function poolFor(mon, natural) {
    const ids = new Set(POOL.normal);
    for (const t of mon.types) for (const id of (POOL[t] || [])) ids.add(id);
    if (!natural && G.Mons && mon.dex) for (const id of G.Mons.taught(mon.dex)) ids.add(id);
    return [...ids];
  }

  /**
   * Instancia de movimiento en una run: los números base de `def` con todas
   * las mejoras de la escalera hasta `lvl` ya aplicadas. null si no existe.
   */
  function instance(id, lvl = 1) {
    const def = typeof id === 'string' ? BY_ID[id] || Z_BY_ID[id] : null;      // (también los movimientos Z, abajo)
    if (!def) return null;
    // El nivel puede venir de un compañero (red): entre 1 y el máximo (con más de 5 se colgaba).
    lvl = typeof lvl === 'number' && lvl > 1 ? Math.min(def.maxLvl, Math.floor(lvl)) : 1;
    const s = Object.assign({}, def, { id, def, lvl, t: 0 });
    delete s.ups;
    for (let i = 0; i < lvl - 1; i++) applyMods(s, def.ups[i].m);
    return s;
  }

  const MULT = ['dmg', 'cd', 'speed', 'radius', 'dur', 'amount', 'arc', 'width', 'spread', 'life', 'size', 'rate',
                'pull', 'knock', 'stun', 'charge',
                // familias del 22-10-2026
                'height', 'turn', 'ring', 'grav', 'curl', 'heal', 'blast'];
  const ADD = ['count', 'pierce', 'stacks', 'bounce', 'pct'];

  function applyMods(s, m) {
    for (const k in m) {
      if (MULT.includes(k) && s[k] != null) s[k] *= m[k];
      else if (ADD.includes(k)) s[k] = (s[k] || 0) + m[k];
      else s[k] = m[k];
    }
  }

  /** Sube de nivel una instancia ya creada. */
  function levelUp(s) {
    if (s.lvl >= s.def.maxLvl) return false;
    applyMods(s, s.def.ups[s.lvl - 1].m);
    s.lvl++;
    return true;
  }

  /** Texto de la próxima mejora, para la carta de subida de nivel. */
  function nextUpText(s) {
    return s.lvl >= s.def.maxLvl ? null : s.def.ups[s.lvl - 1].t;
  }

  /** Movimiento inicial según el tipo principal (si el Pokémon no trae uno). */
  const START = {
    fire: 'ember', water: 'water-gun', grass: 'vine-whip', electric: 'thunder-shock',
    psychic: 'confusion', poison: 'sludge', ground: 'mud-shot', flying: 'gust',
    bug: 'bug-bite', rock: 'rock-throw', ice: 'ice-beam', fighting: 'karate-chop',
    ghost: 'shadow-ball', dragon: 'dragon-rage', fairy: 'fairy-wind', steel: 'metal-claw',
    dark: 'bite', normal: 'tackle'
  };
  function startFor(mon) {
    if (mon.start && BY_ID[mon.start]) return mon.start;
    for (const t of mon.types) if (START[t]) return START[t];
    return 'tackle';
  }

  // ---------------- evolución de movimientos ----------------
  /*
   * Un movimiento al NIVEL MÁXIMO evoluciona si en esa run has cogido alguna
   * vez la mejora de su condición (`needs`, un id de LevelUp.STATS). Sale una
   * carta dorada. Los potenciadores (buff) no evolucionan.
   */
  const NEED_NAME = { hp: 'Vigor', atk: 'Potencia', spd: 'Carrera', cd: 'Reflejos', def: 'Coraza',
                      rgn: 'Síntesis', mag: 'Imán', xp: 'Aprendizaje',
                      area: 'Amplitud', dur: 'Persistencia', amt: 'Réplica', pspd: 'Propulsión', luck: 'Puntería' };
  const EVO = {
    'tackle': ['Derribo', 'hp'],             'quick-attack': ['Velocidad Extrema', 'spd'],
    'body-slam': ['Gigaimpacto', 'atk'],     'hyper-voice': ['Alboroto', 'cd'],
    'ember': ['Llamarada', 'atk'],           'flamethrower': ['Sofoco', 'cd'],
    'fire-spin': ['Fuego Sagrado', 'rgn'],   'heat-wave': ['Erupción', 'hp'],
    'water-gun': ['Escaldar', 'atk'],        'bubble': ['Surf', 'spd'],
    'hydro-pump': ['Hidrocañón', 'atk'],     'vine-whip': ['Latigazo', 'atk'],
    'razor-leaf': ['Lluevehojas', 'cd'],     'leaf-storm': ['Danza Pétalo', 'rgn'],
    'giga-drain': ['Planta Feroz', 'hp'],    'thunder-shock': ['Trueno', 'atk'],
    'discharge': ['Campo Eléctrico', 'def'], 'thunderbolt': ['Electrocañón', 'cd'],
    'confusion': ['Psicocarga', 'cd'],       'psybeam': ['Premonición', 'atk'],
    'psychic': ['Vasta Fuerza', 'mag'],      'sludge': ['Bomba Lodo', 'atk'],
    'poison-sting': ['Puya Nociva', 'spd'],  'toxic': ['Gas Venenoso', 'rgn'],
    'mud-shot': ['Tierra Viva', 'atk'],      'bulldoze': ['Terremoto', 'atk'],
    'gust': ['Vendaval', 'spd'],             'wing-attack': ['Pájaro Osado', 'atk'],
    'bug-bite': ['Tijera X', 'atk'],         'string-shot': ['Red Viscosa', 'cd'],
    'bug-buzz': ['Enjambre', 'rgn'],         'rock-throw': ['Roca Afilada', 'atk'],
    'rock-slide': ['Trampa Rocas', 'cd'],    'ice-beam': ['Ventisca', 'atk'],
    'powder-snow': ['Viento Hielo', 'spd'],  'karate-chop': ['A Bocajarro', 'atk'],
    'aura-sphere': ['Onda Certera', 'cd'],   'lick': ['Puño Sombra', 'atk'],
    'shadow-ball': ['Golpe Fantasma', 'cd'], 'dragon-rage': ['Cometa Draco', 'atk'],
    'fairy-wind': ['Fuerza Lunar', 'atk'],   'dazzling-gleam': ['Campo de Niebla', 'rgn'],
    'metal-claw': ['Cabeza de Hierro', 'atk'], 'flash-cannon': ['Rayo Metálico', 'def'],
    'bite': ['Triturar', 'atk'],             'dark-pulse': ['Alarido', 'spd'],
    'night-shade': ['Pesadilla', 'rgn'],
    'bonemerang': ['Ataque Óseo', 'atk'],    'psycho-cut': ['Psicocolmillo', 'cd'],
    'spikes': ['Fisura', 'atk'],             'toxic-spikes': ['Lanza Mugre', 'rgn'],
    'hail': ['Alud', 'cd'],                  'meteor-mash': ['Bomba Imán', 'atk'],
    'will-o-wisp': ['Infierno', 'cd'],       'substitute': ['Doble Equipo', 'def'],
    'aerial-ace': ['Acróbata', 'spd'],       'flame-wheel': ['Envite Ígneo', 'spd'],
    'bubble-beam': ['Acua Cola', 'atk'],     'hex': ['Poltergeist', 'mag'],
    // nuevos del 19-10-2026
    'hyper-beam': ['Rayo Prisma', 'atk'],    'rapid-spin': ['Triataque', 'spd'],
    'flame-charge': ['Golpe Calor', 'spd'],  'whirlpool': ['Salmuera', 'rgn'],
    'seed-bomb': ['Mazazo', 'atk'],          'energy-ball': ['Gigadrenado', 'rgn'],
    'solar-beam': ['Cuchilla Solar', 'cd'],  'thunder-wave': ['Voltio Cruel', 'atk'],
    'electro-ball': ['Chispa', 'spd'],       'extrasensory': ['Psicoonda', 'def'],
    'mist-ball': ['Resplandor', 'cd'],       'acid-spray': ['Onda Tóxica', 'rgn'],
    'sand-tomb': ['Fuerza Equina', 'hp'],    'magnitude': ['Taladradora', 'atk'],
    'whirlwind': ['Huracán', 'spd'],         'air-slash': ['Ataque Aéreo', 'cd'],
    'signal-beam': ['Megacuerno', 'atk'],    'u-turn': ['Sanguijuela', 'rgn'],
    'rock-tomb': ['Testarazo', 'hp'],        'ancient-power': ['Tormenta de Diamantes', 'def'],
    'power-gem': ['Rayo Meteórico', 'atk'],  'ice-shard': ['Carámbano', 'cd'],
    'freeze-dry': ['Frío Polar', 'atk'],     'rolling-kick': ['Patada Salto Alta', 'spd'],
    'vacuum-wave': ['Puño Incremento', 'def'], 'dynamic-punch': ['Megapuño', 'atk'],
    'shadow-sneak': ['Garra Umbría', 'cd'],  'ominous-wind': ['Golpe Umbrío', 'mag'],
    'dragon-breath': ['Pulso Dragón', 'atk'], 'dragon-claw': ['Carga Dragón', 'atk'],
    'outrage': ['Dracoflecha', 'hp'],        'draining-kiss': ['Luz Lunar', 'rgn'],
    'play-rough': ['Choque Anímico', 'atk'], 'disarming-voice': ['Encanto', 'def'],
    'mirror-shot': ['Metaláser', 'atk'],     'gyro-ball': ['Cuerpo Pesado', 'def'],
    'sucker-punch': ['Juego Sucio', 'atk'],  'night-slash': ['Lariat Oscuro', 'spd'],
    // nuevos del 22-10-2026
    'bone-club': ['Hueso Sombrío', 'hp'],    'rock-blast': ['Hachazo Pétreo', 'area'],
    'water-shuriken': ['Azote Torrencial', 'pspd'], 'bullet-seed': ['Fulgor Semilla', 'amt'],
    'pin-missile': ['Aguijón Letal', 'amt'], 'scale-shot': ['Fragor Escamas', 'luck'],
    'swift': ['Teraclúster', 'luck'],        'cross-poison': ['Garra Nociva', 'luck'],
    'cross-chop': ['Espada Santa', 'atk'],   'twister': ['Dracoenergía', 'area'],
    'waterfall': ['Pulso Primigenio', 'area'], 'photon-geyser': ['Psicoataque', 'pspd'],
    'icicle-crash': ['Lanza Glacial', 'dur'], 'sky-uppercut': ['Puño Certero', 'atk'],
    'charge-beam': ['Rayo Fusión', 'cd'],    'aurora-beam': ['Mundo Gélido', 'dur'],
    'fleur-cannon': ['Luz Aniquiladora', 'area'],
    'pyro-ball': ['V de Fuego', 'pspd'],     'aura-wheel': ['Ataque Fulgor', 'spd'],
    'rollout': ['Romperrocas', 'def'],
    'perish-song': ['Estruendo', 'xp'],      'dark-void': ['Calamidad', 'cd'],
    'spiky-shield': ['Cura Selvática', 'rgn'], 'baneful-bunker': ['Armadura Ácida', 'hp'],
    'kings-shield': ['Embate Supremo', 'def'],
    'attack-order': ['Escaramuza', 'amt'],   'last-respects': ['Marcha Espectral', 'dur'],
    'beat-up': ['Cerco Dimensión', 'atk'],
    'dual-wingbeat': ['Ala Mortífera', 'pspd'], 'steel-wing': ['Meteoimpacto', 'def'],
    'fire-pledge': ['Lluvia Ígnea', 'mag'],  'psychic-terrain': ['Onda Mental', 'area'],
    'mud-bomb': ['Arenas Ardientes', 'dur'],
    'feather-dance': ['Aerochorro', 'spd'],  'astral-barrage': ['Rayo Umbrío', 'amt'],
    'springtide-storm': ['Furia Natural', 'rgn'], 'make-it-rain': ['Deseo Oculto', 'luck']
  };
  // Lo que gana al evolucionar, según cómo funcione.
  // (23-10-2026, con tools/balance.cjs: ninguna suma más de +2 a la cantidad —el tope
  // con Réplica es +3, ver EXTRA_MAX— y se igualan las familias: las que se salían
  // —cuerpo a cuerpo, minas, giros, charcos— pegan algo menos y las flojas —rayos,
  // cadenas, torretas, remolinos, aturdir, cargas, empujones, embestidas— algo más.)
  const EVO_MODS = {
    projectile: { t: '×1,6 daño, +2 proyectiles, +2 perforación y más grandes', m: { dmg: 1.6, count: 2, pierce: 2, size: 1.3, spread: 1.1 } },
    melee:      { t: '×1,7 daño, más alcance y golpea en 360°', m: { dmg: 1.7, radius: 1.3, arc: 9 } },
    beam:       { t: '×2,1 daño, rayo un 50% más grueso y más largo', m: { dmg: 2.1, width: 1.5, radius: 1.2, cd: 0.85 } },
    orbit:      { t: '+2 orbes, ×1,7 daño y más radio', m: { count: 2, dmg: 1.7, radius: 1.15 } },
    nova:       { t: '+2 proyectiles, ×1,9 daño y +1 perforación', m: { count: 2, dmg: 1.9, pierce: 1 } },
    aura:       { t: '×1,8 daño y un 35% más de radio', m: { dmg: 1.8, radius: 1.35 } },
    boomerang:  { t: '×1,8 daño, +1 bumerán y más alcance', m: { dmg: 1.8, count: 1, radius: 1.2, size: 1.2 } },
    chain:      { t: '×2,4 daño y +2 saltos', m: { dmg: 2.4, count: 2, radius: 1.2 } },
    mine:       { t: '×1,3 daño, +2 minas y explosión más grande', m: { dmg: 1.3, count: 2, radius: 1.25 } },
    meteor:     { t: '×1,7 daño, +2 meteoros y más radio', m: { dmg: 1.7, count: 2, radius: 1.2 } },
    turret:     { t: '×2,1 daño, +1 a la vez y dispara más rápido', m: { dmg: 2.1, count: 1, rate: 0.8 } },
    dash:       { t: '×2,1 daño, más distancia y menos recarga', m: { dmg: 2.1, radius: 1.25, cd: 0.8 } },
    trail:      { t: '×1,8 daño, charcos más grandes y duraderos', m: { dmg: 1.8, radius: 1.25, dur: 1.3 } },
    cone:       { t: '×1,9 daño, +2 disparos y +1 perforación', m: { dmg: 1.9, count: 2, pierce: 1 } },
    homing:     { t: '×1,8 daño, +2 proyectiles y más grandes', m: { dmg: 1.8, count: 2, size: 1.3, spread: 1.2 } },
    bounce:     { t: '×1,8 daño, +2 rebotes y +1 proyectil', m: { dmg: 1.8, bounce: 2, count: 1, spread: 1.3 } },
    charge:     { t: '×2,1 daño, rayo un 50% más grueso y carga más rápido', m: { dmg: 2.1, width: 1.5, charge: 0.7 } },
    spin:       { t: '×1,5 daño, +1 vuelta y más radio', m: { dmg: 1.5, count: 1, radius: 1.2 } },
    quake:      { t: '×1,9 daño, +2 ondas y ondas más grandes', m: { dmg: 1.9, count: 2, radius: 1.25 } },
    vortex:     { t: '×2,2 daño, más radio y atrae más fuerte', m: { dmg: 2.2, radius: 1.3, pull: 1.4 } },
    shove:      { t: '×2 daño, más radio y empuja más', m: { dmg: 2, radius: 1.25, knock: 1.4 } },
    stun:       { t: '×2,2 daño, más radio y aturde más rato', m: { dmg: 2.2, radius: 1.3, stun: 1.4 } },
    // familias del 22-10-2026
    lob:        { t: '×1,8 daño, +2 proyectiles, +2 perforación y más grandes', m: { dmg: 1.8, count: 2, pierce: 2, size: 1.25 } },
    knife:      { t: '×1,7 daño, +1 disparo y -25% recarga', m: { dmg: 1.7, count: 1, cd: 0.75 } },
    cross:      { t: '×1,8 daño, +2 aspas, +2 perforación y más grandes', m: { dmg: 1.8, count: 2, pierce: 2, size: 1.25 } },
    column:     { t: '×1,8 daño, +1 columna, más anchas y duran más', m: { dmg: 1.8, count: 1, width: 1.3, life: 1.4 } },
    sweep:      { t: '×1,8 daño, +1 rayo, más largo y aturde más', m: { dmg: 1.8, count: 1, radius: 1.2, stun: 1.5 } },
    ricochet:   { t: '×1,8 daño, +1 proyectil y estalla en cada rebote', m: { dmg: 1.8, count: 1, size: 1.2, blast: 44 } },
    wipe:       { t: '×2 daño, +20% de efecto y -15% recarga', m: { dmg: 2, pct: 0.2, cd: 0.85 } },
    ward:       { t: '+1 escudo, ×1,8 daño y curas un 4% de vida al bloquear', m: { count: 1, dmg: 1.8, heal: 0.04 } },
    ally:       { t: '×1,8 daño, +2 aliados y más grandes', m: { dmg: 1.8, count: 2, size: 1.3 } },
    wings:      { t: '×1,8 daño, bombas más grandes y más seguidas', m: { dmg: 1.8, radius: 1.25, rate: 0.75 } },
    puddle:     { t: '×1,2 daño, +1 charco y los charcos te siguen y crecen', m: { dmg: 1.2, count: 1, follow: 1 } },
    dusting:    { t: '×2,2 daño, +2 caídas y más grandes', m: { dmg: 2.2, count: 2, size: 1.2 } }
  };

  // ---------------- pasivos de la run (22-10-2026) ----------------
  /*
   * Cartas al estilo de los pasivos de Vampire Survivors. Cada jugador lleva
   * pl.pass = { area, dur, amt, pspd } (1, 1, 0, 1 al empezar) y aquí se dice
   * qué número cambia cada uno en cada familia:
   *   a   × área            ah  × (1 + (área − 1) / 2)  (largo de los rayos)
   *   d   × duración        s   × propulsión     s2  × propulsión²     si  ÷ propulsión
   *   n   + n por cada carta de Réplica (count): 1 en todas desde el 23-10-2026 (las
   *       ráfagas radiales y los abanicos sumaban 2 y las lluvias 3), con el tope EXTRA_MAX
   *   code  el pasivo lo lee combat.js con m.pk (meteoros, terremoto, aturdir, charcos)
   */
  const PASSIVE_RULES = {
    projectile: { a: ['size'], s: ['speed'], n: 1 },
    homing:     { a: ['size'], s: ['speed'], n: 1 },
    bounce:     { a: ['size'], s: ['speed'], n: 1 },
    nova:       { a: ['size'], s: ['speed'], n: 1 },
    cone:       { a: ['size'], s: ['speed'], n: 1 },
    melee:      { a: ['radius'] },
    beam:       { a: ['width'], ah: ['radius'] },
    charge:     { a: ['width'], ah: ['radius'], si: ['charge'] },
    orbit:      { a: ['radius', 'size'], s: ['speed'], n: 1 },
    aura:       { a: ['radius'] },
    buff:       { d: ['dur'] },
    boomerang:  { a: ['size'], s: ['speed'], n: 1 },
    chain:      { a: ['radius'], n: 1 },
    mine:       { a: ['radius'], d: ['dur'], n: 1 },
    meteor:     { a: ['radius'], n: 1, code: 'pspd' },               // caída en 0,5/S s
    turret:     { a: ['range', 'size'], d: ['dur'], s: ['speed'], n: 1 },
    dash:       { a: ['width'] },
    trail:      { a: ['radius'], d: ['dur'] },
    spin:       { a: ['radius'], n: 1 },
    quake:      { a: ['radius'], n: 1, code: 'pspd' },               // una onda cada 0,07/S s
    vortex:     { a: ['radius'], d: ['dur'] },
    shove:      { a: ['radius'] },
    stun:       { a: ['radius'], d: ['stun'], code: 'amt' },         // 1 + amt zonas (como mucho EXTRA_MAX más)
    lob:        { a: ['size'], s: ['speed'], s2: ['grav'], n: 1 },  // misma curva, más rápida
    knife:      { a: ['size'], s: ['speed'], n: 1 },
    cross:      { a: ['size'], s: ['speed', 'curl'], n: 1 },        // misma espiral, más rápida
    column:     { a: ['width', 'height'], d: ['life'], n: 1 },
    sweep:      { a: ['radius', 'width'], d: ['dur', 'stun'], s: ['turn'], n: 1 },
    ricochet:   { a: ['size', 'blast'], d: ['dur'], s: ['speed'], n: 1 },
    wipe:       { d: ['stun'] },
    ward:       { a: ['radius'], d: ['stun'], n: 1 },
    ally:       { a: ['size'], d: ['dur'], s: ['speed'], n: 1 },
    // (El círculo de las aves, la mitad: con toda la Amplitud volaban casi al borde de la pantalla.)
    wings:      { a: ['radius'], ah: ['ring'], d: ['dur'], s: ['speed'], n: 1 },
    puddle:     { a: ['radius'], d: ['dur'], n: 1, code: 'pspd' },   // vuelo del frasco 0,45/S s
    dusting:    { a: ['size'], s: ['speed'], n: 1 }
  };
  const NO_PASS = Object.freeze({ area: 1, dur: 1, amt: 0, pspd: 1 });

  /*
   * Tope de cantidad (23-10-2026): lo que no es el nivel propio del ataque (las
   * cartas de Réplica, la evolución...) suma como mucho EXTRA_MAX proyectiles,
   * orbes, minas, aliados... a lo que lanza a su nivel. Es el único sitio: lo
   * aplica applyPassives (por donde pasan rebake y los ataques de los
   * compañeros) y combat.js lo lee para las zonas de aturdir y la red.
   */
  const EXTRA_MAX = 3;

  /** Cantidad (count) que lanza la instancia s sólo con su nivel (sin evolución ni pasivos). */
  function levelCount(s) {
    const d = s.def || BY_ID[s.id];
    if (!d || !d.ups) return s.count | 0;
    let c = d.count | 0;
    for (let i = 0; i < s.lvl - 1 && i < d.ups.length; i++) c += d.ups[i].m.count | 0;
    return c;
  }

  function mulKeys(m, keys, k) {
    if (!keys || k === 1) return;
    for (const key of keys) if (typeof m[key] === 'number') m[key] *= k;
  }

  /** Aplica los pasivos P a una instancia (recién hecha: instance + evolve). */
  function applyPassives(m, P) {
    const r = P && PASSIVE_RULES[m.kind];
    if (r) {
      const A = P.area || 1, D = P.dur || 1, S = P.pspd || 1, n = P.amt | 0;
      mulKeys(m, r.a, A); mulKeys(m, r.ah, 1 + (A - 1) / 2); mulKeys(m, r.d, D);
      mulKeys(m, r.s, S); mulKeys(m, r.s2, S * S); mulKeys(m, r.si, 1 / S);
      if (r.n && n > 0) m.count = (m.count || 0) + r.n * n;
    }
    // Tope: como mucho EXTRA_MAX más de lo que lanza a su nivel (evolución y Réplica juntas).
    if (typeof m.count === 'number') m.count = Math.min(m.count, levelCount(m) + EXTRA_MAX);
    m.pk = P || NO_PASS;
    return m;
  }

  // Lo que se copia al rehacer: sólo números (no la recarga en curso, el daño
  // hecho, los orbes ni los escudos guardados). (range: el de las torretas, con Amplitud.)
  const BAKE = MULT.concat(ADD, ['follow', 'range']);

  /** Rehace una instancia con su nivel, su evolución y los pasivos P. */
  function rebake(m, P) {
    const s = instance(m.id, m.lvl);
    if (!s) return m;
    if (m.evolved && EVO_MODS[s.kind]) applyMods(s, EVO_MODS[s.kind].m);
    applyPassives(s, P);
    for (const k of BAKE) if (s[k] !== undefined) m[k] = s[k];
    m.pk = s.pk;
    return m;
  }

  /** Todos los movimientos de un jugador (tras coger una carta). */
  function rebakeAll(pl) {
    if (!pl || !pl.moves) return;
    for (const m of pl.moves) rebake(m, pl.pass);
  }

  /** ¿Le sirve el pasivo `id` (area, dur, amt, pspd) a un movimiento de esta familia? */
  function passiveAffects(kind, id) {
    const r = PASSIVE_RULES[kind];
    if (!r) return false;
    if (id === 'area') return !!(r.a || r.ah);
    if (id === 'dur') return !!r.d;
    if (id === 'amt') return !!r.n || r.code === 'amt';
    if (id === 'pspd') return !!(r.s || r.s2 || r.si) || r.code === 'pspd';
    return true;
  }

  /** Familias que no hacen (casi) daño: como mucho 2 entre todas (ver levelup.js). */
  function nonAttacking(kind) { return kind === 'buff' || kind === 'ward' || kind === 'wipe'; }

  /** ¿Puede evolucionar ya? → { name, needs, needName, text, ready } o null */
  function evoInfo(m, statsTaken) {
    const e = EVO[m.id];
    if (!e || m.evolved || m.lvl < m.def.maxLvl || !EVO_MODS[m.kind]) return null;
    const [name, needs] = e;
    return { name, needs, needName: NEED_NAME[needs], text: EVO_MODS[m.kind].t,
             ready: !!(statsTaken && statsTaken[needs]) };
  }

  /** Evoluciona una instancia (cambia nombre y potencia; sigue siendo del mismo tipo). */
  function evolve(m) {
    const e = EVO[m.id];
    if (!e || m.evolved) return false;
    applyMods(m, EVO_MODS[m.kind].m);
    m.baseName = m.name;
    m.name = e[0];
    m.evolved = true;
    return true;
  }

  // ---------------- movimientos Z (24-10-2026, Tienda Kecleon) ----------------
  /*
   * Uno por tipo, con su nombre oficial. Se juegan con el Cristal Z de ese tipo
   * (data/shop.js, para siempre) y un compañero de ese tipo: pulsas Z (o su botón)
   * y durante Z_DUR s se lanza solo, a la vez que tus ataques; luego se recarga
   * Z_CD s (combat.js zUse / zTick). Cada uno es una familia de las de siempre
   * (mismo código y gráficos) con números y tamaños de evolución o más; vfx: su
   * forma, si no la del tipo (entities/vfx.js). zones: zonas de más (aturdir).
   *
   * Daño: el de aquí × zPower(nivel) al pulsarlo, para que valga igual al
   * principio que al final (tus ataques suben de nivel y evolucionan). Medido con
   * tools/balance.cjs --z: al nivel 1 rinde unas 3 veces lo normal de un ataque de
   * nivel 1 y, desde el nivel 45 (minuto 15 más o menos), unas 1,8 veces lo normal
   * de uno evolucionado. Físico o especial: el lado fuerte de tu Pokémon (en los
   * juegos sale del ataque del que viene). No sube de nivel ni evoluciona; los
   * pasivos (Amplitud, Réplica...) sí cuentan, con el tope de cantidad de siempre.
   */
  const Z_DUR = 60, Z_CD = 240;                 // 1 min activo, 4 min de recarga
  const Z_KL = 0.14, Z_KMAX = 7.2;              // daño × (1 + 0,14 por nivel), como mucho ×7,2 (nivel 45)
  const zPower = lvl => Math.min(Z_KMAX, 1 + Z_KL * (Math.max(1, lvl | 0) - 1));
  const Z_RAW = [
    { type: 'normal', name: 'Carrera Arrolladora', kind: 'shove',
      desc: 'Embistes con todo: una onda enorme machaca y aparta a todo lo que te rodea.',
      cd: 0.9, dmg: 20, radius: 150, knock: 420 },
    { type: 'fighting', name: 'Ráfaga Demoledora', kind: 'cone',
      desc: 'Una lluvia de puñetazos en abanico que atraviesa a los enemigos.',
      cd: 0.5, dmg: 4, count: 14, arc: 1.2, speed: 420, life: 0.55, size: 9, pierce: 2, knock: 40, vfx: { proj: 'impact' } },
    { type: 'flying', name: 'Picado Supersónico', kind: 'wings',
      desc: 'Cuatro aves gigantes vuelan en círculo y bombardean en picado todo lo de abajo.',
      cd: 6, dmg: 17, count: 4, speed: 2, radius: 54, dur: 6, rate: 0.35, ring: 160, vfx: { proj: 'bird' } },
    { type: 'poison', name: 'Diluvio Corrosivo', kind: 'dusting',
      desc: 'Llueve ácido en toda la pantalla: daña y envenena a todos los que pilla.',
      cd: 1.0, dmg: 6.5, count: 22, speed: 260, size: 9, poison: 1 },
    { type: 'ground', name: 'Barrena Telúrica', kind: 'quake',
      desc: 'El suelo revienta en una línea larguísima de explosiones.',
      cd: 0.8, dmg: 15, count: 14, radius: 46 },
    { type: 'rock', name: 'Aplastamiento Gigalítico', kind: 'meteor',
      desc: 'Caen rocas gigantes sobre los enemigos y aplastan todo lo de alrededor.',
      cd: 0.9, dmg: 10.5, count: 6, radius: 80, knock: 120 },
    { type: 'bug', name: 'Guadaña Sedosa', kind: 'cross',
      desc: 'Guadañas de seda salen girando en espiral, atraviesan a todos y los frenan.',
      cd: 0.7, dmg: 11.5, count: 10, speed: 300, life: 1.4, size: 11, pierce: 4, curl: 2, slow: 0.3, vfx: { proj: 'crescent' } },
    { type: 'ghost', name: 'Presa Espectral', kind: 'stun',
      desc: 'Manos de sombra salen del suelo bajo varios enemigos y los dejan quietos.',
      cd: 1.0, dmg: 22, radius: 90, stun: 1.2, zones: 2 },
    { type: 'steel', name: 'Hélice Trepanadora', kind: 'spin',
      desc: 'Giras como un taladro de acero y perforas todo lo que te rodea.',
      cd: 0.8, dmg: 4, count: 6, radius: 110 },
    { type: 'fire', name: 'Hecatombe Pírica', kind: 'lob',
      desc: 'Bolas de fuego gigantes caen sobre los enemigos, los atraviesan y los queman.',
      cd: 0.8, dmg: 14.5, count: 4, speed: 360, life: 1.8, size: 18, pierce: 6, spread: 80, grav: 700, burn: 2 },
    { type: 'water', name: 'Hidrovórtice Abisal', kind: 'vortex',
      desc: 'Un remolino enorme arrastra a los enemigos a su centro y los ahoga.',
      cd: 1.6, dmg: 7, radius: 140, dur: 3.2, pull: 260 },
    { type: 'grass', name: 'Megatón Floral', kind: 'column',
      desc: 'Columnas de flores brotan sobre los enemigos y lo arrasan todo.',
      cd: 0.8, dmg: 6.3, count: 3, life: 0.6, width: 64, height: 300, anchor: 'target', vfx: { proj: 'petal' } },
    { type: 'electric', name: 'Gigavoltio Destructor', kind: 'charge',
      desc: 'Cargas una lanza de rayos y la sueltas: un rayo gigante que lo atraviesa todo.',
      cd: 1.1, charge: 0.45, dmg: 47, radius: 420, width: 90, vfx: { beam: 'lightning', proj: 'bolt' } },
    { type: 'psychic', name: 'Disruptor Psíquico', kind: 'ricochet',
      desc: 'Orbes psíquicos rebotan por toda la pantalla y estallan en cada golpe.',
      cd: 2.2, dmg: 15.5, count: 4, speed: 420, size: 13, homing: 1.4, dur: 2.4, blast: 60 },
    { type: 'ice', name: 'Crioaliento Despiadado', kind: 'sweep',
      desc: 'Dos rayos helados gigantes giran a tu alrededor y congelan a todos.',
      cd: 2.0, dmg: 12.5, count: 2, width: 30, radius: 230, dur: 2.0, turn: 4.6, stun: 0.5 },
    { type: 'dragon', name: 'Dracoaliento Devastador', kind: 'beam',
      desc: 'Un aliento de dragón enorme y larguísimo que lo atraviesa todo.',
      cd: 0.55, dmg: 22, radius: 380, width: 80, vfx: { beam: 'fire' } },
    { type: 'dark', name: 'Agujero Negro Aniquilador', kind: 'vortex',
      desc: 'Abres un agujero negro que se traga a los enemigos y los destroza.',
      cd: 2.4, dmg: 7, radius: 190, dur: 3.6, pull: 340, vfx: { proj: 'shadow' } },
    { type: 'fairy', name: 'Arrumaco Sideral', kind: 'nova',
      desc: 'Una explosión de estrellas en todas las direcciones que buscan a los enemigos.',
      cd: 0.7, dmg: 6.5, count: 20, speed: 300, pierce: 2, life: 1.4, size: 10, homing: 1.5 }
  ];
  const Z_BY_TYPE = Object.create(null);
  for (const z of Z_RAW) {
    z.id = 'z-' + z.type;
    z.z = true;
    z.cat = 'physical';                         // (al pulsarlo: el lado fuerte del Pokémon, zInstance)
    z.ups = [];
    z.maxLvl = 1;
    // Como los de siempre: los que disparan bolas llevan count y spread.
    if (z.count == null && (z.kind === 'projectile' || z.kind === 'homing' || z.kind === 'bounce')) z.count = 1;
    Z_BY_ID[z.id] = z;
    Z_BY_TYPE[z.type] = z;
  }

  /**
   * El movimiento Z de un tipo listo para lanzar: con el daño de tu nivel, la
   * categoría de tu lado fuerte (cat) y tus pasivos P. null si no hay.
   */
  function zInstance(type, lvl = 1, P = null, cat = null) {
    const def = Z_BY_TYPE[type];
    if (!def) return null;
    const s = instance(def.id, 1);
    s.dmg *= zPower(lvl);
    if (cat === 'physical' || cat === 'special') s.cat = cat;
    return applyPassives(s, P);
  }

  /** Un movimiento por su id: los de siempre y los Z (los de la red: ghostCast). */
  const get = id => (typeof id === 'string' ? BY_ID[id] || Z_BY_ID[id] || null : null);

  G.Moves = { ALL: RAW, BY_ID, POOL, poolFor, instance, levelUp, nextUpText, startFor,
              EVO, NEED_NAME, evoInfo, evolve,
              PASSIVE_RULES, NO_PASS, EXTRA_MAX, levelCount, applyPassives, rebake, rebakeAll, passiveAffects, nonAttacking,
              Z: Z_BY_TYPE, Z_BY_ID, Z_DUR, Z_CD, zPower, zInstance, get };
})();
