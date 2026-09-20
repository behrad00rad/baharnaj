import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerSignup, ForgotPassword } from "./AccountAuth";
import { clearSessionState, getRole } from "../shared/auth";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn() }));
vi.mock("../shared/api", () => ({ api: { get, post } }));

describe("customer account authentication", () => {
  beforeEach(() => { vi.clearAllMocks(); clearSessionState(); });

  it("registers a customer with normalized account inputs and starts a session", async () => {
    post.mockResolvedValue({ data: { access: "customer-access", role: "customer" } });
    render(<MemoryRouter><CustomerSignup /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("نام"), { target: { value: "مریم" } });
    fireEvent.change(screen.getByLabelText("نام خانوادگی"), { target: { value: "احمدی" } });
    fireEvent.change(screen.getByLabelText("شماره موبایل"), { target: { value: "09121234567" } });
    fireEvent.change(screen.getByLabelText("ایمیل بازیابی"), { target: { value: "maryam@example.com" } });
    fireEvent.change(screen.getByLabelText("رمز عبور"), { target: { value: "Strong-pass-8472" } });
    fireEvent.change(screen.getByLabelText("تکرار رمز عبور"), { target: { value: "Strong-pass-8472" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "ساخت حساب" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("auth/register/", expect.objectContaining({ phone: "09121234567", accept_terms: true })));
    expect(getRole()).toBe("customer");
  });

  it("requests password recovery without disclosing account existence", async () => {
    post.mockResolvedValue({ data: { detail: "اگر حسابی وجود داشته باشد، لینک ارسال می‌شود." } });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("ایمیل"), { target: { value: "customer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال لینک بازیابی" }));
    expect(await screen.findByRole("status")).toHaveTextContent("اگر حسابی وجود داشته باشد");
  });
});
