import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AdminLayout from "./AdminLayout";
import { ThemeProvider } from "../shared/theme";

vi.mock("../shared/auth", () => ({
  useAuth: () => ({ role: "admin" }),
}));
vi.mock("../shared/api", () => ({ clearSession: vi.fn() }));
vi.mock("../shared/firebasePush", () => ({
  disableCurrentFirebaseDevice: vi.fn(() => Promise.resolve()),
}));
vi.mock("./NotificationBell", () => ({
  default: () => <button aria-label="اعلان‌ها" />,
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <ThemeProvider>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<p>نمای کلی پنل</p>} />
          </Route>
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("admin mobile navigation", () => {
  it("opens and closes the menu from the mobile top bar", () => {
    renderLayout();
    const openButton = screen.getByRole("button", {
      name: "باز کردن منوی مدیریت",
    });
    const navigation = screen.getByLabelText("منوی مدیریت");

    expect(openButton).toHaveAttribute("aria-expanded", "false");
    expect(navigation).not.toHaveClass("admin-sidebar-open");
    fireEvent.click(openButton);
    expect(navigation).toHaveClass("admin-sidebar-open");
    expect(
      screen.getByRole("button", { name: "بستن منوی مدیریت", expanded: true }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "بستن منوی مدیریت" })[1]);
    expect(navigation).not.toHaveClass("admin-sidebar-open");
  });

  it("keeps website and logout actions accessible as icon controls", () => {
    renderLayout();
    expect(
      screen.getByRole("link", { name: "بازگشت به وب‌سایت" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "خروج از حساب" }),
    ).toBeInTheDocument();
  });
});
