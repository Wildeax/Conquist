# Segunda pasada de detalle y primeras texturas

La revisión posterior del suelo con volumen físico está en [GROUND.md](GROUND.md).

Las cinco piezas aprobadas se conservan en sus carpetas v01. El proceso
abre esos archivos de Blender, añade geometría en una colección `Details_v02`
y guarda primero un archivo `*-v02-details.blend` sin la nueva pasada de
materiales. Después prepara las texturas y guarda el modelo v02 terminado.

Detalles por terreno:

- Stone: fragmentos de roca y derrubios en las laderas suaves.
- Clay: terrones y pequeñas piedras sobre el suelo erosionado.
- Grain: tres gavillas atadas y paja suelta, conservando el espantapájaros.
- Desert: piedras erosionadas en una zona baja y matorral seco disperso.
- Timber: helechos, hojas caídas, hongos y piedras bajo el bosque existente.

Desde la raíz del repositorio:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/refine-map-details.py -- --terrain All
node art/blender/build-review.mjs
node art/blender/inspect-textured-exports.mjs
node art/blender/check-art-review.mjs
```

`--terrain` también admite `Stone`, `Clay`, `Grain`, `Desert` o `Timber` para
regenerar una sola revisión. Cada salida utiliza su propia carpeta v02.
Una regeneración reemplaza esa v02: guardar aparte cualquier edición manual.
La galería `output/review-v02.html` compara versiones y enlaza vistas cercanas,
archivos Blender y GLB. Funciona como archivo local, sin servidor.

## Materiales exportables

`terrain_pbr.py` crea un atlas UV del terreno y hornea tres mapas de 1024²:

- Color base en sRGB: incluye la paleta de vértices y la variación superficial.
- Rugosidad lineal: variaciones pequeñas de respuesta a la luz.
- Normal tangente +Y, lineal: grano y fisuras, sin cambiar la silueta.

La paleta de vértices se elimina de la copia texturizada tras el horneado
para que GLB no multiplique dos veces ese color. La base original se conserva.
Los materiales de los objetos reciben mapas de 256², con texturas originales
de corteza, fibras de paja, tejido, nervaduras de hojas y piedra. Los mapas
de normal y rugosidad se comparten entre materiales de una misma familia.
Los árboles siguen siendo objetos individuales; las hojas geométricas usan
coordenadas UV por hoja y el resto de piezas proyección por caras.

Las imágenes PNG se guardan en `textures/`, se empaquetan en el `.blend` y
se incluyen en el `.glb`. Blender renderiza usando esos mismos mapas. El
shader exportado utiliza conexiones PBR directas, sin depender de nodos de
ruido exclusivos de Blender. No se utilizan imágenes ni servicios externos.

## Alcance de esta revisión

Las texturas son una primera pasada procedural para revisar el acabado.
Son activos de arte detallados, todavía sin integrar al tablero del juego.
Antes de repetir trigo y bosque en el mapa completo, faltan optimización de
geometría, instancias y niveles de detalle. El relieve añadido por normal
maps no sustituye geometría cuando cambia la silueta de un objeto.

Los informes `detail-texture-report.json` enumeran geometría añadida y mapas.
`inspect-textured-exports.mjs` comprueba los cinco GLB: identidad del terreno,
coordenadas UV y geometría finitas, tres canales PBR por material, imágenes
PNG incrustadas y ausencia de una segunda multiplicación por color de vértice.
`check-art-review.mjs` abre la galería en un navegador sin interfaz, comprueba
el cambio de versiones y carga y renderiza los cinco GLB con el Three.js del
proyecto. Guarda una captura `glb-browser-preview.png` por pieza. Usa un perfil
aislado y un servidor temporal limitado a archivos de arte y Three.js; ambos
se cierran al acabar. No necesita ni cambia una sesión del juego.
Las vistas `textured-perspective.png` y `textured-detail.png` muestran el
acabado exportable; los originales de comparación siguen siendo v01.
