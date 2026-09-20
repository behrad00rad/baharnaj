import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JalaliDatePicker, JalaliDateTimePicker } from "./DatePicker";

describe("Jalali date controls", () => {
  it("shows and returns Jalali dates while keeping the API value Gregorian", () => {
    const onChange = vi.fn();
    render(
      <JalaliDatePicker
        value="2026-03-21"
        onChange={onChange}
        minDate=""
        allowEmpty
      />,
    );

    const input = screen.getByLabelText("تاریخ شمسی");
    expect(input).toHaveValue("1405/01/01");
    fireEvent.input(input, { target: { value: "1405/01/02" } });
    expect(onChange).toHaveBeenCalledWith("2026-03-22");
  });

  it("combines a Jalali-selected day with Tehran time without native datetime input", () => {
    const onChange = vi.fn();
    const { container } = render(
      <JalaliDateTimePicker value="2026-09-20T06:30:00Z" onChange={onChange} />,
    );

    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("ساعت به وقت تهران"), {
      target: { value: "11:15" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.stringMatching(/^2026-09-20T11:15:00\+03:30$/),
    );
  });
});
