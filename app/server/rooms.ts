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
  legalActions,
  hand,
  score,
  type Action,
  type Game,
} from '../packages/rules/game.ts';

export type Offer = Extract<Action, { type: 'barter' }>;
export type Room = {
  code: string;
  revision: number;
  updated: number;
  seats: { name: string; hash: string }[];
  game: Game | null;
  offer: Offer | null;
  lastMove?: Action['type'] | null;
};
export type RoomView = {
  code: string;
  revision: number;
  seat: number;
  seats: { name: string; online: boolean }[];
  game: Game | null;
  actions: Action[];
  offer: Offer | null;
  hands: number[];
  points: number[];
  deckCount: number;
  lastMove: Action['type'] | null;
};
export type Command =
  | { type: 'start' }
  | { type: 'action'; action: Action }
  | { type: 'respond'; accept: boolean }
  | { type: 'cancel-offer' };
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const actorOf = (g: Game) =>
  g.phase === 'discard' ? g.discard.findIndex((n) => n > 0) : g.active;
const expiry = 7 * 24 * 60 * 60 * 1000;

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
  command(code: string, token: string, revision: number, command: Command) {
    const room = structuredClone(this.get(code));
    const seat = this.seat(room, token);
    if (revision !== room.revision)
      throw new Error('The table changed. Your view is refreshing; try again.');
    if (!command || typeof command !== 'object')
      throw new Error('Invalid command.');
    room.lastMove = null;
    if (command.type === 'start') {
      if (seat !== 0 || room.game || room.seats.length !== 4)
        throw new Error(
          'The host can start once all four players have joined.',
        );
      room.game = createGame(randomInt(1, 0xffffffff), true);
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
      if (command.type === 'respond') {
        if (
          !room.offer ||
          room.offer.partner !== seat ||
          typeof command.accept !== 'boolean'
        )
          throw new Error('No offer is waiting for you.');
        if (command.accept) {
          room.game = apply(g, room.offer);
          room.lastMove = 'barter';
        }
        room.offer = null;
      } else if (command.type === 'cancel-offer') {
        if (seat !== g.active || !room.offer)
          throw new Error('You cannot cancel this offer.');
        room.offer = null;
      } else if (command.type === 'action') {
        if (seat !== actorOf(g)) throw new Error('Wait for your turn.');
        if (room.offer)
          throw new Error('Wait for the trade response or cancel your offer.');
        const a = command.action;
        if (!a || typeof a !== 'object') throw new Error('Invalid move.');
        if (a.type === 'barter') {
          // Offers must not reveal whether the recipient has the requested card.
          if (
            Object.keys(a).length !== 4 ||
            !this.offers(g).some(
              (b) =>
                b.give === a.give &&
                b.want === a.want &&
                b.partner === a.partner,
            )
          )
            throw new Error('Invalid trade offer.');
          room.offer = a;
        } else {
          room.game = apply({ ...g, rng: randomInt(1, 0xffffffff) }, a);
          room.lastMove = a.type;
        }
      } else throw new Error('Unknown command.');
    }
    room.revision++;
    this.save(room);
    return this.view(code, token);
  }
  offers(g: Game): Offer[] {
    const offers: Offer[] = [];
    if (g.phase !== 'main' || g.freeRoads) return offers;
    for (let give = 0; give < 5; give++)
      if (g.players[g.active].resources[give] > 0)
        for (let want = 0; want < 5; want++)
          if (want !== give)
            for (let partner = 0; partner < 4; partner++)
              if (partner !== g.active)
                offers.push({ type: 'barter', give, want, partner });
    return offers;
  }
  view(code: string, token: string): RoomView {
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
      offer: room.offer,
      actions:
        source && actorOf(source) === seat && !room.offer
          ? [
              ...legalActions(source).filter((a) => a.type !== 'barter'),
              ...this.offers(source),
            ]
          : [],
      hands: source?.players.map((_, i) => hand(source, i)) ?? [],
      points:
        source?.players.map((_, i) =>
          score(source, i, i !== seat && source.phase !== 'over'),
        ) ?? [],
      deckCount: source?.deck.length ?? 0,
      lastMove: room.lastMove ?? null,
    };
  }
}
