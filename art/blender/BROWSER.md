# Terrenos para navegador · web-v01

Primera versión optimizada de los cinco terrenos v03, conservando los
originales editables. Los archivos se generan en `output/web-v01/`, ignorado
por Git. Esta entrega incluye una comparación interactiva del tablero de
19 casillas; todavía no sustituye la escena del juego.

## Resultado medido

Prueba local del 13 de septiembre de 2026 en Chromium, Intel UHD Graphics
mediante ANGLE/D3D11, ventana de 1200 × 900 y pixel ratio 1.

| Terreno | Triángulos v03 | Triángulos web-v01 |
| --- | ---: | ---: |
| Montaña / piedra | 240.200 | 14.510 |
| Arcilla | 246.560 | 14.778 |
| Trigo y espantapájaros | 665.758 | 49.394 |
| Desierto | 220.780 | 11.398 |
| Bosque, 49 árboles | 536.384 | 60.274 |

| Tablero completo, primera medición sin sombras | Original v03 | Optimizado |
| --- | ---: | ---: |
| Triángulos dibujados | 6.489.724 | 538.030 |
| Llamadas de dibujo | 2.924 | 42 |
| Descarga de los cinco GLB únicos | 115,6 MiB | 16,6 MiB |
| Tiempo mediano de render | 18,2 ms | 0,8 ms |
| Percentil 95 de render | 21,0 ms | 2,1 ms |

Son 30 muestras tras 12 cuadros de calentamiento, moviendo la cámara. El
tiempo incluye el render síncrono con `gl.finish()`, no mide los FPS de una
partida completa. Ambas versiones incluyen cuatro pastos provisionales;
no incluyen agua, edificios, sombras ni interfaz o lógica de partida. La
descarga cuenta solo los GLB, excluyendo Three.js y el decodificador Draco.
No se ha verificado todavía en dispositivos móviles.

La prueba pasó los límites de geometría, llamadas de dibujo y descarga,
decodificación Draco, mapas PBR incrustados, ausencia de error WebGL,
cambio entre versiones y ausencia de render continuo mientras está quieto.
El informe exacto y las capturas están en `output/web-v01/`:
`browser-benchmark.json`, `board-optimized.png` y `board-original.png`.

## Iluminación y sombras

El visor ahora inicia con sombras activadas y permite compararlas con el
botón «Sombras». Mantiene la iluminación ambiental y un único sol. Usa un
mapa de sombras de 2048 × 2048, filtrado PCF, para terrenos y accesorios;
no agrega archivos a la descarga de los modelos.

El mapa se genera al cargar o cambiar de versión y al reactivar las
sombras. Se conserva al girar, acercar o redimensionar la vista, porque
la luz y los objetos permanecen fijos. Si se incorporan objetos móviles o
se cambia el sol, hay que marcar `light.shadow.needsUpdate = true`.

Medición de la primera revisión de sombras, con el mismo equipo, viewport y protocolo anteriores:

| Tablero optimizado | Mediana de render | Percentil 95 |
| --- | ---: | ---: |
| Sin sombras | 0,7 ms | 1,1 ms |
| Con sombras reutilizadas | 1,5 ms | 2,2 ms |
| Regenerando sombras cada cuadro, solo para comparar | 2,1 ms | 3,1 ms |

Los tiempos varían entre ejecuciones: la primera prueba de sombras midió
1,2 ms sin sombras y 1,6 ms con ellas. Estas cifras son tiempos de render
locales, no una garantía de FPS del juego completo.

Al reutilizar el mapa se mantienen las 42 llamadas de dibujo por cuadro.
Un cuadro que regenera sombras usa 84 llamadas y dibuja 1.076.060
triángulos contando ambas pasadas; la geometría de la escena sigue siendo
538.030 triángulos. El informe registra por separado ambos casos y verifica
que la cámara no vuelve a dibujar el mapa de sombras. También comprueba
el botón y que el tablero quieto no dibuja cuadros adicionales.

