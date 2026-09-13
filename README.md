# Conquist

Conquist is an online multiplayer strategy board game for [conquist.online](https://conquist.online).

The playable alpha lives in [`app/`](app/). Invite four friends to a private online room, play against three bots, or take turns on one device, on an original Three.js island.

```sh
cd app
npm ci
npm run dev
```

For online play, also run `npm run rooms` in a second terminal inside `app/`. Create a room, share its invite, and start when all four players have joined. Reloading the same tab restores your seat.

See the [app README](app/README.md) for features, checks, current limitations and architecture, and the [art notes](app/ART.md) for original asset provenance.

## License

[MIT](LICENSE)
