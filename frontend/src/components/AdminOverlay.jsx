import { useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusScope } from "../shared/useFocusScope";

// Keep dialogs outside animated pages and their stacking/overflow boundaries,
// while retaining the admin theme variables and RTL direction.
export default function AdminOverlay({ children, onMouseDown, ...props }) {
  const ref = useRef(null);
  useFocusScope(true, ref, () => onMouseDown?.());
  return createPortal(
    <div {...props} ref={ref} role="dialog" aria-modal="true" aria-label="فرم مدیریت"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onMouseDown?.(event); }}>
      {children}
    </div>,
    document.querySelector(".admin-app") || document.body,
  );
}
