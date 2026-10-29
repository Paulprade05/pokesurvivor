# Jefes: firmas y llegadas (26-10-2026; cada una única, 28-10-2026)

Generado desde el código (`G.BossSig` en `js/entities/enemy.js` y la tabla `APPEAR` de `js/systems/rift.js`).

Cada jefe usa su **firma** a los ~5 s de salir y luego cada ~14 s (enfurecido, cada ~10), con su nombre encima
(la primera vez también en el aviso: «¡Groudon usó Filo del Abismo!»). Todas avisan antes en el suelo (o se ven venir).
No hay dos firmas iguales en la tabla (lo comprueba `tests/jefes.test.cjs`). Lo que te pueden hacer: dormirte o congelarte
(no te mueves un momento y luego un rato no te pasa otra vez), confundirte (vas al revés), quemarte (daño unos segundos),
darte sueño (te duermes a los 2 s), hacerte resbalar (hielo), atraerte, empujarte o lanzarte. Se ve encima de tu Pokémon.

## Legendarios y singulares (grietas)

La llegada: al entrar en la grieta tu Pokémon (y los demás, en grupo) viaja por un túnel 2 s (se salta tocando la pantalla o
con Espacio; en grupo, el anfitrión). Al llegar, el legendario tarda ~2 s en aparecer, cada uno a su manera: un estilo y un toque
propios, sin dos iguales.

