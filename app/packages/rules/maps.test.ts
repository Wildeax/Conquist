import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from './game.ts';
import { DEFAULT_MAP_ID, playableMap } from './maps.ts';
import { normalizeLoadout } from '../../lib/cosmetics.ts';

test('playable map IDs are independent from cosmetic IDs and preserve the legacy board', () => {
  const legacy = createGame(42817);
  const explicit = createGame(42817, false, DEFAULT_MAP_ID);
  assert.deepEqual(explicit, legacy);
  assert.equal(explicit.mapId, DEFAULT_MAP_ID);
  assert.equal(playableMap(undefined).id, DEFAULT_MAP_ID);
  assert.throws(() => createGame(42, false, 'map.moonlit'), /not supported/);
  assert.throws(() => createGame(42, false, '__proto__'), /not supported/);
  assert.equal(normalizeLoadout({ map: DEFAULT_MAP_ID }).map, 'map.ember');
  assert.equal(
    normalizeLoadout({ pieces: 'pieces.founder' }, ['pieces.founder']).pieces,
    'pieces.classic',
  );
});
