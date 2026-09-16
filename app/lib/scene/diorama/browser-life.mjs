import * as THREE from 'three';

const smooth = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const homes = [
  [-0.47, 0.16, -0.58, 0.16, 1],
  [-0.34, -0.3, -0.46, -0.33, 0.96],
  [0.39, -0.3, 0.45, -0.44, 1.02],
  [0.48, 0.15, 0.62, 0.2, 0.95],
  [-0.36, 0.49, -0.47, 0.55, 0.93],
  [0.28, 0.48, 0.15, 0.57, 0.98],
  [-0.2, -0.4, -0.14, -0.48, 0.58],
  [0.49, -0.05, 0.59, -0.01, 0.64],
];
export const isStaticSheep = (node) =>
  /^(Wool_Fleece_PBR|Wool_Faces_and_Hooves)/.test(node.material?.name ?? '');

// Spatial bins of the exported triangles give actual surface height, including
// its small irregularities, without a raycast over the whole board per foot.
export function terrainSampler(geometry, { highest = false } = {}) {
  const p = geometry.attributes.position,
    ix = geometry.index,
    bins = new Map(),
    cell = 0.08;
  for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
    const tri = Array.from({ length: 3 }, (_, j) =>
      new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + j) : i + j),
    );
    const minX = Math.floor(Math.min(...tri.map((v) => v.x)) / cell),
      maxX = Math.floor(Math.max(...tri.map((v) => v.x)) / cell);
    const minZ = Math.floor(Math.min(...tri.map((v) => v.z)) / cell),
      maxZ = Math.floor(Math.max(...tri.map((v) => v.z)) / cell);
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++) {
        const key = x + ',' + z;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(tri);
      }
  }
  return (x, z) => {
    let surface = -Infinity;
    for (const [a, b, c] of bins.get(
      Math.floor(x / cell) + ',' + Math.floor(z / cell),
    ) ?? []) {
      const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(den) < 1e-10) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den,
        v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den;
      if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) {
        const y = u * a.y + v * b.y + (1 - u - v) * c.y;
        if (!highest) return y;
        surface = Math.max(surface, y);
      }
    }
    if (surface > -Infinity) return surface;
    throw Error('Sheep left the pasture surface: ' + x + ',' + z);
  };
}