| # | Pokémon | Firma | Qué hace | Llegada |
|---|---|---|---|---|
| 144 | Articuno | Ventisca | ondas de hielo con un hueco y placas de hielo a tu alrededor en las que resbalas | cae del cielo, con copos |
| 145 | Zapdos | Trueno | nubes de tormenta que te persiguen y descargan rayos debajo (sigue mientras ataca) | entre rayos, con chispas |
| 146 | Moltres | Ataque Aéreo | se eleva y cae en picado donde estás tres veces; cada caída deja fuego y abre un anillo de llamas con un hueco | cae del cielo, con brasas |
| 150 | Mewtwo | Barrera | barrera (casi no recibe daño), luego Onda Mental: te aparta de golpe y suelta anillos de disparos | se materializa, con aura |
| 151 | Mew | Metrónomo | Metrónomo: la firma de otro legendario al azar | sale de una burbuja, con ADN |
| 243 | Raikou | Chispazo | ondas eléctricas con dos huecos que salen y luego vuelven hacia él (te pueden dar a la ida y a la vuelta) | entre rayos, con lluvia |
| 244 | Entei | Estallido | géiseres en anillo a tu alrededor; cuanta más vida le queda, más brotan | sale de la lava, con humo |
| 245 | Suicune | Surf | una ola cruza la arena de lado a lado (dos veces): sólo se pasa por su hueco; si te pilla, te arrastra | sale de un remolino, con aurora |
| 249 | Lugia | Aerochorro | viento que te empuja y un rayo en esa misma dirección | cae del cielo, con plumas |
| 250 | Ho-Oh | Fuego Sagrado | pilares de fuego de colores en espiral que te queman (daño unos segundos); una vez, con poca vida, renace (Ceniza Sagrada: se cura un 25 %) | cae del cielo, con arcoíris |
| 251 | Celebi | Premonición | relojes donde has estado estallan un momento después: no te pares | entre pétalos, con hojas |
| 377 | Regirock | Roca Afilada | anillos que estallan desde él hacia fuera y rocas que caen | sus puntos de Braille, con esquirlas |
| 378 | Regice | Rayo Hielo | anillos que se cierran hacia él y te congelan (te quedas quieto un momento) | sus puntos de Braille, con hielo |
| 379 | Registeel | Defensa Férrea | anillos hacia fuera y hacia dentro a la vez, y se protege mientras | sus puntos de Braille, con engranajes |
| 380 | Latias | Bola Neblina | se hace invisible (sólo se ve su brillo) y embiste tres veces dejando niebla que frena | se materializa, con niebla |
| 381 | Latios | Resplandor | dos embestidas y luego un rayo | cae del cielo, con viento |
| 382 | Kyogre | Pulso Primigenio | inunda alrededor (frena) y lanza anillos de agua con un hueco | sale de un remolino, con lluvia |
| 383 | Groudon | Filo del Abismo | grietas desde él (una hacia ti) que dejan el suelo ardiendo, con sol | sale de la lava, con sol |
| 384 | Rayquaza | Ascenso Draco | sube al cielo y cruza la arena en picado en línea recta, tres veces | baja del cielo en espiral, con viento |
| 385 | Jirachi | Deseo Oculto | estrellas que caen tarde formando una estrella de cinco puntas a tu alrededor | baja en una estrella, con estrellas |
| 386 | Deoxys | Psicoataque | cambia de forma: Ataque (Psicoataque enorme), Defensa (barrera) o Velocidad | cae como un meteorito, con aura |
| 480 | Uxie | Bostezo | burbujas de sueño que te siguen: si te da una, a los 2 s te duermes un momento | sale de un lago en calma, con runas |
| 481 | Mesprit | Paranormal | orbes que te persiguen: si te dan, te confunden (te mueves al revés unos segundos) | sale de un lago en calma, con corazones |
| 482 | Azelf | Explosión | se lanza a por ti y explota | sale de un lago en calma, con chispas |
| 483 | Dialga | Distorsión | el tiempo va lento para vosotros y dispara un rayo enorme | con su reloj, con aura |
| 484 | Palkia | Corte Vacío | cortes en el espacio que se cruzan donde estás y se quedan abiertos (queman) unos segundos | por una grieta en el espacio, con estrellas |
| 485 | Heatran | Lluvia Ígnea | jaula de magma que se cierra a tu alrededor y deja lava | sale de la lava, con magma |
| 486 | Regigigas | Agarrón | te arrastra hacia él y luego estalla en anillos enormes | sus puntos de Braille, con runas |
| 487 | Giratina | Golpe Umbrío | se hunde en su sombra, te persigue, sale debajo de ti y deja su sombra (frena) | sale de su sombra, con humo |
| 488 | Cresselia | Danza Lunar | brazos de lunas que giran desde él y se abren; además se cura | se materializa, con lunas |
| 489 | Phione | Danza Lluvia | hace llover y suelta burbujas lentas que flotan hacia ti; con la lluvia se va curando | sale de una burbuja, con lluvia |
| 490 | Manaphy | Cambiaalmas | corazones que te siguen y luego se cambia de sitio contigo | sale de una burbuja, con corazones |
| 491 | Darkrai | Brecha Negra | oscuridad (sólo ves cerca de ti) y charcos: si te quedas en uno, te duermes | sale de su sombra, con ojos rojos |
| 492 | Shaymin | Fulgor Semilla | flores alrededor y un estallido enorme | entre pétalos, con pétalos |
| 493 | Arceus | Sentencia | cambia de tabla (de tipo) y caen pilares de ese tipo alrededor de ti y uno enorme sobre ti | baja por un pilar de luz, con las 17 tablas |
| 494 | Victini | V de Fuego | tajos en V hacia ti | sale de la lava, con la V |
| 638 | Cobalion | Espada Santa | tajos en cuadrícula sobre ti: tres de un lado y luego tres del otro | cristales que se rompen, con espadas |
| 639 | Terrakion | Espada Santa | embestidas que hacen caer rocas | parte el suelo y sale, con espadas |
| 640 | Virizion | Hoja Aguda | tajos en zigzag uno tras otro, cada uno cruzado con el anterior | entre pétalos, con espadas |
| 641 | Tornadus | Vendaval | viento que cambia de dirección tres veces y tornados que queman | baja de una nube negra, con viento |
| 642 | Thundurus | Electormenta | filas de rayos que cruzan la vista de un lado a otro | baja de una nube negra, con rayitos |
| 643 | Reshiram | Llama Azul | llamas azules en espiral que dejan fuego azul en el suelo | cae del cielo, con fuego azul |
| 644 | Zekrom | Ataque Fulgor | dos embestidas enormes que dejan electricidad | entre rayos, con humo |
| 645 | Landorus | Fuerza Telúrica | tres filas de pinchos de tierra que avanzan desde él hacia ti, con arena | baja de una nube negra, con arena |
| 646 | Kyurem | Mundo Gélido | ondas heladas con un hueco: si te dan, te congelan | cristales que se rompen, con hielo |
| 647 | Keldeo | Sable Místico | un tajo larguísimo que da la vuelta entera a su alrededor | sale de un remolino, con espadas |
| 648 | Meloetta | Canto Arcaico | notas que frenan y luego cambia a forma Danza y embiste dos veces | se materializa, con notas |
| 649 | Genesect | Tecno Shock | cruz de cuatro rayos (fuego, agua, eléctrico, hielo) que gira | cristales que se rompen, con engranajes |
| 716 | Xerneas | Geocontrol | se carga y durante 10 s ataca más a menudo y va más rápido | entre pétalos, con arcoíris |
| 717 | Yveltal | Ala Mortífera | cae en picado tres veces dejando oscuridad que frena; se cura con cada caída | sale de su sombra, con plumas |
| 718 | Zygarde | Mil Flechas | flechas que caen en cuadrícula (dos tandas) | sus células se juntan, con hexágonos |
| 719 | Diancie | Tormenta de Diamantes | diamantes que caen alrededor de ti y estallan en esquirlas | cristales que se rompen, con estrellas |
| 720 | Hoopa | Paso Dimensional | abre tres portales y te golpea desde ellos | sale de su aro, con chispas |
| 721 | Volcanion | Chorro de Vapor | chorros de vapor que brotan alrededor de ti y te lanzan por los aires | sale de la lava, con niebla |
| 772 | Código Cero | Garra Brutal | tres tandas de zarpazos anchos delante de él | cristales que se rompen, con cadenas |
| 773 | Silvally | Multiataque | cambia de tipo y dispara dos anillos de ese tipo | cristales que se rompen, con arcoíris |
| 785 | Tapu Koko | Campo Eléctrico | campo eléctrico grande con descargas sobre ti mientras estás dentro | su caparazón se abre, con chispas |
| 786 | Tapu Lele | Campo Psíquico | campo psíquico con descargas y orbes que te persiguen | su caparazón se abre, con pétalos |
| 787 | Tapu Bulu | Campo de Hierba | campo de hierba en el que se cura, y Mazazo: una embestida | su caparazón se abre, con hojas |
| 788 | Tapu Fini | Campo de Niebla | campo de niebla: no se ve lejos y hay charcos que frenan | su caparazón se abre, con niebla |
| 789 | Cosmog | Salpicadura | Salpicadura… no pasa nada (y se teletransporta lejos) | sale de una burbuja, con estrellas |
| 790 | Cosmoem | Masa Cósmica | barrera que le protege mientras te atrae hacia él | baja por un pilar de luz, con estrellas |
| 791 | Solgaleo | Meteoimpacto | se carga brillando y lanza una sola embestida enorme que cruza la arena | cae del cielo, con sol |
| 792 | Lunala | Rayo Umbrío | oscuridad, charcos que frenan y un rayo que barre | sale de su sombra, con lunas |
| 800 | Necrozma | Láser Prisma | se carga y su rayo se divide en cinco al final | entre rayos de colores, con esquirlas |
| 801 | Magearna | Cañón Floral | tres rayos seguidos hacia ti, cada uno más flojo | entre pétalos, con engranajes |
| 802 | Marshadow | Robasombra | sale debajo de ti tres veces seguidas y te roba la velocidad | sale de su sombra, con fuegos fatuos |
| 807 | Zeraora | Puños Plasma | cuatro embestidas cortas; al final su rastro eléctrico estalla | entre rayos, con viento |
| 808 | Meltan | Cañón Resplandor | tuercas que giran a tu alrededor y se van cerrando | sus células se juntan, con engranajes |
| 809 | Melmetal | Ferropuño Doble | tres puños enormes que caen donde estás | sale de la lava, con engranajes |
| 888 | Zacian | Tajo Supremo | tajos en estrella que pasan por ti | cae del cielo, con espadas |
| 889 | Zamazenta | Embate Supremo | barrera y, al bajarla, embiste con su escudo | cristales que se rompen, con hexágonos |
| 890 | Eternatus | Rayo Infinito | rayo enorme y charcos tóxicos | baja por un rayo rojo, con humo |
| 891 | Kubfu | Demolición | puños en fila hacia ti | parte el suelo y sale, con aura |
| 892 | Urshifu | Golpe Oscuro | tres puñetazos seguidos donde estás | parte el suelo y sale, con viento |
| 894 | Regieleki | Electrojaula | jaula cuadrada de electricidad que se cierra a tu alrededor | sus puntos de Braille, con rayitos |
| 895 | Regidrago | Dracoenergía | abanico de cinco rayos | sus puntos de Braille, con fuegos fatuos |
| 896 | Glastrier | Lanza Glacial | lanzas de hielo que caen alrededor de ti y se quedan clavadas (frenan) | parte el suelo y sale, con hielo |
| 897 | Spectrier | Orbes Espectro | orbes que llegan desde los bordes y se cierran sobre ti | sale de su sombra, con niebla |
| 898 | Calyrex | Lluevehojas | ondas de hojas con dos huecos | se materializa, con hojas |
| 905 | Enamorus | Ciclón Primavera | viento y tornados que te atraen | baja de una nube negra, con corazones |
| 1004 | Chi-Yu | Sofoco | llamas en espiral que se cierran sobre ti; después queda expuesta (recibe más daño) | sale de la lava, con runas |
| 1007 | Koraidon | Nitrochoque | da una vuelta a tu alrededor dejando un anillo de fuego y luego te atraviesa | parte el suelo y sale, con sol |
| 1015 | Munkidori | Cadena Virulenta | charcos tóxicos alrededor de ti y cadenas | sale de su sombra, con burbujas tóxicas |
| 1016 | Fezandipiti | Atracción | su perfume te atrae hacia él, en medio de un charco tóxico, y lanza lunas | entre pétalos, con corazones |
| 1017 | Ogerpon | Garrote Liana | puños en fila que dejan lianas (frenan) | parte el suelo y sale, con hojas |
| 1024 | Terapagos | Teraclúster | barrera y luego anillos de disparos, cada uno de un tipo | entre rayos de colores, con hexágonos |

