import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../shared/theme";
import EmployeeLayout from "./EmployeeLayout";

const { logoutSession, disableCurrentFirebaseDevice } = vi.hoisted(() => ({
  logoutSession: vi.fn(() => Promise.resolve()),
  disableCurrentFirebaseDevice: vi.fn(() => Promise.resolve()),
}));

vi.mock("../shared/auth", () => ({ useAuth: () => ({ role: "employee" }) }));
vi.mock("../shared/api", () => ({ logoutSession }));
vi.mock("../shared/firebasePush", () => ({ disableCurrentFirebaseDevice }));
vi.mock("./NotificationBell", () => ({ default: () => <button aria-label="اعلان‌ها" /> }));

describe("employee workspace layout", () => {
  it("provides the redesigned navigation and a header logout action", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "خروج" }));
    await waitFor(() => expect(logoutSession).toHaveBeenCalled());
    expect(screen.getByText("ورود کارکنان")).toBeInTheDocument();
  });
});
