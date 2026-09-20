import { useState } from "react";

export default function PasswordInput({ visibilityLabel = "رمز عبور", ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-input-wrap">
    <input {...props} type={visible ? "text" : "password"} />
    <button
      type="button"
      className="password-visibility"
      onClick={() => setVisible((value) => !value)}
      aria-label={visible ? "مخفی کردن مقدار" : "نمایش مقدار"}
      title={visibilityLabel}
      aria-pressed={visible}
    >{visible ? "مخفی" : "نمایش"}</button>
  </div>;
}
