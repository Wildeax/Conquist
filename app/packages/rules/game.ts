/** Pure, deterministic local rules. No renderer, browser APIs, I/O or clock. */
export const RESOURCES = ['Timber', 'Clay', 'Wool', 'Grain', 'Stone'] as const;
export const COLORS = ['#f2a93b', '#36b8bd', '#df655d', '#aa88e3'];
export type Resource = (typeof RESOURCES)[number];
export type Bag = number[];
export type Card = 'Guard' | 'Charter' | 'Engineers' | 'Bounty' | 'Embargo';
export type Phase =
  | 'setup-settlement'
  | 'setup-road'
  | 'roll'
  | 'main'
  | 'discard'
  | 'raider'
  | 'over';
export interface Vertex {
  id: number;
  x: number;
  z: number;
  hexes: number[];
  edges: number[];
  owner: number | null;
  city: boolean;
  harbour: number | null;
}
export interface Edge {
  id: number;
  a: number;
  b: number;
  owner: number | null;
}
export interface Hex {
  id: number;
  q: number;
  r: number;
  x: number;
  z: number;
  resource: Resource | null;
  number: number;
  vertices: number[];
}
export interface Player {
  name: string;
  resources: Bag;
  cards: { type: Card; turn: number }[];
  guards: number;
  bot: boolean;
}
export interface Game {
  version: 1;
  seed: number;
  rng: number;
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  players: Player[];
  bank: Bag;
  deck: Card[];
  active: number;
  phase: Phase;
  setup: number;
  lastVertex: number;
  raider: number;
  turn: number;
  dice: number[];
  discard: number[];
  resume: 'roll' | 'main';
  played: boolean;
  freeRoads: number;
  route: number | null;
  command: number | null;
  winner: number | null;
  target: number;
  log: string[];
}
export type Action =
  | {
      type: 'settlement' | 'road' | 'city' | 'raider';
      id: number;
      victim?: number;
    }
  | { type: 'roll' | 'end' | 'buy' }
  | { type: 'trade'; give: number; want: number }
  | { type: 'barter'; give: number; want: number; partner: number }
  | { type: 'discard'; resource: number; player: number }
  | { type: 'card'; card: Card; resource?: number; second?: number };
