/** Playable map identities are versioned separately from cosmetic themes. */
export const DEFAULT_MAP_ID = 'ember-isles.v1';
export const PLAYABLE_MAPS = [
  {
    id: DEFAULT_MAP_ID,
    name: 'Ember Isles',
    generator: 'radius-two.v1',
    players: 4,
    victoryPoints: 10,
  },
] as const;
export function playableMap(id: string = DEFAULT_MAP_ID) {
  const map = PLAYABLE_MAPS.find((map) => map.id === id);
  if (!map) throw new Error('This playable map is not supported.');
  return map;
}
