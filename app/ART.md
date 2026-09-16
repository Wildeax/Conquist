# The Ember Isles

Conquist's original visual direction is a miniature volcanic archipelago. Deep teal water and slate surroundings frame carved, warm-lit terrain. Amber, turquoise, coral and violet identify the four players, accompanied by different sigils.

## Playable medieval diorama

The live board now uses the reviewed Blender models from `public/diorama/v1`:
all six terrain types, animated sheep, medieval houses and walled cities,
stone roads with player-colored borders, cargo ports with sailing ships and
the hooded Raider. These 13 compressed GLBs total about 31.3 MiB. A local
Draco decoder avoids external CDN requests. The assets are committed, so a
fresh checkout can build and play without installing Blender.

`lib/scene/diorama-state.ts` preserves the engine's IDs and graph while scaling
presentation coordinates to join the hexagons. `components/board.tsx` retains
the existing legal-action dispatch, hover preview, touch confirmation and
Raider victim selection. The same board component consumes local and online
snapshots. An empty match has no sample buildings. Upgrades replace houses;
ownership, roads and the Raider are rebuilt only when construction state changes.
Ports and floating labels derive from the actual map seed and harbour endpoints.
The Raider sits on the sampled ground near the tile rim and marks blocked production.

The reviewed water, lighting, wind, sheep, smoke, pieces and label modules live
in `lib/scene/diorama/`. Art-review files re-export those modules to avoid a
separate production copy. Material environment reflections remain removed.
The sea retains its cached planar reflection; animated shadows and reflections
refresh at most four times per animation second, and rendering is capped at
30 fps. Reduced motion freezes animation. Lite graphics disables shadows and
wind, halves the sheep count and uses a smaller water mesh. Normal and roughness
textures, custom depth materials, render targets and detached labels are disposed
when switching maps or graphics quality. Missing assets fall back to the basic
procedural board with an explicit status message.

Assets are original procedural work; supplied references guided their design.
Blender source scripts and the authoring notes are in `../art/blender`.
Regenerate selected source assets there, then run `node tools/publish-diorama-assets.mjs`
from `app/`. After publishing a version, use a new directory/version and update
the runtime and nginx cache path for later asset revisions. `manifest.json`
records sizes and SHA-256 hashes. Large intermediate `.blend` files and renders
remain local and are not needed by the game.

Validation: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build:vps`.
`node tools/check-diorama.mjs` exercises the actual browser at
`CONQUIST_TEST_URL` (default `http://localhost:4320`), including a real canvas
click, saved-state restoration, city upgrades, Raider movement, mobile layout,
graphics reload and failed-asset fallback. Test output goes to ignored
`outputs/diorama-check`. On Windows, Node 22 avoids a known local Node 25
process-close assertion after an otherwise successful production build.

The older factories in `models.ts` and `environment.ts` remain as the loading
failure fallback. Their portable seven-model exports remain in `public/models`.

## Generated game atlases

These original assets were generated with the built-in image generation tool, visually inspected, and copied into the repository. The supplied game screenshot informed the desired presentation, not copied artwork. Atlases are sampled with cell-specific UVs or CSS background positions.

- `public/art/terrain-atlas-v1.webp`: 1536 × 1024, three columns and two rows: forest soil, clay, meadow, crop stubble, basalt, sandy ash.
- `public/art/leader-atlas-v1.webp`: 1254 × 1254, two-by-two portraits: amber captain, teal navigator, coral stoneworker, violet scholar. The generator returned a larger size than requested.
- `public/art/resource-atlas-v1.webp`: 1024 × 1536, two columns and three rows: logs, bricks, wool, wheat, stone, fortune card. Alpha includes softly painted shading around the objects.

The public files use quality-82 WebP compression. Versioned names allow browsers and the CDN to cache them permanently while a future visual revision can use a new filename.

Generation prompts:

