import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AdminOverlay from "./AdminOverlay";

it("places the dialog outside the page and restores scrolling after closing", async () => {
  const host = document.createElement("div");
  host.className = "admin-app";
  document.body.append(host);
  const close = vi.fn();
  const view = render(<main><AdminOverlay className="modal-backdrop" onMouseDown={close}><button>Save</button></AdminOverlay></main>, { container: host });
  const dialog = screen.getByRole("dialog");
  expect(dialog.parentElement).toBe(host);
  expect(document.body.style.overflow).toBe("hidden");
  await waitFor(() => expect(screen.getByRole("button")).toHaveFocus());
  fireEvent.mouseDown(screen.getByRole("button"));
  expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(document.body.style.overflow).toBe("");
  host.remove();
});
