import {
  offerCards,
  ownsCards,
  validateExchange,
  exchange,
} from '../packages/rules/trading.ts';
import {
  canEquip,
  normalizeLoadout,
  type Loadout,
  type CosmeticSlot,
} from '../lib/cosmetics.ts';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  apply,
  createGame,
  chooseBotAction,
  legalActions,
  hand,
  score,
  type Action,
  type Game,
} from '../packages/rules/game.ts';

export type Offer = {
  id: string;
  owner: number;
  turn: number;
  give: number;
  want: number;
  interested: number[];
  giveCards?: number[];
  wantCards?: number[];
};
export type ChatMessage = {
  id: number;
  seat: number;
  text: string;
  at: number;
  clientId: string;
};
export type TradeResult = {
  id: string;
  status: 'completed' | 'cancelled' | 'expired';
  owner: number;
  partner?: number;
};
export type Room = {
  code: string;
  revision: number;
  updated: number;
  seats: { name: string; hash: string; cosmetics?: Loadout }[];
  game: Game | null;
  tradePost?: Offer | null;
  chat?: ChatMessage[];
  chatRevision?: number;
  tradeResult?: TradeResult;
  /** Kept empty so older servers can safely reload snapshots on rollback. */
  offer: null;
  lastMove?: Action['type'] | null;
  turnSeconds?: number;
  turnDeadline?: number | null;
};
export type RoomView = {
  code: string;
  revision: number;
  seat: number;
  seats: { name: string; online: boolean }[];
  game: Game | null;
  actions: Action[];
  offer: Offer | null;
  chat: ChatMessage[];
  chatRevision: number;
  tradeResult?: TradeResult;
  hands: number[];
  points: number[];
  deckCount: number;
  cosmetics: Loadout[];
  lastMove: Action['type'] | null;
  turnSeconds: number;
  turnDeadline: number | null;
  serverNow: number;
};
export type Command =
  | { type: 'start'; mapId?: string; turnSeconds?: number }
  | { type: 'equip-cosmetic'; slot: CosmeticSlot; id: string }
  | { type: 'action'; action: Action }
  | {
      type: 'post-offer';
      give?: number;
      want?: number;
      giveCards?: number[];
      wantCards?: number[];
    }
  | { type: 'respond'; offerId: string; accept: boolean }
  | { type: 'choose-trader'; offerId: string; partner: number }
  | { type: 'cancel-offer'; offerId: string };
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const actorOf = (g: Game) =>
  g.phase === 'discard' ? g.discard.findIndex((n) => n > 0) : g.active;
const expiry = 7 * 24 * 60 * 60 * 1000;
const allowedTurnSeconds = new Set([60, 90, 120, 180]);
const normalizeTurnSeconds = (value: unknown) =>
  typeof value === 'number' && allowedTurnSeconds.has(value) ? value : 90;
const turnKey = (game: Game) =>
  game.phase.startsWith('setup') ? `setup:${game.setup}` : `turn:${game.turn}`;

