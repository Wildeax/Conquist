import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './game.ts';
import { botPresentation } from './bot-presentation.ts';

test('bot decisions have readable pauses without changing game randomness', () => {
  const game = createGame(123),
    before = JSON.stringify(game);
  const placement = botPresentation(game, { type: 'settlement', id: 0 }, 0);
  const discard = botPresentation(
    game,
    { type: 'discard', player: 1, resource: 0 },
    1,
  );
  const roll = botPresentation(game, { type: 'roll' }, 0.5);
  assert.ok(placement.delay >= 2300);
  assert.ok(discard.delay >= 650 && discard.delay <= 1350);
  assert.ok(roll.delay < placement.delay);
  assert.match(placement.message, /settlement/);
  assert.equal(JSON.stringify(game), before);
});
