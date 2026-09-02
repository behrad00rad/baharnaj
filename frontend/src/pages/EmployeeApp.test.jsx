import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EmployeeApp from "./EmployeeApp";
import { MemoryRouter } from "react-router-dom";

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: [] })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock("../shared/api", () => ({
  api: { get, post, patch },
  toman: (value) => `${value} تومان`,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
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
    expect(screen.queryByText("خدمات قابل ارائه")).not.toBeInTheDocument();
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
      expect(get).toHaveBeenCalledWith("employee/earnings/?period=day"),
    );
    fireEvent.click(screen.getByRole("button", { name: "هفتگی" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("employee/earnings/?period=week"),
    );
    fireEvent.click(screen.getByRole("button", { name: "ماهانه" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("employee/earnings/?period=month"),
    );
  });

  it("submits notes with completed work and shows backend failures", async () => {
    const current = new Date().toISOString().slice(0, 10);
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
    fireEvent.click(screen.getByRole("button", { name: "تکمیل نوبت" }));

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

  it("loads only the selected employee week range for the calendar", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(new Date());
    const nextDate = new Date(`${today}T12:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const tomorrow = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
    }).format(nextDate);
    const weekday = (date) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    get.mockImplementation((endpoint) => {
      if (endpoint === `employee/appointments/?date=${today}`)
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
    fireEvent.click(screen.getByRole("button", { name: "هفته" }));
    const weekStart = new Date(`${today}T12:00:00`);
    weekStart.setDate(weekStart.getDate() - weekday(today));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const format = (value) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(
        value,
      );
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        `employee/appointments/?start=${format(weekStart)}&end=${format(weekEnd)}`,
      ),
    );
  });
});
