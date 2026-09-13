# Conquist: The Ember Isles

A playable alpha of Conquist. Create a private room for four friends, start a solo match against three bots, or pass the device between four players. Online matches save on the room server; local matches save in this browser.

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

Run `npm run rooms` in a second terminal for multiplayer. Vite forwards `/api` to the room service on port 3102. Create a room, share the link or eight-character code, then let the host start after all four players join. Each tab keeps its own seat credential in session storage and restores it on reload. To simulate different players locally, use separate tabs opened independently or separate browser profiles. Duplicating a tab can copy its existing session.

The Node room service is for the VPS deployment. A standalone Sites/Workers build does not include this service. Use the [VPS setup](../deploy/README.md) to host online rooms.

## Current implementation

- Textured Three.js terrain, seven original model types with GLB exports, animated ocean, wind, smoke, ships and birds; orbit camera, shadows and Lite graphics.
- Portrait banners, illustrated resource cards, compact fantasy HUD, layered action sounds and ocean ambience with volume controls.
- Seeded 19-tile island, 54 vertices, 72 edges and harbour rates.
- Snake setup, production, building costs, finite bank, trading, Raider and discards.
- Five Fortune card types, Grand Route, High Command and 10-point victory.
- Solo opponents, local pass-and-play, game history, browser saves and rules reference.
- Private four-player rooms, invite links, connection indicators, server-validated moves, hidden hands, trade consent and automatic reconnect in the same tab.
- Bot pauses vary by action, with longer placement decisions and specific thinking messages. Local bots pause while a dialog or the room menu is open.
- Keyboard-accessible legal location buttons and resource labels.
- Original menu artwork. See [ART.md](ART.md) for its generation prompt and provenance.

## Scope and roadmap

This is a playable slice, not completion of the full product requirements document. Accounts, matchmaking, ranked play, cryptographic dice verification and the interactive tutorial are not implemented. Online rooms require four humans, with no replacement bots or turn timeout. A disconnected player keeps their seat; play waits when that player's input is required. Forgetting or closing a tab can lose its credential, so keep the tab open during a match.

The local RNG is deterministic xorshift. Online state and moves belong to the server, which supplies fresh secret randomness for each action and independently shuffles the Fortune deck. This prevents predicting the next roll from the public island seed, but is not a publicly verifiable dice protocol. Local bots have full state; online players receive redacted views and a server-generated action list.

Rooms poll once per second and reconnect after transient failures. Each accepted mutation writes an atomic JSON snapshot under `.rooms/`, or `CONQUIST_DATA_DIR`. Run one room-service process per data directory. Rooms expire after seven days without a game or lobby mutation, and the service caps stored rooms at 1,000. This is a small private-room service, not a horizontally scaled matchmaking system.

Current simplifications include fixed four-player matches, the central Wasteland, unconstrained random terrain/tokens, one-for-one player offers, and a rules guide in place of a scripted tutorial. The tests cover key rules and 100 complete seeded bot matches; they do not establish the PRD's 100% coverage, device performance, browser or launch gates.

The optional WebMCP tools use the same game state and reducer. A compatible WebMCP validation context was not available during initial implementation; live registration and invocation remain unverified.

The lint scope excludes generated, unmodified UI primitives and their generated mobile hook. Node's test runner owns the promises returned by test registration. Application code remains linted and typechecked.

## Architecture

`packages/rules/game.ts` is pure TypeScript with no Three.js, React, clock or I/O dependencies. It holds the shared engine and initial bot policy. `packages/rules/bot-presentation.ts` supplies presentation delays independently of the game RNG. `components/board.tsx` renders state and uses dedicated legal target meshes for picking. `app/page.tsx` owns the local game session and UI; `lib/use-online-room.ts` supplies authoritative online snapshots.

`server/rooms.ts` owns seat authentication, revisions, turn authorization, trade consent, private views and disk snapshots. Credentials are random bearer tokens; only their SHA-256 hashes are stored on the server. `server/index.ts` exposes bounded JSON HTTP endpoints with same-origin checks. No client chooses dice results or submits replacement game state. The service uses Node built-ins and the shared rules without installing the frontend dependency tree.

Room tests cover four HTTP clients, racing duplicate moves, seat authorization, discard ownership, trade consent, hidden information, a complete synchronized match and restoration from disk. The full suite also runs the existing 100 seeded local matches. Browser interaction and audio quality still need a manual playthrough.

The [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html) and [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) documentation informed the rendering setup.

MIT. See the repository's root license.

## Game feedback

Settings → Game effects offers Full, Subtle and Off. The choice is saved on this device; audio has its own controls. Operating-system reduced motion disables travel, piece motion and dice motion. Lite graphics skips resource flights.

Feedback is client-side presentation. `packages/rules/feedback.ts` derives resource gains, losses, construction and turn cues from adjacent acknowledged snapshots without changing game state. Repeated polls, initial loads and skipped revisions do not replay effects. Resource effects use only the viewer's hand; pass-and-play handoffs never compare different players' cards.

`lib/use-game-feedback.ts` coordinates scoped GSAP timelines and synthesized audio. `lib/scene/feedback.ts` handles piece settling, construction rings and resource packets projected from producing tiles. Flights are capped at six packets per event. Timelines and temporary objects are removed on the next move, preference changes, tab visibility changes or scene teardown. Existing pieces retain their meshes while legal targets change, so selecting another action does not restart their entrance animation.
