import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createModel, mountain, part, terrainGeometry } from './models';
import { createWater } from './water';
import { RESOURCES, type Game } from '@/packages/rules/game';

export function textSprite(text: string, color = '#efe2b7', size = 0.4) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 98px Georgia';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 120);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false }));
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 4;
  return sprite;
}
function token(number: number) {
  const group = new T.Group();
  group.add(
    part(new T.CylinderGeometry(0.21, 0.23, 0.055, 24), '#81715a', 0, 0.03, 0),
  );
  group.add(
    part(new T.CylinderGeometry(0.197, 0.2, 0.018, 24), '#eddeb8', 0, 0.066, 0),
  );
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = number === 6 || number === 8 ? '#973c27' : '#2c342d';
  ctx.font = 'bold 135px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(String(number), 128, 161);
  const pips = 6 - Math.abs(7 - number);
  for (let i = 0; i < pips; i++) {
    ctx.beginPath();
    ctx.arc(128 + (i - (pips - 1) / 2) * 23, 202, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  const face = new T.Mesh(
    new T.PlaneGeometry(0.4, 0.4),
    new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.077;
  group.add(face);
  return group;
}
function batch(group: T.Group) {
  group.updateMatrixWorld(true);
  const meshes: T.Mesh[] = [];
  group.traverse((o) => {
    if (
      o instanceof T.Mesh &&
      !Array.isArray(o.material) &&
      o.material instanceof T.MeshStandardMaterial
    )
      meshes.push(o);
  });
  const buckets = new Map<
    string,
    { mat: T.MeshStandardMaterial; geos: T.BufferGeometry[] }
  >();
  for (const m of meshes) {
    const mat = m.material as T.MeshStandardMaterial;
    const key = [
      mat.color.getHexString(),
      mat.map?.uuid,
      mat.emissive.getHexString(),
      mat.userData.wind,
      mat.vertexColors,
      mat.side,
    ].join(':');
    let b = buckets.get(key);
    if (!b) {
      b = { mat, geos: [] };
      buckets.set(key, b);
    } else if (b.mat !== mat) mat.dispose();
    const geo = m.geometry.index
      ? m.geometry.toNonIndexed()
      : m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    if (!geo.getAttribute('uv'))
      geo.setAttribute(
        'uv',
        new T.Float32BufferAttribute(
          new Float32Array(geo.getAttribute('position').count * 2),
          2,
        ),
      );
    b.geos.push(geo);
    m.parent?.remove(m);
    m.geometry.dispose();
  }
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos);
    if (geo) {
      const m = new T.Mesh(geo, b.mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    b.geos.forEach((g) => g.dispose());
  }
}

export function createEnvironment(
  scene: T.Scene,
  game: Game,
  lite: boolean,
  reduced: boolean,
) {
  const land = new T.Group(),
    life = new T.Group();
  scene.add(land, life);
  const clock = { value: 0 };
  const texture = new T.TextureLoader().load('/art/terrain-atlas-v1.webp');
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = lite ? 1 : 4;
  const ground = new T.MeshStandardMaterial({
    map: texture,
    color: '#e2dac3',
    roughness: 0.95,
  });
  const rock = new T.MeshStandardMaterial({
    color: '#796d58',
    roughness: 0.96,
  });
  for (const h of game.hexes) {
    const ri = RESOURCES.indexOf(h.resource!),
      tile = new T.Mesh(terrainGeometry(ri < 0 ? 5 : ri, h.id), ground);
    tile.position.set(h.x, 0, h.z);
    tile.receiveShadow = true;
    land.add(tile);
    const cliff = new T.Mesh(
      new T.CylinderGeometry(0.949, 0.91, 0.38, 6, 3),
      rock,
    );
    cliff.position.set(h.x, -0.018, h.z);
    cliff.castShadow = true;
    cliff.receiveShadow = true;
    land.add(cliff);
    // Six foundation edges give the island a carved, assembled tabletop silhouette.
    for (let c = 0; c < 6; c++) {
      const a = h.vertices[c],
        b = h.vertices[(c + 1) % 6],
        v = game.vertices[a],
        w = game.vertices[b];
      const edge = part(
        new T.BoxGeometry(0.042, 0.032, 0.94),
        '#baab87',
        (v.x + w.x) / 2,
        0.188,
        (v.z + w.z) / 2,
      );
      edge.rotation.y = Math.atan2(w.x - v.x, w.z - v.z);
      land.add(edge);
    }
    const count =
      ri === 0
        ? lite
          ? 4
          : 8
        : ri === 2
          ? lite
            ? 3
            : 5
          : ri === 3
            ? lite
              ? 18
              : 42
            : ri === 4
              ? 3
              : ri === 1
                ? 8
                : 0;
    for (let i = 0; i < count; i++) {
      const a = i * 2.399 + h.id * 0.31,
        r = 0.22 + (i % 5) * 0.104,
        x = h.x + Math.cos(a) * r,
        z = h.z + Math.sin(a) * r;
      if (z > h.z + 0.2 && Math.abs(x - h.x) < 0.3) continue;
      if (ri === 0) {
        const tree = createModel('pine');
        tree.position.set(x, 0.18, z);
        tree.scale.setScalar(0.65 + (i % 4) * 0.12);
        tree.rotation.y = a;
        tree.traverse((o) => {
          if (
            o instanceof T.Mesh &&
            o.material instanceof T.MeshStandardMaterial &&
            o.material.color.g > o.material.color.r
          )
            o.material.userData.wind = true;
        });
        land.add(tree);
      }
      if (ri === 1) {
        const b = part(
          new T.DodecahedronGeometry(0.22 + (i % 3) * 0.07, 0),
          i % 2 ? '#a15c36' : '#c77d46',
          x,
          0.26 + (i % 3) * 0.065,
          z,
        );
        b.scale.set(1, 0.6, 1);
        b.rotation.set(0.2, a, 0.1);
        land.add(b);
      }
      if (ri === 2) {
        const sheep = createModel('sheep');
        sheep.position.set(x, 0.18, z);
        sheep.rotation.y = a;
        land.add(sheep);
      }
      if (ri === 3) {
        const wheat = new T.Group();
        for (let stem = 0; stem < 3; stem++) {
          const stalk = part(
            new T.CylinderGeometry(0.005, 0.007, 0.19, 3),
            '#b19340',
            stem * 0.022,
            0.105,
            0,
          );
          wheat.add(stalk);
          const head = part(
            new T.ConeGeometry(0.018, 0.09, 4),
            '#e6c66c',
            stem * 0.022,
            0.23,
            0,
          );
          head.material.userData.wind = true;
          wheat.add(head);
        }
        wheat.position.set(x, 0.18, z);
        land.add(wheat);
      }
      if (ri === 4) {
        const peak = mountain(h.id + i);
        peak.position.x = x;
        peak.position.y += 0.17;
        peak.position.z = z;
        peak.scale.setScalar(0.7 + (i % 3) * 0.22);
        land.add(peak);
      }
    }
    if (ri < 0) {
      const volcano = mountain(h.id, true);
      volcano.position.set(h.x, 0.59, h.z);
      land.add(volcano);
      const lava = part(
        new T.TorusGeometry(0.105, 0.025, 6, 16),
        '#ff9041',
        h.x,
        1.01,
        h.z,
      );
      lava.rotation.x = Math.PI / 2;
      lava.material.emissive.set('#ff4d12');
      lava.material.emissiveIntensity = 2;
      land.add(lava);
    }
    if (h.number) {
      const t = token(h.number);
      t.position.set(h.x, 0.185, h.z + 0.43);
      land.add(t);
    }
  }
  const ships: T.Group[] = [];
  const seen = new Set<number>();
  for (const v of game.vertices)
    if (v.harbour !== null && !seen.has(v.id)) {
      const e = v.edges
        .map((id) => game.edges[id])
        .find((e) => {
          const o = game.vertices[e.a === v.id ? e.b : e.a];
          return o.harbour === v.harbour && !seen.has(o.id);
        });
      if (!e) continue;
      seen.add(v.id);
      const o = game.vertices[e.a === v.id ? e.b : e.a];
      seen.add(o.id);
      const x = (v.x + o.x) / 2,
        z = (v.z + o.z) / 2,
        d = Math.hypot(x, z),
        dx = x / d,
        dz = z / d;
      const dock = new T.Group();
      for (let i = 0; i < 7; i++)
        dock.add(
          part(
            new T.BoxGeometry(0.32, 0.035, 0.075),
            i % 2 ? '#80603d' : '#a6814f',
            0,
            0.04,
            i * 0.083,
          ),
        );
      for (const sx of [-0.12, 0.12])
        for (const sz of [0, 0.48])
          dock.add(
            part(
              new T.CylinderGeometry(0.018, 0.023, 0.28, 6),
              '#735235',
              sx,
              -0.03,
              sz,
            ),
          );
      dock.position.set(x, 0.06, z);
      dock.rotation.y = Math.atan2(dx, dz);
      land.add(dock);
      const sail = createModel(
        'ship',
        v.harbour === -1
          ? '#d9c58c'
          : ['#61835a', '#ba7453', '#c5d7a2', '#e7ba65', '#8da9b8'][v.harbour],
      );
      sail.position.set(x + dx * 0.95, -0.06, z + dz * 0.95);
      sail.rotation.y = Math.atan2(dx, dz) + 0.8;
      sail.scale.setScalar(0.8);
      life.add(sail);
      ships.push(sail);
      const text = textSprite(v.harbour === -1 ? '3:1' : '2:1', '#efdcaa', 0.4);
      text.position.set(x + dx * 0.59, 0.4, z + dz * 0.59);
      life.add(text);
    }
  // Batched geometry retains the generated ground atlas and wind-enabled cloth.
  batch(land);
  for (const root of [land, life])
    root.traverse((o) => {
      if (
        o instanceof T.Mesh &&
        o.material instanceof T.MeshStandardMaterial &&
        o.material.userData.wind
      ) {
        o.material.onBeforeCompile = (shader) => {
          shader.uniforms.uWindTime = clock;
          shader.vertexShader =
            'uniform float uWindTime;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\ntransformed.x += sin(position.y*7.0+position.x*2.0+uWindTime*1.7)*0.018*max(position.y,0.0);',
          );
        };
        o.material.customProgramCacheKey = () => 'conquist-wind-v1';
      }
    });
  const water = createWater(
    game.hexes.map((h) => new T.Vector2(h.x, h.z)),
    lite,
  );
  scene.add(water);
  const desert = game.hexes[game.raider];
  const smokePositions = new Float32Array((lite ? 12 : 32) * 3);
  const smokeGeo = new T.BufferGeometry();
  smokeGeo.setAttribute('position', new T.BufferAttribute(smokePositions, 3));
  const smoke = new T.Points(
    smokeGeo,
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: clock },
      vertexShader: `uniform float uTime;varying float vFade;void main(){float age=mod(position.x+uTime*.15,1.);vec3 p=vec3(sin(position.x*31.+age*3.)*.1+age*.3,1.+age*1.4,cos(position.x*29.)*.08);vFade=(1.-age)*.2;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(30.+age*45.)/max(-gl_Position.z*.1,1.);}`,
      fragmentShader: `varying float vFade;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.48,.48,.43,(1.-smoothstep(.1,1.,d))*vFade);}`,
    }),
  );
  for (let i = 0; i < smokePositions.length; i += 3)
    smokePositions[i] = i / smokePositions.length;
  smoke.position.set(desert.x, 0, desert.z);
  life.add(smoke);
  const birds: T.Group[] = [];
  if (!lite)
    for (let i = 0; i < 4; i++) {
      const bird = new T.Group();
      for (const side of [-1, 1]) {
        const geo = new T.BufferGeometry();
        geo.setAttribute(
          'position',
          new T.Float32BufferAttribute(
            [0, 0, 0, side * 0.17, 0.035, -0.045, side * 0.04, 0, 0.045],
            3,
          ),
        );
        geo.computeVertexNormals();
        const wing = new T.Mesh(
          geo,
          new T.MeshBasicMaterial({ color: '#d4d8bf', side: T.DoubleSide }),
        );
        bird.add(wing);
      }
      life.add(bird);
      birds.push(bird);
    }
  return {
    update(time: number) {
      const t = reduced ? 0 : time;
      clock.value = t;
      (water.material as T.ShaderMaterial).uniforms.uTime.value = t;
      ships.forEach((s, i) => {
        s.position.y = -0.055 + Math.sin(t * 0.8 + i) * 0.014;
        s.rotation.z = Math.sin(t * 0.7 + i) * 0.024;
      });
      birds.forEach((b, i) => {
        const a = t * 0.075 + i * 1.6;
        b.position.set(
          Math.cos(a) * (4.6 + i * 0.15),
          2.2 + Math.sin(a * 2) * 0.15,
          Math.sin(a) * 3.8,
        );
        b.rotation.y = -a;
        b.children[0].rotation.z = Math.sin(t * 3.6 + i) * 0.22;
        b.children[1].rotation.z = -Math.sin(t * 3.6 + i) * 0.22;
      });
    },
  };
}
