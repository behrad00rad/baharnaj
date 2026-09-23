import "./BrowseToolbar.css";

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

export function ViewToggle({ mode, onMode }) {
  if (!onMode) return null;
  return <div className="browse-view" role="group" aria-label="شیوه نمایش">
    <button type="button" aria-label="تصویری" title="نمایش تصویری" aria-pressed={mode === "visual"} onClick={() => onMode("visual")}>
      <svg aria-hidden="true" viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="6" height="6" /><rect x="11.5" y="2.5" width="6" height="6" /><rect x="2.5" y="11.5" width="6" height="6" /><rect x="11.5" y="11.5" width="6" height="6" /></svg>
    </button>
    <button type="button" aria-label="فشرده" title="نمایش فشرده" aria-pressed={mode === "compact"} onClick={() => onMode("compact")}>
      <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
    </button>
  </div>;
}

export default function BrowseToolbar({ search, onSearch, placeholder = "جست‌وجو…", categories = [], category, onCategory, count, mode, onMode, label = "فهرست", isolated = false }) {
  return <div className={`browse-toolbar${isolated ? " browse-toolbar-isolated" : ""}`} role="group" aria-label={`ابزار ${label}`}>
    <div className="browse-toolbar-main">
      <label className="browse-search"><span className="browse-search-icon"><SearchIcon /></span><span className="sr-only">{placeholder}</span><input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>
      {search && <button type="button" className="browse-clear" aria-label="پاک کردن جست‌وجو" onClick={() => onSearch("")}>×</button>}
      <ViewToggle mode={mode} onMode={onMode} />
      <span className="browse-count" aria-live="polite">{new Intl.NumberFormat("fa-IR").format(count)} نتیجه</span>
    </div>
    {categories.length > 0 && <div className="browse-categories" role="group" aria-label="دسته‌بندی">{categories.map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => onCategory(item)}>{item}</button>)}</div>}
  </div>;
}
