import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Services from "./Services";

vi.mock("../shared/hooks", () => ({ useServices: () => ({ state: "ready", services: [
  { id: 1, slug: "hair", name: "Hair", persian_name: "موی کوتاه", category_name: "مو", duration: 40, price: 100 },
  { id: 2, slug: "nails", name: "Nails", persian_name: "مانیکور", category_name: "ناخن", duration: 50, price: 200 },
] }) }));
vi.mock("../shared/api", () => ({ toman: (value) => `${value} تومان` }));

beforeEach(() => window.localStorage.clear());
it("keeps page filtering minimal and leaves search out of the content area", () => {
  render(<MemoryRouter><Services /></MemoryRouter>);
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "مو" }));
  expect(screen.getByRole("heading", { name: "موی کوتاه" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "مانیکور" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "همه" }));
  expect(screen.getByRole("heading", { name: "مانیکور" })).toBeInTheDocument();
});
it("stores an explicit view preference", () => {
  render(<MemoryRouter><Services /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "فشرده" }));
  expect(window.localStorage.getItem("baharnaj:view:services")).toBe("compact");
  expect(document.querySelector(".service-grid-compact")).toBeInTheDocument();
});