Capturas: `output/web-v01/board-shadows.png` y
`output/web-v01/board-shadows-detail.png`. El JSON del benchmark se actualiza
al ejecutar la prueba y contiene también las mediciones sin sombras.

## Montaña nevada y roca oscura

La revisión `snow-and-slate-v01` añade nieve con un límite irregular según
altura y pendiente, afloramientos de roca gris oscura repartidos mediante
ruido tridimensional y sombreado de cavidades horneado. Se conserva el
relieve: 14.510 triángulos, los mismos materiales y mapas de 1024 píxeles.
El GLB pasa de 2.903.584 a 2.905.940 bytes. El sombreado de cavidades forma
parte del color; las sombras del sol siguen calculándose en el navegador.

El sol del visor baja de `(-5, 9, 6)` a `(-5, 7, 6)` y la intensidad de la
luz hemisférica pasa de 2,0 a 1,7 para hacer más legibles las laderas. Este
ajuste de iluminación afecta a todo el tablero; los otros modelos se conservan.
El botón «Ver montaña» centra la cámara en una casilla de piedra y «Centrar»
regresa al tablero completo. Captura: `output/web-v01/mountain-browser.png`.

Para reproducir el acabado, después de generar los terrenos optimizados:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/mountain-surface.py
node art/blender/benchmark-browser.mjs
```

El script conserva una copia previa de la montaña en
`output/mountain-before-snow/` y siempre parte de ella al repetir el horneado,
para no acumular oscurecimiento. Esa copia fija la geometría de esta revisión;
si cambia el modelo base en el futuro, hay que versionar también ese origen.
Sobrescribe solamente el acabado Stone de `web-v01`. El archivo `.blend`
conserva los nodos procedurales y el mapa horneado incrustado.

La prueba posterior al acabado pasó la carga Draco/PBR, geometría y llamadas
de dibujo, alternancia de versiones, sombras y reutilización del mapa. El
tablero conserva 538.030 triángulos, 42 llamadas por vista con sombras
reutilizadas y 16,6 MiB de modelos. En esa ejecución, la mediana con sombras
fue de 1,5 ms y el percentil 95 de 2,5 ms; siguen aplicando las limitaciones
de medición anteriores.

## Qué cambia

- Cada base pasa a 9.670 triángulos. Color y normales del suelo v03 se
  hornean en mapas de 1024 × 1024; se mantiene el relieve principal y una
  parte de las piedras pequeñas. La silueta del microdetalle se simplifica.
- El trigo conserva el 70 % de las plantas completas con espigas y tallos
  simplificados; conserva el espantapájaros y los accesorios.
- El bosque conserva sus 49 árboles, simplifica ramas y usa menos hojas
  de mayor tamaño para conservar la cobertura.
- Los accesorios se agrupan por material. El visor reutiliza geometrías
  y materiales mediante `InstancedMesh` para las casillas del mismo recurso.
- Los GLB usan Draco, con cuantización de posición 14, normales 10 y UV 12.
  El visor configura `DRACOLoader` con los decodificadores locales de Three.js.
- El visor dibuja al cargar, girar, acercar o redimensionar. El pixel ratio
  está limitado a 1,5. Al comparar, mantiene ambas versiones en memoria;
  ese consumo acumulado no representa cargar únicamente los modelos web.

## Rocas apoyadas, vegetación baja y laterales

`refine-browser-ground.py` aplica la revisión posterior a la nieve:

- Revisa las 56 rocas independientes de Stone contra la malla final mediante
  rayos. Aplana ligeramente su forma, las orienta a la pendiente y entierra
  su parte inferior. Ocho rocas de zonas altas o demasiado inclinadas se
  recolocan más abajo. Comprueba que cada roca atraviese la superficie y
  conserve una parte visible. Stone mantiene 14.510 triángulos.
- Añade 100 rosetas de helechos y 50 matas de hierba a Timber, respetando
  el sendero y el margen exterior. Son 6.450 triángulos adicionales por
  bosque: 66.724 en total. Se reutilizan el material de helechos y sus mapas;
  la vegetación se une al grupo de accesorios existente.
- Separa el material de las paredes del material superior en los cinco
  terrenos. Sus UV siguen la distancia real por el perímetro y la altura,
  a escala uniforme. Una textura repetible de tierra, con estratos suaves y
  capa superior más oscura, sustituye el atlas lateral anterior. Color,
  normales y rugosidad se hornean con Blender a 256 × 256. Los pastos verdes
  provisionales del visor siguen siendo geometría de bloqueo.

El tablero actualizado tiene **563.830 triángulos, 47 llamadas por vista y
17,5 MiB en los cinco GLB únicos**. La prueba de Chromium pasó las
comprobaciones de carga, presupuestos, sombras y reutilización. Capturas:
`output/web-v01/mountain-browser.png`, `forest-browser.png` y
`board-shadows.png`. Los botones «Ver montaña» y «Ver bosque» facilitan
revisar las piezas; «Centrar» vuelve a la vista general.

Para reproducir esta revisión después del acabado nevado:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/refine-browser-ground.py
node art/blender/benchmark-browser.mjs
```

