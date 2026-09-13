'use client';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ArrowLeftRight,
  Castle,
  Dices,
  Flag,
  House,
  Route,
  Sparkles,
} from 'lucide-react';

const actions: Array<[RegExp, ComponentType<{ size?: number }>]> = [
  [/settlement/, House],
  [/road/, Route],
  [/city/, Castle],
  [/rolled/, Dices],
  [/traded/, ArrowLeftRight],
  [/Raider/, Flag],
  [/Fortune|played/, Sparkles],
];

export function PlayerActionIndicator({
  entries,
  name,
}: {
  entries: string[];
  name: string;
}) {
  const previous = useRef(entries);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [action, setAction] = useState<{
    text: string;
    Icon: ComponentType<{ size?: number }>;
  } | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    const old = previous.current;
    previous.current = entries;
    if (old === entries || old[0] === entries[0]) return;
    const boundary = entries.indexOf(old[0]);
    if (boundary < 0) return;
    const latest = entries
      .slice(0, boundary)
      .find((entry) => entry.startsWith(`${name} `));
    if (!latest) return;
    const Icon = actions.find(([pattern]) => pattern.test(latest))?.[1];
    if (!Icon) return;
    // Show one compact public-action icon without replaying reconnect history.
    // eslint-disable-next-line react/react-compiler
    setAction({ text: latest, Icon });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAction(null), 4000);
  }, [entries, name]);

  if (!action) return null;
  return (
    <output
      className="player-action-indicator"
      title={action.text}
      aria-label={action.text}
    >
      <action.Icon size={16} />
    </output>
  );
}
