Playable integration: [game assets and runtime](../../app/ART.md).
The base-blockout instructions below describe the initial authoring stage.

# Mapa de Conquist en Blender

Revisión más reciente: [terrenos optimizados para navegador y comparación
del tablero completo](BROWSER.md).

Base editable de 19 hexágonos con los datos reales de `createGame`. Es un
bloqueo inicial de proporciones y posiciones; el relieve y estilo final quedan
pendientes. Los scripts no cambian el tablero que carga el juego.

Desde la raíz del repositorio, en PowerShell:

```powershell
node --experimental-strip-types art/blender/export-layout.mjs 42817
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python art/blender/build-map.py
node art/blender/inspect-export.mjs
```

Archivos generados en `output/` (ignorados por Git):

- `conquist-map-base.blend`: escena editable, cámara y luces.
- `conquist-map-base.glb`: terreno y números para revisar en Three.js.
- `map-preview.png`: vista previa.
- `layout.json`: hexágonos, vértices y aristas del motor de reglas.

La generación sobrescribe estos cuatro archivos; guarda las ediciones manuales
de Blender con otro nombre antes de regenerar.

Unidades: el radio lógico del hexágono es 1. En Blender, `(x, y, z)` corresponde
a `(game.x, -game.z, altura)`; glTF convierte a Y vertical. Cada terreno incluye
`hexId`, `resource`, `number`, `q` y `r` como propiedades personalizadas.
La colección `03_Gameplay_Guides`, oculta inicialmente, contiene los 54 puntos
de construcción y los 72 centros de caminos con sus identificadores. Los
marcadores, cámara, luces y océano de presentación no se exportan al GLB.

## Conexión de Higgsfield

El complemento instalado puede conectar la escena abierta mediante su
[puente oficial](https://higgsfield.ai/plugins/blender):
`https://bridge.higgsfield.ai/mcp`. El servidor de Codex se llama
`higgsfield-bridge`. Para completar o renovar la autorización:

```powershell
codex mcp login higgsfield-bridge
```

Se necesita iniciar sesión en Higgsfield desde el complemento de Blender y
autorizar Codex en el navegador. La disponibilidad del puente se comprueba
cuando Codex muestra sus herramientas y puede consultar la escena abierta.
Los scripts locales anteriores funcionan sin Higgsfield ni generación de pago.

Estado comprobado el 2026-09-13: Blender 5.2.1 LTS y complemento Higgsfield
1.5.52 instalados. El puente quedó registrado en Codex, pero su autorización
OAuth falló al recibir el retorno del navegador:

```text
Authorization server issuer mismatch:
expected https://clerk.higgsfield.ai, received https://higgsfield.ai/_clerk
```

La conexión remota y sus herramientas aún no están operativas. No se modificó
la validación del emisor. La escena local, render y exportación GLB sí se
generaron; `inspect-export.mjs` verificó las 19 piezas y su alineación con las
esquinas lógicas del juego.

Se repitió la conexión después de que el usuario confirmara haber iniciado
sesión tanto en Blender como en la autorización de Codex. El retorno OAuth
llegó, pero volvió a fallar con los mismos dos emisores distintos. La consulta
de credenciales de Codex devuelve `not_logged_in`; no debe confundirse con
la sesión del complemento. El modelado continúa mediante Blender local.
