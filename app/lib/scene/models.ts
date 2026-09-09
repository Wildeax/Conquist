import * as T from 'three';

export const MODEL_NAMES = [
  'settlement',
  'city',
  'pine',
  'sheep',
  'ship',
  'raider',
  'road',
] as const;
export type ModelName = (typeof MODEL_NAMES)[number];
export function part(g: T.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const material = new T.MeshStandardMaterial({ color, roughness: 0.87 });
  const m = new T.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function box(
  w: number,
  h: number,
  d: number,
  c: string,
  x: number,
  y: number,
  z: number,
) {
  return part(new T.BoxGeometry(w, h, d), c, x, y, z);
}
function flag(color: string, x: number, y: number, z: number) {
  const g = new T.Group();
  g.add(
    part(new T.CylinderGeometry(0.009, 0.009, 0.32, 5), '#c6a56c', x, y, z),
  );
  const cloth = part(
    new T.PlaneGeometry(0.18, 0.11, 5, 2),
    color,
    x + 0.095,
    y + 0.1,
    z,
  );
  cloth.material.side = T.DoubleSide;
  cloth.material.userData.wind = true;
  g.add(cloth);
  return g;
}
export function createModel(name: ModelName, color = '#dfa653'): T.Group {
  const g = new T.Group();
  g.name = name;
  if (name === 'settlement' || name === 'city') {
    g.add(
      part(
        new T.CylinderGeometry(0.24, 0.27, 0.07, 12),
        '#8b8471',
        0,
        0.035,
        0,
      ),
    );
    g.add(box(0.29, 0.24, 0.24, '#d1c2a0', 0, 0.17, 0));
    const roof = part(new T.ConeGeometry(0.25, 0.22, 4), color, 0, 0.4, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    for (const x of [-0.11, 0.11])
      g.add(box(0.019, 0.23, 0.255, '#594737', x, 0.18, 0));
    g.add(box(0.08, 0.13, 0.013, '#3b3025', 0, 0.12, 0.127));
    for (const x of [-0.085, 0.085]) {
      const window = box(0.039, 0.048, 0.015, '#ffc775', x, 0.24, 0.13);
      window.material.emissive.set('#bc631f');
      window.material.emissiveIntensity = 0.5;
      g.add(window);
    }
    g.add(box(0.065, 0.15, 0.06, '#7c7367', -0.085, 0.43, -0.05));
    if (name === 'city') {
      for (const x of [-0.22, 0.22]) {
        g.add(
          part(
            new T.CylinderGeometry(0.095, 0.11, 0.44, 10),
            '#b7b09b',
            x,
            0.24,
            0,
          ),
        );
        g.add(
          part(new T.CylinderGeometry(0.12, 0.12, 0.07, 10), color, x, 0.47, 0),
        );
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          g.add(
            box(
              0.05,
              0.07,
              0.05,
              '#d6cbb2',
              x + Math.cos(a) * 0.087,
              0.53,
              Math.sin(a) * 0.087,
            ),
          );
        }
      }
      g.add(box(0.4, 0.17, 0.11, '#a79d85', 0, 0.18, -0.15));
      g.add(flag(color, 0.22, 0.69, 0));
    } else g.add(flag(color, 0.2, 0.4, 0.04));
  }
  if (name === 'pine') {
    g.add(
      part(
        new T.CylinderGeometry(0.016, 0.045, 0.66, 7),
        '#6b5031',
        0,
        0.32,
        0,
      ),
    );
    for (let i = 0; i < 4; i++) {
      const geo = new T.ConeGeometry(0.24 - i * 0.042, 0.4 - i * 0.025, 9, 2);
      const pos = geo.getAttribute('position');
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j),
          y = pos.getY(j),
          z = pos.getZ(j);
        const d = 1 + 0.12 * Math.sin(j * 2.1 + i);
        pos.setXYZ(j, x * d, y, z * d);
      }
      geo.computeVertexNormals();
      g.add(
        part(
          geo,
          ['#294b30', '#365e38', '#456e3f', '#64834b'][i],
          0,
          0.28 + i * 0.14,
          0,
        ),
      );
    }
  }
  if (name === 'sheep') {
    for (const x of [-0.055, 0.055])
      for (const z of [-0.065, 0.065])
        g.add(
          part(
            new T.CylinderGeometry(0.012, 0.01, 0.08, 5),
            '#514b3a',
            x,
            0.045,
            z,
          ),
        );
    const body = part(new T.IcosahedronGeometry(0.1, 1), '#e7dfbc', 0, 0.14, 0);
    body.scale.set(0.82, 0.8, 1.2);
    g.add(body);
    const head = part(
      new T.SphereGeometry(0.041, 7, 5),
      '#655d49',
      0,
      0.14,
      0.12,
    );
    head.scale.z = 1.25;
    g.add(head);
    for (const x of [-0.038, 0.038])
      g.add(box(0.045, 0.012, 0.025, '#81765b', x, 0.16, 0.11));
  }
  if (name === 'ship') {
    const hull = part(new T.SphereGeometry(1, 12, 7), '#583a27', 0, 0.06, 0);
    hull.scale.set(0.15, 0.11, 0.38);
    g.add(hull);
    g.add(box(0.22, 0.035, 0.51, '#be925e', 0, 0.115, 0));
    g.add(
      part(new T.CylinderGeometry(0.013, 0.02, 0.57, 7), '#674528', 0, 0.4, 0),
    );
    const sail = part(
      new T.PlaneGeometry(0.32, 0.34, 8, 8),
      '#eedcaa',
      0.02,
      0.45,
      0,
    );
    sail.rotation.y = 0.3;
    sail.material.side = T.DoubleSide;
    sail.material.userData.wind = true;
    g.add(sail);
    g.add(flag(color, 0, 0.76, 0));
  }
  if (name === 'raider') {
    g.add(
      part(new T.CylinderGeometry(0.14, 0.18, 0.06, 12), '#382f31', 0, 0.03, 0),
    );
    g.add(part(new T.ConeGeometry(0.14, 0.4, 12), '#35313f', 0, 0.25, 0));
    g.add(part(new T.SphereGeometry(0.065, 10, 8), '#a67e5d', 0, 0.47, 0.015));
    const hood = part(
      new T.SphereGeometry(0.086, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65),
      '#332b3b',
      0,
      0.5,
      0,
    );
    g.add(hood);
    g.add(
      part(
        new T.CylinderGeometry(0.012, 0.015, 0.46, 6),
        '#7b6244',
        0.16,
        0.23,
        0,
      ),
    );
  }
  if (name === 'road') {
    g.add(box(0.15, 0.06, 0.82, '#79664e', 0, 0.03, 0));
    for (let i = 0; i < 6; i++)
      g.add(
        box(
          0.14,
          0.055,
          0.115,
          i % 2 ? color : '#b8ab89',
          0,
          0.075,
          -0.34 + i * 0.136,
        ),
      );
    for (const z of [-0.39, 0.39])
      g.add(box(0.05, 0.13, 0.05, color, 0, 0.1, z));
  }
  return g;
}

