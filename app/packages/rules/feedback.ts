import { RESOURCES, type Action, type Game } from './game.ts';

export type FeedbackFrame = {
  game: Game;
  match: string;
  revision: number;
  viewer: number;
  playing: boolean;
  move: Action['type'] | null;
};
export type GameFeedback = {
  move: Action['type'];
  won: boolean;
  yourTurn: boolean;
  active: number;
  gains: number[];
  losses: number[];
  message: string;
  builds: { key: string; x: number; z: number }[];
  sources: { resource: number; amount: number; x: number; z: number }[];
};
export type FeedbackLevel = 'full' | 'subtle' | 'off';
export function feedbackPolicy(
  level: FeedbackLevel,
  reducedMotion: boolean,
  lite = false,
) {
  return {
    animate: level !== 'off' && !reducedMotion,
    flights: level === 'full' && !reducedMotion && !lite,
    strength: level === 'subtle' ? 0.45 : 1,
  };
}
/** Only adjacent, acknowledged moves produce effects. Never infer private opponent cards. */
export function feedbackBetween(
  previous: FeedbackFrame | null,
  next: FeedbackFrame,
): GameFeedback | null {
  if (
    !previous?.playing ||
    !next.playing ||
    previous.match !== next.match ||
    next.revision !== previous.revision + 1 ||
    !next.move ||
    previous.game.seed !== next.game.seed
  )
    return null;
  const before = previous.game,
    game = next.game;
  const sameHand = previous.viewer === next.viewer;
  const deltas = game.players[next.viewer].resources.map((n, i) =>
    sameHand ? n - before.players[next.viewer].resources[i] : 0,
  );
  const gains = deltas.map((n) => Math.max(n, 0));
  const losses = deltas.map((n) => Math.max(-n, 0));
  const builds: GameFeedback['builds'] = [];
  for (const vertex of game.vertices) {
    const old = before.vertices[vertex.id];
    if (
      vertex.owner !== null &&
      (old.owner === null || (!old.city && vertex.city))
    )
      builds.push({
        key: `v${vertex.id}-${vertex.city}`,
        x: vertex.x,
        z: vertex.z,
      });
  }
  for (const edge of game.edges) {
    if (edge.owner !== null && before.edges[edge.id].owner === null) {
      const a = game.vertices[edge.a],
        b = game.vertices[edge.b];
      builds.push({
        key: `e${edge.id}`,
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
      });
    }
  }
  const sources: GameFeedback['sources'] = [];
  if (next.move === 'roll') {
    const remaining = [...gains];
    const total = game.dice.reduce((a, b) => a + b, 0);
    if (total !== 7)
      for (const hex of game.hexes) {
        const resource = RESOURCES.findIndex((r) => r === hex.resource);
        if (
          resource >= 0 &&
          gains[resource] > 0 &&
          hex.id !== game.raider &&
          hex.number === total &&
          hex.vertices.some((id) => game.vertices[id].owner === next.viewer)
        ) {
          const produced = hex.vertices.reduce(
            (count, id) =>
              count +
              (game.vertices[id].owner === next.viewer
                ? game.vertices[id].city
                  ? 2
                  : 1
                : 0),
            0,
          );
          const amount = Math.min(remaining[resource], produced);
          if (amount > 0)
            sources.push({ resource, amount, x: hex.x, z: hex.z });
          remaining[resource] -= amount;
        }
      }
  }
  const won = game.phase === 'over' && before.phase !== 'over';
  const yourTurn = game.active !== before.active && game.active === next.viewer;
  const gainText = gains
    .flatMap((n, i) => (n ? [`+${n} ${RESOURCES[i]}`] : []))
    .join(' · ');
  const message = won
    ? `${game.players[game.winner!].name} wins!`
    : next.move === 'trade' || next.move === 'barter'
      ? 'Trade complete'
      : next.move === 'roll'
        ? `Rolled ${game.dice.reduce((a, b) => a + b, 0)}${gainText ? ` · ${gainText}` : ''}`
        : yourTurn
          ? 'Your turn'
          : gainText ||
            (next.move === 'city'
              ? 'City upgraded'
              : next.move === 'settlement'
                ? 'Settlement built'
                : next.move === 'road'
                  ? 'Road built'
                  : '');
  return {
    move: next.move,
    won,
    yourTurn,
    active: game.active,
    gains,
    losses,
    builds,
    sources,
    message,
  };
}