/** One authoritative process. Every acknowledged mutation is atomically saved. */
export class Rooms {
  rooms = new Map<string, Room>();
  presence = new Map<string, number>();
  directory: string;
  constructor(directory: string) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
    for (const file of readdirSync(directory).filter((f) =>
      /^[A-F0-9]{8}\.json$/.test(f),
    )) {
      const room = JSON.parse(
        readFileSync(join(directory, file), 'utf8'),
      ) as Room;
      // Old directed offers are cancelled when upgrading a saved room.
      room.offer = null;
      room.tradePost ??= null;
      room.turnSeconds = normalizeTurnSeconds(room.turnSeconds);
      room.turnDeadline ??=
        room.game && room.game.phase !== 'over'
          ? Date.now() + room.turnSeconds * 1000
          : null;
      if (
        room.tradePost &&
        (!room.game ||
          room.game.turn !== room.tradePost.turn ||
          room.game.active !== room.tradePost.owner ||
          room.game.phase === 'over')
      )
        room.tradePost = null;
      if (Date.now() - room.updated < expiry) this.rooms.set(room.code, room);
      else unlinkSync(join(directory, file));
    }
  }
  save(room: Room) {
    room.updated = Date.now();
    const path = join(this.directory, `${room.code}.json`);
    writeFileSync(`${path}.tmp`, JSON.stringify(room), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
    this.rooms.set(room.code, room);
  }
  resetDeadline(room: Room) {
    room.turnDeadline =
      room.game && room.game.phase !== 'over'
        ? Date.now() + normalizeTurnSeconds(room.turnSeconds) * 1000
        : null;
  }
  expireTurn(code: string) {
    const source = this.get(code);
    if (
      !source.game ||
      source.game.phase === 'over' ||
      !source.turnDeadline ||
      Date.now() < source.turnDeadline
    )
      return;
    const room = structuredClone(source);
    const first = room.game!;
    const key = turnKey(first);
    const name = first.players[first.active].name;
    let game: Game = first;
    let steps = 0;
    while (game.phase !== 'over' && turnKey(game) === key && steps++ < 128) {
      const action =
        legalActions(game).find((candidate) => candidate.type === 'end') ??
        chooseBotAction(game);
      game = apply({ ...game, rng: randomInt(1, 0xffffffff) }, action);
      room.lastMove = action.type;
    }
    game.log = [`${name}'s turn expired.`, ...game.log].slice(0, 70);
    room.game = game;
    if (room.tradePost) {
      room.tradeResult = {
        id: room.tradePost.id,
        status: 'expired',
        owner: room.tradePost.owner,
      };
      room.tradePost = null;
    }
    room.revision++;
    this.resetDeadline(room);
    this.save(room);
  }
  name(value: unknown) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 24)
      throw new Error('Choose a name between 1 and 24 characters.');
    return value.trim();
  }
  create(name: unknown) {
    for (const [code, room] of this.rooms)
      if (Date.now() - room.updated >= expiry) {
        unlinkSync(join(this.directory, `${code}.json`));
        this.rooms.delete(code);
        for (let seat = 0; seat < 4; seat++)
          this.presence.delete(`${code}:${seat}`);
      }
    if (this.rooms.size >= 1000)
      throw new Error('The server is full. Please try again later.');
    let code: string;
    do {
      code = randomBytes(4).toString('hex').toUpperCase();
    } while (this.rooms.has(code));
    const token = randomBytes(32).toString('hex');
    const room: Room = {
      code,
      revision: 0,
      updated: Date.now(),
      seats: [{ name: this.name(name), hash: hash(token) }],
      game: null,
      offer: null,
      tradePost: null,
      turnSeconds: 90,
      turnDeadline: null,
    };
    this.save(room);
    return { token, view: this.view(code, token) };
  }
  get(code: string) {
    const room = this.rooms.get(code);
    if (!room || Date.now() - room.updated >= expiry)
      throw new Error('Room not found or expired.');
    return room;
  }
  join(code: string, name: unknown) {
    const room = structuredClone(this.get(code));
    if (room.game || room.seats.length >= 4)
      throw new Error('This room is full or already playing.');
    const token = randomBytes(32).toString('hex');
    room.seats.push({ name: this.name(name), hash: hash(token) });
    room.revision++;
    this.save(room);
    return { token, view: this.view(code, token) };
  }
  seat(room: Room, token: string) {
    const seat = room.seats.findIndex((s) => s.hash === hash(token));
    if (seat < 0)
      throw new Error('Your room session is invalid. Rejoin from the invite.');
    this.presence.set(`${room.code}:${seat}`, Date.now());
    return seat;
  }
  chat(code: string, token: string, text: unknown, clientId: unknown) {
    const room = structuredClone(this.get(code));
    const seat = this.seat(room, token);
    if (typeof clientId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(clientId))
      throw new Error('Invalid message identifier.');
    if (room.chat?.some((m) => m.seat === seat && m.clientId === clientId))
      return this.view(code, token);
    if (typeof text !== 'string' || !text.trim() || text.length > 280)
      throw new Error('Messages must contain 1 to 280 characters.');
    const clean = text
      // Strip control and directional formatting characters from room messages.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) throw new Error('Write a message first.');
    const now = Date.now();
    if (
      (room.chat ?? []).filter((m) => m.seat === seat && now - m.at < 10000)
        .length >= 4
    )
      throw new Error(
        'Please wait a few seconds before sending another message.',
      );
    room.chatRevision = (room.chatRevision ?? 0) + 1;
    room.chat = [
      ...(room.chat ?? []),
      { id: room.chatRevision, seat, text: clean, at: now, clientId },
    ].slice(-100);
    this.save(room);
    return this.view(code, token);
  }
  command(code: string, token: string, revision: number, command: Command) {
    this.seat(this.get(code), token);
    this.expireTurn(code);
    const room = structuredClone(this.get(code));
    const seat = this.seat(room, token);
    // Interest is idempotent and tied to an immutable post ID, so peers may join concurrently.
    const joining =
      command?.type === 'respond' &&
      Number.isInteger(revision) &&
      revision <= room.revision;
    if (revision !== room.revision && !joining)
      throw new Error('The table changed. Your view is refreshing; try again.');
    if (!command || typeof command !== 'object')
      throw new Error('Invalid command.');
    room.lastMove = null;
    if (command.type === 'equip-cosmetic') {
      // Anonymous room sessions may equip included items only. Never trust client ownership.
      if (!canEquip(command.id, command.slot))
        throw new Error('This cosmetic is not available to your session.');
      room.seats[seat].cosmetics = normalizeLoadout({
        ...room.seats[seat].cosmetics,
        [command.slot]: command.id,
      });
    } else if (command.type === 'start') {
      if (seat !== 0 || room.game || room.seats.length !== 4)
        throw new Error(
          'The host can start once all four players have joined.',
        );
      if (
        command.turnSeconds !== undefined &&
        !allowedTurnSeconds.has(command.turnSeconds)
      )
        throw new Error('Choose an available turn time.');
      room.game = createGame(randomInt(1, 0xffffffff), true, command.mapId);
      room.turnSeconds = normalizeTurnSeconds(command.turnSeconds);
      this.resetDeadline(room);
      room.game.players.forEach((p, i) => {
        p.name = room.seats[i].name;
      });
      // Hide the deck order independently of the public island seed.
      for (let i = room.game.deck.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [room.game.deck[i], room.game.deck[j]] = [
          room.game.deck[j],
          room.game.deck[i],
        ];
      }
    } else {
      const g = room.game;
      if (!g) throw new Error('The match has not started.');
      if (command.type === 'post-offer') {
        if (seat !== g.active || g.phase !== 'main' || g.freeRoads)
          throw new Error('Post a trade during your turn after rolling.');
        const giveCards =
          command.giveCards ??
          Array.from({ length: 5 }, (_, i) => (i === command.give ? 1 : 0));
        const wantCards =
          command.wantCards ??
          Array.from({ length: 5 }, (_, i) => (i === command.want ? 1 : 0));
        validateExchange(giveCards, wantCards);
        if (!ownsCards(g.players[seat].resources, giveCards))
          throw new Error('Choose different resources and cards you own.');
        const give = giveCards.findIndex((n) => n > 0),
          want = wantCards.findIndex((n) => n > 0);
        if (room.tradePost)
          throw new Error('Cancel your current post before creating another.');
        room.tradePost = {
          id: randomBytes(12).toString('hex'),
          owner: seat,
          turn: g.turn,
          give,
          want,
          interested: [],
          giveCards,
          wantCards,
        };
      } else if (
        command.type === 'respond' ||
        command.type === 'choose-trader' ||
        command.type === 'cancel-offer'
      ) {
        const offer = room.tradePost;
        if (
          !offer ||
          command.offerId !== offer.id ||
          offer.turn !== g.turn ||
          offer.owner !== g.active
        )
          throw new Error('This trade post has closed.');
        if (command.type === 'cancel-offer') {
          if (seat !== offer.owner)
            throw new Error('Only the owner can cancel this post.');
          room.tradeResult = {
            id: offer.id,
            status: 'cancelled',
            owner: offer.owner,
          };
          room.tradePost = null;
        } else if (command.type === 'respond') {
          if (seat === offer.owner || typeof command.accept !== 'boolean')
            throw new Error('Only another player can join this trade.');
          if (
            command.accept &&
            !ownsCards(g.players[seat].resources, offerCards(offer).want)
          )
            throw new Error('You need the requested card to join this trade.');
          offer.interested = offer.interested.filter((i) => i !== seat);
          if (command.accept) offer.interested.push(seat);
        } else {
          if (
            seat !== offer.owner ||
            !offer.interested.includes(command.partner)
          )
            throw new Error('Choose a player who joined your trade.');
          const cards = offerCards(offer);
          room.game = exchange(g, command.partner, cards.give, cards.want);
          room.tradeResult = {
            id: offer.id,
            status: 'completed',
            owner: offer.owner,
            partner: command.partner,
          };
          room.lastMove = 'barter';
          room.tradePost = null;
        }
      } else if (command.type === 'action') {
        if (seat !== actorOf(g)) throw new Error('Wait for your turn.');
        const a = command.action;
        if (!a || typeof a !== 'object') throw new Error('Invalid move.');
        if (a.type === 'barter')
          throw new Error('Refresh the page to use public trade posts.');
        const previousTurn = turnKey(g);
        room.game = apply({ ...g, rng: randomInt(1, 0xffffffff) }, a);
        room.lastMove = a.type;
        // Keep posts through builds and temporary card phases, but never across turns.
        const next = room.game;
        if (
          room.tradePost &&
          (next.turn !== room.tradePost.turn ||
            next.active !== room.tradePost.owner ||
            next.phase === 'over')
        ) {
          room.tradeResult = {
            id: room.tradePost.id,
            status: 'expired',
            owner: room.tradePost.owner,
          };
          room.tradePost = null;
        }
        if (room.tradePost)
          room.tradePost.interested = room.tradePost.interested.filter((i) =>
            ownsCards(
              next.players[i].resources,
              offerCards(room.tradePost!).want,
            ),
          );
        if (turnKey(next) !== previousTurn) this.resetDeadline(room);
      } else throw new Error('Unknown command.');
    }
    room.revision++;
    this.save(room);
    return this.view(code, token);
  }
  view(code: string, token: string): RoomView {
    this.seat(this.get(code), token);
    this.expireTurn(code);
    const room = this.get(code),
      seat = this.seat(room, token),
      source = room.game;
    const game = source ? structuredClone(source) : null;
    if (game) {
      game.rng = 0;
      game.deck = [];
      game.players.forEach((p, i) => {
        if (i !== seat) {
          p.resources = [0, 0, 0, 0, 0];
          p.cards = [];
        }
      });
    }
    return {
      code,
      revision: room.revision,
      seat,
      seats: room.seats.map((s, i) => ({
        name: s.name,
        online: Date.now() - (this.presence.get(`${code}:${i}`) ?? 0) < 15000,
      })),
      game,
      offer: room.tradePost ?? null,
      chat: room.chat ?? [],
      chatRevision: room.chatRevision ?? 0,
      tradeResult: room.tradeResult,
      actions:
        source && actorOf(source) === seat
          ? legalActions(source).filter((a) => a.type !== 'barter')
          : [],
      hands: source?.players.map((_, i) => hand(source, i)) ?? [],
      points:
        source?.players.map((_, i) =>
          score(source, i, i !== seat && source.phase !== 'over'),
        ) ?? [],
      deckCount: source?.deck.length ?? 0,
      cosmetics: room.seats.map((s) => normalizeLoadout(s.cosmetics)),
      lastMove: room.lastMove ?? null,
      turnSeconds: normalizeTurnSeconds(room.turnSeconds),
      turnDeadline: room.turnDeadline ?? null,
      serverNow: Date.now(),
    };
  }
}