La primera ejecución guarda los cinco estados previos en
`output/before-ground-refinement/`. Las siguientes parten de esa copia
para evitar acumular plantas o desplazar las rocas repetidamente. Si cambia
el origen artístico, también debe versionarse esa copia. El script actualiza
los cinco `.blend`, `.glb` e informes, y los renders de revisión de Stone y
Timber. Las capturas del navegador reflejan los cinco materiales finales.

## Paredes reconstruidas · 2026-09-14

La revisión de frente mostró caras laterales torcidas por la simplificación,
que producían franjas diagonales incluso después de separar el material.
`fix-side-surfaces.py` reconstruye las paredes verticales y la tapa inferior
a partir del contorno exacto de la superficie superior. Conserva la nieve,
las rocas asentadas, las plantas y las UV de la superficie.

El acabado usa ahora un atlas continuo de 2048 × 64 por terreno, horneado
con coordenadas espaciales y sin repetición entre las seis caras. El bosque
tiene tierra más oscura. Los laterales tienen sombreado plano independiente.
Los mapas de color, normales y rugosidad permanecen incrustados en cada GLB.

El visor incluye «Ver bordes», que acerca la cámara al bosque exterior desde
un ángulo bajo. La captura `output/web-v01/forest-sides-browser.png` muestra
esa revisión. Las cargas de modelos usan `cache: 'no-store'`; una pestaña
abierta debe recargarse para sustituir los objetos que ya tiene en memoria.

