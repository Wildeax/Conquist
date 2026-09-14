# Suelo con relieve físico · revisión v03

Petición del usuario: el suelo del hexágono parecía demasiado liso, con la
textura pegada como color. Esta revisión cambia la geometría del suelo y
de sus paredes laterales, conservando el relieve grande y la distribución
de árboles, cultivos y accesorios de v02.

`sculpt-ground.py` abre las escenas `*-v02-details.blend`, interpola la
superficie y su paleta original, y construye una base de mayor resolución:
97.741 vértices superiores, 194.400 triángulos superiores, nueve franjas
laterales y una tapa inferior. El desplazamiento del suelo forma parte de
la malla que se exporta a GLB. Los detalles no dependen del shader de Blender.

- Stone: fractura de suelo rocoso, pequeños hundimientos y 800 fragmentos.
- Clay: terrones redondeados de baja altura, separaciones y 1.100 fragmentos.
- Grain: tierra removida y surcos, senderos más compactados y 850 fragmentos.
- Desert: ondulaciones de arena modeladas y 140 granos de grava concentrados.
- Timber: suelo irregular de bosque, sendero más compacto y 750 fragmentos.

Los fragmentos pequeños se agrupan en un objeto editable `Ground_Aggregates`.
Su parte inferior queda enterrada en el suelo y conservan colores de la
paleta del terreno mediante `COLOR_0`. Blender y glTF multiplican esa paleta
por la misma textura neutra de superficie. La exportación fuerza el atributo
de color activo para no perder el color de la tierra.

Las paredes laterales tienen pequeños entrantes de erosión modelados. El
radio exterior sigue siendo 0,955, la cara inferior está a -0,10 y el borde
superior exacto permanece a 0,08. La malla es cerrada; el generador comprueba
el uso de cada arista, las coordenadas finitas y la altura del borde.

Se reajustan las posiciones de los objetos existentes a la nueva altura del
terreno. Los árboles se trasladan como unidades y el espantapájaros conserva
su jerarquía; en las mallas de plantas agrupadas se desplazan sus vértices.
Esta adaptación y la densidad son propias de la revisión de arte. La
[versión para navegador](BROWSER.md) conserva estos originales y reduce
la geometría mediante simplificación y horneado de normales. Su integración
en el mapa jugable sigue pendiente.

## Generación y revisión

Desde la raíz del repositorio:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/sculpt-ground.py -- --terrain All
node art/blender/build-review.mjs v03
node art/blender/inspect-textured-exports.mjs v03
node art/blender/check-art-review.mjs v03
```

`--terrain` acepta también una sola identidad de terreno. `--skip Clay`,
por ejemplo, permite continuar con las otras piezas después de revisar esa.
Regenerar sobrescribe solo la carpeta v03 correspondiente; guardar aparte
las ediciones manuales. Las versiones v01 y v02 quedan conservadas.

Cada carpeta v03 contiene la escena `*-geometry.blend` antes de texturizar,
la escena terminada `.blend`, el `.glb`, las texturas PNG y un informe
`ground-report.json`. Las vistas `ground-perspective.png` y `ground-detail.png`
permiten revisar el relieve. La galería `review-v03.html` compara el suelo
anterior v02 con el nuevo y enlaza los archivos editables. La prueba en
Three.js genera además `glb-browser-preview.png`.

El atlas del terreno usa la lista de caras superiores para separar la
superficie y las paredes UV. Así las nuevas franjas laterales no se solapan
con la proyección del suelo. Las texturas PBR vuelven a hornearse sobre esta
geometría; el color de la base queda incluido en ellas y no se multiplica
por segunda vez durante la exportación.
