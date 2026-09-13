'use client';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useGameTools } from '@/lib/use-game-tools';
import { gameAudio, actionCue } from '@/lib/audio';
import { useOnlineRoom } from '@/lib/use-online-room';
import { botPresentation } from '@/packages/rules/bot-presentation';
import { OnlineLobby } from '@/components/online-lobby';
import {
  Compass,
  ArrowRight,
  BookOpen,
  Volume2,
  VolumeX,
  Settings2,
  Flag,
  Trophy,
  TreePine,
  Mountain,
  Wheat,
  Cloud,
  BrickWall,
  Route,
  House,
  Castle,
  Sparkles,
  ArrowLeftRight,
  Dices,
  RotateCcw,
  Eye,
  ChevronDown,
  Anchor,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  createGame,
  apply,
  legalActions,
  chooseBotAction,
  RESOURCES,
  COLORS,
  COSTS,
  score,
  hand,
  rate,
  routeLength,
  type Game,
  type Action,
  type Card,
} from '@/packages/rules/game';
const Board = dynamic(() => import('@/components/board'), {
  ssr: false,
  loading: () => (
    <div className="board-loading">
      <Compass size={40} />
      <span>Preparing the island...</span>
    </div>
  ),
});
const icons = [TreePine, BrickWall, Cloud, Wheat, Mountain],
  storageKey = 'conquist-local-v1';
