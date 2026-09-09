'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  COLORS,
  createGame,
  RESOURCES,
  type Game,
  type Action,
} from '@/packages/rules/game';
type Props = {
  game: Game;
  actions: Action[];
  onAction: (a: Action) => void;
  view: number;
  lite: boolean;
};
const terrain = ['#386d4b', '#ba6945', '#8ba75b', '#d3ae53', '#707a8d'];
const Y = 0.18;
function mesh(
  geo: THREE.BufferGeometry,
  color: string,
  x: number,
  y: number,
  z: number,
) {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      flatShading: true,
    }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function house(color: string, city = false) {
  const group = new THREE.Group();
  group.add(
    mesh(
      new THREE.BoxGeometry(0.26, city ? 0.32 : 0.23, 0.25),
      color,
      0,
      0.14,
      0,
    ),
  );
  const roof = mesh(
    new THREE.ConeGeometry(0.235, 0.2, 4),
    '#f1e2bb',
    0,
    city ? 0.4 : 0.31,
    0,
  );
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  if (city) {
    group.add(
      mesh(new THREE.BoxGeometry(0.16, 0.43, 0.16), color, 0.19, 0.2, 0),
    );
    group.add(
      mesh(new THREE.ConeGeometry(0.15, 0.15, 4), '#e4c58a', 0.19, 0.49, 0),
    );
  }
  group.add(
    mesh(new THREE.BoxGeometry(0.055, 0.11, 0.015), '#192a30', 0, 0.07, 0.13),
  );
  return group;
}
function label(text: string, color = '#e8ddb9', size = 0.35) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = 'bold 100px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: t, depthTest: false }),
  );
  s.scale.set(size, size, 1);
  s.renderOrder = 3;
  return s;
}
function dispose(group: THREE.Object3D) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if ('map' in m) (m.map as THREE.Texture | null)?.dispose();
        m.dispose();
      }
    }
  });
}
export default function Board({ game, actions, onAction, view, lite }: Props) {
  const terrainGame = useMemo(() => createGame(game.seed), [game.seed]);
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<{
      pieces: THREE.Group;
      targets: THREE.Group;
      controls: OrbitControls;
      camera: THREE.PerspectiveCamera;
    } | null>(null),
    latest = useRef({ actions, onAction });
  useEffect(() => {
    latest.current = { actions, onAction };
  }, [actions, onAction]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !lite,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // Imperative WebGL initialization reports hardware failure to the DOM fallback.
      // eslint-disable-next-line react/react-compiler
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1 : 1.75));
    renderer.shadowMap.enabled = !lite;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      '3D island. Drag to orbit, scroll to zoom. The legal locations list provides keyboard play.',
    );
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#0b242d', 0.024);
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
    camera.position.set(0, 10, 11.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 19;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI * 0.42;
    scene.add(new THREE.HemisphereLight('#d5eafa', '#26363b', 2.3));
    const sun = new THREE.DirectionalLight('#ffe2a6', 3.3);
    sun.position.set(-5, 10, 5);
    sun.castShadow = !lite;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -7,
      right: 7,
      top: 7,
      bottom: -7,
    });
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const rim = new THREE.DirectionalLight('#68bce0', 1.4);
    rim.position.set(6, 3, -6);
    scene.add(rim);
    const stat = new THREE.Group();
    scene.add(stat);
    for (const [radius, height, y, color] of [
      [5.5, 0.22, -0.46, '#172e33'],
      [5.33, 0.06, -0.32, '#a77a46'],
      [5.23, 0.1, -0.23, '#246577'],
    ] as const) {
      const m = mesh(
        new THREE.CylinderGeometry(radius, radius, height, 6),
        color,
        0,
        y,
        0,
      );
      m.rotation.y = Math.PI / 6;
      stat.add(m);
    }
    const floor = mesh(
      new THREE.PlaneGeometry(200, 200),
      '#102d36',
      0,
      -0.62,
      0,
    );
    floor.rotation.x = -Math.PI / 2;
    stat.add(floor);
    for (const h of terrainGame.hexes) {
      const ri = RESOURCES.indexOf(h.resource!),
        color = ri < 0 ? '#9b8165' : terrain[ri];
      stat.add(
        mesh(
          new THREE.CylinderGeometry(0.965, 0.965, 0.28, 6),
          '#69503e',
          h.x,
          -0.02,
          h.z,
        ),
      );
      stat.add(
        mesh(
          new THREE.CylinderGeometry(0.955, 0.965, 0.09, 6),
          color,
          h.x,
          Y - 0.04,
          h.z,
        ),
      );
      for (let i = 0; i < (lite ? 4 : 8); i++) {
        const angle = i * 2.399 + h.id * 0.7,
          rad = 0.34 + (i % 3) * 0.12,
          x = h.x + Math.cos(angle) * rad,
          z = h.z + Math.sin(angle) * rad;
        if (z > h.z + 0.16 && Math.abs(x - h.x) < 0.3) continue;
        if (ri === 0) {
          const height = 0.37 + (i % 3) * 0.13;
          stat.add(
            mesh(
              new THREE.CylinderGeometry(0.035, 0.045, 0.22, 5),
              '#654c32',
              x,
              Y + 0.1,
              z,
            ),
          );
          stat.add(
            mesh(
              new THREE.ConeGeometry(0.16, height, 5),
              i % 2 ? '#244e37' : '#497d50',
              x,
              Y + 0.2 + height / 2,
              z,
            ),
          );
          stat.add(
            mesh(
              new THREE.ConeGeometry(0.12, height * 0.7, 5),
              '#689052',
              x,
              Y + 0.29 + height / 2,
              z,
            ),
          );
        }
        if (ri === 1) {
          const m = mesh(
            new THREE.BoxGeometry(0.28, 0.15 + (i % 3) * 0.08, 0.23),
            i % 2 ? '#d48a5d' : '#97482c',
            x,
            Y + 0.11,
            z,
          );
          m.rotation.y = angle;
          stat.add(m);
        }
        if (ri === 2) {
          stat.add(
            mesh(
              new THREE.IcosahedronGeometry(0.11, 1),
              '#f4e6ce',
              x,
              Y + 0.12,
              z,
            ),
          );
          stat.add(
            mesh(
              new THREE.IcosahedronGeometry(0.055, 0),
              '#49433e',
              x + 0.09,
              Y + 0.11,
              z,
            ),
          );
        }
        if (ri === 3) {
          const m = mesh(
            new THREE.BoxGeometry(0.055, 0.06, 0.4),
            i % 2 ? '#eed183' : '#987038',
            h.x + (i - 3.5) * 0.1,
            Y + 0.04,
            h.z - 0.1,
          );
          m.rotation.y = -0.25;
          stat.add(m);
        }
        if (ri === 4) {
          const m = mesh(
            new THREE.ConeGeometry(0.19, 0.3 + (i % 3) * 0.18, 5),
            i % 2 ? '#9ba6b1' : '#525e71',
            x,
            Y + 0.18,
            z,
          );
          m.rotation.y = angle;
          stat.add(m);
        }
      }
      if (ri < 0) {
        stat.add(
          mesh(
            new THREE.CylinderGeometry(0.12, 0.48, 0.64, 7),
            '#454048',
            h.x,
            Y + 0.3,
            h.z,
          ),
        );
        stat.add(
          mesh(
            new THREE.CylinderGeometry(0.115, 0.12, 0.025, 7),
            '#ee8440',
            h.x,
            Y + 0.63,
            h.z,
          ),
        );
      }
      if (h.number) {
        stat.add(
          mesh(
            new THREE.CylinderGeometry(0.18, 0.2, 0.055, 24),
            '#f5e6bd',
            h.x,
            Y + 0.07,
            h.z + 0.31,
          ),
        );
        const t = label(
          String(h.number),
          h.number === 6 || h.number === 8 ? '#a83e2f' : '#25353c',
          0.42,
        );
        t.position.set(h.x, Y + 0.19, h.z + 0.32);
        stat.add(t);
      }
    }
    const seen = new Set<number>();
    for (const v of terrainGame.vertices)
      if (v.harbour !== null && !seen.has(v.id)) {
        const e = v.edges
          .map((id) => terrainGame.edges[id])
          .find((e) => {
            const o = terrainGame.vertices[e.a === v.id ? e.b : e.a];
            return o.harbour === v.harbour && !seen.has(o.id);
          });
        if (!e) continue;
        seen.add(v.id);
        const o = terrainGame.vertices[e.a === v.id ? e.b : e.a];
        seen.add(o.id);
        const x = (v.x + o.x) / 2,
          z = (v.z + o.z) / 2,
          m = Math.hypot(x, z),
          dx = x / m,
          dz = z / m;
        const dock = mesh(
          new THREE.BoxGeometry(0.32, 0.08, 0.53),
          '#ad8556',
          x + dx * 0.26,
          -0.09,
          z + dz * 0.26,
        );
        dock.rotation.y = Math.atan2(dx, dz);
        stat.add(dock);
        const t = label(v.harbour === -1 ? '3:1' : '2:1', '#cbe6dd', 0.48);
        t.position.set(x + dx * 0.7, 0.01, z + dz * 0.7);
        stat.add(t);
      }
    const buckets = new Map<
      string,
      { material: THREE.Material; geometries: THREE.BufferGeometry[] }
    >();
    // Clone the list because batching removes meshes from the original group.
    // eslint-disable-next-line unicorn/no-useless-spread
    for (const o of [...stat.children])
      if (o instanceof THREE.Mesh) {
        o.updateMatrix();
        const mat = o.material as THREE.MeshStandardMaterial,
          key = mat.color.getHexString();
        let b = buckets.get(key);
        if (!b) {
          b = { material: mat, geometries: [] };
          buckets.set(key, b);
        } else mat.dispose();
        const geo = o.geometry.index
          ? o.geometry.toNonIndexed()
          : o.geometry.clone();
        geo.applyMatrix4(o.matrix);
        b.geometries.push(geo);
        o.geometry.dispose();
        stat.remove(o);
      }
    for (const b of buckets.values()) {
      const geo = mergeGeometries(b.geometries);
      if (geo) {
        const m = new THREE.Mesh(geo, b.material);
        m.castShadow = true;
        m.receiveShadow = true;
        stat.add(m);
      }
      b.geometries.forEach((g) => g.dispose());
    }
    const pieces = new THREE.Group(),
      targets = new THREE.Group();
    scene.add(pieces, targets);
    runtime.current = { pieces, targets, controls, camera };
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let dx = 0,
      dy = 0;
    const down = (e: PointerEvent) => {
      dx = e.clientX;
      dy = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - dx, e.clientY - dy) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(targets.children, false)[0];
      if (hit) latest.current.onAction(hit.object.userData.action);
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, [terrainGame, lite]);
  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    dispose(rt.pieces);
    rt.pieces.clear();
    dispose(rt.targets);
    rt.targets.clear();
    for (const v of game.vertices)
      if (v.owner !== null) {
        const m = house(COLORS[v.owner], v.city);
        m.position.set(v.x, Y + 0.04, v.z);
        rt.pieces.add(m);
      }
    for (const e of game.edges)
      if (e.owner !== null) {
        const a = game.vertices[e.a],
          b = game.vertices[e.b],
          m = mesh(
            new THREE.BoxGeometry(0.13, 0.11, 0.78),
            COLORS[e.owner],
            (a.x + b.x) / 2,
            Y + 0.035,
            (a.z + b.z) / 2,
          );
        m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        rt.pieces.add(m);
      }
    const h = game.hexes[game.raider];
    rt.pieces.add(
      mesh(
        new THREE.ConeGeometry(0.15, 0.48, 6),
        '#261d32',
        h.x + 0.28,
        Y + 0.3,
        h.z - 0.04,
      ),
    );
    rt.pieces.add(
      mesh(
        new THREE.IcosahedronGeometry(0.1, 0),
        '#d69a53',
        h.x + 0.28,
        Y + 0.59,
        h.z - 0.04,
      ),
    );
    for (const a of actions) {
      if (!('id' in a)) continue;
      let m: THREE.Mesh;
      if (a.type === 'road') {
        const e = game.edges[a.id],
          v = game.vertices[e.a],
          w = game.vertices[e.b];
        m = mesh(
          new THREE.BoxGeometry(0.2, 0.1, 0.66),
          '#f5df9b',
          (v.x + w.x) / 2,
          Y + 0.13,
          (v.z + w.z) / 2,
        );
        m.rotation.y = Math.atan2(w.x - v.x, w.z - v.z);
      } else if (a.type === 'raider') {
        const h = game.hexes[a.id];
        m = mesh(
          new THREE.CylinderGeometry(0.78, 0.78, 0.035, 6),
          '#f4c582',
          h.x,
          Y + 0.1,
          h.z,
        );
      } else {
        const v = game.vertices[a.id];
        m = mesh(
          new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20),
          '#fff3c4',
          v.x,
          Y + 0.075,
          v.z,
        );
      }
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = a.type === 'raider' ? 0.3 : 0.75;
      mat.emissive = new THREE.Color('#c89a45');
      mat.emissiveIntensity = 0.4;
      m.userData.action = a;
      rt.targets.add(m);
    }
  }, [game, actions, lite]);
  useEffect(() => {
    const rt = runtime.current;
    if (rt) {
      rt.camera.position.set(0, view % 2 ? 14 : 10, view % 2 ? 1 : 11.2);
      rt.controls.update();
    }
  }, [view]);
  return (
    <div className="board-canvas" ref={host}>
      {error && (
        <div className="webgl-error">
          3D is unavailable in this browser. You can still play using the legal
          locations below.
        </div>
      )}
    </div>
  );
}
