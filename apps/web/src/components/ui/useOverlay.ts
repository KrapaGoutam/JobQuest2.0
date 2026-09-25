import { useEffect, useRef, type RefObject } from 'react';

/*
 * Shared modal behaviour for Dialog and Drawer (M3 fix of the M2 primitives).
 *
 * M3 is the first screen that stacks overlays (a Move Stage / Outcome / Edit dialog
 * opened from the detail drawer). The M2 primitives each listened on `window`, so one
 * Escape closed every open overlay, focus traps fought each other, and a drawer whose
 * `onClose` changed identity on every render re-ran its effect and stole focus back.
 *
 *  - A module-level stack: only the TOPMOST overlay reacts to Escape / Tab.
 *  - `onClose` is read through a ref, so the effect runs only when `isOpen` changes.
 *  - Body scroll lock is counted, so closing a nested dialog keeps the drawer's lock.
 *  - Focus moves into the overlay on open and returns to the trigger on close.
 */
const stack: symbol[] = [];
let scrollLocks = 0;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useOverlay(isOpen: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const id = Symbol('overlay');
    stack.push(id);
    const trigger = document.activeElement as HTMLElement | null;
    if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      const node = ref.current;
      if (!node) return;
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }, 50);

    const onKeyDown = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return; // only the topmost overlay handles keys
      const node = ref.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab' && node) {
        const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (!node.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (--scrollLocks === 0) document.body.style.overflow = '';
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [isOpen, ref]);
}
