import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../shared/theme";
import { PublicLayout } from "./PublicLayout";

const { get } = vi.hoisted(() => ({
  get: vi.fn((endpoint) => Promise.resolve({
    data: endpoint === "services/"
      ? [{ id: 1, slug: "hair-color", persian_name: "رنگ مو" }]
      : endpoint === "blog/posts/"
        ? [{ id: 2, slug: "hair-care", title: "مراقبت از مو" }]
        : [{ id: 3, name: "کیمیا", specialty: "مو" }],
  })),
}));

vi.mock("../shared/api", () => ({ api: { get } }));

it("opens a compact navbar search and finds public content", async () => {
  render(<MemoryRouter><ThemeProvider><PublicLayout><p>محتوا</p></PublicLayout></ThemeProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "باز کردن جست‌وجو" }));
  const search = screen.getByRole("searchbox", { name: "جست‌وجو در بهارناژ" });
  fireEvent.change(search, { target: { value: "مو" } });
  expect(await screen.findByRole("link", { name: /رنگ مو/ })).toHaveAttribute("href", "/services/hair-color");
  expect(screen.getByRole("link", { name: /مراقبت از مو/ })).toHaveAttribute("href", "/blog/hair-care");
  expect(screen.getByRole("link", { name: /کیمیا/ })).toHaveAttribute("href", "/team");
});
