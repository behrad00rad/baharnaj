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

export function JalaliDatePicker({ value, onChange }) {
  const input = useRef(null);
  const container = useRef(null);
  const minimum = today();
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
        data-jdp-min-date={toMinDate(minimum)}
        aria-label="تاریخ شمسی"
        value={toJalaliValue(value || minimum)}
        onInput={(event) => {
          const next = toIso(event.currentTarget.value);
          if (next >= minimum) onChange(next);
        }}
      />
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