## Jefes del calendario con firma propia

| # | Pokémon | Firma | Qué hace |
|---|---|---|---|
| 3 | Venusaur | Rayo Solar | rayo enorme mientras siembra Drenadoras a tu alrededor (te quitan vida y le curan) |
| 6 | Charizard | Anillo Ígneo | llamas en anillo a tu alrededor y un estallido de fuego desde él |
| 9 | Blastoise | Hidrocañón | tres chorros en paralelo; el retroceso le echa hacia atrás |
| 59 | Arcanine | Velocidad Extrema | aparece de golpe a tu lado y embiste, cuatro veces |
| 65 | Alakazam | Teletransporte | se teletransporta al otro lado de ti y dispara |
| 68 | Machamp | Puño Dinámico | cuatro puños en cruz donde estás; el del centro te confunde |
| 94 | Gengar | Bola Sombra | se desdobla en tres (sólo uno es de verdad) y todos lanzan Bolas Sombra |
| 130 | Gyarados | Hiperrayo | rayo que barre un arco delante de él; luego tiene que descansar (recibe más daño) |
| 131 | Lapras | Canto | ondas lentas: si te dan, te duermes |
| 143 | Snorlax | Golpe Cuerpo | tres saltos enormes que caen sobre ti y luego Descanso: duerme y se cura |
| 149 | Dragonite | Enfado | Enfado: te persigue sin parar unos segundos y luego queda confuso (recibe más daño) |
| 212 | Scizor | Puño Bala | cinco embestidas cortas casi sin aviso |
| 214 | Heracross | Megacuerno | una embestida larguísima que te lanza por los aires |
| 229 | Houndoom | Infierno | llamas alrededor de ti que te queman |
| 230 | Kingdra | Hidrobomba | un remolino te arrastra al centro y dispara tres chorros |
| 248 | Tyranitar | Roca Afilada | rocas que caen alrededor de ti y se quedan (frenan), con arena |
| 282 | Gardevoir | Fuerza Lunar | anillos de lunas que se cierran sobre ti |
| 289 | Slaking | Ausente | se echa a dormir (recibe más daño) y luego un Gigaimpacto enorme |
| 350 | Milotic | Hidropulso | ondas de agua con un hueco y se cura |
| 373 | Salamence | Cometa Draco | meteoros que se parten en trozos al caer |
| 376 | Metagross | Puño Meteoro | puños-meteoro en cuadrado a tu alrededor y luego en el centro |
| 392 | Infernape | Envite Ígneo | embestidas en llamas que dejan fuego; se hace daño |
| 445 | Garchomp | Excavar | bajo tierra te persigue, sale debajo de ti y el suelo tiembla en anillos |
| 448 | Lucario | Esfera Aural | una sola esfera grande que te persigue sin perderte |
| 475 | Gallade | Psicocorte | tajos en aspa sobre ti, dos veces |
| 635 | Hydreigon | Pulso Dragón | se carga y lanza tres rayos (sus tres cabezas) |
| 637 | Volcarona | Danza Llama | llamas en espiral y luego va más rápida |
| 658 | Greninja | Shuriken de Agua | tres tandas de shuriken rapidísimos, moviéndose entre tanda y tanda |
| 681 | Aegislash | Escudo Real | barrera y luego forma filo: tajos en estrella |
| 784 | Kommo-o | Fragor Escamas | ondas sonoras con dos huecos; luego baja su defensa (recibe más daño) |
| 887 | Dragapult | Dracoflechas | dos Dreepy que van a por ti y vuelven |
| 998 | Baxcalibur | Asalto Espadón | una embestida enorme y luego queda expuesto (recibe el doble de daño) |

