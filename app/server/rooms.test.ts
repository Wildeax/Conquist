import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Rooms, actorOf, type Command, type RoomView } from './rooms.ts';
import { createRoomServer } from './index.ts';
import { chooseBotAction } from '../packages/rules/game.ts';

function table(t: { after: (fn: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'conquist-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const rooms = new Rooms(directory);
  const host = rooms.create('Amber');
  const code = host.view.code;
  const guests = ['Azure', 'Crimson', 'Violet'].map((name) =>
    rooms.join(code, name),
  );
  const tokens = [host.token, ...guests.map((g) => g.token)];
  const send = (seat: number, command: Command) =>
    rooms.command(code, tokens[seat], rooms.get(code).revision, command);
  return { rooms, code, tokens, send, directory };
}

test('rooms require four players, host start, authenticated seats, and current revisions', (t) => {
  const { rooms, code, tokens, send } = table(t);
  assert.throws(() => rooms.view(code, 'wrong-token'), /invalid/);
  assert.throws(() => rooms.join(code, 'Fifth'), /full/);
  assert.throws(() => send(1, { type: 'start' }), /host/);
  const view = send(0, { type: 'start' });
  assert.equal(view.game?.phase, 'setup-settlement');
  assert.throws(
    () => send(1, { type: 'action', action: view.actions[0] }),
    /turn/,
  );
  const before = rooms.get(code).revision;
  send(0, { type: 'action', action: view.actions[0] });
  assert.throws(
    () =>
      rooms.command(code, tokens[0], before, {
        type: 'action',
        action: view.actions[0],
      }),
    /changed/,
  );
  assert.throws(
    () => send(0, { type: 'action', action: { type: 'city', id: 999 } }),
    /not legal/,
  );
  assert.equal(rooms.get(code).revision, before + 1);
  const empty = rooms.create('New host');
  assert.throws(
    () => rooms.command(empty.view.code, empty.token, 0, { type: 'start' }),
    /four/,
  );
});

test('private views redact resource composition, cards, deck order, RNG and credentials', (t) => {
  const { rooms, code, tokens, send, directory } = table(t);
  send(0, { type: 'start' });
  const g = rooms.get(code).game!;
  g.players[1].resources = [2, 3, 1, 0, 4];
  g.players[1].cards = [
    { type: 'Charter', turn: 0 },
    { type: 'Bounty', turn: 0 },
  ];
  rooms.save(rooms.get(code));
  const view = rooms.view(code, tokens[0]);
  assert.deepEqual(view.game!.players[1].resources, [0, 0, 0, 0, 0]);
  assert.deepEqual(view.game!.players[1].cards, []);
  assert.equal(view.hands[1], 10);
  assert.equal(view.points[1], 0);
  assert.equal(view.game!.rng, 0);
  assert.deepEqual(view.game!.deck, []);
  assert.equal(view.deckCount, g.deck.length);
  const own = rooms.view(code, tokens[1]);
  assert.deepEqual(own.game!.players[1].resources, [2, 3, 1, 0, 4]);
  assert.equal(own.points[1], 1);
  for (const token of tokens) {
    assert.ok(!JSON.stringify(view).includes(token));
    assert.ok(
      !readFileSync(join(directory, `${code}.json`), 'utf8').includes(token),
    );
  }
  assert.ok(!JSON.stringify(view).includes('hash'));
});

test('trade offers require recipient consent and survive reconnect without leaking holdings', (t) => {
  const { rooms, code, tokens, send, directory } = table(t);
  send(0, { type: 'start' });
  const g = rooms.get(code).game!;
  g.phase = 'main';
  g.players[0].resources[0] = 1;
  g.players[1].resources[1] = 1;
  const offer = { type: 'barter', give: 0, want: 1, partner: 1 } as const;
  send(0, { type: 'action', action: offer });
  assert.equal(rooms.get(code).game!.players[0].resources[0], 1);
  assert.throws(() => send(2, { type: 'respond', accept: true }), /No offer/);
  assert.throws(
    () => send(0, { type: 'action', action: { type: 'end' } }),
    /trade response/,
  );
  assert.deepEqual(new Rooms(directory).view(code, tokens[1]).offer, offer);
  send(1, { type: 'respond', accept: false });
  assert.equal(rooms.get(code).game!.players[0].resources[0], 1);
  send(0, { type: 'action', action: offer });
  send(1, { type: 'respond', accept: true });
  assert.equal(rooms.get(code).game!.players[0].resources[1], 1);
  assert.equal(rooms.get(code).game!.players[1].resources[0], 1);
  // A request for an absent resource is still offerable, without exposing holdings.
  const absent = { type: 'barter', give: 1, want: 4, partner: 2 } as const;
  assert.ok(
    rooms
      .view(code, tokens[0])
      .actions.some((a) => JSON.stringify(a) === JSON.stringify(absent)),
  );
  send(0, { type: 'action', action: absent });
  assert.throws(() => send(2, { type: 'respond', accept: true }), /not legal/);
  send(0, { type: 'cancel-offer' });
  assert.equal(rooms.get(code).offer, null);
});

test('discard authorization follows the discarding seat, not the turn owner', (t) => {
  const { rooms, code, send } = table(t);
  send(0, { type: 'start' });
  const g = rooms.get(code).game!;
  g.phase = 'discard';
  g.discard = [0, 1, 0, 0];
  g.players[1].resources[0] = 3;
  const action = { type: 'discard', player: 1, resource: 0 } as const;
  assert.throws(() => send(0, { type: 'action', action }), /turn/);
  send(1, { type: 'action', action });
  assert.equal(rooms.get(code).game!.phase, 'raider');
});

test('a complete match stays synchronized and reloads from disk', (t) => {
  const { rooms, code, tokens, send, directory } = table(t);
  send(0, { type: 'start' });
  let moves = 0;
  while (rooms.get(code).game!.phase !== 'over' && moves++ < 6000) {
    const g = rooms.get(code).game!;
    const action = chooseBotAction(g);
    const seat = actorOf(g);
    const view = send(seat, { type: 'action', action });
    for (let other = 0; other < 4; other++) {
      const peer = rooms.view(code, tokens[other]);
      assert.equal(peer.revision, view.revision);
      assert.deepEqual(peer.game!.vertices, view.game!.vertices);
      assert.deepEqual(peer.game!.dice, view.game!.dice);
    }
  }
  assert.equal(rooms.get(code).game!.phase, 'over');
  const reloaded = new Rooms(directory);
  assert.deepEqual(reloaded.get(code), rooms.get(code));
  assert.equal(reloaded.view(code, tokens[3]).seat, 3);
});

test('HTTP clients create, join, start, reject stale moves and restore sessions', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'conquist-http-'));
  const server = createRoomServer(directory);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    rmSync(directory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  async function post(path: string, body: unknown, token?: string) {
    return fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  const created = await post('/api/rooms', { name: 'Host' });
  assert.equal(created.status, 201);
  const host = (await created.json()) as { token: string; view: RoomView };
  const path = `/api/rooms/${host.view.code}`;
  const guests = await Promise.all(
    ['A', 'B', 'C'].map(async (name) => {
      const response = await post(`${path}/join`, { name });
      assert.equal(response.status, 200);
      return (await response.json()) as { token: string; view: RoomView };
    }),
  );
  assert.equal(new Set(guests.map((g) => g.view.seat)).size, 3);
  assert.equal((await fetch(base + path)).status, 401);
  const started = await post(
    `${path}/command`,
    { revision: 3, command: { type: 'start' } },
    host.token,
  );
  const view = (await started.json()) as RoomView;
  assert.equal(started.status, 200);
  const move = {
    revision: view.revision,
    command: { type: 'action', action: view.actions[0] },
  };
  const duplicate = await Promise.all([
    post(`${path}/command`, move, host.token),
    post(`${path}/command`, move, host.token),
  ]);
  assert.deepEqual(
    duplicate.map((r) => r.status).sort((a, b) => a - b),
    [200, 400],
  );
  const restored = await fetch(base + path, {
    headers: { Authorization: `Bearer ${host.token}` },
  });
  assert.equal(((await restored.json()) as RoomView).game!.phase, 'setup-road');
  const crossOrigin = await fetch(base + path, {
    headers: {
      Origin: 'https://untrusted.example',
      Authorization: `Bearer ${host.token}`,
    },
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(
    (await post(`${path}/command`, { revision: 5, command: null }, host.token))
      .status,
    400,
  );
});
