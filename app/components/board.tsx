'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import * as T from 'three';
import { gsap } from 'gsap';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  COLORS,
  createGame,
  type Game,
  type Action,
} from '@/packages/rules/game';
import { createEnvironment } from '@/lib/scene/environment';
import { createModel, part } from '@/lib/scene/models';
import { mountSceneFeedback } from '@/lib/scene/feedback';
import { feedbackPolicy, type FeedbackLevel } from '@/packages/rules/feedback';
import { mapPalette } from '@/lib/cosmetics';
import { OCEAN_HORIZON } from '@/lib/scene/water';
import { createBoardLighting } from '@/lib/scene/diorama/browser-lighting.mjs';
import { dioramaLayout } from '@/lib/scene/diorama-state';
import {
  loadDioramaAssets,
  createDiorama,
  type DioramaRuntime,
} from '@/lib/scene/diorama/runtime.mjs';
type Props = {
  game: Game;
  actions: Action[];
  onAction: (a: Action) => void;
  onPreview?: (a: Action) => void;
  preview?: Action | null;
  view: number;
  lite: boolean;
  mapSkin?: string;
  feedbackLevel?: FeedbackLevel;
  reducedMotion?: boolean;
};
type Runtime = {
  scene: T.Scene;
  renderer: T.WebGLRenderer;
  pieces: T.Group;
  targets: T.Group;
  camera: T.PerspectiveCamera;
  controls: OrbitControls;
  reduced: boolean;
  diorama?: DioramaRuntime;
  showGhost: (action: Action | null) => void;
};
function updateReducedMotion(runtime: Runtime, reduced: boolean) {
  runtime.reduced = reduced;
  runtime.controls.enableDamping = !reduced;
}
function fitBoard(camera: T.PerspectiveCamera, controls: OrbitControls) {
  const halfFov = Math.atan(
    Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1),
  );
  const distance = 5.65 / Math.sin(halfFov);
  camera.position
    .sub(controls.target)
    .normalize()
    .multiplyScalar(distance)
    .add(controls.target);
  controls.minDistance = distance * 0.5;
  controls.maxDistance = distance * 1.6;
  controls.update();
}
function dispose(root: T.Object3D) {
  const geos = new Set<T.BufferGeometry>(),
    mats = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  root.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Sprite || o instanceof T.Points) {
      if (o.geometry) geos.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        mats.add(m);
        if ('map' in m && m.map) textures.add(m.map as T.Texture);
      }
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
function applyMapSkin(scene: T.Scene, id: string) {
  const palette = mapPalette(id);
  scene.background = new T.Color(palette.horizon);
  const ocean = scene.getObjectByName('animated-ocean') as
    | T.Mesh<T.PlaneGeometry, T.ShaderMaterial>
    | undefined;
  if (ocean) {
    ocean.material.uniforms.uHorizon.value.set(palette.horizon);
    ocean.material.uniforms.uDeep.value.setRGB(...palette.deep);
    ocean.material.uniforms.uShallow.value.setRGB(...palette.shallow);
  }
}
export default function Board({
  game,
  actions,
  onAction,
  onPreview,
  preview = null,
  view,
  lite,
  mapSkin = 'map.ember',
  feedbackLevel = 'full',
  reducedMotion = false,
}: Props) {
  const terrain = useMemo(
      () => createGame(game.seed, false, game.mapId),
      [game.seed, game.mapId],
    ),
    host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    latest = useRef({ game, actions, onAction, onPreview, preview });
  const [error, setError] = useState(false);
  const [artStatus, setArtStatus] = useState('loading');
  const [artRevision, setArtRevision] = useState(0);
  useEffect(() => {
    latest.current = { game, actions, onAction, onPreview, preview };
  }, [game, actions, onAction, onPreview, preview]);
  useEffect(() => {
    const el = host.current!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: !lite,
        powerPreference: 'high-performance',
      });
    } catch {
      // Report a hardware initialization failure through the accessible DOM fallback.
      // eslint-disable-next-line react/react-compiler
      setError(true);
      return;
    }
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1 : 1.75));
    renderer.shadowMap.enabled = !lite;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    // The light and island are static. Refresh this expensive pass only when
    // a road, settlement, city or Raider changes.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = !lite;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute(
      'aria-label',
      '3D Ember Isles board. Select a glowing location to build.',
    );
    el.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.background = new T.Color(OCEAN_HORIZON);
    scene.fog = new T.FogExp2('#173641', 0.006);
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 350);
    camera.position.set(0, 9.7, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.43;
    controls.target.set(0, 0.12, 0);
    const lighting = createBoardLighting(renderer, scene);
    const sun = lighting.sun;
    sun.castShadow = !lite;
    sun.shadow.mapSize.set(lite ? 512 : 2048, lite ? 512 : 2048);
    Object.assign(sun.shadow.camera, {
      left: -7,
      right: 7,
      top: 7,
      bottom: -7,
      near: 0.1,
      far: 30,
    });
    sun.shadow.normalBias = 0.0045;
    sun.shadow.bias = -0.00015;
    scene.add(sun);
    let fallback: ReturnType<typeof createEnvironment> | null = null;
    const lifecycle = new AbortController();
    let disposed = false;
    const pieces = new T.Group(),
      targets = new T.Group();
    scene.add(pieces, targets);
    const rt: Runtime = {
      scene,
      renderer,
      pieces,
      targets,
      camera,
      controls,
      reduced,
      showGhost: () => {},
    };
    runtime.current = rt;
    let ghost: T.Group | null = null,
      ghostKey = '';
    const showGhost = (action: Action | null) => {
      const key = action && 'id' in action ? `${action.type}-${action.id}` : '';
      if (key === ghostKey) return;
      if (ghost) {
        scene.remove(ghost);
        dispose(ghost);
        ghost = null;
      }
      ghostKey = key;
      if (
        !action ||
        !('id' in action) ||
        !['road', 'settlement', 'city', 'raider'].includes(action.type)
      )
        return;
      const target = targets.children.find(
        (m) =>
          m.userData.action.type === action.type &&
          m.userData.action.id === action.id,
      );
      if (!target) return;
      ghost = rt.diorama
        ? rt.diorama.preview(action)
        : createModel(
            action.type as 'road' | 'settlement' | 'city' | 'raider',
            '#ffe6a0',
          );
      ghost.position.copy(target.position);
      ghost.userData.placementGhost = true;
      ghost.position.y = rt.diorama ? 0.08 : 0.23;
      if (action.type === 'raider' && rt.diorama)
        ghost.position.copy(rt.diorama.raiderPosition(action.id));
      if (action.type === 'road') {
        ghost.rotation.y = target.rotation.y + (rt.diorama ? Math.PI / 2 : 0);
        if (rt.diorama) ghost.scale.x = 0.955;
      }
      ghost.traverse((child) => {
        if (child instanceof T.Mesh) {
          for (const material of Array.isArray(child.material)
            ? child.material
            : [child.material]) {
            material.transparent = true;
            material.opacity = 0.55;
            material.depthWrite = false;
          }
        }
      });
      scene.add(ghost);
    };
    rt.showGhost = showGhost;
    const ray = new T.Raycaster(),
      pointer = new T.Vector2();
    let startX = 0,
      startY = 0,
      dragging = false,
      hover: T.Mesh | null = null;
    function pick(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      return ray.intersectObjects(targets.children, false)[0]?.object as
        | T.Mesh
        | undefined;
    }
    const down = (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      dragging = false;
    };
    const up = (e: PointerEvent) => {
      const moved =
        dragging || Math.hypot(e.clientX - startX, e.clientY - startY) > 6;
      dragging = false;
      renderer.domElement.style.cursor = 'grab';
      if (moved) return;
      const hit = pick(e);
      if (hit) {
        if (e.pointerType === 'touch' && latest.current.onPreview)
          latest.current.onPreview(hit.userData.action);
        else latest.current.onAction(hit.userData.action);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.buttons && Math.hypot(e.clientX - startX, e.clientY - startY) > 6) {
        if (!dragging) {
          dragging = true;
          hover = null;
          showGhost(null);
          renderer.domElement.style.cursor = 'grabbing';
        }
        return;
      }
      hover = pick(e) ?? null;
      renderer.domElement.style.cursor = hover ? 'pointer' : 'grab';
      if (e.pointerType !== 'touch')
        showGhost(hover?.userData.action ?? latest.current.preview);
    };
    const leave = () => {
      hover = null;
      showGhost(latest.current.preview);
    };
    renderer.domElement.addEventListener('pointerleave', leave);
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointermove', move);
    let fitted = false;
    let narrow = window.matchMedia('(max-width: 760px)').matches;
    const resize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      if (window.matchMedia('(min-width: 761px)').matches) {
        // Reserve visual weight for the floating hand without moving the
        // orbit pivot away from the center of the island.
        camera.setViewOffset(
          el.clientWidth,
          el.clientHeight,
          0,
          Math.round(el.clientHeight * 0.065),
          el.clientWidth,
          el.clientHeight,
        );
      } else {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
      // Fit once on mount. Layout changes must not overwrite the player's zoom.
      const nextNarrow = window.matchMedia('(max-width: 760px)').matches;
      if (!fitted || narrow !== nextNarrow) {
        narrow = nextNarrow;
        fitBoard(camera, controls);
        fitted = true;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let previous = 0,
      elapsed = 0;
    const render = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      if (now - previous < 1000 / 30) return;
      previous = now;
      if (document.hidden) return;
      if (!rt.reduced) elapsed += delta;
      fallback?.update(elapsed);
      rt.diorama?.update(elapsed, rt.reduced);
      for (const m of targets.children) {
        const mat = (m as T.Mesh).material as T.MeshStandardMaterial;
        const pulse = 0.5 + Math.sin(elapsed * 4.2) * 0.5;
        const hovered = m === hover;
        // Keep the resting glow while lowering the pulse peak from 1.8 to 1.53 (15%).
        mat.emissiveIntensity = hovered
          ? 2
          : rt.reduced
            ? 1
            : 0.8 + pulse * 0.73;
        // The ghost model becomes the entire hover target; the marker stays raycastable.
        mat.opacity = hovered ? 0 : rt.reduced ? 0.9 : 0.74 + pulse * 0.2;
        const scale = hovered ? 1.1 : rt.reduced ? 1.02 : 0.97 + pulse * 0.1;
        m.scale.setScalar(scale);
      }
      controls.update();
      rt.diorama?.beforeRender();
      renderer.render(scene, camera);
      rt.diorama?.afterRender();
    };
    renderer.setAnimationLoop(render);
    setArtStatus('loading');
    void loadDioramaAssets(lifecycle.signal)
      .then((assets) => {
        if (disposed) {
          assets.dispose();
          return;
        }
        try {
          dispose(pieces);
          pieces.clear();
          rt.diorama = createDiorama({
            scene,
            renderer,
            camera,
            host: el,
            game: latest.current.game,
            assets,
            lighting,
            lite,
            pieces,
            targets,
          });
          showGhost(null);
          setArtStatus('ready');
          setArtRevision((value) => value + 1);
        } catch (error) {
          assets.dispose();
          throw error;
        }
      })
      .catch((error) => {
        if (disposed || lifecycle.signal.aborted) return;
        console.error('Diorama loading failed', error);
        fallback = createEnvironment(
          scene,
          dioramaLayout(terrain),
          lite,
          reduced,
        );
        setArtStatus('fallback');
        setArtRevision((value) => value + 1);
      });
    return () => {
      disposed = true;
      lifecycle.abort();
      rt.diorama?.dispose();
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, [terrain, lite]);
  useEffect(() => {
    const scene = runtime.current?.scene;
    if (!scene) return;
    applyMapSkin(scene, mapSkin);
  }, [mapSkin, terrain, lite]);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    const snapshot = dioramaLayout(game);
    rt.showGhost(null);
    dispose(rt.targets);
    rt.targets.clear();
    if (rt.diorama) rt.diorama.sync(game);
    else {
      const nextKeys = new Set<string>();
      const existing = new Map(
        rt.pieces.children.map((piece) => [piece.name, piece]),
      );
      function add(make: () => T.Group, key: string, x: number, z: number) {
        if (!existing.has(key)) {
          const model = make();
          model.position.set(x, 0.215, z);
          model.name = key;
          rt!.pieces.add(model);
        }
        nextKeys.add(key);
      }
      for (const v of snapshot.vertices)
        if (v.owner !== null)
          add(
            () => createModel(v.city ? 'city' : 'settlement', COLORS[v.owner!]),
            `v${v.id}-${v.city}`,
            v.x,
            v.z,
          );
      for (const e of snapshot.edges)
        if (e.owner !== null) {
          const a = snapshot.vertices[e.a],
            b = snapshot.vertices[e.b];
          add(
            () => {
              const road = createModel('road', COLORS[e.owner!]);
              road.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
              return road;
            },
            `e${e.id}`,
            (a.x + b.x) / 2,
            (a.z + b.z) / 2,
          );
        }
      const h = snapshot.hexes[snapshot.raider];
      add(() => createModel('raider'), `raider${h.id}`, h.x + 0.29, h.z - 0.11);
      for (const piece of rt.pieces.children.filter(
        (piece) => !nextKeys.has(piece.name),
      )) {
        if (!nextKeys.has(piece.name)) {
          rt.pieces.remove(piece);
          dispose(piece);
        }
      }
    }
    const seen = new Set<string>();
    for (const a of actions) {
      if (!('id' in a)) continue;
      const key = a.type + a.id;
      if (seen.has(key)) continue;
      seen.add(key);
      let m: T.Mesh;
      if (a.type === 'road') {
        const e = snapshot.edges[a.id],
          v = snapshot.vertices[e.a],
          w = snapshot.vertices[e.b];
        m = part(
          new T.BoxGeometry(0.28, 0.065, 0.9),
          '#e5c87f',
          (v.x + w.x) / 2,
          0.12,
          (v.z + w.z) / 2,
        );
        m.rotation.y = Math.atan2(w.x - v.x, w.z - v.z);
      } else if (a.type === 'raider') {
        const h = snapshot.hexes[a.id];
        m = part(new T.RingGeometry(0.69, 0.74, 6), '#efd298', h.x, 0.13, h.z);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = Math.PI / 6;
      } else {
        const v = snapshot.vertices[a.id];
        m = part(
          new T.CylinderGeometry(0.1725, 0.1875, 0.05, 24),
          '#bca36c',
          v.x,
          0.12,
          v.z,
        );
      }
      const mat = m.material as T.MeshStandardMaterial;
      mat.emissive.set('#e7bc69');
      mat.transparent = true;
      mat.opacity = 0.75;
      mat.depthTest = false;
      m.renderOrder = 20;
      m.userData.action = structuredClone(a);
      rt.targets.add(m);
    }
    rt.renderer.shadowMap.needsUpdate = !lite;
  }, [game, actions, lite, artRevision]);
  useEffect(() => {
    runtime.current?.showGhost(preview);
  }, [preview, actions, game, lite, artRevision]);
  useEffect(() => {
    const rt = runtime.current;
    if (rt) updateReducedMotion(rt, reducedMotion);
  }, [reducedMotion, terrain, lite]);
  useEffect(() => {
    const rt = runtime.current;
    if (!rt || !host.current) return;
    return mountSceneFeedback(
      rt.scene,
      rt.pieces,
      rt.camera,
      host.current,
      feedbackPolicy(feedbackLevel, reducedMotion, lite),
      { spacing: 0.955, surface: 0.08 },
    );
  }, [terrain, lite, feedbackLevel, reducedMotion]);
  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    const destination = new T.Vector3(
      0,
      view % 2 ? 14 : 9.7,
      view % 2 ? 1 : 12,
    );
    const halfFov = Math.atan(
      Math.tan(T.MathUtils.degToRad(rt.camera.fov / 2)) *
        Math.min(rt.camera.aspect, 1),
    );
    const distance = 5.65 / Math.sin(halfFov);
    destination
      .sub(rt.controls.target)
      .normalize()
      .multiplyScalar(distance)
      .add(rt.controls.target);
    rt.controls.minDistance = distance * 0.5;
    rt.controls.maxDistance = distance * 1.6;
    if (reducedMotion) {
      rt.camera.position.copy(destination);
      rt.controls.update();
      return;
    }
    rt.controls.enabled = false;
    const tween = gsap.to(rt.camera.position, {
      x: destination.x,
      y: destination.y,
      z: destination.z,
      duration: 0.85,
      ease: 'power2.inOut',
      overwrite: true,
      onUpdate: () => rt.controls.update(),
      onComplete: () => {
        rt.controls.enabled = true;
      },
    });
    return () => {
      tween.kill();
      rt.controls.enabled = true;
    };
  }, [view, reducedMotion]);
  return (
    <div className="board-canvas" ref={host}>
      {artStatus === 'loading' && !error && (
        <output className="diorama-loading">Loading the island...</output>
      )}
      {artStatus === 'fallback' && (
        <output className="diorama-loading">
          Detailed art unavailable. Playing with basic models.
        </output>
      )}
      {error && (
        <div className="webgl-error">
          3D is unavailable. Enable hardware acceleration or try another
          browser.
        </div>
      )}
    </div>
  );
}
