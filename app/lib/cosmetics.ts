export type CosmeticSlot = 'map' | 'pieces' | 'profile';
export type Loadout = Record<CosmeticSlot, string>;
export type Cosmetic = {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  access: 'included' | 'entitlement';
  available: boolean;
};
// IDs are permanent. Presentation metadata never enters the game rules or saves.
export const COSMETICS: readonly Cosmetic[] = [
  {
    id: 'map.ember',
    slot: 'map',
    name: 'Ember Isles',
    description: 'The original ocean table.',
    access: 'included',
    available: true,
  },
  {
    id: 'map.moonlit',
    slot: 'map',
    name: 'Moonlit sea',
    description: 'Cool blue water under a moonlit horizon.',
    access: 'included',
    available: true,
  },
  {
    id: 'pieces.classic',
    slot: 'pieces',
    name: 'Classic pieces',
    description: 'The familiar roads and settlements.',
    access: 'included',
    available: true,
  },
  {
    id: 'profile.classic',
    slot: 'profile',
    name: 'Explorer',
    description: 'The original player frame.',
    access: 'included',
    available: true,
  },
  {
    id: 'profile.brass',
    slot: 'profile',
    name: 'Brass compass',
    description: 'A warm brass player frame.',
    access: 'included',
    available: true,
  },
  {
    id: 'pieces.founder',
    slot: 'pieces',
    name: 'Founder collection',
    description: 'A future cosmetic collection.',
    access: 'entitlement',
    available: false,
  },
];
export const DEFAULT_LOADOUT: Readonly<Loadout> = {
  map: 'map.ember',
  pieces: 'pieces.classic',
  profile: 'profile.classic',
};
export function canEquip(
  id: string,
  slot: CosmeticSlot,
  entitlements: readonly string[] = [],
) {
  const item = COSMETICS.find((item) => item.id === id && item.slot === slot);
  return (
    !!item?.available &&
    (item.access === 'included' || entitlements.includes(item.id))
  );
}
export function normalizeLoadout(
  value: unknown,
  entitlements: readonly string[] = [],
): Loadout {
  const result = { ...DEFAULT_LOADOUT };
  if (!value || typeof value !== 'object') return result;
  for (const slot of Object.keys(result) as CosmeticSlot[]) {
    const id = (value as Record<string, unknown>)[slot];
    if (typeof id === 'string' && canEquip(id, slot, entitlements))
      result[slot] = id;
  }
  return result;
}

// Render-only palette: terrain, tokens, player colors and hit targets stay identical.
export function mapPalette(id: string) {
  return id === 'map.moonlit'
    ? {
        horizon: '#101d3c',
        deep: [0.006, 0.018, 0.065] as const,
        shallow: [0.045, 0.16, 0.27] as const,
      }
    : {
        horizon: '#102e39',
        deep: [0.009, 0.06, 0.085] as const,
        shallow: [0.025, 0.19, 0.2] as const,
      };
}