## El resto de jefes del calendario: según su tipo y sus estadísticas

Con dos tipos, 4 de cada 10 especies usan la del segundo; el número de golpes cambia un poco de una especie a otra; y cada una
tiene su toque según sus estadísticas: rápido: después corre más unos segundos; duro: aguanta más mientras la usa; de ataque especial: acaba con un anillo de disparos; fuerte: acaba con un pisotón donde está.

| Tipo | Firma | Qué hace |
|---|---|---|
| normal | Hiperrayo | rayo enorme hacia ti |
| fire | Llamarada | llamas en forma de estrella de cinco puntas a tu alrededor |
| water | Surf | ondas de agua con un hueco |
| grass | Planta Feroz | tajos de hojas que salen de él en todas direcciones |
| electric | Trueno | rayos que caen alrededor de ti |
| ice | Ventisca | ondas heladas que frenan |
| fighting | A Bocajarro | puños en fila hacia ti |
| poison | Onda Tóxica | charcos tóxicos alrededor de ti |
| ground | Terremoto | anillos que estallan desde él hacia fuera |
| flying | Pájaro Osado | cae en picado donde estás, dos veces |
| psychic | Psicocarga | orbes psíquicos que te persiguen |
| bug | Al Ataque | un enjambre de orbes que te persiguen |
| rock | Avalancha | rocas que caen en fila hacia ti |
| ghost | Golpe Fantasma | se hunde en la sombra, te persigue y sale debajo de ti |
| dragon | Cometa Draco | meteoros alrededor de ti |
| dark | Tajo Umbrío | tajos en estrella que pasan por ti |
| steel | Defensa Férrea | barrera y luego anillos de disparos |
| fairy | Brillo Mágico | ondas de luz con dos huecos |

