import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, createGame, RESOURCES, type Game } from './game.ts';

let eightRng: number | undefined;
function rollEight(game: Game) {
  game.phase = 'roll';
  if (eightRng !== undefined)
    return apply({ ...game, rng: eightRng }, { type: 'roll' });
  for (let rng = 1; rng < 10000; rng++) {
    const next = apply({ ...game, rng }, { type: 'roll' });
    if (next.dice[0] + next.dice[1] === 8) {
      eightRng = rng;
      return next;
    }
  }
  throw new Error('No deterministic roll of eight found');
}

test('every corner of both 8 tiles produces for every player, on any turn', () => {
  for (const seed of [42, 42817, 1, 999]) {
    const initial = createGame(seed);
    for (const tile of initial.hexes.filter((h) => h.number === 8)) {
      for (const vertex of tile.vertices) {
        for (let owner = 0; owner < 4; owner++) {
          for (const city of [false, true]) {
            const game = structuredClone(initial);
            game.active = (owner + 1) % 4;
            game.vertices[vertex].owner = owner;
            game.vertices[vertex].city = city;
            const next = rollEight(game);
            for (let r = 0; r < RESOURCES.length; r++) {
              const expected =
                game.vertices[vertex].hexes.filter((id) => {
                  const h = game.hexes[id];
                  return h.number === 8 && h.resource === RESOURCES[r];
                }).length * (city ? 2 : 1);
              assert.equal(
                next.players[owner].resources[r],
                expected,
                `seed ${seed}, tile ${tile.id}, vertex ${vertex}, owner ${owner}`,
              );
              assert.equal(next.bank[r], 19 - expected);
            }
          }
        }
      }
    }
  }
});

test('raider blocks an 8 and an empty bank cannot produce', () => {
  const game = createGame(42817);
  const tile = game.hexes.find((h) => h.number === 8)!;
  const vertex = tile.vertices.find(
    (id) =>
      game.vertices[id].hexes.filter((h) => game.hexes[h].number === 8)
        .length === 1,
  )!;
  game.vertices[vertex].owner = 0;
  game.raider = tile.id;
  assert.deepEqual(rollEight(game).players[0].resources, [0, 0, 0, 0, 0]);
  game.raider = game.hexes.find((h) => h.resource === null)!.id;
  game.bank[RESOURCES.indexOf(tile.resource!)] = 0;
  assert.deepEqual(rollEight(game).players[0].resources, [0, 0, 0, 0, 0]);
});
