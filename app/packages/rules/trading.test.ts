import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGame } from './game.ts';
import { exchange, validateExchange } from './trading.ts';

test('bundle validation rejects malformed, overlapping and fractional quantities', () => {
  for (const give of [
    null,
    [],
    [1, 0, 0, 0],
    [20, 0, 0, 0, 0],
    [-1, 1, 0, 0, 0],
    [0.5, 0, 0, 0, 0],
    ['1', 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ])
    assert.throws(() => validateExchange(give, [0, 1, 0, 0, 0]));
  assert.throws(() => validateExchange([1, 0, 0, 0, 0], [1, 1, 0, 0, 0]));
});

test('bundle exchange rechecks inventory and preserves state when rejected', () => {
  const game = createGame(321);
  game.phase = 'main';
  game.players[0].resources = [2, 0, 1, 0, 0];
  game.players[1].resources = [0, 1, 0, 0, 0];
  const original = structuredClone(game);
  assert.throws(
    () => exchange(game, 1, [2, 0, 1, 0, 0], [0, 2, 0, 0, 0]),
    /not legal/,
  );
  assert.deepEqual(game, original);
  const next = exchange(game, 1, [2, 0, 1, 0, 0], [0, 1, 0, 0, 0]);
  assert.deepEqual(game, original);
  for (let i = 0; i < 5; i++)
    assert.equal(
      next.players.reduce((n, p) => n + p.resources[i], 0),
      game.players.reduce((n, p) => n + p.resources[i], 0),
    );
});
