'use client';
import { useEffect, useState } from 'react';
import {
  COSMETICS,
  DEFAULT_LOADOUT,
  normalizeLoadout,
  type Loadout,
  type CosmeticSlot,
} from '@/lib/cosmetics';
export function useLocalCosmetics() {
  const [loadout, setLoadout] = useState<Loadout>({ ...DEFAULT_LOADOUT });
  useEffect(() => {
    try {
      // Restore the browser's cosmetic preference after hydration.
      // eslint-disable-next-line react/react-compiler
      setLoadout(
        normalizeLoadout(
          JSON.parse(localStorage.getItem('conquist-cosmetics-v1') ?? 'null'),
        ),
      );
    } catch {}
  }, []);
  function equip(slot: CosmeticSlot, id: string) {
    const next = normalizeLoadout({ ...loadout, [slot]: id });
    setLoadout(next);
    try {
      localStorage.setItem('conquist-cosmetics-v1', JSON.stringify(next));
    } catch {}
  }
  return { loadout, equip };
}
export function CosmeticsPicker({
  loadout,
  equip,
  disabled,
}: {
  loadout: Loadout;
  equip: (slot: CosmeticSlot, id: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="cosmetics-picker" aria-label="Appearance">
      <h3>Appearance</h3>
      <p className="muted">
        Make the table yours. Cosmetics never change the rules.
      </p>
      {(['map', 'pieces', 'profile'] as const).map((slot) => (
        <label className="field" key={slot}>
          {slot === 'map'
            ? 'Table theme'
            : slot === 'pieces'
              ? 'Playing pieces'
              : 'Profile frame'}
          <select
            value={loadout[slot]}
            disabled={disabled}
            onChange={(event) => equip(slot, event.target.value)}
          >
            {COSMETICS.filter((item) => item.slot === slot).map((item) => (
              <option
                key={item.id}
                value={item.id}
                disabled={!item.available || item.access !== 'included'}
              >
                {item.name}
                {!item.available ? ' · Coming later' : ' · Included'}
              </option>
            ))}
          </select>
        </label>
      ))}
    </section>
  );
}
