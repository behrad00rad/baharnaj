import { useEffect, useRef } from "react";

// Keep overlays keyboard-contained, restore focus and preserve prior scroll state.
export function useFocusScope(open, scopeRef, onClose, triggerRef) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = triggerRef?.current || document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => [...(scopeRef.current?.querySelectorAll('a[href],button:not(:disabled),input,select,textarea,[tabindex="0"]') || [])];
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const keyboard = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") {
        const nodes = controls();
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyboard);
      previous?.focus?.();
    };
  }, [open, scopeRef, triggerRef]);
}
