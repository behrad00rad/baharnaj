import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Booking from "./Booking";
import { MemoryRouter } from "react-router-dom";

const { get, post } = vi.hoisted(() => ({
  get: vi.fn((url) =>
    Promise.resolve({
      data: url.startsWith("employees/")
        ? [{ id: 7, name: "متخصص" }]
        : { slots: ["10:00"] },
    }),
  ),
  post: vi.fn((url) =>
    Promise.resolve({
      data:
        url === "appointments/"
          ? { confirmation_code: "ABC", items: [] }
          : { token: "hold", expires_at: "later" },
    }),
  ),
}));
vi.mock("../shared/hooks", () => ({
  useServices: () => ({
    services: [
      {
        id: 1,
        name: "Cut",
        persian_name: "کوتاهی",
        price: 800,
        duration: 60,
        category_name: "مو",
      },
      {
        id: 2,
        name: "Color",
        persian_name: "رنگ",
        price: 1200,
        duration: 60,
        category_name: "مو",
      },
    ],
  }),
}));
vi.mock("../components/DatePicker", () => ({
  DateModal: ({ onChange }) => (
    <button type="button" onClick={() => onChange("2026-08-31")}>
      انتخاب تاریخ آزمایشی
    </button>
  ),
}));
vi.mock("../shared/api", () => ({
  api: { get, post, delete: vi.fn(() => Promise.resolve()) },
  requestErrorMessage: (error, fallback) => error?.response?.status === 429 ? "تعداد درخواست‌ها زیاد است. لطفاً ۱ دقیقه دیگر دوباره تلاش کنید." : fallback,
  toman: (value) => `${value} تومان`,
}));

describe("booking wizard", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/book");
  });

  it("moves from service selection to employee selection without showing a false empty state", async () => {
    render(
      <MemoryRouter>
        <Booking />
      </MemoryRouter>,
    );
    expect(screen.getByText("سرویس‌ت را انتخاب کن.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /کوتاهی/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /کوتاهی/ }));
    fireEvent.click(screen.getByRole("button", { name: /انتخاب متخصص/ }));
    expect(screen.getByText("متخصصت را انتخاب کن.")).toBeInTheDocument();
    expect(screen.queryByText("متخصص فعالی برای این سرویس پیدا نشد.")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /متخصص/ })).toBeInTheDocument();
  });

  it("preserves the previous specialist when booking again", async () => {
    render(
      <MemoryRouter initialEntries={[{
        pathname: "/book",
        state: { bookAgain: { services: [{ id: 1, preferred_employee: 7 }] } },
      }]}>
        <Booking />
      </MemoryRouter>,
    );

    expect(screen.getByText("متخصصت را انتخاب کن.")).toBeInTheDocument();
    const specialist = await screen.findByRole("button", { name: /متخصص/ });
    expect(specialist).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /انتخاب تاریخ و ساعت/ })).toBeEnabled();
  });

  it.each(["pending", "confirmed"])("submits sequential held items and reports server status %s", async (status) => {
    post.mockClear();
    post.mockImplementation((url) => Promise.resolve({ data: url === "appointments/" ? { confirmation_code: "ABC", status, items: [] } : { token: "hold", expires_at: "later" } }));
    render(
      <MemoryRouter>
        <Booking />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /کوتاهی/ }));
    fireEvent.click(screen.getByRole("button", { name: /رنگ/ }));
    fireEvent.click(screen.getByRole("button", { name: /انتخاب متخصص/ }));
    await screen.findAllByRole("button", { name: /متخصص/ });
    fireEvent.click(screen.getAllByRole("button", { name: /متخصص/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /متخصص/ })[1]);
    fireEvent.click(
      screen.getByRole("button", { name: /انتخاب تاریخ و ساعت/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "تاریخ نوبت" }));
    fireEvent.click(
      screen.getByRole("button", { name: /انتخاب تاریخ آزمایشی/ }),
    );
    await screen.findByRole("button", { name: "10:00" });
    fireEvent.click(screen.getByRole("button", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: /ادامه/ }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("booking-holds/", {
        items: expect.any(Array),
      }),
    );
    const heldItems = post.mock.calls[0][1].items;
    expect(heldItems).toMatchObject([
      { service: 1, start_time: "10:00", end_time: "11:00" },
      { service: 2, start_time: "11:00", end_time: "12:00" },
    ]);
    fireEvent.change(screen.getByLabelText("نام و نام خانوادگی"), {
      target: { value: "بهار" },
    });
    fireEvent.change(screen.getByLabelText("شماره موبایل"), {
      target: { value: "09121234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: /بررسی اطلاعات/ }));
    fireEvent.click(screen.getByRole("button", { name: /ثبت نهایی رزرو/ }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "appointments/",
        expect.objectContaining({ items: heldItems }),
      ),
    );
    const appointmentPayload = post.mock.calls.find(([url]) => url === "appointments/")[1];
    expect(appointmentPayload).not.toHaveProperty("account_password");
    expect(appointmentPayload).not.toHaveProperty("account_password_confirm");
    expect(appointmentPayload).not.toHaveProperty("account_email");
    expect(await screen.findByRole("heading", {name: status === "confirmed" ? "نوبت شما تأیید شد." : "درخواست نوبت دریافت شد."})).toBeInTheDocument();
  });

  it("shows an expired hold and returns to availability with one action", async () => {
    post.mockImplementation((url) => Promise.resolve({ data: url === "booking-holds/" ? { token: "expired-hold", expires_at: "2000-01-01T00:00:00Z" } : {} }));
    render(<MemoryRouter><Booking /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /کوتاهی/ }));
    fireEvent.click(screen.getByRole("button", { name: /انتخاب متخصص/ }));
    fireEvent.click(await screen.findByRole("button", { name: /متخصص/ }));
    fireEvent.click(screen.getByRole("button", { name: /انتخاب تاریخ و ساعت/ }));
    fireEvent.click(screen.getByRole("button", { name: "تاریخ نوبت" }));
    fireEvent.click(screen.getByRole("button", { name: /انتخاب تاریخ آزمایشی/ }));
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: /ادامه/ }));
    expect(await screen.findByText("زمان نگهداری این نوبت تمام شد.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "بررسی دوباره ساعت‌ها" }));
    expect(screen.getByText("زمان مناسب را پیدا کن.")).toBeInTheDocument();
  });
});
