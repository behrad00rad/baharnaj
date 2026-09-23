import { useEffect, useState } from "react";
import { api } from "../shared/api";
import "./ReorderList.css";

export default function ReorderList({ items, endpoint, categoryId, onDone }) {
  const [draft, setDraft] = useState(() => [...items]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changed = draft.some((item, index) => item.id !== items[index]?.id);
  useEffect(() => {
    if (!changed) return undefined;
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ""; };
    const guardNavigation = (event) => {
      const link = event.target.closest?.("a[href]");
      if (link && !window.confirm("تغییرات ترتیب ذخیره نشده‌اند. از این صفحه خارج می‌شوید؟")) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardNavigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardNavigation, true); };
  }, [changed]);
  const move = (from, to) => {
    if (to < 0 || to >= draft.length || from === to) return;
    setDraft((current) => { const next = [...current]; next.splice(to, 0, next.splice(from, 1)[0]); return next; });
  };
  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.post(endpoint, { ...(categoryId ? { category_id: categoryId } : {}), items: draft.map((item, display_order) => ({ id: item.id, display_order })) });
      onDone(true);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "ذخیره ترتیب انجام نشد. دوباره تلاش کنید یا انصراف دهید.");
    } finally { setSaving(false); }
  };
  return <div className="reorder-mode">
    <p>برای تغییر ترتیب، دستگیره را بکشید یا از دکمه‌های بالا و پایین استفاده کنید.</p>
    <ol className="reorder-list">{draft.map((item, index) => <li key={item.id} draggable={!saving} onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); move(Number(event.dataTransfer.getData("text/plain")), index); }}>
      <span className="reorder-handle" aria-hidden="true">⠿</span><strong>{item.persian_name || item.name}</strong>{item.category_name && <small>{item.category_name}</small>}
      <span className="reorder-controls"><button type="button" disabled={saving || index === 0} onClick={() => move(index, index - 1)} aria-label={`بالا بردن ${item.persian_name || item.name}`}>بالا</button><button type="button" disabled={saving || index === draft.length - 1} onClick={() => move(index, index + 1)} aria-label={`پایین بردن ${item.persian_name || item.name}`}>پایین</button></span>
    </li>)}</ol>
    {error && <p role="alert" className="admin-field-error">{error}</p>}
    <div className="reorder-actions"><button type="button" className="admin-primary" disabled={saving || !changed} onClick={save}>{saving ? "در حال ذخیره…" : "ذخیره ترتیب"}</button><button type="button" className="admin-secondary" disabled={saving} onClick={() => onDone(false)}>انصراف</button></div>
  </div>;
}
