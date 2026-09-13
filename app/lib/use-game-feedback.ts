'use client';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { gsap } from 'gsap';
import { gameAudio, actionCue } from '@/lib/audio';
import {
  feedbackBetween,
  feedbackPolicy,
  type FeedbackFrame,
  type FeedbackLevel,
  type GameFeedback,
} from '@/packages/rules/feedback';

// The scene consumes presentation events only; this channel cannot dispatch game moves.
const listeners = new Set<(event: GameFeedback) => void>();
export const feedbackEvents = {
  subscribe(listener: (event: GameFeedback) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit(event: GameFeedback) {
    listeners.forEach((listener) => listener(event));
  },
};
const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(callback: () => void) {
  const query = matchMedia(motionQuery);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
export function useFeedbackPreferences() {
  const [level, setLevel] = useState<FeedbackLevel>('full');
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => matchMedia(motionQuery).matches,
    () => true,
  );
  useEffect(() => {
    try {
      const saved = localStorage.getItem('conquist-feedback-v1');
      if (saved === 'full' || saved === 'subtle' || saved === 'off') {
        // Restore this device preference after hydration.
        // eslint-disable-next-line react/react-compiler
        setLevel(saved);
      }
    } catch {}
  }, []);
  function change(value: FeedbackLevel) {
    setLevel(value);
    try {
      localStorage.setItem('conquist-feedback-v1', value);
    } catch {}
  }
  return { level, reduced, change };
}
export function useGameFeedback(
  root: RefObject<HTMLElement | null>,
  frame: FeedbackFrame,
  level: FeedbackLevel,
  reduced: boolean,
) {
  const previous = useRef<FeedbackFrame | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => {
    const reset = () => {
      previous.current = null;
      cleanup.current?.();
      cleanup.current = null;
    };
    document.addEventListener('visibilitychange', reset);
    return () => {
      document.removeEventListener('visibilitychange', reset);
      cleanup.current?.();
    };
  }, []);
  useEffect(() => {
    cleanup.current?.();
    cleanup.current = null;
  }, [level, reduced]);
  useEffect(() => {
    const event = feedbackBetween(previous.current, frame);
    previous.current = frame;
    if (!frame.playing) {
      cleanup.current?.();
      cleanup.current = null;
    }
    if (!event || document.hidden || !root.current) return;
    cleanup.current?.();
    gameAudio.play(event.won ? 'win' : actionCue({ type: event.move }));
    feedbackEvents.emit(event);
    const scope = root.current;
    const policy = feedbackPolicy(level, reduced);
    const status = scope.querySelector<HTMLOutputElement>(
      '[data-feedback-status]',
    );
    if (status) status.textContent = level === 'off' ? '' : event.message;
    const badges: HTMLElement[] = [];
    const ctx = gsap.context(() => {
      if (event.gains.some((n) => n > 0) && event.move === 'roll')
        gsap.delayedCall(0.32, () => gameAudio.play('collect'));
      if (level === 'off') return;
      event.playerGains.forEach((amount, seat) => {
        const badge = scope.querySelector<HTMLElement>(
          `[data-player="${seat}"] [data-player-gain]`,
        );
        if (badge && amount) {
          badge.textContent = `+${amount} cards`;
          badges.push(badge);
        }
      });
      for (let i = 0; i < 5; i++) {
        const delta = event.gains[i] - event.losses[i];
        if (!delta) continue;
        const card = scope.querySelector<HTMLElement>(`[data-resource="${i}"]`);
        const badge = card?.querySelector<HTMLElement>('[data-resource-delta]');
        if (badge) {
          badge.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
          badge.dataset.direction = delta > 0 ? 'gain' : 'loss';
          badges.push(badge);
          gsap.set(badge, { opacity: 1, y: 0 });
          if (policy.animate)
            gsap.to(badge, { y: -20, opacity: 0, delay: 0.85, duration: 0.45 });
        }
        const icon = card?.querySelector('.resource-sprite');
        if (icon && policy.animate)
          gsap.fromTo(
            icon,
            { scale: 1 },
            {
              scale: delta > 0 ? 1 + 0.16 * policy.strength : 0.93,
              duration: 0.18,
              repeat: 1,
              yoyo: true,
              ease: 'power2.out',
            },
          );
      }
      if (policy.animate) {
        if (event.move === 'roll') {
          const dice = scope.querySelectorAll('.die');
          if (dice.length)
            gsap.fromTo(
              dice,
              { rotation: -12 * policy.strength, y: -7 * policy.strength },
              {
                rotation: 0,
                y: 0,
                duration: 0.5,
                stagger: 0.055,
                ease: 'back.out(2)',
              },
            );
        }
        if (event.yourTurn) {
          const player = scope.querySelector(`[data-player="${event.active}"]`);
          if (player)
            gsap.fromTo(
              player,
              { filter: 'brightness(1)' },
              {
                filter: `brightness(${1 + 0.4 * policy.strength})`,
                duration: 0.45,
                repeat: 1,
                yoyo: true,
              },
            );
        }
        if (status && event.message)
          gsap.fromTo(
            status,
            { opacity: 0, y: 8 * policy.strength },
            { opacity: 1, y: 0, duration: 0.25 },
          );
      }
    }, scope);
    const timer = window.setTimeout(() => {
      if (status) status.textContent = '';
      badges.forEach((badge) => {
        badge.textContent = '';
      });
    }, 2400);
    cleanup.current = () => {
      clearTimeout(timer);
      ctx.revert();
      if (status) status.textContent = '';
      badges.forEach((badge) => {
        badge.textContent = '';
      });
    };
  }, [root, frame, level, reduced]);
}