La validación final del navegador pasó: **562.522 triángulos, 47 llamadas
por vista y 18,1 MiB de modelos únicos**. No cambia el alcance de la prueba
respecto a la partida completa. El render de Blender actualizado es el de
Timber; las capturas del navegador usan los cinco GLB finales.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/fix-side-surfaces.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/audit-side-uv.py
node art/blender/benchmark-browser.mjs
```

Ejecutar después de la revisión de rocas y vegetación. El generador conserva
su origen en `output/before-continuous-sides/` y repite desde esa copia.
El auditor comprueba la malla cerrada, las paredes verticales y las UV dentro
del atlas. Los informes individuales registran `rebuilt-continuous-sides-v03`.
También se cierran pequeños huecos del contorno antes de extruir las paredes.
La auditoría pasó para los cinco terrenos: todas las aristas tienen dos caras
incidentes y las paredes son verticales.

## Agua animada · primera revisión

`browser-water.mjs` añade una superficie de agua al visor, alrededor y debajo
del tablero, a altura -0,075. La superficie usa tres ondas sinusoidales con
desplazamiento de vértices y pequeñas ondulaciones de normales en la GPU.
Es oleaje visual sencillo; no es una simulación de fluidos ni tiene colisiones,
salpicaduras o interacción con barcos.

El color se aclara cerca de las casillas usando un campo de distancias de
256 × 256 generado al cargar. Las luces existentes producen los brillos y el
agua recibe las sombras del tablero. No añade pasadas de reflexión ni vuelve
a generar los mapas de sombras al mover las olas. No utiliza imágenes externas
ni modifica los modelos Blender.

La malla añade 32.768 triángulos y una llamada de dibujo. La prueba local a
1200 × 900 midió 1,6 ms de mediana con sombras sin agua y 2,0 ms con agua;
el percentil 95 con agua fue 3,2 ms. Total: **595.290 triángulos y 48 llamadas**.
Los cinco GLB siguen en 18,1 MiB; el código y la malla de agua se cargan/generan
por separado. Estas mediciones no equivalen a los FPS de una partida completa.

«Agua» permite quitar la superficie y «Pausar olas» conservarla inmóvil. El
bucle intenta limitar el oleaje a un máximo aproximado de 30 dibujos por
segundo; mover la cámara puede solicitar cuadros adicionales. Se detiene
al ocultar la pestaña. La preferencia inicial de movimiento reducido inicia
las olas pausadas; el usuario puede animarlas con el botón. Con el agua
desactivada o pausada, el visor vuelve a dibujar solo cuando hay cambios.

`benchmark-browser.mjs` compara el agua por separado, comprueba que cambien
los píxeles mientras se anima, que no se regenere el mapa de sombras y que
el botón de pausa detenga los cuadros. Captura: `output/web-v01/board-water.png`.
Se ejecuta con el mismo comando del benchmark y se abre en el visor habitual.

## Mar con reflejos · referencia Anno 1800

Esta revisión reemplaza el acabado de agua descrito arriba. Usa azul grisáceo,
ondas de fases irregulares, ondulaciones finas en las normales y espuma tenue
junto a la costa. Elimina las franjas diagonales de la primera versión.
Incluye 17 rocas costeras instanciadas, con 1.360 triángulos en una llamada.

Una reflexión planar de 512 × 512 refleja el terreno y las rocas. Se vuelve
a capturar al cambiar la cámara, el tablero, las sombras o la visibilidad del
agua; con la cámara quieta se reutiliza y solo se anima su distorsión. Los
futuros objetos móviles necesitarán invalidar esa captura. Fuera de los
límites de la textura, el reflejo se mezcla gradualmente con el color del
cielo para evitar bordes oscuros al deformar las coordenadas.

La malla concentra sus vértices cerca del tablero y extiende su perímetro
hasta ±1.000 unidades, sin aumentar sus 32.768 triángulos. La distancia de
órbita de 80 unidades mantiene los rayos de la cámara ortográfica sobre el
agua en ángulos bajos; la niebla funde el mar distante con el fondo.
«Ver mar» muestra un ángulo bajo para revisar reflejos y rocas.

El agua y las rocas suman **34.128 triángulos**. La escena principal llega a
**596.650 triángulos y 49 llamadas de dibujo**. Actualizar el reflejo añade
otras **48 llamadas** en una pasada separada: 97 en esos cuadros, sin contar
una eventual actualización de sombras. No se añaden archivos de texturas o
GLB; los cinco modelos siguen sumando 18,1 MiB.

Última prueba local: Intel UHD, ANGLE/D3D11, 1200 × 900, 30 muestras durante
movimiento de cámara. Mediana de renderizado con sombras: 2,1 ms sin agua y
8,8 ms con agua y captura del reflejo; percentil 95 con agua: 13,8 ms.
Incluye la sincronización CPU/GPU. Son tiempos del visor, no FPS garantizados
del juego completo; falta medir la integración con interfaz y dispositivos
móviles. El benchmark verifica que las olas cambien los píxeles sin recapturar
el reflejo con la cámara quieta, que la pausa detenga los cuadros y que no haya
errores WebGL. Capturas: `output/web-v01/board-water.png` y
`output/web-v01/sea-low-angle.png` (1917 × 818).

## Corrección del brillo solar y detalle de rocas costeras

La captura del usuario reveló una saturación que la cámara de la prueba
anterior no mostraba. Se reprodujo a 140,2° de azimut y 42° de elevación:
el 47,8 % de las muestras de mar abierto superaba 0,88 de brillo RGB medio.
El origen era el brillo especular del agua bajo el sol direccional; en una
cámara ortográfica los rayos comparten dirección y ese brillo afecta una
zona muy extensa. Se cambió el material a `MeshPhysicalMaterial`, IOR 1,333,
rugosidad 0,4 e intensidad especular 0,4. Las luces del terreno se conservan.

El benchmark ahora inspecciona 24 vistas (ocho azimuts y elevaciones de 12°,
42° y 75°). Muestrea el framebuffer en posiciones de mar abierto alejadas
de las casillas, sin incluir la interfaz HTML. La prueba falló con el material
anterior y pasa con el corregido: ninguna muestra supera el umbral de blanco
en las vistas comprobadas. Captura del ángulo que fallaba:
`output/web-v01/water-sun-angle.png`. No cubre todos los posibles ángulos o
dispositivos; los valores por vista quedan en `browser-benchmark.json`.

Las 17 rocas tienen geometría individual con bases anchas sumergidas,
hombros irregulares y tres perfiles de coronación. Se combinan en una malla
para conservar una llamada de dibujo. El material procedural añade variación
mineral, grano fino, fisuras y una franja de humedad más oscura. «Ver rocas»
acerca una agrupación de la costa; captura: `coastal-rocks-detail.png`.

Las rocas suman 3.264 triángulos (192 por roca), 1.904 más que antes. El mar
con sus rocas suma 36.032 y la escena principal **598.554 triángulos**, con
las mismas **49 llamadas**, más 48 cuando se actualiza el reflejo. No aumenta
la descarga de GLB. Última ejecución local en Intel UHD a 1200 × 900:
mediana de renderizado de 3,4 ms y percentil 95 de 5,0 ms con agua, sombras
y actualización de reflejos al mover la cámara. Conserva las limitaciones
del visor descritas arriba. También pasan animación, pausa, reutilización
de reflejos y ausencia de errores WebGL.

## Praderas con ovejas · sexto terreno

`build-pasture.py` crea el recurso `Wool` directamente con presupuesto de
navegador. Sustituye las cuatro bases verdes provisionales del visor por
praderas con colinas bajas, un sendero, 950 matas de hierba, flores y piedras.
Cada hexágono tiene seis ovejas adultas y dos corderos; algunas pastan con
la cabeza baja. La lana combina volumen de geometría y un mapa normal.
Las posiciones de las patas y la vegetación se calculan con la función de
altura del relieve. El terreno es una malla cerrada y conserva paredes
verticales con el atlas continuo de tierra del bosque.

Archivos: `output/web-v01/Wool.blend` (editable), `Wool.glb`,
`Wool-preview.png`, `Wool-report.json` y sus mapas PBR. Usa el atlas
`Timber_SideAtlas_*.png` existente; generar los cinco terrenos anteriores
primero. Para regenerar únicamente la pradera:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-pasture.py
```

