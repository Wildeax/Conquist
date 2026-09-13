'use client';
import { useState } from 'react';
import { TreePine, BrickWall, Cloud, Wheat, Mountain } from 'lucide-react';
import { RESOURCES } from '@/packages/rules/game';
const icons = [TreePine, BrickWall, Cloud, Wheat, Mountain];
export function ResourceBundle({ cards }: { cards: number[] }) {
  return (
    <div className="resource-bundle">
      {cards.map((count, i) => {
        const Icon = icons[i];
        return count > 0 ? (
          <span className={`trade-card res-${i}`} key={i}>
            <Icon size={20} />
            <b>{count}</b>
            <small>{RESOURCES[i]}</small>
          </span>
        ) : null;
      })}
    </div>
  );
}
export function PublicTradeComposer({
  resources,
  disabled,
  post,
}: {
  resources: number[];
  disabled: boolean;
  post: (give: number[], want: number[]) => void;
}) {
  const [give, setGive] = useState([0, 0, 0, 0, 0]);
  const [want, setWant] = useState([0, 0, 0, 0, 0]);
  const ready =
    give.some(Boolean) &&
    want.some(Boolean) &&
    give.every((n, i) => n <= resources[i] && !(n && want[i]));
  return (
    <div className="bundle-composer">
      <p>
        Offer any combination of cards. Players join, then you choose your
        trading partner.
      </p>
      {(['give', 'want'] as const).map((side) => (
        <fieldset key={side}>
          <legend>{side === 'give' ? 'You give' : 'You receive'}</legend>
          <div className="bundle-choices">
            {RESOURCES.map((name, i) => {
              const cards = side === 'give' ? give : want,
                update = side === 'give' ? setGive : setWant,
                opposite = side === 'give' ? want : give;
              const Icon = icons[i];
              return (
                <div key={name} className="bundle-choice">
                  <Icon size={20} />
                  <span>{name}</span>
                  <small>
                    {side === 'give' ? `${resources[i]} in hand` : 'Request'}
                  </small>
                  <div>
                    <button
                      type="button"
                      aria-label={`Remove ${name} from ${side}`}
                      disabled={disabled || cards[i] === 0}
                      onClick={() =>
                        update(cards.map((n, j) => (j === i ? n - 1 : n)))
                      }
                    >
                      −
                    </button>
                    <output aria-label={`${name} to ${side}`}>
                      {cards[i]}
                    </output>
                    <button
                      type="button"
                      aria-label={`Add ${name} to ${side}`}
                      disabled={
                        disabled ||
                        opposite[i] > 0 ||
                        cards[i] >= (side === 'give' ? resources[i] : 19)
                      }
                      onClick={() =>
                        update(cards.map((n, j) => (j === i ? n + 1 : n)))
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="muted">
        Your post stays open until your turn ends. Cards move only after you
        confirm a player.
      </p>
      <button
        className="primary"
        disabled={disabled || !ready}
        onClick={() => post(give, want)}
      >
        Post trade for everyone
      </button>
    </div>
  );
}
