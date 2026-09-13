import type { Action, Game } from './game.ts';

/** Presentation timing only. It never advances the rules RNG. */
export function botPresentation(
  game: Game,
  action: Action,
  variation = Math.random(),
) {
  const messages: Record<Action['type'], string> = {
    settlement: 'is weighing settlement sites',
    road: 'is planning a route',
    city: 'is choosing a settlement to upgrade',
    roll: 'is getting ready to roll',
    raider: 'is choosing where to send the Raider',
    discard: 'is choosing cards to discard',
    trade: 'is considering a trade',
    barter: 'is considering a trade',
    buy: 'is considering a Fortune card',
    card: 'is preparing a Fortune card',
    end: 'is finishing their turn',
  };
  const base =
    action.type === 'discard'
      ? 650
      : action.type === 'end'
        ? 1100
        : action.type === 'roll'
          ? 1400
          : game.phase.startsWith('setup')
            ? 2300
            : 1900;
  return {
    message: messages[action.type] + '...',
    delay: base + Math.round(Math.max(0, Math.min(1, variation)) * 700),
  };
}
