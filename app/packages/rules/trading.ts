import type { Game } from './game.ts';
export function validBundle(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n <= 19) &&
    value.some((n) => n > 0)
  );
}
export function offerCards(offer: {
  give: number;
  want: number;
  giveCards?: number[];
  wantCards?: number[];
}) {
  return {
    give:
      offer.giveCards ??
      Array.from({ length: 5 }, (_, i) => (i === offer.give ? 1 : 0)),
    want:
      offer.wantCards ??
      Array.from({ length: 5 }, (_, i) => (i === offer.want ? 1 : 0)),
  };
}
export function ownsCards(resources: number[], cards: number[]) {
  return cards.every((n, i) => resources[i] >= n);
}
export function validateExchange(give: unknown, want: unknown) {
  if (
    !validBundle(give) ||
    !validBundle(want) ||
    give.some((n, i) => n > 0 && want[i] > 0)
  )
    throw new Error(
      'Choose different resources on each side and at least one card per side.',
    );
}
export function exchange(
  state: Game,
  partner: number,
  give: number[],
  want: number[],
): Game {
  validateExchange(give, want);
  if (
    state.phase !== 'main' ||
    state.freeRoads ||
    !Number.isInteger(partner) ||
    partner < 0 ||
    partner >= state.players.length ||
    partner === state.active ||
    !ownsCards(state.players[state.active].resources, give) ||
    !ownsCards(state.players[partner].resources, want)
  )
    throw new Error(
      'This exchange is not legal. Check the cards and finish any pending move.',
    );
  const game = structuredClone(state);
  for (let i = 0; i < 5; i++) {
    game.players[game.active].resources[i] += want[i] - give[i];
    game.players[partner].resources[i] += give[i] - want[i];
  }
  game.log.unshift(
    `${game.players[game.active].name} traded with ${game.players[partner].name}.`,
  );
  game.log = game.log.slice(0, 80);
  return game;
}
