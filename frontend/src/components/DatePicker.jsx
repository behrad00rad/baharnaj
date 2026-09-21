import { useFocusScope } from "../shared/useFocusScope";
import { useEffect, useMemo, useRef, useState } from "react";
import { toGregorian, toJalaali } from "jalaali-js";
import { pad } from "../shared/date";
import { api } from "../shared/api";
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

const persianMonths = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const weekdayNames = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const isoFromUtcDate = (value) => `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
const shiftJalaliMonth = ({ jy, jm }, amount) => {
  const total = jy * 12 + jm - 1 + amount;
  return { jy: Math.floor(total / 12), jm: ((total % 12) + 12) % 12 + 1 };
};

function AvailabilityCalendar({ value, items, onChange }) {
  const initial = jalaliFor(value || today());
  const [month, setMonth] = useState({ jy: initial.jy, jm: initial.jm });
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const days = useMemo(() => {
    const firstGregorian = toGregorian(month.jy, month.jm, 1);
    const first = new Date(Date.UTC(firstGregorian.gy, firstGregorian.gm - 1, firstGregorian.gd));
    const offset = (first.getUTCDay() + 1) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const current = new Date(first);
      current.setUTCDate(first.getUTCDate() + index - offset);
      const iso = isoFromUtcDate(current);
      const jalali = toJalaali(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate());
      return { iso, jalali, currentMonth: jalali.jy === month.jy && jalali.jm === month.jm };
    });
  }, [month]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const query = encodeURIComponent(JSON.stringify(items));
    api.get(`availability/calendar/?start=${days[0].iso}&end=${days[days.length - 1].iso}&items=${query}`)
      .then(({ data }) => {
        if (active) setAvailability(Object.fromEntries((data.dates || []).map((item) => [item.date, item])));
      })
      .catch(() => {
        if (active) {
          setAvailability({});
          setError("دریافت وضعیت روزها انجام نشد. دوباره تلاش کنید.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, items]);
  const goToToday = () => {
    const current = jalaliFor(today());
    setMonth({ jy: current.jy, jm: current.jm });
  };
  return <div className="availability-calendar">
    <div className="availability-calendar-nav">
      <button type="button" onClick={() => setMonth((current) => shiftJalaliMonth(current, -1))} aria-label="ماه قبل">→</button>
      <strong>{persianMonths[month.jm - 1]} {new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(month.jy)}</strong>
      <button type="button" onClick={() => setMonth((current) => shiftJalaliMonth(current, 1))} aria-label="ماه بعد">←</button>
      <button type="button" className="calendar-today" onClick={goToToday}>امروز</button>
    </div>
    <div className="availability-weekdays">{weekdayNames.map((name) => <span key={name}>{name}</span>)}</div>
    <div className={`availability-days ${loading ? "loading" : ""}`} aria-busy={loading}>
      {days.map((day) => {
        const info = availability[day.iso];
        const dayStatus = info?.status || (loading ? "loading" : "unavailable");
        const selectable = day.currentMonth && dayStatus === "available";
        const statusLabel = { available: `${new Intl.NumberFormat("fa-IR").format(info?.slots_count || 0)} وقت`, full: "پر", holiday: "تعطیل", unavailable: "بسته", past: "گذشته" }[dayStatus];
        return <button
          type="button"
          key={day.iso}
          className={`${dayStatus} ${day.currentMonth ? "" : "outside"} ${value === day.iso ? "selected" : ""}`}
          disabled={!selectable}
          onClick={() => onChange(day.iso)}
          title={info?.reason || statusLabel || ""}
          aria-label={`${new Intl.NumberFormat("fa-IR").format(day.jalali.jd)} ${persianMonths[day.jalali.jm - 1]}، ${statusLabel || "در حال بررسی"}${info?.reason ? `، ${info.reason}` : ""}`}
        >
          <b>{new Intl.NumberFormat("fa-IR").format(day.jalali.jd)}</b>
          {day.currentMonth && statusLabel && <small>{statusLabel}</small>}
        </button>;
      })}
    </div>
    <div className="availability-legend"><span className="available">آزاد</span><span className="full">تکمیل ظرفیت</span><span className="holiday">تعطیل</span><span className="unavailable">بدون برنامه</span></div>
    {error && <p className="error availability-calendar-error">{error}</p>}
  </div>;
}

export function DateModal({ value, onChange, onClose, availabilityItems }) {
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
        {availabilityItems?.length ? <AvailabilityCalendar value={value} items={availabilityItems} onChange={(date) => { onChange(date); onClose(); }} /> : <JalaliDatePicker value={value} onChange={(date) => { onChange(date); onClose(); }} />}
      </div>
    </div>
  );
}
