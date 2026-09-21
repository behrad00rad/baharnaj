import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateModal, JalaliDatePicker, JalaliDateTimePicker } from "./DatePicker";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../shared/api", () => ({ api: { get } }));

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

  it("shows full and holiday days and only selects an available date", async () => {
    get.mockResolvedValueOnce({ data: { dates: [
      { date: "2026-09-21", status: "available", slots_count: 4 },
      { date: "2026-09-22", status: "holiday", slots_count: 0, reason: "تعطیلات رسمی" },
      { date: "2026-09-23", status: "full", slots_count: 0 },
    ] } });
    const onChange = vi.fn();
    render(<DateModal value="2026-09-21" availabilityItems={[{ service: 1, employee: 2 }]} onChange={onChange} onClose={vi.fn()} />);

    const holiday = await screen.findByRole("button", { name: /تعطیل.*تعطیلات رسمی/ });
    const full = screen.getByRole("button", { name: /پر/ });
    expect(holiday).toBeDisabled();
    expect(full).toBeDisabled();
    const available = screen.getByRole("button", { name: /۴ وقت/ });
    fireEvent.click(available);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("2026-09-21"));
  });
});
