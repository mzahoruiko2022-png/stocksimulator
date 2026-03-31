import { decQty, formatQtyDisplay, incQty, maxOrderShares } from "./tradeQty";
import "./TradeQtyStepper.css";

type Props = {
  id: string;
  labelledBy: string;
  value: number;
  onChange: (n: number) => void;
  maxBuy: number;
  own: number;
};

/**
 * Order size only (+/−/Max). No typing — avoids confusing “shares I want” with position.
 */
export function TradeQtyStepper({ id, labelledBy, value, onChange, maxBuy, own }: Props) {
  const mo = maxOrderShares(maxBuy, own);
  const v = value;
  const canInc = mo > 0 && v < mo - 1e-8;
  const canDec = v > 1e-8;

  return (
    <div className="tqs" role="group" aria-labelledby={labelledBy}>
      <button
        type="button"
        className="tqs-btn"
        disabled={!canDec}
        aria-label="Decrease order size"
        onClick={() => onChange(decQty(v))}
      >
        −
      </button>
      <div id={id} className="tqs-out tabular" aria-live="polite" aria-label="Order size in shares">
        {formatQtyDisplay(v)}
      </div>
      <button
        type="button"
        className="tqs-btn"
        disabled={!canInc}
        aria-label="Increase order size"
        onClick={() => onChange(incQty(v, mo))}
      >
        +
      </button>
      <button
        type="button"
        className="tqs-max"
        disabled={mo <= 0}
        aria-label="Set order size to maximum allowed"
        onClick={() => onChange(mo)}
      >
        Max
      </button>
    </div>
  );
}
