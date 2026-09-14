import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  createBoardLife,
  isStaticSheep,
  terrainSampler,
} from './browser-life.mjs';
import { createBoardWater } from './browser-water.mjs';
import { createBoardPieces } from './browser-pieces.mjs';
import { createBoardTags } from './browser-tags.mjs';
import { boardPorts } from './browser-layout.mjs';
import {
  dioramaLayout,
  constructionState,
  RAIDER_OFFSET,
} from '../diorama-state.ts';

const kinds = [
  'Stone',
  'Clay',
  'Grain',
  'Desert',
  'Timber',
  'Wool',
  'SheepRig',
  'Settlement',
  'City',
  'Road',
  'Port',
  'Robber',
  'Cargo',
];

// Track all PBR texture slots, including normals and roughness, on unmount.
export function disposeDiorama(
  roots,
  { textures = true, materials = true } = {},
) {
  const geometries = new Set(),
    mats = new Set(),
    maps = new Set();
  for (const root of roots)
    root.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of [
        node.customDepthMaterial,
        ...(Array.isArray(node.material) ? node.material : [node.material]),
      ]) {
        if (!material) continue;
        mats.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) maps.add(value);
        for (const value of Object.values(material.uniforms ?? {}))
          if (value.value?.isTexture) maps.add(value.value);
      }
    });
  geometries.forEach((g) => g.dispose());
  if (materials) mats.forEach((m) => m.dispose());
  if (textures) maps.forEach((t) => t.dispose());
}

export async function loadDioramaAssets(signal) {
  const decoder = new DRACOLoader()
    .setDecoderPath('/diorama/draco/')
    .setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(decoder),
    loaded = [];
  try {
    const results = await Promise.allSettled(
      kinds.map(async (kind) => {
        const response = await fetch('/diorama/v1/' + kind + '.glb', {
          signal,
        });
        if (!response.ok) throw Error('Could not load ' + kind);
        const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
        loaded.push(gltf.scene);
        return [kind, gltf.scene];
      }),
    );
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    const response = await fetch('/diorama/v1/pieces.json', { signal });
    if (!response.ok) throw Error('Could not load model metadata');
    const metadata = await response.json();
    signal.throwIfAborted();
    return {
      prefabs: new Map(results.map((r) => r.value)),
      metadata,
      dispose() {
        disposeDiorama(loaded);
      },
    };
  } catch (error) {
    disposeDiorama(loaded);
    throw error;
  } finally {
    decoder.dispose();
  }
}

