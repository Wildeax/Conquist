import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainSampler } from './browser-life.mjs';
import {
  boardPorts,
  sampleConstruction,
  BOARD_SPACING,
} from './browser-layout.mjs';
import { createChimneySmoke } from './browser-smoke.mjs';

const players = ['#f2a93b', '#36b8bd', '#df655d', '#aa88e3'];

export function createBoardPieces(
  layout,
  prefabs,
  metadata = {},
  options = {},
) {
  const group = new THREE.Group();
  group.name = 'Board_Construction_Review';
  const ports = options.ports ?? boardPorts(layout),
    sample = options.sample ?? sampleConstruction(layout),
    samplers = new Map(),
    buckets = new Map();
  const smokeOrigins = [];
  prefabs.get('Cargo')?.traverse((node) => {
    if (node.userData.cargoType)
      prefabs.set('Cargo_' + node.userData.cargoType, node);
  });
  let baseTriangles = 0,
    tokensReady = false;
  function addPrefab(kind, matrix, owner) {
    const prefab = prefabs.get(kind);
    prefab.updateMatrixWorld(true);
    prefab.traverse((node) => {
      if (!node.isMesh) return;
      const geometry = node.geometry
        .clone()
        .applyMatrix4(node.matrixWorld)
        .applyMatrix4(matrix);
      // Static art is batched across all piece types, including player banners.
      for (const name of Object.keys(geometry.attributes))
        if (!['position', 'normal', 'uv'].includes(name))
          geometry.deleteAttribute(name);
      const color = new THREE.Color(
        /^Piece_Owner_(Tint|Trim)$/.test(node.material.name) &&
          owner !== undefined
          ? players[owner]
          : 0xffffff,
      );
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3)
        colors.set([color.r, color.g, color.b], i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (!buckets.has(node.material.name))
        buckets.set(node.material.name, {
          material: node.material.clone(),
          geometries: [],
        });
      buckets.get(node.material.name).geometries.push(geometry);
    });
  }
  const pose = new THREE.Object3D();
  function place(kind, x, y, z, rotation = 0, owner, scaleX = 1) {
    pose.position.set(x, y, z);
    pose.rotation.set(0, rotation, 0);
    pose.scale.set(scaleX, 1, 1);
    pose.updateMatrix();
    addPrefab(kind, pose.matrix, owner);
  }
  for (const building of sample.buildings) {
    const v = layout.vertices[building.id],
      kind = building.city ? 'City' : 'Settlement';
    const connected = sample.roads
      .map((r) => layout.edges[r.id])
      .find((e) => e.a === v.id || e.b === v.id);
    const next = connected
      ? layout.vertices[connected.a === v.id ? connected.b : connected.a]
      : null;
    building.rotation = next
      ? Math.atan2(next.x - v.x, next.z - v.z)
      : Math.atan2(v.x, v.z);
    place(kind, v.x, 0.078, v.z, building.rotation, building.owner);
    for (const chimney of metadata[kind]?.chimneys ?? []) {
      const p = new THREE.Vector3(...chimney).applyMatrix4(pose.matrix);
      smokeOrigins.push(p.toArray());
    }
  }
  for (const road of sample.roads) {
    const e = layout.edges[road.id],
      a = layout.vertices[e.a],
      b = layout.vertices[e.b];
    place(
      'Road',
      (a.x + b.x) / 2,
      0.08,
      (a.z + b.z) / 2,
      -Math.atan2(b.z - a.z, b.x - a.x),
      road.owner,
      Math.hypot(b.x - a.x, b.z - a.z),
    );
  }
  const cargoNames = ['Timber', 'Clay', 'Wool', 'Grain', 'Stone'];
  for (const port of ports) {
    const angle = Math.atan2(port.dx, port.dz);
    place('Port', port.x, 0, port.z, angle);
    const cargo = cargoNames[port.type] ?? 'General';
    if (prefabs.has('Cargo_' + cargo))
      place(
        'Cargo_' + cargo,
        port.x + port.dx * 0.36,
        0.116,
        port.z + port.dz * 0.36,
        angle,
      );
  }
  // Seal sub-millimeter differences left by terrain decimation. These strips
  // sit at the shared rim, rather than leaving visible seawater between tiles.
  const seams = [];
  for (const edge of options.seams === false ? [] : layout.edges) {
    const a = layout.vertices[edge.a],
      b = layout.vertices[edge.b];
    if (a.hexes.filter((h) => b.hexes.includes(h)).length !== 2) continue;
    const geo = new THREE.BoxGeometry(
      Math.hypot(a.x - b.x, a.z - b.z) + 0.002,
      0.012,
      0.008,
    );
    geo.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
    geo.translate((a.x + b.x) / 2, 0.076, (a.z + b.z) / 2);
    seams.push(geo);
  }
  const seamMesh = new THREE.Mesh(
    seams.length ? mergeGeometries(seams) : new THREE.BufferGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x60543c, roughness: 1 }),
  );
  seamMesh.name = 'Joined_Terrain_Rims';
  if (seams.length) group.add(seamMesh);
  else {
    seamMesh.geometry.dispose();
    seamMesh.material.dispose();
  }
  seams.forEach((g) => g.dispose());
  const raider = layout.hexes[sample.raider],
    offset = options.robberOffset ?? [0.15, 0.18],
    robberFocus = {
      x: (raider?.x ?? 0) + offset[0],
      z: (raider?.z ?? 0) + offset[1],
      y: 0.29,
    };
  // Desert height is finalized after loading the terrain (including its dunes).
  let robber = null;
  function finalizeBatches() {
    for (const [name, { material, geometries }] of buckets) {
      material.vertexColors = true;
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.name = 'Construction_' + name;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      geometries.forEach((g) => g.dispose());
    }
    buckets.clear();
    group.traverse((node) => {
      if (node.isMesh)
        baseTriangles +=
          (node.geometry.index?.count ??
            node.geometry.attributes.position.count) / 3;
    });
  }
  finalizeBatches();
  const smoke = createChimneySmoke(smokeOrigins);
  group.add(smoke.points);

  function finishTerrain() {
    if (tokensReady || samplers.size !== 6) return;
    tokensReady = true;
    if (!raider) return;
    robber = prefabs.get('Robber').clone(true);
    robber.traverse((node) => {
      if (node.isMesh) {
        node.geometry = node.geometry.clone();
        node.material = node.material.clone();
      }
    });
    const robberHeight = Math.max(
      ...Array.from({ length: 8 }, (_, i) =>
        samplers.get(raider.resource ?? 'Desert')(
          offset[0] + Math.cos((i * Math.PI) / 4) * 0.069,
          offset[1] + Math.sin((i * Math.PI) / 4) * 0.056,
        ),
      ),
    );
    robber.position.set(robberFocus.x, robberHeight + 0.001, robberFocus.z);
    robberFocus.y = robberHeight + 0.2;
    robber.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = node.receiveShadow = true;
        baseTriangles +=
          (node.geometry.index?.count ??
            node.geometry.attributes.position.count) / 3;
      }
    });
    group.add(robber);
  }
  return {
    group,
    ports,
    sample,
    setTime(time) {
      smoke.setTime(time);
    },
    setTerrain(kind, geometry) {
      if (!samplers.has(kind)) {
        samplers.set(kind, terrainSampler(geometry, { highest: true }));
        finishTerrain();
      }
    },
    focusHouse: {
      ...layout.vertices[sample.buildings.find((b) => !b.city)?.id],
      rotation: sample.buildings.find((b) => !b.city)?.rotation,
    },
    focusRobber: robberFocus,
    focusCity: {
      ...layout.vertices[sample.buildings.find((b) => b.city)?.id],
      rotation: sample.buildings.find((b) => b.city)?.rotation,
    },
    focusPort: ports.find((p) => p.type === 2) ?? ports[0],
    stats() {
      return {
        constructionTriangles: baseTriangles,
        settlements: sample.buildings.filter((b) => !b.city).length,
        cities: sample.buildings.filter((b) => b.city).length,
        roads: sample.roads.length,
        ports: ports.length,
        numberTokens: tokensReady ? 18 : 0,
        robber: robber ? 1 : 0,
        boardSpacing: BOARD_SPACING,
        smokeParticles: smoke.count,
        chimneys: smokeOrigins.length,
        cargoDisplays: ports.length,
        playerFlags: sample.buildings.length,
      };
    },
  };
}
