import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Matrix4, Quaternion, Vector3 } from '../../app/node_modules/three/build/three.module.js';

const binary = await readFile(new URL('./output/conquist-map-base.glb', import.meta.url));
assert.equal(binary.toString('ascii', 0, 4), 'glTF');
assert.equal(binary.readUInt32LE(4), 2);
const jsonLength = binary.readUInt32LE(12);
const gltf = JSON.parse(binary.toString('utf8', 20, 20 + jsonLength));
const bufferStart = 20 + jsonLength + 8;
const layout = JSON.parse(await readFile(new URL('./output/layout.json', import.meta.url), 'utf8'));
const tiles = gltf.nodes.filter(node => node.extras?.hexId !== undefined);
assert.equal(tiles.length, 19);
assert.equal(new Set(tiles.map(node => node.extras.hexId)).size, 19);

for (const tile of tiles) {
  const logical = layout.hexes[tile.extras.hexId];
  const matrix = new Matrix4().compose(
    new Vector3(...(tile.translation ?? [0, 0, 0])),
    new Quaternion(...(tile.rotation ?? [0, 0, 0, 1])),
    new Vector3(...(tile.scale ?? [1, 1, 1])),
  );
  assert.ok(Math.abs(matrix.elements[12] - logical.x) < 1e-5);
  assert.ok(Math.abs(matrix.elements[14] - logical.z) < 1e-5);
  assert.equal(tile.extras.resource, logical.resource ?? 'Desert');
  const accessor = gltf.accessors[gltf.meshes[tile.mesh].primitives[0].attributes.POSITION];
  assert.equal(accessor.componentType, 5126);
  const view = gltf.bufferViews[accessor.bufferView];
  const points = [];
  for (let i = 0; i < accessor.count; i++) {
    const start = bufferStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? 12);
    points.push(new Vector3(binary.readFloatLE(start), binary.readFloatLE(start + 4), binary.readFloatLE(start + 8)).applyMatrix4(matrix));
  }
  // Actual exported corners must line up with logical building vertices.
  for (const vertexId of logical.vertices) {
    const vertex = layout.vertices[vertexId];
    const corner = new Vector3(logical.x + (vertex.x - logical.x) * 0.955, 0.125,
      logical.z + (vertex.z - logical.z) * 0.955);
    assert.ok(points.some(point => Math.hypot(point.x - corner.x, point.z - corner.z) < 0.025),
      `Hex ${logical.id}: corner ${vertexId} is misaligned`);
  }
}
console.log(`GLB verified: ${tiles.length} terrain IDs, resources, positions and hexagon orientations match the game.`);
