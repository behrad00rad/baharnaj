import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdminRouter from "./AdminApp";

const { get, post, mockState } = vi.hoisted(() => ({
  mockState: { pendingPayment: false },
  get: vi.fn((endpoint) => {
    if (mockState.pendingPayment && endpoint.startsWith("admin/payments/?"))
      return Promise.resolve({
        data: [
          {
            id: 31,
            appointment: 20,
            amount: 800,
            payment_method: "cash",
            status: "pending",
            customer_name: "Customer",
            reporter_name: "Stylist",
            created_by: 2,
          },
        ],
      });
    const current = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    if (endpoint.startsWith("admin/appointments/?"))
      return Promise.resolve({
        data: [
          {
            id: 20,
            customer_name: "Today Customer",
            status: "pending",
            items: [
              {
                id: 21,
                date: current,
                start_time: "10:00",
                end_time: "11:00",
                service: 3,
                service_name: "Cut",
                employee_name: "Stylist",
              },
            ],
          },
        ],
      });
    const normalizedEndpoint = endpoint.split("?")[0];
    const data =
      {
        "admin/employees/": [],
        "admin/employee-eligible-users/": [
          { id: 9, username: "eligible-user", first_name: "Eligible User" },
        ],
        "admin/service-categories/": [{ id: 4, name: "Hair" }],
        "services/": [
          { id: 3, persian_name: "Cut", is_active: true, is_bookable: true },
        ],
        "admin/customer-options/": [{ id: 2, name: "Customer" }],
        "admin/gallery/": [],
        "admin/gallery-categories/": [{ id: 5, name: "مو" }],
        "admin/statistics/": {
          today: {
            appointments: 1,
            pending: 1,
            confirmed: 0,
            completed: 0,
            cancelled: 0,
          },
          week: { appointments: 4 },
          month: { appointments: 9 },
          top_services: [{ id: 3, name: "Cut", appointments: 3 }],
          revenue: { today: 700, week: 2400, month: 9100 },
          revenue_available: true,
        },
        "admin/payments/": [
          {
            id: 31,
            appointment: 20,
            amount: 800,
            payment_method: "card",
            status: "paid",
            refundable_total: 700,
            refunds: [
              {
                id: 32,
                amount: 100,
                reason: "اصلاح مبلغ",
                status: "completed",
              },
            ],
          },
        ],
        "admin/refunds/": [
          {
            id: 32,
            payment: 31,
            amount: 100,
            reason: "اصلاح مبلغ",
            status: "completed",
          },
        ],
        "admin/transactions/": [
          {
            id: 33,
            appointment: 20,
            amount: 800,
            type: "payment",
            description: "",
          },
        ],
        "admin/commissions/": [
          {
            id: 34,
            employee: 2,
            employee_name: "Stylist",
            service_name: "Cut",
            base_amount: 800,
            commission_amount: 80,
            status: "pending",
          },
        ],
        "admin/revenue/": {
          received: 800,
          refunded: 100,
          net_revenue: 700,
          pending_reports: 0,
          outstanding: 0,
          service_revenue: 800,
          commission_total: 80,
          series: [{ date: "2026-09-01", revenue: 700, payments: 1, appointments: 1, commission: 80, average_payment: 800 }],
          methods: [],
          services: [{ id: 3, name: "Cut", category: "Hair", revenue: 800, paid_services: 1, share: 100 }],
          employees: [{ id: 2, name: "Stylist", specialty: "Hair", profile_photo_url: "", confirmed_revenue: 800, net_revenue: 700, refunds: 100, commission: 80, completed_services: 1, appointments: 1, payments: 1, pending_reports: 0, outstanding: 0, average_payment: 800 }],
        },
        "admin/employees/2/finance/": {
          employee: { id: 2, name: "Stylist", specialty: "Hair", profile_photo_url: "" },
          received: 800,
          net_revenue: 700,
          refunded: 100,
          commission_total: 80,
          completed_services: 1,
          completed_appointments: 1,
          payments_count: 1,
          average_payment: 800,
          pending_reports: 0,
          outstanding: 0,
          series: [{ date: "2026-09-01", revenue: 700, payments: 1, appointments: 1, commission: 80, services: 1 }],
          payments: [{ id: 31, date: "2026-09-01T10:00:00Z", customer: "Customer", appointment: 20, services: ["Cut"], amount: 800, employee_amount: 800, method: "card", status: "paid", refunded: 100 }],
          transactions: [{ id: 33, date: "2026-09-01T10:00:00Z", type: "payment", amount: 800, employee_amount: 800, customer: "Customer", appointment: 20, services: ["Cut"], payment_status: "paid" }],
          appointments: [{ id: 20, date: "2026-09-01", customer: "Customer", services: ["Cut"], status: "completed", payment_status: "paid", total: 800, paid: 800, employee_outstanding: 0 }],
          services_performed: [{ id: 21, date: "2026-09-01", customer: "Customer", appointment: 20, service: "Cut", amount: 800, status: "completed", appointment_status: "completed", payment_status: "paid", commission: 80 }],
        },
        "admin/activity/": [],
        "admin/customers/": [{ id: 41, user_id: 51, name: "مریم احمدی", phone: "09121234567", is_guest: false, identity_conflict: false, account_status: "active", upcoming_visit: "2026-09-25", previous_visit: "2026-08-20", total_spending: 1500, appointment_count: 3, no_show_count: 1, notes: "مشتری قدیمی", tags: "VIP", preferences: { operational_reminders: true, promotional_messages: false } }],
        "admin/time-off/": [{ id: 61, employee_name: "سارا", start_date: "2026-09-25", end_date: "2026-09-26", reason: "کار شخصی", status: "pending", review_notes: "" }],
      }[normalizedEndpoint] || [];
    return Promise.resolve({ data });
  }),
  post: vi.fn((endpoint) =>
    Promise.resolve({
      data:
        endpoint === "admin/gallery-categories/" ? { id: 6, name: "ناخن" } : {},
    }),
  ),
}));

