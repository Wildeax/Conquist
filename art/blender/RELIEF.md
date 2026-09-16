# Relieve · revisiones por pieza

Dirección confirmada: diorama realista con bosques, cultivos y montañas
detallados. La primera montaña recibió aprobación; se conserva en su carpeta.

Las cinco piezas recibieron aprobación para continuar con más detalle y
texturas. La revisión actual v02 se documenta en [TEXTURES.md](TEXTURES.md);
las secciones siguientes conservan los datos y comandos de las bases v01.

Orden de revisión confirmado:

- Montaña: aprobada.
- Colinas de arcilla: aprobadas.
- Campos de trigo con espantapájaros: aprobados para continuar.
- Desierto y bosque amplio: revisión actual.
- Pastos: pendientes.

## Montaña · aprobada

Dirección solicitada: estética realista, trabajada por partes. Esta revisión
contiene **un hexágono montañoso de Stone**, con dos elevaciones principales,
crestas, laderas y surcos. Revisar primero altura, silueta y escala del detalle.

Desde la raíz de Conquist:

```powershell
node --experimental-strip-types art/blender/export-layout.mjs 42817
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-relief.py
```

Resultados en `output/relief-v01/`:

- `stone-relief-v01.blend`: escena editable, material y cámara de revisión.
- `relief-perspective.png` y `relief-top.png`: vistas para comentar.
- `stone-relief-v01.glb`: geometría y colores de vértice exportados.
- `geometry-report.json`: dimensiones, parámetros y validación geométrica.

La pieza está centrada en el origen para reutilizarla como modelo. Guarda el
`hexId` y las coordenadas originales del juego en propiedades personalizadas.
El radio es 0,955; la zona de borde se mantiene a altura 0,08 para estudiar
después el encaje de caminos y poblados. La altura máxima inicial es ~0,807.

La malla cerrada tiene 16.202 vértices y 31.968 caras. El script comprueba que
cada arista pertenezca a dos caras, que las normales superiores apunten arriba
y que el borde permanezca plano. Es una pieza de revisión; todavía no se ha
decidido el presupuesto de geometría del tablero completo.

Para ajustar la misma pieza, añadir al comando de Blender:

```text
-- --height 0.75 --detail 0.8 --subdivisions 72
```

`height` cambia la altura del relieve, `detail` cambia su rugosidad geométrica
y `subdivisions` cambia la resolución de la malla. Regenerar sobrescribe los
resultados de esta revisión: guardar aparte cualquier edición manual.

El material de Blender añade un microrelieve procedural para la vista previa.
Ese microrelieve aún no está horneado en texturas para GLB; las formas de la
montaña y los colores sí se exportan. El shader y la optimización para juego
se prepararán al aprobar el relieve. El juego sigue usando el tablero del
repositorio actualizado; esta pieza no se ha incorporado al mapa jugable.

## Colinas de arcilla · aprobadas

Tres elevaciones redondeadas y más bajas que la montaña, con una depresión
de drenaje sinuosa, surcos superficiales y estratos de tierra expuesta. Los
tonos ocre y rojizo permiten distinguir la arcilla de la roca. Conserva el
radio, grosor de base, borde plano, cámara e iluminación de la primera pieza.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-relief.py -- --terrain Clay
```

Resultados independientes en `output/clay-relief-v01/`:

- `clay-relief-v01.blend`: escena editable para revisar las colinas.
- `relief-perspective.png` y `relief-top.png`: vistas con la misma cámara de referencia.
- `clay-relief-v01.glb`: geometría y colores de vértice.
- `geometry-report.json`: dimensiones y comprobaciones de malla.

Los parámetros `--height`, `--detail` y `--subdivisions` también se aplican a
la arcilla. El generador conserva `Stone` como valor por defecto. Cada terreno
tiene su propia carpeta de salida; regenerar arcilla no modifica la montaña.
El microrelieve procedural sigue siendo propio de la vista de Blender, todavía
sin hornear en texturas para el juego. La revisión actual es del relieve;
vegetación, cultivos y construcción se trabajarán en sus siguientes etapas.

## Campos de trigo · aprobados para continuar

Relieve bajo y ondulado, cuatro parcelas separadas por caminos de tierra,
surcos de siembra e hileras de trigo. Las plantas tienen tallos, hojas,
espigas y aristas modeladas; una franja cosechada deja rastrojo. El conjunto
se mantiene al mismo radio y borde plano que los dos terrenos aprobados.

Se añadió un espantapájaros a petición del usuario junto al cruce interior:
estructura de madera, camisa azul desgastada con remiendo, cabeza de
arpillera cosida, sombrero de paja y cuerdas. Sobresale del trigo sin ocupar
las posiciones de construcción del borde del hexágono.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-relief.py -- --terrain Grain
```