export function mountain(seed: number, volcano = false) {
  const geo = new T.ConeGeometry(
    volcano ? 0.5 : 0.48,
    volcano ? 0.83 : 1.03,
    13,
    6,
  );
  const p = geo.getAttribute('position'),
    colors = [];
  const low = new T.Color(volcano ? '#514745' : '#576571'),
    mid = new T.Color('#8c969a'),
    snow = new T.Color('#e7eeee');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      r = 1 + 0.13 * Math.sin(x * 29 + z * 31 + seed);
    p.setXYZ(i, x * r, y + 0.028 * Math.sin(x * 34 + z * 27 + seed), z * r);
    const c = low.clone().lerp(mid, 0.25 + 0.15 * Math.sin(x * 42 + z * 28));
    if (!volcano && y > 0.19 + 0.075 * Math.sin(x * 33 + z * 13))
      c.lerp(snow, 0.9);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new T.Mesh(
    geo,
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 }),
  );
  m.position.y = volcano ? 0.39 : 0.5;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function terrainGeometry(index: number, seed: number) {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rings = 7,
    segments = 36;
  for (let r = 0; r <= rings; r++)
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2 + Math.PI / 6;
      const local =
        ((((angle - Math.PI / 6) % (Math.PI / 3)) + Math.PI / 3) %
          (Math.PI / 3)) -
        Math.PI / 6;
      const radius =
        (((0.945 * Math.cos(Math.PI / 6)) / Math.cos(local)) * r) / rings;
      const x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius;
      const bump =
        (Math.sin(x * 16 + seed) * Math.cos(z * 19 - seed) * 0.012 +
          Math.sin(x * 7 + z * 9 + seed) * 0.02) *
        Math.sin((r / rings) * Math.PI);
      positions.push(x, 0.18 + bump, z);
      const u = (x / 1.9 + 0.5) * 0.96 + 0.02,
        v = (z / 1.9 + 0.5) * 0.96 + 0.02;
      uvs.push(((index % 3) + u) / 3, (1 - Math.floor(index / 3) + v) / 2);
      if (r < rings && s < segments) {
        const a = r * (segments + 1) + s,
          b = a + segments + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
