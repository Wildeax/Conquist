# Cosmetics foundation

Cosmetics use permanent catalog IDs and three independent slots: map, pieces and profile. `app/lib/cosmetics.ts` owns catalog metadata, default loadouts and entitlement validation. Gameplay state and the rules engine never store or read cosmetics.

Included today: Ember Isles and Moonlit sea ocean themes, classic pieces, Explorer and Brass compass profile frames. The Founder collection is an unavailable catalog entry to reserve the future premium path; it has no checkout or delivered assets yet. Unknown IDs, mismatched slots and unavailable items fall back to defaults or are rejected by the room API. Assets must be selected from the application catalog, never arbitrary client URLs.

Offline preferences stay in browser storage. Online preferences belong to the authenticated room seat, persist in its snapshot and appear in every room view. Profile frames are visible to the table; ocean themes apply to the viewer's own board. Room sessions are anonymous and may equip included items only. They are not customer accounts and do not retain purchases across rooms or devices.

Before selling cosmetics, add:

- Stable player accounts linked to room seats, with explicit account recovery and session revocation.
- A server-owned entitlement store keyed by account and cosmetic ID. Record purchase source, unique provider event ID, grant time and revocation time. Never accept ownership or prices from the browser.
- A server-owned SKU-to-catalog mapping and verified payment webhooks. Process events idempotently, including refunds and chargebacks. Never grant access based on a checkout redirect.
- Account inventory and equipped loadouts, with entitlement checks on equip and normalization on reads after revocation. Keep room snapshots as display snapshots, not ownership records.
- Versioned, immutable assets and fallbacks before marking a catalog item available. Piece skins must preserve owner recognition and hit targets; map skins must preserve layout and resource readability.

No payment provider, price, checkout or account system has been selected or enabled in this change.

# Public trading

During the main phase, the active player can publish one 1:1 resource offer at a time. All other players may join or withdraw. Joining does not exchange or reserve cards. Only the owner can choose a currently interested partner, and both inventories are checked atomically at completion. A fulfilled or cancelled post closes; a new post may be opened in the same turn.

Posts survive reconnects and ordinary actions and expire when the turn ends or the game finishes. An immutable post ID prevents delayed clicks from responding to a replacement post. Interest updates accept an older room revision for the same live post, allowing simultaneous responses; transfers still require the latest revision. Existing directed offers are cancelled on upgrade. Public posts use a separate snapshot field so older servers see no pending directed offer after a rollback. The client sends protocol version 2; older open tabs receive no new-format offer and can keep playing until refreshed. Game state and player sessions remain intact.

## Playable maps

`app/packages/rules/maps.ts` is a separate registry of playable map definitions. New matches record the versioned `mapId`; legacy saves without one use `ember-isles.v1`. Room start validates the requested ID against supported maps. The renderer recreates terrain from that same map ID and seed, independently of the selected cosmetic theme.

Only Ember Isles v1 is implemented today. New board layouts require a new immutable definition and generator, topology-aware camera and water rendering, legal-action and full-match tests, and lobby selection before launch. Do not change the generator behind an existing ID. The current 19-tile water shader and four-seat room service must be extended before adding maps with different tile or player counts. Decide host/guest access rules separately if playable maps will be sold. Cosmetic ownership must never silently select a different playable map.