export function createBoardLife(hexes, rig, { lite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Living_Board';
  const clock = { value: 0 },
    windMaterials = [],
    batches = [];
  const pastures = hexes.filter((h) => h.resource === 'Wool'),
    sheep = [];
  pastures.forEach((hex, tile) =>
    (lite ? homes.slice(0, 4) : homes).forEach((home, index) =>
      sheep.push({ hex, home, index, phase: index * 2.83 + tile * 1.73 }),
    ),
  );
  let groundHeight = () => 0.08,
    groundReady = false;
  rig.updateMatrixWorld(true);
  rig.traverse((node) => {
    if (!node.isMesh) return;
    let part = node.userData.sheepPart;
    for (let parent = node.parent; !part && parent; parent = parent.parent)
      part = parent.userData.sheepPart;
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld),
      count = sheep.length * (part === 'leg' ? 4 : 1);
    const mesh = new THREE.InstancedMesh(geometry, node.material, count);
    mesh.name = 'Animated_Sheep_' + part;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    batches.push({ mesh, part });
    group.add(mesh);
  });

  // A sparse, localized snow drift above each mountain, all in one draw call.
  const mountainHexes = hexes.filter((h) => h.resource === 'Stone'),
    count = lite ? 0 : mountainHexes.length * 90;
  const centers = new Float32Array(count * 3),
    seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const h = mountainHexes[Math.floor(i / 90)];
    centers.set([h.x, 0.68, h.z], i * 3);
    seeds.set(
      [
        (Math.sin(i * 127.1) * 43758.5453) % 1,
        (Math.sin(i * 311.7 + 17) * 12781.21) % 1,
        (Math.sin(i * 74.7 + 2) * 17381.47) % 1,
      ].map((v) => v - Math.floor(v)),
      i * 3,
    );
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(centers, 3));
  snowGeo.setAttribute('snowSeed', new THREE.BufferAttribute(seeds, 3));
  const snowMat = new THREE.ShaderMaterial({
    uniforms: { lifeTime: clock },
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute vec3 snowSeed;uniform float lifeTime;varying float fade;
      void main(){float travel=fract(snowSeed.x+lifeTime*.15);float gust=.6+.4*sin(lifeTime*.48+position.x);
        vec3 p=position+vec3((travel-.5)*1.1,.12+snowSeed.y*.30-travel*.10,(snowSeed.z-.5)*.48);
        p.z+=sin(travel*8.0+lifeTime*.5+snowSeed.y*6.0)*.04*gust;
        fade=sin(travel*3.14159)*(.32+.4*gust);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);gl_PointSize=2.5+snowSeed.z*1.8;}`,
    fragmentShader: `varying float fade;void main(){float d=length((gl_PointCoord-.5)*vec2(1.0,1.6));float alpha=(1.0-smoothstep(.1,.5,d))*fade;if(alpha<.01)discard;gl_FragColor=vec4(.88,.93,1.0,alpha);}`,
  });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.name = 'Summit_Windblown_Snow';
  snow.frustumCulled = false;
  group.add(snow);

  const base = new THREE.Matrix4(),
    partMatrix = new THREE.Matrix4(),
    pivot = new THREE.Matrix4(),
    rotation = new THREE.Matrix4();
  const transform = new THREE.Object3D();
  let states = [],
    lastTime = -1;
  function sampleStates(time) {
    return sheep.map((s) => {
      const [ax, az, bx, bz, scale] = s.home,
        t = (time + s.phase) % 24;
      let progress,
        walking = 0,
        heading,
        graze;
      const forward = Math.atan2(-(bz - az), bx - ax);
      if (t < 4) {
        progress = smooth(t / 4);
        walking = Math.sin((t / 4) * Math.PI);
        heading = forward;
        graze = 1 - smooth(t / 0.6);
      } else if (t < 12) {
        progress = 1;
        heading = forward + Math.PI * smooth((t - 10) / 2);
        graze = smooth((t - 4) / 0.8);
      } else if (t < 16) {
        progress = 1 - smooth((t - 12) / 4);
        walking = Math.sin(((t - 12) / 4) * Math.PI);
        heading = forward + Math.PI;
        graze = 1 - smooth((t - 12) / 0.6);
      } else {
        progress = 0;
        heading = forward + Math.PI * (1 - smooth((t - 22) / 2));
        graze = smooth((t - 16) / 0.8);
      }
      const x = THREE.MathUtils.lerp(ax, bx, progress),
        z = THREE.MathUtils.lerp(az, bz, progress);
      return {
        x,
        z,
        y: groundHeight(x, z),
        scale,
        heading,
        walking,
        headPitch: -graze * (0.98 + 0.035 * Math.sin(time * 7 + s.phase)),
        phase: time * 7 + s.phase,
        hex: s.hex,
        index: s.index,
      };
    });
  }
  function setTime(time) {
    clock.value = time;
    if (!groundReady || lastTime === time) return;
    lastTime = time;
    states = sampleStates(time);
    for (let i = 0; i < states.length; i++) {
      const s = states[i],
        c = Math.cos(s.heading),
        sn = Math.sin(s.heading);
      const front = groundHeight(
          s.x + c * 0.06 * s.scale,
          s.z - sn * 0.06 * s.scale,
        ),
        back = groundHeight(
          s.x - c * 0.06 * s.scale,
          s.z + sn * 0.06 * s.scale,
        );
      const slope = Math.atan2(front - back, 0.12 * s.scale),
        bob = Math.abs(Math.sin(s.phase * 2)) * 0.0015 * s.walking;
      transform.position.set(s.hex.x + s.x, s.y + bob, s.hex.z + s.z);
      transform.rotation.set(0, s.heading, 0);
      transform.scale.setScalar(s.scale);
      transform.updateMatrix();
      base.copy(transform.matrix).multiply(rotation.makeRotationZ(slope));
      for (const { mesh, part } of batches) {
        if (part === 'body') mesh.setMatrixAt(i, base);
        if (part === 'head') {
          partMatrix
            .copy(base)
            .multiply(pivot.makeTranslation(0.02, 0.103, 0))
            .multiply(rotation.makeRotationZ(s.headPitch))
            .multiply(pivot.makeTranslation(-0.02, -0.103, 0));
          mesh.setMatrixAt(i, partMatrix);
        }
        if (part === 'leg')
          for (let leg = 0; leg < 4; leg++) {
            const lx = leg < 2 ? -0.052 : 0.05,
              lz = leg % 2 ? -0.029 : 0.029;
            const gait =
              Math.sin(s.phase + (leg === 0 || leg === 3 ? 0 : Math.PI)) *
              s.walking;
            const footX = lx + gait * 0.012,
              footZ = lz;
            const wx = s.x + (c * footX + sn * footZ) * s.scale,
              wz = s.z + (-sn * footX + c * footZ) * s.scale;
            const surface = groundHeight(wx, wz),
              lift = Math.max(0, gait) * 0.01 * s.scale;
            const top = new THREE.Vector3(lx, 0.075, lz).applyMatrix4(base);
            const foot = new THREE.Vector3(
              s.hex.x + wx,
              surface + lift - 0.001,
              s.hex.z + wz,
            );
            const direction = top.clone().sub(foot);
            transform.position.copy(top);
            transform.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              direction.clone().normalize(),
            );
            transform.scale.set(s.scale, direction.length() / 0.075, s.scale);
            transform.updateMatrix();
            mesh.setMatrixAt(i * 4 + leg, transform.matrix);
          }
      }
    }
    for (const { mesh } of batches) mesh.instanceMatrix.needsUpdate = true;
  }

  // Geometry is already in tile coordinates. The same displacement runs in
  // visible and shadow passes; soil, rocks and low trunk roots stay fixed.
  function windMesh(mesh, kind) {
    const name = mesh.material.name;
    const tree = kind === 'Timber' && /^(Leaf_|Bark_)/.test(name);
    const plant =
      (kind === 'Wool' && name === 'Wool_Meadow_Grass') ||
      (kind === 'Grain' && name.startsWith('Wheat_'));
    if (!tree && !plant) return;
    const p = mesh.geometry.attributes.position,
      uv = mesh.geometry.attributes.uv,
      weights = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++)
      weights[i] = tree
        ? Math.pow(THREE.MathUtils.clamp((p.getY(i) - 0.17) / 0.65, 0, 1), 1.7)
        : kind === 'Wool'
          ? (uv?.getY(i) ?? 0)
          : THREE.MathUtils.clamp((p.getY(i) - 0.12) / 0.22, 0, 1);
    mesh.geometry.setAttribute(
      'windWeight',
      new THREE.BufferAttribute(weights, 1),
    );
    const patch = (shader) => {
      shader.uniforms.lifeTime = clock;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float lifeTime;attribute float windWeight;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 windOrigin=position;
          #ifdef USE_INSTANCING
          windOrigin=(instanceMatrix*vec4(position,1.0)).xyz;
          #endif
          float gust=.45+.55*pow(.5+.5*sin(lifeTime*.65-windOrigin.x*.7-windOrigin.z*.4),2.0);
          float sway=sin(lifeTime*1.5+windOrigin.x*2.0+windOrigin.z)*.6+sin(lifeTime*3.1+position.x*8.0)*.22;
          transformed.x+=windWeight*gust*sway*${tree ? '.035' : '.018'};
          transformed.z+=windWeight*gust*sin(lifeTime*1.2+windOrigin.z*2.0)*${tree ? '.017' : '.009'};`,
        );
    };
    mesh.material = mesh.material.clone();
    mesh.material.onBeforeCompile = patch;
    mesh.material.customProgramCacheKey = () =>
      'conquist-wind-' + (tree ? 'tree' : 'plant');
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    mesh.customDepthMaterial.onBeforeCompile = patch;
    mesh.customDepthMaterial.customProgramCacheKey =
      mesh.material.customProgramCacheKey;
    // Additional displacement must not disappear at a frustum edge.
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.boundingSphere.radius += 0.06;
    windMaterials.push(mesh.material);
  }
  const triangles = batches.reduce(
    (n, { mesh }) => n + (mesh.geometry.index.count / 3) * mesh.count,
    0,
  );
  return {
    group,
    triangles,
    windMesh,
    setTime,
    sampleStates,
    setGround(geometry) {
      if (!groundReady) {
        groundHeight = terrainSampler(geometry);
        groundReady = true;
        setTime(clock.value);
      }
    },
    stats(detailed = false) {
      return {
        lifeTime: clock.value,
        sheepCount: sheep.length,
        snowParticles: count,
        windBatches: windMaterials.length,
        lifeTriangles: triangles,
        ...(detailed
          ? {
              sheepStates: states.map(({ hex, ...s }) => ({
                ...s,
                hexId: hex.id,
              })),
            }
          : {}),
      };
    },
  };
}
