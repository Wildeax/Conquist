'use client';
import { useEffect, useState } from 'react';
import type { useOnlineRoom } from '@/lib/use-online-room';
import { COLORS } from '@/packages/rules/game';

export function OnlineLobby({
  online,
  onClose,
  onLeave,
}: {
  online: ReturnType<typeof useOnlineRoom>;
  onClose: () => void;
  onLeave: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(90);
  useEffect(() => {
    // Hydrate the browser-only invite after server rendering.
    // eslint-disable-next-line react/react-compiler
    setOrigin(window.location.origin);
    const invite = new URLSearchParams(window.location.search).get('room');
    if (invite && /^[A-Fa-f0-9]{8}$/.test(invite))
      setCode(invite.toUpperCase());
  }, []);
  const invite = `${origin}/?room=${online.session?.code}`;
  return (
    <div className="room-overlay">
      <section className="room-panel" aria-label="Online room">
        <h2>
          {online.session ? `Room ${online.session.code}` : 'Gather your table'}
        </h2>
        {online.session ? (
          <>
            <p>
              Share this invite. The host starts when all four players have
              joined.
            </p>
            <label className="field">
              Invite link
              <input
                readOnly
                value={invite}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied!' : 'Copy invite'}
            </button>
            <ol className="room-seats">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} style={{ color: COLORS[i] }}>
                  {online.view?.seats[i]?.name ?? 'Waiting for a player...'}{' '}
                  {online.view?.seats[i] && (
                    <small>
                      {online.view.seats[i].online
                        ? 'Connected'
                        : 'Reconnecting'}
                    </small>
                  )}
                </li>
              ))}
            </ol>
            {!online.connected && <output>Connecting to your room...</output>}
            {online.view?.seat === 0 && !online.view.game && (
              <>
                <label className="field">
                  Time per turn
                  <select
                    value={turnSeconds}
                    onChange={(event) =>
                      setTurnSeconds(Number(event.target.value))
                    }
                  >
                    <option value="60">1 minute</option>
                    <option value="90">1 minute 30 seconds</option>
                    <option value="120">2 minutes</option>
                    <option value="180">3 minutes</option>
                  </select>
                  <small>
                    The server advances the turn when time runs out.
                  </small>
                </label>
                <button
                  className="primary"
                  disabled={
                    online.busy ||
                    !online.connected ||
                    online.view.seats.length !== 4
                  }
                  onClick={() =>
                    void online.send({ type: 'start', turnSeconds })
                  }
                >
                  Start match
                </button>
              </>
            )}
            {online.view?.game && (
              <button className="primary" onClick={onClose}>
                Back to match
              </button>
            )}
            <p className="muted">
              Reloading this tab restores your seat. Keep it open while you
              play.
            </p>
            <details>
              <summary>Leave room</summary>
              <p>Your seat cannot be reclaimed after forgetting this room.</p>
              <button className="text-button" onClick={onLeave}>
                Forget room and return to menu
              </button>
            </details>
          </>
        ) : (
          <>
            <p>
              Four friends, one island. Create a room or join with an invite
              code.
            </p>
            <label className="field">
              Your name
              <input
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              className="primary"
              disabled={online.busy || !name.trim()}
              onClick={() => void online.enter(name)}
            >
              Create room
            </button>
            <label className="field">
              Room code
              <input
                maxLength={8}
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''),
                  )
                }
                autoComplete="off"
              />
            </label>
            <button
              className="secondary"
              disabled={online.busy || !name.trim() || code.length !== 8}
              onClick={() => void online.enter(name, code)}
            >
              Join room
            </button>
            <button
              className="text-button"
              disabled={online.busy}
              onClick={onClose}
            >
              Back
            </button>
          </>
        )}
        {online.error && <p role="alert">{online.error}</p>}
      </section>
    </div>
  );
}
