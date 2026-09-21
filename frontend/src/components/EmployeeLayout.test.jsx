import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../shared/theme";
import EmployeeLayout from "./EmployeeLayout";

vi.mock("../shared/auth", () => ({ useAuth: () => ({ role: "employee" }) }));
vi.mock("./NotificationBell", () => ({ default: () => <button aria-label="اعلان‌ها" /> }));

describe("employee workspace layout", () => {
  it("provides the redesigned navigation and a visible route back to the site", () => {
    render(
      <MemoryRouter initialEntries={["/employee"]}>
        <ThemeProvider>
          <Routes>
            <Route path="/employee" element={<EmployeeLayout />}>
              <Route index element={<p>روز کاری</p>} />
            </Route>
            <Route path="/staff/login" element={<p>ورود کارکنان</p>} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("منوی پنل متخصص")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "بازگشت به سایت" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "خروج" })).not.toBeInTheDocument();
  });
});
