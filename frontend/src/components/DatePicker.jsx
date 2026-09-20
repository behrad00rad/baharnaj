import { useFocusScope } from "../shared/useFocusScope";
import { useEffect, useRef } from "react";
import { toGregorian, toJalaali } from "jalaali-js";
import { pad } from "../shared/date";
import "@majidh1/jalalidatepicker/dist/jalalidatepicker.css";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(
    new Date(),
  );
const jalaliFor = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return toJalaali(year, month, day);
};
const toJalaliValue = (value) => {
  const { jy, jm, jd } = jalaliFor(value);
  return `${jy}/${pad(jm)}/${pad(jd)}`;
};
const toIso = (value) => {
  const [year, month, day] = value.split("/").map(Number);
  if (!year || !month || !day) return "";
  const gregorian = toGregorian(year, month, day);
  return `${gregorian.gy}-${pad(gregorian.gm)}-${pad(gregorian.gd)}`;
};
const toMinDate = (value) => toJalaliValue(value);

export function JalaliDatePicker({ value, onChange, minDate = today(), allowEmpty = false }) {
  const input = useRef(null);
  const container = useRef(null);
  useEffect(() => {
    let active = true;
    import("@majidh1/jalalidatepicker").then(() => {
      // The library has a delayed show animation. Keep its overlay inside this
      // component so a late callback cannot cover the page after the modal closes.
      if (active) window.jalaliDatepicker?.startWatch({ minDate: "attr", container: container.current });
    });
    return () => {
      active = false;
      window.jalaliDatepicker?.hide();
    };
  }, []);

  return (
    <div className="jalali-picker" ref={container}>
      <input
        ref={input}
        data-jdp
        data-jdp-min-date={minDate ? toMinDate(minDate) : undefined}
        aria-label="تاریخ شمسی"
        placeholder={allowEmpty ? "انتخاب تاریخ شمسی" : undefined}
        value={value ? toJalaliValue(value) : allowEmpty ? "" : toJalaliValue(minDate || today())}
        onInput={(event) => {
          if (allowEmpty && !event.currentTarget.value) {
            onChange("");
            return;
          }
          const next = toIso(event.currentTarget.value);
          if (next && (!minDate || next >= minDate)) onChange(next);
        }}
      />
    </div>
  );
}

const tehranParts = (value) => {
  if (!value) return { date: "", time: "09:00" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

export function JalaliDateTimePicker({ value, onChange, optional = true }) {
  const parts = tehranParts(value);
  const emit = (date, time) => {
    if (!date) return;
    onChange(`${date}T${time || "09:00"}:00+03:30`);
  };
  return (
    <div className="jalali-datetime-picker">
      <JalaliDatePicker
        value={parts.date}
        onChange={(date) => emit(date, parts.time)}
        allowEmpty={optional}
      />
      <input
        type="time"
        aria-label="ساعت به وقت تهران"
        value={parts.time}
        onChange={(event) => emit(parts.date || today(), event.target.value)}
      />
      {optional && value && (
        <button type="button" className="jalali-date-clear" onClick={() => onChange(null)}>
          پاک‌کردن
        </button>
      )}
    </div>
  );
}

export function DateModal({ value, onChange, onClose }) {
  const dialogRef = useRef(null);
  useFocusScope(true, dialogRef, onClose);
  useEffect(() => () => window.jalaliDatepicker?.hide(), []);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="date-modal"
        role="dialog"
        aria-modal="true"
        aria-label="انتخاب تاریخ"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <strong>انتخاب تاریخ</strong>
          <button type="button" onClick={onClose} aria-label="بستن">
            ×
          </button>
        </div>
        <JalaliDatePicker
          value={value}
          onChange={(date) => {
            onChange(date);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
