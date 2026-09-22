import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from "./theme";

function ThemeControl() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  vi.unstubAllGlobals();
});

describe("public theme", () => {
  it("restores a saved theme before using the system preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));

    render(
      <ThemeProvider>
        <ThemeControl />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("uses light on first visit and persists an explicit toggle", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    render(
      <ThemeProvider>
        <ThemeControl />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "light" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
