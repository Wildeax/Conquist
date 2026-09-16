import * as THREE from 'three';

// Keep the lighting pass, without the added sky-reflection environment.
// Water retains its existing planar reflection.
export function createBoardLighting(renderer, scene) {
  scene.environment = null;
  renderer.toneMappingExposure = 1.06;
  const hemisphere = new THREE.HemisphereLight(0xcde3f5, 0x665641, 0.85);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff0da, 2.8);
  sun.position.set(-5, 7, 6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc9e3fa, 0.48);
  fill.position.set(5, 3, -4);
  scene.add(fill);
  function apply(root) {
    root.traverse((node) => {
      if (!node.isMesh) return;
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        if (!material.isMeshStandardMaterial) continue;
        if (
          material.name === 'Piece_Window_Glass' ||
          material.name === 'Piece_Forged_Metal'
        ) {
          material.roughness = 0.85;
          material.metalness = 0;
        }
      }
    });
  }
  return {
    sun,
    apply,
    stats() {
      return {
        materialReflections: scene.environment !== null,
        environmentFaceSize: 0,
        environmentCapturesPerFrame: 0,
      };
    },
  };
}
