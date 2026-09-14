import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('./output/', import.meta.url);
const version = process.argv[2] || 'v02';
assert.ok(['v02', 'v03'].includes(version));
const ground = version === 'v03';
const layout = JSON.parse(await readFile(new URL('layout.json', root), 'utf8'));
const variants = [['Stone', 'stone-relief'], ['Clay', 'clay-relief'], ['Grain', 'wheat-fields'],
  ['Desert', 'desert-relief'], ['Timber', 'forest']];
for (const [resource, stem] of variants) {
  const directory = `${stem}-${version}/`;
  const binary = await readFile(new URL(`${directory}${stem}-${version}.glb`, root));
  assert.equal(binary.toString('ascii', 0, 4), 'glTF');
  assert.equal(binary.readUInt32LE(4), 2);
  assert.equal(binary.readUInt32LE(8), binary.length);
  const jsonLength = binary.readUInt32LE(12);
  const gltf = JSON.parse(binary.toString('utf8', 20, 20 + jsonLength));
  const binaryStart = 28 + jsonLength;
  assert.ok(!gltf.cameras?.length, 'Review camera leaked into export');
  const terrain = gltf.nodes.find(node => node.name === `${resource}_Relief_${version}`);
  assert.ok(terrain, `${resource}: missing terrain`);
  const logical = layout.hexes.find(h => h.resource === (resource === 'Desert' ? null : resource));
  assert.equal(terrain.extras.hexId, logical.id);
  assert.equal(terrain.extras.resource, resource);
  assert.ok(terrain.extras.colorBakedFromVertices);
  if (ground) {
    assert.ok(terrain.extras.groundTopFaces > 190000, 'Dense soil mesh missing');
    const grains = gltf.nodes.find(node => node.name === 'Ground_Aggregates');
    assert.ok(grains?.extras.physicalGrains > 0);
    assert.ok(gltf.meshes[grains.mesh].primitives.every(p => p.attributes.COLOR_0 !== undefined),
      'Soil grains lost their terrain colors');
  }
  assert.ok(gltf.meshes[terrain.mesh].primitives.every(p => p.attributes.COLOR_0 === undefined),
    'Baked color would be multiplied by vertex colors again');
  const terrainMaterial = gltf.materials[gltf.meshes[terrain.mesh].primitives[0].material];
  for (const texture of [terrainMaterial.pbrMetallicRoughness.baseColorTexture,
    terrainMaterial.pbrMetallicRoughness.metallicRoughnessTexture, terrainMaterial.normalTexture]) {
    const image = gltf.images[gltf.textures[texture.index].source];
    const offset = binaryStart + (gltf.bufferViews[image.bufferView].byteOffset || 0);
    assert.equal(binary.readUInt32BE(offset + 16), 1024, 'Terrain map was replaced by a smaller prop texture');
  }
  for (const material of gltf.materials) {
    assert.ok(material.pbrMetallicRoughness.baseColorTexture, `${material.name}: missing base color`);
    assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture, `${material.name}: missing roughness`);
    assert.ok(material.normalTexture, `${material.name}: missing normal map`);
  }
  for (const image of gltf.images) {
    assert.equal(image.mimeType, 'image/png');
    assert.ok(image.bufferView !== undefined && !image.uri, 'Texture must be embedded');
    const view = gltf.bufferViews[image.bufferView];
    const offset = binaryStart + (view.byteOffset || 0);
    assert.equal(binary.toString('hex', offset, offset + 8), '89504e470d0a1a0a');
    assert.ok(binary.readUInt32BE(offset + 16) >= 256);
  }
  let vertices = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, `${mesh.name}: missing UVs`);
    for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
      const accessor = gltf.accessors[primitive.attributes[attribute]];
      assert.equal(accessor.componentType, 5126);
      const view = gltf.bufferViews[accessor.bufferView];
      const components = attribute === 'TEXCOORD_0' ? 2 : 3;
      const start = binaryStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
      for (let i = 0; i < accessor.count; i++) for (let c = 0; c < components; c++) {
        assert.ok(Number.isFinite(binary.readFloatLE(start + i * (view.byteStride || components * 4) + c * 4)));
      }
    }
    vertices += gltf.accessors[primitive.attributes.POSITION].count;
  }
  for (const name of [`${stem}-${version}.blend`, `${stem}-${version}-${ground ? 'geometry' : 'details'}.blend`,
    `${ground ? 'ground' : 'textured'}-perspective.png`, `${ground ? 'ground' : 'textured'}-detail.png`,
    ground ? 'ground-report.json' : 'detail-texture-report.json']) {
    assert.ok((await stat(new URL(directory + name, root))).size > 0, `Missing ${name}`);
  }
  console.log(JSON.stringify({resource, hexId: logical.id, materials: gltf.materials.length,
    embeddedTextures: gltf.images.length, vertices, sizeMB: +(binary.length / 1048576).toFixed(2), valid: true}));
}
