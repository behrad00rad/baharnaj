import { useId } from "react";
import { useTheme } from "../shared/theme";
import "./TextSizeControl.css";

export default function TextSizeControl() {
  const { textSize, setTextSize } = useTheme();
  const name = useId();
  return <fieldset className="text-size-control">
    <legend>اندازه متن</legend>
    <div className="text-size-options">
      {[["compact", "کوچک"], ["normal", "معمولی"], ["large", "بزرگ"]].map(([value, label]) =>
        <label key={value}>
          <input type="radio" name={name} value={value} checked={textSize === value} onChange={() => setTextSize(value)} />
          <span>{label}</span>
        </label>
      )}
    </div>
  </fieldset>;
}
