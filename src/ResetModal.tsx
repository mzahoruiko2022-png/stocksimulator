import { useEffect, useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ResetModal({ open, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="rh-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="rh-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rh-reset-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rh-reset-title" className="rh-modal-title">
          Reset game?
        </h2>
        <p className="rh-modal-warning">
          This will permanently clear your cash, all stock positions, and your portfolio chart history. You will start
          over and choose a new starting amount.
        </p>
        <p className="rh-modal-question">Are you sure you want to reset?</p>
        <div className="rh-modal-actions">
          <button type="button" className="rh-modal-btn rh-modal-btn--no" onClick={onCancel}>
            No
          </button>
          <button type="button" className="rh-modal-btn rh-modal-btn--yes" onClick={onConfirm}>
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
