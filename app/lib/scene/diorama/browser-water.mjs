import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// GPU waves plus a cached planar reflection; no fluid solver or external textures.
export function createBoardWater(hexes, ports = [], { lite = false } = {}) {
  const size = 256,
    extent = 16,
    data = new Uint8Array(size * size * 4);
  const apothem = (0.955 * Math.sqrt(3)) / 2;
  const directions = Array.from({ length: 6 }, (_, i) => [
    Math.cos((i * Math.PI) / 3),
    Math.sin((i * Math.PI) / 3),
  ]);
  function landDistance(x, z) {
    let d = Infinity;
    for (const h of hexes) {
      let edge = -Infinity;
      for (const [nx, nz] of directions)
        edge = Math.max(edge, (x - h.x) * nx + (z - h.z) * nz);
      d = Math.min(d, edge - apothem);
    }
    return d;
  }
  let seed = 19428;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rocks = [];
  function portClear(x, z, radius) {
    return ports.every((p) => {
      const along = (x - p.x) * p.dx + (z - p.z) * p.dz,
        across = (x - p.x) * p.dz - (z - p.z) * p.dx;
      return (
        along < -0.1 - radius ||
        along > 1.2 + radius ||
        Math.abs(across) > 0.58 + radius
      );
    });
  }
  for (let cluster = 0; cluster < 60 && rocks.length < 17; cluster++) {
    let angle =
      (cluster * Math.PI) / 5 +
      0.18 +
      Math.floor(cluster / 10) * 0.19 +
      (random() - 0.5) * 0.22;
    const clearance = 0.42 + Math.floor(cluster / 10) * 0.16;
    let r = 2;
    while (landDistance(Math.cos(angle) * r, Math.sin(angle) * r) < clearance)
      r += 0.04;
    for (
      let step = 0;
      step < 24 && !portClear(Math.cos(angle) * r, Math.sin(angle) * r, 0.5);
      step++
    ) {
      angle += 0.05;
      r = 2;
      while (landDistance(Math.cos(angle) * r, Math.sin(angle) * r) < clearance)
        r += 0.04;
    }
    for (let i = 0; i < 3 && rocks.length < 17; i++) {
      const x = Math.cos(angle) * r + (random() - 0.5) * 0.48,
        z = Math.sin(angle) * r + (random() - 0.5) * 0.48;
      const radius = i === 0 ? 0.18 + random() * 0.1 : 0.08 + random() * 0.08;
      if (landDistance(x, z) < radius + 0.12 || !portClear(x, z, radius))
        continue;
      if (
        rocks.some(
          (other) =>
            Math.hypot(x - other.x, z - other.z) <
            1.35 * (radius + other.radius) + 0.06,
        )
      )
        continue;
      rocks.push({
        x,
        z,
        radius,
        height: i === 0 ? 0.35 + random() * 0.35 : 0.12 + random() * 0.25,
        angle: random() * Math.PI * 2,
      });
    }
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size - 0.5) * extent,
        pz = ((y + 0.5) / size - 0.5) * extent;
      let distance = landDistance(px, pz);
      for (const rock of rocks)
        distance = Math.min(
          distance,
          Math.hypot(px - rock.x, pz - rock.z) - rock.radius * 0.65,
        );
      const i = (y * size + x) * 4,
        value = Math.round(THREE.MathUtils.clamp(distance / 2, 0, 1) * 255);
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  const shore = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  shore.minFilter = shore.magFilter = THREE.LinearFilter;
  shore.needsUpdate = true;
  const reflector = new Reflector(new THREE.PlaneGeometry(1, 1), {
    textureWidth: 512,
    textureHeight: 512,
    multisample: 0,
    clipBias: 0.001,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = -0.075;
  reflector.updateMatrixWorld(true);
  const uniforms = {
    waterTime: { value: 0 },
    shoreMap: { value: shore },
    reflectionMap: { value: reflector.getRenderTarget().texture },
    reflectionMatrix: { value: new THREE.Matrix4() },
    reflectionReady: { value: 0 },
    reflectionSky: { value: new THREE.Color(0x718b9b) },
  };
  const waves = `
    uniform float waterTime;
    uniform sampler2D shoreMap;
    float hashWater(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float waterNoise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hashWater(i),hashWater(i+vec2(1,0)),f.x),mix(hashWater(i+vec2(0,1)),hashWater(i+vec2(1,1)),f.x),f.y);
    }
    float coastAt(vec2 p){return texture2D(shoreMap,clamp(p/16.0+.5,0.0,1.0)).r*2.0;}
    vec3 waveField(vec2 p) {
      vec3 w=vec3(0.0);
      float warp=waterNoise(p*.55+vec2(waterTime*.025,-waterTime*.018))*2.8;
      float a=dot(p,vec2(1.0,.35))*2.1-waterTime*1.15+warp;
      w+=vec3(sin(a),cos(a)*2.1,cos(a)*.735)*.018;
      a=dot(p,vec2(-.4,1.0))*3.8+waterTime*.95-warp*.8;
      w+=vec3(sin(a),cos(a)*-1.52,cos(a)*3.8)*.012;
      a=dot(p,vec2(.8,.6))*6.0-waterTime*1.4+warp*1.3;
      w+=vec3(sin(a),cos(a)*4.8,cos(a)*3.6)*.004;
      return w;
    }
  `;
  // A directional sun covers every orthographic viewing ray at the same angle.
  // Use water's IOR and a broad, restrained highlight so that alignment cannot
  // turn the whole ocean white. The terrain's lighting is independent.
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0,
    ior: 1.333,
    specularIntensity: 0.4,
  });
  material.name = 'Board_Water';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      ${waves}
      varying vec3 vWaterPosition;
    `,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      float coastalDamping=.18+.82*smoothstep(.06,.7,coastAt(position.xz));
      transformed.y+=waveField(position.xz).x*coastalDamping;
      vWaterPosition=(modelMatrix*vec4(transformed,1.0)).xyz;
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      ${waves}
      varying vec3 vWaterPosition;
      uniform sampler2D reflectionMap;
      uniform mat4 reflectionMatrix;
      uniform float reflectionReady;
      uniform vec3 reflectionSky;
    `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float coast=coastAt(vWaterPosition.xz);
      float shallow=exp(-coast*2.0);
      float swell=waveField(vWaterPosition.xz).x;
      diffuseColor.rgb=mix(vec3(.018,.043,.066),vec3(.045,.09,.095),shallow);
      diffuseColor.rgb*=.94+waterNoise(vWaterPosition.xz*1.8+waterTime*.025)*.12+smoothstep(-.02,.03,swell)*.06;
      float brokenFoam=waterNoise(vWaterPosition.xz*12.0+vec2(waterTime*.12,-waterTime*.08));
      float swash=.065+.025*sin(waterTime*1.4+waterNoise(vWaterPosition.xz*2.0)*4.0);
      float foam=(1.0-smoothstep(.01,swash,coast))*smoothstep(.35,.65,brokenFoam)*.16;
      float crest=0.0;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.5,.66,.61),foam+crest);
    `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
      vec3 gradient=waveField(vWaterPosition.xz);
      gradient*=.18+.82*smoothstep(.06,.7,coast);
      gradient.y+=(waterNoise(vWaterPosition.xz*12.0+vec2(waterTime*.12,0))-.5)*.13;
      gradient.z+=(waterNoise(vWaterPosition.xz*13.0+vec2(0,-waterTime*.11))-.5)*.13;
      normal=normalize(mat3(viewMatrix)*vec3(-gradient.y,1.0,-gradient.z));
    `,
      )
      .replace(
        '#include <opaque_fragment>',
        `
      vec4 reflectedPosition=reflectionMatrix*vec4(vWaterPosition,1.0);
      vec2 reflectedUV=reflectedPosition.xy/reflectedPosition.w+gradient.yz*.045;
      vec2 edgeDistance=min(reflectedUV,1.0-reflectedUV);
      float reflectionCoverage=smoothstep(0.0,.025,min(edgeDistance.x,edgeDistance.y));
      vec3 reflectedColor=texture2D(reflectionMap,clamp(reflectedUV,.002,.998)).rgb;
      reflectedColor=mix(reflectionSky,reflectedColor,reflectionCoverage);
      float fresnel=.20+.60*pow(1.0-clamp(dot(normal,geometryViewDir),0.0,1.0),4.0);
      outgoingLight=mix(outgoingLight,reflectedColor,fresnel*reflectionReady);
      #include <opaque_fragment>
    `,
      );
  };
  material.customProgramCacheKey = () => 'conquist-water-v04-sun';
  const geometry = new THREE.PlaneGeometry(
    40,
    40,
    lite ? 64 : 128,
    lite ? 64 : 128,
  );
  geometry.rotateX(-Math.PI / 2);
  // Dense mesh near the board, increasingly broad cells far away. The edge is
  // beyond the camera far plane; atmospheric fog blends the distant sea.
  const positions = geometry.attributes.position;
  const stretch = (value) => {
    const t = Math.abs(value) / 20;
    return (
      Math.sign(value) *
      (t <= 0.8 ? (t / 0.8) * 12 : 12 + Math.pow((t - 0.8) / 0.2, 3) * 988)
    );
  };
  for (let i = 0; i < positions.count; i++) {
    positions.setX(i, stretch(positions.getX(i)));
    positions.setZ(i, stretch(positions.getZ(i)));
  }
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Animated_Board_Water';
  mesh.position.y = -0.075;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // Individually shaped, closed outcrops: broad submerged feet, broken shoulders
  // and off-center summits. Merge these small meshes to keep a single draw call.
  const pieces = rocks.map((rock, rockIndex) => {
    const baseSides = 14,
      profile = [
        [1.02, 1.16, 1.03, 0.91, 0.69, 0.44, 0.09],
        [1.05, 1.15, 1.02, 0.95, 0.83, 0.74, 0.48],
        [1.07, 1.2, 1.03, 0.8, 0.62, 0.38, 0.17],
      ][rockIndex % 3];
    const ridge = Array.from(
      { length: baseSides },
      () => 0.78 + random() * 0.35,
    );
    const summit = Array.from(
      { length: baseSides },
      () => 0.82 + random() * 0.23,
    );
    // Explicit lips and recessed centers create V-shaped fracture walls. These
    // vertices affect the silhouette, lighting and shadow map, including when
    // using an untextured material; there is no painted crack in the shader.
    const clefts = [0.63 + random() * 0.3, 3.4 + random() * 0.35],
      width = 0.095 + random() * 0.025;
    const angles = Array.from(
      { length: baseSides },
      (_, i) => (i / baseSides) * Math.PI * 2,
    );
    for (const angle of clefts)
      angles.push(angle - width, angle, angle + width);
    angles.sort((a, b) => a - b);
    const sides = angles.length,
      cutHeight = 0.38 + random() * 0.2;
    const rings = [
      0,
      1 / 6,
      2 / 6,
      0.5,
      4 / 6,
      5 / 6,
      1,
      cutHeight - 0.025,
      cutHeight,
      cutHeight + 0.025,
    ].sort((a, b) => a - b);
    const sample = (values, t) => {
      const i = Math.floor(t),
        f = t - i;
      return (
        values[i % values.length] * (1 - f) +
        values[(i + 1) % values.length] * f
      );
    };
    const positions = [],
      indices = [],
      colors = [];
    const leanX = (random() - 0.5) * 0.55,
      leanZ = (random() - 0.5) * 0.45;
    const aspect = 0.65 + random() * 0.35;
    const color = new THREE.Color().setHSL(
      0.08 + random() * 0.03,
      0.055 + random() * 0.045,
      0.33 + random() * 0.1,
    );
    for (let ring = 0; ring < rings.length; ring++)
      for (let side = 0; side < sides; side++) {
        const t = rings[ring],
          baseAngle = angles[side],
          angle = baseAngle + (t - 0.5) * 0.17;
        const along = (baseAngle / (Math.PI * 2)) * baseSides;
        let radius =
          sample(profile, t * (profile.length - 1)) * sample(ridge, along);
        radius *= 1 + 0.035 * Math.sin(baseAngle * 7 + t * 11 + rockIndex);
        const cleft = Math.max(
          ...clefts.map((a) =>
            Math.max(0, 1 - Math.abs(baseAngle - a) / width),
          ),
        );
        radius *= 1 - cleft * 0.34 * (0.4 + 0.6 * Math.sin(t * Math.PI));
        // A partial cross-fracture intersects the vertical clefts inside the rock.
        const crossCut = Math.max(0, 1 - Math.abs(t - cutHeight) / 0.025);
        radius *= 1 - crossCut * 0.18 * Math.max(0, Math.cos(baseAngle - 0.6));
        const x = (Math.cos(angle) * radius + leanX * t) * rock.radius;
        const z = (Math.sin(angle) * radius * aspect + leanZ * t) * rock.radius;
        const y = -0.2 + t * rock.height * sample(summit, along);
        positions.push(
          rock.x + x * Math.cos(rock.angle) - z * Math.sin(rock.angle),
          y,
          rock.z + x * Math.sin(rock.angle) + z * Math.cos(rock.angle),
        );
        colors.push(color.r, color.g, color.b);
        if (ring < rings.length - 1) {
          const a = ring * sides + side,
            b = ring * sides + ((side + 1) % sides),
            c = a + sides,
            d = b + sides;
          indices.push(a, c, b, b, c, d);
        }
      }
    // Centered fans also close concave outlines at the ends of the fissures.
    const bottomCenter = positions.length / 3,
      top = (rings.length - 1) * sides;
    positions.push(rock.x, -0.2, rock.z);
    colors.push(color.r, color.g, color.b);
    const topCenter = positions.length / 3,
      center = [0, 0, 0];
    for (let side = 0; side < sides; side++)
      for (let axis = 0; axis < 3; axis++)
        center[axis] += positions[(top + side) * 3 + axis] / sides;
    positions.push(...center);
    colors.push(color.r, color.g, color.b);
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      indices.push(bottomCenter, side, next, topCenter, top + next, top + side);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
  const rockGeometry = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  const rockMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    flatShading: true,
  });
  rockMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 vCoastalRock;
    `,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vCoastalRock=(modelMatrix*vec4(position,1.0)).xyz;
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 vCoastalRock;
      float rockHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float rockNoise(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
    `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float mineral=rockNoise(vCoastalRock*17.0);
      float grain=rockNoise(vCoastalRock*115.0);
      diffuseColor.rgb*=.72+mineral*.56+(grain-.5)*.3;
      float wet=1.0-smoothstep(-.07,.035+mineral*.025,vCoastalRock.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.45,.51,.53),wet);
    `,
      );
  };
  rockMaterial.customProgramCacheKey = () =>
    'conquist-coastal-rocks-v03-carved';
  const rockMesh = new THREE.Mesh(rockGeometry, rockMaterial);
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  rockGeometry.computeBoundingSphere();
  const group = new THREE.Group();
  group.name = 'Sea_and_Rock_Outcrops';
  group.add(mesh, rockMesh);
  const rockTriangles = rockGeometry.index.count / 3;
  let lastView = '',
    dirty = true,
    reflectionUpdates = 0,
    lastReflectionCalls = 0;
  const rockFocus = [...rocks]
    .filter((rock) => rock.height > 0.35)
    .sort((a, b) => b.x * 0.6 + b.z * 0.8 - (a.x * 0.6 + a.z * 0.8))[0];
  return {
    mesh: group,
    uniforms,
    triangles: geometry.index.count / 3 + rockTriangles,
    rockCount: rocks.length,
    rockFocus,
    rockPlacements: rocks,
    drawCalls: 2,
    invalidateReflection() {
      dirty = true;
    },
    reflectionStats() {
      return {
        reflectionUpdates,
        reflectionDrawCalls: lastReflectionCalls,
        reflectionResolution: 512,
      };
    },
    updateReflection(renderer, scene, camera) {
      lastReflectionCalls = 0;
      if (!group.visible) return;
      camera.updateMatrixWorld();
      const view =
        camera.matrixWorld.elements.join(',') +
        '|' +
        camera.projectionMatrix.elements.join(',');
      if (!dirty && view === lastView) return;
      if (scene.background?.isColor)
        uniforms.reflectionSky.value.copy(scene.background);
      mesh.visible = false;
      try {
        reflector.onBeforeRender(renderer, scene, camera);
        uniforms.reflectionMatrix.value
          .copy(reflector.material.uniforms.textureMatrix.value)
          .multiply(reflector.matrixWorld.clone().invert());
        uniforms.reflectionReady.value = 1;
        lastReflectionCalls = renderer.info.render.calls;
        reflectionUpdates++;
        lastView = view;
        dirty = false;
      } finally {
        mesh.visible = true;
      }
    },
    setTime(seconds) {
      uniforms.waterTime.value = seconds;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      shore.dispose();
      rockGeometry.dispose();
      rockMaterial.dispose();
      reflector.geometry.dispose();
      reflector.dispose();
    },
  };
}
