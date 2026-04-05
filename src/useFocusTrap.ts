import { useEffect, type RefObject } from "react";

/**
 * Keeps Tab focus inside `rootRef` while `active` is true.
 * Focuses the first focusable element when activated.
 */
export function useFocusTrap(active: boolean, rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active || !rootRef.current) return;
    const root = rootRef.current;
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getList = () => Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const focusFirst = () => {
      const list = getList();
      list[0]?.focus();
    };
    focusFirst();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = getList();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [active, rootRef]);
}
