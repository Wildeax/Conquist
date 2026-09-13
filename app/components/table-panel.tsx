'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gameAudio } from '@/lib/audio';
import type { useOnlineRoom } from '@/lib/use-online-room';
import type { Game } from '@/packages/rules/game';
import { COLORS } from '@/packages/rules/game';
import { TradePost } from './trade-post';

export function TablePanel({
  online,
  game,
  viewer,
  activity,
  openTrade,
  canPost,
}: {
  online: ReturnType<typeof useOnlineRoom>;
  game: Game;
  viewer: number;
  activity: ReactNode;
  openTrade: () => void;
  canPost: boolean;
}) {
  const [tab, setTab] = useState<'trades' | 'chat' | 'activity'>('trades');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState<number[]>([]);
  const [sound, setSound] = useState(false);
  const [read, setRead] = useState(online.view?.chatRevision ?? 0);
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const heard = useRef(online.view?.chatRevision ?? 0);
  const interest = useRef(online.view?.offer?.interested.length ?? 0);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const messages = (online.view?.chat ?? []).filter(
    (m) => !muted.includes(m.seat),
  );
  const unread = messages.filter(
    (m) => m.id > read && m.seat !== viewer,
  ).length;
  useEffect(() => {
    const revision = online.view?.chatRevision ?? 0;
    if (
      revision > heard.current &&
      sound &&
      !document.hidden &&
      messages.some((m) => m.id > heard.current && m.seat !== viewer)
    )
      gameAudio.play('chat');
    heard.current = revision;
    if (tab === 'chat') {
      // Record the last message visible in the opened chat tab.
      // eslint-disable-next-line react/react-compiler
      setRead(revision);
      if (following.current && log.current)
        log.current.scrollTop = log.current.scrollHeight;
    }
  }, [online.view?.chatRevision, sound, messages, tab, viewer]);
  useEffect(() => {
    const count = online.view?.offer?.interested.length ?? 0;
    if (
      count > interest.current &&
      online.view?.offer?.owner === viewer &&
      !document.hidden
    )
      gameAudio.play('interest');
    interest.current = count;
  }, [online.view?.offer, viewer]);
  async function send(text: string) {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError('');
    if (pending.current?.text !== text)
      pending.current = { text, id: crypto.randomUUID() };
    try {
      await online.sendChat(text, pending.current.id);
      setDraft('');
      pending.current = null;
      following.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message could not be sent.');
    } finally {
      setBusy(false);
    }
  }
  const result = online.view?.tradeResult;
  return (
    <section className="table-panel" aria-label="Table conversation and trades">
      <div
        className="table-dice"
        aria-label={
          game.dice.length
            ? `${game.dice.join(' and ')} rolled`
            : 'Dice not rolled'
        }
      >
        {(game.dice.length ? game.dice : [0, 0]).map((n, i) => (
          <span className="die" key={`${game.turn}-${n}-${i}`}>
            {n || '?'}
          </span>
        ))}
        <span>
          {game.dice.length
            ? `${game.dice[0] + game.dice[1]} rolled`
            : 'Ready to roll'}
        </span>
      </div>
      <div className="table-tabs" role="tablist" aria-label="Table panels">
        {(['trades', 'chat', 'activity'] as const).map((name) => (
          <button
            key={name}
            role="tab"
            id={`tab-${name}`}
            tabIndex={tab === name ? 0 : -1}
            onKeyDown={(event) => {
              const names = ['trades', 'chat', 'activity'] as const;
              const index = names.indexOf(name);
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % 3
                  : event.key === 'ArrowLeft'
                    ? (index + 2) % 3
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 2
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(names[next]);
              following.current = true;
              document.getElementById(`tab-${names[next]}`)?.focus();
            }}
            aria-selected={tab === name}
            aria-controls={`panel-${name}`}
            onClick={() => {
              setTab(name);
              following.current = true;
            }}
          >
            {name === 'trades'
              ? `Trades${online.view?.offer ? ' · 1' : ''}`
              : name === 'chat'
                ? `Chat${unread ? ` · ${unread}` : ''}`
                : 'Activity'}
          </button>
        ))}
      </div>
      <div
        className="table-tab-content"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'trades' && (
          <>
            {online.view?.offer ? (
              <TradePost
                offer={online.view.offer}
                game={game}
                viewer={viewer}
                disabled={online.busy || !online.connected}
                send={online.send}
              />
            ) : (
              <div className="trade-empty">
                <strong>
                  {result
                    ? result.status === 'completed'
                      ? 'Trade completed'
                      : result.status === 'cancelled'
                        ? 'Post cancelled'
                        : 'Post expired at turn end'
                    : 'No open trade posts'}
                </strong>
                <p>
                  {result?.partner !== undefined
                    ? `${game.players[result.owner].name} traded with ${game.players[result.partner].name}.`
                    : 'Post what you have and what you need. Choose a player when they join.'}
                </p>
                <button
                  className="primary"
                  disabled={!canPost}
                  onClick={openTrade}
                >
                  {online.session ? 'Create a public trade' : 'Open trading'}
                </button>
                {!canPost && (
                  <small>You can post during your turn after rolling.</small>
                )}
              </div>
            )}
          </>
        )}
        {tab === 'activity' && activity}
        {tab === 'chat' &&
          (online.session ? (
            <>
              <div className="chat-tools">
                <label>
                  <input
                    type="checkbox"
                    checked={sound}
                    onChange={(e) => setSound(e.target.checked)}
                  />{' '}
                  Chat sounds
                </label>
                <span>{messages.length}/100 messages</span>
              </div>
              <div
                className="room-chat-log"
                ref={log}
                role="log"
                aria-label="Room messages"
                aria-live="polite"
                onScroll={() => {
                  const el = log.current;
                  if (el)
                    following.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 35;
                }}
              >
                {!messages.length && (
                  <p className="muted">
                    Say hello to your table. Only players in this room can read
                    these messages.
                  </p>
                )}
                {messages.map((m) => (
                  <div className="chat-message" key={m.id}>
                    <b style={{ color: COLORS[m.seat] }}>
                      {online.view?.seats[m.seat]?.name}
                    </b>
                    <time>
                      {new Date(m.at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
              <div className="quick-chat">
                {[
                  'Anyone have grain?',
                  'Anyone have timber?',
                  'One moment',
                  'Good luck!',
                ].map((text) => (
                  <button
                    disabled={busy || !online.connected}
                    key={text}
                    onClick={() => void send(text)}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <form
                className="chat-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
              >
                <label className="sr-only" htmlFor="room-chat-input">
                  Message your room
                </label>
                <input
                  id="room-chat-input"
                  value={draft}
                  maxLength={280}
                  placeholder="Message your room…"
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  className="primary"
                  disabled={busy || !online.connected || !draft.trim()}
                >
                  Send
                </button>
              </form>
              <small>{draft.length}/280 · Messages stay with this room.</small>
              {error && <p role="alert">{error}</p>}
              <details className="chat-mutes">
                <summary>Mute players</summary>
                {online.view?.seats.map(
                  (seat, i) =>
                    i !== viewer && (
                      <label key={i}>
                        <input
                          type="checkbox"
                          checked={muted.includes(i)}
                          onChange={() =>
                            setMuted(
                              muted.includes(i)
                                ? muted.filter((n) => n !== i)
                                : [...muted, i],
                            )
                          }
                        />
                        {seat.name}
                      </label>
                    ),
                )}
              </details>
            </>
          ) : (
            <p className="muted">
              Room chat is available when you play online with friends.
            </p>
          ))}
      </div>
    </section>
  );
}