## Cooperativo

Lo decide el anfitrión. Los peligros, disparos y el clima ya iban por la red; lo nuevo (campos y marcas) va con `['bsg', {...}]`:
cada uno ve y sufre lo suyo (también lo que le pasa a su Pokémon: dormido, confuso...). Cambiaalmas manda a quién mueve (`swap`).
La grieta: `'arena'` trae `intro` (viaje y llegada), `'rk'` (el anfitrión salta el viaje para todos) y `'lgi'` (dónde salen
los legendarios). Un invitado de la versión anterior no conoce nada de esto: entra directo, ve aparecer a los legendarios unos
segundos después y no ve (ni sufre) los campos nuevos.

## Curva de dificultad

Se mide con `node tools/curve.cjs` (partidas enteras con un bot; ver la cabecera del archivo). Lo que salió al ajustarla está en
el comentario de `G.Enemies.eff` (`js/data/enemies.js`).

Qué se cambió: la fuerza de los enemigos, jefes y legendarios va con un tiempo «efectivo» (`G.Enemies.eff`: más despacio al
principio, más deprisa al final); los golpes empiezan más flojos y llegan a lo normal en el minuto 15 (`earlyK`) y la vida, en
el 12 (`earlyHp`); el tramo final empieza en el 15 y llega a +80 % de vida y +55 % de daño; al principio caben menos a la vez
(`capAt`: 28 al empezar, 50 en el minuto 6 y 64 en el 18); hasta el minuto 20 un jefe espera 90 s a que caiga el anterior y
como mucho hay 2 jefes del mapa a la vez, contando el grupo entero (un dúo del final espera a que no quede ninguno; antes, con
uno vivo, salía igual y quedaban 3); los jefes de los minutos 3-12 y 15-21 tienen menos vida (el del 9, 3000 PV); el primer cerco
(hasta el 12) deja un hueco; las grietas se abren desde el minuto 4, y una de los primeros minutos es más floja (un 45 % menos en
el 3, normal en el 10); la experiencia sigue al reloj real (`xpLag`) y, mientras hay un jefe (salen 4 veces menos enemigos),
cada enemigo da 2,5 veces la suya (`FIGHT_XP` en `spawner.js`); y los que empiezan la partida como preevolución (Gible,
Charmander…) reciben un 25 % menos hasta el minuto 8, que vuelve a lo normal en el 14 (`youngK`, lo aplica `player.hurt`).

