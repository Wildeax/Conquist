# Conquist: The Ember Isles

A playable local alpha of Conquist. Start a solo match against three bots or pass the device between four players. The game saves in this browser.

## Development

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

## Current implementation

- Original Three.js terrain and pieces, orbit camera, shadows and Lite graphics.
- Seeded 19-tile island, 54 vertices, 72 edges and harbour rates.
- Snake setup, production, building costs, finite bank, trading, Raider and discards.
- Five Fortune card types, Grand Route, High Command and 10-point victory.
- Solo opponents, local pass-and-play, game history, browser saves and rules reference.
- Keyboard-accessible legal location buttons and resource labels.
- Original menu artwork. See [ART.md](ART.md) for its generation prompt and provenance.

## Scope and roadmap

This is a first playable slice, not completion of the full product requirements document. Multiplayer rooms, authoritative server, reconnect, accounts, matchmaking, ranked play, cryptographic dice verification and interactive tutorial are not implemented. The local RNG is deterministic xorshift, not cryptographically secure. Never use this client as an online authority. Local bots have access to full state and must be restricted to redacted state before online play.

Current simplifications include fixed four-player matches, the central Wasteland, unconstrained random terrain/tokens, one-for-one player offers, and a rules guide in place of a scripted tutorial. The tests cover key rules and 100 complete seeded bot matches; they do not establish the PRD's 100% coverage, device performance, browser or launch gates.

The optional WebMCP tools use the same game state and reducer. A compatible WebMCP validation context was not available during initial implementation; live registration and invocation remain unverified.

The lint scope excludes generated, unmodified UI primitives and their generated mobile hook. Node's test runner owns the promises returned by test registration. Application code remains linted and typechecked.

## Architecture

`packages/rules/game.ts` is pure TypeScript with no Three.js, React, clock or I/O dependencies. It holds the local engine and initial bot policy. `components/board.tsx` renders that state and uses dedicated legal target meshes for picking. `app/page.tsx` owns the local game session and UI.

The [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html) and [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) documentation informed the rendering setup.

MIT. See the repository's root license.
