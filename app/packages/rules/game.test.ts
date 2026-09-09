import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  apply,
  legalActions,
  chooseBotAction,
  RESOURCES,
  score,
  rate,
  routeLength,
  type Game,
} from './game.ts';

describe('Conquist rules', () => {
  it('T-003: radius-two island has 19 tiles, 54 vertices and 72 edges', () => {
    const g = createGame(42);
    assert.equal(g.hexes.length, 19);
    assert.equal(g.vertices.length, 54);
    assert.equal(g.edges.length, 72);
    for (const e of g.edges)
      assert.ok(
        g.vertices[e.a].edges.includes(e.id) &&
          g.vertices[e.b].edges.includes(e.id),
      );
  });
  it('T-011: seeds reproduce terrain, tokens and all state', () => {
    assert.deepEqual(createGame(42), createGame(42));
    assert.notDeepEqual(createGame(42).hexes, createGame(43).hexes);
    const g = createGame(42);
    assert.deepEqual(
      RESOURCES.map((r) => g.hexes.filter((h) => h.resource === r).length),
      [4, 3, 4, 4, 3],
    );
    assert.deepEqual(
      g.hexes
        .map((h) => h.number)
        .filter(Boolean)
        .sort((a, b) => a - b),
      [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    );
  });
  it('T-014: setup follows snake order, grants only second-settlement resources', () => {
    let g = createGame(42);
    const order: number[] = [];
    for (let i = 0; i < 16; i++) {
      if (i % 2 === 0) order.push(g.active);
      g = apply(g, chooseBotAction(g));
    }
    assert.deepEqual(order, [0, 1, 2, 3, 3, 2, 1, 0]);
    assert.equal(g.phase, 'roll');
    assert.equal(g.active, 0);
    assert.ok(
      g.players.every((p) => p.resources.reduce((a, b) => a + b, 0) > 0),
    );
    assert.ok(g.players.every((_, p) => score(g, p) === 2));
  });
  it('T-017: reducers are immutable; invalid actions do not change state', () => {
    const g = createGame(8),
      before = JSON.stringify(g);
    const next = apply(g, legalActions(g)[0]);
    assert.equal(JSON.stringify(g), before);
    assert.notDeepEqual(g, next);
    assert.throws(() => apply(g, { type: 'end' }));
    assert.throws(() => apply(g, { type: 'settlement', id: 999 }));
    const occupied = next.vertices.find((v) => v.owner !== null)!;
    for (const a of legalActions(next))
      if (a.type === 'settlement') assert.notEqual(a.id, occupied.id);
  });
  it('T-027: deterministic full matches complete with conserved resources and legal pieces', () => {
    for (const seed of [5, 42, 72]) {
      let g = createGame(seed);
      for (let n = 0; n < 6000 && g.phase !== 'over'; n++) {
        const actions = legalActions(g);
        assert.ok(actions.length > 0, `no moves in ${g.phase}`);
        g = apply(g, chooseBotAction(g));
        for (let r = 0; r < 5; r++) {
          assert.equal(
            g.bank[r] + g.players.reduce((s, p) => s + p.resources[r], 0),
            19,
          );
          assert.ok(
            g.bank[r] >= 0 && g.players.every((p) => p.resources[r] >= 0),
          );
        }
        for (const v of g.vertices.filter((v) => v.owner !== null))
          for (const eid of v.edges) {
            const e = g.edges[eid];
            assert.equal(g.vertices[e.a === v.id ? e.b : e.a].owner, null);
          }
      }
      assert.equal(
        g.phase,
        'over',
        `seed ${seed} did not finish, turn ${g.turn}`,
      );
      assert.ok(score(g, g.winner!) >= g.target);
    }
  });
});

function settled(seed = 42): Game {
  let g = createGame(seed);
  while (g.phase.startsWith('setup')) g = apply(g, chooseBotAction(g));
  return g;
}
function grant(g: Game, p: number, bag: number[]) {
  bag.forEach((n, r) => {
    g.bank[r] += g.players[p].resources[r] - n;
    g.players[p].resources[r] = n;
  });
}

describe('Edge cases and regression coverage', () => {
  it('T-019: Engineers with one road piece left still requires the roll', () => {
    let g = settled();
    for (let i = 0; i < 12; i++) {
      g.phase = 'main';
      grant(g, 0, [1, 1, 0, 0, 0]);
      const road = legalActions(g).find((a) => a.type === 'road');
      assert.ok(road);
      g = apply(g, road);
    }
    assert.equal(g.edges.filter((e) => e.owner === 0).length, 14);
    g.phase = 'roll';
    g.players[0].cards = [{ type: 'Engineers', turn: 0 }];
    g = apply(g, { type: 'card', card: 'Engineers' });
    g = apply(
      g,
      legalActions(g).find((a) => a.type === 'road')!,
    );
    assert.equal(g.phase, 'roll');
    assert.equal(g.freeRoads, 0);
  });
  it('T-004: world-space vertices are unique and edges have unit length', () => {
    const g = createGame(9);
    for (const e of g.edges) {
      const a = g.vertices[e.a],
        b = g.vertices[e.b];
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 1) < 1e-8);
    }
    for (const a of g.vertices)
      for (const b of g.vertices)
        if (a.id !== b.id) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.99);
  });
  it('T-017: a settlement cannot occupy a neighbour or an unconnected vertex', () => {
    const g = settled();
    g.phase = 'main';
    grant(g, 0, [4, 4, 4, 4, 0]);
    for (const a of legalActions(g))
      if (a.type === 'settlement') {
        assert.ok(g.vertices[a.id].edges.some((id) => g.edges[id].owner === 0));
        for (const eid of g.vertices[a.id].edges) {
          const e = g.edges[eid];
          assert.equal(g.vertices[e.a === a.id ? e.b : e.a].owner, null);
        }
      }
  });
  it('T-018: purchased Fortune cards cannot be played immediately', () => {
    let g = settled();
    g.phase = 'main';
    grant(g, 0, [0, 0, 1, 1, 1]);
    g.deck = ['Guard'];
    g = apply(g, { type: 'buy' });
    assert.equal(g.players[0].cards.at(-1)?.type, 'Guard');
    assert.ok(!legalActions(g).some((a) => a.type === 'card'));
  });
  it('T-019: playing a Guard before rolling does not skip or repeat the mandatory roll', () => {
    let g = settled();
    g.players[0].cards = [{ type: 'Guard', turn: 0 }];
    g = apply(g, { type: 'card', card: 'Guard' });
    assert.equal(g.phase, 'raider');
    g = apply(g, legalActions(g)[0]);
    assert.equal(g.phase, 'roll');
    g = apply(g, { type: 'roll' });
    assert.notEqual(g.phase, 'roll');
  });
  it('T-019: Engineers grants free roads before returning to the roll phase', () => {
    let g = settled();
    g.players[0].cards = [{ type: 'Engineers', turn: 0 }];
    const before = [...g.players[0].resources];
    g = apply(g, { type: 'card', card: 'Engineers' });
    for (let i = 0; i < 2; i++) {
      const a = legalActions(g).find((a) => a.type === 'road')!;
      assert.ok(a);
      g = apply(g, a);
    }
    assert.deepEqual(g.players[0].resources, before);
    assert.equal(g.phase, 'roll');
    assert.equal(g.freeRoads, 0);
  });
  it('T-019: Bounty takes two chosen cards and prohibits a second card', () => {
    let g = settled();
    g.phase = 'main';
    g.players[0].cards = [
      { type: 'Bounty', turn: 0 },
      { type: 'Guard', turn: 0 },
    ];
    const before = g.players[0].resources[0];
    g = apply(g, { type: 'card', card: 'Bounty', resource: 0, second: 0 });
    assert.equal(g.players[0].resources[0], before + 2);
    assert.ok(!legalActions(g).some((a) => a.type === 'card'));
  });
  it('T-019: Embargo transfers only the named resource', () => {
    let g = settled();
    g.phase = 'main';
    g.players[0].cards = [{ type: 'Embargo', turn: 0 }];
    const timber = g.players.reduce((n, p) => n + p.resources[0], 0);
    const before = g.players.map((p) => p.resources[3]);
    g = apply(g, { type: 'card', card: 'Embargo', resource: 0 });
    assert.equal(g.players[0].resources[0], timber);
    assert.ok(g.players.slice(1).every((p) => p.resources[0] === 0));
    assert.deepEqual(
      g.players.map((p) => p.resources[3]),
      before,
    );
  });
  it('T-020: harbour trading automatically uses the best applicable ratio', () => {
    const g = settled(),
      v = g.vertices.find((v) => v.owner === 0)!;
    for (const v of g.vertices) v.harbour = null;
    assert.equal(rate(g, 0, 0), 4);
    v.harbour = -1;
    assert.equal(rate(g, 0, 0), 3);
    v.harbour = 0;
    assert.equal(rate(g, 0, 0), 2);
    assert.equal(rate(g, 0, 1), 4);
  });
  it('T-020: trades conserve bank cards and cannot trade a resource for itself', () => {
    let g = settled();
    g.phase = 'main';
    grant(g, 0, [8, 0, 0, 0, 0]);
    const r = rate(g, 0, 0);
    g = apply(g, { type: 'trade', give: 0, want: 1 });
    assert.equal(g.players[0].resources[0], 8 - r);
    assert.equal(g.players[0].resources[1], 1);
    assert.throws(() => apply(g, { type: 'trade', give: 0, want: 0 }));
  });
  it('T-021: a local barter transfers both sides atomically', () => {
    let g = settled();
    g.phase = 'main';
    grant(g, 0, [1, 0, 0, 0, 0]);
    grant(g, 1, [0, 1, 0, 0, 0]);
    g = apply(g, { type: 'barter', give: 0, want: 1, partner: 1 });
    assert.deepEqual(g.players[0].resources, [0, 1, 0, 0, 0]);
    assert.deepEqual(g.players[1].resources, [1, 0, 0, 0, 0]);
    assert.throws(() =>
      apply(g, { type: 'barter', give: 0, want: 1, partner: 1 }),
    );
  });
  it('T-022: discard cannot remove absent cards and resolves to the Raider', () => {
    let g = settled();
    g.phase = 'discard';
    g.discard = [2, 0, 0, 0];
    grant(g, 0, [2, 0, 0, 0, 0]);
    assert.throws(() => apply(g, { type: 'discard', player: 0, resource: 1 }));
    g = apply(g, { type: 'discard', player: 0, resource: 0 });
    assert.equal(g.phase, 'discard');
    g = apply(g, { type: 'discard', player: 0, resource: 0 });
    assert.equal(g.phase, 'raider');
    assert.ok(
      !legalActions(g).some((a) => a.type === 'raider' && a.id === g.raider),
    );
  });
  it('T-023: loops count edges once and opponent settlements split a route', () => {
    const g = createGame(42);
    const h = g.hexes[0];
    for (let i = 0; i < 6; i++) {
      const a = h.vertices[i],
        b = h.vertices[(i + 1) % 6];
      g.edges.find(
        (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
      )!.owner = 0;
    }
    assert.equal(routeLength(g, 0), 6);
    g.vertices[h.vertices[0]].owner = 1;
    g.vertices[h.vertices[3]].owner = 2;
    assert.equal(routeLength(g, 0), 3);
  });
  it('T-025: Charter points are hidden publicly but can end a game immediately', () => {
    let g = settled();
    g.phase = 'main';
    grant(g, 0, [0, 0, 1, 1, 1]);
    g.target = 3;
    g.deck = ['Charter'];
    g = apply(g, { type: 'buy' });
    assert.equal(score(g, 0), 3);
    assert.equal(score(g, 0, true), 2);
    assert.equal(g.winner, 0);
    assert.equal(g.phase, 'over');
    assert.deepEqual(legalActions(g), []);
  });
  it('T-027: 100 seeded headless matches finish without illegal actions', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let g = createGame(seed);
      for (let n = 0; n < 6000 && g.phase !== 'over'; n++)
        g = apply(g, chooseBotAction(g));
      assert.equal(g.phase, 'over', `seed ${seed} stalled at turn ${g.turn}`);
    }
  });
});
