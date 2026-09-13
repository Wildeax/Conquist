import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  createGame,
  legalActions,
  RESOURCES,
  type Game,
} from './game.ts';
import {
  feedbackBetween,
  feedbackPolicy,
  type FeedbackFrame,
} from './feedback.ts';
function frame(
  game: Game,
  revision = 0,
  move: FeedbackFrame['move'] = null,
  viewer = 0,
): FeedbackFrame {
  return { game, revision, move, viewer, playing: true, match: 'test-room' };
}
test('feedback ignores initial load, duplicate snapshots, reconnect catch-up and non-game changes', () => {
  const g = createGame(42);
  const old = frame(g, 4, 'road');
  assert.equal(feedbackBetween(null, old), null);
  assert.equal(feedbackBetween(old, old), null);
  assert.equal(feedbackBetween(old, frame(g, 6, 'road')), null);
  assert.equal(feedbackBetween(old, frame(g, 5)), null);
  assert.equal(
    feedbackBetween(old, { ...frame(g, 5, 'road'), match: 'different-room' }),
    null,
  );
  assert.equal(
    feedbackBetween({ ...old, playing: false }, frame(g, 5, 'road')),
    null,
  );
});
test('construction feedback identifies the actual new piece without mutating the game', () => {
  const g = createGame(42);
  const action = legalActions(g)[0];
  assert.equal(action.type, 'settlement');
  const next = apply(g, action);
  const before = JSON.stringify([g, next]);
  const event = feedbackBetween(frame(g), frame(next, 1, 'settlement'))!;
  assert.equal(event.builds.length, 1);
  const vertex = next.vertices.find((v) => v.owner === 0)!;
  assert.equal(event.builds[0].key, `v${vertex.id}-false`);
  assert.equal(JSON.stringify([g, next]), before);
});
test('trade feedback shows the viewer net exchange and does not expose opponents hands', () => {
  const g = createGame(42);
  g.phase = 'main';
  g.players[0].resources = [2, 0, 0, 0, 0];
  g.players[1].resources = [0, 1, 0, 0, 0];
  const next = apply(g, { type: 'barter', give: 0, want: 1, partner: 1 });
  const event = feedbackBetween(frame(g), frame(next, 1, 'barter'))!;
  assert.deepEqual(event.gains, [0, 1, 0, 0, 0]);
  assert.deepEqual(event.losses, [1, 0, 0, 0, 0]);
  assert.equal(event.message, 'Trade complete');
  const observer = feedbackBetween(
    frame(g, 0, null, 2),
    frame(next, 1, 'barter', 2),
  )!;
  assert.deepEqual(observer.gains, [0, 0, 0, 0, 0]);
  assert.deepEqual(observer.losses, [0, 0, 0, 0, 0]);
  assert.deepEqual(observer.sources, []);
});
test('a hotseat handoff never compares one players private cards with another', () => {
  const g = createGame(42, true);
  g.phase = 'main';
  g.players[0].resources = [8, 2, 4, 7, 1];
  g.players[1].resources = [1, 0, 0, 0, 0];
  const next = apply(g, { type: 'end' });
  const event = feedbackBetween(frame(g), frame(next, 1, 'end', 1))!;
  assert.equal(event.yourTurn, true);
  assert.deepEqual(event.gains, [0, 0, 0, 0, 0]);
  assert.deepEqual(event.losses, [0, 0, 0, 0, 0]);
});
test('resource flights use producing tiles owned by the viewer and skip blocked production', () => {
  const g = createGame(42817);
  g.phase = 'roll';
  const tile = g.hexes.find((h) => h.number === 8)!;
  const resource = RESOURCES.indexOf(tile.resource!);
  g.vertices[tile.vertices[0]].owner = 0;
  let next: Game | undefined;
  for (let rng = 1; rng < 10000; rng++) {
    const candidate = apply({ ...g, rng }, { type: 'roll' });
    if (candidate.dice.reduce((a, b) => a + b, 0) === 8) {
      next = candidate;
      break;
    }
  }
  assert.ok(next);
  const event = feedbackBetween(frame(g), frame(next, 1, 'roll'))!;
  assert.ok(event.gains[resource] > 0);
  assert.ok(
    event.sources.some(
      (source) =>
        source.resource === resource &&
        source.x === tile.x &&
        source.z === tile.z,
    ),
  );
  const blocked = structuredClone(next);
  blocked.players[0].resources = [...g.players[0].resources];
  blocked.raider = tile.id;
  assert.deepEqual(
    feedbackBetween(frame(g), frame(blocked, 1, 'roll'))!.sources,
    [],
  );
});
test('reduced motion and effect levels disable travel and respect lite graphics', () => {
  assert.equal(feedbackPolicy('full', false).flights, true);
  assert.equal(feedbackPolicy('full', true).animate, false);
  assert.equal(feedbackPolicy('off', false).animate, false);
  assert.equal(feedbackPolicy('subtle', false).flights, false);
  assert.equal(feedbackPolicy('full', false, true).flights, false);
});