El prefab tiene **29.583 triángulos**, siete materiales y **4.321.840 bytes**
(4,12 MiB). Se descarga una vez y sus mallas se instancian en los cuatro
hexágonos optimizados. La comparación «Original v03» utiliza la misma
pradera, porque este recurso nuevo no tiene una versión de alta densidad.
Los otros cinco recursos conservan sus comparaciones anteriores.

El tablero de seis recursos suma 680.758 triángulos sin mar y **716.790 con
mar y rocas**, 55 llamadas principales y 54 adicionales al recapturar el
reflejo. La descarga de los seis GLB suma 22,25 MiB. Prueba local Intel UHD,
1200 × 900: 2,8 ms de mediana de renderizado con agua, sombras y reflejos
durante movimiento de cámara; percentil 95 de 4,6 ms. No representa los FPS
de una partida completa ni una medición móvil.

El benchmark comprueba el GLB comprimido, mapas embebidos, presupuesto del
recurso y sustitución de las cuatro bases provisionales. Pasan también las
24 vistas de agua, animación, pausa y reutilización de reflejos. «Ver ovejas»
acerca la pradera; captura de navegador: `output/web-v01/pasture-browser.png`.

## Lana continua y fracturas con profundidad

Se retiraron las doce esferas de lana superpuestas en cada oveja. El cuerpo
usa ahora una sola superficie de vellón con relieve continuo de dos escalas,
normales suavizadas y un mapa de fibras onduladas. El mechón de la frente
también es más bajo. `build-pasture.py` conserva la versión anterior en
`output/before-fleece-refinement` antes de sobrescribirla. El nuevo `Wool.glb`
tiene **29.007 triángulos y 4.286.164 bytes**: 576 triángulos menos por hexágono.

