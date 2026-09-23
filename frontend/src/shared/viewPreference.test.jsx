import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useViewPreference } from "./viewPreference";

function PreferenceExample() {
  const [mode] = useViewPreference("services", "auto");
  return <div data-testid="mode" data-mode={mode}>نمایش</div>;
}

afterEach(() => window.localStorage.clear());
it("hydrates the stable default before applying a saved browser preference", () => {
  window.localStorage.setItem("baharnaj:view:services", "compact");
  const container = document.createElement("div");
  container.innerHTML = renderToString(<PreferenceExample />);
  document.body.appendChild(container);
  expect(container.firstElementChild).toHaveAttribute("data-mode", "auto");
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<PreferenceExample />, { container, hydrate: true });
    expect(screen.getByTestId("mode")).toHaveAttribute("data-mode", "compact");
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match/i);
  } finally {
    errors.mockRestore();
    container.remove();
  }
});