> Terrain: Use case: stylized-concept. Asset type: fantasy RTS terrain texture atlas. Generate ONE image exactly 1536x1024 pixels. Exact edge-to-edge 3 columns by 2 rows of equal 512x512 square flat top-down diffuse terrain textures, no padding, borders, gutters, or text. Row 1 left: dark forest soil with tiny moss and needles. Row 1 middle: burnt orange cracked clay and fine gravel. Row 1 right: lush meadow grass. Row 2 left: golden dried crop stubble earth. Row 2 middle: grey basalt quarry rock with fine fissures. Row 2 right: warm sandy volcanic ash. Original painterly semi-realistic fantasy RTS ground textures, richly detailed but tileable-looking. Even diffuse light. Each texture fills its whole square to exact adjacent cell edges. NO perspective, trees, people, large objects, shadows, labels, or watermarks.

> Portraits: Use case: stylized-concept. Asset type: fantasy videogame leader portrait atlas. Generate ONE image exactly 1024x1024 pixels. Exact 2x2 grid of four equal 512x512 portrait cells, no margins, lines, gutters, frames, or text. Four distinct original fantasy island expedition leaders painted in premium videogame realism, shoulders-up centered with entire head contained in each cell. Top-left: amber-clad weathered male captain with short dark beard. Top-right: teal-clad female navigator with dark curly hair. Bottom-left: coral-clad rugged older male stoneworker with auburn beard. Bottom-right: violet-clad silver-haired female scholar. Dramatic warm rim light and dark neutral backgrounds, consistent painterly realism. No franchise characters, lettering, labels, logos, or watermarks. Exact quadrants with every portrait wholly contained in its respective cell.

> Resources: Use case: stylized-concept. Asset type: fantasy videogame resource sprite atlas with actual transparent alpha background. Generate ONE image exactly 1024x1536 pixels. Exact 2 columns by 3 rows of equal 512x512 cells with NO visible grid. Transparent background, centered isolated 3D painted game inventory objects, each occupies central 65% of its cell without overlap. Row 1 left: bundle of timber logs. Row 1 right: stack of orange clay bricks. Row 2 left: cream wool bundle. Row 2 right: golden wheat sheaf. Row 3 left: basalt stone cluster. Row 3 right: ancient gold-trimmed fortune card with compass sigil. Consistent warm key light from upper-left. Actual transparent background, not white and not a painted checkerboard. No lettering, labels, numbers, frames, watermarks, or shadows outside cells. Exactly six distinct objects in the precise stated positions, entirely isolated with generous transparent spacing.

## Earlier procedural water refinement

Water revision: replaced directional sine stripes with drifting, rotated noise layers, pixel-footprint filtering, softer glints and broken shoreline foam. The reflectance treatment follows the [official Three.js Water implementation](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water.js). This remains a custom single-pass shader, not the full reflective Water addon. The enlarged ocean fades to the exact background color before its boundary or the camera's far clipping plane becomes visible.

## Audio

`lib/audio.ts` synthesizes original layered dice rattles, construction impacts, trade chimes, Fortune flourishes, Raider bass, turn bells and victory notes. Filtered noise and a slow modulation oscillator provide ocean ambience. No external audio samples are used. Audio starts only after user interaction, supports mute and volume, and suspends when the tab is hidden.

## Generated illustration

File: `public/art/ember-isles-v1.webp`

Created with the built-in image generation tool, then inspected and copied into this repository. Used on the game menu. Dimensions: 1536 × 1024.

Prompt:

> Use case: stylized-concept. Asset type: original landscape main-menu background for Conquist: Ember Isles, a tabletop island strategy game. A beautifully rendered miniature diorama of a volcanic archipelago, stylized low-poly and hand-crafted. Small islands with green pine forests, burnt sienna clay cliffs, golden farms and slate quarries surround a central obsidian volcano with a subtle ember-orange glow. Deep teal ocean extending to all edges; an archipelago viewed from a cinematic elevated three-quarter angle. Premium 3D game concept artwork, tactile miniature materials, crisp low-poly silhouettes, finely detailed terrain and soft atmospheric depth. Wide landscape approximately 1536x1024; island and volcano focal group occupies the center and right; left quarter is dark, spacious open ocean with very low detail for menu text overlay. Warm sunlight on clay cliffs and golden farms, cool dusk rim light. Exactly one artwork; no text, lettering, logos, UI, borders, watermark, numbered hex tokens or people.

Interface icons use Lucide, licensed under ISC. Three.js uses MIT. UI uses the installed Base UI/Shadcn components. System fonts avoid external font requests. Action sounds are synthesized locally with Web Audio.