Medido el 28-10-2026 (bot que esquiva y recoge, inmortal: apunta cuándo habría caído). «Muro» = primer minuto con 10 caídas o
más, o con 5 dos minutos seguidos. Delibird (flojo), Charizard (medio, empieza de Charmander), Garchomp (empieza de Gible) y
Mewtwo (fuertes). Antes: 1 partida de cada; después, 2. El 29-10-2026 se volvió a medir con los ataques ya
finales de los 18 tipos: sin mejoras el muro había vuelto al minuto 3-9, y se suavizó el principio (EARLY_K 0,5 y los
golpes y la vida llegan a lo normal en el minuto 11 y el 10, en vez del 9 y el 8).

| | Muro con todas las mejoras | Muro sin mejoras | Caídas medias 0-10 / 10-20 / 20-30 (máx. · sin) |
|---|---|---|---|
| Antes (8834a1e9) | Charizard 5, Delibird 8, Garchomp 8, Mewtwo sin muro | Garchomp 2, Delibird 3, Charizard 5, Mewtwo 6 | 68 / 350 / 575 · 89 / 525 / 535 |
| 28-10 (ataques de antes) | Charizard 15 y 24, Garchomp 18 y 25, Delibird 19 y sin muro, Mewtwo 21 y sin muro | Charizard 11 y 12, Garchomp 11 y 12, Delibird 17 y 25, Mewtwo 19 y 19 | 0 / 29 / 174 · 8 / 86 / 224 |
| Con los ataques finales (29-10), antes de ajustar | Charizard 19 y sin muro, Garchomp 16 y 19, Delibird 13 y 25, Mewtwo sin muro (2) | Charizard 3 y 5, Garchomp 3 y 9, Delibird 6 y 6, Mewtwo 9 y 16 | 0 / 11 / 61 · 33 / 174 / 459 |
| 29-10: golpes y vida del principio más suaves hasta el minuto 10-11 | Charizard 16 y 20, Garchomp 15 y sin muro, Delibird 28 y sin muro, Mewtwo sin muro (2) | Charizard 9 y 17, Garchomp 13 y sin muro, Delibird 12 y 13, Mewtwo 28 y sin muro | 0 / 19 / 78 · 5 / 116 / 287 |
| 29-10, revisión: tope de 2 jefes, grietas desde el 4, jefes del 3 al 12 más flojos, principio hasta el 12-15 | Charizard 23 y sin muro (2), Garchomp sin muro (3), Delibird 26, 27 y sin muro, Mewtwo sin muro | Charizard 13, Garchomp 7, Delibird 11, Mewtwo 20 | 0 / 1 / 20 · 12 / 88 / 579 |
| Ahora (29-10, revisión 2: preevoluciones protegidas hasta el 8-14, experiencia durante los jefes, jefe del 9 con 3000 PV, dúos dentro del tope; sólo Charizard y Garchomp) | Charizard 21, 22, 24 y sin muro, Garchomp sin muro (2) | Charizard 12 y 13, Garchomp 13 y 20 | 0 / 2 / 32 · 1 / 135 / 190 |