export function createDiorama({
  scene,
  renderer,
  camera,
  host,
  game,
  assets,
  lighting,
  lite,
  pieces,
  targets,
}) {
  const layout = dioramaLayout(game),
    ports = boardPorts(layout),
    root = new T.Group();
  root.name = 'Playable_Diorama';
  const { prefabs, metadata } = assets,
    ground = new Map(),
    height = new Map();
  const life = createBoardLife(layout.hexes, prefabs.get('SheepRig'), { lite });
  root.add(life.group);
  for (const kind of kinds.slice(0, 6)) {
    const prefab = prefabs.get(kind);
    prefab.updateMatrixWorld(true);
    const hexes = layout.hexes.filter((h) => (h.resource ?? 'Desert') === kind);
    prefab.traverse((node) => {
      if (!node.isMesh || isStaticSheep(node)) return;
      const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      if (
        node.material.name.endsWith('Ground_Web_PBR') ||
        node.material.name === 'Wool_Meadow_PBR'
      ) {
        ground.set(kind, geometry);
        height.set(kind, terrainSampler(geometry, { highest: true }));
      }
      if (kind === 'Wool' && node.material.name === 'Wool_Meadow_PBR')
        life.setGround(geometry);
      const mesh = new T.InstancedMesh(geometry, node.material, hexes.length);
      if (!lite) life.windMesh(mesh, kind);
      hexes.forEach((h, i) =>
        mesh.setMatrixAt(i, new T.Matrix4().makeTranslation(h.x, 0, h.z)),
      );
      mesh.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    });
  }
  const staticPieces = createBoardPieces(layout, prefabs, metadata, {
    sample: { buildings: [], roads: [], raider: null },
  });
  root.add(staticPieces.group);
  const water = createBoardWater(layout.hexes, ports, { lite });
  root.add(water.mesh);
  lighting.apply(root);
  scene.add(root);
  const tags = createBoardTags(layout, ports, host);
  let active = null,
    key = '',
    lastRefresh = -Infinity,
    time = 0,
    disposed = false;
  const sampleHeight = (hex, x, z) =>
    height.get(hex.resource ?? 'Desert')(x, z);
  function sync(next) {
    if (disposed) return;
    const sample = constructionState(next),
      nextKey = JSON.stringify(sample);
    if (nextKey === key) return;
    key = nextKey;
    if (active) {
      pieces.remove(active.group);
      disposeDiorama([active.group], { textures: false });
    }
    active = createBoardPieces(layout, prefabs, metadata, {
      sample,
      ports: [],
      seams: false,
      robberOffset: RAIDER_OFFSET,
    });
    for (const [kind, geometry] of ground) active.setTerrain(kind, geometry);
    lighting.apply(active.group);
    pieces.add(active.group);
    active.setTime(time);
    for (const el of tags.root.querySelectorAll('.number-tag')) {
      const id = Number(el.dataset.tagId.slice(4));
      el.classList.toggle('blocked', id === next.raider);
      el.title = id === next.raider ? 'Production blocked by the Raider' : '';
    }
    host.dataset.dioramaReady = 'true';
    host.dataset.dioramaState = JSON.stringify(sample);
    water.invalidateReflection();
    renderer.shadowMap.needsUpdate = !lite;
  }
  function preview(action) {
    const kind = {
      road: 'Road',
      settlement: 'Settlement',
      city: 'City',
      raider: 'Robber',
    }[action.type];
    const clone = prefabs.get(kind).clone(true);
    clone.updateMatrixWorld(true);
    clone.traverse((node) => {
      if (node.isMesh) {
        node.geometry = node.geometry.clone();
        node.material = node.material.clone();
        // Preview disposal must never dispose textures shared with the live board.
        for (const name of Object.keys(node.material))
          if (node.material[name]?.isTexture) node.material[name] = null;
        node.material.color.set('#ffe6a0');
        node.material.metalness = 0;
        node.material.roughness = 0.85;
      }
    });
    return clone;
  }
  function raiderPosition(id) {
    const h = layout.hexes[id],
      x = RAIDER_OFFSET[0],
      z = RAIDER_OFFSET[1];
    const y =
      Math.max(
        ...Array.from({ length: 8 }, (_, i) =>
          sampleHeight(
            h,
            x + Math.cos((i * Math.PI) / 4) * 0.069,
            z + Math.sin((i * Math.PI) / 4) * 0.056,
          ),
        ),
      ) + 0.001;
    return new T.Vector3(h.x + x, y, h.z + z);
  }
  function dispose() {
    disposed = true;
    tags.dispose();
    root.removeFromParent();
    if (active) {
      active.group.removeFromParent();
      disposeDiorama([active.group], { textures: false });
    }
    water.mesh.removeFromParent();
    water.dispose();
    disposeDiorama([root], { textures: false });
    assets.dispose();
    delete host.dataset.dioramaReady;
    delete host.dataset.dioramaState;
  }
  try {
    sync(game);
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    sync,
    preview,
    raiderPosition,
    update(elapsed, reduced) {
      time = elapsed;
      life.setTime(lite ? 0 : time);
      active?.setTime(time);
      water.uniforms.waterTime.value = time;
      if (!reduced && time - lastRefresh >= 0.25) {
        lastRefresh = time;
        water.invalidateReflection();
        renderer.shadowMap.needsUpdate = !lite;
      }
    },
    beforeRender() {
      // Placement markers and preview ghosts are UI, not part of the sea reflection.
      const visible = targets.visible;
      targets.visible = false;
      const ghosts = scene.children.filter((o) => o.userData.placementGhost);
      ghosts.forEach((o) => (o.visible = false));
      try {
        water.updateReflection(renderer, scene, camera);
      } finally {
        targets.visible = visible;
        ghosts.forEach((o) => (o.visible = true));
      }
    },
    afterRender() {
      tags.update(camera);
    },
    dispose,
  };
}
