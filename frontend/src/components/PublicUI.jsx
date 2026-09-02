import { useState } from "react";
import { Link } from "react-router-dom";

export function ArrowLink({ to, children, className = "" }) {
  return (
    <Link className={`text-link ${className}`.trim()} to={to}>
      {children}
      <span aria-hidden="true">←</span>
    </Link>
  );
}

export function SectionHeader({ eyebrow, title, text, action }) {
  return (
    <header className="section-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {text && <p>{text}</p>}
      {action}
    </header>
  );
}

export function MediaImage({ src, alt, className = "", eager = false }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div
        className={`media-fallback ${className}`.trim()}
        role="img"
        aria-label={alt}
      >
        <span>بَ</span>
      </div>
    );
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function PublicState({
  state,
  empty,
  error = "دریافت اطلاعات ممکن نیست. لطفاً دوباره تلاش کنید.",
}) {
  if (state === "loading")
    return (
      <div className="public-state" aria-live="polite">
        <span className="state-mark" />
        در حال دریافت اطلاعات…
      </div>
    );
  if (state === "error")
    return <div className="public-state public-state-error">{error}</div>;
  return <div className="public-state">{empty}</div>;
}

export function EmployeeCard({ employee }) {
  const name = employee.name?.trim() || "متخصص بهارناژ";
  return (
    <article className="employee-card">
      <div className="employee-card-media">
        <MediaImage src={employee.profile_photo_url} alt={`تصویر ${name}`} />
      </div>
      <div className="employee-card-copy">
        <span>۰{String(employee.id).slice(-1)}</span>
        <div>
          <h3>{name}</h3>
          {employee.specialty && <p>{employee.specialty}</p>}
        </div>
      </div>
    </article>
  );
}
