import * as T from 'three';
import { gsap } from 'gsap';
import { feedbackEvents } from '@/lib/use-game-feedback';
import type { feedbackPolicy } from '@/packages/rules/feedback';

/** All objects are temporary presentation objects, excluded from board hit testing. */
export function mountSceneFeedback(
  scene: T.Scene,
  pieces: T.Group,
  camera: T.Camera,
  host: HTMLElement,
  policy: ReturnType<typeof feedbackPolicy>,
) {
  let context: gsap.Context | null = null;
  const transient = new Set<() => void>();
  const clear = () => {
    context?.revert();
    context = null;
    transient.forEach((remove) => remove());
    transient.clear();
  };
  const unsubscribe = feedbackEvents.subscribe((event) => {
    clear();
    if (!policy.animate || document.hidden) return;
    context = gsap.context(() => {
      for (const build of event.builds) {
        const model = pieces.children.find((piece) => piece.name === build.key);
        if (model) {
          gsap.fromTo(
            model.scale,
            {
              x: 1 - 0.18 * policy.strength,
              y: 1 - 0.45 * policy.strength,
              z: 1 - 0.18 * policy.strength,
            },
            { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(1.6)' },
          );
          gsap.fromTo(
            model.position,
            { y: 0.215 + 0.22 * policy.strength },
            { y: 0.215, duration: 0.42, ease: 'bounce.out' },
          );
        }
        const material = new T.MeshBasicMaterial({
          color: '#efd29a',
          transparent: true,
          opacity: 0.65 * policy.strength,
          depthWrite: false,
        });
        const ring = new T.Mesh(new T.RingGeometry(0.15, 0.19, 32), material);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(build.x, 0.24, build.z);
        scene.add(ring);
        const remove = () => {
          scene.remove(ring);
          ring.geometry.dispose();
          material.dispose();
          transient.delete(remove);
        };
        transient.add(remove);
        gsap.to(ring.scale, { x: 3, y: 3, z: 3, duration: 0.65 });
        gsap.to(material, { opacity: 0, duration: 0.65, onComplete: remove });
      }
      for (const tile of event.producing) {
        const material = new T.MeshBasicMaterial({
          color: '#efd29a',
          transparent: true,
          opacity: 0.5 * policy.strength,
          depthWrite: false,
        });
        const ring = new T.Mesh(new T.RingGeometry(0.78, 0.86, 6), material);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(tile.x, 0.24, tile.z);
        scene.add(ring);
        const remove = () => {
          scene.remove(ring);
          ring.geometry.dispose();
          material.dispose();
          transient.delete(remove);
        };
        transient.add(remove);
        gsap.to(material, { opacity: 0, duration: 1.2, onComplete: remove });
      }
      if (!policy.flights) return;
      const remaining = [...event.gains];
      let count = 0;
      const bounds = host.getBoundingClientRect();
      for (const source of event.sources) {
        if (count >= 6 || remaining[source.resource] <= 0) continue;
        const target = host
          .closest('main')
          ?.querySelector(`[data-resource="${source.resource}"]`);
        if (!target) continue;
        const destination = target.getBoundingClientRect();
        if (destination.width === 0 || destination.top > innerHeight) continue;
        const projected = new T.Vector3(source.x, 0.45, source.z).project(
          camera,
        );
        if (projected.z < -1 || projected.z > 1) continue;
        const chip = document.createElement('span');
        chip.className = 'resource-flight';
        chip.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('span');
        icon.className = `resource-flight-icon resource-sprite sprite-${source.resource}`;
        const amount = document.createElement('strong');
        amount.textContent = `+${source.amount}`;
        chip.appendChild(icon);
        chip.appendChild(amount);
        const x = bounds.left + ((projected.x + 1) * bounds.width) / 2;
        const y = bounds.top + ((1 - projected.y) * bounds.height) / 2;
        chip.style.left = `${Math.max(bounds.left, Math.min(bounds.right, x))}px`;
        chip.style.top = `${Math.max(bounds.top, Math.min(bounds.bottom, y))}px`;
        document.body.appendChild(chip);
        const remove = () => {
          chip.remove();
          transient.delete(remove);
        };
        transient.add(remove);
        gsap.fromTo(
          chip,
          { opacity: 0, scale: 0.7 },
          { opacity: 1, scale: 1, duration: 0.18, delay: count * 0.08 },
        );
        gsap.to(chip, {
          x:
            destination.left +
            destination.width / 2 -
            parseFloat(chip.style.left),
          y:
            destination.top +
            destination.height / 2 -
            parseFloat(chip.style.top),
          opacity: 0,
          scale: 0.65,
          delay: 0.25 + count * 0.08,
          duration: 0.65,
          ease: 'power2.inOut',
          onComplete: remove,
        });
        remaining[source.resource] -= source.amount;
        count++;
      }
    });
  });
  document.addEventListener('visibilitychange', clear);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', clear);
    clear();
  };
}
