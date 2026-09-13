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

test('public posts collect multiple interested players; owner chooses one and reconnect preserves consent', (t) => {
  const { rooms, code, tokens, send, directory } = table(t);
  send(0, { type: 'start' });
  const g = rooms.get(code).game!;
  g.phase = 'main';
  g.players[0].resources = [2, 0, 0, 0, 0];
  g.players[1].resources = [0, 1, 0, 0, 0];
  g.players[2].resources = [0, 1, 0, 0, 0];
  const post = send(0, { type: 'post-offer', give: 0, want: 1 }).offer!;
  const simultaneousRevision = rooms.get(code).revision;
  rooms.command(code, tokens[1], simultaneousRevision, {
    type: 'respond',
    offerId: post.id,
    accept: true,
  });
  rooms.command(code, tokens[2], simultaneousRevision, {
    type: 'respond',
    offerId: post.id,
    accept: true,
  });
  assert.deepEqual(
    new Rooms(directory).view(code, tokens[0]).offer!.interested,
    [1, 2],
  );
  assert.equal(rooms.get(code).game!.players[0].resources[0], 2);
  assert.ok(rooms.view(code, tokens[0]).actions.some((a) => a.type === 'end'));
  assert.throws(
    () => send(1, { type: 'choose-trader', offerId: post.id, partner: 2 }),
    /Choose a player/,
  );
  send(0, { type: 'choose-trader', offerId: post.id, partner: 2 });
  assert.equal(rooms.get(code).game!.players[2].resources[0], 1);
  assert.equal(rooms.get(code).game!.players[1].resources[1], 1);
  assert.equal(rooms.get(code).tradePost, null);
  assert.throws(
    () => send(0, { type: 'choose-trader', offerId: post.id, partner: 1 }),
    /closed/,
  );
});

