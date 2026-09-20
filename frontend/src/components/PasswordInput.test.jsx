import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PasswordInput from "./PasswordInput";

describe("PasswordInput", () => {
  it("reveals and hides the password without changing its value", () => {
    render(<PasswordInput visibilityLabel="رمز آزمایشی" defaultValue="secret" />);

    const input = screen.getByDisplayValue("secret");
    const reveal = screen.getByRole("button", { name: "نمایش مقدار" });
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(reveal);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "مخفی کردن مقدار" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "مخفی کردن مقدار" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("secret");
  });
});
