import TextSizeControl from "./TextSizeControl";
import { useTheme } from "../shared/theme";
import "./TextSizeControl.css";

export default function PanelPreferences() {
  const { theme, setTheme } = useTheme();
  return <section className="panel-preferences-card" aria-labelledby="panel-display-preferences">
    <div>
      <span className="panel-preferences-kicker">نمایش پنل</span>
      <h2 id="panel-display-preferences">خوانایی و ظاهر</h2>
      <p>این انتخاب‌ها فقط نحوه نمایش پنل را تغییر می‌دهند.</p>
    </div>
    <div className="panel-preferences-controls">
      <fieldset className="theme-choice-control">
        <legend>حالت نمایش</legend>
        <div>
          {[["light", "روشن", "☀"], ["dark", "تیره", "☾"]].map(([value, label, icon]) => <label key={value}><input type="radio" name="panel-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} /><span aria-hidden="true">{icon}</span>{label}</label>)}
        </div>
      </fieldset>
      <TextSizeControl />
    </div>
  </section>;
}
