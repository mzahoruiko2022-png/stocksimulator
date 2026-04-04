import { useCallback, useState } from "react";
import { decQty, formatQtyDisplay, incQty, maxOrderShares, round4 } from "./tradeQty";
import "./TradeQtyStepper.css";

type Props = {
  id: string;
  labelledBy: string;
  value: number;
  onChange: (n: number) => void;
  maxBuy: number;
  own: number;
}

const QTY_INPUT_PATTERN = /^\d*\.?\d{0,4}$/;

/**
 * Order size: type a value, or use +/−/Max.
 */
export function TradeQtyStepper({ id, labelledBy, value, onChange, maxBuy, own }: Props) {
  const mo = maxOrderShares(maxBuy, own);
  const v = value;
  const canInc = mo > 0 && v < mo - 1e-8;
  const canDec = v > 1e-8;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = useCallback(() => {
    if (!editing) return;
    const trimmed = draft.trim().replace(/,/g, "");
    if (trimmed === "" || trimmed === ".") {
      onChange(0);
    } else {
      const parsed = parseFloat(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        onChange(0);
      } else {
        onChange(round4(Math.min(parsed, mo)));
      }
    }
    setEditing(false);
    setDraft("");
  }, [draft, editing, mo, onChange]);

  const displayValue = editing ? draft : formatQtyDisplay(v);

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
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="tqs-out tabular"
        aria-label="Order size in shares"
        value={displayValue}
        onFocus={() => {
          setEditing(true);
          setDraft(formatQtyDisplay(v));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            setDraft("");
            return;
          }
          if (!QTY_INPUT_PATTERN.test(raw)) return;
          setDraft(raw);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
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
