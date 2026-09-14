import { it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  apply,
  legalActions,
  chooseBotAction,
} from '../../packages/rules/game.ts';
import { constructionState, dioramaLayout } from './diorama-state.ts';
import { boardPorts } from './diorama/browser-layout.mjs';

it('compacts presentation without changing saved rules, harbour endpoints or IDs', () => {
  for (const seed of [1, 42, 42817, 91773]) {
    const game = createGame(seed),
      before = structuredClone(game),
      layout = dioramaLayout(game);
    const ports = boardPorts(layout);
    assert.equal(ports.length, 9);
    for (const port of ports) {
      assert.equal(layout.vertices[port.a].harbour, port.type);
      assert.equal(layout.vertices[port.b].harbour, port.type);
    }
    for (const edge of layout.edges) {
      const a = layout.vertices[edge.a],
        b = layout.vertices[edge.b];
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 0.955) < 0.00001);
    }
    assert.deepEqual(
      layout.hexes.map((h) => [h.id, h.resource, h.number]),
      game.hexes.map((h) => [h.id, h.resource, h.number]),
    );
    assert.deepEqual(legalActions(layout), legalActions(game));
    assert.deepEqual(game, before);
  }
});

it('construction follows legal setup and upgrades, with no review buildings in an empty match', () => {
  let game = createGame(42, true);
  assert.deepEqual(constructionState(game), {
    buildings: [],
    roads: [],
    raider: game.raider,
  });
  while (game.phase.startsWith('setup'))
    game = apply(game, chooseBotAction(game));
  assert.equal(constructionState(game).buildings.length, 8);
  assert.equal(constructionState(game).roads.length, 8);
  game.phase = 'main';
  game.players[game.active].resources = [0, 0, 0, 2, 3];
  const upgrade = legalActions(game).find((a) => a.type === 'city');
  assert.ok(upgrade);
  game = apply(game, upgrade);
  assert.equal(
    constructionState(game).buildings.filter((b) => b.city).length,
    1,
  );
  assert.equal(constructionState(game).buildings.length, 8);
  game.phase = 'raider';
  const move = legalActions(game).find((a) => a.type === 'raider');
  assert.ok(move && 'id' in move);
  game = apply(game, move);
  assert.equal(constructionState(game).raider, move.id);
});