Las rocas costeras ya no dibujan líneas oscuras para simular las grietas.
Cada roca incorpora dos cortes longitudinales en V y una fractura transversal
parcial, con vértices en los labios y el fondo de cada hendidura. Las paredes
interiores forman parte de la misma malla cerrada y participan en las sombras
y los reflejos. El material conserva únicamente grano mineral y humedad.
La geometría se genera en `browser-water.mjs`; las 17 rocas siguen combinadas
en una sola llamada de dibujo, ahora con 400 triángulos por roca.

El tablero completo con mar pasa a **718.022 triángulos**, un incremento neto
de 1.232 frente a la revisión anterior, con las mismas 55 llamadas principales
y 54 adicionales cuando se recaptura el reflejo. Las capturas actualizadas
son `pasture-browser.png` y `coastal-rocks-detail.png`. El benchmark conserva
las comprobaciones de presupuestos, los cuatro pastos, los 24 ángulos de agua,
las sombras, la animación, la pausa y la reutilización del reflejo.

## Vida del mapa · ovejas, viento y nieve

`browser-life.mjs` anima el visor con 32 ovejas articuladas, ráfagas en diez
grupos de vegetación y 270 partículas de nieve concentradas en las cumbres.
Las ovejas alternan caminatas cortas, giros y pastoreo en ciclos de 24 segundos
desfasados entre animales y hexágonos. Las patas alternan apoyo y elevación;
sus apoyos se calculan sobre los triángulos reales de la pradera mediante un
índice espacial. Los recorridos están limitados a zonas dentro del hexágono.
Es animación ambiental con rutas prefijadas, sin navegación libre ni IA.

