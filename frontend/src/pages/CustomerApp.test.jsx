import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CustomerApp from "./CustomerApp";

const { get } = vi.hoisted(() => ({ get: vi.fn(() => Promise.resolve({ data: {
  customer: { display_name: "سارا", phone: "09121234567" },
  next_appointment: null,
  unread_notification_count: 0,
  upcoming_count: 0,
  recent_history_count: 0,
} })) }));

vi.mock("../shared/api", () => ({ api: { get, post: vi.fn(), patch: vi.fn() } }));

describe("customer dashboard", () => {
  it("renders the safe empty state without guest lookup", async () => {
    render(<MemoryRouter initialEntries={["/account"]}><CustomerApp /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("دریافت");
    await waitFor(() => expect(screen.getByText("هنوز نوبت آینده‌ای ندارید")).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith("customer/dashboard/");
    expect(screen.getByRole("link", { name: "شروع رزرو" })).toHaveAttribute("href", "/book");
  });
});
