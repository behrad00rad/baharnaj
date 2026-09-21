import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerApp from "./CustomerApp";

const { get, post, logoutSession } = vi.hoisted(() => ({ get: vi.fn(() => Promise.resolve({ data: {
  customer: { display_name: "سارا", phone: "09121234567" },
  next_appointment: null,
  unread_notification_count: 0,
  upcoming_count: 0,
  recent_history_count: 0,
} })), post: vi.fn(() => Promise.resolve({ data: {} })), logoutSession: vi.fn(() => Promise.resolve()) }));

vi.mock("../shared/api", () => ({ api: { get, post, patch: vi.fn() }, logoutSession }));

describe("customer dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: {
      customer: { display_name: "سارا", phone: "09121234567" },
      next_appointment: null,
      unread_notification_count: 0,
      upcoming_count: 0,
      recent_history_count: 0,
    } });
  });

  it("renders the safe empty state without guest lookup", async () => {
    render(<MemoryRouter initialEntries={["/account"]}><CustomerApp /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveAccessibleName("در حال دریافت اطلاعات");
    await waitFor(() => expect(screen.getByText("هنوز نوبت آینده‌ای ندارید")).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith("customer/dashboard/");
    expect(screen.getByRole("link", { name: "شروع رزرو" })).toHaveAttribute("href", "/book");
  });

  it("shows accurate partial-payment wording and paginates appointments", async () => {
    get.mockResolvedValue({ data: {
      count: 21,
      next: "next-page",
      previous: null,
      results: [{
        id: 4,
        status: "confirmed",
        date: "2026-10-01",
        start_time: "10:00",
        confirmation_code: "BH-4",
        payment_status: "partially_paid",
        services: [{ name: "کوتاهی", specialist: "مینا", price: 500 }],
        capabilities: {},
      }],
    } });
    render(<MemoryRouter initialEntries={["/account/appointments"]}><CustomerApp /></MemoryRouter>);

    expect(await screen.findByText("پرداخت جزئی")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "صفحه بعد" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("customer/appointments/?filter=upcoming&page=2"));
  });

  it("marks a notification read before opening its safe account target", async () => {
    get.mockResolvedValue({ data: {
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 9, title: "زمان نوبت", message: "زمان تغییر کرد.", is_read: false, created_at: "2026-09-20T10:00:00Z", target_url: "/account/appointments/4" }],
    } });
    render(<MemoryRouter initialEntries={["/account/notifications"]}><CustomerApp /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: "مشاهده" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("customer/notifications/9/read/"));
  });
});