export default function Home() {
  const online = useOnlineRoom();
  const sendOnline = online.send;
  const onlineSeed = online.view?.game?.seed;
  const [roomMenu, setRoomMenu] = useState(false);
  const [localGame, setGame] = useState<Game>(() => createGame(42817)),
    [localPlaying, setPlaying] = useState(false),
    [saved, setSaved] = useState<Game | null>(null),
    [build, setBuild] = useState<'road' | 'settlement' | 'city' | null>(null),
    [modal, setModal] = useState<
      'rules' | 'trade' | 'settings' | 'fortune' | null
    >(null),
    [view, setView] = useState(0),
    [lite, setLite] = useState(false),
    [audio, setAudio] = useState(true),
    [volume, setVolume] = useState(0.55),
    [notice, setNotice] = useState(''),
    [give, setGive] = useState(0),
    [want, setWant] = useState(3),
    [partner, setPartner] = useState(-1),
    [confirmTrade, setConfirmTrade] = useState<Action | null>(null),
    [cardResource, setCardResource] = useState(0),
    [cardSecond, setCardSecond] = useState(3),
    [seed, setSeed] = useState('42817'),
    [handoff, setHandoff] = useState(false);
  const game = online.view?.game ?? localGame;
  const playing = online.session ? !!online.view?.game : localPlaying;
  const network = !!online.session;
  const heard = useRef<{ code: string; revision: number } | null>(null);
  useEffect(() => {
    const next = online.view;
    if (!next) {
      heard.current = null;
      return;
    }
    if (
      heard.current?.code === next.code &&
      heard.current.revision < next.revision &&
      next.lastMove &&
      audio
    ) {
      gameAudio.play(
        next.game?.phase === 'over'
          ? 'win'
          : actionCue({ type: next.lastMove }),
      );
    }
    heard.current = { code: next.code, revision: next.revision };
  }, [online.view, audio]);
  useEffect(() => {
    // Read the browser invite only after hydration.
    if (new URLSearchParams(window.location.search).has('room'))
      // eslint-disable-next-line react/react-compiler
      setRoomMenu(true);
  }, []);
  useEffect(() => {
    if (onlineSeed !== undefined) {
      // A newly started remote match resets local overlays once.
      // eslint-disable-next-line react/react-compiler
      setRoomMenu(false);
      setModal(null);
      setHandoff(false);
      setBuild(null);
    }
  }, [onlineSeed]);
  useEffect(() => {
    gameAudio.setEnabled(audio);
    gameAudio.setVolume(volume);
    gameAudio.setActive(playing);
  }, [audio, volume, playing]);
  useEffect(() => {
    const unlock = () => {
      void gameAudio.unlock(audio);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [audio]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) gameAudio.pause();
      else gameAudio.resume();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      gameAudio.setActive(false);
    };
  }, []);
  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s) {
        const g = JSON.parse(s);
        if (
          g.version === 1 &&
          g.hexes?.length === 19 &&
          g.players?.length === 4
        )
          // Hydrate the optional local save after server rendering.
          // eslint-disable-next-line react/react-compiler
          setSaved(g);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (playing && !network)
      try {
        localStorage.setItem(storageKey, JSON.stringify(game));
      } catch {}
  }, [game, playing, network]);
  const all = useMemo(
      () => (network ? (online.view?.actions ?? []) : legalActions(game)),
      [game, network, online.view?.actions],
    ),
    discarder =
      game.phase === 'discard' ? game.discard.findIndex((n) => n > 0) : -1,
    actor = discarder >= 0 ? discarder : game.active,
    bot = network
      ? actor !== online.view?.seat ||
        online.busy ||
        !online.connected ||
        !!online.view?.offer
      : game.players[actor].bot,
    local = !network && game.players.every((p) => !p.bot),
    viewer = network ? (online.view?.seat ?? 0) : local ? actor : 0,
    player = game.players[viewer];
  const act = useCallback(
    (a: Action) => {
      if (network) {
        if (!bot) {
          void sendOnline({ type: 'action', action: a });
          setBuild(null);
        }
        return;
      }
      try {
        const next = apply(game, a);
        setGame(next);
        const nextActor =
          next.phase === 'discard'
            ? next.discard.findIndex((n) => n > 0)
            : next.active;
        if (local && nextActor !== actor && next.phase !== 'over')
          setHandoff(true);
        setBuild(null);
        setNotice('');
        if (audio) gameAudio.play(next.phase === 'over' ? 'win' : actionCue(a));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Unable to make that move.');
      }
    },
    [audio, game, local, actor, network, bot, sendOnline],
  );
  const botMove = useMemo(
    () =>
      !network && bot && playing && game.phase !== 'over'
        ? chooseBotAction(game)
        : null,
    [network, bot, playing, game],
  );
  const botThought = botMove ? botPresentation(game, botMove, 0).message : '';
  useEffect(() => {
    if (
      !playing ||
      !botMove ||
      game.phase === 'over' ||
      handoff ||
      modal ||
      roomMenu
    )
      return;
    const t = setTimeout(
      () => act(botMove),
      botPresentation(game, botMove).delay,
    );
    return () => clearTimeout(t);
  }, [game, playing, botMove, handoff, modal, roomMenu, act]);
  const selectable = useMemo(() => {
    if (bot || handoff || !playing) return [];
    if (game.phase.startsWith('setup') || game.phase === 'raider') return all;
    return game.freeRoads > 0
      ? all.filter((a) => a.type === 'road')
      : build
        ? all.filter((a) => a.type === build)
        : [];
  }, [all, build, bot, handoff, playing, game.phase, game.freeRoads]);
  useGameTools(game, playing && !network, bot || handoff, act);
  const onBoardAction = (a: Action) => {
    if (
      a.type === 'raider' &&
      all.filter((b) => b.type === 'raider' && b.id === a.id).length > 1
    ) {
      setNotice(
        'Choose which neighbour to take a card from using Legal locations below.',
      );
      return;
    }
    act(a);
  };
  function start(hotseat = false) {
    online.leave();
    const n = Number(seed);
    setGame(createGame(Number.isFinite(n) ? n >>> 0 : 42817, hotseat));
    setPlaying(true);
    setBuild(null);
    setHandoff(false);
    setModal(null);
  }
  function endTurn() {
    act({ type: 'end' });
    if (local) setHandoff(true);
  }
  const message =
    game.phase === 'over'
      ? `${game.players[game.winner!].name} wins the island!`
      : network && !online.connected
        ? 'Connection lost. Reconnecting to your table...'
        : network && online.busy
          ? 'Sending your move...'
          : network && online.view?.offer
            ? 'Waiting for a trade response.'
            : network && actor !== viewer
              ? `${game.players[actor].name} is taking their turn...`
              : handoff
                ? 'Pass the device to the next player.'
                : bot
                  ? `${game.players[actor].name} ${botThought}`
                  : game.phase === 'setup-settlement'
                    ? `Place your ${game.setup < 4 ? 'first' : 'second'} settlement`
                    : game.phase === 'setup-road'
                      ? 'Build a road from your new settlement'
                      : game.phase === 'roll'
                        ? 'Your turn. Roll the dice.'
                        : game.phase === 'discard'
                          ? `Discard ${game.discard[actor]} resource cards`
                          : game.phase === 'raider'
                            ? 'Move the Raider to another tile'
                            : build
                              ? `Choose a glowing location for your ${build}`
                              : 'Trade, build, or draw your next Fortune.';
  const tradeAction: Action =
      partner === -1
        ? { type: 'trade', give, want }
        : { type: 'barter', give, want, partner },
    validTrade = all.some(
      (a) => JSON.stringify(a) === JSON.stringify(tradeAction),
    );
  function trade() {
    if (!validTrade) return;
    if (network) {
      act(tradeAction);
      setModal(null);
      return;
    }
    if (partner !== -1) {
      if (local) {
        setConfirmTrade(tradeAction);
        return;
      }
      const other = game.players[partner];
      if (
        other.resources[give] >= other.resources[want] &&
        other.resources[want] < 3
      ) {
        setNotice(`${other.name} declined. Try a resource they need more.`);
        return;
      }
    }
    act(tradeAction);
  }
  function playCard(card: Card) {
    const a = all.find(
      (a) =>
        a.type === 'card' &&
        a.card === card &&
        (card !== 'Embargo' || a.resource === cardResource) &&
        (card !== 'Bounty' ||
          (a.resource === Math.min(cardResource, cardSecond) &&
            a.second === Math.max(cardResource, cardSecond))),
    );
    if (a) {
      act(a);
      setModal(null);
    } else
      setNotice(
        'This card cannot be played now. Wait until your next turn and play at most one card per turn.',
      );
  }
  return (
    <main className={`conquist${playing ? ' is-playing' : ''}`}>
      {(roomMenu || (network && !playing)) && (
        <OnlineLobby
          online={online}
          onClose={() => setRoomMenu(false)}
          onLeave={() => {
            online.leave();
            setPlaying(false);
            setRoomMenu(false);
          }}
        />
      )}
      {network && playing && online.error && (
        <output className="notice" role="alert">
          {online.error}
        </output>
      )}
      {network && playing && online.view?.offer && (
        <section className="online-offer" aria-label="Trade offer">
          <p>
            {game.players[game.active].name} offers 1{' '}
            {RESOURCES[online.view.offer.give]} for 1{' '}
            {RESOURCES[online.view.offer.want]} from{' '}
            {game.players[online.view.offer.partner].name}.
          </p>
          {online.view.offer.partner === viewer && (
            <>
              <button
                className="primary"
                disabled={
                  online.busy ||
                  !online.connected ||
                  !player.resources[online.view.offer.want]
                }
                onClick={() =>
                  void online.send({ type: 'respond', accept: true })
                }
              >
                Accept trade
              </button>
              <button
                className="secondary"
                disabled={online.busy || !online.connected}
                onClick={() =>
                  void online.send({ type: 'respond', accept: false })
                }
              >
                Decline
              </button>
            </>
          )}
          {game.active === viewer && (
            <button
              className="secondary"
              disabled={online.busy || !online.connected}
              onClick={() => void online.send({ type: 'cancel-offer' })}
            >
              Cancel offer
            </button>
          )}
        </section>
      )}
      <header className="topbar">
        <button
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            if (network) {
              setRoomMenu(true);
              return;
            }
            setPlaying(false);
            setSaved(game);
          }}
        >
          <Compass className="brand-mark" />
          <span>
            CONQUIST<small>THE EMBER ISLES</small>
          </span>
        </button>
        <div className="table-meta">
          <span className="status-dot" />
          {!playing
            ? 'A NEW WORLD AWAITS'
            : network
              ? `ONLINE ROOM · ${online.view?.code}`
              : local
                ? 'LOCAL TABLE · 4 PLAYERS'
                : 'SOLO TABLE · 3 OPPONENTS'}
        </div>
        <nav aria-label="Game tools">
          <button
            className="icon-button"
            aria-label="How to play"
            onClick={() => setModal('rules')}
          >
            <BookOpen size={19} />
          </button>
          <button
            className="icon-button"
            aria-label={audio ? 'Mute sound' : 'Enable sound'}
            onClick={() => setAudio(!audio)}
          >
            {audio ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => setModal('settings')}
          >
            <Settings2 size={19} />
          </button>
        </nav>
      </header>
      {!playing ? (
        <section className="welcome">
          <Image
            width={1536}
            height={1024}
            priority
            unoptimized
            className="welcome-art"
            src="/art/ember-isles.png"
            alt="Original miniature archipelago with forests, golden farms and an ember-lit volcano"
          />
          <div className="welcome-shade" />
          <div className="welcome-content">
            <span className="eyebrow">
              <span /> EXPLORE · TRADE · BUILD
            </span>
            <h1>
              The island
              <br />
              is yours
              <br />
              <em>to conquer.</em>
            </h1>
            <p>
              Set sail for the Ember Isles. Build your first settlement, find
              your allies, and race to 10 victory points.
            </p>
            <div className="start-actions">
              <button className="primary play-button" onClick={() => start()}>
                Play solo <ArrowRight size={21} />
              </button>
              <button className="secondary" onClick={() => setRoomMenu(true)}>
                Play online <span>Invite friends to a private room</span>
              </button>
              <button className="secondary" onClick={() => start(true)}>
                Pass & play <span>4 players, one device</span>
              </button>
              {!network && saved && saved.phase !== 'over' && (
                <button
                  className="text-button"
                  onClick={() => {
                    setGame(saved);
                    setPlaying(true);
                  }}
                >
                  Continue your local game <ArrowRight size={16} />
                </button>
              )}
            </div>
            <button className="learn-link" onClick={() => setModal('rules')}>
              <BookOpen size={16} /> New to the island? Learn to play
            </button>
          </div>
          <div className="island-caption">
            <span>01 / THE EMBER ISLES</span>
            <p>A world of small beginnings.</p>
          </div>
          <footer className="menu-footer">
            <span>OPEN SOURCE · BUILT FOR THE TABLE</span>
            <span>
              Private rooms alpha <span className="status-dot" />
            </span>
          </footer>
        </section>
      ) : (
        <>
          <div className="game-layout">
            <aside className="players-panel">
              <div className="panel-heading">
                <span>THE TABLE</span>
                <span>
                  {game.target} <Trophy size={13} />
                </span>
              </div>
              {game.players.map((p, i) => (
                <div
                  className={`player-card ${game.active === i ? 'active' : ''}`}
                  key={i}
                  style={{ '--player': COLORS[i] } as React.CSSProperties}
                >
                  <div className="player-top">
                    <div
                      className={`avatar portrait portrait-${i}`}
                      aria-hidden="true"
                    >
                      <span>{['◆', '◈', '▲', '✦'][i]}</span>
                    </div>
                    <div className="player-name">
                      <strong>{p.name}</strong>
                      <small>
                        {network
                          ? `${i === viewer ? 'You' : 'Online player'} · ${online.view?.seats[i]?.online ? 'Connected' : 'Reconnecting'}`
                          : p.bot
                            ? 'Island rival'
                            : local
                              ? 'Local player'
                              : 'Your expedition'}
                      </small>
                    </div>
                    <strong className="points">
                      {network
                        ? online.view?.points[i]
                        : score(game, i, i !== viewer && game.phase !== 'over')}
                      <small>VP</small>
                    </strong>
                  </div>
                  <div className="player-stats">
                    <span title="Resource cards">
                      <span className="tiny-cards" />{' '}
                      {network ? online.view?.hands[i] : hand(game, i)}
                    </span>
                    <span title="Roads">
                      <Route size={14} />{' '}
                      {game.edges.filter((e) => e.owner === i).length}
                    </span>
                    <span title="Guards">
                      <Flag size={14} /> {p.guards}
                    </span>
                    {game.active === i && (
                      <span className="turn-tag">TURN</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="awards">
                <div>
                  <Route size={19} />
                  <span>
                    Grand Route
                    <small>
                      {game.route === null
                        ? '5 connected roads'
                        : game.players[game.route].name +
                          ' · ' +
                          routeLength(game, game.route) +
                          ' roads'}
                    </small>
                  </span>
                  <b>+2</b>
                </div>
                <div>
                  <Flag size={19} />
                  <span>
                    High Command
                    <small>
                      {game.command === null
                        ? 'Play 3 Guards'
                        : game.players[game.command].name}
                    </small>
                  </span>
                  <b>+2</b>
                </div>
              </div>
              <button className="rules-link" onClick={() => setModal('rules')}>
                <BookOpen size={15} /> Rules & build costs
              </button>
            </aside>
            <section className="table-surface" aria-label="Game board">
              <div className="board-topline">
                <div>
                  <span className="eyebrow">THE EMBER ISLES</span>
                  <p>
                    Turn {game.turn} <span>•</span> Seed {game.seed}
                  </p>
                </div>
                <div className="camera-actions">
                  <button
                    className="icon-button"
                    aria-label="Change camera view"
                    onClick={() => setView(view + 1)}
                  >
                    <Eye size={19} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Reset camera"
                    onClick={() => setView(view + 2)}
                  >
                    <RotateCcw size={17} />
                  </button>
                </div>
              </div>
              <Board
                game={game}
                actions={selectable}
                onAction={onBoardAction}
                view={view}
                lite={lite}
              />
              <div className="board-hint">
                <span className="hint-dot" />
                {build
                  ? 'Click a highlighted location'
                  : 'Drag to orbit · Scroll to zoom'}
              </div>
              <div className="turn-prompt" aria-live="polite">
                <span style={{ background: COLORS[actor] }} />
                {message}
              </div>
            </section>
            <aside className="activity-panel">
              <div className="panel-heading">
                <span>ISLAND CHRONICLE</span>
                <Compass size={15} />
              </div>
              <div className="dice-box">
                <div
                  className="dice-pair"
                  key={`${game.turn}-${game.dice.join('-')}`}
                >
                  {(game.dice.length ? game.dice : [0, 0]).map((d, i) => (
                    <div
                      className={`die d${d}`}
                      key={i}
                      aria-label={`Die ${i + 1}: ${d || 'not rolled'}`}
                    >
                      {d ? (
                        Array.from({ length: 9 }, (_, n) => (
                          <i
                            key={n}
                            className={
                              (
                                [
                                  [],
                                  [4],
                                  [0, 8],
                                  [0, 4, 8],
                                  [0, 2, 6, 8],
                                  [0, 2, 4, 6, 8],
                                  [0, 2, 3, 5, 6, 8],
                                ][d] as number[]
                              ).includes(n)
                                ? 'pip'
                                : 'blank'
                            }
                          />
                        ))
                      ) : (
                        <span>?</span>
                      )}
                    </div>
                  ))}
                </div>
                <span>
                  {game.dice.length
                    ? `${game.dice[0] + game.dice[1]} rolled`
                    : 'The island awaits'}
                </span>
              </div>
              <div className="chronicle" role="log" aria-label="Game history">
                {game.log.slice(0, 12).map((entry, i) => (
                  <p
                    key={`${entry}-${i}`}
                    className={i === 0 ? 'new-entry' : ''}
                  >
                    <span />
                    {entry}
                  </p>
                ))}
              </div>
              <div className="bank">
                <span className="eyebrow">BANK RESERVES</span>
                <div>
                  {game.bank.map((n, i) => {
                    const Icon = icons[i];
                    return (
                      <span key={i} title={RESOURCES[i]}>
                        <Icon size={16} />
                        {n}
                      </span>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>
          <section className="hand-dock" aria-label="Resources and actions">
            <div className="hand-label">
              <span className="eyebrow">
                {local ? player.name.toUpperCase() : 'YOUR HAND'}
              </span>
              <strong>
                {handoff ? 'Hidden' : hand(game, viewer)}{' '}
                <small>resources</small>
              </strong>
            </div>
            <div className="resource-hand">
              {RESOURCES.map((r, i) => {
                const Icon = icons[i];
                return (
                  <button
                    key={r}
                    className={`resource-card res-${i}`}
                    onClick={() => {
                      if (
                        game.phase === 'discard' &&
                        !bot &&
                        player.resources[i] > 0
                      )
                        act({ type: 'discard', player: actor, resource: i });
                    }}
                    disabled={
                      game.phase !== 'discard' ||
                      bot ||
                      handoff ||
                      !player.resources[i]
                    }
                    aria-label={`${r}: ${handoff ? 'hidden' : player.resources[i]}${game.phase === 'discard' ? ', discard one' : ''}`}
                  >
                    <span
                      className={`resource-sprite sprite-${i}`}
                      aria-hidden="true"
                    >
                      <Icon size={26} />
                    </span>
                    <strong>{handoff ? '?' : player.resources[i]}</strong>
                    <span>{r}</span>
                  </button>
                );
              })}
            </div>
            <div className="build-actions">
              {(
                [
                  { key: 'road', name: 'Road', Icon: Route },
                  { key: 'settlement', name: 'Settle', Icon: House },
                  { key: 'city', name: 'City', Icon: Castle },
                ] as const
              ).map(({ key, name, Icon }) => (
                <button
                  title={COSTS[key]
                    .flatMap((n, i) => (n ? [`${n} ${RESOURCES[i]}`] : []))
                    .join(' + ')}
                  className={`build-button ${build === key ? 'selected' : ''}`}
                  key={key}
                  disabled={bot || handoff || !all.some((a) => a.type === key)}
                  onClick={() => setBuild(build === key ? null : key)}
                >
                  <Icon size={21} />
                  <span>{name}</span>
                </button>
              ))}
              <button
                className="build-button"
                onClick={() => setModal('fortune')}
                disabled={handoff}
              >
                <Sparkles size={21} />
                <span>Fortune {player.cards.length || ''}</span>
              </button>
              <button
                className="build-button"
                onClick={() => setModal('trade')}
                disabled={bot || handoff || game.phase !== 'main'}
              >
                <ArrowLeftRight size={21} />
                <span>Trade</span>
              </button>
            </div>
            <div className="turn-action">
              {game.phase === 'roll' && !bot && !handoff ? (
                <button
                  className="primary"
                  onClick={() => act({ type: 'roll' })}
                >
                  <Dices size={20} /> Roll dice
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={
                    bot || handoff || !all.some((a) => a.type === 'end')
                  }
                  onClick={endTurn}
                >
                  End turn <ArrowRight size={18} />
                </button>
              )}
              <small>
                {bot
                  ? 'Opponent’s turn'
                  : game.phase.startsWith('setup')
                    ? 'Found your expedition'
                    : 'Race to 10 points'}
              </small>
            </div>
          </section>
          {notice && (
            <output className="notice">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice('')}
              >
                ×
              </button>
            </output>
          )}
          {!bot && !handoff && selectable.length > 0 && (
            <details className="legal-locations">
              <summary>
                Legal locations <span>{selectable.length}</span>
                <ChevronDown size={14} />
              </summary>
              <div>
                {selectable.map((a, i) => (
                  <button key={i} onClick={() => act(a)}>
                    {a.type} {'id' in a ? a.id + 1 : ''}
                    {a.type === 'raider' && a.victim !== undefined
                      ? ` · take from ${game.players[a.victim].name}`
                      : ''}
                  </button>
                ))}
              </div>
            </details>
          )}
          <Dialog open={handoff} onOpenChange={() => {}}>
            <DialogContent showCloseButton={false} className="game-dialog">
              <DialogTitle>
                Pass the table to {game.players[actor].name}
              </DialogTitle>
              <DialogDescription>
                Your hand is hidden until you are ready.
              </DialogDescription>
              <button className="primary" onClick={() => setHandoff(false)}>
                I’m ready <ArrowRight size={18} />
              </button>
            </DialogContent>
          </Dialog>
          <Dialog open={game.phase === 'over'} onOpenChange={() => {}}>
            <DialogContent
              showCloseButton={false}
              className="game-dialog victory"
            >
              <Trophy size={50} />
              <span className="eyebrow">THE ISLAND HAS A NEW LEGEND</span>
              <DialogTitle>
                {game.players[game.winner ?? 0].name} wins!
              </DialogTitle>
              <DialogDescription>
                {network
                  ? online.view?.points[game.winner ?? 0]
                  : score(game, game.winner ?? 0)}{' '}
                victory points in {game.turn} turns.
              </DialogDescription>
              <button
                className="primary"
                onClick={() => {
                  online.leave();
                  setPlaying(false);
                  setGame(createGame(game.seed + 1));
                  setSeed(String(game.seed + 1));
                }}
              >
                Return to the isles <ArrowRight size={18} />
              </button>
            </DialogContent>
          </Dialog>
        </>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setModal(null);
            setNotice('');
          }
        }}
      >
        <DialogContent className="game-dialog">
          {modal === 'rules' && (
            <>
              <span className="eyebrow">A FIELD GUIDE</span>
              <DialogTitle>Make a home. Build an empire.</DialogTitle>
              <DialogDescription>
                Be the first to reach 10 victory points.
              </DialogDescription>
              <div className="rules-content">
                <p>
                  <b>1. Settle the island.</b> Place two settlements and a road
                  beside each. The second settlement gives you its neighbouring
                  resources. Leave at least one empty corner between
                  settlements.
                </p>
                <p>
                  <b>2. Let the dice decide.</b> Everyone collects from tiles
                  matching the roll. Settlements produce one resource, cities
                  produce two. The Raider blocks its tile.
                </p>
                <p>
                  <b>3. Build and trade.</b> Extend your roads, add settlements,
                  or upgrade to cities. Trade with the bank at 4:1, or improve
                  your rate with a harbour. A settlement earns 1 point, a city
                  2.
                </p>
                <div className="cost-table">
                  {Object.entries(COSTS).map(([k, c]) => (
                    <div key={k}>
                      <strong>{k === 'buy' ? 'Fortune' : k}</strong>
                      <span>
                        {c
                          .flatMap((n, i) =>
                            n ? [`${n} ${RESOURCES[i]}`] : [],
                          )
                          .join(' · ')}
                      </span>
                    </div>
                  ))}
                </div>
                <p>
                  <b>On a seven:</b> hands over seven discard half, rounded
                  down. Move the Raider and take one random card from a
                  neighbouring opponent.
                </p>
                <p>
                  <b>Fortune cards.</b> Guards move the Raider; Engineers grant
                  two roads; Bounty gives two resources; Embargo claims one
                  resource type from every rival; Charters add one hidden point.
                  Wait a turn before playing a card. Play at most one per turn.
                </p>
                <p>
                  <b>Claim the honours.</b> Five connected roads earn Grand
                  Route. Three Guards earn High Command. Each is worth 2 points
                  and can be taken by a rival who exceeds your record.
                </p>
                <p className="muted">
                  This alpha supports solo games and four-player pass-and-play
                  on one device. Your game saves in this browser. Online rooms
                  are still in development.
                </p>
              </div>
              <button className="primary" onClick={() => setModal(null)}>
                Back to the island <ArrowRight size={18} />
              </button>
            </>
          )}
          {modal === 'settings' && (
            <>
              <DialogTitle>Your table</DialogTitle>
              <DialogDescription>
                Set up your next expedition.
              </DialogDescription>
              <label className="field">
                Island seed
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  type="number"
                  min="0"
                  max="4294967295"
                />
              </label>
              <button className="setting-toggle" onClick={() => setLite(!lite)}>
                <span>
                  Lite graphics
                  <small>Lower resolution, fewer props, no shadows</small>
                </span>
                <b>{lite ? 'On' : 'Off'}</b>
              </button>
              <button
                className="setting-toggle"
                onClick={() => setAudio(!audio)}
              >
                <span>Sound & ocean ambience</span>
                <b>{audio ? 'On' : 'Off'}</b>
              </button>
              <label className="field">
                Volume · {Math.round(volume * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </label>
              <button
                className="primary"
                onClick={() => {
                  setModal(null);
                  if (network) {
                    setRoomMenu(true);
                    return;
                  }
                  setPlaying(false);
                  setSaved(game);
                }}
              >
                Return to menu
              </button>
              <p className="muted">
                Your current match remains saved on this device.
              </p>
            </>
          )}
          {modal === 'trade' && (
            <>
              <DialogTitle>A fair exchange</DialogTitle>
              <DialogDescription>
                Choose your resources and trading partner.
              </DialogDescription>
              <div className="trade-targets">
                <button
                  className={partner === -1 ? 'selected' : ''}
                  onClick={() => setPartner(-1)}
                >
                  <Anchor size={16} /> Bank
                </button>
                {game.players.map(
                  (p, i) =>
                    i !== viewer && (
                      <button
                        key={i}
                        className={partner === i ? 'selected' : ''}
                        onClick={() => setPartner(i)}
                      >
                        {p.name}
                      </button>
                    ),
                )}
              </div>
              <div className="trade-grid">
                <label className="field">
                  You give
                  <select
                    value={give}
                    onChange={(e) => setGive(+e.target.value)}
                  >
                    {RESOURCES.map((r, i) => (
                      <option key={r} value={i}>
                        {partner === -1 ? rate(game, viewer, i) : 1} {r}
                      </option>
                    ))}
                  </select>
                </label>
                <ArrowLeftRight />
                <label className="field">
                  You receive
                  <select
                    value={want}
                    onChange={(e) => setWant(+e.target.value)}
                  >
                    {RESOURCES.map((r, i) => (
                      <option key={r} value={i}>
                        1 {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="muted">
                {partner === -1
                  ? 'Your best harbour rate is applied automatically.'
                  : local
                    ? 'The other player must agree before resources change hands.'
                    : 'Your opponent may accept or decline this offer.'}
              </p>
              {notice && <output>{notice}</output>}
              <button
                className="primary"
                disabled={!validTrade}
                onClick={trade}
              >
                {partner === -1 ? 'Complete trade' : 'Offer trade'}{' '}
                <ArrowLeftRight size={18} />
              </button>
              {!validTrade && (
                <p className="muted">
                  Choose different resources with enough cards available on both
                  sides.
                </p>
              )}
            </>
          )}
          {modal === 'fortune' && (
            <>
              <DialogTitle>A turn of Fortune</DialogTitle>
              <DialogDescription>
                Buy a card or play one from a previous turn.
              </DialogDescription>
              <div className="fortune-cards">
                {player.cards.length === 0 ? (
                  <p className="muted">
                    Your story is still unwritten. Draw your first card.
                  </p>
                ) : (
                  player.cards.map((c, i) => (
                    <button
                      key={i}
                      className="fortune-card"
                      disabled={
                        c.type === 'Charter' ||
                        c.turn >= game.turn ||
                        game.played ||
                        bot ||
                        game.active !== viewer
                      }
                      onClick={() => playCard(c.type)}
                    >
                      <Sparkles size={24} />
                      <strong>{c.type}</strong>
                      <small>
                        {c.type === 'Charter'
                          ? '+1 hidden victory point'
                          : c.turn >= game.turn
                            ? 'Ready next turn'
                            : 'Play card'}
                      </small>
                    </button>
                  ))
                )}
              </div>
              <div className="trade-grid">
                <label className="field">
                  Resource
                  <select
                    value={cardResource}
                    onChange={(e) => setCardResource(+e.target.value)}
                  >
                    {RESOURCES.map((r, i) => (
                      <option value={i} key={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Second for Bounty
                  <select
                    value={cardSecond}
                    onChange={(e) => setCardSecond(+e.target.value)}
                  >
                    {RESOURCES.map((r, i) => (
                      <option value={i} key={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {notice && <output>{notice}</output>}
              <button
                className="primary"
                disabled={bot || !all.some((a) => a.type === 'buy')}
                onClick={() => act({ type: 'buy' })}
              >
                Draw Fortune <Sparkles size={18} />
              </button>
              <p className="muted">
                1 Wool + 1 Grain + 1 Stone ·{' '}
                {network ? online.view?.deckCount : game.deck.length} cards
                remain
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmTrade !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTrade(null);
        }}
      >
        <DialogContent className="game-dialog">
          <DialogTitle>
            {partner >= 0 ? game.players[partner].name : ''}, accept this trade?
          </DialogTitle>
          <DialogDescription>
            Give 1 {RESOURCES[want]} and receive 1 {RESOURCES[give]} from{' '}
            {player.name}.
          </DialogDescription>
          <button
            className="primary"
            onClick={() => {
              if (confirmTrade) act(confirmTrade);
              setConfirmTrade(null);
            }}
          >
            Accept trade
          </button>
          <button className="secondary" onClick={() => setConfirmTrade(null)}>
            Decline
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