El modelo compartido `SheepRig.glb` separa cuerpo, cabeza y pata. Sus materiales
se reutilizan en cuatro lotes instanciados para todos los animales. Se ocultan
los dos grupos de ovejas estáticas del prefab Wool, conservando pradera,
piedras y flores. `Wool.blend` conserva su rebaño estático editable; la fuente
articulada es `SheepRig.blend`. Para regenerarla después de cambiar la lana:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-sheep-rig.py
```

En el modo optimizado, el viento deforma copas y ramas altas, trigo y hojas
de hierba en la GPU. Las bases del tronco y las raíces permanecen fijas. El
mismo desplazamiento se aplica al material de profundidad para las sombras.
La comparación Original v03 mantiene su vegetación estática; comparte ovejas
animadas y nieve con el optimizado.

«Pausar vida del mapa» detiene ovejas, vegetación y nieve; «Pausar olas» sigue
controlando el agua por separado. Al pausar ambos, no se dibujan cuadros en
reposo. Ambos respetan la preferencia inicial de movimiento reducido y se
detienen al ocultar la pestaña. La animación solicita hasta unos 30 cuadros/s;
la cámara puede solicitar cuadros adicionales. Sombras y reflejos se
actualizan hasta cuatro veces por segundo mientras la vida del mapa avanza;
mover la cámara sigue recapturando el reflejo para mantener la perspectiva.

Se conserva el total de **718.022 triángulos**, más 270 puntos de nieve. La
escena principal pasa de 55 a **58 llamadas**; recapturar el reflejo añade 57
y reconstruir las sombras añade su propia pasada. El rig añade **230.240
bytes** (225 KiB), con una descarga total de modelos de 22,43 MiB. Última
prueba local Intel UHD a 1200 × 900, con cámara en movimiento y todo animado:
mediana de renderizado 3,5 ms y percentil 95 de 6,1 ms. Estas mediciones del
visor no equivalen a los FPS de la partida completa o de dispositivos móviles.

El benchmark recorre el ciclo cada medio segundo y comprueba límites del
hexágono, separación de las ovejas, desplazamiento y cabeza de pastoreo.
También verifica cambios de píxeles con las olas pausadas, frecuencia limitada
del reflejo y detención de cuadros al pausar ambas animaciones. Capturas:
`sheep-walking.png`, `sheep-grazing.png` y `mountain-snowdrift.png` en
`output/web-v01`. Continúan pasando las comprobaciones anteriores del agua,
GLB, compresión, versiones y errores WebGL.

## Construcciones, puertos y tablero unido — 14 de septiembre de 2026

El visor incluye una composición de muestra con cuatro poblados, cuatro
ciudades y ocho tramos de camino. Las posiciones usan los vértices y aristas
del tablero; los edificios respetan la separación entre asentamientos y cada
pareja del mismo jugador está conectada. Las fachadas y puertas de las ciudades
se orientan hacia su camino de acceso. Los cuatro colores aparecen en banderas,
marcos, esquinas y remates de los tejados, así como en las almenas de las ciudades
y las dos hileras de piedras que bordean cada camino. Una leyenda identifica a
cada jugador. Piedra, paredes y tejas conservan sus materiales naturales.
No representa una partida guardada.

`browser-layout.mjs` mantiene los identificadores y la topología del motor,
pero multiplica las coordenadas de presentación por 0,955 para unir los
hexágonos. Pequeñas juntas de tierra cierran las diferencias de decimación.
El archivo original `layout.json` conserva sus coordenadas.

Los nueve puertos corresponden a las aristas portuarias del motor: cinco
especializados 2:1 y cuatro generales 3:1. Incluyen muelle de piedra y madera,
almacén, grúa, barriles y un velero de dos mástiles con aparejos y velas curvas.
Cada puerto muestra su mercancía: troncos, arcilla, una oveja en un cercado,
sacos y espigas de trigo, o una pila de piedras. Los generales llevan cajas
y barriles. Las rocas costeras reservan espacio para sus accesos.

La casa medieval tiene planta baja de piedra, entramado, ventanas con
contraventanas, porche, buhardilla, tejas superpuestas y chimenea. La ciudad
incluye cuatro torres, cuatro entradas arqueadas abiertas, tres casas,
atalaya, mercado y pozo. Los caminos usan losas de granito irregulares y musgo.
El ladrón tiene capucha abierta, capa, armadura de cuero, botas, bolsos y daga;
se apoya sobre la superficie superior del desierto.

`browser-smoke.mjs` dibuja 224 partículas para 16 chimeneas en una sola
llamada. Comparte el reloj y la pausa de **Vida del mapa**; respeta también
la preferencia de movimiento reducido. No utiliza un simulador de fluidos.

`browser-tags.mjs` coloca 27 etiquetas HTML flotantes: 18 números de
producción con puntos de probabilidad y nueve recursos/relaciones portuarias.
Mantienen su tamaño en pantalla al girar o acercar la cámara, se dibujan
encima del terreno y usan líneas para señalar su ubicación. Buscan espacio
libre entre sí y frente al panel de controles. Los números 6 y 8 se destacan
en rojo. Solo se muestran las etiquetas cuyos anclajes están en el encuadre.
Sustituyen las placas de piedra y los carteles físicos de la primera versión;
ya no se recorta vegetación para alojar los números.

Los modelos se generan con `build-board-pieces.py` y `board_piece_details.py`
y quedan editables en Blender, con GLB comprimidos y mapas PBR de 256 px.
La versión anterior se guardó en `output/before-medieval-pieces`.

| Pieza | Triángulos por modelo | Tamaño GLB |
| --- | ---: | ---: |
| Poblado | 6.742 | 2.003.680 bytes |
| Ciudad | 14.152 | 2.069.828 bytes |
| Camino | 1.752 | 1.245.344 bytes |
| Puerto y velero | 7.191 | 1.521.068 bytes |
| Ladrón | 4.661 | 954.360 bytes |
| Seis variantes de mercancía | 4.626 | 1.471.532 bytes |

`browser-pieces.mjs` agrupa la geometría estática por material y solo muestra
la mercancía de cada puerto. `Piece_Owner_Trim` comparte un material PBR entre
todos los remates y bordillos, con el color del jugador por vértice.
La composición añade 173.500 triángulos.
El tablero optimizado completo con agua, rocas, ovejas y construcciones suma
891.522 triángulos y 78 llamadas en la pasada principal, más 77 al actualizar
el reflejo. Las etiquetas HTML se componen aparte y no añaden llamadas WebGL.
La descarga local de modelos únicos es de 31,3 MiB. Sombras y reflejos requieren
pasadas adicionales; medir la partida real y dispositivos móviles antes
de tomar estas cifras como presupuesto definitivo.

Los botones **Ver casa**, **Ver ciudad**, **Ver puerto** y **Ver ladrón**
acercan las piezas; el zoom máximo permite inspeccionarlas de cerca. El resto de
controles está en **Vistas y controles**, para dejar espacio al tablero.
Las capturas de revisión son `board-water.png`, `city-browser.png` y
`port-browser.png`, `house-browser.png`, `robber-browser.png` y `tags-mobile.png`
dentro de `output/web-v01`.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-board-pieces.py
node art/blender/benchmark-browser.mjs
```