test('posts expire on end turn and protect withdrawal, stale IDs, holdings and turn authorization', (t) => {
  const { rooms, code, send } = table(t);
  send(0, { type: 'start' });
  const g = rooms.get(code).game!;
  g.phase = 'main';
  g.players[0].resources = [5, 0, 0, 0, 0];
  g.players[1].resources = [0, 1, 0, 0, 0];
  assert.throws(
    () => send(1, { type: 'post-offer', give: 1, want: 0 }),
    /your turn/,
  );
  assert.throws(
    () => send(0, { type: 'post-offer', give: -1, want: 0 }),
    /different/,
  );
  assert.throws(
    () =>
      send(0, {
        type: 'action',
        action: { type: 'barter', give: 0, want: 1, partner: 1 },
      }),
    /public/,
  );
  const post = send(0, { type: 'post-offer', give: 0, want: 1 }).offer!;
  assert.throws(
    () => send(2, { type: 'respond', offerId: post.id, accept: true }),
    /requested card/,
  );
  assert.throws(
    () => send(1, { type: 'cancel-offer', offerId: post.id }),
    /owner/,
  );
  send(1, { type: 'respond', offerId: post.id, accept: true });
  send(1, { type: 'respond', offerId: post.id, accept: false });
  assert.throws(
    () => send(0, { type: 'choose-trader', offerId: post.id, partner: 1 }),
    /joined/,
  );
  send(0, { type: 'action', action: { type: 'trade', give: 0, want: 2 } });
  assert.equal(rooms.get(code).tradePost!.id, post.id);
  send(0, { type: 'cancel-offer', offerId: post.id });
  const replacement = send(0, { type: 'post-offer', give: 0, want: 1 }).offer!;
  assert.notEqual(replacement.id, post.id);
  assert.throws(
    () => send(1, { type: 'respond', offerId: post.id, accept: true }),
    /closed/,
  );
  send(1, { type: 'respond', offerId: replacement.id, accept: true });
  rooms.get(code).game!.players[0].resources[0] = 0;
  assert.throws(
    () =>
      send(0, { type: 'choose-trader', offerId: replacement.id, partner: 1 }),
    /not legal/,
  );
  send(0, { type: 'action', action: { type: 'end' } });
  assert.equal(rooms.get(code).tradePost, null);
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

test('cosmetic selections are validated, seat-specific and separate from game state', (t) => {
  const { rooms, code, tokens, send, directory } = table(t);
  send(0, { type: 'start' });
  const before = structuredClone(rooms.get(code).game);
  send(1, { type: 'equip-cosmetic', slot: 'profile', id: 'profile.brass' });
  assert.equal(
    new Rooms(directory).view(code, tokens[0]).cosmetics[1].profile,
    'profile.brass',
  );
  assert.equal(
    rooms.view(code, tokens[1]).cosmetics[0].profile,
    'profile.classic',
  );
  assert.deepEqual(rooms.get(code).game, before);
  assert.throws(
    () =>
      send(1, { type: 'equip-cosmetic', slot: 'pieces', id: 'pieces.founder' }),
    /not available/,
  );
  assert.throws(
    () => send(1, { type: 'equip-cosmetic', slot: 'map', id: 'profile.brass' }),
    /not available/,
  );
  assert.throws(
    () => send(1, { type: 'equip-cosmetic', slot: 'profile', id: '__proto__' }),
    /not available/,
  );
});

test('HTTP protocol hides new posts from older tabs and preserves rollback-compatible snapshots', async (t) => {
  const { rooms, code, tokens, send, directory } = table(t);
  send(0, { type: 'start' });
  rooms.get(code).game!.phase = 'main';
  rooms.get(code).game!.players[0].resources[0] = 2;
  send(0, { type: 'post-offer', give: 0, want: 1 });
  const persisted = JSON.parse(
    readFileSync(join(directory, `${code}.json`), 'utf8'),
  );
  assert.equal(persisted.offer, null);
  assert.ok(persisted.tradePost.id);
  const server = createRoomServer(directory);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/rooms/${code}`;
  const old = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens[1]}` },
  });
  const oldView = (await old.json()) as RoomView;
  assert.equal(oldView.offer, null);
  const modern = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokens[1]}`,
      'X-Conquist-Protocol': '2',
    },
  });
  const newView = (await modern.json()) as RoomView;
  assert.equal(newView.offer!.id, persisted.tradePost.id);
  assert.equal(newView.revision, oldView.revision);
  assert.deepEqual(newView.game, oldView.game);
});

test('room chat authenticates authors, survives reload, retries once and never invalidates moves', (t) => {
  const { rooms, code, tokens, send, directory } = table(t);
  send(0, { type: 'start' });
  const before = rooms.view(code, tokens[0]);
  const id = 'chat-message-000001';
  assert.throws(() => rooms.chat(code, 'invalid', 'hello', id), /invalid/);
  assert.throws(() => rooms.chat(code, tokens[0], 'x'.repeat(281), id), /280/);
  assert.throws(() => rooms.chat(code, tokens[0], '\u0000', id), /message/);
  const view = rooms.chat(
    code,
    tokens[1],
    '<img src=x onerror=alert(1)>\u202e',
    id,
  );
  assert.equal(view.chat[0].seat, 1);
  assert.equal(view.chat[0].text, '<img src=x onerror=alert(1)>');
  assert.equal(view.revision, before.revision);
  assert.deepEqual(view.game, rooms.view(code, tokens[1]).game);
  assert.equal(view.lastMove, before.lastMove);
  assert.equal(rooms.chat(code, tokens[1], 'retry', id).chat.length, 1);
  const restored = new Rooms(directory);
  assert.equal(restored.view(code, tokens[0]).chat.length, 1);
  for (let i = 2; i <= 4; i++)
    restored.chat(code, tokens[1], 'hello', `chat-message-00000${i}`);
  assert.throws(
    () =>
      new Rooms(directory).chat(
        code,
        tokens[1],
        'fifth',
        'chat-message-000005',
      ),
    /wait/,
  );
  const other = rooms.create('Other room');
  assert.equal(other.view.chat.length, 0);
  assert.throws(
    () => rooms.chat(other.view.code, tokens[1], 'hello', id),
    /invalid/,
  );
  rooms.command(code, tokens[0], before.revision, {
    type: 'action',
    action: before.actions[0],
  });
});

test('bundled posts exchange exact quantities only with a consenting player', (t) => {
  const { rooms, code, send } = table(t);
  send(0, { type: 'start' });
  const game = rooms.get(code).game!;
  game.phase = 'main';
  game.players[0].resources = [3, 0, 2, 0, 0];
  game.players[1].resources = [0, 2, 0, 1, 0];
  const post = send(0, {
    type: 'post-offer',
    giveCards: [2, 0, 1, 0, 0],
    wantCards: [0, 2, 0, 1, 0],
  }).offer!;
  assert.throws(
    () => send(0, { type: 'choose-trader', offerId: post.id, partner: 1 }),
    /joined/,
  );
  send(1, { type: 'respond', offerId: post.id, accept: true });
  const view = send(0, { type: 'choose-trader', offerId: post.id, partner: 1 });
  assert.deepEqual(rooms.get(code).game!.players[0].resources, [1, 2, 1, 1, 0]);
  assert.deepEqual(rooms.get(code).game!.players[1].resources, [2, 0, 1, 0, 0]);
  assert.equal(view.offer, null);
  assert.equal(view.tradeResult?.status, 'completed');
});
