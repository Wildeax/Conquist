'use client';
import { ArrowRight, Handshake } from 'lucide-react';
import { ResourceBundle } from '@/components/resource-bundle';
import { offerCards, ownsCards } from '@/packages/rules/trading';
import { COLORS, type Game } from '@/packages/rules/game';
import type { Command, Offer } from '@/server/rooms';

export function TradePost({
  offer,
  game,
  viewer,
  disabled,
  send,
}: {
  offer: Offer;
  game: Game;
  viewer: number;
  disabled: boolean;
  send: (command: Command) => Promise<void>;
}) {
  const cards = offerCards(offer);
  const owner = viewer === offer.owner;
  const joined = offer.interested.includes(viewer);
  const canGive = ownsCards(game.players[viewer].resources, cards.want);
  const canFinish =
    game.phase === 'main' &&
    !game.freeRoads &&
    ownsCards(game.players[viewer].resources, cards.give);
  return (
    <details className="trade-post" open key={offer.id}>
      <summary>
        <Handshake size={18} />
        <span>
          {owner
            ? 'Your public trade'
            : `${game.players[offer.owner].name}'s trade`}
        </span>
        <small>{offer.interested.length} interested</small>
      </summary>
      <div className="trade-post-body">
        <p className="trade-expiry">Open until this turn ends</p>
        <div className="trade-exchange">
          <div>
            <small>{owner ? 'You give' : 'You receive'}</small>
            <ResourceBundle cards={cards.give} />
          </div>
          <ArrowRight size={20} />
          <div>
            <small>{owner ? 'You receive' : 'You give'}</small>
            <ResourceBundle cards={cards.want} />
          </div>
        </div>
        {owner ? (
          <>
            <p>
              {offer.interested.length
                ? 'Choose a player to complete the trade.'
                : 'Waiting for interested players. You can keep playing.'}
            </p>
            <div className="trade-interested">
              {offer.interested.map((seat) => (
                <button
                  key={seat}
                  className="primary"
                  disabled={disabled || !canFinish}
                  onClick={() =>
                    void send({
                      type: 'choose-trader',
                      offerId: offer.id,
                      partner: seat,
                    })
                  }
                >
                  <span
                    className={`avatar portrait portrait-${seat} trade-avatar`}
                    style={{ background: COLORS[seat] }}
                  />{' '}
                  Trade with {game.players[seat].name}
                </button>
              ))}
            </div>
            {!canFinish && (
              <p className="muted">
                You need the offered cards and must finish any pending move
                before confirming.
              </p>
            )}
            <button
              className="secondary"
              disabled={disabled}
              onClick={() =>
                void send({ type: 'cancel-offer', offerId: offer.id })
              }
            >
              Cancel post
            </button>
          </>
        ) : (
          <>
            <output>
              {joined
                ? 'You joined. The owner chooses who to trade with.'
                : canGive
                  ? 'Join this offer to let the owner know you want to trade.'
                  : 'You need all requested cards to join.'}
            </output>
            <button
              className={joined ? 'secondary' : 'primary'}
              disabled={disabled || (!joined && !canGive)}
              onClick={() =>
                void send({
                  type: 'respond',
                  offerId: offer.id,
                  accept: !joined,
                })
              }
            >
              {joined ? 'Withdraw interest' : 'I want this trade'}
            </button>
            <small>No cards move until the owner confirms.</small>
          </>
        )}
      </div>
    </details>
  );
}