El benchmark comprueba la unión de casillas, la separación de edificios,
los nueve puertos, la compresión, los presupuestos de geometría y dibujos,
la separación de rocas y los controles. Conserva las comprobaciones del agua
en 24 ángulos, pastoreo, recorridos de ovejas y pausas de animación. Comprueba
la separación de etiquetas en esos ángulos y sus límites en un viewport de
390 × 844, además de la vista completa de 1200 × 900.
La frecuencia de refresco del reflejo se contrasta con el tiempo de animación
real, incluyendo el tiempo empleado al capturar imágenes en Chromium.

The reviewed diorama is now integrated into the live game. See
[the runtime and validation notes](../../app/ART.md). The review scene still
uses its deterministic sample construction; the game uses actual match state.
Shared runtime modules live in `app/lib/scene/diorama` and are re-exported here.

## Iluminación — 14 septiembre 2026

Se retiró el entorno de reflejos de materiales y su control por petición del
usuario. `browser-lighting.mjs` conserva el sol cálido, el relleno frío, la luz
hemisférica y la exposición 1,06. También se conservan las sombras PCF suaves
de 2048 px y el ajuste de contacto. Cristales y herrajes reciben un acabado
mate en el visor. Ya no se genera ni se mantiene una textura PMREM del cielo.
El agua mantiene su tratamiento y reflejo planar anteriores.

El benchmark comprueba que el entorno de reflejos está desactivado y conserva
las pruebas del agua desde 24 ángulos, las animaciones y las etiquetas.

## Generación y revisión

Desde la raíz del repositorio, con Blender 5.2 y las dependencias de `app`
instaladas. Se necesitan las cinco escenas v03 y `output/layout.json`.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/optimize-browser.py -- --terrain All
node art/blender/benchmark-browser.mjs
node art/blender/serve-browser-review.mjs
```

Abrir `http://127.0.0.1:4315`. Se puede arrastrar para girar, usar la rueda
para acercar y alternar entre original y optimizado.

El generador acepta también una selección, por ejemplo `--terrain Grain
Timber`. Sobrescribe los archivos correspondientes de `web-v01`; guardar
aparte cualquier edición manual. Cada recurso incluye `.blend`, `.glb`,
texturas horneadas, una imagen de revisión y un informe JSON.

Para volver a comprimir escenas optimizadas existentes sin hornear ni
renderizar otra vez:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/compress-browser.py
```

Antes de incorporar estos recursos al juego, medir también la escena con
interfaz, edificios y efectos activos. Los datos lógicos de cada casilla
deben venir del motor; los extras del GLB proceden de una pieza de referencia.