Resultados en `output/wheat-fields-v01/`: `wheat-fields-v01.blend`,
`wheat-fields-v01.glb`, `relief-perspective.png`, `relief-top.png`,
`wheat-detail.png` y `geometry-report.json`.

`wheat_geometry.py` genera las plantas con una semilla fija. Cada parcela es
un objeto editable independiente dentro de `Wheat_Fields`. La exportación
incluye las plantas y sus materiales. Es geometría detallada para revisión;
faltan optimización, niveles de detalle e instancias para el tablero final.
La validación de malla cerrada se aplica a la base de terreno; las hojas y
los tallos usan superficies finas deliberadamente abiertas.

`scarecrow_geometry.py` crea el personaje en la colección `Scarecrow`. Sus
piezas dependen del objeto `Scarecrow_Placement`, que permite moverlo o girarlo
como conjunto. La exportación GLB incluye el espantapájaros y aplica los
modificadores de grosor de la ropa. Las vistas general y de detalle permiten
revisar su escala dentro del campo.

## Desierto · cuarta pieza, en revisión

Tres crestas curvas desplazadas entre sí, con laderas suaves a barlovento,
caras más cortas a sotavento y pequeñas ondulaciones de arena modeladas.
La altura máxima es aproximadamente 0,381; conserva el radio 0,955 y el
borde plano a 0,08. Los tonos arena distinguen esta pieza de la arcilla.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-relief.py -- --terrain Desert
```

Resultados en `output/desert-relief-v01/`: `desert-relief-v01.blend`,
`desert-relief-v01.glb`, `relief-perspective.png`, `relief-top.png` y
`geometry-report.json`. Su identidad en el motor es `resource: null`;
el generador selecciona ese hexágono y usa `Desert` como etiqueta de arte,
igual que la exportación inicial del mapa. No modifica la producción.

## Bosque amplio · quinta pieza, en revisión

Bosque de frondosas sobre suelo ondulado con tierra, musgo y un sendero
sinuoso. Los árboles se reparten por el interior del hexágono, con copas
superpuestas, alturas y tonos variados. Cada árbol tiene raíces adaptadas
al relieve, tronco, ramas, ramillas y hojas geométricas. Hay vegetación baja
y dos troncos caídos bajo las copas. Se conserva libre el perímetro para
las construcciones del tablero.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-relief.py -- --terrain Timber
```

Resultados en `output/forest-v01/`: `forest-v01.blend`, `forest-v01.glb`,
`relief-perspective.png`, `relief-top.png` y `geometry-report.json`.
`forest_geometry.py` utiliza semilla fija 42817. Los árboles son objetos
editables individuales en la colección `Broad_Woodland`; se exportan al
GLB junto con el terreno y la vegetación baja. El informe cuenta árboles,
hojas, vértices y caras, y el generador comprueba que la vegetación arbórea
quede dentro del hexágono con separación respecto al borde.

En ambos terrenos, `--height`, `--detail` y `--subdivisions` ajustan el
suelo. Las dimensiones de los árboles se editan en `forest_geometry.py`;
sus raíces se recalculan para el relieve elegido. Son modelos de revisión
separados del tablero jugable. El bosque aún requiere optimización e
instancias o niveles de detalle antes de repetirlo en un mapa completo.
La comprobación de malla cerrada se aplica a la base, no a las hojas.
El microrelieve procedural de Blender sigue pendiente de hornear para GLB.
