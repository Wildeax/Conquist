'use client';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useGameTools } from '@/lib/use-game-tools';
import {
  useFeedbackPreferences,
  useGameFeedback,
} from '@/lib/use-game-feedback';
import { gameAudio } from '@/lib/audio';
import { useOnlineRoom } from '@/lib/use-online-room';
import { botPresentation } from '@/packages/rules/bot-presentation';
import {
  CosmeticsPicker,
  useLocalCosmetics,
} from '@/components/cosmetics-picker';
import { DEFAULT_LOADOUT } from '@/lib/cosmetics';
import { TablePanel } from '@/components/table-panel';
import { PublicTradeComposer } from '@/components/resource-bundle';
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
  const feedbackRoot = useRef<HTMLElement>(null);
  const feedback = useFeedbackPreferences();
  const [localFeedback, setLocalFeedback] = useState<{
    revision: number;
    move: Action['type'] | null;
  }>({ revision: 0, move: null });
  const appearance = useLocalCosmetics();
  const loadout = online.session
    ? (online.view?.cosmetics?.[online.view.seat] ?? DEFAULT_LOADOUT)
    : appearance.loadout;
  const sendOnline = online.send;
  const onlineSeed = online.view?.game?.seed;
  const [roomMenu, setRoomMenu] = useState(false);
  const [candidate, setCandidate] = useState<Action | null>(null);
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
      ? actor !== online.view?.seat || online.busy || !online.connected
      : game.players[actor].bot,
    local = !network && game.players.every((p) => !p.bot),
    viewer = network ? (online.view?.seat ?? 0) : local ? actor : 0,
    player = game.players[viewer];
  useGameFeedback(
    feedbackRoot,
    {
      game,
      hands: network ? online.view?.hands : undefined,
      playing: playing && (!network || online.connected),
      viewer,
      match: network ? online.session!.code : `local:${game.seed}`,
      revision: network ? (online.view?.revision ?? 0) : localFeedback.revision,
      move: network ? (online.view?.lastMove ?? null) : localFeedback.move,
    },
    feedback.level,
    feedback.reduced,
  );
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
        setLocalFeedback((previous) => ({
          revision: previous.revision + 1,
          move: a.type,
        }));
        const nextActor =
          next.phase === 'discard'
            ? next.discard.findIndex((n) => n > 0)
            : next.active;
        if (local && nextActor !== actor && next.phase !== 'over')
          setHandoff(true);
        setBuild(null);
        setNotice('');
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Unable to make that move.');
      }
    },
    [game, local, actor, network, bot, sendOnline],
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
  const preview =
    (candidate &&
      selectable.find(
        (a) => JSON.stringify(a) === JSON.stringify(candidate),
      )) ||
    null;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBuild(null);
        setCandidate(null);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const onBoardAction = (a: Action) => {
    if (a.type === 'raider') {
      setCandidate(a);
      return;
    }
    setCandidate(null);
    act(a);
  };
  function start(hotseat = false) {
    online.leave();
    const n = Number(seed);
    setGame(createGame(Number.isFinite(n) ? n >>> 0 : 42817, hotseat));
    setLocalFeedback({ revision: 0, move: null });
    setPlaying(true);
    setBuild(null);
    setCandidate(null);
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
          : network && actor !== viewer
            ? `${game.players[actor].name} is taking their turn...`
            : handoff
              ? 'Pass the device to the next player.'
              : bot
                ? `${game.players[actor].name} ${botThought}`
                : game.phase === 'setup-settlement'
                  ? `Place your ${game.setup < 4 ? 'first' : 'second'} settlement`
                  : game.phase === 'setup-road' || game.freeRoads
                    ? 'Build a road from your new settlement'
                    : game.phase === 'roll'
                      ? 'Your turn. Roll the dice.'
                      : game.phase === 'discard'
                        ? `Discard ${game.discard[actor]} resource cards`
                        : game.phase === 'raider'
                          ? 'Move the Raider (robber), then choose whom to steal from'
                          : build
                            ? `Choose a glowing location for your ${build}`
                            : 'Trade, build, or draw your next Fortune.';
  const tradeAction: Action =
      partner === -1
        ? { type: 'trade', give, want }
        : { type: 'barter', give, want, partner },
    validTrade =
      network && partner !== -1
        ? !bot &&
          game.phase === 'main' &&
          !game.freeRoads &&
          !online.view?.offer &&
          give !== want &&
          player.resources[give] > 0
        : all.some((a) => JSON.stringify(a) === JSON.stringify(tradeAction));
  function trade() {
    if (!validTrade) return;
    if (network) {
      if (partner === -1) act(tradeAction);
      else void online.send({ type: 'post-offer', give, want });
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
    <main
      className={`conquist${playing ? ' is-playing' : ''}`}
      ref={feedbackRoot}
      data-feedback-level={feedback.level}
      data-map-skin={loadout.map}
    >
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
      <output
        className="feedback-status"
        data-feedback-status
        aria-live="polite"
        aria-atomic="true"
      />
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
                mapSkin={loadout.map}
                feedbackLevel={feedback.level}
                reducedMotion={feedback.reduced}
                actions={selectable}
                onAction={onBoardAction}
                onPreview={setCandidate}
                preview={preview}
                view={view}
                lite={lite}
              />
              <div className="board-hint">
                <span className="hint-dot" />
                {build
                  ? 'Choose a highlighted location. Escape cancels.'
                  : 'Drag to orbit · Scroll to zoom'}
              </div>
              <div className="turn-prompt" aria-live="polite">
                <span style={{ background: COLORS[actor] }} />
                {message}
              </div>
              {!bot &&
                !handoff &&
                (preview ||
                  build ||
                  game.freeRoads > 0 ||
                  game.phase.startsWith('setup') ||
                  game.phase === 'raider') && (
                  <section
                    className="placement-panel"
                    aria-label="Placement controls"
                  >
                    <strong>
                      {preview
                        ? preview.type === 'raider'
                          ? 'Choose whom to steal from'
                          : `Confirm ${preview.type} placement`
                        : game.phase === 'setup-road' || game.freeRoads
                          ? 'Place a road beside your new settlement'
                          : game.phase === 'setup-settlement'
                            ? `Place your ${game.setup < 4 ? 'first' : 'second'} settlement`
                            : build
                              ? `Place your ${build}`
                              : 'Move the Raider to block a resource tile'}
                    </strong>
                    <p>
                      {preview
                        ? 'Choose an action below, or select a different location.'
                        : 'Glowing locations are legal. Hover to preview; tap to preview on touch screens.'}
                    </p>
                    {preview?.type === 'raider' ? (
                      <div className="victim-choices">
                        {all
                          .filter(
                            (a) => a.type === 'raider' && a.id === preview.id,
                          )
                          .map(
                            (a, i) =>
                              a.type === 'raider' && (
                                <button
                                  key={i}
                                  className="primary"
                                  onClick={() => {
                                    setCandidate(null);
                                    act(a);
                                  }}
                                >
                                  {a.victim === undefined ? (
                                    'Move here · no cards to steal'
                                  ) : (
                                    <>
                                      <span
                                        className={`avatar portrait portrait-${a.victim}`}
                                      />
                                      Steal from {game.players[a.victim].name}
                                    </>
                                  )}
                                </button>
                              ),
                          )}
                      </div>
                    ) : (
                      preview && (
                        <button
                          className="primary"
                          onClick={() => {
                            setCandidate(null);
                            act(preview);
                          }}
                        >
                          Confirm {preview.type}
                        </button>
                      )
                    )}
                    {(build || preview) && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setBuild(null);
                          setCandidate(null);
                        }}
                      >
                        Cancel selection · Esc
                      </button>
                    )}
                  </section>
                )}
            </section>
            <aside
              className="table-sidebar"
              aria-label="Players and table panels"
            >
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
                    data-player={i}
                    data-profile-skin={
                      network
                        ? online.view?.cosmetics?.[i]?.profile
                        : i === viewer
                          ? loadout.profile
                          : 'profile.classic'
                    }
                    key={i}
                    style={{ '--player': COLORS[i] } as React.CSSProperties}
                  >
                    <span
                      className="player-gain"
                      data-player-gain
                      aria-live="polite"
                    />
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
                          : score(
                              game,
                              i,
                              i !== viewer && game.phase !== 'over',
                            )}
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
                <button
                  className="rules-link"
                  onClick={() => setModal('rules')}
                >
                  <BookOpen size={15} /> Rules & build costs
                </button>
              </aside>
              <TablePanel
                key={online.session?.code ?? 'local'}
                online={online}
                game={game}
                viewer={viewer}
                canPost={
                  !bot && !handoff && game.phase === 'main' && !game.freeRoads
                }
                openTrade={() => {
                  if (network) setPartner(-2);
                  setModal('trade');
                }}
                activity={
                  <aside className="activity-panel">
                    <div className="panel-heading">
                      <span>ISLAND CHRONICLE</span>
                      <Compass size={15} />
                    </div>
                    <div
                      className="chronicle"
                      role="log"
                      aria-label="Game history"
                    >
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
                }
              />
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
                    data-resource={i}
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
                    <span
                      className="resource-delta"
                      data-resource-delta
                      aria-hidden="true"
                    />
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
                  onClick={() => {
                    setCandidate(null);
                    setBuild(build === key ? null : key);
                  }}
                >
                  <Icon size={21} />
                  <span>{name}</span>
                  <span className="build-cost" aria-label={`${name} cost`}>
                    {COSTS[key].map((n, i) => {
                      const ResourceIcon = icons[i];
                      return (
                        n > 0 && (
                          <span
                            key={i}
                            className={player.resources[i] < n ? 'missing' : ''}
                            title={`${n} ${RESOURCES[i]}`}
                          >
                            <ResourceIcon size={12} />
                            {n}
                          </span>
                        )
                      );
                    })}
                  </span>
                  <small>
                    {game.phase.startsWith('setup')
                      ? 'Setup placement'
                      : bot || handoff || game.phase !== 'main'
                        ? 'Not available now'
                        : COSTS[key].some((n, i) => player.resources[i] < n) &&
                            !(key === 'road' && game.freeRoads)
                          ? 'Missing cards'
                          : !all.some((a) => a.type === key)
                            ? 'No legal location'
                            : game.freeRoads && key === 'road'
                              ? 'Free road'
                              : 'Build now'}
                  </small>
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
                onClick={() => {
                  if (network) setPartner(-2);
                  setModal('trade');
                }}
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
                  {bot || handoff
                    ? 'Waiting for player'
                    : game.phase === 'setup-settlement'
                      ? 'Place a settlement'
                      : game.phase === 'setup-road' || game.freeRoads
                        ? 'Place a road'
                        : game.phase === 'raider'
                          ? 'Move the Raider'
                          : 'End turn'}{' '}
                  <ArrowRight size={18} />
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
                  <button key={i} onClick={() => onBoardAction(a)}>
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
                  Play solo, pass the device between four players, or invite
                  friends to an online room. Public trade posts stay open until
                  the turn ends; the owner chooses an interested player to
                  complete the exchange.
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
              <CosmeticsPicker
                loadout={loadout}
                disabled={network && (online.busy || !online.connected)}
                equip={(slot, id) => {
                  if (network)
                    void online.send({ type: 'equip-cosmetic', slot, id });
                  else appearance.equip(slot, id);
                }}
              />
              <label className="field">
                Game effects
                <select
                  value={feedback.level}
                  onChange={(event) =>
                    feedback.change(
                      event.target.value as 'full' | 'subtle' | 'off',
                    )
                  }
                >
                  <option value="full">Full</option>
                  <option value="subtle">Subtle</option>
                  <option value="off">Off</option>
                </select>
                <small>
                  {feedback.reduced
                    ? 'Reduced motion is enabled on your device. Movement effects are paused.'
                    : 'Controls resource flights, piece motion, and visual highlights. Sound has its own setting.'}
                </small>
              </label>
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
                Choose what to give and what you need.
              </DialogDescription>
              <div className="trade-targets">
                <button
                  className={partner === -1 ? 'selected' : ''}
                  onClick={() => setPartner(-1)}
                >
                  <Anchor size={16} /> Bank
                </button>
                {network && (
                  <button
                    className={partner !== -1 ? 'selected' : ''}
                    aria-pressed={partner !== -1}
                    onClick={() => setPartner(-2)}
                  >
                    <ArrowLeftRight size={16} /> Public post
                  </button>
                )}
                {!network &&
                  game.players.map(
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
              {network && partner !== -1 ? (
                <PublicTradeComposer
                  resources={player.resources}
                  disabled={
                    bot ||
                    !!online.view?.offer ||
                    game.phase !== 'main' ||
                    !!game.freeRoads
                  }
                  post={(giveCards, wantCards) => {
                    void online.send({
                      type: 'post-offer',
                      giveCards,
                      wantCards,
                    });
                    setModal(null);
                  }}
                />
              ) : (
                <>
                  <div className="trade-picker">
                    {(['give', 'want'] as const).map((side) => (
                      <fieldset key={side}>
                        <legend>
                          {side === 'give' ? 'You give' : 'You receive'}
                        </legend>
                        <div className="trade-resources">
                          {RESOURCES.map((resource, i) => {
                            const Icon = icons[i];
                            const amount =
                              side === 'give' && partner === -1
                                ? rate(game, viewer, i)
                                : 1;
                            const unavailable =
                              side === 'give'
                                ? player.resources[i] < amount
                                : i === give;
                            return (
                              <button
                                key={resource}
                                type="button"
                                aria-pressed={
                                  (side === 'give' ? give : want) === i
                                }
                                disabled={unavailable}
                                onClick={() =>
                                  side === 'give' ? setGive(i) : setWant(i)
                                }
                              >
                                <Icon size={22} />
                                <strong>
                                  {amount} {resource}
                                </strong>
                                <small>
                                  {side === 'give'
                                    ? `${player.resources[i]} in hand`
                                    : partner === -1
                                      ? `${game.bank[i]} in bank`
                                      : 'Request from players'}
                                </small>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                  <p className="trade-summary">
                    Give {partner === -1 ? rate(game, viewer, give) : 1}{' '}
                    {RESOURCES[give]} <ArrowRight size={16} /> Receive 1{' '}
                    {RESOURCES[want]}
                  </p>
                  <p className="muted">
                    {partner === -1
                      ? 'Your best harbour rate is applied automatically.'
                      : network
                        ? 'Open until your turn ends. Players join, then you choose who to trade with. You can keep building while you wait.'
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
                    {partner === -1
                      ? 'Trade with bank'
                      : network
                        ? 'Post for everyone'
                        : 'Offer trade'}{' '}
                    <ArrowLeftRight size={18} />
                  </button>
                  {!validTrade && (
                    <p className="muted">
                      {network && partner !== -1 && online.view?.offer
                        ? 'You already have a public post. Cancel it to post a different trade.'
                        : 'Choose different resources. You need enough cards to give, and bank trades need stock in the bank.'}
                    </p>
                  )}
                </>
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
