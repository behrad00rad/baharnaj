import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EmployeeApp from "./EmployeeApp";
import { MemoryRouter } from "react-router-dom";
import { formatJalaliDate } from "../shared/date";

const { get, post, patch, logoutSession, disableCurrentFirebaseDevice, navigate } = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: [] })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
  logoutSession: vi.fn(() => Promise.resolve()),
  disableCurrentFirebaseDevice: vi.fn(() => Promise.resolve()),
  navigate: vi.fn(),
}));
vi.mock("../shared/api", () => ({
  api: { get, post, patch },
  logoutSession,
  toman: (value) => `${value} تومان`,
}));
vi.mock("../shared/firebasePush", () => ({ disableCurrentFirebaseDevice }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

describe("employee app", () => {
  it("renders explicit empty state on today view", async () => {
    render(
      <MemoryRouter>
        <EmployeeApp />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("نوبت بعدی ندارید")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("امروز نوبتی برای شما ثبت نشده است."),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("employee/statistics/");
  });

  it("shows the item selected as the next appointment", async () => {
    get.mockImplementation((endpoint) => {
      if (endpoint.startsWith("employee/appointments/?date="))
        return Promise.resolve({ data: [] });
      if (endpoint === "employee/statistics/")
        return Promise.resolve({
          data: {
            today_total: 1,
            completed_services: 0,
            remaining_services: 1,
            employee_commission: 0,
            next_appointment: {
              id: 1,
              customer_name: "مشتری بعدی",
              items: [{ service_name: "سرویس قبلی", start_time: "09:00" }],
            },
            next_appointment_item: {
              service_name: "سرویس بعدی",
              duration_snapshot: 60,
              start_time: "14:00",
            },
          },
        });
      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter>
        <EmployeeApp />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("سرویس بعدی · 60 دقیقه"),
    ).toBeInTheDocument();
    expect(screen.getByText("14:00")).toBeInTheDocument();
    expect(screen.queryByText("سرویس قبلی")).not.toBeInTheDocument();
  });

  it("renders calendar loading/empty state and employee action payload shape", async () => {
    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );
    expect(screen.getByText("تقویم")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("برای این روز نوبتی ندارید")).toBeInTheDocument(),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("moves the employee calendar forward by one week", async () => {
    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );
    await screen.findByText("برای این روز نوبتی ندارید");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
    const nextWeek = new Date(`${today}T12:00:00`);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekValue = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(nextWeek);

    fireEvent.click(screen.getByRole("button", { name: "هفته بعد" }));

    expect(screen.getByRole("button", { name: nextWeekValue })).toHaveClass("selected");
  });

  it("uses the employee schedule endpoint for weekly hours", async () => {
    render(
      <MemoryRouter initialEntries={["/availability"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith("employee/schedule/"));
    await waitFor(() => expect(screen.getAllByText("ذخیره")).toHaveLength(7));
    screen.getAllByText("ذخیره")[0].click();
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "employee/schedule/",
        expect.objectContaining({ weekday: 0 }),
      ),
    );
    expect(post.mock.calls[0][1]).not.toHaveProperty("employee");
  });

  it("preserves another day's edits when saving weekly hours and validates time order", async () => {
    get.mockImplementation(endpoint => Promise.resolve({ data: endpoint === "employee/schedule/" ? [
      { id: 71, weekday: 0, start_time: "09:00", end_time: "17:00", is_active: true },
    ] : [] }));
    patch.mockResolvedValue({ data: { id: 71 } });
    render(<MemoryRouter initialEntries={["/availability"]}><EmployeeApp /></MemoryRouter>);
    const first = await screen.findByLabelText("شروع دوشنبه");
    const other = screen.getByLabelText("شروع سه‌شنبه");
    fireEvent.change(other, { target: { value: "11:00" } });
    fireEvent.change(first, { target: { value: "18:00" } });
    const before = patch.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "ذخیره دوشنبه" }));
    expect(await screen.findByRole("status")).toHaveTextContent("ساعت پایان باید بعد از ساعت شروع باشد");
    expect(patch.mock.calls.length).toBe(before);
    fireEvent.change(first, { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره دوشنبه" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("ساعات کاری دوشنبه ذخیره شد"));
    expect(other).toHaveValue("11:00");
    expect(patch).toHaveBeenLastCalledWith("employee/schedule/71/", expect.objectContaining({ start_time: "10:00" }));
  });

  it("keeps availability administration out of the employee profile", async () => {
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText("مدیریت برنامه کاری")).toBeInTheDocument(),
    );
    expect(screen.queryByText("ساعات کاری من")).not.toBeInTheDocument();
    expect(screen.queryByText("تخصص")).not.toBeInTheDocument();
    expect(screen.queryByText("ثبت مرخصی")).not.toBeInTheDocument();
    expect(screen.queryByText("سرویس‌های قابل ارائه")).not.toBeInTheDocument();
  });

  it("uploads the selected profile photo as multipart form data", async () => {
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );
    const photo = new File(["image"], "profile.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("تصویر پروفایل"), {
      target: { files: [photo] },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "employee/profile/",
        expect.any(FormData),
      ),
    );
    expect(patch.mock.calls.at(-1)[1].get("profile_photo")).toBe(photo);
  });

  it("keeps logout in the profile danger area", async () => {
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "خروج از حساب" }));
    await waitFor(() => expect(disableCurrentFirebaseDevice).toHaveBeenCalled());
    expect(logoutSession).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/staff/login", { replace: true });
  });

  it("submits the employee password change form", async () => {
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText("رمز عبور فعلی"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("رمز عبور جدید"), {
      target: { value: "new-password-8472" },
    });
    fireEvent.change(screen.getByLabelText("تکرار رمز عبور جدید"), {
      target: { value: "new-password-8472" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تغییر رمز عبور" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "employee/password/",
        expect.objectContaining({
          current_password: "old-password",
          new_password: "new-password-8472",
        }),
      ),
    );
  });

  it("reloads finance data for the selected period", async () => {
    render(
      <MemoryRouter initialEntries={["/earnings"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        expect.stringMatching(/^employee\/earnings\/\?period=custom&start_date=.*&end_date=.*&group_by=daily$/),
      ),
    );
    const current = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
    fireEvent.click(screen.getByRole("button", { name: "امروز" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining(`start_date=${current}&end_date=${current}`)));
    fireEvent.click(screen.getByRole("button", { name: "هفتگی" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(expect.stringMatching(/group_by=weekly$/)),
    );
    fireEvent.click(screen.getByRole("button", { name: "ماهانه" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(expect.stringMatching(/group_by=monthly$/)),
    );
    fireEvent.change(screen.getByLabelText("شاخص"), { target: { value: "revenue" } });
    expect(screen.getByRole("heading", { name: "درآمد ایجادشده" })).toBeInTheDocument();
  });

  it("submits notes with completed work and shows backend failures", async () => {
    const current = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    get.mockImplementation((endpoint) => {
      if (endpoint === "employee/earnings/?period=day")
        return Promise.resolve({
          data: { completed_services: 0, employee_commission: 0, items: [] },
        });
      if (endpoint === `employee/appointments/?date=${current}`)
        return Promise.resolve({
          data: [
            {
              id: 1,
              customer_name: "مشتری",
              items: [
                {
                  id: 12,
                  date: current,
                  start_time: "23:59",
                  end_time: "23:59",
                  service_name: "کوتاهی",
                  notes: "",
                },
              ],
            },
          ],
        });
      if (endpoint === "employee/statistics/")
        return Promise.resolve({
          data: {
            today_total: 1,
            completed_services: 0,
            remaining_services: 1,
            employee_commission: 0,
            next_appointment: null,
          },
        });
      return Promise.resolve({ data: [] });
    });
    post.mockRejectedValueOnce({
      response: { data: { detail: "ثبت وضعیت ممکن نیست" } },
    });
    render(
      <MemoryRouter>
        <EmployeeApp />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /مشتری.*کوتاهی/ }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "یادداشت‌ها و محصولات مصرف‌شده را ثبت کنید...",
      ),
      { target: { value: "کار تکمیل شد" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "تکمیل سرویس" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "employee/appointment-items/12/action/",
        expect.objectContaining({ status: "complete", notes: "کار تکمیل شد" }),
      ),
    );
    expect(await screen.findByText("ثبت وضعیت ممکن نیست")).toBeInTheDocument();
  });

  it("reports a payment only from the opened assigned appointment", async () => {
    const current = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    get.mockImplementation((endpoint) => {
      if (endpoint === `employee/appointments/?date=${current}`)
        return Promise.resolve({
          data: [
            {
              id: 1,
              customer_name: "مشتری",
              items: [
                {
                  id: 12,
                  date: current,
                  start_time: "10:00",
                  end_time: "11:00",
                  service_name: "کوتاهی",
                },
              ],
            },
          ],
        });
      if (endpoint === "employee/statistics/")
        return Promise.resolve({
          data: {
            today_total: 1,
            completed_services: 0,
            remaining_services: 1,
            employee_commission: 0,
            next_appointment: null,
          },
        });
      if (endpoint === "employee/appointments/1/payments/")
        return Promise.resolve({
          data: { paid_total: 200, remaining_total: 600, payments: [] },
        });
      return Promise.resolve({ data: [] });
    });
    render(
      <MemoryRouter>
        <EmployeeApp />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /مشتری.*کوتاهی/ }),
    );
    fireEvent.change(await screen.findByLabelText("مبلغ"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ثبت پرداخت" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("employee/appointments/1/payments/", {
        amount: 500,
        payment_method: "cash",
        notes: "",
      }),
    );
  });

  it("creates a self appointment without an employee selector or employee payload", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    get.mockImplementation((endpoint) => {
      if (endpoint === "employee/services/")
        return Promise.resolve({
          data: [{ id: 5, persian_name: "کوتاهی", duration: 60 }],
        });
      if (endpoint === "employee/profile/")
        return Promise.resolve({ data: { id: 8 } });
      if (endpoint.startsWith(`availability/?date=${today}`))
        return Promise.resolve({ data: { slots: ["10:00"] } });
      return Promise.resolve({ data: [] });
    });
    render(
      <MemoryRouter initialEntries={["/appointments/new"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("نام مشتری جدید"), {
      target: { value: "مشتری جدید" },
    });
    fireEvent.change(screen.getByLabelText("شماره تماس"), {
      target: { value: "09121234567" },
    });
    fireEvent.click(screen.getByLabelText(/کوتاهی/));
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "ثبت نوبت" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "employee/appointments/create/",
        expect.objectContaining({ services: [5], start_time: "10:00" }),
      ),
    );
    expect(post.mock.calls.at(-1)[1]).not.toHaveProperty("employee");
    expect(screen.queryByText("متخصص")).not.toBeInTheDocument();
  });

  it("loads the employee month calendar and keeps dates selectable", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    get.mockImplementation((endpoint) => {
      if (endpoint.startsWith("employee/appointments/?start="))
        return Promise.resolve({
          data: [
            {
              id: 1,
              customer_name: "مشتری امروز",
              status: "confirmed",
              items: [
                {
                  date: today,
                  start_time: "09:00",
                  end_time: "10:00",
                  service_name: "کوتاهی",
                },
              ],
            },
          ],
        });
      return Promise.resolve({ data: [] });
    });
    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <EmployeeApp />
      </MemoryRouter>,
    );

    expect(await screen.findByText("مشتری امروز")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: today })).toHaveClass("selected");
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/^employee\/appointments\/\?start=\d{4}-\d{2}-\d{2}&end=\d{4}-\d{2}-\d{2}$/));
    expect(screen.getByRole("button", { name: "ماه قبل" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ماه بعد" })).toBeVisible();
  });

  it("shows a compact dated appointment dialog and submits cancellation reason", async () => {
    const current = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
    post.mockResolvedValue({ data: {} });
    get.mockImplementation((endpoint) => {
      if (endpoint === `employee/appointments/?date=${current}`) return Promise.resolve({ data: [{ id: 8, customer_name: "مشتری لغو", customer_phone: "09120000000", status: "confirmed", items: [{ id: 44, date: current, start_time: "10:00", end_time: "11:00", service_name: "رنگ مو", completion_status: "scheduled" }] }] });
      if (endpoint === "employee/statistics/") return Promise.resolve({ data: { today_total: 1, completed_services: 0, remaining_services: 1, next_appointment: null } });
      return Promise.resolve({ data: [] });
    });
    render(<MemoryRouter><EmployeeApp /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /مشتری لغو.*رنگ مو/ }));
    const dialog = screen.getByRole("dialog", { name: "مشتری لغو" });
    expect(dialog).toHaveTextContent(formatJalaliDate(current));
    expect(screen.getByRole("button", { name: "بستن جزئیات نوبت" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "لغو سرویس" }));
    fireEvent.change(screen.getByLabelText("دلیل لغو"), { target: { value: "عدم امکان حضور" } });
    fireEvent.click(screen.getByRole("button", { name: "تأیید لغو" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("employee/appointment-items/44/action/", expect.objectContaining({ status: "cancel", reason: "عدم امکان حضور" })));
  });
});