vi.mock("../shared/api", () => ({
  api: { get, post, patch: vi.fn(), delete: vi.fn() },
  toman: (value) => `${value} تومان`,
}));

describe("admin CRUD forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.pendingPayment = false;
  });

  it("loads eligible users for existing employee creation", async () => {
    render(
      <MemoryRouter initialEntries={["/employees"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /افزودن کارمند/ }));
    fireEvent.click(screen.getByRole("button", { name: "حساب موجود" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("admin/employee-eligible-users/"),
    );
    expect(
      await screen.findByRole("option", { name: "Eligible User" }),
    ).toHaveValue("9");
  });

  it("allows an admin to confirm a pending employee payment report", async () => {
    mockState.pendingPayment = true;
    render(
      <MemoryRouter initialEntries={["/finance"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "جزئیات" }));
    fireEvent.click(screen.getByRole("button", { name: "تأیید گزارش" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("admin/payments/31/confirm/"),
    );
  });

  it("loads real service categories instead of placeholder options", async () => {
    render(
      <MemoryRouter initialEntries={["/services"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /افزودن سرویس/ }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("admin/service-categories/"),
    );
    expect(await screen.findByRole("option", { name: "Hair" })).toHaveValue(
      "4",
    );
    expect(screen.queryByText("گزینه اول")).not.toBeInTheDocument();
  });

  it("loads and creates gallery categories without leaving the gallery form", async () => {
    render(
      <MemoryRouter initialEntries={["/content"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /افزودن بخش محتوا/ }));

    expect(await screen.findByRole("option", { name: "مو" })).toHaveValue("5");
    fireEvent.change(screen.getByLabelText("نام دسته‌بندی جدید"), {
      target: { value: "ناخن" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "+ افزودن دسته‌بندی جدید" }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("admin/gallery-categories/", {
        name: "ناخن",
      }),
    );
    expect(await screen.findByRole("option", { name: "ناخن" })).toHaveValue(
      "6",
    );
    expect(screen.getByRole("combobox").value).toBe("6");
  });

  it("shows customer visit and spending summaries in the customer directory", async () => {
    render(<MemoryRouter initialEntries={["/customers"]}><AdminRouter /></MemoryRouter>);
    expect(await screen.findByText("مریم احمدی")).toBeInTheDocument();
    expect(screen.getByText("1500 تومان")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /مریم احمدی/ }));
    expect(screen.getAllByText("پرونده مشتری").length).toBeGreaterThan(1);
    expect(screen.getByDisplayValue("مشتری قدیمی")).toBeInTheDocument();
  });

  it("lets the admin review a pending leave request", async () => {
    render(<MemoryRouter initialEntries={["/leave-requests"]}><AdminRouter /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "بررسی" }));
    fireEvent.click(screen.getByRole("button", { name: "تأیید مرخصی" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("admin/time-off/61/approve/", { review_notes: "" }));
  });

  it("assigns selected available services when creating an employee", async () => {
    render(
      <MemoryRouter initialEntries={["/employees"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /افزودن کارمند/ }));
    const service = await screen.findByLabelText(/Cut/);
    fireEvent.click(service);
    fireEvent.click(screen.getByRole("button", { name: "ایجاد کارمند" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "admin/employees/",
        expect.any(FormData),
      ),
    );
    expect(post.mock.calls[0][1].getAll("services")).toEqual(["3"]);
  });

  it("loads backend-filtered appointments and real customer options for a new appointment", async () => {
    render(
      <MemoryRouter initialEntries={["/appointments"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        expect.stringMatching(/^admin\/appointments\/\?start_date=/),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "فیلترها" }));
    fireEvent.change(screen.getByLabelText("فیلتر سرویس"), {
      target: { value: "3" },
    });
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(expect.stringMatching(/service=3/)),
    );
    fireEvent.click(screen.getByRole("button", { name: /افزودن نوبت/ }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("admin/customer-options/"),
    );
    expect(await screen.findByRole("option", { name: "Customer" })).toHaveValue(
      "2",
    );
  });

  it("keeps today selected, shows real day badges, and syncs another selected day", async () => {
    render(
      <MemoryRouter initialEntries={["/appointments"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    const current = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    const todayCell = await screen.findByRole("button", { name: current });
    expect(todayCell).toHaveClass("today", "selected");
    expect(screen.getByText("۱ نوبت")).toBeInTheDocument();
    const otherCell = screen
      .getAllByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ })
      .find((cell) => cell.getAttribute("aria-label") !== current);
    fireEvent.click(otherCell);
    expect(
      await screen.findByText("برای این روز نوبتی ثبت نشده است"),
    ).toBeInTheDocument();
  });

  it("loads another month with one range request and returns to today", async () => {
    render(
      <MemoryRouter initialEntries={["/appointments"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "ماه بعد" });
    const callsBefore = get.mock.calls.filter(([endpoint]) =>
      endpoint.startsWith("admin/appointments/?"),
    ).length;
    fireEvent.click(screen.getByRole("button", { name: "ماه بعد" }));
    await waitFor(() =>
      expect(
        get.mock.calls.filter(([endpoint]) =>
          endpoint.startsWith("admin/appointments/?"),
        ).length,
      ).toBeGreaterThan(callsBefore),
    );
    fireEvent.click(screen.getByRole("button", { name: "امروز" }));
    const current = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    expect(await screen.findByRole("button", { name: current })).toHaveClass(
      "selected",
    );
  });

  it("marks one seven-day mobile week and navigates it independently", async () => {
    render(
      <MemoryRouter initialEntries={["/appointments"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    const current = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    await screen.findByRole("button", { name: current });
    const initialWeek = screen
      .getAllByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ })
      .filter((cell) => cell.classList.contains("current-week"));
    expect(initialWeek).toHaveLength(7);
    const initialWeekDates = initialWeek.map((cell) => cell.getAttribute("aria-label"));

    fireEvent.click(screen.getByRole("button", { name: "هفته بعد" }));
    await waitFor(() => {
      const nextWeek = screen
        .getAllByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ })
        .filter((cell) => cell.classList.contains("current-week"));
      expect(nextWeek).toHaveLength(7);
      expect(nextWeek.map((cell) => cell.getAttribute("aria-label"))).not.toEqual(
        initialWeekDates,
      );
    });
    const nextWeek = screen
      .getAllByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ })
      .filter((cell) => cell.classList.contains("current-week"));
    expect(nextWeek).toHaveLength(7);
    expect(nextWeek.some((cell) => cell.classList.contains("selected"))).toBe(
      true,
    );
  });

  it("uses real dashboard statistics and net payment revenue", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith("admin/statistics/"));
    expect(await screen.findAllByText("700 تومان")).not.toHaveLength(0);
    expect(screen.getByText("پرداخت منهای بازپرداخت")).toBeInTheDocument();
  });

  it("shows immutable payment and commission history with refunds inside payment details", async () => {
    render(
      <MemoryRouter initialEntries={["/finance"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    expect(await screen.findByText("پرداخت‌ها")).toBeInTheDocument();
    expect(screen.getByText("آخرین تراکنش‌ها")).toBeInTheDocument();
    expect(screen.getByText("آخرین کمیسیون‌ها")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "جزئیات" }));
    expect(screen.getByText("بازپرداخت‌های ثبت‌شده")).toBeInTheDocument();
    expect(await screen.findAllByText("800 تومان")).not.toHaveLength(0);
  });

  it("switches finance grouping and metric and opens employee finance details", async () => {
    render(
      <MemoryRouter initialEntries={["/finance"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    await screen.findByText("سهم سرویس‌های پردرآمد");
    fireEvent.click(screen.getAllByRole("button", { name: "هفتگی" })[0]);
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(/admin\/revenue\/\?period=custom&group_by=weekly/)));
    fireEvent.change(screen.getAllByLabelText("شاخص")[0], { target: { value: "payments" } });
    expect(screen.getByRole("heading", { name: "تعداد پرداخت‌ها" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Stylist.*800 تومان/ }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(/^admin\/employees\/2\/finance\//)));
    expect(await screen.findByText("گزارش مالی متخصص")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "تراکنش‌ها" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "سرویس‌های انجام‌شده" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "هفتگی" }).at(-1));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(/^admin\/employees\/2\/finance\/.*group_by=weekly$/)));
    fireEvent.click(screen.getAllByRole("button", { name: "ماه قبل" }).at(-1));
    await waitFor(() => expect(get.mock.calls.filter(([endpoint]) => endpoint.startsWith("admin/employees/2/finance/")).length).toBeGreaterThan(2));
  });
});
