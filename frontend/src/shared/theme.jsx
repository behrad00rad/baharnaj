import { createContext, useContext, useMemo, useState } from "react";

export const THEME_STORAGE_KEY = "baharnaj-theme";
export const TEXT_SIZE_STORAGE_KEY = "baharnaj-text-size";
function readPreference(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
function savePreference(key, value) { try { window.localStorage.setItem(key, value); } catch { /* Preferences still work for this session. */ } }
const ThemeContext = createContext(null);

function preferredTheme() {
  if (typeof window === "undefined") return "light";
  const saved = readPreference(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const initial = preferredTheme();
    if (typeof document !== "undefined") applyTheme(initial);
    return initial;
  });

  const [textSize, setTextSizeState] = useState(() => {
    const saved = readPreference(TEXT_SIZE_STORAGE_KEY);
    const size = ["compact", "normal", "large"].includes(saved) ? saved : "normal";
    document.documentElement.dataset.textSize = size;
    return size;
  });
  const value = useMemo(
    () => ({
      theme,
      textSize,
      setTextSize(size) {
        if (!["compact", "normal", "large"].includes(size)) return;
        savePreference(TEXT_SIZE_STORAGE_KEY, size);
        document.documentElement.dataset.textSize = size;
        setTextSizeState(size);
      },
      setTheme(nextTheme) {
        if (nextTheme !== "light" && nextTheme !== "dark") return;
        savePreference(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        setThemeState(nextTheme);
      },
      toggleTheme() {
        const nextTheme = theme === "dark" ? "light" : "dark";
        savePreference(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        setThemeState(nextTheme);
      },
    }),
    [theme, textSize],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
