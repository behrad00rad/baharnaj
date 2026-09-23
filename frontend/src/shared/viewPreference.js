import { useEffect, useState } from "react";

export function useViewPreference(key, fallback) {
  const [mode, setMode] = useState(fallback);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`baharnaj:view:${key}`);
      if (saved === "visual" || saved === "compact") setMode(saved);
      else if (fallback === "auto") setMode(window.matchMedia("(max-width: 640px)").matches ? "compact" : "visual");
    } catch { /* Storage may be unavailable. */ }
  }, [key, fallback]);
  const choose = (next) => {
    setMode(next);
    try { window.localStorage.setItem(`baharnaj:view:${key}`, next); } catch { /* Preference remains in memory. */ }
  };
  return [mode, choose];
}