Desde la revisión del 29-10 se decide también con la **primera caída** (cuándo habría acabado la partida de verdad), no sólo con
el muro: el dueño se quejaba de no pasar del minuto 10 con todas las mejoras, y eso es la primera caída. Con todas las mejoras, antes
de esta revisión (8 partidas): mediana en el minuto 11,7 y sólo 3 en el 15 o más tarde. Ahora (10 partidas: Charizard, Delibird y
Garchomp tres veces y Mewtwo una): mediana en el 20,9, 8 en el 15 o más tarde y ninguna antes del 12,8 (Charizard sin caer, 19,8 y
14,4; Delibird 20,4, 24,9 y 12,8; Garchomp 19,9, 21,4 y 26,0; Mewtwo sin caer). Sin mejoras, la primera caída sigue llegando pronto
con los que empiezan flojos (Garchomp 3,0 desde Gible, Delibird 4,7, Mewtwo 5,9, Charizard 9,8): el primer jefe les dura varios
minutos y mientras sale poca experiencia. El informe de `curve.cjs` da al final la mediana de la primera caída.

Revisión 2 (29-10-2026): otra revisión midió 11 partidas con todas las mejoras y dio una mediana de 16,7, con 6 en el 15 o más
tarde. Garchomp caía hacia el minuto 5 en 3 de 6 (4,7, 4,9 y 5,2, sin ningún jefe: toques y avisos en el suelo) y Charizard en el 11
en 2 de 5; además, un Garchomp con ataques flojos seguía en el Nv. 23 en el minuto 10 porque los jefes del 6 y del 9 le duraban
minutos y, mientras, salía poca experiencia. Con los cambios de arriba (`youngK`, `FIGHT_XP`, jefe del 9 con 3000 PV) y la protección
hasta el minuto 12: Garchomp 19,6, 26,9, 16,1, 20,4, 19,1 y 20,2; Charizard 16,4, 19,5, 11,1 y 12,4 (mediana 19,3). Con la protección
hasta el 14 (lo que queda): Charizard 17,9, 15,1, 16,8 y 21,9; Garchomp 16,8 y sin caer; las 6 en el 15 o más tarde, y en el minuto 10
todas van entre el Nv. 43 y el 69. Sin mejoras: Garchomp 5,1 y 12,2, Charizard 5,6 y 8,7 (antes 3,0 y 9,8). En ninguna de estas 20
partidas hay 3 jefes del mapa a la vez (antes, en 7 de 17, entre los minutos 24 y 29).

El bot varía mucho de una partida a otra (sobre todo por las cartas que le salen: con ataques flojos se atasca de nivel y cae
antes), así que conviene medir al menos dos de cada. Ejemplo: `node tools/curve.cjs --par 8 --out <carpeta> 6:max:2 6:zero:2
225:max:2 225:zero:2 150:max:2 150:zero:2 445:max:2 445:zero:2` (unos 35 min con 8 a la vez).
