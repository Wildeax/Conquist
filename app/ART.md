# The Ember Isles

Conquist's original visual direction is a miniature volcanic archipelago. Deep teal water and slate surroundings frame carved, warm-lit terrain. Amber, turquoise, coral and violet identify the four players, accompanied by different sigils.

## Original 3D assets

`components/board.tsx` creates the terrain, pine clusters, terraced clay, grazing sheep, farm rows, quarried stone, volcano, settlements, cities, roads, docks and Raider as real Three.js geometry. Static geometry is batched by material. No outside game models or franchise artwork are used. Number labels are rendered to texture from text.

## Generated illustration

File: `public/art/ember-isles.png`

Created with the built-in image generation tool, then inspected and copied into this repository. Used on the game menu. Dimensions: 1536 × 1024.

Prompt:

> Use case: stylized-concept. Asset type: original landscape main-menu background for Conquist: Ember Isles, a tabletop island strategy game. A beautifully rendered miniature diorama of a volcanic archipelago, stylized low-poly and hand-crafted. Small islands with green pine forests, burnt sienna clay cliffs, golden farms and slate quarries surround a central obsidian volcano with a subtle ember-orange glow. Deep teal ocean extending to all edges; an archipelago viewed from a cinematic elevated three-quarter angle. Premium 3D game concept artwork, tactile miniature materials, crisp low-poly silhouettes, finely detailed terrain and soft atmospheric depth. Wide landscape approximately 1536x1024; island and volcano focal group occupies the center and right; left quarter is dark, spacious open ocean with very low detail for menu text overlay. Warm sunlight on clay cliffs and golden farms, cool dusk rim light. Exactly one artwork; no text, lettering, logos, UI, borders, watermark, numbered hex tokens or people.

Interface icons use Lucide, licensed under ISC. Three.js uses MIT. UI uses the installed Base UI/Shadcn components. System fonts avoid external font requests. Action sounds are synthesized locally with Web Audio.