export const COSTS: Record<string, Bag> = {
  road: [1, 1, 0, 0, 0],
  settlement: [1, 1, 1, 1, 0],
  city: [0, 0, 0, 2, 3],
  buy: [0, 0, 1, 1, 1],
};
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
function random(g: { rng: number }) {
  let n = g.rng | 0;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  g.rng = n >>> 0;
  return g.rng / 4294967296;
}
function shuffle<T>(g: { rng: number }, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function createGame(seed = 42, hotseat = false): Game {
  const g: Game = {
    version: 1,
    seed,
    rng: seed >>> 0 || 1,
    hexes: [],
    vertices: [],
    edges: [],
    players: ['You', 'Mira', 'Flint', 'Sable'].map((name, i) => ({
      name: hotseat ? ['Amber', 'Azure', 'Crimson', 'Violet'][i] : name,
      resources: [0, 0, 0, 0, 0],
      cards: [],
      guards: 0,
      bot: !hotseat && i > 0,
    })),
    bank: [19, 19, 19, 19, 19],
    deck: [],
    active: 0,
    phase: 'setup-settlement',
    setup: 0,
    lastVertex: 0,
    raider: 0,
    turn: 1,
    dice: [],
    discard: [0, 0, 0, 0],
    resume: 'main',
    played: false,
    freeRoads: 0,
    route: null,
    command: null,
    winner: null,
    target: 10,
    log: ['Welcome to the Ember Isles. Place your first settlement.'],
  };
  const terrains = shuffle(
    g,
    RESOURCES.flatMap(
      (r, i) => Array(i === 1 || i === 4 ? 3 : 4).fill(r) as Resource[],
    ),
  );
  const numbers = shuffle(
    g,
    [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
  );
  const vertexKeys = new Map<string, number>(),
    edgeKeys = new Map<string, number>();
  for (let r = -2; r <= 2; r++)
    for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) {
      const id = g.hexes.length,
        x = Math.sqrt(3) * (q + r / 2),
        z = 1.5 * r;
      const resource = q === 0 && r === 0 ? null : terrains.pop()!;
      const h: Hex = {
        id,
        q,
        r,
        x,
        z,
        resource,
        number: resource ? numbers.pop()! : 0,
        vertices: [],
      };
      if (!resource) g.raider = id;
      for (let c = 0; c < 6; c++) {
        const a = ((30 + 60 * c) * Math.PI) / 180,
          vx = x + Math.cos(a),
          vz = z + Math.sin(a),
          key = `${vx.toFixed(4)},${vz.toFixed(4)}`.replaceAll(
            '-0.0000',
            '0.0000',
          );
        let vid = vertexKeys.get(key);
        if (vid === undefined) {
          vid = g.vertices.length;
          vertexKeys.set(key, vid);
          g.vertices.push({
            id: vid,
            x: vx,
            z: vz,
            hexes: [],
            edges: [],
            owner: null,
            city: false,
            harbour: null,
          });
        }
        g.vertices[vid].hexes.push(id);
        h.vertices.push(vid);
      }
      for (let c = 0; c < 6; c++) {
        const [a, b] = [h.vertices[c], h.vertices[(c + 1) % 6]].sort(
            (a, b) => a - b,
          ),
          key = `${a}:${b}`;
        let eid = edgeKeys.get(key);
        if (eid === undefined) {
          eid = g.edges.length;
          edgeKeys.set(key, eid);
          g.edges.push({ id: eid, a, b, owner: null });
          g.vertices[a].edges.push(eid);
          g.vertices[b].edges.push(eid);
        }
      }
      g.hexes.push(h);
    }
  const coast = g.edges
    .filter(
      (e) =>
        g.vertices[e.a].hexes.filter((id) => g.vertices[e.b].hexes.includes(id))
          .length === 1,
    )
    .sort(
      (a, b) =>
        Math.atan2(
          g.vertices[a.a].z + g.vertices[a.b].z,
          g.vertices[a.a].x + g.vertices[a.b].x,
        ) -
        Math.atan2(
          g.vertices[b.a].z + g.vertices[b.b].z,
          g.vertices[b.a].x + g.vertices[b.b].x,
        ),
    );
  const ports = shuffle(g, [-1, -1, -1, -1, 0, 1, 2, 3, 4]);
  for (let i = 0; i < 9; i++) {
    const e = coast[Math.floor((i * coast.length) / 9)];
    g.vertices[e.a].harbour = ports[i];
    g.vertices[e.b].harbour = ports[i];
  }
  g.deck = shuffle(g, [
    ...Array(14).fill('Guard'),
    ...Array(5).fill('Charter'),
    'Engineers',
    'Engineers',
    'Bounty',
    'Bounty',
    'Embargo',
    'Embargo',
  ]);
  return g;
}
export function rate(g: Game, p: number, r: number) {
  const ports = g.vertices.filter((v) => v.owner === p).map((v) => v.harbour);
  return ports.includes(r) ? 2 : ports.includes(-1) ? 3 : 4;
}
export function hand(g: Game, p: number) {
  return sum(g.players[p].resources);
}
export function score(g: Game, p: number, publicOnly = false) {
  return (
    g.vertices
      .filter((v) => v.owner === p)
      .reduce((s, v) => s + (v.city ? 2 : 1), 0) +
    (g.route === p ? 2 : 0) +
    (g.command === p ? 2 : 0) +
    (publicOnly
      ? 0
      : g.players[p].cards.filter((c) => c.type === 'Charter').length)
  );
}
export function routeLength(g: Game, p: number): number {
  const roads = g.edges.filter((e) => e.owner === p);
  function walk(v: number, used: Set<number>): number {
    if (
      used.size > 0 &&
      g.vertices[v].owner !== null &&
      g.vertices[v].owner !== p
    )
      return used.size;
    let best = used.size;
    for (const e of roads)
      if (!used.has(e.id) && (e.a === v || e.b === v)) {
        used.add(e.id);
        best = Math.max(best, walk(e.a === v ? e.b : e.a, used));
        used.delete(e.id);
      }
    return best;
  }
  return roads.reduce(
    (best, e) => Math.max(best, walk(e.a, new Set()), walk(e.b, new Set())),
    0,
  );
}
function distance(g: Game, v: Vertex) {
  return (
    v.owner === null &&
    v.edges.every((i) => {
      const e = g.edges[i];
      return g.vertices[e.a === v.id ? e.b : e.a].owner === null;
    })
  );
}
function connected(g: Game, e: Edge, p: number) {
  return [e.a, e.b].some((id) => {
    const v = g.vertices[id];
    return (
      v.owner === p ||
      (v.owner === null && v.edges.some((i) => g.edges[i].owner === p))
    );
  });
}
function afford(g: Game, cost: Bag) {
  return cost.every((n, r) => g.players[g.active].resources[r] >= n);
}
export function legalActions(g: Game): Action[] {
  const p = g.active,
    player = g.players[p],
    out: Action[] = [];
  if (g.phase === 'over') return out;
  if (g.phase === 'setup-settlement')
    return g.vertices
      .filter((v) => distance(g, v))
      .map((v) => ({ type: 'settlement', id: v.id }));
  if (g.phase === 'setup-road')
    return g.edges
      .filter(
        (e) =>
          e.owner === null && (e.a === g.lastVertex || e.b === g.lastVertex),
      )
      .map((e) => ({ type: 'road', id: e.id }));
  if (g.phase === 'discard') {
    const d = g.discard.findIndex((n) => n > 0);
    return g.players[d].resources.flatMap((n, r) =>
      n ? [{ type: 'discard' as const, resource: r, player: d }] : [],
    );
  }
  if (g.phase === 'raider')
    return g.hexes
      .filter((h) => h.id !== g.raider)
      .flatMap((h) => {
        const victims = [
          ...new Set(
            h.vertices
              .map((id) => g.vertices[id].owner)
              .filter((v) => v !== null && v !== p && hand(g, v) > 0),
          ),
        ] as number[];
        return victims.length
          ? victims.map((victim) => ({
              type: 'raider' as const,
              id: h.id,
              victim,
            }))
          : [{ type: 'raider' as const, id: h.id }];
      });
  if (g.phase === 'roll') out.push({ type: 'roll' });
  const roads = g.edges.filter((e) => e.owner === p).length;
  if (g.phase === 'main') {
    if (roads < 15 && (g.freeRoads > 0 || afford(g, COSTS.road)))
      for (const e of g.edges)
        if (e.owner === null && connected(g, e, p))
          out.push({ type: 'road', id: e.id });
    if (g.freeRoads > 0 && out.length) return out;
    if (
      g.vertices.filter((v) => v.owner === p && !v.city).length < 5 &&
      afford(g, COSTS.settlement)
    )
      for (const v of g.vertices)
        if (distance(g, v) && v.edges.some((id) => g.edges[id].owner === p))
          out.push({ type: 'settlement', id: v.id });
    if (
      g.vertices.filter((v) => v.owner === p && v.city).length < 4 &&
      afford(g, COSTS.city)
    )
      for (const v of g.vertices)
        if (v.owner === p && !v.city) out.push({ type: 'city', id: v.id });
    if (g.deck.length && afford(g, COSTS.buy)) out.push({ type: 'buy' });
    for (let give = 0; give < 5; give++)
      for (let want = 0; want < 5; want++)
        if (give !== want) {
          if (player.resources[give] >= rate(g, p, give) && g.bank[want] > 0)
            out.push({ type: 'trade', give, want });
          if (player.resources[give] > 0)
            g.players.forEach((other, partner) => {
              if (partner !== p && other.resources[want] > 0)
                out.push({ type: 'barter', give, want, partner });
            });
        }
    out.push({ type: 'end' });
  }
  if (!g.played)
    for (const c of player.cards.filter(
      (c) => c.turn < g.turn && c.type !== 'Charter',
    )) {
      if (c.type === 'Bounty') {
        for (let r = 0; r < 5; r++)
          for (let s = r; s < 5; s++)
            if (g.bank[r] > 0 && g.bank[s] > (r === s ? 1 : 0))
              out.push({ type: 'card', card: c.type, resource: r, second: s });
      } else if (c.type === 'Embargo') {
        for (let r = 0; r < 5; r++)
          out.push({ type: 'card', card: c.type, resource: r });
      } else if (
        c.type !== 'Engineers' ||
        (roads < 15 &&
          g.edges.some((e) => e.owner === null && connected(g, e, p)))
      )
        out.push({ type: 'card', card: c.type });
    }
  return out;
}
function same(a: Action, b: Action) {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([k, v]) => b[k as keyof Action] === v)
  );
}
function note(g: Game, s: string) {
  g.log = [s, ...g.log].slice(0, 70);
}
function take(g: Game, p: number, r: number, n = 1) {
  const amount = Math.min(n, g.bank[r]);
  g.bank[r] -= amount;
  g.players[p].resources[r] += amount;
}
function pay(g: Game, cost: Bag) {
  cost.forEach((n, r) => {
    g.players[g.active].resources[r] -= n;
    g.bank[r] += n;
  });
}
export function apply(state: Game, action: Action): Game {
  if (!legalActions(state).some((a) => same(a, action)))
    throw new Error('That move is not legal right now.');
  const g: Game = JSON.parse(JSON.stringify(state)),
    p = g.active,
    player = g.players[p],
    name = player.name;
  const a = action;
  if (a.type === 'settlement') {
    g.vertices[a.id].owner = p;
    if (g.phase === 'setup-settlement') {
      if (g.setup >= 4)
        for (const id of g.vertices[a.id].hexes) {
          const r = RESOURCES.indexOf(g.hexes[id].resource!);
          if (r >= 0) take(g, p, r);
        }
      g.lastVertex = a.id;
      g.phase = 'setup-road';
    } else pay(g, COSTS.settlement);
    note(g, `${name} founded a settlement.`);
  } else if (a.type === 'road') {
    g.edges[a.id].owner = p;
    if (g.phase === 'setup-road') {
      g.setup++;
      if (g.setup === 8) {
        g.active = 0;
        g.phase = 'roll';
        note(g, 'The island is settled. Roll the dice to begin.');
      } else {
        g.active = [0, 1, 2, 3, 3, 2, 1, 0][g.setup];
        g.phase = 'setup-settlement';
      }
    } else if (g.freeRoads > 0) g.freeRoads--;
    else pay(g, COSTS.road);
    note(g, `${name} built a road.`);
  } else if (a.type === 'city') {
    pay(g, COSTS.city);
    g.vertices[a.id].city = true;
    note(g, `${name} raised a city.`);
  } else if (a.type === 'roll') {
    g.dice = [1 + Math.floor(random(g) * 6), 1 + Math.floor(random(g) * 6)];
    const roll = sum(g.dice);
    note(g, `${name} rolled ${roll}.`);
    g.phase = 'main';
    if (roll === 7) {
      g.discard = g.players.map((_, i) =>
        hand(g, i) > 7 ? Math.floor(hand(g, i) / 2) : 0,
      );
      g.phase = g.discard.some(Boolean) ? 'discard' : 'raider';
      g.resume = 'main';
    } else
      for (let r = 0; r < 5; r++) {
        const due = g.players.map((_, owner) =>
          g.hexes
            .filter(
              (h) =>
                h.number === roll &&
                h.resource === RESOURCES[r] &&
                h.id !== g.raider,
            )
            .reduce(
              (s, h) =>
                s +
                h.vertices.reduce(
                  (n, id) =>
                    n +
                    (g.vertices[id].owner === owner
                      ? g.vertices[id].city
                        ? 2
                        : 1
                      : 0),
                  0,
                ),
              0,
            ),
        );
        if (sum(due) <= g.bank[r] || due.filter(Boolean).length === 1)
          due.forEach((n, owner) => take(g, owner, r, n));
      }
  } else if (a.type === 'end') {
    g.active = (p + 1) % 4;
    g.turn++;
    g.phase = 'roll';
    g.played = false;
    g.freeRoads = 0;
  } else if (a.type === 'trade') {
    const n = rate(g, p, a.give);
    player.resources[a.give] -= n;
    g.bank[a.give] += n;
    take(g, p, a.want);
    note(
      g,
      `${name} traded ${n} ${RESOURCES[a.give]} for 1 ${RESOURCES[a.want]}.`,
    );
  } else if (a.type === 'barter') {
    const other = g.players[a.partner];
    player.resources[a.give]--;
    other.resources[a.give]++;
    other.resources[a.want]--;
    player.resources[a.want]++;
    note(g, `${name} traded with ${other.name}.`);
  } else if (a.type === 'discard') {
    g.players[a.player].resources[a.resource]--;
    g.bank[a.resource]++;
    g.discard[a.player]--;
    if (!g.discard.some(Boolean)) g.phase = 'raider';
  } else if (a.type === 'raider') {
    g.raider = a.id;
    if (a.victim !== undefined) {
      const victim = g.players[a.victim];
      let n = Math.floor(random(g) * sum(victim.resources));
      let r = 0;
      while (n >= victim.resources[r]) {
        n -= victim.resources[r];
        r++;
      }
      victim.resources[r]--;
      player.resources[r]++;
      note(g, `${name} moved the Raider and took a card from ${victim.name}.`);
    } else note(g, `${name} moved the Raider.`);
    g.phase = g.resume;
    g.resume = 'main';
  } else if (a.type === 'buy') {
    pay(g, COSTS.buy);
    player.cards.push({ type: g.deck.pop()!, turn: g.turn });
    note(g, `${name} drew a Fortune card.`);
  } else if (a.type === 'card') {
    player.cards.splice(
      player.cards.findIndex((c) => c.type === a.card && c.turn < g.turn),
      1,
    );
    g.played = true;
    note(g, `${name} played ${a.card}.`);
    if (a.card === 'Guard') {
      player.guards++;
      g.resume = g.phase as 'main' | 'roll';
      g.phase = 'raider';
    }
    if (a.card === 'Engineers') {
      g.freeRoads = 2;
      if (g.phase === 'roll') {
        g.phase = 'main';
        g.resume = 'roll';
      }
    }
    if (a.card === 'Bounty') {
      take(g, p, a.resource!);
      take(g, p, a.second!);
    }
    if (a.card === 'Embargo')
      g.players.forEach((other, i) => {
        if (i !== p) {
          player.resources[a.resource!] += other.resources[a.resource!];
          other.resources[a.resource!] = 0;
        }
      });
  }
  if (
    g.freeRoads > 0 &&
    (g.edges.filter((e) => e.owner === p).length >= 15 ||
      !g.edges.some((e) => e.owner === null && connected(g, e, p)))
  )
    g.freeRoads = 0;
  if (g.freeRoads === 0 && g.resume === 'roll' && g.phase === 'main') {
    g.phase = 'roll';
    g.resume = 'main';
  }
  if (a.type === 'road' || a.type === 'settlement') {
    const lengths = g.players.map((_, i) => routeLength(g, i)),
      max = Math.max(...lengths),
      leaders = lengths.flatMap((n, i) => (n === max ? [i] : []));
    g.route =
      max < 5
        ? null
        : leaders.length === 1
          ? leaders[0]
          : g.route !== null && leaders.includes(g.route)
            ? g.route
            : null;
  }
  if (
    player.guards >= 3 &&
    (g.command === null || player.guards > g.players[g.command].guards)
  )
    g.command = p;
  for (let i = 0; i < 4; i++)
    if (score(g, i) >= g.target) {
      g.winner = i;
      g.phase = 'over';
      note(g, `${g.players[i].name} conquered the Ember Isles!`);
      break;
    }
  return g;
}
export function vertexValue(g: Game, id: number) {
  const v = g.vertices[id];
  return (
    v.hexes.reduce(
      (s, h) =>
        s + (g.hexes[h].number ? 6 - Math.abs(7 - g.hexes[h].number) : 0),
      0,
    ) + (v.harbour === null ? 0 : 1.4)
  );
}
function potential(g: Game, edge: number, _p: number) {
  const e = g.edges[edge];
  let best = 0;
  for (const v of g.vertices)
    if (distance(g, v)) {
      const d = Math.min(
        Math.hypot(v.x - g.vertices[e.a].x, v.z - g.vertices[e.a].z),
        Math.hypot(v.x - g.vertices[e.b].x, v.z - g.vertices[e.b].z),
      );
      best = Math.max(best, vertexValue(g, v.id) * 2 - d * 5);
    }
  return best;
}
export function chooseBotAction(g: Game): Action {
  const actions = legalActions(g),
    p = g.active,
    res = g.players[p].resources;
  if (!actions.length) throw new Error('No legal actions');
  if (g.phase === 'discard')
    return actions.sort((a, b) =>
      a.type === 'discard' && b.type === 'discard'
        ? g.players[b.player].resources[b.resource] -
          g.players[a.player].resources[a.resource]
        : 0,
    )[0];
  if (g.phase === 'raider')
    return actions.sort((a, b) => {
      const value = (a: Action) =>
        a.type === 'raider'
          ? g.hexes[a.id].vertices.reduce((s, id) => {
              const v = g.vertices[id];
              return (
                s +
                (v.owner === p
                  ? -20
                  : v.owner !== null
                    ? vertexValue(g, id)
                    : 0)
              );
            }, 0) + (a.victim === undefined ? 0 : 4)
          : 0;
      return value(b) - value(a);
    })[0];
  if (g.phase === 'setup-settlement')
    return actions.sort((a, b) =>
      'id' in a && 'id' in b ? vertexValue(g, b.id) - vertexValue(g, a.id) : 0,
    )[0];
  if (g.phase === 'setup-road')
    return actions.sort((a, b) =>
      'id' in a && 'id' in b
        ? potential(g, b.id, p) - potential(g, a.id, p)
        : 0,
    )[0];
  if (g.phase === 'roll') return { type: 'roll' };
  const buildings = actions.filter(
    (a) => a.type === 'city' || a.type === 'settlement',
  );
  if (buildings.length)
    return buildings.sort((a, b) =>
      'id' in a && 'id' in b
        ? vertexValue(g, b.id) +
          (b.type === 'city' ? 3 : 0) -
          vertexValue(g, a.id) -
          (a.type === 'city' ? 3 : 0)
        : 0,
    )[0];
  const card = actions.find((a) => a.type === 'card');
  if (card) return card;
  const canSettle = g.vertices.some(
    (v) => distance(g, v) && v.edges.some((i) => g.edges[i].owner === p),
  );
  const ownSettlements = g.vertices.some((v) => v.owner === p && !v.city);
  const wanted = canSettle
    ? COSTS.settlement
    : ownSettlements && (res[4] >= 2 || res[3] >= 2)
      ? COSTS.city
      : g.edges.filter((e) => e.owner === p).length < 15
        ? COSTS.road
        : COSTS.buy;
  const trade = actions.find(
    (a) =>
      a.type === 'trade' &&
      res[a.want] < wanted[a.want] &&
      res[a.give] - rate(g, p, a.give) >= wanted[a.give],
  );
  if (trade) return trade;
  const roads = actions.filter((a) => a.type === 'road');
  if (roads.length)
    return roads.sort((a, b) =>
      'id' in a && 'id' in b
        ? potential(g, b.id, p) - potential(g, a.id, p)
        : 0,
    )[0];
  const buy = actions.find((a) => a.type === 'buy');
  if (buy) return buy;
  const extraTrade = actions.find(
    (a) => a.type === 'trade' && res[a.want] < wanted[a.want],
  );
  if (extraTrade) return extraTrade;
  return actions.find((a) => a.type === 'end') ?? actions[0];
}
