'use client';
import { useEffect, useRef, useState } from 'react';

/** Public game log entries only; room chat and private card state never enter this bubble. */
export function PlayerActionBubble({
  entries,
  name,
}: {
  entries: string[];
  name: string;
}) {
  const previous = useRef(entries);
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (boundary < 0) return; // Initial load or reconnect catch-up has no fresh action to announce.
    const latest = entries
      .slice(0, boundary)
      .find((entry) => entry.startsWith(`${name} `));
    if (!latest) return;
    // A new public action briefly appears next to the player who performed it.
    // eslint-disable-next-line react/react-compiler
    setMessage(latest.slice(name.length + 1));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 4500);
  }, [entries, name]);
  return message ? (
    <output
      className="player-action-bubble"
      aria-label={`${name}'s latest action`}
    >
      {message}
    </output>
  ) : null;
}
