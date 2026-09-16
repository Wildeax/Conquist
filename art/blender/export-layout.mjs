import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGame } from '../../app/packages/rules/game.ts';

const seed = Number(process.argv[2] ?? 42817);
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
  throw new Error('Seed must be an unsigned 32-bit integer.');
}
const game = createGame(seed);
const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });
const target = new URL('layout.json', output);
await writeFile(target, JSON.stringify({
  seed,
  coordinates: 'Blender (x, y, z) = game (x, -z, height). glTF exports Y up.',
  hexes: game.hexes,
  vertices: game.vertices,
  edges: game.edges,
}, null, 2) + '\n');
console.log(`Exported ${game.hexes.length} hexes, ${game.vertices.length} vertices and ${game.edges.length} edges to ${fileURLToPath(target)}`);
